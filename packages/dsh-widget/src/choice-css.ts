/** Shared native-control design system for generated selection cards and host confirmation. */
export const CHOICE_CSS = `
.viz-choice { --viz-choice-surface: var(--dsh-viz-page, var(--dsw-alias-bg-base, light-dark(#fff, #202329))); container-type: inline-size; color: var(--foreground); font: 400 14px/1.55 var(--font-sans, system-ui, sans-serif); }
.viz-choice *, .viz-choice *::before, .viz-choice *::after { box-sizing: border-box; }
.viz-choice h2 { margin: 0 0 6px; font-size: 22px; line-height: 1.3; font-weight: 600; letter-spacing: -.025em; }
.viz-choice p { margin: 0; }
.viz-choice .viz-description { color: color-mix(in srgb, var(--foreground) 72%, var(--viz-choice-surface)); font-size: 13px; }
.viz-choice .viz-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin: 24px 0 16px; }
.viz-choice .viz-field { display: grid; gap: 8px; min-width: 0; font-size: 13px; font-weight: 500; }
.viz-choice .viz-field--full { grid-column: 1 / -1; }
.viz-choice :is(input:not([type=radio]):not([type=checkbox]):not([type=range]), select, textarea) {
  width: 100%; min-width: 0; min-height: 44px; padding: 10px 12px; border: 1px solid var(--border);
  border-radius: 10px; background: var(--viz-choice-surface); color: var(--foreground); font: inherit; font-weight: 400;
}
.viz-choice fieldset { border: 0; padding: 0; margin: 0; min-width: 0; }
.viz-choice legend { margin-bottom: 8px; font-size: 13px; font-weight: 500; }
.viz-choice .viz-options { display: flex; flex-wrap: wrap; gap: 8px; }
.viz-choice .viz-option { display: flex; align-items: center; gap: 8px; min-height: 44px; padding: 8px 12px; border: 1px solid var(--border); border-radius: 10px; cursor: pointer; font-size: 13px; }
.viz-choice .viz-option:has(input:checked) { border-color: var(--foreground); background: color-mix(in srgb, var(--foreground) 6%, transparent); }
.viz-choice :is(input[type=radio], input[type=checkbox]) { margin: 0; accent-color: var(--foreground); }
.viz-choice :is(button, input, select, textarea, summary):focus-visible { outline: 2px solid var(--foreground); outline-offset: 3px; }
.viz-choice .viz-button { appearance: none; display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; padding: 10px 16px; border: 1px solid var(--border); border-radius: 10px; background: transparent; color: var(--foreground); font: inherit; font-size: 13px; font-weight: 600; line-height: 1.5; cursor: pointer; white-space: normal; text-align: center; transition: background .15s ease; }
.viz-choice .viz-button:hover:not(:disabled) { background: color-mix(in srgb, var(--foreground) 8%, transparent); }
.viz-choice .viz-button--primary { background: var(--foreground); border-color: var(--foreground); color: var(--viz-choice-surface); }
.viz-choice .viz-button--primary:hover:not(:disabled) { background: color-mix(in srgb, var(--foreground) 85%, var(--viz-choice-surface)); }
.viz-choice .viz-button:disabled { opacity: .5; cursor: default; }
.viz-choice .viz-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.viz-choice .viz-summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 120px), 1fr)); gap: 16px; margin: 20px 0; padding: 16px; background: color-mix(in srgb, var(--foreground) 4%, var(--viz-choice-surface)); border: 1px solid var(--border); border-radius: 12px; }
.viz-choice .viz-summary > div { min-width: 0; }
.viz-choice .viz-summary dt { font-size: 12px; color: color-mix(in srgb, var(--foreground) 72%, var(--viz-choice-surface)); margin-bottom: 4px; }
.viz-choice .viz-summary dd { margin: 0; font-size: 16px; font-weight: 600; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
.viz-choice [data-dsh-interaction-status] { grid-column: 1 / -1; margin-top: 0; font-size: 12px; }
.viz-choice [data-dsh-interaction-status]:empty { display: none; }
@container (max-width: 320px) { .viz-choice .viz-fields { grid-template-columns: minmax(0, 1fr); } }
@media (prefers-reduced-motion: reduce) { .viz-choice .viz-button { transition: none; } }
`

export const INTERACTION_CSS = `
[data-dsh-interaction-bar] {
  --foreground: var(--dsw-alias-label-primary, #1a1c1f);
  --background: var(--dsw-alias-bg-base, #fff);
  --border: var(--dsw-alias-border-l2, #dce0e5);
  padding: 16px 12px; border-top: 1px solid var(--border);
}
[data-dsh-interaction-bar] .viz-confirm { padding: 4px 0; }
[data-dsh-interaction-bar] .viz-confirm h3 { margin: 0 0 4px; font: inherit; font-size: 16px; font-weight: 600; }
[data-dsh-interaction-bar] .viz-status:not(:empty) { display: block; font-size: 12px; margin: 10px 0 0; }
[data-dsh-interaction-bar] details { margin-top: 16px; font-size: 12px; }
[data-dsh-interaction-bar] summary { cursor: pointer; width: fit-content; padding: 6px 0; }
[data-dsh-interaction-bar] details p { margin-top: 12px; overflow-wrap: anywhere; }
[data-dsh-interaction-bar] pre { white-space: pre-wrap; overflow-wrap: anywhere; max-height: 240px; overflow: auto; }
`
