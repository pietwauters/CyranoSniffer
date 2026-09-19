'use strict';

// Keeps the README in step with the code: every option and setting must be documented,
// and the example config must not override a default with a different value.

const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('fs');
const path   = require('path');
const { OPTIONS } = require('../src/usage');
const { DEFAULTS, loadConfig } = require('../src/config');

const root   = path.join(__dirname, '..');
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
const example = JSON.parse(fs.readFileSync(path.join(root, 'config.example.json'), 'utf8'));

test('README documents every command-line option', () => {
  for (const o of OPTIONS) {
    assert.ok(readme.includes(`\`${o.flag}`), `README does not mention ${o.flag}`);
    if (o.alias) assert.ok(readme.includes(`\`${o.alias}\``), `README does not mention ${o.alias}`);
  }
});

test('README documents every setting, with its default', () => {
  const keys = ['mqttBroker', 'capture.interface', 'pistes', ...Object.keys(DEFAULTS)];
  for (const k of keys) assert.ok(readme.includes(`| \`${k}\` |`), `README table has no row for ${k}`);
  for (const [k, v] of Object.entries(DEFAULTS)) {
    const shown = Array.isArray(v) ? `\`[${v.join(', ')}]\`` : `\`${JSON.stringify(v)}\``;
    assert.ok(readme.includes(`| \`${k}\` | ${shown} |`), `README default for ${k} should be ${shown}`);
  }
});

test('config.example.json does not override a default with another value', () => {
  // siteId is a name to fill in, so the example may show a sample. Timings and ports
  // must not differ: a stale copy of them would silently override a changed default.
  const sample = new Set(['siteId']);
  for (const [k, v] of Object.entries(example)) {
    if (k in DEFAULTS && !sample.has(k)) assert.deepEqual(v, DEFAULTS[k], `example sets ${k} to a non-default value`);
  }
  assert.ok(example.mqttBroker, 'example must show mqttBroker');
});

test('a config without mqttBroker is rejected instead of silently using localhost', () => {
  const f = path.join(require('os').tmpdir(), `cs-cfg-${process.pid}.json`);
  fs.writeFileSync(f, JSON.stringify({ siteId: 'x' }));
  assert.throws(() => loadConfig(f), /mqttBroker/);
  fs.writeFileSync(f, JSON.stringify({ mqttBroker: 'mqtt://h' }));
  const c = loadConfig(f);
  fs.unlinkSync(f);
  assert.equal(c.apparatusTimeoutMs, 35000);
  assert.deepEqual(c.udpPorts, [50100, 50101]);
});
