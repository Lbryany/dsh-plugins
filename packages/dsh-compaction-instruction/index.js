// @lbryany/dsh-compaction-instruction: mounts @deepseek-ai/dsh-compaction-basic and changes only
// the summarization directive it sends. It also offers an extension point: at compaction time it
// hands the compacted span to listeners of SECTIONS_EVENT and appends the sections they return
// after the model's summary. It decides nothing about what those sections contain. Mount it IN
// PLACE OF dsh-compaction-basic inside one preset's compaction group.
import { isDeepStrictEqual } from 'node:util';
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


// ---------------------------------------------------------------------------------------------
// Sections: text other plugins append after the model's summary

/**
 * The extension point. Dispatched with no receiver, so EVERY listener in the app receives it,
 * whichever scope or isolate it was mounted in; a listener gates on `payload.agent` itself.
 * Listener: `(payload) => Section | Section[] | undefined` (or a promise of one). See README.
 */
export const SECTIONS_EVENT = 'compaction-instruction/sections';
/** Default wall-clock budget per listener, across all of its calls in one compaction. */
export const DEFAULT_SECTION_TIMEOUT_MS = 5000;
/** A section never takes more than this share of the compacted span's tokens. */
export const MAX_SPAN_SHARE = 0.5;
/** Tokens kept free below basic's "summary must be smaller than the shadowed content" line. */
export const SIZE_MARGIN_TOKENS = 16;
/** Successive scales of the offered space; a listener whose sections do not fit is asked again with the next one. */
export const SHRINK_SCALES = Object.freeze([1, 0.5, 0.25, 0.125]);
/**
 * dsh-compaction-basic's (unexported) checkpoint framing around the summary blocks, copied so
 * the size guard can price the checkpoint exactly as basic will. A tripwire test compares it
 * with a checkpoint written by the installed basic.
 */
export const CHECKPOINT_FRAME = Object.freeze({
  open: 'This is an automatically generated checkpoint condensing an earlier span of the conversation to free up context. Treat the captured context as established background and build on it without restating it. Continue the task directly from the messages that follow, without acknowledging this checkpoint.\n\n<compacted-summary>',
  close: '</compacted-summary>',
});

const HEADING = /^#{1,6} [^\n]*\S$/;
const isPositiveInteger = (v) => typeof v === 'number' && Number.isInteger(v) && v > 0;
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Validate what one listener returned.
 * @returns {{ heading: string, body: string, markers: string[] }[]} - empty for undefined, null or [].
 * @throws {TypeError} on any other shape.
 */
export function normalizeSections(value) {
  if (value === undefined || value === null) return [];
  const list = Array.isArray(value) ? value : [value];
  return list.map((s, i) => {
    const where = `section ${i}`;
    if (typeof s !== 'object' || s === null) throw new TypeError(`${where}: must be an object { heading, body, markers? }`);
    if (typeof s.heading !== 'string' || !HEADING.test(s.heading)) throw new TypeError(`${where}: heading must be one markdown heading line ("## Title")`);
    if (typeof s.body !== 'string' || s.body.trim().length === 0) throw new TypeError(`${where}: body must be a non-empty string`);
    const markers = s.markers ?? [];
    if (!Array.isArray(markers) || !markers.every((m) => typeof m === 'string' && m.trim().length > 0 && !m.includes('\n'))) throw new TypeError(`${where}: markers must be an array of one-line strings`);
    return Object.freeze({ heading: s.heading, body: s.body, markers: Object.freeze([...markers]) });
  });
}

/** One section as the text block appended to the summary: a blank line, the heading, a blank line, the body. */
export const renderSection = (s) => `\n\n${s.heading}\n\n${s.body}\n`;

/**
 * The line prefixes a set of sections reserves: each heading (as a heading of any level) and
 * each declared marker. A marker that starts with "#" matches a heading of any level.
 */
function reservedPatterns(sections) {
  const out = [];
  const add = (marker) => {
    const hashes = /^#+[ \t]*/.exec(marker);
    const rest = hashes ? marker.slice(hashes[0].length) : marker;
    const tail = /\w$/.test(rest) ? '(?!\\w)' : '';
    out.push(hashes ? `#{1,6}[ \\t]*${escapeRegExp(rest)}${tail}` : `${escapeRegExp(rest)}${tail}`);
  };
  for (const s of sections) {
    add(s.heading);
    for (const m of s.markers) add(m);
  }
  return [...new Set(out)];
}

/**
 * Escape (prefix "\") every line that would read as one of `patterns` at its start, after
 * indentation. Idempotent: an escaped line no longer starts with the pattern.
 */
export function neutralizeLines(text, patterns) {
  if (patterns.length === 0) return text;
  return text.replace(new RegExp(`^([ \\t]*)(?=${patterns.join('|')})`, 'gm'), '$1\\');
}

/**
 * The checkpoint blocks for a model summary plus sections. The model's text blocks get every
 * reserved prefix neutralized; each section body gets the OTHER sections' reserved prefixes and
 * its own heading neutralized (its own markers are its real entries).
 */
export function composeSummary(summary, sections) {
  if (sections.length === 0) return summary;
  const all = reservedPatterns(sections);
  const model = summary.map((b) => {
    if (b?.type !== 'text') return b;
    const text = neutralizeLines(b.text, all);
    return text === b.text ? b : { ...b, text };
  });
  const blocks = sections.map((s, i) => {
    const others = reservedPatterns(sections.filter((_, j) => j !== i));
    const own = reservedPatterns([{ heading: s.heading, markers: [] }]);
    return { type: 'text', text: renderSection({ ...s, body: neutralizeLines(s.body, [...new Set([...others, ...own])]) }) };
  });
  return [...model, ...blocks];
}

/**
 * Size guard for one compaction. Basic rejects a checkpoint whose framed estimate is not smaller
 * than the span's summed route tokens (summarizeCompaction); the guard prices candidate blocks
 * with the same meter on the same framing and requires SIZE_MARGIN_TOKENS below that line, the
 * sections within MAX_SPAN_SHARE of the span and, under pressure, the context after the
 * checkpoint below the threshold by the same margin.
 * @param {{ totalTokens: number, thresholdTokens: number }} [pressure]
 */
export function sizeGuard({ meter, session, spanSeqs, summary, pressure }) {
  const inSpan = new Set(spanSeqs);
  const spanTokens = meter.measure(session).nodes.reduce((n, node) => n + (inSpan.has(node.seq) ? node.tokens : 0), 0);
  const framed = (blocks) => meter.estimateMessage({ role: 'user', content: [{ type: 'text', text: CHECKPOINT_FRAME.open }, ...blocks, { type: 'text', text: CHECKPOINT_FRAME.close }] });
  const modelOnly = framed(summary);
  const after = (checkpointTokens) => pressure.totalTokens - spanTokens + checkpointTokens;
  const totalOf = (sections) => framed(composeSummary(summary, sections));
  /** Tokens still available for more sections after `sections` (0 when none). */
  const room = (sections) => {
    const total = totalOf(sections);
    let r = Math.min(spanTokens - SIZE_MARGIN_TOKENS - 1 - total, Math.floor(spanTokens * MAX_SPAN_SHARE) - (total - modelOnly));
    if (pressure !== undefined) r = Math.min(r, pressure.thresholdTokens - SIZE_MARGIN_TOKENS - 1 - after(total));
    return Math.max(0, r);
  };
  const fits = (sections) => {
    const total = totalOf(sections);
    return total + SIZE_MARGIN_TOKENS < spanTokens && total - modelOnly <= spanTokens * MAX_SPAN_SHARE
      && (pressure === undefined || after(total) + SIZE_MARGIN_TOKENS < pressure.thresholdTokens);
  };
  // pressure: the model's checkpoint alone does not get below the threshold, so basic compacts
  // again anyway (or fails); no sections on this attempt, the next one offers them again
  const converges = pressure === undefined || after(modelOnly) < pressure.thresholdTokens;
  return { spanTokens, modelOnly, converges, room, fits, totalOf };
}

class SectionTimeout extends Error {}

/**
 * Settle `promise`, or reject with SectionTimeout after `ms` (and abort `controller`), or reject
 * as soon as the compaction's own `signal` aborts: a listener that ignores its signal cannot hold
 * up a cancelled compaction.
 */
function within(promise, ms, controller, signal) {
  let timer;
  let onAbort;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => { controller.abort(new SectionTimeout(`no answer within ${ms} ms`)); reject(new SectionTimeout(`no answer within ${ms} ms`)); }, Math.max(0, ms));
    if (signal) {
      onAbort = () => reject(signal.reason ?? new Error('compaction aborted'));
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }
  });
  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timer);
    if (onAbort) signal.removeEventListener('abort', onAbort);
  });
}

/**
 * Ask every listener for sections, in registration order, each against the room the earlier
 * accepted ones left. A listener whose sections do not fit is asked again with a smaller space
 * (SHRINK_SCALES); the plugin never cuts a section's text. A listener that throws, times out or
 * returns an invalid shape is dropped and never called again in this compaction.
 * @returns {Promise<{ sections: object[], notes: { kind: string, message: string }[] }>}
 */
export async function collectSections({ listeners, base, guard, estimate, timeoutMs, signal }) {
  const accepted = [];
  const notes = [];
  for (const [index, listener] of listeners.entries()) {
    if (signal?.aborted) break;
    const deadline = Date.now() + timeoutMs;
    let placed = false;
    let lastSize = 0;
    for (const scale of SHRINK_SCALES) {
      const room = guard.room(accepted);
      if (room <= 0) { notes.push({ kind: 'size', message: `listener ${index}: no room left in the checkpoint` }); placed = true; break; }
      const tokens = Math.max(1, Math.floor(room * scale));
      const space = Object.freeze({
        tokens,
        scale,
        estimate,
        fits: (candidate) => {
          const list = normalizeSections(candidate);
          return guard.fits([...accepted, ...list]) && guard.totalOf([...accepted, ...list]) - guard.totalOf(accepted) <= tokens;
        },
      });
      const controller = new AbortController();
      const callSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
      let sections;
      try {
        const value = await within(Promise.resolve().then(() => listener(Object.freeze({ ...base, space, signal: callSignal }))), deadline - Date.now(), controller, signal);
        sections = normalizeSections(value);
      } catch (error) {
        if (signal?.aborted) { placed = true; break; } // the compaction itself was cancelled: not this listener's fault
        const kind = error instanceof SectionTimeout ? 'timeout' : error instanceof TypeError && /^section \d+:/.test(error.message) ? 'invalid' : 'error';
        notes.push({ kind, message: `listener ${index}: ${error instanceof Error ? error.message : String(error)}; its section is left out` });
        placed = true;
        break;
      }
      if (sections.length === 0) { placed = true; break; }
      if (guard.fits([...accepted, ...sections])) {
        accepted.push(...sections);
        if (scale < 1) notes.push({ kind: 'shrunk', message: `listener ${index}: section accepted at ${scale} of the offered space` });
        placed = true;
        break;
      }
      lastSize = sections.reduce((n, s) => n + estimate(renderSection(s)), 0);
    }
    if (!placed) notes.push({ kind: 'size', message: `listener ${index}: section (~${lastSize} tokens) never fit below basic's size and pressure lines; left out` });
  }
  return { sections: accepted, notes };
}

const sameMessage = (a, b) => a === b || isDeepStrictEqual(a, b);
const eventAt = (session, seq) => session.eventAt(seq);
const derive = (session, seq) => session.deriveEventMessage(eventAt(session, seq));

/**
 * Recover the compacted span from basic's summarization input. Basic does not pass the range to
 * `summarize()`; it builds `input.messages` as [system head message?, ...derived messages of
 * the shadowed surface nodes] (buildSummarizationInput), and the surface does not change while
 * the compaction lock (compaction/start) is held. The span is the run of surface nodes, after
 * the system head, whose derived messages are exactly the rest of `input.messages`.
 * @returns {{ shadowedSeqs: number[] } | undefined} undefined when nothing matches.
 */
export function compactedSpan(session, input) {
  const nodes = session.surface?.nodes ?? [];
  const messages = Array.isArray(input?.messages) ? input.messages : [];
  if (nodes.length === 0 || messages.length === 0) return undefined;
  let firstIdx = 0;
  let offset = 0;
  if (eventAt(session, nodes[0])?.type === 'system/message') {
    firstIdx = 1;
    const head = derive(session, nodes[0]);
    if (head !== null) {
      if (!sameMessage(head, messages[0])) return undefined;
      offset = 1;
    }
  }
  const region = messages.slice(offset);
  if (region.length === 0) return undefined;
  for (let start = firstIdx; start < nodes.length; start += 1) {
    const seqs = [];
    let k = 0;
    for (let i = start; i < nodes.length && k < region.length; i += 1) {
      const m = derive(session, nodes[i]);
      seqs.push(nodes[i]);
      if (m === null) continue;
      if (!sameMessage(m, region[k])) break;
      k += 1;
    }
    if (k === region.length) return { shadowedSeqs: seqs };
  }
  return undefined;
}



/**
 * The pressure threshold basic applies for `header`'s route (resolveTargetPolicy +
 * resolveCompactSpec, not exported): floor(min(window × thresholdRatio, window − reserved
 * completion tokens − headroomTokens)), with an exact-target modelPolicies override.
 * @returns {Promise<number | undefined>} undefined when the route has no known capacity.
 */
export async function pressureThreshold(config, llm, header, signal) {
  const target = header?.config;
  if (!target?.provider || !target?.model) return undefined;
  const override = config.modelPolicies?.find((p) => p.provider === target.provider && p.model === target.model);
  const thresholdRatio = override?.thresholdRatio ?? config.thresholdRatio;
  const headroomTokens = override?.headroomTokens ?? config.headroomTokens;
  const info = await llm.resolveModelInfo(target.provider, target.model, signal);
  const contextWindow = info?.context?.contextWindow;
  if (!Number.isInteger(contextWindow) || contextWindow <= 0) return undefined;
  const reserved = target.maxTokens ?? info.defaultMaxTokens ?? 0;
  return Math.floor(Math.min(contextWindow * thresholdRatio, contextWindow - reserved - headroomTokens));
}


/**
 * A dsh-compaction-basic subclass. It changes `summarize()`, basic's documented customization
 * hook: the request, the model's `rawOutput` and `usage` are basic's own; after a successful
 * summary (basic throws on error, abort and max-tokens before returning) the sections that
 * SECTIONS_EVENT listeners return are added to `summary`, which basic then frames, size-checks
 * and commits. `compactPressure()` and `compactIfNeeded()` only record which trigger is running,
 * so `summarize()` can keep basic's pressure loop and overflow recovery on the outcome they would
 * have had without the sections. With no listener, `summarize()` returns basic's result as is.
 */
function sectionsEngine({ logger, timeoutMs }) {
  const warned = new Set();
  const warnOnce = (key, message) => {
    if (warned.has(key)) { logger.debug(message); return; }
    warned.add(key);
    logger.warn(message);
  };
  // Per agent, the trigger being run. Closure state, not #private fields: cordis hands the
  // service out behind a Proxy, so `this` inside these methods is not the instance itself.
  const triggers = new WeakMap();
  const during = async (agent, trigger, run) => {
    const previous = triggers.get(agent);
    triggers.set(agent, trigger);
    try {
      return await run();
    } finally {
      if (previous === undefined) triggers.delete(agent);
      else triggers.set(agent, previous);
    }
  };
  return class SectionsCompactionEngine extends BasicCompactionEngine {
    compactIfNeeded(agent, trigger, signal) {
      return during(agent, { kind: trigger === 'context-overflow' ? 'overflow' : 'pressure' }, () => super.compactIfNeeded(agent, trigger, signal));
    }

    compactPressure(agent, header, signal, requireBelowThreshold) {
      // called by compactIfNeeded (step pressure) or directly by basic's model-switch listener
      const kind = triggers.get(agent)?.kind ?? 'model-switch';
      return during(agent, { kind, header }, () => super.compactPressure(agent, header, signal, requireBelowThreshold));
    }

    async summarize(input, agent, signal) {
      const result = await super.summarize(input, agent, signal);
      if (signal?.aborted) return result;
      const listeners = this.ctx.events.dispatch('emit', [SECTIONS_EVENT]);
      if (listeners.length === 0) return result;
      const trigger = triggers.get(agent);
      // Overflow recovery retries the request that just overflowed: add nothing to it. The next
      // checkpoint offers the span again, so listeners lose nothing for good.
      if (trigger?.kind === 'overflow') {
        logger.debug('context-overflow recovery: no sections on this checkpoint');
        return result;
      }
      let collected;
      try {
        const session = agent.session;
        const span = compactedSpan(session, input);
        if (span === undefined) {
          warnOnce('span', 'could not recognize the compacted span in the summarization input; no sections appended');
          return result;
        }
        let pressure;
        if (trigger?.header !== undefined) {
          const thresholdTokens = await pressureThreshold(this.config, this.ctx.llm, trigger.header, signal);
          if (thresholdTokens === undefined) return result;
          pressure = { thresholdTokens, totalTokens: this.ctx.tokenMeter.measure(session, trigger.header).totalTokens };
        }
        const meter = this.ctx.tokenMeter;
        const guard = sizeGuard({ meter, session, spanSeqs: span.shadowedSeqs, summary: result.summary, pressure });
        if (!guard.converges) {
          logger.debug('pressure: the model checkpoint alone stays above the threshold; no sections on this attempt');
          return result;
        }
        const seqs = Object.freeze([...span.shadowedSeqs]);
        const inSpan = new Set(seqs);
        const base = {
          agent,
          session,
          trigger: trigger?.kind ?? 'manual',
          span: Object.freeze({ seqs, start: seqs[0], end: seqs[seqs.length - 1] }),
          retainedSeqs: Object.freeze((session.surface?.nodes ?? []).filter((seq) => !inSpan.has(seq))),
          shadowed: Object.freeze(seqs.map((seq) => session.eventAt(seq))),
          summary: Object.freeze(result.summary.slice()),
        };
        const estimate = (text) => meter.estimateMessage({ role: 'user', content: [{ type: 'text', text }] });
        collected = await collectSections({ listeners, base, guard, estimate, timeoutMs, signal });
      } catch (error) {
        warnOnce('error', `sections skipped: ${error instanceof Error ? error.message : String(error)}`);
        return result;
      }
      for (const note of collected.notes) warnOnce(note.kind, `sections: ${note.message}`);
      if (signal?.aborted || collected.sections.length === 0) return result;
      return { ...result, summary: composeSummary(result.summary, collected.sections) };
    }
  };
}

/** Split this plugin's own keys off; everything else is basic's config, passed through untouched. */
export function splitConfig(config) {
  const { instruction, mode = 'append', sectionTimeoutMs = DEFAULT_SECTION_TIMEOUT_MS, ...basicConfig } = config ?? {};
  if (instruction != null && typeof instruction !== 'string') throw new TypeError(`${name}: instruction must be a string`);
  if (!MODES.includes(mode)) throw new TypeError(`${name}: mode must be "append" or "replace", got ${JSON.stringify(mode)}`);
  if (!isPositiveInteger(sectionTimeoutMs)) throw new TypeError(`${name}: sectionTimeoutMs must be a positive integer, got ${JSON.stringify(sectionTimeoutMs)}`);
  const active = typeof instruction === 'string' && instruction.trim().length > 0;
  return { rule: active ? { instruction, mode } : undefined, timeoutMs: sectionTimeoutMs, basicConfig };
}

export function apply(ctx, config) {
  const { rule, timeoutMs, basicConfig } = splitConfig(config);
  const Engine = sectionsEngine({ logger: ctx.logger(name), timeoutMs });
  // No instruction: the subclass sees the real llm; the request is basic's own.
  if (rule === undefined) {
    ctx.plugin(Engine, basicConfig);
    return;
  }

  let warned = false;
  const onMiss = () => {
    if (warned) return;
    warned = true;
    ctx.logger(name).warn('a purpose=compaction call does not end with the known dsh-compaction-basic directive; forwarded unchanged (did dsh-compaction-basic change its directive?)');
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
  child.plugin(Engine, basicConfig);
}
