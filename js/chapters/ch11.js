/* Chapter 11 — Stream processing */
(function () {
  'use strict';
  const PROB = [{ value: 'bug', label: 'Problem', kind: 'bad' }, { value: 'fix', label: 'Fix', kind: 'good' }];
  const linear = (t) => t;
  // caption that only re-renders when the text or kind changes (no flicker in live sims)
  const narrator = (cap) => {
    let last = '';
    return (t, k) => { const key = t + '|' + (k || ''); if (key !== last) { last = key; cap.set(t, k); } };
  };

  DDIA.chapter({
    id: 11,
    part: 3,
    title: 'Stream processing',
    short: 'Streams',
    tagline: 'Unbounded data, processed as it happens',
    cards: [
      /* 1 ─────────────────────────────────────────────── */
      {
        title: 'Poll, push directly, or use a broker?',
        caption: 'Polling wastes requests and adds delay. Direct pushes vanish while a consumer is away. A broker holds events until it returns.',
        problem: 'Consumer offline',
        fix: 'Message broker',
        tags: ['Webhooks', 'UDP multicast', 'RabbitMQ', 'ZeroMQ'],
        demo(el, v) {
          const box = v.wrap(el);
          const top = v.row(box);
          const mode = v.segmented(top, {
            options: [{ value: 'poll', label: 'Poll a table' }, { value: 'direct', label: 'Direct push' }, { value: 'broker', label: 'Broker' }],
            value: 'poll',
            onChange: reset,
          });
          const off = v.toggle(top, { label: 'Consumer offline', value: false, onChange: onOff });
          const st = v.stage(box, { w: 560, h: 210 });
          const prod = st.node({ x: 70, y: 105, w: 110, label: 'Producer', sub: 'web server', kind: 'info' });
          const mid = st.node({ x: 280, y: 105, w: 124, h: 60, label: 'Events', sub: 'table', shape: 'db' });
          const cons = st.node({ x: 490, y: 105, w: 110, label: 'Consumer', kind: 'primary' });
          st.link(prod, mid);
          st.link(mid, cons, { both: true });
          const direct = st.link(prod, cons, { dashed: true, label: 'push' });
          const stats = v.row(box, { center: true });
          const sGot = v.stat(stats, 'delivered', '0', 'good');
          const sLost = v.stat(stats, 'lost', '0', 'bad');
          const sEmpty = v.stat(stats, 'empty polls', '0', 'warn');
          const cap = v.caption(box, '');
          const say = narrator(cap);
          let n = 0, s = {}, queue = [], busy = false, polling = false;

          function paint() {
            sGot.set(String(s.got), 'good');
            sLost.set(String(s.lost), s.lost ? 'bad' : 'neutral');
            sEmpty.set(String(s.empty), s.empty ? 'warn' : 'neutral');
            if (mode.get() !== 'direct') mid.set({ badge: queue.length ? String(queue.length) : '' });
          }
          function narrate() {
            const m = mode.get(), o = off.get();
            if (m === 'poll') say(o ? 'Consumer away. Rows wait safely in the table.' : 'Consumer asks every second. Most answers are empty.', o ? 'warn' : 'info');
            else if (m === 'direct') say(o ? 'Nobody is listening: pushed events are simply lost.' : 'Pushed straight to the consumer. Fast, no middleman.', o ? 'bad' : 'good');
            else say(o ? 'The broker queues events until the consumer returns.' : 'The broker pushes each event the moment it arrives.', o ? 'warn' : 'good');
          }
          function reset() {
            v.restart();
            st.clearPackets();
            n = 0; s = { got: 0, lost: 0, empty: 0 }; queue = []; busy = false; polling = false;
            const m = mode.get();
            mid.show(m !== 'direct');
            direct.show(m === 'direct');
            if (m === 'poll') mid.set({ shape: 'db', label: 'Events', sub: 'table', kind: 'neutral', badge: '' });
            else mid.set({ shape: 'rect', label: 'Broker', sub: 'topic: clicks', kind: 'warn', badge: '' });
            sEmpty.el.style.display = m === 'poll' ? '' : 'none';
            onOff();
            paint();
          }
          function onOff() {
            const o = off.get();
            cons.set({ down: o, kind: o ? 'bad' : 'primary', sub: o ? 'offline' : '' });
            narrate();
            if (!o) deliver();
          }
          async function produce() {
            const m = mode.get();
            const id = 'e' + ++n;
            if (m === 'direct') {
              if (off.get()) {
                await st.send(prod, cons, { label: id, kind: 'data', drop: 0.8, dur: 900 });
                s.lost++;
              } else {
                await st.send(prod, cons, { label: id, kind: 'data', dur: 900 });
                s.got++;
              }
              paint();
              return;
            }
            await st.send(prod, mid, { label: id, kind: 'data', dur: 650 });
            queue.push(id);
            paint();
            if (m === 'broker') deliver();
          }
          async function deliver() {
            if (busy || off.get() || mode.get() !== 'broker') return;
            busy = true;
            while (queue.length && !off.get()) {
              const id = queue.shift();
              paint();
              await st.send(mid, cons, { label: id, kind: 'data', dur: 550 });
              s.got++;
              paint();
            }
            busy = false;
          }
          async function poll() {
            if (mode.get() !== 'poll' || off.get() || polling) return;
            polling = true;
            await st.send(cons, mid, { label: '?', kind: 'info', dur: 450 });
            const got = queue.splice(0);
            paint();
            if (got.length) {
              await st.send(mid, cons, { label: got.join(' '), kind: 'data', dur: 450 });
              s.got += got.length;
            } else {
              await st.send(mid, cons, { label: '∅', kind: 'ghost', dur: 450 });
              s.empty++;
            }
            polling = false;
            paint();
          }
          reset();
          produce();
          v.every(1700, produce);
          v.every(1000, poll);
        },
      },

      /* 2 ─────────────────────────────────────────────── */
      {
        title: 'Producer too fast? Drop, queue or push back',
        caption: 'When producers outrun consumers you must drop messages, queue them, or block the producer. A queue kept only in memory dies with the broker.',
        problem: 'Overload, then a broker crash',
        fix: 'Backpressure or a queue on disk',
        tags: ['TCP', 'Unix pipes', 'StatsD'],
        demo(el, v) {
          const box = v.wrap(el);
          const pol = v.segmented(box, {
            options: [{ value: 'drop', label: 'Drop' }, { value: 'buffer', label: 'Buffer' }, { value: 'back', label: 'Backpressure' }],
            value: 'buffer',
            onChange: reset,
          });
          const row = v.row(box);
          let rate = 4;
          v.slider(row, { label: 'Producer rate', min: 1, max: 6, value: 4, format: (x) => x + '/s', onInput: (x) => { rate = x; } });
          const disk = v.toggle(row, { label: 'Queue on disk', value: false, onChange: paint });
          v.controls(row, [{ label: 'Crash broker', icon: '✕', kind: 'danger', onClick: crash }]);
          const st = v.stage(box, { w: 560, h: 200 });
          const CAP = 8, SLOTS = 8, OOM = 22, CONS = 2;
          const prod = st.node({ x: 62, y: 100, w: 100, label: 'Producer', kind: 'info' });
          const cons = st.node({ x: 498, y: 100, w: 100, label: 'Consumer', sub: '2 msg/s', kind: 'primary' });
          const bBox = st.box(150, 40, 250, 120, { label: 'Broker', kind: 'warn', solid: true });
          const slotX = (i) => 170 + i * 27;
          const slots = Array.from({ length: SLOTS }, (_, i) => st.rect(slotX(i), 84, 22, 34, { kind: 'ghost', rx: 5 }));
          const more = st.text(275, 142, '', { size: 13, kind: 'muted', bold: true });
          const mem = st.text(390, 58, '', { size: 12, anchor: 'end', kind: 'muted', mono: true });
          st.line(113, 100, 164, 100, { arrow: true });
          st.line(388, 100, 445, 100, { arrow: true });
          const stats = v.row(box, { center: true });
          const sSent = v.stat(stats, 'sent', '0', 'info');
          const sDone = v.stat(stats, 'processed', '0', 'good');
          const sLost = v.stat(stats, 'lost', '0', 'bad');
          const sQ = v.stat(stats, 'queued', '0', 'warn');
          const cap = v.caption(box, '');
          const say = narrator(cap);
          let q = [], seq = 0, sent = 0, done = 0, lost = 0, pAcc = 0, cAcc = 0, down = false, blocked = false, note = null;

          function paint() {
            for (let i = 0; i < SLOTS; i++) {
              const has = i < q.length; // slot 0 = oldest, drawn at the right end
              slots[SLOTS - 1 - i].set({ kind: down ? 'ghost' : has ? 'data' : 'ghost' });
            }
            more.set(q.length > SLOTS ? '+' + (q.length - SLOTS) + ' more' : '', q.length > 14 ? 'bad' : 'muted');
            const onDisk = disk.get();
            mem.set(pol.get() === 'buffer' ? (onDisk ? 'on disk' : 'RAM ' + Math.min(100, Math.round((q.length / OOM) * 100)) + '%') : 'max ' + CAP, !onDisk && q.length > 14 ? 'bad' : 'muted');
            bBox.set({ kind: down ? 'bad' : 'warn', label: down ? 'Broker · crashed' : 'Broker' });
            prod.set({ kind: blocked ? 'warn' : 'info', sub: blocked ? 'blocked' : '' });
            sSent.set(String(sent), 'info');
            sDone.set(String(done), 'good');
            sLost.set(String(lost), lost ? 'bad' : 'neutral');
            sQ.set(String(q.length), q.length > CAP ? 'warn' : 'neutral');
            if (note) return say(note[0], note[1]);
            const p = pol.get();
            if (down) say('Broker is down. Nothing gets through.', 'bad');
            else if (rate <= CONS) say('The consumer keeps up. No pressure.', 'good');
            else if (p === 'drop') say('Queue full: new messages are thrown away.', 'bad');
            else if (p === 'back') say(blocked ? 'Queue full: the producer has to wait.' : 'The producer slows to the consumer\'s pace.', 'warn');
            else if (onDisk) say('The queue grows on disk. Safe, but a backlog.', 'warn');
            else say('The queue grows in memory. Try crashing the broker.', 'warn');
          }
          function reset() {
            v.restart();
            st.clearPackets();
            q = []; seq = 0; sent = 0; done = 0; lost = 0; pAcc = 0; cAcc = 0; down = false; blocked = false; note = null;
            paint();
          }
          function fail(msg) {
            lost += q.length;
            q = [];
            down = true;
            note = [msg, 'bad'];
            paint();
            v.after(1600, () => { down = false; note = null; paint(); });
          }
          function crash() {
            if (down) return;
            if (disk.get()) {
              down = true;
              note = ['Crashed, but the queue was on disk. Nothing lost.', 'good'];
              paint();
              v.after(1400, () => { down = false; note = null; paint(); });
            } else fail('Crash! Every queued message lived in RAM. All lost.');
          }
          function produce() {
            const p = pol.get();
            if (p === 'back' && q.length >= CAP) { blocked = true; return false; }
            blocked = false;
            const id = ++seq;
            sent++;
            if (down) {
              lost++;
              st.send(prod, { x: 170, y: 100 }, { dur: 300, kind: 'data', drop: 0.8 });
              return true;
            }
            if (p === 'drop' && q.length >= CAP) {
              lost++;
              st.send(prod, { x: 170, y: 100 }, { dur: 320, kind: 'bad', drop: 0.8 });
              return true;
            }
            q.push(id);
            st.send(prod, { x: slotX(SLOTS - Math.min(q.length, SLOTS)) + 11, y: 100 }, { dur: 300, kind: 'data' });
            if (p === 'buffer' && !disk.get() && q.length > OOM) fail('Out of memory! The broker died and took its queue.');
            return true;
          }
          function tick() {
            pAcc += rate / 10;
            if (pAcc >= 1) { if (produce()) pAcc -= 1; else pAcc = 1; }
            cAcc = Math.min(1, cAcc + CONS / 10);
            if (cAcc >= 1 && q.length && !down) {
              cAcc = 0;
              q.shift();
              done++;
              st.send({ x: slotX(SLOTS - 1) + 11, y: 100 }, cons, { dur: 280, kind: 'data' });
            }
            paint();
          }
          reset();
          v.every(100, tick);
        },
      },

      /* 3 ─────────────────────────────────────────────── */
      {
        title: 'Share the work, or everyone gets everything?',
        caption: 'Load balancing gives each message to one consumer; fan-out gives it to all. A crash plus redelivery can reorder messages.',
        problem: 'Consumer crashes mid-message',
        fix: 'Acks and redelivery',
        tags: ['AMQP', 'JMS', 'RabbitMQ'],
        demo(el, v) {
          const box = v.wrap(el);
          const top = v.row(box);
          const mode = v.segmented(top, {
            options: [{ value: 'lb', label: 'Load balance' }, { value: 'fan', label: 'Fan-out' }, { value: 'crash', label: 'Crash + redeliver', kind: 'bad' }],
            value: 'lb',
            onChange: run,
          });
          const acks = v.toggle(top, { label: 'Acks', value: true, onChange: run });
          const st = v.stage(box, { w: 560, h: 230 });
          const prod = st.node({ x: 62, y: 115, w: 104, label: 'Producer', kind: 'info' });
          const brk = st.node({ x: 240, y: 115, w: 116, h: 56, label: 'Broker', kind: 'warn' });
          const c1 = st.node({ x: 450, y: 50, w: 124, label: 'Consumer 1', kind: 'primary' });
          const c2 = st.node({ x: 450, y: 180, w: 124, label: 'Consumer 2', kind: 'primary' });
          st.link(prod, brk);
          st.link(brk, c1);
          st.link(brk, c2);
          const g = v.grid(box, 200);
          const t1 = v.tape(v.panel(g, 'Consumer 1 processed'));
          const t2 = v.tape(v.panel(g, 'Consumer 2 processed'));
          const cap = v.caption(box, '');
          v.controls(box, [{ label: 'Send m1–m5', icon: '▶', kind: 'primary', onClick: run }]);

          async function handle(c, t, id, kind = 'good') {
            await st.send(brk, c, { label: id, kind: 'data', dur: 550 });
            c.set({ sub: id + ' …' });
            await v.sleep(350);
            t.push({ text: id, kind });
            c.set({ sub: '' });
            if (acks.get()) await st.send(c, brk, { label: 'ack', kind: 'good', dur: 450 });
          }
          async function run() {
            v.restart();
            st.clearPackets();
            t1.set([]); t2.set([]);
            [c1, c2].forEach((c) => c.set({ down: false, kind: 'primary', sub: '' }));
            brk.set({ sub: '', kind: 'warn' });
            const m = mode.get();
            if (m !== 'crash') {
              cap.set(m === 'lb' ? 'Each message goes to one consumer. They share the work.' : 'Each message is copied to every consumer.', 'info');
              const jobs = [];
              for (let i = 1; i <= 5; i++) {
                const id = 'm' + i;
                await st.send(prod, brk, { label: id, kind: 'data', dur: 420 });
                if (m === 'lb') jobs.push(i % 2 ? handle(c1, t1, id) : handle(c2, t2, id));
                else jobs.push(handle(c1, t1, id), handle(c2, t2, id));
              }
              await Promise.all(jobs);
              cap.set(m === 'lb' ? 'Work split in two: twice the throughput.' : 'Both consumers saw all five, independently.', 'good');
              return;
            }
            cap.set('m1 and m2 are processed normally', 'info');
            await st.send(prod, brk, { label: 'm1', kind: 'data', dur: 400 });
            const j1 = handle(c1, t1, 'm1');
            await st.send(prod, brk, { label: 'm2', kind: 'data', dur: 400 });
            await Promise.all([j1, handle(c2, t2, 'm2')]);
            cap.set('Consumer 2 takes m3, consumer 1 takes m4', 'info');
            await st.send(prod, brk, { label: 'm3', kind: 'data', dur: 400 });
            await st.send(brk, c2, { label: 'm3', kind: 'data', dur: 500 });
            c2.set({ sub: 'm3 …' });
            await st.send(prod, brk, { label: 'm4', kind: 'data', dur: 400 });
            const j4 = handle(c1, t1, 'm4');
            await v.sleep(250);
            c2.set({ down: true, kind: 'bad', sub: 'crashed' });
            cap.set('Consumer 2 crashes before finishing m3!', 'bad');
            await j4;
            if (!acks.get()) {
              t2.push({ text: 'm3 ✕', kind: 'bad' });
              await st.send(prod, brk, { label: 'm5', kind: 'data', dur: 400 });
              await handle(c1, t1, 'm5');
              cap.set('No acks: the broker deleted m3 on delivery. It is lost.', 'bad');
              return;
            }
            brk.set({ sub: 'm3 not acked' });
            await v.sleep(500);
            cap.set('No ack for m3, so the broker redelivers it', 'warn');
            await handle(c1, t1, 'm3', 'warn');
            brk.set({ sub: '' });
            await st.send(prod, brk, { label: 'm5', kind: 'data', dur: 400 });
            await handle(c1, t1, 'm5');
            cap.set('Nothing lost, but consumer 1 saw m4 before m3: reordered.', 'warn');
          }
          run();
        },
      },

      /* 4 ─────────────────────────────────────────────── */
      {
        title: 'A partitioned log: one reader per partition',
        caption: 'A topic splits into append-only partitions. Each partition goes to exactly one consumer in the group, which reads it in offset order.',
        problem: 'A slow message blocks its partition',
        fix: 'Consumers up to the partition count',
        tags: ['Kafka', 'Kinesis', 'DistributedLog'],
        demo(el, v) {
          const box = v.wrap(el);
          const top = v.row(box);
          let n = 2;
          v.slider(top, { label: 'Consumers in group', min: 1, max: 4, value: 2, onInput: (x) => { n = x; assign(); } });
          v.controls(top, [{ label: 'Slow message → P0', icon: '⏸', kind: 'danger', onClick: () => { append(0, true); draw(); } }]);
          const st = v.stage(box, { w: 560, h: 270 });
          const P = 3, CELLS = 9, rowY = [70, 145, 220];
          const cx = (i) => 128 + i * 31;
          const prod = st.node({ x: 48, y: 145, w: 84, label: 'Producer', kind: 'info', size: 14 });
          st.text(128, 26, 'topic "clicks" · offsets →', { size: 12, anchor: 'start', kind: 'muted' });
          const cells = rowY.map((y, p) => {
            st.text(108, y, 'P' + p, { size: 14, bold: true, kind: 'text2' });
            return Array.from({ length: CELLS }, (_, i) => st.rect(cx(i), y - 15, 27, 30, { kind: 'ghost', label: '', size: 12, mono: true }));
          });
          const ptr = rowY.map((y) => st.text(cx(0) + 13, y + 26, '▲', { size: 12, kind: 'accent' }));
          const consY = { 1: [145], 2: [95, 195], 3: [70, 145, 220], 4: [48, 112, 176, 240] };
          const cons = [0, 1, 2, 3].map((c) => st.node({ x: 497, y: 145, w: 96, h: 40, label: 'C' + (c + 1), kind: 'primary' }));
          let links = [];
          const stats = v.row(box, { center: true });
          const sLag = rowY.map((_, p) => v.stat(stats, 'P' + p + ' lag', '0', 'good'));
          const cap = v.caption(box, '');
          const say = narrator(cap);
          const len = [0, 0, 0], off = [0, 0, 0], slow = [new Set(), new Set(), new Set()];
          let busy = [];
          const rr = [0, 0, 0, 0];
          const owner = (p) => p % Math.min(n, P); // round-robin: every partition has exactly one owner
          const mineOf = (c) => [0, 1, 2].filter((p) => owner(p) === c);

          function assign() {
            links.forEach((l) => l.remove());
            busy = []; // uncommitted work is redone by the partition's new owner
            cons.forEach((c, i) => {
              const on = i < n;
              c.show(on);
              if (on) c.moveTo(497, consY[n][i], true, 400);
            });
            links = [0, 1, 2].map((p) => st.link({ x: 412, y: rowY[p] }, cons[owner(p)], { dashed: true, thin: true }));
            draw();
          }
          function append(p, isSlow) {
            const o = len[p]++;
            if (isSlow) slow[p].add(o);
            const vis = Math.min(len[p], CELLS) - 1;
            st.send(prod, { x: cx(vis) + 13, y: rowY[p] }, { dur: 320, kind: isSlow ? 'bad' : 'data' });
          }
          function step(c) {
            const b = busy[c];
            if (b) {
              if (--b.left <= 0) {
                off[b.p]++;
                busy[c] = null;
                st.send({ x: 412, y: rowY[b.p] }, cons[c], { dur: 300, kind: 'bad' });
              }
              return;
            }
            const mine = mineOf(c);
            for (let k = 0; k < mine.length; k++) {
              const p = mine[(rr[c] + k) % mine.length];
              if (off[p] >= len[p]) continue;
              rr[c] = (rr[c] + k + 1) % mine.length;
              if (slow[p].has(off[p])) { busy[c] = { p, left: 7 }; return; }
              off[p]++;
              st.send({ x: 412, y: rowY[p] }, cons[c], { dur: 300, kind: 'data' });
              return;
            }
          }
          function draw() {
            for (let p = 0; p < P; p++) {
              const start = Math.max(0, len[p] - CELLS);
              const stuck = busy.some((b) => b && b.p === p);
              for (let i = 0; i < CELLS; i++) {
                const o = start + i;
                if (o >= len[p]) { cells[p][i].set({ kind: 'ghost', label: '', opacity: 1 }); continue; }
                const kind = (stuck && o === off[p]) || (slow[p].has(o) && o >= off[p]) ? 'bad' : o < off[p] ? 'neutral' : 'data';
                cells[p][i].set({ kind, label: String(o), opacity: o < off[p] ? 0.45 : 1 });
              }
              ptr[p].move(cx(Math.max(0, Math.min(CELLS, off[p] - start))) + 13, rowY[p] + 26);
              const lag = len[p] - off[p];
              sLag[p].set(String(lag), lag > 6 ? 'bad' : lag > 2 ? 'warn' : 'good');
            }
            cons.forEach((c, i) => {
              if (i >= n) return;
              const mine = mineOf(i);
              c.set({ kind: busy[i] ? 'bad' : mine.length ? 'primary' : 'ghost', sub: busy[i] ? 'slow…' : mine.length ? mine.map((p) => 'P' + p).join(' ') : 'idle' });
            });
            if (busy.some(Boolean)) say('Head-of-line blocking: one slow message stalls its partition.', 'bad');
            else if (n === 4) say('Only 3 partitions, so the 4th consumer sits idle.', 'warn');
            else if (n === 1) say('One consumer owns every partition and falls behind.', 'bad');
            else if (n === 2) say('C1 owns two partitions and lags. Add a consumer.', 'warn');
            else say('One partition each: everyone keeps up, in order.', 'good');
          }
          function tick() {
            for (let k = 0; k < 2; k++) append(Math.floor(Math.random() * P));
            for (let c = 0; c < Math.min(n, P); c++) step(c);
            draw();
          }
          assign();
          v.every(800, tick);
        },
      },

      /* 5 ─────────────────────────────────────────────── */
      {
        title: 'Brokers forget; logs let you rewind',
        caption: 'A classic broker deletes what it delivered. A log keeps messages in a huge on-disk ring buffer, so consumers can lag, catch up or replay.',
        problem: 'Slow consumer falls behind',
        fix: 'Watch lag, rewind the offset',
        tags: ['Kafka', 'RabbitMQ', 'tail -f'],
        demo(el, v) {
          const box = v.wrap(el);
          const top = v.row(box);
          const mode = v.segmented(top, { options: [{ value: 'mq', label: 'Classic broker' }, { value: 'log', label: 'Log broker' }], value: 'log', onChange: reset });
          let speed = 2;
          v.slider(top, { label: 'Consumer speed', min: 1, max: 8, value: 2, format: (x) => x * 25 + '%', onInput: (x) => { speed = x; } });
          const st = v.stage(box, { w: 560, h: 290 });
          const N = 12, C = { x: 185, y: 145 }, R = 110;
          const pos = (i, r = R) => { const a = -Math.PI / 2 + ((i % N) / N) * Math.PI * 2; return { x: C.x + Math.cos(a) * r, y: C.y + Math.sin(a) * r }; };
          const handW = st.line(C.x, C.y, C.x, C.y - 70, { kind: 'info', width: 3, arrow: true });
          const handR = st.line(C.x, C.y, C.x, C.y - 70, { kind: 'accent', width: 3, arrow: true });
          st.add('circle', { cx: C.x, cy: C.y, r: 6, class: 'vz-shape k-neutral' });
          const slots = Array.from({ length: N }, (_, i) => st.node(Object.assign(pos(i), { w: 38, h: 38, shape: 'circle', label: '', kind: 'ghost', size: 13 })));
          const prod = st.node({ x: 450, y: 55, w: 116, label: 'Producer', sub: '1 msg / tick', kind: 'info' });
          const cons = st.node({ x: 450, y: 235, w: 116, label: 'Consumer', kind: 'primary' });
          st.text(392, 128, '━ write head', { size: 13, anchor: 'start', kind: 'info', bold: true });
          st.text(392, 156, '━ read offset', { size: 13, anchor: 'start', kind: 'accent', bold: true });
          const stats = v.row(box, { center: true });
          const sLag = v.stat(stats, 'lag', '0', 'good');
          const sMiss = v.stat(stats, 'missed', '0', 'neutral');
          const sRep = v.stat(stats, 'replayed', '0', 'neutral');
          const cap = v.caption(box, '');
          const say = narrator(cap);
          v.controls(box, [
            { label: 'Rewind to oldest', icon: '⟲', kind: 'primary', onClick: rewind },
            { label: 'Reset', icon: '↺', kind: 'ghost', onClick: reset },
          ]);
          let head = 0, cOff = 0, acc = 0, missed = 0, replayed = 0, note = null, noteT = 0, missT = 0;

          function hand(line, i) { const p = pos(i, R * 0.62); line.set({ x2: p.x, y2: p.y }); }
          function draw() {
            const log = mode.get() === 'log';
            for (let i = 0; i < N; i++) {
              const o = log ? head - 1 - (((head - 1 - i) % N) + N) % N : cOff + (((i - cOff) % N) + N) % N;
              const exists = o >= 0 && o < head && (log ? o >= head - N : o >= cOff);
              const unread = exists && o >= cOff;
              slots[i].set({ label: exists ? String(o) : '', kind: !exists ? 'ghost' : unread ? 'data' : 'neutral', dim: exists && !unread });
            }
            hand(handW, head);
            hand(handR, cOff);
            const lag = head - cOff;
            sLag.set(log ? String(lag) : lag > N ? lag + ' (RAM)' : String(lag), lag >= N * 0.7 ? 'bad' : lag > 3 ? 'warn' : 'good');
            sMiss.set(String(missed), missed ? 'bad' : 'neutral');
            sRep.set(String(replayed), replayed ? 'good' : 'neutral');
            cons.set({ kind: missT > 0 ? 'bad' : 'primary', sub: missT > 0 ? 'skipped!' : '' });
            if (note && noteT > 0) return say(note[0], note[1]);
            if (log && missT > 0) say('Fell off the ring: old messages were overwritten unread.', 'bad');
            else if (speed >= 4) say(log ? 'Keeping up. Read messages stay on disk for replay.' : 'Keeping up. Each message is deleted once read.', log ? 'good' : 'info');
            else if (log && lag >= N * 0.6) say('Lag keeps growing. Alert someone before data is overwritten.', 'warn');
            else if (!log && lag > N) say('Slow reader: the broker\'s in-memory queue keeps growing.', 'warn');
            else say('The consumer is slower than the producer: lag grows.', 'warn');
          }
          function tick() {
            st.send(prod, pos(head), { dur: 260, kind: 'info' });
            head++;
            if (mode.get() === 'log' && cOff < head - N) { missed += head - N - cOff; cOff = head - N; missT = 4; }
            acc += speed / 4;
            let reads = 0;
            while (acc >= 1 && cOff < head && reads < 3) {
              acc -= 1;
              st.send(pos(cOff), cons, { dur: 260, kind: 'data' });
              cOff++;
              reads++;
            }
            if (cOff >= head) acc = 0;
            if (noteT > 0) noteT--;
            if (missT > 0) missT--;
            draw();
          }
          function rewind() {
            if (mode.get() === 'mq') {
              note = ['Nothing to rewind: delivered messages were deleted.', 'bad'];
            } else {
              const from = Math.max(0, head - N);
              replayed += cOff - from;
              note = ['Offset reset to ' + from + ': replaying everything still on disk.', 'good'];
              cOff = from;
              acc = 0;
            }
            noteT = 5;
            draw();
          }
          function reset() {
            v.restart();
            st.clearPackets();
            head = 0; cOff = 0; acc = 0; missed = 0; replayed = 0; note = null; noteT = 0; missT = 0;
            draw();
          }
          reset();
          v.every(420, tick);
        },
      },

      /* 6 ─────────────────────────────────────────────── */
      {
        title: 'Dual writes race; one ordered log fixes it',
        caption: 'Writing to the database and the index separately lets writes land in different orders. Feed every copy from the database\'s change log instead.',
        problem: 'Dual writes',
        fix: 'Change data capture',
        tags: ['Debezium', 'Maxwell', 'Kafka Connect', 'GoldenGate'],
        demo(el, v) {
          const box = v.wrap(el);
          const mode = v.segmented(box, {
            options: [{ value: 'race', label: 'Dual writes: race', kind: 'bad' }, { value: 'fail', label: 'Dual writes: crash', kind: 'bad' }, { value: 'cdc', label: 'Change log (CDC)', kind: 'good' }],
            value: 'race',
            onChange: run,
          });
          const st = v.stage(box, { w: 560, h: 280 });
          const cap = v.caption(box, '');
          v.controls(box, [{ label: 'Replay', icon: '▶', kind: 'primary', onClick: run }]);

          async function run() {
            v.restart();
            st.clear();
            const c1 = st.node({ x: 50, y: 60, w: 50, h: 50, shape: 'person', label: 'Client 1', kind: 'primary' });
            const c2 = st.node({ x: 50, y: 210, w: 50, h: 50, shape: 'person', label: 'Client 2', kind: 'info' });
            if (mode.get() === 'cdc') await cdc(c1, c2);
            else await dual(mode.get(), c1, c2);
          }
          async function dual(m, c1, c2) {
            const db = st.node({ x: 330, y: 60, w: 136, h: 58, label: 'Database', sub: 'X = 0', shape: 'db' });
            const ix = st.node({ x: 330, y: 210, w: 136, h: 58, label: 'Search index', sub: 'X = 0', shape: 'db' });
            [[c1, db], [c1, ix], [c2, db], [c2, ix]].forEach(([a, b]) => st.link(a, b, { thin: true, dashed: true }));
            const verdict = st.text(478, 135, '', { size: 18, bold: true });
            const put = (nd, x) => { nd.set({ sub: 'X = ' + x }); nd.flash(); };
            if (m === 'race') {
              cap.set('Both clients write X: first the DB, then the index', 'info');
              const a = (async () => {
                await st.send(c1, db, { label: 'X=A', dur: 700 });
                put(db, 'A');
                await st.send(c1, ix, { label: 'X=A', dur: 1700 });
                put(ix, 'A');
              })();
              const b = (async () => {
                await v.sleep(250);
                await st.send(c2, db, { label: 'X=B', dur: 700, kind: 'info' });
                put(db, 'B');
                await st.send(c2, ix, { label: 'X=B', dur: 600, kind: 'info' });
                put(ix, 'B');
              })();
              await Promise.all([a, b]);
              db.set({ kind: 'bad' });
              ix.set({ kind: 'bad' });
              verdict.set('B ≠ A', 'bad');
              cap.set('DB ends with B, index with A. No error, wrong forever.', 'bad');
            } else {
              c2.dim(true);
              cap.set('Client 1 writes the DB, then the index…', 'info');
              await st.send(c1, db, { label: 'X=A', dur: 700 });
              put(db, 'A');
              c1.set({ kind: 'bad', down: true });
              await st.send(c1, ix, { label: 'X=A', dur: 1000, drop: 0.45 });
              db.set({ kind: 'bad' });
              ix.set({ kind: 'bad' });
              verdict.set('A ≠ 0', 'bad');
              cap.set('The second write never landed. Fixing that needs atomic commit.', 'bad');
            }
          }
          async function cdc(c1, c2) {
            const db = st.node({ x: 180, y: 135, w: 124, h: 62, label: 'Database', sub: 'X = 0', shape: 'db', kind: 'primary' });
            st.text(318, 96, 'change log', { size: 13, kind: 'muted', bold: true });
            st.box(258, 110, 120, 50, { kind: 'data', rx: 10 });
            const outs = [['Search', 55], ['Cache', 135], ['Warehouse', 215]].map(([l, y]) => st.node({ x: 482, y, w: 130, h: 52, label: l, sub: 'X = 0', shape: 'db' }));
            st.link(c1, db, { thin: true });
            st.link(c2, db, { thin: true });
            outs.forEach((o) => st.link({ x: 382, y: 135 }, o, { dashed: true, thin: true }));
            const order = [];
            const write = async (c, x, kind, wait) => {
              await v.sleep(wait);
              await st.send(c, db, { label: 'X=' + x, dur: 700, kind });
              db.set({ sub: 'X = ' + x });
              db.flash();
              const i = order.push(x) - 1;
              await st.send(db, { x: 290 + i * 56, y: 135 }, { label: 'X=' + x, kind: 'data', dur: 450 });
              st.rect(266 + i * 56, 120, 48, 30, { kind: 'data', label: 'X=' + x, mono: true, size: 12 });
            };
            cap.set('Clients write only to the database', 'info');
            await Promise.all([write(c1, 'A', 'primary', 0), write(c2, 'B', 'info', 250)]);
            cap.set('Every copy reads the same log, in the same order', 'info');
            for (let i = 0; i < order.length; i++) {
              await Promise.all(outs.map((o, k) => v.sleep(k * 150)
                .then(() => st.send({ x: 382, y: 135 }, o, { label: 'X=' + order[i], kind: 'data', dur: 650 }))
                .then(() => o.set({ sub: 'X = ' + order[i] }))));
            }
            outs.forEach((o) => o.set({ kind: 'good' }));
            db.set({ kind: 'good' });
            cap.set('One order for everyone: every copy ends at X = B.', 'good');
          }
          run();
        },
      },

      /* 7 ─────────────────────────────────────────────── */
      {
        title: 'New consumer? Snapshot, or a compacted log',
        caption: 'Deleting old log entries loses keys. Start from a snapshot tied to a log offset, or compact the log to keep each key\'s latest value.',
        problem: 'Old log entries deleted',
        fix: 'Snapshot + offset, or compaction',
        tags: ['Kafka', 'Debezium', 'Bottled Water'],
        demo(el, v) {
          const box = v.wrap(el);
          const pol = v.segmented(box, {
            options: [{ value: 'trunc', label: 'Delete old entries', kind: 'bad' }, { value: 'snap', label: 'Snapshot + log', kind: 'good' }, { value: 'compact', label: 'Compact', kind: 'good' }],
            value: 'trunc',
            onChange: reset,
          });
          const st = v.stage(box, { w: 560, h: 120 });
          const db = st.node({ x: 75, y: 60, w: 124, h: 60, label: 'Database', shape: 'db', kind: 'primary' });
          const lg = st.node({ x: 280, y: 60, w: 144, h: 50, label: 'Change log', shape: 'pill', kind: 'data' });
          const nx = st.node({ x: 482, y: 60, w: 132, h: 60, label: 'New index', shape: 'db', kind: 'ghost' });
          st.link(db, lg);
          st.link(lg, nx, { dashed: true });
          const tape = v.tape(v.panel(box, 'Log · offset: key=value (grey = overwritten later)'));
          const g = v.grid(box, 200);
          const dbT = v.tape(v.panel(g, 'Database now'));
          const nT = v.tape(v.panel(g, 'New index, rebuilt'));
          const cap = v.caption(box, '');
          v.controls(box, [
            { label: 'Write', icon: '✎', onClick: write },
            { label: 'Delete a key', icon: '✕', kind: 'danger', onClick: del },
            { label: 'Clean up log', icon: '⚙', onClick: clean },
            { label: 'Build new index', icon: '▶', kind: 'primary', onClick: rebuild },
          ]);
          const KEYS = ['a', 'b', 'c', 'd'];
          const val = (x) => (x == null ? '∅' : x);
          let entries = [], next = 0, dbm = new Map(), snap = null;

          function paint() {
            const latest = new Map();
            entries.forEach((e) => latest.set(e.key, e.off));
            const list = [];
            if (snap) list.push({ text: '⚑ snapshot @' + snap.at, kind: 'primary' });
            entries.forEach((e) => list.push({ text: e.off + ': ' + e.key + '=' + val(e.val), kind: e.val == null ? 'bad' : latest.get(e.key) === e.off ? 'data' : 'neutral' }));
            tape.set(list.length ? list : [{ text: 'empty', kind: 'ghost' }]);
            dbT.set(dbm.size ? [...dbm.keys()].sort().map((k) => ({ text: k + '=' + dbm.get(k), kind: 'good' })) : [{ text: 'empty', kind: 'ghost' }]);
            lg.set({ sub: entries.length + ' entries' });
          }
          function showNew(t) { nT.set([...t.keys()].sort().map((k) => ({ text: k + '=' + t.get(k), kind: 'data' }))); }
          function reset() {
            v.restart();
            st.clearPackets();
            entries = [['a', 1], ['b', 1], ['c', 1], ['a', 2], ['c', 2], ['a', 3]].map(([key, x], off) => ({ off, key, val: x }));
            next = entries.length;
            dbm = new Map([['a', 3], ['b', 1], ['c', 2]]);
            snap = null;
            nT.set([]);
            nx.set({ kind: 'ghost', sub: '' });
            paint();
            cap.set('Write a few times, clean up the log, then build a new index.', 'info');
          }
          async function write() {
            const key = KEYS[Math.floor(Math.random() * KEYS.length)];
            const x = (dbm.get(key) || 0) + 1;
            dbm.set(key, x);
            const e = { off: next++, key, val: x };
            entries.push(e);
            paint();
            cap.set('Write ' + key + '=' + x + ', appended at offset ' + e.off, 'info');
            await st.send(db, lg, { label: key + '=' + x, kind: 'data', dur: 500 });
          }
          async function del() {
            const keys = [...dbm.keys()];
            if (!keys.length) { cap.set('Nothing left to delete. Write something first.', 'warn'); return; }
            const key = keys[Math.floor(Math.random() * keys.length)];
            dbm.delete(key);
            entries.push({ off: next++, key, val: null });
            paint();
            cap.set('Delete ' + key + ': a tombstone ' + key + '=∅ is appended', 'warn');
            await st.send(db, lg, { label: key + '=∅', kind: 'bad', dur: 500 });
          }
          function clean() {
            const p = pol.get();
            const before = entries.length;
            if (p === 'compact') {
              const latest = new Map();
              entries.forEach((e) => latest.set(e.key, e.off));
              entries = entries.filter((e) => latest.get(e.key) === e.off);
              cap.set('Compacted ' + before + ' → ' + entries.length + ' entries. Latest per key, offsets unchanged.', 'good');
            } else if (p === 'snap') {
              snap = { at: next, table: new Map(dbm) };
              entries = [];
              cap.set('Snapshot of the DB at offset ' + next + ', then older log deleted.', 'good');
            } else {
              entries = entries.slice(-3);
              cap.set('Deleted the ' + (before - entries.length) + ' oldest entries to free disk.', 'warn');
            }
            paint();
          }
          async function rebuild() {
            v.restart();
            st.clearPackets();
            const list = entries.slice();
            const s = snap;
            const t = new Map();
            nT.set([]);
            nx.set({ kind: 'warn', sub: 'reading…' });
            cap.set(s ? 'Load the snapshot, then apply the log after it' : 'A new consumer reads the log from the start', 'info');
            if (s) {
              await st.send(lg, nx, { label: '⚑ @' + s.at, kind: 'primary', dur: 600 });
              s.table.forEach((x, k) => t.set(k, x));
              showNew(t);
            }
            for (const e of list) {
              await st.send(lg, nx, { label: e.key + '=' + val(e.val), kind: e.val == null ? 'bad' : 'data', dur: 380 });
              if (e.val == null) t.delete(e.key);
              else t.set(e.key, e.val);
              showNew(t);
            }
            const keys = [...new Set([...dbm.keys(), ...t.keys()])].sort();
            let bad = 0;
            nT.set(keys.map((k) => {
              const ok = t.get(k) === dbm.get(k);
              if (!ok) bad++;
              return { text: k + '=' + (t.has(k) ? t.get(k) : '?'), kind: ok ? 'good' : 'bad' };
            }));
            if (!keys.length) nT.set([{ text: 'empty', kind: 'good' }]);
            nx.set({ kind: bad ? 'bad' : 'good', sub: bad ? bad + ' wrong' : 'complete' });
            cap.set(bad ? 'Old entries are gone, so the new index misses keys.' : s ? 'Snapshot plus the log after it: a complete copy.' : 'Reading the whole log rebuilt every key correctly.', bad ? 'bad' : 'good');
          }
          reset();
        },
      },

      /* 8 ─────────────────────────────────────────────── */
      {
        title: 'Commands can fail; events are facts',
        caption: 'A request is a command until it passes validation. Then it becomes an immutable event, and state is rebuilt by replaying events.',
        problem: 'An invalid event reaches the log',
        fix: 'Validate before appending',
        tags: ['Event Store', 'CQRS', 'DDD'],
        demo(el, v) {
          const box = v.wrap(el);
          const valid = v.toggle(box, { label: 'Validate commands first', value: true, onChange: reset });
          const st = v.stage(box, { w: 560, h: 240 });
          const ana = st.node({ x: 45, y: 60, w: 48, h: 48, shape: 'person', label: 'Ana', kind: 'primary' });
          const ben = st.node({ x: 45, y: 175, w: 48, h: 48, shape: 'person', label: 'Ben', kind: 'info' });
          const app = st.node({ x: 180, y: 118, w: 112, h: 56, label: 'App', sub: 'checks rules' });
          const log = st.node({ x: 322, y: 118, w: 104, h: 46, shape: 'pill', label: 'Event log', kind: 'data' });
          const VIEW = { x: 400, y: 118 };
          st.link(ana, app);
          st.link(ben, app);
          st.link(app, log);
          st.link(log, VIEW, { dashed: true });
          st.text(470, 26, 'Seats view', { size: 13, bold: true, kind: 'text2' });
          const seatXY = [[404, 58], [470, 58], [404, 150], [470, 150]];
          const seats = seatXY.map(([x, y], i) => {
            st.text(x + 29, y - 10, 'seat ' + (i + 1), { size: 12, kind: 'muted' });
            return st.rect(x, y, 58, 50, { kind: 'ghost', label: 'free', size: 13 });
          });
          const tape = v.tape(v.panel(box, 'Event log · append-only'));
          const cap = v.caption(box, '');
          v.controls(box, [
            { label: 'Ana books 2', icon: '✎', onClick: () => command('Ana', 'book', 2) },
            { label: 'Ben books 2', icon: '✎', onClick: () => command('Ben', 'book', 2) },
            { label: 'Ana cancels 2', icon: '✕', onClick: () => command('Ana', 'cancel', 2) },
            { label: 'Rebuild from log', icon: '⟲', kind: 'primary', onClick: rebuild },
          ]);
          let events = [];
          const word = (e) => e.who + (e.act === 'book' ? ' booked ' : ' canceled ') + e.seat;

          function derive(list) {
            const s = { 1: [], 2: [], 3: [], 4: [] };
            list.forEach((e) => {
              if (e.act === 'book') s[e.seat].push(e.who);
              else s[e.seat] = s[e.seat].filter((w) => w !== e.who);
            });
            return s;
          }
          function paintSeats(s) {
            seats.forEach((r, i) => {
              const o = s[i + 1];
              r.set({ kind: o.length > 1 ? 'bad' : o.length ? 'good' : 'ghost', label: o.length ? o.join('+') : 'free' });
            });
          }
          function paintLog(hi = -1) {
            tape.set(events.map((e, i) => ({ text: word(e), kind: i === hi ? 'primary' : e.bad ? 'bad' : e.act === 'book' ? 'data' : 'warn' })));
          }
          function reset() {
            v.restart();
            st.clearPackets();
            events = [{ who: 'Cara', act: 'book', seat: 3 }];
            app.set({ kind: 'neutral' });
            paintLog();
            paintSeats(derive(events));
            cap.set(valid.get() ? 'Try booking seat 2 twice.' : 'Validation is off. Try booking seat 2 twice.', valid.get() ? 'info' : 'warn');
          }
          async function command(who, act, seat) {
            v.restart();
            st.clearPackets();
            app.set({ kind: 'neutral' });
            paintSeats(derive(events));
            const node = who === 'Ana' ? ana : ben;
            const txt = act + ' ' + seat;
            cap.set(who + ' sends a command: ' + txt, 'info');
            await st.send(node, app, { label: txt, kind: 'info', dur: 600 });
            const cur = derive(events)[seat];
            let problem = null;
            if (act === 'book' && cur.length) problem = 'taken';
            if (act === 'cancel' && !cur.includes(who)) problem = 'not yours';
            if (problem && valid.get()) {
              app.set({ kind: 'bad' });
              await st.send(app, node, { label: '✕ ' + problem, kind: 'bad', dur: 600 });
              cap.set('Rejected. A failed command never becomes an event.', 'good');
              return;
            }
            app.set({ kind: 'good' });
            const ev = { who, act, seat, bad: !!problem };
            events.push(ev);
            await st.send(app, log, { label: word(ev), kind: problem ? 'bad' : 'data', dur: 650 });
            paintLog();
            await st.send(log, VIEW, { kind: 'data', dur: 350 });
            paintSeats(derive(events));
            if (problem) cap.set('No check: the log now holds an impossible fact. Consumers can\'t reject it.', 'bad');
            else cap.set('Accepted: the command became an immutable event.', 'good');
          }
          async function rebuild() {
            v.restart();
            st.clearPackets();
            app.set({ kind: 'neutral' });
            const list = events.slice();
            paintSeats(derive([]));
            cap.set('Wipe the view, then replay every event in order', 'info');
            await v.sleep(500);
            for (let i = 0; i < list.length; i++) {
              paintLog(i);
              await st.send(log, VIEW, { label: word(list[i]), kind: 'data', dur: 500 });
              paintSeats(derive(list.slice(0, i + 1)));
            }
            paintLog();
            cap.set('Same events, same order: exactly the same state.', 'good');
          }
          reset();
        },
      },

      /* 9 ─────────────────────────────────────────────── */
      {
        title: 'State is the sum of events so far',
        caption: 'Replay the log up to any moment to get the state at that moment. Many views, and bug fixes, come from the same immutable log.',
        problem: 'Buggy code overwrote the table',
        fix: 'Fix the code, replay the log',
        tags: ['CQRS', 'Datomic', 'git'],
        demo(el, v) {
          const box = v.wrap(el);
          const EV = [['+', 'Milk'], ['+', 'Eggs'], ['+', 'Tea'], ['−', 'Eggs'], ['+', 'Jam'], ['+', 'Eggs'], ['−', 'Tea'], ['+', 'Rice']];
          const top = v.row(box);
          let corrupt = false;
          const sl = v.slider(top, { label: 'Replay up to', min: 0, max: EV.length, value: EV.length, format: (x) => x + ' / ' + EV.length, onInput: () => draw(true) });
          const bug = v.toggle(top, { label: 'Bug: ignore removals', value: false, onChange: (b) => { if (b) corrupt = true; draw(false); } });
          const st = v.stage(box, { w: 560, h: 300 });
          const cap = v.caption(box, '');
          v.controls(box, [{ label: 'Reset', icon: '↺', kind: 'ghost', onClick: () => { corrupt = false; bug.set(false); sl.set(EV.length); draw(false); } }]);
          const px = (i) => 22 + i * 66;

          function fold(n, buggy) {
            const cart = new Map(), removed = [];
            EV.slice(0, n).forEach(([op, it]) => {
              if (op === '+') cart.set(it, (cart.get(it) || 0) + 1);
              else if (!buggy) {
                const q = (cart.get(it) || 0) - 1;
                if (q > 0) cart.set(it, q); else cart.delete(it);
                removed.push(it);
              }
            });
            return { cart, removed };
          }
          const itemsOf = (cart) => [...cart.entries()].map(([k, q]) => (q > 1 ? k + ' ×' + q : k));
          function column(x, title, items, kind, dim, empty) {
            st.box(x, 96, 170, 196, { label: title, kind: kind === 'bad' ? 'bad' : 'neutral', solid: true });
            if (!items.length) st.text(x + 85, 150, empty, { size: 13, kind: 'muted' });
            items.forEach((t, i) => st.rect(x + 15, 122 + i * 30, 140, 24, { kind, label: t, size: 13 }).set({ opacity: dim ? 0.35 : 1 }));
          }
          function draw(anim) {
            const n = sl.get(), b = bug.get();
            st.clear();
            st.text(22, 16, 'event log: the changes (derivative)', { size: 12, anchor: 'start', kind: 'muted' });
            EV.forEach(([op, it], i) => st.rect(px(i), 32, 60, 30, { kind: op === '+' ? 'data' : 'warn', label: op + it, size: 13, mono: true }).set({ opacity: i < n ? 1 : 0.3 }));
            const cx = n === 0 ? 16 : px(n) - 3;
            st.line(cx, 26, cx, 70, { kind: 'accent', width: 2.5 });
            st.text(Math.min(Math.max(cx, 60), 500), 82, 'replayed to here', { size: 12, kind: 'accent', bold: true });
            const now = fold(n, b);
            column(10, 'CART VIEW', itemsOf(now.cart), b ? 'bad' : 'good', false, 'empty');
            column(195, 'REMOVED ITEMS VIEW', now.removed, b ? 'bad' : 'info', false, b ? 'lost by bug' : 'none yet');
            const table = fold(EV.length, corrupt);
            column(380, 'MUTABLE TABLE', itemsOf(table.cart), corrupt ? 'bad' : 'neutral', n < EV.length, '');
            if (n < EV.length) st.text(465, 282, 'no history kept', { size: 12, kind: 'muted', bold: true });
            if (anim && n > 0) st.send({ x: px(n - 1) + 30, y: 64 }, { x: 95, y: 110 }, { dur: 450, kind: EV[n - 1][0] === '+' ? 'data' : 'warn', label: EV[n - 1][0] + EV[n - 1][1] });
            if (b) cap.set('Buggy code ignores removals. Every view is wrong.', 'bad');
            else if (corrupt) cap.set('Fixed and replayed: views are right. The overwritten table stays wrong.', 'warn');
            else if (n < EV.length) cap.set('State after ' + n + ' events: the log lets you time-travel.', 'info');
            else cap.set('Cart = sum of all events. Only the log remembers removals.', 'good');
          }
          draw(false);
        },
      },

      /* 10 ─────────────────────────────────────────────── */
      {
        title: 'What can you do with a stream?',
        caption: 'Search for event patterns, compute rolling statistics, keep a view up to date, or test every new event against stored queries.',
        tags: ['Esper', 'Flink', 'Kafka Streams', 'Spark Streaming'],
        demo(el, v) {
          const box = v.wrap(el);
          const mode = v.segmented(box, {
            options: [{ value: 'cep', label: 'Patterns (CEP)' }, { value: 'stats', label: 'Analytics' }, { value: 'view', label: 'Live view' }, { value: 'search', label: 'Stored search' }],
            value: 'cep',
            onChange: setup,
          });
          const st = v.stage(box, { w: 560, h: 240 });
          const cap = v.caption(box, '');
          const ctl = v.controls(box, [{ id: 'go', label: 'Trigger', icon: '✱', kind: 'danger', onClick: () => { if (S.inject) S.inject(); } }]);
          let S = {};
          const pick = (a) => a[Math.floor(Math.random() * a.length)];

          function base(query, sub) {
            st.clear();
            const src = st.node({ x: 55, y: 120, w: 92, h: 46, label: 'Events', shape: 'pill', kind: 'data' });
            const proc = st.node({ x: 215, y: 120, w: 136, h: 60, label: 'Processor', sub, kind: 'primary' });
            st.link(src, proc);
            st.text(215, 64, query, { size: 12, kind: 'accent', bold: true });
            return { src, proc };
          }
          const scenes = {
            cep() {
              const { src, proc } = base('rule: ✕ ✕ ✕ by one user', 'state machine');
              const out = st.node({ x: 470, y: 120, w: 120, h: 52, label: 'Alerts', kind: 'bad' });
              st.link(proc, out);
              const cnt = { ana: 0, ben: 0 };
              const stTxt = st.text(215, 176, '', { size: 12, kind: 'text2', mono: true });
              let alerts = 0, queue = [];
              const show = () => stTxt.set('ana ✕' + cnt.ana + '  ben ✕' + cnt.ben);
              show();
              cap.set('A stored pattern waits: three failed logins in a row.', 'info');
              return {
                label: 'Brute-force ben',
                inject() { queue.push('ben', 'ben', 'ben'); },
                async step() {
                  const forced = queue.shift();
                  const u = forced || pick(['ana', 'ben']);
                  const ok = forced ? false : Math.random() < 0.72;
                  await st.send(src, proc, { label: u + (ok ? ' ✓' : ' ✕'), kind: ok ? 'data' : 'warn', dur: 600 });
                  cnt[u] = ok ? 0 : cnt[u] + 1;
                  show();
                  if (cnt[u] >= 3) {
                    cnt[u] = 0;
                    show();
                    await st.send(proc, out, { label: 'ALERT ' + u, kind: 'bad', dur: 600 });
                    out.set({ badge: String(++alerts) });
                    cap.set('Pattern matched: the engine emits a complex event.', 'bad');
                  }
                },
              };
            },
            stats() {
              const { src, proc } = base('rate + rolling average', 'count per window');
              st.text(330, 36, 'requests per window', { size: 12, anchor: 'start', kind: 'muted' });
              st.line(326, 206, 552, 206, { width: 1 });
              st.link(proc, { x: 322, y: 120 });
              const hist = Array(8).fill(0);
              const bars = hist.map((_, i) => st.rect(330 + i * 28, 206, 22, 0, { kind: 'info', rx: 3 }));
              const avg = st.path('', { kind: 'warn', width: 2.5, layer: 'top' });
              const avgT = st.text(548, 60, 'avg', { size: 12, anchor: 'end', kind: 'warn', bold: true });
              let spike = 0;
              cap.set('Count requests per window, then smooth with a rolling average.', 'info');
              function paint() {
                let d = '';
                hist.forEach((c, i) => {
                  const h = c * 14;
                  bars[i].set({ y: 206 - h, h, kind: c > 6 ? 'bad' : 'info' });
                  const lo = Math.max(0, i - 3), win = hist.slice(lo, i + 1);
                  const a = win.reduce((s, x) => s + x, 0) / win.length;
                  d += (i ? 'L' : 'M') + (341 + i * 28) + ',' + (206 - a * 14);
                  if (i === 7) avgT.move(548, 196 - a * 14);
                });
                avg.set({ d });
              }
              paint();
              return {
                label: 'Traffic spike',
                inject() { spike = 2; },
                async step() {
                  const k = spike > 0 ? 9 : 1 + Math.floor(Math.random() * 3);
                  if (spike > 0) spike--;
                  await st.send(src, proc, { label: k + ' req', kind: k > 6 ? 'bad' : 'data', dur: 600 });
                  hist.shift();
                  hist.push(k);
                  paint();
                  cap.set(k > 6 ? 'Spike! The rolling average rises, but smoothly.' : 'Each bar is one window. The line averages the last four.', k > 6 ? 'warn' : 'info');
                },
              };
            },
            view() {
              const { src, proc } = base('SELECT post, count(*) …', 'GROUP BY post');
              st.text(335, 46, 'likes view (always current)', { size: 12, anchor: 'start', kind: 'muted' });
              st.link(proc, { x: 322, y: 120 });
              const posts = ['A', 'B', 'C'], cnt = { A: 0, B: 0, C: 0 };
              const rows = posts.map((p, i) => {
                const y = 80 + i * 46;
                st.text(335, y, 'post ' + p, { size: 13, anchor: 'start', kind: 'text2', bold: true });
                return { bar: st.rect(385, y - 11, 0, 22, { kind: 'good', rx: 4 }), num: st.text(392, y, '0', { size: 13, anchor: 'start', kind: 'text', mono: true }) };
              });
              let queue = [];
              cap.set('Every event updates the view. Readers never wait for a batch job.', 'info');
              return {
                label: '♥ ×5 for post C',
                inject() { for (let i = 0; i < 5; i++) queue.push('C'); },
                async step() {
                  const p = queue.shift() || pick(posts);
                  await st.send(src, proc, { label: '♥ ' + p, kind: 'data', dur: 550 });
                  cnt[p]++;
                  const i = posts.indexOf(p), w = Math.min(130, cnt[p] * 8);
                  await st.send(proc, { x: 385, y: 80 + i * 46 }, { kind: 'good', dur: 350 });
                  rows[i].bar.set({ w });
                  rows[i].num.move(392 + w, 80 + i * 46).set(String(cnt[p]));
                },
              };
            },
            search() {
              const { src, proc } = base('queries stored, docs flow past', '2 saved searches');
              st.text(215, 176, 'Ana: 2br ≤ €1000', { size: 12, kind: 'text2', mono: true });
              st.text(215, 196, 'Ben: any 3br', { size: 12, kind: 'text2', mono: true });
              const ana = st.node({ x: 480, y: 62, w: 48, h: 48, shape: 'person', label: 'Ana', kind: 'primary' });
              const ben = st.node({ x: 480, y: 172, w: 48, h: 48, shape: 'person', label: 'Ben', kind: 'info' });
              st.link(proc, ana, { dashed: true, thin: true });
              st.link(proc, ben, { dashed: true, thin: true });
              const LIST = [[1, 700], [2, 1250], [3, 1400], [1, 820], [2, 1100], [2, 980], [3, 1900]];
              let queue = [];
              cap.set('Searches are saved first. Each new listing runs past them.', 'info');
              return {
                label: 'List a 2br for €900',
                inject() { queue.push([2, 900]); },
                async step() {
                  const [br, eur] = queue.shift() || pick(LIST);
                  await st.send(src, proc, { label: br + 'br €' + eur, kind: 'data', dur: 600 });
                  const hits = [];
                  if (br === 2 && eur <= 1000) hits.push(ana);
                  if (br === 3) hits.push(ben);
                  if (!hits.length) { cap.set('No saved search matches. Nobody is bothered.', 'info'); return; }
                  cap.set('Match! Notified the moment the listing appears.', 'good');
                  await Promise.all(hits.map((h) => st.send(proc, h, { label: 'match', kind: 'good', dur: 550 })));
                },
              };
            },
          };
          let busy = false;
          function setup() {
            v.restart();
            st.clearPackets();
            busy = false;
            S = scenes[mode.get()]();
            ctl.set('go', { label: S.label });
          }
          async function tick() {
            if (busy || !S.step) return;
            busy = true;
            const my = S;
            await S.step();
            if (my === S) busy = false;
          }
          setup();
          v.every(1300, tick);
        },
      },

      /* 11 ─────────────────────────────────────────────── */
      {
        title: 'Event time vs processing time',
        caption: 'Bucket events by when they happened, not when they arrived. Otherwise restarts, late stragglers and wrong clocks distort the numbers.',
        problem: 'Delays reorder events',
        fix: 'Event timestamps, corrections, clock offsets',
        tags: ['watermarks', 'Flink', 'Beam', 'MillWheel'],
        demo(el, v) {
          const box = v.wrap(el);
          const top = v.row(box);
          const sc = v.segmented(top, {
            options: [{ value: 'restart', label: '① Restart' }, { value: 'late', label: '② Straggler' }, { value: 'clock', label: '③ Bad clock' }],
            value: 'restart',
            onChange: run,
          });
          const fix = v.segmented(top, { options: PROB, value: 'bug', onChange: run });
          const st = v.stage(box, { w: 560, h: 300 });
          const cap = v.caption(box, '');
          v.controls(box, [{ label: 'Replay', icon: '▶', kind: 'primary', onClick: run }]);
          const T = 8, X0 = 70, SX = 58, Y_HAP = 46, Y_ARR = 104, BASE = 272, UNIT = 13;
          const x = (t) => X0 + t * SX;

          function scenario(s) {
            const ev = [];
            if (s === 'restart') {
              let k = 0;
              for (let sec = 0; sec < T; sec++) {
                [0.2, 0.5, 0.8].forEach((f) => {
                  const te = sec + f;
                  const ta = te + 0.15 < 3 || te >= 5 ? te + 0.15 : 5.05 + k++ * 0.07; // down 3s..5s, then backlog
                  ev.push({ te, ta, ts: te });
                });
              }
            } else {
              for (let sec = 0; sec < T; sec++) [0.3, 0.7].forEach((f) => ev.push({ te: sec + f, ta: sec + f + 0.2, ts: sec + f }));
              if (s === 'late') ev.push({ te: 2.5, ta: 5.6, ts: 2.5, special: true });
              else ev.push({ te: 1.5, ta: 4.5, ts: 3.5, sent: 6.4, special: true }); // phone clock 2 s fast
            }
            return ev;
          }
          async function run() {
            v.restart();
            st.clear();
            const s = sc.get(), f = fix.get() === 'fix';
            const bucket = (e) => {
              if (s === 'restart') return Math.floor(f ? e.ts : e.ta);
              if (s === 'clock' && e.special) return Math.floor(f ? e.ts + (e.ta - e.sent) : e.ts);
              return Math.floor(e.ts);
            };
            st.text(4, Y_HAP, 'happened', { size: 12, anchor: 'start', kind: 'muted', bold: true });
            st.text(4, Y_ARR, 'arrived', { size: 12, anchor: 'start', kind: 'muted', bold: true });
            st.text(4, 150, 'count', { size: 12, anchor: 'start', kind: 'muted', bold: true });
            st.line(X0, Y_HAP, x(T), Y_HAP, { width: 1 });
            st.line(X0, Y_ARR, x(T), Y_ARR, { width: 1 });
            if (s === 'restart') st.rect(x(3), Y_ARR - 13, 2 * SX, 26, { kind: 'bad', label: 'processor down', size: 12 }).set({ opacity: 0.6 });
            for (let w = 0; w <= T; w++) {
              st.line(x(w), 128, x(w), BASE, { dashed: true, width: 1 });
              st.text(x(w), BASE + 16, w + 's', { size: 12, kind: 'muted', mono: true });
            }
            st.line(X0, BASE, x(T), BASE, { width: 1.5 });
            const counts = Array(T).fill(0), closed = Array(T).fill(false);
            const bars = counts.map((_, w) => st.rect(x(w) + 9, BASE, SX - 18, 0, { kind: 'data', rx: 3 }));
            const nums = counts.map((_, w) => st.text(x(w) + SX / 2, BASE - 10, '', { size: 13, bold: true, mono: true }));
            const bar = (w) => {
              bars[w].set({ y: BASE - counts[w] * UNIT, h: counts[w] * UNIT });
              nums[w].move(x(w) + SX / 2, BASE - counts[w] * UNIT - 10).set(String(counts[w]), 'text');
            };
            const mark = (w, str, kind) => st.text(x(w) + SX / 2, BASE - counts[w] * UNIT - 28, str, { size: 12, bold: true, kind, halo: true });
            const cursor = st.line(x(0), 26, x(0), BASE, { kind: 'accent', width: 2, layer: 'top' });
            const wmLine = s === 'late' ? st.line(x(0), Y_ARR + 16, x(0), BASE, { kind: 'warn', dashed: true, width: 2, layer: 'top' }) : null;
            const wmText = s === 'late' ? st.text(x(0), 120, 'watermark', { size: 12, kind: 'warn', bold: true, halo: true }) : null;
            const evs = scenario(s);
            const hap = evs.slice().sort((a, b) => a.te - b.te), arr = evs.slice().sort((a, b) => a.ta - b.ta);
            let ih = 0, ia = 0, maxTs = -1;

            function arrive(e) {
              const w = bucket(e);
              st.line(x(e.te), Y_HAP + 5, x(e.ta), Y_ARR - 5, { kind: e.special ? 'warn' : 'muted', width: e.special ? 2.5 : 1 });
              st.add('circle', { cx: x(e.ta), cy: Y_ARR, r: 5, class: 'vz-shape k-' + (e.special ? 'warn' : 'data') });
              maxTs = Math.max(maxTs, e.ts);
              if (s === 'clock' && e.special) {
                const t = f ? e.ts + (e.ta - e.sent) : e.ts;
                st.text(x(t), 22, f ? 'corrected ' + t.toFixed(1) + 's' : 'phone says ' + t + 's', { size: 12, kind: f ? 'good' : 'bad', bold: true, halo: true });
              }
              const to = { x: x(w) + SX / 2, y: BASE - counts[w] * UNIT - 6 };
              if (s === 'late' && closed[w]) {
                if (!f) {
                  st.send({ x: x(e.ta), y: Y_ARR }, to, { kind: 'bad', dur: 700, drop: 0.8 });
                  mark(w, '✕ dropped', 'bad');
                  return;
                }
                counts[w]++;
                bar(w);
                mark(w, '↻ re-sent', 'good');
                st.send({ x: x(e.ta), y: Y_ARR }, to, { kind: 'good', dur: 500 });
                return;
              }
              counts[w]++;
              bar(w);
              st.send({ x: x(e.ta), y: Y_ARR }, to, { kind: e.special ? 'warn' : 'data', dur: 350 });
            }
            cap.set(s === 'restart' ? 'Steady traffic. The processor is down from 3 s to 5 s.' : s === 'late' ? 'One event is stuck on a phone and arrives late.' : 'A phone whose clock runs 2 s fast sends an event late.', 'info');
            await v.tween(7000, (t) => {
              const now = t * T;
              cursor.set({ x1: x(now), x2: x(now) });
              while (ih < hap.length && hap[ih].te <= now) {
                const e = hap[ih++];
                st.add('circle', { cx: x(e.te), cy: Y_HAP, r: 5, class: 'vz-shape k-' + (e.special ? 'warn' : 'data') });
              }
              while (ia < arr.length && arr[ia].ta <= now) arrive(arr[ia++]);
              if (wmLine && maxTs > 1) {
                const wm = maxTs - 1;
                wmLine.set({ x1: x(wm), x2: x(wm) });
                wmText.move(x(wm), 120);
                for (let w = 0; w < T; w++) if (!closed[w] && wm >= w + 1) { closed[w] = true; bars[w].set({ kind: 'info' }); }
              }
            }, linear);
            const truth = Array(T).fill(0);
            evs.forEach((e) => { truth[Math.floor(e.te)]++; });
            let wrong = 0;
            bars.forEach((b, w) => { const ok = truth[w] === counts[w]; if (!ok) wrong++; b.set({ kind: ok ? 'good' : 'bad' }); });
            const msg = {
              restart: ['Bucketed by arrival: a fake dip, then a fake spike.', 'Bucketed by event time: the real, steady rate.'],
              late: ['Window 2 closed before its straggler came. Count too low.', 'Window 2 re-published with the straggler: correct.'],
              clock: ['Trusting the phone clock puts the event in window 3.', 'Offset = received − sent. Corrected, it lands in window 1.'],
            }[s];
            cap.set(msg[f ? 1 : 0], wrong ? 'bad' : 'good');
          }
          run();
        },
      },

      /* 12 ─────────────────────────────────────────────── */
      {
        title: 'Four ways to cut time into windows',
        caption: 'Tumbling windows tile time, hopping windows overlap, sliding windows glide along, and session windows close after a quiet gap.',
        tags: ['Flink', 'Kafka Streams', 'Beam', 'Azure Stream Analytics'],
        demo(el, v) {
          const box = v.wrap(el);
          const type = v.segmented(box, {
            options: [{ value: 'tumble', label: 'Tumbling' }, { value: 'hop', label: 'Hopping' }, { value: 'slide', label: 'Sliding' }, { value: 'session', label: 'Session' }],
            value: 'tumble',
            onChange: draw,
          });
          const row = v.row(box);
          let size = 4, gap = 2;
          const sizeS = v.slider(row, { label: 'Window length', min: 2, max: 5, value: 4, format: (x) => x + ' min', onInput: (x) => { size = x; draw(); } });
          const gapS = v.slider(row, { label: 'Session gap', min: 1, max: 4, value: 2, format: (x) => x + ' min', onInput: (x) => { gap = x; draw(); } });
          v.controls(row, [{ label: 'New events', icon: '↻', onClick: gen }]);
          const st = v.stage(box, { w: 560, h: 250 });
          const cap = v.caption(box, '');
          const T = 16, X0 = 30, SX = 31.25, AX = 214;
          const x = (t) => X0 + t * SX;
          const rowY = (r) => AX - 48 - r * 32;
          let evs = [0.5, 1.2, 1.9, 2.4, 5.1, 5.6, 6.2, 9.3, 9.8, 10.4, 11.1, 14.2, 14.8];
          const inWin = (a, b) => evs.filter((e) => e >= a && e < b).length;

          function gen() {
            const out = [];
            const clusters = 3 + Math.floor(Math.random() * 2);
            for (let c = 0; c < clusters; c++) {
              let t = 0.3 + (c / clusters) * T + Math.random() * 1.5;
              const k = 2 + Math.floor(Math.random() * 3);
              for (let i = 0; i < k; i++) { out.push(Math.min(15.7, t)); t += 0.4 + Math.random() * 0.9; }
            }
            out.sort((a, b) => a - b);
            evs = out.filter((e, i) => i === 0 || e - out[i - 1] >= 0.35);
            draw();
          }
          async function draw() {
            v.restart();
            st.clear();
            const t = type.get();
            sizeS.el.style.display = t === 'session' ? 'none' : '';
            gapS.el.style.display = t === 'session' ? '' : 'none';
            st.line(X0, AX, x(T) + 8, AX, { width: 1.5, arrow: true });
            for (let m = 0; m <= T; m += 2) {
              st.line(x(m), AX - 4, x(m), AX + 4, { width: 1 });
              st.text(x(m), AX + 18, String(m), { size: 12, kind: 'muted', mono: true });
            }
            st.text(556, AX + 18, 'min', { size: 12, anchor: 'end', kind: 'muted' });
            st.text(X0, 16, 'events (by event time) and their windows', { size: 12, anchor: 'start', kind: 'muted' });
            const dots = evs.map((e) => st.add('circle', { cx: x(e), cy: AX, r: 6, class: 'vz-shape k-data' }));
            const win = (a, b, r, kind) => {
              const n = inWin(a, b);
              return st.rect(x(a) + 1, rowY(r), Math.max(8, x(b) - x(a) - 2), 26, { kind, label: String(n), size: 13, mono: true, rx: 6 });
            };
            if (t === 'tumble') {
              let k = 0;
              for (let a = 0; a < T; a += size, k++) {
                const b = Math.min(T, a + size);
                win(a, b, 0, k % 2 ? 'info' : 'primary');
                evs.forEach((e, i) => { if (e >= a && e < b) dots[i].setAttribute('class', 'vz-shape k-' + (k % 2 ? 'info' : 'primary')); });
                await v.sleep(160);
              }
              cap.set('No overlap: every event lands in exactly one window.', 'info');
            } else if (t === 'hop') {
              for (let a = 0; a + size <= T; a++) {
                win(a, a + size, a % size, a % 2 ? 'info' : 'primary');
                await v.sleep(90);
              }
              cap.set(size + '-min windows starting every minute: each event counts up to ' + size + ' times.', 'info');
            } else if (t === 'slide') {
              const r = st.rect(x(0), rowY(0), size * SX, 26, { kind: 'warn', label: '0', size: 13, mono: true, rx: 6 });
              cap.set('The window glides along, always holding the last ' + size + ' minutes.', 'info');
              let best = 0;
              await v.tween(5000, (p) => {
                const end = size + p * (T - size), a = end - size;
                const n = inWin(a, end);
                best = Math.max(best, n);
                r.set({ x: x(a), label: String(n) });
                evs.forEach((e, i) => dots[i].setAttribute('class', 'vz-shape k-' + (e >= a && e < end ? 'warn' : 'data')));
              }, linear);
              cap.set('Peak: ' + best + ' events within any ' + size + '-minute stretch.', 'good');
            } else {
              const groups = [];
              evs.forEach((e) => { const g = groups[groups.length - 1]; if (g && e - g[g.length - 1] <= gap) g.push(e); else groups.push([e]); });
              for (let i = 0; i < groups.length; i++) {
                const g = groups[i];
                win(g[0] - 0.15, Math.min(T, g[g.length - 1] + gap), 0, i % 2 ? 'info' : 'good');
                await v.sleep(200);
              }
              cap.set(groups.length + ' sessions: each ends after ' + gap + ' quiet minute' + (gap > 1 ? 's' : '') + '.', 'info');
            }
          }
          draw();
        },
      },

      /* 13 ─────────────────────────────────────────────── */
      {
        title: 'Three ways to join streams',
        caption: 'Stream-stream joins pair events within a time window. Stream-table joins enrich events from a local table. Table-table joins maintain a view.',
        problem: 'Output depends on arrival order',
        fix: 'Keep join state; be explicit about time',
        tags: ['Kafka Streams', 'Flink', 'Samza'],
        demo(el, v) {
          const box = v.wrap(el);
          const mode = v.segmented(box, {
            options: [{ value: 'ss', label: 'Stream–stream' }, { value: 'st', label: 'Stream–table' }, { value: 'tt', label: 'Table–table' }],
            value: 'ss',
            onChange: run,
          });
          const row = v.row(box);
          let win = 2;
          const winS = v.slider(row, { label: 'Join window', min: 1, max: 5, value: 2, format: (x) => x + ' min', onInput: (x) => { win = x; run(); } });
          const first = v.toggle(row, { label: 'Profile update arrives first', value: false, onChange: run });
          const st = v.stage(box, { w: 560, h: 250 });
          const stats = v.row(box, { center: true });
          const sCtr = v.stat(stats, 'click-through rate', '—', 'info');
          const cap = v.caption(box, '');
          v.controls(box, [{ label: 'Replay', icon: '▶', kind: 'primary', onClick: run }]);

          async function run() {
            v.restart();
            st.clear();
            const m = mode.get();
            winS.el.style.display = m === 'ss' ? '' : 'none';
            first.el.style.display = m === 'st' ? '' : 'none';
            stats.style.display = m === 'ss' ? '' : 'none';
            if (m === 'ss') await ss();
            else if (m === 'st') await enrich();
            else await tables();
          }
          async function ss() {
            const X0 = 76, SX = 37, YS = 66, YC = 166, AX = 218;
            const x = (t) => X0 + t * SX;
            st.text(4, YS, 'searches', { size: 12, anchor: 'start', kind: 'muted', bold: true });
            st.text(4, YC, 'clicks', { size: 12, anchor: 'start', kind: 'muted', bold: true });
            st.line(X0, AX, x(12), AX, { width: 1.5 });
            for (let m = 0; m <= 12; m += 2) st.text(x(m), AX + 16, String(m), { size: 12, kind: 'muted', mono: true });
            st.text(556, AX + 16, 'min', { size: 12, anchor: 'end', kind: 'muted' });
            const S = [['s1', 0.5], ['s2', 2.5], ['s3', 4.5], ['s4', 7.5], ['s5', 9.5]];
            const C = [['s1', 1.2], ['s2', 6.0], ['s4', 7.9], ['s5', 11.8]];
            const sN = {}, matched = {};
            S.forEach(([id, t]) => { sN[id] = st.node({ x: x(t), y: YS, w: 40, h: 26, shape: 'pill', label: id, size: 13, kind: 'info' }).show(false); });
            const cN = C.map(([id, t]) => st.node({ x: x(t), y: YC, w: 40, h: 26, shape: 'pill', label: id, size: 13, kind: 'data' }).show(false));
            const cursor = st.line(x(0), 40, x(0), AX, { kind: 'accent', width: 2, layer: 'top' });
            let is = 0, ic = 0, hits = 0;
            sCtr.set('—', 'info');
            cap.set('The job buffers each search, waiting ' + win + ' min for its click.', 'info');
            await v.tween(6500, (p) => {
              const now = p * 12;
              cursor.set({ x1: x(now), x2: x(now) });
              while (is < S.length && S[is][1] <= now) {
                const [id, t] = S[is++];
                sN[id].show(true).flash();
                st.rect(x(t), YS + 17, Math.max(4, x(Math.min(12, t + win)) - x(t)), 8, { kind: 'info', rx: 4 }).set({ opacity: 0.55 });
              }
              while (ic < C.length && C[ic][1] <= now) {
                const [id, t] = C[ic];
                const node = cN[ic++];
                node.show(true);
                const ts = S.find((s) => s[0] === id)[1];
                if (t - ts <= win) {
                  matched[id] = true;
                  hits++;
                  sN[id].set({ kind: 'good' });
                  node.set({ kind: 'good' });
                  st.link(sN[id], node, { kind: 'good', arrow: false, label: '+' + (t - ts).toFixed(1) });
                  cap.set(id + ' matched: click came ' + (t - ts).toFixed(1) + ' min after the search.', 'good');
                } else {
                  node.set({ kind: 'bad' });
                  cap.set('Click for ' + id + ' came too late. Its search already expired.', 'bad');
                }
              }
              S.forEach(([id, t]) => { if (!matched[id] && now > t + win && sN[id].o.kind === 'info') sN[id].set({ kind: 'ghost' }); });
            }, linear);
            const rate = Math.round((hits / S.length) * 100);
            sCtr.set(rate + '%', rate >= 60 ? 'good' : 'warn');
            cap.set(hits + ' of 5 searches got a click within ' + win + ' min. Unclicked searches count too.', 'info');
          }
          async function enrich() {
            const clicks = st.node({ x: 72, y: 60, w: 112, h: 46, label: 'Clicks', shape: 'pill', kind: 'data' });
            const prof = st.node({ x: 72, y: 195, w: 120, h: 60, label: 'Profiles', sub: 'database', shape: 'db', kind: 'primary' });
            const job = st.node({ x: 280, y: 128, w: 150, h: 60, label: 'Join job', sub: 'local profile copy', kind: 'info' });
            const out = st.node({ x: 478, y: 60, w: 130, h: 46, label: 'Enriched', shape: 'pill', kind: 'good' });
            st.link(clicks, job);
            st.link(prof, job, { dashed: true, label: 'CDC' });
            st.link(job, out);
            const local = st.text(280, 178, 'ana → Rome', { size: 13, mono: true, kind: 'text2', bold: true });
            let city = 'Rome';
            const click = async (n) => {
              await st.send(clicks, job, { label: 'ana #' + n, kind: 'data', dur: 700 });
              const c = city;
              job.flash();
              await st.send(job, out, { label: 'ana·' + c, kind: 'good', dur: 600 });
              st.text(478, 102 + n * 24, 'click #' + n + ' · ' + c, { size: 13, mono: true, kind: c === 'Paris' ? 'good' : 'warn', bold: true });
            };
            const update = async () => {
              await st.send(prof, job, { label: 'ana: Paris', kind: 'primary', dur: 700 });
              city = 'Paris';
              local.set('ana → Paris', 'primary');
            };
            cap.set('Each click is enriched from a local copy of the profiles', 'info');
            await click(1);
            cap.set('Ana moves to Paris just as she clicks again…', 'warn');
            if (first.get()) await Promise.all([update(), v.sleep(250).then(() => click(2))]);
            else await Promise.all([click(2), v.sleep(250).then(update)]);
            await click(3);
            cap.set(first.get() ? 'Update arrived first, so click #2 says Paris. Flip the toggle.' : 'Click #2 arrived first, so it says Rome. Flip the toggle.', 'warn');
          }
          async function tables() {
            const tw = st.node({ x: 75, y: 60, w: 124, h: 50, label: 'Tweets', sub: 'changelog', shape: 'pill', kind: 'data' });
            const fo = st.node({ x: 75, y: 195, w: 124, h: 50, label: 'Follows', sub: 'changelog', shape: 'pill', kind: 'primary' });
            const job = st.node({ x: 280, y: 128, w: 144, h: 60, label: 'Timeline job', sub: 'follows: none', kind: 'info' });
            const tl = st.node({ x: 470, y: 70, w: 156, h: 56, label: 'Cara\'s timeline', shape: 'db', kind: 'good' });
            st.link(tw, job);
            st.link(fo, job);
            st.link(job, tl);
            const items = st.text(470, 126, '(empty)', { size: 14, mono: true, kind: 'muted', bold: true });
            const ben = [];
            let follows = false;
            const show = () => items.set(follows && ben.length ? ben.join('  ') : '(empty)', follows && ben.length ? 'good' : 'muted');
            cap.set('Ben tweets t1. Cara does not follow him yet.', 'info');
            await st.send(tw, job, { label: 'Ben: t1', kind: 'data', dur: 700 });
            ben.push('t1');
            job.flash();
            await v.sleep(600);
            cap.set('Cara follows Ben: his earlier tweets join her timeline.', 'info');
            await st.send(fo, job, { label: 'Cara → Ben', kind: 'primary', dur: 700 });
            follows = true;
            job.set({ sub: 'Cara → Ben' });
            await st.send(job, tl, { label: 't1', kind: 'good', dur: 600 });
            show();
            cap.set('New tweet × current follows: pushed straight to Cara.', 'info');
            await st.send(tw, job, { label: 'Ben: t2', kind: 'data', dur: 700 });
            ben.push('t2');
            await st.send(job, tl, { label: 't2', kind: 'good', dur: 600 });
            show();
            cap.set('Cara unfollows Ben: his tweets leave her timeline.', 'warn');
            await st.send(fo, job, { label: 'Cara ✕ Ben', kind: 'bad', dur: 700 });
            follows = false;
            job.set({ sub: 'follows: none' });
            await st.send(job, tl, { label: '− t1 t2', kind: 'bad', dur: 600 });
            show();
            cap.set('A cached join of two tables, kept fresh by both changelogs.', 'good');
          }
          run();
        },
      },

      /* 14 ─────────────────────────────────────────────── */
      {
        title: 'Crash mid-batch: counted once or twice?',
        caption: 'After a crash the processor restarts from its last checkpoint and redoes work. Storing the offset with each write makes the redo harmless.',
        problem: 'Replay double-counts',
        fix: 'Idempotent writes: offset stored with result',
        tags: ['Flink', 'Spark Streaming', 'Kafka', 'Trident'],
        demo(el, v) {
          const box = v.wrap(el);
          const idem = v.toggle(box, { label: 'Store offset with the count', value: false, onChange: reset });
          const st = v.stage(box, { w: 560, h: 250 });
          const N = 12, BATCH = 3;
          const cx = (i) => 26 + i * 44;
          st.text(26, 18, 'input log (offsets)', { size: 12, anchor: 'start', kind: 'muted', bold: true });
          const cells = Array.from({ length: N }, (_, i) => st.rect(cx(i), 32, 40, 30, { kind: 'data', label: String(i), mono: true, size: 13 }));
          const flagL = st.line(cx(0) - 2, 26, cx(0) - 2, 76, { kind: 'good', width: 3, layer: 'top' });
          const flagT = st.text(cx(0) - 2, 90, '⚑ checkpoint', { size: 12, anchor: 'start', kind: 'good', bold: true });
          const proc = st.node({ x: 150, y: 180, w: 150, h: 60, label: 'Processor', kind: 'primary' });
          const db = st.node({ x: 420, y: 180, w: 176, h: 70, label: 'Counter DB', sub: 'count = 0', shape: 'db' });
          st.link(proc, db);
          const stats = v.row(box, { center: true });
          const sMsg = v.stat(stats, 'distinct messages', '0', 'info');
          const sCnt = v.stat(stats, 'DB count', '0', 'good');
          const cap = v.caption(box, '');
          v.controls(box, [
            { label: 'Run batch', icon: '▶', kind: 'primary', onClick: () => batch(false) },
            { label: 'Crash mid-batch', icon: '✕', kind: 'danger', onClick: () => batch(true) },
            { label: 'Reset', icon: '↺', kind: 'ghost', onClick: reset },
          ]);
          let cp = 0, count = 0, lastOff = -1, seen = new Set(), running = false;

          function paint() {
            db.set({ sub: idem.get() ? 'count = ' + count + ' · last ' + (lastOff < 0 ? '–' : lastOff) : 'count = ' + count, kind: count > seen.size ? 'bad' : 'neutral' });
            sMsg.set(String(seen.size), 'info');
            sCnt.set(String(count), count > seen.size ? 'bad' : 'good');
            flagL.set({ x1: cx(cp) - 2, x2: cx(cp) - 2 });
            flagT.move(Math.min(cx(cp) - 2, 450), 90);
          }
          function reset() {
            v.restart();
            st.clearPackets();
            cp = 0; count = 0; lastOff = -1; seen = new Set(); running = false;
            cells.forEach((c) => c.set({ kind: 'data' }));
            proc.set({ down: false, kind: 'primary', sub: '' });
            paint();
            cap.set(idem.get() ? 'Each write stores the count and the offset together.' : 'Each message adds 1 to a counter in an external DB.', 'info');
          }
          async function process(o) {
            cells[o].set({ kind: 'warn' });
            await st.send({ x: cx(o) + 20, y: 64 }, proc, { label: String(o), kind: 'data', dur: 380 });
            const dup = idem.get() && o <= lastOff;
            await st.send(proc, db, { label: idem.get() ? '+1 @' + o : '+1', kind: dup ? 'warn' : 'data', dur: 450 });
            seen.add(o);
            if (dup) {
              cap.set('Offset ' + o + ' already applied: write skipped.', 'good');
            } else {
              count++;
              if (idem.get()) lastOff = o;
            }
            cells[o].set({ kind: 'good' });
            paint();
          }
          async function batch(crash) {
            if (running) return;
            if (cp >= N) { cap.set('The log is done. Press Reset.', 'info'); return; }
            running = true;
            proc.set({ down: false, kind: 'primary', sub: '' });
            const end = Math.min(N, cp + BATCH);
            cap.set('Process offsets ' + cp + '–' + (end - 1) + ', then checkpoint', 'info');
            for (let o = cp; o < end; o++) {
              await process(o);
              if (crash && o === cp + 1) {
                proc.set({ down: true, kind: 'bad', sub: 'crashed' });
                cap.set('Crash after writing, before the checkpoint!', 'bad');
                await v.sleep(1000);
                proc.set({ down: false, kind: 'warn', sub: 'restarted' });
                cap.set('Restart from the last checkpoint: redo offsets ' + cp + '–' + (end - 1), 'warn');
                for (let i = cp; i < end; i++) cells[i].set({ kind: 'data' });
                await v.sleep(700);
                for (let i = cp; i < end; i++) await process(i);
                break;
              }
            }
            cp = end;
            proc.set({ down: false, kind: 'primary', sub: '' });
            paint();
            running = false;
            if (count > seen.size) cap.set('Count ' + count + ' but only ' + seen.size + ' messages: replay double-counted.', 'bad');
            else cap.set(crash ? 'Replayed, yet counted exactly once: exactly-once effect.' : 'Batch done. Checkpoint moves forward.', 'good');
          }
          reset();
        },
      },
    ],

    cheatsheet: [
      { term: 'Event', text: 'A small, immutable record of something that happened, with a timestamp.', kind: 'data' },
      { term: 'Drop / buffer / backpressure', text: 'Three answers when producers outrun consumers.', kind: 'warn' },
      { term: 'Message broker', text: 'Buffers messages for consumers. Classic brokers delete them after the ack.', kind: 'primary' },
      { term: 'Load balance vs fan-out', text: 'One consumer per message, or every consumer gets every message.', kind: 'info' },
      { term: 'Acks + redelivery', text: 'Unacked messages are resent, which can reorder them.', kind: 'warn' },
      { term: 'Partitioned log', text: 'Append-only partitions with offsets. Ordered within a partition, not across.', kind: 'primary' },
      { term: 'Consumer offset & lag', text: 'A position you can rewind to replay. Lag too far and old segments are gone.', kind: 'good' },
      { term: 'Change data capture', text: 'Stream a database\'s writes, in order, to caches, indexes and warehouses.', kind: 'good' },
      { term: 'Log compaction', text: 'Keep only the latest value per key; tombstones mark deletions.', kind: 'data' },
      { term: 'Event sourcing', text: 'Validate commands, store events, derive state by replaying them.', kind: 'primary' },
      { term: 'Event vs processing time', text: 'When it happened vs when it was seen. Window by event time.', kind: 'bad' },
      { term: 'Windows', text: 'Tumbling, hopping, sliding, session. Stragglers need a policy.', kind: 'info' },
      { term: 'Stream joins', text: 'Stream-stream (windowed), stream-table (enrich), table-table (view).', kind: 'info' },
      { term: 'Exactly-once effects', text: 'Checkpoints plus atomic commit or idempotent writes.', kind: 'good' },
    ],

    quiz: [
      {
        q: 'Consumer 2 crashes before acking m3, and m3 is redelivered to consumer 1 after m4. What happens?',
        options: ['m3 is lost', 'Consumer 1 processes m4 before m3', 'The broker waits for consumer 2 to return'],
        answer: 1,
        why: 'Load balancing plus redelivery keeps m3 alive but changes the processing order.',
      },
      {
        q: 'A topic has 4 partitions and one consumer group runs 6 consumers. How many consumers get work?',
        options: ['4', '6', '1'],
        answer: 0,
        why: 'Each partition goes to exactly one consumer in the group, so two consumers sit idle.',
      },
      {
        q: 'Why do dual writes to a database and a search index drift apart?',
        options: ['Search indexes drop writes under load', 'Databases are always slower', 'Concurrent writes can reach the two systems in different orders'],
        answer: 2,
        why: 'Without one shared order, DB and index can apply the same two writes in opposite orders.',
      },
      {
        q: 'A stream processor restarts and chews through a backlog. A per-second chart by processing time shows…',
        options: ['A gap, then a spike that never happened', 'A perfectly flat line', 'Nothing unusual'],
        answer: 0,
        why: 'Bucketing by arrival time moves the backlog into the restart window. Use event time.',
      },
      {
        q: 'After a crash, a processor replays messages it already wrote to a counter. What keeps the count right?',
        options: ['Retrying faster', 'Windowing by processing time', 'Storing each message\'s offset with the write and skipping seen ones'],
        answer: 2,
        why: 'Offset-tagged writes are idempotent: applying the same message twice changes nothing.',
      },
    ],
  });
})();
