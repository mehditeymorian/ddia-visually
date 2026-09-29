/* DDIA Visual Guide — Clocks and ordering lab (chapters 8 and 9).
 * Alice writes x=1 on node A. Bob reads it and replies x=2 on node B (caused by hers). A moment later
 * Carol writes x=3 on node C without having seen either. The store keeps the write with the highest
 * timestamp. Skewed wall clocks can lose Bob's reply; Lamport clocks keep causes first but ignore real
 * time; commit wait keeps both, at the price of waiting. The model is pure; the view replays it. */
(function () {
  'use strict';
  const DDIA = (window.DDIA = window.DDIA || {});

  /* ---------- model ---------- */
  const SKEWS = [0, 5, 50, 200];                     // ms two node clocks may disagree by (each is within ±skew/2)
  const GAP = { fast: [2, 20], slow: [800, 2000] };  // ms from one write's commit to the next write
  const ORDER_LABEL = { wall: 'Wall clock', lamport: 'Lamport clock', wait: 'Commit wait' };
  const WHO = [
    { name: 'Alice', node: 'A', value: 1 },
    { name: 'Bob', node: 'B', value: 2 },
    { name: 'Carol', node: 'C', value: 3 },
  ];
  const BASE = 36001000; // 10:00:01.000 as ms since midnight, so clock readings look like clock readings
  const pad = (n, w) => String(n).padStart(w, '0');
  function clockText(ms) {
    const s = Math.floor(ms / 1000);
    return `${pad(Math.floor(s / 3600), 2)}:${pad(Math.floor(s / 60) % 60, 2)}:${pad(s % 60, 2)}.${pad(ms % 1000, 3)}`;
  }
  // compare two timestamps: wall-clock numbers, or Lamport pairs (counter, then node name)
  const before = (a, b) => (Array.isArray(a) ? a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]) : a < b);

  function run(cfg, seed) {
    const rng = DDIA.sim.rng(seed);
    const uni = (a, b) => a + (b - a) * rng.next();
    const eps = cfg.skew / 2;
    const err = { A: Math.round(uni(-eps, eps)), B: Math.round(uni(-eps, eps)), C: Math.round(uni(-eps, eps)) };
    const gaps = [Math.round(uni(GAP[cfg.gap][0], GAP[cfg.gap][1])), Math.round(uni(GAP[cfg.gap][0], GAP[cfg.gap][1]))];
    const prior = rng.int(0, 3); // events node C handled before Carol's write (its Lamport counter)
    const wait = cfg.order === 'wait' ? cfg.skew : 0; // commit wait = 2 × the clock uncertainty

    const trace = [{ type: 'setup', err, prior, wait }];
    const writes = [];
    let t = 0;
    let counter = { A: 0, B: 0, C: prior };
    WHO.forEach((w, i) => {
      if (i) t = writes[i - 1].ack + gaps[i - 1]; // each write starts after the previous one was acknowledged
      if (i === 1) trace.push({ type: 'read', t: writes[0].ack, value: 1 }); // Bob reads Alice's write first
      let ts;
      if (cfg.order === 'lamport') {
        if (i === 1) counter.B = Math.max(counter.B, counter.A); // Bob's node learns Alice's counter by reading
        counter[w.node]++;
        ts = [counter[w.node], w.node];
      } else ts = BASE + t + err[w.node];
      const wr = { i, name: w.name, node: w.node, value: w.value, t, ts, ack: t + wait };
      wr.label = Array.isArray(ts) ? `(${ts[0]}, ${ts[1]})` : clockText(ts);
      writes.push(wr);
      trace.push(Object.assign({ type: 'write' }, wr));
    });
    // the store keeps them sorted by timestamp; the last one wins
    const sorted = writes.slice().sort((a, b) => (before(a.ts, b.ts) ? -1 : before(b.ts, a.ts) ? 1 : 0));
    const lost = before(writes[1].ts, writes[0].ts) ? 1 : 0;                                   // Bob's reply sorts before its cause
    const order = before(writes[2].ts, writes[1].ts) || before(writes[2].ts, writes[0].ts) ? 1 : 0; // Carol sorts before an earlier write
    const final = sorted[2].value;
    trace.push({ type: 'sort', order: sorted.map((w) => w.value), final, lost, broken: order });
    return { trace, stats: { lost, order, wait, final } };
  }

  /* ---------- the lab ---------- */
  const SEEDS = Array.from({ length: 100 }, (_, i) => i + 1);
  const yn = (v) => (v ? 'yes' : 'no');
  const ORDERS = ['wall', 'lamport', 'wait'];

  DDIA.lab({
    id: 'clocks',
    title: 'Clocks and ordering lab',
    short: 'Clocks',
    tagline: 'Skew the clocks, lose a write, then order events right',
    chapters: [8, 9],
    styles: ['knobs', 'challenges'],
    // hub thumbnail: three clocks that disagree, and three writes sorted by timestamp
    thumb: '<svg viewBox="0 0 200 110">' +
      [[34, 30, -40], [34, 64, 20], [34, 98, 70]].map(([x, y, a]) => `<circle cx="${x}" cy="${y}" r="12" fill="var(--k-neutral-f)" stroke="var(--k-neutral-s)" stroke-width="1.6"/><path d="M${x} ${y}L${x + 8 * Math.sin((a * Math.PI) / 180)} ${y - 8 * Math.cos((a * Math.PI) / 180)}" stroke="var(--k-primary-s)" stroke-width="2" stroke-linecap="round"/>`).join('') +
      '<rect x="110" y="18" width="70" height="20" rx="6" fill="var(--k-data-f)" stroke="var(--k-data-s)" stroke-width="1.6"/><text x="145" y="32" text-anchor="middle" font-size="11" font-weight="700" fill="var(--k-data-i)">x=1</text>' +
      '<rect x="110" y="46" width="70" height="20" rx="6" fill="var(--k-bad-f)" stroke="var(--k-bad-s)" stroke-width="1.6"/><text x="145" y="60" text-anchor="middle" font-size="11" font-weight="700" fill="var(--k-bad-i)">x=2</text>' +
      '<rect x="110" y="74" width="70" height="20" rx="6" fill="var(--k-info-f)" stroke="var(--k-info-s)" stroke-width="1.6"/><text x="145" y="88" text-anchor="middle" font-size="11" font-weight="700" fill="var(--k-info-i)">x=3</text></svg>',
    // scenario card drawing: three clocks spread by the skew, and the ordering rule (setup only)
    sketch(cfg) {
      const spread = [0, 6, 22, 40][SKEWS.indexOf(cfg.skew)];
      let s = '';
      [-1, 0, 1].forEach((k, i) => {
        const x = 60 + i * 60 + k * spread * 0.4;
        const a = (k * spread * 3 * Math.PI) / 180;
        s += `<circle cx="${60 + i * 60}" cy="30" r="17" fill="var(--k-neutral-f)" stroke="var(--k-neutral-s)" stroke-width="1.6"/>`;
        s += `<path d="M${60 + i * 60} 30L${60 + i * 60 + 12 * Math.sin(a)} ${30 - 12 * Math.cos(a)}" stroke="var(--k-primary-s)" stroke-width="2.2" stroke-linecap="round"/>`;
        s += `<circle cx="${x}" cy="56" r="3" fill="var(--k-data-s)"/>`;
      });
      const label = `${cfg.skew} ms skew, ${ORDER_LABEL[cfg.order].toLowerCase()}`;
      return `<svg viewBox="0 0 240 84">${s}<text x="120" y="78" text-anchor="middle" font-size="15" font-weight="600" fill="var(--text-2)" style="font-family:var(--font-body)">${label}</text></svg>`;
    },
    knobs: [
      { id: 'skew', label: 'Clock skew', options: SKEWS.map((s) => ({ value: s, label: `${s} ms` })) },
      { id: 'gap', label: 'Next write comes', options: [{ value: 'fast', label: 'At once' }, { value: 'slow', label: 'A second later' }] },
      { id: 'order', label: 'Order writes by', options: ORDERS.map((o) => ({ value: o, label: ORDER_LABEL[o] })) },
    ],
    defaults: { skew: 50, gap: 'fast', order: 'wall' },
    normalize(c) {
      c.skew = SKEWS.includes(Number(c.skew)) ? Number(c.skew) : 50;
      if (!GAP[c.gap]) c.gap = 'fast';
      if (!ORDERS.includes(c.order)) c.order = 'wall';
      return c;
    },
    describe: (cfg) => `${cfg.skew} ms skew, ${ORDER_LABEL[cfg.order]}`,

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
      { id: 'lost', label: 'Bob’s reply lost', kind: 'bad', fmt: yn },
      { id: 'order', label: 'Real-time order broken', kind: 'warn', fmt: yn },
      { id: 'wait', label: 'Commit wait per write', kind: 'neutral', plain: true, fmt: (v) => `${v} ms` },
      { id: 'final', label: 'Final value', kind: 'neutral', plain: true, fmt: (v) => `x = ${v}` },
    ],
    classify(st) {
      if (st.lost) return { kind: 'bad', label: 'reply lost' };
      if (st.order) return { kind: 'warn', label: 'real-time order broken' };
      return { kind: 'good', label: 'in order' };
    },

    presets: [
      {
        id: 'no-skew', title: 'Perfect clocks',
        blurb: 'Every clock agrees. Can a reply still get lost?',
        config: { skew: 0, gap: 'fast', order: 'wall' }, knobs: ['skew', 'order'],
        nudge: 'Give the clocks 50 ms of skew and replay.',
        predict: { q: 'All clocks agree exactly. Can Bob’s reply sort before the write it answers?', metric: 'lost' },
      },
      {
        id: 'skewed', title: 'Later write, earlier timestamp',
        blurb: 'Clocks disagree by 50 ms. Does the reply survive?',
        config: { skew: 50, gap: 'fast', order: 'wall' }, knobs: ['skew', 'gap', 'order'],
        nudge: 'Switch to Lamport clocks, or let Bob reply a second later.',
        predict: { q: 'Clocks may be 50 ms apart and Bob replies within 20 ms. Can his reply be lost?', metric: 'lost' },
      },
      {
        id: 'slow-reply', title: 'A slower reply',
        blurb: 'The same skew, but writes are a second apart.',
        config: { skew: 50, gap: 'slow', order: 'wall' }, knobs: ['gap', 'skew'],
        nudge: 'Skew only bites when writes are closer together than the skew.',
        predict: { q: '50 ms of skew, but each write comes a second after the last. Can Bob’s reply be lost?', metric: 'lost' },
      },
      {
        id: 'lamport', title: 'Lamport clocks',
        blurb: 'Counters follow causes. Do they follow real time?',
        config: { skew: 200, gap: 'fast', order: 'lamport' }, knobs: ['order', 'skew'],
        nudge: 'Bob is safe. Now watch where Carol’s later write lands.',
        predict: { q: 'Lamport counters: Carol writes after Bob but never saw him. Can she sort before him?', metric: 'order' },
      },
      {
        id: 'commit-wait', title: 'Wait out the uncertainty',
        blurb: 'Hold each write until its timestamp is surely past.',
        config: { skew: 50, gap: 'fast', order: 'wait' }, knobs: ['order', 'skew'],
        nudge: 'Check the commit wait readout: every write pays it.',
        predict: { q: 'Each write waits out 50 ms of clock uncertainty. Can anything sort out of order?', metric: 'order' },
      },
      {
        id: 'free-play', title: 'Free play',
        blurb: 'Everything unlocked. Mix skews, gaps and ordering rules.',
        config: { skew: 50, gap: 'fast', order: 'wall' }, knobs: ['skew', 'gap', 'order'],
        nudge: 'Everything is unlocked. Try 200 ms of skew with each rule.',
      },
    ],

    challenges: [
      {
        id: 'causal', title: 'Never lose a reply',
        blurb: 'Clocks drift by 200 ms. Keep every reply, and don’t wait.',
        goal: 'Clocks may be 200 ms apart. Bob’s reply must never be lost, and no write may wait more than 20 ms.',
        config: { skew: 200, gap: 'fast', order: 'wall' }, knobs: ['order'],
        criteria: [
          { label: 'Bob’s reply is never lost', metric: 'lost', max: 0 },
          { label: 'No write waits more than 20 ms', metric: 'wait', max: 20 },
        ],
        hint: 'Bob saw Alice’s write. Can his timestamp carry that knowledge?',
        solution: { config: { order: 'lamport' }, why: 'Bob’s counter goes above everything he has seen, so his reply sorts after its cause without waiting.' },
      },
      {
        id: 'real-time', title: 'Real time, too',
        blurb: 'Keep causes first and real-time order for everyone.',
        goal: 'Clocks may be 50 ms apart. Never lose Bob’s reply, and never sort Carol’s later write before an earlier one.',
        config: { skew: 50, gap: 'fast', order: 'lamport' }, knobs: ['order'],
        criteria: [
          { label: 'Bob’s reply is never lost', metric: 'lost', max: 0 },
          { label: 'Real-time order always holds', metric: 'order', max: 0 },
        ],
        hint: 'Carol never talked to Bob, so no counter can connect them. Only time can.',
        solution: { config: { order: 'wait' }, why: 'Waiting out the clock uncertainty makes any later write get a later timestamp.' },
      },
      {
        id: 'better-clocks', title: 'Shorter waits',
        blurb: 'Commit wait is on. Make writes wait under 10 ms.',
        goal: 'Commit wait keeps everything in order. Make each write wait less than 10 ms without breaking any order.',
        config: { skew: 200, gap: 'fast', order: 'wait' }, knobs: ['skew'],
        criteria: [
          { label: 'Nothing sorts out of order', metric: 'order', max: 0 },
          { label: 'Bob’s reply is never lost', metric: 'lost', max: 0 },
          { label: 'Each write waits under 10 ms', metric: 'wait', max: 9 },
        ],
        hint: 'How long does commit wait last, and what sets that length?',
        solution: { config: { skew: 5 }, why: 'Commit wait lasts as long as the clock uncertainty, so tighter clocks make writes faster.' },
      },
    ],

    view,
  });

  /* ---------- view: three node lanes in real-time order, then the store's timestamp order ---------- */
  const LANE = { A: 78, B: 148, C: 218 };
  const COL = [158, 238, 318];
  const SLOT = [96, 150, 204];
  const RULE = {
    wall: 'Last write wins, by wall-clock timestamp',
    lamport: 'Last write wins, by Lamport timestamp (counter, node)',
    wait: 'Commit wait: hold each write until its timestamp is surely past',
  };
  const KIND = { 1: 'data', 2: 'primary', 3: 'info' };
  function view(el, v, api) {
    const box = v.wrap(el);
    const holder = v.h('div');
    box.appendChild(holder);
    const log = v.log(box, { title: 'What happened, newest first', max: 6 });
    let st, chips, verdict, verdict2;

    function draw(cfg, setup) {
      holder.textContent = '';
      st = v.stage(holder, { w: 560, h: 300, label: 'Three nodes write x; the store sorts the writes by timestamp' });
      st.text(280, 20, RULE[cfg.order], { size: 14.5, weight: 700, kind: 'text' });
      WHO.forEach((w) => {
        const y = LANE[w.node];
        st.text(10, y - 4, `Node ${w.node}`, { size: 14, anchor: 'start', weight: 700, kind: 'text2' });
        const note = cfg.order === 'lamport' ? `counter ${w.node === 'C' ? setup.prior : 0}` : `clock ${setup.err[w.node] >= 0 ? '+' : '−'}${Math.abs(setup.err[w.node])} ms`;
        st.text(10, y + 16, note, { size: 14, anchor: 'start', mono: true, kind: 'muted' });
        st.line(110, y, 372, y, { width: 1.5, kind: 'muted' });
      });
      st.line(396, 44, 396, 262, { width: 1, kind: 'muted', dashed: true });
      st.text(478, 58, 'Sorted by timestamp', { size: 14, weight: 700, kind: 'text2' });
      SLOT.forEach((y, i) => st.text(414, y + 5, ['1st', '2nd', '3rd'][i], { size: 14, anchor: 'start', kind: 'muted', mono: true }));
      verdict = st.text(478, 246, '', { size: 14, weight: 700, kind: 'good' });
      verdict2 = st.text(478, 266, '', { size: 14, weight: 700, kind: 'bad' });
      chips = [];
    }
    function writeChip(e, cfg) {
      const n = st.node({ x: COL[e.i], y: LANE[e.node], w: 104, h: 44, label: `${e.name}: x=${e.value}`, sub: e.label, kind: KIND[e.value], badge: cfg.order === 'wait' ? `+${cfg.skew} ms` : null });
      st.text(COL[e.i], 282, `t = ${e.t} ms`, { size: 14, kind: 'muted', mono: true });
      chips[e.i] = n;
      return n;
    }
    function logWrite(e, cfg) {
      const stamp = cfg.order === 'lamport' ? `timestamp ${e.label}` : `clock reads ${e.label}`;
      log.add(`${e.name} writes x=${e.value} on node ${e.node} at t = ${e.t} ms: ${stamp}`, 'info');
    }
    function slots(e, trace) {
      const writes = trace.filter((x) => x.type === 'write');
      return e.order.map((value, k) => {
        const w = writes.find((x) => x.value === value);
        const bad = (e.lost && value === 2) || (e.broken && value === 3);
        return { w, y: SLOT[k], kind: bad ? (value === 2 ? 'bad' : 'warn') : KIND[value] };
      });
    }
    function logSort(e) {
      if (e.lost) log.add('Bob’s reply has an older timestamp than the write it answers, so the store drops it', 'bad');
      if (e.broken) log.add('Carol wrote last in real time, but her write sorts before an earlier one', 'warn');
      if (!e.lost && !e.broken) log.add('Every write sorts in the order it happened', 'good');
      log.add(`The store keeps the highest timestamp: x = ${e.final}`, e.final === 3 ? 'good' : 'warn');
    }
    // Carol wrote last, so x = 3 should win; a dropped reply can hide behind that, so it gets its own line
    function showVerdict(e) {
      verdict.set(e.final === 3 ? 'x = 3 wins ✓' : `x = ${e.final} wins, not 3`, e.final === 3 ? 'good' : 'warn');
      verdict2.set(e.lost ? 'Bob’s reply dropped' : '', 'bad');
    }

    function render(result, cfg, input, o) {
      v.restart();
      const trace = result.trace;
      draw(cfg, trace[0]);
      log.clear();
      if (o.preview) return Promise.resolve();
      if (!o.animate) {
        trace.forEach((e) => {
          if (e.type === 'write') { writeChip(e, cfg); logWrite(e, cfg); }
          if (e.type === 'sort') {
            slots(e, trace).forEach((s) => st.node({ x: 478, y: s.y, w: 104, h: 42, label: `x=${s.w.value}`, sub: s.w.label, kind: s.kind }));
            logSort(e);
            showVerdict(e);
          }
        });
        return Promise.resolve();
      }
      return animate(trace, cfg);
    }
    async function animate(trace, cfg) {
      for (const e of trace) {
        if (e.type === 'write') {
          const n = writeChip(e, cfg);
          n.flash();
          logWrite(e, cfg);
          if (cfg.order === 'wait') log.add(`Node ${e.node} holds the write ${cfg.skew} ms before confirming it`, 'warn');
          await v.sleep(api.pace(700));
        } else if (e.type === 'read') {
          await st.send(chips[0], { x: COL[1], y: LANE.B }, { label: 'x=1', kind: 'data', dur: api.pace(700), curve: 20 });
          log.add('Bob reads x=1 from node A, then replies', 'info');
        } else if (e.type === 'sort') {
          const ss = slots(e, trace);
          for (const s of ss) {
            await st.send(chips[s.w.i], { x: 478, y: s.y }, { label: `x=${s.w.value}`, kind: KIND[s.w.value], dur: api.pace(600) });
            st.node({ x: 478, y: s.y, w: 104, h: 42, label: `x=${s.w.value}`, sub: s.w.label, kind: s.kind });
          }
          logSort(e);
          showVerdict(e);
        }
      }
    }
    return { render };
  }

  DDIA.labs.clocksModel = { run, SKEWS, GAP, clockText };
})();
