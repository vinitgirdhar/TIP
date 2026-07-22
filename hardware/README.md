# Metro Biometric System — ESP32 Hardware

This folder contains the consolidated **ESP32 microcontroller firmware** for the Metro Biometric System.

All hardware functionality—fingerprint verification, physical gate servo actuation, status LEDs, buzzer feedback, and website-driven user enrollment—is unified into **one single Arduino sketch file**:

👉 [`hardware/hardware.ino`](hardware.ino)

---

## 📋 Bill of Materials (BOM)

| Component | Qty | Notes |
| :--- | :---: | :--- |
| **ESP32 Dev Board** | 1 | Microcontroller (WiFi + Hardware Serial 2) |
| **R307 Fingerprint Sensor** | 1 | Optical fingerprint module (57600 baud) |
| **SG90 / MG90 Servo** | 1 | Physical gate turnstile actuator |
| **Green LED + Red LED** | 1 each | Visual access granted / denied status indicators |
| **Passive Buzzer** | 1 | Audible feedback chime |
| **Connecting Wires** | ~10-15 | Jumper wires |

---

## 🔌 Hardware Wiring Diagram

| Component Signal | ESP32 Pin | Notes |
| :--- | :--- | :--- |
| **R307 Sensor RX** | **GPIO 16** | (Hardware Serial 2 RX) |
| **R307 Sensor TX** | **GPIO 17** | (Hardware Serial 2 TX) |
| **R307 Sensor VCC / GND** | 5V / GND | Regulated power |
| **Gate Servo Signal** | **GPIO 13** | PWM (50 Hz) |
| **Green LED (+)** | **GPIO 25** | Access Granted |
| **Red LED (+)** | **GPIO 26** | Access Denied / Standby |
| **Passive Buzzer (+)** | **GPIO 27** | Audio Feedback |

---

## 📦 Required Arduino Libraries

Before compiling and flashing `hardware.ino`, install these libraries in the Arduino IDE (**Tools -> Manage Libraries**):

1. **`Adafruit Fingerprint Sensor Library`**
2. **`ESP32Servo`**

*(The `WiFi` and `HTTPClient` libraries ship natively with the ESP32 Arduino Core).*

---

## ⚙️ Configuration Before Flashing

Open [`hardware.ino`](hardware.ino) and update the configuration variables near the top:

```cpp
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Replace with your development machine's LAN IP address (e.g. http://192.168.1.106:3000)
// Do NOT use localhost because the ESP32 is a separate physical device.
const char* BACKEND_BASE_URL = "http://192.168.1.106:3000";

// Startup mode: "ENTRY", "EXIT", "AUTO", or "ENROLL"
const char* DEFAULT_GATE_MODE = "ENTRY";
```

---

## 🖥️ Operating Modes & Serial Commands

Open the **Serial Monitor** in Arduino IDE at **`115200` baud**. You can switch modes dynamically at runtime by sending any of these commands:

| Command | Shortcut | Mode Description |
| :--- | :---: | :--- |
| `entry` | `1` / `e` | **Tap In Entry Gate** (Device ID: `gate_entry_01`). Opens gate on check-in. |
| `exit` | `2` / `x` | **Tap Out Exit Gate** (Device ID: `gate_exit_01`). Opens gate & settles fare on check-out. |
| `auto` | `3` / `a` | **Auto Mode** (Device ID: `gate_01`). Desk testing; auto-determines tap in or tap out. |
| `enroll` | `4` / `en` | **Website Enrollment Listener**. Listens for website enrollment requests and saves new fingerprints. |
| `status` | `s` | Print current node mode, active device ID, and backend URL. |
| `help` | `h` | Display command help menu. |

---

## 🔄 End-to-End Workflow

### 1. Enrolling a User Fingerprint
1. Switch mode to `4` (`enroll`) in Serial Monitor (or set `DEFAULT_GATE_MODE = "ENROLL"`).
2. Go to the **User Management** page in the web app UI.
3. Select a registered user and click **Start Hardware Enrollment**.
4. The ESP32 automatically receives the request, prompts you to place your finger twice on the R307 sensor, stores the fingerprint model, and sends completion to the server.

### 2. Scanning at Gate Turnstiles
1. Switch mode to `1` (`entry`) for Entry gate or `2` (`exit`) for Exit gate.
2. Touch your finger on the sensor.
3. The ESP32 matches the fingerprint, contacts the backend, and if allowed:
   - 🟢 Green LED turns ON
   - 🔊 Buzzer chirps
   - 🚪 Gate Servo opens 90° for 2.5s and then automatically closes
