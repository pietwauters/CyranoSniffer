'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { Publisher }  = require('../src/publisher');
const { Translator, parseClock } = require('../src/translator');

const CMS = '10.0.0.10', DEV = '10.0.0.101';

function setup() {
  const sent = [];
  const pub = new Publisher({ publish: (t, p, o) => sent.push({ t: t.replace('openpiste/1/', ''), p: JSON.parse(p), o }) });
  const tr  = new Translator({ publisher: pub, pisteByIp: new Map([[DEV, '1']]), pisteIds: ['1'] });
  const fromDev = s => tr.handlePacket({ src: DEV, dst: CMS, payload: Buffer.from(s) });
  const fromCms = s => tr.handlePacket({ src: CMS, dst: DEV, payload: Buffer.from(s) });
  const get = t => sent.filter(m => m.t === t);
  return { sent, tr, fromDev, fromCms, get };
}

const info = (state, rScore, lScore, extra = {}) =>
  `|EFP1.1|INFO|1|efj-eq|1|A32|12|2|10:30|${extra.clock || '3:00'}|I|E|${extra.prio || 'N'}|${state}|132|J.Smith|GBR|%|28|P.Martin|FRA|${rScore}|U|0|1|${extra.rLight || 0}|0|0|N|%|32|B. Panini|ITA|${lScore}|U|0|0|${extra.lLight || 0}|0|0|N|%|`;

test('parseClock', () => {
  assert.deepEqual(parseClock('1:09.25'), { time_ms: 69250, time: '1:09.25' });
  assert.equal(parseClock('3:00').time_ms, 180000);
  assert.equal(parseClock(''), null);
});

test('INFO produces state/score/lights/clock/fencers/match', () => {
  const { tr, fromDev, get } = setup();
  fromDev(info('F', 3, 2, { rLight: 1, clock: '2:59' }));
  tr.stop();
  assert.equal(get('apparatus/state')[0].p.state, 'F');
  const score = get('apparatus/score')[0];
  assert.equal(score.p.right.score, 3);
  assert.equal(score.p.left.score, 2);
  assert.equal(score.p.right.red_cards, 1);
  assert.equal(score.p.priority, 'N');
  assert.equal(score.o.retain, true);
  assert.deepEqual(get('apparatus/lights')[0].p.right, { green: true, white: false });
  assert.equal(get('apparatus/clock')[0].p.running, true);
  assert.equal(get('apparatus/clock')[0].p.time_ms, 179000);
  assert.equal(get('apparatus/fencers')[0].p.left.fencer.name, 'B. Panini');
  assert.equal(get('apparatus/fencers')[0].p.common.referee.name, 'J.Smith');
  const m = get('apparatus/match')[0].p;
  assert.deepEqual([m.weapon, m.phase_type, m.poule, m.match, m.round], ['E', 'DE', 'A32', 12, 2]);
  assert.equal(get('apparatus/connection')[0].p.online, true);
});

test('unchanged INFO is not republished; changes are', () => {
  const { tr, fromDev, get } = setup();
  fromDev(info('H', 1, 0));
  fromDev(info('H', 1, 0));
  fromDev(info('H', 2, 0));
  tr.stop();
  assert.equal(get('apparatus/state').length, 1);
  assert.equal(get('apparatus/score').length, 2);
});

test('entering Ending emits one END control; ACK/NAK come from software', () => {
  const { tr, fromDev, fromCms, get } = setup();
  fromDev(info('H', 5, 3));
  fromDev(info('E', 5, 3));
  fromDev(info('E', 5, 3));
  fromCms('|EFP1.1|ACK|1|efj-eq|%|');
  fromCms('|EFP1.1|NAK|1|efj-eq|%|');
  tr.stop();
  assert.equal(get('apparatus/control').filter(m => m.p.command === 'END').length, 1);
  assert.deepEqual(get('software/control').map(m => m.p.command), ['ACK', 'NAK']);
});

test('NEXT/PREV are forced through even when repeated', () => {
  const { tr, fromDev, get } = setup();
  fromDev('|EFP1.1|NEXT|1|efj-eq|%|');
  fromDev('|EFP1.1|NEXT|1|efj-eq|%|');
  fromDev('|EFP1.1|PREV|1|efj-eq|%|');
  tr.stop();
  assert.deepEqual(get('apparatus/control').map(m => m.p.command), ['NEXT', 'NEXT', 'PREV']);
});

test('DISP publishes software fencers/match/score/clock, HELLO software presence', () => {
  const { tr, fromCms, get } = setup();
  fromCms('|EFP1.1|HELLO|1|efj-eq|%|');
  fromCms(info('W', 0, 0).replace('INFO', 'DISP'));
  tr.stop();
  assert.equal(get('software/connection')[0].p.online, true);
  assert.equal(get('software/fencers')[0].p.right.fencer.id, '28');
  assert.equal(get('software/match')[0].p.competition, 'efj-eq');
  assert.equal(get('software/score')[0].o.retain, false);
  assert.equal(get('software/clock')[0].p.running, false);
  assert.equal(get('apparatus/connection').length, 0); // DISP is not device traffic
});

test('numeric poule maps to pool; unknown IPs and pistes are ignored', () => {
  const { tr, fromDev, sent } = setup();
  fromDev(info('W', 0, 0).replace('|A32|', '|3|'));
  assert.equal(sent.find(m => m.t === 'apparatus/match').p.phase_type, 'pool');
  const n = sent.length;
  tr.handlePacket({ src: '10.0.0.99', dst: CMS, payload: Buffer.from('|EFP1.1|INFO|9|x|%|') });
  tr.stop();
  assert.equal(sent.length, n);
});

test('invalid enum values are normalised, not passed through', () => {
  const { tr, fromDev, get } = setup();
  fromDev('|EFP1.1|INFO|1||||||||||Q|Z|%|||0|9|0|0|0|0|0|N|%|');
  tr.stop();
  assert.equal(get('apparatus/state').length, 0);
  assert.equal(get('apparatus/score')[0].p.right.status, 'U');
  assert.equal(get('apparatus/score')[0].p.priority, 'N');
});
