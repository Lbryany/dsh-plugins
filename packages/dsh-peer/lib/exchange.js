import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';

export const REQUEST_CAPABILITY = 'request-result-v1';
// Same numbers as the Peer Hub centre (taskMs, rootMessages, rootDepth,
// parentIdleMs, three clarification rounds), so a task chain behaves the same
// whichever channel carries it.
export const EXCHANGE_LIMITS = Object.freeze({ taskMs: 600000, rootMessages: 24, rootDepth: 4, parentIdleMs: 300000, rounds: 3, tombstoneMs: 600000 });
const fail = (error, extra = {}) => ({ ok: false, wait: false, error, text: `请求未完成：${error}。不要自动重发；保留已有任务。`, ...extra });
const key = (session, id) => JSON.stringify([session, id]);
const active = r => r.state !== 'complete' || r.uncertain;
const uncertain = r => r?.uncertain || ['timeout','bad-response','delivery-pending'].includes(r?.error);
const restore = (r, previous) => { for (const k of Object.keys(r)) delete r[k]; Object.assign(r, previous); };
const TERMINAL = ['result', 'declined'];
const int = (v, max) => Number.isSafeInteger(v) && v >= 0 && v <= max;

// Each participant owns a separate record, even when both sessions share a Host.
// A task chain (root) carries its id, depth, message count and remaining time
// in every packet, so each participant enforces the same budget and deadline.
export function createExchange({ identity, resolve, transmit, admit, onExpire = () => {}, enabled = true, now = () => performance.now(), limits = {} }) {
  const cfg = { ...EXCHANGE_LIMITS, ...limits };
  const records = new Map(), tombstones = new Map(), roots = new Map(), context = new Map(); let lastTime = -Infinity;
  const clock = () => (lastTime = Math.max(lastTime, now()));
  // Expired records leave a tombstone (late replies get request-expired) and
  // the requester is told, like the centre's expiry notice.
  function prune() {
    const at = clock(), expired = [];
    for (const [k, r] of records) if (at >= r.expires) {
      records.delete(k); tombstones.set(k, at + cfg.tombstoneMs);
      if (r.role === 'requester' && active(r)) expired.push(r);
    }
    for (const [k, until] of tombstones) if (at >= until) tombstones.delete(k);
    for (const [id, root] of roots) if (at >= root.expires + cfg.tombstoneMs) roots.delete(id);
    for (const r of expired) { try { onExpire({ ...r, expiredFrom: r.state }); } catch { /* a notice never blocks pruning */ } }
  }
  function own(session, id) { prune(); return records.get(key(session, id)); }
  const describe = r => ({ requestId: r.id, peer: r.other.name, state: r.state, ...(r.uncertain ? { uncertain: true } : {}), ...(r.questionId ? { questionId: r.questionId } : {}) });
  const states = session => { prune(); return [...records.values()].filter(r => r.self.session === session && active(r)).map(describe); };
  const put = r => { prune(); if (records.size >= 512) return false; records.set(key(r.self.session, r.id), r); return true; };
  function validPeer(peer) { return peer?.instanceId && peer.capabilities?.includes(REQUEST_CAPABILITY); }
  function rootOf(r) {
    let root = roots.get(r.rootId);
    if (!root) { root = { count: 0, expires: r.expires }; roots.set(r.rootId, root); }
    return root;
  }
  // Every message of a chain uses one unit of its budget; a refusal is always deliverable.
  function charge(r, kind) {
    const root = rootOf(r);
    if (root.count >= cfg.rootMessages && kind !== 'declined') return null;
    root.count++;
    return { root, undo() { root.count = Math.max(0, root.count - 1); } };
  }
  function packet(r, kind, text, questionId, root) {
    return { v: 1, type: 'exchange', id: randomUUID(), requestId: r.id, kind, text,
      from: r.self, to: { session: r.other.session, instanceId: r.other.instanceId }, ...(questionId ? { questionId } : {}),
      root: { id: r.rootId, depth: r.depth, count: root.count, ttl: Math.max(0, Math.round(r.expires - clock())) } };
  }
  async function send(other, packet) {
    try {
      const response = await transmit(other, packet);
      return response && typeof response.ok === 'boolean' && (response.ok || typeof response.error === 'string') ? response : { ok: false, error: 'bad-response', uncertain: true };
    } catch { return { ok: false, error: 'delivery-uncertain', uncertain: true }; }
  }
  const touch = r => { if (r) r.touchedAt = clock(); };
  // The incoming task a new request continues: explicit parentRequestId, or the
  // one task this session is actively handling (same rule as the centre).
  function parentFor(from, explicit) {
    prune();
    const at = clock(), all = [...records.values()];
    const incoming = all.filter(r => r.role === 'responder' && r.self.session === from && ['working', 'awaiting-answer'].includes(r.state));
    if (explicit !== undefined) {
      const parent = incoming.find(r => r.id === explicit);
      return parent ? { parent } : { error: 'invalid-parent' };
    }
    const live = r => at - (r.touchedAt ?? 0) < cfg.parentIdleMs || all.some(c => c.parentId === r.id && c.role === 'requester' && active(c));
    const current = incoming.filter(live);
    const chosen = current.find(r => r.id === context.get(from));
    if (chosen) return { parent: chosen };
    if (current.length > 1) return { error: 'ambiguous-parent' };
    return { parent: current[0] || null };
  }
  async function request({ from, requests, to, text, wait = true, parentRequestId }) {
    if (!enabled) return fail('unsupported');
    const self = identity(from); if (!self) return fail('not-registered');
    if (requests !== undefined && (to !== undefined || text !== undefined)) return fail('bad-request');
    if (requests === undefined) requests = [{ to, text }];
    if (!Array.isArray(requests) || requests.length < 1 || requests.length > 8 || requests.some(item =>
      !item || typeof item.to !== 'string' || !item.to.trim() || typeof item.text !== 'string' || !item.text.trim())) return fail('bad-request');
    if (parentRequestId !== undefined && typeof parentRequestId !== 'string') return fail('bad-request');
    const results = [];
    for (const item of requests) {
      if (!item || typeof item.text !== 'string' || !item.text.trim()) { results.push(fail('bad-request')); continue; }
      const found = resolve(item.to, from), other = found.target;
      if (!other) { results.push(fail(found.error)); continue; }
      if (other.session === from) { results.push(fail('self')); continue; }
      if (!validPeer(other)) { results.push(fail('unsupported')); continue; }
      prune();
      const pending = [...records.values()].find(r => r.role === 'requester' && r.self.session === from && r.other.session === other.session && active(r));
      if (pending) { results.push(fail('request-pending', describe(pending))); continue; }
      const lineage = parentFor(from, parentRequestId); if (lineage.error) { results.push(fail(lineage.error)); continue; }
      const parent = lineage.parent, depth = parent ? parent.depth + 1 : 0, at = clock();
      if (parent && at >= parent.expires) { results.push(fail('request-expired')); continue; }
      if (depth > cfg.rootDepth) { results.push(fail('root-depth')); continue; }
      const id = randomUUID();
      const r = { id, role: 'requester', self, other, state: 'pending', rounds: 0, rootId: parent?.rootId || id, depth,
        ...(parent ? { parentId: parent.id } : {}), touchedAt: at, expires: parent ? Math.min(parent.expires, at + cfg.taskMs) : at + cfg.taskMs };
      const unit = charge(r, 'request'); if (!unit) { results.push(fail('root-budget')); continue; }
      if (!put(r)) { unit.undo(); results.push(fail('request-capacity')); continue; }
      touch(parent);
      const revision = r.revision || 0;
      const response = await send(other, packet(r, 'request', item.text, undefined, unit.root));
      if (!response.ok) {
        if ((r.revision || 0) === revision) { if (uncertain(response)) r.uncertain = true; else { records.delete(key(from, r.id)); unit.undo(); } }
        results.push(fail(response.error, { ...describe(r), uncertain: !!uncertain(response) }));
      } else results.push({ ok: true, ...describe(r) });
    }
    const ok = results.every(r => r.ok);
    return { ok, wait: ok && wait !== false, ...(ok ? {} : { error: results.find(r => !r.ok).error }), requests: results,
      text: JSON.stringify(results.map((r, i) => ({ to: requests[i].to, ...r }))) + (ok ? '' : '\n已接纳项继续执行；未知回执保留，不自动重发。') };
  }
  async function reply({ from, requestId, kind, text, questionId, wait = true }) {
    if (!enabled) return fail('unsupported');
    const r = own(from, requestId);
    if (!r) return fail(tombstones.has(key(from, requestId)) ? 'request-expired' : 'unknown-request');
    if (typeof text !== 'string' || !text.trim()) return fail('bad-request');
    if (r.uncertain) return fail('delivery-uncertain', describe(r));
    if (r.state === 'complete' && TERMINAL.includes(kind) && r.role === 'responder' && kind === r.finalKind && text === r.finalText)
      return { ok: true, wait: false, duplicate: true, requestId, text: kind === 'result' ? '结果已交付；未重复投递。' : '拒绝已交付；未重复投递。' };
    // declined: the responder will not or cannot do the task. Terminal like
    // result, and may also end a task that is waiting on an answer.
    const allowed = kind === 'question' ? r.role === 'responder' && r.state === 'working' && r.rounds < cfg.rounds
      : kind === 'answer' ? r.role === 'requester' && r.state === 'question' && questionId === r.questionId
      : kind === 'result' ? r.role === 'responder' && r.state === 'working'
      : kind === 'declined' ? r.role === 'responder' && ['working', 'awaiting-answer'].includes(r.state) : false;
    if (!allowed) return fail(['question', 'answer', 'result', 'declined'].includes(kind) ? 'invalid-reply-state' : 'bad-reply-kind', describe(r));
    const current = resolve(r.other.session, from).target;
    if (!validPeer(current) || current.instanceId !== r.other.instanceId) return fail('stale-peer');
    const unit = charge(r, kind); if (!unit) return fail('root-budget', describe(r));
    const previous = { ...r };
    if (kind === 'question') { r.questionId = randomUUID(); r.rounds++; r.state = 'awaiting-answer'; touch(r); }
    else if (kind === 'answer') r.state = 'pending';
    else { r.state = 'complete'; r.finalText = text; r.finalKind = kind; }
    const revision = r.revision || 0;
    const response = await send(current, packet(r, kind, text, r.questionId, unit.root));
    if (!response.ok) {
      // A lost acknowledgement may already have advanced the remote participant.
      if ((r.revision || 0) === revision) { if (uncertain(response)) r.uncertain = true; else { restore(r, previous); unit.undo(); } }
      return fail(response.error, { ...describe(r), uncertain: !!uncertain(response) });
    }
    return { ok: true, wait: wait !== false, ...describe(r), text: JSON.stringify(describe(r)) };
  }
  function receive(req) {
    if (!enabled) return fail('unsupported');
    if (!req || req.type !== 'exchange' || req.v !== 1 || typeof req.requestId !== 'string' || req.requestId.length > 64
      || typeof req.text !== 'string' || !req.text.trim() || typeof req.id !== 'string' || req.id.length > 64) return fail('bad-request');
    // 0.3 peers send no root; their packet is its own root.
    const chain = req.root === undefined ? { id: req.requestId, depth: 0, count: 0, ttl: cfg.taskMs } : req.root;
    if (!chain || typeof chain.id !== 'string' || !chain.id || chain.id.length > 64 || !int(chain.depth, 64) || !int(chain.count, 1e6) || !int(chain.ttl, 1e9)) return fail('bad-request');
    if (chain.depth > cfg.rootDepth) return fail('root-depth');
    if (chain.count > cfg.rootMessages && req.kind !== 'declined') return fail('root-budget');
    const self = identity(req.to?.session);
    if (!self || self.instanceId !== req.to?.instanceId) return fail('stale-peer');
    const other = resolve(req.from?.session, self.session).target;
    if (!validPeer(other) || other.instanceId !== req.from?.instanceId || other.session === self.session) return fail('stale-peer');
    let r = own(self.session, req.requestId), fresh = false;
    if (req.kind === 'request') {
      if (r) return fail('duplicate-request');
      if (tombstones.has(key(self.session, req.requestId))) return fail('request-expired');
      const at = clock();
      r = { id: req.requestId, role: 'responder', self, other, state: 'working', queued: 'request', rounds: 0, rootId: chain.id, depth: chain.depth,
        touchedAt: at, expires: at + Math.min(chain.ttl, cfg.taskMs) };
      if (!put(r)) return fail('request-capacity'); fresh = true;
    } else if (!r) return fail(tombstones.has(key(self.session, req.requestId)) ? 'request-expired' : 'unknown-request');
    else if (r.other.session !== other.session || r.other.instanceId !== other.instanceId) return fail('unknown-request');
    const previous = { ...r };
    if (!fresh) {
      if (req.kind === 'question' && r.role === 'requester' && ['pending','uncertain'].includes(r.state) && r.rounds < cfg.rounds && typeof req.questionId === 'string' && req.questionId.length <= 64) {
        r.state = 'question'; r.questionId = req.questionId; r.rounds++; r.queued = 'question';
      } else if (req.kind === 'answer' && r.role === 'responder' && r.state === 'awaiting-answer' && r.questionId === req.questionId) {
        r.state = 'working'; r.queued = 'answer';
      } else if (TERMINAL.includes(req.kind) && r.role === 'requester' && ['pending','uncertain', ...(req.kind === 'declined' ? ['question'] : [])].includes(r.state)) {
        r.state = 'queued-result'; r.queued = req.kind;
      } else return fail('invalid-reply-state');
    }
    r.revision = (r.revision || 0) + 1;
    delete r.uncertain;
    const root = rootOf(r), count = root.count; root.count = Math.max(root.count, chain.count);
    const response = admit(req, { requestId: r.id, kind: req.kind, ...(req.questionId ? { questionId: req.questionId } : {}), pending: states(self.session).filter(s => s.requestId !== r.id) });
    if (!response.ok) { root.count = count; if (fresh) records.delete(key(self.session, r.id)); else restore(r, previous); }
    return response;
  }
  function consume(session, source) {
    if (source?.kind !== 'dsh-peer' || source.display?.version !== 2) return;
    const r = own(session, source.exchange?.requestId);
    if (!r || r.other.session !== source.peer?.session || r.queued !== source.exchange.kind) return;
    r.revision = (r.revision || 0) + 1;
    delete r.queued;
    if (r.state === 'queued-result') r.state = 'complete';
    // Reading a task or an answer makes it the session's current task;
    // reading a delegate's reply keeps the parent task alive.
    if (r.role === 'responder') { touch(r); context.set(session, r.id); }
    else if (r.parentId) touch(own(session, r.parentId));
  }
  function waitFor({ from, requestIds }) {
    if (!enabled) return fail('unsupported');
    if (!identity(from)) return fail('not-registered');
    if (requestIds !== undefined && (!Array.isArray(requestIds) || requestIds.length > 512)) return fail('bad-request');
    prune();
    const selected = requestIds === undefined ? [...records.values()].filter(r => r.self.session === from && active(r)) : requestIds.map(id => own(from, id));
    if (selected.some(r => !r)) return fail('unknown-request');
    const waiting = selected.filter(active), queued = waiting.some(r => r.queued);
    const canWait = waiting.length > 0 && waiting.every(r => r.queued || ['pending','awaiting-answer'].includes(r.state));
    return { ok: true, wait: canWait, requests: waiting.map(describe), text: JSON.stringify({ requests: waiting.map(describe), instruction: canWait ? (queued ? '让出本轮，由宿主消费已排队消息；任务尚未全部完成。' : '等待远端工作；不催问。') : waiting.length ? '仍有本地待办，继续处理后再等待。' : '无需等待远端；继续当前工作或向用户汇总。' }) };
  }
  // Whether this channel knows the request (live or recently expired): replies follow the channel the task came on.
  const has = (session, id) => !!own(session, id) || tombstones.has(key(session, id));
  return { request, reply, receive, consume, waitFor, has, sweep: prune, limits: cfg, clear: () => { records.clear(); tombstones.clear(); roots.clear(); context.clear(); } };
}
