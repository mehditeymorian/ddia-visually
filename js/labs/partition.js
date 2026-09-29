/* DDIA Visual Guide — Partitioning lab (chapter 6).
 * Where does a key go? A key range, a hash into 24 fixed partitions, hash mod N, or a compound key.
 * The model is pure and step-based: 480 writes, an optional new node halfway, then one range read.
 * The view replays it: keys fly to nodes, a new node takes whole partitions, a range read fans out.
 * See LABS.md. */
(function () {
  'use strict';
  const DDIA = (window.DDIA = window.DDIA || {});

  /* ---------- model ---------- */
  const P = 24;            // fixed partitions (key range, hash and compound placements)
  const WRITES = 480;
  const HALF = WRITES / 2; // "Add a node" joins here
  const CELEB = 200;       // writes to the celebrity key, about 42% of all
  const HOT_KEY = 'user:0042';
  const SENSORS = 8;
  const HOT = 1.5;         // a node is hot above 1.5× its fair share of a phase's writes
  const ANIMATED = 12;     // writes that fly one by one; the rest land in batches
  const READ_FROM = 2000, READ_TO = 2399; // the users range read
  const PLACE_LABEL = { range: 'Key range', hash: 'Hash, 24 partitions', mod: 'Hash mod N', compound: 'Compound key' };
  const PLACE_RULE = {
    range: 'Key range: each partition owns a slice of sorted keys',
    hash: 'Hash: key → one of 24 partitions → a node',
    mod: 'Hash mod N: key → node, no partitions',
    compound: 'Compound key: hash the first part, sort the rest',
  };
  const pad = (n, w) => String(n).padStart(w, '0');

  // FNV-1a: small, deterministic, and spreads short keys well enough
  function hash(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h;
  }

  /** The 480 writes of one run. pos is the key's place in the sorted key space, 0…1. */
  function workload(cfg, rng) {
    const out = [];
    if (cfg.load === 'sensors') {
      // eight sensors report once a second for a minute, in a random order each second
      for (let sec = 0; sec < WRITES / SENSORS; sec++) {
        const order = Array.from({ length: SENSORS }, (_, i) => i + 1);
        for (let i = order.length - 1; i > 0; i--) { const j = rng.int(0, i); [order[i], order[j]] = [order[j], order[i]]; }
        order.forEach((s) => out.push({ first: `sensor-${s}`, rest: `10:00:${pad(sec, 2)}`, pos: (10 * 3600 + sec) / 86400, sensor: s }));
      }
      return out;
    }
    const n = cfg.load === 'celebrity' ? WRITES - CELEB : WRITES;
    for (let i = 0; i < n; i++) {
      const u = rng.int(0, 9999);
      out.push({ first: `user:${pad(u, 4)}`, rest: '', pos: u / 10000, user: u });
    }
    if (cfg.load === 'celebrity') {
      for (let i = 0; i < CELEB; i++) out.splice(rng.int(0, out.length), 0, { first: HOT_KEY, rest: '', pos: 42 / 10000, user: 42, hot: true });
      if (cfg.salt === 'suffix') {
        // split the hot key into ten; the suffixed keys still sort right next to each other
        out.forEach((w) => { if (w.hot) { w.first = `${HOT_KEY}#${rng.int(0, 9)}`; w.pos = 42.5 / 10000; } });
      }
    }
    return out;
  }

  // sensor keys are time first (the natural log order) unless the compound key puts the sensor first
  const keyOf = (w, cfg) => (w.sensor ? (cfg.place === 'compound' ? `${w.first}/${w.rest}` : `${w.rest}/${w.first}`) : w.first);
  function partOf(w, cfg) {
    if (cfg.place === 'range') return Math.min(P - 1, Math.floor(w.pos * P));
    if (cfg.place === 'compound') return hash(w.first) % P;
    return hash(keyOf(w, cfg)) % P;
  }

  /** Node n joins: it takes whole partitions, one at a time from whichever node holds the most. */
  function grow(owner, n) {
    const took = [];
    const take = Math.floor(P / (n + 1));
    for (let k = 0; k < take; k++) {
      const counts = Array(n).fill(0);
      owner.forEach((o) => { if (o < n) counts[o]++; });
      const donor = counts.indexOf(Math.max(...counts));
      const p = owner.lastIndexOf(donor);
      owner[p] = n;
      took.push({ part: p, from: donor });
    }
    return took;
  }

  // a phase is hot when its busiest node took more than HOT × its fair share of the phase's writes
  function verdict(ph) {
    const top = Math.max(...ph.load);
    return { hot: top / ph.total > HOT / ph.n ? 1 : 0, node: ph.load.indexOf(top), share: top / ph.total };
  }

  function run(cfg, seed) {
    const rng = DDIA.sim.rng(seed);
    const writes = workload(cfg, rng);
    let n = cfg.nodes;
    const owner = Array.from({ length: P }, (_, p) => p % n);
    const nodeOf = (w) => (cfg.place === 'mod' ? hash(keyOf(w, cfg)) % n : owner[partOf(w, cfg)]);
    const trace = [{ type: 'start', n, owner: owner.slice() }];
    const phases = [{ n, load: Array(n).fill(0), total: 0 }];
    const stored = new Map(); // distinct key → its latest write
    let moved = 0;
    writes.forEach((w, i) => {
      if (i === HALF && cfg.grow === 'add') {
        const first = verdict(phases[0]);
        const keys = [...stored.values()];
        const before = keys.map(nodeOf);
        const took = cfg.place === 'mod' ? null : grow(owner, n);
        n++;
        const after = keys.map(nodeOf);
        const flows = new Map();
        let m = 0;
        after.forEach((a, j) => {
          if (a === before[j]) return;
          m++;
          const k = before[j] + '>' + a;
          flows.set(k, (flows.get(k) || 0) + 1);
        });
        moved = keys.length ? Math.round((m / keys.length) * 100) : 0;
        trace.push({
          type: 'join', node: n - 1, took, moved, owner: owner.slice(), before: first,
          flows: [...flows].map(([k, c]) => { const [from, to] = k.split('>').map(Number); return { from, to, keys: c }; }),
        });
        phases.push({ n, load: Array(n).fill(0), total: 0 });
      }
      const node = nodeOf(w);
      const ph = phases[phases.length - 1];
      ph.load[node]++;
      ph.total++;
      const key = keyOf(w, cfg);
      stored.set(key, w);
      trace.push({ type: 'write', i, key, part: cfg.place === 'mod' ? null : partOf(w, cfg), node });
    });

    // one range read: which nodes might hold the range?
    let nodes;
    let label;
    let short;
    const all = Array.from({ length: n }, (_, k) => k);
    if (cfg.load === 'sensors') {
      label = 'sensor 3, the whole minute';
      short = 'read sensor 3';
      const local = cfg.place === 'range' || cfg.place === 'compound';
      nodes = local ? [...new Set([...stored.values()].filter((w) => w.sensor === 3).map(nodeOf))] : all;
    } else {
      label = `users ${READ_FROM}–${READ_TO}`;
      short = `read ${READ_FROM}–${READ_TO}`;
      if (cfg.place === 'range') {
        const set = new Set();
        for (let p = Math.floor((READ_FROM / 10000) * P); p <= Math.floor((READ_TO / 10000) * P); p++) set.add(owner[p]);
        nodes = [...set];
      } else nodes = all;
    }
    nodes.sort((a, b) => a - b);
    trace.push({ type: 'read', label, short, nodes, of: n });

    const verdicts = phases.map(verdict);
    const last = verdicts[verdicts.length - 1];
    const hot = verdicts.some((x) => x.hot) ? 1 : 0;
    trace.push({ type: 'done', hot, last, load: phases[phases.length - 1].load });
    return {
      trace,
      stats: { hot, massMove: moved > 50 ? 1 : 0, scatter: nodes.length === n ? 1 : 0, busiest: Math.round(last.share * 100), moved },
    };
  }

  /* ---------- the lab ---------- */
  const SEEDS = Array.from({ length: 100 }, (_, i) => i + 1);
  const yn = (v) => (v ? 'yes' : 'no');
  const PLACES = ['range', 'hash', 'mod', 'compound'];
  const LOADS = ['users', 'sensors', 'celebrity'];

  DDIA.lab({
    id: 'partition',
    title: 'Partitioning lab',
    short: 'Partitioning',
    tagline: 'Place keys on nodes, add a node, find the hot spot',
    chapters: [6],
    styles: ['knobs', 'challenges'],
    // hub thumbnail: four nodes holding partitions, and a fifth that takes whole ones
    thumb: '<svg viewBox="0 0 200 110">' +
      [0, 1, 2, 3].map((k) => `<rect x="${10 + k * 38}" y="30" width="32" height="50" rx="6" fill="var(--k-neutral-f)" stroke="var(--k-neutral-s)" stroke-width="1.6"/>` +
        [0, 1, 2].map((j) => `<rect x="${16 + k * 38}" y="${38 + j * 13}" width="20" height="8" rx="3" fill="var(--k-data-f)" stroke="var(--k-data-s)" stroke-width="1.4"/>`).join('')).join('') +
      '<rect x="162" y="30" width="32" height="50" rx="6" fill="none" stroke="var(--k-info-s)" stroke-width="1.6" stroke-dasharray="4 3"/>' +
      '<rect x="168" y="38" width="20" height="8" rx="3" fill="var(--k-info-f)" stroke="var(--k-info-s)" stroke-width="1.4"/>' +
      '<path d="M140 26 Q160 12 176 30" stroke="var(--k-info-s)" stroke-width="1.6" fill="none" stroke-dasharray="3 3"/></svg>',
    // scenario card drawing: the workload's shape, then the nodes and their partitions (setup only, never load)
    sketch(cfg) {
      const boxes = cfg.nodes + (cfg.grow === 'add' ? 1 : 0);
      const gap = 8;
      const w = (216 - gap * (boxes - 1)) / boxes;
      let dots = '';
      if (cfg.load === 'sensors') for (let i = 0; i < 8; i++) dots += `<circle cx="${106 + i * 4}" cy="10" r="3.5" fill="var(--k-data-f)" stroke="var(--k-data-s)" stroke-width="1.2"/>`;
      else {
        for (let i = 0; i < 9; i++) dots += `<circle cx="${32 + i * 22}" cy="10" r="3" fill="var(--k-data-f)" stroke="var(--k-data-s)" stroke-width="1.2"/>`;
        if (cfg.load === 'celebrity') dots += '<circle cx="54" cy="10" r="7" fill="var(--k-data-s)" stroke="var(--k-data-s)" stroke-width="1.2"/>';
      }
      const per = P / cfg.nodes;
      let nodes = '';
      for (let k = 0; k < boxes; k++) {
        const x = 12 + k * (w + gap);
        const extra = k >= cfg.nodes;
        nodes += `<rect x="${x}" y="24" width="${w}" height="30" rx="6" fill="${extra ? 'none' : 'var(--k-neutral-f)'}" stroke="var(--k-${extra ? 'info' : 'neutral'}-s)" stroke-width="1.6"${extra ? ' stroke-dasharray="4 3"' : ''}/>`;
        if (cfg.place === 'mod' || extra) continue;
        const step = (w - 12) / per;
        for (let j = 0; j < per; j++) nodes += `<rect x="${x + 6 + j * step + step / 2 - 1.5}" y="31" width="3" height="16" rx="1.5" fill="var(--k-primary-s)"/>`;
      }
      return `<svg viewBox="0 0 240 84">${dots}${nodes}<text x="120" y="76" text-anchor="middle" font-size="15" font-weight="600" fill="var(--text-2)" style="font-family:var(--font-body)">${PLACE_LABEL[cfg.place]}</text></svg>`;
    },
    knobs: [
      { id: 'place', label: 'Key goes to', options: PLACES.map((p) => ({ value: p, label: PLACE_LABEL[p] })) },
      { id: 'load', label: 'Workload', options: [{ value: 'users', label: 'Users' }, { value: 'sensors', label: 'Sensor readings' }, { value: 'celebrity', label: 'A celebrity' }] },
      { id: 'nodes', label: 'Nodes N', options: [{ value: 3, label: '3' }, { value: 4, label: '4' }] },
      { id: 'grow', label: 'Then', options: [{ value: 'none', label: 'Keep N' }, { value: 'add', label: 'Add a node' }] },
      { id: 'salt', label: 'Hot key', options: [{ value: 'off', label: 'As is' }, { value: 'suffix', label: 'Random suffix' }] },
    ],
    defaults: { place: 'hash', load: 'users', nodes: 4, grow: 'none', salt: 'off' },
    normalize(c) {
      if (!PLACES.includes(c.place)) c.place = 'hash';
      if (!LOADS.includes(c.load)) c.load = 'users';
      c.nodes = Number(c.nodes) === 3 ? 3 : 4;
      if (!['none', 'add'].includes(c.grow)) c.grow = 'none';
      // the suffix only splits the celebrity key, so other workloads keep keys as they are
      if (!['off', 'suffix'].includes(c.salt) || c.load !== 'celebrity') c.salt = 'off';
      return c;
    },
    disabled: (cfg, knob, value) => knob === 'salt' && value === 'suffix' && cfg.load !== 'celebrity',
    describe: (cfg) => `${PLACE_LABEL[cfg.place]}, N = ${cfg.nodes}`,

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
      { id: 'hot', label: 'Hot spot', kind: 'bad', fmt: yn },
      { id: 'massMove', label: 'Most keys moved', kind: 'warn', fmt: yn },
      { id: 'scatter', label: 'Range read asks every node', kind: 'warn', fmt: yn },
      { id: 'busiest', label: 'Busiest node', kind: 'neutral', plain: true, fmt: (v) => `${v}% of writes` },
      { id: 'moved', label: 'Keys moved', kind: 'neutral', plain: true, fmt: (v) => `${v}%` },
    ],
    classify(st) {
      if (st.hot) return { kind: 'bad', label: 'hot spot' };
      if (st.massMove) return { kind: 'warn', label: 'most keys moved' };
      if (st.scatter) return { kind: 'warn', label: 'scatter read' };
      return { kind: 'good', label: 'balanced' };
    },

    presets: [
      {
        id: 'time-hotspot', title: 'Timestamps as keys',
        blurb: 'Keys that grow with time. Where do the writes land?',
        config: { load: 'sensors', place: 'range', nodes: 4 }, knobs: ['place', 'load'],
        nudge: 'Switch to hashing, then try a compound key.',
        predict: { q: 'Sensor readings keyed by time, split by key range. Will one node get a hot spot?', metric: 'hot' },
      },
      {
        id: 'hash-scatter', title: 'Hashing scatters ranges',
        blurb: 'Even spread, but what happens to a range read?',
        config: { load: 'users', place: 'hash', nodes: 4 }, knobs: ['place'],
        nudge: 'Compare key range: the same read asks just two nodes.',
        predict: { q: 'Users hashed into 24 partitions. Will reading users 2000–2399 ask every node?', metric: 'scatter' },
      },
      {
        id: 'celebrity', title: 'A celebrity key',
        blurb: 'One user gets many writes. Can hashing spread them?',
        config: { load: 'celebrity', place: 'hash', nodes: 4, salt: 'off' }, knobs: ['salt', 'place'],
        nudge: 'Add a random suffix and watch the load spread.',
        predict: { q: 'About 40% of writes hit one user. With hashing, is there a hot spot?', metric: 'hot' },
      },
      {
        id: 'mod-n', title: 'Add a node: hash mod N',
        blurb: 'A new node joins. How many keys move?',
        config: { load: 'users', place: 'mod', nodes: 4, grow: 'add' }, knobs: ['place', 'grow'],
        nudge: 'Switch to 24 fixed partitions and add the node again.',
        predict: { q: 'Hash mod N, then a fifth node joins. Will most keys move?', metric: 'massMove' },
      },
      {
        id: 'compound', title: 'Compound key',
        blurb: 'Hash one part of the key, sort the rest.',
        config: { load: 'sensors', place: 'compound', nodes: 4 }, knobs: ['place'],
        nudge: 'Check the hot spot readout too: still balanced?',
        predict: { q: 'Hash the sensor, sort its readings by time. Will reading one sensor ask every node?', metric: 'scatter' },
      },
      {
        id: 'free-play', title: 'Free play',
        blurb: 'Everything unlocked. Mix workloads, placements and growth.',
        config: { load: 'users', place: 'hash', nodes: 3 }, knobs: ['place', 'load', 'grow'],
        nudge: 'Everything is unlocked. Try the celebrity with a key range.',
      },
    ],

    challenges: [
      {
        id: 'calm-sensors', title: 'Sensors, no hot spot',
        blurb: 'Spread the sensor writes, but keep each sensor together.',
        goal: 'Eight sensors write every second. Avoid a hot spot, and read one sensor without asking every node.',
        config: { load: 'sensors', place: 'range', nodes: 4 }, knobs: ['place'],
        criteria: [
          { label: 'No hot spot', metric: 'hot', max: 0 },
          { label: 'Reading sensor 3 never asks every node', metric: 'scatter', max: 0 },
        ],
        hint: 'Time as the first part of the key sends every write to the same slice.',
        solution: { config: { place: 'compound' }, why: 'Hashing the sensor spreads the writes; sorting by time keeps each sensor on one node.' },
      },
      {
        id: 'cheap-grow', title: 'Grow without a storm',
        blurb: 'Add a fifth node without moving most keys.',
        goal: 'A fifth node joins halfway through. Most keys must stay where they are, with no hot spot.',
        config: { load: 'users', place: 'mod', nodes: 4, grow: 'add' }, knobs: ['place'],
        criteria: [
          { label: 'Most keys stay put', metric: 'massMove', max: 0 },
          { label: 'No hot spot', metric: 'hot', max: 0 },
        ],
        hint: 'Map keys to partitions once, then move whole partitions between nodes.',
        solution: { config: { place: 'hash' }, why: 'The new node takes whole partitions; no key ever changes partition.' },
      },
      {
        id: 'tame-celebrity', title: 'Tame the celebrity',
        blurb: 'One user gets many writes. Remove the hot spot.',
        goal: 'About 40% of all writes hit user:0042. No node may take more than 1.5× its fair share, in any run.',
        config: { load: 'celebrity', place: 'range', nodes: 4, salt: 'off' }, knobs: ['place', 'salt'],
        criteria: [{ label: 'No hot spot', metric: 'hot', max: 0 }],
        hint: 'A suffix only helps if the placement scatters neighbouring keys.',
        solution: { config: { place: 'hash', salt: 'suffix' }, why: 'The suffix splits one key into ten; hashing spreads the ten over many partitions.' },
      },
    ],

    view,
  });

  /* ---------- view: the app sends keys to node rows; bars fill with each node's share of the phase ---------- */
  const BAR_X = 350, BAR_W = 150;
  function view(el, v, api) {
    const box = v.wrap(el);
    const holder = v.h('div');
    box.appendChild(holder);
    const log = v.log(box, { title: 'What happened, newest first', max: 6 });
    let st, app, ticker, counter, rows, bars, pcts, threshold, thLabel, layout;

    // rows are laid out for the most nodes the run will have, so a joining node has a place waiting
    function draw(cfg) {
      holder.textContent = '';
      st = v.stage(holder, { w: 560, h: 300, label: 'An app writes keys; each node row shows its share of the writes' });
      const most = cfg.nodes + (cfg.grow === 'add' ? 1 : 0);
      const gapY = Math.min(58, 232 / most);
      const y0 = 162 - ((most - 1) * gapY) / 2;
      layout = Array.from({ length: most }, (_, k) => y0 + k * gapY);
      st.text(280, 18, PLACE_RULE[cfg.place], { size: 14.5, weight: 700, kind: 'text' });
      app = st.node({ x: 62, y: 150, w: 56, h: 56, shape: 'person', label: 'App', kind: 'data' });
      // left-aligned under the app so long sensor keys stay inside the stage and clear of the rows
      ticker = st.text(10, 222, ' ', { size: 14, mono: true, kind: 'text2', anchor: 'start' });
      counter = st.text(10, 250, '', { size: 14, kind: 'muted', mono: true, anchor: 'start' });
      rows = [];
      bars = [];
      pcts = [];
      for (let k = 0; k < cfg.nodes; k++) addRow(k, cfg);
      threshold = st.line(BAR_X, 52, BAR_X, 290, { kind: 'bad', dashed: true, width: 1.5 });
      thLabel = st.text(BAR_X, 44, 'hot above', { size: 14, kind: 'bad', anchor: 'middle' });
      moveThreshold(cfg.nodes);
    }
    function addRow(k, cfg, fresh) {
      const y = layout[k];
      rows[k] = st.node({ x: 250, y, w: 150, h: Math.min(46, layout.length > 4 ? 42 : 46), label: `Node ${k + 1}`, sub: '', kind: fresh ? 'info' : 'neutral' });
      st.rect(BAR_X, y - 7, BAR_W, 14, { kind: 'ghost', rx: 7 });
      bars[k] = st.rect(BAR_X, y - 7, 0, 14, { kind: 'data', rx: 7 });
      pcts[k] = st.text(BAR_X + BAR_W + 8, y + 5, '0%', { size: 14, anchor: 'start', mono: true, kind: 'text2' });
      subFor(k, cfg, null);
    }
    function moveThreshold(n) {
      const x = BAR_X + (BAR_W * HOT) / n;
      threshold.set({ x1: x, x2: x });
      thLabel.move(x, 44);
    }
    function subFor(k, cfg, owner) {
      if (cfg.place === 'mod') rows[k].set({ sub: `hash mod N = ${k}` });
      else if (owner) rows[k].set({ sub: `${owner.filter((o) => o === k).length} partitions` });
    }
    // Bars fill toward the whole phase (240 or 480 writes), so they only ever grow: a bar that crosses
    // the line is a hot spot at the end too, and the animation can never disagree with the verdict.
    function paintLoad(load, n, size) {
      for (let k = 0; k < n; k++) {
        const share = load[k] / size;
        bars[k].set({ w: BAR_W * Math.min(1, share), kind: share > HOT / n ? 'bad' : 'data' });
        pcts[k].set(`${Math.round(share * 100)}%`);
      }
    }
    function logWrite(e) {
      log.add(e.part == null ? `${e.key} → node ${e.node + 1}` : `${e.key} → P${e.part + 1} → node ${e.node + 1}`, 'info');
    }
    function logJoin(e) {
      if (e.before.hot) log.add(`Before the join, node ${e.before.node + 1} was a hot spot`, 'bad');
      const tone = e.moved > 50 ? 'warn' : 'good';
      if (e.took) log.add(`Node ${e.node + 1} joins and takes ${e.took.map((t) => 'P' + (t.part + 1)).join(', ')}: ${e.moved}% of keys move`, tone);
      else log.add(`Node ${e.node + 1} joins: hash mod N changes, ${e.moved}% of keys move`, tone);
    }
    function logRead(e) {
      const every = e.nodes.length === e.of;
      log.add(`Range read, ${e.label}: asks ${e.nodes.length} of ${e.of} nodes`, every ? 'warn' : 'good');
    }
    function finish(e) {
      counter.set(`${WRITES} writes, done`);
      if (e.last.hot) {
        rows[e.last.node].set({ kind: 'bad', sub: 'hot spot' });
        log.add(`Node ${e.last.node + 1} is a hot spot: more than ${HOT}× its fair share`, 'bad');
      } else if (!e.hot) log.add(`No hot spot: every node stays under ${HOT}× its fair share`, 'good');
    }

    function render(result, cfg, input, o) {
      v.restart();
      draw(cfg);
      log.clear();
      const trace = result.trace;
      const start = trace[0];
      for (let k = 0; k < cfg.nodes; k++) subFor(k, cfg, start.owner);
      if (o.preview) return Promise.resolve();
      if (!o.animate) {
        // end state at once: the last phase's layout and load, the read and the verdict
        const join = trace.find((e) => e.type === 'join');
        let n = cfg.nodes;
        if (join) {
          addRow(join.node, cfg, true);
          n++;
          moveThreshold(n);
          for (let k = 0; k < n; k++) subFor(k, cfg, join.owner);
        }
        const done = trace[trace.length - 1];
        paintLoad(done.load, n, done.load.reduce((a, b) => a + b, 0));
        const read = trace.find((e) => e.type === 'read');
        if (join) logJoin(join);
        logRead(read);
        finish(done);
        return Promise.resolve();
      }
      return animate(trace, cfg);
    }

    async function animate(trace, cfg) {
      const size = cfg.grow === 'add' ? HALF : WRITES; // writes per phase
      let n = cfg.nodes;
      let load = Array(n).fill(0);
      let flown = 0;
      let batch = 0;
      let quiet = 0; // writes landed in batches since the last log line
      const logQuiet = () => { if (quiet) log.add(`…and ${quiet} more writes`, 'info'); quiet = 0; };
      for (const e of trace) {
        if (e.type === 'write') {
          counter.set(`write ${e.i + 1} of ${WRITES}`);
          if (flown < ANIMATED) {
            flown++;
            ticker.set(e.key);
            await st.send(app, rows[e.node], { label: e.part == null ? '' : 'P' + (e.part + 1), kind: 'data', dur: api.pace(520) });
            load[e.node]++;
            paintLoad(load, n, size);
            logWrite(e);
          } else {
            load[e.node]++;
            quiet++;
            if (++batch % 24 === 0) {
              ticker.set(e.key);
              paintLoad(load, n, size);
              await v.sleep(api.pace(60));
            }
          }
        } else if (e.type === 'join') {
          paintLoad(load, n, size);
          logQuiet();
          addRow(e.node, cfg, true);
          n++;
          moveThreshold(n);
          logJoin(e);
          let flights;
          if (e.took) {
            // whole partitions fly to the new node
            flights = e.took.map((t) => st.send(rows[t.from], rows[e.node], { label: 'P' + (t.part + 1), kind: 'info', dur: api.pace(900), curve: 30 }));
          } else {
            // hash mod N reshuffles keys between almost every pair: one packet per destination, from its biggest donor
            const into = new Map();
            e.flows.forEach((f) => {
              const d = into.get(f.to) || { keys: 0, from: f.from, most: 0 };
              d.keys += f.keys;
              if (f.keys > d.most) { d.most = f.keys; d.from = f.from; }
              into.set(f.to, d);
            });
            flights = [...into].map(([to, d]) => st.send(rows[d.from], rows[to], { label: `${d.keys} keys`, kind: 'warn', dur: api.pace(900), curve: 30 }));
          }
          await Promise.all(flights);
          for (let k = 0; k < n; k++) subFor(k, cfg, e.owner);
          // the bars count the second phase from zero, so the new node has a fair start
          load = Array(n).fill(0);
          flown = ANIMATED;
          paintLoad(load, n, size);
          await v.sleep(api.pace(300));
        } else if (e.type === 'read') {
          paintLoad(load, n, size);
          logQuiet();
          ticker.set(e.short);
          const every = e.nodes.length === e.of;
          await Promise.all(e.nodes.map((k) => st.send(app, rows[k], { label: 'read', kind: every ? 'warn' : 'info', dur: api.pace(700) })));
          logRead(e);
        } else if (e.type === 'done') finish(e);
      }
    }
    return { render };
  }

  DDIA.labs.partitionModel = { run, hash, partOf, P, WRITES, HALF, CELEB, HOT };
})();
