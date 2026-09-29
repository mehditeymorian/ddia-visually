/* DDIA Visual Guide — app shell: registry, router, views, progress. */
(function () {
  'use strict';
  const DDIA = (window.DDIA = window.DDIA || {});
  const { h, s } = DDIA.viz;

  const PARTS = {
    1: { title: 'Foundations of data systems', short: 'Foundations', color: 'var(--part1)', bg: 'var(--part1-bg)' },
    2: { title: 'Distributed data', short: 'Distributed data', color: 'var(--part2)', bg: 'var(--part2-bg)' },
    3: { title: 'Derived data', short: 'Derived data', color: 'var(--part3)', bg: 'var(--part3-bg)' },
  };

  const ROMAN = ['', 'I', 'II', 'III'];

  /* ---------- registry ---------- */
  const chapters = [];
  DDIA.chapters = chapters;
  DDIA.chapter = function (def) {
    if (!def || typeof def.id !== 'number') { console.error('DDIA.chapter: missing numeric id', def); return; }
    def.cards = def.cards || [];
    def.cheatsheet = def.cheatsheet || [];
    def.quiz = def.quiz || [];
    const i = chapters.findIndex((c) => c.id === def.id);
    if (i >= 0) chapters.splice(i, 1, def); else chapters.push(def);
    chapters.sort((a, b) => a.id - b.id);
  };
  const getChapter = (id) => chapters.find((c) => c.id === id);
  // All cards of a chapter, including the synthetic cheat-sheet and quiz cards.
  function slides(ch) {
    const list = ch.cards.map((c) => ({ type: 'card', card: c }));
    if (ch.cheatsheet.length) list.push({ type: 'cheat' });
    if (ch.quiz.length) list.push({ type: 'quiz' });
    return list;
  }

  /* ---------- storage ---------- */
  const KEY = 'ddia-visual-guide-v1';
  let store = { seen: {}, quiz: {}, theme: null, labs: {} };
  try { store = Object.assign(store, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* private mode */ }
  // 2026-09-29: two Isolation questions now ask about the setup on screen, so answers saved for the old
  // questions no longer apply. Newer answers carry their question (see DDIA.labnav.saved).
  if ((store.labsVersion || 1) < 2) {
    const iso = store.labs && store.labs.isolation;
    if (iso && iso.p) ['dirty-read', 'lost-update'].forEach((id) => { if (iso.p[id] && iso.p[id].q == null) delete iso.p[id]; });
    store.labsVersion = 2;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* ignore */ } }
  function markSeen(chId, idx) {
    const list = store.seen[chId] || (store.seen[chId] = []);
    store.last = { ch: chId, idx };
    if (!list.includes(idx)) list.push(idx);
    save();
  }
  // Another tab saved: fold its progress into ours (in place, so open lab pages keep their references)
  // instead of letting whichever tab saves last erase the other's work.
  function mergeStore(fresh) {
    Object.entries(fresh.seen || {}).forEach(([k, arr]) => {
      const cur = store.seen[k] || (store.seen[k] = []);
      (arr || []).forEach((i) => { if (!cur.includes(i)) cur.push(i); });
    });
    Object.entries(fresh.quiz || {}).forEach(([k, v]) => { if (store.quiz[k] == null || v > store.quiz[k]) store.quiz[k] = v; });
    Object.entries(fresh.labs || {}).forEach(([id, lp]) => {
      const cur = labProgress(id);
      Object.assign(cur.p, (lp && lp.p) || {});
      Object.entries((lp && lp.c) || {}).forEach(([k, v]) => { if (v) cur.c[k] = v; });
      Object.entries((lp && lp.f) || {}).forEach(([k, v]) => { cur.f[k] = Math.max(cur.f[k] || 0, Number(v) || 0); });
      Object.entries((lp && lp.s) || {}).forEach(([k, v]) => { if (v) cur.s[k] = v; });
    });
    if ('theme' in fresh) store.theme = fresh.theme;
    if (fresh.last) store.last = fresh.last;
  }
  function progressOf(ch) {
    const total = slides(ch).length || 1;
    const seen = (store.seen[ch.id] || []).filter((i) => i < total).length;
    return Math.min(1, seen / total);
  }
  function seenCount(ch) {
    const n = slides(ch).length;
    return (store.seen[ch.id] || []).filter((i) => i < n).length;
  }
  function overallProgress() {
    let seen = 0, total = 0;
    chapters.forEach((c) => { const n = slides(c).length; total += n; seen += Math.min(n, (store.seen[c.id] || []).filter((i) => i < n).length); });
    return total ? seen / total : 0;
  }

  /* ---------- theme ---------- */
  function applyTheme() {
    if (store.theme) document.documentElement.setAttribute('data-theme', store.theme);
    else document.documentElement.removeAttribute('data-theme');
  }
  function isDark() {
    if (store.theme) return store.theme === 'dark';
    return matchMedia('(prefers-color-scheme: dark)').matches;
  }
  function toggleTheme() {
    store.theme = isDark() ? 'light' : 'dark';
    save();
    // swap every colour at once: no half-light, half-dark frames from colour transitions
    const root = document.documentElement;
    root.classList.add('theme-switching');
    applyTheme();
    paintThemeBtn();
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('theme-switching')));
  }

  /* ---------- icons ---------- */
  const svgIcon = (d, w = 2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const ICON = {
    menu: svgIcon('<path d="M4 7h16M4 12h16M4 17h16"/>'),
    sun: svgIcon('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    moon: svgIcon('<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>'),
    left: svgIcon('<path d="M15 18l-6-6 6-6"/>', 2.2),
    right: svgIcon('<path d="M9 18l6-6-6-6"/>', 2.2),
    bulb: svgIcon('<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>'),
    home: svgIcon('<path d="M4 10.5L12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z"/>'),
    search: svgIcon('<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>', 2.2),
    close: svgIcon('<path d="M6 6l12 12M18 6L6 18"/>'),
    flask: svgIcon('<path d="M9 3h6M10 3v6.2L4.6 18.4A1.8 1.8 0 0 0 6.2 21h11.6a1.8 1.8 0 0 0 1.6-2.6L14 9.2V3"/><path d="M7.2 15h9.6"/>'),
    alert: svgIcon('<path d="M12 8v5M12 16.5v.5"/><circle cx="12" cy="12" r="9"/>'),
    quiz: svgIcon('<circle cx="12" cy="12" r="9"/><path d="M9.7 9.4a2.4 2.4 0 1 1 3.3 2.2c-.6.3-1 .8-1 1.5v.3M12 16.6v.4"/>'),
    wrench: svgIcon('<path d="M14.5 5.5a4 4 0 0 0 5 5L12 18l-3.5 3.5a2.1 2.1 0 0 1-3-3L9 15l7.5-7.5z" transform="translate(-1 -1)"/>'),
  };
  const icon = (name) => { if (!ICON[name]) return DDIA.viz.icon(name); const sp = h('span', { html: ICON[name] }); const svg = sp.firstChild; svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false'); return svg; };
  const BRAND = '<svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true"><rect x="1" y="1" width="30" height="30" rx="8" fill="var(--link)"/><ellipse cx="16" cy="10.5" rx="7.5" ry="2.6" fill="none" stroke="var(--on-accent)" stroke-width="2"/><path d="M8.5 10.5v10.5c0 1.4 3.4 2.6 7.5 2.6s7.5-1.2 7.5-2.6V10.5M8.5 15.8c0 1.4 3.4 2.6 7.5 2.6s7.5-1.2 7.5-2.6" fill="none" stroke="var(--on-accent)" stroke-width="2"/></svg>';

  /* ---------- shell ---------- */
  const app = document.getElementById('app');
  let themeBtn, menuBtn, sidebar, main, navLab;
  function buildShell() {
    themeBtn = h('button', { class: 'icon-btn', type: 'button', onclick: toggleTheme });
    menuBtn = h('button', { class: 'icon-btn menu-btn', type: 'button', 'aria-controls': 'sidebar', 'aria-expanded': 'false', 'aria-label': 'Open chapter list', onclick: () => setDrawer(!document.body.classList.contains('drawer-open')) }, icon('menu'));
    navLab = h('a', { class: 'top-link', href: '#/lab' }, 'Playground');
    const topbar = h('header', { class: 'topbar' },
      menuBtn,
      h('a', { class: 'brand', href: '#/', 'aria-label': 'DDIA visually, home', html: BRAND + '<span class="brand-name" aria-hidden="true">DDIA visually</span>' }),
      buildSearch(),
      h('div', { class: 'spacer' }),
      h('nav', { class: 'top-nav', 'aria-label': 'Sections' }, navLab),
      h('button', { class: 'icon-btn search-toggle', type: 'button', 'aria-label': 'Search', onclick: openSearch }, icon('search')),
      themeBtn,
    );
    sidebar = h('nav', { class: 'sidebar', id: 'sidebar', 'aria-label': 'Chapters' });
    main = h('main', { class: 'main', id: 'main', tabindex: '-1' });
    const scrim = h('div', { class: 'scrim', 'aria-hidden': 'true', onclick: () => setDrawer(false) });
    // the router owns the hash, so the skip link moves focus instead of navigating
    const skip = h('a', { class: 'skip-link', href: '#main', onclick: (e) => { e.preventDefault(); main.focus(); } }, 'Skip to content');
    app.append(skip, topbar, h('div', { class: 'layout' }, sidebar, main), scrim);
    paintThemeBtn();
  }
  function paintTopNav(where) {
    [[navLab, 'lab']].forEach(([a, key]) => {
      a.classList.toggle('active', where === key);
      if (where === key) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }
  function setDrawer(open, returnFocus) {
    const was = document.body.classList.contains('drawer-open');
    document.body.classList.toggle('drawer-open', open);
    menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    menuBtn.setAttribute('aria-label', open ? 'Close chapter list' : 'Open chapter list');
    menuBtn.innerHTML = open ? ICON.close : ICON.menu;
    if (open && !was) {
      const target = sidebar.querySelector('[aria-current="page"], [aria-current="true"], .side-link.active') || sidebar.querySelector('a');
      if (target) setTimeout(() => target.focus({ preventScroll: true }), 30);
    }
    if (!open && was && returnFocus) menuBtn.focus();
  }
  function paintThemeBtn() {
    const dark = isDark();
    themeBtn.innerHTML = dark ? ICON.sun : ICON.moon;
    const label = dark ? 'Switch to light theme' : 'Switch to dark theme';
    themeBtn.setAttribute('aria-label', label);
    themeBtn.title = label;
  }
  function paintOverall() { /* progress lives in the sidebar */ }

  // Short label for a slide (card, cheat sheet or quiz) in lists and tooltips.
  function slideLabel(sl) { return sl.type === 'card' ? sl.card.title : sl.type === 'cheat' ? 'Cheat sheet' : 'Quick check'; }
  function slideNum(sl, i) { return sl.type === 'card' ? String(i + 1) : sl.type === 'cheat' ? icon('list') : icon('quiz'); }
  const closeDrawer = () => setDrawer(false);
  const doneMark = () => h('span', { class: 'done' }, icon('check'), h('span', { class: 'sr-only' }, ' (complete)'));
  const sep = () => h('span', { class: 'sep', 'aria-hidden': 'true' }, '/');

  function paintSidebar(activeId, activeIdx, labActive) {
    const keepScroll = sidebar.scrollTop;
    sidebar.textContent = '';
    const pct = Math.round(overallProgress() * 100);
    sidebar.appendChild(h('div', { class: 'side-progress' },
      h('span', null, `${pct}% of the book explored`), h('div', { class: 'bar', 'aria-hidden': 'true' }, h('i', { style: { clipPath: `inset(0 ${100 - pct}% 0 0)` } }))));
    const onHome = activeId == null && labActive == null;
    sidebar.appendChild(h('a', { class: 'side-link' + (onHome ? ' active' : ''), href: '#/', 'aria-current': onHome ? 'page' : null, onclick: closeDrawer },
      h('span', { class: 'num' }, icon('home')), h('span', { class: 't' }, 'Contents')));
    if (DDIA.labs && DDIA.labs.length) {
      const lab = labActive && labActive.id ? DDIA.lab.get(labActive.id) : null;
      const onHub = labActive && !lab;
      sidebar.appendChild(h('a', { class: 'side-link' + (onHub ? ' active' : lab ? ' open' : ''), href: '#/lab', 'aria-current': onHub ? 'page' : null, onclick: closeDrawer },
        h('span', { class: 'num' }, icon('flask')), h('span', { class: 't' }, 'Playground'),
        h('span', { class: 'side-count' }, `${DDIA.labs.length} labs`)));
    }
    [1, 2, 3].forEach((p) => {
      const list = chapters.filter((c) => c.part === p);
      if (!list.length) return;
      const box = h('div', { class: 'side-part' }, h('div', { class: 'side-part-title' }, `Part ${ROMAN[p]} · ${PARTS[p].title}`));
      list.forEach((c) => {
        const seen = seenCount(c), total = slides(c).length;
        const open = c.id === activeId;
        box.appendChild(h('a', {
          class: 'side-link' + (open ? ' open' : ''),
          href: `#/ch/${c.id}`,
          onclick: closeDrawer,
        }, h('span', { class: 'num' }, String(c.id)), h('span', { class: 't' }, c.title),
          seen >= total ? doneMark() : seen ? h('span', { class: 'frac', title: `${seen} of ${total} opened` }, `${seen}/${total}`) : null));
        if (open) {
          // the open chapter lists every card so any of them is one click away
          const seenList = store.seen[c.id] || [];
          const cards = h('div', { class: 'side-cards' });
          slides(c).forEach((sl, i) => {
            const on = i === activeIdx;
            cards.appendChild(h('a', {
              class: 'side-card' + (on ? ' active' : '') + (seenList.includes(i) ? ' seen' : ''),
              href: `#/ch/${c.id}/${i + 1}`,
              'aria-current': on ? 'page' : null,
              onclick: closeDrawer,
            }, h('span', { class: 'n' }, slideNum(sl, i)), h('span', { class: 't' }, slideLabel(sl)),
              seenList.includes(i) && !on ? h('span', { class: 'seen-mark' }, icon('check'), h('span', { class: 'sr-only' }, ' (seen)')) : null));
          });
          box.appendChild(cards);
        }
      });
      sidebar.appendChild(box);
    });
    sidebar.scrollTop = keepScroll;
    const act = sidebar.querySelector('.side-card.active');
    if (act) {
      const top = act.offsetTop, bottom = top + act.offsetHeight;
      if (top < sidebar.scrollTop + 8) sidebar.scrollTop = top - 60;
      else if (bottom > sidebar.scrollTop + sidebar.clientHeight - 8) sidebar.scrollTop = bottom - sidebar.clientHeight + 60;
    }
  }

  /* ---------- home ---------- */
  // Where a reader picks up: the last card they opened, or chapter 1.
  function resumeTarget() {
    const last = store.last && getChapter(store.last.ch);
    if (!last) return null;
    const list = slides(last);
    const idx = Math.max(0, Math.min(list.length - 1, store.last.idx || 0));
    return { ch: last, idx, label: slideLabel(list[idx]) };
  }
  // First slide of a chapter the reader has not opened yet (null when all are seen).
  function nextUnseen(ch) {
    const seen = store.seen[ch.id] || [];
    const list = slides(ch);
    const i = list.findIndex((_, k) => !seen.includes(k));
    return i < 0 ? null : { idx: i, label: slideLabel(list[i]) };
  }
  function renderHome() {
    const wrap = h('div', { class: 'page home' });
    const first = chapters[0];
    const resume = resumeTarget();
    const cta = resume
      ? h('a', { class: 'btn primary', href: `#/ch/${resume.ch.id}/${resume.idx + 1}` }, 'Continue reading', icon('right'))
      : first ? h('a', { class: 'btn primary', href: `#/ch/${first.id}` }, 'Start reading', icon('right')) : null;
    const where = resume
      ? h('span', { class: 'hero-resume' }, `Chapter ${resume.ch.id} · `, h('b', null, resume.label))
      : first ? h('span', { class: 'hero-resume' }, `Chapter ${first.id} · `, h('b', null, first.title)) : null;
    wrap.appendChild(h('section', { class: 'hero' },
      h('h1', null, 'Data systems, drawn.'),
      h('p', { class: 'lede' }, 'Every chapter of the book as pictures you can poke. Break it, then switch on the fix and watch it work.'),
      h('div', { class: 'hero-actions' }, cta, h('a', { class: 'hero-alt', href: '#contents', onclick: (e) => { e.preventDefault(); const t = document.getElementById('contents'); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }, 'Browse all chapters')),
      where));

    wrap.appendChild(h('div', { class: 'callout note' }, icon('bulb'), h('div', null,
      h('b', null, 'Reading the drawings'),
      h('div', { class: 'legend' },
        legendPill('<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="3" fill="var(--k-primary-f)" stroke="var(--k-primary-s)" stroke-width="1.6"/></svg>', 'box', 'a machine or service'),
        legendPill('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7v10c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V7" fill="var(--k-good-f)" stroke="var(--k-good-s)" stroke-width="1.6"/><ellipse cx="12" cy="7" rx="7" ry="2.5" fill="var(--k-good-f)" stroke="var(--k-good-s)" stroke-width="1.6"/></svg>', 'cylinder', 'a database'),
        legendPill('<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="8" width="20" height="9" rx="4.5" fill="var(--k-data-f)" stroke="var(--k-data-s)" stroke-width="1.6"/></svg>', 'pill', 'a message in flight'),
        legendPill('<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="3" fill="var(--k-bad-f)" stroke="var(--k-bad-s)" stroke-width="1.6" stroke-dasharray="3 2"/></svg>', 'red dashed', 'broken')))));

    // Contents: the book's table of contents, with where you are in each chapter.
    const contents = h('section', { class: 'home-sec contents', id: 'contents', 'aria-labelledby': 'contents-h' },
      h('h2', { id: 'contents-h' }, 'Contents'));
    [1, 2, 3].forEach((p) => {
      const list = chapters.filter((c) => c.part === p);
      if (!list.length) return;
      const part = h('div', { class: 'contents-part' }, h('h3', { class: 'contents-part-t' }, `Part ${ROMAN[p]} · ${PARTS[p].title}`));
      const ol = h('ol', { class: 'contents-list' });
      list.forEach((c) => {
        const prog = progressOf(c);
        const seen = seenCount(c);
        const total = slides(c).length;
        const best = store.quiz[c.id];
        const nxt = nextUnseen(c);
        const status = prog >= 1 ? h('span', { class: 'contents-status done' }, icon('check'), 'Read')
          : seen ? h('span', { class: 'contents-status' }, `${seen} of ${total} opened`)
            : h('span', { class: 'contents-status' }, `${c.cards.length} cards`);
        ol.appendChild(h('li', null, h('a', { class: 'contents-row', href: seen && nxt ? `#/ch/${c.id}/${nxt.idx + 1}` : `#/ch/${c.id}` },
          h('span', { class: 'contents-num' + (prog >= 1 ? ' done' : ''), 'aria-hidden': 'true' }, String(c.id)),
          h('span', { class: 'contents-t' },
            h('span', { class: 'contents-name' }, h('span', { class: 'sr-only' }, `Chapter ${c.id}: `), c.title),
            h('span', { class: 'contents-tag' }, c.tagline || ''),
            seen && nxt ? h('span', { class: 'contents-next' }, 'Next: ', nxt.label) : null),
          h('span', { class: 'contents-meta' }, status, best != null ? h('span', { class: 'contents-quiz' }, `Quiz ${best}/${c.quiz.length}`) : null))));
      });
      part.appendChild(ol);
      contents.appendChild(part);
    });
    wrap.appendChild(contents);

    if (DDIA.labs && DDIA.labs.length) {
      wrap.appendChild(h('section', { class: 'home-sec', 'aria-labelledby': 'labs-h' },
        h('h2', { id: 'labs-h' }, 'Playground'),
        h('p', { class: 'lede' }, 'Labs where you turn the knobs. Each opens ready to run: predict, change one thing, and watch what breaks.'),
        DDIA.lab.renderTiles(labEnv, 'h3')));
    }
    wrap.appendChild(h('footer', { class: 'home-foot' },
      'An unofficial, visual study companion for ', h('em', null, 'Designing Data-Intensive Applications'),
      ' by Martin Kleppmann. Original explanations and drawings; not affiliated with the author or publisher. ',
      h('a', { href: 'https://dataintensive.net/', target: '_blank', rel: 'noopener' }, 'Read the book'), '.'));
    return wrap;
  }
  function legendPill(svg, shape, meaning) { return h('span', { class: 'legend-pill', html: svg + `<span><b>${shape}</b> ${meaning}</span>` }); }

  /* ---------- chapter view ---------- */
  let current = null; // { ch, idx, scope }
  function renderChapter(ch, idx) {
    const list = slides(ch);
    idx = Math.max(0, Math.min(list.length - 1, idx || 0));
    const wrap = h('div', { class: 'page chapter' });
    const sl = list[idx];
    const card = h('article', { class: 'card', 'aria-labelledby': 'card-title' });
    wrap.appendChild(card);
    const meta = h('p', { class: 'page-meta' },
      h('a', { href: `#/ch/${ch.id}` }, `Chapter ${ch.id} · ${ch.title}`),
      sl.type === 'card' ? [sep(), h('span', null, `Card ${idx + 1} of ${ch.cards.length}`)] : null);
    const scope = DDIA.viz.scope();
    if (sl.type === 'card') renderCard(card, ch, sl.card, idx, scope, meta);
    else if (sl.type === 'cheat') renderCheat(card, ch, meta);
    else renderQuiz(card, ch, scope, meta);

    // pager: previous and next as docs links; on phones it pins to the bottom edge
    const ci = chapters.indexOf(ch);
    const prevCh = chapters[ci - 1], nextCh = chapters[ci + 1];
    const prevLabel = idx > 0 ? slideLabel(list[idx - 1]) : prevCh ? `Chapter ${prevCh.id}: ${prevCh.title}` : null;
    const back = h('button', { class: 'pager-link back', type: 'button', 'data-nav': 'back', onclick: () => step(-1), disabled: prevLabel ? null : true },
      h('small', null, icon('left'), 'Previous'), h('b', null, h('span', { class: 'full' }, prevLabel || ''), h('span', { class: 'short' }, 'Back')));
    let next;
    const nextBody = (label) => [h('small', null, 'Next', icon('right')), h('b', null, h('span', { class: 'full' }, label), h('span', { class: 'short' }, 'Next'))];
    if (idx < list.length - 1) next = h('button', { class: 'pager-link next', type: 'button', 'data-nav': 'next', onclick: () => step(1) }, nextBody(slideLabel(list[idx + 1])));
    else if (nextCh) next = h('a', { class: 'pager-link next', href: `#/ch/${nextCh.id}`, 'data-nav': 'next' }, nextBody(`Chapter ${nextCh.id}: ${nextCh.title}`));
    else next = h('a', { class: 'pager-link next', href: '#/', 'data-nav': 'next' }, nextBody('Back to the contents'));
    wrap.appendChild(h('nav', { class: 'pager', 'aria-label': 'Card pager' }, back, next,
      h('div', { class: 'pager-count' }, h('span', null, sl.type === 'card' ? `Card ${idx + 1} of ${ch.cards.length}` : slideLabel(sl)), h('span', { 'aria-hidden': 'true' }, h('kbd', null, '←'), ' ', h('kbd', null, '→')))));

    markSeen(ch.id, idx);
    current = { ch, idx, scope, total: list.length, title: slideLabel(sl) };
    return wrap;
  }

  function renderCard(el, ch, card, idx, scope, meta) {
    scope.label = card.title;
    el.appendChild(h('h1', { class: 'card-title', id: 'card-title' }, card.title));
    el.appendChild(meta);
    // the one line of text leads, so the picture is read with its idea in mind
    if (card.caption) el.appendChild(h('p', { class: 'lede' }, card.caption));
    const chips = [];
    if (card.problem) chips.push(h('span', { class: 'chip problem' }, icon('alert'), h('span', { class: 'lbl' }, 'Problem'), card.problem));
    if (card.fix) chips.push(h('span', { class: 'chip fix' }, icon('check'), h('span', { class: 'lbl' }, 'Fix'), card.fix));
    if (chips.length) el.appendChild(h('div', { class: 'chips' }, chips));
    const stage = h('div', { class: 'stage' });
    // the sandbox frame: the live diagram, with a way to start it over from scratch
    const restart = h('button', { type: 'button', class: 'frame-btn', onclick: () => mount(true) }, icon('reset'), 'Restart');
    const frame = h('div', { class: 'sandbox' });
    const ex = DDIA.viz.expander(frame);
    frame.append(h('div', { class: 'sandbox-bar' }, h('span', { class: 'live' }, h('i', { 'aria-hidden': 'true' }), 'Live diagram'), h('span', { class: 'grow' }), ex.btn, restart), stage);
    el.appendChild(frame);
    const foot = [];
    if (card.tags && card.tags.length) foot.push(h('p', { class: 'card-wild' }, h('span', { class: 'lbl' }, 'In the wild:'), ' ', card.tags.join(' · ')));
    const lab = card.lab && DDIA.lab && DDIA.lab.get(card.lab.id);
    if (lab) {
      const qs = Object.entries(card.lab.set || {}).map(([k, val]) => `${k}=${encodeURIComponent(val)}`).join('&');
      foot.push(h('a', { class: 'lab-link', href: `#/lab/${lab.id}/${card.lab.preset}` + (qs ? '?' + qs : '') },
        icon('flask'), h('span', null, 'Try it yourself in the ', h('b', null, lab.title)), icon('right')));
    }
    if (foot.length) el.appendChild(h('div', { class: 'card-foot' }, foot));
    let sc = scope;
    function mount(again) {
      if (again) {
        sc.dispose();
        sc = DDIA.viz.scope();
        sc.label = card.title;
        if (current) current.scope = sc;
        stage.textContent = '';
      }
      if (typeof card.demo !== 'function') return;
      // mount after insertion so SVG text measurement works
      const my = sc;
      requestAnimationFrame(() => {
        if (!my.alive) return;
        try { card.demo(stage, my); } catch (err) {
          console.error(`Demo crashed: ch${ch.id} card ${idx + 1} (${card.title})`, err);
          stage.textContent = '';
          stage.appendChild(demoError('This drawing failed to load.', err));
        }
      });
    }
    mount(false);
  }
  function demoError(msg, err) {
    return h('div', { class: 'demo-error', role: 'alert' },
      h('b', null, msg), ' Reload the page to try again, or move on with Next; the rest of the guide still works.',
      h('details', null, h('summary', null, 'Technical detail'), h('code', null, String(err && err.message || err))));
  }
  DDIA.demoError = demoError;

  // The card that teaches a cheat-sheet term: the first card whose words contain the whole term.
  function cardForTerm(ch, term) {
    const t = norm(term).trim();
    if (t.length < 3) return -1;
    const hay = (c) => norm([c.title, c.caption, c.problem, c.fix].filter(Boolean).join(' '));
    let i = ch.cards.findIndex((c) => norm(c.title).includes(' ' + t + ' '));
    if (i < 0) i = ch.cards.findIndex((c) => hay(c).includes(' ' + t + ' '));
    return i;
  }

  function renderCheat(el, ch, meta) {
    el.appendChild(h('h1', { class: 'card-title', id: 'card-title' }, 'Cheat sheet'));
    el.appendChild(meta);
    el.appendChild(h('p', { class: 'lede' }, `The chapter in ${ch.cheatsheet.length} terms. Follow a card link to see a term drawn.`));
    const grid = h('dl', { class: 'cheat' });
    ch.cheatsheet.forEach((it) => {
      const ci = cardForTerm(ch, it.term);
      grid.appendChild(h('div', { class: 'cheat-item' },
        h('dt', null, it.term),
        h('dd', null, it.text, ci >= 0 ? h('a', { class: 'cheat-link', href: `#/ch/${ch.id}/${ci + 1}` }, `Card ${ci + 1}`, h('span', { class: 'sr-only' }, `: ${ch.cards[ci].title}`)) : null)));
    });
    el.appendChild(grid);
  }

  function renderQuiz(el, ch, scope, meta) {
    el.appendChild(h('h1', { class: 'card-title', id: 'card-title' }, 'Quick check'));
    el.appendChild(meta);
    el.appendChild(h('p', { class: 'lede' }, `${ch.quiz.length} questions on this chapter. Answer with a click, or press 1 to ${ch.quiz.length}.`));
    const box = h('div', { class: 'quiz' });
    el.appendChild(box);
    const results = [];
    const picks = [];
    let qi = 0;
    let answerKey = null; // active question's key handler
    // 1–4 or A–D answer the open question
    const onKey = (e) => {
      if (!answerKey || e.altKey || e.ctrlKey || e.metaKey) return;
      const tag = (e.target && e.target.tagName) || '';
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
      const k = e.key.toLowerCase();
      const i = '12345'.indexOf(k) >= 0 ? '12345'.indexOf(k) : 'abcde'.indexOf(k);
      if (i >= 0) answerKey(i, e);
    };
    document.addEventListener('keydown', onKey);
    scope.onDispose(() => document.removeEventListener('keydown', onKey));
    function paint(focusFirst) {
      box.textContent = '';
      answerKey = null;
      const n = ch.quiz.length;
      const prog = h('div', { class: 'quiz-progress' },
        h('div', { class: 'quiz-bars', 'aria-hidden': 'true' }, ch.quiz.map((_, i) => h('i', { class: results[i] === true ? 'ok' : results[i] === false ? 'no' : i === qi ? 'cur' : '' }))),
        h('span', { class: 'quiz-count' }, qi < n ? `Question ${qi + 1} of ${n}` : `${n} of ${n} answered`));
      box.appendChild(prog);
      if (qi >= n) return paintScore(focusFirst);
      const q = ch.quiz[qi];
      const qid = `quiz-q-${ch.id}-${qi}`;
      box.appendChild(h('p', { class: 'quiz-q', id: qid }, q.q));
      const opts = h('div', { class: 'quiz-opts', role: 'group', 'aria-labelledby': qid });
      const buttons = q.options.map((o, i) => {
        const b = h('button', { type: 'button', class: 'quiz-opt', onclick: () => answer(i) }, h('span', { class: 'letter', 'aria-hidden': 'true' }, 'ABCDE'[i]), h('span', null, o));
        opts.appendChild(b);
        return b;
      });
      box.appendChild(opts);
      answerKey = (i, e) => { if (i < buttons.length) { e.preventDefault(); answer(i); } };
      if (focusFirst) buttons[0].focus({ preventScroll: true });
      function answer(i) {
        answerKey = null;
        const ok = i === q.answer;
        results[qi] = ok;
        picks[qi] = i;
        buttons.forEach((b, j) => {
          b.disabled = true;
          if (j === q.answer) { b.classList.add('right'); b.appendChild(h('span', { class: 'sr-only' }, ' (correct answer)')); }
          else if (j === i) { b.classList.add('wrong'); b.appendChild(h('span', { class: 'sr-only' }, ' (your answer)')); }
        });
        box.querySelectorAll('.quiz-bars i')[qi].className = ok ? 'ok' : 'no';
        box.appendChild(h('div', { class: 'quiz-why ' + (ok ? 'k-good' : 'k-bad'), role: 'status' }, h('b', null, icon(ok ? 'check' : 'x'), ok ? 'Right.' : 'Not quite.'), h('span', null, q.why || '')));
        const last = qi === ch.quiz.length - 1;
        const nextBtn = h('button', { type: 'button', class: 'btn primary', onclick: () => { qi++; paint(true); } }, last ? 'See my score' : 'Next question', icon('right'));
        box.appendChild(h('div', { class: 'quiz-foot' }, nextBtn));
        nextBtn.focus({ preventScroll: true });
      }
    }
    function paintScore(focusScore) {
      const score = results.filter(Boolean).length;
      const n = ch.quiz.length;
      const prev = store.quiz[ch.id];
      if (prev == null || score > prev) { store.quiz[ch.id] = score; save(); }
      // one threshold for both the colour and the words
      const r = score / n;
      const kind = r >= 0.8 ? 'good' : r >= 0.5 ? 'warn' : 'bad';
      const msg = score === n ? 'Perfect. You own this chapter.'
        : kind === 'good' ? 'Strong. One slip to review below.'
          : kind === 'warn' ? 'Getting there. Review the misses below.'
            : 'Worth another pass through the cards. The misses are below.';
      const complete = progressOf(ch) >= 1;
      const scoreEl = h('div', { class: 'quiz-score k-' + kind, role: 'status', tabindex: '-1', 'aria-label': `Score ${score} of ${n}. ${msg}` },
        h('div', { class: 'quiz-total', 'aria-hidden': 'true' }, `${score} of ${n} right`),
        h('p', { class: 'big' }, msg),
        complete ? h('p', { class: 'quiz-done' }, icon('check'), `You've opened every card in chapter ${ch.id}.`) : null,
        h('div', { class: 'quiz-foot' },
          h('button', { type: 'button', class: 'btn', onclick: () => { results.length = 0; picks.length = 0; qi = 0; paint(true); } }, icon('reset'), 'Try again')));
      box.appendChild(scoreEl);
      if (focusScore) scoreEl.focus({ preventScroll: true });
      const review = h('ol', { class: 'quiz-review', 'aria-label': 'Your answers' });
      ch.quiz.forEach((q, i) => {
        const ok = results[i];
        review.appendChild(h('li', { class: ok ? 'ok' : 'no' },
          h('span', { class: 'mark' }, icon(ok ? 'check' : 'x'), h('span', { class: 'sr-only' }, ok ? 'Right: ' : 'Missed: ')),
          h('div', null, h('p', { class: 'rq' }, q.q),
            ok ? null : h('p', { class: 'ra' }, h('b', null, 'Answer: '), q.options[q.answer], picks[i] != null ? h('span', { class: 'rp' }, ` (you picked ${q.options[picks[i]]})`) : null),
            ok || !q.why ? null : h('p', { class: 'rw' }, q.why))));
      });
      box.appendChild(review);
      paintSidebar(ch.id, current ? current.idx : null);
    }
    paint(false);
  }

  /* ---------- search ---------- */
  // Searches chapter titles, card titles, captions, problem/fix chips, tags,
  // cheat-sheet terms and playground labs. Every token must match; title hits rank above body hits.
  const norm = (t) => ' ' + String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9+#]+/g, ' ').trim() + ' ';
  const MAX_RESULTS = 40;
  let searchIndex = null;
  let searchBox, searchInput, searchPop, searchSel = 0, searchResults = [];

  function buildIndex() {
    searchIndex = [];
    chapters.forEach((ch) => {
      const cheatIdx = slides(ch).findIndex((sl) => sl.type === 'cheat');
      const part = PARTS[ch.part] || PARTS[1];
      const add = (idx, kind, title, body) => searchIndex.push({
        kind, title, body, scope: ch.title, href: `#/ch/${ch.id}/${idx + 1}`, badge: String(ch.id), pc: part.color, pcbg: part.bg, order: ch.id * 1000 + idx,
        where: `${kind === 'term' ? 'Cheat sheet' : kind === 'chapter' ? 'Chapter' : `Card ${idx + 1}`} · ${ch.short || ch.title}`,
      });
      add(0, 'chapter', ch.title, ch.tagline || '');
      ch.cards.forEach((c, i) => add(i, 'card', c.title,
        [c.caption, c.problem && 'Problem: ' + c.problem, c.fix && 'Fix: ' + c.fix, (c.tags || []).join(', ')].filter(Boolean).join(' · ')));
      if (cheatIdx >= 0) ch.cheatsheet.forEach((t) => add(cheatIdx, 'term', t.term, t.text));
    });
    (DDIA.labs || []).forEach((l, li) => {
      const add = (tab, kind, title, body, i) => searchIndex.push({
        kind, title, body, scope: l.title + ' playground', href: `#/lab/${l.id}` + (tab ? '/' + tab : ''), badge: 'lab', pc: 'var(--lab)', pcbg: 'var(--lab-bg)',
        order: 100000 + li * 100 + i, where: tab ? `${kind === 'challenge' ? 'Challenge' : 'Scenario'} · ${l.title}` : 'Playground lab',
      });
      add(null, 'lab', l.title, l.tagline, 0);
      l.presets.forEach((t, i) => add(t.id, 'preset', t.title, [t.blurb, t.nudge, t.predict && t.predict.q].filter(Boolean).join(' · '), i + 1));
      l.challenges.forEach((t, i) => add(t.id, 'challenge', t.title, [t.blurb, t.goal].filter(Boolean).join(' · '), 50 + i));
    });
    searchIndex.forEach((e) => { e.nt = norm(e.title); e.nb = norm(e.body); e.nc = norm(e.scope); });
  }
  function runSearch(q) {
    if (!searchIndex) buildIndex();
    const nq = norm(q).trim();
    if (!nq) return [];
    const toks = nq.split(' ');
    const hits = [];
    for (const e of searchIndex) {
      let score = 0;
      let ok = true;
      for (const t of toks) {
        let sc = 0;
        if (e.nt.includes(' ' + t)) sc += 6; else if (e.nt.includes(t)) sc += 4;
        if (e.nb.includes(' ' + t)) sc += 2; else if (e.nb.includes(t)) sc += 1;
        if (!sc && e.nc.includes(' ' + t)) sc += 0.5; // "replication quorum": chapter narrows, card matches
        if (!sc) { ok = false; break; }
        score += sc;
      }
      if (!ok) continue;
      if (toks.length > 1) score += e.nt.includes(nq) ? 16 : e.nb.includes(nq) ? 10 : 0;
      // a card that draws the idea outranks the cheat-sheet line that defines it
      score += e.kind === 'chapter' || e.kind === 'lab' ? 2 : e.kind === 'card' ? 1 : 0;
      hits.push({ e, score });
    }
    hits.sort((a, b) => b.score - a.score || a.e.order - b.e.order);
    return hits.slice(0, MAX_RESULTS).map((x) => x.e);
  }
  // Wrap query tokens found in text with <mark>, without touching innerHTML.
  function highlight(text, toks) {
    const frag = document.createDocumentFragment();
    const useful = toks.filter((t) => t.length > 1).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (!useful.length) { frag.append(text); return frag; }
    const re = new RegExp('(' + useful.join('|') + ')', 'gi');
    String(text).split(re).forEach((part, i) => frag.append(i % 2 ? h('mark', null, part) : part));
    return frag;
  }

  // Start the snippet near the first match so the hit is visible in two lines.
  function snippet(body, toks) {
    const low = body.toLowerCase();
    const at = Math.min(...toks.filter((t) => t.length > 1).map((t) => low.indexOf(t)).filter((i) => i >= 0), Infinity);
    if (!isFinite(at) || at < 60) return body;
    const start = body.lastIndexOf(' ', at - 25);
    return '…' + body.slice(start + 1);
  }

  function buildSearch() {
    searchInput = h('input', {
      type: 'search', class: 'search-input', placeholder: 'Search concepts…', 'aria-label': 'Search concepts', autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'go',
      role: 'combobox', 'aria-expanded': 'false', 'aria-controls': 'search-pop', 'aria-autocomplete': 'list',
    });
    searchPop = h('div', { class: 'search-pop', id: 'search-pop', role: 'listbox', 'aria-label': 'Search results' });
    const closeBtn = h('button', { type: 'button', class: 'icon-btn search-close', 'aria-label': 'Close search', onclick: () => { closeSearch(); searchInput.blur(); } }, icon('close'));
    searchBox = h('div', { class: 'search', role: 'search' },
      h('span', { class: 'search-ic', html: ICON.search, 'aria-hidden': 'true' }),
      searchInput,
      h('kbd', { class: 'search-kbd', 'aria-hidden': 'true' }, '/'),
      closeBtn,
      searchPop);
    searchInput.addEventListener('input', () => { searchSel = 0; paintSearch(); });
    searchInput.addEventListener('focus', () => { searchBox.classList.add('open'); searchInput.setAttribute('aria-expanded', 'true'); paintSearch(); });
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); moveSel(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); moveSel(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); if (searchResults[searchSel]) openResult(searchResults[searchSel]); }
      else if (e.key === 'Escape') { e.preventDefault(); closeSearch(); searchInput.blur(); }
    });
    document.addEventListener('pointerdown', (e) => {
      if (!searchBox.contains(e.target) && !e.target.closest('.search-toggle')) closeSearch();
    });
    return searchBox;
  }
  function openSearch() {
    document.body.classList.add('search-open');
    setDrawer(false);
    searchInput.focus();
    searchInput.select();
  }
  function closeSearch() {
    searchBox.classList.remove('open');
    searchInput.setAttribute('aria-expanded', 'false');
    searchInput.removeAttribute('aria-activedescendant');
    document.body.classList.remove('search-open');
  }
  function openResult(e) {
    closeSearch();
    searchInput.blur();
    focusAfterRoute = 'main';
    location.hash = e.href;
  }
  function moveSel(d) {
    if (!searchResults.length) return;
    searchSel = (searchSel + d + searchResults.length) % searchResults.length;
    paintSel();
  }
  function paintSel() {
    searchPop.querySelectorAll('.search-item').forEach((el, i) => {
      el.classList.toggle('sel', i === searchSel);
      el.setAttribute('aria-selected', i === searchSel ? 'true' : 'false');
      if (i === searchSel) {
        searchInput.setAttribute('aria-activedescendant', el.id);
        const top = el.offsetTop, bottom = top + el.offsetHeight;
        if (top < searchPop.scrollTop) searchPop.scrollTop = top - 8;
        else if (bottom > searchPop.scrollTop + searchPop.clientHeight) searchPop.scrollTop = bottom - searchPop.clientHeight + 8;
      }
    });
  }
  const SEARCH_TIPS = ['quorum', 'write skew', 'Kafka', 'B-tree', 'linearizable', 'fencing token', 'MapReduce', 'percentiles', 'snapshot isolation', 'hot spot', 'playground'];
  function tipChips() {
    return h('div', { class: 'search-tips' }, SEARCH_TIPS.map((t) => h('button', {
      type: 'button', class: 'chip tag',
      onclick: () => { searchInput.value = t; searchSel = 0; paintSearch(); searchInput.focus(); },
    }, t)));
  }
  const touchOnly = () => matchMedia('(hover: none)').matches;
  function paintSearch() {
    const q = searchInput.value;
    searchPop.textContent = '';
    searchPop.scrollTop = 0;
    searchInput.removeAttribute('aria-activedescendant');
    if (!q.trim()) {
      searchResults = [];
      searchPop.appendChild(h('div', { class: 'search-empty' },
        h('div', { class: 'search-head' }, 'Try a concept'), tipChips()));
      return;
    }
    searchResults = runSearch(q);
    const toks = norm(q).trim().split(' ');
    if (!searchResults.length) {
      // no dead end: say what happened, then offer ways forward
      searchPop.appendChild(h('div', { class: 'search-empty', role: 'status' },
        h('p', { class: 'search-none' }, h('b', null, `Nothing matches “${q.trim()}”.`), ' Search looks in card titles, captions and cheat sheets, so try one word or a term from the book.'),
        h('div', { class: 'search-head' }, 'Or try'), tipChips(),
        h('a', { class: 'search-map', href: '#/', onclick: (ev) => { ev.preventDefault(); openResult({ href: '#/' }); } }, icon('home'), 'Browse the contents')));
      return;
    }
    const n = searchResults.length;
    searchPop.appendChild(h('div', { class: 'search-head', role: 'status' }, `${n}${n === MAX_RESULTS ? '+' : ''} match${n === 1 ? '' : 'es'}`, touchOnly() ? null : h('span', { class: 'search-keys' }, h('kbd', null, '↑'), h('kbd', null, '↓'), ' to pick, ', h('kbd', null, 'Enter'), ' to open')));
    searchResults.forEach((e, i) => {
      const isLab = e.badge === 'lab';
      searchPop.appendChild(h('a', {
        class: 'search-item' + (i === searchSel ? ' sel' : ''), role: 'option', id: 'sr-' + i, 'aria-selected': i === searchSel ? 'true' : 'false',
        href: e.href,
        style: { '--pc': e.pc, '--pcbg': e.pcbg },
        onclick: (ev) => { ev.preventDefault(); openResult(e); },
        onmousemove: () => { if (searchSel !== i) { searchSel = i; paintSel(); } },
      },
        h('span', { class: 'search-badge' + (e.kind === 'term' ? ' term' : '') + (isLab ? ' lab' : ''), 'aria-hidden': 'true' }, isLab ? icon('flask') : e.badge),
        h('span', { class: 'search-body' },
          h('span', { class: 'search-title' }, highlight(e.title, toks)),
          h('span', { class: 'search-meta' }, e.where),
          e.body ? h('span', { class: 'search-snip' }, highlight(snippet(e.body, toks), toks)) : null)));
    });
    paintSel();
  }
  DDIA.search = runSearch;

  /* ---------- playground labs ---------- */
  function labProgress(id) {
    const all = store.labs || (store.labs = {});
    const p = all[id] || (all[id] = {});
    p.p = p.p || {};
    p.c = p.c || {};
    p.f = p.f || {}; // failed challenge tests; two unlock "Show a solution"
    p.s = p.s || {}; // challenges whose solution was shown
    return p;
  }
  // cards whose `lab` field points at this lab tab (the card is the single source of truth)
  function relatedCards(labId, tabId) {
    const out = [];
    chapters.forEach((ch) => ch.cards.forEach((c, i) => {
      if (c.lab && c.lab.id === labId && c.lab.preset === tabId) out.push({ href: `#/ch/${ch.id}/${i + 1}`, text: `Ch ${ch.id} · ${c.title}` });
    }));
    return out;
  }
  const labEnv = {
    icon,
    progress: labProgress,
    save,
    related: relatedCards,
    chapterTitle: (id) => { const c = getChapter(id); return c ? c.title : ''; },
    replaceHash(hash) {
      if (location.hash === hash) return;
      history.replaceState(null, '', hash);
      lastRoute = parse();
    },
    onProgress() { if (labActive) paintSidebar(null, null, labActive); },
  };

  /* ---------- router ---------- */
  function parse() {
    const m = location.hash.match(/^#\/ch\/(\d+)(?:\/(\d+))?/);
    if (m) return { ch: Number(m[1]), idx: m[2] ? Number(m[2]) - 1 : 0 };
    const lm = location.hash.match(/^#\/lab(?:\/([\w-]+))?(?:\/([\w-]+))?\/?(?:\?(.*))?$/);
    if (lm) return { lab: lm[1] || null, tab: lm[2] || null, query: lm[3] || '', labRoute: true };
    return { home: true };
  }
  function go(chId, idx) { location.hash = `#/ch/${chId}/${idx + 1}`; }
  function step(d) {
    if (!current) return;
    const { ch, idx, total } = current;
    if (idx + d >= 0 && idx + d < total) return go(ch.id, idx + d);
    const i = chapters.indexOf(ch);
    if (d < 0 && i > 0) { const p = chapters[i - 1]; return go(p.id, slides(p).length - 1); }
    if (d > 0 && i < chapters.length - 1) return go(chapters[i + 1].id, 0);
  }
  let lastRoute = null;
  let labScope = null;
  let labActive = null;
  // Where keyboard focus lands after a route change: keep it on the control the reader
  // used (card strip, Back, Next) so repeated presses work, otherwise move it to <main>.
  let focusAfterRoute = null;
  function focusTarget() {
    const a = document.activeElement;
    if (!a || a === document.body) return 'main';
    const nav = a.closest && a.closest('[data-nav]');
    if (nav) return nav.getAttribute('data-nav');
    return 'main';
  }
  function placeFocus(kind) {
    const pick = kind === 'next' ? main.querySelector('[data-nav="next"]')
        : kind === 'back' ? main.querySelector('[data-nav="back"]:not([disabled])')
        : kind === 'strip' ? main.querySelector('.lab-strip [aria-current="page"]') : null;
    (pick || main).focus({ preventScroll: true });
  }
  function route() {
    const focusKind = focusAfterRoute || (lastRoute ? focusTarget() : null);
    focusAfterRoute = null;
    if (current && current.scope) current.scope.dispose();
    if (labScope) labScope.dispose();
    current = null;
    labScope = null;
    labActive = null;
    const r = parse();
    DDIA.viz.closeExpanded();
    main.textContent = '';
    paintTopNav(r.labRoute ? 'lab' : r.home ? 'home' : null);
    if (r.labRoute) {
      const lab = r.lab && DDIA.lab.get(r.lab);
      if (r.lab && !lab) { location.replace('#/lab'); return; }
      if (!lab) {
        main.appendChild(DDIA.lab.renderHub(labEnv));
        paintSidebar(null, null, {});
        document.title = 'Playground — DDIA visually';
      } else if (!r.tab) {
        main.appendChild(DDIA.labnav.overview(lab, labEnv));
        labActive = { id: lab.id, tab: null };
        paintSidebar(null, null, labActive);
        document.title = `${lab.title} — DDIA visually`;
      } else {
        const tab = lab.presets.concat(lab.challenges).find((t) => t.id === r.tab);
        if (!tab) { location.replace(`#/lab/${lab.id}`); return; }
        labScope = DDIA.viz.scope();
        main.appendChild(DDIA.lab.renderPage(lab, tab.id, r.query, labScope, labEnv));
        labActive = { id: lab.id, tab: tab.id };
        paintSidebar(null, null, labActive);
        document.title = `${tab.title} · ${lab.title} — DDIA visually`;
      }
      // moving between tabs of one lab keeps the scroll; opening the lab or its overview starts at the top
      const sameLab = lastRoute && lastRoute.labRoute && lastRoute.lab === r.lab && lastRoute.tab && r.tab;
      if (!sameLab) window.scrollTo(0, 0);
      lastRoute = r;
      paintOverall();
      if (focusKind) placeFocus(focusKind);
      return;
    }
    if (r.home) {
      main.appendChild(renderHome());
      paintSidebar(null);
      document.title = 'DDIA visually — Designing Data-Intensive Applications, drawn';
    } else {
      const ch = getChapter(r.ch);
      if (!ch) { location.hash = '#/'; return; }
      main.appendChild(renderChapter(ch, r.idx));
      paintSidebar(ch.id, current.idx);
      document.title = `${current.title} · ${ch.id}. ${ch.title} — DDIA visually`;
    }
    window.scrollTo(0, 0);
    lastRoute = r;
    paintOverall();
    if (focusKind) placeFocus(focusKind);
  }

  document.addEventListener('keydown', (e) => {
    const tag = (e.target && e.target.tagName) || '';
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag);
    // "/" or Cmd/Ctrl+K jumps to search from anywhere
    if ((e.key === '/' && !typing && !e.metaKey && !e.ctrlKey) || (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey))) {
      e.preventDefault();
      openSearch();
      return;
    }
    if (e.key === 'Escape' && document.body.classList.contains('drawer-open')) { e.preventDefault(); setDrawer(false, true); return; }
    if (!current || e.altKey || e.ctrlKey || e.metaKey || typing) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => paintThemeBtn());
  // progress saved in another tab: merge it and refresh what shows progress
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY || !e.newValue) return;
    let fresh;
    try { fresh = JSON.parse(e.newValue); } catch (err) { return; }
    mergeStore(fresh);
    applyTheme();
    paintThemeBtn();
    paintOverall();
    if (labActive) paintSidebar(null, null, labActive);
    else if (current) paintSidebar(current.ch.id, current.idx);
    else if (lastRoute && lastRoute.labRoute) paintSidebar(null, null, {});
    else paintSidebar(null);
  });

  /* ---------- self-test (index.html?selftest=5, ?selftest=labs or ?selftest=all) ---------- */
  async function selftest(which) {
    const errors = [], warnings = [], cards = [];
    let where = 'boot';
    const push = (msg) => errors.push({ where, msg: String(msg).slice(0, 400) });
    window.addEventListener('error', (e) => push(e.message + (e.error && e.error.stack ? ' | ' + e.error.stack.split('\n').slice(0, 3).join(' ') : '')));
    window.addEventListener('unhandledrejection', (e) => push('unhandled rejection: ' + (e.reason && (e.reason.stack || e.reason.message) || e.reason)));
    const origErr = console.error;
    console.error = (...a) => { push(a.map((x) => (x && x.stack) || String(x)).join(' ')); origErr.apply(console, a); };
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const list = which === 'all' ? chapters.slice() : which === 'labs' ? [] : chapters.filter((c) => String(c.id) === String(which));
    if (!list.length && which !== 'labs') push(`chapter ${which} not registered (syntax error or missing file?)`);
    // drawn content should stay inside each SVG's viewBox
    const checkOverflow = (root) => root.querySelectorAll('svg.vz-svg').forEach((svg, k) => {
      const vb = svg.viewBox.baseVal;
      try {
        const bb = svg.getBBox();
        const over = Math.max(vb.x - bb.x, vb.y - bb.y, bb.x + bb.width - (vb.x + vb.width), bb.y + bb.height - (vb.y + vb.height));
        if (over > 8) warnings.push(`${where}: svg #${k + 1} content overflows viewBox by ${Math.round(over)}px (bbox ${Math.round(bb.x)},${Math.round(bb.y)} ${Math.round(bb.width)}x${Math.round(bb.height)} vs ${vb.width}x${vb.height})`);
      } catch (e) { /* hidden */ }
    });
    for (const ch of list) {
      where = `ch${ch.id}`;
      if (!ch.title || !ch.part || !ch.tagline) warnings.push(`${where}: missing title/part/tagline`);
      if (ch.cards.length < 5) warnings.push(`${where}: only ${ch.cards.length} cards`);
      if (ch.cheatsheet.length < 6) warnings.push(`${where}: cheatsheet has ${ch.cheatsheet.length} items`);
      if (ch.quiz.length < 4) warnings.push(`${where}: quiz has ${ch.quiz.length} questions`);
      ch.quiz.forEach((q, i) => {
        if (!(q.answer >= 0 && q.answer < q.options.length)) push(`${where} quiz ${i + 1}: answer index out of range`);
        if (!q.why) warnings.push(`${where} quiz ${i + 1}: missing why`);
      });
      const n = slides(ch).length;
      for (let i = 0; i < n; i++) {
        where = `ch${ch.id}/${i + 1}`;
        const sl = slides(ch)[i];
        if (sl.type === 'card') {
          const c = sl.card;
          if (!c.title) push('card without title');
          else if (c.title.split(/\s+/).length > 9) warnings.push(`${where}: title has ${c.title.split(/\s+/).length} words`);
          if (!c.caption) warnings.push(`${where}: missing caption`);
          else if (c.caption.split(/\s+/).length > 30) warnings.push(`${where}: caption has ${c.caption.split(/\s+/).length} words`);
          if (typeof c.demo !== 'function') warnings.push(`${where}: no demo`);
        }
        location.hash = `#/ch/${ch.id}/${i + 1}`;
        await wait(600);
        const stage = main.querySelector('.stage');
        const rec = { where, controls: 0 };
        if (stage) {
          const controls = [...stage.querySelectorAll('button')];
          rec.controls = controls.length + stage.querySelectorAll('input').length;
          if (sl.type === 'card' && rec.controls === 0) warnings.push(`${where}: no interactive controls`);
          for (const b of controls) { if (!b.disabled && b.isConnected) { b.click(); await wait(400); } }
          for (const inp of [...stage.querySelectorAll('input')]) {
            if (!inp.isConnected) continue;
            if (inp.type === 'range') {
              for (const val of [inp.max, inp.min, inp.value]) { inp.value = val; inp.dispatchEvent(new Event('input', { bubbles: true })); await wait(200); }
            } else if (inp.type === 'checkbox') {
              inp.click(); await wait(400); inp.click(); await wait(200);
            }
          }
          await wait(2200);
          checkOverflow(stage);
          if (stage.querySelector('.demo-error')) push('demo crashed: ' + stage.querySelector('.demo-error').textContent);
        }
        cards.push(rec);
      }
    }
    // quiz flow: answer every question once
    for (const ch of list) {
      where = `ch${ch.id}/quiz`;
      if (!ch.quiz.length) continue;
      location.hash = `#/ch/${ch.id}/${slides(ch).length}`;
      await wait(500);
      for (let q = 0; q < ch.quiz.length; q++) {
        const opt = main.querySelector('.quiz-opt');
        if (!opt) { push('quiz option missing'); break; }
        opt.click();
        await wait(100);
        const next = main.querySelector('.quiz-foot .btn.primary');
        if (next) next.click();
        await wait(100);
      }
      if (!main.querySelector('.quiz-score')) push('quiz did not reach the score screen');
    }
    if (which === 'all' || which === 'labs') await labsWalk();

    // playground: hub, every preset and challenge tab, every control, solutions, card links
    async function labsWalk() {
      where = 'labs';
      if (!DDIA.labs || !DDIA.labs.length) { push('no labs registered'); return; }
      location.hash = '#/lab';
      await wait(500);
      if (main.querySelectorAll('.lab-tile').length !== DDIA.labs.length) push('playground hub shows the wrong number of labs');
      for (const l of DDIA.labs) {
        where = `lab/${l.id}`;
        if (l.problems && l.problems.length) push('breaks the bounding rules: ' + l.problems.join('; '));
        location.hash = `#/lab/${l.id}`;
        await wait(500);
        const ov = main.querySelector('.lab-overview');
        if (!ov) push('the lab overview did not render');
        else {
          const cards = ov.querySelectorAll('.lab-scn');
          if (cards.length !== l.presets.length + l.challenges.length) push(`the overview shows ${cards.length} cards, expected ${l.presets.length + l.challenges.length}`);
          if (ov.querySelectorAll('.lab-sketch svg').length !== cards.length) push('a scenario card has no sketch');
          checkOverflow(ov);
        }
        for (const t of l.presets.concat(l.challenges)) {
          where = `lab/${l.id}/${t.id}`;
          location.hash = `#/lab/${l.id}/${t.id}`;
          await wait(700);
          const page = main.querySelector('.lab');
          if (!page) { push('lab page did not render'); continue; }
          const cur = page.querySelectorAll('.lab-strip [aria-current="page"]');
          if (cur.length !== 1 || !cur[0].textContent.includes(t.title)) push('the strip does not mark the current card');
          const toggle = page.querySelector('.lab-all-toggle');
          if (!toggle) push('no "All scenarios" button');
          else {
            toggle.click();
            await wait(150);
            if (!page.querySelector('.lab-strip-more .lab-scn')) push('"All scenarios" did not open the grid');
            toggle.click();
            await wait(100);
            if (!page.querySelector('.lab-strip-more').hidden) push('"All scenarios" did not close the grid');
          }
          const opt = page.querySelector('.lab-predict-opts button');
          if (opt) {
            const nudge = page.querySelector('.lab-nudge');
            if (nudge && nudge.getClientRects().length) push('the nudge shows before the prediction');
            // nothing may reveal the outcome while the prediction is open
            if ([...page.querySelectorAll('.lab-runbar .vz-btn')].some((b) => /Run|Skip|Next|Random/.test(b.textContent) && !b.disabled)) push('a control can reveal the outcome before the prediction');
            if (page.querySelector('.lab-cell')) push('the all-runs grid shows before the prediction');
            if (page.querySelector('.lab-verdict:not(.pending)')) push('readouts show the outcome before the prediction');
            opt.click();
            await wait(500);
          }
          for (const b of [...page.querySelectorAll('.lab-card button:not(.lab-cell)')]) {
            if (!b.isConnected || b.disabled) continue;
            b.click();
            await wait(220);
          }
          // "Ask again" reopens the question; answer it so the outcome shows again
          const again = page.querySelector('.lab-predict-opts button');
          if (again) { again.click(); await wait(400); }
          const cell = page.querySelector('.lab-cell');
          if (cell) { cell.click(); await wait(300); } else push('the all-runs grid is missing');
          for (const slot of [...page.querySelectorAll('[data-slot]')]) { slot.dispatchEvent(new MouseEvent('click', { bubbles: true })); await wait(250); }
          const chip = page.querySelector('.lab-step:not([disabled])');
          if (chip) {
            chip.click();
            await wait(100);
            const mover = [...page.querySelectorAll('.lab-order-bar button')].find((b) => !b.disabled);
            if (mover) { mover.click(); await wait(300); }
          }
          await wait(1500);
          checkOverflow(page);
          if (page.querySelector('.demo-error')) push('lab crashed: ' + page.querySelector('.demo-error').textContent);
        }
        for (const [ci, ch] of l.challenges.entries()) {
          where = `lab/${l.id}/${ch.id}/solution`;
          const sol = DDIA.lab.configFor(l, ch.config, ch.solution.config);
          const inp = ch.solution.input != null ? ch.solution.input : ch.input != null ? ch.input : l.defaultInput(sol);
          if (!DDIA.lab.checkChallenge(l, ch, sol, inp).ok) push('the challenge solution does not pass');
          const pr = labProgress(l.id);
          if (pr.c[ch.id]) continue; // the control walk already passed it
          const test = () => {
            const b = [...main.querySelectorAll('.lab-test .vz-btn')].find((x) => /Test my design/.test(x.textContent));
            if (b) { b.focus(); b.click(); }
            return b;
          };
          if (ci === 0) {
            // found without help: open the solution's setup by URL, test it, and it counts as passed
            const qs = Object.entries(ch.solution.config || {}).map(([k, val]) => `${k}=${encodeURIComponent(val)}`);
            if (ch.solution.input != null) qs.push('run=' + encodeURIComponent(l.inputKey(ch.solution.input)));
            location.hash = `#/lab/${l.id}/${ch.id}` + (qs.length ? '?' + qs.join('&') : '');
            await wait(700);
            test();
            await wait(300);
            if (!pr.c[ch.id] || pr.s[ch.id]) push('a pass without the solution should count as "Passed"');
            if (!main.querySelector('.lab-strip [aria-current="page"] .mk.s-passed')) push('the strip does not mark the pass');
            continue;
          }
          location.hash = `#/lab/${l.id}/${ch.id}`;
          await wait(700);
          test(); await wait(200);
          const focused = document.activeElement && document.activeElement.getAttribute('data-k');
          if (focused !== 'test') push('keyboard focus leaves Test my design after a test');
          test(); await wait(200);
          const show = [...main.querySelectorAll('.lab-test .lab-textbtn')].find((b) => /Show a solution/.test(b.textContent));
          if (!show) { push('"Show a solution" did not appear after two failed tests'); continue; }
          show.click();
          await wait(600);
          if ([...main.querySelectorAll('.lab-test .lab-textbtn')].some((b) => /Show a solution/.test(b.textContent))) push('"Show a solution" stays while the solution is loaded');
          test();
          await wait(300);
          if (!main.querySelector('.lab-check .lab-reveal.k-good')) push('the shown solution does not pass in the page');
          if (!pr.s[ch.id] || pr.c[ch.id]) push('a shown solution should count as "Solution seen", not passed');
          if (!main.querySelector('.lab-strip [aria-current="page"] .mk.s-seen')) push('the strip does not mark the solution as seen');
        }
      }
      where = 'card links';
      let firstLinked = null;
      chapters.forEach((ch) => ch.cards.forEach((c, i) => {
        if (!c.lab) return;
        const l = DDIA.lab.get(c.lab.id);
        if (!l || !l.presets.some((p) => p.id === c.lab.preset)) push(`ch${ch.id}/${i + 1}: lab link to a missing lab or preset`);
        else if (!firstLinked) firstLinked = `#/ch/${ch.id}/${i + 1}`;
      }));
      if (firstLinked) {
        location.hash = firstLinked;
        await wait(600);
        const link = main.querySelector('.lab-link');
        if (!link) push(`${firstLinked}: no "Try it" link on the card`);
        else { link.click(); await wait(700); if (!main.querySelector('.lab')) push('the card link did not open the lab'); }
      }
    }
    const pre = h('pre', { id: 'selftest-result' }, JSON.stringify({ ok: errors.length === 0, errors, warnings, cards: cards.length }));
    document.body.appendChild(pre);
    document.title = 'SELFTEST DONE';
  }

  function start() {
    applyTheme();
    buildShell();
    window.addEventListener('hashchange', route);
    route();
    const st = new URLSearchParams(location.search).get('selftest');
    if (st) { DDIA.viz.selftest = true; DDIA.viz.speed = 3; setTimeout(() => selftest(st), 300); }
  }
  DDIA.start = start;
  DDIA._slides = slides;
})();
