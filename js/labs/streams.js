/* DDIA Visual Guide — Stream windows lab (chapter 11).
 * A stream of page views is counted per minute. Most events arrive within a couple of seconds; some
 * straggle in much later. Windowing by arrival time puts stragglers in the wrong minute; windowing by
 * event time needs to decide how long to wait for them (a watermark), and what to do with events that
 * miss even that: drop them, or publish a correction. The model is pure; the view replays it. */
(function () {
  'use strict';
  const DDIA = (window.DDIA = window.DDIA || {});

  /* ---------- model ---------- */
  const EVENTS = 100;
  const MINUTES = 4;                 // windows [0,60) … [180,240) seconds of event time
  const WAITS = [0, 30, 120];        // seconds a window stays open after it ends
  const DELAY_LABEL = { none: 'About a second', some: 'Some stragglers', offline: 'Offline phones' };
  const TIME_LABEL = { processing: 'Arrival time', event: 'Event time' };
  const r1 = (x) => Math.round(x * 10) / 10;

  // how late one event reaches the stream processor, in seconds
  function delayOf(kind, rng) {
    const uni = (a, b) => a + (b - a) * rng.next();
    if (kind === 'none') return uni(0, 1);
    if (rng.chance(0.85)) return uni(0, 2);
    return kind === 'some' ? uni(20, 90) : uni(150, 300); // a straggler, or a phone that was offline for minutes
  }

  function run(cfg, seed) {
    const rng = DDIA.sim.rng(seed);
    const events = [];
    for (let i = 0; i < EVENTS; i++) {
      const at = Math.min(MINUTES * 60 - 0.1, r1(rng.next() * MINUTES * 60)); // rounding must not push it into a fifth minute
      events.push({ i, at, arrives: r1(at + delayOf(cfg.delays, rng)) });
    }
    events.sort((a, b) => a.arrives - b.arrives);
    const truth = Array(MINUTES).fill(0);
    events.forEach((e) => { truth[Math.floor(e.at / 60)]++; });

    const trace = [];
    const shown = Array(MINUTES).fill(0);      // the count each window last published
    const emitted = Array(MINUTES).fill(null); // when each window first published
    let dropped = 0;
    let corrections = 0;
    if (cfg.time === 'processing') {
      // a window counts whatever arrives during its minute of arrival time, then publishes at the minute's end
      events.forEach((e) => {
        const m = Math.floor(e.arrives / 60);
        const into = m < MINUTES ? m : null; // arrived after the last window closed: counted nowhere
        if (into != null) shown[into]++;
        trace.push({ type: 'event', i: e.i, at: e.at, arrives: e.arrives, into, fate: into == null ? 'missed' : into === Math.floor(e.at / 60) ? 'ok' : 'moved' });
      });
      for (let m = 0; m < MINUTES; m++) { emitted[m] = (m + 1) * 60; trace.push({ type: 'emit', t: emitted[m], m, count: shown[m], truth: truth[m] }); }
    } else {
      // a window counts events by their own timestamp and publishes once it has waited `wait` seconds past its end
      const closes = (m) => (m + 1) * 60 + cfg.wait;
      const open = Array(MINUTES).fill(true);
      const flush = (upTo) => {
        for (let m = 0; m < MINUTES; m++) {
          if (open[m] && closes(m) <= upTo) {
            open[m] = false;
            emitted[m] = closes(m);
            trace.push({ type: 'emit', t: closes(m), m, count: shown[m], truth: truth[m] });
          }
        }
      };
      events.forEach((e) => {
        flush(e.arrives);
        const m = Math.floor(e.at / 60);
        if (open[m]) { shown[m]++; trace.push({ type: 'event', i: e.i, at: e.at, arrives: e.arrives, into: m, fate: 'ok' }); return; }
        if (cfg.late === 'correct') {
          shown[m]++;
          corrections++;
          trace.push({ type: 'event', i: e.i, at: e.at, arrives: e.arrives, into: m, fate: 'late' });
          trace.push({ type: 'emit', t: e.arrives, m, count: shown[m], truth: truth[m], correction: true });
        } else {
          dropped++;
          trace.push({ type: 'event', i: e.i, at: e.at, arrives: e.arrives, into: null, fate: 'dropped' });
        }
      });
      flush(Infinity);
    }
    trace.sort((a, b) => (a.arrives ?? a.t) - (b.arrives ?? b.t));
    const wrong = shown.some((c, m) => c !== truth[m]) ? 1 : 0;
    // how long after its minute ends a window's count is first published
    const wait = cfg.time === 'processing' ? 0 : cfg.wait;
    trace.push({ type: 'done', shown, truth, wrong });
    return { trace, stats: { wrong, dropped, corrections, wait } };
  }

  /* ---------- the lab ---------- */
  const SEEDS = Array.from({ length: 100 }, (_, i) => i + 1);
  const yn = (v) => (v ? 'yes' : 'no');

  DDIA.lab({
    id: 'streams',
    title: 'Stream windows lab',
    short: 'Streams',
    tagline: 'Count events per minute, then let some arrive late',
    chapters: [11],
    styles: ['knobs', 'challenges'],
    // hub thumbnail: events on an event-time line, each joined to when it arrived; one straggler slants far
    thumb: '<svg viewBox="0 0 200 110">' +
      '<path d="M14 30H190M14 84H190" stroke="var(--border-strong)" stroke-width="1.4"/>' +
      '<rect x="14" y="20" width="58" height="20" rx="4" fill="var(--k-primary-f)"/><rect x="72" y="20" width="58" height="20" rx="4" fill="var(--k-info-f)"/><rect x="130" y="20" width="58" height="20" rx="4" fill="var(--k-primary-f)"/>' +
      [[24, 28], [40, 44], [58, 60], [86, 90], [104, 106], [120, 124], [146, 150], [168, 170]].map(([a, b]) => `<path d="M${a} 30L${b} 84" stroke="var(--k-data-s)" stroke-width="1.4"/><circle cx="${a}" cy="30" r="3" fill="var(--k-data-s)"/><circle cx="${b}" cy="84" r="3" fill="var(--k-data-s)"/>`).join('') +
      '<path d="M50 30L160 84" stroke="var(--k-bad-s)" stroke-width="1.8" stroke-dasharray="4 3"/><circle cx="50" cy="30" r="3.5" fill="var(--k-bad-s)"/><circle cx="160" cy="84" r="3.5" fill="var(--k-bad-s)"/></svg>',
    // scenario card drawing: the kind of delays, and how long each window waits (setup only)
    sketch(cfg) {
      const slant = { none: 3, some: 40, offline: 110 }[cfg.delays];
      let s = '<path d="M12 12H228M12 48H228" stroke="var(--border-strong)" stroke-width="1.4"/>';
      [0, 1, 2, 3].forEach((m) => { s += `<rect x="${14 + m * 50}" y="6" width="48" height="12" rx="3" fill="var(--k-${m % 2 ? 'info' : 'primary'}-f)"/>`; });
      [22, 44, 70, 96, 120, 146, 172, 196].forEach((x, k) => {
        const d = k === 2 ? slant : 3;
        s += `<path d="M${x} 12L${Math.min(226, x + d)} 48" stroke="var(--k-${d > 3 ? 'bad' : 'data'}-s)" stroke-width="1.4"/>`;
      });
      if (cfg.time === 'event' && cfg.wait) s += `<path d="M64 52H${64 + cfg.wait * 0.6}" stroke="var(--k-warn-s)" stroke-width="3" stroke-linecap="round"/>`;
      const label = cfg.time === 'processing' ? 'by arrival time' : `event time, wait ${cfg.wait ? (cfg.wait === 120 ? '2 min' : cfg.wait + ' s') : 'none'}`;
      return `<svg viewBox="0 0 240 84">${s}<text x="120" y="76" text-anchor="middle" font-size="15" font-weight="600" fill="var(--text-2)" style="font-family:var(--font-body)">${label}</text></svg>`;
    },
    knobs: [
      { id: 'delays', label: 'Events arrive after', options: Object.keys(DELAY_LABEL).map((k) => ({ value: k, label: DELAY_LABEL[k] })) },
      { id: 'time', label: 'Window by', options: Object.keys(TIME_LABEL).map((k) => ({ value: k, label: TIME_LABEL[k] })) },
      { id: 'wait', label: 'Wait for stragglers', options: WAITS.map((w) => ({ value: w, label: w === 0 ? 'None' : w === 120 ? '2 min' : `${w} s` })) },
      { id: 'late', label: 'Later events', options: [{ value: 'drop', label: 'Drop them' }, { value: 'correct', label: 'Publish a correction' }] },
    ],
    defaults: { delays: 'some', time: 'event', wait: 0, late: 'drop' },
    normalize(c) {
      if (!DELAY_LABEL[c.delays]) c.delays = 'some';
      if (!TIME_LABEL[c.time]) c.time = 'event';
      c.wait = WAITS.includes(Number(c.wait)) ? Number(c.wait) : 0;
      if (!['drop', 'correct'].includes(c.late)) c.late = 'drop';
      // windows by arrival time never wait and never see a late event: those knobs don't apply
      if (c.time === 'processing') { c.wait = 0; c.late = 'drop'; }
      return c;
    },
    disabled: (cfg, knob, value) => cfg.time === 'processing' && ((knob === 'wait' && value !== 0) || (knob === 'late' && value !== 'drop')),
    describe: (cfg) => `${TIME_LABEL[cfg.time]}, ${DELAY_LABEL[cfg.delays].toLowerCase()}`,

    run,
    defaultInput: () => 1,
    samples: (cfg, count) => (count ? Array.from({ length: count }, (_, i) => i + 1) : SEEDS),
    nextInput: (cfg, seed) => (seed % SEEDS.length) + 1,
    nextLabel: 'Next run',
    inputKey: String,
    parseInput: (s) => { const x = parseInt(s, 10); return x >= 1 && x <= 100000 ? x : null; },
    inputLabel: (seed) => `run #${seed}`,
    sampleNoun: ['run', 'runs'],

    metrics: [
      { id: 'wrong', label: 'A minute’s count is wrong', kind: 'bad', fmt: yn },
      { id: 'dropped', label: 'Late events dropped', kind: 'warn' },
      { id: 'corrections', label: 'Corrections published', kind: 'neutral', plain: true },
      { id: 'wait', label: 'Wait before a count', kind: 'neutral', plain: true, fmt: (v) => (v === 120 ? '2 min' : `${v} s`) },
    ],
    classify(st) {
      if (st.wrong) return { kind: 'bad', label: 'wrong counts' };
      if (st.corrections) return { kind: 'good', label: 'right, after corrections' };
      return { kind: 'good', label: 'right counts' };
    },

    presets: [
      {
        id: 'arrival', title: 'Count by arrival time',
        blurb: 'Windows use the time events arrive. Are counts right?',
        config: { delays: 'some', time: 'processing' }, knobs: ['time', 'delays'],
        nudge: 'Switch to event time: count each event in the minute it happened.',
        predict: { q: 'Some events straggle in up to 90 s late. Counting by arrival, will a minute’s count be wrong?', metric: 'wrong' },
      },
      {
        id: 'no-wait', title: 'Event time, no waiting',
        blurb: 'Each minute publishes the moment it ends. Stragglers?',
        config: { delays: 'some', time: 'event', wait: 0, late: 'drop' }, knobs: ['wait', 'late'],
        nudge: 'Let each window wait for stragglers before it publishes.',
        predict: { q: 'Count by event time and publish each minute as soon as it ends. Will a count be wrong?', metric: 'wrong' },
      },
      {
        id: 'watermark', title: 'Wait for stragglers',
        blurb: 'Hold each minute open for two more minutes.',
        config: { delays: 'some', time: 'event', wait: 120, late: 'drop' }, knobs: ['wait', 'delays'],
        nudge: 'Now try offline phones, which report minutes late.',
        predict: { q: 'Stragglers arrive within 90 s, and each window waits 2 minutes. Will a count be wrong?', metric: 'wrong' },
      },
      {
        id: 'offline', title: 'Offline phones',
        blurb: 'Some phones report minutes later. Can waiting catch them?',
        config: { delays: 'offline', time: 'event', wait: 120, late: 'drop' }, knobs: ['late', 'wait'],
        nudge: 'Publish a correction instead of dropping the latecomers.',
        predict: { q: 'Some phones report 2.5–5 minutes late, and windows wait 2 minutes. Will a count be wrong?', metric: 'wrong' },
      },
      {
        id: 'corrections', title: 'Publish a correction',
        blurb: 'Publish early, then fix a count when a latecomer shows up.',
        config: { delays: 'offline', time: 'event', wait: 30, late: 'correct' }, knobs: ['late', 'wait'],
        nudge: 'Counts end up right, but readers must handle updates.',
        predict: { q: 'Windows publish after 30 s, then correct themselves when latecomers arrive. Will a count stay wrong?', metric: 'wrong' },
      },
      {
        id: 'free-play', title: 'Free play',
        blurb: 'Everything unlocked. Mix delays, windows and late handling.',
        config: { delays: 'some', time: 'event', wait: 30, late: 'drop' }, knobs: ['delays', 'time', 'wait'],
        nudge: 'Everything is unlocked. Find the shortest wait that stays right.',
      },
    ],

    challenges: [
      {
        id: 'tiny-delays', title: 'Even tiny delays',
        blurb: 'Events arrive within a second. Right counts, no corrections.',
        goal: 'Every event arrives within a second. Get every count right with no corrections, and publish within 30 s.',
        config: { delays: 'none', time: 'processing', wait: 0, late: 'drop' }, knobs: ['time', 'wait'],
        criteria: [
          { label: 'Every minute’s count is right', metric: 'wrong', max: 0 },
          { label: 'Counts publish within 30 s', metric: 'wait', max: 30 },
        ],
        hint: 'An event from 0:59 that arrives at 1:00 belongs to the first minute.',
        solution: { config: { time: 'event', wait: 30 }, why: 'A second of delay pushes boundary events past their window; a 30 s wait catches them cheaply.' },
      },
      {
        id: 'no-corrections', title: 'No corrections allowed',
        blurb: 'Readers can’t handle updates. Stragglers take up to 90 s.',
        goal: 'The dashboard can’t take corrections. Stragglers arrive up to 90 s late. Get every count right.',
        config: { delays: 'some', time: 'event', wait: 0, late: 'drop' }, knobs: ['wait'],
        criteria: [{ label: 'Every minute’s count is right', metric: 'wrong', max: 0 }],
        hint: 'How long must a window stay open for the slowest straggler?',
        solution: { config: { wait: 120 }, why: 'Every straggler arrives within 90 s, so a 2-minute wait catches them all, at the cost of latency.' },
      },
      {
        id: 'quick-and-right', title: 'Quick and right, offline phones too',
        blurb: 'Phones report minutes late. Right counts within 30 s.',
        goal: 'Some phones report up to 5 minutes late. Counts must end up right, and first appear within 30 s.',
        config: { delays: 'offline', time: 'processing', wait: 0, late: 'drop' }, knobs: ['time', 'wait', 'late'],
        criteria: [
          { label: 'Every minute’s count ends up right', metric: 'wrong', max: 0 },
          { label: 'Counts publish within 30 s', metric: 'wait', max: 30 },
        ],
        hint: 'No wait is long enough for a phone that was offline. What else can a window do?',
        solution: { config: { time: 'event', wait: 30, late: 'correct' }, why: 'Publish quickly, then correct the count when a latecomer arrives: fast and, in the end, right.' },
      },
    ],

    view,
  });

  /* ---------- view: event time on top, arrival below, a line joining each event's two moments ---------- */
  const X0 = 60, XS = 0.88, END = 540; // 0–9 minutes across the stage: offline phones arrive that late
  const TOP = 78, BOTTOM = 170, RES = 262;
  const SCALE = 16;                    // ms of animation per model second at 1×
  function view(el, v, api) {
    const box = v.wrap(el);
    const holder = v.h('div');
    box.appendChild(holder);
    const log = v.log(box, { title: 'What happened, newest first', max: 6 });
    const X = (t) => X0 + Math.min(END, t) * XS;
    let st, cursor, clock, chips;

    function draw(cfg) {
      holder.textContent = '';
      st = v.stage(holder, { w: 560, h: 300, label: 'Events by when they happened, joined to when they arrived; counts per minute below' });
      st.text(X0, 36, 'When it happened (event time)', { size: 14, anchor: 'start', weight: 700, kind: 'text2' });
      st.text(X0, 208, 'When it arrived (processing time)', { size: 14, anchor: 'start', weight: 700, kind: 'text2' });
      // the minutes being counted, shaded on the timeline they are counted by
      const bandY = cfg.time === 'event' ? TOP - 14 : BOTTOM - 14;
      for (let m = 0; m < MINUTES; m++) st.rect(X(m * 60), bandY, 60 * XS, 28, { kind: m % 2 ? 'info' : 'primary', rx: 4 });
      st.line(X0, TOP, X(END), TOP, { width: 1.5, kind: 'muted' });
      st.line(X0, BOTTOM, X(END), BOTTOM, { width: 1.5, kind: 'muted' });
      for (let t = 0; t <= END; t += 60) st.text(X(t), 290, `${t / 60}:00`, { size: 14, kind: 'muted', mono: true });
      if (cfg.time === 'event') {
        for (let m = 0; m < MINUTES; m++) {
          const at = (m + 1) * 60 + cfg.wait;
          st.line(X(at), BOTTOM - 16, X(at), BOTTOM + 16, { kind: 'warn', width: 2 });
        }
        st.text(X(60 + cfg.wait) + 4, BOTTOM - 22, cfg.wait ? 'windows close' : 'windows close at once', { size: 14, anchor: 'start', kind: 'warn', halo: true, layer: 'top' });
      }
      cursor = st.line(X0, 44, X0, 196, { kind: 'primary', dashed: true, width: 1.5, layer: 'top' });
      clock = st.text(552, 18, '', { size: 14, anchor: 'end', mono: true, kind: 'muted' });
      // each minute's published count sits in its own row, under the minute it counts
      st.text(10, RES, 'Counts', { size: 14, anchor: 'start', weight: 700, kind: 'text2' });
      chips = [];
      for (let m = 0; m < MINUTES; m++) chips[m] = st.text(X(m * 60 + 30), RES, '·', { size: 14, weight: 700, mono: true, kind: 'muted' });
    }
    const FATE = { ok: 'data', moved: 'warn', missed: 'bad', late: 'info', dropped: 'bad' };
    function plot(e) {
      const k = FATE[e.fate];
      // on-time events are quiet grey threads, so the stragglers' slanted lines stand out
      st.line(X(e.at), TOP, X(e.arrives), BOTTOM, { kind: e.fate === 'ok' ? 'muted' : k, width: e.fate === 'ok' ? 1 : 2, dashed: e.fate === 'dropped' || e.fate === 'missed' });
      st.add('circle', { cx: X(e.at), cy: TOP, r: 3, class: `vz-shape k-${k}` });
      st.add('circle', { cx: X(e.arrives), cy: BOTTOM, r: 3, class: `vz-shape k-${k}` });
    }
    function emit(e) {
      const ok = e.count === e.truth;
      chips[e.m].set(ok ? `${e.count} ✓` : `${e.count} ✕`, ok ? 'good' : 'bad');
    }
    function logEvent(e) {
      const when = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
      if (e.fate === 'moved') log.add(`An event from ${when(e.at)} arrives at ${when(e.arrives)}: counted in the wrong minute`, 'warn');
      else if (e.fate === 'missed') log.add(`An event from ${when(e.at)} arrives after the last window: counted nowhere`, 'bad');
      else if (e.fate === 'dropped') log.add(`An event from ${when(e.at)} arrives at ${when(e.arrives)}, after its window closed: dropped`, 'bad');
      else if (e.fate === 'late') log.add(`An event from ${when(e.at)} arrives at ${when(e.arrives)}: its minute publishes a correction`, 'info');
    }
    function logEmit(e) {
      const ok = e.count === e.truth;
      const what = e.correction ? 'corrected to' : 'publishes';
      log.add(`Minute ${e.m + 1} ${what} ${e.count}${ok ? ', which is right' : `, but ${e.truth} events happened in it`}`, ok ? 'good' : 'bad');
    }
    function finish(e) {
      clock.set(e.wrong ? 'some counts are wrong' : 'every count is right', e.wrong ? 'bad' : 'good');
    }

    function render(result, cfg, input, o) {
      v.restart();
      draw(cfg);
      log.clear();
      const trace = result.trace;
      if (o.preview) return Promise.resolve();
      if (!o.animate) {
        trace.forEach((e) => {
          if (e.type === 'event') { plot(e); if (e.fate !== 'ok') logEvent(e); }
          else if (e.type === 'emit') emit(e);
          else if (e.type === 'done') finish(e);
        });
        cursor.set({ x1: X(END), x2: X(END) });
        return Promise.resolve();
      }
      return animate(trace);
    }
    async function animate(trace) {
      let now = 0;
      let quiet = 0;
      for (const e of trace) {
        const t = e.type === 'event' ? e.arrives : e.t;
        if (t != null && t > now) {
          const from = now;
          const to = Math.min(END, t);
          await v.tween(api.pace((to - from) * SCALE), (k) => { const x = X(from + (to - from) * k); cursor.set({ x1: x, x2: x }); }, (k) => k);
          now = t;
        }
        if (e.type === 'event') {
          plot(e);
          if (e.fate === 'ok') quiet++;
          else { logEvent(e); await v.sleep(api.pace(160)); }
        } else if (e.type === 'emit') {
          if (quiet) { log.add(`${quiet} events arrive on time`, 'info'); quiet = 0; }
          emit(e);
          logEmit(e);
          await v.sleep(api.pace(260));
        } else if (e.type === 'done') finish(e);
      }
    }
    return { render };
  }

  DDIA.labs.streamsModel = { run, EVENTS, MINUTES, WAITS };
})();
