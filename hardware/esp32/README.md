# ESP32 Fingerprint Test Setup

These sketches let you connect an ESP32 fingerprint device to this project's backend for real hardware testing.

## Files

- `fingerprint_link/fingerprint_link.ino`
  - stays connected to Wi-Fi and waits for the website to start an enrollment request
  - claims website-created enrollment jobs through `GET /api/hardware/fingerprint/enrollment/next`
  - enrolls the finger in the sensor and reports completion back to the backend
- `fingerprint_verify_gate/fingerprint_verify_gate.ino`
  - scans a finger
  - matches it in the sensor
  - sends the matched `fingerprint_id` to `POST /api/fingerprint/verify`
  - supports `Tap In`, `Tap Out`, and `Auto` mode selection from Serial Monitor

## Before Flashing

1. Start the backend:

```bash
npm run dev
```

2. Make sure the ESP32 and your computer are on the same Wi-Fi network.

3. In each sketch, update these values:

- `WIFI_SSID`
- `WIFI_PASSWORD`
- `BACKEND_BASE_URL`
- `ENROLLMENT_DEVICE_ID` in `fingerprint_link.ino`
- `DEFAULT_GATE_MODE` in `fingerprint_verify_gate.ino`

Use your computer's LAN IP, not `localhost`.

Example:

```cpp
const char* BACKEND_BASE_URL = "http://192.168.0.101:3000";
```

## Test Paths

### Verify Sketch Modes

The verify sketch now lets you choose:

- `ENTRY` for Tap In
- `EXIT` for Tap Out
- `AUTO` for desk testing

It builds the device ID automatically:

- `ENTRY` -> `gate_entry_01`
- `EXIT` -> `gate_exit_01`
- `AUTO` -> `gate_01`

If you want to change the default startup mode, edit `DEFAULT_GATE_MODE`.

## End-To-End Test

1. Register a user in the app UI.
2. Open the User Management page.
3. Flash `fingerprint_link.ino` to the ESP32 that is physically attached to the enrollment sensor.
4. Keep Serial Monitor open at `115200`.
5. In the website, select the same device ID that you configured in `ENROLLMENT_DEVICE_ID`.
6. Click `Start Website Enrollment`.
7. The website will reserve a numeric `fingerprint_id` and show live status.
8. The ESP32 will automatically pick up that request, ask for the finger, enroll it in the sensor, and call the backend completion route.
9. When the website status changes to `completed`, flash or keep `fingerprint_verify_gate.ino` on the gate device and test a scan.
10. In Serial Monitor, choose the gate mode before scanning:
   - `entry` for Tap In
   - `exit` for Tap Out
   - `auto` for desk testing

If the enrollment fails:

- keep `fingerprint_link.ino` running
- read the exact failure text in Serial Monitor and in the website status card
- start a fresh website enrollment request for the same user

The website is now the source of truth for starting the enrollment workflow. The board only performs the capture when the website asks it to.

## Verify Sketch Commands

In Serial Monitor at `115200`, you can use:

- `1`, `entry`, or `e` to switch to Tap In
- `2`, `exit`, or `x` to switch to Tap Out
- `3`, `auto`, or `a` to switch to Auto mode
- `status` or `s` to print the current mode
- `modes` or `help` to print the command list again

This keeps the board aligned with the website, where Tap In and Tap Out are both visible instead of hiding the exit path behind a single button.

## Wiring Assumptions

These sketches assume:

- sensor RX/TX connected to ESP32 UART2
- `RX = 16`
- `TX = 17`
- sensor baud rate `57600`

If your wiring is different, update the pin definitions near the top of each sketch.
