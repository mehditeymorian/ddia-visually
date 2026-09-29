#!/usr/bin/env node
// Unit tests for the playground engine and the lab models (no browser needed).
// Usage: node scripts/labtest.mjs            Exit code 1 when any test fails.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
globalThis.window = globalThis;
const loadErrors = [];
const origError = console.error;
console.error = (...a) => { loadErrors.push(a.map(String).join(' ')); };
for (const f of ['js/sim.js', 'js/lab.js', 'js/lab-nav.js', 'js/labs/quorum.js', 'js/labs/isolation.js', 'js/labs/partition.js', 'js/labs/leases.js', 'js/labs/clocks.js', 'js/labs/storage.js', 'js/labs/streams.js', 'js/labs/consensus.js']) {
  try { vm.runInThisContext(readFileSync(join(root, f), 'utf8'), { filename: f }); } catch (e) { loadErrors.push(`${f}: ${e.message}`); }
}
console.error = origError;
const DDIA = globalThis.DDIA || {};

const results = [];
function test(name, fn) {
  const t0 = performance.now();
  try { fn(); results.push({ name, ok: true, ms: performance.now() - t0 }); } catch (e) { results.push({ name, ok: false, err: e }); }
}

/* ---------- sim core ---------- */
test('scripts load without errors', () => assert.deepEqual(loadErrors, []));

test('rng is deterministic per seed', () => {
  const a = DDIA.sim.rng(7), b = DDIA.sim.rng(7), c = DDIA.sim.rng(8);
  const xs = [a.next(), a.next(), a.next()];
  assert.deepEqual(xs, [b.next(), b.next(), b.next()]);
  assert.notDeepEqual(xs, [c.next(), c.next(), c.next()]);
  for (let i = 0; i < 1000; i++) { const k = a.int(3, 5); assert.ok(k >= 3 && k <= 5); }
});

test('events run in (time, sequence) order', () => {
  const model = {
    init(ctx) { ctx.schedule(20, 'b'); ctx.schedule(10, 'a'); ctx.schedule(20, 'c'); return { seen: [] }; },
    handle(ctx, s, ev) { s.seen.push(ev.type + '@' + ctx.now); ctx.emit(ev.type); },
    finish(ctx, s) { return { order: s.seen.join(' ') }; },
  };
  assert.equal(DDIA.sim.run(model, {}, 1).stats.order, 'a@10 b@20 c@20');
});

test('run is deterministic and capped', () => {
  const model = { init(ctx) { ctx.schedule(ctx.rng.int(1, 9), 'x'); return {}; }, handle(ctx) { ctx.emit('x', { r: ctx.rng.next() }); } };
  assert.deepEqual(DDIA.sim.run(model, {}, 3).trace, DDIA.sim.run(model, {}, 3).trace);
  const loop = { init(ctx) { ctx.schedule(1, 'x'); return {}; }, handle(ctx) { ctx.schedule(1, 'x'); } };
  assert.throws(() => DDIA.sim.run(loop, {}, 1), /ran away/);
});

test('net drops messages to down nodes and emits send with arrive time', () => {
  const model = {
    init(ctx) {
      const s = { net: DDIA.sim.net(ctx, { latency: [5, 5], isDown: (n) => n === 'dead' }), got: [] };
      s.net.send('a', 'b', 1);
      s.net.send('a', 'dead', 2);
      return s;
    },
    handle(ctx, s, ev) { if (ev.type === 'deliver' && s.net.arrived(ev)) s.got.push(ev.data.payload); },
    finish(ctx, s) { return { got: s.got }; },
  };
  const r = DDIA.sim.run(model, {}, 1);
  assert.deepEqual(r.stats.got, [1]);
  assert.equal(r.trace.filter((e) => e.type === 'send')[0].arrive, 5);
  assert.equal(r.trace.filter((e) => e.type === 'drop').length, 1);
});

/* ---------- lab registry + pure helpers ---------- */
const miniLab = (over) => Object.assign({
  id: 'x', title: 'X', chapters: [1],
  knobs: [{ id: 'a', label: 'A', options: [{ value: 1, label: '1' }, { value: 2, label: '2' }] }],
  defaults: { a: 1 }, run: (cfg, input) => ({ trace: [], stats: { bad: cfg.a === 2 && input > 1 ? 1 : 0 } }),
  defaultInput: () => 1, samples: () => [1, 2, 3], inputKey: String, parseInput: Number, inputLabel: String, sampleNoun: ['run', 'runs'],
  metrics: [{ id: 'bad', label: 'Bad', kind: 'bad' }], classify: () => ({ kind: 'good', label: 'ok' }), view: () => ({ render() {} }),
  sketch: () => '<svg viewBox="0 0 10 10"></svg>',
  presets: [{ id: 'p', title: 'P', blurb: 'Is it bad?', config: {}, knobs: ['a'], nudge: 'Try it.', predict: { q: 'Bad?', metric: 'bad' } }],
}, over);

test('validate enforces the bounding rules', () => {
  const base = miniLab();
  assert.deepEqual(DDIA.lab.validate(base), []);
  const opts = base.knobs[0].options;
  const many = miniLab({ knobs: Array.from({ length: 8 }, (_, i) => ({ id: 'k' + i, label: 'K', options: opts })), defaults: Object.fromEntries(Array.from({ length: 8 }, (_, i) => ['k' + i, 1])), presets: [{ id: 'p', title: 'P', config: {}, knobs: [], nudge: 'x' }] });
  assert.match(DDIA.lab.validate(many).join(), /at most 7 knobs/);
  const oneOpt = miniLab({ knobs: [{ id: 'a', label: 'A', options: [opts[0]] }] });
  assert.match(DDIA.lab.validate(oneOpt).join(), /2–5 options/);
  const wide = miniLab({ presets: [{ id: 'p', title: 'P', config: {}, knobs: ['a', 'a', 'a', 'a'], nudge: 'x' }] });
  assert.match(DDIA.lab.validate(wide).join(), /at most 3 knobs/);
  const wordy = miniLab({ presets: [{ id: 'p', title: 'P', config: {}, knobs: [], nudge: 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen' }] });
  assert.match(DDIA.lab.validate(wordy).join(), /nudge/);
  const slots = miniLab({ slots: { label: 'Slots', max: 6, states: [{ value: 'a' }, { value: 'b' }, { value: 'c' }, { value: 'd' }, { value: 'e' }] } });
  assert.match(DDIA.lab.validate(slots).join(), /at most 5 slots/);
  assert.match(DDIA.lab.validate(slots).join(), /at most 4 states/);
});

test('predict: never / sometimes / always from the model', () => {
  const l = miniLab();
  assert.equal(DDIA.lab.predict(l, { a: 1 }, 'bad').answer, 0);
  const some = DDIA.lab.predict(l, { a: 2 }, 'bad');
  assert.equal(some.answer, 1); assert.equal(some.hits, 2); assert.equal(some.total, 3);
});

test('checkChallenge: all-sample, current-input and custom criteria', () => {
  const l = miniLab();
  const ch = { id: 'c', title: 'C', goal: 'g', config: { a: 2 }, knobs: ['a'], solution: { config: { a: 1 } }, criteria: [{ label: 'never bad', metric: 'bad', max: 0 }] };
  const r = DDIA.lab.checkChallenge(l, ch, { a: 2 }, 1);
  assert.equal(r.ok, false); assert.equal(r.results[0].failInput, 2); assert.match(r.results[0].text, /2 of 3 runs/);
  assert.equal(DDIA.lab.checkChallenge(l, ch, { a: 1 }, 1).ok, true);
  const cur = { criteria: [{ label: 'bad now', metric: 'bad', min: 1, scope: 'current' }] };
  assert.equal(DDIA.lab.checkChallenge(l, cur, { a: 2 }, 3).ok, true);
  assert.equal(DDIA.lab.checkChallenge(l, cur, { a: 2 }, 1).ok, false);
  const custom = { criteria: [{ label: 'custom', test: (cfg, ctx) => ({ ok: ctx.runAll(cfg).length === 3, text: 'three' }) }] };
  assert.deepEqual(DDIA.lab.checkChallenge(l, custom, { a: 1 }, 1).results[0].text, 'three');
});

test('configFor layers defaults, base and overrides, then normalizes', () => {
  const l = miniLab({ defaults: { a: 1, b: 5 }, normalize: (c) => Object.assign(c, { b: Math.min(c.b, 3) }) });
  assert.deepEqual(DDIA.lab.configFor(l, { a: 2 }, { b: 9 }), { a: 2, b: 3 });
  const d = DDIA.lab.configFor(l); d.a = 7;
  assert.equal(l.defaults.a, 1, 'defaults are not mutated');
});

test('interleavings keep each transaction in order', () => {
  const all = DDIA.lab.interleavings(3, 3);
  assert.equal(all.length, 20);
  all.forEach((o) => { assert.equal(o.filter((x) => x === 1).length, 3); assert.equal(o.length, 6); });
  assert.equal(new Set(all.map((o) => o.join(''))).size, 20);
  assert.equal(DDIA.lab.interleavings(5, 5).length, 252);
});

/* ---------- quorum lab ---------- */
const Q = () => DDIA.lab.get('quorum');
const qcfg = (o) => DDIA.lab.configFor(Q(), {}, o);
const qruns = (o, m) => DDIA.lab.runAll(Q(), qcfg(o)).filter((x) => x.stats[m] > 0).length;
const qsum = (o, m) => DDIA.lab.runAll(Q(), qcfg(o)).reduce((s, x) => s + x.stats[m], 0);

test('quorum: same seed, same trace', () => {
  const c = qcfg({ net: 'jittery' });
  assert.deepEqual(Q().run(c, 5).trace, Q().run(c, 5).trace);
  assert.notDeepEqual(Q().run(c, 5).trace, Q().run(c, 6).trace);
});

test('quorum: w + r > n never serves stale reads', () => {
  for (const slots of [['up', 'up', 'rec'], ['up', 'up', 'lag'], ['up', 'up', 'up']]) {
    for (const net of ['calm', 'jittery']) assert.equal(qruns({ n: 3, w: 2, r: 2, slots, net }, 'stale'), 0, slots + ' ' + net);
  }
  assert.equal(qruns({ n: 5, w: 3, r: 3, slots: ['up', 'up', 'lag', 'rec', 'up'], net: 'jittery' }, 'stale'), 0);
});

test('quorum: w1 r1 with a lagging replica is sometimes stale', () => {
  assert.ok(qruns({ n: 3, w: 1, r: 1, slots: ['up', 'up', 'lag'] }, 'stale') > 0);
});

test('quorum: w above the live replicas fails every run', () => {
  assert.equal(qruns({ n: 3, w: 3, r: 1, slots: ['up', 'up', 'down'] }, 'failed'), 100);
  assert.equal(qruns({ n: 3, w: 2, r: 2, slots: ['up', 'up', 'down'] }, 'failed'), 0);
});

test('quorum: jitter can send a quorum read back in time; sync repair cannot', () => {
  assert.ok(qruns({ n: 3, w: 2, r: 2, net: 'jittery' }, 'backInTime') > 0);
  assert.equal(qruns({ n: 3, w: 2, r: 2, net: 'jittery', repair: 'sync' }, 'backInTime'), 0);
  assert.equal(qruns({ n: 3, w: 2, r: 2, net: 'jittery', repair: 'sync' }, 'failed'), 0);
});

test('quorum: async read repair heals a recovering replica', () => {
  const base = { n: 3, w: 1, r: 1, slots: ['up', 'up', 'rec'] };
  const off = qsum(Object.assign({ repair: 'off' }, base), 'stale');
  const on = qsum(Object.assign({ repair: 'async' }, base), 'stale');
  assert.ok(off > 0, 'stale without repair');
  assert.ok(on < off / 3, `repair cuts stale reads (${off} → ${on})`);
});

test('quorum: the back-in-time preset opens on a run that shows it', () => {
  const p = Q().presets.find((x) => x.id === 'back-in-time');
  assert.ok(Q().run(DDIA.lab.configFor(Q(), p.config), p.input).stats.backInTime > 0);
});

test('quorum: normalize clamps w and r to n and sizes slots', () => {
  const c = qcfg({ n: 3, w: 5, r: 4, slots: ['up'] });
  assert.equal(c.w, 3); assert.equal(c.r, 3); assert.deepEqual(c.slots, ['up', 'up', 'up']);
  assert.equal(qcfg({ n: 5, slots: ['down', 'bogus'] }).slots.join(), 'down,up,up,up,up');
});

/* ---------- isolation lab ---------- */
const I = () => DDIA.lab.get('isolation');
const ipreset = (id) => I().presets.find((x) => x.id === id);
const icfg = (id, o) => DDIA.lab.configFor(I(), ipreset(id).config, o);
const ibad = (id, o) => DDIA.lab.runAll(I(), icfg(id, o)).filter((x) => x.stats.anomaly).length;

test('isolation: each scenario breaks at its weak level and is fixed at its fix level', () => {
  const table = [
    ['dirty-read', { iso: 'none', t1end: 'abort' }, { iso: 'rc', t1end: 'abort' }],
    ['dirty-write', { iso: 'none' }, { iso: 'rc' }],
    ['read-skew', { iso: 'rc' }, { iso: 'si' }],
    ['lost-update', { iso: 'rc' }, { iso: 'si' }],
    ['lost-update', { iso: 'rc' }, { iso: 'ssi' }],
    ['lost-update', { iso: 'rc' }, { iso: '2pl' }],
    ['write-skew', { iso: 'si' }, { iso: 'ssi' }],
    ['write-skew', { iso: 'si' }, { iso: '2pl' }],
    ['write-skew', { iso: 'si' }, { iso: 'rc', lock: 'rows' }],
    ['phantom', { iso: 'si' }, { iso: 'ssi' }],
    ['phantom', { iso: 'si' }, { iso: '2pl' }],
  ];
  for (const [p, weak, fix] of table) {
    assert.ok(ibad(p, weak) > 0, `${p} should break at ${JSON.stringify(weak)}`);
    assert.equal(ibad(p, fix), 0, `${p} should be safe at ${JSON.stringify(fix)}`);
  }
  assert.ok(ibad('phantom', { iso: 'si', lock: 'rows' }) > 0, 'locking existing rows cannot stop a phantom');
  assert.ok(ibad('write-skew', { iso: 'rc' }) > 0, 'read committed allows write skew');
});

test('isolation: serial orders are safe at every level', () => {
  for (const p of I().presets) {
    for (const level of ['none', 'rc', 'si', 'ssi', '2pl']) {
      for (const lock of ['off', 'rows']) {
        const c = DDIA.lab.configFor(I(), p.config, { iso: level, lock });
        const [a, b] = I().stepCounts(c);
        for (const order of [[...Array(a).fill(1), ...Array(b).fill(2)], [...Array(b).fill(2), ...Array(a).fill(1)]]) {
          const r = I().run(c, order);
          assert.equal(r.stats.anomaly, 0, `${p.id} ${level} ${lock} ${order.join('')}`);
          assert.equal(r.stats.aborts, 0, `${p.id} ${level} ${lock} ${order.join('')} aborts`);
        }
      }
    }
  }
});

test('isolation: 2PL turns lost updates into a deadlock abort', () => {
  const r = I().run(icfg('lost-update', { iso: '2pl' }), [1, 2, 1, 2, 1, 2]);
  assert.equal(r.stats.anomaly, 0);
  assert.equal(r.stats.aborts, 1);
  assert.ok(r.trace.some((e) => /deadlock/.test(e.text || '')), 'mentions the deadlock');
});

test('isolation: snapshot isolation aborts the second writer (first updater wins)', () => {
  const r = I().run(icfg('lost-update', { iso: 'si' }), [1, 2, 1, 1, 2, 2]);
  assert.equal(r.stats.anomaly, 0);
  assert.equal(r.stats.aborts, 1);
  assert.equal(r.state.txs[2].status, 'aborted');
  assert.equal(r.state.txs[1].status, 'committed');
});

test('isolation: read committed makes the second writer wait for the lock', () => {
  const r = I().run(icfg('dirty-write', { iso: 'rc' }), [1, 2, 2, 2, 1, 1]);
  assert.equal(r.stats.anomaly, 0);
  assert.ok(r.stats.waits > 0);
});

test('isolation: preset orders show the anomaly at the preset level', () => {
  for (const p of I().presets) {
    const c = DDIA.lab.configFor(I(), p.config);
    assert.equal(I().run(c, I().defaultInput(c)).stats.anomaly, 1, p.id);
  }
});

test('isolation: parseInput accepts only valid interleavings', () => {
  const c = icfg('lost-update');
  assert.deepEqual(I().parseInput('121212', c), [1, 2, 1, 2, 1, 2]);
  assert.equal(I().parseInput('111111', c), null);
  assert.equal(I().parseInput('12x', c), null);
});

test('isolation: SSI lets a read-only transaction commit', () => {
  const r = I().run(icfg('read-skew', { iso: 'ssi' }), [2, 1, 1, 1, 2, 2]);
  assert.equal(r.stats.anomaly, 0);
  assert.equal(r.stats.aborts, 0);
});

test('isolation: 2PL keeps its predicate lock when FOR UPDATE is on (no phantoms)', () => {
  assert.equal(ibad('phantom', { iso: '2pl', lock: 'rows' }), 0);
  assert.equal(ibad('write-skew', { iso: '2pl', lock: 'rows' }), 0);
  assert.equal(ibad('lost-update', { iso: '2pl', lock: 'rows' }), 0);
});

test('isolation: the verdict names the anomaly that actually happened', () => {
  const lost = I().run(icfg('lost-update', { iso: 'none', t1end: 'abort' }), [1, 1, 2, 2, 2, 1]);
  assert.equal(lost.stats.anomaly, 1);
  assert.equal(lost.stats.anomalyName, 'dirty read');
  assert.match(lost.trace.find((e) => e.type === 'verdict').text, /^Dirty read: T2 used likes from T1/);
  const skew = I().run(icfg('write-skew', { iso: 'none', t1end: 'abort' }), [1, 1, 2, 2, 2, 1]);
  if (skew.stats.anomaly) assert.doesNotMatch(skew.trace.find((e) => e.type === 'verdict').text, /Nobody is on call/);
  const real = I().run(icfg('lost-update'), [1, 2, 1, 1, 2, 2]);
  assert.equal(real.stats.anomalyName, 'lost update');
});

test('isolation: "fewest aborts" does not tick its second box for an unsafe design', () => {
  const ch = I().challenges.find((c) => c.id === 'fewest-aborts');
  const res = DDIA.lab.checkChallenge(I(), ch, DDIA.lab.configFor(I(), ch.config), [1, 2, 1, 2, 1, 2]);
  assert.deepEqual(res.results.map((r) => r.ok), [false, false]);
});

test('quorum: challenges reject designs that only pass by luck', () => {
  const check = (id, over) => {
    const ch = Q().challenges.find((c) => c.id === id);
    return DDIA.lab.checkChallenge(Q(), ch, DDIA.lab.configFor(Q(), ch.config, over), 1).ok;
  };
  assert.equal(check('missed-writes', { w: 1, r: 2 }), false, 'w + r = n does not overlap');
  assert.equal(check('missed-writes', { w: 2, r: 2 }), true);
  assert.equal(check('never-back', { w: 2, r: 2, repair: 'async' }), false, 'repair after the reply is not enough');
  assert.equal(check('never-back', { w: 2, r: 2, repair: 'sync' }), true);
  assert.equal(check('two-rejoin', { w: 2, r: 3 }), false, 'w + r = n does not overlap');
  assert.equal(check('two-rejoin', { w: 3, r: 2 }), false);
  assert.equal(check('two-rejoin', { w: 3, r: 3 }), true);
});

/* ---------- partitioning lab ---------- */
const PT = () => DDIA.lab.get('partition');
const ptRuns = (cfg) => DDIA.lab.runAll(PT(), DDIA.lab.configFor(PT(), cfg));
const ptCount = (cfg, metric) => ptRuns(cfg).filter((r) => r.stats[metric] > 0).length;

test('partition: the same seed gives the same trace', () => {
  const cfg = DDIA.lab.configFor(PT(), { load: 'celebrity', place: 'hash', grow: 'add', salt: 'suffix' });
  assert.deepEqual(PT().run(cfg, 5), PT().run(cfg, 5));
  assert.notDeepEqual(PT().run(cfg, 5).trace, PT().run(cfg, 6).trace);
});

test('partition: hash mod N moves most keys when a node joins; fixed partitions do not', () => {
  assert.equal(ptCount({ load: 'users', place: 'mod', nodes: 4, grow: 'add' }, 'massMove'), 100);
  assert.equal(ptCount({ load: 'users', place: 'hash', nodes: 4, grow: 'add' }, 'massMove'), 0);
  ptRuns({ load: 'users', place: 'hash', nodes: 4, grow: 'add' }).forEach((r) => assert.ok(r.stats.moved < 50, `moved ${r.stats.moved}%`));
});

test('partition: time as the first key part makes a hot spot; a compound key does not', () => {
  assert.equal(ptCount({ load: 'sensors', place: 'range' }, 'hot'), 100);
  assert.equal(ptCount({ load: 'sensors', place: 'compound' }, 'hot'), 0);
  assert.equal(ptCount({ load: 'sensors', place: 'compound' }, 'scatter'), 0);
  const read = PT().run(DDIA.lab.configFor(PT(), { load: 'sensors', place: 'compound' }), 1).trace.find((e) => e.type === 'read');
  assert.equal(read.nodes.length, 1, 'one sensor lives on one node');
});

test('partition: uniform users never look hot', () => {
  ['range', 'hash', 'mod', 'compound'].forEach((place) => [3, 4].forEach((nodes) => {
    assert.equal(ptCount({ load: 'users', place, nodes }, 'hot'), 0, `${place}, N = ${nodes}`);
  }));
});

test('partition: a celebrity stays hot until a suffix and hashing spread it', () => {
  assert.equal(ptCount({ load: 'celebrity', place: 'hash', nodes: 4 }, 'hot'), 100);
  assert.equal(ptCount({ load: 'celebrity', place: 'hash', nodes: 4, salt: 'suffix' }, 'hot'), 0);
  assert.equal(ptCount({ load: 'celebrity', place: 'range', nodes: 4, salt: 'suffix' }, 'hot'), 100, 'suffixed keys still sort together');
});

test('partition: a key-range read asks at most two nodes; hashing asks all', () => {
  ptRuns({ load: 'users', place: 'range', nodes: 4 }).forEach((r) => assert.equal(r.stats.scatter, 0));
  const read = PT().run(DDIA.lab.configFor(PT(), { load: 'users', place: 'range', nodes: 4 }), 3).trace.find((e) => e.type === 'read');
  assert.ok(read.nodes.length <= 2);
  assert.equal(ptCount({ load: 'users', place: 'hash', nodes: 4 }, 'scatter'), 100);
});

test('partition: a join moves exactly the keys of the partitions the new node takes', () => {
  const cfg = DDIA.lab.configFor(PT(), { load: 'users', place: 'hash', nodes: 4, grow: 'add' });
  const { trace, stats } = PT().run(cfg, 9);
  const join = trace.find((e) => e.type === 'join');
  const counts = [0, 0, 0, 0, 0];
  join.owner.forEach((o) => counts[o]++);
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, `partitions stay balanced: ${counts}`);
  const taken = new Set(join.took.map((t) => t.part));
  const keys = new Map();
  trace.filter((e) => e.type === 'write' && e.i < DDIA.labs.partitionModel.HALF).forEach((e) => keys.set(e.key, e.part));
  const expected = [...keys.values()].filter((part) => taken.has(part)).length;
  assert.equal(stats.moved, Math.round((expected / keys.size) * 100));
});

test('partition: keys moved counts the celebrity key once, not once per write', () => {
  const cfg = DDIA.lab.configFor(PT(), { load: 'celebrity', place: 'hash', nodes: 4, grow: 'add' });
  PT().samples(cfg).forEach((seed) => assert.ok(PT().run(cfg, seed).stats.moved < 50));
});

test('partition: a bar that crosses the hot line mid-phase always ends hot', () => {
  const { HALF, WRITES, HOT } = DDIA.labs.partitionModel;
  const cfgs = PT().presets.concat(PT().challenges).flatMap((t) => [t.config, Object.assign({}, t.config, (t.solution || {}).config)]);
  cfgs.forEach((c) => {
    const cfg = DDIA.lab.configFor(PT(), c);
    const size = cfg.grow === 'add' ? HALF : WRITES;
    PT().samples(cfg).slice(0, 30).forEach((seed) => {
      const { trace } = PT().run(cfg, seed);
      let n = cfg.nodes;
      let load = Array(n).fill(0);
      let crossed = false;
      const verdicts = [];
      trace.forEach((e) => {
        if (e.type === 'join') { verdicts.push([crossed, e.before.hot]); n++; load = Array(n).fill(0); crossed = false; }
        if (e.type === 'write') { load[e.node]++; if (load[e.node] / size > HOT / n) crossed = true; }
        if (e.type === 'done') verdicts.push([crossed, e.last.hot]);
      });
      verdicts.forEach(([c, hot]) => assert.equal(c, !!hot, `${JSON.stringify(c)} seed ${seed}`));
    });
  });
});

/* ---------- leases lab ---------- */
const LS = () => DDIA.lab.get('leases');
const lsRuns = (cfg) => DDIA.lab.runAll(LS(), DDIA.lab.configFor(LS(), cfg));
const lsCount = (cfg, metric) => lsRuns(cfg).filter((r) => r.stats[metric] > 0).length;

test('leases: the same seed gives the same trace', () => {
  const cfg = DDIA.lab.configFor(LS(), { fault: 'mixed', lease: 10, fence: 'on' });
  assert.deepEqual(LS().run(cfg, 4), LS().run(cfg, 4));
});

test('leases: a pause shorter than the lease is harmless; a longer one lets a zombie write', () => {
  [5, 10, 30].forEach((lease) => assert.equal(lsCount({ fault: 'short', lease, fence: 'off' }, 'corrupt'), 0, `${lease} s`));
  const some = lsCount({ fault: 'long', lease: 10, fence: 'off' }, 'corrupt');
  assert.ok(some > 0 && some < 100, `a 4–16 s pause beats a 10 s lease in some runs (${some})`);
  assert.equal(lsCount({ fault: 'long', lease: 30, fence: 'off' }, 'corrupt'), 0, 'a 30 s lease outlasts every 16 s pause');
});

test('leases: fencing rejects every stale write that lands after a newer one', () => {
  ['short', 'long', 'crash', 'mixed'].forEach((fault) => [5, 10, 30].forEach((lease) => {
    const off = lsRuns({ fault, lease, fence: 'off' });
    const on = lsRuns({ fault, lease, fence: 'on' });
    on.forEach((r, i) => {
      assert.equal(r.stats.corrupt, 0, `${fault}, ${lease} s`);
      assert.equal(r.stats.fenced > 0, off[i].stats.corrupt > 0, `${fault}, ${lease} s, seed ${r.input}`);
      assert.equal(r.stats.wait, off[i].stats.wait, 'fencing never slows the handover');
    });
  }));
});

test('leases: every event fits the 0–40 s timeline, in a sensible order', () => {
  ['none', 'short', 'long', 'crash', 'mixed'].forEach((fault) => [5, 10, 30].forEach((lease) => ['off', 'on'].forEach((fence) => {
    const cfg = DDIA.lab.configFor(LS(), { fault, lease, fence });
    LS().samples(cfg).forEach((seed) => {
      const { trace } = LS().run(cfg, seed);
      const where = `${fault}, ${lease} s, seed ${seed}`;
      assert.ok(trace[trace.length - 1].t <= 40, `${where}: ends at ${trace[trace.length - 1].t} s`);
      const ends = trace.filter((e) => (e.type === 'release' && e.from === 1) || e.type === 'expire');
      assert.equal(ends.length, 1, `${where}: client 1's lease ends exactly once`);
      const lost = trace.findIndex((e) => e.type === 'lost');
      if (lost >= 0) assert.ok(trace.findIndex((e) => e.type === 'expire') < lost, `${where}: noticed after it expired`);
      trace.slice(1).forEach((e, i) => assert.ok(e.t >= trace[i].t, `${where}: time runs forward`));
    });
  })));
});

test('leases: the zombie and fencing scenarios open on a run that shows the zombie', () => {
  const open = (id) => { const p = LS().presets.find((x) => x.id === id); return LS().run(DDIA.lab.configFor(LS(), p.config), p.input).stats; };
  assert.equal(open('zombie').corrupt, 1);
  assert.ok(open('fencing').fenced > 0);
});

test('leases: after a crash client 2 waits about one lease', () => {
  [5, 10, 30].forEach((lease) => lsRuns({ fault: 'crash', lease }).forEach((r) => {
    assert.ok(r.stats.wait >= lease + 0.8 && r.stats.wait <= lease + 1.5, `${lease} s lease: waited ${r.stats.wait} s`);
  }));
});

/* ---------- clocks lab ---------- */
const CK = () => DDIA.lab.get('clocks');
const ckRuns = (cfg) => DDIA.lab.runAll(CK(), DDIA.lab.configFor(CK(), cfg));
const ckCount = (cfg, metric) => ckRuns(cfg).filter((r) => r.stats[metric] > 0).length;

test('clocks: the same seed gives the same trace', () => {
  const cfg = DDIA.lab.configFor(CK(), { skew: 200, gap: 'fast', order: 'lamport' });
  assert.deepEqual(CK().run(cfg, 6), CK().run(cfg, 6));
});

test('clocks: skewed wall clocks lose replies only when writes are closer than the skew', () => {
  assert.equal(ckCount({ skew: 0, gap: 'fast', order: 'wall' }, 'lost'), 0);
  const some = ckCount({ skew: 200, gap: 'fast', order: 'wall' }, 'lost');
  assert.ok(some > 0 && some < 100, `200 ms skew loses a fast reply in some runs (${some})`);
  [5, 50, 200].forEach((skew) => assert.equal(ckCount({ skew, gap: 'slow', order: 'wall' }, 'lost'), 0, `${skew} ms, a second apart`));
});

test('clocks: Lamport clocks keep causes first but not real-time order', () => {
  [0, 50, 200].forEach((skew) => {
    assert.equal(ckCount({ skew, gap: 'fast', order: 'lamport' }, 'lost'), 0, `${skew} ms`);
    const broken = ckCount({ skew, gap: 'fast', order: 'lamport' }, 'order');
    assert.ok(broken > 0 && broken < 100, `Carol sometimes sorts before Bob (${broken})`);
  });
});

test('clocks: lost and order agree with the sorted list', () => {
  [0, 5, 50, 200].forEach((skew) => ['fast', 'slow'].forEach((gap) => ['wall', 'lamport', 'wait'].forEach((order) => {
    const cfg = DDIA.lab.configFor(CK(), { skew, gap, order });
    CK().samples(cfg).forEach((seed) => {
      const { trace, stats } = CK().run(cfg, seed);
      const pos = (v) => trace.find((e) => e.type === 'sort').order.indexOf(v);
      const where = `${skew} ms, ${gap}, ${order}, seed ${seed}`;
      assert.equal(stats.lost, pos(2) < pos(1) ? 1 : 0, `${where}: lost`);
      assert.equal(stats.order, pos(2) < pos(1) || pos(3) < pos(2) || pos(3) < pos(1) ? 1 : 0, `${where}: order`); // values 1, 2, 3 were written in that order
    });
  })));
});

test('clocks: Lamport results ignore skew and gaps, and Carol never sorts before Alice', () => {
  const base = ckRuns({ skew: 0, gap: 'fast', order: 'lamport' }).map((r) => r.stats);
  [5, 50, 200].forEach((skew) => ['fast', 'slow'].forEach((gap) => {
    assert.deepEqual(ckRuns({ skew, gap, order: 'lamport' }).map((r) => [r.stats.lost, r.stats.order, r.stats.final]), base.map((x) => [x.lost, x.order, x.final]), `${skew} ms, ${gap}`);
  }));
  const cfg = DDIA.lab.configFor(CK(), { skew: 200, gap: 'fast', order: 'lamport' });
  CK().samples(cfg).forEach((seed) => {
    const order = CK().run(cfg, seed).trace.find((e) => e.type === 'sort').order;
    assert.ok(order.indexOf(3) > order.indexOf(1), `seed ${seed}: Carol's counter ties or beats Alice's, and node C sorts after A`);
  });
});

test('clocks: commit wait keeps every order and waits exactly the skew', () => {
  [0, 5, 50, 200].forEach((skew) => ['fast', 'slow'].forEach((gap) => ckRuns({ skew, gap, order: 'wait' }).forEach((r) => {
    assert.equal(r.stats.lost + r.stats.order, 0, `${skew} ms, ${gap}`);
    assert.equal(r.stats.wait, skew);
    assert.equal(r.stats.final, 3, 'the last write in real time wins');
  })));
});

/* ---------- storage lab ---------- */
const SG = () => DDIA.lab.get('storage');
const sgRuns = (cfg) => DDIA.lab.runAll(SG(), DDIA.lab.configFor(SG(), cfg));
const sgCount = (cfg, metric) => sgRuns(cfg).filter((r) => r.stats[metric] > 0).length;

test('storage: the same seed gives the same trace', () => {
  const cfg = DDIA.lab.configFor(SG(), { engine: 'lsm', load: 'updates', crash: 'midway', bloom: 'on' });
  assert.deepEqual(SG().run(cfg, 8), SG().run(cfg, 8));
});

test('storage: page rewrites make B-tree writes heavy; LSM-tree writes stay light', () => {
  ['inserts', 'updates', 'misses'].forEach((load) => {
    assert.equal(sgCount({ engine: 'btree', load }, 'heavy'), 100, `B-tree, ${load}`);
    ['off', 'on'].forEach((compact) => ['off', 'on'].forEach((wal) => assert.equal(sgCount({ engine: 'lsm', load, compact, wal }, 'heavy'), 0, `LSM, ${load}, compaction ${compact}, log ${wal}`)));
  });
});

test('storage: without compaction reads check many segments, unless Bloom filters skip them', () => {
  assert.equal(sgCount({ engine: 'lsm', load: 'misses', compact: 'off', bloom: 'off' }, 'slow'), 100);
  assert.equal(sgCount({ engine: 'lsm', load: 'misses', compact: 'off', bloom: 'on' }, 'slow'), 0);
  assert.equal(sgCount({ engine: 'lsm', load: 'misses', compact: 'on', bloom: 'off' }, 'slow'), 0);
});

test('storage: compaction clears old versions', () => {
  assert.equal(sgCount({ engine: 'lsm', load: 'updates', compact: 'off' }, 'bloat'), 100);
  assert.equal(sgCount({ engine: 'lsm', load: 'updates', compact: 'on' }, 'bloat'), 0);
});

test('storage: a write-ahead log makes both engines crash-safe', () => {
  const lsmLost = sgCount({ engine: 'lsm', crash: 'midway', wal: 'off' }, 'lost');
  const torn = sgCount({ engine: 'btree', crash: 'midway', wal: 'off' }, 'corrupt');
  assert.ok(lsmLost > 50, `the memtable is usually lost (${lsmLost})`);
  assert.ok(torn > 0 && torn < 50, `only a crash mid-split tears the tree (${torn})`);
  ['lsm', 'btree'].forEach((engine) => sgRuns({ engine, crash: 'midway', wal: 'on' }).forEach((r) => assert.equal(r.stats.lost + r.stats.corrupt, 0, engine)));
});

test('storage: a B-tree ignores the LSM-tree knobs, and switching back keeps them', () => {
  const plain = sgRuns({ engine: 'btree', load: 'inserts', crash: 'midway' }).map((r) => r.stats);
  assert.deepEqual(sgRuns({ engine: 'btree', load: 'inserts', crash: 'midway', compact: 'on', bloom: 'on' }).map((r) => r.stats), plain);
  const there = DDIA.lab.configFor(SG(), { engine: 'btree', compact: 'on', bloom: 'on' });
  const back = DDIA.lab.configFor(SG(), there, { engine: 'lsm' });
  assert.equal(back.compact, 'on');
  assert.equal(back.bloom, 'on');
});

test('storage: an LSM crash loses exactly the writes buffered since the last flush', () => {
  const cfg = DDIA.lab.configFor(SG(), { engine: 'lsm', load: 'updates', crash: 'midway', wal: 'off' });
  SG().samples(cfg).forEach((seed) => {
    const { trace, stats } = SG().run(cfg, seed);
    const crash = trace.find((e) => e.type === 'crash');
    const buffered = trace.find((e) => e.type === 'write' && e.i === crash.i).state.mem;
    assert.equal(stats.lost, buffered, `seed ${seed}`);
  });
});

test('storage: a B-tree crash tears the tree only when it lands on a split', () => {
  ['inserts', 'updates', 'misses'].forEach((load) => {
    const cfg = DDIA.lab.configFor(SG(), { engine: 'btree', load, crash: 'midway', wal: 'off' });
    SG().samples(cfg).forEach((seed) => {
      const { trace, stats } = SG().run(cfg, seed);
      const crash = trace.find((e) => e.type === 'crash');
      const split = trace.find((e) => e.type === 'write' && e.i === crash.i).did === 'split';
      assert.equal(stats.corrupt, split ? 1 : 0, `${load}, seed ${seed}`);
    });
  });
  assert.equal(sgCount({ engine: 'btree', load: 'updates', crash: 'midway' }, 'corrupt'), 0, 'overwrites never split');
});

test('storage: the disk counter is the sum of every write’s cost', () => {
  [{ engine: 'lsm', compact: 'on', wal: 'on' }, { engine: 'lsm', load: 'updates' }, { engine: 'btree', wal: 'on' }].forEach((c) => {
    const cfg = DDIA.lab.configFor(SG(), c);
    SG().samples(cfg).slice(0, 20).forEach((seed) => {
      const { trace } = SG().run(cfg, seed);
      const done = trace[trace.length - 1];
      const sum = trace.filter((e) => e.type === 'write').reduce((a, e) => a + e.cost, 0);
      assert.equal(done.units, sum);
      assert.equal(done.amp, Math.round((sum / DDIA.labs.storageModel.WRITES) * 10) / 10);
    });
  });
  assert.ok(sgRuns({ engine: 'btree', load: 'updates' }).every((r) => r.stats.amp === 8), 'an overwrite rewrites one 8-key page');
  assert.ok(sgRuns({ engine: 'lsm', load: 'inserts', compact: 'off' }).every((r) => r.stats.amp === 1), 'each key is written once, when flushed');
});

/* ---------- streams lab ---------- */
const SM = () => DDIA.lab.get('streams');
const smRuns = (cfg) => DDIA.lab.runAll(SM(), DDIA.lab.configFor(SM(), cfg));
const smCount = (cfg, metric) => smRuns(cfg).filter((r) => r.stats[metric] > 0).length;

test('streams: the same seed gives the same trace', () => {
  const cfg = DDIA.lab.configFor(SM(), { delays: 'offline', time: 'event', wait: 30, late: 'correct' });
  assert.deepEqual(SM().run(cfg, 3), SM().run(cfg, 3));
});

test('streams: counting by arrival time puts stragglers in the wrong minute', () => {
  assert.equal(smCount({ delays: 'some', time: 'processing' }, 'wrong'), 100);
  const tiny = smCount({ delays: 'none', time: 'processing' }, 'wrong');
  assert.ok(tiny > 0 && tiny < 100, `even a second of delay moves boundary events (${tiny})`);
});

test('streams: a window that waits longer than the slowest straggler is always right', () => {
  assert.equal(smCount({ delays: 'some', time: 'event', wait: 120, late: 'drop' }, 'wrong'), 0);
  assert.equal(smCount({ delays: 'some', time: 'event', wait: 30, late: 'drop' }, 'wrong'), 100, '30 s is shorter than a 90 s straggler');
  assert.equal(smCount({ delays: 'offline', time: 'event', wait: 120, late: 'drop' }, 'wrong'), 100, 'no wait catches a phone that was offline');
});

test('streams: corrections make every count right in the end, whatever the delays', () => {
  ['none', 'some', 'offline'].forEach((delays) => [0, 30, 120].forEach((wait) => smRuns({ delays, time: 'event', wait, late: 'correct' }).forEach((r) => {
    assert.equal(r.stats.wrong, 0, `${delays}, wait ${wait}`);
    assert.equal(r.stats.dropped, 0);
  })));
});

test('streams: every event is counted, dropped or corrected, never lost from the tally', () => {
  ['none', 'some', 'offline'].forEach((delays) => [['processing', 0, 'drop'], ['event', 0, 'drop'], ['event', 30, 'drop'], ['event', 120, 'correct']].forEach(([time, wait, late]) => {
    const cfg = DDIA.lab.configFor(SM(), { delays, time, wait, late });
    SM().samples(cfg).forEach((seed) => {
      const { trace, stats } = SM().run(cfg, seed);
      const done = trace[trace.length - 1];
      assert.equal(done.shown.reduce((a, b) => a + b, 0) + stats.dropped, DDIA.labs.streamsModel.EVENTS, `${delays}, ${time}, seed ${seed}`);
      assert.ok(trace.every((e) => e.type !== 'event' || e.arrives <= 540), 'every arrival fits the 9-minute timeline');
    });
  }));
});

test('streams: an event arriving exactly as its window closes is late', () => {
  const cfg = DDIA.lab.configFor(SM(), { delays: 'none', time: 'event', wait: 0, late: 'drop' });
  let seen = 0;
  SM().samples(cfg).forEach((seed) => SM().run(cfg, seed).trace.forEach((e) => {
    if (e.type !== 'event') return;
    const end = (Math.floor(e.at / 60) + 1) * 60;
    if (e.arrives >= end) { seen++; assert.equal(e.fate, 'dropped', `seed ${seed}: arrived ${e.arrives}, window ended ${end}`); }
  }));
  assert.ok(seen > 0);
});

test('streams: every event is counted once, in the minute it happened', () => {
  smRuns({ delays: 'offline', time: 'event', wait: 0, late: 'correct' }).forEach((r) => {
    const done = SM().run(DDIA.lab.configFor(SM(), { delays: 'offline', time: 'event', wait: 0, late: 'correct' }), r.input).trace.pop();
    assert.equal(done.shown.reduce((a, b) => a + b, 0), DDIA.labs.streamsModel.EVENTS);
    assert.deepEqual(done.shown, done.truth);
  });
});

/* ---------- consensus lab ---------- */
const CS = () => DDIA.lab.get('consensus');
const csRuns = (cfg) => DDIA.lab.runAll(CS(), DDIA.lab.configFor(CS(), cfg));
const csCount = (cfg, metric) => csRuns(cfg).filter((r) => r.stats[metric] > 0).length;

test('consensus: the same seed gives the same trace', () => {
  const cfg = DDIA.lab.configFor(CS(), { fault: 'slow-crash', rule: 'majority', timeout: 1 });
  assert.deepEqual(CS().run(cfg, 2), CS().run(cfg, 2));
});

test('consensus: without a majority rule a partition loses acknowledged writes', () => {
  [1, 3, 5].forEach((timeout) => {
    assert.equal(csCount({ fault: 'partition', rule: 'naive', timeout }, 'lost'), 100, `${timeout} s`);
    assert.equal(csCount({ fault: 'partition', rule: 'majority', timeout }, 'lost'), 0, `${timeout} s`);
  });
});

test('consensus: without a quorum, every write client 1 makes while cut off is thrown away', () => {
  const { FAULT_AT, HEAL_AT } = DDIA.labs.consensusModel;
  [1, 3, 5].forEach((timeout) => {
    const cfg = DDIA.lab.configFor(CS(), { fault: 'partition', rule: 'naive', timeout });
    CS().samples(cfg).forEach((seed) => {
      const cutOff = CS().run(cfg, seed).trace.filter((e) => e.type === 'write' && e.c === 0 && e.ok && e.t >= FAULT_AT && e.t < HEAL_AT);
      assert.ok(cutOff.length > 0 && cutOff.every((e) => e.lost), `${timeout} s, seed ${seed}: all ${cutOff.length} are lost`);
    });
  });
});

test('consensus: never two leaders of one term', () => {
  ['crash', 'partition', 'slow', 'slow-crash'].forEach((fault) => ['naive', 'majority'].forEach((rule) => [1, 3, 5].forEach((timeout) => {
    const cfg = DDIA.lab.configFor(CS(), { fault, rule, timeout });
    CS().samples(cfg).slice(0, 30).forEach((seed) => {
      const terms = CS().run(cfg, seed).trace.filter((e) => e.type === 'elected').map((e) => e.term);
      assert.equal(new Set(terms).size, terms.length, `${fault}, ${rule}, ${timeout} s, seed ${seed}`);
    });
  })));
});

test('consensus: the majority rule never loses a write, whatever goes wrong', () => {
  ['none', 'crash', 'partition', 'slow', 'slow-crash'].forEach((fault) => [1, 3, 5].forEach((timeout) => {
    assert.equal(csCount({ fault, rule: 'majority', timeout }, 'lost'), 0, `${fault}, ${timeout} s`);
  }));
});

test('consensus: the cut-off minority cannot write under the majority rule', () => {
  csRuns({ fault: 'partition', rule: 'majority', timeout: 3 }).forEach((r) => {
    assert.ok(r.stats.gap1 >= 15, `client 1 waits out the partition (${r.stats.gap1} s)`);
    assert.ok(r.stats.gap2 <= 5, `client 2's side elects a new leader (${r.stats.gap2} s)`);
  });
});

test('consensus: a timeout shorter than a stall votes out healthy leaders; a long one slows failover', () => {
  assert.ok(csCount({ fault: 'slow', rule: 'majority', timeout: 1 }, 'flaps') > 50);
  assert.equal(csCount({ fault: 'slow', rule: 'majority', timeout: 3 }, 'flaps'), 0);
  assert.equal(csCount({ fault: 'crash', rule: 'majority', timeout: 5 }, 'outage'), 100);
  assert.equal(csCount({ fault: 'crash', rule: 'majority', timeout: 1 }, 'outage'), 0);
});

/* ---------- presets, predicts, challenges, card links ---------- */
test('every lab passes validation', () => {
  assert.ok(DDIA.labs.length >= 2);
  DDIA.labs.forEach((l) => assert.deepEqual(DDIA.lab.validate(l), [], l.id));
});

test('every predict is computable and every preset input is valid', () => {
  DDIA.labs.forEach((l) => l.presets.forEach((p) => {
    const c = DDIA.lab.configFor(l, p.config);
    const input = p.input != null ? p.input : l.defaultInput(c);
    assert.ok(l.parseInput(l.inputKey(input), c) != null, `${l.id}/${p.id} input round-trips`);
    if (!p.predict) return;
    const r = DDIA.lab.predict(l, DDIA.lab.configFor(l, p.config), p.predict.metric);
    assert.ok([0, 1, 2].includes(r.answer), `${l.id}/${p.id}`);
  }));
});

test('every challenge fails at the start and passes with its solution', () => {
  DDIA.labs.forEach((l) => l.challenges.forEach((ch) => {
    const start = DDIA.lab.configFor(l, ch.config);
    const startInput = ch.input != null ? ch.input : l.defaultInput(start);
    assert.equal(DDIA.lab.checkChallenge(l, ch, start, startInput).ok, false, `${l.id}/${ch.id} start should fail`);
    const sol = DDIA.lab.configFor(l, ch.config, ch.solution.config);
    const solInput = ch.solution.input != null ? ch.solution.input : startInput;
    const res = DDIA.lab.checkChallenge(l, ch, sol, solInput);
    assert.equal(res.ok, true, `${l.id}/${ch.id} solution: ${JSON.stringify(res.results)}`);
  }));
});

test('every card lab link points at a real lab and preset', () => {
  const links = [];
  const saved = DDIA.chapter;
  DDIA.chapter = (def) => def.cards.forEach((c, i) => { if (c.lab) links.push({ where: `ch${def.id}/${i + 1}`, lab: c.lab }); });
  for (const n of ['03', '05', '06', '07', '08', '09', '11']) vm.runInThisContext(readFileSync(join(root, `js/chapters/ch${n}.js`), 'utf8'));
  DDIA.chapter = saved;
  assert.ok(links.length >= 35, `expected at least 35 card links, found ${links.length}`);
  links.forEach(({ where, lab }) => {
    const l = DDIA.lab.get(lab.id);
    assert.ok(l, `${where}: no lab ${lab.id}`);
    assert.ok(l.presets.some((p) => p.id === lab.preset), `${where}: no preset ${lab.preset}`);
    Object.entries(lab.set || {}).forEach(([k, val]) => {
      const knob = l.knobs.find((x) => x.id === k);
      assert.ok(knob && knob.options.some((o) => String(o.value) === String(val)), `${where}: bad override ${k}=${val}`);
    });
  });
});

/* ---------- scenario cards ---------- */
test('labnav.status covers every card state, old progress included', () => {
  const l = DDIA.lab.get('quorum');
  const pre = l.presets.find((p) => p.id === 'stale-read');
  const free = l.presets.find((p) => !p.predict);
  const ch = l.challenges[0];
  const st = (tab, prog) => DDIA.labnav.status(l, tab, prog).kind;
  assert.equal(st(pre, {}), 'new');
  assert.equal(st(pre, { p: { 'stale-read': { a: 2, ok: true } } }), 'right');
  assert.equal(st(pre, { p: { 'stale-read': { a: 0, ok: false } } }), 'missed');
  assert.equal(st(pre, { p: { 'stale-read': { a: -1 } } }), 'ran');
  assert.equal(st(free, { p: {} }), 'sandbox');
  assert.equal(st(ch, { p: {}, c: {} }), 'open', 'progress saved before f and s existed');
  assert.equal(st(ch, { c: { [ch.id]: 1 } }), 'passed');
  assert.equal(st(ch, { s: { [ch.id]: true } }), 'seen');
  assert.equal(st(ch, { c: { [ch.id]: 1 }, s: { [ch.id]: true } }), 'passed', 'passed before seeing the solution');
  assert.equal(st(Object.assign({ kind: 'challenge' }, ch), undefined), 'open', 'a copied tab still counts as a challenge');
  assert.equal(st(pre, { p: { 'stale-read': { a: 2, ok: true, q: pre.predict.q } } }), 'right', 'stamped with this question');
  assert.equal(st(pre, { p: { 'stale-read': { a: 2, ok: true, q: 'an older question' } } }), 'new', 'an answer to a rewritten question no longer counts');
});

test('sketches draw every tab from its opening setup alone', () => {
  DDIA.labs.forEach((l) => l.presets.concat(l.challenges).forEach((t) => {
    const [run, simRun] = [l.run, DDIA.sim.run];
    l.run = DDIA.sim.run = () => { throw new Error('a sketch must not run the model'); };
    try {
      const svg = DDIA.labnav.sketchOf(l, t);
      assert.match(svg, /^<svg[\s>]/, `${l.id}/${t.id}`);
      assert.equal(DDIA.labnav.sketchOf(l, t), svg, `${l.id}/${t.id} is deterministic`);
      assert.ok((svg.match(/<text/g) || []).length <= 1, `${l.id}/${t.id}: at most one label`);
      (svg.match(/font-size="([\d.]+)"/g) || []).forEach((m) => assert.ok(parseFloat(m.split('"')[1]) >= 14, `${l.id}/${t.id}: ${m}`));
    } finally { l.run = run; DDIA.sim.run = simRun; }
  }));
});

test('a challenge card draws its opening order, not its answer', () => {
  const l = DDIA.lab.get('isolation');
  const ch = l.challenges.find((c) => c.id === 'break-si');
  const cfg = DDIA.lab.configFor(l, ch.config);
  assert.notEqual(DDIA.labnav.sketchOf(l, ch), l.sketch(cfg, ch.solution.input));
  assert.equal(DDIA.labnav.sketchOf(l, ch), l.sketch(cfg, ch.input));
});

test('predictions ask about the setup on screen', () => {
  const ask = (lab, id) => {
    const l = DDIA.lab.get(lab);
    const p = l.presets.find((x) => x.id === id);
    assert.equal(p.predict.config, undefined, `${lab}/${id} still has predict.config`);
    const r = DDIA.lab.predict(l, DDIA.lab.configFor(l, p.config), p.predict.metric);
    return [r.answer, r.hits, r.total];
  };
  assert.deepEqual(ask('quorum', 'read-repair'), [1, 24, 100], 'repair after the reply still leaves some stale reads');
  assert.deepEqual(ask('isolation', 'dirty-read'), [1, 2, 6]);
  assert.deepEqual(ask('isolation', 'lost-update'), [1, 18, 20]);
  assert.deepEqual(ask('isolation', 'phantom'), [1, 12, 20], 'row locks cannot lock a row that does not exist');
  assert.deepEqual(ask('leases', 'short-pause'), [0, 0, 100]);
  assert.deepEqual(ask('leases', 'zombie'), [1, 40, 100]);
  assert.deepEqual(ask('leases', 'fencing'), [0, 0, 100]);
  assert.deepEqual(ask('leases', 'crash'), [2, 100, 100]);
  assert.deepEqual(ask('clocks', 'no-skew'), [0, 0, 100]);
  assert.deepEqual(ask('clocks', 'skewed'), [1, 33, 100]);
  assert.deepEqual(ask('clocks', 'slow-reply'), [0, 0, 100]);
  assert.deepEqual(ask('clocks', 'lamport'), [1, 21, 100]);
  assert.deepEqual(ask('clocks', 'commit-wait'), [0, 0, 100]);
  assert.deepEqual(ask('storage', 'btree-writes'), [2, 100, 100]);
  assert.deepEqual(ask('storage', 'lsm-writes'), [0, 0, 100]);
  assert.deepEqual(ask('storage', 'no-compaction'), [2, 100, 100]);
  assert.deepEqual(ask('storage', 'overwrites'), [2, 100, 100]);
  assert.deepEqual(ask('storage', 'crash-lsm'), [1, 86, 100]);
  assert.deepEqual(ask('storage', 'crash-btree'), [1, 16, 100]);
  assert.deepEqual(ask('consensus', 'crash'), [2, 100, 100]);
  assert.deepEqual(ask('consensus', 'split-brain'), [2, 100, 100]);
  assert.deepEqual(ask('consensus', 'majority'), [0, 0, 100]);
  assert.deepEqual(ask('consensus', 'flapping'), [1, 94, 100]);
  assert.deepEqual(ask('streams', 'arrival'), [2, 100, 100]);
  assert.deepEqual(ask('streams', 'no-wait'), [2, 100, 100]);
  assert.deepEqual(ask('streams', 'watermark'), [0, 0, 100]);
  assert.deepEqual(ask('streams', 'offline'), [2, 100, 100]);
  assert.deepEqual(ask('streams', 'corrections'), [0, 0, 100]);
});

test('validation asks for sketches, blurbs and solution reasons, and rejects predict.config', () => {
  const q = DDIA.lab.get('quorum');
  const withFirst = (key, patch) => Object.assign({}, q, { [key]: [Object.assign({}, q[key][0], patch)].concat(q[key].slice(1)) });
  const probs = (d) => DDIA.lab.validate(d).join('; ');
  assert.match(probs(Object.assign({}, q, { sketch: undefined })), /missing sketch/);
  assert.match(probs(withFirst('presets', { blurb: '' })), /preset basics: missing blurb/);
  assert.match(probs(withFirst('presets', { blurb: 'one two three four five six seven eight nine ten eleven twelve thirteen' })), /preset basics: blurb has 13 words/);
  assert.match(probs(withFirst('presets', { predict: { q: 'Stale?', metric: 'stale', config: { w: 1 } } })), /preset basics: predict\.config/);
  assert.match(probs(withFirst('challenges', { blurb: undefined })), /challenge missed-writes: missing blurb/);
  assert.match(probs(withFirst('challenges', { solution: { config: { w: 2, r: 2 } } })), /challenge missed-writes: missing solution\.why/);
  assert.match(probs(withFirst('challenges', { solution: { config: { w: 2, r: 2 }, why: Array(21).fill('w').join(' ') } })), /solution\.why has 21 words/);
});

/* ---------- report ---------- */
const failed = results.filter((r) => !r.ok);
for (const r of results) {
  if (r.ok) console.log(`  ✓ ${r.name}${r.ms > 250 ? ` (${Math.round(r.ms)} ms)` : ''}`);
  else console.log(`  ✕ ${r.name}\n      ${String(r.err && (r.err.stack || r.err)).split('\n').slice(0, 4).join('\n      ')}`);
}
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
