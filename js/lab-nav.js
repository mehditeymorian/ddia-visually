/* DDIA Visual Guide — Playground navigation: the lab header, scenario cards, the overview
 * grid and the strip above the model. status() is pure so scripts/labtest.mjs can test it;
 * everything else builds DOM when called, never at load time. See LABS.md. */
(function () {
  'use strict';
  const DDIA = (window.DDIA = window.DDIA || {});

  const isChallenge = (l, tab) => l.challenges.some((c) => c.id === tab.id);

  /** The learner's saved prediction for a preset, or null when there is none or it answered a question
   *  that has since been rewritten (predictions are stamped with the question they answered). */
  function saved(tab, prog) {
    const r = prog && prog.p && prog.p[tab.id];
    if (r == null || !tab.predict) return null;
    return r.q == null || r.q === tab.predict.q ? r : null;
  }

  /** Where the learner stands on one preset or challenge. prog = store.labs[labId]; old saves lack f and s. */
  function status(l, tab, prog) {
    const c = (prog && prog.c) || {};
    const s = (prog && prog.s) || {};
    if (isChallenge(l, tab)) {
      if (c[tab.id]) return { kind: 'passed', label: 'Passed' };
      if (s[tab.id]) return { kind: 'seen', label: 'Solution seen' };
      return { kind: 'open', label: 'Not passed yet' };
    }
    if (!tab.predict) return { kind: 'sandbox', label: 'Sandbox' };
    const r = saved(tab, prog);
    if (r == null) return { kind: 'new', label: 'Not tried' };
    if (r.a === -1) return { kind: 'ran', label: 'Ran without predicting' };
    return r.ok ? { kind: 'right', label: 'Predicted right' } : { kind: 'missed', label: 'Missed' };
  }

  // strip marks: a drawn mark for sighted readers, the status word for screen readers
  const MARK = { right: 'check', passed: 'check', missed: 'x', seen: 'ring' };

  /** The lab's title and "From chapter …" line; the tagline only on the overview. */
  function header(l, env, withTagline) {
    const { h } = DDIA.viz;
    const meta = h('p', { class: 'page-meta' }, h('a', { href: '#/lab' }, 'Playground'), h('span', { class: 'sep', 'aria-hidden': 'true' }, '/'), h('span', null, 'From'));
    l.chapters.forEach((c, i) => {
      if (i) meta.append(h('span', null, 'and'));
      meta.append(h('a', { href: `#/ch/${c}` }, `chapter ${c}` + (env.chapterTitle(c) ? ` · ${env.chapterTitle(c)}` : '')));
    });
    return h('header', { class: 'lab-head' }, h('h1', null, l.title), meta, withTagline ? h('p', { class: 'lede' }, l.tagline) : null);
  }

  /** The lab's drawing of how a tab starts: its config and its opening input (for example the step order). */
  function sketchOf(l, tab) {
    const cfg = DDIA.lab.configFor(l, tab.config);
    return l.sketch(cfg, tab.input != null ? tab.input : l.defaultInput(cfg));
  }
  // a broken sketch only loses the picture
  function sketchEl(l, tab) {
    try {
      return DDIA.viz.h('span', { class: 'lab-sketch', 'aria-hidden': 'true', html: sketchOf(l, tab) });
    } catch (err) {
      console.error(`Lab ${l.id}: the sketch for ${tab.id} failed:`, err);
      return null;
    }
  }

  function card(l, tab, prog, current) {
    const { h } = DDIA.viz;
    const st = status(l, tab, prog);
    const here = tab.id === current;
    return h('a', { class: 'lab-scn' + (here ? ' current' : ''), href: `#/lab/${l.id}/${tab.id}`, 'aria-current': here ? 'page' : null },
      sketchEl(l, tab),
      h('span', { class: 'lab-scn-body' },
        h('span', { class: 'lab-scn-t' }, isChallenge(l, tab) ? h('span', { class: 'ic', 'aria-hidden': 'true' }, DDIA.viz.icon('star')) : null, tab.title),
        h('span', { class: 'lab-scn-b' }, tab.blurb),
        h('span', { class: 'lab-scn-s s-' + st.kind }, st.label)));
  }

  /** Scenarios, then challenges, as cards. `current` marks the tab on screen (null on the overview). */
  function grid(l, env, current) {
    const { h } = DDIA.viz;
    const prog = env.progress(l.id);
    const passed = l.challenges.filter((c) => status(l, c, prog).kind === 'passed').length;
    const group = (title, list) => (list.length
      ? h('section', { class: 'lab-grid-sec' }, h('h2', { class: 'lab-grid-t' }, title), h('div', { class: 'lab-scns' }, list.map((t) => card(l, t, prog, current))))
      : null);
    return h('div', { class: 'lab-grid' },
      group('Scenarios', l.presets),
      group(`Challenges · ${passed} of ${l.challenges.length} passed`, l.challenges));
  }

  /** #/lab/<id>: the lab's menu of ready-made scenarios. */
  function overview(l, env) {
    return DDIA.viz.h('div', { class: 'lab lab-overview' }, header(l, env, true), grid(l, env, null));
  }

  /** One row of compact cards above the model, plus "All scenarios" to open the grid in place.
   *  Returns { el, paint, dispose }; call paint() after progress changes. On wide screens the row
   *  wraps; on phones it scrolls sideways, with faded edges while there is more to see. */
  function strip(l, env, current) {
    const { h } = DDIA.viz;
    const row = h('nav', { class: 'lab-strip', 'aria-label': `${l.title}: scenarios and challenges` });
    const more = h('div', { class: 'lab-strip-more', id: `lab-more-${l.id}`, hidden: true });
    const toggle = h('button', { type: 'button', class: 'lab-all-toggle', 'aria-expanded': 'false', 'aria-controls': more.id, onclick: () => setOpen(more.hidden) },
      h('span', { class: 'ic', 'aria-hidden': 'true' }, DDIA.viz.icon('grid')), 'All scenarios');
    function setOpen(open) {
      more.hidden = !open;
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      more.textContent = '';
      if (open) more.appendChild(grid(l, env, current));
    }
    function chip(t, prog) {
      const st = status(l, t, prog);
      const here = t.id === current;
      const mark = MARK[st.kind];
      return h('a', { class: 'lab-chip' + (here ? ' current' : ''), href: `#/lab/${l.id}/${t.id}`, 'aria-current': here ? 'page' : null, 'data-nav': 'strip', title: st.label },
        isChallenge(l, t) ? h('span', { class: 'ic', 'aria-hidden': 'true' }, DDIA.viz.icon('star')) : null,
        t.title,
        mark ? h('span', { class: 'mk s-' + st.kind, 'aria-hidden': 'true' }, mark === 'ring' ? null : DDIA.viz.icon(mark)) : null,
        mark ? h('span', { class: 'sr-only' }, ` (${st.label})`) : null);
    }
    function paint() {
      const prog = env.progress(l.id);
      row.textContent = '';
      l.presets.forEach((t) => row.appendChild(chip(t, prog)));
      if (l.challenges.length) {
        row.appendChild(h('span', { class: 'lab-strip-sep', 'aria-hidden': 'true' }));
        l.challenges.forEach((t) => row.appendChild(chip(t, prog)));
      }
      if (!more.hidden) setOpen(true);
    }
    const el = h('div', { class: 'lab-nav', onkeydown: (e) => { if (e.key === 'Escape' && !more.hidden) { setOpen(false); toggle.focus(); } } },
      h('div', { class: 'lab-strip-row' }, row, toggle), more);
    paint();
    // when the row is wider than the page it scrolls sideways; faded edges show there is more
    const edges = () => {
      const max = row.scrollWidth - row.clientWidth;
      row.classList.toggle('fade-l', row.scrollLeft > 2);
      row.classList.toggle('fade-r', row.scrollLeft < max - 2);
    };
    row.addEventListener('scroll', edges, { passive: true });
    const ro = window.ResizeObserver ? new ResizeObserver(edges) : null;
    if (ro) ro.observe(row);
    // bring the current card into view
    requestAnimationFrame(() => {
      const c = row.querySelector('.current');
      if (c && row.scrollWidth > row.clientWidth) row.scrollLeft = Math.max(0, c.offsetLeft - (row.clientWidth - c.offsetWidth) / 2);
      edges();
    });
    return { el, paint, dispose: () => { if (ro) ro.disconnect(); } };
  }

  DDIA.labnav = { status, saved, sketchOf, header, grid, overview, strip };
})();
