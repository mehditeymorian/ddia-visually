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
  const ICON = {
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/></svg>',
    left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
    right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>',
    bulb: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/></svg>',
    map: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>',
    grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    flask: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6M10 3v6.2L4.6 18.4A1.8 1.8 0 0 0 6.2 21h11.6a1.8 1.8 0 0 0 1.6-2.6L14 9.2V3"/><path d="M7.2 15h9.6"/></svg>',
  };
  const icon = (name) => { if (!ICON[name]) return DDIA.viz.icon(name); const sp = h('span', { html: ICON[name] }); const svg = sp.firstChild; svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false'); return svg; };
  const BRAND = '<svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true"><rect x="2" y="2" width="28" height="28" rx="9" fill="var(--accent)"/><ellipse cx="16" cy="10.5" rx="7.5" ry="2.6" fill="none" stroke="var(--on-accent)" stroke-width="2"/><path d="M8.5 10.5v10.5c0 1.4 3.4 2.6 7.5 2.6s7.5-1.2 7.5-2.6V10.5M8.5 15.8c0 1.4 3.4 2.6 7.5 2.6s7.5-1.2 7.5-2.6" fill="none" stroke="var(--on-accent)" stroke-width="2"/></svg>';

  /* ---------- shell ---------- */
  const app = document.getElementById('app');
  let themeBtn, menuBtn, overallBar, overallTxt, sidebar, main;
  function buildShell() {
    themeBtn = h('button', { class: 'icon-btn', type: 'button', onclick: toggleTheme });
    menuBtn = h('button', { class: 'icon-btn menu-btn', type: 'button', 'aria-controls': 'sidebar', 'aria-expanded': 'false', 'aria-label': 'Open chapter list', onclick: () => setDrawer(!document.body.classList.contains('drawer-open')) }, icon('menu'));
    overallBar = h('i');
    overallTxt = h('span');
    const topbar = h('header', { class: 'topbar' },
      menuBtn,
      h('a', { class: 'brand', href: '#/', 'aria-label': 'DDIA visually, home', html: BRAND + '<span class="brand-name" aria-hidden="true">DDIA <em>visually</em></span>' }),
      h('div', { class: 'spacer' }),
      buildSearch(),
      h('div', { class: 'spacer' }),
      h('div', { class: 'overall', title: 'Share of all cards you have opened' }, overallTxt, h('div', { class: 'bar', 'aria-hidden': 'true' }, overallBar)),
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
  function setDrawer(open, returnFocus) {
    const was = document.body.classList.contains('drawer-open');
    document.body.classList.toggle('drawer-open', open);
    menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    menuBtn.setAttribute('aria-label', open ? 'Close chapter list' : 'Open chapter list');
    menuBtn.innerHTML = open ? ICON.close : ICON.menu;
    if (open && !was) {
      const target = sidebar.querySelector('[aria-current="true"], .side-link.active') || sidebar.querySelector('a');
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
  function paintOverall() {
    const p = overallProgress();
    overallBar.style.clipPath = `inset(0 ${100 - Math.round(p * 100)}% 0 0 round 3px)`;
    overallTxt.textContent = Math.round(p * 100) + '% explored';
  }

  function ring(p, color, size = 48, stroke = 4) {
    const r = (size - stroke) / 2, c = 2 * Math.PI * r;
    const svg = s('svg', { viewBox: `0 0 ${size} ${size}`, 'aria-hidden': 'true' });
    s('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', stroke: 'var(--surface-3)', 'stroke-width': stroke }, svg);
    if (p > 0) s('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', stroke: color, 'stroke-width': stroke, 'stroke-linecap': 'round', 'stroke-dasharray': `${c * p} ${c}` }, svg);
    return svg;
  }

  // Short label for a slide (card, cheat sheet or quiz) in lists and tooltips.
  function slideLabel(sl) { return sl.type === 'card' ? sl.card.title : sl.type === 'cheat' ? 'Cheat sheet' : 'Quiz'; }
  function slideNum(sl, i) { return sl.type === 'card' ? String(i + 1) : sl.type === 'cheat' ? icon('list') : '?'; }
  const closeDrawer = () => setDrawer(false);
  const doneMark = () => h('span', { class: 'done' }, icon('check'), h('span', { class: 'sr-only' }, ' (complete)'));

  function paintSidebar(activeId, activeIdx, labActive) {
    const keepScroll = sidebar.scrollTop;
    sidebar.textContent = '';
    const pct = Math.round(overallProgress() * 100);
    // phones hide the top-bar progress, so the drawer carries it
    sidebar.appendChild(h('div', { class: 'side-progress' },
      h('span', null, `${pct}% of the book explored`), h('div', { class: 'bar', 'aria-hidden': 'true' }, h('i', { style: { clipPath: `inset(0 ${100 - pct}% 0 0 round 3px)` } }))));
    const onMap = activeId == null && labActive == null;
    sidebar.appendChild(h('a', { class: 'side-link side-home' + (onMap ? ' active' : ''), href: '#/', 'aria-current': onMap ? 'page' : null, onclick: closeDrawer },
      h('span', { class: 'num', style: { '--pc': 'var(--accent)', '--pcbg': 'var(--accent-bg)' } }, icon('map')), h('span', { class: 't' }, 'The map')));
    if (DDIA.labs && DDIA.labs.length) {
      const lab = labActive && labActive.id ? DDIA.lab.get(labActive.id) : null;
      const onHub = labActive && !lab;
      sidebar.appendChild(h('a', { class: 'side-link side-lab' + (onHub ? ' active' : ''), href: '#/lab', 'aria-current': onHub ? 'page' : null, onclick: closeDrawer },
        h('span', { class: 'num', style: { '--pc': 'var(--lab)', '--pcbg': 'var(--lab-bg)' } }, icon('flask')), h('span', { class: 't' }, 'Playground'),
        h('span', { class: 'side-count', title: `${DDIA.labs.length} labs` }, h('span', { 'aria-hidden': 'true' }, String(DDIA.labs.length)), h('span', { class: 'sr-only' }, ` (${DDIA.labs.length} labs)`))));
      if (lab) {
        const prog = labProgress(lab.id);
        const list = h('div', { class: 'side-cards', style: { '--pc': 'var(--lab)', '--pcbg': 'var(--lab-bg)' } });
        list.appendChild(h('div', { class: 'side-lab-name' }, lab.title));
        lab.presets.concat(lab.challenges).forEach((t, i) => {
          const isCh = i >= lab.presets.length;
          const on = t.id === labActive.tab;
          list.appendChild(h('a', {
            class: 'side-card' + (on ? ' active' : '') + ((isCh ? prog.c[t.id] : prog.p[t.id] != null) ? ' seen' : '') + (isCh ? ' extra' : ''),
            href: `#/lab/${lab.id}/${t.id}`, 'aria-current': on ? 'true' : null,
            onclick: closeDrawer,
          }, h('span', { class: 'n' }, isCh ? icon('star') : String(i + 1)), h('span', { class: 't' }, t.title)));
        });
        sidebar.appendChild(list);
      }
    }
    [1, 2, 3].forEach((p) => {
      const list = chapters.filter((c) => c.part === p);
      if (!list.length) return;
      const box = h('div', { class: 'side-part' }, h('div', { class: 'side-part-title' }, `Part ${ROMAN[p]} · ${PARTS[p].short}`));
      list.forEach((c) => {
        const prog = progressOf(c);
        const num = h('span', { class: 'num' }, String(c.id));
        num.appendChild(ring(prog, 'var(--pc)', 32, 3));
        const link = h('a', {
          class: 'side-link' + (c.id === activeId ? ' active' : ''),
          href: `#/ch/${c.id}`,
          style: { '--pc': PARTS[p].color, '--pcbg': PARTS[p].bg },
          onclick: closeDrawer,
        }, num, h('span', { class: 't' }, c.title), prog >= 1 ? doneMark() : null);
        box.appendChild(link);
        if (c.id === activeId) {
          // the open chapter lists every card so any of them is one click away
          const seen = store.seen[c.id] || [];
          const cards = h('div', { class: 'side-cards', style: { '--pc': PARTS[p].color, '--pcbg': PARTS[p].bg } });
          slides(c).forEach((sl, i) => {
            cards.appendChild(h('a', {
              class: 'side-card' + (i === activeIdx ? ' active' : '') + (seen.includes(i) ? ' seen' : '') + (sl.type !== 'card' ? ' extra' : ''),
              href: `#/ch/${c.id}/${i + 1}`,
              'aria-current': i === activeIdx ? 'true' : null,
              onclick: closeDrawer,
            }, h('span', { class: 'n' }, slideNum(sl, i)), h('span', { class: 't' }, slideLabel(sl))));
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
  // Hand-placed "cities" on the map: [x, y] in a 1000 x 580 viewBox.
  const CITY = {
    1: [120, 170], 2: [260, 110], 3: [300, 265], 4: [150, 380],
    5: [455, 160], 6: [585, 95], 7: [620, 260], 8: [470, 330], 9: [590, 440],
    10: [790, 190], 11: [870, 360],
  };
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
    const wrap = h('div', { class: 'home' });
    const first = chapters[0];
    const resume = resumeTarget();
    const cta = resume
      ? h('a', { class: 'btn primary hero-cta', href: `#/ch/${resume.ch.id}/${resume.idx + 1}` },
        h('span', { class: 'hero-cta-t' }, 'Continue', h('small', null, `Chapter ${resume.ch.id} · ${resume.label}`)), icon('right'))
      : first ? h('a', { class: 'btn primary hero-cta', href: `#/ch/${first.id}` },
        h('span', { class: 'hero-cta-t' }, 'Start reading', h('small', null, `Chapter ${first.id} · ${first.title}`)), icon('right')) : null;
    wrap.appendChild(h('section', { class: 'hero' },
      h('h1', { html: 'Data systems, <em>drawn</em>.' }),
      h('p', { class: 'hero-lede' }, 'Every chapter of the book as pictures you can poke. Break it, then switch on the fix and watch it work.'),
      h('div', { class: 'hero-actions' }, cta, h('a', { class: 'hero-alt', href: '#contents' , onclick: (e) => { e.preventDefault(); const t = document.getElementById('contents'); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }, 'or pick any chapter'))));

    const key = h('div', { class: 'map-key' },
      h('span', { class: 'map-key-t' }, 'Reading the drawings'),
      legendPill('<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="3" fill="var(--k-primary-f)" stroke="var(--k-primary-s)" stroke-width="1.6"/></svg>', 'box', 'a machine or service'),
      legendPill('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7v10c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V7" fill="var(--k-good-f)" stroke="var(--k-good-s)" stroke-width="1.6"/><ellipse cx="12" cy="7" rx="7" ry="2.5" fill="var(--k-good-f)" stroke="var(--k-good-s)" stroke-width="1.6"/></svg>', 'cylinder', 'a database'),
      legendPill('<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="8" width="20" height="9" rx="4.5" fill="var(--k-data-f)" stroke="var(--k-data-s)" stroke-width="1.6"/></svg>', 'pill', 'a message in flight'),
      legendPill('<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="3" fill="var(--k-bad-f)" stroke="var(--k-bad-s)" stroke-width="1.6" stroke-dasharray="3 2"/></svg>', 'red dashed', 'broken'));
    wrap.appendChild(h('figure', { class: 'map-wrap' }, buildMap(), h('figcaption', null, key)));

    if (DDIA.labs && DDIA.labs.length) {
      wrap.appendChild(h('a', { class: 'lab-banner', href: '#/lab' },
        h('span', { class: 'lab-badge' }, icon('flask')),
        h('span', { class: 'lab-banner-t' }, h('b', null, 'The Playground'),
          h('span', null, `${DDIA.labs.length} labs where you set the knobs: ${DDIA.labs.map((l) => l.short.toLowerCase()).join(' and ')}. Predict, tweak, break it.`)),
        icon('right')));
    }

    // Contents: the book's table of contents, with where you are in each chapter.
    // On phones it doubles as the trail (the map is too small to read there).
    const contents = h('section', { class: 'contents', id: 'contents', 'aria-labelledby': 'contents-h' },
      h('h2', { id: 'contents-h', class: 'contents-title' }, 'Contents'));
    [1, 2, 3].forEach((p) => {
      const list = chapters.filter((c) => c.part === p);
      if (!list.length) return;
      const part = h('div', { class: 'contents-part', style: { '--pc': PARTS[p].color, '--pcbg': PARTS[p].bg } },
        h('h3', { class: 'contents-part-t' }, h('span', null, `Part ${ROMAN[p]}`), ' ', PARTS[p].title));
      const ol = h('ol', { class: 'contents-list' });
      list.forEach((c) => {
        const prog = progressOf(c);
        const seen = seenCount(c);
        const total = slides(c).length;
        const best = store.quiz[c.id];
        const nxt = nextUnseen(c);
        const pin = h('span', { class: 'contents-pin' }, ring(prog, 'var(--pc)', 44, 3), h('b', null, String(c.id)));
        const status = prog >= 1 ? h('span', { class: 'contents-status done' }, icon('check'), 'Read')
          : seen ? h('span', { class: 'contents-status' }, `${seen} of ${total}`)
            : h('span', { class: 'contents-status quiet' }, `${c.cards.length} cards`);
        ol.appendChild(h('li', null, h('a', { class: 'contents-row', href: seen && nxt ? `#/ch/${c.id}/${nxt.idx + 1}` : `#/ch/${c.id}` },
          pin,
          h('span', { class: 'contents-t' },
            h('span', { class: 'contents-name' }, c.title),
            h('span', { class: 'contents-tag' }, c.tagline || ''),
            seen && nxt ? h('span', { class: 'contents-next' }, 'Next: ', nxt.label) : null),
          h('span', { class: 'contents-meta' }, status, best != null ? h('span', { class: 'contents-quiz' }, `Quiz ${best}/${c.quiz.length}`) : null))));
      });
      part.appendChild(ol);
      contents.appendChild(part);
    });
    wrap.appendChild(contents);
    wrap.appendChild(h('footer', { class: 'home-foot' },
      'An unofficial, visual study companion for ', h('em', null, 'Designing Data-Intensive Applications'),
      ' by Martin Kleppmann. Original explanations and drawings; not affiliated with the author or publisher. ',
      h('a', { href: 'https://dataintensive.net/', target: '_blank', rel: 'noopener' }, 'Read the book'), '.'));
    return wrap;
  }
  function legendPill(svg, shape, meaning) { return h('span', { class: 'legend-pill', html: svg + `<span><b>${shape}</b> ${meaning}</span>` }); }

  function buildMap() {
    const W = 1000, H = 580;
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'map-svg', role: 'group', 'aria-label': 'Map of the book: 11 chapters in 3 parts' });
    // regions; every label sits centred under its region on one shared baseline
    const regions = [
      { p: 1, d: 'M40,90 C60,40 200,30 330,60 C400,80 390,170 380,250 C370,330 300,430 230,470 C150,510 50,470 40,380 C30,300 20,150 40,90 Z', lx: 205 },
      { p: 2, d: 'M405,70 C470,30 640,30 690,80 C730,120 700,220 700,300 C700,400 690,500 600,515 C500,530 420,470 405,390 C390,300 360,120 405,70 Z', lx: 552 },
      { p: 3, d: 'M725,120 C780,70 930,90 960,160 C990,240 960,380 930,440 C890,510 790,500 745,440 C715,390 690,180 725,120 Z', lx: 845 },
    ];
    regions.forEach((r) => {
      s('path', { d: r.d, class: 'map-region', fill: PARTS[r.p].bg, stroke: PARTS[r.p].color }, svg);
      const t = s('text', { x: r.lx, y: 562, 'text-anchor': 'middle', class: 'map-region-label', fill: PARTS[r.p].color }, svg);
      t.textContent = `Part ${ROMAN[r.p]} · ${PARTS[r.p].short}`;
    });
    // decorations: waves between regions + compass
    const deco = s('g', { class: 'map-deco', 'aria-hidden': 'true' }, svg);
    [[360, 530], [700, 60], [30, 40]].forEach(([x, y]) => {
      s('path', { d: `M${x},${y} q8,-7 16,0 t16,0 t16,0`, class: 'map-deco' }, deco);
      s('path', { d: `M${x + 8},${y + 10} q8,-7 16,0 t16,0`, class: 'map-deco' }, deco);
    });
    const comp = s('g', { class: 'map-compass', transform: 'translate(930,52)', 'aria-hidden': 'true' }, svg);
    s('circle', { r: 26, fill: 'none', stroke: 'var(--border-strong)', 'stroke-width': 1.2 }, comp);
    s('path', { d: 'M0,-20 L6,0 L0,20 L-6,0 Z', fill: 'var(--accent)', opacity: 0.85 }, comp);
    const n = s('text', { x: 0, y: -32, 'text-anchor': 'middle' }, comp); n.textContent = 'N';
    // trail
    const allIds = Object.keys(CITY).map(Number);
    const pts = allIds.map((id) => CITY[id]);
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      const mx = (x0 + x1) / 2 + (i % 2 ? 30 : -30), my = (y0 + y1) / 2 + (i % 2 ? -20 : 20);
      d += ` Q${mx},${my} ${x1},${y1}`;
    }
    s('path', { d, class: 'map-trail', 'aria-hidden': 'true' }, svg);
    // cities
    allIds.forEach((id) => {
      const [x, y] = CITY[id];
      const ch = getChapter(id);
      const p = ch ? ch.part : id <= 4 ? 1 : id <= 9 ? 2 : 3;
      const prog = ch ? progressOf(ch) : 0;
      const a = s('a', { href: ch ? `#/ch/${id}` : '#/', class: 'map-city', 'aria-label': `Chapter ${id}: ${ch ? ch.title : 'coming soon'}${prog >= 1 ? ' (read)' : prog > 0 ? ` (${Math.round(prog * 100)}% seen)` : ''}` }, svg);
      // position and hover-scale live on separate elements: a CSS transform on the
      // positioned group would replace its translate() and make the pin jump away
      const at = s('g', { transform: `translate(${x},${y})` }, a);
      const g = s('g', { class: 'pin' }, at);
      const R = 24, C = 2 * Math.PI * (R + 5);
      s('circle', { r: R + 16, class: 'pin-hit' }, g);
      s('circle', { r: R + 5, fill: 'none', stroke: 'var(--surface-3)', 'stroke-width': 4, class: 'pin-ring' }, g);
      if (prog > 0) s('circle', { r: R + 5, fill: 'none', stroke: PARTS[p].color, 'stroke-width': 4, 'stroke-linecap': 'round', 'stroke-dasharray': `${C * prog} ${C}`, transform: 'rotate(-90)' }, g);
      s('circle', { r: R, fill: 'var(--surface)', stroke: PARTS[p].color, 'stroke-width': 2.5 }, g);
      const t = s('text', { 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-family': 'var(--font-display)', 'font-size': 22, 'font-weight': 600, fill: PARTS[p].color }, g);
      t.textContent = id;
      const nm = s('text', { x, y: y + 50, 'text-anchor': 'middle', class: 'map-city-name' }, a);
      nm.textContent = ch ? ch.short || ch.title : '…';
    });
    return svg;
  }

  /* ---------- chapter view ---------- */
  let current = null; // { ch, idx, scope }
  function renderChapter(ch, idx, dir) {
    const list = slides(ch);
    idx = Math.max(0, Math.min(list.length - 1, idx || 0));
    const part = PARTS[ch.part] || PARTS[1];
    const wrap = h('div', { class: 'chapter', style: { '--pc': part.color, '--pcbg': part.bg } });
    wrap.appendChild(h('div', { class: 'ch-head' },
      h('div', { class: 'ch-badge', 'aria-hidden': 'true' }, String(ch.id)),
      h('div', { class: 'ch-titles' },
        h('h1', { class: 'ch-title' }, h('span', { class: 'sr-only' }, `Chapter ${ch.id}: `), ch.title),
        h('p', { class: 'ch-tagline' }, ch.tagline || '', h('span', { class: 'ch-part' }, `Part ${ROMAN[ch.part]} · ${part.short}`)))));

    // card strip: every card is a numbered button. One tab stop; arrow keys walk the cards.
    const seen = store.seen[ch.id] || [];
    const peek = h('span', { class: 'strip-peek', 'aria-hidden': 'true' });
    const showPeek = (i) => { peek.textContent = i == null ? '' : `${i + 1} · ${slideLabel(list[i])}`; peek.classList.toggle('on', i != null); };
    const pips = h('div', { class: 'pips', role: 'group', 'aria-label': `Cards in chapter ${ch.id}` });
    list.forEach((sl, i) => {
      const on = i === idx;
      pips.appendChild(h('button', {
        type: 'button', title: slideLabel(sl), 'aria-label': `${sl.type === 'card' ? 'Card ' + (i + 1) : slideLabel(sl)}: ${slideLabel(sl)}${seen.includes(i) && !on ? ' (seen)' : ''}`,
        'aria-current': on ? 'step' : null, tabindex: on ? '0' : '-1',
        class: 'pip' + (sl.type !== 'card' ? ' extra' : '') + (on ? ' current' : seen.includes(i) ? ' seen' : ''),
        onclick: () => go(ch.id, i),
        onmouseenter: () => showPeek(i), onmouseleave: () => showPeek(null),
        onfocus: () => showPeek(i), onblur: () => showPeek(null),
        onkeydown: (e) => {
          if (e.key === 'Home') { e.preventDefault(); go(ch.id, 0); }
          else if (e.key === 'End') { e.preventDefault(); go(ch.id, list.length - 1); }
        },
      }, slideNum(sl, i)));
    });
    const tocBtn = h('button', { type: 'button', class: 'toc-btn' + (store.toc ? ' on' : ''), 'aria-expanded': store.toc ? 'true' : 'false', 'aria-controls': 'card-toc', onclick: () => {
      store.toc = !store.toc; save();
      toc.hidden = !store.toc;
      tocBtn.classList.toggle('on', store.toc);
      tocBtn.setAttribute('aria-expanded', store.toc ? 'true' : 'false');
    } }, icon('grid'), h('span', null, 'All cards'));
    wrap.appendChild(h('div', { class: 'strip' }, pips, tocBtn));
    // phones scroll the strip sideways: bring the current card into view
    requestAnimationFrame(() => {
      const cur = pips.querySelector('.pip.current');
      if (cur && pips.scrollWidth > pips.clientWidth) pips.scrollLeft = cur.offsetLeft - pips.clientWidth / 2 + cur.offsetWidth / 2;
    });
    wrap.appendChild(peek);
    const toc = h('div', { class: 'toc', id: 'card-toc' });
    toc.hidden = !store.toc;
    list.forEach((sl, i) => toc.appendChild(h('a', {
      href: `#/ch/${ch.id}/${i + 1}`, 'aria-current': i === idx ? 'step' : null,
      class: (i === idx ? 'current' : seen.includes(i) ? 'seen' : '') + (sl.type !== 'card' ? ' extra' : ''),
    }, h('span', { class: 'n' }, slideNum(sl, i)), h('span', { class: 't' }, slideLabel(sl)), seen.includes(i) && i !== idx ? h('span', { class: 'ok' }, icon('check'), h('span', { class: 'sr-only' }, ' (seen)')) : null)));
    wrap.appendChild(toc);

    const sl = list[idx];
    const card = h('article', { class: 'card' + (dir < 0 ? ' back' : ''), 'aria-labelledby': 'card-title' });
    wrap.appendChild(card);
    const scope = DDIA.viz.scope();
    if (sl.type === 'card') renderCard(card, ch, sl.card, idx, scope);
    else if (sl.type === 'cheat') renderCheat(card, ch);
    else renderQuiz(card, ch, scope);

    // pager: sticky at the bottom so Next never hides below a tall diagram
    const prev = h('button', { class: 'btn nav-back', type: 'button', 'data-nav': 'back', onclick: () => step(-1), disabled: idx === 0 && ch.id === chapters[0].id ? true : null }, icon('left'), h('span', { class: 'nav-lbl' }, 'Back'));
    let next;
    if (idx < list.length - 1) {
      next = h('button', { class: 'btn primary nav-next', type: 'button', 'data-nav': 'next', onclick: () => step(1) }, h('span', { class: 'nav-lbl' }, 'Next'), icon('right'));
    } else {
      const nxt = chapters[chapters.indexOf(ch) + 1];
      next = nxt
        ? h('a', { class: 'btn primary nav-next', href: `#/ch/${nxt.id}`, 'data-nav': 'next' }, h('span', { class: 'nav-lbl' }, `Chapter ${nxt.id}: ${nxt.title}`), icon('right'))
        : h('a', { class: 'btn primary nav-next', href: '#/', 'data-nav': 'next' }, h('span', { class: 'nav-lbl' }, 'Back to the map'), icon('map'));
    }
    wrap.appendChild(h('nav', { class: 'nav', 'aria-label': 'Card pager' }, prev,
      h('span', { class: 'nav-mid' }, h('span', { class: 'count' }, `${idx + 1} / ${list.length}`), h('span', { class: 'nav-hint', 'aria-hidden': 'true' }, h('kbd', null, '←'), h('kbd', null, '→'))),
      next));

    markSeen(ch.id, idx);
    current = { ch, idx, scope, total: list.length, title: slideLabel(sl) };
    return wrap;
  }

  function renderCard(el, ch, card, idx, scope) {
    scope.label = card.title;
    el.appendChild(h('h2', { class: 'card-title', id: 'card-title' }, card.title));
    // the one line of text leads, so the picture is read with its idea in mind
    if (card.caption) el.appendChild(h('p', { class: 'caption' }, icon('bulb'), h('span', null, card.caption)));
    const chips = [];
    if (card.problem) chips.push(h('span', { class: 'chip problem' }, h('span', { class: 'lbl' }, 'Problem'), card.problem));
    if (card.fix) chips.push(h('span', { class: 'chip fix' }, h('span', { class: 'lbl' }, 'Fix'), card.fix));
    if (chips.length) el.appendChild(h('div', { class: 'chips' }, chips));
    const stage = h('div', { class: 'stage' });
    el.appendChild(stage);
    const foot = [];
    if (card.tags && card.tags.length) foot.push(h('p', { class: 'card-wild' }, h('span', { class: 'lbl' }, 'In the wild'), ' ', card.tags.join(' · ')));
    const lab = card.lab && DDIA.lab && DDIA.lab.get(card.lab.id);
    if (lab) {
      const qs = Object.entries(card.lab.set || {}).map(([k, val]) => `${k}=${encodeURIComponent(val)}`).join('&');
      foot.push(h('a', { class: 'lab-link', href: `#/lab/${lab.id}/${card.lab.preset}` + (qs ? '?' + qs : '') },
        icon('flask'), h('span', null, 'Try it yourself in the ', h('b', null, lab.title)), icon('right')));
    }
    if (foot.length) el.appendChild(h('div', { class: 'card-foot' }, foot));
    if (typeof card.demo === 'function') {
      // mount after insertion so SVG text measurement works
      requestAnimationFrame(() => {
        if (!scope.alive) return;
        try { card.demo(stage, scope); } catch (err) {
          console.error(`Demo crashed: ch${ch.id} card ${idx + 1} (${card.title})`, err);
          stage.textContent = '';
          stage.appendChild(demoError('This drawing failed to load.', err));
        }
      });
    }
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

  function renderCheat(el, ch) {
    el.appendChild(h('h2', { class: 'card-title', id: 'card-title' }, 'Cheat sheet'));
    el.appendChild(h('p', { class: 'caption quiet' }, icon('list'), h('span', null, `The chapter in ${ch.cheatsheet.length} terms. Follow a card link to see a term drawn.`)));
    const grid = h('dl', { class: 'cheat' });
    ch.cheatsheet.forEach((it) => {
      const ci = cardForTerm(ch, it.term);
      grid.appendChild(h('div', { class: 'cheat-item' + (it.kind ? ' k-' + it.kind : '') },
        h('dt', null, h('i', { class: 'cheat-dot', 'aria-hidden': 'true' }), it.term),
        h('dd', null, it.text, ci >= 0 ? h('a', { class: 'cheat-link', href: `#/ch/${ch.id}/${ci + 1}` }, `Card ${ci + 1}`, h('span', { class: 'sr-only' }, `: ${ch.cards[ci].title}`)) : null)));
    });
    el.appendChild(grid);
  }

  function renderQuiz(el, ch, scope) {
    el.appendChild(h('h2', { class: 'card-title', id: 'card-title' }, 'Quick check'));
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
      const ringEl = ring(r, `var(--k-${kind}-s)`, 112, 10);
      const complete = progressOf(ch) >= 1;
      const scoreEl = h('div', { class: 'quiz-score k-' + kind, role: 'status', tabindex: '-1', 'aria-label': `Score ${score} of ${n}. ${msg}` }, h('div', { class: 'quiz-ring', 'aria-hidden': 'true' }, ringEl, h('b', null, `${score}/${n}`)),
        h('div', null,
          h('p', { class: 'big' }, msg),
          complete ? h('p', { class: 'quiz-done' }, icon('check'), `You've opened every card in chapter ${ch.id}.`) : null,
          h('div', { class: 'quiz-foot', style: { justifyContent: 'flex-start' } },
            h('button', { type: 'button', class: 'btn', onclick: () => { results.length = 0; picks.length = 0; qi = 0; paint(true); } }, icon('reset'), 'Try again'))));
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
        order: 100000 + li * 100 + i, where: tab ? `${kind === 'challenge' ? 'Challenge' : 'Preset'} · ${l.title}` : 'Playground lab',
      });
      add(null, 'lab', l.title, l.tagline, 0);
      l.presets.forEach((t, i) => add(t.id, 'preset', t.title, [t.nudge, t.predict && t.predict.q].filter(Boolean).join(' · '), i + 1));
      l.challenges.forEach((t, i) => add(t.id, 'challenge', t.title, t.goal, 50 + i));
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
        h('a', { class: 'search-map', href: '#/', onclick: (ev) => { ev.preventDefault(); openResult({ href: '#/' }); } }, icon('map'), 'Browse all chapters on the map')));
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
    if (a.closest && a.closest('.pips')) return 'strip';
    const nav = a.closest && a.closest('[data-nav]');
    if (nav) return nav.getAttribute('data-nav');
    return 'main';
  }
  function placeFocus(kind) {
    const pick = kind === 'strip' ? main.querySelector('.pip.current')
      : kind === 'next' ? main.querySelector('[data-nav="next"]')
        : kind === 'back' ? main.querySelector('[data-nav="back"]:not([disabled])') : null;
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
    main.textContent = '';
    let dir = 1;
    if (r.labRoute) {
      const lab = r.lab && DDIA.lab.get(r.lab);
      if (r.lab && !lab) { location.hash = '#/lab'; return; }
      if (!lab) {
        main.appendChild(DDIA.lab.renderHub(labEnv));
        paintSidebar(null, null, {});
        document.title = 'Playground — DDIA visually';
      } else {
        const tab = lab.presets.concat(lab.challenges).find((t) => t.id === r.tab) || lab.presets[0];
        labScope = DDIA.viz.scope();
        main.appendChild(DDIA.lab.renderPage(lab, tab.id, r.query, labScope, labEnv));
        labActive = { id: lab.id, tab: tab.id };
        paintSidebar(null, null, labActive);
        document.title = `${tab.title} · ${lab.title} — DDIA visually`;
      }
      const sameLab = lastRoute && lastRoute.labRoute && lastRoute.lab === r.lab;
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
      if (lastRoute && lastRoute.ch === r.ch && lastRoute.idx > r.idx) dir = -1;
      if (lastRoute && lastRoute.ch > r.ch) dir = -1;
      main.appendChild(renderChapter(ch, r.idx, dir));
      paintSidebar(ch.id, current.idx);
      document.title = `${current.title} · ${ch.id}. ${ch.title} — DDIA visually`;
    }
    const sameChapter = lastRoute && !r.home && lastRoute.ch === r.ch;
    if (!sameChapter) window.scrollTo(0, 0);
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
        for (const t of l.presets.concat(l.challenges)) {
          where = `lab/${l.id}/${t.id}`;
          location.hash = `#/lab/${l.id}/${t.id}`;
          await wait(700);
          const page = main.querySelector('.lab');
          if (!page) { push('lab page did not render'); continue; }
          const opt = page.querySelector('.lab-predict-opts button');
          if (opt) {
            // nothing may reveal the outcome while the prediction is open
            if ([...page.querySelectorAll('.lab-runbar .vz-btn, .lab-all .vz-btn')].some((b) => /Replay|Skip|Next|Random|Try all/.test(b.textContent) && !b.disabled)) push('a control can reveal the outcome before the prediction');
            if (page.querySelector('.lab-verdict:not(.pending)')) push('readouts show the outcome before the prediction');
            opt.click();
            await wait(500);
          }
          for (const b of [...page.querySelectorAll('.lab-card button')]) {
            if (!b.isConnected || b.disabled) continue;
            b.click();
            await wait(220);
          }
          const allBtn = [...page.querySelectorAll('.lab-all button')].find((b) => /Try all/.test(b.textContent));
          if (allBtn) { allBtn.click(); await wait(300); }
          const cell = page.querySelector('.lab-cell');
          if (cell) { cell.click(); await wait(300); } else push('the all-runs grid did not open');
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
        for (const ch of l.challenges) {
          where = `lab/${l.id}/${ch.id}/solution`;
          const sol = DDIA.lab.configFor(l, ch.config, ch.solution.config);
          const inp = ch.solution.input != null ? ch.solution.input : ch.input != null ? ch.input : l.defaultInput(sol);
          if (!DDIA.lab.checkChallenge(l, ch, sol, inp).ok) push('the challenge solution does not pass');
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
