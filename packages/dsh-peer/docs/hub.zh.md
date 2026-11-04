# Peer Hub 中心模式
[English](hub.md) | 中文

0.3.0 起，中心服务、客户端库和其他 runtime（Claude Code、Codex、Grok Bot）的接入都移到独立仓库 **peer-hub**（本机路径 `../peer-hub`，含部署、配对和各 runtime 步骤的 README）。本包只保留 dsh 插件：同机模式不变，中心模式通过 `@lbryany/peer-hub-client` 连接中心。

## 接入 dsh

1. 在中心生成配对码：控制台「设备与配对」，或服务器上 `peer-hub pair --name dsh-a --runtime dsh`。
2. 在 dsh 所在机器加入（凭据以 600 写入）：

   ```sh
   node <peer-hub>/bin/peer.js join https://hub.example.net --code K7PD-3QWX --credential ~/.peer-hub/dsh-a.credential.json
   ```

3. 在 dsh profile 目录安装客户端（可选 peer 依赖，同机模式不需要）：`npm install <peer-hub>/packages/client`。
4. 在 profile 的 `cordis.patch.yml` 里配置：

   ```yaml
   - id: dsh-peer
     config:
       name: alice
       hub:
         credentialFile: /absolute/path/dsh-a.credential.json
         stateDir: /absolute/path/alice-receipts
   ```

中心地址取自凭据里的 `url`（配对时使用的地址）：远端必须是 `https://`，明文 `http://` 只允许 127.0.0.1/localhost。凭据到期前 7 天自动续期并改写凭据文件。每个 Host/profile 用独立设备凭据和独立 stateDir。

会话有第一条用户消息后注册，草稿和子 agent 不独立注册。`peer_list` 或 `/peers` 查看中心成员，request/reply/wait 保持原用法。中心模式拒绝 `peer_send` 的 `steer:true`。嵌套委派可传 `parentRequestId`；省略时中心绑定当前或唯一未完成入站任务，歧义时拒绝。

## 投递与恢复

| 状态 | 含义 |
|---|---|
| 已受理 | 中心落盘，等待接收 |
| 投递中 | 接收端领取，宿主接纳尚未确认 |
| 已送达 | 进入宿主持久化 inbox/history |
| 已消费 | 宿主消费了消息；任务完成仍看 result |
| 状态未知 | 无法确认接纳，需要原生历史证据 |
| 未送达 | 过期或明确失败 |

回包丢失只用原 operationId 重试。中心不可达时工具返回状态未知，不得换 ID 重发。SSE 只传提醒，正文从中心收件箱读取；ACK 不产生聊天回复。stateDir 里的回执日志和原生历史一起防止重启后重复注入。离线目标需恢复同一个原生 session 取信，插件不自动启动已关闭会话。方向暂停只能由中心操作员恢复。

## 验证

```sh
npm run check
node scripts/hub-check.mjs     # 两个真实 dsh Host 经 peer-hub 中心（PEER_HUB_DIR，默认 ../../../peer-hub）
```

hub-check 用 `peer join` 配对码加入，一端经代理，覆盖 SH01 发现、SH02 request→question→answer→result、SH03 中心重启与离线投递、SH04 回执丢失后的原生历史对账。模型为确定性脚本，不评价模型质量。
