import {
  LlmAdapter,
  LlmError,
  ReasoningEffortId,
  ToolCallId,
  offloadedImageText,
  projectOffloadedImages,
  type ContentBlock,
  type GenerateOptions,
  type LlmModelInfo,
  type LlmProviderInfo,
  type LlmResolvedModelInfo,
  type PreparedAdapterCall,
  type StreamChunk,
} from '@deepseek-ai/dsh-llm'
import type {
  AssistantMessage,
  Api,
  Context as PiContext,
  JsonObject,
  Credential,
  Model,
  Models,
  ThinkingLevel,
  Tool,
} from '@earendil-works/pi-ai'

import { PLUGIN_VERSION } from './codebuddy.ts'
import { REASONING_LEVELS as LEVELS } from './contract.ts'
import { mergeHeaders, requestContextHeaders, type RequestContextSource } from './request-context.ts'
import { toBase64, type ImageReader } from './images.ts'
type Level = (typeof LEVELS)[number]

const EFFORTS = LEVELS.map(level => ({
  id: ReasoningEffortId(level),
  name: level === 'off' ? 'Off' : level[0]!.toUpperCase() + level.slice(1),
}))

/** 目录里标 supportsImages 且附件服务可用的模型才声明图片输入；否则 dsh 在发送前就会拒绝带图消息。 */
function supportsImages(model: Model<Api>, images: ImageReader | undefined): boolean {
  return images !== undefined && images.available() && model.input.includes('image')
}

function modelInfo(provider: string, model: Model<Api>, images: ImageReader | undefined): LlmModelInfo {
  return {
    provider,
    id: model.id,
    name: model.name,
    inputModalities: supportsImages(model, images) ? ['text', 'image'] : ['text'],
  }
}

function textFrom(blocks: readonly ContentBlock[]): string {
  return blocks.flatMap(block => {
    if (block.type === 'text' || block.type === 'reasoning') return [block.text]
    return []
  }).join('\n')
}

type PiPart = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }

/**
 * 把 dsh 的用户 / 工具内容块转成 pi-ai 的内容：文本合并，图片经附件服务取字节后作 base64 内联
 * （pi-ai 的 openai-completions 会编成 image_url data URL）。没有图片读取器时图片只留占位文本。
 */
async function partsFrom(blocks: readonly ContentBlock[], images: ImageReader | undefined, signal: AbortSignal | undefined): Promise<PiPart[]> {
  const parts: PiPart[] = []
  const pushText = (text: string) => {
    if (text.length === 0) return
    const last = parts[parts.length - 1]
    if (last?.type === 'text') last.text = `${last.text}\n${text}`
    else parts.push({ type: 'text', text })
  }
  for (const block of blocks) {
    if (block.type === 'text' || block.type === 'reasoning') pushText(block.text)
    else if (block.type === 'image') {
      if (!images?.available()) { pushText(offloadedImageText(block.attachment)); continue }
      const image = await images.read(block.attachment, signal)
      parts.push({ type: 'image', data: toBase64(image.data), mimeType: image.mediaType })
    }
  }
  return parts
}

async function toPiContext(options: GenerateOptions, images: ImageReader | undefined, signal: AbortSignal | undefined): Promise<PiContext> {
  const messages: PiContext['messages'] = []
  const toolNames = new Map<string, string>()
  // 已卸载的图片（超出预算时 dsh 记录的决定）只发占位文本
  const history = projectOffloadedImages(options.messages, ref => offloadedImageText(ref))
  const leadingSystem = options.system === undefined && history[0]?.role === 'system'
  const systemPrompt = leadingSystem ? textFrom(history[0]!.content) || undefined : options.system
  for (const message of leadingSystem ? history.slice(1) : history) {
    if (message.role === 'developer') throw new LlmError('CodeBuddy does not support developer messages', 'UNSUPPORTED_CONTENT')
    if (message.role === 'system') {
      messages.push({ role: 'user', content: textFrom(message.content), timestamp: Date.now() })
      continue
    }
    if (message.role === 'tool') {
      const parts = await partsFrom(message.content, images, signal)
      messages.push({
        role: 'toolResult', toolCallId: String(message.toolCallId),
        toolName: toolNames.get(String(message.toolCallId)) ?? '',
        content: parts.length > 0 ? parts : [{ type: 'text', text: '' }],
        isError: message.isError ?? false, timestamp: Date.now(),
      })
      continue
    }
    if (message.role === 'user') {
      const parts = await partsFrom(message.content, images, signal)
      if (parts.length === 0) continue
      const content = parts.length === 1 && parts[0]!.type === 'text' ? parts[0]!.text : parts
      messages.push({ role: 'user', content, timestamp: Date.now() })
      continue
    }
    if (message.role === 'assistant') {
      const content: AssistantMessage['content'] = []
      for (const block of message.content) {
        if (block.type === 'text') content.push({ type: 'text', text: block.text })
        if (block.type === 'reasoning') content.push({ type: 'thinking', thinking: block.text })
        if (block.type === 'tool-call') {
          let args: JsonObject = {}
          try { args = JSON.parse(block.arguments) as JsonObject } catch {}
          content.push({ type: 'toolCall', id: String(block.id), name: block.name, arguments: args })
          toolNames.set(String(block.id), block.name)
        }
      }
      messages.push({
        role: 'assistant', content, api: 'openai-completions', provider: 'codebuddy',
        model: options.model, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        stopReason: 'stop', timestamp: Date.now(),
      })
    }
  }
  const tools = options.tools?.map(tool => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  })) as Tool[] | undefined
  return { systemPrompt, messages, tools }
}

function finishReason(reason: 'stop' | 'length' | 'toolUse'): StreamChunk & { type: 'finish' } {
  if (reason === 'length') return { type: 'finish', reason: { kind: 'max-tokens' } }
  if (reason === 'toolUse') return { type: 'finish', reason: { kind: 'tool-calls' } }
  return { type: 'finish', reason: { kind: 'stop' } }
}

/** Per-request hooks keyed by the dsh session: request context headers and payload tweaks. */
export interface CodeBuddyRequestHooks {
  /** 每次调用的会话 / turn / trace 上下文；缺省或返回 undefined 时不发上下文头。 */
  requestContext?: RequestContextSource
  /** Last-minute payload edit (for example `prompt_cache_key`); return the payload to send. */
  onPayload?: (payload: unknown, sessionId: string | undefined) => unknown
  /** Response status and headers for diagnostics; never the body. */
  onResponse?: (status: number, headers: Record<string, string>, sessionId: string | undefined) => void
  /** Token usage of one finished call for diagnostics, with the request id it answers. */
  onUsage?: (usage: { input: number; output: number; cacheRead: number; cacheWrite: number }, sessionId: string | undefined, requestId: string | undefined) => void
  /** Resolves dsh image attachments to bytes; absent means text-only models. */
  images?: ImageReader
  /** Diagnostic fetch wrapper for one request; undefined keeps the default. */
  fetch?: (sessionId: string | undefined) => typeof fetch | undefined
}

export class CodeBuddyAdapter extends LlmAdapter {
  private readonly models: Models
  private readonly accountSignal: () => AbortSignal
  private readonly refresh: Models['refresh']
  private readonly hooks: CodeBuddyRequestHooks

  constructor(models: Models, accountSignal: () => AbortSignal = () => new AbortController().signal,
    refresh: Models['refresh'] = options => models.refresh(options), hooks: CodeBuddyRequestHooks = {}) {
    super()
    this.models = models
    this.accountSignal = accountSignal
    this.refresh = refresh
    this.hooks = hooks
  }

  override async prepareCall(provider: string, id: string, signal?: AbortSignal): Promise<PreparedAdapterCall> {
    const account = this.accountSignal()
    const combined = signal ? AbortSignal.any([signal, account]) : account
    combined.throwIfAborted()
    const model = await this.resolveModel(provider, id, combined)
    combined.throwIfAborted()
    return {
      model,
      stream: options => this.stream({ ...options, signal: options.signal
        ? AbortSignal.any([options.signal, combined]) : combined }),
    }
  }

  override providerInfo(provider: string): LlmProviderInfo {
    return { id: provider, name: 'CodeBuddy' }
  }

  override async listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    const signal = this.accountSignal()
    signal.throwIfAborted()
    await this.refresh({ allowNetwork: true, signal })
    signal.throwIfAborted()
    return this.models.getModels('codebuddy').map(model => modelInfo(provider, model, this.hooks.images))
  }

  override async resolveModel(provider: string, id: string, signal?: AbortSignal): Promise<LlmResolvedModelInfo> {
    const account = this.accountSignal()
    const combined = signal ? AbortSignal.any([signal, account]) : account
    combined.throwIfAborted()
    await this.refresh({ allowNetwork: true, signal: combined })
    combined.throwIfAborted()
    const model = this.models.getModel('codebuddy', id)
    if (model === undefined) return { provider, id, name: id, inputModalities: ['text'] }
    return {
      ...modelInfo(provider, model, this.hooks.images),
      context: { contextWindow: model.contextWindow },
      defaultMaxTokens: model.maxTokens,
      ...(model.reasoning ? { reasoning: { efforts: EFFORTS, defaultEffort: ReasoningEffortId('high') } } : {}),
    }
  }

  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const account = this.accountSignal()
    const signal = options.signal ? AbortSignal.any([options.signal, account]) : account
    signal.throwIfAborted()
    if (options.stop?.length) throw new LlmError('CodeBuddy adapter does not support stop sequences', 'UNSUPPORTED')
    await this.refresh({ allowNetwork: true, signal })
    signal.throwIfAborted()
    const model = this.models.getModel('codebuddy', options.model)
    if (model === undefined) throw new LlmError(`CodeBuddy model "${options.model}" is not available`, 'MODEL_NOT_FOUND')

    const open = new Map<number, { kind: 'text' | 'reasoning' | 'tool-call'; text: string; id?: string; name?: string }>()
    const sessionId = options.sessionId === undefined ? undefined : String(options.sessionId)
    const onPayload = this.hooks.onPayload
    const onResponse = this.hooks.onResponse
    const context = await toPiContext(options, supportsImages(model, this.hooks.images) ? this.hooks.images : undefined, signal)
    signal.throwIfAborted()
    // 快照在发请求前一次拍定；pi-ai 不重试，一次 streamSimple 只发一个请求
    const call = this.hooks.requestContext?.begin({ sessionId, purpose: options.purpose, messages: options.messages })
    const stream = this.models.streamSimple(model, context, {
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      reasoning: options.reasoningEffort as ThinkingLevel | undefined,
      signal,
      sessionId,
      headers: mergeHeaders(
        // 按 CodeBuddy 技术团队要求恰好为官方 CLI 的 UA（不带 dsh 署名），
        // 有意偏离 dsh 的 attributionHeaders() 适配器约定。
        { 'User-Agent': `CLI/${PLUGIN_VERSION} CodeBuddy/${PLUGIN_VERSION}` },
        call ? requestContextHeaders(call) : undefined,
      ),
      ...(onPayload ? { onPayload: (payload: unknown) => onPayload(payload, sessionId) } : {}),
      ...(onResponse ? { onResponse: (response: { status: number; headers: Record<string, string> }) => onResponse(response.status, response.headers, sessionId) } : {}),
      ...(() => { const f = this.hooks.fetch?.(sessionId); return f ? { fetch: f } : {} })(),
    })
    for await (const event of stream) {
      signal.throwIfAborted()
      if (event.type === 'text_start') {
        open.set(event.contentIndex, { kind: 'text', text: '' })
        yield { type: 'block-start', index: event.contentIndex, blockType: 'text' }
      } else if (event.type === 'text_delta') {
        const state = open.get(event.contentIndex); if (state) state.text += event.delta
        yield { type: 'text-delta', index: event.contentIndex, text: event.delta }
      } else if (event.type === 'thinking_start') {
        open.set(event.contentIndex, { kind: 'reasoning', text: '' })
        yield { type: 'block-start', index: event.contentIndex, blockType: 'reasoning' }
      } else if (event.type === 'thinking_delta') {
        const state = open.get(event.contentIndex); if (state) state.text += event.delta
        yield { type: 'reasoning-delta', index: event.contentIndex, text: event.delta }
      } else if (event.type === 'toolcall_start') {
        open.set(event.contentIndex, { kind: 'tool-call', text: '' })
        yield { type: 'block-start', index: event.contentIndex, blockType: 'tool-call' }
      } else if (event.type === 'toolcall_delta') {
        const state = open.get(event.contentIndex); if (state) state.text += event.delta
        const partial = event.partial.content[event.contentIndex]
        const id = partial?.type === 'toolCall' ? partial.id : ''
        const name = partial?.type === 'toolCall' ? partial.name : undefined
        yield { type: 'tool-call-delta', index: event.contentIndex, id: ToolCallId(id), name, argumentsDelta: event.delta }
      } else if (event.type === 'text_end') {
        yield { type: 'block-end', index: event.contentIndex, block: { type: 'text', text: event.content } }
      } else if (event.type === 'thinking_end') {
        yield { type: 'block-end', index: event.contentIndex, block: { type: 'reasoning', text: event.content } }
      } else if (event.type === 'toolcall_end') {
        yield { type: 'block-end', index: event.contentIndex, block: {
          type: 'tool-call', id: ToolCallId(event.toolCall.id), name: event.toolCall.name,
          arguments: JSON.stringify(event.toolCall.arguments),
        } }
      } else if (event.type === 'done') {
        if (event.reason === 'deferred') {
          throw new LlmError('CodeBuddy returned a deferred tool response, which DSH cannot consume', 'UNSUPPORTED')
        }
        if (call) this.hooks.requestContext?.complete?.(call)
        this.hooks.onUsage?.(event.message.usage, sessionId, call?.messageId)
        yield { type: 'usage', usage: {
          inputTokens: event.message.usage.input,
          outputTokens: event.message.usage.output,
          cacheReadTokens: event.message.usage.cacheRead,
          cacheWriteTokens: event.message.usage.cacheWrite,
          ...(event.message.usage.reasoning === undefined ? {} : { reasoningTokens: event.message.usage.reasoning }),
        } }
        yield finishReason(event.reason)
      } else if (event.type === 'error') {
        throw new LlmError(event.error.errorMessage ?? 'CodeBuddy request failed', event.reason === 'aborted' ? 'ABORTED' : 'PROVIDER_ERROR')
      }
    }
  }
}
