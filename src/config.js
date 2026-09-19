'use strict';

const fs   = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');

function loadConfig(file = CONFIG_PATH) {
  if (!fs.existsSync(file)) {
    throw new Error(`${file} not found. Copy config.example.json to config.json and edit it.`);
  }
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  // The spec says 50100, but the reference device listens on 50101 and sends
  // to 50100, so capture both.
  config.udpPorts = config.udpPorts || [50100, 50101];
  config.softwareTimeoutMs = config.softwareTimeoutMs || 40000;   // device rule: 40 s without HELLO
  config.apparatusTimeoutMs = config.apparatusTimeoutMs || 45000; // INFO at least every ~17 s
  config.capture = config.capture || {};
  config.captureRetryMs = config.captureRetryMs || 5000; // how often to retry a missing adapter
  return config;
}

// Writes capture.interface back to the file, leaving everything else as the
// user wrote it (loadConfig's defaults are not persisted).
function saveInterface(ip, file = CONFIG_PATH) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  raw.capture = { ...raw.capture, interface: ip };
  fs.writeFileSync(file, JSON.stringify(raw, null, 2) + '\n');
}

module.exports = { loadConfig, saveInterface, CONFIG_PATH };
