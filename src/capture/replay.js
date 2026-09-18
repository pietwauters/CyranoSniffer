'use strict';

const fs = require('fs');

// Replays a text trace through the same pipeline as live capture.
// One packet per line:  <src-ip> <dst-ip> <payload>
// Lines starting with '#' and blank lines are ignored.
function replay(file, onPacket) {
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line.trim() || line.startsWith('#')) continue;
    const m = line.match(/^(\S+)\s+(\S+)\s+(.*)$/);
    if (m) onPacket({ src: m[1], dst: m[2], payload: Buffer.from(m[3], 'latin1') });
  }
}

module.exports = { replay };
