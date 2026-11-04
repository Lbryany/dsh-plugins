# Peer Hub centre mode
English | [中文](hub.zh.md)

Since 0.3.0 the centre, its client library and the other runtimes (Claude Code, Codex, Grok Bot) live in the separate **peer-hub** repository (locally `../peer-hub`; its README covers deployment, pairing and every runtime). This package keeps only the dsh plugin: local mode is unchanged and centre mode connects through `@lbryany/peer-hub-client`.

## Connect dsh

1. Create a pairing code: console "Devices & pairing", or on the server `peer-hub pair --name dsh-a --runtime dsh`.
2. Join from the dsh machine (credential written with mode 600):

   ```sh
   node <peer-hub>/bin/peer.js join https://hub.example.net --code K7PD-3QWX --credential ~/.peer-hub/dsh-a.credential.json
   ```

3. Install the client into the dsh profile directory (optional peer dependency, not needed for local mode): `npm install <peer-hub>/packages/client`.
4. Configure the profile's `cordis.patch.yml`:

   ```yaml
   - id: dsh-peer
     config:
       name: alice
       hub:
         credentialFile: /absolute/path/dsh-a.credential.json
         stateDir: /absolute/path/alice-receipts
   ```

The centre URL comes from the credential (`url`, the address used when joining): remote centres must be `https://`; plain `http://` is loopback-only. Credentials renew automatically within 7 days of expiry. Use a separate device credential and stateDir per host/profile.

Sessions register after their first user message; drafts and child agents do not register separately. `peer_list` or `/peers` shows centre members; request/reply/wait work as before. Centre mode rejects `peer_send` with `steer:true`. Nested delegation may pass `parentRequestId`; otherwise the centre binds the current or only open incoming task and rejects ambiguity.

## Delivery and recovery

Accepted → claimed → delivered → consumed, or unknown / failed. A lost reply is retried only with the original operationId. When the centre is unreachable tools report an unknown outcome; do not resend with a new ID. SSE carries hints only; bodies are read from the centre inbox; ACK never produces a chat reply. The receipt journal in stateDir plus native history prevents duplicate injection after restarts. Directional pauses are resumed only by a centre operator.

## Verification

```sh
npm run check
node scripts/hub-check.mjs     # two real dsh hosts through the peer-hub centre (PEER_HUB_DIR, default ../../../peer-hub)
PEER_HUB_URL=https://hub.example.net PEER_HUB_ADMIN_DIR=/var/lib/peer-hub node scripts/hub-check.mjs   # against an existing centre
```

By default hub-check starts its own temporary centre. With `PEER_HUB_URL` plus `PEER_HUB_ADMIN_DIR` (the centre data directory holding `admin.json`, used to issue pairing codes) it uses an existing centre instead: all devices and traffic go into a fresh workspace `hubcheck-<time>`, the two devices are revoked at the end, SH03 (restarts the centre) is skipped and listed under `skipped` in the output, and SH04 waits for the centre's device lease (`PEER_HUB_LEASE_MS`, default 45000) before restarting the killed host.
