# Authoring a chapter

Each chapter is one file, `js/chapters/chNN.js`, that calls `DDIA.chapter({...})`.
There is no build step: plain ES2020 in a classic script. Don't use `import` or `export`, and don't load external libraries.
`js/chapters/ch01.js` is the reference implementation, so read it first.

## Audience and tone

The reader is a **visual learner who dislikes long text**. Every card should be understandable from the picture alone.

- **Card title:** ≤ 8 words. A punchy claim or question ("Leader dies. Who takes over?").
- **Caption:** one sentence, ≤ 25 words, stating the single takeaway.
- **Text inside demos:** captions ≤ 15 words, and labels of 1–3 words.
- Write **everything in your own words**. Never copy sentences, figures or long quotes from the book. Explain concepts and use your own examples. Real product names (PostgreSQL, Kafka, Cassandra…) are fine as `tags`.
- No emoji. For button icons use plain Unicode symbols: `▶ ↺ ⟲ ✕ ✓ ★ ⚙ ✎ ◉ ⏸ ↗ ＋ − ⇄ ⚑ ✱`.

## Chapter definition

```js
DDIA.chapter({
  id: 5,                       // chapter number
  part: 2,                     // 1 = foundations (ch1–4), 2 = distributed (ch5–9), 3 = derived (ch10–11)
  title: 'Replication',        // chapter title (short)
  short: 'Replication',        // ≤ 18 chars, used as the label on the home map
  tagline: 'Same data, many machines',  // ≤ 8 words
  cards: [ /* 8–12 cards; every book section gets at least one */ ],
  cheatsheet: [ { term: 'Leader', text: 'Takes all writes, streams them to followers.', kind: 'primary' } /* 8–14 items */ ],
  quiz: [ { q: 'Question?', options: ['A', 'B', 'C'], answer: 1, why: 'One-line explanation.' } /* exactly 5 */ ],
});
```

### Card

```js
{
  title: 'Leader dies. Who takes over?',
  caption: 'A follower gets promoted, but unsent writes on the old leader can vanish.',
  problem: 'Leader crash',          // optional red chip
  fix: 'Automatic failover',        // optional green chip
  tags: ['MySQL', 'PostgreSQL'],    // optional "seen in" chips (≤ 4)
  demo(el, v) { /* build the interactive visual inside el */ },
}
```

Every card **must** have a `demo`, and every demo **must** be interactive: it needs at least one control (button, segmented switch, slider, toggle, or stepper). "Break it, then fix it" is the house style. Let the user trigger the problem, then switch on the fix and replay.

## Semantic colors (`kind`)

| kind | meaning |
|---|---|
| `neutral` | ordinary component |
| `primary` | the main actor: leader, coordinator, the thing being explained |
| `good` | healthy, correct, committed, the fix |
| `bad` | crashed, conflict, anomaly, data loss |
| `warn` | risk, stale, in progress, waiting |
| `info` | requests, clients, reads |
| `data` | data items, messages, events, records |
| `ghost` | absent/inactive (dashed outline) |

Text-only kinds for `st.text` also exist: `text`, `text2`, `muted`, `accent`.

## The viz kit: `v`

`v` is scoped to the card. Everything started through it is cancelled when the user leaves the card.
**Never** call `setTimeout`, `setInterval` or `requestAnimationFrame` directly, and never query outside `el` (`document.querySelector`).

### Lifecycle and timing
| call | does |
|---|---|
| `await v.sleep(ms)` | pause; never resolves if the card restarts or unmounts, which halts stale flows |
| `v.restart()` | cancel every in-flight sleep/tween/`send` in this card (DOM is kept) |
| `v.every(ms, fn)` → `stop()` | repeating timer (survives `restart`, stops on unmount) |
| `v.after(ms, fn)` | one-shot timer |
| `await v.tween(ms, t => …)` | animate 0→1 with easing |
| `v.onDispose(fn)` | cleanup hook |

**Replay pattern.** Start every button handler that runs an animation with `v.restart(); st.clearPackets();`, then reset visual state, then run the flow. Handlers must be safe to click repeatedly and in any order.

### HTML building blocks (all append to `parent` and return a handle)
| call | returns |
|---|---|
| `v.wrap(el)` | vertical container, `.vz` with a 12px gap. Start every demo with `const box = v.wrap(el)` |
| `v.row(parent, {center})` | horizontal flex row |
| `v.grid(parent, minPx)` | responsive grid |
| `v.panel(parent, title)` | bordered panel with an uppercase title |
| `v.controls(parent, [{id, label, icon, kind: 'primary'｜'danger'｜'good'｜'ghost', onClick}])` | `{el, btn(id), set(id, {label, disabled, hidden})}` |
| `v.segmented(parent, {options: [{value, label, kind}], value, onChange})` | `{el, get(), set(v)}`; use it for Problem/Fix or mode switches |
| `v.slider(parent, {label, min, max, step, value, format, onInput})` | `{el, get(), set()}` |
| `v.toggle(parent, {label, value, onChange})` | `{el, get(), set()}` |
| `v.caption(parent, text, kind)` | `{set(text, kind)}`: a live one-liner under the visual, the narrator |
| `v.log(parent, {title, max})` | `{add(text, kind), clear()}`: a short event log, newest first |
| `v.bars(parent, {items: [{label, value, kind, text}], max, unit})` | `{update(items, max)}`: horizontal bar chart |
| `v.table(parent, {cols, rows})` | `{update(rows)}`. A row is `['a', 'b']`, or `{cells: [...], kind, dim}`, or a cell `{text, kind}` |
| `v.cell(text, kind, {sm, pop, dim, strike})` | a mono "memory cell" chip (DOM element) |
| `v.tape(parent, items)` | a row of cells. `{set([{text, kind}]), push({text, kind})}`: logs, SSTables, byte strings |
| `v.stat(parent, label, value, kind)` | a big number with a label. `{set(value, kind)}` |
| `v.stepper(parent, {steps: ['caption'｜{caption, kind}], render: async (i, animate) => {}, delay, autoplay})` | ⟲ ◀ n/N Next ▶ Auto controls plus its own caption. `render(i)` must draw the full state for step `i` from scratch (usually `st.clear()` + redraw), and should animate only when `animate` is true |
| `v.h(tag, attrs, ...children)` | DOM builder (`class`, `style` object, `onclick`, `text`, `html`) |

### SVG stage: `const st = v.stage(parent, {w: 560, h: 320})`
The coordinate system is the viewBox. Keep all content inside `0..w × 0..h` (the self-test flags overflow). The default is 560×320; use 560 wide and set `h` to 180–380 as needed. It scales to the card width, so it's roughly 1.25× on desktop and 0.6× on phones: **keep labels ≥ 12px, prefer 14–15px.**

| call | notes |
|---|---|
| `st.node({x, y, w=116, h=48, label, sub, kind, shape, badge, badgeKind, down, dim, mono, size})` | `shape`: `rect`, `db` (cylinder), `pill`, `circle`, `doc`, `person`. `x, y` is the **center**. `down: true` gives a dashed, faded "crashed" look. `badge` is a small corner pill such as `'v3'` or `'30M'` |
| `node.set({...})` | change any field; `x`/`y` animate a move. Returns the node |
| `node.moveTo(x, y, animate=true, ms)` | Promise |
| `node.flash()` / `node.dim(bool)` / `node.show(bool)` / `node.remove()` | |
| `st.link(a, b, {kind='muted', arrow=true, both, dashed, dotted, thin, thick, label, curve, labelDy})` | an edge between nodes (or `{x, y}` points). It follows nodes when they move. `link.set({...})`, `.show(bool)`, `.remove()` |
| `await st.send(a, b, {label, kind='primary', dur=900, drop, curve, keep})` | animated message pill from a to b. `drop: true` (or 0..1) loses it midway with a ✕. Resolves on arrival. Run in parallel with `Promise.all` |
| `st.text(x, y, str, {size=14, anchor='middle', kind='text', bold, weight, mono, halo, italic, layer})` | `{set(str, kind), move(x, y), show(b), remove()}` |
| `st.box(x, y, w, h, {label, kind, solid, filled})` | dashed region (e.g. "Datacenter A"), drawn behind everything. `{set({kind, label})}` |
| `st.rect(x, y, w, h, {kind, rx, label, mono, size, layer})` | a filled cell/bar. `{set({kind, label, x, y, w, h, opacity})}` |
| `st.line(x1, y1, x2, y2, {kind='muted', dashed, dotted, width, arrow, layer})` | axes, timelines |
| `st.path(d, {kind, dashed, width, arrow, fill})` | curves and charts |
| `st.add(tag, attrs, layer)` | raw SVG element (`layer`: `back`, `links`, `nodes`, `top`). For themed fills use `class: 'vz-shape k-good'`, and for text `class: 'vz-ink k-good'` |
| `st.clearPackets()` / `st.clear()` | |

**Timelines** (clocks, linearizability, transactions over time): draw horizontal lanes with `st.line`, put operation bars on them with `st.rect({label})`, and put arrows between lanes with `st.line({arrow: true})` or `st.send` between `{x, y}` points.

## Minimal example

```js
{
  title: 'Async follower lags behind',
  caption: 'The leader confirms before the follower has the write, so a read from the follower can be stale.',
  problem: 'Stale read', fix: 'Read your own writes from the leader',
  demo(el, v) {
    const box = v.wrap(el);
    const mode = v.segmented(box, { options: [{ value: 'bug', label: 'Problem', kind: 'bad' }, { value: 'fix', label: 'Fix', kind: 'good' }], onChange: run });
    const st = v.stage(box, { w: 560, h: 220 });
    const user = st.node({ x: 60, y: 110, w: 56, h: 56, shape: 'person', label: 'You' });
    const leader = st.node({ x: 280, y: 50, label: 'Leader', kind: 'primary', shape: 'db' });
    const follower = st.node({ x: 280, y: 170, label: 'Follower', shape: 'db' });
    st.link(leader, follower, { dashed: true, label: 'replication' });
    const cap = v.caption(box, '');
    v.controls(box, [{ label: 'Replay', icon: '▶', kind: 'primary', onClick: run }]);
    async function run() {
      v.restart(); st.clearPackets();
      follower.set({ kind: 'neutral', badge: 'v1' });
      cap.set('You update your profile', 'info');
      await st.send(user, leader, { label: 'v2' });
      leader.set({ badge: 'v2' });
      if (mode.get() === 'fix') {
        await st.send(user, leader, { label: 'read', kind: 'info' });
        cap.set('Read from the leader: you see v2', 'good');
        return;
      }
      await st.send(user, follower, { label: 'read', kind: 'info' });
      follower.set({ kind: 'bad' });
      cap.set('Follower still has v1. Your edit "vanished".', 'bad');
      await st.send(leader, follower, { label: 'v2', kind: 'data' });
      follower.set({ kind: 'good', badge: 'v2' });
    }
    run();
  },
}
```

## Self-check (required before you finish)

```bash
node --check js/chapters/chNN.js
scripts/selftest.sh N        # headless Chrome: walks every card, clicks every control, answers the quiz
```
`selftest.sh` prints JSON. `ok` must be `true` with `errors: []`. Fix every `warnings` entry about overflow, missing controls, or long titles and captions.
