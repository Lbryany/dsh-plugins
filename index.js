// dsh 插件壳：注入 agents / tools（commands、sessionTitle 可选），把 dsh 的会话事件接到 lib/core.js
import { defineTool } from '@deepseek-ai/dsh-tools';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createPeerCore } from './lib/core.js';
import { defaultProcStartOf, resolvePeerDir } from './lib/registry.js';

export const name = 'dsh-peer';
export const inject = ['agents', 'tools'];

const TAIL = '这是同一台机器上 dsh 会话之间的通道；对方是另一个 agent，不是用户。';
const TEXT_OUTPUT = {
  schema: { type: 'object', additionalProperties: false, properties: { ok: { type: 'boolean', required: true }, text: { type: 'string', required: true } } },
  render: (_args, v) => [{ type: 'text', text: v.text }],
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
  const dir = resolvePeerDir();
  let titles = null; // sessionTitle 服务（可选）
  const titleOf = (agent) => { try { return (titles && titles.get(agent.session)?.title) || undefined; } catch { return undefined; } };

  const core = createPeerCore({
    dir, pid,
    procStart: defaultProcStartOf(pid),
    profile: profileFromArgv(),
    dshHome: process.env.DSH_HOME || join(homedir(), '.dsh'), // dsh 缺省 DSH_HOME 为 ~/.dsh
    argv1: process.argv[1] || null,
    fixedName: (process.env.DSH_PEER_NAME || config.name || '').trim() || null,
    agents: ctx.agents,
    makeMessage: (text, source) => createUserMessage({ content: [{ type: 'text', text }], source }),
    log: (line) => console.error(line), // 写 stderr：headless --json 的 stdout 只放 NDJSON 事件
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
    if (event && event.type === 'user/message') { const id = sessionIdOf(session); if (id && core.isPending(id)) core.noteUserMessage(id); }
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
    description: `列出本机其他正在运行的 dsh 会话（含本进程的其他会话）。用户问"还有哪些 dsh / agent 在跑"、或要给别的会话发消息前先查名字时调用。正在运行的排在前面，其余按最近活跃排序，缺省最多列 20 个。${TAIL}`,
    parameters: { all: { type: 'boolean', description: '缺省 false：最多列 20 个其他会话。为 true 时列出全部' } },
    output: TEXT_OUTPUT,
    isConcurrencySafe: () => true,
    async execute(args, exec) { return { ok: true, text: core.listText(callerOf(exec && exec.agent), { all: args.all === true }) }; },
  }));

  ctx.tools.register(defineTool({
    name: 'peer_send',
    description: `给本机另一个 dsh 会话发一条消息（异步，不等回复）。对方回复时会以"[peer 消息]"开头的消息出现在本对话。名字不确定时先调 peer_list。${TAIL}`,
    parameters: {
      to: { type: 'string', required: true, description: '对方的 peer 名字（peer_list 的"名字"列），或 sessionId 前缀（至少 4 位）' },
      text: { type: 'string', required: true, description: '要发的内容，原样投进对方会话' },
      steer: { type: 'boolean', description: '缺省 false：排到对方下一轮。只有对方正在运行、且用户要求立刻插话时才填 true（插进对方当前这一轮）' },
    },
    output: TEXT_OUTPUT,
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const r = await core.send({ to: args.to, text: args.text, steer: args.steer === true, from: callerOf(exec && exec.agent) });
      return { ok: r.ok, text: r.text };
    },
  }));

  ctx.tools.register(defineTool({
    name: 'peer_rename',
    description: `改本会话在 peer 注册表里的名字（别的会话用这个名字给你发消息）。用户要求给本会话起名、改名时调用。名字只能用小写字母、数字、-、_，小写字母或数字开头，最长 40 个字符；撞名会自动加 -2、-3。${TAIL}`,
    parameters: { name: { type: 'string', required: true, description: '新名字' } },
    output: TEXT_OUTPUT,
    isConcurrencySafe: () => true,
    async execute(args, exec) { const r = core.rename(callerOf(exec && exec.agent), args.name); return { ok: r.ok, text: r.text }; },
  }));

  // 斜杠命令可选：headless 没有 commands 服务时静默跳过
  ctx.inject(['commands'], (c) => {
    c.effect(() => c.commands.register({
      name: 'peers',
      description: '列出本机正在运行的 dsh 会话（peer）',
      handler: ({ agent }) => ({ kind: 'success', text: core.listText(callerOf(agent)) }),
    }), 'dsh-peer.cmd.peers');
    c.effect(() => c.commands.register({
      name: 'peer-name',
      description: '给本会话起 peer 名字，别的会话用它给你发消息',
      input: { hint: '<名字>' },
      handler: ({ agent, rawInput }) => {
        const want = String(rawInput || '').trim();
        if (!want) { const me = core.get(callerOf(agent)); return { kind: 'success', text: me ? `本会话的 peer 名字是 ${me.name}。` : '本会话没有登记为 peer。' }; }
        const r = core.rename(callerOf(agent), want);
        return r.ok ? { kind: 'success', text: r.text } : { kind: 'error', text: r.text };
      },
    }), 'dsh-peer.cmd.peer-name');
  });

  const onExit = () => core.stop();
  ctx.effect(() => {
    core.start().then(
      () => console.error(`[dsh-peer] 已登记 pid ${pid}，socket ${core.transport.path}`),
      (error) => console.warn(`[dsh-peer] 启动失败：${error && error.message}`),
    );
    process.on('exit', onExit); // 兜底：异常退出时也删自己的三件
    return () => { process.off('exit', onExit); core.stop(); };
  }, 'dsh-peer.registry');
}
