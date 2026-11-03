#!/usr/bin/env node
// Experimental channel adapter. Contract-tested without invoking Claude Code.
import { randomUUID } from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createHubClient } from '../lib/hub/client.js';
import { createClaudeBridge, CLAUDE_TOOLS, CLAUDE_INSTRUCTIONS } from '../lib/hub/claude.js';

const credentialFile = process.env.DSH_PEER_CREDENTIAL;
if (!credentialFile) throw new Error('Set DSH_PEER_CREDENTIAL to a private paired credential file');
const sessionId = process.env.DSH_PEER_SESSION_ID || `claude-${randomUUID()}`;
const name = process.env.DSH_PEER_NAME || 'claude';
const client = createHubClient({ credentialFile });
const server = new Server({ name: 'dsh-peer', version: '0.2.0' }, { capabilities: { tools: {}, experimental: { 'claude/channel': {} } }, instructions: CLAUDE_INSTRUCTIONS });
const bridge = createClaudeBridge({ client, sessionId, notify: event => server.notification(event) });
const sync = () => client.rpc('sessions.sync', { sessions: [{ id: sessionId, name, runtime: 'claude-code', cwd: process.cwd(), status: 'idle' }] });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: CLAUDE_TOOLS }));
server.setRequestHandler(CallToolRequestSchema, async request => {
  const r = await bridge.call(request.params.name, request.params.arguments || {});
  return { isError: !r.ok, content: [{ type: 'text', text: JSON.stringify(r) }] };
});
let timer;
server.oninitialized = () => { void (async () => {
  await client.start(() => bridge.wake(), sync); await sync(); await bridge.wake();
  timer = setInterval(() => { void sync().then(() => bridge.wake()).catch(() => {}); }, 10000); timer.unref();
})().catch(error => console.error(`[dsh-peer] ${error.message}`)); };
const stop = async () => { clearInterval(timer); await client.stop(); await server.close(); };
process.once('SIGTERM', stop); process.once('SIGINT', stop); process.stdin.once('end', stop);
await server.connect(new StdioServerTransport());
