'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { parse } = require('../src/parser');

test('parses a HELLO frame', () => {
  const f = parse(Buffer.from('|EFP1.1|HELLO|1|TestComp|||||||||||||||||'));
  assert.equal(f.ok, true);
  assert.equal(f.protocol, 'EFP1.1');
  assert.equal(f.command, 'HELLO');
  assert.equal(f.fields[0], '1');
});

test('rejects non-EFP data', () => {
  assert.equal(parse(Buffer.from('garbage')).ok, false);
});
