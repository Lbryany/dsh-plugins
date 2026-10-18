# dsh-peer

同一台机器上 dsh 会话之间的发现与消息投递。peer 的单位是**会话**：不同进程（任意 profile、Web / headless 都行）的会话互为 peer，同一进程里的不同会话也互为 peer。模型用 `peer_list` 查看谁在线，用 `peer_send` 给对方发消息；对方以一条用户消息（`form: 'relay'`）收到，回复也走 `peer_send`。全部是异步单向投递，不等回复。

## 安装到一个 profile

1. 在 profile 目录（如 `~/.dsh/profiles/<p>/`）的 `package.json` 里，`dependencies` 加 `"@lbryany/dsh-peer": "<版本或 link:路径>"`。
2. 在同一文件的 `dsh.profile.bundles` 末尾加 `"@lbryany/dsh-peer"`。
3. 在 profile 目录运行 `pnpm install`，然后重启这个 profile 的 dsh。启动日志会出现 `[dsh-peer] 已登记 pid <pid>，socket <path>`。

用 `link:` 装本地仓库时，先在仓库里运行 `node scripts/link-dsh.mjs`，把 `@deepseek-ai/dsh-llm`、`dsh-tools` 链到本机的 dsh 安装目录（找不到时设置环境变量 `DSH_BIN` 为 dsh 的 `lib/bin.js`）。

## 名字

- 缺省名：`<cwd 目录名>-<sessionId 前 4 位>`，例如 `dsh-projects-b9c3`。目录名会被规整：转小写，非法字符换成 `-`。
- 固定名：给 headless 长跑的 agent 用。环境变量 `DSH_PEER_NAME` 或插件配置 `name`，环境变量优先。只有该进程**第一个**登记的会话用这个名字，后面的会话仍用缺省名。
- 改名：在对话里输入 `/peer-name <名字>`，或让模型调用 `peer_rename`。改过的名字按 sessionId 记在 `~/.dsh-peer/names.json`，会话被 resume 回来时会沿用。
- 规则：`^[a-z0-9][a-z0-9_-]{0,39}$`，整个注册表内唯一。撞名时自动加 `-2`、`-3`，并在返回文本里说明。
- 子 agent 派生的会话不登记。它调用 `peer_*` 时，用所属根会话的身份。

## 工具与命令

| 名称 | 作用 |
|---|---|
| `peer_list` | 列出本机在线的 dsh 会话，列：名字、状态、cwd、标题、profile、进程。本会话标「（本会话）」，同进程的会话标「（同进程）」。 |
| `peer_send({ to, text, steer? })` | `to` 填名字，或 sessionId 前缀（至少 4 位，带不带 `session-` 前缀都可以）。`steer: true` 会插进对方当前这一轮；缺省是排到对方的下一轮。 |
| `peer_rename({ name })` | 改本会话的名字。 |
| `/peers` | 同 `peer_list`。 |
| `/peer-name <名字>` | 同 `peer_rename`；不带参数时显示当前名字。 |

headless 没有 commands 服务，这两个斜杠命令会被静默跳过，三个工具照常可用。

## 对方看到的消息

```
[peer 消息] 来自 roadmaper（cwd /home/me/Projects/dsh-projects，profile projects）
<原文>

（这条消息来自另一个 dsh 会话，不是用户说的话。要回复就调用 peer_send，to 填 "roadmaper"。）
```

消息的 `source` 是 `{ kind: 'dsh-peer', form: 'relay', peer: { name, session, pid, cwd } }`。

## 失败原因

| 错误 | 含义 |
|---|---|
| `unknown-peer` | 地址解析失败 |
| `ambiguous-peer` | sessionId 前缀命中多个会话 |
| `unsupported-address` | 地址里含 `@` |
| `self` | 发给了自己 |
| `not-live` | 目标会话已不在内存。不会 resume，也不会落盘 |
| `unknown-session` | 对方进程里没有这个会话 |
| `bad-token` | token 校验失败 |
| `unreachable` / `timeout` | socket 连不上，或 5 秒内无响应 |

失败时，返回文本会附上当前的 peer 列表。

## 文件与协议

- 注册表目录：`$DSH_PEER_DIR` > `$XDG_RUNTIME_DIR/dsh-peer` > `~/.dsh-peer/run`，权限 0700。目录不放在 DSH_HOME 下，因为不同 profile 的 DSH_HOME 可能不同。
- 每个进程三个文件：
  - `<pid>.json`：进程与会话列表，0644，原子写，50 ms 内的多次变化合并成一次写入。
  - `<pid>.key`：token，0600。
  - `<pid>.sock`：Unix socket，0600。
- 进程退出时删掉自己的三个文件。别的进程读注册表时，如果发现 pid 已不存在，或 Linux 下 `/proc/<pid>/stat` 的启动时刻对不上（说明 pid 被复用），就顺手清掉这些残留。
- socket 协议：每次连接只发一条请求，以换行分隔的 JSON，服务端回一条后关闭连接。
  - 请求：`{ v: 1, token, id, type: 'send', to: { session }, from: { pid, session, name, cwd, profile }, text, steer }`。
  - `type: 'ping'` 只带 `token`。
  - 响应：`{ ok: true, id, delivered: 'queued' | 'steered' | 'duplicate' }`，或 `{ ok: false, id, error }`。
  - 单条请求上限 64 KiB；客户端连接加等待响应共 5 秒超时。接收方按消息 `id` 去重，记最近 200 条。
- 同一进程内的会话之间直接投递，不经过 socket。

## 限制与跨机器预留

- 第一版只支持同一台机器。不做冷投递，不做同步等回复、组播 / 广播、消息历史，也没有终端 CLI。
- Windows 下 socket 换成 named pipe（`\\.\pipe\dsh-peer-<pid>`）。只写了实现，没有实测。
- 跨机器预留了两处：
  - `lib/transport.js` 只暴露 `createTransport({ dir, pid, token, onRequest }) → { start, stop, send }`，core 只通过它和注册表的 `readOthers()` 与外界交互。第二版换成 hub 实现（TCP 加鉴权），工具、消息格式、命名都不用改。
  - 注册表记录带 `protocol`，socket 请求带 `v`；地址保留 `name@host` 语法，第一版遇到这种地址报 `unsupported-address`。

## 开发

```
node scripts/link-dsh.mjs   # 只有 index.js 需要；单测不依赖 dsh
node --test test/*.test.mjs
```
