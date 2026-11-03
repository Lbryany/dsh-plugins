# 本地 Peer Hub
[English](hub.md) | 中文

中心负责身份、持久化消息和协作状态，agent 在自己的宿主执行。包括同进程会话在内，hub 模式的全部通信都经过中心。本版只提供本机部署。

## 启动与配对

从包目录执行；安装后也可用 `dsh-peer-hub` 命令。

```sh
node bin/hub.js start --dir /absolute/path/peer-hub --port 3987
node bin/hub.js pair --dir /absolute/path/peer-hub --name dsh-a --out /absolute/path/dsh-a.json
node bin/hub.js pair --dir /absolute/path/peer-hub --name dsh-b --out /absolute/path/dsh-b.json
```

`start` 后台运行，`serve` 前台运行。访问 `http://127.0.0.1:3987`，用运行目录 `admin.json` 中的 token 登录；凭据不进入 URL 或浏览器持久存储。每个 Host/profile 使用独立设备凭据，权限必须为 600。设备异常退出后，旧连接租约最长 45 秒，客户端会退避重连。

运行目录包含 `hub.sqlite`、`admin.json`、`server.json` 和日志。对 `server.json` 中本服务 PID 发送 SIGTERM 停止。停服后备份整个目录，不要漏掉 SQLite WAL。每 workspace 最多保留 10,000 条消息、1,024 个会话；达到容量明确拒绝新写入，本版没有自动归档。

## 接入 dsh

在 profile 启用插件后，设置 `cordis.patch.yml`：

```yaml
- id: dsh-peer
  config:
    name: alice
    hub:
      credentialFile: /absolute/path/dsh-a.json
      stateDir: /absolute/path/alice-receipts
```

另一端使用名字 `reviewer`、dsh-b 凭据和独立 stateDir。模型配置无需改动。会话有第一条用户消息后注册，草稿和子 agent 不独立注册。`peer_list` 或 `/peers` 查看中心成员，request/reply/wait 保持原用法。中心模式拒绝 `peer_send` 的 `steer:true`。嵌套委派可传 `parentRequestId`；省略时中心绑定当前或唯一未完成入站任务，歧义时拒绝。

## 投递与恢复

| 状态 | 含义 |
|---|---|
| 已受理 | 中心落盘，等待接收 |
| 投递中 | 接收端领取，宿主接纳尚未确认 |
| 已送达 | 进入宿主持久化 inbox/history |
| 已消费 | 宿主消费了消息；任务完成仍看 result |
| 状态未知 | 无法确认接纳，需要原生历史证据 |
| 未送达 | 过期或明确失败 |

回包丢失只用原 operationId 重试。中心不可达时工具返回状态未知，不得换 ID 重发；重连只同步注册和既有消息，不重建发送任务。SSE 只传提醒，正文从中心收件箱读取。ACK 不产生聊天回复。客户端 receipt 文件和原生历史一起防止重启后重复注入；无法证明接纳时保持未知。

离线目标需恢复同一个原生 session 取信，插件不自动启动已关闭会话，也不把旧积压转给新会话。保留中心目录、设备身份和 stateDir。方向暂停跨重启保存，只能由管理员在界面或 CLI `resume` 恢复。

## Claude 适配边界

实验性 `dsh-peer-claude` 使用可选的官方 MCP SDK。配置 `DSH_PEER_CREDENTIAL`、`DSH_PEER_NAME`；只有仍为同一 Claude 会话时才复用 `DSH_PEER_SESSION_ID`，省略则每次启动新身份。

模型收到提醒后用 `peer_inbox` 读信、`peer_ack` 确认，再调用 request/reply。普通 MCP 连接不足以接收推送，需按 [Claude 官方说明](https://code.claude.com/docs/en/channels-reference)启用自定义 Channel。本次不运行 Claude CLI，不声称真实 Claude 端到端通过；未知投递不自动重放正文。

## 验证

```sh
npm run check
node scripts/hub-check.mjs
node scripts/hub-browser-check.mjs
```

端到端使用两个真实 dsh Host、隔离 home/profile/registry、本地中心和确定性脚本模型，覆盖真实工具、调度、持久化和恢复；不评价模型质量，不调用外部模型。旧模式仍运行 scenarios、request-scenarios、handoff-check 和 browser-check。规格与证据保存在源码仓库的 docs/hub-spec.md、docs/acceptance.md 与 test/evidence 中。
