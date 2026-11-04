# dsh-peer
中文 | [English](README.md)

dsh 会话之间的协作通道。**0.4.0** 起为混合模式：本机会话之间始终走同机直连（注册表 + Unix socket），配置中心后，远端会话额外经 Peer Hub 中心通信，两条通道同时可用。中心服务在独立仓库 peer-hub（远端部署、配对码、控制台、HTTP MCP，以及 Claude Code / Codex / Grok Bot 接入），本包通过可选依赖 `@lbryany/peer-hub-client` 连接。要求 **DSH 0.2.1-rc.5 及以上、低于 0.3**。子 agent 使用所属根会话身份。

## 安装

在 profile 依赖中加入 `@lbryany/dsh-peer@0.4.0`，在 `dsh.profile.bundles` 加入 `@lbryany/dsh-peer`，安装依赖后重启该 profile。未发布版本可用 `npm pack` 的本地包路径安装。本地开发可运行 `DSH_BIN=/path/to/dsh/lib/bin.js node scripts/link-dsh.mjs`。安装与重启由用户明确操作。

## 混合模式：本地走同机，远程走中心

启动、配对与配置见[中心使用指南](docs/hub.zh.md)。没有设置 `config.hub.credentialFile` 时只有同机通道，行为与 0.3 相同；设置后同机通道照常工作，另加中心通道（0.3 的「只配中心」写法不用改，现在等价于混合模式）。

| 规则 | 行为 |
|---|---|
| 路由 | 目标是本机正在运行的会话（在本机注册表里）时走 socket；否则走中心。本机会话之间的消息绝不经过中心。 |
| 本机识别 | 中心上与本进程同一设备凭据（同一 deviceId）的会话就是本机会话：`peer_list` 里只出现一次，标为 `local`，发送走 socket。同机识别要求这些进程用同一个注册表目录（默认按用户共享）。 |
| 登记 | 本机会话照常登记到中心，远端能找到并发给它。同一 profile 开多个 dsh 进程可以共用一份凭据，同时在线（需要 peer-hub 0.4.0 中心）。 |
| 重名 | 裸名字优先指本机会话；远端用 `name@device`（中心上的会话名 + 设备名）区分。`peer_list` 在重名时直接显示 `name@device`。 |
| 名字不一致 | 中心上的名字全工作区唯一，本地名字只在本机唯一，同一会话可能本地叫 `a`、中心叫 `a-2`（远端已有 `a`）。本机仍用 `a` 找它，远端用 `a-2` 找它；`peer_list details` 的本地行带 `hubName`，`peer_rename` 会提示中心上的名字。 |
| 列表 | 合并两边结果，每项标注 `[local]` 或 `[hub, 设备名]`。中心不可达时只列本机会话，并注明「中心离线」。 |
| 中心离线 | 同机收发完全不受影响；发往远端返回 `hub-offline`，不自动重发；中心恢复后远端自动恢复。 |
| 收件 | 两条通道的来信进同一个收件箱；消息 `source.channel` 为 `local` 或 `hub`。来自远端的消息里，回复地址按本机视角给出（重名时为 `name@device`）。 |
| 回复 | `peer_reply` 沿任务来时的通道返回（answer / result / declined 都一样）。 |

中心持久保存身份、消息、回执和方向保护。任务链预算两边一致：每根任务最多 24 条消息、委派深度 4、期限 10 分钟，拒绝（declined）总能送达；完成后新建根请求使用独立预算，仍受方向保护限制。这不是整个用户任务的全局 token 或轮数预算。远端方向的暂停由中心管理员恢复，`/peer-resume` 只恢复本机方向。

已知限制：跨通道续接时预算接不上。例如本会话正在处理远端经中心发来的任务，再委派给本机另一会话（或反过来），新任务在另一条通道上作为独立根任务，不继承原任务的预算与期限；`peer_request` 结果里会标出 `crossChannel`。

## 消息与控制

| 入口 | 行为 |
|---|---|
| `peer_list({all?,details?})` | 默认显示地址和状态，最多 20 个其他会话；混合模式下每项带 `[local]` 或 `[hub, 设备名]`。`details:true` 查看目录等完整信息。 |
| `peer_request({to,text,wait?,parentRequestId?})` / `peer_request({requests:[{to,text}],wait?})` | 单目标使用 `to/text`，多目标一次批量最多 8 个；两种写法互斥，同一批可以混合本机与远端目标。默认交接并结束当前轮。还有本地工作时传 `wait:false`。续接入站任务可传 `parentRequestId`。 |
| `peer_reply({requestId,kind,text,questionId?,wait?})` | 沿任务 ID 澄清（question）、回答（answer）或交付结果（result）；回答必须携带问题 ID。执行方不能或不该做时用 `declined`（text 写原因）结束任务；收到的任务都要以一次 `result` 或 `declined` 结束。默认交接并结束当前轮。 |
| `peer_wait({requestIds?})` | 等待已有远端任务，不发催问。空数组不等待；已排队消息交由宿主消费。 |
| `peer_send({to,text,steer?})` | 使用名字、`name@device` 或唯一的会话前缀（至少四位）。默认排入下一轮；仅用户要求立刻插话时使用 `steer:true`（远端不支持插话）。 |
| `peer_rename({name})` | 名字匹配 `^[a-z0-9][a-z0-9_-]{0,39}$`；撞名自动加后缀。 |
| `/peers` | 显示列表和本会话已暂停的接收方向。 |
| `/peer-name <名字>` | 改名；省略参数则显示当前名字。 |
| `/peer-resume <名字或会话 ID>` | 仅用户可恢复一个接收方向并清空窗口，不重放消息、不启动模型。 |

只登记已有用户消息的根会话，空草稿和子会话不登记。默认名字为 `<目录>-<会话前缀>`；`DSH_PEER_NAME` 或插件 `name` 指定第一个登记会话的名字。改名按会话 ID 持久保存。卡片里的 `@` 是展示格式，工具寻址仍填写不带 `@` 的名字。

收件卡片标题为 **来自 @reviewer · 原文第一行**。点击或用键盘展开后续正文，正文不重复第一行。单行消息没有空的正文展开入口。详情提供复制、原始记录和接收侧恢复入口，不常驻显示暂停提示。旧展示元数据缺失或无效时保留完整文本；关闭浏览器插件后完整宿主消息仍可读。

模型仍收到完整来源说明与正文。提示规则要求仅发送新增任务、问题、实质进展或结果；纯确认、感谢、告别不回复，结果只发一次。接纳不等于任务完成。

## 请求与结果（同机通道）

任务协作优先使用 `peer_request` 和 `peer_reply`；`peer_send` 保留旧版兼容且不会结束当前轮。交接仅在全部投递成功时结束当前轮，部分失败或回执未知会返回逐项状态；已接纳项继续执行，不自动重发。宿主保留同一响应里的其他工具及后来到达的用户消息。

每个发送方向只能有一个未完成请求。结果或拒绝排队后仍占位，直到接收会话消费它才允许下一轮请求，避免多目标协作中提前催问。每个请求最多三轮澄清；结果仅投递一次，成功结果的相同重试只返回历史回执。

与中心语义一致（0.4.0）：

- **拒绝**：执行方用 `declined`（text 写原因）结束任务，等待回答时也可以。它与 `result` 一样是终态：取消执行方的任务（之后再回 result 返回 `invalid-reply-state`），请求方读到后释放该方向，可以发起下一轮。拒绝不受任务链预算限制。
- **过期通知**：任务 10 分钟未完成即关闭，请求方会收到一条 `[peer 过期通知]`（来自执行方、`source.system: true`），说明最后状态；过期后再回复返回 `request-expired`。
- **任务链预算**：会话正在处理入站任务时发起的请求自动挂到该任务下（与中心相同的推导；同时处理多个时用 `parentRequestId` 指明，否则返回 `ambiguous-parent`）。整条链最多 24 条消息（`root-budget`）、委派深度 4（`root-depth`）、共用根任务期限。链的编号、深度、已用条数和剩余时间随每个包传递，跨进程也一致。

两端都须支持 `request-result-v1`；旧端返回不支持，不静默降级。0.3 的接收端不认识 `declined`，会拒收（`invalid-reply-state`）；应逐个升级接收进程。每 Host 最多 512 条易失记录，从接纳开始保留 10 分钟（过期的再留 10 分钟墓碑，用于返回 `request-expired`）；重启使在途请求失效。原方向保护继续生效。宿主设 `requests: false` 可停用结构化协议。

宿主提供 SystemPrompt 服务时，插件注册普通协作规则，强调原用户范围、增量内容和真实结果，不替换 persona；`promptPolicy: false` 可关闭。完整 persona 可能屏蔽普通 section，因此确定性保护和工具提示始终保留。

## 同机模式的接收保护

保护位于共同的接收入口，覆盖同进程和 socket 投递，也覆盖旧发送端。

| 规则 | 默认值 |
|---|---|
| 相同来源/目标会话、精确正文及投递模式 | 首次接纳后 60 秒内抑制重复 |
| 短滑动窗口 | 每 60 秒最多接纳 6 条 |
| 长滑动窗口 | 10 分钟内接纳 12 条；下一次尝试暂停该方向 |
| 恢复 | 用户明确操作；经过时间不会自动解除 |
| 内存 | 最多 1024 个方向、每方向 64 个指纹；有效暂停不淘汰 |

只计成功接纳，失败回滚预留。改名、前缀寻址、子 agent 或切换投递模式不能重置方向预算；反方向和其他会话独立。旧版消息 ID 在最近 200 条回执内幂等，按来源和目标隔离。结构化指纹还区分请求、问题及消息类型，方向计数仍共享。

宿主配置示例：

```yaml
- id: dsh-peer
  config:
    protection:
      dedupMs: 60000
      shortMs: 60000
      shortLimit: 6
      longMs: 600000
      longLimit: 12
```

参数必须为正整数；短窗口及数量不得超过长窗口及数量；longLimit 最多 64。`maxPairs` 可从 1024 调低，`maxFingerprints` 可从 64 调低。宿主可设 `protection: off` 关闭保护，模型工具不能修改。headless 没有命令界面，可通过受控重启或宿主配置恢复；重启会清空内存保护状态。

## 同机模式的结果与边界

| 结果 | 含义 |
|---|---|
| `queued` / `steered` | 已接纳，不代表已处理 |
| `duplicate` | 此 ID 已接纳过，没有再次投递 |
| `duplicate-content` | 已抑制，不要确认或重发 |
| `rate-limited` | 未投递；停止自动发送，不定时重试 |
| `conversation-paused` | 未投递；需要用户在接收侧恢复 |
| `guard-capacity` | 未投递；有界保护状态已满 |
| `delivery-failed` | 同步接纳失败，已回滚预留 |
| `timeout` / 无法解析回包 / 写入后断线 | 投递状态未知，不自动重发 |

地址、token、目标会话和连接错误保留解释文本。保护错误不附 peer 列表；`retryAfterMs` 只解释窗口，不是重试指令。wire 仍为 `v:1`；新发送端不能约束旧接收端，应逐个升级接收进程。窗口之外持续发送新内容的慢速互聊不保证被截断；跨嵌套任务的全局预算与空闲订阅属于后续演进。

同机通道信任同一系统用户的合作会话，声明的发送身份不是对恶意进程的认证。同机通道不提供冷投递、积压队列统计或已读回执；跨机器、离线投递与回执由中心通道提供。Windows named pipe 有实现，尚未实测。卡片的只读状态接口由 DSH Connection 限定为 owner 访问，并校验接收会话已登记且存活；共享会话的非 owner 不能查询。恢复使用宿主带会话授权的命令接口。

## 同机存储与开发

注册表优先级：插件 `dir`、`DSH_PEER_DIR`、`XDG_RUNTIME_DIR/dsh-peer`、`~/.dsh-peer/run`。每进程持有 JSON、私有 key 和 socket，退出删除。改名默认存放于 `~/.dsh-peer/names.json`；测试或配置可用 `namesFile` 隔离。保护日志不写正文。协议单条请求最多 64 KiB，socket 超时为五秒。

```sh
npm install --legacy-peer-deps
DSH_BIN=/path/to/dsh/lib/bin.js node scripts/link-dsh.mjs
npm run check
npm run scenarios
node scripts/request-scenarios.mjs
node scripts/handoff-check.mjs
npm run test:browser
node scripts/hub-check.mjs     # 两个真实 Host，各自一台「机器」，全部经中心
node scripts/mixed-check.mjs   # 混合模式：同一 DSH_HOME 的两个 Host + 另一台机器的 Host
npm pack --dry-run --json
node eval/run.mjs --dry
```

浏览器检查使用临时 profile、打包产物、假消息投递与隔离 Chrome。模型评测使用冻结的 `PEER_BASELINE`。凭据可显式通过 `DSH_PEER_EVAL_API_KEY` 提供，也可在用户授权后只读复制现有 profile 到临时 DSH_HOME，再运行 `node eval/from-profile.mjs <副本目录>`；不需要独立账号。该入口只读取显式指定的副本，拒绝直接使用真实 `~/.dsh`。评测固定 deepseek-flash、温度 0、关闭 thinking；使用服务端输入计数预留预算，实际输入（含缓存）与输出均计入总量。模型评测与确定性测试分别记账。
