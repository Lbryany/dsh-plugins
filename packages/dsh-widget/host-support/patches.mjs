// Reviewed dsh host versions. Each entry pins the exact upstream source (SHA-256 of lib/index.js)
// that the edits below were reviewed against; any other version or source is refused.
// Adding a version: diff the new upstream session-controller / agent-loop against the previous
// reviewed one, confirm the anchors still mean the same thing, then record the new fingerprints.
export const REVISION = '2';
function once(code, from, to) {
  if (code.split(from).length !== 2) throw new Error('Reviewed host shape changed');
  return code.replace(from, to);
}
// Input capture: identical anchors in 0.2.1-rc.5 and 0.2.2-rc.1 (SessionCommandController.prompt
// admission and the SessionController facade's prompt()).
function sessionController(code) {
  code = once(code, 'const message = createUserMessage({\n\t\t\t\t\t\tcontent: await this.ctx.attachments.admitPromptContent(admission.content),\n\t\t\t\t\t\tsource\n\t\t\t\t\t});',
    'const widgetContent = await this.ctx.attachments.admitPromptContent(admission.content);\n\t\t\t\t\tconst widgetMessage = { content: widgetContent, source };\n\t\t\t\t\tconst message = createUserMessage(this.widgetInputCaptureV2 ? this.widgetInputCaptureV2(agent, request, widgetMessage) : widgetMessage);');
  code = once(code, '\t\t\t\t\tbinding.commit();', '\t\t\t\t\tbinding.commit();\n\t\t\t\t\tif (this.widgetInputCaptureV2 && !await this.ctx.sessions.flush(agent.session)) throw new Error("Widget admission requires durable session storage");');
  return once(code, '\t\tasync prompt(request, signal) {', `\t\tregisterWidgetInputCaptureV2(capture) {
      if (this.commands.widgetInputCaptureV2) throw new Error('Widget capture already registered');
      this.commands.widgetInputCaptureV2 = capture;
      return () => { if (this.commands.widgetInputCaptureV2 === capture) this.commands.widgetInputCaptureV2 = undefined; };
    }
\t\tasync prompt(request, signal) {`);
}
// Queue retention: lifecycle disposal must keep the durable pending inbox. 0.2.1-rc.5 always
// cleared it; 0.2.2-rc.1 keeps it only when setup never finished (`!ready`) and still clears it
// on a normal lifecycle exit, so the widget edit is still required. Explicit user/archive cancel
// paths are unchanged in both versions.
const agentLoop = from => code => once(code, from, 'machine.cancel({ kind: "disposed" }, { keepInbox: true });');
export const REVIEWED_HOSTS = {
  '0.2.1-rc.5': {
    'dsh-api-session-controller': { sha256: 'a9801acb577b03053c5d5a3191ff555c5f1d791d0acddec113bea4511e33b386', apply: sessionController },
    'dsh-agent-loop': { sha256: 'cf57e3ecd487ac5c2553455aaa5cef2c6fb41e6bd61be5aa455675d1d7193033', apply: agentLoop('machine.cancel({ kind: "disposed" });') },
  },
  '0.2.2-rc.1': {
    'dsh-api-session-controller': { sha256: '4cf6c66e65cce865d270fa89405b96d048ffa62e493e4ffbd1a826be2207a4cd', apply: sessionController },
    'dsh-agent-loop': { sha256: 'a6fa8e0c7c90191caf5f4a3bb5c624a86e9845cf3c79d020b71420d0e20ae4c1', apply: agentLoop('machine.cancel({ kind: "disposed" }, { keepInbox: !ready });') },
  },
};
export const HOST_VERSIONS = Object.keys(REVIEWED_HOSTS);
const TARGETS = [
  { name: 'dsh-api-session-controller', directory: 'session-controller', id: 'session-controller' },
  { name: 'dsh-agent-loop', directory: 'agent-loop', id: 'agent-loop' },
];
/** Patch list for one reviewed host version; throws for any other version. */
export function patchesFor(version) {
  const reviewed = REVIEWED_HOSTS[version];
  if (!reviewed) throw new Error('Unsupported dsh version ' + version + '; reviewed: ' + HOST_VERSIONS.join(', '));
  return TARGETS.map(t => ({ ...t, ...reviewed[t.name] }));
}
export const BLOCK_TITLE = 'dsh-widget interaction host support';
