export const HOST_VERSION = '0.2.1-rc.5';
export const REVISION = '2';
function once(code, from, to) {
  if (code.split(from).length !== 2) throw new Error('Reviewed host shape changed');
  return code.replace(from, to);
}
export const patches = [
  { name: 'dsh-api-session-controller', directory: 'session-controller', id: 'session-controller',
    sha256: 'a9801acb577b03053c5d5a3191ff555c5f1d791d0acddec113bea4511e33b386',
    apply(code) {
      code = once(code, 'const message = createUserMessage({\n\t\t\t\t\t\tcontent: await this.ctx.attachments.admitPromptContent(admission.content),\n\t\t\t\t\t\tsource\n\t\t\t\t\t});',
        'const widgetContent = await this.ctx.attachments.admitPromptContent(admission.content);\n\t\t\t\t\tconst widgetMessage = { content: widgetContent, source };\n\t\t\t\t\tconst message = createUserMessage(this.widgetInputCaptureV2 ? this.widgetInputCaptureV2(agent, request, widgetMessage) : widgetMessage);');
      code = once(code, '\t\t\t\t\tbinding.commit();', '\t\t\t\t\tbinding.commit();\n\t\t\t\t\tif (this.widgetInputCaptureV2 && !await this.ctx.sessions.flush(agent.session)) throw new Error("Widget admission requires durable session storage");');
      return once(code, '\t\tasync prompt(request, signal) {', `\t\tregisterWidgetInputCaptureV2(capture) {
      if (this.commands.widgetInputCaptureV2) throw new Error('Widget capture already registered');
      this.commands.widgetInputCaptureV2 = capture;
      return () => { if (this.commands.widgetInputCaptureV2 === capture) this.commands.widgetInputCaptureV2 = undefined; };
    }
\t\tasync prompt(request, signal) {`);
    },
  },
  { name: 'dsh-agent-loop', directory: 'agent-loop', id: 'agent-loop',
    sha256: 'cf57e3ecd487ac5c2553455aaa5cef2c6fb41e6bd61be5aa455675d1d7193033',
    apply: code => once(code, 'machine.cancel({ kind: "disposed" });', 'machine.cancel({ kind: "disposed" }, { keepInbox: true });'),
  },
];
