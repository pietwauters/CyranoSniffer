'use strict';

// Cyrano frame -> OPP2 messages, per piste.
//
// Direction comes from the command (HELLO/DISP/ACK/NAK are sent by the CMS,
// INFO/NEXT/PREV by the apparatus); the device IP on the other end of the
// packet identifies the piste. Mapping follows Opp2Handler::convertCyranoTo*
// and convertOpp2ToCyrano in esp32scoringdeviceMqtt, and level2.md.

const { parse } = require('./parser');

const STATES = new Set(['F', 'H', 'P', 'W', 'E']);
const FROM_SOFTWARE = new Set(['HELLO', 'DISP', 'ACK', 'NAK']);
const FROM_APPARATUS = new Set(['INFO', 'NEXT', 'PREV']);

const int = (s, dflt = 0) => { const n = parseInt(s, 10); return Number.isNaN(n) ? dflt : n; };
const has = o => Object.values(o).some(v => v !== '');

// "1:09", "1:09.25", "3:00" -> { time_ms, time }
function parseClock(s) {
  const m = /^(\d+):(\d{1,2})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const cs = m[3] === undefined ? 0 : parseInt(m[3].padEnd(2, '0'), 10);
  return { time_ms: (int(m[1]) * 60 + int(m[2])) * 1000 + cs * 10, time: s };
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

class Translator {
  constructor({ publisher, pisteByIp, pisteIds = [], softwareTimeoutMs = 40000,
                apparatusTimeoutMs = 45000, log = () => {} }) {
    this.pub = publisher;
    this.pisteByIp = pisteByIp;
    this.pisteIds = new Set(pisteIds);
    this.timeouts = { apparatus: apparatusTimeoutMs, software: softwareTimeoutMs };
    this.log = log;
    this.timers = new Map();     // "<role>/<piste>" -> silence timer
    this.lastState = new Map();  // piste -> last apparatus state
    this.hadPCard = new Set();   // pistes whose last uw2f had a P-card
  }

  handlePacket({ src, dst, payload }) {
    const f = parse(payload);
    if (!f.ok) { this.log(`[parse] not EFP: ${f.raw.slice(0, 40)}`); return; }

    const fromSoftware = FROM_SOFTWARE.has(f.command);
    if (!fromSoftware && !FROM_APPARATUS.has(f.command)) { this.log(`[cyrano] unknown ${f.command}`); return; }

    const pisteId = this.pisteByIp.get(fromSoftware ? dst : src)
      || (this.pisteIds.has(f.piste) ? f.piste : null);
    if (!pisteId) return;

    const handler = this[`on${f.command}`];
    handler.call(this, pisteId, f);
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

  // Publishes online, and offline after a silence timeout (no broker LWT here).
  alive(pisteId, role) {
    const key = `${role}/${pisteId}`;
    this.pub.publish(pisteId, `${role}/connection`, { online: true });
    clearTimeout(this.timers.get(key));
    const t = setTimeout(() => {
      this.pub.publish(pisteId, `${role}/connection`, { online: false }, { force: true });
    }, this.timeouts[role]);
    t.unref && t.unref();
    this.timers.set(key, t);
  }

  stop() { this.timers.forEach(clearTimeout); this.timers.clear(); }
}

module.exports = { Translator, parseClock };
