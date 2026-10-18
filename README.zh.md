# dsh-plugins

Lbryany 的 [DeepSeek Harness（dsh）](https://www.npmjs.com/package/@deepseek-ai/dsh) 插件集合。一个插件一个目录，放在 `packages/` 下，各自单独打 tag 发布：tag 名是 `<包目录名>-v<版本>`。

## 插件

| 插件 | 目录 | 说明 |
|---|---|---|
| `@lbryany/dsh-peer` | [packages/dsh-peer](packages/dsh-peer) | 同机 dsh 会话之间的发现与消息投递（`peer_list` / `peer_send` / `peer_rename`） |

## 安装

推荐从 dsh 的插件市场安装，索引见 [dsh-plugin-market](https://github.com/Lbryany/dsh-plugin-market)。

也可以手动装到某个 profile：

1. 在 `~/.dsh/profiles/<p>/package.json` 的 `dependencies` 里加一项，从 git 安装并指定子目录，例如：
   ```
   "@lbryany/dsh-peer": "github:Lbryany/dsh-plugins#dsh-peer-v0.1.0&path:packages/dsh-peer"
   ```
   用 pnpm 时写法见 pnpm 文档里 git 子目录依赖的部分。
2. 在 `dsh.profile.bundles` 末尾加上包名。
3. 运行 `pnpm install`，然后重启这个 profile 的 dsh。

每个插件的用法见它目录里的 `README.zh.md`。

## 开发

各插件互相独立，没有共享的构建步骤。在插件目录里运行 `npm run check`，打 tag 之前必须先跑通。

## 许可

MIT
