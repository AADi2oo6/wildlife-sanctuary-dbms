import serial
import serial.tools.list_ports
import threading
import time
import logging
import os
import asyncio
import collections
from pathlib import Path
from typing import Dict, Any, Optional, Callable, List

logger = logging.getLogger("fastapi_iot.serial_manager")

BASE_DIR = Path(__file__).resolve().parent.parent
AUDIO_DIR = BASE_DIR / "uploads" / "audio"
AUDIO_DIR.mkdir(parents=True, exist_ok=True)

class SerialNodeListener:
    """
    Dedicated worker thread managing a single node's USB UART serial connection.
    Listens for framed 5-second WAV audio packets (Zero-SPIFFS DMA stream),
    buffers raw hardware diagnostic logs, and auto-reconnects if unplugged.
    """

    def __init__(self, node_id: int, port: str, baud_rate: int = 115200, on_audio_received: Optional[Callable] = None):
        self.node_id = node_id
        self.port = port
        self.baud_rate = baud_rate
        self.on_audio_received = on_audio_received

        self.ser: Optional[serial.Serial] = None
        self.is_running = False
        self.thread: Optional[threading.Thread] = None
        self.recent_logs = collections.deque(maxlen=100)

        # State machine for stream parsing
        self.is_reading_metadata = False
        self.is_reading_wav = False
        self.metadata: Dict[str, str] = {}
        self.wav_hex_chunks: List[str] = []
        self._last_error_time: float = 0.0
        self._last_error_msg: str = ""

    def start(self) -> bool:
        if self.is_running:
            return True

        self.is_running = True
        self.thread = threading.Thread(target=self._read_loop, name=f"SerialNode-{self.node_id}", daemon=True)
        self.thread.start()
        return True

    def stop(self):
        logger.info(f"⏹️ [SerialManager] Stopping listener for Node #{self.node_id} on {self.port}...")
        self.is_running = False
        if self.ser and self.ser.is_open:
            try:
                self.ser.close()
            except Exception:
                pass
        self.ser = None

    def send_command(self, cmd: str) -> bool:
        if not self.ser or not self.ser.is_open:
            logger.warning(f"[SerialManager] Cannot send command; {self.port} is not open.")
            return False

        try:
            formatted = cmd.strip() + "\n"
            self.ser.write(formatted.encode("utf-8"))
            self.ser.flush()
            logger.info(f"📤 [SerialManager] Transmitted to Node #{self.node_id} on {self.port}: '{cmd.strip()}'")
            return True
        except Exception as e:
            logger.error(f"❌ [SerialManager] Failed to transmit command: {e}")
            return False

    def _open_port(self) -> bool:
        try:
            self.ser = serial.Serial(self.port, self.baud_rate, timeout=1.0)
            logger.info(f"✅ [SerialManager] Successfully opened {self.port} at {self.baud_rate} baud for Node #{self.node_id}.")
            self.recent_logs.append(f"[SYSTEM] Connected to {self.port} at {self.baud_rate} baud.")
            self._last_error_msg = ""
            return True
        except Exception as e:
            now = time.time()
            err_str = str(e)
            if now - self._last_error_time > 30.0 or err_str != self._last_error_msg:
                self._last_error_time = now
                self._last_error_msg = err_str
                logger.warning(f"⏳ [SerialManager] Waiting for {self.port} on Node #{self.node_id} (Hardware not connected or offline)")
                self.recent_logs.append(f"[SYSTEM_WAIT] Waiting for {self.port} connection...")
            return False

    def _read_loop(self):
        # Initial connection attempt
        while self.is_running and not self.ser:
            if self._open_port():
                break
            time.sleep(5.0)

        time.sleep(1.2) # Wait for ESP32 auto-reset settling

        while self.is_running:
            if not self.ser or not self.ser.is_open:
                time.sleep(5.0)
                if self.is_running:
                    self._open_port()
                continue

            try:
                line_bytes = self.ser.readline()
                if not line_bytes:
                    continue

                line = line_bytes.decode("utf-8", errors="replace").strip()
                if not line:
                    continue

                # Buffer recent log for UI diagnosis
                self.recent_logs.append(line)

                # 1. Delimiter: Metadata Start
                if "---START_METADATA---" in line:
                    self.is_reading_metadata = True
                    self.metadata = {}
                    logger.info(f"📋 [Node #{self.node_id}] Header Metadata detected on Serial...")
                    continue

                # 2. Delimiter: Metadata End
                elif "---END_METADATA---" in line:
                    self.is_reading_metadata = False
                    logger.info(
                        f"📋 [Node #{self.node_id}] Metadata received: UID={self.metadata.get('DEVICE_UID')}, "
                        f"Trigger={self.metadata.get('TRIGGER_SOURCE')}, Duration={self.metadata.get('DURATION_SEC')}s"
                    )
                    continue

                # 3. Delimiter: Audio Stream Start
                elif "---START_WAV---" in line:
                    self.is_reading_wav = True
                    self.wav_hex_chunks = []
                    logger.info(f"🎧 [Node #{self.node_id}] Audio WAV HEX stream incoming...")
                    continue

                # 4. Delimiter: Audio Stream End -> Assemble File & Dispatch
                elif "---END_WAV---" in line:
                    self.is_reading_wav = False
                    all_hex = "".join(self.wav_hex_chunks)
                    logger.info(f"🎧 [Node #{self.node_id}] Audio stream complete ({len(all_hex)} hex characters). Assembling WAV...")
                    self._assemble_and_dispatch_audio(all_hex)
                    self.wav_hex_chunks = []
                    continue

                # Parse inside Metadata block
                if self.is_reading_metadata:
                    if ":" in line:
                        k, v = line.split(":", 1)
                        self.metadata[k.strip()] = v.strip()
                    continue

                # Accumulate inside Audio block
                if self.is_reading_wav:
                    clean_chunk = "".join(line.split())
                    self.wav_hex_chunks.append(clean_chunk)
                    continue

                # Prominent logging of ESP32 sensor notifications & vibration events
                if any(k in line for k in ["EVENT", "TRIGGER", "VIBRATION", "vibration", "strike", "ERROR", "FATAL", "ACK"]):
                    logger.info(f"💥 [ESP32 Node #{self.node_id} on {self.port}] {line}")
                elif any(k in line for k in ["HEARTBEAT", "SENSOR", "STATUS", "PONG"]):
                    logger.info(f"💓 [ESP32 Node #{self.node_id} on {self.port}] {line}")
                else:
                    logger.info(f"📡 [ESP32 Node #{self.node_id} on {self.port}] {line}")

            except serial.SerialException as se:
                logger.error(f"❌ [SerialManager] Serial connection lost on Node #{self.node_id} ({self.port}): {se}")
                self.recent_logs.append(f"[SYSTEM_ERROR] Connection lost: {se}")
                if self.ser:
                    try:
                        self.ser.close()
                    except Exception:
                        pass
                    self.ser = None
                time.sleep(3.0)
            except Exception as e:
                logger.error(f"⚠️ [SerialManager] Parse error on Node #{self.node_id}: {e}")
                time.sleep(0.5)

        self.is_running = False

    def _assemble_and_dispatch_audio(self, hex_string: str):
        try:
            raw_bytes = bytes.fromhex(hex_string)
            if len(raw_bytes) < 44:
                logger.error(f"❌ [SerialManager] Audio stream too short ({len(raw_bytes)} bytes); invalid WAV.")
                return

            filename = f"threat_node{self.node_id}_{int(time.time() * 1000)}.wav"
            filepath = AUDIO_DIR / filename
            relative_url = f"/uploads/audio/{filename}"

            with open(filepath, "wb") as f:
                f.write(raw_bytes)

            logger.info(f"🎉 [SerialManager] Reconstructed WAV saved: {filename} ({len(raw_bytes):,} bytes)")
            self.recent_logs.append(f"[AUDIO] Reconstructed WAV: {filename} ({len(raw_bytes):,} bytes)")

            # Dispatch payload with dual keys for compatibility
            payload = {
                "node_id": self.node_id,
                "device_uid": self.metadata.get("DEVICE_UID", "DGN-NODE-67SF-608"),
                "trigger_source": self.metadata.get("TRIGGER_SOURCE", "VIBRATION_INTERRUPT"),
                "sample_rate": int(self.metadata.get("SAMPLE_RATE", 16000)),
                "duration_sec": int(self.metadata.get("DURATION_SEC", 5)),
                "file_path": str(filepath),
                "audio_file_path": str(filepath),
                "relative_url": relative_url,
                "audio_sample_url": relative_url,
                "file_size": len(raw_bytes),
                "timestamp": int(time.time() * 1000)
            }

            if self.on_audio_received:
                self.on_audio_received(payload)

        except Exception as err:
            logger.error(f"❌ [SerialManager] Failed to decode and assemble WAV file: {err}")

class SerialBridgeManager:
    """
    Singleton orchestrator managing all active serial port listeners and hardware dispatch.
    """

    def __init__(self):
        self._listeners: Dict[int, SerialNodeListener] = {}
        self._audio_callbacks: List[Callable] = []
        self._main_loop: Optional[asyncio.AbstractEventLoop] = None

    def set_event_loop(self, loop: asyncio.AbstractEventLoop):
        """
        Store reference to main asyncio loop for thread-safe coroutine dispatching.
        """
        self._main_loop = loop

    def list_ports(self) -> List[Dict[str, Any]]:
        """
        Scan host OS for physically connected USB UART serial devices.
        """
        ports = serial.tools.list_ports.comports()
        results = []
        for p in ports:
            results.append({
                "port": p.device,
                "description": p.description,
                "hwid": p.hwid,
                "manufacturer": getattr(p, "manufacturer", None)
            })
        return results

    def register_audio_callback(self, callback: Callable):
        """
        Register a function to receive audio capture events.
        """
        if callback not in self._audio_callbacks:
            self._audio_callbacks.append(callback)

    def _on_audio_dispatched(self, payload: Dict[str, Any]):
        """
        Internal dispatcher when any node finishes streaming a 5s audio WAV.
        Dispatches safely onto the main asyncio loop.
        """
        for cb in self._audio_callbacks:
            try:
                if asyncio.iscoroutinefunction(cb):
                    if self._main_loop and self._main_loop.is_running():
                        asyncio.run_coroutine_threadsafe(cb(payload), self._main_loop)
                    else:
                        asyncio.run(cb(payload))
                else:
                    cb(payload)
            except Exception as e:
                logger.error(f"❌ [SerialBridgeManager] Error invoking audio callback: {e}")

    def connect_node(self, node_id: int, port: str, baud_rate: int = 115200) -> bool:
        """
        Start serial listener on the specified port.
        """
        self.disconnect_node(node_id) # Ensure previous connection closed

        listener = SerialNodeListener(
            node_id=node_id,
            port=port,
            baud_rate=baud_rate,
            on_audio_received=self._on_audio_dispatched
        )
        success = listener.start()
        if success:
            self._listeners[node_id] = listener
        return success

    def disconnect_node(self, node_id: int):
        """
        Stop listener and free the serial port for this node.
        """
        if node_id in self._listeners:
            self._listeners[node_id].stop()
            del self._listeners[node_id]

    def is_listening(self, node_id: int) -> bool:
        listener = self._listeners.get(node_id)
        return bool(listener and listener.is_running)

    def get_listener_status(self, node_id: int) -> Dict[str, Any]:
        listener = self._listeners.get(node_id)
        if not listener:
            return {"connected": False, "port": None, "baud_rate": None, "is_open": False}
        return {
            "connected": listener.is_running,
            "port": listener.port,
            "baud_rate": listener.baud_rate,
            "is_open": bool(listener.ser and listener.ser.is_open)
        }

    def get_recent_logs(self, node_id: int) -> List[str]:
        listener = self._listeners.get(node_id)
        if listener:
            return list(listener.recent_logs)
        return []

    def trigger_manual_audio(self, node_id: int) -> bool:
        listener = self._listeners.get(node_id)
        if not listener or not listener.is_running:
            logger.warning(f"[SerialBridgeManager] Cannot trigger manual audio: Node #{node_id} is not connected.")
            return False
        return listener.send_command("CMD:RECORD_5S")

# Singleton instance
serial_bridge = SerialBridgeManager()
