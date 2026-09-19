'use strict';

// CyranoSniffer — passively reads Cyrano (EFP1.1) UDP traffic and publishes OPP2.
//
//   node src/index.js [--verbose]            live capture
//   node src/index.js --replay traces/x.txt  replay a text trace
//   node src/index.js --list-interfaces      show capture devices and their IPs

const mqtt = require('mqtt');
const readline = require('readline');
const { collapseRepeats } = require('./collapse');
const { loadConfig, saveInterface } = require('./config');
const { candidateAdapters, formatCandidates, chooseAdapter } = require('./capture/select');
const { Publisher }  = require('./publisher');
const { Translator } = require('./translator');
const { Presence }   = require('./presence');
const { NativeWatcher } = require('./native');
const { replay }     = require('./capture/replay');
const { startLive, listInterfaces, adapterPresent, isFatalCaptureError, loadCap } = require('./capture/live');
const { superviseCapture } = require('./capture/supervisor');

const args    = process.argv.slice(2);
const verbose = args.includes('--verbose') || args.includes('-v');
// Identical consecutive verbose lines are collapsed into one plus a repeat count.
const log     = verbose ? collapseRepeats((...a) => console.log(...a)) : Object.assign(() => {}, { flush() {} });
const replayFile = args.includes('--replay') ? args[args.indexOf('--replay') + 1] : null;

if (args.includes('--list-interfaces')) {
  try { listInterfaces(); } catch (e) { console.error(e.message); process.exit(1); }
  process.exit(0);
}

let config;
try { config = loadConfig(); } catch (e) { console.error('[config]', e.message); process.exit(1); }

if (config.pistes) {
  console.warn('[config] "pistes" is no longer used: piste ids are read from the Cyrano messages. You can delete it.');
}

const client = mqtt.connect(config.mqttBroker);
client.on('connect', () => log(`[MQTT] Connected to ${config.mqttBroker}`));
client.on('error',   e  => console.error('[MQTT] Error:', e.message));

// A broker restart or dropped connection can lose retained state: restate it.
let connectedOnce = false;
client.on('connect', () => {
  if (connectedOnce) log(`[MQTT] Reconnected, restated ${publisher.resync()} retained topic(s)`);
  connectedOnce = true;
});

const publisher = new Publisher(client, log);
const presence  = new Presence({
  brokerUrl: config.mqttBroker,
  siteId: config.siteId,
  publisher,
  timeouts: { apparatus: config.apparatusTimeoutMs, software: config.softwareTimeoutMs },
  log,
});
// A native OPP2 apparatus on a piste already publishes apparatus/*; a translated
// copy would fight it. By default we stay quiet there. --force translates anyway
// (needed to test with a device that speaks both protocols).
const force = args.includes('--force') || config.forceTranslate === true;
let watcher = null;
if (force) {
  console.log('[native] --force: translating apparatus/* even on pistes with a native OPP2 apparatus.');
} else {
  watcher = new NativeWatcher({
    client,
    log,
    onChange: (id, isNative) => {
      if (isNative) {
        presence.release(id, 'apparatus'); // clean disconnect: our will must not overwrite the native status
        publisher.forget(id, 'apparatus/');
        console.log(`[native] piste ${id}: native OPP2 apparatus is online, not publishing translated apparatus/* (--force overrides)`);
      } else {
        publisher.forget(id, 'apparatus/');
        console.log(`[native] piste ${id}: native OPP2 apparatus is offline, resuming translation`);
      }
    },
  });
  publisher.suppress = (id, key) => key.startsWith('apparatus/') && watcher.blocks(id);
}
const translator = new Translator({ publisher, presence, suppressed: publisher.suppress || undefined, log });
const onPacket = p => translator.handlePacket(p);

if (replayFile) {
  client.once('connect', async () => {
    if (watcher) await watcher.start(); // learn which pistes are native before publishing
    replay(replayFile, onPacket);
    setTimeout(() => { log.flush(); presence.shutdown(() => client.end()); }, 500);
  });
} else {
  // Capture does not depend on the broker being reachable, and must start
  // exactly once (the MQTT 'connect' event fires again on every reconnect).
  try { loadCap(); } catch (e) { console.error(`[capture] ${e.message}`); process.exit(1); }
  if (watcher) client.once('connect', () => watcher.start()); // (re)subscribes itself after reconnects
  let everOpened = false, offered = false, promptOpen = false;

  // The configured adapter was never found: show the options and, when a person
  // is at the keyboard, let them pick one and save it. Unattended runs only
  // print the list and keep retrying.
  async function offerAdapters() {
    offered = true;
    const { Cap } = loadCap();
    const list = candidateAdapters(Cap.deviceList());
    if (list.length === 0) { console.error('[capture] No adapter with a usable IPv4 address found; waiting.'); return; }
    console.error(`[capture] Available adapters:\n${formatCandidates(list)}`);
    if (!process.stdin.isTTY) {
      console.error('[capture] Set "capture.interface" in config.json to one of these addresses.');
      return;
    }
    promptOpen = true; // keep retry messages off the prompt line
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.on('SIGINT', () => { rl.close(); process.emit('SIGINT'); });
    const ask = q => new Promise(resolve => rl.question(q, resolve));
    const chosen = await chooseAdapter(list, ask);
    rl.close();
    promptOpen = false;
    if (everOpened) return; // it appeared while the prompt was open
    if (!chosen) {
      console.error(`[capture] Waiting for "${config.capture.interface || 'capture.interface'}" to appear; retrying every ${config.captureRetryMs / 1000} s.`);
      return;
    }
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
      log(`[sniffer] Capturing UDP ${config.udpPorts.join('/')} — pistes are detected from the messages`);
      return close;
    },
    present: () => adapterPresent(config.capture.interface),
    intervalMs: config.captureRetryMs,
    isQuiet: () => promptOpen,
    isFatal: isFatalCaptureError,
    onFatal: e => {
      console.error(`[capture] ${e.message}`);
      console.error('[capture] Capturing needs privileges: run with sudo (Linux) or as administrator; see the README.');
      process.exit(1);
    },
    log,
  });
  const shutdown = () => {
    log.flush(); capture.stop();
    presence.shutdown(() => client.end(false, {}, () => process.exit(0))); // marks every piste offline
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
