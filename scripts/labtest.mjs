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

/* ---------- report ---------- */
const failed = results.filter((r) => !r.ok);
for (const r of results) {
  if (r.ok) console.log(`  ✓ ${r.name}${r.ms > 250 ? ` (${Math.round(r.ms)} ms)` : ''}`);
  else console.log(`  ✕ ${r.name}\n      ${String(r.err && (r.err.stack || r.err)).split('\n').slice(0, 4).join('\n      ')}`);
}
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
