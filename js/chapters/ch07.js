/* Chapter 7 — Transactions */
(function () {
  'use strict';

  /* ── Local timeline kit ─────────────────────────────────────────────
   * Transaction lanes + value lanes. Each step of a scenario occupies one
   * time slot; ops are labeled bars, value lanes show the stored value.
   * scenario = { rows: [{label, sub, val}], ys: [y…], init: {row: [text, kind]},
   *              steps: [{ ops: [[row, label, kind, untilStep?]], vals: {row: [text, kind]},
   *                        ring: [row, slot, kind], cap, kind }], decor(st, L, i, sc) }
   */
  const X0 = 96, X1 = 550;

  function lanes(st, rows, ys, n) {
    const sw = (X1 - X0) / n;
    const top = ys[0] - 24, bot = ys[ys.length - 1] + 22;
    rows.forEach((r, k) => {
      const y = ys[k];
      st.line(X0 - 4, y, X1, y, { kind: 'muted', width: r.val ? 1 : 1.4, dashed: !!r.val });
      st.text(10, r.sub ? y - 8 : y, r.label, { anchor: 'start', size: 14, bold: !r.val, kind: r.val ? 'text2' : 'text' });
      if (r.sub) st.text(10, y + 10, r.sub, { anchor: 'start', size: 12, kind: 'muted' });
    });
    st.text(X1, bot + 12, 'time →', { anchor: 'end', size: 12, kind: 'muted' });
    return {
      sw, top, bot,
      x: (i) => X0 + sw * i,
      band(i) { st.rect(X0 + sw * i, top, sw, bot - top, { kind: 'info', rx: 8 }).set({ opacity: 0.22 }); },
      bar(r, i, label, kind, span = 1) {
        const val = !!rows[r].val;
        const w = sw * span - 6, hh = val ? 24 : 28;
        const cw = val ? 0.62 : 0.56; // rough glyph width per px of font size
        let size = 14;
        while (size > 12 && label && label.length * size * cw > w - 8) size--;
        return st.rect(X0 + sw * i + 3, ys[r] - hh / 2, w, hh, { kind: kind || 'neutral', label, size, rx: val ? 5 : 8, mono: val });
      },
      ring(r, i, kind = 'info', span = 1) {
        st.add('rect', { x: X0 + sw * i + 0.5, y: ys[r] - 17, width: sw * span - 1, height: 34, rx: 8, fill: 'none', 'stroke-width': 2.5, class: `vz-stroke k-${kind}` });
      },
      vline(x, label, kind = 'info') {
        st.line(x, top - 2, x, bot, { kind, dashed: true, width: 1.6 });
        if (label) st.text(x + 4, top - 10, label, { anchor: 'start', size: 12, kind, bold: true });
      },
    };
  }

  /** Value-lane contents after step i. */
  function valsAt(sc, i) {
    const cur = Object.assign({}, sc.init);
    for (let s = 0; s <= i; s++) Object.assign(cur, sc.steps[s].vals || {});
    return cur;
  }

  /** Waiting slots and aborts up to step i (for stats). */
  function tally(sc, i) {
    let waits = 0, aborts = 0;
    for (let s = 0; s <= i; s++) {
      (sc.steps[s].ops || []).forEach((op) => {
        if (!op) return;
        if (op[3] != null) waits += Math.max(1, Math.min(i, op[3]) - s + 1);
        if (op[1] === 'ABORT') aborts++;
      });
    }
    return { waits, aborts };
  }

  async function drawTL(v, st, sc, i, anim) {
    st.clear();
    const L = lanes(st, sc.rows, sc.ys, sc.steps.length);
    L.band(i);
    if (sc.decor) sc.decor(st, L, i, sc);
    const fresh = [];
    // value lanes: carry values forward and merge equal neighbours into one segment
    const cur = Object.assign({}, sc.init);
    const per = {};
    for (let s = 0; s <= i; s++) {
      Object.assign(cur, sc.steps[s].vals || {});
      Object.keys(cur).forEach((r) => { (per[r] = per[r] || [])[s] = cur[r]; });
    }
    Object.keys(per).forEach((r) => {
      const a = per[r];
      let from = 0;
      for (let s = 1; s <= i + 1; s++) {
        if (s <= i && a[s][0] === a[from][0] && a[s][1] === a[from][1]) continue;
        const b = L.bar(+r, from, a[from][0], a[from][1], s - from);
        if (from === i) fresh.push(b);
        from = s;
      }
    });
    for (let s = 0; s <= i; s++) {
      (sc.steps[s].ops || []).forEach((op) => {
        if (!op) return;
        const [r, label, kind, until] = op;
        const span = until != null ? Math.max(1, Math.min(i, until) - s + 1) : 1;
        const b = L.bar(r, s, label, kind, span);
        if (s === i) fresh.push(b);
      });
    }
    const ring = sc.steps[i].ring; // [row, slot, kind]: wraps the whole value segment holding that slot
    if (ring) {
      const [r, at, kind] = ring;
      const a = per[r];
      let from = at, to = at;
      if (a) {
        const same = (s) => a[s] && a[s][0] === a[at][0] && a[s][1] === a[at][1];
        while (from > 0 && same(from - 1)) from--;
        while (to < i && same(to + 1)) to++;
      }
      L.ring(r, from, kind, to - from + 1);
    }
    if (anim && fresh.length) {
      fresh.forEach((b) => b.set({ opacity: 0 }));
      await v.tween(320, (t) => fresh.forEach((b) => b.set({ opacity: t })));
    }
  }

  /** A stepper bound to a scenario that can change (e.g. a new isolation level).
   *  Same step count: captions are swapped in place and the current step is redrawn.
   *  Different count: the stepper is rebuilt. Returns mk(); call it after any change. */
  function tlStepper(v, parent, st, getSc, onStep) {
    const slot = v.h('div', { class: 'vz' });
    parent.appendChild(slot);
    let sp = null, steps = [], cur = null, ver = 0;
    return function mk() {
      cur = getSc();
      const caps = cur.steps.map((s) => ({ caption: s.cap, kind: s.kind }));
      if (sp && caps.length === steps.length) {
        caps.forEach((c, k) => { steps[k] = c; });
        sp.go(sp.index);
        return;
      }
      const at = sp ? sp.index : 0;
      const my = ++ver;
      if (sp) sp.go(0); // stops any autoplay; its render is now a no-op
      slot.textContent = '';
      steps = caps;
      sp = v.stepper(slot, {
        steps,
        render: (i, anim) => {
          if (my !== ver) return undefined;
          if (onStep) onStep(cur, i);
          return drawTL(v, st, cur, i, anim);
        },
      });
      if (at) sp.go(Math.min(at, steps.length - 1));
    };
  }

  const S = (ops, vals, cap, kind, extra) => Object.assign({ ops: ops || [], vals: vals || null, cap, kind }, extra || {});
  const Y4 = [42, 98, 152, 208];
  const DOCS = [
    { label: 'Kim', sub: 'T1' },
    { label: 'Kim row', sub: 'on call?', val: true },
    { label: 'Ray row', sub: 'on call?', val: true },
    { label: 'Ray', sub: 'T2' },
  ];
  /** Doctors still on call (committed view: a pending "off" still counts as on). */
  function onCall(sc, i) {
    const cur = valsAt(sc, i);
    return [1, 2].filter((r) => cur[r][0] === 'on' || cur[r][1] === 'warn').length;
  }

  /* ── The chapter ──────────────────────────────────────────────────── */
  DDIA.chapter({
    id: 7,
    part: 2,
    title: 'Transactions',
    short: 'Transactions',
    tagline: 'All or nothing, as if alone',
    cards: [
      /* 1 ─────────────────────────────────────────────── */
      {
        title: 'Pull one ACID letter, watch it break',
        caption: 'Atomic: all or nothing. Consistent: your rules hold. Isolated: no peeking at half-done work. Durable: committed stays committed.',
        problem: 'A missing guarantee',
        fix: 'ACID transaction',
        demo(el, v) {
          const box = v.wrap(el);
          const top = v.row(box);
          const letter = v.segmented(top, {
            options: [
              { value: 'A', label: 'A · Atomic' },
              { value: 'C', label: 'C · Consistent' },
              { value: 'I', label: 'I · Isolated' },
              { value: 'D', label: 'D · Durable' },
            ],
            value: 'A',
            onChange: run,
          });
          const guard = v.toggle(top, { label: 'Guarantee on', value: false, onChange: run });
          const st = v.stage(box, { w: 560, h: 250 });
          const dbBox = st.box(198, 12, 204, 226, { label: 'DATABASE', kind: 'neutral' });
          const app = st.node({ x: 80, y: 125, label: 'App', sub: 'move $50', kind: 'primary' });
          const chk = st.node({ x: 300, y: 82, w: 150, label: 'Checking', sub: '$100', kind: 'neutral' });
          const sav = st.node({ x: 300, y: 182, w: 150, label: 'Savings', sub: '$0', kind: 'neutral' });
          const side = st.node({ x: 486, y: 130, w: 108, h: 56, label: '' });
          st.link(app, chk, { thin: true, dashed: true, arrow: false });
          st.link(app, sav, { thin: true, dashed: true, arrow: false });
          const stats = v.row(box, { center: true });
          const sTotal = v.stat(stats, 'total money', '$100', 'good');
          const sOut = v.stat(stats, 'outcome', '—', 'info');
          const cap = v.caption(box, '');
          v.controls(box, [{ label: 'Replay', icon: '▶', kind: 'primary', onClick: run }]);

          function reset() {
            v.restart();
            st.clearPackets();
            const L = letter.get(), on = guard.get();
            dbBox.set({ kind: 'neutral', label: 'DATABASE' });
            app.set({ kind: 'primary', sub: 'move $50' });
            chk.set({ kind: 'neutral', down: false, sub: '$100' });
            sav.set({ kind: 'neutral', down: false, sub: '$0' });
            sTotal.set('$100', 'good');
            sOut.set('—', 'info');
            side.show(L !== 'A');
            if (L === 'C') side.set({ shape: 'rect', w: 108, h: 56, label: 'Your rule', sub: on ? 'balance ≥ 0' : 'not declared', kind: on ? 'good' : 'ghost' });
            if (L === 'I') side.set({ shape: 'person', w: 56, h: 56, label: 'Auditor', sub: '', kind: 'info' });
            if (L === 'D') side.set({ shape: 'doc', w: 108, h: 56, label: 'Disk log', sub: on ? 'write-ahead' : 'none', kind: on ? 'good' : 'ghost' });
          }
          async function crash(label) {
            dbBox.set({ kind: 'bad', label });
            chk.set({ down: true });
            sav.set({ down: true });
            await v.sleep(1100);
            dbBox.set({ kind: 'neutral', label: 'RESTARTED' });
            chk.set({ down: false });
            sav.set({ down: false });
          }
          async function run() {
            reset();
            const L = letter.get(), on = guard.get();
            if (L === 'A') {
              cap.set('Move $50: debit checking, then credit savings.', 'info');
              await st.send(app, chk, { label: '−50' });
              chk.set({ sub: '$50', kind: 'warn' });
              sTotal.set('$50', 'warn');
              cap.set('The database crashes between the two writes.', 'bad');
              await crash('CRASH');
              if (on) {
                chk.set({ sub: '$100', kind: 'good' });
                sTotal.set('$100', 'good');
                sOut.set('rolled back', 'good');
                cap.set('Atomic: the half-done transfer is undone. Safe to retry.', 'good');
              } else {
                chk.set({ kind: 'bad' });
                sTotal.set('$50', 'bad');
                sOut.set('$50 lost', 'bad');
                cap.set('Half a transfer survived the crash. $50 vanished.', 'bad');
              }
            } else if (L === 'C') {
              app.set({ sub: 'move $150' });
              cap.set('A buggy app moves $150, but checking only has $100.', 'info');
              await Promise.all([st.send(app, chk, { label: '−150' }), st.send(app, sav, { label: '+150' })]);
              if (on) {
                await st.send(chk, side, { label: '−50?', kind: 'bad' });
                chk.set({ kind: 'good' });
                sOut.set('aborted', 'good');
                cap.set('Your declared rule rejects it, so the transaction aborts.', 'good');
              } else {
                chk.set({ sub: '−$50', kind: 'bad' });
                sav.set({ sub: '$150' });
                sOut.set('rule broken', 'bad');
                cap.set('Stored as told: −$50. The DB can’t know rules you never gave it.', 'bad');
              }
            } else if (L === 'I') {
              cap.set('A transfer runs while an auditor sums all balances.', 'info');
              await st.send(app, chk, { label: '−50' });
              chk.set({ sub: '$50', kind: 'warn' });
              cap.set('Mid-transfer, the auditor reads both accounts.', 'warn');
              await Promise.all([
                st.send(chk, side, { label: on ? '$100' : '$50', kind: on ? 'good' : 'bad' }),
                st.send(sav, side, { label: '$0', kind: 'info' }),
              ]);
              side.set({ kind: on ? 'good' : 'bad' });
              sOut.set(on ? 'saw $100' : 'saw $50', on ? 'good' : 'bad');
              await st.send(app, sav, { label: '+50' });
              chk.set({ kind: 'neutral' });
              sav.set({ sub: '$50' });
              cap.set(on ? 'Isolated: the auditor saw the state before, never half.' : 'The auditor saw half a transfer: $50 seemed missing.', on ? 'good' : 'bad');
            } else {
              cap.set('The transfer commits and the app hears “ok”.', 'info');
              await Promise.all([st.send(app, chk, { label: '−50' }), st.send(app, sav, { label: '+50' })]);
              chk.set({ sub: '$50' });
              sav.set({ sub: '$50' });
              if (on) await st.send(chk, side, { label: 'log', kind: 'data' });
              await st.send({ x: 200, y: 130 }, app, { label: 'ok', kind: 'good' });
              cap.set('Then the power fails.', 'bad');
              await crash('POWER LOSS');
              if (on) {
                await st.send(side, chk, { label: 'replay', kind: 'data' });
                chk.set({ kind: 'good' });
                sav.set({ kind: 'good' });
                sOut.set('kept', 'good');
                cap.set('Replayed from the disk log. Disks die too: add replicas and backups.', 'good');
              } else {
                chk.set({ sub: '$100', kind: 'bad' });
                sav.set({ sub: '$0', kind: 'bad' });
                sOut.set('commit lost', 'bad');
                cap.set('It lived only in memory. The confirmed transfer is gone.', 'bad');
              }
            }
          }
          run();
        },
      },

      /* 2 ─────────────────────────────────────────────── */
      {
        title: 'New mail, but the unread badge says 0',
        caption: 'An email insert and its counter bump belong together. A multi-object transaction applies both or neither, and hides the in-between.',
        problem: 'Half-applied writes',
        fix: 'Multi-object transaction',
        tags: ['BEGIN … COMMIT'],
        demo(el, v) {
          const box = v.wrap(el);
          const mode = v.segmented(box, {
            options: [
              { value: 'sep', label: 'Two separate writes', kind: 'bad' },
              { value: 'tx', label: 'One transaction', kind: 'good' },
            ],
            value: 'sep',
            onChange: () => peek(),
          });
          const st = v.stage(box, { w: 560, h: 240 });
          st.box(198, 12, 200, 216, { label: 'DATABASE', kind: 'neutral' });
          const mail = st.node({ x: 80, y: 70, label: 'Mail in', sub: 'new email', kind: 'primary' });
          const inbox = st.node({ x: 298, y: 76, w: 150, label: 'Inbox', sub: '2 emails', kind: 'neutral' });
          const counter = st.node({ x: 298, y: 180, w: 150, label: 'Unread', sub: '0', kind: 'neutral' });
          const view = st.node({ x: 484, y: 128, w: 128, h: 60, label: 'User view', sub: '—', kind: 'info' });
          st.link(mail, inbox, { thin: true, dashed: true, arrow: false });
          st.link(mail, counter, { thin: true, dashed: true, arrow: false });
          const cap = v.caption(box, '');
          v.controls(box, [
            { label: 'User refreshes midway', icon: '◉', kind: 'primary', onClick: peek },
            { label: 'Crash midway', icon: '✕', kind: 'danger', onClick: crash },
          ]);

          function reset() {
            v.restart();
            st.clearPackets();
            mail.set({ down: false, kind: 'primary', sub: 'new email' });
            inbox.set({ sub: '2 emails', kind: 'neutral' });
            counter.set({ sub: '0', kind: 'neutral' });
            view.set({ sub: '—', kind: 'info' });
          }
          async function insert(tx) {
            cap.set(tx ? 'BEGIN. Insert the new email…' : 'Insert the new email…', 'info');
            await st.send(mail, inbox, { label: 'insert', kind: 'data' });
            inbox.set({ sub: '3 emails', kind: tx ? 'warn' : 'neutral' });
          }
          async function peek() {
            reset();
            const tx = mode.get() === 'tx';
            await insert(tx);
            cap.set('The user refreshes before the counter is bumped.', 'warn');
            await Promise.all([st.send(view, inbox, { label: 'list', kind: 'info' }), st.send(view, counter, { label: 'count', kind: 'info' })]);
            await Promise.all([
              st.send(inbox, view, { label: tx ? '2 mails' : '3 mails', kind: tx ? 'good' : 'bad' }),
              st.send(counter, view, { label: '0', kind: 'info' }),
            ]);
            view.set(tx ? { sub: '0 new · badge 0', kind: 'good' } : { sub: '1 new · badge 0', kind: 'bad' });
            cap.set(tx ? 'Isolation: the user sees the old state, fully consistent.' : 'One new email, badge says 0. The two objects disagree.', tx ? 'good' : 'bad');
            await v.sleep(1200);
            await st.send(mail, counter, { label: '+1', kind: 'data' });
            counter.set({ sub: '1' });
            if (tx) {
              inbox.set({ kind: 'good' });
              counter.set({ kind: 'good' });
              cap.set('COMMIT: both changes appear at the same instant.', 'good');
            } else {
              cap.set('The counter catches up, but the user already saw a mismatch.', 'warn');
            }
          }
          async function crash() {
            reset();
            const tx = mode.get() === 'tx';
            await insert(tx);
            await v.sleep(300);
            mail.set({ down: true, kind: 'bad', sub: 'crashed' });
            cap.set('The mail process crashes before bumping the counter.', 'bad');
            await v.sleep(1000);
            if (tx) {
              inbox.set({ sub: '2 emails', kind: 'good' });
              counter.set({ kind: 'good' });
              cap.set('Atomicity: the insert is rolled back. A retry starts clean.', 'good');
            } else {
              inbox.set({ kind: 'bad' });
              counter.set({ kind: 'bad' });
              cap.set('3 emails, badge 0. Stuck until someone repairs it.', 'bad');
            }
          }
          peek();
        },
      },

      /* 3 ─────────────────────────────────────────────── */
      {
        title: 'Retry aborts, but mind three traps',
        caption: 'Aborting makes retries safe, mostly. A lost reply causes duplicates, retries pile onto overload, and permanent errors never succeed.',
        problem: 'Blind retries',
        fix: 'Dedupe keys, backoff, give up',
        demo(el, v) {
          const box = v.wrap(el);
          const top = v.row(box);
          const kase = v.segmented(top, {
            options: [
              { value: 'ack', label: 'Lost reply' },
              { value: 'load', label: 'Overload' },
              { value: 'perm', label: 'Permanent error' },
            ],
            value: 'ack',
            onChange: run,
          });
          const safe = v.toggle(top, { label: 'Retry safely', value: false, onChange: run });
          const st = v.stage(box, { w: 560, h: 230 });
          const stats = v.row(box, { center: true });
          const sA = v.stat(stats, 'attempts', '0', 'info');
          const sR = v.stat(stats, 'result', '—', 'info');
          const cap = v.caption(box, '');
          v.controls(box, [{ label: 'Replay', icon: '▶', kind: 'primary', onClick: run }]);

          async function run() {
            v.restart();
            st.clearPackets();
            st.clear();
            const k = kase.get(), ok = safe.get();
            const db = st.node({ x: 452, y: 115, w: 132, h: 64, label: 'Database', shape: 'db', kind: 'good' });
            let tries = 0;
            const tri = (n = 1) => { tries += n; sA.set(String(tries), tries > 3 ? 'warn' : 'info'); };
            sA.set('0', 'info');
            sR.set('—', 'info');
            if (k === 'ack') {
              const cl = st.node({ x: 92, y: 115, label: 'Client', sub: 'pay $20', kind: 'primary' });
              st.link(cl, db, { thin: true, dashed: true, arrow: false });
              const msg = ok ? 'pay · key 7' : 'pay $20';
              cap.set(ok ? 'The client tags the payment with a unique key.' : 'The client sends a payment.', 'info');
              tri();
              await st.send(cl, db, { label: msg });
              db.set({ sub: 'charged 1×' });
              sR.set('charged 1×', 'good');
              cap.set('Committed, but the “ok” reply is lost on the way back.', 'warn');
              await st.send(db, cl, { label: 'ok', kind: 'good', drop: true });
              cap.set('Timeout. The client assumes failure and retries.', 'warn');
              tri();
              await st.send(cl, db, { label: msg, kind: 'warn' });
              if (ok) {
                db.set({ sub: 'key 7: done' });
                await st.send(db, cl, { label: 'ok', kind: 'good' });
                cap.set('Key 7 was already applied, so it is skipped. Charged once.', 'good');
              } else {
                db.set({ sub: 'charged 2×', kind: 'bad' });
                sR.set('charged 2×', 'bad');
                await st.send(db, cl, { label: 'ok', kind: 'good' });
                cap.set('Charged twice: the retry repeated a success.', 'bad');
              }
            } else if (k === 'load') {
              const cls = [0, 1, 2].map((i) => st.node({ x: 92, y: 45 + i * 70, w: 112, h: 46, label: 'Client ' + (i + 1), kind: 'primary' }));
              cls.forEach((c) => st.link(c, db, { thin: true, dashed: true, arrow: false }));
              db.set({ kind: 'warn', sub: 'overloaded' });
              cap.set('The database is overloaded. Requests time out.', 'warn');
              let q = 3;
              sR.set('queue ' + q, 'warn');
              tri(3);
              await Promise.all(cls.map((c) => st.send(c, db, { label: 'req', drop: 0.85, dur: 800 })));
              if (!ok) {
                for (let r = 0; r < 3; r++) {
                  cap.set('Everyone retries immediately, adding even more load.', 'bad');
                  tri(3);
                  await Promise.all(cls.map((c) => st.send(c, db, { label: 'retry', kind: 'warn', drop: 0.85, dur: 700 })));
                  q += 3 + r * 2;
                  db.set({ sub: 'queue ' + q, kind: 'bad' });
                  sR.set('queue ' + q, 'bad');
                }
                cap.set('Instant retries feed the overload. It only gets worse.', 'bad');
              } else {
                cap.set('Each client backs off: 1 s, 2 s, 4 s, plus jitter.', 'info');
                for (let i = 0; i < 3; i++) {
                  cls[i].set({ sub: 'wait ' + (1 << i) + ' s', kind: 'warn' });
                  await v.sleep(350 * (i + 1));
                  tri();
                  await st.send(cls[i], db, { label: 'retry', kind: 'good', dur: 700 });
                  q--;
                  db.set({ sub: q ? 'queue ' + q : 'recovered', kind: q ? 'warn' : 'good' });
                  sR.set(q ? 'queue ' + q : 'recovered', q ? 'warn' : 'good');
                  await st.send(db, cls[i], { label: 'ok', kind: 'good', dur: 600 });
                  cls[i].set({ sub: 'done', kind: 'good' });
                }
                cap.set('Spread-out retries let the database recover. Cap the attempts too.', 'good');
              }
            } else {
              const cl = st.node({ x: 92, y: 115, w: 130, label: 'Client', sub: 'sign up “kai”', kind: 'primary' });
              st.link(cl, db, { thin: true, dashed: true, arrow: false });
              cap.set('Sign up with the username “kai”…', 'info');
              tri();
              await st.send(cl, db, { label: 'kai' });
              await st.send(db, cl, { label: 'taken', kind: 'bad' });
              cap.set('Constraint violation: the name is taken. A permanent error.', 'bad');
              if (!ok) {
                for (let r = 0; r < 3; r++) {
                  tri();
                  await st.send(cl, db, { label: 'kai', kind: 'warn', dur: 650 });
                  await st.send(db, cl, { label: 'taken', kind: 'bad', dur: 650 });
                }
                sR.set('still failing', 'bad');
                cap.set('Retrying a permanent error fails the same way, forever.', 'bad');
              } else {
                cl.set({ sub: 'asks the user', kind: 'good' });
                sR.set('shown to user', 'good');
                cap.set('Only retry transient errors. Show this one: pick another name.', 'good');
              }
            }
          }
          run();
        },
      },

      /* 4 ─────────────────────────────────────────────── */
      {
        title: 'Dirty read: a price that never existed',
        caption: 'Read committed never shows uncommitted data: the database keeps the old committed value and serves it until the writer commits.',
        problem: 'Dirty read',
        fix: 'Read committed',
        tags: ['PostgreSQL', 'Oracle', 'SQL Server'],
        demo(el, v) {
          const box = v.wrap(el);
          const lv = v.segmented(box, {
            options: [
              { value: 'ru', label: 'Read uncommitted', kind: 'bad' },
              { value: 'rc', label: 'Read committed', kind: 'good' },
            ],
            value: 'ru',
            onChange: () => mk(),
          });
          const st = v.stage(box, { w: 560, h: 250 });
          const rows = [
            { label: 'Seller', sub: 'T1' },
            { label: 'Pending', sub: 'new value', val: true },
            { label: 'Committed', sub: 'price', val: true },
            { label: 'Buyer', sub: 'T2' },
          ];
          function scenario() {
            const ru = lv.get() === 'ru';
            return {
              rows, ys: Y4,
              init: { 1: ['—', 'ghost'], 2: ['$30', 'neutral'] },
              steps: [
                S([[0, 'set $3', 'warn']], { 1: ['$3', 'warn'] },
                  ru ? 'Seller types $3, a typo. Not committed yet.' : 'Seller types $3, a typo. The DB still keeps $30 as committed.', 'warn'),
                S([[3, ru ? 'sees $3' : 'sees $30', ru ? 'bad' : 'good']], null,
                  ru ? 'Read uncommitted: the buyer sees the pending $3.' : 'Read committed: the buyer gets the last committed value, $30.', ru ? 'bad' : 'good',
                  { ring: [ru ? 1 : 2, 1, ru ? 'bad' : 'good'] }),
                S([[3, ru ? 'buys @$3' : 'buys @$30', ru ? 'bad' : 'good']], null, ru ? 'The buyer orders at $3.' : 'The buyer orders at $30.', 'info'),
                S([[0, 'abort', 'bad']], { 1: ['—', 'ghost'] }, 'The seller spots the typo and aborts. $3 is thrown away.', 'warn'),
                S([[3, ru ? '✕ dirty' : '✓ clean', ru ? 'bad' : 'good']], null,
                  ru ? 'The buyer acted on a price that never existed: a dirty read.' : 'Only committed data was ever visible. No dirty read.', ru ? 'bad' : 'good'),
              ],
            };
          }
          const mk = tlStepper(v, box, st, scenario);
          mk();
        },
      },

      /* 5 ─────────────────────────────────────────────── */
      {
        title: 'Dirty write: seat to Ben, ticket to Ana',
        caption: 'Two bookings interleave their writes and the seat and ticket end up split. Row locks make the second writer wait.',
        problem: 'Dirty write',
        fix: 'Row-level write locks',
        demo(el, v) {
          const box = v.wrap(el);
          const lv = v.segmented(box, {
            options: [
              { value: 'none', label: 'No protection', kind: 'bad' },
              { value: 'rc', label: 'Read committed', kind: 'good' },
            ],
            value: 'none',
            onChange: () => mk(),
          });
          const st = v.stage(box, { w: 560, h: 250 });
          const rows = [
            { label: 'Ana', sub: 'T1' },
            { label: 'Seat 7A', sub: 'owner', val: true },
            { label: 'Ticket', sub: 'owner', val: true },
            { label: 'Ben', sub: 'T2' },
          ];
          function scenario() {
            const init = { 1: ['free', 'ghost'], 2: ['free', 'ghost'] };
            if (lv.get() === 'none') {
              return {
                rows, ys: Y4, init,
                steps: [
                  S([[0, 'seat=Ana', 'warn']], { 1: ['Ana', 'warn'] }, 'Ana starts booking: she writes the seat. Not committed yet.', 'info'),
                  S([[3, 'seat=Ben', 'bad']], { 1: ['Ben', 'warn'] }, 'Ben overwrites Ana’s uncommitted seat. That is a dirty write.', 'bad'),
                  S([[3, 'tkt=Ben', 'warn']], { 2: ['Ben', 'warn'] }, 'Ben writes the ticket too.', 'info'),
                  S([[3, 'commit', 'good']], { 1: ['Ben', 'neutral'], 2: ['Ben', 'neutral'] }, 'Ben commits.', 'info'),
                  S([[0, 'tkt=Ana', 'warn']], { 2: ['Ana', 'warn'] }, 'Ana, slower, now writes the ticket.', 'warn'),
                  S([[0, 'commit', 'good']], { 2: ['Ana', 'neutral'] }, 'Ana commits.', 'info'),
                  S([], { 1: ['Ben', 'bad'], 2: ['Ana', 'bad'] }, 'Seat says Ben, ticket says Ana. The booking is corrupt.', 'bad'),
                ],
              };
            }
            return {
              rows, ys: Y4, init,
              steps: [
                S([[0, 'seat=Ana', 'warn']], { 1: ['Ana', 'warn'] }, 'Ana writes the seat and takes its row lock.', 'info'),
                S([[3, 'waits', 'warn', 3]], null, 'Ben wants the seat too. It is locked, so he waits.', 'warn'),
                S([[0, 'tkt=Ana', 'warn']], { 2: ['Ana', 'warn'] }, 'Ana writes the ticket, locking that row too.', 'info'),
                S([[0, 'commit', 'good']], { 1: ['Ana', 'neutral'], 2: ['Ana', 'neutral'] }, 'Ana commits and releases both locks.', 'good'),
                S([[3, 'seat=Ben', 'warn']], { 1: ['Ben', 'warn'] }, 'Now Ben gets the lock and writes the seat.', 'info'),
                S([[3, 'tkt=Ben', 'warn']], { 2: ['Ben', 'warn'] }, 'Ben writes the ticket.', 'info'),
                S([[3, 'commit', 'good']], { 1: ['Ben', 'good'], 2: ['Ben', 'good'] }, 'Seat and ticket both say Ben. Consistent: the later buyer wins cleanly.', 'good'),
              ],
            };
          }
          const mk = tlStepper(v, box, st, scenario);
          mk();
        },
      },

      /* 6 ─────────────────────────────────────────────── */
      {
        title: 'Mid-transfer, $100 appears from nowhere',
        caption: 'Under read committed, a report can see one account before a transfer and the other after. A snapshot freezes one consistent view.',
        problem: 'Read skew',
        fix: 'Snapshot isolation',
        tags: ['PostgreSQL', 'MySQL', 'Oracle', 'SQL Server'],
        demo(el, v) {
          const box = v.wrap(el);
          const lv = v.segmented(box, {
            options: [
              { value: 'rc', label: 'Read committed', kind: 'bad' },
              { value: 'si', label: 'Snapshot isolation', kind: 'good' },
            ],
            value: 'rc',
            onChange: () => mk(),
          });
          const st = v.stage(box, { w: 560, h: 250 });
          const rows = [
            { label: 'Report', sub: 'T1' },
            { label: 'Acct A', val: true },
            { label: 'Acct B', val: true },
            { label: 'Transfer', sub: 'T2' },
          ];
          function scenario() {
            const rc = lv.get() === 'rc';
            return {
              rows, ys: Y4,
              init: { 1: ['$500', 'neutral'], 2: ['$500', 'neutral'] },
              decor: rc ? null : (s, L) => L.vline(L.x(0), 'snapshot'),
              steps: [
                S([[0, 'A=500', 'info']], null, rc ? 'The report reads account A: $500.' : 'The report takes a snapshot, then reads A: $500.', 'info', { ring: [1, 0] }),
                S([[3, 'A−100', 'warn']], { 1: ['$400', 'warn'] }, 'A transfer takes $100 from A…', 'info'),
                S([[3, 'B+100', 'warn']], { 2: ['$600', 'warn'] }, '…adds it to B…', 'info'),
                S([[3, 'commit', 'good']], { 1: ['$400', 'neutral'], 2: ['$600', 'neutral'] }, '…and commits. The real total is still $1000.', 'good'),
                S([[0, rc ? 'B=600' : 'B=500', rc ? 'bad' : 'good']], null,
                  rc ? 'Read committed: the report reads the new B, $600.' : 'Snapshot: the report still sees B as of its start, $500.', rc ? 'bad' : 'good',
                  { ring: rc ? [2, 4, 'bad'] : [2, 0, 'good'] }),
                S([[0, rc ? 'Σ 1100' : 'Σ 1000', rc ? 'bad' : 'good']], null,
                  rc ? 'Total $1100: money appeared from nowhere. Read skew.' : 'Total $1000. One consistent snapshot, no read skew.', rc ? 'bad' : 'good'),
              ],
            };
          }
          const mk = tlStepper(v, box, st, scenario);
          const names = v.row(box, { center: true });
          [
            ['Snapshot isolation is called:', 'ghost'],
            ['PostgreSQL: repeatable read', 'info'],
            ['MySQL: repeatable read', 'info'],
            ['Oracle: serializable', 'info'],
            ['DB2’s repeatable read = serializable', 'warn'],
          ].forEach(([t, k]) => names.appendChild(v.cell(t, k, { sm: true })));
          mk();
        },
      },

      /* 7 ─────────────────────────────────────────────── */
      {
        title: 'MVCC: every write adds a row version',
        caption: 'Rows carry the IDs of the transactions that created and deleted them. Each reader compares those IDs with its snapshot.',
        tags: ['PostgreSQL', 'MySQL InnoDB', 'Oracle'],
        demo(el, v) {
          const box = v.wrap(el);
          const st = v.stage(box, { w: 560, h: 300 });
          // tx 1 wrote A and B long ago; tx 2 tried A = 0 and aborted.
          // tx 3 = report (reader), tx 4 = transfer (writer), tx 5 = later report.
          function status(tx, i) {
            if (tx === 1) return 'committed';
            if (tx === 2) return 'aborted';
            if (tx === 3) return i >= 5 ? 'finished' : 'reading';
            if (tx === 4) return i === 0 ? 'none' : i < 3 ? 'writing' : 'committed';
            return i < 4 ? 'none' : 'reading';
          }
          const inProgressAtStart = { 3: [], 5: [] };
          function rowsAt(i) {
            const r = [
              { key: 'A', val: 500, c: 1, d: i >= 1 ? 4 : null },
              { key: 'A', val: 0, c: 2, d: null },
            ];
            if (i >= 1) r.push({ key: 'A', val: 400, c: 4, d: null });
            r.push({ key: 'B', val: 500, c: 1, d: i >= 2 ? 4 : null });
            if (i >= 2) r.push({ key: 'B', val: 600, c: 4, d: null });
            return i >= 5 ? r.filter((x) => x.c === 4) : r; // after GC only live versions remain
          }
          // Visibility: a write counts only if its tx committed before the reader started.
          function sees(reader, row, i) {
            const done = (tx) => ['committed', 'finished'].includes(status(tx, i)) && tx < reader && !inProgressAtStart[reader].includes(tx);
            if (status(row.c, i) === 'aborted') return ['✕ aborted', 'ghost', null];
            if (!done(row.c)) return ['✕ too new', 'neutral', null];
            if (row.d != null && done(row.d)) return ['✕ deleted', 'neutral', null];
            return ['✓ $' + row.val, 'good', row.val];
          }
          const LOOK = {
            committed: ['committed', 'good'], aborted: ['aborted', 'bad'], reading: ['reading', 'info'],
            writing: ['writing', 'warn'], none: ['not started', 'ghost'], finished: ['finished', 'neutral'],
          };
          const txInk = (tx, i) => ({ aborted: 'bad', writing: 'warn' }[status(tx, i)] || 'text');
          function draw(i) {
            st.clear();
            [1, 2, 3, 4, 5].forEach((tx, k) => {
              const [word, kind] = LOOK[status(tx, i)];
              st.node({ x: 62 + k * 109, y: 32, w: 100, h: 44, label: 'tx ' + tx, sub: word, kind });
            });
            const H = 78;
            [['key', 30], ['value', 88], ['created by', 162], ['deleted by', 242]].forEach(([t, x]) => st.text(x, H, t, { size: 12, bold: true, kind: 'muted' }));
            st.text(372, H, 'tx 3 sees', { size: 12, bold: true, kind: 'info' });
            st.text(486, H, 'tx 5 sees', { size: 12, bold: true, kind: 'info' });
            const sums = { 3: 0, 5: 0 };
            rowsAt(i).forEach((r, k) => {
              const y = 106 + k * 34;
              const ab = status(r.c, i) === 'aborted';
              st.rect(12, y - 14, 272, 28, { kind: ab ? 'ghost' : 'neutral', rx: 6 });
              st.text(30, y, r.key, { size: 14, bold: true });
              st.text(88, y, '$' + r.val, { size: 13, mono: true });
              st.text(162, y, 'tx ' + r.c, { size: 13, kind: txInk(r.c, i) });
              st.text(242, y, r.d ? 'tx ' + r.d : '—', { size: 13, kind: r.d ? txInk(r.d, i) : 'muted' });
              [[3, 372], [5, 486]].forEach(([rd, x]) => {
                const s = status(rd, i);
                if (s === 'none' || s === 'finished') { st.text(x, y, s === 'none' ? '—' : 'done', { size: 13, kind: 'muted' }); return; }
                const [t, kd, val] = sees(rd, r, i);
                st.rect(x - 52, y - 14, 104, 28, { kind: kd, label: t, size: 13 });
                if (val != null) sums[rd] += val;
              });
            });
            const yT = 276;
            st.text(284, yT, 'total seen', { size: 12, bold: true, kind: 'muted', anchor: 'end' });
            [[3, 372], [5, 486]].forEach(([rd, x]) => {
              const s = status(rd, i);
              if (s === 'none' || s === 'finished') return;
              st.rect(x - 52, yT - 14, 104, 28, { kind: 'good', label: '$' + sums[rd], size: 13, mono: true });
            });
          }
          v.stepper(box, {
            steps: [
              'Report tx 3 starts. Every row version names the tx that wrote it.',
              'Transfer tx 4 updates A: the old row is marked deleted, a new one added.',
              'Same for B. tx 3 ignores tx 4’s writes: tx 4 started later.',
              { caption: 'tx 4 commits. tx 3 still reads its snapshot: 500 + 500.', kind: 'good' },
              { caption: 'Report tx 5 starts after the commit: it sees 400 + 600.', kind: 'good' },
              { caption: 'tx 3 ends. Nobody can see the old rows now: garbage-collect them.', kind: 'info' },
            ],
            render: (i) => draw(i),
          });
        },
      },

      /* 8 ─────────────────────────────────────────────── */
      {
        title: 'Indexes need snapshots too',
        caption: 'An index can point at every version and let readers filter. Or copy-on-write: each write makes a new root, a frozen snapshot.',
        tags: ['PostgreSQL', 'CouchDB', 'LMDB', 'Datomic'],
        demo(el, v) {
          const box = v.wrap(el);
          const mode = v.segmented(box, {
            options: [
              { value: 'cow', label: 'Copy-on-write B-tree' },
              { value: 'filter', label: 'Index → all versions' },
            ],
            value: 'cow',
            onChange: reset,
          });
          const st = v.stage(box, { w: 560, h: 270 });
          const cap = v.caption(box, '');
          v.controls(box, [
            { label: 'Write a key', icon: '✎', kind: 'primary', onClick: write },
            { label: 'Garbage collect', icon: '✱', onClick: gc },
            { label: 'Reset', icon: '↺', kind: 'ghost', onClick: reset },
          ]);
          let writes = 0, gcFrom = 0;
          const LEAVES = [
            { id: 'p1', x: 72, text: 'ann 5' }, { id: 'p2', x: 172, text: 'bo 3' }, { id: 'p3', x: 272, text: 'cy 9' },
            { id: 'p2b', x: 382, text: 'bo 4', fresh: true }, { id: 'p3b', x: 488, text: 'cy 7', fresh: true },
          ];
          const ROOTS = [
            { x: 122, kids: ['p1', 'p2', 'p3'] },
            { x: 292, kids: ['p1', 'p2b', 'p3'] },
            { x: 462, kids: ['p1', 'p2b', 'p3b'] },
          ];
          function drawCow() {
            st.clear();
            const live = ROOTS.slice(gcFrom, writes + 1);
            const used = new Set();
            live.forEach((r) => r.kids.forEach((k) => used.add(k)));
            const leaf = {};
            LEAVES.forEach((l) => {
              if (used.has(l.id)) leaf[l.id] = st.node({ x: l.x, y: 212, w: 86, h: 44, label: l.text, mono: true, kind: l.fresh ? 'good' : 'neutral' });
            });
            st.text(18, 246, 'leaf pages', { anchor: 'start', size: 12, kind: 'muted' });
            live.forEach((r) => {
              const k = ROOTS.indexOf(r);
              const latest = k === writes;
              const rn = st.node({ x: r.x, y: 112, w: 106, h: 44, label: 'root v' + (k + 1), kind: latest ? 'primary' : 'neutral' });
              r.kids.forEach((id) => st.link(rn, leaf[id], { kind: latest ? 'primary' : 'muted', thin: !latest }));
              const tx3 = k === 0 && gcFrom === 0;
              const who = tx3 && latest ? 'tx 3 + new txs' : tx3 ? 'tx 3 reads' : latest ? 'new txs read' : '';
              if (who) {
                const tag = st.node({ x: r.x, y: 36, w: 132, h: 30, shape: 'pill', label: who, kind: 'info', size: 13 });
                st.link(tag, rn, { kind: 'info', thin: true });
              }
            });
          }
          function drawFilter() {
            st.clear();
            const vers = [{ val: 3, c: 1 }, { val: 4, c: 4 }, { val: 7, c: 6 }].slice(0, writes + 1);
            vers.forEach((x, k) => { x.d = vers[k + 1] ? vers[k + 1].c : null; });
            const idx = st.node({ x: 80, y: 140, w: 112, h: 56, label: 'Index', sub: 'key “bo”', kind: 'primary' });
            st.text(282, 24, 'row versions', { size: 12, bold: true, kind: 'muted' });
            st.text(430, 24, 'tx 3', { size: 12, bold: true, kind: 'info' });
            st.text(508, 24, 'new tx', { size: 12, bold: true, kind: 'info' });
            vers.slice(gcFrom).forEach((x, k) => {
              const y = 70 + k * 72;
              const n = st.node({ x: 282, y, w: 176, h: 50, label: 'bo = ' + x.val, sub: `created ${x.c} · deleted ${x.d || '—'}`, kind: 'neutral' });
              st.link(idx, n, { kind: 'primary' });
              const t3 = gcFrom > 0 ? ['done', 'ghost'] : x.c === 1 ? ['✓', 'good'] : ['✕', 'neutral'];
              const nw = x === vers[vers.length - 1] ? ['✓', 'good'] : ['✕', 'neutral'];
              st.rect(405, y - 15, 50, 30, { kind: t3[1], label: t3[0] });
              st.rect(483, y - 15, 50, 30, { kind: nw[1], label: nw[0] });
            });
          }
          const draw = () => (mode.get() === 'cow' ? drawCow() : drawFilter());
          function reset() {
            writes = 0;
            gcFrom = 0;
            draw();
            cap.set(mode.get() === 'cow' ? 'One root, three leaf pages. Report tx 3 reads from root v1.' : 'The index entry for “bo” points at every version of that row.', 'info');
          }
          function write() {
            if (writes >= 2) { cap.set('That’s enough versions. Garbage-collect or reset.', 'warn'); return; }
            writes++;
            draw();
            const cow = mode.get() === 'cow';
            if (writes === 1) cap.set(cow ? 'Write bo=4: copy that leaf and the root. tx 3 still sees bo 3.' : 'A write adds a version. The index points at it; tx 3 skips it.', 'good');
            else cap.set(cow ? 'Write cy=7: another new root. Unchanged pages are shared.' : 'Each reader filters the versions by its own snapshot.', 'good');
          }
          function gc() {
            if (writes === gcFrom) { cap.set('Nothing to collect: every page is still in use.', 'info'); return; }
            gcFrom = writes;
            draw();
            cap.set(mode.get() === 'cow' ? 'tx 3 finished. Roots and pages nobody can reach are freed.' : 'tx 3 finished. Invisible versions and their index entries go.', 'good');
          }
          reset();
        },
      },

      /* 9 ─────────────────────────────────────────────── */
      {
        title: 'Two likes, but the counter says +1',
        caption: 'Two read-modify-write cycles race and one overwrites the other. Fix with atomic ops, locks, auto-detection, compare-and-set, or merging replicas.',
        problem: 'Lost update',
        fix: 'Atomic · lock · detect · CAS · merge',
        tags: ['SELECT … FOR UPDATE'],
        demo(el, v) {
          const box = v.wrap(el);
          const fx = v.segmented(box, {
            options: [
              { value: 'naive', label: 'Naive', kind: 'bad' },
              { value: 'atomic', label: 'Atomic', kind: 'good' },
              { value: 'lock', label: 'Lock', kind: 'good' },
              { value: 'detect', label: 'Detect', kind: 'good' },
              { value: 'cas', label: 'CAS', kind: 'good' },
              { value: 'lww', label: 'Replicas', kind: 'bad' },
              { value: 'merge', label: 'Merge', kind: 'good' },
            ],
            value: 'naive',
            onChange: () => mk(),
          });
          const st = v.stage(box, { w: 560, h: 250 });
          const ONE = [{ label: 'Ana', sub: 'T1' }, { label: 'Likes', sub: 'counter', val: true }, { label: 'Ben', sub: 'T2' }];
          const TWO = [{ label: 'Ana', sub: 'writes R1' }, { label: 'Replica 1', val: true }, { label: 'Replica 2', val: true }, { label: 'Ben', sub: 'writes R2' }];
          function scenario() {
            const m = fx.get();
            const one = (steps) => ({ rows: ONE, ys: [52, 128, 204], init: { 1: ['41', 'neutral'] }, steps });
            if (m === 'naive') {
              return one([
                S([[0, 'read 41', 'info']], null, 'Ana likes the post: read the counter, 41.', 'info'),
                S([[2, 'read 41', 'info']], null, 'Ben likes it at the same moment: also 41.', 'info'),
                S([[0, 'write 42', 'warn']], { 1: ['42', 'neutral'] }, 'Ana writes 41 + 1 = 42.', 'info'),
                S([[2, 'write 42', 'bad']], { 1: ['42', 'bad'] }, 'Ben writes 41 + 1 = 42, overwriting Ana’s like.', 'bad'),
                S([], { 1: ['42 ✕', 'bad'] }, 'Two likes, but the counter moved by one. A lost update.', 'bad'),
              ]);
            }
            if (m === 'atomic') {
              return one([
                S([[0, '+1', 'good']], { 1: ['42', 'neutral'] }, 'Atomic: SET likes = likes + 1 reads and writes in one step.', 'info'),
                S([[2, '+1', 'good']], { 1: ['43', 'neutral'] }, 'Ben’s increment runs right after, on 42.', 'info'),
                S([], { 1: ['43 ✓', 'good'] }, '43. Nothing lost. Use it whenever the change fits one statement.', 'good'),
              ]);
            }
            if (m === 'lock') {
              return one([
                S([[0, 'lock·41', 'info']], null, 'Ana reads with SELECT … FOR UPDATE: 41, and the row locks.', 'info'),
                S([[2, 'waits', 'warn', 3]], null, 'Ben’s FOR UPDATE must wait for Ana’s lock.', 'warn'),
                S([[0, 'write 42', 'warn']], { 1: ['42', 'warn'] }, 'Ana writes 42.', 'info'),
                S([[0, 'commit', 'good']], { 1: ['42', 'neutral'] }, 'Ana commits: the lock is released.', 'good'),
                S([[2, 'lock·42', 'info']], null, 'Ben’s locking read now returns 42.', 'info'),
                S([[2, 'write 43', 'warn']], { 1: ['43', 'warn'] }, 'Ben writes 43.', 'info'),
                S([[2, 'commit', 'good']], { 1: ['43 ✓', 'good'] }, '43. Correct, as long as nobody forgets to lock.', 'good'),
              ]);
            }
            if (m === 'detect') {
              return one([
                S([[0, 'read 41', 'info']], null, 'Snapshot isolation with lost-update detection. Ana reads 41.', 'info'),
                S([[2, 'read 41', 'info']], null, 'Ben reads 41 from his snapshot.', 'info'),
                S([[0, 'write 42', 'warn']], { 1: ['42', 'warn'] }, 'Ana writes 42…', 'info'),
                S([[0, 'commit', 'good']], { 1: ['42', 'neutral'] }, '…and commits first.', 'good'),
                S([[2, 'ABORT', 'bad']], null, 'Ben writes: the row changed since his snapshot. Abort!', 'bad'),
                S([[2, 'read 42', 'info']], null, 'Ben’s retry reads 42.', 'info'),
                S([[2, 'write 43', 'good']], { 1: ['43 ✓', 'good'] }, '43. PostgreSQL and Oracle do this; MySQL’s repeatable read does not.', 'good'),
              ]);
            }
            if (m === 'cas') {
              return one([
                S([[0, 'read 41', 'info']], null, 'Compare-and-set. Ana reads 41.', 'info'),
                S([[2, 'read 41', 'info']], null, 'Ben reads 41.', 'info'),
                S([[0, '42 if 41', 'good']], { 1: ['42', 'neutral'] }, 'Ana: set 42 only if it is still 41. It is: success.', 'good'),
                S([[2, '42 if 41', 'bad']], null, 'Ben: set 42 if still 41. It is 42 now, so it fails.', 'bad'),
                S([[2, 'read 42', 'info']], null, 'Ben re-reads: 42.', 'info'),
                S([[2, '43 if 42', 'good']], { 1: ['43', 'neutral'] }, 'Ben: set 43 if still 42. Success.', 'good'),
                S([], { 1: ['43 ✓', 'good'] }, '43. Only safe if the check reads current data, not a snapshot.', 'good'),
              ]);
            }
            const merge = m === 'merge';
            return {
              rows: TWO, ys: Y4, init: { 1: ['41', 'neutral'], 2: ['41', 'neutral'] },
              steps: [
                S([], null, 'Two replicas both accept writes. Both start at 41.', 'info'),
                S([[0, '+1 @R1', 'warn']], { 1: ['42', 'neutral'] }, 'Ana’s like hits replica 1: 42.', 'info'),
                S([[3, '+1 @R2', 'warn']], { 2: ['42', 'neutral'] }, 'Ben’s hits replica 2: 42. No single copy to lock or CAS.', 'warn'),
                merge
                  ? S([], { 1: ['43 ✓', 'good'], 2: ['43 ✓', 'good'] }, 'Increments commute, so the sync merges both: 43 everywhere.', 'good')
                  : S([], { 1: ['42 ✕', 'bad'], 2: ['42 ✕', 'bad'] }, 'The sync uses last write wins: 42 everywhere. A like is lost.', 'bad'),
              ],
            };
          }
          const mk = tlStepper(v, box, st, scenario);
          mk();
        },
      },

      /* 10 ─────────────────────────────────────────────── */
      {
        title: 'Both doctors leave, nobody is on call',
        caption: 'Each doctor checks that someone else is on call, then leaves. Snapshot isolation allows this write skew; locking the rows read prevents it.',
        problem: 'Write skew',
        fix: 'Lock what you read (or serializable)',
        demo(el, v) {
          const box = v.wrap(el);
          const lv = v.segmented(box, {
            options: [
              { value: 'si', label: 'Snapshot isolation', kind: 'bad' },
              { value: 'lock', label: 'SI + FOR UPDATE', kind: 'good' },
            ],
            value: 'si',
            onChange: () => mk(),
          });
          const st = v.stage(box, { w: 560, h: 250 });
          function scenario() {
            const init = { 1: ['on', 'good'], 2: ['on', 'good'] };
            if (lv.get() === 'si') {
              return {
                rows: DOCS, ys: Y4, init,
                steps: [
                  S([[0, 'sees 2', 'info']], null, 'Kim feels ill. She checks: 2 doctors on call, so she may leave.', 'info'),
                  S([[3, 'sees 2', 'info']], null, 'Ray checks at the same moment: also 2.', 'info'),
                  S([[0, 'Kim off', 'warn']], { 1: ['off', 'warn'] }, 'Kim takes herself off call.', 'info'),
                  S([[3, 'Ray off', 'warn']], { 2: ['off', 'warn'] }, 'Ray does the same, on a different row. No write conflict.', 'warn'),
                  S([[0, 'commit', 'good']], { 1: ['off', 'neutral'] }, 'Kim commits.', 'info'),
                  S([[3, 'commit', 'good']], { 2: ['off', 'neutral'] }, 'Ray commits. Snapshot isolation sees nothing wrong.', 'warn'),
                  S([], { 1: ['off', 'bad'], 2: ['off', 'bad'] }, 'Zero doctors on call. Each check was true; together they broke the rule.', 'bad'),
                ],
              };
            }
            return {
              rows: DOCS, ys: Y4, init,
              steps: [
                S([[0, 'lock · 2', 'info']], null, 'Kim checks with FOR UPDATE: 2 on call, and both rows lock.', 'info'),
                S([[3, 'waits', 'warn', 3]], null, 'Ray’s locking check must wait for Kim.', 'warn'),
                S([[0, 'Kim off', 'warn']], { 1: ['off', 'warn'] }, 'Kim takes herself off call.', 'info'),
                S([[0, 'commit', 'good']], { 1: ['off', 'neutral'] }, 'Kim commits and the locks are released.', 'good'),
                S([[3, 'sees 1', 'info']], null, 'Ray’s check runs now: only 1 doctor on call.', 'info'),
                S([[3, 'stays', 'good']], null, 'One is not enough, so Ray stays on call.', 'good'),
                S([], { 1: ['off', 'neutral'], 2: ['on', 'good'] }, 'One doctor still on call. Locking the rows you read stops write skew.', 'good'),
              ],
            };
          }
          const mk = tlStepper(v, box, st, scenario, (sc, i) => {
            const n = onCall(sc, i);
            sOn.set(String(n), n ? 'good' : 'bad');
          });
          const stats = v.row(box, { center: true });
          const sOn = v.stat(stats, 'on call (need ≥ 1)', '2', 'good');
          mk();
        },
      },

      /* 11 ─────────────────────────────────────────────── */
      {
        title: 'Phantoms: checking for a row that isn’t there',
        caption: 'Book a room, claim a username, spend from a wallet: check a condition, then insert. Locks can’t hold rows that don’t exist yet.',
        problem: 'Phantom write skew',
        fix: 'Materialize the conflict, constraints, serializable',
        demo(el, v) {
          const box = v.wrap(el);
          const top = v.row(box);
          const ex = v.segmented(top, {
            options: [
              { value: 'room', label: 'Room booking' },
              { value: 'user', label: 'Username' },
              { value: 'cash', label: 'Wallet' },
            ],
            value: 'room',
            onChange: run,
          });
          const fix = v.segmented(top, {
            options: [
              { value: 'bug', label: 'Snapshot only', kind: 'bad' },
              { value: 'fix', label: 'Add a guard', kind: 'good' },
            ],
            value: 'bug',
            onChange: run,
          });
          const st = v.stage(box, { w: 560, h: 262 });
          const cap = v.caption(box, '');
          v.controls(box, [{ label: 'Replay', icon: '▶', kind: 'primary', onClick: run }]);
          const EX = {
            room: {
              table: 'BOOKINGS · ROOM 3', rows: ['10:00 · Lee', '12:00 · Mo'], q: '14:00?', ans: 'free', ans2: 'taken',
              mine: (n) => '14:00 · ' + n, none: ['nothing', 'to lock'], guard: 'Slot row', gsub: 'room 3 · 14:00',
              okCap: 'Both see 14:00 free. Locking that result locks zero rows.',
              bad: '2 bookings at 14:00', badCap: 'Double-booked. Each insert is a phantom the other’s check missed.',
              good: '1 booking ✓', goodCap: 'Ben re-checks under the lock: taken. He picks another time.',
              lockCap: 'Pre-made slot rows give the lock something to hold.',
            },
            user: {
              table: 'USERS', rows: ['mia', 'leo'], q: 'kai?', ans: 'free',
              mine: (n) => 'kai · ' + n, none: ['no unique', 'index'], guard: 'Unique index', gsub: 'on username',
              okCap: 'Both see “kai” free. There is no row to lock.',
              bad: '2 users named kai', badCap: 'Two accounts named kai. Neither check saw the other’s insert.',
              good: '1 kai ✓', goodCap: 'The unique index rejects Ben’s insert. He picks another name.',
            },
            cash: {
              table: 'SPENDING · LIMIT $100', rows: ['coffee · $5', 'books · $15'], q: 'spent?', ans: '$20', ans2: '$80',
              mine: (n) => '$60 · ' + n, none: ['nothing', 'to lock'], guard: 'Wallet row', gsub: 'limit $100',
              okCap: 'Both see $20 spent, so $60 more fits. Nothing locks new rows.',
              bad: 'spent $140 of $100', badCap: 'Overspent: each check missed the other’s new spend.',
              good: 'spent $80 ✓', goodCap: 'Ben sees $80 spent; $60 more breaks the limit. Refused.',
              lockCap: 'Both must lock the wallet row before checking.',
            },
          };
          async function run() {
            v.restart();
            st.clearPackets();
            st.clear();
            const k = ex.get(), e = EX[k], guarded = fix.get() === 'fix';
            st.box(254, 12, 294, 240, { label: e.table, kind: 'neutral' });
            const ana = st.node({ x: 52, y: 70, w: 52, h: 52, shape: 'person', label: 'Ana', kind: 'info' });
            const ben = st.node({ x: 52, y: 190, w: 52, h: 52, shape: 'person', label: 'Ben', kind: 'info' });
            const guard = st.node({ x: 170, y: 130, w: 118, h: 54, label: guarded ? e.guard : e.none[0], sub: guarded ? e.gsub : e.none[1], kind: guarded ? 'primary' : 'ghost' });
            const rowY = [58, 98, 138, 178];
            const addRow = (j, t, kind) => st.rect(270, rowY[j] - 15, 262, 30, { kind, label: t, mono: true, size: 13 });
            e.rows.forEach((t, j) => addRow(j, t, 'neutral'));
            const T = { x: 330, y: 118 };
            const slot = [{ x: 400, y: rowY[2] }, { x: 400, y: rowY[3] }];
            const outcome = (t, kind) => st.text(400, 222, t, { size: 14, bold: true, kind });
            const check = async (who, ans, kind) => {
              await st.send(who, T, { label: e.q });
              await st.send(T, who, { label: ans, kind });
            };
            if (!guarded) {
              cap.set('Ana and Ben check at the same moment.', 'info');
              await Promise.all([check(ana, e.ans, 'good'), check(ben, e.ans, 'good')]);
              cap.set(e.okCap, 'warn');
              await v.sleep(500);
              await Promise.all([st.send(ana, slot[0], { label: 'insert', kind: 'data' }), st.send(ben, slot[1], { label: 'insert', kind: 'data' })]);
              addRow(2, e.mine('Ana'), 'bad');
              addRow(3, e.mine('Ben'), 'bad');
              outcome(e.bad, 'bad');
              cap.set(e.badCap, 'bad');
              return;
            }
            if (k === 'user') {
              cap.set('Both check: “kai” looks free to each of them.', 'info');
              await Promise.all([check(ana, e.ans, 'good'), check(ben, e.ans, 'good')]);
              await st.send(ana, guard, { label: 'insert', kind: 'data' });
              await st.send(guard, slot[0], { label: 'kai', kind: 'data' });
              addRow(2, e.mine('Ana'), 'good');
              cap.set('Ana’s insert passes the unique index.', 'info');
              await st.send(ben, guard, { label: 'insert', kind: 'warn' });
              guard.set({ kind: 'bad' });
              await st.send(guard, ben, { label: 'duplicate', kind: 'bad' });
              guard.set({ kind: 'primary' });
              outcome(e.good, 'good');
              cap.set(e.goodCap, 'good');
              return;
            }
            cap.set(e.lockCap, 'info');
            await Promise.all([st.send(ana, guard, { label: 'lock' }), st.send(ben, guard, { label: 'lock', kind: 'warn', dur: 1100 })]);
            guard.set({ kind: 'warn', sub: 'locked: Ana' });
            ben.set({ kind: 'warn' });
            cap.set('Ana gets the lock. Ben waits.', 'warn');
            await check(ana, e.ans, 'good');
            await st.send(ana, slot[0], { label: 'insert', kind: 'data' });
            addRow(2, e.mine('Ana'), 'good');
            cap.set('Ana inserts and commits. The lock passes to Ben.', 'info');
            guard.set({ sub: 'locked: Ben' });
            ben.set({ kind: 'info' });
            await check(ben, e.ans2, 'bad');
            guard.set({ kind: 'primary', sub: e.gsub });
            outcome(e.good, 'good');
            cap.set(e.goodCap, 'good');
          }
          run();
        },
      },

      /* 12 ─────────────────────────────────────────────── */
      {
        title: 'One thread, one transaction at a time',
        caption: 'No concurrency, no anomalies. It only works if transactions are short: send stored procedures, not chatty round trips.',
        problem: 'Network waits stall the thread',
        fix: 'Stored procedures + partitions',
        tags: ['VoltDB', 'Redis', 'Datomic'],
        demo(el, v) {
          const box = v.wrap(el);
          const mode = v.segmented(box, {
            options: [
              { value: 'chat', label: 'Interactive', kind: 'bad' },
              { value: 'proc', label: 'Stored procedure', kind: 'good' },
              { value: 'part', label: '3 partitions', kind: 'good' },
              { value: 'cross', label: 'Cross-partition', kind: 'bad' },
            ],
            value: 'chat',
            onChange: run,
          });
          const st = v.stage(box, { w: 560, h: 228 });
          const stats = v.row(box, { center: true });
          const sT = v.stat(stats, 'time for 6 txns', '—', 'info');
          const sR = v.stat(stats, 'throughput', '—', 'info');
          const needs = v.row(box, { center: true });
          [['needs:', 'ghost'], ['short txns', 'neutral'], ['data in RAM', 'neutral'], ['writes fit one core', 'neutral'], ['few cross-partition', 'neutral']]
            .forEach(([t, k]) => needs.appendChild(v.cell(t, k, { sm: true })));
          const cap = v.caption(box, '');
          v.controls(box, [{ label: 'Run', icon: '▶', kind: 'primary', onClick: run }]);
          const GX0 = 96, GX1 = 546, RTT = 2, MAX = 42;
          const PX = (GX1 - GX0) / MAX;
          const LY = [66, 116, 166];
          const CAPS = {
            chat: ['The thread idles while the app thinks and the network lags. Everyone queues.', 'bad'],
            proc: ['Each transaction ships as one stored procedure. No waits: the thread stays busy.', 'good'],
            part: ['Each core owns a partition with its own thread: triple the throughput.', 'good'],
            cross: ['One transaction spans all partitions: it must lock and coordinate them all.', 'bad'],
          };
          function plan(m) {
            const bars = [], tags = [];
            if (m === 'chat' || m === 'proc') {
              let t = 0;
              for (let k = 1; k <= 6; k++) {
                const t0 = t;
                if (m === 'chat') {
                  for (let q = 0; q < 3; q++) {
                    bars.push({ lane: 0, t0: t, t1: t + 1, kind: 'primary' });
                    t += 1;
                    if (q < 2) { bars.push({ lane: 0, t0: t, t1: t + RTT, kind: 'ghost' }); t += RTT; }
                  }
                  tags.push({ x: GX0 + ((t0 + t) / 2) * PX, text: 'T' + k });
                } else {
                  bars.push({ lane: 0, t0: t, t1: t + 3, kind: 'primary', label: 'T' + k });
                  t += 3;
                }
              }
              return { bars, tags, total: t, idle: true };
            }
            if (m === 'part') {
              for (let k = 0; k < 6; k++) {
                const t0 = Math.floor(k / 3) * 3;
                bars.push({ lane: k % 3, t0, t1: t0 + 3, kind: 'primary', label: 'T' + (k + 1) });
              }
              return { bars, tags, total: 6 };
            }
            [0, 1, 2].forEach((l) => bars.push({ lane: l, t0: 0, t1: 3, kind: 'primary', label: 'T' + (l + 1) }));
            [0, 1, 2].forEach((l) => bars.push({ lane: l, t0: 3, t1: 10, kind: 'warn', label: 'T4' }));
            bars.push({ lane: 1, t0: 10, t1: 13, kind: 'primary', label: 'T5' });
            bars.push({ lane: 2, t0: 10, t1: 13, kind: 'primary', label: 'T6' });
            return { bars, tags, total: 13 };
          }
          async function run() {
            v.restart();
            st.clearPackets();
            st.clear();
            const m = mode.get();
            [['primary', 'DB work'], ['ghost', 'waiting on app'], ['warn', 'coordination']].forEach(([k, t], j) => {
              st.rect(GX0 + j * 150, 12, 14, 14, { kind: k, rx: 3 });
              st.text(GX0 + 20 + j * 150, 19, t, { anchor: 'start', size: 13, kind: 'text2' });
            });
            LY.forEach((y, k) => {
              st.line(GX0 - 4, y, GX1, y, { width: 1, dashed: true });
              st.text(10, y, 'Core ' + (k + 1), { anchor: 'start', size: 14, bold: true });
            });
            st.line(GX0, 194, GX1, 194, { width: 1 });
            [0, 10, 20, 30, 40].forEach((t) => {
              st.line(GX0 + t * PX, 190, GX0 + t * PX, 198, { width: 1 });
              st.text(GX0 + t * PX, 210, t + ' ms', { size: 13, kind: 'muted' });
            });
            const p = plan(m);
            if (p.idle) [1, 2].forEach((l) => st.rect(GX0, LY[l] - 13, GX1 - GX0, 26, { kind: 'ghost', label: 'idle: one thread only', size: 12 }));
            const rects = p.bars.map((b) => ({ b, r: st.rect(GX0 + b.t0 * PX, LY[b.lane] - 14, 0.01, 28, { kind: b.kind, label: '', rx: 3 }).set({ opacity: 0 }) }));
            const cursor = st.line(GX0, 40, GX0, 186, { kind: 'accent', width: 1.6, layer: 'top' });
            sT.set('…', 'info');
            sR.set('…', 'info');
            cap.set('Six transactions arrive together…', 'info');
            await v.tween(Math.max(900, p.total * 60), (t) => {
              const now = t * p.total;
              rects.forEach(({ b, r }) => {
                const w = Math.min(now, b.t1) - b.t0;
                r.set({ w: Math.max(0.01, w * PX - 1), opacity: w > 0 ? 1 : 0 });
              });
              cursor.set({ x1: GX0 + now * PX, x2: GX0 + now * PX });
            }, (t) => t);
            rects.forEach(({ b, r }) => { if (b.label) r.set({ label: b.label }); });
            p.tags.forEach((g) => st.text(g.x, 92, g.text, { size: 12, bold: true, kind: 'text2' }));
            const tps = Math.round(6000 / p.total);
            const k = p.total > 30 ? 'bad' : p.total > 10 ? 'warn' : 'good';
            sT.set(p.total + ' ms', k);
            sR.set(tps + ' txn/s', k);
            cap.set(CAPS[m][0], CAPS[m][1]);
          }
          run();
        },
      },

      /* 13 ─────────────────────────────────────────────── */
      {
        title: '2PL: readers and writers block each other',
        caption: 'Shared locks for reads, exclusive locks for writes, all held until commit. Correct, but waits pile up and deadlocks force aborts.',
        problem: 'Blocking + deadlocks',
        fix: 'Detect the cycle, abort one',
        tags: ['MySQL', 'SQL Server', 'DB2'],
        demo(el, v) {
          const box = v.wrap(el);
          const sc = v.segmented(box, {
            options: [
              { value: 'rw', label: 'Reader vs writer' },
              { value: 'dl', label: 'Deadlock', kind: 'bad' },
              { value: 'pred', label: 'Predicate lock' },
              { value: 'range', label: 'Index-range lock' },
            ],
            value: 'rw',
            onChange: () => mk(),
          });
          const st = v.stage(box, { w: 560, h: 266 });
          function drawLocks(s, L, i, scn) {
            const locks = scn.steps[i].locks || [];
            s.line(10, 146, 550, 146, { kind: 'muted', width: 1 });
            s.text(10, 164, 'LOCKS', { anchor: 'start', size: 12, bold: true, kind: 'muted' });
            s.text(550, 164, 'S = shared (read) · X = exclusive (write)', { anchor: 'end', size: 12, kind: 'muted' });
            if (!locks.length) s.text(280, 206, 'no locks held', { size: 13, kind: 'muted', italic: true });
            locks.forEach((lk, k) => {
              const y = 198 + k * 42;
              s.text(10, y, lk.o, { anchor: 'start', size: 13, bold: true });
              (lk.h || []).forEach(([tx, m], j) => s.rect(124 + j * 88, y - 14, 80, 28, { kind: m === 'X' ? 'bad' : 'info', label: tx + ' · ' + m, size: 14 }));
              (lk.w || []).forEach(([tx, m], j) => s.rect(314 + j * 118, y - 14, 110, 28, { kind: 'warn', label: tx + ' waits ' + m, size: 14 }));
            });
          }
          const two = (a, b, steps) => ({ rows: [{ label: a[0], sub: a[1] }, { label: b[0], sub: b[1] }], ys: [42, 98], init: {}, decor: drawLocks, steps });
          const L = (o, h, w) => ({ o, h, w });
          function scenario() {
            const m = sc.get();
            if (m === 'rw') {
              return two(['T1', 'reader'], ['T2', 'writer'], [
                S([[0, 'read X', 'info']], null, 'T1 reads X and takes a shared lock.', 'info', { locks: [L('Row X', [['T1', 'S']])] }),
                S([[1, 'read X', 'info']], null, 'T2 reads X too. Shared locks don’t conflict.', 'info', { locks: [L('Row X', [['T1', 'S'], ['T2', 'S']])] }),
                S([[1, 'waits', 'warn', 3]], null, 'T2 wants to write X: it needs exclusive, so it waits for T1.', 'warn',
                  { locks: [L('Row X', [['T1', 'S'], ['T2', 'S']], [['T2', 'X']])] }),
                S([[0, 'read Y', 'info']], null, 'T1 keeps working. Its locks stay until it ends.', 'warn',
                  { locks: [L('Row X', [['T1', 'S'], ['T2', 'S']], [['T2', 'X']]), L('Row Y', [['T1', 'S']])] }),
                S([[0, 'commit', 'good']], null, 'T1 commits and releases everything. T2’s lock upgrades to X.', 'good', { locks: [L('Row X', [['T2', 'X']])] }),
                S([[1, 'write X', 'warn']], null, 'T2 writes X. A new reader of X would now wait for T2.', 'info', { locks: [L('Row X', [['T2', 'X']])] }),
                S([[1, 'commit', 'good']], null, 'Locks only grow, then all go at commit: the two phases.', 'good', { locks: [] }),
              ]);
            }
            if (m === 'dl') {
              const both = (a, b) => [L('Kim row', a), L('Ray row', b)];
              return two(['Kim', 'T1'], ['Ray', 'T2'], [
                S([[0, 'sees 2', 'info']], null, 'Serializable via 2PL. Kim’s check share-locks both rows.', 'info', { locks: both([['Kim', 'S']], [['Kim', 'S']]) }),
                S([[1, 'sees 2', 'info']], null, 'Ray’s check shares the same locks.', 'info',
                  { locks: both([['Kim', 'S'], ['Ray', 'S']], [['Kim', 'S'], ['Ray', 'S']]) }),
                S([[0, 'waits', 'warn', 3]], null, 'Kim wants X on her row to leave. Ray’s shared lock blocks her.', 'warn',
                  { locks: [L('Kim row', [['Kim', 'S'], ['Ray', 'S']], [['Kim', 'X']]), L('Ray row', [['Kim', 'S'], ['Ray', 'S']])] }),
                S([[1, 'waits', 'warn', 3]], null, 'Ray wants X on his row. Kim blocks him. Deadlock!', 'bad',
                  { locks: [L('Kim row', [['Kim', 'S'], ['Ray', 'S']], [['Kim', 'X']]), L('Ray row', [['Kim', 'S'], ['Ray', 'S']], [['Ray', 'X']])] }),
                S([[1, 'ABORT', 'bad'], [0, 'Kim off', 'warn']], null, 'The DB spots the cycle and aborts Ray. Kim proceeds.', 'warn',
                  { locks: both([['Kim', 'X']], [['Kim', 'S']]) }),
                S([[0, 'commit', 'good']], null, 'Kim commits and releases her locks.', 'good', { locks: [] }),
                S([[1, 'sees 1', 'good']], null, 'Ray retries: 1 on call, so he stays. Safe, but slow.', 'good',
                  { locks: both([['Ray', 'S']], [['Ray', 'S']]) }),
              ]);
            }
            if (m === 'pred') {
              const o = 'room 3 · 14:00';
              return two(['Ana', 'T1'], ['Ben', 'T2'], [
                S([[0, 'free?', 'info']], null, 'Ana checks room 3 at 14:00: free. She locks the condition itself.', 'info', { locks: [L(o, [['Ana', 'S']])] }),
                S([[0, 'book', 'warn']], null, 'Ana inserts her booking, which matches the condition.', 'info', { locks: [L(o, [['Ana', 'X']])] }),
                S([[1, 'waits', 'warn', 3]], null, 'Ben checks the same slot. Ana’s lock blocks him, though the row is new.', 'warn',
                  { locks: [L(o, [['Ana', 'X']], [['Ben', 'S']])] }),
                S([[0, 'commit', 'good']], null, 'Ana commits. Ben’s check can run.', 'good', { locks: [L(o, [['Ben', 'S']])] }),
                S([[1, 'taken', 'good']], null, 'Ben sees the booking and picks another time. No phantom.', 'good', { locks: [L(o, [['Ben', 'S']])] }),
              ]);
            }
            const o = 'index: room 3';
            return two(['Ana', 'T1'], ['Ben', 'T2'], [
              S([[0, 'free?', 'info']], null, 'Index-range lock: Ana’s check locks all of room 3 in the index.', 'info', { locks: [L(o, [['Ana', 'S']])] }),
              S([[0, 'book 14', 'warn']], null, 'Ana books 14:00.', 'info', { locks: [L(o, [['Ana', 'X']])] }),
              S([[1, 'waits', 'warn', 3]], null, 'Ben checks 16:00, a different time. Still blocked: the lock is coarse.', 'warn',
                { locks: [L(o, [['Ana', 'X']], [['Ben', 'S']])] }),
              S([[0, 'commit', 'good']], null, 'Ana commits.', 'good', { locks: [L(o, [['Ben', 'S']])] }),
              S([[1, 'book 16', 'good']], null, 'Ben books 16:00. Cheap to check, but it locked more than needed.', 'good', { locks: [L(o, [['Ben', 'X']])] }),
            ]);
          }
          const mk = tlStepper(v, box, st, scenario, (scn, i) => {
            const t = tally(scn, i);
            sW.set(String(t.waits), t.waits ? 'warn' : 'good');
            sA.set(String(t.aborts), t.aborts ? 'bad' : 'good');
          });
          const stats = v.row(box, { center: true });
          const sW = v.stat(stats, 'steps spent waiting', '0', 'good');
          const sA = v.stat(stats, 'aborts', '0', 'good');
          mk();
        },
      },

      /* 14 ─────────────────────────────────────────────── */
      {
        title: 'SSI: run freely, abort the stale at commit',
        caption: 'Serializable snapshot isolation lets transactions run on snapshots without blocking, notices when a read went stale, and aborts at commit.',
        problem: 'Write skew',
        fix: 'Optimistic check at commit',
        tags: ['PostgreSQL', 'CockroachDB', 'FoundationDB'],
        demo(el, v) {
          const box = v.wrap(el);
          const top = v.row(box);
          const lv = v.segmented(top, {
            options: [
              { value: 'si', label: 'Snapshot isolation', kind: 'bad' },
              { value: 'ssi', label: 'Serializable (SSI)', kind: 'good' },
            ],
            value: 'si',
            onChange: () => mk(),
          });
          const order = v.segmented(top, {
            options: [
              { value: 'early', label: 'Both check first' },
              { value: 'late', label: 'Ray checks late' },
            ],
            value: 'early',
            onChange: () => mk(),
          });
          const st = v.stage(box, { w: 560, h: 250 });
          function scenario() {
            const ssi = lv.get() === 'ssi';
            const init = { 1: ['on', 'good'], 2: ['on', 'good'] };
            const commitRay = S([[3, ssi ? 'ABORT' : 'commit', ssi ? 'bad' : 'good']], { 2: ssi ? ['on', 'good'] : ['off', 'neutral'] },
              ssi ? 'Ray commits, but his premise is now false. Abort!' : 'Ray commits. Nothing checks his premise.', ssi ? 'bad' : 'warn');
            const end = ssi
              ? S([[3, 'sees 1', 'good']], null, 'Ray retries: 1 on call, so he stays. Nobody ever waited.', 'good')
              : S([], { 1: ['off', 'bad'], 2: ['off', 'bad'] }, 'Nobody on call. Snapshot isolation let write skew through.', 'bad');
            if (order.get() === 'early') {
              return {
                rows: DOCS, ys: Y4, init,
                steps: [
                  S([[0, 'sees 2', 'info']], null, ssi ? 'Kim checks: 2 on call. SSI quietly records what she read.' : 'Kim checks: 2 on call.', 'info'),
                  S([[3, 'sees 2', 'info']], null, ssi ? 'Ray checks too. His read is recorded as well.' : 'Ray checks: also 2.', 'info'),
                  S([[0, 'Kim off', 'warn'], ssi && [3, '⚑ stale', 'warn']], { 1: ['off', 'warn'] },
                    ssi ? 'Kim’s write hits a row Ray read. Ray is flagged, not blocked.' : 'Kim goes off call.', ssi ? 'warn' : 'info'),
                  S([[3, 'Ray off', 'warn'], ssi && [0, '⚑ stale', 'warn']], { 2: ['off', 'warn'] },
                    ssi ? 'Ray’s write flags Kim the same way. Both keep running.' : 'Ray goes off call. Different row, no conflict.', ssi ? 'warn' : 'info'),
                  S([[0, 'commit', 'good']], { 1: ['off', 'neutral'] }, ssi ? 'Kim commits first. Ray hasn’t committed, so Kim is safe.' : 'Kim commits.', 'good'),
                  commitRay,
                  end,
                ],
              };
            }
            return {
              rows: DOCS, ys: Y4, init,
              steps: [
                S([[0, 'sees 2', 'info']], null, 'Kim checks: 2 on call.', 'info'),
                S([[0, 'Kim off', 'warn']], { 1: ['off', 'warn'] }, 'Kim goes off call. Not committed yet.', 'info'),
                S([[3, ssi ? 'sees 2 ⚑' : 'sees 2', ssi ? 'warn' : 'info']], null,
                  ssi ? 'Ray’s snapshot skips Kim’s pending write. SSI notes the skip.' : 'Ray’s snapshot hides Kim’s pending write: he sees 2.', ssi ? 'warn' : 'info'),
                S([[0, 'commit', 'good']], { 1: ['off', 'neutral'] }, ssi ? 'Kim commits. The write Ray skipped is now real.' : 'Kim commits.', 'good'),
                S([[3, 'Ray off', 'warn']], { 2: ['off', 'warn'] }, ssi ? 'Ray goes off call. SSI waits for his commit to judge.' : 'Ray goes off call.', 'info'),
                commitRay,
                end,
              ],
            };
          }
          const mk = tlStepper(v, box, st, scenario, (scn, i) => {
            const n = onCall(scn, i);
            const t = tally(scn, i);
            sOn.set(String(n), n ? 'good' : 'bad');
            sW.set(String(t.waits), 'good');
            sA.set(String(t.aborts), t.aborts ? 'warn' : 'good');
          });
          const stats = v.row(box, { center: true });
          const sOn = v.stat(stats, 'on call', '2', 'good');
          const sW = v.stat(stats, 'steps spent waiting', '0', 'good');
          const sA = v.stat(stats, 'aborts', '0', 'good');
          mk();
        },
      },
    ],

    cheatsheet: [
      { term: 'Atomicity', text: 'Really abortability: on error, every write of the transaction is undone.', kind: 'good' },
      { term: 'Consistency', text: 'Your invariants. The app defines them; the DB enforces only what you declare.', kind: 'primary' },
      { term: 'Isolation', text: 'Concurrent transactions don’t see each other’s half-done work.', kind: 'info' },
      { term: 'Durability', text: 'Committed data survives crashes via disk logs and replicas. Never absolute.', kind: 'good' },
      { term: 'Read committed', text: 'No dirty reads, no dirty writes. Row write locks + old committed values.', kind: 'info' },
      { term: 'Snapshot isolation', text: 'Each transaction reads a frozen snapshot. “Repeatable read” in PostgreSQL and MySQL.', kind: 'primary' },
      { term: 'MVCC', text: 'Rows tagged created_by / deleted_by; visibility rules pick each reader’s version.', kind: 'data' },
      { term: 'Lost update', text: 'Concurrent read-modify-writes clobber each other. Atomic ops, locks, detection, CAS.', kind: 'bad' },
      { term: 'Write skew', text: 'Two txns read the same premise, then update different rows. Invariant breaks.', kind: 'bad' },
      { term: 'Phantom', text: 'A write changes the result of another txn’s search. There’s no row to lock.', kind: 'warn' },
      { term: 'Serial execution', text: 'One thread, stored procedures, data in memory, partitioned. VoltDB, Redis.', kind: 'neutral' },
      { term: 'Two-phase locking', text: 'Pessimistic: shared read locks, exclusive write locks, held to commit. Deadlocks.', kind: 'warn' },
      { term: 'SSI', text: 'Optimistic: no blocking, detect stale premises, abort one txn at commit.', kind: 'good' },
    ],

    quiz: [
      {
        q: 'A crash hits between the two writes of a transfer. What does atomicity promise?',
        options: ['The first write is kept', 'Both writes are undone', 'The second write is retried for you'],
        answer: 1,
        why: 'Atomicity means abortability: a partial transaction is rolled back, so retrying is safe.',
      },
      {
        q: 'A report reads account A, a transfer commits, then the report reads B. Which anomaly can read committed allow?',
        options: ['Read skew: the total looks wrong', 'Dirty write', 'Deadlock'],
        answer: 0,
        why: 'Each read is committed, but from different moments. Snapshot isolation gives one consistent view.',
      },
      {
        q: 'Two doctors each see “2 on call” and each go off call. What happened?',
        options: ['A lost update', 'A dirty read', 'Write skew'],
        answer: 2,
        why: 'Both acted on the same premise and updated different rows. Snapshot isolation doesn’t catch it.',
      },
      {
        q: 'Why do single-threaded databases use stored procedures?',
        options: ['So network round trips don’t leave the one thread idle', 'To support joins', 'To encrypt queries'],
        answer: 0,
        why: 'Interactive transactions would hold the only thread while waiting on the app.',
      },
      {
        q: 'How does SSI differ from two-phase locking?',
        options: ['It blocks readers until writers commit', 'It lets transactions run and aborts at commit if a read went stale', 'It runs everything on one core'],
        answer: 1,
        why: 'SSI is optimistic: no blocking, but conflicts are detected and one transaction is aborted.',
      },
    ],
  });
})();
