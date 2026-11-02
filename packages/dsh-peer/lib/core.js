// peer 核心：本进程的 peer 表、命名、地址解析、投递编排。与 dsh 无关——dsh 的 agents 与消息构造都由调用方注入。
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { basename } from 'node:path';
import { PROTOCOL, createRegistry } from './registry.js';
import { createTransport as defaultCreateTransport, MAX_REQUEST_BYTES } from './transport.js';
import { createGuard } from './guard.js';
import { createExchange, REQUEST_CAPABILITY } from './exchange.js';

export const NAME_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const NAME_MAX = 40;
const DEDUP_MAX = 200;
export const LIST_LIMIT = 20;
import { REPLY_HINT, relayText, exchangeText } from './message.js';
export { REPLY_HINT, relayText } from './message.js';

// 目录名规整成名字前缀：转小写、非法字符换 -、去掉开头的 - _、截断；规整完为空时用 dsh
export function normalizeBase(raw, max = NAME_MAX) {
  const s = String(raw || '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^[^a-z0-9]+/, '').slice(0, max).replace(/-+$/, '');
  return s || 'dsh';
}

// dsh 的 sessionId 形如 session-<uuid>：去掉前缀，取 uuid 部分
export const bareId = (id) => String(id ?? '').toLowerCase().replace(/^session-/, '');

// 缺省名：<cwd 目录名>-<sessionId 前 4 位 hex>（不含 session- 前缀）
export function defaultName(cwd, sessionId) {
  const hex = (bareId(sessionId).replace(/[^0-9a-f]/g, '').slice(0, 4) || bareId(sessionId).slice(0, 4)).padEnd(4, '0');
  return `${normalizeBase(cwd ? basename(cwd) : 'dsh', NAME_MAX - 5)}-${hex}`;
}

const safeEqual = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = Buffer.from(a); const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

// 列表文本（peer_list / /peers 共用）；hidden 为截断掉的条数
export function formatList(entries, { hidden = 0 } = {}) {
  const others = entries.filter((e) => !e.self);
  const head = others.length ? '' : '当前没有其他 dsh 会话在线。\n';
  if (!entries.length) return head.trim();
  const cell = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim() || '—';
  const rows = entries.map((e) => `| ${cell(e.name)}${e.self ? '（本会话）' : e.sameProcess ? '（同进程）' : ''} | ${cell(e.status)} | ${cell(e.cwd)} | ${cell(e.title)} | ${cell(e.profile)} | ${e.pid} |`);
  const more = hidden > 0 ? `\n\n还有 ${hidden} 个未列出，peer_list 传 all: true 看全部。` : '';
  return `${head}| 名字 | 状态 | cwd | 标题 | profile | 进程 |\n|---|---|---|---|---|---|\n${rows.join('\n')}${more}`;
}

export function createPeerCore({
  dir, pid = process.pid, procStart = null, profile = null, dshHome = null, argv1 = null, fixedName = null,
  agents, makeMessage, log = () => {}, now = Date.now, guardNow, protection = {}, guardOptions = {}, isAlive, procStartOf, namesFile,
  requests = true, createTransport = defaultCreateTransport, token = randomBytes(32).toString('hex'), writeDelayMs = 50,
}) {
  const registry = createRegistry({ dir, pid, ...(isAlive ? { isAlive } : {}), ...(procStartOf ? { procStartOf } : {}), ...(namesFile ? { namesFile } : {}) });
  const sessions = new Map(); // id → { id, name, nameSource, cwd, title, status, since, lastActiveAt }
  const pending = new Map(); // 还没有用户消息的会话（空草稿）：id → info，首条用户消息后才登记
  const startedAt = now();
  const instanceId = randomBytes(16).toString('hex');
  const capabilities = requests === false ? [] : [REQUEST_CAPABILITY];
  const seen = []; const seenSet = new Set();
  const pendingIds = new Set();
  const audit = (event, data) => { try { log(`[dsh-peer] ${event} ${JSON.stringify(data)}`); } catch { /* Logging cannot change admission. */ } };
  const guard = createGuard({ ...(typeof protection === 'object' && protection ? protection : {}), ...guardOptions,
    ...(guardNow ? { now: guardNow } : {}), enabled: protection !== 'off', onPause: data => audit('conversation-paused', data) });
  let fixedUsed = false;
  let timer = null;
  let started = false;
  const stats = { writes: 0 };

  const transport = createTransport({ dir, pid, token, onRequest });

  // ---------- 落盘 ----------
  function record() {
    return { protocol: PROTOCOL, instanceId, capabilities, pid, procStart, startedAt, profile, dshHome, argv1, socket: transport.path, updatedAt: now(), sessions: [...sessions.values()].map((s) => ({ ...s })) };
  }
  function flush() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!started) return;
    try { registry.writeRecord(record()); stats.writes++; } catch (error) { log(`[dsh-peer] 写注册表失败：${error.message}`); }
  }
  // 变化合并：writeDelayMs 内多次只写一次
  function schedule() {
    if (!started || timer) return;
    timer = setTimeout(flush, writeDelayMs);
    if (timer.unref) timer.unref();
  }

  // ---------- 命名 ----------
  function takenNames(exceptId) {
    const taken = new Set();
    for (const s of sessions.values()) if (s.id !== exceptId) taken.add(s.name);
    for (const r of registry.readOthers()) for (const s of r.sessions || []) taken.add(s.name);
    return taken;
  }
  // 撞名加 -2、-3……
  function uniquify(name, exceptId) {
    const taken = takenNames(exceptId);
    if (!taken.has(name)) return name;
    for (let n = 2; ; n++) {
      const suffix = `-${n}`;
      const candidate = `${name.slice(0, NAME_MAX - suffix.length).replace(/-+$/, '')}${suffix}`;
      if (!taken.has(candidate)) return candidate;
    }
  }

  // ---------- 会话表 ----------
  // info.hasUserMessage === false 时只挂起，不登记（空草稿永远不进注册表）；noteUserMessage 时再登记
  function register(info) {
    if (!info || !info.id || info.origin === 'subagent') return null; // 子 agent 不是 peer
    const existing = sessions.get(info.id);
    if (!existing && info.hasUserMessage === false) {
      pending.set(info.id, { ...pending.get(info.id), ...info });
      return null;
    }
    pending.delete(info.id);
    if (existing) {
      existing.lastActiveAt = now();
      if (info.status) existing.status = info.status;
      if (info.title) existing.title = info.title;
      if (info.cwd) existing.cwd = info.cwd;
      schedule();
      return { ...existing };
    }
    let name; let nameSource;
    const saved = registry.loadNames()[info.id];
    if (typeof saved === 'string' && NAME_RE.test(saved)) { name = saved; nameSource = 'user'; }
    else if (fixedName && !fixedUsed && NAME_RE.test(fixedName)) { name = fixedName; nameSource = 'config'; fixedUsed = true; }
    else { name = defaultName(info.cwd, info.id); nameSource = 'auto'; }
    const entry = { id: info.id, name: uniquify(name, info.id), nameSource, cwd: info.cwd || null, ...(info.title ? { title: info.title } : {}), status: info.status || 'idle', since: now(), lastActiveAt: now() };
    sessions.set(info.id, entry);
    schedule();
    return { ...entry };
  }
  // 挂起的会话出现第一条用户消息：按挂起时的信息登记（固定名在这一刻分配）
  function noteUserMessage(id) {
    if (sessions.has(id)) return { ...sessions.get(id) };
    const info = pending.get(id);
    return info ? register({ ...info, hasUserMessage: true }) : null;
  }
  function unregister(id) { pending.delete(id); if (sessions.delete(id)) schedule(); }
  function setStatus(id, status) {
    const p = pending.get(id); if (p) p.status = status;
    const s = sessions.get(id); if (s && s.status !== status) { s.status = status; s.lastActiveAt = now(); schedule(); }
  }
  function setTitle(id, title) {
    const p = pending.get(id); if (p && title) p.title = title;
    const s = sessions.get(id); if (s && title && s.title !== title) { s.title = title; schedule(); }
  }

  function rename(id, raw) {
    const s = sessions.get(id);
    if (!s) return { ok: false, error: 'not-registered', text: '本会话没有登记为 peer（子 agent 会话不登记）。' };
    const want = String(raw ?? '').trim();
    if (!NAME_RE.test(want)) return { ok: false, error: 'bad-name', text: `名字不合法：${JSON.stringify(want)}。规则：小写字母或数字开头，只含小写字母、数字、-、_，最长 40 个字符。` };
    const name = uniquify(want, id);
    s.name = name; s.nameSource = 'user';
    const names = registry.loadNames(); names[id] = name;
    try { registry.saveNames(names); } catch (error) { log(`[dsh-peer] 写 names.json 失败：${error.message}`); }
    flush(); // 改名立刻重写
    return { ok: true, name, changed: name !== want, text: name !== want ? `"${want}" 已被占用，本会话改名为 ${name}。` : `本会话已改名为 ${name}。` };
  }

  // ---------- 发现 ----------
  function entries(selfId) {
    const out = [];
    for (const s of sessions.values()) out.push({ name: s.name, session: s.id, status: s.status, cwd: s.cwd, title: s.title, profile, pid, instanceId, capabilities, lastActiveAt: s.lastActiveAt || 0, self: s.id === selfId, sameProcess: true, local: true });
    for (const r of registry.readOthers()) {
      for (const s of r.sessions || []) out.push({ name: s.name, session: s.id, status: s.status, cwd: s.cwd, title: s.title, profile: r.profile, pid: r.pid, instanceId: r.instanceId, capabilities: r.capabilities, lastActiveAt: s.lastActiveAt || 0, self: false, sameProcess: false, local: false, record: r });
    }
    // 本会话固定第一行；其余 running 在前，再按 lastActiveAt 倒序
    const rank = (e) => (e.self ? 0 : e.status === 'running' ? 1 : 2);
    return out.sort((a, b) => rank(a) - rank(b) || b.lastActiveAt - a.lastActiveAt || a.name.localeCompare(b.name));
  }
  const strip = ({ record: _r, local: _l, ...e }) => e;
  const list = (selfId) => entries(selfId).map(strip);
  // peer_list 用：缺省最多 LIST_LIMIT 个其他会话（本会话那行不计），all 为 true 时全列
  function listView(selfId, { all = false, limit = LIST_LIMIT } = {}) {
    const rows = list(selfId);
    const self = rows.filter((e) => e.self); const others = rows.filter((e) => !e.self);
    const shown = all ? others : others.slice(0, limit);
    return { entries: [...self, ...shown], hidden: others.length - shown.length };
  }
  const listText = (selfId, opts) => { const v = listView(selfId, opts); return formatList(v.entries, { hidden: v.hidden }); };

  // 地址解析：名字精确 > sessionId 前缀（≥ 4 位，唯一；带不带 session- 前缀都认）；含 @ 的留给跨机器
  function resolve(to, all) {
    const addr = String(to ?? '').trim();
    if (addr.includes('@')) return { error: 'unsupported-address' };
    if (!addr) return { error: 'unknown-peer' };
    const byName = all.find((e) => e.name === addr);
    if (byName) return { target: byName };
    if (addr.length >= 4) {
      const want = bareId(addr);
      const hits = want.length >= 4 ? all.filter((e) => bareId(e.session).startsWith(want)) : [];
      if (hits.length === 1) return { target: hits[0] };
      if (hits.length > 1) return { error: 'ambiguous-peer' };
    }
    return { error: 'unknown-peer' };
  }

  // ---------- 投递 ----------
  const ERROR_TEXT = {
    'unknown-peer': '找不到这个 peer', 'ambiguous-peer': 'sessionId 前缀命中多个会话，请用名字', 'unsupported-address': '第一版不支持 name@host 地址（跨机器尚未实现）',
    self: '不能发给自己', 'not-registered': '本会话没有登记为 peer', 'not-live': '对方会话已不在内存（第一版不做冷投递）',
    'unknown-session': '对方进程里没有这个会话', 'bad-token': '对方拒绝了 token', 'bad-request': '对方认为请求格式不对',
    unreachable: '连不上对方进程的 socket', timeout: '对方 5 秒内没有回应', 'bad-response': '对方回包无法解析', 'no-key': '读不到对方的 key 文件',
    'duplicate-content': '短窗口内已有相同内容；不要确认或重发',
    'rate-limited': '超过接收端速率限制；停止自动发送，不等待重试',
    'conversation-paused': '此发送方向已暂停；需要用户在接收会话用 /peer-resume 恢复',
    'guard-capacity': '接收端保护状态容量已满；停止自动发送',
    'delivery-failed': '接收会话未接纳消息', 'delivery-pending': '同一消息正在投递；不要重发',

  };

  async function send({ to, text, steer = false, from }) {
    const me = sessions.get(from);
    const all = entries(from);
    let display;
    const fail = (error, extra = {}) => {
      const guarded = ['duplicate-content', 'rate-limited', 'conversation-paused', 'guard-capacity', 'delivery-pending'].includes(error);
      const unknown = extra.uncertain || ['timeout', 'bad-response', 'delivery-pending'].includes(error);
      return { ok: false, error, ...(extra.retryAfterMs ? { retryAfterMs: extra.retryAfterMs } : {}),
        ...(display ? { display: { ...display, outcome: unknown ? 'unknown' : 'rejected', reason: error, retryAfterMs: extra.retryAfterMs } } : {}),
        text: `${unknown ? '投递状态未知' : '未投递'}：${ERROR_TEXT[error] || error}（${error}）。${unknown ? '不要自动重发。' : ''}${guarded || unknown ? '' : `\n\n当前列表：\n${listText(from)}`}` };
    };
    if (!me) return fail('not-registered');
    const r = resolve(to, all);
    if (r.error) return fail(r.error);
    const target = r.target;
    if (target.session === from) return fail('self');
    const request = {
      v: PROTOCOL, id: randomBytes(12).toString('hex'), type: 'send', to: { session: target.session },
      from: { pid, session: me.id, name: me.name, cwd: me.cwd, profile }, text: String(text ?? ''), steer: steer === true,
    };
    display = { version: 1, id: request.id, target: { name: target.name, session: target.session }, text: request.text };
    if (Buffer.byteLength(JSON.stringify(request)) > MAX_REQUEST_BYTES - 100) return fail('bad-request');
    let res;
    if (target.local) res = deliver(request); // 同进程直投，不过 socket
    else {
      const peerToken = registry.readKey(target.pid);
      if (!peerToken) return fail('no-key');
      res = await transport.send(target.record, { ...request, token: peerToken });
    }
    if (!res || !res.ok) return fail((res && res.error) || 'bad-response', res || {});
    const how = res.delivered === 'steered' ? '已插入它当前这轮' : res.delivered === 'duplicate' ? '对方已收到过同一条' : '排在它下一轮';
    return { ok: true, delivered: res.delivered, name: target.name, session: target.session, sameProcess: target.local, display: { ...display, outcome: res.delivered }, text: `已发给 ${target.name}（${how}）。已交给对方，不代表已处理；仅在有新增问题或结果时继续联系，纯确认无需回复。` };
  }

  function validRequest(req) {
    return req && req.v === PROTOCOL && req.type === 'send' && typeof req.id === 'string' && req.id.length > 0 && req.id.length <= 256
      && typeof req.to?.session === 'string' && req.to.session.length > 0 && req.to.session.length <= 256
      && typeof req.text === 'string' && typeof req.from?.name === 'string'
      && typeof req.from.session === 'string' && req.from.session.length > 0 && req.from.session.length <= 256
      && (req.steer === undefined || typeof req.steer === 'boolean')
      && Buffer.byteLength(JSON.stringify(req)) <= MAX_REQUEST_BYTES;
  }
  function deliver(req) {
    const id = req?.id;
    if (!validRequest(req)) return { ok: false, id, error: 'bad-request' };
    const sid = req.to.session;
    if (!sessions.has(sid)) return { ok: false, id, error: 'unknown-session' };
    let agent;
    try { agent = agents.get(sid); } catch { agent = undefined; }
    if (!agent) return { ok: false, id, error: 'not-live' };
    const from = req.from;
    const idKey = JSON.stringify([from.session, sid, id]);
    if (seenSet.has(idKey)) return { ok: true, id, delivered: 'duplicate' };
    if (pendingIds.has(idKey)) return { ok: false, id, error: 'delivery-pending' };
    const admission = guard.reserve(from.session, sid, req.text, req.steer === true);
    if (!admission.ok) return { ...admission, id };
    pendingIds.add(idKey);
    try {
      const text = relayText(from, req.text);
      const start = text.length - req.text.length - (`\n\n${REPLY_HINT(from.name)}`).length;
      const source = { kind: 'dsh-peer', form: 'relay', peer: { name: from.name, session: from.session, pid: from.pid, cwd: from.cwd ?? null, profile: from.profile ?? null },
        display: { version: 1, id, to: sid, start, end: start + req.text.length, sentAt: now() } };
      const msg = makeMessage(text, source);
      if (req.steer) agent.steer(msg); else agent.followup(msg);
    } catch {
      admission.rollback(); pendingIds.delete(idKey);
      audit('delivery-failed', { from: from.session, to: sid });
      return { ok: false, id, error: 'delivery-failed' };
    }
    admission.commit(); pendingIds.delete(idKey);
    const target = sessions.get(sid); target.lastActiveAt = now(); schedule();
    seen.push(idKey); seenSet.add(idKey);
    while (seen.length > DEDUP_MAX) seenSet.delete(seen.shift());
    audit('accepted', { from: from.session, to: sid, mode: req.steer ? 'steer' : 'followup' });
    return { ok: true, id, delivered: req.steer ? 'steered' : 'queued' };
  }

  const exchange = createExchange({ enabled: requests !== false, ...(guardNow ? { now: guardNow } : {}),
    identity: id => { const s = sessions.get(id); return s ? { session: id, name: s.name, cwd: s.cwd, profile, pid, instanceId, capabilities } : null; },
    resolve: (address, from) => resolve(address, entries(from)),
    async transmit(target, req) {
      if (Buffer.byteLength(JSON.stringify(req)) > MAX_REQUEST_BYTES - 100) return { ok: false, error: 'bad-request' };
      if (target.local) return exchange.receive(req);
      const peerToken = registry.readKey(target.pid);
      if (!peerToken) return { ok: false, error: 'no-key' };
      return transport.send(target.record, { ...req, token: peerToken });
    },
    admit(req, info) {
      if (Buffer.byteLength(JSON.stringify(req)) > MAX_REQUEST_BYTES) return { ok: false, error: 'bad-request' };
      let agent; try { agent = agents.get(req.to.session); } catch { /* unavailable */ }
      if (!agent) return { ok: false, error: 'not-live' };
      const admission = guard.reserve(req.from.session, req.to.session, req.text, false, JSON.stringify([req.requestId, req.kind, req.questionId]));
      if (!admission.ok) return admission;
      const text = exchangeText(req.from, req.text, info), start = text.indexOf('\n') + 1;
      const source = { kind: 'dsh-peer', form: 'relay', peer: { name: req.from.name, session: req.from.session, pid: req.from.pid, cwd: req.from.cwd ?? null, profile: req.from.profile ?? null }, exchange: info,
        display: { version: 2, id: req.id, to: req.to.session, start, end: start + req.text.length, sentAt: now() } };
      try { agent.followup(makeMessage(text, source)); }
      catch { admission.rollback(); return { ok: false, error: 'delivery-failed' }; }
      admission.commit(); return { ok: true, delivered: 'queued' };
    },
  });

  function protectionStatus(selfId) {
    const peers = entries(selfId);
    return guard.status(selfId).map(s => ({ ...s, name: peers.find(p => p.session === s.from)?.name || s.from }));
  }
  function peersText(selfId) {
    const status = protectionStatus(selfId).filter(s => s.paused);
    return listText(selfId) + (status.length ? '\n\n接收保护：\n' + status.map(s => `来自 @${s.name} 已暂停；用户可执行 /peer-resume ${s.name}。`).join('\n') : '');
  }
  function resume(selfId, address) {
    if (!sessions.has(selfId)) return { ok: false, text: '本会话没有登记为 peer。' };
    const all = entries(selfId);
    for (const s of protectionStatus(selfId)) if (!all.some(p => p.session === s.from)) all.push({ name: s.name, session: s.from });
    const r = resolve(address, all);
    if (r.error) return { ok: false, text: ERROR_TEXT[r.error] };
    if (!guard.resume(r.target.session, selfId)) return { ok: false, text: '仍有正在投递的消息，请稍后操作。' };
    audit('resumed', { from: r.target.session, to: selfId });
    return { ok: true, text: `已恢复来自 @${r.target.name} 的接收；未重放消息，也未启动模型。` };
  }

  // socket 收到的请求
  function onRequest(req) {
    const id = req && req.id;
    if (!req || req.v !== PROTOCOL) return { ok: false, id, error: 'bad-request' };
    if (!safeEqual(req.token, token)) return { ok: false, id, error: 'bad-token' };
    if (req.type === 'ping') return { ok: true, pid, sessions: [...sessions.values()].map((s) => ({ ...s })) };
    if (req.type === 'exchange') return exchange.receive(req);
    if (req.type !== 'send') return { ok: false, id, error: 'bad-request' };
    const okShape = typeof id === 'string' && id && req.to && typeof req.to.session === 'string' && typeof req.text === 'string'
      && req.from && typeof req.from.name === 'string' && typeof req.from.session === 'string';
    if (!okShape) return { ok: false, id, error: 'bad-request' };
    return deliver(req);
  }

  return {
    pid, token, stats, transport, registry,
    async start() {
      registry.ensureDir();
      registry.writeKey(token);
      await transport.start();
      started = true;
      flush();
    },
    stop() {
      if (timer) { clearTimeout(timer); timer = null; }
      started = false;
      try { transport.stop(); } catch { /* 已关 */ }
      registry.removeSelf();
      exchange.clear(); guard.clear(); seen.length = 0; seenSet.clear(); pendingIds.clear();
    },
    request: exchange.request, reply: exchange.reply, waitFor: exchange.waitFor, consume: exchange.consume,
    flush, register, noteUserMessage, unregister, setStatus, setTitle, rename, list, listView, listText, peersText, protectionStatus, resume, send,
    has: (id) => sessions.has(id),
    isPending: (id) => pending.has(id),
    get: (id) => (sessions.has(id) ? { ...sessions.get(id) } : undefined),
  };
}
