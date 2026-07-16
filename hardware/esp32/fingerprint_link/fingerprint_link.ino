#include <WiFi.h>
#include <HTTPClient.h>
#include <Adafruit_Fingerprint.h>

const char* WIFI_SSID = "TP-Link_2";
const char* WIFI_PASSWORD = "rebello_6";
const char* BACKEND_BASE_URL = "http://192.168.1.106:3000";
const char* ENROLLMENT_DEVICE_ID = "gate_entry_01";

const char* POLL_ENDPOINT_PREFIX = "/api/hardware/fingerprint/enrollment/next?device_id=";
const char* ENROLLMENT_ENDPOINT_PREFIX = "/api/hardware/fingerprint/enrollment/";

static const uint32_t SERIAL_BAUD = 115200;
static const uint32_t SENSOR_BAUD = 57600;
static const int SENSOR_RX_PIN = 16;
static const int SENSOR_TX_PIN = 17;
static const uint32_t DEFAULT_POLL_INTERVAL_MS = 2000;
static const uint8_t MAX_ENROLLMENT_ATTEMPTS = 2;

HardwareSerial fingerprintSerial(2);
Adafruit_Fingerprint finger(&fingerprintSerial);

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

void waitForFingerRemoval() {
  while (finger.getImage() != FINGERPRINT_NOFINGER) {
    delay(50);
  }
}

void connectToWiFi() {
  if (WiFi.status() == WL_CONNECTED) {
    return;
  }

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

String extractJsonString(const String& json, const char* key) {
  const String pattern = String("\"") + key + "\":";
  int keyIndex = json.indexOf(pattern);
  if (keyIndex < 0) {
    return "";
  }

  int valueIndex = keyIndex + pattern.length();
  while (valueIndex < json.length() && (json[valueIndex] == ' ' || json[valueIndex] == '\n' || json[valueIndex] == '\r')) {
    valueIndex++;
  }

  if (valueIndex >= json.length()) {
    return "";
  }

  if (json.startsWith("null", valueIndex)) {
    return "";
  }

  if (json[valueIndex] != '"') {
    int endIndex = json.indexOf(',', valueIndex);
    if (endIndex < 0) {
      endIndex = json.indexOf('}', valueIndex);
    }
    return endIndex < 0 ? "" : json.substring(valueIndex, endIndex);
  }

  valueIndex++;
  int endIndex = valueIndex;
  while (endIndex < json.length()) {
    if (json[endIndex] == '"' && json[endIndex - 1] != '\\') {
      break;
    }
    endIndex++;
  }

  if (endIndex >= json.length()) {
    return "";
  }

  String value = json.substring(valueIndex, endIndex);
  value.replace("\\\"", "\"");
  return value;
}

int extractJsonInt(const String& json, const char* key, int fallbackValue) {
  String value = extractJsonString(json, key);
  if (value.length() == 0) {
    value = extractJsonString(json, key);
  }

  const String pattern = String("\"") + key + "\":";
  int keyIndex = json.indexOf(pattern);
  if (keyIndex < 0) {
    return fallbackValue;
  }

  int valueIndex = keyIndex + pattern.length();
  while (valueIndex < json.length() && (json[valueIndex] == ' ' || json[valueIndex] == '\n' || json[valueIndex] == '\r')) {
    valueIndex++;
  }

  if (valueIndex >= json.length()) {
    return fallbackValue;
  }

  if (json[valueIndex] == '"') {
    return value.toInt();
  }

  int endIndex = json.indexOf(',', valueIndex);
  if (endIndex < 0) {
    endIndex = json.indexOf('}', valueIndex);
  }
  if (endIndex < 0) {
    return fallbackValue;
  }

  String numericValue = json.substring(valueIndex, endIndex);
  numericValue.trim();

  if (numericValue == "null" || numericValue.length() == 0) {
    return fallbackValue;
  }

  return numericValue.toInt();
}

bool extractJsonBool(const String& json, const char* key, bool fallbackValue) {
  const String pattern = String("\"") + key + "\":";
  int keyIndex = json.indexOf(pattern);
  if (keyIndex < 0) {
    return fallbackValue;
  }

  int valueIndex = keyIndex + pattern.length();
  while (valueIndex < json.length() && (json[valueIndex] == ' ' || json[valueIndex] == '\n' || json[valueIndex] == '\r')) {
    valueIndex++;
  }

  if (valueIndex >= json.length()) {
    return fallbackValue;
  }

  if (json.startsWith("true", valueIndex)) {
    return true;
  }

  if (json.startsWith("false", valueIndex)) {
    return false;
  }

  return fallbackValue;
}

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
    Serial.println(responseBody);
    return false;
  }

  job.pending = extractJsonBool(responseBody, "pending", false);
  job.pollIntervalMs = (uint32_t)extractJsonInt(responseBody, "pollIntervalMs", DEFAULT_POLL_INTERVAL_MS);
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

  Serial.print("Enrollment ");
  Serial.print(action);
  Serial.print(" status: ");
  Serial.println(statusCode);
  Serial.print("Enrollment ");
  Serial.print(action);
  Serial.print(" response: ");
  Serial.println(responseBody);

  http.end();
  return statusCode >= 200 && statusCode < 300;
}

bool reportEnrollmentComplete(const EnrollmentJob& job) {
  String payload =
    String("{\"device_id\":\"") + ENROLLMENT_DEVICE_ID +
    "\",\"fingerprint_id\":" + job.fingerprintId + "}";

  return postEnrollmentStatus(job.enrollmentId, "complete", payload);
}

bool reportEnrollmentFailure(const EnrollmentJob& job, const String& reason) {
  String safeReason = reason;
  safeReason.replace("\\", "\\\\");
  safeReason.replace("\"", "\\\"");

  String payload =
    String("{\"device_id\":\"") + ENROLLMENT_DEVICE_ID +
    "\",\"reason\":\"" + safeReason + "\"}";

  return postEnrollmentStatus(job.enrollmentId, "fail", payload);
}

bool captureFingerprintImage(uint8_t slot, const char* stepLabel, String& failureReason) {
  int p = -1;
  int timeout = 0;

  Serial.println(stepLabel);

  while (p != FINGERPRINT_OK) {
    p = finger.getImage();

    switch (p) {
      case FINGERPRINT_OK:
        Serial.println("Image taken");
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
        failureReason = "Fingerprint sensor communication error.";
        return false;
      case FINGERPRINT_IMAGEFAIL:
        failureReason = "Fingerprint image capture failed.";
        return false;
      default:
        failureReason = "Unknown fingerprint image capture error.";
        return false;
    }
  }

  p = finger.image2Tz(slot);
  if (p != FINGERPRINT_OK) {
    failureReason = slot == 1
      ? "Poor image quality on the first scan. Please clean the sensor and try again."
      : "Poor image quality on the second scan. Please clean the sensor and try again.";
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
    Serial.print("Fingerprint already exists in sensor as ID ");
    Serial.println(finger.fingerID);

    if (finger.fingerID == fingerprintId) {
      Serial.println("Same fingerprint is already stored under this ID. Reusing it.");
      waitForFingerRemoval();
      return true;
    }

    failureReason = "This finger is already enrolled under a different sensor ID.";
    waitForFingerRemoval();
    return false;
  }

  Serial.println();
  Serial.println("Remove finger...");
  delay(1500);
  waitForFingerRemoval();

  if (!captureFingerprintImage(2, "Place same finger again...", failureReason)) {
    return false;
  }

  int createModelResult = finger.createModel();
  if (createModelResult != FINGERPRINT_OK) {
    failureReason = "The two scans did not match. Please use the same finger again.";
    return false;
  }

  int storeResult = finger.storeModel(fingerprintId);
  if (storeResult != FINGERPRINT_OK) {
    failureReason = "The sensor could not store the fingerprint in the requested slot.";
    return false;
  }

  Serial.println("Fingerprint stored in sensor successfully.");
  return true;
}

bool runEnrollmentJob(const EnrollmentJob& job, String& failureReason) {
  for (uint8_t attempt = 1; attempt <= MAX_ENROLLMENT_ATTEMPTS; attempt++) {
    Serial.print("Enrollment attempt ");
    Serial.print(attempt);
    Serial.print(" of ");
    Serial.println(MAX_ENROLLMENT_ATTEMPTS);

    if (enrollFingerprintTemplate((uint8_t)job.fingerprintId, failureReason)) {
      return true;
    }

    Serial.print("Attempt failed: ");
    Serial.println(failureReason);

    if (attempt < MAX_ENROLLMENT_ATTEMPTS) {
      Serial.println("Retrying after a short pause...");
      delay(1500);
    }
  }

  return false;
}

void setup() {
  Serial.begin(SERIAL_BAUD);
  delay(1000);

  fingerprintSerial.begin(SENSOR_BAUD, SERIAL_8N1, SENSOR_RX_PIN, SENSOR_TX_PIN);
  finger.begin(SENSOR_BAUD);

  Serial.println("ESP32 website-driven fingerprint enrollment worker");
  Serial.print("Backend URL: ");
  Serial.println(BACKEND_BASE_URL);
  Serial.print("Enrollment device_id: ");
  Serial.println(ENROLLMENT_DEVICE_ID);

  if (!finger.verifyPassword()) {
    Serial.println("Fingerprint sensor not found.");
    while (true) {
      delay(100);
    }
  }

  Serial.println("Fingerprint sensor ready.");
  connectToWiFi();
}

void loop() {
  EnrollmentJob job;
  if (!fetchNextEnrollmentJob(job)) {
    delay(DEFAULT_POLL_INTERVAL_MS);
    return;
  }

  if (!job.pending) {
    delay(job.pollIntervalMs > 0 ? job.pollIntervalMs : DEFAULT_POLL_INTERVAL_MS);
    return;
  }

  Serial.println();
  Serial.println("Enrollment request received from website");
  Serial.print("Enrollment ID: ");
  Serial.println(job.enrollmentId);
  Serial.print("User: ");
  Serial.print(job.userName);
  Serial.print(" (");
  Serial.print(job.userId);
  Serial.println(")");
  Serial.print("Fingerprint ID: ");
  Serial.println(job.fingerprintId);
  Serial.print("Message: ");
  Serial.println(job.message);

  String failureReason;
  bool enrolled = runEnrollmentJob(job, failureReason);

  if (enrolled) {
    if (!reportEnrollmentComplete(job)) {
      Serial.println("Sensor enrollment finished, but the backend completion call failed.");
    }
  } else {
    if (!reportEnrollmentFailure(job, failureReason)) {
      Serial.println("Failed to report enrollment failure back to the backend.");
    }
  }

  Serial.println("Waiting for the next website enrollment request...");
  delay(1000);
}
