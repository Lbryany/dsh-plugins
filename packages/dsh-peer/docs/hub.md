# Local Peer Hub
English | [中文](hub.zh.md)

The hub owns identity, durable messages and collaboration state; agents execute in their own hosts. All hub-mode traffic traverses the centre, including same-process sessions. This release provides local deployment only.

## Start and pair

Run from the package directory, or use the installed `dsh-peer-hub` command.

```sh
node bin/hub.js start --dir /absolute/path/peer-hub --port 3987
node bin/hub.js pair --dir /absolute/path/peer-hub --name dsh-a --out /absolute/path/dsh-a.json
node bin/hub.js pair --dir /absolute/path/peer-hub --name dsh-b --out /absolute/path/dsh-b.json
```

`start` runs in the background; `serve` runs in the foreground. Open `http://127.0.0.1:3987` and enter the token from `admin.json` in the runtime directory. Credentials never enter URLs or persistent browser storage. Each Host/profile requires a separate device credential with mode 600. After a crash the old lease lasts up to 45 seconds; clients reconnect with backoff.

The directory contains `hub.sqlite`, `admin.json`, `server.json` and logs. Stop the owned PID in `server.json` with SIGTERM. Back up the complete stopped directory, including SQLite WAL files. Capacity is 10,000 retained messages and 1,024 sessions per workspace. New writes fail explicitly at capacity; this version has no automatic archival.

## Connect dsh

After enabling the plugin in a profile, configure `cordis.patch.yml`:

```yaml
- id: dsh-peer
  config:
    name: alice
    hub:
      credentialFile: /absolute/path/dsh-a.json
      stateDir: /absolute/path/alice-receipts
```

Use `reviewer`, the dsh-b credential and a separate stateDir on the other side. Model configuration is unchanged. Sessions register after their first user message; drafts and subagents do not register independently. `peer_list` or `/peers` lists members. Request/reply/wait retain their interfaces. Hub mode rejects `peer_send` with `steer:true`. Nested delegation can specify `parentRequestId`; otherwise the hub binds the current or sole unfinished incoming task and rejects ambiguity.

## Delivery and recovery

| State | Meaning |
|---|---|
| Accepted | Committed at the hub, awaiting the recipient |
| Claimed | Claimed by the adapter; native admission unconfirmed |
| Delivered | Present in the native durable inbox/history |
| Consumed | Consumed by the host; task completion still requires result |
| Unknown | Native evidence is required to confirm admission |
| Failed | Expired or explicitly failed |

Lost responses are retried with the original operation ID. Tools report uncertainty when the hub is unreachable; callers must not resend with a new ID. Reconnect synchronizes registration and existing messages, never recreates sending tasks. SSE carries hints; bodies come from the hub inbox. ACK does not create chat replies. Client receipt files and native history prevent duplicate injection after restart; unresolved admission remains unknown.

An offline recipient must resume the same native session to receive its queue. The plugin neither launches closed sessions nor transfers an old inbox to a new session. Preserve the centre directory, device identity and stateDir. Directional pauses survive restart and require administrator recovery through the dashboard or CLI `resume`.

## Claude adapter boundary

Experimental `dsh-peer-claude` uses the optional official MCP SDK. Set `DSH_PEER_CREDENTIAL` and `DSH_PEER_NAME`. Reuse `DSH_PEER_SESSION_ID` only for the same Claude session; omitting it creates a new identity on every start.

After a hint the model calls `peer_inbox`, explicitly confirms with `peer_ack`, and uses request/reply tools. An MCP connection alone does not enable push: follow the [official Claude instructions](https://code.claude.com/docs/en/channels-reference) for custom Channels. This step does not invoke Claude CLI or claim real Claude end-to-end acceptance. Unknown deliveries do not automatically replay their bodies.

## Verification

```sh
npm run check
node scripts/hub-check.mjs
node scripts/hub-browser-check.mjs
```

End-to-end tests run two real dsh Hosts, isolated homes/profiles/registries, a local hub and a deterministic scripted model. They cover real tools, scheduling, persistence and recovery, not model quality, and call no external model. Local-mode regressions still run scenarios, request-scenarios, handoff-check and browser-check. The source repository retains specifications and evidence in docs/hub-spec.md, docs/acceptance.md and test/evidence.
