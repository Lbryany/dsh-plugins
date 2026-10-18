import { randomBytes } from 'node:crypto'
import { uuidv7 } from '@earendil-works/pi-ai'
import { conversationIdFor, SEND_CLI_HEADERS } from './codebuddy.ts'

/**
 * 与 CodeBuddy Code 2.168.2 对齐的逐调用请求上下文：每次模型调用拍一份不可变快照
 * （会话 / turn / 消息 id、trace、agent 类型与用途、压缩状态），再序列化成 CLI 同款请求头。
 * turn 按 dsh 消息来源划分，见 SOURCE_ROLES。
 */

const RUNTIMES = ['local-agent', 'cloud-agent', 'agent-agent'] as const
export type AgentRuntime = typeof RUNTIMES[number] | 'other'

/** 同 CLI：非字符串或空白视为未设置；已知取值（区分大小写）原样保留，其余归为 other。 */
export function normalizeAgentRuntime(value: unknown): AgentRuntime | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return (RUNTIMES as readonly string[]).includes(trimmed) ? trimmed as AgentRuntime : 'other'
}

export type CallPurpose = 'compaction' | 'session-title'
/** 同 CLI 的 compactionKindOf；dsh 不区分 reactive，故只有 manual / auto。 */
export type CompactionKind = 'manual' | 'auto'

/** 只用到 dsh RequestMessage 的角色与来源。 */
export interface CallMessage {
  readonly role: string
  readonly source?: { readonly kind: string; readonly sourceCommandId?: unknown }
}

export interface ModelCallInput {
  sessionId?: string
  purpose?: CallPurpose
  messages: readonly CallMessage[]
}

/**
 * dsh 消息来源 → turn 划分角色。CLI 只在"用户输入被接纳"时更新 conversationRequestId：
 * 子 agent 通知、steer、工具结果、注入的上下文都沿用当前 id。所以从历史末尾往前找第一条
 * 决定性消息：input 开新 turn，model（之后的工具结果、通知等都算当前任务的续写）复用；
 * context 跳过，未知来源也按 context 处理。
 * 已知局限：dsh 不区分 steer 与新输入，工具循环中途插入的用户消息会开新 turn。
 */
type SourceRole = 'input' | 'model' | 'context'
const SOURCE_ROLES: Readonly<Record<string, SourceRole>> = {
  user: 'input', schedule: 'input', webhook: 'input',
  model: 'model',
  tool: 'context', 'agent-message': 'context', 'subagent-settled': 'context', 'team-message': 'context',
  goal: 'context', 'user-question-reply': 'context',
  'system-prompt': 'context', 'model-selection': 'context', 'runtime-context': 'context',
  'working-directory': 'context', 'user-approval': 'context', 'ptc-mode': 'context', 'tool-registry': 'context',
  'skill-invocation': 'context', 'session-reference': 'context', 'plan-mode': 'context',
  'cordis-host-runner': 'context', 'compact-checkpoint': 'context',
}

export function sourceRole(message: CallMessage): SourceRole {
  if (message.role === 'system' || message.role === 'developer') return 'context'
  // 没有 source 的 user 是 dsh 尚未持久化的本轮输入（RequestUserInput）
  if (!message.source) return message.role === 'user' ? 'input' : message.role === 'assistant' ? 'model' : 'context'
  return SOURCE_ROLES[message.source.kind] ?? 'context'
}

function startsNewTurn(messages: readonly CallMessage[]): boolean {
  for (let index = messages.length - 1; index >= 0; index--) {
    const role = sourceRole(messages[index]!)
    if (role !== 'context') return role === 'input'
  }
  return true
}

/** dsh 的 /compact 命令会在压缩检查点上记 sourceCommandId，自动压缩没有。 */
function compactionKindOf(messages: readonly CallMessage[]): CompactionKind {
  const checkpoint = [...messages].reverse().find(message => message.source?.kind === 'compact-checkpoint')
  if (!checkpoint) return 'manual'
  return checkpoint.source!.sourceCommandId === undefined ? 'auto' : 'manual'
}

export interface ModelCallContext {
  readonly sessionId?: string
  readonly conversationId: string
  readonly conversationRequestId: string
  readonly rootRequestId: string
  readonly messageId: string
  readonly traceId: string
  readonly spanId: string
  readonly agentType: 'main' | 'compaction' | 'auxiliary'
  readonly purpose: 'conversation' | 'context_compact' | 'conversation_topic'
  readonly runtime: AgentRuntime
  readonly compaction?: CompactionKind
  readonly contextCompacted?: CompactionKind
}

/** 调用开始拍快照；压缩调用成功结束后回报；请求未发出就失败时归还一次性状态。 */
export interface RequestContextSource {
  begin(call: ModelCallInput): ModelCallContext | undefined
  complete?(context: ModelCallContext): void
  release?(context: ModelCallContext): void
}

export interface RequestContextOptions {
  /** 默认跟随 SEND_CLI_HEADERS；关闭时不生成上下文，也就不发这些头。 */
  enabled?: boolean
  /** 带连字符的 UUID（默认 uuidv7）。 */
  uuid?: () => string
  /** 返回 bytes 个随机字节的小写十六进制。 */
  randomHex?: (bytes: number) => string
  runtime?: () => string | undefined
  maxSessions?: number
}

interface Turn {
  readonly conversationRequestId: string
  readonly rootRequestId: string
  readonly traceId: string
}

interface SessionState {
  turn?: Turn
  compacted?: boolean
}

const PURPOSES = {
  main: { agentType: 'main', purpose: 'conversation' },
  compaction: { agentType: 'compaction', purpose: 'context_compact' },
  'session-title': { agentType: 'auxiliary', purpose: 'conversation_topic' },
} as const

export class RequestContextTracker implements RequestContextSource {
  private readonly enabled: boolean
  private readonly uuid: () => string
  private readonly randomHex: (bytes: number) => string
  private readonly runtime: () => string | undefined
  private readonly maxSessions: number
  /** 按插入顺序淘汰最久未用的会话。 */
  private readonly sessions = new Map<string, SessionState>()

  constructor(options: RequestContextOptions = {}) {
    this.enabled = options.enabled ?? SEND_CLI_HEADERS
    this.uuid = options.uuid ?? (() => uuidv7())
    this.randomHex = options.randomHex ?? (bytes => randomBytes(bytes).toString('hex'))
    this.runtime = options.runtime ?? (() => process.env.CODEBUDDY_AGENT_RUNTIME)
    this.maxSessions = options.maxSessions ?? 1000
  }

  begin(call: ModelCallInput): ModelCallContext | undefined {
    if (!this.enabled) return undefined
    const { sessionId, purpose } = call
    let turn: Turn
    let conversationId: string | undefined
    let contextCompacted: CompactionKind | undefined
    if (purpose === undefined) {
      const state = sessionId === undefined ? undefined : this.touch(sessionId, true)!
      turn = state?.turn && !startsNewTurn(call.messages) ? state.turn : this.newTurn()
      if (state) {
        state.turn = turn
        // 压缩后的第一次主调用带一次 X-Context-Compacted
        if (state.compacted) contextCompacted = compactionKindOf(call.messages)
        state.compacted = undefined
      }
    } else if (purpose === 'session-title') {
      // 同 CLI 每次新建独立的标题子会话：新会话 id、新 run id，只经 root 关联主会话当前任务
      const root = sessionId === undefined ? undefined : this.touch(sessionId, false)?.turn?.rootRequestId
      const run = this.newTurn()
      turn = root ? { ...run, rootRequestId: root } : run
      conversationId = this.uuid()
    } else {
      // 压缩复用当前 turn；没有时临时建一个，不登记
      turn = (sessionId === undefined ? undefined : this.touch(sessionId, false)?.turn) ?? this.newTurn()
    }
    const roles = PURPOSES[purpose ?? 'main']
    return Object.freeze({
      ...(sessionId === undefined ? {} : { sessionId }),
      conversationId: conversationId ?? (sessionId === undefined ? this.uuid() : conversationIdFor(sessionId)),
      ...turn,
      messageId: compact(this.uuid()),
      spanId: this.nonZeroHex(8),
      ...roles,
      runtime: normalizeAgentRuntime(this.runtime()) ?? 'other',
      // 压缩请求本身看不出触发方式，同 CLI 默认 manual
      ...(purpose === 'compaction' ? { compaction: 'manual' as const } : {}),
      ...(contextCompacted ? { contextCompacted } : {}),
    })
  }

  complete(context: ModelCallContext): void {
    if (!context.compaction || context.sessionId === undefined) return
    this.touch(context.sessionId, true)!.compacted = true
  }

  release(context: ModelCallContext): void {
    if (!context.contextCompacted || context.sessionId === undefined) return
    this.touch(context.sessionId, true)!.compacted = true
  }

  private newTurn(): Turn {
    const id = compact(this.uuid())
    return { conversationRequestId: id, rootRequestId: id, traceId: this.nonZeroHex(16) }
  }

  private touch(sessionId: string, create: boolean): SessionState | undefined {
    let state = this.sessions.get(sessionId)
    if (state) this.sessions.delete(sessionId)
    else if (!create) return undefined
    else state = {}
    this.sessions.set(sessionId, state)
    while (this.sessions.size > this.maxSessions) this.sessions.delete(this.sessions.keys().next().value!)
    return state
  }

  private nonZeroHex(bytes: number): string {
    const value = this.randomHex(bytes)
    // W3C 规定全零 trace / span id 无效
    return /[^0]/.test(value) ? value : `${value.slice(0, -1)}1`
  }
}

function compact(uuid: string): string {
  return uuid.replaceAll('-', '')
}

/** 把快照序列化为 CLI 同款请求头（大小写与 CLI 一致）。没有父 span，所以不发 X-B3-ParentSpanId。 */
export function requestContextHeaders(context: ModelCallContext): Record<string, string> {
  const { traceId, spanId } = context
  return {
    'X-Conversation-ID': context.conversationId,
    'X-Conversation-Request-ID': context.conversationRequestId,
    'X-Conversation-Message-ID': context.messageId,
    'X-Request-ID': context.messageId,
    ...(context.rootRequestId ? { 'X-Root-Request-ID': context.rootRequestId } : {}),
    'X-Agent-Type': context.agentType,
    'X-Agent-Purpose': context.purpose,
    'X-Agent-Runtime': context.runtime,
    ...(context.compaction ? { 'X-Compaction': context.compaction } : {}),
    ...(context.contextCompacted ? { 'X-Context-Compacted': context.contextCompacted } : {}),
    traceparent: `00-${traceId}-${spanId}-01`,
    b3: `${traceId}-${spanId}-1`,
    'X-B3-TraceId': traceId,
    'X-B3-SpanId': spanId,
    'X-B3-Sampled': '1',
    'X-Trace-ID': traceId,
    baggage: `codebuddy.session_id=${encodeURIComponent(context.conversationId)},`
      + `codebuddy.conversation_request_id=${encodeURIComponent(context.conversationRequestId)}`,
  }
}

/** 按头名大小写不敏感地合并，后者覆盖前者，保证每个头只有一个值。 */
export function mergeHeaders(...sources: readonly (Record<string, string> | undefined)[]): Record<string, string> {
  const merged = new Map<string, [string, string]>()
  for (const source of sources) {
    for (const [name, value] of Object.entries(source ?? {})) {
      merged.delete(name.toLowerCase())
      merged.set(name.toLowerCase(), [name, value])
    }
  }
  return Object.fromEntries(merged.values())
}
