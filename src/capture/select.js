'use strict';

// Helps the user pick the capture adapter when the configured one is not found.

const IPV4 = /^\d+\.\d+\.\d+\.\d+$/;
const net24 = ip => ip.split('.').slice(0, 3).join('.');

// Adapters that have an IPv4 address, those on the same /24 as a configured
// piste device first. `devices` is Cap.deviceList().
function candidateAdapters(devices, pisteIps) {
  const pisteNets = new Set(pisteIps.filter(ip => IPV4.test(ip)).map(net24));
  const out = [];
  for (const d of devices) {
    for (const a of d.addresses || []) {
      if (!IPV4.test(a.addr)) continue;
      out.push({ ip: a.addr, name: d.name, description: d.description || '', sameNetwork: pisteNets.has(net24(a.addr)) });
    }
  }
  return out.sort((a, b) => Number(b.sameNetwork) - Number(a.sameNetwork));
}

function formatCandidates(list) {
  return list.map((c, i) =>
    `  ${i + 1}) ${c.ip.padEnd(15)} ${c.description || c.name}${c.sameNetwork ? '   <- same network as your pistes' : ''}`).join('\n');
}

// Returns the chosen adapter, or null to keep waiting. `ask(prompt)` -> Promise<string>.
// Enter picks the only adapter on the pistes' network, if there is exactly one.
async function chooseAdapter(list, ask) {
  const matching = list.filter(c => c.sameNetwork);
  const dflt = matching.length === 1 ? matching[0] : null;
  const hint = dflt ? `[Enter = ${list.indexOf(dflt) + 1}]` : '[Enter = keep waiting]';
  for (;;) {
    const answer = (await ask(`Select adapter 1-${list.length} ${hint}: `)).trim();
    if (answer === '') return dflt;
    const n = parseInt(answer, 10);
    if (n >= 1 && n <= list.length && String(n) === answer) return list[n - 1];
    console.log(`Please enter a number from 1 to ${list.length}.`);
  }
}

module.exports = { candidateAdapters, formatCandidates, chooseAdapter };
