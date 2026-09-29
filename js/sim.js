/* DDIA Visual Guide — sim core: a deterministic, seeded, virtual-time event simulator.
 * No DOM, no timers, no globals besides DDIA.sim. Labs build pure models on it
 * (see LABS.md): the same model drives the animation, the prediction answers and
 * the challenge stress tests, so all three always agree.
 */
(function () {
  'use strict';
  const DDIA = (window.DDIA = window.DDIA || {});
  const MAX_EVENTS = 50000;

  /** Seeded PRNG (mulberry32): same seed, same sequence, on every machine. */
  function rng(seed) {
    let a = seed >>> 0;
    const next = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return {
      next,
      int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
      pick: (arr) => arr[Math.floor(next() * arr.length)],
      chance: (p) => next() < p,
    };
  }

  /** Min-heap of events ordered by (t, seq): ties run in the order they were scheduled. */
  function queue() {
    const a = [];
    const less = (x, y) => x.t < y.t || (x.t === y.t && x.seq < y.seq);
    return {
      get size() { return a.length; },
      push(ev) {
        a.push(ev);
        let i = a.length - 1;
        while (i > 0) {
          const p = (i - 1) >> 1;
          if (!less(a[i], a[p])) break;
          [a[i], a[p]] = [a[p], a[i]];
          i = p;
        }
      },
      pop() {
        const top = a[0];
        const last = a.pop();
        if (a.length) {
          a[0] = last;
          let i = 0;
          for (;;) {
            const l = 2 * i + 1, r = l + 1;
            let m = i;
            if (l < a.length && less(a[l], a[m])) m = l;
            if (r < a.length && less(a[r], a[m])) m = r;
            if (m === i) break;
            [a[i], a[m]] = [a[m], a[i]];
            i = m;
          }
        }
        return top;
      },
    };
  }

  /**
   * Run a model to completion.
   * model: { init(ctx, config) → state, handle(ctx, state, ev), finish?(ctx, state) → stats }
   * ctx:   { now, config, rng, schedule(delay, type, data), at(time, type, data), emit(type, data) }
   * Returns { trace: [{t, type, ...data}], stats, state }.
   */
  function run(model, config, seed = 1) {
    const q = queue();
    const trace = [];
    let seq = 0;
    let count = 0;
    const ctx = {
      now: 0,
      config,
      rng: rng(seed),
      schedule(delay, type, data) { q.push({ t: ctx.now + Math.max(0, delay), seq: seq++, type, data: data || {} }); },
      at(time, type, data) { q.push({ t: Math.max(ctx.now, time), seq: seq++, type, data: data || {} }); },
      emit(type, data) { trace.push(Object.assign({ t: ctx.now, type }, data)); },
    };
    const state = model.init(ctx, config);
    while (q.size) {
      if (++count > MAX_EVENTS) throw new Error(`simulation ran away (more than ${MAX_EVENTS} events)`);
      const ev = q.pop();
      ctx.now = ev.t;
      model.handle(ctx, state, ev);
    }
    const stats = model.finish ? model.finish(ctx, state) : {};
    return { trace, stats, state };
  }

  /**
   * Optional network module: random latency and crashed nodes.
   * send() emits `send` (with its arrive time, so renderers can animate it) and schedules a
   * `deliver` event; the model calls arrived(ev) when handling it, which drops the message
   * if the receiver is down by then. Messages from a down sender are dropped at once.
   */
  function net(ctx, o) {
    // latency: [lo, hi] uniform ms, or a function(rng) → ms for skewed (tail-heavy) networks
    const delay = typeof o.latency === 'function' ? () => o.latency(ctx.rng) : () => ctx.rng.int(o.latency[0], o.latency[1]);
    const isDown = o.isDown || (() => false);
    let id = 0;
    return {
      send(from, to, payload, extra = 0) {
        const mid = ++id;
        if (isDown(from, ctx.now)) { ctx.emit('drop', { id: mid, from, to, payload, early: true }); return mid; }
        const d = delay() + extra;
        ctx.emit('send', { id: mid, from, to, payload, arrive: ctx.now + d });
        ctx.schedule(d, 'deliver', { id: mid, from, to, payload });
        return mid;
      },
      arrived(ev) {
        const d = ev.data;
        if (isDown(d.to, ctx.now)) { ctx.emit('drop', { id: d.id, from: d.from, to: d.to, payload: d.payload }); return false; }
        return true;
      },
    };
  }

  DDIA.sim = { rng, run, net, MAX_EVENTS };
})();
