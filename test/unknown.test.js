'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { UnknownFrames, formatPorts } = require('../src/unknown');
const { makeSuppress } = require('../src/native');

const frame = Buffer.from("|ENG1|mB223,4:k7.]'tv`q|%||6|1|9:30|03:");

test('formatPorts compresses consecutive ports', () => {
  assert.equal(formatPorts([50100, 50102, 50101, 50110, 50103]), '50100-50103,50110');
  assert.equal(formatPorts([50100]), '50100');
});

test('a broadcast to many ports becomes one summary line', () => {
  const lines = [];
  const u = new UnknownFrames({ log: l => lines.push(l) });
  for (let p = 50100; p <= 50110; p++) {
    u.add({ src: '10.154.1.136', srcPort: 50100, dst: '255.255.255.255', dstPort: p, payload: frame });
  }
  u.flush();
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^\[parse\] not EFP 10\.154\.1\.136:50100 -> 255\.255\.255\.255:50100-50110 \(\d+ bytes, ENG1\) x11: \|ENG1\|/);
});

test('different senders or sizes stay separate; a single frame has no count', () => {
  const lines = [];
  const u = new UnknownFrames({ log: l => lines.push(l) });
  u.add({ src: '10.0.0.1', srcPort: 50100, dst: '10.0.0.2', dstPort: 50101, payload: frame });
  u.add({ src: '10.0.0.3', srcPort: 50100, dst: '10.0.0.2', dstPort: 50101, payload: frame });
  u.add({ src: '10.0.0.1', srcPort: 50100, dst: '10.0.0.2', dstPort: 50101, payload: Buffer.from('|XYZ|abc|') });
  u.flush();
  assert.equal(lines.length, 3);
  assert.ok(lines.every(l => !/ x\d+:/.test(l)));
});

test('unknown ports (replay) are simply omitted', () => {
  const lines = [];
  const u = new UnknownFrames({ log: l => lines.push(l) });
  u.add({ src: '10.0.0.1', dst: '10.0.0.2', payload: frame });
  u.flush();
  assert.match(lines[0], /10\.0\.0\.1 -> 10\.0\.0\.2 \(/);
});

test('the summary is emitted by itself after the flush delay', async () => {
  const lines = [];
  const u = new UnknownFrames({ log: l => lines.push(l), flushMs: 20 });
  u.add({ src: 'a', dst: 'b', payload: frame });
  await new Promise(r => setTimeout(r, 60));
  assert.equal(lines.length, 1);
});

test('suppress rule: normally all apparatus/*, with --force only the connection status', () => {
  const watcher = { blocks: id => id === '7' };
  const normal = makeSuppress(watcher, false);
  const forced = makeSuppress(watcher, true);
  assert.equal(normal('7', 'apparatus/clock'), true);
  assert.equal(normal('7', 'apparatus/connection'), true);
  assert.equal(normal('7', 'software/match'), false);
  assert.equal(normal('8', 'apparatus/clock'), false);
  assert.equal(forced('7', 'apparatus/clock'), false);
  assert.equal(forced('7', 'apparatus/connection'), true);
  assert.equal(forced('7', 'software/match'), false);
  assert.equal(forced('8', 'apparatus/connection'), false);
});
