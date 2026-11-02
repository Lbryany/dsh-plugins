import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';

export const REQUEST_CAPABILITY = 'request-result-v1';
const fail = (error, extra = {}) => ({ ok: false, wait: false, error, text: `请求未完成：${error}。不要自动重发；保留已有任务。`, ...extra });
const key = (session, id) => JSON.stringify([session, id]);
const active = r => r.state !== 'complete' || r.uncertain;
const uncertain = r => r?.uncertain || ['timeout','bad-response','delivery-pending'].includes(r?.error);
const restore = (r, previous) => { for (const k of Object.keys(r)) delete r[k]; Object.assign(r, previous); };

// Each participant owns a separate record, even when both sessions share a Host.
export function createExchange({ identity, resolve, transmit, admit, enabled = true, now = () => performance.now() }) {
  const records = new Map(); let lastTime = -Infinity;
  const clock = () => (lastTime = Math.max(lastTime, now()));
  function prune() { const at = clock(); for (const [k, r] of records) if (at >= r.expires) records.delete(k); }
  function own(session, id) { prune(); return records.get(key(session, id)); }
  const describe = r => ({ requestId: r.id, peer: r.other.name, state: r.state, ...(r.uncertain ? { uncertain: true } : {}), ...(r.questionId ? { questionId: r.questionId } : {}) });
  const states = session => { prune(); return [...records.values()].filter(r => r.self.session === session && active(r)).map(describe); };
  const put = r => { prune(); if (records.size >= 512) return false; records.set(key(r.self.session, r.id), r); return true; };
  function validPeer(peer) { return peer?.instanceId && peer.capabilities?.includes(REQUEST_CAPABILITY); }
  function packet(r, kind, text, questionId) {
    return { v: 1, type: 'exchange', id: randomUUID(), requestId: r.id, kind, text,
      from: r.self, to: { session: r.other.session, instanceId: r.other.instanceId }, ...(questionId ? { questionId } : {}) };
  }
  async function send(other, packet) {
    try {
      const response = await transmit(other, packet);
      return response && typeof response.ok === 'boolean' && (response.ok || typeof response.error === 'string') ? response : { ok: false, error: 'bad-response', uncertain: true };
    } catch { return { ok: false, error: 'delivery-uncertain', uncertain: true }; }
  }
  async function request({ from, requests, to, text, wait = true }) {
    if (!enabled) return fail('unsupported');
    const self = identity(from); if (!self) return fail('not-registered');
    if (requests !== undefined && (to !== undefined || text !== undefined)) return fail('bad-request');
    if (requests === undefined) requests = [{ to, text }];
    if (!Array.isArray(requests) || requests.length < 1 || requests.length > 8 || requests.some(item =>
      !item || typeof item.to !== 'string' || !item.to.trim() || typeof item.text !== 'string' || !item.text.trim())) return fail('bad-request');
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
      const r = { id: randomUUID(), role: 'requester', self, other, state: 'pending', rounds: 0, expires: clock() + 600000 };
      if (!put(r)) { results.push(fail('request-capacity')); continue; }
      const revision = r.revision || 0;
      const response = await send(other, packet(r, 'request', item.text));
      if (!response.ok) {
        if ((r.revision || 0) === revision) { if (uncertain(response)) r.uncertain = true; else records.delete(key(from, r.id)); }
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
    if (!r) return fail('unknown-request');
    if (typeof text !== 'string' || !text.trim()) return fail('bad-request');
    if (r.uncertain) return fail('delivery-uncertain', describe(r));
    if (r.state === 'complete' && kind === 'result' && r.role === 'responder' && text === r.finalText)
      return { ok: true, wait: false, duplicate: true, requestId, text: '结果已交付；未重复投递。' };
    const allowed = kind === 'question' ? r.role === 'responder' && r.state === 'working' && r.rounds < 3
      : kind === 'answer' ? r.role === 'requester' && r.state === 'question' && questionId === r.questionId
      : kind === 'result' ? r.role === 'responder' && r.state === 'working' : false;
    if (!allowed) return fail('invalid-reply-state', describe(r));
    const current = resolve(r.other.session, from).target;
    if (!validPeer(current) || current.instanceId !== r.other.instanceId) return fail('stale-peer');
    const previous = { ...r };
    if (kind === 'question') { r.questionId = randomUUID(); r.rounds++; r.state = 'awaiting-answer'; }
    else if (kind === 'answer') r.state = 'pending';
    else { r.state = 'complete'; r.finalText = text; }
    const revision = r.revision || 0;
    const response = await send(current, packet(r, kind, text, r.questionId));
    if (!response.ok) {
      // A lost acknowledgement may already have advanced the remote participant.
      if ((r.revision || 0) === revision) { if (uncertain(response)) r.uncertain = true; else restore(r, previous); }
      return fail(response.error, { ...describe(r), uncertain: !!uncertain(response) });
    }
    return { ok: true, wait: wait !== false, ...describe(r), text: JSON.stringify(describe(r)) };
  }
  function receive(req) {
    if (!enabled) return fail('unsupported');
    if (!req || req.type !== 'exchange' || req.v !== 1 || typeof req.requestId !== 'string' || req.requestId.length > 64
      || typeof req.text !== 'string' || !req.text.trim() || typeof req.id !== 'string' || req.id.length > 64) return fail('bad-request');
    const self = identity(req.to?.session);
    if (!self || self.instanceId !== req.to?.instanceId) return fail('stale-peer');
    const other = resolve(req.from?.session, self.session).target;
    if (!validPeer(other) || other.instanceId !== req.from?.instanceId || other.session === self.session) return fail('stale-peer');
    let r = own(self.session, req.requestId), fresh = false;
    if (req.kind === 'request') {
      if (r) return fail('duplicate-request');
      r = { id: req.requestId, role: 'responder', self, other, state: 'working', queued: 'request', rounds: 0, expires: clock() + 600000 };
      if (!put(r)) return fail('request-capacity'); fresh = true;
    } else if (!r || r.other.session !== other.session || r.other.instanceId !== other.instanceId) return fail('unknown-request');
    const previous = { ...r };
    if (!fresh) {
      if (req.kind === 'question' && r.role === 'requester' && ['pending','uncertain'].includes(r.state) && r.rounds < 3 && typeof req.questionId === 'string' && req.questionId.length <= 64) {
        r.state = 'question'; r.questionId = req.questionId; r.rounds++; r.queued = 'question';
      } else if (req.kind === 'answer' && r.role === 'responder' && r.state === 'awaiting-answer' && r.questionId === req.questionId) {
        r.state = 'working'; r.queued = 'answer';
      } else if (req.kind === 'result' && r.role === 'requester' && ['pending','uncertain'].includes(r.state)) {
        r.state = 'queued-result'; r.queued = 'result';
      } else return fail('invalid-reply-state');
    }
    r.revision = (r.revision || 0) + 1;
    delete r.uncertain;
    const response = admit(req, { requestId: r.id, kind: req.kind, ...(req.questionId ? { questionId: req.questionId } : {}), pending: states(self.session).filter(s => s.requestId !== r.id) });
    if (!response.ok) { if (fresh) records.delete(key(self.session, r.id)); else restore(r, previous); }
    return response;
  }
  function consume(session, source) {
    if (source?.kind !== 'dsh-peer' || source.display?.version !== 2) return;
    const r = own(session, source.exchange?.requestId);
    if (!r || r.other.session !== source.peer?.session || r.queued !== source.exchange.kind) return;
    r.revision = (r.revision || 0) + 1;
    delete r.queued;
    if (r.state === 'queued-result') r.state = 'complete';
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
  return { request, reply, receive, consume, waitFor, clear: () => records.clear() };
}
