import requests
import random
import time
import sys

# Ensure UTF-8 output encoding on Windows terminals to prevent charmap crashes
if sys.platform == "win32":
    try:
        if hasattr(sys.stdout, "reconfigure"):
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        if hasattr(sys.stderr, "reconfigure"):
            sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

PRIMARY_URL = "http://localhost:8000/api/telemetry"
FALLBACK_URL = "http://localhost:5000/api/telemetry"

# Target the deployed "Collage Garden" Node
TARGET_NODE_UID = "DGN-NODE-67SF-608"

PRESETS = {
    "1": {
        "name": "[Chainsaw Acoustic Detection]",
        "icon": "🪚",
        "threat_type": "Chainsaw",
        "sound_level_db": 89.2,
        "confidence_score": 0.948,
        "notes": "2-stroke engine acoustic harmonics detected near north perimeter."
    },
    "2": {
        "name": "[Ballistic Gunshot Wavefront]",
        "icon": "💥",
        "threat_type": "Gunshot",
        "sound_level_db": 116.0,
        "confidence_score": 0.975,
        "notes": "High amplitude supersonic impulse matching centerfire rifle discharge."
    },
    "3": {
        "name": "[Vehicle Geophone Vibration]",
        "icon": "🚜",
        "threat_type": "Vehicle",
        "sound_level_db": 77.5,
        "confidence_score": 0.865,
        "notes": "Low-frequency diesel engine vibrations on unpaved service trail."
    },
    "4": {
        "name": "[Wildfire Thermal & Smoke]",
        "icon": "🔥",
        "threat_type": "Fire",
        "sound_level_db": 65.0,
        "confidence_score": 0.912,
        "notes": "Thermal sensor spike (+15°C) and air particulate threshold exceeded."
    },
    "5": {
        "name": "[Elephant Herd Infrasound]",
        "icon": "🐘",
        "threat_type": "Animal",
        "sound_level_db": 68.4,
        "confidence_score": 0.934,
        "notes": "Infrasonic vocal rumble detected; wild Asian Elephant family group."
    },
    "6": {
        "name": "[Routine Environmental Telemetry]",
        "icon": "📡",
        "threat_type": None,
        "sound_level_db": 42.0,
        "confidence_score": None,
        "notes": "Normal ambient forest canopy background noise."
    }
}

def send_packet(node_uid=TARGET_NODE_UID, preset_key="1"):
    preset = PRESETS.get(preset_key, PRESETS["1"])
    
    # Slight dynamic variation
    db = round(preset["sound_level_db"] + random.uniform(-2.0, 2.0), 1)
    conf = round(preset["confidence_score"] + random.uniform(-0.02, 0.02), 3) if preset["confidence_score"] else None
    temp = round(26.5 + random.uniform(-1.5, 2.5), 1)
    hum = round(64.0 + random.uniform(-3.0, 4.0), 1)
    batt = random.randint(92, 99)

    payload = {
        "device_uid": node_uid,
        "threat_type": preset["threat_type"],
        "sound_level_db": db,
        "confidence_score": conf,
        "battery_level": batt,
        "temperature": temp,
        "humidity": hum,
        "notes": preset["notes"]
    }

    print(f"\n📡 [ESP32 -> Ingest] Transmitting telemetry for '{node_uid}'...")
    print(f"   Event:      {preset['icon']} {preset['name']}")
    print(f"   Sound:      {db} dB")
    if conf:
        print(f"   Confidence: {conf * 100:.1f}%")
    print(f"   Battery:    {batt}% | Temp: {temp}°C | Humidity: {hum}%")

    target_urls = [
        ("FastAPI Microservice (Port 8000)", PRIMARY_URL),
        ("Express Backend Fallback (Port 5000)", FALLBACK_URL)
    ]

    for label, url in target_urls:
        try:
            res = requests.post(url, json=payload, timeout=4)
            if res.status_code == 200:
                data = res.json()
                anomaly_flag = "🚨 THREAT ALERT LOGGED" if data.get("is_anomaly") else "✅ Normal Health Status"
                print(f"   Target:     {label}")
                print(f"   Result:     {anomaly_flag} (Node Status: {data.get('node_status')})")
                if data.get("trigger_event_id"):
                    print(f"   Memory Event ID: #{data.get('trigger_event_id')} stored in Supabase!")
                print("   Website:    Live on Map & Node Memory modal! 🌍")
                return True
            else:
                print(f"   [{label}] HTTP {res.status_code}: {res.text}")
        except requests.exceptions.ConnectionError:
            print(f"   [{label}] Offline or connection refused, checking fallback...")
        except Exception as e:
            print(f"   [{label}] Transmission error: {e}")

    print("   ❌ Failed to deliver packet to both Port 8000 (FastAPI) and Port 5000 (Express).")
    print("      Please make sure at least one server is running.")
    return False

def main():
    print("=" * 60)
    print("🌲 DEEPGREEN / SANCTUARY IoT SYSTEM - MOCK ESP32 CLIENT 📡")
    print("=" * 60)
    print(f"Primary Server:   {PRIMARY_URL}")
    print(f"Fallback Server:  {FALLBACK_URL}")
    print(f"Target Node:      {TARGET_NODE_UID} (Collage Garden)")
    print("-" * 60)

    # Allow CLI argument: python mock_esp32.py 1
    if len(sys.argv) > 1:
        arg = sys.argv[1].strip().upper()
        if arg in PRESETS:
            send_packet(TARGET_NODE_UID, arg)
            return
        elif arg == "A":
            print("\n⚡ Starting continuous telemetry stream via CLI argument. Press Ctrl+C to stop.")
            try:
                while True:
                    k = random.choices(["6", "1", "3", "5"], weights=[80, 7, 7, 6])[0]
                    send_packet(TARGET_NODE_UID, k)
                    time.sleep(4)
            except KeyboardInterrupt:
                print("\nStream stopped.")
                return

    print("Choose action:")
    print("  [1] 🪚 Fire Chainsaw Threat Alert")
    print("  [2] 💥 Fire Ballistic Gunshot Threat Alert")
    print("  [3] 🚜 Fire Vehicle Intrusion Warning")
    print("  [4] 🔥 Fire Wildfire Thermal Anomaly")
    print("  [5] 🐘 Fire Elephant Infrasound Signal")
    print("  [6] 📡 Send Normal Background Heartbeat")
    print("  [A] ⚡ Start Automated Continuous Telemetry Stream (every 4s)")
    print("  [Q] Exit")
    print("=" * 60)

    while True:
        try:
            choice = input("\nEnter choice [1-6, A, Q]: ").strip().upper()
            if choice in ("Q", "QUIT", "EXIT"):
                print("Exiting ESP32 client.")
                break
            elif choice == "A":
                print("\n⚡ Starting continuous telemetry stream. Press Ctrl+C to stop.")
                while True:
                    k = random.choices(["6", "1", "3", "5"], weights=[80, 7, 7, 6])[0]
                    send_packet(TARGET_NODE_UID, k)
                    time.sleep(4)
            elif choice in PRESETS:
                send_packet(TARGET_NODE_UID, choice)
            else:
                print("Invalid option. Enter 1 to 6, A, or Q.")
        except KeyboardInterrupt:
            print("\nStream stopped.")
            break

if __name__ == "__main__":
    main()
