'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { collapseRepeats } = require('../src/collapse');

const wait = ms => new Promise(r => setTimeout(r, ms));

test('identical consecutive lines are printed once with a count', () => {
  const out = [];
  const log = collapseRepeats(l => out.push(l));
  log('a'); log('a'); log('a'); log('b'); log('b');
  log.flush();
  assert.deepEqual(out, ['a', '  (last message repeated 2 more times)', 'b', '  (last message repeated 1 more time)']);
});

test('distinct lines pass straight through', () => {
  const out = [];
  const log = collapseRepeats(l => out.push(l));
  log('a'); log('b'); log('a');
  assert.deepEqual(out, ['a', 'b', 'a']);
});

test('summary comes after the repeats stop, and a later identical line prints again', async () => {
  const out = [];
  const log = collapseRepeats(l => out.push(l), { idleMs: 20 });
  log('x'); log('x'); log('x');
  await wait(60);
  assert.deepEqual(out, ['x', '  (last message repeated 2 more times)']);
  log('x');
  assert.equal(out[2], 'x');
  log.flush();
});

test('a steady stream still reports within maxHoldMs', async () => {
  const out = [];
  const log = collapseRepeats(l => out.push(l), { idleMs: 1000, maxHoldMs: 40 });
  const t = setInterval(() => log('tick'), 10);
  await wait(120);
  clearInterval(t); log.flush();
  assert.ok(out.filter(l => l.includes('repeated')).length >= 2);
});
