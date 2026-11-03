# dsh-peer
中文 | [English](README.md)

支持同机直连与中心通信两种模式。**0.2.0** 新增本地 SQLite 中心：设备注册、持久化收件箱、请求/结果、断线恢复和管理界面。要求 **DSH 0.2.1-rc.5 及以上、低于 0.3**。子 agent 使用所属根会话身份。

## 安装

在 profile 依赖中加入 `@lbryany/dsh-peer@0.2.0`，在 `dsh.profile.bundles` 加入 `@lbryany/dsh-peer`，安装依赖后重启该 profile。未发布版本可用 `npm pack` 的本地包路径安装。本地开发可运行 `DSH_BIN=/path/to/dsh/lib/bin.js node scripts/link-dsh.mjs`。安装与重启由用户明确操作。

## 本地中心

启动、配对与配置见[中心使用指南](docs/hub.zh.md)。设置 `config.hub.credentialFile` 后，本 profile 的发现与消息全部经过中心；未设置时继续使用下文的同机模式。本版仅监听本地回环地址，端到端验收范围是 dsh-dsh；Claude 适配器只有契约测试，尚未验证真实 Claude 会话。

中心持久保存身份、消息、回执和方向保护。嵌套任务预算为每根任务最多 24 条消息、深度 4、期限 10 分钟；完成后新建根请求使用独立预算，仍受方向保护限制。这不是整个用户任务的全局 token 或轮数预算。中心暂停由管理员恢复，`/peer-resume` 不跨越此权限。

## 消息与控制

| 入口 | 行为 |
|---|---|
| `peer_list({all?,details?})` | 默认显示名字和状态，最多 20 个其他会话；`details:true` 查看目录等完整信息。 |
| `peer_request({to,text,wait?})` / `peer_request({requests:[{to,text}],wait?})` | 单目标使用 `to/text`，多目标一次批量最多 8 个；两种写法互斥。默认交接并结束当前轮。还有本地工作时传 `wait:false`。 |
| `peer_reply({requestId,kind,text,questionId?,wait?})` | 沿任务 ID 澄清（question）、回答（answer）或交付结果（result）；回答必须携带问题 ID。默认交接并结束当前轮。 |
| `peer_wait({requestIds?})` | 等待已有远端任务，不发催问。空数组不等待；已排队消息交由宿主消费。 |
| `peer_send({to,text,steer?})` | 使用名字或唯一的会话前缀（至少四位）。默认排入下一轮；仅用户要求立刻插话时使用 `steer:true`。 |
| `peer_rename({name})` | 名字匹配 `^[a-z0-9][a-z0-9_-]{0,39}$`；撞名自动加后缀。 |
| `/peers` | 显示列表和本会话已暂停的接收方向。 |
| `/peer-name <名字>` | 改名；省略参数则显示当前名字。 |
| `/peer-resume <名字或会话 ID>` | 仅用户可恢复一个接收方向并清空窗口，不重放消息、不启动模型。 |

只登记已有用户消息的根会话，空草稿和子会话不登记。默认名字为 `<目录>-<会话前缀>`；`DSH_PEER_NAME` 或插件 `name` 指定第一个登记会话的名字。改名按会话 ID 持久保存。卡片里的 `@` 是展示格式，工具寻址仍填写不带 `@` 的名字。

收件卡片标题为 **来自 @reviewer · 原文第一行**。点击或用键盘展开后续正文，正文不重复第一行。单行消息没有空的正文展开入口。详情提供复制、原始记录和接收侧恢复入口，不常驻显示暂停提示。旧展示元数据缺失或无效时保留完整文本；关闭浏览器插件后完整宿主消息仍可读。

模型仍收到完整来源说明与正文。提示规则要求仅发送新增任务、问题、实质进展或结果；纯确认、感谢、告别不回复，结果只发一次。接纳不等于任务完成。

## 同机模式的请求与结果

任务协作优先使用 `peer_request` 和 `peer_reply`；`peer_send` 保留旧版兼容且不会结束当前轮。交接仅在全部投递成功时结束当前轮，部分失败或回执未知会返回逐项状态；已接纳项继续执行，不自动重发。宿主保留同一响应里的其他工具及后来到达的用户消息。

每个发送方向只能有一个未完成请求。结果排队后仍占位，直到接收会话消费结果才允许下一轮请求，避免多目标协作中提前催问。每个请求最多三轮澄清；结果仅投递一次，成功结果的相同重试只返回历史回执。

两端都须支持 `request-result-v1`；旧端返回不支持，不静默降级。每 Host 最多 512 条易失记录，从接纳开始保留 10 分钟；重启使在途请求失效。没有跨任意嵌套任务的全局预算保证，原方向保护继续生效。宿主设 `requests: false` 可停用结构化协议。

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

通道信任同一系统用户的合作会话，声明的发送身份不是对恶意进程的认证。不提供冷投递、跨机器传输、积压队列统计或已读回执。Windows named pipe 有实现，尚未实测。卡片的只读状态接口由 DSH Connection 限定为 owner 访问，并校验接收会话已登记且存活；共享会话的非 owner 不能查询。恢复使用宿主带会话授权的命令接口。

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
node scripts/hub-check.mjs
node scripts/hub-browser-check.mjs
npm pack --dry-run --json
node eval/run.mjs --dry
```

浏览器检查使用临时 profile、打包产物、假消息投递与隔离 Chrome。模型评测使用冻结的 `PEER_BASELINE`。凭据可显式通过 `DSH_PEER_EVAL_API_KEY` 提供，也可在用户授权后只读复制现有 profile 到临时 DSH_HOME，再运行 `node eval/from-profile.mjs <副本目录>`；不需要独立账号。该入口只读取显式指定的副本，拒绝直接使用真实 `~/.dsh`。评测固定 deepseek-flash、温度 0、关闭 thinking；使用服务端输入计数预留预算，实际输入（含缓存）与输出均计入总量。模型评测与确定性测试分别记账。
