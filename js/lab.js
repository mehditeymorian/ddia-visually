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
        const ok = within(l.run(cfg, input).stats[c.metric], c);
        return { label: c.label, ok, text: ok ? `yes, in this ${one}` : `not in this ${one}` };
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

  /* =====================================================================
   * Page UI (DOM). Called by app.js; never at load time.
   * env: { icon(name), progress(labId) → {p, c}, save(), related(labId, tabId) → [{href, text}],
   *        replaceHash(hash), chapterTitle(id), onProgress() }
   * ===================================================================== */
  function parseQuery(qs) {
    const out = {};
    String(qs || '').split('&').forEach((part) => {
      if (!part) return;
      const i = part.indexOf('=');
      try { out[decodeURIComponent(i < 0 ? part : part.slice(0, i))] = decodeURIComponent(i < 0 ? '' : part.slice(i + 1)); } catch (e) { /* ignore bad escapes */ }
    });
    return out;
  }
  // Only knobs the tab lets you change may come from the URL; values must match an option.
  function overridesFrom(l, q, editable) {
    const over = {};
    l.knobs.forEach((k) => {
      if (q[k.id] == null || !editable(k.id)) return;
      const opt = k.options.find((o) => String(o.value) === q[k.id]);
      if (opt) over[k.id] = opt.value;
    });
    if (l.slots && q.slots && editable('slots')) over.slots = q.slots.split('.');
    return over;
  }
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  function renderPage(l, tabId, query, v, env) {
    const { h } = DDIA.viz;
    const tabs = l.presets.map((t) => Object.assign({ kind: 'preset' }, t)).concat(l.challenges.map((t) => Object.assign({ kind: 'challenge' }, t)));
    const tab = tabs.find((t) => t.id === tabId) || tabs[0];
    const isCh = tab.kind === 'challenge';
    const q = parseQuery(query);
    const prog = env.progress(l.id);
    const [one, many] = l.sampleNoun;
    const editable = (id) => !isCh || (tab.knobs || []).includes(id);
    const base = () => configFor(l, tab.config);
    const startInput = (c) => (tab.input != null ? clone(tab.input) : l.defaultInput(c));
    const validInput = (inp, c) => inp != null && l.parseInput(l.inputKey(inp), c) != null;

    let cfg = configFor(l, tab.config, overridesFrom(l, q, editable));
    let input = q.run != null ? l.parseInput(q.run, cfg) : null;
    if (input == null) input = startInput(cfg);
    let result = null;
    let view = null;
    let speed = 1;
    let moreOpen = false;
    let allOpen = false;
    let checkRes = null;
    const predict = !isCh && tab.predict ? tab.predict : null;
    let asking = !!predict && prog.p[tab.id] == null && !Object.keys(q).length;

    const btn = (icon, label, kind, onclick, attrs) => h('button', Object.assign({ type: 'button', class: 'vz-btn' + (kind ? ' ' + kind : ''), onclick }, attrs || {}),
      icon ? h('span', { class: 'ic', 'aria-hidden': 'true' }, icon) : null, label);

    /* ----- header + tabs ----- */
    const page = h('div', { class: 'lab', style: { '--pc': 'var(--lab)', '--pcbg': 'var(--lab-bg)' } });
    page.appendChild(h('div', { class: 'ch-head' },
      h('div', { class: 'ch-badge lab-badge' }, env.icon('flask')),
      h('div', { class: 'ch-titles' },
        h('div', { class: 'ch-kicker' }, 'Playground · ' + l.chapters.map((c) => 'Ch ' + c).join(', ')),
        h('h1', { class: 'ch-title' }, l.title),
        h('div', { class: 'ch-tagline' }, l.tagline))));
    const tabsEl = h('nav', { class: 'lab-tabs', 'aria-label': `${l.title}: presets and challenges` });
    function paintTabs() {
      tabsEl.textContent = '';
      tabs.forEach((t, i) => {
        if (t.kind === 'challenge' && tabs[i - 1].kind !== 'challenge') tabsEl.appendChild(h('span', { class: 'lab-tabs-sep' }, 'Challenges'));
        const passed = t.kind === 'challenge' && prog.c[t.id];
        tabsEl.appendChild(h('a', {
          href: `#/lab/${l.id}/${t.id}`,
          class: 'lab-tab' + (t.kind === 'challenge' ? ' ch' : '') + (t === tab ? ' current' : '') + (passed || (t.kind === 'preset' && prog.p[t.id] != null) ? ' done' : ''),
          'aria-current': t === tab ? 'page' : null,
        }, t.kind === 'challenge' ? '★ ' : '', t.title, passed ? h('span', { class: 'ok', 'aria-label': 'passed' }, ' ✓') : null));
      });
    }
    paintTabs();
    page.appendChild(tabsEl);
    const card = h('article', { class: 'card lab-card' });
    page.appendChild(card);

    /* ----- intro: nudge (preset) or goal + fixed settings (challenge) ----- */
    if (isCh) {
      card.appendChild(h('div', { class: 'lab-goal' }, h('b', null, '★ Challenge. '), tab.goal));
      const fixed = [];
      l.knobs.forEach((k) => {
        if (editable(k.id)) return;
        const o = k.options.find((x) => x.value === cfg[k.id]);
        fixed.push(`${k.label}: ${o ? o.label : cfg[k.id]}`);
      });
      if (l.slots && !editable('slots')) fixed.push(`${l.slots.label}: ` + cfg.slots.map((sv) => (l.slots.states.find((x) => x.value === sv) || { label: sv }).label).join(', '));
      if (fixed.length) card.appendChild(h('div', { class: 'lab-fixed' }, h('span', { class: 'lbl' }, 'Fixed'), fixed.join(' · ')));
    } else {
      card.appendChild(h('div', { class: 'lab-nudge' }, env.icon('bulb'), h('span', null, tab.nudge)));
    }

    /* ----- predict-before-you-run ----- */
    const predictEl = h('div', { class: 'lab-predict' });
    const optLabels = ['Never', `In some ${many}`, `In every ${one}`];
    const predictRes = () => DDIA.lab.predict(l, configFor(l, tab.config, predict.config), predict.metric);
    const countText = (r) => `${r.hits} of ${r.total} ${many}`;
    function paintPredict(reveal) {
      predictEl.textContent = '';
      predictEl.hidden = !predict;
      if (!predict) return;
      if (asking) {
        predictEl.className = 'lab-predict asking';
        predictEl.append(
          h('div', { class: 'lab-predict-q' }, h('b', null, 'Predict first. '), predict.q),
          h('div', { class: 'lab-predict-opts' }, optLabels.map((t, i) => h('button', { type: 'button', class: 'lab-opt', onclick: () => answer(i) }, t))),
          h('button', { type: 'button', class: 'lab-textbtn', onclick: skipPredict }, 'Skip, just run it'));
        return;
      }
      predictEl.className = 'lab-predict';
      const saved = prog.p[tab.id];
      if (reveal) {
        const r = predictRes();
        const ok = reveal.a === r.answer;
        predictEl.className = 'lab-predict lab-reveal ' + (ok ? 'k-good' : 'k-bad');
        predictEl.append(h('b', null, ok ? '✓ Right. ' : '✗ Not quite. '), `${optLabels[r.answer]}: ${countText(r)}. `,
          predict.config ? 'The knobs are now set that way. ' : '', askAgainBtn());
      } else if (saved && saved.a >= 0) {
        predictEl.append(h('span', { class: 'lab-predict-mini' }, `You predicted “${optLabels[saved.a]}” ${saved.ok ? '✓' : '✗'}. Answer: ${optLabels[predictRes().answer]}, ${countText(predictRes())}.`), ' ', askAgainBtn());
      } else {
        predictEl.append(h('span', { class: 'lab-predict-mini' }, predict.q), ' ', askAgainBtn('Predict'));
      }
    }
    const askAgainBtn = (label) => h('button', { type: 'button', class: 'lab-textbtn', onclick: () => {
      asking = true;
      cfg = base();
      input = startInput(cfg);
      paintKnobs();
      paintPredict();
      syncHash();
      preview();
    } }, label || 'Ask again');
    function answer(i) {
      const r = predictRes();
      prog.p[tab.id] = { a: i, ok: i === r.answer };
      env.save();
      asking = false;
      paintTabs();
      if (env.onProgress) env.onProgress();
      paintPredict({ a: i });
      if (predict.config) { cfg = configFor(l, cfg, predict.config); paintKnobs(); }
      changed();
    }
    function skipPredict() {
      if (prog.p[tab.id] == null) { prog.p[tab.id] = { a: -1 }; env.save(); }
      asking = false;
      paintPredict();
      changed();
    }
    card.appendChild(predictEl);

    /* ----- stage (the lab's view) ----- */
    const stage = h('div', { class: 'stage lab-stage' });
    card.appendChild(stage);
    const api = {
      lab: l,
      config: () => cfg,
      input: () => input,
      canEdit: (what) => (what === 'order' ? true : editable(what)),
      set: (patch) => setCfg(patch),
      setInput: (inp) => { input = inp; changed(); },
      pace: (ms) => ms / speed,
    };

    /* ----- run bar ----- */
    const inputEl = h('span', { class: 'lab-input' });
    const speedSeg = h('div', { class: 'vz-seg lab-speed', role: 'group', 'aria-label': 'Speed' });
    const paintSpeed = () => {
      speedSeg.textContent = '';
      [1, 3].forEach((x) => speedSeg.appendChild(h('button', { type: 'button', class: speed === x ? 'on' : '', 'aria-pressed': speed === x ? 'true' : 'false', onclick: () => { speed = x; paintSpeed(); } }, x + '×')));
    };
    paintSpeed();
    card.appendChild(h('div', { class: 'lab-runbar' },
      btn('▶', 'Replay', 'primary', () => play(true)),
      btn('⇥', 'Skip to end', '', () => play(false)),
      btn('⇄', l.nextLabel || 'Next run', '', () => { input = l.nextInput(cfg, input); changed({ keepCheck: true }); }),
      btn('↺', 'Reset', 'ghost', () => { cfg = base(); input = startInput(cfg); paintKnobs(); changed(); }),
      speedSeg, inputEl));

    /* ----- readouts ----- */
    const readouts = h('div', { class: 'lab-readouts', 'aria-live': 'polite' });
    card.appendChild(readouts);
    function paintReadouts(stats) {
      readouts.textContent = '';
      if (!stats) {
        readouts.appendChild(h('span', { class: 'lab-verdict pending' }, asking ? 'waiting for your prediction' : 'running…'));
        l.metrics.forEach((m) => readouts.appendChild(h('div', { class: 'lab-stat' }, h('b', null, '…'), h('span', null, m.label))));
        return;
      }
      const c = l.classify(stats, cfg);
      readouts.appendChild(h('span', { class: 'lab-verdict k-' + c.kind }, c.label));
      l.metrics.forEach((m) => {
        const val = stats[m.id];
        const kind = m.plain ? '' : val > 0 ? m.kind : 'good';
        readouts.appendChild(h('div', { class: 'lab-stat' + (kind ? ' k-' + kind : '') }, h('b', null, m.fmt ? m.fmt(val) : String(val)), h('span', null, m.label)));
      });
    }

    /* ----- knobs (at most 3 per tab, the rest behind "More knobs") ----- */
    const knobsEl = h('div', { class: 'lab-knobs' });
    card.appendChild(knobsEl);
    function knobRow(k) {
      return h('div', { class: 'lab-knob' },
        h('span', { class: 'lab-knob-label' }, k.label),
        h('div', { class: 'vz-seg', role: 'group', 'aria-label': k.label }, k.options.map((o) => {
          const on = cfg[k.id] === o.value;
          const off = l.disabled ? l.disabled(cfg, k.id, o.value) : false;
          return h('button', { type: 'button', class: on ? 'on' : '', 'aria-pressed': on ? 'true' : 'false', disabled: off && !on ? true : null, onclick: () => { if (!on) setCfg({ [k.id]: o.value }); } }, o.label);
        })));
    }
    function paintKnobs() {
      knobsEl.textContent = '';
      knobsEl.hidden = false;
      const mine = (tab.knobs || []).filter((id) => id !== 'slots');
      mine.forEach((id) => knobsEl.appendChild(knobRow(l.knobs.find((k) => k.id === id))));
      if (!isCh) {
        const rest = l.knobs.filter((k) => !mine.includes(k.id));
        if (rest.length) {
          knobsEl.appendChild(h('button', { type: 'button', class: 'lab-textbtn lab-more', 'aria-expanded': moreOpen ? 'true' : 'false', onclick: () => { moreOpen = !moreOpen; paintKnobs(); } },
            moreOpen ? '− Fewer knobs' : `＋ More knobs (${rest.length})`));
          if (moreOpen) rest.forEach((k) => knobsEl.appendChild(knobRow(k)));
        }
      }
      if (l.slots && editable('slots') && l.slots.hint) knobsEl.appendChild(h('div', { class: 'lab-knob-hint' }, l.slots.hint));
      if (!knobsEl.childNodes.length) knobsEl.hidden = true;
    }
    paintKnobs();

    /* ----- challenge check ----- */
    const checkEl = h('div', { class: 'lab-check' });
    function paintCheck() {
      checkEl.textContent = '';
      const n = l.samples(cfg).length;
      const scopeAll = tab.criteria.some((c) => c.scope !== 'current');
      checkEl.appendChild(h('div', { class: 'lab-check-head' },
        btn('✓', scopeAll ? `Test my design (${n} ${many})` : 'Test my design', 'primary', runCheck),
        prog.c[tab.id] && !checkRes ? h('span', { class: 'lab-passed' }, '★ passed before') : null));
      const list = h('ul', { class: 'lab-criteria' });
      tab.criteria.forEach((c, i) => {
        const r = checkRes && checkRes.results[i];
        list.appendChild(h('li', { class: r ? (r.ok ? 'ok' : 'no') : '' },
          h('span', { class: 'mark', 'aria-hidden': 'true' }, r ? (r.ok ? '✓' : '✕') : '○'),
          h('span', null, h('b', null, c.label), r && r.text ? h('span', { class: 'why' }, ' · ' + r.text) : null)));
      });
      checkEl.appendChild(list);
      if (checkRes && checkRes.ok) checkEl.appendChild(h('div', { class: 'lab-reveal k-good' }, h('b', null, '★ Challenge passed. '), 'Your design holds up.'));
      const fail = checkRes && checkRes.results.find((r) => !r.ok && r.failInput != null);
      if (fail) checkEl.appendChild(btn('◉', `Show a failing ${one}`, 'danger', () => { input = clone(fail.failInput); changed({ keepCheck: true }); }));
      if (tab.hint) checkEl.appendChild(h('details', { class: 'lab-hint' }, h('summary', null, 'Hint'), h('p', null, tab.hint)));
    }
    function runCheck() {
      checkRes = checkChallenge(l, tab, cfg, input);
      if (checkRes.ok && !prog.c[tab.id]) { prog.c[tab.id] = 1; env.save(); paintTabs(); if (env.onProgress) env.onProgress(); }
      paintCheck();
    }
    if (isCh) { card.appendChild(checkEl); paintCheck(); }

    /* ----- every run at once ----- */
    const allEl = h('div', { class: 'lab-all' });
    card.appendChild(allEl);
    function paintAll() {
      allEl.textContent = '';
      const runs = allOpen ? runAll(l, cfg) : null;
      allEl.appendChild(btn('▦', allOpen ? `Hide all ${many}` : `Try all ${l.samples(cfg).length} ${many}`, 'ghost', () => { allOpen = !allOpen; paintAll(); }, { 'aria-expanded': allOpen ? 'true' : 'false' }));
      if (!runs) return;
      const counts = new Map();
      const cur = l.inputKey(input);
      const grid = h('div', { class: 'lab-cells', role: 'group', 'aria-label': `All ${many}` });
      runs.forEach((r) => {
        const c = l.classify(r.stats, cfg);
        const key = c.kind + '|' + c.label;
        counts.set(key, (counts.get(key) || 0) + 1);
        const name = `${l.inputLabel(r.input)}: ${c.label}`;
        grid.appendChild(h('button', { type: 'button', class: `lab-cell k-${c.kind}` + (l.inputKey(r.input) === cur ? ' cur' : ''), title: name, 'aria-label': name, onclick: () => { input = clone(r.input); changed({ keepCheck: true }); } }));
      });
      allEl.appendChild(h('div', { class: 'lab-legend' }, [...counts].map(([key, n]) => {
        const [kind, label] = key.split('|');
        return h('span', { class: 'lab-legend-item' }, h('i', { class: 'k-' + kind }), `${label}: ${n}`);
      }), h('span', { class: 'vz-muted' }, `Click a square to watch that ${one}.`)));
      allEl.appendChild(grid);
    }
    paintAll();

    /* ----- related cards ----- */
    const rel = env.related(l.id, tab.id);
    if (rel.length) page.appendChild(h('div', { class: 'lab-seen' }, h('span', { class: 'lbl' }, 'Seen in'), rel.map((r) => h('a', { href: r.href }, r.text))));

    /* ----- state changes ----- */
    function setCfg(patch) {
      cfg = configFor(l, cfg, patch);
      if (!validInput(input, cfg)) input = startInput(cfg);
      paintKnobs();
      changed();
    }
    function changed(o) {
      if (!(o && o.keepCheck)) checkRes = null;
      if (isCh) paintCheck();
      if (allOpen) paintAll();
      syncHash();
      if (asking) { asking = false; paintPredict(); }
      play(true);
    }
    function syncHash() {
      const b = base();
      const parts = [];
      l.knobs.forEach((k) => { if (cfg[k.id] !== b[k.id]) parts.push(`${k.id}=${encodeURIComponent(cfg[k.id])}`); });
      if (l.slots && !same(cfg.slots, b.slots)) parts.push('slots=' + cfg.slots.join('.'));
      if (!same(input, startInput(cfg))) parts.push('run=' + encodeURIComponent(l.inputKey(input)));
      env.replaceHash(`#/lab/${l.id}/${tab.id}` + (parts.length ? '?' + parts.join('&') : ''));
    }
    function showError(err) {
      console.error(`Lab ${l.id} failed:`, err);
      stage.textContent = '';
      stage.appendChild(h('div', { class: 'demo-error' }, `This lab failed to run: ${err && err.message}`));
    }
    function compute() {
      try { result = l.run(cfg, input); return true; } catch (err) { showError(err); return false; }
    }
    function play(animate) {
      if (!view) return;
      v.restart();
      if (!compute()) return;
      inputEl.textContent = l.inputLabel(input);
      paintReadouts(null);
      let p;
      try { p = view.render(result, cfg, input, { animate }); } catch (err) { showError(err); return; }
      const mine = result;
      Promise.resolve(p).then(() => { if (mine === result) paintReadouts(mine.stats); });
    }
    function preview() {
      if (!view) return;
      v.restart();
      if (!compute()) return;
      inputEl.textContent = l.inputLabel(input);
      paintReadouts(null);
      try { view.render(result, cfg, input, { preview: true }); } catch (err) { showError(err); }
    }
    paintPredict();
    // mount after insertion, like card demos, so SVG text measurement works
    requestAnimationFrame(() => {
      if (!v.alive) return;
      try { view = l.view(stage, v, api); } catch (err) { showError(err); return; }
      if (asking) preview(); else play(true);
    });
    return page;
  }

  function renderHub(env) {
    const { h } = DDIA.viz;
    const wrap = h('div', { class: 'lab-hub', style: { '--pc': 'var(--lab)', '--pcbg': 'var(--lab-bg)' } });
    wrap.appendChild(h('section', { class: 'lab-hero' },
      h('div', { class: 'ch-badge lab-badge' }, env.icon('flask')),
      h('div', null,
        h('h1', { html: 'The <em>Playground</em>' }),
        h('p', null, 'Labs where you turn the knobs. Each opens ready to run: predict, change one thing, and watch what breaks.'))));
    const grid = h('div', { class: 'lab-tiles' });
    labs.forEach((l) => {
      const prog = env.progress(l.id);
      const done = l.challenges.filter((c) => prog.c[c.id]).length;
      grid.appendChild(h('a', { class: 'lab-tile', href: `#/lab/${l.id}` },
        h('h3', null, l.title),
        h('p', null, l.tagline),
        h('div', { class: 'chips' },
          l.chapters.map((c) => h('span', { class: 'chip tag' }, `Ch ${c} · ${env.chapterTitle(c) || ''}`)),
          (l.styles || []).map((s) => h('span', { class: 'chip style' }, s))),
        h('div', { class: 'meta' }, `${l.presets.length} presets · ${done} of ${l.challenges.length} challenges passed`)));
    });
    wrap.appendChild(grid);
    wrap.appendChild(h('p', { class: 'lab-hub-foot' }, 'Each lab is a small simulation. The same model draws the animation, answers your predictions and grades the challenges, so they always agree.'));
    return wrap;
  }

  /* ---------- labkit: shared building blocks for lab views ---------- */
  /** Timeline order editor (style B): tap a step, move it earlier or later.
   *  A step never passes another step of its own transaction. */
  function orderEditor(parent, o) {
    const { h } = DDIA.viz;
    const state = { order: [], label: () => '', editable: true };
    let sel = null;
    let refocus = false;
    const strip = h('div', { class: 'lab-order-strip', role: 'group', 'aria-label': 'Order of steps' });
    const earlier = h('button', { type: 'button', class: 'vz-btn', onclick: () => move(-1) }, h('span', { class: 'ic', 'aria-hidden': 'true' }, '◀'), 'Earlier');
    const later = h('button', { type: 'button', class: 'vz-btn', onclick: () => move(1) }, 'Later', h('span', { class: 'ic', 'aria-hidden': 'true' }, '▶'));
    const hint = h('span', { class: 'lab-order-hint' });
    const el = h('div', { class: 'lab-order' },
      h('div', { class: 'lab-order-head' }, h('span', { class: 'lab-order-title' }, 'Order of steps'), hint),
      strip,
      h('div', { class: 'lab-order-bar' }, earlier, later));
    parent.appendChild(el);
    const canMove = (d) => state.editable && sel != null && sel + d >= 0 && sel + d < state.order.length && state.order[sel + d] !== state.order[sel];
    function move(d) {
      if (!canMove(d)) return;
      const next = state.order.slice();
      [next[sel], next[sel + d]] = [next[sel + d], next[sel]];
      state.order = next;
      sel += d;
      refocus = true;
      paint();
      o.onChange(next.slice());
    }
    function paint() {
      strip.textContent = '';
      const pos = { 1: 0, 2: 0 };
      state.order.forEach((tx, i) => {
        const k = pos[tx]++;
        strip.appendChild(h('button', {
          type: 'button',
          class: `lab-step t${tx}` + (i === sel ? ' sel' : ''),
          'aria-pressed': i === sel ? 'true' : 'false',
          disabled: state.editable ? null : true,
          onclick: () => { sel = sel === i ? null : i; paint(); },
          onkeydown: (e) => {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); if (sel !== i) sel = i; move(-1); }
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); if (sel !== i) sel = i; move(1); }
          },
        }, h('b', null, 'T' + tx), h('span', null, state.label(tx, k))));
      });
      earlier.disabled = !canMove(-1);
      later.disabled = !canMove(1);
      hint.textContent = !state.editable ? 'fixed here' : sel == null ? 'tap a step, then move it' : 'a step cannot pass its own transaction';
      if (refocus && sel != null && strip.children[sel]) { strip.children[sel].focus(); refocus = false; }
    }
    return {
      el,
      update(s) {
        Object.assign(state, s, { order: s.order.slice() });
        if (sel != null && sel >= state.order.length) sel = null;
        paint();
      },
    };
  }

  lab.renderPage = renderPage;
  lab.renderHub = renderHub;
  lab.parseQuery = parseQuery;
  DDIA.labkit = { orderEditor };
})();
