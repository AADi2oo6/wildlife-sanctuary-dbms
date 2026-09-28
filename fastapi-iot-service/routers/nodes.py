from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, Any, Optional, List
import logging

from models import NodeHardwareConfig
from database import (
    get_node_by_identifier,
    update_node_hardware_config,
    get_node_triggers,
    get_pool
)

logger = logging.getLogger("fastapi_iot.nodes")
router = APIRouter(prefix="/api/nodes", tags=["IoT Nodes Hardware Configuration"])

@router.get("/{node_id}")
async def get_node_details(node_id: str):
    """
    Fetch comprehensive node details, status, and hardware configuration.
    Accepts integer ID (e.g. 5) or Device UID (e.g. 'DGN-NODE-67SF-608').
    """
    node = await get_node_by_identifier(node_id)
    if not node:
        raise HTTPException(status_code=404, detail=f"IoT Node '{node_id}' not found.")
    return {"status": "success", "node": node}

@router.put("/{node_id}/hardware")
@router.patch("/{node_id}/hardware")
async def configure_node_hardware(node_id: int, config: NodeHardwareConfig):
    """
    Configure and update edge hardware settings:
    - COM / Serial Port (e.g. 'COM3', '/dev/ttyUSB0')
    - Serial Baud Rate (default 115200)
    - ESP32-CAM Snapshot Capture URL (e.g. 'http://192.168.1.105/capture')
    - ESP32-CAM Live Video Stream URL (e.g. 'http://192.168.1.105:81/stream')
    - Serial Listening State
    """
    node = await get_node_by_identifier(str(node_id))
    if not node:
        raise HTTPException(status_code=404, detail=f"IoT Node ID {node_id} not found.")

    updated = await update_node_hardware_config(
        node_id=node_id,
        com_port=config.com_port,
        baud_rate=config.baud_rate,
        camera_url=config.camera_url,
        camera_stream_url=config.camera_stream_url,
        is_listening=config.is_listening
    )

    logger.info(f"⚙️ Node #{node_id} ({node['device_uid']}) hardware config updated: COM={config.com_port}, Cam={config.camera_url}")

    return {
        "status": "success",
        "message": "Node hardware configuration saved successfully.",
        "hardware_config": updated
    }

@router.get("/{node_id}/triggers")
async def get_node_trigger_history(node_id: int, limit: int = 100):
    """
    Fetch chronological trigger events for a node with multi-modal AI data,
    audio WAV snippets, and camera snapshot URLs.
    """
    node = await get_node_by_identifier(str(node_id))
    if not node:
        raise HTTPException(status_code=404, detail=f"IoT Node ID {node_id} not found.")

    triggers = await get_node_triggers(node_id=node_id, limit=limit)
    return {
        "status": "success",
        "node_id": node_id,
        "count": len(triggers),
        "triggers": triggers
    }
