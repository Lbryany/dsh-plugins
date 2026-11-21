# 真实交互回流评测

V1 规格与通过线在 [cases.json](cases.json)，V2 完整重跑规格在 [cases-v2.json](cases-v2.json)，本轮结论见 [实施记录](../../docs/plans/2026-11-01-interaction-implementation.md)。`results/2026-11-01.json` 为未通过结果；不能将 `ready-for-oracle-review` 当作成功。

## 隔离环境

使用独立 DSH_HOME、工作区及随机回环端口，排除 3080/3091。主机示例为 macOS、dsh 0.2.1-rc.5（0.2.2-rc.1 已用 `check-host.mjs`、`check-restart-queue.mjs` 复验宿主支持层，模型评测未重跑）；Playwright 与 Chrome 路径可用 `VQ_PLAYWRIGHT_MODULE`、`VQ_CHROME` 覆盖。测试控制插件 `host-fixture.mjs` 只用于临时宿主，不安装到真实配置。

1. 推荐使用 [host-support 安装器](../../host-support/README.md)，两组加载同一支持层。以下 `prepare-*` 命令仅保留用于复现 V1。用 `prepare-host.mjs <已安装 session-controller 包目录> <新的 tmp 目标目录>` 创建输入捕获副本。原包不修改。需要跨退出队列验证时，另用 `prepare-loop.mjs <已安装 agent-loop 包目录> <新的 tmp 目标目录>` 创建保留 pending inbox 的副本。
2. 冻结基线/候选包并记录 hash。原基线见 `baseline-manifest.json`，是包含第一轮视觉改动的工作区归档，不能换成 Git HEAD。两组分别使用独立 DSH_HOME，同一测试工作区。
3. 创建权限 0600 的临时 provider JSON，字段为 `model: "deepseek-flash"`、DeepSeek Anthropic `baseURL`、`apiKey`。只在本机传文件路径，不把密钥放进 CLI 参数、题目或日志。
4. `WIDGET_EVAL_PYTHON=<venv>/bin/python WIDGET_EVAL_TOKENIZER=<tokenizer.json> node provider-proxy.mjs <私有配置路径> <root>/model-run <root>/plan.json` 启动预算代理，端口写入 `endpoint.json`。dsh 的 DeepSeek 配置指向 `<proxy-url>/anthropic/v1`，API key 环境变量只给占位值；实际凭据仅由代理转发。
5. 临时 patch 禁用原 `session-controller`，插入副本的 `lib/index.js`；分别加载冻结基线/候选插件，以及 `host-fixture.mjs`。普通 patch 的 `id/name` 组合不能替换包名，必须 disable + insert 新 id。禁用 `session-title-llm`、`session-log-deepseek`、`plugin-package-inventory-deepseek` 和遥测；两组配置一致。模型设置 deepseek-flash、thinking disabled、reasoningEffort off、maxTokens 6000、retryPolicy normal/maxRetries 0。
6. 两个 `dsh web --patch ... --port 0 --no-open` 的日志分别保存为 `<root>/baseline-host.log`、`<root>/host.log`。登录 URL 是临时凭据，不能提交或放进报告。

## 运行与审阅

```sh
node run-suite.mjs <root>
node check-negative-local.mjs <root>
node summarize.mjs <root>
```

从本目录执行，先将本轮冻结的 cases-v2.json 复制到 `<root>/plan.json`。也可使用 `run-episode.mjs <root> <baseline|candidate> <1|2> <case-id>`；已记录的 episode 禁止覆盖重跑。suite 按两轮交替顺序执行，达到预算预留线后给其余题目写入未运行记录。

driver 通过真实 dsh 会话发现 skill；不预载技能正文、不在题目指定 API、不修补模型生成的 HTML。浏览器只用原生可信操作改值、点确认。`controls.json` 保存读到的控件语义；允许人工辅助定位不同合法布局，必须登记，不能把未完成动作算通过。

正例如产生续答，需要人工逐条检查固定 answerOracle，并在该 episode 的 `oracle-review.json` 登记：

```json
{
  "providerSelectionCorrect": true,
  "normalizedSelection": { "hours": 30, "plan": "B" },
  "answerOracleChecks": [
    { "clause": "与 cases.json 完全相同的条目", "passed": true, "evidence": "实际 provider 请求/回答的文件及对应内容" }
  ]
}
```

示例省略其余条目；实际条数、顺序和内容必须与该题一致。不能因提交有回执、模型回复一句话或截图可见就填写 true。`summarize.mjs` 将未审阅或未运行的题目保留在分母中。

## 确定性链路

```sh
node check-host.mjs <host.log> <host-check.json>
node check-browser.mjs <root>
# 重启同一隔离 DSH_HOME 后：
node check-host.mjs <host.log> <cold-restart.json> <host-check.json>
node check-restart-queue.mjs <host.log> <queue.json> prepare
# 重启同一隔离 DSH_HOME 后：
node check-restart-queue.mjs <host.log> <queue.json> resume
```

这些检查使用可控 Adapter，不能计入模型质量分数。跨退出队列检查在原宿主应失败，安装临时 loop 修复后才通过。

V1 使用 UTF-8 bytes/3，偏保守导致预检误拒绝。V2 使用官方离线 tokenizer、固定 framing 和 8% 余量，并逐次记录实际 usage；详细冻结方法见 [V2 规格](../../docs/plans/2026-11-01-interaction-release-v2.md)。估算仍不是 API 精确计数。不要在失败后改变本轮通过线。

结束后关闭临时服务/代理，删除临时密钥与临时宿主凭据；归档只含已脱敏请求/回答、动作、输入记录、截图、版本和验证结果。真实用户配置与安装保持不变。

## 最新运行

V5的全部16个候选题次已完成，与V3完整冻结基线比较；结果见 [发布验收记录](../../docs/plans/2026-11-01-interaction-release-result.md)。V2无效轮与V3/V4失败均保留。`cases-v5.json` 是最新冻结规格；路径需按本机独立目录调整，不能复用他人的凭据。

`run-episode.mjs <root> <variant> <1|2> <case> --resume-ui` 仅在已有生成、尚未提交时完成语义定位辅助，不创建会话、不重发原题、不改HTML；保存原失败结果。代理 `--resume` 恢复原用量和每题计数，仅允许无未知用量的已停止实例；`WIDGET_EVAL_ADDITIONAL_REQUESTS` 可进一步降低本次恢复的请求上限。

## 用户消息与缓存前缀回归

当前宿主支持需 revision 2。`check-host.mjs <host.log> <output.json> "" fixture-no-history` 验证不声明 in-history 的线路；默认 `fixture` 验证声明该能力的线路。两者均比较实际 Adapter 请求中的旧消息前缀和工具定义，要求逐字不变，状态仅在新增用户消息中。保留 `.observed.json` 供失败定位。这是确定性链路检查，不能当作供应商缓存命中率或模型回答质量分数。跨重启队列命令保持不变。
