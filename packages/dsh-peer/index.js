// dsh 插件壳：注入 agents / tools（commands、sessionTitle 可选），把 dsh 的会话事件接到 lib/core.js
import { defineTool } from '@deepseek-ai/dsh-tools';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createPeerCore } from './lib/core.js';
import { PEER_POLICY } from './lib/policy.js';
import { requestTools } from './lib/request-tools.js';
import { protectionResponse } from './lib/status-route.js';
import { defaultProcStartOf, resolvePeerDir } from './lib/registry.js';

export const name = 'dsh-peer';
export const inject = ['agents', 'tools'];

const TAIL = '这是 dsh 会话之间的 agent 通道（本机会话直连，远端经中心）；对方是另一个 agent，不是用户。';
const TEXT_OUTPUT = {
  schema: { type: 'object', additionalProperties: false, properties: { ok: { type: 'boolean', required: true }, text: { type: 'string', required: true } } },
  render: (_args, v) => [{ type: 'text', text: v.text }],
};

const SEND_OUTPUT = {
  schema: { type: 'object', additionalProperties: false, properties: {
    ok: { type: 'boolean', required: true }, text: { type: 'string', required: true },
    display: { type: 'object', additionalProperties: false, properties: {
      version: { type: 'number', required: true }, id: { type: 'string', required: true },
      target: { type: 'object', additionalProperties: false, properties: { name: { type: 'string', required: true }, session: { type: 'string', required: true } }, required: true },
      text: { type: 'string', required: true }, outcome: { type: 'string', required: true },
      reason: { type: 'string' }, retryAfterMs: { type: 'number' },
    } },
  } },
  render: (_args, v) => [{ type: 'text', text: v.text }],
  presentationMeta: (_args, v) => v.display ? { peer: v.display } : null,
};

// --profile <p> 或 --profile=<p>；没有就 null（只是信息字段）
function profileFromArgv(argv = process.argv) {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--profile') return argv[i + 1] || null;
    if (argv[i].startsWith('--profile=')) return argv[i].slice('--profile='.length) || null;
  }
  return null;
}

const sessionIdOf = (session) => (session && ((session.header && session.header.id) || session.id)) || null;

export function apply(ctx, config = {}) {
  const pid = process.pid;
  const dir = config.dir || resolvePeerDir();
  let titles = null; // sessionTitle 服务（可选）
  let durableSessions = null;
  const titleOf = (agent) => { try { return (titles && titles.get(agent.session)?.title) || undefined; } catch { return undefined; } };

  const core = createPeerCore({
    dir, pid,
    procStart: defaultProcStartOf(pid),
    profile: profileFromArgv(),
    dshHome: process.env.DSH_HOME || join(homedir(), '.dsh'), // dsh 缺省 DSH_HOME 为 ~/.dsh
    argv1: process.argv[1] || null,
    fixedName: (process.env.DSH_PEER_NAME || config.name || '').trim() || null,
    agents: ctx.agents,
    protection: config.protection,
    requests: config.requests,
    hub: config.hub,
    persistMessage: agent => durableSessions?.flush(agent.session) ?? Promise.resolve(false),
    namesFile: config.namesFile,
    makeMessage: (text, source) => createUserMessage({ content: [{ type: 'text', text }], source }),
    log: (line) => console.error(line), // 写 stderr：headless --json 的 stdout 只放 NDJSON 事件
  });
  ctx.inject(['sessions'], c => {
    durableSessions = c.sessions;
    c.effect(() => () => { durableSessions = null; }, 'dsh-peer.durability');
  });

  // 会话日志里是否已有用户消息：左栏点开的旧会话、resume 回来的会话有；Web UI 预建的空草稿没有
  const hasUserMessage = (session) => {
    try { return session.deriveMessages().some((m) => m && m.role === 'user'); } catch { return true; } // 读不到时按有处理，不让会话消失
  };
  const infoOf = (agent) => {
    const header = (agent.session && agent.session.header) || {};
    return { id: agent.id, cwd: header.cwd || null, origin: header.origin, status: agent.status, title: titleOf(agent), hasUserMessage: hasUserMessage(agent.session) };
  };
  // 调用方会话：子 agent 会话不登记，沿 parentSession 找到登记过的根会话，用它的身份发
  const callerOf = (agent) => {
    let a = agent; const seen = new Set();
    while (a && !seen.has(a.id)) {
      if (core.has(a.id)) return a.id;
      seen.add(a.id);
      const parent = a.session && a.session.header && a.session.header.parentSession;
      a = parent ? ctx.agents.get(parent) : undefined;
    }
    return agent ? agent.id : null;
  };

  // 初始登记：插件装上时已存在的会话
  try { for (const agent of ctx.agents.list()) core.register(infoOf(agent)); } catch { /* list 不可用时等事件 */ }

  // @mode serial：只做同步登记，不 await whenIdle
  ctx.on('agent/created', ({ agent }) => { core.register(infoOf(agent)); });
  ctx.on('agent/disposed', ({ agent }) => { core.unregister(agent.id); });
  ctx.on('session/disposed', (session) => { const id = sessionIdOf(session); if (id) core.unregister(id); });
  ctx.on('agent/status', ({ agent, status }) => { core.setStatus(agent.id, status); });
  ctx.on('session/event', (session, event) => {
    // 空草稿的第一条用户消息：此刻才登记（固定名也在此刻分配）
    if (event && event.type === 'user/message') { const id = sessionIdOf(session); if (id && core.isPending(id)) core.noteUserMessage(id); if (id) core.consume(id, event.data?.source); }
    if (event && event.type === 'session/title' && event.data && event.data.title) core.setTitle(sessionIdOf(session), event.data.title);
  });

  // 标题服务可选：出现时补全已登记会话的标题
  ctx.inject(['sessionTitle'], (c) => {
    titles = c.sessionTitle;
    try { for (const agent of ctx.agents.list()) { const t = titleOf(agent); if (t) core.setTitle(agent.id, t); } } catch { /* 忽略 */ }
    c.effect(() => () => { titles = null; }, 'dsh-peer.titles');
  });

  ctx.tools.register(defineTool({
    name: 'peer_list',
    description: '发现 peer 地址/状态（本机会话与中心上的远端会话；远端与本地重名时用 name@device）。all 查看全部，details 查看目录等完整信息。',
    parameters: { all: { type: 'boolean' }, details: { type: 'boolean' } },
    output: TEXT_OUTPUT,
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const from = callerOf(exec?.agent), options = { all: args.all === true };
      if (args.details) return { ok: true, text: await core.listText(from, options) };
      const view = await core.listView(from, options);
      const line = e => e.via ? `${e.address}${e.self ? ' (self)' : ''} [${e.via === 'hub' ? `hub, ${e.device || '?'}` : 'local'}]: ${e.status}` : `${e.name}${e.self ? ' (self)' : ''}: ${e.status}`;
      return { ok: true, text: view.entries.map(line).join('\n') + (view.hidden ? `\n另有 ${view.hidden} 个，all:true 查看。` : '') + (view.hubOffline ? '\n中心离线：只列出本机会话。' : '') };
    },
  }));

  ctx.tools.register(defineTool({
    name: 'peer_send',
    description: `旧端兼容，不结束本轮。任务优先 peer_request/reply；只发新增任务、问题或一次结果。纯确认、感谢、告别不发送；保护错误后停止，不重试或换地址。${TAIL}`,
    parameters: {
      to: { type: 'string', required: true, description: '名字、name@device 或ID前缀(≥4位)' },
      text: { type: 'string', required: true },
      steer: { type: 'boolean', description: '仅用户要求插话时 true' },
    },
    output: SEND_OUTPUT,
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const r = await core.send({ to: args.to, text: args.text, steer: args.steer === true, from: callerOf(exec && exec.agent) });
      return { ok: r.ok, text: r.text, ...(r.display ? { display: JSON.parse(JSON.stringify(r.display)) } : {}) };
    },
  }));

  ctx.tools.register(defineTool({
    name: 'peer_rename',
    description: '仅用户要求时改本会话 peer 名字。小写字母、数字、-、_，最多40字符。',
    parameters: { name: { type: 'string', required: true } },
    output: TEXT_OUTPUT,
    isConcurrencySafe: () => true,
    async execute(args, exec) { const r = await core.rename(callerOf(exec && exec.agent), args.name); return { ok: r.ok, text: r.text }; },
  }));

  for (const tool of requestTools(core, callerOf)) ctx.tools.register(tool);

  ctx.inject(['systemPrompt'], c => {
    if (config.promptPolicy === false) return;
    c.effect(() => c.systemPrompt.section({ name: 'dsh-peer:policy',
      order: c.systemPrompt.getSectionOrder('TEAM_POLICY'), text: PEER_POLICY, interpolate: false }), 'dsh-peer.policy');
  });

  // Exact Fetch routes are authenticated and restricted to the owner by the host.
  // The handler additionally requires the receiving session to be registered and live.
  ctx.inject(['connection'], c => {
    const routes = c.get('connection')?.fetch;
    if (typeof routes?.register !== 'function') return;
    c.effect(() => routes.register({ path: '/api/dsh-peer/status', methods: ['GET'], requestBody: 'buffered',
      fetch: request => protectionResponse(core, ctx.agents, request) }), 'dsh-peer.status');
  });

  // 斜杠命令可选：headless 没有 commands 服务时静默跳过
  ctx.inject(['commands'], (c) => {
    c.effect(() => c.commands.register({
      name: 'peers',
      description: '列出 peer：本机正在运行的 dsh 会话，以及配置中心时的远端会话',
      handler: ({ agent }) => mapMaybe(core.peersText(callerOf(agent)), text => ({ kind: 'success', text })),
    }), 'dsh-peer.cmd.peers');
    c.effect(() => c.commands.register({
      name: 'peer-resume', description: '恢复本会话接收指定 peer 的消息；不重发、不启动模型',
      input: { hint: '<名字或会话 ID>' },
      handler: ({ agent, rawInput }) => {
        const address = String(rawInput || '').trim().replace(/^@/, '');
        if (!address) return { kind: 'error', text: '用法：/peer-resume <名字或会话 ID>' };
        return mapMaybe(core.resume(callerOf(agent), address), r => ({ kind: r.ok ? 'success' : 'error', text: r.text }));
      },
    }), 'dsh-peer.cmd.peer-resume');
    c.effect(() => c.commands.register({
      name: 'peer-name',
      description: '给本会话起 peer 名字，别的会话用它给你发消息',
      input: { hint: '<名字>' },
      handler: ({ agent, rawInput }) => {
        const want = String(rawInput || '').trim();
        if (!want) { const me = core.get(callerOf(agent)); return { kind: 'success', text: me ? `本会话的 peer 名字是 ${me.name}。` : '本会话没有登记为 peer。' }; }
        return mapMaybe(core.rename(callerOf(agent), want), r => ({ kind: r.ok ? 'success' : 'error', text: r.text }));
      },
    }), 'dsh-peer.cmd.peer-name');
  });

  const onExit = () => { void core.stop(); };
  ctx.effect(() => {
    core.start().then(
      () => console.error(`[dsh-peer] 已登记 pid ${pid}，${core.mode === 'mixed' ? '本机 socket + 中心' : 'socket'} ${core.transport.path}`),
      (error) => console.warn(`[dsh-peer] 启动失败：${error && error.message}`),
    );
    process.on('exit', onExit); // 兜底：异常退出时也删自己的三件
    return () => { process.off('exit', onExit); return core.stop(); };
  }, 'dsh-peer.registry');
}

function mapMaybe(value, fn) { return value && typeof value.then === 'function' ? value.then(fn) : fn(value); }
