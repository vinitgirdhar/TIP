# Fingerprint Hardware Integration

This project now supports the hardware flow below inside the existing Express + SQLite backend.

## End-To-End Flow

1. `REGISTER`
   The user creates an account through the app using the existing registration flow at `POST /api/auth/register`.
2. `WEBSITE ENROLLMENT REQUEST`
   An operator starts enrollment from the User Management page. The backend reserves a numeric sensor `fingerprint_id` and creates a pending enrollment request for a specific hardware device.
3. `ESP32 ENROLL + LINK`
   The ESP32 enrollment sketch polls the backend, sees the pending request, stores the fingerprint in the sensor, and completes the link automatically.
4. `CHECK-IN`
   The user scans at an entry gate such as `gate_entry_01`. The backend starts a trip.
5. `CHECK-OUT`
   The user scans at an exit gate such as `gate_exit_01`. The backend closes the trip, calculates fare, and deducts balance.

## Database Model In This Project

This repo keeps the existing app schema and extends it for hardware:

- `users`
  - includes `fingerprint_id` as a unique numeric hardware mapping
- `wallets`
  - stores the passenger balance
- `trips`
  - stores `entry_station_id`, `exit_station_id`, times, fare, and status
- `hardware_devices`
  - stores `device_id`, `station_id`, and `gate_mode`

`fingerprint_id` is unique on `users`, which prevents one sensor ID from being linked to multiple accounts.

## Supported Hardware APIs

### Start Website-Controlled Enrollment

`POST /api/fingerprint/enrollment/start`

```json
{
  "user_id": 12,
  "device_id": "gate_entry_01"
}
```

This is called by the website, not by the ESP32. The response contains a reserved `fingerprintId` and an enrollment session ID that the UI can poll.

### Read Enrollment Status

`GET /api/fingerprint/enrollment/:enrollmentId`

The website polls this endpoint while the device is working.

### Link a Fingerprint to an Existing User

`POST /api/register-fingerprint`

```json
{
  "user_id": 12,
  "fingerprint_id": 7,
  "device_id": "gate_entry_01"
}
```

Notes:

- `user_id` is required.
- `fingerprint_id` is the numeric ID returned by the sensor after `finger.storeModel(id)`.
- `device_id` is optional metadata and helps track where linking happened.

This manual endpoint still exists as a fallback, but the preferred setup is now website-started enrollment through the session endpoints above.

### Verify a Gate Scan

`POST /api/fingerprint/verify`

```json
{
  "fingerprint_id": 7,
  "device_id": "gate_entry_01"
}
```

Success example:

```json
{
  "status": "allowed",
  "access": "granted",
  "action": "TAP_IN",
  "message": "Check-in granted at Versova."
}
```

Failure example:

```json
{
  "status": "blocked",
  "access": "denied",
  "action": null,
  "message": "User already has an active trip. Please exit first.",
  "reason": "User already has an active trip. Please exit first."
}
```

## Gate Naming

This backend now understands explicit gate direction:

- `gate_entry_01`
- `gate_exit_01`
- `gate_entry_02`
- `gate_exit_02`

For backward compatibility, legacy `gate_01` style devices still work in auto mode:

- no active trip -> check-in
- active trip -> check-out

Use `GET /api/fingerprint/devices` to discover seeded devices.

## ESP32 Integration

After your ESP32 matches a fingerprint, it should send the matched `finger.fingerID` to the backend.

Ready-to-flash example sketches now live in:

- [hardware/esp32/fingerprint_link/fingerprint_link.ino](/Users/richrebello/Desktop/rich%20college/TIP/hardware/esp32/fingerprint_link/fingerprint_link.ino)
- [hardware/esp32/fingerprint_verify_gate/fingerprint_verify_gate.ino](/Users/richrebello/Desktop/rich%20college/TIP/hardware/esp32/fingerprint_verify_gate/fingerprint_verify_gate.ino)
- [hardware/esp32/README.md](/Users/richrebello/Desktop/rich%20college/TIP/hardware/esp32/README.md)

Example:

```bash
curl -X POST http://YOUR_COMPUTER_IP:3000/api/fingerprint/verify \
  -H "Content-Type: application/json" \
  -d '{"fingerprint_id":7,"device_id":"gate_entry_01"}'
```

Important:

- Do not use `localhost` from the ESP32. Use the computer's LAN IP.
- The browser should not talk directly to the sensor.
- The ESP32 or a local bridge service should call the backend.
- The verify sketch now supports explicit Tap In, Tap Out, and Auto modes from Serial Monitor.
- For Tap In and Tap Out, the sketch uses `gate_entry_01` and `gate_exit_01`.
- For desk testing, use `AUTO`, which maps to `gate_01`.

### Gate Verify Commands

The updated `fingerprint_verify_gate.ino` supports:

- section selection
  - `1` / `entry`
  - `2` / `exit`
  - `3` / `auto`
- inspection commands
  - `status`
  - `modes`

This keeps the hardware test flow aligned with the website, where Tap In and Tap Out are both visible instead of hiding the exit path behind a single button.

## Admin UI

The User Management page now follows the same sequence:

- register a user
- start hardware enrollment from the website
- watch live enrollment status
- test entry and exit gate scans
- inspect fingerprint IDs in the ledger

## Security Note

The hardware endpoints are currently designed for local development and kiosk integration. Before production use, protect them with device authentication, a trusted internal network, or both.
