# Peer Hub centre and mixed mode
English | [中文](hub.zh.md)

The centre, its client library and the other runtimes (Claude Code, Codex, Grok Bot) live in the separate **peer-hub** repository (locally `../peer-hub`; its README covers deployment, pairing and every runtime). This package keeps only the dsh plugin. Since **0.4.0** it runs in mixed mode: the same-machine channel is always on and a configured centre adds a second channel. Sessions of this machine talk over the socket, remote sessions through the centre, both at once.

Requires a peer-hub **0.4.0** centre (protocol 3: one device credential may have several processes online at once) and `@lbryany/peer-hub-client` 0.4.x.

## Connect dsh

1. Create a pairing code: console "Devices & pairing", or on the server `peer-hub pair --name mac --runtime dsh`.
2. Join from the dsh machine (credential written with mode 600):

   ```sh
   node <peer-hub>/bin/peer.js join https://hub.example.net --code K7PD-3QWX --credential ~/.peer-hub/mac.credential.json
   ```

3. Install the client into the dsh profile directory (optional peer dependency, loaded only when `hub` is configured): `npm install <peer-hub>/packages/client`.
4. Configure the profile's `cordis.patch.yml`:

   ```yaml
   - id: dsh-peer
     config:
       name: alice
       hub:
         credentialFile: /absolute/path/mac.credential.json
         stateDir: /absolute/path/peer-receipts
   ```

The centre URL comes from the credential (`url`, the address used when joining): remote centres must be `https://`; plain `http://` is loopback-only. Credentials renew automatically within 7 days of expiry.

One device credential per machine is enough. Several dsh processes of one profile (or of profiles sharing the credential) are separate connections of that device on the centre, each with its own lease and heartbeat, all online together; a process that exits only takes its own sessions offline. Renewal happens under a lock file (`<credential>.lock`): one process renews and the others adopt the token from the file. stateDir may be shared: receipt journals are per session (`receipts-<hash>.json`; a 0.3 `receipts.json` is only read, for reconciliation).

## Routing and addresses

- **Local first**: a target in the local registry (a dsh session running on this machine) is reached over the socket; anything else through the centre. Messages between two sessions of this machine never pass through the centre, which holds no message or event rows for them.
- **This machine**: centre sessions with this process's deviceId are this machine's sessions, listed once (`[local]`) and never addressed through the centre. Detection relies on a shared registry directory (`dir` / `DSH_PEER_DIR` / default `~/.dsh-peer/run`); do not give processes of one machine different registry directories.
- **Address syntax**:
  - `name`: looked up locally first (exact name, then session-ID prefix of at least four characters); the centre name of a local session (such as `a-2`) also means that local session; otherwise the centre names and session prefixes of remote sessions.
  - `name@device`: session `name` (centre session name) of device `device` (the device name given at pairing). This device's own name means local. The peer-hub client had no such syntax; dsh-peer resolves it to the centre session ID and sends with that, so the centre protocol is unchanged.
  - When a remote session has a local session's name, the bare name means local and `peer_list` shows the remote one as `name@device`.
- **Names may differ**: centre names are unique per workspace, local names per machine. One session may be `a` locally and `a-2` on the centre (a remote already holds `a`): local peers use `a`, remote peers `a-2`. The detailed list shows the centre name on local rows and `peer_rename` reports it.
- **Incoming**: both channels deliver into one inbox; `source.channel` is `local` or `hub`. A remote message names its reply address as seen from this machine (`name@device` on a collision). `peer_reply` returns on the channel the task came on.

Sessions register after their first user message; drafts and child agents do not register separately. The centre channel rejects `peer_send` with `steer:true`. Nested delegation may pass `parentRequestId`; otherwise the current or only open incoming task is bound and ambiguity is rejected (same rule on both channels). Continuing across channels (for example delegating a remote task to a local session) does not inherit the original budget or deadline; the result marks it `crossChannel`. This is a known limitation.

## Centre offline

The same-machine channel starts before the centre channel; an unreachable centre or a bad credential never affects local traffic. `peer_list` lists only local sessions with a "centre offline" note, and sends to remote peers return `hub-offline` (no automatic retry). When the centre returns the client reconnects, remote traffic resumes and messages queued meanwhile are delivered.

## Delivery and recovery (centre channel)

Accepted → claimed → delivered → consumed, or unknown / failed. A lost reply is retried only with the original operationId. When the centre is unreachable tools report an unknown outcome; do not resend with a new ID. SSE carries hints only (to the process that owns the recipient session); bodies are read from the centre inbox; ACK never produces a chat reply. The receipt journals plus native history prevent duplicate injection after restarts. Remote directional pauses are resumed only by a centre operator.

## Verification

```sh
npm run check
node scripts/hub-check.mjs     # two real dsh hosts (each its own "machine") through the peer-hub centre (PEER_HUB_DIR, default ../../../peer-hub)
node scripts/mixed-check.mjs   # mixed mode: A and B of one DSH_HOME (shared credential) + C of another DSH_HOME, temporary centre
PEER_HUB_URL=https://hub.example.net PEER_HUB_ADMIN_DIR=/var/lib/peer-hub node scripts/hub-check.mjs   # against an existing centre
```

By default both scripts start their own temporary centre. With `PEER_HUB_URL` plus `PEER_HUB_ADMIN_DIR` (the centre data directory holding `admin.json`, used to issue pairing codes) hub-check uses an existing centre instead: all devices and traffic go into a fresh workspace `hubcheck-<time>`, the two devices are revoked at the end, SH03 (restarts the centre) is skipped and listed under `skipped` in the output, and SH04 waits for the centre's connection lease (`PEER_HUB_LEASE_MS`, default 45000) before restarting the killed host.

mixed-check covers MX01 two processes of one credential online together, MX02 the merged list, MX03 A↔C through the centre (every message queued→claimed→delivered→consumed), MX04 A↔B over the socket only (the centre's messages and message_events unchanged), MX05 A↔B with the centre stopped and A↔C again after it returns. The model is a deterministic script.
