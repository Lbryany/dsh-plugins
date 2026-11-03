import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createPeerClient } from '../src/client.js';
test('H10 hub binaries are packaged at 0.2.0 and centre acceptance is not delivery', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
  assert.equal(pkg.version, '0.2.0');
  assert.equal(pkg.bin['dsh-peer-hub'], './bin/hub.js');
  assert.ok(pkg.files.includes('bin'));
  assert.ok(pkg.files.includes('docs/hub.md') && pkg.files.includes('docs/hub.zh.md'), 'installed README guides must be packaged');
  assert.ok(existsSync(new URL('../lib/hub/web/index.html', import.meta.url)));
  const { PeerSendResult } = createPeerClient(React);
  const html = renderToStaticMarkup(React.createElement(PeerSendResult, { phase: 'result', block: { meta: { peer: { version: 1, target: { name: 'reviewer' }, outcome: 'accepted', text: 'check' } }, content: [] } }));
  assert.match(html, /中心已受理/);
});
