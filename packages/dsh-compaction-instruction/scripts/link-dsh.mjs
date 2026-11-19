// 开发用：把本包 node_modules/@deepseek-ai/<pkg> 逐个链到本机已安装 dsh 里的同名包，测试才能离线用真的 dsh 跑。
// 只链单个包目录，不链整个 node_modules：误跑 npm install 也写不进全局 dsh。
// 找 dsh：DSH_INSTALL_DIR（@deepseek-ai/dsh 包目录）> DSH_BIN（lib/bin.js）> npm root -g 下的 @deepseek-ai/dsh
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, symlinkSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PKGS = ['cordis', 'dsh-agent', 'dsh-compaction-basic', 'dsh-llm', 'dsh-scope'];
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function dshInstallDir() {
  const tried = [];
  const candidates = [];
  if (process.env.DSH_INSTALL_DIR) candidates.push(process.env.DSH_INSTALL_DIR);
  if (process.env.DSH_BIN) candidates.push(dirname(dirname(process.env.DSH_BIN)));
  try {
    const g = execFileSync('npm', ['root', '-g'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    candidates.push(join(g, '@deepseek-ai', 'dsh'));
  } catch { /* 没有 npm */ }
  for (const dir of candidates) {
    tried.push(dir);
    if (existsSync(join(dir, 'node_modules', '@deepseek-ai', 'dsh-compaction-basic'))) return dir;
  }
  throw new Error(`找不到已安装的 dsh（试过 ${tried.join('、') || '无'}）；请设置 DSH_INSTALL_DIR 指向 @deepseek-ai/dsh 包目录`);
}

const install = dshInstallDir();
const scope = join(install, 'node_modules', '@deepseek-ai');
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
