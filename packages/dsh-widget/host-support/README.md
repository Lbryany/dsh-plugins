# 可回退的交互宿主支持

普通 widget 卡片可独立安装。将控件选择作为同一会话的持久输入，需要宿主的输入捕获钩子和退出时保留待执行队列。本目录为已审阅的 **dsh 0.2.1-rc.5** 与 **dsh 0.2.2-rc.1** 提供独立安装方式（当前 revision 2）；不是上游已经发布的 API。

安装器验证宿主版本及两个目标文件（`dsh-api-session-controller`、`dsh-agent-loop` 的 `lib/index.js`）的 SHA-256，复制到独立目录后修改副本，不修改全局安装。其他版本、源文件变化或副本损坏均拒绝启动。审阅过的版本与指纹见 `patches.mjs` 的 `REVIEWED_HOSTS`。

## 改了什么、为什么要替换整个插件

| 插件 | 改动 | 原因 |
| --- | --- | --- |
| `dsh-api-session-controller` | 加 `registerWidgetInputCaptureV2(capture)`；用户输入准入时把 content 与 source 交给 capture，提交后 `sessions.flush` 确保落盘 | 上游没有输入捕获扩展点 |
| `dsh-agent-loop` | 生命周期释放时 `cancel(..., { keepInbox: true })` | 0.2.1-rc.5 总是清空待执行队列；0.2.2-rc.1 改成 `keepInbox: !ready`，只在启动未完成时保留，正常退出仍清空，所以仍需改 |

两处都在模块内部，没有可注册的替代扩展点，所以只能禁用自带插件、插入改过的副本。副本保留上游 `package.json`，其 `@deepseek-ai/dsh-*` peer 精确等于宿主版本，dsh 的插件兼容检查只在**同一宿主版本**下接受它。

## 每次升级 dsh 后

旧版本的支持层在新宿主下会被 dsh 以 `incompatible` 跳过，网页端失去 sessions 服务（`web boot: N entries did not activate`）。升级后：

```sh
# 将路径换成你的实际安装位置；目标目录的父目录必须已存在。
dsh-widget-host install --host-root /opt/homebrew/lib/node_modules/@deepseek-ai/dsh --target "$HOME/dsh-widget-support"
dsh-widget-host doctor --target "$HOME/dsh-widget-support"
# 输出带 BEGIN/END 标记和审阅版本的 profile 补丁块
dsh-widget-host profile-block --target "$HOME/dsh-widget-support"
```

把 `profile-block` 的输出整段替换 profile `cordis.patch.yml` 里旧的 `# BEGIN dsh-widget interaction host support …` 到 `# END dsh-widget interaction host support` 块（先备份）。块首行写明审过的 dsh 版本、revision 与 release。新 dsh 版本若未在 `REVIEWED_HOSTS` 中，install 会拒绝：须先审阅新上游源码并更新安装器，不能绕过校验；此时可暂时删掉该块退回普通宿主（卡片仍可用，没有新提交按钮）。

## 独立试用

```sh
# 单独配置目录，配置自己的模型；不要复制整个用户目录。
dsh-widget-host web --target "$HOME/dsh-widget-support" --dsh-home "$HOME/dsh-widget-profile" --port 0
```

`web` 自动挂载支持层和当前包的 widget。`--patch FILE` 可重复指定额外配置。为避免误改既有服务，启动器拒绝真实 `~/.dsh`（包括符号链接）及 3080/3091；默认使用随机回环端口。测试控制插件不在发布包内。

## 回滚与禁用

安装重复执行不变更已有版本；对另一份符合审阅指纹的宿主安装执行 install，会保留前一激活版本。停止服务后可执行：

```sh
dsh-widget-host rollback --target "$HOME/dsh-widget-support"
dsh-widget-host disable --target "$HOME/dsh-widget-support"
```

rollback 恢复上一安装版本；首次安装没有上一版本时会明确报错。上一版本绑定旧宿主版本，宿主已升级时 doctor 会拒绝它（`Host version changed …; run install for the new host`）。disable 取消支持层激活，随后 web 会拒绝启动。两个操作均不删除独立配置中的会话数据，也不改变正在运行的服务或 profile；重启后生效。切换期间如果中断导致激活记录与 patch 不一致，doctor 拒绝启动，重新 install 可恢复一致状态。

副本依赖审阅宿主的 node_modules（符号链接）。不要删除该宿主目录；迁移路径后重新安装。安装记录、源文件和副本可用 doctor 校验，但这不等于支持未经评测的新宿主版本。

revision 2 使用 `registerWidgetInputCaptureV2`，在用户输入准入时一起提交 content 与 source metadata。需同步升级 widget 与支持层；revision 1 不提供新版提交能力。升级支持层保留上一激活版本；回退时也应恢复对应旧 widget 包。
