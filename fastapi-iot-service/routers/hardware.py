from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
import logging
import json
from datetime import datetime, timezone

from database import (
    get_node_by_identifier,
    update_node_hardware_config,
    insert_trigger_event,
    update_node_status,
)
from services.serial_manager import serial_bridge
from services.camera_client import CameraClient
from services.ai_vision_agent import vision_ai_agent
from routers.websocket_manager import manager

logger = logging.getLogger("fastapi_iot.hardware")
router = APIRouter(prefix="/api/hardware", tags=["Hardware Bridge & On-Demand Control"])

class ConnectPortRequest(BaseModel):
    port: Optional[str] = Field(None, description="Explicit COM / Serial port (e.g. 'COM3')")
    baud_rate: Optional[int] = Field(115200, description="Serial baud rate, default 115200")

class FlashToggleRequest(BaseModel):
    enable: bool = Field(..., description="True to turn flash ON, False to turn OFF")

class NodeHardwareConfigUpdate(BaseModel):
    com_port: Optional[str] = Field(None, description="USB Serial COM Port (e.g. 'COM3' or 'COM5')")
    baud_rate: Optional[int] = Field(115200, description="Serial baud rate")
    camera_url: Optional[str] = Field(None, description="Snapshot endpoint (e.g. 'http://192.168.1.105/capture')")
    camera_stream_url: Optional[str] = Field(None, description="Live MJPEG stream endpoint (e.g. 'http://192.168.1.105:81/stream')")
    connect_serial: Optional[bool] = Field(False, description="Immediately connect serial listener if port specified")

@router.get("/com-ports")
async def get_available_com_ports():
    """
    List all physically connected USB / Serial COM ports detected on host system.
    """
    ports = serial_bridge.list_ports()
    return {
        "status": "success",
        "count": len(ports),
        "ports": ports
    }

@router.post("/nodes/{node_id}/connect")
async def connect_node_serial(node_id: int, payload: Optional[ConnectPortRequest] = None):
    """
    Connect FastAPI Serial Listener to Device 1 (ESP32) on the specified COM port.
    """
    node = await get_node_by_identifier(str(node_id))
    if not node:
        raise HTTPException(status_code=404, detail=f"IoT Node ID {node_id} not found.")

    target_port = payload.port if payload and payload.port else node.get("com_port")
    baud_rate = payload.baud_rate if payload and payload.baud_rate else node.get("baud_rate") or 115200

    if not target_port:
        raise HTTPException(
            status_code=400,
            detail="No COM port specified. Please provide a COM port (e.g. 'COM3') or configure it on the node."
        )

    success = serial_bridge.connect_node(node_id=node_id, port=target_port, baud_rate=baud_rate)
    if not success:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to open {target_port}. Ensure the device is connected and port is not occupied by Arduino Serial Monitor."
        )

    # Persist listening state
    await update_node_hardware_config(
        node_id=node_id,
        com_port=target_port,
        baud_rate=baud_rate,
        is_listening=True
    )

    return {
        "status": "success",
        "message": f"Successfully connected to Node #{node_id} on {target_port} at {baud_rate} baud.",
        "port": target_port,
        "is_listening": True
    }

@router.post("/nodes/{node_id}/disconnect")
async def disconnect_node_serial(node_id: int):
    """
    Safely stop serial listener and release the COM port.
    """
    node = await get_node_by_identifier(str(node_id))
    if not node:
        raise HTTPException(status_code=404, detail=f"IoT Node ID {node_id} not found.")

    serial_bridge.disconnect_node(node_id=node_id)
    await update_node_hardware_config(node_id=node_id, is_listening=False)

    return {
        "status": "success",
        "message": f"Disconnected serial bridge for Node #{node_id}.",
        "is_listening": False
    }

@router.get("/nodes/{node_id}/status")
async def get_node_hardware_status(node_id: int):
    """
    Check live connectivity status of Device 1 (Serial) and Device 2 (ESP32-CAM).
    """
    node = await get_node_by_identifier(str(node_id))
    if not node:
        raise HTTPException(status_code=404, detail=f"IoT Node ID {node_id} not found.")

    serial_status = serial_bridge.get_listener_status(node_id=node_id)
    camera_url = node.get("camera_url")

    camera_status = None
    if camera_url:
        camera_status = await CameraClient.check_status(camera_url)

    return {
        "status": "success",
        "node_id": node_id,
        "device_uid": node.get("device_uid"),
        "serial": serial_status,
        "camera": {
            "configured_url": camera_url,
            "stream_url": node.get("camera_stream_url"),
            "online": camera_status is not None,
            "details": camera_status
        }
    }

@router.get("/nodes/{node_id}/logs")
async def get_node_hardware_logs(node_id: int):
    """
    Retrieve real-time serial hardware log lines received from Device 1 on the COM port.
    """
    logs = serial_bridge.get_recent_logs(node_id)
    return {
        "status": "success",
        "node_id": node_id,
        "count": len(logs),
        "logs": logs
    }

@router.patch("/nodes/{node_id}/config")
async def update_node_hardware_configuration(node_id: int, payload: NodeHardwareConfigUpdate):
    """
    Update node COM port, baud rate, and camera URLs. Reconnects serial bridge if requested.
    """
    node = await get_node_by_identifier(str(node_id))
    if not node:
        raise HTTPException(status_code=404, detail=f"IoT Node ID {node_id} not found.")

    new_port = payload.com_port.strip() if payload.com_port else None
    new_baud = payload.baud_rate or 115200
    new_cam_url = payload.camera_url.strip() if payload.camera_url else None
    new_stream_url = payload.camera_stream_url.strip() if payload.camera_stream_url else None

    # Save to database
    await update_node_hardware_config(
        node_id=node_id,
        com_port=new_port,
        baud_rate=new_baud,
        camera_url=new_cam_url,
        camera_stream_url=new_stream_url,
        is_listening=payload.connect_serial if payload.connect_serial is not None else node.get("is_listening", False)
    )

    # Manage serial connection
    serial_connected = False
    if payload.connect_serial and new_port:
        serial_connected = serial_bridge.connect_node(node_id, new_port, new_baud)
    elif payload.com_port and serial_bridge.is_listening(node_id):
        # Port changed while listening, reconnect to new port
        serial_connected = serial_bridge.connect_node(node_id, new_port, new_baud)

    return {
        "status": "success",
        "message": f"Hardware configuration updated for Node #{node_id}.",
        "com_port": new_port,
        "baud_rate": new_baud,
        "camera_url": new_cam_url,
        "camera_stream_url": new_stream_url,
        "is_listening": serial_connected or serial_bridge.is_listening(node_id)
    }

@router.post("/nodes/{node_id}/manual-audio")
async def trigger_manual_audio_record(node_id: int):
    """
    Transmit 'CMD:RECORD_5S' command over USB to instruct ESP32 to record 5s audio right now.
    """
    node = await get_node_by_identifier(str(node_id))
    if not node:
        raise HTTPException(status_code=404, detail=f"IoT Node ID {node_id} not found.")

    if not serial_bridge.is_listening(node_id):
        # Attempt auto-connect if com_port configured
        com_port = node.get("com_port")
        if com_port:
            connected = serial_bridge.connect_node(node_id, com_port, node.get("baud_rate") or 115200)
            if not connected:
                raise HTTPException(
                    status_code=400,
                    detail=f"Node is not connected to {com_port}. Please connect the serial port first."
                )
        else:
            raise HTTPException(
                status_code=400,
                detail="Node has no COM port configured and serial bridge is not connected."
            )

    success = serial_bridge.trigger_manual_audio(node_id)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to transmit record command over serial.")

    return {
        "status": "success",
        "message": f"Manual 5-second audio acquisition command transmitted to Node #{node_id}. Audio stream incoming over USB..."
    }

@router.post("/nodes/{node_id}/manual-snapshot")
async def trigger_manual_camera_snapshot(node_id: int):
    """
    Command Device 2 (ESP32-CAM) to capture an immediate high-resolution snapshot right now,
    run the Vision AI Agent, save the event to Supabase, and broadcast over WebSocket.
    """
    node = await get_node_by_identifier(str(node_id))
    if not node:
        raise HTTPException(status_code=404, detail=f"IoT Node ID {node_id} not found.")

    camera_url = node.get("camera_url")
    if not camera_url:
        raise HTTPException(
            status_code=400,
            detail="Node has no camera_url configured (e.g. 'http://192.168.1.105/capture')."
        )

    # 1. Capture snapshot from ESP32-CAM
    snapshot_result = await CameraClient.capture_snapshot(camera_url, node_id=node_id)
    if not snapshot_result or not snapshot_result.get("success"):
        raise HTTPException(
            status_code=502,
            detail=f"Failed to capture snapshot from ESP32-CAM at {camera_url}. Ensure device is powered and connected to Wi-Fi."
        )

    # 2. Run Vision AI Agent on captured snapshot
    snapshot_path = snapshot_result.get("file_path")
    relative_url = snapshot_result.get("relative_url")

    logger.info(f"👁️ [ManualSnapshot] Running Vision AI Agent on {snapshot_path}...")
    vision_diag = await vision_ai_agent.analyze_image(
        snapshot_path,
        context=f"Operator requested forensic manual snapshot from Node #{node_id} ({node.get('name')})"
    )

    is_threat = vision_diag.get("visual_threat", False)
    vision_score = float(vision_diag.get("vision_score", 0.0)) / 100.0 if vision_diag.get("vision_score") else 0.0
    severity = "ALERT" if is_threat or vision_score >= 0.7 else "INFO"
    threat_type = vision_diag.get("threat_type", "OPTICAL_INSPECTION")

    # 3. Persist compound event in Supabase
    created_event = await insert_trigger_event(
        node_id=node_id,
        trigger_type=f"MANUAL_SNAPSHOT_{threat_type}",
        severity=severity,
        decibel_level=None,
        confidence=1.0,
        details=f"Manual Snapshot captured by operator. Vision AI: {vision_diag.get('reasoning', 'Optical inspection complete.')}",
        audio_sample_url=None,
        image_snapshot_url=relative_url,
        audio_ai_analysis=None,
        vision_ai_analysis=json.dumps(vision_diag),
        vision_score=vision_score,
        is_manual=True
    )
    event_id = created_event.get("event_id")

    # Update Node status if threat detected
    if severity == "ALERT":
        await update_node_status(node_id=node_id, status="ALERT")

    # 4. Broadcast over WebSocket to update map and node history immediately
    broadcast_data = {
        "event": "telemetry_update",
        "node_id": node_id,
        "device_uid": node.get("device_uid"),
        "node_name": node.get("name"),
        "node_status": "ALERT" if severity == "ALERT" else node.get("status", "ACTIVE"),
        "battery_level": node.get("battery_level", 95),
        "sound_level_db": None,
        "threat_type": f"MANUAL_SNAPSHOT_{threat_type}",
        "severity": severity,
        "is_anomaly": (severity == "ALERT"),
        "trigger_event_id": event_id,
        "confidence": 1.0,
        "audio_sample_url": None,
        "image_snapshot_url": relative_url,
        "audio_ai_analysis": None,
        "vision_ai_analysis": vision_diag,
        "vision_score": vision_score,
        "is_manual": True,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    await manager.broadcast(broadcast_data)

    # Broadcast to Telegram subscribers
    try:
        from services.telegram_bot import telegram_bot
        asyncio.create_task(
            telegram_bot.broadcast_threat_alert(
                node_name=node.get("name", f"Node #{node_id}"),
                device_uid=node.get("device_uid", "DGN-NODE-67SF-608"),
                primary_threat=f"OPTICAL_{vision_diag.get('threat_type', 'SNAPSHOT')}",
                severity=severity,
                decibel_level=42.0,
                confidence=vision_score if vision_score else 0.90,
                details=f"Camera Snapshot captured. {vision_diag.get('reasoning', '')}",
                image_path=snapshot_path,
                vision_reasoning=vision_diag.get("reasoning")
            )
        )
    except Exception as tg_err:
        logger.warning(f"Telegram dispatch note: {tg_err}")

    logger.info(f"✅ [ManualSnapshot] Created Event #{event_id} and broadcasted successfully.")

    return {
        "status": "success",
        "message": "Snapshot photo captured and analyzed by Vision AI successfully.",
        "event_id": event_id,
        "snapshot": snapshot_result,
        "vision_ai": vision_diag,
        "severity": severity
    }

@router.post("/nodes/{node_id}/flash")
async def toggle_camera_flashlight(node_id: int, payload: FlashToggleRequest):
    """
    Toggle the onboard flash LED on the ESP32-CAM (GPIO 4).
    """
    node = await get_node_by_identifier(str(node_id))
    if not node:
        raise HTTPException(status_code=404, detail=f"IoT Node ID {node_id} not found.")

    camera_url = node.get("camera_url")
    if not camera_url:
        raise HTTPException(status_code=400, detail="No camera_url configured for node.")

    success = await CameraClient.toggle_flash(camera_url, enable=payload.enable)
    return {
        "status": "success" if success else "warning",
        "flash": payload.enable,
        "message": f"Flashlight {'activated' if payload.enable else 'deactivated'} on camera."
    }

@router.post("/telegram/test-alert")
async def trigger_telegram_test_alert():
    """
    Send a test threat alert to all registered Telegram subscribers of @DeepGreen_TheBot.
    """
    from services.telegram_bot import telegram_bot
    if not telegram_bot.subscribers:
        return {
            "status": "warning",
            "message": "No subscribers registered yet. Please open https://t.me/DeepGreen_TheBot and send /start first!",
            "subscribers_count": 0
        }

    await telegram_bot.broadcast_threat_alert(
        node_name="Collage Garden Sensor 01",
        device_uid="DGN-NODE-67SF-608",
        primary_threat="CHAINSAW_INTRUSION",
        severity="ALERT",
        decibel_level=86.4,
        confidence=0.92,
        details="Acoustic analysis classified two-stroke internal combustion engine signature consistent with illegal timber logging.",
        vision_reasoning="Optical frame analyzed: Perimeter breach confirmed in restricted zone."
    )
    return {
        "status": "success",
        "message": f"Test alert dispatched to {len(telegram_bot.subscribers)} Telegram subscribers.",
        "subscribers_count": len(telegram_bot.subscribers)
    }

