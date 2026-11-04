// Two real packed DSH hosts, separate homes/registries (so, in 0.4 mixed mode,
// two different machines); all traffic between them traverses the Peer Hub centre from the peer-hub repository (PEER_HUB_DIR, default
// ../../../peer-hub). Devices join with one-time pairing codes through the
// real `peer join` CLI; the packed plugin resolves @lbryany/peer-hub-client
// from that repository. A deterministic provider isolates transport from model quality.
//
// External centre: PEER_HUB_URL=<url> PEER_HUB_ADMIN_DIR=<centre data dir with admin.json>
// runs against an existing centre instead of a temporary one. Everything goes
// into a fresh workspace (hubcheck-<time>), the two devices are revoked at the
// end, and SH03 (restarts the centre) is skipped and reported as skipped.
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, rmSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn, execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { createServer, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import assert from 'node:assert/strict';

const peerHub = resolve(process.env.PEER_HUB_DIR || new URL('../../../../peer-hub/', import.meta.url).pathname);
const { createHubServer } = await import(pathToFileURL(join(peerHub, 'server/server.js')));
const externalUrl = process.env.PEER_HUB_URL ? process.env.PEER_HUB_URL.replace(/\/+$/, '') : null;
if (externalUrl && !process.env.PEER_HUB_ADMIN_DIR) throw new Error('PEER_HUB_URL needs PEER_HUB_ADMIN_DIR (the centre data directory holding admin.json) to issue pairing codes');
const workspace = externalUrl ? `hubcheck-${Date.now().toString(36)}` : 'default';
// A killed host's device lease must lapse before it can reconnect: 1.5 s on the
// temporary centre, the centre's own lease (default 45 s) on an external one.
const leaseWaitMs = externalUrl ? Number(process.env.PEER_HUB_LEASE_MS || 45000) + 1500 : 1800;
const pkg = resolve(new URL('..', import.meta.url).pathname), evidence = join(pkg, 'test/evidence/hub-host-' + Date.now()); mkdirSync(evidence);
const tmp = mkdtempSync(join(tmpdir(), 'peer-hub-host-'));
const bin = process.env.DSH_BIN || '/opt/homebrew/lib/node_modules/@deepseek-ai/dsh/lib/bin.js', runtime = join(resolve(dirname(bin), '..'), 'node_modules');
let hub, proxy, dropReceipts = false; const hosts = [], reports = {}, scenarios = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, label, ms = 20000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    for (const h of hosts) { if (h.process && h.process.exitCode !== null && !h.stopped) throw Error(`${h.name} exited ${h.process.exitCode}`); const r = report(h); if (r?.error) throw Error(r.error); }
    if (await fn()) return; await sleep(100);
  }
  throw Error('Timed out: ' + label);
}
function report(h) { try { return JSON.parse(readFileSync(h.report, 'utf8')); } catch { return null; } }
async function freePort() { const s = createServer(); await new Promise(r => s.listen(0, '127.0.0.1', r)); const p = s.address().port; await new Promise(r => s.close(r)); return p; }
async function admin(op, args = {}) {
  return (await fetch(hub.url + '/v1/rpc', { method: 'POST', headers: { authorization: `Bearer ${hub.adminToken}`, 'content-type': 'application/json' }, body: JSON.stringify({ op, args: { workspace, ...args } }) })).json();
}
async function stopHost(h, signal = 'SIGTERM') {
  h.stopped = true; if (h.process?.exitCode === null) {
    h.process.kill(signal); await Promise.race([new Promise(r => h.process.once('exit', r)), sleep(4000)]);
    if (h.process.exitCode === null && h.process.signalCode === null) { h.process.kill('SIGKILL'); await new Promise(r => h.process.once('exit', r)); }
  }
}
function startHost(h) {
  h.stopped = false; const oldBoot = report(h)?.boot || 0;
  h.process = spawn(process.execPath, [bin, '--profile', 'hub-test', '--port', String(h.port), '--no-open'], {
    cwd: h.root, env: { ...process.env, DSH_HOME: h.home, DSH_PEER_NAME: h.name, DSH_PEER_DIR: join(h.root, 'registry'), DSH_PEER_NAMES_FILE: join(h.root, 'names.json'), DSH_TELEMETRY: '0' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  h.process.stdout.on('data', d => { h.logs += d; }); h.process.stderr.on('data', d => { h.logs += d; });
  return until(() => { const r = report(h); return r?.ready && r.boot > oldBoot; }, h.name + ' ready', 30000 + leaseWaitMs);
}
function command(h, text) { writeFileSync(h.command, JSON.stringify({ id: crypto.randomUUID(), text })); }
try {
  const pack = JSON.parse(execFileSync('npm', ['pack', '--json', '--pack-destination', tmp, '--cache', join(tmp, 'cache')], { cwd: pkg, encoding: 'utf8' }))[0];
  const install = join(tmp, 'install'); mkdirSync(install); execFileSync('tar', ['-xzf', join(tmp, pack.filename), '-C', install]);
  const unpack = join(install, 'package'); symlinkSync(runtime, join(unpack, 'node_modules'), 'dir');
  // Optional peer dependency for centre mode: the client package from peer-hub.
  mkdirSync(join(install, 'node_modules', '@lbryany'), { recursive: true });
  symlinkSync(join(peerHub, 'packages/client'), join(install, 'node_modules', '@lbryany', 'peer-hub-client'), 'dir');
  if (externalUrl) hub = { url: externalUrl, adminToken: JSON.parse(readFileSync(join(resolve(process.env.PEER_HUB_ADMIN_DIR), 'admin.json'), 'utf8')).token, external: true };
  else { hub = createHubServer({ dir: join(tmp, 'centre'), port: 0, limits: { leaseMs: 1500 } }); await hub.start(); }
  const health = await (await fetch(hub.url + '/health')).json(); assert.equal(health.ok, true, 'centre reachable');
  const hubPort = Number(new URL(hub.url).port);
  const upstreamRequest = new URL(hub.url).protocol === 'https:' ? httpsRequest : httpRequest;
  proxy = createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c); const body = Buffer.concat(chunks);
    let value; try { value = JSON.parse(body); } catch {}
    if (dropReceipts && value?.op === 'inbox.ack') { req.socket.destroy(); return; }
    const upstream = upstreamRequest(hub.url + req.url, { method: req.method, headers: { ...req.headers, host: new URL(hub.url).host } }, response => { res.writeHead(response.statusCode, response.headers); response.pipe(res); });
    upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); }); res.on('close', () => upstream.destroy()); upstream.end(body);
  });
  await new Promise(r => proxy.listen(0, '127.0.0.1', r));
  const proxyUrl = `http://127.0.0.1:${proxy.address().port}`;
  for (const [name, sessionId] of [['alice', 'session-aaaa-hub'], ['reviewer', 'session-bbbb-hub']]) {
    const root = join(tmp, name), home = join(root, 'home'), profile = join(home, 'profiles', 'hub-test'); mkdirSync(join(profile, 'node_modules', '@lbryany'), { recursive: true });
    const h = { name, sessionId, root, home, report: join(root, 'report.json'), command: join(root, 'command.json'), marker: join(root, 'created'), port: await freePort(), logs: '' }; hosts.push(h);
    const pairing = await admin('pair.create', { name, runtime: 'dsh' }); assert.equal(pairing.ok, true, pairing.error);
    h.deviceName = name;
    // Async: the centre runs in this process and must keep serving while the CLI joins.
    await promisify(execFile)(process.execPath, [join(peerHub, 'bin/peer.js'), 'join', name === 'reviewer' ? proxyUrl : hub.url, '--code', pairing.code, '--credential', join(root, 'credential.json')], { env: { ...process.env, PEER_HUB_HOME: join(root, 'peer-home') } });
    symlinkSync(unpack, join(profile, 'node_modules', '@lbryany', 'dsh-peer'), 'dir');
    writeFileSync(join(profile, 'package.json'), JSON.stringify({ name: 'peer-hub-test', private: true, type: 'module', dependencies: { '@lbryany/dsh-peer': pack.version }, dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', '@lbryany/dsh-peer'] } } }));
    const fixture = join(profile, 'node_modules', 'hub-fixture'); mkdirSync(fixture); symlinkSync(runtime, join(fixture, 'node_modules'), 'dir');
    writeFileSync(join(fixture, 'package.json'), JSON.stringify({ name: 'hub-fixture', type: 'module', main: 'index.js' })); writeFileSync(join(fixture, 'index.js'), readFileSync(join(pkg, 'test/hub-host-fixture.mjs')));
    writeFileSync(join(profile, 'cordis.patch.yml'), `- id: dsh-peer\n  config:\n    name: ${name}\n    dir: ${JSON.stringify(join(root, 'registry'))}\n    namesFile: ${JSON.stringify(join(root, 'names.json'))}\n    hub:\n      credentialFile: ${JSON.stringify(join(root, 'credential.json'))}\n      stateDir: ${JSON.stringify(join(root, 'receipts'))}\n      heartbeatMs: 200\n- id: hmr\n  disabled: true\n- insert:\n    - id: hub-fixture\n      name: hub-fixture\n      config:\n        name: ${name}\n        sessionId: ${sessionId}\n        report: ${JSON.stringify(h.report)}\n        command: ${JSON.stringify(h.command)}\n        marker: ${JSON.stringify(h.marker)}\n        cwd: ${JSON.stringify(root)}\n`);
    await startHost(h);
  }
  const [a, b] = hosts;
  await until(async () => (await admin('inspect')).sessions.filter(s => s.online).length === 2, 'registered');
  command(a, 'discover');
  await until(() => report(a)?.events.some(e => e.type === 'tool/result' && JSON.stringify(e).includes('reviewer')), 'native discovery');
  // Mixed mode (0.4): each host has its own registry, so the other host is only
  // reachable through the centre and is listed as a hub peer of device "reviewer".
  assert.match(JSON.stringify(report(a).events.filter(e => e.type === 'tool/result')), /reviewer \[hub, reviewer\]/, 'separate registries: discovery through the centre');
  scenarios.push({ id: 'SH01', ok: true });
  command(a, 'task:first review');
  await until(async () => (await admin('inspect')).requests.filter(r => r.state === 'complete').length === 1, 'first request complete');
  await until(() => report(a)?.calls.some(c => c.kind === 'result'), 'requester consumed result');
  const first = await admin('inspect'); assert.deepEqual(first.messages.map(m => m.exchange.kind), ['request', 'question', 'answer', 'result']);
  assert.equal(first.messages.every(m => m.state === 'consumed'), true);
  const relevant = [...report(a).calls, ...report(b).calls].filter(c => ['request', 'question', 'answer', 'result'].includes(c.kind));
  assert.equal(relevant.length, 4, 'no tail turn after terminal handoff'); scenarios.push({ id: 'SH02', ok: true });
  if (hub.external) {
    // SH03 restarts the centre; never done to a centre this script does not own.
    scenarios.push({ id: 'SH03', skipped: true, reason: 'external centre (PEER_HUB_URL): SH03 needs to restart the centre' });
    console.error('skip SH03: external centre, restarting it is not allowed');
  } else {
    await stopHost(b); command(a, 'task:offline review');
    await until(async () => (await admin('inspect')).messages.some(m => m.text === 'offline review' && m.state === 'queued'), 'offline queue');
    await hub.stop(); hub = createHubServer({ dir: join(tmp, 'centre'), port: hubPort, limits: { leaseMs: 1500 } }); await hub.start();
    await sleep(1800); await startHost(b);
    await until(async () => (await admin('inspect')).requests.filter(r => r.state === 'complete').length === 2, 'reconnect complete');
    scenarios.push({ id: 'SH03', ok: true });
  }
  dropReceipts = true; command(a, 'send:once-only after lost ACK');
  await until(() => report(b)?.received.some(m => JSON.stringify(m.content).includes('once-only after lost ACK')), 'native delivery before lost ACK');
  await sleep(500); await stopHost(b, 'SIGKILL'); dropReceipts = false; await sleep(leaseWaitMs); await startHost(b);
  await until(async () => (await admin('inspect')).messages.some(m => m.text === 'once-only after lost ACK' && m.state === 'consumed'), 'native history reconciliation');
  assert.equal(report(b).received.filter(m => JSON.stringify(m.content).includes('once-only after lost ACK')).length, 1);
  scenarios.push({ id: 'SH04', ok: true });
  const final = await admin('inspect');
  for (const h of hosts) { const r = report(h); reports[h.name] = r; assert.equal(r.events.filter(e => e.type === 'tool/result' && e.data?.result?.ok === false).length, 0); }
  writeFileSync(join(evidence, 'result.json'), JSON.stringify({ ok: true, version: pack.version, mode: hub.external ? 'external' : 'temporary', url: hub.url, workspace, scenarios, state: { sessions: final.sessions, requests: final.requests, messages: final.messages.map(({ claimToken: _claim, ...m }) => m) }, reports }, null, 2));
  console.log(JSON.stringify({ ok: true, version: pack.version, mode: hub.external ? 'external' : 'temporary', workspace, hub: final.sessions.length ? 'peer-hub ' + (await (await fetch(hub.url + '/health')).json()).version : null, scenarios,
    ...(scenarios.some(s => s.skipped) ? { skipped: scenarios.filter(s => s.skipped).map(s => `${s.id}: ${s.reason}`) } : {}), evidence }));
} catch (error) {
  writeFileSync(join(evidence, 'failure.txt'), error.stack); console.error(error.stack); process.exitCode = 1;
} finally {
  for (const h of hosts) { await stopHost(h); writeFileSync(join(evidence, h.name + '.log'), h.logs.replace(/token=[^\s&]+/g, 'token=REDACTED')); const r = report(h); if (r) writeFileSync(join(evidence, h.name + '.json'), JSON.stringify(r, null, 2)); }
  if (proxy) { proxy.closeAllConnections(); await new Promise(r => proxy.close(r)); }
  if (hub?.external) {
    // Leave the shared centre as found: revoke the devices this run created (their history stays in workspace ${workspace}).
    try { for (const d of (await admin('admin.devices')).devices || []) if (hosts.some(h => h.deviceName === d.name) && !d.revoked) await admin('device.revoke', { deviceId: d.id }); }
    catch (error) { console.error(`cleanup on external centre failed: ${error.message}`); }
  } else await hub?.stop();
  rmSync(tmp, { recursive: true, force: true });
  writeFileSync(join(evidence, 'cleanup.json'), JSON.stringify({ temporaryHomeRemoved: !existsSync(tmp), children: hosts.map(h => ({ name: h.name, pid: h.process?.pid, exitCode: h.process?.exitCode, signal: h.process?.signalCode })) }, null, 2));
}
