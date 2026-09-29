/* Chapter 4 — Encoding and evolution */
(function () {
  'use strict';

  /* ---------- tiny byte-level encoders (our own record, our own code) ---------- */
  const enc = new TextEncoder();
  const bytesOf = (s) => Array.from(enc.encode(String(s)));
  const hex = (b) => (b & 0xff).toString(16).padStart(2, '0');
  function varint(n) {
    const out = [];
    let v = Math.max(0, Math.floor(n));
    do { let b = v % 128; v = Math.floor(v / 128); if (v > 0) b += 128; out.push(b); } while (v > 0);
    return out;
  }
  const zigzag = (n) => { n = Math.floor(n); return n >= 0 ? n * 2 : -n * 2 - 1; };

  // roles → semantic colors
  const ROLE = { tag: 'primary', type: 'info', len: 'warn', count: 'warn', value: 'data', end: 'neutral', name: 'info' };
  const cellsOf = (arr) => arr.map((c) => ({ text: hex(c.b), kind: ROLE[c.role] || 'neutral', sm: true, title: c.label || '' }));

  // record shape: { name:'Ada', points:2000, tags:['chess','go'] }
  function jsonBytes(r) { return enc.encode(JSON.stringify(r)).length; }

  function encMsgpack(r) {
    const out = [];
    const P = (b, role, label) => out.push({ b, role, label });
    const keys = Object.keys(r);
    P(0x80 | keys.length, 'count', keys.length + ' fields');
    for (const k of keys) {
      const kb = bytesOf(k);
      P(0xa0 | kb.length, 'type', 'name "' + k + '"'); kb.forEach((x) => P(x, 'name', k));
      const val = r[k];
      if (typeof val === 'string') { const vb = bytesOf(val); P(0xa0 | vb.length, 'type', 'str'); vb.forEach((x) => P(x, 'value', val)); }
      else if (typeof val === 'number') {
        if (val >= 0 && val < 128) P(val, 'value', 'int ' + val);
        else if (val < 65536) { P(0xcd, 'type', 'uint16'); P((val >> 8) & 0xff, 'value', String(val)); P(val & 0xff, 'value', String(val)); }
        else { P(0xce, 'type', 'uint32'); [24, 16, 8, 0].forEach((s) => P((val >> s) & 0xff, 'value', String(val))); }
      } else if (Array.isArray(val)) {
        P(0x90 | val.length, 'count', val.length + ' items');
        val.forEach((s) => { const sb = bytesOf(s); P(0xa0 | sb.length, 'type', 'str'); sb.forEach((x) => P(x, 'value', s)); });
      }
    }
    return out;
  }

  function encProto(r) {
    const out = [];
    const P = (b, role, label) => out.push({ b, role, label });
    const nb = bytesOf(r.name);
    P((1 << 3) | 2, 'tag', 'field 1 · string'); varint(nb.length).forEach((x) => P(x, 'len', 'length')); nb.forEach((x) => P(x, 'value', r.name));
    P((2 << 3) | 0, 'tag', 'field 2 · varint'); varint(r.points).forEach((x) => P(x, 'value', 'points ' + r.points));
    r.tags.forEach((t) => { const tb = bytesOf(t); P((3 << 3) | 2, 'tag', 'field 3 · string'); varint(tb.length).forEach((x) => P(x, 'len', 'length')); tb.forEach((x) => P(x, 'value', t)); });
    return out;
  }

  function encAvro(r) {
    const out = [];
    const P = (b, role, label) => out.push({ b, role, label });
    const nb = bytesOf(r.name);
    varint(zigzag(nb.length)).forEach((x) => P(x, 'len', 'length')); nb.forEach((x) => P(x, 'value', r.name));
    varint(zigzag(r.points)).forEach((x) => P(x, 'value', 'points ' + r.points));
    varint(zigzag(r.tags.length)).forEach((x) => P(x, 'count', r.tags.length + ' items'));
    r.tags.forEach((t) => { const tb = bytesOf(t); varint(zigzag(tb.length)).forEach((x) => P(x, 'len', 'length')); tb.forEach((x) => P(x, 'value', t)); });
    P(0, 'end', 'end of array');
    return out;
  }

  function legend(v, parent, items) {
    const row = v.row(parent, { center: true });
    items.forEach(([label, kind]) => {
      const el = v.h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12.5px', color: 'var(--text-2)', fontWeight: '600' } },
        v.h('span', { style: { width: '13px', height: '13px', borderRadius: '4px', background: `var(--k-${kind}-f)`, border: `1.5px solid var(--k-${kind}-s)` } }), label);
      row.appendChild(el);
    });
    return row;
  }

  DDIA.chapter({
    id: 4,
    part: 1,
    title: 'Encoding and evolution',
    short: 'Encoding',
    tagline: 'Turn objects into bytes that survive change',

    cards: [
      /* 1 ─────────────────────────────────────────────── */
      {
        title: 'From live objects to flat bytes',
        caption: 'In memory, data is objects wired by pointers. To store or send it, you must flatten it into a self-contained byte string.',
        problem: 'Pointers mean nothing to another machine',
        fix: 'Encode to a byte sequence',
        tags: ['JSON', 'serialize'],
        demo(el, v) {
          const box = v.wrap(el);
          const mode = v.segmented(box, {
            options: [
              { value: 'ptr', label: 'Send raw pointers', kind: 'bad' },
              { value: 'enc', label: 'Encode to bytes', kind: 'good' },
            ],
            value: 'ptr', onChange: run,
          });
          const st = v.stage(box, { w: 560, h: 250 });
          st.box(12, 10, 250, 230, { label: 'MACHINE A', kind: 'primary' });
          st.box(298, 10, 250, 230, { label: 'MACHINE B', kind: 'info' });
          const obj = st.node({ x: 92, y: 70, w: 96, h: 42, label: 'profile', kind: 'primary', mono: true });
          const fName = st.node({ x: 78, y: 150, w: 84, h: 38, label: 'name', sub: 'Ada', mono: true });
          const fTags = st.node({ x: 190, y: 150, w: 84, h: 38, label: 'tags', sub: '[…]', mono: true });
          st.link(obj, fName, { dashed: true, thin: true, label: 'ptr', labelDy: -4 });
          st.link(obj, fTags, { dashed: true, thin: true, label: 'ptr', labelDy: -4 });
          const recv = st.node({ x: 423, y: 90, w: 110, h: 46, label: 'reader', sub: 'waiting', kind: 'info' });
          const tape = v.tape(box, []);
          const cap = v.caption(box, '');
          v.controls(box, [{ label: 'Send', icon: '▶', kind: 'primary', onClick: run }]);
          const rec = { name: 'Ada', points: 2000, tags: ['chess', 'go'] };

          async function run() {
            v.restart(); st.clearPackets();
            recv.set({ kind: 'info', sub: 'waiting', label: 'reader' });
            tape.set([]);
            if (mode.get() === 'ptr') {
              cap.set('A pointer is just a local memory address.', 'warn');
              await st.send(obj, recv, { label: '0x7ffe2a', kind: 'bad' });
              recv.set({ kind: 'bad', sub: 'points nowhere', label: 'reader' });
              cap.set('Machine B has no such address. The data is lost.', 'bad');
              return;
            }
            cap.set('Encode: walk the object and write bytes.', 'info');
            const bytes = encMsgpack(rec);
            for (let i = 0; i < bytes.length; i += 1) {
              if (!v.alive) return;
              tape.push({ text: hex(bytes[i].b), kind: ROLE[bytes[i].role] || 'neutral', sm: true });
              await v.sleep(24);
            }
            cap.set('Send the self-contained byte string.', 'info');
            await st.send(obj, recv, { label: 'bytes', kind: 'data' });
            recv.set({ kind: 'good', sub: 'decoded ✓', label: 'profile' });
            cap.set('B decodes the bytes back into its own object.', 'good');
          }
          run();
        },
      },

      /* 2 ─────────────────────────────────────────────── */
      {
        title: 'Old and new code must coexist',
        caption: 'During a rolling upgrade both versions run at once, so data must survive being read by newer and by older code.',
        problem: 'Old code chokes on a new field',
        fix: 'Ignore unknown fields',
        tags: ['rolling upgrade'],
        demo(el, v) {
          const box = v.wrap(el);
          const top = v.row(box);
          const dir = v.segmented(top, {
            options: [
              { value: 'back', label: 'Backward: new reads old' },
              { value: 'fwd', label: 'Forward: old reads new' },
            ],
            value: 'back', onChange: run,
          });
          const ignore = v.toggle(top, { label: 'Ignore unknown fields', value: true, onChange: run });
          const st = v.stage(box, { w: 560, h: 250 });
          // a mixed fleet strip: rolling upgrade in progress
          [0, 1, 2, 3].map((i) => st.node({ x: 96 + i * 124, y: 40, w: 96, h: 34, label: 'node ' + (i + 1), badge: i < 2 ? 'v2' : 'v1', badgeKind: i < 2 ? 'good' : 'neutral', kind: i < 2 ? 'good' : 'neutral' }));
          st.text(280, 74, 'rolling upgrade: v1 and v2 both live', { size: 12, kind: 'muted' });
          const writer = st.node({ x: 120, y: 160, w: 130, h: 50, label: 'writer', kind: 'primary' });
          const store = st.node({ x: 300, y: 160, w: 90, h: 60, label: 'record', shape: 'db', kind: 'data' });
          const reader = st.node({ x: 470, y: 160, w: 130, h: 50, label: 'reader', kind: 'info' });
          st.link(writer, store, { label: 'write' });
          st.link(store, reader, { label: 'read' });
          const cap = v.caption(box, '');
          v.controls(box, [{ label: 'Replay', icon: '▶', kind: 'primary', onClick: run }]);

          async function run() {
            v.restart(); st.clearPackets();
            const back = dir.get() === 'back';
            writer.set({ label: back ? 'old code v1' : 'new code v2', kind: back ? 'neutral' : 'primary' });
            reader.set({ label: back ? 'new code v2' : 'old code v1', kind: back ? 'primary' : 'info', sub: '' });
            store.set({ kind: 'data', badge: '' });
            const hasNew = !back; // new code writes the extra "avatar" field
            cap.set(back ? 'Old code writes a record with no avatar field.' : 'New code writes a record with a new avatar field.', 'info');
            await st.send(writer, store, { label: hasNew ? 'name,pts,avatar' : 'name,pts', kind: 'data' });
            store.set({ badge: hasNew ? '+avatar' : 'base' });
            await v.sleep(160);
            if (back) {
              await st.send(store, reader, { label: 'record', kind: 'good' });
              reader.set({ kind: 'good', sub: 'avatar = default' });
              cap.set('New code fills the missing field with a default. Works.', 'good');
              return;
            }
            if (ignore.get()) {
              await st.send(store, reader, { label: 'record', kind: 'good' });
              reader.set({ kind: 'good', sub: 'skips avatar' });
              cap.set('Old code ignores the unknown field. Forward compatible.', 'good');
            } else {
              await st.send(store, reader, { label: 'record', kind: 'bad', drop: 0.7 });
              reader.set({ kind: 'bad', sub: 'unknown field!' });
              cap.set('Old code trips over the unknown field. Broken.', 'bad');
            }
          }
          run();
        },
      },

      /* 3 ─────────────────────────────────────────────── */
      {
        title: 'Language formats trap your data',
        caption: 'Built-in serializers are handy but lock you to one language, invite attacks, ignore versioning, and are slow and bloated.',
        problem: "Java/Python built-in encoders",
        fix: 'Use a language-neutral format',
        tags: ['java.io', 'pickle', 'Kryo'],
        demo(el, v) {
          const box = v.wrap(el);
          const mode = v.segmented(box, {
            options: [
              { value: 'lock', label: 'Lock-in' },
              { value: 'sec', label: 'Security' },
              { value: 'ver', label: 'Versioning' },
              { value: 'speed', label: 'Size & speed' },
            ],
            value: 'lock', onChange: () => draw(),
          });
          const st = v.stage(box, { w: 560, h: 210 });
          const cap = v.caption(box, '');
          v.controls(box, [{ label: 'Run', icon: '▶', kind: 'primary', onClick: () => draw(true) }]);

          async function draw(animate) {
            v.restart(); st.clearPackets(); st.clear();
            const m = mode.get();
            if (m === 'lock') {
              const app = st.node({ x: 110, y: 105, w: 120, h: 52, label: 'App (Java)', kind: 'primary' });
              const blob = st.node({ x: 300, y: 105, w: 96, h: 44, label: 'blob', sub: 'java-only', kind: 'data', mono: true });
              const py = st.node({ x: 470, y: 60, w: 120, h: 48, label: 'App (Python)', kind: 'info' });
              const jv = st.node({ x: 470, y: 155, w: 120, h: 48, label: 'App (Java)', kind: 'good' });
              st.link(app, blob, { label: 'encode' });
              st.link(blob, py, { dashed: true });
              st.link(blob, jv, { dashed: true });
              cap.set('The bytes only make sense to Java. Other languages are locked out.', 'warn');
              if (animate) { await st.send(blob, py, { label: 'read', kind: 'bad', drop: 0.7 }); py.set({ kind: 'bad', sub: "can't parse" }); await st.send(blob, jv, { label: 'read', kind: 'good' }); jv.set({ kind: 'good', sub: 'ok' }); }
            } else if (m === 'sec') {
              const bytes = st.node({ x: 110, y: 105, w: 130, h: 50, label: 'untrusted bytes', kind: 'bad', mono: true });
              const dec = st.node({ x: 310, y: 105, w: 120, h: 50, label: 'decoder', kind: 'primary' });
              const obj = st.node({ x: 480, y: 105, w: 120, h: 50, label: 'any class', sub: 'instantiated', kind: 'warn' });
              st.link(bytes, dec, { label: 'decode' });
              st.link(dec, obj, { arrow: true });
              cap.set('Decoding can build arbitrary objects, a classic remote-code-execution hole.', 'bad');
              if (animate) { await st.send(bytes, dec, { label: 'crafted', kind: 'bad' }); dec.flash(); await st.send(dec, obj, { label: 'new', kind: 'bad' }); obj.set({ kind: 'bad', label: 'attacker code', sub: 'runs!' }); }
            } else if (m === 'ver') {
              const oldn = st.node({ x: 130, y: 60, w: 150, h: 46, label: 'class v1', sub: 'name, points', kind: 'neutral' });
              const blob = st.node({ x: 130, y: 150, w: 96, h: 44, label: 'old blob', kind: 'data', mono: true });
              const newn = st.node({ x: 420, y: 105, w: 150, h: 50, label: 'class v2', sub: '+ new field', kind: 'primary' });
              st.link(oldn, blob, { label: 'saved', arrow: true });
              st.link(blob, newn, { dashed: true });
              cap.set('Versioning is an afterthought: no clean way to read v1 blobs into v2.', 'warn');
              if (animate) { await st.send(blob, newn, { label: 'load', kind: 'warn', drop: 0.75 }); newn.set({ kind: 'bad', sub: 'field mismatch' }); }
            } else {
              const bars = v.bars(box, {
                items: [
                  { label: 'Java serialize', value: 174, kind: 'bad', text: '174 B' },
                  { label: 'Neutral binary', value: 33, kind: 'good', text: '33 B' },
                ], max: 180,
              });
              void bars;
              const big = st.node({ x: 150, y: 105, w: 150, h: 70, label: 'bloated blob', sub: 'slow to parse', kind: 'bad' });
              const small = st.node({ x: 410, y: 105, w: 110, h: 44, label: 'tight bytes', sub: 'fast', kind: 'good' });
              void big; void small;
              cap.set('Built-in encoders are notoriously fat and slow compared to schema formats.', 'warn');
            }
          }
          draw();
        },
      },

      /* 4 ─────────────────────────────────────────────── */
      {
        title: 'JSON is friendly but slippery',
        caption: 'Text formats are readable but vague: huge integers lose precision, binary needs Base64, and CSV has no schema.',
        problem: 'Ambiguous numbers, binary, CSV',
        fix: 'Lean on a schema (or quote it)',
        tags: ['JSON', 'XML', 'CSV', 'Base64'],
        demo(el, v) {
          const box = v.wrap(el);
          const mode = v.segmented(box, {
            options: [
              { value: 'num', label: 'Big numbers' },
              { value: 'bin', label: 'Binary' },
              { value: 'csv', label: 'CSV' },
            ],
            value: 'num', onChange: build,
          });
          const host = v.wrap(box);
          function build() {
            v.restart();
            host.textContent = '';
            const m = mode.get();
            if (m === 'num') buildNum();
            else if (m === 'bin') buildBin();
            else buildCsv();
          }
          function buildNum() {
            let bits = 55;
            const asStr = v.toggle(host, { label: 'Send the id as a string', value: false, onChange: draw });
            v.slider(host, { label: 'Tweet-id size (bits)', min: 48, max: 62, value: 55, onInput: (x) => { bits = x; draw(); } });
            const rows = v.wrap(host);
            const st = v.stat(v.row(host, { center: true }), 'exact after JSON parse?', '', 'info');
            const cap = v.caption(host, '');
            function draw() {
              rows.textContent = '';
              const trueV = (2n ** BigInt(bits) + 1n);
              const trueStr = trueV.toString();
              const quoted = asStr.get();
              const parsed = quoted ? trueStr : BigInt(Number(trueV)).toString();
              const ok = parsed === trueStr;
              const r1 = v.row(rows); r1.appendChild(v.cell('sent', 'neutral', { sm: true })); r1.appendChild(v.cell((quoted ? '"' : '') + trueStr + (quoted ? '"' : ''), 'info'));
              const r2 = v.row(rows); r2.appendChild(v.cell('got', 'neutral', { sm: true })); r2.appendChild(v.cell(parsed, ok ? 'good' : 'bad'));
              st.set(ok ? 'yes' : 'no', ok ? 'good' : 'bad');
              cap.set(ok ? (quoted ? 'A string round-trips exactly. This is the safe fix.' : 'Small enough to fit a double exactly.') : 'Above 2⁵³ the JSON number is silently corrupted.', ok ? 'good' : 'bad');
            }
            draw();
          }
          function buildBin() {
            let n = 300;
            v.slider(host, { label: 'Avatar bytes', min: 30, max: 900, value: 300, onInput: (x) => { n = x; draw(); } });
            const bars = v.bars(host, { items: [], max: 1200 });
            const st = v.stat(v.row(host, { center: true }), 'size overhead', '+33%', 'warn');
            const cap = v.caption(host, 'JSON has no binary type, so bytes ride as Base64 text.');
            function draw() {
              const b64 = Math.ceil(n / 3) * 4;
              bars.update([
                { label: 'raw bytes', value: n, kind: 'good', text: n + ' B' },
                { label: 'Base64 text', value: b64, kind: 'warn', text: b64 + ' B' },
              ], Math.max(1200, b64));
              st.set('+' + Math.round((b64 / n - 1) * 100) + '%', 'warn');
              cap.set('Base64 inflates every binary blob by about a third.', 'warn');
            }
            draw();
          }
          function buildCsv() {
            const quoted = v.toggle(host, { label: 'Quote the messy value', value: false, onChange: draw });
            const st = v.stage(host, { w: 560, h: 150 });
            const cap = v.caption(host, '');
            function draw() {
              v.restart(); st.clear();
              const q = quoted.get();
              const cols = q ? ['Ada', '"go, chess"', 'pro'] : ['Ada', 'go', ' chess', 'pro'];
              st.text(280, 24, 'row: Ada, go, chess, pro   (the value is "go, chess")', { size: 12.5, kind: 'muted' });
              const hdr = ['name', 'tags', q ? 'role' : '???', q ? '' : 'role'].filter((x) => x !== undefined);
              const n = cols.length;
              const w = 118, gap = 12, total = n * w + (n - 1) * gap, x0 = (560 - total) / 2;
              for (let i = 0; i < n; i++) {
                const bad = !q && i >= 1 && i <= 2;
                st.rect(x0 + i * (w + gap), 66, w, 40, { kind: bad ? 'bad' : q ? 'good' : 'neutral', label: cols[i], mono: true, size: 13 });
                st.text(x0 + i * (w + gap) + w / 2, 122, hdr[i] || 'role', { size: 12, kind: bad ? 'bad' : 'muted' });
              }
              cap.set(q ? 'Quoted, the comma stays inside one field. Columns line up.' : 'A comma inside a value splits into extra columns. Meaning shifts.', q ? 'good' : 'bad');
            }
            draw();
          }
          build();
        },
      },

      /* 5 ─────────────────────────────────────────────── */
      {
        title: 'Binary JSON barely saves space',
        caption: 'Binary JSON still stores every field name inside each record, so it shrinks the bytes only a little.',
        problem: 'Field names repeated in every record',
        fix: '(next card) drop the names',
        tags: ['MessagePack', 'BSON'],
        demo(el, v) {
          const box = v.wrap(el);
          const rec = { name: 'Ada', points: 2000, tags: ['chess', 'go'] };
          const top = v.row(box);
          v.slider(top, { label: 'points', min: 0, max: 60000, value: 2000, onInput: (x) => { rec.points = x; draw(); } });
          v.segmented(top, {
            options: [{ value: 1, label: '1 tag' }, { value: 2, label: '2 tags' }, { value: 3, label: '3 tags' }],
            value: 2, onChange: (n) => { rec.tags = ['chess', 'go', 'ranked'].slice(0, n); draw(); },
          });
          legend(v, box, [['name bytes', 'info'], ['length', 'warn'], ['value', 'data'], ['count', 'warn']]);
          const tape = v.tape(box, []);
          const stats = v.row(box, { center: true });
          const sJson = v.stat(stats, 'JSON', '', 'neutral');
          const sMp = v.stat(stats, 'MessagePack', '', 'good');
          const cap = v.caption(box, '');
          function draw() {
            const cells = encMsgpack(rec);
            tape.set(cellsOf(cells));
            const j = jsonBytes(rec), m = cells.length;
            sJson.set(j + ' B', 'neutral');
            sMp.set(m + ' B', 'good');
            const nameBytes = cells.filter((c) => c.role === 'name' || (c.role === 'type' && String(c.label).startsWith('name'))).length;
            cap.set(`Still spends ${nameBytes} bytes on field names. Only ${j - m} B smaller than JSON.`, 'warn');
          }
          draw();
        },
      },

      /* 6 ─────────────────────────────────────────────── */
      {
        title: 'Protobuf swaps names for tiny tags',
        caption: 'Protocol Buffers replaces field names with small numeric tags and packs integers as varints, shrinking a record a lot.',
        problem: 'Names cost bytes',
        fix: 'Field tags + varints',
        tags: ['Protocol Buffers', 'Thrift', 'gRPC'],
        demo(el, v) {
          const box = v.wrap(el);
          const rec = { name: 'Ada', points: 2000, tags: ['chess', 'go'] };
          v.slider(box, { label: 'points (watch the varint grow)', min: 0, max: 300000, value: 2000, onInput: (x) => { rec.points = x; draw(); } });
          legend(v, box, [['tag', 'primary'], ['length', 'warn'], ['value', 'data']]);
          const tape = v.tape(box, []);
          const stats = v.row(box, { center: true });
          const sJson = v.stat(stats, 'JSON', '', 'neutral');
          const sMp = v.stat(stats, 'MsgPack', '', 'warn');
          const sPb = v.stat(stats, 'Protobuf', '', 'good');
          const cap = v.caption(box, '');
          function draw() {
            const cells = encProto(rec);
            tape.set(cellsOf(cells));
            const j = jsonBytes(rec), m = encMsgpack(rec).length, p = cells.length;
            sJson.set(j + ' B', 'neutral'); sMp.set(m + ' B', 'warn'); sPb.set(p + ' B', 'good');
            const vlen = varint(rec.points).length;
            cap.set(`Each field starts with one tag byte; ${rec.points} packs into ${vlen} varint byte${vlen > 1 ? 's' : ''}.`, 'good');
          }
          draw();
        },
      },

      /* 7 ─────────────────────────────────────────────── */
      {
        title: 'Evolve a schema, keep it readable',
        caption: 'Field tags never change meaning, so you can add, drop, or widen fields while old and new code coexist.',
        problem: 'Reuse a tag, break every reader',
        fix: 'New field = new optional tag',
        tags: ['tags', 'optional', 'varint'],
        demo(el, v) {
          const box = v.wrap(el);
          const mode = v.segmented(box, {
            options: [
              { value: 'add', label: 'Add field' },
              { value: 'reuse', label: 'Reuse a tag', kind: 'bad' },
              { value: 'widen', label: 'Widen int' },
            ],
            value: 'add', onChange: run,
          });
          const st = v.stage(box, { w: 560, h: 230 });
          const writer = st.node({ x: 120, y: 120, w: 140, h: 52, label: 'writer', kind: 'primary' });
          const reader = st.node({ x: 440, y: 120, w: 140, h: 52, label: 'reader', kind: 'info' });
          const bytes = st.node({ x: 280, y: 120, w: 96, h: 44, label: 'bytes', kind: 'data', mono: true });
          st.link(writer, bytes, { label: 'writes' });
          st.link(bytes, reader, { label: 'reads' });
          const tape = v.tape(box, []);
          const cap = v.caption(box, '');
          v.controls(box, [{ label: 'Replay', icon: '▶', kind: 'primary', onClick: run }]);

          async function run() {
            v.restart(); st.clearPackets();
            const m = mode.get();
            if (m === 'add') {
              writer.set({ label: 'new code', sub: 'adds tag 4', kind: 'primary' });
              reader.set({ label: 'old code', sub: 'knows 1-3', kind: 'info' });
              tape.set(cellsOf(encProto({ name: 'Ada', points: 2000, tags: ['go'] }).concat([{ b: (4 << 3) | 2, role: 'tag', label: 'field 4 (new)' }, { b: 2, role: 'len' }, { b: 0x68, role: 'value' }, { b: 0x69, role: 'value' }])));
              await st.send(writer, bytes, { label: '…tag 4', kind: 'data' });
              await st.send(bytes, reader, { label: 'read', kind: 'good' });
              reader.set({ kind: 'good', sub: 'skips tag 4' });
              cap.set('Unknown tag 4 has a length, so old code skips it. Forward compatible.', 'good');
            } else if (m === 'reuse') {
              writer.set({ label: 'new code', sub: 'tag 2 = email', kind: 'primary' });
              reader.set({ label: 'old code', sub: 'tag 2 = points', kind: 'info' });
              tape.set(cellsOf(encProto({ name: 'Ada', points: 2000, tags: [] })));
              await st.send(writer, bytes, { label: 'tag 2', kind: 'data' });
              await st.send(bytes, reader, { label: 'read', kind: 'bad', drop: 0.7 });
              reader.set({ kind: 'bad', sub: 'email as points!' });
              cap.set('A reused tag means old data is misread. Never recycle a tag.', 'bad');
            } else {
              writer.set({ label: 'new code', sub: 'int64', kind: 'primary' });
              reader.set({ label: 'old code', sub: 'int32', kind: 'info' });
              tape.set(cellsOf(encProto({ name: 'Ada', points: 5000000000, tags: [] })));
              await st.send(writer, bytes, { label: 'big int', kind: 'data' });
              await st.send(bytes, reader, { label: 'read', kind: 'warn' });
              reader.set({ kind: 'bad', sub: 'truncated' });
              cap.set('A value too big for old 32-bit code gets truncated. Widen with care.', 'bad');
            }
          }
          run();
        },
      },

      /* 8 ─────────────────────────────────────────────── */
      {
        title: 'Avro drops tags, trusts the schema',
        caption: 'Avro writes values with no tags at all; only the schema, read in field order, tells you what each byte means.',
        problem: 'Bytes are meaningless alone',
        fix: 'Match reader & writer by name',
        tags: ['Avro', 'Hadoop'],
        demo(el, v) {
          const box = v.wrap(el);
          const mode = v.segmented(box, {
            options: [
              { value: 'same', label: 'Same schema' },
              { value: 'add', label: 'Reader adds field' },
              { value: 'drop', label: 'Reader drops field' },
              { value: 'order', label: 'Reordered' },
            ],
            value: 'same', onChange: run,
          });
          const st = v.stage(box, { w: 560, h: 250 });
          const cap = v.caption(box, '');
          v.controls(box, [{ label: 'Match', icon: '⇄', kind: 'primary', onClick: run }]);
          const writerF = ['name', 'points', 'tags'];

          async function run() {
            v.restart(); st.clearPackets(); st.clear();
            const m = mode.get();
            let readerF = ['name', 'points', 'tags'];
            if (m === 'add') readerF = ['name', 'points', 'tags', 'avatar'];
            else if (m === 'drop') readerF = ['name', 'tags'];
            else if (m === 'order') readerF = ['tags', 'name', 'points'];
            st.text(140, 22, "WRITER schema", { size: 12.5, kind: 'primary', bold: true });
            st.text(420, 22, "READER schema", { size: 12.5, kind: 'info', bold: true });
            const wNodes = writerF.map((f, i) => st.node({ x: 140, y: 55 + i * 52, w: 150, h: 40, label: f, kind: 'primary', mono: true }));
            const rNodes = readerF.map((f, i) => st.node({ x: 420, y: 55 + i * 52, w: 150, h: 40, label: f, kind: 'info', mono: true }));
            let filled = 0, ignored = 0;
            for (let i = 0; i < rNodes.length; i++) {
              if (!v.alive) return;
              const f = readerF[i];
              const wi = writerF.indexOf(f);
              if (wi >= 0) {
                st.link(wNodes[wi], rNodes[i], { kind: 'good', arrow: true });
                await st.send(wNodes[wi], rNodes[i], { label: 'by name', kind: 'good', dur: 600 });
                rNodes[i].set({ kind: 'good' });
              } else {
                rNodes[i].set({ kind: 'warn', sub: 'default' });
                filled++;
                await v.sleep(200);
              }
            }
            writerF.forEach((f, i) => { if (readerF.indexOf(f) < 0) { wNodes[i].set({ kind: 'ghost', sub: 'ignored' }); ignored++; } });
            cap.set(m === 'order' ? 'Order does not matter: fields match by name.' : filled ? 'A field the writer lacks is filled with a default.' : ignored ? 'A field the reader lacks is simply ignored.' : 'Same schema: every value maps straight across.', 'good');
          }
          run();
        },
      },

      /* 9 ─────────────────────────────────────────────── */
      {
        title: 'How does the reader get the schema?',
        caption: "Avro bytes need the writer's exact schema: from a file header, a version number, or a connection handshake.",
        problem: 'No schema → no meaning',
        fix: 'Ship or reference the schema',
        tags: ['object files', 'schema registry'],
        demo(el, v) {
          const box = v.wrap(el);
          const mode = v.segmented(box, {
            options: [
              { value: 'file', label: 'Big file' },
              { value: 'db', label: 'Database' },
              { value: 'conn', label: 'Connection' },
              { value: 'dump', label: 'DB dump' },
            ],
            value: 'file', onChange: () => draw(true),
          });
          const st = v.stage(box, { w: 560, h: 220 });
          const cap = v.caption(box, '');
          v.controls(box, [{ label: 'Play', icon: '▶', kind: 'primary', onClick: () => draw(true) }]);

          async function draw(animate) {
            v.restart(); st.clearPackets(); st.clear();
            const m = mode.get();
            if (m === 'file') {
              const hdr = st.node({ x: 90, y: 105, w: 110, h: 60, label: 'header', sub: 'schema ×1', kind: 'good' });
              const recs = [0, 1, 2, 3].map((i) => st.node({ x: 250 + i * 76, y: 105, w: 62, h: 44, label: 'rec', kind: 'data', mono: true }));
              recs.forEach((r) => st.link(hdr, r, { thin: true, dashed: true, arrow: false }));
              cap.set('Store the schema once at the top; millions of records follow.', 'good');
              if (animate) for (const r of recs) { await st.send(hdr, r, { label: 'apply', kind: 'good', dur: 450 }); }
            } else if (m === 'db') {
              const rec = st.node({ x: 110, y: 105, w: 120, h: 50, label: 'record', sub: 'schema #7', kind: 'data' });
              const reg = st.node({ x: 340, y: 60, w: 150, h: 50, label: 'schema table', kind: 'primary', shape: 'db' });
              const rdr = st.node({ x: 340, y: 165, w: 150, h: 46, label: 'reader', kind: 'info' });
              st.link(rec, reg, { label: 'look up #7' });
              st.link(reg, rdr, { label: 'schema' });
              cap.set('Each record stores a version number; look the schema up by it.', 'info');
              if (animate) { await st.send(rec, reg, { label: '#7', kind: 'warn' }); await st.send(reg, rdr, { label: 'schema', kind: 'good' }); rdr.set({ kind: 'good', sub: 'decoded' }); }
            } else if (m === 'conn') {
              const a = st.node({ x: 130, y: 105, w: 120, h: 50, label: 'client', kind: 'info' });
              const b = st.node({ x: 430, y: 105, w: 120, h: 50, label: 'server', kind: 'primary' });
              st.link(a, b, { both: true });
              cap.set('Two processes agree on the schema once at handshake, then reuse it.', 'info');
              if (animate) { await st.send(a, b, { label: 'my schema?', kind: 'info' }); await st.send(b, a, { label: 'agreed', kind: 'good' }); await st.send(a, b, { label: 'record', kind: 'data' }); }
            } else {
              const tbl = st.node({ x: 110, y: 105, w: 130, h: 56, label: 'SQL table', sub: 'add a column', kind: 'primary', shape: 'db' });
              const gen = st.node({ x: 320, y: 105, w: 120, h: 48, label: 'auto schema', kind: 'good' });
              const out = st.node({ x: 490, y: 105, w: 96, h: 48, label: 'Avro file', kind: 'data', mono: true });
              st.link(tbl, gen, { label: 'generate' });
              st.link(gen, out, { label: 'dump' });
              cap.set('Names, not tags, so a schema regenerates itself on every table dump.', 'good');
              if (animate) { await st.send(tbl, gen, { label: 'columns', kind: 'primary' }); gen.flash(); await st.send(gen, out, { label: 'encode', kind: 'good' }); }
            }
          }
          draw();
        },
      },

      /* 10 ─────────────────────────────────────────────── */
      {
        title: 'Data outlives the code',
        caption: 'Data outlives code. An old process that rewrites a new record can silently drop the fields it does not understand.',
        problem: 'Round-trip loses unknown fields',
        fix: 'Preserve unknown fields',
        tags: ['schema-on-read', 'migrations'],
        demo(el, v) {
          const box = v.wrap(el);
          const keep = v.toggle(box, { label: 'Preserve unknown fields', value: false, onChange: run });
          const st = v.stage(box, { w: 560, h: 220 });
          const db = st.node({ x: 280, y: 45, w: 110, h: 58, label: 'database', kind: 'data', shape: 'db' });
          const oldc = st.node({ x: 130, y: 160, w: 150, h: 52, label: 'old code', sub: 'knows name, pts', kind: 'info' });
          const model = st.node({ x: 430, y: 160, w: 150, h: 52, label: 'model object', kind: 'primary' });
          st.link(db, oldc, { label: 'read', curve: 26 });
          st.link(model, db, { label: 'write back', curve: 26 });
          st.link(oldc, model, {});
          const rec = v.tape(box, []);
          const cap = v.caption(box, '');
          v.controls(box, [{ label: 'Read-modify-write', icon: '↻', kind: 'primary', onClick: run }]);
          const full = [{ text: 'name', kind: 'info' }, { text: 'points', kind: 'info' }, { text: 'avatar', kind: 'data' }];

          async function run() {
            v.restart(); st.clearPackets();
            db.set({ sub: 'has avatar' });
            rec.set(full.map((c) => Object.assign({ sm: true }, c)));
            oldc.set({ kind: 'info', sub: 'knows name, pts' }); model.set({ kind: 'primary', sub: '' });
            cap.set('New code stored a record with an avatar field.', 'info');
            await st.send(db, oldc, { label: 'record', kind: 'data', curve: 26 });
            model.set({ sub: keep.get() ? 'name,pts,+raw' : 'name, points only' });
            await st.send(oldc, model, { label: 'decode', kind: keep.get() ? 'good' : 'warn' });
            cap.set('Old code updates points, then writes the object back.', 'warn');
            await st.send(model, db, { label: 'write', kind: keep.get() ? 'good' : 'bad', curve: 26 });
            if (keep.get()) {
              db.set({ kind: 'good', sub: 'avatar kept' });
              rec.set(full.map((c) => Object.assign({ sm: true }, c)));
              cap.set('It carried the unknown field through untouched. Safe.', 'good');
            } else {
              db.set({ kind: 'bad', sub: 'avatar lost' });
              rec.set([{ text: 'name', kind: 'info', sm: true }, { text: 'points', kind: 'info', sm: true }, { text: 'avatar', kind: 'ghost', sm: true, strike: true }]);
              cap.set('The avatar field vanished in the round-trip. Data loss.', 'bad');
            }
          }
          run();
        },
      },

      /* 11 ─────────────────────────────────────────────── */
      {
        title: 'RPC makes the network look local',
        caption: 'RPC dresses a remote call as a local one, but the network adds timeouts, lost replies, and retries that can duplicate work.',
        problem: 'Lost reply → blind retry → double charge',
        fix: 'Idempotency key',
        tags: ['gRPC', 'REST', 'Finagle'],
        demo(el, v) {
          const box = v.wrap(el);
          const mode = v.segmented(box, {
            options: [
              { value: 'local', label: 'Local call' },
              { value: 'net', label: 'Network call', kind: 'bad' },
            ],
            value: 'net', onChange: run,
          });
          const idem = v.toggle(box, { label: 'Idempotency key', value: false, onChange: run });
          const st = v.stage(box, { w: 560, h: 210 });
          const client = st.node({ x: 120, y: 105, w: 130, h: 54, label: 'client', kind: 'info' });
          const server = st.node({ x: 440, y: 105, w: 130, h: 54, label: 'server', kind: 'primary' });
          st.link(client, server, {});
          const charged = v.stat(v.row(box, { center: true }), 'times charged', '0', 'info');
          const cap = v.caption(box, '');
          v.controls(box, [{ label: 'Call charge($10)', icon: '▶', kind: 'primary', onClick: run }]);

          async function run() {
            v.restart(); st.clearPackets();
            server.set({ kind: 'primary', sub: '' });
            if (mode.get() === 'local') {
              charged.set('1', 'good');
              await st.send(client, server, { label: 'charge', kind: 'good' });
              await st.send(server, client, { label: 'ok', kind: 'good' });
              cap.set('In-process: fast, predictable, exactly once.', 'good');
              return;
            }
            let count = 0;
            charged.set('0', 'info');
            await st.send(client, server, { label: 'charge', kind: 'info' });
            count++; server.set({ sub: 'charged $10' }); charged.set(String(count), 'warn');
            cap.set('Server charged, but the reply is lost on the way back.', 'warn');
            await st.send(server, client, { label: 'ok', kind: 'bad', drop: 0.6 });
            await v.sleep(200);
            cap.set('Client saw a timeout, so it retries the same call.', 'warn');
            await st.send(client, server, { label: 'retry', kind: 'info' });
            if (idem.get()) {
              server.set({ kind: 'good', sub: 'same key: skip' });
              charged.set(String(count), 'good');
              await st.send(server, client, { label: 'ok', kind: 'good' });
              cap.set('Same key, so the server dedups. Charged once.', 'good');
            } else {
              count++; server.set({ kind: 'bad', sub: 'charged again' }); charged.set(String(count), 'bad');
              await st.send(server, client, { label: 'ok', kind: 'good' });
              cap.set('No key: the retry charges a second time. Duplicate.', 'bad');
            }
          }
          run();
        },
      },

      /* 12 ─────────────────────────────────────────────── */
      {
        title: 'Brokers pass messages, sender forgets',
        caption: 'A broker sits between sender and receiver: it buffers, redelivers after crashes, and fans one message out to many.',
        problem: 'Direct calls need the receiver up now',
        fix: 'A broker decouples them',
        tags: ['Kafka', 'RabbitMQ', 'actors'],
        demo(el, v) {
          const box = v.wrap(el);
          const mode = v.segmented(box, {
            options: [
              { value: 'buffer', label: 'Buffer' },
              { value: 'redeliver', label: 'Redeliver' },
              { value: 'fanout', label: 'Fan-out' },
            ],
            value: 'buffer', onChange: () => setup(),
          });
          const st = v.stage(box, { w: 560, h: 230 });
          const cap = v.caption(box, '');
          const ctl = v.controls(box, [{ id: 'go', label: 'Send', icon: '▶', kind: 'primary', onClick: run }]);
          void ctl;
          let producer, broker, consumers;

          function setup() {
            v.restart(); st.clearPackets(); st.clear();
            const m = mode.get();
            producer = st.node({ x: 95, y: 115, w: 110, h: 50, label: 'producer', kind: 'info' });
            broker = st.node({ x: 280, y: 115, w: 110, h: 56, label: 'broker', sub: 'queue', kind: 'primary', shape: 'pill' });
            st.link(producer, broker, {});
            const ys = m === 'fanout' ? [45, 115, 185] : [115];
            consumers = ys.map((y, i) => st.node({ x: 470, y, w: 110, h: 44, label: 'consumer ' + (m === 'fanout' ? i + 1 : ''), kind: 'info' }));
            consumers.forEach((c) => st.link(broker, c, { dashed: true }));
            cap.set(m === 'buffer' ? 'Consumer is offline. Send anyway.' : m === 'redeliver' ? 'Consumer will crash mid-delivery.' : 'One message, three subscribers.', 'info');
            if (m === 'buffer') consumers[0].set({ kind: 'ghost', down: true, sub: 'offline' });
          }

          async function run() {
            v.restart(); st.clearPackets();
            const m = mode.get();
            await st.send(producer, broker, { label: 'msg', kind: 'data' });
            broker.set({ sub: '1 held' });
            if (m === 'buffer') {
              cap.set('Broker buffers the message while the consumer is down.', 'warn');
              await v.sleep(500);
              consumers[0].set({ kind: 'good', down: false, sub: 'back online' });
              await st.send(broker, consumers[0], { label: 'msg', kind: 'good' });
              broker.set({ sub: 'queue' });
              cap.set('When it returns, the broker delivers. Nothing lost.', 'good');
            } else if (m === 'redeliver') {
              await st.send(broker, consumers[0], { label: 'msg', kind: 'warn', drop: 0.7 });
              consumers[0].set({ kind: 'bad', down: true, sub: 'crashed' });
              cap.set('Consumer crashed before acking. Broker keeps the message.', 'warn');
              await v.sleep(400);
              consumers[0].set({ kind: 'good', down: false, sub: 'restarted' });
              await st.send(broker, consumers[0], { label: 'again', kind: 'good' });
              broker.set({ sub: 'queue' });
              cap.set('It redelivers after the restart. At-least-once.', 'good');
            } else {
              await Promise.all(consumers.map((c) => st.send(broker, c, { label: 'msg', kind: 'good' })));
              consumers.forEach((c) => c.set({ kind: 'good' }));
              broker.set({ sub: 'queue' });
              cap.set('Every subscriber gets its own copy. Fan-out.', 'good');
            }
          }
          setup();
        },
      },
    ],

    cheatsheet: [
      { term: 'Encoding', text: 'Turn in-memory objects into a self-contained byte string (a.k.a. serialization).', kind: 'primary' },
      { term: 'Backward compatible', text: 'New code can read data written by old code.', kind: 'good' },
      { term: 'Forward compatible', text: 'Old code can read data written by new code.', kind: 'info' },
      { term: 'Rolling upgrade', text: 'Deploy node by node, so old and new versions run together.', kind: 'warn' },
      { term: 'Language formats', text: 'java.io, pickle: locked-in, insecure, poorly versioned, bloated.', kind: 'bad' },
      { term: '2⁵³ problem', text: 'JSON numbers above 2⁵³ lose precision; send big ids as strings.', kind: 'bad' },
      { term: 'Base64', text: 'How JSON smuggles binary as text, at a +33% size cost.', kind: 'warn' },
      { term: 'Field tags', text: 'Small numbers that replace field names in Thrift/Protobuf. Never reuse one.', kind: 'primary' },
      { term: 'Varint', text: 'Variable-length integer: small numbers take few bytes.', kind: 'data' },
      { term: 'Avro', text: 'No tags: values concatenated, decoded strictly in schema order.', kind: 'good' },
      { term: 'Writer vs reader schema', text: 'Avro matches fields by name; fills defaults, ignores extras.', kind: 'info' },
      { term: 'Data outlives code', text: 'Old rows persist; preserve unknown fields on read-modify-write.', kind: 'warn' },
      { term: 'RPC illusion', text: 'A remote call is not local: timeouts, lost replies, duplicates.', kind: 'bad' },
      { term: 'Message broker', text: 'Buffers, redelivers and fans out; decouples sender from receiver.', kind: 'primary' },
    ],

    quiz: [
      {
        q: 'During a rolling upgrade, why is forward compatibility needed?',
        options: ['New code must read old data', 'Old code must read data written by new code', 'The database must be rewritten'],
        answer: 1,
        why: 'Both versions run at once, so still-running old code will meet records written by new code.',
      },
      {
        q: "Twitter sends tweet ids as both a JSON number and a string. Why?",
        options: ['To save space', 'Numbers above 2⁵³ lose precision in JavaScript', 'Strings sort better'],
        answer: 1,
        why: 'A 64-bit id cannot fit exactly in a double, so the string carries the exact value.',
      },
      {
        q: 'What makes Protobuf far smaller than binary JSON?',
        options: ['It compresses the bytes', 'It drops field names for numeric tags', 'It omits the values'],
        answer: 1,
        why: 'Binary JSON still embeds every field name; tags are just small numbers defined once in the schema.',
      },
      {
        q: 'How does an Avro reader decode bytes with no tags?',
        options: ['It guesses the types', "It reads fields in order using the writer's schema", 'Each value is self-describing'],
        answer: 1,
        why: 'Avro values are bare, so the reader needs the exact writer schema and walks fields in order.',
      },
      {
        q: 'A retried RPC can charge a customer twice because…',
        options: ['The server is slow', 'The reply was lost, so the client retries an action that already ran', 'JSON is ambiguous'],
        answer: 1,
        why: 'A timeout hides whether the call succeeded; without an idempotency key the retry repeats the effect.',
      },
    ],
  });
})();
