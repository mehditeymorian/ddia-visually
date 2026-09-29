/* DDIA Visual Guide — viz kit.
 * Every card demo receives `v`, a scope created by DDIA.viz.scope().
 * All timers/animations started through `v` stop when the card unmounts.
 * See AUTHORING.md for the full API.
 */
(function () {
  'use strict';
  const DDIA = (window.DDIA = window.DDIA || {});
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const KINDS = ['neutral', 'primary', 'good', 'bad', 'warn', 'info', 'data', 'ghost'];
  let uid = 0;

  const reducedMotion = () =>
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- tiny DOM builders ---------- */
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, val] of Object.entries(attrs)) {
        if (val == null || val === false) continue;
        if (k === 'class') el.className = val;
        else if (k === 'style' && typeof val === 'object') {
          for (const [p, pv] of Object.entries(val)) {
            if (p.startsWith('--')) el.style.setProperty(p, pv);
            else el.style[p] = pv;
          }
        }
        else if (k === 'html') el.innerHTML = val;
        else if (k === 'text') el.textContent = val;
        else if (k.startsWith('on') && typeof val === 'function') el.addEventListener(k.slice(2).toLowerCase(), val);
        else el.setAttribute(k, val === true ? '' : val);
      }
    }
    appendKids(el, children);
    return el;
  }
  function appendKids(el, children) {
    for (const c of children.flat(Infinity)) {
      if (c == null || c === false) continue;
      el.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
  }
  function s(tag, attrs, parent) {
    const el = document.createElementNS(SVG_NS, tag);
    if (attrs) for (const [k, val] of Object.entries(attrs)) if (val != null && val !== false) el.setAttribute(k, val);
    if (parent) parent.appendChild(el);
    return el;
  }
  const kindOf = (k) => (KINDS.includes(k) ? k : 'neutral');
  const inkKind = (k) => (['muted', 'text', 'text2', 'accent'].includes(k) ? k : kindOf(k));
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ---------- scope: lifecycle + timing ---------- */
  function scope() {
    let gen = 0;
    let disposed = false;
    const cleanups = [];
    const intervals = new Set();
    const v = {
      h,
      s,
      KINDS,
      get alive() { return !disposed; },
      /** Resolves after ms unless the scope restarts/disposes first (then never resolves, halting the flow). */
      sleep(ms) {
        const my = gen;
        const dur = reducedMotion() ? Math.min(ms, 250) : ms;
        return new Promise((res) => {
          const t = setTimeout(() => { if (!disposed && my === gen) res(); }, dur / DDIA.viz.speed);
          cleanups.push(() => clearTimeout(t));
        });
      },
      /** Cancel all in-flight sleeps/animations started before this call. DOM is kept. */
      restart() { gen++; },
      get gen() { return gen; },
      isCurrent(g) { return !disposed && g === gen; },
      /** Repeating timer; returns stop(). Survives restart(); stops on dispose. */
      every(ms, fn) {
        const id = setInterval(() => { if (!disposed) fn(); }, ms);
        intervals.add(id);
        return () => { clearInterval(id); intervals.delete(id); };
      },
      after(ms, fn) {
        const my = gen;
        const t = setTimeout(() => { if (!disposed && my === gen) fn(); }, ms / DDIA.viz.speed);
        cleanups.push(() => clearTimeout(t));
      },
      onDispose(fn) { cleanups.push(fn); },
      dispose() {
        disposed = true;
        gen++;
        intervals.forEach(clearInterval);
        intervals.clear();
        while (cleanups.length) { try { cleanups.pop()(); } catch (e) { /* ignore */ } }
      },
      /** Animate t from 0..1 over ms; calls step(easedT). Resolves when done (never if cancelled). */
      tween(ms, step, easing = ease) {
        const my = gen;
        const dur = (reducedMotion() ? Math.min(ms, 150) : ms) / DDIA.viz.speed;
        // headless self-test: rAF may not tick under virtual time, so use timers
        const raf = DDIA.viz.selftest ? (f) => setTimeout(() => f(performance.now()), 16) : requestAnimationFrame;
        return new Promise((res) => {
          const t0 = performance.now();
          const frame = (now) => {
            if (disposed || my !== gen) return;
            const t = Math.min(1, Math.max(0, (now - t0) / dur));
            step(easing(t));
            if (t < 1) raf(frame);
            else res();
          };
          raf(frame);
        });
      },
    };

    /* ----- layout helpers ----- */
    v.wrap = (parent, ...children) => {
      const el = h('div', { class: 'vz' }, ...children);
      parent.appendChild(el);
      return el;
    };
    v.row = (parent, opts = {}) => {
      const el = h('div', { class: 'vz-row' + (opts.center ? ' center' : '') });
      parent.appendChild(el);
      return el;
    };
    v.grid = (parent, min = 220) => {
      const el = h('div', { class: 'vz-grid', style: { '--min': min + 'px' } });
      parent.appendChild(el);
      return el;
    };
    v.panel = (parent, title) => {
      const el = h('div', { class: 'vz-panel' }, title ? h('div', { class: 'vz-panel-title' }, title) : null);
      parent.appendChild(el);
      return el;
    };

    /* ----- controls ----- */
    v.controls = (parent, buttons) => {
      const el = h('div', { class: 'vz-controls' });
      const map = {};
      buttons.forEach((b, i) => {
        const btn = h('button', {
          type: 'button',
          class: 'vz-btn' + (b.kind ? ' ' + b.kind : ''),
          onclick: () => b.onClick && b.onClick(btn),
        }, b.icon ? h('span', { class: 'ic', 'aria-hidden': 'true' }, b.icon) : null, b.label);
        map[b.id || i] = btn;
        el.appendChild(btn);
      });
      parent.appendChild(el);
      return {
        el,
        btn: (id) => map[id],
        set(id, o) {
          const b = map[id];
          if (!b) return;
          if ('disabled' in o) b.disabled = !!o.disabled;
          if ('hidden' in o) b.style.display = o.hidden ? 'none' : '';
          if ('label' in o) {
            const ic = b.querySelector('.ic');
            b.textContent = '';
            if (ic) b.appendChild(ic);
            b.append(o.label);
          }
        },
      };
    };
    v.segmented = (parent, o) => {
      const el = h('div', { class: 'vz-seg', role: 'group' });
      let value = o.value !== undefined ? o.value : (o.options[0].value !== undefined ? o.options[0].value : o.options[0]);
      const btns = o.options.map((opt) => {
        const val = typeof opt === 'object' ? opt.value : opt;
        const label = typeof opt === 'object' ? opt.label : opt;
        const kind = typeof opt === 'object' && opt.kind ? ' k-' + opt.kind : '';
        const b = h('button', { type: 'button', class: kind.trim(), onclick: () => set(val, true) }, label);
        b.dataset.val = String(val);
        el.appendChild(b);
        return b;
      });
      function paint() { btns.forEach((b) => { const on = b.dataset.val === String(value); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); }); }
      function set(val, fire) { value = val; paint(); if (fire && o.onChange) o.onChange(val); }
      paint();
      parent.appendChild(el);
      return { el, get: () => value, set: (val) => set(val, false) };
    };
    v.slider = (parent, o) => {
      const fmt = o.format || ((x) => x);
      const input = h('input', { type: 'range', min: o.min, max: o.max, step: o.step || 1, value: o.value, 'aria-label': o.label });
      const out = h('output', null, fmt(Number(o.value)));
      const el = h('label', { class: 'vz-slider' }, h('span', null, o.label), input, out);
      input.addEventListener('input', () => { out.textContent = fmt(Number(input.value)); o.onInput && o.onInput(Number(input.value)); });
      parent.appendChild(el);
      return { el, get: () => Number(input.value), set: (x) => { input.value = x; out.textContent = fmt(Number(x)); } };
    };
    v.toggle = (parent, o) => {
      const input = h('input', { type: 'checkbox' });
      input.checked = !!o.value;
      const el = h('label', { class: 'vz-toggle' }, input, h('span', { class: 'sw', 'aria-hidden': 'true' }), h('span', null, o.label));
      input.addEventListener('change', () => o.onChange && o.onChange(input.checked));
      parent.appendChild(el);
      return { el, get: () => input.checked, set: (b) => { input.checked = !!b; } };
    };

    /* ----- readouts ----- */
    v.caption = (parent, text = '', kind) => {
      const el = h('div', { class: 'vz-caption' + (kind ? ' k-' + kind : ''), 'aria-live': 'polite' }, text);
      parent.appendChild(el);
      return {
        el,
        set(t, k) {
          el.textContent = t;
          el.className = 'vz-caption' + (k ? ' k-' + k : '');
          void el.offsetWidth;
          el.classList.add('fade');
        },
      };
    };
    v.log = (parent, o = {}) => {
      const max = o.max || 6;
      const el = h('div', { class: 'vz-log' }, o.title ? h('div', { class: 'vz-log-title' }, o.title) : null);
      parent.appendChild(el);
      return {
        el,
        add(text, kind) {
          const line = h('div', { class: 'vz-log-line' + (kind ? ' k-' + kind : '') }, text);
          const first = el.querySelector('.vz-log-line');
          if (o.newestFirst === false) el.appendChild(line);
          else el.insertBefore(line, first);
          const lines = el.querySelectorAll('.vz-log-line');
          if (lines.length > max) (o.newestFirst === false ? lines[0] : lines[lines.length - 1]).remove();
          return line;
        },
        clear() { el.querySelectorAll('.vz-log-line').forEach((n) => n.remove()); },
      };
    };
    v.bars = (parent, o) => {
      const el = h('div', { class: 'vz-bars' });
      parent.appendChild(el);
      const fmt = o.format || ((x) => x + (o.unit || ''));
      function update(items, max) {
        const m = max || o.max || Math.max(1, ...items.map((i) => i.value));
        el.textContent = '';
        items.forEach((it) => {
          const fill = h('div', { class: 'fill', style: { width: '0%' } });
          el.appendChild(h('div', { class: 'vz-bar' + (it.kind ? ' k-' + it.kind : '') },
            h('div', { class: 'lbl' }, it.label), h('div', { class: 'track' }, fill), h('div', { class: 'val' }, it.text != null ? it.text : fmt(it.value))));
          requestAnimationFrame(() => { fill.style.width = Math.max(0, Math.min(100, (it.value / m) * 100)) + '%'; });
        });
      }
      update(o.items || []);
      return { el, update };
    };
    v.table = (parent, o) => {
      const wrap = h('div', { class: 'vz-table-wrap' });
      const table = h('table', { class: 'vz-table' });
      wrap.appendChild(table);
      parent.appendChild(wrap);
      function update(rows) {
        table.textContent = '';
        if (o.cols) table.appendChild(h('thead', null, h('tr', null, o.cols.map((c) => h('th', null, c)))));
        const tb = h('tbody');
        rows.forEach((r) => {
          const cells = Array.isArray(r) ? r : r.cells;
          const tr = h('tr', { class: (!Array.isArray(r) && r.kind ? 'k-' + r.kind : '') + (!Array.isArray(r) && r.dim ? ' dim' : '') });
          cells.forEach((c) => {
            if (c && typeof c === 'object' && !c.nodeType) tr.appendChild(h('td', { class: c.kind ? 'k-' + c.kind : '' }, c.text));
            else tr.appendChild(h('td', null, c));
          });
          tb.appendChild(tr);
        });
        table.appendChild(tb);
      }
      update(o.rows || []);
      return { el: wrap, update };
    };
    v.cell = (text, kind, o = {}) =>
      h('span', { class: 'vz-cell' + (kind ? ' k-' + kind : '') + (o.sm ? ' sm' : '') + (o.pop ? ' pop' : '') + (o.dim ? ' dim' : '') + (o.strike ? ' strike' : ''), title: o.title }, text);
    v.tape = (parent, items = []) => {
      const el = h('div', { class: 'vz-tape' });
      parent.appendChild(el);
      const api = {
        el,
        set(list) {
          el.textContent = '';
          list.forEach((it) => el.appendChild(it && it.nodeType ? it : v.cell(it.text, it.kind, it)));
          return api;
        },
        push(it) { const c = it && it.nodeType ? it : v.cell(it.text, it.kind, Object.assign({ pop: true }, it)); el.appendChild(c); return c; },
      };
      api.set(items);
      return api;
    };
    v.stat = (parent, label, value, kind) => {
      const b = h('b', null, value);
      const el = h('div', { class: 'vz-stat' + (kind ? ' k-' + kind : '') }, b, h('span', null, label));
      parent.appendChild(el);
      return { el, set(val, k) { b.textContent = val; el.className = 'vz-stat' + (k ? ' k-' + k : ''); } };
    };

    /* ----- stepper: deterministic step-through ----- */
    v.stepper = (parent, o) => {
      const n = o.steps.length;
      let i = 0;
      let playing = false;
      let playToken = 0;
      const el = h('div', { class: 'vz-stepper' });
      const pos = h('span', { class: 'pos' });
      const pips = h('span', { class: 'pips', 'aria-hidden': 'true' }, o.steps.map(() => h('i')));
      const bReset = h('button', { type: 'button', class: 'vz-btn ghost', title: 'Restart', onclick: () => { stop(); go(0, false); } }, '⟲');
      const bPrev = h('button', { type: 'button', class: 'vz-btn', title: 'Previous step', onclick: () => { stop(); if (i > 0) go(i - 1, false); } }, '◀');
      const bNext = h('button', { type: 'button', class: 'vz-btn primary', onclick: () => { stop(); if (i < n - 1) go(i + 1, true); } }, 'Next step ▶');
      const bPlay = h('button', { type: 'button', class: 'vz-btn', onclick: () => (playing ? stop() : play()) }, '▷ Auto');
      el.append(bReset, bPrev, pos, bNext, bPlay, pips);
      parent.appendChild(el);
      const cap = o.caption === false ? null : v.caption(parent, '');
      function paint() {
        pos.textContent = `${i + 1} / ${n}`;
        pips.querySelectorAll('i').forEach((p, j) => p.classList.toggle('on', j <= i));
        bPrev.disabled = i === 0;
        bNext.disabled = i === n - 1;
        bPlay.textContent = playing ? '❚❚ Pause' : '▷ Auto';
      }
      async function go(j, animate) {
        v.restart();
        i = j;
        paint();
        const step = o.steps[i];
        if (cap) cap.set(typeof step === 'string' ? step : step.caption || '', typeof step === 'object' ? step.kind : undefined);
        await o.render(i, animate);
      }
      async function play() {
        playing = true;
        const my = ++playToken;
        if (i === n - 1) await go(0, false);
        paint();
        while (playing && my === playToken && i < n - 1 && !disposed) {
          await new Promise((r) => setTimeout(r, (o.delay || 1600) / DDIA.viz.speed));
          if (!playing || my !== playToken || disposed) return;
          await go(i + 1, true);
        }
        playing = false;
        paint();
      }
      function stop() { playing = false; playToken++; paint(); }
      v.onDispose(stop);
      go(0, false);
      if (o.autoplay) play();
      return { el, go: (j) => { stop(); go(j, false); }, get index() { return i; } };
    };

    /* ----- SVG stage ----- */
    v.stage = (parent, o = {}) => new Stage(v, parent, o);

    return v;
  }

  /* ---------- Stage ---------- */
  class Stage {
    constructor(v, parent, o) {
      this.v = v;
      this.w = o.w || 560;
      this.h = o.h || 320;
      this.id = 'vz' + ++uid;
      const wrap = h('div', { class: 'vz-svg-wrap' });
      this.svg = s('svg', { viewBox: `0 0 ${this.w} ${this.h}`, class: 'vz-svg', role: 'img', 'aria-label': o.label || 'Diagram' });
      if (o.maxWidth) this.svg.style.maxWidth = o.maxWidth + 'px';
      const defs = s('defs', null, this.svg);
      ['neutral', 'primary', 'good', 'bad', 'warn', 'info', 'data', 'ghost', 'muted', 'accent'].forEach((k) => {
        const m = s('marker', { id: `${this.id}-${k}`, viewBox: '0 0 10 10', refX: 8.5, refY: 5, markerWidth: 6.5, markerHeight: 6.5, orient: 'auto-start-reverse', markerUnits: 'strokeWidth' }, defs);
        s('path', { d: 'M0,0.5 L10,5 L0,9.5 z', class: `vz-marker k-${k}` }, m);
      });
      this.gBack = s('g', null, this.svg);
      this.gLinks = s('g', null, this.svg);
      this.gNodes = s('g', null, this.svg);
      this.gTop = s('g', null, this.svg);
      this.items = [];
      wrap.appendChild(this.svg);
      parent.appendChild(wrap);
      this.el = wrap;
    }
    marker(kind) { return `url(#${this.id}-${kind})`; }
    node(o) { const n = new VNode(this, o); this.items.push(n); return n; }
    link(a, b, o) { const l = new VLink(this, a, b, o || {}); this.items.push(l); return l; }
    text(x, y, str, o = {}) {
      const size = o.size || 14;
      const el = s('text', {
        x, y,
        class: `vz-text vz-ink k-${inkKind(o.kind || 'text')}` + (o.mono ? ' mono' : '') + (o.halo ? ' vz-halo' : ''),
        'text-anchor': o.anchor || 'middle',
        'font-size': size,
        'font-weight': o.weight || (o.bold ? 700 : 500),
      }, o.layer === 'back' ? this.gBack : this.gTop);
      if (o.italic) el.setAttribute('font-style', 'italic');
      el.textContent = str;
      const api = {
        el,
        set(t, k) { el.textContent = t; if (k) el.setAttribute('class', `vz-text vz-ink k-${inkKind(k)}` + (o.mono ? ' mono' : '') + (o.halo ? ' vz-halo' : '')); return api; },
        move(nx, ny) { el.setAttribute('x', nx); el.setAttribute('y', ny); return api; },
        remove() { el.remove(); },
        show(b = true) { el.style.display = b ? '' : 'none'; return api; },
      };
      return api;
    }
    box(x, y, w, hgt, o = {}) {
      const g = s('g', { class: `vz-box k-${kindOf(o.kind)}` + (o.solid ? ' solid' : '') + (o.filled ? ' filled' : '') }, this.gBack);
      const r = s('rect', { x, y, width: w, height: hgt, rx: o.rx != null ? o.rx : 14, class: `vz-stroke k-${kindOf(o.kind)}` }, g);
      if (o.filled) r.classList.add('vz-shape', `k-${kindOf(o.kind)}`);
      let t = null;
      if (o.label) {
        t = s('text', { x: x + 12, y: y + 18, class: `vz-ink k-${kindOf(o.kind)}` }, g);
        t.textContent = o.label;
      }
      return {
        el: g,
        set(p) {
          if (p.kind) { g.setAttribute('class', `vz-box k-${p.kind}` + (o.solid ? ' solid' : '') + (o.filled ? ' filled' : '')); r.setAttribute('class', `vz-stroke k-${p.kind}` + (o.filled ? ` vz-shape k-${p.kind}` : '')); if (t) t.setAttribute('class', `vz-ink k-${p.kind}`); }
          if (p.label != null && t) t.textContent = p.label;
          return this;
        },
        remove() { g.remove(); },
      };
    }
    rect(x, y, w, hgt, o = {}) {
      const g = s('g', { class: `vz-rect k-${kindOf(o.kind)}` }, o.layer === 'top' ? this.gTop : this.gBack);
      const r = s('rect', { x, y, width: w, height: hgt, rx: o.rx != null ? o.rx : 6, class: 'vz-shape', 'stroke-width': o.strokeWidth || 1.5 }, g);
      let t = null;
      if (o.label != null) {
        t = s('text', { x: x + w / 2, y: y + hgt / 2 + 1, class: 'vz-ink', 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': o.size || 13, 'font-weight': 600 }, g);
        if (o.mono) t.setAttribute('font-family', 'var(--font-mono)');
        t.style.fontFamily = o.mono ? 'var(--font-mono)' : '';
        t.textContent = o.label;
      }
      const api = {
        el: g, rect: r,
        set(p) {
          if (p.kind) g.setAttribute('class', `vz-rect k-${kindOf(p.kind)}`);
          if (p.label != null && t) t.textContent = p.label;
          if (p.x != null) { r.setAttribute('x', p.x); if (t) t.setAttribute('x', p.x + Number(r.getAttribute('width')) / 2); }
          if (p.y != null) { r.setAttribute('y', p.y); if (t) t.setAttribute('y', p.y + Number(r.getAttribute('height')) / 2 + 1); }
          if (p.w != null) { r.setAttribute('width', p.w); if (t) t.setAttribute('x', Number(r.getAttribute('x')) + p.w / 2); }
          if (p.h != null) { r.setAttribute('height', p.h); if (t) t.setAttribute('y', Number(r.getAttribute('y')) + p.h / 2 + 1); }
          if (p.opacity != null) g.style.opacity = p.opacity;
          return api;
        },
        remove() { g.remove(); },
      };
      return api;
    }
    line(x1, y1, x2, y2, o = {}) {
      const k = o.kind || 'muted';
      const el = s('line', {
        x1, y1, x2, y2,
        class: `vz-link vz-stroke k-${k}` + (o.dashed ? ' dashed' : '') + (o.dotted ? ' dotted' : ''),
        'stroke-width': o.width || 2,
      }, o.layer === 'top' ? this.gTop : this.gBack);
      if (o.arrow) el.setAttribute('marker-end', this.marker(k));
      return { el, remove() { el.remove(); }, set(p) { for (const key of ['x1', 'y1', 'x2', 'y2']) if (p[key] != null) el.setAttribute(key, p[key]); return this; } };
    }
    path(d, o = {}) {
      const k = o.kind || 'muted';
      const el = s('path', { d, class: `vz-link vz-stroke k-${k}` + (o.dashed ? ' dashed' : '') + (o.dotted ? ' dotted' : ''), 'stroke-width': o.width || 2, fill: o.fill || 'none' }, o.layer === 'top' ? this.gTop : this.gBack);
      if (o.arrow) el.setAttribute('marker-end', this.marker(k));
      return { el, remove() { el.remove(); }, set(p) { if (p.d) el.setAttribute('d', p.d); return this; } };
    }
    add(tag, attrs, layer = 'top') {
      const parent = layer === 'back' ? this.gBack : layer === 'links' ? this.gLinks : layer === 'nodes' ? this.gNodes : this.gTop;
      return s(tag, attrs, parent);
    }
    /** Animate a message from a to b. Resolves on arrival (never if the scope restarts). */
    send(a, b, o = {}) {
      const v = this.v;
      const my = v.gen;
      const kind = kindOf(o.kind || 'primary');
      const g = s('g', { class: `vz-packet k-${kind}` }, this.gTop);
      const label = o.label != null ? String(o.label) : '';
      let halfW = 7;
      if (label) {
        const t = s('text', { x: 0, y: 0, class: 'vz-ink' }, null);
        t.textContent = label;
        const w = Math.max(22, label.length * 7.6 + 14);
        halfW = w / 2;
        s('rect', { x: -w / 2, y: -11, width: w, height: 22, rx: 11, class: 'vz-shape' }, g);
        g.appendChild(t);
      } else {
        s('circle', { r: 7, class: 'vz-shape' }, g);
      }
      const A = centerOf(a), B = centerOf(b);
      const P1 = a instanceof VNode ? a.edgeToward(B.x, B.y, -4) : A;
      const P2 = b instanceof VNode ? b.edgeToward(A.x, A.y, -4) : B;
      const curve = o.curve || 0;
      const C = controlPoint(P1, P2, curve);
      const at = (t) => {
        const x = curve ? (1 - t) * (1 - t) * P1.x + 2 * (1 - t) * t * C.x + t * t * P2.x : lerp(P1.x, P2.x, t);
        const y = curve ? (1 - t) * (1 - t) * P1.y + 2 * (1 - t) * t * C.y + t * t * P2.y : lerp(P1.y, P2.y, t);
        return { x, y };
      };
      const place = (t) => { const p = at(t); g.setAttribute('transform', `translate(${p.x},${p.y})`); };
      place(0);
      const stopAt = o.drop ? (typeof o.drop === 'number' ? o.drop : 0.55) : 1;
      const dur = (o.dur || 900) * stopAt;
      const linear = (t) => t;
      return v.tween(dur, (t) => place(t * stopAt), o.drop ? linear : undefined).then(async () => {
        if (o.drop) {
          const x = s('text', { x: 0, y: -18, class: 'vz-ink k-bad', 'text-anchor': 'middle', 'font-size': 18, 'font-weight': 800 }, g);
          x.textContent = '✕';
          g.classList.remove(`k-${kind}`);
          g.classList.add('k-bad');
          await v.sleep(500);
          if (!v.isCurrent(my)) return;
          await v.tween(250, (t) => { g.style.opacity = 1 - t; });
          g.remove();
          return 'dropped';
        }
        if (o.keep) return g;
        g.remove();
        if (b instanceof VNode && o.flash !== false) b.flash();
      }).finally(() => {});
    }
    /** Remove every packet currently flying (useful after restart). */
    clearPackets() { this.gTop.querySelectorAll('.vz-packet').forEach((p) => p.remove()); }
    clear() {
      [this.gBack, this.gLinks, this.gNodes, this.gTop].forEach((g) => { g.textContent = ''; });
      this.items = [];
    }
  }

  function centerOf(p) { return p instanceof VNode ? { x: p.x, y: p.y } : { x: p.x, y: p.y }; }
  function controlPoint(P1, P2, curve) {
    const mx = (P1.x + P2.x) / 2, my = (P1.y + P2.y) / 2;
    const dx = P2.x - P1.x, dy = P2.y - P1.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: mx - (dy / len) * curve, y: my + (dx / len) * curve };
  }

  /* ---------- Node ---------- */
  class VNode {
    constructor(stage, o) {
      this.stage = stage;
      this.o = Object.assign({ w: 116, h: 48, kind: 'neutral', shape: 'rect', label: '' }, o);
      this.links = [];
      this.g = s('g', { class: 'vz-node' }, stage.gNodes);
      this.x = this.o.x || 0;
      this.y = this.o.y || 0;
      this.build();
      this.g.setAttribute('transform', `translate(${this.x},${this.y})`);
      this._moveGen = 0;
    }
    get w() { return this.o.w; }
    get h() { return this.o.h; }
    build() {
      const { w, h: hh, shape, label, sub, kind, badge, badgeKind, mono, down, dim, icon } = this.o;
      const g = this.g;
      g.textContent = '';
      g.setAttribute('class', `vz-node k-${kindOf(kind)}` + (mono ? ' mono' : '') + (down ? ' is-down' : '') + (dim ? ' dim' : ''));
      if (shape === 'db') {
        const rx = w / 2, ry = Math.min(9, hh * 0.16), top = -hh / 2 + ry, bot = hh / 2 - ry;
        s('path', { d: `M${-rx},${top} V${bot} A${rx},${ry} 0 0 0 ${rx},${bot} V${top}`, class: 'vz-shape' }, g);
        s('ellipse', { cx: 0, cy: top, rx, ry, class: 'vz-shape' }, g);
      } else if (shape === 'circle') {
        s('circle', { r: Math.min(w, hh) / 2, class: 'vz-shape' }, g);
      } else if (shape === 'pill') {
        s('rect', { x: -w / 2, y: -hh / 2, width: w, height: hh, rx: hh / 2, class: 'vz-shape' }, g);
      } else if (shape === 'doc') {
        const f = 12;
        s('path', { d: `M${-w / 2},${-hh / 2} H${w / 2 - f} L${w / 2},${-hh / 2 + f} V${hh / 2} H${-w / 2} Z`, class: 'vz-shape' }, g);
      } else if (shape === 'person') {
        const r = Math.min(w, hh) / 2;
        s('circle', { r, class: 'vz-shape' }, g);
        s('circle', { cx: 0, cy: -r * 0.28, r: r * 0.28, class: 'vz-shape', 'stroke-width': 1.5 }, g);
        s('path', { d: `M${-r * 0.55},${r * 0.55} Q0,${-r * 0.15} ${r * 0.55},${r * 0.55}`, class: 'vz-shape', 'stroke-width': 1.5, fill: 'none' }, g);
      } else {
        s('rect', { x: -w / 2, y: -hh / 2, width: w, height: hh, rx: this.o.rx != null ? this.o.rx : 10, class: 'vz-shape' }, g);
      }
      const dy = shape === 'db' ? 4 : 0;
      if (shape === 'person') {
        if (label) {
          const t = s('text', { x: 0, y: Math.min(w, hh) / 2 + 14, class: 'vz-label vz-ink' }, g);
          t.textContent = label;
        }
      } else {
        if (label !== '' && label != null) {
          const t = s('text', { x: 0, y: (sub ? -8 : 1) + dy, class: 'vz-label vz-ink' }, g);
          t.textContent = (icon ? icon + ' ' : '') + label;
          if (this.o.size) t.style.fontSize = this.o.size + 'px';
        }
        if (sub) {
          const t2 = s('text', { x: 0, y: 12 + dy, class: 'vz-sub vz-ink' }, g);
          t2.textContent = sub;
        }
      }
      if (badge != null && badge !== '') {
        const bx = w / 2 - 4, by = -hh / 2 + 2;
        const bw = Math.max(20, String(badge).length * 7 + 10);
        const bg = s('g', { class: `k-${kindOf(badgeKind || (kind === 'neutral' ? 'primary' : kind))}` }, g);
        s('rect', { x: bx - bw / 2, y: by - 10, width: bw, height: 20, rx: 10, class: 'vz-shape vz-badge-c' }, bg);
        const bt = s('text', { x: bx, y: by, class: 'vz-badge-t vz-ink' }, bg);
        bt.textContent = badge;
      }
    }
    set(p) {
      let rebuild = false;
      for (const k of Object.keys(p)) {
        if (k === 'x' || k === 'y') continue;
        if (this.o[k] !== p[k]) { this.o[k] = p[k]; rebuild = true; }
      }
      if (rebuild) this.build();
      if (p.x != null || p.y != null) this.moveTo(p.x != null ? p.x : this.x, p.y != null ? p.y : this.y, p.animate !== false);
      return this;
    }
    /** Move (animated by default). Returns a Promise. */
    moveTo(x, y, animate = true, ms = 500) {
      const my = ++this._moveGen;
      if (!animate) { this.x = x; this.y = y; this.apply(); return Promise.resolve(); }
      const x0 = this.x, y0 = this.y;
      return this.stage.v.tween(ms, (t) => {
        if (my !== this._moveGen) return;
        this.x = lerp(x0, x, t); this.y = lerp(y0, y, t); this.apply();
      });
    }
    apply() {
      this.g.setAttribute('transform', `translate(${this.x},${this.y})`);
      this.links.forEach((l) => l.update());
    }
    flash() {
      this.g.classList.remove('vz-flash');
      void this.g.getBBox;
      requestAnimationFrame(() => this.g.classList.add('vz-flash'));
      return this;
    }
    dim(b = true) { this.o.dim = b; this.g.classList.toggle('dim', b); return this; }
    show(b = true) { this.g.style.display = b ? '' : 'none'; this.links.forEach((l) => l.show(b)); return this; }
    remove() { this.g.remove(); this.links.slice().forEach((l) => l.remove()); }
    center() { return { x: this.x, y: this.y }; }
    edgeToward(tx, ty, pad = 4) {
      const dx = tx - this.x, dy = ty - this.y;
      if (!dx && !dy) return { x: this.x, y: this.y };
      if (this.o.shape === 'circle' || this.o.shape === 'person') {
        const r = Math.min(this.o.w, this.o.h) / 2 + pad;
        const d = Math.hypot(dx, dy);
        return { x: this.x + (dx / d) * r, y: this.y + (dy / d) * r };
      }
      const hw = this.o.w / 2 + pad, hh = this.o.h / 2 + pad;
      const t = Math.min(hw / Math.abs(dx || 1e-9), hh / Math.abs(dy || 1e-9));
      return { x: this.x + dx * t, y: this.y + dy * t };
    }
  }

  /* ---------- Link ---------- */
  class VLink {
    constructor(stage, a, b, o) {
      this.stage = stage;
      this.a = a; this.b = b;
      this.o = Object.assign({ kind: 'muted', arrow: true, dashed: false, dotted: false, label: '', curve: 0, both: false, width: null }, o);
      this.g = s('g', null, stage.gLinks);
      this.path = s('path', { fill: 'none' }, this.g);
      this.label = s('text', { class: 'vz-link-label vz-ink' }, this.g);
      if (a instanceof VNode) a.links.push(this);
      if (b instanceof VNode) b.links.push(this);
      this.style();
      this.update();
    }
    style() {
      const { kind, dashed, dotted, arrow, both, width, label, thin, thick } = this.o;
      const k = ['muted', 'accent'].includes(kind) ? kind : kindOf(kind);
      this.path.setAttribute('class', `vz-link vz-stroke k-${k}` + (dashed ? ' dashed' : '') + (dotted ? ' dotted' : '') + (thin ? ' thin' : '') + (thick ? ' thick' : ''));
      if (width) this.path.setAttribute('stroke-width', width); else this.path.removeAttribute('stroke-width');
      if (arrow) this.path.setAttribute('marker-end', this.stage.marker(k)); else this.path.removeAttribute('marker-end');
      if (both) this.path.setAttribute('marker-start', this.stage.marker(k)); else this.path.removeAttribute('marker-start');
      this.label.setAttribute('class', `vz-link-label vz-ink k-${k === 'muted' ? 'text2' : k}`);
      this.label.textContent = label || '';
    }
    update() {
      const A = centerOf(this.a), B = centerOf(this.b);
      const P1 = this.a instanceof VNode ? this.a.edgeToward(B.x, B.y) : A;
      const P2 = this.b instanceof VNode ? this.b.edgeToward(A.x, A.y) : B;
      const c = this.o.curve;
      if (c) {
        const C = controlPoint(P1, P2, c);
        this.path.setAttribute('d', `M${P1.x},${P1.y} Q${C.x},${C.y} ${P2.x},${P2.y}`);
        this.label.setAttribute('x', (P1.x + 2 * C.x + P2.x) / 4);
        this.label.setAttribute('y', (P1.y + 2 * C.y + P2.y) / 4 + (this.o.labelDy || 0));
      } else {
        this.path.setAttribute('d', `M${P1.x},${P1.y} L${P2.x},${P2.y}`);
        this.label.setAttribute('x', (P1.x + P2.x) / 2);
        this.label.setAttribute('y', (P1.y + P2.y) / 2 + (this.o.labelDy != null ? this.o.labelDy : -9));
      }
    }
    set(p) { Object.assign(this.o, p); this.style(); this.update(); return this; }
    show(b = true) { this.g.style.display = b ? '' : 'none'; return this; }
    remove() {
      this.g.remove();
      [this.a, this.b].forEach((n) => { if (n instanceof VNode) n.links = n.links.filter((l) => l !== this); });
    }
  }

  DDIA.viz = { scope, h, s, speed: 1, Stage, VNode, VLink };
})();
