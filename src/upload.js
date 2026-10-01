'use strict';

// Uploads FIE XML results files to a results portal (results.openpiste.org,
// POST /api/upload). The CMS exports into a folder; every `intervalMs` the
// folder is checked, and a file is uploaded once it has stopped changing (same
// size and time on two checks in a row) and its content differs from what was
// last uploaded. A failed upload is retried on the next check; a file the
// portal rejects is not sent again until it changes.

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const DEFAULT_URL = 'https://results.openpiste.org/api/upload';

class Uploader {
  // `post(url, headers, body)` -> { status, json } (replaceable in tests).
  constructor({ folder, token, tournament, url = DEFAULT_URL, intervalMs = 10000, post = httpPost, log = () => {} }) {
    Object.assign(this, { folder, token, tournament, url, intervalMs, post, log });
    this.seen = new Map(); // file -> "size/mtime" at the previous check
    this.sent = new Map(); // file -> sha256 of the content last uploaded (or rejected)
    this.busy = false;
    this.folderMissing = false;
  }

  start() {
    console.log(`[upload] Watching ${this.folder} for FIE XML files, uploading to ${this.tournament}`);
    this.timer = setInterval(() => this.check(), this.intervalMs);
    this.check();
  }

  stop() { clearInterval(this.timer); }

  async check() {
    if (this.busy) return;
    this.busy = true;
    try {
      let names;
      try {
        names = fs.readdirSync(this.folder).filter(n => /\.xml$/i.test(n));
        if (this.folderMissing) console.log(`[upload] Folder ${this.folder} is available again`);
        this.folderMissing = false;
      } catch (e) {
        if (!this.folderMissing) console.error(`[upload] Cannot read folder ${this.folder}: ${e.message}`);
        this.folderMissing = true;
        return;
      }
      for (const name of names) await this.checkFile(name);
    } finally {
      this.busy = false;
    }
  }

  async checkFile(name) {
    const file = path.join(this.folder, name);
    let st;
    try { st = fs.statSync(file); } catch { return; } // removed meanwhile
    const sig = `${st.size}/${st.mtimeMs}`;
    const stable = this.seen.get(name) === sig;
    this.seen.set(name, sig);
    if (!stable || st.size === 0) return; // still being written, or new: wait one check

    let body;
    try { body = fs.readFileSync(file); } catch (e) { this.log(`[upload] ${name}: ${e.message}, retrying`); return; }
    const hash = crypto.createHash('sha256').update(body).digest('hex');
    if (this.sent.get(name) === hash) return;

    const url = `${this.url}?tournament=${encodeURIComponent(this.tournament)}`;
    let res;
    try {
      res = await this.post(url, { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/xml' }, body);
    } catch (e) {
      console.error(`[upload] ${name}: ${e.message}; retrying in ${this.intervalMs / 1000} s`);
      return;
    }
    const j = res.json || {};
    if (res.status === 200) {
      this.sent.set(name, hash);
      const r = j.result || {};
      console.log(`[upload] ${name} -> ${j.target && j.target.competition}: ${r.written} written, ${r.unchanged} unchanged, ${r.removed} removed`);
    } else if (res.status === 401) {
      console.error(`[upload] ${name}: the upload token was refused (revoked or mistyped?); retrying in ${this.intervalMs / 1000} s`);
    } else if (res.status >= 400 && res.status < 500) {
      this.sent.set(name, hash); // the file itself is the problem: wait for a new export
      console.error(`[upload] ${name} rejected: ${j.message || res.status}`);
    } else {
      console.error(`[upload] ${name}: server answered ${res.status}; retrying in ${this.intervalMs / 1000} s`);
    }
  }
}

async function httpPost(url, headers, body) {
  const res = await fetch(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(60000) });
  let json = null;
  try { json = await res.json(); } catch { /* not JSON */ }
  return { status: res.status, json };
}

module.exports = { Uploader, DEFAULT_URL };
