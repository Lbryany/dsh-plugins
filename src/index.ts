import type { Context, Volatile } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import z from '@deepseek-ai/schemastery'
import type { SettingsForms } from '@deepseek-ai/dsh-settings'
import type { AgentDefaultModelConfig } from '@deepseek-ai/dsh-agent-default-model'
import { createDefaultModel } from './default-model.ts'
import { createPreferences } from './settings.ts'
import { createRpcHandler, registerManagement } from './rpc.ts'
import type { CommandInvocation } from '@deepseek-ai/dsh-commands'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { createModels } from '@earendil-works/pi-ai'
import { createCodeBuddyProvider, withCacheRetention, withPromptCacheKey } from './codebuddy.ts'
import { RequestContextTracker } from './request-context.ts'
import { CodeBuddyAdapter } from './adapter.ts'
import { DshCredentialStore } from './credential-store.ts'
import { FileModelsStore } from './models-store.ts'
import { debugFetch, debugPayload, debugResponse, debugUsage, requestDebugEnabled } from './debug.ts'
import { createImageReader } from './images.ts'
import type {} from '@deepseek-ai/dsh-attachment'
import { authorizationUrlText } from './login.ts'
import { CodeBuddyService } from './service.ts'
import { DEFAULT_SITE, PROVIDER, type CacheRetention } from './contract.ts'

export { PROVIDER } from './contract.ts'
export const name = 'llm-codebuddy'
export const inject = ['llm', 'commands', 'credentials']
export const CREDENTIAL_REF = credentialRef('CODEBUDDY_OAUTH')
export const Config = z.object({
  defaultSite: z.string().default(DEFAULT_SITE).volatile(),
  cacheRetention: z.union([z.const('default'), z.const('1h')]).default('default').volatile(),
})

export function apply(ctx: Context, config?: { defaultSite: Volatile<string>; cacheRetention?: Volatile<CacheRetention> }): void {
  let settings: SettingsForms | undefined
  const entryId = ctx.fiber.entry?.options.id
  const preferences = createPreferences({
    read: () => config?.defaultSite.get() ?? DEFAULT_SITE,
    readCacheRetention: () => config?.cacheRetention?.get(),
    writable: () => Boolean(settings?.writable && entryId),
    write: async patch => { if (settings && entryId) await settings.update(entryId, patch) },
  })
  ctx.inject(['settings'], scope => {
    settings = scope.settings
    scope.effect(() => scope.settings.configure({ auto: false }, ctx.fiber))
    scope.effect(() => () => { settings = undefined })
  })
  const store = new DshCredentialStore(ctx.credentials, CREDENTIAL_REF)
  const modelsStore = new FileModelsStore()
  const models = createModels({ credentials: store, modelsStore })
  const installProvider = () => {
    const revision = service.revision
    models.setProvider(createCodeBuddyProvider({
      onCatalogSource: source => service.observeCatalogSource(source, revision),
    }))
  }
  const service = new CodeBuddyService({ models, store, logger: ctx.logger,
    registration: { replace: providers => registration.replace(providers) }, resetProvider: installProvider, modelsStore })
  installProvider()
  // 重启后先把落盘的目录拿回来，不等联网
  void service.restore().catch(error => ctx.logger.error(`CodeBuddy 目录缓存恢复失败：${String(error)}`))
  const registration = ctx.llm.registerAdapter([PROVIDER], new CodeBuddyAdapter(models, service.accountSignal, service.refreshModels, {
    requestContext: new RequestContextTracker(),
    // 缓存保留时长按请求读取当前偏好，保存后立即生效
    onPayload: (payload, sessionId) => debugPayload(
      withCacheRetention(withPromptCacheKey(payload, sessionId), preferences.status().cacheRetention), sessionId),
    ...(requestDebugEnabled ? { onResponse: debugResponse, onUsage: debugUsage, fetch: debugFetch } : {}),
    // 附件服务按请求时解析：它可能晚于本插件加载
    images: createImageReader(() => ctx.get('attachments')),
  }))
  ctx.effect(() => () => service.dispose())
  let defaultHost: AgentDefaultModelConfig | undefined
  const defaultModel = createDefaultModel({ host: () => defaultHost, account: service })
  ctx.inject(['agentDefaultModel'], scope => {
    defaultHost = scope.agentDefaultModel
    scope.effect(() => () => { defaultHost = undefined })
  })
  ctx.inject(['connection'], scope => {
    scope.effect(() => registerManagement(scope.connection, createRpcHandler({ service, preferences, defaultModel })))
  })

  ctx.commands.register({
    name: 'codebuddy-login', description: '登录 CodeBuddy 并加载可用模型', input: { hint: '[cn|global|site URL]' },
    handler: async ({ rawInput, signal }: CommandInvocation) => {
      const login = await service.start(rawInput || preferences.status().defaultSite, signal)
      return { kind: 'success', text: authorizationUrlText(login.authorizationUrl, login.reused) }
    },
  })
  ctx.commands.register({
    name: 'codebuddy-status', description: '查看 CodeBuddy 登录状态和模型列表',
    handler: async () => {
      const status = await service.status()
      const pending = service.login.pending()
      if (pending) return { kind: 'success', text: pending.authorizationUrl
        ? authorizationUrlText(pending.authorizationUrl, true) : '正在生成授权链接…' }
      if (status.login.phase === 'failed') return { kind: 'error', text: 'CodeBuddy 登录失败，请重试。' }
      if (!status.account.hasCredential) return { kind: 'success', text: 'CodeBuddy 未登录。运行 /codebuddy-login cn 或 /codebuddy-login global。' }
      return { kind: 'success', text: `CodeBuddy 已保存登录状态（${status.account.site ?? '未知站点'}）。\n模型目录：${status.catalog.status}；${status.catalog.models.length} 个模型。${status.catalog.error ? '\n模型刷新失败，登录凭据已保留。' : ''}` }
    },
  })
  ctx.commands.register({
    name: 'codebuddy-logout', description: '退出 CodeBuddy 并移除本地凭据',
    handler: async () => { await service.logout(); return { kind: 'success', text: 'CodeBuddy 已退出。' } },
  })
}
