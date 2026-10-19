/**
 * dsh-widget, browser half: the settled visualization card under the
 * `visualize` key of the atomic toolview hole, the streaming preview in the
 * composer's input dock, and — on hosts that fold finished turns — the turn's
 * cards again under its final answer. Clients without this half degrade to
 * the tool's generic result text by the documented toolview fallback.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the `ctx.slots` Context merge.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the `tool.call.toolview` SlotMap declaration.
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
// Type-only: pulls the `conversation.input.dock` SlotMap declaration.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ConversationNodeDefinition } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { VisualizeCard } from './VisualizeCard.tsx'
import { StreamingPreview, streamDefinition } from './StreamingPreview.tsx'
import { foldingSource, type FoldingHost } from './folding.ts'
import { selectTurnCards, turnCardsDefinition, TurnCards } from './TurnCards.tsx'
import { registerSettingsSection } from './settings.tsx'
import { stateClient, widgetHostFor, type WidgetHost } from './bridge-host.ts'

export const name = 'dsh-widget'

export const inject = ['slots']

/** The Conversation event registry, where the host has one (dsh 0.1.2+). */
interface ConversationEvents {
  register(definition: ConversationNodeDefinition): () => void
}

/**
 * Look up the Conversation event registry without declaring the service, so
 * hosts that predate it still load the plugin.
 * @param host - client context.
 * @returns the registry, or undefined on dsh 0.1.1.
 */
function conversationEvents(host: FoldingHost): ConversationEvents | undefined {
  const service = host.get('uiConversation') as { events?: Partial<ConversationEvents> } | undefined
  return typeof service?.events?.register === 'function' ? service.events as ConversationEvents : undefined
}

/**
 * Turn-tail registration valid on both slot shapes the host has shipped: dsh
 * 0.1.5 and earlier declare a chain (register requires `select`, orders by
 * `priority`), 0.1.6 onward a list (register requires `id`, orders by
 * `order`). Each register validates only its own kind's field. The cards sit
 * after the host's deliverables and before other plugins' low-rank entries.
 * @param host - client context, for the folding preference.
 * @returns the register options.
 */
function turnTailOptions(host: FoldingHost, hostOf: (sessionId: unknown) => WidgetHost | undefined) {
  const folds = foldingSource(host)
  return {
    name: 'conversation.chat.turnTail',
    id: 'dsh-widget-cards',
    order: 100,
    priority: 100,
    select: selectTurnCards,
    inject: (sessionId?: unknown) => ({ hooks: { visualizeFolds: folds }, widgetHost: hostOf(sessionId) }),
  } as const
}

/**
 * Register the keyed toolview, the dock preview with its stream Definition,
 * the turn-tail cards, and the settings page. Waiting on each hole's declaration mirrors the
 * official registrants: entry application order is loader-driven, and a
 * direct register racing the declaration fails boot.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const states = stateClient()
  // 会话作用域的槽位按会话调 inject 工厂，卡片由此拿到所在会话的宿主能力（读写状态、追问）
  // 每个会话一个实例，避免每次渲染换引用导致卡片重挂桥
  const hosts = new Map<string, WidgetHost | undefined>()
  const hostOf = (sessionId: unknown): WidgetHost | undefined => {
    if (typeof sessionId !== 'string') return undefined
    if (!hosts.has(sessionId)) hosts.set(sessionId, widgetHostFor(ctx as unknown as { get(name: string): unknown }, sessionId, states))
    return hosts.get(sessionId)
  }
  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register(
    { name: 'tool.call.toolview', key: 'visualize', inject: (sessionId: unknown) => ({ widgetHost: hostOf(sessionId) }) } as never,
    VisualizeCard as never,
  ))
  // The dock reads the argument stream from Turn data the stream Definition
  // folds; without the registry (dsh 0.1.1) it reads the session partial. The
  // dock is declared while the Conversation service is still being built, so
  // the Definition waits on the service itself and lives with that fiber.
  ctx.inject(['uiConversation'], (scope: ClientContext) => {
    conversationEvents(scope)?.register(streamDefinition as ConversationNodeDefinition)
  })
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register(
    { name: 'conversation.input.dock', id: 'visualize-stream', order: 30 },
    StreamingPreview,
  ))
  // The Chat target declares the turn tail after its own settings and the
  // Conversation registry are up, so both are resolvable here.
  ctx.slots.inject('conversation.chat.turnTail', () => {
    const events = conversationEvents(ctx)
    if (events === undefined) return () => undefined
    const disposeDefinition = events.register(turnCardsDefinition as ConversationNodeDefinition)
    const disposeTail = ctx.slots.register(turnTailOptions(ctx, hostOf), TurnCards)
    return () => {
      disposeTail()
      disposeDefinition()
    }
  })
  // 设置 → 可视化: the card style picker and the user's style files.
  registerSettingsSection(ctx)
}
