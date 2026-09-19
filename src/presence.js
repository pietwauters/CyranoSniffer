'use strict';

// Connection status (`<role>/connection`) per piste, like a native OPP2 device.
//
// Each (role, piste) gets its own MQTT connection with a Last Will
// {"online": false}, retained, QoS 1 (level2.md §4.6). If the sniffer dies or
// loses the network, the broker itself marks those pistes offline. A single
// connection could carry only one will, hence one per piste.
//
// While the sniffer runs, a piste goes offline when its frames stop for
// `timeouts[role]` ms. Cyrano devices send at least every ~17 s, the CMS HELLOs
// every 15 s.

const mqtt   = require('mqtt');
const crypto = require('crypto');

const DEVICE = 'Cyrano device (via CyranoSniffer)';

class Presence {
  constructor({ brokerUrl, siteId = 'site', publisher, timeouts, connect = mqtt.connect, log = () => {} }) {
    this.brokerUrl = brokerUrl;
    this.siteId = String(siteId).replace(/[^\w.-]/g, '_');
    this.pub = publisher;
    this.timeouts = timeouts;
    this.connect = connect;
    this.log = log;
    this.run = crypto.randomBytes(3).toString('hex'); // keeps two sniffers from evicting each other
    this.entries = new Map(); // "<role>/<piste>" -> { client, role, pisteId, online, timer }
  }

  static topic(pisteId, role) { return `openpiste/${pisteId}/${role}/connection`; }

  bodyFor(role, online) {
    if (!online) return { online: false };
    return role === 'apparatus' ? { online: true, device: DEVICE } : { online: true };
  }

  entry(pisteId, role) {
    const key = `${role}/${pisteId}`;
    let e = this.entries.get(key);
    if (e) return e;
    const clientId = `cyranosniffer-${this.siteId}-${this.run}-${role}-${pisteId}`;
    const client = this.connect(this.brokerUrl, {
      clientId,
      will: { topic: Presence.topic(pisteId, role), payload: JSON.stringify({ online: false }), qos: 1, retain: true },
    });
    e = { client, role, pisteId, online: false, timer: null };
    // (Re)connected: state the current status. After a dropped connection the
    // broker has published our will, so the status must be restated.
    let lastError = null; // one line per distinct error, not one per retry
    client.on('connect', () => { lastError = null; if (e.online) this.publish(e, true); });
    client.on('error', err => {
      if (err.message === lastError) return;
      lastError = err.message;
      console.error(`[presence ${key}] ${err.message}`);
    });
    this.entries.set(key, e);
    return e;
  }

  publish(e, force = false) {
    this.pub.publish(e.pisteId, `${e.role}/connection`, this.bodyFor(e.role, e.online), { client: e.client, force });
  }

  // Frame seen from this role on this piste.
  alive(pisteId, role) {
    const e = this.entry(pisteId, role);
    e.online = true;
    if (e.client.connected) this.publish(e); // otherwise the 'connect' handler does it
    clearTimeout(e.timer);
    e.timer = setTimeout(() => this.setOffline(e), this.timeouts[role]);
    e.timer.unref && e.timer.unref();
  }

  setOffline(e) {
    clearTimeout(e.timer);
    e.timer = null;
    if (!e.online) return;
    e.online = false;
    this.publish(e, true);
  }

  // Immediate teardown; does not publish (tests, and the process ending anyway).
  close() {
    for (const e of this.entries.values()) { clearTimeout(e.timer); e.client.end(true); }
    this.entries.clear();
  }

  // Orderly exit: a clean disconnect does NOT trigger the will, so mark every
  // online piste offline ourselves first. `done` is always called.
  shutdown(done, maxWaitMs = 2000) {
    const list = [...this.entries.values()];
    list.forEach(e => { clearTimeout(e.timer); e.timer = null; if (e.online && e.client.connected) this.setOffline(e); });
    let pending = list.length;
    const finish = () => { if (done) { const d = done; done = null; d(); } };
    if (pending === 0) return finish();
    const timer = setTimeout(finish, maxWaitMs);
    timer.unref && timer.unref();
    list.forEach(e => e.client.end(false, {}, () => { if (--pending === 0) { clearTimeout(timer); finish(); } }));
    this.entries.clear();
  }
}

module.exports = { Presence };
