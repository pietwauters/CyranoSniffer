'use strict';

// Cyrano frame -> OPP2 messages, per piste.
//
// Direction comes from the command (HELLO/DISP/ACK/NAK are sent by the CMS,
// INFO/NEXT/PREV by the apparatus). The piste is the Piste field of the frame,
// so no configuration is needed. Some incomplete INFO frames leave it empty;
// for those we use the piste last seen from the same device IP. Mapping follows Opp2Handler::convertCyranoTo*
// and convertOpp2ToCyrano in esp32scoringdeviceMqtt, and level2.md.

const { parse } = require('./parser');

const STATES = new Set(['F', 'H', 'P', 'W', 'E']);
const FROM_SOFTWARE = new Set(['HELLO', 'DISP', 'ACK', 'NAK']);
const FROM_APPARATUS = new Set(['INFO', 'NEXT', 'PREV']);

const addr = (ip, port) => (port ? `${ip}:${port}` : ip);

const int = (s, dflt = 0) => { const n = parseInt(s, 10); return Number.isNaN(n) ? dflt : n; };
const has = o => Object.values(o).some(v => v !== '');

// Cyrano stopwatch ("1:09", "01:09", "1:09.25") -> OPP2 { time_ms, time }.
// OPP2 wants "M:SS" or "M:SS.cc" (no leading zero on the minutes; hundredths
// mandatory below 10 s), whereas some devices send zero-padded "01:09".
function parseClock(s) {
  const m = /^(\d+):(\d{1,2})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const cs = m[3] === undefined ? 0 : parseInt(m[3].padEnd(2, '0'), 10);
  const time_ms = (int(m[1]) * 60 + int(m[2])) * 1000 + cs * 10;
  const pad = n => String(n).padStart(2, '0');
  let time = `${Math.floor(time_ms / 60000)}:${pad(Math.floor(time_ms / 1000) % 60)}`;
  if (m[3] !== undefined || time_ms < 10000) time += `.${pad(cs)}`;
  return { time_ms, time };
}

function fencerBody(side) {
  return { id: side.id, name: side.name, nation: side.nation };
}

function fencersBody(f) {
  if (!f.right.id && !f.right.name && !f.left.id && !f.left.name) return null;
  const body = { left: { fencer: fencerBody(f.left) }, right: { fencer: fencerBody(f.right) } };
  if (f.refId || f.refName || f.refNation) {
    body.common = { referee: { id: f.refId, name: f.refName, nation: f.refNation } };
  }
  return body;
}

// Cyrano has no phase type. Per the spec, PoulTab is a number for a poule and
// an identifier such as "A32" for a tableau, so infer from that.
const phaseType = poule => (/^\d+$/.test(poule) ? 'pool' : 'DE');

function matchBody(f) {
  if (!f.weapon && !f.competition && !f.poule) return null;
  const body = {
    weapon: f.weapon, type: f.type || 'I', competition: f.competition,
    phase_type: phaseType(f.poule), phase: f.phase, poule: f.poule,
    match: int(f.match), round: int(f.round, 1),
  };
  if (/^\d{1,2}:\d{2}$/.test(f.time)) body.scheduled = f.time;
  return body;
}

const STATUSES = new Set(['U', 'V', 'D', 'A', 'E', 'DNS']);
const oneOf = (set, v, dflt) => (set.has(v) ? v : dflt);

function sideScore(s) {
  return {
    score: int(s.score), status: oneOf(STATUSES, s.status, 'U'),
    yellow_card: int(s.yCard) > 0, red_cards: int(s.rCard), black_card: false,
  };
}

function scoreBody(f) {
  return { right: sideScore(f.right), left: sideScore(f.left), priority: oneOf(new Set(['N', 'R', 'L']), f.priority, 'N') };
}

function clockBody(f, running) {
  const c = parseClock(f.stopwatch);
  return c && { running, ...c };
}

// Piste ids become an MQTT topic level: no wildcards or level separators.
const cleanPiste = s => s.trim().replace(/[+#/\0]/g, '_');

const isBroadcast = ip => ip === '255.255.255.255' || ip.endsWith('.255') || parseInt(ip, 10) >= 224;

class Translator {
  // `suppressed(pisteId, key)` -> true while a native OPP2 apparatus owns apparatus/*.
  constructor({ publisher, presence, suppressed = () => false, log = () => {} }) {
    this.pub = publisher;
    this.presence = presence;
    this.suppressed = suppressed;
    this.learned = new Map();       // device IP -> piste id, from frames that carried one
    this.log = log;
    this.lastState = new Map();  // piste -> last apparatus state
    this.hadPCard = new Set();   // pistes whose last uw2f had a P-card
  }

  handlePacket({ src, dst, srcPort, dstPort, payload }) {
    const route = `${addr(src, srcPort)} -> ${addr(dst, dstPort)}`;
    const f = parse(payload);
    if (!f.ok) { this.log(`[parse] not EFP ${route} (${payload.length} bytes): ${f.raw.slice(0, 40)}`); return; }

    const fromSoftware = FROM_SOFTWARE.has(f.command);
    if (!fromSoftware && !FROM_APPARATUS.has(f.command)) { this.log(`[cyrano] unknown ${f.command} ${route}`); return; }

    const pisteId = this.resolvePiste(fromSoftware ? dst : src, f.piste);
    if (!pisteId) return;

    const handler = this[`on${f.command}`];
    handler.call(this, pisteId, f);
  }

  // deviceIp is the device end of the packet.
  resolvePiste(deviceIp, pisteField) {
    const id = cleanPiste(pisteField);
    if (id) {
      if (!isBroadcast(deviceIp)) this.learned.set(deviceIp, id);
      return id;
    }
    return this.learned.get(deviceIp) || null;
  }

  // ── Software → apparatus ────────────────────────────────────────────────

  onHELLO(id) { this.alive(id, 'software'); }

  onDISP(id, f) {
    this.alive(id, 'software');
    const fencers = fencersBody(f);
    if (fencers) this.pub.publish(id, 'software/fencers', fencers);
    const match = matchBody(f);
    if (match) this.pub.publish(id, 'software/match', match);
    this.pub.publish(id, 'software/score', scoreBody(f));
    const clock = clockBody(f, false); // software/clock is always paused
    if (clock) this.pub.publish(id, 'software/clock', clock);
  }

  onACK(id) { this.pub.publish(id, 'software/control', { command: 'ACK' }, { force: true }); }
  onNAK(id) { this.pub.publish(id, 'software/control', { command: 'NAK' }, { force: true }); }

  // ── Apparatus → software ────────────────────────────────────────────────

  onNEXT(id) { this.alive(id, 'apparatus'); this.pub.publish(id, 'apparatus/control', { command: 'NEXT' }, { force: true }); }
  onPREV(id) { this.alive(id, 'apparatus'); this.pub.publish(id, 'apparatus/control', { command: 'PREV' }, { force: true }); }

  onINFO(id, f) {
    this.alive(id, 'apparatus');

    if (STATES.has(f.state)) {
      this.pub.publish(id, 'apparatus/state', { state: f.state });
      // END is a button press; the apparatus signals it by entering Ending.
      if (f.state === 'E' && this.lastState.get(id) !== 'E') {
        this.pub.publish(id, 'apparatus/control', { command: 'END' }, { force: true });
      }
      this.lastState.set(id, f.state);
    }

    this.pub.publish(id, 'apparatus/score', scoreBody(f));
    this.pub.publish(id, 'apparatus/lights', {
      right: { green: f.right.light === '1', white: f.right.whiteLight === '1' },
      left:  { red:   f.left.light === '1',  white: f.left.whiteLight === '1' },
    });

    // Cyrano says a stopwatch runs in Fencing and Pause states.
    const clock = clockBody(f, f.state === 'F' || f.state === 'P');
    if (clock) this.pub.publish(id, 'apparatus/clock', clock);

    const fencers = fencersBody(f);
    if (fencers) this.pub.publish(id, 'apparatus/fencers', fencers);
    const match = matchBody(f);
    if (match) this.pub.publish(id, 'apparatus/match', match);

    // P-cards only: Cyrano carries no UW2F timer, so time_ms/time are omitted
    // (a deliberate deviation from OPP2's "at least one of" rule). Published
    // once a card appears, and again if it later clears.
    const p = { right: { p_card: int(f.right.pCard) }, left: { p_card: int(f.left.pCard) } };
    const any = p.right.p_card > 0 || p.left.p_card > 0;
    if (any || this.hadPCard.has(id)) {
      this.pub.publish(id, 'apparatus/uw2f', p);
      if (any) this.hadPCard.add(id); else this.hadPCard.delete(id);
    }
  }

  // ── Presence ────────────────────────────────────────────────────────────

  alive(pisteId, role) {
    // No status entry (and so no Last Will or timer) for a piste a native device owns.
    if (role === 'apparatus' && this.suppressed(pisteId, 'apparatus/connection')) return;
    this.presence.alive(pisteId, role);
  }

  stop() { this.presence.close(); }
}

module.exports = { Translator, parseClock };
