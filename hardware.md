# Fingerprint Hardware Integration

This is an engineering note for future fingerprint hardware integration. It describes the intended direction only and does not change the current implementation.

## Current State

- Fingerprint enrollment is currently simulated.
- Fingerprint verification currently uses a hash-based flow.
- Tap in/out is still simulated in software.

## Target Hardware Setup

- A USB fingerprint sensor will be connected to a local Windows kiosk machine.
- A local bridge/service will communicate with the sensor SDK or driver.
- The browser UI should not access the USB device directly.

## Storage Rules

- Do not store raw fingerprint images.
- Store only template/reference metadata and audit-related details.

## Planned Flows

- Enrollment through the fingerprint device.
- Verification/login through a live scan.
- Tap/gate authorization through biometric verification.

## Hardware Checklist

- Sensor model
- SDK/driver availability
- Windows compatibility
- USB connection details
- Template support
- Match/quality score support
- Device serial/model reporting
- Liveness or anti-spoof support

## Future Implementation Notes

- Add backend biometric endpoints later.
- Introduce a vendor-agnostic adapter layer.
- Keep the current simulated fingerprint flow as a fallback during transition.

## Planned Future Types

- `BiometricCredential`
- `BiometricDeviceStatus`
- `BiometricEnrollmentResult`
- `BiometricVerificationResult`
- `TapAuthorizationResult`
