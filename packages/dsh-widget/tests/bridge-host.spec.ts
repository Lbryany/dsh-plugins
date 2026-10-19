// @vitest-environment jsdom
// B5 卡片侧桥：来源校验、令牌、未知方法、参数校验、用户激活、结果回给原 frame
import { describe, expect, it, vi } from 'vitest'
import { BRIDGE_MESSAGE_TYPE, BRIDGE_RESULT_TYPE } from '../src/bridge-contract.ts'
import { attachBridgeHost, BridgeError, stateClient, widgetHostFor, type BridgeHandlers } from '../src/client/bridge-host.ts'

function setup(options: { userActive?: boolean; handlers?: Partial<BridgeHandlers> } = {}) {
  let listener: ((event: MessageEvent) => void) | undefined
  const target = {
    addEventListener: (_: string, fn: (event: MessageEvent) => void) => { listener = fn },
    removeEventListener: () => { listener = undefined },
  } as unknown as Window
  const results: unknown[] = []
  const frame = { postMessage: (message: unknown) => results.push(message) } as unknown as Window
  const handlers: BridgeHandlers = {
    setState: vi.fn(async () => {}),
    followUp: vi.fn(async () => {}),
    openExternal: vi.fn(async () => {}),
    ...options.handlers,
  }
  const detach = attachBridgeHost({ token: 'call-1', frame: () => frame, handlers, target, userActive: () => options.userActive ?? true })
  const send = (data: unknown, source: unknown = frame) => listener?.({ data, source } as MessageEvent)
  const settle = async () => { for (let i = 0; i < 10; i++) await Promise.resolve() }
  return { send, results, handlers, settle, detach, frame }
}

const call = (id: number, method: string, params: unknown) => ({ type: BRIDGE_MESSAGE_TYPE, token: 'call-1', id, method, params })

describe('attachBridgeHost', () => {
  it('来源不是本 iframe 的消息被忽略', async () => {
    const host = setup()
    host.send(call(1, 'state.set', { modelContent: 1 }), {})
    host.send(call(2, 'state.set', { modelContent: 1 }), null)
    await host.settle()
    expect(host.handlers.setState).not.toHaveBeenCalled()
    expect(host.results).toEqual([])
  })

  it('令牌不符或格式不对的消息被忽略', async () => {
    const host = setup()
    host.send({ ...call(1, 'state.set', {}), token: 'other' })
    host.send({ type: BRIDGE_MESSAGE_TYPE, id: 'x', method: 'state.set' })
    host.send('hello')
    await host.settle()
    expect(host.results).toEqual([])
  })

  it('未知方法回 error', async () => {
    const host = setup()
    host.send(call(7, 'tweak.register', {}))
    await host.settle()
    expect(host.results).toEqual([{ type: BRIDGE_RESULT_TYPE, token: 'call-1', id: 7, ok: false, error: 'unknown-method', message: 'unknown bridge method: tweak.register' }])
  })

  it('state.set 过 zod：超限被拒，合法的交给宿主并回 ok', async () => {
    const host = setup()
    host.send(call(1, 'state.set', { modelContent: 'x'.repeat(20 * 1024) }))
    host.send(call(2, 'state.set', { modelContent: { choice: 'B' } }))
    await host.settle()
    expect(host.results[0]).toMatchObject({ id: 1, ok: false, error: 'invalid-params' })
    expect(host.results[1]).toEqual({ type: BRIDGE_RESULT_TYPE, token: 'call-1', id: 2, ok: true, value: null })
    expect(host.handlers.setState).toHaveBeenCalledWith({ modelContent: { choice: 'B' }, privateContent: null })
  })

  it('追问与外链要求宿主页面有用户激活', async () => {
    const host = setup({ userActive: false })
    host.send(call(1, 'followUp', { prompt: 'hi' }))
    host.send(call(2, 'openExternal', { href: 'https://example.com' }))
    await host.settle()
    expect(host.results.map(result => (result as { error?: string }).error)).toEqual(['no-user-gesture', 'no-user-gesture'])
    expect(host.handlers.followUp).not.toHaveBeenCalled()
  })

  it('外链不是 http(s) 被拒', async () => {
    const host = setup()
    host.send(call(1, 'openExternal', { href: 'javascript:alert(1)' }))
    await host.settle()
    expect(host.results[0]).toMatchObject({ ok: false, error: 'invalid-params' })
    expect(host.handlers.openExternal).not.toHaveBeenCalled()
  })

  it('宿主抛出的原因码原样带回', async () => {
    const host = setup({ handlers: { followUp: async () => { throw new BridgeError('cancelled', 'no') } } })
    host.send(call(3, 'followUp', { prompt: 'hi', title: 't' }))
    await host.settle()
    expect(host.results[0]).toMatchObject({ id: 3, ok: false, error: 'cancelled' })
  })

  it('解除后不再应答', async () => {
    const host = setup()
    host.detach()
    host.send(call(1, 'state.set', {}))
    await host.settle()
    expect(host.results).toEqual([])
  })
})

describe('stateClient', () => {
  it('GET 带会话与路径，POST 带标题与状态；400 映射为 invalid-params', async () => {
    const calls: [string, RequestInit | undefined][] = []
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push([url, init])
      if (init?.method === 'POST') return new Response(JSON.stringify({ error: 'invalid-params', message: 'too big' }), { status: 400 })
      return new Response(JSON.stringify({ record: { path: '~/a.html', state: { modelContent: 'B' }, updatedAt: 1 } }), { status: 200 })
    }) as unknown as typeof fetch
    const client = stateClient(fetchImpl, () => 'http://h/app/')
    const record = await client.load('s-1', '~/a.html')
    expect(record?.state).toEqual({ modelContent: 'B', privateContent: null })
    expect(calls[0]![0]).toBe('http://h/app/api/dsh-widget/state?session=s-1&path=%7E%2Fa.html')
    await expect(client.save('s-1', '~/a.html', '卡片', { modelContent: 1, privateContent: null })).rejects.toMatchObject({ code: 'invalid-params' })
    expect(JSON.parse(String(calls[1]![1]!.body))).toEqual({ session: 's-1', path: '~/a.html', title: '卡片', state: { modelContent: 1, privateContent: null } })
  })
})

describe('widgetHostFor', () => {
  it('经 sessions.scope(id).get(\'conversation\').send 发消息，不读作用域上的属性', async () => {
    const send = vi.fn(async () => {})
    const scoped = new Proxy({ get: (name: string) => (name === 'conversation' ? { send } : undefined) }, {
      get: (target, prop) => {
        if (prop in target) return Reflect.get(target, prop)
        throw new Error(`cannot get property "${String(prop)}" without inject`)
      },
    })
    const scope = vi.fn(() => scoped)
    const host = widgetHostFor({ get: () => ({ scope }) }, 'sess-1', stateClient(vi.fn() as never))
    await host!.send('[卡片追问] hi')
    expect(scope).toHaveBeenCalledWith('sess-1')
    expect(send).toHaveBeenCalledWith('[卡片追问] hi')
  })

  it('没有会话 id 时不给宿主；拿不到 conversation 时 unavailable', async () => {
    expect(widgetHostFor({ get: () => undefined }, undefined, stateClient(vi.fn() as never))).toBeUndefined()
    const host = widgetHostFor({ get: () => ({ scope: () => undefined }) }, 's', stateClient(vi.fn() as never))
    await expect(host!.send('x')).rejects.toMatchObject({ code: 'unavailable' })
  })
})
