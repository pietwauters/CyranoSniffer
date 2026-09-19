'use strict';

// Wraps a line-logging function so identical consecutive lines are printed once,
// followed by "(last message repeated N more times)". The summary comes when a
// different line arrives, when repeats stop for `idleMs`, or at the latest
// `maxHoldMs` after the first repeat, so a steady stream is still visibly alive.
function collapseRepeats(out, { idleMs = 1000, maxHoldMs = 5000 } = {}) {
  let last = null, count = 0, idle = null, hard = null;

  function flush() {
    clearTimeout(idle); clearTimeout(hard); idle = hard = null;
    if (count > 0) out(`  (last message repeated ${count} more time${count > 1 ? 's' : ''})`);
    count = 0;
    last = null; // an identical line after a summary starts a fresh run
  }

  function log(...args) {
    const line = args.join(' ');
    if (line === last) {
      count++;
      clearTimeout(idle);
      idle = setTimeout(flush, idleMs);
      if (!hard) hard = setTimeout(flush, maxHoldMs);
      idle.unref && idle.unref();
      hard.unref && hard.unref();
      return;
    }
    flush();
    last = line;
    out(line);
  }
  log.flush = flush;
  return log;
}

module.exports = { collapseRepeats };
