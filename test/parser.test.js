'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { parse } = require('../src/parser');

// Examples from docs/CyranoProtocol-1-1.pdf §6.
const INFO = '|EFP1.1|INFO|17|efj-eq|1|A32|12|2|10:30|3:00|I|S||W|132|J.Smith|GBR|%|28|P.Martin|FRA|8|V|0|1|1|0|0|N|%|32|B. Panini|ITA|6|D|0|1|0|0|0|N|%|';

test('parses HELLO / NEXT with omitted areas', () => {
  const h = parse('|EFP1.1|HELLO|17|fm-eq|%|');
  assert.deepEqual([h.command, h.piste, h.competition], ['HELLO', '17', 'fm-eq']);
  assert.equal(parse('|EFP1.1|NEXT|17|fm-eq|%|').command, 'NEXT');
});

test('parses a full INFO', () => {
  const f = parse(Buffer.from(INFO));
  assert.equal(f.stopwatch, '3:00');
  assert.equal(f.weapon, 'S');
  assert.equal(f.priority, '');
  assert.equal(f.state, 'W');
  assert.equal(f.refName, 'J.Smith');
  assert.equal(f.right.name, 'P.Martin');
  assert.equal(f.right.score, '8');
  assert.equal(f.right.status, 'V');
  assert.equal(f.right.light, '1');
  assert.equal(f.left.name, 'B. Panini');
  assert.equal(f.left.pCard, ''); // 11-field spec example has no P-card
});

test('pads a minimal INFO (waiting, no match)', () => {
  const f = parse('|EFP1.1|INFO||||||||||||W||%|');
  assert.equal(f.state, 'W');
  assert.equal(f.right.score, '');
});

// Cyrano 1.0 (EFP1, 2008), still used by older devices: 11 fields per fencer
// (no P-card) and a stopwatch without hundredths. Examples from its §"Syntax".
const INFO_10 = '|EFP1|INFO|17|efj-eq|1|A32|12|2|10:30|3:00|I|S||W|132|J.Smith|GBR|%|28|P.Martin|FRA|8|V|0|1|1|0|0|N|%|32|B. Panini|ITA|6|D|0|1|0|0|0|N|%|';

test('parses Cyrano 1.0 (EFP1) frames', () => {
  const h = parse('|EFP1|HELLO|17|fm-eq|%|');
  assert.deepEqual([h.ok, h.protocol, h.command, h.piste], [true, 'EFP1', 'HELLO', '17']);
  const f = parse(INFO_10);
  assert.deepEqual([f.state, f.stopwatch, f.right.score, f.left.name, f.left.reserve], ['W', '3:00', '8', 'B. Panini', 'N']);
  assert.equal(f.right.pCard, '');
  assert.equal(parse('|EFP1|INFO||||||||3:00||||W|%||||0|U|0|1|1|0|0|N|%||||0|U|0|1|0|0|0|N|%|').left.rCard, '1');
});

test('rejects non-EFP data', () => {
  assert.equal(parse('garbage').ok, false);
});
