/**
 * frame 里的宿主桥 `window.dsh`：由 shell.ts 在片段脚本之前内联注入（frame 的 CSP 已允许
 * inline script），纯字符串组装、不碰 DOM，node 侧单测可直接跑。
 *
 * - `widgetState`：当前快照或 null，文档组装时内联（同步可读，渲染时就能用）。
 * - `setWidgetState(state)`：预检（只许两个键、JSON-only、≤ 16 KiB）后发给卡片，卡片写宿主、
 *   落盘后回 ack 才 resolve；连续调用按序排队；成功后更新快照并派发 `dsh:set_globals`。
 * - `sendFollowUpMessage({ prompt, title? })` / `openExternal({ href })`：手势门——距 frame
 *   内最近一次可信的用户输入超过 1.5 秒直接以 `no-user-gesture` 失败。
 * - 文档上挂捕获阶段 click：http(s) 锚点改走 openExternal（沙箱没有 allow-popups，本来也开不了）。
 * - 加载完成后派发一次 `dsh:set_globals`（`detail.globals = { widgetState, theme }`）。
 *
 * frame 里跑的是模型写的代码，它也能绕开这些函数直接 postMessage；所以这里的检查只是
 * 尽早给出明确的错误，真正的关口在卡片侧（来源校验、zod、宿主侧用户激活检查、确认框）。
 *
 * @module @lbryany/dsh-widget/frame-bridge
 */

import {
  BRIDGE_MESSAGE_TYPE,
  BRIDGE_RESULT_TYPE,
  GESTURE_WINDOW_MS,
  GLOBALS_EVENT,
  PROMPT_MAX_BYTES,
  STATE_MAX_BYTES,
  TITLE_MAX_CHARS,
  type WidgetState,
} from './bridge-contract.ts'

/** 桥的连接方式：`live` 有卡片应答；`detached`（新窗口、缩略图、流式预览）只读。 */
export type BridgeMode = 'live' | 'detached'

/** 组装桥脚本的输入。 */
export interface FrameBridgeOptions {
  /** 与卡片对账的令牌（工具调用 id）。 */
  token: string
  /** 初始状态。 */
  state: WidgetState | null
  /** 主题。 */
  theme: 'light' | 'dark'
  /** 连接方式。 */
  mode: BridgeMode
}

/**
 * 把值序列化成可安全内联进 `<script>` 的 JS 字面量。
 * @param value - JSON 值。
 * @returns 字面量文本。
 */
export function scriptLiteral(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll(' ', '\\u2028')
    .replaceAll(' ', '\\u2029')
}

/**
 * frame 内桥脚本正文。
 * @param options - 令牌、初始状态、主题、连接方式。
 * @returns 内联脚本正文。
 */
export function frameBridgeScript(options: FrameBridgeOptions): string {
  return `
(function () {
  var TOKEN = ${scriptLiteral(options.token)};
  var LIVE = ${options.mode === 'live' ? 'true' : 'false'};
  var REQUEST = ${scriptLiteral(BRIDGE_MESSAGE_TYPE)};
  var RESULT = ${scriptLiteral(BRIDGE_RESULT_TYPE)};
  var EVENT = ${scriptLiteral(GLOBALS_EVENT)};
  var STATE_MAX = ${STATE_MAX_BYTES};
  var PROMPT_MAX = ${PROMPT_MAX_BYTES};
  var TITLE_MAX = ${TITLE_MAX_CHARS};
  var GESTURE_MS = ${GESTURE_WINDOW_MS};
  var state = ${scriptLiteral(options.state)};
  var theme = ${scriptLiteral(options.theme)};
  var lastGesture = -Infinity;
  var seq = 0;
  var pending = {};
  var queue = Promise.resolve();
  var now = function () { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); };
  var mark = function (event) { if (event.isTrusted) lastGesture = now(); };
  ['pointerup', 'keyup', 'keydown', 'click'].forEach(function (name) { addEventListener(name, mark, true); });
  function fail(code, message) {
    var error = new Error(message || code);
    error.code = code;
    return error;
  }
  function bytes(text) { return new TextEncoder().encode(text).length; }
  function copy(value) { return value === null ? null : JSON.parse(JSON.stringify(value)); }
  function isJson(value, depth) {
    if (depth > 64) return false;
    if (value === null) return true;
    var kind = typeof value;
    if (kind === 'string' || kind === 'boolean') return true;
    if (kind === 'number') return isFinite(value);
    if (kind !== 'object') return false;
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i++) if (!(i in value) || !isJson(value[i], depth + 1)) return false;
      return true;
    }
    var proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return false;
    for (var key in value) {
      if (Object.prototype.hasOwnProperty.call(value, key) && !isJson(value[key], depth + 1)) return false;
    }
    return true;
  }
  function gestureOk() { return now() - lastGesture <= GESTURE_MS; }
  function emit() {
    dispatchEvent(new CustomEvent(EVENT, { detail: { globals: { widgetState: copy(state), theme: theme } } }));
  }
  addEventListener('message', function (event) {
    if (event.source !== parent) return;
    var data = event.data;
    if (!data || data.type !== RESULT || data.token !== TOKEN || typeof data.id !== 'number') return;
    var waiter = pending[data.id];
    if (!waiter) return;
    delete pending[data.id];
    if (data.ok) waiter.resolve(data.value);
    else waiter.reject(fail(String(data.error || 'failed'), typeof data.message === 'string' ? data.message : undefined));
  });
  function call(method, params) {
    if (!LIVE || parent === window) return Promise.reject(fail('unavailable', 'this card is not connected to the host'));
    return new Promise(function (resolve, reject) {
      var id = ++seq;
      pending[id] = { resolve: resolve, reject: reject };
      try {
        parent.postMessage({ type: REQUEST, token: TOKEN, id: id, method: method, params: params }, '*');
      } catch (error) {
        delete pending[id];
        reject(fail('invalid-params', String(error && error.message || error)));
      }
    });
  }
  function setWidgetState(next) {
    if (typeof next !== 'object' || next === null || Array.isArray(next)) return Promise.reject(fail('invalid-params', 'state must be an object'));
    for (var key in next) {
      if (Object.prototype.hasOwnProperty.call(next, key) && key !== 'modelContent' && key !== 'privateContent') {
        return Promise.reject(fail('invalid-params', 'unknown state key: ' + key));
      }
    }
    var normalized = {
      modelContent: next.modelContent === undefined ? null : next.modelContent,
      privateContent: next.privateContent === undefined ? null : next.privateContent,
    };
    if (!isJson(normalized.modelContent, 0) || !isJson(normalized.privateContent, 0)) {
      return Promise.reject(fail('invalid-params', 'state must be JSON (no functions, undefined, NaN or Infinity)'));
    }
    var text = JSON.stringify(normalized);
    if (bytes(text) > STATE_MAX) return Promise.reject(fail('invalid-params', 'state exceeds ' + STATE_MAX + ' bytes'));
    var snapshot = JSON.parse(text);
    var run = function () {
      return call('state.set', snapshot).then(function () { state = snapshot; emit(); });
    };
    var result = queue.then(run, run);
    queue = result.catch(function () {});
    return result;
  }
  function sendFollowUpMessage(options) {
    if (!gestureOk()) return Promise.reject(fail('no-user-gesture', 'sendFollowUpMessage must follow a click or key press in the card'));
    var prompt = options && options.prompt;
    var title = options && options.title;
    if (typeof prompt !== 'string' || prompt.trim() === '' || bytes(prompt) > PROMPT_MAX) {
      return Promise.reject(fail('invalid-params', 'prompt must be non-empty text of at most ' + PROMPT_MAX + ' bytes'));
    }
    if (title !== undefined && (typeof title !== 'string' || title.length > TITLE_MAX)) {
      return Promise.reject(fail('invalid-params', 'title must be text of at most ' + TITLE_MAX + ' characters'));
    }
    return call('followUp', title === undefined ? { prompt: prompt } : { prompt: prompt, title: title }).then(function () {});
  }
  function httpHref(href) {
    try {
      var url = new URL(href);
      return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
    } catch (error) {
      return null;
    }
  }
  function openExternal(options) {
    if (!gestureOk()) return Promise.reject(fail('no-user-gesture', 'openExternal must follow a click or key press in the card'));
    var href = httpHref(options && options.href);
    if (href === null) return Promise.reject(fail('invalid-params', 'only http(s) links can be opened'));
    return call('openExternal', { href: href }).then(function () {});
  }
  var api = {
    setWidgetState: setWidgetState,
    sendFollowUpMessage: sendFollowUpMessage,
    openExternal: openExternal,
  };
  Object.defineProperty(api, 'widgetState', { enumerable: true, get: function () { return copy(state); } });
  Object.defineProperty(api, 'theme', { enumerable: true, get: function () { return theme; } });
  Object.defineProperty(window, 'dsh', { value: Object.freeze(api), enumerable: true });
  document.addEventListener('click', function (event) {
    if (event.defaultPrevented) return;
    var target = event.target;
    var anchor = target && target.closest ? target.closest('a[href]') : null;
    if (!anchor) return;
    var href = httpHref(anchor.href);
    if (href === null) return;
    event.preventDefault();
    openExternal({ href: href }).catch(function () {});
  }, true);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', emit);
  else setTimeout(emit, 0);
})();
`
}
