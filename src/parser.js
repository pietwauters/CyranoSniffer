'use strict';

// EFP1.1 (Cyrano) parser. Layout per docs/CyranoProtocol-1-1.pdf §6:
//   |EFP1.1|CMD|<17 general fields>|%|<12 right-fencer fields>|%|<12 left-fencer fields>|%|
// Empty values are consecutive '|'; trailing empty fields and empty areas may
// be omitted, so every area is padded to its full width.

const GENERAL = ['protocol', 'command', 'piste', 'competition', 'phase', 'poule',
  'match', 'round', 'time', 'stopwatch', 'type', 'weapon', 'priority', 'state',
  'refId', 'refName', 'refNation'];
const FENCER = ['id', 'name', 'nation', 'score', 'status', 'yCard', 'rCard',
  'light', 'whiteLight', 'medical', 'reserve', 'pCard'];

function splitArea(text) {
  if (text.startsWith('|')) text = text.slice(1);
  if (text.endsWith('|')) text = text.slice(0, -1);
  return text === '' ? [] : text.split('|');
}

function toObject(names, values) {
  const o = {};
  names.forEach((n, i) => { o[n] = values[i] === undefined ? '' : values[i]; });
  return o;
}

function parse(buf) {
  const text = Buffer.isBuffer(buf) ? buf.toString('latin1') : String(buf);
  const areas = text.trim().split('%');
  const general = splitArea(areas[0]);
  if (general.length < 2 || !/^EFP1/.test(general[0])) return { ok: false, raw: text };
  return {
    ok: true,
    raw: text,
    ...toObject(GENERAL, general),
    right: toObject(FENCER, splitArea(areas[1] || '')),
    left:  toObject(FENCER, splitArea(areas[2] || '')),
  };
}

module.exports = { parse };
