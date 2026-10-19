import type { CredentialStore, Models, ModelsRefreshOptions, ModelsRefreshResult, ModelsStore } from '@earendil-works/pi-ai'
import { CodeBuddyLoginManager, type LoginLogger, type LoginRegistration } from './login.ts'
import { normalizeSite, PROVIDER, PublicError, type CatalogView, type StatusView } from './contract.ts'

interface ServiceOptions {
  models: Models
  store: CredentialStore & { invalidate?(): void }
  registration: LoginRegistration
  logger: LoginLogger
  resetProvider?(): void
  /** 落盘的目录缓存；给了才会在启动时恢复、退出时清掉。 */
  modelsStore?: Pick<ModelsStore, 'read' | 'delete'>
  /** 目录新鲜期：上次成功刷新距今不超过它时，普通刷新不联网（缺省 CATALOG_TTL_MS）。 */
  catalogTtlMs?: number
  now?: () => number
}

/** 目录缓存新鲜期缺省 10 分钟；可用 PI_CODEBUDDY_CATALOG_TTL_MS 覆盖（0 = 每次都联网）。 */
export const CATALOG_TTL_MS = (() => {
  const raw = process.env.PI_CODEBUDDY_CATALOG_TTL_MS?.trim()
  const parsed = raw === undefined || raw === '' ? Number.NaN : Number(raw)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 600_000
})()

export class CodeBuddyService {
  readonly login: CodeBuddyLoginManager
  readonly models: Models
  private readonly options: ServiceOptions
  private account = new AbortController()
  private epoch = 0
  private disposed = false
  private operations: Promise<unknown> = Promise.resolve()
  private catalog: CatalogView = { status: 'idle', models: [], cached: false }
  private source?: string
  private refreshTask?: { epoch: number; promise: Promise<ModelsRefreshResult> }
  private readonly ttl: number
  private readonly now: () => number

  constructor(options: ServiceOptions) {
    this.options = options
    this.models = options.models
    this.ttl = options.catalogTtlMs ?? CATALOG_TTL_MS
    this.now = options.now ?? Date.now
    this.login = new CodeBuddyLoginManager({
      login: (...args) => this.models.login(...args),
      getModels: (...args) => this.models.getModels(...args),
      refresh: input => this.refreshModels(input),
    }, options.registration, options.logger, PROVIDER)
  }

  get revision(): number { return this.epoch }

  /**
   * 启动时从落盘缓存恢复目录（不联网）：有凭据且缓存里有模型时，目录直接可用并标 cached，
   * 之后第一次请求或手动刷新再联网核对。没有缓存就保持 idle。
   */
  async restore(): Promise<CatalogView> {
    const epoch = this.epoch
    const credential = await this.options.store.read(PROVIDER)
    if (epoch !== this.epoch || this.disposed || !credential) return structuredClone(this.catalog)
    const stored = await this.options.modelsStore?.read(PROVIDER).catch(() => undefined)
    if (epoch !== this.epoch || this.disposed || !stored || stored.models.length === 0) return structuredClone(this.catalog)
    try { await this.models.refresh({ allowNetwork: false, providers: [PROVIDER] }) } catch { /* 恢复失败就当没有缓存 */ }
    if (epoch !== this.epoch || this.disposed || this.catalog.status !== 'idle') return structuredClone(this.catalog)
    const models = this.catalogModels()
    if (models.length > 0) {
      this.catalog = { status: 'ready', cached: true, source: 'stored', updatedAt: stored.checkedAt, models }
      this.options.registration.replace([PROVIDER])
    }
    return structuredClone(this.catalog)
  }

  private catalogModels() {
    return this.models.getModels(PROVIDER).map(model => ({
      id: model.id, name: model.name, reasoning: model.reasoning, contextWindow: model.contextWindow,
    }))
  }

  /** 普通刷新是否可以不联网：上次成功联网刷新还在新鲜期内，且 pi-ai 里已有模型。 */
  private catalogFresh(): boolean {
    if (this.catalog.status !== 'ready' || this.catalog.cached || this.catalog.updatedAt === undefined) return false
    if (this.ttl <= 0) return false
    return this.now() - this.catalog.updatedAt < this.ttl && this.models.getModels(PROVIDER).length > 0
  }
  accountSignal = (): AbortSignal => this.account.signal

  withAccount<T>(action: () => Promise<T>): Promise<T> {
    const epoch = this.epoch
    return this.serialize(async () => {
      this.assertActive()
      if (epoch !== this.epoch) throw new PublicError('account-changed', 'CodeBuddy 账号状态已变化，请重试。')
      this.account.signal.throwIfAborted()
      return action()
    })
  }

  observeCatalogSource(source: string, epoch: number): void {
    if (epoch !== this.epoch || this.disposed) return
    this.source = source
  }

  async status(): Promise<StatusView> {
    const epoch = this.epoch
    const credential = await this.options.store.read(PROVIDER)
    if (epoch !== this.epoch) return this.status()
    return {
      account: credential?.type === 'oauth' ? {
        hasCredential: true,
        site: typeof credential.baseUrl === 'string' ? normalizeSite(credential.baseUrl) : undefined,
        expiresAt: typeof credential.expires === 'number' ? credential.expires : undefined,
      } : { hasCredential: false },
      login: this.login.snapshot(), catalog: structuredClone(this.catalog),
    }
  }

  async start(site: string, signal: AbortSignal) {
    const { pending, epoch } = await this.serialize(async () => {
      this.assertActive()
      const normalized = normalizeSite(site)
      if (this.login.pending()?.site !== normalized) {
        await this.login.cancel()
        this.assertActive()
        signal.throwIfAborted()
        this.invalidate()
      }
      const pending = this.login.start(normalized, signal)
      void pending.catch(() => {})
      return { pending, epoch: this.epoch }
    })
    try {
      const started = await pending
      void started.completion.then(() => {
        if (!this.disposed && this.epoch === epoch) {
          this.account = new AbortController()
          this.options.registration.replace([PROVIDER])
        }
      })
      return started
    } catch (error) {
      if (!this.disposed && this.epoch === epoch && !this.login.pending()) this.account = new AbortController()
      throw error
    }
  }

  cancel(id?: string): Promise<void> {
    return this.serialize(async () => { this.assertActive(); await this.login.cancel(id) })
  }

  logout(): Promise<void> {
    return this.serialize(async () => {
      this.assertActive()
      this.invalidate()
      await this.login.cancel()
      await this.models.logout(PROVIDER)
      await this.options.modelsStore?.delete(PROVIDER).catch(() => {})
      this.login.reset()
      this.account = new AbortController()
      this.options.registration.replace([PROVIDER])
    })
  }

  async refresh(signal?: AbortSignal): Promise<CatalogView> {
    this.assertActive()
    if (!(await this.options.store.read(PROVIDER))) {
      this.catalog = { status: 'idle', models: [], cached: false }
      return structuredClone(this.catalog)
    }
    const combined = signal ? AbortSignal.any([signal, this.account.signal]) : this.account.signal
    combined.throwIfAborted()
    await this.refreshModels({ allowNetwork: true, force: true, signal: combined })
    return structuredClone(this.catalog)
  }

  async dispose(): Promise<void> {
    this.disposed = true
    this.invalidate()
    await this.login.cancel()
    await this.operations.catch(() => {})
  }

  private invalidate(): void {
    this.epoch++
    this.account.abort(new PublicError('account-changed', 'CodeBuddy 账号状态已变化，请重试。'))
    this.options.store.invalidate?.()
    this.catalog = { status: 'idle', models: [], cached: false }
    this.source = undefined
    this.refreshTask = undefined
    if (!this.disposed) this.options.resetProvider?.()
  }

  private assertActive(): void {
    if (this.disposed) throw new PublicError('unavailable', 'CodeBuddy 插件已停止。')
  }

  private serialize<T>(action: () => Promise<T>): Promise<T> {
    const next = this.operations.then(action)
    this.operations = next.catch(() => {})
    return next
  }

  refreshModels = (input: ModelsRefreshOptions = {}): Promise<ModelsRefreshResult> => {
    if (this.refreshTask?.epoch === this.epoch) return this.refreshTask.promise
    // 每次请求前适配器都会调一次刷新；目录还新鲜就不联网，避免每条消息都去拉一次模型列表。
    if (!input.force && input.allowNetwork !== false && this.catalogFresh()) return Promise.resolve({ aborted: false, errors: new Map() })
    const epoch = this.epoch
    this.catalog = { ...this.catalog, status: 'refreshing', error: undefined }
    const task = { epoch, promise: Promise.resolve().then(async () => {
      let result: ModelsRefreshResult
      try { result = await this.models.refresh(input) }
      catch { result = { aborted: input.signal?.aborted ?? false, errors: new Map([[PROVIDER, Error('Models unavailable')]]) } }
      if (epoch !== this.epoch || this.disposed) return result
      if (result.aborted || input.signal?.aborted || result.errors.has(PROVIDER)) {
        this.catalog = { ...this.catalog, status: 'error', cached: this.catalog.models.length > 0, error: 'models-unavailable' }
      } else {
        const models = this.catalogModels()
        const changed = JSON.stringify(models) !== JSON.stringify(this.catalog.models)
        this.catalog = { status: 'ready', cached: false, source: this.source, updatedAt: this.now(), models }
        if (changed) this.options.registration.replace([PROVIDER])
      }
      return result
    }).finally(() => { if (this.refreshTask === task) this.refreshTask = undefined }) }
    this.refreshTask = task
    return task.promise
  }
}
