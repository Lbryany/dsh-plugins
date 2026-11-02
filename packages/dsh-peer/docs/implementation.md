# Peer A — loop protection and message cards

Frozen before implementation, 2026-11-01. User approved the compact single-card design and requested implementation. Baseline 0.1.0 copied to /private/tmp/dsh-peer-baseline-0.1.0-20261101; target 0.1.1. No publish, real-profile install, or commits.

Scope follows the coordinating dsh-projects note `2026-11-01-dsh-peer-loop-control.md`, G01–G12, S01–S06, UI01–UI05, REL01–REL03, E01–E06. B/C remain separate.

## Frozen decisions

60 s exact-content dedup; 6/60 s admission; 12/600 s then persistent directional pause. Monotonic clock; successful deliveries only; reserve/commit/rollback; 1024 pairs and 64 fingerprints per pair. User-only resume, no retry. Host configurable, never tool configurable.

UI: source-selected exclusive renderer; title `来自 @reviewer · first line`, expanded body starts with second line. Single neutral card, initially collapsed, no empty disclosure or persistent pause banner. Raw fallback/copy and sender snapshot preserved. Receive/send records, uncertain delivery, keyboard/narrow/dark coverage. Installed test runtime is DSH 0.2.1-rc.5; check minimum API before claiming rc.2 UI support.

Eval: deepseek-flash, baseline/changed × 5 runs/case; 12,000 total tokens/run, 24 sends, 180 s. Frozen prompts before first run. At initial freeze no credential was selected; the user later authorized an isolated profile copy (recorded below). No threshold changes after runs.

## Commands and evidence

`node --test test/*.test.mjs`; `node scripts/scenarios.mjs`; `node scripts/browser-check.mjs`; `npm pack --dry-run --json`. Evidence in test/evidence. Implementation complete at 0.1.1; validation is itemized below. E has completed below its pass line, so full A acceptance remains open.

First red run: 12/12 behavioral tests fail on baseline (test/evidence/red-loop.tap). Initial sandbox listen EPERM retained separately, not counted as red. First implementation run 11/12 passed. G04's rejection assertion was too narrow: after 12 accepted messages the frozen long-window rule takes precedence over short-window rejection. Corrected assertion to accept both rejection reasons; all admission count and window thresholds unchanged.


## Implemented result and validation

- 0.1.1 adds receiver-side protection, explicit recovery, structured outcomes and the source-based card. Minimum verified DSH is 0.2.1-rc.5; package/lockfile share the version and dependency range.
- Final complete suite: 42/42 (`test/evidence/final-unit.tap`). S01–S06: 6/6 (`test/evidence/scenarios.json`). No real model or user profile involved.
- A packed npm artifact runs in a temporary real Web Host with Chrome. `test/evidence/browser/` covers received cards, send rejection, unauthenticated denial, owner status query, recovery, Markdown/code/footnotes, 360px dark, keyboard and refresh. The fixture writes the same durable inbox insertion/claim and input event ordering as the Host, while replacing model execution with local delivery.
- `browser-baseline/` and `browser-no-client/` verify generic Host disclosure retains the full text. The old package's temporary unpacked registry has only its default names-file path redirected to the test directory; its admission and UI behavior are unchanged. Disabling the new client's manifest entry is likewise a test-only adapter.
- Independent read-only product review passed 40 tests and found no remaining product blocker; the expanded suite now passes 42 tests. The evaluator adapter received a separate read-only review. Review found missing Markdown labels and a chat-polluting command query, both fixed. Real Host then exposed a missing `remote.commands` injection; red log/test are retained and the declared service fixes it. Early fixture boot/navigation failures remain separately labeled evidence, not product behavior red tests.
- History pagination passed on a 250-turn fixture: loading older pages reveals the legacy sender snapshot and preserves full text without duplicating the six new cards (`browser-history/result.json`). A separate Desktop loading path and Windows remain untested; the package declares the Web client platform only.
- E01–E06 completed in `eval/results/batch-PfMF7u`: 60 runs, changed quiet cases 15/15, normal cases 9/15, five token-budget stops and one duplicate-content rejection. The frozen model pass line is not met; see that batch’s report.md. The first interrupted batch remains separate. The runner is a core-level FIFO simulation, not a full Host scheduler benchmark. It uses the same scenario system prompt for both versions and their actual tool description/envelope. It enforces per-call budgets, checks actual cooperation chains, saves unique batches and partial failures, and records code fingerprints. No convergence rate or token saving is claimed.

No release, installation in real profiles, commit or push was performed. B/C remain later steps; the frozen thresholds are unchanged.

Frozen baseline source is also retained in `test/evidence/baseline-0.1.0.tar.gz` for replay after temporary-directory cleanup. Extract to a new directory and set `PEER_BASELINE` to that directory.

## Profile reuse clarification before first E run

The user explicitly authorized copying the existing profile. A separate account or credential is not required: a read-only copy of projects-thread configuration and its DeepSeek credential is placed in a private temporary DSH home; unrelated credentials are removed from that copy. The original is never modified. `eval/from-profile.mjs <copy>` reads only that explicit isolated copy and passes the connection in process memory to the core simulation. The installed provider uses DeepSeek Messages; before any model run, the evaluator adapter was aligned to that wire format and covered by a tool-pairing/cache-usage test. Both arms use temperature 0 and thinking disabled; original cases, run counts, limits and pass lines remain unchanged.

The isolated profile and credential copy have been removed (`test/evidence/eval-cleanup.json`). A separate account is not required. E05 fails the fixed budget in both versions; E06’s failed changed run completed the user result but made an extra query and duplicate result, violating the frozen zero-rejection line. No threshold was relaxed.
