/* DDIA Visual Guide — Leases and fencing lab (chapters 8 and 9).
 * Client 1 holds a lease on a file and renews it each time it checks. A pause or a crash stops the
 * renewals, the lease expires, client 2 takes over, and a paused client 1 can wake up and write anyway.
 * The model is pure and timed in seconds; the view replays it on four lanes. See LABS.md. */
(function () {
  'use strict';
  const DDIA = (window.DDIA = window.DDIA || {});

  /* ---------- model ---------- */
  const OLD = 33, NEW = 34; // client 1's fencing token, then client 2's
  const WANTS = 2;          // client 2 asks for the lock at 2 s
  const STUCK = 15;         // client 2 waiting longer than this is a slow failover
  const PAUSE = { short: [0.2, 2], long: [4, 16] }; // seconds
  const LEASES = [5, 10, 30];
  const FAULT_LABEL = { none: 'None', short: 'Short pause', long: 'Long pause', crash: 'Crash', mixed: 'Pause or crash' };
  const r1 = (x) => Math.round(x * 10) / 10;

  function run(cfg, seed) {
    const rng = DDIA.sim.rng(seed);
    const uni = (a, b) => a + (b - a) * rng.next();
    const L = cfg.lease;
    const fault = cfg.fault === 'mixed' ? (rng.chance(0.5) ? 'crash' : 'long') : cfg.fault;
    const ev = [];
    const at = (t, type, d) => ev.push(Object.assign({ t: r1(t), type }, d));
    const writes = [];

    // client 1: check the lease on its own clock (renewing it while it still holds it), then write; three writes
    at(0, 'grant', { to: 1, token: OLD, until: L });
    let expiry = L;
    let check = 0.9;
    let end = null; // when the lock service stops counting client 1 as the holder
    let gone = false; // client 1 stopped (crashed, or noticed it lost the lease)
    for (let k = 0; k < 3; k++) {
      if (check >= expiry) { at(check, 'lost', {}); gone = true; break; }
      expiry = check + L;
      if (k) at(check, 'renew', { until: r1(expiry) });
      let w = check + 0.1;
      if (k === 1 && fault === 'crash') { at(check + 0.05, 'crash', {}); gone = true; break; }
      if (k === 1 && PAUSE[fault]) {
        // it checked just before freezing, so it writes as soon as it wakes: the dangerous gap
        const P = uni(PAUSE[fault][0], PAUSE[fault][1]);
        at(check + 0.05, 'pause', { until: r1(check + 0.05 + P), secs: r1(P) });
        w = check + 0.05 + P + 0.05;
      }
      writes.push({ t: w, from: 1, token: OLD });
      check = w + uni(1.8, 2.2);
      if (k === 2) end = w + 0.5;
    }
    if (end != null && end < expiry) at(end, 'release', { from: 1 });
    else { end = expiry; at(expiry, 'expire', { token: OLD }); }

    // client 2 gets the lock once client 1 released it or its lease ran out
    const grant = Math.max(WANTS, end) + 0.1;
    at(WANTS, 'want', {});
    at(grant, 'grant', { to: 2, token: NEW, until: r1(grant + L) });
    writes.push({ t: grant + 0.5, from: 2, token: NEW });
    at(grant + 1, 'release', { from: 2 });

    // storage applies writes in time order; with fencing it rejects a token older than one it has seen
    let seen = 0;
    let newest = 0;
    let corrupt = 0;
    let fenced = 0;
    writes.sort((a, b) => a.t - b.t).forEach((wr) => {
      let result = 'ok';
      if (cfg.fence === 'on' && wr.token < seen) { result = 'fenced'; fenced++; }
      else {
        if (wr.token < newest) { result = 'corrupt'; corrupt = 1; }
        newest = Math.max(newest, wr.token);
      }
      seen = Math.max(seen, wr.token);
      at(wr.t, 'write', { from: wr.from, token: wr.token, result });
    });
    const wait = r1(grant - WANTS);
    ev.sort((a, b) => a.t - b.t);
    ev.push({ t: r1(Math.max(...ev.map((e) => e.t)) + 1), type: 'done', corrupt, fault, gone });
    return { trace: ev, stats: { corrupt, stuck: wait > STUCK ? 1 : 0, fenced, wait } };
  }

  /* ---------- the lab ---------- */
  const SEEDS = Array.from({ length: 100 }, (_, i) => i + 1);
  const yn = (v) => (v ? 'yes' : 'no');
  const FAULTS = ['none', 'short', 'long', 'crash', 'mixed'];

  DDIA.lab({
    id: 'leases',
    title: 'Leases and fencing lab',
    short: 'Leases',
    tagline: 'Pause a lock holder, let its lease expire, fence it off',
    chapters: [8, 9],
    styles: ['knobs', 'challenges'],
    // hub thumbnail: a lease bar, a pause that outlives it, a newer holder, and a stale write that bounces
    thumb: '<svg viewBox="0 0 200 110">' +
      '<path d="M14 34H190M14 62H190M14 90H190" stroke="var(--border-strong)" stroke-width="1.4"/>' +
      '<rect x="18" y="20" width="70" height="9" rx="4.5" fill="var(--k-good-f)" stroke="var(--k-good-s)" stroke-width="1.4"/>' +
      '<rect x="40" y="27" width="96" height="14" rx="4" fill="var(--k-warn-f)" stroke="var(--k-warn-s)" stroke-width="1.4"/>' +
      '<rect x="96" y="48" width="60" height="9" rx="4.5" fill="var(--k-good-f)" stroke="var(--k-good-s)" stroke-width="1.4"/>' +
      '<path d="M112 62 L118 86" stroke="var(--k-data-s)" stroke-width="1.8"/><circle cx="118" cy="90" r="5" fill="var(--k-good-s)"/>' +
      '<path d="M138 34 L146 86" stroke="var(--k-bad-s)" stroke-width="1.8" stroke-dasharray="4 3"/>' +
      '<path d="M141 84l10 10M151 84l-10 10" stroke="var(--k-bad-s)" stroke-width="2.2" stroke-linecap="round"/></svg>',
    // scenario card drawing: the lease, the fault waiting for client 1, and fencing (setup only)
    sketch(cfg) {
      const X = (t) => 14 + t * 5.3; // 0–40 s across the card
      let s = '<path d="M12 22H228M12 50H228" stroke="var(--border-strong)" stroke-width="1.4"/>';
      s += `<rect x="${X(0)}" y="10" width="${cfg.lease * 5.3}" height="8" rx="4" fill="var(--k-good-f)" stroke="var(--k-good-s)" stroke-width="1.4"/>`;
      const f = cfg.fault;
      if (f === 'short') s += `<rect x="${X(3)}" y="16" width="8" height="12" rx="3" fill="var(--k-warn-f)" stroke="var(--k-warn-s)" stroke-width="1.4"/>`;
      if (f === 'long' || f === 'mixed') s += `<rect x="${X(3)}" y="16" width="${12 * 5.3}" height="12" rx="3" fill="var(--k-warn-f)" stroke="var(--k-warn-s)" stroke-width="1.4"${f === 'mixed' ? ' stroke-dasharray="4 3"' : ''}/>`;
      if (f === 'crash' || f === 'mixed') s += `<path d="M${X(3) - 5} 17l10 10M${X(3) + 5} 17l-10 10" stroke="var(--k-bad-s)" stroke-width="2.2" stroke-linecap="round"/>`;
      if (cfg.fence === 'on') s += '<rect x="196" y="40" width="20" height="20" rx="4" fill="var(--k-good-f)" stroke="var(--k-good-s)" stroke-width="1.6"/><path d="M201 50l4 4 7-8" stroke="var(--k-good-s)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
      const label = `lease ${cfg.lease} s${cfg.fence === 'on' ? ', fencing' : ''}`;
      return `<svg viewBox="0 0 240 84">${s}<text x="120" y="76" text-anchor="middle" font-size="15" font-weight="600" fill="var(--text-2)" style="font-family:var(--font-body)">${label}</text></svg>`;
    },
    knobs: [
      { id: 'fault', label: 'Client 1 suffers', options: FAULTS.map((f) => ({ value: f, label: FAULT_LABEL[f] })) },
      { id: 'lease', label: 'Lease length', options: LEASES.map((s) => ({ value: s, label: `${s} s` })) },
      { id: 'fence', label: 'Fencing tokens', options: [{ value: 'off', label: 'Off' }, { value: 'on', label: 'On' }] },
    ],
    defaults: { fault: 'long', lease: 10, fence: 'off' },
    normalize(c) {
      if (!FAULTS.includes(c.fault)) c.fault = 'long';
      c.lease = LEASES.includes(Number(c.lease)) ? Number(c.lease) : 10;
      if (!['off', 'on'].includes(c.fence)) c.fence = 'off';
      return c;
    },
    describe: (cfg) => `${FAULT_LABEL[cfg.fault]}, ${cfg.lease} s lease`,

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
      { id: 'corrupt', label: 'File corrupted', kind: 'bad', fmt: yn },
      { id: 'stuck', label: `Client 2 waits over ${STUCK} s`, kind: 'warn', fmt: yn },
      { id: 'fenced', label: 'Writes fenced off', kind: 'neutral', plain: true },
      { id: 'wait', label: 'Client 2 waited', kind: 'neutral', plain: true, fmt: (v) => `${v} s` },
    ],
    classify(st) {
      if (st.corrupt) return { kind: 'bad', label: 'file corrupted' };
      if (st.stuck) return { kind: 'warn', label: 'slow failover' };
      if (st.fenced) return { kind: 'good', label: 'zombie fenced off' };
      return { kind: 'good', label: 'safe' };
    },

    presets: [
      {
        id: 'short-pause', title: 'A short pause',
        blurb: 'Client 1 freezes for a moment. Is the file safe?',
        config: { fault: 'short', lease: 10, fence: 'off' }, knobs: ['fault', 'lease'],
        nudge: 'Now make it a long pause, like a big garbage collection.',
        predict: { q: 'Client 1 checks its 10 s lease, then freezes for up to 2 s. Can the file get corrupted?', metric: 'corrupt' },
      },
      {
        id: 'zombie', title: 'Zombie lock holder',
        blurb: 'A long pause outlives the lease. Who writes last?',
        config: { fault: 'long', lease: 10, fence: 'off' }, knobs: ['fault', 'fence'],
        nudge: 'Turn fencing tokens on and replay.',
        predict: { q: 'A 4–16 s pause and a 10 s lease. Can client 1 overwrite client 2’s newer data?', metric: 'corrupt' },
      },
      {
        id: 'fencing', title: 'Fencing tokens',
        blurb: 'Storage remembers the newest token. Can a zombie still write?',
        config: { fault: 'long', lease: 10, fence: 'on' }, knobs: ['fence', 'fault'],
        nudge: 'Try a crash too: fencing never slows the handover.',
        predict: { q: 'Storage rejects any token older than one it has seen. Can the file get corrupted?', metric: 'corrupt' },
      },
      {
        id: 'crash', title: 'Client 1 crashes',
        blurb: 'The holder dies. How long until client 2 can write?',
        config: { fault: 'crash', lease: 30, fence: 'off' }, knobs: ['lease', 'fault'],
        nudge: 'Shorten the lease and watch the handover speed up.',
        predict: { q: 'Client 1 crashes holding a 30 s lease. Will client 2 wait more than 15 s?', metric: 'stuck' },
      },
      {
        id: 'free-play', title: 'Free play',
        blurb: 'Everything unlocked. Mix faults, leases and fencing.',
        config: { fault: 'mixed', lease: 10, fence: 'off' }, knobs: ['fault', 'lease', 'fence'],
        nudge: 'Everything is unlocked. Find a setup that is safe and quick.',
      },
    ],

    challenges: [
      {
        id: 'outlast', title: 'Outlast the pause',
        blurb: 'No fencing. Pick the shortest lease that is always safe.',
        goal: 'Client 1 may freeze for up to 16 s and storage has no fencing. Pick the shortest lease that never corrupts the file.',
        config: { fault: 'long', lease: 5, fence: 'off' }, knobs: ['lease'],
        criteria: [
          { label: 'The file is never corrupted', metric: 'corrupt', max: 0 },
          {
            label: 'No shorter lease is also safe',
            test(cfg, ctx) {
              const safe = LEASES.filter((s) => s < cfg.lease).find((s) => ctx.runAll(Object.assign({}, cfg, { lease: s })).every((r) => !r.stats.corrupt));
              if (safe) return { ok: false, text: `a ${safe} s lease is shorter and also safe` };
              return { ok: true, text: cfg.lease === LEASES[0] ? 'nothing is shorter' : 'every shorter lease corrupts the file' };
            },
          },
        ],
        hint: 'Without fencing, the lease is the only thing that can outlast a pause.',
        solution: { config: { lease: 30 }, why: 'Without fencing the lease must outlast the longest pause, and real pauses have no upper bound.' },
      },
      {
        id: 'fence-it', title: 'Safe and quick',
        blurb: 'Long pauses must not corrupt the file or stall client 2.',
        goal: 'Client 1 may freeze for up to 16 s. Never corrupt the file, and never make client 2 wait more than 15 s.',
        config: { fault: 'long', lease: 30, fence: 'off' }, knobs: ['lease', 'fence'],
        criteria: [
          { label: 'The file is never corrupted', metric: 'corrupt', max: 0 },
          { label: `Client 2 never waits over ${STUCK} s`, metric: 'stuck', max: 0 },
        ],
        hint: 'A long lease is safe but slow. What else could stop a stale write?',
        solution: { config: { lease: 10, fence: 'on' }, why: 'Fencing makes stale writes bounce, so a shorter lease is safe and hands over sooner.' },
      },
      {
        id: 'any-fault', title: 'Pause or crash, fastest handover',
        blurb: 'Survive pauses and crashes with the quickest handover.',
        goal: 'Client 1 either freezes for up to 16 s or crashes. Stay safe, and hand the lock to client 2 as fast as any safe setup can.',
        config: { fault: 'mixed', lease: 30, fence: 'off' }, knobs: ['lease', 'fence'],
        criteria: [
          { label: 'The file is never corrupted', metric: 'corrupt', max: 0 },
          {
            label: 'No safe setup hands over faster',
            test(cfg, ctx) {
              if (ctx.runAll(cfg).some((r) => r.stats.corrupt)) return { ok: false, text: 'first keep the file safe in every run' };
              const total = (c) => ctx.runAll(c).reduce((s, r) => s + r.stats.wait, 0);
              let best = null;
              LEASES.forEach((lease) => ['off', 'on'].forEach((fence) => {
                const c = Object.assign({}, cfg, { lease, fence });
                if (ctx.runAll(c).some((r) => r.stats.corrupt)) return;
                const t = total(c);
                if (!best || t < best.t) best = { t, lease, fence };
              }));
              const mine = total(cfg);
              const avg = (t) => r1(t / ctx.runAll(cfg).length);
              if (mine <= best.t) return { ok: true, text: `client 2 waits ${avg(mine)} s on average, the least` };
              return { ok: false, text: `${avg(mine)} s on average; a ${best.lease} s lease${best.fence === 'on' ? ' with fencing' : ''} needs ${avg(best.t)} s` };
            },
          },
        ],
        hint: 'Once stale writes bounce, what is a long lease still good for?',
        solution: { config: { lease: 5, fence: 'on' }, why: 'With fencing, safety no longer depends on the lease, so the shortest lease hands over fastest.' },
      },
    ],

    view,
  });

  /* ---------- view: four lanes on a 0–40 s timeline ---------- */
  const X0 = 104, XS = 11.2; // x of 0 s, px per second
  const LANE = { lock: 56, c1: 118, c2: 180, store: 242 };
  const SCALE = 140; // ms of animation per model second at 1×
  function view(el, v, api) {
    const box = v.wrap(el);
    const holder = v.h('div');
    box.appendChild(holder);
    const log = v.log(box, { title: 'What happened, newest first', max: 6 });
    const X = (t) => X0 + Math.min(40, t) * XS;
    let st, cursor, clock, spans, fileText;

    function draw() {
      holder.textContent = '';
      st = v.stage(holder, { w: 560, h: 300, label: 'A timeline: the lock service, two clients and storage' });
      [['lock', 'Lock service'], ['c1', 'Client 1'], ['c2', 'Client 2'], ['store', 'Storage']].forEach(([k, name]) => {
        st.text(10, LANE[k] + 5, name, { size: 14, anchor: 'start', weight: 700, kind: 'text2' });
        st.line(X0, LANE[k], 552, LANE[k], { width: 1.5, kind: 'muted' });
      });
      [0, 10, 20, 30, 40].forEach((t) => st.text(X(t), 290, `${t} s`, { size: 14, kind: 'muted', mono: true }));
      cursor = st.line(X0, 30, X0, 262, { kind: 'primary', dashed: true, width: 1.5, layer: 'top' });
      clock = st.text(552, 18, 't = 0 s', { size: 14, kind: 'muted', anchor: 'end', mono: true });
      // the file's fate sits under the Storage label, clear of the write marks on the lane
      fileText = st.text(10, LANE.store + 26, '', { size: 14, anchor: 'start', weight: 700, kind: 'good' });
    }

    // bars that grow with time: leases held, the pause, the zombie stretch, client 2 waiting
    function makeSpans(trace, cfg) {
      spans = [];
      const add = (lane, from, to, kind, o) => {
        if (to <= from) return;
        const y = LANE[lane] + (o && o.onLane ? -9 : -26);
        const r = st.rect(X(from), y, 0, o && o.onLane ? 18 : 12, { kind, rx: 5, label: o && o.label ? '' : null, size: 14 });
        spans.push({ r, from, to, label: o && o.label });
      };
      const get = (type, f) => trace.find((e) => e.type === type && (!f || f(e)));
      const g1 = get('grant', (e) => e.to === 1);
      const g2 = get('grant', (e) => e.to === 2);
      const rel1 = get('release', (e) => e.from === 1);
      const exp = get('expire');
      const pause = get('pause');
      const lost = get('lost');
      const end1 = rel1 ? rel1.t : exp.t;
      add('c1', g1.t, end1, 'good');
      if (pause) add('c1', pause.t, pause.until, 'warn', { onLane: true, label: 'paused' });
      // the zombie stretch: client 1 still thinks it holds the lease after the lock service gave it away
      if (exp && pause && pause.until > exp.t) add('c1', exp.t, lost ? lost.t : pause.until + 0.1, 'bad');
      add('c2', WANTS, g2.t, 'ghost', { onLane: true, label: 'waiting' });
      add('c2', g2.t, g2.t + 1, 'good');
    }
    function grow(t) {
      spans.forEach((s) => {
        const w = Math.max(0, X(Math.min(Math.max(t, s.from), s.to)) - X(s.from));
        s.r.set({ w, label: s.label && w > 64 ? s.label : '' });
      });
      cursor.set({ x1: X(t), x2: X(t) });
      clock.set(`t = ${t.toFixed(1)} s`);
    }

    function mark(e, cfg, animate) {
      if (e.type === 'grant') {
        const lane = e.to === 1 ? 'c1' : 'c2';
        const put = () => st.text(X(e.t) + 3, LANE[lane] - 32, `#${e.token}`, { size: 14, anchor: 'start', mono: true, kind: 'good', weight: 700 });
        log.add(`Client ${e.to} gets the lease with token #${e.token}, until ${e.until.toFixed(1)} s`, 'good');
        if (!animate) { put(); return null; }
        // the lock service hands the token down to the client's lane
        return st.send({ x: X(e.t), y: LANE.lock }, { x: X(e.t), y: LANE[lane] }, { label: `#${e.token}`, kind: 'good', dur: api.pace(420) }).then(put);
      } else if (e.type === 'pause') log.add(`Client 1 freezes for ${e.secs} s, right after checking its lease`, 'warn');
      else if (e.type === 'crash') {
        st.text(X(e.t), LANE.c1 + 5, '✕', { size: 18, kind: 'bad', weight: 800 });
        log.add('Client 1 crashes while holding the lease', 'bad');
      } else if (e.type === 'expire') {
        st.text(X(e.t), LANE.lock - 10, 'expired', { size: 14, kind: 'warn', weight: 700 });
        log.add(`Lease #${e.token} expires at ${e.t.toFixed(1)} s`, 'warn');
      } else if (e.type === 'lost') log.add('Client 1 checks its clock: the lease is gone, so it stops', 'info');
      else if (e.type === 'write') {
        const lane = e.from === 1 ? 'c1' : 'c2';
        const kind = e.result === 'ok' ? 'good' : e.result === 'fenced' ? 'warn' : 'bad';
        const sign = e.result === 'ok' ? '✓' : '✕';
        const put = () => {
          // client 1's writes are marked above the storage line and client 2's below, so close writes don't collide
          st.text(X(e.t), LANE.store + (e.from === 1 ? -8 : 20), `#${e.token} ${sign}`, { size: 14, kind, weight: 700, mono: true });
          if (e.result === 'corrupt') fileText.set('corrupted', 'bad');
          else if (e.result === 'fenced') fileText.set(`${OLD} < ${NEW}`, 'warn');
        };
        if (e.result === 'corrupt') log.add(`Client 1 wakes and writes with #${e.token}: storage accepts it over #${NEW}`, 'bad');
        else if (e.result === 'fenced') log.add(`Client 1 wakes and writes with #${e.token}: rejected, storage has seen #${NEW}`, 'good');
        else log.add(`Client ${e.from} writes with #${e.token} ✓`, 'info');
        if (!animate) { put(); return null; }
        return st.send({ x: X(e.t), y: LANE[lane] }, { x: X(e.t), y: LANE.store }, { label: `#${e.token}`, kind: e.result === 'ok' ? 'data' : kind, dur: api.pace(420) }).then(put);
      }
      return null;
    }

    function render(result, cfg, input, o) {
      v.restart();
      draw();
      log.clear();
      const trace = result.trace;
      makeSpans(trace, cfg);
      grow(0);
      if (o.preview) return Promise.resolve();
      if (!o.animate) {
        const done = trace[trace.length - 1];
        trace.forEach((e) => mark(e, cfg, false));
        grow(done.t);
        clock.set(`t = ${done.t.toFixed(1)} s, done`);
        if (!done.corrupt && !fileText.el.textContent) fileText.set('file safe', 'good');
        return Promise.resolve();
      }
      return animate(trace, cfg);
    }
    async function animate(trace, cfg) {
      let now = 0;
      for (const e of trace) {
        if (e.t > now) {
          const from = now;
          await v.tween(api.pace((e.t - from) * SCALE), (k) => grow(from + (e.t - from) * k), (k) => k);
          now = e.t;
        }
        if (e.type === 'done') {
          clock.set(`t = ${e.t.toFixed(1)} s, done`);
          if (!e.corrupt && !fileText.el.textContent) fileText.set('file safe', 'good');
        } else {
          const p = mark(e, cfg, true);
          if (p) await p;
        }
      }
    }
    return { render };
  }

  DDIA.labs.leasesModel = { run, OLD, NEW, WANTS, STUCK, LEASES };
})();
