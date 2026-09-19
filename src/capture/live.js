'use strict';

// Live capture via libpcap/Npcap using the optional `cap` module.
// Windows: install Npcap first (https://npcap.com). Linux: run as root or
// setcap cap_net_raw on the node binary.

function startLive({ iface, udpPorts }, onPacket) {
  let Cap, decoders;
  try {
    ({ Cap, decoders } = require('cap'));
  } catch (e) {
    throw new Error(`Live capture needs the "cap" module (and Npcap on Windows): ${e.message}`);
  }
  const cap = new Cap();
  const device = iface || Cap.findDevice();
  const buffer = Buffer.alloc(65535);
  const linkType = cap.open(device, `udp and (${udpPorts.map(p => `port ${p}`).join(' or ')})`, 10 * 1024 * 1024, buffer);
  cap.setMinBytes && cap.setMinBytes(0);

  cap.on('packet', nbytes => {
    if (linkType !== 'ETHERNET') return;
    const eth = decoders.Ethernet(buffer);
    if (eth.info.type !== decoders.PROTOCOL.ETHERNET.IPV4) return;
    const ip = decoders.IPV4(buffer, eth.offset);
    if (ip.info.protocol !== decoders.PROTOCOL.IP.UDP) return;
    const udp = decoders.UDP(buffer, ip.offset);
    const payload = Buffer.from(buffer.subarray(udp.offset, ip.offset + ip.info.totallen));
    onPacket({ src: ip.info.srcaddr, dst: ip.info.dstaddr, payload });
  });
  return () => cap.close();
}

module.exports = { startLive };
