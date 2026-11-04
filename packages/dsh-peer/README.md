# dsh-peer
[中文](README.zh.md) | English

A collaboration channel between dsh sessions. Since **0.4.0** it runs in mixed mode: sessions on the same machine always talk directly (registry + Unix socket), and when a centre is configured, remote sessions are reached through the Peer Hub centre as well; both channels work at the same time. The centre lives in the separate peer-hub repository (remote deployment, pairing codes, console, HTTP MCP and Claude Code / Codex / Grok Bot integration); this package connects through the optional `@lbryany/peer-hub-client`. Requires **DSH 0.2.1-rc.5 or newer, below 0.3**. Child agents use their registered root session's identity.

## Install

Add `@lbryany/dsh-peer@0.4.0` to the profile's dependencies and `@lbryany/dsh-peer` to `dsh.profile.bundles`, install dependencies and restart that profile. Unpublished builds can be installed from a local `npm pack` artifact. Local development can run `DSH_BIN=/path/to/dsh/lib/bin.js node scripts/link-dsh.mjs`. Installation and restart are explicit user operations.

## Mixed mode: local sessions direct, remote ones through the centre

See the [hub guide](docs/hub.md) for startup, pairing and configuration. Without `config.hub.credentialFile` only the same-machine channel exists and behaves as in 0.3. With it, the same-machine channel keeps working and a centre channel is added (a 0.3 "centre only" profile needs no change; it is now mixed mode).

| Rule | Behaviour |
|---|---|
| Routing | A target running on this machine (present in the local registry) is reached over the socket; anything else through the centre. Messages between two sessions of this machine never pass through the centre. |
| This machine | Centre sessions of this process's device credential (same deviceId) are this machine's sessions: listed once, as `local`, sent over the socket. Detection requires those processes to share the registry directory (shared per user by default). |
| Registration | Local sessions still register with the centre so remote peers can find them. Several dsh processes of one profile may share one credential and be online together (needs a peer-hub 0.4.0 centre). |
| Same name | A bare name means the local session first; a remote session is `name@device` (centre session name + device name). `peer_list` shows `name@device` whenever names collide. |
| Different names | Centre names are unique per workspace, local names per machine, so one session may be `a` locally and `a-2` on the centre (a remote already holds `a`). Local peers use `a`, remote peers `a-2`; the detailed list shows the centre name and `peer_rename` reports it. |
| Listing | Both channels merged; every entry is marked `[local]` or `[hub, <device>]`. If the centre is unreachable only local sessions are listed, with a "centre offline" note. |
| Centre offline | Same-machine traffic is unaffected; sends to remote peers return `hub-offline` and are not retried automatically; remote traffic resumes when the centre is back. |
| Inbox | Messages from both channels arrive in the same inbox; `source.channel` is `local` or `hub`. Remote messages give the reply address as seen from this machine (`name@device` on a collision). |
| Replies | `peer_reply` (answer / result / declined) returns on the channel the task came on. |

The hub persists identities, messages, receipts and directional protection. Task-chain budgets are the same on both channels: 24 messages per root, delegation depth 4 and a ten-minute deadline; a refusal (`declined`) is always deliverable. A new root after completion has a separate budget and still encounters directional protection. This is not a global token/turn budget for an entire user task. Remote directions paused by the centre are resumed by a centre administrator; `/peer-resume` resumes local directions only.

Known limitation: the budget does not carry across channels. If this session is working on a task that came through the centre and delegates to another local session (or the other way round), the new task is an independent root on the other channel and does not inherit the original budget or deadline; the `peer_request` result marks it `crossChannel`.

## Messages and controls

| Entry | Behavior |
|---|---|
| `peer_list({all?,details?})` | Default addresses/status, at most 20 other sessions; in mixed mode each entry carries `[local]` or `[hub, <device>]`. `details:true` includes directories and full context. |
| `peer_request({to,text,wait?,parentRequestId?})` / `peer_request({requests:[{to,text}],wait?})` | Use `to/text` for one destination or a batch of up to eight; the forms are mutually exclusive and one batch may mix local and remote targets. Hand off and conclude the current turn by default. Use `wait:false` for remaining local work. `parentRequestId` continues an incoming task. |
| `peer_reply({requestId,kind,text,questionId?,wait?})` | Clarify (question), answer or deliver a result under the task ID; answers require the question ID. A responder that cannot or should not do the task ends it with `declined` (reason as text); every received task ends with one `result` or `declined`. Handoff concludes the current turn by default. |
| `peer_wait({requestIds?})` | Wait for existing remote work without polling peers. An empty list does not wait; queued messages are consumed by the Host. |
| `peer_send({to,text,steer?})` | Address a name, `name@device` or unique session prefix (at least four characters). Default next-turn input; `steer:true` is immediate input only when the user requested it (not for remote peers). |
| `peer_rename({name})` | Set a name matching `^[a-z0-9][a-z0-9_-]{0,39}$`; collisions get a suffix. |
| `/peers` | List peers and paused incoming directions in this session. |
| `/peer-name <name>` | Rename, or show the current name when omitted. |
| `/peer-resume <name or session ID>` | User-only recovery of one incoming direction; clears its windows, never replays messages or starts a model turn. |

Only root sessions with a user message are registered. Empty drafts and child sessions are not peers. Names default to `<directory>-<session-prefix>`; `DSH_PEER_NAME` or plugin `name` sets the first registered name. Renames persist by session ID. The `@` in the card is visual notation; tool addresses remain bare names.

The received card reads **来自 @reviewer · original first line**. Click or use the keyboard to expand the remaining lines. The first line is not repeated in the body. Single-line messages have no empty body disclosure. Details contain copy actions, raw records and current receiving-side recovery. There is no persistent paused banner. Unknown or invalid older display metadata preserves the complete text. Disabling the browser plugin leaves the complete host message readable.

The model receives the full origin envelope and message. It is instructed to send only new tasks, questions, substantive progress or results; acknowledgements, thanks and farewells need no reply. Results should be sent once. Receipt is not task completion.

## Requests and results (same-machine channel)

Prefer `peer_request` and `peer_reply` for collaboration; legacy `peer_send` never concludes the current turn. Handoff concludes only when every delivery is accepted. Partial failure or unknown acknowledgement returns itemized state; accepted work continues and is never automatically resent. The Host retains other calls from the same response and newly arriving user messages.

Each sending direction permits one unfinished request. A queued result or refusal retains that slot until the receiving session consumes it, preventing premature queries during parallel work. Each request permits three clarification rounds. Results are delivered once; identical retries of acknowledged results return the saved receipt.

Aligned with the centre (0.4.0):

- **Declined**: a responder ends a task with `declined` (reason as text), also while waiting for an answer. Like `result` it is terminal: the responder's task is cancelled (a later result gets `invalid-reply-state`) and once the requester reads it the direction is free for the next request. Refusals are exempt from the chain budget.
- **Expiry notice**: a task still open after ten minutes is closed and the requester receives a `[peer 过期通知]` message (from the responder, `source.system: true`) naming the last state; later replies get `request-expired`.
- **Task-chain budget**: a request made while the session is handling an incoming task joins that task's chain (the centre's rule; with several open tasks pass `parentRequestId`, otherwise `ambiguous-parent`). A chain allows 24 messages (`root-budget`), delegation depth 4 (`root-depth`) and shares the root deadline. Chain id, depth, used count and remaining time travel in every packet, so separate processes agree.

Both endpoints must support `request-result-v1`; old endpoints return unsupported without silent fallback. A 0.3 receiver does not know `declined` and refuses it (`invalid-reply-state`); upgrade receiving processes one by one. Each Host holds up to 512 volatile records for ten minutes from admission (expired ones leave a ten-minute tombstone for `request-expired`); restart invalidates outstanding work. Existing directional protection still applies. Host config `requests: false` disables the structured protocol.

When the Host exposes SystemPrompt, the plugin adds an ordinary collaboration policy for user scope, incremental content and truthful results without replacing the persona. `promptPolicy: false` disables it. A complete persona can suppress ordinary sections, so deterministic guards and tool hints remain.

## Local-mode receive protection

Protection is enforced at the common receiver entry, covering local and socket delivery, including old senders.

| Rule | Default |
|---|---|
| Exact content + delivery mode, same source/target session | Suppress repeats for 60 seconds from first acceptance |
| Sliding short window | At most 6 accepted messages per 60 seconds |
| Sliding long window | Accept 12 per 10 minutes; the next attempt pauses that direction |
| Recovery | Explicit user action; elapsed time does not unpause |
| Memory | At most 1024 pairs and 64 fingerprints per pair; preserve live pauses |

Only successful admissions consume quota. Failures roll back reservations. Renaming, session prefixes, child agents and switching delivery mode cannot reset the shared directional budget. Opposite directions and other sessions are independent. Legacy message-ID retries are idempotent within the last 200 receipts, scoped by sender and receiver. Structured fingerprints also distinguish request, question and message kind, while sharing directional counters.

Host configuration example:

```yaml
- id: dsh-peer
  config:
    protection:
      dedupMs: 60000
      shortMs: 60000
      shortLimit: 6
      longMs: 600000
      longLimit: 12
```

Positive integer values only; short window/limit cannot exceed long window/limit; longLimit is at most 64. `maxPairs` can be reduced from 1024 and `maxFingerprints` from 64. Host-only `protection: off` disables these guards. Model tools cannot change protection. Headless has no command UI: use controlled restart or host configuration. Restart clears in-memory protection.

## Local-mode outcomes and limits

| Result | Meaning |
|---|---|
| `queued` / `steered` | Accepted, not necessarily processed |
| `duplicate` | This ID was previously accepted; not delivered again |
| `duplicate-content` | Suppressed; do not acknowledge or resend |
| `rate-limited` | Not delivered; stop automatic sends, no timed retry |
| `conversation-paused` | Not delivered; user must recover at the receiver |
| `guard-capacity` | Not delivered; bounded protection state is full |
| `delivery-failed` | Synchronous admission failed; reservation rolled back |
| `timeout` / malformed response / connection lost after write | Delivery unknown; never automatically resend |

Address, token, missing-session and connectivity errors retain explanatory text. Protection errors omit the peer list. `retryAfterMs` explains a window, not a retry instruction. The wire remains `v:1`; a new sender cannot impose protection on an old receiver. Upgrade receivers individually. Low-frequency novel conversations outside the windows are not guaranteed to stop; global budgets across nested tasks and idle subscriptions are future work.

The same-machine channel assumes cooperative sessions owned by the same OS user; its claimed sender identity is not hostile-process authentication. It offers no cold delivery, backlog count or read receipts; remote machines, offline delivery and receipts come from the centre channel. Windows named pipes are implemented but not verified. The card's read-only status endpoint is owner-only under the DSH Connection policy and validates a live registered receiving session; shared non-owner viewers cannot query it. Recovery uses the host's session-authorized command API.

## Local storage and development

Registry precedence: plugin `dir`, `DSH_PEER_DIR`, `XDG_RUNTIME_DIR/dsh-peer`, then `~/.dsh-peer/run`. Each process owns a JSON record, a private key and a socket; stop removes them. Rename storage defaults to `~/.dsh-peer/names.json`; test/config `namesFile` isolates it. No message bodies are written to guard logs. Protocol requests are limited to 64 KiB; socket timeout is five seconds.

```sh
npm install --legacy-peer-deps
DSH_BIN=/path/to/dsh/lib/bin.js node scripts/link-dsh.mjs
npm run check
npm run scenarios
node scripts/request-scenarios.mjs
node scripts/handoff-check.mjs
npm run test:browser
node scripts/hub-check.mjs     # two real hosts, each its own "machine", all traffic through the centre
node scripts/mixed-check.mjs   # mixed mode: two hosts of one DSH_HOME plus a host of another machine
npm pack --dry-run --json
node eval/run.mjs --dry
```

Browser checks use a temporary profile, packed plugin, fake deliveries and an isolated Chrome. Model evaluation uses a frozen `PEER_BASELINE`. Supply `DSH_PEER_EVAL_API_KEY` explicitly, or, with user authorization, copy the existing profile read-only to a temporary DSH_HOME and run `node eval/from-profile.mjs <copy-directory>`; a separate account is unnecessary. That entry reads only the explicit copy and rejects the real `~/.dsh`. Evaluation fixes deepseek-flash, temperature 0 and thinking disabled. It reserves budget using provider input counts and counts actual input (including cache) plus output. Evaluation is separate from deterministic tests.
