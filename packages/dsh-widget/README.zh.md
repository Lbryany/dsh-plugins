# dsh-widget

> 本插件 fork 自社区插件 [Nagi-ovo/dsh-visualize](https://github.com/Nagi-ovo/dsh-visualize) v0.1.7（提交 `1ab0d90`，BSD 3-Clause，原许可证见 [LICENSE.dsh-visualize](LICENSE.dsh-visualize)，修改说明见 [NOTICE](NOTICE)）。上游的工具、流式预览、沙箱、五套风格、设置页和会话重放全部保留；本包补上了卡片与宿主之间的桥：**卡片状态持久化、状态回流模型、卡片按钮发起追问、外链**。工具名与技能名仍是 `visualize`，请不要与上游同时安装。

让 dsh 不只回答一段文字。模型调用 `visualize` 后，Web 界面会在对话里直接出现一张可交互卡片，用来做模拟器、图表、对比面板或界面草图；卡片还能记住用户的选择、让模型在后续回答里用上，并在用户点按钮时替用户发起追问。

## 安装

本插件在 [Lbryany/dsh-plugins](https://github.com/Lbryany/dsh-plugins) 单仓的 `packages/dsh-widget` 下，发布后可以从 dsh 的「发现」页经索引 `https://lbryany.github.io/dsh-plugins/index.json` 安装。本地开发时把它链接进一个 Web profile：

```sh
dsh plugin --profile web add /path/to/dsh-plugins/packages/dsh-widget
# dsh web 正在运行时，重启后刷新页面
```

`lib/` 构建产物已提交，从 git 安装不需要构建。要求 dsh `>=0.2.1-rc.2 <0.3.0-0`。

## 怎么用

直接告诉模型你想看什么，例如「做一个能调参数的排序算法可视化」。模型调用 `visualize`，把整段 HTML fragment 直接作为 `fragment` 参数传入（可选 `title`、`mode`），卡片在模型生成参数时就开始渲染。适合并排比较的内容可以使用 `mode: "wide"`。要修正已经画出的卡片，模型用 `action: "update"` 加上卡片的 `path` 和一处 `old_str` → `new_str` 替换，不必重发整段 markup；`path` 只用于 `update`。

要做的东西比一张聊天卡片大时，比如带筛选的数据看板、多视图工具、全屏模拟或完整的桌面端 mockup，模型会用 `mode: "page"` 做一个独立页面。对话里显示一张启动卡片：标题、一行说明（`summary` 参数）、页面的实时缩略图和「打开页面」按钮，点按钮后页面在新标签页里全尺寸打开。浏览器拦下新标签页时，可以点「在对话中展开」直接在对话里查看。用 `update` 改过页面后，已经打开的标签页不会自动刷新，再点一次「打开页面」即可。

卡片会跟随 DSH 的明暗主题，默认风格使用鲸鱼蓝配色（其他风格见下文）。聊天栏放不下时，点卡片标题行右侧的「在新窗口打开」按钮，可以在新标签页里全尺寸查看，页面沿用打开那一刻的主题，内容仍在同样的 sandboxed iframe 里运行。会话重放时，页面从持久化的工具结果恢复，不依赖原始 fragment 文件仍然存在。

每张卡片的 fragment 另存一份到 `~/.dsh/widget/sessions/<会话 id>/<标题>-<hash>.<style>.html`（设置了 `DSH_HOME` 时在 `$DSH_HOME/widget/` 下），按会话分开，不写进你的项目目录，`git status` 不会出现 `viz/`。`update` 改写的就是这份文件。旧版本写在工作区 `viz/` 下的卡片仍然可以 `update`，原地修改。插件不会自动清理这些文件，需要时可以直接删除 `~/.dsh/widget/`，已有会话的卡片照常重放。

DSH 默认会把已完成回合的工具过程折叠起来。折叠时，这一轮画出的卡片会再显示在最终回答下方，不用展开过程也能看到；「工作步骤展示」选「完全展开」时则只在原位显示。

## 卡片风格

页面模式有独立的排版尺度：标题、重点数字和面板留白更大，主图与辅助信息可以按 2:1 分栏，在窄屏折叠。聊天卡片保留原来的紧凑尺度。模型可按任务读取六类交互范例：参数模拟、方案比较、步骤演示、分析看板、数据探索和解释页面；范例遵循当前风格，不会强制替换你的配色。范例数据均为示例，不代表用户的真实数据。

固定对照题、运行方式及验证范围见 [可视化评测](eval/README.md)。

插件内置 5 种卡片风格，默认是 `whale`。在 DSH 里点左下角「更多」→「设置」→「可视化」，每种风格都有一张按当前明暗主题实时渲染的预览卡，点一下就保存，下一张卡片立即生效，不用重启。

也可以直接在 `<DSH_HOME>/profiles/web/cordis.patch.yml`（默认 `~/.dsh/profiles/web/cordis.patch.yml`）里加：

```yaml
- id: dsh-widget
  name: "@lbryany/dsh-widget"
  config:
    style: sketch
```

设置页保存的也是这一条：它通过宿主的 dsh-settings 写进同一个 `cordis.patch.yml`，保留文件里的其他条目和注释。


| `style` | 风格 | 适合 |
| --- | --- | --- |
| `whale` | 鲸蓝（默认）：跟 DSH 界面同一套颜色和系统字体 | 什么都行 |
| `editorial` | 报刊：衬线标题直接写结论，一条线高亮、其余退成灰，直接标注 | 趋势、比较、「这个数说明了什么」 |
| `paper` | 论文：衬线、L 形坐标轴、色盲安全配色，颜色加标记形状双重编码，「图 1 ·」图注 | 实验结果、学习曲线、带公式的讲解 |
| `sketch` | 手绘：手写字体、rough.js 草图线条、荧光笔标注 | 概念、直觉、流程 |
| `terminal` | 终端：等宽字体、直角、虚线网格、key–value 标签 | 延迟、吞吐、算法逐步执行 |

风格分两层。颜色、字体、圆角、图表默认值（网格、轴线、线宽）由卡片外壳注入，每种风格都同时适配明暗主题，背景保持透明；版式和写法（标题怎么写、要不要图注、用不用 rough.js）是一段风格说明，附加在 skill 末尾交给模型。风格说明只替换 `design.md` 里的审美建议，fragment 规则、CSP、主题变量、11px 下限和 lint 都不受影响。产品界面 mockup 不套用风格，按被画产品自己的样子来。

每张卡片在持久化的结果和副本文件名里记下它生成时的风格，之后改设置不会改变已有卡片，会话重放、「在新窗口打开」和模型用 `update` 修改时都保持原样。有风格之前保存的卡片文件名里没有风格，`update` 时按当前设置重新渲染。模型还在写卡片时显示的预览，在 DSH 页面加载时读取设置；在设置页里切换会同时更新当前页面，手改 YAML 后刷新已打开的页面即可。`editorial`、`paper`、`sketch`、`terminal` 会从 Google Fonts 加载字体；`paper` 只在卡片里有公式时才加载 KaTeX。

### 自定义风格

在 Markdown 文件里用自然语言写下你的偏好，例如「主色用墨绿，标题不超过 12 个字，数字保留一位小数」。插件会把它附加在内置风格说明之后：

- 全局：`~/.dsh/widget/style.md`（设置了 `DSH_HOME` 时是 `$DSH_HOME/widget/style.md`），所有会话生效。
- 工作区：`<工作区>/.dsh/visualize-style.md`，只在这个工作区的会话里生效。

这两个文件也可以在「设置 → 可视化」下方直接查看和编辑，每个工作区一个；内容清空后保存会删除文件。

两者冲突时，优先级是：你在对话里说的 > 工作区文件 > 全局文件 > 内置风格。每个文件只读取前 4 KB，文件不存在就跳过。改动在模型下一次加载 visualize skill 时生效（通常是新会话的第一张卡片）。自定义风格只影响模型怎么写卡片，不改变外壳注入的颜色和字体；要换颜色，在说明里写明，模型会在卡片根元素上覆盖对应的主题变量。

## 宿主桥 `window.dsh`

每张卡片的 frame 里，在片段脚本运行之前就注入了一个只属于本卡片的 `window.dsh`：

| 成员 | 作用 |
| --- | --- |
| `widgetState` | 这张卡片上次保存的 `{ modelContent, privateContent }`，没有时为 `null`；同步可读，渲染时先读它恢复界面 |
| `setWidgetState({ modelContent, privateContent })` | 整体替换状态。两者都只能是 JSON 或 `null`，序列化后合计 ≤ 16 KiB，不许多余键；宿主落盘后 resolve，连续调用按序排队 |
| `sendFollowUpMessage({ prompt, title? })` | 以用户名义往对话发一条消息（前缀 `[卡片追问] `）。必须在用户点击或按键后 1.5 秒内调用；宿主弹确认框，用户确认才发送，取消时以 `cancelled` 失败。`prompt` ≤ 64 KiB，`title` ≤ 250 字 |
| `openExternal({ href })` | 在新标签打开 http(s) 链接，同样要求用户手势。卡片里普通的 `<a href="https://…">` 点击会自动走这条路 |
| `theme` | `"light"` 或 `"dark"` |
| 事件 `dsh:set_globals` | 卡片加载完成、状态保存成功后在 `window` 上派发，`event.detail.globals = { widgetState, theme }`；主题切换时卡片会重新加载，同样会派发 |

失败时 Promise 以带 `code` 的错误 reject：`invalid-params`、`no-user-gesture`、`cancelled`、`unavailable`、`unknown-method`、`failed`。

**状态存在哪里**：`<DSH_HOME>/widget/state/<会话 id>/<卡片路径 sha1 前 16 位>.json`（默认 `~/.dsh/widget/state/`），内容 `{ path, title, state, updatedAt }`，写入走临时文件加改名。键是卡片片段的路径，所以模型用 `update` 改过的卡片沿用原来的状态。单个会话最多保存 100 张卡片的状态，超出时淘汰最久未更新的。读写走宿主已鉴权的 `/api/dsh-widget/state` 路由（与设置页的风格文件路由同一机制）。

**状态怎么回到模型**：安装宿主支持 revision 2 后，确认提交的意图与确认时冻结的公开快照作为同一条新用户消息原子持久化；直接发文字追问也会附上发送时的快照。状态包在 `<untrusted_widget_state>` 里，`<` 转义成 `\u003c`；空数组表示当前没有状态，显式提交的 `null` 会保留。系统提示 `dsh-widget.state` 只包含固定的数据解释规则，不读取动态状态、不改写旧消息、不依赖模型 `in-history` 能力。最多 100 条、快照原始 JSON 合计 ≤ 64 KiB，超限拒绝准入，不静默截断。`privateContent` 只恢复界面，不进模型。旧支持层或未安装支持层的宿主保留本地卡片显示/保存，但不提供状态自动回流与新版提交能力。

升级会一次性改变系统规则，新一轮缓存需要重新建立；之后的选择变化只追加新用户输入。缓存最终命中仍取决于供应商持久化、路由和缓存有效期，不能由前缀检查替代实际 usage 测量。

**与 ZCode Gen UI 的差别**

- ZCode 当前的 [Gen UI 输入规格](https://github.com/zai-org/ZCode/blob/main/docs/specs/gen-ui-model-context.md) 使用独立输入上下文快照。旧版插件每步读取最新状态，不能等同于绑定用户输入的快照：排队期间后续操作会改变它。新入口在支持输入捕获扩展的宿主中把快照与输入一起持久化；新版本要求 revision 2 输入捕获扩展，不再回退到动态系统提示。
- 状态按会话保存：fork 出来的会话不继承父会话的卡片状态，从空开始。
- 新窗口（「在新窗口打开」「打开页面」）和页面卡片的缩略图拿到的是打开那一刻的状态快照，只读；在新窗口里调用写入、追问、外链都会以 `unavailable` 失败。
- 暂不提供参数面板（Tweak）；消息协议里为它预留了方法名。

**安全**：沙箱与 CSP 与上游相同，没有放松。桥有四道关口：卡片只接受来自自己 iframe 的消息；消息与参数在卡片侧用 zod 校验（大小上限同上）；追问与外链要求 frame 内的手势，并且宿主页面此刻要有用户激活；追问必须经过宿主页面上的确认框（frame 里的代码点不到）。frame 里的检查只用来尽早给出明确错误，以卡片侧的校验为准。状态只存 JSON，进模型时明确标注为不可信。

## 安全

卡片运行在不透明来源的 sandboxed iframe 中，不能接触宿主页面。在新窗口打开（包括页面模式的「打开页面」）时，新标签页本身不含任何模型代码，fragment 依旧只在同样 sandbox 和 CSP 的 iframe 里运行，读不到 dsh 的 cookie、localStorage 或登录凭据。CSP 会阻止网络请求、嵌套页面和表单提交，只允许从固定 CDN 加载静态资源。单个 fragment 默认上限为 `1000000` 字节，可以通过 `maxFragmentBytes` 调整。

## 限制

- 只在 Web 界面渲染交互卡片，TUI 和 headless 客户端显示普通工具结果；headless 下没有状态路由，`setWidgetState` 以 `unavailable` 失败。
- 卡片状态与对话分开保存，删除会话不会自动删除 `~/.dsh/widget/state/` 下对应的目录。
- 旧 `sendFollowUpMessage` 追问在确认之后如果发送失败（例如会话已关闭或宿主拒收），只有 frame 里的 Promise 以 `failed` reject，宿主界面上没有任何提示；卡片要自己接住失败并告诉用户。
- 手机端未实测。

## 开发

```sh
npm ci
npm run check   # 类型检查 + vitest + tsdown 构建（lib/ 要随源码一起提交）
```

## 致谢

上游 dsh-visualize 的作者 Jesse Zhang。上游的灵感来自 Codex 桌面端的 `/visualize`，skill 的分层 reference 和 Chart.js 优先路线借鉴了 [himself65/finance-skills](https://github.com/himself65/finance-skills/tree/main/plugins/ui-tools/skills/generative-ui)。桥的数值与语义参照了 ZCode Gen UI 的公开契约，没有复制其代码或文档文字。

## 许可

本包新增与修改的部分以 MIT 发布（[LICENSE](LICENSE)）；沿用的上游代码继续受 BSD 3-Clause 约束（[LICENSE.dsh-visualize](LICENSE.dsh-visualize)）。

## 声明式交互入口（实验性）

`dshViz.interaction({ form, fields, action, render })` 支持原生表单的恢复、本地联动、保存及宿主侧确认提交。用户在聊天内选择参数后，宿主捕获公开字段并显示预览；确认后同一会话按该份不可变快照继续。`privateContent` 不进入预览或模型请求。完整页面需要在聊天中展开；独立窗口仍为只读。

**宿主依赖**：输入事务需要 `sessionController.registerWidgetInputCapture` 扩展。普通 dsh 0.2.1-rc.5 尚未提供该上游 API；发布包附带 [独立宿主支持安装器](host-support/README.md)，校验版本和文件指纹，在独立目录创建副本，提供 doctor、升级切换、回滚和禁用。启动器自动加载输入捕获与队列退出保留支持，不修改系统安装。仅验证了精确版本 0.2.1-rc.5，其他版本拒绝启动。未安装支持层的宿主不显示新提交按钮。
设计及冻结评测线见 [交互设计](docs/plans/2026-11-01-interaction-design.md)。评测结果与验证范围独立登记，不以单元测试代替真实模型评测。

旧轮实验与未过线结果见 [V1 实施记录](docs/plans/2026-11-01-interaction-implementation.md)；发布补齐范围、固定评测与故障验收见 [V2 规格](docs/plans/2026-11-01-interaction-release-v2.md)。请以最新验收结果判断质量门禁，不将“能安装”当成模型表现已经过线。

最新交互回流候选已达到固定样例门禁（10/12，显式4/4，负例4/4）；仍有两个失败及模型扩展回答质量边界，详见 [发布验收结果](docs/plans/2026-11-01-interaction-release-result.md)。仅支持已审阅的 dsh 0.2.1-rc.5 独立宿主支持层。
