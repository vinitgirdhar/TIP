/*
 * Consolidated ESP32 Metro Hardware Node
 * ---------------------------------------
 * Single unified Arduino sketch for ESP32 in the Metro Biometric System.
 * Supports:
 *   - Fingerprint Gate Verification (Entry, Exit, and Auto modes)
 *   - Physical Gate Actuation (SG90/MG90 Servo, Status LEDs, Buzzer)
 *   - Website-Driven Fingerprint Enrollment (Polls backend for enrollment jobs)
 *
 * Hardware Pinouts (Default ESP32 DevBoard):
 *   - R307 Fingerprint Sensor : UART2 (RX = GPIO 16, TX = GPIO 17 @ 57600 baud)
 *   - Gate Servo Actuator    : GPIO 13 (PWM 50 Hz)
 *   - Status LEDs            : Green = GPIO 25, Red = GPIO 26
 *   - Feedback Buzzer        : GPIO 27
 *
 * Libraries Required (Arduino Library Manager):
 *   - Adafruit Fingerprint Sensor Library
 *   - ESP32Servo
 *   - WiFi (built-in ESP32)
 *   - HTTPClient (built-in ESP32)
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <Adafruit_Fingerprint.h>
#include <ESP32Servo.h>

// ============================================================================
// CONFIGURATION - Update these before flashing to your ESP32
// ============================================================================
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Use your computer's LAN IP address (e.g. http://192.168.1.106:3000). Do NOT use localhost.
const char* BACKEND_BASE_URL = "http://192.168.1.106:3000";

// Default operating mode on startup: "ENTRY", "EXIT", "AUTO", or "ENROLL"
const char* DEFAULT_GATE_MODE = "ENTRY";

// Device ID used for website enrollment worker mode
const char* ENROLLMENT_DEVICE_ID = "gate_entry_01";

// Backend API Endpoints
const char* VERIFY_ENDPOINT = "/api/fingerprint/verify";
const char* POLL_ENDPOINT_PREFIX = "/api/hardware/fingerprint/enrollment/next?device_id=";
const char* ENROLLMENT_ENDPOINT_PREFIX = "/api/hardware/fingerprint/enrollment/";

// Hardware Pins & Parameters
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
static const uint32_t ENROLL_POLL_INTERVAL_MS = 2000;
static const uint8_t MAX_ENROLLMENT_ATTEMPTS = 2;

// Hardware Objects
HardwareSerial fingerprintSerial(2);
Adafruit_Fingerprint finger(&fingerprintSerial);
Servo gateServo;

// Operating Modes
enum GateMode {
  GATE_MODE_ENTRY,
  GATE_MODE_EXIT,
  GATE_MODE_AUTO,
  GATE_MODE_ENROLL
};

GateMode currentGateMode = GATE_MODE_ENTRY;

// Data Structure for Enrollment Jobs
struct EnrollmentJob {
  bool pending;
  String enrollmentId;
  int userId;
  String userName;
  int fingerprintId;
  String deviceId;
  String message;
  uint32_t pollIntervalMs;
};

// ============================================================================
// MODE UTILITIES & SERIAL DISPLAY
// ============================================================================
const char* getGateModeLabel() {
  switch (currentGateMode) {
    case GATE_MODE_EXIT:   return "EXIT (Tap Out)";
    case GATE_MODE_AUTO:   return "AUTO (Desk Test)";
    case GATE_MODE_ENROLL: return "ENROLL (Website Polling)";
    case GATE_MODE_ENTRY:
    default:               return "ENTRY (Tap In)";
  }
}

const char* getActiveDeviceId() {
  switch (currentGateMode) {
    case GATE_MODE_EXIT:   return "gate_exit_01";
    case GATE_MODE_AUTO:   return "gate_01";
    case GATE_MODE_ENROLL: return ENROLLMENT_DEVICE_ID;
    case GATE_MODE_ENTRY:
    default:               return "gate_entry_01";
  }
}

void printModeBanner() {
  Serial.println();
  Serial.println("==================================================");
  Serial.println("         ESP32 METRO BIOMETRIC NODE");
  Serial.println("==================================================");
  Serial.print("Current Mode  : "); Serial.println(getGateModeLabel());
  Serial.print("Active Device : "); Serial.println(getActiveDeviceId());
  Serial.print("Backend URL   : "); Serial.println(BACKEND_BASE_URL);
  Serial.println("--------------------------------------------------");
  Serial.println("Type 'help' or 'modes' to see commands.");
  Serial.println("==================================================");
}

void printModeCommands() {
  Serial.println("\nAvailable Serial Commands:");
  Serial.println("  1 / entry  / e  -> Switch to ENTRY Gate Mode (Tap In)");
  Serial.println("  2 / exit   / x  -> Switch to EXIT Gate Mode (Tap Out)");
  Serial.println("  3 / auto   / a  -> Switch to AUTO Gate Mode (Desk Testing)");
  Serial.println("  4 / enroll / en -> Switch to WEBSITE ENROLLMENT Listener Mode");
  Serial.println("  status     / s  -> Display node status banner");
  Serial.println("  modes      / h  -> Show this command list\n");
}

void setGateMode(GateMode mode) {
  currentGateMode = mode;
  printModeBanner();
}

void applyDefaultGateMode() {
  String mode = DEFAULT_GATE_MODE;
  mode.trim();
  mode.toUpperCase();

  if (mode == "EXIT")        currentGateMode = GATE_MODE_EXIT;
  else if (mode == "AUTO")   currentGateMode = GATE_MODE_AUTO;
  else if (mode == "ENROLL") currentGateMode = GATE_MODE_ENROLL;
  else                       currentGateMode = GATE_MODE_ENTRY;
}

// ============================================================================
// HARDWARE ACTUATION & AUDIO/VISUAL FEEDBACK
// ============================================================================
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

void waitForFingerRemoval() {
  while (finger.getImage() != FINGERPRINT_NOFINGER) {
    delay(50);
  }
}

// ============================================================================
// NETWORK CONNECTION
// ============================================================================
void connectToWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();
  Serial.print("Connected! ESP32 IP Address: ");
  Serial.println(WiFi.localIP());
}

// ============================================================================
// JSON HELPER UTILITIES (NO THIRD-PARTY PARSER NEEDED)
// ============================================================================
String extractJsonString(const String& json, const char* key) {
  const String pattern = String("\"") + key + "\":";
  int keyIndex = json.indexOf(pattern);
  if (keyIndex < 0) return "";

  int valueIndex = keyIndex + pattern.length();
  while (valueIndex < json.length() && (json[valueIndex] == ' ' || json[valueIndex] == '\n' || json[valueIndex] == '\r')) {
    valueIndex++;
  }
  if (valueIndex >= json.length() || json.startsWith("null", valueIndex)) return "";

  if (json[valueIndex] != '"') {
    int endIndex = json.indexOf(',', valueIndex);
    if (endIndex < 0) endIndex = json.indexOf('}', valueIndex);
    return endIndex < 0 ? "" : json.substring(valueIndex, endIndex);
  }

  valueIndex++;
  int endIndex = valueIndex;
  while (endIndex < json.length()) {
    if (json[endIndex] == '"' && json[endIndex - 1] != '\\') break;
    endIndex++;
  }
  if (endIndex >= json.length()) return "";

  String value = json.substring(valueIndex, endIndex);
  value.replace("\\\"", "\"");
  return value;
}

int extractJsonInt(const String& json, const char* key, int fallbackValue) {
  const String pattern = String("\"") + key + "\":";
  int keyIndex = json.indexOf(pattern);
  if (keyIndex < 0) return fallbackValue;

  int valueIndex = keyIndex + pattern.length();
  while (valueIndex < json.length() && (json[valueIndex] == ' ' || json[valueIndex] == '\n' || json[valueIndex] == '\r')) {
    valueIndex++;
  }
  if (valueIndex >= json.length()) return fallbackValue;

  if (json[valueIndex] == '"') {
    String strVal = extractJsonString(json, key);
    return strVal.toInt();
  }

  int endIndex = json.indexOf(',', valueIndex);
  if (endIndex < 0) endIndex = json.indexOf('}', valueIndex);
  if (endIndex < 0) return fallbackValue;

  String numericValue = json.substring(valueIndex, endIndex);
  numericValue.trim();
  if (numericValue == "null" || numericValue.length() == 0) return fallbackValue;

  return numericValue.toInt();
}

bool extractJsonBool(const String& json, const char* key, bool fallbackValue) {
  const String pattern = String("\"") + key + "\":";
  int keyIndex = json.indexOf(pattern);
  if (keyIndex < 0) return fallbackValue;

  int valueIndex = keyIndex + pattern.length();
  while (valueIndex < json.length() && (json[valueIndex] == ' ' || json[valueIndex] == '\n' || json[valueIndex] == '\r')) {
    valueIndex++;
  }
  if (valueIndex >= json.length()) return fallbackValue;

  if (json.startsWith("true", valueIndex)) return true;
  if (json.startsWith("false", valueIndex)) return false;

  return fallbackValue;
}

// ============================================================================
// FINGERPRINT VERIFICATION & GATE LOGIC
// ============================================================================
int readFingerprintId() {
  int p = finger.getImage();
  if (p != FINGERPRINT_OK) return -1;

  p = finger.image2Tz();
  if (p != FINGERPRINT_OK) {
    Serial.println("Failed to convert fingerprint image.");
    waitForFingerRemoval();
    return -1;
  }

  p = finger.fingerFastSearch();
  if (p != FINGERPRINT_OK) {
    Serial.println("Fingerprint not found in sensor database.");
    signalDenied();
    waitForFingerRemoval();
    return -1;
  }

  Serial.print("Matched Fingerprint ID: ");
  Serial.print(finger.fingerID);
  Serial.print(" (Confidence: ");
  Serial.print(finger.confidence);
  Serial.println(")");

  waitForFingerRemoval();
  return finger.fingerID;
}

void sendVerificationRequest(int fingerprintId) {
  connectToWiFi();

  HTTPClient http;
  String deviceId = String(getActiveDeviceId());
  String url = String(BACKEND_BASE_URL) + VERIFY_ENDPOINT;
  String payload = String("{\"fingerprint_id\":") + fingerprintId + ",\"device_id\":\"" + deviceId + "\"}";

  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  int statusCode = http.POST(payload);
  String responseBody = http.getString();

  Serial.print("Backend Status : "); Serial.println(statusCode);
  Serial.print("Device ID      : "); Serial.println(deviceId);
  Serial.print("Response       : "); Serial.println(responseBody);

  if (responseBody.indexOf("\"action\":\"TAP_IN\"") >= 0) {
    Serial.println("--> Action: TAP IN");
  } else if (responseBody.indexOf("\"action\":\"TAP_OUT\"") >= 0) {
    Serial.println("--> Action: TAP OUT");
  }

  if (statusCode == 200 && responseBody.indexOf("\"access\":\"granted\"") >= 0) {
    Serial.println(">>> ACCESS GRANTED - Opening Gate <<<");
    openGateMomentarily();
  } else {
    Serial.println(">>> ACCESS DENIED - Gate Stays Closed <<<");
    signalDenied();
  }

  http.end();
}

// ============================================================================
// WEBSITE-DRIVEN FINGERPRINT ENROLLMENT LOGIC
// ============================================================================
bool fetchNextEnrollmentJob(EnrollmentJob& job) {
  connectToWiFi();

  HTTPClient http;
  String url = String(BACKEND_BASE_URL) + POLL_ENDPOINT_PREFIX + ENROLLMENT_DEVICE_ID;
  http.begin(url);

  int statusCode = http.GET();
  String responseBody = http.getString();
  http.end();

  if (statusCode < 200 || statusCode >= 300) {
    Serial.print("Enrollment poll failed. HTTP ");
    Serial.println(statusCode);
    return false;
  }

  job.pending = extractJsonBool(responseBody, "pending", false);
  job.pollIntervalMs = (uint32_t)extractJsonInt(responseBody, "pollIntervalMs", ENROLL_POLL_INTERVAL_MS);
  job.enrollmentId = extractJsonString(responseBody, "enrollmentId");
  job.userId = extractJsonInt(responseBody, "userId", 0);
  job.userName = extractJsonString(responseBody, "userName");
  job.fingerprintId = extractJsonInt(responseBody, "fingerprintId", 0);
  job.deviceId = extractJsonString(responseBody, "deviceId");
  job.message = extractJsonString(responseBody, "message");

  return true;
}

bool postEnrollmentStatus(const String& enrollmentId, const char* action, const String& payload) {
  connectToWiFi();

  HTTPClient http;
  String url = String(BACKEND_BASE_URL) + ENROLLMENT_ENDPOINT_PREFIX + enrollmentId + "/" + action;
  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  int statusCode = http.POST(payload);
  String responseBody = http.getString();

  Serial.print("Enrollment "); Serial.print(action);
  Serial.print(" HTTP Status: "); Serial.println(statusCode);

  http.end();
  return statusCode >= 200 && statusCode < 300;
}

bool captureFingerprintImage(uint8_t slot, const char* stepLabel, String& failureReason) {
  int p = -1;
  int timeout = 0;

  Serial.println(stepLabel);

  while (p != FINGERPRINT_OK) {
    p = finger.getImage();

    switch (p) {
      case FINGERPRINT_OK:
        Serial.println("Image captured successfully.");
        break;
      case FINGERPRINT_NOFINGER:
        Serial.print(".");
        timeout++;
        if (timeout > 100) {
          failureReason = "Timed out waiting for finger on the sensor.";
          Serial.println();
          return false;
        }
        delay(100);
        break;
      case FINGERPRINT_PACKETRECIEVEERR:
        failureReason = "Sensor communication error.";
        return false;
      case FINGERPRINT_IMAGEFAIL:
        failureReason = "Fingerprint image capture failed.";
        return false;
      default:
        failureReason = "Unknown capture error.";
        return false;
    }
  }

  p = finger.image2Tz(slot);
  if (p != FINGERPRINT_OK) {
    failureReason = (slot == 1)
      ? "Poor image quality on first scan. Clean sensor and retry."
      : "Poor image quality on second scan. Clean sensor and retry.";
    waitForFingerRemoval();
    return false;
  }

  return true;
}

bool enrollFingerprintTemplate(uint8_t fingerprintId, String& failureReason) {
  if (!captureFingerprintImage(1, "Place finger on sensor...", failureReason)) {
    return false;
  }

  int searchResult = finger.fingerFastSearch();
  if (searchResult == FINGERPRINT_OK) {
    if (finger.fingerID == fingerprintId) {
      Serial.println("Fingerprint already stored under this ID. Reusing existing template.");
      waitForFingerRemoval();
      return true;
    }
    failureReason = "Finger is already enrolled under a different ID.";
    waitForFingerRemoval();
    return false;
  }

  Serial.println("\nRemove finger...");
  delay(1500);
  waitForFingerRemoval();

  if (!captureFingerprintImage(2, "Place SAME finger again...", failureReason)) {
    return false;
  }

  if (finger.createModel() != FINGERPRINT_OK) {
    failureReason = "Scans did not match. Please use the same finger.";
    return false;
  }

  if (finger.storeModel(fingerprintId) != FINGERPRINT_OK) {
    failureReason = "Failed to store model in sensor memory slot.";
    return false;
  }

  Serial.println("Fingerprint template stored successfully in sensor!");
  return true;
}

bool runEnrollmentJob(const EnrollmentJob& job, String& failureReason) {
  for (uint8_t attempt = 1; attempt <= MAX_ENROLLMENT_ATTEMPTS; attempt++) {
    Serial.print("Enrollment Attempt "); Serial.print(attempt);
    Serial.print(" of "); Serial.println(MAX_ENROLLMENT_ATTEMPTS);

    if (enrollFingerprintTemplate((uint8_t)job.fingerprintId, failureReason)) {
      return true;
    }

    Serial.print("Attempt failed: "); Serial.println(failureReason);
    if (attempt < MAX_ENROLLMENT_ATTEMPTS) {
      Serial.println("Retrying in 1.5 seconds...");
      delay(1500);
    }
  }
  return false;
}

void handleEnrollmentWorker() {
  EnrollmentJob job;
  if (!fetchNextEnrollmentJob(job) || !job.pending) {
    delay(ENROLL_POLL_INTERVAL_MS);
    return;
  }

  Serial.println("\n==================================================");
  Serial.println("ENROLLMENT REQUEST RECEIVED FROM WEBSITE");
  Serial.print("Enrollment ID  : "); Serial.println(job.enrollmentId);
  Serial.print("User           : "); Serial.print(job.userName); Serial.print(" (ID: "); Serial.print(job.userId); Serial.println(")");
  Serial.print("Fingerprint ID : "); Serial.println(job.fingerprintId);
  Serial.println("==================================================");

  String failureReason;
  bool enrolled = runEnrollmentJob(job, failureReason);

  if (enrolled) {
    String payload = String("{\"device_id\":\"") + ENROLLMENT_DEVICE_ID + "\",\"fingerprint_id\":" + job.fingerprintId + "}";
    postEnrollmentStatus(job.enrollmentId, "complete", payload);
  } else {
    String safeReason = failureReason;
    safeReason.replace("\"", "\\\"");
    String payload = String("{\"device_id\":\"") + ENROLLMENT_DEVICE_ID + "\",\"reason\":\"" + safeReason + "\"}";
    postEnrollmentStatus(job.enrollmentId, "fail", payload);
  }

  Serial.println("Listening for next website enrollment request...");
  delay(1000);
}

// ============================================================================
// SERIAL COMMAND INTERPRETER
// ============================================================================
void handleSerialCommands() {
  if (!Serial.available()) return;

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
  if (command == "4" || command == "enroll" || command == "en") {
    setGateMode(GATE_MODE_ENROLL);
    return;
  }
  if (command == "status" || command == "s") {
    printModeBanner();
    return;
  }
  if (command == "modes" || command == "help" || command == "h") {
    printModeCommands();
    return;
  }

  Serial.println("Unknown command. Type 'help' to list available commands.");
}

// ============================================================================
// ARDUINO SETUP & MAIN LOOP
// ============================================================================
void setup() {
  Serial.begin(SERIAL_BAUD);
  delay(1000);

  // Initialize feedback pins
  pinMode(LED_GREEN_PIN, OUTPUT);
  pinMode(LED_RED_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);

  // Initialize Servo
  gateServo.setPeriodHertz(50);
  gateServo.attach(SERVO_PIN, 500, 2400);
  closeGate();

  // Initialize Hardware Serial 2 for Fingerprint Sensor
  fingerprintSerial.begin(SENSOR_BAUD, SERIAL_8N1, SENSOR_RX_PIN, SENSOR_TX_PIN);
  finger.begin(SENSOR_BAUD);

  if (!finger.verifyPassword()) {
    Serial.println("CRITICAL ERROR: R307 Fingerprint sensor not detected!");
    while (true) {
      signalDenied();
      delay(1000);
    }
  }

  Serial.println("R307 Fingerprint sensor initialized successfully.");
  applyDefaultGateMode();
  printModeBanner();
  printModeCommands();
  connectToWiFi();
}

void loop() {
  // Always listen for mode switch commands from Serial Monitor
  handleSerialCommands();

  // Branch based on active mode
  if (currentGateMode == GATE_MODE_ENROLL) {
    handleEnrollmentWorker();
  } else {
    // Verification Gate Mode (ENTRY, EXIT, or AUTO)
    int fingerprintId = readFingerprintId();
    if (fingerprintId > 0) {
      sendVerificationRequest(fingerprintId);
      delay(1000);
    } else {
      delay(100);
    }
  }
}
