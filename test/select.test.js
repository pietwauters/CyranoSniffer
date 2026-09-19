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
  { name: 'bt', description: 'Bluetooth PAN', addresses: [{ addr: '169.254.39.30' }] },
  { name: 'lo', description: 'Loopback', addresses: [{ addr: '127.0.0.1' }] },
];

test('lists usable IPv4 adapters: no link-local, loopback kept', () => {
  const l = candidateAdapters(devices);
  assert.deepEqual(l.map(c => c.ip), ['10.154.1.100', '192.168.0.10', '192.168.56.1', '127.0.0.1']);
  assert.equal(l[1].description, 'Ethernet');
});

test('Enter keeps waiting', async () => {
  assert.equal(await chooseAdapter(candidateAdapters(devices), async () => ''), null);
});

test('a number selects; bad input asks again', async () => {
  const l = candidateAdapters(devices);
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
