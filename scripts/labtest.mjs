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

/* ---------- report ---------- */
const failed = results.filter((r) => !r.ok);
for (const r of results) {
  if (r.ok) console.log(`  ✓ ${r.name}${r.ms > 250 ? ` (${Math.round(r.ms)} ms)` : ''}`);
  else console.log(`  ✕ ${r.name}\n      ${String(r.err && (r.err.stack || r.err)).split('\n').slice(0, 4).join('\n      ')}`);
}
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
