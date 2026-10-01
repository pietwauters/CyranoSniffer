'use strict';

const fs = require('fs');

// --trace: appends every received frame to a text file, in the format --replay
// reads (<src> <dst> <payload>, one per line), so a real session can be kept,
// shared and replayed. Forwarded frames are written with their local port as
// destination ("local:50201").
function openTrace(file) {
  const fd = fs.openSync(file, 'a');
  fs.writeSync(fd, `# CyranoSniffer trace, started ${new Date().toISOString()}\n`);
  return ({ src, dst, dstPort, payload }) => {
    const text = payload.toString('latin1').replace(/[\r\n]+/g, ' ').trimEnd();
    const to = dst === 'local' ? `local:${dstPort}` : dst;
    fs.writeSync(fd, `${src} ${to} ${text}\n`); // UTF-8, as --replay reads it; each byte comes back unchanged
  };
}

module.exports = { openTrace };
