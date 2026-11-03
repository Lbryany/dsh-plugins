#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, openSync, closeSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHubServer } from '../lib/hub/server.js';

const [command = 'help', ...argv] = process.argv.slice(2);
const options = {};
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith('--') || !argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error('Options require --name value');
  options[argv[i].slice(2)] = argv[++i];
}
const dir = resolve(options.dir || '.local/peer-hub');
async function rpc(op, args = {}) {
  const { url } = JSON.parse(readFileSync(join(dir, 'server.json'), 'utf8'));
  const { token } = JSON.parse(readFileSync(join(dir, 'admin.json'), 'utf8'));
  const response = await fetch(url + '/v1/rpc', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ op, args }), signal: AbortSignal.timeout(5000), redirect: 'error' });
  const result = await response.json(); if (!result.ok) throw new Error(result.error); return { ...result, url };
}
try {
  if (command === 'serve') {
    const hub = createHubServer({ dir, port: Number(options.port || 3987) });
    await hub.start();
    writeFileSync(join(dir, 'server.json'), JSON.stringify({ url: hub.url, pid: process.pid, version: '0.2.0' }) + '\n', { mode: 0o600 });
    console.log(`Peer Hub 0.2.0: ${hub.url}\nData: ${dir}\nAdministrator credential: ${hub.adminFile}`);
    const stop = async () => { await hub.stop(); };
    process.once('SIGTERM', stop); process.once('SIGINT', stop);
  } else if (command === 'start') {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    try { const state = await rpc('inspect'); console.log(`Peer Hub already running: ${state.url}`); process.exit(0); } catch { /* Start a new local centre. */ }
    const log = openSync(join(dir, 'server.log'), 'a', 0o600);
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), 'serve', '--dir', dir, '--port', options.port || '3987'], { detached: true, stdio: ['ignore', log, log] });
    child.unref(); closeSync(log);
    let ready = false;
    for (let n = 0; n < 50; n++) {
      await new Promise(r => setTimeout(r, 100));
      try { const state = await rpc('inspect'); console.log(`Peer Hub 0.2.0: ${state.url}\nData: ${dir}\nAdministrator credential: ${join(dir, 'admin.json')}`); ready = true; break; } catch { /* Wait for socket and SQLite. */ }
    }
    if (!ready) throw new Error(`Hub failed to start; inspect ${join(dir, 'server.log')}`);
  } else if (command === 'pair') {
    if (!options.name || !options.out) throw new Error('pair requires --name and --out');
    const r = await rpc('device.create', { name: options.name, workspace: options.workspace || 'default' });
    const file = resolve(options.out); mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    writeFileSync(file, JSON.stringify({ ...r.credential, url: r.url }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    console.log(`Device ${options.name} paired. Private credential: ${file}`);
  } else if (command === 'inspect') {
    const r = await rpc('inspect');
    console.log(JSON.stringify({ url: r.url, devices: r.devices, sessions: r.sessions, requests: r.requests, messages: r.messages.map(({ text: _text, claimToken: _claim, ...m }) => m), directions: r.directions }, null, 2));
  } else if (command === 'revoke') {
    if (!options.device) throw new Error('revoke requires --device'); await rpc('device.revoke', { deviceId: options.device }); console.log('Device revoked.');
  } else if (command === 'resume') {
    if (!options.from || !options.to) throw new Error('resume requires --from and --to session IDs'); await rpc('resume', { from: options.from, to: options.to }); console.log('Direction resumed; no messages replayed.');
  } else {
    console.log(`dsh-peer-hub start|serve --dir <private-directory> --port 3987
dsh-peer-hub pair --dir <directory> --name dsh-a --out <credential.json>
dsh-peer-hub inspect --dir <directory>
dsh-peer-hub revoke --dir <directory> --device <device-id>
dsh-peer-hub resume --dir <directory> --from <session-id> --to <session-id>
start runs in the background; serve runs in the foreground. Stop the owned PID in server.json with SIGTERM.`);
  }
} catch (error) { console.error(`[peer-hub] ${error.message}`); process.exitCode = 1; }
