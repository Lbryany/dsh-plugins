import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseUsage } from './provider-accounting.mjs';
test('uses final cumulative usage, includes cache reads once, and requires completion', () => {
  const stream = 'event: message_start\ndata: {"message":{"usage":{"input_tokens":8,"output_tokens":1}}}\n\nevent: message_delta\ndata: {"usage":{"input_tokens":10,"cache_read_input_tokens":20,"output_tokens":7}}\n\nevent: message_stop\ndata: {"type":"message_stop"}\n\n';
  assert.deepEqual(parseUsage(stream), { input: 30, output: 7, usage: { input_tokens: 10, cache_read_input_tokens: 20, output_tokens: 7 }, complete: true });
  assert.equal(parseUsage(stream.split('event: message_stop')[0]).complete, false);
});
test('does not mistake an error-only or partial stream for a successful paid completion', () => {
  assert.equal(parseUsage('data: {"error":{"message":"connection lost"}}\n\n').complete, false);
  assert.equal(parseUsage('event: message_stop\ndata: {"type":"message_stop"}\n\n').complete, false);
});
