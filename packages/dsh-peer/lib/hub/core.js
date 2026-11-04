import { randomUUID, createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { defaultName } from '../core.js';
import { relayText, exchangeText, REPLY_HINT } from '../message.js';

// Centre mode depends on @lbryany/peer-hub-client (the peer-hub repository's
// packages/client). It is loaded lazily so local same-machine mode never needs it.
// This is the remote channel of the mixed core (lib/mixed.js); it never carries
// messages between sessions that are both running on this machine.
const require = createRequire(import.meta.url);
function loadHubClient() {
  try { return require('@lbryany/peer-hub-client'); }
  catch (error) {
    if (error?.code !== 'ERR_MODULE_NOT_FOUND' && error?.code !== 'MODULE_NOT_FOUND') throw error;
    throw new Error('dsh-peer 中心模式需要 @lbryany/peer-hub-client：在 dsh profile 目录运行 npm install <peer-hub>/packages/client');
  }
}

export function nativeReceipt(agent, messageId) {
  const has = m => m?.source?.hub?.messageId === messageId;
  try {
    if (agent?.session?.deriveMessages().some(has)) return 'consumed';
    if ([...(agent?.inbox?.nextTurn || []), ...(agent?.inbox?.nextStep || [])].some(has)) return 'delivered';
  } catch { /* Missing history is uncertainty, never proof of absence. */ }
  return null;
}

// addressOf(from) gives the address a reply should use for a hub sender
// (`name`, or `name@device` when a local session has the same name).
export function createHubCore({ hub, dir, agents, makeMessage, persistMessage = async () => false, log = () => {}, addressOf = from => from.name }) {
  const { createHubClient, createReceiptJournal } = loadHubClient();
  const client = createHubClient({ ...hub, version: 'dsh-peer/0.4.0' }), sessions = new Map();
  const stateDir = hub.stateDir || join(dir, 'hub', client.deviceId);
  // One receipt journal per session: a session belongs to one process at a
  // time, while several processes of the device may share stateDir. The 0.3
  // single `receipts.json` is still read (never written) for reconciliation.
  const legacy = existsSync(join(stateDir, 'receipts.json')) ? createReceiptJournal(stateDir).entries : {}, journals = new Map();
  function journalOf(sid) {
    let j = journals.get(sid);
    if (!j) { j = createReceiptJournal(stateDir, `receipts-${createHash('sha256').update(String(sid)).digest('hex').slice(0, 24)}.json`); journals.set(sid, j); }
    return j;
  }
  const entryOf = (sid, id) => journalOf(sid).entries[id] ?? (legacy[id]?.from === sid ? legacy[id] : undefined);
  const write = (sid, id, value) => { const j = journalOf(sid); j.entries[id] = value; j.save(); };
  let started = false, timer, syncPromise, drainPromise, consumeQueue = Promise.resolve();
  let syncAgain = false, drainAgain = false, reachable = null, lastConflicts = '';
  const note = result => { if (result?.error === 'hub-unreachable') reachable = false; else if (result) reachable = true; return result; };
  function changed() { if (started) void sync().catch(() => {}); }
  // Only sessions the local core registered (it owns naming); the centre may suffix the name.
  function register(info) {
    if (!info?.id) return null;
    const old = sessions.get(info.id);
    const entry = { ...old, ...info, name: info.name || old?.name || defaultName(info.cwd, info.id), runtime: hub.runtime || 'dsh', status: info.status || old?.status || 'idle' };
    sessions.set(info.id, entry); changed(); return { ...entry };
  }
  async function sync() {
    if (!started) return;
    if (syncPromise) { syncAgain = true; return syncPromise; }
    syncPromise = (async () => {
      do {
        syncAgain = false;
        const result = note(await client.rpc('sessions.sync', { sessions: [...sessions.values()].map(s => ({ id: s.id, name: s.requested || s.name, cwd: s.cwd, title: s.title, status: s.status, runtime: s.runtime })) }));
        if (!result.ok) return result;
        for (const s of result.sessions) { const local = sessions.get(s.nativeSession); if (local) { local.requested ||= local.name; local.hubName = s.name; local.hubId = s.session; } }
        // Another live process of this device still owns these sessions (centre protocol 3).
        const conflicts = (result.conflicts || []).join(',');
        if (conflicts !== lastConflicts) { lastConflicts = conflicts; if (conflicts) log(`[dsh-peer] 中心：会话 ${conflicts} 仍由本设备另一个进程持有，暂不登记`); }
      } while (syncAgain && started);
    })().finally(() => { syncPromise = null; });
    return syncPromise;
  }
  // deliver() can observe native consumption and ACK it while consume() →
  // flushReceipts() does the same for the same message; one consumed ACK each.
  const consuming = new Map();
  function ack(sid, m, stage) {
    if (stage !== 'consumed') return sendAck(sid, m, stage);
    if (entryOf(sid, m.id)?.stage === 'consumed') return Promise.resolve({ ok: true, duplicate: true });
    if (!consuming.has(m.id)) consuming.set(m.id, sendAck(sid, m, stage).finally(() => consuming.delete(m.id)));
    return consuming.get(m.id);
  }
  async function sendAck(sid, m, stage) {
    const result = await client.rpc('inbox.ack', { from: sid, messageId: m.id, claimToken: m.claimToken, stage });
    if (result.ok) {
      const old = entryOf(sid, m.id), previous = old?.stage;
      const next = previous === 'consumed' || previous === 'consume-pending' && stage !== 'consumed' ? previous : stage;
      write(sid, m.id, { ...old, from: sid, claimToken: m.claimToken, stage: next });
    }
    return result;
  }
  async function reconcile(sid, agent, m) {
    const receipt = nativeReceipt(agent, m.id);
    if (receipt && await persistMessage(agent)) return ack(sid, m, receipt);
    return ack(sid, m, 'unknown');
  }
  async function deliver(sid, m) {
    const agent = agents.get(sid); if (!agent) return;
    // A claimed message might already have reached the native durable inbox.
    // Both the server claim and local intent are written before host injection.
    if (m.recovery || entryOf(sid, m.id)) { await reconcile(sid, agent, m); return; }
    write(sid, m.id, { from: sid, claimToken: m.claimToken, stage: 'intent' });
    const exchange = m.exchange && m.exchange.kind !== 'note' ? { ...m.exchange, hub: true, channel: 'hub' } : null;
    // The name in the text is the address a reply must use from this machine.
    let address = m.from.name; try { address = await addressOf(m.from); } catch { /* bare name */ }
    const from = { ...m.from, hubName: m.from.name, name: address };
    const text = exchange ? exchangeText(from, m.text, exchange) : relayText(from, m.text);
    const start = exchange ? text.indexOf('\n') + 1 : text.length - m.text.length - (`\n\n${REPLY_HINT(from.name)}`).length;
    const source = { kind: 'dsh-peer', form: 'relay', channel: 'hub', peer: from, ...(exchange ? { exchange } : {}),
      hub: { messageId: m.id, recipient: sid }, display: { version: exchange ? 2 : 1, id: m.id, to: sid, start, end: start + m.text.length, sentAt: m.createdAt } };
    try {
      agent.followup(makeMessage(text, source));
      const durable = await persistMessage(agent);
      await ack(sid, m, durable ? nativeReceipt(agent, m.id) || 'delivered' : 'unknown');
    } catch { await ack(sid, m, 'unknown'); }
  }
  async function drain() {
    if (!started) return;
    if (drainPromise) { drainAgain = true; return drainPromise; }
    drainPromise = (async () => {
      do {
        drainAgain = false;
        await syncPromise;
        for (const [sid] of sessions) {
          const r = note(await client.rpc('inbox.claim', { from: sid }));
          if (!r.ok) continue;
          for (const m of r.messages) await deliver(sid, m);
          // Continue full pages, but do not spin on unknown deliveries.
          if (r.messages.length === 16 && r.messages.some(m => !m.recovery)) drainAgain = true;
        }
        await flushReceipts();
      } while (drainAgain && started);
    })().finally(() => { drainPromise = null; });
    return drainPromise;
  }
  async function flushReceipts() {
    const pending = [...sessions.keys()].flatMap(sid => Object.entries({ ...Object.fromEntries(Object.entries(legacy).filter(([, r]) => r.from === sid)), ...journalOf(sid).entries }));
    for (const [messageId, receipt] of pending) {
      if (!['consume-pending', 'delivered'].includes(receipt.stage) || !sessions.has(receipt.from)) continue;
      const agent = agents.get(receipt.from);
      if (agent && nativeReceipt(agent, messageId) === 'consumed' && await persistMessage(agent))
        await ack(receipt.from, { id: messageId, claimToken: receipt.claimToken }, 'consumed');
    }
  }
  function consume(sid, source) {
    const messageId = source?.hub?.messageId;
    const entry = entryOf(sid, messageId);
    if (source?.kind !== 'dsh-peer' || source.hub?.recipient !== sid || !entry) return;
    write(sid, messageId, { ...entry, stage: 'consume-pending' });
    consumeQueue = consumeQueue.then(flushReceipts).catch(error => log(`[dsh-peer] receipt pending: ${error.message}`));
  }
  async function call(op, args, mutation = false) {
    await sync(); await consumeQueue; await flushReceipts();
    return note(await client.rpc(op, { ...args, ...(mutation ? { operationId: randomUUID() } : {}) }));
  }
  // Raw centre rows (every device of the workspace, this one included).
  async function list() {
    await sync(); const r = note(await client.rpc('sessions.list')); if (!r.ok) throw Object.assign(new Error(r.text), { code: r.error });
    return r.sessions;
  }
  const core = {
    mode: 'hub', transport: { path: client.url }, client,
    get deviceId() { return client.deviceId; },
    get reachable() { return reachable; },
    hubIdOf: sid => sessions.get(sid)?.hubId,
    async start() {
      if (started) return; started = true;
      try {
        await client.start(() => drain(), async () => { await sync(); }); await sync(); await drain();
        timer = setInterval(() => { void sync().then(drain).catch(() => {}); }, Math.max(100, hub.heartbeatMs || 10000)); timer.unref();
      } catch (error) { started = false; throw error; }
    },
    async stop() { if (!started) return; started = false; clearInterval(timer); await drainPromise; await consumeQueue; await client.stop(); },
    register, consume, flush: sync, ready: sync,
    unregister(sid) { sessions.delete(sid); changed(); },
    setStatus(sid, status) { const s = sessions.get(sid); if (s && s.status !== status) { s.status = status; changed(); } },
    setTitle(sid, title) { const s = sessions.get(sid); if (s && s.title !== title) { s.title = title; changed(); } },
    get: sid => sessions.has(sid) ? { ...sessions.get(sid) } : undefined,
    has: sid => sessions.has(sid),
    list,
    async rename(from, name) { const r = await call('rename', { from, name }); if (r.ok && sessions.has(from)) { const s = sessions.get(from); s.requested = name; s.hubName = r.name; } return r; },
    async protectionStatus(from) { const r = await call('protection', { from }); return r.ok ? r.directions : []; },
    request: args => call('request', args, true), reply: args => call('reply', args, true), waitFor: args => call('wait', args),
    send: args => call('send', args, true),
  };
  return core;
}
