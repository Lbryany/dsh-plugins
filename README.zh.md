# dsh-plugins

Lbryany 的 [DeepSeek Harness（dsh）](https://www.npmjs.com/package/@deepseek-ai/dsh) 插件集合与插件市场索引：
- 插件一个一个目录放在 `packages/` 下，各自单独打 tag 发布，tag 名是 `<包目录名>-v<版本>`；
- 市场索引的生成器在 `market/`。

插件市场索引 URL：**`https://lbryany.github.io/dsh-plugins/index.json`**。在 dsh web 左侧「发现」页 →「索引源」里粘贴这个 URL，就能直接从发现页安装下面的插件。

## 插件

| 插件 | 目录 | 说明 |
|---|---|---|
| `@lbryany/dsh-herdr` | [packages/dsh-herdr](packages/dsh-herdr) | 会话生命周期状态同步到 Herdr（无界面） |
| `@lbryany/dsh-peer` | [packages/dsh-peer](packages/dsh-peer) | 同机 dsh 会话之间的发现与消息投递（`peer_list` / `peer_send` / `peer_rename`） |

dsh-herdr 原来在独立仓库（已归档），2026-10-19 连同提交历史迁入本仓库。

## 安装

推荐从 dsh 的插件市场安装，索引 URL 见上。

也可以手动装到某个 profile：

1. 在 `~/.dsh/profiles/<p>/package.json` 的 `dependencies` 里加一项，用 pnpm 的 git 子目录写法：
   ```
   "@lbryany/dsh-peer": "github:Lbryany/dsh-plugins#dsh-peer-v0.1.0&path:/packages/dsh-peer"
   ```
2. 在 `dsh.profile.bundles` 末尾加上包名。
3. 运行 `pnpm install`，然后重启这个 profile 的 dsh。

每个插件的用法见它目录里的 `README.zh.md`。

## 开发

各插件互相独立，没有共享的构建步骤：
- dsh-herdr 是 TypeScript，用 tsdown 构建，构建产物 `lib/` 提交在仓库里；
- dsh-peer 是纯 JS。

在插件目录里运行 `npm run check`（有 `package-lock.json` 的先 `npm ci`），打 tag 之前必须先跑通。CI（`.github/workflows/ci.yml`）在 push 和 PR 时对每个插件都跑一遍，并核对提交的 `lib/` 与构建结果一致。

发布一个插件版本的步骤：
1. 改 `packages/<名>/package.json` 的 `version`；
2. 跑 `npm run check`，提交；
3. 打 tag `<名>-v<版本>` 并 push；
4. 市场索引每天自动重新生成；要立刻生效，就手动触发 Pages 工作流。

新插件要在 `market/plugins.json` 里加一条，带 `dir`，规则见 [market/README.md](market/README.md)。

## 目录

```
packages/<插件>/          各插件（独立的 package.json、测试、构建）
market/                   市场索引生成器、收录清单 plugins.json、单测
.github/workflows/ci.yml  各插件检查
.github/workflows/pages.yml  生成索引 → 部署 Pages → 线上自检
```

## 许可

MIT
