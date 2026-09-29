# DDIA visually

An unofficial, **visual and interactive** study companion for *Designing Data-Intensive Applications* by Martin Kleppmann, covering chapters 1–11.

<!-- Live site: add the GitHub Pages link here after the first deploy -->

Reading 500 pages of dense text isn't for everyone. Here every idea from the book is a picture you can play with: crash a leader, race two transactions, overload a hot partition. You watch it break, then switch on the fix and watch it work.

## What's inside

- **11 chapters, 143 interactive cards.** Each card holds one idea, one live diagram, and one line of text.
- **Break it, then fix it.** Most cards let you trigger the problem (split brain, write skew, lost updates, clock skew…) and then apply the solution.
- **A cheat sheet and a 5-question quiz** at the end of every chapter.
- **Search** any concept (press `/` or `⌘K` / `Ctrl+K`) to jump straight to the card that explains it.
- **Jump anywhere:** numbered card buttons, an "All cards" panel, and a card list in the sidebar. **← →** keys step through cards.
- **Progress tracking**, saved in your browser.
- **Light and dark themes**, and it works on phones.

| Part | Chapters |
|---|---|
| I · Foundations of data systems | 1 Reliable, scalable, maintainable · 2 Data models · 3 Storage and retrieval · 4 Encoding and evolution |
| II · Distributed data | 5 Replication · 6 Partitioning · 7 Transactions · 8 The trouble with distributed systems · 9 Consistency and consensus |
| III · Derived data | 10 Batch processing · 11 Stream processing |

## Run it locally

There's no build step and no dependencies. Clone the repo and open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8321
```

Then open <http://localhost:8321>.

## How it's built

Plain HTML, CSS and JavaScript with inline SVG, and no frameworks.

```
index.html            page shell and script tags
css/app.css           theme tokens (light/dark), layout, diagram styles
js/viz.js             the small visualization kit every chapter uses
js/app.js             router, home map, search, card view, cheat sheets, quizzes, progress
js/chapters/chNN.js   one file per chapter
AUTHORING.md          how to write or extend a chapter
scripts/selftest.mjs  headless-Chrome test that walks every card and control
```

## Tests

```bash
node scripts/selftest.mjs all      # or a single chapter, e.g. 5
```

The test opens the site in headless Chrome, visits every card, clicks every control, answers every quiz, and reports errors or diagrams that overflow. It needs Node 22+ and Google Chrome (set `CHROME=/path/to/chrome` if it isn't in the default macOS location).

## Contributing

Found a mistake or have an idea for a better visual? Issues and pull requests are welcome. To add or change a card, read [AUTHORING.md](AUTHORING.md), then make sure `node scripts/selftest.mjs <chapter>` passes.

## Disclaimer

This is an independent learning aid with original explanations and drawings. It is not affiliated with or endorsed by the author or O'Reilly Media, and it contains no text or figures from the book. If you find it useful, [read the book](https://dataintensive.net/); it's excellent.
