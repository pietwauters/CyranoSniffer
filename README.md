# CyranoSniffer

Passively reads Cyrano (EFP1.1) UDP traffic between a competition management
system and scoring devices, and publishes it as OPP2 to an MQTT broker. It
never sends anything on the Cyrano network, so the existing workflow is untouched.

## Connection status

Each piste gets `apparatus/connection` (the device answering on Cyrano) and
`software/connection` (the CMS sending HELLO/DISP), retained, like a native OPP2
device:

- The status goes offline when frames stop: 35 s for the apparatus and 40 s for the
  CMS (`apparatusTimeoutMs`, `softwareTimeoutMs` in the config).
- Every piste and role has its own MQTT connection with a **Last Will**, so if the
  sniffer crashes or loses the network the broker marks them offline itself. On an
  orderly exit the sniffer marks them offline first.
- After a broker restart or reconnect the sniffer restates the status and every
  retained topic.
- The online message carries `"device": "Cyrano device (via CyranoSniffer)"`, so a
  consumer can tell it from a native OPP2 device.

## Pistes that already speak OPP2

A device that publishes OPP2 itself (for example an ESP32 that also speaks Cyrano to the
CMS) already publishes better data than can be derived from Cyrano. A second, translated
copy on the same retained topics would fight it (flickering clock, blank names: the last
writer wins). So by default:

- The sniffer subscribes to `openpiste/+/apparatus/connection`. A piste whose status is
  `online: true` and does not carry the sniffer's own `device` marker is **native**.
- On a native piste it publishes **no `apparatus/*`**, and gives up its own status entry
  (its Last Will is released cleanly, so it cannot overwrite the native status).
- It still publishes `software/*` from the CMS traffic (fencers, match, score, clock,
  ACK/NAK), which a native device does not publish.
- When the native device goes offline, translation for that piste resumes.

Nothing is published until the retained status has been read, so there is no race at start-up.

To test with a device that speaks both protocols, translate anyway:

    node src/index.js --force          # or "forceTranslate": true in config.json

Windows setup: [docs/windows-install.md](docs/windows-install.md).

Pistes need no configuration: the piste id is read from each Cyrano message.

Runs where it can see the packets: on the CMS PC (Windows + Npcap), or on a
machine attached to a switch mirror port.

Status: working translation of INFO, DISP, HELLO, ACK, NAK, NEXT and PREV to OPP2.

    cp config.example.json config.json
    npm install
    node src/index.js --verbose
    node src/index.js --replay traces/sample.txt   # no hardware needed
    npm test

Trace format for replay: one packet per line, `<src-ip> <dst-ip> <payload>`.

## License

Apache-2.0. Copyright (c) 2026 Piet Wauters. See [LICENSE](LICENSE).
