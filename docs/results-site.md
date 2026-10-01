# Feeding results.openpiste.org from FencingTime or Engarde

One program on the CMS PC sends both live pistes and results to the results site:

- **Live pistes:** the CMS forwards its Cyrano traffic to this PC, one UDP port per piste.
  The program translates it to OPP2 and publishes it straight to the cloud broker.
- **Results:** the CMS exports FIE XML files into a folder. The program uploads each file
  whenever it changes.

Nothing on the Cyrano network changes, and the program never sends anything to the CMS
or the scoring machines. If it stops, scoring carries on as usual.

## What you get from the site's operator

| Item | Example |
|---|---|
| Tournament path | `BEL/2026/10/04/ghent-test` |
| Broker user and password | `venue-ghent-test` / `…` |
| Upload token | `opr_…` (valid for this event only) |

## 1. Install (once)

1. Install **Node.js LTS** from <https://nodejs.org>. You can skip the "Tools for Native
   Modules" page: this setup doesn't need it.
2. Download the program: <https://github.com/pietwauters/CyranoSniffer> → **Code** →
   **Download ZIP**. Unzip it, for example to `C:\OpenPiste\CyranoSniffer`.
3. In that folder, open PowerShell (Shift + right-click → "Open PowerShell window here") and run:

   ```powershell
   npm install --omit=optional
   ```

## 2. Configure

Copy `config.results.example.json` to `config.json` in the same folder and fill it in:

```json
{
  "mqttBroker": "mqtts://venue-ghent-test:PASSWORD@mqtt.openpiste.org:8883",
  "siteId": "ghent-test",
  "tournament": "BEL/2026/10/04/ghent-test",
  "competitions": { "*": "senior-m-foil" },
  "udpPorts": [50201, 50202, 50203, 50204],
  "upload": {
    "folder": "C:\\OpenPiste\\export",
    "token": "opr_PASTE_THE_TOKEN_HERE"
  }
}
```

- **`mqttBroker`**: the broker user and password go into this address. A password with
  `/`, `+`, `=`, `@` or `:` in it must have those written as `%2F`, `%2B`, `%3D`, `%40`, `%3A`
  (a bare `/` makes the program connect to the wrong host). Passwords of only letters and
  digits avoid this.
- **`udpPorts`**: one port per piste, the same ports you enter in the CMS's Cyrano forwarding.
  Use ports above 1024 that the CMS itself doesn't use (not 50100 or 50101).
- **`competitions`**: `"*"` sends every piste to one competition. With more than one
  competition, list the CMS's own competition names instead, for example
  `{ "HF": "senior-m-foil", "DE": "senior-f-epee" }`. The program's log shows both sides:
  a `[record]` warning names any CMS value that isn't listed, and each `[upload]` line names
  the code the site gave the competition.
- **`upload.folder`**: the folder the CMS exports FIE XML files to. Use one file per competition
  and overwrite it on every export. Backslashes are written twice in JSON.

`config.json` holds the broker password and the upload token: don't share it.

## 3. In the CMS

- **Cyrano forwarding:** forward each piste to `127.0.0.1` on its port from `udpPorts`.
- **Piste names:** short and unique (`1`, `2`, `Red`, `Finale`). They are taken from the Cyrano
  messages as they are.
- **FIE XML export:** into `upload.folder`. Export the entry list first, since that creates the
  tournament and competition on the site. Then export after every pool round and every
  tableau round.

## 4. Run

Double-click **`start.cmd`**. A window opens and shows:

```
[config] Publishing under openpiste/BEL/2026/10/04/ghent-test
[upload] Watching C:\OpenPiste\export for FIE XML files, uploading to BEL/2026/10/04/ghent-test
[listen] Receiving forwarded Cyrano on UDP 50201/50202/50203/50204
[upload] HF.xml -> senior-m-foil: 44 written, 0 unchanged, 0 removed
```

The first time, Windows may ask whether Node.js may use the network: allow it (private
networks is enough).

To see every message as well, run `node src\index.js --listen --verbose` in PowerShell instead.
Stop with **Ctrl+C**: the pistes are marked offline on the site.

Check the result at `https://results.openpiste.org/t/BEL/2026/10/04/ghent-test`, ideally on a
phone over mobile data rather than the venue Wi-Fi.

## When something is wrong

| You see | Meaning |
|---|---|
| `[MQTT] Error: Connection refused: Not authorized` | Wrong broker user or password in `mqttBroker`. |
| `[MQTT] Error: … ECONNREFUSED`, `ETIMEDOUT` or `ENOTFOUND` | No internet, or the venue network blocks outgoing port 8883. |
| `[listen] UDP port … is already in use` | Another program uses that port: pick other ports, in both the CMS and `udpPorts`. |
| `[record] Competition "…" is not in "competitions"` | Add that name to `competitions`, then restart. |
| `[upload] … the upload token was refused` | The token is mistyped, expired or revoked. |
| `[upload] … rejected: …` | The site can't read that file. The message says why; the file is sent again when it changes. |
| Pistes on the site, but not on the competition page | `competitions` doesn't match: see the `[record]` warning. |
