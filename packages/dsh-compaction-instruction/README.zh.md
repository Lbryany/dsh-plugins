# dsh-compaction-instruction
中文 | [English](README.md)

`@deepseek-ai/dsh-compaction-basic` 的替换件，让 profile 能改压缩时的总结指令。dsh-compaction-basic 把这段指令写死在常量 `COMPACTION_INSTRUCTION` 里，作为 `purpose: 'compaction'` 那次模型调用的最后一条 user 消息发出；dsh 没有配置项或钩子能改它。本插件挂载真正的 dsh-compaction-basic，只改写这一条消息：在原指令后面追加你的要求，或者整段替换。

插件是通用的：不认识任何产品、预设或项目，只依赖 dsh 自己的包。它的作用范围就是它挂载的位置：放在某个预设的压缩组里顶替 dsh-compaction-basic，就只有这个预设的 agent 用改过的指令，其他预设不受影响。

要求 **dsh 0.2.2-rc.1 及以上、0.3 以下**（`engines.dsh`：`>=0.2.2-rc.1 <0.3.0-0`），在 0.2.2-rc.1 上测过。

## 配置

| 键 | 缺省 | 含义 |
|---|---|---|
| `instruction` | （无） | 追加或替换用的文字。空串、全是空白、`null`（YAML 里 `instruction:` 后面留空）或不写时，行为与 dsh-compaction-basic 完全相同，不改写。 |
| `mode` | `append` | `append`：最后一条消息变成 `<原指令>\n\n<instruction>`；`replace`：最后一条消息只有 `<instruction>`。 |
| 其他键 | | 原样交给 dsh-compaction-basic（`thresholdRatio`、`retainTokens`、`summarizationModel`、`auto` 等）。`instruction` 与 `mode` 会先去掉，因为 basic 不接受未知键。 |

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

## 原理

插件注入 `llm`，给子 context 隔离 `llm`，在那里提供一个小代理，再在子 context 里挂载真正的 dsh-compaction-basic。basic 的所有模型调用都经过这个代理：

- 若一次 `purpose: 'compaction'` 调用的最后一条消息是只含一段文字的 user 消息，并且以 `You are now acting as a compaction engine` 开头，就改写成一个新的 options 对象。这次调用的其余部分一概不动：前面的消息、tools、工具历史、provider、model、`maxTokens`、session id、signal。重放的前缀因此逐字节不变，服务端的提示缓存照样能命中。
- 其他调用原样转发，传的是同一个 options 对象。`llm` 的其他成员（例如 `resolveModelInfo`）在调用时转发给真正的服务。
- 代理是一个普通对象，不暴露任何 symbol 键。这样 cordis 会把它原样交给 basic，真正的 `llm` 始终经由本插件自己的 context 取到；外层非全局的 `llm/stream` 监听（例如 `dsh-session-checkpoint-policy`，它在压缩调用前把会话落盘）照样能看到这次调用，看到的是改写后的消息。如果代理被 cordis 重新绑定，这些监听会被悄悄跳过；全局监听不受影响。

如果某次 `purpose: 'compaction'` 调用的最后一条不是预期的指令（比如 dsh 升级后改了措辞），这次调用原样转发，插件每次挂载只记一条警告。测试里有一条升级绊线：用**本机安装的** dsh-compaction-basic 实际跑一次，检查它的指令开头没变。

## 开发

测试离线运行，用的是本机安装的 dsh：真的 cordis、真的 dsh-llm、安装的 dsh-compaction-basic，加一个假的模型适配器。不访问网络，也不调用模型。

```sh
npm test        # 先链接本机 dsh 的包，再跑 node --test test/*.test.mjs
```

`scripts/link-dsh.mjs` 把 `cordis`、`dsh-agent`、`dsh-compaction-basic`、`dsh-llm`、`dsh-scope` 逐个链到 `node_modules/@deepseek-ai/` 下。它按 `DSH_INSTALL_DIR`（`@deepseek-ai/dsh` 包目录）、`DSH_BIN`（它的 `lib/bin.js`）、`npm root -g` 的顺序找 dsh。只链单个包目录，不链整个 `node_modules`，误跑 `npm install` 也写不进全局 dsh。本包没有构建步骤。

## 许可

[MIT](./LICENSE)
