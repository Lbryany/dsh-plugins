// 开发用：把仓库根 node_modules/@deepseek-ai/<pkg> 链到本机 dsh 安装目录里的同名包，index.js 才能 import dsh-llm / dsh-tools。
// 找 dsh：环境变量 DSH_BIN（lib/bin.js 绝对路径）> 与 node 同前缀的全局安装位置
import { existsSync, lstatSync, mkdirSync, symlinkSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PKGS = ['dsh-llm', 'dsh-tools'];
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function dshBin() {
  const env = process.env.DSH_BIN;
  if (env && existsSync(env)) return env;
  const fallback = process.platform === 'win32'
    ? join(process.env.APPDATA || '', 'npm', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
    : join(dirname(process.execPath), '..', 'lib', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
  if (existsSync(fallback)) return fallback;
  throw new Error(`找不到 dsh 的 lib/bin.js（试过 ${fallback}）；请设置环境变量 DSH_BIN`);
}

const scope = join(dirname(dirname(dshBin())), 'node_modules', '@deepseek-ai');
const target = join(root, 'node_modules', '@deepseek-ai');
mkdirSync(target, { recursive: true });
for (const pkg of PKGS) {
  const from = join(scope, pkg);
  if (!existsSync(from)) throw new Error(`dsh 安装目录里没有 ${pkg}：${from}`);
  const link = join(target, pkg);
  try { if (lstatSync(link)) unlinkSync(link); } catch { /* 不存在 */ }
  symlinkSync(from, link, 'dir');
  console.log(`${link} -> ${from}`);
}
