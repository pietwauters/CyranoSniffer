'use strict';

// Cyrano frame -> OPP2 messages, per piste.
//
// Direction comes from the source IP: the CMS sends to the device, the device
// replies. Field mapping (INFO -> state/score/clock/fencers/lights, DISP ->
// software/match+fencers, ...) is intentionally NOT implemented yet: it needs
// the real traces to be confirmed. Add one handler per command below.

const { parse } = require('./parser');

class Translator {
  constructor({ publisher, pisteByIp, cmsIp, silenceTimeoutMs, log = () => {} }) {
    this.pub = publisher;
    this.pisteByIp = pisteByIp;
    this.cmsIp = cmsIp;
    this.silenceTimeoutMs = silenceTimeoutMs;
    this.log = log;
    this.timers = new Map(); // pisteId -> silence timer
  }

  // src/dst are IPv4 strings from the captured packet.
  handlePacket({ src, dst, payload }) {
    const fromCms = src === this.cmsIp;
    const pisteId = this.pisteByIp.get(fromCms ? dst : src);
    if (!pisteId) return;

    const frame = parse(payload);
    if (!frame.ok) { this.log(`[parse] not EFP: ${frame.raw.slice(0, 40)}`); return; }

    if (!fromCms) this.touchApparatus(pisteId);

    const handler = this.handlers[`${fromCms ? 'cms' : 'dev'}:${frame.command}`];
    if (handler) handler.call(this, pisteId, frame);
    else this.log(`[${pisteId}] unmapped ${fromCms ? 'CMS' : 'device'} ${frame.command}`);
  }

  // Device is alive: publish online, (re)arm the silence timer.
  touchApparatus(pisteId) {
    this.pub.publish(pisteId, 'apparatus/connection', { online: true });
    clearTimeout(this.timers.get(pisteId));
    this.timers.set(pisteId, setTimeout(() => {
      this.pub.publish(pisteId, 'apparatus/connection', { online: false }, { force: true });
    }, this.silenceTimeoutMs));
  }

  stop() { this.timers.forEach(clearTimeout); this.timers.clear(); }
}

// Command handlers, keyed "cms:<CMD>" or "dev:<CMD>". Filled in after traces.
Translator.prototype.handlers = {};

module.exports = { Translator };
