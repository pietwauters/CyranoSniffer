# CLAUDE.md

Guidance for working in this repo, beyond what README.md covers (options, settings, what is
published) and docs/windows-install.md (Windows setup).

## What this is

A passive sniffer: it reads Cyrano (EFP1.1) UDP between a CMS and scoring devices and publishes
OPP2 to MQTT. **It must never send anything on the Cyrano network.** The proven UDP path is
untouched and does not depend on this program; if it crashes, scoring continues.

## Commands

- `npm test` runs `node --test` (no directory argument: Node 22+ rejects `node --test test/`).
- `node src/index.js --replay traces/sample.txt` runs the whole pipeline without hardware; it
  needs a broker. For a throwaway one: a Mosquitto config with `listener 18830 127.0.0.1` and
  `allow_anonymous true`, and a `config.json` pointing at it.
- Live capture needs libpcap (Linux) or Npcap (Windows) and privileges; replay and tests do not.

## Code map

| File | Role |
|---|---|
| `src/index.js` | Wiring, CLI flags, shutdown. Everything else is a module. |
| `src/parser.js` | EFP1.1 frame to named fields (17 general + 12 right + 12 left). |
| `src/translator.js` | Direction and piste resolution, Cyrano to OPP2 mapping, per-command handlers. |
| `src/publisher.js` | Publishes only on change, adds `protocol/version/seq/ts`, suppress hook, `forget`, `resync`. |
| `src/topics.js` | QoS and retain per OPP2 topic, from `level2.md`. |
| `src/presence.js` | `<role>/connection` status, one MQTT connection with a Last Will per (role, piste). |
| `src/native.js` | Detects pistes with a native OPP2 apparatus; `makeSuppress` rule. |
| `src/unknown.js`, `src/collapse.js` | Log summarising for non-Cyrano frames and repeated lines. |
| `src/config.js`, `src/usage.js` | `DEFAULTS` and the CLI option list (both mirrored in README). |
| `src/capture/` | `live.js` (cap/libpcap), `supervisor.js` (retry, watchdog), `select.js` (adapter prompt), `replay.js`. |

## Invariants to keep

- **Direction comes from the command** (HELLO/DISP/ACK/NAK from the CMS; INFO/NEXT/PREV from the
  device), not from IPs. The piste id is the frame's Piste field; an empty field falls back to
  the piste last seen from that device IP. There is no piste configuration.
- **Only changes are published**, except control commands (`force: true`). Suppressed publishes are
  not recorded, so they go out once allowed again.
- **Never overwrite a native device.** On a native piste no `apparatus/*` is published, our status
  connection is released cleanly (`presence.release`, no Last Will), and `--force` still never
  touches its `apparatus/connection`. That retained message is what makes it detectable.
- **A clean MQTT disconnect does not fire the Last Will**, so orderly exit publishes offline first
  (`presence.shutdown`).
- Capture must start once, not inside the MQTT `connect` handler (it fires on every reconnect).
- Clock text is OPP2 `"M:SS"`/`"M:SS.cc"`; never copy Cyrano's zero-padded string.

## Keep docs in step

`test/docs.test.js` fails if the README does not list every option in `src/usage.js` and every
default in `src/config.js`, or if `config.example.json` overrides a default (except `siteId`).
When you add an option or setting, update the code, the README table and that list together.

## Gotchas

- **Hand-typed Cyrano frames are easy to get wrong by one field.** The PDF's own examples are off
  by one too. Build test frames from field arrays (see `mini()` in
  `test/translator.test.js` and `frame()` in `test/native.test.js`) and trust the field table in `docs/` of the ESP32 project.
- Timers that must keep a test alive must not be `unref`'d (an `unref`'d timer let the test's
  event loop exit with a pending promise).
- `cap` is a native module compiled on install (C++ tools on Windows). It is an optional
  dependency, so `npm install` succeeds without it, but live capture then fails with a clear message.
- `ENG1` frames are the CMS vendor's own proprietary broadcasts. They are ignored on purpose; do
  not try to decode them.
- The reference device listens on UDP 50101 and sends to 50100 (the spec says 50100), hence the
  default `udpPorts`.

## Sources of truth

- Cyrano EFP1.1: `docs/CyranoProtocol-1-1.pdf` in the `esp32scoringdeviceMqtt` repo.
- OPP2: `docs/level2.md` in that repo (the copy in `OpenPiste/protocols` is a newer, different version).
- Reference conversion: `src/Opp2Handler.cpp` (`convertOpp2ToCyrano`, `convertCyranoToOpp2*`) there.

## Workflow

- Commit before experimenting. Never undo a temporary edit with `git checkout <file>` on a file
  that has uncommitted work: it restores the last commit and discards the work. Restore from a copy.
- Commit locally, then ask before pushing: this is a public repository.
