'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('events');
const { Publisher } = require('../src/publisher');
const { Presence }  = require('../src/presence');

const wait = ms => new Promise(r => setTimeout(r, ms));

// A fake MQTT connection that records what it publishes and how it was configured.
function harness(timeouts = { apparatus: 60000, software: 60000 }) {
  const clients = [];
  const connect = (url, opts) => {
    const c = new EventEmitter();
    Object.assign(c, { url, opts, connected: true, sent: [], ended: null,
      publish(t, p, o) { c.sent.push({ t, p: JSON.parse(p), o }); },
      end(force, o, cb) { c.ended = { force }; if (typeof force === 'function') force(); else if (cb) cb(); } });
    clients.push(c);
    return c;
  };
  const main = { publish() {} };
  const pub = new Publisher(main);
  const presence = new Presence({ brokerUrl: 'mqtt://broker', siteId: 'demo', publisher: pub, timeouts, connect });
  return { presence, clients, pub };
}

test('a piste gets its own connection with a retained QoS 1 Last Will', () => {
  const { presence, clients } = harness();
  presence.alive('7', 'apparatus');
  presence.close();
  assert.equal(clients.length, 1);
  const w = clients[0].opts.will;
  assert.equal(w.topic, 'openpiste/7/apparatus/connection');
  assert.deepEqual(JSON.parse(w.payload), { online: false });
  assert.equal(w.qos, 1);
  assert.equal(w.retain, true);
  assert.match(clients[0].opts.clientId, /^cyranosniffer-demo-[0-9a-f]{6}-apparatus-7$/);
});

test('online is published once, retained, with a device marker', () => {
  const { presence, clients } = harness();
  presence.alive('7', 'apparatus'); presence.alive('7', 'apparatus'); presence.alive('7', 'apparatus');
  presence.close();
  const sent = clients[0].sent;
  assert.equal(sent.length, 1);
  assert.equal(sent[0].t, 'openpiste/7/apparatus/connection');
  assert.equal(sent[0].p.online, true);
  assert.match(sent[0].p.device, /CyranoSniffer/);
  assert.equal(sent[0].o.retain, true);
});

test('apparatus and software of the same piste use separate connections', () => {
  const { presence, clients } = harness();
  presence.alive('7', 'apparatus'); presence.alive('7', 'software'); presence.alive('8', 'apparatus');
  presence.close();
  assert.equal(clients.length, 3);
  assert.equal(clients[1].sent[0].t, 'openpiste/7/software/connection');
  assert.equal(clients[1].sent[0].o.retain, true);
});

test('silence marks the piste offline, and it comes back online', async () => {
  const { presence, clients } = harness({ apparatus: 30, software: 30 });
  presence.alive('7', 'apparatus');
  await wait(80);
  presence.alive('7', 'apparatus');
  presence.close();
  assert.deepEqual(clients[0].sent.map(m => m.p.online), [true, false, true]);
});

test('reconnecting restates the current status', () => {
  const { presence, clients } = harness();
  presence.alive('7', 'apparatus');
  clients[0].emit('connect'); // e.g. after the broker published our will
  presence.close();
  assert.deepEqual(clients[0].sent.map(m => m.p.online), [true, true]);
});

test('status is held until the connection is up, then published', () => {
  const { presence, clients } = harness();
  presence.connect = (url, opts) => { const c = new EventEmitter(); Object.assign(c, { opts, connected: false, sent: [],
    publish(t, p, o) { c.sent.push({ p: JSON.parse(p) }); }, end() {} }); clients.push(c); return c; };
  presence.alive('9', 'apparatus');
  const c = clients[clients.length - 1];
  assert.equal(c.sent.length, 0);
  c.connected = true; c.emit('connect');
  presence.close();
  assert.equal(c.sent[0].p.online, true);
});

test('shutdown marks online pistes offline before disconnecting cleanly', async () => {
  const { presence, clients } = harness();
  presence.alive('7', 'apparatus'); presence.alive('7', 'software');
  await new Promise(done => presence.shutdown(done));
  for (const c of clients) {
    assert.deepEqual(c.sent.map(m => m.p.online), [true, false]);
    assert.equal(c.ended.force, false);
  }
});

test('shutdown with nothing to close still finishes', async () => {
  const { presence } = harness();
  await new Promise(done => presence.shutdown(done));
});

test('a repeated connection error is logged once, again after reconnecting', () => {
  const { presence, clients } = harness();
  presence.alive('7', 'apparatus');
  const lines = [];
  const orig = console.error; console.error = m => lines.push(m);
  const err = new Error('connect ECONNREFUSED');
  clients[0].emit('error', err); clients[0].emit('error', err); clients[0].emit('error', err);
  clients[0].emit('connect');
  clients[0].emit('error', err);
  console.error = orig;
  presence.close();
  assert.equal(lines.length, 2);
});
