# CyranoSniffer

Passively reads Cyrano (EFP1.1) UDP traffic between a competition management
system (CMS) and scoring devices, and publishes it as OPP2 to an MQTT broker. It
never sends anything on the Cyrano network, so the existing workflow is untouched.

It runs where it can see the packets: on the CMS PC (Windows with Npcap, or Linux),
or on a machine attached to a switch mirror port. Pistes need no configuration:
the piste id is read from each Cyrano message.

- Windows setup, step by step: [docs/windows-install.md](docs/windows-install.md)
- Linux setup: see [Linux](#linux) below

## Quick start

    cp config.example.json config.json     # set mqttBroker
    npm install
    node src/index.js --verbose            # first run: pick the network adapter
    node src/index.js --replay traces/sample.txt   # no hardware needed
    npm test

## Command-line options

    node src/index.js [options]

| Option | Meaning |
|---|---|
| `-v`, `--verbose` | Log every published topic, skipped and unknown frames, and capture retries. Identical consecutive lines are collapsed into "(last message repeated N more times)". Without it only warnings, errors and `[native]` notices are printed. |
| `--replay <file>` | Feed a text trace through the same code, publish it, then exit. Needs a reachable broker, no capture hardware. The pistes are marked offline again at the end. Trace format: one packet per line, `<src-ip> <dst-ip> <payload>`; lines starting with `#` are ignored. See `traces/sample.txt`. |
| `--list-interfaces` | Print every capture adapter with its IPv4 addresses (including link-local ones), then exit. Needs no config file. |
| `--force` | Translate `apparatus/*` even on pistes that have a native OPP2 apparatus. Same as `"forceTranslate": true`. See [Pistes that already speak OPP2](#pistes-that-already-speak-opp2). |
| `-h`, `--help` | Show the option list. |

Stop the program with Ctrl+C (or SIGTERM): it marks every piste offline before it exits.

## Configuration

Settings are read from `config.json` in the program folder (copy `config.example.json`).
A missing file, or a missing `mqttBroker`, is an error.

| Key | Default | Meaning |
|---|---|---|
| `mqttBroker` | (required) | Broker URL, e.g. `mqtt://openpiste.local` or `mqtt://user:password@host:1883`. The same URL is used for the extra per-piste status connections. |
| `siteId` | `"site"` | A name for this venue. Currently used in the MQTT client ids of the per-piste status connections; reserved for the cloud bridge. |
| `capture.interface` | `""` | The network adapter to capture on: its **IPv4 address** (recommended) or a device name. Empty means "not configured": with a terminal the program lists the adapters and asks you to pick one, which is then saved here; without a terminal it prints the list and keeps retrying. Use `--list-interfaces` to see the choices. |
| `captureRetryMs` | `5000` | How often to retry while the adapter is missing (cable out, DHCP not finished). The program keeps running and also reopens the capture if the adapter disappears and returns. |
| `udpPorts` | `[50100, 50101]` | UDP ports to capture, matched on source or destination. The spec says 50100, but the reference device listens on 50101 and sends to 50100. |
| `apparatusTimeoutMs` | `35000` | A piste's device is marked offline after this long without a frame from it. Devices send at least every ~17 s. |
| `softwareTimeoutMs` | `40000` | The CMS is marked offline for a piste after this long without a HELLO or DISP. The CMS sends HELLO every 15 s. |
| `forceTranslate` | `false` | Same as `--force`. |
| `pistes` | (ignored) | No longer used; piste ids come from the messages. An old `pistes` block only prints a notice and can be deleted. |

## What is published

Topics are `openpiste/{piste}/{publisher}/{message}`, with the OPP2 QoS and retain rules.
The piste id is the Piste field of the Cyrano message (trimmed; `+`, `#` and `/` become `_`).
A frame that leaves it empty uses the piste last seen from the same device IP.

| Cyrano frame | Published as OPP2 |
|---|---|
| `INFO` (device to CMS) | `apparatus/state`, `score`, `lights`, `clock`, `fencers`, `match`; `apparatus/control` `END` when the state becomes `E`; `apparatus/uw2f` when a P-card is issued or cleared |
| `NEXT`, `PREV` (device to CMS) | `apparatus/control` |
| `DISP` (CMS to device) | `software/fencers`, `match`, `score`, `clock` |
| `HELLO` (CMS to device) | `software/connection` |
| `ACK`, `NAK` (CMS to device) | `software/control` |

Only changes are published (except control commands). Notes on the mapping:

- **Clock:** written as OPP2 `"M:SS"` or `"M:SS.cc"` (zero-padded Cyrano text such as
  `01:08` becomes `1:08`; hundredths are added below 10 s). `running` is inferred: the
  stopwatch runs in the Fencing and Pause states. `software/clock` is always paused.
- **`phase_type`** is not in Cyrano: a numeric poule id gives `pool`, anything else `DE`.
- **P-cards** are published without the UW2F timer, which Cyrano does not carry.
- **`black_card`** is always `false`. `blade_contact`, `medical` and `video_review` have no
  Cyrano equivalent and are never published.
- **Invalid values** (a status or priority outside the allowed set) are replaced by the
  default instead of being passed through.

## Connection status

Each piste gets `apparatus/connection` (the device answering on Cyrano) and
`software/connection` (the CMS sending HELLO/DISP), retained, like a native OPP2 device:

- The status goes offline when frames stop (`apparatusTimeoutMs`, `softwareTimeoutMs`).
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
A notice is printed whenever a piste changes between native and not native.

To test with a device that speaks both protocols, translate anyway with `--force` (or
`"forceTranslate": true`). It translates the state topics of native pistes too, but still
never overwrites the native device's own `apparatus/connection`. That retained message is
how the sniffer recognises a native device, so a forced test run cannot make it invisible
afterwards.

A stale `apparatus/connection` with `online: true` and no `device` marker (for example left
by an old test) looks like a native device. Clear such leftovers with an empty retained
message: `mosquitto_pub -h <broker> -r -n -t openpiste/<piste>/apparatus/connection`.

## Log output

With `--verbose` each line starts with a tag:

| Tag | Meaning |
|---|---|
| `[opp2]` | A topic was published |
| `[MQTT]` | Broker connection events |
| `[capture]` | Adapter selection, retries and privilege errors |
| `[native]` | A piste changed between native OPP2 device and Cyrano-only, or `--force` is on |
| `[parse]` | A frame that is not Cyrano, for example EnGarde's own `ENG1` broadcasts. One summary line per sender, destination, tag and size (`... 255.255.255.255:50100-50110 (44 bytes, ENG1) x11`). They are ignored. |
| `[presence …]` | A problem with a per-piste status connection (each distinct error once) |

## Linux

Capturing needs libpcap and permission to open the adapter:

    sudo apt install libpcap-dev build-essential python3
    npm install
    sudo node src/index.js --verbose

If Node comes from nvm, `sudo` does not find it: use `sudo "$(which node)" src/index.js`.
Instead of `sudo` you can grant Node the capability once, which applies to every Node
script on the machine: `sudo setcap cap_net_raw,cap_net_admin=eip "$(readlink -f "$(which node)")"`.
Without the privilege the program stops with a message saying so. `--replay` and the tests
need neither libpcap nor privileges.

## Development

    npm test          # unit tests; also checks that this README lists every option

## License

Apache-2.0. Copyright (c) 2026 Piet Wauters. See [LICENSE](LICENSE).
