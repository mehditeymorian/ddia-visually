/* Playground — Quorum lab: leaderless replication with w and r (chapters 5 and 9).
 * Pure model on DDIA.sim + a view that replays the trace. See LABS.md.
 */
(function () {
  'use strict';
  const DDIA = window.DDIA;

  /* ---------- workload and timing (virtual ms) ---------- */
  const WRITES = [0, 250, 500, 750];                 // the writer sets x = 1..4, one write at a time
  const READ_START = 50, READ_EVERY = 90, READ_UNTIL = 1900; // the reader polls x; skips a poll while a read is in flight
  const TIMEOUT = 600;                                // per quorum phase: longer than the slowest round trip
  const LAG = 800;                                    // a lagging replica applies writes this late (never within a timeout)
  const BACK_AT = 1000;                               // a recovering replica rejoins here, with old data
  const LATENCY = {
    calm: [10, 40],
    // most messages are quick, but 1 in 4 hits the tail: that is when replicas disagree
    jittery: (rng) => (rng.chance(0.25) ? rng.int(150, 250) : rng.int(5, 40)),
  };
  const SLOT_STATES = ['up', 'lag', 'rec', 'down'];
  const SEEDS = Array.from({ length: 100 }, (_, i) => i + 1);
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

  function downFn(cfg) {
    return (node, t) => {
      if (typeof node !== 'number') return false; // clients never crash here
      const s = cfg.slots[node];
      return s === 'down' || (s === 'rec' && t < BACK_AT);
    };
  }

  /* ---------- model ---------- */
  const model = {
    init(ctx, cfg) {
      const s = {
        cfg,
        net: DDIA.sim.net(ctx, { latency: LATENCY[cfg.net], isDown: downFn(cfg) }),
        reps: cfg.slots.map((st, i) => ({ id: i, ver: 0, state: st })),
        ops: [],
        writing: null, writeQ: [],
        reading: null,
        okVer: 0,          // newest version whose write already succeeded
        lastReadVer: 0,    // newest version any earlier read returned
        failedVers: new Set(),
      };
      ctx.emit('init', { slots: cfg.slots.slice() });
      WRITES.forEach((t, i) => ctx.at(t, 'wantWrite', { ver: i + 1 }));
      for (let t = READ_START; t <= READ_UNTIL; t += READ_EVERY) ctx.at(t, 'wantRead');
      cfg.slots.forEach((st, i) => { if (st === 'rec') ctx.at(BACK_AT, 'back', { rep: i }); });
      return s;
    },

    handle(ctx, s, ev) {
      const d = ev.data;
      switch (ev.type) {
        case 'wantWrite': if (s.writing) s.writeQ.push(d.ver); else startWrite(ctx, s, d.ver); break;
        case 'wantRead': if (!s.reading) startRead(ctx, s); else ctx.emit('skip', {}); break;
        case 'back': ctx.emit('back', { rep: d.rep }); break;
        case 'apply': applyWrite(ctx, s, d.rep, d.msg, d.from); break;
        case 'wtimeout': { const op = s.ops[d.op]; if (!op.done) finishWrite(ctx, s, op, false); break; }
        case 'rtimeout': { const op = s.ops[d.op]; if (!op.done && op.phase === d.phase) finishRead(ctx, s, op, false); break; }
        case 'deliver': {
          if (!s.net.arrived(ev)) break;
          const m = d.payload;
          if (typeof d.to === 'number') onReplica(ctx, s, d.to, m, d.from);
          else if (m.type === 'ack') onAck(ctx, s, s.ops[m.op], d.from);
          else if (m.type === 'val') onVal(ctx, s, s.ops[m.op], d.from, m.ver);
          break;
        }
      }
    },

    finish(ctx, s) {
      const reads = s.ops.filter((o) => o.kind === 'r');
      const ok = s.ops.filter((o) => o.ok);
      return {
        stale: reads.filter((o) => o.stale).length,
        backInTime: reads.filter((o) => o.back).length,
        failed: s.ops.filter((o) => o.done && !o.ok).length,
        slowest: ok.length ? Math.max(...ok.map((o) => o.end - o.start)) : 0,
        reads: reads.length,
        writes: s.ops.length - reads.length,
      };
    },
  };

  function newOp(ctx, s, kind, extra) {
    const op = Object.assign({ id: s.ops.length, kind, start: ctx.now, done: false }, extra);
    s.ops.push(op);
    return op;
  }

  /* writes: send to every replica, succeed after w acks */
  function startWrite(ctx, s, ver) {
    const op = newOp(ctx, s, 'w', { ver, acks: new Set() });
    s.writing = op;
    ctx.emit('opstart', { op: op.id, kind: 'w', ver });
    s.reps.forEach((r) => s.net.send('W', r.id, { type: 'write', op: op.id, ver }));
    ctx.schedule(TIMEOUT, 'wtimeout', { op: op.id });
  }
  function finishWrite(ctx, s, op, ok) {
    Object.assign(op, { done: true, ok, end: ctx.now });
    if (ok) s.okVer = Math.max(s.okVer, op.ver); else s.failedVers.add(op.ver);
    ctx.emit('opdone', { op: op.id, kind: 'w', ok, ver: op.ver, ms: op.end - op.start, acks: op.acks.size });
    s.writing = null;
    if (s.writeQ.length) startWrite(ctx, s, s.writeQ.shift());
  }

  /* replicas: apply writes (late if lagging) and ack; answer reads at once */
  function onReplica(ctx, s, id, m, from) {
    if (m.type === 'read') { s.net.send(id, from, { type: 'val', op: m.op, ver: s.reps[id].ver }); return; }
    if (s.reps[id].state === 'lag') ctx.schedule(LAG, 'apply', { rep: id, msg: m, from });
    else applyWrite(ctx, s, id, m, from);
  }
  function applyWrite(ctx, s, id, m, from) {
    const rep = s.reps[id];
    if (m.ver > rep.ver) { rep.ver = m.ver; ctx.emit('apply', { rep: id, ver: m.ver, repair: !!m.repair }); }
    s.net.send(id, from, { type: 'ack', op: m.op, ver: m.ver });
  }

  function onAck(ctx, s, op, from) {
    if (op.kind === 'w') {
      if (op.done) return;
      op.acks.add(from);
      if (op.acks.size >= s.cfg.w) finishWrite(ctx, s, op, true);
    } else if (!op.done && op.phase === 'repair') {
      op.holders.add(from);
      if (op.holders.size >= s.cfg.w) finishRead(ctx, s, op, true);
    }
  }

  /* reads: ask every replica, answer with the newest of the first r replies */
  function startRead(ctx, s) {
    const op = newOp(ctx, s, 'r', { minVer: s.okVer, replies: [], phase: 'read', ver: 0, repaired: new Set() });
    s.reading = op;
    ctx.emit('opstart', { op: op.id, kind: 'r' });
    s.reps.forEach((r) => s.net.send('R', r.id, { type: 'read', op: op.id }));
    ctx.schedule(TIMEOUT, 'rtimeout', { op: op.id, phase: 'read' });
  }
  function onVal(ctx, s, op, from, ver) {
    op.replies.push({ from, ver });
    if (op.done) { if (s.cfg.repair === 'async' && op.ok && ver < op.ver) repairTo(ctx, s, op, from); return; }
    if (op.phase !== 'read' || op.replies.length < s.cfg.r) return;
    op.ver = Math.max(...op.replies.map((x) => x.ver));
    if (s.cfg.repair === 'sync' && op.ver > 0) {
      // Before replying, make sure the value is on w replicas, so no later read can miss it.
      op.holders = new Set(op.replies.filter((x) => x.ver >= op.ver).map((x) => x.from));
      if (op.holders.size >= s.cfg.w) { finishRead(ctx, s, op, true); return; }
      op.phase = 'repair';
      ctx.emit('repair', { op: op.id, ver: op.ver });
      s.reps.forEach((r) => { if (!op.holders.has(r.id)) s.net.send('R', r.id, { type: 'write', op: op.id, ver: op.ver, repair: true }); });
      ctx.schedule(TIMEOUT, 'rtimeout', { op: op.id, phase: 'repair' });
      return;
    }
    finishRead(ctx, s, op, true);
    if (s.cfg.repair === 'async') op.replies.forEach((x) => { if (x.ver < op.ver) repairTo(ctx, s, op, x.from); });
  }
  function repairTo(ctx, s, op, rep) {
    if (op.repaired.has(rep)) return;
    op.repaired.add(rep);
    s.net.send('R', rep, { type: 'write', op: op.id, ver: op.ver, repair: true });
  }
  function finishRead(ctx, s, op, ok) {
    Object.assign(op, { done: true, ok, end: ctx.now });
    if (ok) {
      op.stale = op.ver < op.minVer;
      op.back = op.ver < s.lastReadVer;
      s.lastReadVer = Math.max(s.lastReadVer, op.ver);
    }
    ctx.emit('opdone', {
      op: op.id, kind: 'r', ok, ver: op.ver, ms: op.end - op.start, stale: !!op.stale, back: !!op.back,
      expected: op.minVer, ghost: ok && s.failedVers.has(op.ver),
    });
    s.reading = null;
  }

  /* ---------- the lab ---------- */
  const num = (v) => ({ value: v, label: String(v) });
  DDIA.lab({
    id: 'quorum',
    title: 'Quorum lab',
    short: 'Quorums',
    tagline: 'Tune w and r, break replicas, catch stale reads',
    chapters: [5, 9],
    styles: ['knobs', 'builder', 'challenges'],
    knobs: [
      { id: 'n', label: 'Replicas n', options: [num(3), num(5)] },
      { id: 'w', label: 'Write quorum w', options: [1, 2, 3, 4, 5].map(num) },
      { id: 'r', label: 'Read quorum r', options: [1, 2, 3, 4, 5].map(num) },
      { id: 'repair', label: 'Read repair', options: [{ value: 'off', label: 'Off' }, { value: 'async', label: 'After reply' }, { value: 'sync', label: 'Before reply' }] },
      { id: 'net', label: 'Network', options: [{ value: 'calm', label: 'Calm' }, { value: 'jittery', label: 'Jittery' }] },
    ],
    slots: {
      label: 'Replicas',
      max: 5,
      states: [
        { value: 'up', label: 'Healthy', kind: 'good' },
        { value: 'lag', label: 'Lagging', kind: 'warn' },
        { value: 'rec', label: 'Recovering', kind: 'info' },
        { value: 'down', label: 'Down', kind: 'bad' },
      ],
    },
    defaults: { n: 3, w: 2, r: 2, repair: 'off', net: 'calm', slots: ['up', 'up', 'up'] },
    normalize(c) {
      c.n = Number(c.n) === 5 ? 5 : 3;
      c.w = clamp(Math.round(Number(c.w)) || 1, 1, c.n);
      c.r = clamp(Math.round(Number(c.r)) || 1, 1, c.n);
      if (!['off', 'async', 'sync'].includes(c.repair)) c.repair = 'off';
      if (!LATENCY[c.net]) c.net = 'calm';
      const slots = Array.isArray(c.slots) ? c.slots : [];
      c.slots = Array.from({ length: c.n }, (_, i) => (SLOT_STATES.includes(slots[i]) ? slots[i] : 'up'));
      return c;
    },
    disabled: (cfg, knob, value) => (knob === 'w' || knob === 'r') && value > cfg.n,
    describe: (cfg) => `n = ${cfg.n}, w = ${cfg.w}, r = ${cfg.r}`,

    run: (cfg, seed) => DDIA.sim.run(model, cfg, seed),
    defaultInput: () => 1,
    samples: () => SEEDS,
    nextInput: (cfg, seed) => (seed % SEEDS.length) + 1,
    nextLabel: 'Next run',
    inputKey: String,
    parseInput: (s) => { const x = parseInt(s, 10); return x >= 1 && x <= 100000 ? x : null; },
    inputLabel: (seed) => `run #${seed}`,
    sampleNoun: ['run', 'runs'],

    metrics: [
      { id: 'stale', label: 'Stale reads', kind: 'bad' },
      { id: 'backInTime', label: 'Back in time', kind: 'bad' },
      { id: 'failed', label: 'Failed ops', kind: 'warn' },
      { id: 'slowest', label: 'Slowest op', kind: 'neutral', plain: true, fmt: (v) => `${v} ms` },
    ],
    classify(st) {
      if (st.stale) return { kind: 'bad', label: 'stale reads' };
      if (st.backInTime) return { kind: 'bad', label: 'back in time' };
      if (st.failed) return { kind: 'warn', label: 'failed ops' };
      return { kind: 'good', label: 'clean' };
    },

    presets: [
      {
        id: 'basics', title: 'Quorum basics',
        config: { n: 3, w: 2, r: 2, slots: ['up', 'up', 'rec'] }, knobs: ['w', 'r'],
        nudge: 'Replica 3 missed every write. Now drop r to 1.',
        predict: { q: 'w = 2, r = 2, and replica 3 rejoins with old data. Will any read be stale?', metric: 'stale' },
      },
      {
        id: 'stale-read', title: 'Lagging replica',
        config: { n: 3, w: 1, r: 1, slots: ['up', 'up', 'lag'] }, knobs: ['w', 'r', 'net'],
        nudge: 'Raise w or r until the stale reads stop.',
        predict: { q: 'w = 1, r = 1, and replica 3 applies writes late. Will reads be stale?', metric: 'stale' },
      },
      {
        id: 'read-repair', title: 'Read repair',
        config: { n: 3, w: 1, r: 1, slots: ['up', 'up', 'rec'], repair: 'off' }, knobs: ['repair', 'r'],
        nudge: 'Switch read repair on and watch replica 3 heal.',
        predict: { q: 'With read repair, a read that spots old data fixes that replica. Can reads still be stale?', metric: 'stale', config: { repair: 'async' } },
      },
      {
        id: 'back-in-time', title: 'Back in time',
        config: { n: 3, w: 2, r: 2, net: 'jittery' }, knobs: ['repair', 'net'], input: 46, // a run where it happens
        nudge: 'Set read repair to "Before reply", then replay.',
        predict: { q: 'w + r > n on a jittery network. Can a read return older data than the read before it?', metric: 'backInTime' },
      },
      {
        id: 'availability', title: 'Availability',
        config: { n: 5, w: 3, r: 3, slots: ['up', 'up', 'up', 'down', 'down'] }, knobs: ['w', 'r'],
        nudge: 'Click a third replica until it is down.',
        predict: { q: 'Two of five replicas are down, w = 3, r = 3. Will any write or read fail?', metric: 'failed' },
      },
      {
        id: 'free-play', title: 'Free play',
        config: { n: 5, w: 3, r: 3 }, knobs: ['n', 'w', 'r'],
        nudge: 'Everything is unlocked. Click replicas to break them.',
      },
    ],

    challenges: [
      {
        id: 'missed-writes', title: 'Missed writes, zero stale',
        goal: 'Replica 3 misses every write, then rejoins. Serve no stale reads and fail nothing.',
        config: { n: 3, w: 1, r: 1, slots: ['up', 'up', 'rec'] }, knobs: ['w', 'r', 'repair'],
        criteria: [
          { label: 'No stale reads', metric: 'stale', max: 0 },
          { label: 'No failed writes or reads', metric: 'failed', max: 0 },
        ],
        hint: 'Read quorums must overlap write quorums, but only two replicas are up at first.',
        solution: { config: { w: 2, r: 2 } },
      },
      {
        id: 'never-back', title: 'Never back in time',
        goal: 'On a jittery network, no read may be stale or older than the read before it, and nothing may fail.',
        config: { n: 3, w: 1, r: 1, net: 'jittery' }, knobs: ['w', 'r', 'repair'],
        criteria: [
          { label: 'No stale reads', metric: 'stale', max: 0 },
          { label: 'No read goes back in time', metric: 'backInTime', max: 0 },
          { label: 'No failed writes or reads', metric: 'failed', max: 0 },
        ],
        hint: 'Overlap is not enough: a reader must spread what it saw before it replies.',
        solution: { config: { w: 2, r: 2, repair: 'sync' } },
      },
      {
        id: 'two-down', title: 'Two down, one lagging',
        goal: 'Five replicas: two are down and one lags. Stay available and never serve stale data.',
        config: { n: 5, w: 3, r: 2, slots: ['up', 'up', 'lag', 'down', 'down'] }, knobs: ['w', 'r'],
        criteria: [
          { label: 'No failed writes or reads', metric: 'failed', max: 0 },
          { label: 'No stale reads', metric: 'stale', max: 0 },
        ],
        hint: 'A write that waits for the lagging replica times out. Which replicas can it count on?',
        solution: { config: { w: 2, r: 2 } },
      },
    ],

    view: (el, v, api) => ({ render: () => Promise.resolve() }),
  });

  DDIA.labs.quorumModel = { model, WRITES, TIMEOUT, LAG, BACK_AT };
})();
