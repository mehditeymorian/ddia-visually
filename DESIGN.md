---
name: DDIA visually
description: A docs companion for Designing Data-Intensive Applications whose every example is a live, breakable diagram.
colors:
  link: "#0a63c9"
  link-hover: "#084e9e"
  accent-bg: "#ebf3fe"
  on-accent: "#ffffff"
  bg: "#ffffff"
  wash: "#f6f7f9"
  surface: "#ffffff"
  surface-2: "#f2f4f7"
  surface-3: "#e5e8ee"
  text: "#16181d"
  text-2: "#444b57"
  text-3: "#5d6574"
  border: "#e4e7ec"
  border-strong: "#cdd2da"
  link-dark: "#5aa7ff"
  link-hover-dark: "#86beff"
  accent-bg-dark: "rgba(90, 167, 255, .13)"
  on-accent-dark: "#0b1422"
  bg-dark: "#16181d"
  wash-dark: "#1b1e24"
  surface-2-dark: "#20242c"
  surface-3-dark: "#2b303a"
  text-dark: "#eceff4"
  text-2-dark: "#b6bdc9"
  text-3-dark: "#939cab"
  border-dark: "#272c35"
  border-strong-dark: "#3a414d"
  mark: "rgba(255, 200, 40, .38)"
  k-neutral-f: "#f3f4f6"
  k-neutral-s: "#6b7280"
  k-neutral-i: "#1f2937"
  k-primary-f: "#eef0ff"
  k-primary-s: "#5b5ff0"
  k-primary-i: "#2e2a86"
  k-good-f: "#e8f8f0"
  k-good-s: "#0f9f6e"
  k-good-i: "#065f46"
  k-bad-f: "#fdeeee"
  k-bad-s: "#e5484d"
  k-bad-i: "#97191d"
  k-warn-f: "#fff6e0"
  k-warn-s: "#d99a06"
  k-warn-i: "#7a4a02"
  k-info-f: "#eaf3ff"
  k-info-s: "#2f80ed"
  k-info-i: "#123f85"
  k-data-f: "#fff1e6"
  k-data-s: "#ef7a2a"
  k-data-i: "#8a3a0b"
  k-ghost-s: "#a0a7b3"
  k-ghost-i: "#5d6574"
typography:
  display:
    fontFamily: "system-ui, -apple-system, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif"
    fontSize: "clamp(38px, 5vw, 52px)"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "system-ui, -apple-system, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif"
    fontSize: "clamp(30px, 3.6vw, 40px)"
    fontWeight: 800
    lineHeight: 1.12
    letterSpacing: "-0.03em"
  title:
    fontFamily: "system-ui, -apple-system, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif"
    fontSize: "26px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  item-title:
    fontFamily: "system-ui, -apple-system, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "-0.01em"
  lede:
    fontFamily: "system-ui, -apple-system, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 1.6
  body:
    fontFamily: "system-ui, -apple-system, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.6
  body-s:
    fontFamily: "system-ui, -apple-system, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "system-ui, -apple-system, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.3
  small:
    fontFamily: "system-ui, -apple-system, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
  micro:
    fontFamily: "system-ui, -apple-system, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.4
  data:
    fontFamily: "ui-monospace, \"SF Mono\", SFMono-Regular, Menlo, Consolas, \"Liberation Mono\", monospace"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.3
  diagram-label:
    fontFamily: "system-ui, -apple-system, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1
rounded:
  xs: "6px"
  sm: "8px"
  md: "10px"
  frame-sm: "12px"
  lg: "16px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  section: "48px"
  gutter-mobile: "16px"
  gutter: "48px"
  tap: "36px"
  tap-coarse: "44px"
  topbar-h: "56px"
  sidebar-w: "272px"
  page-w: "900px"
  lab-w: "1180px"
components:
  button-primary:
    backgroundColor: "{colors.link}"
    textColor: "{colors.on-accent}"
    typography: "{typography.body-s}"
    rounded: "{rounded.pill}"
    padding: "0 18px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.link-hover}"
    textColor: "{colors.on-accent}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.body-s}"
    rounded: "{rounded.pill}"
    padding: "0 18px"
    height: "40px"
  button-secondary-hover:
    backgroundColor: "{colors.surface-2}"
  diagram-button:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 14px"
    height: "{spacing.tap}"
  diagram-button-ghost:
    textColor: "{colors.text-2}"
    rounded: "{rounded.pill}"
  segmented-track:
    backgroundColor: "{colors.surface-2}"
    rounded: "{rounded.pill}"
    padding: "3px"
  segmented-option-on:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.link}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 12px"
  chip-problem:
    backgroundColor: "{colors.k-bad-f}"
    textColor: "{colors.k-bad-i}"
    typography: "{typography.small}"
    rounded: "{rounded.pill}"
    padding: "3px 12px"
    height: "30px"
  chip-fix:
    backgroundColor: "{colors.k-good-f}"
    textColor: "{colors.k-good-i}"
    typography: "{typography.small}"
    rounded: "{rounded.pill}"
    padding: "3px 12px"
    height: "30px"
  callout:
    backgroundColor: "{colors.wash}"
    textColor: "{colors.text-2}"
    typography: "{typography.body-s}"
    rounded: "{rounded.lg}"
    padding: "16px 20px"
  callout-note:
    backgroundColor: "{colors.accent-bg}"
    textColor: "{colors.text-2}"
    rounded: "{rounded.lg}"
    padding: "16px 20px"
  sandbox:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
  sandbox-bar:
    backgroundColor: "{colors.wash}"
    textColor: "{colors.text-3}"
    typography: "{typography.small}"
    padding: "0 8px 0 16px"
    height: "44px"
  pager-link:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.link}"
    rounded: "{rounded.lg}"
    padding: "14px 18px"
    height: "72px"
  side-link:
    textColor: "{colors.text-2}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "6px 10px"
    height: "36px"
  side-link-active:
    backgroundColor: "{colors.accent-bg}"
    textColor: "{colors.link}"
  search-input:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 40px 0 38px"
    height: "38px"
  lab-tab:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-2}"
    rounded: "{rounded.pill}"
    padding: "0 14px"
    height: "34px"
  lab-tab-current:
    backgroundColor: "{colors.accent-bg}"
    textColor: "{colors.link}"
  lab-panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "18px 20px"
  verdict-good:
    backgroundColor: "{colors.k-good-f}"
    textColor: "{colors.k-good-i}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 12px"
    height: "28px"
  verdict-bad:
    backgroundColor: "{colors.k-bad-f}"
    textColor: "{colors.k-bad-i}"
    rounded: "{rounded.pill}"
    padding: "0 12px"
    height: "28px"
  quiz-panel:
    backgroundColor: "{colors.wash}"
    rounded: "{rounded.lg}"
    padding: "26px 28px 28px"
  quiz-option:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.body-s}"
    rounded: "{rounded.frame-sm}"
    padding: "12px 14px"
---

# Design System: DDIA visually

## Overview

**Creative North Star: "The Live Docs Page"**

Every screen is a calm, well-made documentation page whose example is alive. The page itself is quiet: a white sheet (cool charcoal at night), the platform's own UI type, hairline borders and one link blue. All the colour and motion the site has is spent inside the diagram, which sits in a rounded sandbox frame the way a code sandbox sits in a docs article. The bar is react.dev: structured, generous, legible, with the interactive example inline rather than in a separate app.

Density is moderate and reading-first. A sticky 56px top bar and a 272px contents sidebar frame a single 900px column; labs widen to 1180px and put a sticky panel (Predict, Setup, Result, Test your design, All runs) beside the model. Headings are heavy and tightly tracked; everything else is set at ordinary docs sizes in three greys. The page never decorates itself: no textures, no metaphor chrome, no ornamental colour. Controls are pills, frames are 16px-rounded boxes, and state is carried by a mark plus a word.

The built hero H1 runs 38 to 52px (the direction contract planned 44 to 48px); the build is recorded here.

**Key Characteristics:**
- White page and cool charcoal dark theme, both first-class.
- System UI type for everything readable; platform mono for data, values and diagram cells.
- One link blue for links, current states and the single filled action per view.
- Hairline borders, 16px frames, fully rounded pill controls.
- A semantic diagram palette (eight kinds, each a fill, stroke and ink) used only inside diagrams and state feedback.
- Flat page, one soft shadow reserved for the sandbox frame and floating layers.

## Colors

A near-colourless docs shell with a single blue voice, and a separate, evenly saturated semantic set that belongs to the diagrams.

### Primary
- **Link Blue** (link; brightened to link-dark at night): links, the current item in navigation, the focus ring, text caret, progress fills, and the fill of the one primary action per view. Hover deepens to Link Blue Hover (link-hover / link-hover-dark).
- **Blue Wash** (accent-bg / accent-bg-dark): the tint behind the current sidebar row, the current top link, the current lab tab, the selected search result, the note callout and the lab goal strip. It is how "you are here" reads without a filled block.
- **On Blue** (on-accent / on-accent-dark): text and icons on a filled blue control. White by day, near-black navy at night because the night blue is light.

### Neutral
- **Page White / Charcoal** (bg, surface / bg-dark): the page and every framed surface. Surface equals the page; frames are separated by hairlines, not by tone.
- **Wash** (wash / wash-dark): the second plane. Sandbox toolbar, run bar, callouts, quiz panel, diagram captions, stat tiles, lab thumbnails, hovered contents rows.
- **Fill 2 and Fill 3** (surface-2, surface-3 and dark pairs): control hover, search field rest state, segmented-control track, number badges; Fill 3 for progress tracks and toggle tracks.
- **Ink, Ink 2, Ink 3** (text, text-2, text-3 and dark trio): headings and values; ledes, body copy in panels and secondary labels; meta, counts, hints and placeholders.
- **Hairline and Strong Hairline** (border, border-strong and dark pair): every divider and frame edge; the strong one outlines resting buttons, quiz options and input-like pills.
- **Highlighter** (mark): search-match highlighting only.

### Diagram Kinds
Eight semantic kinds, each a trio of fill (-f), stroke (-s) and ink (-i), redefined as a set for dark mode: neutral (grey), primary (indigo), good (green), bad (red), warn (amber), info (blue), data (orange), ghost (dashed grey, transparent fill). Nodes, cells, links, packets, captions, log lines, table rows and bars draw from them. Outside diagrams, only good, bad and warn appear, as state feedback: problem and fix chips, verdict pills, quiz answers, completion marks, stat values.

### Named Rules
**The One Blue Rule.** Link Blue means link, current or the primary action. It is never decoration, never a section colour, never a background wash for emphasis beyond the Blue Wash current/note roles.

**The Kinds Stay In The Diagram Rule.** The eight diagram kinds colour the model and its feedback. The shell (bars, sidebar, cards, headings) stays neutral and blue.

## Typography

**Display Font:** the system UI stack (system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial)
**Body Font:** the same system UI stack
**Label/Mono Font:** the platform mono stack (ui-monospace, SF Mono, Menlo, Consolas, Liberation Mono)

**Character:** One familiar sans at every level, made expressive only by weight and tracking: heavy, tight headings over calm 16px reading text. Mono is reserved for things that are data.

### Hierarchy
- **Display** (800, clamp 38 to 52px, 1.05, -0.035em): the home H1 only. The Playground hub uses a smaller clamp (34 to 44px).
- **Headline** (800, clamp 30 to 40px, 1.12, -0.03em): card titles and lab titles; 28px on phones.
- **Title** (700, 26px, 1.2, -0.025em): home section headings. Base h1 to h3 are 700 with -0.02em tracking and balanced wrapping.
- **Item Title** (600, 17px, -0.01em): contents rows; lab tile names run at 19px.
- **Lede** (400, 18px, 1.6, Ink 2, max 66ch): the takeaway under a page title. 20px under the home H1; falls to 16px on phones.
- **Body** (400, 16px, 1.6): reading text; Body S (15px) for lists, options, callouts and captions.
- **Label** (600, 14px): buttons, tabs, segmented options, sidebar rows, panel section titles (700).
- **Small / Micro** (13px / 12px): meta, hints, counts, sidebar part names. Micro labels are sentence case, never uppercase-tracked.
- **Data** (mono 600, 13px): diagram cells, log lines, table cells, slider values, packet and badge text. Counts in UI type use tabular numerals.
- **Diagram Label** (600, 15px; 19px on phones): node labels inside the SVG, with 12px subs.

### Named Rules
**The Weight Not Face Rule.** Hierarchy comes from weight (800/700/600) and negative tracking on one system face. No second display face.

**The Mono Means Data Rule.** Mono appears only on values, keys, cells and logs the model produces, never on UI labels or headings.

## Layout

A docs shell: sticky 56px translucent top bar (88% page colour with backdrop blur, hairline below), a 272px sticky sidebar with its own scroll, and a main column padded 40px by 48px that centres a 900px page. Labs widen to 1180px with a two-column grid (model, then a 380px panel; 340px below 1180px) and a 28px gap; below 1040px the panel dissolves into the flow so Predict comes first, then the model, then the other sections.

Spacing runs on a 4px base with 8, 12, 16, 20, 24 and 28px steps inside components and 48 to 64px between major blocks (pager, home sections, footer). Reading measure is capped at 54 to 76ch.

Breakpoints: 1180px (tighter lab panel and gutters), 1040px (single-column lab), 900px (sidebar becomes a 320px drawer over a scrim, top links hide), 640px (16px gutters; search collapses to an icon that opens a full-width bar; the sandbox and quiz run edge to edge; the pager becomes a sticky bottom bar). Coarse pointers raise the tap size from 36px to 44px.

**The One Column Rule.** A card is one idea in one column: title, lede, chips, sandbox, footer, pager. No right rail.

## Elevation & Depth

Flat by default, with tonal planes (page, wash, fill) and hairlines doing the separation. Shadows are soft, low-contrast and cool-tinted, and are reserved for the object the page is about (the sandbox frame) and for things that float (search popover, phone drawer and search bar). Hover on pager boxes and lab tiles adds a small lift together with a blue edge. At night shadows switch to deeper black values so they still read.

### Shadow Vocabulary
- **Hairline lift** (`0 1px 2px rgba(16, 24, 40, .06)`): pager box hover.
- **Frame** (`0 1px 2px rgba(16, 24, 40, .05), 0 10px 28px -12px rgba(16, 24, 40, .16)`): the sandbox frame at rest; lab tile hover.
- **Pop** (`0 2px 6px rgba(16, 24, 40, .06), 0 18px 40px -12px rgba(16, 24, 40, .24)`): search popover, phone drawer, phone search bar.

**The Only The Example Floats Rule.** At rest, the sandbox is the only elevated object on a page. Panels, callouts and cards sit flat on hairlines.

## Shapes

Three shape families. Controls are full pills (999px): buttons, diagram buttons, segmented tracks and options, chips, tabs, verdicts, the search field, frame buttons, phone pager. Frames are 16px boxes: sandbox, pager boxes, callouts, quiz panel, lab panel, lab tiles, lab goal. Inner pieces step down: 12px for quiz options, diagram panels, captions and stat tiles; 10px for the contents number badge and the base radius; 8px for sidebar rows, diagram cells and search badges; 6px for card rows, kbd and bar tracks. Status dots are 7 to 8px circles. Borders are 1px hairlines everywhere except diagram cells and chips-in-diagram, which take a 1.5px kind stroke; ghost and "down" states are dashed.

**The No Side Stripe Rule.** Callouts and notes are fully tinted rounded boxes with an icon. No coloured left border.

## Components

### Buttons
Quiet pills; one filled blue per view.
- **Shape:** full pill (999px), 40px tall, 18px sides; 44px and 22px sides in the home hero.
- **Primary:** Link Blue fill and edge, On Blue text; hover to Link Blue Hover. Used for Start/Continue reading, Next question, the lab's Run, and Test my design.
- **Secondary:** page-colour fill, Strong Hairline edge, Ink text; hover to Fill 2. Press scales to 0.98. Disabled at 45% opacity.
- **Diagram buttons:** the same pill at tap height (36px, 44px on touch) with 14px sides and 15px drawn icons; variants primary (blue), good and bad (kind fill with a half-strength kind edge) and ghost (no edge, Ink 2). On phones, icon-sized ones drop their labels.
- **Text buttons:** blue 13px semibold with underline on hover, for "Change" beside held setup values and similar inline actions.
- **Icon buttons:** borderless circles at tap size, Ink 2, Fill 2 on hover.

### Segmented Control
A Fill 2 pill track with 3px padding; the chosen option becomes a page-colour pill with a hairline ring, a faint shadow and blue text. Options can carry a 7px kind dot so a choice like "fail" or "fix" is marked by both dot and word. Long ladders (isolation levels) stack vertically as a list with 11px-rounded rows.

### Chips
- **Problem / Fix:** pill chips with the bad or good fill, ink text and a 22%-strength kind edge, a bold lead word and a 14px icon. They sit under the lede on every card.
- **Tag chips:** hairline pills in search suggestions; blue edge and text on hover.

### Sandbox (signature)
The live diagram's frame: 1px hairline, 16px corners, page-colour body, Frame shadow. A 44px Wash toolbar holds a Live dot (green 7px dot plus the word; grey when idle), then Restart and Expand as small borderless pill buttons. Expand takes the frame full screen with a sticky toolbar and safe-area padding, and on a portrait phone asks to turn sideways. In labs, the run controls (Run, Next run, Skip to end, Reset) sit in a Wash bar along the frame's bottom edge, and a 1x/3x speed control sits in the toolbar. On phones the frame runs edge to edge without corners or shadow.

### Callouts
Rounded 16px tinted boxes with a 20px icon and no stripe. Neutral callouts use Wash with an Ink 3 icon; notes use Blue Wash with a blue icon.

### Navigation
- **Top bar:** brand mark and name (700, 17px), a 380px search pill, pill top links (Ink 2; current in Blue Wash with blue text), overall progress count, theme switch.
- **Sidebar tree:** a progress line (4px bar, blue fill), part names in Micro Ink 3, chapter rows (36px, 8px corners, Ink 2; hover Fill 2; current Blue Wash with blue semibold text), and a nested card list on a hairline indent with seen marks. Completed chapters get a green check.
- **Search:** Fill 2 pill at rest, page colour with a blue edge and 3px Blue Wash ring on focus; results in a 14px-rounded popover with Pop shadow, the selected row in Blue Wash, matches highlighted.
- **Pager:** two 16px boxes (72px tall) with a small Ink 3 direction line and the blue target title; hover gives a blue edge and Hairline lift. On phones it becomes a sticky pill bar pinned to the bottom with Back, a count and a truncated Next.
- **Contents rows:** a 36px number badge (green fill when done), name, tagline and meta, separated by hairlines; hover fills Wash and turns the name blue.

### Lab Panel (signature)
A sticky 16px-framed panel of sections separated by hairlines, each with a 14px bold title and a small Ink 3 note. Predict offers pill options that turn blue on hover and resolve into a good or bad reveal box. Setup shows at most a few knobs as segmented controls or pill slots with kind dots, and lists held values below a dashed hairline, each with a "Change" text button. Result opens with a verdict pill (kind fill, a 7px currentColor dot and a word) over label/value stat rows with tabular numbers. Test your design lists criteria with round check or cross marks plus a sentence of why. All runs is a 20-column grid of small squares (10 on phones) with a legend of counts, bad and warn at full strength, good faded.

### Lab Tabs
Rows of 34px pills with hairline edges and Ink 2 text, labelled by a small row name. The current tab sits on the Blue Wash in Link Blue, like every other "you are here" marker, so Run stays the only filled blue on the page; completed ones carry a green check or a small grey dot. On phones each row scrolls sideways.

### Quiz Panel
A Wash, 16px-framed panel: a row of 26 by 4px progress bars (blue current, green right, red wrong), a 20px semibold question, full-width 12px-rounded options with a letter badge. Answers resolve to good or bad fills with a filled letter badge and a tinted explanation. The score is an 800-weight 34px total coloured by outcome.

### Cheat Sheet
A two-column definition grid (single column on phones): each term is a 16px semibold line over a 15px Ink 2 definition, separated by top hairlines, with a small blue link to the card.

### Diagram Kit
Nodes, links, packets, boxes, cells, tapes, logs, bars, tables, stats and steppers, all coloured by kind. Strokes are 1.75px on nodes and links, dashed for ghost and down states. Link labels get a page-colour halo. The kit's icon set is one drawn family on a 24px grid with a 2px round stroke, and demo glyphs resolve to these drawings.

## Do's and Don'ts

### Do:
- **Do** give each view exactly one filled Link Blue action; everything else is a hairline pill, a ghost button or a text link.
- **Do** show state with a mark and a word together: a dot plus "Live", a check plus "Passed", a verdict pill with a dot and a label, a kind dot beside an option's name.
- **Do** mark "you are here" in navigation with Blue Wash and blue text (sidebar rows, top links, search selection).
- **Do** draw every diagram through the shared kit and its eight kinds, so both themes and all chapters stay consistent.
- **Do** put a model's run controls on the model's own frame, in the toolbar or the bar along its bottom edge.
- **Do** use the drawn icon set (24px grid, 2px round stroke) for every control icon.
- **Do** keep touch targets at 44px on coarse pointers and keep the 2px blue focus ring visible.

### Don't:
- **Don't** use Link Blue as decoration, a section colour or a highlight for non-interactive text.
- **Don't** add metaphor chrome to the shell: no drawn map, no numbered chapter pips, no tile-grid navigation. Progress ticks and run grids that report the model's own data are fine.
- **Don't** put coloured side stripes on callouts, cards or list rows.
- **Don't** add a second typeface, a webfont, or uppercase tracked labels above headings.
- **Don't** use the diagram kinds to colour shell chrome (top bar, sidebar, headings, cards).
- **Don't** elevate panels, callouts or cards at rest; the sandbox frame is the only resting shadow.
