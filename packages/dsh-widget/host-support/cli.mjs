#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { spawn } from 'node:child_process';
import { install, doctor, rollback, disable, profileBlock } from './install.mjs';
const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  'host-root': { type: 'string' }, target: { type: 'string' }, 'dsh-home': { type: 'string' },
  port: { type: 'string', default: '0' }, patch: { type: 'string', multiple: true, default: [] },
} });
const command = positionals[0];
if (!values.target || !['install', 'doctor', 'rollback', 'disable', 'profile-block', 'web'].includes(command)) throw new Error('Usage: dsh-widget-host install --host-root PATH --target DIR | doctor/rollback/disable/profile-block --target DIR | web --target DIR --dsh-home DIR [--port 0] [--patch FILE]');
if (command === 'install') {
  if (!values['host-root']) throw new Error('--host-root is required');
  console.log(JSON.stringify(await install({ hostRoot: values['host-root'], target: values.target }), null, 2));
} else if (command === 'profile-block') {
  process.stdout.write(await profileBlock(values.target));
} else if (command !== 'web') {
  console.log(JSON.stringify(await ({ doctor, rollback, disable }[command])(values.target), null, 2));
} else {
  const supported = await doctor(values.target);
  if (supported.disabled) throw new Error('Host support is disabled');
  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535 || [3080, 3091].includes(port)) throw new Error('Choose an unreserved port, or 0 for a random port');
  if (!values['dsh-home']) throw new Error('Use an explicit dedicated --dsh-home');
  const home = resolve(values['dsh-home']), original = resolve(homedir(), '.dsh');
  if (home === original || home.startsWith(original + '/')) throw new Error('Use a dedicated DSH_HOME, not ~/.dsh');
  await mkdir(home, { recursive: true });
  const actual = await realpath(home);
  if (actual === original || actual.startsWith(original + '/')) throw new Error('DSH_HOME resolves into ~/.dsh');
  const widget = fileURLToPath(new URL('../lib/index.js', import.meta.url));
  const entry = join(supported.target, `.launch-${process.pid}.yml`);
  await writeFile(entry, `- id: dsh-widget\n  disabled: true\n- insert:\n    - id: widget-supported\n      name: ${JSON.stringify(widget)}\n`, { flag: 'wx' });
  const args = [join(supported.hostRoot, 'lib/bin.js'), 'web', '--patch', supported.patch, '--patch', entry];
  for (const patch of values.patch) args.push('--patch', resolve(patch));
  args.push('--port', String(port), '--no-open');
  try {
    const child = spawn(process.execPath, args, { stdio: 'inherit', env: { ...process.env, DSH_HOME: actual } });
    const stop = signal => child.kill(signal);
    const onInt = () => stop('SIGINT'), onTerm = () => stop('SIGTERM');
    process.on('SIGINT', onInt); process.on('SIGTERM', onTerm);
    const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => resolve(code)); });
    process.off('SIGINT', onInt); process.off('SIGTERM', onTerm);
    process.exitCode = code ?? 0;
  } finally { await rm(entry, { force: true }); }
}
