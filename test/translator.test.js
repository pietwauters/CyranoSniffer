'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { Publisher }  = require('../src/publisher');
const { Translator } = require('../src/translator');

function setup() {
  const sent = [];
  const pub = new Publisher({ publish: (t, p, o) => sent.push({ t, p: JSON.parse(p), o }) });
  const tr  = new Translator({
    publisher: pub, pisteByIp: new Map([['10.0.0.101', '1']]),
    cmsIp: '10.0.0.10', silenceTimeoutMs: 60000,
  });
  return { sent, tr };
}

test('device traffic publishes retained online once', () => {
  const { sent, tr } = setup();
  const pkt = { src: '10.0.0.101', dst: '10.0.0.10', payload: Buffer.from('|EFP1.1|INFO|1|') };
  tr.handlePacket(pkt); tr.handlePacket(pkt);
  tr.stop();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].t, 'openpiste/1/apparatus/connection');
  assert.equal(sent[0].p.online, true);
  assert.equal(sent[0].o.retain, true);
});

test('unknown device IPs are ignored', () => {
  const { sent, tr } = setup();
  tr.handlePacket({ src: '10.0.0.99', dst: '10.0.0.10', payload: Buffer.from('|EFP1.1|INFO|') });
  assert.equal(sent.length, 0);
});
