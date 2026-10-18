// 单测：两个 createPeerCore 实例模拟两个进程（B 的 pid 是假的，经 isAlive 放行）；不依赖 dsh
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPeerCore, defaultName } from '../lib/core.js';
import { createTransport } from '../lib/transport.js';
import { defaultIsAlive } from '../lib/registry.js';

const FAKE = process.pid + 100000;
const isAlive = (p) => p === FAKE || defaultIsAlive(p);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fakeAgents() {
  const got = {};
  const make = (id) => ({ followup: (m) => (got[id] ||= []).push({ how: 'followup', m }), steer: (m) => (got[id] ||= []).push({ how: 'steer', m }) });
  const live = new Set();
  return { got, live, agents: { get: (id) => (live.has(id) ? make(id) : undefined) } };
}
const makeMessage = (text, source) => ({ role: 'user', content: [{ type: 'text', text }], source });

async function setup(t, opts = {}) {
  const root = mkdtempSync(join(tmpdir(), 'dsh-peer-test-'));
  const dir = join(root, 'run');
  const namesFile = join(root, 'names.json');
  t.after(() => { a.stop(); b.stop(); rmSync(root, { recursive: true, force: true }); });
  const fa = fakeAgents(); const fb = fakeAgents();
  let socketSends = 0;
  const countingTransport = (o) => { const tr = createTransport(o); const send = tr.send; tr.send = (...x) => { socketSends++; return send(...x); }; return tr; };
  const a = createPeerCore({ dir, pid: process.pid, procStart: null, profile: 'pa', fixedName: opts.fixedA, agents: fa.agents, makeMessage, isAlive, namesFile, createTransport: countingTransport, writeDelayMs: 10 });
  const b = createPeerCore({ dir, pid: FAKE, procStart: null, profile: 'pb', agents: fb.agents, makeMessage, isAlive, namesFile, createTransport: countingTransport, writeDelayMs: 10 });
  await a.start(); await b.start();
  return { root, dir, namesFile, a, b, fa, fb, sends: () => socketSends };
}

const sid = (p) => `${p}0000-aaaa-bbbb-cccc-000000000000`;

test('P1 登记与发现 + 文件权限', async (t) => {
  const { dir, a, b, fa, fb } = await setup(t);
  a.register({ id: sid('aaaa'), cwd: '/x/Proj One', status: 'idle' }); fa.live.add(sid('aaaa'));
  b.register({ id: sid('bbbb'), cwd: '/y/other', status: 'running', title: 'T' }); fb.live.add(sid('bbbb'));
  a.flush(); b.flush();
  const la = a.list(sid('aaaa'));
  const eb = la.find((e) => e.session === sid('bbbb'));
  assert.equal(eb.name, 'other-bbbb'); assert.equal(eb.cwd, '/y/other'); assert.equal(eb.status, 'running'); assert.equal(eb.profile, 'pb'); assert.equal(eb.title, 'T');
  assert.equal(la.find((e) => e.self).name, 'proj-one-aaaa');
  assert.ok(b.list(sid('bbbb')).some((e) => e.name === 'proj-one-aaaa' && e.profile === 'pa'));
  const mode = (f) => statSync(join(dir, f)).mode & 0o777;
  assert.equal(statSync(dir).mode & 0o777, 0o700);
  assert.equal(mode(`${process.pid}.json`), 0o644);
  assert.equal(mode(`${process.pid}.key`), 0o600);
  assert.equal(mode(`${FAKE}.key`), 0o600);
  assert.equal(mode(`${FAKE}.sock`), 0o600);
});

test('P2 跨进程投递 followup / steer', async (t) => {
  const { a, b, fb } = await setup(t);
  a.register({ id: sid('aaaa'), cwd: '/x/alpha' });
  b.register({ id: sid('bbbb'), cwd: '/y/beta' }); fb.live.add(sid('bbbb'));
  a.flush(); b.flush();
  const r = await a.send({ to: 'beta-bbbb', text: 'hi', from: sid('aaaa') });
  assert.equal(r.ok, true); assert.equal(r.delivered, 'queued');
  assert.match(r.text, /已发给 beta-bbbb（排在它下一轮）/);
  const got = fb.got[sid('bbbb')];
  assert.equal(got.length, 1); assert.equal(got[0].how, 'followup');
  const text = got[0].m.content[0].text;
  assert.ok(text.startsWith('[peer 消息] 来自 alpha-aaaa'));
  assert.ok(text.includes('\nhi\n'));
  assert.ok(text.trimEnd().endsWith('不是用户说的话。要回复就调用 peer_send，to 填 "alpha-aaaa"。）'));
  assert.equal(got[0].m.source.kind, 'dsh-peer'); assert.equal(got[0].m.source.form, 'relay');
  assert.equal(got[0].m.source.peer.name, 'alpha-aaaa');
  const s = await a.send({ to: 'beta-bbbb', text: 'now', steer: true, from: sid('aaaa') });
  assert.equal(s.delivered, 'steered'); assert.equal(fb.got[sid('bbbb')][1].how, 'steer');
});

test('P3 同进程直投不走 socket', async (t) => {
  const { a, fa, sends } = await setup(t);
  a.register({ id: sid('aaaa'), cwd: '/x/alpha' });
  a.register({ id: sid('a2a2'), cwd: '/x/alpha' }); fa.live.add(sid('a2a2'));
  const r = await a.send({ to: sid('a2a2').slice(0, 4), text: 'yo', from: sid('aaaa') });
  assert.equal(r.ok, true); assert.equal(r.sameProcess, true);
  assert.equal(fa.got[sid('a2a2')].length, 1);
  assert.equal(sends(), 0);
  const e = a.list(sid('aaaa')).find((x) => x.session === sid('a2a2'));
  assert.equal(e.sameProcess, true); assert.equal(e.self, false);
});

test('P4 token 不对 → bad-token', async (t) => {
  const { dir, a, b, fb } = await setup(t);
  a.register({ id: sid('aaaa'), cwd: '/x/alpha' });
  b.register({ id: sid('bbbb'), cwd: '/y/beta' }); fb.live.add(sid('bbbb'));
  a.flush(); b.flush();
  writeFileSync(join(dir, `${FAKE}.key`), JSON.stringify({ token: 'f'.repeat(64) }));
  const r = await a.send({ to: 'beta-bbbb', text: 'hi', from: sid('aaaa') });
  assert.equal(r.ok, false); assert.equal(r.error, 'bad-token');
  assert.equal(fb.got[sid('bbbb')], undefined);
});

test('P5 残留清理：死 pid 与 procStart 不一致', async (t) => {
  const { dir, a } = await setup(t);
  const dead = 3999999;
  const rec = (pid, procStart) => JSON.stringify({ protocol: 1, pid, procStart, sessions: [{ id: 'dead', name: `ghost-${pid}`, status: 'idle' }] });
  for (const ext of ['json', 'key', 'sock']) writeFileSync(join(dir, `${dead}.${ext}`), ext === 'json' ? rec(dead, null) : 'x');
  const ppid = process.ppid;
  for (const ext of ['json', 'key']) writeFileSync(join(dir, `${ppid}.${ext}`), ext === 'json' ? rec(ppid, 'bogus-start') : 'x');
  const names = a.list().map((e) => e.name);
  assert.ok(!names.includes(`ghost-${dead}`));
  for (const ext of ['json', 'key', 'sock']) assert.equal(existsSync(join(dir, `${dead}.${ext}`)), false);
  if (process.platform === 'linux') {
    assert.ok(!names.includes(`ghost-${ppid}`));
    assert.equal(existsSync(join(dir, `${ppid}.json`)), false);
  }
});

test('P6 命名：缺省 / 固定名 / 撞名 / 非法 / names.json / @ / self', async (t) => {
  const { a, b, namesFile, root } = await setup(t, { fixedA: 'office' });
  assert.equal(defaultName('/home/u/My_Repo.v2', 'e4f1abcd'), 'my_repo-v2-e4f1');
  assert.equal(defaultName(null, 'abcd1234'), 'dsh-abcd');
  assert.equal(defaultName('/w/proj', 'session-b9c3e746-8484-4564-a0b3-fb2ebad9c263'), 'proj-b9c3');
  const a1 = a.register({ id: sid('aaaa'), cwd: '/x/alpha' });
  const a2 = a.register({ id: sid('a2a2'), cwd: '/x/alpha' });
  assert.equal(a1.name, 'office'); assert.equal(a1.nameSource, 'config');
  assert.equal(a2.name, 'alpha-a2a2'); assert.equal(a2.nameSource, 'auto');
  a.flush();
  b.register({ id: sid('bbbb'), cwd: '/y/beta' });
  b.register({ id: sid('b2b2'), cwd: '/y/beta' });
  const r = b.rename(sid('b2b2'), 'office');
  assert.equal(r.ok, true); assert.equal(r.name, 'office-2'); assert.match(r.text, /已被占用/);
  assert.equal(b.rename(sid('bbbb'), 'Bad Name!').ok, false);
  assert.equal(b.rename(sid('bbbb'), 'x'.repeat(41)).ok, false);
  assert.equal(JSON.parse(readFileSync(namesFile, 'utf8'))[sid('b2b2')], 'office-2');
  // 新实例（模拟进程重启后 resume）沿用 names.json
  const c = createPeerCore({ dir: join(root, 'run2'), pid: FAKE + 1, agents: { get() {} }, makeMessage, isAlive: () => true, namesFile });
  const back = c.register({ id: sid('b2b2'), cwd: '/y/beta' });
  assert.equal(back.name, 'office-2'); assert.equal(back.nameSource, 'user');
  const at = await a.send({ to: 'office@host', text: 'x', from: sid('aaaa') });
  assert.equal(at.error, 'unsupported-address');
  const me = await a.send({ to: 'office', text: 'x', from: sid('aaaa') });
  assert.equal(me.error, 'self');
});

test('P7 去重：同一 id 第二次 duplicate', async (t) => {
  const { a, b, fb } = await setup(t);
  b.register({ id: sid('bbbb'), cwd: '/y/beta' }); fb.live.add(sid('bbbb'));
  b.flush();
  const req = { v: 1, token: b.token, id: 'same-id', type: 'send', to: { session: sid('bbbb') }, from: { pid: process.pid, session: 'z', name: 'zed', cwd: '/z' }, text: 'hi', steer: false };
  const rec = a.registry.readOthers().find((r) => r.pid === FAKE);
  const r1 = await a.transport.send(rec, req);
  const r2 = await a.transport.send(rec, req);
  assert.equal(r1.delivered, 'queued'); assert.equal(r2.delivered, 'duplicate');
  assert.equal(fb.got[sid('bbbb')].length, 1);
  const ping = await a.transport.send(rec, { v: 1, token: b.token, type: 'ping' });
  assert.equal(ping.ok, true); assert.equal(ping.pid, FAKE);
  const bad = await a.transport.send(rec, { v: 1, token: 'nope', type: 'ping' });
  assert.equal(bad.error, 'bad-token');
});

test('P8 to 解析 / 状态 / 标题 / 注销 / not-live / stop', async (t) => {
  const { dir, a, b, fb } = await setup(t);
  a.register({ id: sid('aaaa'), cwd: '/x/alpha' });
  b.register({ id: sid('bbbb'), cwd: '/y/beta' });
  a.flush(); b.flush();
  const nl = await a.send({ to: 'bbbb', text: 'x', from: sid('aaaa') });
  assert.equal(nl.error, 'not-live'); // 登记了但 agents.get 为空
  fb.live.add(sid('bbbb'));
  assert.equal((await a.send({ to: 'bbbb', text: 'x', from: sid('aaaa') })).ok, true);
  b.register({ id: 'session-9f3c0000-1111', cwd: '/y/beta' }); b.flush(); fb.live.add('session-9f3c0000-1111');
  assert.equal((await a.send({ to: '9f3c', text: 'x', from: sid('aaaa') })).name, 'beta-9f3c');
  assert.equal((await a.send({ to: 'session-9f3c', text: 'x', from: sid('aaaa') })).name, 'beta-9f3c');
  b.unregister('session-9f3c0000-1111');
  const u = await a.send({ to: 'nobody', text: 'x', from: sid('aaaa') });
  assert.equal(u.error, 'unknown-peer'); assert.match(u.text, /beta-bbbb/);
  b.setStatus(sid('bbbb'), 'running'); b.setTitle(sid('bbbb'), '新标题'); b.flush();
  const e = a.list().find((x) => x.session === sid('bbbb'));
  assert.equal(e.status, 'running'); assert.equal(e.title, '新标题');
  b.unregister(sid('bbbb')); b.flush();
  assert.equal(a.list().some((x) => x.session === sid('bbbb')), false);
  b.stop();
  for (const ext of ['json', 'key', 'sock']) assert.equal(existsSync(join(dir, `${FAKE}.${ext}`)), false);
});

test('P9 subagent 过滤与合并写', async (t) => {
  const { a } = await setup(t);
  assert.equal(a.register({ id: sid('5555'), cwd: '/x', origin: 'subagent' }), null);
  assert.equal(a.has(sid('5555')), false);
  a.register({ id: sid('aaaa'), cwd: '/x/alpha' });
  await sleep(30);
  const before = a.stats.writes;
  for (let i = 0; i < 10; i++) a.setStatus(sid('aaaa'), i % 2 ? 'idle' : 'running');
  await sleep(40);
  assert.equal(a.stats.writes - before, 1);
});

test('P10 草稿不登记 / 首条消息后登记 / 固定名 / 排序与截断', async (t) => {
  let clock = 1000;
  const { a, b, dir } = await setup(t, { fixedA: 'office' });
  // 空草稿：挂起，不进注册表；固定名不被它拿走
  assert.equal(a.register({ id: sid('d0d0'), cwd: '/x/alpha', hasUserMessage: false }), null);
  assert.equal(a.has(sid('d0d0')), false); assert.equal(a.isPending(sid('d0d0')), true);
  a.flush();
  assert.equal(JSON.parse(readFileSync(join(dir, `${process.pid}.json`), 'utf8')).sessions.length, 0);
  // 另一个草稿先发话：它拿到固定名
  a.register({ id: sid('e1e1'), cwd: '/x/alpha', hasUserMessage: false });
  const first = a.noteUserMessage(sid('e1e1'));
  assert.equal(first.name, 'office'); assert.equal(first.nameSource, 'config');
  // 已有用户消息的会话（左栏点开的旧会话）立即登记，按缺省名
  const old = a.register({ id: sid('f2f2'), cwd: '/x/alpha', hasUserMessage: true });
  assert.equal(old.name, 'alpha-f2f2');
  // 第一个草稿后来才发话：缺省名
  assert.equal(a.noteUserMessage(sid('d0d0')).name, 'alpha-d0d0');
  assert.equal(a.isPending(sid('d0d0')), false);
  // 挂起后 unregister：再来消息也不登记
  a.register({ id: sid('c3c3'), cwd: '/x', hasUserMessage: false }); a.unregister(sid('c3c3'));
  assert.equal(a.noteUserMessage(sid('c3c3')), null);

  // 排序与截断：用注入时钟的独立实例
  const c = createPeerCore({ dir: join(dir, '..', 'run3'), pid: FAKE + 2, agents: { get() {} }, makeMessage, isAlive: () => true, namesFile: join(dir, '..', 'n3.json'), now: () => clock });
  for (let i = 0; i < 25; i++) { clock += 10; c.register({ id: `${String(i).padStart(4, '0')}aaaa-x`, cwd: '/w/p' }); }
  clock += 10; c.setStatus('0003aaaa-x', 'running');     // running 排在最前
  clock += 10; c.setStatus('0005aaaa-x', 'idle');        // 状态没变：不更新
  clock += 10; c.register({ id: '0001aaaa-x', cwd: '/w/p' }); // 再登记算活跃
  const self = '0000aaaa-x';
  const v = c.listView(self);
  assert.equal(v.entries[0].session, self); assert.equal(v.entries[0].self, true);
  assert.equal(v.entries[1].session, '0003aaaa-x');
  assert.equal(v.entries[2].session, '0001aaaa-x');
  assert.equal(v.entries[3].session, '0024aaaa-x');
  assert.equal(v.entries.length, 21); assert.equal(v.hidden, 4);
  assert.match(c.listText(self), /还有 4 个未列出，peer_list 传 all: true 看全部。/);
  const all = c.listView(self, { all: true });
  assert.equal(all.entries.length, 25); assert.equal(all.hidden, 0);
  assert.doesNotMatch(c.listText(self, { all: true }), /未列出/);
  assert.ok(b);
});
