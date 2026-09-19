'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { superviseCapture } = require('../src/capture/supervisor');

const wait = ms => new Promise(r => setTimeout(r, ms));

test('keeps retrying while the adapter is missing, then opens once', async () => {
  let attempts = 0, opened = 0;
  const err = console.error; console.error = () => {};
  const sup = superviseCapture({
    intervalMs: 10,
    open: () => { if (++attempts < 4) throw new Error('No capture device'); opened++; return () => {}; },
    present: () => true,
  });
  await wait(120);
  sup.stop(); console.error = err;
  assert.equal(opened, 1);
  assert.ok(attempts >= 4);
});

test('reopens after the adapter disappears and returns', async () => {
  let up = true, opened = 0, closed = 0;
  const warn = console.warn; console.warn = () => {};
  const sup = superviseCapture({
    intervalMs: 10,
    open: () => { if (!up) throw new Error('down'); opened++; return () => { closed++; }; },
    present: () => up,
  });
  await wait(30);
  up = false; await wait(40);
  up = true;  await wait(40);
  sup.stop(); console.warn = warn;
  assert.equal(opened, 2);
  assert.ok(closed >= 1);
});

test('fatal errors are reported, not retried', async () => {
  let attempts = 0, fatal = null;
  const sup = superviseCapture({
    intervalMs: 10,
    open: () => { attempts++; throw new Error('socket: Operation not permitted'); },
    present: () => false,
    isFatal: e => /not permitted/.test(e.message),
    onFatal: e => { fatal = e; },
  });
  await wait(60);
  sup.stop();
  assert.match(fatal.message, /not permitted/);
  assert.ok(attempts >= 1);
});

test('stop() closes an open capture', async () => {
  let closed = 0;
  const sup = superviseCapture({ intervalMs: 10, open: () => () => { closed++; }, present: () => true });
  await wait(20);
  sup.stop();
  assert.equal(closed, 1);
});

test('stays silent while quiet, then reports again', async () => {
  const lines = [];
  const err = console.error; console.error = m => lines.push(m);
  let quiet = true;
  const sup = superviseCapture({
    intervalMs: 10, reminderEvery: 1,
    open: () => { throw new Error('missing'); }, present: () => false,
    isQuiet: () => quiet,
  });
  await wait(50);
  const whileQuiet = lines.length;
  quiet = false;
  await wait(50);
  sup.stop(); console.error = err;
  assert.equal(whileQuiet, 0);
  assert.ok(lines.length > 0);
});
