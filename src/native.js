'use strict';

// Detects pistes that already have a native OPP2 apparatus, so the sniffer does
// not publish a second, translated copy of the same device onto the same
// retained topics (the two would fight; the last writer wins).
//
// A piste is "native" while its retained apparatus/connection says online:true
// and does not carry our own `device` marker. Our own status messages, LWTs
// ({"online":false}) and offline messages never count.

const { DEVICE } = require('./presence');

const TOPIC = 'openpiste/+/apparatus/connection';

class NativeWatcher {
  // `client` is the main MQTT connection. `onChange(pisteId, isNative)` fires on transitions.
  constructor({ client, onChange = () => {}, log = () => {} }) {
    this.client = client;
    this.onChange = onChange;
    this.log = log;
    this.native = new Map(); // piste -> boolean
    this.synced = false;
    this.readyPromise = new Promise(resolve => { this.resolveReady = resolve; });
  }

  start(graceMs = 300) {
    this.client.on('message', (topic, payload) => this.handle(topic, payload));
    // Retained state is delivered right after the SUBACK; give it a moment.
    this.client.subscribe(TOPIC, { qos: 1 }, (err, granted) => {
      if (err || (granted && granted[0] && granted[0].qos === 128)) {
        console.warn(`[native] Could not subscribe to ${TOPIC}; assuming no native OPP2 devices.`);
        this.markSynced(0);
      } else {
        this.markSynced(graceMs);
      }
    });
    return this.readyPromise;
  }

  markSynced(afterMs) {
    setTimeout(() => { this.synced = true; this.resolveReady(); }, afterMs); // short; keeps the process alive on purpose
  }

  ready() { return this.readyPromise; }

  handle(topic, payload) {
    const m = /^openpiste\/([^/]+)\/apparatus\/connection$/.exec(topic);
    if (!m) return;
    let d;
    try { d = JSON.parse(payload.toString()); } catch (e) { return; }
    if (!d || typeof d !== 'object') return;
    const isNative = d.online === true && d.device !== DEVICE;
    const was = this.native.get(m[1]) === true;
    this.native.set(m[1], isNative);
    if (isNative !== was) this.onChange(m[1], isNative);
  }

  isNative(pisteId) { return this.native.get(pisteId) === true; }

  // Publishing translated apparatus/* must wait until we know who is out there.
  blocks(pisteId) { return !this.synced || this.isNative(pisteId); }
}

module.exports = { NativeWatcher };
