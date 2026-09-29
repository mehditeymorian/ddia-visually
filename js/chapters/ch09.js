/* Chapter 9 — Consistency and consensus */
(function () {
  'use strict';

  DDIA.chapter({
    id: 9,
    part: 2,
    title: 'Consistency and consensus',
    short: 'Consensus',
    tagline: 'Agree on one truth despite faults',
    cards: [
      /* 1 ─────────────────────────────────────────────── */
      {
        title: 'Eventually consistent… but when?',
        lab: { id: 'quorum', preset: 'stale-read' },
        caption: 'Stop writing and replicas converge, but nobody promises when. Until then, a read can return an old value.',
        problem: 'Stale reads',
        fix: 'Stronger consistency models',
        tags: ['Cassandra', 'DynamoDB', 'Riak'],
        demo(el, v) {
          const box = v.wrap(el);
          const LAG = [250, 800, 2000, 3300];
          let lag = 2;
          v.slider(box, { label: 'Replication lag', min: 0, max: 3, value: 2, format: (x) => ['none', 'short', 'long', 'huge'][x], onInput: (x) => { lag = x; } });
          const st = v.stage(box, { w: 560, h: 230 });
          const you = st.node({ x: 60, y: 115, w: 56, h: 56, shape: 'person', label: 'You', kind: 'info' });
          const A = st.node({ x: 290, y: 50, w: 130, label: 'Replica A', shape: 'db', kind: 'good' });
          const B = st.node({ x: 290, y: 180, w: 130, label: 'Replica B', shape: 'db', kind: 'good' });
          const agree = st.node({ x: 475, y: 115, w: 120, h: 52, label: 'Replicas', sub: 'agree', shape: 'pill', kind: 'good' });
          st.link(you, A, { thin: true, arrow: false });
          st.link(you, B, { thin: true, arrow: false });
          st.link(A, B, { dashed: true, label: 'async copy' });
          const stats = v.row(box, { center: true });
          const sReads = v.stat(stats, 'reads', '0', 'info');
          const sStale = v.stat(stats, 'stale reads', '0', 'good');
          const spec = v.row(box, { center: true });
          spec.append(v.h('span', { class: 'vz-muted' }, 'weaker'), v.cell('Eventual', 'warn'), '→', v.cell('Causal', 'info'), '→', v.cell('Linearizable', 'good'), v.h('span', { class: 'vz-muted' }, 'stronger'));
          const cap = v.caption(box, 'Write something, then read it back.');
          v.controls(box, [
            { label: 'Write, then read', icon: '▶', kind: 'primary', onClick: writeRead },
            { label: 'Stop writing, wait', icon: '⏸', onClick: wait },
          ]);
          let x = 1, a = 1, b = 1, reads = 0, stale = 0;
          function paint() {
            A.set({ badge: 'x=' + a });
            B.set({ badge: 'x=' + b, kind: b === a ? 'good' : 'warn' });
            agree.set({ sub: a === b ? 'agree' : 'differ', kind: a === b ? 'good' : 'warn' });
            sReads.set(String(reads), 'info');
            sStale.set(String(stale), stale ? 'bad' : 'good');
          }
          async function writeRead() {
            v.restart();
            st.clearPackets();
            b = a; // any earlier copy has landed by now
            paint();
            const nv = ++x;
            cap.set(`You write x = ${nv} to replica A`, 'info');
            await st.send(you, A, { label: 'x=' + nv });
            a = nv;
            paint();
            st.send(A, B, { label: 'x=' + nv, kind: 'data', dur: LAG[lag] }).then(() => { b = nv; paint(); });
            cap.set('Right away you read. The balancer picks B.', 'info');
            await st.send(you, B, { label: 'read', kind: 'info', dur: 1000 });
            const got = b;
            reads++;
            if (got !== nv) stale++;
            paint();
            await st.send(B, you, { label: 'x=' + got, kind: got === nv ? 'good' : 'bad', dur: 700 });
            if (got === nv) cap.set(`Got x = ${got}. The copy won the race.`, 'good');
            else cap.set(`Got x = ${got}: your own write seems lost!`, 'bad');
          }
          async function wait() {
            v.restart();
            st.clearPackets();
            cap.set('No new writes. Just wait…', 'warn');
            if (b !== a) {
              await st.send(A, B, { label: 'x=' + a, kind: 'data', dur: 1000 });
              b = a;
              paint();
            }
            await Promise.all([st.send(you, A, { label: 'read', kind: 'info' }), st.send(you, B, { label: 'read', kind: 'info' })]);
            await Promise.all([st.send(A, you, { label: 'x=' + a, kind: 'good' }), st.send(B, you, { label: 'x=' + b, kind: 'good' })]);
            cap.set(`Both say x = ${a}. Converged, eventually.`, 'good');
          }
          paint();
        },
      },

      /* 2 ─────────────────────────────────────────────── */
      {
        title: 'Act as if there is one copy',
        lab: { id: 'quorum', preset: 'back-in-time' },
        caption: 'Linearizable: every operation takes effect at one instant. Once any read sees the new value, every later read must too.',
        problem: 'A later read goes back in time',
        fix: 'Linearizable register',
        tags: ['etcd', 'ZooKeeper', 'Spanner'],
        demo(el, v) {
          const box = v.wrap(el);
          const mode = v.segmented(box, {
            options: [
              { value: 'bad', label: 'Lagging replica', kind: 'bad' },
              { value: 'good', label: 'Linearizable', kind: 'good' },
            ],
            value: 'bad',
            onChange: run,
          });
          const st = v.stage(box, { w: 560, h: 300 });
          const cap = v.caption(box, '');
          v.controls(box, [{ label: 'Replay', icon: '▶', kind: 'primary', onClick: run }]);
          const X0 = 95, X1 = 545;
          const LY = { A: 45, B: 105, C: 165 };

          async function run() {
            v.restart();
            st.clearPackets();
            st.clear();
            const bad = mode.get() === 'bad';
            Object.entries(LY).forEach(([k, y]) => {
              st.line(X0, y, X1, y, { kind: 'muted', width: 1, dashed: true });
              st.text(14, y, 'Client ' + k, { anchor: 'start', size: 13, kind: 'text2', bold: true });
            });
            st.text(X1, 288, 'time →', { anchor: 'end', size: 12, kind: 'muted' });
            const segs = [];
            const seg = (lane, y, s, e, o) => {
              const r = st.rect(s, y - o.h / 2, 2, o.h, { kind: o.kind, label: '', size: 12, rx: 5, mono: true });
              r.set({ opacity: 0 });
              const g = Object.assign({ lane, y, s, e, r, started: false, done: false }, o);
              segs.push(g);
              return g;
            };
            // client operations
            const ops = {
              a1: seg('A', LY.A, 102, 152, { h: 26, kind: 'info', start: 'read', end: '⇒ 0', pt: 127 }),
              w: seg('C', LY.C, 170, 420, { h: 26, kind: 'primary', start: 'write x = 1', end: 'write x = 1 ⇒ ok', pt: 200 }),
              a2: seg('A', LY.A, 215, 275, { h: 26, kind: 'info', start: 'read', end: '⇒ 1', pt: 245 }),
              b1: seg('B', LY.B, 295, 355, { h: 26, kind: 'info', start: 'read', end: bad ? '⇒ 0' : '⇒ 1', pt: 322 }),
              a3: seg('A', LY.A, 455, 515, { h: 26, kind: 'info', start: 'read', end: '⇒ 1', pt: 485 }),
            };
            // what the storage holds over time
            const strips = bad ? [['Replica 1', 212, 200], ['Replica 2', 246, 385]] : [['x', 228, 200]];
            strips.forEach(([name, y, flip]) => {
              st.text(14, y, name, { anchor: 'start', size: 12, kind: 'muted', bold: true });
              seg('', y, X0, flip, { h: 22, kind: 'neutral', start: 'x = 0', end: 'x = 0' });
              seg('', y, flip, X1, { h: 22, kind: 'good', start: 'x = 1', end: 'x = 1' });
            });
            const head = st.line(X0, 22, X0, 262, { kind: 'accent', width: 1.5, layer: 'top' });
            cap.set('C writes x = 1 while A and B keep reading', 'info');
            await v.tween(5200, (t) => {
              const px = X0 + (X1 - X0) * t;
              head.set({ x1: px, x2: px });
              segs.forEach((g) => {
                if (px < g.s) return;
                if (!g.started) { g.started = true; g.r.set({ opacity: 1, label: g.start }); }
                g.r.set({ w: Math.max(2, Math.min(px, g.e) - g.s) });
                if (px >= g.e && !g.done) {
                  g.done = true;
                  g.r.set({ label: g.end });
                  if (g === ops.a2) cap.set('A reads 1: the new value is now visible', 'info');
                  if (g === ops.b1) {
                    if (bad) { g.r.set({ kind: 'bad', label: '⇒ 0 ✕' }); cap.set('B started after A saw 1, yet B reads 0!', 'bad'); }
                    else { g.r.set({ kind: 'good' }); cap.set('B started after A saw 1, so B must see 1', 'good'); }
                  }
                }
              });
            }, (t) => t);
            head.remove();
            if (bad) {
              // which replica served which read
              st.line(ops.a2.pt, LY.A + 13, ops.a2.pt, 200, { kind: 'info', dotted: true, width: 1.6 });
              st.line(ops.b1.pt, LY.B + 13, ops.b1.pt, 234, { kind: 'bad', dotted: true, width: 1.6 });
              st.line(ops.a2.e, LY.A + 10, ops.b1.s, LY.B - 10, { kind: 'bad', width: 2, arrow: true, layer: 'top' });
              st.text(ops.b1.e + 8, LY.B - 24, 'A saw 1 first', { anchor: 'start', size: 12, kind: 'bad', bold: true, halo: true });
              cap.set('B hit the lagging replica. Not linearizable.', 'bad');
            } else {
              // linearization points: one instant per op, always moving forward
              const pts = [[ops.a1.pt, LY.A], [ops.w.pt, LY.C], [ops.a2.pt, LY.A], [ops.b1.pt, LY.B], [ops.a3.pt, LY.A]];
              for (let i = 0; i < pts.length - 1; i++) st.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], { kind: 'good', width: 2, arrow: true, layer: 'top' });
              pts.forEach(([px, py]) => st.add('circle', { cx: px, cy: py, r: 5.5, class: 'vz-shape k-good', 'stroke-width': 2 }));
              cap.set('Each op lands at one instant. The chain only moves forward.', 'good');
            }
          }
          run();
        },
      },

      /* 3 ─────────────────────────────────────────────── */
      {
        title: 'Compare-and-set: exactly one winner',
        caption: 'Leader locks and unique usernames need every node to agree on one current value. Linearizable compare-and-set gives exactly one winner.',
        problem: 'Split brain, duplicate names',
        fix: 'Linearizable CAS',
        tags: ['ZooKeeper', 'etcd', 'Chubby'],
        demo(el, v) {
          const box = v.wrap(el);
          const top = v.row(box);
          const scen = v.segmented(top, { options: [{ value: 'lock', label: 'Leader lock' }, { value: 'name', label: 'Unique username' }], value: 'lock', onChange: run });
          const mode = v.segmented(top, { options: [{ value: 'bad', label: 'Two replicas', kind: 'bad' }, { value: 'good', label: 'Linearizable', kind: 'good' }], value: 'bad', onChange: run });
          const st = v.stage(box, { w: 560, h: 250 });
          const cap = v.caption(box, '');
          v.controls(box, [{ label: 'Race!', icon: '▶', kind: 'primary', onClick: run }]);

          async function run() {
            v.restart();
            st.clearPackets();
            st.clear();
            const lock = scen.get() === 'lock', bad = mode.get() === 'bad';
            const who = lock ? ['Node 1', 'Node 2'] : ['Ana', 'Ben'];
            const tag = lock ? ['N1', 'N2'] : ['Ana', 'Ben'];
            const key = lock ? 'leader' : 'alex';
            const win = lock ? 'leader' : 'owner';
            const c = [0, 1].map((i) => st.node(lock
              ? { x: 80, y: 60 + i * 130, w: 110, label: who[i] }
              : { x: 80, y: 55 + i * 130, w: 50, h: 50, shape: 'person', label: who[i] }));
            const cas = (i) => 'cas ∅→' + tag[i];
            if (bad) {
              const R = [0, 1].map((i) => st.node({ x: 320, y: 60 + i * 130, w: 140, label: 'Replica ' + (i + 1), sub: key + ' = ∅', shape: 'db' }));
              st.link(R[0], R[1], { dashed: true, both: true, label: 'async' });
              c.forEach((n, i) => st.link(n, R[i], { thin: true, arrow: false }));
              cap.set(`Both grab "${key}" at the same moment`, 'info');
              await Promise.all([0, 1].map((i) => st.send(c[i], R[i], { label: cas(i) })));
              R.forEach((r, i) => r.set({ sub: key + ' = ' + tag[i], kind: 'warn' }));
              cap.set('Each replica still sees ∅, so each says yes', 'warn');
              await Promise.all([0, 1].map((i) => st.send(R[i], c[i], { label: 'ok', kind: 'good' })));
              c.forEach((n) => n.set({ kind: 'bad', badge: win, badgeKind: 'bad' }));
              cap.set(lock ? 'Two leaders at once: split brain!' : 'Two accounts called alex!', 'bad');
              await Promise.all([
                st.send(R[0], R[1], { label: tag[0], kind: 'data', curve: 28 }),
                st.send(R[1], R[0], { label: tag[1], kind: 'data', curve: 28 }),
              ]);
              R.forEach((r) => r.set({ kind: 'bad', sub: 'conflict!' }));
              cap.set('Replication finds the clash, but both already got ok', 'bad');
            } else {
              const R = st.node({ x: 320, y: 125, w: 150, h: 56, label: 'Register', sub: key + ' = ∅', kind: 'primary', shape: 'db' });
              c.forEach((n) => st.link(n, R, { thin: true, arrow: false }));
              cap.set(`Both grab "${key}" at the same moment`, 'info');
              const w = Math.random() < 0.5 ? 0 : 1, l = 1 - w;
              const pW = st.send(c[w], R, { label: cas(w), dur: 800 }).then(() => {
                R.set({ sub: key + ' = ' + tag[w], kind: 'good' });
                cap.set(`${who[w]} lands first: value is ∅, so set it`, 'good');
              });
              const pL = st.send(c[l], R, { label: cas(l), dur: 1300 }).then(() => {
                cap.set(`${who[l]} lands next: value is no longer ∅`, 'warn');
              });
              await Promise.all([pW, pL]);
              await Promise.all([st.send(R, c[w], { label: 'ok', kind: 'good' }), st.send(R, c[l], { label: 'fail', kind: 'bad' })]);
              c[w].set({ kind: 'good', badge: win, badgeKind: 'good' });
              c[l].set({ badge: 'lost', badgeKind: 'neutral' });
              cap.set('Exactly one winner, and every node agrees who.', 'good');
            }
          }
          run();
        },
      },

      /* 4 ─────────────────────────────────────────────── */
      {
        title: 'Two channels race each other',
        caption: 'The job queue can outrun storage replication, so the worker fetches the old file. Linearizable storage removes the race.',
        problem: 'Cross-channel race',
        fix: 'Linearizable file store',
        tags: ['S3', 'RabbitMQ', 'Kafka'],
        demo(el, v) {
          const box = v.wrap(el);
          const lin = v.toggle(box, { label: 'Linearizable file store', value: false, onChange: run });
          const st = v.stage(box, { w: 560, h: 270 });
          const user = st.node({ x: 40, y: 135, w: 50, h: 50, shape: 'person', label: 'User' });
          const web = st.node({ x: 150, y: 135, w: 100, label: 'Web app', kind: 'primary' });
          const store = st.node({ x: 320, y: 55, w: 120, label: 'File store', sub: 'primary', shape: 'db' });
          const rep = st.node({ x: 485, y: 55, w: 110, label: 'Replica', shape: 'db' });
          const queue = st.node({ x: 320, y: 215, w: 120, label: 'Job queue', shape: 'pill', kind: 'data' });
          const worker = st.node({ x: 485, y: 215, w: 110, label: 'Resizer' });
          st.link(user, web);
          st.link(web, store);
          const repl = st.link(store, rep, { dashed: true, label: 'async' });
          st.link(web, queue);
          st.link(queue, worker);
          st.link(worker, rep, { thin: true, label: 'fetch' });
          const cap = v.caption(box, '');
          v.controls(box, [{ label: 'Upload photo v2', icon: '▶', kind: 'primary', onClick: run }]);
          let repV = 'v1';

          async function run() {
            v.restart();
            st.clearPackets();
            const on = lin.get();
            repV = 'v1';
            repl.set({ label: on ? 'sync' : 'async', dashed: !on, kind: on ? 'good' : 'muted' });
            store.set({ badge: 'v1', kind: 'neutral' });
            rep.set({ badge: 'v1', kind: 'neutral' });
            worker.set({ badge: '', kind: 'neutral', sub: '' });
            cap.set('User uploads a new profile photo, v2', 'info');
            await st.send(user, web, { label: 'v2' });
            await st.send(web, store, { label: 'v2', kind: 'data' });
            store.set({ badge: 'v2', kind: 'good' });
            let copy = null;
            if (on) {
              cap.set('Linearizable: the write finishes only once every read sees it', 'good');
              await st.send(store, rep, { label: 'v2', kind: 'data' });
              repV = 'v2';
              rep.set({ badge: 'v2', kind: 'good' });
              await st.send(rep, store, { label: 'ack', kind: 'good', dur: 500 });
            } else {
              copy = st.send(store, rep, { label: 'v2', kind: 'data', dur: 3800 }).then(() => { repV = 'v2'; rep.set({ badge: 'v2', kind: 'good' }); });
            }
            cap.set('Then a resize job goes onto the queue', 'info');
            await st.send(web, queue, { label: 'job', kind: 'data', dur: 600 });
            await st.send(queue, worker, { label: 'job', kind: 'data', dur: 600 });
            cap.set('The resizer fetches the photo from the replica', 'info');
            await st.send(worker, rep, { label: 'get', kind: 'info', dur: 500 });
            const got = repV;
            const ok = got === 'v2';
            await st.send(rep, worker, { label: got, kind: ok ? 'good' : 'bad', dur: 500 });
            worker.set({ badge: got, badgeKind: ok ? 'good' : 'bad', kind: ok ? 'good' : 'bad', sub: 'resized ' + got });
            cap.set(ok ? 'Thumbnail matches the new photo.' : 'The queue won: it resized the OLD photo', ok ? 'good' : 'bad');
            if (copy) {
              await copy;
              cap.set('The copy lands too late. Photo and thumbnail now disagree.', 'bad');
            }
          }
          run();
        },
      },

      /* 5 ─────────────────────────────────────────────── */
      {
        title: 'Which replication can be linearizable?',
        caption: 'Single-leader: maybe. Consensus: yes. Multi-leader: no. Leaderless with quorums: probably not, since delays can reorder what readers see.',
        tags: ['MySQL', 'etcd', 'Cassandra', 'Riak'],
        demo(el, v) {
          const box = v.wrap(el);
          const mode = v.segmented(box, {
            options: [
              { value: 'single', label: 'Single-leader' },
              { value: 'cons', label: 'Consensus' },
              { value: 'multi', label: 'Multi-leader' },
              { value: 'less', label: 'Leaderless' },
            ],
            value: 'single',
            onChange: run,
          });
          const st = v.stage(box, { w: 560, h: 290 });
          const cap = v.caption(box, '');
          v.controls(box, [{ label: 'Replay', icon: '▶', kind: 'primary', onClick: run }]);
          const VERDICT = { single: ['MAYBE', 'warn'], cons: ['YES', 'good'], multi: ['NO', 'bad'], less: ['PROBABLY NOT', 'bad'] };

          async function run() {
            v.restart();
            st.clearPackets();
            st.clear();
            const m = mode.get();
            const val = [0, 0, 0];
            const R = [0, 1, 2].map((i) => st.node({ x: 280, y: 55 + i * 90, w: 120, h: 46, label: 'Replica ' + (i + 1), shape: 'db', badge: 'x=0' }));
            const setV = (i, x, kind) => { val[i] = x; R[i].set({ badge: 'x=' + x, kind: kind || 'good' }); };
            const verdict = st.text(545, 22, '', { anchor: 'end', size: 15, bold: true });
            const done = () => verdict.set('Linearizable? ' + VERDICT[m][0], VERDICT[m][1]);
            const rA = st.node({ x: 490, y: 90, w: 46, h: 46, shape: 'person', label: 'Reader A', kind: 'info' });
            const rB = st.node({ x: 490, y: 205, w: 46, h: 46, shape: 'person', label: 'Reader B', kind: 'info' });

            if (m === 'multi') {
              const w1 = st.node({ x: 70, y: 55, w: 46, h: 46, shape: 'person', label: 'Writer 1' });
              const w2 = st.node({ x: 70, y: 235, w: 46, h: 46, shape: 'person', label: 'Writer 2' });
              R.forEach((r, i) => r.set({ label: 'Leader ' + (i + 1), kind: 'primary' }));
              st.link(R[0], R[2], { dashed: true, both: true, curve: -60, label: 'async' });
              cap.set('Two leaders accept writes at the same time', 'info');
              await Promise.all([st.send(w1, R[0], { label: 'x=1' }), st.send(w2, R[2], { label: 'x=2' })]);
              setV(0, 1, 'warn');
              setV(2, 2, 'warn');
              await Promise.all([st.send(rA, R[0], { label: 'read', kind: 'info' }), st.send(rB, R[2], { label: 'read', kind: 'info' })]);
              await Promise.all([st.send(R[0], rA, { label: 'x=1', kind: 'warn' }), st.send(R[2], rB, { label: 'x=2', kind: 'warn' })]);
              cap.set('Same moment, two answers: there is no single copy', 'bad');
              await Promise.all([st.send(R[0], R[2], { label: 'x=1', kind: 'data', curve: -60 }), st.send(R[2], R[0], { label: 'x=2', kind: 'data', curve: 60 })]);
              R[0].set({ kind: 'bad' });
              R[2].set({ kind: 'bad' });
              cap.set('The writes conflict and need resolving later', 'bad');
              done();
              return;
            }

            const w = st.node({ x: 70, y: 145, w: 50, h: 50, shape: 'person', label: 'Writer' });
            if (m === 'single' || m === 'cons') {
              R[0].set({ label: 'Leader', kind: 'primary' });
              R[1].set({ label: 'Follower 1' });
              R[2].set({ label: 'Follower 2' });
              st.link(R[0], R[1], { dashed: true, thin: true });
              st.link(R[1], R[2], { dashed: true, thin: true });
            }
            if (m === 'single') {
              cap.set('All writes go through the leader', 'info');
              await st.send(w, R[0], { label: 'x=1' });
              setV(0, 1);
              st.send(R[0], R[1], { label: 'x=1', kind: 'data', dur: 700 }).then(() => setV(1, 1));
              st.send(R[0], R[2], { label: 'x=1', kind: 'data', dur: 4600, curve: 60 }).then(() => setV(2, 1));
              cap.set('Read from the leader: always fresh', 'good');
              await st.send(rA, R[0], { label: 'read', kind: 'info' });
              await st.send(R[0], rA, { label: 'x=1', kind: 'good' });
              cap.set('Read from a lagging async follower: stale', 'warn');
              await st.send(rB, R[2], { label: 'read', kind: 'info' });
              await st.send(R[2], rB, { label: 'x=' + val[2], kind: val[2] ? 'good' : 'bad' });
              cap.set('Linearizable only if reads hit the one true leader', 'warn');
              done();
            } else if (m === 'cons') {
              cap.set('Leader replies only after a majority has the write', 'info');
              await st.send(w, R[0], { label: 'x=1' });
              st.send(R[0], R[2], { label: 'x=1', kind: 'data', dur: 2600, curve: 60 }).then(() => setV(2, 1));
              await st.send(R[0], R[1], { label: 'x=1', kind: 'data' });
              setV(1, 1);
              await st.send(R[1], R[0], { label: 'ack', kind: 'good' });
              setV(0, 1);
              await st.send(R[0], w, { label: 'ok', kind: 'good' });
              cap.set('Reads also go through the leader, which checks a majority', 'info');
              await st.send(rB, R[0], { label: 'read', kind: 'info' });
              await st.send(R[0], R[1], { label: 'leader?', kind: 'info', dur: 600 });
              await st.send(R[1], R[0], { label: 'yes', kind: 'good', dur: 600 });
              await st.send(R[0], rB, { label: 'x=1', kind: 'good' });
              cap.set('Majorities and epochs keep it linearizable, even with faults', 'good');
              done();
            } else {
              st.text(280, 12, 'n = 3   w = 3   r = 2', { size: 13, kind: 'text2', mono: true, bold: true });
              cap.set('Writer sends x=1 to all three. Two copies are slow.', 'info');
              const slow = [1, 2].map((i) => st.send(w, R[i], { label: 'x=1', kind: 'data', dur: 5600 }).then(() => setV(i, 1)));
              await st.send(w, R[0], { label: 'x=1', kind: 'data', dur: 600 });
              setV(0, 1);
              cap.set('Reader A asks replicas 1 and 2', 'info');
              await Promise.all([st.send(rA, R[0], { label: 'get', kind: 'info', dur: 650 }), st.send(rA, R[1], { label: 'get', kind: 'info', dur: 650 })]);
              await Promise.all([0, 1].map((i) => st.send(R[i], rA, { label: 'x=' + val[i], kind: val[i] ? 'good' : 'warn', dur: 650 })));
              rA.set({ badge: 'x=1', badgeKind: 'good' });
              cap.set('A takes the newest: x=1. Then B starts reading.', 'good');
              await Promise.all([st.send(rB, R[1], { label: 'get', kind: 'info', dur: 650 }), st.send(rB, R[2], { label: 'get', kind: 'info', dur: 650 })]);
              await Promise.all([1, 2].map((i) => st.send(R[i], rB, { label: 'x=' + val[i], kind: val[i] ? 'good' : 'bad', dur: 650 })));
              const bx = Math.max(val[1], val[2]);
              rB.set({ badge: 'x=' + bx, badgeKind: bx ? 'good' : 'bad' });
              cap.set(bx ? 'B got 1 this time.' : 'B started after A, yet got 0. Quorum, not linearizable.', bx ? 'good' : 'bad');
              await Promise.all(slow);
              done();
            }
          }
          run();
        },
      },

      /* 6 ─────────────────────────────────────────────── */
      {
        title: 'The price: availability and speed',
        lab: { id: 'quorum', preset: 'availability' },
        caption: 'During a partition, a linearizable system must refuse some requests. Even on a healthy network, every write waits for a cross-datacenter round trip.',
        problem: 'Network partition',
        fix: 'Choose: linearizable or available',
        tags: ['CAP', 'CP', 'AP'],
        demo(el, v) {
          const box = v.wrap(el);
          const top = v.row(box);
          const mode = v.segmented(top, { options: [{ value: 'lin', label: 'Linearizable', kind: 'good' }, { value: 'avail', label: 'Available', kind: 'warn' }], value: 'lin', onChange: reset });
          const part = v.toggle(top, { label: 'Cut the link', value: false, onChange: paint });
          const st = v.stage(box, { w: 560, h: 260 });
          st.box(10, 10, 250, 240, { label: 'DATACENTER 1', kind: 'primary' });
          st.box(300, 10, 250, 240, { label: 'DATACENTER 2', kind: 'info' });
          const db1 = st.node({ x: 135, y: 95, w: 120, label: 'Leader', shape: 'db', kind: 'primary' });
          const db2 = st.node({ x: 425, y: 95, w: 120, label: 'Follower', shape: 'db' });
          const dana = st.node({ x: 135, y: 195, w: 46, h: 46, shape: 'person', label: 'Dana', kind: 'info' });
          const eli = st.node({ x: 425, y: 195, w: 46, h: 46, shape: 'person', label: 'Eli', kind: 'info' });
          const wan = st.link(db1, db2, { both: true, label: 'WAN', labelDy: -26 });
          const cut = st.text(280, 95, '✕', { size: 28, kind: 'bad', bold: true, halo: true });
          st.link(dana, db1, { thin: true, both: true });
          st.link(eli, db2, { thin: true, both: true });
          const stats = v.row(box, { center: true });
          const sLat = v.stat(stats, "Eli's write", '—', 'info');
          const sRead = v.stat(stats, "Dana's read", '—', 'info');
          const cap = v.caption(box, '');
          v.controls(box, [
            { label: 'Eli writes', icon: '✎', kind: 'primary', onClick: write },
            { label: 'Dana reads', icon: '◉', onClick: read },
          ]);
          let v1 = 0, v2 = 0, latest = 0;
          const isCut = () => part.get();
          const lin = () => mode.get() === 'lin';
          function badges() {
            db1.set({ badge: 'x=' + v1 });
            db2.set({ badge: 'x=' + v2 });
          }
          function paint() {
            v.restart();
            st.clearPackets();
            wan.set({ kind: isCut() ? 'bad' : 'muted', dashed: isCut(), label: isCut() ? 'partition' : 'WAN' });
            cut.show(isCut());
            db1.set({ label: lin() ? 'Leader' : 'Leader 1', kind: 'primary' });
            db2.set({ label: lin() ? 'Follower' : 'Leader 2', kind: lin() ? 'neutral' : 'primary' });
            badges();
            if (!isCut() && v1 !== v2) {
              cap.set('Link is back: queued writes sync up', 'info');
              const x = Math.max(v1, v2);
              st.send(db2, db1, { label: 'x=' + x, kind: 'data', dur: 1100 }).then(() => { v1 = x; v2 = x; badges(); cap.set('Replicas agree again', 'good'); });
            } else {
              cap.set(isCut() ? 'The datacenters cannot talk. Try a write.' : 'Network is fine. Try a write.', isCut() ? 'warn' : 'info');
            }
          }
          function reset() {
            v1 = v2 = latest = 0;
            sLat.set('—', 'info');
            sRead.set('—', 'info');
            paint();
          }
          async function write() {
            v.restart();
            st.clearPackets();
            const x = latest + 1;
            await st.send(eli, db2, { label: 'x=' + x, dur: 600 });
            if (lin()) {
              cap.set('Linearizable: only the leader may order writes', 'info');
              if (isCut()) {
                await st.send(db2, db1, { label: 'x=' + x, drop: true, dur: 1300 });
                await st.send(db2, eli, { label: 'error', kind: 'bad', dur: 600 });
                sLat.set('unavailable', 'bad');
                cap.set('Leader unreachable: Eli gets an error. Correct, not available.', 'bad');
                return;
              }
              await st.send(db2, db1, { label: 'x=' + x, dur: 1300 });
              latest = x;
              v1 = x;
              badges();
              await st.send(db1, db2, { label: 'ok', kind: 'good', dur: 1300 });
              v2 = x;
              badges();
              await st.send(db2, eli, { label: 'ok', kind: 'good', dur: 600 });
              sLat.set('~160 ms', 'warn');
              cap.set('Correct, but each write crosses the WAN twice. Always slow.', 'warn');
            } else {
              latest = x;
              v2 = x;
              badges();
              await st.send(db2, eli, { label: 'ok', kind: 'good', dur: 600 });
              sLat.set('~2 ms', 'good');
              if (isCut()) {
                cap.set('Accepted locally. The copy must wait for the link.', 'warn');
                await st.send(db2, db1, { label: 'x=' + x, kind: 'data', drop: true, dur: 1300 });
              } else {
                cap.set('Fast local write. Copied to the other side later.', 'good');
                await st.send(db2, db1, { label: 'x=' + x, kind: 'data', dur: 1300 });
                v1 = Math.max(v1, x);
                badges();
              }
            }
          }
          async function read() {
            v.restart();
            st.clearPackets();
            await st.send(dana, db1, { label: 'read', kind: 'info', dur: 600 });
            const fresh = v1 >= latest;
            await st.send(db1, dana, { label: 'x=' + v1, kind: fresh ? 'good' : 'bad', dur: 600 });
            sRead.set(fresh ? 'fresh' : 'stale', fresh ? 'good' : 'bad');
            if (fresh) cap.set(`Dana sees x=${v1}, the latest value`, 'good');
            else cap.set(`Dana sees x=${v1}, but Eli wrote x=${latest}. Not linearizable.`, 'bad');
          }
          reset();
        },
      },

      /* 7 ─────────────────────────────────────────────── */
      {
        title: 'Cause must come before effect',
        caption: 'Causality is a partial order: a reply follows its question, unrelated posts are concurrent. Causal consistency keeps this order and stays available.',
        problem: 'Reply shown before its question',
        fix: 'Causal delivery',
        tags: ['happens-before', 'version vectors'],
        demo(el, v) {
          const box = v.wrap(el);
          const causal = v.toggle(box, { label: 'Causal delivery', value: false, onChange: run });
          const st = v.stage(box, { w: 560, h: 300 });
          const ana = st.node({ x: 60, y: 55, w: 44, h: 44, shape: 'person', label: 'Ana' });
          const ben = st.node({ x: 60, y: 150, w: 44, h: 44, shape: 'person', label: 'Ben' });
          const dee = st.node({ x: 60, y: 245, w: 44, h: 44, shape: 'person', label: 'Dee' });
          const R = st.node({ x: 255, y: 150, w: 130, label: 'Cy’s replica', shape: 'db' });
          [ana, ben, dee].forEach((n) => st.link(n, R, { thin: true, dashed: true }));
          st.link(ana, ben, { thin: true, dotted: true, curve: 45 });
          const held = st.text(255, 200, '', { size: 13, kind: 'warn', bold: true });
          st.text(460, 26, 'Cy’s screen', { size: 13, kind: 'text2', bold: true });
          st.box(385, 40, 150, 152, { kind: 'neutral' });
          st.text(460, 228, 'Q → A: ordered', { size: 13, kind: 'text2', bold: true });
          st.text(460, 252, 'Z ∥ Q: concurrent', { size: 13, kind: 'muted', bold: true });
          const cap = v.caption(box, '');
          v.controls(box, [{ label: 'Replay', icon: '▶', kind: 'primary', onClick: run }]);
          let slots = [];

          async function run() {
            v.restart();
            st.clearPackets();
            slots.forEach((s) => s.remove());
            slots = [];
            const on = causal.get();
            const got = new Set();
            const buf = [];
            held.set('');
            R.set({ kind: 'neutral' });
            ben.set({ badge: '' });
            const M = {
              Q: { id: 'Q', text: 'Q: Lunch?', deps: [] },
              A: { id: 'A', text: 'A: Yes, noon!', deps: ['Q'] },
              Z: { id: 'Z', text: 'Z: Hi all', deps: [] },
            };
            const show = (m) => {
              const orphan = m.deps.some((d) => !got.has(d));
              got.add(m.id);
              slots.push(st.rect(395, 52 + slots.length * 46, 130, 38, { kind: orphan ? 'bad' : 'good', label: m.text + (orphan ? ' ?' : ''), size: 13 }));
              return orphan;
            };
            const arrive = (m) => {
              if (on && m.deps.some((d) => !got.has(d))) {
                buf.push(m);
                held.set('holding ' + m.id + ' until Q');
                R.set({ kind: 'warn' });
                cap.set(`${m.id} depends on Q, which hasn't arrived: hold it`, 'warn');
                return;
              }
              const orphan = show(m);
              if (orphan) cap.set('Cy sees an answer to a question that isn’t there!', 'bad');
              else if (m.id === 'Z') cap.set('Z depends on nothing: show it right away', 'good');
              else cap.set(on ? 'Q arrives and is shown' : 'Q finally arrives, after its answer', on ? 'good' : 'warn');
              for (let i = 0; i < buf.length; i++) {
                if (buf[i].deps.every((d) => got.has(d))) {
                  const h = buf.splice(i, 1)[0];
                  i = -1;
                  show(h);
                  held.set('');
                  R.set({ kind: 'good' });
                  cap.set(`Its cause is here, so ${h.id} is released`, 'good');
                }
              }
            };
            cap.set('Ana asks. Ben reads it and replies. Dee says hi.', 'info');
            const pQ = st.send(ana, R, { label: 'Q', kind: 'data', dur: 3400 }).then(() => arrive(M.Q));
            const pZ = st.send(dee, R, { label: 'Z', kind: 'data', dur: 2000 }).then(() => arrive(M.Z));
            await st.send(ana, ben, { label: 'Q', kind: 'data', dur: 700, curve: 45 });
            ben.set({ badge: 'saw Q' });
            const pA = st.send(ben, R, { label: 'A', kind: 'data', dur: 700 }).then(() => arrive(M.A));
            await Promise.all([pQ, pZ, pA]);
            await v.sleep(900);
            if (on) cap.set('Answer after question. Z could sit anywhere: a partial order.', 'good');
            else cap.set('The network reordered them. Causality broken.', 'bad');
          }
          run();
        },
      },

      /* 8 ─────────────────────────────────────────────── */
      {
        title: 'Number events so causes come first',
        caption: 'Per-node counters, clocks and number blocks can give an effect a smaller number than its cause. Lamport clocks take max + 1, so they never do.',
        problem: 'Non-causal sequence numbers',
        fix: 'Lamport timestamps',
        tags: ['logical clocks', 'Lamport 1978'],
        demo(el, v) {
          const box = v.wrap(el);
          const mode = v.segmented(box, {
            options: [
              { value: 'node', label: 'Per-node', kind: 'bad' },
              { value: 'clock', label: 'Wall clock', kind: 'bad' },
              { value: 'block', label: 'Blocks', kind: 'bad' },
              { value: 'lamport', label: 'Lamport', kind: 'good' },
            ],
            value: 'node',
            onChange: () => { v.restart(); st.clearPackets(); draw(); },
          });
          const st = v.stage(box, { w: 560, h: 250 });
          const stats = v.row(box, { center: true });
          const sBad = v.stat(stats, 'effects numbered below their cause', '0', 'good');
          const ord = v.row(box, { center: true });
          ord.appendChild(v.h('span', { class: 'vz-muted' }, 'sorted:'));
          const tape = v.tape(ord, []);
          const cap = v.caption(box, '');
          v.controls(box, [
            { label: 'A op', onClick: () => op(0) },
            { label: 'B op', onClick: () => op(1) },
            { label: 'C op', onClick: () => op(2) },
            { label: 'A → B', icon: '↗', kind: 'primary', onClick: () => msg(0, 1) },
            { label: 'B → C', icon: '↗', kind: 'primary', onClick: () => msg(1, 2) },
            { label: 'C → A', icon: '↗', kind: 'primary', onClick: () => msg(2, 0) },
            { label: 'Sample', icon: '↺', kind: 'ghost', onClick: seed },
          ]);
          const NAMES = 'ABC', LY = [50, 125, 200], X0 = 105, DX = 39, MAX = 12, SKEW = [0, -30, 20];
          const X = (i) => X0 + i * DX;
          const TEXT = {
            node: 'Each node counts alone: A 1,4,7… B 2,5,8… C 3,6,9…',
            clock: 'Clocks drift: B runs 30 ms slow, C 20 ms fast.',
            block: 'A numbers from 1, B from 1001, C from 2001.',
            lamport: 'On receive: max(own, received) + 1. Ties break by node.',
          };
          let events = [];
          const cmp = (p, q) => p.c - q.c || p.n - q.n;
          const fmt = (m, s) => (m === 'lamport' ? `(${s.c},${NAMES[s.n]})` : String(s.c));
          function stamps(m) {
            const cnt = [0, 0, 0], res = [];
            events.forEach((e) => {
              let c;
              if (m === 'node') c = cnt[e.node]++ * 3 + e.node + 1;
              else if (m === 'clock') c = 100 + e.i * 10 + SKEW[e.node];
              else if (m === 'block') c = e.node * 1000 + ++cnt[e.node];
              else {
                cnt[e.node] = Math.max(cnt[e.node], e.type === 'recv' ? res[e.pair].c : 0) + 1;
                c = cnt[e.node];
              }
              res.push({ c, n: e.node });
            });
            return res;
          }
          function draw(hideLast) {
            st.clear();
            const m = mode.get();
            const ts = stamps(m);
            const n = hideLast ? events.length - 1 : events.length;
            LY.forEach((y, k) => {
              st.line(70, y, 548, y, { kind: 'muted', width: 1.2 });
              st.node({ x: 35, y, w: 44, h: 34, label: NAMES[k], kind: 'primary' });
              if (m === 'clock') st.text(35, y + 30, ['on time', '−30 ms', '+20 ms'][k], { size: 12, kind: k ? 'warn' : 'muted', bold: true });
            });
            st.text(548, 240, 'time →', { anchor: 'end', size: 12, kind: 'muted' });
            let bad = 0;
            const isBad = (i) => events[i].type === 'recv' && cmp(ts[i], ts[events[i].pair]) < 0;
            for (let i = 0; i < n; i++) {
              const e = events[i];
              if (e.type !== 'recv') continue;
              const s = events[e.pair];
              const b = isBad(i);
              if (b) bad++;
              const x1 = X(s.i), y1 = LY[s.node], x2 = X(e.i), y2 = LY[e.node];
              const d = Math.hypot(x2 - x1, y2 - y1);
              st.line(x1, y1, x2 - ((x2 - x1) / d) * 9, y2 - ((y2 - y1) / d) * 9, { kind: b ? 'bad' : 'info', width: b ? 2.4 : 1.6, arrow: true });
            }
            for (let i = 0; i < n; i++) {
              const e = events[i];
              const b = isBad(i);
              const cx = X(e.i), cy = LY[e.node];
              st.add('circle', { cx, cy, r: 6, class: 'vz-shape k-' + (b ? 'bad' : e.type === 'op' ? 'neutral' : 'info'), 'stroke-width': 2 });
              st.text(cx, cy + (e.i % 2 ? 20 : -18), fmt(m, ts[i]), { size: 12, mono: true, kind: b ? 'bad' : 'text2', bold: b, halo: true });
            }
            sBad.set(String(bad), bad ? 'bad' : 'good');
            const order = ts.slice(0, n).map((t, i) => ({ t, i })).sort((p, q) => cmp(p.t, q.t));
            tape.set(order.map(({ t, i }) => ({
              text: m === 'lamport' ? fmt(m, t) : NAMES[t.n] + ':' + t.c,
              kind: isBad(i) ? 'bad' : m === 'lamport' ? 'good' : 'neutral',
              sm: true,
            })));
            if (bad) cap.set(TEXT[m].replace(/[.…]$/, '') + '. Red: effect sorts first.', 'bad');
            else cap.set(TEXT[m], m === 'lamport' ? 'good' : 'info');
          }
          function op(k) {
            v.restart();
            st.clearPackets();
            if (events.length + 1 > MAX) events = [];
            events.push({ i: events.length, node: k, type: 'op' });
            draw();
          }
          async function msg(a, b) {
            v.restart();
            st.clearPackets();
            if (events.length + 2 > MAX) events = [];
            const si = events.length;
            events.push({ i: si, node: a, type: 'send' });
            events.push({ i: si + 1, node: b, type: 'recv', pair: si });
            draw(true);
            const m = mode.get();
            const s = stamps(m)[si];
            await st.send({ x: X(si), y: LY[a] }, { x: X(si + 1), y: LY[b] }, { label: m === 'lamport' ? 'max ' + s.c : 'msg', kind: 'info', dur: 800 });
            draw();
          }
          function seed() {
            v.restart();
            st.clearPackets();
            events = [];
            const add = (node, type, pair) => events.push({ i: events.length, node, type, pair });
            add(0, 'op'); add(0, 'op'); add(0, 'send'); add(1, 'recv', 2);
            add(1, 'send'); add(2, 'recv', 4); add(2, 'send'); add(0, 'recv', 6);
            draw();
          }
          seed();
        },
      },

      /* 9 ─────────────────────────────────────────────── */
      {
        title: 'Timestamps can’t decide right now',
        caption: 'A Lamport order is final only after hearing from every node. A shared, totally ordered log fixes the order on delivery, so the first claim wins.',
        problem: 'Order known too late',
        fix: 'Total order broadcast',
        demo(el, v) {
          const box = v.wrap(el);
          const mode = v.segmented(box, {
            options: [
              { value: 'now', label: 'Decide now', kind: 'bad' },
              { value: 'ask', label: 'Ask every node', kind: 'warn' },
              { value: 'log', label: 'Shared log', kind: 'good' },
            ],
            value: 'now',
            onChange: run,
          });
          const st = v.stage(box, { w: 560, h: 290 });
          const cap = v.caption(box, '');
          v.controls(box, [{ label: 'Both claim "alex"', icon: '▶', kind: 'primary', onClick: run }]);

          async function run() {
            v.restart();
            st.clearPackets();
            st.clear();
            const m = mode.get();
            const ana = st.node({ x: 45, y: 60, w: 48, h: 48, shape: 'person', label: 'Ana' });
            const ben = st.node({ x: 45, y: 225, w: 48, h: 48, shape: 'person', label: 'Ben' });
            const n1 = st.node({ x: 185, y: 60, w: 104, label: 'Node 1' });
            const n2 = st.node({ x: 185, y: 225, w: 104, label: 'Node 2' });
            const n3 = st.node({ x: 185, y: 142, w: 104, label: 'Node 3', sub: 'unreachable', kind: 'bad', down: true });
            st.link(ana, n1, { thin: true });
            st.link(ben, n2, { thin: true });
            const isLog = m === 'log';
            st.box(300, 86, 250, 112, { label: isLog ? 'SHARED LOG' : 'SORTED LATER', kind: isLog ? 'primary' : 'neutral' });
            const slot = (k, text, kind) => st.rect(315 + k * 115, 116, 105, 40, { kind, label: text, size: 13, mono: true });
            if (isLog) { st.text(367, 176, '#1', { size: 12, kind: 'muted', bold: true }); st.text(482, 176, '#2', { size: 12, kind: 'muted', bold: true }); }
            const people = [ana, ben], nodes = [n1, n2], names = ['Ana', 'Ben'];
            cap.set('Ana and Ben both want the name "alex"', 'info');
            await Promise.all([st.send(ana, n1, { label: 'alex' }), st.send(ben, n2, { label: 'alex' })]);

            if (m === 'now') {
              n1.set({ badge: '(5,1)' });
              n2.set({ badge: '(4,2)' });
              cap.set('Each node stamps its claim and must answer now', 'warn');
              await v.sleep(700);
              await Promise.all([st.send(n1, ana, { label: 'ok', kind: 'good' }), st.send(n2, ben, { label: 'ok', kind: 'good' })]);
              people.forEach((p) => p.set({ badge: 'alex', badgeKind: 'good' }));
              cap.set('Both told ok. Later the nodes compare notes…', 'warn');
              await Promise.all([
                st.send(n1, n2, { label: '(5,1)', kind: 'data', curve: 75 }),
                st.send(n2, n1, { label: '(4,2)', kind: 'data', curve: 75 }),
              ]);
              slot(0, '(4,2) Ben', 'good');
              slot(1, '(5,1) Ana', 'bad');
              ana.set({ kind: 'bad', badgeKind: 'bad' });
              cap.set('Ben’s stamp is lower, so he won. Ana was told ok wrongly.', 'bad');
            } else if (m === 'ask') {
              n1.set({ badge: '(5,1)' });
              n2.set({ badge: '(4,2)' });
              cap.set('Before answering, check every node for rival claims', 'info');
              await Promise.all([
                st.send(n1, n2, { label: 'alex?', kind: 'info', curve: 75 }),
                st.send(n2, n1, { label: 'alex?', kind: 'info', curve: 75 }),
                st.send(n1, n3, { label: 'alex?', kind: 'info', drop: true }),
                st.send(n2, n3, { label: 'alex?', kind: 'info', drop: true }),
              ]);
              slot(0, '(4,2) Ben', 'neutral');
              slot(1, '(5,1) Ana', 'neutral');
              n1.set({ kind: 'warn', sub: 'waiting…' });
              n2.set({ kind: 'warn', sub: 'waiting…' });
              cap.set('Node 3 might hold an even lower stamp. Nobody can answer.', 'warn');
              for (let k = 0; k < 2; k++) {
                await Promise.all([st.send(n1, n3, { label: 'retry', kind: 'info', drop: true }), st.send(n2, n3, { label: 'retry', kind: 'info', drop: true })]);
              }
              cap.set('One unreachable node blocks everyone. Not fault-tolerant.', 'bad');
            } else {
              cap.set('Each node appends its claim to the shared log', 'info');
              const first = Math.random() < 0.5 ? 0 : 1;
              const LOG = { x: 425, y: 136 };
              let pos = 0;
              await Promise.all([0, 1].map((k) => st.send(nodes[k], LOG, { label: names[k] + ':alex', kind: 'data', dur: k === first ? 800 : 1250 })
                .then(() => { slot(pos++, names[k] + ':alex', pos === 1 ? 'good' : 'data'); })));
              cap.set('The log delivers the same order to every node', 'info');
              await Promise.all([st.send(LOG, n1, { label: '#1 #2', kind: 'data' }), st.send(LOG, n2, { label: '#1 #2', kind: 'data' })]);
              const w = first, l = 1 - first;
              cap.set(`Both nodes read it: the first "alex" claim is ${names[w]}'s`, 'good');
              await Promise.all([
                st.send(nodes[w], people[w], { label: 'ok', kind: 'good' }),
                st.send(nodes[l], people[l], { label: 'taken', kind: 'bad' }),
              ]);
              people[w].set({ kind: 'good', badge: 'alex', badgeKind: 'good' });
              people[l].set({ badge: 'taken', badgeKind: 'bad' });
              cap.set('First claim in the log wins everywhere. Node 3 isn’t needed.', 'good');
            }
          }
          run();
        },
      },

      /* 10 ─────────────────────────────────────────────── */
      {
        title: 'Same log order, same state',
        caption: 'A linearizable counter numbers messages 1, 2, 3 with no gaps. Replicas wait for any missing number, apply in order and stay identical.',
        problem: 'Replicas apply in different orders',
        fix: 'Total order broadcast',
        tags: ['state machine replication', 'Raft', 'ZooKeeper'],
        demo(el, v) {
          const box = v.wrap(el);
          const mode = v.segmented(box, { options: [{ value: 'bad', label: 'Apply on arrival', kind: 'bad' }, { value: 'good', label: 'Apply in number order', kind: 'good' }], value: 'bad', onChange: run });
          const st = v.stage(box, { w: 560, h: 290 });
          const counter = st.node({ x: 85, y: 60, w: 120, label: 'Counter', sub: 'next = 1', kind: 'primary' });
          const cl = st.node({ x: 85, y: 215, w: 120, label: 'Senders', kind: 'info' });
          st.link(cl, counter, { both: true, thin: true, label: 'increment' });
          const R = [0, 1, 2].map((i) => st.node({ x: 290, y: 50 + i * 95, w: 110, h: 46, label: 'Replica ' + (i + 1), shape: 'db' }));
          const vt = R.map((r, i) => st.text(365, 50 + i * 95 - 9, '', { anchor: 'start', size: 15, bold: true, mono: true }));
          const bt = R.map((r, i) => st.text(365, 50 + i * 95 + 13, '', { anchor: 'start', size: 12, kind: 'muted', mono: true }));
          const OPS = [{ lab: 'x=3', f: () => 3 }, { lab: 'x×2', f: (x) => x * 2 }, { lab: 'x+1', f: (x) => x + 1 }];
          const DUR = [[600, 1000, 1400], [1700, 600, 1100], [1100, 1600, 600]];
          const cap = v.caption(box, '');
          v.controls(box, [{ label: 'Send 3 updates', icon: '▶', kind: 'primary', onClick: run }]);

          async function run() {
            v.restart();
            st.clearPackets();
            const inOrder = mode.get() === 'good';
            const x = [0, 0, 0], applied = [[], [], []], buf = [[], [], []];
            const nums = (a) => a.map((k) => '#' + (k + 1)).join(' ');
            const paint = (r) => {
              vt[r].set('x = ' + x[r], 'text');
              bt[r].set('applied ' + (applied[r].length ? nums(applied[r]) : '—') + (buf[r].length ? '  hold ' + nums(buf[r]) : ''));
            };
            R.forEach((r, i) => { r.set({ kind: 'neutral' }); paint(i); });
            counter.set({ sub: 'next = 1' });
            cap.set('Each update first takes a number from the counter', 'info');
            for (let k = 0; k < 3; k++) {
              await st.send(cl, counter, { label: 'next?', kind: 'info', dur: 420 });
              counter.set({ sub: 'next = ' + (k + 2) });
              await st.send(counter, cl, { label: '#' + (k + 1), kind: 'primary', dur: 420 });
            }
            cap.set('Broadcast to every replica. The network reorders them.', 'info');
            const apply = (r, k) => { x[r] = OPS[k].f(x[r]); applied[r].push(k); };
            const arrive = (r, k) => {
              if (!inOrder) { apply(r, k); paint(r); return; }
              buf[r].push(k);
              buf[r].sort();
              while (buf[r].length && buf[r][0] === applied[r].length) apply(r, buf[r].shift());
              if (buf[r].length) cap.set(`Replica ${r + 1} has #${buf[r][0] + 1} but not #${applied[r].length + 1}: wait`, 'warn');
              paint(r);
            };
            await Promise.all(R.map((node, r) => Promise.all(OPS.map((o, k) =>
              st.send(cl, node, { label: '#' + (k + 1) + ' ' + o.lab, kind: 'data', dur: DUR[r][k] }).then(() => arrive(r, k))))));
            const same = x.every((y) => y === x[0]);
            R.forEach((n) => n.set({ kind: same ? 'good' : 'bad' }));
            if (same) cap.set(`All replicas: x = ${x[0]}. A crash-proof counter needs consensus.`, 'good');
            else cap.set(`Final x = ${x.join(', ')}. The replicas diverged!`, 'bad');
          }
          run();
        },
      },

      /* 11 ─────────────────────────────────────────────── */
      {
        title: 'Two-phase commit: all or nothing',
        caption: 'Participants vote, and a yes is a promise. The coordinator logs one final decision. If it crashes after the votes, yes-voters are stuck.',
        problem: 'Coordinator crash',
        fix: 'Wait for its log; timeouts can’t help',
        tags: ['2PC', 'XA', 'JTA'],
        demo(el, v) {
          const box = v.wrap(el);
          let stepper = null;
          const scen = v.segmented(box, {
            options: [
              { value: 'yes', label: 'All vote yes', kind: 'good' },
              { value: 'no', label: 'One votes no', kind: 'warn' },
              { value: 'crash', label: 'Coordinator crash', kind: 'bad' },
            ],
            value: 'yes',
            onChange: () => stepper && stepper.go(0),
          });
          const st = v.stage(box, { w: 560, h: 280 });
          const C0 = 'A transaction wrote rows on both databases. Rows are locked.';
          const C1 = 'Phase 1: the coordinator asks each database to prepare.';
          const CAPS = {
            yes: [C0, C1, 'Both vote yes: a promise to commit, whatever happens.', 'Coordinator writes COMMIT to its log: the point of no return.', 'Phase 2: commit goes to both databases.', 'Both commit, release locks and acknowledge.', 'All or nothing: one outcome on every node.'],
            no: [C0, C1, 'DB 2 votes no: a constraint check failed.', 'Coordinator writes ABORT to its log.', 'Phase 2: abort goes to both databases.', 'Both roll back, release locks and acknowledge.', 'Nothing happened anywhere. Still atomic.'],
            crash: [C0, C1, 'Both vote yes: a promise to commit, whatever happens.', 'Coordinator writes COMMIT to its log.', 'Commit reaches DB 2. Then the coordinator crashes!', 'DB 1 voted yes: it can’t commit or abort alone. In doubt.', 'Coordinator restarts, reads its log, re-sends commit. Resolved.'],
          };
          const KIND = {
            yes: ['info', 'info', 'info', 'primary', 'good', 'good', 'good'],
            no: ['info', 'info', 'warn', 'bad', 'warn', 'good', 'good'],
            crash: ['info', 'info', 'info', 'primary', 'bad', 'bad', 'good'],
          };
          function scene(i, s) {
            const S = {
              coord: { kind: 'primary', sub: 'tx 42', down: false },
              log: '—',
              phase: '',
              db: [{ kind: 'warn', sub: 'working' }, { kind: 'warn', sub: 'working' }],
              lock: [true, true],
              note: '',
            };
            if (i >= 1) { S.phase = 'PHASE 1 · PREPARE'; S.db.forEach((d) => { d.sub = 'prepare?'; }); }
            if (i >= 2) {
              S.db[0] = { kind: 'info', sub: 'promised', badge: 'yes' };
              S.db[1] = s === 'no' ? { kind: 'bad', sub: 'can’t commit', badge: 'no' } : { kind: 'info', sub: 'promised', badge: 'yes' };
            }
            if (i >= 3) { S.log = s === 'no' ? 'ABORT' : 'COMMIT'; S.coord.sub = 'decided'; }
            if (i >= 4) {
              S.phase = 'PHASE 2 · ' + (s === 'no' ? 'ABORT' : 'COMMIT');
              if (s === 'crash') {
                S.coord = { kind: 'bad', sub: 'crashed', down: true };
                S.db[1] = { kind: 'good', sub: 'committed', badge: 'yes' };
                S.lock[1] = false;
              } else {
                S.db.forEach((d) => { d.kind = s === 'no' ? 'neutral' : 'good'; d.sub = s === 'no' ? 'rolled back' : 'committed'; });
                S.lock = [false, false];
              }
            }
            if (i >= 5) {
              if (s === 'crash') {
                S.db[0] = { kind: 'bad', sub: 'IN DOUBT', badge: 'yes' };
                S.note = 'commit? abort? can only wait';
              } else S.coord.sub = 'all acked';
            }
            if (i >= 6) {
              if (s === 'crash') {
                S.coord = { kind: 'primary', sub: 'recovered', down: false };
                S.db[0] = { kind: 'good', sub: 'committed', badge: 'yes' };
                S.lock[0] = false;
                S.note = '';
              } else S.coord = { kind: 'good', sub: 'done', down: false };
            }
            return S;
          }
          let N = null;
          function draw(S) {
            st.clear();
            const coord = st.node({ x: 280, y: 62, w: 150, h: 52, label: 'Coordinator' });
            const log = st.node({ x: 470, y: 62, w: 110, h: 52, label: 'Log', shape: 'doc' });
            const dbs = [0, 1].map((k) => st.node({ x: k ? 440 : 120, y: 205, w: 130, h: 56, label: 'DB ' + (k + 1), shape: 'db' }));
            dbs.forEach((d) => st.link(coord, d, { thin: true, dashed: true, arrow: false }));
            st.link(coord, log, { thin: true });
            const phase = st.text(16, 20, '', { anchor: 'start', size: 13, kind: 'accent', bold: true });
            const locks = [0, 1].map((k) => st.text(k ? 440 : 120, 255, '', { size: 12, bold: true }));
            const note = st.text(150, 145, '', { size: 13, kind: 'bad', bold: true, halo: true });
            N = { coord, log, dbs, phase, locks, note };
            apply(S);
          }
          function apply(S) {
            N.coord.set({ kind: S.coord.kind, sub: S.coord.sub, down: !!S.coord.down });
            N.log.set({ sub: S.log, kind: S.log === 'COMMIT' ? 'good' : S.log === 'ABORT' ? 'bad' : 'neutral' });
            N.dbs.forEach((d, k) => d.set({ kind: S.db[k].kind, sub: S.db[k].sub, badge: S.db[k].badge || '', badgeKind: S.db[k].badge === 'no' ? 'bad' : 'good' }));
            N.phase.set(S.phase);
            N.locks.forEach((t, k) => t.set(S.lock[k] ? 'rows locked' : 'unlocked', S.lock[k] ? 'warn' : 'muted'));
            N.note.set(S.note);
          }
          async function anim(i, s) {
            const { coord, log, dbs } = N;
            const no = s === 'no';
            if (i === 1) await Promise.all(dbs.map((d) => st.send(coord, d, { label: 'prepare', kind: 'primary' })));
            if (i === 2) await Promise.all(dbs.map((d, k) => st.send(d, coord, { label: no && k === 1 ? 'no' : 'yes', kind: no && k === 1 ? 'bad' : 'good' })));
            if (i === 3) await st.send(coord, log, { label: no ? 'ABORT' : 'COMMIT', kind: no ? 'bad' : 'good', dur: 700 });
            if (i === 4) {
              if (s === 'crash') await st.send(coord, dbs[1], { label: 'commit', kind: 'good' });
              else await Promise.all(dbs.map((d) => st.send(coord, d, { label: no ? 'abort' : 'commit', kind: no ? 'bad' : 'good' })));
            }
            if (i === 5) {
              if (s === 'crash') await st.send(dbs[0], coord, { label: 'decision?', kind: 'warn', drop: true });
              else await Promise.all(dbs.map((d) => st.send(d, coord, { label: 'ok', kind: 'good' })));
            }
            if (i === 6) {
              if (s === 'crash') {
                await st.send(log, coord, { label: 'COMMIT', kind: 'good', dur: 700 });
                N.coord.set({ kind: 'primary', down: false, sub: 'recovering' });
                await st.send(coord, dbs[0], { label: 'commit', kind: 'good' });
              } else await v.sleep(300);
            }
          }
          stepper = v.stepper(box, {
            steps: [0, 1, 2, 3, 4, 5, 6].map((i) => ({
              get caption() { return CAPS[scen.get()][i]; },
              get kind() { return KIND[scen.get()][i]; },
            })),
            delay: 1900,
            render: async (i, animate) => {
              const s = scen.get();
              const go = animate && i > 0;
              draw(scene(go ? i - 1 : i, s));
              if (go) {
                await anim(i, s);
                apply(scene(i, s));
              }
            },
          });
        },
      },

      /* 12 ─────────────────────────────────────────────── */
      {
        title: 'In doubt means locked for everyone',
        caption: 'An in-doubt transaction keeps its locks until the coordinator returns, so other work queues up. Lose the coordinator’s log and it waits forever.',
        problem: 'Orphaned in-doubt transaction',
        fix: 'Recover the log (or a risky manual call)',
        tags: ['XA', 'JTA', 'PostgreSQL', 'ActiveMQ'],
        demo(el, v) {
          const box = v.wrap(el);
          const st = v.stage(box, { w: 560, h: 270 });
          st.box(10, 10, 200, 250, { label: 'APP SERVER', kind: 'primary' });
          const coord = st.node({ x: 110, y: 85, w: 150, label: 'Coordinator', sub: 'XA library', kind: 'primary' });
          const log = st.node({ x: 110, y: 190, w: 120, h: 52, label: 'Tx log', sub: 'local disk', shape: 'doc' });
          const pg = st.node({ x: 325, y: 75, w: 140, label: 'PostgreSQL', shape: 'db' });
          const mq = st.node({ x: 325, y: 200, w: 140, label: 'Msg broker', shape: 'db' });
          const adm = st.node({ x: 490, y: 138, w: 40, h: 40, shape: 'person', label: 'Admin' });
          st.link(coord, pg, { thin: true, dashed: true, arrow: false });
          st.link(coord, mq, { thin: true, dashed: true, arrow: false });
          st.link(coord, log, { thin: true });
          st.text(325, 252, 'two vendors, one XA transaction', { size: 12, kind: 'muted', bold: true });
          st.text(497, 22, 'waiting for row 42', { size: 12, kind: 'muted', bold: true });
          const more = st.text(497, 245, '', { size: 12, kind: 'bad', bold: true });
          const stats = v.row(box, { center: true });
          const sB = v.stat(stats, 'blocked transactions', '0', 'good');
          const sM = v.stat(stats, 'minutes in doubt', '0', 'good');
          const cap = v.caption(box, '');
          v.controls(box, [
            { label: 'Crash app server', icon: '✕', kind: 'danger', onClick: crash },
            { label: 'Restart, read log', icon: '↺', kind: 'good', onClick: recover },
            { label: 'Lose the log', icon: '✕', kind: 'danger', onClick: lose },
            { label: 'Admin decides', icon: '⚑', kind: 'ghost', onClick: admin },
          ]);
          let state = 'ok', logOk = true, blocked = 0, mins = 0;
          let q = [];
          const stuck = () => state === 'doubt' || state === 'orphan';
          function paint() {
            const doubt = stuck() || state === 'fixing';
            coord.set({ kind: stuck() ? 'bad' : 'primary', down: stuck(), sub: stuck() ? (logOk ? 'down' : 'down, no log') : 'XA library' });
            log.set({ kind: logOk ? 'neutral' : 'ghost', down: !logOk, sub: !logOk ? 'LOST' : state === 'ok' ? 'local disk' : 'COMMIT tx 42' });
            [pg, mq].forEach((n) => n.set({ kind: doubt ? 'bad' : 'good', sub: doubt ? 'tx 42 in doubt' : 'healthy', badge: doubt ? 'locked' : '', badgeKind: 'bad' }));
            q.forEach((r) => r.remove());
            q = [];
            for (let k = 0; k < Math.min(blocked, 5); k++) q.push(st.rect(452, 40 + k * 38, 90, 30, { kind: 'warn', label: 'tx ' + (43 + k), size: 12, mono: true }));
            more.set(blocked > 5 ? `+${blocked - 5} more` : '');
            sB.set(String(blocked), blocked ? 'bad' : 'good');
            sM.set(String(mins), mins ? 'warn' : 'good');
          }
          v.every(900, () => {
            if (!stuck()) return;
            mins += 5;
            blocked++;
            paint();
          });
          async function crash() {
            v.restart();
            st.clearPackets();
            if (state !== 'ok') { cap.set('Already stuck. Try restarting or the admin.', 'warn'); return; }
            logOk = true;
            blocked = 0;
            mins = 0;
            paint();
            cap.set('Tx 42 spans PostgreSQL and the broker. Prepare…', 'info');
            await Promise.all([pg, mq].map((n) => st.send(coord, n, { label: 'prepare' })));
            await Promise.all([pg, mq].map((n) => st.send(n, coord, { label: 'yes', kind: 'good' })));
            await st.send(coord, log, { label: 'COMMIT', kind: 'good', dur: 600 });
            state = 'doubt';
            paint();
            cap.set('App server dies. Both sides hold locks, in doubt.', 'bad');
          }
          async function recover() {
            v.restart();
            st.clearPackets();
            if (state === 'ok') { cap.set('Nothing is stuck. Crash the app server first.', 'info'); return; }
            if (!logOk) { cap.set('Restarted, but there is no log to read. Still stuck.', 'bad'); return; }
            state = 'fixing';
            paint();
            cap.set('Coordinator restarts and reads its log: COMMIT', 'info');
            await st.send(log, coord, { label: 'COMMIT', kind: 'good', dur: 600 });
            await Promise.all([pg, mq].map((n) => st.send(coord, n, { label: 'commit', kind: 'good' })));
            const was = mins;
            state = 'ok';
            blocked = 0;
            mins = 0;
            paint();
            cap.set(`Resolved after ${was} min. Locks released, queue drains.`, 'good');
          }
          function lose() {
            v.restart();
            st.clearPackets();
            logOk = false;
            state = 'orphan';
            paint();
            cap.set('Coordinator log is gone. Tx 42 is orphaned: no one can decide.', 'bad');
          }
          async function admin() {
            v.restart();
            st.clearPackets();
            if (state === 'ok') { cap.set('No stuck transactions right now.', 'info'); return; }
            state = 'fixing';
            paint();
            cap.set('An admin forces a heuristic commit on each side', 'warn');
            await Promise.all([pg, mq].map((n) => st.send(adm, n, { label: 'force', kind: 'warn' })));
            state = 'ok';
            logOk = true;
            blocked = 0;
            mins = 0;
            paint();
            cap.set('Unblocked, but it was a guess: atomicity may be broken.', 'warn');
          }
          paint();
          cap.set('Tx 42 spans two systems via XA. Try crashing the app server.', 'info');
        },
      },

      /* 13 ─────────────────────────────────────────────── */
      {
        title: 'Epochs and majorities stop split brain',
        lab: { id: 'leases', preset: 'fencing' },
        caption: 'A leader must win a majority vote for a new epoch, then a majority for each value. Any two majorities overlap, so stale leaders get caught.',
        problem: 'Two leaders',
        fix: 'Epoch numbers + quorums',
        tags: ['Raft', 'Paxos', 'Zab', 'VSR'],
        demo(el, v) {
          const box = v.wrap(el);
          const top = v.row(box);
          top.appendChild(v.h('span', { class: 'vz-muted' }, 'Act as'));
          let sel = 0, part = false, nodes = [], decided = [], nextVal = 1;
          const MAJ = 3;
          v.segmented(top, { options: [1, 2, 3, 4, 5].map((i) => ({ value: i - 1, label: 'N' + i })), value: 0, onChange: (i) => { sel = i; paint(); } });
          const partT = v.toggle(top, {
            label: 'Partition 1–2 | 3–5',
            value: false,
            onChange: (b) => {
              v.restart();
              st.clearPackets();
              part = b;
              paint();
              cap.set(b ? 'N1 and N2 are cut off from N3–N5' : 'Network healed', b ? 'warn' : 'info');
            },
          });
          const st = v.stage(box, { w: 560, h: 300 });
          const POS = [[105, 85], [105, 215], [300, 50], [450, 150], [300, 250]];
          const G = POS.map(([x, y], i) => st.node({ x, y, w: 96, h: 50, label: 'N' + (i + 1) }));
          const wall = st.line(200, 14, 200, 290, { kind: 'bad', dashed: true, width: 2.5 });
          const props = v.row(box, { center: true });
          const pc = ['Agreement', 'Integrity', 'Validity', 'Termination'].map((t) => { const c = v.cell(t + ' ✓', 'good'); props.appendChild(c); return c; });
          const dec = v.row(box, { center: true });
          dec.appendChild(v.h('span', { class: 'vz-muted' }, 'decided:'));
          const tape = v.tape(dec, []);
          const cap = v.caption(box, '');
          v.controls(box, [
            { label: 'Time out: elect', icon: '⚑', kind: 'primary', onClick: elect },
            { label: 'Propose value', icon: '＋', onClick: propose },
            { label: 'Crash / revive', icon: '✕', kind: 'danger', onClick: toggleUp },
            { label: 'Reset', icon: '↺', kind: 'ghost', onClick: reset },
          ]);
          const others = (c) => [0, 1, 2, 3, 4].filter((i) => i !== c);
          const reach = (a, b) => nodes[a].up && nodes[b].up && (!part || (a < 2) === (b < 2));

          function paint() {
            const maxE = Math.max(...nodes.map((n) => n.epoch));
            G.forEach((g, i) => {
              const n = nodes[i];
              const stale = n.leader && n.epoch < maxE;
              g.set({
                label: (i === sel ? '◉ ' : '') + 'N' + (i + 1),
                sub: n.up ? 'epoch ' + n.epoch : 'crashed',
                down: !n.up,
                kind: !n.up ? 'bad' : n.leader ? (stale ? 'warn' : 'primary') : 'neutral',
                badge: n.up && n.leader ? (stale ? 'old leader' : 'leader') : '',
                badgeKind: stale ? 'warn' : 'primary',
              });
            });
            wall.el.style.display = part ? '' : 'none';
            const groups = part ? [[0, 1], [2, 3, 4]] : [[0, 1, 2, 3, 4]];
            const live = Math.max(...groups.map((g) => g.filter((i) => nodes[i].up).length));
            pc[3].textContent = live >= MAJ ? 'Termination ✓' : 'Termination ⏸';
            pc[3].className = 'vz-cell ' + (live >= MAJ ? 'k-good' : 'k-warn');
            tape.set(decided.length ? decided.map((d) => ({ text: d, kind: 'good', sm: true })) : [{ text: 'nothing yet', kind: 'ghost', sm: true }]);
          }
          function reset() {
            v.restart();
            st.clearPackets();
            nodes = [0, 1, 2, 3, 4].map((i) => ({ up: true, epoch: 1, leader: i === 0, log: 0 }));
            part = false;
            partT.set(false);
            decided = [];
            nextVal = 1;
            paint();
            cap.set('N1 leads epoch 1. Pick a node, then act as it.', 'info');
          }
          async function elect() {
            v.restart();
            st.clearPackets();
            const c = sel, me = nodes[c];
            if (!me.up) { cap.set(`N${c + 1} is crashed. Revive it or pick another.`, 'warn'); return; }
            const e = me.epoch + 1;
            me.epoch = e;
            me.leader = false;
            paint();
            cap.set(`N${c + 1} suspects the leader. Votes for epoch ${e}?`, 'info');
            const res = await Promise.all(others(c).map(async (i) => {
              if (!reach(c, i)) { await st.send(G[c], G[i], { label: 'e' + e + '?', kind: 'info', drop: true, dur: 800 }); return { grant: false, epoch: 0 }; }
              await st.send(G[c], G[i], { label: 'e' + e + '?', kind: 'info', dur: 800 });
              const n = nodes[i];
              const newer = e > n.epoch;
              const grant = newer && me.log >= n.log;
              if (newer) { n.epoch = e; n.leader = false; }
              paint();
              await st.send(G[i], G[c], { label: grant ? 'yes' : 'no', kind: grant ? 'good' : 'bad', dur: 800 });
              return { grant, epoch: n.epoch, logNo: newer && !grant };
            }));
            const votes = 1 + res.filter((r) => r.grant).length;
            const hi = Math.max(e, ...res.map((r) => r.epoch));
            if (hi > me.epoch) me.epoch = hi;
            if (votes >= MAJ && me.epoch === e) {
              me.leader = true;
              paint();
              cap.set(`${votes}/5 votes: N${c + 1} leads epoch ${e}`, 'good');
            } else {
              paint();
              cap.set(`Only ${votes}/5 votes: no leader for epoch ${e}` + (res.some((r) => r.logNo) ? '. Voters have newer data.' : ''), 'bad');
            }
          }
          async function propose() {
            v.restart();
            st.clearPackets();
            const c = sel, me = nodes[c];
            if (!me.up) { cap.set(`N${c + 1} is crashed.`, 'warn'); return; }
            if (!me.leader) { cap.set(`N${c + 1} is not a leader. Only a leader proposes.`, 'warn'); return; }
            const e = me.epoch, val = 'v' + nextVal;
            cap.set(`N${c + 1} proposes ${val} in epoch ${e}`, 'info');
            const res = await Promise.all(others(c).map(async (i) => {
              if (!reach(c, i)) { await st.send(G[c], G[i], { label: val, kind: 'data', drop: true, dur: 800 }); return { ok: false, epoch: 0, i }; }
              await st.send(G[c], G[i], { label: val + ' e' + e, kind: 'data', dur: 800 });
              const n = nodes[i];
              if (n.epoch > e) {
                await st.send(G[i], G[c], { label: 'e' + n.epoch + '!', kind: 'bad', dur: 800 });
                return { ok: false, epoch: n.epoch, i };
              }
              n.epoch = e;
              await st.send(G[i], G[c], { label: 'ok', kind: 'good', dur: 800 });
              return { ok: true, epoch: e, i };
            }));
            const oks = res.filter((r) => r.ok);
            const hi = Math.max(0, ...res.map((r) => r.epoch));
            if (hi > e) {
              me.leader = false;
              me.epoch = hi;
              paint();
              cap.set(`Rejected: epoch ${hi} exists. N${c + 1} steps down.`, 'bad');
              return;
            }
            if (oks.length + 1 >= MAJ) {
              decided.push(val);
              nextVal++;
              me.log = decided.length;
              oks.forEach((r) => { nodes[r.i].log = decided.length; });
              paint();
              cap.set(`${oks.length + 1}/5 accepted: ${val} is decided for good`, 'good');
            } else {
              paint();
              cap.set(`Only ${oks.length + 1}/5 reached: ${val} can’t be decided`, 'warn');
            }
          }
          function toggleUp() {
            v.restart();
            st.clearPackets();
            const n = nodes[sel];
            n.up = !n.up;
            if (!n.up) n.leader = false;
            paint();
            cap.set(n.up ? `N${sel + 1} is back as a follower` : `N${sel + 1} crashed`, n.up ? 'info' : 'bad');
          }
          reset();
        },
      },

      /* 14 ─────────────────────────────────────────────── */
      {
        title: 'Consensus has a price',
        caption: 'Every decision waits for a majority vote, the voter set is fixed, and a jittery network can trap the cluster in endless elections.',
        problem: 'Slow, rigid, timeout-sensitive',
        fix: 'Use it only where agreement matters',
        tags: ['Raft', 'etcd', 'ZooKeeper'],
        demo(el, v) {
          const box = v.wrap(el);
          const SIZES = [3, 5, 7];
          let size = 5, down = 0, flaky = false, epoch = 1, leader = 0, writes = 0, elections = 0;
          const top = v.grid(box, 220);
          v.slider(top, { label: 'Cluster size', min: 0, max: 2, value: 1, format: (i) => SIZES[i] + ' nodes', onInput: (i) => { size = SIZES[i]; down = 0; leader = 0; build(); } });
          v.toggle(top, { label: 'Jittery network', value: false, onChange: (b) => { flaky = b; } });
          const st = v.stage(box, { w: 560, h: 170 });
          const stats = v.row(box, { center: true });
          const sMaj = v.stat(stats, 'majority', '', 'info');
          const sTol = v.stat(stats, 'can lose', '', 'good');
          const sEl = v.stat(stats, 'elections', '0', 'info');
          const sW = v.stat(stats, 'writes decided', '0', 'good');
          const cap = v.caption(box, '');
          v.controls(box, [
            { label: 'Crash a node', icon: '✕', kind: 'danger', onClick: crash },
            { label: 'Revive all', icon: '↺', onClick: () => { down = 0; build(); cap.set('All nodes back', 'info'); } },
          ]);
          let G = [];
          const maj = () => Math.floor(size / 2) + 1;
          const live = () => size - down;
          function build() {
            v.restart();
            st.clearPackets();
            st.clear();
            const dx = 520 / size;
            G = Array.from({ length: size }, (_, i) => st.node({ x: 20 + dx / 2 + i * dx, y: 70, w: Math.min(70, dx - 14), h: 52, label: 'N' + (i + 1) }));
            st.text(280, 138, `each write waits for ${maj()} of ${size} votes`, { size: 13, kind: 'text2', bold: true });
            if (leader < 0 || leader >= live()) leader = live() >= maj() ? 0 : -1;
            paint();
          }
          function paint() {
            G.forEach((g, i) => {
              const up = i < live();
              g.set({ kind: !up ? 'bad' : i === leader ? 'primary' : 'good', down: !up, sub: !up ? 'down' : i === leader ? 'leader' : 'e' + epoch });
            });
            sMaj.set(maj() + ' of ' + size, 'info');
            sTol.set((size - maj()) + ' nodes', 'good');
            sEl.set(String(elections), elections > 3 ? 'warn' : 'info');
            sW.set(String(writes), 'good');
          }
          function elect() {
            epoch++;
            elections++;
            leader = Math.floor(Math.random() * live());
            paint();
            G.slice(0, live()).forEach((g, i) => { if (i !== leader) st.send(G[leader], g, { label: 'e' + epoch, kind: 'warn', dur: 600 }); });
          }
          function crash() {
            if (live() === 0) return;
            down++;
            if (leader >= live()) leader = -1;
            if (live() < maj()) {
              leader = -1;
              paint();
              cap.set(`Only ${live()} of ${size} alive: no majority, nothing decided`, 'bad');
              return;
            }
            if (leader < 0) { elect(); cap.set(`Leader died. Election for epoch ${epoch}.`, 'warn'); } else { paint(); cap.set(`${live()} of ${size} alive: still a majority`, 'good'); }
          }
          v.every(1300, () => {
            if (live() < maj()) { cap.set(`Only ${live()} of ${size} alive: no majority, nothing decided`, 'bad'); return; }
            if (leader < 0 || (flaky && Math.random() < 0.65)) {
              elect();
              cap.set(`A timeout fired: election for epoch ${epoch}. No writes meanwhile.`, 'warn');
              return;
            }
            writes++;
            paint();
            cap.set(flaky ? 'A calm moment: one write decided' : `Write decided once ${maj()} of ${size} voted yes`, 'good');
            G.slice(0, live()).forEach((g, i) => { if (i !== leader) st.send(G[leader], g, { kind: 'data', dur: 500 }); });
          });
          build();
          cap.set('Healthy cluster: steady writes. Try jitter or crashes.', 'info');
        },
      },

      /* 15 ─────────────────────────────────────────────── */
      {
        title: 'Outsource coordination to ZooKeeper',
        caption: 'A small consensus cluster offers locks, fencing tokens, sessions with ephemeral nodes, and watches. Apps use it to elect leaders and assign work.',
        problem: 'Hand-rolled coordination',
        fix: 'ZooKeeper / etcd',
        tags: ['ZooKeeper', 'etcd', 'Consul', 'Kafka'],
        demo(el, v) {
          const box = v.wrap(el);
          const st = v.stage(box, { w: 560, h: 290 });
          st.box(10, 50, 190, 190, { label: 'ZOOKEEPER · 3 NODES', kind: 'primary' });
          const zk = [[60, 118], [150, 118], [105, 192]].map(([x, y], i) => st.node({ x, y, w: 64, h: 40, label: 'zk' + (i + 1), kind: 'good' }));
          st.link(zk[0], zk[1], { arrow: false, thin: true });
          st.link(zk[1], zk[2], { arrow: false, thin: true });
          st.link(zk[2], zk[0], { arrow: false, thin: true });
          const ZKP = { x: 200, y: 150 };
          const W = [45, 115, 185, 255].map((y, i) => st.node({ x: 450, y, w: 130, h: 50, label: 'W' + (i + 1) }));
          W.forEach((w) => st.link(w, ZKP, { thin: true, dashed: true, arrow: false }));
          const panel = v.grid(box, 240);
          const table = v.table(panel, { cols: ['znode', 'value'], rows: [] });
          const log = v.log(panel, { title: 'watch events', max: 4 });
          const cap = v.caption(box, '');
          v.controls(box, [
            { label: 'Crash a worker', icon: '✕', kind: 'danger', onClick: kill },
            { label: 'Add worker', icon: '＋', kind: 'good', onClick: add },
            { label: 'Reset', icon: '↺', kind: 'ghost', onClick: reset },
          ]);
          let alive, joined, members, leader, token, zxid, parts, missed, racing;
          function assign() {
            const ms = members.slice().sort();
            parts = [0, 1, 2, 3].map((p) => (ms.length ? ms[p % ms.length] : -1));
          }
          function paint() {
            W.forEach((w, i) => {
              w.show(joined[i]);
              if (!joined[i]) return;
              const mine = parts.map((o, p) => (o === i ? 'p' + p : null)).filter(Boolean).join(' ');
              const reg = members.includes(i);
              w.set({
                kind: !alive[i] ? 'bad' : i === leader ? 'primary' : 'good',
                down: !alive[i],
                sub: !alive[i] ? (reg ? 'silent…' : 'expired') : mine || 'idle',
                badge: i === leader ? 'leader #' + token : '',
                badgeKind: 'primary',
              });
            });
            table.update([
              ['/leader', leader >= 0 ? `W${leader + 1} (ephemeral)` : '— (empty)'],
              ['/members', members.slice().sort().map((m) => 'W' + (m + 1)).join(' ') || '—'],
              ['/assign', parts.map((o, p) => `p${p}→${o >= 0 ? 'W' + (o + 1) : '?'}`).join(' ')],
              ['fencing token', leader >= 0 ? String(token) : '—'],
              ['last zxid', String(zxid)],
            ]);
          }
          function reset() {
            v.restart();
            st.clearPackets();
            alive = [true, true, true, false];
            joined = [true, true, true, false];
            members = [0, 1, 2];
            leader = 0;
            zxid = 12;
            token = 12;
            missed = [0, 0, 0, 0];
            racing = false;
            assign();
            paint();
            log.clear();
            cap.set('W1 holds /leader. /members doubles as service discovery.', 'info');
          }
          async function race() {
            const cands = members.filter((m) => alive[m]);
            if (!cands.length || leader >= 0 || racing) return;
            racing = true;
            cap.set('Survivors race to create /leader. Only one can.', 'info');
            const durs = cands.map(() => 500 + Math.random() * 600);
            const first = cands[durs.indexOf(Math.min(...durs))];
            await Promise.all(cands.map((m, k) => st.send(W[m], ZKP, { label: 'create', kind: 'info', dur: durs[k] })));
            racing = false;
            if (leader >= 0 || !alive[first] || !members.includes(first)) return;
            zxid++;
            token = zxid;
            leader = first;
            paint();
            log.add(`W${first + 1} created /leader (token ${token})`, 'good');
            await Promise.all(cands.map((m) => st.send(ZKP, W[m], { label: m === first ? 'ok' : 'exists', kind: m === first ? 'good' : 'bad', dur: 600 })));
            cap.set(`W${first + 1} leads with fencing token ${token}. Work rebalanced.`, 'good');
          }
          async function expire(i) {
            members = members.filter((m) => m !== i);
            zxid++;
            const wasLeader = leader === i;
            if (wasLeader) leader = -1;
            assign();
            paint();
            log.add(`W${i + 1} session expired: ephemeral nodes gone`, 'bad');
            cap.set(`W${i + 1} missed its heartbeats. Its ephemeral nodes vanish.`, 'warn');
            const watchers = members.filter((m) => alive[m]);
            await Promise.all(watchers.map((m) => st.send(ZKP, W[m], { label: 'watch', kind: 'warn', dur: 700 })));
            if (watchers.length) log.add('Watches fire on ' + watchers.map((m) => 'W' + (m + 1)).join(', '), 'warn');
            if (wasLeader) await race();
          }
          function beat() {
            W.forEach((w, i) => {
              if (!joined[i] || !members.includes(i)) return;
              if (alive[i]) { missed[i] = 0; st.send(w, ZKP, { kind: 'good', dur: 450 }); } else if (++missed[i] === 3) expire(i);
            });
            if (leader < 0) race();
          }
          function kill() {
            const target = leader >= 0 && alive[leader] ? leader : [0, 1, 2, 3].find((i) => joined[i] && alive[i]);
            if (target == null) { cap.set('No live workers left. Reset to replay.', 'warn'); return; }
            alive[target] = false;
            paint();
            log.add(`W${target + 1} stopped sending heartbeats`, 'bad');
            cap.set(`W${target + 1} dies. ZooKeeper waits for its session to time out…`, 'bad');
          }
          function add() {
            if (joined[3]) { cap.set('This demo holds four workers. Reset to replay.', 'info'); return; }
            joined[3] = true;
            alive[3] = true;
            missed[3] = 0;
            members.push(3);
            zxid++;
            assign();
            paint();
            log.add('W4 registered /members/W4', 'good');
            cap.set('W4 joins. Watches fire and partitions rebalance.', 'good');
            members.filter((m) => alive[m] && m !== 3).forEach((m) => st.send(ZKP, W[m], { label: 'watch', kind: 'warn', dur: 700 }));
          }
          v.every(1000, beat);
          reset();
        },
      },
    ],

    cheatsheet: [
      { term: 'Eventual consistency', text: 'Replicas converge once writes stop. No promise about when.', kind: 'warn' },
      { term: 'Linearizability', text: 'Acts like one copy. Once a read sees a new value, all later reads do.', kind: 'primary' },
      { term: 'Compare-and-set', text: 'Set only if the value is still what you expect. Basis for locks.', kind: 'good' },
      { term: 'Cross-channel race', text: 'A second channel (queue, phone call) exposes stale reads.', kind: 'bad' },
      { term: 'CAP', text: 'During a partition: stay linearizable or stay available, not both.', kind: 'bad' },
      { term: 'Causal order', text: 'Partial order: cause before effect. Concurrent events are incomparable.', kind: 'info' },
      { term: 'Causal consistency', text: 'Strongest model that stays available and fast during network trouble.', kind: 'good' },
      { term: 'Lamport timestamp', text: '(counter, node). On receive: max(own, seen) + 1. Total, causal order.', kind: 'data' },
      { term: 'Total order broadcast', text: 'Every node gets every message in the same order: a shared log.', kind: 'primary' },
      { term: 'Two-phase commit', text: 'Prepare, vote, decide. A yes vote is a promise; the coordinator decides.', kind: 'warn' },
      { term: 'In doubt', text: 'Voted yes, coordinator gone: cannot commit or abort alone. Locks stay held.', kind: 'bad' },
      { term: 'Consensus', text: 'Agreement, integrity, validity, termination. Needs a live majority.', kind: 'good' },
      { term: 'Epoch', text: 'Term or ballot number. The leader with the higher epoch wins.', kind: 'info' },
      { term: 'ZooKeeper / etcd', text: 'Outsourced consensus: locks, fencing tokens, sessions, watches.', kind: 'primary' },
    ],

    quiz: [
      {
        q: 'Client A reads x = 1. Afterwards client B starts a read and gets x = 0. Is that linearizable?',
        options: ['Yes, reads may be stale', 'No, a later read went back in time', 'Only if B used another replica'],
        answer: 1,
        why: 'Once any read returns the new value, every read that starts later must return it too.',
      },
      {
        q: 'The link between datacenters breaks. The app needs linearizable writes. What do clients cut off from the leader see?',
        options: ['Errors or waiting: unavailable', 'Normal writes to their local copy', 'Automatic causal consistency'],
        answer: 0,
        why: 'Accepting local writes would break linearizability, so that side must refuse or wait.',
      },
      {
        q: 'A node’s Lamport counter is 2. It receives a message carrying 7. What timestamp does the receive get?',
        options: ['3', '8', '9'],
        answer: 1,
        why: 'max(2, 7) + 1 = 8, so the effect always sorts after its cause.',
      },
      {
        q: 'In 2PC both participants voted yes, then the coordinator crashed. What may a participant do?',
        options: ['Abort after a timeout', 'Commit on its own', 'Wait for the coordinator'],
        answer: 2,
        why: 'Its yes is a promise. Deciding alone could contradict what the others were told.',
      },
      {
        q: 'How many nodes can a 5-node consensus cluster lose and still make decisions?',
        options: ['1', '2', '3'],
        answer: 1,
        why: 'A majority (3 of 5) must stay reachable, so up to 2 may fail.',
      },
    ],
  });
})();
