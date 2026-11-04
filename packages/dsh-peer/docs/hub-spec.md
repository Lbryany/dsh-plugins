# Peer Hub — local centre, 0.2.0

Frozen before product changes, 2026-11-03. Source: user approved central registration/routing, local deployment, SQLite, and dsh-to-dsh end-to-end validation first. Baseline: 0.1.2. No commit, push, real-profile install, port 3091 access or Claude CLI invocation is part of this step.

## Scope and decisions

- One local centre owns authenticated device/session registration, durable inboxes, request/result state, delivery receipts, directional protection and a shared task-chain budget. All hub-mode traffic, including two sessions in one process, goes through it.
- SQLite is user-approved. Runtime follows this ESM package; no build dependency is needed. HTTP RPC plus an authenticated SSE wake stream is the reversible default (P200, pending user confirmation). The stream carries hints only; reconnect always reads the durable inbox.
- Device credentials are minted by a local administrator, hashed at rest on the server, scoped to a workspace, and revocable. Native session identity is bound to its device; sender identity is derived from authentication. Names are workspace-unique. Registration generation fences old processes. A new native session never silently inherits an old inbox (P201, pending user confirmation).
- dsh-peer retains its existing tool names, handoff behavior, source card and local mode. Hub config selects the new implementation. Claude uses the same protocol via an optional MCP/Channels adapter; only adapter contract tests run now. No claim of real Claude compatibility will be made.
- Local centre listens on 127.0.0.1 only. Public deployment/TLS, cloud hosting, A2A, file transfer, groups, shared task boards and model-quality benchmarking are later steps.

## Data and implementation

`lib/hub/store.js` owns SQLite schema/version and synchronous transactions. `service.js` owns device/session authorization, identity leases, idempotent operations, request transitions, delivery claims and budgets. `server.js` owns bounded authenticated HTTP/SSE. `client.js` owns RPC and reconnect. `core.js` adapts the existing dsh tool/event contract. `bin/hub.js` provides init/start, pair, inspect and administrative recovery. The dashboard reads authenticated centre state.

Messages retain UUID, sender/recipient snapshot, request/root IDs, created/expiry times and queued/claimed/delivered/consumed/unknown/failed states. A send is accepted only after commit. Duplicate operation IDs with different input are rejected. Claim is persisted before the host side effect. An interrupted claim is unknown until native inbox/history proves admission; it is never blindly reinjected. Network retry does not generate a new message ID. ACK never wakes a model. Result consumption releases the requester slot.

Defaults: 64 KiB RPC body; up to 8 requests/batch; 60 s duplicate window; 6 messages/60 s; 12 messages/10 min then paused; 3 clarification rounds; 24 messages/root, depth 4, root deadline 10 min; 24 h ordinary-message expiry; 10,000 retained messages and 1,024 sessions/workspace. Reject capacity rather than silently evict live state. Only administrator recovery clears a central pause; it does not replay messages. Authentication and delivery errors fail closed.

## Frozen tests and pass lines

| ID | Assertion / old-code red proof |
|---|---|
| H01 | Device identity, registration, unique names, sender binding and cross-workspace isolation; old hub module absent |
| H02 | Durable queue, read versus ACK, operation-ID conflict, restart and duplicate delivery; old hub module absent |
| H03 | request/question/answer/result, ownership, duplicate final result, consume-before-next-request; old hub module absent |
| H04 | Offline recipient, reconnect, generation fencing and unknown admission recovery without duplicate work; old hub module absent |
| H05 | Persisted directional pause and shared root depth/count/deadline, including nested requests; old hub module absent |
| H06 | Unauthorized/forged/revoked requests, body bounds, wrong origin, non-loopback listener denied; old hub module absent |
| H07 | Real HTTP clients in separate local registries route exclusively through the hub; old core ignores hub config |
| H08 | SSE reconnect, local durable receipt reconciliation and no timer-driven model polling |
| H09 | Claude channel/tool adapter contract only, no Claude process |
| H10 | Packed bin/runtime files, version and dashboard auth/render contract |

Scenarios SH01–SH04 run two real isolated dsh Host processes with a deterministic local LLM adapter: mutual discovery; request → clarification → answer → result with terminal handoff; centre restart/offline delivery; duplicate/unknown delivery with native history reconciliation. Their DSH homes, registry directories, credentials, ports and child processes are independent and cleaned up. No shared registry/socket delivery is permitted. All assertions must pass; unexpected extra model turns or duplicate native inbox messages fail.

The existing complete unit suite, S01–S06/SB01–SB03, packed Host handoff, packed browser rendering and npm pack checks must remain green. New deterministic tests must fail before implementation and pass afterward. This is transport/lifecycle verification, not a live-model comparison: no E-series model run or model-quality claim. Only deepseek-flash may be used if a subsequent separately frozen model evaluation is requested.

Coverage IDs F-peer-H-01 through F-peer-H-06 map respectively to H01/H06, H02/H04/H08, H03/H05, H07/SH01–SH04, H09, and H10/browser. Failures continue the package ledger at L-peer-016. This package does not consume dsh-projects product step/L/F numbers. Coordinator notes receive their documentation checks; product gates run on dsh-peer.

## Risks and acceptance

SQLite and a single local centre are an explicit first-deployment boundary. Host injection and server commit cannot form a distributed transaction; recovery must retain uncertainty unless the exact message ID appears in the native inbox/history. Closed native sessions are not automatically started. The Claude adapter remains unverified against a real Claude session. Local-state files contain messages and private credentials and use owner-only permissions.

Independent read-only acceptance reviews final diff, red/green evidence, identity and crash paths. Deliver 0.2.0, reproducible commands, local running centre URL/data directory, verification counts, cleanup results and explicit untested boundaries. Test hosts are removed; the user-requested local centre may remain running separately.

## Implementation record

At freeze no product edits or test runs existed. Implementation now provides the hub, dsh integration, experimental Claude adapter, local dashboard and CLI at 0.2.0. Readme guides cover startup, pairing, recovery and bounds.

H11–H18/H20–H22 were added without relaxing original assertions after independent recovery/type/budget findings. Red artifacts and exact failure mechanisms are in the package acceptance ledger. The default-mode evaluator source parser was updated for the conditional hub suffix; no model evaluation was run. First sandbox and fixture failures remain separately preserved.

Validation: 88/88 full unit tests, original 9/9 scenarios, packed native handoff and original history browser regression, 4/4 real dsh-dsh hub scenarios, hub dashboard browser checks and packed files. The native end-to-end provider is deterministic, not a live model. Required guides are included in the npm artifact. Final independent read-only acceptance passed: 21/21 hub tests independently rerun; H07 independently red on exported 0.1.2; final runtime hashes, all scenario/browser evidence, package contents and cleanup checked. No unresolved blocker. See test/evidence/hub-acceptance.json.

User deployment is a separate background centre at http://127.0.0.1:3987 with data in the package's ignored .local/hub directory. Test homes are temporary and removed; no real user profile was modified. No commit, push or publication performed.

## 0.3.0 split

On 2026-11-04 the centre (`store/service/server/client/claude`, web console, `bin/hub.js`, `bin/claude.js`) moved with history to the separate peer-hub repository and gained remote authentication, an HTTP MCP endpoint and Codex/Grok Bot integration. This package keeps `lib/hub/core.js` (the dsh adapter) on top of `@lbryany/peer-hub-client`. H01–H06, H11–H12, H15–H18, H20 now run in peer-hub (`test/hub-core-protocol.test.mjs`); H07–H08, H13–H14, H21–H22 and SH01–SH04 still run here against the peer-hub centre.
