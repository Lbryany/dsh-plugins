import { randomBytes } from 'node:crypto'
import { uuidv7 } from '@earendil-works/pi-ai'
import { conversationIdFor, SEND_CLI_HEADERS } from './codebuddy.ts'

/**
 * 与 CodeBuddy Code 2.168.2 对齐的逐调用请求上下文：每次模型调用拍一份不可变快照
 * （会话 / turn / 消息 id、trace、agent 类型与用途、压缩状态），再序列化成 CLI 同款请求头。
 * turn 由 dsh 传入的消息历史划分：最后一条是 user 开新 turn，tool / assistant 续用当前 turn。
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
/** CLI 不知道压缩触发方式时默认 manual；dsh 也不告诉我们。 */
export type CompactionKind = 'manual'

export interface ModelCallInput {
  sessionId?: string
  purpose?: CallPurpose
  messages: readonly { role: string }[]
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

/** 适配器只依赖这两个方法：调用开始拍快照，压缩调用成功结束后回报。 */
export interface RequestContextSource {
  begin(call: ModelCallInput): ModelCallContext | undefined
  complete?(context: ModelCallContext): void
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
  compacted?: CompactionKind
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
    let contextCompacted: CompactionKind | undefined
    if (purpose === undefined) {
      const state = sessionId === undefined ? undefined : this.touch(sessionId, true)!
      const role = [...call.messages].reverse().find(message => message.role !== 'system')?.role
      const continues = role === 'tool' || role === 'assistant'
      turn = continues && state?.turn ? state.turn : this.newTurn()
      if (state) {
        state.turn = turn
        // 压缩后的第一次主调用带一次 X-Context-Compacted
        contextCompacted = state.compacted
        state.compacted = undefined
      }
    } else {
      // 一次性辅助调用复用当前 turn；没有时临时建一个，不登记
      turn = (sessionId === undefined ? undefined : this.touch(sessionId, false)?.turn) ?? this.newTurn()
    }
    const roles = PURPOSES[purpose ?? 'main']
    return Object.freeze({
      ...(sessionId === undefined ? {} : { sessionId }),
      conversationId: sessionId === undefined ? this.uuid() : conversationIdFor(sessionId),
      ...turn,
      messageId: compact(this.uuid()),
      spanId: this.nonZeroHex(8),
      ...roles,
      runtime: normalizeAgentRuntime(this.runtime()) ?? 'other',
      ...(purpose === 'compaction' ? { compaction: 'manual' as const } : {}),
      ...(contextCompacted ? { contextCompacted } : {}),
    })
  }

  complete(context: ModelCallContext): void {
    if (!context.compaction || context.sessionId === undefined) return
    this.touch(context.sessionId, true)!.compacted = context.compaction
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
