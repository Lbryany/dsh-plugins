// 开发用：把本包 node_modules/@deepseek-ai/<pkg> 逐个链到本机已安装 dsh 里的同名包，测试才能离线用真的 dsh 跑。
// 只链单个包目录，不链整个 node_modules：误跑 npm install 也写不进全局 dsh。
// 找 dsh：DSH_INSTALL_DIR（@deepseek-ai/dsh 包目录）> DSH_BIN（lib/bin.js）> npm root -g 下的 @deepseek-ai/dsh；前两个设了就只认它，指错直接报错
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, symlinkSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PKGS = ['cordis', 'dsh-agent', 'dsh-compaction-basic', 'dsh-llm', 'dsh-scope', 'dsh-session', 'dsh-token-meter'];
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// dsh 的包要么嵌在它自己的 node_modules 里（npm i -g），要么与它平级（npm i --prefix 的扁平安装）
function scopeOf(dir) {
  for (const scope of [join(dir, 'node_modules', '@deepseek-ai'), dirname(dir)]) {
    if (existsSync(join(scope, 'dsh-compaction-basic', 'package.json'))) return scope;
  }
  return null;
}

function dshInstall() {
  // 显式指定了就只认它：指错了直接报错，不悄悄退回全局 dsh（否则会拿别的版本跑出假绿）
  const explicit = process.env.DSH_INSTALL_DIR ? ['DSH_INSTALL_DIR', process.env.DSH_INSTALL_DIR]
    : process.env.DSH_BIN ? ['DSH_BIN', dirname(dirname(process.env.DSH_BIN))] : null;
  if (explicit) {
    const scope = scopeOf(explicit[1]);
    if (!scope) throw new Error(`${explicit[0]} 指向的 ${explicit[1]} 不是可用的 @deepseek-ai/dsh 包目录（嵌套与扁平布局里都没有 dsh-compaction-basic）`);
    return { dir: explicit[1], scope };
  }
  let g = null;
  try { g = execFileSync('npm', ['root', '-g'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { /* 没有 npm */ }
  const dir = g && join(g, '@deepseek-ai', 'dsh');
  const scope = dir && scopeOf(dir);
  if (!scope) throw new Error(`找不到已安装的 dsh（试过 ${dir || 'npm root -g（npm 不可用）'}）；请设置 DSH_INSTALL_DIR 指向 @deepseek-ai/dsh 包目录`);
  return { dir, scope };
}

const { dir: install, scope } = dshInstall();
const target = join(root, 'node_modules', '@deepseek-ai');
mkdirSync(target, { recursive: true });
for (const pkg of PKGS) {
  const from = join(scope, pkg);
  if (!existsSync(from)) throw new Error(`dsh 安装目录里没有 ${pkg}：${from}`);
  const link = join(target, pkg);
  try { if (lstatSync(link)) unlinkSync(link); } catch { /* 不存在 */ }
  symlinkSync(from, link, 'dir');
}
const version = JSON.parse(readFileSync(join(install, 'package.json'), 'utf8')).version;
console.log(`linked ${PKGS.join(', ')} -> ${scope} (dsh ${version})`);
