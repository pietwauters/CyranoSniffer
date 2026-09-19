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
