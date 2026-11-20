// Verbatim copy of index.js as released in 0.1.0 (commit 5eb36e8), kept to prove that
// userMessages switched off is byte-identical to 0.1. Do not edit.
// @lbryany/dsh-compaction-instruction: mounts @deepseek-ai/dsh-compaction-basic and changes only
// the summarization directive it sends. Mount it IN PLACE OF dsh-compaction-basic inside one
// preset's compaction group; its scope is wherever it is mounted, nothing else.
import BasicCompactionEngine from '@deepseek-ai/dsh-compaction-basic';

export const name = 'dsh-compaction-instruction';
// The wrapper needs the real (outer) llm. Basic's other injects (tokenMeter, sessions)
// are resolved by basic's own fiber.
export const inject = ['llm'];

/** Leading text of dsh-compaction-basic's (unexported) COMPACTION_INSTRUCTION. */
export const DIRECTIVE_PREFIX = 'You are now acting as a compaction engine';
export const MODES = Object.freeze(['append', 'replace']);

function lastText(message) {
  if (!message || message.role !== 'user' || !Array.isArray(message.content)) return undefined;
  if (message.content.length !== 1 || message.content[0]?.type !== 'text') return undefined;
  return message.content[0].text;
}

/**
 * Pure rewrite of one `llm.stream()` options object.
 * Only a `purpose: 'compaction'` call whose final message is basic's directive is rewritten,
 * into a NEW options object (basic deep-freezes the directive message). Anything else is
 * returned as the identical object; a compaction call with an unrecognized final message
 * also calls `onMiss`.
 * @param {object} options - the options basic passed to `llm.stream()`.
 * @param {{ instruction: string, mode: 'append' | 'replace' }} rule
 * @param {() => void} [onMiss]
 */
export function rewriteOptions(options, { instruction, mode }, onMiss) {
  if (options?.purpose !== 'compaction') return options;
  const messages = options.messages;
  const last = Array.isArray(messages) && messages.length > 0 ? messages[messages.length - 1] : undefined;
  const text = lastText(last);
  if (typeof text !== 'string' || !text.startsWith(DIRECTIVE_PREFIX)) {
    onMiss?.();
    return options;
  }
  const next = mode === 'replace' ? instruction : `${text}\n\n${instruction}`;
  return {
    ...options,
    messages: [...messages.slice(0, -1), Object.freeze({ ...last, content: Object.freeze([Object.freeze({ type: 'text', text: next })]) })],
  };
}

/** Split this plugin's own keys off; everything else is basic's config, passed through untouched. */
export function splitConfig(config) {
  const { instruction, mode = 'append', ...basicConfig } = config ?? {};
  if (instruction != null && typeof instruction !== 'string') throw new TypeError(`${name}: instruction must be a string`);
  if (!MODES.includes(mode)) throw new TypeError(`${name}: mode must be "append" or "replace", got ${JSON.stringify(mode)}`);
  const active = typeof instruction === 'string' && instruction.trim().length > 0;
  return { rule: active ? { instruction, mode } : undefined, basicConfig };
}

export function apply(ctx, config) {
  const { rule, basicConfig } = splitConfig(config);
  // No instruction: exactly dsh-compaction-basic, on this plugin's own context.
  if (rule === undefined) {
    ctx.plugin(BasicCompactionEngine, basicConfig);
    return;
  }

  const logger = ctx.logger(name);
  let warned = false;
  const onMiss = () => {
    if (warned) return;
    warned = true;
    logger.warn('a purpose=compaction call does not end with the known dsh-compaction-basic directive; forwarded unchanged (did dsh-compaction-basic change its directive?)');
  };

  // A PLAIN object, never Object.create(llm) or an LlmRuntime subclass, and no symbol keys
  // forwarded: cordis then hands it out as-is and never rebinds `.ctx` to the isolated scope,
  // so the real llm's `llm/stream` waterfall still reaches outer listeners (llm-retry,
  // session-title, ...). Every call resolves the real llm through this plugin's own ctx.
  const target = {
    stream(options) {
      return ctx.llm.stream(rewriteOptions(options, rule, onMiss));
    },
  };
  const llm = new Proxy(target, {
    get(t, prop) {
      if (typeof prop === 'symbol') return undefined;
      if (Object.hasOwn(t, prop)) return t[prop];
      const real = ctx.llm;
      const value = real[prop];
      return typeof value === 'function' ? value.bind(real) : value;
    },
    has(t, prop) {
      return typeof prop !== 'symbol' && (Object.hasOwn(t, prop) || prop in ctx.llm);
    },
  });

  const child = ctx.isolate('llm');
  child.provide('llm', llm);
  child.plugin(BasicCompactionEngine, basicConfig);
}
