/* Chapter 1 — Reliable, scalable and maintainable applications */
DDIA.chapter({
  id: 1,
  part: 1,
  title: 'Reliable, scalable, maintainable',
  short: 'Reliable & scalable',
  tagline: 'The three goals every data system chases',
  cards: [
    /* 1 ─────────────────────────────────────────────── */
    {
      title: 'One app, many data tools',
      caption: 'Modern apps glue together a database, a cache, a search index and a queue. You are the data-system designer.',
      tags: ['PostgreSQL', 'Redis', 'Elasticsearch', 'Kafka'],
      demo(el, v) {
        const box = v.wrap(el);
        const mode = v.segmented(box, {
          options: [
            { value: 'hit', label: 'Read · cache hit' },
            { value: 'miss', label: 'Read · cache miss' },
            { value: 'write', label: 'Write' },
          ],
          value: 'hit',
          onChange: run,
        });
        const st = v.stage(box, { w: 560, h: 310 });
        const user = st.node({ x: 45, y: 160, w: 54, h: 54, shape: 'person', label: 'User' });
        const app = st.node({ x: 170, y: 160, label: 'App code', kind: 'primary' });
        const cache = st.node({ x: 330, y: 55, label: 'Cache', kind: 'warn', shape: 'db' });
        const db = st.node({ x: 330, y: 160, label: 'Database', kind: 'good', shape: 'db' });
        const queue = st.node({ x: 330, y: 265, label: 'Queue', kind: 'data', shape: 'pill' });
        const index = st.node({ x: 490, y: 160, label: 'Search', sub: 'index', kind: 'info', shape: 'db' });
        const worker = st.node({ x: 490, y: 265, label: 'Worker', sub: 'sends email' });
        st.link(user, app, { both: true });
        st.link(app, cache);
        st.link(app, db);
        st.link(app, queue);
        st.link(db, index, { label: 'sync', dashed: true });
        st.link(queue, worker);
        const cap = v.caption(box, '');
        v.controls(box, [{ label: 'Replay', icon: '▶', kind: 'primary', onClick: run }]);

        async function run() {
          v.restart();
          st.clearPackets();
          const m = mode.get();
          if (m === 'hit') {
            cap.set('User asks for a page', 'info');
            await st.send(user, app, { label: 'GET' });
            await st.send(app, cache, { label: '?' });
            cap.set('The cache has it: the fast path', 'good');
            await st.send(cache, app, { label: 'hit', kind: 'good' });
            await st.send(app, user, { label: 'page', kind: 'good' });
            cap.set('Answered from memory. The database never saw it.', 'good');
          } else if (m === 'miss') {
            cap.set('User asks for a page', 'info');
            await st.send(user, app, { label: 'GET' });
            await st.send(app, cache, { label: '?' });
            cap.set('Cache miss. Fall back to the database.', 'warn');
            await st.send(cache, app, { label: 'miss', kind: 'bad' });
            await st.send(app, db, { label: 'query' });
            await st.send(db, app, { label: 'rows', kind: 'good' });
            cap.set('Store the result in the cache for next time', 'info');
            await Promise.all([st.send(app, cache, { label: 'put', kind: 'warn' }), st.send(app, user, { label: 'page', kind: 'good' })]);
            cap.set('Slower, but the next read is a hit.', 'good');
          } else {
            cap.set('User saves something', 'info');
            await st.send(user, app, { label: 'POST' });
            cap.set('One write fans out to every tool that must stay in sync', 'warn');
            await Promise.all([
              st.send(app, db, { label: 'write', kind: 'good' }),
              st.send(app, cache, { label: 'invalidate', kind: 'warn' }),
              st.send(app, queue, { label: 'job', kind: 'data' }),
            ]);
            await Promise.all([st.send(db, index, { label: 'change', kind: 'info' }), st.send(queue, worker, { label: 'email', kind: 'data' })]);
            await st.send(app, user, { label: 'ok', kind: 'good' });
            cap.set('Keeping all copies consistent is your job now.', 'primary');
          }
        }
        run();
      },
    },

    /* 2 ─────────────────────────────────────────────── */
    {
      title: 'A fault is not a failure',
      caption: 'A fault is one part breaking. A failure is when users notice. Reliability means turning faults into non-events.',
      problem: 'A server crashes',
      fix: 'Redundancy',
      demo(el, v) {
        const box = v.wrap(el);
        const top = v.row(box);
        const red = v.toggle(top, { label: 'Redundant servers', value: false, onChange: paint });
        const ctl = v.controls(top, [
          { id: 'kill', label: 'Crash a server', icon: '✕', kind: 'danger', onClick: crash },
          { id: 'fix', label: 'Repair all', icon: '↺', onClick: () => { up = [true, true, true]; paint(); } },
        ]);
        void ctl;
        const st = v.stage(box, { w: 560, h: 270 });
        const user = st.node({ x: 55, y: 135, w: 58, h: 58, shape: 'person', label: 'Users' });
        const lb = st.node({ x: 200, y: 135, label: 'Router', w: 100 });
        const servers = [0, 1, 2].map((i) => st.node({ x: 400, y: 45 + i * 90, label: 'Server ' + 'ABC'[i] }));
        st.link(user, lb);
        servers.forEach((s) => st.link(lb, s, { dashed: true, thin: true }));
        const stats = v.row(box, { center: true });
        const okStat = v.stat(stats, 'served', '0', 'good');
        const errStat = v.stat(stats, 'errors', '0', 'bad');
        const cap = v.caption(box, 'Traffic is flowing. Try crashing a server.');
        let up = [true, true, true];
        let ok = 0, err = 0;
        const active = (i) => red.get() || i === 0;

        function paint() {
          servers.forEach((s, i) => {
            if (!active(i)) s.set({ kind: 'ghost', down: false, label: 'Server ' + 'ABC'[i], sub: 'not bought' });
            else s.set({ kind: up[i] ? 'good' : 'bad', down: !up[i], label: 'Server ' + 'ABC'[i], sub: up[i] ? 'healthy' : 'crashed' });
          });
          const live = servers.filter((_, i) => active(i) && up[i]).length;
          if (live === 0) cap.set('Failure: every request errors. Users are affected.', 'bad');
          else if (up.some((u, i) => active(i) && !u)) cap.set('Fault tolerated: a server died but users are fine.', 'good');
          else cap.set(red.get() ? 'Three servers share the load.' : 'One server. Single point of failure.', 'info');
        }
        function crash() {
          const alive = servers.map((_, i) => i).filter((i) => active(i) && up[i]);
          if (!alive.length) return;
          up[alive[Math.floor(Math.random() * alive.length)]] = false;
          paint();
        }
        let turn = 0;
        async function tick() {
          const live = servers.filter((_, i) => active(i) && up[i]);
          await st.send(user, lb, { dur: 500 });
          if (!live.length) {
            await st.send(lb, servers[0], { drop: true, kind: 'bad', dur: 700 });
            errStat.set(String(++err), 'bad');
            return;
          }
          const target = live[turn++ % live.length];
          await st.send(lb, target, { kind: 'good', dur: 600 });
          okStat.set(String(++ok), 'good');
        }
        paint();
        tick();
        v.every(1300, tick);
      },
    },

    /* 3 ─────────────────────────────────────────────── */
    {
      title: 'At scale, disks die every day',
      caption: 'One disk lasts decades. Ten thousand disks lose about one per day. Hardware faults are normal, so plan for them.',
      problem: 'Random hardware faults',
      fix: 'Replicate + tolerate',
      demo(el, v) {
        const box = v.wrap(el);
        const sizes = [100, 1000, 10000, 100000];
        const fmt = (n) => n.toLocaleString('en-US');
        let disks = 10000, mttf = 27;
        const sliders = v.grid(box, 240);
        v.slider(sliders, { label: 'Disks', min: 0, max: 3, value: 2, format: (i) => fmt(sizes[i]), onInput: (i) => { disks = sizes[i]; update(); } });
        v.slider(sliders, { label: 'Disk lifetime (years)', min: 10, max: 50, value: 27, onInput: (x) => { mttf = x; update(); } });
        const stats = v.row(box, { center: true });
        const sDay = v.stat(stats, 'dead disks / day', '1', 'bad');
        const sYear = v.stat(stats, 'dead disks / year', '370', 'warn');
        const sDays = v.stat(stats, 'day', '0', 'info');
        const grid = v.h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(25, 1fr)', gap: '3px', maxWidth: '520px', margin: '0 auto', width: '100%' } });
        box.appendChild(grid);
        const cells = Array.from({ length: 200 }, () => {
          const c = v.h('div', { style: { aspectRatio: '1', borderRadius: '3px', background: 'var(--k-good-f)', border: '1px solid var(--k-good-s)', transition: 'background .3s' } });
          grid.appendChild(c);
          return c;
        });
        const note = v.h('div', { class: 'vz-muted', style: { textAlign: 'center' } });
        box.appendChild(note);
        let day = 0;
        function perDay() { return disks / (mttf * 365); }
        function update() {
          const d = perDay();
          sDay.set(d >= 10 ? String(Math.round(d)) : d.toFixed(d < 0.1 ? 3 : 1), d >= 1 ? 'bad' : 'warn');
          sYear.set(fmt(Math.round(d * 365)), 'warn');
          note.textContent = `Each square ≈ ${fmt(Math.max(1, Math.round(disks / 200)))} disk${disks > 200 ? 's' : ''}. Red = failed today.`;
        }
        function poisson(l) { let L = Math.exp(-l), k = 0, p = 1; do { k++; p *= Math.random(); } while (p > L); return k - 1; }
        function tick() {
          day++;
          sDays.set(String(day), 'info');
          cells.forEach((c) => { c.style.background = 'var(--k-good-f)'; c.style.borderColor = 'var(--k-good-s)'; });
          const n = Math.min(200, poisson(Math.min(perDay(), 150)));
          for (let i = 0; i < n; i++) {
            const c = cells[Math.floor(Math.random() * cells.length)];
            c.style.background = 'var(--k-bad-s)';
            c.style.borderColor = 'var(--k-bad-s)';
          }
        }
        update();
        v.every(900, tick);
      },
    },

    /* 4 ─────────────────────────────────────────────── */
    {
      title: 'Software bugs hit every node at once',
      caption: 'Hardware faults are random and independent. A bug runs on every machine, so it can take all of them down together.',
      problem: 'Correlated faults',
      fix: 'Testing, isolation, crash-restart, monitoring',
      demo(el, v) {
        const box = v.wrap(el);
        const ctl = v.controls(box, [
          { label: 'Hardware fault', icon: '⚙', onClick: hw },
          { label: 'Leap-second bug', icon: '✱', kind: 'danger', onClick: bug },
          { label: 'Restart all', icon: '↺', onClick: reset },
        ]);
        void ctl;
        const st = v.stage(box, { w: 560, h: 200 });
        const nodes = Array.from({ length: 6 }, (_, i) => st.node({ x: 55 + i * 90, y: 90, w: 78, h: 56, label: 'Node ' + (i + 1), sub: 'v1.2', kind: 'good' }));
        const clock = st.text(280, 170, '', { size: 14, kind: 'muted', mono: true });
        const cap = v.caption(box, 'Six nodes, same software version.');
        function reset() {
          v.restart();
          clock.set('');
          nodes.forEach((n) => n.set({ kind: 'good', down: false, sub: 'v1.2' }));
          cap.set('Six nodes, same software version.', 'info');
        }
        function hw() {
          reset();
          const n = nodes[Math.floor(Math.random() * nodes.length)];
          n.set({ kind: 'bad', down: true, sub: 'disk died' });
          cap.set('One node down. The other five carry on. Independent fault.', 'good');
        }
        async function bug() {
          reset();
          clock.set('23:59:60 — leap second inserted', 'warn');
          cap.set('Every node hits the same bad input at the same moment…', 'warn');
          for (const n of nodes) {
            n.set({ kind: 'bad', down: true, sub: 'hung' });
            await v.sleep(140);
          }
          cap.set('All six hang together. Redundancy does not help against a shared bug.', 'bad');
        }
        reset();
      },
    },

    /* 5 ─────────────────────────────────────────────── */
    {
      title: 'Humans cause most outages',
      caption: 'Bad config pushes are a leading cause of outages. Layers of safety limit the blast radius.',
      problem: 'Operator error',
      fix: 'Sandboxes, tests, canaries, fast rollback',
      demo(el, v) {
        const box = v.wrap(el);
        const guards = [
          { key: 'sandbox', label: 'Sandbox', sub: 'try safely', hit: 0 },
          { key: 'tests', label: 'Tests', sub: 'automated', hit: 0 },
          { key: 'canary', label: 'Canary', sub: '1% of users', hit: 1 },
          { key: 'rollback', label: 'Rollback', sub: 'fast undo', hit: 100 },
        ];
        const on = { sandbox: false, tests: false, canary: true, rollback: true };
        const row = v.row(box);
        guards.forEach((g) => v.toggle(row, { label: g.label, value: on[g.key], onChange: (b) => { on[g.key] = b; paint(); } }));
        const st = v.stage(box, { w: 560, h: 190 });
        const ops = st.node({ x: 40, y: 95, w: 56, h: 56, shape: 'person', label: 'Operator' });
        const gn = guards.map((g, i) => st.node({ x: 140 + i * 95, y: 95, w: 82, h: 52, label: g.label, sub: g.sub }));
        const users = st.node({ x: 520, y: 95, w: 70, h: 52, label: 'Users', sub: '100%', kind: 'info' });
        st.link(ops, gn[0]);
        for (let i = 0; i < gn.length - 1; i++) st.link(gn[i], gn[i + 1]);
        st.link(gn[gn.length - 1], users);
        const stats = v.row(box, { center: true });
        const hurt = v.stat(stats, 'users hurt', '—', 'info');
        const cap = v.caption(box, 'Pick your safeguards, then push a bad config.');
        v.controls(box, [{ label: 'Push bad config', icon: '↗', kind: 'primary', onClick: push }]);
        function paint() {
          gn.forEach((n, i) => n.set({ kind: on[guards[i].key] ? 'good' : 'ghost' }));
          users.set({ kind: 'info' });
          hurt.set('—', 'info');
        }
        async function push() {
          v.restart();
          st.clearPackets();
          paint();
          let from = ops;
          for (let i = 0; i < gn.length; i++) {
            const g = guards[i];
            await st.send(from, gn[i], { label: 'cfg', kind: 'bad', dur: 600 });
            if (on[g.key]) {
              gn[i].flash();
              if (g.key === 'rollback') {
                await st.send(gn[i], users, { label: 'cfg', kind: 'bad', dur: 600 });
                users.set({ kind: 'warn' });
                hurt.set('100% · minutes', 'warn');
                cap.set('Everyone saw errors, but rollback undid it within minutes.', 'warn');
              } else {
                hurt.set(g.hit + '%', g.hit ? 'warn' : 'good');
                cap.set(`Caught by ${g.label.toLowerCase()}. ${g.hit ? 'Only 1% of users noticed.' : 'No user noticed.'}`, 'good');
              }
              return;
            }
            from = gn[i];
          }
          await st.send(from, users, { label: 'cfg', kind: 'bad', dur: 600 });
          users.set({ kind: 'bad' });
          hurt.set('100% · hours', 'bad');
          cap.set('Nothing stopped it. Full outage until someone notices.', 'bad');
        }
        paint();
      },
    },

    /* 6 ─────────────────────────────────────────────── */
    {
      title: 'Describe your load: timelines',
      caption: 'Timeline reads outnumber tweet writes roughly 60 to 1. So do the work at write time, except for celebrities.',
      problem: 'Reading a timeline = a big join',
      fix: 'Fan-out on write (+ hybrid for celebrities)',
      demo(el, v) {
        const box = v.wrap(el);
        const mode = v.segmented(box, {
          options: [
            { value: 'pull', label: '① Pull on read' },
            { value: 'push', label: '② Push on write' },
            { value: 'hybrid', label: '③ Hybrid' },
          ],
          value: 'pull',
          onChange: paint,
        });
        const st = v.stage(box, { w: 560, h: 300 });
        const alice = st.node({ x: 50, y: 80, w: 56, h: 56, shape: 'person', label: 'Alice' });
        const celeb = st.node({ x: 50, y: 225, w: 56, h: 56, shape: 'person', label: 'Celebrity', kind: 'warn', badge: '30M' });
        const tweets = st.node({ x: 205, y: 150, label: 'Tweets', sub: 'table', kind: 'good', shape: 'db' });
        const tls = [0, 1, 2].map((i) => st.node({ x: 375, y: 60 + i * 90, w: 118, label: ['Bob', 'Cara', 'Dan'][i] + "'s feed", sub: 'cache', kind: 'warn' }));
        const bob = st.node({ x: 515, y: 60, w: 50, h: 50, shape: 'person', label: 'Bob' });
        st.link(alice, tweets);
        st.link(celeb, tweets);
        const fan = tls.map((t) => st.link(tweets, t, { dashed: true, thin: true }));
        st.link(bob, tls[0], { thin: true });
        const rs = v.row(box, { center: true });
        const wStat = v.stat(rs, 'writes per tweet', '1', 'info');
        const rStat = v.stat(rs, 'lookups per feed view', '3', 'info');
        v.stat(rs, 'tweets / sec', '4.6k');
        v.stat(rs, 'feed reads / sec', '300k');
        const cap = v.caption(box, '');
        v.controls(box, [
          { label: 'Alice tweets', icon: '✎', onClick: () => post(alice, false) },
          { label: 'Celebrity tweets', icon: '★', kind: 'danger', onClick: () => post(celeb, true) },
          { label: 'Bob opens feed', icon: '◉', kind: 'primary', onClick: read },
        ]);
        function paint() {
          v.restart();
          st.clearPackets();
          const m = mode.get();
          tls.forEach((t) => t.dim(m === 'pull'));
          fan.forEach((f) => f.show(m !== 'pull'));
          wStat.set(m === 'pull' ? '1' : 'followers', m === 'pull' ? 'good' : 'warn');
          rStat.set(m === 'pull' ? 'follows' : m === 'push' ? '1' : '1 + celebs', m === 'pull' ? 'bad' : 'good');
          cap.set(
            m === 'pull' ? 'Store each tweet once. Build the feed at read time by merging everyone Bob follows.'
              : m === 'push' ? 'Copy each tweet into every follower\'s feed cache. Reading is then one lookup.'
                : 'Push for normal users. Pull celebrity tweets at read time and merge them in.',
            'info');
        }
        async function post(who, isCeleb) {
          v.restart();
          st.clearPackets();
          const m = mode.get();
          await st.send(who, tweets, { label: 'tweet', kind: 'data' });
          if (m === 'pull' || (m === 'hybrid' && isCeleb)) {
            cap.set('One write. Cheap to post.', 'good');
            return;
          }
          await Promise.all(tls.map((t) => st.send(tweets, t, { label: 'copy', kind: 'data', dur: 700 })));
          if (isCeleb) cap.set('One celebrity tweet → 30,000,000 feed writes. Ouch.', 'bad');
          else cap.set('A few writes per tweet. Fine for normal users.', 'good');
        }
        async function read() {
          v.restart();
          st.clearPackets();
          const m = mode.get();
          if (m === 'pull') {
            await st.send(bob, tweets, { label: 'join', kind: 'primary', curve: -30 });
            await Promise.all([0, 1, 2].map((i) => v.sleep(i * 150).then(() => st.send(tweets, bob, { label: 'tweets', kind: 'good', curve: 40 }))));
            cap.set('Merge every followee\'s tweets on each view. Slow at 300k views/sec.', 'bad');
          } else {
            await st.send(bob, tls[0], { label: 'get', kind: 'primary' });
            const jobs = [st.send(tls[0], bob, { label: 'feed', kind: 'good' })];
            if (m === 'hybrid') jobs.push(st.send(tweets, bob, { label: 'celeb', kind: 'warn', curve: 40 }));
            await Promise.all(jobs);
            cap.set(m === 'push' ? 'One cache read. Fast.' : 'Feed cache + a few celebrity tweets. Fast and affordable.', 'good');
          }
        }
        paint();
      },
    },

    /* 7 ─────────────────────────────────────────────── */
    {
      title: 'Averages lie: use percentiles',
      caption: 'Sort the response times. p50 is the typical user. p99 is the 1-in-100 unlucky one, often your most valuable customer.',
      tags: ['p50', 'p95', 'p99', 'p999'],
      demo(el, v) {
        const box = v.wrap(el);
        const top = v.row(box);
        let outliers = 4;
        let sorted = false;
        v.slider(top, { label: 'Slow outliers', min: 0, max: 15, value: 4, format: (x) => x + '%', onInput: (x) => { outliers = x; gen(); } });
        const sortT = v.toggle(top, { label: 'Sort by time', value: false, onChange: (b) => { sorted = b; draw(); } });
        void sortT;
        v.controls(top, [{ label: 'New requests', icon: '↻', onClick: gen }]);
        const st = v.stage(box, { w: 560, h: 250 });
        const stats = v.row(box, { center: true });
        const sMean = v.stat(stats, 'mean', '', 'warn');
        const s50 = v.stat(stats, 'p50 median', '', 'good');
        const s95 = v.stat(stats, 'p95', '', 'info');
        const s99 = v.stat(stats, 'p99', '', 'bad');
        let data = [];
        const N = 100;
        function gen() {
          data = Array.from({ length: N }, () => {
            const base = 40 + Math.exp(Math.random() * 1.2 + Math.random()) * 18;
            return Math.random() * 100 < outliers ? base + 250 + Math.random() * 450 : base;
          });
          draw();
        }
        const pct = (arr, p) => { const s = arr.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]; };
        function draw() {
          st.clear();
          const X0 = 40, X1 = 550, Y0 = 225, Y1 = 15;
          const max = Math.max(800, ...data);
          const y = (ms) => Y0 - ((Y0 - Y1) * ms) / max;
          const bw = (X1 - X0) / N;
          const list = sorted ? data.slice().sort((a, b) => a - b) : data;
          const p50 = pct(data, 50), p95 = pct(data, 95), p99 = pct(data, 99);
          const mean = data.reduce((a, b) => a + b, 0) / N;
          list.forEach((ms, i) => {
            const k = ms >= p99 ? 'bad' : ms >= p95 ? 'info' : 'neutral';
            st.rect(X0 + i * bw + 0.5, y(ms), Math.max(1, bw - 1.2), Y0 - y(ms), { kind: k, rx: 1.5, strokeWidth: 0.6 });
          });
          st.line(X0, Y0, X1, Y0, { kind: 'muted', width: 1 });
          [0, 200, 400, 600, 800].forEach((t) => { if (t <= max) st.text(X0 - 6, y(t), t + '', { size: 11, anchor: 'end', kind: 'muted', mono: true }); });
          st.text(X0 + 6, Y1 + 2, 'ms', { size: 11, anchor: 'start', kind: 'muted' });
          const mark = (val, label, kind) => {
            st.line(X0, y(val), X1, y(val), { kind, dashed: true, width: 1.6, layer: 'top' });
            st.text(X1, y(val) - 8, label, { size: 12, anchor: 'end', kind, bold: true, halo: true });
          };
          mark(mean, 'mean', 'warn');
          mark(p50, 'p50', 'good');
          mark(p95, 'p95', 'info');
          mark(p99, 'p99', 'bad');
          if (sorted) {
            [[50, 'good'], [95, 'info'], [99, 'bad']].forEach(([p, k]) => {
              const x = X0 + (p / 100) * (X1 - X0);
              st.line(x, Y0, x, Y0 + 12, { kind: k, width: 2 });
            });
          }
          sMean.set(Math.round(mean) + ' ms', 'warn');
          s50.set(Math.round(p50) + ' ms', 'good');
          s95.set(Math.round(p95) + ' ms', 'info');
          s99.set(Math.round(p99) + ' ms', 'bad');
        }
        gen();
      },
    },

    /* 8 ─────────────────────────────────────────────── */
    {
      title: 'Tail latency amplification',
      caption: 'If one page needs many backend calls, one slow call makes the whole page slow. Rare slowness becomes common.',
      problem: 'Many parallel calls per request',
      fix: 'Watch p99, not the average',
      demo(el, v) {
        const box = v.wrap(el);
        let n = 20, p = 1;
        const sl = v.grid(box, 240);
        v.slider(sl, { label: 'Backend calls per page', min: 1, max: 100, value: 20, onInput: (x) => { n = x; update(); } });
        v.slider(sl, { label: 'Each call slow', min: 1, max: 10, value: 1, format: (x) => x + '%', onInput: (x) => { p = x; update(); } });
        const stats = v.row(box, { center: true });
        const sP = v.stat(stats, 'pages that feel slow', '', 'bad');
        const st = v.stage(box, { w: 560, h: 210 });
        const cap = v.caption(box, '');
        v.controls(box, [{ label: 'Load a page', icon: '▶', kind: 'primary', onClick: sample }]);
        const grid = [];
        function drawGrid() {
          st.clear();
          grid.length = 0;
          st.text(20, 16, 'backend calls for one page load', { size: 12, anchor: 'start', kind: 'muted' });
          const cols = 20, size = 13, gap = 4;
          for (let i = 0; i < n; i++) {
            const cx = 20 + (i % cols) * (size + gap), cy = 30 + Math.floor(i / cols) * (size + gap);
            grid.push(st.rect(cx, cy, size, size, { kind: 'neutral', rx: 3 }));
          }
          // curve: P(slow page) vs number of calls
          const gx = 390, gy = 30, gw = 160, gh = 150;
          st.box(gx - 10, gy - 12, gw + 22, gh + 44, { kind: 'neutral', label: '' });
          st.line(gx, gy + gh, gx + gw, gy + gh, { width: 1 });
          st.line(gx, gy, gx, gy + gh, { width: 1 });
          let d = '';
          for (let k = 1; k <= 100; k++) {
            const pr = 1 - Math.pow(1 - p / 100, k);
            d += (k === 1 ? 'M' : 'L') + (gx + (k / 100) * gw) + ',' + (gy + gh - pr * gh);
          }
          st.path(d, { kind: 'bad', width: 2.4 });
          const pr = 1 - Math.pow(1 - p / 100, n);
          const mx = gx + (n / 100) * gw, my = gy + gh - pr * gh;
          st.add('circle', { cx: mx, cy: my, r: 6, class: 'vz-shape k-bad', 'stroke-width': 2 });
          st.text(gx + gw / 2, gy + gh + 18, 'calls per page →', { size: 11, kind: 'muted' });
          st.text(gx - 2, gy - 2, '100%', { size: 10, anchor: 'end', kind: 'muted', mono: true });
        }
        function update() {
          const pr = 1 - Math.pow(1 - p / 100, n);
          sP.set(Math.round(pr * 100) + '%', pr > 0.3 ? 'bad' : pr > 0.1 ? 'warn' : 'good');
          cap.set(`${p}% slow per call × ${n} calls → ${Math.round(pr * 100)}% of pages wait on a slow call.`, pr > 0.3 ? 'bad' : 'info');
          drawGrid();
        }
        function sample() {
          let slow = 0;
          grid.forEach((r) => { const bad = Math.random() < p / 100; if (bad) slow++; r.set({ kind: bad ? 'bad' : 'good' }); });
          cap.set(slow ? `${slow} slow call${slow > 1 ? 's' : ''}. The page waits for the slowest one.` : 'Lucky: every call was fast this time.', slow ? 'bad' : 'good');
        }
        update();
      },
    },

    /* 9 ─────────────────────────────────────────────── */
    {
      title: 'Scale up or scale out?',
      caption: 'Scale up means one bigger machine. Scale out means many small ones. Stateless services scale out easily; databases are harder.',
      tags: ['vertical', 'horizontal', 'elastic'],
      demo(el, v) {
        const box = v.wrap(el);
        let load = 3;
        v.slider(box, { label: 'Load', min: 1, max: 10, value: 3, format: (x) => x + '×', onInput: (x) => { load = x; draw(); } });
        const st = v.stage(box, { w: 560, h: 250 });
        const cap = v.caption(box, '');
        function draw() {
          st.clear();
          st.box(10, 10, 265, 230, { label: 'SCALE UP', kind: 'primary' });
          st.box(285, 10, 265, 230, { label: 'SCALE OUT', kind: 'good' });
          const maxed = load > 6;
          const size = 40 + Math.min(load, 6) * 18;
          st.node({ x: 142, y: 115, w: size, h: size * 0.8, label: maxed ? 'MAXED' : 'Big box', sub: maxed ? 'no bigger exists' : `${load}× CPU/RAM`, kind: maxed ? 'bad' : 'primary' });
          const cols = 4;
          for (let i = 0; i < load; i++) {
            st.node({ x: 330 + (i % cols) * 58, y: 60 + Math.floor(i / cols) * 58, w: 46, h: 40, label: '', kind: 'good' });
          }
          const upCost = Math.round(Math.pow(load, 1.8) * 10);
          const outCost = Math.round(load * 12 + 8);
          costBar(25, 205, upCost, 'primary');
          costBar(300, 205, outCost, 'good');
          cap.set(maxed ? 'The biggest machine is not big enough, and it cost a fortune. Time to scale out.' : 'Up is simpler to run. Out is cheaper at scale, but adds distributed-systems pain.', maxed ? 'bad' : 'info');
        }
        function costBar(x, y, cost, kind) {
          st.text(x, y - 10, 'cost', { size: 11, anchor: 'start', kind: 'muted' });
          st.rect(x, y, Math.min(235, cost * 0.8), 14, { kind, rx: 4 });
          st.text(x + Math.min(235, cost * 0.8) + 6, y + 8, '$' + cost, { size: 12, anchor: 'start', kind: 'text2', mono: true });
        }
        draw();
      },
    },

    /* 10 ─────────────────────────────────────────────── */
    {
      title: 'Maintainable = operable, simple, evolvable',
      caption: 'Most cost comes after launch. Good abstractions hide accidental complexity so people can run, understand and change the system.',
      problem: 'Big ball of mud',
      fix: 'Abstraction',
      demo(el, v) {
        const box = v.wrap(el);
        const mode = v.segmented(box, { options: [{ value: 'mud', label: 'Big ball of mud', kind: 'bad' }, { value: 'clean', label: 'With an abstraction', kind: 'good' }], value: 'mud', onChange: draw });
        const st = v.stage(box, { w: 560, h: 300 });
        const stats = v.row(box, { center: true });
        const sLinks = v.stat(stats, 'connections to understand', '', 'bad');
        const pillars = v.row(box, { center: true });
        [['Operability', 'easy to run', 'info'], ['Simplicity', 'easy to understand', 'primary'], ['Evolvability', 'easy to change', 'good']].forEach(([a, b, k]) => {
          pillars.appendChild(v.cell(`${a} · ${b}`, k));
        });
        const names = ['Billing', 'Users', 'Search', 'Email', 'Orders', 'Stock', 'Reports', 'Auth'];
        function draw() {
          st.clear();
          const clean = mode.get() === 'clean';
          const cx = 280, cy = 150, R = 118;
          const nodes = names.map((nm, i) => {
            const a = (i / names.length) * Math.PI * 2 - Math.PI / 2;
            return st.node({ x: cx + Math.cos(a) * R * 1.7, y: cy + Math.sin(a) * R, w: 84, h: 38, label: nm, kind: clean ? 'good' : 'neutral' });
          });
          let count = 0;
          if (clean) {
            const api = st.node({ x: cx, y: cy, w: 120, h: 50, label: 'Data API', sub: 'one clean interface', kind: 'primary' });
            nodes.forEach((n) => { st.link(n, api, { arrow: false, kind: 'good' }); count++; });
          } else {
            const pairs = [[0, 3], [0, 4], [0, 1], [1, 2], [1, 5], [1, 7], [2, 6], [2, 4], [3, 6], [3, 7], [4, 5], [4, 6], [5, 7], [6, 0], [7, 2], [3, 5], [6, 1], [2, 5]];
            pairs.forEach(([a, b]) => { st.link(nodes[a], nodes[b], { arrow: false, kind: 'bad', thin: true, curve: ((a + b) % 3 - 1) * 30 }); count++; });
          }
          sLinks.set(String(count), clean ? 'good' : 'bad');
        }
        draw();
      },
    },
  ],

  cheatsheet: [
    { term: 'Reliability', text: 'Keeps working correctly even when things go wrong.', kind: 'good' },
    { term: 'Fault vs failure', text: 'Fault: a part breaks. Failure: users are affected.', kind: 'bad' },
    { term: 'Hardware faults', text: 'Random and independent. Handle them with redundancy.', kind: 'warn' },
    { term: 'Software faults', text: 'Correlated: the same bug hits every node at once.', kind: 'bad' },
    { term: 'Human error', text: 'A top outage cause. Use sandboxes, tests, canaries and rollback.', kind: 'warn' },
    { term: 'Load parameters', text: 'The numbers that describe your load, e.g. reads/sec or fan-out.', kind: 'info' },
    { term: 'Fan-out on write', text: 'Precompute each follower\'s feed when a tweet is posted.', kind: 'data' },
    { term: 'Percentiles', text: 'p50 = typical user. p99/p999 = the tail. Better than the mean.', kind: 'primary' },
    { term: 'Tail amplification', text: 'Many backend calls per request make slow outliers common.', kind: 'bad' },
    { term: 'Scale up / out', text: 'Bigger machine vs more machines. Many systems mix both.', kind: 'info' },
    { term: 'Maintainability', text: 'Operability + simplicity + evolvability.', kind: 'good' },
    { term: 'SLO / SLA', text: 'Promised targets, e.g. p50 < 200 ms and p99 < 1 s.', kind: 'primary' },
  ],

  quiz: [
    {
      q: 'Ten thousand disks, each lasting ~27 years. Roughly how many fail per day?',
      options: ['About one', 'About one per year', 'About a hundred'],
      answer: 0,
      why: '10,000 ÷ (27 × 365) ≈ 1. At scale, hardware faults are daily events.',
    },
    {
      q: 'Why can a software bug be worse than a hardware fault?',
      options: ['It is harder to detect', 'It can hit every node at the same time', 'It only happens at night'],
      answer: 1,
      why: 'Every machine runs the same code, so the fault is correlated. Redundancy alone does not save you.',
    },
    {
      q: 'Your mean latency is 90 ms. What should you also track?',
      options: ['Only the minimum', 'High percentiles like p99', 'CPU temperature'],
      answer: 1,
      why: 'Means hide outliers. p95/p99/p999 show how the slowest users experience the system.',
    },
    {
      q: 'Twitter-style feeds: why precompute feeds at write time?',
      options: ['Writes are more frequent than reads', 'Feed reads vastly outnumber tweet writes', 'It uses less storage'],
      answer: 1,
      why: 'About 300k feed reads/sec vs 4.6k tweets/sec, so shift the work to the rarer operation. Celebrities are the exception.',
    },
    {
      q: 'A page calls 50 backends. Each is slow 1% of the time. Roughly how often is the page slow?',
      options: ['1%', 'About 40%', '50%'],
      answer: 1,
      why: '1 − 0.99⁵⁰ ≈ 0.39. That is tail latency amplification.',
    },
  ],
});
