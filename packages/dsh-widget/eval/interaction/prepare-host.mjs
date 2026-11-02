// Create an isolated, version-checked host extension. Never edit installed packages.
import { cp, mkdir, readFile, writeFile, symlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
const [sourceArg, targetArg] = process.argv.slice(2);
if (!sourceArg || !targetArg) throw new Error('Usage: prepare-host.mjs installed-controller-package fresh-target');
const source = resolve(sourceArg), target = resolve(targetArg);
if (!target.startsWith('/private/tmp/') && !target.startsWith('/tmp/')) throw new Error('Isolated target must be under tmp');
const pkg = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'));
if (pkg.name !== '@deepseek-ai/dsh-api-session-controller' || pkg.version !== '0.2.1-rc.5') throw new Error('Unreviewed host version');
let code = await readFile(join(source, 'lib/index.js'), 'utf8');
const originalHash = createHash('sha256').update(code).digest('hex');
function replaceOnce(from, to) {
  if (code.split(from).length !== 2) throw new Error('Host shape changed: ' + from.slice(0, 90));
  code = code.replace(from, to);
}
replaceOnce('const message = createUserMessage({\n\t\t\t\t\t\tcontent: await this.ctx.attachments.admitPromptContent(admission.content),\n\t\t\t\t\t\tsource\n\t\t\t\t\t});',
  'const widgetContent = await this.ctx.attachments.admitPromptContent(admission.content);\n\t\t\t\t\tconst message = createUserMessage({ content: widgetContent, source: this.widgetInputCapture ? this.widgetInputCapture(agent, request, source) : source });');
replaceOnce('\t\t\t\t\tbinding.commit();', '\t\t\t\t\tbinding.commit();\n\t\t\t\t\tif (this.widgetInputCapture && !await this.ctx.sessions.flush(agent.session)) throw new Error("Widget admission requires durable session storage");');
replaceOnce('\t\tasync prompt(request, signal) {', `\t\tregisterWidgetInputCapture(capture) {
      if (this.commands.widgetInputCapture) throw new Error('Widget capture already registered');
      this.commands.widgetInputCapture = capture;
      return () => { if (this.commands.widgetInputCapture === capture) this.commands.widgetInputCapture = undefined; };
    }
\t\tasync prompt(request, signal) {`);
await mkdir(target, { recursive: false });
await cp(source, target, { recursive: true, filter: path => path !== join(source, 'node_modules') });
await writeFile(join(target, 'lib/index.js'), code);
await symlink(resolve(source, '../..'), join(target, 'node_modules'), 'dir');
await writeFile(join(target, 'widget-extension.json'), JSON.stringify({ version: 1, package: pkg.name, packageVersion: pkg.version, source, originalHash, patchedHash: createHash('sha256').update(code).digest('hex') }, null, 2));
console.log(JSON.stringify({ target, version: pkg.version, originalHash }));
