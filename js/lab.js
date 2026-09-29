/* DDIA Visual Guide — Playground labs: registry, bounding rules, pure helpers, page UI.
 * A lab is a pure model (`run(cfg, input) → {trace, stats}`) plus a `view` that animates
 * the trace. See LABS.md. Nothing here touches the DOM at load time, so the pure helpers
 * run in Node for scripts/labtest.mjs.
 */
(function () {
  'use strict';
  const DDIA = (window.DDIA = window.DDIA || {});

  /* ---------- bounding rules ---------- */
  const LIMITS = { knobs: 7, optionsMin: 2, optionsMax: 5, presetKnobs: 3, slots: 5, slotStates: 4, lanes: 2, steps: 5, nudgeWords: 15, predictOptions: 3 };
  const REQUIRED = ['id', 'title', 'chapters', 'knobs', 'defaults', 'run', 'defaultInput', 'samples', 'inputKey', 'parseInput', 'inputLabel', 'metrics', 'classify', 'view', 'presets'];
  const words = (t) => String(t || '').trim().split(/\s+/).filter(Boolean).length;

  /** Every problem with a lab definition, as readable strings. [] means it follows the rules. */
  function validate(def) {
    const p = [];
    REQUIRED.forEach((k) => { if (def[k] == null) p.push(`missing ${k}`); });
    if (p.length) return p;
    if (def.knobs.length > LIMITS.knobs) p.push(`at most ${LIMITS.knobs} knobs (has ${def.knobs.length})`);
    def.knobs.forEach((k) => {
      const n = (k.options || []).length;
      if (n < LIMITS.optionsMin || n > LIMITS.optionsMax) p.push(`knob ${k.id}: needs ${LIMITS.optionsMin}–${LIMITS.optionsMax} options (has ${n})`);
      if (!(k.id in def.defaults)) p.push(`knob ${k.id}: no default`);
    });
    if (def.slots) {
      if (def.slots.max > LIMITS.slots) p.push(`at most ${LIMITS.slots} slots (has ${def.slots.max})`);
      if (def.slots.states.length > LIMITS.slotStates) p.push(`at most ${LIMITS.slotStates} states per slot (has ${def.slots.states.length})`);
    }
    const editable = new Set(def.knobs.map((k) => k.id));
    if (def.slots) editable.add('slots');
    const metricIds = new Set(def.metrics.map((m) => m.id));
    if (!def.presets.length) p.push('needs at least one preset');
    const ids = new Set();
    const tab = (t, kind) => {
      if (!t.id || !t.title) p.push(`${kind} without id or title`);
      if (ids.has(t.id)) p.push(`duplicate tab id ${t.id}`);
      ids.add(t.id);
      const ks = t.knobs || [];
      if (ks.length > LIMITS.presetKnobs) p.push(`${kind} ${t.id}: at most ${LIMITS.presetKnobs} knobs (has ${ks.length})`);
      ks.forEach((k) => { if (!editable.has(k)) p.push(`${kind} ${t.id}: unknown knob ${k}`); });
      if (def.stepCounts) {
        const counts = def.stepCounts(configFor(def, t.config));
        if (counts.length > LIMITS.lanes) p.push(`${kind} ${t.id}: at most ${LIMITS.lanes} transactions`);
        counts.forEach((n, i) => { if (n > LIMITS.steps) p.push(`${kind} ${t.id}: transaction ${i + 1} has ${n} steps (max ${LIMITS.steps})`); });
      }
    };
    def.presets.forEach((pr) => {
      tab(pr, 'preset');
      if (!pr.nudge) p.push(`preset ${pr.id}: missing nudge`);
      else if (words(pr.nudge) > LIMITS.nudgeWords) p.push(`preset ${pr.id}: nudge has ${words(pr.nudge)} words (max ${LIMITS.nudgeWords})`);
      if (pr.predict) {
        if (!pr.predict.q) p.push(`preset ${pr.id}: predict without a question`);
        if (!metricIds.has(pr.predict.metric)) p.push(`preset ${pr.id}: predict metric ${pr.predict.metric} is not a metric`);
      }
    });
    (def.challenges || []).forEach((ch) => {
      tab(ch, 'challenge');
      if (!ch.goal) p.push(`challenge ${ch.id}: missing goal`);
      if (!ch.criteria || !ch.criteria.length) p.push(`challenge ${ch.id}: no criteria`);
      (ch.criteria || []).forEach((c) => {
        if (!c.test && !metricIds.has(c.metric)) p.push(`challenge ${ch.id}: criterion "${c.label}" needs a metric or a test`);
      });
      if (!ch.solution) p.push(`challenge ${ch.id}: missing solution (used by the tests)`);
    });
    return p;
  }

  /* ---------- registry ---------- */
  const labs = [];
  function lab(def) {
    def.challenges = def.challenges || [];
    def.sampleNoun = def.sampleNoun || ['run', 'runs'];
    def.problems = validate(def);
    if (def.problems.length) console.error(`DDIA.lab(${def.id}): ` + def.problems.join('; '));
    const i = labs.findIndex((l) => l.id === def.id);
    if (i >= 0) labs.splice(i, 1, def); else labs.push(def);
  }
  DDIA.lab = lab;
  DDIA.labs = labs;
  lab.LIMITS = LIMITS;
  lab.validate = validate;
  lab.get = (id) => labs.find((l) => l.id === id);

  /* ---------- pure helpers ---------- */
  const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));

  /** defaults ← base ← overrides, then the lab's normalize() (clamps dependent knobs). */
  function configFor(l, base, over) {
    const cfg = Object.assign(clone(l.defaults), clone(base) || {}, clone(over) || {});
    return l.normalize ? l.normalize(cfg) : cfg;
  }

  // Small per-lab memo so predict, challenge checks and the all-runs grid share one batch of runs.
  const memos = new WeakMap();
  function runAll(l, cfg) {
    let memo = memos.get(l);
    if (!memo) memos.set(l, (memo = new Map()));
    const key = JSON.stringify(cfg);
    if (memo.has(key)) return memo.get(key);
    const out = l.samples(cfg).map((input) => ({ input, stats: l.run(cfg, input).stats }));
    memo.set(key, out);
    if (memo.size > 40) memo.delete(memo.keys().next().value);
    return out;
  }

  /** How often a metric is non-zero across every sample: answer 0 never, 1 sometimes, 2 always. */
  function predict(l, cfg, metric) {
    const all = runAll(l, cfg);
    const hits = all.filter((r) => r.stats[metric] > 0).length;
    return { answer: hits === 0 ? 0 : hits === all.length ? 2 : 1, hits, total: all.length };
  }

  const within = (v, c) => (c.max == null || v <= c.max) && (c.min == null || v >= c.min);

  /** Evaluate a challenge's criteria for a config (and the current input, for scope 'current'). */
  function checkChallenge(l, ch, cfg, input) {
    const [one, many] = l.sampleNoun || ['run', 'runs'];
    const results = ch.criteria.map((c) => {
      if (c.test) {
        const r = c.test(cfg, { runAll: (c2) => runAll(l, c2), run: (c2, i) => l.run(c2, i), lab: l, input });
        return { label: c.label, ok: !!r.ok, text: r.text || '', failInput: r.failInput };
      }
      const m = l.metrics.find((x) => x.id === c.metric) || { label: c.metric };
      if (c.scope === 'current') {
        const v = l.run(cfg, input).stats[c.metric];
        return { label: c.label, ok: within(v, c), text: `this ${one}: ${m.label.toLowerCase()} ${m.fmt ? m.fmt(v) : v}` };
      }
      const all = runAll(l, cfg);
      const bad = all.filter((r) => !within(r.stats[c.metric], c));
      return {
        label: c.label,
        ok: bad.length === 0,
        text: bad.length ? `fails in ${bad.length} of ${all.length} ${many}` : `holds in all ${all.length} ${many}`,
        failInput: bad.length ? bad[0].input : undefined,
      };
    });
    return { ok: results.every((r) => r.ok), results };
  }

  /** Every way to interleave a steps of transaction 1 with b steps of transaction 2. */
  function interleavings(a, b) {
    const out = [];
    const walk = (x, y, acc) => {
      if (!x && !y) { out.push(acc.slice()); return; }
      if (x) { acc.push(1); walk(x - 1, y, acc); acc.pop(); }
      if (y) { acc.push(2); walk(x, y - 1, acc); acc.pop(); }
    };
    walk(a, b, []);
    return out;
  }

  Object.assign(lab, { configFor, runAll, predict, checkChallenge, interleavings, clone });
})();
