# CyranoSniffer

Passively reads Cyrano (EFP1.1) UDP traffic between a competition management
system and scoring devices, and publishes it as OPP2 to an MQTT broker. It
never sends anything on the Cyrano network, so the existing workflow is untouched.

Runs where it can see the packets: on the CMS PC (Windows + Npcap), or on a
machine attached to a switch mirror port.

Status: skeleton. Capture, parsing, change-detecting publisher and presence
(`apparatus/connection`) work; the Cyrano→OPP2 field mapping awaits real traces.

    cp config.example.json config.json
    npm install
    node src/index.js --verbose
    node src/index.js --replay traces/session.txt   # no hardware needed
    npm test

Trace format for replay: one packet per line, `<src-ip> <dst-ip> <payload>`.
