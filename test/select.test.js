'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('fs');
const os     = require('os');
const path   = require('path');
const { candidateAdapters, chooseAdapter } = require('../src/capture/select');
const { saveInterface } = require('../src/config');

const devices = [
  { name: 'any', addresses: [] },
  { name: 'wifi', description: 'Wi-Fi', addresses: [{ addr: 'fe80::1' }, { addr: '10.154.1.100' }] },
  { name: 'eth', description: 'Ethernet', addresses: [{ addr: '192.168.0.10' }] },
  { name: 'vbox', description: 'VirtualBox', addresses: [{ addr: '192.168.56.1' }] },
];

test('lists IPv4 adapters, those on the pistes\' network first', () => {
  const l = candidateAdapters(devices, ['192.168.0.101']);
  assert.deepEqual(l.map(c => c.ip), ['192.168.0.10', '10.154.1.100', '192.168.56.1']);
  assert.equal(l[0].sameNetwork, true);
  assert.equal(l[1].sameNetwork, false);
});

test('Enter picks the only adapter on the pistes\' network', async () => {
  const l = candidateAdapters(devices, ['192.168.0.101']);
  assert.equal((await chooseAdapter(l, async () => '')).ip, '192.168.0.10');
});

test('Enter keeps waiting when there is no single match', async () => {
  const l = candidateAdapters(devices, ['172.16.0.5']);
  assert.equal(await chooseAdapter(l, async () => ''), null);
});

test('a number selects; bad input asks again', async () => {
  const l = candidateAdapters(devices, ['172.16.0.5']);
  const answers = ['x', '9', '2'];
  const orig = console.log; console.log = () => {};
  const c = await chooseAdapter(l, async () => answers.shift());
  console.log = orig;
  assert.equal(c.ip, l[1].ip);
});

test('saveInterface changes only capture.interface', () => {
  const f = path.join(os.tmpdir(), `cs-${process.pid}.json`);
  fs.writeFileSync(f, JSON.stringify({ mqttBroker: 'mqtt://x', capture: { interface: 'old' }, pistes: [] }));
  saveInterface('1.2.3.4', f);
  const c = JSON.parse(fs.readFileSync(f, 'utf8'));
  fs.unlinkSync(f);
  assert.deepEqual(c, { mqttBroker: 'mqtt://x', capture: { interface: '1.2.3.4' }, pistes: [] });
});
