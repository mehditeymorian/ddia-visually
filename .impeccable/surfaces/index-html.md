---
version: 1
slug: "index-html"
primary_target: "index.html"
related_targets: []
---

# Surface brief: the whole site (index.html)

Scope: every route of the single-page app: home, chapter cards, cheat sheets, quizzes, search, the Playground hub and lab pages. Visitor mode: **Read** for home, cards, cheat sheets and quizzes; **Operate** inside labs.

Audience and job: self-studying engineers and interview candidates. They open one card or lab at a time, grasp the idea from the live diagram, and move on. Constraints: plain HTML/CSS/JS, chapter files untouched (diagram style lives in `js/viz.js` + `css/app.css`), light and dark themes, phones.

Chosen direction: the docs companion, played straight at react.dev's craft level (user choice, round 2). Memorable moment: a card reads like a well-made docs page whose example is alive; the lab panel reads top to bottom as predict, setup, run, results.

Unresolved: none blocking. A right-hand "on this page" rail was considered and left out (cards are one idea each).

## Direction contract

THESIS: DDIA visually as a first-class docs companion. Every card is a docs page whose live diagram is the inline example, like react.dev's sandboxes. It refuses the cream-paper editorial frame and every metaphor chrome (the drawn map, numbered pips, tile grids).

OWN-WORLD: White page, cool charcoal in dark. System UI type, one link blue for links, current states and the single filled primary action per view. Hairline borders, 12–16px radii on frames, pill buttons, tinted callouts with no side stripes. Diagrams keep the semantic kinds in one saturated, even set.

STORY: A learner lands on the contents with one clear action (Start or Continue). They read a card top to bottom (title, takeaway, live diagram, breaks and fix, next), and in a lab they predict, set up and read results in one panel beside the diagram, and play the model from controls on its own frame (Run, Next run, Skip, Reset), the way react.dev puts sandbox actions on the sandbox. Adapted during the build after the first lab capture showed the run bar crowding the panel.

FIRST VIEWPORT: A sticky 56px top bar holds the name, a wide search field, a Playground link and the theme switch. A 272px contents sidebar sits on the left. The main column has a 44–48px H1, a lede, a blue pill Start/Continue plus a text link, then the chapter list grouped by part. On a card page, the H1 is the card title, then the lede, problem/fix pills, a rounded sandbox frame holding the live demo, and prev/next boxes.

FORM: The category standard (the docs companion), taken by the user as the standing exit in round 2. Quality bar: react.dev. Seed key c65222b1.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
