/* Chapter 5 — Replication */
(function () {
  'use strict';

  /* ---------- local helpers ---------- */
  const range = (n) => Array.from({ length: n }, (_, i) => i);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
  const uniq = (arr) => arr.filter((x, i) => arr.indexOf(x) === i);
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  // A row of small log cells on a stage. set([{text, kind}]) fills from the left; the rest are empty ghosts.
  function logRow(st, x, y, slots, size = 22, gap = 4) {
    const cells = range(slots).map((i) => st.rect(x + i * (size + gap), y - size / 2, size, size, { kind: 'ghost', rx: 5, label: '', size: 12, mono: true }));
    return {
      cells,
      set(list) {
        cells.forEach((c, i) => {
          const it = list[i];
          c.set({ kind: it ? it.kind || 'data' : 'ghost', label: it ? String(it.text) : '' });
        });
      },
    };
  }

  DDIA.chapter({
    id: 5,
    part: 2,
    title: 'Replication',
    short: 'Replication',
    tagline: 'Same data, many machines, many surprises',
    cards: [
      /* 1 ─────────────────────────────────────────────── */
      {
        title: 'One leader takes writes, followers copy',
        caption: 'Every write goes to the leader, which appends it to its replication log and streams that log to followers. Any replica can serve reads.',
        tags: ['PostgreSQL', 'MySQL', 'MongoDB', 'Kafka'],
        demo(el, v) {
          const box = v.wrap(el);
          const st = v.stage(box, { w: 560, h: 290 });
          const client = st.node({ x: 50, y: 110, w: 56, h: 56, shape: 'person', label: 'Client', kind: 'info' });
          const nodes = [
            st.node({ x: 205, y: 110, label: 'Leader', sub: 'reads + writes', kind: 'primary', shape: 'db' }),
            st.node({ x: 440, y: 60, label: 'Follower 1', sub: 'read-only', shape: 'db' }),
            st.node({ x: 440, y: 205, label: 'Follower 2', sub: 'read-only', shape: 'db' }),
          ];
          st.link(client, nodes[0]);
          st.link(nodes[0], nodes[1], { dashed: true, label: 'log' });
          st.link(nodes[0], nodes[2], { dashed: true, label: 'log' });
          const SLOTS = 6;
          const rows = nodes.map((nd) => logRow(st, nd.x - 95, nd.y + 42, SLOTS));
          st.text(nodes[0].x - 20, 180, 'replication log', { size: 12, kind: 'muted' });
          const cap = v.caption(box, '');
          v.controls(box, [
            { label: 'Write', icon: '✎', kind: 'primary', onClick: write },
            { label: 'Read anywhere', icon: '◉', onClick: read },
            { label: 'Write to a follower', icon: '✕', kind: 'danger', onClick: badWrite },
            { label: 'Reset', icon: '↺', kind: 'ghost', onClick: reset },
          ]);
          let seq = 0;
          let pos = [0, 0, 0];

          function paint() {
            const start = Math.max(1, pos[0] - SLOTS + 1);
            nodes.forEach((nd, i) => {
              const list = [];
              for (let k = start; k < start + SLOTS; k++) if (k <= pos[i]) list.push({ text: k, kind: i === 0 ? 'primary' : 'data' });
              rows[i].set(list);
              nd.set({ badge: pos[i] ? 'x=' + pos[i] : '' });
            });
          }
          async function write() {
            const n = ++seq;
            cap.set('Writes always go to the leader', 'info');
            await st.send(client, nodes[0], { label: 'x=' + n, kind: 'data' });
            pos[0] = Math.max(pos[0], n);
            paint();
            cap.set(`Leader appends #${n} to its log and streams it out`, 'primary');
            await Promise.all([1, 2].map((i) => v.sleep((i - 1) * 350)
              .then(() => st.send(nodes[0], nodes[i], { label: '#' + n, kind: 'data', dur: 800 + (i - 1) * 700 }))
              .then(() => { pos[i] = Math.max(pos[i], n); paint(); })));
            if (pos[1] === pos[0] && pos[2] === pos[0]) cap.set('Every replica now has the same log', 'good');
          }
          async function read() {
            const i = Math.floor(Math.random() * 3);
            const nd = nodes[i];
            cap.set(`This read is routed to ${nd.o.label}`, 'info');
            await st.send(client, nd, { label: 'get x', kind: 'info', curve: i === 2 ? 90 : 0 });
            const val = pos[i];
            const fresh = pos[i] >= pos[0];
            await st.send(nd, client, { label: val ? 'x=' + val : 'empty', kind: fresh ? 'good' : 'warn', curve: i === 2 ? -90 : 0 });
            cap.set(fresh ? `${nd.o.label} had the latest value` : `${nd.o.label} is behind: a stale answer`, fresh ? 'good' : 'warn');
          }
          async function badWrite() {
            cap.set('A client tries to write to a follower…', 'warn');
            await st.send(client, nodes[2], { label: 'x=99', kind: 'bad', drop: 0.85, curve: 90 });
            cap.set('Rejected: followers only take changes from the leader', 'bad');
          }
          function reset() {
            v.restart();
            st.clearPackets();
            seq = 0;
            pos = [0, 0, 0];
            paint();
            cap.set('Empty logs. Write something, then read it back.', 'info');
          }
          paint();
          write();
        },
      },

      /* 2 ─────────────────────────────────────────────── */
      {
        title: 'Wait for followers, or reply at once?',
        caption: 'Synchronous replication waits for follower acks: durable, slow, and one dead follower blocks writes. Asynchronous is fast but can lose confirmed writes.',
        problem: 'Leader dies right after OK',
        fix: 'Semi-sync: one synchronous follower',
        tags: ['PostgreSQL', 'MySQL semi-sync'],
        demo(el, v) {
          const box = v.wrap(el);
          const top = v.row(box);
          const mode = v.segmented(top, {
            options: [{ value: 'async', label: 'Asynchronous' }, { value: 'sync', label: 'Synchronous' }, { value: 'semi', label: 'Semi-sync' }],
            value: 'async',
            onChange: () => run(false),
          });
          const off = v.toggle(top, { label: 'Follower 2 offline', value: false, onChange: () => run(false) });
          const st = v.stage(box, { w: 560, h: 250 });
          const client = st.node({ x: 50, y: 125, w: 56, h: 56, shape: 'person', label: 'Client', kind: 'info' });
          const L = st.node({ x: 210, y: 125, label: 'Leader', kind: 'primary', shape: 'db' });
          const F = [
            st.node({ x: 440, y: 55, label: 'Follower 1', sub: 'near · 10 ms', shape: 'db' }),
            st.node({ x: 440, y: 195, label: 'Follower 2', sub: 'far · 180 ms', shape: 'db' }),
          ];
          st.link(client, L, { both: true });
          const links = F.map((f) => st.link(L, f, { dashed: true, label: 'async' }));
          const stats = v.row(box, { center: true });
          const sWait = v.stat(stats, 'client waits', '—', 'info');
          const sCopies = v.stat(stats, 'follower copies at OK', '—', 'info');
          const cap = v.caption(box, '');
          v.controls(box, [
            { label: 'Write', icon: '▶', kind: 'primary', onClick: () => run(false) },
            { label: 'Write, then leader dies', icon: '✕', kind: 'danger', onClick: () => run(true) },
          ]);
          const DUR = [600, 1400];
          const WAIT = { async: '≈1 ms', semi: '≈10 ms', sync: '≈180 ms' };

          async function run(crash) {
            v.restart();
            st.clearPackets();
            const m = mode.get();
            const down = off.get();
            const syncIdx = m === 'sync' ? [0, 1] : m === 'semi' ? [0] : [];
            links.forEach((l, i) => l.set({ label: syncIdx.includes(i) ? 'sync' : 'async', kind: syncIdx.includes(i) ? 'primary' : 'muted' }));
            L.set({ kind: 'primary', down: false, sub: '', badge: '' });
            F[0].set({ kind: 'neutral', badge: '' });
            F[1].set({ kind: down ? 'ghost' : 'neutral', down, badge: '' });
            sWait.set('…', 'info');
            sCopies.set('…', 'info');
            const has = [false, false];
            const ship = (i) => st.send(L, F[i], { label: 'data', kind: 'data', dur: DUR[i], drop: i === 1 && down ? 0.75 : false })
              .then((r) => {
                if (r === 'dropped') return false;
                has[i] = true;
                F[i].set({ badge: '✓', kind: 'good' });
                return true;
              });
            cap.set('Client sends a write to the leader', 'info');
            await st.send(client, L, { label: 'write', kind: 'data' });
            L.set({ badge: '✓' });
            if (syncIdx.length) {
              cap.set(syncIdx.length === 2 ? 'Leader waits for every follower to confirm' : 'Leader waits for Follower 1 only', 'warn');
              await Promise.all(syncIdx.map((i) => ship(i).then((ok) => {
                if (!ok) {
                  sWait.set('∞', 'bad');
                  cap.set('Follower 2 is offline: the leader waits forever. Writes blocked.', 'bad');
                  return new Promise(() => {});
                }
                return st.send(F[i], L, { label: 'ack', kind: 'good', dur: DUR[i] });
              })));
            }
            const copies = has.filter(Boolean).length;
            sWait.set(WAIT[m], m === 'sync' ? 'warn' : 'good');
            sCopies.set(String(copies), copies ? 'good' : 'bad');
            const ok = st.send(L, client, { label: 'OK', kind: 'good' });
            if (crash) {
              L.set({ kind: 'bad', down: true, sub: 'crashed', badge: '' });
              await ok;
              cap.set(copies ? `Leader died after OK. ${copies === 2 ? 'Both followers have' : 'Follower 1 has'} the write: safe.`
                : 'Leader died after OK. The write lived only there: lost!', copies ? 'good' : 'bad');
              return;
            }
            await ok;
            cap.set(m === 'async' ? 'Instant OK. Followers get the write afterwards.'
              : m === 'semi' ? 'OK once Follower 1 has it. Follower 2 catches up later.'
                : 'OK only after both confirm. The slowest one sets the pace.', m === 'sync' ? 'warn' : 'good');
            const later = [0, 1].filter((i) => !syncIdx.includes(i));
            if (!later.length) return;
            await v.sleep(500);
            const res = await Promise.all(later.map(ship));
            cap.set(res.every(Boolean) ? 'All replicas have the write now.' : 'Follower 2 missed it. It catches up when back.', res.every(Boolean) ? 'good' : 'warn');
          }
          run(false);
        },
      },

      /* 3 ─────────────────────────────────────────────── */
      {
        title: 'New follower: snapshot, then catch up',
        caption: 'Copy a consistent snapshot tagged with its exact log position, then replay every change after it. A restarted follower resumes the same way.',
        fix: 'Snapshot + log position',
        tags: ['PostgreSQL LSN', 'MySQL binlog'],
        demo(el, v) {
          const box = v.wrap(el);
          const st = v.stage(box, { w: 560, h: 260 });
          const X0 = 150, SZ = 28, GAP = 4, N = 11, LY = 70, FY = 200;
          const cx = (k) => X0 + (k - 1) * (SZ + GAP) + SZ / 2;
          let L, F, lRow, fRow;
          function base(fKind, fLabel, fSub) {
            st.clear();
            L = st.node({ x: 70, y: LY, w: 104, label: 'Leader', kind: 'primary', shape: 'db' });
            F = st.node({ x: 70, y: FY, w: 104, label: fLabel, sub: fSub, kind: fKind, shape: 'db' });
            st.link(L, F, { dashed: true, arrow: false });
            st.text(X0, LY - 28, 'leader log', { size: 12, anchor: 'start', kind: 'muted' });
            st.text(X0, FY - 28, 'follower log', { size: 12, anchor: 'start', kind: 'muted' });
            lRow = range(N).map((i) => st.rect(X0 + i * (SZ + GAP), LY - SZ / 2, SZ, SZ, { kind: 'ghost', rx: 5, label: '', size: 12, mono: true }));
            fRow = range(N).map((i) => st.rect(X0 + i * (SZ + GAP), FY - SZ / 2, SZ, SZ, { kind: 'ghost', rx: 5, label: '', size: 12, mono: true }));
          }
          const fill = (row, from, to, kind) => { for (let k = from; k <= to; k++) row[k - 1].set({ kind, label: String(k) }); };
          const clearCells = (row, from, to) => { for (let k = from; k <= to; k++) row[k - 1].set({ kind: 'ghost', label: '' }); };
          const snapshot = (y) => st.node({ x: cx(3), y, w: 150, h: 44, label: 'Snapshot', sub: 'at log position 5', kind: 'primary', shape: 'doc' });
          const FOL = [
            ['ghost', 'New node', 'empty'], ['bad', 'New node', 'torn copy'], ['ghost', 'New node', 'empty'], ['warn', 'New node', 'restoring'],
            ['warn', 'New node', 'catching up'], ['good', 'Follower', 'caught up'], ['good', 'Follower', 'caught up'],
          ];
          const LPOS = [5, 5, 5, 8, 8, 9, 11];

          async function render(i, animate) {
            base(...FOL[i]);
            fill(lRow, 1, LPOS[i], 'primary');
            if (i === 1) {
              if (animate) await st.send(L, F, { label: 'raw files', kind: 'bad' });
              fill(fRow, 1, 2, 'good');
              fRow[2].set({ kind: 'bad', label: '?' });
              fRow[3].set({ kind: 'bad', label: '?' });
              fRow[4].set({ kind: 'bad', label: '5' });
            } else if (i === 2) {
              st.box(X0 - 5, LY - SZ / 2 - 5, 5 * (SZ + GAP) + 6, SZ + 10, { kind: 'primary', solid: true, rx: 8 });
              const snap = snapshot(127);
              if (animate) { snap.moveTo(cx(3), LY + 30, false); await snap.moveTo(cx(3), 127, true, 600); }
            } else if (i === 3) {
              fill(lRow, 6, 8, 'warn');
              if (animate) {
                const snap = snapshot(127);
                clearCells(lRow, 6, 8);
                const move = snap.moveTo(cx(3), FY, true, 1200);
                for (let k = 6; k <= 8; k++) { await v.sleep(350); lRow[k - 1].set({ kind: 'warn', label: String(k) }); }
                await move;
                snap.remove();
              }
              fill(fRow, 1, 5, 'good');
            } else if (i === 4) {
              fill(lRow, 6, 8, 'warn');
              fill(fRow, 1, 5, 'good');
              if (animate) {
                await st.send(F, L, { label: 'after #5?', kind: 'info' });
                for (let k = 6; k <= 8; k++) {
                  await st.send(L, F, { label: '#' + k, kind: 'data', dur: 600 });
                  fRow[k - 1].set({ kind: 'data', label: String(k) });
                }
              }
              fill(fRow, 6, 8, 'data');
            } else if (i === 5) {
              fill(fRow, 1, 8, 'good');
              if (animate) {
                clearCells(lRow, 9, 9);
                await v.sleep(300);
                lRow[8].set({ kind: 'primary', label: '9' });
                await st.send(L, F, { label: '#9', kind: 'data', dur: 700 });
              }
              fill(fRow, 9, 9, 'good');
            } else if (i === 6) {
              fill(fRow, 1, 9, 'good');
              if (animate) {
                F.set({ kind: 'bad', down: true, sub: 'crashed at #9' });
                clearCells(lRow, 10, 11);
                for (let k = 10; k <= 11; k++) { await v.sleep(450); lRow[k - 1].set({ kind: 'primary', label: String(k) }); }
                await v.sleep(500);
                F.set({ kind: 'warn', down: false, sub: 'restarted' });
                await st.send(F, L, { label: 'after #9?', kind: 'info' });
                for (let k = 10; k <= 11; k++) {
                  await st.send(L, F, { label: '#' + k, kind: 'data', dur: 600 });
                  fRow[k - 1].set({ kind: 'good', label: String(k) });
                }
                F.set({ kind: 'good', sub: 'caught up' });
              }
              fill(fRow, 10, 11, 'good');
            }
          }
          v.stepper(box, {
            steps: [
              { caption: 'The leader is live: writes 1 to 5 are in its log.', kind: 'info' },
              { caption: 'Plain file copy during writes? Parts from different moments: corrupt.', kind: 'bad' },
              { caption: 'Take a consistent snapshot, tagged with its log position: 5.', kind: 'primary' },
              { caption: 'Copy the snapshot over. Meanwhile, writes 6 to 8 arrive.', kind: 'warn' },
              { caption: 'The follower asks for everything after position 5.', kind: 'info' },
              { caption: 'Caught up. Now it streams changes like any follower.', kind: 'good' },
              { caption: 'After a crash it resumes from its last position, 9.', kind: 'warn' },
            ],
            render,
            delay: 2200,
          });
        },
      },

      /* 4 ─────────────────────────────────────────────── */
      {
        title: 'Leader dies. Who takes over?',
        lab: { id: 'consensus', preset: 'crash' },
        caption: 'Followers detect silence by timeout and promote the most up-to-date one. Too short a timeout fails over needlessly; an old leader returning causes split brain.',
        problem: 'Split brain, lost writes',
        fix: 'Epoch numbers fence the old leader',
        tags: ['Patroni', 'MySQL MHA', 'Raft terms'],
        demo(el, v) {
          const box = v.wrap(el);
          const top = v.grid(box, 240);
          let timeout = 4;
          v.slider(top, { label: 'Timeout', min: 2, max: 12, value: 4, format: (x) => x + ' s', onInput: (x) => { timeout = x; } });
          const fence = v.segmented(top, {
            options: [{ value: 'none', label: 'No fencing', kind: 'bad' }, { value: 'epoch', label: 'Epoch fencing', kind: 'good' }],
            value: 'none',
            onChange: () => scenario(lastKind),
          });
          const st = v.stage(box, { w: 560, h: 290 });
          const stats = v.row(box, { center: true });
          const sDown = v.stat(stats, 'writes stalled', '0 s', 'info');
          const sLead = v.stat(stats, 'leaders', '1', 'good');
          const sLost = v.stat(stats, 'lost writes', '0', 'good');
          const cap = v.caption(box, '');
          v.controls(box, [
            { label: 'Leader crashes', icon: '✕', kind: 'danger', onClick: () => scenario('crash') },
            { label: 'Leader pauses 6 s', icon: '⏸', onClick: () => scenario('pause') },
          ]);
          const SEC = 260;
          const MW = 130;
          let N, apps, links, meterFill, meterText, S = null, lastKind = 'crash';

          function build() {
            st.clear();
            N = {
              A: st.node({ x: 115, y: 150, w: 124, label: 'Node A', sub: 'leader · e1', kind: 'primary', shape: 'db', badge: '#6' }),
              B: st.node({ x: 300, y: 60, w: 124, label: 'Node B', sub: 'follower', shape: 'db', badge: '#5' }),
              C: st.node({ x: 300, y: 240, w: 124, label: 'Node C', sub: 'follower', shape: 'db', badge: '#4' }),
            };
            apps = [
              st.node({ x: 492, y: 90, w: 50, h: 50, shape: 'person', label: 'App 1', kind: 'info' }),
              st.node({ x: 492, y: 215, w: 50, h: 50, shape: 'person', label: 'App 2', kind: 'info' }),
            ];
            links = {
              AB: st.link(N.A, N.B, { dashed: true }),
              AC: st.link(N.A, N.C, { dashed: true }),
              BC: st.link(N.B, N.C, { dashed: true, kind: 'primary' }),
              BA: st.link(N.B, N.A, { dashed: true, kind: 'primary' }),
              app1: st.link(apps[0], N.A, { thin: true }),
              app2: st.link(apps[1], N.A, { thin: true }),
            };
            links.BC.show(false);
            links.BA.show(false);
            st.rect(40, 42, MW, 14, { kind: 'ghost', rx: 7 });
            meterFill = st.rect(40, 42, 0.1, 14, { kind: 'warn', rx: 7 });
            meterText = st.text(105, 26, '', { size: 12, mono: true, kind: 'muted' });
            setMeter(0);
          }
          function setMeter(s, T = timeout) {
            meterFill.set({ w: Math.max(0.1, MW * Math.min(1, s / T)) });
            meterText.set(`silence ${s.toFixed(1)} s / ${T} s`);
          }
          function relink(key, from, to) {
            links[key].remove();
            links[key] = st.link(from, to, { thin: true, kind: 'primary' });
          }
          v.every(1000, () => {
            if (!S || !S.hb) return;
            S.followers().forEach((f) => st.send(N[S.leader], f, { kind: 'good', dur: 500, flash: false }));
          });

          async function scenario(kind) {
            lastKind = kind;
            v.restart();
            st.clearPackets();
            build();
            const fenced = fence.get() === 'epoch';
            const T = timeout;
            S = { leader: 'A', hb: true, followers: () => [N.B, N.C] };
            sDown.set('0 s', 'info');
            sLead.set('1', 'good');
            sLost.set('0', 'good');
            cap.set("Leader A sends heartbeats. Its write #6 hasn't been copied yet.", 'info');
            await v.sleep(1600);
            S.hb = false;
            if (kind === 'crash') {
              N.A.set({ kind: 'bad', down: true, sub: 'crashed' });
              cap.set('Leader A crashes. Heartbeats stop.', 'bad');
            } else {
              N.A.set({ kind: 'warn', sub: 'frozen' });
              cap.set('Leader A freezes for 6 s: a long GC pause.', 'warn');
            }
            const until = kind === 'pause' ? Math.min(T, 6) : T;
            await v.tween(until * SEC, (t) => setMeter(t * until, T), (t) => t);
            if (kind === 'pause' && T > 6) {
              N.A.set({ kind: 'primary', sub: 'leader · e1' });
              S.hb = true;
              sDown.set('6 s', 'warn');
              cap.set('A wakes before the timeout. No failover, just a 6 s stall.', 'warn');
              return;
            }
            meterFill.set({ kind: 'bad' });
            cap.set(`No heartbeat for ${T} s: A is declared dead.`, 'bad');
            await v.sleep(800);
            cap.set('B has the most data (#5). Elected: epoch 2.', 'primary');
            await st.send(N.C, N.B, { label: 'vote B', kind: 'info', dur: 700 });
            N.B.set({ kind: 'primary', sub: 'leader · e2' });
            links.AB.show(false);
            links.AC.show(false);
            links.BC.show(true);
            S = { leader: 'B', hb: true, followers: () => [N.C] };
            await st.send(N.B, N.C, { label: '#5', kind: 'data', dur: 700 });
            N.C.set({ badge: '#5' });
            relink('app1', apps[0], N.B);
            sDown.set(T + 1 + ' s', T >= 8 ? 'bad' : 'warn');
            cap.set('Clients are pointed at B. App 2 misses the memo.', 'info');
            await v.sleep(1200);
            if (kind === 'crash') N.A.set({ kind: 'primary', down: false, sub: 'leader · e1' });
            else N.A.set({ kind: 'primary', sub: 'leader · e1' });
            cap.set(kind === 'crash' ? 'A reboots, still sure it is the leader.' : 'A wakes up, unaware it was replaced.', 'warn');
            await v.sleep(900);
            await Promise.all([
              st.send(apps[1], N.A, { label: 'x=9', kind: 'data' }),
              st.send(apps[0], N.B, { label: 'x=7', kind: 'data' }),
            ]);
            N.B.set({ badge: '#6' });
            if (!fenced) {
              N.A.set({ badge: '#7' });
              await Promise.all([
                st.send(N.A, apps[1], { label: 'OK', kind: 'good' }),
                st.send(N.B, apps[0], { label: 'OK', kind: 'good' }),
              ]);
              N.A.set({ kind: 'bad', sub: 'leader?! · e1' });
              N.B.set({ kind: 'bad', sub: 'leader · e2' });
              sLead.set('2', 'bad');
              sLost.set('?', 'bad');
              cap.set('Split brain: two leaders accept conflicting writes.', 'bad');
              return;
            }
            cap.set('A must replicate x=9 first. It tags it epoch 1.', 'warn');
            await Promise.all([st.send(N.A, N.B, { label: 'e1 x=9', kind: 'warn' }), st.send(N.A, N.C, { label: 'e1 x=9', kind: 'warn' })]);
            await Promise.all([st.send(N.B, N.A, { label: 'e2 > e1', kind: 'bad' }), st.send(N.C, N.A, { label: 'e2 > e1', kind: 'bad' })]);
            N.A.set({ kind: 'neutral', sub: 'follower · e2', badge: '#5' });
            links.BA.show(true);
            S = { leader: 'B', hb: true, followers: () => [N.C, N.A] };
            sLost.set('1', 'warn');
            cap.set('Rejected. A steps down and drops its unreplicated #6.', 'good');
            await st.send(N.A, apps[1], { label: 'retry at B', kind: 'bad' });
            relink('app2', apps[1], N.B);
            await st.send(apps[1], N.B, { label: 'x=9', kind: 'data' });
            N.B.set({ badge: '#7' });
            await Promise.all([st.send(N.B, N.A, { label: 'new #6, #7', kind: 'data' }), st.send(N.B, N.C, { label: 'new #6, #7', kind: 'data' })]);
            N.A.set({ badge: '#7' });
            N.C.set({ badge: '#7' });
            cap.set('One leader again. The price: the old write #6 is gone.', 'good');
          }
          build();
          S = { leader: 'A', hb: true, followers: () => [N.B, N.C] };
          cap.set('Pick a failure. Then try a short and a long timeout.', 'info');
        },
      },

      /* 5 ─────────────────────────────────────────────── */
      {
        title: 'What exactly does the leader send?',
        caption: 'Ship SQL statements, raw storage bytes or logical row changes, or run your own trigger code. Each trades determinism, portability and overhead.',
        problem: 'NOW() and RAND() differ per replica',
        fix: 'Logical row-based log',
        tags: ['MySQL binlog', 'PostgreSQL WAL', 'VoltDB', 'Bucardo'],
        demo(el, v) {
          const box = v.wrap(el);
          const top = v.row(box);
          const mode = v.segmented(top, {
            options: [{ value: 'stmt', label: 'Statements' }, { value: 'wal', label: 'WAL bytes' }, { value: 'row', label: 'Logical rows' }, { value: 'trig', label: 'Triggers' }],
            value: 'stmt',
            onChange: run,
          });
          const upg = v.toggle(top, { label: 'Followers on newer version', value: false, onChange: run });
          const st = v.stage(box, { w: 560, h: 250 });
          const cap = v.caption(box, '');
          v.controls(box, [{ label: 'Replicate a write', icon: '▶', kind: 'primary', onClick: run }]);
          const ROWS = {
            stmt: ['Statements', { text: '✕ NOW(), RAND()', kind: 'bad' }, { text: '✓', kind: 'good' }, 'low'],
            wal: ['WAL bytes', { text: '✓', kind: 'good' }, { text: '✕ same format', kind: 'bad' }, 'low'],
            row: ['Logical rows', { text: '✓', kind: 'good' }, { text: '✓', kind: 'good' }, 'low'],
            trig: ['Triggers', { text: '✓', kind: 'good' }, { text: '✓', kind: 'good' }, { text: 'high', kind: 'warn' }],
          };
          const table = v.table(box, { cols: ['Method', 'Same result', 'Mixed versions', 'Overhead'], rows: [] });
          const clock = (s) => '10:00:0' + s;
          const rnd = (not) => { let r; do { r = 10 + Math.floor(Math.random() * 90); } while (r === not); return r; };

          async function run() {
            v.restart();
            st.clearPackets();
            st.clear();
            const m = mode.get();
            const newer = upg.get();
            table.update(Object.keys(ROWS).map((k) => ({ cells: ROWS[k], dim: k !== m })));
            const r0 = rnd(-1);
            const row0 = `t=${clock(1)} r=${r0}`;
            if (m === 'trig') {
              const L = st.node({ x: 90, y: 70, w: 110, label: 'Leader', kind: 'primary', shape: 'db' });
              const lt = st.text(90, 112, '', { size: 12.5, mono: true, kind: 'text2' });
              const chg = st.node({ x: 285, y: 70, w: 130, label: 'Changes', sub: 'table', kind: 'data', shape: 'doc' });
              const app = st.node({ x: 285, y: 190, w: 130, label: 'Sync app', sub: 'your code' });
              const other = st.node({ x: 475, y: 190, w: 120, label: 'Other DB', sub: 'any kind', shape: 'db' });
              const ot = st.text(475, 232, '', { size: 12.5, mono: true, kind: 'text2' });
              st.link(L, chg, { label: 'trigger' });
              st.link(chg, app, { label: 'poll' });
              st.link(app, other, { label: 'subset' });
              cap.set('Leader runs the insert. A trigger fires inside the same transaction.', 'info');
              await v.sleep(500);
              lt.set(row0, 'text');
              await st.send(L, chg, { label: 'row', kind: 'data' });
              chg.set({ sub: '1 new row' });
              cap.set('An external app reads the change table…', 'info');
              await st.send(chg, app, { label: 'read', kind: 'info' });
              cap.set('…filters or reshapes it, and writes anywhere.', 'info');
              await st.send(app, other, { label: 'custom', kind: 'data' });
              ot.set(`r=${r0}`, 'good');
              other.set({ kind: 'good' });
              cap.set('Flexible, but extra writes and your own code: slower, buggier.', 'warn');
              return;
            }
            const L = st.node({ x: 95, y: 125, label: 'Leader', sub: 'v1', kind: 'primary', shape: 'db' });
            const lt = st.text(95, 166, '', { size: 12.5, mono: true, kind: 'text2' });
            const F = [
              st.node({ x: 450, y: 55, label: 'Follower 1', sub: newer ? 'v2' : 'v1', shape: 'db' }),
              st.node({ x: 450, y: 190, label: 'Follower 2', sub: newer ? 'v2' : 'v1', shape: 'db' }),
            ];
            const ft = [st.text(450, 96, '', { size: 12.5, mono: true, kind: 'text2' }), st.text(450, 231, '', { size: 12.5, mono: true, kind: 'text2' })];
            F.forEach((f) => st.link(L, f, { dashed: true }));
            cap.set('Leader runs: INSERT … VALUES (NOW(), RAND())', 'info');
            await v.sleep(600);
            lt.set(row0, 'text');
            const label = m === 'stmt' ? 'NOW(), RAND()' : m === 'wal' ? 'blk 7: 3F A0 91' : `row(${r0})`;
            await Promise.all(F.map((f, i) => v.sleep(i * 400).then(() => st.send(L, f, { label, kind: m === 'stmt' ? 'warn' : 'data', dur: 1100 })).then(() => {
              if (m === 'stmt') { ft[i].set(`t=${clock(2 + i)} r=${rnd(r0)}`, 'bad'); f.set({ kind: 'bad' }); }
              else if (m === 'wal' && newer) { ft[i].set('✕ unknown format', 'bad'); f.set({ kind: 'bad' }); }
              else { ft[i].set(row0, 'good'); f.set({ kind: 'good' }); }
            })));
            if (m === 'stmt') cap.set('Each follower re-runs it: new time, new random number. Diverged.', 'bad');
            else if (m === 'wal') {
              cap.set(newer ? 'WAL is raw disk bytes. A newer storage format cannot read it.' : 'Byte-for-byte identical, but tied to one storage format.', newer ? 'bad' : 'good');
            } else cap.set('Row values, not SQL or bytes: same result on any version.', 'good');
          }
          run();
        },
      },

      /* 6 ─────────────────────────────────────────────── */
      {
        title: 'Stale followers hide posts and rewind time',
        caption: 'Async followers are only eventually consistent. Read your own data from the leader, and pin each user to one replica so time never rewinds.',
        problem: 'Stale reads from lagging followers',
        fix: 'Read-your-writes, monotonic reads',
        demo(el, v) {
          const box = v.wrap(el);
          const top = v.row(box);
          const mode = v.segmented(top, {
            options: [{ value: 'ryw', label: 'Read your writes' }, { value: 'mono', label: 'Monotonic reads' }],
            value: 'ryw',
            onChange: run,
          });
          const fix = v.toggle(top, { label: 'Fix', value: false, onChange: run });
          const st = v.stage(box, { w: 560, h: 280 });
          const L = st.node({ x: 280, y: 55, label: 'Leader', kind: 'primary', shape: 'db' });
          const F1 = st.node({ x: 170, y: 205, label: 'Follower 1', sub: 'lag 0.1 s', shape: 'db' });
          const F2 = st.node({ x: 390, y: 205, label: 'Follower 2', sub: 'lag 5 s', kind: 'warn', shape: 'db' });
          st.link(L, F1, { dashed: true });
          st.link(L, F2, { dashed: true });
          const me = st.node({ x: 55, y: 120, w: 56, h: 56, shape: 'person', label: 'You', kind: 'info' });
          const ana = st.node({ x: 505, y: 120, w: 56, h: 56, shape: 'person', label: 'Ana', kind: 'info' });
          const cap = v.caption(box, '');
          v.controls(box, [{ label: 'Replay', icon: '▶', kind: 'primary', onClick: run }]);
          let have = { L: 0, F1: 0, F2: 0 };
          const count = (n, word) => plural(n, word);
          function paint() {
            L.set({ badge: String(have.L) });
            F1.set({ badge: String(have.F1) });
            F2.set({ badge: String(have.F2), kind: have.F2 < have.L ? 'warn' : 'neutral' });
          }

          async function run() {
            v.restart();
            st.clearPackets();
            const m = mode.get();
            const fixed = fix.get();
            have = { L: 0, F1: 0, F2: 0 };
            paint();
            me.set({ label: m === 'ryw' ? 'You' : 'Bob' });
            ana.dim(m === 'ryw');
            cap.set(m === 'ryw' ? 'You post a comment. Writes go to the leader.' : 'Bob posts a comment via the leader.', 'info');
            await st.send(me, L, { label: 'post', kind: 'data' });
            have.L = 1;
            paint();
            st.send(L, F1, { label: 'post', kind: 'data', dur: 700 }).then(() => { have.F1 = 1; paint(); });
            const slow = st.send(L, F2, { label: 'post', kind: 'data', dur: 6000 }).then(() => { have.F2 = 1; paint(); });
            await st.send(L, me, { label: 'OK', kind: 'good', dur: 600 });
            if (m === 'ryw') {
              const target = fixed ? L : F2;
              cap.set(fixed ? 'Reading your own data? Route it to the leader.' : 'You reload. The read lands on Follower 2.', 'info');
              await st.send(me, target, { label: 'my posts?', kind: 'info' });
              const n = fixed ? have.L : have.F2;
              await st.send(target, me, { label: count(n, 'post'), kind: n ? 'good' : 'bad' });
              if (fixed) {
                cap.set('The leader always has your write. You see it at once.', 'good');
                await v.sleep(1800);
                cap.set('Alternative: only read replicas caught up to your last write.', 'info');
                return;
              }
              cap.set('Your comment vanished! Follower 2 has not caught up.', 'bad');
              await slow;
              cap.set('Seconds later it appears. That is eventual consistency.', 'warn');
              return;
            }
            const second = fixed ? F1 : F2;
            await v.sleep(300);
            cap.set(fixed ? 'Ana is pinned to Follower 1 by a hash of her ID.' : 'Ana loads the page: routed to Follower 1.', 'info');
            await st.send(ana, F1, { label: 'comments?', kind: 'info' });
            await st.send(F1, ana, { label: count(have.F1, 'comment'), kind: have.F1 ? 'good' : 'bad' });
            cap.set("Ana sees Bob's comment.", 'good');
            await v.sleep(500);
            cap.set(fixed ? 'She refreshes: the same replica again.' : 'She refreshes: routed to Follower 2 this time.', 'info');
            await st.send(ana, second, { label: 'comments?', kind: 'info' });
            const n = fixed ? have.F1 : have.F2;
            await st.send(second, ana, { label: count(n, 'comment'), kind: n ? 'good' : 'bad' });
            if (n) { cap.set('Still there. Her reads never go back in time.', 'good'); return; }
            cap.set('The comment vanished! Time went backwards.', 'bad');
            await slow;
            cap.set('It returns once Follower 2 catches up. Confusing.', 'warn');
          }
          run();
        },
      },

      /* 7 ─────────────────────────────────────────────── */
      {
        title: 'Answer arrives before the question',
        caption: 'Partitions replicate independently, so a reader can see an effect before its cause. Put causally related writes in the same partition.',
        problem: 'Causality violated',
        fix: 'Related writes, one partition',
        demo(el, v) {
          const box = v.wrap(el);
          const fix = v.toggle(box, { label: 'Whole chat in one partition', value: false, onChange: run });
          const st = v.stage(box, { w: 560, h: 285 });
          st.box(112, 20, 306, 118, { label: 'PARTITION 1' });
          st.box(112, 155, 306, 118, { label: 'PARTITION 2' });
          const P1L = st.node({ x: 190, y: 88, w: 104, label: 'Leader', kind: 'primary', shape: 'db' });
          const P1F = st.node({ x: 345, y: 88, w: 104, label: 'Follower', sub: 'slow', kind: 'warn', shape: 'db' });
          const P2L = st.node({ x: 190, y: 222, w: 104, label: 'Leader', kind: 'primary', shape: 'db' });
          const P2F = st.node({ x: 345, y: 222, w: 104, label: 'Follower', sub: 'fast', shape: 'db' });
          st.link(P1L, P1F, { dashed: true });
          st.link(P2L, P2F, { dashed: true });
          const mia = st.node({ x: 50, y: 88, w: 52, h: 52, shape: 'person', label: 'Mia', kind: 'info' });
          const leo = st.node({ x: 50, y: 222, w: 52, h: 52, shape: 'person', label: 'Leo', kind: 'data' });
          const obs = st.node({ x: 500, y: 155, w: 56, h: 56, shape: 'person', label: 'Reader', kind: 'info' });
          const feed = v.log(box, { title: 'Reader sees', max: 3, newestFirst: false });
          const cap = v.caption(box, '');
          v.controls(box, [{ label: 'Replay', icon: '▶', kind: 'primary', onClick: run }]);
          const Q = 'Mia: Lunch at noon?';
          const A = 'Leo: Sure, see you there!';

          async function run() {
            v.restart();
            st.clearPackets();
            feed.clear();
            const fixed = fix.get();
            P2L.dim(fixed);
            P2F.dim(fixed);
            let seenQ = false;
            const show = (from, label, isQ) => st.send(from, obs, { label, kind: 'info', dur: 600 }).then(() => {
              if (isQ) {
                seenQ = true;
                feed.add(Q, fixed ? 'good' : 'warn');
                if (!fixed) cap.set('The question shows up late. Causality broken.', 'bad');
              } else {
                feed.add(A, seenQ ? 'good' : 'bad');
                if (!seenQ) cap.set('Reader sees an answer to a question never asked!', 'bad');
                else cap.set('Question, then answer: a consistent prefix.', 'good');
              }
            });
            cap.set('Mia asks a question. It lands in partition 1.', 'info');
            await st.send(mia, P1L, { label: 'lunch?', kind: 'data' });
            const q = st.send(P1L, P1F, { label: 'lunch?', kind: 'data', dur: 3800 }).then(() => show(P1F, 'lunch?', true));
            cap.set('Leo reads the question and replies.', 'info');
            await st.send(P1L, leo, { label: 'lunch?', kind: 'info', dur: 700 });
            const home = fixed ? P1L : P2L;
            await st.send(leo, home, { label: 'sure!', kind: 'data', dur: 700 });
            if (fixed) cap.set('Same partition: one log, one order. Slow, but in order.', 'good');
            else cap.set('His reply lands in partition 2, which replicates fast.', 'warn');
            const a = st.send(home, fixed ? P1F : P2F, { label: 'sure!', kind: 'data', dur: fixed ? 3800 : 700 }).then(() => show(fixed ? P1F : P2F, 'sure!', false));
            await Promise.all([q, a]);
            if (fixed) {
              await v.sleep(1500);
              cap.set("Where one partition won't do, use transactions.", 'info');
            }
          }
          run();
        },
      },

      /* 8 ─────────────────────────────────────────────── */
      {
        title: 'A leader in every datacenter',
        caption: 'Each site accepts writes locally and syncs the others in the background: fast, and it survives outages. The same pattern powers offline apps and co-editing.',
        tags: ['Tungsten', 'PostgreSQL BDR', 'CouchDB', 'Google Docs'],
        demo(el, v) {
          const box = v.wrap(el);
          const top = v.row(box);
          const mode = v.segmented(top, {
            options: [{ value: 'single', label: 'Single leader', kind: 'bad' }, { value: 'multi', label: 'Multi-leader', kind: 'good' }],
            value: 'single',
            onChange: paint,
          });
          const use = v.segmented(top, {
            options: [{ value: 'dc', label: 'Datacenters' }, { value: 'dev', label: 'Offline devices' }, { value: 'doc', label: 'Co-editing' }],
            value: 'dc',
            onChange: paint,
          });
          const cut = v.toggle(top, { label: 'Link down', value: false, onChange: onCut });
          const st = v.stage(box, { w: 560, h: 240 });
          const b1 = st.box(12, 20, 256, 200, { label: 'DATACENTER 1', kind: 'primary' });
          const b2 = st.box(292, 20, 256, 200, { label: 'DATACENTER 2', kind: 'primary' });
          const u1 = st.node({ x: 62, y: 128, w: 54, h: 54, shape: 'person', label: 'User', kind: 'info' });
          const n1 = st.node({ x: 180, y: 128, w: 118, label: 'Leader', kind: 'primary', shape: 'db' });
          const n2 = st.node({ x: 380, y: 128, w: 118, label: 'Follower', shape: 'db' });
          const u2 = st.node({ x: 498, y: 128, w: 54, h: 54, shape: 'person', label: 'User', kind: 'info' });
          st.link(u1, n1, { both: true, thin: true });
          const u2link = st.link(u2, n2, { both: true, thin: true });
          const link = st.link(n1, n2, { dashed: true, label: 'internet' });
          const stats = v.row(box, { center: true });
          const sLat = v.stat(stats, 'write latency, right side', '—', 'info');
          const sOut = v.stat(stats, 'writes while link down', '—', 'info');
          const cap = v.caption(box, '');
          v.controls(box, [{ label: 'Write on the right side', icon: '✎', kind: 'primary', onClick: write }]);
          const CASES = {
            dc: { box: ['DATACENTER 1', 'DATACENTER 2'], users: ['User', 'User'], sub: '', link: 'internet', slow: '≈150 ms', fast: '≈2 ms' },
            dev: { box: ['SERVER', 'YOUR PHONE'], users: ['Laptop', 'You'], sub: 'local DB', link: 'sync', slow: 'needs signal', fast: 'instant' },
            doc: { box: ["ALICE'S EDITOR", "BOB'S EDITOR"], users: ['Alice', 'Bob'], sub: 'doc copy', link: 'edits', slow: 'lock + wait', fast: 'per keystroke' },
          };
          let pending = 0;

          function paint() {
            v.restart();
            st.clearPackets();
            const m = mode.get();
            const U = CASES[use.get()];
            pending = 0;
            b1.set({ label: U.box[0] });
            b2.set({ label: U.box[1] });
            u1.set({ label: U.users[0] });
            u2.set({ label: U.users[1] });
            n1.set({ label: m === 'multi' ? 'Leader 1' : 'Leader', sub: U.sub, badge: '' });
            n2.set({ label: m === 'multi' ? 'Leader 2' : 'Follower', sub: m === 'multi' ? U.sub : 'read-only', kind: m === 'multi' ? 'primary' : 'neutral', badge: '' });
            u2link.set({ kind: m === 'multi' ? 'primary' : 'muted' });
            link.set({ both: m === 'multi', kind: cut.get() ? 'bad' : 'muted', label: cut.get() ? '✕ link down' : U.link });
            sLat.set('—', 'info');
            sOut.set('—', 'info');
            cap.set(m === 'multi' ? 'Both sides accept writes and sync each other.' : 'Only the left side accepts writes.', 'info');
          }
          async function write() {
            v.restart();
            st.clearPackets();
            const m = mode.get();
            const down = cut.get();
            const U = CASES[use.get()];
            if (m === 'single') {
              cap.set('The right side must write through the far-away leader.', 'info');
              const r = await st.send(u2, n1, { label: 'write', kind: 'data', curve: 100, dur: 1800, drop: down ? 0.5 : false });
              if (r === 'dropped') {
                sLat.set('✕', 'bad');
                sOut.set('none', 'bad');
                cap.set('Link down: the right side cannot write at all.', 'bad');
                return;
              }
              await st.send(n1, u2, { label: 'OK', kind: 'good', curve: -100, dur: 1800 });
              sLat.set(U.slow, 'warn');
              cap.set('Every write pays the long round trip.', 'warn');
              await st.send(n1, n2, { label: 'change', kind: 'data', dur: 900 });
              return;
            }
            await st.send(u2, n2, { label: 'write', kind: 'data', dur: 500 });
            await st.send(n2, u2, { label: 'OK', kind: 'good', dur: 500 });
            pending++;
            sLat.set(U.fast, 'good');
            if (down) {
              n2.set({ badge: pending + ' queued' });
              sOut.set('✓ local', 'good');
              cap.set('Link down, still writable. Changes queue up locally.', 'good');
              return;
            }
            cap.set('Accepted locally, then synced in the background.', 'good');
            await flush();
            cap.set('Fast and outage-proof. But both sides may edit the same data…', 'warn');
          }
          // Send every change accepted on the right but not yet delivered to the left.
          function flush() {
            n2.set({ badge: '' });
            return Promise.all(range(pending).map((i) => v.sleep(i * 250)
              .then(() => st.send(n2, n1, { label: 'change', kind: 'data', dur: 1400 }))
              .then(() => { pending = Math.max(0, pending - 1); })));
          }
          async function onCut(isDown) {
            v.restart();
            st.clearPackets();
            link.set({ kind: isDown ? 'bad' : 'muted', label: isDown ? '✕ link down' : CASES[use.get()].link });
            if (isDown) {
              if (pending) n2.set({ badge: pending + ' queued' });
              cap.set('The link between the two sides is cut.', 'warn');
              return;
            }
            if (!pending) { cap.set('Link restored.', 'info'); return; }
            cap.set('Link is back: queued changes flow across.', 'good');
            await flush();
            cap.set('Both sides are in sync again.', 'good');
          }
          paint();
        },
      },

      /* 9 ─────────────────────────────────────────────── */
      {
        title: 'Two leaders, one record, two answers',
        caption: 'Both leaders accept conflicting edits and only notice later. Avoid conflicts with a home leader per record, or converge: last-write-wins, merge, or keep both.',
        problem: 'Concurrent edits on two leaders',
        fix: 'Avoid, or converge',
        tags: ['CouchDB', 'Bucardo', 'CRDTs'],
        demo(el, v) {
          const box = v.wrap(el);
          const how = v.segmented(box, {
            options: [
              { value: 'avoid', label: 'Avoid: home leader', kind: 'good' },
              { value: 'lww', label: 'Last write wins', kind: 'bad' },
              { value: 'merge', label: 'Merge (on write)' },
              { value: 'keep', label: 'Keep both (on read)' },
            ],
            value: 'lww',
            onChange: run,
          });
          const st = v.stage(box, { w: 560, h: 250 });
          const L1 = st.node({ x: 160, y: 80, w: 136, label: 'Leader 1', sub: 'day = Mon', kind: 'primary', shape: 'db' });
          const L2 = st.node({ x: 400, y: 80, w: 136, label: 'Leader 2', sub: 'day = Mon', kind: 'primary', shape: 'db' });
          st.link(L1, L2, { dashed: true, both: true, label: 'async' });
          const kim = st.node({ x: 60, y: 190, w: 52, h: 52, shape: 'person', label: 'Kim', kind: 'info' });
          const lee = st.node({ x: 500, y: 190, w: 52, h: 52, shape: 'person', label: 'Lee', kind: 'data' });
          st.link(kim, L1, { thin: true, arrow: false });
          st.link(lee, L2, { thin: true, arrow: false });
          const stats = v.row(box, { center: true });
          const sConf = v.stat(stats, 'conflicts', '—', 'info');
          const sLost = v.stat(stats, 'edits silently lost', '—', 'info');
          const cap = v.caption(box, '');
          v.controls(box, [{ label: 'Replay', icon: '▶', kind: 'primary', onClick: run }]);
          const both = (p) => { L1.set(p); L2.set(p); };

          async function run() {
            v.restart();
            st.clearPackets();
            const m = how.get();
            const ts = Math.random() < 0.5 ? [5, 4] : [4, 5];
            both({ sub: 'day = Mon', kind: 'primary' });
            sConf.set('—', 'info');
            sLost.set('—', 'info');
            if (m === 'avoid') {
              cap.set('This record lives on Leader 1. Both edits go there.', 'info');
              await Promise.all([
                st.send(kim, L1, { label: 'Tue', kind: 'data' }).then(() => L1.set({ sub: 'day = Tue' })),
                v.sleep(250).then(() => st.send(lee, L1, { label: 'Wed', kind: 'data', dur: 1400 })).then(() => L1.set({ sub: 'day = Wed' })),
              ]);
              cap.set('One leader orders them: Tue, then Wed. No conflict.', 'good');
              await st.send(L1, L2, { label: 'Wed', kind: 'data' });
              L2.set({ sub: 'day = Wed' });
              both({ kind: 'good' });
              sConf.set('0', 'good');
              sLost.set('0', 'good');
              cap.set('Replicas agree. It breaks only if the home leader must move.', 'good');
              return;
            }
            cap.set('Kim and Lee edit the same record at the same time.', 'info');
            await Promise.all([
              st.send(kim, L1, { label: `Tue t=${ts[0]}`, kind: 'data' }),
              st.send(lee, L2, { label: `Wed t=${ts[1]}`, kind: 'data' }),
            ]);
            L1.set({ sub: 'day = Tue' });
            L2.set({ sub: 'day = Wed' });
            await Promise.all([st.send(L1, kim, { label: 'OK', kind: 'good', dur: 600 }), st.send(L2, lee, { label: 'OK', kind: 'good', dur: 600 })]);
            cap.set('Both got OK. Neither leader knows about the other edit.', 'warn');
            await v.sleep(600);
            await Promise.all([st.send(L1, L2, { label: 'Tue', kind: 'data', curve: 26 }), st.send(L2, L1, { label: 'Wed', kind: 'data', curve: 26 })]);
            both({ kind: 'bad' });
            sConf.set('1', 'bad');
            cap.set('Conflict found, asynchronously. Too late to ask the users.', 'bad');
            await v.sleep(1300);
            if (m === 'lww') {
              const kimWins = ts[0] > ts[1];
              both({ sub: 'day = ' + (kimWins ? 'Tue' : 'Wed'), kind: 'good' });
              sLost.set('1', 'bad');
              cap.set(`Highest timestamp wins. ${kimWins ? "Lee's" : "Kim's"} edit silently vanishes.`, 'bad');
            } else if (m === 'merge') {
              both({ sub: 'day = Tue/Wed', kind: 'warn' });
              sLost.set('0', 'good');
              cap.set('A handler merges on write: "Tue/Wed". Nothing lost, but odd.', 'warn');
            } else {
              both({ sub: 'day = Tue | Wed ?', kind: 'warn' });
              sLost.set('0', 'good');
              cap.set('Both versions are stored. The next reader must decide.', 'warn');
              await v.sleep(700);
              await st.send(kim, L1, { label: 'read', kind: 'info' });
              await st.send(L1, kim, { label: 'Tue or Wed?', kind: 'warn' });
              await st.send(kim, L1, { label: 'Wed', kind: 'data' });
              L1.set({ sub: 'day = Wed', kind: 'good' });
              await st.send(L1, L2, { label: 'Wed', kind: 'data' });
              L2.set({ sub: 'day = Wed', kind: 'good' });
              cap.set('Resolved on read by the app or the user.', 'good');
            }
          }
          run();
        },
      },

      /* 10 ─────────────────────────────────────────────── */
      {
        title: 'Circle, star, or all-to-all?',
        caption: 'Writes hop between leaders along a topology; node-ID tags stop endless loops. Dense links survive failures, but one write can overtake another it depends on.',
        problem: 'Loops, broken rings, overtaking',
        fix: 'Node IDs + causal ordering',
        tags: ['MySQL (circular)', 'Version vectors'],
        demo(el, v) {
          const box = v.wrap(el);
          const topo = v.segmented(box, {
            options: [{ value: 'ring', label: 'Circular' }, { value: 'star', label: 'Star' }, { value: 'all', label: 'All-to-all' }],
            value: 'ring',
            onChange: () => layout(true),
          });
          const opts = v.row(box);
          const ids = v.toggle(opts, { label: 'Tag node IDs', value: true, onChange: () => layout(false) });
          const causal = v.toggle(opts, { label: 'Causal order', value: false, onChange: () => layout(false) });
          const st = v.stage(box, { w: 560, h: 290 });
          const cap = v.caption(box, '');
          const ctl = v.controls(box, [
            { label: 'Replicate a write', icon: '▶', kind: 'primary', onClick: replicate },
            { label: 'Insert, then update', icon: '⇄', onClick: race },
            { id: 'kill', label: 'Crash a node', icon: '✕', kind: 'danger', onClick: toggleDead },
          ]);
          const POS = {
            ring: { 1: [280, 45], 2: [460, 145], 3: [280, 245], 4: [100, 145] },
            star: { 1: [280, 150], 2: [280, 42], 3: [460, 238], 4: [100, 238] },
            all: { 1: [280, 45], 2: [460, 145], 3: [280, 245], 4: [100, 145] },
          };
          const DEAD = { ring: 2, star: 1, all: 2 };
          let N = {}, xs = {}, dead = false;
          const deadId = () => (dead ? DEAD[topo.get()] : 0);
          const alive = (i) => i !== deadId();
          const sub = (i) => (xs[i] == null ? 'x: none' : xs[i] === '?' ? 'x: ?!' : 'x = ' + xs[i]);
          function paintNode(i, kind) {
            N[i].set({ sub: sub(i), kind: !alive(i) ? 'bad' : kind || (xs[i] == null ? 'neutral' : 'good'), down: !alive(i) });
          }
          const set = (i, val, kind) => { xs[i] = val; paintNode(i, kind); };

          function layout(explain) {
            v.restart();
            st.clearPackets();
            st.clear();
            const t = topo.get();
            N = {};
            xs = {};
            [1, 2, 3, 4].forEach((i) => {
              const [x, y] = POS[t][i];
              N[i] = st.node({ x, y, w: 96, h: 48, label: 'N' + i + (t === 'star' && i === 1 ? ' root' : ''), sub: 'x: none' });
              paintNode(i);
            });
            if (t === 'ring') [[1, 2], [2, 3], [3, 4], [4, 1]].forEach(([a, b]) => st.link(N[a], N[b], { kind: 'primary' }));
            else if (t === 'star') [2, 3, 4].forEach((b) => st.link(N[1], N[b], { both: true, kind: 'primary' }));
            else [[1, 2], [1, 3], [1, 4], [2, 3], [2, 4], [3, 4]].forEach(([a, b]) => st.link(N[a], N[b], { both: true, thin: true, label: a === 1 && b === 2 ? 'slow' : '' }));
            ctl.set('kill', { label: dead ? 'Revive node' : 'Crash a node' });
            if (explain !== false) {
              cap.set(t === 'ring' ? 'Each node forwards to the next. One path around.'
                : t === 'star' ? 'The root relays every write to the others.'
                  : 'Every leader sends straight to every other.', 'info');
            }
          }
          async function hop(a, b, label, o = {}) {
            if (!alive(a)) return false;
            const drop = !alive(b) ? 0.7 : o.reject ? 0.9 : false;
            const r = await st.send(N[a], N[b], { label, kind: o.kind || 'data', dur: o.dur || 800, drop });
            return r !== 'dropped';
          }
          function toggleDead() {
            dead = !dead;
            layout(false);
            cap.set(dead ? `N${DEAD[topo.get()]} is down. Now replicate and see who hears.` : 'All nodes are back.', dead ? 'warn' : 'info');
          }
          async function replicate() {
            layout(false);
            const t = topo.get();
            const tag = ids.get();
            cap.set(t === 'star' ? 'N2 writes x = 1 and sends it to the root.' : t === 'ring' ? 'N1 writes x = 1 and passes it on.' : 'N1 writes x = 1 and sends it to everyone.', 'info');
            if (t === 'ring') {
              set(1, 1);
              let at = 1;
              const path = [1];
              for (let hops = 1; hops <= 8; hops++) {
                const next = (at % 4) + 1;
                const reject = tag && path.includes(next);
                const ok = await hop(at, next, tag ? `x [${path.join(',')}]` : 'x', { reject });
                if (reject) { cap.set(`N${next} sees its own ID in the tag: dropped. No loop.`, 'good'); return; }
                if (!ok) { cap.set(`N${next} is down: the ring is broken. The rest never hear.`, 'bad'); return; }
                set(next, 1);
                path.push(next);
                at = next;
                if (!tag && hops >= 4) cap.set(`No IDs: lap ${Math.floor(hops / 4) + 1}, still circling…`, 'bad');
              }
              cap.set('Without IDs the write circles forever. Stopped after two laps.', 'bad');
              return;
            }
            if (t === 'star') {
              set(2, 1);
              for (let round = 1; round <= 2; round++) {
                const ok = await hop(2, 1, tag ? 'x [2]' : 'x');
                if (!ok) { cap.set('The root is down: nobody else gets anything.', 'bad'); return; }
                set(1, 1);
                const targets = tag ? [3, 4] : [2, 3, 4];
                const res = await Promise.all(targets.map((b) => hop(1, b, tag ? 'x [2,1]' : 'x')));
                targets.forEach((b, k) => { if (res[k]) set(b, 1); });
                if (tag) { cap.set('The root skips N2: its ID is already in the tag.', 'good'); return; }
                cap.set('No IDs: N2 gets its own write back and resends it…', 'bad');
              }
              cap.set('It loops forever. Stopped after two rounds.', 'bad');
              return;
            }
            set(1, 1);
            const res = await Promise.all([2, 3, 4].map((b) => hop(1, b, 'x [1]')));
            [2, 3, 4].forEach((b, k) => { if (res[k]) set(b, 1); });
            cap.set(dead ? 'N2 is down, yet everyone else got it directly.' : 'One hop to everyone. No forwarding, so no loops.', 'good');
          }
          async function race() {
            layout(false);
            const t = topo.get();
            if (t === 'ring') {
              cap.set('N1 inserts x = 1. It travels around the ring.', 'info');
              set(1, 1);
              if (!(await hop(1, 2, 'insert'))) { cap.set('N2 is down: the ring is broken.', 'bad'); return; }
              set(2, 1);
              await hop(2, 3, 'insert');
              set(3, 1);
              cap.set('At N3 a client adds one: x = 2.', 'info');
              set(3, 2);
              await hop(3, 4, 'insert');
              set(4, 1);
              await hop(3, 4, 'update');
              set(4, 2);
              await hop(4, 1, 'update');
              set(1, 2);
              await hop(1, 2, 'update');
              set(2, 2);
              cap.set('One path: the update can never overtake its insert.', 'good');
              return;
            }
            if (t === 'star') {
              cap.set('N2 inserts x = 1. The root relays it.', 'info');
              set(2, 1);
              if (!(await hop(2, 1, 'insert'))) { cap.set('The root is down: nothing flows.', 'bad'); return; }
              set(1, 1);
              await Promise.all([3, 4].map((b) => hop(1, b, 'insert').then(() => set(b, 1))));
              cap.set('At N3 a client adds one: x = 2.', 'info');
              set(3, 2);
              await hop(3, 1, 'update');
              set(1, 2);
              await Promise.all([2, 4].map((b) => hop(1, b, 'update').then(() => set(b, 2))));
              cap.set('The root relays in order, so updates follow inserts.', 'good');
              return;
            }
            const guard = causal.get();
            cap.set('N1 inserts x = 1. The link to N2 is congested.', 'info');
            set(1, 1);
            let buffered = false;
            const toN2 = hop(1, 2, 'insert', { dur: 3600 }).then((ok) => {
              if (!ok) return;
              if (buffered) { set(2, 2, 'good'); cap.set('Insert arrives; the held update applies after it. All x = 2.', 'good'); return; }
              if (xs[2] === '?') { set(2, 1, 'bad'); cap.set('Insert arrives late: N2 ends at x = 1, the rest at 2.', 'bad'); return; }
              set(2, 1);
            });
            await Promise.all([hop(1, 4, 'insert', { dur: 1000 }).then(() => set(4, 1)), hop(1, 3, 'insert', { dur: 700 }).then(() => set(3, 1))]);
            cap.set('N3 got it first. A client there adds one: x = 2.', 'info');
            set(3, 2);
            const ups = [1, 2, 4].map((b) => hop(3, b, 'update', { dur: 700, kind: 'warn' }).then((ok) => {
              if (!ok) return;
              if (b !== 2) { set(b, 2); return; }
              if (xs[2] != null) { set(2, 2); return; }
              if (guard) { buffered = true; N[2].set({ sub: 'holds update', kind: 'warn' }); cap.set('N2 holds the update: its insert has not arrived yet.', 'warn'); }
              else { set(2, '?', 'bad'); cap.set('N2 gets an update for a row that does not exist!', 'bad'); }
            }));
            await Promise.all(ups.concat([toN2]));
            if (dead) cap.set('N2 is down and misses both. The others agree: x = 2.', 'warn');
          }
          layout(true);
        },
      },

      /* 11 ─────────────────────────────────────────────── */
      {
        title: 'No leader: quorums of w and r',
        lab: { id: 'quorum', preset: 'basics' },
        caption: 'Send each write and read to all n replicas, wait for w or r replies. If w + r > n, the sets must overlap.',
        problem: 'Replicas miss writes while down',
        fix: 'Read repair + anti-entropy',
        tags: ['Dynamo', 'Cassandra', 'Riak', 'Voldemort'],
        demo(el, v) {
          const box = v.wrap(el);
          const sl = v.row(box);
          let n = 5, w = 3, r = 3;
          const sN = v.slider(sl, { label: 'n', min: 3, max: 7, value: 5, onInput: (x) => { n = x; if (w > n) { w = n; sW.set(n); } if (r > n) { r = n; sR.set(n); } rebuild(); } });
          const sW = v.slider(sl, { label: 'w', min: 1, max: 7, value: 3, onInput: (x) => { w = Math.min(x, n); sW.set(w); lastW = []; lastR = []; paintSets(true); } });
          const sR = v.slider(sl, { label: 'r', min: 1, max: 7, value: 3, onInput: (x) => { r = Math.min(x, n); sR.set(r); lastW = []; lastR = []; paintSets(true); } });
          void sN;
          const st = v.stage(box, { w: 560, h: 260 });
          const stats = v.row(box, { center: true });
          const sQ = v.stat(stats, 'w + r vs n', '', 'good');
          const sO = v.stat(stats, 'guaranteed overlap', '', 'good');
          const sS = v.stat(stats, 'stale reads', '0 / 0', 'info');
          const cap = v.caption(box, '');
          const row2 = v.row(box);
          v.controls(row2, [
            { label: 'Write', icon: '✎', kind: 'primary', onClick: write },
            { label: 'Read', icon: '◉', onClick: read },
            { label: 'Crash a node', icon: '✕', kind: 'danger', onClick: crash },
            { label: 'Revive all', icon: '↺', onClick: revive },
          ]);
          const ae = v.toggle(row2, { label: 'Anti-entropy', value: false, onChange: (b) => cap.set(b ? 'A background job copies missing versions between replicas.' : 'Anti-entropy off: only reads repair stale replicas.', 'info') });
          const X = (i) => 280 + (i - (n - 1) / 2) * 76;
          let ver = [], up = [], nodes = [], marks = [], counter = 0, okVer = 0, reads = 0, stale = 0, lastW = [], lastR = [], failed = [];
          let client, overlapTxt;

          function rebuild() {
            v.restart();
            st.clear();
            counter = 0; okVer = 0; reads = 0; stale = 0; lastW = []; lastR = []; failed = [];
            ver = range(n).map(() => 0);
            up = range(n).map(() => true);
            client = st.node({ x: 280, y: 36, w: 48, h: 48, shape: 'person', label: 'Client', kind: 'info' });
            nodes = range(n).map((i) => st.node({ x: X(i), y: 140, w: 62, h: 50, label: 'R' + (i + 1), sub: 'v0', shape: 'db' }));
            marks = range(n).map((i) => ({
              w: st.rect(X(i) - 22, 177, 44, 18, { kind: 'good', rx: 5, label: 'W', size: 12 }),
              r: st.rect(X(i) - 22, 200, 44, 18, { kind: 'info', rx: 5, label: 'R', size: 12 }),
            }));
            overlapTxt = st.text(280, 240, '', { size: 13, kind: 'text2' });
            paint();
            paintSets(true);
          }
          function paint() {
            nodes.forEach((nd, i) => {
              const kind = !up[i] ? 'bad' : ver[i] > okVer ? 'data' : okVer && ver[i] === okVer ? 'good' : okVer ? 'warn' : 'neutral';
              nd.set({ sub: 'v' + ver[i], kind, down: !up[i] });
            });
          }
          function paintSets(explain) {
            marks.forEach((m, i) => { m.w.set({ opacity: lastW.includes(i) ? 1 : 0 }); m.r.set({ opacity: lastR.includes(i) ? 1 : 0 }); });
            const both = lastW.filter((i) => lastR.includes(i));
            overlapTxt.set(lastW.length && lastR.length ? `write set ∩ read set = ${plural(both.length, 'replica')}` : '', both.length ? 'good' : 'bad');
            const q = w + r > n;
            sQ.set(`${w}+${r} ${q ? '>' : '≤'} ${n}`, q ? 'good' : 'bad');
            sO.set(String(Math.max(0, w + r - n)), q ? 'good' : 'bad');
            sS.set(`${stale} / ${reads}`, stale ? 'bad' : 'info');
            if (explain) cap.set(q ? `Any ${r} readers include one of any ${w} writers.` : `A read of ${r} can miss all ${w} written replicas.`, q ? 'good' : 'bad');
          }
          async function write() {
            v.restart();
            st.clearPackets();
            const k = ++counter;
            const live = range(n).filter((i) => up[i]);
            const S = live.length >= w ? shuffle(live).slice(0, w) : live.slice();
            lastW = S.slice();
            lastR = [];
            paintSets(false);
            cap.set(live.length >= w ? `Send v${k} to all ${n}. Worst case: only ${w} get it.` : `Only ${live.length} replicas are up, but w = ${w}.`, 'info');
            await Promise.all(range(n).map((i) => st.send(client, nodes[i], { label: 'v' + k, kind: 'data', dur: 800 + i * 60, drop: S.includes(i) ? false : 0.6 })
              .then((res) => { if (res !== 'dropped') { ver[i] = Math.max(ver[i], k); paint(); } })));
            if (S.length < w) {
              failed.push(k);
              cap.set(`Only ${S.length} of ${w} acks: write failed, yet not rolled back.`, 'bad');
              return;
            }
            okVer = k;
            paint();
            await Promise.all(S.map((i) => st.send(nodes[i], client, { kind: 'good', dur: 600, flash: false })));
            cap.set(`${w} acks arrived: write v${k} succeeded.`, 'good');
          }
          async function read() {
            v.restart();
            st.clearPackets();
            const live = range(n).filter((i) => up[i]);
            if (live.length < r) {
              lastR = live.slice();
              paintSets(false);
              await Promise.all(live.map((i) => st.send(client, nodes[i], { label: 'get', kind: 'info' })));
              cap.set(`Only ${live.length} of ${r} replicas answer: the read fails.`, 'bad');
              return;
            }
            const R = shuffle(live).slice(0, r);
            lastR = R.slice();
            paintSets(false);
            cap.set(`Ask ${r} replicas and keep the newest version.`, 'info');
            await Promise.all(R.map((i) => st.send(client, nodes[i], { label: 'get', kind: 'info', dur: 700 })));
            const vals = R.map((i) => ver[i]);
            await Promise.all(R.map((i, j) => st.send(nodes[i], client, { label: 'v' + vals[j], kind: vals[j] >= okVer ? 'good' : 'warn', dur: 700 })));
            const best = Math.max(...vals);
            reads++;
            const isStale = best < okVer;
            if (isStale) stale++;
            paintSets(false);
            cap.set(isStale ? `Stale! Got v${best}, but v${okVer} was written.` : best > okVer ? (failed.includes(best) ? `Got v${best}: a write that was reported as failed.` : `Got v${best} from a write still in flight.`) : `Newest reply wins: v${best}.`,
              isStale ? 'bad' : best > okVer ? 'warn' : 'good');
            const behind = R.filter((i, j) => vals[j] < best);
            if (!behind.length) return;
            await v.sleep(900);
            cap.set(`Read repair: send v${best} to ${plural(behind.length, 'stale replica')}.`, 'info');
            await Promise.all(behind.map((i) => st.send(client, nodes[i], { label: 'v' + best, kind: 'good', dur: 700 })
              .then(() => { ver[i] = Math.max(ver[i], best); paint(); })));
          }
          function crash() {
            const live = range(n).filter((i) => up[i]);
            if (!live.length) return;
            up[pick(live)] = false;
            paint();
            const down = n - up.filter(Boolean).length;
            cap.set(`${down} down. Writes need ${w} up, reads need ${r}.`, n - down < Math.max(w, r) ? 'bad' : 'warn');
          }
          function revive() {
            up = up.map(() => true);
            paint();
            cap.set('Back online, but maybe stale. Read repair or anti-entropy fixes that.', 'info');
          }
          v.every(1600, () => {
            if (!ae.get()) return;
            const live = range(n).filter((i) => up[i]);
            if (live.length < 2) return;
            const best = Math.max(...live.map((i) => ver[i]));
            const behind = live.filter((i) => ver[i] < best);
            if (!behind.length) return;
            const src = live.find((i) => ver[i] === best);
            const dst = pick(behind);
            st.send(nodes[src], nodes[dst], { label: 'sync', kind: 'data', dur: 900, curve: src < dst ? -90 : 90 })
              .then(() => { ver[dst] = Math.max(ver[dst], best); paint(); });
          });
          rebuild();
        },
      },

      /* 12 ─────────────────────────────────────────────── */
      {
        title: 'Quorum met, yet the read is stale',
        lab: { id: 'quorum', preset: 'back-in-time' },
        caption: 'Sloppy quorums park writes on stand-in nodes until hinted handoff returns them. Partly failed writes and restored nodes can also break the overlap.',
        problem: 'Quorum edge cases',
        fix: 'Hinted handoff, staleness monitoring',
        tags: ['Riak (sloppy on)', 'Cassandra (off)'],
        demo(el, v) {
          const box = v.wrap(el);
          const top = v.row(box);
          const mode = v.segmented(top, {
            options: [{ value: 'sloppy', label: 'Sloppy quorum' }, { value: 'partial', label: 'Partial write' }, { value: 'restore', label: 'Stale restore' }],
            value: 'sloppy',
            onChange: run,
          });
          const allow = v.toggle(top, { label: 'Allow stand-ins', value: true, onChange: run });
          const st = v.stage(box, { w: 560, h: 285 });
          st.box(102, 58, 380, 110, { label: 'HOME NODES' });
          st.text(470, 76, 'n=3 · w=2 · r=2', { size: 12, anchor: 'end', kind: 'muted' });
          const writer = st.node({ x: 48, y: 122, w: 52, h: 52, shape: 'person', label: 'Writer', kind: 'data' });
          const reader = st.node({ x: 520, y: 122, w: 52, h: 52, shape: 'person', label: 'Reader', kind: 'info' });
          const H = {
            A: st.node({ x: 165, y: 122, w: 92, label: 'A', sub: 'v1', shape: 'db' }),
            B: st.node({ x: 296, y: 122, w: 92, label: 'B', sub: 'v1', shape: 'db' }),
            C: st.node({ x: 420, y: 122, w: 92, label: 'C', sub: 'v1', shape: 'db' }),
          };
          const D = st.node({ x: 150, y: 232, w: 120, label: 'D', sub: 'stand-in', kind: 'ghost', shape: 'db' });
          const cutLine = st.line(231, 24, 231, 272, { kind: 'bad', dashed: true, width: 3 });
          const cutText = st.text(231, 14, 'network cut', { size: 12, kind: 'bad', bold: true });
          const stats = v.row(box, { center: true });
          const sCopies = v.stat(stats, 'home copies of v2', '—', 'info');
          const sRead = v.stat(stats, 'read returns', '—', 'info');
          const cap = v.caption(box, '');
          v.controls(box, [{ label: 'Replay', icon: '▶', kind: 'primary', onClick: run }]);
          let ver = {};
          const up = (k) => { const nd = H[k]; nd.set({ sub: 'v' + ver[k], kind: ver[k] === 2 ? 'good' : 'warn' }); };
          const homeCopies = () => ['A', 'B', 'C'].filter((k) => ver[k] === 2).length;
          const showCut = (b) => { cutLine.el.style.display = b ? '' : 'none'; cutText.show(b); };
          const curveW = { A: 0, B: -60, C: -80 };
          const curveR = { A: 80, B: 60, C: 0 };

          async function readBC(label) {
            cap.set(label, 'info');
            await Promise.all(['B', 'C'].map((k) => st.send(reader, H[k], { label: 'get', kind: 'info', curve: curveR[k] })));
            const vals = ['B', 'C'].map((k) => ver[k]);
            await Promise.all(['B', 'C'].map((k, j) => st.send(H[k], reader, { label: 'v' + vals[j], kind: vals[j] === 2 ? 'good' : 'warn', curve: -curveR[k] })));
            const best = Math.max(...vals);
            sRead.set('v' + best, best === 2 ? 'good' : 'bad');
            return best;
          }
          async function run() {
            v.restart();
            st.clearPackets();
            const m = mode.get();
            ver = { A: 1, B: 1, C: 1 };
            ['A', 'B', 'C'].forEach((k) => H[k].set({ sub: 'v1', kind: 'neutral', down: false }));
            D.set({ sub: 'stand-in', kind: 'ghost', badge: '' });
            D.show(m === 'sloppy');
            showCut(m === 'sloppy');
            sCopies.set('—', 'info');
            sRead.set('—', 'info');
            if (m === 'sloppy') {
              cap.set('A network cut hides B and C from the writer.', 'warn');
              await v.sleep(900);
              cap.set('Write v2 to the home nodes A, B, C.', 'info');
              await Promise.all(['A', 'B', 'C'].map((k) => st.send(writer, H[k], { label: 'v2', kind: 'data', curve: curveW[k], drop: k === 'A' ? false : 0.4 })));
              ver.A = 2;
              up('A');
              sCopies.set('1', 'warn');
              if (!allow.get()) {
                cap.set('Only 1 of 2 home acks. Strict quorum: the write fails.', 'bad');
                return;
              }
              cap.set('Sloppy: stand-in D takes it, with a hint "for B".', 'warn');
              await st.send(writer, D, { label: 'v2 for B', kind: 'data' });
              D.set({ sub: 'hint: v2 → B', kind: 'warn' });
              await Promise.all([st.send(H.A, writer, { label: 'ok', kind: 'good', dur: 600 }), st.send(D, writer, { label: 'ok', kind: 'good', dur: 600 })]);
              cap.set('Two acks (A and D): the write "succeeds".', 'good');
              await v.sleep(700);
              await readBC('Another client reads B and C: r = 2.');
              cap.set('Stale! w + r > n, but v2 sits outside the home nodes.', 'bad');
              await v.sleep(1400);
              showCut(false);
              cap.set('The network heals. D hands the write back to B.', 'info');
              await st.send(D, H.B, { label: 'handoff v2', kind: 'good' });
              ver.B = 2;
              up('B');
              D.set({ sub: 'stand-in', kind: 'ghost' });
              sCopies.set('2', 'good');
              await readBC('Read B and C again.');
              cap.set('Hinted handoff done: now the read sees v2.', 'good');
              return;
            }
            if (m === 'partial') {
              cap.set('Write v2. The disks on B and C are full.', 'info');
              await Promise.all(['A', 'B', 'C'].map((k) => st.send(writer, H[k], { label: 'v2', kind: 'data', curve: curveW[k] })));
              ver.A = 2;
              up('A');
              H.B.set({ kind: 'bad', sub: 'disk full' });
              H.C.set({ kind: 'bad', sub: 'disk full' });
              await st.send(H.A, writer, { label: 'ok', kind: 'good', dur: 600 });
              sCopies.set('1', 'warn');
              cap.set('Only 1 of 2 acks: the client is told it failed.', 'bad');
              await v.sleep(1300);
              up('B');
              up('C');
              cap.set('But A keeps v2. Nothing rolls it back.', 'warn');
              await v.sleep(1000);
              cap.set('A later read asks A and B.', 'info');
              await Promise.all(['A', 'B'].map((k) => st.send(reader, H[k], { label: 'get', kind: 'info', curve: curveR[k] })));
              await Promise.all(['A', 'B'].map((k) => st.send(H[k], reader, { label: 'v' + ver[k], kind: ver[k] === 2 ? 'good' : 'warn', curve: -curveR[k] })));
              sRead.set('v2', 'warn');
              cap.set('The read returns v2: the write that "failed".', 'warn');
              return;
            }
            cap.set('Write v2. It reaches A and B; C is slow.', 'info');
            await Promise.all(['A', 'B', 'C'].map((k) => st.send(writer, H[k], { label: 'v2', kind: 'data', curve: curveW[k], drop: k === 'C' ? 0.8 : false })));
            ver.A = 2;
            ver.B = 2;
            up('A');
            up('B');
            up('C');
            sCopies.set('2', 'good');
            cap.set('w = 2 acks. Quorum met.', 'good');
            await v.sleep(1100);
            H.B.set({ kind: 'bad', down: true, sub: 'disk died' });
            cap.set("B's disk dies. It gets rebuilt from C's copy.", 'bad');
            await v.sleep(900);
            await st.send(H.C, H.B, { label: 'v1 copy', kind: 'warn' });
            ver.B = 1;
            H.B.set({ down: false });
            up('B');
            sCopies.set('1', 'bad');
            cap.set('Now only A has v2: fewer than w copies.', 'bad');
            await v.sleep(900);
            await readBC('A read asks B and C.');
            cap.set('Stale, even though w + r > n.', 'bad');
          }
          run();
        },
      },

      /* 13 ─────────────────────────────────────────────── */
      {
        title: 'Concurrent writes: siblings beat last-write-wins',
        caption: 'Writes are concurrent when neither knew of the other. Last-write-wins keeps one and silently drops the rest; version numbers keep both as siblings.',
        problem: 'Last write wins loses data',
        fix: 'Version numbers + siblings',
        tags: ['Cassandra (LWW)', 'Riak siblings'],
        demo(el, v) {
          const box = v.wrap(el);
          const mode = v.segmented(box, {
            options: [{ value: 'lww', label: 'Last write wins', kind: 'bad' }, { value: 'ver', label: 'Version numbers', kind: 'good' }],
            value: 'lww',
            onChange: reset,
          });
          const st = v.stage(box, { w: 560, h: 265 });
          const P = {
            zoe: st.node({ x: 55, y: 62, w: 52, h: 52, shape: 'person', label: 'Zoe', kind: 'info' }),
            max: st.node({ x: 55, y: 192, w: 52, h: 52, shape: 'person', label: 'Max', kind: 'data' }),
          };
          const srv = st.node({ x: 222, y: 127, w: 112, label: 'Server', sub: 'key: gear', kind: 'primary', shape: 'db' });
          st.link(P.zoe, srv, { both: true, thin: true });
          st.link(P.max, srv, { both: true, thin: true });
          const seenT = { zoe: st.text(55, 118, '', { size: 12, mono: true, kind: 'muted' }), max: st.text(55, 248, '', { size: 12, mono: true, kind: 'muted' }) };
          st.text(440, 22, 'values stored for "gear"', { size: 12, kind: 'muted' });
          const stats = v.row(box, { center: true });
          const sSib = v.stat(stats, 'siblings', '0', 'info');
          const sLost = v.stat(stats, 'items lost', '0', 'good');
          const cap = v.caption(box, '');
          v.controls(box, [
            { label: 'Zoe adds', icon: '＋', onClick: () => solo('zoe') },
            { label: 'Max adds', icon: '＋', onClick: () => solo('max') },
            { label: 'Play a race', icon: '▶', kind: 'primary', onClick: race },
            { label: 'Reset', icon: '↺', kind: 'ghost', onClick: reset },
          ]);
          const POOL = { zoe: ['tent', 'map', 'food', 'cup', 'axe'], max: ['rope', 'lamp', 'soap', 'pan', 'hat'] };
          const NAME = { zoe: 'Zoe', max: 'Max' };
          let sver, sibs, cl, added, idx, drawn = [];

          function drawSibs(list, fresh, doomed) {
            drawn.forEach((d) => d.remove());
            drawn = [];
            list.forEach((s, k) => {
              const kind = doomed && doomed.includes(s) ? 'bad' : s === fresh ? 'good' : list.length > 1 ? 'warn' : 'neutral';
              drawn.push(st.rect(318, 38 + k * 56, 232, 44, { kind, rx: 8, label: `v${s.ver}  ${s.items.join(' ')}`, size: 13, mono: true }));
            });
          }
          function paintStats() {
            const have = uniq([].concat(...sibs.map((s) => s.items)));
            const lost = added.filter((x) => !have.includes(x));
            sSib.set(String(sibs.length), sibs.length > 1 ? 'warn' : 'info');
            sLost.set(String(lost.length), lost.length ? 'bad' : 'good');
            return lost;
          }
          function paintSeen(who) { seenT[who].set(cl[who].seen ? `saw v${cl[who].seen}` : 'saw nothing'); }
          function reset() {
            v.restart();
            st.clearPackets();
            sver = 0;
            sibs = [];
            cl = { zoe: { seen: 0, vals: [] }, max: { seen: 0, vals: [] } };
            added = [];
            idx = { zoe: 0, max: 0 };
            drawSibs(sibs);
            paintSeen('zoe');
            paintSeen('max');
            paintStats();
            cap.set('Each client merges what it last saw, adds an item, writes back.', 'info');
          }
          async function step(who) {
            const other = who === 'zoe' ? 'max' : 'zoe';
            paintSeen(other);
            const c = cl[who];
            const item = POOL[who][idx[who]++ % POOL[who].length];
            if (!added.includes(item)) added.push(item);
            const merged = uniq([].concat(...c.vals, [item]));
            const basedOn = c.seen;
            const before = sibs.slice();
            const lww = mode.get() === 'lww';
            const dropped = lww ? before : before.filter((s) => s.ver <= basedOn);
            const kept = lww ? [] : before.filter((s) => s.ver > basedOn);
            sver++;
            const fresh = { ver: sver, items: merged };
            sibs = kept.concat([fresh]);
            c.seen = sver;
            c.vals = sibs.map((s) => s.items);
            drawSibs(before);
            cap.set(`${NAME[who]} writes [${merged.join(', ')}], based on v${basedOn}.`, 'info');
            await st.send(P[who], srv, { label: `+${item} @v${basedOn}`, kind: who === 'zoe' ? 'info' : 'data' });
            drawSibs(before, null, dropped);
            if (lww) cap.set(before.length ? 'Last write wins: everything stored before is replaced.' : 'First write: stored as v1.', before.length ? 'bad' : 'good');
            else {
              const parts = [];
              if (dropped.length) parts.push(`${dropped.map((s) => 'v' + s.ver).join(', ')} already seen: overwrite`);
              if (kept.length) parts.push(`${kept.map((s) => 'v' + s.ver).join(', ')} concurrent: keep`);
              cap.set(parts.length ? parts.join('. ') + '.' : 'First write: stored as v1.', kept.length ? 'warn' : 'good');
            }
            await v.sleep(900);
            drawSibs(sibs, fresh);
            const lost = paintStats();
            await st.send(srv, P[who], { label: `v${sver} · ${plural(sibs.length, 'value')}`, kind: 'good' });
            paintSeen(who);
            if (lww && lost.length) cap.set(`Silently lost: ${lost.join(', ')}. Nobody was told.`, 'bad');
          }
          async function solo(who) {
            v.restart();
            st.clearPackets();
            await step(who);
          }
          async function race() {
            reset();
            for (const who of ['zoe', 'max', 'zoe', 'max', 'zoe']) {
              await step(who);
              await v.sleep(400);
            }
            const lost = paintStats();
            cap.set(lost.length ? `LWW dropped ${lost.join(', ')}. Try version numbers.` : 'Nothing lost. The next reader merges the siblings.', lost.length ? 'bad' : 'good');
          }
          reset();
        },
      },

      /* 14 ─────────────────────────────────────────────── */
      {
        title: 'Version vectors: one counter per replica',
        caption: 'Each replica counts its own writes. If one vector dominates, overwrite; if neither does, keep siblings. Merge siblings by union, with tombstones for removals.',
        problem: 'Removed items come back',
        fix: 'Tombstones',
        tags: ['Riak', 'Dynamo', 'Voldemort'],
        demo(el, v) {
          const box = v.wrap(el);
          const tomb = v.toggle(box, { label: 'Tombstones for removals', value: false, onChange: story });
          const st = v.stage(box, { w: 560, h: 290 });
          const c1 = st.node({ x: 38, y: 48, w: 44, h: 44, shape: 'person', label: 'App', kind: 'info' });
          const c2 = st.node({ x: 522, y: 48, w: 44, h: 44, shape: 'person', label: 'App', kind: 'info' });
          const RN = [
            st.node({ x: 160, y: 48, w: 132, label: 'Replica 1', shape: 'db', kind: 'primary' }),
            st.node({ x: 400, y: 48, w: 132, label: 'Replica 2', shape: 'db', kind: 'primary' }),
          ];
          st.link(c1, RN[0], { thin: true });
          st.link(c2, RN[1], { thin: true });
          st.link(RN[0], RN[1], { dashed: true, both: true, label: 'sync' });
          const cmpT = st.text(280, 226, '', { size: 13, kind: 'text2', bold: true });
          const unionT = st.text(280, 256, '', { size: 13, mono: true, kind: 'text', bold: true });
          const cap = v.caption(box, '');
          v.controls(box, [
            { label: 'Add via R1', icon: '＋', onClick: () => manual(() => op(0, 'add')) },
            { label: 'Add via R2', icon: '＋', onClick: () => manual(() => op(1, 'add')) },
            { label: 'Remove via R1', icon: '−', onClick: () => manual(() => op(0, 'remove')) },
            { label: 'Sync', icon: '⇄', onClick: () => manual(syncFlow) },
            { label: 'Replay story', icon: '▶', kind: 'primary', onClick: story },
          ]);
          const POOL = [['egg', 'fig'], ['bread', 'rice']];
          const vvStr = (vv) => `[R1:${vv[0]} R2:${vv[1]}]`;
          const leq = (a, b) => a[0] <= b[0] && a[1] <= b[1];
          const same = (a, b) => a[0] === b[0] && a[1] === b[1];
          const clone = (s) => ({ vv: s.vv.slice(), items: s.items.slice(), tombs: s.tombs.slice() });
          let R, removed, idx, drawn = [];

          function mergeSibs(sibs) {
            const items = uniq([].concat(...sibs.map((s) => s.items)));
            const tombs = uniq([].concat(...sibs.map((s) => s.tombs)));
            return { items: items.filter((x) => !tombs.includes(x)), tombs };
          }
          function init() {
            const s0 = { vv: [1, 0], items: ['tea', 'jam'], tombs: [] };
            R = [{ ctr: 1, sibs: [clone(s0)] }, { ctr: 0, sibs: [clone(s0)] }];
            removed = [];
            idx = [0, 0];
          }
          function draw() {
            drawn.forEach((d) => d.remove());
            drawn = [];
            R.forEach((rep, ri) => {
              const x0 = ri ? 290 : 30;
              const many = rep.sibs.length > 1;
              rep.sibs.forEach((s, k) => {
                const y0 = 96 + k * 58;
                drawn.push(st.rect(x0, y0, 240, 48, { kind: many ? 'warn' : 'good', rx: 8 }));
                drawn.push(st.text(x0 + 120, y0 + 15, vvStr(s.vv), { size: 12, mono: true, kind: 'text2' }));
                const words = s.items.concat(s.tombs.map((t) => '✕' + t));
                drawn.push(st.text(x0 + 120, y0 + 34, words.join(' ') || '(empty)', { size: 13, mono: true, kind: 'text', bold: true }));
              });
              RN[ri].set({ sub: plural(rep.sibs.length, 'sibling'), kind: many ? 'warn' : 'primary' });
            });
            const at = R[1].sibs.length > R[0].sibs.length ? 1 : 0;
            const sibs = R[at].sibs;
            if (sibs.length > 1) cmpT.set(`R${at + 1}: ${vvStr(sibs[0].vv)} vs ${vvStr(sibs[1].vv)}: concurrent`, 'warn');
            else cmpT.set('one version per replica: nothing to merge', 'muted');
            const m = mergeSibs(sibs);
            const zombies = m.items.filter((x) => removed.includes(x));
            unionT.set(`R${at + 1} merged view: ${m.items.join(' ') || '(empty)'}` + (zombies.length ? `  ← ${zombies.join(', ')} is back!` : ''), zombies.length ? 'bad' : 'good');
          }
          function applyWrite(ri, kind) {
            const rep = R[ri];
            const m = mergeSibs(rep.sibs);
            const ctx = [0, 1].map((j) => Math.max(0, ...rep.sibs.map((s) => s.vv[j])));
            let items = m.items.slice();
            const tombs = m.tombs.slice();
            let note;
            if (kind === 'add') {
              const item = POOL[ri][idx[ri]];
              if (!item) return null;
              idx[ri]++;
              items.push(item);
              note = '+' + item;
            } else {
              const x = items[0];
              if (!x) return null;
              items = items.slice(1);
              if (tomb.get()) tombs.push(x);
              removed.push(x);
              note = '−' + x;
            }
            rep.ctr = Math.max(rep.ctr, ctx[ri]) + 1;
            const vv = ctx.slice();
            vv[ri] = rep.ctr;
            rep.sibs = [{ vv, items, tombs }];
            return note;
          }
          async function op(ri, kind) {
            const before = R[ri].sibs.length;
            const note = applyWrite(ri, kind);
            if (!note) { cap.set('Nothing left to do here. Replay the story.', 'info'); return; }
            cap.set(`App writes ${note} via Replica ${ri + 1}${before > 1 ? ', merging siblings' : ''}.`, 'info');
            await st.send(ri ? c2 : c1, RN[ri], { label: note, kind: kind === 'add' ? 'data' : 'warn' });
            draw();
            cap.set(`Replica ${ri + 1} bumps its own counter: ${vvStr(R[ri].sibs[0].vv)}.`, 'info');
          }
          async function syncFlow() {
            const all = R[0].sibs.concat(R[1].sibs);
            const distinct = [];
            all.forEach((s) => { if (!distinct.some((d) => same(d.vv, s.vv))) distinct.push(s); });
            const keep = distinct.filter((s) => !distinct.some((o) => o !== s && leq(s.vv, o.vv) && !same(s.vv, o.vv)));
            R.forEach((rep, i) => { rep.sibs = keep.map(clone); rep.ctr = Math.max(rep.ctr, ...keep.map((s) => s.vv[i])); });
            cap.set('Replicas swap versions and compare vectors.', 'info');
            await Promise.all([st.send(RN[0], RN[1], { label: 'versions', kind: 'data', curve: 24 }), st.send(RN[1], RN[0], { label: 'versions', kind: 'data', curve: 24 })]);
            draw();
            cap.set(keep.length > 1 ? 'Neither vector dominates: concurrent. Keep both as siblings.' : 'One vector dominates: the newer version overwrites.', keep.length > 1 ? 'warn' : 'good');
          }
          async function manual(fn) {
            v.restart();
            st.clearPackets();
            draw();
            await fn();
          }
          async function story() {
            v.restart();
            st.clearPackets();
            init();
            draw();
            cap.set('Both replicas hold [tea, jam] at [R1:1 R2:0].', 'info');
            await v.sleep(1500);
            await op(0, 'remove');
            await v.sleep(900);
            await op(1, 'add');
            await v.sleep(900);
            await syncFlow();
            await v.sleep(1500);
            const zombies = mergeSibs(R[0].sibs).items.filter((x) => removed.includes(x));
            cap.set(zombies.length ? 'Union brings tea back: nothing recorded its removal. Turn on tombstones.' : 'The tombstone ✕tea survives the union, so tea stays gone.', zombies.length ? 'bad' : 'good');
          }
          init();
          draw();
          story();
        },
      },
    ],

    cheatsheet: [
      { term: 'Leader & followers', text: 'The leader takes all writes and streams its log. Followers apply it and serve reads.', kind: 'primary' },
      { term: 'Sync vs async', text: 'Sync waits for follower acks: safe, slow. Async: fast, may lose writes. Semi-sync: one sync follower.', kind: 'warn' },
      { term: 'New follower', text: 'Restore a snapshot, then replay the log from the snapshot’s position.', kind: 'info' },
      { term: 'Failover', text: 'Timeout, promote the most up-to-date follower, repoint clients. Fence the old leader with epochs.', kind: 'bad' },
      { term: 'Replication logs', text: 'Statements (non-deterministic), WAL (storage-coupled), logical rows (portable), triggers (flexible).', kind: 'data' },
      { term: 'Eventual consistency', text: 'Followers lag but catch up once writes stop. How long is unbounded.', kind: 'warn' },
      { term: 'Read-your-writes', text: 'Read data you edited from the leader, or from a replica caught up to your write.', kind: 'good' },
      { term: 'Monotonic reads', text: 'Send each user to the same replica so time never rewinds.', kind: 'good' },
      { term: 'Consistent prefix', text: 'Keep causally related writes in one partition, or use transactions.', kind: 'good' },
      { term: 'Multi-leader', text: 'A leader per datacenter or device: local writes, async sync, conflicts.', kind: 'info' },
      { term: 'Conflict handling', text: 'Avoid with a home leader, or converge: LWW (loses data), merge, or keep both.', kind: 'bad' },
      { term: 'Quorum', text: 'n replicas; wait for w write acks and r read replies. w + r > n means overlap.', kind: 'primary' },
      { term: 'Sloppy quorum', text: 'Stand-in nodes accept writes; hinted handoff returns them home later.', kind: 'warn' },
      { term: 'Version vectors', text: 'A counter per replica. Dominates: overwrite. Neither: concurrent siblings to merge.', kind: 'data' },
    ],

    quiz: [
      {
        q: 'Async replication. The leader crashes right after confirming a write. What can happen?',
        options: ['The confirmed write is lost', 'The write is applied twice', 'All followers block forever'],
        answer: 0,
        why: 'The write may exist only on the dead leader, so a promoted follower never saw it.',
      },
      {
        q: 'n = 5 and w = 3. What is the smallest r that guarantees reading the latest write?',
        options: ['2', '3', '5'],
        answer: 1,
        why: '3 + 3 = 6 > 5, so every read set shares a replica with every write set.',
      },
      {
        q: 'A user sees a new comment, refreshes, and it is gone. Which guarantee is missing?',
        options: ['Read-your-writes', 'Consistent prefix reads', 'Monotonic reads'],
        answer: 2,
        why: 'The second read hit a staler replica. Pinning the user to one replica prevents it.',
      },
      {
        q: 'Why not make the failover timeout very short?',
        options: ['A slow but alive leader triggers needless failovers', 'Elections need a long time to count votes', 'Followers replicate slower with short timeouts'],
        answer: 0,
        why: 'Load spikes or GC pauses look like death, and a returning leader risks split brain.',
      },
      {
        q: 'Version vectors [R1:2 R2:0] and [R1:1 R2:1]. What are they?',
        options: ['The first overwrites the second', 'Concurrent: keep both as siblings', 'The second overwrites the first'],
        answer: 1,
        why: 'Neither is ≥ the other in every entry, so neither write knew about the other.',
      },
    ],
  });
})();
