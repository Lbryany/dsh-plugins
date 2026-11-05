import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createPeerClient } from '../src/client.js';
test('H10 package keeps only the dsh plugin; the centre and its client come from peer-hub', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
  assert.equal(pkg.version, '0.4.1');
  assert.equal(pkg.bin, undefined, 'hub and Claude binaries moved to peer-hub');
  assert.equal(pkg.peerDependencies['@lbryany/peer-hub-client'], '>=0.4.0 <0.5.0');
  assert.equal(pkg.peerDependenciesMeta['@lbryany/peer-hub-client'].optional, true);
  assert.ok(pkg.files.includes('docs/hub.md') && pkg.files.includes('docs/hub.zh.md'), 'installed README guides must be packaged');
  assert.equal(existsSync(new URL('../lib/hub/server.js', import.meta.url)), false);
  const { PeerSendResult } = createPeerClient(React);
  const html = renderToStaticMarkup(React.createElement(PeerSendResult, { phase: 'result', block: { meta: { peer: { version: 1, target: { name: 'reviewer' }, outcome: 'accepted', text: 'check' } }, content: [] } }));
  assert.match(html, /中心已受理/);
});
