import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync, openSync, fsyncSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { createHubClient } from './client.js';
import { defaultName, NAME_RE, formatList, LIST_LIMIT } from '../core.js';
import { relayText, exchangeText, REPLY_HINT } from '../message.js';

export function nativeReceipt(agent, messageId) {
  const has = m => m?.source?.hub?.messageId === messageId;
  try {
    if (agent?.session?.deriveMessages().some(has)) return 'consumed';
    if ([...(agent?.inbox?.nextTurn || []), ...(agent?.inbox?.nextStep || [])].some(has)) return 'delivered';
  } catch { /* Missing history is uncertainty, never proof of absence. */ }
  return null;
}

export function createHubCore({ hub, dir, fixedName, agents, makeMessage, persistMessage = async () => false, log = () => {} }) {
  const client = createHubClient(hub), sessions = new Map(), pending = new Map();
  const stateDir = hub.stateDir || join(dir, 'hub', client.deviceId);
  mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  const journalFile = join(stateDir, 'receipts.json');
  let journal = existsSync(journalFile) ? JSON.parse(readFileSync(journalFile, 'utf8')) : {};
  let started = false, timer, fixedUsed = false, syncPromise, drainPromise, consumeQueue = Promise.resolve();
  let syncAgain = false, drainAgain = false;
  function save() {
    const tmp = journalFile + '.tmp';
    writeFileSync(tmp, JSON.stringify(journal), { mode: 0o600 });
    const fd = openSync(tmp, 'r'); try { fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(tmp, journalFile);
    const directory = openSync(stateDir, 'r'); try { fsyncSync(directory); } finally { closeSync(directory); }
  }
  function changed() { if (started) void sync().catch(() => {}); }
  function register(info) {
    if (!info?.id || info.origin === 'subagent') return null;
    if (!sessions.has(info.id) && info.hasUserMessage === false) { pending.set(info.id, { ...info }); return null; }
    pending.delete(info.id);
    const old = sessions.get(info.id);
    let name = old?.name;
    if (!name && fixedName && !fixedUsed && NAME_RE.test(fixedName)) { name = fixedName; fixedUsed = true; }
    name ||= defaultName(info.cwd, info.id);
    const entry = { ...old, ...info, name, runtime: hub.runtime || 'dsh', status: info.status || old?.status || 'idle' };
    sessions.set(info.id, entry); changed(); return { ...entry };
  }
  async function sync() {
    if (!started) return;
    if (syncPromise) { syncAgain = true; return syncPromise; }
    syncPromise = (async () => {
      do {
        syncAgain = false;
        const result = await client.rpc('sessions.sync', { sessions: [...sessions.values()].map(s => ({ id: s.id, name: s.name, cwd: s.cwd, title: s.title, status: s.status, runtime: s.runtime })) });
        if (!result.ok) return result;
        for (const s of result.sessions) { const local = sessions.get(s.nativeSession); if (local) { local.name = s.name; local.hubId = s.session; } }
      } while (syncAgain && started);
    })().finally(() => { syncPromise = null; });
    return syncPromise;
  }
  async function ack(sid, m, stage) {
    const result = await client.rpc('inbox.ack', { from: sid, messageId: m.id, claimToken: m.claimToken, stage });
    if (result.ok) {
      const previous = journal[m.id]?.stage;
      const next = previous === 'consumed' || previous === 'consume-pending' && stage !== 'consumed' ? previous : stage;
      journal[m.id] = { ...journal[m.id], from: sid, claimToken: m.claimToken, stage: next }; save();
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
    if (m.recovery || journal[m.id]) { await reconcile(sid, agent, m); return; }
    journal[m.id] = { from: sid, claimToken: m.claimToken, stage: 'intent' }; save();
    const exchange = m.exchange && m.exchange.kind !== 'note' ? m.exchange : null;
    const text = exchange ? exchangeText(m.from, m.text, exchange) : relayText(m.from, m.text);
    const start = exchange ? text.indexOf('\n') + 1 : text.length - m.text.length - (`\n\n${REPLY_HINT(m.from.name)}`).length;
    const source = { kind: 'dsh-peer', form: 'relay', peer: m.from, ...(exchange ? { exchange } : {}),
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
          const r = await client.rpc('inbox.claim', { from: sid });
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
    for (const [messageId, receipt] of Object.entries(journal)) {
      if (!['consume-pending', 'delivered'].includes(receipt.stage) || !sessions.has(receipt.from)) continue;
      const agent = agents.get(receipt.from);
      if (agent && nativeReceipt(agent, messageId) === 'consumed' && await persistMessage(agent))
        await ack(receipt.from, { id: messageId, claimToken: receipt.claimToken }, 'consumed');
    }
  }
  function consume(sid, source) {
    const messageId = source?.hub?.messageId;
    if (source?.kind !== 'dsh-peer' || source.hub?.recipient !== sid || !journal[messageId]) return;
    journal[messageId].stage = 'consume-pending'; save();
    consumeQueue = consumeQueue.then(flushReceipts).catch(error => log(`[dsh-peer] receipt pending: ${error.message}`));
  }
  async function call(op, args, mutation = false) {
    await sync(); await consumeQueue; await flushReceipts();
    return client.rpc(op, { ...args, ...(mutation ? { operationId: randomUUID() } : {}) });
  }
  async function list(selfId) {
    await sync(); const r = await client.rpc('sessions.list'); if (!r.ok) throw new Error(r.text);
    const self = sessions.get(selfId)?.hubId;
    return r.sessions.map(s => ({ ...s, self: s.session === self, local: false, sameProcess: false, pid: 0, profile: s.device })).sort((a, b) => Number(b.self) - Number(a.self) || a.name.localeCompare(b.name));
  }
  async function listView(selfId, { all = false, limit = LIST_LIMIT } = {}) {
    const rows = await list(selfId), self = rows.filter(r => r.self), others = rows.filter(r => !r.self);
    return { entries: [...self, ...(all ? others : others.slice(0, limit))], hidden: all ? 0 : Math.max(0, others.length - limit) };
  }
  async function listText(selfId, options) { const r = await listView(selfId, options); return formatList(r.entries, { hidden: r.hidden }); }
  const core = {
    mode: 'hub', transport: { path: client.url }, client,
    async start() {
      if (started) return; started = true;
      try {
        await client.start(() => drain(), async () => { await sync(); }); await sync(); await drain();
        timer = setInterval(() => { void sync().then(drain).catch(() => {}); }, Math.max(100, hub.heartbeatMs || 10000)); timer.unref();
      } catch (error) { started = false; throw error; }
    },
    async stop() { if (!started) return; started = false; clearInterval(timer); await drainPromise; await consumeQueue; await client.stop(); },
    register, consume, flush: sync, ready: sync,
    noteUserMessage(sid) { return pending.has(sid) ? register({ ...pending.get(sid), hasUserMessage: true }) : sessions.get(sid); },
    unregister(sid) { pending.delete(sid); sessions.delete(sid); changed(); },
    setStatus(sid, status) { const s = sessions.get(sid) || pending.get(sid); if (s && s.status !== status) { s.status = status; changed(); } },
    setTitle(sid, title) { const s = sessions.get(sid); if (s && s.title !== title) { s.title = title; changed(); } },
    get: sid => sessions.has(sid) ? { ...sessions.get(sid) } : undefined,
    has: sid => sessions.has(sid), isPending: sid => pending.has(sid),
    list, listView, listText, peersText: listText,
    async rename(from, name) { const r = await call('rename', { from, name }); if (r.ok && sessions.has(from)) sessions.get(from).name = r.name; return r; },
    async protectionStatus(from) { const r = await call('protection', { from }); return r.ok ? r.directions : []; },
    resume: () => ({ ok: false, text: '中心模式的暂停由中心管理员恢复；请在中心界面操作。' }),
    request: args => call('request', args, true), reply: args => call('reply', args, true), waitFor: args => call('wait', args),
    async send(args) {
      const r = await call('send', args, true);
      return { ...r, ...(r.messageId ? { display: { version: 1, id: r.messageId, target: { name: args.to.replace(/^@/, ''), session: args.to }, text: args.text, outcome: 'accepted' } } : {}) };
    },
  };
  return core;
}
