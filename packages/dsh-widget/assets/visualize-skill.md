# Visualize

Build small interactive surfaces the user can explore right inside the chat:
parameter-driven simulations, algorithm walkthroughs, charts and plots,
side-by-side comparisons, and product-screen mockups. The `visualize` tool
renders your markup as a live sandboxed card in the conversation, or, for
something to work in rather than glance at, as a full page in its own tab.

- Reach for a card when seeing or manipulating something answers the question
  better than prose would. A request that merely mentions data or a web page
  does not by itself call for one.
- When the user asks for a real deliverable — a website, a page in their app,
  a component, a standalone file — build project files instead; that is not an
  in-conversation card.
- When a static labeled diagram of nodes and edges already tells the whole
  story, emit a fenced Mermaid block and skip the tool. The card earns its
  place through motion, interaction, or adjustable inputs.

## Let the user choose, then continue

When the user wants to try parameters, choose a plan, fill requirements or adjust
a mockup **before you continue**, proactively create a usable selection surface.
They do not need to name the visualize tool or ask explicitly for a chart.
Use `dshViz.interaction` below for the return-to-model workflow. A chart that only
redraws locally does not satisfy that request. Do not add submission to a simple
answer, or to an explicitly local-only demonstration.

The host provides the submit control, captures the current fields, previews the
exact selection for confirmation, and appends the intent and frozen public snapshot
as one new user message in this same conversation. Later edits do not alter
previous messages; system instructions remain fixed. Do not
write a competing submit button, manually concatenate selected values into an
instruction, call the legacy follow-up method, or silently swallow failures.

```html
<form id="choose" class="viz-choice">
 <div class="viz-fields">
  <label class="viz-field">用量（小时）<input name="hours" type="number" min="0" max="50" value="10"></label>
  <label class="viz-field">方案<select name="plan"><option value="A">A</option><option value="B">B</option></select></label>
 </div>
  <output id="cost"></output>
</form>
<script>
dshViz.interaction({
  form: document.getElementById('choose'),
  fields: {
    hours: { type: 'number', min: 0, max: 50, step: 1 },
    plan: { type: 'enum', values: ['A', 'B'] }
  },
  action: { label: '分析我的选择', intent: '根据本次hours和plan分析费用。A每小时12元；B固定100元加每小时5元。不推断质量。' },
  render: function(v) {
    document.getElementById('cost').textContent = (v.plan === 'A' ? v.hours*12 : 100+v.hours*5) + ' 元';
  }
});
</script>
```

Declare only fields needed by the model. Each field name matches a native form
control `name`. Supported types: `number` with min/max/step, `enum` with values,
`boolean` for checkbox, `text` with maxLength. Include units and the actual task
facts in the static intent; never copy example facts into another task.
`render` always receives an OBJECT containing every declared field, including
for a one-field form. For example: `render: function(values) {
renderRegion(values.region); }`. Never pass a function expecting a region string
as `render` itself. Check the default values through the first render before
calling the tool; a thrown exception prevents the interaction from initializing.

Keep the static intent faithful to the original request: include its facts and
units, the meaning of each field, and what to do after confirmation. Preserve
unknowns as unknowns (destination, party size, workshop topic, etc.). Do not add
new assumptions, invented prices or a larger deliverable. After confirmation,
answer the original analysis request directly from the captured fields. When
missing details permit a useful generic or conditional answer, provide that
answer and mention what remains unknown; do not block it with another form or
a question tool. Check arithmetic, units and requested totals before giving
the result; a title claiming a total does not make the itemized values add up.
When allocating a requested total (time, money or percentages), first create the
itemized values, then use one short local calculation tool call to sum those
EXACT values. Adjust them until the requested total or upper bound is met.
Write the final table from that same checked list, including consistent start
and end times for schedules. Do not merely say it was checked. This calculation
is task work; it does not require browsing plugin files or project setup. For
"continue improving this card", update this conversation's card or explain the
selected design; do not start a repository, React project, or toolchain search
unless the user actually requested project files.

One interaction per card. The helper restores valid saved values before render,
updates locally on input, and saves on change. Let the helper own those listeners
and restoration; do not add a second input/change or globals listener that
restores or saves controls. Render must only redraw the page;
never save, submit or fetch in render. Unlisted fields are not transmitted.

Prefer inline/wide for this workflow. For a large `page`, tell the user to expand
it **inside the conversation** to submit; a detached browser window is read-only
and will explicitly say submission is unavailable. Do not promise a disconnected
standalone HTML file can send to the model. Older hosts without the input-capture
extension also show unavailable, rather than silently sending a text fallback.

## Authoring resources

For a choice-and-continue task, both the interaction contract AND this visual
system are required. Choose the information structure before writing markup.
Use the provided components, not a new hand-styled form on every turn:

- Wrap the surface in `.viz-choice`, with one short `h2` and at most one
  `.viz-description` sentence. The host already supplies a card title; do not
  add badges, filenames, developer notes or repeated instructions.
- Group native labelled controls in `.viz-fields`; use `.viz-field` on each
  label, `.viz-field--full` for a long text field. The grid reflows by its
  actual container width. No fixed root width or font shrinking to fit.
- Use a number input for arbitrary quantities; for a small fixed set use
  a fieldset/legend and `.viz-options` containing `.viz-option` labels with
  native radios. Do not force free values into invented presets.
- The system supplies 44px controls, focus states, spacing and restrained
  surfaces. Reuse these rules; custom CSS is for the actual visualization,
  not overriding the shared buttons or rebuilding baseline form styles.
- Native labels (or a field's optional `label`) become the host's readable
  confirmation. Include units in labels. Display metadata never changes the
  transmitted values. Do not put machine instructions or JSON in the card.
- Show a calculated preview when it explains a consequence. Do not repeat
  the three input values inside another large bordered box just to fill space.
- Before delivery check initial/changed/empty states, narrow layout, labels,
  and the primary action. Render and inspect when the environment provides
  a preview; source-code validity alone does not prove visual quality.

`examples/choice-form.html` is a complete compact selection example. Keep the
active style tokens and the user's facts. A diagram, simulation or chart still
needs its own visual structure; this form pattern is not a universal layout.

Before the first visualization, read **at most ONE** matching resource if the
surface needs capabilities not covered here. Do not list directories, search
source code, or inspect the installed toolchain to author a card. The active
style is already included at the end; do not read its file again.

- `references/charts.md`: complete setup for a standard line/bar/area chart,
  including theme resolution and live data updates. Its example is sufficient;
  do not load a second large simulator template for the same chart.
- `references/design.md`: custom composition or unfamiliar utility classes.
- `examples/choice-form.html`: a compact selection card using the shared controls.
- `references/patterns.md`: multi-view pages or more elaborate task structures.
- `examples/interactive-simulator.html` or `examples/comparison-chart.html`:
  an alternative starting point when a full template is needed. Choose one
  instead of reading both references and templates. Sample facts must be
  replaced with the actual task's facts.

On the continuation turn, use the selected values and already loaded contract.
Do not rediscover these resources or scaffold project files. Keep enough room
in the conversation for the user's selection and the ensuing answer.

## Calling the tool

Pass the markup directly as the `fragment` argument, with an optional `title`
and optional `mode`. The card starts rendering while you are still generating,
and a copy of the finished fragment is saved outside the user's project, in
this conversation's own card store; the result names its `path`. Never write
the fragment into the workspace yourself.

## Choosing the surface

- `inline` (default): the card answers the question at hand, fits the chat
  column, and stays within about one and a half screens.
- `wide`: several compact panels must sit side by side to be compared. A
  single dense chart stays inline.
- `page`: the user will *use* the thing rather than glance at it in passing —
  a multi-view tool, a dashboard with filters, a full-screen simulation, map,
  3D scene or large graph, a long multi-step walkthrough, a full desktop
  mockup — or they ask for a separate page or full screen. The chat shows a
  launcher card with a live thumbnail; the user opens the page in its own tab.
  Pass a `summary`: one short line saying what the page lets them do.

A page is still a fragment under every rule below, not a project file. If
they want a page *in their app* or a file to keep, build project files.

## Page layout

Design a `page` for a desktop browser tab (1280px and wider, any height),
and reflow it at phone width (390px):

- Wrap it as `<header class="viz-page-header">` (title, then the controls in
  a `.viz-controls` group; it sticks to the top) followed by
  `<main class="viz-page">` (a centred container; add `viz-page-narrow` for
  reading-width content). Group content in `<section class="viz-section">`
  with its own heading.
- Several views go behind tabs: `.viz-tabs` holding `<button
  class="viz-tab" role="tab" aria-selected="true|false">`. Every filter
  visibly changes every view it governs.
- Choose the hierarchy from the task, using `references/patterns.md`.
  `.viz-layout` gives a primary visual and a narrower context panel;
  `.viz-grid` gives equal peer panels. Both reflow on small screens.
  A KPI row is optional. The page already supplies larger headings, figures
  and panel spacing; preserve that hierarchy instead of shrinking everything
  to chat-card dimensions. `.viz-lead` is for the short introduction.
- The document scrolls; `min-height: 100vh` is fine on a full-screen canvas
  or the outer shell, never a fixed `height: 100vh` on content that must
  scroll. A canvas sizes to its container, not to a fixed pixel width.
- Build the controls the task needs, not a generic admin template.

## Revising a card

Correcting a rendered card by re-sending its whole markup costs as much as
drawing it again and invites unrequested redesign, so patch it instead:
`action: "update"` with the card's `path`, its `title` restated (and, for a
page, its `summary`, or the launcher loses its caption), and one exact
`old_str` → `new_str` replacement.

- Patch when the correction touches fewer than 20 lines in fewer than 5
  places, and at most 4 times per reply. Re-create the card for anything
  structural or larger — a patch series is not a rewrite.
- `old_str` must match the current card byte for byte, whitespace included,
  and appear exactly once. Keep it as short as stays unique; an empty
  `new_str` deletes the matched region.
- A card keeps one `path` for its whole life; patches rewrite that file, so
  several patches in one reply each build on the one before. Pass the `path`
  exactly as the tool reported it — it may sit outside the workspace, so do
  not read or edit it with file tools.
- A refused patch tells you what the card actually contains at the site you
  aimed at. Correct `old_str` from that and retry in the same reply rather
  than re-rendering blind.
- The card reloads on every change, so anything the user typed, dragged, or
  scrolled inside it resets. Batch corrections instead of trickling them.
- A page tab the user already opened keeps its old version; after patching
  a page, tell them to open it again.

## Fragment rules

The card wraps your fragment in its own document, stylesheet, theme, and
Content-Security-Policy. The tool lints every fragment, patched cards
included, against these rules. Each finding carries a `VZ` code, a
line:column, and a fix. An error renders nothing: apply the fixes and call
again. Warnings arrive with the rendered card; patch them if they matter. If
the result says to stop, tell the user what is blocking the card instead of
retrying.

- Fragment only — never emit `<!doctype>`, `<html>`, `<head>`, or `<body>`.
- Emit real markup with actual newlines, not a string-escaped rendition
  (`\"`, `\n`) of it.
- Write every user-visible label, caption, control, tooltip, and annotation in
  the language the user primarily uses in the current conversation, unless
  they request another language. Keep established product names and technical
  terms unchanged when translating them would make the visualization less
  precise.
- Give your root element a unique ID and locate it with
  `document.getElementById(...)`. Scripts must not rely on
  `document.currentScript` to find their root.
- Stay under the deployment's fragment size limit (1 MB unless configured
  otherwise). Large inline datasets should be reduced first: fewer rows,
  coarser bins, fewer decimal places, no unused fields.
- Inline `<script>` and `<style>` work. Network APIs do not — `fetch`, XHR,
  WebSocket, and form submission are blocked by policy and fail without an
  error message.
- External static assets may come only from these hosts:
  `cdnjs.cloudflare.com`, `esm.sh`, `cdn.jsdelivr.net`, `unpkg.com`,
  `fonts.googleapis.com`, `fonts.gstatic.com`, `fonts.bunny.net` — always
  with a pinned version.
- Every color comes from a theme variable or a `light-dark()` pair — the
  token list and utility classes are in `references/design.md`.
- Never declare `color-scheme` yourself. The document already carries the
  host's scheme; redeclaring it on your root flips every `light-dark()` in
  your subtree to the viewer's OS preference, which can invert your text
  against the host-matched background.
- A chart's first draw animates in, once; `references/charts.md` has the
  recipes (Chart.js gives this by default).
- Before finishing, confirm every element your script queries exists, every
  identifier is defined, and the main interaction visibly changes the output.

## Card style

The user picks a card style in the plugin settings. The active one is
appended at the end of this skill under "Active card style", together with
any style files the user wrote. A card's look has two layers:

- The frame applies the style's hard parts on its own: colour tokens, fonts,
  radius, text sizes, and the chart defaults `dshViz.chartDefaults` sets (see
  `references/charts.md`). Keep using the theme variables and base classes;
  do not restate a style's colour values or load its fonts yourself.
- The style guide and the user's style files replace only the Taste section
  of `references/design.md`. Everything else in this skill still applies:
  the fragment rules, theme variables and `light-dark()`, the 11px floor, the
  size limit, the CDN allowlist, the chart setup, and every lint finding. A
  style that says "no gradient fills" overrides the default gradient; no
  style lets a card fetch, skip the theme variables, or set `color-scheme`.
- When they disagree, the order is: what the user asks for in this
  conversation, then the workspace style file, then the global style file,
  then the built-in style.
- Product-screen mockups ignore the card style. Draw them in the product's
  own colours, type and radius, still as `light-dark()` pairs.
- When a user style asks for specific colours, set them as custom properties
  on your root element (`#my-viz { --viz-series-1: light-dark(#…, #…); }`);
  your CSS and `dshViz.chartDefaults(Chart, root)` both read them there.

## In the reply

Around the card, write only what helps the user read or act on it — one or
two sentences at most. Do not mention the tool, the fragment, files, or any
of this machinery, and never paste the markup into the reply.

## Legacy custom interactions

Only when maintaining an existing hand-written bridge, read
`references/legacy-bridge.md`. For a new native form, use the declaration above;
do not load the legacy API or implement its save-and-follow-up sequence.
