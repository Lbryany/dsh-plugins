import { readFileSync } from 'node:fs'
import { JSDOM, VirtualConsole } from 'jsdom'
import { describe, expect, it } from 'vitest'
import { buildFrameDoc } from '../src/shell.ts'
import { lintFragment } from '../src/lint.ts'

const names = ['parameter-simulator', 'option-comparison', 'step-explainer', 'analysis-dashboard', 'exploration-tool', 'explanation-page']
const read = (name: string) => readFileSync(new URL(`../assets/examples/${name}.html`, import.meta.url), 'utf8')
const documentFor = (fragment: string) => buildFrameDoc({ fragment, title: 'Fixture', themeVars: {}, colorScheme: 'light', reportToken: 'test' })
const browserGlobals = (window: JSDOM['window']) => Object.assign(window, { TextEncoder, ResizeObserver: class { observe() {} disconnect() {} } })

describe('visual quality foundations', () => {
  it('VQ01 gives page headings and figures a readable hierarchy without enlarging chat cards', () => {
    const fragment = '<header class="viz-page-header"><h1>分析</h1></header><main class="viz-page"><h2>趋势</h2><div class="viz-stat-value">128</div></main>'
    const options = { fragment, title: '层级', themeVars: {}, colorScheme: 'light' as const, reportToken: 'test' }
    const page = new JSDOM(buildFrameDoc({ ...options, variant: 'page' }))
    const card = new JSDOM(buildFrameDoc(options))
    try {
      const css = page.window.getComputedStyle(page.window.document.querySelector('h1')!)
      expect(parseFloat(css.fontSize)).toBeGreaterThanOrEqual(28)
      expect(parseFloat(page.window.getComputedStyle(page.window.document.querySelector('.viz-stat-value')!).fontSize)).toBeGreaterThanOrEqual(36)
      expect(card.window.getComputedStyle(card.window.document.querySelector('h1')!).fontSize).toBe('1.3em')
    } finally { page.window.close(); card.window.close() }
  })

  for (const name of names) {
    it(`VQ02 ${name} obeys the fragment contract and runs without script errors`, () => {
      const fragment = read(name)
      expect(lintFragment(fragment, 1_000_000).findings.filter(x => x.severity === 'error')).toEqual([])
      const errors: unknown[] = []
      const console = new VirtualConsole().on('jsdomError', e => errors.push(e))
      const dom = new JSDOM(documentFor(fragment), { runScripts: 'dangerously', virtualConsole: console, beforeParse: browserGlobals })
      try {
        const ids = [...dom.window.document.querySelectorAll('[id]')].map(el => el.id)
        expect(new Set(ids).size).toBe(ids.length)
        expect(errors).toEqual([])
      } finally { dom.window.close() }
    })
  }

  it('VQ03 each pattern changes the answer when its primary control changes', () => {
    const cases = [
      ['parameter-simulator', 'input', '#sim-rate', '20', '#sim-result', '38.8'],
      ['option-comparison', 'input', '#compare-hours', '30', '#compare-result', 'B'],
      ['step-explainer', 'click', '#step-next', '', '#step-status', '2 / 4'],
      ['analysis-dashboard', 'change', '#analysis-region', 'east', '#analysis-total', '240'],
      ['exploration-tool', 'change', '#explore-category', 'storage', '#explore-count', '2'],
      ['explanation-page', 'input', '#explain-rate', '20', '#explain-result', '800'],
    ]
    for (const [name, event, selector, value, output, expected] of cases) {
      const dom = new JSDOM(documentFor(read(name!)), { runScripts: 'dangerously', beforeParse: browserGlobals })
      try {
        const control = dom.window.document.querySelector(selector!)! as HTMLInputElement
        const before = dom.window.document.querySelector(output!)!.textContent
        control.value = value!
        control.dispatchEvent(new dom.window.Event(event!, { bubbles: true }))
        const after = dom.window.document.querySelector(output!)!.textContent
        expect(after, name).not.toBe(before)
        expect(after, name).toContain(expected)
      } finally { dom.window.close() }
    }
  })
})
