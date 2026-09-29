'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const dgram  = require('dgram');
const { startListen, parsePorts, preview } = require('../src/capture/listen');

test('parsePorts accepts a comma-separated list and rejects anything else', () => {
  assert.deepEqual(parsePorts('50100'), [50100]);
  assert.deepEqual(parsePorts('50100, 50101'), [50100, 50101]);
  assert.equal(parsePorts('abc'), null);
  assert.equal(parsePorts('70000'), null);
  assert.equal(parsePorts(''), null);
});

test('preview escapes control bytes and truncates', () => {
  assert.equal(preview(Buffer.from('|EFP1.1|\r\n')), '|EFP1.1|\\x0d\\x0a');
  assert.equal(preview(Buffer.from('x'.repeat(20)), 5), 'xxxxx...');
});

test('a forwarded datagram reaches onPacket with its sender', async () => {
  const frame = '|EFP1.1|HELLO|1|efj-eq|%|';
  let resolve;
  const got = new Promise(r => { resolve = r; });
  const lines = [];
  const l = await startListen({ ports: [0], host: '127.0.0.1' }, resolve, line => lines.push(line));
  const sender = dgram.createSocket('udp4');
  sender.send(frame, l.ports[0], '127.0.0.1');
  const p = await got;
  sender.close();
  l.close();
  assert.equal(p.src, '127.0.0.1');
  assert.equal(p.dstPort, l.ports[0]);
  assert.equal(p.payload.toString(), frame);
  assert.match(lines[0], /^\[listen\] 127\.0\.0\.1:\d+ -> :\d+ \(25 bytes\) \|EFP1\.1\|HELLO/);
});

test('a port in use gives a readable error', async () => {
  const first = await startListen({ ports: [0], host: '127.0.0.1' }, () => {});
  await assert.rejects(
    startListen({ ports: [0, first.ports[0]], host: '127.0.0.1' }, () => {}),
    /already in use on this machine/,
  );
  first.close();
});
