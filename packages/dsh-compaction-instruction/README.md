# dsh-compaction-instruction
[中文](README.zh.md) | English

A drop-in replacement for `@deepseek-ai/dsh-compaction-basic` that lets a profile change the summarization directive. `dsh-compaction-basic` hard-codes that directive (the constant `COMPACTION_INSTRUCTION`, sent as the final user message of its `purpose: 'compaction'` model call), and dsh offers no config or hook to change it. This plugin mounts the real `dsh-compaction-basic` and rewrites only that one message. You can append your own instruction after the directive, or replace the directive.

The plugin is generic: it knows nothing about any product, preset or project, and it depends only on dsh's own packages. It applies only where you mount it. Put it in place of `dsh-compaction-basic` in one preset's compaction group, and only agents of that preset get the changed directive. Every other preset keeps the original.

Requires **dsh 0.2.2-rc.1 or newer, below 0.3** (`engines.dsh`: `>=0.2.2-rc.1 <0.3.0-0`). Tested against 0.2.2-rc.1.

## Configuration

| Key | Default | Meaning |
|---|---|---|
| `instruction` | (none) | Text to add to or replace the directive. Empty, whitespace-only, `null` (a blank `instruction:` in YAML) or omitted: the plugin behaves exactly like `dsh-compaction-basic`, with no rewrite. |
| `mode` | `append` | `append`: the final message becomes `<original directive>\n\n<instruction>`. `replace`: the final message is `<instruction>` alone. |
| any other key | | Passed unchanged to `dsh-compaction-basic` (`thresholdRatio`, `retainTokens`, `summarizationModel`, `auto`, …). `instruction` and `mode` are removed first, because basic rejects unknown keys. |

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

## How it works

The plugin injects `llm`. It isolates `llm` for a child context, provides a small proxy there, and mounts the real `dsh-compaction-basic` in that child. All of basic's model calls go through the proxy:

- A `purpose: 'compaction'` call whose final message is a single-text user message starting with `You are now acting as a compaction engine` is rewritten into a new options object. Everything else in that call is left untouched: the earlier messages, tools, tool history, provider, model, `maxTokens`, session id and signal. That keeps the replayed prefix byte-identical, so the provider's prompt cache is still reused.
- Every other call passes through as the identical options object. Other `llm` members, such as `resolveModelInfo`, are forwarded to the real service at call time.
- The proxy is a plain object that exposes no symbol keys. Cordis therefore hands it to basic as-is, and the real `llm` is always resolved through this plugin's own context. Outer non-global `llm/stream` listeners (for example `dsh-session-checkpoint-policy`, which flushes the session before the compaction call) still see the call, with the rewritten message. If the proxy were rebound by cordis, those listeners would be skipped silently; global listeners would not be affected.

If a `purpose: 'compaction'` call does not end with the expected directive (for example, a dsh upgrade reworded it), the call is forwarded unchanged, and the plugin logs one warning per mount. The test suite includes a tripwire that runs the **installed** `dsh-compaction-basic` and checks that its directive still starts with that text.

## Development

The tests run offline against the dsh installed on this machine: real cordis, real `dsh-llm`, the installed `dsh-compaction-basic`, and a fake model adapter. They make no network or model calls.

```sh
npm test        # links the installed dsh packages, then node --test test/*.test.mjs
```

`scripts/link-dsh.mjs` symlinks `cordis`, `dsh-agent`, `dsh-compaction-basic`, `dsh-llm` and `dsh-scope` one by one into `node_modules/@deepseek-ai/`. It finds dsh through `DSH_INSTALL_DIR` (the `@deepseek-ai/dsh` package directory), then `DSH_BIN` (its `lib/bin.js`), then `npm root -g`. It links single package directories, never the whole `node_modules`, so a stray `npm install` cannot write into the global dsh. The package has no build step.

## License

[MIT](./LICENSE)
