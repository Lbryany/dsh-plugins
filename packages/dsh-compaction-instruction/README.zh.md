# dsh-compaction-instruction
中文 | [English](README.md)

`@deepseek-ai/dsh-compaction-basic` 的替换件，让 profile 能改压缩时的总结指令。dsh-compaction-basic 把这段指令写死在常量 `COMPACTION_INSTRUCTION` 里，作为 `purpose: 'compaction'` 那次模型调用的最后一条 user 消息发出；dsh 没有配置项或钩子能改它。本插件挂载真正的 dsh-compaction-basic，只改写这一条消息：在原指令后面追加你的要求，或者整段替换。

0.2 起它还是一个扩展点：压缩时把被压缩的那一段交给别的插件，把它们返回的文字段落附在模型摘要之后、检查点之内。插件只提供机制；段落里写什么（比如由代码从会话日志里照抄的文字）由监听的插件决定（见[附加段落](#附加段落)）。

插件是通用的：不认识任何产品、预设或项目，只依赖 dsh 自己的包。它的作用范围就是它挂载的位置：放在某个预设的压缩组里顶替 dsh-compaction-basic，就只有这个预设的 agent 用改过的指令，其他预设不受影响。

要求 **dsh 0.2.2-rc.1 及以上、0.3 以下**（`engines.dsh`：`>=0.2.2-rc.1 <0.3.0-0`），在 0.2.2-rc.1 与 0.2.2-rc.5 上测过。

## 配置

| 键 | 缺省 | 含义 |
|---|---|---|
| `instruction` | （无） | 追加或替换用的文字。空串、全是空白、`null`（YAML 里 `instruction:` 后面留空）或不写时，行为与 dsh-compaction-basic 完全相同，不改写。 |
| `mode` | `append` | `append`：最后一条消息变成 `<原指令>\n\n<instruction>`；`replace`：最后一条消息只有 `<instruction>`。 |
| `sectionTimeoutMs` | `5000` | 一次压缩里每个[附加段落](#附加段落)监听者的总耗时上限（含被再次询问的几次）。超时的监听者这个检查点不附它的段落。 |
| 其他键 | | 原样交给 dsh-compaction-basic（`thresholdRatio`、`retainTokens`、`summarizationModel`、`auto` 等）。`instruction`、`mode`、`sectionTimeoutMs` 会先去掉，因为 basic 不接受未知键；其他未知键由 basic 自己报错、挂载失败，错误里写明是哪个键。 |

一般用 `append`：保留 basic 的输出结构（各个 Markdown 小节与规则），再加上你的规则。用 `replace` 就由你负责整段指令，包括输出格式和「只输出检查点」这类规则。basic 照旧给结果套上检查点包装，体积检查与重试也照旧。

## 安装

1. 像其他插件一样装进 profile：把 `@lbryany/dsh-compaction-instruction` 加进 `dependencies` 和 `dsh.profile.bundles`，然后安装（git 子目录写法见仓库 [README](../../README.zh.md)；从插件市场安装会两步都做）。包里的 [`cordis.patch.yml`](cordis.patch.yml) **什么都不插入**，光安装不会改变任何行为。挂在根上会给所有 agent 多出一个压缩引擎，所以要手动挂进预设，写法见下。
2. 在 profile 的 `cordis.patch.yml` 里，把某个预设压缩组中的 dsh-compaction-basic 换成它。
3. 重启这个 profile。

### 挂进预设

预设的插件写在 `@deepseek-ai/dsh-agent-preset` 条目的 `config.plugins` 里，压缩组是一个 `cordis:group`，带 `isolate: { compaction: true, toolResultPruner: true }`。把 dsh-compaction-basic 那一行的 `name` 换掉，在它的 `config` 里加上 `instruction` / `mode`：

```yaml
# profile 的 cordis.patch.yml：压缩时多保留一个小节的预设
- insert:
    - id: preset-careful
      name: '@deepseek-ai/dsh-agent-preset'
      config:
        id: careful
        plugins:
          # ……预设的其他插件……
          - id: compaction
            name: cordis:group
            group: true
            isolate:
              compaction: true
              toolResultPruner: true
            config:
              - id: compaction-basic
                name: '@lbryany/dsh-compaction-instruction'   # 原来是 '@deepseek-ai/dsh-compaction-basic'
                config:
                  mode: append
                  instruction: |-
                    Also add a final section "## Open Questions" that lists every unresolved question verbatim, so the next model does not silently drop them.
                  # dsh-compaction-basic 的键照样可以写在这里，例如 retainTokens: 20000
              - id: command-compact
                name: '@deepseek-ai/dsh-command-compact'
              - id: tool-result-pruner
                name: '@deepseek-ai/dsh-compaction-tool-result-pruner'
```

要改 profile 已经自带的预设，就按 id 覆盖那个预设条目，给出完整的 `config`：照抄原条目的全部字段（`id`、`name`、`description`、`order` 等）加上完整的 `plugins` 列表，其中那一行已经换掉。loader 的补丁会整个替换 `config`，漏写的字段会丢（例如 `preset-standard` 的 `order: 1`）；但改不了嵌套行的名字：补丁里的 `name` 只用来核对目标，名字对不上就跳过；按 id 打的补丁也进不到 `config.plugins` 里面。特别是写 `- id: compaction-basic` 加 `config` 的补丁，会落到根上的压缩那一行（`web` profile 里是禁用的），而不是任何预设里的那一行，也不报警告。

只有 `web` profile 禁用了根上的 `compaction-basic`。保留根引擎的 profile（acp、headless、sdk）里，根引擎在 `agent/pre-step` 上先运行并完成压缩，预设里的引擎（包没包这一层都一样）根本轮不到。

`/compact`（dsh-command-compact）和自动压缩走的是同一个引擎，所以都会用改过的指令。

## 附加段落

模型写的摘要是转述：可能漏掉细节，也可能把话安到错的人头上。需要某段文字原样挺过压缩的插件，可以把它直接附在检查点里、模型摘要之后。附什么不由本插件决定：本插件只提供下面这个事件，并保证检查点仍然有效。

**事件。** 本插件每次压缩、模型摘要回来之后，按注册顺序调用 `compaction-instruction/sections`（导出为 `SECTIONS_EVENT`）的每个监听者：

```js
import { SECTIONS_EVENT } from '@lbryany/dsh-compaction-instruction'; // 或直接写这个字符串

ctx.on('compaction-instruction/sections', async (payload) => {
  if (!wanted(payload.agent)) return undefined;         // 每个监听者都会收到所有 agent 的压缩，在这里自己筛
  const section = { heading: '## My Section', body: '...', markers: ['[#'] };
  return payload.space.fits(section) ? section : undefined;
});
```

事件派发时不带接收者，所以挂在哪里的监听者都收得到：根上、别的组里、别的预设作用域里、本插件建的 `llm` 隔离之内或之外。这也意味着，凡是挂了本插件的预设，它的每个 agent 压缩时监听者都会被调用，要自己看 `payload.agent` 决定答不答。

**参数**（冻结对象）：

| 字段 | 含义 |
|---|---|
| `agent`、`session` | 正在压缩的 agent 与它的会话。按 `agent` 决定答不答。 |
| `trigger` | `manual`（`/compact`）、`pressure`（步间自动压缩）或 `model-switch`（换模型）。 |
| `span` | `{ seqs, start, end }`：这个检查点替换掉的表面节点，按表面顺序。 |
| `retainedSeqs` | 不在这一段里的表面节点，检查点之后仍然可见。 |
| `shadowed` | `span.seqs` 对应的会话事件。整份日志仍可用 `session.eventAt(seq)` 读。 |
| `summary` | 模型的摘要块，即 basic 返回的原样。 |
| `space` | `{ tokens, scale, fits(sections), estimate(text) }`：还能放多少 token、这次按几分之一给的、按下面所有守卫精确核对的函数、token 计量器对一段文字的估算。 |
| `signal` | 压缩被取消或这个监听者超时时中止。插件在那一刻就不再等，不管监听者理不理会。 |

**返回值。** `undefined`、`null`、`[]`、一个段落或段落数组（也可以是它们的 promise）。段落是 `{ heading, body, markers? }`：`heading` 是一行 Markdown 标题（`## 标题`）；`body` 是非空文字；`markers` 是这个段落留给自己条目用的行首前缀。每个段落在模型摘要之后变成一个文字块 `\n\n<heading>\n\n<body>\n`，按监听者顺序排。

**中和。** 模型摘要里，凡是读起来像某个附加段落标题的行（任何级别的标题）、或以它的某个 marker 开头的行，行首加 `\`。每个段落正文里，像别的段落标题或 marker、或像它自己标题的行也照此转义；段落自己的 marker 在它自己的正文里不动。这样只有监听者自己写得出它的标题和条目。监听者从别处抄来的文字（比如日志里一行以 marker 开头的内容）由监听者自己转义。

**体积守卫。** 附加段落绝不能让一次本来能成功的压缩失败：

- basic 会拒绝估算体积不小于被替换那一段的检查点。附加段落用同一个 token 计量器、同样的包装、连同中和后的模型摘要一起估算，必须比这条线再低 16 个 token，且最多占这一段的一半。
- 自动压缩与换模型时的压缩，只要上下文仍不低于阈值，basic 就会再压一次（或报错）。如果只有模型检查点时能降到阈值以下，加上段落后也必须降到阈值以下；如果只有模型检查点时都降不下去，这一次不调用任何监听者，basic 反正还会再压，下一次再给空间。
- 上下文溢出后的恢复会原样重试刚才溢出的请求，所以也不调用监听者；下一次压缩会再给出这一段。

放不下的段落不截断，因为插件不知道一个段落能丢掉什么：改为把给出的空间减半、再问一次监听者，最低到八分之一（`space.scale`）。始终放不下，就不附它的段落。监听者抛错、拒绝、返回格式不对、或超过 `sectionTimeoutMs`，这个检查点不附它的段落，这次压缩里也不再问它；其他监听者照常附上。每类问题每次挂载只记一条警告，之后记 debug。

**仍归模型的部分。** 请求是 basic 自己的，前缀相同，提示缓存不受影响。`compaction/summary` 里记的 `rawOutput` 与 `usage` 是模型的；只有 `summary`（也就是检查点）多出这些块。模型调用出错、被中止或撞上 token 上限时，basic 照旧失败，不调用任何监听者。没有监听者、或所有监听者都不返回内容时，检查点与原版 dsh-compaction-basic 逐字节相同。

模型读到之前的检查点时，可能在自己的摘要里模仿某个段落。这种模仿会按上面的规则中和，但仍占 token。用了 `instruction` 的话，告诉模型这一段由 harness 附上，不要自己写。

## 原理

挂载的是 dsh-compaction-basic 的一个子类。它覆盖 `summarize()`，也就是 basic 文档里写明的唯一定制点：先调 basic 自己的 `summarize()`；有监听者时再向它们要段落，把收下的加在返回的 `summary` 后面；之后 basic 照旧包装、做体积检查、落盘。`compactPressure()` 与 `compactIfNeeded()` 的覆盖只记下当前是哪种触发，供上面的守卫用。

basic 不把被压缩的范围传给 `summarize()`；它的输入是 `[系统提示, ...被遮蔽的表面节点的消息]`（`buildSummarizationInput`），而持有压缩锁（`compaction/start`）期间表面不会变。所以插件把输入消息与当前表面（系统提示之后）逐条比对，找回这一段。比对不上（调用方自己拼的输入）就不调用监听者，并记一条警告。

改写指令的部分：插件注入 `llm`，给子 context 隔离 `llm`，在那里提供一个小代理，再在子 context 里挂载真正的 dsh-compaction-basic。basic 的所有模型调用都经过这个代理：

- 若一次 `purpose: 'compaction'` 调用的最后一条消息是只含一段文字的 user 消息，并且以 `You are now acting as a compaction engine` 开头，就改写成一个新的 options 对象。这次调用的其余部分一概不动：前面的消息、tools、工具历史、provider、model、`maxTokens`、session id、signal。重放的前缀因此逐字节不变，服务端的提示缓存照样能命中。
- 其他调用原样转发，传的是同一个 options 对象。`llm` 的其他成员（例如 `resolveModelInfo`）在调用时转发给真正的服务。
- 代理是一个普通对象，不暴露任何 symbol 键。这样 cordis 会把它原样交给 basic，真正的 `llm` 始终经由本插件自己的 context 取到；外层非全局的 `llm/stream` 监听（例如 `dsh-session-checkpoint-policy`，它在压缩调用前把会话落盘）照样能看到这次调用，看到的是改写后的消息。如果代理被 cordis 重新绑定，这些监听会被悄悄跳过；全局监听不受影响。

如果某次 `purpose: 'compaction'` 调用的最后一条不是预期的指令（比如 dsh 升级后改了措辞），这次调用原样转发，插件每次挂载只记一条警告。测试里有一条升级绊线：用**本机安装的** dsh-compaction-basic 实际跑一次，检查它的指令开头没变。

## 开发

测试离线运行，用的是本机安装的 dsh：真的 cordis、真的 dsh-llm、安装的 dsh-compaction-basic，加一个假的模型适配器。不访问网络，也不调用模型。

```sh
npm test        # 先链接本机 dsh 的包，再跑 node --test test/*.test.mjs
```

附加段落的测试另外用真的 dsh-session 会话和 dsh-token-meter 的估算。`test/sections.test.mjs` 第一条是路由测试：根上、同级组里、别的预设作用域里的监听者都必须收到事件，有没有 `llm` 隔离都一样。

`scripts/link-dsh.mjs` 把 `cordis`、`dsh-agent`、`dsh-compaction-basic`、`dsh-llm`、`dsh-scope`、`dsh-session`、`dsh-token-meter` 逐个链到 `node_modules/@deepseek-ai/` 下。它按 `DSH_INSTALL_DIR`（`@deepseek-ai/dsh` 包目录）、`DSH_BIN`（它的 `lib/bin.js`）、`npm root -g` 的顺序找 dsh。只链单个包目录，不链整个 `node_modules`，误跑 `npm install` 也写不进全局 dsh。本包没有构建步骤。

## 许可

[MIT](./LICENSE)
