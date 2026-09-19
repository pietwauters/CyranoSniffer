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
  return config;
}

// Writes capture.interface back to the file, leaving everything else as the
// user wrote it (loadConfig's defaults are not persisted).
function saveInterface(ip, file = CONFIG_PATH) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  raw.capture = { ...raw.capture, interface: ip };
  fs.writeFileSync(file, JSON.stringify(raw, null, 2) + '\n');
}

module.exports = { loadConfig, saveInterface, CONFIG_PATH, DEFAULTS };
