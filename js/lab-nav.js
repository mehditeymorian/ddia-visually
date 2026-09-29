/* DDIA Visual Guide — Playground navigation: the lab header, scenario cards, the overview
 * grid and the strip above the model. status() is pure so scripts/labtest.mjs can test it;
 * everything else builds DOM when called, never at load time. See LABS.md. */
(function () {
  'use strict';
  const DDIA = (window.DDIA = window.DDIA || {});

  const isChallenge = (l, tab) => l.challenges.some((c) => c.id === tab.id);

  /** Where the learner stands on one preset or challenge. prog = store.labs[labId]; old saves lack f and s. */
  function status(l, tab, prog) {
    const p = (prog && prog.p) || {};
    const c = (prog && prog.c) || {};
    const s = (prog && prog.s) || {};
    if (isChallenge(l, tab)) {
      if (c[tab.id]) return { kind: 'passed', label: 'Passed' };
      if (s[tab.id]) return { kind: 'seen', label: 'Solution seen' };
      return { kind: 'open', label: 'Not passed yet' };
    }
    if (!tab.predict) return { kind: 'sandbox', label: 'Sandbox' };
    const r = p[tab.id];
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

  // the lab's own drawing of how the tab starts; a broken sketch only loses the picture
  function sketchEl(l, tab) {
    try {
      return DDIA.viz.h('span', { class: 'lab-sketch', 'aria-hidden': 'true', html: l.sketch(DDIA.lab.configFor(l, tab.config)) });
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
   *  Returns { el, paint }; call paint() after progress changes. */
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
      return h('a', { class: 'lab-chip' + (here ? ' current' : ''), href: `#/lab/${l.id}/${t.id}`, 'aria-current': here ? 'page' : null, 'data-nav': 'strip' },
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
    // on narrow screens the row scrolls sideways: bring the current card into view
    requestAnimationFrame(() => {
      const c = row.querySelector('.current');
      if (c && row.scrollWidth > row.clientWidth) row.scrollLeft = Math.max(0, c.offsetLeft - (row.clientWidth - c.offsetWidth) / 2);
    });
    return { el, paint };
  }

  DDIA.labnav = { status, header, grid, overview, strip };
})();
