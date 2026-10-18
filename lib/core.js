// peer 核心：本进程的 peer 表、命名、地址解析、投递编排。与 dsh 无关——dsh 的 agents 与消息构造都由调用方注入。
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { basename } from 'node:path';
import { PROTOCOL, createRegistry } from './registry.js';
import { createTransport as defaultCreateTransport } from './transport.js';

export const NAME_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const NAME_MAX = 40;
const DEDUP_MAX = 200;
const REPLY_HINT = (name) => `（这条消息来自另一个 dsh 会话，不是用户说的话。要回复就调用 peer_send，to 填 "${name}"。）`;

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

// 投进对方会话的正文
export function relayText(from, text) {
  const where = [from.cwd ? `cwd ${from.cwd}` : null, from.profile ? `profile ${from.profile}` : null].filter(Boolean).join('，');
  return `[peer 消息] 来自 ${from.name}${where ? `（${where}）` : ''}\n${text}\n\n${REPLY_HINT(from.name)}`;
}

// 列表文本（peer_list / /peers 共用）
export function formatList(entries) {
  const others = entries.filter((e) => !e.self);
  const head = others.length ? '' : '当前没有其他 dsh 会话在线。\n';
  if (!entries.length) return head.trim();
  const cell = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim() || '—';
  const rows = entries.map((e) => `| ${cell(e.name)}${e.self ? '（本会话）' : e.sameProcess ? '（同进程）' : ''} | ${cell(e.status)} | ${cell(e.cwd)} | ${cell(e.title)} | ${cell(e.profile)} | ${e.pid} |`);
  return `${head}| 名字 | 状态 | cwd | 标题 | profile | 进程 |\n|---|---|---|---|---|---|\n${rows.join('\n')}`;
}

export function createPeerCore({
  dir, pid = process.pid, procStart = null, profile = null, dshHome = null, argv1 = null, fixedName = null,
  agents, makeMessage, log = () => {}, now = Date.now, isAlive, procStartOf, namesFile,
  createTransport = defaultCreateTransport, token = randomBytes(32).toString('hex'), writeDelayMs = 50,
}) {
  const registry = createRegistry({ dir, pid, ...(isAlive ? { isAlive } : {}), ...(procStartOf ? { procStartOf } : {}), ...(namesFile ? { namesFile } : {}) });
  const sessions = new Map(); // id → { id, name, nameSource, cwd, title, status, since }
  const startedAt = now();
  const seen = []; const seenSet = new Set();
  let fixedUsed = false;
  let timer = null;
  let started = false;
  const stats = { writes: 0 };

  const transport = createTransport({ dir, pid, token, onRequest });

  // ---------- 落盘 ----------
  function record() {
    return { protocol: PROTOCOL, pid, procStart, startedAt, profile, dshHome, argv1, socket: transport.path, updatedAt: now(), sessions: [...sessions.values()].map((s) => ({ ...s })) };
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
  function register(info) {
    if (!info || !info.id || info.origin === 'subagent') return null; // 子 agent 不是 peer
    const existing = sessions.get(info.id);
    if (existing) {
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
    const entry = { id: info.id, name: uniquify(name, info.id), nameSource, cwd: info.cwd || null, ...(info.title ? { title: info.title } : {}), status: info.status || 'idle', since: now() };
    sessions.set(info.id, entry);
    schedule();
    return { ...entry };
  }
  function unregister(id) { if (sessions.delete(id)) schedule(); }
  function setStatus(id, status) { const s = sessions.get(id); if (s && s.status !== status) { s.status = status; schedule(); } }
  function setTitle(id, title) { const s = sessions.get(id); if (s && title && s.title !== title) { s.title = title; schedule(); } }

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
    for (const s of sessions.values()) out.push({ name: s.name, session: s.id, status: s.status, cwd: s.cwd, title: s.title, profile, pid, self: s.id === selfId, sameProcess: true, local: true });
    for (const r of registry.readOthers()) {
      for (const s of r.sessions || []) out.push({ name: s.name, session: s.id, status: s.status, cwd: s.cwd, title: s.title, profile: r.profile, pid: r.pid, self: false, sameProcess: false, local: false, record: r });
    }
    const rank = (e) => (e.self ? 0 : e.sameProcess ? 1 : 2);
    return out.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  }
  const list = (selfId) => entries(selfId).map(({ record: _r, local: _l, ...e }) => e);

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
  };

  async function send({ to, text, steer = false, from }) {
    const me = sessions.get(from);
    const all = entries(from);
    const fail = (error) => ({ ok: false, error, text: `发送失败：${ERROR_TEXT[error] || error}（${error}）。\n\n当前列表：\n${formatList(list(from))}` });
    if (!me) return fail('not-registered');
    const r = resolve(to, all);
    if (r.error) return fail(r.error);
    const target = r.target;
    if (target.session === from) return fail('self');
    const request = {
      v: PROTOCOL, id: randomBytes(12).toString('hex'), type: 'send', to: { session: target.session },
      from: { pid, session: me.id, name: me.name, cwd: me.cwd, profile }, text: String(text ?? ''), steer: steer === true,
    };
    let res;
    if (target.local) res = deliver(request); // 同进程直投，不过 socket
    else {
      const peerToken = registry.readKey(target.pid);
      if (!peerToken) return fail('no-key');
      res = await transport.send(target.record, { ...request, token: peerToken });
    }
    if (!res || !res.ok) return fail((res && res.error) || 'bad-response');
    const how = res.delivered === 'steered' ? '已插入它当前这轮' : res.delivered === 'duplicate' ? '对方已收到过同一条' : '排在它下一轮';
    return { ok: true, delivered: res.delivered, name: target.name, session: target.session, sameProcess: target.local, text: `已发给 ${target.name}（${how}）。它回复时会以"[peer 消息]"出现在本对话。` };
  }

  function deliver(req) {
    const id = req.id;
    if (seenSet.has(id)) return { ok: true, id, delivered: 'duplicate' };
    const sid = req.to && req.to.session;
    if (!sessions.has(sid)) return { ok: false, id, error: 'unknown-session' };
    let agent;
    try { agent = agents.get(sid); } catch { agent = undefined; }
    if (!agent) return { ok: false, id, error: 'not-live' };
    const from = req.from;
    const source = { kind: 'dsh-peer', form: 'relay', peer: { name: from.name, session: from.session, pid: from.pid, cwd: from.cwd ?? null } };
    const msg = makeMessage(relayText(from, req.text), source);
    if (req.steer) agent.steer(msg); else agent.followup(msg);
    seen.push(id); seenSet.add(id);
    while (seen.length > DEDUP_MAX) seenSet.delete(seen.shift());
    log(`[dsh-peer] ${from.name}（pid ${from.pid}）→ ${sessions.get(sid).name}：${req.steer ? 'steer' : 'followup'}`);
    return { ok: true, id, delivered: req.steer ? 'steered' : 'queued' };
  }

  // socket 收到的请求
  function onRequest(req) {
    const id = req && req.id;
    if (!req || req.v !== PROTOCOL) return { ok: false, id, error: 'bad-request' };
    if (!safeEqual(req.token, token)) return { ok: false, id, error: 'bad-token' };
    if (req.type === 'ping') return { ok: true, pid, sessions: [...sessions.values()].map((s) => ({ ...s })) };
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
    },
    flush, register, unregister, setStatus, setTitle, rename, list, send,
    has: (id) => sessions.has(id),
    get: (id) => (sessions.has(id) ? { ...sessions.get(id) } : undefined),
  };
}
