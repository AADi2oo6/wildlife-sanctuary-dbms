"""
=========================================================================================
🌲 DeepGreen IoT - Device 1 Serial Verification Tool
Connects to ESP32 over USB Serial, receives 5s audio packets (either from vibration
strikes or manual CMD:RECORD_5S commands), and saves them as playable .wav files.
=========================================================================================
"""

import serial
import serial.tools.list_ports
import time
import sys
import os

def list_ports():
    ports = serial.tools.list_ports.comports()
    print("\n🔍 Available Serial / COM Ports:")
    for p in ports:
        print(f"   [{p.device}] - {p.description}")
    return [p.device for p in ports]

def listen_to_esp32(port_name, baud_rate=115200):
    print(f"\n🔌 Opening serial connection to {port_name} at {baud_rate} baud...")
    try:
        ser = serial.Serial(port_name, baud_rate, timeout=1)
    except Exception as e:
        print(f"❌ Failed to open port {port_name}: {e}")
        return

    time.sleep(2) # Allow ESP32 UART auto-reset settling
    print("✅ Connected to ESP32!")
    print("------------------------------------------------------------------")
    print("Options:")
    print("  • Tap or shake the SW-420 vibration sensor on GPIO 34")
    print("  • Or press Enter / type 'R' to send on-demand 'CMD:RECORD_5S'")
    print("  • Type 'Q' to quit")
    print("------------------------------------------------------------------\n")

    metadata = {}
    is_reading_metadata = False
    is_reading_wav = False
    wav_hex_data = ""

    while True:
        try:
            line = ser.readline().decode("utf-8", errors="replace").strip()
            if line:
                if "---START_METADATA---" in line:
                    is_reading_metadata = True
                    metadata = {}
                    print("\n📋 Receiving Header Metadata...")
                    continue
                elif "---END_METADATA---" in line:
                    is_reading_metadata = False
                    print(f"   Node UID:     {metadata.get('DEVICE_UID')}")
                    print(f"   Trigger:      {metadata.get('TRIGGER_SOURCE')}")
                    print(f"   Sample Rate:  {metadata.get('SAMPLE_RATE')} Hz")
                    print(f"   Duration:     {metadata.get('DURATION_SEC')} sec")
                    print(f"   Expected Size:{metadata.get('WAV_FILE_SIZE')} bytes")
                    continue
                elif "---START_WAV---" in line:
                    is_reading_wav = True
                    wav_hex_data = ""
                    print("🎧 Receiving WAV Audio Stream...")
                    continue
                elif "---END_WAV---" in line:
                    is_reading_wav = False
                    # Convert accumulated HEX data into binary WAV file
                    try:
                        raw_bytes = bytes.fromhex(wav_hex_data)
                        filename = f"test_recording_{int(time.time())}.wav"
                        with open(filename, "wb") as f:
                            f.write(raw_bytes)
                        print(f"🎉 SUCCESS! Audio saved to: {os.path.abspath(filename)}")
                        print(f"   File size: {len(raw_bytes):,} bytes")
                        print("   You can open and play this WAV file now!\n")
                    except Exception as err:
                        print(f"❌ Error decoding WAV data: {err}")
                    continue

                if is_reading_metadata:
                    if ":" in line:
                        k, v = line.split(":", 1)
                        metadata[k.strip()] = v.strip()
                elif is_reading_wav:
                    # Strip spaces or formatting and append hex characters
                    clean_hex = "".join(line.split())
                    wav_hex_data += clean_hex
                else:
                    # Normal terminal printout
                    print(f"[ESP32] {line}")

        except KeyboardInterrupt:
            print("\nDisconnecting...")
            break
        except Exception as e:
            print(f"Serial read error: {e}")
            break

    ser.close()

if __name__ == "__main__":
    available = list_ports()
    if not available:
        print("❌ No serial ports detected! Please connect your ESP32 via USB.")
        sys.exit(1)

    chosen_port = sys.argv[1] if len(sys.argv) > 1 else available[0]
    print(f"Selected port: {chosen_port}")
    listen_to_esp32(chosen_port)
