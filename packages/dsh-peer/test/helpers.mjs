import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createTransport } from '../lib/transport.js';
const modulePath = process.env.PEER_BASELINE ? join(process.env.PEER_BASELINE, 'lib/core.js') : new URL('../lib/core.js', import.meta.url).pathname;
const { createPeerCore } = await import(pathToFileURL(modulePath));
export const ids = { a: 'session-aaaa-1111', b: 'session-bbbb-2222', c: 'session-cccc-3333' };
export async function setup(t, { socket = false, protection, guardOptions } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'peer-a-')); let clock = 0;
  const got = [], logs = [], hooks = new Map(), cores = [], requests = [];
  const live = new Set(Object.values(ids));
  const agents = { get: id => live.has(id) ? {
    followup: m => { hooks.get(id)?.(m); got.push({ id, m, steer: false }); },
    steer: m => { hooks.get(id)?.(m); got.push({ id, m, steer: true }); },
  } : undefined };
  const make = pid => {
    const core = createPeerCore({ dir: join(root, 'run'), pid, agents,
      namesFile: join(root, 'names.json'), isAlive: () => true,
      now: () => clock, guardNow: () => clock, protection, guardOptions,
      log: line => logs.push(line), makeMessage: (text, source) => ({ content: [{ type: 'text', text }], source }),
      createTransport: opts => { requests.push(opts.onRequest); return createTransport(opts); },
    }); cores.push(core); return core;
  };
  const a = make(process.pid), b = socket ? make(process.pid + 100000) : a;
  const cleanup = () => { for (const c of cores) c.stop(); rmSync(root, { recursive: true, force: true }); };
  t.after(cleanup); await a.start(); if (socket) await b.start();
  a.register({ id: ids.a, cwd: '/tmp/alpha' }); a.register({ id: ids.c, cwd: '/tmp/gamma' });
  b.register({ id: ids.b, cwd: '/tmp/beta' }); a.flush(); b.flush();
  const send = (text, opts = {}) => a.send({ from: ids.a, to: 'bbbb', text, ...opts });
  const raw = (extra = {}) => ({ v: 1, type: 'send', token: b.token, id: 'id-1', from: { session: ids.a, name: 'alpha-aaaa', pid: a.pid }, to: { session: ids.b }, text: 'payload', ...extra });
  return { root, a, b, got, logs, hooks, live, send, raw, receive: req => requests.at(-1)(req), time: n => { clock = n; }, cleanup };
}
