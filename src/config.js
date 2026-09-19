'use strict';

const fs   = require('fs');
const path = require('path');

function loadConfig(file = path.join(__dirname, '..', 'config.json')) {
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
  config.pistes = config.pistes || [];
  return config;
}

// deviceIp -> piste id
function pisteByIp(config) {
  return new Map(config.pistes.map(p => [p.deviceIp, p.id]));
}

module.exports = { loadConfig, pisteByIp };
