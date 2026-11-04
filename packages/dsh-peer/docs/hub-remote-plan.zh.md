# Peer Hub 远端部署方案：注册鉴权、Grok Bot 接入、控制台

状态：已实施于独立仓库 peer-hub 0.3.0（2026-11-04）；以下为原设计稿，文件路径指拆分前的 `lib/hub/*`。配套界面预览：`docs/preview/hub-dashboard.html`，直接用浏览器打开。

## 1. 目标与拓扑

一个中心部署在公网或 Tailscale 可达的常开机器上，多台机器上的 dsh、Claude Code、Codex、Grok Bot 会话通过它互相发任务和结果。

```
                    ┌────────────────────────────┐
                    │  hub.example.net (VPS)      │
   Caddy :443 TLS ──┤  dsh-peer-hub  127.0.0.1:3987│
                    │  SQLite (WAL) + 审计日志     │
                    └──────┬────────┬────────┬────┘
            HTTPS RPC + SSE│        │        │
        ┌──────────────────┘        │        └──────────────────┐
   MacBook                      studio-mini                   VPS 自身
   dsh ──── 插件直连            claude-code ── stdio 适配器      dsh ── 插件直连
   claude-code ── stdio 适配器  grok-bot ──── MCP(HTTP)+hook
   codex ──── MCP + codex queue
   grok-bot ── MCP(HTTP)+hook
```

设计原则不变：中心只做身份、持久化收件箱和任务状态机；agent 在各自宿主执行；受理不等于送达；ACK 不唤醒模型。

## 2. 注册与鉴权

### 2.1 身份模型

| 层 | 含义 | 生命周期 |
|---|---|---|
| 操作员 | 管理中心的人。持有 admin token，登录控制台、签发配对码、撤销设备、恢复暂停方向 | 可轮换；可增加只读「观察者」凭据 |
| 工作区 | 隔离域。成员只看见同一工作区的会话 | 操作员创建 |
| 设备 | 一台机器上的一个 runtime 安装，例如 `mac-claude`、`vps-worker` | 由配对签发凭据；可撤销、轮换、到期 |
| 会话 | 设备上报的一个 runtime 会话，拥有工作区内唯一的名字 | 随设备 `sessions.sync` 出现和消失，受 generation 栅栏保护 |

现有 service.js 已经实现了后三层的核心（设备 token 哈希存储、generation 栅栏、工作区过滤）。远端化主要补「设备怎么拿到凭据」和「传输层怎么保护凭据」。

### 2.2 设备加入的两条路径

**路径 A：操作员生成配对码（默认）**

1. 操作员在控制台「设备与配对」里填设备名、runtime、工作区、凭据有效期，点「生成配对码」。中心生成 8 位码（去掉易混字符，`K7PD-3QWX` 形式），10 分钟有效，单次使用，只保存哈希。
2. 目标机器运行 `dsh-peer join https://hub.example.net --code K7PD-3QWX --name office-grok --runtime grok-bot`。客户端向 `POST /v1/pair` 提交码、设备名、runtime、主机名和一个本地生成的 Ed25519 公钥。
3. 中心校验码，签发设备凭据 `{deviceId, workspace, token, expiresAt, url}`，作废该码。客户端以 600 权限写入凭据文件，并按 runtime 打印或写入接入片段（见第 3、4 节）。

**路径 B：设备自荐，操作员批准**

设备没有码也能运行 `dsh-peer join <url> --request`，中心记录一条待批准请求（公钥指纹、来源 IP、申请的工作区），控制台显示「待批准的加入请求」。批准即签发凭据，客户端在轮询中取回；拒绝则删除。批准前该设备不能注册会话，也读不到任何消息。适合你自己在远端机器上先装好、回到控制台再批。

### 2.3 凭据生命周期

- 默认 90 天到期，客户端在到期前 7 天用旧 token 调 `device.renew` 换新 token；旧 token 保留 5 分钟重叠期后失效。
- 操作员可 `device.rotate`（立即换新，用于疑似泄露）和 `device.revoke`（立即失效并关闭 SSE 流，现有逻辑已做）。
- 每个设备记录 `lastSeen`、`lastIp`、`hostname`、`runtime`、`version`，在控制台列表展示。
- 工作区级别限制：设备上限、会话上限沿用现有 `maxSessions`。

### 2.4 请求认证

第一阶段沿用 `Authorization: Bearer <token>` + `x-peer-generation`，中心只存 SHA-256。token 在 TLS 内传输。

第二阶段加请求签名：客户端对 `method + path + timestamp + nonce + sha256(body)` 用设备 Ed25519 私钥签名，头部携带 `x-peer-ts`、`x-peer-nonce`、`x-peer-sig`；中心校验时间偏差 ±5 分钟并记住 10 分钟内 nonce。好处是 TLS 被反向代理终结或 token 泄露到日志时，攻击者仍需要私钥。配对时已经上传公钥，所以第二阶段不需要重新配对。

### 2.5 控制台登录

- 操作员粘贴 admin token 或一次性登录码（服务器端 `dsh-peer-hub login-code` 生成，5 分钟有效）。中心签发 12 小时 HttpOnly、SameSite=Strict、Secure 的会话 cookie，页面不再把 token 放在内存里反复发送。
- 所有写操作带 `x-peer-csrf` 头，值来自登录响应，cookie 自动携带但头必须由页面脚本显式加。
- 观察者凭据只允许 `inspect`，不允许 resume、revoke、pair。
- 同一来源连续 5 次登录失败锁定 10 分钟；`/v1/pair` 同样按来源限速，配对码爆破窗口被压缩到 10 分钟内 5 次。

### 2.6 传输层与主机校验

- hub 进程仍只监听 `127.0.0.1`，TLS 由 Caddy 终结（自动签发 Let's Encrypt）。新增配置 `publicUrl: https://hub.example.net`，`server.js` 的 Host/Origin 校验改为接受 loopback 或 `publicUrl` 的 host，并信任 Caddy 传来的 `X-Forwarded-For` 作为来源 IP。
- `lib/hub/client.js` 放开 `https:`，并保持拒绝非 loopback 的 `http:`。凭据文件里的 `url` 必须与配对时一致。
- SSE 连接经过 Caddy 需要关闭缓冲（`flush_interval -1`），现有服务端已经发 `x-accel-buffering: no` 和 10 秒心跳。
- 备选：不开公网，全部机器加入 Tailscale，hub 监听 Tailscale 地址并用 `tailscale serve` 提供 TLS。此时第 2.6 节的 Caddy 换成 tailscale，其余不变。

### 2.7 审计

新增 `audit` 记录类型：配对、批准、拒绝、撤销、轮换、登录成功/失败、resume。只记操作与主体，不记正文。控制台「最近活动」合并审计和消息事件。

## 3. Grok Bot 接入

### 3.1 事实

本机 `/Applications/Grok Bot.app` 0.78.4，Electron，bundle id `com.anysphere.sand`（Cursor 内核）。`app.asar` 里有完整的 MCP 实现（`mcpServers` 配置、stdio、SSE、Streamable HTTP、OAuth 回调 `grokbot://mcp/oauth/callback`）、Cursor 风格的 hooks（`sessionStart`、`beforeSubmitPrompt`、`afterAgentResponse`，支持向模型注入 `additional_context`）以及 deeplink 路由。没有命令行入口，也没有 Claude Code 那样的 channel 推送。

### 3.2 工具层：让 Grok 能发消息

中心新增 Streamable HTTP 形态的 MCP 端点 `https://hub.example.net/mcp`，鉴权用设备 Bearer token（Grok Bot 的 MCP 配置支持自定义 header）。暴露与 Claude 适配器相同的六个工具：`peer_list`、`peer_inbox`、`peer_ack`、`peer_request`、`peer_reply`、`peer_wait`，复用 `lib/hub/claude.js` 泛化后的 bridge。

会话身份：MCP 的 `Mcp-Session-Id` 对应一个中心会话；首次连接时自动注册，名字取配对时的设备名加后缀，`peer_rename` 可改。Grok Bot 重启后新建 MCP 会话即新身份，旧收件箱不继承，与现有 P201 规则一致。

这个 HTTP MCP 端点同时也能给 Codex（`config.toml` 的 `url` + `bearer_token_env_var`）和 Claude Code（`claude mcp add --transport http`）用，所以不是 Grok 专属投入。只有需要 channel 推送的 Claude 保留 stdio 适配器。

### 3.3 唤醒层：让 Grok 知道有信

Grok Bot 没有推送入口，只能在回合边界拉取，分三级：

1. **hook 拉取（必做）**。`dsh-peer hooks install --runtime grok-bot` 写入 Grok Bot 的 hooks 配置：`sessionStart` 和 `beforeSubmitPrompt` 执行 `dsh-peer inbox --brief`，该命令调中心 `inbox.peek`，把待读条数和每条首行作为 `additional_context` 返回，模型在用户下一次提交时看到「收件箱有 2 条，请调用 peer_inbox 读取并 peer_ack」。`afterAgentResponse` 把会话状态同步为 idle。正文仍然只通过 `peer_inbox` 领取，hook 只给提示。
2. **桌面提醒（建议）**。本机常驻的 `dsh-peer agent`（给 Codex 做 `codex queue` 注入的同一个进程）订阅 SSE，收到发往 grok 会话的消息时用 macOS 通知提示「@alice 给 Grok 发了任务」，由你点一下 Grok 窗口发送任意内容触发 hook。
3. **deeplink（待验证）**。asar 里有 `deeplink/background-agent` 路由和 `grokbot://` scheme。如果它像 Cursor 一样支持 `prompt?text=` 形式，常驻进程可以直接打开 `grokbot://…/prompt?text=收件箱有新消息` 实现近似推送。这需要在真机试一次，试通就升为默认。

### 3.4 配置落点

Grok Bot 的 MCP 和 hooks 配置文件路径在你还没配置过任何 MCP 的情况下没有落盘，无法从磁盘确认。方案里 `dsh-peer join --runtime grok-bot` 先只打印 JSON 片段，由你在 Grok Bot 设置界面粘贴一次并告诉我实际路径，之后再把自动写入补上。

### 3.5 边界

Grok 的接入是「工具 + 回合边界拉取」，不是实时推送。发给 Grok 的 request 在它下一次活动前一直是「已受理」，中心的根任务 10 分钟期限对它偏紧，建议对 runtime 为 grok-bot 的接收方把默认期限放宽到 30 分钟，或者由发起方在 `peer_request` 里显式传 `deadline`。

## 4. 其他 runtime 的唤醒方式

| Runtime | 工具 | 唤醒 | 状态 |
|---|---|---|---|
| dsh | 插件内置 | SSE → 宿主注入 | 已完成 |
| claude-code | stdio MCP 适配器 | `notifications/claude/channel`，需 `claude --dangerously-load-development-channels server:dsh-peer` 交互式启动 | 代码已有，待真机验证 |
| codex | HTTP MCP 或 stdio | 常驻 `dsh-peer agent` 收到 SSE 后执行 `codex queue --thread <id> --message "收件箱有新消息，请 peer_inbox"` | 需验证 thread id 的获取方式 |
| grok-bot | HTTP MCP | hook 拉取 + 桌面提醒，deeplink 待验证 | 见第 3 节 |

## 5. 控制台

预览见 `docs/preview/hub-dashboard.html`。结构：

- 顶栏：中心地址与 TLS 状态、运行时长、工作区切换、当前操作员。
- 左栏：概览、成员、任务、消息、设备与配对、接收保护，带计数。
- 概览：四个指标（在线成员、待投递、进行中任务、已暂停方向）在前，最近活动流和按 runtime 的唤醒方式表在后。
- 成员：按机器分组的会话卡片，显示 runtime、状态、工作目录、收件箱待读数和租约时间。
- 任务：按根任务分组的谱系树，缩进表示委派深度，每行显示状态和预算消耗。
- 消息：流水表，四段投递进度条（受理、领取、送达、消费），未知和未送达用独立颜色。
- 设备与配对：生成配对码、待批准请求、设备列表（轮换、撤销）。
- 接收保护：已暂停方向和恢复按钮、当前阈值。
- 登录页：操作员凭据或一次性登录码，说明会话 12 小时与锁定策略。

实现上沿用现有 `lib/hub/web/` 三个文件、无构建、CSP `default-src 'self'`。字体改为自托管或系统字体（预览为了方便用了 Google Fonts，正式版不能外链）。数据接口从单个 `inspect` 拆成 `inspect.summary`、`sessions`、`requests`、`messages?cursor=`、`devices`、`audit`，消息列表分页。

## 6. 代码改动清单

| 文件 | 改动 |
|---|---|
| `lib/hub/service.js` | 新增 `pair.create`、`pair.redeem`、`pair.request`、`pair.approve/reject`、`device.renew`、`device.rotate`、`login`、`audit`；`sessions.sync` 的 runtime 白名单加 `codex`、`grok-bot`；设备记录增加 `publicKey`、`expiresAt`、`lastIp`、`hostname` |
| `lib/hub/store.js` | 新增 `pairing`、`audit`、`login-session` 记录；`user_version` 升到 2 并写迁移 |
| `lib/hub/server.js` | `publicUrl` 配置与 Host/Origin 校验；`/v1/pair`、`/v1/login`、`/mcp`；cookie 会话与 CSRF；来源限速；可选请求签名校验 |
| `lib/hub/client.js` | 允许 `https:`；凭据续期；可选请求签名 |
| `lib/hub/bridge.js`（由 `claude.js` 泛化） | 工具实现与 `notify` 解耦，供 stdio 适配器、HTTP MCP、CLI 共用 |
| `lib/hub/mcp-http.js` | Streamable HTTP MCP 端点，会话 ↔ 中心会话映射 |
| `bin/peer.js`（新，`dsh-peer`） | `join`、`inbox --brief`、`hooks install`、`agent`（SSE 订阅 + `codex queue` + 桌面提醒） |
| `bin/hub.js` | `login-code`、`pair`（改走 `pair.create`）、`approve`、`audit` |
| `lib/hub/web/*` | 按预览重做 |
| `docs/hub.zh.md` | 远端部署、Caddy 示例、各 runtime 接入步骤 |

## 7. 实施顺序

1. 提交当前 0.2.0 本地中心作为基线。
2. 鉴权：配对码、自荐批准、续期轮换、审计、`publicUrl` 与 https 客户端。测试覆盖码过期、单次使用、错误码限速、撤销后 SSE 关闭。
3. 控制台重做，接新的分页接口。
4. HTTP MCP 端点 + 泛化 bridge，用 Codex 先验证（它的 MCP 配置最直接）。
5. `dsh-peer` CLI：`join`、`inbox --brief`、`hooks install`、`agent`。
6. Grok Bot 真机：配 MCP，装 hooks，验证 deeplink。
7. Claude Code 真机验证 channel。
8. 远端部署：Caddy + systemd，备份脚本（停服后整目录含 WAL），两台机器跑通 dsh ↔ claude ↔ codex ↔ grok 的一轮 request/result。
9. 第二阶段：请求签名、观察者角色、消息到期归档。

## 8. 需要你确认的点

- Grok Bot 的 MCP 与 hooks 配置路径（在设置里配一次 MCP 后，磁盘上会出现对应文件）。
- 远端走公网 Caddy 还是 Tailscale。两者在代码上的差别只在 `publicUrl` 和来源 IP 的取法。
- 控制台字体：自托管字体文件还是只用系统字体。
