// @vitest-environment jsdom
// B4 手势门与 frame 内桥：把桥脚本放进一个可控的作用域里跑（parent、计时、事件监听都换成桩）
import { describe, expect, it } from 'vitest'
import { BRIDGE_MESSAGE_TYPE, BRIDGE_RESULT_TYPE, GLOBALS_EVENT } from '../src/bridge-contract.ts'
import { frameBridgeScript, scriptLiteral } from '../src/frame-bridge.ts'
import { buildFrameDoc } from '../src/shell.ts'

interface Posted { type: string; token: string; id: number; method: string; params: unknown }

/** 在桩作用域里跑一份桥脚本。 */
function boot(options: { mode?: 'live' | 'detached'; state?: unknown } = {}) {
  const listeners = new Map<string, ((event: unknown) => void)[]>()
  const events: unknown[] = []
  const posted: Posted[] = []
  let clock = 10_000
  const parent = { postMessage: (message: Posted) => posted.push(message) }
  const win: Record<string, unknown> = {}
  const script = frameBridgeScript({ token: 'call-1', state: (options.state ?? null) as never, theme: 'dark', mode: options.mode ?? 'live' })
  const run = new Function('parent', 'window', 'addEventListener', 'dispatchEvent', 'performance', script)
  run(
    parent,
    win,
    (name: string, listener: (event: unknown) => void) => listeners.set(name, [...listeners.get(name) ?? [], listener]),
    (event: CustomEvent) => events.push(event.detail),
    { now: () => clock },
  )
  const fire = (name: string, event: unknown) => { for (const listener of listeners.get(name) ?? []) listener(event) }
  const dsh = win.dsh as {
    widgetState: unknown
    theme: string
    setWidgetState(state: unknown): Promise<void>
    sendFollowUpMessage(options: unknown): Promise<void>
    openExternal(options: unknown): Promise<void>
  }
  return {
    dsh,
    posted,
    events,
    gesture: (trusted = true) => fire('pointerup', { isTrusted: trusted }),
    advance: (ms: number) => { clock += ms },
    reply: (id: number, ok: boolean, error?: string) => fire('message', {
      source: parent,
      data: ok ? { type: BRIDGE_RESULT_TYPE, token: 'call-1', id, ok, value: null } : { type: BRIDGE_RESULT_TYPE, token: 'call-1', id, ok, error },
    }),
    forge: (data: unknown) => fire('message', { source: {}, data }),
  }
}

const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve() }

describe('手势门', () => {
  it('没有手势时追问与外链直接 reject（no-user-gesture）', async () => {
    const frame = boot()
    await expect(frame.dsh.sendFollowUpMessage({ prompt: 'hi' })).rejects.toMatchObject({ code: 'no-user-gesture' })
    await expect(frame.dsh.openExternal({ href: 'https://example.com' })).rejects.toMatchObject({ code: 'no-user-gesture' })
    expect(frame.posted).toEqual([])
  })

  it('不可信（脚本合成）的事件不算手势', async () => {
    const frame = boot()
    frame.gesture(false)
    await expect(frame.dsh.sendFollowUpMessage({ prompt: 'hi' })).rejects.toMatchObject({ code: 'no-user-gesture' })
  })

  it('手势后 1 秒内通过，发出 followUp', async () => {
    const frame = boot()
    frame.gesture()
    frame.advance(1000)
    const sent = frame.dsh.sendFollowUpMessage({ prompt: '解释这个', title: '解释' })
    expect(frame.posted).toEqual([{ type: BRIDGE_MESSAGE_TYPE, token: 'call-1', id: 1, method: 'followUp', params: { prompt: '解释这个', title: '解释' } }])
    frame.reply(1, true)
    await expect(sent).resolves.toBeUndefined()
  })

  it('手势 1.5 秒后 reject', async () => {
    const frame = boot()
    frame.gesture()
    frame.advance(1501)
    await expect(frame.dsh.openExternal({ href: 'https://example.com' })).rejects.toMatchObject({ code: 'no-user-gesture' })
  })

  it('外链只认 http(s)', async () => {
    const frame = boot()
    frame.gesture()
    await expect(frame.dsh.openExternal({ href: 'javascript:alert(1)' })).rejects.toMatchObject({ code: 'invalid-params' })
    expect(frame.posted).toEqual([])
  })

  it('宿主回 cancelled 时 reject 带原因码', async () => {
    const frame = boot()
    frame.gesture()
    const sent = frame.dsh.sendFollowUpMessage({ prompt: 'hi' })
    frame.reply(1, false, 'cancelled')
    await expect(sent).rejects.toMatchObject({ code: 'cancelled' })
  })
})

describe('setWidgetState', () => {
  it('初始状态同步可读，返回的是副本', () => {
    const frame = boot({ state: { modelContent: { choice: 'B' }, privateContent: null } })
    const state = frame.dsh.widgetState as { modelContent: { choice: string } }
    expect(state.modelContent.choice).toBe('B')
    state.modelContent.choice = 'C'
    expect((frame.dsh.widgetState as typeof state).modelContent.choice).toBe('B')
    expect(frame.dsh.theme).toBe('dark')
  })

  it('预检：多余键、非 JSON、超过 16 KiB 都不发消息', async () => {
    const frame = boot()
    await expect(frame.dsh.setWidgetState({ modelContent: 1, other: 2 })).rejects.toMatchObject({ code: 'invalid-params' })
    await expect(frame.dsh.setWidgetState({ modelContent: () => 1 })).rejects.toMatchObject({ code: 'invalid-params' })
    await expect(frame.dsh.setWidgetState({ modelContent: Number.NaN })).rejects.toMatchObject({ code: 'invalid-params' })
    await expect(frame.dsh.setWidgetState({ modelContent: 'x'.repeat(20 * 1024) })).rejects.toMatchObject({ code: 'invalid-params' })
    expect(frame.posted).toEqual([])
  })

  it('按序排队，ack 后更新快照并派发 dsh:set_globals', async () => {
    const frame = boot()
    const first = frame.dsh.setWidgetState({ modelContent: 'A' })
    const second = frame.dsh.setWidgetState({ modelContent: 'B' })
    await flush()
    expect(frame.posted.map(message => message.params)).toEqual([{ modelContent: 'A', privateContent: null }])
    frame.reply(1, true)
    await first
    await flush()
    expect(frame.posted).toHaveLength(2)
    frame.reply(2, true)
    await second
    expect(frame.dsh.widgetState).toEqual({ modelContent: 'B', privateContent: null })
    expect(frame.events.at(-1)).toEqual({ globals: { widgetState: { modelContent: 'B', privateContent: null }, theme: 'dark' } })
  })

  it('失败不更新快照，后续调用照常', async () => {
    const frame = boot({ state: { modelContent: 'keep', privateContent: null } })
    const failed = frame.dsh.setWidgetState({ modelContent: 'X' })
    await flush()
    frame.reply(1, false, 'invalid-params')
    await expect(failed).rejects.toMatchObject({ code: 'invalid-params' })
    expect(frame.dsh.widgetState).toEqual({ modelContent: 'keep', privateContent: null })
  })

  it('伪造来源的结果被忽略', async () => {
    const frame = boot()
    const pending = frame.dsh.setWidgetState({ modelContent: 1 })
    await flush()
    frame.forge({ type: BRIDGE_RESULT_TYPE, token: 'call-1', id: 1, ok: true, value: null })
    let settled = false
    void pending.then(() => { settled = true }, () => { settled = true })
    await flush()
    expect(settled).toBe(false)
  })

  it('detached 模式只读：写入 reject unavailable', async () => {
    const frame = boot({ mode: 'detached', state: { modelContent: 1, privateContent: null } })
    expect(frame.dsh.widgetState).toEqual({ modelContent: 1, privateContent: null })
    await expect(frame.dsh.setWidgetState({ modelContent: 2 })).rejects.toMatchObject({ code: 'unavailable' })
  })
})

describe('frame 文档', () => {
  it('桥脚本在片段之前，状态内联时 < 被转义', () => {
    const doc = buildFrameDoc({
      fragment: '<script>window.seen = window.dsh</script>',
      title: 't',
      themeVars: {},
      colorScheme: 'light',
      reportToken: 'call-9',
      bridge: { state: { modelContent: '</script><script>alert(1)</script>', privateContent: null }, mode: 'live' },
    })
    expect(doc.indexOf('Object.defineProperty(window, \'dsh\'')).toBeLessThan(doc.indexOf('window.seen'))
    expect(doc).not.toContain('</script><script>alert(1)')
    expect(scriptLiteral('</script>')).toBe('"\\u003c/script>"')
  })

  it('缺省为只读桥', () => {
    const doc = buildFrameDoc({ fragment: '', title: 't', themeVars: {}, colorScheme: 'light', reportToken: 'x' })
    expect(doc).toContain('var LIVE = false;')
  })
})

describe('锚点拦截', () => {
  it('http(s) 锚点改走 openExternal，其他协议不拦', async () => {
    const listeners = new Map<string, ((event: unknown) => void)[]>()
    const posted: Posted[] = []
    const parent = { postMessage: (message: Posted) => posted.push(message) }
    let clock = 0
    const clicks: ((event: Event) => void)[] = []
    const doc = {
      readyState: 'complete',
      addEventListener: (name: string, listener: (event: Event) => void) => { if (name === 'click') clicks.push(listener) },
    }
    const script = frameBridgeScript({ token: 't', state: null, theme: 'light', mode: 'live' })
    new Function('parent', 'window', 'addEventListener', 'dispatchEvent', 'performance', 'document', script)(
      parent, {}, (name: string, listener: (event: unknown) => void) => listeners.set(name, [...listeners.get(name) ?? [], listener]),
      () => true, { now: () => clock }, doc,
    )
    for (const listener of listeners.get('pointerup') ?? []) listener({ isTrusted: true })
    clock = 100
    const link = document.createElement('a')
    link.href = 'https://example.com/docs'
    link.textContent = 'docs'
    const js = document.createElement('a')
    js.setAttribute('href', 'javascript:void(0)')
    document.body.append(link, js)
    const click = (target: Element) => {
      const event = new MouseEvent('click', { bubbles: true, cancelable: true })
      Object.defineProperty(event, 'target', { value: target })
      for (const listener of clicks) listener(event)
      return event
    }
    const external = click(link)
    expect(external.defaultPrevented).toBe(true)
    expect(posted).toEqual([{ type: BRIDGE_MESSAGE_TYPE, token: 't', id: 1, method: 'openExternal', params: { href: 'https://example.com/docs' } }])
    const inert = click(js)
    expect(inert.defaultPrevented).toBe(false)
    expect(posted).toHaveLength(1)
  })
})

it('加载后派发一次 dsh:set_globals', async () => {
  const frame = boot({ state: { modelContent: 'B', privateContent: null } })
  await new Promise(resolve => setTimeout(resolve, 5))
  expect(frame.events[0]).toEqual({ globals: { widgetState: { modelContent: 'B', privateContent: null }, theme: 'dark' } })
  expect(GLOBALS_EVENT).toBe('dsh:set_globals')
})
