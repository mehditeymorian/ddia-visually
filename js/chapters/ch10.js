/* Chapter 10 — Batch processing */
(function () {
  'use strict';

  /* ---------- local helpers ---------- */
  // FNV-1a 32-bit string hash: real partition assignment by hash(key)
  function hash(str) {
    let h = 2166136261;
    for (const ch of String(str)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  // tiny seeded PRNG so a replay can be reproduced
  function rng(seed) {
    let s = (seed >>> 0) || 1;
    return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  }
  const lerp = (a, b, t) => a + (b - a) * t;
  const PK = ['info', 'warn', 'good']; // colour of reducer partition 0, 1, 2
  // collapse adjacent equal items into {k, n} runs (what `uniq -c` does)
  function runsOf(list) {
    const out = [];
    list.forEach((k) => { const r = out[out.length - 1]; if (r && r.k === k) r.n++; else out.push({ k, n: 1 }); });
    return out;
  }

  DDIA.chapter({
    id: 10,
    part: 3,
    title: 'Batch processing',
    short: 'Batch',
    tagline: 'Crunch huge fixed inputs, rerun at will',
    cards: [
      /* 1 ─────────────────────────────────────────────── */
      {
        title: 'Three ways to process data',
        caption: 'Services answer each request fast. Batch jobs crunch a big fixed input later. Stream jobs handle each event soon after it happens.',
        tags: ['REST API', 'Hadoop', 'Flink'],
        demo(el, v) {
          const box = v.wrap(el);
          const focus = v.segmented(box, {
            options: [{ value: 'svc', label: 'Service' }, { value: 'batch', label: 'Batch' }, { value: 'stream', label: 'Stream' }],
            value: 'batch',
            onChange: run,
          });
          const st = v.stage(box, { w: 560, h: 280 });
          const stats = v.row(box, { center: true });
          const sBy = v.stat(stats, 'judged by', '', 'primary');
          const sWhen = v.stat(stats, 'result arrives', '', 'info');
          const cap = v.caption(box, '');
          v.controls(box, [{ label: 'Replay the day', icon: '▶', kind: 'primary', onClick: run }]);
          const X0 = 130, X1 = 545;
          const LANES = [
            { id: 'svc', y: 100, name: 'Service', sub: 'online' },
            { id: 'batch', y: 170, name: 'Batch', sub: 'offline' },
            { id: 'stream', y: 240, name: 'Stream', sub: 'near-real-time' },
          ];
          const EV = [0.06, 0.17, 0.3, 0.42, 0.55, 0.66];
          const JOB = [0.76, 0.92];
          const LAG = 0.05;
          const INFO = {
            svc: ['latency', 'in ms', 'good', 'A user waits on every request, so each reply must be fast.', 'Six requests, six instant replies. Someone waited each time.'],
            batch: ['throughput', 'hours later', 'warn', 'Input piles up. One scheduled job crunches it all at once.', 'Six events, one result: the nightly job ran long after.'],
            stream: ['lag', 'seconds later', 'info', 'Each event is handled moments after it arrives.', 'Six events, six outputs, each a few seconds behind.'],
          };
          const xs = (f) => X0 + (X1 - X0) * f;
          function drawStatic() {
            st.clear();
            const f = focus.get();
            LANES.forEach((L) => {
              const on = L.id === f;
              if (on) st.box(6, L.y - 30, 548, 60, { kind: 'primary', rx: 12 });
              st.text(18, L.y - 8, L.name, { anchor: 'start', bold: true, kind: on ? 'primary' : 'text' });
              st.text(18, L.y + 11, L.sub, { anchor: 'start', size: 12, kind: 'muted' });
              st.line(X0, L.y, X1, L.y, { kind: 'muted', width: 1.2, dashed: true });
            });
            st.text(18, 40, 'Events', { anchor: 'start', bold: true, kind: 'data' });
            st.line(X0, 40, X1, 40, { kind: 'muted', width: 1.2 });
            st.text(X1, 16, 'one day →', { anchor: 'end', size: 12, kind: 'muted' });
          }
          async function run() {
            v.restart();
            st.clearPackets();
            drawStatic();
            const f = focus.get();
            const I = INFO[f];
            sBy.set(I[0], 'primary');
            sWhen.set(I[1], I[2]);
            cap.set(I[3], 'info');
            const cursor = st.line(X0, 26, X0, 268, { kind: 'accent', width: 1.5, layer: 'top' });
            const waiting = [];
            let ei = 0, si = 0, jobBar = null, done = false;
            await v.tween(4800, (t) => {
              cursor.set({ x1: xs(t), x2: xs(t) });
              while (ei < EV.length && t >= EV[ei]) {
                const ex = xs(EV[ei]);
                st.line(ex, 48, ex, 256, { kind: 'muted', dotted: true, width: 1 });
                st.add('circle', { cx: ex, cy: 40, r: 7, class: 'vz-shape k-data', 'stroke-width': 2 });
                st.rect(ex - 5, 89, 14, 22, { kind: 'good', rx: 4 });
                waiting.push(st.add('circle', { cx: ex, cy: 170, r: 7, class: 'vz-shape k-warn', 'stroke-width': 2 }));
                ei++;
              }
              while (si < EV.length && t >= EV[si] + LAG) {
                st.rect(xs(EV[si] + LAG) - 7, 229, 14, 22, { kind: 'data', rx: 4 });
                si++;
              }
              if (t >= JOB[0]) {
                if (!jobBar) jobBar = st.rect(xs(JOB[0]), 157, 2, 26, { kind: 'primary', rx: 5, label: '' });
                jobBar.set({ w: Math.max(2, xs(Math.min(t, JOB[1])) - xs(JOB[0])) });
              }
              if (t >= JOB[1] && !done) {
                done = true;
                jobBar.set({ label: 'job' });
                waiting.forEach((c) => c.setAttribute('class', 'vz-shape k-good'));
                st.rect(xs(JOB[1]) + 6, 159, 30, 22, { kind: 'good', rx: 4, label: 'out', size: 12 });
              }
            }, (t) => t);
            cap.set(I[4], f === 'batch' ? 'warn' : 'good');
          }
          run();
        },
      },

      /* 2 ─────────────────────────────────────────────── */
      {
        title: 'Top pages with one Unix pipeline',
        caption: 'Each tool does one small job. Chained with pipes, they turn a raw access log into a ranked report.',
        tags: ['awk', 'sort', 'uniq', 'head'],
        demo(el, v) {
          const box = v.wrap(el);
          const LOG = [
            ['10.0.0.7', '/home'], ['10.0.0.3', '/cart'], ['10.0.0.7', '/home'], ['10.0.0.9', '/docs'], ['10.0.0.3', '/home'],
            ['10.0.0.7', '/cart'], ['10.0.0.5', '/home'], ['10.0.0.9', '/cart'], ['10.0.0.3', '/about'], ['10.0.0.3', '/docs'],
          ];
          let field = 7;
          v.segmented(box, {
            options: [{ value: 7, label: 'Count pages ($7)' }, { value: 1, label: 'Count IPs ($1)' }],
            value: 7,
            onChange: (x) => { field = x; cmds[1].set({ label: 'awk $' + x }); sp.go(sp.index); },
          });
          const st = v.stage(box, { w: 560, h: 96 });
          const CMD = [['cat', 'read'], ['awk $7', 'pick key'], ['sort', 'group'], ['uniq -c', 'count'], ['sort -rn', 'rank'], ['head -3', 'top 3']];
          const cmds = CMD.map(([l, s], i) => st.node({ x: 48 + i * 93, y: 48, w: 80, h: 56, label: l, sub: s, mono: true }));
          for (let i = 0; i < 5; i++) st.link(cmds[i], cmds[i + 1], { thin: true });
          const row = v.row(box, { center: true });
          const sIn = v.stat(row, 'lines in', '10', 'info');
          const sOut = v.stat(row, 'lines out', '10', 'data');
          const tape = v.tape(box, []);
          function outputs() {
            const raw = LOG.map(([ip, url]) => ip + ' GET ' + url);
            const keys = LOG.map(([ip, url]) => (field === 1 ? ip : url));
            const sorted = keys.slice().sort();
            const runs = runsOf(sorted);
            const ranked = runs.slice().sort((a, b) => b.n - a.n);
            const fmt = (r) => r.n + ' ' + r.k;
            return [
              raw.map((t) => ({ text: t })),
              keys.map((t) => ({ text: t, kind: 'data' })),
              sorted.map((t) => ({ text: t, kind: runs.findIndex((r) => r.k === t) % 2 ? 'info' : 'data' })),
              runs.map((r) => ({ text: fmt(r), kind: 'good' })),
              ranked.map((r) => ({ text: fmt(r), kind: 'good' })),
              ranked.slice(0, 3).map((r) => ({ text: fmt(r), kind: 'primary' })),
            ];
          }
          async function render(i, animate) {
            st.clearPackets();
            cmds.forEach((n, j) => n.set({ kind: j < i ? 'good' : j === i ? 'primary' : 'neutral', dim: j > i }));
            const outs = outputs();
            if (animate && i > 0) {
              await st.send({ x: cmds[i - 1].x, y: 48 }, { x: cmds[i].x, y: 48 }, { label: 'lines', kind: 'data', dur: 550 });
              cmds[i].flash();
            }
            tape.set(outs[i]);
            sIn.set(String(i ? outs[i - 1].length : 10), 'info');
            sOut.set(String(outs[i].length), i === 5 ? 'primary' : 'data');
          }
          const sp = v.stepper(box, {
            steps: [
              'cat: stream the raw log, one request per line',
              'awk: print only one field, the key we count',
              { caption: 'sort: identical keys become neighbours', kind: 'info' },
              { caption: 'uniq -c: collapse each run of neighbours into a count', kind: 'good' },
              'sort -rn: order by count, biggest first',
              { caption: 'head -3: the report. The log file itself never changed.', kind: 'good' },
            ],
            render,
            delay: 1500,
          });
        },
      },

      /* 3 ─────────────────────────────────────────────── */
      {
        title: 'Out of RAM? Sort spills to disk',
        caption: 'A hash table must hold every distinct key in memory. Sorting works in chunks: sort, spill runs to disk, then merge.',
        problem: 'More keys than RAM',
        fix: 'Sort, spill, merge',
        tags: ['GNU sort', 'mergesort', 'SSTables'],
        demo(el, v) {
          const box = v.wrap(el);
          const top = v.row(box);
          const mode = v.segmented(top, {
            options: [{ value: 'hash', label: 'Hash table', kind: 'bad' }, { value: 'sort', label: 'Sort + spill', kind: 'good' }],
            value: 'hash',
            onChange: run,
          });
          let distinct = 9;
          v.slider(top, { label: 'Distinct keys', min: 3, max: 12, value: 9, onInput: (x) => { distinct = x; run(); } });
          const st = v.stage(box, { w: 560, h: 300 });
          const stats = v.row(box, { center: true });
          const sRam = v.stat(stats, 'RAM slots used', '0 / 6', 'info');
          const sDisk = v.stat(stats, 'runs on disk', '0', 'info');
          const sRes = v.stat(stats, 'result', '—', 'info');
          const cap = v.caption(box, '');
          v.controls(box, [{ label: 'Run', icon: '▶', kind: 'primary', onClick: run }]);
          const RAM = 6, N = 18, LET = 'ABCDEFGHIJKL';
          const inX = (i) => 12 + i * 30;
          const slotX = (j) => 22 + j * 41;
          const runX = (j) => 300 + j * 41;
          const runY = (c) => 96 + c * 42;
          const outX = (j) => 12 + j * 45;
          const inPt = (i) => ({ x: inX(i) + 13, y: 37 });
          const slotPt = (j) => ({ x: slotX(j) + 18, y: 126 });
          let input = [], inCells = [], slots = [], ramBox = null, diskBox = null;
          function makeInput(n) {
            const r = rng(11 + n * 7);
            const seq = LET.slice(0, n).split('');
            while (seq.length < N) seq.push(LET[Math.floor(Math.pow(r(), 1.8) * n)]);
            for (let i = seq.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [seq[i], seq[j]] = [seq[j], seq[i]]; }
            return seq;
          }
          function draw() {
            st.clear();
            input = makeInput(distinct);
            st.text(12, 13, 'input log · 18 lines · ' + distinct + ' distinct keys', { anchor: 'start', size: 12, kind: 'muted' });
            inCells = input.map((k, i) => st.rect(inX(i), 24, 26, 26, { kind: 'data', label: k, mono: true, rx: 5 }));
            ramBox = st.box(10, 66, 262, 104, { label: 'RAM · 6 slots', kind: 'primary', solid: true });
            diskBox = st.box(288, 66, 262, 160, { label: 'Disk', kind: 'neutral' });
            slots = Array.from({ length: RAM }, (_, j) => st.rect(slotX(j), 108, 36, 36, { kind: 'ghost', label: '', mono: true, rx: 6 }));
            st.text(12, 244, 'output: key · count', { anchor: 'start', size: 12, kind: 'muted' });
          }
          function showOutput(list) {
            list.forEach((r, j) => st.rect(outX(j), 256, 40, 30, { kind: 'good', label: r.k + '·' + r.n, mono: true, rx: 5, size: 12 }));
          }
          async function run() {
            v.restart();
            st.clearPackets();
            draw();
            sRam.set('0 / 6', 'info');
            sDisk.set('0', 'info');
            sRes.set('…', 'info');
            if (mode.get() === 'hash') await runHash();
            else await runSort();
          }
          async function runHash() {
            diskBox.set({ label: 'Disk · unused' });
            cap.set('Count with a hash table: one RAM slot per distinct key', 'info');
            const table = new Map();
            for (let i = 0; i < N; i++) {
              const k = input[i];
              inCells[i].set({ kind: 'primary' });
              if (!table.has(k) && table.size >= RAM) {
                await st.send(inPt(i), { x: 141, y: 120 }, { label: k, kind: 'bad', drop: 0.8, dur: 500 });
                ramBox.set({ kind: 'bad', label: 'RAM · full ✕' });
                inCells[i].set({ kind: 'bad' });
                sRes.set('crashed', 'bad');
                cap.set(`Key ${k} needs a 7th slot. Out of memory!`, 'bad');
                return;
              }
              if (!table.has(k)) table.set(k, { n: 0, j: table.size });
              const e = table.get(k);
              e.n++;
              await st.send(inPt(i), slotPt(e.j), { label: k, kind: 'data', dur: 300 });
              slots[e.j].set({ kind: 'data', label: k + '·' + e.n });
              inCells[i].set({ kind: 'neutral', opacity: 0.35 });
              sRam.set(table.size + ' / 6', table.size >= RAM ? 'warn' : 'info');
            }
            const out = [...table.entries()].map(([k, e]) => ({ k, n: e.n })).sort((a, b) => (a.k < b.k ? -1 : 1));
            showOutput(out);
            sRes.set('✓ counted', 'good');
            cap.set('Few distinct keys: the table fits in RAM. Fast and simple.', 'good');
          }
          async function runSort() {
            diskBox.set({ label: 'Disk · sorted runs' });
            const runs = [];
            for (let c = 0; c * RAM < N; c++) {
              const chunk = input.slice(c * RAM, c * RAM + RAM);
              cap.set(`Read the next ${chunk.length} lines into RAM`, 'info');
              for (let j = 0; j < chunk.length; j++) {
                inCells[c * RAM + j].set({ kind: 'primary' });
                await st.send(inPt(c * RAM + j), slotPt(j), { label: chunk[j], kind: 'data', dur: 220 });
                slots[j].set({ kind: 'data', label: chunk[j] });
                inCells[c * RAM + j].set({ kind: 'neutral', opacity: 0.35 });
                sRam.set((j + 1) + ' / 6', 'info');
              }
              cap.set('RAM full: sort this chunk in memory', 'primary');
              await v.sleep(300);
              const sorted = chunk.slice().sort();
              sorted.forEach((k, j) => slots[j].set({ kind: 'primary', label: k }));
              await v.sleep(400);
              cap.set(`Spill sorted run ${c + 1} to disk and free the RAM`, 'warn');
              await st.send({ x: 141, y: 126 }, { x: 420, y: runY(c) + 15 }, { label: 'run ' + (c + 1), kind: 'warn', dur: 550 });
              runs.push(sorted);
              sorted.forEach((k, j) => st.rect(runX(j), runY(c), 36, 30, { kind: 'warn', label: k, mono: true, rx: 5 }));
              slots.forEach((s) => s.set({ kind: 'ghost', label: '' }));
              sRam.set('0 / 6', 'good');
              sDisk.set(String(runs.length), 'warn');
            }
            cap.set('Merge the sorted runs: equal keys arrive side by side', 'primary');
            // real k-way merge of the runs, counting adjacent equal keys
            const ptr = runs.map(() => 0);
            const merged = [];
            for (;;) {
              let best = -1;
              runs.forEach((r, i) => { if (ptr[i] < r.length && (best < 0 || r[ptr[i]] < runs[best][ptr[best]])) best = i; });
              if (best < 0) break;
              const k = runs[best][ptr[best]++];
              const last = merged[merged.length - 1];
              if (last && last.k === k) last.n++;
              else merged.push({ k, n: 1 });
            }
            for (let j = 0; j < merged.length; j++) {
              await st.send({ x: 420, y: 150 }, { x: outX(j) + 20, y: 271 }, { label: merged[j].k, kind: 'good', dur: 260 });
              st.rect(outX(j), 256, 40, 30, { kind: 'good', label: merged[j].k + '·' + merged[j].n, mono: true, rx: 5, size: 12 });
            }
            sRes.set('✓ counted', 'good');
            cap.set(`${merged.length} distinct keys counted with only 6 RAM slots`, 'good');
          }
          run();
        },
      },

      /* 4 ─────────────────────────────────────────────── */
      {
        title: 'One plug shape fits every tool',
        caption: 'Unix tools all read and write lines of text on stdin and stdout, so the shell can wire any tool to any other.',
        problem: 'Every tool invents a format',
        fix: 'Uniform interface',
        tags: ['stdin', 'stdout', 'pipes'],
        demo(el, v) {
          const box = v.wrap(el);
          const top = v.row(box);
          const uni = v.toggle(top, { label: 'Uniform text interface', value: false, onChange: run });
          v.controls(top, [
            { label: 'Run', icon: '▶', kind: 'primary', onClick: run },
            { label: 'Rewire', icon: '⇄', onClick: () => { pi = (pi + 1) % PIPES.length; run(); } },
          ]);
          const st = v.stage(box, { w: 560, h: 128 });
          const stats = v.row(box, { center: true });
          const sConv = v.stat(stats, 'converters needed', '', 'bad');
          v.stat(stats, 'tool code edits', '0', 'good');
          v.stat(stats, 'input file edits', '0', 'good');
          const tbl = v.table(box, { cols: ['pipe', 'what flows through it'], rows: [] });
          const cap = v.caption(box, '');
          const INPUT = ['ann /home', 'bob /cart', 'ann /home', 'cy /cart', 'bob /docs', 'ann /cart'];
          const TOOLS = {
            'cut -f1': { fmt: 'CSV', fn: (a) => a.map((l) => l.split(' ')[0]) },
            'cut -f2': { fmt: 'CSV', fn: (a) => a.map((l) => l.split(' ')[1]) },
            'grep cart': { fmt: 'JSON', fn: (a) => a.filter((l) => l.includes('cart')) },
            'sort': { fmt: 'binary', fn: (a) => a.slice().sort() },
            'uniq -c': { fmt: 'XML', fn: (a) => runsOf(a).map((r) => r.n + ' ' + r.k) },
            'head -2': { fmt: 'YAML', fn: (a) => a.slice(0, 2) },
          };
          const PIPES = [['cut -f2', 'sort', 'uniq -c'], ['grep cart', 'cut -f1', 'sort'], ['cut -f1', 'sort', 'uniq -c'], ['sort', 'uniq -c', 'head -2']];
          let pi = 0;
          async function run() {
            v.restart();
            st.clearPackets();
            st.clear();
            const u = uni.get();
            const pipe = PIPES[pi];
            const src = st.node({ x: 50, y: 44, w: 88, h: 56, shape: 'doc', label: 'access.log', size: 13, sub: 'text', kind: 'data' });
            const tools = pipe.map((t, i) => st.node({ x: 165 + i * 119, y: 44, w: 96, h: 56, label: t, mono: true, size: 14, sub: u ? 'text → text' : TOOLS[t].fmt + ' only', kind: u ? 'good' : 'neutral' }));
            const scr = st.node({ x: 514, y: 44, w: 80, h: 56, label: 'screen', sub: 'text' });
            const chain = [src, ...tools, scr];
            const fmts = ['text', ...pipe.map((t) => TOOLS[t].fmt), 'text'];
            const okAt = (i) => u || fmts[i] === fmts[i + 1];
            let bad = 0;
            for (let i = 0; i < chain.length - 1; i++) {
              if (!okAt(i)) bad++;
              st.link(chain[i], chain[i + 1], { kind: okAt(i) ? 'good' : 'bad', label: okAt(i) ? '' : '✕' });
            }
            st.text(280, 108, 'cat access.log | ' + pipe.join(' | '), { mono: true, size: 13, kind: 'text2' });
            sConv.set(String(bad), bad ? 'bad' : 'good');
            let data = INPUT.slice();
            const rows = [{ cells: ['access.log', data.join(' · ')], kind: 'data' }];
            tbl.update(rows);
            cap.set(u ? 'Every pipe carries plain lines of text' : 'Each tool reads and writes its own format', 'info');
            for (let i = 0; i < chain.length - 1; i++) {
              if (!okAt(i)) {
                await st.send(chain[i], chain[i + 1], { label: fmts[i], kind: 'bad', drop: true, dur: 700 });
                const who = i + 1 < chain.length - 1 ? pipe[i] : 'screen';
                rows.push({ cells: ['into ' + who, fmts[i] + ' it cannot parse ✕'], kind: 'bad' });
                tbl.update(rows);
                cap.set(`${who} cannot read ${fmts[i]}. Write yet another converter?`, 'bad');
                return;
              }
              await st.send(chain[i], chain[i + 1], { label: 'lines', kind: 'data', dur: 550 });
              if (i < pipe.length) {
                data = TOOLS[pipe[i]].fn(data);
                rows.push({ cells: ['after ' + pipe[i], data.join(' · ')] });
                tbl.update(rows);
              }
            }
            rows[0].cells[0] = 'access.log ✓ unchanged';
            tbl.update(rows);
            cap.set('Same tools, new wiring. Peek at any pipe; input untouched.', 'good');
          }
          run();
        },
      },

      /* 5 ─────────────────────────────────────────────── */
      {
        title: 'HDFS: many disks, one filesystem',
        caption: 'Files are split into blocks, each copied to several machines. The NameNode tracks where every block lives, so one dead machine loses nothing.',
        problem: 'A machine dies',
        fix: 'Replicate every block',
        tags: ['HDFS', 'GFS', 'Amazon S3'],
        demo(el, v) {
          const box = v.wrap(el);
          const rfSeg = v.segmented(box, {
            options: [{ value: 1, label: '1 copy per block', kind: 'bad' }, { value: 3, label: '3 copies per block', kind: 'good' }],
            value: 1,
            onChange: reset,
          });
          v.controls(box, [
            { label: 'Kill a machine', icon: '✕', kind: 'danger', onClick: kill },
            { label: 'Read file', icon: '▶', kind: 'primary', onClick: read },
            { label: 'Run mappers', icon: '⚙', onClick: mappers },
            { label: 'Reset', icon: '↺', kind: 'ghost', onClick: reset },
          ]);
          const st = v.stage(box, { w: 560, h: 262 });
          const tbl = v.table(box, { cols: ['block', 'stored on', 'status'], rows: [] });
          const cap = v.caption(box, '');
          const MX = [62, 171, 280, 389, 498], MY = 198;
          const BK = ['data', 'info', 'warn', 'primary'];
          const PLACE = { 1: [[0], [3], [2], [4]], 3: [[0, 1, 2], [1, 3, 4], [0, 2, 3], [2, 4, 0]] };
          let alive = [], reps = [], client = null, nn = null;
          const held = (m) => reps.map((ms, b) => (ms.includes(m) ? b : -1)).filter((b) => b >= 0);
          const slot = (m, k) => ({ x: MX[m] - 42 + (k % 2) * 46, y: MY - 20 + Math.floor(k / 2) * 30 });
          const slotC = (m, b) => { const p = slot(m, held(m).indexOf(b)); return { x: p.x + 19, y: p.y + 12 }; };
          const liveOf = (b) => reps[b].filter((m) => alive[m]);
          function paint() {
            st.clear();
            client = st.node({ x: 52, y: 44, w: 50, h: 50, shape: 'person', label: 'Client', kind: 'info' });
            nn = st.node({ x: 300, y: 48, w: 176, h: 52, label: 'NameNode', sub: 'block → machines', kind: 'primary' });
            st.text(145, 18, 'one file', { size: 12, kind: 'muted' });
            BK.forEach((k, b) => st.rect(94 + b * 26, 30, 24, 22, { kind: k, label: 'B' + (b + 1), size: 12, rx: 4 }));
            MX.forEach((x, m) => {
              st.line(300, 74, x, MY - 52, { kind: 'muted', dotted: true, width: 1 });
              const r = st.rect(x - 48, MY - 52, 96, 106, { kind: alive[m] ? 'neutral' : 'bad', rx: 10 });
              if (!alive[m]) r.set({ opacity: 0.55 });
              st.text(x, MY - 36, 'Node ' + (m + 1) + (alive[m] ? '' : ' ✕'), { size: 13, bold: true, kind: alive[m] ? 'text' : 'bad' });
              held(m).forEach((b, k) => {
                const p = slot(m, k);
                st.rect(p.x, p.y, 38, 24, { kind: alive[m] ? BK[b] : 'ghost', label: 'B' + (b + 1), size: 12, rx: 5 });
              });
            });
            const rf = rfSeg.get();
            tbl.update(reps.map((ms, b) => {
              const live = liveOf(b).length;
              const status = live ? { text: live + ' live cop' + (live > 1 ? 'ies' : 'y'), kind: live >= rf ? 'good' : 'warn' } : { text: 'LOST', kind: 'bad' };
              return { cells: ['B' + (b + 1), ms.map((m) => 'Node ' + (m + 1) + (alive[m] ? '' : ' ✕')).join(', '), status] };
            }));
          }
          function reset() {
            v.restart();
            st.clearPackets();
            alive = [true, true, true, true, true];
            reps = PLACE[rfSeg.get()].map((a) => a.slice());
            paint();
            cap.set('One file, 4 blocks, spread over 5 machines. Try killing one.', 'info');
          }
          async function kill() {
            v.restart();
            st.clearPackets();
            const idx = MX.map((_, m) => m);
            const withData = idx.filter((m) => alive[m] && held(m).length);
            const pool = withData.length ? withData : idx.filter((m) => alive[m]);
            if (!pool.length) { cap.set('Every machine is already dead. Press Reset.', 'bad'); return; }
            const m = pool[Math.floor(Math.random() * pool.length)];
            const wasLost = reps.map((_, b) => !liveOf(b).length);
            alive[m] = false;
            paint();
            const lost = reps.map((_, b) => b).filter((b) => !liveOf(b).length && !wasLost[b]);
            if (lost.length) {
              cap.set(`Node ${m + 1} died with the only copy of ${lost.map((b) => 'B' + (b + 1)).join(', ')}. Lost.`, 'bad');
              return;
            }
            const rf = rfSeg.get();
            if (!held(m).length) { cap.set(`Node ${m + 1} died. It held no blocks.`, 'warn'); return; }
            cap.set(`Node ${m + 1} died, but its blocks have other copies.`, 'warn');
            await v.sleep(800);
            const moves = [];
            reps.forEach((ms, b) => {
              let live = liveOf(b).length;
              while (live > 0 && live < rf) {
                const target = idx.filter((x) => alive[x] && !ms.includes(x) && held(x).length < 4).sort((a, c) => held(a).length - held(c).length)[0];
                if (target == null) break;
                const from = slotC(liveOf(b)[0], b);
                ms.push(target);
                moves.push({ b, from, to: { x: MX[target], y: MY - 30 } });
                live++;
              }
            });
            if (!moves.length) { cap.set('Not enough live machines left to re-replicate.', 'warn'); return; }
            cap.set('NameNode notices and re-copies the missing replicas', 'primary');
            await Promise.all(moves.map((mv, i) => v.sleep(i * 120).then(() => st.send(mv.from, mv.to, { label: 'B' + (mv.b + 1), kind: BK[mv.b], dur: 800 }))));
            paint();
            cap.set('Back to ' + rf + ' copies of every block. Nothing lost.', 'good');
          }
          async function read() {
            v.restart();
            st.clearPackets();
            paint();
            cap.set('Client asks the NameNode where the blocks are', 'info');
            await st.send(client, nn, { label: 'where?', kind: 'info', dur: 600 });
            await st.send(nn, client, { label: 'block map', kind: 'primary', dur: 600 });
            const lost = reps.map((_, b) => b).filter((b) => !liveOf(b).length);
            cap.set('Then it reads each block straight from a machine', 'info');
            await Promise.all(reps.map((_, b) => {
              const live = liveOf(b);
              if (!live.length) return Promise.resolve();
              return v.sleep(b * 160).then(() => st.send(slotC(live[0], b), client, { label: 'B' + (b + 1), kind: BK[b], dur: 850 }));
            }));
            if (lost.length) cap.set(`Read failed: ${lost.map((b) => 'B' + (b + 1)).join(', ')} has no live copy.`, 'bad');
            else cap.set('All 4 blocks read. The file is whole.', 'good');
          }
          async function mappers() {
            v.restart();
            st.clearPackets();
            paint();
            cap.set('Scheduler ships the map code to where each block lives', 'info');
            const res = await Promise.all(reps.map((_, b) => {
              const live = liveOf(b);
              if (!live.length) return Promise.resolve(false);
              const p = slotC(live[0], b);
              return v.sleep(b * 150).then(() => st.send(nn, p, { label: 'code', kind: 'primary', dur: 800 })).then(() => {
                st.rect(p.x - 19, p.y - 12, 38, 24, { kind: 'good', label: 'M' + (b + 1), size: 12, rx: 5, layer: 'top' });
                return true;
              });
            }));
            if (res.every(Boolean)) cap.set('Each mapper reads its block from local disk. No network copy.', 'good');
            else cap.set('A lost block means its mapper has nothing to read.', 'bad');
          }
          reset();
        },
      },

      /* 6 ─────────────────────────────────────────────── */
      {
        title: 'MapReduce: map, shuffle, sort, reduce',
        caption: 'Mappers emit (word, 1). hash(word) picks the reducer, which receives its keys sorted and adds them up: GROUP BY across machines.',
        problem: 'Random reducer choice',
        fix: 'Partition by hash(key)',
        tags: ['Hadoop', 'MongoDB', 'CouchDB'],
        demo(el, v) {
          const box = v.wrap(el);
          const mode = v.segmented(box, {
            options: [{ value: 'hash', label: 'hash(word) % 2', kind: 'good' }, { value: 'rand', label: 'Random reducer', kind: 'bad' }],
            value: 'hash',
            onChange: () => sp.go(sp.index),
          });
          const st = v.stage(box, { w: 560, h: 380 });
          const cap = v.caption(box, '');
          const BLOCKS = [['the', 'cat', 'sat'], ['the', 'dog', 'ran'], ['cat', 'ran', 'the']];
          const MXS = [95, 280, 465], RXS = [165, 395];
          function model() {
            const rand = mode.get() === 'rand';
            const maps = BLOCKS.map((ws, m) => ws.map((w, j) => ({ w, j, r: rand ? (m + j) % 2 : hash(w) % 2 })));
            const red = [0, 1].map((r) => {
              const all = [];
              maps.forEach((ps) => ps.filter((p) => p.r === r).forEach((p) => all.push(p.w)));
              return runsOf(all.sort());
            });
            const inR1 = new Set(red[1].map((g) => g.k));
            const split = red[0].map((g) => g.k).filter((k) => inR1.has(k));
            return { maps, red, split };
          }
          function pairPos(m, p, ps, i) {
            const mx = MXS[m];
            if (i <= 1) return { x: mx - 31, y: 118 + p.j * 26 };
            const col = ps.filter((q) => q.r === p.r);
            const ordered = i >= 3 ? col.slice().sort((a, b) => (a.w < b.w ? -1 : a.w > b.w ? 1 : a.j - b.j)) : col;
            return { x: mx + (p.r ? 36 : -36) - 31, y: 118 + ordered.indexOf(p) * 26 };
          }
          async function render(i, animate) {
            const M = model();
            const rand = mode.get() === 'rand';
            const C = [
              ['Each mapper runs on the machine that stores its block', 'info'],
              ['Map: every word becomes a (word, 1) pair', 'info'],
              rand ? ['Random partitioning: copies of one word part ways', 'bad'] : ['Partition: hash(word) % 2 picks the reducer', 'primary'],
              ['Each mapper sorts its partitions by key on local disk', 'info'],
              ['Shuffle: each reducer fetches its partition from every mapper', 'primary'],
              ['Reducers merge the sorted runs: equal words sit together', 'info'],
              rand ? [`${M.split.map((w) => '"' + w + '"').join(' and ')} split across reducers. Wrong totals!`, 'bad'] : ['Sum each group, write to HDFS. Every count is right.', 'good'],
            ];
            cap.set(C[i][0], C[i][1]);
            st.clear();
            const blocks = BLOCKS.map((ws, m) => st.node({ x: MXS[m], y: 30, w: 150, h: 38, shape: 'doc', label: ws.join(' '), mono: true, size: 14, kind: 'data' }));
            const maps = MXS.map((x, m) => st.node({ x, y: 82, w: 110, h: 32, label: 'Map ' + (m + 1), kind: i >= 1 ? 'primary' : 'neutral' }));
            blocks.forEach((b, m) => st.link(b, maps[m], { thin: true }));
            const count = [0, 1].map((r) => M.maps.reduce((s, ps) => s + ps.filter((p) => p.r === r).length, 0));
            const reds = RXS.map((x, r) => st.node({ x, y: 256, w: 150, h: 44, label: 'Reducer ' + r, kind: PK[r], sub: i >= 4 && !(animate && i === 4) ? count[r] + ' pairs in' : 'waiting' }));
            if (i >= 3) MXS.forEach((x) => st.text(x, 206, 'sorted, local disk', { size: 12, kind: 'muted' }));
            function drawPairs(layout, colorStep) {
              const out = [];
              M.maps.forEach((ps, m) => ps.forEach((p) => {
                const pos = pairPos(m, p, ps, layout);
                const r = st.rect(pos.x, pos.y, 62, 22, { kind: colorStep >= 2 ? PK[p.r] : 'data', label: p.w + ' 1', mono: true, size: 12, rx: 5 });
                if (i >= 4) r.set({ opacity: 0.45 });
                out.push({ r, m, p, ps });
              }));
              return out;
            }
            function drawReduce(showOut) {
              M.red.forEach((groups, r) => groups.forEach((g, k) => {
                const y = 292 + k * 22;
                st.rect(RXS[r] - 95, y, 110, 20, { kind: PK[r], label: g.k + ' ' + Array(g.n).fill(1).join(' '), mono: true, size: 12, rx: 5 });
                if (showOut) {
                  st.text(RXS[r] + 23, y + 10, '→', { size: 13, kind: 'muted' });
                  st.rect(RXS[r] + 32, y, 64, 20, { kind: M.split.includes(g.k) ? 'bad' : 'good', label: g.k + ' ' + g.n, mono: true, size: 12, rx: 5 });
                }
              }));
            }
            let rs = null;
            if (i >= 1 && !(animate && i === 1)) rs = drawPairs(animate && (i === 2 || i === 3) ? i - 1 : i, i);
            if (i >= 5 && !(animate && i === 5)) drawReduce(i >= 6 && !(animate && i === 6));
            if (!animate) return;
            if (i === 0) {
              await Promise.all(blocks.map((b) => { b.flash(); return v.sleep(300); }));
            } else if (i === 1) {
              await Promise.all(blocks.map((b, m) => st.send(b, maps[m], { label: 'read', kind: 'data', dur: 600 })));
              drawPairs(1, 1);
            } else if (i === 2 || i === 3) {
              const from = rs.map((o) => pairPos(o.m, o.p, o.ps, i - 1));
              const to = rs.map((o) => pairPos(o.m, o.p, o.ps, i));
              await v.tween(750, (t) => rs.forEach((o, k) => o.r.set({ x: lerp(from[k].x, to[k].x, t), y: lerp(from[k].y, to[k].y, t) })));
            } else if (i === 4) {
              const jobs = [];
              M.maps.forEach((ps, m) => [0, 1].forEach((r) => {
                const words = ps.filter((p) => p.r === r).map((p) => p.w).sort();
                if (!words.length) return;
                jobs.push(v.sleep(m * 140).then(() => st.send({ x: MXS[m] + (r ? 36 : -36), y: 150 }, reds[r], { label: words.join(','), kind: PK[r], dur: 900 })));
              }));
              await Promise.all(jobs);
              reds.forEach((n, r) => n.set({ sub: count[r] + ' pairs in' }));
            } else if (i === 5) {
              await v.sleep(250);
              drawReduce(false);
            } else if (i === 6) {
              drawReduce(false);
              await Promise.all(reds.map((n) => { n.flash(); return v.sleep(350); }));
              drawReduce(true);
            }
          }
          const sp = v.stepper(box, { steps: ['', '', '', '', '', '', ''], caption: false, render, delay: 1800 });
        },
      },

      /* 7 ─────────────────────────────────────────────── */
      {
        title: 'Join by shuffling matching IDs together',
        caption: 'Key both inputs by user ID. The shuffle brings each user\'s profile and clicks to one reducer; secondary sort puts the profile first.',
        problem: 'Buffering and hot keys',
        fix: 'Secondary sort, skewed join',
        tags: ['Hive', 'Pig', 'Crunch'],
        demo(el, v) {
          const box = v.wrap(el);
          const mode = v.segmented(box, {
            options: [
              { value: 0, label: '① Plain', kind: 'bad' },
              { value: 1, label: '② + Secondary sort' },
              { value: 2, label: '③ + Spread hot key', kind: 'good' },
            ],
            value: 0,
            onChange: run,
          });
          const st = v.stage(box, { w: 560, h: 316 });
          const stats = v.row(box, { center: true });
          const sBuf = v.stat(stats, 'clicks held in RAM', '0', 'info');
          const sMax = v.stat(stats, 'busiest reducer', '—', 'info');
          const sOut = v.stat(stats, 'joined rows', '0', 'info');
          const cap = v.caption(box, '');
          v.controls(box, [{ label: 'Run join', icon: '▶', kind: 'primary', onClick: run }]);
          const AGE = { 1: 31, 2: 25, 3: 47, 4: 38 };
          const CLICKS = [3, 1, 3, 3, 2, 3, 3, 4, 3, 3, 3, 3];
          const HOT = 3, R = 3, RY = [62, 160, 258];
          const chipX = (k) => 292 + k * 24;
          function route(level) {
            const out = [];
            let hot = 0;
            CLICKS.forEach((id) => out.push({ id, t: 'c', r: level === 2 && id === HOT ? (hot++) % R : id % R }));
            Object.keys(AGE).forEach((key) => {
              const id = +key;
              if (level === 2 && id === HOT) for (let r = 0; r < R; r++) out.push({ id, t: 'p', r });
              else out.push({ id, t: 'p', r: id % R });
            });
            return out;
          }
          async function run() {
            v.restart();
            st.clearPackets();
            st.clear();
            const level = mode.get();
            const users = st.node({ x: 62, y: 86, w: 100, h: 70, shape: 'db', label: 'Users', sub: '4 profiles', kind: 'primary' });
            const events = st.node({ x: 62, y: 226, w: 100, h: 70, shape: 'db', label: 'Clicks', sub: '12 events', kind: 'data' });
            const reds = RY.map((y, r) => st.node({ x: 216, y, w: 116, h: 48, label: 'Reducer ' + r, sub: 'id % 3 = ' + r }));
            st.text(292, 20, 'reducer input, in order', { anchor: 'start', size: 12, kind: 'muted' });
            [['primary', 'profile', 20], ['data', 'click', 100], ['warn', 'held in RAM', 170], ['good', 'joined', 280]].forEach(([k, t, x]) => {
              st.rect(x, 290, 16, 16, { kind: k, rx: 4 });
              st.text(x + 22, 299, t, { anchor: 'start', size: 12, kind: 'text2' });
            });
            sBuf.set('0', 'info');
            sMax.set('—', 'info');
            sOut.set('0', 'info');
            cap.set('Map both inputs to (user id, record). Shuffle by id % 3.', 'info');
            const boxes = [[], [], []];
            const deliveries = route(level);
            const addChip = (d) => {
              const b = boxes[d.r];
              d.chip = st.rect(chipX(b.length), RY[d.r] - 11, 21, 22, { kind: d.t === 'p' ? 'primary' : 'data', label: String(d.id), size: 12, rx: 4 });
              b.push(d);
            };
            const clicks = deliveries.filter((d) => d.t === 'c');
            const profs = deliveries.filter((d) => d.t === 'p');
            for (let w = 0; w < clicks.length; w += 4) {
              await Promise.all(clicks.slice(w, w + 4).map((d, k) => v.sleep(k * 90).then(() => st.send(events, reds[d.r], { label: String(d.id), kind: 'data', dur: 480 })).then(() => addChip(d))));
            }
            await Promise.all(profs.map((d, k) => v.sleep(k * 90).then(() => st.send(users, reds[d.r], { label: String(d.id), kind: 'primary', dur: 520 })).then(() => addChip(d))));
            const load = boxes.map((b) => b.filter((d) => d.t === 'c').length);
            reds.forEach((n, r) => n.set({ sub: load[r] + ' click' + (load[r] === 1 ? '' : 's') }));
            cap.set(level === 2 ? 'Hot user 3 spread round-robin; its profile copied everywhere' : 'The key is an address: all of user 3 meets at reducer 0', 'primary');
            await v.sleep(1000);
            // MapReduce always sorts by key; secondary sort also orders profile before clicks
            const sorted = boxes.map((b) => b.map((d, i) => ({ d, i })).sort((a, c) => a.d.id - c.d.id || (level >= 1 ? (a.d.t === 'p' ? 0 : 1) - (c.d.t === 'p' ? 0 : 1) : 0) || a.i - c.i).map((o) => o.d));
            const from = boxes.map((b) => b.map((_, k) => chipX(k)));
            await v.tween(600, (t) => sorted.forEach((b, r) => b.forEach((d, k) => d.chip.set({ x: lerp(from[r][boxes[r].indexOf(d)], chipX(k), t) }))));
            cap.set(level >= 1 ? 'Secondary sort: each profile first, then its clicks' : 'Sorted by id only: user 3\'s profile lands after its clicks', level >= 1 ? 'good' : 'warn');
            await v.sleep(900);
            // reduce: walk every reducer's input in order
            const state = sorted.map(() => ({ known: new Set(), buf: [], peak: 0 }));
            let joined = 0;
            const L = Math.max(...sorted.map((b) => b.length));
            for (let k = 0; k < L; k++) {
              sorted.forEach((b, r) => {
                const d = b[k];
                if (!d) return;
                const S = state[r];
                if (d.t === 'p') {
                  S.known.add(d.id);
                  S.buf.filter((x) => x.id === d.id).forEach(() => { joined++; });
                  S.buf = S.buf.filter((x) => x.id !== d.id);
                } else if (S.known.has(d.id)) {
                  d.chip.set({ kind: 'good' });
                  joined++;
                } else {
                  d.chip.set({ kind: 'warn' });
                  S.buf.push(d);
                  S.peak = Math.max(S.peak, S.buf.length);
                }
              });
              const peak = Math.max(...state.map((S) => S.peak));
              sBuf.set(String(peak), peak ? 'bad' : 'good');
              sOut.set(String(joined), 'info');
              await v.sleep(260);
            }
            const peak = Math.max(...state.map((S) => S.peak));
            const max = Math.max(...load);
            const hotR = load.indexOf(max);
            reds.forEach((n, r) => n.set({ kind: load[r] === max && max > 6 ? 'bad' : 'good' }));
            sMax.set(max + ' of 12', max > 6 ? 'bad' : 'good');
            sOut.set(String(joined), 'good');
            if (level === 0) cap.set(`Reducer ${hotR} held ${peak} clicks in RAM and did ${max} of 12`, 'bad');
            else if (level === 1) cap.set(`Nothing buffered, but reducer ${hotR} still does ${max} of 12 clicks`, 'warn');
            else cap.set(`Load shared: the busiest reducer does just ${max} of 12`, 'good');
          }
          run();
        },
      },

      /* 8 ─────────────────────────────────────────────── */
      {
        title: 'Map-side joins: skip the shuffle',
        caption: 'If you know how the inputs are laid out, mappers can join on their own: no reducers, no sorting, no shuffle.',
        problem: 'Broken layout assumption',
        fix: 'Pick the join that fits',
        tags: ['Hive MapJoin', 'Pig replicated join', 'Impala'],
        demo(el, v) {
          const box = v.wrap(el);
          const alg = v.segmented(box, {
            options: [{ value: 'bcast', label: 'Broadcast hash' }, { value: 'part', label: 'Partitioned hash' }, { value: 'merge', label: 'Merge join' }],
            value: 'bcast',
            onChange: run,
          });
          const row = v.row(box);
          const brk = v.toggle(row, { label: 'Break its assumption', value: false, onChange: run });
          v.controls(row, [{ label: 'Run', icon: '▶', kind: 'primary', onClick: run }]);
          const st = v.stage(box, { w: 560, h: 318 });
          const stats = v.row(box, { center: true });
          const sJ = v.stat(stats, 'joined', '0', 'good');
          const sM = v.stat(stats, 'missed', '0', 'info');
          v.stat(stats, 'reducers · shuffle', '0 · 0', 'good');
          const cap = v.caption(box, '');
          const AGE = { 1: 31, 2: 25, 3: 47, 4: 38 };
          const EVENTS = {
            bcast: { ok: [[3, 1, 4, 2], [3, 1, 2, 4]], bad: [[3, 1, 4, 2], [3, 1, 2, 4]] },
            part: { ok: [[3, 1, 3, 1], [4, 2, 2, 4]], bad: [[3, 1, 4, 2], [3, 1, 2, 4]] },
            merge: { ok: [[1, 1, 3, 3], [2, 2, 4, 4]], bad: [[3, 1, 3, 1], [4, 2, 4, 2]] },
          };
          const LANE = [168, 270];
          const OK = {
            bcast: 'No reducers, no shuffle. Out A and B keep the events\' split.',
            part: 'Each mapper loaded only its half of users. No shuffle.',
            merge: 'Both sides sorted: one merge pass, no hash table.',
          };
          async function run() {
            v.restart();
            st.clearPackets();
            st.clear();
            const a = alg.get(), broken = brk.get();
            const ev = EVENTS[a][broken ? 'bad' : 'ok'];
            let joined = 0, missed = 0;
            sJ.set('0', 'good');
            sM.set('0', 'info');
            const users = st.node({ x: 70, y: 50, w: 110, h: 62, shape: 'db', label: 'Users', sub: a === 'bcast' && broken ? '40M rows' : a === 'bcast' ? 'small table' : 'split by id', kind: 'primary' });
            const evs = ev.map((ids, m) => st.node({ x: 70, y: LANE[m], w: 110, h: 54, shape: 'doc', label: 'Events ' + 'AB'[m], sub: ids.join(' '), kind: 'data' }));
            const outs = LANE.map((y, m) => st.node({ x: 494, y, w: 96, h: 54, shape: 'doc', label: 'Out ' + 'AB'[m], sub: 'rows: 0', kind: 'good' }));
            const regs = LANE.map((y, m) => {
              st.rect(152, y - 44, 250, 88, { kind: 'neutral', rx: 12 });
              st.text(166, y - 28, 'Mapper ' + (m + 1) + (a === 'merge' ? ' · merge' : ' · RAM hash table'), { anchor: 'start', size: 13, bold: true });
              return { mid: { x: 277, y: y + 30 }, top: { x: 277, y: y - 44 }, cells: [], counts: 0 };
            });
            const tables = a === 'bcast' ? [[1, 2, 3, 4], [1, 2, 3, 4]] : [[1, 3], [2, 4]];
            const lbl = a === 'bcast' ? ['all users', 'all users'] : a === 'part' ? ['odd ids', 'even ids'] : ['sorted odd', 'sorted even'];
            cap.set(a === 'bcast' ? 'Every mapper loads the whole small table into RAM' : a === 'part' ? 'Users and events split the same way: by id parity' : 'Both inputs split the same way and sorted by id', 'info');
            await Promise.all(regs.map((g, m) => st.send(users, g.top, { label: lbl[m], kind: 'primary', dur: 650 })));
            if (a === 'bcast' && broken) {
              for (let k = 0; k < 4; k++) {
                regs.forEach((g) => g.cells.push(st.rect(166 + k * 56, LANE[regs.indexOf(g)] - 12, 50, 26, { kind: 'warn', label: '…', rx: 5 })));
                await v.sleep(160);
              }
              await Promise.all(regs.map((g) => st.send(users, g.top, { label: 'more rows', kind: 'bad', drop: 0.85, dur: 600 })));
              regs.forEach((g) => g.cells.forEach((c) => c.set({ kind: 'bad' })));
              cap.set('40M users do not fit in RAM. Broadcast join impossible.', 'bad');
              return;
            }
            regs.forEach((g, m) => {
              g.cells = tables[m].map((id, k) => st.rect(166 + k * 56, LANE[m] - 12, 50, 26, { kind: 'primary', label: a === 'merge' ? 'u' + id : id + ':' + AGE[id], mono: true, size: 12, rx: 5 }));
              g.ids = tables[m];
            });
            cap.set('Now each mapper streams its own block of events', 'info');
            const upd = () => { sJ.set(String(joined), 'good'); sM.set(String(missed), missed ? 'bad' : 'info'); };
            const hit = async (m, id, cellIdx) => {
              regs[m].cells[cellIdx].set({ kind: 'good' });
              await st.send(regs[m].mid, outs[m], { label: id + '·' + AGE[id], kind: 'good', dur: 380 });
              joined++;
              regs[m].counts++;
              outs[m].set({ sub: 'rows: ' + regs[m].counts });
              upd();
            };
            const miss = async (m, id) => {
              missed++;
              upd();
              await st.send(regs[m].mid, outs[m], { label: String(id), kind: 'bad', drop: 0.6, dur: 450 });
            };
            await Promise.all(regs.map(async (g, m) => {
              await v.sleep(m * 200);
              let ui = 0;
              for (const id of ev[m]) {
                await st.send(evs[m], g.mid, { label: String(id), kind: 'data', dur: 380 });
                if (a !== 'merge') {
                  const c = g.ids.indexOf(id);
                  if (c >= 0) await hit(m, id, c);
                  else await miss(m, id);
                  continue;
                }
                // merge join: advance the user pointer while it is behind the event key
                while (ui < g.ids.length && g.ids[ui] < id) { g.cells[ui].set({ kind: 'neutral' }); ui++; }
                if (ui < g.ids.length) g.cells[ui].set({ kind: 'warn' });
                await v.sleep(150);
                if (ui < g.ids.length && g.ids[ui] === id) await hit(m, id, ui);
                else await miss(m, id);
              }
            }));
            if (!broken) cap.set(OK[a], 'good');
            else if (a === 'part') cap.set(`Events split differently: ${missed} of 8 lookups found no user`, 'bad');
            else cap.set(`Unsorted input: the merge walked past ${missed} matches`, 'bad');
          }
          run();
        },
      },

      /* 9 ─────────────────────────────────────────────── */
      {
        title: 'Build files offline, then swap them in',
        caption: 'Jobs write brand-new immutable files, like a search index. Servers swap them in atomically. A buggy build? Switch back and rerun.',
        problem: 'Job writes into the live DB',
        fix: 'Immutable output + atomic swap',
        tags: ['Lucene', 'Voldemort', 'HBase bulk load'],
        demo(el, v) {
          const box = v.wrap(el);
          const mode = v.segmented(box, {
            options: [{ value: 'db', label: 'Write into live DB', kind: 'bad' }, { value: 'files', label: 'Build files + swap', kind: 'good' }],
            value: 'db',
            onChange: reset,
          });
          v.controls(box, [
            { label: 'Run job', icon: '▶', kind: 'primary', onClick: () => job(false) },
            { label: 'Buggy job', icon: '✱', kind: 'danger', onClick: () => job(true) },
            { label: 'Roll back', icon: '↺', kind: 'good', onClick: rollback },
          ]);
          const st = v.stage(box, { w: 560, h: 230 });
          const stats = v.row(box, { center: true });
          const sSee = v.stat(stats, 'users see', '', 'good');
          const sLoad = v.stat(stats, 'live DB load', '', 'good');
          const tbl = v.table(box, { cols: ['search term', 'documents'], rows: [] });
          const cap = v.caption(box, '');
          const DOCS = { d1: 'red fox', d2: 'red hen', d3: 'fox den' };
          function build(buggy) {
            const idx = {};
            Object.entries(DOCS).forEach(([id, text]) => {
              const words = text.split(' ');
              (buggy ? words.slice(0, 1) : words).forEach((w) => { (idx[w] = idx[w] || []).push(id); });
            });
            return idx;
          }
          const GOOD = build(false);
          const TERMS = Object.keys(GOOD).sort();
          const same = (a, b) => (a || []).join() === (b || []).join();
          const isGood = (idx) => TERMS.every((t) => same(idx[t], GOOD[t]));
          let versions = [], serving = 0, verN = 0, rows = {}, code = 'v1 code', jobN = null, server = null, docs = [];
          function current() { return mode.get() === 'files' ? versions[serving].idx : rows; }
          function paint(load) {
            st.clear();
            const files = mode.get() === 'files';
            jobN = st.node({ x: 66, y: 115, w: 110, h: 56, label: 'Batch job', sub: code, kind: code === 'buggy code' ? 'bad' : 'primary' });
            const ok = isGood(current());
            server = st.node({ x: 410, y: 115, w: 124, h: 64, shape: files ? 'rect' : 'db', label: files ? 'Search server' : 'Live DB', sub: files ? 'serving v' + versions[serving].n : 'read + write', kind: load ? 'warn' : ok ? 'good' : 'bad' });
            const users = st.node({ x: 520, y: 108, w: 44, h: 44, shape: 'person', label: 'Users', kind: 'info' });
            st.link(users, server, { thin: true });
            docs = [];
            if (files) {
              versions.forEach((ver, k) => {
                docs.push(st.node({ x: 238, y: 45 + k * 70, w: 106, h: 46, shape: 'doc', label: 'index v' + ver.n, sub: ver.bad ? 'buggy' : 'immutable', kind: ver.bad ? 'bad' : 'data', dim: k !== serving }));
                st.link(jobN, docs[k], { thin: true, dashed: true, kind: 'muted' });
              });
              st.link(server, docs[serving], { kind: ok ? 'good' : 'bad', label: 'serving', thick: true });
            } else {
              st.link(jobN, server, { dashed: true, label: 'row by row' });
            }
            const idx = current();
            tbl.update(TERMS.map((t) => ({ cells: [t, idx[t] ? idx[t].join(', ') : '(missing)'], kind: same(idx[t], GOOD[t]) ? '' : 'bad' })));
            sSee.set(ok ? 'correct' : 'wrong', ok ? 'good' : 'bad');
            sLoad.set(files ? 'none' : load ? 'spike' : 'normal', files ? 'good' : load ? 'warn' : 'good');
          }
          function reset() {
            v.restart();
            st.clearPackets();
            verN = 1;
            versions = [{ n: 1, idx: GOOD, bad: false }];
            serving = 0;
            rows = JSON.parse(JSON.stringify(GOOD));
            code = 'v1 code';
            paint(false);
            cap.set(mode.get() === 'files' ? 'Servers read immutable index files built by the job' : 'The job writes its results straight into the live database', 'info');
          }
          async function job(buggy) {
            v.restart();
            st.clearPackets();
            code = buggy ? 'buggy code' : 'fixed code';
            const idx = build(buggy);
            if (mode.get() === 'files') {
              versions.push({ n: ++verN, idx, bad: buggy });
              while (versions.length > 3) {
                const drop = versions.findIndex((_, k) => k !== serving);
                versions.splice(drop, 1);
                if (drop < serving) serving--;
              }
              paint(false);
              const d = docs[versions.length - 1];
              cap.set('The job writes a whole new index as files', 'info');
              await st.send(jobN, d, { label: 'write', kind: buggy ? 'bad' : 'data', dur: 700 });
              cap.set('Server copies the files, then switches in one step', 'info');
              await st.send(d, server, { label: 'load', kind: buggy ? 'bad' : 'good', dur: 700 });
              serving = versions.length - 1;
              paint(false);
              if (buggy) cap.set(`v${verN} is wrong! But the older files are still there, untouched.`, 'bad');
              else cap.set(`Now serving v${verN}. Nobody saw a half-built index.`, 'good');
              return;
            }
            cap.set('The job updates live rows one by one', 'warn');
            paint(true);
            for (const t of TERMS) {
              await st.send(jobN, server, { label: t, kind: buggy ? 'bad' : 'data', dur: 520 });
              if (idx[t]) rows[t] = idx[t].slice();
              else delete rows[t];
              paint(true);
            }
            paint(false);
            if (buggy) cap.set('Bad rows are live, and users saw them mid-job.', 'bad');
            else cap.set('Done, but the DB was hammered and users saw partial updates.', 'warn');
          }
          function rollback() {
            v.restart();
            st.clearPackets();
            code = 'fixed code';
            if (mode.get() === 'files') {
              let k = serving - 1;
              while (k >= 0 && versions[k].bad) k--;
              if (k < 0 || !versions[serving].bad) {
                paint(false);
                cap.set(versions[serving].bad ? 'No older good version kept.' : 'Serving a good version already.', 'info');
                return;
              }
              serving = k;
              paint(false);
              cap.set(`Rolled back in one step: v${versions[k].n} again. Rerun when fixed.`, 'good');
              return;
            }
            paint(false);
            if (isGood(rows)) cap.set('Nothing to undo: the rows look fine.', 'info');
            else cap.set('Code rolled back, but the bad rows stay in the DB.', 'bad');
          }
          reset();
        },
      },

      /* 10 ─────────────────────────────────────────────── */
      {
        title: 'Hadoop vs MPP databases',
        caption: 'Hadoop takes any raw bytes, runs any code, and retries just the failed task, because low-priority batch tasks get killed often.',
        problem: 'Task preempted',
        fix: 'Retry one task, not the job',
        tags: ['Teradata', 'Hive', 'YARN'],
        demo(el, v) {
          const box = v.wrap(el);
          const scene = v.segmented(box, {
            options: [{ value: 'fault', label: 'Faults' }, { value: 'store', label: 'Storage' }, { value: 'code', label: 'Processing' }],
            value: 'fault',
            onChange: run,
          });
          const st = v.stage(box, { w: 560, h: 280 });
          const stats = v.row(box, { center: true });
          const sL = v.stat(stats, 'MPP database', '', 'info');
          const sR = v.stat(stats, 'Hadoop', '', 'info');
          const cap = v.caption(box, '');
          v.controls(box, [{ label: 'Run', icon: '▶', kind: 'primary', onClick: run }]);
          const ITEMS = {
            store: [['orders', 'table rows'], ['click logs', 'raw text'], ['photos', 'images'], ['sensors', 'JSON']],
            code: [['SQL report', 'query'], ['train model', 'ML code'], ['resize', 'image code'], ['build index', 'search code']],
          };
          function panels(l, r) {
            st.box(10, 80, 260, 192, { label: l, kind: 'primary', solid: true });
            st.box(290, 80, 260, 192, { label: r, kind: 'good', solid: true });
          }
          async function run() {
            v.restart();
            st.clearPackets();
            st.clear();
            const sc = scene.get();
            if (sc === 'fault') return runFault();
            panels('MPP database', 'Hadoop · HDFS');
            const items = ITEMS[sc].map(([n, s], k) => st.node({ x: 76 + k * 136, y: 36, w: 120, h: 44, shape: 'pill', label: n, sub: s, kind: 'data' }));
            sL.set('0 / 4', 'info');
            sR.set('0 / 4', 'info');
            cap.set(sc === 'store' ? 'Four new datasets arrive. Where are they usable today?' : 'Four kinds of work over the same data', 'info');
            let l = 0, r = 0;
            for (let k = 0; k < 4; k++) {
              const y = 106 + k * 40;
              const [name] = ITEMS[sc][k];
              await Promise.all([st.send(items[k], { x: 140, y: y + 15 }, { kind: 'data', dur: 600 }), st.send(items[k], { x: 420, y: y + 15 }, { kind: 'data', dur: 600 })]);
              items[k].dim(true);
              const first = k === 0;
              if (first) l++;
              r++;
              const lText = sc === 'store' ? (first ? name + ' · modeled' : name + ' · model first') : (first ? name + ' · runs' : name + ' · not SQL ✕');
              st.rect(22, y, 236, 30, { kind: first ? 'good' : sc === 'store' ? 'warn' : 'bad', label: lText, size: 13 });
              st.rect(302, y, 236, 30, { kind: 'good', label: name + (sc === 'store' ? ' · raw file ✓' : ' · runs ✓'), size: 13 });
              sL.set(l + ' / 4', l < 4 ? 'warn' : 'good');
              sR.set(r + ' / 4', 'good');
            }
            cap.set(sc === 'store' ? 'Hadoop: dump raw bytes now, pick a schema when reading.' : 'MPP runs SQL only. Hadoop runs any code, SQL included.', 'good');
          }
          async function runFault() {
            const T = 10;
            panels('MPP · a kill restarts the query', 'MapReduce · a kill retries one task');
            st.text(280, 22, 'Low-priority batch tasks get preempted often', { size: 13, kind: 'text2' });
            const clock = st.text(280, 50, 't = 0.0 h', { size: 13, kind: 'muted', mono: true });
            const r = rng(Math.floor(Math.random() * 1e9));
            // tasks take 0.8-1.0 h. First kill hits a running task; the next two land after
            // untouched tasks are done (harmless to MapReduce) but before the MPP query can finish.
            const lens = Array.from({ length: T }, () => 0.8 + r() * 0.2);
            const a = Math.floor(r() * T);
            const other = () => { let k = a; while (k === a) k = Math.floor(r() * T); return k; };
            const t1 = 0.35 + r() * 0.2, t2 = t1 + 0.7, t3 = t2 + 0.5 + r() * 0.25;
            const kills = [{ t: t1, task: a }, { t: t2, task: other() }, { t: t3, task: other() }];
            let kt = t3;
            while (kt < 7) { kt += -Math.log(1 - r()) / 1.2; kills.push({ t: kt, task: Math.floor(r() * T) }); }
            const lanes = [0, 1].map((L) => ({
              p: new Array(T).fill(0), hit: new Array(T).fill(-9), done: null, restarts: 0,
              fills: lens.map((_, i) => {
                const x = (L ? 290 : 10) + 18 + i * 23;
                st.rect(x, 110, 16, 130, { kind: 'neutral', rx: 3 });
                return st.rect(x, 240, 16, 0, { kind: 'primary', rx: 3 });
              }),
              note: st.text(L ? 420 : 140, 258, 'restarts 0', { size: 12, kind: 'text2' }),
            }));
            sL.set('running', 'info');
            sR.set('running', 'info');
            cap.set('Same 10 tasks, same kills. Watch each system react.', 'info');
            let time = 0, ki = 0;
            const advance = (dt) => lanes.forEach((L) => {
              if (L.done != null) return;
              L.p = L.p.map((p, i) => Math.min(lens[i], p + dt));
              if (L.p.every((p, i) => p >= lens[i])) L.done = time + dt;
            });
            const kill = (k) => {
              const mpp = lanes[0], mr = lanes[1];
              if (mpp.done == null) { mpp.p = mpp.p.map(() => 0); mpp.restarts++; mpp.hit = mpp.hit.map(() => k.t); }
              if (mr.done == null && mr.p[k.task] < lens[k.task]) { mr.p[k.task] = 0; mr.restarts++; mr.hit[k.task] = k.t; }
            };
            const draw = () => {
              lanes.forEach((L) => {
                L.fills.forEach((f, i) => {
                  const hgt = 130 * (L.p[i] / lens[i]);
                  const kind = L.p[i] >= lens[i] ? 'good' : time - L.hit[i] < 0.2 ? 'bad' : 'primary';
                  f.set({ y: 240 - hgt, h: Math.max(0, hgt), kind });
                });
                L.note.set('restarts ' + L.restarts + (L.done != null ? ' · done at ' + L.done.toFixed(1) + ' h' : ''), L.done != null ? 'good' : 'text2');
              });
              clock.set('t = ' + time.toFixed(1) + ' h');
            };
            const DT = 0.035, TMAX = 6;
            while (time < TMAX && lanes.some((L) => L.done == null)) {
              await v.sleep(40);
              const to = time + DT;
              while (ki < kills.length && kills[ki].t <= to) { advance(kills[ki].t - time); time = kills[ki].t; kill(kills[ki]); ki++; }
              advance(to - time);
              time = to;
              draw();
            }
            const [mpp, mr] = lanes;
            sL.set(mpp.done != null ? mpp.done.toFixed(1) + ' h' : 'never', mpp.done != null ? 'warn' : 'bad');
            sR.set(mr.done != null ? mr.done.toFixed(1) + ' h' : 'never', 'good');
            if (mpp.done == null) cap.set(`MPP restarted ${mpp.restarts} times and never finished`, 'bad');
            else if (mr.done != null) cap.set(`MapReduce done at ${mr.done.toFixed(1)} h. MPP restarted ${mpp.restarts}×, done at ${mpp.done.toFixed(1)} h.`, 'good');
          }
          run();
        },
      },

      /* 11 ─────────────────────────────────────────────── */
      {
        title: 'Stop writing every step to HDFS',
        caption: 'MapReduce chains jobs through replicated files and waits for every task. Dataflow engines pipeline operators and recompute lost pieces instead.',
        problem: 'Materialized intermediate state',
        fix: 'Dataflow engine',
        tags: ['Spark', 'Flink', 'Tez'],
        demo(el, v) {
          const box = v.wrap(el);
          const top = v.row(box);
          const scene = v.segmented(top, {
            options: [{ value: 'time', label: 'Timeline' }, { value: 'lose', label: 'Lose a machine' }],
            value: 'time',
            onChange: run,
          });
          const tDet = v.toggle(top, { label: 'Deterministic operators', value: false, onChange: run });
          v.controls(top, [{ label: 'Run', icon: '▶', kind: 'primary', onClick: run }]);
          const st = v.stage(box, { w: 560, h: 270 });
          const stats = v.row(box, { center: true });
          const sA = v.stat(stats, 'MapReduce done', '—', 'warn');
          const sB = v.stat(stats, 'dataflow done', '—', 'good');
          const sC = v.stat(stats, 'tasks rerun', '—', 'info');
          const sD = v.stat(stats, 'output', '—', 'info');
          const cap = v.caption(box, '');
          function show() {
            const time = scene.get() === 'time';
            tDet.el.style.display = time ? 'none' : '';
            [sA, sB].forEach((s) => { s.el.style.display = time ? '' : 'none'; });
            [sC, sD].forEach((s) => { s.el.style.display = time ? 'none' : ''; });
          }
          async function run() {
            v.restart();
            st.clearPackets();
            st.clear();
            show();
            if (scene.get() === 'time') await runTime();
            else await runLose();
          }
          async function runTime() {
            const X0 = 128, X1 = 548, TOT = 5.6;
            const xs = (t) => X0 + ((X1 - X0) * t) / TOT;
            const bars = [
              // [row y, label, start, end, kind]
              [96, 'map', 0, 1, 'primary'], [96, 'sort', 1, 1.5, 'warn'], [96, 'reduce', 1.5, 2.3, 'primary'], [96, 'HDFS', 2.3, 3.0, 'bad'],
              [96, 're-map', 3.0, 3.6, 'bad'], [96, 'sort', 3.6, 4.1, 'warn'], [96, 'reduce', 4.1, 4.9, 'primary'], [96, 'HDFS', 4.9, 5.6, 'good'],
              [176, 'map', 0, 1.0, 'primary'], [176, 'reduce', 1.2, 2.2, 'primary'],
              [212, 'sort + reduce', 0.1, 1.8, 'warn'], [212, 'HDFS', 2.0, 2.7, 'good'],
            ];
            st.text(14, 88, 'MapReduce', { anchor: 'start', bold: true });
            st.text(14, 107, 'job → HDFS → job', { anchor: 'start', size: 12, kind: 'muted' });
            st.text(14, 186, 'Dataflow', { anchor: 'start', bold: true });
            st.text(14, 205, 'one job, piped', { anchor: 'start', size: 12, kind: 'muted' });
            st.text((xs(0) + xs(3.0)) / 2, 66, 'job 1', { size: 12, kind: 'muted' });
            st.text((xs(3.0) + xs(5.6)) / 2, 66, 'job 2', { size: 12, kind: 'muted' });
            st.line(xs(3.0), 60, xs(3.0), 124, { kind: 'muted', dashed: true, width: 1 });
            st.line(X0, 146, X1, 146, { kind: 'muted', width: 1 });
            st.line(X0, 246, X1, 246, { kind: 'muted', width: 1 });
            st.text(X1, 262, 'time →', { anchor: 'end', size: 12, kind: 'muted' });
            const rects = bars.map(([y, , s, , k]) => st.rect(xs(s), y - 14, 1, 28, { kind: k, label: '', size: 12, rx: 5 }).set({ opacity: 0 }));
            const cursor = st.line(X0, 40, X0, 250, { kind: 'accent', width: 1.5, layer: 'top' });
            sA.set('…', 'warn');
            sB.set('…', 'good');
            cap.set('Same two-step job on both engines', 'info');
            let flowDone = false;
            await v.tween(5000, (t) => {
              const now = t * TOT;
              cursor.set({ x1: xs(now), x2: xs(now) });
              bars.forEach(([, label, s, e], k) => {
                if (now < s) return;
                const end = Math.min(now, e);
                rects[k].set({ w: Math.max(1, xs(end) - xs(s) - 2), label: now >= e ? label : '', opacity: 1 });
              });
              if (!flowDone && now >= 2.7) {
                flowDone = true;
                sB.set('2.7 h', 'good');
                cap.set('Dataflow done: no middle HDFS write, no extra map or sort', 'good');
              }
            }, (t) => t);
            sA.set('5.6 h', 'warn');
            cap.set('MapReduce wrote job 1 to HDFS (×3 replicas) before job 2 could start', 'warn');
          }
          async function runLose() {
            const det = tDet.get();
            const P = [[5, 8, 2], [9, 4, 7], [6, 3, 1]];
            const r = rng(Math.floor(Math.random() * 1e9));
            const pick2 = (arr, avoid) => {
              if (det) return arr.slice().sort((a, b) => b - a).slice(0, 2);
              for (;;) {
                const s = arr.slice().sort(() => r() - 0.5).slice(0, 2);
                if (!avoid || s.slice().sort().join() !== avoid.slice().sort().join()) return s;
              }
            };
            const outA = P.map((p) => pick2(p));
            const sums = (A) => [A.flat().filter((x) => x % 2 === 0).reduce((s, x) => s + x, 0), A.flat().filter((x) => x % 2).reduce((s, x) => s + x, 0)];
            const input = st.node({ x: 60, y: 135, w: 92, h: 76, shape: 'db', label: 'Input', sub: 'on HDFS', kind: 'data' });
            const A = [55, 135, 215].map((y, i) => st.node({ x: 205, y, w: 118, h: 50, label: 'A' + (i + 1), sub: det ? 'top 2' : 'any 2', kind: 'neutral' }));
            const B = [95, 175].map((y, j) => st.node({ x: 365, y, w: 110, h: 50, label: 'B' + (j + 1), sub: j ? 'sum odd' : 'sum even', kind: 'neutral' }));
            const out = st.node({ x: 500, y: 135, w: 90, h: 58, shape: 'doc', label: 'Output', kind: 'neutral' });
            A.forEach((a) => { st.link(input, a, { thin: true }); B.forEach((b) => st.link(a, b, { thin: true, kind: 'muted' })); });
            B.forEach((b) => st.link(b, out, { thin: true }));
            sC.set('0', 'info');
            sD.set('…', 'info');
            cap.set(det ? 'Operator A keeps the top 2 values: deterministic' : 'Operator A keeps any 2 values: random, not deterministic', 'info');
            await Promise.all(A.map((a, i) => st.send(input, a, { label: P[i].join(' '), kind: 'data', dur: 700 })));
            A.forEach((a, i) => a.set({ sub: '→ ' + outA[i].join(' '), kind: 'primary' }));
            await Promise.all(A.map((a, i) => v.sleep(i * 120).then(() => Promise.all(B.map((b) => st.send(a, b, { label: outA[i].join(' '), kind: 'primary', dur: 700 }))))));
            let S = sums(outA);
            B.forEach((b, j) => b.set({ sub: 'sum ' + S[j], kind: 'primary' }));
            await v.sleep(400);
            cap.set('The machine holding A2\'s in-memory output dies!', 'bad');
            A[1].set({ kind: 'bad', down: true, sub: 'lost' });
            await v.sleep(900);
            cap.set('Recompute A2 from its input: the engine knows its lineage', 'warn');
            await st.send(input, A[1], { label: 'redo', kind: 'warn', dur: 700 });
            const again = pick2(P[1], det ? null : outA[1]);
            A[1].set({ down: false, kind: 'warn', sub: '→ ' + again.join(' ') });
            await v.sleep(500);
            if (again.join() === outA[1].join()) {
              A[1].set({ kind: 'good' });
              sC.set('1', 'good');
              await Promise.all(B.map((b) => st.send(b, out, { label: 'done', kind: 'good', dur: 600 })));
              out.set({ kind: 'good', sub: S[0] + ' · ' + S[1] });
              sD.set('consistent', 'good');
              cap.set('Same output as before, so B keeps its work. 1 task rerun.', 'good');
              return;
            }
            cap.set(`A2 now says ${again.join(' ')}, not ${outA[1].join(' ')}. B used the old data!`, 'bad');
            B.forEach((b) => b.set({ kind: 'bad', sub: 'conflict' }));
            await v.sleep(1000);
            outA[1] = again;
            S = sums(outA);
            cap.set('B must be killed and rerun on the new data too', 'warn');
            await Promise.all(A.map((a, i) => Promise.all(B.map((b) => st.send(a, b, { label: outA[i].join(' '), kind: 'warn', dur: 650 })))));
            B.forEach((b, j) => b.set({ kind: 'warn', sub: 'sum ' + S[j] }));
            await Promise.all(B.map((b) => st.send(b, out, { label: 'done', kind: 'warn', dur: 600 })));
            out.set({ kind: 'warn', sub: S[0] + ' · ' + S[1] });
            sC.set('3', 'bad');
            sD.set('recomputed', 'warn');
            cap.set('Non-determinism cascaded: 3 tasks rerun instead of 1', 'bad');
          }
          run();
        },
      },

      /* 12 ─────────────────────────────────────────────── */
      {
        title: 'Graphs: vertices message neighbours in rounds',
        caption: 'Pregel keeps each vertex\'s state in memory. Each superstep, vertices read messages, update, and message their neighbours, until nothing changes.',
        tags: ['Pregel', 'Giraph', 'GraphX', 'Gelly'],
        demo(el, v) {
          const box = v.wrap(el);
          const st = v.stage(box, { w: 560, h: 300 });
          const stats = v.row(box, { center: true });
          const sAct = v.stat(stats, 'messages this round', '0', 'primary');
          const sPre = v.stat(stats, 'Pregel vertex calls', '1', 'good');
          const sMR = v.stat(stats, 'MapReduce vertex reads', '6', 'bad');
          const POS = { A: [62, 150], B: [205, 60], C: [205, 240], D: [335, 150], E: [465, 60], F: [490, 240] };
          const EDGES = [['A', 'B', 4], ['A', 'C', 1], ['C', 'B', 2], ['B', 'D', 1], ['C', 'D', 5], ['D', 'E', 3], ['D', 'F', 6], ['E', 'F', 1]];
          const V = Object.keys(POS);
          // real bulk-synchronous shortest paths from A
          const states = [];
          let dist = Object.fromEntries(V.map((x) => [x, x === 'A' ? 0 : Infinity]));
          let active = ['A'];
          states.push({ dist: { ...dist }, msgs: [], senders: [], changed: ['A'], calls: 1 });
          let calls = 1;
          while (active.length) {
            const msgs = [];
            active.forEach((u) => EDGES.filter((e) => e[0] === u).forEach(([, w, wt]) => msgs.push({ from: u, to: w, val: dist[u] + wt })));
            const nd = { ...dist };
            const changed = new Set();
            msgs.forEach((m) => { if (m.val < nd[m.to]) { nd[m.to] = m.val; changed.add(m.to); } });
            calls += new Set(msgs.map((m) => m.to)).size;
            states.push({ dist: nd, msgs, senders: active, changed: [...changed], calls });
            dist = nd;
            active = [...changed];
          }
          const fmt = (d) => (d === Infinity ? '∞' : String(d));
          const steps = states.map((s, i) => {
            if (i === 0) return { caption: 'Start: A is 0, every other vertex is ∞', kind: 'info' };
            if (!s.msgs.length) return { caption: `Superstep ${i}: ${s.senders.join(', ')} has no out-edges. Halt.`, kind: 'good' };
            return { caption: `Superstep ${i}: ${s.senders.join(', ')} send; ${s.changed.join(', ') || 'no one'} improve${s.changed.length === 1 ? 's' : ''}`, kind: 'primary' };
          });
          async function render(i, animate) {
            st.clear();
            const s = states[i];
            const shown = animate && i > 0 ? states[i - 1] : s;
            const nodes = {};
            V.forEach((x) => {
              nodes[x] = st.node({ x: POS[x][0], y: POS[x][1], w: 62, h: 62, shape: 'circle', label: x + ' = ' + fmt(shown.dist[x]), kind: x === 'A' ? 'primary' : 'neutral' });
            });
            EDGES.forEach(([a, b, wt]) => st.link(nodes[a], nodes[b], { label: String(wt), kind: 'muted' }));
            const paintState = () => V.forEach((x) => nodes[x].set({ label: x + ' = ' + fmt(s.dist[x]), kind: s.changed.includes(x) ? 'good' : x === 'A' ? 'primary' : 'neutral' }));
            sAct.set(String(s.msgs.length), s.msgs.length ? 'primary' : 'good');
            sPre.set(String(s.calls), 'good');
            sMR.set(String(6 * Math.max(1, i)), 'bad');
            if (!animate || !s.msgs.length) { paintState(); return; }
            s.senders.forEach((x) => nodes[x].set({ kind: 'primary' }));
            await Promise.all(s.msgs.map((m, k) => v.sleep(k * 60).then(() => st.send(nodes[m.from], nodes[m.to], { label: String(m.val), kind: 'data', dur: 900 }))));
            paintState();
          }
          v.stepper(box, { steps, render, delay: 2000 });
        },
      },

      /* 13 ─────────────────────────────────────────────── */
      {
        title: 'Say what to join; the optimizer picks how',
        caption: 'Hive, Pig and Spark DataFrames take declarative joins. A cost-based optimizer checks table sizes and layout, then picks the cheapest join algorithm.',
        problem: 'Hard-coded join strategy',
        fix: 'Declarative API + optimizer',
        tags: ['Hive', 'Pig', 'Spark SQL', 'Flink'],
        demo(el, v) {
          const box = v.wrap(el);
          const mode = v.segmented(box, {
            options: [{ value: 'hand', label: 'Hand-written MapReduce', kind: 'bad' }, { value: 'decl', label: 'Declarative API', kind: 'good' }],
            value: 'hand',
            onChange: run,
          });
          const ctl = v.row(box);
          const SIZES = ['10 MB', '100 MB', '1 GB', '20 GB', '400 GB'];
          let size = 1;
          v.slider(ctl, { label: 'Users table', min: 0, max: 4, value: 1, format: (i) => SIZES[i], onInput: (i) => { size = i; run(); } });
          const tPart = v.toggle(ctl, { label: 'Same partitioning', value: false, onChange: run });
          const tSort = v.toggle(ctl, { label: 'Sorted by key', value: false, onChange: run });
          const st = v.stage(box, { w: 560, h: 264 });
          const stats = v.row(box, { center: true });
          const sShuf = v.stat(stats, 'data shuffled', '', 'info');
          const sTime = v.stat(stats, 'relative time', '', 'info');
          const cap = v.caption(box, '');
          const libs = v.row(box, { center: true });
          libs.appendChild(v.h('span', { class: 'vz-muted' }, 'Reusable, per domain:'));
          ['ML: MLlib, Mahout', 'nearest neighbours', 'genome search', 'graphs: GraphX'].forEach((t) => libs.appendChild(v.cell(t, 'info', { sm: true })));
          const PLANS = [
            { id: 'bcast', label: 'Broadcast hash', sub: 'small side in RAM', shuf: 'none', time: '1×' },
            { id: 'part', label: 'Partitioned hash', sub: 'same partitions', shuf: 'none', time: '1.3×' },
            { id: 'merge', label: 'Map-side merge', sub: 'partitioned + sorted', shuf: 'none', time: '1.2×' },
            { id: 'reduce', label: 'Sort-merge (reduce)', sub: 'shuffle both sides', shuf: '2 TB', time: '4×' },
          ];
          function choose() {
            if (mode.get() === 'hand') return 'reduce';
            if (size <= 2) return 'bcast';
            if (tPart.get() && tSort.get()) return 'merge';
            if (tPart.get()) return 'part';
            return 'reduce';
          }
          async function run() {
            v.restart();
            st.clearPackets();
            st.clear();
            const decl = mode.get() === 'decl';
            const pick = choose();
            const code = st.node({ x: 106, y: 62, w: 190, h: 58, label: decl ? 'events.join(users)' : 'Mapper + Reducer', mono: decl, size: 14, sub: decl ? '1 line' : '~150 lines, plan fixed', kind: decl ? 'good' : 'warn' });
            const opt = st.node({ x: 106, y: 194, w: 170, h: 56, label: 'Optimizer', sub: decl ? 'reads sizes + layout' : 'not used', kind: decl ? 'primary' : 'ghost', dim: !decl });
            const plans = PLANS.map((p, k) => st.node({ x: 412, y: 38 + k * 63, w: 236, h: 48, label: p.label, sub: p.sub, kind: 'neutral', dim: true }));
            st.link(code, opt, { thin: true, kind: decl ? 'primary' : 'muted', dashed: !decl });
            if (decl) plans.forEach((p) => st.link(opt, p, { thin: true, dashed: true, kind: 'muted', arrow: false }));
            const P = PLANS.find((p) => p.id === pick);
            const node = plans[PLANS.indexOf(P)];
            sShuf.set('…', 'info');
            sTime.set('…', 'info');
            if (decl) {
              cap.set('The optimizer looks at sizes and layout first', 'info');
              await st.send(code, opt, { label: 'plan?', kind: 'info', dur: 600 });
              await st.send(opt, node, { label: 'pick', kind: 'good', dur: 700 });
            } else {
              cap.set('You hard-coded one plan in Java', 'warn');
              await st.send(code, node, { label: 'always', kind: 'warn', dur: 900 });
            }
            node.set({ dim: false, kind: pick === 'reduce' && size <= 2 ? 'bad' : 'good' });
            st.link(decl ? opt : code, node, { thick: true, kind: pick === 'reduce' && size <= 2 ? 'bad' : 'good' });
            sShuf.set(P.shuf, P.shuf === 'none' ? 'good' : 'bad');
            sTime.set(P.time, P.time === '4×' ? 'bad' : 'good');
            if (!decl) cap.set(size <= 2 ? `Users are just ${SIZES[size]}, yet all 2 TB get shuffled` : 'Full shuffle every time, whatever the data looks like', 'bad');
            else if (pick === 'bcast') cap.set(`Users are ${SIZES[size]}: broadcast them, no shuffle`, 'good');
            else if (pick === 'reduce') cap.set('No shortcut fits, so it falls back to a full shuffle', 'warn');
            else cap.set(`Big users table, but the layout allows a ${P.label.toLowerCase()} join`, 'good');
          }
          run();
        },
      },
    ],

    cheatsheet: [
      { term: 'Batch job', text: 'Big fixed input in, output later. Judged by throughput, not latency.', kind: 'primary' },
      { term: 'Stream job', text: 'Processes each event shortly after it happens.', kind: 'info' },
      { term: 'Unix pipes', text: 'Small tools, one text interface, wiring done by the shell.', kind: 'good' },
      { term: 'Sort vs hash', text: 'Sorting spills runs to disk and merges; a hash table needs all keys in RAM.', kind: 'warn' },
      { term: 'HDFS', text: 'Blocks replicated across machines; the NameNode maps blocks to machines.', kind: 'data' },
      { term: 'MapReduce', text: 'Map → partition by hash(key) → sort → reduce. Code runs near the data.', kind: 'primary' },
      { term: 'Sort-merge join', text: 'Key both inputs by the join key; secondary sort puts the profile first.', kind: 'info' },
      { term: 'Skewed join', text: 'Spread a hot key over reducers and copy its other side to all of them.', kind: 'bad' },
      { term: 'Broadcast hash join', text: 'Small table loaded into every mapper\'s RAM. No shuffle.', kind: 'good' },
      { term: 'Immutable output', text: 'Build new files, swap them in; a bad build is undone by switching back.', kind: 'good' },
      { term: 'Task retry', text: 'Frequent preemption makes retrying one task far cheaper than the job.', kind: 'warn' },
      { term: 'Dataflow engines', text: 'Spark, Flink, Tez pipeline operators and recompute lost data from lineage.', kind: 'primary' },
      { term: 'Pregel / BSP', text: 'Vertices message each other in supersteps until nothing changes.', kind: 'data' },
      { term: 'Declarative APIs', text: 'Say what to join; a cost-based optimizer picks the algorithm.', kind: 'info' },
    ],

    quiz: [
      {
        q: 'Too many distinct keys for a RAM hash table. Why does sort | uniq -c still work?',
        options: ['sort compresses keys', 'sort spills sorted runs to disk and merges them', 'uniq keeps a smaller hash table'],
        answer: 1,
        why: 'External merge sort only needs RAM for one chunk at a time; disks handle the rest sequentially.',
      },
      {
        q: 'In MapReduce, what decides which reducer receives a key-value pair?',
        options: ['The mapper that emitted it', 'A hash of the key', 'Whichever reducer is least busy'],
        answer: 1,
        why: 'Hashing the key sends every pair with the same key to the same reducer, so groups are complete.',
      },
      {
        q: 'When can you use a broadcast hash join?',
        options: ['When the smaller input fits in each mapper\'s memory', 'Only when both inputs are sorted', 'When one key is extremely hot'],
        answer: 0,
        why: 'Each mapper loads the whole small table into a hash table, then streams its block of the big input.',
      },
      {
        q: 'A buggy job produced a bad search index. What is the quickest safe fix?',
        options: ['Patch the bad entries by hand', 'Point servers back at the previous index files, then rerun', 'Restore the whole cluster from a backup'],
        answer: 1,
        why: 'Outputs are immutable files, so the old version is still there. That is human fault tolerance.',
      },
      {
        q: 'How does Spark recover an in-memory partition lost with a machine?',
        options: ['It reads a replica from HDFS', 'It recomputes the partition from its inputs via lineage', 'It always restarts the whole job'],
        answer: 1,
        why: 'Dataflow engines track how data was derived; deterministic operators make recomputation safe.',
      },
    ],
  });
})();
