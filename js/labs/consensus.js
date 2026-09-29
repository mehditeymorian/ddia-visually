/* DDIA Visual Guide — Consensus and epochs lab (chapters 5, 8 and 9).
 * Five nodes and a leader. A crash, a partition or a slow network makes followers time out and elect a
 * new leader. Without a majority rule two leaders can accept writes at once (split brain) and one side's
 * acknowledged writes are thrown away when the partition heals; with majority votes, terms and majority
 * acks, the cut-off side cannot write at all. The model steps through 30 s; the view replays it. */
(function () {
  'use strict';
  const DDIA = (window.DDIA = window.DDIA || {});

  /* ---------- model ---------- */
  const N = 5;
  const MAJ = 3;                    // a majority of five
  const SIDE = [0, 0, 1, 1, 1];     // a partition cuts nodes 1–2 off from nodes 3–5
  const HOME = [0, 2];              // client 1 talks to node 1's side, client 2 to node 3's side
  const END = 30, FAULT_AT = 5, HEAL_AT = 20, BEAT = 0.5, DT = 0.1;
  const OUTAGE = 5;                 // a writer waiting over 5 s counts as an outage
  const r1 = (x) => Math.round(x * 10) / 10;

  function run(cfg, seed) {
    const rng = DDIA.sim.rng(seed);
    const uni = (a, b) => a + (b - a) * rng.next();
    const slow = cfg.fault === 'slow' || cfg.fault === 'slow-crash';
    const crashes = cfg.fault === 'crash' || cfg.fault === 'slow-crash';
    const cut = cfg.fault === 'partition';
    const nodes = Array.from({ length: N }, (_, k) => ({ k, alive: true, term: 1, leader: k === 0, since: 0, heard: 0, patience: cfg.timeout + uni(0, 0.4) }));
    const trace = [{ type: 'start', t: 0, leader: 0, term: 1 }];
    const linked = (a, b, t) => nodes[a].alive && nodes[b].alive && (!cut || t < FAULT_AT || t >= HEAL_AT || SIDE[a] === SIDE[b]);
    let inflight = [];
    const leaders = [{ k: 0, term: 1, from: 0 }]; // every leadership, for deciding which writes survive
    let flaps = 0;
    const writes = [];
    let nextBeat = 0;

    for (let step = 0; step <= END / DT; step++) {
      const t = r1(step * DT);
      if (crashes && t === FAULT_AT && nodes[0].alive) { nodes[0].alive = false; nodes[0].leader = false; trace.push({ type: 'crash', t, k: 0 }); }
      if (cut && t === FAULT_AT) trace.push({ type: 'cut', t });
      if (cut && t === HEAL_AT) trace.push({ type: 'heal', t });

      // deliver heartbeats that have arrived; a newer term makes any node, even a leader, follow
      inflight = inflight.filter((m) => {
        if (m.at > t) return true;
        const n = nodes[m.to];
        if (!linked(m.from, m.to, t) || m.term < n.term) return false;
        if (n.leader && m.term > n.term) { n.leader = false; trace.push({ type: 'stepdown', t, k: n.k, term: n.term, newer: m.term }); }
        else if (m.term > n.term) trace.push({ type: 'term', t, k: n.k, term: m.term }); // a follower learns a newer term
        n.term = m.term;
        if (!n.leader) n.heard = t;
        return false;
      });

      // leaders send heartbeats; on a slow network some take far longer than usual
      if (t >= nextBeat - 1e-9) {
        nextBeat = r1(nextBeat + BEAT);
        nodes.forEach((ld) => {
          if (!ld.alive || !ld.leader) return;
          nodes.forEach((n) => {
            if (n === ld || !linked(ld.k, n.k, t)) return;
            const d = slow && rng.chance(0.12) ? uni(1.5, 2.5) : uni(0.05, 0.3);
            inflight.push({ from: ld.k, to: n.k, term: ld.term, at: r1(t + d) });
          });
        });
      }

      // a follower that has heard nothing for its timeout starts an election
      nodes.forEach((n) => {
        if (!n.alive || n.leader || t - n.heard <= n.patience) return;
        n.heard = t;
        n.patience = cfg.timeout + uni(0, 0.4);
        const reach = nodes.filter((o) => linked(n.k, o.k, t));
        const votes = reach.length; // itself plus every node it can reach
        // a leader that has been in office a while and is still reachable: this election only happened because its
        // heartbeats were slow (a leader elected moments ago may simply not have reached everyone yet)
        const healthy = nodes.some((o) => o.leader && o.since <= t - 1 && linked(n.k, o.k, t));
        if (cfg.rule === 'majority' && votes < MAJ) { trace.push({ type: 'noquorum', t, k: n.k, votes }); return; }
        // terms are numbered cluster-wide so they never collide: the story here is about quorums, not term clashes
        const term = Math.max(...nodes.map((o) => o.term)) + 1;
        n.term = term;
        n.leader = true;
        n.since = t;
        if (healthy) flaps++;
        leaders.push({ k: n.k, term, from: t });
        trace.push({ type: 'elected', t, k: n.k, term, votes, healthy });
        // under the majority rule, the voters now know the new term: any old leader among them steps down at once
        if (cfg.rule === 'majority') reach.forEach((o) => {
          if (o === n) return;
          if (o.leader) { o.leader = false; trace.push({ type: 'stepdown', t, k: o.k, term: o.term, newer: term }); }
          else if (o.term < term) trace.push({ type: 'term', t, k: o.k, term });
          o.term = term;
          o.heard = t;
        });
      });

      // each client writes once a second to a leader it can reach
      if (step % 10 === 0 && t > 0) {
        [0, 1].forEach((c) => {
          const home = HOME[c];
          // a client reaches any live leader, except across the partition while it lasts, and prefers the newest
          // term it can see (so racing leaders alone never lose a write here)
          const ld = nodes.filter((o) => o.leader && o.alive && (!cut || t < FAULT_AT || t >= HEAL_AT || SIDE[o.k] === SIDE[home]))
            .sort((a, b) => b.term - a.term)[0];
          if (!ld) { writes.push({ c, t, ok: false, why: 'no leader' }); trace.push({ type: 'write', t, c, ok: false, why: 'no leader' }); return; }
          const acks = nodes.filter((o) => linked(ld.k, o.k, t)).length;
          if (cfg.rule === 'majority' && acks < MAJ) {
            writes.push({ c, t, ok: false, why: 'no majority', k: ld.k });
            trace.push({ type: 'write', t, c, k: ld.k, term: ld.term, ok: false, why: 'no majority' });
            return;
          }
          // the write reaches every node the leader can reach right now; only those nodes have it
          writes.push({ c, t, ok: true, k: ld.k, term: ld.term, got: nodes.filter((o) => linked(ld.k, o.k, t)).map((o) => o.k) });
          trace.push({ type: 'write', t, c, k: ld.k, term: ld.term, ok: true });
        });
      }
    }

    // an acknowledged write is lost if a leader of a newer term never had it: that leader's log wins, and the
    // write is overwritten on every node that had it. (A majority leader always had it: its voters overlap
    // the write's majority, and in this model reachable nodes hold every write.)
    let lost = 0;
    writes.forEach((w) => {
      if (!w.ok) return;
      if (leaders.some((l) => l.term > w.term && !w.got.includes(l.k))) { w.lost = true; lost++; }
    });
    trace.forEach((e) => { if (e.type === 'write' && e.ok) e.lost = writes.find((w) => w.c === e.c && w.t === e.t).lost || false; });
    // the longest stretch each client went without an acknowledged write that survived
    const gap = (c) => {
      let last = 0;
      let worst = 0;
      writes.filter((w) => w.c === c).forEach((w) => { if (w.ok && !w.lost) { worst = Math.max(worst, w.t - last); last = w.t; } });
      return r1(Math.max(worst, END - last));
    };
    const gaps = [gap(0), gap(1)];
    trace.push({ type: 'done', t: END, lost, flaps, gaps });
    return { trace, stats: { lost, flaps, outage: gaps[1] > OUTAGE ? 1 : 0, gap2: gaps[1], gap1: gaps[0] } };
  }

  /* ---------- the lab ---------- */
  const SEEDS = Array.from({ length: 100 }, (_, i) => i + 1);
  const FAULT_LABEL = { none: 'None', crash: 'Leader crashes', partition: 'Partition', slow: 'Slow network', 'slow-crash': 'Slow network, then a crash' };
  const RULE_LABEL = { naive: 'None', majority: 'Majority' };
  const TIMEOUTS = [1, 3, 5];

  DDIA.lab({
    id: 'consensus',
    title: 'Consensus and epochs lab',
    short: 'Consensus',
    tagline: 'Cut the network, elect a leader, keep one version of the truth',
    chapters: [5, 8, 9],
    styles: ['knobs', 'challenges'],
    // hub thumbnail: two nodes cut off from three by a partition, each side with its own leader
    thumb: '<svg viewBox="0 0 200 110">' +
      [[40, 34], [40, 78]].map(([x, y], k) => `<circle cx="${x}" cy="${y}" r="13" fill="var(--k-${k ? 'neutral' : 'primary'}-f)" stroke="var(--k-${k ? 'neutral' : 'primary'}-s)" stroke-width="1.8"/>`).join('') +
      [[150, 22], [150, 56], [150, 90]].map(([x, y], k) => `<circle cx="${x}" cy="${y}" r="13" fill="var(--k-${k === 1 ? 'data' : 'neutral'}-f)" stroke="var(--k-${k === 1 ? 'data' : 'neutral'}-s)" stroke-width="1.8"/>`).join('') +
      '<path d="M96 10V102" stroke="var(--k-bad-s)" stroke-width="2" stroke-dasharray="5 4"/></svg>',
    // scenario card drawing: five nodes, the fault waiting for them, and the rule (setup only)
    sketch(cfg) {
      let s = '';
      [[40, 20], [40, 50], [150, 12], [150, 34], [150, 56]].forEach(([x, y], k) => {
        s += `<circle cx="${x}" cy="${y}" r="9" fill="var(--k-${k ? 'neutral' : 'primary'}-f)" stroke="var(--k-${k ? 'neutral' : 'primary'}-s)" stroke-width="1.6"/>`;
      });
      if (cfg.fault === 'partition') s += '<path d="M95 4V64" stroke="var(--k-bad-s)" stroke-width="2" stroke-dasharray="5 4"/>';
      if (cfg.fault === 'crash' || cfg.fault === 'slow-crash') s += '<path d="M33 13l14 14M47 13l-14 14" stroke="var(--k-bad-s)" stroke-width="2.4" stroke-linecap="round"/>';
      if (cfg.fault === 'slow' || cfg.fault === 'slow-crash') s += '<path d="M56 34 q10 -12 20 0 t20 0 t20 0 t20 0" stroke="var(--k-warn-s)" stroke-width="2" fill="none"/>';
      const label = `${cfg.rule === 'majority' ? 'majority quorum' : 'no quorum'}, ${cfg.timeout} s timeout`;
      return `<svg viewBox="0 0 240 84">${s}<text x="120" y="78" text-anchor="middle" font-size="15" font-weight="600" fill="var(--text-2)" style="font-family:var(--font-body)">${label}</text></svg>`;
    },
    knobs: [
      { id: 'fault', label: 'What goes wrong', options: Object.keys(FAULT_LABEL).map((k) => ({ value: k, label: FAULT_LABEL[k] })) },
      { id: 'rule', label: 'Quorum', options: Object.keys(RULE_LABEL).map((k) => ({ value: k, label: RULE_LABEL[k] })) },
      { id: 'timeout', label: 'Election timeout', options: TIMEOUTS.map((s) => ({ value: s, label: `${s} s` })) },
    ],
    defaults: { fault: 'partition', rule: 'majority', timeout: 3 },
    normalize(c) {
      if (!FAULT_LABEL[c.fault]) c.fault = 'partition';
      if (!RULE_LABEL[c.rule]) c.rule = 'majority';
      c.timeout = TIMEOUTS.includes(Number(c.timeout)) ? Number(c.timeout) : 3;
      return c;
    },
    describe: (cfg) => `${FAULT_LABEL[cfg.fault]}, ${cfg.rule === 'majority' ? 'majority quorum' : 'no quorum'}`,

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
      { id: 'lost', label: 'Acknowledged writes lost', kind: 'bad' },
      { id: 'flaps', label: 'Needless elections', kind: 'warn' },
      { id: 'outage', label: `Client 2 waits over ${OUTAGE} s`, kind: 'warn', fmt: (v) => (v ? 'yes' : 'no') },
      { id: 'gap2', label: 'Client 2’s longest gap in kept writes', kind: 'neutral', plain: true, fmt: (v) => `${v} s` },
      { id: 'gap1', label: 'Client 1’s longest gap in kept writes', kind: 'neutral', plain: true, fmt: (v) => `${v} s` },
    ],
    classify(st) {
      if (st.lost) return { kind: 'bad', label: 'split brain' };
      if (st.outage) return { kind: 'warn', label: 'long outage' };
      if (st.flaps) return { kind: 'warn', label: 'needless elections' };
      return { kind: 'good', label: 'one leader at a time' };
    },

    presets: [
      {
        id: 'crash', title: 'The leader crashes',
        blurb: 'The leader dies. How long until writes work again?',
        config: { fault: 'crash', rule: 'majority', timeout: 5 }, knobs: ['timeout', 'fault'],
        nudge: 'Shorten the timeout and watch the gap shrink.',
        predict: { q: 'Followers wait 5 s without heartbeats before electing. Will client 2 wait more than 5 s to write?', metric: 'outage' },
      },
      {
        id: 'split-brain', title: 'Two leaders at once',
        blurb: 'A partition, and no quorum. Whose writes survive?',
        config: { fault: 'partition', rule: 'naive', timeout: 3 }, knobs: ['rule', 'timeout'],
        nudge: 'Switch the quorum to a majority and replay.',
        predict: { q: 'Leaders take over and accept writes without a majority. Will acknowledged writes be lost?', metric: 'lost' },
      },
      {
        id: 'majority', title: 'A majority decides',
        blurb: 'Votes and acks need three of five. Is anything lost?',
        config: { fault: 'partition', rule: 'majority', timeout: 3 }, knobs: ['rule', 'fault'],
        nudge: 'Nothing is lost, but look at client 1’s longest gap.',
        predict: { q: 'Leaders need 3 of 5 votes, and writes need 3 of 5 acks. Will acknowledged writes be lost?', metric: 'lost' },
      },
      {
        id: 'flapping', title: 'Timeout too short',
        blurb: 'Heartbeats sometimes stall. Is a healthy leader voted out?',
        config: { fault: 'slow', rule: 'majority', timeout: 1 }, knobs: ['timeout', 'fault'],
        nudge: 'Raise the timeout until the needless elections stop.',
        predict: { q: 'Heartbeats sometimes stall for 2 s, and the timeout is 1 s. Will a healthy leader be voted out?', metric: 'flaps' },
      },
      {
        id: 'free-play', title: 'Free play',
        blurb: 'Everything unlocked. Mix faults, rules and timeouts.',
        config: { fault: 'partition', rule: 'majority', timeout: 3 }, knobs: ['fault', 'rule', 'timeout'],
        nudge: 'Everything is unlocked. Try every fault under both rules.',
      },
    ],

    challenges: [
      {
        id: 'no-lost', title: 'No lost writes',
        blurb: 'A partition splits the cluster. Lose no acknowledged write.',
        goal: 'A partition cuts nodes 1–2 off for 15 s. No write a client was told succeeded may be lost.',
        config: { fault: 'partition', rule: 'naive', timeout: 3 }, knobs: ['rule'],
        criteria: [{ label: 'No acknowledged write is lost', metric: 'lost', max: 0 }],
        hint: 'Two sides each think they are the cluster. What can only one side have?',
        solution: { config: { rule: 'majority' }, why: 'Only one side can hold a majority, so only one leader can win votes and acknowledge writes.' },
      },
      {
        id: 'goldilocks', title: 'Not too short, not too long',
        blurb: 'Stalled heartbeats, then a crash. Pick the timeout.',
        goal: 'Heartbeats sometimes stall for up to 2.5 s, then the leader crashes. No needless elections, and client 2 never waits over 5 s.',
        config: { fault: 'slow-crash', rule: 'majority', timeout: 1 }, knobs: ['timeout'],
        criteria: [
          { label: 'No needless election', metric: 'flaps', max: 0 },
          { label: `Client 2 never waits over ${OUTAGE} s`, metric: 'outage', max: 0 },
        ],
        hint: 'The timeout must outlast a stall, but not by much.',
        solution: { config: { timeout: 3 }, why: 'Three seconds outlasts a stalled heartbeat, yet still replaces a dead leader in about 4 s.' },
      },
      {
        id: 'majority-side', title: 'Keep the majority writing',
        blurb: 'Stay safe in a partition, and keep client 2 writing.',
        goal: 'During a partition, lose no acknowledged write, and keep client 2 (on the majority side) from waiting over 5 s.',
        config: { fault: 'partition', rule: 'naive', timeout: 5 }, knobs: ['rule', 'timeout'],
        criteria: [
          { label: 'No acknowledged write is lost', metric: 'lost', max: 0 },
          { label: `Client 2 never waits over ${OUTAGE} s`, metric: 'outage', max: 0 },
        ],
        hint: 'Safety comes from the rule; the majority side’s wait comes from the timeout.',
        solution: { config: { rule: 'majority', timeout: 3 }, why: 'The majority side elects a leader after one timeout; the cut-off side waits, so nothing diverges.' },
      },
    ],

    view,
  });

  /* ---------- view: five nodes, a partition wall, and each client's writes on a 0–30 s timeline ---------- */
  const POS = [[150, 88], [150, 176], [390, 60], [390, 132], [390, 204]];
  const WALL = 270;
  const TL0 = 104, TLS = 14.4; // timeline: 0–30 s across x 104–536
  const ROW = [244, 266];
  const SCALE = 190;           // ms of animation per model second at 1×
  const RULE = {
    naive: 'No quorum: the first to time out leads, and acks writes alone',
    majority: 'A leader needs 3 of 5 votes; a write needs 3 of 5 acks',
  };
  function view(el, v, api) {
    const box = v.wrap(el);
    const holder = v.h('div');
    box.appendChild(holder);
    const log = v.log(box, { title: 'What happened, newest first', max: 6 });
    const X = (t) => TL0 + t * TLS;
    let st, nodes, clients, wall, wallText, cursor, clock, state;

    function draw(cfg) {
      holder.textContent = '';
      st = v.stage(holder, { w: 560, h: 300, label: 'Five nodes elect a leader; two clients write to whichever leader they can reach' });
      st.text(280, 18, RULE[cfg.rule], { size: 14.5, weight: 700, kind: 'text' });
      wall = st.line(WALL, 36, WALL, 222, { kind: 'bad', dashed: true, width: 2.5 });
      wallText = st.text(WALL, 34, 'partition', { size: 14, weight: 700, kind: 'bad' });
      wall.el.style.display = 'none';
      wallText.show(false);
      nodes = POS.map(([x, y], k) => st.node({ x, y, w: 110, h: 40, label: `Node ${k + 1}`, sub: '', kind: 'neutral' }));
      clients = [st.node({ x: 44, y: 132, w: 48, h: 48, shape: 'person', label: 'Client 1', kind: 'data' }), st.node({ x: 516, y: 132, w: 48, h: 48, shape: 'person', label: 'Client 2', kind: 'data' })];
      ['Client 1', 'Client 2'].forEach((name, c) => st.text(10, ROW[c] + 5, `${name} writes`, { size: 14, anchor: 'start', kind: 'text2' }));
      [0, 10, 20, 30].forEach((t) => st.text(X(t), 289, `${t} s`, { size: 14, kind: 'muted', mono: true }));
      cursor = st.line(TL0, 232, TL0, 276, { kind: 'primary', dashed: true, width: 1.5, layer: 'top' });
      clock = st.text(10, 222, '', { size: 14, anchor: 'start', mono: true, kind: 'muted' }); // clear of the node boxes
      state = POS.map((_, k) => ({ alive: true, leader: k === 0, term: 1 }));
      paintNodes();
    }
    function paintNodes() {
      state.forEach((s, k) => {
        nodes[k].set({ kind: !s.alive ? 'bad' : s.leader ? 'primary' : 'neutral', sub: !s.alive ? 'crashed' : `${s.leader ? 'leader' : 'follower'} · term ${s.term}`, down: !s.alive });
      });
    }
    function apply(e) {
      if (e.type === 'crash') state[e.k].alive = false;
      else if (e.type === 'elected') {
        state[e.k].leader = true;
        state[e.k].term = e.term;
      } else if (e.type === 'stepdown') {
        state[e.k].leader = false;
        state[e.k].term = e.newer;
      } else if (e.type === 'term') state[e.k].term = e.term;
      else if (e.type === 'cut' || e.type === 'heal') {
        const on = e.type === 'cut';
        wall.el.style.display = on ? '' : 'none';
        wallText.show(on);
      }
    }
    function tick(e) {
      // ✓ kept, red: acknowledged but later thrown away, amber: refused
      const kind = !e.ok ? 'warn' : e.lost ? 'bad' : 'good';
      st.rect(X(e.t) - 2.5, ROW[e.c] - 7, 5, 14, { kind, rx: 2 });
    }
    function logEvent(e, cfg) {
      if (e.type === 'crash') log.add(`Node ${e.k + 1}, the leader, crashes`, 'bad');
      else if (e.type === 'cut') log.add('A partition cuts nodes 1–2 off from nodes 3–5', 'bad');
      else if (e.type === 'heal') log.add('The partition heals', 'good');
      else if (e.type === 'elected') log.add(`Node ${e.k + 1} timed out and leads term ${e.term}${cfg.rule === 'majority' ? ` with ${e.votes} votes` : ''}${e.healthy ? ', though a leader was still reachable' : ''}`, e.healthy ? 'warn' : 'info');
      else if (e.type === 'noquorum') log.add(`Node ${e.k + 1} times out but reaches only ${e.votes} of 5 nodes: no election`, 'info');
      else if (e.type === 'stepdown') log.add(`Node ${e.k + 1} sees term ${e.newer} and steps down`, 'info');
    }
    function logWrite(e) {
      if (!e.ok) log.add(`Client ${e.c + 1}’s write fails: ${e.why === 'no majority' ? 'its leader cannot reach 3 nodes' : 'no leader it can reach'}`, 'warn');
      else if (e.lost) log.add(`Client ${e.c + 1}’s write to node ${e.k + 1} is acknowledged, but the leader that wins never gets it`, 'bad');
    }
    function finish(e) {
      clock.set(`t = 30 s, done`);
      if (e.lost) log.add(`${e.lost} acknowledged writes never reached the leader that won, so they are thrown away`, 'bad');
      else log.add(`No acknowledged write lost. Longest gaps: client 1 ${e.gaps[0]} s, client 2 ${e.gaps[1]} s`, 'good');
    }

    function render(result, cfg, input, o) {
      v.restart();
      draw(cfg);
      log.clear();
      const trace = result.trace;
      if (o.preview) return Promise.resolve();
      if (!o.animate) {
        trace.forEach((e) => {
          if (e.type === 'write') tick(e);
          else if (e.type === 'done') finish(e);
          else { apply(e); if (e.type !== 'start' && e.type !== 'term') logEvent(e, cfg); }
        });
        paintNodes();
        cursor.set({ x1: X(30), x2: X(30) });
        return Promise.resolve();
      }
      return animate(trace, cfg);
    }
    async function animate(trace, cfg) {
      let now = 0;
      let failed = 0;
      for (const e of trace) {
        if (e.t > now) {
          const from = now;
          await v.tween(api.pace((e.t - from) * SCALE), (k) => {
            const t = from + (e.t - from) * k;
            cursor.set({ x1: X(t), x2: X(t) });
            clock.set(`t = ${t.toFixed(1)} s`);
          }, (k) => k);
          now = e.t;
        }
        if (e.type === 'write') {
          tick(e);
          if (!e.ok && failed++ % 4) continue; // one line per few refused writes keeps the log readable
          if (!e.ok || e.lost) logWrite(e);
        } else if (e.type === 'done') finish(e);
        else if (e.type === 'term') { apply(e); paintNodes(); } // quiet: followers learning the new term
        else if (e.type !== 'start') {
          apply(e);
          paintNodes();
          logEvent(e, cfg);
          if (e.type === 'elected') {
            nodes[e.k].flash();
            await v.sleep(api.pace(320));
          }
        }
      }
    }
    return { render };
  }

  DDIA.labs.consensusModel = { run, N, MAJ, SIDE, FAULT_AT, HEAL_AT, OUTAGE };
})();
