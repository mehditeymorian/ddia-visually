/* Chapter 2 — Data models and query languages */
(function () {
  'use strict';

  /* ---------- local helpers ---------- */
  function codeBlock(v, parent, text, opts = {}) {
    const el = v.h('div', {
      class: 'vz-mono',
      style: {
        fontSize: (opts.size || 13) + 'px', lineHeight: '1.5', whiteSpace: 'pre', overflow: 'auto',
        maxHeight: opts.maxHeight ? opts.maxHeight + 'px' : '',
        padding: '10px 14px', borderRadius: '12px', background: 'var(--surface-2)', color: 'var(--text-2)',
      },
    }, text);
    parent.appendChild(el);
    return { el, set(t) { el.textContent = t; } };
  }

  /* SVG collapses leading spaces: indent code lines with no-break spaces. */
  const ind = (t) => t.replace(/^ +/, (m) => '\u00a0'.repeat(m.length));

  /* A small people-and-places graph shared by the graph cards. */
  const GEO_V = {
    asia: { x: 110, y: 36, label: 'Asia' },
    europe: { x: 400, y: 36, label: 'Europe' },
    japan: { x: 110, y: 122, label: 'Japan' },
    germany: { x: 320, y: 122, label: 'Germany' },
    france: { x: 480, y: 122, label: 'France' },
    osaka: { x: 110, y: 208, label: 'Osaka' },
    berlin: { x: 320, y: 208, label: 'Berlin' },
    lyon: { x: 480, y: 208, label: 'Lyon' },
    kenji: { x: 200, y: 294, label: 'Kenji', person: true },
    lea: { x: 400, y: 294, label: 'Léa', person: true },
  };
  const GEO_E = [
    ['kenji', 'BORN_IN', 'osaka'],
    ['kenji', 'LIVES_IN', 'berlin'],
    ['lea', 'BORN_IN', 'lyon'],
    ['lea', 'LIVES_IN', 'berlin'],
    ['kenji', 'KNOWS', 'lea'],
    ['osaka', 'WITHIN', 'japan'],
    ['japan', 'WITHIN', 'asia'],
    ['berlin', 'WITHIN', 'germany'],
    ['germany', 'WITHIN', 'europe'],
    ['lyon', 'WITHIN', 'france'],
    ['france', 'WITHIN', 'europe'],
  ];
  function drawGeo(st) {
    const n = {};
    Object.keys(GEO_V).forEach((id) => {
      const p = GEO_V[id];
      n[id] = st.node({ x: p.x, y: p.y, w: p.person ? 84 : 96, h: 40, label: p.label, shape: p.person ? 'pill' : 'rect', kind: p.person ? 'info' : 'neutral' });
    });
    const e = GEO_E.map(([a, l, b]) => ({ a, l, b, link: st.link(n[a], n[b], { label: l, thin: true, labelDy: 4 }) }));
    const edge = (a, l, b) => e.find((x) => x.a === a && x.l === l && x.b === b);
    const base = (id) => (GEO_V[id].person ? 'info' : 'neutral');
    return { n, e, edge, base };
  }

  DDIA.chapter({
    id: 2,
    part: 1,
    title: 'Data models and query languages',
    short: 'Data models',
    tagline: 'Tables, documents or graphs: pick your shape',
    cards: [
      /* 1 ─────────────────────────────────────────────── */
      {
        title: 'Objects are trees, tables are flat',
        caption: 'Code sees one nested profile. Tables shred it into rows and joins; a document keeps it whole. That friction helped spark NoSQL.',
        problem: 'Impedance mismatch',
        fix: 'Store the tree as one document',
        tags: ['MongoDB', 'CouchDB', 'Hibernate', 'PostgreSQL'],
        demo(el, v) {
          const box = v.wrap(el);
          const why = v.row(box, { center: true });
          why.appendChild(v.h('span', { class: 'vz-muted' }, 'NoSQL drivers:'));
          ['write scale', 'open source', 'special queries', 'flexible schema'].forEach((t) => why.appendChild(v.cell(t, 'info', { sm: true })));
          const mode = v.segmented(box, {
            options: [{ value: 'rel', label: 'Relational tables', kind: 'bad' }, { value: 'doc', label: 'JSON document', kind: 'good' }],
            value: 'rel',
            onChange: draw,
          });
          const st = v.stage(box, { w: 560, h: 290 });
          const stats = v.row(box, { center: true });
          const sPlaces = v.stat(stats, 'places written', '4', 'bad');
          const sJoins = v.stat(stats, 'joins to load', '3', 'bad');
          const cap = v.caption(box, '');
          v.controls(box, [
            { label: 'Save profile', icon: '▶', kind: 'primary', onClick: save },
            { label: 'Load profile', icon: '◉', onClick: load },
          ]);
          const PARTS = [['jobs', 3], ['schools', 2], ['contacts', 2]];
          let root, kids, orm, tables, doc;

          function draw() {
            v.restart();
            st.clearPackets();
            st.clear();
            const rel = mode.get() === 'rel';
            st.box(8, 8, 238, 274, { label: 'IN YOUR CODE' });
            root = st.node({ x: 62, y: 150, w: 88, h: 50, label: 'Profile', sub: 'user 251', kind: 'primary' });
            kids = PARTS.map(([p, n], i) => st.node({ x: 176, y: 70 + i * 80, w: 108, h: 46, label: p, sub: `list of ${n}`, kind: 'data' }));
            kids.forEach((k) => st.link(root, k, { arrow: false, kind: 'data' }));
            if (rel) {
              st.box(318, 8, 234, 274, { label: 'DATABASE · 4 TABLES' });
              orm = st.node({ x: 282, y: 150, w: 56, h: 40, label: 'ORM', kind: 'warn' });
              const defs = [['users', '1 row · id 251', 'neutral']].concat(PARTS.map(([p, n]) => [p, `${n} rows · user_id 251`, 'data']));
              tables = defs.map(([l, s, k], i) => st.node({ x: 435, y: 60 + i * 64, w: 200, h: 46, label: l, sub: s, kind: k }));
              tables.forEach((t) => st.link(orm, t, { thin: true, dashed: true, arrow: false }));
              sPlaces.set('4', 'bad');
              sJoins.set('3', 'bad');
              cap.set('One object becomes rows in four tables. An ORM translates.', 'warn');
            } else {
              st.box(318, 8, 234, 274, { label: 'DATABASE · 1 DOCUMENT' });
              doc = st.node({ x: 435, y: 154, w: 204, h: 226, shape: 'doc', label: '', kind: 'data' });
              const lines = ['{ "user_id": 251,', '  "name": "Sam",', '  "jobs": [ …3 ],', '  "schools": [ …2 ],', '  "contacts": [ …2 ]', '}'];
              lines.forEach((t, i) => st.text(346, 74 + i * 32, ind(t), { anchor: 'start', mono: true, size: 13, kind: i >= 2 && i <= 4 ? 'data' : 'text' }));
              sPlaces.set('1', 'good');
              sJoins.set('0', 'good');
              cap.set('The whole tree is one JSON document, shaped like the object.', 'good');
            }
          }
          async function save() {
            v.restart();
            st.clearPackets();
            if (mode.get() === 'rel') {
              cap.set('The ORM shreds the tree into rows', 'warn');
              await Promise.all([root].concat(kids).map((n) => st.send(n, orm, { kind: 'data', dur: 650 })));
              await Promise.all(tables.map((t) => st.send(orm, t, { label: 'INSERT', kind: 'data', dur: 750 })));
              cap.set('8 rows written to 4 tables, tied together by user_id.', 'warn');
            } else {
              cap.set('Serialize the object as it is', 'info');
              await st.send(root, doc, { label: 'JSON', kind: 'data', dur: 1000 });
              cap.set('One write. No translation layer needed.', 'good');
            }
          }
          async function load() {
            v.restart();
            st.clearPackets();
            if (mode.get() === 'rel') {
              cap.set('SELECT users JOIN jobs JOIN schools JOIN contacts', 'info');
              await Promise.all(tables.map((t, i) => st.send(orm, t, { label: i ? 'JOIN' : 'SELECT', kind: 'info', dur: 700 })));
              await Promise.all(tables.map((t) => st.send(t, orm, { label: 'rows', kind: 'data', dur: 700 })));
              cap.set('The ORM rebuilds the tree from flat rows', 'warn');
              await Promise.all([root].concat(kids).map((n) => st.send(orm, n, { kind: 'data', dur: 600 })));
              cap.set('3 joins plus a translation step for one profile.', 'bad');
            } else {
              await st.send(root, doc, { label: 'get 251', kind: 'info', dur: 900 });
              await st.send(doc, root, { label: '{ … }', kind: 'data', dur: 900 });
              kids.forEach((k) => k.flash());
              cap.set('One lookup returns the whole tree.', 'good');
            }
          }
          draw();
        },
      },

      /* 2 ─────────────────────────────────────────────── */
      {
        title: 'Store an ID, not the text',
        caption: 'Copying a region name into every profile means renaming it everywhere. Storing an ID keeps one copy, but reads now need a join.',
        problem: 'Duplicated text drifts apart',
        fix: 'Normalize: reference by ID',
        tags: ['foreign key', 'document reference', 'join'],
        demo(el, v) {
          const box = v.wrap(el);
          const top = v.row(box);
          const mode = v.segmented(top, {
            options: [{ value: 'text', label: 'Copy the name', kind: 'bad' }, { value: 'id', label: 'Store an ID', kind: 'good' }],
            value: 'text',
            onChange: reset,
          });
          const nojoin = v.toggle(top, { label: 'No joins (document DB)', value: false, onChange: reset });
          const st = v.stage(box, { w: 560, h: 280 });
          const app = st.node({ x: 58, y: 140, w: 88, h: 50, label: 'App', kind: 'primary' });
          const NAMES = ['Ana', 'Bo', 'Cy', 'Dee', 'Eli'];
          const profs = NAMES.map((n, i) => st.node({ x: 250, y: 40 + i * 50, w: 210, h: 38, label: n }));
          const reg = st.node({ x: 482, y: 140, w: 128, h: 58, label: 'regions', sub: '7 = Bay Area', kind: 'info', shape: 'db' });
          const refs = profs.map((p, i) => st.line(357, 40 + i * 50, 412, 140, { kind: 'info', width: 1.5, arrow: true }));
          const stats = v.row(box, { center: true });
          const sW = v.stat(stats, 'writes to rename', '–', 'info');
          const sR = v.stat(stats, 'round trips to read', '–', 'info');
          const cap = v.caption(box, '');
          v.controls(box, [
            { label: 'Rename the region', icon: '✎', kind: 'primary', onClick: rename },
            { label: "Read Ana's profile", icon: '◉', onClick: read },
          ]);
          const OLD = 'Bay Area', NEW = 'SF Bay Area';
          let vals = [], regName = OLD;

          function paint() {
            const id = mode.get() === 'id';
            reg.show(id);
            refs.forEach((r) => { r.el.style.display = id ? '' : 'none'; });
            reg.set({ sub: '7 = ' + regName, kind: regName === NEW ? 'good' : 'info' });
            profs.forEach((p, i) => p.set({ label: `${NAMES[i]} · ${id ? 'region 7' : vals[i]}`, kind: !id && vals[i] === NEW ? 'good' : 'neutral' }));
          }
          function reset() {
            v.restart();
            st.clearPackets();
            vals = NAMES.map(() => OLD);
            regName = OLD;
            sW.set('–', 'info');
            sR.set('–', 'info');
            paint();
            cap.set(mode.get() === 'id' ? 'Each profile stores region 7. The name lives in one row.' : 'Every profile keeps its own copy of "Bay Area".', 'info');
          }
          async function rename() {
            reset();
            if (mode.get() === 'text') {
              cap.set('Rename: every copy must be found and fixed', 'warn');
              let n = 0;
              for (let i = 0; i < NAMES.length; i++) {
                const fail = i === 3;
                await st.send(app, profs[i], { label: 'UPDATE', kind: fail ? 'bad' : 'warn', dur: 560, drop: fail ? 0.85 : false });
                sW.set(String(++n), 'bad');
                if (fail) { profs[i].set({ kind: 'bad' }); continue; }
                vals[i] = NEW;
                profs[i].set({ label: `${NAMES[i]} · ${NEW}`, kind: 'good' });
              }
              cap.set('5 writes, and one failed: two spellings now exist.', 'bad');
            } else {
              cap.set('Rename: change the one row in regions', 'info');
              await st.send(app, reg, { label: 'UPDATE', kind: 'good', dur: 1000 });
              regName = NEW;
              paint();
              profs.forEach((p) => p.flash());
              sW.set('1', 'good');
              cap.set('One write. Every profile now shows the new name.', 'good');
            }
          }
          async function read() {
            v.restart();
            st.clearPackets();
            paint();
            const p = profs[0];
            if (mode.get() === 'text') {
              await st.send(app, p, { label: 'get Ana', kind: 'info' });
              await st.send(p, app, { label: vals[0], kind: 'good' });
              sR.set('1', 'good');
              cap.set('One lookup: the name sits right in the profile.', 'good');
            } else if (!nojoin.get()) {
              await st.send(app, p, { label: 'get Ana', kind: 'info' });
              cap.set('The database joins profile → regions', 'info');
              await st.send(p, reg, { label: 'join 7', kind: 'info', dur: 700 });
              await st.send(reg, app, { label: regName, kind: 'good', dur: 1000 });
              sR.set('1', 'good');
              cap.set('One query. The join ran inside the database.', 'good');
            } else {
              await st.send(app, p, { label: 'get Ana', kind: 'info' });
              await st.send(p, app, { label: 'region 7', kind: 'data' });
              cap.set('No joins: the app has to ask again', 'warn');
              await st.send(app, reg, { label: 'get 7', kind: 'info', dur: 1000 });
              await st.send(reg, app, { label: regName, kind: 'good', dur: 1000 });
              sR.set('2', 'warn');
              cap.set('Two round trips: the join moved into your code.', 'warn');
            }
          }
          reset();
        },
      },

      /* 3 ─────────────────────────────────────────────── */
      {
        title: 'Hand-coded paths vs a query optimizer',
        caption: 'The 1970s network model made code walk pointer chains. Relational databases let an optimizer pick the path, so new questions need no rewrites.',
        problem: 'Manual access paths',
        fix: 'Declarative query + optimizer',
        tags: ['IMS', 'CODASYL', 'SQL'],
        demo(el, v) {
          const box = v.wrap(el);
          const top = v.row(box);
          const mode = v.segmented(top, {
            options: [{ value: 'net', label: 'Network model', kind: 'bad' }, { value: 'rel', label: 'Relational', kind: 'good' }],
            value: 'net',
            onChange: draw,
          });
          const idx = v.toggle(top, { label: 'Company index', value: false, onChange: draw });
          const st = v.stage(box, { w: 560, h: 292 });
          const stats = v.row(box, { center: true });
          const sVisit = v.stat(stats, 'records read', '0', 'info');
          const sCode = v.stat(stats, 'code rewrites', '0', 'good');
          const cap = v.caption(box, '');
          v.controls(box, [
            { label: 'Users in Lyon', icon: '◉', kind: 'primary', onClick: () => query('city') },
            { label: 'Users at Acme', icon: '◉', onClick: () => query('co') },
          ]);
          const U = [
            { n: 'Ana', city: 'Paris', co: 'Acme' }, { n: 'Bo', city: 'Paris', co: 'Zeta' },
            { n: 'Cy', city: 'Lyon', co: 'Acme' }, { n: 'Dee', city: 'Lyon', co: 'Zeta' }, { n: 'Eli', city: 'Lyon', co: 'Zeta' },
            { n: 'Fay', city: 'Nice', co: 'Acme' },
          ];
          const CITIES = ['Paris', 'Lyon', 'Nice'];
          let N = {}, rewrites = 0, visits = 0;
          const bump = () => { visits++; sVisit.set(String(visits), visits > 6 ? 'bad' : 'info'); };

          function draw() {
            v.restart();
            st.clearPackets();
            st.clear();
            visits = 0;
            sVisit.set('0', 'info');
            N = {};
            if (mode.get() === 'net') {
              idx.el.style.display = 'none';
              N.root = st.node({ x: 42, y: 150, w: 64, h: 40, label: 'root', kind: 'primary' });
              CITIES.forEach((c, i) => { N[c] = st.node({ x: 148, y: 60 + i * 90, w: 84, h: 40, label: c }); });
              st.link(N.root, N.Paris, { thin: true });
              st.link(N.Paris, N.Lyon, { thin: true });
              st.link(N.Lyon, N.Nice, { thin: true });
              CITIES.forEach((c, ci) => {
                let prev = N[c];
                U.filter((u) => u.city === c).forEach((u, j) => {
                  N[u.n] = st.node({ x: 262 + j * 110, y: 60 + ci * 90, w: 96, h: 44, label: u.n, sub: u.co });
                  st.link(prev, N[u.n], { thin: true });
                  prev = N[u.n];
                });
              });
              sCode.set(String(rewrites), rewrites ? 'bad' : 'good');
              cap.set('Records linked by pointers. Code must follow the chains.', 'info');
            } else {
              idx.el.style.display = '';
              N.opt = st.node({ x: 66, y: 150, w: 110, h: 54, label: 'Optimizer', sub: 'picks the path', kind: 'primary' });
              N.iCity = st.node({ x: 222, y: 85, w: 118, h: 46, label: 'city index', kind: 'info', shape: 'db' });
              N.iCo = st.node({ x: 222, y: 215, w: 136, h: 46, label: 'company index', kind: idx.get() ? 'info' : 'ghost', shape: 'db' });
              st.link(N.opt, N.iCity, { thin: true });
              st.link(N.opt, N.iCo, { thin: true, dashed: !idx.get() });
              st.text(440, 20, 'users table', { size: 13, kind: 'muted', bold: true });
              U.forEach((u, i) => { N[u.n] = st.node({ x: 440, y: 50 + i * 44, w: 200, h: 34, label: `${u.n} · ${u.city} · ${u.co}`, mono: true, size: 13 }); });
              sCode.set('0', 'good');
              cap.set(idx.get() ? 'Company index added. No query had to change.' : 'You say what you want. The optimizer picks how.', 'info');
            }
          }
          async function query(kind) {
            draw();
            const hits = U.filter((u) => (kind === 'city' ? u.city === 'Lyon' : u.co === 'Acme')).map((u) => u.n);
            const color = (n) => N[n].set({ kind: hits.includes(n) ? 'good' : 'warn' });
            if (mode.get() === 'net') {
              if (kind === 'city') {
                cap.set('Follow the path: root → region chain → user chain', 'info');
                const path = ['root', 'Paris', 'Lyon', 'Cy', 'Dee', 'Eli'];
                for (let i = 1; i < path.length; i++) {
                  await st.send(N[path[i - 1]], N[path[i]], { kind: 'warn', dur: 420 });
                  bump();
                  color(path[i]);
                }
                cap.set('Found through the region chain. Fast, because that path exists.', 'good');
              } else {
                rewrites = 1;
                sCode.set('1', 'bad');
                cap.set('No path by company! New code must walk every chain.', 'bad');
                await v.sleep(700);
                const legs = [['root', 'Paris'], ['Paris', 'Ana'], ['Ana', 'Bo'], ['Bo', 'Paris'], ['Paris', 'Lyon'], ['Lyon', 'Cy'], ['Cy', 'Dee'], ['Dee', 'Eli'], ['Eli', 'Lyon'], ['Lyon', 'Nice'], ['Nice', 'Fay']];
                for (const [a, b] of legs) {
                  const back = a === 'Bo' || a === 'Eli';
                  await st.send(N[a], N[b], { kind: 'warn', dur: back ? 380 : 420, curve: back ? 70 : 0 });
                  if (!back) { bump(); color(b); }
                }
                cap.set('Every record read for one new question, after a rewrite.', 'bad');
              }
              return;
            }
            if (kind === 'city' || idx.get()) {
              const ix = kind === 'city' ? N.iCity : N.iCo;
              await st.send(N.opt, ix, { label: kind === 'city' ? 'Lyon' : 'Acme', kind: 'info' });
              await Promise.all(hits.map((n) => st.send(ix, N[n], { kind: 'good', dur: 700 })));
              hits.forEach((n) => { bump(); color(n); });
              cap.set(kind === 'city' ? 'The optimizer chose the city index. You never named it.' : 'The new index is used automatically. Same query text.', 'good');
            } else {
              cap.set('No company index: the optimizer picks a full scan', 'warn');
              for (const u of U) {
                await st.send(N.opt, N[u.n], { kind: 'warn', dur: 380 });
                bump();
                color(u.n);
              }
              cap.set('Slower, but zero code changes. Now try the index.', 'info');
            }
          }
          draw();
        },
      },

      /* 4 ─────────────────────────────────────────────── */
      {
        title: 'Change the schema: migrate or adapt?',
        caption: 'Schema-on-write: every row must match, so old rows get migrated. Schema-on-read: old and new shapes coexist, and code handles both.',
        problem: 'Rigid schema, slow migration',
        fix: 'Schema-on-read (or a careful migration)',
        tags: ['ALTER TABLE', 'MongoDB', 'JSON'],
        demo(el, v) {
          const box = v.wrap(el);
          const mode = v.segmented(box, {
            options: [{ value: 'write', label: 'Schema-on-write (SQL)' }, { value: 'read', label: 'Schema-on-read (JSON)' }],
            value: 'write',
            onChange: reset,
          });
          const st = v.stage(box, { w: 560, h: 290 });
          const stats = v.row(box, { center: true });
          const sRows = v.stat(stats, 'rows migrated', '0', 'info');
          const sShapes = v.stat(stats, 'shapes code handles', '1', 'info');
          const cap = v.caption(box, '');
          v.controls(box, [
            { label: 'Split name field', icon: '✎', kind: 'primary', onClick: split },
            { label: 'Add user', icon: '＋', onClick: add },
            { label: 'Read all', icon: '◉', onClick: readAll },
            { label: 'Reset', icon: '↺', kind: 'ghost', onClick: reset },
          ]);
          const PEOPLE = [['Ana', 'Lopez'], ['Bo', 'Chen'], ['Cy', 'Diaz'], ['Dee', 'Park'], ['Eli', 'Moss'], ['Fin', 'Wu']];
          let recs = [], nodes = [], app, head, done = false;
          const rel = () => mode.get() === 'write';
          const ry = (i) => 50 + i * 40;
          const label = (r) => {
            if (rel()) return r.shape === 'new' ? `${r.f} │ ${r.l}` : `${r.f} ${r.l}`;
            return r.shape === 'new' ? `{first:"${r.f}", last:"${r.l}"}` : `{name:"${r.f} ${r.l}"}`;
          };
          function draw() {
            st.clear();
            head = st.text(165, 20, rel() ? (done ? 'users (first, last)' : 'users (name)') : 'users · any JSON shape', { size: 13, bold: true, kind: 'text2' });
            nodes = recs.map((r, i) => st.node({ x: 165, y: ry(i), w: 290, h: 32, label: label(r), mono: true, size: 13, kind: r.shape === 'new' ? 'good' : 'neutral' }));
            const sub = rel() ? (done ? 'expects first, last' : 'expects name') : (done ? 'if no first: split name' : 'reads name');
            app = st.node({ x: 455, y: 150, w: 186, h: 70, label: 'App code', sub, kind: 'primary' });
            sRows.set(String(recs.migrated || 0), recs.migrated ? 'warn' : 'info');
            sShapes.set(!rel() && done ? '2' : '1', !rel() && done ? 'warn' : 'info');
          }
          function reset() {
            v.restart();
            st.clearPackets();
            recs = PEOPLE.slice(0, 5).map(([f, l]) => ({ f, l, shape: 'old' }));
            recs.migrated = 0;
            done = false;
            draw();
            cap.set('Five users with one name field. Now split it.', 'info');
          }
          async function split() {
            if (done) { cap.set('Already split. Press Reset to replay.', 'info'); return; }
            v.restart();
            st.clearPackets();
            done = true;
            if (rel()) {
              const todo = recs.map((r, i) => (r.shape === 'old' ? i : -1)).filter((i) => i >= 0);
              todo.forEach((i) => { recs[i].shape = 'new'; });
              recs.migrated = todo.length;
              head.set('ALTER TABLE … then UPDATE every row', 'warn');
              app.set({ sub: 'expects first, last' });
              cap.set('Migration: every existing row gets rewritten', 'warn');
              let n = 0;
              for (const i of todo) {
                nodes[i].set({ kind: 'warn' });
                await v.sleep(380);
                nodes[i].set({ label: label(recs[i]), kind: 'good' });
                sRows.set(String(++n), 'warn');
              }
              head.set('users (first, last)', 'text2');
              cap.set(`${n} rows rewritten. On a huge table this can take hours.`, 'warn');
            } else {
              app.set({ sub: 'if no first: split name', kind: 'warn' });
              app.flash();
              sShapes.set('2', 'warn');
              cap.set('Nothing migrated. New docs use first/last; old docs stay.', 'good');
            }
          }
          async function add() {
            v.restart();
            st.clearPackets();
            draw();
            if (recs.length >= PEOPLE.length) { cap.set('Demo table is full. Press Reset to replay.', 'info'); return; }
            const [f, l] = PEOPLE[recs.length];
            recs.push({ f, l, shape: done ? 'new' : 'old' });
            await st.send(app, { x: 312, y: ry(recs.length - 1) }, { label: 'insert', kind: 'data', dur: 650 });
            draw();
            nodes[recs.length - 1].flash();
            cap.set(done ? 'The new user is written in the new shape.' : 'New user, same shape as everyone else.', 'info');
          }
          async function readAll() {
            v.restart();
            st.clearPackets();
            draw();
            const mixed = !rel() && done && recs.some((r) => r.shape === 'old');
            cap.set('Reading every user…', 'info');
            for (let i = 0; i < recs.length; i++) {
              const conv = !rel() && done && recs[i].shape === 'old';
              await st.send(nodes[i], app, { label: conv ? 'convert' : 'ok', kind: conv ? 'warn' : 'good', dur: 450 });
              if (conv) nodes[i].set({ kind: 'warn' });
            }
            if (rel()) cap.set('Every row has one shape. The database guarantees it.', 'good');
            else if (mixed) cap.set('Old docs are fixed up at read time. The schema lives in code.', 'warn');
            else cap.set('All docs share one shape, for now.', 'info');
          }
          reset();
        },
      },

      /* 5 ─────────────────────────────────────────────── */
      {
        title: 'One read vs many lookups',
        caption: 'A document is stored contiguously: loading it whole is one read, but small edits rewrite it. SQL databases now store JSON too.',
        problem: 'Scattered rows = many seeks',
        fix: 'Locality (documents, JSON columns)',
        tags: ['PostgreSQL JSON', 'MongoDB', 'Spanner', 'RethinkDB'],
        demo(el, v) {
          const box = v.wrap(el);
          const mode = v.segmented(box, {
            options: [{ value: 'tables', label: 'Tables' }, { value: 'doc', label: 'Document' }, { value: 'hybrid', label: 'SQL + JSON column' }],
            value: 'tables',
            onChange: draw,
          });
          const st = v.stage(box, { w: 560, h: 240 });
          const stats = v.row(box, { center: true });
          const sSeek = v.stat(stats, 'disk seeks to load', '–', 'info');
          const sBlk = v.stat(stats, 'blocks rewritten per edit', '–', 'info');
          const cap = v.caption(box, '');
          v.controls(box, [
            { label: 'Load whole profile', icon: '◉', kind: 'primary', onClick: load },
            { label: 'Edit one phone number', icon: '✎', onClick: edit },
          ]);
          const LAYOUT = {
            tables: [{ name: 'users', b: [1] }, { name: 'jobs', b: [5] }, { name: 'schools', b: [9] }, { name: 'contacts', b: [13], phone: true }],
            doc: [{ name: 'one profile document', b: [5, 6, 7, 8], phone: true }],
            hybrid: [{ name: 'users row + JSON', b: [5, 6, 7], phone: true }],
          };
          const bx = (i) => 24 + i * 32;
          const mid = (r) => (bx(r.b[0]) + bx(r.b[r.b.length - 1]) + 28) / 2;
          let app, blocks, regs;

          function draw() {
            v.restart();
            st.clearPackets();
            st.clear();
            const m = mode.get();
            regs = LAYOUT[m];
            app = st.node({ x: 280, y: 44, w: 120, h: 48, label: 'App', sub: 'profile 251', kind: 'primary' });
            st.text(24, 136, 'disk blocks', { anchor: 'start', size: 12, kind: 'muted', bold: true });
            const owned = new Set([].concat(...regs.map((r) => r.b)));
            blocks = Array.from({ length: 16 }, (_, i) => st.rect(bx(i), 152, 28, 40, { kind: owned.has(i) ? 'data' : 'neutral', rx: 4 }));
            blocks.forEach((b, i) => { if (!owned.has(i)) b.set({ opacity: 0.45 }); });
            regs.forEach((r) => st.text(mid(r), 214, r.name, { size: 12, kind: 'data', bold: true }));
            sSeek.set('–', 'info');
            sBlk.set('–', 'info');
            cap.set(m === 'tables' ? 'The profile\'s rows sit in four tables, scattered on disk.'
              : m === 'doc' ? 'The whole profile is stored together, in one place.'
                : 'Convergence: a relational row holding a JSON document.', 'info');
          }
          async function load() {
            draw();
            const m = mode.get();
            let seeks = 0;
            for (const r of regs) {
              await st.send(app, { x: mid(r), y: 146 }, { label: 'seek', kind: 'info', dur: 600 });
              sSeek.set(String(++seeks), seeks > 1 ? 'bad' : 'good');
              r.b.forEach((i) => blocks[i].set({ kind: 'info' }));
              await v.sleep(150);
            }
            await st.send({ x: 280, y: 146 }, app, { label: 'profile', kind: 'good', dur: 500 });
            cap.set(m === 'tables' ? '4 seeks, one per table (plus index lookups).'
              : m === 'doc' ? 'One seek, one contiguous read. That is locality.'
                : 'One seek like a document, and joins still work.', seeks > 1 ? 'bad' : 'good');
          }
          async function edit() {
            draw();
            const m = mode.get();
            const r = regs.find((x) => x.phone);
            await st.send(app, { x: mid(r), y: 146 }, { label: 'write', kind: 'warn', dur: 600 });
            for (const i of r.b) { blocks[i].set({ kind: 'warn' }); await v.sleep(160); }
            sBlk.set(String(r.b.length), r.b.length > 1 ? 'warn' : 'good');
            cap.set(m === 'tables' ? 'Only the contacts row changes: one block.'
              : m === 'doc' ? 'The whole document is rewritten for one phone number.'
                : 'The JSON value is rewritten whole, like a document.', r.b.length > 1 ? 'warn' : 'good');
          }
          draw();
        },
      },

      /* 6 ─────────────────────────────────────────────── */
      {
        title: 'Say what you want, not how',
        caption: 'A loop fixes the order and runs on one core. A declarative query lets the database pick how: in parallel, or via an index.',
        problem: 'Imperative code locks in the how',
        fix: 'Declarative queries',
        tags: ['SQL', 'relational algebra', 'query optimizer'],
        demo(el, v) {
          const box = v.wrap(el);
          const top = v.row(box);
          const mode = v.segmented(top, {
            options: [{ value: 'imp', label: 'Imperative loop' }, { value: 'dec', label: 'Declarative query' }],
            value: 'imp',
            onChange: reset,
          });
          const useIdx = v.toggle(top, { label: 'Genre index', value: false, onChange: reset });
          let cores = 1;
          v.slider(box, { label: 'CPU cores', min: 1, max: 4, value: 1, onInput: (x) => { cores = x; reset(); } });
          const st = v.stage(box, { w: 560, h: 236 });
          const out = v.tape(box, []);
          const stats = v.row(box, { center: true });
          const sSteps = v.stat(stats, 'time (steps)', '0', 'info');
          const sCores = v.stat(stats, 'cores busy', '0', 'info');
          const cap = v.caption(box, '');
          v.controls(box, [{ label: 'Find jazz songs', icon: '▶', kind: 'primary', onClick: run }]);
          const G = ['rock', 'jazz', 'pop', 'rock', 'jazz', 'pop', 'pop', 'rock', 'jazz', 'rock', 'pop', 'jazz', 'rock', 'pop', 'jazz', 'rock'];
          const CX = (i) => 300 + (i % 4) * 62;
          const CY = (i) => 22 + Math.floor(i / 4) * 52;
          let cells = [];

          function reset() {
            v.restart();
            st.clearPackets();
            st.clear();
            out.set([]);
            const imp = mode.get() === 'imp';
            st.text(20, 22, imp ? 'you write HOW' : 'you write WHAT', { anchor: 'start', size: 13, kind: 'muted', bold: true });
            const lines = imp
              ? ['res = []', 'for s in songs:', '  if s.genre == "jazz":', '    res.append(s)']
              : ['SELECT * FROM songs', "WHERE genre = 'jazz'"];
            lines.forEach((t, k) => st.text(20, 56 + k * 26, ind(t), { anchor: 'start', mono: true, size: 13 }));
            const how = imp ? 'order fixed · one core' : useIdx.get() ? 'engine uses the index' : `engine splits the work · ${cores} core${cores > 1 ? 's' : ''}`;
            st.text(20, 196, how, { anchor: 'start', size: 13, kind: imp ? 'warn' : 'good', bold: true });
            cells = G.map((g, i) => st.rect(CX(i), CY(i), 56, 44, { kind: g === 'jazz' ? 'data' : 'neutral', label: g, size: 13 }));
            sSteps.set('0', 'info');
            sCores.set('0', 'info');
            cap.set(imp && cores > 1 ? 'A loop is sequential: extra cores sit idle.' : 'Find every jazz song among 16.', 'info');
          }
          async function run() {
            reset();
            const imp = mode.get() === 'imp';
            const k = imp ? 1 : cores;
            const indexed = !imp && useIdx.get();
            const todo = indexed ? G.map((g, i) => (g === 'jazz' ? i : -1)).filter((i) => i >= 0) : G.map((_, i) => i);
            const lanes = Array.from({ length: k }, (_, w) => todo.filter((_, j) => Math.floor((j * k) / todo.length) === w));
            const steps = Math.max(...lanes.map((l) => l.length));
            sCores.set(String(k), k > 1 ? 'good' : 'info');
            cap.set(imp ? 'The loop checks songs one by one, in order'
              : indexed ? 'The index points straight at the jazz songs'
                : `${k} core${k > 1 ? 's' : ''} scan their share at the same time`, 'info');
            for (let s = 0; s < steps; s++) {
              const now = lanes.map((l) => l[s]).filter((i) => i != null);
              now.forEach((i) => cells[i].set({ kind: 'warn' }));
              await v.sleep(300);
              now.forEach((i) => {
                const hit = G[i] === 'jazz';
                cells[i].set({ kind: hit ? 'good' : 'neutral', opacity: hit ? 1 : 0.4 });
                if (hit) out.push({ text: '#' + (i + 1), kind: 'good' });
              });
              sSteps.set(String(s + 1), s + 1 > 8 ? 'bad' : 'good');
            }
            if (imp) cap.set('16 steps on one core. The code dictated the order.', 'warn');
            else cap.set(`${steps} steps, same query text. Result order may differ.`, 'good');
          }
          reset();
        },
      },

      /* 7 ─────────────────────────────────────────────── */
      {
        title: 'CSS rules vs DOM-poking code',
        caption: 'A CSS selector keeps matching as the page changes. Imperative JavaScript styles once and forgets, leaving stale highlights behind.',
        problem: 'Imperative styling goes stale',
        fix: 'Declarative CSS selector',
        tags: ['CSS', 'XSL', 'JavaScript DOM'],
        demo(el, v) {
          const box = v.wrap(el);
          const mode = v.segmented(box, {
            options: [{ value: 'js', label: 'Imperative JS', kind: 'bad' }, { value: 'css', label: 'Declarative CSS', kind: 'good' }],
            value: 'js',
            onChange: reset,
          });
          const st = v.stage(box, { w: 560, h: 250 });
          const cap = v.caption(box, '');
          const ctl = v.controls(box, [
            { id: 'next', label: 'Click next item', icon: '▶', kind: 'primary', onClick: next },
            { id: 'rerun', label: 'Re-run the JS', icon: '⟲', onClick: rerun },
            { id: 'reset', label: 'Reset', icon: '↺', kind: 'ghost', onClick: reset },
          ]);
          const ITEMS = ['Inbox', 'Starred', 'Sent', 'Drafts'];
          let sel = 0, painted = new Set([0]), items = [];

          function draw() {
            st.clear();
            const css = mode.get() === 'css';
            st.box(10, 8, 250, 234, { label: 'WEB PAGE' });
            items = ITEMS.map((t, i) => st.node({ x: 135, y: 64 + i * 50, w: 200, h: 40, label: t }));
            st.box(280, 8, 270, 234, { label: css ? 'STYLESHEET · always on' : 'SCRIPT · runs when called', kind: css ? 'good' : 'warn' });
            const lines = css ? ['li.selected {', '  background: blue;', '}'] : ['for (li of items) {', '  if (li.class == "selected")', '    li.style.bg = "blue";', '}'];
            lines.forEach((t, k) => st.text(296, 70 + k * 28, ind(t), { anchor: 'start', mono: true, size: 13 }));
            paint();
          }
          function paint() {
            items.forEach((n, i) => {
              const on = painted.has(i), s = i === sel;
              n.set({ kind: on ? (s ? 'primary' : 'bad') : 'neutral', sub: s ? 'class=selected' : on ? 'stale blue' : '' });
            });
          }
          function reset() {
            v.restart();
            st.clearPackets();
            sel = 0;
            painted = new Set([0]);
            draw();
            const css = mode.get() === 'css';
            ctl.set('rerun', { hidden: css });
            cap.set(css ? 'The rule says what: selected items are blue.' : 'The script ran once and painted Inbox blue.', 'info');
          }
          async function next() {
            v.restart();
            st.clearPackets();
            paint();
            const to = (sel + 1) % ITEMS.length;
            await st.send(items[sel], items[to], { label: 'selected', kind: 'info', dur: 600 });
            sel = to;
            if (mode.get() === 'css') {
              painted = new Set([sel]);
              paint();
              items[sel].flash();
              cap.set('The browser re-applies the rule. The highlight follows.', 'good');
            } else {
              paint();
              cap.set('The class moved, but nobody re-ran the code.', 'bad');
            }
          }
          function rerun() {
            v.restart();
            st.clearPackets();
            if (mode.get() === 'css') { cap.set('CSS never needs a re-run.', 'good'); return; }
            painted.add(sel);
            paint();
            items[sel].flash();
            if (painted.size > 1) cap.set('New item painted, but the old blue is never removed.', 'bad');
            else cap.set('In sync again, until the next click.', 'warn');
          }
          reset();
        },
      },

      /* 8 ─────────────────────────────────────────────── */
      {
        title: 'MapReduce: map emits, reduce folds',
        caption: 'The engine calls map once per document, groups the emitted pairs by key, then calls reduce once per key. Both must be pure functions.',
        tags: ['MongoDB', 'CouchDB', 'Hadoop'],
        demo(el, v) {
          const box = v.wrap(el);
          const st = v.stage(box, { w: 560, h: 300 });
          const DOCS = [['Jan', 'pizza', 3], ['Jan', 'salad', 2], ['Feb', 'pizza', 5], ['Jan', 'pizza', 4], ['Mar', 'pizza', 2], ['Feb', 'pizza', 1]];
          const KEYS = ['Jan', 'Feb', 'Mar'];
          const X = { doc: 78, emit: 226, grp: 366, red: 496 };
          const dy = (i) => 54 + i * 42;
          const gy = (k) => 96 + KEYS.indexOf(k) * 72;
          const groups = {};
          KEYS.forEach((k) => { groups[k] = DOCS.filter((d) => d[1] === 'pizza' && d[0] === k).map((d) => d[2]); });

          async function render(i, animate) {
            st.clear();
            [['documents', X.doc], ['map() emits', X.emit], ['grouped', X.grp], ['reduce()', X.red]].forEach(([t, x]) => st.text(x, 20, t, { size: 13, bold: true, kind: 'muted' }));
            const docs = DOCS.map((d, j) => st.node({ x: X.doc, y: dy(j), w: 138, h: 34, label: `${d[0]} · ${d[1]} · ${d[2]}`, mono: true, size: 13, kind: 'data', dim: i >= 1 && d[1] !== 'pizza' }));
            const pizza = DOCS.map((d, j) => j).filter((j) => DOCS[j][1] === 'pizza');
            if (i < 2) return;
            if (i === 2 && animate) await Promise.all(pizza.map((j) => st.send(docs[j], { x: X.emit - 44, y: dy(j) }, { kind: 'data', dur: 550 })));
            const emits = {};
            pizza.forEach((j) => { emits[j] = st.node({ x: X.emit, y: dy(j), w: 92, h: 30, label: `(${DOCS[j][0]}, ${DOCS[j][2]})`, mono: true, size: 13, kind: 'info' }); });
            if (i < 3) return;
            if (i === 3 && animate) await Promise.all(pizza.map((j) => st.send(emits[j], { x: X.grp - 58, y: gy(DOCS[j][0]) }, { kind: 'info', dur: 650 })));
            const grp = {};
            KEYS.forEach((k) => { grp[k] = st.node({ x: X.grp, y: gy(k), w: 116, h: 36, label: `${k}: [${groups[k].join(',')}]`, mono: true, size: 13, kind: 'warn' }); });
            if (i < 4) return;
            if (i === 4 && animate) await Promise.all(KEYS.map((k) => st.send(grp[k], { x: X.red - 48, y: gy(k) }, { label: 'sum', kind: 'warn', dur: 600 })));
            const red = {};
            KEYS.forEach((k) => { red[k] = st.node({ x: X.red, y: gy(k), w: 96, h: 36, label: `${k} = ${groups[k].reduce((a, b) => a + b, 0)}`, mono: true, size: 14, kind: 'good' }); });
            if (i < 5) return;
            st.box(X.red - 60, gy('Jan') - 34, 120, gy('Mar') - gy('Jan') + 68, { kind: 'good' });
            if (animate) {
              await st.send(grp.Feb, red.Feb, { label: 'retry', kind: 'warn', dur: 700 });
              red.Feb.flash();
            }
          }
          v.stepper(box, {
            steps: [
              'Six order documents. Goal: pizzas sold per month.',
              'A query filter keeps only type = pizza.',
              'map() runs once per document and emits (month, qty).',
              'The engine groups the pairs by key.',
              { caption: 'reduce() runs once per key and sums the list.', kind: 'good' },
              { caption: 'Pure functions: rerun one anywhere and get the same answer.', kind: 'info' },
            ],
            render,
          });
        },
      },

      /* 9 ─────────────────────────────────────────────── */
      {
        title: 'Property graphs: anything can link anything',
        caption: 'Vertices and edges each carry a label and properties. Any vertex may link to any other, and edges can be walked both ways.',
        tags: ['Neo4j', 'Titan', 'InfiniteGraph'],
        demo(el, v) {
          const box = v.wrap(el);
          const top = v.row(box);
          const pick = v.segmented(top, {
            options: [{ value: 'kenji', label: 'Vertex: Kenji' }, { value: 'berlin', label: 'Vertex: Berlin' }, { value: 'edge', label: 'Edge: LIVES_IN' }],
            value: 'kenji',
            onChange: inspect,
          });
          v.toggle(top, { label: 'Add a new kind of vertex', value: false, onChange: addDish });
          const st = v.stage(box, { w: 560, h: 322 });
          const g = drawGeo(st);
          const tbl = v.table(box, { cols: ['property', 'value'], rows: [] });
          const cap = v.caption(box, '');
          v.controls(box, [
            { label: 'Where does Kenji live?', icon: '▶', kind: 'primary', onClick: outward },
            { label: 'Who lives in Europe?', icon: '◉', onClick: inward },
          ]);
          const PROPS = {
            kenji: [['id', 'v1'], ['label', 'Person'], ['name', 'Kenji'], ['born', '1991']],
            berlin: [['id', 'v7'], ['label', 'Place'], ['type', 'city'], ['name', 'Berlin']],
            edge: [['id', 'e2'], ['label', 'LIVES_IN'], ['tail → head', 'v1 → v7'], ['since', '2019']],
          };
          let dish = null;

          function plain() {
            Object.keys(g.n).forEach((id) => g.n[id].set({ kind: g.base(id) }));
            g.e.forEach((x) => x.link.set({ kind: 'muted', thin: true, thick: false }));
          }
          function inspect() {
            v.restart();
            st.clearPackets();
            plain();
            const p = pick.get();
            tbl.update(PROPS[p]);
            if (p === 'edge') {
              g.edge('kenji', 'LIVES_IN', 'berlin').link.set({ kind: 'primary', thin: false, thick: true });
              cap.set('An edge: tail, head, label, and its own properties.', 'info');
            } else {
              g.n[p].set({ kind: 'primary' });
              cap.set('A vertex: unique ID, a label and key-value properties.', 'info');
            }
          }
          function addDish(on) {
            v.restart();
            st.clearPackets();
            if (on && !dish) {
              dish = st.node({ x: 60, y: 294, w: 80, h: 40, label: 'Ramen', shape: 'pill', kind: 'data' });
              st.link(g.n.kenji, dish, { label: 'LIKES', kind: 'data' });
              dish.flash();
              cap.set('No schema: a dish vertex and a LIKES edge, added on the fly.', 'good');
            } else if (!on && dish) {
              dish.remove();
              dish = null;
              cap.set('Removed. Nothing else had to change.', 'info');
            }
          }
          async function outward() {
            v.restart();
            st.clearPackets();
            plain();
            g.n.kenji.set({ kind: 'primary' });
            cap.set('Start at Kenji, follow outgoing edges', 'info');
            const path = [['kenji', 'LIVES_IN', 'berlin'], ['berlin', 'WITHIN', 'germany'], ['germany', 'WITHIN', 'europe']];
            for (const [a, l, b] of path) {
              await st.send(g.n[a], g.n[b], { label: l, kind: 'good', dur: 750 });
              g.edge(a, l, b).link.set({ kind: 'good', thin: false, thick: true });
              g.n[b].set({ kind: 'good' });
            }
            cap.set('Berlin → Germany → Europe. Three hops, no joins.', 'good');
          }
          async function inward() {
            v.restart();
            st.clearPackets();
            plain();
            g.n.europe.set({ kind: 'primary' });
            cap.set('Start at Europe, walk incoming edges backwards', 'info');
            let frontier = ['europe'];
            for (const label of ['WITHIN', 'WITHIN', 'LIVES_IN']) {
              const hops = g.e.filter((x) => x.l === label && frontier.includes(x.b));
              await Promise.all(hops.map((x) => st.send(g.n[x.b], g.n[x.a], { label: x.l, kind: 'info', dur: 800 })));
              hops.forEach((x) => {
                x.link.set({ kind: label === 'LIVES_IN' ? 'good' : 'info', thin: false, thick: true });
                g.n[x.a].set({ kind: label === 'LIVES_IN' ? 'good' : 'info' });
              });
              frontier = hops.map((x) => x.a);
            }
            cap.set('Incoming LIVES_IN edges: Kenji and Léa live in Europe.', 'good');
          }
          inspect();
        },
      },

      /* 10 ─────────────────────────────────────────────── */
      {
        title: 'Cypher draws the path; SQL recurses',
        caption: 'Who was born in Asia and lives in Europe? Cypher states the path pattern. SQL grows recursive sets one hop per round.',
        problem: 'Unknown number of joins',
        fix: 'Variable-length path patterns',
        tags: ['Cypher', 'Neo4j', 'WITH RECURSIVE'],
        demo(el, v) {
          const box = v.wrap(el);
          const st = v.stage(box, { w: 560, h: 322 });
          const stats = v.row(box, { center: true });
          const sLang = v.stat(stats, 'language', 'Cypher', 'primary');
          const sLines = v.stat(stats, 'query lines', '3', 'good');
          const CYPHER = [
            'MATCH (p:Person) -[:BORN_IN]->  () -[:WITHIN*0..]-> (:Place {name:"Asia"}),',
            '      (p)        -[:LIVES_IN]-> () -[:WITHIN*0..]-> (:Place {name:"Europe"})',
            'RETURN p.name',
          ].join('\n');
          const SQL = [
            'WITH RECURSIVE',
            '  in_asia(id) AS (',
            "      SELECT id FROM vertices WHERE name = 'Asia'",
            '    UNION',
            '      SELECT e.tail FROM edges e JOIN in_asia s',
            "        ON e.head = s.id WHERE e.label = 'WITHIN'),",
            '  in_europe(id) AS (',
            "      SELECT id FROM vertices WHERE name = 'Europe'",
            '    UNION',
            '      SELECT e.tail FROM edges e JOIN in_europe s',
            "        ON e.head = s.id WHERE e.label = 'WITHIN'),",
            '  born_asia(id) AS (',
            '      SELECT e.tail FROM edges e JOIN in_asia s',
            "        ON e.head = s.id WHERE e.label = 'BORN_IN'),",
            '  lives_eu(id) AS (',
            '      SELECT e.tail FROM edges e JOIN in_europe s',
            "        ON e.head = s.id WHERE e.label = 'LIVES_IN')",
            'SELECT v.name FROM vertices v',
            '  JOIN born_asia b ON v.id = b.id',
            '  JOIN lives_eu  l ON v.id = l.id;',
          ].join('\n');
          const code = codeBlock(v, box, CYPHER, { size: 12, maxHeight: 150 });
          const A = [['asia'], ['japan'], ['osaka']];
          const E = [['europe'], ['germany', 'france'], ['berlin', 'lyon']];

          async function render(i, animate) {
            st.clear();
            const g = drawGeo(st);
            const hi = (a, l, b, kind) => g.edge(a, l, b).link.set({ kind, thin: false, thick: true });
            const walk = async (path, kind, anim) => {
              for (const [a, l, b] of path) {
                if (anim) await st.send(g.n[a], g.n[b], { label: l, kind, dur: 600 });
                hi(a, l, b, kind);
                g.n[b].set({ kind });
              }
            };
            const cy = i <= 2;
            code.set(cy ? CYPHER : SQL);
            sLang.set(cy ? 'Cypher' : 'SQL', cy ? 'primary' : 'warn');
            sLines.set(cy ? '3' : String(SQL.split('\n').length), cy ? 'good' : 'bad');
            if (i === 0) return;
            const kBorn = [['kenji', 'BORN_IN', 'osaka'], ['osaka', 'WITHIN', 'japan'], ['japan', 'WITHIN', 'asia']];
            const lBorn = [['lea', 'BORN_IN', 'lyon'], ['lyon', 'WITHIN', 'france'], ['france', 'WITHIN', 'europe']];
            const kLive = [['kenji', 'LIVES_IN', 'berlin'], ['berlin', 'WITHIN', 'germany'], ['germany', 'WITHIN', 'europe']];
            if (i === 1) {
              g.n.kenji.set({ kind: 'primary' });
              g.n.lea.set({ kind: 'primary' });
              await Promise.all([walk(kBorn, 'good', animate), walk(lBorn, 'bad', animate)]);
              return;
            }
            if (i === 2) {
              await walk(kBorn, 'good', false);
              g.n.lea.dim(true);
              await walk(kLive, 'good', animate);
              g.n.kenji.set({ kind: 'good', badge: '✓' });
              return;
            }
            // SQL rounds: grow in_asia / in_europe one WITHIN hop at a time
            const rounds = Math.min(i - 2, 3);
            const mark = (id, set) => g.n[id].set({ kind: set === 'A' ? 'warn' : 'primary', badge: set === 'A' ? 'asia' : 'eu', badgeKind: set === 'A' ? 'warn' : 'primary' });
            for (let r = 0; r < rounds; r++) {
              const fresh = r === rounds - 1 && animate && i <= 5;
              if (fresh && r > 0) {
                const hops = g.e.filter((x) => x.l === 'WITHIN' && (A[r].includes(x.a) || E[r].includes(x.a)));
                await Promise.all(hops.map((x) => st.send(g.n[x.b], g.n[x.a], { label: 'WITHIN', kind: A[r].includes(x.a) ? 'warn' : 'primary', dur: 700 })));
              }
              A[r].forEach((id) => mark(id, 'A'));
              E[r].forEach((id) => mark(id, 'E'));
            }
            if (i === 6) {
              if (animate) {
                await Promise.all([
                  st.send(g.n.osaka, g.n.kenji, { label: 'BORN_IN', kind: 'warn', dur: 800 }),
                  st.send(g.n.berlin, g.n.kenji, { label: 'LIVES_IN', kind: 'primary', dur: 800 }),
                  st.send(g.n.berlin, g.n.lea, { label: 'LIVES_IN', kind: 'primary', dur: 800 }),
                ]);
              }
              hi('kenji', 'BORN_IN', 'osaka', 'good');
              hi('kenji', 'LIVES_IN', 'berlin', 'good');
              g.n.kenji.set({ kind: 'good', badge: '✓', badgeKind: 'good' });
              g.n.lea.set({ kind: 'neutral', badge: 'eu only', badgeKind: 'bad' });
            }
          }
          v.stepper(box, {
            steps: [
              'Who was born in Asia and now lives in Europe?',
              { caption: 'Cypher: BORN_IN, then WITHIN any number of times, up to Asia.', kind: 'info' },
              { caption: 'Plus LIVES_IN … Europe. Only Kenji matches both paths.', kind: 'good' },
              { caption: 'SQL round 1: seed in_asia = {Asia}, in_europe = {Europe}.', kind: 'warn' },
              { caption: 'Round 2: add every place WITHIN a set member.', kind: 'warn' },
              { caption: 'Round 3 adds the cities. Round 4 finds nothing new.', kind: 'warn' },
              { caption: 'Join BORN_IN into in_asia with LIVES_IN into in_europe: Kenji.', kind: 'good' },
            ],
            render,
          });
        },
      },

      /* 11 ─────────────────────────────────────────────── */
      {
        title: 'Triples: subject, predicate, object',
        caption: 'A triple-store keeps every fact as (subject, predicate, object). The object is a value or another vertex. SPARQL matches patterns over them.',
        tags: ['RDF', 'SPARQL', 'Datomic', 'AllegroGraph'],
        demo(el, v) {
          const box = v.wrap(el);
          const view = v.segmented(box, {
            options: [{ value: 'graph', label: 'As a graph' }, { value: 'list', label: 'As triples' }],
            value: 'graph',
            onChange: show,
          });
          codeBlock(v, box, 'SELECT ?name WHERE {\n  ?p :lives_in / :within* :europe .\n  ?p :name ?name .\n}');
          const st = v.stage(box, { w: 560, h: 316 });
          const tbl = v.table(box, { cols: ['subject', 'predicate', 'object'], rows: [] });
          const resRow = v.row(box, { center: true });
          const cap = v.caption(box, '');
          v.controls(box, [
            { label: 'Run SPARQL', icon: '▶', kind: 'primary', onClick: run },
            { label: 'Reset', icon: '↺', kind: 'ghost', onClick: reset },
          ]);
          const T = [
            ['kenji', 'name', '"Kenji"'], ['kenji', 'lives_in', 'berlin'],
            ['mei', 'name', '"Mei"'], ['mei', 'lives_in', 'osaka'],
            ['lea', 'name', '"Léa"'], ['lea', 'lives_in', 'lyon'],
            ['berlin', 'within', 'germany'], ['lyon', 'within', 'france'], ['osaka', 'within', 'japan'],
            ['germany', 'within', 'europe'], ['france', 'within', 'europe'], ['japan', 'within', 'asia'],
          ];
          const POS = {
            europe: [185, 34], asia: [460, 34],
            germany: [90, 100], france: [280, 100], japan: [460, 100],
            berlin: [90, 166], lyon: [280, 166], osaka: [460, 166],
            kenji: [90, 234], lea: [280, 234], mei: [460, 234],
            '"Kenji"': [90, 294], '"Léa"': [280, 294], '"Mei"': [460, 294],
          };
          const isLit = (s) => s[0] === '"';
          const N = {};
          Object.keys(POS).forEach((id) => {
            const person = ['kenji', 'lea', 'mei'].includes(id);
            N[id] = st.node({ x: POS[id][0], y: POS[id][1], w: isLit(id) ? 76 : 90, h: 34, label: id, shape: isLit(id) || person ? 'pill' : 'rect', kind: isLit(id) ? 'data' : person ? 'info' : 'neutral', mono: isLit(id), size: 13 });
          });
          const L = T.map(([s, p, o]) => st.link(N[s], N[o], { label: p, thin: true }));
          let state = [];

          function paint() {
            tbl.update(T.map((t, i) => ({ cells: [t[0], t[1], isLit(t[2]) ? { text: t[2], kind: 'data' } : t[2]], kind: state[i] || undefined })));
            L.forEach((l, i) => l.set({ kind: state[i] || 'muted', thin: !state[i], thick: !!state[i] }));
          }
          function show() {
            const g = view.get() === 'graph';
            st.el.style.display = g ? '' : 'none';
            tbl.el.style.display = g ? 'none' : '';
          }
          function reset() {
            v.restart();
            st.clearPackets();
            state = T.map(() => '');
            resRow.textContent = '';
            resRow.appendChild(v.h('span', { class: 'vz-muted' }, 'results:'));
            paint();
            cap.set('Same data as the graph: every edge and property is one triple.', 'info');
          }
          async function run() {
            reset();
            const people = [['kenji', [1, 6, 9], 0], ['mei', [3, 8, 11], 2], ['lea', [5, 7, 10], 4]];
            for (const [who, path, nameIdx] of people) {
              cap.set(`?p = ${who}: follow lives_in, then within*`, 'info');
              for (const i of path) {
                state[i] = 'warn';
                paint();
                if (view.get() === 'graph') await st.send(N[T[i][0]], N[T[i][2]], { label: T[i][1], kind: 'warn', dur: 500 });
                else await v.sleep(450);
              }
              const ok = T[path[path.length - 1]][2] === 'europe';
              path.forEach((i) => { state[i] = ok ? 'good' : 'bad'; });
              if (ok) state[nameIdx] = 'good';
              paint();
              if (ok) resRow.appendChild(v.cell(T[nameIdx][2], 'good', { pop: true }));
              await v.sleep(400);
            }
            cap.set('Kenji and Léa match. Mei\'s chain ends in Asia.', 'good');
          }
          reset();
          show();
        },
      },

      /* 12 ─────────────────────────────────────────────── */
      {
        title: 'Datalog: rules that derive new facts',
        caption: 'Facts are stored; rules derive new facts from them and may call themselves. Keep applying rules until nothing new appears.',
        tags: ['Datomic', 'Cascalog', 'Prolog'],
        demo(el, v) {
          const box = v.wrap(el);
          const rules = v.h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-start' } });
          box.appendChild(rules);
          const RULES = [
            'R1  inside(X, Y) :- within(X, Y).',
            'R2  inside(X, Z) :- within(X, Y), inside(Y, Z).',
            'R3  in_europe(P) :- lives_in(P, L), inside(L, europe).',
            '?-  in_europe(Who).',
          ];
          const chips = RULES.map((t) => { const c = v.cell(t, 'neutral'); c.style.whiteSpace = 'pre-wrap'; rules.appendChild(c); return c; });
          const st = v.stage(box, { w: 560, h: 300 });
          const FACTS = ['within(berlin, germany)', 'within(germany, europe)', 'within(osaka, japan)', 'within(japan, asia)', 'lives_in(kenji, berlin)', 'lives_in(mei, osaka)'];
          const DER = [
            { t: 'inside(berlin, germany)', step: 1, from: ['f0'] },
            { t: 'inside(germany, europe)', step: 1, from: ['f1'] },
            { t: 'inside(osaka, japan)', step: 1, from: ['f2'] },
            { t: 'inside(japan, asia)', step: 1, from: ['f3'] },
            { t: 'inside(berlin, europe)', step: 2, from: ['f0', 'd1'] },
            { t: 'inside(osaka, asia)', step: 2, from: ['f2', 'd3'] },
            { t: 'in_europe(kenji)', step: 4, from: ['f4', 'd4'] },
          ];
          const RULE_AT = [-1, 0, 1, 1, 2, 3];
          const ROW = (k) => 44 + k * 36;

          async function render(i, animate) {
            chips.forEach((c, k) => { c.className = 'vz-cell' + (k === RULE_AT[i] ? ' k-primary' : ''); });
            st.clear();
            st.text(143, 20, 'stored facts', { size: 14, bold: true, kind: 'muted' });
            st.text(417, 20, 'derived facts', { size: 14, bold: true, kind: 'muted' });
            const pos = {};
            FACTS.forEach((f, k) => {
              pos['f' + k] = { r: st.rect(12, ROW(k), 262, 30, { kind: 'neutral', label: f, mono: true, size: 15 }), x: 143, y: ROW(k) + 15 };
            });
            const fresh = DER.filter((d) => d.step === i);
            DER.forEach((d, k) => {
              if (d.step < i) pos['d' + k] = { r: st.rect(286, ROW(k), 262, 30, { kind: 'info', label: d.t, mono: true, size: 15 }), x: 417, y: ROW(k) + 15 };
            });
            fresh.forEach((d) => d.from.forEach((s) => pos[s].r.set({ kind: 'warn' })));
            if (animate && fresh.length) {
              await Promise.all(fresh.map((d) => Promise.all(d.from.map((s) => st.send(pos[s], { x: 417, y: ROW(DER.indexOf(d)) + 15 }, { kind: 'warn', dur: 750 })))));
            }
            fresh.forEach((d) => { const k = DER.indexOf(d); st.rect(286, ROW(k), 262, 30, { kind: 'good', label: d.t, mono: true, size: 15 }); });
            if (i === 3) {
              st.text(417, ROW(6) + 15, 'nothing new: fixed point', { size: 14, kind: 'muted', italic: true });
            }
            if (i === 5) {
              pos.d6.r.set({ kind: 'good' });
              pos.f5.r.set({ kind: 'bad' });
              st.text(143, 280, 'Who = kenji', { size: 16, kind: 'good', bold: true });
            }
          }
          v.stepper(box, {
            steps: [
              'Stored facts only. Rules will derive the rest.',
              { caption: 'R1: every within fact is also an inside fact.', kind: 'info' },
              { caption: 'R2: chain within + inside into longer paths.', kind: 'info' },
              { caption: 'R2 again: nothing new. The rules reached a fixed point.', kind: 'warn' },
              { caption: 'R3: who lives somewhere inside europe?', kind: 'info' },
              { caption: 'Query answered: kenji. Built one small rule at a time.', kind: 'good' },
            ],
            render,
          });
        },
      },
    ],

    cheatsheet: [
      { term: 'Relational model', text: 'Rows in tables, linked by joins. An optimizer picks access paths.', kind: 'primary' },
      { term: 'Document model', text: 'Self-contained JSON trees. Great for one-to-many data.', kind: 'data' },
      { term: 'Impedance mismatch', text: 'Objects in code vs rows in tables. ORMs paper over the gap.', kind: 'warn' },
      { term: 'Normalize with IDs', text: 'Keep human-readable text in one place and reference it by ID.', kind: 'good' },
      { term: 'Many-to-many', text: 'Needs joins. Without DB joins, the app does the joining.', kind: 'bad' },
      { term: 'Access paths', text: '1970s network and hierarchical DBs: code followed pointer chains by hand.', kind: 'warn' },
      { term: 'Schema-on-write', text: 'The DB enforces structure; changes need a migration.', kind: 'primary' },
      { term: 'Schema-on-read', text: 'Structure is implicit; code interprets data when reading it.', kind: 'info' },
      { term: 'Locality', text: 'A document loads in one read, but edits rewrite it whole.', kind: 'data' },
      { term: 'Declarative', text: 'Say what you want (SQL, CSS). The engine decides how.', kind: 'good' },
      { term: 'MapReduce', text: 'Pure map and reduce functions, called by the engine over many docs.', kind: 'info' },
      { term: 'Property graph', text: 'Vertices and edges with labels and properties. Queried with Cypher.', kind: 'primary' },
      { term: 'Triple-store', text: '(subject, predicate, object) facts. Queried with SPARQL.', kind: 'data' },
      { term: 'Datalog', text: 'Rules derive new facts from stored ones, recursively.', kind: 'good' },
    ],

    quiz: [
      {
        q: 'A résumé lists many jobs. Which model keeps them inside the profile record?',
        options: ['Relational: one table per list', 'Document: a nested JSON array', 'Network: a pointer chain per job'],
        answer: 1,
        why: 'One-to-many lists nest naturally in a document, so one read returns everything.',
      },
      {
        q: 'Profiles store region_id instead of the region name. What do you gain?',
        options: ['Renaming a region is a single write', 'Faster string sorting', 'Reads never need a join'],
        answer: 0,
        why: 'The text lives in one row. The price: reads need a join or a second query.',
      },
      {
        q: 'Old documents have "name", new ones have "first" and "last". This is…',
        options: ['Schema-on-write', 'A normalized schema', 'Schema-on-read'],
        answer: 2,
        why: 'Structure is interpreted at read time, so application code handles both shapes.',
      },
      {
        q: 'Why must MapReduce map and reduce functions be pure?',
        options: ['So they compile to faster code', 'So they can query other collections', 'So the engine can run them anywhere, in any order, and retry them'],
        answer: 2,
        why: 'No side effects and no extra queries make them safe to distribute and rerun.',
      },
      {
        q: 'In Cypher, what does -[:WITHIN*0..]-> mean?',
        options: ['Exactly zero WITHIN edges', 'Follow WITHIN edges any number of times', 'Skip all WITHIN edges'],
        answer: 1,
        why: 'A variable-length path, like * in a regex. SQL needs a recursive CTE for it.',
      },
    ],
  });
})();
