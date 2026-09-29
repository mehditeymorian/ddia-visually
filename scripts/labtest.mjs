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
for (const f of ['js/sim.js', 'js/lab.js', 'js/labs/quorum.js', 'js/labs/isolation.js']) {
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
  presets: [{ id: 'p', title: 'P', config: {}, knobs: ['a'], nudge: 'Try it.', predict: { q: 'Bad?', metric: 'bad' } }],
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
    const r = DDIA.lab.predict(l, DDIA.lab.configFor(l, p.config, p.predict.config), p.predict.metric);
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
  for (const n of ['05', '07', '09']) vm.runInThisContext(readFileSync(join(root, `js/chapters/ch${n}.js`), 'utf8'));
  DDIA.chapter = saved;
  assert.ok(links.length >= 13, `expected at least 13 card links, found ${links.length}`);
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

/* ---------- report ---------- */
const failed = results.filter((r) => !r.ok);
for (const r of results) {
  if (r.ok) console.log(`  ✓ ${r.name}${r.ms > 250 ? ` (${Math.round(r.ms)} ms)` : ''}`);
  else console.log(`  ✕ ${r.name}\n      ${String(r.err && (r.err.stack || r.err)).split('\n').slice(0, 4).join('\n      ')}`);
}
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
