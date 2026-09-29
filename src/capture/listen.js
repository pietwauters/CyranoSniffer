'use strict';

const dgram = require('dgram');

// Receives Cyrano frames that a CMS forwards to this machine (EnGarde and
// FencingTime can forward their Cyrano traffic). A plain UDP socket: no pcap,
// no privileges for ports above 1024. It only receives; nothing is ever sent.

// Parses "50100,50101" into [50100, 50101]; null if any entry is not a port.
function parsePorts(text) {
  const ports = String(text).split(',').map(s => s.trim()).filter(Boolean).map(Number);
  if (ports.length === 0 || ports.some(p => !Number.isInteger(p) || p < 0 || p > 65535)) return null;
  return ports;
}

// A short printable view of a datagram for the verbose log.
function preview(payload, max = 100) {
  const text = payload.toString('latin1').replace(/[^\x20-\x7e]/g, c => `\\x${c.charCodeAt(0).toString(16).padStart(2, '0')}`);
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function bindError(port, e) {
  if (e.code === 'EADDRINUSE') {
    return new Error(`UDP port ${port} is already in use on this machine (is a CMS or Cyrano device running here?). Forward to another port and pass it to --listen.`);
  }
  if (e.code === 'EACCES') return new Error(`No permission to listen on UDP port ${port}; use a port above 1024.`);
  return new Error(`Cannot listen on UDP port ${port}: ${e.message}`);
}

// Binds one socket per port. Resolves to { ports, close } once all are bound
// (`ports` holds the actual numbers, so port 0 works in tests); rejects with a
// readable error if any port cannot be bound.
async function startListen({ ports, host = '0.0.0.0' }, onPacket, log = () => {}) {
  const sockets = [];
  const close = () => { for (const s of sockets) { try { s.close(); } catch { /* already closed */ } } };
  try {
    for (const port of ports) {
      const socket = dgram.createSocket('udp4');
      sockets.push(socket);
      await new Promise((resolve, reject) => {
        socket.once('error', e => reject(bindError(port, e)));
        socket.bind(port, host, resolve);
      });
      const local = socket.address().port;
      socket.on('error', e => console.error(`[listen] UDP ${local}: ${e.message}`));
      socket.on('message', (payload, rinfo) => {
        log(`[listen] ${rinfo.address}:${rinfo.port} -> :${local} (${payload.length} bytes) ${preview(payload)}`);
        onPacket({ src: rinfo.address, srcPort: rinfo.port, dst: 'local', dstPort: local, payload });
      });
    }
  } catch (e) {
    close();
    throw e;
  }
  return { ports: sockets.map(s => s.address().port), close };
}

module.exports = { startListen, parsePorts, preview };
