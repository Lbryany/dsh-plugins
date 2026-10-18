import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { FileModelsStore, defaultModelsCachePath } from '../src/models-store.ts'

const entry = { models: [{ id: 'm1', name: 'M1', api: 'openai-completions', provider: 'codebuddy', baseUrl: 'https://x/v2', reasoning: true, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 1, maxTokens: 1 }], checkedAt: 123 }

test('file store round-trips, deletes, and tolerates a corrupt file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cb-models-'))
  const path = join(dir, 'nested', 'models-cache.json')
  const store = new FileModelsStore(path)
  assert.equal(await store.read('codebuddy'), undefined)
  await store.write('codebuddy', entry as never)
  assert.deepEqual(await store.read('codebuddy'), entry)
  assert.equal(await store.read('other'), undefined)
  const raw = JSON.parse(await readFile(path, 'utf8')) as { version: number }
  assert.equal(raw.version, 1)
  await store.delete('codebuddy')
  assert.equal(await store.read('codebuddy'), undefined)
  await writeFile(path, '{not json', 'utf8')
  assert.equal(await new FileModelsStore(path).read('codebuddy'), undefined)
  await new FileModelsStore(path).write('codebuddy', entry as never)
  assert.deepEqual(await new FileModelsStore(path).read('codebuddy'), entry)
})

test('concurrent writes are serialized', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cb-models-'))
  const store = new FileModelsStore(join(dir, 'c.json'))
  await Promise.all([store.write('a', entry as never), store.write('b', entry as never), store.delete('a')])
  assert.equal(await store.read('a'), undefined)
  assert.deepEqual(await store.read('b'), entry)
})

test('default path lives under DSH home', () => {
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = '/tmp/dsh-home-x'
  try { assert.equal(defaultModelsCachePath(), '/tmp/dsh-home-x/codebuddy/models-cache.json') } finally {
    if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous
  }
})
