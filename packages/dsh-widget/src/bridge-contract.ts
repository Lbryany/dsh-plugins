/**
 * 卡片桥的契约：frame 里的 `window.dsh` 与宿主之间的消息格式、数值上限与 zod 校验。
 * node 半边（状态路由、系统提示段）和浏览器半边（卡片）共用这一份，frame 内的桥脚本
 * 只做同样数值的轻量预检，最终以这里的校验为准。
 *
 * 数值沿用 ZCode Gen UI 公开契约：单张卡片状态序列化后 ≤ 16 KiB；回流模型的
 * modelContent 最多 100 条、合计 ≤ 64 KiB；追问正文 ≤ 64 KiB、标题 ≤ 250 字。
 *
 * @module @lbryany/dsh-widget/bridge-contract
 */

import { z } from 'zod'

/** frame→卡片的桥调用。 */
export const BRIDGE_MESSAGE_TYPE = 'dsh-widget:bridge'
/** 卡片→frame 的调用结果。 */
export const BRIDGE_RESULT_TYPE = 'dsh-widget:bridge-result'
/** frame 内派发的状态 / 主题事件名。 */
export const GLOBALS_EVENT = 'dsh:set_globals'

/** 单张卡片状态（modelContent + privateContent）序列化后的上限。 */
export const STATE_MAX_BYTES = 16 * 1024
/** 回流模型的条数上限。 */
export const MODEL_STATE_MAX_ITEMS = 100
/** 回流模型的总字节上限（JSON 正文）。 */
export const MODEL_STATE_MAX_BYTES = 64 * 1024
/** 单会话保存的卡片状态条数上限，超出按 updatedAt 淘汰最旧。 */
export const SESSION_STATE_MAX_ENTRIES = 100
/** 追问正文上限（UTF-8 字节）。 */
export const PROMPT_MAX_BYTES = 64 * 1024
/** 追问标题上限（字符）。 */
export const TITLE_MAX_CHARS = 250
/** 手势门：距 frame 内最近一次可信的用户输入超过这么久就拒绝。 */
export const GESTURE_WINDOW_MS = 1500
/** 卡片追问在对话里的文本标记。 */
export const FOLLOW_UP_MARK = '[卡片追问] '
/** 确认框里显示的追问正文字数。 */
export const FOLLOW_UP_PREVIEW_CHARS = 500
/** 状态读写路由（宿主已鉴权的 /api 通道）。 */
export const STATE_PATH = '/api/dsh-widget/state'
/** 卡片片段路径（状态的键）长度上限。 */
export const CARD_PATH_MAX_CHARS = 4096

/** 桥能调用的方法。`tweak.*` 为参数面板预留，本版不实现。 */
export const BRIDGE_METHODS = ['state.set', 'followUp', 'openExternal', 'interaction.register'] as const
export type BridgeMethod = typeof BRIDGE_METHODS[number]

/** 桥调用失败的原因码。 */
export type BridgeErrorCode =
  | 'invalid-params'
  | 'unknown-method'
  | 'unavailable'
  | 'no-user-gesture'
  | 'cancelled'
  | 'failed'

/** JSON 值：不含函数、undefined、NaN / Infinity、symbol、bigint。 */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() => z.union([
  z.null(),
  z.boolean(),
  z.number().finite(),
  z.string(),
  z.array(jsonValueSchema),
  z.record(z.string(), jsonValueSchema),
]))

/** 一张卡片的状态快照。 */
export interface WidgetState {
  modelContent: JsonValue
  privateContent: JsonValue
}

/**
 * UTF-8 字节数。
 * @param text - 文本。
 * @returns 字节数。
 */
export function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length
}

/** setWidgetState 的参数：只许两个键，缺省视为 null，序列化后 ≤ 16 KiB。 */
export const widgetStateSchema: z.ZodType<WidgetState, z.ZodTypeDef, unknown> = z.object({
  modelContent: jsonValueSchema.optional(),
  privateContent: jsonValueSchema.optional(),
}).strict().transform(state => ({
  modelContent: state.modelContent ?? null,
  privateContent: state.privateContent ?? null,
})).superRefine((state, issue) => {
  if (utf8Bytes(JSON.stringify(state)) > STATE_MAX_BYTES) {
    issue.addIssue({ code: z.ZodIssueCode.custom, message: `widget state exceeds ${STATE_MAX_BYTES} bytes` })
  }
})

/** sendFollowUpMessage 的参数。 */
export const followUpSchema = z.object({
  prompt: z.string().min(1).refine(text => text.trim().length > 0, 'prompt is blank')
    .refine(text => utf8Bytes(text) <= PROMPT_MAX_BYTES, `prompt exceeds ${PROMPT_MAX_BYTES} bytes`),
  title: z.string().max(TITLE_MAX_CHARS).optional(),
}).strict()
export type FollowUpParams = z.infer<typeof followUpSchema>

export const interactionActionSchema = z.object({
  label: z.string().trim().min(1).max(100),
  intent: z.string().trim().min(1).refine(text => utf8Bytes(text) <= PROMPT_MAX_BYTES),
  fieldLabels: z.record(z.string().max(100), z.string().trim().min(1).max(100))
    .refine(labels => Object.keys(labels).length <= 64).optional(),
}).strict()
export type InteractionAction = z.infer<typeof interactionActionSchema>
export const interactionRegistrationSchema = interactionActionSchema.extend({ epoch: z.string().min(1).max(128) }).strict()
export type InteractionRegistration = z.infer<typeof interactionRegistrationSchema>

/**
 * 是否 http(s) 绝对地址。
 * @param href - 地址。
 * @returns 是则 true。
 */
export function isHttpUrl(href: string): boolean {
  try {
    const url = new URL(href)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/** openExternal 的参数：只认 http(s)。 */
export const openExternalSchema = z.object({
  href: z.string().max(8192).refine(isHttpUrl, 'only http(s) links can be opened'),
}).strict()
export type OpenExternalParams = z.infer<typeof openExternalSchema>

/** frame→卡片的一次调用。 */
export const bridgeRequestSchema = z.object({
  type: z.literal(BRIDGE_MESSAGE_TYPE),
  token: z.string(),
  id: z.number().int().nonnegative(),
  method: z.string().max(64),
  params: z.unknown(),
})
export type BridgeRequest = z.infer<typeof bridgeRequestSchema>

/** 卡片→frame 的一次结果。 */
export type BridgeResult =
  | { type: typeof BRIDGE_RESULT_TYPE; token: string; id: number; ok: true; value: unknown }
  | { type: typeof BRIDGE_RESULT_TYPE; token: string; id: number; ok: false; error: BridgeErrorCode; message?: string }

/** 卡片片段路径：上游 visualize 报告给模型的那个路径（`~/` 开头或绝对路径）。 */
export const cardPathSchema = z.string().min(1).max(CARD_PATH_MAX_CHARS)
  // eslint-disable-next-line no-control-regex
  .refine(path => !/[\u0000-\u001f]/u.test(path), 'card path has control characters')

/** 会话 id。 */
export const sessionIdSchema = z.string().min(1).max(256)

/** POST 状态路由的请求体。 */
export const saveStateRequestSchema = z.object({
  session: sessionIdSchema,
  path: cardPathSchema,
  title: z.string().max(TITLE_MAX_CHARS).optional(),
  state: widgetStateSchema,
}).strict()
export type SaveStateRequest = z.infer<typeof saveStateRequestSchema>

/** 落盘的一条卡片状态。 */
export interface StoredWidgetState {
  path: string
  title?: string
  state: WidgetState
  updatedAt: number
}

/**
 * 把 zod 错误压成一行。
 * @param error - zod 错误。
 * @returns 一行说明。
 */
export function describeIssues(error: z.ZodError): string {
  return error.issues.map(issue => `${issue.path.join('.') || '(root)'}: ${issue.message}`).join('; ')
}
