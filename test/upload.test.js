'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('fs');
const os     = require('os');
const path   = require('path');
const { Uploader } = require('../src/upload');

function setup(t, answer = () => ({ status: 200, json: { target: { competition: 'senior-m-foil' }, result: {} } })) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-upload-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'error', () => {});
  const posts = [];
  const up = new Uploader({
    folder, token: 'opr_test', tournament: 'BEL/2026/10/04/ghent-test',
    post: async (url, headers, body) => { posts.push({ url, headers, body: body.toString() }); return answer(); },
  });
  return { folder, up, posts };
}

test('uploads a file once it is stable, and again only when its content changes', async (t) => {
  const { folder, up, posts } = setup(t);
  const file = path.join(folder, 'HF.xml');
  fs.writeFileSync(file, '<a/>');
  fs.writeFileSync(path.join(folder, 'notes.txt'), 'ignored');
  await up.check();
  assert.equal(posts.length, 0); // first sight: wait for it to stop changing
  await up.check();
  assert.equal(posts.length, 1);
  assert.equal(posts[0].url, 'https://results.openpiste.org/api/upload?tournament=BEL%2F2026%2F10%2F04%2Fghent-test');
  assert.equal(posts[0].headers.Authorization, 'Bearer opr_test');
  await up.check();
  assert.equal(posts.length, 1); // unchanged

  fs.writeFileSync(file, '<a>2</a>');
  fs.utimesSync(file, new Date(), new Date(Date.now() + 5000));
  await up.check();
  await up.check();
  assert.equal(posts.length, 2);
  assert.equal(posts[1].body, '<a>2</a>');
});

test('retries after a network or server error, not after a rejected file', async (t) => {
  let answer = () => { throw new Error('getaddrinfo ENOTFOUND'); };
  const { folder, up, posts } = setup(t, () => answer());
  fs.writeFileSync(path.join(folder, 'HF.xml'), '<a/>');
  await up.check(); await up.check();
  assert.equal(posts.length, 1);
  answer = () => ({ status: 502, json: null });
  await up.check();
  assert.equal(posts.length, 2);
  answer = () => ({ status: 422, json: { message: 'not an FIE XML file' } });
  await up.check();
  await up.check();
  assert.equal(posts.length, 3); // rejected once, then left alone until it changes
});

test('a missing folder is reported, not fatal', async (t) => {
  const { up, posts } = setup(t);
  up.folder = path.join(os.tmpdir(), 'cs-upload-does-not-exist');
  await up.check();
  assert.equal(posts.length, 0);
  assert.equal(up.folderMissing, true);
});
