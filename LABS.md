# Authoring a playground lab

A **lab** is a small simulation that learners steer themselves. Cards show one scripted idea; a lab lets people try their own "what if…" and see the consequence. Each lab is one file, `js/labs/<id>.js`, that calls `DDIA.lab({...})`. `js/labs/quorum.js` (knobs + builder) and `js/labs/isolation.js` (timeline) are the reference implementations.

There's no build step. Use plain ES2020 in a classic script, don't use `import`/`export`, and don't load external libraries. Chapter tone rules from [AUTHORING.md](AUTHORING.md) apply to all lab text.

## The idea in one paragraph

A lab has a **pure model**: `run(cfg, input) → { trace, stats }`. The model has no DOM, no timers and no `Math.random`, so the same inputs always give the same result. The **view** only replays the trace as animation. Because the model is pure, the shell can run it hundreds of times in milliseconds. It does that to answer "predict first" questions ("in 37 of 100 runs"), to fill the "Try all runs" grid, and to grade challenges. The animation, the answers and the grades can never disagree.

## Bounding rules (enforced)

Labs must never overwhelm. `DDIA.lab.validate()` checks these rules when the lab registers. A broken rule logs `console.error`, which fails both `scripts/labtest.mjs` and the self-test.

| Rule | Limit |
|---|---|
| Knobs per lab | ≤ 7 |
| Options per knob | 2–5, discrete (rendered as a segmented switch; no free numbers) |
| Knobs shown by a preset or challenge | ≤ 3 (the rest sit behind "More knobs" in presets and are fixed in challenges) |
| Builder slots | ≤ 5 slots, ≤ 4 states each |
| Timeline | ≤ 2 transactions × ≤ 5 steps |
| Nudge | ≤ 15 words |
| Presets | ≥ 1; the lab always opens on one, never on a blank setup |

## Definition

```js
DDIA.lab({
  id: 'quorum',                     // URL: #/lab/quorum/<preset>
  title: 'Quorum lab',
  short: 'Quorums',                 // used in the home banner
  tagline: 'Tune w and r, break replicas, catch stale reads',
  chapters: [5, 9],
  styles: ['knobs', 'builder', 'challenges'],   // chips on the hub tile

  knobs: [{ id: 'w', label: 'Write quorum w', options: [{ value: 1, label: '1' }, /* … */] }],
  slots: { label: 'Replicas', hint: 'Click a replica…', max: 5, states: [{ value: 'up', label: 'Healthy', kind: 'good' }] }, // optional builder
  defaults: { n: 3, w: 2, r: 2, slots: ['up', 'up', 'up'] },
  normalize(cfg) { /* clamp dependent values, e.g. w ≤ n; return cfg */ },
  disabled(cfg, knobId, value) { /* optional: grey out impossible options */ },

  run(cfg, input) { return { trace, stats }; },   // pure and deterministic
  defaultInput(cfg), samples(cfg),                // one input, and every input for "all runs"
  nextInput(cfg, input), nextLabel: 'Next run',   // the run bar's "next" button
  inputKey(input) → string, parseInput(string, cfg) → input | null, inputLabel(input) → 'run #7',
  sampleNoun: ['run', 'runs'],                    // "in 12 of 100 runs"

  metrics: [{ id: 'stale', label: 'Stale reads', kind: 'bad' }, { id: 'slowest', label: 'Slowest op', plain: true, fmt: (v) => v + ' ms' }],
  classify(stats, cfg) { return { kind: 'bad', label: 'stale reads' }; }, // one verdict per run: good | warn | bad

  view(el, v, api) { return { render(result, cfg, input, { animate, preview }) { /* → Promise */ } }; },
  presets: [/* … */],
  challenges: [/* … */],
});
```

### Presets

```js
{
  id: 'stale-read', title: 'Lagging replica',
  config: { n: 3, w: 1, r: 1, slots: ['up', 'up', 'lag'] },
  knobs: ['w', 'r', 'net'],                        // ≤ 3 shown; others behind "More knobs"
  input: 46,                                       // optional: open on a run that shows the effect
  nudge: 'Raise w or r until the stale reads stop.',
  predict: { q: 'w = 1, r = 1… Will reads be stale?', metric: 'stale', config: { /* optional overrides to ask about */ } },
}
```

The predict answer is **computed**. The shell runs `samples()` with the preset config (plus `predict.config`) and counts the runs where `stats[metric] > 0`: never, sometimes or every run. Never hard-code an answer. After the reveal, `predict.config` is applied to the knobs, so the learner sees exactly what was asked.

### Challenges

```js
{
  id: 'missed-writes', title: 'Missed writes, zero stale',
  goal: 'Replica 3 misses every write, then rejoins. Serve no stale reads and fail nothing.',
  config: { n: 3, w: 1, r: 1, slots: ['up', 'up', 'rec'] }, knobs: ['w', 'r', 'repair'], // everything else is fixed
  input: [1, 1, 2, 2],                                   // optional start input
  criteria: [
    { label: 'No stale reads', metric: 'stale', max: 0 },                  // every sample must satisfy it
    { label: 'Both leave', metric: 'anomaly', min: 1, scope: 'current' }, // only the run on screen
    { label: 'No weaker level works', test(cfg, ctx) { /* ctx.runAll(cfg2) */ return { ok, text }; } },
  ],
  hint: 'Read quorums must overlap write quorums…',
  solution: { config: { w: 2, r: 2 }, input: /* optional */ },   // used by the tests, never shown
}
```

The tests require every challenge to **fail at its start config** and **pass with its solution**.

## The model

Timed systems (networks, clocks, replicas) use `DDIA.sim`:

```js
const model = {
  init(ctx, cfg) {           // schedule the workload; return state
    const s = { net: DDIA.sim.net(ctx, { latency: [10, 40], isDown: (node, t) => false }) };
    ctx.at(0, 'wantWrite', { ver: 1 });
    return s;
  },
  handle(ctx, s, ev) {       // react to one event at ctx.now
    if (ev.type === 'deliver' && s.net.arrived(ev)) { /* … */ }
    ctx.emit('opdone', { /* anything the view needs */ });
  },
  finish(ctx, s) { return { stale: 0 /* stats */ }; },
};
run: (cfg, seed) => DDIA.sim.run(model, cfg, seed),
```

- `ctx.rng` is the only source of randomness (seeded). `latency` may be `[lo, hi]` or a function `(rng) → ms` for tail-heavy networks.
- `net.send()` emits `send` with an `arrive` time, so views can animate the flight. A message to a node that is down on arrival emits `drop`.
- The run stops when the event queue is empty. More than 50,000 events throws "simulation ran away".

Step-based labs (like Isolation) can skip `DDIA.sim` and return a trace of rows directly.

## The view

- `render()` must draw everything for the given result from scratch. With `animate` it replays the trace (use `v.sleep(api.pace(ms))`, so the 1×/3× switch works); without it, it shows the end state at once. With `preview` it shows only the setup, with no outcome, because the learner hasn't predicted yet.
- The lab's own editors call back into the shell: `api.set({ slots })` from the builder, and `api.setInput(order)` from `DDIA.labkit.orderEditor`. `api.canEdit('slots' | 'order' | knobId)` says what the current tab allows.
- Keep SVG text ≥ 14 px, since stages shrink to about 0.6× on phones. Tables and lists read better as HTML (see the Isolation view).

## Linking cards to labs

Add `lab` to a card; the card is the single source of truth:

```js
{ title: '2PL: readers and writers block each other', lab: { id: 'isolation', preset: 'lost-update', set: { iso: '2pl' } }, … }
```

The card shows **"Try it yourself in the Isolation lab"**. The preset lists every card that links to it under "Seen in".

## Checklist

```bash
node scripts/labtest.mjs          # model, bounding, predicts, challenges, card links
node scripts/selftest.mjs labs    # headless Chrome: every tab, every control, overflow, errors
```

Add Node tests for your model's key claims, such as "w + r > n never serves stale reads" or "SSI fixes write skew in every order". The UI can only be as right as the model.
