'use strict';

// CyranoSniffer — passively reads Cyrano (EFP1.1) UDP traffic and publishes OPP2.
//
//   node src/index.js [--verbose]            live capture
//   node src/index.js --replay traces/x.txt  replay a text trace
//   node src/index.js --list-interfaces      show capture devices and their IPs

const mqtt = require('mqtt');
const readline = require('readline');
const { loadConfig, pisteByIp, saveInterface } = require('./config');
const { candidateAdapters, formatCandidates, chooseAdapter } = require('./capture/select');
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
  let everOpened = false, offered = false;

  // The configured adapter was never found: show the options and, when a person
  // is at the keyboard, let them pick one and save it. Unattended runs only
  // print the list and keep retrying.
  async function offerAdapters() {
    offered = true;
    const { Cap } = loadCap();
    const list = candidateAdapters(Cap.deviceList(), config.pistes.map(p => p.deviceIp));
    if (list.length === 0) { console.error('[capture] No adapter with an IPv4 address found; waiting.'); return; }
    console.error(`[capture] Available adapters:\n${formatCandidates(list)}`);
    if (!process.stdin.isTTY) {
      console.error('[capture] Set "capture.interface" in config.json to one of these addresses.');
      return;
    }
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.on('SIGINT', () => { rl.close(); process.emit('SIGINT'); });
    const ask = q => new Promise(resolve => rl.question(q, resolve));
    const chosen = await chooseAdapter(list, ask);
    rl.close();
    if (!chosen || everOpened) return; // kept waiting, or it appeared meanwhile
    saveInterface(chosen.ip);
    config.capture.interface = chosen.ip;
    console.log(`[capture] Saved capture.interface = ${chosen.ip} to config.json`);
  }

  const capture = superviseCapture({
    open: () => {
      let close;
      try {
        close = startLive({ iface: config.capture.interface, udpPorts: config.udpPorts }, onPacket);
      } catch (e) {
        if (!everOpened && !offered && /No capture device/.test(e.message)) {
          offerAdapters().catch(err => console.error(`[capture] ${err.message}`));
        }
        throw e;
      }
      everOpened = true;
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
