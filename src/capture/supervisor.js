'use strict';

// Keeps a capture running for as long as the process lives.
//
// Opening fails while the adapter is missing (cable out, DHCP not done, PC
// waking up) -> retry. `cap` never reports a capture that died mid-run, so
// while open we also poll that the adapter still exists and reopen if it went.
// Errors that retrying cannot fix (permissions, missing module) are fatal.
//
//   open()    -> returns a close() function, or throws
//   present() -> true while the adapter exists
function superviseCapture({ open, present, intervalMs = 5000, log = () => {},
                            isFatal = () => false, onFatal = () => {}, reminderEvery = 12 }) {
  let close = null;
  let failures = 0;

  function attempt() {
    if (close) {
      if (present()) return;
      console.warn('[capture] Adapter disappeared, waiting for it to come back');
      try { close(); } catch (e) { /* already gone */ }
      close = null;
      failures = 0;
      return;
    }
    try {
      close = open();
      failures = 0;
    } catch (e) {
      if (isFatal(e)) { onFatal(e); return; }
      // Say so on the first failure, then only now and then.
      if (failures++ % reminderEvery === 0) {
        console.error(`[capture] ${e.message} — retrying every ${intervalMs / 1000} s`);
      } else {
        log(`[capture] still waiting: ${e.message}`);
      }
    }
  }

  const timer = setInterval(attempt, intervalMs);
  attempt();
  return { stop() { clearInterval(timer); if (close) { try { close(); } catch (e) { /* ignore */ } close = null; } } };
}

module.exports = { superviseCapture };
