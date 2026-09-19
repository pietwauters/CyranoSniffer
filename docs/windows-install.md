# Installing CyranoSniffer on Windows

For the demo setup: CyranoSniffer runs on the **same Windows PC as the CMS**, so it
sees every Cyrano packet without any network changes. It only listens; it never
sends anything on the Cyrano network. It sends its output to an MQTT broker.

Tested here: the code and the unit tests on Linux, and the `cap` module compiling
on Node 20. **Live capture on Windows itself has not been tested yet.**

You need administrator rights for steps 1–3 (once). Use a normal PowerShell for the rest.

## 1. Npcap (the packet-capture driver)

1. Download the installer from <https://npcap.com> ("Npcap installer").
2. Run it and **tick "Install Npcap in WinPcap API-compatible Mode"**. Without it the
   sniffer cannot load `wpcap.dll`.
3. Leave "Restrict Npcap driver's access to Administrators only" **unticked**, so
   a normal user can capture.

## 2. Node.js 20 LTS

1. Download the **Node.js 20 LTS** Windows installer from <https://nodejs.org>.
   Use 20, not a newer release: the `cap` module was compiled successfully on 20,
   and newer versions are untested.
2. On the "Tools for Native Modules" page, **tick "Automatically install the necessary
   tools"**. It opens a second window that installs Python and the Visual Studio
   C++ Build Tools. This takes 10–20 minutes. Let it finish.

If you skipped that option, install the tools by hand in an administrator PowerShell:

```powershell
winget install Python.Python.3.12
winget install Microsoft.VisualStudio.2022.BuildTools --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

Then **close and reopen PowerShell** so that `node` and `npm` are found. Check:

```powershell
node -v      # v20.x
npm -v
```

## 3. Get the code

With Git (`winget install Git.Git`, then reopen PowerShell):

```powershell
cd $HOME
git clone https://github.com/pietwauters/CyranoSniffer.git
cd CyranoSniffer
```

Without Git: download the ZIP from the GitHub page ("Code" > "Download ZIP"), unzip it,
and open PowerShell in that folder.

## 4. Install the dependencies

```powershell
npm install
```

This builds the `cap` module, which is why step 2 needs the C++ tools. It should end
without errors (warnings are fine). To confirm that it loaded:

```powershell
node src\index.js --list-interfaces
```

You should see your network adapters with their IP addresses. If instead you get
"Cannot find module 'cap'", see Troubleshooting.

## 5. Configure

```powershell
copy config.example.json config.json
notepad config.json
```

| Field | What to put |
|---|---|
| `mqttBroker` | Broker URL, e.g. `mqtt://192.168.0.5` (the Pi) or `mqtt://localhost` |
| `siteId` | A name for this venue (reserved for the cloud bridge) |
| `udpPorts` | Leave at `[50100, 50101]` |
| `capture.interface` | The **IPv4 address of this PC's wired network adapter**, the one the devices are on. Find it with `--list-interfaces` or `ipconfig` |
| `pistes` | One entry per piste: `"id"` is the name used in the MQTT topic (e.g. `"1"` or `"Red"`) and `"deviceIp"` is the scoring device's IP address |

Example:

```json
{
  "mqttBroker": "mqtt://192.168.0.5",
  "siteId": "demo",
  "udpPorts": [50100, 50101],
  "capture": { "interface": "192.168.0.10" },
  "pistes": [
    { "id": "1", "deviceIp": "192.168.0.101" },
    { "id": "2", "deviceIp": "192.168.0.102" }
  ]
}
```

## 6. Try it without hardware

Needs a reachable broker (see step 7). This replays a recorded session through the same
code path:

```powershell
node src\index.js --replay traces\sample.txt --verbose
```

## 7. A broker to publish to

The broker can be the Raspberry Pi or any machine on the network. For a quick local one on
this PC, install Mosquitto from <https://mosquitto.org/download/>, then add these lines to
`mosquitto.conf` in its install folder and restart the "Mosquitto Broker" service:

```
listener 1883
allow_anonymous true
```

Only do that on a trusted network. Watch what arrives (from a machine with the Mosquitto tools):

```powershell
mosquitto_sub -h <broker-ip> -t "openpiste/#" -v
```

## 8. Run it

```powershell
node src\index.js --verbose
```

Start the CMS as usual. You should see `[sniffer] Capturing UDP ...`, then OPP2 lines as the
CMS and devices exchange messages. Stop with Ctrl+C. Without `--verbose` it stays quiet.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `npm install` fails: `gyp ERR! find VS` or `find Python` | The C++ tools or Python are missing. Redo step 2 and reopen PowerShell. |
| `Cannot find module 'cap'` or `wpcap.dll` not found | `npm install` failed to build `cap`, or Npcap was installed without WinPcap-compatible mode. Reinstall Npcap with that box ticked, then run `npm install` again. |
| `No capture device found` | `capture.interface` does not match any adapter's IPv4. Copy the address from `--list-interfaces`. |
| Capturing, but no messages | Wrong adapter (for example Wi-Fi while the devices are on Ethernet), or a `deviceIp` that does not match. Turn on `--verbose`: unmatched packets are ignored silently. Also check that the CMS uses port 50100 or 50101. |
| Permission error opening the device | Run PowerShell as administrator, or reinstall Npcap without the "administrators only" option. |
| Traffic between the CMS and a device running **on the same PC** is invisible | Npcap cannot capture Windows loopback unless the Npcap Loopback Adapter is installed. Real devices on the LAN are fine. |
| Broker unreachable | `[MQTT] Error:` in the output. Check the address, port 1883, and the firewall on the broker machine. |

## Notes

- **Firewall:** the sniffer only makes an outbound connection to the broker (TCP 1883). No inbound rule is needed.
- **Staying safe:** if the sniffer crashes or is closed, the CMS and devices keep working; they never depend on it.
- **Starting automatically:** not set up yet. For the demo, start it by hand.
