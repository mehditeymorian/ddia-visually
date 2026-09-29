# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Self-studying engineers** reading *Designing Data-Intensive Applications*, alongside the book or instead of its 500 pages. They learn from pictures and dislike long text. They come in short sessions, one card or one lab at a time.
- **Interview candidates** preparing for system-design interviews. They need a concept fast, want to check they really understand it, and use the cheat sheets, quizzes and search heavily.

## Product Purpose

An unofficial, visual and interactive study companion for DDIA, chapters 1 to 11. Every idea from the book is a small live model the learner can break and then fix. Success means a learner can explain a concept (a quorum, write skew, a fencing token) because they watched it fail and watched the fix work, not because they read a definition.

## Positioning

The site doesn't summarize the book; it simulates it. Each card is one idea, one live diagram and one line of text, and most let the learner trigger the failure and then switch on the fix. The playground labs run a deterministic, seeded model: the same model draws the animation, answers the learner's predictions and grades the challenges, so the three can never disagree.

## Operating Context

- Desktop next to the book or a notes app, or a phone for a few minutes at a time.
- Keyboard use is common: `/` or `⌘K` search, `← →` to step through cards.
- Progress is saved only in the learner's browser (localStorage).
- The live site is on GitHub Pages: https://mehditeymorian.github.io/ddia-visually/

## Capabilities and Constraints

- 11 chapters, 143 cards, a cheat sheet and a 5-question quiz per chapter, site-wide search, an "All cards" panel, and progress tracking.
- A playground with three labs so far: Quorum (chapters 5 and 9: knobs and a replica builder), Isolation (chapter 7: a two-transaction timeline) and Partitioning (chapter 6: placement, hot keys, range reads and adding a node). More labs are planned (clocks and fencing, LSM vs B-tree, stream windows, consensus).
- Plain HTML, CSS and JavaScript with inline SVG. No build step, no frameworks and no external libraries. Chapters are authored through `DDIA.chapter({...})` and a shared visualization kit (`js/viz.js`); labs through `DDIA.lab({...})`. Visual changes to diagrams belong in the shared kit so chapter files don't need editing.
- Light and dark themes are both required. The site must work on phones.
- A lab opens on a menu of scenario cards, each with a small drawing of its setup, a one-line question and the learner's status. Challenges put the goal, a pass checklist and Test together, and reveal a solution after two failed tests.
- Lab bounding rules (discrete options, at most three knobs shown per scenario, predict before run, a prediction always asks about the setup on screen) are enforced in code today. The owner has not fixed them as untouchable: how learners set up a lab is open to rework, as long as nobody gives up because the setup is complex.

## Brand Commitments

- Name: **DDIA visually**.
- Independent learning aid. Not affiliated with or endorsed by Martin Kleppmann or O'Reilly Media. It contains no text or figures from the book; everything is written and drawn in the site's own words. It points readers to the book.
- Voice: short and concrete. Card titles of 8 words or fewer, one-sentence captions, labels of 1 to 3 words, no emoji.
- Standing preference (chosen 2026-09-29 after comparing live demos): the site follows the familiar docs-companion convention, played straight with no metaphor chrome. The quality bar is react.dev: calm structured docs with live examples inline.

## Evidence on Hand

- Real content: 143 cards with live demos (`js/chapters/ch01.js` to `ch11.js`), 3 labs (`js/labs/`), cheat sheets and quizzes.
- There are no testimonials, user counts, ratings or endorsements. Don't invent any.
- `book.pdf` sits in the working folder for the maintainer's reference only. It is git-ignored and must never be published or quoted.

## Product Principles

1. **Picture first, text last.** If a card needs a paragraph to make sense, the drawing isn't finished yet.
2. **Break it, then fix it.** Learners understand a mechanism when they trigger the failure themselves and then watch the fix work.
3. **Nothing a learner can change should overwhelm them.** Every choice is small, discrete and reversible, and nobody should quit because of setup.
4. **The model is the truth.** What the learner sees, what they're told, and how they're graded all come from the same deterministic model.
5. **Respect the book.** Use our own words and drawings, and send people to the source.

## Accessibility & Inclusion

No external standard is mandated. Current practice to keep: full keyboard navigation, a visible focus ring, a skip link, focus moved to the page on route changes, labelled diagrams, reduced-motion support, and touch targets of at least 44px on coarse pointers.
