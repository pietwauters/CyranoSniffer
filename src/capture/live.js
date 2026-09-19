'use strict';

// Live capture via libpcap/Npcap using the optional `cap` module.
// Windows: install Npcap first (https://npcap.com). Linux: run as root or
// setcap cap_net_raw on the node binary.

function loadCap() {
  try {
    return require('cap');
  } catch (e) {
    throw new Error(`Live capture needs the "cap" module (and Npcap on Windows): ${e.message}`);
  }
}

// Prints every capture device with its IPv4 addresses.
function listInterfaces() {
  const { Cap } = loadCap();
  for (const d of Cap.deviceList()) {
    const ips = d.addresses.filter(a => /^\d+\.\d+\.\d+\.\d+$/.test(a.addr)).map(a => a.addr);
    console.log(`${d.name}\n    ${d.description || '(no description)'}\n    IPv4: ${ips.join(', ') || '-'}`);
  }
}

// `iface` may be the IPv4 address of the adapter (recommended) or a device name.
function startLive({ iface, udpPorts }, onPacket) {
  const { Cap, decoders } = loadCap();
  const cap = new Cap();
  const device = /^\d+\.\d+\.\d+\.\d+$/.test(iface || '') ? Cap.findDevice(iface) : (iface || Cap.findDevice());
  if (!device) throw new Error(`No capture device found for "${iface}". Run with --list-interfaces.`);
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

module.exports = { startLive, listInterfaces };
