/* Chapter 6 — Partitioning */
(function () {
  'use strict';

  /* ---------- local helpers ---------- */
  /* A real, well-mixed 16-bit string hash (FNV-1a + murmur3 finalizer). */
  function hash16(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return (h >>> 0) >>> 16;
  }
  /* Hash-range partitioning: split 0..65535 into n equal ranges. */
  const part = (key, n) => Math.floor((hash16(key) * n) / 65536);
  const pad2 = (n) => String(n).padStart(2, '0');
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  /* Share of the last few writes that went to each of n partitions. */
  const shares = (recent, n) => {
    const c = Array(n).fill(0);
    recent.forEach((p) => c[p]++);
    return c.map((x) => (recent.length ? x / recent.length : 0));
  };
  const heat = (s) => (s > 0.5 ? 'bad' : s > 0.35 ? 'warn' : 'good');

  DDIA.chapter({
    id: 6,
    part: 2,
    title: 'Partitioning',
    short: 'Partitioning',
    tagline: 'Split big data across many machines',
    cards: [
      /* 1 ─────────────────────────────────────────────── */
      {
        title: 'Split the data, then copy each piece',
        caption: 'Each record belongs to one partition. Each partition is replicated: a leader on one node, followers on others. Every node hosts several.',
        problem: 'Data outgrows one machine',
        fix: 'Partitions, each replicated',
        tags: ['shard', 'region', 'tablet', 'vnode'],
        demo(el, v) {
          const box = v.wrap(el);
          const rep = v.toggle(box, { label: 'Replicate each partition ×3', value: true, onChange: restore });
          const st = v.stage(box, { w: 560, h: 318 });
          const NX = (n) => 12 + n * 136;
          const boxes = [0, 1, 2, 3].map((n) => st.box(NX(n), 8, 128, 244, { label: 'Node ' + (n + 1) }));
          // replica k of partition p lives on node (p + k) % 4, in slot k
          const R = [0, 1, 2, 3].map((p) => [0, 1, 2].map((k) => st.node({ x: NX((p + k) % 4) + 64, y: 66 + k * 64, w: 104, h: 48, label: 'P' + (p + 1) })));
          const client = st.node({ x: 280, y: 290, w: 110, h: 40, label: 'Client', kind: 'info' });
          const stats = v.row(box, { center: true });
          const sAvail = v.stat(stats, 'partitions available', '4 / 4', 'good');
          const sCopies = v.stat(stats, 'copies of each', '3', 'good');
          const cap = v.caption(box, '');
          v.controls(box, [
            { label: 'Write a key', icon: '▶', kind: 'primary', onClick: write },
            { label: 'Crash a node', icon: '✕', kind: 'danger', onClick: crash },
            { label: 'Restore', icon: '↺', kind: 'ghost', onClick: restore },
          ]);
          const KEYS = ['grace', 'carol', 'erin', 'alice', 'heidi', 'dave', 'frank', 'bob'];
          let down = [false, false, false, false], lead = [0, 0, 0, 0], ki = 0;
          const nodeOf = (p, k) => (p + k) % 4;

          function paint() {
            const r3 = rep.get();
            boxes.forEach((b, n) => b.set({ kind: down[n] ? 'bad' : 'neutral', label: 'Node ' + (n + 1) + (down[n] ? ' · down' : '') }));
            let avail = 0;
            R.forEach((reps, p) => {
              reps.forEach((node, k) => {
                const shown = r3 || k === 0;
                node.show(shown);
                if (!shown) return;
                const dn = down[nodeOf(p, k)], isLead = lead[p] === k;
                node.set({ kind: dn ? 'bad' : isLead ? 'primary' : 'neutral', down: dn, sub: dn ? 'down' : isLead ? 'leader' : 'follower' });
              });
              if (lead[p] >= 0) avail++;
            });
            sAvail.set(`${avail} / 4`, avail === 4 ? 'good' : 'bad');
            sCopies.set(r3 ? '3' : '1', r3 ? 'good' : 'warn');
          }
          function restore() {
            v.restart();
            st.clearPackets();
            down = [false, false, false, false];
            lead = [0, 0, 0, 0];
            paint();
            cap.set(rep.get() ? '4 partitions × 3 copies, spread over 4 nodes.' : 'One copy per partition. Try crashing a node.', 'info');
          }
          function crash() {
            v.restart();
            st.clearPackets();
            const alive = [0, 1, 2, 3].filter((n) => !down[n]);
            if (!alive.length) { cap.set('Every node is down. Press Restore.', 'bad'); return; }
            const n = pick(alive);
            down[n] = true;
            const moved = [], lost = [];
            for (let p = 0; p < 4; p++) {
              if (lead[p] < 0 || nodeOf(p, lead[p]) !== n) continue;
              const next = rep.get() ? [0, 1, 2].find((k) => !down[nodeOf(p, k)]) : undefined;
              if (next == null) { lead[p] = -1; lost.push('P' + (p + 1)); } else { lead[p] = next; moved.push('P' + (p + 1)); }
            }
            paint();
            moved.forEach((name) => { const p = Number(name.slice(1)) - 1; R[p][lead[p]].flash(); });
            if (lost.length) cap.set(`Node ${n + 1} died. ${lost.join(', ')}: no copy left, unavailable.`, 'bad');
            else if (moved.length) cap.set(`Node ${n + 1} died. A follower of ${moved.join(', ')} took over.`, 'good');
            else cap.set(`Node ${n + 1} died. It held only followers: still fine.`, 'good');
          }
          async function write() {
            v.restart();
            st.clearPackets();
            paint();
            const key = KEYS[ki++ % KEYS.length];
            const p = part(key, 4);
            if (lead[p] < 0) {
              cap.set(`hash("${key}") → P${p + 1}, which has no live copy`, 'bad');
              await st.send(client, R[p][0], { label: key, kind: 'bad', drop: 0.7 });
              return;
            }
            const L = R[p][lead[p]];
            cap.set(`hash("${key}") → P${p + 1}. Send it to P${p + 1}'s leader.`, 'info');
            await st.send(client, L, { label: key, kind: 'primary' });
            const fol = rep.get() ? [0, 1, 2].filter((k) => k !== lead[p] && !down[nodeOf(p, k)]) : [];
            if (fol.length) {
              await Promise.all(fol.map((k) => st.send(L, R[p][k], { label: key, kind: 'data', dur: 800 })));
              cap.set(`Stored on the leader, copied to ${fol.length} follower${fol.length > 1 ? 's' : ''} on other nodes.`, 'good');
            } else {
              cap.set(rep.get() ? 'Stored, but no follower is alive to copy it.' : 'Stored on its only copy. Lose that node, lose the data.', 'warn');
            }
          }
          restore();
        },
      },

      /* 2 ─────────────────────────────────────────────── */
      {
        title: 'Key ranges, like encyclopedia volumes',
        lab: { id: 'partition', preset: 'time-hotspot' },
        caption: 'Each partition owns a sorted range of keys, so range scans touch few partitions. But timestamp keys send every write to the newest range.',
        problem: 'Hot spot on today\'s partition',
        fix: 'Prefix keys with a sensor name',
        tags: ['HBase', 'Bigtable', 'RethinkDB'],
        demo(el, v) {
          const box = v.wrap(el);
          const mode = v.segmented(box, {
            options: [{ value: 'words', label: 'Word keys' }, { value: 'time', label: 'Timestamp keys', kind: 'bad' }, { value: 'sensor', label: 'Sensor + time', kind: 'good' }],
            value: 'words',
            onChange: reset,
          });
          const st = v.stage(box, { w: 560, h: 244 });
          const writer = st.node({ x: 280, y: 32, w: 150, h: 40, label: 'Incoming writes', kind: 'info', shape: 'pill' });
          const VX = (i) => 80 + i * 133;
          const vols = [0, 1, 2, 3].map((i) => st.node({ x: VX(i), y: 128, w: 108, h: 84, label: 'Vol ' + (i + 1) }));
          [0, 1, 2, 3].forEach((i) => st.rect(VX(i) - 54, 186, 108, 14, { kind: 'neutral', rx: 5 }));
          const bars = [0, 1, 2, 3].map((i) => st.rect(VX(i) - 54, 186, 1, 14, { kind: 'good', rx: 5 }));
          const pcts = [0, 1, 2, 3].map((i) => st.text(VX(i), 220, '0%', { size: 14, kind: 'muted', mono: true, bold: true }));
          const stats = v.row(box, { center: true });
          const sHot = v.stat(stats, 'busiest volume', '–', 'info');
          const sScan = v.stat(stats, 'volumes per range scan', '–', 'info');
          const cap = v.caption(box, '');
          v.controls(box, [{ label: 'Run a range scan', icon: '◉', kind: 'primary', onClick: scan }]);
          const WORDS = ['apple', 'bison', 'cedar', 'delta', 'eagle', 'fjord', 'gecko', 'hazel', 'igloo', 'jolly', 'koala', 'lemon', 'mango', 'nutmeg', 'olive', 'pearl', 'quail', 'raven', 'salsa', 'tulip', 'umber', 'viola', 'walnut', 'yodel'];
          const SENSORS = ['ash', 'elm', 'oak', 'yew'];
          const RANGES = { words: ['a – d', 'e – k', 'l – r', 's – z'], time: ['Mon', 'Tue', 'Wed', 'Thu (today)'], sensor: ['ash… (a–d)', 'elm… (e–k)', 'oak… (l–r)', 'yew… (s–z)'] };
          const rangeOf = (c) => (c <= 'd' ? 0 : c <= 'k' ? 1 : c <= 'r' ? 2 : 3);
          let recent = [], sec = 0;

          function paintBars() {
            const s = shares(recent, 4);
            s.forEach((x, i) => {
              bars[i].set({ w: Math.max(1, x * 108), kind: heat(x) });
              pcts[i].set(Math.round(x * 100) + '%', x > 0.5 ? 'bad' : 'muted');
              vols[i].set({ kind: x > 0.5 ? 'bad' : 'neutral' });
            });
            const mx = Math.max(...s);
            sHot.set(recent.length ? Math.round(mx * 100) + '%' : '–', recent.length ? heat(mx) : 'info');
          }
          function reset() {
            v.restart();
            st.clearPackets();
            recent = [];
            const m = mode.get();
            vols.forEach((n, i) => n.set({ sub: RANGES[m][i] }));
            sScan.set('–', 'info');
            paintBars();
            cap.set(m === 'words' ? 'Word keys spread over the volumes. Boundaries follow the data.'
              : m === 'time' ? 'Every new reading is stamped "now". Watch the last volume.'
                : 'Sensor name first, then time: writes spread again.', m === 'time' ? 'warn' : 'info');
          }
          function tick() {
            const m = mode.get();
            sec = (sec + 1) % 60;
            let key, p;
            if (m === 'words') { key = pick(WORDS); p = rangeOf(key[0]); }
            else if (m === 'time') { key = 'Thu 10:' + pad2(sec); p = 3; }
            else { const s = pick(SENSORS); key = s + ' 10:' + pad2(sec); p = rangeOf(s[0]); }
            recent.push(p);
            if (recent.length > 20) recent.shift();
            paintBars();
            st.send(writer, vols[p], { label: key, kind: 'data', dur: 800 });
          }
          async function scan() {
            v.restart();
            st.clearPackets();
            const m = mode.get();
            const hit = m === 'words' ? [1, 2] : m === 'time' ? [1] : [0, 1, 2, 3];
            cap.set(m === 'words' ? 'Scan keys fjord … lemon' : m === 'time' ? 'Scan all of Tuesday' : 'Scan Tuesday: one scan per sensor', 'info');
            await Promise.all(hit.map((i) => st.send(writer, vols[i], { label: 'scan', kind: 'info', dur: 800 })));
            hit.forEach((i) => vols[i].flash());
            sScan.set(String(hit.length), hit.length > 2 ? 'bad' : 'good');
            cap.set(m === 'words' ? 'Keys are sorted, so the range sits in two volumes.'
              : m === 'time' ? 'One day lives in one volume. Scans are easy.'
                : 'The price of the fix: every volume is scanned.', hit.length > 2 ? 'warn' : 'good');
          }
          reset();
          v.every(450, tick);
        },
      },

      /* 3 ─────────────────────────────────────────────── */
      {
        title: 'Hash the key: even spread, lost order',
        lab: { id: 'partition', preset: 'hash-scatter' },
        caption: 'A hash scatters similar keys evenly, curing hot spots. But neighbors in key order land far apart, so range scans must ask every partition.',
        problem: 'Range scans hit all partitions',
        fix: 'Compound key: hash one part, sort the rest',
        tags: ['Cassandra', 'MongoDB', 'Riak', 'Voldemort'],
        demo(el, v) {
          const box = v.wrap(el);
          const mode = v.segmented(box, {
            options: [{ value: 'range', label: 'By key range', kind: 'bad' }, { value: 'hash', label: 'By hash of key', kind: 'good' }, { value: 'comp', label: 'Compound key' }],
            value: 'range',
            onChange: draw,
          });
          const st = v.stage(box, { w: 560, h: 270 });
          const stats = v.row(box, { center: true });
          const sHot = v.stat(stats, 'busiest partition', '–', 'info');
          const sScan = v.stat(stats, 'partitions per scan', '–', 'info');
          const cap = v.caption(box, '');
          v.controls(box, [
            { label: 'Write 6 keys', icon: '▶', kind: 'primary', onClick: writeAll },
            { label: 'Range scan', icon: '◉', onClick: scan },
          ]);
          const TS = ['10:00:38', '10:00:39', '10:00:40', '10:00:41', '10:00:42', '10:00:43'];
          const COMP = [['ana', '10:01'], ['kai', '10:01'], ['ana', '10:02'], ['sam', '10:01'], ['ana', '10:03'], ['kai', '10:02']];
          const PX = (j) => 20 + j * 130;
          const secOf = (t) => { const [h, m, s] = t.split(':').map(Number); return h * 3600 + m * 60 + (s || 0); };
          let keys = [], parts = [], query, counts = [0, 0, 0, 0];

          // which partition a key lands in, and where inside it
          function place(i) {
            const m = mode.get();
            const at = (f, off) => { const p = Math.floor(f * 4); return { p, x: Math.min(PX(p) + 118, PX(p) + 8 + (f * 4 - p) * 104 + off) }; };
            if (m === 'range') return at(secOf(TS[i]) / 86400, i * 6);
            if (m === 'hash') return at(hash16(TS[i]) / 65536, 0);
            const [u, t] = COMP[i];
            const p = Math.floor((hash16(u) * 4) / 65536);
            const users = [...new Set(COMP.map((c) => c[0]))].filter((x) => Math.floor((hash16(x) * 4) / 65536) === p);
            const seq = COMP.filter((c) => c[0] === u && c[1] < t).length;
            return { p, x: PX(p) + 22 + users.indexOf(u) * 50 + seq * 14 };
          }
          function draw() {
            v.restart();
            st.clearPackets();
            st.clear();
            const m = mode.get();
            counts = [0, 0, 0, 0];
            keys = [0, 1, 2, 3, 4, 5].map((i) => {
              const label = m === 'comp' ? COMP[i][0] : TS[i];
              const sub = m === 'comp' ? COMP[i][1] : m === 'hash' ? 'h=' + hash16(TS[i]) : '';
              return st.node({ x: 50 + i * 92, y: 36, w: 84, h: sub ? 46 : 36, label, sub, mono: true, size: 13, kind: 'data' });
            });
            query = st.node({ x: 280, y: 112, w: 150, h: 34, label: 'range scan', kind: 'info', shape: 'pill' });
            query.show(false);
            const RL = m === 'range' ? ['00–06 h', '06–12 h', '12–18 h', '18–24 h'] : ['h 0–16k', 'h 16k–33k', 'h 33k–49k', 'h 49k–65k'];
            parts = [0, 1, 2, 3].map((j) => st.rect(PX(j), 176, 126, 50, { kind: 'neutral', label: 'p' + j, size: 15 }));
            RL.forEach((t, j) => st.text(PX(j) + 63, 244, t, { size: 13, kind: 'muted', mono: true }));
            st.text(20, 160, m === 'range' ? 'partitions by time of day' : m === 'hash' ? 'partitions by hash value' : 'partitions by hash(user), sorted by time', { anchor: 'start', size: 12, kind: 'muted', bold: true });
            sHot.set('–', 'info');
            sScan.set('–', 'info');
            cap.set(m === 'range' ? 'Six consecutive timestamps, partitioned by key range.'
              : m === 'hash' ? 'Same keys, but each goes where its hash says.'
                : 'Key = (user, time). Only the user part is hashed.', 'info');
          }
          async function writeAll() {
            draw();
            const m = mode.get();
            await Promise.all(keys.map((k, i) => v.sleep(i * 180).then(async () => {
              const { p, x } = place(i);
              await st.send(k, { x, y: 172 }, { kind: 'data', dur: 700 });
              st.add('circle', { cx: x, cy: 176, r: 6, class: 'vz-shape k-data', 'stroke-width': 1.5 });
              counts[p]++;
              parts[p].set({ label: `p${p} · ${counts[p]}`, kind: 'data' });
            })));
            const mx = Math.max(...counts);
            sHot.set(`${mx} of 6`, mx >= 4 ? 'bad' : 'good');
            parts.forEach((r, j) => { if (counts[j] >= 4) r.set({ kind: 'bad' }); });
            cap.set(m === 'range' ? 'All six land in p1: a hot spot.'
              : m === 'hash' ? 'Spread evenly: no partition is hot.'
                : 'Each user\'s posts stay together, sorted by time.', mx >= 4 ? 'bad' : 'good');
          }
          async function scan() {
            v.restart();
            st.clearPackets();
            const m = mode.get();
            let hit;
            if (m === 'range') hit = [place(0).p];
            else if (m === 'hash') hit = [0, 1, 2, 3];
            else hit = [Math.floor((hash16('ana') * 4) / 65536)];
            query.set({ label: m === 'comp' ? 'ana 10:01–10:03' : '10:00:38–43' });
            query.show(true);
            parts.forEach((r, j) => r.set({ kind: hit.includes(j) ? 'info' : 'neutral' }));
            await Promise.all(hit.map((j) => st.send(query, { x: PX(j) + 63, y: 176 }, { label: 'scan', kind: 'info', dur: 700 })));
            sScan.set(String(hit.length), hit.length > 1 ? 'bad' : 'good');
            cap.set(m === 'range' ? 'Sorted keys: the range is in one partition.'
              : m === 'hash' ? 'Order is lost: the scan must ask all four.'
                : 'Fixed user, time range: one partition, already sorted.', hit.length > 1 ? 'bad' : 'good');
          }
          draw();
        },
      },

      /* 4 ─────────────────────────────────────────────── */
      {
        title: 'One celebrity key melts one partition',
        lab: { id: 'partition', preset: 'celebrity' },
        caption: 'Hashing can\'t split one key, so all its writes hit one partition. A random suffix spreads them; reads then merge every part.',
        problem: 'Hot key',
        fix: 'Key + random suffix',
        tags: ['celebrity problem', 'write sharding'],
        demo(el, v) {
          const box = v.wrap(el);
          const split = v.toggle(box, { label: 'Add a random suffix (00–99)', value: false, onChange: reset });
          const st = v.stage(box, { w: 560, h: 290 });
          const fans = st.node({ x: 62, y: 140, w: 64, h: 64, shape: 'person', label: 'Fans', kind: 'info' });
          const PY = (j) => 44 + j * 68;
          const parts = [0, 1, 2, 3].map((j) => st.node({ x: 256, y: PY(j), w: 124, h: 50, label: 'Partition ' + j }));
          [0, 1, 2, 3].forEach((j) => st.rect(336, PY(j) - 9, 160, 18, { kind: 'neutral', rx: 6 }));
          const bars = [0, 1, 2, 3].map((j) => st.rect(336, PY(j) - 9, 1, 18, { kind: 'good', rx: 6 }));
          const pcts = [0, 1, 2, 3].map((j) => st.text(546, PY(j), '0%', { size: 14, anchor: 'end', mono: true, bold: true, kind: 'muted' }));
          const stats = v.row(box, { center: true });
          const sHot = v.stat(stats, 'busiest partition', '–', 'info');
          const sRead = v.stat(stats, 'keys per celeb read', '1', 'good');
          const cap = v.caption(box, '');
          v.controls(box, [{ label: 'Read the celeb\'s posts', icon: '◉', kind: 'primary', onClick: read }]);
          const HOT = part('celeb', 4);
          const SUFFIX = [0, 0, 0, 0];
          for (let i = 0; i < 100; i++) SUFFIX[part('celeb#' + pad2(i), 4)]++;
          let recent = [];

          function paintBars() {
            const s = shares(recent, 4);
            s.forEach((x, j) => {
              bars[j].set({ w: Math.max(1, x * 160), kind: heat(x) });
              pcts[j].set(Math.round(x * 100) + '%', x > 0.5 ? 'bad' : 'muted');
              parts[j].set({ kind: x > 0.5 ? 'bad' : 'neutral', sub: x > 0.5 ? 'overloaded' : '' });
            });
            const mx = Math.max(...s);
            sHot.set(recent.length ? Math.round(mx * 100) + '%' : '–', recent.length ? heat(mx) : 'info');
          }
          function reset() {
            v.restart();
            st.clearPackets();
            recent = [];
            paintBars();
            sRead.set(split.get() ? '100' : '1', split.get() ? 'warn' : 'good');
            cap.set(split.get() ? 'Each celeb write picks a random key, celeb#00 … celeb#99.' : '75% of all writes are for one key: "celeb".', split.get() ? 'info' : 'warn');
          }
          function tick() {
            const hot = Math.random() < 0.75;
            let key = hot ? 'celeb' : 'user' + Math.floor(Math.random() * 10000);
            if (hot && split.get()) key = 'celeb#' + pad2(Math.floor(Math.random() * 100));
            const p = part(key, 4);
            recent.push(p);
            if (recent.length > 24) recent.shift();
            paintBars();
            st.send(fans, parts[p], { label: hot ? key : '', kind: hot ? 'warn' : 'data', dur: 700 });
          }
          async function read() {
            v.restart();
            st.clearPackets();
            if (!split.get()) {
              await st.send(fans, parts[HOT], { label: 'get celeb', kind: 'info' });
              await st.send(parts[HOT], fans, { label: 'posts', kind: 'good' });
              sRead.set('1', 'good');
              cap.set('Reading is easy: one key on one partition.', 'good');
            } else {
              cap.set('The posts are spread over 100 keys', 'warn');
              await Promise.all(parts.map((p, j) => st.send(fans, p, { label: `get ${SUFFIX[j]}`, kind: 'info', dur: 800 })));
              await Promise.all(parts.map((p) => st.send(p, fans, { label: 'posts', kind: 'good', dur: 800 })));
              sRead.set('100', 'warn');
              cap.set('Writes are spread, but every read merges 100 keys.', 'warn');
            }
          }
          reset();
          v.every(350, tick);
        },
      },

      /* 5 ─────────────────────────────────────────────── */
      {
        title: 'Secondary indexes: local or global?',
        caption: 'Local index: writes stay local, but queries scatter to every partition. Global index split by term: reads hit one partition, writes touch several.',
        problem: 'Scatter/gather reads',
        fix: 'Term-partitioned (global) index',
        tags: ['MongoDB', 'Elasticsearch', 'Cassandra', 'DynamoDB'],
        demo(el, v) {
          const box = v.wrap(el);
          const mode = v.segmented(box, {
            options: [{ value: 'local', label: 'Local (by document)' }, { value: 'global', label: 'Global (by term)' }],
            value: 'local',
            onChange: reset,
          });
          const st = v.stage(box, { w: 560, h: 330 });
          const stats = v.row(box, { center: true });
          const sRead = v.stat(stats, 'partitions read', '–', 'info');
          const sWrite = v.stat(stats, 'partitions written', '–', 'info');
          const cap = v.caption(box, '');
          v.controls(box, [
            { label: 'Find red cars', icon: '◉', kind: 'primary', onClick: query },
            { label: 'Add red car #7', icon: '＋', onClick: add },
            { label: 'Reset', icon: '↺', kind: 'ghost', onClick: reset },
          ]);
          const DOCS = [[[1, 'red'], [2, 'silver'], [3, 'red']], [[4, 'black'], [5, 'red']], [[6, 'silver']]];
          const TERMS = ['a–h', 'i–r', 's–z'];
          const termPart = (c) => (c[0] <= 'h' ? 0 : c[0] <= 'r' ? 1 : 2);
          let added = false, indexed7 = false, pending = 0, client, P = [];
          const glob = () => mode.get() === 'global';
          const docsOf = (i) => DOCS[i].concat(i === 2 && added ? [[7, 'red']] : []);
          function entriesOf(i) {
            const src = glob() ? [0, 1, 2].map((j) => docsOf(j)).reduce((a, b) => a.concat(b), []) : docsOf(i);
            const map = {};
            src.forEach(([id, c]) => {
              if (id === 7 && !indexed7) return;
              if (glob() && termPart(c) !== i) return;
              (map[c] = map[c] || []).push(id);
            });
            return Object.keys(map).sort().map((c) => [c, map[c]]);
          }
          function draw() {
            st.clear();
            client = st.node({ x: 280, y: 32, w: 110, h: 40, label: 'Client', kind: 'info' });
            P = [0, 1, 2].map((i) => {
              const x = 10 + i * 184, cx = x + 86;
              st.box(x, 76, 172, 246, { label: 'Partition ' + i });
              const docs = docsOf(i).map(([id, c], k) => st.node({ x: cx, y: 120 + k * 36, w: 148, h: 30, label: `#${id} ${c}`, mono: true, size: 13, kind: id === 7 ? 'good' : 'data' }));
              st.text(x + 12, 234, glob() ? `index · terms ${TERMS[i]}` : 'local index', { anchor: 'start', size: 12, kind: 'muted', bold: true });
              const entries = entriesOf(i);
              const en = entries.map(([c, ids], k) => st.node({ x: cx, y: 262 + k * 34, w: 148, h: 28, label: `${c} → ${ids.join(',')}`, mono: true, size: 13 }));
              let ghost = null;
              if (glob() && i === 1 && added && !indexed7) ghost = st.node({ x: cx, y: 296, w: 148, h: 28, label: 'red +7 pending', mono: true, size: 13, kind: 'ghost' });
              return { cx, docs, entries, en, ghost };
            });
          }
          const redOf = (i) => { const k = P[i].entries.findIndex((e) => e[0] === 'red'); return k >= 0 ? { node: P[i].en[k], ids: P[i].entries[k][1] } : null; };
          function reset() {
            v.restart();
            st.clearPackets();
            added = false;
            indexed7 = false;
            pending = 0;
            draw();
            sRead.set('–', 'info');
            sWrite.set('–', 'info');
            cap.set(glob() ? 'Each partition indexes a range of colors, for all cars.' : 'Each partition indexes only its own cars.', 'info');
          }
          async function query() {
            v.restart();
            st.clearPackets();
            draw();
            if (!glob()) {
              cap.set('Only local indexes: ask every partition', 'warn');
              const targets = [0, 1, 2].map((i) => (redOf(i) ? redOf(i).node : P[i].en[0]));
              await Promise.all(targets.map((t) => st.send(client, t, { label: 'red?', kind: 'info', dur: 750 })));
              const found = [];
              [0, 1, 2].forEach((i) => { const r = redOf(i); if (r) { r.node.set({ kind: 'good' }); found.push(...r.ids); } });
              await Promise.all(targets.map((t, i) => st.send(t, client, { label: redOf(i) ? redOf(i).ids.join(',') : 'none', kind: redOf(i) ? 'good' : 'neutral', dur: 750 })));
              sRead.set('3', 'bad');
              cap.set(`Scatter/gather over 3 partitions. Found ${found.sort((a, b) => a - b).join(', ')}.`, 'warn');
            } else {
              const r = redOf(termPart('red'));
              cap.set('"red" lives in the i–r index partition only', 'info');
              await st.send(client, r.node, { label: 'red?', kind: 'info', dur: 750 });
              r.node.set({ kind: 'good' });
              await st.send(r.node, client, { label: r.ids.join(','), kind: 'good', dur: 750 });
              sRead.set('1', 'good');
              const stale = added && !indexed7;
              cap.set(stale ? 'One partition read, but #7 is missing: the index lags.' : `One partition read. Found ${r.ids.join(', ')}.`, stale ? 'warn' : 'good');
            }
          }
          async function add() {
            if (added) { cap.set('Car #7 is already in. Press Reset to replay.', 'info'); return; }
            v.restart();
            st.clearPackets();
            added = true;
            if (!glob()) indexed7 = true;
            else pending = 16;
            await st.send(client, { x: P[2].cx, y: 120 + DOCS[2].length * 36 }, { label: '#7 red', kind: 'data', dur: 800 });
            draw();
            P[2].docs[P[2].docs.length - 1].flash();
            if (!glob()) {
              sWrite.set('1', 'good');
              cap.set('Doc and index entry share a partition: one write.', 'good');
              return;
            }
            sWrite.set('2', 'warn');
            cap.set('Doc stored. Its index entry is on another partition…', 'warn');
            if (P[1].ghost) await st.send(P[2].docs[P[2].docs.length - 1], P[1].ghost, { label: 'index +7', kind: 'warn', dur: 2600 });
          }
          // async index maintenance: applied on its own clock, even if you click around
          v.every(250, () => {
            if (pending <= 0) return;
            pending--;
            if (pending > 0) return;
            indexed7 = true;
            const r = redOf(1);
            if (P[1].ghost) { P[1].ghost.remove(); P[1].ghost = null; }
            if (r) { r.node.set({ label: 'red → ' + entriesOf(1).find((e) => e[0] === 'red')[1].join(','), kind: 'good' }); r.node.flash(); }
            P[1].entries = entriesOf(1);
            cap.set('The index caught up: #7 is findable now.', 'good');
          });
          reset();
        },
      },

      /* 6 ─────────────────────────────────────────────── */
      {
        title: 'hash mod N: add a node, move everything',
        lab: { id: 'partition', preset: 'mod-n' },
        caption: 'With hash mod N, changing N reassigns most keys, so rebalancing ships nearly all data. Mapping keys to many fixed partitions avoids that.',
        problem: 'Most keys move',
        fix: 'hash → fixed partition → node',
        demo(el, v) {
          const box = v.wrap(el);
          const mode = v.segmented(box, {
            options: [{ value: 'mod', label: 'hash mod N', kind: 'bad' }, { value: 'fixed', label: '24 fixed partitions', kind: 'good' }],
            value: 'mod',
            onChange: rebuild,
          });
          let N = 4;
          const slider = v.slider(box, { label: 'Nodes (N)', min: 3, max: 8, value: 4, onInput: (x) => change(x) });
          const st = v.stage(box, { w: 560, h: 196 });
          const stats = v.row(box, { center: true });
          const sMoved = v.stat(stats, 'keys moved', '–', 'info');
          const sIdeal = v.stat(stats, 'minimum needed', '–', 'info');
          const cap = v.caption(box, '');
          v.controls(box, [
            { label: 'Add a node', icon: '＋', kind: 'primary', onClick: () => { if (N < 8) { slider.set(N + 1); change(N + 1); } } },
            { label: 'Remove a node', icon: '−', onClick: () => { if (N > 3) { slider.set(N - 1); change(N - 1); } } },
          ]);
          const P = 24;
          const keys = Array.from({ length: 60 }, (_, i) => ({ h: hash16('key' + i), cx: 0, cy: 0, el: null }));
          let assign = [];
          const count = (upTo) => { const c = Array(upTo).fill(0); assign.forEach((a) => { if (a < upTo) c[a]++; }); return c; };
          function grow(n) { // add node index n (there were n nodes)
            const target = Math.floor(P / (n + 1));
            let mine = 0;
            while (mine < target) {
              const c = count(n);
              const donor = c.indexOf(Math.max(...c));
              const p = assign.lastIndexOf(donor);
              assign[p] = n;
              mine++;
            }
          }
          function shrink(n) { // remove node index n - 1
            const gone = n - 1;
            assign.forEach((a, p) => {
              if (a !== gone) return;
              const c = count(gone);
              assign[p] = c.indexOf(Math.min(...c));
            });
          }
          const nodeOf = (k) => (mode.get() === 'mod' ? k.h % N : assign[k.h % P]);
          function layout() {
            const colW = 540 / N, per = Math.max(1, Math.floor((colW - 14) / 17));
            const idx = Array(N).fill(0);
            return keys.map((k) => {
              const n = nodeOf(k), j = idx[n]++;
              return { x: 10 + n * colW + 14 + (j % per) * 17, y: 48 + Math.floor(j / per) * 17 };
            });
          }
          function frame() {
            st.clear();
            const colW = 540 / N;
            for (let n = 0; n < N; n++) {
              st.box(12 + n * colW, 24, colW - 4, 164, { kind: 'neutral' });
              st.text(12 + n * colW + (colW - 4) / 2, 12, 'N' + (n + 1), { size: 13, bold: true, kind: 'text2' });
            }
          }
          function dots(kinds) {
            keys.forEach((k, i) => { k.el = st.add('circle', { cx: k.cx, cy: k.cy, r: 6, class: 'vz-shape k-' + kinds[i], 'stroke-width': 1.5 }); });
          }
          function rebuild() {
            v.restart();
            st.clearPackets();
            assign = Array(P).fill(0);
            for (let n = 1; n < N; n++) grow(n);
            frame();
            layout().forEach((p, i) => { keys[i].cx = p.x; keys[i].cy = p.y; });
            dots(keys.map(() => 'data'));
            sMoved.set('–', 'info');
            sIdeal.set('–', 'info');
            cap.set(mode.get() === 'mod' ? 'Node = hash(key) mod N. Now change N.' : 'Key → one of 24 partitions → a node. Now change N.', 'info');
          }
          async function change(nn) {
            nn = Math.max(3, Math.min(8, nn));
            if (nn === N) return;
            v.restart();
            st.clearPackets();
            const a = N;
            const before = keys.map(nodeOf);
            if (mode.get() === 'fixed') { while (N < nn) { grow(N); N++; } while (N > nn) { shrink(N); N--; } } else N = nn;
            const after = keys.map(nodeOf);
            const movedF = after.map((n, i) => n !== before[i]);
            const moved = movedF.filter(Boolean).length;
            const ideal = Math.round((Math.abs(nn - a) / Math.max(nn, a)) * 60);
            frame();
            dots(movedF.map((m) => (m ? 'bad' : 'good')));
            sMoved.set(`${moved} / 60`, moved > ideal * 1.6 ? 'bad' : 'good');
            sIdeal.set(`≈ ${ideal}`, 'info');
            cap.set(`N ${a} → ${nn}: ${moved} of 60 keys moved (${Math.round((moved / 60) * 100)}%).`, moved > ideal * 1.6 ? 'bad' : 'good');
            const from = keys.map((k) => ({ x: k.cx, y: k.cy }));
            const to = layout();
            await v.tween(800, (t) => {
              keys.forEach((k, i) => {
                k.cx = from[i].x + (to[i].x - from[i].x) * t;
                k.cy = from[i].y + (to[i].y - from[i].y) * t;
                k.el.setAttribute('cx', k.cx);
                k.el.setAttribute('cy', k.cy);
              });
            });
          }
          rebuild();
        },
      },

      /* 7 ─────────────────────────────────────────────── */
      {
        title: 'Many partitions, move whole ones',
        lab: { id: 'partition', preset: 'mod-n', set: { place: 'hash' } },
        caption: 'Create far more partitions than nodes. A new node steals a few whole partitions from the others; no key ever changes partition.',
        tags: ['Riak', 'Elasticsearch', 'Couchbase', 'Voldemort'],
        demo(el, v) {
          const box = v.wrap(el);
          const st = v.stage(box, { w: 560, h: 226 });
          const SX = (i) => 8 + i * 92;
          const slots = [0, 1, 2, 3, 4, 5].map((i) => st.box(SX(i), 10, 86, 206, { label: 'free', kind: 'ghost' }));
          const pos = (n, j) => ({ x: SX(n) + 43 + (j % 2 ? 20 : -20), y: 58 + Math.floor(j / 2) * 40 });
          const parts = Array.from({ length: 12 }, (_, p) => st.node({ x: 0, y: 0, w: 36, h: 30, label: 'p' + p, size: 13 }));
          const stats = v.row(box, { center: true });
          const sNodes = v.stat(stats, 'nodes', '3', 'info');
          const sMoved = v.stat(stats, 'partitions moved', '0', 'info');
          v.stat(stats, 'keys re-hashed', '0', 'good');
          const cap = v.caption(box, '');
          v.controls(box, [
            { label: 'Add a node', icon: '＋', kind: 'primary', onClick: addNode },
            { label: 'Remove a node', icon: '−', onClick: removeNode },
            { label: 'Reset', icon: '↺', kind: 'ghost', onClick: reset },
          ]);
          let n = 3, assign = [], moved = 0;
          const counts = () => { const c = Array(n).fill(0); assign.forEach((a) => { if (a < n) c[a]++; }); return c; };
          const target = (p) => { const list = assign.map((a, q) => (a === assign[p] ? q : -1)).filter((q) => q >= 0); return pos(assign[p], list.indexOf(p)); };
          function paintSlots() {
            slots.forEach((s, i) => s.set({ kind: i < n ? 'neutral' : 'ghost', label: i < n ? 'Node ' + (i + 1) : 'free' }));
            sNodes.set(String(n), 'info');
            sMoved.set(String(moved), moved ? 'warn' : 'info');
          }
          function snap(animate) {
            return Promise.all(parts.map((node, p) => { const t = target(p); return node.moveTo(t.x, t.y, animate, 450); }));
          }
          function reset() {
            v.restart();
            st.clearPackets();
            n = 3;
            moved = 0;
            assign = parts.map((_, p) => p % 3);
            parts.forEach((node) => node.set({ kind: 'neutral' }));
            snap(false);
            paintSlots();
            cap.set('12 partitions on 3 nodes. The count of partitions never changes.', 'info');
          }
          async function run(list, msg) {
            paintSlots();
            parts.forEach((node, p) => node.set({ kind: list.includes(p) ? 'warn' : 'neutral' }));
            cap.set(msg, 'warn');
            for (const p of list) {
              const t = target(p);
              await parts[p].moveTo(t.x, t.y, true, 650);
              parts[p].set({ kind: 'good' });
            }
            await snap(true);
            cap.set('Only whole partitions moved. Every key kept its partition.', 'good');
          }
          async function addNode() {
            if (n >= 6) { cap.set('Six nodes is the max in this demo.', 'info'); return; }
            v.restart();
            st.clearPackets();
            snap(false);
            const nw = n++;
            const want = Math.floor(12 / n), list = [];
            while (list.length < want) {
              const c = counts().slice(0, nw);
              const donor = c.indexOf(Math.max(...c));
              const p = assign.lastIndexOf(donor);
              assign[p] = nw;
              list.push(p);
            }
            moved += list.length;
            await run(list, `Node ${n} joins and takes ${list.length} partitions from the others.`);
          }
          async function removeNode() {
            if (n <= 2) { cap.set('Keep at least two nodes.', 'info'); return; }
            v.restart();
            st.clearPackets();
            snap(false);
            const gone = --n;
            const list = [];
            assign.forEach((a, p) => {
              if (a !== gone) return;
              const c = counts();
              assign[p] = c.indexOf(Math.min(...c));
              list.push(p);
            });
            moved += list.length;
            await run(list, `Node ${gone + 1} leaves. Its ${list.length} partitions move to the others.`);
          }
          reset();
        },
      },

      /* 8 ─────────────────────────────────────────────── */
      {
        title: 'Split a partition when it grows too big',
        caption: 'Key-range stores start with one partition and split it in half once it passes a size limit. Halves can move to other nodes.',
        problem: 'Fixed boundaries guessed wrong',
        fix: 'Split on size (and pre-split)',
        tags: ['HBase', 'RethinkDB', 'MongoDB'],
        demo(el, v) {
          const box = v.wrap(el);
          const pre = v.toggle(box, { label: 'Pre-split into 3 at start', value: false, onChange: reset });
          const st = v.stage(box, { w: 560, h: 236 });
          const loads = v.bars(box, { items: [] });
          const cap = v.caption(box, '');
          v.controls(box, [
            { label: 'Write 4 keys', icon: '＋', kind: 'primary', onClick: write },
            { label: 'Reset', icon: '↺', kind: 'ghost', onClick: reset },
          ]);
          const LIMIT = 8;
          const NK = ['primary', 'info', 'good'];
          const kx = (k) => 20 + (k / 26) * 520;
          const letter = (k) => String.fromCharCode(65 + Math.max(0, Math.min(25, Math.floor(k))));
          let parts = [], writer;

          function draw() {
            st.clear();
            writer = st.node({ x: 280, y: 28, w: 110, h: 36, label: 'writes', kind: 'info', shape: 'pill' });
            st.line(20, 82, 540, 82, { kind: 'bad', dashed: true, width: 1.5, layer: 'top' });
            st.text(540, 70, 'size limit', { size: 12, anchor: 'end', kind: 'bad', bold: true });
            parts.forEach((p) => {
              const x = kx(p.lo) + 1, w = kx(p.hi) - kx(p.lo) - 2;
              st.rect(x, 82, w, 110, { kind: 'neutral', rx: 6 });
              const fh = (Math.min(LIMIT, p.keys.length) / LIMIT) * 106;
              if (fh > 0) st.rect(x + 2, 190 - fh, w - 4, fh, { kind: NK[p.node], rx: 4 });
              if (w > 22) st.text(x + w / 2, 206, 'N' + (p.node + 1), { size: 13, bold: true, kind: NK[p.node] });
              if (w > 56) st.text(x + w / 2, 224, letter(p.lo) + '–' + letter(p.hi - 1e-9), { size: 12, kind: 'muted', mono: true });
            });
          }
          function paintLoads() {
            const items = [0, 1, 2].map((i) => {
              const mine = parts.filter((p) => p.node === i);
              const k = mine.reduce((a, p) => a + p.keys.length, 0);
              return { label: 'N' + (i + 1), value: k, kind: k ? NK[i] : undefined, text: `${mine.length} part. · ${k} keys` };
            });
            loads.update(items, Math.max(8, ...items.map((x) => x.value)));
          }
          function splitPart(p) {
            const ks = p.keys.slice().sort((a, b) => a - b), h = Math.floor(ks.length / 2);
            const b = (ks[h - 1] + ks[h]) / 2;
            const i = parts.indexOf(p);
            const left = { lo: p.lo, hi: b, keys: ks.slice(0, h), node: p.node };
            const cnt = [0, 1, 2].map((nd) => parts.filter((q) => q !== p && q.node === nd).length + (nd === p.node ? 1 : 0));
            const right = { lo: b, hi: p.hi, keys: ks.slice(h), node: cnt.indexOf(Math.min(...cnt)) };
            parts.splice(i, 1, left, right);
            return right;
          }
          function reset() {
            v.restart();
            st.clearPackets();
            parts = pre.get()
              ? [{ lo: 0, hi: 9, keys: [], node: 0 }, { lo: 9, hi: 18, keys: [], node: 1 }, { lo: 18, hi: 26, keys: [], node: 2 }]
              : [{ lo: 0, hi: 26, keys: [], node: 0 }];
            draw();
            paintLoads();
            cap.set(pre.get() ? 'Pre-split: all three nodes take writes from the start.' : 'Empty database: one partition, so N1 takes every write.', 'info');
          }
          async function write() {
            v.restart();
            st.clearPackets();
            parts.filter((p) => p.keys.length > LIMIT).forEach(splitPart);
            draw();
            if (parts.reduce((a, p) => a + p.keys.length, 0) >= 72) { cap.set('The demo is full. Press Reset.', 'info'); return; }
            for (let i = 0; i < 4; i++) {
              const k = Math.random() * 26;
              const p = parts.find((q) => k >= q.lo && k < q.hi);
              p.keys.push(k);
              await st.send(writer, { x: kx(k), y: 78 }, { label: letter(k), kind: 'data', dur: 500 });
              if (p.keys.length > LIMIT) {
                const r = splitPart(p);
                cap.set(`Too big: split at ${letter(r.lo)}. The new half goes to N${r.node + 1}.`, 'warn');
              } else {
                cap.set(`Key ${letter(k)}… lands on N${p.node + 1}`, 'info');
              }
              draw();
              paintLoads();
            }
          }
          reset();
        },
      },

      /* 9 ─────────────────────────────────────────────── */
      {
        title: 'Partitions grow with the number of nodes',
        caption: 'Each node owns a fixed number of partitions. A joining node picks random split points, taking part of existing partitions.',
        tags: ['Cassandra', 'Ketama'],
        demo(el, v) {
          const box = v.wrap(el);
          let K = 3;
          v.slider(box, { label: 'Partitions per node', min: 2, max: 8, value: 3, onInput: (x) => { K = x; reset(); } });
          const st = v.stage(box, { w: 560, h: 300 });
          const stats = v.row(box, { center: true });
          const sParts = v.stat(stats, 'partitions', '6', 'info');
          const sBig = v.stat(stats, 'biggest share', '–', 'info');
          const cap = v.caption(box, '');
          v.controls(box, [
            { label: 'Add a node', icon: '＋', kind: 'primary', onClick: addNode },
            { label: 'Reset', icon: '↺', kind: 'ghost', onClick: reset },
          ]);
          const KINDS = ['primary', 'info', 'good', 'warn', 'data', 'neutral'];
          const CX = 150, CY = 150, R = 112;
          const pt = (f, r) => [CX + r * Math.sin(2 * Math.PI * f), CY - r * Math.cos(2 * Math.PI * f)];
          const arc = (f0, f1) => { const [x0, y0] = pt(f0, R), [x1, y1] = pt(f1, R); return `M${x0},${y0} A${R},${R} 0 ${f1 - f0 > 0.5 ? 1 : 0} 1 ${x1},${y1}`; };
          let tokens = [], nodes = 0;

          function ranges() {
            return tokens.map((t, i) => { const prev = tokens[(i - 1 + tokens.length) % tokens.length].pos; return { f0: prev, f1: t.pos > prev ? t.pos : t.pos + 1, node: t.node, fresh: t.fresh }; });
          }
          function draw() {
            st.clear();
            const rs = ranges();
            const share = Array(nodes).fill(0);
            rs.forEach((r) => { share[r.node] += r.f1 - r.f0; });
            const arcs = rs.map((r) => {
              const p = st.path(arc(r.f0, r.fresh ? r.f0 + 0.0001 : r.f1), { kind: KINDS[r.node] });
              p.el.style.strokeWidth = r.fresh ? '34px' : '28px';
              return { r, p };
            });
            tokens.forEach((t) => { const [x0, y0] = pt(t.pos, R - 20), [x1, y1] = pt(t.pos, R + 20); st.add('line', { x1: x0, y1: y0, x2: x1, y2: y1, style: 'stroke: var(--surface); stroke-width: 3' }); });
            st.text(CX, CY - 8, 'hash ring', { size: 13, kind: 'muted', bold: true });
            st.text(CX, CY + 12, `${tokens.length} partitions`, { size: 13, kind: 'muted' });
            const fair = 1 / nodes;
            for (let i = 0; i < nodes; i++) {
              const y = 40 + i * 42;
              st.text(318, y, 'N' + (i + 1), { size: 14, bold: true, kind: KINDS[i], anchor: 'start' });
              st.rect(350, y - 9, 150, 18, { kind: 'neutral', rx: 5 });
              st.rect(350, y - 9, Math.max(2, Math.min(1, share[i]) * 150), 18, { kind: KINDS[i], rx: 5 });
              st.text(508, y, Math.round(share[i] * 100) + '%', { size: 13, mono: true, bold: true, anchor: 'start', kind: 'text2' });
            }
            st.line(350 + fair * 150, 22, 350 + fair * 150, 40 + (nodes - 1) * 42 + 16, { kind: 'accent', dashed: true, width: 1.5, layer: 'top' });
            st.text(350 + fair * 150, 40 + (nodes - 1) * 42 + 30, 'fair share', { size: 12, kind: 'accent', bold: true });
            sParts.set(String(tokens.length), 'info');
            const mx = Math.max(...share);
            sBig.set(Math.round(mx * 100) + '%', mx > fair * 1.6 ? 'warn' : 'good');
            return arcs.filter((a) => a.r.fresh);
          }
          function reset() {
            v.restart();
            st.clearPackets();
            nodes = 2;
            tokens = [];
            for (let n = 0; n < 2; n++) for (let i = 0; i < K; i++) tokens.push({ pos: Math.random(), node: n });
            tokens.sort((a, b) => a.pos - b.pos);
            draw();
            cap.set(`2 nodes × ${K} partitions each, at random points on the ring.`, 'info');
          }
          async function addNode() {
            if (nodes >= 6) { cap.set('Six nodes is the max in this demo.', 'info'); return; }
            v.restart();
            st.clearPackets();
            tokens.forEach((t) => { t.fresh = false; });
            const n = nodes++;
            for (let i = 0; i < K; i++) tokens.push({ pos: Math.random(), node: n, fresh: true });
            tokens.sort((a, b) => a.pos - b.pos);
            const fresh = draw();
            cap.set(`N${n + 1} splits ${K} random partitions and takes one piece of each.`, 'good');
            await v.tween(700, (t) => fresh.forEach((a) => a.p.set({ d: arc(a.r.f0, a.r.f0 + (a.r.f1 - a.r.f0) * Math.max(0.0001, t)) })));
            tokens.forEach((t) => { t.fresh = false; });
          }
          reset();
        },
      },

      /* 10 ─────────────────────────────────────────────── */
      {
        title: 'Auto-rebalancing can snowball into an outage',
        caption: 'A slow node looks dead, so auto-rebalancing dumps its load on others, which then slow down too. A human in the loop helps.',
        problem: 'Cascading failure',
        fix: 'An operator approves moves',
        tags: ['Couchbase', 'Riak', 'Voldemort'],
        demo(el, v) {
          const box = v.wrap(el);
          const mode = v.segmented(box, {
            options: [{ value: 'auto', label: 'Fully automatic', kind: 'bad' }, { value: 'manual', label: 'Human approves', kind: 'good' }],
            value: 'auto',
            onChange: reset,
          });
          const st = v.stage(box, { w: 560, h: 250 });
          const NX = (i) => 80 + i * 133;
          const NAMES = ['A', 'B', 'C', 'D'];
          const nodes = NAMES.map((nm, i) => st.node({ x: NX(i), y: 50, w: 108, h: 50, label: 'Node ' + nm }));
          NAMES.forEach((_, i) => st.rect(NX(i) - 54, 92, 108, 14, { kind: 'neutral', rx: 5 }));
          const bars = NAMES.map((_, i) => st.rect(NX(i) - 54, 92, 1, 14, { kind: 'good', rx: 5 }));
          const pcts = NAMES.map((_, i) => st.text(NX(i), 124, '', { size: 14, bold: true, mono: true }));
          const brain = st.node({ x: 280, y: 212, w: 180, h: 52, kind: 'primary' });
          const stats = v.row(box, { center: true });
          const sUp = v.stat(stats, 'nodes serving', '4', 'good');
          const log = v.log(box, { title: 'events', max: 4 });
          const cap = v.caption(box, '');
          v.controls(box, [
            { label: 'Node B slows down', icon: '✱', kind: 'danger', onClick: run },
            { label: 'Reset', icon: '↺', kind: 'ghost', onClick: reset },
          ]);
          let base = [], extra = [], dead = [];
          const load = (i) => base[i] + extra[i];
          const auto = () => mode.get() === 'auto';

          function paint() {
            nodes.forEach((nd, i) => {
              const l = load(i);
              nd.set({ kind: dead[i] ? 'bad' : l >= 95 ? 'warn' : 'neutral', down: dead[i], sub: dead[i] ? 'declared dead' : l >= 95 ? 'too slow' : 'healthy' });
              bars[i].set({ w: dead[i] ? 1 : Math.min(108, (l / 100) * 108), kind: l >= 100 ? 'bad' : l >= 90 ? 'warn' : 'good' });
              pcts[i].set(dead[i] ? '–' : Math.round(l) + '%', l >= 95 ? 'bad' : 'text2');
            });
            const up = dead.filter((d) => !d).length;
            sUp.set(String(up), up === 4 ? 'good' : up ? 'warn' : 'bad');
          }
          function reset() {
            v.restart();
            st.clearPackets();
            base = [60, 60, 60, 60];
            extra = [0, 0, 0, 0];
            dead = [false, false, false, false];
            brain.set(auto() ? { label: 'Failure detector', sub: 'moves data by itself' } : { label: 'Operator', sub: 'approves every move' });
            log.clear();
            paint();
            cap.set('Four nodes at 60% load. Heartbeats flow to the detector.', 'info');
          }
          async function declare(i) {
            dead[i] = true;
            paint();
            log.add(`Node ${NAMES[i]}: missed heartbeats → dead`, 'bad');
            const rest = [0, 1, 2, 3].filter((j) => !dead[j]);
            await Promise.all(rest.map((j) => st.send(nodes[i], nodes[j], { label: 'data', kind: 'warn', dur: 900 })));
            // survivors inherit the victim's work, plus the cost of copying its data
            rest.forEach((j) => { base[j] += base[i] / rest.length; extra[j] = 15; });
            log.add(`Moved ${NAMES[i]}'s partitions to ${rest.map((j) => NAMES[j]).join(', ')}`, 'warn');
            paint();
          }
          async function run() {
            reset();
            extra[1] = 37;
            paint();
            log.add('Node B: traffic spike, replies slowly', 'warn');
            cap.set('Node B is overloaded. Its heartbeats arrive late.', 'warn');
            await v.sleep(1600);
            if (auto()) {
              cap.set('The detector cannot tell slow from dead. B is out.', 'bad');
              await declare(1);
              cap.set('A, C and D take B\'s load plus the transfer work…', 'warn');
              await v.sleep(1400);
              cap.set('Now C is too slow as well. Declared dead.', 'bad');
              await declare(2);
              await v.sleep(900);
              [0, 3].forEach((j) => { dead[j] = true; });
              paint();
              log.add('A and D overloaded: cluster down', 'bad');
              cap.set('Cascade: one slow node took down the whole cluster.', 'bad');
            } else {
              log.add('Suggested plan: move B\'s partitions', 'info');
              cap.set('The system only proposes a plan. A human looks first.', 'info');
              brain.flash();
              await v.sleep(1500);
              log.add('Operator: B is slow, not dead. Hold.', 'good');
              cap.set('Hold the plan. Moving data now would add load.', 'good');
              await v.sleep(1400);
              extra[1] = 15;
              paint();
              await v.sleep(900);
              extra[1] = 0;
              paint();
              log.add('Node B: spike over, back to 60%', 'good');
              cap.set('B recovered. Nothing moved, nothing cascaded.', 'good');
            }
          }
          v.every(1000, () => {
            nodes.forEach((nd, i) => { if (!dead[i] && load(i) < 95) st.send(nd, brain, { kind: 'good', dur: 700 }); });
          });
          reset();
        },
      },

      /* 11 ─────────────────────────────────────────────── */
      {
        title: 'Which node holds key "foo"?',
        caption: 'Requests reach the right node three ways: any node forwards, a routing tier, or a partition-aware client. ZooKeeper keeps everyone\'s map current.',
        problem: 'Stale partition map',
        fix: 'Coordination service (ZooKeeper)',
        tags: ['ZooKeeper', 'Helix', 'mongos', 'gossip'],
        demo(el, v) {
          const box = v.wrap(el);
          const top = v.row(box);
          const mode = v.segmented(top, {
            options: [{ value: 'any', label: 'Any node' }, { value: 'tier', label: 'Routing tier' }, { value: 'smart', label: 'Smart client' }],
            value: 'tier',
            onChange: reset,
          });
          const zk = v.toggle(top, { label: 'ZooKeeper notifies', value: true, onChange: (on) => { if (on) notify(); } });
          const st = v.stage(box, { w: 560, h: 300 });
          const client = st.node({ x: 70, y: 40, w: 110, h: 46, label: 'Client', kind: 'info' });
          const tier = st.node({ x: 300, y: 40, w: 150, h: 46, label: 'Routing tier', kind: 'primary' });
          const NX = [110, 280, 450];
          const nodes = NX.map((x, i) => st.node({ x, y: 156, w: 124, h: 52, label: 'Node ' + i }));
          const zkN = st.node({ x: 280, y: 262, w: 210, h: 54, label: 'ZooKeeper', shape: 'db', kind: 'warn' });
          nodes.forEach((n) => st.link(n, zkN, { dashed: true, thin: true, arrow: false }));
          const stats = v.row(box, { center: true });
          const sHops = v.stat(stats, 'network hops', '–', 'info');
          const sMap = v.stat(stats, 'routing map', 'fresh', 'good');
          const cap = v.caption(box, '');
          v.controls(box, [
            { label: 'get("foo")', icon: '▶', kind: 'primary', onClick: get },
            { label: 'Move foo\'s partition', icon: '⇄', onClick: move },
          ]);
          let actual = 2, view = 2;
          const who = () => (mode.get() === 'tier' ? 'routing tier' : mode.get() === 'smart' ? 'client' : 'nodes');

          function paint() {
            const m = mode.get();
            tier.show(m === 'tier');
            nodes.forEach((n, i) => n.set({ kind: i === actual ? 'good' : 'neutral', sub: i === actual ? 'has foo' : '' }));
            zkN.set({ sub: `foo's partition → node ${actual}` });
            tier.set({ sub: `thinks: node ${view}`, kind: view === actual ? 'primary' : 'bad' });
            client.set({ sub: m === 'smart' ? `thinks: node ${view}` : '', kind: m === 'smart' && view !== actual ? 'bad' : 'info' });
            sMap.set(view === actual ? 'fresh' : 'stale', view === actual ? 'good' : 'bad');
          }
          function reset() {
            v.restart();
            st.clearPackets();
            actual = 2;
            view = 2;
            sHops.set('–', 'info');
            paint();
            const m = mode.get();
            cap.set(m === 'any' ? 'Ask any node; it forwards if the key lives elsewhere.'
              : m === 'tier' ? 'A partition-aware router sends each request to the right node.'
                : 'The client itself knows which node owns which partition.', 'info');
          }
          async function get() {
            v.restart();
            st.clearPackets();
            paint();
            const m = mode.get();
            let hops = 0;
            const hop = async (a, b, label, kind) => { await st.send(a, b, { label, kind: kind || 'info', dur: 750 }); sHops.set(String(++hops), hops > 2 ? 'warn' : 'good'); };
            const path = [client];
            if (m === 'tier') { await hop(client, tier, 'get foo'); path.push(tier); }
            if (m === 'any') {
              const entry = (view + 1) % 3;
              await hop(client, nodes[entry], 'get foo');
              path.push(nodes[entry]);
              if (entry !== view) { cap.set(`Node ${entry} doesn't own foo; it forwards`, 'info'); }
            }
            const target = view;
            await hop(path[path.length - 1], nodes[target], m === 'any' ? 'fwd' : 'get foo');
            if (target !== actual) {
              nodes[target].set({ kind: 'bad', sub: 'not here!' });
              await st.send(nodes[target], path[path.length - 1], { label: 'error', kind: 'bad', dur: 750, drop: 0.8 });
              cap.set(`Sent to node ${target}, but foo moved. Stale map!`, 'bad');
              return;
            }
            let at = nodes[target];
            for (let i = path.length - 1; i >= 0; i--) { await st.send(at, path[i], { label: 'value', kind: 'good', dur: 650 }); at = path[i]; }
            cap.set(`Found foo on node ${target}: ${hops} hop${hops > 1 ? 's' : ''} out.`, 'good');
          }
          async function notify() {
            if (view === actual) return;
            const m = mode.get();
            const subs = m === 'tier' ? [tier] : m === 'smart' ? [client] : nodes;
            view = actual;
            await Promise.all(subs.map((s) => st.send(zkN, s, { label: 'new map', kind: 'warn', dur: 850 })));
            paint();
            cap.set(`ZooKeeper told the ${who()}. Routing is right again.`, 'good');
          }
          async function move() {
            v.restart();
            st.clearPackets();
            paint();
            const from = actual, to = (actual + 1) % 3;
            actual = to;
            cap.set(`Rebalancing: foo's partition moves node ${from} → ${to}`, 'warn');
            await st.send(nodes[from], nodes[to], { label: 'partition', kind: 'data', dur: 900 });
            paint();
            await st.send(nodes[to], zkN, { label: 'mine now', kind: 'warn', dur: 700 });
            if (zk.get()) await notify();
            else { paint(); cap.set(`Nobody told the ${who()}: it still says node ${view}.`, 'bad'); }
          }
          reset();
        },
      },

      /* 12 ─────────────────────────────────────────────── */
      {
        title: 'One query, many nodes at once',
        caption: 'Analytic MPP databases split one query into stages and partitions, run them in parallel on many nodes, then merge the partial results.',
        tags: ['Teradata', 'Redshift', 'Presto', 'Impala'],
        demo(el, v) {
          const box = v.wrap(el);
          let N = 1;
          v.slider(box, { label: 'Worker nodes', min: 1, max: 4, value: 1, onInput: (x) => { N = x; draw(); } });
          box.appendChild(v.h('div', { class: 'vz-mono vz-muted', style: { textAlign: 'center' } }, 'SELECT region, SUM(sales) FROM orders GROUP BY region'));
          const st = v.stage(box, { w: 560, h: 282 });
          const stats = v.row(box, { center: true });
          const sTime = v.stat(stats, 'time (ticks)', '–', 'info');
          const sBusy = v.stat(stats, 'workers busy', '–', 'info');
          const res = v.table(box, { cols: ['region', 'sum(sales)'], rows: [] });
          const cap = v.caption(box, '');
          v.controls(box, [{ label: 'Run query', icon: '▶', kind: 'primary', onClick: run }]);
          const BLOCKS = [{ EU: 12, US: 7 }, { EU: 5, US: 9 }, { EU: 8, US: 4 }, { EU: 3, US: 11 }, { EU: 9, US: 6 }, { EU: 7, US: 2 }, { EU: 4, US: 8 }, { EU: 6, US: 5 }];
          const XS = { 1: [280], 2: [170, 390], 3: [110, 280, 450], 4: [80, 213, 346, 479] };
          let coord, workers, blocks, mine;

          function draw() {
            v.restart();
            st.clearPackets();
            st.clear();
            coord = st.node({ x: 280, y: 32, w: 160, h: 46, label: 'Coordinator', sub: 'plans, then merges', kind: 'primary' });
            workers = XS[N].map((x, i) => st.node({ x, y: 116, w: 108, h: 46, label: 'Worker ' + (i + 1), sub: 'scan + sum' }));
            mine = XS[N].map(() => []);
            blocks = BLOCKS.map((_, b) => {
              const w = b % N, j = mine[w].length;
              mine[w].push(b);
              return st.rect(XS[N][w] + (j % 2 ? 4 : -48), 164 + Math.floor(j / 2) * 28, 44, 22, { kind: 'data', label: 'b' + (b + 1), size: 12 });
            });
            workers.forEach((wk) => st.link(coord, wk, { thin: true, dashed: true, arrow: false }));
            sTime.set('–', 'info');
            sBusy.set('–', 'info');
            res.update([]);
            cap.set(`${BLOCKS.length} data blocks spread over ${N} worker${N > 1 ? 's' : ''}.`, 'info');
          }
          async function run() {
            draw();
            let t = 0;
            cap.set('Stage 0: the coordinator sends the plan', 'info');
            await Promise.all(workers.map((w) => st.send(coord, w, { label: 'plan', kind: 'info', dur: 650 })));
            sBusy.set(String(N), N > 1 ? 'good' : 'info');
            cap.set('Stage 1: every worker scans its own blocks, in parallel', 'info');
            const partial = workers.map(() => ({ EU: 0, US: 0 }));
            const rounds = Math.max(...mine.map((m) => m.length));
            for (let r = 0; r < rounds; r++) {
              const now = mine.map((m) => m[r]);
              now.forEach((b) => { if (b != null) blocks[b].set({ kind: 'warn' }); });
              await v.sleep(420);
              now.forEach((b, w) => { if (b == null) return; blocks[b].set({ kind: 'good' }); partial[w].EU += BLOCKS[b].EU; partial[w].US += BLOCKS[b].US; });
              sTime.set(String(++t), 'info');
            }
            cap.set('Stage 2: partial sums go to the coordinator to merge', 'info');
            await Promise.all(workers.map((w, i) => st.send(w, coord, { label: `EU ${partial[i].EU}`, kind: 'good', dur: 750 })));
            sTime.set(String(++t), N > 1 ? 'good' : 'warn');
            const tot = partial.reduce((a, p) => ({ EU: a.EU + p.EU, US: a.US + p.US }), { EU: 0, US: 0 });
            res.update([{ cells: ['EU', String(tot.EU)], kind: 'good' }, { cells: ['US', String(tot.US)], kind: 'good' }]);
            coord.flash();
            cap.set(`${N} worker${N > 1 ? 's' : ''}: ${t} ticks. More nodes, shorter scan stage.`, N > 1 ? 'good' : 'warn');
          }
          draw();
        },
      },
    ],

    cheatsheet: [
      { term: 'Partition (shard)', text: 'Each record lives in exactly one. Spreads data and query load.', kind: 'primary' },
      { term: 'With replication', text: 'Each partition has a leader and followers on different nodes.', kind: 'info' },
      { term: 'Key-range partitioning', text: 'Sorted ranges: easy range scans, but hot-spot risk.', kind: 'data' },
      { term: 'Hash partitioning', text: 'Even spread; range queries must ask every partition.', kind: 'good' },
      { term: 'Compound key', text: 'Hash the first column, sort by the rest (Cassandra).', kind: 'info' },
      { term: 'Hot key', text: 'One key gets all traffic. Split it with a random suffix.', kind: 'bad' },
      { term: 'Local index', text: 'Per partition. Cheap writes, scatter/gather reads.', kind: 'warn' },
      { term: 'Global index', text: 'Partitioned by term. One-partition reads, async multi-partition writes.', kind: 'primary' },
      { term: 'hash mod N', text: 'Changing N moves almost every key. Avoid it.', kind: 'bad' },
      { term: 'Fixed partitions', text: 'Many more partitions than nodes; move whole partitions.', kind: 'good' },
      { term: 'Dynamic partitioning', text: 'Split when too big, merge when too small.', kind: 'data' },
      { term: 'Per-node partitions', text: 'A fixed count per node; joiners split random partitions.', kind: 'info' },
      { term: 'Request routing', text: 'Any node, a routing tier, or a smart client. ZooKeeper holds the map.', kind: 'primary' },
      { term: 'MPP', text: 'Analytic queries split into stages that run on many nodes.', kind: 'good' },
    ],

    quiz: [
      {
        q: 'Sensor readings are keyed by timestamp and partitioned by key range. What goes wrong?',
        options: ['Range scans become impossible', 'All current writes hit one partition', 'Keys get lost during rebalancing'],
        answer: 1,
        why: 'Every new reading is stamped "now", so today\'s partition takes all the writes.',
      },
      {
        q: 'What do you give up by partitioning on a hash of the key?',
        options: ['Efficient range queries over the key', 'Even data distribution', 'The ability to replicate'],
        answer: 0,
        why: 'Adjacent keys scatter, so a range scan must ask every partition.',
      },
      {
        q: 'A document-partitioned (local) secondary index makes which operation expensive?',
        options: ['Writing a document', 'Reading by primary key', 'Querying by the indexed field'],
        answer: 2,
        why: 'Each partition indexes only its own documents, so queries scatter to all and gather.',
      },
      {
        q: 'Why not assign keys to nodes with hash(key) mod N?',
        options: ['It spreads keys unevenly', 'Adding a node moves most keys', 'It needs a coordination service'],
        answer: 1,
        why: 'Going from N to N+1 nodes moves about N/(N+1) of the keys instead of 1/(N+1).',
      },
      {
        q: 'With a fixed number of partitions, what happens when a node joins?',
        options: ['Every key is re-hashed', 'Every partition splits in half', 'It takes whole partitions from existing nodes'],
        answer: 2,
        why: 'The key-to-partition mapping never changes; only partition-to-node assignments move.',
      },
    ],
  });
})();
