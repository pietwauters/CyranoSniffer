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
const { startLive, listInterfaces, adapterPresent, isFatalCaptureError, loadCap } = require('./capture/live');
const { superviseCapture } = require('./capture/supervisor');

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

if (replayFile) {
  client.once('connect', () => {
    replay(replayFile, onPacket);
    setTimeout(() => { translator.stop(); client.end(); }, 500);
  });
} else {
  // Capture does not depend on the broker being reachable, and must start
  // exactly once (the MQTT 'connect' event fires again on every reconnect).
  try { loadCap(); } catch (e) { console.error(`[capture] ${e.message}`); process.exit(1); }
  const capture = superviseCapture({
    open: () => {
      const close = startLive({ iface: config.capture.interface, udpPorts: config.udpPorts }, onPacket);
      log(`[sniffer] Capturing UDP ${config.udpPorts.join('/')} — ${config.pistes.length} piste(s)`);
      return close;
    },
    present: () => adapterPresent(config.capture.interface),
    intervalMs: config.captureRetryMs,
    isFatal: isFatalCaptureError,
    onFatal: e => {
      console.error(`[capture] ${e.message}`);
      console.error('[capture] Capturing needs privileges: run with sudo (Linux) or as administrator; see the README.');
      process.exit(1);
    },
    log,
  });
  const shutdown = () => { capture.stop(); translator.stop(); client.end(true, () => process.exit(0)); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
