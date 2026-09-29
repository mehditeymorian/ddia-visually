/* Chapter 8 — The trouble with distributed systems */
(function () {
  'use strict';

  /* ---------- local helpers ---------- */
  const linear = (t) => t;
  const gauss = () => {
    let u = 0, w = 0;
    while (!u) u = Math.random();
    while (!w) w = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * w);
  };
  // seconds -> short human string
  const fmtT = (s) => {
    const a = Math.abs(s);
    if (a < 1e-3) return Math.round(s * 1e6) + ' µs';
    if (a < 1) return (a < 0.01 ? (s * 1e3).toFixed(1) : Math.round(s * 1e3)) + ' ms';
    if (a < 120) return (a < 10 ? s.toFixed(1) : Math.round(s)) + ' s';
    if (a < 7200) return Math.round(s / 60) + ' min';
    return (s / 3600).toFixed(1) + ' h';
  };
  const minus = (s) => String(s).replace('-', '−');
  const dot = (st, x, y, kind, r = 6) => st.add('circle', { cx: x, cy: y, r, class: 'vz-shape k-' + kind, 'stroke-width': 2 });

  DDIA.chapter({
    id: 8,
    part: 2,
    title: 'The trouble with distributed systems',
    short: 'Distributed trouble',
    tagline: 'Networks, clocks and pauses all betray you',
    cards: [
      /* 1 ─────────────────────────────────────────────── */
      {
        title: 'One machine crashes cleanly. Clusters half-break.',
        caption: 'A single computer either works or crashes. In a cluster some parts fail while others run, so outcomes become unpredictable.',
        problem: 'Partial failure',
        fix: 'Fault tolerance in software',
        tags: ['HPC', 'Cloud'],
        demo(el, v) {
          const box = v.wrap(el);
          const mode = v.segmented(box, {
            options: [
              { value: 'pc', label: 'One computer' },
              { value: 'hpc', label: 'Supercomputer' },
              { value: 'cloud', label: 'Cloud service' },
            ],
            value: 'pc',
            onChange: build,
          });
          const st = v.stage(box, { w: 560, h: 280 });
          const stats = v.row(box, { center: true });
          const sOk = v.stat(stats, 'requests ok', '0', 'good');
          const sBad = v.stat(stats, 'requests failed', '0', 'bad');
          const sProg = v.stat(stats, 'job done', '0%', 'good');
          const sLost = v.stat(stats, 'work redone', '0%', 'warn');
          const cap = v.caption(box, '');
          v.controls(box, [
            { label: 'Break a part', icon: '✕', kind: 'danger', onClick: breakPart },
            { label: 'Repair all', icon: '↺', onClick: build },
          ]);
          const RING = [0, 1, 3, 2];
          const BX = 170, BW = 372, BY = 234;
          let m, users, frame, parts, names, bar, ck, ckTxt, strip, hist;
          let crashed, fault, halted, progress, checkpoint, ok, bad, redone;
          const show = (s, b) => { s.el.style.display = b ? '' : 'none'; };
          const NS = 20;
          function record(kind) {
            hist.push(kind);
            if (hist.length > NS) hist.shift();
          }

          function paint() {
            sOk.set(String(ok), 'good');
            sBad.set(String(bad), bad ? 'bad' : 'good');
            sProg.set(progress + '%', 'good');
            sLost.set(redone + '%', redone ? 'warn' : 'good');
            if (m !== 'hpc') strip.forEach((r, i) => r.set({ kind: hist[i] || 'ghost' }));
            if (m === 'hpc') {
              bar.set({ w: (progress / 100) * BW });
              const cx = BX + (checkpoint / 100) * BW;
              ck.set({ x1: cx, x2: cx });
              ckTxt.move(Math.min(BX + BW - 55, Math.max(BX + 55, cx)), BY + 34).set('checkpoint ' + checkpoint + '%');
            }
          }

          function build() {
            v.restart();
            st.clear();
            m = mode.get();
            crashed = false; halted = false; fault = [null, null, null, null];
            progress = 0; checkpoint = 0; ok = 0; bad = 0; redone = 0; hist = [];
            users = st.node({ x: 55, y: 121, w: 56, h: 56, shape: 'person', label: m === 'hpc' ? 'Scientist' : 'Users' });
            frame = st.box(BX, 28, BW, 186, {
              label: m === 'pc' ? 'ONE COMPUTER' : m === 'hpc' ? 'SUPERCOMPUTER' : 'DATACENTER',
              kind: m === 'pc' ? 'primary' : 'neutral',
              solid: m === 'pc',
            });
            names = m === 'pc' ? ['NIC', 'CPU', 'RAM', 'Disk'] : ['Node 1', 'Node 2', 'Node 3', 'Node 4'];
            parts = names.map((nm, i) => st.node({ x: 265 + (i % 2) * 182, y: 88 + Math.floor(i / 2) * 84, w: 132, h: 50, label: nm, sub: m === 'pc' ? '' : 'healthy', kind: 'good' }));
            if (m === 'pc') {
              st.link(users, parts[0], { both: true, thin: true });
              [[0, 1], [1, 2], [1, 3]].forEach(([a, b]) => st.link(parts[a], parts[b], { arrow: false, thin: true }));
            } else if (m === 'hpc') {
              st.link(users, parts[0], { dashed: true, thin: true });
              RING.forEach((a, k) => st.link(parts[a], parts[RING[(k + 1) % 4]], { arrow: false, thin: true }));
              st.text(BX - 10, BY + 9, 'job', { size: 13, anchor: 'end', kind: 'muted' });
              st.rect(BX, BY, BW, 18, { kind: 'neutral', rx: 6 });
              bar = st.rect(BX, BY, 0, 18, { kind: 'good', rx: 6 });
              ck = st.line(BX, BY - 6, BX, BY + 24, { kind: 'primary', width: 3, layer: 'top' });
              ckTxt = st.text(BX + 55, BY + 34, '', { size: 12, kind: 'primary', bold: true });
            } else {
              st.link(users, { x: BX, y: 121 }, { thin: true, both: true });
            }
            if (m !== 'hpc') {
              const cw = BW / NS;
              st.text(BX - 10, BY + 9, 'last 20', { size: 12, anchor: 'end', kind: 'muted' });
              strip = Array.from({ length: NS }, (_, i) => st.rect(BX + i * cw + 1.5, BY, cw - 3, 18, { kind: 'ghost', rx: 4 }));
              st.text(BX + BW / 2, BY + 34, 'request outcomes, oldest → newest', { size: 12, kind: 'muted' });
            }
            show(sOk, m !== 'hpc');
            show(sBad, m !== 'hpc');
            show(sProg, m === 'hpc');
            show(sLost, m === 'hpc');
            paint();
            cap.set(
              m === 'pc' ? 'One machine: same input, same answer, every time. Try breaking a part.'
                : m === 'hpc' ? 'Four nodes crunch one long job, saving checkpoints. Try breaking a node.'
                  : 'Four nodes serve users around the clock. Try breaking one, or two.',
              'info');
          }

          async function tickPc() {
            if (crashed) {
              await st.send(users, parts[0], { drop: 0.85, kind: 'bad', dur: 600 });
              bad++;
              record('bad');
              paint();
              return;
            }
            await st.send(users, parts[0], { dur: 420 });
            await st.send(parts[0], parts[1], { dur: 300, kind: 'data' });
            await st.send(parts[0], users, { dur: 420, kind: 'good', label: '✓' });
            ok++;
            record('good');
            paint();
          }
          async function tickHpc() {
            if (halted) return;
            if (progress >= 100) {
              progress = 0; checkpoint = 0;
              paint();
              cap.set('New job started.', 'info');
              return;
            }
            await Promise.all(RING.map((a, k) => st.send(parts[a], parts[RING[(k + 1) % 4]], { dur: 520, kind: 'data' })));
            if (halted) return;
            progress += 10;
            if (progress >= 100) cap.set('Job finished.', 'good');
            else if (progress % 30 === 0) { checkpoint = progress; cap.set(`Checkpoint saved at ${progress}%.`, 'info'); }
            paint();
          }
          async function tickCloud() {
            const i = Math.floor(Math.random() * 4), p = parts[i], f = fault[i];
            if (f === 'crash' || (f === 'flaky' && Math.random() < 0.5)) {
              await st.send(users, p, { drop: f === 'crash' ? 0.85 : 0.5, kind: 'bad', dur: 600 });
              bad++;
              record('bad');
              paint();
              return;
            }
            await st.send(users, p, { dur: 450 });
            if (f === 'slow') await v.sleep(900);
            await st.send(p, users, { dur: 450, kind: f === 'slow' ? 'warn' : 'good', label: '✓' });
            ok++;
            record(f === 'slow' ? 'warn' : 'good');
            paint();
          }
          function tick() {
            if (m === 'pc') tickPc();
            else if (m === 'hpc') tickHpc();
            else tickCloud();
          }

          async function breakPart() {
            if (m === 'pc') {
              if (crashed) return;
              crashed = true;
              parts.forEach((p) => p.set({ kind: 'bad', down: true }));
              frame.set({ kind: 'bad', label: 'ONE COMPUTER · CRASHED' });
              cap.set('Any fault takes down the whole machine. Never half-working.', 'bad');
              return;
            }
            if (m === 'hpc') {
              if (halted) return;
              halted = true;
              const i = Math.floor(Math.random() * 4);
              parts.forEach((p, j) => p.set(j === i ? { kind: 'bad', down: true, sub: 'crashed' } : { kind: 'warn', sub: 'halted' }));
              cap.set(`${names[i]} died, so the whole job stops.`, 'bad');
              await v.sleep(1300);
              const lost = progress - checkpoint;
              redone += lost;
              progress = checkpoint;
              paint();
              cap.set(`Roll back to the ${checkpoint}% checkpoint: ${lost}% of work lost.`, 'warn');
              await v.sleep(1500);
              parts.forEach((p) => p.set({ kind: 'good', down: false, sub: 'healthy' }));
              halted = false;
              cap.set('Node repaired. Everything restarts from the checkpoint.', 'good');
              return;
            }
            const healthy = [0, 1, 2, 3].filter((i) => !fault[i]);
            if (!healthy.length) { cap.set('Everything is broken now. Hit repair.', 'bad'); return; }
            const i = healthy[Math.floor(Math.random() * healthy.length)];
            const f = ['crash', 'slow', 'flaky'][Math.floor(Math.random() * 3)];
            fault[i] = f;
            parts[i].set(f === 'crash' ? { kind: 'bad', down: true, sub: 'crashed' } : { kind: 'warn', sub: f === 'slow' ? 'very slow' : 'drops some' });
            cap.set(
              f === 'crash' ? `${names[i]} is down. Requests routed there fail; the rest succeed.`
                : f === 'slow' ? `${names[i]} is slow. Some replies crawl in; the rest are fine.`
                  : `${names[i]} drops requests at random. Same request, different outcome.`,
              'warn');
          }

          build();
          tick();
          v.every(1400, tick);
        },
      },

      /* 2 ─────────────────────────────────────────────── */
      {
        title: 'No reply. Lost, crashed, or just slow?',
        caption: 'When no reply comes, the sender cannot tell why. A lost request, a dead or paused node, and a lost reply all look identical.',
        problem: 'Ambiguous silence',
        fix: 'Timeout, while knowing you are still unsure',
        tags: ['TCP', 'Ethernet', 'IP'],
        demo(el, v) {
          const box = v.wrap(el);
          const cases = v.segmented(box, {
            options: [
              { value: 'req', label: 'Request lost' },
              { value: 'down', label: 'Node crashed' },
              { value: 'pause', label: 'Node paused' },
              { value: 'reply', label: 'Reply lost' },
            ],
            value: 'req',
            onChange: run,
          });
          const st = v.stage(box, { w: 560, h: 214 });
          const client = st.node({ x: 70, y: 96, w: 104, h: 50, label: 'Client', kind: 'info' });
          const net = st.node({ x: 290, y: 96, w: 116, h: 46, label: 'Network', shape: 'pill' });
          const server = st.node({ x: 470, y: 96, w: 116, h: 50, label: 'Server' });
          st.link(client, net, { arrow: false, thin: true });
          st.link(net, server, { arrow: false, thin: true });
          st.text(70, 142, 'waiting for reply', { size: 12, kind: 'muted' });
          st.rect(20, 154, 100, 12, { kind: 'neutral', rx: 6 });
          const tBar = st.rect(20, 154, 0, 12, { kind: 'info', rx: 6 });
          const tLbl = st.text(70, 186, '', { size: 14, bold: true });
          // fog: what the client cannot see
          const fog = st.add('g', { 'aria-hidden': 'true' }, 'top');
          v.s('rect', { x: 170, y: 14, width: 380, height: 168, rx: 16, class: 'vz-shape k-neutral', 'stroke-width': 1.5 }, fog);
          const q = v.s('text', { x: 360, y: 88, class: 'vz-ink k-muted', 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': 44, 'font-weight': 700 }, fog);
          q.textContent = '?';
          const q2 = v.s('text', { x: 360, y: 138, class: 'vz-ink k-muted', 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 600 }, fog);
          q2.textContent = 'the client cannot see in here';
          const cap = v.caption(box, '');
          const row = v.row(box);
          const blind = v.toggle(row, { label: "Client's view only", value: false, onChange: run });
          v.controls(row, [{ label: 'Send request', icon: '▶', kind: 'primary', onClick: run }]);

          // keep the fog above any packet that is launched
          function send(a, b, o) {
            const p = st.send(a, b, o);
            fog.parentNode.appendChild(fog);
            return p;
          }
          const TRUTH = {
            req: 'Truth: the request was lost. The server never saw it.',
            down: 'Truth: the server had crashed. Nobody could answer.',
            pause: 'Truth: the server is frozen in a long pause. It may answer later.',
            reply: 'Truth: the server did the work. Only the reply was lost.',
          };
          async function run() {
            v.restart();
            st.clearPackets();
            const c = cases.get();
            const hide = blind.get();
            fog.style.display = hide ? '' : 'none';
            server.set({ kind: c === 'down' ? 'bad' : 'neutral', down: c === 'down', sub: c === 'down' ? 'crashed' : '' });
            client.set({ kind: 'info', sub: '' });
            tBar.set({ w: 0, kind: 'info' });
            tLbl.set('');
            cap.set('Client sends a request and starts a timer.', 'info');
            v.tween(3400, (t) => tBar.set({ w: 100 * t }), linear).then(() => {
              tBar.set({ kind: 'bad' });
              tLbl.set('timeout', 'bad');
              client.set({ kind: 'warn', sub: 'no reply' });
              cap.set(hide ? 'No reply. Lost? Crashed? Paused? The client cannot know.' : TRUTH[c], hide ? 'warn' : 'bad');
            });
            await send(client, net, { label: 'req', dur: 700 });
            if (c === 'req') { await send(net, server, { label: 'req', drop: 0.45, dur: 800 }); return; }
            if (c === 'down') { await send(net, server, { label: 'req', drop: 0.92, dur: 800 }); return; }
            await send(net, server, { label: 'req', dur: 700 });
            if (c === 'pause') {
              server.set({ kind: 'warn', sub: 'GC pause…' });
              await v.sleep(3000);
              server.set({ kind: 'good', sub: 'did it ✓' });
              await send(server, net, { label: 'ok', kind: 'good', dur: 700 });
              await send(net, client, { label: 'ok', kind: 'good', dur: 700 });
              client.set({ kind: 'warn', sub: 'late reply!' });
              cap.set('The reply arrives after the timeout. The request did run after all.', 'warn');
              return;
            }
            server.set({ kind: 'good', sub: 'did it ✓' });
            await send(server, net, { label: 'ok', kind: 'good', drop: 0.55, dur: 800 });
          }
          run();
        },
      },

      /* 3 ─────────────────────────────────────────────── */
      {
        title: 'Rarely told. Usually just silence.',
        caption: 'A crashed process may get an instant "refused". A dead machine, cut cable or one-way link gives only silence until a timeout.',
        problem: 'Is it dead or not?',
        fix: 'Explicit signals when you get them, else timeouts',
        tags: ['TCP RST', 'ICMP', 'HBase'],
        demo(el, v) {
          const box = v.wrap(el);
          const sc = v.segmented(box, {
            options: [
              { value: 'proc', label: 'Process crashed' },
              { value: 'off', label: 'Machine off' },
              { value: 'cut', label: 'Network cut' },
              { value: 'oneway', label: 'One-way link' },
            ],
            value: 'proc',
            onChange: run,
          });
          const st = v.stage(box, { w: 560, h: 240 });
          const mon = st.node({ x: 68, y: 120, w: 112, h: 54, label: 'Monitor', sub: 'health check', kind: 'info' });
          const sw = st.node({ x: 232, y: 120, w: 96, h: 44, label: 'Switch', shape: 'pill' });
          const mach = st.box(330, 22, 216, 196, { label: 'MACHINE', kind: 'neutral', solid: true });
          const app = st.node({ x: 438, y: 82, w: 160, h: 46, label: 'App process', kind: 'good' });
          const os = st.node({ x: 438, y: 168, w: 160, h: 46, label: 'Operating system', kind: 'good' });
          st.link(mon, sw, { arrow: false });
          const cable = st.link(sw, os, { arrow: false });
          st.link(os, app, { arrow: false, thin: true, dashed: true });
          const stats = v.row(box, { center: true });
          const sTime = v.stat(stats, 'time to know', '—', 'info');
          const sSure = v.stat(stats, 'certainty', '—', 'info');
          v.stat(stats, 'net faults / month', '≈12', 'warn');
          const cap = v.caption(box, '');
          v.controls(box, [{ label: 'Health check', icon: '▶', kind: 'primary', onClick: run }]);

          async function timeout() {
            for (let k = 3; k > 0; k--) {
              mon.set({ sub: `timeout in ${k} s` });
              await v.sleep(650);
            }
            mon.set({ kind: 'warn', sub: 'dead? (a guess)' });
            sTime.set('3 s timeout', 'warn');
            sSure.set('a guess', 'warn');
          }
          async function run() {
            v.restart();
            st.clearPackets();
            const c = sc.get();
            const appDown = c === 'proc' || c === 'off';
            mon.set({ kind: 'info', sub: 'health check' });
            app.set({ kind: appDown ? 'bad' : 'good', down: appDown, sub: c === 'proc' ? 'crashed' : '' });
            os.set({ kind: c === 'off' ? 'bad' : 'good', down: c === 'off', sub: '' });
            mach.set({ kind: c === 'off' ? 'bad' : 'neutral', label: c === 'off' ? 'MACHINE · POWERED OFF' : 'MACHINE' });
            cable.set({ kind: c === 'cut' ? 'bad' : c === 'oneway' ? 'warn' : 'muted', dashed: c === 'cut', label: c === 'cut' ? 'cut' : c === 'oneway' ? 'one way' : '' });
            sTime.set('…', 'info');
            sSure.set('…', 'info');
            cap.set('The monitor pings the node.', 'info');
            await st.send(mon, sw, { label: 'ping', dur: 550 });
            if (c === 'cut') {
              await st.send(sw, os, { label: 'ping', drop: 0.35, dur: 700 });
              cap.set('The cable is cut. The machine is fine, but nothing gets through.', 'warn');
              await timeout();
              cap.set('Looks exactly like a dead machine. Only a timeout says so.', 'warn');
              return;
            }
            if (c === 'off') {
              await st.send(sw, os, { label: 'ping', drop: 0.9, dur: 700 });
              cap.set('The machine is off. Nobody is there to answer.', 'warn');
              await timeout();
              cap.set('Silence. Even after the timeout, "dead" is only a guess.', 'warn');
              return;
            }
            await st.send(sw, os, { label: 'ping', dur: 600 });
            if (c === 'proc') {
              cap.set('No process on that port, but the OS is still alive…', 'info');
              await st.send(os, sw, { label: 'RST', kind: 'bad', dur: 450 });
              await st.send(sw, mon, { label: 'RST', kind: 'bad', dur: 450 });
              mon.set({ kind: 'good', sub: 'app is dead' });
              sTime.set('~1 ms', 'good');
              sSure.set('certain', 'good');
              cap.set('The OS answers "connection refused" at once. Fast and certain.', 'good');
              return;
            }
            await st.send(os, app, { label: 'ping', dur: 450 });
            app.set({ sub: 'fine, replying' });
            await st.send(app, os, { label: 'pong', kind: 'good', dur: 450 });
            await st.send(os, sw, { label: 'pong', kind: 'good', drop: 0.4, dur: 700 });
            cap.set('Requests get in. Replies never get out.', 'warn');
            await timeout();
            cap.set('A working node gets declared dead. Links can fail in one direction.', 'bad');
          }
          run();
        },
      },

      /* 4 ─────────────────────────────────────────────── */
      {
        title: 'Timeout too short or too long?',
        lab: { id: 'consensus', preset: 'flapping' },
        caption: 'Short timeouts wrongly declare slow nodes dead. Long ones leave users waiting on dead nodes. Adaptive detectors learn the delay distribution.',
        problem: 'Unbounded delays',
        fix: 'Adaptive timeouts (φ accrual)',
        tags: ['Cassandra', 'Akka'],
        demo(el, v) {
          const box = v.wrap(el);
          let tmo = 250;
          let data = [];
          const sl = v.slider(box, { label: 'Timeout', min: 50, max: 1200, step: 10, value: 250, format: (x) => x + ' ms', onInput: (x) => { tmo = x; adapt.set(false); draw(); } });
          const row = v.row(box);
          const busy = v.toggle(row, { label: 'Busy network', value: false, onChange: gen });
          const adapt = v.toggle(row, { label: 'Adaptive (φ accrual)', value: false, onChange: draw });
          v.controls(row, [{ label: 'New sample', icon: '↻', onClick: gen }]);
          const st = v.stage(box, { w: 560, h: 236 });
          const stats = v.row(box, { center: true });
          const sFa = v.stat(stats, 'false alarms', '', 'bad');
          const sDet = v.stat(stats, 'crash noticed after', '', 'warn');
          const srcRow = v.row(box, { center: true });
          srcRow.appendChild(v.h('span', { class: 'vz-muted', text: 'Delay piles up in' }));
          const srcs = ['switch queues', 'OS run queue', 'VM pauses', 'TCP resends'].map((t) => {
            const c = v.cell(t, 'ghost', { sm: true });
            srcRow.appendChild(c);
            return c;
          });
          const cap = v.caption(box, '');

          // round-trip time of a healthy node, in ms
          function sample(isBusy) {
            const base = 25 + 55 * Math.exp(0.45 * gauss());
            if (!isBusy) return base;
            let q = -Math.log(1 - Math.random()) * 170; // queueing
            if (Math.random() < 0.04) q += 300 + Math.random() * 450; // lost packet, TCP resend
            return base + q;
          }
          function gen() {
            data = Array.from({ length: 800 }, () => sample(busy.get()));
            draw();
          }
          function draw() {
            st.clear();
            const X0 = 40, X1 = 540, Y0 = 196, H = 140, MAX = 1200, BW = 30, NB = MAX / BW;
            const n = data.length;
            const mean = data.reduce((a, b) => a + b, 0) / n;
            const sd = Math.sqrt(data.reduce((a, b) => a + (b - mean) * (b - mean), 0) / n);
            // phi-accrual style: suspect once silence is far out in the learned distribution
            if (adapt.get()) {
              tmo = Math.max(50, Math.min(MAX, Math.round((mean + 4 * sd) / 10) * 10));
              sl.set(tmo);
            }
            const bins = new Array(NB).fill(0);
            data.forEach((d) => { bins[Math.min(NB - 1, Math.floor(d / BW))]++; });
            const top = Math.max(...bins);
            const x = (ms) => X0 + (ms / MAX) * (X1 - X0);
            const bw = (X1 - X0) / NB;
            bins.forEach((c, i) => {
              if (!c) return;
              const h = Math.max(2, (c / top) * H);
              st.rect(x(i * BW) + 1, Y0 - h, bw - 2, h, { kind: (i + 0.5) * BW > tmo ? 'bad' : 'good', rx: 2, strokeWidth: 1 });
            });
            st.line(X0, Y0, X1, Y0, { width: 1.2 });
            [0, 300, 600, 900].forEach((t) => st.text(x(t), Y0 + 14, String(t), { size: 12, kind: 'muted', mono: true }));
            st.text(X1, Y0 + 14, '1200+', { size: 12, kind: 'muted', mono: true, anchor: 'end' });
            st.text((X0 + X1) / 2, Y0 + 32, 'round-trip time of a healthy node (ms)', { size: 12, kind: 'muted' });
            const tx = x(tmo);
            st.line(tx, 28, tx, Y0 + 4, { kind: 'primary', width: 2.5, dashed: true, layer: 'top' });
            st.text(Math.max(X0 + 62, Math.min(X1 - 62, tx)), 16, 'timeout ' + tmo + ' ms', { size: 13, kind: 'primary', bold: true, halo: true });
            if (tx - X0 > 150) st.text((X0 + tx) / 2, 42, 'reply in time ✓', { size: 12, kind: 'good', bold: true, halo: true });
            if (X1 - tx > 150) st.text((tx + X1) / 2, 42, 'declared dead ✕', { size: 12, kind: 'bad', bold: true, halo: true });

            const fa = data.filter((d) => d > tmo).length / n;
            const sorted = data.slice().sort((a, b) => a - b);
            const p99 = sorted[Math.floor(0.99 * n)];
            sFa.set((fa * 100).toFixed(fa < 0.1 ? 1 : 0) + '%', fa > 0.05 ? 'bad' : fa > 0.01 ? 'warn' : 'good');
            sDet.set(tmo + ' ms', tmo >= 800 ? 'warn' : 'good');
            srcs.forEach((c) => { c.className = 'vz-cell sm ' + (busy.get() ? 'k-warn' : 'k-ghost'); });
            if (adapt.get()) cap.set(`Adaptive: the timeout follows measured jitter, now ${tmo} ms.`, 'good');
            else if (fa > 0.05) cap.set('Too short: healthy but slow nodes get declared dead.', 'bad');
            else if (tmo > 2 * p99 + 100) cap.set('Safe, but a real crash goes unnoticed for a long time.', 'warn');
            else cap.set(busy.get() ? 'Fits this busy network, until the load changes again.' : 'Fits this quiet network. Now turn on "Busy network".', 'info');
          }
          gen();
        },
      },

      /* 5 ─────────────────────────────────────────────── */
      {
        title: 'Circuits reserve the wire. Packets share it.',
        caption: 'A phone circuit reserves fixed bandwidth, so delay is bounded. Packet networks share the wire among bursty senders: better utilization, but queues and unbounded delay.',
        problem: 'Queueing makes delay unbounded',
        fix: 'No free fix: a cost versus latency trade-off',
        tags: ['Ethernet', 'IP', 'ISDN', 'InfiniBand'],
        demo(el, v) {
          const box = v.wrap(el);
          const mode = v.segmented(box, {
            options: [
              { value: 'packet', label: 'Packet switched' },
              { value: 'circuit', label: 'Circuit switched' },
            ],
            value: 'packet',
            onChange: reset,
          });
          let active = 3;
          v.slider(box, { label: 'Active senders', min: 1, max: 3, value: 3, onInput: (x) => { active = x; reset(); } });
          const st = v.stage(box, { w: 560, h: 250 });
          const K = ['info', 'data', 'primary'];
          const snd = ['A', 'B', 'C'].map((n, i) => st.node({ x: 62, y: 50 + i * 75, w: 96, h: 44, label: 'Sender ' + n, kind: K[i] }));
          const sw = st.node({ x: 222, y: 125, w: 92, h: 52, label: 'Switch' });
          const dst = st.node({ x: 506, y: 125, w: 88, h: 52, label: 'Receiver' });
          snd.forEach((s) => st.link(s, sw, { thin: true }));
          const outLink = st.link(sw, dst, { thin: true, arrow: false });
          const CAP = 6, QX = 432, QW = 22, QY = 113;
          const qSlots = Array.from({ length: CAP }, (_, i) => st.rect(QX - i * (QW + 4), QY, QW, 24, { kind: 'ghost', rx: 4, layer: 'top' }));
          const qLbl = st.text(378, 96, 'switch output queue', { size: 12, kind: 'muted' });
          const LY = [111, 125, 139];
          const lanes = LY.map((y, i) => st.line(270, y, 460, y, { kind: K[i], width: 1.5 }));
          const lLbl = st.text(365, 94, 'one fixed slot per sender', { size: 12, kind: 'muted' });
          const stats = v.row(box, { center: true });
          const sUse = v.stat(stats, 'wire in use', '', 'info');
          const sDelay = v.stat(stats, 'network delay', '', 'info');
          const sDrop = v.stat(stats, 'dropped', '0', 'good');
          const sWait = v.stat(stats, 'waiting at senders', '0', 'good');
          const cap = v.caption(box, '');
          let backlog, queue, used, delays, drops, slot;

          function paintQ() {
            qSlots.forEach((r, i) => r.set({ kind: i < queue.length ? K[queue[i].src] : 'ghost' }));
          }
          function paintStats() {
            const u = used.length ? used.reduce((a, b) => a + b, 0) / used.length : 0;
            sUse.set(Math.round(u * 100) + '%', u > 0.8 ? 'good' : u > 0.5 ? 'info' : 'warn');
            if (delays.length) {
              const mn = Math.min(...delays), mx = Math.max(...delays);
              sDelay.set(mn === mx ? mn + ' ms' : `${mn}–${mx} ms`, mx - mn > 2 ? 'bad' : 'good');
            } else sDelay.set('—', 'info');
            sDrop.set(String(drops), drops ? 'bad' : 'good');
            const waiting = backlog.reduce((a, b) => a + b, 0);
            sWait.set(String(waiting), waiting > 5 ? 'warn' : 'good');
            snd.forEach((s, i) => { if (i < active) s.set({ badge: backlog[i] ? String(backlog[i]) : '' }); });
          }
          function reset() {
            v.restart();
            st.clearPackets();
            backlog = [0, 0, 0]; queue = []; used = []; delays = []; drops = 0; slot = 0;
            const circ = mode.get() === 'circuit';
            qSlots.forEach((r) => { r.el.style.display = circ ? 'none' : ''; });
            qLbl.show(!circ);
            lanes.forEach((l, i) => { l.el.style.display = circ ? '' : 'none'; l.el.style.opacity = i < active ? 1 : 0.3; });
            lLbl.show(circ);
            outLink.show(!circ);
            snd.forEach((s, i) => s.set({ kind: i < active ? K[i] : 'ghost', sub: i < active ? '' : 'idle', badge: '' }));
            paintQ();
            paintStats();
            if (!circ) {
              if (active === 1) cap.set('One sender gets the whole wire: fast, little queueing.', 'good');
              else if (active === 2) cap.set('Bursts collide at the switch. Queues grow and delay varies.', 'warn');
              else cap.set('Overloaded: the queue fills, delay swings, packets get dropped.', 'bad');
            } else if (active === 1) cap.set('Delay is fixed, but data waits while two of three slots sit idle.', 'warn');
            else cap.set('Each sender owns a fixed slot. Delay never varies, nothing drops.', 'good');
          }
          function tick() {
            slot++;
            const circ = mode.get() === 'circuit';
            // bursty traffic: each active sender sometimes has a burst of 2–4 packets
            for (let i = 0; i < active; i++) {
              if (Math.random() < 0.16) backlog[i] = Math.min(9, backlog[i] + 2 + Math.floor(Math.random() * 3));
            }
            let carried = 0;
            if (circ) {
              const owner = slot % 3;
              lanes.forEach((l, i) => l.el.setAttribute('stroke-width', i === owner ? 4 : 1.5));
              if (owner < active && backlog[owner] > 0) {
                backlog[owner]--;
                carried = 1;
                delays.push(1);
                const y = LY[owner];
                st.send(snd[owner], sw, { dur: 280, kind: K[owner] }).then(() => st.send({ x: 272, y }, { x: 460, y }, { dur: 280, kind: K[owner] }));
              }
            } else {
              if (queue.length) {
                const p = queue.shift();
                carried = 1;
                st.send({ x: QX + QW / 2, y: 125 }, dst, { dur: 280, kind: K[p.src] });
              }
              for (let i = 0; i < active; i++) {
                if (!backlog[i]) continue;
                backlog[i]--;
                if (queue.length < CAP) {
                  queue.push({ src: i });
                  // FIFO, one departure per tick: its wait equals its place in line
                  delays.push(queue.length);
                  st.send(snd[i], sw, { dur: 280, kind: K[i] });
                } else {
                  drops++;
                  st.send(snd[i], sw, { dur: 280, kind: 'bad', drop: 0.9 });
                }
              }
            }
            used.push(carried);
            if (used.length > 40) used.shift();
            if (delays.length > 30) delays.splice(0, delays.length - 30);
            v.after(280, paintQ);
            paintStats();
          }
          reset();
          v.every(480, tick);
        },
      },

      /* 6 ─────────────────────────────────────────────── */
      {
        title: 'Wall clocks jump. Stopwatches do not.',
        caption: 'Time-of-day clocks can be stepped back by NTP or a leap second, so durations come out negative. Measure intervals with the monotonic clock.',
        problem: 'Clock jumps backwards',
        fix: 'Monotonic clock for durations',
        tags: ['CLOCK_MONOTONIC', 'System.nanoTime'],
        demo(el, v) {
          const box = v.wrap(el);
          const ev = v.segmented(box, {
            options: [
              { value: 'none', label: 'Normal' },
              { value: 'ntp', label: 'NTP steps back', kind: 'bad' },
              { value: 'leap', label: 'Leap second', kind: 'bad' },
            ],
            value: 'ntp',
            onChange: run,
          });
          const st = v.stage(box, { w: 560, h: 240 });
          const ntp = st.node({ x: 150, y: 38, w: 128, h: 42, label: 'NTP server', kind: 'info', shape: 'pill' });
          const wall = st.node({ x: 150, y: 120, w: 230, h: 60, label: '', sub: 'time-of-day clock', mono: true });
          const mono = st.node({ x: 415, y: 120, w: 230, h: 60, label: '', sub: 'monotonic clock', mono: true });
          st.link(ntp, wall, { dashed: true, thin: true });
          const XR = (t) => 60 + t * 340;
          st.line(XR(0), 210, 520, 210, { width: 1.2 });
          [0, 0.5, 1].forEach((t) => st.text(XR(t), 226, t + ' s', { size: 12, kind: 'muted', mono: true }));
          st.text(520, 226, 'real time', { size: 12, kind: 'muted', anchor: 'end' });
          const req = st.rect(XR(0), 186, 0, 16, { kind: 'info', rx: 4 });
          const reqTxt = st.text(XR(0) + 8, 195, '', { size: 12, kind: 'info', anchor: 'start', bold: true });
          const jumpMark = st.line(-20, 174, -20, 212, { kind: 'bad', width: 2, dashed: true });
          const jumpTxt = st.text(XR(0.5), 166, '', { size: 12, kind: 'bad', bold: true });
          const cursor = st.line(XR(0), 180, XR(0), 212, { kind: 'primary', width: 2.5, layer: 'top' });
          const stats = v.row(box, { center: true });
          const sWall = v.stat(stats, 'wall-clock duration', '—', 'info');
          const sMono = v.stat(stats, 'monotonic duration', '—', 'info');
          const cap = v.caption(box, '');
          v.controls(box, [{ label: 'Time a request', icon: '▶', kind: 'primary', onClick: run }]);

          const pad = (n, w = 2) => String(n).padStart(w, '0');
          function tod(s, leap) {
            if (leap && s >= 86400) return '23:59:60.' + pad(Math.floor((s - 86400) * 1000 + 1e-6), 3);
            s = ((s % 86400) + 86400) % 86400;
            const ms = Math.floor(s * 1000 + 1e-6);
            return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)}.${pad(ms % 1000, 3)}`;
          }
          async function run() {
            v.restart();
            st.clearPackets();
            const e = ev.get();
            const D = e === 'leap' ? 0.8 : 1.2, TJ = 0.5, J = e === 'ntp' ? -1.5 : e === 'leap' ? -1 : 0;
            const W0 = e === 'leap' ? 86399.5 : 43204.1, M0 = 7341.2;
            let j = 0;
            const paint = (t) => {
              wall.set({ label: tod(W0 + t + j, e === 'leap') });
              mono.set({ label: (M0 + t).toFixed(3) + ' s' });
              cursor.set({ x1: XR(t), x2: XR(t) });
              req.set({ w: XR(t) - XR(0) });
            };
            wall.set({ kind: 'neutral' });
            mono.set({ kind: 'neutral' });
            jumpMark.set({ x1: -20, x2: -20 });
            jumpTxt.set('');
            reqTxt.set('request');
            sWall.set('…', 'info');
            sMono.set('…', 'info');
            paint(0);
            cap.set('The request starts: read both clocks.', 'info');
            await v.sleep(500);
            await v.tween(TJ * 1800, (k) => paint(k * TJ), linear);
            if (J) {
              if (e === 'ntp') {
                cap.set('NTP: "your clock is 1.5 s fast." It steps the wall clock back.', 'warn');
                await st.send(ntp, wall, { label: '−1.5 s', kind: 'bad', dur: 700 });
              } else {
                cap.set('Leap second: 23:59:60, then the clock repeats 23:59:59.', 'warn');
                await v.sleep(900);
              }
              j = J;
              paint(TJ);
              wall.set({ kind: 'bad' });
              jumpMark.set({ x1: XR(TJ), x2: XR(TJ) });
              jumpTxt.set(e === 'ntp' ? 'wall clock set back 1.5 s' : 'a second repeats');
              await v.sleep(600);
            }
            await v.tween((D - TJ) * 1800, (k) => paint(TJ + k * (D - TJ)), linear);
            const dw = D + J;
            sWall.set(minus(dw.toFixed(1)) + ' s', dw < 0 ? 'bad' : 'good');
            sMono.set(D.toFixed(1) + ' s', 'good');
            mono.set({ kind: 'good' });
            if (!J) wall.set({ kind: 'good' });
            reqTxt.set('request ' + D.toFixed(1) + ' s');
            if (dw < 0) cap.set(`Wall clock says ${minus(dw.toFixed(1))} s: negative! Monotonic says ${D.toFixed(1)} s.`, 'bad');
            else cap.set('No jump this time: both clocks agree.', 'good');
          }
          run();
        },
      },

      /* 7 ─────────────────────────────────────────────── */
      {
        title: 'Quartz drifts. Syncing only narrows the gap.',
        caption: 'Every quartz clock runs a bit fast or slow. Frequent NTP syncs shrink the error, but network delay sets a floor on accuracy.',
        problem: 'Clock drift',
        fix: 'Sync often, monitor offsets',
        tags: ['NTP', 'GPS', 'PTP'],
        demo(el, v) {
          const box = v.wrap(el);
          let ppm = 200, offs = null;
          v.slider(box, { label: 'Quartz drift', min: 10, max: 300, step: 10, value: 200, format: (x) => x + ' ppm', onInput: (x) => { ppm = x; draw(); } });
          const row = v.row(box);
          row.appendChild(v.h('span', { class: 'vz-muted', text: 'Sync every' }));
          const every = v.segmented(row, {
            options: [
              { value: 30, label: '30 s' },
              { value: 3600, label: '1 hour' },
              { value: 86400, label: '1 day' },
              { value: 0, label: 'Blocked', kind: 'bad' },
            ],
            value: 86400,
            onChange: fresh,
          });
          const via = v.segmented(row, {
            options: [
              { value: 'lan', label: 'Local NTP' },
              { value: 'net', label: 'Internet NTP' },
            ],
            value: 'net',
            onChange: fresh,
          });
          const st = v.stage(box, { w: 560, h: 250 });
          const stats = v.row(box, { center: true });
          const sDrift = v.stat(stats, 'from drift', '', 'warn');
          const sNet = v.stat(stats, 'from network', '', 'info');
          const sWorst = v.stat(stats, 'worst error', '', 'bad');
          const cap = v.caption(box, '');
          const LBL = { 30: '30 s', 3600: '1 hour', 86400: '1 day' };

          function fresh() { offs = null; draw(); }
          function draw() {
            st.clear();
            const I = Number(every.get());
            const never = I === 0;
            const span = never ? 4 * 86400 : 4 * I;
            const floor = via.get() === 'lan' ? 0.001 : 0.035;
            const d = ppm * 1e-6;
            const yMax = 300e-6 * (never ? span : I) + floor; // fixed scale, so the slider changes the slope
            const X0 = 78, X1 = 530, YC = 112, YH = 84;
            const x = (t) => X0 + (t / span) * (X1 - X0);
            const y = (o) => YC - (o / yMax) * YH;
            if (!offs) offs = Array.from({ length: 5 }, () => (Math.random() * 2 - 1) * floor);
            const bandH = Math.max(3, y(-floor) - y(floor));
            st.rect(X0, YC - bandH / 2, X1 - X0, bandH, { kind: 'good', rx: 2, strokeWidth: 0.5 }).set({ opacity: 0.5 });
            st.line(X0, YC, X1, YC, { kind: 'good', width: 1.5 });
            st.text(X1, YC + 14, 'true time', { size: 12, kind: 'good', anchor: 'end', bold: true, halo: true });
            st.text(X0, 12, 'clock error', { size: 12, kind: 'muted', anchor: 'start', bold: true });
            st.text(X0 - 8, YC - YH, '+' + fmtT(yMax), { size: 12, kind: 'muted', anchor: 'end', mono: true });
            st.text(X0 - 8, YC, '0', { size: 12, kind: 'muted', anchor: 'end', mono: true });
            st.text(X0 - 8, YC + YH, '−' + fmtT(yMax), { size: 12, kind: 'muted', anchor: 'end', mono: true });
            let p = '';
            const segs = never ? 1 : 4;
            for (let k = 0; k < segs; k++) {
              const t0 = never ? 0 : k * I, t1 = never ? span : (k + 1) * I;
              const o0 = offs[k], o1 = o0 + d * (t1 - t0);
              p += (k ? ' L' : 'M') + x(t0) + ',' + y(o0) + ' L' + x(t1) + ',' + y(o1);
              if (!never && k < segs - 1) {
                st.line(x(t1), YC + YH + 4, x(t1), YC + YH + 14, { kind: 'info', width: 2 });
                st.text(x(t1), YC + YH + 25, 'sync', { size: 12, kind: 'info', bold: true });
              }
            }
            st.path(p, { kind: 'bad', width: 2.5 });
            if (never) st.text(X1, y(d * span) - 14, 'still drifting', { size: 12, kind: 'bad', anchor: 'end', bold: true, halo: true });
            st.text(X0, 240, '0', { size: 12, kind: 'muted', mono: true });
            st.text(X1, 240, { 30: '2 min', 3600: '4 hours', 86400: '4 days' }[I] || '4 days', { size: 12, kind: 'muted', mono: true, anchor: 'end' });
            st.text((X0 + X1) / 2, 240, 'time', { size: 12, kind: 'muted' });

            const drift = d * (never ? span : I);
            const worst = drift + floor;
            sDrift.set(fmtT(drift) + (never ? '+' : ''), drift > 1 ? 'bad' : drift > 0.01 ? 'warn' : 'good');
            sNet.set('±' + fmtT(floor), 'info');
            sWorst.set(never ? 'unbounded' : fmtT(worst), never || worst > 1 ? 'bad' : worst > 0.01 ? 'warn' : 'good');
            if (never) cap.set('A firewall blocks NTP: the error grows silently. Nothing looks broken.', 'bad');
            else cap.set(`${ppm} ppm for ${LBL[I]} ≈ ${fmtT(drift)} drift, plus ±${fmtT(floor)} network error.`, worst > 1 ? 'bad' : worst > 0.01 ? 'warn' : 'good');
          }
          draw();
        },
      },

      /* 8 ─────────────────────────────────────────────── */
      {
        title: 'Later write, earlier timestamp: silently lost',
        lab: { id: 'clocks', preset: 'skewed' },
        caption: 'Last-write-wins trusts each node\'s clock. If the second writer\'s node lags, its newer write gets an older timestamp and is thrown away.',
        problem: 'Clock skew + last write wins',
        fix: 'Logical clocks',
        tags: ['Cassandra', 'Riak'],
        demo(el, v) {
          const box = v.wrap(el);
          const mode = v.segmented(box, {
            options: [
              { value: 'lww', label: 'Wall-clock timestamps', kind: 'bad' },
              { value: 'lamport', label: 'Logical clock', kind: 'good' },
            ],
            value: 'lww',
            onChange: run,
          });
          let skew = -5;
          const fmtSkew = (x) => (x > 0 ? '+' : x < 0 ? '−' : '±') + Math.abs(x) + ' ms';
          v.slider(box, { label: "Node B's clock", min: -10, max: 10, value: -5, format: fmtSkew, onInput: (x) => { skew = x; run(); } });
          const st = v.stage(box, { w: 560, h: 246 });
          const cap = v.caption(box, '');
          v.controls(box, [{ label: 'Replay', icon: '▶', kind: 'primary', onClick: run }]);
          const X = (t) => 120 + t * 32;
          const LA = 70, LB = 160;
          let valA, valB;

          function frame(lam) {
            st.clear();
            [[LA, 'Node A', 'clock exact', 'muted'], [LB, 'Node B', lam ? 'uses counter' : 'clock ' + fmtSkew(skew), !lam && skew ? 'bad' : 'muted']].forEach(([y, n, s, k]) => {
              st.text(14, y - 9, n, { size: 14, anchor: 'start', bold: true });
              st.text(14, y + 10, s, { size: 12, anchor: 'start', kind: k });
              st.line(110, y, 450, y, { kind: 'muted', width: 1.5 });
            });
            st.line(110, 208, 450, 208, { width: 1 });
            [0, 5, 10].forEach((t) => st.text(X(t), 222, t + ' ms', { size: 12, kind: 'muted', mono: true }));
            st.text(X(5), 238, 'real time', { size: 12, kind: 'muted' });
            st.text(500, 28, 'stored', { size: 12, kind: 'muted', bold: true });
            valA = st.node({ x: 500, y: LA, w: 84, h: 38, label: '—', mono: true });
            valB = st.node({ x: 500, y: LB, w: 84, h: 38, label: '—', mono: true });
          }
          function mark(y, t, val, ts, kind, above) {
            st.rect(X(t) - 32, y - 13, 64, 26, { kind, label: val, mono: true, size: 13 });
            st.text(X(t), above ? y - 25 : y + 27, ts, { size: 12, kind: kind === 'bad' ? 'bad' : 'text2', mono: true, bold: true });
          }
          async function run() {
            v.restart();
            st.clearPackets();
            const lam = mode.get() === 'lamport';
            frame(lam);
            // real times: A writes at 1 ms, B receives at 3.5 ms, Bob writes at 5.5 ms
            const tsA = lam ? 1 : 1001, tsB = lam ? 2 : 1005.5 + skew;
            const f = (ts) => (lam ? 'L=' + ts : 'ts ' + ts.toFixed(1));
            const wins = tsB > tsA;
            cap.set('Alice sets x=10 on node A.', 'info');
            mark(LA, 1, 'x=10', f(tsA), 'info', true);
            valA.set({ label: 'x=10' });
            await v.sleep(800);
            await st.send({ x: X(1), y: LA }, { x: X(3.5), y: LB }, { label: 'x=10', kind: 'info', dur: 900 });
            st.line(X(1) + 6, LA + 14, X(3.5), LB - 14, { kind: 'info', width: 1.5, dashed: true, arrow: true });
            valB.set({ label: 'x=10' });
            cap.set('Bob reads x=10 on node B, then sets x=12.', 'info');
            await v.sleep(900);
            mark(LB, 5.5, wins ? 'x=12' : 'x=12 ✕', f(tsB), wins ? 'info' : 'bad', false);
            if (!wins) {
              valB.set({ kind: 'bad' });
              cap.set(`B's clock stamps the newer write ${f(tsB)} < ${f(tsA)}. LWW drops it.`, 'bad');
            } else valB.set({ label: 'x=12', kind: 'good' });
            await v.sleep(1100);
            await st.send({ x: X(5.5), y: LB }, { x: X(8), y: LA }, { label: 'x=12', kind: wins ? 'info' : 'bad', dur: 900 });
            st.line(X(5.5) + 6, LB - 14, X(8), LA + 14, { kind: wins ? 'info' : 'bad', width: 1.5, dashed: true, arrow: true });
            if (wins) {
              valA.set({ label: 'x=12', kind: 'good' });
              cap.set(lam ? 'B had seen L=1, so its write gets L=2 and wins everywhere.' : `Skew is small enough: ${f(tsB)} > ${f(tsA)}. The newer write wins.`, 'good');
            } else {
              valA.set({ kind: 'bad' });
              cap.set("Both nodes keep x=10. Bob's write vanished, with no error.", 'bad');
            }
          }
          run();
        },
      },

      /* 9 ─────────────────────────────────────────────── */
      {
        title: 'A clock reading is a range',
        lab: { id: 'clocks', preset: 'commit-wait' },
        caption: 'Each reading is really [earliest, latest]. Spanner waits out that uncertainty before confirming a commit, so causally later transactions get later timestamps.',
        problem: 'Overlapping uncertainty',
        fix: 'Commit wait',
        tags: ['Spanner', 'TrueTime'],
        demo(el, v) {
          const box = v.wrap(el);
          let eps = 6, eA = 0.8, eB = -0.8;
          v.slider(box, { label: 'Clock uncertainty ±ε', min: 1, max: 8, value: 6, format: (x) => x + ' ms', onInput: (x) => { eps = x; run(); } });
          const row = v.row(box);
          const wait = v.toggle(row, { label: 'Commit wait', value: false, onChange: run });
          v.controls(row, [
            { label: 'Run', icon: '▶', kind: 'primary', onClick: run },
            { label: 'New clock errors', icon: '↻', onClick: () => { eA = Math.random() * 2 - 1; eB = Math.random() * 2 - 1; run(); } },
          ]);
          const st = v.stage(box, { w: 560, h: 270 });
          const cap = v.caption(box, '');
          const LA = 88, LB = 172, TY = 236;
          let X = (t) => t;

          function frame(E, tMax) {
            st.clear();
            const k = 420 / tMax;
            X = (t) => 104 + t * k;
            [[LA, 'Node A', eA], [LB, 'Node B', eB]].forEach(([y, n, e]) => {
              st.text(14, y - 8, n, { size: 14, anchor: 'start', bold: true });
              st.text(14, y + 10, 'clock ' + (e >= 0 ? '+' : '−') + Math.abs(e * E).toFixed(1) + ' ms', { size: 12, anchor: 'start', kind: 'muted' });
              st.line(98, y, 530, y, { width: 1.5 });
            });
            st.line(98, TY, 530, TY, { width: 1.2 });
            st.text(14, TY, 'timestamps', { size: 12, anchor: 'start', kind: 'muted', bold: true });
            const step = E <= 2 ? 2 : E <= 5 ? 5 : 10;
            for (let t = 0; t <= tMax; t += step) st.text(X(t), TY + 18, String(t), { size: 12, kind: 'muted', mono: true });
            st.text(545, TY + 18, 'ms', { size: 12, kind: 'muted', mono: true });
          }
          function event(y, t, nm, kind) {
            dot(st, X(t), y, kind, 6);
            st.text(X(t) - 12, y, nm, { size: 13, kind, anchor: 'end', bold: true });
          }
          function interval(y, lo, hi, s, nm, kind) {
            st.rect(X(lo), y - 34, X(hi) - X(lo), 18, { kind, rx: 5, label: 'TT.now()', size: 12, mono: true });
            st.line(X(s), y - 40, X(s), y - 12, { kind, width: 2.5 });
            st.text(X(s), y - 48, `${nm} = ${s.toFixed(1)}`, { size: 12, kind, bold: true, mono: true, halo: true });
          }
          async function run() {
            v.restart();
            st.clearPackets();
            const E = eps, a = eA * E, b = eB * E, w = wait.get();
            const tMax = 6 * E + 4;
            frame(E, tMax);
            const t1 = 2 * E + 1, s1 = t1 + a + E;
            const ack = w ? t1 + 2 * E : t1, t2 = ack + 2, s2 = t2 + b + E;
            cap.set('T1 commits on A. Its timestamp s₁ is the latest possible time.', 'info');
            event(LA, t1, 'T1', 'primary');
            interval(LA, t1 + a - E, t1 + a + E, s1, 's₁', 'primary');
            await v.sleep(1000);
            if (w) {
              cap.set(`Commit wait: A holds the reply ${2 * E} ms, until s₁ is surely past.`, 'warn');
              const wb = st.rect(X(t1), LA + 8, 1, 16, { kind: 'warn', rx: 4, label: '', size: 12 });
              await v.tween(1200, (k) => wb.set({ w: Math.max(1, (X(ack) - X(t1)) * k) }), linear);
              wb.set({ label: 'commit wait' });
            }
            await st.send({ x: X(ack), y: LA }, { x: X(t2), y: LB }, { label: 'ok', kind: 'good', dur: 700 });
            st.line(X(ack), LA + 6, X(t2), LB - 8, { kind: 'good', width: 1.5, dashed: true, arrow: true });
            cap.set('T2 on B starts after hearing from T1: it is causally later.', 'info');
            event(LB, t2, 'T2', 'data');
            interval(LB, t2 + b - E, t2 + b + E, s2, 's₂', 'data');
            await v.sleep(1000);
            const close = Math.abs(X(s1) - X(s2)) < 30;
            [[s1, 's₁', 'primary', s1 >= s2 ? 1 : -1], [s2, 's₂', 'data', s2 > s1 ? 1 : -1]].forEach(([s, nm, kind, side]) => {
              st.line(X(s), TY - 8, X(s), TY + 6, { kind, width: 3 });
              st.text(X(s) + (close ? side * 12 : 0), TY - 18, nm, { size: 14, kind, bold: true, halo: true });
            });
            if (s2 > s1) {
              cap.set('s₂ > s₁: timestamp order matches causality. Snapshots stay consistent.', 'good');
            } else {
              const mid = (s1 + s2) / 2;
              st.line(X(mid), TY - 40, X(mid), TY + 4, { kind: 'bad', width: 2, dashed: true });
              st.text(X(mid), TY - 48, 'snapshot', { size: 12, kind: 'bad', bold: true, halo: true });
              cap.set('s₂ < s₁: a snapshot between them sees T2 but not T1.', 'bad');
            }
          }
          run();
        },
      },

      /* 10 ─────────────────────────────────────────────── */
      {
        title: 'Frozen node wakes up, already voted out',
        lab: { id: 'leases', preset: 'zombie' },
        caption: 'GC, VM suspension, swapping or slow disk I/O can freeze a node mid-task. Others then vote it dead, and the majority\'s verdict must win.',
        problem: 'Process pauses',
        fix: 'The majority decides; the old leader steps down',
        tags: ['JVM GC', 'VM migration', 'Raft terms'],
        demo(el, v) {
          const box = v.wrap(el);
          const cause = v.segmented(box, {
            options: [
              { value: 2, label: 'Disk I/O · 2 s' },
              { value: 6, label: 'Swapping · 6 s' },
              { value: 15, label: 'GC · 15 s' },
              { value: 40, label: 'VM suspend · 40 s' },
            ],
            value: 15,
            onChange: run,
          });
          const row = v.row(box);
          const maj = v.toggle(row, { label: 'Writes need a majority', value: false, onChange: run });
          v.controls(row, [{ label: 'Replay', icon: '▶', kind: 'primary', onClick: run }]);
          const st = v.stage(box, { w: 560, h: 276 });
          const cap = v.caption(box, '');
          const X = (t) => 104 + t * 8.5;
          const L = [74, 150, 222];
          const NAMES = { 2: 'slow disk I/O', 6: 'swapping', 15: 'GC pause', 40: 'VM suspended' };
          let now = 0, cursor, roles, pause, P;

          const grow = (tt) => pause.set({ w: Math.max(1, X(Math.min(P, tt)) - X(0)) });
          async function go(t) {
            const from = now;
            await v.tween(Math.max(60, (t - from) * 70), (k) => {
              const tt = from + (t - from) * k;
              cursor.set({ x1: X(tt), x2: X(tt) });
              grow(tt);
            }, linear);
            now = t;
          }
          async function run() {
            v.restart();
            st.clearPackets();
            st.clear();
            now = 0;
            P = Number(cause.get());
            const fix = maj.get();
            const nm = NAMES[P];
            roles = ['A', 'B', 'C'].map((n, i) => {
              st.text(14, L[i] - 8, 'Node ' + n, { size: 14, anchor: 'start', bold: true });
              st.line(100, L[i], 530, L[i], { width: 1.5 });
              return st.text(14, L[i] + 10, i ? 'follower' : 'leader', { size: 12, anchor: 'start', kind: i ? 'muted' : 'primary', bold: true });
            });
            st.line(100, 250, 530, 250, { width: 1 });
            [0, 10, 20, 30, 40, 50].forEach((t) => st.text(X(t), 266, t + ' s', { size: 12, kind: 'muted', mono: true }));
            st.rect(X(0), L[0] - 32, X(10) - X(0), 16, { kind: 'good', rx: 4, label: 'lease 10 s', size: 12 });
            pause = st.rect(X(0), L[0] - 8, 1, 16, { kind: 'warn', rx: 4, label: '', size: 12 });
            cursor = st.line(X(0), 34, X(0), 244, { kind: 'primary', width: 2, dashed: true, layer: 'top' });

            cap.set('A checks its lease: 10 s left. Then its thread freezes.', 'info');
            await v.sleep(800);
            if (P <= 10) {
              await go(P);
              st.text(X(P), L[0] + 24, 'writes ✓', { size: 12, kind: 'good', bold: true });
              cap.set(`Short pause (${nm}): the lease is still valid. The write is safe.`, 'good');
              await go(P + 4);
              return;
            }
            await go(10);
            st.text(X(10) + 6, L[0] - 24, 'expired', { size: 12, kind: 'bad', anchor: 'start', bold: true });
            st.text(X(10), L[1] - 20, 'A dead?', { size: 12, kind: 'warn', bold: true });
            st.text(X(10), L[2] - 20, 'A dead?', { size: 12, kind: 'warn', bold: true });
            cap.set('No heartbeats from A. B and C time out and vote.', 'warn');
            await st.send({ x: X(10.5), y: L[2] }, { x: X(11.5), y: L[1] }, { label: 'yes', kind: 'warn', dur: 600 });
            await go(12);
            st.rect(X(12), L[1] - 8, X(50) - X(12), 16, { kind: 'primary', rx: 4, label: 'B leads · term 2', size: 12 });
            roles[1].set('leader', 'primary');
            roles[0].set('declared dead', 'bad');
            cap.set('2 of 3 agree: A is dead. B becomes leader for term 2.', 'warn');
            await go(14);
            st.text(X(14), L[1] + 22, 'x=7 ✓', { size: 12, kind: 'primary', bold: true });
            await go(P);
            if (P >= 12) pause.set({ label: nm });
            const wake = st.text(X(P), L[0] + 24, 'x=5 as leader', { size: 12, kind: 'warn', bold: true });
            cap.set(`A wakes after ${P} s, unaware. It still thinks it leads.`, 'warn');
            await v.sleep(900);
            if (!fix) {
              roles[0].set('leader?!', 'bad');
              wake.set('x=5 written ✕', 'bad');
              cap.set('A writes x=5 alone while B wrote x=7. Two leaders: split brain.', 'bad');
            } else {
              await Promise.all([
                st.send({ x: X(P), y: L[0] }, { x: X(P + 1.5), y: L[1] }, { label: 'x=5 · term 1', kind: 'warn', dur: 700 }),
                v.sleep(200).then(() => st.send({ x: X(P), y: L[0] }, { x: X(P + 2), y: L[2] }, { label: 'x=5 · term 1', kind: 'warn', dur: 900 })),
              ]);
              await Promise.all([
                st.send({ x: X(P + 1.5), y: L[1] }, { x: X(P + 3), y: L[0] }, { label: 'no: term 2', kind: 'bad', dur: 700 }),
                v.sleep(250).then(() => st.send({ x: X(P + 2), y: L[2] }, { x: X(P + 3), y: L[0] }, { label: 'no: term 2', kind: 'bad', dur: 900 })),
              ]);
              roles[0].set('follower', 'good');
              wake.set('x=5 rejected', 'good');
              cap.set('The majority rejects term 1. A steps down. No harm done.', 'good');
            }
            await go(Math.min(50, P + 5));
          }
          run();
        },
      },

      /* 11 ─────────────────────────────────────────────── */
      {
        title: 'Expired lease, still writing? Fence it off.',
        lab: { id: 'leases', preset: 'zombie' },
        caption: 'A paused client can wake up believing it still holds the lock. If storage rejects writes carrying an older fencing token, the stale write bounces.',
        problem: 'Zombie lock holder',
        fix: 'Fencing tokens',
        tags: ['ZooKeeper', 'HBase'],
        demo(el, v) {
          const box = v.wrap(el);
          const mode = v.segmented(box, {
            options: [
              { value: 'bug', label: 'No fencing', kind: 'bad' },
              { value: 'fix', label: 'Fencing tokens', kind: 'good' },
            ],
            value: 'bug',
            onChange: run,
          });
          const st = v.stage(box, { w: 560, h: 296 });
          const lock = st.node({ x: 280, y: 46, w: 150, h: 48, label: 'Lock service', kind: 'primary' });
          const c1 = st.node({ x: 80, y: 150, w: 128, h: 52, label: 'Client 1' });
          const c2 = st.node({ x: 480, y: 150, w: 128, h: 52, label: 'Client 2' });
          const store = st.node({ x: 280, y: 248, w: 164, h: 62, label: 'Storage', shape: 'db' });
          st.link(c1, lock, { dashed: true, thin: true, arrow: false });
          st.link(c2, lock, { dashed: true, thin: true, arrow: false });
          st.link(c1, store, { dashed: true, thin: true, arrow: false });
          st.link(c2, store, { dashed: true, thin: true, arrow: false });
          const tl = v.tape(box, []);
          tl.el.style.justifyContent = 'center';
          const cap = v.caption(box, '');
          v.controls(box, [{ label: 'Replay', icon: '▶', kind: 'primary', onClick: run }]);
          const log = (text, kind) => tl.push({ text, kind, sm: true });

          async function run() {
            v.restart();
            st.clearPackets();
            tl.set([]);
            const f = mode.get() === 'fix';
            const tok = (n) => (f ? ' #' + n : '');
            lock.set({ sub: '' });
            c1.set({ kind: 'neutral', sub: '' });
            c2.set({ kind: 'neutral', sub: '' });
            store.set({ kind: 'neutral', sub: 'file: empty', badge: f ? 'max —' : '' });
            cap.set('Client 1 asks for the lease on the file.', 'info');
            await st.send(c1, lock, { label: 'get lease', kind: 'info', dur: 700 });
            await st.send(lock, c1, { label: 'ok' + tok(33), kind: 'good', dur: 700 });
            c1.set({ kind: 'good', sub: 'holds lease' + tok(33) });
            lock.set({ sub: 'held by client 1' });
            log('C1 lease' + tok(33), 'good');
            await v.sleep(500);
            c1.set({ kind: 'warn', sub: 'GC pause…' });
            log('C1 pauses', 'warn');
            cap.set('Client 1 freezes in a long GC pause.', 'warn');
            await v.sleep(1300);
            lock.set({ sub: 'lease expired' });
            log('lease expires', 'warn');
            cap.set('Its lease expires. Client 2 gets the lock.', 'info');
            await st.send(c2, lock, { label: 'get lease', kind: 'info', dur: 700 });
            await st.send(lock, c2, { label: 'ok' + tok(34), kind: 'good', dur: 700 });
            lock.set({ sub: 'held by client 2' });
            c2.set({ kind: 'good', sub: 'holds lease' + tok(34) });
            log('C2 lease' + tok(34), 'good');
            await st.send(c2, store, { label: 'write' + tok(34), kind: 'data', dur: 800 });
            store.set({ kind: 'good', sub: "file: client 2's data", badge: f ? 'max #34' : '' });
            log('C2 writes ✓', 'good');
            await v.sleep(500);
            c1.set({ kind: 'warn', sub: 'awake: "still mine"' });
            cap.set('Client 1 wakes up, unaware, and writes anyway.', 'warn');
            await st.send(c1, store, { label: 'write' + tok(33), kind: 'bad', dur: 800 });
            if (!f) {
              store.set({ kind: 'bad', sub: 'file: corrupted' });
              log('C1 writes too ✕', 'bad');
              cap.set('Storage accepts both writes. The file is corrupted.', 'bad');
              return;
            }
            await st.send(store, c1, { label: '33 < 34 ✕', kind: 'bad', dur: 700 });
            c1.set({ kind: 'neutral', sub: 'write rejected' });
            store.set({ kind: 'good' });
            log('C1 write rejected ✓', 'good');
            cap.set('Storage already saw token 34, so it rejects 33. The file is safe.', 'good');
          }
          run();
        },
      },

      /* 12 ─────────────────────────────────────────────── */
      {
        title: 'When nodes lie: Byzantine faults',
        caption: 'If nodes may send false messages, agreement needs more than two thirds of them honest. Inside one company\'s datacenter, simple checksums usually suffice.',
        problem: 'Lying nodes',
        fix: '> 2/3 honest, or cheap sanity checks',
        tags: ['Blockchains', 'Aerospace'],
        demo(el, v) {
          const box = v.wrap(el);
          let liars = 1;
          v.slider(box, { label: 'Lying nodes', min: 0, max: 2, value: 1, format: (x) => x + ' of 4', onInput: (x) => { liars = x; run(); } });
          const row = v.row(box);
          v.controls(row, [
            { label: 'Vote', icon: '▶', kind: 'primary', onClick: run },
            { label: 'Corrupt a packet', icon: '✱', kind: 'danger', onClick: corrupt },
          ]);
          const chk = v.toggle(row, { label: 'Checksums', value: false, onChange: corrupt });
          const st = v.stage(box, { w: 560, h: 250 });
          const POS = [[150, 58], [410, 58], [150, 196], [410, 196]];
          const N = POS.map(([x, y], i) => st.node({ x, y, w: 128, h: 52, label: 'Node ' + (i + 1) }));
          for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) st.link(N[i], N[j], { arrow: false, thin: true });
          const flip = st.text(280, 84, '', { size: 12, kind: 'bad', bold: true, halo: true });
          const stats = v.row(box, { center: true });
          const sHon = v.stat(stats, 'honest', '', 'good');
          v.stat(stats, 'needed', '> 2/3', 'info');
          const cap = v.caption(box, '');

          async function run() {
            v.restart();
            st.clearPackets();
            flip.set('');
            const isLiar = (i) => i >= 4 - liars;
            const honest = [0, 1, 2, 3].filter((i) => !isLiar(i));
            N.forEach((n, i) => n.set({ kind: isLiar(i) ? 'bad' : 'neutral', sub: isLiar(i) ? 'liar' : 'saw A', dim: false }));
            const pct = Math.round(((4 - liars) / 4) * 100);
            sHon.set(`${4 - liars} of 4 · ${pct}%`, pct > 67 ? 'good' : 'bad');
            cap.set('Each node tells the others what it saw. Honest nodes saw A.', 'info');
            await v.sleep(600);
            // each honest node counts its own view plus what the others claim
            const tally = N.map(() => ({ A: 0, B: 0 }));
            honest.forEach((j) => { tally[j].A++; });
            const jobs = [];
            for (let i = 0; i < 4; i++) {
              for (const j of honest) {
                if (i === j) continue;
                // liars tell every other honest node a different story
                const val = isLiar(i) && honest.indexOf(j) % 2 === 1 ? 'B' : 'A';
                tally[j][val]++;
                jobs.push(v.sleep(i * 220).then(() => st.send(N[i], N[j], { label: val, kind: val === 'A' ? 'good' : 'bad', dur: 1000 })));
              }
            }
            await Promise.all(jobs);
            let decided = 0;
            honest.forEach((j) => {
              const t = tally[j];
              if (t.A >= 3) { decided++; N[j].set({ kind: 'good', sub: `decides A (${t.A} of 4)` }); }
              else N[j].set({ kind: 'warn', sub: `stuck: ${t.A} A, ${t.B} B` });
            });
            if (!liars) cap.set('No liars: every node counts four votes for A and decides.', 'good');
            else if (decided === honest.length) cap.set('One liar of four: 3 honest votes still reach the quorum of 3.', 'good');
            else cap.set('Two liars of four: honest nodes can no longer agree.', 'bad');
          }
          async function corrupt() {
            v.restart();
            st.clearPackets();
            flip.set('');
            N.forEach((n, i) => n.set({ kind: 'neutral', sub: i < 2 ? '' : 'honest', dim: i >= 2 }));
            cap.set('Node 1 sends A to Node 2. A faulty NIC flips a bit.', 'info');
            const mid = { x: 280, y: 58 };
            await st.send(N[0], mid, { label: 'A', kind: 'good', dur: 600 });
            flip.set('bit flip');
            await st.send(mid, N[1], { label: 'B', kind: 'bad', dur: 600 });
            if (chk.get()) {
              N[1].set({ kind: 'warn', sub: 'checksum ✕' });
              cap.set('Checksum mismatch: Node 2 drops it and asks again.', 'warn');
              await st.send(N[1], N[0], { label: 'resend', kind: 'warn', dur: 800, curve: 34 });
              await st.send(N[0], N[1], { label: 'A', kind: 'good', dur: 800, curve: 34 });
              N[1].set({ kind: 'good', sub: 'got A ✓' });
              cap.set('A cheap checksum stops accidental lies. Not a real attacker, though.', 'good');
            } else {
              N[1].set({ kind: 'bad', sub: 'believes B' });
              cap.set('No checksum: Node 2 trusts corrupted data. Turn on checksums.', 'bad');
            }
          }
          run();
        },
      },

      /* 13 ─────────────────────────────────────────────── */
      {
        title: 'System models: what may go wrong?',
        caption: 'Algorithms are proven against a model of timing and node failures. Partially synchronous timing with crash-recovery nodes fits real systems best.',
        demo(el, v) {
          const box = v.wrap(el);
          const timing = v.segmented(box, {
            options: [
              { value: 'sync', label: 'Synchronous' },
              { value: 'partial', label: 'Partially synchronous' },
              { value: 'async', label: 'Asynchronous' },
            ],
            value: 'partial',
            onChange: run,
          });
          const nodes = v.segmented(box, {
            options: [
              { value: 'stop', label: 'Crash-stop' },
              { value: 'recover', label: 'Crash-recovery' },
              { value: 'byz', label: 'Byzantine' },
            ],
            value: 'recover',
            onChange: run,
          });
          const st = v.stage(box, { w: 560, h: 280 });
          const A = st.node({ x: 72, y: 50, w: 116, h: 52, label: 'Node A' });
          const B = st.node({ x: 470, y: 50, w: 116, h: 52, label: 'Node B' });
          st.link(A, B, { arrow: false, thin: true, dashed: true });
          st.text(100, 150, 'delay', { size: 12, kind: 'muted', anchor: 'end', bold: true });
          const stats = v.row(box, { center: true });
          const sT = v.stat(stats, 'timing', '', 'info');
          const sN = v.stat(stats, 'nodes', '', 'info');
          const cap = v.caption(box, '');
          v.controls(box, [{ label: 'Simulate', icon: '▶', kind: 'primary', onClick: run }]);
          const BASE = 250, U = 36;
          const BX = [150, 230, 310, 390, 470];
          let items = [];

          function delays(tm) {
            const r = (a, b) => a + Math.random() * (b - a);
            const ok = () => r(0.3, 0.9);
            if (tm === 'sync') return [ok(), ok(), ok(), ok(), ok()];
            if (tm === 'partial') return [ok(), r(2.6, 3.2), ok(), ok(), ok()];
            return [r(0.3, 3.2), r(0.3, 3.2), r(0.3, 3.2), r(0.3, 3.2), r(0.3, 3.2)];
          }
          function bar(i, d, tm) {
            if (d == null) {
              items.push(st.text(BX[i], BASE - 14, '✕ lost', { size: 12, kind: 'bad', bold: true }));
              return;
            }
            const h = d * U;
            const kind = d > 1 ? (tm === 'async' ? 'info' : 'bad') : 'good';
            items.push(st.rect(BX[i] - 22, BASE - h, 44, h, { kind, rx: 4 }));
            items.push(st.text(BX[i], BASE - h - 10, d.toFixed(1) + 'd', { size: 12, kind, bold: true, mono: true, halo: true }));
          }
          async function run() {
            v.restart();
            st.clearPackets();
            items.forEach((x) => x.remove());
            items = [];
            const tm = timing.get(), nm = nodes.get();
            const D = delays(tm);
            A.set({ kind: 'neutral', sub: tm === 'async' ? 'no clock' : 'uses timeouts' });
            B.set({ kind: 'neutral', down: false, sub: '', badge: '' });
            items.push(st.line(110, BASE, 510, BASE, { width: 1.2 }));
            if (tm !== 'async') {
              items.push(st.line(110, BASE - U, 510, BASE - U, { kind: 'warn', dashed: true, width: 2 }));
              items.push(st.text(100, BASE - U, 'bound d', { size: 12, kind: 'warn', anchor: 'end', bold: true }));
            } else items.push(st.text(100, BASE - U, 'no bound', { size: 12, kind: 'muted', anchor: 'end', bold: true }));
            BX.forEach((x, i) => items.push(st.text(x, BASE + 16, 'msg ' + (i + 1), { size: 12, kind: 'muted' })));
            const TV = { sync: ['optimistic', 'warn'], partial: ['realistic', 'good'], async: ['very strict', 'info'] }[tm];
            const NV = { stop: ['too simple', 'warn'], recover: ['realistic', 'good'], byz: ['rarely needed', 'info'] }[nm];
            sT.set(TV[0], TV[1]);
            sN.set(NV[0], NV[1]);
            cap.set('Node A sends five messages to B. Watch the delays.', 'info');
            for (let i = 0; i < 5; i++) {
              const lost = (nm === 'stop' && i >= 3) || (nm === 'recover' && i === 3);
              if (i === 3 && nm !== 'byz') {
                B.set({ kind: 'bad', down: true, sub: nm === 'stop' ? 'crashed for good' : 'crashed' });
                cap.set(nm === 'stop' ? 'Crash-stop: B dies and never comes back.' : 'Crash-recovery: B crashes, but may come back.', 'warn');
              }
              await st.send(A, B, { label: 'm' + (i + 1), dur: D[i] * 650, drop: lost ? 0.8 : false });
              if (lost) {
                bar(i, null, tm);
                if (nm === 'recover') {
                  await v.sleep(500);
                  B.set({ kind: 'warn', down: false, sub: 'memory lost', badge: 'disk ✓' });
                  cap.set('B restarts: disk survived, in-memory state is gone.', 'warn');
                }
                continue;
              }
              bar(i, D[i], tm);
              if (tm === 'partial' && i === 1) cap.set('One message blows past the bound. Then things calm down.', 'warn');
              if (nm === 'byz' && i === 3) {
                B.set({ kind: 'bad', sub: 'lies' });
                cap.set('Byzantine: B answers with a lie.', 'bad');
                await st.send(B, A, { label: 'lie', kind: 'bad', dur: 650 });
                A.set({ kind: 'bad', sub: 'fooled?' });
              }
            }
            if (tm === 'partial' && nm === 'recover') cap.set('Partially synchronous + crash-recovery: the most useful model of reality.', 'good');
            else if (tm === 'sync') cap.set('Synchronous: every delay stays under the bound. Real networks break this.', 'warn');
            else if (tm === 'async') cap.set('Asynchronous: no timing assumptions, no clocks, no timeouts. Very restrictive.', 'info');
            else cap.set('Partial synchrony: bounds usually hold, sometimes break, then recover.', 'info');
          }
          run();
        },
      },

      /* 14 ─────────────────────────────────────────────── */
      {
        title: 'Safety vs liveness: never bad, eventually good',
        caption: 'Break a safety property and you can name the moment; it cannot be undone. Liveness says something good eventually happens, often with caveats.',
        demo(el, v) {
          const box = v.wrap(el);
          const ITEMS = [
            ['No two clients ever get the same fencing token.', 'safety'],
            ['A client that asks for a token eventually gets one.', 'liveness'],
            ['Fencing tokens only ever go up.', 'safety'],
            ['All replicas eventually hold the same value.', 'liveness'],
            ['A committed write is never lost.', 'safety'],
            ['Every request eventually gets a response.', 'liveness'],
            ['There is at most one leader per term.', 'safety'],
            ['A crashed node is eventually suspected by the others.', 'liveness'],
          ];
          let i = 0, right = 0, total = 0, answered = false;
          const prop = v.caption(box, '');
          prop.el.style.fontSize = '18px';
          prop.el.style.fontWeight = '600';
          const st = v.stage(box, { w: 560, h: 150 });
          const fb = v.caption(box, '');
          const ctl = v.controls(box, [
            { id: 's', label: 'Safety', icon: '⚑', onClick: () => answer('safety') },
            { id: 'l', label: 'Liveness', icon: '↗', onClick: () => answer('liveness') },
            { id: 'n', label: 'Next', icon: '▶', kind: 'primary', onClick: next },
          ]);
          const stats = v.row(box, { center: true });
          const sScore = v.stat(stats, 'score', '0 / 0', 'info');

          function axis() {
            st.clear();
            st.line(40, 76, 524, 76, { width: 2, arrow: true });
            st.text(524, 100, 'time', { size: 12, kind: 'muted', anchor: 'end' });
          }
          function blank() {
            v.restart();
            axis();
            st.text(280, 40, '?', { size: 34, kind: 'muted', bold: true });
          }
          async function illustrate(kind) {
            v.restart();
            axis();
            if (kind === 'safety') {
              st.line(40, 76, 290, 76, { kind: 'good', width: 5 });
              st.text(165, 52, 'holds', { size: 13, kind: 'good', bold: true });
              await v.sleep(350);
              st.text(300, 77, '✕', { size: 30, kind: 'bad', bold: true });
              st.text(300, 116, 'broken at this exact moment', { size: 13, kind: 'bad', bold: true });
              st.line(318, 76, 500, 76, { kind: 'bad', width: 5, dashed: true });
              st.text(410, 52, 'damage stays', { size: 13, kind: 'bad', bold: true });
            } else {
              dot(st, 70, 76, 'info', 7);
              st.text(70, 104, 'request', { size: 13, kind: 'info', bold: true });
              const p = st.line(80, 76, 80, 76, { kind: 'warn', width: 4, dotted: true });
              st.text(255, 52, 'not yet… still possible', { size: 13, kind: 'warn', bold: true });
              await v.tween(1200, (k) => p.set({ x2: 80 + 360 * k }), linear);
              dot(st, 450, 76, 'good', 11);
              st.text(450, 77, '✓', { size: 14, kind: 'good', bold: true });
              st.text(450, 106, 'eventually', { size: 13, kind: 'good', bold: true });
            }
          }
          function answer(a) {
            if (answered) return;
            answered = true;
            const truth = ITEMS[i][1];
            const ok = a === truth;
            total++;
            if (ok) right++;
            sScore.set(`${right} / ${total}`, right === total ? 'good' : 'warn');
            prop.set(ITEMS[i][0], ok ? 'good' : 'bad');
            fb.set((ok ? '✓ Right. ' : '✕ Not quite. ') + (truth === 'safety'
              ? 'Safety: broken at one moment, and it cannot be undone.'
              : 'Liveness: "not yet" is fine; it can still happen later.'), ok ? 'good' : 'bad');
            ctl.set('s', { disabled: true });
            ctl.set('l', { disabled: true });
            illustrate(truth);
          }
          function show() {
            answered = false;
            ctl.set('s', { disabled: false });
            ctl.set('l', { disabled: false });
            prop.set(ITEMS[i][0], 'primary');
            fb.set('Safety or liveness? Hint: watch for "eventually".', 'info');
            blank();
          }
          function next() {
            i = (i + 1) % ITEMS.length;
            show();
          }
          show();
        },
      },
    ],

    cheatsheet: [
      { term: 'Partial failure', text: 'Some parts break while others work, unpredictably.', kind: 'bad' },
      { term: 'No reply', text: 'Lost request, dead or paused node, lost reply: all look the same.', kind: 'warn' },
      { term: 'Timeout', text: 'Short: false alarms. Long: slow detection. φ accrual adapts it.', kind: 'primary' },
      { term: 'Packet switching', text: 'Shares links for bursty traffic: cheap, but queues make delay unbounded.', kind: 'info' },
      { term: 'Monotonic clock', text: 'For durations. Never jumps back, unlike the time-of-day clock.', kind: 'good' },
      { term: 'Clock drift', text: 'Quartz drifts; NTP accuracy is limited by network delay.', kind: 'warn' },
      { term: 'Last write wins', text: 'Clock skew can silently drop a causally later write.', kind: 'bad' },
      { term: 'TrueTime', text: 'A reading is [earliest, latest]; commit wait outlasts the gap.', kind: 'primary' },
      { term: 'Process pause', text: 'GC, VM suspend, swapping: a node can freeze at any line.', kind: 'warn' },
      { term: 'Majority rules', text: 'A quorum decides, even that a node is dead.', kind: 'info' },
      { term: 'Fencing token', text: 'Grows with every lease; storage rejects older tokens.', kind: 'good' },
      { term: 'Byzantine fault', text: 'A node lies. Tolerating it needs more than 2/3 honest nodes.', kind: 'bad' },
      { term: 'System model', text: 'Realistic: partially synchronous timing, crash-recovery nodes.', kind: 'primary' },
      { term: 'Safety / liveness', text: 'Nothing bad ever happens / something good eventually happens.', kind: 'good' },
    ],

    quiz: [
      {
        q: 'Your request timed out with no reply. What do you know for sure?',
        options: ['The server crashed', 'The request was lost', 'Nothing: it may even have been processed'],
        answer: 2,
        why: 'A lost request, a dead or paused node and a lost reply all look identical to the sender.',
      },
      {
        q: 'Which clock should measure how long a request took?',
        options: ['The time-of-day clock', 'The monotonic clock', 'Either: they always agree'],
        answer: 1,
        why: 'NTP or a leap second can step the time-of-day clock back; the monotonic clock only moves forward.',
      },
      {
        q: 'Node B\'s clock runs 5 ms behind A\'s. B writes a key 3 ms after A wrote it. Under last-write-wins:',
        options: ['B\'s write wins', 'Both writes are kept', 'B\'s newer write is silently discarded'],
        answer: 2,
        why: 'B\'s timestamp comes out 2 ms lower than A\'s, so LWW keeps the older value.',
      },
      {
        q: 'A lock holder pauses for GC, its lease expires, then it wakes and writes. What reliably prevents corruption?',
        options: ['A longer lease', 'Re-checking the lease right before writing', 'Storage rejecting writes with an older fencing token'],
        answer: 2,
        why: 'A pause can strike right after any check. Only the storage can enforce token order.',
      },
      {
        q: 'A Byzantine fault-tolerant cluster has 4 nodes. How many may lie?',
        options: ['None', 'One', 'Two'],
        answer: 1,
        why: 'More than two thirds must be honest: with 4 nodes, at most 1 may lie.',
      },
    ],
  });
})();
