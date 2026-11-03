# Peer acceptance ledger

Scope: dsh-peer only. This package does not consume dsh-projects product step numbers. Frozen defaults and acceptance IDs are in implementation.md; thresholds are unchanged.

## Failure ledger

| ID | Trigger and mechanism | Forced regression |
|---|---|---|
| L-peer-001 | Two agents repeatedly acknowledge; new random IDs bypassed ID-only dedup and no directional admission limits existed | Red: baseline core.deliver, test/loop-control.test.mjs G01/G03/G05/G06/G07; 12/12 old behavior failures in test/evidence/red-loop.tap |
| L-peer-002 | Receive and send records lacked source-scoped display contract and ambiguous delivery handling | Red: baseline core.deliver/send, test/render-contract.test.mjs UI01/UI02; test/evidence/red-render-contract.tap |
| L-peer-003 | Independent review found missing mandatory Markdown labels and command-based read queries polluting chat | Red: test/client.test.mjs UI05, test/evidence/red-markdown-labels.tap. Read query moved to owner-only Fetch; no peer-status command remains |
| L-peer-004 | Real Host rejects remote.commands access without declaring injection, hiding receive cards | Red: test/evidence/red-host-inject.json and red-host-inject.tap; UI03 now declares the service, packed browser cards visible |
| L-peer-005 | Initial eval runner could exceed send budget in one response, pass keyword-only reports and overwrite evidence | test/eval-contract.test.mjs checks per-call budget and missing collaboration; unique batch files and partial-error records; no model runs were made with that initial runner |
| L-peer-006 | First provider adapter omitted stop_reason; duplicate representations inflated the request budget estimate | Red: test/evidence/red-eval-stop-reason.tap. First batch preserved as interrupted, stop reasons and provider input counter added; follow-up batch is independent |
| L-peer-007 | E05 exceeds remaining fixed budget in both versions; E06 changed run 0 completes results but extra query triggers duplicate rejection | eval/results/batch-PfMF7u/report.md and original run JSON; frozen pass line remains failed; no post-run threshold changes |

## Coverage

| Feature | Tests/scenarios | Current evidence |
|---|---|---|
| F-peer-A-01 exact dedup/identity | G01/G02/G07/G09; S01/S04 | unit/scenario logs |
| F-peer-A-02 windows and persistent pause | G03–G06/G12; S02/S03 | unit/scenario logs |
| F-peer-A-03 recovery/compatibility | G08/G09; UI03; S03/S05 | root identity, idempotent user command, v1 fixture |
| F-peer-A-04 failure/capacity | G10/G11/G12; S04/S06 | rollback, reservations, capacity, cleanup |
| F-peer-A-05 presentation | UI01–UI05 | source/DOM tests and packed real Host: test/evidence/browser/result.json |
| F-peer-A-06 packaging | REL01–REL03 | test/evidence/pack.json; browser/result.json; browser-no-client/result.json and browser-baseline/result.json |

## Model rules

`peer_send` and the received envelope say: new work, questions, substantive progress or results only; no acknowledgement/thanks/farewell replies; result once; stop automatic sends after protection errors; receipt is not processing or user-task completion. Runtime guard enforces limits independent of prompt compliance. E01–E06 are not substitutes for G/S tests.

## Historical A validation (0.1.1)

E01–E06: completed, **not passed**. The standalone follow-up batch `eval/results/batch-PfMF7u/report.md` contains all 60 runs: changed quiet cases 15/15; normal cases 9/15; five token-cap failures and one duplicate-content rejection. E05 fails the fixed budget in both versions. E06’s failed changed run completes the result, but an extra query causes a duplicate resend. The first interrupted batch is separate and never pooled into scores. No universal token-saving claim.

History pagination passed (`browser-history/result.json`); a separate Desktop loading path and Windows remain untested. Final deterministic suite: 42/42, S scenarios: 6/6; packed browser and independent read-only product review passed. Full A acceptance remains open because the model pass line has not been met.

First E batch `eval/results/batch-g3j0uB` is retained as interrupted harness evidence, not final acceptance: provider termination was not recorded and duplicated transcript fields inflated the conservative UTF-8 budget estimate. Completed E05 samples were marked token-cap; one in-flight request may be unaccounted after termination. A follow-up batch uses the provider's input-token count with a 32-token reserve, logs the request output ceiling and actual stop reason, treats truncation as failure, and preserves partial runs on graceful interruption. No case, run count, total budget or pass threshold is changed. `test/evidence/red-eval-stop-reason.tap` demonstrates the missing stop-reason record before repair.

## B minimum (0.1.2)

Frozen contract: [request-result-spec.md](request-result-spec.md). Baseline 0.1.1 is retained separately; A's failed batch remains a failed historical result. B's final fixed regression suite passed; see [final report](../eval/results/batch-SiC278/report.md).

| Failure | Trigger and enforced regression | Evidence |
|---|---|---|
| L-peer-008 | E05 tail calls consume budget; E06 queued result permits another task query without tracked lifecycle | B01–B07 API red against 0.1.1, red-b-0.1.1.tap; prior behavioral E05/E06 artifacts remain unchanged |
| L-peer-009 | timeout/bad ACK dropped occupied slots; failed rollback retained queued/question fields; uncertain question lost its phase | exchange-failure B08/B09, red-b-failure.tap then green; uncertainty is separate from stage, exact rollback and revision check |
| L-peer-010 | Normalized delivery edges precede tool-return records, incorrectly counting final result's wrapper and read-only tools as extra sends | evaluator counts actual delivery edges after the result; pass thresholds unchanged |

| Feature | Verification |
|---|---|
| F-peer-B-01 lifecycle | request-result B01–B07: local/socket batch, consume-before-next-request, question pairing, exactly-once result, ownership and expiry |
| F-peer-B-02 handoff | handoff B10; actual packed Host scripted provider, handoff-host.json: terminal=1 call; keep/failed/legacy=2; race=3 with marker and fresh steering/followup; two live agents complete two consecutive requests |
| F-peer-B-03 compatibility/limits | exchange-failure B08/B09: unknown ACK, rollback, empty/queued waits, restart, mixed-version capability, 512-record capacity and expiry; A scenarios remain passing |
| F-peer-B-04 presentation | packed browser-history/result.json: v2 received card and structured handoff result, v1 replay across 250 turns, first-line title/body separation and keyboard/dark/mobile checks |

B first real-Host fixture failures were fixture schema and runtime-context selection errors; handoff-fixture-failure.json retains the latter. They are not product red evidence. Model simulation uses actual registered tool schemas and execution, source-derived delivered edges, all same-response calls before conclusion, and the Host behavior separately proven above. It is not a full Host scheduling benchmark.

## B follow-up corrections

| Failure | Root cause and regression |
|---|---|
| L-peer-011 | Initial queued wait did not conclude, allowing repeated wait calls; universal envelope also requested replies to closed results. PB08, red-queued-wait-host.json (4 requester calls) versus final handoff-host.json (3, both results consumed), UI06 result-role instruction. Failed batch-2zMCau remains failed. |
| L-peer-012 | Nested second-round request omitted its explicit destination, adding correction calls and exhausting the unchanged budget. PB09 adds mutually exclusive explicit single/batch forms; request-shape B13 red-b-request-shape.tap then green. Failed batch-bZU7dc remains failed. |
| L-peer-013 | Malformed ACK could throw after delivery; mixed queued/local-work wait text contradicted wait:false. red-b-malformed-ack.tap and red-b-mixed-wait.tap then green; conservative uncertainty and action-consistent hints. |
| L-peer-014 | Tool-level brevity hints did not reliably prevent peer instructions expanding user scope; E05 exhausted its budget. PB10–PB12, failed full batches preserved, native-policy unit and real-Host red/green prove the actual product policy reaches model input. Final full batch passes without changing cases or limits. |
| L-peer-015 | Malformed v2 pending metadata could throw during display matching. UI06 red-b-malformed-display.tap then green; final browser bundle falls back to complete raw text. This client-only repair is separately fingerprinted from the model snapshot. |

Final deterministic suite: 67/67; S01–S06 and SB01–SB03: 9/9. Final packed Host validates single/mixed forms, terminal/continuing calls, same-step tools, fresh user inputs, two-round consumption, queued parallel results and the identical native policy. Final packed browser-history suite passes with no console errors; the package contains all runtime modules and version 0.1.2. Evidence: test/evidence/green-b-unit.tap, scenarios.json, request-scenarios.json, handoff-host.json, browser-history/result.json and pack-b.json.

Final independent model batch [batch-SiC278](../eval/results/batch-SiC278/report.md): changed 30/30, quiet 15/15, normal 15/15, zero rejected sends or budget stops; baseline 15/30. Earlier five B failures remain separate and are not pooled. This is fixed-regression acceptance, not an unseen-task or universal token-saving claim. The final client-only fallback is covered by component-validation.json and final browser evidence; all evaluated Host/tool/policy/harness/case hashes remain unchanged. Broader root budgets, persisted recovery and subscriptions remain outside minimum B.

Final independent read-only acceptance: no blockers. Reviewer independently reran 67 tests, recalculated all 60 grades and token sums, checked all product/archive/harness hashes and final browser/Host evidence. Historical final-unit.tap belongs to A (42 tests); current B uses green-b-unit.tap.

## Local hub (0.2.0)

Frozen contract: [hub-spec.md](hub-spec.md). SQLite and local deployment are user-approved. End-to-end acceptance is dsh-to-dsh only; Claude has adapter contract coverage, no real CLI/session verification. No external model calls or model-quality claim.

| Failure | Enforced regression and evidence |
|---|---|
| L-peer-016 | Centre identity, durable queue and task lifecycle absent: H01–H06, red-hub.tap; old implementation lacks the hub module |
| L-peer-017 | Existing core ignored hub configuration and isolated registries could not communicate: H07/H08, red-hub-core.tap |
| L-peer-018 | Lost claim response became unknown; unknown queue entries starved fresh work; initial outage did not reconnect; old local metadata threw: H11–H14, red-hub-recovery.tap |
| L-peer-019 | Non-string names/workspaces were coerced by regex and poisoned discovery: H15, red-hub-names.tap |
| L-peer-020 | Completing an interleaved incoming task allowed an unfinished task to obtain a new root budget: H16, red-hub-root.tap |
| L-peer-021 | Claim cache replay crossed generations and reconciliation consumed send capacity: H17/H18, red-hub-claims.tap; bounded per-session generation-scoped cache |
| L-peer-022 | Persisted delivery followed by native consumption could not be confirmed after a new host generation or lost callback: H20/H21, red-hub-delivered-recovery.tap |
| L-peer-023 | Late delivered response could erase locally observed consume-pending: H22, red-hub-ack-race.tap in an isolated copy with core.ack's old assignment restored; final monotonic receipt/history reconciliation passes |
| L-peer-024 | New binaries/version/accepted status and installed guides missing: H10, red-hub-package.tap and red-hub-pack-guides.tap; hub-pack.json verifies shipped files |
| L-peer-025 | Hub-dependent tool text broke the existing default-mode evaluator's source parser during development: hub-full-unit.tap (84/85), then hub-eval-contract-green.tap and full final suite; original model cases/pass lines unchanged |

| Feature | Verification |
|---|---|
| F-peer-H-01 authenticated registration | H01/H06/H15; identity binding, workspace isolation, revocation, origin and body bounds |
| F-peer-H-02 durable recovery | H02/H04/H08/H11–H14/H17/H18/H20–H22; restart, idempotent claims, native proof, fenced generations |
| F-peer-H-03 task state and budgets | H03/H05/H16; clarification/result, consume-before-next-task, nested root and directional limits |
| F-peer-H-04 real dsh transport | H07, SH01–SH04 in hub-host-1793676433400/result.json; separate Host/home/registry, packed plugin, deterministic provider |
| F-peer-H-05 Claude contract | H09, hub-claude-green.tap; bound identity, content-free notification, explicit ACK, unknown receipt refusal; no real Claude validation |
| F-peer-H-06 package and UI | H10; hub-pack.json; hub-browser-1793676641372/result.json; original packed history UI in hub-local-regression/browser-history/result.json |

Final implementation unit run: **88/88**, no failures/skips (`test/evidence/hub-final-unit.tap`). Original deterministic scenarios: **9/9**, and packed native handoff passed in `hub-local-regression/`. SH01–SH04: **4/4** after final runtime repairs; SH04 deliberately drops receiver ACKs and kills only the owned test Host, then checks native history prevents a second delivery. Every Host run has cleanup.json. Dashboard tests cover authenticated read, source title, nonduplicated body, keyboard, escaped content, 360px width and logout. Packaging-only guide inclusion was checked separately afterward.

Initial Host failures are retained separately: hub-host-1793675132879 selected a runtime-context user envelope; hub-host-1793675352312 used the wrong resume option; hub-host-1793675453281 manually seeded an invalid persistent surface head. These are fixture failures, not product red proof. The passing fixture uses ordinary native user input and resumeSessionId. The initial hub-first-green.tap is a sandbox listen denial, not a product failure or passing run. Subsequent local-port tests ran with the authorized local-network permission.

Independent final acceptance and local deployment metadata are recorded in hub-spec.md. Nested-root limits do not claim a whole-user-turn budget across newly created roots. Capacity rejects rather than evicts, unknown receipts remain unknown without proof, and public-network deployment is outside this release.
