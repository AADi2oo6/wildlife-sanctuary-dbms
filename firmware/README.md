# 🌲 DeepGreen IoT Hardware Firmware Guide (Phase 1)

This directory contains the production-grade Arduino firmware for the two edge hardware devices used in the DeepGreen Wildlife Sanctuary Monitoring System.

---

## 📦 Devices Overview

| Device | Name | Microcontroller | Primary Sensors | Interface to Server |
|---|---|---|---|---|
| **Device 1** | **Acoustic & Seismic Node** | Standard ESP32 DevKit (ESP-WROOM-32) | • SW-420 Vibration Sensor<br>• INMP441 I2S Digital Mic | USB Serial (COM Port) with Framed HEX WAV Stream |
| **Device 2** | **Optical Surveillance Node** | ESP32-CAM (AI-Thinker) with Camera MB | • OV2640 2MP Camera<br>• High-Power Flash LED (GPIO 4) | Wi-Fi HTTP (`/capture` JPEG + `/stream` MJPEG) |

---

## 🛠️ Hardware Wiring & Pinouts

### 🔌 Device 1: ESP32 + Vibration Sensor + INMP441 Mic
```
         ESP32 DevKit                  INMP441 I2S Mic
       ┌───────────────┐              ┌───────────────┐
       │          3.3V ├──────────────┤ VDD           │
       │           GND ├──────────────┤ GND           │
       │       GPIO 26 ├──────────────┤ SCK (BCLK)    │
       │       GPIO 25 ├──────────────┤ WS  (LRCLK)   │
       │       GPIO 33 ├──────────────┤ SD  (DOUT)    │
       │           GND ├──────────────┤ L/R (Left Ch) │
       │               │              └───────────────┘
       │               │              SW-420 Vibration
       │               │              ┌───────────────┐
       │          3.3V ├──────────────┤ VCC           │
       │           GND ├──────────────┤ GND           │
       │       GPIO 34 ├──────────────┤ DO (Digital)  │
       └───────────────┘              └───────────────┘
```
> [!NOTE]
> GPIO 34 is an RTC GPIO. This enables ultra-low-power `ext0` deep sleep wake (<150 µA in standby). When the tree or fence experiences a strike/impact, the sensor pin transitions HIGH, instantly waking the CPU to record 5 seconds of audio.

---

### 📷 Device 2: ESP32-CAM (AI-Thinker)
If using the **ESP32-CAM-MB micro-USB shield**:
- Simply click the ESP32-CAM into the MB shield and connect a standard Micro-USB cable to your PC.
- No jumper wires needed!

If using an **FTDI USB-to-TTL programmer**:
```
  FTDI Adapter          ESP32-CAM
  ┌────────────┐       ┌────────────┐
  │ 5V         ├───────┤ 5V (or 3V3)│
  │ GND        ├───────┤ GND        │
  │ TX         ├───────┤ U0R (RX)   │
  │ RX         ├───────┤ U0T (TX)   │
  └────────────┘       │            │
         ┌─────────────┤ IO0        │
         │             │            │
         └─────────────┤ GND        │  <-- (Connect IO0 to GND while flashing, DISCONNECT to run)
                       └────────────┘
```

---

## 💻 Arduino IDE Setup Instructions

### Step 1: Install ESP32 Board Package
1. Open **Arduino IDE** (v2.x recommended).
2. Go to **File -> Preferences**.
3. In **Additional boards manager URLs**, add:
   ```text
   https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
   ```
4. Click **OK**.
5. Go to **Tools -> Board -> Boards Manager...**, search for `esp32` by **Espressif Systems**, and click **Install**.

---

### Step 2: Flash Device 1 (Acoustic Sensor Node)
1. Open [`device1_esp32_audio_sensor/device1_esp32_audio_sensor.ino`](device1_esp32_audio_sensor/device1_esp32_audio_sensor.ino) in Arduino IDE.
2. Under **Tools**, select:
   - **Board**: `ESP32 Dev Module`
   - **Upload Speed**: `921600`
   - **CPU Frequency**: `240MHz`
   - **Flash Frequency**: `80MHz`
   - **Partition Scheme**: `Default 4MB with spiffs (1.2MB APP / 1.5MB SPIFFS)`
   - **Port**: Select the COM port of your ESP32 (e.g. `COM3` on Windows).
3. Click the **Upload** button (Arrow icon).
4. After upload completes, open **Serial Monitor** at **115200 baud**.
5. You should see:
   ```text
   🌲 DEEPGREEN IoT - DEVICE 1: ACOUSTIC / SEISMIC SENSOR NODE
   Node UID:         DGN-NODE-67SF-608
   Firmware Version: v2.0-wired
   [INFO] SPIFFS storage initialized.
   [STATUS] Boot / Reset complete. Listening for vibration strikes & Serial commands...
   ```
6. **Quick Test**:
   - Tap the vibration sensor: it triggers `[EVENT] Physical vibration strike detected`, records 5 seconds of audio, and streams the hex WAV.
   - Or type `CMD:RECORD_5S` in the Serial Monitor input box and hit Enter: it records and transmits on demand!

---

### Step 3: Flash Device 2 (ESP32-CAM Optical Node)
1. Open [`device2_esp32_cam/device2_esp32_cam.ino`](device2_esp32_cam/device2_esp32_cam.ino) in Arduino IDE.
2. Edit your Wi-Fi credentials near the top of the file:
   ```cpp
   const char* WIFI_SSID     = "Your_WiFi_Name";
   const char* WIFI_PASSWORD = "Your_WiFi_Password";
   ```
3. Under **Tools**, select:
   - **Board**: `AI Thinker ESP32-CAM`
   - **CPU Frequency**: `240MHz`
   - **Flash Frequency**: `80MHz`
   - **Flash Mode**: `QIO`
   - **Partition Scheme**: `Huge APP (3MB No OTA/1MB SPIFFS)`
   - **Port**: Select the COM port of your ESP32-CAM.
4. If using FTDI: Ensure **IO0 is tied to GND**, then press the **RST** button on the back of the camera before clicking Upload. If using the MB shield, hold the **BOOT/IO0** button when connecting if needed.
5. Click **Upload**.
6. When done, disconnect IO0 from GND (if using FTDI) and press the **RST** button.
7. Open **Serial Monitor** at **115200 baud**.
8. You will see:
   ```text
   [SUCCESS] Wi-Fi Connected!
      Assigned IP Address: http://192.168.1.105
      Snapshot Endpoint:   http://192.168.1.105/capture
      Live Video Stream:   http://192.168.1.105:81/stream
   ```
9. **Quick Test**:
   - Open a browser and visit: `http://192.168.1.105/` -> An interactive dashboard appears with live camera feed!
   - Test snapshot: `http://192.168.1.105/capture` -> Directly downloads/renders a crisp SVGA JPEG frame.
   - Test flashlight: `http://192.168.1.105/flash?val=1` -> Turns ON camera flash LED.

---

## 📡 Next Step: Backend Integration (Phase 2 & 3)
Copy your:
- Device 1 **COM Port** (e.g., `COM3`)
- Device 2 **Assigned IP / Capture URL** (e.g., `http://192.168.1.105/capture`)
- Device 2 **Stream URL** (e.g., `http://192.168.1.105:81/stream`)

These will be plugged directly into the FastAPI serial bridge and the React Admin Node settings!
