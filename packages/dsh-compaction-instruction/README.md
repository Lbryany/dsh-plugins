# dsh-compaction-instruction
[中文](README.zh.md) | English

A drop-in replacement for `@deepseek-ai/dsh-compaction-basic` that lets a profile change the summarization directive. `dsh-compaction-basic` hard-codes that directive (the constant `COMPACTION_INSTRUCTION`, sent as the final user message of its `purpose: 'compaction'` model call), and dsh offers no config or hook to change it. This plugin mounts the real `dsh-compaction-basic` and rewrites only that one message. You can append your own instruction after the directive, or replace the directive.

Since 0.2 it is also an extension point: at compaction time it hands the span being compacted to other plugins, and appends the text sections they return after the model's summary, inside the checkpoint. The plugin only provides the mechanism. What a section says (for example text copied by code from the session log) is decided by the plugin that listens (see [Sections](#sections)).

The plugin is generic: it knows nothing about any product, preset or project, and it depends only on dsh's own packages. It applies only where you mount it. Put it in place of `dsh-compaction-basic` in one preset's compaction group, and only agents of that preset get the changed directive. Every other preset keeps the original.

Requires **dsh 0.2.2-rc.1 or newer, below 0.3** (`engines.dsh`: `>=0.2.2-rc.1 <0.3.0-0`). Tested against 0.2.2-rc.1 and 0.2.2-rc.5.

## Configuration

| Key | Default | Meaning |
|---|---|---|
| `instruction` | (none) | Text to add to or replace the directive. Empty, whitespace-only, `null` (a blank `instruction:` in YAML) or omitted: the plugin behaves exactly like `dsh-compaction-basic`, with no rewrite. |
| `mode` | `append` | `append`: the final message becomes `<original directive>\n\n<instruction>`. `replace`: the final message is `<instruction>` alone. |
| `sectionTimeoutMs` | `5000` | Wall-clock budget per [section](#sections) listener in one compaction, across all of its calls. A listener that runs over it loses its section for that checkpoint. |
| any other key | | Passed unchanged to `dsh-compaction-basic` (`thresholdRatio`, `retainTokens`, `summarizationModel`, `auto`, …). `instruction`, `mode` and `sectionTimeoutMs` are removed first, because basic rejects unknown keys; any other unknown key fails the mount with basic's own error, which names the key. |

`append` keeps basic's output structure (its Markdown sections and rules) and adds your rule on top, so it is usually what you want. With `replace` you own the whole directive, including the output format and the "only output the checkpoint" rule. Basic still wraps the result in its checkpoint framing, and still applies its size check and retries.

## Install

1. Install it into the profile like any other plugin: add `@lbryany/dsh-compaction-instruction` to `dependencies` and to `dsh.profile.bundles`, then run the install (see the repository [README](../../README.md) for the git-subdirectory spec; installing from the plugin market does both). Its bundle patch [`cordis.patch.yml`](cordis.patch.yml) inserts **nothing**, so installing alone changes nothing. Mounting this plugin at the root would add a second compaction engine for every agent, so you mount it by hand inside a preset, as below.
2. In the profile's `cordis.patch.yml`, put it in place of `dsh-compaction-basic` inside one preset's compaction group.
3. Restart the profile.

### Mounting it in a preset

A preset's plugins live in the `config.plugins` list of an `@deepseek-ai/dsh-agent-preset` entry, and the compaction group is a `cordis:group` with `isolate: { compaction: true, toolResultPruner: true }`. Swap the `name` of the `dsh-compaction-basic` row, and add `instruction` / `mode` to its `config`:

```yaml
# profile cordis.patch.yml: a preset whose compaction keeps an extra section
- insert:
    - id: preset-careful
      name: '@deepseek-ai/dsh-agent-preset'
      config:
        id: careful
        plugins:
          # ... the preset's other plugins ...
          - id: compaction
            name: cordis:group
            group: true
            isolate:
              compaction: true
              toolResultPruner: true
            config:
              - id: compaction-basic
                name: '@lbryany/dsh-compaction-instruction'   # was '@deepseek-ai/dsh-compaction-basic'
                config:
                  mode: append
                  instruction: |-
                    Also add a final section "## Open Questions" that lists every unresolved question verbatim, so the next model does not silently drop them.
                  # dsh-compaction-basic keys still work here, e.g. retainTokens: 20000
              - id: command-compact
                name: '@deepseek-ai/dsh-command-compact'
              - id: tool-result-pruner
                name: '@deepseek-ai/dsh-compaction-tool-result-pruner'
```

To change a preset the profile already ships, override that preset entry by its id with a complete `config`: copy every field of the original (`id`, `name`, `description`, `order`, …) plus the full `plugins` list, with the swapped row. A loader patch replaces `config` as a whole, so any field you leave out is lost (for example `preset-standard`'s `order: 1`). It cannot rename the nested row: in a patch, `name` is only a guard that must match the target, and id patches do not reach into `config.plugins`. In particular, a patch `- id: compaction-basic` with a `config` lands on the root compaction row (disabled in the `web` profile), not on any preset's row, and gives no warning.

Only the `web` profile disables the root `compaction-basic`. In profiles that keep an enabled root engine (acp, headless, sdk), that root engine runs first on `agent/pre-step` and compacts before any preset engine, so a preset-level engine — wrapped or plain — never summarizes there.

`/compact` (`dsh-command-compact`) and automatic compaction both go through the same engine, so both use the changed directive.

## Sections

Model-written summaries paraphrase. They can drop a detail or attribute words to the wrong speaker. A plugin that needs some text to survive compaction exactly as it is can append it to the checkpoint itself, after the model's summary. This plugin does not choose that text. It offers the event below and keeps the checkpoint valid.

**The event.** During every compaction this plugin runs, after the model's summary came back, it calls each listener of `compaction-instruction/sections` (exported as `SECTIONS_EVENT`) in registration order:

```js
import { SECTIONS_EVENT } from '@lbryany/dsh-compaction-instruction'; // or the string itself

ctx.on('compaction-instruction/sections', async (payload) => {
  if (!wanted(payload.agent)) return undefined;         // every listener sees every agent: gate here
  const section = { heading: '## My Section', body: '...', markers: ['[#'] };
  return payload.space.fits(section) ? section : undefined;
});
```

The event is dispatched with no receiver. So a listener mounted anywhere receives it: at the root, in another group, in another preset's scope, inside or outside the `llm` isolate this plugin creates. It also means a listener receives the compactions of every agent whose preset mounts this plugin, and must check `payload.agent` itself.

**Payload** (frozen):

| Field | Meaning |
|---|---|
| `agent`, `session` | The compacting agent and its session. Use `agent` to decide whether to answer. |
| `trigger` | `manual` (`/compact`), `pressure` (between steps) or `model-switch`. |
| `span` | `{ seqs, start, end }`: the surface nodes this checkpoint replaces, in surface order. |
| `retainedSeqs` | Surface nodes outside the span; they stay live after the checkpoint. |
| `shadowed` | The session events at `span.seqs`. The whole log is still readable through `session.eventAt(seq)`. |
| `summary` | The model's summary blocks, as basic returned them. |
| `space` | `{ tokens, scale, fits(sections), estimate(text) }`: the room left for sections (tokens), the scale it was offered at, an exact check against every guard below, and the token meter's estimate for a text. |
| `signal` | Aborted when the compaction is cancelled or the listener's time is up. The plugin stops waiting at that moment, whether or not the listener honours it. |

**Return value.** `undefined`, `null`, `[]`, one section or an array of sections (or a promise of one). A section is `{ heading, body, markers? }`. `heading` is one Markdown heading line (`## Title`). `body` is non-empty text. `markers` are line prefixes the section reserves for its own entries. Each section becomes one more text block, `\n\n<heading>\n\n<body>\n`, after the model's summary, in listener order.

**Neutralization.** In the model's summary, every line that reads as an appended section's heading (at any heading level) or starts with one of its markers gets a leading `\`. In each body, lines that read as another section's heading or markers, or as its own heading, are escaped the same way. A section's own markers stay as they are in its own body. So only the listener writes its heading and its entries. Escaping text the listener copies from elsewhere (a logged line that starts with a marker) is the listener's job.

**Size guards.** A section must never make a compaction fail that would have succeeded without it:

- Basic rejects a checkpoint whose estimated size is not smaller than the span it replaces. Sections are priced with the same token meter on the same framing, together with the neutralized model summary. They must leave 16 tokens below that line, and they may take at most half of the span.
- In automatic and model-switch compaction, basic compacts again (or fails) while the context is still at or above its threshold. If the model's checkpoint alone would land below the threshold, the sections must land below it too. If it would not, no listener is called for that attempt; basic compacts again anyway, and the next attempt offers the space again.
- Context-overflow recovery retries the request that just overflowed, so no listener is called. The next compaction offers the span again.

Sections that do not fit are not cut, because the plugin cannot know what a section may lose. The listener is asked again with the offered space halved, down to an eighth (`space.scale`). If its answer never fits, its section is left out. A listener that throws, rejects, returns an invalid shape or runs past `sectionTimeoutMs` loses its section for that checkpoint and is not asked again in that compaction. The others still get theirs. Each kind of problem is logged once per mount, later ones at debug level.

**What stays the model's.** The request is basic's own, with the same prefix, so the prompt cache is unaffected. The `rawOutput` and `usage` recorded in `compaction/summary` are the model's. Only `summary` (and so the checkpoint) carries the extra blocks. If the model call errors, is aborted or hits the token cap, basic fails as before and no listener is called. With no listener, or when every listener returns nothing, the checkpoint is byte-identical to plain `dsh-compaction-basic`.

A model reading an earlier checkpoint may imitate a section in its own summary. Such an imitation is neutralized as above, but it still costs tokens. If you use `instruction`, tell the model that the harness appends the section and that it must not write one.

## How it works

The engine mounted is a subclass of `dsh-compaction-basic`. It overrides `summarize()`, which basic documents as its one customization hook. The override calls basic's own `summarize()`. When some listener is registered, it asks the listeners for sections and adds the accepted ones to the returned `summary`. Basic then frames that summary, applies its size check and commits it. `compactPressure()` and `compactIfNeeded()` are overridden only to record which trigger is running, for the guards above.

Basic does not pass the compacted range to `summarize()`. It builds the input as `[system head message, ...messages of the shadowed surface nodes]` (`buildSummarizationInput`). The surface cannot change while the compaction lock (`compaction/start`) is held. So the plugin recovers the span by matching the input messages against the live surface, after the system head. If they do not match (a caller passing its own input), no listener is called and one warning is logged.

The instruction rewrite works like this. The plugin injects `llm`. It isolates `llm` for a child context, provides a small proxy there, and mounts the real `dsh-compaction-basic` in that child. All of basic's model calls go through the proxy:

- A `purpose: 'compaction'` call whose final message is a single-text user message starting with `You are now acting as a compaction engine` is rewritten into a new options object. Everything else in that call is left untouched: the earlier messages, tools, tool history, provider, model, `maxTokens`, session id and signal. That keeps the replayed prefix byte-identical, so the provider's prompt cache is still reused.
- Every other call passes through as the identical options object. Other `llm` members, such as `resolveModelInfo`, are forwarded to the real service at call time.
- The proxy is a plain object that exposes no symbol keys. Cordis therefore hands it to basic as-is, and the real `llm` is always resolved through this plugin's own context. Outer non-global `llm/stream` listeners (for example `dsh-session-checkpoint-policy`, which flushes the session before the compaction call) still see the call, with the rewritten message. If the proxy were rebound by cordis, those listeners would be skipped silently; global listeners would not be affected.

If a `purpose: 'compaction'` call does not end with the expected directive (for example, a dsh upgrade reworded it), the call is forwarded unchanged, and the plugin logs one warning per mount. The test suite includes a tripwire that runs the **installed** `dsh-compaction-basic` and checks that its directive still starts with that text.

## Development

The tests run offline against the dsh installed on this machine: real cordis, real `dsh-llm`, the installed `dsh-compaction-basic`, and a fake model adapter. They make no network or model calls.

```sh
npm test        # links the installed dsh packages, then node --test test/*.test.mjs
```

The section tests also use real `dsh-session` Sessions and `dsh-token-meter`'s estimator. `test/sections.test.mjs` starts with the routing test: listeners at the root, in a sibling group and in another preset scope must all receive the event, with and without the `llm` isolate.

`scripts/link-dsh.mjs` symlinks `cordis`, `dsh-agent`, `dsh-compaction-basic`, `dsh-llm`, `dsh-scope`, `dsh-session` and `dsh-token-meter` one by one into `node_modules/@deepseek-ai/`. It finds dsh through `DSH_INSTALL_DIR` (the `@deepseek-ai/dsh` package directory), then `DSH_BIN` (its `lib/bin.js`), then `npm root -g`. It links single package directories, never the whole `node_modules`, so a stray `npm install` cannot write into the global dsh. The package has no build step.

## License

[MIT](./LICENSE)
