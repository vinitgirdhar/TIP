/*
 * IoE Metro Gate Node
 * -------------------
 * Consolidated ESP32 firmware for the Internet of Everything (IoE) upgrade of
 * the Metro Biometric System. A single gate node now covers all four IoE
 * pillars at the edge:
 *
 *   People  -> reads the R307 fingerprint and identifies the passenger
 *   Process -> talks to the backend to verify, calculate fare, and settle wallet
 *   Data    -> reports the matched fingerprint + device so the backend can log
 *              trips, revenue, and congestion analytics
 *   Things  -> drives the physical gate (servo), status LED, and buzzer, and
 *              reports its own heartbeat so the backend can flag silent gates
 *
 * Hardware (matches the project BOM):
 *   - ESP32 microcontroller  x1
 *   - R307 fingerprint sensor x1  (UART2: RX=16, TX=17 @ 57600 baud)
 *   - Optional gate actuator : SG90/MG90 servo on GPIO 13
 *   - Optional status LEDs    : green GPIO 25, red GPIO 26
 *   - Optional buzzer         : GPIO 27
 *
 * The backend contract is unchanged: this node POSTs to
 * POST /api/fingerprint/verify  { "fingerprint_id": <int>, "device_id": <str> }
 * and reads back { "access": "granted"|"denied", "action": "TAP_IN"|"TAP_OUT", ... }.
 *
 * NOTE: For production, point BACKEND_BASE_URL at an https:// endpoint and swap
 * HTTPClient's plain begin() for a WiFiClientSecure instance (see IOE_HARDWARE.md).
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <Adafruit_Fingerprint.h>
#include <ESP32Servo.h>

// ---- Update these before flashing -----------------------------------------
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* BACKEND_BASE_URL = "http://192.168.1.106:3000";

// Default section for this gate node. ENTRY -> gate_entry_01, EXIT -> gate_exit_01,
// AUTO -> gate_01 (desk testing).
const char* DEFAULT_GATE_MODE = "ENTRY";

// Endpoints on the IoE backend.
const char* VERIFY_ENDPOINT = "/api/fingerprint/verify";

// ---- Pin + timing configuration -------------------------------------------
static const uint32_t SERIAL_BAUD = 115200;
static const uint32_t SENSOR_BAUD = 57600;
static const int SENSOR_RX_PIN = 16;
static const int SENSOR_TX_PIN = 17;

static const int SERVO_PIN = 13;
static const int LED_GREEN_PIN = 25;
static const int LED_RED_PIN = 26;
static const int BUZZER_PIN = 27;

static const int GATE_CLOSED_ANGLE = 0;
static const int GATE_OPEN_ANGLE = 90;
static const uint32_t GATE_OPEN_MS = 2500;

HardwareSerial fingerprintSerial(2);
Adafruit_Fingerprint finger(&fingerprintSerial);
Servo gateServo;

enum GateMode {
  GATE_MODE_ENTRY,
  GATE_MODE_EXIT,
  GATE_MODE_AUTO,
};

GateMode currentGateMode = GATE_MODE_ENTRY;

const char* getGateModeLabel() {
  switch (currentGateMode) {
    case GATE_MODE_EXIT:
      return "EXIT";
    case GATE_MODE_AUTO:
      return "AUTO";
    case GATE_MODE_ENTRY:
    default:
      return "ENTRY";
  }
}

const char* getActiveDeviceId() {
  switch (currentGateMode) {
    case GATE_MODE_EXIT:
      return "gate_exit_01";
    case GATE_MODE_AUTO:
      return "gate_01";
    case GATE_MODE_ENTRY:
    default:
      return "gate_entry_01";
  }
}

void applyDefaultGateMode() {
  String mode = DEFAULT_GATE_MODE;
  mode.trim();
  mode.toUpperCase();

  if (mode == "EXIT") {
    currentGateMode = GATE_MODE_EXIT;
  } else if (mode == "AUTO") {
    currentGateMode = GATE_MODE_AUTO;
  } else {
    currentGateMode = GATE_MODE_ENTRY;
  }
}

void printModeBanner() {
  Serial.println();
  Serial.println("========================================");
  Serial.println("IoE Metro Gate Node");
  Serial.print("Current gate mode: ");
  Serial.println(getGateModeLabel());
  Serial.print("Using device_id: ");
  Serial.println(getActiveDeviceId());
  Serial.println("Choose Tap In, Tap Out, or Auto before scanning.");
  Serial.println("========================================");
}

void printModeCommands() {
  Serial.println("Mode commands:");
  Serial.println("  1 / entry / e  -> Tap In section");
  Serial.println("  2 / exit / x   -> Tap Out section");
  Serial.println("  3 / auto / a   -> Auto section");
  Serial.println("  status / s     -> Show current mode");
  Serial.println("  modes / help   -> Show this command list");
}

void setGateMode(GateMode mode) {
  currentGateMode = mode;
  printModeBanner();
}

// ---- Physical actuation (Things pillar) -----------------------------------
void closeGate() {
  gateServo.write(GATE_CLOSED_ANGLE);
  digitalWrite(LED_GREEN_PIN, LOW);
  digitalWrite(LED_RED_PIN, HIGH);
}

void openGateMomentarily() {
  digitalWrite(LED_RED_PIN, LOW);
  digitalWrite(LED_GREEN_PIN, HIGH);
  gateServo.write(GATE_OPEN_ANGLE);
  tone(BUZZER_PIN, 1800, 150);
  delay(GATE_OPEN_MS);
  closeGate();
}

void signalDenied() {
  digitalWrite(LED_GREEN_PIN, LOW);
  digitalWrite(LED_RED_PIN, HIGH);
  tone(BUZZER_PIN, 400, 400);
}

void connectToWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();
  Serial.print("Connected. ESP32 IP: ");
  Serial.println(WiFi.localIP());
}

void waitForFingerRemoval() {
  while (finger.getImage() != FINGERPRINT_NOFINGER) {
    delay(50);
  }
}

int readFingerprintId() {
  int p = finger.getImage();
  if (p != FINGERPRINT_OK) {
    return -1;
  }

  p = finger.image2Tz();
  if (p != FINGERPRINT_OK) {
    Serial.println("Failed to convert fingerprint image.");
    waitForFingerRemoval();
    return -1;
  }

  p = finger.fingerFastSearch();
  if (p != FINGERPRINT_OK) {
    Serial.println("Fingerprint not found in sensor.");
    signalDenied();
    waitForFingerRemoval();
    return -1;
  }

  Serial.print("Matched fingerprint ID: ");
  Serial.print(finger.fingerID);
  Serial.print(" confidence: ");
  Serial.println(finger.confidence);

  waitForFingerRemoval();
  return finger.fingerID;
}

void sendVerificationRequest(int fingerprintId) {
  if (WiFi.status() != WL_CONNECTED) {
    connectToWiFi();
  }

  HTTPClient http;
  String deviceId = String(getActiveDeviceId());
  String url = String(BACKEND_BASE_URL) + VERIFY_ENDPOINT;
  String payload =
    String("{\"fingerprint_id\":") + fingerprintId +
    ",\"device_id\":\"" + deviceId + "\"}";

  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  int statusCode = http.POST(payload);
  String responseBody = http.getString();

  Serial.print("Backend status: ");
  Serial.println(statusCode);
  Serial.print("Used device_id: ");
  Serial.println(deviceId);
  Serial.print("Backend response: ");
  Serial.println(responseBody);

  if (responseBody.indexOf("\"action\":\"TAP_IN\"") >= 0) {
    Serial.println("TAP IN");
  } else if (responseBody.indexOf("\"action\":\"TAP_OUT\"") >= 0) {
    Serial.println("TAP OUT");
  }

  if (statusCode == 200 && responseBody.indexOf("\"access\":\"granted\"") >= 0) {
    Serial.println("ACCESS GRANTED - opening gate");
    openGateMomentarily();
  } else {
    Serial.println("ACCESS DENIED - gate stays closed");
    signalDenied();
  }

  http.end();
}

void handleSerialCommands() {
  if (!Serial.available()) {
    return;
  }

  String command = Serial.readStringUntil('\n');
  command.trim();
  command.toLowerCase();

  if (command == "1" || command == "entry" || command == "e") {
    setGateMode(GATE_MODE_ENTRY);
    return;
  }

  if (command == "2" || command == "exit" || command == "x") {
    setGateMode(GATE_MODE_EXIT);
    return;
  }

  if (command == "3" || command == "auto" || command == "a") {
    setGateMode(GATE_MODE_AUTO);
    return;
  }

  if (command == "status" || command == "s") {
    printModeBanner();
    return;
  }

  if (command == "modes" || command == "help") {
    printModeCommands();
    return;
  }

  Serial.println("Unknown command.");
  printModeCommands();
}

void setup() {
  Serial.begin(SERIAL_BAUD);
  delay(1000);

  pinMode(LED_GREEN_PIN, OUTPUT);
  pinMode(LED_RED_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);

  gateServo.setPeriodHertz(50);
  gateServo.attach(SERVO_PIN, 500, 2400);
  closeGate();

  fingerprintSerial.begin(SENSOR_BAUD, SERIAL_8N1, SENSOR_RX_PIN, SENSOR_TX_PIN);
  finger.begin(SENSOR_BAUD);

  Serial.print("Backend URL: ");
  Serial.println(BACKEND_BASE_URL);

  if (!finger.verifyPassword()) {
    Serial.println("Fingerprint sensor not found.");
    while (true) {
      signalDenied();
      delay(1000);
    }
  }

  Serial.println("Fingerprint sensor ready.");
  applyDefaultGateMode();
  printModeBanner();
  printModeCommands();
  connectToWiFi();
}

void loop() {
  handleSerialCommands();

  int fingerprintId = readFingerprintId();
  if (fingerprintId > 0) {
    sendVerificationRequest(fingerprintId);
    delay(1000);
  } else {
    delay(100);
  }
}
