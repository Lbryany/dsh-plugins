# Peer reply visibility

Frozen before implementation, 2026-11-06. Source: the user reported that a peer-triggered model response is invisible in dsh and requested the fix and push. This package does not consume dsh-projects step numbers.

## Scope and contract

`peer_reply` ends successful handoffs without another model request. Its text lives in tool arguments; the current custom tool view only renders the transport receipt, and dsh folds the entire tool-bearing step. Repair the browser presentation without changing messages, tool execution, prompts, routing, acknowledgements or model calls.

- `PeerExchangeResult` shows the exact reply argument text, kind and request ID separately from the receipt. Missing or malformed arguments preserve the old receipt view.
- A nonexclusive conversation definition pairs durable `tool/call` and append `tool/result` records by turn, step and call ID. Only `peer_reply` creates a reply card. Unpaired, unrelated and replacement events must not create a success or a fabricated response.
- A settled reply becomes a visible `groupTree: turn` node outside the whole-turn process disclosure. The full reply body is visible by default; the receipt and identifiers may be disclosed. Success means the tool accepted the reply, never that the recipient read it. Failed/error/unknown or absent success metadata cannot be labelled accepted.
- Preserve native reasoning, tool records and ordinary assistant output. Refresh and history replay reconstruct one reply card per call; the client writes no session events. Existing histories use existing tool arguments, requiring no migration.
- P204 (reversible default, pending user confirmation): display all settled reply kinds, including question/answer/result/declined and unsuccessful attempts, with truthful status. Disable the new client projection to revert; stored messages remain intact.

## Frozen verification

| ID | Assertion and old-code red method |
|---|---|
| RV01 | Tool detail contains exact multiline Unicode reply, kind, request ID and separate receipt; old `PeerExchangeResult` omits it |
| RV02 | Nonexclusive reply projection remains outside process folding, pairs only the same turn/step/call, and never publishes before a result; old client lacks it |
| RV03 | All reply kinds, failed/error/unknown/missing metadata, malformed and unrelated records preserve truthful display and safe escaping |
| RV04 | Registration/disposal covers both receive and reply renderers; native tool/assistant events are not claimed exclusively; replay is stable |
| SRV01 | Packed plugin in an isolated real dsh Host with a scripted provider: incoming peer task triggers one model response containing reasoning and peer_reply, no tail call; completed chat shows the reply without expanding process, and the native process still reveals reasoning/tools |
| SRV02 | Same browser: reload has one card, tool details expose body, Markdown/code/Unicode and 360px dark layout remain usable, no console errors, ordinary assistant output remains visible |

First run new unit regressions and the packed browser scenario against unchanged product; retain behavioral failures separately from environmental/fixture failures. Then require all new checks and the complete package unit suite, existing deterministic scenarios, native handoff and packed browser history checks to pass. No model-quality evaluation: no model-facing change. Do not use Claude CLI, user profiles, port 3091 or real hosting during acceptance.

Record L-peer-026 (missing tool reply body) / L-peer-027 (whole-turn fold hides terminal replies), and F-peer-RV-01/02. Independent read-only acceptance verifies the projection's interaction with native folding before push. Version 0.4.1; commit only this repair and its evidence/docs to dsh-plugins main, then push origin main as requested. No npm publish or user Host restart.

## Implementation record

Implemented in the browser client and generated bundle. No Host/model-facing code changed.

- Initial regressions RV01–RV04: 4/4 fail on the old product (`test/evidence/reply-visibility/red-unit.tap`). The old packed plugin also fails SRV01 after the real Host recorded a successful peer_reply (`browser-red/`).
- The first browser fixture used `message.callId` instead of the Host's `message.toolCallId`; `browser-fixture-failure/` is fixture evidence, not a product red. The sandbox listen denial is likewise excluded from product evidence.
- The first repair exposed a separate native tool-detail shape mismatch: arguments are stored on `block.call.argsRaw`. RV05 was added and failed before that repair (`red-native-args.tap`, `browser-native-args-red/`). The unit tests also retain the older parsed-argument input. All five regressions now pass.
- Browser layout initially checked a 360px viewport before the Host's responsive layout settled (`browser-layout-first/`). The final check waits up to five seconds for the same zero-overflow condition; no product CSS or threshold was changed.
- Final complete unit suite: 95/95, no failure/skip (`full-unit.tap`). S01–S06 and SB01–SB03: 9/9 (`scenarios.json`, `request-scenarios.json`). Native handoff passed (`handoff-host.json`). Packed browser SRV01/SRV02 and existing 250-turn history checks passed (`browser/result.json`, `browser-history/result.json`). All paths above are within `test/evidence/reply-visibility/` unless stated otherwise.
- Real scripted Host evidence records two model requests total: one ordinary turn and one peer-triggered reply turn. The latter preserves reasoning and invokes peer_reply once, with no extra model tail. Screenshots cover the completed folded view, expanded native process and 360px dark view.
- Independent read-only acceptance passed: no blockers or outstanding nonblockers; exact old product fails all five regressions, final product plus existing UI tests passes 13/13, and an independent packed browser run passes SRV01/SRV02. Evidence: `independent/acceptance.txt` and its adjacent records. No user profile installation, Host restart, npm publication or real model/Claude run.
