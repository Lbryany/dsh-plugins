// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { interactionHelperScript } from '../src/interaction-form.ts'

function boot(saved: unknown = null) {
  document.body.innerHTML = '<form id="form"><input name="hours" type="number" value="10"><select name="plan"><option>A</option><option>B</option></select><input name="secret" value="PRIVATE"></form>'
  const saves: unknown[] = [], renders: unknown[] = []
  let capture: (() => unknown) | undefined
  const dsh = {
    widgetState: saved,
    setWidgetState: async (state: unknown) => { saves.push(state) },
    registerInteraction: async (_: unknown, read: () => unknown) => { capture = read; return { supported: true } },
  }
  const win = { dsh, dshViz: {} } as unknown as Window & { dshViz: { interaction: (def: unknown) => () => void } }
  new Function('window', interactionHelperScript())(win)
  const dispose = win.dshViz.interaction({
    form: document.querySelector('form'),
    fields: { hours: { type: 'number', min: 0, max: 50, step: 1 }, plan: { type: 'enum', values: ['A', 'B'] } },
    action: { label: '继续', intent: '分析当前选择' }, render: (value: unknown) => renders.push(value),
  })
  return { saves, renders, dispose, capture: () => capture!() }
}
describe('declarative interaction form', () => {
  it('derives presentation labels without copying option text or private fields into model values', () => {
    document.body.innerHTML = '<form><label>人数（人）<input name="n" type="number" value="8"></label><label>主题<select name="topic"><option>产品设计</option></select></label><input name="private" value="secret"></form>'
    let action: unknown, capture: (() => unknown) | undefined
    const win = { dsh: { widgetState: null, registerInteraction: async (a: unknown, read: () => unknown) => { action = a; capture = read; return { supported: true } } }, dshViz: {} } as unknown as Window & { dshViz: { interaction: (def: unknown) => () => void } }
    new Function('window', interactionHelperScript())(win)
    const dispose = win.dshViz.interaction({ form: document.querySelector('form'), fields: { n: { type: 'number' }, topic: { type: 'text' } }, action: { label: '继续', intent: '安排议程' } })
    expect(action).toMatchObject({ fieldLabels: { n: '人数（人）', topic: '主题' } })
    expect(capture!()).toEqual({ n: 8, topic: '产品设计' })
    dispose()
  })
  it('restores zero and renders without saving; capture reads uncommitted input', () => {
    const f = boot({ modelContent: { hours: 0, plan: 'B' }, privateContent: { secret: 'PRIVATE' } })
    expect(f.renders[0]).toEqual({ hours: 0, plan: 'B' })
    const input = document.querySelector('input')!
    input.value = '30'
    expect(f.capture()).toEqual({ hours: 30, plan: 'B' })
    expect(f.saves).toEqual([])
    expect(JSON.stringify(f.capture())).not.toContain('PRIVATE')
    f.dispose()
  })
  it('input renders locally; change saves once; disposal removes listeners', async () => {
    const f = boot()
    const input = document.querySelector('input')!
    input.value = '25'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    expect(f.renders.at(-1)).toEqual({ hours: 25, plan: 'A' })
    expect(f.saves).toEqual([])
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await Promise.resolve()
    expect(f.saves).toHaveLength(1)
    f.dispose(); f.dispose()
    input.dispatchEvent(new Event('change', { bubbles: true }))
    expect(f.saves).toHaveLength(1)
  })
  it('rejects invalid numbers instead of converting empty input to zero', () => {
    const f = boot()
    document.querySelector('input')!.value = ''
    expect(f.capture).toThrow()
    document.querySelector('input')!.value = '51'
    expect(f.capture).toThrow()
    f.dispose()
  })
})
