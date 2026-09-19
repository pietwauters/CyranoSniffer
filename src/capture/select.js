'use strict';

// Helps the user pick the capture adapter when the configured one is not found.

const IPV4 = /^\d+\.\d+\.\d+\.\d+$/;

// Self-assigned (APIPA) addresses appear on unplugged and virtual adapters and
// cannot carry the venue's traffic.
const isLinkLocal = ip => ip.startsWith('169.254.');

// Adapters that have a usable IPv4 address (loopback is kept, for simulators).
// `devices` is Cap.deviceList().
function candidateAdapters(devices) {
  const out = [];
  for (const d of devices) {
    for (const a of d.addresses || []) {
      if (!IPV4.test(a.addr) || isLinkLocal(a.addr)) continue;
      out.push({ ip: a.addr, name: d.name, description: d.description || '' });
    }
  }
  return out;
}

function formatCandidates(list) {
  return list.map((c, i) =>
    `  ${i + 1}) ${c.ip.padEnd(15)} ${c.description || c.name}`).join('\n');
}

// Returns the chosen adapter, or null to keep waiting. `ask(prompt)` -> Promise<string>.
async function chooseAdapter(list, ask) {
  for (;;) {
    const answer = (await ask(`Select adapter 1-${list.length} [Enter = keep waiting]: `)).trim();
    if (answer === '') return null;
    const n = parseInt(answer, 10);
    if (n >= 1 && n <= list.length && String(n) === answer) return list[n - 1];
    console.log(`Please enter a number from 1 to ${list.length}.`);
  }
}

module.exports = { candidateAdapters, formatCandidates, chooseAdapter };
