// @vitest-environment jsdom
import { expect, it, vi } from 'vitest'
import { buildFrameDoc } from '../src/shell.ts'

it('lets inline frames shrink to their content after wrapping or theme changes', () => {
  const doc = buildFrameDoc({ fragment: '<p>Card</p>', title: 'Card', reportToken: 'height-test', themeVars: {}, colorScheme: 'light' })
  const parsed = new DOMParser().parseFromString(doc, 'text/html')
  const post = vi.fn(), observe = vi.fn()
  const run = new Function('document', 'parent', 'ResizeObserver', 'addEventListener', parsed.scripts[parsed.scripts.length - 1]!.textContent!)
  const fake = { documentElement: { scrollHeight: 720 }, body: { scrollHeight: 280, getBoundingClientRect: () => ({ height: 280 }) } }
  run(fake, { postMessage: post }, class { observe = observe }, () => {})
  expect(post.mock.calls[0]![0].height).toBe(280)
  expect(observe).toHaveBeenCalledWith(fake.body)
})
