# dsh-codebuddy

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 CodeBuddy 插件：提供 OAuth 登录、账号动态模型目录、流式请求以及推理等级选择。

本分支面向 **DSH 0.2.x**：`engines.dsh` 声明为 `>=0.2.1-rc.2 <0.3.0-0`，已验收的准确版本为 **0.2.1-rc.2**，SDK 开发依赖固定到该版本。本分支不承诺兼容 `0.1.x`。插件从 `0.1.4` 起包含设置与接入改造，`0.1.5` 起会话级 `x-conversation-id` 修复提示缓存每轮失效的问题（见下文）；`0.1.6` 起模型目录落盘缓存、支持图片输入、可开请求诊断。

## 功能

- “设置 → CodeBuddy”中登录、取消或退出账号，刷新目录，保存 DSH 默认模型及推理等级。
- 默认站点通过 DSH 配置持久化；默认模型统一使用宿主 `agentDefaultModel`。
- `/codebuddy-login [site]` 登录国内版、国际版或自定义 CodeBuddy 站点。
- 在 dsh 模型选择器中显示独立的 `CodeBuddy` 分类。
- 登录后动态加载当前账号可用的模型。
- 支持 `Off / Minimal / Low / Medium / High / Xhigh / Max` 推理等级。
- OAuth 凭据通过 dsh Credential Store 持久化；模型目录落盘到 `$DSH_HOME/codebuddy/models-cache.json`，重启后先恢复上次目录再按需联网。
- 目录里标 `supportsImages` 的模型可以在 dsh 里直接发图片（经 dsh 附件服务缩放后内联 base64）。
- 提供 `/codebuddy-status` 和 `/codebuddy-logout`。

## 前置要求

- DeepSeek Harness `0.2.1-rc.2` 及之后的 0.2.x（`engines.dsh`：`>=0.2.1-rc.2 <0.3.0-0`；0.2.0 及更早版本请用 0.1.x 的 release）
- Node.js `22.19+` 或 `24+`

## 从 GitHub 安装

将插件安装到实际运行 Web 应用的同一个 profile：

```sh
dsh plugin --profile web add github:Lbryany/dsh-codebuddy
dsh web
```

如果 Web 应用使用自定义 profile，请将 `web` 换成该 profile 名称，并使用 `dsh --profile <name>` 启动。

### DSH 0.2.x 的 pnpm 安全策略

`@earendil-works/pi-ai` 的传递依赖包含两个安装脚本，但 CodeBuddy 的 OpenAI 兼容路径不需要运行它们。若安装时出现 `ERR_PNPM_IGNORED_BUILDS`，请在 `$DSH_HOME/profiles/web/pnpm-workspace.yaml` 中把 DSH 自动生成的占位值改为：

```yaml
allowBuilds:
  '@google/genai': false
  protobufjs: false
```

如果文件里已有 `allowBuilds`，请合并这两项而不是重复该键。首次失败的安装可能已经写入依赖但尚未激活 bundle；修改后先移除再重新安装：

```sh
dsh plugin --profile web remove @lbryany/dsh-codebuddy
dsh plugin --profile web add github:Lbryany/dsh-codebuddy
```

在 dsh 输入框执行：

```text
/codebuddy-login cn
```

站点参数：

- `cn` / `china`：`https://copilot.tencent.com`
- `global` / `intl`：`https://www.codebuddy.ai`；留空使用设置页保存的默认站点（初始为国际站）。
- 也可以传入完整的 `http(s)` 站点 URL

命令会直接显示授权 URL；请点击该 URL（或复制到本地浏览器）完成授权。这个流程不依赖服务器上的 Chrome，因此也适用于无头或远程环境。授权成功后，模型选择器会出现 `CodeBuddy` 分类、当前账号的模型列表和可选推理等级。

## 从源码构建安装

```sh
git clone https://github.com/Lbryany/dsh-codebuddy.git
cd dsh-codebuddy
npm ci
npm run check
npm pack --ignore-scripts
dsh plugin --profile web add ./lbryany-dsh-codebuddy-0.1.6.tgz
dsh web
```

## 更新与卸载

重新安装最新 GitHub 版本：

```sh
dsh plugin --profile web add github:Lbryany/dsh-codebuddy
```

卸载：

```sh
dsh plugin --profile web remove @lbryany/dsh-codebuddy
```

## 会话标识与提示缓存

CodeBuddy 服务端按 `x-conversation-id` 识别一个对话。0.1.5 之前插件每次请求都生成一个随机的 conversation id（pi-ai 每次请求都重新调用 `toAuth`，那里拿不到会话），同一个 dsh 会话的每一轮都像一个新对话，服务端的提示缓存每轮都失效。现在：

- `X-Conversation-ID` 由 dsh 的会话 id 哈希成稳定的 UUID，同一会话每轮相同（没有会话 id 的调用用随机 UUIDv7）。思路与 cc-switch 一致：跨轮稳定的 session / conversation id 才能当会话身份。
- 其余上下文头与官方 CLI 2.168.2 对齐，由适配器按调用生成：
  - turn 按 dsh 消息来源划分（官方 CLI 只在用户输入被接纳时更新 turn id）：从历史末尾往前找第一条决定性消息，真正的用户输入（本轮输入、`user` / `schedule` / `webhook` 来源）开新 turn，模型输出复用当前 turn；工具结果、子 agent 通知（`subagent-settled` / `agent-message` / `team-message` 等）、`model-selection` / `runtime-context` 等上下文注入以及未知来源都跳过。`X-Conversation-Request-ID` 与 `X-Root-Request-ID` 取 turn id。已知局限：dsh 不区分 steer 与新输入，工具循环中途插入的用户消息会开新 turn。
  - `X-Request-ID` = `X-Conversation-Message-ID`，每次调用新生成。
  - `X-Agent-Type` / `X-Agent-Purpose`：主调用 `main` / `conversation`，上下文压缩 `compaction` / `context_compact`（另带 `X-Compaction: manual`，复用当前 turn），会话标题 `auxiliary` / `conversation_topic`。压缩成功后同一会话的下一次主调用带一次 `X-Context-Compacted`：压缩检查点由 `/compact` 命令产生（带 `sourceCommandId`）时为 `manual`，否则为 `auto`。
  - 会话标题同 CLI 用独立的标题子会话：每次新的 `X-Conversation-ID`、新的 run id 与 trace，只有 `X-Root-Request-ID` 指向主会话当前任务（主会话还没有任务时等于自己的 run id），不影响主会话的 turn。
  - `X-Agent-Runtime` 取环境变量 `CODEBUDDY_AGENT_RUNTIME`（`local-agent` / `cloud-agent` / `agent-agent`，其余为 `other`，未设置为 `other`）。
  - trace：每个 turn 一个 trace id、每次调用一个 span id，写 `traceparent`、`b3`、`X-B3-TraceId` / `X-B3-SpanId` / `X-B3-Sampled`、`X-Trace-ID`；`baggage` 带会话 id 与 turn id。
  - 不发 `X-Parent-Conversation-ID`：dsh 不告诉插件父子会话关系，子 agent 会话按独立会话处理。
- `PI_CODEBUDDY_CLI_HEADERS=0` 关闭 CLI 请求头时，上述上下文头全部不发。
- 设置页“模型与运行”的“提示缓存保留时长”选“1 小时”时，聊天请求体带 `cache_retention: "long"`（与官方 CLI 一致）；“默认（不指定）”不加该字段。保存后对之后的请求立即生效。
- 可选：`PI_CODEBUDDY_PROMPT_CACHE_KEY=1` 时在请求体里加 OpenAI 的 `prompt_cache_key`（取 dsh 会话 id，最长 64 字符），供 OpenAI 兼容上游按会话路由缓存。默认关闭，因为严格的上游会拒绝未知字段。

## 模型目录缓存

- 目录由 pi-ai 的 ModelsStore 落盘到 `$DSH_HOME/codebuddy/models-cache.json`（没有 `DSH_HOME` 时是 `~/.dsh/...`）。Host 重启后先从文件恢复（设置页标"正在显示上次成功的目录"），第一次请求或手动"刷新目录"再联网核对。
- 每次请求前适配器都会刷新一次目录；上次成功联网刷新距今不超过 `PI_CODEBUDDY_CATALOG_TTL_MS`（默认 600000，即 10 分钟；设 0 表示每次都联网）时直接跳过网络。设置页的"刷新目录"始终联网。
- 联网刷新失败时保留上次目录；退出登录会一并删掉缓存文件里的本账号条目。

## 图片输入

- 目录里 `supportsImages` 为真的模型（如 Deepseek-V4.1-Flash）在 dsh 里声明图片输入；用户消息与工具结果里的图片经 dsh 附件服务按长边 2048 像素、4 MiB 以内取出，再以 base64 data URL 放进 OpenAI 兼容请求体。
- 不支持图片的模型仍只声明文本，dsh 会在发送前拦下带图消息。dsh 标记为已卸载的图片只发占位文本。

## 请求诊断

- `PI_CODEBUDDY_DEBUG_LOG=<文件>` 时，每次聊天请求追加一行请求体摘要（字段、字节数、消息角色与长度、工具名）和一行响应状态 / 响应头（不含任何凭据、不含响应体）。
- 诊断开启时 `PI_CODEBUDDY_STRIP=tools,reasoning_effort,stream_options,temperature,max_tokens` 可按字段名从请求体剔除指定字段，用于排查某个部署或模型不接受哪个字段。
- 2026-10-18 实测：国内站网关对本插件的聊天请求最初返回 HTTP 400、业务码 11128 "request illegal"（提示"没通过渠道校验，可能不是官方客户端发出"），目录接口正常。同日按 CodeBuddy 技术团队指导，把聊天请求的 `User-Agent` 改为恰好 `CLI/2.125.0 CodeBuddy/2.125.0`，去掉 dsh 署名后缀（偏离 dsh 的 `attributionHeaders()` 约定）。结果：待补。之后对齐的 CLI 版本升到 2.168.2，当前 `User-Agent` 为 `CLI/2.168.2 CodeBuddy/2.168.2`，`x-ide-version` 同步为 `2.168.2`。

## 命令

- `/codebuddy-login [cn|global|site URL]`
- `/codebuddy-status`
- `/codebuddy-logout`

OAuth 凭据存储在 dsh 凭据引用 `CODEBUDDY_OAUTH` 中。插件不会把 access token 或 refresh token 写入日志。

## 设置页

打开“设置 → CodeBuddy”：

1. 在“账号与连接”选择中国站、国际站或自定义 URL，按需保存默认站点，然后登录并打开授权页面。
2. 页面显示授权等待、成功、失败或取消状态；“已保存登录凭据”不代表模型目录一定可用。
3. 在“模型与运行”刷新目录，选择模型和推理等级，保存为 DSH 默认模型。保存只影响后续采用默认模型的会话。
4. 在“模型与运行”的“提示缓存保留时长”选择“默认（不指定）”或“1 小时”，保存到插件配置。

刷新失败时保留账号凭据和上次成功目录，缓存目录不能用于新的默认模型保存。非推理模型隐藏推理选项；七档推理强度是适配器映射，不表示已对每个模型验证所有档位。只读配置会明确显示不可保存。

退出登录会取消旧账号请求并移除凭据。命令与设置页共用账号管理服务，原有 `CODEBUDDY_OAUTH` 凭据格式不变。

## 开发

```sh
npm ci
npm run typecheck
npm test
npm run build
```

`lib/` 会提交到仓库，以便 dsh 可以直接通过 GitHub 安装；CI 会验证提交的 bundle 与源码构建结果一致。

### 隔离宿主验收

以下命令只创建仓库下 `.tmp/` 的测试宿主与 profile，不修改全局 DSH。浏览器测试默认使用本机 Edge 的无界面模式，CodeBuddy 网络由本地模拟服务提供。

```sh
npm install --prefix .tmp/host-020 --ignore-scripts --no-audit --no-fund --save-exact @deepseek-ai/dsh@0.2.0-rc.2 playwright@1.56.1
npm run check
npm pack --ignore-scripts --pack-destination .tmp
node scripts/verify-dsh.mjs --version 0.2.0-rc.2 --mode web --mock-provider
node scripts/verify-dsh.mjs --version 0.2.0-rc.2 --mode commands --mock-provider
```

脚本从发布安装包创建独立 profile；依赖脚本配置也只作用于该测试 profile。测试日志和页面截图保存在 `.tmp/verification-artifacts/`。详细范围与未验证项见 [验收记录](docs/verification-0.2.0.md)。

## License

[MIT](./LICENSE)
