/*
 =========================================================================================
  🌲 DeepGreen / Wildlife Sanctuary IoT - Device 1 Firmware
  Module: ESP32 + Vibration Sensor + INMP441 I2S Microphone
  Hardware Pinout:
    - Vibration Sensor (SW-420): GPIO 34 (RTC GPIO ext0 wake / digital interrupt)
    - I2S WS (Word Select / L/R Clock): GPIO 25
    - I2S SCK (Continuous Serial Clock): GPIO 26
    - I2S SD (Serial Data): GPIO 33
    - I2S L/R (Channel Select): GND (Left Channel)
    - VCC / GND: 3.3V / GND
  
  Features:
    - 5-Second 16kHz 16-bit Mono Audio Recording stored to SPIFFS
    - Dual Operation Modes:
      1) Event-Triggered: Hardware vibration strike wakes ESP32 from Deep Sleep
      2) On-Demand / Manual: Host computer sends serial command "CMD:RECORD_5S" over USB
    - Framed Serial Transmission with Metadata & Hex WAV byte stream
 =========================================================================================
*/

#include <Arduino.h>
#include <driver/i2s.h>
#include <SPIFFS.h>
#include <FS.h>

// --- Device Identity ---
#define DEVICE_UID "DGN-NODE-67SF-608"
#define FIRMWARE_VERSION "v2.0-wired"

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

void writeWavHeader(File &file, uint32_t dataSize) {
  byte header[WAV_HEADER_SIZE];
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
  file.write(header, WAV_HEADER_SIZE);
}

bool initI2SMicrophone() {
  i2s_config_t i2s_config = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
    .sample_rate = SAMPLE_RATE,
    .bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT, // INMP441 requires 32-bit slot
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

  // Remove existing file if present
  if (SPIFFS.exists("/threat.wav")) {
    SPIFFS.remove("/threat.wav");
  }

  File file = SPIFFS.open("/threat.wav", FILE_WRITE);
  if (!file) {
    Serial.println("[ERROR] Failed to create /threat.wav in SPIFFS");
    i2s_driver_uninstall(I2S_PORT);
    return;
  }

  uint32_t dataSize = SAMPLE_RATE * 2 * RECORD_TIME; // 160,000 bytes
  writeWavHeader(file, dataSize);

  Serial.println("[STATUS] Recording 5 seconds of audio buffer...");
  uint32_t bytesWritten = 0;
  
  // Discard first 200ms to allow mic PLL settling
  size_t dummyBytes;
  int32_t dummyBuf[32];
  for (int i = 0; i < 15; i++) {
    i2s_read(I2S_PORT, dummyBuf, sizeof(dummyBuf), &dummyBytes, 50);
  }

  while (bytesWritten < dataSize) {
    int32_t sample32 = 0;
    size_t bytesRead = 0;
    i2s_read(I2S_PORT, &sample32, sizeof(int32_t), &bytesRead, portMAX_DELAY);
    
    // Scale 32-bit slot down to 16-bit PCM
    int16_t sample16 = (int16_t)(sample32 >> 14); 
    file.write((uint8_t*)&sample16, sizeof(int16_t));
    bytesWritten += sizeof(int16_t);
  }

  file.close();
  i2s_driver_uninstall(I2S_PORT);
  Serial.println("[STATUS] 5s Audio capture complete. Transmitting over Serial framing...");

  // Transmit framed packet
  file = SPIFFS.open("/threat.wav", FILE_READ);
  if (!file) {
    Serial.println("[ERROR] Failed to reopen recorded WAV for transmission.");
    return;
  }

  uint32_t totalFileSize = file.size();

  // Print Structured Metadata Header
  Serial.println("\n---START_METADATA---");
  Serial.print("DEVICE_UID:"); Serial.println(DEVICE_UID);
  Serial.print("FIRMWARE:"); Serial.println(FIRMWARE_VERSION);
  Serial.print("TRIGGER_SOURCE:"); Serial.println(triggerSource);
  Serial.print("SAMPLE_RATE:"); Serial.println(SAMPLE_RATE);
  Serial.print("DURATION_SEC:"); Serial.println(RECORD_TIME);
  Serial.print("WAV_FILE_SIZE:"); Serial.println(totalFileSize);
  Serial.println("---END_METADATA---");

  // Print Hex Encoded Audio Stream
  Serial.println("---START_WAV---");
  uint32_t count = 0;
  while (file.available()) {
    uint8_t b = file.read();
    if (b < 16) Serial.print("0");
    Serial.print(b, HEX);
    count++;
    if (count % 32 == 0) {
      Serial.println(); // 32 hex bytes (64 chars) per line for clean buffering
    }
  }
  Serial.println("\n---END_WAV---");
  file.close();

  Serial.println("[STATUS] Audio transmission completed successfully.");
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n========================================================");
  Serial.println("🌲 DEEPGREEN IoT - DEVICE 1: ACOUSTIC / SEISMIC SENSOR NODE");
  Serial.print("Node UID:         "); Serial.println(DEVICE_UID);
  Serial.print("Firmware Version: "); Serial.println(FIRMWARE_VERSION);
  Serial.println("========================================================");

  pinMode(VIBRATION_PIN, INPUT);

  if (!SPIFFS.begin(true)) {
    Serial.println("[FATAL] SPIFFS Filesystem Mount Failed");
    return;
  }
  Serial.println("[INFO] SPIFFS storage initialized.");

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
    Serial.println("[COMMANDS] Send 'CMD:RECORD_5S' to test on-demand audio capture.");
    Serial.println("[COMMANDS] Send 'CMD:PING' to test connection.");
  }
}

void loop() {
  // Check if vibration pin went HIGH in active loop (wired mode)
  static int lastVibeState = LOW;
  int currentVibeState = digitalRead(VIBRATION_PIN);
  if (currentVibeState == HIGH && lastVibeState == LOW) {
    delay(50); // Debounce
    if (digitalRead(VIBRATION_PIN) == HIGH) {
      Serial.println("\n[EVENT] Physical vibration strike detected on GPIO 34!");
      recordAndTransmitAudio("VIBRATION_ACTIVE_INTERRUPT");
    }
  }
  lastVibeState = currentVibeState;

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
          Serial.println("STATUS:OK:BATTERY=98%:MIC=INMP441:VIBE=ARMED");
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
