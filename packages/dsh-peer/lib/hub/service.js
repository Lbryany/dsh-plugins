import { createHash, randomBytes, randomUUID } from 'node:crypto';

export const HUB_VERSION = 1;
const NAME = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const validName = value => typeof value === 'string' && NAME.test(value);
const hash = value => createHash('sha256').update(value).digest('hex');
const id = () => randomUUID();
const secret = () => randomBytes(32).toString('base64url');
const fail = error => ({ ok: false, wait: false, error, text: `中心未受理：${error}。停止自动发送，不创建新任务重试。` });
const ok = extra => ({ ok: true, ...extra });
const str = (v, max = 256) => typeof v === 'string' && v.length > 0 && v.length <= max;
const finished = r => ['complete', 'expired', 'failed'].includes(r.state);
const keyOf = (device, session) => `${device}:${session}`;

export class HubError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}

export function createHubService({ store, adminToken, now = Date.now, limits = {} }) {
  const cfg = { shortMs: 60000, shortLimit: 6, longMs: 600000, longLimit: 12, dedupMs: 60000,
    rootMessages: 24, rootDepth: 4, taskMs: 600000, messageMs: 86400000, leaseMs: 45000,
    maxMessages: 10000, maxSessions: 1024, ...limits };
  for (const [k, v] of Object.entries(cfg)) if (!Number.isSafeInteger(v) || v < 1) throw new Error(`Invalid hub limit ${k}`);
  let at;
  const rows = (kind, workspace) => store.all(kind).filter(r => r.workspace === workspace);
  function authenticate(token) {
    if (str(token, 512) && hash(token) === hash(adminToken)) return { admin: true };
    const device = store.all('device').find(d => !d.revoked && hash(token || '') === d.tokenHash);
    if (!device) throw new HubError('unauthorized', 401);
    return device;
  }
  function current(device, generation) {
    const d = store.get('device', device.id);
    if (!d || d.revoked) throw new HubError('unauthorized', 401);
    if (!str(generation, 128) || d.generation !== generation || !d.connected) throw new HubError('stale-generation', 409);
    return d;
  }
  function session(device, nativeId) {
    if (!str(nativeId, 160)) return null;
    const s = store.get('session', keyOf(device.id, nativeId));
    return s && s.active && s.generation === device.generation ? s : null;
  }
  function view(s) {
    const d = store.get('device', s.deviceId);
    const online = !!d && !d.revoked && d.connected && s.active && s.generation === d.generation && at - d.lastSeen < cfg.leaseMs;
    return { session: s.id, nativeSession: s.nativeId, name: s.name, runtime: s.runtime, deviceId: s.deviceId,
      device: d?.name, online, status: online ? s.status : 'offline', cwd: s.cwd, title: s.title,
      capabilities: ['request-result-v1', 'hub-v1'], lastActiveAt: s.lastActiveAt };
  }
  function target(device, address) {
    if (!str(address)) return { error: 'unknown-peer' };
    const value = address.replace(/^@/, '');
    const sessions = rows('session', device.workspace).filter(s => !store.get('device', s.deviceId)?.revoked);
    const exact = sessions.find(s => s.id === value || s.name === value);
    if (exact) return { target: exact };
    const prefix = value.replace(/^session-/, '');
    const hits = prefix.length >= 4 ? sessions.filter(s => s.nativeId.replace(/^session-/, '').startsWith(prefix)) : [];
    return hits.length === 1 ? { target: hits[0] } : { error: hits.length ? 'ambiguous-peer' : 'unknown-peer' };
  }
  function uniqueName(workspace, name, except) {
    const names = new Set(rows('session', workspace).filter(s => s.id !== except).map(s => s.name));
    if (!names.has(name)) return name;
    for (let n = 2; ; n++) { const suffix = `-${n}`, next = name.slice(0, 40 - suffix.length) + suffix; if (!names.has(next)) return next; }
  }
  function snapshots(s) { return { session: s.id, name: s.name, nativeSession: s.nativeId, deviceId: s.deviceId, runtime: s.runtime, cwd: s.cwd, pid: 0, profile: null }; }
  function requestsFor(s) {
    return rows('request', s.workspace).filter(r => !finished(r) && [r.requester, r.responder].includes(s.id));
  }
  function describe(r, self) {
    const other = store.get('session', r.requester === self.id ? r.responder : r.requester);
    return { requestId: r.id, rootId: r.rootId, peer: other?.name, state: r.state, ...(r.questionId ? { questionId: r.questionId } : {}) };
  }
  function expire(workspace) {
    for (const r of rows('request', workspace)) if (!finished(r) && at >= r.expires) { r.state = 'expired'; store.put('request', r.id, r); }
    for (const m of rows('message', workspace)) if (m.expires <= at && ['queued', 'claimed'].includes(m.state)) {
      m.state = m.state === 'claimed' ? 'unknown' : 'failed'; m.error = 'expired'; store.put('message', m.id, m);
    }
  }
  function protect(from, to, text, scope = '') {
    const key = `${from.id}>${to.id}`;
    const s = store.get('direction', key) || { id: key, workspace: from.workspace, from: from.id, to: to.id, times: [], fingerprints: [], paused: false };
    s.times = s.times.filter(t => at - t < cfg.longMs);
    s.fingerprints = s.fingerprints.filter(f => at - f.time < cfg.dedupMs);
    if (s.paused) return fail('conversation-paused');
    const fingerprint = hash(scope + '\0' + text);
    if (s.fingerprints.some(f => f.hash === fingerprint)) return fail('duplicate-content');
    if (s.times.length >= cfg.longLimit) { s.paused = true; store.put('direction', key, s); return fail('conversation-paused'); }
    if (s.times.filter(t => at - t < cfg.shortMs).length >= cfg.shortLimit) return fail('rate-limited');
    s.times.push(at); s.fingerprints.push({ hash: fingerprint, time: at }); store.put('direction', key, s);
    return ok();
  }
  function enqueue(from, to, text, r, kind, questionId) {
    if (!str(text, 60000) || !text.trim()) return fail('bad-request');
    if (from.id === to.id) return fail('self');
    if (rows('message', from.workspace).length >= cfg.maxMessages) return fail('queue-capacity');
    const root = r && (store.get('root', r.rootId) || { id: r.rootId, workspace: from.workspace, count: 0, expires: r.expires });
    if (root && at >= root.expires) return fail('request-expired');
    if (root && root.count >= cfg.rootMessages) return fail('root-budget');
    const admission = protect(from, to, text, r ? `${r.id}:${kind}:${questionId || ''}` : 'send');
    if (!admission.ok) return admission;
    const m = { id: id(), workspace: from.workspace, from: snapshots(from), to: snapshots(to), text, state: 'queued', createdAt: at,
      expires: root?.expires || at + cfg.messageMs,
      ...(r ? { exchange: { requestId: r.id, rootId: r.rootId, kind, ...(questionId ? { questionId } : {}) } } : {}) };
    store.put('message', m.id, m);
    if (root) { root.count++; store.put('root', root.id, root); }
    return ok({ messageId: m.id, delivered: 'accepted', text: `中心已受理，等待 @${to.name} 接收；不代表任务完成。` });
  }
  function operation(device, args, op, fn) {
    if (!str(args.operationId, 128)) return fail('operation-id-required');
    const key = `${device.id}:${args.operationId}`, digest = hash(JSON.stringify({ op, args }));
    const previous = store.get('operation', key);
    if (previous) return previous.hash === digest ? previous.result : fail('idempotency-conflict');
    if (rows('operation', device.workspace).length >= cfg.maxMessages * 2) return fail('operation-capacity');
    const result = fn();
    if ((result.ok || result.requests?.some(r => r.ok)) && (op !== 'inbox.claim' || result.messages?.length)) store.put('operation', key, { id: key, workspace: device.workspace, hash: digest, result });
    return result;
  }
  function parentFor(self, explicit) {
    // The centre derives parentage from the last consumed incoming request.
    // Omitting a client-supplied parent can never mint a fresh budget mid-task.
    const incoming = requestsFor(self).filter(r => r.responder === self.id);
    if (explicit !== undefined) {
      const parent = incoming.find(r => r.id === explicit);
      return parent ? { parent } : { error: 'invalid-parent' };
    }
    const current = incoming.find(r => r.id === self.contextRequest);
    if (current) return { parent: current };
    if (incoming.length > 1) return { error: 'ambiguous-parent' };
    return { parent: incoming[0] || null };
  }
  function makeRequest(device, self, item, parentRequestId) {
    const found = target(device, item.to); if (!found.target) return fail(found.error);
    const to = found.target;
    if (to.id === self.id) return fail('self');
    if (requestsFor(self).some(r => r.requester === self.id && r.responder === to.id)) return fail('request-pending');
    const lineage = parentFor(self, parentRequestId); if (lineage.error) return fail(lineage.error);
    const parent = lineage.parent, depth = parent ? parent.depth + 1 : 0;
    if (depth > cfg.rootDepth) return fail('root-depth');
    const requestId = id();
    const r = { id: requestId, workspace: self.workspace, requester: self.id, responder: to.id, rootId: parent?.rootId || requestId,
      parentId: parent?.id, depth, state: 'working', rounds: 0, createdAt: at, expires: parent?.expires || at + cfg.taskMs };
    const queued = enqueue(self, to, item.text, r, 'request'); if (!queued.ok) return queued;
    r.lastMessage = queued.messageId; store.put('request', r.id, r);
    return ok({ ...describe(r, self), messageId: queued.messageId });
  }
  function reply(device, self, args) {
    const r = store.get('request', args.requestId);
    if (!r || r.workspace !== device.workspace || ![r.requester, r.responder].includes(self.id)) return fail('unknown-request');
    if (at >= r.expires || r.state === 'expired') return fail('request-expired');
    const responder = r.responder === self.id;
    if (['result-queued', 'complete'].includes(r.state) && responder && args.kind === 'result' && args.text === r.finalText)
      return ok({ duplicate: true, wait: false, requestId: r.id, text: '结果已交付；未重复投递。' });
    const allowed = args.kind === 'question' ? responder && r.state === 'working' && r.rounds < 3
      : args.kind === 'answer' ? !responder && r.state === 'question' && args.questionId === r.questionId
      : args.kind === 'result' ? responder && r.state === 'working' : false;
    if (!allowed) return fail('invalid-reply-state');
    const to = store.get('session', responder ? r.requester : r.responder);
    if (store.get('device', to.deviceId)?.revoked) return fail('revoked-peer');
    const questionId = args.kind === 'question' ? id() : args.kind === 'answer' ? args.questionId : undefined;
    const result = enqueue(self, to, args.text, r, args.kind, questionId); if (!result.ok) return result;
    if (args.kind === 'question') { r.state = 'question'; r.rounds++; r.questionId = questionId; }
    else if (args.kind === 'answer') r.state = 'working';
    else { r.state = 'result-queued'; r.finalText = args.text; }
    r.lastMessage = result.messageId; store.put('request', r.id, r);
    return ok({ ...describe(r, self), wait: args.wait !== false, messageId: result.messageId, text: `中心已受理 ${args.kind}；让出本轮，纯确认无需回复。` });
  }
  function run(auth, op, args = {}, generation) {
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw new HubError('bad-request');
    return store.transaction(() => {
      at = Math.max(now(), store.get('meta', 'clock')?.at || 0); store.put('meta', 'clock', { at });
      if (auth.admin) {
        if (op === 'device.create') {
          const workspace = args.workspace === undefined ? 'default' : args.workspace;
          if (!validName(args.name) || !validName(workspace)) return fail('bad-name');
          const token = secret(), deviceId = id();
          store.put('device', deviceId, { id: deviceId, workspace, name: args.name, tokenHash: hash(token), connected: false, lastSeen: 0 });
          return ok({ credential: { deviceId, workspace, token } });
        }
        if (op === 'device.revoke') { const d = store.get('device', args.deviceId); if (!d) return fail('unknown-device'); d.revoked = true; d.connected = false; store.put('device', d.id, d); return ok(); }
        if (op === 'resume') {
          const key = `${args.from}>${args.to}`; store.delete('direction', key); return ok({ text: '已恢复此方向；未重放消息。' });
        }
        if (op === 'inspect') return ok({ devices: store.all('device').map(({ tokenHash: _t, ...d }) => d),
          sessions: store.all('session').map(view), messages: store.all('message'), requests: store.all('request'), directions: store.all('direction') });
        throw new HubError('admin-operation-required', 403);
      }
      let device = store.get('device', auth.id);
      if (!device || device.revoked) throw new HubError('unauthorized', 401);
      if (['device.create', 'device.revoke', 'inspect', 'resume'].includes(op)) throw new HubError('forbidden', 403);
      if (op === 'connect') {
        if (!str(generation, 128)) return fail('generation-required');
        if (device.connected && device.generation !== generation && at - device.lastSeen < cfg.leaseMs) return fail('device-in-use');
        device.generation = generation; device.connected = true; device.lastSeen = at; store.put('device', device.id, device); return ok();
      }
      device = current(device, generation); device.lastSeen = at; store.put('device', device.id, device);
      expire(device.workspace);
      if (op === 'disconnect') { device.connected = false; store.put('device', device.id, device); return ok(); }
      if (op === 'sessions.sync') {
        if (!Array.isArray(args.sessions) || args.sessions.length > cfg.maxSessions || args.sessions.some(s => !s || !str(s.id, 160) || !validName(s.name) || !['dsh', 'claude-code'].includes(s.runtime || 'dsh'))) return fail('bad-registration');
        const old = rows('session', device.workspace), ids = new Set(args.sessions.map(s => keyOf(device.id, s.id)));
        if (new Set([...old.map(s => s.id), ...ids]).size > cfg.maxSessions) return fail('session-capacity');
        for (const s of old) if (s.deviceId === device.id && !ids.has(s.id)) { s.active = false; store.put('session', s.id, s); }
        const result = [];
        for (const s of args.sessions) {
          const key = keyOf(device.id, s.id), previous = store.get('session', key);
          const value = { ...previous, id: key, nativeId: s.id, deviceId: device.id, workspace: device.workspace, generation,
            name: previous?.name || uniqueName(device.workspace, s.name, key), runtime: s.runtime || 'dsh',
            cwd: typeof s.cwd === 'string' ? s.cwd.slice(0, 1024) : null, title: typeof s.title === 'string' ? s.title.slice(0, 256) : null,
            status: ['idle', 'running', 'waiting', 'error'].includes(s.status) ? s.status : 'idle', active: true, lastActiveAt: at };
          store.put('session', key, value); result.push(view(value));
        }
        return ok({ sessions: result });
      }
      if (op === 'sessions.list') return ok({ sessions: rows('session', device.workspace).filter(s => !store.get('device', s.deviceId)?.revoked).map(view) });
      const self = session(device, args.from); if (!self) return fail('not-registered');
      if (op === 'rename') {
        if (!validName(args.name)) return fail('bad-name');
        self.name = uniqueName(device.workspace, args.name, self.id); store.put('session', self.id, self);
        return ok({ name: self.name, text: `本会话的 peer 名字是 ${self.name}。` });
      }
      if (op === 'protection') return ok({ directions: rows('direction', device.workspace).filter(d => d.to === self.id) });
      if (op === 'send') return operation(device, args, op, () => {
        const found = target(device, args.to); if (!found.target) return fail(found.error);
        if (args.steer) return fail('hub-steer-unsupported');
        const lineage = parentFor(self); if (lineage.error) return fail(lineage.error);
        const parent = lineage.parent;
        return enqueue(self, found.target, args.text, parent, parent ? 'note' : undefined);
      });
      if (op === 'request') return operation(device, args, op, () => {
        if (args.requests !== undefined && (args.to !== undefined || args.text !== undefined)) return fail('bad-request');
        const items = args.requests === undefined ? [{ to: args.to, text: args.text }] : args.requests;
        if (!Array.isArray(items) || items.length < 1 || items.length > 8 || items.some(v => !v || !str(v.to) || !str(v.text, 60000) || !v.text.trim())) return fail('bad-request');
        const results = items.map(item => makeRequest(device, self, item, args.parentRequestId)), success = results.every(r => r.ok);
        return { ok: success, wait: success && args.wait !== false, ...(success ? {} : { error: results.find(r => !r.ok).error }), requests: results,
          text: JSON.stringify(results) + (success ? '\n中心已受理；等待结果，不催问。' : '\n已受理项继续；失败项不自动重发。') };
      });
      if (op === 'reply') return operation(device, args, op, () => reply(device, self, args));
      if (op === 'wait') {
        if (args.requestIds !== undefined && (!Array.isArray(args.requestIds) || args.requestIds.length > 512 || args.requestIds.some(v => !str(v)))) return fail('bad-request');
        const selected = args.requestIds === undefined ? requestsFor(self) : args.requestIds.map(requestId => store.get('request', requestId));
        if (selected.some(r => !r || r.workspace !== device.workspace || ![r.requester, r.responder].includes(self.id))) return fail('unknown-request');
        const active = selected.filter(r => !finished(r));
        const wait = active.length > 0 && active.every(r => {
          const message = store.get('message', r.lastMessage);
          if (message?.to.session === self.id && ['queued', 'claimed', 'delivered'].includes(message.state)) return true;
          return r.requester === self.id ? r.state !== 'question' : r.state === 'question';
        });
        return ok({ wait, requests: active.map(r => describe(r, self)), text: wait ? '等待远端任务或宿主消费排队消息，不催问。' : '继续本地待办或向用户汇总。' });
      }
      if (op === 'inbox.peek') return ok({ messages: rows('message', device.workspace).filter(m => m.to.session === self.id && ['queued', 'claimed', 'unknown'].includes(m.state)).map(m => ({ id: m.id, state: m.state })).slice(0, 100) });
      if (op === 'inbox.claim') {
        const claim = () => {
        const own = rows('message', device.workspace).filter(m => m.to.session === self.id);
        const fresh = own.filter(m => m.state === 'queued').slice(0, 16);
        const recovery = own.filter(m => ['claimed', 'unknown'].includes(m.state));
        const offset = recovery.length ? (self.recoveryOffset || 0) % recovery.length : 0;
        const checked = [...recovery.slice(offset), ...recovery.slice(0, offset)].slice(0, 16 - fresh.length);
        self.recoveryOffset = recovery.length ? (offset + checked.length) % recovery.length : 0; store.put('session', self.id, self);
        const pending = [...fresh, ...checked];
        const messages = pending.map(m => {
          const recovery = m.state !== 'queued';
          m.state = 'claimed'; m.claimToken ||= secret(); m.claimGeneration = generation; store.put('message', m.id, m);
          return { ...m, recovery, ...(m.exchange ? { exchange: { ...m.exchange, pending: requestsFor(self).filter(r => r.id !== m.exchange.requestId).map(r => describe(r, self)) } } : {}) };
        });
        return ok({ messages });
        };
        // A bounded per-session read cache handles a lost HTTP response. It is
        // generation-scoped and separate from durable send idempotency records;
        // background reconciliation must never consume message capacity.
        if (args.operationId !== undefined && !str(args.operationId, 128)) return fail('bad-operation-id');
        const cached = store.get('claim-cache', self.id);
        if (args.operationId && cached?.generation === generation && cached.operationId === args.operationId) return cached.result;
        const result = claim();
        if (args.operationId) store.put('claim-cache', self.id, { generation, operationId: args.operationId, result });
        return result;
      }
      if (op === 'inbox.ack') {
        const m = store.get('message', args.messageId);
        if (!m || m.workspace !== device.workspace || m.to.session !== self.id) return fail('forbidden');
        // current() already fences the old process. The replacement process
        // owns this same native session and can reconcile a persisted receipt.
        if (!m.claimToken || m.claimToken !== args.claimToken) return fail('stale-claim');
        if (!['delivered', 'consumed', 'unknown', 'failed'].includes(args.stage)) return fail('bad-receipt');
        if (m.state === 'consumed' || (m.state === 'delivered' && args.stage === 'delivered')) return ok();
        if (['failed', 'consumed'].includes(m.state)) return fail('terminal-message');
        m.state = args.stage; m.claimGeneration = generation; m.updatedAt = at; store.put('message', m.id, m);
        if (args.stage === 'consumed' && m.exchange) {
          const r = store.get('request', m.exchange.requestId);
          if (r && r.lastMessage === m.id) {
            if (m.exchange.kind === 'result') { r.state = 'complete'; store.put('request', r.id, r); }
            if (['request', 'answer'].includes(m.exchange.kind)) { self.contextRequest = r.id; store.put('session', self.id, self); }
          }
        }
        if (args.stage === 'failed' && m.exchange) { const r = store.get('request', m.exchange.requestId); if (r && !finished(r)) { r.state = 'failed'; store.put('request', r.id, r); } }
        return ok();
      }
      return fail('unknown-operation');
    });
  }
  return { authenticate, current, run, limits: cfg };
}
