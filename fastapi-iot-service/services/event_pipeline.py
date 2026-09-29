import logging
import asyncio
import json
from datetime import datetime, timezone
from typing import Dict, Any, Optional

from database import (
    get_node_by_identifier,
    update_node_status,
    insert_trigger_event,
)
from routers.websocket_manager import manager
from services.serial_manager import serial_bridge
from services.camera_client import CameraClient
from services.ai_audio_agent import audio_ai_agent
from services.ai_vision_agent import vision_ai_agent

logger = logging.getLogger("fastapi_iot.event_pipeline")

async def process_incoming_audio_event(payload: Dict[str, Any]):
    """
    Core Multi-Tier Multi-Modal Autonomous Processing Pipeline:
    1. Tier 1 (Seismic/Vibration): Audio WAV streamed from Device 1 is received.
    2. Tier 2 (Acoustic AI Agent): Evaluates audio with Whisper + GPT-4o-mini.
    3. Escalation Gate: If threat confidence >= 80%, triggers Device 2 (ESP32-CAM) snapshot.
    4. Tier 3 (Vision AI Agent): Inspects optical snapshot with GPT-4o-mini Vision.
    5. Persistence: Inserts compound multi-modal record into Supabase.
    6. Broadcast: Pushes real-time alert with audio/visual forensic data to Web Dashboard.
    """
    node_id = payload.get("node_id")
    device_uid = payload.get("device_uid")
    audio_sample_url = payload.get("audio_sample_url") or payload.get("relative_url")
    audio_file_path = payload.get("audio_file_path") or payload.get("file_path")
    trigger_source = payload.get("trigger_source", "VIBRATION_INTERRUPT")
    is_manual = (trigger_source == "OPERATOR_MANUAL_COMMAND")

    logger.info(
        f"\n========================================================"
        f"\n⚡ [Pipeline] INCOMING ACOUSTIC PACKET | Node #{node_id} ({device_uid})"
        f"\n   Source: {trigger_source} | File: {audio_sample_url}"
        f"\n========================================================"
    )

    node = await get_node_by_identifier(str(node_id))
    if not node:
        logger.error(f"[Pipeline] Node #{node_id} not found in database.")
        return

    node_name = node.get("name", f"Node #{node_id}")
    camera_url = node.get("camera_url")

    # ── TIER 2: ACOUSTIC AI AGENT ANALYSIS ─────────────────────────────────
    logger.info(f"🧠 [Tier 2] Invoking Acoustic AI Agent on: {audio_file_path}...")
    audio_diag = await audio_ai_agent.analyze_audio(audio_file_path, trigger_source)

    threat_detected = audio_diag.get("threat_detected", False)
    acoustic_threat_type = audio_diag.get("threat_type", "ACOUSTIC_DISTURBANCE")
    acoustic_conf = float(audio_diag.get("confidence_score", 75.0))
    measured_db = float(audio_diag.get("decibel_level", 75.0))
    audio_reasoning = audio_diag.get("reasoning", "")
    escalate_to_camera = audio_diag.get("escalate_camera", False)

    logger.info(
        f"📊 [Tier 2 Complete] Threat={acoustic_threat_type} | "
        f"Conf={acoustic_conf}% | dB={measured_db} | Escalate={escalate_to_camera}"
    )

    # ── TIER 3: OPTICAL CAMERA TRIGGER & VISION AI AGENT ───────────────────
    snapshot_result: Optional[Dict[str, Any]] = None
    vision_diag: Optional[Dict[str, Any]] = None
    image_snapshot_url: Optional[str] = None
    vision_score: Optional[float] = None

    if escalate_to_camera or is_manual:
        if camera_url:
            logger.info(f"📷 [Tier 3 Escalation Gate Passed] Triggering optical camera snapshot at {camera_url}...")
            snapshot_result = await CameraClient.capture_snapshot(camera_url, node_id=node_id)

            if snapshot_result and snapshot_result.get("success"):
                image_snapshot_url = snapshot_result.get("relative_url")
                image_file_path = snapshot_result.get("file_path")

                logger.info(f"👁️ [Tier 3 Vision Agent] Submitting frame {image_file_path} to GPT-4o-mini Vision...")
                context_str = f"Acoustic AI detected {acoustic_threat_type} ({acoustic_conf}% confidence) at {measured_db} dB SPL."
                vision_diag = await vision_ai_agent.analyze_image(image_file_path, context=context_str)
                vision_score = vision_diag.get("vision_score", 0.0) / 100.0
            else:
                logger.warning(f"⚠️ [Tier 3] Camera snapshot could not be retrieved from {camera_url}.")
        else:
            logger.info(f"ℹ️ [Tier 3] No camera_url configured on Node #{node_id}. Skipping optical acquisition.")

    # ── SYNTHESIZE COMPOUND THREAT SEVERITY ─────────────────────────────────
    visual_threat = vision_diag.get("visual_threat", False) if vision_diag else False
    vision_threat_type = vision_diag.get("threat_type", "NONE") if vision_diag else "NONE"

    severity = "INFO"
    primary_threat_type = acoustic_threat_type

    if threat_detected and visual_threat:
        severity = "ALERT"
        primary_threat_type = f"{acoustic_threat_type} + {vision_threat_type}"
    elif threat_detected:
        severity = "ALERT" if acoustic_conf >= 80.0 else "WARNING"
    elif visual_threat:
        severity = "ALERT"
        primary_threat_type = vision_threat_type

    # Format forensic details summary
    details_parts = [
        f"Acoustic: {acoustic_threat_type} ({acoustic_conf:.1f}% conf, {measured_db} dB). {audio_reasoning}"
    ]
    if vision_diag and vision_diag.get("reasoning"):
        details_parts.append(f"Vision: {vision_diag.get('reasoning')}")
        if vision_diag.get("detected_objects"):
            details_parts.append(f"Objects detected: {', '.join(vision_diag.get('detected_objects'))}")

    combined_details = " | ".join(details_parts)

    # ── PERSIST IN SUPABASE ────────────────────────────────────────────────
    audio_ai_json = json.dumps(audio_diag) if audio_diag else None
    vision_ai_json = json.dumps(vision_diag) if vision_diag else None

    created_event = await insert_trigger_event(
        node_id=node_id,
        trigger_type=primary_threat_type,
        severity=severity,
        decibel_level=measured_db,
        confidence=acoustic_conf / 100.0,
        details=combined_details,
        audio_sample_url=audio_sample_url,
        image_snapshot_url=image_snapshot_url,
        audio_ai_analysis=audio_ai_json,
        vision_ai_analysis=vision_ai_json,
        vision_score=vision_score,
        is_manual=is_manual
    )
    event_id = created_event.get("event_id")

    # Update Node status if Alert
    new_node_status = "ALERT" if severity == "ALERT" else node.get("status", "ACTIVE")
    await update_node_status(node_id=node_id, status=new_node_status)

    # ── WEBSOCKET BROADCAST TO ADMIN DASHBOARD ─────────────────────────────
    broadcast_data = {
        "event": "telemetry_update",
        "node_id": node_id,
        "device_uid": device_uid,
        "node_name": node_name,
        "node_status": new_node_status,
        "battery_level": node.get("battery_level", 95),
        "sound_level_db": measured_db,
        "threat_type": primary_threat_type,
        "severity": severity,
        "is_anomaly": (severity in ("ALERT", "WARNING")),
        "trigger_event_id": event_id,
        "confidence": acoustic_conf / 100.0,
        "audio_sample_url": audio_sample_url,
        "image_snapshot_url": image_snapshot_url,
        "audio_ai_analysis": audio_diag,
        "vision_ai_analysis": vision_diag,
        "vision_score": vision_score,
        "is_manual": is_manual,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    await manager.broadcast(broadcast_data)

    logger.info(
        f"🚀 [Pipeline Finished] Event #{event_id} stored & broadcasted! "
        f"Severity={severity} | PrimaryThreat={primary_threat_type}"
    )

def init_event_pipeline():
    """
    Hook the complete event pipeline into the Serial Bridge Manager.
    """
    try:
        loop = asyncio.get_running_loop()
        serial_bridge.set_event_loop(loop)
        logger.info("🔗 [EventPipeline] Captured main event loop for serial dispatcher.")
    except Exception as e:
        logger.warning(f"Could not get running loop on init: {e}")
    serial_bridge.register_audio_callback(process_incoming_audio_event)
    logger.info("🔗 [EventPipeline] Registered full Multi-Modal AI pipeline callback with SerialBridgeManager.")
