# Task patterns

Choose the information structure before colors. Read ONE matching example,
then replace its content, facts, controls and IDs for the task. Examples are
working structures, not facts about the user. Their data is explicitly sample
data. Keep the current style's tokens; do not copy a sample's topic or add UI
just because the example has it. All six run without external libraries.

| Reader's task | Surface | Example | Structure |
| --- | --- | --- | --- |
| Change an assumption and see its consequence | inline | `../examples/parameter-simulator.html` | Controls, graphic, result, model assumption |
| Compare alternatives on the same basis | inline/wide | `../examples/option-comparison.html` | Shared input, aligned alternatives, conditional finding |
| Understand a mechanism one step at a time | inline | `../examples/step-explainer.html` | State, next/back, explanation tied to current state |
| Read a period's performance and its detail | page | `../examples/analysis-dashboard.html` | Finding, main chart, context, source rows |
| Filter a dataset and inspect matching records | page | `../examples/exploration-tool.html` | Filters, result count, linked distribution and table |
| Understand an argument and test its premise | page | `../examples/explanation-page.html` | Thesis, evidence, adjustable example, limits |

## Composition

For cards, keep one focal answer and a small control group. Page mode has its
own title and figure scale: use `.viz-page`, `.viz-layout` for a 2:1 main/aside
layout, `.viz-grid` for peer panels and `.viz-lead` for the introduction.
Reading pages use `.viz-page-narrow`. Do not put every paragraph into a card.
Choose hierarchy to match the task; a KPI row is optional, never a required
opening. Keep data charts accurate; larger typography is for headlines, not
for every axis tick. Use normal body text for explanations of changing values.

## Interaction

If the task asks the model to continue after a choice, use `dshViz.interaction`:
the comparison, cooling simulator, analysis and exploration examples declare
fields and a static action. The host owns confirmation and submission. For a
purely local explanation, omit that declaration and bind local rendering only;
the step explainer and explanation page demonstrate this. Never add a submission
action when the user explicitly asks to stay local. Page submission works when
expanded inside the conversation; detached windows are read-only.

The initial state should already explain something. A control updates all the
outputs it governs, including the finding and the accessible text/table. Empty
filters have an honest empty state. Keep series identity stable on filtering.
Use native controls, associated labels and visible focus; announce short
results with `aria-live="polite"`. Large tables need a bounded scroll region.
For long labels, reflow or wrap; do not shrink to make them fit.

For a standard chart use the Chart.js setup in `charts.md`; the no-dependency
bars in these examples are for simple magnitude comparisons only. Do not turn
a complex time series into manually positioned HTML bars.
