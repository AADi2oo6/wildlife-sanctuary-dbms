import os
import json
import logging
import asyncio
from pathlib import Path
from typing import Set, Dict, Any, Optional
import httpx

logger = logging.getLogger("fastapi_iot.telegram")

TELEGRAM_BOT_TOKEN = "8542047992:AAG7kpfMTp-jajG98TjrSsw_KNuXBi-dxJ8"
TELEGRAM_API_BASE = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}"
SUBSCRIBERS_FILE = Path(__file__).resolve().parent.parent / "telegram_subscribers.json"

class TelegramAlertBot:
    """
    Autonomous Telegram Security Bot for DeepGreen Wildlife Sanctuary.
    Features:
    - Background long-polling for commands (/start, /status, /nodes, /recent, /help)
    - Real-time instant threat notifications with Audio AI diagnosis
    - Automatic photo snapshot attachment (from ESP32-CAM)
    - Audio forensic snippet delivery
    """

    def __init__(self):
        self.subscribers: Set[int] = set()
        self.is_running = False
        self.polling_task: Optional[asyncio.Task] = None
        self._load_subscribers()

    def _load_subscribers(self):
        try:
            if SUBSCRIBERS_FILE.exists():
                with open(SUBSCRIBERS_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self.subscribers = set(data.get("subscribers", []))
                    logger.info(f"📱 [TelegramBot] Loaded {len(self.subscribers)} alert subscribers.")
        except Exception as e:
            logger.warning(f"[TelegramBot] Could not load subscribers file: {e}")

    def _save_subscribers(self):
        try:
            with open(SUBSCRIBERS_FILE, "w", encoding="utf-8") as f:
                json.dump({"subscribers": list(self.subscribers)}, f, indent=2)
        except Exception as e:
            logger.error(f"[TelegramBot] Could not save subscribers file: {e}")

    def add_subscriber(self, chat_id: int):
        if chat_id not in self.subscribers:
            self.subscribers.add(chat_id)
            self._save_subscribers()
            logger.info(f"✅ [TelegramBot] New subscriber registered: Chat ID {chat_id}")

    def remove_subscriber(self, chat_id: int):
        if chat_id in self.subscribers:
            self.subscribers.remove(chat_id)
            self._save_subscribers()
            logger.info(f"🗑️ [TelegramBot] Subscriber removed: Chat ID {chat_id}")

    async def start(self):
        """Start background polling for incoming Telegram messages."""
        if self.is_running:
            return
        self.is_running = True
        self.polling_task = asyncio.create_task(self._poll_loop())
        logger.info("🤖 [TelegramBot] Polling service started for @DeepGreen_TheBot.")

    async def stop(self):
        """Stop background polling service."""
        self.is_running = False
        if self.polling_task:
            self.polling_task.cancel()
            try:
                await self.polling_task
            except asyncio.CancelledError:
                pass
        logger.info("🛑 [TelegramBot] Polling service stopped.")

    async def _send_message(self, chat_id: int, text: str, parse_mode: str = "Markdown") -> bool:
        url = f"{TELEGRAM_API_BASE}/sendMessage"
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(url, json={
                    "chat_id": chat_id,
                    "text": text,
                    "parse_mode": parse_mode,
                    "disable_web_page_preview": True
                })
                return resp.status_code == 200
        except Exception as e:
            logger.error(f"[TelegramBot] Send message error to {chat_id}: {e}")
            return False

    async def _send_photo(self, chat_id: int, photo_path: str, caption: str) -> bool:
        url = f"{TELEGRAM_API_BASE}/sendPhoto"
        try:
            if not os.path.exists(photo_path):
                return False

            async with httpx.AsyncClient(timeout=25.0) as client:
                with open(photo_path, "rb") as f:
                    files = {"photo": (os.path.basename(photo_path), f, "image/jpeg")}
                    data = {"chat_id": chat_id, "caption": caption, "parse_mode": "Markdown"}
                    resp = await client.post(url, data=data, files=files)
                    return resp.status_code == 200
        except Exception as e:
            logger.error(f"[TelegramBot] Send photo error to {chat_id}: {e}")
            return False

    async def _send_audio(self, chat_id: int, audio_path: str, title: str) -> bool:
        url = f"{TELEGRAM_API_BASE}/sendAudio"
        try:
            if not os.path.exists(audio_path):
                return False

            async with httpx.AsyncClient(timeout=30.0) as client:
                with open(audio_path, "rb") as f:
                    files = {"audio": (os.path.basename(audio_path), f, "audio/wav")}
                    data = {"chat_id": chat_id, "title": title, "performer": "DeepGreen Sanctuary IoT"}
                    resp = await client.post(url, data=data, files=files)
                    return resp.status_code == 200
        except Exception as e:
            logger.error(f"[TelegramBot] Send audio error to {chat_id}: {e}")
            return False

    async def _handle_command(self, chat_id: int, text: str, user_first_name: str):
        cmd = text.strip().split()[0].lower() if text else ""

        if cmd in ("/start", "/help"):
            self.add_subscriber(chat_id)
            msg = (
                f"🌲 *Welcome to DeepGreen Autonomous Sanctuary Defense, {user_first_name}!* 🐾\n\n"
                f"You have been successfully registered for *instant real-time threat alerts*.\n\n"
                f"📡 *Available Commands:*\n"
                f"• `/status` — Sanctuary IoT fleet health & active nodes\n"
                f"• `/nodes` — List all deployed acoustic & optical sensor nodes\n"
                f"• `/recent` — Last 5 recorded threat incidents & AI diagnoses\n"
                f"• `/stop` — Unsubscribe from real-time security alerts\n"
                f"• `/help` — Display this command reference\n\n"
                f"⚡ *Autonomous Pipeline:* When an edge sensor registers seismic activity, "
                f"our Multi-Modal AI analyzes the acoustic signature and commands ESP32-CAM "
                f"to capture optical forensics, dispatched directly to this chat."
            )
            await self._send_message(chat_id, msg)

        elif cmd == "/stop":
            self.remove_subscriber(chat_id)
            await self._send_message(chat_id, "🔕 You have been unsubscribed from DeepGreen threat alerts. Send `/start` anytime to re-enable.")

        elif cmd == "/status":
            from database import get_pool
            try:
                pool = get_pool()
                async with pool.acquire() as conn:
                    total_nodes = await conn.fetchval("SELECT COUNT(*) FROM iot_nodes")
                    active_nodes = await conn.fetchval("SELECT COUNT(*) FROM iot_nodes WHERE status = 'ACTIVE'")
                    alert_nodes = await conn.fetchval("SELECT COUNT(*) FROM iot_nodes WHERE status = 'ALERT'")
                    recent_events = await conn.fetchval("SELECT COUNT(*) FROM iot_trigger_events WHERE triggered_at >= NOW() - INTERVAL '24 hours'")

                status_msg = (
                    f"📊 *DeepGreen Sanctuary Fleet Status*\n"
                    f"━━━━━━━━━━━━━━━━━━━━\n"
                    f"🛰️ *Total Monitored Nodes:* `{total_nodes}`\n"
                    f"✅ *Operational Active:* `{active_nodes}`\n"
                    f"🚨 *Nodes in ALERT:* `{alert_nodes}`\n"
                    f"⚠️ *24h Trigger Events:* `{recent_events}`\n"
                    f"📡 *Subscribed Rangers:* `{len(self.subscribers)}`\n"
                    f"━━━━━━━━━━━━━━━━━━━━\n"
                    f"🛡️ *System State:* Operational · AI Models Armed"
                )
                await self._send_message(chat_id, status_msg)
            except Exception as e:
                await self._send_message(chat_id, f"⚠️ Unable to query fleet status: {e}")

        elif cmd == "/nodes":
            from database import get_pool
            try:
                pool = get_pool()
                async with pool.acquire() as conn:
                    rows = await conn.fetch(
                        "SELECT node_id, name, device_uid, status, battery_level, com_port, camera_url FROM iot_nodes ORDER BY node_id ASC"
                    )

                if not rows:
                    await self._send_message(chat_id, "ℹ️ No IoT sensing nodes currently registered in the database.")
                    return

                lines = ["🌲 *Monitored Sensor Nodes:*", "━━━━━━━━━━━━━━━━━━━━"]
                for r in rows:
                    status_icon = "🟢" if r["status"] == "ACTIVE" else "🔴" if r["status"] == "ALERT" else "🟡"
                    lines.append(
                        f"{status_icon} *{r['name']}* (`{r['device_uid']}`)\n"
                        f"   Battery: `{r['battery_level']}%` | Port: `{r['com_port'] or 'Unbound'}`\n"
                        f"   Camera: `{'Configured' if r['camera_url'] else 'None'}`\n"
                    )
                await self._send_message(chat_id, "\n".join(lines))
            except Exception as e:
                await self._send_message(chat_id, f"⚠️ Error querying nodes: {e}")

        elif cmd == "/recent":
            from database import get_pool
            try:
                pool = get_pool()
                async with pool.acquire() as conn:
                    rows = await conn.fetch("""
                        SELECT e.event_id, e.trigger_type, e.severity, e.decibel_level, e.confidence, e.triggered_at, n.name as node_name
                        FROM iot_trigger_events e
                        LEFT JOIN iot_nodes n ON e.node_id = n.node_id
                        ORDER BY e.triggered_at DESC
                        LIMIT 5
                    """)

                if not rows:
                    await self._send_message(chat_id, "ℹ️ No recent trigger events recorded in the database.")
                    return

                lines = ["🚨 *Recent 5 Security Incidents:*", "━━━━━━━━━━━━━━━━━━━━"]
                for r in rows:
                    conf_pct = int(float(r['confidence'] or 0.8) * 100)
                    time_str = r['triggered_at'].strftime("%H:%M:%S · %d %b") if r['triggered_at'] else "Recent"
                    lines.append(
                        f"• *{r['trigger_type']}* [{r['severity']}]\n"
                        f"   Node: *{r['node_name'] or 'Node'}* | Conf: `{conf_pct}%` | SPL: `{r['decibel_level']} dB`\n"
                        f"   Time: `{time_str}`\n"
                    )
                await self._send_message(chat_id, "\n".join(lines))
            except Exception as e:
                await self._send_message(chat_id, f"⚠️ Error querying recent alerts: {e}")

        else:
            await self._send_message(chat_id, "❓ Unknown command. Send `/help` to see available bot commands.")

    async def _poll_loop(self):
        """Long polling loop for Telegram updates."""
        offset = 0
        async with httpx.AsyncClient(timeout=10.0) as client:
            while self.is_running:
                try:
                    url = f"{TELEGRAM_API_BASE}/getUpdates?offset={offset}&timeout=0"
                    resp = await client.get(url)
                    if resp.status_code == 200:
                        data = resp.json()
                        if data.get("ok"):
                            updates = data.get("result", [])
                            for upd in updates:
                                offset = upd["update_id"] + 1
                                msg = upd.get("message")
                                if msg and "text" in msg:
                                    chat_id = msg["chat"]["id"]
                                    text = msg["text"]
                                    user_first_name = msg.get("from", {}).get("first_name", "Ranger")
                                    # Always add user as subscriber on interaction
                                    self.add_subscriber(chat_id)
                                    await self._handle_command(chat_id, text, user_first_name)
                        await asyncio.sleep(2.0)
                    elif resp.status_code == 409:
                        logger.warning("[TelegramBot] getUpdates 409 Conflict. Backing off 5s...")
                        await asyncio.sleep(5.0)
                    else:
                        logger.warning(f"[TelegramBot] getUpdates returned status {resp.status_code}. Pausing 2s...")
                        await asyncio.sleep(2.0)
                except asyncio.CancelledError:
                    break
                except Exception as e:
                    logger.warning(f"[TelegramBot] Polling network note: {e}")
                    await asyncio.sleep(4.0)

    async def broadcast_threat_alert(
        self,
        node_name: str,
        device_uid: str,
        primary_threat: str,
        severity: str,
        decibel_level: float,
        confidence: float,
        details: str,
        audio_path: Optional[str] = None,
        image_path: Optional[str] = None,
        vision_reasoning: Optional[str] = None
    ):
        """
        Broadcast comprehensive multi-modal threat alert to all registered Telegram subscribers.
        Includes photo snapshot (with AI caption) and audio snippet.
        """
        if not self.subscribers:
            logger.info("ℹ️ [TelegramBot] No subscribers registered yet. Alert broadcast skipped.")
            return

        icon = "🚨" if severity == "ALERT" else "⚠️" if severity == "WARNING" else "ℹ️"
        conf_pct = int(confidence * 100) if confidence <= 1.0 else int(confidence)

        caption = (
            f"{icon} *DEEPGREEN SECURITY THREAT ALERT*\n"
            f"━━━━━━━━━━━━━━━━━━━━\n"
            f"📍 *Sensor Node:* `{node_name}` ({device_uid})\n"
            f"🎯 *Primary Threat:* `{primary_threat}`\n"
            f"⚡ *Severity:* *{severity}*\n"
            f"🔊 *Sound Level:* `{decibel_level:.1f} dB SPL`\n"
            f"🧠 *AI Confidence:* `{conf_pct}%`\n"
            f"━━━━━━━━━━━━━━━━━━━━\n"
            f"📝 *Forensic Analysis:*\n_{details}_\n"
        )

        if vision_reasoning:
            caption += f"\n👁️ *Visual Confirmation:*\n_{vision_reasoning}_\n"

        caption += f"\n🕒 *Timestamp:* `{asyncio.get_event_loop().time()}` (Live Sensor Telemetry)"

        logger.info(f"📢 [TelegramBot] Broadcasting alert to {len(self.subscribers)} chat subscribers...")

        for chat_id in list(self.subscribers):
            try:
                # 1. If camera image is available, send photo with formatted forensic caption
                if image_path and os.path.exists(image_path):
                    sent = await self._send_photo(chat_id, image_path, caption)
                    if not sent:
                        # Fallback to text message if photo send failed
                        await self._send_message(chat_id, caption)
                else:
                    # Send text alert
                    await self._send_message(chat_id, caption)

                # 2. If audio file is available and it's an ALERT, send audio snippet
                if audio_path and os.path.exists(audio_path) and severity in ("ALERT", "WARNING"):
                    await self._send_audio(chat_id, audio_path, f"Acoustic Capture - {primary_threat}")

            except Exception as err:
                logger.error(f"[TelegramBot] Failed sending alert to {chat_id}: {err}")

telegram_bot = TelegramAlertBot()
