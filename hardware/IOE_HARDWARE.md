# IoE Metro Gate Node — Hardware

This folder holds the hardware code for the **Internet of Everything (IoE)**
upgrade of the Metro Biometric System. It extends the earlier fingerprint
sketches with a single consolidated edge node that also drives the physical
gate, so a passenger tap flows end to end: **finger → backend → fare settlement
→ gate opens**.

> The firmware is kept separate from the app so it can be flashed ("injected")
> onto the ESP32 independently after the backend is running.

## Files

- [`ioe/ioe_gate_node.ino`](ioe/ioe_gate_node.ino)
  - the new IoE gate node firmware (fingerprint + backend verify + gate control)
- [`esp32/fingerprint_link/fingerprint_link.ino`](esp32/fingerprint_link/fingerprint_link.ino)
  - existing enrollment sketch (unchanged)
- [`esp32/fingerprint_verify_gate/fingerprint_verify_gate.ino`](esp32/fingerprint_verify_gate/fingerprint_verify_gate.ino)
  - existing verify-only sketch (unchanged; use this if you have no gate actuator)

## IoE Pillars at the Edge

| Pillar  | Responsibility on the node |
| ------- | -------------------------- |
| People  | Reads the R307 fingerprint and identifies the passenger. |
| Process | Calls `POST /api/fingerprint/verify` so the backend verifies, calculates fare, and settles the wallet. |
| Data    | Sends the matched `fingerprint_id` + `device_id`; the backend logs trips that feed revenue, congestion, and anomaly analytics. |
| Things  | Drives the gate servo, status LEDs, and buzzer, and is health-checked by the backend's silent-device detection. |

## Bill of Materials

| Component | Qty | Notes |
| --------- | --- | ----- |
| ESP32 microcontroller | 1 | Any dev board with UART2 free |
| R307 fingerprint sensor | 1 | UART, 57600 baud |
| SG90 / MG90 servo | 1 | Optional gate actuator |
| Green + red LED | 1 each | Optional status indicators |
| Passive buzzer | 1 | Optional audible feedback |
| Connecting wires | ~30 | |

## Wiring

| Signal | ESP32 pin |
| ------ | --------- |
| Sensor RX | GPIO 16 (UART2 RX) |
| Sensor TX | GPIO 17 (UART2 TX) |
| Gate servo | GPIO 13 |
| Green LED | GPIO 25 |
| Red LED | GPIO 26 |
| Buzzer | GPIO 27 |

Sensor baud is `57600`; the serial monitor runs at `115200`. If your wiring
differs, edit the pin constants near the top of `ioe_gate_node.ino`.

## Arduino Library Dependencies

Install from the Arduino Library Manager:

- `Adafruit Fingerprint Sensor Library`
- `ESP32Servo`

The `WiFi` and `HTTPClient` libraries ship with the ESP32 board package.

## Before Flashing

1. Start the backend:

   ```bash
   npm run dev
   ```

2. Put the ESP32 and your computer on the same Wi-Fi network.
3. In `ioe_gate_node.ino`, set:
   - `WIFI_SSID`
   - `WIFI_PASSWORD`
   - `BACKEND_BASE_URL` — use the computer's LAN IP, **not** `localhost`
   - `DEFAULT_GATE_MODE` — `ENTRY`, `EXIT`, or `AUTO`

   ```cpp
   const char* BACKEND_BASE_URL = "http://192.168.0.101:3000";
   ```

## Serial Commands

Open the Serial Monitor at `115200`:

- `1`, `entry`, or `e` → Tap In (`gate_entry_01`)
- `2`, `exit`, or `x` → Tap Out (`gate_exit_01`)
- `3`, `auto`, or `a` → Auto (`gate_01`, desk testing)
- `status` / `s` → show current mode
- `modes` / `help` → show the command list

## Gate Behaviour

- **Access granted** (HTTP 200 + `"access":"granted"`): green LED on, buzzer
  chirps, servo swings to `GATE_OPEN_ANGLE` for `GATE_OPEN_MS`, then re-closes.
- **Access denied** or any error: red LED on, long buzzer tone, gate stays shut.

## Backend Contract

The node uses the existing verify endpoint — no backend changes are required to
run it:

```bash
curl -X POST http://YOUR_COMPUTER_IP:3000/api/fingerprint/verify \
  -H "Content-Type: application/json" \
  -d '{"fingerprint_id":7,"device_id":"gate_entry_01"}'
```

Enrollment still uses the website-controlled flow described in the root
[`hardware.md`](../hardware.md); flash `fingerprint_link.ino` on the enrollment
sensor for that step.

## Production Hardening (HTTPS)

The proposed IoE architecture calls for secure HTTPS communication. For a
production gate:

1. Terminate the backend behind TLS and set `BACKEND_BASE_URL` to `https://…`.
2. Replace `http.begin(url)` with a `WiFiClientSecure` client that pins or
   trusts your server certificate, e.g.:

   ```cpp
   WiFiClientSecure client;
   client.setCACert(ROOT_CA_PEM);
   http.begin(client, url);
   ```

3. Add a device authentication header (shared secret or signed token) so the
   backend can trust the gate. The current sketches are intended for local
   development and kiosk testing on a trusted network.
