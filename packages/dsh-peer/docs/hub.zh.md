# Peer Hub 中心与混合模式
[English](hub.md) | 中文

中心服务、客户端库和其他 runtime（Claude Code、Codex、Grok Bot）的接入都在独立仓库 **peer-hub**（本机路径 `../peer-hub`，含部署、配对和各 runtime 步骤的 README）。本包只保留 dsh 插件。**0.4.0** 起为混合模式：同机通道永远开启，配置中心后另加中心通道。本机会话之间走 socket，远端会话经中心，两条通道同时工作。

需要 peer-hub **0.4.0** 中心（protocol 3：一份设备凭据可以有多个进程同时在线）和 `@lbryany/peer-hub-client` 0.4.x。

## 接入 dsh

1. 在中心生成配对码：控制台「设备与配对」，或服务器上 `peer-hub pair --name mac --runtime dsh`。
2. 在 dsh 所在机器加入（凭据以 600 写入）：

   ```sh
   node <peer-hub>/bin/peer.js join https://hub.example.net --code K7PD-3QWX --credential ~/.peer-hub/mac.credential.json
   ```

3. 在 dsh profile 目录安装客户端（可选 peer 依赖，只在配置 `hub` 时加载）：`npm install <peer-hub>/packages/client`。
4. 在 profile 的 `cordis.patch.yml` 里配置：

   ```yaml
   - id: dsh-peer
     config:
       name: alice
       hub:
         credentialFile: /absolute/path/mac.credential.json
         stateDir: /absolute/path/peer-receipts
   ```

中心地址取自凭据里的 `url`（配对时使用的地址）：远端必须是 `https://`，明文 `http://` 只允许 127.0.0.1/localhost。凭据到期前 7 天自动续期并改写凭据文件。

一台机器一份设备凭据即可。同一 profile（或共用凭据的多个 profile）开多个 dsh 进程时，每个进程是该设备在中心上的一个连接，各自租约与心跳，同时在线；一个进程退出只让它自己的会话离线。续期在凭据文件锁（`<凭据>.lock`）内进行，只有一个进程续期，其余进程读文件沿用新 token。stateDir 可以共用：回执日志按会话分文件（`receipts-<hash>.json`；0.3 的 `receipts.json` 只读，用于对账）。

## 路由与寻址

- **同机优先**：目标在本机注册表里（本机正在运行的 dsh 会话）就走 socket，否则走中心。本机会话之间的消息绝不经过中心，中心上也不会有它们的消息或事件记录。
- **本机识别**：中心上与本进程同一 deviceId 的会话就是本机会话，在 `peer_list` 里只出现一次（标 `[local]`），不会经中心寻址。同机识别依赖共用注册表目录（`dir` / `DSH_PEER_DIR` / 默认 `~/.dsh-peer/run`），本机进程请不要配置不同的注册表目录。
- **地址语法**：
  - `name`：先在本机找（名字精确，再会话 ID 前缀 ≥4 位）；本机会话在中心上的名字（如 `a-2`）也指本机；找不到再按中心名字、会话前缀找远端。
  - `name@device`：中心上设备 `device` 的会话 `name`（中心会话名 + 设备名，设备名即配对时的名字）。本设备名指本机。peer-hub client 原本没有这种寻址；由 dsh-peer 在本地解析成中心会话 ID 再发送，中心协议不变。
  - 远端与本机重名时，裸名字指本机，`peer_list` 把远端显示为 `name@device`。
- **名字可能不同**：中心名字全工作区唯一，本地名字只在本机唯一。同一会话可能本地叫 `a`、中心叫 `a-2`（远端已有 `a`）：本机 peer 用 `a`，远端 peer 用 `a-2`。详细列表里本地行显示「中心名 a-2」，`peer_rename` 也会提示中心上的名字。
- **来信**：两条通道进同一个收件箱，`source.channel` 为 `local` 或 `hub`；远端来信正文里的回复地址按本机视角给出（重名时为 `name@device`）。`peer_reply` 沿任务来时的通道返回。

会话有第一条用户消息后注册，草稿和子 agent 不独立注册。中心通道拒绝 `peer_send` 的 `steer:true`。嵌套委派可传 `parentRequestId`；省略时绑定当前或唯一未完成的入站任务，歧义时拒绝（两条通道规则相同）。跨通道续接（例如处理远端任务时委派给本机会话）不继承原任务的预算与期限，结果里标 `crossChannel`；这是已知限制。

## 中心离线

同机通道先于中心通道启动，中心不可达或凭据有误都不影响同机收发。`peer_list` 只列本机会话并注明「中心离线」，发往远端返回 `hub-offline`（不自动重发）。中心恢复后客户端自动重连，远端收发恢复，离线期间排队的消息照常投递。

## 投递与恢复（中心通道）

| 状态 | 含义 |
|---|---|
| 已受理 | 中心落盘，等待接收 |
| 投递中 | 接收端领取，宿主接纳尚未确认 |
| 已送达 | 进入宿主持久化 inbox/history |
| 已消费 | 宿主消费了消息；任务完成仍看 result |
| 状态未知 | 无法确认接纳，需要原生历史证据 |
| 未送达 | 过期或明确失败 |

回包丢失只用原 operationId 重试。中心不可达时工具返回状态未知，不得换 ID 重发。SSE 只传提醒（只发给拥有接收会话的那个进程），正文从中心收件箱读取；ACK 不产生聊天回复。回执日志和原生历史一起防止重启后重复注入。离线目标需恢复同一个原生 session 取信，插件不自动启动已关闭会话。远端方向的暂停只能由中心操作员恢复。

## 验证

```sh
npm run check
node scripts/hub-check.mjs     # 两个真实 dsh Host（各自一台「机器」）经 peer-hub 中心（PEER_HUB_DIR，默认 ../../../peer-hub）
node scripts/mixed-check.mjs   # 混合模式：同一 DSH_HOME 的 A、B（共用凭据）+ 另一 DSH_HOME 的 C，临时中心
PEER_HUB_URL=https://hub.example.net PEER_HUB_ADMIN_DIR=/var/lib/peer-hub node scripts/hub-check.mjs   # 连接已有中心
```

默认自起临时中心。设置 `PEER_HUB_URL` 和 `PEER_HUB_ADMIN_DIR`（中心数据目录，读其中的 `admin.json` 签发配对码）时 hub-check 改连已有中心：设备和消息全部放在新工作区 `hubcheck-<时间>`，结束时撤销这两个设备；SH03 需要重启中心，外部模式下跳过，并在输出的 `skipped` 里写明；SH04 杀掉宿主后要等中心的连接租约（`PEER_HUB_LEASE_MS`，默认 45000）过期再重启。

hub-check 用 `peer join` 配对码加入，一端经代理，覆盖 SH01 发现、SH02 request→question→answer→result、SH03 中心重启与离线投递、SH04 回执丢失后的原生历史对账。mixed-check 覆盖 MX01 同凭据两个进程同时在线、MX02 合并列表、MX03 A↔C 经中心（每条消息 queued→claimed→delivered→consumed）、MX04 A↔B 只走 socket（中心 messages 与 message_events 不变）、MX05 停掉中心后 A↔B 照常、中心恢复后 A↔C 恢复。模型为确定性脚本，不评价模型质量。
