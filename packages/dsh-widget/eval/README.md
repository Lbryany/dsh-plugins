# 可视化对照

交互结果回流模型的新一轮设计见 [设计与通过线](../docs/plans/2026-11-01-interaction-design.md)，固定题目见 [interaction/cases.json](interaction/cases.json)。这一轮尚未实施或运行，需要真实隔离 dsh 会话 driver；下述 `run.mjs` 只用于第一轮视觉资源对照，不能证明新一轮的自动技能发现、提交快照或队列语义。

冻结规格见 [第一轮规格](../docs/plans/2026-11-01-visual-quality.md)，题目见 [cases.json](cases.json)。这六题与模板同题，用于验证资源支架和交互，不证明对陌生任务的泛化，也不等于 Opus 盲评。

## 生成

在包目录运行（Node 22+）：

```sh
node eval/run.mjs /absolute/private/provider.json /absolute/fresh-output
```

外部私有 JSON 含 `model: "deepseek-flash"`、`baseURL`（Messages API 根路径）、`apiKey`。权限建议 0600，不能提交到仓库；脚本不读取用户的 dsh 配置，也不记录请求头。应只向自己信任的提供方地址发送。使用 fresh-output，已有 plan.json 会拒绝覆盖。

输出保存每题的实际输入、原始响应、JSON 产物、模型用量和状态。基线从冻结 Git 提交读取；被测使用工作区资源。先基线后被测逐题运行，固定温度 0.5、关闭 thinking、每次最多 8000 输出 token。每次完整响应后检查 16000 输入 token 上限（不是服务端输入硬限），超限即停；总量计 Messages API 非缓存输入、缓存读取、缓存写入与输出之和。网络或提供方失败不自动重试，保留失败再停。

生成评测直接调用 API，完整资源预先载入，因此不测 dsh 自动发现技能或多轮修复行为。它不需要启动 dsh，也不占用用户服务端口。

## 浏览器验证

使用已安装的 Playwright，或通过 `VQ_PLAYWRIGHT_MODULE` 指定其入口文件；`VQ_CHROME` 可指定 Chrome 可执行文件。脚本只监听随机回环端口并在结束时关闭。

```sh
node eval/check-browser.mjs /absolute/template-screenshots
node eval/check-browser.mjs /absolute/generated-screenshots /absolute/fresh-output
node eval/check-interactions.mjs /absolute/fresh-output
```

模板检查 6 × 2 主题 × 2 尺寸 = 24 个画面；生成结果完整时检查 48 个画面。基线使用旧 PAGE_CSS，被测用当前 PAGE_CSS。记录脚本异常、水平溢出和 fragment lint，截图供人工检查碰撞、留白和层级。这是独立 frame 文档检查，不能替代完整 dsh 中的桥、流式预览和会话重放测试；这些由包内原有测试覆盖。

## 判定

JSON 可解析、lint 通过、没有溢出都不等于数据正确或视觉优秀。按 cases.json 的 check 操作关键控件、核对全部联动结果，再按规格评画面；不修补模型生成物来使原 run 通过。截图评审和模型用量分别登记。没有独立盲评或 Opus 参考时，明确保留这个缺口。

`check-interactions.mjs` 保存操作前后的可见文本和自动断言；文本命中仍需人工核对，不能单独证明 canvas 数据或图形比例正确。第一轮发现看板题的“两行明细”检查拒绝了基线的等价横向表格，原失败保留，不能把它作为新版数据正确性优于基线的证据。
