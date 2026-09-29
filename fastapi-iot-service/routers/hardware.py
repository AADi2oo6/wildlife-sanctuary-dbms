from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
import logging

from database import get_node_by_identifier, update_node_hardware_config
from services.serial_manager import serial_bridge
from services.camera_client import CameraClient

logger = logging.getLogger("fastapi_iot.hardware")
router = APIRouter(prefix="/api/hardware", tags=["Hardware Bridge & On-Demand Control"])

class ConnectPortRequest(BaseModel):
    port: Optional[str] = Field(None, description="Explicit COM / Serial port (e.g. 'COM3')")
    baud_rate: Optional[int] = Field(115200, description="Serial baud rate, default 115200")

class FlashToggleRequest(BaseModel):
    enable: bool = Field(..., description="True to turn flash ON, False to turn OFF")

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
    Command Device 2 (ESP32-CAM) to capture an immediate high-resolution snapshot right now.
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

    snapshot_result = await CameraClient.capture_snapshot(camera_url, node_id=node_id)
    if not snapshot_result or not snapshot_result.get("success"):
        raise HTTPException(
            status_code=502,
            detail=f"Failed to capture snapshot from ESP32-CAM at {camera_url}. Ensure device is powered and connected to Wi-Fi."
        )

    return {
        "status": "success",
        "message": "Snapshot photo captured successfully from ESP32-CAM.",
        "snapshot": snapshot_result
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
