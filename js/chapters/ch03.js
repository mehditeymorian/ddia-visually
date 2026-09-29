/* Chapter 3 — Storage and retrieval */
(function () {
  'use strict';

  /* ---------- local helpers ---------- */
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const kb = (b) => (b >= 1000 ? (b / 1000).toFixed(1) + ' KB' : b + ' B');

  /** A one-line text command box with a Run button. */
  function commandLine(v, parent, placeholder, onRun) {
    const row = v.row(parent);
    const input = v.h('input', {
      type: 'text', placeholder, 'aria-label': 'Command', autocomplete: 'off', spellcheck: 'false',
      style: {
        flex: '1 1 200px', minWidth: '0', minHeight: '36px', padding: '0 12px', borderRadius: '10px',
        border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text)',
        fontFamily: 'var(--font-mono)', fontSize: '14px',
      },
    });
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); onRun(input.value); }
    });
    row.appendChild(input);
    v.controls(row, [{ label: 'Run', icon: '▶', kind: 'primary', onClick: () => onRun(input.value) }]);
    return { input, set: (t) => { input.value = t; } };
  }

  /** Change the small label under a v.stat. */
  const statLabel = (s, text) => { s.el.lastChild.textContent = text; };

  /** Edit distance between two words (insert, delete, replace). */
  function lev(a, b) {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i].concat(new Array(b.length).fill(0)));
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
    }
    return d[a.length][b.length];
  }

  /** Small deterministic random generator, so layouts are stable. */
  function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  }

  DDIA.chapter({
    id: 3,
    part: 1,
    title: 'Storage and retrieval',
    short: 'Storage engines',
    tagline: 'How databases lay bytes on disk',
    cards: [
      /* 1 ─────────────────────────────────────────────── */
      {
        title: 'A log is the simplest database',
        caption: 'Writes just append, which is fast. Reads must scan everything, unless an in-memory hash map remembers each key\'s byte offset.',
        problem: 'Every read scans the log',
        fix: 'Hash index: key → offset',
        tags: ['Bitcask', 'Riak'],
        demo(el, v) {
          const box = v.wrap(el);
          const mode = v.segmented(box, {
            options: [{ value: 'none', label: 'No index', kind: 'bad' }, { value: 'hash', label: 'Hash index', kind: 'good' }],
            value: 'none',
            onChange: onMode,
          });
          const st = v.stage(box, { w: 560, h: 264 });
          const stats = v.row(box, { center: true });
          const sRead = v.stat(stats, 'records read', '—', 'info');
          const sWrite = v.stat(stats, 'steps per write', '1', 'good');
          const sRam = v.stat(stats, 'keys in RAM', '0', 'good');
          const cap = v.caption(box, '');
          const cmd = commandLine(v, box, 'set cat 7 · get cat · del cat', run);
          v.controls(box, [
            { label: 'set', icon: '✎', onClick: () => quick('set') },
            { label: 'get', icon: '◉', onClick: () => quick('get') },
            { label: 'del', icon: '✕', onClick: () => quick('del') },
            { label: 'Compact', icon: '⇄', kind: 'good', onClick: compact },
            { label: 'Crash', icon: '✱', kind: 'danger', onClick: crash },
          ]);

          const SEG = 5, MAXSEG = 3, KEYS = ['cat', 'dog', 'owl', 'fox', 'bee'];
          const LX = 190, RW = 58, RG = 5, RH = 34;
          const rowY = (s) => 36 + s * 76;
          const recX = (i) => LX + 50 + i * (RW + RG);
          const label = (r) => (r.v === null ? r.k + ' ✕' : r.k + '=' + r.v);
          let segs = [], map = new Map(), sealed = false;
          let recs = [], rows = new Map();

          function append(k, val) {
            let s = segs.length - 1;
            if (s < 0 || sealed || segs[s].length >= SEG) {
              if (segs.length >= MAXSEG) return null;
              segs.push([]);
              s = segs.length - 1;
              sealed = false;
            }
            const seg = segs[s], last = seg[seg.length - 1];
            seg.push({ k, v: val, off: last ? last.off + last.size : 0, size: k.length + String(val === null ? '✕' : val).length + 2 });
            return { s, i: seg.length - 1 };
          }
          function buildMap() {
            map = new Map();
            segs.forEach((seg, s) => seg.forEach((r, i) => { if (r.v === null) map.delete(r.k); else map.set(r.k, { s, i }); }));
          }
          function live() {
            const m = new Map();
            segs.flat().forEach((r) => { if (r.v === null) m.delete(r.k); else m.set(r.k, r); });
            return m;
          }

          function draw(o = {}) {
            const S = o.segs || segs, M = o.map || map, hash = mode.get() === 'hash';
            st.clear();
            recs = [];
            rows = new Map();
            st.text(12, 14, 'RAM · hash map', { size: 12, anchor: 'start', kind: 'muted', bold: true });
            st.text(LX, 14, 'DISK · log segments', { size: 12, anchor: 'start', kind: 'muted', bold: true });
            st.line(180, 6, 180, 256, { kind: 'muted', dashed: true, width: 1 });
            if (hash) {
              let j = 0;
              M.forEach((loc, k) => {
                const y = 32 + j * 36, r = S[loc.s][loc.i], hot = o.hotKey === k;
                rows.set(k, {
                  key: st.rect(12, y, 58, 28, { kind: hot ? 'good' : 'info', label: k, mono: true }),
                  off: st.rect(76, y, 94, 28, { kind: hot ? 'good' : 'neutral', label: `s${loc.s + 1} @${r.off}`, mono: true, size: 12 }),
                  y: y + 14,
                });
                j++;
              });
              if (!M.size) st.text(91, 60, o.lost ? 'wiped by crash' : 'empty', { size: 13, kind: o.lost ? 'bad' : 'muted', bold: true });
            } else {
              st.rect(12, 32, 158, 84, { kind: 'ghost', rx: 10 });
              st.text(91, 62, 'no index', { size: 14, kind: 'muted', bold: true });
              st.text(91, 88, 'get scans it all', { size: 12, kind: 'muted' });
            }
            for (let s = 0; s < MAXSEG; s++) {
              const y = rowY(s), seg = S[s];
              st.text(LX, y + RH / 2, 'seg ' + (s + 1), { size: 13, anchor: 'start', kind: seg ? 'text2' : 'muted', bold: true });
              recs[s] = [];
              for (let i = 0; i < SEG; i++) {
                const r = seg && seg[i];
                if (!r) { st.rect(recX(i), y, RW, RH, { kind: 'ghost' }); continue; }
                const fresh = o.fresh && o.fresh.s === s && o.fresh.i === i;
                const stale = o.stale && o.stale.has(r);
                const t = label(r);
                const rect = st.rect(recX(i), y, RW, RH, {
                  kind: fresh ? 'good' : stale ? 'bad' : r.v === null ? 'warn' : 'data', label: t, mono: true, size: t.length > 6 ? 12 : 13,
                });
                if (stale) rect.set({ opacity: 0.4 });
                recs[s][i] = rect;
                st.text(recX(i) + RW / 2, y + RH + 12, '@' + r.off, { size: 12, kind: 'muted', mono: true });
              }
            }
            sRam.set(hash ? String(M.size) : '0', hash ? 'info' : 'good');
            sWrite.set(hash ? '2' : '1', hash ? 'warn' : 'good');
          }

          function run(text) {
            v.restart();
            st.clearPackets();
            const m = String(text || '').trim().toLowerCase().match(/^(set|get|del)\s+([a-z]{1,4})(?:\s+([a-z0-9]{1,3}))?$/);
            if (!m || (m[1] === 'set') !== !!m[3]) { draw(); cap.set('Try: set cat 7 · get cat · del cat (short keys)', 'warn'); return; }
            if (m[1] === 'set') doSet(m[2], m[3]);
            else if (m[1] === 'get') doGet(m[2]);
            else doDel(m[2]);
          }
          function quick(op) {
            const L = [...live().keys()];
            const k = op === 'set' ? pick(KEYS) : L.length ? pick(L) : 'cat';
            const text = op === 'set' ? `set ${k} ${1 + Math.floor(Math.random() * 99)}` : `${op} ${k}`;
            cmd.set(text);
            run(text);
          }
          function full() { draw(); cap.set('All segments are full. Press Compact to free space.', 'warn'); }
          function doSet(k, val) {
            const L = live();
            if (!L.has(k) && L.size >= 6) { draw(); cap.set('This demo fits 6 keys. Reuse or delete one.', 'warn'); return; }
            const loc = append(k, val);
            if (!loc) return full();
            buildMap();
            const hash = mode.get() === 'hash';
            draw({ fresh: loc, hotKey: hash ? k : null });
            sRead.set('0', 'good');
            cap.set(hash ? `Append ${k}=${val}, then point the map at @${segs[loc.s][loc.i].off}.` : `Append ${k}=${val} at the end. One cheap sequential write.`, hash ? 'warn' : 'good');
          }
          function doDel(k) {
            if (!live().has(k)) { draw(); cap.set(`"${k}" does not exist.`, 'warn'); return; }
            const loc = append(k, null);
            if (!loc) return full();
            buildMap();
            draw({ fresh: loc });
            sRead.set('0', 'good');
            cap.set(`Delete = append a tombstone. Old ${k} values die at compaction.`, 'warn');
          }
          async function doGet(k) {
            draw();
            if (mode.get() === 'hash') {
              const loc = map.get(k), row = rows.get(k);
              if (!loc) { sRead.set('0', 'good'); cap.set(`"${k}" is not in the map. No disk read needed.`, 'good'); return; }
              row.key.set({ kind: 'primary' });
              row.off.set({ kind: 'primary' });
              cap.set(`Map lookup: ${k} → seg ${loc.s + 1} @${segs[loc.s][loc.i].off}`, 'info');
              await v.sleep(600);
              st.line(172, row.y, recX(loc.i) - 3, rowY(loc.s) + RH / 2, { kind: 'good', width: 2, arrow: true, layer: 'top' });
              recs[loc.s][loc.i].set({ kind: 'good' });
              sRead.set('1', 'good');
              cap.set(`One seek, one read: ${label(segs[loc.s][loc.i])}`, 'good');
              return;
            }
            let n = 0, hit = null;
            cap.set(`Scanning every record for "${k}"…`, 'warn');
            for (let s = 0; s < segs.length; s++) {
              for (let i = 0; i < segs[s].length; i++) {
                const r = segs[s][i];
                n++;
                sRead.set(String(n), 'warn');
                if (r.k === k) {
                  if (hit) recs[hit.s][hit.i].set({ kind: hit.r.v === null ? 'warn' : 'data' });
                  hit = { s, i, r };
                  recs[s][i].set({ kind: 'good' });
                } else recs[s][i].set({ kind: 'info' });
                await v.sleep(170);
                if (r.k !== k) recs[s][i].set({ kind: r.v === null ? 'warn' : 'data' });
              }
            }
            sRead.set(String(n), 'bad');
            if (hit && hit.r.v !== null) cap.set(`${label(hit.r)}, but only after reading all ${n} records.`, 'bad');
            else {
              if (hit) recs[hit.s][hit.i].set({ kind: 'bad' });
              cap.set(`Not found (or deleted) after reading all ${n} records.`, 'bad');
            }
          }
          async function compact() {
            v.restart();
            st.clearPackets();
            const all = segs.flat(), L = live();
            const keep = all.filter((r) => L.get(r.k) === r);
            if (keep.length === all.length) { draw(); cap.set('Nothing to drop: every record is already the latest.', 'info'); return; }
            const oldSegs = segs, oldMap = map;
            const stale = new Set(all.filter((r) => !keep.includes(r)));
            segs = [];
            sealed = false;
            keep.forEach((r) => append(r.k, r.v));
            sealed = true;
            buildMap();
            draw({ segs: oldSegs, map: oldMap, stale });
            cap.set(`${stale.size} stale records: overwritten values and tombstones.`, 'warn');
            await v.sleep(1500);
            draw();
            cap.set(`Merged into a new segment: ${all.length} → ${keep.length} records. Old files deleted.`, 'good');
          }
          async function crash() {
            v.restart();
            st.clearPackets();
            if (mode.get() !== 'hash') { draw(); sRead.set('—', 'info'); cap.set('Crash! Nothing in RAM to lose: the log is on disk.', 'info'); return; }
            buildMap();
            draw({ map: new Map(), lost: true });
            sRam.set('0', 'bad');
            cap.set('Crash! RAM is wiped and the hash map is gone.', 'bad');
            await v.sleep(1200);
            cap.set('Restart: read every segment to rebuild the map…', 'warn');
            const part = new Map();
            let n = 0;
            for (let s = 0; s < segs.length; s++) {
              for (let i = 0; i < segs[s].length; i++) {
                const r = segs[s][i];
                n++;
                if (r.v === null) part.delete(r.k); else part.set(r.k, { s, i });
                draw({ map: part, hotKey: r.k });
                recs[s][i].set({ kind: 'info' });
                sRead.set(String(n), 'warn');
                await v.sleep(260);
              }
            }
            draw();
            cap.set(`Rebuilt after reading ${n} records. Bitcask snapshots the map to restart faster.`, 'good');
          }
          function onMode() {
            v.restart();
            st.clearPackets();
            buildMap();
            draw();
            sRead.set('—', 'info');
            const hash = mode.get() === 'hash';
            cap.set(hash ? 'Index on: RAM maps each key to its latest byte offset.' : 'No index: writes append, reads scan the whole log.', hash ? 'good' : 'bad');
          }

          [['cat', '3'], ['dog', '1'], ['cat', '4'], ['owl', '9'], ['dog', '2'], ['cat', '5']].forEach(([k, val]) => append(k, val));
          buildMap();
          draw();
          cap.set('No index: writes append. Try get, then turn on the hash index.', 'info');
        },
      },

      /* 2 ─────────────────────────────────────────────── */
      {
        title: 'Sorted segments need only a sparse index',
        caption: 'Hash maps need every key in RAM and cannot do ranges. Sorted segments index one key per block; Bloom filters skip misses.',
        problem: 'All keys in RAM, no ranges',
        fix: 'SSTables + sparse index + Bloom',
        tags: ['LevelDB', 'RocksDB', 'Cassandra'],
        demo(el, v) {
          const box = v.wrap(el);
          const mode = v.segmented(box, {
            options: [
              { value: 'hash', label: '① Hash index', kind: 'bad' },
              { value: 'sparse', label: '② Sparse index' },
              { value: 'bloom', label: '③ + Bloom filter', kind: 'good' },
            ],
            value: 'hash',
            onChange: reset,
          });
          const st = v.stage(box, { w: 560, h: 290 });
          const stats = v.row(box, { center: true });
          const sRam = v.stat(stats, 'keys in RAM', '18', 'bad');
          const sDisk = v.stat(stats, 'disk reads', '—', 'info');
          const sScan = v.stat(stats, 'records checked', '—', 'info');
          const cap = v.caption(box, '');
          v.controls(box, [
            { label: 'Get a key', icon: '◉', kind: 'primary', onClick: () => get(hits[hi++ % hits.length]) },
            { label: 'Get missing key', icon: '◉', onClick: () => get(misses[mi++ % misses.length]) },
            { label: 'Range c… to d…', icon: '↗', onClick: rangeQ },
          ]);

          const SEGS = [
            { name: 'seg 2', sub: 'newer', keys: ['ape', 'bee', 'cat', 'cow', 'dog', 'emu', 'fly', 'hog', 'yak'] },
            { name: 'seg 1', sub: 'older', keys: ['ant', 'bat', 'cat', 'eel', 'elk', 'fox', 'gnu', 'hen', 'owl'] },
          ];
          const WRITE_ORDER = [4, 0, 7, 2, 8, 5, 1, 6, 3];
          const M = 32;
          const hsh = (s, seed) => {
            let h = seed >>> 0;
            for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
            return h % M;
          };
          const probe = (k) => [hsh(k, 2166136261), hsh(k, 40503)];
          SEGS.forEach((g) => {
            g.bits = new Array(M).fill(0);
            g.keys.forEach((k) => probe(k).forEach((b) => { g.bits[b] = 1; }));
          });
          const bloomSays = (g, k) => probe(k).every((b) => g.bits[b]);
          const inAny = (k) => SEGS.some((g) => g.keys.includes(k));
          const cands = ['zoo', 'ink', 'koi', 'pug', 'rye', 'sow', 'jam', 'kid', 'lox', 'mud', 'nun', 'pea', 'tea', 'urn', 'vat', 'wax'].filter((k) => !inAny(k));
          const tn = cands.filter((k) => SEGS.every((g) => !bloomSays(g, k)));
          const fp = cands.filter((k) => SEGS.filter((g) => bloomSays(g, k)).length === 1);
          const misses = [tn[0], fp[0], tn[1]].filter(Boolean);
          const hits = ['cow', 'fox', 'cat'];
          let hi = 0, mi = 0;

          const CW = 40, CH = 32, X0 = 112;
          const cellX = (i, sorted) => X0 + i * (CW + 4) + (sorted ? Math.floor(i / 3) * 14 : 0);
          const segY = (r) => 44 + r * 124;
          const order = (g) => (mode.get() === 'hash' ? WRITE_ORDER.map((i) => g.keys[i]) : g.keys);
          const floorBlock = (g, k) => { let b = -1; for (let j = 0; j < 3; j++) if (g.keys[j * 3] <= k) b = j; return b; };
          let cells = [], bitEls = [], bloomTxt = [];
          let disk = 0, checked = 0;
          const upd = () => {
            sDisk.set(String(disk), disk > 1 ? 'bad' : disk ? 'warn' : 'good');
            sScan.set(String(checked), 'info');
          };

          function draw(q) {
            st.clear();
            cells = [];
            bitEls = [];
            bloomTxt = [];
            const m = mode.get(), sorted = m !== 'hash';
            if (q) st.text(312, 16, q, { size: 15, kind: 'accent', bold: true, mono: true });
            SEGS.forEach((g, r) => {
              const y = segY(r), ks = order(g);
              st.text(12, y + 9, g.name, { size: 14, anchor: 'start', bold: true });
              st.text(12, y + 27, g.sub + (sorted ? ', sorted' : ', unsorted'), { size: 12, anchor: 'start', kind: 'muted' });
              if (sorted) for (let b = 0; b < 3; b++) st.rect(cellX(b * 3, true) - 4, y - 4, 3 * CW + 16, CH + 8, { kind: 'ghost', rx: 8 });
              cells[r] = ks.map((k, i) => st.rect(cellX(i, sorted), y, CW, CH, { kind: m === 'hash' || i % 3 === 0 ? 'primary' : 'data', label: k, mono: true }));
              if (m === 'bloom') {
                st.text(12, y + 54, 'Bloom', { size: 12, anchor: 'start', kind: 'text2', bold: true });
                bitEls[r] = g.bits.map((bit, b) => st.rect(X0 + b * 13, y + 48, 11, 11, { kind: bit ? 'info' : 'ghost', rx: 2 }));
                bloomTxt[r] = st.text(56, y + 54, '', { size: 12, anchor: 'start', bold: true });
              }
            });
            st.rect(12, 262, 14, 14, { kind: 'primary', rx: 3 });
            st.text(34, 270, m === 'hash' ? 'key kept in RAM: every single one' : 'key kept in RAM: first key of each block', { size: 12, anchor: 'start', kind: 'text2' });
            if (m !== 'hash') {
              st.rect(330, 262, 14, 14, { kind: 'ghost', rx: 3 });
              st.text(352, 270, 'block: read from disk in one go', { size: 12, anchor: 'start', kind: 'text2' });
            }
            sRam.set(m === 'hash' ? '18' : '6', m === 'hash' ? 'bad' : 'good');
          }
          function begin(q) {
            v.restart();
            st.clearPackets();
            draw(q);
            disk = 0;
            checked = 0;
            upd();
          }

          async function get(k) {
            begin('get ' + k);
            const m = mode.get();
            for (let r = 0; r < SEGS.length; r++) {
              const g = SEGS[r], ks = order(g);
              if (m === 'hash') {
                const i = ks.indexOf(k);
                cap.set(`${g.name} hash map: ${i < 0 ? 'no ' + k : k + ' → byte offset'}`, 'info');
                await v.sleep(700);
                if (i < 0) continue;
                disk++;
                checked++;
                upd();
                cells[r][i].set({ kind: 'good' });
                cap.set(`Found with one disk read. But all 18 keys live in RAM.`, 'warn');
                return;
              }
              if (m === 'bloom') {
                const yes = bloomSays(g, k);
                probe(k).forEach((b) => bitEls[r][b].set({ kind: g.bits[b] ? 'good' : 'bad' }));
                bloomTxt[r].set(yes ? 'maybe' : 'no', yes ? 'warn' : 'good');
                cap.set(yes ? `${g.name} Bloom: both bits are 1. Maybe here: read it.` : `${g.name} Bloom: a bit is 0, so ${k} is surely absent.`, yes ? 'warn' : 'good');
                await v.sleep(1100);
                if (!yes) continue;
              }
              const blk = floorBlock(g, k);
              if (blk < 0) { cap.set(`${k} sorts before ${g.name}'s first key: skip it.`, 'info'); await v.sleep(700); continue; }
              cells[r][blk * 3].set({ kind: 'warn' });
              cap.set(`Sparse index: ${k} would be in the block starting at ${g.keys[blk * 3]}.`, 'info');
              await v.sleep(800);
              disk++;
              upd();
              let found = false;
              for (let i = blk * 3; i < blk * 3 + 3; i++) {
                checked++;
                upd();
                const hit = g.keys[i] === k;
                cells[r][i].set({ kind: hit ? 'good' : 'info' });
                await v.sleep(320);
                if (hit) { found = true; break; }
                if (g.keys[i] > k) break;
              }
              if (found) { cap.set(`Found ${k} in ${g.name}: ${disk} block read${disk > 1 ? 's' : ''}, ${checked} records checked.`, 'good'); return; }
              cap.set(`${k} is not in that block of ${g.name}.`, 'warn');
              await v.sleep(600);
            }
            if (m === 'hash') cap.set('In neither hash map: no disk read. Fast, but RAM-hungry.', 'warn');
            else if (m === 'bloom') cap.set(disk ? `Absent. A false positive cost ${disk} wasted read.` : 'Absent, proven with zero disk reads.', disk ? 'warn' : 'good');
            else cap.set(`Absent, but proving it cost ${disk} disk reads.`, 'bad');
          }

          async function rangeQ() {
            begin('keys from c to d');
            const m = mode.get();
            const inRange = (k) => k >= 'c' && k < 'e';
            if (m === 'hash') {
              cap.set('A hash map has no order: test every key.', 'warn');
              for (let r = 0; r < SEGS.length; r++) {
                const ks = order(SEGS[r]);
                for (let i = 0; i < ks.length; i++) {
                  checked++;
                  if (inRange(ks[i])) disk++;
                  cells[r][i].set({ kind: inRange(ks[i]) ? 'good' : 'info' });
                  upd();
                  await v.sleep(110);
                }
              }
              cap.set(`Tested all ${checked} keys, then ${disk} scattered reads.`, 'bad');
              return;
            }
            for (let r = 0; r < SEGS.length; r++) {
              const g = SEGS[r], blk = Math.max(0, floorBlock(g, 'c'));
              cap.set(`${g.name}: jump to the block for c, then read in order.`, 'info');
              let cur = -1;
              for (let i = blk * 3; i < g.keys.length; i++) {
                const b = Math.floor(i / 3);
                if (b !== cur) { cur = b; disk++; }
                checked++;
                const k = g.keys[i];
                cells[r][i].set({ kind: inRange(k) ? 'good' : 'info' });
                upd();
                await v.sleep(300);
                if (k >= 'e') break;
              }
            }
            cap.set(`Sequential: ${disk} block reads, ${checked} records.${m === 'bloom' ? ' Bloom filters cannot help ranges.' : ''}`, 'good');
          }

          function reset() {
            begin('');
            sDisk.set('—', 'info');
            sScan.set('—', 'info');
            const m = mode.get();
            cap.set(
              m === 'hash' ? 'Every key of every segment sits in RAM. Ranges are hard.'
                : m === 'sparse' ? 'Sorted segments: keep one key per block in RAM.'
                  : 'Each segment gets a tiny bit array that rules keys out.',
              m === 'hash' ? 'bad' : m === 'sparse' ? 'info' : 'good');
          }
          reset();
        },
      },

      /* 3 ─────────────────────────────────────────────── */
      {
        title: 'Writes land in a sorted memtable',
        caption: 'Writes go into a sorted in-memory tree. When it fills, it is flushed to disk as a new SSTable. A write-ahead log survives crashes.',
        problem: 'A crash wipes the memtable',
        fix: 'Write-ahead log (WAL)',
        tags: ['LevelDB', 'RocksDB', 'HBase', 'Cassandra'],
        demo(el, v) {
          const box = v.wrap(el);
          const top = v.row(box);
          const walT = v.toggle(top, {
            label: 'Write-ahead log',
            value: false,
            onChange: () => {
              v.restart();
              st.clearPackets();
              draw();
              cap.set(walT.get() ? 'WAL on: every write is appended to disk first.' : 'WAL off: the memtable lives only in RAM.', walT.get() ? 'good' : 'warn');
            },
          });
          const st = v.stage(box, { w: 560, h: 334 });
          const stats = v.row(box, { center: true });
          const sMem = v.stat(stats, 'unflushed writes', '0', 'info');
          const sSst = v.stat(stats, 'SSTables', '0', 'info');
          const sLost = v.stat(stats, 'writes lost', '0', 'good');
          const cap = v.caption(box, '');
          v.controls(box, [
            { label: 'Write', icon: '✎', kind: 'primary', onClick: write },
            { label: 'Read', icon: '◉', onClick: read },
            { label: 'Crash + restart', icon: '✱', kind: 'danger', onClick: crash },
          ]);

          const CAP = 4, POOL = 'abcdefgh'.split('');
          const CELLW = 66, memCell = (i) => 138 + i * (CELLW + 6);
          const SSTY = (r) => 236 + r * 30, sstCell = (i) => 96 + i * 54;
          const MEMPT = { x: 280, y: 74 };
          const sortedRows = (m) => [...m].sort((a, b) => (a[0] < b[0] ? -1 : 1));
          const tag = (t) => '#' + (t.lo === t.hi ? t.lo : t.lo + '–' + t.hi);
          let mem = new Map(), memN = 0, wal = [], ssts = [], lost = 0, n = 0, sid = 0;
          let memRects = [], sstRows = [];

          function draw(o = {}) {
            st.clear();
            const walOn = walT.get();
            st.box(124, 24, 318, 76, { label: 'MEMTABLE · RAM · sorted', kind: 'primary', solid: true });
            st.box(124, 120, 318, 76, { label: walOn ? 'WAL · disk · append-only' : 'WAL · off', kind: walOn ? 'warn' : 'ghost', solid: walOn });
            st.box(12, 208, 536, 120, { label: 'SSTABLES · disk · newest first', kind: 'data', solid: true });
            const who = st.node({ x: 52, y: 62, w: 50, h: 50, shape: 'person', label: 'Client' });
            const memRows = o.mem || sortedRows(mem);
            memRects = [];
            for (let i = 0; i < CAP; i++) {
              const e = memRows[i];
              if (!e) { st.rect(memCell(i), 58, CELLW, 32, { kind: 'ghost' }); continue; }
              memRects.push(st.rect(memCell(i), 58, CELLW, 32, { kind: o.memKind || (o.hot === e[0] ? 'good' : 'primary'), label: e[0] + '=' + e[1], mono: true }));
            }
            const W = o.wal || wal;
            for (let i = 0; i < CAP; i++) {
              const e = W[i];
              if (e) st.rect(memCell(i), 154, CELLW, 32, { kind: 'warn', label: e[0] + '=' + e[1], mono: true });
              else st.rect(memCell(i), 154, CELLW, 32, { kind: 'ghost' });
            }
            const shown = o.memN != null ? o.memN : memN;
            st.text(500, 56, `${shown} / ${CAP}`, { size: 20, bold: true, kind: shown >= CAP - 1 ? 'warn' : 'text' });
            st.text(500, 80, 'until flush', { size: 12, kind: 'muted' });
            st.line(500, 104, 500, 224, { kind: 'muted', dashed: true, arrow: true });
            st.text(510, 160, 'flush', { size: 12, anchor: 'start', kind: 'muted' });
            sstRows = [];
            const T = o.ssts || ssts, shift = o.shift || 0;
            T.forEach((t, r) => {
              const y = SSTY(r + shift);
              st.text(28, y + 13, tag(t), { size: 13, bold: true, anchor: 'start', kind: 'text2' });
              sstRows.push(t.rows.map((e, i) => st.rect(sstCell(i), y, 50, 26, { kind: o.freshId === t.lo ? 'good' : 'data', label: e[0] + '=' + e[1], mono: true, size: 12 })));
            });
            if (!T.length && !shift) st.text(280, 268, 'nothing flushed yet', { size: 13, kind: 'muted' });
            sMem.set(String(memN), memN ? 'warn' : 'good');
            sSst.set(String(ssts.length), 'info');
            sLost.set(String(lost), lost ? 'bad' : 'good');
            return who;
          }

          async function write() {
            v.restart();
            st.clearPackets();
            const k = pick(POOL), val = ++n, walOn = walT.get();
            const before = { mem: sortedRows(mem), wal: wal.slice(), ssts: ssts.slice(), memN };
            if (walOn) wal.push([k, val]);
            mem.set(k, val);
            memN++;
            let flushed = null, merged = false;
            if (memN >= CAP) {
              flushed = { lo: ++sid, hi: sid, rows: sortedRows(mem) };
              ssts.unshift(flushed);
              mem = new Map();
              memN = 0;
              wal = [];
              if (ssts.length > 3) {
                merged = true;
                const newer = ssts[2], older = ssts[3], m = new Map(older.rows);
                newer.rows.forEach(([a, b]) => m.set(a, b));
                ssts.splice(2, 2, { lo: older.lo, hi: newer.hi, rows: sortedRows(m) });
              }
            }
            const who = draw(before);
            cap.set(`put ${k}=${val}`, 'info');
            if (walOn) {
              cap.set(`put ${k}=${val}: append to the WAL first`, 'warn');
              await st.send(who, { x: memCell(Math.min(before.wal.length, CAP - 1)) + CELLW / 2, y: 170 }, { label: `${k}=${val}`, kind: 'warn', dur: 650 });
            }
            await st.send(who, MEMPT, { label: `${k}=${val}`, kind: 'primary', dur: 650 });
            if (!flushed) {
              draw({ hot: k });
              cap.set(walOn ? 'Logged on disk, then inserted in sorted order.' : 'Inserted in sorted order. It exists only in RAM.', walOn ? 'good' : 'warn');
              return;
            }
            draw({ mem: flushed.rows, wal: walOn ? before.wal.concat([[k, val]]) : [], ssts: before.ssts.slice(0, 2), shift: 1, memN: CAP });
            cap.set('Memtable full: write it out as a sorted SSTable.', 'info');
            await v.sleep(600);
            await v.tween(700, (t) => memRects.forEach((r, i) => r.set({ x: memCell(i) + (sstCell(i) - memCell(i)) * t, y: 58 + (SSTY(0) - 58) * t, w: CELLW + (50 - CELLW) * t })));
            draw({ freshId: flushed.lo });
            cap.set(merged ? 'Flushed. The two oldest tables were merged in the background.' : 'Flushed and durable. The WAL for it is discarded.', 'good');
          }

          async function read() {
            v.restart();
            st.clearPackets();
            const k = pick(POOL);
            const who = draw();
            cap.set(`get ${k}: check the memtable first`, 'info');
            await st.send(who, MEMPT, { label: 'get ' + k, kind: 'info', dur: 650 });
            const mi = sortedRows(mem).findIndex((e) => e[0] === k);
            if (mi >= 0) { memRects[mi].set({ kind: 'good' }); cap.set(`Found ${k}=${mem.get(k)} in the memtable: the newest value.`, 'good'); return; }
            for (let r = 0; r < ssts.length; r++) {
              const cells = sstRows[r];
              cells.forEach((c) => c.set({ kind: 'info' }));
              cap.set(`Not yet. Try SSTable ${tag(ssts[r])}: newer before older.`, 'info');
              await v.sleep(700);
              const i = ssts[r].rows.findIndex((e) => e[0] === k);
              cells.forEach((c, j) => c.set({ kind: j === i ? 'good' : 'data' }));
              if (i >= 0) { cap.set(`Found ${k}=${ssts[r].rows[i][1]} in ${tag(ssts[r])}. Older copies are ignored.`, 'good'); return; }
            }
            cap.set(`${k} is nowhere: every table was checked.`, 'warn');
          }

          async function crash() {
            v.restart();
            st.clearPackets();
            const hadMem = sortedRows(mem), hadN = memN, log = wal.slice();
            const replay = new Map();
            log.forEach(([a, b]) => replay.set(a, b));
            const lostNow = hadN - log.length;
            mem = replay;
            memN = log.length;
            lost += lostNow;
            if (!hadN) { draw(); cap.set('Crash! The memtable was empty, so nothing was at risk.', 'info'); return; }
            draw({ mem: hadMem, memKind: 'bad', memN: hadN });
            cap.set('Power cut! The memtable was only in RAM…', 'bad');
            await v.sleep(1000);
            draw({ mem: [], memN: 0 });
            await v.sleep(500);
            if (!log.length) { draw(); cap.set(`${lostNow} acknowledged write${lostNow > 1 ? 's' : ''} gone forever. Turn on the WAL.`, 'bad'); return; }
            const part = new Map();
            for (let i = 0; i < log.length; i++) {
              part.set(log[i][0], log[i][1]);
              draw({ mem: sortedRows(part), memN: i + 1, hot: log[i][0] });
              cap.set(`Replaying the WAL: ${i + 1} of ${log.length}`, 'warn');
              await v.sleep(480);
            }
            draw();
            cap.set(lostNow ? `Recovered ${log.length}, but ${lostNow} predate the WAL and are lost.` : `Replayed ${log.length} writes from the WAL. Nothing lost.`, lostNow ? 'warn' : 'good');
          }

          ssts = [{ lo: 1, hi: 1, rows: [['a', 1], ['c', 2], ['e', 3], ['g', 4]] }];
          sid = 1;
          mem = new Map([['b', 5], ['d', 6]]);
          memN = 2;
          n = 6;
          draw();
          cap.set('Writes go to RAM first. Crash with the WAL off, then on.', 'info');
        },
      },

      /* 4 ─────────────────────────────────────────────── */
      {
        title: 'Compaction merges segments like merge sort',
        caption: 'Walk the sorted segments side by side, always copying the smallest key. Same key twice? Keep the newest. Tombstones erase old values.',
        tags: ['LevelDB', 'RocksDB', 'Cassandra', 'HBase'],
        demo(el, v) {
          const box = v.wrap(el);
          const st = v.stage(box, { w: 560, h: 290 });
          const OLD = [['ant', 3], ['cat', 1], ['dog', 5], ['fox', 2], ['owl', 4]];
          const NEW = [['bee', 9], ['cat', 7], ['fox', null], ['gnu', 6], ['owl', 8]];
          const ev = [];
          let i = 0, j = 0;
          while (i < OLD.length || j < NEW.length) {
            const a = OLD[i], b = NEW[j];
            if (a && b && a[0] === b[0]) { ev.push({ o: i, n: j, k: a[0], out: b[1] === null ? null : b, type: b[1] === null ? 'tomb' : 'dup', old: a }); i++; j++; }
            else if (b && (!a || b[0] < a[0])) { ev.push({ n: j, k: b[0], out: b[1] === null ? null : b, type: b[1] === null ? 'tomb' : 'copy' }); j++; }
            else { ev.push({ o: i, k: a[0], out: a, type: 'copy' }); i++; }
          }
          const outs = [];
          ev.forEach((e) => { e.slot = e.out ? outs.length : -1; if (e.out) outs.push(e.out); });
          const lab = (r) => (r[1] === null ? r[0] + ' ✕' : r[0] + ':' + r[1]);
          const steps = [{ caption: 'Two sorted segments. The head of each is highlighted.', kind: 'info' }];
          ev.forEach((e) => steps.push(
            e.type === 'dup' ? { caption: `${e.k} in both: keep newer ${lab(e.out)}, drop ${lab(e.old)}.`, kind: 'warn' }
              : e.type === 'tomb' ? { caption: `${e.k} has a tombstone: drop every version of it.`, kind: 'bad' }
                : { caption: `${e.k} is the smallest head: copy it to the output.`, kind: 'good' }));
          steps.push({ caption: `Done: ${OLD.length + NEW.length} records became ${outs.length}, still sorted.`, kind: 'good' });
          steps.push({ caption: 'Size-tiered: merge several similar-sized tables into one bigger one.', kind: 'info' });
          steps.push({ caption: 'Leveled: levels of small, non-overlapping tables. Merge only overlaps.', kind: 'info' });

          const cx = (k) => 128 + k * 72;
          const ROW = { o: 50, n: 116, out: 226 };

          function drawMerge(s) {
            const done = ev.slice(0, Math.min(s, ev.length));
            const usedO = new Set(), usedN = new Set();
            done.forEach((e) => { if (e.o != null) usedO.add(e.o); if (e.n != null) usedN.add(e.n); });
            const last = s >= 1 && s <= ev.length ? ev[s - 1] : null;
            const headO = OLD.findIndex((_, k) => !usedO.has(k)), headN = NEW.findIndex((_, k) => !usedN.has(k));
            st.text(12, ROW.o + 10, 'seg 1', { size: 14, anchor: 'start', bold: true });
            st.text(12, ROW.o + 27, 'older', { size: 12, anchor: 'start', kind: 'muted' });
            st.text(12, ROW.n + 10, 'seg 2', { size: 14, anchor: 'start', bold: true });
            st.text(12, ROW.n + 27, 'newer', { size: 12, anchor: 'start', kind: 'muted' });
            st.text(12, ROW.out + 10, 'merged', { size: 14, anchor: 'start', bold: true, kind: 'good' });
            st.text(12, ROW.out + 27, 'new file', { size: 12, anchor: 'start', kind: 'muted' });
            st.line(310, 160, 310, 214, { kind: 'muted', arrow: true, dashed: true });
            const draw = (rows, y, used, head, which) => rows.map((r, k) => {
              let kind = r[1] === null ? 'warn' : 'data', op = 1;
              if (used.has(k)) {
                op = 0.3;
                if (last && last[which] === k) { kind = last.out === r ? 'good' : 'bad'; op = 1; }
              } else if (k === head && s <= ev.length) kind = 'primary';
              const rc = st.rect(cx(k), y, 64, 34, { kind, label: lab(r), mono: true });
              rc.set({ opacity: op });
              return rc;
            });
            draw(OLD, ROW.o, usedO, headO, 'o');
            draw(NEW, ROW.n, usedN, headN, 'n');
            const outN = done.filter((e) => e.out).length;
            for (let k = outN; k < outs.length; k++) st.rect(cx(k), ROW.out, 64, 34, { kind: 'ghost' });
            const outRects = [];
            for (let k = 0; k < outN; k++) outRects.push(st.rect(cx(k), ROW.out, 64, 34, { kind: 'good', label: lab(outs[k]), mono: true }));
            return { last, outRects };
          }
          function drawTiered() {
            st.text(280, 20, 'SIZE-TIERED COMPACTION', { size: 14, bold: true, kind: 'text2' });
            const rows = [['small', 60, 4, 44], ['medium', 142, 4, 92], ['large', 224, 1, 200]];
            rows.forEach(([name, y, count, w], r) => {
              st.text(20, y + 15, name, { size: 13, anchor: 'start', kind: 'text2', bold: true });
              const total = count * w + (count - 1) * 10, x0 = 320 - total / 2;
              for (let k = 0; k < count; k++) st.rect(x0 + k * (w + 10), y, w, 30, { kind: r === 1 && k === 3 ? 'good' : 'data' });
              if (r < 2) {
                st.line(320, y + 36, 320, y + 76, { kind: 'primary', arrow: true, width: 2 });
                st.text(332, y + 57, 'merge 4 alike', { size: 12, anchor: 'start', kind: 'primary', bold: true });
              }
            });
            st.text(548, 280, 'e.g. HBase, Cassandra', { size: 12, anchor: 'end', kind: 'muted' });
          }
          function drawLeveled() {
            st.text(280, 20, 'LEVELED COMPACTION', { size: 14, bold: true, kind: 'text2' });
            const L1 = ['a–f', 'g–l', 'm–r', 's–z'], L2 = ['a–c', 'd–f', 'g–i', 'j–l', 'm–o', 'p–r', 's–u', 'v–z'];
            st.text(20, 64, 'L0', { size: 14, anchor: 'start', bold: true });
            st.text(20, 144, 'L1', { size: 14, anchor: 'start', bold: true });
            st.text(20, 224, 'L2', { size: 14, anchor: 'start', bold: true });
            [0, 1].forEach((k) => st.rect(200 + k * 100, 50, 90, 28, { kind: 'data', label: 'a–z', size: 12 }));
            L1.forEach((t, k) => st.rect(90 + k * 108, 130, 100, 28, { kind: k === 1 ? 'primary' : 'data', label: t, size: 12 }));
            L2.forEach((t, k) => st.rect(90 + k * 54, 210, 48, 28, { kind: k === 2 || k === 3 ? 'warn' : 'data', label: t, size: 12 }));
            st.line(238, 162, 224, 205, { kind: 'primary', arrow: true, width: 2 });
            st.line(258, 162, 274, 205, { kind: 'primary', arrow: true, width: 2 });
            st.text(330, 186, 'rewrite only overlapping tables', { size: 12, anchor: 'start', kind: 'primary', bold: true });
            st.text(548, 280, 'e.g. LevelDB, RocksDB', { size: 12, anchor: 'end', kind: 'muted' });
          }

          async function render(s, animate) {
            st.clear();
            if (s === ev.length + 2) return drawTiered();
            if (s === ev.length + 3) return drawLeveled();
            const { last, outRects } = drawMerge(s);
            if (animate && last && last.out) {
              const fromNew = last.out === NEW[last.n];
              const fx = cx(fromNew ? last.n : last.o), fy = fromNew ? ROW.n : ROW.o;
              const r = outRects[last.slot];
              r.set({ x: fx, y: fy });
              await v.tween(600, (t) => r.set({ x: fx + (cx(last.slot) - fx) * t, y: fy + (ROW.out - fy) * t }));
            }
          }
          v.stepper(box, { steps, render, delay: 1500 });
        },
      },

      /* 5 ─────────────────────────────────────────────── */
      {
        title: 'B-trees: fixed pages, split when full',
        caption: 'Pages form a shallow tree. A lookup reads one page per level. A full page splits and pushes its middle key up.',
        tags: ['PostgreSQL', 'MySQL', 'SQLite', 'Oracle'],
        demo(el, v) {
          const box = v.wrap(el);
          const st = v.stage(box, { w: 560, h: 318 });
          const stats = v.row(box, { center: true });
          const sPages = v.stat(stats, 'pages read', '—', 'info');
          const sH = v.stat(stats, 'tree height', '2', 'primary');
          const sK = v.stat(stats, 'keys', '10', 'info');
          const cap = v.caption(box, '');
          v.controls(box, [
            { label: 'Find a key', icon: '◉', kind: 'primary', onClick: find },
            { label: 'Insert a key', icon: '＋', onClick: insert },
            { label: 'Reset', icon: '⟲', onClick: reset },
          ]);
          box.appendChild(v.h('div', { class: 'vz-muted', style: { textAlign: 'center' } }, 'Real pages are 4 KB and branch ~500 ways: 4 levels ≈ 256 TB.'));

          const MAXK = 3;
          let nid = 0, root = null, els = new Map();
          const mk = (keys, kids) => ({ id: ++nid, keys, kids: kids || [] });
          const clone = (n) => ({ id: n.id, keys: n.keys.slice(), kids: n.kids.map(clone) });
          const allKeys = (n) => (n.kids.length ? n.kids.flatMap((c, i) => allKeys(c).concat(i < n.keys.length ? [n.keys[i]] : [])) : n.keys.slice());
          const height = (n) => (n.kids.length ? 1 + height(n.kids[0]) : 1);
          const childIdx = (n, k) => { let i = 0; while (i < n.keys.length && k > n.keys[i]) i++; return i; };

          /** Real B-tree insert (max 3 keys per page). Records a snapshot after each change. */
          function insertInto(r, key) {
            const snaps = [], path = [], stack = [];
            let n = r;
            for (;;) {
              path.push(n.id);
              if (!n.kids.length) break;
              const i = childIdx(n, key);
              stack.push([n, i]);
              n = n.kids[i];
            }
            n.keys.splice(childIdx(n, key), 0, key);
            const over = n.keys.length > MAXK;
            snaps.push({
              tree: clone(r),
              hi: { [n.id]: over ? 'bad' : 'good' },
              cap: over ? `Leaf now has ${n.keys.length} keys, over the limit of ${MAXK}. Split!` : `${key} fits in the leaf. Only one page rewritten.`,
              kind: over ? 'bad' : 'good',
            });
            let cur = n;
            while (cur.keys.length > MAXK) {
              const up = cur.keys[2];
              const right = mk(cur.keys.slice(3), cur.kids.length ? cur.kids.slice(3) : []);
              cur.keys = cur.keys.slice(0, 2);
              if (cur.kids.length) cur.kids = cur.kids.slice(0, 3);
              let parent, grew = false;
              if (stack.length) {
                const [p, pi] = stack.pop();
                p.keys.splice(pi, 0, up);
                p.kids.splice(pi + 1, 0, right);
                parent = p;
              } else {
                parent = mk([up], [cur, right]);
                r = parent;
                grew = true;
              }
              const pOver = parent.keys.length > MAXK;
              snaps.push({
                tree: clone(r),
                hi: { [cur.id]: 'good', [right.id]: 'good', [parent.id]: pOver ? 'bad' : 'primary' },
                cap: grew ? `Root split: ${up} becomes the new root. The tree grows taller.`
                  : pOver ? `Split: ${up} moves up, and now the parent overflows too.`
                    : `Split into two half-full pages. ${up} moves up to the parent.`,
                kind: pOver ? 'bad' : 'good',
              });
              cur = parent;
            }
            return { root: r, snaps, path };
          }

          const PW = (n) => 16 + n.keys.length * 28;
          function layout(t) {
            const pos = new Map();
            let x = 0, depth = 0;
            (function place(n, d) {
              depth = Math.max(depth, d);
              if (!n.kids.length) { const w = PW(n); pos.set(n.id, { x: x + w / 2, w, d, n }); x += w + 12; return; }
              n.kids.forEach((c) => place(c, d + 1));
              const a = pos.get(n.kids[0].id), b = pos.get(n.kids[n.kids.length - 1].id);
              pos.set(n.id, { x: (a.x + b.x) / 2, w: PW(n), d, n });
            })(t, 0);
            const total = x - 12, off = (560 - total) / 2;
            pos.forEach((p) => { p.x += off; p.y = 32 + p.d * 84; });
            return { pos, total, depth: depth + 1 };
          }
          function drawTree(t, hi = {}) {
            st.clear();
            els = new Map();
            const L = layout(t);
            L.pos.forEach((p) => p.n.kids.forEach((c, i) => {
              const q = L.pos.get(c.id);
              st.line(p.x - p.w / 2 + 8 + i * 28, p.y + 17, q.x, q.y - 17, { kind: 'muted', width: 1.5 });
            }));
            L.pos.forEach((p) => {
              const x0 = p.x - p.w / 2;
              els.set(p.n.id, st.rect(x0, p.y - 17, p.w, 34, { kind: hi[p.n.id] || (p.n.kids.length ? 'neutral' : 'data'), rx: 7 }));
              p.n.keys.forEach((key, i) => {
                if (i) st.line(x0 + 8 + i * 28, p.y - 10, x0 + 8 + i * 28, p.y + 10, { kind: 'muted', width: 1 });
                st.text(x0 + 22 + i * 28, p.y + 1, String(key), { size: 14, bold: true, mono: true });
              });
            });
            return L;
          }
          function updStats() {
            sH.set(String(height(root)), 'primary');
            sK.set(String(allKeys(root).length), 'info');
          }

          async function find() {
            v.restart();
            st.clearPackets();
            const keys = allKeys(root);
            let key = pick(keys);
            if (Math.random() < 0.25) {
              const miss = [];
              for (let k = 1; k < 100; k++) if (!keys.includes(k)) miss.push(k);
              key = pick(miss);
            }
            drawTree(root);
            let n = root, d = 0;
            for (;;) {
              d++;
              sPages.set(String(d), 'info');
              els.get(n.id).set({ kind: 'primary' });
              if (n.keys.includes(key)) {
                cap.set(`Find ${key}: it is right here in this page.`, 'info');
                await v.sleep(700);
                els.get(n.id).set({ kind: 'good' });
                cap.set(`Found ${key} after reading ${d} page${d > 1 ? 's' : ''}.`, 'good');
                return;
              }
              if (!n.kids.length) {
                cap.set(`Find ${key}: reached a leaf…`, 'info');
                await v.sleep(700);
                els.get(n.id).set({ kind: 'bad' });
                cap.set(`${key} is not in the tree. ${d} pages read.`, 'warn');
                return;
              }
              const i = childIdx(n, key);
              const why = i === 0 ? `${key} < ${n.keys[0]}` : i === n.keys.length ? `${key} > ${n.keys[i - 1]}` : `${n.keys[i - 1]} < ${key} < ${n.keys[i]}`;
              cap.set(`Find ${key}: ${why}, so follow that pointer down`, 'info');
              await v.sleep(1000);
              n = n.kids[i];
            }
          }

          async function insert() {
            v.restart();
            st.clearPackets();
            const keys = allKeys(root), cand = [];
            for (let k = 1; k < 100; k++) if (!keys.includes(k)) cand.push(k);
            const key = pick(cand);
            const trial = layout(insertInto(clone(root), key).root);
            if (trial.total > 544 || trial.depth > 4) { drawTree(root); cap.set('The demo tree is full. Press Reset to start over.', 'warn'); return; }
            const before = clone(root);
            const res = insertInto(root, key);
            root = res.root;
            updStats();
            drawTree(before);
            for (let d = 0; d < res.path.length; d++) {
              els.get(res.path[d]).set({ kind: 'primary' });
              sPages.set(String(d + 1), 'info');
              cap.set(`Insert ${key}: walk down to the leaf where it belongs`, 'info');
              await v.sleep(650);
            }
            for (const sn of res.snaps) {
              drawTree(sn.tree, sn.hi);
              cap.set(sn.cap, sn.kind);
              await v.sleep(1400);
            }
          }

          function reset() {
            v.restart();
            st.clearPackets();
            nid = 0;
            root = mk([]);
            [10, 20, 30, 40, 50, 60, 70, 80, 15, 55].forEach((k) => { root = insertInto(root, k).root; });
            updStats();
            drawTree(root);
            sPages.set('—', 'info');
            cap.set('Each box is a fixed-size page. Find a key, or insert until a page splits.', 'info');
          }
          reset();
        },
      },

      /* 6 ─────────────────────────────────────────────── */
      {
        title: 'A split rewrites 3 pages. Crash midway?',
        caption: 'A split overwrites several pages. Crash halfway and a page is orphaned. A write-ahead log or copy-on-write keeps it safe; latches stop readers peeking.',
        problem: 'Crash or reader mid-split',
        fix: 'WAL, copy-on-write, latches',
        tags: ['PostgreSQL', 'InnoDB', 'LMDB'],
        demo(el, v) {
          const box = v.wrap(el);
          const mode = v.segmented(box, {
            options: [
              { value: 'none', label: 'Overwrite in place', kind: 'bad' },
              { value: 'wal', label: 'With WAL', kind: 'good' },
              { value: 'cow', label: 'Copy-on-write', kind: 'good' },
            ],
            value: 'none',
            onChange: reset,
          });
          const st = v.stage(box, { w: 560, h: 300 });
          const cap = v.caption(box, '');
          const row = v.row(box);
          const latch = v.toggle(row, {
            label: 'Latches',
            value: false,
            onChange: () => {
              reset();
              cap.set(latch.get() ? 'Latches on: a writer locks the pages it is splitting.' : 'Latches off: readers may see a half-done split.', latch.get() ? 'good' : 'warn');
            },
          });
          v.controls(row, [
            { label: 'Insert 38, crash midway', icon: '✱', kind: 'danger', onClick: crashRun },
            { label: 'Read 40 during a split', icon: '◉', kind: 'primary', onClick: readRun },
          ]);

          const S0 = () => ({ P: [20, 50], B: [30, 35, 40], D: null, linkD: false, orphan: false, hi: {}, wal: null, cow: null, root: 'old', latched: false });
          const pw = (keys) => 30 + keys.length * 30;
          function draw(s) {
            st.clear();
            const m = mode.get();
            st.box(12, 206, 536, 88, {
              label: m === 'cow' ? 'DISK · fresh copies, not live yet' : m === 'wal' ? 'DISK · write-ahead log' : 'DISK · no log',
              kind: m === 'cow' ? 'info' : m === 'wal' ? 'warn' : 'ghost',
              solid: m !== 'none',
            });
            const old = s.root === 'new';
            const page = (key, x, y, keys, o = {}) => st.node({
              x, y, w: pw(keys), h: 40, label: keys.join('  '), mono: true, badge: key,
              kind: s.hi[key] || o.kind || 'data', down: o.down, dim: o.dim,
            });
            const P = page('P', 300, 50, s.P, { kind: 'neutral', dim: old });
            const A = page('A', 110, 144, [5, 12]);
            const B = page('B', 236, 144, s.B, { dim: old });
            const C = page('C', 488, 144, [60, 70]);
            st.link(P, A, { arrow: false });
            st.link(P, B, { arrow: false });
            st.link(P, C, { arrow: false });
            let D = null;
            if (s.D) {
              D = page('D', 368, 144, s.D, { kind: s.orphan ? 'bad' : undefined, down: s.orphan });
              if (s.linkD) st.link(P, D, { arrow: false });
            }
            if (s.orphan) st.text(368, 182, 'orphan: 40 unreachable', { size: 12, kind: 'bad', bold: true, halo: true });
            if (s.latched) {
              st.text(300, 86, 'latched', { size: 12, kind: 'warn', bold: true, halo: true });
              st.text(236, 180, 'latched', { size: 12, kind: 'warn', bold: true, halo: true });
            }
            const R = st.node({ x: 50, y: 50, w: 44, h: 44, shape: 'person', label: 'Reader', kind: 'info' });
            if (m === 'wal' && s.wal) {
              st.rect(28, 234, 384, 34, { kind: s.wal === 'done' ? 'good' : 'warn', label: 'split B: B=[30 35] D=[40] P=[20 38 50]', mono: true, size: 12 });
              st.text(424, 251, s.wal === 'done' ? 'replayed' : 'logged first', { size: 12, anchor: 'start', kind: s.wal === 'done' ? 'good' : 'warn', bold: true });
            }
            let Pn = null;
            if (m === 'cow') {
              const c = s.cow || {}, k = c.garbage ? 'ghost' : 'info';
              let Bn = null, Dn = null;
              if (c.B) Bn = st.node({ x: 300, y: 256, w: pw([30, 35]), h: 36, label: '30  35', mono: true, badge: 'B′', kind: k });
              if (c.D) Dn = st.node({ x: 392, y: 256, w: pw([40]), h: 36, label: '40', mono: true, badge: 'D′', kind: k });
              if (c.P) {
                Pn = st.node({ x: 490, y: 256, w: 96, h: 36, label: '20 38 50', mono: true, badge: 'P′', kind: k });
                if (Bn) st.link(Pn, Bn, { arrow: false, dashed: true, kind: 'info', curve: 30 });
                if (Dn) st.link(Pn, Dn, { arrow: false, dashed: true, kind: 'info' });
              }
              const rootN = st.node({ x: 170, y: 50, w: 70, h: 30, shape: 'pill', label: 'root', kind: 'primary' });
              if (old && Pn) st.link(rootN, Pn, { kind: 'primary', curve: 90 });
              else st.link(rootN, P, { kind: 'primary' });
            }
            return { P, A, B, C, D, R, Pn };
          }

          async function crashRun() {
            v.restart();
            st.clearPackets();
            const m = mode.get();
            const s = S0();
            draw(s);
            if (m === 'cow') {
              cap.set('Copy-on-write: write new pages elsewhere. Old ones stay intact.', 'info');
              await v.sleep(900);
              for (const part of ['B', 'D', 'P']) {
                s.cow = Object.assign({}, s.cow, { [part]: true });
                draw(s);
                await v.sleep(650);
              }
              cap.set('Crash before the root pointer swap!', 'bad');
              await v.sleep(1300);
              s.cow = Object.assign({}, s.cow, { garbage: true });
              draw(s);
              cap.set('Restart: root still points at the old, intact tree. Copies are garbage.', 'good');
              return;
            }
            if (m === 'wal') {
              s.wal = 'pending';
              draw(s);
              cap.set('First, append the whole split to the WAL.', 'warn');
              await v.sleep(1100);
            }
            s.D = [40];
            s.hi = { D: 'good' };
            draw(s);
            cap.set('① Write new page D holding 40', 'info');
            await v.sleep(1000);
            s.B = [30, 35];
            s.hi = { B: 'good' };
            draw(s);
            cap.set('② Overwrite page B: keep 30 and 35', 'info');
            await v.sleep(1000);
            s.hi = { P: 'bad' };
            draw(s);
            cap.set('Crash before step ③ updates parent P!', 'bad');
            await v.sleep(1300);
            if (m === 'none') {
              s.orphan = true;
              s.hi = { B: 'warn' };
              draw(s);
              cap.set('Restart: P never learned about D. Key 40 is lost.', 'bad');
              return;
            }
            s.hi = {};
            draw(s);
            cap.set('Restart: read the WAL and redo the split…', 'warn');
            await v.sleep(1000);
            s.P = [20, 38, 50];
            s.linkD = true;
            s.wal = 'done';
            s.hi = { P: 'good', D: 'good' };
            draw(s);
            cap.set('Step ③ redone from the log. Tree consistent, 40 reachable.', 'good');
          }

          async function readRun() {
            v.restart();
            st.clearPackets();
            const m = mode.get(), L = latch.get();
            const s = S0();
            let refs = draw(s);
            if (m === 'cow') {
              s.cow = { B: true, D: true, P: true };
              refs = draw(s);
              cap.set('New copies are being written. A reader arrives.', 'info');
              await v.sleep(700);
              await st.send(refs.R, refs.P, { label: 'get 40', kind: 'info', dur: 800 });
              await st.send(refs.P, refs.B, { label: '40?', kind: 'info', dur: 700 });
              s.hi = { B: 'good' };
              draw(s);
              cap.set('Reader uses the old, untouched pages: 40 found without waiting.', 'good');
              await v.sleep(1400);
              s.hi = {};
              s.root = 'new';
              draw(s);
              cap.set('Then one atomic pointer swap makes the new version live.', 'good');
              return;
            }
            s.latched = L;
            refs = draw(s);
            cap.set(L ? 'Writer latches P and B, then starts the split.' : 'Writer starts splitting B to insert 38.', 'info');
            await v.sleep(900);
            s.D = [40];
            s.hi = { D: 'good' };
            draw(s);
            await v.sleep(700);
            s.B = [30, 35];
            s.hi = { B: 'good' };
            refs = draw(s);
            cap.set('Mid-split: B is rewritten, P is not. A reader arrives.', 'warn');
            await st.send(refs.R, refs.P, { label: 'get 40', kind: 'info', dur: 800 });
            if (L) {
              cap.set('P is latched by the writer, so the reader waits.', 'warn');
              await v.sleep(1200);
              s.P = [20, 38, 50];
              s.linkD = true;
              s.latched = false;
              s.hi = { P: 'good' };
              refs = draw(s);
              cap.set('Split finished, latches released. The reader continues.', 'info');
              await v.sleep(800);
              await st.send(refs.P, refs.D, { label: '40?', kind: 'info', dur: 700 });
              s.hi = { D: 'good' };
              draw(s);
              cap.set('Found 40 in D. Latches hide half-done splits.', 'good');
            } else {
              await st.send(refs.P, refs.B, { label: '40?', kind: 'info', dur: 700 });
              s.hi = { B: 'bad' };
              draw(s);
              cap.set('B holds only 30 and 35: the reader wrongly says 40 is missing!', 'bad');
              await v.sleep(1400);
              s.P = [20, 38, 50];
              s.linkD = true;
              s.hi = { P: 'warn', D: 'good' };
              draw(s);
              cap.set('A moment later P is fixed. Too late for that reader.', 'warn');
            }
          }

          function reset() {
            v.restart();
            st.clearPackets();
            draw(S0());
            const m = mode.get();
            cap.set(
              m === 'none' ? 'Pages are overwritten in place. Try a crash mid-split.'
                : m === 'wal' ? 'Every change is logged on disk before pages are touched.'
                  : 'Changes go to new pages; a pointer swap makes them live.',
              m === 'none' ? 'bad' : 'good');
          }
          reset();
        },
      },

      /* 7 ─────────────────────────────────────────────── */
      {
        title: 'B-tree vs LSM-tree: pick your trade-off',
        caption: 'LSM-trees write sequentially and compress well, so they absorb more writes. B-trees keep latency predictable, with no compaction spikes.',
        tags: ['RocksDB', 'Cassandra', 'PostgreSQL', 'InnoDB'],
        demo(el, v) {
          const box = v.wrap(el);
          const aspect = v.segmented(box, {
            options: [{ value: 'write', label: 'Write cost' }, { value: 'space', label: 'Disk space' }, { value: 'tail', label: 'Tail latency' }],
            value: 'write',
            onChange: start,
          });
          const st = v.stage(box, { w: 560, h: 270 });
          const bars = v.bars(box, { items: [] });
          const cap = v.caption(box, '');
          const row = v.row(box);
          v.controls(row, [{ label: 'Replay', icon: '▶', kind: 'primary', onClick: start }]);
          const comp = v.toggle(row, {
            label: 'LSM compaction running',
            value: true,
            onChange: () => { if (aspect.get() === 'tail') start(); else cap.set('This switch matters on the Tail latency tab.', 'info'); },
          });

          function halves() {
            st.text(140, 16, 'B-TREE', { size: 14, bold: true, kind: 'primary' });
            st.text(420, 16, 'LSM-TREE', { size: 14, bold: true, kind: 'good' });
            st.line(280, 8, 280, 262, { kind: 'muted', dashed: true, width: 1 });
          }

          async function writeCost() {
            halves();
            const pages = [];
            for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) pages.push(st.rect(24 + c * 62, 36 + r * 44, 52, 34, { kind: 'neutral', label: '4 KB', size: 12 }));
            st.box(300, 30, 240, 58, { label: 'memtable · RAM', kind: 'primary', solid: true });
            st.text(300, 104, 'sequential files', { size: 12, anchor: 'start', kind: 'muted' });
            st.text(24, 188, 'WAL', { size: 12, anchor: 'start', kind: 'text2', bold: true });
            st.text(300, 188, 'WAL', { size: 12, anchor: 'start', kind: 'text2', bold: true });
            const bT = st.text(140, 238, 'random page writes: 0', { size: 13, kind: 'bad', bold: true });
            st.text(140, 256, 'each rewrites a whole 4 KB page', { size: 12, kind: 'muted' });
            st.text(420, 238, 'random page writes: 0', { size: 13, kind: 'good', bold: true });
            st.text(420, 256, 'deeper levels rewrite again', { size: 12, kind: 'muted' });
            let bB = 0, lB = 0, seeks = 0;
            const upd = () => bars.update([
              { label: 'B-tree bytes', value: bB, kind: 'primary', text: kb(bB) },
              { label: 'LSM bytes', value: lB, kind: 'good', text: kb(lB) },
            ], Math.max(1000, bB, lB));
            upd();
            cap.set('Eight small writes of 100 bytes each…', 'info');
            let memCells = [];
            for (let w = 0; w < 8; w++) {
              const p = Math.floor(Math.random() * 12);
              st.rect(24 + w * 28, 200, 24, 22, { kind: 'warn' });
              pages[p].set({ kind: 'warn' });
              bB += 100 + 4096;
              seeks++;
              bT.set(`random page writes: ${seeks}`, 'bad');
              st.rect(300 + w * 28, 200, 24, 22, { kind: 'warn' });
              memCells.push(st.rect(312 + (w % 4) * 56, 52, 50, 26, { kind: 'primary', label: 'k' + (w + 1), size: 12 }));
              lB += 100;
              upd();
              await v.sleep(550);
              pages[p].set({ kind: 'neutral' });
              if (w % 4 === 3) {
                memCells.forEach((c) => c.remove());
                memCells = [];
                st.rect(300 + Math.floor(w / 4) * 110, 114, 100, 30, { kind: 'data', label: 'SST ' + (Math.floor(w / 4) + 1), size: 12 });
                lB += 400;
                upd();
                cap.set('LSM: memtable full, flushed as one sequential file.', 'good');
                await v.sleep(650);
              }
            }
            cap.set('Compaction merges both files: another sequential rewrite.', 'info');
            st.rect(300, 154, 210, 30, { kind: 'good', label: 'merged SST', size: 12 });
            lB += 800;
            upd();
            await v.sleep(800);
            cap.set(`B-tree wrote ${kb(bB)}, mostly random. LSM wrote ${kb(lB)}, all sequential.`, 'good');
          }

          async function space() {
            halves();
            const fills = [0.55, 0.9, 0.5, 0.7, 0.62, 1, 0.5, 0.66, 0.8, 0.52, 0.75, 0.58];
            const fillRects = [];
            fills.forEach((f, i) => {
              const x = 24 + (i % 4) * 62, y = 36 + Math.floor(i / 4) * 58;
              st.rect(x, y, 52, 46, { kind: 'ghost' });
              fillRects.push({ r: st.rect(x, y + 46, 52, 0, { kind: 'data', rx: 3 }), x, y, f });
            });
            st.text(140, 226, 'dashed = free space stuck in pages', { size: 12, kind: 'muted' });
            let lsm = 45;
            const upd = () => bars.update([
              { label: 'B-tree on disk', value: 48, kind: 'primary', text: '48 KB' },
              { label: 'LSM on disk', value: lsm, kind: 'good', text: lsm + ' KB' },
            ], 50);
            upd();
            cap.set('The same 33 KB of data in both engines…', 'info');
            await v.tween(900, (t) => fillRects.forEach((o) => o.r.set({ y: o.y + 46 - 46 * o.f * t, h: 46 * o.f * t })));
            const stale = [1, 4, 7, 9, 12];
            const cellsL = [];
            for (let r = 0; r < 3; r++) {
              for (let c = 0; c < 5; c++) {
                const i = r * 5 + c;
                cellsL.push(st.rect(300 + c * 48, 36 + r * 40, 42, 30, { kind: stale.includes(i) ? 'bad' : 'data', label: stale.includes(i) ? 'old' : '', size: 12 }));
              }
            }
            cap.set('B-tree pages sit part-empty after splits. LSM holds stale copies…', 'warn');
            await v.sleep(1400);
            cellsL.forEach((c) => c.remove());
            for (let c = 0; c < 10; c++) st.rect(300 + (c % 5) * 48, 170 + Math.floor(c / 5) * 34, 42, 28, { kind: 'data' });
            lsm = 33;
            upd();
            cap.set('…until compaction packs only live data into new files.', 'info');
            await v.sleep(1300);
            st.rect(300, 170, 234, 62, { kind: 'good', label: 'compressed blocks', size: 13 }).set({ opacity: 0.9 });
            lsm = 20;
            upd();
            cap.set('Sorted blocks compress well: LSM ends up much smaller.', 'good');
          }

          const data = { b: [], l: [] };
          let tick = 0, compacting = false;
          const pct = (a, p) => {
            if (!a.length) return 0;
            const s = a.slice().sort((x, y) => x - y);
            return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
          };
          function drawTail() {
            st.clear();
            [['B-TREE', 'b', 16, 'primary'], ['LSM-TREE', 'l', 144, 'good']].forEach(([name, k, y0, kind]) => {
              const base = y0 + 100;
              st.text(12, y0 + 2, name + (k === 'l' && compacting ? ' · compacting now' : ''), { size: 13, anchor: 'start', bold: true, kind: k === 'l' && compacting ? 'warn' : kind });
              if (k === 'l' && compacting) st.rect(40, y0 + 12, 512, 88, { kind: 'warn', rx: 6 }).set({ opacity: 0.35 });
              st.line(40, base, 552, base, { width: 1 });
              data[k].forEach((ms, i) => {
                const h = Math.max(1, Math.min(84, ms * 3.3));
                st.rect(44 + i * 10.5, base - h, 8, h, { kind: ms > 10 ? 'bad' : kind, rx: 1.5, strokeWidth: 0.6 });
              });
              if (data[k].length) {
                const q = pct(data[k], 99), y = base - Math.min(84, q * 3.3);
                st.line(40, y, 552, y, { kind: 'bad', dashed: true, width: 1.4, layer: 'top' });
                st.text(550, Math.max(y0 + 22, y - 9), `p99 ${q.toFixed(1)} ms`, { size: 12, anchor: 'end', kind: 'bad', bold: true, halo: true });
              }
            });
            const f = (x) => x.toFixed(1) + ' ms';
            bars.update([
              { label: 'B-tree p50', value: pct(data.b, 50), kind: 'primary', text: f(pct(data.b, 50)) },
              { label: 'B-tree p99', value: pct(data.b, 99), kind: 'primary', text: f(pct(data.b, 99)) },
              { label: 'LSM p50', value: pct(data.l, 50), kind: 'good', text: f(pct(data.l, 50)) },
              { label: 'LSM p99', value: pct(data.l, 99), kind: pct(data.l, 99) > 10 ? 'bad' : 'good', text: f(pct(data.l, 99)) },
            ], 25);
          }
          v.every(260, () => {
            if (aspect.get() !== 'tail') return;
            tick++;
            compacting = comp.get() && tick % 36 >= 22;
            data.b.push(3 + Math.random() * 2.5 + (Math.random() < 0.03 ? 3 : 0));
            data.l.push(compacting && Math.random() < 0.55 ? 12 + Math.random() * 12 : 1.4 + Math.random() * 1.6);
            ['b', 'l'].forEach((k) => { if (data[k].length > 48) data[k].shift(); });
            drawTail();
          });

          function start() {
            v.restart();
            st.clearPackets();
            st.clear();
            const a = aspect.get();
            if (a === 'tail') {
              data.b = [];
              data.l = [];
              tick = 0;
              compacting = false;
              drawTail();
              cap.set(comp.get() ? 'LSM is usually faster, until compaction steals disk time.' : 'Compaction paused: LSM is smooth, but files pile up.', comp.get() ? 'warn' : 'info');
              return;
            }
            if (a === 'write') writeCost();
            else space();
          }
          start();
        },
      },

      /* 8 ─────────────────────────────────────────────── */
      {
        title: 'Where rows live, and fancier indexes',
        caption: 'Indexes point to rows in a heap file, hold the rows (clustered) or copy a few columns (covering). 2-D and fuzzy indexes go further.',
        tags: ['InnoDB', 'SQL Server', 'PostGIS', 'Lucene'],
        demo(el, v) {
          const box = v.wrap(el);
          const mode = v.segmented(box, {
            options: [
              { value: 'heap', label: 'Heap file' },
              { value: 'clustered', label: 'Clustered' },
              { value: 'covering', label: 'Covering' },
              { value: '2d', label: '2-D' },
              { value: 'fuzzy', label: 'Fuzzy' },
            ],
            value: 'heap',
            onChange: reset,
          });
          const st = v.stage(box, { w: 560, h: 290 });
          const stats = v.row(box, { center: true });
          const s1 = v.stat(stats, 'reads', '—', 'info');
          const s2 = v.stat(stats, 'reads', '—', 'info');
          const cap = v.caption(box, '');
          v.controls(box, [{ label: 'Run query', icon: '▶', kind: 'primary', onClick: runQ }]);

          /* --- heap / clustered / covering --- */
          const USERS = [
            { id: 1, n: 'Ana', c: 'Oslo' }, { id: 2, n: 'Bo', c: 'Rome' }, { id: 3, n: 'Cy', c: 'Oslo' },
            { id: 4, n: 'Di', c: 'Lima' }, { id: 5, n: 'Ed', c: 'Rome' }, { id: 6, n: 'Flo', c: 'Kyiv' },
          ];
          const SLOTS = [4, 1, 6, 2, 5, 3];
          const slotOf = (id) => SLOTS.indexOf(id);
          const byCity = USERS.slice().sort((a, b) => (a.c < b.c ? -1 : a.c > b.c ? 1 : a.id - b.id));
          const ey = (i) => 58 + i * 34;
          let E = {};
          const ent = (x, y, w, label, kind) => ({ r: st.rect(x, y, w, 28, { kind, label, mono: true, size: 12 }), l: x, rt: x + w, y: y + 14 });
          function drawRows() {
            st.clear();
            E = { pk: {}, city: {}, heap: {} };
            const m = mode.get();
            if (m === 'clustered') {
              st.box(12, 26, 226, 254, { label: 'CLUSTERED INDEX · id', kind: 'primary', solid: true });
              USERS.forEach((u, i) => { E.pk[u.id] = ent(24, ey(i), 202, `${u.id} · ${u.n} · ${u.c}`, 'data'); });
              st.box(250, 26, 160, 254, { label: 'INDEX · city', kind: 'info', solid: true });
              byCity.forEach((u, i) => { E.city[u.id] = ent(262, ey(i), 136, `${u.c} → id ${u.id}`, 'info'); });
              st.box(422, 26, 126, 254, { label: 'NO HEAP FILE', kind: 'ghost' });
              st.text(485, 150, 'rows live', { size: 12, kind: 'muted' });
              st.text(485, 168, 'in the index', { size: 12, kind: 'muted' });
              return;
            }
            const cov = m === 'covering';
            st.box(12, 26, 128, 254, { label: 'INDEX · id', kind: 'primary', solid: true });
            USERS.forEach((u, i) => { E.pk[u.id] = ent(22, ey(i), 108, `${u.id} → @${slotOf(u.id)}`, 'primary'); });
            st.box(152, 26, 204, 254, { label: 'HEAP FILE · any order', kind: 'data', solid: true });
            SLOTS.forEach((id, s) => { const u = USERS[id - 1]; E.heap[id] = ent(162, ey(s), 184, `@${s}  ${u.id} · ${u.n} · ${u.c}`, 'data'); });
            st.box(368, 26, 180, 254, { label: cov ? 'INDEX · city + name' : 'INDEX · city', kind: 'info', solid: true });
            byCity.forEach((u, i) => { E.city[u.id] = ent(378, ey(i), 160, cov ? `${u.c} ${u.n} → @${slotOf(u.id)}` : `${u.c} → @${slotOf(u.id)}`, 'info'); });
          }
          const arrow = (x1, y1, x2, y2) => st.line(x1, y1, x2, y2, { kind: 'good', arrow: true, width: 2, layer: 'top' });
          async function runRows() {
            const m = mode.get();
            statLabel(s1, 'reads: id = 4');
            statLabel(s2, 'reads: city = Oslo');
            drawRows();
            s1.set('…', 'info');
            s2.set('—', 'info');
            cap.set('Query 1: SELECT * WHERE id = 4', 'info');
            E.pk[4].r.set({ kind: 'warn' });
            await v.sleep(900);
            if (m === 'clustered') {
              E.pk[4].r.set({ kind: 'good' });
              s1.set('1', 'good');
              cap.set('The row sits right inside the index: 1 read.', 'good');
            } else {
              arrow(E.pk[4].rt + 2, E.pk[4].y, E.heap[4].l - 2, E.heap[4].y);
              E.heap[4].r.set({ kind: 'good' });
              s1.set('2', 'warn');
              cap.set('The index gives a heap offset, then one more hop: 2 reads.', 'info');
            }
            await v.sleep(1600);
            drawRows();
            cap.set("Query 2: SELECT name WHERE city = 'Oslo'", 'info');
            const oslo = byCity.filter((u) => u.c === 'Oslo');
            oslo.forEach((u) => E.city[u.id].r.set({ kind: 'warn' }));
            await v.sleep(900);
            if (m === 'covering') {
              oslo.forEach((u) => E.city[u.id].r.set({ kind: 'good' }));
              s2.set('1', 'good');
              cap.set('Names are copied into the index: no hop. Writes must update both.', 'good');
              return;
            }
            for (const u of oslo) {
              const a = E.city[u.id];
              if (m === 'clustered') { const b = E.pk[u.id]; arrow(a.l - 2, a.y, b.rt + 2, b.y); b.r.set({ kind: 'good' }); }
              else { const b = E.heap[u.id]; arrow(a.l - 2, a.y, b.rt + 2, b.y); b.r.set({ kind: 'good' }); }
              await v.sleep(600);
            }
            s2.set(String(1 + oslo.length), 'warn');
            cap.set(m === 'clustered' ? 'City index yields primary keys; each one is looked up again.' : 'Each match needs its own hop into the heap file.', 'info');
          }

          /* --- 2-D --- */
          const R2 = rng(11);
          const PTS = Array.from({ length: 30 }, () => ({ x: 44 + R2() * 480, y: 44 + R2() * 214 }));
          const QS = [{ x: 236, y: 112, w: 124, h: 70 }, { x: 70, y: 56, w: 120, h: 80 }, { x: 380, y: 176, w: 140, h: 70 }];
          let q2 = 0, dots = [];
          const groups = [];
          for (let gx = 0; gx < 3; gx++) {
            for (let gy = 0; gy < 2; gy++) {
              const inG = PTS.filter((p) => Math.min(2, Math.floor((p.x - 40) / 164)) === gx && Math.min(1, Math.floor((p.y - 40) / 110)) === gy);
              if (!inG.length) continue;
              const xs = inG.map((p) => p.x), ys = inG.map((p) => p.y);
              groups.push({ pts: inG, x0: Math.min(...xs) - 9, y0: Math.min(...ys) - 9, x1: Math.max(...xs) + 9, y1: Math.max(...ys) + 9 });
            }
          }
          const inQ = (p, q) => p.x >= q.x && p.x <= q.x + q.w && p.y >= q.y && p.y <= q.y + q.h;
          const overlap = (g, q) => g.x0 <= q.x + q.w && g.x1 >= q.x && g.y0 <= q.y + q.h && g.y1 >= q.y;
          function drawMap(q) {
            st.clear();
            st.rect(20, 28, 530, 246, { kind: 'neutral', rx: 10 }).set({ opacity: 0.5 });
            st.text(28, 16, 'lat ↑', { size: 12, anchor: 'start', kind: 'muted', bold: true });
            st.text(548, 286, 'lon →', { size: 12, anchor: 'end', kind: 'muted', bold: true });
            if (q) st.box(q.x, q.y, q.w, q.h, { kind: 'good', solid: true, rx: 6 });
            dots = PTS.map((p) => st.add('circle', { cx: p.x, cy: p.y, r: 5.5, class: 'vz-shape k-data', 'stroke-width': 1.5 }));
          }
          const paintDot = (i, k) => dots[i].setAttribute('class', 'vz-shape k-' + k);
          async function run2d() {
            const q = QS[q2++ % QS.length];
            statLabel(s1, 'checked: (lat, lon) index');
            statLabel(s2, 'checked: 2-D index');
            s1.set('…', 'info');
            s2.set('—', 'info');
            drawMap(q);
            const found = PTS.filter((p) => inQ(p, q)).length;
            cap.set('Find restaurants inside the box: a lat range AND a lon range.', 'info');
            await v.sleep(900);
            st.rect(20, q.y, 530, q.h, { kind: 'warn', rx: 0 }).set({ opacity: 0.35 });
            let band = 0;
            PTS.forEach((p, i) => { if (p.y >= q.y && p.y <= q.y + q.h) { band++; paintDot(i, inQ(p, q) ? 'good' : 'warn'); } });
            s1.set(String(band), 'warn');
            cap.set(`A (lat, lon) index narrows latitude only: ${band} checked in the band.`, 'warn');
            await v.sleep(1800);
            drawMap(q);
            let checked = 0;
            groups.forEach((g) => {
              const hit = overlap(g, q);
              st.box(g.x0, g.y0, g.x1 - g.x0, g.y1 - g.y0, { kind: hit ? 'primary' : 'info', solid: hit, rx: 8 });
              if (hit) g.pts.forEach((p) => { checked++; paintDot(PTS.indexOf(p), inQ(p, q) ? 'good' : 'info'); });
            });
            s2.set(String(checked), 'good');
            cap.set(`An R-tree skips far-away boxes: ${checked} checked, ${found} found.`, 'good');
          }

          /* --- fuzzy --- */
          const TERMS = ['hammock', 'handbag', 'handful', 'handoff', 'handsome', 'hangar', 'hanger', 'hangout', 'harbor', 'harness'];
          const FQ = ['hanbag', 'hangr', 'handsom'];
          let fq = 0;
          const tPos = (i) => ({ x: i < 5 ? 40 : 300, y: 46 + (i % 5) * 44 });
          function drawTerms(q, d) {
            st.clear();
            st.text(280, 18, `search: "${q}"`, { size: 15, bold: true, mono: true, kind: 'accent' });
            TERMS.forEach((t, i) => {
              const p = tPos(i), dd = d ? d[i] : null;
              st.rect(p.x, p.y, 170, 34, { kind: dd == null ? 'data' : dd <= 1 ? 'good' : 'neutral', label: t, mono: true, size: 14 });
              if (dd != null) st.text(p.x + 182, p.y + 17, 'edits ' + dd, { size: 12, anchor: 'start', kind: dd <= 1 ? 'good' : 'muted', bold: dd <= 1 });
            });
            st.text(280, 280, 'sorted term dictionary', { size: 12, kind: 'muted' });
          }
          async function runFuzzy() {
            const q = FQ[fq++ % FQ.length];
            statLabel(s1, 'exact matches');
            statLabel(s2, 'within 1 edit');
            s2.set('—', 'info');
            drawTerms(q);
            const p = TERMS.filter((t) => t < q).length, at = tPos(Math.min(p, 9));
            const y = p === 10 ? at.y + 39 : at.y - 5;
            st.line(at.x - 6, y, at.x + 176, y, { kind: 'bad', width: 3, layer: 'top' });
            s1.set('0', 'bad');
            cap.set(`Exact lookup: "${q}" would sit at the red line. Not there.`, 'bad');
            await v.sleep(1500);
            const d = TERMS.map((t) => lev(q, t));
            drawTerms(q, d);
            const hits = TERMS.filter((_, i) => d[i] <= 1);
            s2.set(String(hits.length), 'good');
            cap.set(`Fuzzy: ${hits.join(' and ')} ${hits.length > 1 ? 'are' : 'is'} one edit away. Lucene does this.`, 'good');
          }

          function runQ() {
            v.restart();
            st.clearPackets();
            const m = mode.get();
            if (m === '2d') run2d();
            else if (m === 'fuzzy') runFuzzy();
            else runRows();
          }
          function reset() {
            v.restart();
            st.clearPackets();
            const m = mode.get();
            s1.set('—', 'info');
            s2.set('—', 'info');
            if (m === '2d') {
              statLabel(s1, 'checked: (lat, lon) index');
              statLabel(s2, 'checked: 2-D index');
              drawMap(QS[q2 % QS.length]);
              cap.set('Map search needs a latitude AND a longitude range at once.', 'info');
            } else if (m === 'fuzzy') {
              statLabel(s1, 'exact matches');
              statLabel(s2, 'within 1 edit');
              drawTerms(FQ[fq % FQ.length]);
              cap.set('Exact indexes fail on typos. Fuzzy ones allow small edits.', 'info');
            } else {
              statLabel(s1, 'reads: id = 4');
              statLabel(s2, 'reads: city = Oslo');
              drawRows();
              cap.set(
                m === 'heap' ? 'Rows live in a heap file; every index stores pointers to them.'
                  : m === 'clustered' ? 'Clustered: the row itself lives inside the primary-key index.'
                    : 'Covering: the index also copies the columns a query needs.',
                'info');
            }
          }
          reset();
        },
      },

      /* 9 ─────────────────────────────────────────────── */
      {
        title: 'In-memory databases: fast, but why?',
        caption: 'A warm cache means disk engines rarely read disk either. In-memory engines win by skipping disk-format encoding; logs or replicas keep them durable.',
        problem: 'A power cut wipes RAM',
        fix: 'Log + snapshots on disk',
        tags: ['Redis', 'VoltDB', 'MemSQL', 'Memcached'],
        demo(el, v) {
          const box = v.wrap(el);
          const mode = v.segmented(box, {
            options: [{ value: 'disk', label: 'Disk engine, warm cache' }, { value: 'mem', label: 'In-memory engine' }],
            value: 'disk',
            onChange: reset,
          });
          const st = v.stage(box, { w: 560, h: 270 });
          const stats = v.row(box, { center: true });
          const sDisk = v.stat(stats, 'disk reads', '—', 'info');
          const sWork = v.stat(stats, 'CPU steps per read', '—', 'info');
          const cap = v.caption(box, '');
          const row = v.row(box);
          const dur = v.toggle(row, { label: 'Log + snapshots', value: false, onChange: reset });
          v.controls(row, [
            { label: 'Read', icon: '◉', kind: 'primary', onClick: read },
            { label: 'Power cut', icon: '✱', kind: 'danger', onClick: power },
          ]);
          let cold = false, wiped = false;

          function draw(o = {}) {
            st.clear();
            const m = mode.get(), dn = !!o.down;
            st.box(96, 12, 300, 248, { label: 'RAM', kind: 'primary', solid: true });
            st.box(412, 12, 136, 248, { label: 'DISK', kind: 'data', solid: true });
            const N = { user: st.node({ x: 44, y: 136, w: 48, h: 48, shape: 'person', label: 'Client', kind: 'info' }) };
            if (m === 'disk') {
              N.cache = st.node({ x: 176, y: 72, w: 128, h: 54, label: 'Page cache', sub: cold ? 'cold: empty' : 'disk-format bytes', kind: dn || cold ? 'ghost' : 'warn', down: dn });
              N.dec = st.node({ x: 322, y: 72, w: 116, h: 54, label: 'Decode', sub: 'bytes → row', kind: dn ? 'ghost' : 'warn', down: dn });
              N.obj = st.node({ x: 250, y: 200, w: 150, h: 54, label: 'Row object', sub: 'usable by code', kind: dn ? 'ghost' : 'good', down: dn });
              N.wal = st.node({ x: 480, y: 72, w: 104, h: 58, shape: 'db', label: 'WAL', kind: 'data' });
              N.pages = st.node({ x: 480, y: 200, w: 104, h: 58, shape: 'db', label: 'Data pages', kind: 'data' });
              st.link(N.cache, N.dec, { thin: true });
              st.link(N.dec, N.obj, { thin: true });
              st.link(N.pages, N.cache, { dashed: true, thin: true, label: 'load once' });
            } else {
              N.mem = st.node({ x: 246, y: 120, w: 176, h: 66, label: 'Hash map / tree', sub: wiped ? 'empty' : 'native objects', kind: dn || wiped ? 'ghost' : 'good', down: dn });
              if (dur.get()) {
                N.log = st.node({ x: 480, y: 72, w: 104, h: 58, shape: 'db', label: 'Log', sub: 'append-only', kind: 'data' });
                N.snap = st.node({ x: 480, y: 200, w: 104, h: 58, shape: 'db', label: 'Snapshot', kind: 'data' });
                st.link(N.mem, N.log, { dashed: true, thin: true, label: 'append' });
              } else {
                st.text(480, 130, 'no copy', { size: 13, kind: 'muted', bold: true });
                st.text(480, 150, 'on disk', { size: 13, kind: 'muted', bold: true });
              }
            }
            return N;
          }

          async function read() {
            v.restart();
            st.clearPackets();
            const m = mode.get();
            let N = draw();
            if (m === 'disk') {
              let reads = 0;
              await st.send(N.user, N.cache, { label: 'get', kind: 'info', dur: 700 });
              if (cold) {
                cap.set('Cache is cold: fetch the page from disk once.', 'warn');
                await st.send(N.pages, N.cache, { label: 'page', kind: 'data', dur: 800 });
                reads = 1;
                cold = false;
                N = draw();
              }
              sDisk.set(String(reads), reads ? 'warn' : 'good');
              cap.set(reads ? 'Now cached. Still, the bytes must be decoded…' : 'Cache hit: zero disk reads. But the bytes must be decoded…', 'warn');
              await st.send(N.cache, N.dec, { label: 'bytes', kind: 'warn', dur: 700 });
              await st.send(N.dec, N.obj, { label: 'row', kind: 'warn', dur: 700 });
              await st.send(N.obj, N.user, { label: 'value', kind: 'good', dur: 700 });
              sWork.set('3', 'warn');
              cap.set('Find page, decode bytes, build a row: overhead on every read.', 'warn');
              return;
            }
            await st.send(N.user, N.mem, { label: 'get', kind: 'info', dur: 700 });
            sDisk.set('0', 'good');
            if (wiped) { N.mem.set({ kind: 'bad' }); sWork.set('1', 'bad'); cap.set('Nothing there: the data died with the power. Fine for a cache.', 'bad'); return; }
            await st.send(N.mem, N.user, { label: 'value', kind: 'good', dur: 700 });
            sWork.set('1', 'good');
            cap.set('Follow a pointer to a native object. Nothing to decode.', 'good');
          }

          async function power() {
            v.restart();
            st.clearPackets();
            const m = mode.get();
            draw({ down: true });
            cap.set('Power cut! Everything in RAM is gone…', 'bad');
            await v.sleep(1300);
            if (m === 'disk') {
              cold = true;
              draw();
              cap.set('Data is safe on disk. The cache just starts cold.', 'good');
              return;
            }
            if (!dur.get()) {
              wiped = true;
              draw();
              cap.set('No copy on disk: all data lost. Turn on log + snapshots.', 'bad');
              return;
            }
            wiped = true;
            const N = draw();
            cap.set('Restart: load the snapshot, then replay the log…', 'warn');
            await st.send(N.snap, N.mem, { label: 'snapshot', kind: 'data', dur: 900 });
            await st.send(N.log, N.mem, { label: 'replay', kind: 'data', dur: 900 });
            wiped = false;
            draw();
            cap.set('State rebuilt from disk. Reads still never touch it.', 'good');
          }

          function reset() {
            v.restart();
            st.clearPackets();
            cold = false;
            wiped = false;
            draw();
            sDisk.set('—', 'info');
            sWork.set('—', 'info');
            const m = mode.get();
            cap.set(
              m === 'disk' ? 'Hot pages are already cached in RAM by the OS.'
                : dur.get() ? 'Data lives in RAM; disk only gets a log and snapshots.' : 'Data lives only in RAM. Try a power cut.',
              m === 'mem' && !dur.get() ? 'warn' : 'info');
          }
          reset();
        },
      },

      /* 10 ─────────────────────────────────────────────── */
      {
        title: 'OLTP vs analytics: different access patterns',
        caption: 'Apps read and write a few rows by key. Analysts scan millions to aggregate. So analytics moves to a warehouse, fed by ETL.',
        problem: 'Big scans slow down customers',
        fix: 'Separate warehouse, loaded by ETL',
        tags: ['Teradata', 'Redshift', 'Hive', 'Presto'],
        demo(el, v) {
          const box = v.wrap(el);
          const mode = v.segmented(box, {
            options: [{ value: 'same', label: 'One shared database', kind: 'bad' }, { value: 'wh', label: 'Separate warehouse', kind: 'good' }],
            value: 'same',
            onChange: () => { v.restart(); st.clearPackets(); paint(); },
          });
          const st = v.stage(box, { w: 560, h: 300 });
          const stats = v.row(box, { center: true });
          const sCust = v.stat(stats, 'customer wait', '—', 'good');
          const sRows = v.stat(stats, 'rows per customer query', '1', 'good');
          const sRep = v.stat(stats, 'rows per report', '—', 'info');
          const cap = v.caption(box, '');
          v.controls(box, [
            { label: 'Analyst report', icon: '↗', kind: 'primary', onClick: report },
            { label: 'Run ETL', icon: '⇄', onClick: etl },
          ]);
          void sRows;

          const cust = st.node({ x: 44, y: 70, w: 48, h: 48, shape: 'person', label: 'Customer', kind: 'info' });
          const oltp = st.node({ x: 150, y: 70, w: 104, h: 64, shape: 'db', label: 'Orders DB', sub: 'OLTP', kind: 'good' });
          const analyst = st.node({ x: 44, y: 232, w: 48, h: 48, shape: 'person', label: 'Analyst', kind: 'primary' });
          const wh = st.node({ x: 150, y: 232, w: 104, h: 64, shape: 'db', label: 'Warehouse', sub: 'OLAP', kind: 'primary' });
          const grid = (x0, y0) => {
            const cells = [];
            for (let r = 0; r < 5; r++) for (let c = 0; c < 10; c++) cells.push(st.rect(x0 + c * 19, y0 + r * 17, 16, 14, { kind: 'neutral', rx: 2 }));
            return cells;
          };
          st.text(317, 16, 'orders table', { size: 12, kind: 'muted', bold: true });
          const tW = st.text(317, 178, 'sales history', { size: 12, kind: 'muted', bold: true });
          const gO = grid(222, 28), gW = grid(222, 190);
          const E = st.node({ x: 494, y: 60, w: 100, h: 34, shape: 'pill', label: 'Extract', kind: 'warn' });
          const T = st.node({ x: 494, y: 150, w: 100, h: 34, shape: 'pill', label: 'Transform', kind: 'warn' });
          const Lo = st.node({ x: 494, y: 240, w: 100, h: 34, shape: 'pill', label: 'Load', kind: 'warn' });
          const oEdge = { x: 414, y: 70 }, wEdge = { x: 414, y: 232 };
          const etlLinks = [st.link(oEdge, E, { dashed: true }), st.link(E, T, { dashed: true }), st.link(T, Lo, { dashed: true }), st.link(Lo, wEdge, { dashed: true })];
          st.link(cust, oltp, { both: true, thin: true });
          const aSame = st.link(analyst, oltp, { kind: 'bad', dashed: true, curve: 50 });
          const aWh = st.link(analyst, wh, { thin: true });
          const kinds = { o: gO.map(() => 'neutral'), w: gW.map(() => 'neutral') };
          const setCell = (g, i, k) => { kinds[g][i] = k; (g === 'o' ? gO : gW)[i].set({ kind: k }); };
          const clearGrid = (g) => kinds[g].forEach((_, i) => setCell(g, i, 'neutral'));

          function paint() {
            const same = mode.get() === 'same';
            [wh, E, T, Lo].forEach((n) => n.dim(same));
            gW.forEach((c) => c.set({ opacity: same ? 0.25 : 1 }));
            tW.show(!same);
            etlLinks.forEach((l) => l.show(!same));
            aSame.show(same);
            aWh.show(!same);
            clearGrid('o');
            clearGrid('w');
            sRep.set('—', 'info');
            cap.set(same ? 'Customers touch 1 row by key. Reports scan every row, here.' : 'Analysts get their own copy, refreshed by ETL.', same ? 'warn' : 'good');
          }

          let custGen = -1, scanGen = -1, scanSame = false;
          async function custTick() {
            if (custGen === v.gen) return;
            custGen = v.gen;
            const slow = scanGen === v.gen && scanSame;
            const i = Math.floor(Math.random() * gO.length), was = kinds.o[i];
            await st.send(cust, oltp, { label: 'order', kind: 'info', dur: slow ? 1400 : 450 });
            gO[i].set({ kind: 'good' });
            await st.send(oltp, cust, { label: 'ok', kind: slow ? 'bad' : 'good', dur: slow ? 900 : 350 });
            gO[i].set({ kind: kinds.o[i] === was ? was : kinds.o[i] });
            sCust.set(slow ? '850 ms' : '12 ms', slow ? 'bad' : 'good');
            custGen = -1;
          }
          v.every(1700, custTick);

          async function report() {
            v.restart();
            st.clearPackets();
            const same = mode.get() === 'same';
            const db = same ? oltp : wh, g = same ? 'o' : 'w';
            clearGrid('o');
            clearGrid('w');
            cap.set(same ? 'Analyst runs a big SUM on the live orders database…' : 'Analyst queries the warehouse copy…', same ? 'warn' : 'info');
            await st.send(analyst, db, { label: 'SUM(…)', kind: 'primary', dur: 700, curve: same ? 50 : 0 });
            scanGen = v.gen;
            scanSame = same;
            for (let r = 0; r < 5; r++) {
              for (let c = 0; c < 10; c++) setCell(g, r * 10 + c, 'warn');
              sRep.set(`${(r + 1) * 2}M`, 'warn');
              await v.sleep(700);
            }
            scanGen = -1;
            await st.send(db, analyst, { label: 'report', kind: 'good', dur: 700, curve: same ? -50 : 0 });
            clearGrid(g);
            cap.set(same ? 'Report done, but customers waited during the whole scan.' : 'Report done. Customers never noticed a thing.', same ? 'bad' : 'good');
          }

          async function etl() {
            v.restart();
            st.clearPackets();
            if (mode.get() === 'same') { mode.set('wh'); paint(); }
            clearGrid('w');
            cap.set('Extract: copy new rows out of the OLTP database…', 'warn');
            await st.send(oEdge, E, { label: 'rows', kind: 'data', dur: 700 });
            cap.set('Transform: clean up and reshape for analysis…', 'warn');
            await st.send(E, T, { label: 'clean', kind: 'data', dur: 700 });
            await st.send(T, Lo, { label: 'reshape', kind: 'data', dur: 700 });
            cap.set('Load: bulk-insert into the warehouse.', 'warn');
            await st.send(Lo, wEdge, { label: 'bulk', kind: 'data', dur: 700 });
            for (let c = 0; c < 10; c++) setCell('w', 40 + c, 'good');
            cap.set('Warehouse refreshed: a read-only copy, safe to scan.', 'good');
          }
          paint();
        },
      },

      /* 11 ─────────────────────────────────────────────── */
      {
        title: 'Star schema: facts in the middle',
        caption: 'Each fact row is one event with keys into dimension tables: who, what, where, when. Snowflakes split dimensions further; cubes pre-sum facts.',
        demo(el, v) {
          const box = v.wrap(el);
          const mode = v.segmented(box, {
            options: [{ value: 'star', label: 'Star' }, { value: 'snow', label: 'Snowflake' }, { value: 'cube', label: 'Data cube' }],
            value: 'star',
            onChange: reset,
          });
          const st = v.stage(box, { w: 560, h: 300 });
          const stats = v.row(box, { center: true });
          const sA = v.stat(stats, 'joins per query', '—', 'info');
          const cap = v.caption(box, '');
          v.controls(box, [{ label: 'Run query', icon: '▶', kind: 'primary', onClick: run }]);

          let N = {};
          function drawSchema() {
            st.clear();
            N = {};
            const snow = mode.get() === 'snow';
            N.fact = st.node({ x: 280, y: 150, w: 156, h: 70, label: 'fact_sales', sub: 'one row per sale', kind: 'primary', badge: 'billions' });
            const dim = (x, y, label, sub) => st.node({ x, y, w: 136, h: 48, label, sub, kind: 'info' });
            N.date = dim(90, 52, 'dim_date', 'weekday, holiday');
            N.product = dim(470, 52, 'dim_product', snow ? 'brand_id, cat_id' : 'name, brand');
            N.store = dim(90, 250, 'dim_store', 'city, size');
            N.customer = dim(470, 250, 'dim_customer', 'name, birthday');
            N.promo = dim(280, 262, 'dim_promo', 'ad type');
            ['date', 'product', 'store', 'customer', 'promo'].forEach((k) => st.link(N.fact, N[k], { kind: 'info' }));
            if (snow) {
              N.brand = st.node({ x: 470, y: 152, w: 120, h: 44, label: 'dim_brand', kind: 'data' });
              N.cat = st.node({ x: 300, y: 40, w: 130, h: 44, label: 'dim_category', kind: 'data' });
              st.link(N.product, N.brand, { kind: 'data' });
              st.link(N.product, N.cat, { kind: 'data' });
            }
          }
          async function runSchema() {
            drawSchema();
            const snow = mode.get() === 'snow';
            statLabel(sA, 'joins per query');
            sA.set('…', 'info');
            cap.set('Follow one sale row to its dimensions…', 'info');
            const fk = { date: 'date 0102', product: 'prod 31', store: 'store 3', customer: 'cust 191', promo: 'promo 19' };
            await Promise.all(Object.keys(fk).map((k) => st.send(N.fact, N[k], { label: fk[k], kind: 'info', dur: 900 })));
            Object.keys(fk).forEach((k) => N[k].set({ kind: 'good' }));
            if (snow) {
              cap.set('Snowflake: product points further to brand and category.', 'warn');
              await Promise.all([
                st.send(N.product, N.brand, { label: 'brand 7', kind: 'data', dur: 800 }),
                st.send(N.product, N.cat, { label: 'cat 2', kind: 'data', dur: 800 }),
              ]);
              N.brand.set({ kind: 'good' });
              N.cat.set({ kind: 'good' });
            }
            sA.set(snow ? '7' : '5', snow ? 'warn' : 'good');
            cap.set(snow ? 'More normalized, but 7 joins. Analysts usually prefer the star.' : 'Thursday · bananas · Seattle · Bob · poster deal: 5 joins.', snow ? 'warn' : 'good');
          }

          const PROD = ['Apples', 'Bread', 'Coffee', 'Dates'], DAYS = ['Mon', 'Tue', 'Wed', 'Thu'];
          const VAL = [[12, 30, 44, 8], [15, 28, 51, 6], [9, 35, 47, 11], [14, 31, 40, 9]];
          const rowT = VAL.map((r) => r.reduce((a, b) => a + b, 0));
          const colT = PROD.map((_, c) => VAL.reduce((a, r) => a + r[c], 0));
          const total = rowT.reduce((a, b) => a + b, 0);
          const CQ = [{ q: 'Total Coffee sales?', col: 2 }, { q: 'Total sales on Tuesday?', row: 1 }, { q: 'Sales of items over $10?', none: true }];
          let cq = 0;
          function drawCube(hl) {
            st.clear();
            const x0 = 124, y0 = 58, cw = 80, ch = 36;
            st.text(20, 18, hl ? hl.q : 'SUM(price) per day × product', { size: 14, anchor: 'start', bold: true, kind: 'accent' });
            PROD.concat(['total']).forEach((p, c) => st.text(x0 + c * (cw + 4) + cw / 2, y0 - 12, p, { size: 13, bold: true, kind: c === 4 ? 'primary' : 'text2' }));
            DAYS.concat(['total']).forEach((d, r) => {
              st.text(x0 - 14, y0 + r * (ch + 4) + ch / 2, d, { size: 13, anchor: 'end', bold: true, kind: r === 4 ? 'primary' : 'text2' });
              for (let c = 0; c < 5; c++) {
                const val = r < 4 && c < 4 ? VAL[r][c] : r === 4 && c < 4 ? colT[c] : c === 4 && r < 4 ? rowT[r] : total;
                let kind = r === 4 || c === 4 ? 'primary' : 'data';
                if (hl && hl.none) kind = 'ghost';
                else if (hl && ((hl.col === c && r === 4) || (hl.row === r && c === 4))) kind = 'good';
                else if (hl && ((hl.col === c && hl.col != null) || (hl.row === r && hl.row != null))) kind = 'info';
                st.rect(x0 + c * (cw + 4), y0 + r * (ch + 4), cw, ch, { kind, label: '$' + val, mono: true, size: 13 });
              }
            });
            st.text(280, 284, 'totals are computed once and stored', { size: 12, kind: 'muted' });
          }
          async function runCube() {
            const q = CQ[cq++ % CQ.length];
            statLabel(sA, 'raw facts scanned');
            sA.set('…', 'info');
            drawCube({ q: q.q });
            cap.set(q.q, 'info');
            await v.sleep(800);
            drawCube(q);
            if (q.none) { sA.set('all', 'bad'); cap.set('Price is not a dimension, so the cube cannot help. Scan raw facts.', 'bad'); return; }
            sA.set('0', 'good');
            cap.set(`Read one precomputed total: $${q.col != null ? colT[q.col] : rowT[q.row]}. No fact scan.`, 'good');
          }

          function run() {
            v.restart();
            st.clearPackets();
            if (mode.get() === 'cube') runCube(); else runSchema();
          }
          function reset() {
            v.restart();
            st.clearPackets();
            const m = mode.get();
            if (m === 'cube') {
              drawCube();
              statLabel(sA, 'raw facts scanned');
              sA.set('—', 'info');
              cap.set('A cube stores sums for every day × product, plus totals.', 'info');
              return;
            }
            drawSchema();
            statLabel(sA, 'joins per query');
            sA.set('—', 'info');
            cap.set(m === 'star' ? 'Fact table in the middle, dimension tables around it like rays.' : 'Snowflake: dimensions split into sub-dimensions.', 'info');
          }
          reset();
        },
      },

      /* 12 ─────────────────────────────────────────────── */
      {
        title: 'Store by column, read only what you need',
        caption: 'Analytics queries touch a few of 100+ columns. A row store reads whole rows; a column store reads just those columns.',
        problem: 'Reading every column',
        fix: 'One file per column',
        tags: ['Parquet', 'Vertica', 'Redshift', 'ClickHouse'],
        demo(el, v) {
          const box = v.wrap(el);
          const mode = v.segmented(box, {
            options: [{ value: 'row', label: 'Row layout', kind: 'bad' }, { value: 'col', label: 'Column layout', kind: 'good' }],
            value: 'row',
            onChange: reset,
          });
          let need = 3;
          v.slider(box, { label: 'Columns the query needs', min: 1, max: 10, value: 3, format: (x) => x + ' of 10', onInput: (x) => { need = x; reset(); } });
          const st = v.stage(box, { w: 560, h: 244 });
          const stats = v.row(box, { center: true });
          const sRead = v.stat(stats, 'cells read', '—', 'info');
          const sUse = v.stat(stats, 'useful', '—', 'good');
          const sWr = v.stat(stats, 'places written', '—', 'info');
          const cap = v.caption(box, '');
          const row = v.row(box);
          const buf = v.toggle(row, { label: 'Write buffer in RAM', value: false, onChange: reset });
          v.controls(row, [
            { label: 'Run query', icon: '▶', kind: 'primary', onClick: query },
            { label: 'Insert a row', icon: '＋', onClick: insert },
          ]);

          const COLS = 'ABCDEFGHIJ'.split('');
          const ORDER = [1, 4, 7, 2, 9, 0, 5, 8, 3, 6];
          let rows = 6, pending = 0, rects = [];
          const needed = () => new Set(ORDER.slice(0, need));
          const cellsInOrder = () => {
            const out = [];
            if (mode.get() === 'row') { for (let r = 0; r < rows; r++) for (let c = 0; c < 10; c++) out.push({ c, r }); }
            else { for (let c = 0; c < 10; c++) for (let r = 0; r < rows; r++) out.push({ c, r }); }
            return out;
          };
          const pos = (i) => ({ x: 12 + (i % 20) * 27, y: 72 + Math.floor(i / 20) * 34 });
          function draw(mark) {
            st.clear();
            const N = needed(), on = buf.get();
            st.box(12, 6, 536, 44, { label: '', kind: on ? 'primary' : 'ghost', solid: on });
            st.text(24, 28, on ? 'WRITE BUFFER · RAM' : 'no write buffer', { size: 12, anchor: 'start', kind: on ? 'primary' : 'muted', bold: true });
            for (let k = 0; k < pending; k++) st.rect(170 + k * 70, 15, 62, 26, { kind: 'primary', label: 'row ' + (rows + k + 1), size: 12 });
            st.text(12, 62, mode.get() === 'row' ? 'DISK · one file, row after row' : 'DISK · one file per column, A to J', { size: 12, anchor: 'start', kind: 'muted', bold: true });
            rects = cellsInOrder().map((p, i) => {
              const q = pos(i);
              return st.rect(q.x, q.y, 24, 26, { kind: mark ? mark(p) : N.has(p.c) ? 'info' : 'neutral', label: COLS[p.c], mono: true, size: 12, rx: 4 });
            });
          }

          async function query() {
            v.restart();
            st.clearPackets();
            draw();
            const N = needed(), col = mode.get() === 'col', cells = cellsInOrder();
            let read = 0, useful = 0;
            sWr.set('—', 'info');
            cap.set(col ? 'Jump to each needed column file and read it straight through.' : `Rows are stored whole: to get ${need} columns, read all 10.`, 'info');
            if (col) {
              for (let c = 0; c < 10; c++) {
                if (!N.has(c)) continue;
                cells.forEach((p, i) => { if (p.c === c) { rects[i].set({ kind: 'good' }); read++; useful++; } });
                sRead.set(String(read), 'good');
                sUse.set(String(useful), 'good');
                await v.sleep(260);
              }
              cap.set(`Read only ${read} cells, every one of them useful.`, 'good');
              return;
            }
            for (let r = 0; r < rows; r++) {
              cells.forEach((p, i) => { if (p.r === r) { rects[i].set({ kind: N.has(p.c) ? 'good' : 'warn' }); read++; if (N.has(p.c)) useful++; } });
              sRead.set(String(read), 'warn');
              sUse.set(String(useful), 'good');
              await v.sleep(260);
            }
            cap.set(`Read ${read} cells to use ${useful}: ${Math.round(100 - (useful / read) * 100)}% wasted.`, useful < read ? 'bad' : 'good');
          }

          function insert() {
            v.restart();
            st.clearPackets();
            const col = mode.get() === 'col';
            sRead.set('—', 'info');
            sUse.set('—', 'good');
            if (rows + pending >= 10) {
              rows = 6;
              pending = 0;
              draw();
              sWr.set('—', 'info');
              cap.set('Demo table reset to 6 rows. Insert again.', 'info');
              return;
            }
            if (col && buf.get()) {
              pending++;
              if (pending < 3) { draw(); sWr.set('0', 'good'); cap.set(`Row buffered in RAM (${pending} of 3). Disk untouched.`, 'good'); return; }
              const r0 = rows;
              rows += pending;
              pending = 0;
              draw((p) => (p.r >= r0 ? 'good' : 'neutral'));
              sWr.set('10', 'good');
              cap.set('Like an LSM memtable: 3 rows merged into column files in one pass.', 'good');
              return;
            }
            rows++;
            if (!col) {
              draw((p) => (p.r === rows - 1 ? 'good' : 'neutral'));
              sWr.set('1', 'good');
              cap.set('Row layout: append the whole row in one place. Easy.', 'good');
              return;
            }
            draw((p) => (p.r === rows - 1 ? 'bad' : 'neutral'));
            sWr.set('10', 'bad');
            cap.set('One row = 10 separate writes, one per column file. Sorted files get rewritten!', 'bad');
          }

          function reset() {
            v.restart();
            st.clearPackets();
            if (!buf.get() && pending) { rows += pending; pending = 0; }
            draw();
            sRead.set('—', 'info');
            sUse.set('—', 'good');
            sWr.set('—', 'info');
            cap.set(mode.get() === 'row' ? 'Row layout: all 10 columns of a row sit side by side.' : 'Column layout: each column is its own contiguous file.', 'info');
          }
          reset();
        },
      },

      /* 13 ─────────────────────────────────────────────── */
      {
        title: 'Bitmaps and run lengths shrink columns',
        caption: 'Few distinct values? Keep one bitmap per value, then run-length encode it. Sorting rows first makes runs long and columns tiny.',
        problem: 'Huge, repetitive columns',
        fix: 'Bitmaps + RLE on sorted rows',
        tags: ['Vertica', 'C-Store', 'Parquet'],
        demo(el, v) {
          const box = v.wrap(el);
          const mode = v.segmented(box, {
            options: [{ value: 'none', label: 'Insert order' }, { value: 'p', label: 'Sort by product' }, { value: 's', label: 'Sort by store' }],
            value: 'none',
            onChange: () => { v.restart(); draw(); narrate(); },
          });
          const st = v.stage(box, { w: 560, h: 280 });
          const stats = v.row(box, { center: true });
          const sP = v.stat(stats, 'product: RLE numbers', '', 'info');
          const sS = v.stat(stats, 'store: RLE numbers', '', 'info');
          const cap = v.caption(box, '');
          v.controls(box, [
            { label: 'Query: product 31 OR 74', icon: '◉', kind: 'primary', onClick: query },
            { label: 'New data', icon: '↺', onClick: regen },
          ]);
          box.appendChild(v.h('div', { class: 'vz-muted', style: { textAlign: 'center' } }, 'Rows move as a whole. Replicas may each use a different sort order.'));

          const PV = [31, 45, 69, 74], SV = [1, 2, 3];
          let data = [];
          const fill = (R) => { data = Array.from({ length: 16 }, () => ({ p: PV[Math.floor(R() * 4)], s: SV[Math.floor(R() * 3)] })); };
          const rowsNow = () => {
            const m = mode.get(), r = data.map((d, i) => Object.assign({ i }, d));
            if (m === 'p') r.sort((a, b) => a.p - b.p || a.s - b.s || a.i - b.i);
            if (m === 's') r.sort((a, b) => a.s - b.s || a.p - b.p || a.i - b.i);
            return r;
          };
          const rle = (bits) => {
            const out = [];
            let cur = 0, n = 0;
            bits.forEach((b) => { if (b === cur) n++; else { out.push(n); cur = b; n = 1; } });
            if (cur === 1) out.push(n);
            return out;
          };
          const X = (i) => 76 + i * 20;

          function draw(q, phase) {
            st.clear();
            const R = rowsNow();
            const or = R.map((r) => (q && q.includes(r.p) ? 1 : 0));
            const hitCol = q && phase === 'or';
            st.text(12, 25, 'product', { size: 13, anchor: 'start', bold: true });
            st.text(12, 59, 'store', { size: 13, anchor: 'start', bold: true });
            R.forEach((r, i) => {
              const hit = hitCol && or[i];
              st.rect(X(i), 12, 18, 26, { kind: hit ? 'good' : hitCol ? 'neutral' : 'data', label: String(r.p), mono: true, size: 12, rx: 3 });
              st.rect(X(i), 46, 18, 26, { kind: hit ? 'good' : hitCol ? 'neutral' : 'info', label: String(r.s), mono: true, size: 12, rx: 3 });
            });
            st.text(404, 25, '16 raw values', { size: 12, anchor: 'start', kind: 'muted' });
            st.text(404, 59, '16 raw values', { size: 12, anchor: 'start', kind: 'muted' });
            st.text(12, 94, 'one bitmap per product value', { size: 12, anchor: 'start', kind: 'muted', bold: true });
            st.text(404, 94, 'run lengths', { size: 12, anchor: 'start', kind: 'muted', bold: true });
            let pNums = 0;
            PV.forEach((val, j) => {
              const y = 104 + j * 34, bits = R.map((r) => (r.p === val ? 1 : 0)), runs = rle(bits);
              const sel = q && q.includes(val);
              pNums += runs.length;
              st.text(12, y + 12, '= ' + val, { size: 13, anchor: 'start', bold: true, mono: true, kind: sel ? 'good' : 'text' });
              bits.forEach((b, i) => st.rect(X(i), y, 18, 24, { kind: b ? (sel ? 'good' : 'primary') : 'ghost', label: String(b), size: 12, rx: 3 }));
              const txt = runs.length ? runs.join(',') : 'none';
              st.text(404, y + 12, txt.length > 19 ? txt.slice(0, 18) + '…' : txt, { size: 12, anchor: 'start', mono: true, bold: true, kind: runs.length <= 2 ? 'good' : runs.length <= 4 ? 'text' : 'warn' });
            });
            if (q && phase === 'or') {
              const y = 104 + 4 * 34 + 4;
              st.text(12, y + 12, 'OR', { size: 13, anchor: 'start', bold: true, kind: 'good' });
              or.forEach((b, i) => st.rect(X(i), y, 18, 24, { kind: b ? 'good' : 'ghost', label: String(b), size: 12, rx: 3 }));
              st.text(404, y + 12, `→ ${or.filter(Boolean).length} rows`, { size: 13, anchor: 'start', bold: true, kind: 'good' });
            }
            let sNums = 0;
            SV.forEach((val) => { sNums += rle(R.map((r) => (r.s === val ? 1 : 0))).length; });
            sP.set(String(pNums), pNums <= 8 ? 'good' : pNums <= 14 ? 'info' : 'warn');
            sS.set(String(sNums), sNums <= 6 ? 'good' : sNums <= 12 ? 'info' : 'warn');
            return or.filter(Boolean).length;
          }
          function narrate() {
            const m = mode.get();
            cap.set(
              m === 'none' ? 'Insert order: runs are short, so run-length encoding saves little.'
                : m === 'p' ? 'Sorted by product: one run per bitmap. Store, the second key, compresses less.'
                  : 'Sorted by store: store compresses best, product scatters again.',
              m === 'none' ? 'warn' : 'good');
          }
          async function query() {
            v.restart();
            draw();
            cap.set('WHERE product IN (31, 74): load just those two bitmaps…', 'info');
            await v.sleep(800);
            draw([31, 74], 'bits');
            await v.sleep(1000);
            const n = draw([31, 74], 'or');
            cap.set(`Bitwise OR marks the matching rows: ${n} of 16. No row decoding.`, 'good');
          }
          function regen() {
            v.restart();
            fill(Math.random);
            draw();
            narrate();
          }
          fill(rng(42));
          draw();
          narrate();
        },
      },
    ],

    cheatsheet: [
      { term: 'Log', text: 'Append-only file of records. Writes are cheap; scanning it per read is not.', kind: 'data' },
      { term: 'Index', text: 'Extra structure derived from the data. Speeds reads, slows every write.', kind: 'primary' },
      { term: 'Hash index', text: 'In-RAM map of key → byte offset. All keys must fit; no range queries.', kind: 'info' },
      { term: 'Compaction', text: 'Rewrite segments keeping only the newest value per key. Tombstones mark deletes.', kind: 'good' },
      { term: 'SSTable', text: 'Segment sorted by key: sparse index, merge-sort compaction, range scans.', kind: 'primary' },
      { term: 'LSM-tree', text: 'Memtable + WAL in front, sorted files on disk, merged in the background.', kind: 'good' },
      { term: 'Bloom filter', text: 'Tiny bit array that says "definitely not here", skipping useless reads.', kind: 'info' },
      { term: 'B-tree', text: 'Fixed-size pages in a shallow tree. Update in place; split full pages.', kind: 'primary' },
      { term: 'WAL', text: 'Write-ahead log: put the change on disk before touching the pages.', kind: 'warn' },
      { term: 'Write amplification', text: 'One logical write becoming many physical writes. LSM: compaction. B-tree: whole pages.', kind: 'warn' },
      { term: 'Clustered / covering', text: 'The whole row, or a few columns, stored inside the index itself.', kind: 'data' },
      { term: 'OLTP vs OLAP', text: 'Few rows by key for users vs huge scans and aggregates for analysts.', kind: 'info' },
      { term: 'Star schema', text: 'A fact table of events surrounded by dimension tables.', kind: 'primary' },
      { term: 'Column store', text: 'One file per column, compressed with bitmaps and run lengths. Sorting helps.', kind: 'good' },
    ],

    quiz: [
      {
        q: 'Why do LSM-trees keep a Bloom filter per segment?',
        options: ['To keep keys sorted in memory', 'To skip segments that surely lack a key', 'To compress blocks on disk'],
        answer: 1,
        why: 'A 0 bit proves the key is absent, so lookups for missing keys avoid disk reads.',
      },
      {
        q: 'A B-tree page is full when a new key arrives. What happens?',
        options: ['The key goes to an overflow file', 'The whole tree is rebuilt', 'The page splits and its middle key moves up'],
        answer: 2,
        why: 'Splitting keeps the tree balanced, so a lookup still reads only a few pages.',
      },
      {
        q: 'Why is a hash index bad at range queries?',
        options: ['Keys are unordered, so every key must be checked', 'The log is append-only', 'Hash maps are stored on disk'],
        answer: 0,
        why: 'Nothing keeps neighboring keys together. Sorted structures can seek once and scan.',
      },
      {
        q: 'What mainly makes in-memory databases fast?',
        options: ['They never touch the disk at all', 'They skip encoding data into disk formats', 'They run on faster SSDs'],
        answer: 1,
        why: 'Disk engines with a warm cache also avoid disk reads; the decoding overhead is the difference.',
      },
      {
        q: 'An analytics query reads 3 of 100 columns over a billion rows. Which layout reads less?',
        options: ['Row-oriented', 'Both read the same amount', 'Column-oriented'],
        answer: 2,
        why: 'A column store reads just those 3 column files; a row store drags whole rows in.',
      },
    ],
  });
})();
