'use strict';

// software/record from Cyrano's Compe field, and topics under a tournament root.

const test   = require('node:test');
const assert = require('node:assert');
const { Publisher }  = require('../src/publisher');
const { Translator, recordBody } = require('../src/translator');
const { NativeWatcher } = require('../src/native');
const { topicFor, setTournament } = require('../src/topics');

const CMS = '10.0.0.10', DEV = '10.0.0.101';

// An INFO frame from field values: piste, Compe, phase, poule.
const info = (piste, compe, phase, poule) =>
  `|EFP1.1|INFO|${piste}|${compe}|${phase}|${poule}|1|1|10:30|3:00|I|F|N|W||||%|%|%|`;

function setup(competitions) {
  const sent = [];
  const pub = new Publisher({ publish: (t, p, o) => sent.push({ t, p: JSON.parse(p), o }) });
  const presence = { alive() {} };
  const tr = new Translator({ publisher: pub, presence, competitions });
  const fromDev = s => tr.handlePacket({ src: DEV, dst: CMS, payload: Buffer.from(s) });
  const records = () => sent.filter(m => m.t.endsWith('/software/record'));
  return { fromDev, records };
}

test('recordBody: Compe in code form by default, overrides from competitions', () => {
  const f = { competition: 'HF ', phase: '1', poule: '3' };
  assert.deepEqual(recordBody(f),
    { slot_id: 'hf/1/3', phase_type: 'pool', competition: 'hf', bouts: [], label: 'Pool 3' });
  assert.equal(recordBody({ competition: 'FM_PALMA_EQ', phase: '2', poule: 'A32' }).competition, 'fm-palma-eq');
  assert.equal(recordBody({ competition: 'X', phase: '2', poule: 'A32' }).label, 'A32');
  assert.equal(recordBody(f, { HF: 'senior-m-foil' }).competition, 'senior-m-foil');
  assert.equal(recordBody(f, { '*': 'open-f-epee' }).competition, 'open-f-epee');
  assert.equal(recordBody(f, { HF: 'senior-m-foil', '*': 'open-f-epee' }).competition, 'senior-m-foil');
  assert.equal(recordBody({ competition: '', phase: '1', poule: '3' }), null); // nothing to name it by
});

test('every piste publishes a retained software/record without configuration, once per change', () => {
  const { fromDev, records } = setup(undefined);
  fromDev(info('3', 'HF', '1', '2'));
  fromDev(info('3', 'HF', '1', '2'));
  assert.equal(records().length, 1);
  const [r] = records();
  assert.equal(r.t, 'openpiste/3/software/record');
  assert.equal(r.p.competition, 'hf');
  assert.deepEqual(r.o, { qos: 1, retain: true });
  fromDev(info('3', 'HF', '2', 'A16'));
  assert.equal(records().length, 2);
});

test('a frame without Compe or poule publishes no record', () => {
  const { fromDev, records } = setup({ '*': 'senior-m-foil' });
  fromDev(info('3', '', '', ''));
  assert.equal(records().length, 0);
});

test('a tournament puts every topic under its cloud path', (t) => {
  setTournament('BEL/2026/10/04/ghent-test');
  t.after(() => setTournament(null));
  assert.equal(topicFor('3', 'apparatus/score'), 'openpiste/BEL/2026/10/04/ghent-test/3/apparatus/score');

  const changes = [];
  const subs = [];
  const client = { on() {}, subscribe: (topic, o, cb) => { subs.push(topic); cb(null, [{ qos: 1 }]); } };
  const w = new NativeWatcher({ client, onChange: (id, n) => changes.push([id, n]) });
  w.start(0);
  assert.deepEqual(subs, ['openpiste/BEL/2026/10/04/ghent-test/+/apparatus/connection']);
  w.handle('openpiste/BEL/2026/10/04/ghent-test/7/apparatus/connection', Buffer.from('{"online":true}'));
  w.handle('openpiste/8/apparatus/connection', Buffer.from('{"online":true}')); // another root: ignored
  assert.deepEqual(changes, [['7', true]]);
});
