# CyranoSniffer

Passively reads Cyrano (EFP1.1) UDP traffic between a competition management
system and scoring devices, and publishes it as OPP2 to an MQTT broker. It
never sends anything on the Cyrano network, so the existing workflow is untouched.

Windows setup: [docs/windows-install.md](docs/windows-install.md).

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
