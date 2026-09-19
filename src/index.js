'use strict';

// CyranoSniffer — passively reads Cyrano (EFP1.1) UDP traffic and publishes OPP2.
//
//   node src/index.js [--verbose]            live capture
//   node src/index.js --replay traces/x.txt  replay a text trace
//   node src/index.js --list-interfaces      show capture devices and their IPs

const mqtt = require('mqtt');
const { loadConfig, pisteByIp } = require('./config');
const { Publisher }  = require('./publisher');
const { Translator } = require('./translator');
const { replay }     = require('./capture/replay');
const { startLive, listInterfaces } = require('./capture/live');

const args    = process.argv.slice(2);
const verbose = args.includes('--verbose') || args.includes('-v');
const log     = (...a) => { if (verbose) console.log(...a); };
const replayFile = args.includes('--replay') ? args[args.indexOf('--replay') + 1] : null;

if (args.includes('--list-interfaces')) {
  try { listInterfaces(); } catch (e) { console.error(e.message); process.exit(1); }
  process.exit(0);
}

let config;
try { config = loadConfig(); } catch (e) { console.error('[config]', e.message); process.exit(1); }

const client = mqtt.connect(config.mqttBroker);
client.on('connect', () => log(`[MQTT] Connected to ${config.mqttBroker}`));
client.on('error',   e  => console.error('[MQTT] Error:', e.message));

const translator = new Translator({
  publisher: new Publisher(client, log),
  pisteByIp: pisteByIp(config),
  pisteIds: config.pistes.map(p => p.id),
  softwareTimeoutMs: config.softwareTimeoutMs,
  apparatusTimeoutMs: config.apparatusTimeoutMs,
  log,
});
const onPacket = p => translator.handlePacket(p);

client.on('connect', () => {
  if (replayFile) {
    replay(replayFile, onPacket);
    setTimeout(() => { translator.stop(); client.end(); }, 500);
  } else {
    try {
      startLive({ iface: config.capture.interface, udpPorts: config.udpPorts }, onPacket);
    } catch (e) {
      console.error(`[capture] ${e.message}`);
      if (/not permitted|permission/i.test(e.message)) {
        console.error('[capture] Capturing needs privileges: run with sudo, or on Linux grant Node the capability (see README).');
      }
      process.exit(1);
    }
    log(`[sniffer] Capturing UDP ${config.udpPorts.join('/')} — ${config.pistes.length} piste(s)`);
  }
});
