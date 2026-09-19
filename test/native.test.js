'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('events');
const { NativeWatcher } = require('../src/native');
const { Presence, DEVICE } = require('../src/presence');
const { Publisher } = require('../src/publisher');
const { Translator } = require('../src/translator');

const wait = ms => new Promise(r => setTimeout(r, ms));

function fakeClient(grant = [{ qos: 1 }], err = null) {
  const c = new EventEmitter();
  c.subscribed = [];
  c.subscribe = (topic, opts, cb) => { c.subscribed.push(topic); setImmediate(() => cb(err, grant)); };
  c.say = (piste, body) => c.emit('message', `openpiste/${piste}/apparatus/connection`, Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)));
  return c;
}

test('a native device is detected; our own marker, LWTs and offline are not native', async () => {
  const client = fakeClient();
  const changes = [];
  const w = new NativeWatcher({ client, onChange: (id, n) => changes.push([id, n]) });
  await w.start(0);
  client.say('7', { protocol: 'OPP2', version: '1.0', online: true, device: 'OpenPiste-ESP32' });
  client.say('8', { online: true });                                   // native device that omits the optional `device`
  client.say('9', { online: true, device: DEVICE });                    // us
  client.say('10', { online: false });                                  // LWT
  client.say('11', 'not json');
  assert.deepEqual([w.isNative('7'), w.isNative('8'), w.isNative('9'), w.isNative('10'), w.isNative('11')],
    [true, true, false, false, false]);
  assert.deepEqual(changes, [['7', true], ['8', true]]);
});

test('going offline is a transition back', async () => {
  const client = fakeClient();
  const changes = [];
  const w = new NativeWatcher({ client, onChange: (id, n) => changes.push([id, n]) });
  await w.start(0);
  client.say('7', { online: true, device: 'OpenPiste-ESP32' });
  client.say('7', { online: true, device: 'OpenPiste-ESP32' }); // repeated: no new transition
  client.say('7', { online: false });
  assert.deepEqual(changes, [['7', true], ['7', false]]);
});

test('nothing is published until the retained state has been read', async () => {
  const client = fakeClient();
  const w = new NativeWatcher({ client });
  const started = w.start(30);
  assert.equal(w.blocks('7'), true);        // before sync: hold back
  await started;
  assert.equal(w.blocks('7'), false);       // synced, no native device
  client.say('7', { online: true, device: 'X' });
  assert.equal(w.blocks('7'), true);
  assert.equal(w.blocks('8'), false);       // other pistes unaffected
});

test('a refused subscription fails open', async () => {
  const warn = console.warn; console.warn = () => {};
  const w = new NativeWatcher({ client: fakeClient([{ qos: 128 }]) });
  await w.start(0);
  console.warn = warn;
  assert.equal(w.blocks('7'), false);
});

test('release ends the connection cleanly, publishes nothing and stops the timer', async () => {
  const ended = [], sent = [];
  const connect = () => ({ connected: true, on() {}, publish: (t, p) => sent.push(t), end: f => ended.push(f) });
  const pub = new Publisher({ publish() {} });
  const presence = new Presence({ brokerUrl: 'x', publisher: pub, timeouts: { apparatus: 20, software: 20 }, connect });
  presence.alive('7', 'apparatus');
  sent.length = 0;
  presence.release('7', 'apparatus');
  await wait(60);                       // the silence timer must not fire
  assert.deepEqual(sent, []);           // no offline message overwriting the native status
  assert.deepEqual(ended, [true]);      // clean end: the broker does not publish the will
  presence.alive('7', 'apparatus');     // can come back later
  presence.close();
});

test('Publisher: suppress skips without recording; forget makes it republish; resync respects it', () => {
  const out = [];
  const pub = new Publisher({ publish: (t, p, o) => out.push(t) });
  let blocked = false;
  pub.suppress = (id, key) => key.startsWith('apparatus/') && blocked;
  pub.publish('7', 'apparatus/state', { state: 'F' });
  blocked = true;
  assert.equal(pub.publish('7', 'apparatus/state', { state: 'H' }), false);
  assert.equal(pub.publish('7', 'software/match', { weapon: 'E', type: 'I', competition: '', phase_type: 'DE', phase: '', poule: '', match: 1, round: 1 }), true);
  out.length = 0;
  assert.equal(pub.resync(), 0);        // stale apparatus state is not restated over a native device
  blocked = false;
  pub.forget('7', 'apparatus/');
  assert.equal(pub.publish('7', 'apparatus/state', { state: 'F' }), true); // same body as before, republished
});

function build(blockedPistes) {
  const sent = [];
  const pub = new Publisher({ publish: (t, p) => sent.push(t.replace('openpiste/', '')) });
  const presenceSent = [];
  const presence = new Presence({ brokerUrl: 'x', publisher: pub, timeouts: { apparatus: 1e6, software: 1e6 },
    connect: () => ({ connected: true, on() {}, end() {}, publish: (t) => sent.push(t.replace('openpiste/', '')) }) });
  const suppressed = (id, key) => key.startsWith('apparatus/') && blockedPistes.has(id);
  pub.suppress = suppressed;
  const tr = new Translator({ publisher: pub, presence, suppressed });
  return { sent, tr };
}

const frame = (cmd, piste, state) => `|EFP1.1|${cmd}|${piste}|${'|'.repeat(10)}${state}||%||||0|U|0|0|0|0|0|N|%||||0|U|0|0|0|0|0|N|%|`;

test('a native piste: no apparatus/*, no apparatus presence, but software/* still flows', () => {
  const { sent, tr } = build(new Set(['7']));
  tr.handlePacket({ src: '10.0.0.7', dst: '10.0.0.1', payload: Buffer.from(frame('INFO', '7', 'F')) });
  tr.handlePacket({ src: '10.0.0.7', dst: '10.0.0.1', payload: Buffer.from('|EFP1.1|NEXT|7|efj-eq|%|') });
  tr.handlePacket({ src: '10.0.0.1', dst: '10.0.0.7', payload: Buffer.from(frame('DISP', '7', 'W').replace('|||||||||||W', '|A|B|C|D|E|F|G|H|I|J|W')) });
  tr.handlePacket({ src: '10.0.0.1', dst: '10.0.0.7', payload: Buffer.from('|EFP1.1|ACK|7|efj-eq|%|') });
  tr.stop();
  assert.deepEqual(sent.filter(t => t.startsWith('7/apparatus/')), []);
  assert.ok(sent.includes('7/software/connection'));
  assert.ok(sent.includes('7/software/score'));
  assert.ok(sent.includes('7/software/control'));
});

test('other pistes are translated as usual', () => {
  const { sent, tr } = build(new Set(['7']));
  tr.handlePacket({ src: '10.0.0.8', dst: '10.0.0.1', payload: Buffer.from(frame('INFO', '8', 'F')) });
  tr.stop();
  assert.ok(sent.includes('8/apparatus/state'));
  assert.ok(sent.includes('8/apparatus/connection'));
});
