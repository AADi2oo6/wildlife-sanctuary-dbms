/*
 =========================================================================================
  🌲 DeepGreen / Wildlife Sanctuary IoT - Device 2 Firmware
  Module: ESP32-CAM (AI-Thinker Model with OV2640 Sensor)
  
  Features:
    - Wi-Fi Station Mode connection
    - High-Resolution JPEG Snapshot Endpoint: GET /capture
    - Live Multipart MJPEG Video Stream Endpoint: GET /stream
    - Flashlight LED Control Endpoint: GET /flash?val=1 / GET /flash?val=0 (GPIO 4)
    - Device Diagnostics & Health: GET /status
    - Interactive Embedded Web Monitor: GET /
    - CORS Enabled for direct React Dashboard integration
 =========================================================================================
*/

#include "esp_camera.h"
#include <WiFi.h>
#include "esp_timer.h"
#include "img_converters.h"
#include "Arduino.h"
#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"
#include "esp_http_server.h"

// ==========================================
// 📶 CONFIGURE YOUR WI-FI CREDENTIALS HERE
// ==========================================
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Flashlight LED Pin on AI-Thinker ESP32-CAM
#define FLASH_LED_PIN 4

// ==========================================
// 📷 AI-THINKER ESP32-CAM PINOUT MAPPING
// ==========================================
#define PWDN_GPIO_NUM     32
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM      0
#define SIOD_GPIO_NUM     26
#define SIOC_GPIO_NUM     27

#define Y9_GPIO_NUM       35
#define Y8_GPIO_NUM       34
#define Y7_GPIO_NUM       39
#define Y6_GPIO_NUM       36
#define Y5_GPIO_NUM       21
#define Y4_GPIO_NUM       19
#define Y3_GPIO_NUM       18
#define Y2_GPIO_NUM        5
#define VSYNC_GPIO_NUM    25
#define HREF_GPIO_NUM     23
#define PCLK_GPIO_NUM     22

#define PART_BOUNDARY "123456789000000000000987654321"
static const char* _STREAM_CONTENT_TYPE = "multipart/x-mixed-replace;boundary=" PART_BOUNDARY;
static const char* _STREAM_BOUNDARY = "\r\n--" PART_BOUNDARY "\r\n";
static const char* _STREAM_PART = "Content-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n";

httpd_handle_t stream_httpd = NULL;
httpd_handle_t camera_httpd = NULL;
bool is_flash_on = false;

// ── GET /capture Handler ──────────────────────────────────────────────────────────
static esp_err_t capture_handler(httpd_req_t *req) {
  camera_fb_t *fb = NULL;
  esp_err_t res = ESP_OK;

  // Turn on flash briefly if configured or needed
  if (is_flash_on) {
    digitalWrite(FLASH_LED_PIN, HIGH);
    delay(40);
  }

  fb = esp_camera_fb_get();
  if (!fb) {
    Serial.println("[ERROR] Camera frame acquisition failed");
    httpd_resp_send_500(req);
    return ESP_FAIL;
  }

  httpd_resp_set_type(req, "image/jpeg");
  httpd_resp_set_hdr(req, "Content-Disposition", "inline; filename=capture.jpg");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Methods", "GET, OPTIONS");

  res = httpd_resp_send(req, (const char *)fb->buf, fb->len);
  esp_camera_fb_return(fb);

  if (is_flash_on) {
    digitalWrite(FLASH_LED_PIN, LOW);
  }

  Serial.println("[HTTP 200] Snapshot delivered to client via /capture");
  return res;
}

// ── GET /stream Handler ───────────────────────────────────────────────────────────
static esp_err_t stream_handler(httpd_req_t *req) {
  camera_fb_t *fb = NULL;
  esp_err_t res = ESP_OK;
  size_t _jpg_buf_len = 0;
  uint8_t *_jpg_buf = NULL;
  char part_buf[64];

  res = httpd_resp_set_type(req, _STREAM_CONTENT_TYPE);
  if (res != ESP_OK) return res;

  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");

  Serial.println("[STREAM] Live MJPEG video stream started by client");

  while (true) {
    fb = esp_camera_fb_get();
    if (!fb) {
      Serial.println("[STREAM_ERROR] Frame capture error in stream loop");
      res = ESP_FAIL;
      break;
    }

    _jpg_buf_len = fb->len;
    _jpg_buf = fb->buf;

    if (res == ESP_OK) {
      res = httpd_resp_send_chunk(req, _STREAM_BOUNDARY, strlen(_STREAM_BOUNDARY));
    }
    if (res == ESP_OK) {
      size_t hlen = snprintf(part_buf, 64, _STREAM_PART, _jpg_buf_len);
      res = httpd_resp_send_chunk(req, part_buf, hlen);
    }
    if (res == ESP_OK) {
      res = httpd_resp_send_chunk(req, (const char *)_jpg_buf, _jpg_buf_len);
    }
    esp_camera_fb_return(fb);
    fb = NULL;
    _jpg_buf = NULL;

    if (res != ESP_OK) {
      break;
    }
  }

  Serial.println("[STREAM] Live video stream ended");
  return res;
}

// ── GET /flash Handler ───────────────────────────────────────────────────────────
static esp_err_t flash_handler(httpd_req_t *req) {
  char buf[32];
  if (httpd_req_get_url_query_str(req, buf, sizeof(buf)) == ESP_OK) {
    char param[8];
    if (httpd_query_key_value(buf, "val", param, sizeof(param)) == ESP_OK) {
      int val = atoi(param);
      is_flash_on = (val == 1);
      digitalWrite(FLASH_LED_PIN, is_flash_on ? HIGH : LOW);
    }
  }

  httpd_resp_set_type(req, "application/json");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
  const char* resp = is_flash_on ? "{\"flash\":true,\"status\":\"on\"}" : "{\"flash\":false,\"status\":\"off\"}";
  return httpd_resp_send(req, resp, strlen(resp));
}

// ── GET /status Handler ──────────────────────────────────────────────────────────
static esp_err_t status_handler(httpd_req_t *req) {
  char json[256];
  snprintf(json, sizeof(json),
    "{\"status\":\"online\",\"device\":\"ESP32-CAM\",\"model\":\"OV2640\","
    "\"ip\":\"%s\",\"rssi\":%d,\"flash\":%s,\"resolution\":\"SVGA (800x600)\"}",
    WiFi.localIP().toString().c_str(), WiFi.RSSI(), is_flash_on ? "true" : "false"
  );

  httpd_resp_set_type(req, "application/json");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
  return httpd_resp_send(req, json, strlen(json));
}

// ── GET / (Home Dashboard) Handler ──────────────────────────────────────────────
static esp_err_t index_handler(httpd_req_t *req) {
  String html = "<!DOCTYPE html><html><head><meta charset='utf-8'><title>DeepGreen ESP32-CAM</title>"
    "<meta name='viewport' content='width=device-width, initial-scale=1'>"
    "<style>body{background:#0d1a0f;color:#fff;font-family:sans-serif;text-align:center;padding:20px;}"
    "h1{color:#a3e635;margin-bottom:6px;}p{color:#a1a1aa;font-size:14px;}"
    ".btn{display:inline-block;padding:10px 18px;margin:8px;background:#a3e635;color:#000;font-weight:bold;"
    "border-radius:10px;text-decoration:none;border:none;cursor:pointer;}"
    ".btn-secondary{background:rgba(255,255,255,0.1);color:#fff;}"
    ".container{max-width:820px;margin:0 auto;border:1px solid rgba(163,230,53,0.3);border-radius:16px;padding:20px;background:rgba(255,255,255,0.02);}"
    "img{max-width:100%;border-radius:12px;border:2px solid #a3e635;box-shadow:0 0 25px rgba(163,230,53,0.2);}"
    "</style></head><body><div class='container'>"
    "<h1>🌲 DeepGreen ESP32-CAM Node</h1>"
    "<p>Optical Surveillance Unit · AI-Thinker OV2640</p>"
    "<div style='margin: 15px 0;'>"
    "<a class='btn' href='/stream' target='_blank'>📹 Open Live Stream</a>"
    "<a class='btn btn-secondary' href='/capture' target='_blank'>📸 Capture Single Frame</a>"
    "<button class='btn btn-secondary' onclick='fetch(\"/flash?val=1\");'>💡 Flash ON</button>"
    "<button class='btn btn-secondary' onclick='fetch(\"/flash?val=0\");'>🌑 Flash OFF</button>"
    "</div>"
    "<div><img src='/stream' alt='Live Video Feed' /></div>"
    "<p style='margin-top:15px; font-size:12px; color:#71717a;'>IP: " + WiFi.localIP().toString() + " | RSSI: " + String(WiFi.RSSI()) + " dBm</p>"
    "</div></body></html>";

  httpd_resp_set_type(req, "text/html");
  return httpd_resp_send(req, html.c_str(), html.length());
}

void startCameraServer() {
  httpd_config_t config = HTTPD_DEFAULT_CONFIG();
  config.server_port = 80;

  httpd_uri_t index_uri = { .uri = "/", .method = HTTP_GET, .handler = index_handler, .user_ctx = NULL };
  httpd_uri_t capture_uri = { .uri = "/capture", .method = HTTP_GET, .handler = capture_handler, .user_ctx = NULL };
  httpd_uri_t flash_uri = { .uri = "/flash", .method = HTTP_GET, .handler = flash_handler, .user_ctx = NULL };
  httpd_uri_t status_uri = { .uri = "/status", .method = HTTP_GET, .handler = status_handler, .user_ctx = NULL };

  if (httpd_start(&camera_httpd, &config) == ESP_OK) {
    httpd_register_uri_handler(camera_httpd, &index_uri);
    httpd_register_uri_handler(camera_httpd, &capture_uri);
    httpd_register_uri_handler(camera_httpd, &flash_uri);
    httpd_register_uri_handler(camera_httpd, &status_uri);
    Serial.println("[INFO] HTTP API Server running on port 80");
  }

  // Stream Server on Port 81
  httpd_config_t config_stream = HTTPD_DEFAULT_CONFIG();
  config_stream.server_port = 81;
  config_stream.ctrl_port = 32769;

  httpd_uri_t stream_uri = { .uri = "/stream", .method = HTTP_GET, .handler = stream_handler, .user_ctx = NULL };
  if (httpd_start(&stream_httpd, &config_stream) == ESP_OK) {
    httpd_register_uri_handler(stream_httpd, &stream_uri);
    Serial.println("[INFO] Live MJPEG Stream Server running on port 81 (/stream)");
  }
}

void setup() {
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0); // Disable brownout detector for camera current spikes

  Serial.begin(115200);
  delay(1000);

  pinMode(FLASH_LED_PIN, OUTPUT);
  digitalWrite(FLASH_LED_PIN, LOW);

  Serial.println("\n========================================================");
  Serial.println("🌲 DEEPGREEN IoT - DEVICE 2: OPTICAL SURVEILLANCE NODE");
  Serial.println("========================================================");

  // Camera Configuration
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sscb_sda = SIOD_GPIO_NUM;
  config.pin_sscb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;

  // Frame size & quality depending on PSRAM availability
  if (psramFound()) {
    Serial.println("[INFO] PSRAM detected (4MB). Configuring SVGA (800x600)...");
    config.frame_size = FRAMESIZE_SVGA; // 800x600 high clarity for Vision AI
    config.jpeg_quality = 10;           // 10-63 (lower = higher quality)
    config.fb_count = 2;
  } else {
    Serial.println("[WARN] No PSRAM detected. Downgrading to VGA (640x480)...");
    config.frame_size = FRAMESIZE_VGA;
    config.jpeg_quality = 12;
    config.fb_count = 1;
  }

  // Camera Init
  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("[FATAL] Camera init failed with error 0x%x\n", err);
    return;
  }
  Serial.println("[SUCCESS] OV2640 Camera sensor initialized.");

  // Connect to Wi-Fi
  Serial.printf("[WIFI] Connecting to SSID: %s ", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[SUCCESS] Wi-Fi Connected!");
    Serial.print("   Assigned IP Address: http://");
    Serial.println(WiFi.localIP());
    Serial.print("   Snapshot Endpoint:   http://");
    Serial.print(WiFi.localIP());
    Serial.println("/capture");
    Serial.print("   Live Video Stream:   http://");
    Serial.print(WiFi.localIP());
    Serial.println(":81/stream");
    
    // Start HTTP servers
    startCameraServer();
  } else {
    Serial.println("\n[ERROR] Wi-Fi connection timed out. Check SSID & Password in code.");
  }
}

void loop() {
  delay(1000);
}
