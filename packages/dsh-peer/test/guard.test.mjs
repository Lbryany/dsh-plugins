import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGuard } from '../lib/guard.js';
test('G11 reentrant reservations and rollback remain bounded', () => {
  const g = createGuard({ shortLimit: 1, longLimit: 1 });
  const a = g.reserve('a','b','one',false); assert.equal(a.ok,true);
  assert.equal(g.reserve('a','b','two',false).error,'rate-limited');
  a.rollback(); const b=g.reserve('a','b','one',false); assert.equal(b.ok,true); b.commit(); b.commit();
  assert.equal(g.status('b')[0].count,1); assert.equal(g.reserve('a','b','two',false).error,'conversation-paused');
});
test('G11 fingerprint capacity and reclamation at expiry', () => {
  let time=0; const g=createGuard({now:()=>time,maxPairs:1,maxFingerprints:1});
  g.reserve('a','b','one',false).commit();
  assert.equal(g.reserve('a','b','two',false).error,'guard-capacity');
  time=60000; g.reserve('a','b','two',false).commit();
  assert.equal(g.reserve('c','b','x',false).error,'guard-capacity');
  time=660000; assert.equal(g.reserve('c','b','x',false).ok,true);
});
test('G12 monotonic rollback and reset', () => {
  let time=100; const g=createGuard({now:()=>time,shortLimit:1,longLimit:1});
  g.reserve('a','b','one',false).commit(); time=-100000;
  assert.equal(g.reserve('a','b','two',false).error,'conversation-paused');
  time=1e12; assert.equal(g.reserve('a','b','three',false).error,'conversation-paused');
  g.clear(); assert.equal(g.reserve('a','b','three',false).ok,true);
});
test('user-configured protection off and invalid config', () => {
  const g=createGuard({enabled:false}); for(let i=0;i<100;i++) g.reserve('a','b','same',false).commit();
  assert.deepEqual(g.status('b'),[]);
  for(const options of [{longLimit:65},{shortMs:0},{shortLimit:13},{maxPairs:1025}]) assert.throws(()=>createGuard(options));
});
