/**
 * 卡片侧的桥：接 frame 里 `window.dsh` 发来的调用，校验后交给宿主能力，再把结果回给
 * 那个 frame。四层关口里的三层在这里：只认自己 iframe 的 `contentWindow` 发来的消息、
 * 消息体与参数过 zod、追问与外链要求宿主页面此刻有用户激活（frame 内的点击会激活祖先
 * 页面）；第四层是确认框（VisualizeCard 里）。
 *
 * 另有状态路由的浏览器客户端，以及按会话组装宿主能力（读写状态、往会话发消息）的工厂。
 *
 * @module @lbryany/dsh-widget/client/bridge-host
 */

import {
  BRIDGE_RESULT_TYPE,
  bridgeRequestSchema,
  describeIssues,
  followUpSchema,
  interactionRegistrationSchema,
  type InteractionRegistration,
  openExternalSchema,
  STATE_PATH,
  widgetStateSchema,
  type BridgeErrorCode,
  type BridgeResult,
  type FollowUpParams,
  type OpenExternalParams,
  type StoredWidgetState,
  type WidgetState,
} from '../bridge-contract.ts'

/** 带原因码的桥错误。 */
export class BridgeError extends Error {
  readonly code: BridgeErrorCode
  /**
   * @param code - 原因码。
   * @param message - 说明。
   */
  constructor(code: BridgeErrorCode, message?: string) {
    super(message ?? code)
    this.code = code
  }
}

/** 一张卡片的桥能做的事。 */
export interface BridgeHandlers {
  registerInteraction?(action: InteractionRegistration): Promise<{ supported: boolean }>
  setState(state: WidgetState): Promise<void>
  followUp(params: FollowUpParams): Promise<void>
  openExternal(params: OpenExternalParams): Promise<void>
}

/** attachBridgeHost 的输入。 */
export interface BridgeHostOptions {
  /** 与 frame 对账的令牌。 */
  token: string
  /** 当前 iframe 的 contentWindow；只接受它发来的消息。 */
  frame: () => Window | null | undefined
  /** 各方法的实现。 */
  handlers: BridgeHandlers
  /** 宿主页面此刻是否有用户激活；缺省读 navigator.userActivation，浏览器不支持时视为有。 */
  userActive?: () => boolean
  /** 挂监听的窗口（测试注入）。 */
  target?: Window
}

/**
 * 读宿主页面的用户激活。
 * @returns 有激活或无法判断时 true。
 */
export function hostUserActive(): boolean {
  const activation = (navigator as Navigator & { userActivation?: { isActive?: boolean } }).userActivation
  return typeof activation?.isActive === 'boolean' ? activation.isActive : true
}

/**
 * 在窗口上挂一张卡片的桥。
 * @param options - 令牌、frame、方法实现。
 * @returns 解除监听。
 */
export function attachBridgeHost(options: BridgeHostOptions): () => void {
  const target = options.target ?? window
  const userActive = options.userActive ?? hostUserActive
  const onMessage = (event: MessageEvent) => {
    const frame = options.frame()
    if (frame === null || frame === undefined || event.source !== frame) return
    const parsed = bridgeRequestSchema.safeParse(event.data)
    if (!parsed.success || parsed.data.token !== options.token) return
    const { id, method, params } = parsed.data
    const reply = (result: { ok: true; value: unknown } | { ok: false; error: BridgeErrorCode; message: string }) => {
      try {
        const message: BridgeResult = { type: BRIDGE_RESULT_TYPE, token: options.token, id, ...result }
        frame.postMessage(message, '*')
      } catch {
        // frame 已卸载
      }
    }
    void dispatch(method, params, options.handlers, userActive).then(
      value => reply({ ok: true, value: value ?? null }),
      (error: unknown) => reply(error instanceof BridgeError
        ? { ok: false, error: error.code, message: error.message }
        : { ok: false, error: 'failed', message: error instanceof Error ? error.message : String(error) }),
    )
  }
  target.addEventListener('message', onMessage)
  return () => target.removeEventListener('message', onMessage)
}

/**
 * 校验参数并调用对应方法。
 * @param method - 方法名。
 * @param params - 未校验的参数。
 * @param handlers - 方法实现。
 * @param userActive - 用户激活检查。
 * @returns 方法结果。
 */
async function dispatch(method: string, params: unknown, handlers: BridgeHandlers, userActive: () => boolean): Promise<unknown> {
  switch (method) {
    case 'interaction.register': {
      const action = interactionRegistrationSchema.safeParse(params)
      if (!action.success) throw new BridgeError('invalid-params', describeIssues(action.error))
      return handlers.registerInteraction ? await handlers.registerInteraction(action.data) : { supported: false }
    }
    case 'state.set': {
      const state = widgetStateSchema.safeParse(params)
      if (!state.success) throw new BridgeError('invalid-params', describeIssues(state.error))
      await handlers.setState(state.data)
      return null
    }
    case 'followUp': {
      const request = followUpSchema.safeParse(params)
      if (!request.success) throw new BridgeError('invalid-params', describeIssues(request.error))
      if (!userActive()) throw new BridgeError('no-user-gesture', 'no recent user activation on the host page')
      await handlers.followUp(request.data)
      return null
    }
    case 'openExternal': {
      const request = openExternalSchema.safeParse(params)
      if (!request.success) throw new BridgeError('invalid-params', describeIssues(request.error))
      if (!userActive()) throw new BridgeError('no-user-gesture', 'no recent user activation on the host page')
      await handlers.openExternal(request.data)
      return null
    }
    default:
      throw new BridgeError('unknown-method', `unknown bridge method: ${method}`)
  }
}

/** 一个会话里卡片能用的宿主能力。 */
export interface WidgetHost {
  readonly sessionId: string
  /** 读一张卡片的状态。 */
  loadState(path: string): Promise<StoredWidgetState | null>
  /** 写一张卡片的状态，落盘后 resolve。 */
  saveState(path: string, title: string, state: WidgetState): Promise<void>
  /** 以用户身份往本会话发一条消息。 */
  send(text: string): Promise<void>
}

/** 状态路由的浏览器客户端。 */
export interface StateClient {
  load(session: string, path: string): Promise<StoredWidgetState | null>
  save(session: string, path: string, title: string, state: WidgetState): Promise<void>
}

/**
 * 状态路由客户端：按文档地址解析 `/api` 路由（同上游风格文件路由），浏览器会话 cookie 鉴权。
 * @param fetchImpl - fetch。
 * @param base - 基地址。
 * @returns 客户端。
 */
export function stateClient(fetchImpl: typeof fetch = (...args) => fetch(...args), base: () => string = () => document.baseURI): StateClient {
  const url = () => new URL(STATE_PATH.slice(1), base())
  return {
    async load(session, path) {
      const target = url()
      target.searchParams.set('session', session)
      target.searchParams.set('path', path)
      const response = await fetchImpl(target.href, { credentials: 'same-origin', headers: { accept: 'application/json' } })
      if (!response.ok) return null
      const body = await response.json().catch(() => ({})) as { record?: StoredWidgetState | null }
      const record = body.record
      if (record === null || record === undefined || typeof record !== 'object') return null
      const state = widgetStateSchema.safeParse(record.state)
      return state.success ? { ...record, state: state.data } : null
    },
    async save(session, path, title, state) {
      const response = await fetchImpl(url().href, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ session, path, title: title.slice(0, 250), state }),
      })
      if (response.ok) return
      const body = await response.json().catch(() => ({})) as { error?: unknown; message?: unknown }
      const message = typeof body.message === 'string' ? body.message : `HTTP ${response.status}`
      throw new BridgeError(response.status === 400 || response.status === 413 ? 'invalid-params' : 'failed', message)
    },
  }
}

/** 客户端根上下文里本插件用到的部分。 */
interface SessionsLookup {
  get(name: string): unknown
}

/**
 * 按会话组装宿主能力。往会话发消息走 `ctx.get('sessions').scope(id).get('conversation').send(text)`：
 * conversation 服务按调用方的会话作用域寻址，根上下文直接调会抛错。
 * @param ctx - 客户端根上下文。
 * @param sessionId - 会话 id。
 * @param client - 状态路由客户端。
 * @returns 宿主能力；拿不到会话 id 时 undefined。
 */
export function widgetHostFor(ctx: SessionsLookup, sessionId: unknown, client: StateClient): WidgetHost | undefined {
  if (typeof sessionId !== 'string' || sessionId === '') return undefined
  return {
    sessionId,
    loadState: async path => await client.load(sessionId, path),
    saveState: async (path, title, state) => await client.save(sessionId, path, title, state),
    async send(text) {
      let sessions: unknown
      try {
        sessions = ctx.get('sessions')
      } catch {
        sessions = undefined
      }
      const scope = (sessions as { scope?: (id: string) => unknown } | undefined)?.scope?.(sessionId) as { get?: (name: string) => unknown } | undefined
      // 不能直接读 scope.conversation：会话作用域没有 inject conversation，cordis 会拒绝属性访问。
      // scope.get 取到的服务按调用方（该会话作用域）绑定，send 由此寻址到这个会话。
      let conversation: { send?: (text: string) => Promise<void> } | undefined
      try {
        conversation = scope?.get?.('conversation') as typeof conversation
      } catch {
        conversation = undefined
      }
      if (typeof conversation?.send !== 'function') throw new BridgeError('unavailable', 'this session cannot take messages here')
      await conversation.send(text)
    },
  }
}
