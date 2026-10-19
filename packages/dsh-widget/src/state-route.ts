/**
 * 卡片状态路由 `/api/dsh-widget/state`，挂在宿主已鉴权的 `/api` 通道上
 * （`ctx.connection.fetch`，与上游的风格文件路由同一机制：宿主先做浏览器鉴权与
 * Host/Origin 校验，再交给这里）。
 *
 * - `GET ?session=<会话 id>&path=<卡片路径>` → `{ record: StoredWidgetState | null }`
 * - `POST { session, path, title?, state }` → `{ record }`；校验失败或超过 16 KiB 回 400。
 *
 * @module @lbryany/dsh-widget/state-route
 */

import {
  cardPathSchema,
  describeIssues,
  saveStateRequestSchema,
  sessionIdSchema,
} from './bridge-contract.ts'
import type { StateStore } from './state-store.ts'

/** 请求体上限：16 KiB 状态加上路径、标题与 JSON 外壳。 */
const MAX_BODY_BYTES = 64 * 1024

/**
 * 回一个 JSON 响应。
 * @param status - HTTP 状态码。
 * @param body - 响应体。
 * @returns 响应。
 */
function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

/**
 * 处理一次状态路由请求。
 * @param store - 状态存储；undefined 表示宿主没有 home 目录。
 * @param request - 请求。
 * @returns 响应。
 */
export async function handleStateRequest(store: StateStore | undefined, request: Request): Promise<Response> {
  if (store === undefined) return json(503, { error: 'unavailable', message: 'host has no DSH home' })
  if (request.method === 'GET' || request.method === 'HEAD') {
    const url = new URL(request.url)
    const session = sessionIdSchema.safeParse(url.searchParams.get('session'))
    const path = cardPathSchema.safeParse(url.searchParams.get('path'))
    if (!session.success || !path.success) return json(400, { error: 'invalid-params', message: 'session and path are required' })
    return json(200, { record: await store.load(session.data, path.data) })
  }
  if (request.method !== 'POST') return json(405, { error: 'method-not-allowed' })
  const text = await request.text()
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return json(413, { error: 'too-large' })
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return json(400, { error: 'invalid-params', message: 'body is not JSON' })
  }
  const parsed = saveStateRequestSchema.safeParse(body)
  if (!parsed.success) return json(400, { error: 'invalid-params', message: describeIssues(parsed.error) })
  const { session, path, title, state } = parsed.data
  try {
    const record = await store.save(session, path, state, title)
    return json(200, { record })
  } catch (error) {
    return json(500, { error: 'failed', message: error instanceof Error ? error.message : String(error) })
  }
}
