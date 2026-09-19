'use strict';

// Summarises frames that are not Cyrano (for example a broadcast sent to many
// ports) into one log line per sender, destination address, tag and size,
// instead of one line per packet.

const addr = (ip, port) => (port ? `${ip}:${port}` : ip);

// [50100,50101,50102,50105] -> "50100-50102,50105"
function formatPorts(ports) {
  const sorted = [...ports].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < sorted.length;) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    out.push(j > i ? `${sorted[i]}-${sorted[j]}` : String(sorted[i]));
    i = j + 1;
  }
  return out.join(',');
}

class UnknownFrames {
  constructor({ log, flushMs = 1000 }) {
    this.log = log;
    this.flushMs = flushMs;
    this.groups = new Map();
    this.timer = null;
  }

  add({ src, srcPort, dst, dstPort, payload }) {
    const text = payload.toString('latin1');
    const tag = (/^\|([A-Za-z0-9.]+)\|/.exec(text) || [])[1] || '?';
    const key = `${addr(src, srcPort)} -> ${dst} ${tag} ${payload.length}`;
    let g = this.groups.get(key);
    if (!g) {
      g = { src: addr(src, srcPort), dst, tag, bytes: payload.length, ports: new Set(), count: 0, sample: text.slice(0, 40) };
      this.groups.set(key, g);
    }
    if (dstPort) g.ports.add(dstPort);
    g.count++;
    if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.flushMs);
      this.timer.unref && this.timer.unref();
    }
  }

  flush() {
    clearTimeout(this.timer);
    this.timer = null;
    for (const g of this.groups.values()) {
      const to = g.ports.size ? `${g.dst}:${formatPorts(g.ports)}` : g.dst;
      const times = g.count > 1 ? ` x${g.count}` : '';
      this.log(`[parse] not EFP ${g.src} -> ${to} (${g.bytes} bytes, ${g.tag})${times}: ${g.sample}`);
    }
    this.groups.clear();
  }
}

module.exports = { UnknownFrames, formatPorts };
