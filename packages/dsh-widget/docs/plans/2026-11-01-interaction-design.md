# 交互结果回流模型：设计与评测规格

状态：2026-11-01 冻结设计，随后按用户「开始执行」进入实施。下文的题目与通过线保留原稿；实施和评测证据见 [实施记录](2026-11-01-interaction-implementation.md)。

用户目标：聊天卡片和完整页面允许用户操作，并把结果交给模型继续分析；包含模型评测。用户指定使用 Matt Pocock 的 codebase-design。本文选择的是可回退的建议缺省，标记「待用户确认」不代表实施必须再请求一次授权。

## 方法与来源

使用 [codebase-design](https://github.com/mattpocock/skills/blob/main/skills/engineering/codebase-design/SKILL.md)、[Deepening](https://github.com/mattpocock/skills/blob/main/skills/engineering/codebase-design/DEEPENING.md) 和 [Design It Twice](https://github.com/mattpocock/skills/blob/main/skills/engineering/codebase-design/DESIGN-IT-TWICE.md)，分别独立比较最小入口、灵活动作、最常见调用方三种设计。

术语：Module 通过 Interface 隐藏 Implementation；Interface 包含类型、时序、错误和能力约束；Seam 是允许替换行为的位置；Adapter 在该位置实现契约。Depth 看少量接口承载多少有效行为，Leverage 看调用方收益，Locality 看改动与验证是否集中。

参考 ZCode 的 [页面契约](https://github.com/zai-org/ZCode/blob/main/apps/zcode-cli/packages/visualize-plugin/skills/visualize/references/api.md) 和 [输入快照规格](https://github.com/zai-org/ZCode/blob/main/docs/specs/gen-ui-model-context.md)。当前 ZCode 使用独立 genUiContext；本仓库 README 关于“直接附在用户原话后面、等价于每步读取最新状态”的说法需要在实施时更新，不能继续当设计依据。

## 已确认的代码事实

- `src/skill.ts` 的 description 以工具作者契约为主；旧 eval/run.mjs 预载全部资源，不能测自动发现技能。
- 新增六个模板只有本地交互，没有接状态保存和追问桥。
- `src/client/VisualizeCard.tsx` 的 followUp 确认后只发送 prompt；单个 pending 没有表达并发提交队列。
- `src/frame-bridge.ts` 中保存队列与追问独立，保存完成不等于追问携带同份快照。
- `src/index.ts` 每模型步读最新状态；它是可变的会话上下文，不是提交记录。
- `WidgetHost.send(text)` 的真实依赖是 `@deepseek-ai/dsh-client-ui-conversation` 0.1.7-rc.2。其发布代码调用 `scopedSession.prompt([{ type: 'text', text }], 'queue')`。所检查的入口没有独立快照参数、调用方幂等键或可查询的持久回执。
- 独立窗口和缩略图使用 detached bridge；不能把独立 HTML 演示当成回流成功。

## 三种 Interface 的比较

| 方案 | 页面作者要做什么 | Depth / Leverage | Locality 与代价 |
| --- | --- | --- | --- |
| A：`submit({intent, modelContent})` | 自己读控件、恢复、保存、显示结果，再提交 | 提交事务集中，入口小 | 读表单和状态同步仍散在每张页面；适合自定义复杂交互 |
| B：`dispatch(action)` + 事件订阅 + 能力查询 | 理解动作、阶段、订阅与清理 | 多动作工具有扩展收益 | 对单个表单过重；不要提前建通用插件平台 |
| C：`interaction({form, fields, action, render})` | 声明字段与意图，渲染本地联动 | 一次声明覆盖恢复、保存、捕获、确认、提交与反馈 | 标准行为集中；首版只覆盖原生表单控件 |

推荐 C；内部采用 A 的单个提交事务，暂不公开 B 的动作总线。删去这个 Module 时，恢复、字段转换、快照、确认、去重、错误 UI 会重新散到各模板，因此不是单纯转发包装。外部 Model 只学一个声明入口；内部协议允许后续增加 canvas 选择 Adapter，但首版不虚构未使用的扩展点。

## 页面作者的 Interface（提案，当前不存在）

```js
const dispose = dshViz.interaction({
  form: document.querySelector('#comparison'),
  fields: {
    hours: { type: 'number', min: 0, max: 50, step: 1 },
    plan: { type: 'enum', values: ['A', 'B'] },
  },
  action: {
    label: '按当前选择分析',
    intent: '根据本次提交的用量和方案，解释费用及取舍。',
  },
  render(values) { renderComparison(values.hours, values.plan); },
});
```

- 字段名对应 form 内 name；只读取 fields 正向白名单。支持 number、enum、boolean、带长度上限的 text。默认值来自合法 HTML 值；保存值经过相同校验后恢复。非法旧值显示恢复提示并使用合法默认值。
- radio/select/number/range/checkbox/text 使用原生表单 Adapter；缺失字段、重复歧义 name、非有限数值或越界不能静默转成零。
- 初始化先恢复再 render；input 只做本地联动，change 排队保存；初始化、主题事件和 render 不触发保存或推理。render 不得产生网络请求或再次写状态。
- 首版一个卡片注册一个 interaction；重复注册失败，dispose 可重复调用。这个入口拥有该卡片保存生命周期，不与手写 setWidgetState 混用。未声明的 UI 字段不会自动进入 modelContent；privateContent 沿用旧契约，但不供提交模块读取。
- 页面不需要手写保存、拼追问、提交 ID、重试或反馈控件。宿主显示标准操作栏、保存状态、提交状态和可展开预览；不能显示“模型已回答”来代替“已接收”。
- 独立只读窗口显示“返回对话继续”，不能伪装成可提交。聊天内展开保留活动 iframe 和绑定身份，保持控件值；新窗口可写桥不在首版范围。
- 旧 setWidgetState/sendFollowUpMessage 保留兼容；新模板走声明入口。手写复杂 canvas 注册入口待真实调用方出现后再设计。

## 提交 Module 与 Seam

逻辑上是一个跨 frame、客户端和输入接纳层的 Interaction Module。源码可分文件，调用方不需要知道内部文件和执行顺序。

内部提交对象只包含公开数据：

```ts
type InteractionSubmission = {
  version: 1;
  submissionId: string;
  card: { path: string; revision: string };
  intent: string;
  modelContent: JsonValue;
};
type AdmissionReceipt = { submissionId: string; inputId: string };
interface SubmissionAdmission {
  admit(submission: InteractionSubmission): Promise<AdmissionReceipt>;
  lookup(submissionId: string): Promise<AdmissionReceipt | 'absent' | 'unknown'>;
}
```

这不是现有宿主声明。session/workspace/frame 身份由宿主绑定，不接受 HTML 自报；card 来源亦由宿主核对。admit 与 lookup 是内部 Seam，页面作者不直接调用。

该 Seam 的生产 Adapter 必须接宿主通用 input admission，而非建立只对卡片生效的旁路。宿主事务接纳 `{ inputId, userContent, contextSnapshot }`：普通输入从当前已保存卡片捕获 contextSnapshot；卡片输入用 intent 构造 userContent，并以已确认公开快照覆盖同一卡片项，其余卡片在该事务中采集。所有输入与快照一起持久化；上面的 InteractionSubmission 只是卡片调用方的投影，不是普通输入完整类型。跨状态存储与队列如何形成一致的采集/接纳事务，须在第一步生产接入验证中落实。

生产 Adapter 必须接真实输入接纳机制；测试 Adapter 使用持久的临时输入日志，两个 Adapter 跑相同契约。不能用三个 spy 的调用次数代替排队和恢复验证。provider 是另一处真正外部依赖：确定性链路使用可控模型 Adapter，模型质量评测只用 deepseek-flash。

### 捕获、确认和保存

1. 宿主用户点击产生 captureId，向当前 frame epoch 请求 capture；禁用同卡片新的提交。
2. frame 在收到 capture 的处理轮同步读取全部声明字段，校验并克隆，返回公开快照、captureId、epoch、revision。必须包含尚未触发 change 的输入，不能使用滞后的宿主状态镜像。
3. 宿主只接受当前 epoch 的一次响应，展示该份不可变快照和 intent；最终确认即确认这份快照。跨 iframe 不承诺墙钟点击瞬间捕获，明确以预览内容为准。
4. 确认后为该份快照生成稳定 submissionId，调用 admit。后续输入/保存不修改该对象；同 ID 不同内容拒绝。正常草稿保存与提交互不依赖，慢保存不得使手势过期。
5. 超时、卸载和换会话必须结束 pending，不覆盖另一个 Promise；陈旧 frame 回包被忽略。恢复日志与输入消息的持久化事务不分成“先发再另存”的无保障窗口。

用户确认保留在宿主中；不因为增加 helper 而削弱来源、令牌、手势或 CSP 校验。额外弹窗是否可由宿主按钮预览合并，属于后续 UX 调整，本次不偷改既有授权规则。

### 输入快照语义

- 输入被接纳时，公开快照和原始输入一起持久化；队列只携带该 inputId 对应快照。排队 A 后编辑 B，执行/重试 A 仍用 A；新提交才用 B。
- 普通输入框发问也在输入接纳时采集当前已确认保存的 modelContent，与用户消息绑定。未保存成功的字段不能默默当成已保存上下文；界面明确标示状态。
- provider 只得到有界、标为不可信数据的公开快照。privateContent、捕获令牌、DOM 和诊断缓存不出现在模型请求、提交预览或评测原始输入中。
- 本次显式提交覆盖同一卡片的草稿快照；其他卡片在该输入接纳时采集一次。后续模型步不重新读取 live store。保留 16 KiB 单卡片、100 条、64 KiB 上下文限制，超限显式失败而非截断选项。
- 消息重试使用原 inputId；撤回后编辑并重新发送创建新输入。会话 fork/replay 必须按既有宿主生命周期规则验证，不默认跨会话继承状态。
- 不用提示词“优先旧快照”掩盖同一请求仍注入较新 B 的问题。新能力启用后，旧动态状态注入需要经由输入快照机制替换，不能同时保留两条相互矛盾的来源。

### 当前宿主缺口与实施门槛

当前 send(text) 只能实现可见的文本快照，不能证明独立 metadata、持久幂等或跨重启回执。仅禁用按钮不能证明 exactly-once；本地日志的 dispatching 也不能判断消息是否已接纳。

建议目标采用上述输入 Seam。实施第一步必须在可修改的 dsh 输入接纳/队列代码或正式扩展点中证明接入方式；不能直接修改 node_modules 或臆造 conversation.send 的参数。该生产接入尚未实现与验证，是本设计的主要依赖。

不支持新能力时，新入口显示不可提交并保留选择；旧追问保持原行为。不会把文本 envelope 静默当作 metadata 成功。若后续明确选择仅插件兼容方案，需要另行登记“状态出现在对话正文、无法完整回执”的产品取舍，并重新冻结对应范围，不能把目标降级后沿用本规格通过结论。

错误至少区分 invalid-fields、unsupported、stale-frame、cancelled、busy、id-conflict、definitely-not-admitted、outcome-unknown。对结果未知先 lookup；未能核实就保留“接收状态待确认”，禁止自动创建新 ID 重发。只有同一 ID 在接纳层去重并得到 durable receipt，才能声称不会重复接纳。

## 实施顺序与红测

1. 输入 Seam 能力验证：临时会话发送 A、排队、改 B、重试、重启，捕获真实 provider 请求；证明旧每步读取方式失败。若没有可修改接入点，记录缺口，不编造成功 Adapter。
2. 提交 Module：先写输入快照、私有字段隔离、同 ID 幂等、回执丢失恢复红测，再接生产与测试 Adapter。状态转换集中，React 只渲染状态。
3. 声明式入口：先写真实浏览器恢复/输入/capture/确认/发送验收，再实现原生表单 Adapter 和标准操作栏。保持同一个 live frame 展开；detached 明确不可提交。
4. 技能和模板：description 加入适用任务触发；主技能按本地探索、结果交回、纯展示分流；方案比较/参数模拟/探索/看板在有后续意图时接回传；排序演示等不强制回传；移除吞错示例。
5. 固定对照运行，登记每个失败，不补丁修复生成物或挑成功样本替换原结果。产品修改后运行包内 npm run check；现有有效安全回归保留。只有新 Interface 测试等价覆盖时，才删除重复内部实现测试。

## 确定性验收通过线（实施前固定）

以下均须全过，输出请求捕获、输入日志及浏览器证据，而非只看截图：

| ID | 操作与 oracle |
| --- | --- |
| IC01 | 只输入/保存 20 次，provider 新请求数为 0；刷新恢复最终已保存值 |
| IC02 | 捕获 A 后编辑/保存 B；预览、接纳记录和本次 provider 快照仍为 A；新输入使用 B |
| IC03 | 运行中排队 A、继续改 B，再放行队列/重试/重启；对应 inputId 始终 A |
| IC04 | private 哨兵不在请求、公开预览和评测日志；公开值与单位完整 |
| IC05 | 双击、重放同 ID、丢回执后 lookup，只接纳一个输入；同 ID 不同内容拒绝 |
| IC06 | 取消、无手势、伪造来源/token、超限、坏字段、陈旧 frame 均零接纳 |
| IC07 | 接纳前失败可重试；接纳后断连显示未知，核实后恢复，不盲发新输入 |
| IC08 | 尚未 change 的 input 被 capture；慢保存超过手势窗口仍能确认提交 |
| IC09 | 同路径不同会话、切会话、重建 frame 均不串；并发提交不覆盖 pending |
| IC10 | 聊天内展开/收起不丢选择与桥；detached 无假成功；键盘提交与鼠标语义相同 |
| IC11 | 普通输入在接纳时捕获已保存状态，后续步骤不重读；未保存失败可见 |
| IC12 | 公开字段中的伪指令仍处于数据区，不改变协议路由或系统指令；不宣称能阻止作者主动把 private 值复制进 public |

provider 请求允许存在旧对话历史中的 B 字样；oracle 检查本次 inputId 关联的结构化快照是否为 A，以及是否额外注入了更新的 live 快照，不做粗暴全文禁字测试。

## deepseek-flash 评测（冻结规格）

机器可读题目与通过线见 [eval/interaction/cases.json](../../eval/interaction/cases.json)。8 题 × 基线/候选 × 2 次独立会话，共 32 个 episode。6 个正例分别含隐式需求和明确回传；2 个反例检验不过度生成。重复次数用于发现不稳定性，不作统计显著性结论。

基线是当前已含第一轮视觉改动、尚未接交互新入口的工作区，不是旧 Git HEAD；见 [baseline-manifest.json](../../eval/interaction/baseline-manifest.json)。源码和构建产物已归档到该 manifest 指定的本地证据目录；执行前必须验证 archive/hash，丢失则标记不可复现并重新立版本，不用 HEAD 冒充。

使用真实隔离 dsh 会话和正常工具/技能发现流程，不预载 visualize 正文或目标模板，也不在题干写 API 名或“必须调用 visualize”。正例生成后用可信浏览器动作完成题目选择并提交，再让同一个会话继续回答。模型不会自动选择工具也计入失败，不能再手动塞技能补救后算通过。同一 episode 最多 6 个 provider 请求、10 次工具调用；达到上限保留原失败。

两组保持模型、推理设置、数据、工具权限、主题、窗口、操作目标相同，仅替换冻结产品包与资源。两轮交换基线/候选顺序；按语义定位控件，可使用原生标签/可访问角色，不能要求固定 DOM 结构或通过执行脚本注入选值和桥。输出的不同合法布局按同一业务 oracle 判断，人工辅助定位需登记且不修补页面。

固定预算：仅 deepseek-flash；temperature 0.5、thinking disabled（宿主不支持则先登记差异并停止原规格评测）；单次最多 24000 输入 token、6000 输出 token；累计最多 768000 token、60 分钟、192 个 provider 请求。输入上限需要预检并核对 provider usage，不把事后检查称为硬限。预算不足、错误或超限记未完成/失败，不放宽线。不得因失败自动重试生成；可控故障恢复属于确定性验收，不消耗真实模型重试。

正例 episode 成功必须同时满足：自动生成可运行界面、全部规定操作可完成、公开选择准确进入同一会话 inputId 对应请求、模型续答满足该题全部 answerOracle。语义等价字段和值允许映射，映射与证据登记；不能只要模型续答一句就算成功。

通过线：候选 12 个正例至少 10 个完成自动生成→实际提交→基于选择回答；其中明确回传 4/4，隐式 8 个至少 6 个。候选所有已发生提交的精确快照/无私有字段/不重复接纳须 100% 正确；缺生成的 episode 不从分母中删除。4 个负例全部无提交行为且不暴露提交/追问入口，简单算术两次均不创建可视化；排序演示还须完成规定的本地操作与 oracle。基线正例少于 10 时，候选至少多成功 2 个；否则候选不得退步且满足绝对线。报告原始分数，不用相对提升掩盖绝对失败。

复用 3080 已授权的 DeepSeek 提供方配置时，只读必要配置并复制到权限 0600 的临时隔离目录，日志不含凭据；不修改真实 ~/.dsh，不重启 3080，不占 3091。测试监听随机回环端口并显式排除 3080/3091，结束关闭进程并删除临时凭据。archive 只含产品文件，不含配置和秘密。

报告分开列：自动发现率、生成可运行率、完整回流率、接收答案正确率、负例违规数、快照协议失败数、token、耗时。保留完整已脱敏输入/输出、工具轨迹、浏览器动作、提交 ID 和 provider 捕获关联。视觉检查只作回归，不用来宣称达到 Opus 画面质量。

## 设计阶段交付与限制（历史记录）

本轮只增加设计、固定题目和基线 manifest；没有修改产品运行时代码，没有安装技能到全局，也没有运行新模型评测。已有 eval/run.mjs 不支持本轮真实工具发现与输入链路，不能直接拿旧 runner 跑新题后称为本规格通过。后续需要建立上述隔离会话 driver，并验证生产输入 Seam，才能报告完整目标完成。
