'use strict';

// Command-line options. The README documents the same list; test/docs.test.js
// fails if the two drift apart.
const OPTIONS = [
  { flag: '--verbose', alias: '-v', text: 'Log every published topic, skipped and unknown frames, and capture retries' },
  { flag: '--replay', arg: '<file>', text: 'Feed a text trace through the same code, publish, then exit (no capture hardware needed)' },
  { flag: '--list-interfaces', text: 'Print the capture adapters and their IPv4 addresses, then exit' },
  { flag: '--force', text: 'Translate apparatus/* even on pistes with a native OPP2 apparatus (same as "forceTranslate": true)' },
  { flag: '--help', alias: '-h', text: 'Show this help' },
];

function usageText() {
  const rows = OPTIONS.map(o => {
    const left = [o.alias, `${o.flag}${o.arg ? ' ' + o.arg : ''}`].filter(Boolean).join(', ');
    return `  ${left.padEnd(28)}${o.text}`;
  });
  return `Usage: node src/index.js [options]\n\nOptions:\n${rows.join('\n')}\n\nSettings are read from config.json next to the program (see config.example.json).`;
}

module.exports = { OPTIONS, usageText };
