'use strict';

const fs   = require('fs');
const path = require('path');

function loadConfig(file = path.join(__dirname, '..', 'config.json')) {
  if (!fs.existsSync(file)) {
    throw new Error(`${file} not found. Copy config.example.json to config.json and edit it.`);
  }
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  config.udpPort = config.udpPort || 50100;
  config.silenceTimeoutMs = config.silenceTimeoutMs || 20000;
  config.pistes = config.pistes || [];
  return config;
}

// deviceIp -> piste id
function pisteByIp(config) {
  return new Map(config.pistes.map(p => [p.deviceIp, p.id]));
}

module.exports = { loadConfig, pisteByIp };
