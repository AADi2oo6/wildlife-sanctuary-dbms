# DeepGreen IoT Ingestion & Telemetry Service (Phase 2) 🌲📡

Asynchronous **FastAPI** telemetry microservice connecting edge IoT devices (ESP32, Raspberry Pi, Arduino) to the **Supabase PostgreSQL** database with real-time WebSocket broadcasting and automated threat classification.

---

## 🎯 Target Node: Collage Garden
- **Node Name:** `Collage Garden`
- **Device UID:** `DGN-NODE-67SF-608`
- **Location:** Lat: `21.09021°`, Lng: `79.16327°`
- **Default Status:** `ACTIVE` (elevates to `ALERT` automatically upon anomaly detection)

---

## 🚀 Quick Start

### 1. Start the FastAPI Service
```powershell
cd fastapi-iot-service
.\venv\Scripts\activate
python main.py
```
Or simply double-click `run.bat`.

The service starts at **`http://localhost:8000`** with interactive Swagger documentation at **`http://localhost:8000/docs`**.

---

### 2. Test Ingestion with Mock ESP32 Client
```powershell
cd fastapi-iot-service
.\venv\Scripts\python mock_esp32.py
```
This interactive client allows you to:
- `[1]` Fire **Chainsaw** acoustic alert (89 dB, 94.8% confidence)
- `[2]` Fire **Gunshot** acoustic alert (116 dB, 97.5% confidence)
- `[3]` Fire **Vehicle** intrusion warning (77.5 dB, 86.5% confidence)
- `[4]` Fire **Wildfire** thermal & smoke spike (65 dB, 91.2% confidence)
- `[5]` Fire **Elephant** herd infrasound (68 dB, 93.4% confidence)
- `[6]` Send **Routine** environmental heartbeat (42 dB, Temp 26.5°C, Hum 64%, Batt 98%)
- `[A]` Start **Continuous Automated Streaming** (every 4 seconds)

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/telemetry` | Ingest edge telemetry packet (HTTP JSON) |
| `POST` | `/api/iot/telemetry` | Alias endpoint for IoT ingestion |
| `GET` | `/api/nodes` | List all deployed nodes directly from database |
| `GET` | `/api/nodes/{id}/history` | Retrieve chronological trigger memory for node |
| `GET` | `/api/alerts` | List recent threats across all nodes |
| `POST` | `/api/nodes/{id}/reset` | Reset node status back to `ACTIVE` |
| `WS` | `/ws/telemetry` | Real-time WebSocket stream for dashboard clients |
| `GET` | `/health` | Service health status |

---

## 📦 Ingestion Payload Format

```json
{
  "device_uid": "DGN-NODE-67SF-608",
  "threat_type": "Chainsaw",
  "sound_level_db": 89.2,
  "confidence_score": 0.948,
  "battery_level": 96,
  "temperature": 27.2,
  "humidity": 63.5,
  "notes": "Edge-AI continuous harmonic pattern match"
}
```
*(All fields except `device_uid` or `node_id` are optional; defaults route to the Collage Garden node).*
