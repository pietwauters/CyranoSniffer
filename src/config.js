'use strict';

const fs   = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');

// Defaults for optional settings. The README documents the same list.
const DEFAULTS = {
  siteId: 'site',
  udpPorts: [50100, 50101], // the spec says 50100, but the reference device listens on 50101 and sends to 50100
  softwareTimeoutMs: 40000, // device rule: 40 s without HELLO
  apparatusTimeoutMs: 35000, // devices send at least every ~17 s
  captureRetryMs: 5000, // how often to retry a missing adapter
  forceTranslate: false,
  uploadIntervalMs: 10000, // how often the upload folder is checked
};

function loadConfig(file = CONFIG_PATH) {
  if (!fs.existsSync(file)) {
    throw new Error(`${file} not found. Copy config.example.json to config.json and edit it.`);
  }
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  // Without this, mqtt.js would silently fall back to localhost.
  if (typeof config.mqttBroker !== 'string' || config.mqttBroker.trim() === '') {
    throw new Error('"mqttBroker" is missing in config.json, e.g. "mqtt://openpiste.local"');
  }
  for (const [key, value] of Object.entries(DEFAULTS)) config[key] = config[key] || value;
  config.capture = config.capture || {};
  checkResultsSettings(config);
  return config;
}

// Optional: publishing straight to the cloud broker of a results portal, and
// uploading the CMS's FIE XML exports there. See the README, "Results site".
const TOURNAMENT_RE = /^[A-Z]{3}\/\d{4}\/\d{2}\/\d{2}\/[a-z0-9]+(-[a-z0-9]+)*$/;
const CODE_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function checkResultsSettings(config) {
  if (config.tournament !== undefined && !TOURNAMENT_RE.test(config.tournament)) {
    throw new Error('"tournament" must look like "BEL/2026/10/04/ghent-test" (country, first day, then a-z, 0-9 and hyphens)');
  }
  if (config.competitions !== undefined) {
    const c = config.competitions;
    if (!c || typeof c !== 'object' || Array.isArray(c)) throw new Error('"competitions" must be an object, e.g. { "*": "senior-m-foil" }');
    for (const [compe, code] of Object.entries(c)) {
      if (!CODE_RE.test(code)) throw new Error(`"competitions": "${code}" (for "${compe}") may use only a-z, 0-9 and single hyphens`);
    }
  }
  if (config.upload !== undefined) {
    const u = config.upload;
    if (!config.tournament) throw new Error('"upload" needs "tournament" too');
    if (!u || typeof u.folder !== 'string' || !u.folder) throw new Error('"upload.folder" is missing: the folder the CMS exports FIE XML files to');
    if (typeof u.token !== 'string' || !u.token) throw new Error('"upload.token" is missing: the upload token you were given');
  }
}

// Writes capture.interface back to the file, leaving everything else as the
// user wrote it (loadConfig's defaults are not persisted).
function saveInterface(ip, file = CONFIG_PATH) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  raw.capture = { ...raw.capture, interface: ip };
  fs.writeFileSync(file, JSON.stringify(raw, null, 2) + '\n');
}

module.exports = { loadConfig, saveInterface, CONFIG_PATH, DEFAULTS };
