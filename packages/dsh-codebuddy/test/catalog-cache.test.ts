import assert from 'node:assert/strict'
import test from 'node:test'
import type { Credential, CredentialStore, Models } from '@earendil-works/pi-ai'
import { CodeBuddyService } from '../src/service.ts'

function fixture(opts: { stored?: { models: unknown[]; checkedAt?: number }; ttl?: number; credential?: boolean } = {}) {
  let credential: Credential | undefined = opts.credential === false ? undefined
    : { type: 'oauth', access: 'a', refresh: 'r', expires: 1234, baseUrl: 'https://copilot.tencent.com' }
  let now = 1_000_000
  let networkRefreshes = 0, offlineRefreshes = 0, replaced = 0
  let provided: Array<{ id: string; name: string; reasoning: boolean; contextWindow: number }> = []
  let stored = opts.stored
  const deleted: string[] = []
  const store: CredentialStore = {
    read: async () => credential, list: async () => [],
    modify: async (_id, fn) => { credential = await fn(credential); return credential },
    delete: async () => { credential = undefined },
  }
  const models = {
    getModels: () => provided,
    refresh: async (input: { allowNetwork?: boolean }) => {
      if (input.allowNetwork === false) { offlineRefreshes++; if (stored) provided = stored.models as never; return { aborted: false, errors: new Map() } }
      networkRefreshes++; provided = [{ id: 'net', name: 'Net', reasoning: true, contextWindow: 10 }]
      return { aborted: false, errors: new Map() }
    },
    logout: async () => store.delete('codebuddy'),
  } as unknown as Models
  const modelsStore = { read: async () => stored as never, delete: async (id: string) => { deleted.push(id); stored = undefined } }
  const service = new CodeBuddyService({ models, store, modelsStore, catalogTtlMs: opts.ttl, now: () => now,
    registration: { replace() { replaced++ } }, logger: { info() {}, error() {} } })
  return { service, tick: (ms: number) => { now += ms }, counts: () => ({ networkRefreshes, offlineRefreshes, replaced }), deleted }
}

const storedModels = [{ id: 'old', name: 'Old', reasoning: false, contextWindow: 5 }]

test('restore brings the stored catalog back without network and marks it cached', async () => {
  const f = fixture({ stored: { models: storedModels, checkedAt: 777 } })
  const view = await f.service.restore()
  assert.equal(view.status, 'ready')
  assert.equal(view.cached, true)
  assert.equal(view.source, 'stored')
  assert.equal(view.updatedAt, 777)
  assert.deepEqual(view.models.map(m => m.id), ['old'])
  assert.deepEqual(f.counts(), { networkRefreshes: 0, offlineRefreshes: 1, replaced: 1 })
  // a cached catalog is not fresh: the next ordinary refresh still goes to the network
  await f.service.refreshModels({ allowNetwork: true })
  assert.equal(f.counts().networkRefreshes, 1)
  assert.equal((await f.service.status()).catalog.cached, false)
})

test('restore is a no-op without credentials or without a stored catalog', async () => {
  const none = fixture({ credential: false, stored: { models: storedModels } })
  assert.equal((await none.service.restore()).status, 'idle')
  assert.equal(none.counts().offlineRefreshes, 0)
  const empty = fixture({ stored: { models: [] } })
  assert.equal((await empty.service.restore()).status, 'idle')
  assert.equal(empty.counts().offlineRefreshes, 0)
})

test('ordinary refreshes inside the TTL skip the network; force and expiry go through', async () => {
  const f = fixture({ ttl: 60_000 })
  await f.service.refreshModels({ allowNetwork: true })
  await f.service.refreshModels({ allowNetwork: true })
  await f.service.refreshModels({ allowNetwork: true })
  assert.equal(f.counts().networkRefreshes, 1)
  await f.service.refreshModels({ allowNetwork: true, force: true })
  assert.equal(f.counts().networkRefreshes, 2)
  f.tick(60_000)
  await f.service.refreshModels({ allowNetwork: true })
  assert.equal(f.counts().networkRefreshes, 3)
})

test('ttl 0 refreshes every time; manual refresh() always hits the network', async () => {
  const f = fixture({ ttl: 0 })
  await f.service.refreshModels({ allowNetwork: true })
  await f.service.refreshModels({ allowNetwork: true })
  assert.equal(f.counts().networkRefreshes, 2)
  const g = fixture({ ttl: 60_000 })
  await g.service.refresh()
  await g.service.refresh()
  assert.equal(g.counts().networkRefreshes, 2)
})

test('logout drops the stored catalog too', async () => {
  const f = fixture({ stored: { models: storedModels } })
  await f.service.logout()
  assert.deepEqual(f.deleted, ['codebuddy'])
})
