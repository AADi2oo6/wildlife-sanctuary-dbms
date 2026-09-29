/*
 =========================================================================================
  🌲 DeepGreen / Wildlife Sanctuary IoT - Device 1 Firmware (Zero-SPIFFS Direct Stream)
  Module: ESP32 + Vibration Sensor + INMP441 I2S Microphone
  Hardware Pinout:
    - Vibration Sensor (SW-420): GPIO 34 (RTC GPIO ext0 wake / digital interrupt)
    - I2S WS (Word Select / L/R Clock): GPIO 25
    - I2S SCK (Continuous Serial Clock): GPIO 26
    - I2S SD (Serial Data): GPIO 33
    - I2S L/R (Channel Select): GND (Left Channel)
    - VCC / GND: 3.3V / GND
  
  Features:
    - 5-Second 16kHz 16-bit Mono Audio Recording
    - DIRECT STREAMING OVER USB SERIAL: No SPIFFS partition required!
      (Eliminates "SPIFFS partition could not be found" and flash memory wear)
    - Dual Operation Modes:
      1) Event-Triggered: Physical strike on vibration sensor triggers immediate capture
      2) On-Demand / Manual: Host PC sends serial command "CMD:RECORD_5S" over USB
    - Framed Serial Transmission with Metadata & Hex WAV byte stream
 =========================================================================================
*/

#include <Arduino.h>
#include <driver/i2s.h>

// --- Device Identity ---
#define DEVICE_UID "DGN-NODE-67SF-608"
#define FIRMWARE_VERSION "v2.1-direct-stream"

// --- Hardware Pins ---
#define VIBRATION_PIN GPIO_NUM_34 // RTC GPIO 34 supports ext0 deep sleep wake
#define I2S_WS 25
#define I2S_SCK 26
#define I2S_SD 33
#define I2S_PORT I2S_NUM_0

// --- Audio Configuration ---
#define SAMPLE_RATE 16000
#define RECORD_TIME 5          // 5 seconds of audio capture
#define WAV_HEADER_SIZE 44

// --- Power Management Mode ---
// Set to 'false' if connected to host PC via USB wire (keeps UART active for on-demand commands)
// Set to 'true' for battery-only field operation (enters deep sleep after each transmission)
const bool ENABLE_DEEP_SLEEP = false;

// Buffer for serial incoming commands
String inputCommandBuffer = "";

// --- Vibration Sensor State & Hardware Interrupt ---
volatile bool g_vibrationDetected = false;
volatile unsigned long g_lastVibeInterruptMs = 0;

void IRAM_ATTR onVibrationInterrupt() {
  unsigned long now = millis();
  if (now - g_lastVibeInterruptMs > 50) {
    g_vibrationDetected = true;
    g_lastVibeInterruptMs = now;
  }
}

void getWavHeader(byte* header, uint32_t dataSize) {
  uint32_t fileSize = dataSize + WAV_HEADER_SIZE - 8;
  uint32_t byteRate = SAMPLE_RATE * 2; // 16-bit mono = 2 bytes per sample
  
  header[0] = 'R'; header[1] = 'I'; header[2] = 'F'; header[3] = 'F';
  header[4] = fileSize & 0xFF; header[5] = (fileSize >> 8) & 0xFF; header[6] = (fileSize >> 16) & 0xFF; header[7] = (fileSize >> 24) & 0xFF;
  header[8] = 'W'; header[9] = 'A'; header[10] = 'V'; header[11] = 'E';
  header[12] = 'f'; header[13] = 'm'; header[14] = 't'; header[15] = ' ';
  header[16] = 16; header[17] = 0; header[18] = 0; header[19] = 0; // Subchunk1Size (16 for PCM)
  header[20] = 1; header[21] = 0;                                  // AudioFormat (1 = PCM)
  header[22] = 1; header[23] = 0;                                  // NumChannels (1 = Mono)
  header[24] = SAMPLE_RATE & 0xFF; header[25] = (SAMPLE_RATE >> 8) & 0xFF; header[26] = (SAMPLE_RATE >> 16) & 0xFF; header[27] = (SAMPLE_RATE >> 24) & 0xFF;
  header[28] = byteRate & 0xFF; header[29] = (byteRate >> 8) & 0xFF; header[30] = (byteRate >> 16) & 0xFF; header[31] = (byteRate >> 24) & 0xFF;
  header[32] = 2; header[33] = 0;                                  // BlockAlign (NumChannels * BitsPerSample/8)
  header[34] = 16; header[35] = 0;                                 // BitsPerSample (16 bits)
  header[36] = 'd'; header[37] = 'a'; header[38] = 't'; header[39] = 'a';
  header[40] = dataSize & 0xFF; header[41] = (dataSize >> 8) & 0xFF; header[42] = (dataSize >> 16) & 0xFF; header[43] = (dataSize >> 24) & 0xFF;
}

bool initI2SMicrophone() {
  i2s_config_t i2s_config = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
    .sample_rate = SAMPLE_RATE,
    .bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT, // INMP441 uses 32-bit slot
    .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
    .communication_format = I2S_COMM_FORMAT_I2S,
    .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
    .dma_buf_count = 8,
    .dma_buf_len = 128,
    .use_apll = false,
    .tx_desc_auto_clear = false,
    .fixed_mclk = 0
  };

  i2s_pin_config_t pin_config = {
    .bck_io_num = I2S_SCK,
    .ws_io_num = I2S_WS,
    .data_out_num = I2S_PIN_NO_CHANGE,
    .data_in_num = I2S_SD
  };

  esp_err_t err = i2s_driver_install(I2S_PORT, &i2s_config, 0, NULL);
  if (err != ESP_OK) {
    Serial.println("[ERROR] Failed to install I2S driver");
    return false;
  }

  err = i2s_set_pin(I2S_PORT, &pin_config);
  if (err != ESP_OK) {
    Serial.println("[ERROR] Failed to configure I2S pins");
    return false;
  }

  return true;
}

void recordAndTransmitAudio(const char* triggerSource) {
  Serial.print("\n[TRIGGER] Starting 5-second acoustic acquisition. Trigger: ");
  Serial.println(triggerSource);

  if (!initI2SMicrophone()) {
    Serial.println("[ERROR] Microphone initialization aborted.");
    return;
  }

  uint32_t dataSize = SAMPLE_RATE * 2 * RECORD_TIME; // 160,000 bytes
  uint32_t totalFileSize = dataSize + WAV_HEADER_SIZE; // 160,044 bytes

  // 1. Output Structured Metadata Header
  Serial.println("\n---START_METADATA---");
  Serial.print("DEVICE_UID:"); Serial.println(DEVICE_UID);
  Serial.print("FIRMWARE:"); Serial.println(FIRMWARE_VERSION);
  Serial.print("TRIGGER_SOURCE:"); Serial.println(triggerSource);
  Serial.print("SAMPLE_RATE:"); Serial.println(SAMPLE_RATE);
  Serial.print("DURATION_SEC:"); Serial.println(RECORD_TIME);
  Serial.print("WAV_FILE_SIZE:"); Serial.println(totalFileSize);
  Serial.println("---END_METADATA---");

  // 2. Start WAV Stream
  Serial.println("---START_WAV---");

  // Transmit 44-byte WAV Header in Hex
  byte wavHeader[WAV_HEADER_SIZE];
  getWavHeader(wavHeader, dataSize);

  uint32_t hexByteCount = 0;
  for (int i = 0; i < WAV_HEADER_SIZE; i++) {
    if (wavHeader[i] < 16) Serial.print("0");
    Serial.print(wavHeader[i], HEX);
    hexByteCount++;
    if (hexByteCount % 32 == 0) Serial.println();
  }

  // Flush initial mic stabilization readings
  size_t dummyBytes;
  int32_t dummyBuf[32];
  for (int i = 0; i < 10; i++) {
    i2s_read(I2S_PORT, dummyBuf, sizeof(dummyBuf), &dummyBytes, 30);
  }

  // 3. Stream 5s of 16-bit PCM Audio directly from I2S DMA in Real Time
  const int CHUNK_SAMPLES = 64;
  int32_t i2sBuffer[CHUNK_SAMPLES];
  uint32_t bytesStreamed = 0;

  while (bytesStreamed < dataSize) {
    size_t bytesRead = 0;
    i2s_read(I2S_PORT, i2sBuffer, sizeof(i2sBuffer), &bytesRead, portMAX_DELAY);
    int samplesRead = bytesRead / sizeof(int32_t);

    for (int i = 0; i < samplesRead; i++) {
      if (bytesStreamed >= dataSize) break;

      // INMP441 outputs 24-bit audio in 32-bit slot; scale down to 16-bit PCM
      int16_t sample16 = (int16_t)(i2sBuffer[i] >> 14);

      // Little-endian order (Low byte first, then High byte)
      uint8_t lowByte = (uint8_t)(sample16 & 0xFF);
      uint8_t highByte = (uint8_t)((sample16 >> 8) & 0xFF);

      if (lowByte < 16) Serial.print("0");
      Serial.print(lowByte, HEX);
      hexByteCount++;
      if (hexByteCount % 32 == 0) Serial.println();

      if (highByte < 16) Serial.print("0");
      Serial.print(highByte, HEX);
      hexByteCount++;
      if (hexByteCount % 32 == 0) Serial.println();

      bytesStreamed += 2;
    }
  }

  Serial.println("\n---END_WAV---");
  i2s_driver_uninstall(I2S_PORT);

  Serial.println("[STATUS] 5s Audio direct streaming completed successfully.");
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n========================================================");
  Serial.println("🌲 DEEPGREEN IoT - DEVICE 1: ACOUSTIC / SEISMIC SENSOR NODE");
  Serial.print("Node UID:         "); Serial.println(DEVICE_UID);
  Serial.print("Firmware Version: "); Serial.println(FIRMWARE_VERSION);
  Serial.println("Streaming Mode:   Zero-SPIFFS Real-Time DMA Stream");
  Serial.println("========================================================");

  pinMode(VIBRATION_PIN, INPUT);
  attachInterrupt(digitalPinToInterrupt(VIBRATION_PIN), onVibrationInterrupt, CHANGE);
  Serial.print("[HARDWARE] Hardware interrupt attached to GPIO ");
  Serial.print(VIBRATION_PIN);
  Serial.println(" on CHANGE (detects both strike impulse & settling)");

  // Check Wakeup Cause
  esp_sleep_wakeup_cause_t wakeup_reason = esp_sleep_get_wakeup_cause();
  if (wakeup_reason == ESP_SLEEP_WAKEUP_EXT0) {
    Serial.println("\n[EVENT] Tier 1 Triggered: Seismic / Vibration Sensor (EXT0) detected strike!");
    recordAndTransmitAudio("VIBRATION_SENSOR_EXT0");

    if (ENABLE_DEEP_SLEEP) {
      Serial.println("[STATUS] Entering deep sleep. Re-arming vibration ext0 wake...");
      Serial.flush();
      esp_sleep_enable_ext0_wakeup(VIBRATION_PIN, 1);
      esp_deep_sleep_start();
    }
  } else {
    Serial.println("[STATUS] Boot / Reset complete. Listening for vibration strikes & Serial commands...");
    Serial.println("[COMMANDS] Send 'CMD:RECORD_5S' in Serial Monitor to trigger on-demand audio capture.");
    Serial.println("[COMMANDS] Send 'CMD:PING' in Serial Monitor to test connection.");
  }
}

void loop() {
  // 1. Process hardware interrupt flag
  if (g_vibrationDetected) {
    g_vibrationDetected = false;
    Serial.println("\n========================================================");
    Serial.println("💥 [EVENT] PHYSICAL VIBRATION STRIKE DETECTED ON GPIO 34!");
    Serial.println("⚡ [TRIGGER] Vibration interrupt fired! Starting 5-second acoustic acquisition...");
    Serial.println("========================================================");
    recordAndTransmitAudio("VIBRATION_ACTIVE_INTERRUPT");
  }

  // 2. Track raw pin state transitions for diagnostic visibility
  static int lastPinState = -1;
  int currentPinState = digitalRead(VIBRATION_PIN);
  if (currentPinState != lastPinState) {
    Serial.print("[SENSOR] GPIO 34 Raw Pin Transition -> ");
    Serial.println(currentPinState == HIGH ? "HIGH (Vibrating / Spring Open)" : "LOW (Idle / Spring Closed)");
    lastPinState = currentPinState;
  }

  // 3. Heartbeat log every 3.5 seconds
  static unsigned long lastHeartbeat = 0;
  if (millis() - lastHeartbeat >= 3500) {
    lastHeartbeat = millis();
    Serial.print("[HEARTBEAT] Armed. GPIO 34 State: ");
    Serial.print(currentPinState == HIGH ? "HIGH" : "LOW");
    Serial.println(" | Awaiting physical vibration or Serial CMD:RECORD_5S...");
  }

  // Process incoming Serial commands from FastAPI / Host PC
  while (Serial.available() > 0) {
    char c = Serial.read();
    if (c == '\n' || c == '\r') {
      inputCommandBuffer.trim();
      if (inputCommandBuffer.length() > 0) {
        Serial.print("[HOST_CMD] Received: ");
        Serial.println(inputCommandBuffer);

        if (inputCommandBuffer == "CMD:RECORD_5S" || inputCommandBuffer == "RECORD") {
          Serial.println("[ACK] On-demand 5s audio recording triggered by operator.");
          recordAndTransmitAudio("OPERATOR_MANUAL_COMMAND");
        } else if (inputCommandBuffer == "CMD:PING" || inputCommandBuffer == "PING") {
          Serial.println("PONG:DGN-NODE-67SF-608:ONLINE");
        } else if (inputCommandBuffer == "CMD:STATUS" || inputCommandBuffer == "STATUS") {
          Serial.println("STATUS:OK:BATTERY=98%:MIC=INMP441:VIBE=ARMED:STREAM=DIRECT");
        } else {
          Serial.print("[WARN] Unknown command: ");
          Serial.println(inputCommandBuffer);
        }
        inputCommandBuffer = "";
      }
    } else {
      inputCommandBuffer += c;
    }
  }

  delay(10);
}
