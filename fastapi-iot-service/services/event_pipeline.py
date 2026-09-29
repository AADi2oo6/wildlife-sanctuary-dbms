import logging
import asyncio
from datetime import datetime, timezone
from typing import Dict, Any

from database import (
    get_node_by_identifier,
    update_node_status,
    insert_trigger_event,
)
from routers.websocket_manager import manager
from services.serial_manager import serial_bridge
from services.camera_client import CameraClient

logger = logging.getLogger("fastapi_iot.event_pipeline")

async def process_incoming_audio_event(payload: Dict[str, Any]):
    """
    Main processing pipeline invoked whenever Device 1 completes streaming 
    a 5-second audio WAV file (from vibration strike or on-demand manual trigger).
    """
    node_id = payload.get("node_id")
    device_uid = payload.get("device_uid")
    audio_sample_url = payload.get("audio_sample_url")
    audio_file_path = payload.get("audio_file_path")
    trigger_source = payload.get("trigger_source", "VIBRATION_INTERRUPT")
    is_manual = (trigger_source == "OPERATOR_MANUAL_COMMAND")

    logger.info(
        f"⚡ [EventPipeline] Processing 5s audio packet from Node #{node_id} ({device_uid}) | "
        f"Trigger: {trigger_source} | File: {audio_sample_url}"
    )

    node = await get_node_by_identifier(str(node_id))
    if not node:
        logger.error(f"[EventPipeline] Node #{node_id} not found in database.")
        return

    node_name = node.get("name", "Sensor Node")

    # 1. Log preliminary trigger event in Supabase
    created_event = await insert_trigger_event(
        node_id=node_id,
        trigger_type="ACOUSTIC_DISTURBANCE" if not is_manual else "MANUAL_AUDIO_CAPTURE",
        severity="ALERT" if not is_manual else "INFO",
        decibel_level=86.5, # Estimated baseline; AI agent will calculate precise dB in Phase 4
        confidence=0.88,
        details=f"5-second acoustic acquisition via {trigger_source}. Audio stream assembled.",
        audio_sample_url=audio_sample_url,
        is_manual=is_manual
    )
    event_id = created_event.get("event_id")

    # 2. Update Node Status & Ping
    new_status = "ALERT" if not is_manual else node.get("status")
    await update_node_status(node_id=node_id, status=new_status)

    # 3. Broadcast real-time update to web clients (Admin map & memory modal)
    broadcast_data = {
        "event": "telemetry_update",
        "node_id": node_id,
        "device_uid": device_uid,
        "node_name": node_name,
        "node_status": new_status,
        "battery_level": node.get("battery_level", 95),
        "sound_level_db": 86.5,
        "threat_type": "AcousticDisturbance" if not is_manual else "ManualAudio",
        "severity": "ALERT" if not is_manual else "INFO",
        "is_anomaly": not is_manual,
        "trigger_event_id": event_id,
        "audio_sample_url": audio_sample_url,
        "image_snapshot_url": None,
        "is_manual": is_manual,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    await manager.broadcast(broadcast_data)
    logger.info(f"📡 [EventPipeline] Broadcasted audio alert for Node #{node_id} (Event #{event_id}) over WebSocket.")

def init_event_pipeline():
    """
    Hook the event pipeline into the Serial Bridge Manager.
    """
    serial_bridge.register_audio_callback(process_incoming_audio_event)
    logger.info("🔗 [EventPipeline] Registered audio callback with SerialBridgeManager.")
