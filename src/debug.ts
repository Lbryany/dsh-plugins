import { appendFileSync } from 'node:fs'

/**
 * 请求级诊断（只在 PI_CODEBUDDY_DEBUG_LOG 指定文件时启用）：每次聊天请求记录请求体摘要与响应状态 / 响应头，
 * 便于在不打印凭据的前提下定位网关 4xx。PI_CODEBUDDY_STRIP=tools,reasoning_effort,stream_options,temperature,max_tokens
 * 可按字段名从请求体里去掉指定字段做对照实验（只在诊断开启时生效）。
 */
const LOG_PATH = process.env.PI_CODEBUDDY_DEBUG_LOG?.trim() || undefined
const STRIP = new Set((process.env.PI_CODEBUDDY_STRIP ?? '').split(',').map(s => s.trim()).filter(Boolean))

export const requestDebugEnabled = LOG_PATH !== undefined

export function debugLine(event: string, details: Record<string, unknown>): void {
  if (!LOG_PATH) return
  try { appendFileSync(LOG_PATH, `${JSON.stringify({ at: new Date().toISOString(), event, ...details })}\n`, 'utf8') } catch { /* 诊断不影响请求 */ }
}

function summarize(payload: Record<string, unknown>): Record<string, unknown> {
  const { messages, tools, ...rest } = payload
  const list = Array.isArray(messages) ? messages as Array<{ role?: string; content?: unknown }> : []
  return {
    fields: rest,
    bytes: Buffer.byteLength(JSON.stringify(payload)),
    messages: list.map(m => `${m.role}:${typeof m.content === 'string' ? m.content.length : JSON.stringify(m.content ?? '').length}`),
    tools: Array.isArray(tools) ? tools.length : 0,
    toolNames: Array.isArray(tools) ? (tools as Array<{ function?: { name?: string } }>).map(t => t.function?.name).slice(0, 60) : [],
  }
}

/** 记录请求摘要并应用 PI_CODEBUDDY_STRIP；返回要发送的请求体。 */
export function debugPayload(payload: unknown, sessionId: string | undefined): unknown {
  if (!LOG_PATH || typeof payload !== 'object' || payload === null) return payload
  let next = payload as Record<string, unknown>
  if (STRIP.size > 0) {
    next = { ...next }
    for (const key of STRIP) delete next[key]
  }
  debugLine('chat.request', { sessionId, stripped: [...STRIP], ...summarize(next) })
  return next
}

export function debugResponse(status: number, headers: Record<string, string>, sessionId: string | undefined): void {
  if (!LOG_PATH) return
  const safe: Record<string, string> = {}
  for (const [k, v] of Object.entries(headers)) if (!/authorization|cookie|token/i.test(k)) safe[k] = v
  debugLine('chat.response', { sessionId, status, headers: safe })
}

/**
 * 诊断开启时包一层 fetch：记录聊天请求的响应状态、响应头，以及非 2xx 时的响应体前 800 字符
 * （OpenAI SDK 在 4xx 时直接抛错，onResponse 钩子拿不到）。请求头里的凭据不记录。
 */
export function debugFetch(sessionId: string | undefined): typeof fetch | undefined {
  if (!LOG_PATH) return undefined
  return async (input, init) => {
    const response = await fetch(input, init)
    try {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      const headers: Record<string, string> = {}
      response.headers.forEach((v, k) => { if (!/set-cookie/i.test(k)) headers[k] = v })
      const sent: Record<string, string> = {}
      new Headers(init?.headers).forEach((v, k) => { sent[k] = /authorization|cookie|token/i.test(k) ? `<${v.length} 字符>` : v })
      let body: string | undefined
      if (!response.ok) body = (await response.clone().text()).slice(0, 800)
      debugLine('chat.http', { sessionId, url, status: response.status, requestHeaders: sent, responseHeaders: headers, body })
    } catch { /* 诊断不影响请求 */ }
    return response
  }
}
