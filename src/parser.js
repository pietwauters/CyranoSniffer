'use strict';

// Generic EFP1.1 (Cyrano) parser.
//
// Frame layout: |EFP1.1|COMMAND|field|field|...|  with '%' separating sections.
// This only splits the frame; field meaning per command is assigned in
// translator.js once confirmed against captured traces.

function parse(buf) {
  const text = Buffer.isBuffer(buf) ? buf.toString('latin1') : String(buf);
  const parts = text.split('|');
  // A well-formed frame starts and ends with '|', so parts[0] is ''.
  const fields = parts[0] === '' ? parts.slice(1) : parts;
  if (fields.length < 2 || !/^EFP\d/.test(fields[0])) {
    return { ok: false, raw: text };
  }
  if (fields[fields.length - 1] === '') fields.pop();
  const [protocol, command, ...rest] = fields;
  return { ok: true, raw: text, protocol, command, fields: rest };
}

module.exports = { parse };
