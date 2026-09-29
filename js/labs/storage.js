/* DDIA Visual Guide — Storage engines lab (chapter 3).
 * The same writes and reads go to an LSM-tree (memtable, sorted segments, compaction, Bloom filters)
 * or a B-tree (fixed pages updated in place, split when full). A write-ahead log decides whether a
 * crash loses the memtable or tears a half-done split. The model is pure; the view replays it.
 * See LABS.md. */
(function () {
  'use strict';
  const DDIA = (window.DDIA = window.DDIA || {});

  /* ---------- model ---------- */
  const WRITES = 64;
  const READS = 24;
  const MEM = 8;          // after 8 writes the memtable is flushed as a sorted segment (overwrites stay one entry)
  const TIER = 4;         // compaction merges segments once there are 4
  const PAGE = 8;         // a B-tree page holds 8 keys; rewriting a page costs 8 units
  const HOT = 8;          // "Same keys again" overwrites 8 keys over and over
  const HEAVY = 4;        // writes costing more than 4× their size on disk are heavy
  const SLOW = 3;         // a read that checks more than 3 places on disk is slow
  const BLOAT = 50;       // more than half the disk holding old versions is bloat

  function workload(cfg, rng) {
    const used = new Set();
    const fresh = () => { let k; do k = rng.int(0, 999); while (used.has(k)); used.add(k); return k; };
    const writes = [];
    if (cfg.load === 'updates') {
      const hot = Array.from({ length: HOT }, fresh);
      for (let i = 0; i < WRITES; i++) writes.push(hot[rng.int(0, HOT - 1)]);
    } else for (let i = 0; i < WRITES; i++) writes.push(fresh());
    const written = [...new Set(writes)];
    const reads = [];
    for (let i = 0; i < READS; i++) reads.push(cfg.load === 'misses' ? fresh() : written[rng.int(0, written.length - 1)]);
    return { writes, reads };
  }

  function lsm(cfg, rng, ops, crashAt) {
    const trace = [];
    let mem = new Map();      // key → version
    let segs = [];            // newest first: { keys: Map(key → version) }
    let units = 0;
    let wal = 0;
    let version = 0;
    let lost = 0;
    let since = 0;           // acknowledged writes buffered in the memtable since the last flush
    // an entry on disk is stale when a newer segment holds a newer version of its key
    const staleIn = () => {
      const seen = new Set();
      return segs.map((s) => { let st = 0; s.keys.forEach((v, k) => { if (seen.has(k)) st++; }); s.keys.forEach((v, k) => seen.add(k)); return st; });
    };
    // the memtable fills by writes (an overwrite still takes a slot's worth of buffer), so the slots show `since`
    const snap = () => { const st = staleIn(); return { mem: since, segs: segs.map((s, k) => ({ n: s.keys.size, stale: st[k] })), wal, units }; };
    ops.writes.forEach((key, i) => {
      const was = units;
      version++;
      if (cfg.wal === 'on') { wal++; units++; }
      mem.set(key, version);
      since++;
      const ev = { type: 'write', i, key, did: 'mem' };
      if (since >= MEM) {
        since = 0;
        segs.unshift({ keys: new Map(mem) });
        units += mem.size;
        mem = new Map();
        ev.did = 'flush';
        if (cfg.wal === 'on') wal = 0; // flushed entries no longer need the log
        if (cfg.compact === 'on' && segs.length >= TIER) {
          // merge every segment into one, keeping only the newest version of each key
          const merged = new Map();
          segs.slice().reverse().forEach((s) => s.keys.forEach((v, k) => merged.set(k, v)));
          units += merged.size;
          segs = [{ keys: merged }];
          ev.did = 'compact';
        }
      }
      ev.state = snap();
      ev.cost = units - was;
      trace.push(ev);
      if (i === crashAt) {
        // a crash wipes memory: without a log, the writes buffered in the memtable are gone
        lost = cfg.wal === 'on' ? 0 : since;
        trace.push({ type: 'crash', i, lost, corrupt: 0, replayed: cfg.wal === 'on' ? since : 0 });
        if (cfg.wal !== 'on') { mem = new Map(); since = 0; }
      }
    });
    let worst = 0;
    let total = 0;
    ops.reads.forEach((key, j) => {
      const checked = [];
      let found = mem.has(key);
      for (let s = 0; s < segs.length && !found; s++) {
        if (cfg.bloom === 'on' && !segs[s].keys.has(key) && !rng.chance(0.01)) { checked.push({ s, skipped: true }); continue; }
        checked.push({ s });
        if (segs[s].keys.has(key)) found = true;
      }
      const cost = checked.filter((c) => !c.skipped).length;
      worst = Math.max(worst, cost);
      total += cost;
      trace.push({ type: 'read', j, key, checked, found, cost });
    });
    const onDisk = segs.reduce((n, s) => n + s.keys.size, 0);
    const stale = staleIn().reduce((a, b) => a + b, 0);
    return { trace, units, lost, corrupt: 0, worst, avg: total / READS, stalePct: onDisk ? Math.round((stale / onDisk) * 100) : 0 };
  }

  function btree(cfg, rng, ops, crashAt) {
    const trace = [];
    let leaves = [[]];        // sorted keys per leaf page, left to right
    let units = 0;
    let wal = 0;
    let corrupt = 0;
    const snap = () => ({ leaves: leaves.map((l) => l.length), wal, units });
    let tornKey = null; // the first key of a half-written page, to find it again after later splits
    ops.writes.forEach((key, i) => {
      const was = units;
      if (cfg.wal === 'on') { wal++; units++; }
      let p = leaves.findIndex((l, k) => k === leaves.length - 1 || key < leaves[k + 1][0]);
      const page = leaves[p];
      const ev = { type: 'write', i, key, page: p, did: 'page' };
      if (page.includes(key)) units += PAGE; // overwrite in place: the whole page is rewritten
      else if (page.length < PAGE) { page.push(key); page.sort((a, b) => a - b); units += PAGE; }
      else {
        // full: split into two half-full pages and point the root at both (3 page writes)
        page.push(key);
        page.sort((a, b) => a - b);
        const right = page.splice(PAGE / 2 + 1);
        leaves.splice(p + 1, 0, right);
        units += 3 * PAGE;
        ev.did = 'split';
      }
      ev.state = snap();
      ev.cost = units - was;
      trace.push(ev);
      if (i === crashAt) {
        // a crash during a split leaves the root pointing at a half-written page, unless the log can redo it
        const torn = ev.did === 'split' && cfg.wal !== 'on' ? 1 : 0;
        corrupt = torn;
        // the new right-hand page is the one the crash left half-written
        if (torn) tornKey = leaves[p + 1][0];
        trace.push({ type: 'crash', i, lost: 0, corrupt: torn, during: ev.did, page: torn ? p + 1 : p });
      }
    });
    let total = 0;
    ops.reads.forEach((key, j) => {
      const p = leaves.findIndex((l, k) => k === leaves.length - 1 || key < leaves[k + 1][0]);
      total += 2; // the root page, then one leaf page
      trace.push({ type: 'read', j, key, page: p, found: leaves[p].includes(key), cost: 2 });
    });
    const tornAt = tornKey == null ? null : leaves.findIndex((l) => l.includes(tornKey));
    return { trace, units, lost: 0, corrupt, worst: 2, avg: total / READS, stalePct: 0, tornAt };
  }

  function run(cfg, seed) {
    const rng = DDIA.sim.rng(seed);
    const ops = workload(cfg, rng);
    const crashAt = cfg.crash === 'midway' ? rng.int(20, 59) : -1;
    const r = (cfg.engine === 'lsm' ? lsm : btree)(cfg, rng, ops, crashAt);
    const amp = Math.round((r.units / WRITES) * 10) / 10;
    r.trace.push({ type: 'done', amp, units: r.units, avg: Math.round(r.avg * 10) / 10, worst: r.worst, stale: r.stalePct, tornAt: r.tornAt });
    return {
      trace: r.trace,
      stats: {
        lost: r.lost, corrupt: r.corrupt,
        heavy: amp > HEAVY ? 1 : 0, slow: r.worst > SLOW ? 1 : 0, bloat: r.stalePct > BLOAT ? 1 : 0,
        amp,
      },
    };
  }

  /* ---------- the lab ---------- */
  const SEEDS = Array.from({ length: 100 }, (_, i) => i + 1);
  const yn = (v) => (v ? 'yes' : 'no');
  const ENGINE_LABEL = { lsm: 'LSM-tree', btree: 'B-tree' };
  const LOAD_LABEL = { inserts: 'New keys', updates: 'Same keys again', misses: 'Reads of missing keys' };
  const onOff = [{ value: 'off', label: 'Off' }, { value: 'on', label: 'On' }];
  const LSM_ONLY = ['compact', 'bloom'];

  DDIA.lab({
    id: 'storage',
    title: 'Storage engines lab',
    short: 'Storage',
    tagline: 'Write the same keys two ways, then count what the disk does',
    chapters: [3],
    styles: ['knobs', 'challenges'],
    // hub thumbnail: a memtable over a stack of sorted segments, beside a small B-tree
    thumb: '<svg viewBox="0 0 200 110">' +
      '<rect x="12" y="12" width="76" height="20" rx="5" fill="var(--k-primary-f)" stroke="var(--k-primary-s)" stroke-width="1.6"/>' +
      [0, 1, 2].map((k) => `<rect x="12" y="${44 + k * 18}" width="${76 - k * 14}" height="12" rx="4" fill="var(--k-data-f)" stroke="var(--k-data-s)" stroke-width="1.4"/>`).join('') +
      '<rect x="128" y="14" width="44" height="18" rx="4" fill="var(--k-neutral-f)" stroke="var(--k-neutral-s)" stroke-width="1.6"/>' +
      [0, 1, 2, 3].map((k) => `<rect x="${108 + k * 22}" y="62" width="18" height="30" rx="3" fill="var(--k-info-f)" stroke="var(--k-info-s)" stroke-width="1.4"/><path d="M150 32 L${117 + k * 22} 62" stroke="var(--k-neutral-s)" stroke-width="1.2"/>`).join('') + '</svg>',
    // scenario card drawing: the engine's shape, the helpers switched on, and a crash if one is coming
    sketch(cfg) {
      let s = '';
      if (cfg.engine === 'lsm') {
        s += '<rect x="30" y="6" width="84" height="16" rx="4" fill="var(--k-primary-f)" stroke="var(--k-primary-s)" stroke-width="1.5"/>';
        const segs = cfg.compact === 'on' ? [60] : [70, 70, 70, 70];
        segs.forEach((w, k) => { s += `<rect x="30" y="${28 + k * 9}" width="${w}" height="6" rx="3" fill="var(--k-data-f)" stroke="var(--k-data-s)" stroke-width="1.2"/>`; });
        if (cfg.bloom === 'on') s += '<circle cx="112" cy="40" r="6" fill="none" stroke="var(--k-good-s)" stroke-width="1.6"/><path d="M109 40h6M112 37v6" stroke="var(--k-good-s)" stroke-width="1.4"/>';
      } else {
        s += '<rect x="52" y="6" width="40" height="14" rx="3" fill="var(--k-neutral-f)" stroke="var(--k-neutral-s)" stroke-width="1.5"/>';
        for (let k = 0; k < 5; k++) s += `<rect x="${24 + k * 20}" y="34" width="16" height="22" rx="3" fill="var(--k-info-f)" stroke="var(--k-info-s)" stroke-width="1.3"/><path d="M72 20 L${32 + k * 20} 34" stroke="var(--k-neutral-s)" stroke-width="1"/>`;
      }
      if (cfg.wal === 'on') s += '<rect x="136" y="44" width="60" height="10" rx="3" fill="var(--k-good-f)" stroke="var(--k-good-s)" stroke-width="1.3"/>';
      if (cfg.crash === 'midway') s += '<path d="M200 14l14 14M214 14l-14 14" stroke="var(--k-bad-s)" stroke-width="2.4" stroke-linecap="round"/>';
      const load = { inserts: 'new keys', updates: 'same keys', misses: 'missing keys' }[cfg.load];
      return `<svg viewBox="0 0 240 84">${s}<text x="120" y="78" text-anchor="middle" font-size="15" font-weight="600" fill="var(--text-2)" style="font-family:var(--font-body)">${ENGINE_LABEL[cfg.engine]}, ${load}</text></svg>`;
    },
    knobs: [
      { id: 'engine', label: 'Storage engine', options: [{ value: 'lsm', label: 'LSM-tree' }, { value: 'btree', label: 'B-tree' }] },
      { id: 'load', label: 'Workload', options: Object.keys(LOAD_LABEL).map((k) => ({ value: k, label: LOAD_LABEL[k] })) },
      { id: 'compact', label: 'Compaction', options: onOff },
      { id: 'bloom', label: 'Bloom filters', options: onOff },
      { id: 'wal', label: 'Write-ahead log', options: onOff },
      { id: 'crash', label: 'Crash', options: [{ value: 'none', label: 'None' }, { value: 'midway', label: 'Midway' }] },
    ],
    defaults: { engine: 'lsm', load: 'inserts', compact: 'on', bloom: 'off', wal: 'off', crash: 'none' },
    normalize(c) {
      if (!ENGINE_LABEL[c.engine]) c.engine = 'lsm';
      if (!LOAD_LABEL[c.load]) c.load = 'inserts';
      ['compact', 'bloom', 'wal'].forEach((k) => { if (!['off', 'on'].includes(c[k])) c[k] = 'off'; });
      if (!['none', 'midway'].includes(c.crash)) c.crash = 'none';
      // compaction and Bloom filters are LSM-tree parts: a B-tree ignores them, but they keep their values
      // so that switching back to the LSM-tree restores the setup the learner had
      return c;
    },
    disabled: (cfg, knob, value) => cfg.engine === 'btree' && LSM_ONLY.includes(knob) && value === 'on',
    describe: (cfg) => `${ENGINE_LABEL[cfg.engine]}, ${LOAD_LABEL[cfg.load].toLowerCase()}`,

    run,
    defaultInput: () => 1,
    samples: (cfg, count) => (count ? Array.from({ length: count }, (_, i) => i + 1) : SEEDS),
    nextInput: (cfg, seed) => (seed % SEEDS.length) + 1,
    nextLabel: 'Next run',
    inputKey: String,
    parseInput: (s) => { const x = parseInt(s, 10); return x >= 1 && x <= 100000 ? x : null; },
    inputLabel: (seed) => `run #${seed}`,
    sampleNoun: ['run', 'runs'],

    metrics: [
      { id: 'lost', label: 'Writes lost in the crash', kind: 'bad' },
      { id: 'corrupt', label: 'Tree corrupted', kind: 'bad', fmt: yn },
      { id: 'heavy', label: `Writes cost over ${HEAVY}× on disk`, kind: 'warn', fmt: yn },
      { id: 'slow', label: `A read checks over ${SLOW} places`, kind: 'warn', fmt: yn },
      { id: 'bloat', label: 'Disk mostly old versions', kind: 'warn', fmt: yn },
      { id: 'amp', label: 'Disk writes per write', kind: 'neutral', plain: true, fmt: (v) => `${v}×` },
    ],
    classify(st) {
      if (st.lost) return { kind: 'bad', label: 'writes lost' };
      if (st.corrupt) return { kind: 'bad', label: 'tree corrupted' };
      if (st.heavy) return { kind: 'warn', label: 'heavy writes' };
      if (st.slow) return { kind: 'warn', label: 'slow reads' };
      if (st.bloat) return { kind: 'warn', label: 'disk bloat' };
      return { kind: 'good', label: 'lean and quick' };
    },

    presets: [
      {
        id: 'btree-writes', title: 'B-tree writes',
        blurb: 'Small writes into fixed pages. What does the disk pay?',
        config: { engine: 'btree', load: 'inserts' }, knobs: ['engine', 'load'],
        nudge: 'Switch to the LSM-tree and compare the disk writes.',
        predict: { q: 'New keys go into a B-tree. Will each write cost the disk more than 4× its own size?', metric: 'heavy' },
      },
      {
        id: 'lsm-writes', title: 'LSM-tree writes',
        blurb: 'Buffer writes in memory, flush sorted segments. Cheaper?',
        config: { engine: 'lsm', load: 'inserts', compact: 'on' }, knobs: ['engine', 'compact'],
        nudge: 'Turn compaction off: writes get cheaper, but watch the reads.',
        predict: { q: 'Writes go to memory, then out as sorted segments that compaction merges. More than 4× per write?', metric: 'heavy' },
      },
      {
        id: 'no-compaction', title: 'Segments pile up',
        blurb: 'No compaction. How many places does a read check?',
        config: { engine: 'lsm', load: 'misses', compact: 'off', bloom: 'off' }, knobs: ['compact', 'bloom', 'load'],
        nudge: 'Add Bloom filters, or turn compaction back on.',
        predict: { q: 'Eight segments and no compaction. Will a read of a missing key check more than 3 of them?', metric: 'slow' },
      },
      {
        id: 'overwrites', title: 'Old versions pile up',
        blurb: 'The same keys, over and over. What fills the disk?',
        config: { engine: 'lsm', load: 'updates', compact: 'off' }, knobs: ['compact', 'engine'],
        nudge: 'Turn compaction on and watch the old versions go.',
        predict: { q: 'Eight keys are overwritten again and again, with no compaction. Will old versions fill most of the disk?', metric: 'bloat' },
      },
      {
        id: 'crash-lsm', title: 'Crash before a flush',
        blurb: 'The power fails. What happens to the memtable?',
        config: { engine: 'lsm', load: 'inserts', crash: 'midway', wal: 'off' }, knobs: ['wal', 'engine'],
        nudge: 'Turn the write-ahead log on and crash again.',
        predict: { q: 'No write-ahead log, and the power fails midway. Will acknowledged writes be lost?', metric: 'lost' },
      },
      {
        id: 'crash-btree', title: 'Crash during a split',
        blurb: 'A split rewrites three pages. What if it stops halfway?',
        config: { engine: 'btree', load: 'inserts', crash: 'midway', wal: 'off' }, knobs: ['wal', 'load'], input: 6, // a run where the crash tears a split
        nudge: 'Turn the write-ahead log on: it can redo the split.',
        predict: { q: 'The B-tree crashes midway, with no log. Will the tree end up corrupted?', metric: 'corrupt' },
      },
      {
        id: 'free-play', title: 'Free play',
        blurb: 'Everything unlocked. Pick an engine and its helpers.',
        config: { engine: 'lsm', load: 'inserts', compact: 'on' }, knobs: ['engine', 'load', 'compact'],
        nudge: 'Everything is unlocked. Try both engines on each workload.',
      },
    ],

    challenges: [
      {
        id: 'cheap-and-quick', title: 'Cheap writes, quick reads',
        blurb: 'Readers ask for missing keys. Keep writes and reads cheap.',
        goal: 'Readers keep asking for keys that don’t exist. Keep writes at most 4× on disk, and never check more than 3 places per read.',
        config: { engine: 'btree', load: 'misses', compact: 'off', bloom: 'off' }, knobs: ['engine', 'bloom', 'compact'],
        criteria: [
          { label: `Writes cost at most ${HEAVY}× on disk`, metric: 'heavy', max: 0 },
          { label: `No read checks over ${SLOW} places`, metric: 'slow', max: 0 },
        ],
        hint: 'One engine writes cheaply. What tells it a key is surely absent from a segment?',
        solution: { config: { engine: 'lsm', bloom: 'on' }, why: 'The LSM-tree writes sequentially, and a Bloom filter says “not here” without reading the segment.' },
      },
      {
        id: 'crash-proof', title: 'Crash-proof',
        blurb: 'Survive a crash with nothing lost and nothing torn.',
        goal: 'The power fails midway through the writes. Lose no acknowledged write and leave no half-done split, whichever engine you pick.',
        config: { engine: 'lsm', load: 'inserts', crash: 'midway', wal: 'off' }, knobs: ['engine', 'wal'],
        criteria: [
          { label: 'No acknowledged write is lost', metric: 'lost', max: 0 },
          { label: 'The tree is never corrupted', metric: 'corrupt', max: 0 },
        ],
        hint: 'Neither engine is safe on its own. What do both write first?',
        solution: { config: { wal: 'on' }, why: 'The log is written before anything else, so recovery can replay the memtable or redo the split.' },
      },
      {
        id: 'lean', title: 'Lean disk, cheap writes',
        blurb: 'Overwrite the same keys without filling the disk.',
        goal: 'Eight keys are overwritten again and again. Keep old versions to at most half the disk, and writes at most 4× their size.',
        config: { engine: 'lsm', load: 'updates', compact: 'off' }, knobs: ['compact', 'engine'],
        criteria: [
          { label: 'Old versions take at most half the disk', metric: 'bloat', max: 0 },
          { label: `Writes cost at most ${HEAVY}× on disk`, metric: 'heavy', max: 0 },
        ],
        hint: 'A B-tree has no old versions, but what does each small write cost it?',
        solution: { config: { compact: 'on' }, why: 'Compaction keeps only the newest version of each key, and it still writes far less than rewriting pages.' },
      },
    ],

    view,
  });

  /* ---------- view: the engine's structure, redrawn from each write's snapshot ---------- */
  const RULE = {
    lsm: 'LSM-tree: a sorted memtable in memory, sorted segments on disk',
    btree: 'B-tree: fixed pages on disk, updated in place',
  };
  const ANIMATED = 10; // writes that fly one by one; the rest land in batches
  function view(el, v, api) {
    const box = v.wrap(el);
    const holder = v.h('div');
    box.appendChild(holder);
    const log = v.log(box, { title: 'What happened, newest first', max: 6 });
    let st, app, ticker, disk, dyn, anchors, walText;

    function draw(cfg) {
      holder.textContent = '';
      st = v.stage(holder, { w: 560, h: 300, label: `${RULE[cfg.engine]}; writes and reads flow from the app` });
      st.text(280, 18, RULE[cfg.engine], { size: 14.5, weight: 700, kind: 'text' });
      app = st.node({ x: 52, y: 104, w: 56, h: 56, shape: 'person', label: 'App', kind: 'data' });
      ticker = st.text(10, 172, ' ', { size: 14, anchor: 'start', mono: true, kind: 'text2' });
      disk = st.text(10, 214, 'disk writes 0', { size: 14, anchor: 'start', mono: true, kind: 'muted' });
      walText = cfg.wal === 'on' ? st.text(10, 238, 'log 0', { size: 14, anchor: 'start', mono: true, kind: 'good' }) : null;
      if (cfg.engine === 'lsm') {
        st.box(128, 36, 168, 70, { kind: 'primary' });
        st.text(140, 58, 'Memtable, in memory', { size: 14, anchor: 'start', weight: 600, kind: 'text2' });
        st.text(330, 50, 'Segments on disk, newest first', { size: 14, anchor: 'start', weight: 600, kind: 'text2' });
      } else st.text(330, 50, 'Pages on disk', { size: 14, anchor: 'start', weight: 600, kind: 'text2' });
      dyn = [];
      anchors = {};
    }
    const clear = () => { dyn.forEach((x) => x.remove()); dyn = []; };
    const keep = (x) => { dyn.push(x); return x; };

    // LSM: eight memtable slots, then one bar per segment (its old versions shaded)
    function paintLSM(s, o) {
      clear();
      for (let k = 0; k < MEM; k++) keep(st.rect(140 + k * 19, 70, 15, 22, { kind: k < s.mem ? 'primary' : 'neutral', rx: 3 }));
      anchors.mem = { x: 212, y: 80 };
      anchors.segs = s.segs.map((seg, k) => {
        const y = 64 + k * 26;
        const w = Math.min(160, 64 + seg.n * 1.5); // wide enough for its label; capped so "filtered" still fits beside it
        keep(st.rect(330, y, w, 20, { kind: o && o.read && o.read.has(k) ? 'warn' : 'data', rx: 5 }));
        // the old versions' share, shaded red, then the label on top of both
        if (seg.stale) keep(st.rect(330 + w - Math.max(4, (w * seg.stale) / seg.n), y, Math.max(4, (w * seg.stale) / seg.n), 20, { kind: 'bad', rx: 5 }));
        keep(st.text(330 + w / 2, y + 15, `${seg.n} keys`, { size: 14, weight: 600, kind: 'text', layer: 'top' }));
        if (o && o.skipped && o.skipped.has(k)) keep(st.text(330 + w + 6, y + 15, 'filtered', { size: 14, anchor: 'start', kind: 'good' }));
        return { x: 330 + w / 2, y: y + 10 };
      });
    }
    // B-tree: one root page, then the leaf pages, each filled to its key count
    function paintBTree(s, o) {
      clear();
      const n = s.leaves.length;
      keep(st.rect(370, 60, 120, 26, { kind: 'neutral', rx: 5, label: 'root page', size: 14 }));
      anchors.root = { x: 430, y: 73 };
      const w = Math.min(34, (410 - (n - 1) * 4) / n);
      const x0 = 330 + (220 - (n * w + (n - 1) * 4)) / 2 - 90;
      anchors.leaves = s.leaves.map((c, k) => {
        const x = x0 + k * (w + 4);
        const torn = o && o.torn === k;
        keep(st.line(430, 86, x + w / 2, 130, { kind: 'muted', width: 1 }));
        keep(st.rect(x, 130, w, 48, { kind: torn ? 'bad' : o && o.hit === k ? 'warn' : 'ghost', rx: 4 }));
        keep(st.rect(x + 2, 178 - 2 - (44 * c) / PAGE, w - 4, (44 * c) / PAGE, { kind: torn ? 'bad' : 'info', rx: 2 }));
        return { x: x + w / 2, y: 154 };
      });
    }
    const paint = (cfg, s, o) => (cfg.engine === 'lsm' ? paintLSM(s, o) : paintBTree(s, o));
    function setDisk(units, wal) {
      disk.set(`disk writes ${units}`);
      if (walText) walText.set(`log ${wal}`);
    }

    function logWrite(e, cfg) {
      if (e.did === 'flush') log.add(`${MEM} writes buffered: the memtable is flushed as a sorted segment`, 'info');
      else if (e.did === 'compact') log.add('Four segments: compaction merges them, keeping the newest versions', 'good');
      else if (e.did === 'split') log.add(`Page ${e.page + 1} is full: split in two, 3 pages rewritten`, 'warn');
    }
    function logCrash(e, cfg) {
      if (cfg.engine === 'lsm') {
        if (e.lost) log.add(`Crash! The memtable held ${e.lost} acknowledged writes; without a log they are gone`, 'bad');
        else if (cfg.wal === 'on') log.add(`Crash! Recovery replays ${e.replayed} writes from the log`, 'good');
        else log.add('Crash! The memtable had just been flushed, so nothing was lost this time', 'good');
      } else if (e.corrupt) log.add('Crash in the middle of a split: the root points at a half-written page', 'bad');
      else if (cfg.wal === 'on' && e.during === 'split') log.add('Crash in the middle of a split: the log redoes it on restart', 'good');
      else log.add('Crash between page writes: each page write finished, so the tree is intact', 'good');
    }
    function logRead(e, cfg) {
      if (cfg.engine === 'btree') log.add(`read k=${e.key}: root, then one leaf page (2 reads)`, 'info');
      else {
        const skipped = e.checked.filter((c) => c.skipped).length;
        log.add(`read k=${e.key}: ${e.cost} segment${e.cost === 1 ? '' : 's'} read${skipped ? `, ${skipped} skipped by Bloom filters` : ''}${e.found ? '' : ', not found'}`, e.cost > SLOW ? 'warn' : 'info');
      }
    }
    function finish(done, cfg) {
      disk.set(`disk writes ${done.units}`);
      log.add(`${done.amp}× disk writes per write; reads check ${done.avg} places on average`, done.amp > HEAVY ? 'warn' : 'good');
    }

    function render(result, cfg, input, o) {
      v.restart();
      draw(cfg);
      log.clear();
      const trace = result.trace;
      const writes = trace.filter((e) => e.type === 'write');
      paint(cfg, cfg.engine === 'lsm' ? { mem: 0, segs: [], wal: 0 } : { leaves: [0], wal: 0 });
      if (o.preview) return Promise.resolve();
      if (!o.animate) {
        const last = writes[writes.length - 1];
        const crash = trace.find((e) => e.type === 'crash');
        const done = trace[trace.length - 1];
        paint(cfg, last.state, crash && crash.corrupt ? { torn: done.tornAt } : null);
        if (crash) logCrash(crash, cfg);
        const reads = trace.filter((e) => e.type === 'read');
        reads.slice(-3).forEach((e) => logRead(e, cfg));
        finish(trace[trace.length - 1], cfg);
        if (walText) walText.set(`log ${last.state.wal}`);
        return Promise.resolve();
      }
      return animate(trace, cfg);
    }

    async function animate(trace, cfg) {
      let shown = 0;
      let batch = 0;
      for (const e of trace) {
        if (e.type === 'write') {
          ticker.set(`write k=${e.key}`);
          if (shown < ANIMATED) {
            shown++;
            const to = cfg.engine === 'lsm' ? anchors.mem : anchors.leaves[Math.min(e.page, anchors.leaves.length - 1)];
            await st.send(app, to, { label: `k=${e.key}`, kind: 'data', dur: api.pace(450) });
            paint(cfg, e.state);
            if (e.did === 'flush' || e.did === 'compact') await v.sleep(api.pace(250));
          } else if (++batch % 6 === 0 || e.did !== 'mem' && e.did !== 'page') {
            paint(cfg, e.state);
            await v.sleep(api.pace(e.did === 'mem' || e.did === 'page' ? 90 : 260));
          }
          logWrite(e, cfg);
          setDisk(e.state.units, e.state.wal);
        } else if (e.type === 'crash') {
          const w = trace.find((x) => x.type === 'write' && x.i === e.i);
          paint(cfg, cfg.engine === 'lsm' && e.lost ? Object.assign({}, w.state, { mem: 0 }) : w.state, e.corrupt ? { torn: e.page } : null);
          ticker.set('crash!', 'bad');
          logCrash(e, cfg);
          await v.sleep(api.pace(1100));
          ticker.set(' ', 'text2');
        } else if (e.type === 'read') {
          ticker.set(`read k=${e.key}`);
          const last = trace.filter((x) => x.type === 'write').pop().state;
          if (e.j < 3) {
            if (cfg.engine === 'lsm') {
              paint(cfg, last, { read: new Set(e.checked.filter((c) => !c.skipped).map((c) => c.s)), skipped: new Set(e.checked.filter((c) => c.skipped).map((c) => c.s)) });
              await st.send(app, anchors.segs[0] || anchors.mem, { label: 'read', kind: 'info', dur: api.pace(450) });
            } else {
              await st.send(app, anchors.root, { label: 'read', kind: 'info', dur: api.pace(350) });
              paint(cfg, last, { hit: e.page });
              await st.send(anchors.root, anchors.leaves[e.page], { kind: 'info', dur: api.pace(300) });
            }
            logRead(e, cfg);
            await v.sleep(api.pace(350));
          } else if (e.j === READS - 1) paint(cfg, last);
        } else if (e.type === 'done') finish(e, cfg);
      }
    }
    return { render };
  }

  DDIA.labs.storageModel = { run, WRITES, READS, MEM, TIER, PAGE, HEAVY, SLOW, BLOAT };
})();
