/* Playground — Isolation lab: race two transactions, flip the isolation level (chapter 7).
 * A small, pure transaction engine (version store + lock table) run over a learner-chosen
 * interleaving. The verdict compares the outcome with running the committed transactions
 * one after the other. See LABS.md.
 */
(function () {
  'use strict';
  const DDIA = window.DDIA;

  const LEVELS = ['none', 'rc', 'si', 'ssi', '2pl'];
  const RANK = { none: 0, rc: 1, si: 2, ssi: 3, '2pl': 3 };
  const LEVEL_LABEL = { none: 'No isolation', rc: 'Read committed', si: 'Snapshot', ssi: 'Serializable (SSI)', '2pl': '2PL' };
  const money = (v) => (v == null ? '—' : '$' + v);

  /* ---------- scenarios: two transactions of at most 5 steps each ---------- */
  const SCENARIOS = {
    'dirty-read': {
      lanes: ['T1 · Shop', 'T2 · Buyer'],
      init: { price: 100 },
      fmt: money,
      txs: [
        [{ do: 'write', key: 'price', value: 90, label: 'price = $90' }, { do: 'end' }],
        [{ do: 'read', key: 'price', as: 'p', label: 'read price' }, { do: 'end' }],
      ],
      order: [1, 2, 2, 1],
      anomaly: 'dirty read',
      explain: (r) => (r.committed[2] && r.reads[2][0] !== r.final.price ? `Dirty read: the buyer saw ${money(r.reads[2][0])}, a price that was never committed.` : null),
    },
    'dirty-write': {
      lanes: ['T1 · Ben buys', 'T2 · Ana buys'],
      init: { seat: 'free', invoice: 'nobody' },
      txs: [
        [{ do: 'write', key: 'seat', value: 'Ben', label: 'seat = Ben' }, { do: 'write', key: 'invoice', value: 'Ben', label: 'invoice = Ben' }, { do: 'end' }],
        [{ do: 'write', key: 'seat', value: 'Ana', label: 'seat = Ana' }, { do: 'write', key: 'invoice', value: 'Ana', label: 'invoice = Ana' }, { do: 'end' }],
      ],
      order: [1, 2, 2, 2, 1, 1],
      anomaly: 'dirty write',
      explain: (r) => (r.final.seat !== r.final.invoice ? `Dirty write: the seat went to ${r.final.seat}, the invoice to ${r.final.invoice}.` : null),
    },
    'read-skew': {
      lanes: ['T1 · Transfer', 'T2 · Audit'],
      init: { acct1: 500, acct2: 500 },
      names: { acct1: 'account 1', acct2: 'account 2' },
      fmt: money,
      txs: [
        [{ do: 'update', key: 'acct1', fn: (v) => v - 100, label: 'account 1 − $100' }, { do: 'update', key: 'acct2', fn: (v) => v + 100, label: 'account 2 + $100' }, { do: 'end' }],
        [{ do: 'read', key: 'acct1', as: 'a', label: 'read account 1' }, { do: 'read', key: 'acct2', as: 'b', label: 'read account 2' }, { do: 'end' }],
      ],
      order: [2, 1, 1, 1, 2, 2],
      anomaly: 'read skew',
      explain: (r) => {
        const sum = r.reads[2][0] + r.reads[2][1];
        if (!r.committed[1] || !r.committed[2] || sum === 1000) return null;
        return `Read skew: the audit counted ${money(sum)} in total, ${money(Math.abs(sum - 1000))} ${sum > 1000 ? 'appeared from nowhere' : 'vanished'}.`;
      },
    },
    'lost-update': {
      lanes: ['T1 · Ana likes', 'T2 · Ben likes'],
      init: { likes: 5 },
      txs: [
        [{ do: 'read', key: 'likes', as: 'n', label: 'read likes' }, { do: 'write', key: 'likes', value: (v) => v.n + 1, label: 'likes = n + 1' }, { do: 'end' }],
        [{ do: 'read', key: 'likes', as: 'n', label: 'read likes' }, { do: 'write', key: 'likes', value: (v) => v.n + 1, label: 'likes = n + 1' }, { do: 'end' }],
      ],
      order: [1, 2, 1, 1, 2, 2],
      anomaly: 'lost update',
      explain: (r) => (r.committed[1] && r.committed[2] && r.final.likes !== 7 ? `Lost update: likes = ${r.final.likes} after two committed +1s.` : null),
    },
    'write-skew': {
      lanes: ['T1 · Alice', 'T2 · Bob'],
      init: { 'oncall:alice': true, 'oncall:bob': true },
      names: { 'oncall:alice': 'Alice', 'oncall:bob': 'Bob' },
      fmt: (v) => (v === true ? 'on call' : v === false ? 'off' : '—'),
      txs: [
        [{ do: 'count', prefix: 'oncall:', where: (v) => v === true, as: 'c', label: 'count on call', text: 'on call' },
          { do: 'write', key: 'oncall:alice', value: false, when: (v) => v.c >= 2, label: 'if ≥ 2: Alice leaves' }, { do: 'end' }],
        [{ do: 'count', prefix: 'oncall:', where: (v) => v === true, as: 'c', label: 'count on call', text: 'on call' },
          { do: 'write', key: 'oncall:bob', value: false, when: (v) => v.c >= 2, label: 'if ≥ 2: Bob leaves' }, { do: 'end' }],
      ],
      order: [1, 2, 1, 2, 1, 2],
      anomaly: 'write skew',
      explain: (r) => (r.committed[1] && r.committed[2] && !r.final['oncall:alice'] && !r.final['oncall:bob'] ? 'Write skew: both saw two doctors on call, both left. Nobody is on call.' : null),
    },
    phantom: {
      lanes: ['T1 · Ana books', 'T2 · Ben books'],
      init: { 'room7:zoe': 'Zoe' },
      names: { 'room12:ana': 'room 12', 'room12:ben': 'room 12', 'room7:zoe': 'room 7' },
      fmt: (v) => (v == null ? 'free' : v),
      txs: [
        [{ do: 'count', prefix: 'room12:', as: 'c', label: 'count room 12 bookings', text: 'bookings' },
          { do: 'write', key: 'room12:ana', value: 'Ana', when: (v) => v.c === 0, label: 'if 0: book it' }, { do: 'end' }],
        [{ do: 'count', prefix: 'room12:', as: 'c', label: 'count room 12 bookings', text: 'bookings' },
          { do: 'write', key: 'room12:ben', value: 'Ben', when: (v) => v.c === 0, label: 'if 0: book it' }, { do: 'end' }],
      ],
      order: [1, 2, 1, 2, 1, 2],
      anomaly: 'phantom',
      explain: (r) => (r.final['room12:ana'] && r.final['room12:ben'] ? 'Phantom: both saw room 12 free and both booked it.' : null),
    },
  };

  /* ---------- engine ---------- */
  function run(cfg, order) {
    const sc = SCENARIOS[cfg.scenario];
    const level = cfg.iso;
    const isSI = level === 'si' || level === 'ssi';
    const name = (k) => (sc.names && sc.names[k]) || k;
    const fmt = (v) => (sc.fmt ? sc.fmt(v) : v == null ? '—' : String(v));

    const db = new Map(); // key → versions [{val, tx, status: active|committed|aborted, cts}]
    Object.entries(sc.init).forEach(([k, val]) => db.set(k, [{ val, tx: 0, status: 'committed', cts: 0 }]));
    let clock = 0; // commit counter; snapshots are commit counts
    const locks = new Map(); // key → { x: txId | 0, s: Set<txId> }
    const plocks = new Map(); // prefix → Set<txId>   (2PL predicate locks)
    const txs = {};
    [1, 2].forEach((id) => {
      txs[id] = { id, steps: sc.txs[id - 1], pc: 0, status: 'active', snap: null, vars: {}, reads: [], readKeys: new Set(), readPrefixes: new Set(), intentional: false, dirty: [] };
    });
    const trace = [];
    const row = (tx, kind, text, note) => trace.push({ t: trace.length, type: 'row', tx, kind, text, note: note || '' });

    const lockOf = (k) => { if (!locks.has(k)) locks.set(k, { x: 0, s: new Set() }); return locks.get(k); };
    const keysWith = (p) => [...db.keys()].filter((k) => k.startsWith(p)).sort();
    const ownVersion = (tx, k) => (db.get(k) || []).filter((v) => v.tx === tx.id && v.status === 'active').pop();
    function visibleVersion(tx, k) {
      const own = ownVersion(tx, k);
      if (own) return own;
      const vs = db.get(k) || [];
      for (let i = vs.length - 1; i >= 0; i--) {
        const v = vs[i];
        if (v.status === 'aborted') continue;
        if (level === 'none') return v; // uncommitted data too
        if (v.status !== 'committed') continue;
        if (isSI && v.cts > tx.snap) continue; // committed after my snapshot: invisible
        return v;
      }
      return null;
    }
    const visible = (tx, k) => { const v = visibleVersion(tx, k); return v ? v.val : undefined; };
    // remember reads of another transaction's uncommitted data (a dirty read if it later aborts)
    function noteDirty(tx, k) {
      const v = visibleVersion(tx, k);
      if (v && v.status === 'active' && v.tx !== tx.id) tx.dirty.push({ from: v.tx, key: k });
    }
    const newerBy = (tx, k) => { const v = (db.get(k) || []).find((x) => x.status === 'committed' && x.tx !== tx.id && x.cts > tx.snap); return v ? v.tx : 0; };
    const newerThanSnap = (tx, k) => newerBy(tx, k) !== 0;

    // lock checks return who blocks us, or null
    function xBlocker(tx, k) {
      const l = locks.get(k);
      if (l && l.x && l.x !== tx.id) return { by: l.x, what: name(k) };
      if (level === '2pl') {
        if (l) for (const s of l.s) if (s !== tx.id) return { by: s, what: name(k) };
        for (const [p, set] of plocks) if (k.startsWith(p)) for (const s of set) if (s !== tx.id) return { by: s, what: 'the range' };
      }
      return null;
    }
    function sBlocker(tx, k) { const l = locks.get(k); return l && l.x && l.x !== tx.id ? { by: l.x, what: name(k) } : null; }
    function prefixBlocker(tx, p) {
      for (const k of keysWith(p)) { const b = sBlocker(tx, k); if (b) return b; }
      return null;
    }
    function release(tx) {
      locks.forEach((l) => { if (l.x === tx.id) l.x = 0; l.s.delete(tx.id); });
      plocks.forEach((set) => set.delete(tx.id));
    }
    // row text stays short (it sits in a chip); the reason goes in the database column
    function abort(tx, tag, why, intentional) {
      const undone = [];
      db.forEach((vs, k) => vs.forEach((v) => { if (v.tx === tx.id && v.status === 'active') { v.status = 'aborted'; undone.push(name(k)); } }));
      tx.status = 'aborted';
      tx.intentional = !!intentional;
      release(tx);
      const note = why || (undone.length ? 'undone: ' + [...new Set(undone)].join(', ') : '');
      return { kind: 'abort', text: 'abort ✕' + (tag ? ' ' + tag : ''), note };
    }
    function writeVersion(tx, k, val) {
      const own = ownVersion(tx, k);
      if (own) own.val = val;
      else { if (!db.has(k)) db.set(k, []); db.get(k).push({ val, tx: tx.id, status: 'active', cts: null }); }
    }
    // "Lock rows I read": X-lock the rows first (like SELECT … FOR UPDATE)
    function lockRows(tx, keys) {
      for (const k of keys) { const b = xBlocker(tx, k); if (b) return { blocked: b }; }
      keys.forEach((k) => { lockOf(k).x = tx.id; });
      if (isSI && keys.some((k) => newerThanSnap(tx, k))) return { abort: abort(tx, 'conflict', 'a row I locked has changed') };
      return null;
    }

    /** Try the next step of tx: returns {blocked} or a row {kind, text, note}. */
    function step(tx) {
      const st = tx.steps[tx.pc];
      if (tx.snap == null) tx.snap = clock; // snapshot at the first statement
      if (st.do === 'read' || st.do === 'count') {
        const keys = st.do === 'read' ? [st.key] : keysWith(st.prefix);
        if (level === '2pl') {
          const b = st.do === 'read' ? sBlocker(tx, st.key) : prefixBlocker(tx, st.prefix);
          if (b) return { blocked: b };
          if (st.do === 'read') lockOf(st.key).s.add(tx.id);
          else { if (!plocks.has(st.prefix)) plocks.set(st.prefix, new Set()); plocks.get(st.prefix).add(tx.id); }
        }
        if (cfg.lock === 'rows') {
          const r = lockRows(tx, keys);
          if (r && r.blocked) return r;
          if (r && r.abort) return r.abort;
        }
        keys.forEach((k) => noteDirty(tx, k));
        if (st.do === 'read') {
          const val = visible(tx, st.key);
          tx.vars[st.as] = val; tx.reads.push(val); tx.readKeys.add(st.key);
          return { kind: 'read', text: `read ${name(st.key)} → ${fmt(val)}` };
        }
        const c = keysWith(st.prefix).filter((k) => { const v = visible(tx, k); return v !== undefined && (!st.where || st.where(v)); }).length;
        tx.vars[st.as] = c; tx.reads.push(c); tx.readPrefixes.add(st.prefix);
        return { kind: 'read', text: `count ${st.text} → ${c}` };
      }
      if (st.do === 'write' || st.do === 'update') {
        if (st.when && !st.when(tx.vars)) return { kind: 'skip', text: `skip: count was ${tx.vars.c}` };
        if (level !== 'none') {
          const b = xBlocker(tx, st.key);
          if (b) return { blocked: b };
          lockOf(st.key).x = tx.id;
        }
        if (isSI && newerThanSnap(tx, st.key)) return abort(tx, 'conflict', `T${newerBy(tx, st.key)} already changed ${name(st.key)}`);
        let val;
        if (st.do === 'update') { val = st.fn(visible(tx, st.key)); tx.readKeys.add(st.key); }
        else val = typeof st.value === 'function' ? st.value(tx.vars) : st.value;
        writeVersion(tx, st.key, val);
        return { kind: 'write', text: `${name(st.key)} = ${fmt(val)}`, note: `${name(st.key)} = ${fmt(val)}, uncommitted` };
      }
      // end: commit, or abort on purpose
      if (tx.id === 1 && cfg.t1end === 'abort') return abort(tx, '', '', true);
      // SSI: a writer whose reads went stale must abort; a read-only transaction is safe to commit
      const wrote = [...db.values()].some((vs) => vs.some((v) => v.tx === tx.id && v.status === 'active'));
      if (level === 'ssi' && wrote) {
        const stale = [...tx.readKeys].find((k) => newerThanSnap(tx, k)) ||
          [...tx.readPrefixes].find((p) => keysWith(p).some((k) => newerThanSnap(tx, k)));
        if (stale) return abort(tx, 'stale read', 'something I read has changed');
      }
      clock++;
      const saved = [];
      db.forEach((vs, k) => vs.forEach((v) => {
        if (v.tx !== tx.id || v.status !== 'active') return;
        v.status = 'committed';
        v.cts = clock;
        // only mention values that are still current (without locks, another writer may have overwritten it)
        if (vs.filter((x) => x.status !== 'aborted').pop() === v) saved.push(name(k));
      }));
      tx.status = 'committed';
      release(tx);
      return { kind: 'commit', text: 'commit ✓', note: saved.length ? 'saved: ' + saved.join(', ') : '' };
    }

    /* scheduler: each turn runs the named transaction's next step; a blocked step waits
       while the other transaction runs; both blocked = deadlock, the later waiter aborts */
    const turns = order.slice();
    const runnable = (id) => txs[id].status === 'active' && txs[id].pc < txs[id].steps.length;
    const consume = (id) => { const i = turns.indexOf(id); if (i >= 0) turns.splice(i, 1); };
    function attempt(id) {
      const tx = txs[id];
      const r = step(tx);
      if (r.blocked) return r;
      row(id, r.kind, r.text, r.note);
      if (tx.status === 'aborted') { for (let i = turns.length - 1; i >= 0; i--) if (turns[i] === id) turns.splice(i, 1); }
      else tx.pc++;
      return r;
    }
    let guard = 0;
    while (runnable(1) || runnable(2)) {
      if (++guard > 200) throw new Error('isolation engine made no progress');
      const pref = turns.find(runnable) || (runnable(1) ? 1 : 2);
      const r = attempt(pref);
      if (!r.blocked) { consume(pref); continue; }
      row(pref, 'wait', 'wait ⏸', `T${r.blocked.by} has a lock on ${r.blocked.what}`);
      const other = 3 - pref;
      if (!runnable(other)) throw new Error('blocked with nobody to wait for');
      const r2 = attempt(other);
      if (r2.blocked) {
        row(other, 'wait', 'wait ⏸', `T${r2.blocked.by} has a lock on ${r2.blocked.what}`);
        const a = abort(txs[other], 'deadlock', 'both wait: the later waiter dies');
        row(other, 'abort', a.text, a.note);
        for (let i = turns.length - 1; i >= 0; i--) if (turns[i] === other) turns.splice(i, 1);
      } else if (txs[other].status !== 'aborted') consume(other);
    }

    /* verdict: same final state and same reads as some serial order of the committed txs? */
    const final = {};
    db.forEach((vs, k) => { const v = vs.filter((x) => x.status !== 'aborted').pop(); if (v) final[k] = v.val; });
    const committed = [1, 2].filter((id) => txs[id].status === 'committed');
    const perms = committed.length === 2 ? [[1, 2], [2, 1]] : [committed];
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const match = perms.find((p) => {
      const ref = serial(sc, p);
      return same(sortKeys(ref.final), sortKeys(final)) && p.every((id) => same(ref.reads[id], txs[id].reads));
    });
    const aborts = [1, 2].filter((id) => txs[id].status === 'aborted' && !txs[id].intentional);
    const res = { final, reads: { 1: txs[1].reads, 2: txs[2].reads }, committed: { 1: txs[1].status === 'committed', 2: txs[2].status === 'committed' } };
    let text;
    let anomalyName = '';
    if (!match) {
      const story = sc.explain(res);
      const dirty = !story && committed.map((id) => txs[id].dirty.find((d) => txs[d.from].status === 'aborted') && { id, d: txs[id].dirty.find((d) => txs[d.from].status === 'aborted') }).find(Boolean);
      if (story) { text = story; anomalyName = sc.anomaly; }
      else if (dirty) { text = `Dirty read: T${dirty.id} used ${name(dirty.d.key)} from T${dirty.d.from}, which then rolled back.`; anomalyName = 'dirty read'; }
      else { text = 'Not serializable: no one-at-a-time order of the committed transactions gives this result.'; anomalyName = 'not serializable'; }
    }
    else if (aborts.length) text = `Safe: T${aborts[0]} was aborted, so the app must retry it.`;
    else if (committed.length < 2) text = `Safe: same result as running T${committed[0] || '—'} alone.`;
    else text = `Safe: same result as running T${match[0]} then T${match[1]}.`;
    const finalText = Object.keys(final).sort().map((k) => `${name(k)} = ${fmt(final[k])}`).join(' · ');
    trace.push({ t: trace.length, type: 'verdict', anomaly: !match, text, final, finalText });
    return {
      trace,
      stats: { anomaly: match ? 0 : 1, anomalyName, aborts: aborts.length, waits: trace.filter((e) => e.kind === 'wait').length, committed: committed.length },
      state: { txs, final },
    };
  }

  function sortKeys(o) { const out = {}; Object.keys(o).sort().forEach((k) => { out[k] = o[k]; }); return out; }

  /** Reference: run whole transactions one after another, no concurrency. */
  function serial(sc, ids) {
    const state = Object.assign({}, sc.init);
    const reads = { 1: [], 2: [] };
    ids.forEach((id) => {
      const vars = {};
      sc.txs[id - 1].forEach((st) => {
        if (st.do === 'read') { vars[st.as] = state[st.key]; reads[id].push(state[st.key]); }
        else if (st.do === 'count') {
          const c = Object.keys(state).filter((k) => k.startsWith(st.prefix) && state[k] !== undefined && (!st.where || st.where(state[k]))).length;
          vars[st.as] = c; reads[id].push(c);
        } else if (st.do === 'write') { if (!st.when || st.when(vars)) state[st.key] = typeof st.value === 'function' ? st.value(vars) : st.value; }
        else if (st.do === 'update') state[st.key] = st.fn(state[st.key]);
      });
    });
    return { final: state, reads };
  }

  const stepCounts = (cfg) => SCENARIOS[cfg.scenario].txs.map((t) => t.length);
  function parseInput(str, cfg) {
    if (!/^[12]+$/.test(String(str))) return null;
    const o = String(str).split('').map(Number);
    const [a, b] = stepCounts(cfg);
    return o.filter((x) => x === 1).length === a && o.filter((x) => x === 2).length === b ? o : null;
  }
  const stepLabel = (cfg, tx, i) => {
    const st = SCENARIOS[cfg.scenario].txs[tx - 1][i];
    if (st.do !== 'end') return st.label;
    return tx === 1 && cfg.t1end === 'abort' ? 'abort' : 'commit';
  };

  /* ---------- the lab ---------- */
  DDIA.lab({
    id: 'isolation',
    title: 'Isolation lab',
    short: 'Isolation',
    tagline: 'Race two transactions, then change the isolation level',
    chapters: [7],
    styles: ['timeline', 'knobs', 'challenges'],
    knobs: [
      { id: 'iso', label: 'Isolation level', options: LEVELS.map((l) => ({ value: l, label: LEVEL_LABEL[l] })) },
      { id: 'lock', label: 'Lock rows I read', options: [{ value: 'off', label: 'Off' }, { value: 'rows', label: 'FOR UPDATE' }] },
      { id: 't1end', label: 'T1 ends with', options: [{ value: 'commit', label: 'Commit' }, { value: 'abort', label: 'Abort' }] },
    ],
    defaults: { scenario: 'lost-update', iso: 'rc', lock: 'off', t1end: 'commit' },
    normalize(c) {
      if (!SCENARIOS[c.scenario]) c.scenario = 'lost-update';
      if (!LEVELS.includes(c.iso)) c.iso = 'rc';
      if (!['off', 'rows'].includes(c.lock)) c.lock = 'off';
      if (!['commit', 'abort'].includes(c.t1end)) c.t1end = 'commit';
      return c;
    },
    describe: (cfg) => LEVEL_LABEL[cfg.iso],
    stepCounts,
    stepLabel,
    lanes: (cfg) => SCENARIOS[cfg.scenario].lanes,

    run,
    defaultInput: (cfg) => SCENARIOS[cfg.scenario].order.slice(),
    samples: (cfg) => { const [a, b] = stepCounts(cfg); return DDIA.lab.interleavings(a, b); },
    nextInput: (cfg) => { const all = DDIA.lab.interleavings(...stepCounts(cfg)); return all[Math.floor(Math.random() * all.length)]; },
    nextLabel: 'Random order',
    inputKey: (o) => o.join(''),
    parseInput,
    inputLabel: (o) => 'order ' + o.join(''),
    sampleNoun: ['order', 'orders'],

    metrics: [
      { id: 'anomaly', label: 'Anomaly', kind: 'bad', fmt: (v) => (v ? 'yes' : 'no') },
      { id: 'aborts', label: 'Aborts', kind: 'warn' },
      { id: 'waits', label: 'Waits', kind: 'neutral', plain: true },
    ],
    classify(st, cfg) {
      if (st.anomaly) return { kind: 'bad', label: st.anomalyName || (cfg ? SCENARIOS[cfg.scenario].anomaly : 'anomaly') };
      if (st.aborts) return { kind: 'warn', label: 'abort, retry' };
      return { kind: 'good', label: 'safe' };
    },

    presets: [
      {
        id: 'dirty-read', title: 'Dirty read',
        config: { scenario: 'dirty-read', iso: 'none', t1end: 'abort' }, knobs: ['iso', 't1end'],
        nudge: 'Switch to read committed, then replay.',
        predict: { q: 'Read committed: can the buyer still see the $90 price that was rolled back?', metric: 'anomaly', config: { iso: 'rc' } },
      },
      {
        id: 'dirty-write', title: 'Dirty write',
        config: { scenario: 'dirty-write', iso: 'none' }, knobs: ['iso'],
        nudge: 'Try read committed: the second buyer has to wait.',
        predict: { q: 'No isolation: can the seat and the invoice go to different buyers?', metric: 'anomaly' },
      },
      {
        id: 'read-skew', title: 'Read skew',
        config: { scenario: 'read-skew', iso: 'rc' }, knobs: ['iso'],
        nudge: 'Switch to snapshot isolation and replay the audit.',
        predict: { q: 'Read committed: can the audit see money appear from nowhere?', metric: 'anomaly' },
      },
      {
        id: 'lost-update', title: 'Lost update',
        config: { scenario: 'lost-update', iso: 'rc' }, knobs: ['iso', 'lock'],
        nudge: 'Try snapshot, 2PL, or locking the row you read.',
        predict: { q: 'Snapshot isolation: will any order still lose a like?', metric: 'anomaly', config: { iso: 'si' } },
      },
      {
        id: 'write-skew', title: 'Write skew',
        config: { scenario: 'write-skew', iso: 'si' }, knobs: ['iso', 'lock'],
        nudge: 'Snapshot lets both doctors leave. Try serializable.',
        predict: { q: 'Snapshot isolation: can both doctors go off call?', metric: 'anomaly' },
      },
      {
        id: 'phantom', title: 'Phantom',
        config: { scenario: 'phantom', iso: 'si' }, knobs: ['iso', 'lock'],
        nudge: 'Locking rows cannot help here: the row does not exist yet.',
        predict: { q: 'Snapshot plus locking the rows you read: can room 12 still be booked twice?', metric: 'anomaly', config: { lock: 'rows' } },
      },
    ],

    challenges: [
      {
        id: 'break-si', title: 'Break snapshot isolation',
        goal: 'Snapshot isolation is on. Reorder the steps until both doctors go off call.',
        config: { scenario: 'write-skew', iso: 'si' }, knobs: [], input: [1, 1, 1, 2, 2, 2], order: true,
        criteria: [{ label: 'Both doctors leave, nobody is on call', metric: 'anomaly', min: 1, scope: 'current' }],
        hint: 'Each doctor must count before the other one commits.',
        solution: { input: [1, 2, 1, 2, 1, 2] },
      },
      {
        id: 'weakest-safe', title: 'Weakest safe level',
        goal: 'Two people like a post at once. Pick the weakest level that never loses a like, in any order.',
        config: { scenario: 'lost-update', iso: 'none' }, knobs: ['iso'],
        criteria: [
          { label: 'No order loses a like', metric: 'anomaly', max: 0 },
          {
            label: 'No weaker level is also safe',
            test(cfg, ctx) {
              const weaker = LEVELS.filter((l) => RANK[l] < RANK[cfg.iso]);
              const safe = weaker.find((l) => ctx.runAll(Object.assign({}, cfg, { iso: l })).every((r) => !r.stats.anomaly));
              if (safe) return { ok: false, text: `${LEVEL_LABEL[safe]} is weaker and also safe` };
              return { ok: true, text: weaker.length ? 'every weaker level loses likes' : 'nothing is weaker' };
            },
          },
        ],
        hint: 'Aborting the second writer counts as safe: the app can retry it.',
        solution: { config: { iso: 'si' } },
      },
      {
        id: 'fewest-aborts', title: 'On call, fewest aborts',
        goal: 'Keep a doctor on call in every order, and abort as few transactions as possible.',
        config: { scenario: 'write-skew', iso: 'si' }, knobs: ['iso', 'lock'],
        criteria: [
          { label: 'Someone stays on call in every order', metric: 'anomaly', max: 0 },
          {
            label: 'No other safe setup aborts less',
            test(cfg, ctx) {
              if (ctx.runAll(cfg).some((r) => r.stats.anomaly)) return { ok: false, text: 'first keep someone on call in every order' };
              const total = (c) => ctx.runAll(c).reduce((s, r) => s + r.stats.aborts, 0);
              let best = null;
              LEVELS.forEach((iso) => ['off', 'rows'].forEach((lock) => {
                const c = Object.assign({}, cfg, { iso, lock });
                if (ctx.runAll(c).some((r) => r.stats.anomaly)) return;
                const t = total(c);
                if (!best || t < best.t) best = { t, iso, lock };
              }));
              const mine = total(cfg);
              if (mine <= best.t) return { ok: true, text: `${mine} aborts across all orders, the minimum` };
              return { ok: false, text: `${mine} aborts, but ${LEVEL_LABEL[best.iso]}${best.lock === 'rows' ? ' + FOR UPDATE' : ''} needs only ${best.t}` };
            },
          },
        ],
        hint: 'Aborts come from spotting conflicts late. What if the second doctor waited instead?',
        solution: { config: { iso: 'rc', lock: 'rows' } },
      },
    ],

    view,
  });

  /* ---------- view: order editor + a time-flows-down table of executed steps ----------
   * The table is HTML (not SVG) so its text stays full-size and wraps on phones. */
  // purple = T1 and orange = T2 everywhere (order chips, headers, steps); outcomes keep their own colors
  const KIND = { skip: 'ghost', wait: 'warn', commit: 'good', abort: 'bad' };
  const kindOf = (e) => KIND[e.kind] || (e.tx === 1 ? 'primary' : 'data');
  function view(el, v, api) {
    const { h } = v;
    const box = v.wrap(el);
    const editor = DDIA.labkit.orderEditor(box, { onChange: (o) => api.setInput(o) });
    const table = h('div', { class: 'iso-table', role: 'table', 'aria-label': 'Both transactions step by step, time flowing down' });
    box.appendChild(table);
    const cap = v.caption(box, '');
    function head(lanes) {
      return h('div', { class: 'iso-row iso-head', role: 'row' },
        h('span', { role: 'columnheader', class: 'iso-t1' }, lanes[0]),
        h('span', { role: 'columnheader', class: 'iso-t2' }, lanes[1]),
        h('span', { role: 'columnheader' }, 'Database'));
    }
    function rowEl(e) {
      const chip = h('span', { class: 'iso-chip k-' + kindOf(e) }, e.text);
      return h('div', { class: 'iso-row', role: 'row' },
        h('span', { role: 'cell' }, e.tx === 1 ? chip : null),
        h('span', { role: 'cell' }, e.tx === 2 ? chip : null),
        h('span', { role: 'cell', class: 'iso-note' + (e.kind === 'abort' ? ' k-bad' : e.kind === 'wait' ? ' k-warn' : '') }, e.note || ''));
    }
    function render(result, cfg, input, o) {
      v.restart();
      editor.update({ order: input, label: (tx, i) => api.lab.stepLabel(cfg, tx, i), editable: api.canEdit('order') });
      const rows = result.trace.filter((e) => e.type === 'row');
      const verdict = result.trace.find((e) => e.type === 'verdict');
      table.textContent = '';
      table.appendChild(head(api.lab.lanes(cfg)));
      if (o.preview) {
        table.appendChild(h('div', { class: 'iso-empty' }, 'Predict first, then watch the steps run in this order.'));
        cap.set('Time flows down. Each row is one step.');
        return Promise.resolve();
      }
      const finish = () => {
        table.appendChild(h('div', { class: 'iso-final ' + (verdict.anomaly ? 'k-bad' : 'k-good') }, 'Final: ' + verdict.finalText));
        cap.set(verdict.text, verdict.anomaly ? 'bad' : 'good');
      };
      if (!o.animate) { rows.forEach((e) => table.appendChild(rowEl(e))); finish(); return Promise.resolve(); }
      cap.set('Running the steps in this order…');
      return (async () => {
        for (const e of rows) {
          const r = rowEl(e);
          r.classList.add('pop');
          table.appendChild(r);
          await v.sleep(api.pace(450));
        }
        finish();
      })();
    }
    return { render };
  }

  DDIA.labs.isolationEngine = { SCENARIOS, LEVELS, LEVEL_LABEL, serial };
})();
