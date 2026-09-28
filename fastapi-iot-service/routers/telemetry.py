from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timezone
import logging
from typing import List, Dict, Any, Optional

from models import TelemetryPayload, TelemetryResponse
from database import (
    get_node_by_identifier,
    update_node_status,
    insert_trigger_event,
    get_recent_alerts,
    get_node_triggers,
    get_pool
)
from routers.websocket_manager import manager
from config import ALERT_DECIBEL_THRESHOLD, ALERT_CONFIDENCE_THRESHOLD, DEFAULT_NODE_UID

logger = logging.getLogger("fastapi_iot.telemetry")
router = APIRouter(prefix="/api", tags=["Telemetry & IoT Ingestion"])

@router.post("/telemetry", response_model=TelemetryResponse)
@router.post("/iot/telemetry", response_model=TelemetryResponse)
async def ingest_telemetry(payload: TelemetryPayload):
    """
    Core Telemetry Ingestion Endpoint.
    Receives acoustic, environmental, and threat telemetry from physical ESP32 or simulated nodes.
    Defaults to the deployed 'Collage Garden' node (DGN-NODE-67SF-608) if no identifier is specified.
    """
    # 1. Resolve Node Identifier
    identifier = payload.device_uid or str(payload.node_id) if payload.node_id is not None else DEFAULT_NODE_UID
    node = await get_node_by_identifier(identifier)
    
    if not node:
        logger.warning(f"Unknown node identifier received: {identifier}")
        raise HTTPException(
            status_code=404, 
            detail=f"IoT Node '{identifier}' not found in database. Please register the node first."
        )

    node_id = node["node_id"]
    device_uid = node["device_uid"]
    node_name = node["name"]
    current_status = node["status"]

    # 2. Evaluate Anomaly / Threat Condition
    threat = payload.threat_type
    decibel = payload.sound_level_db
    confidence = payload.confidence_score
    battery = payload.battery_level

    # Derive Decibel if missing but threat is present
    if decibel is None and threat:
        if threat.lower() == "gunshot":
            decibel = 114.5
        elif threat.lower() == "chainsaw":
            decibel = 88.0
        elif threat.lower() == "vehicle":
            decibel = 76.5
        elif threat.lower() == "fire":
            decibel = 65.0
        else:
            decibel = 70.0

    # Derive Confidence if missing but threat is present
    if confidence is None and threat:
        confidence = 0.92

    is_anomaly = False
    severity = "INFO"
    trigger_event_id = None

    if threat or (decibel is not None and decibel >= ALERT_DECIBEL_THRESHOLD):
        is_anomaly = True
        
        # Determine Severity Level
        if threat and threat.lower() in ("chainsaw", "gunshot", "fire"):
            severity = "ALERT"
        elif decibel is not None and decibel >= 85.0:
            severity = "ALERT"
        elif threat and threat.lower() in ("vehicle", "pir motion", "intrusion"):
            severity = "WARNING"
        elif decibel is not None and decibel >= 70.0:
            severity = "WARNING"

        trigger_type_str = (threat.upper() if threat else "ACOUSTIC_DISTURBANCE").replace(" ", "_")
        details_str = payload.notes or f"Threat detected by edge sensor model: {threat or 'High acoustic spike'}"

        # Insert record into iot_trigger_events
        created_event = await insert_trigger_event(
            node_id=node_id,
            trigger_type=trigger_type_str,
            severity=severity,
            decibel_level=decibel,
            confidence=confidence,
            details=details_str,
            audio_sample_url=payload.audio_sample_url
        )
        trigger_event_id = created_event.get("event_id")

    # 3. Update Node Status & Heartbeat
    new_node_status = "ALERT" if severity == "ALERT" else current_status
    await update_node_status(
        node_id=node_id,
        status=new_node_status if new_node_status != current_status else None,
        battery_level=battery,
        lat=payload.latitude,
        lng=payload.longitude
    )

    # 4. Broadcast live update to all WebSocket clients (e.g. Admin Dashboard)
    broadcast_data = {
        "event": "telemetry_update",
        "node_id": node_id,
        "device_uid": device_uid,
        "node_name": node_name,
        "node_status": new_node_status,
        "battery_level": battery or node["battery_level"],
        "sound_level_db": decibel,
        "threat_type": threat,
        "severity": severity,
        "is_anomaly": is_anomaly,
        "trigger_event_id": trigger_event_id,
        "confidence": confidence,
        "temperature": payload.temperature,
        "humidity": payload.humidity,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    await manager.broadcast(broadcast_data)

    logger.info(
        f"📡 Ingested telemetry from '{node_name}' ({device_uid}) | Threat: {threat or 'None'} | "
        f"dB: {decibel} | Anomaly: {is_anomaly} | Status: {new_node_status}"
    )

    return TelemetryResponse(
        status="success",
        message="Telemetry processed successfully",
        node_id=node_id,
        device_uid=device_uid,
        node_name=node_name,
        node_status=new_node_status,
        is_anomaly=is_anomaly,
        trigger_event_id=trigger_event_id,
        decibel_level=decibel,
        confidence=confidence,
        processed_at=datetime.now(timezone.utc)
    )

@router.get("/nodes")
async def get_all_nodes():
    """Returns all deployed IoT nodes directly from PostgreSQL."""
    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT node_id, device_uid, name, latitude, longitude, status, 
                   battery_level, sensor_type, last_ping, notes
            FROM iot_nodes
            ORDER BY node_id ASC
            """
        )
        return [dict(r) for r in rows]

@router.get("/nodes/{identifier}/history")
async def get_node_history(identifier: str, limit: int = 100):
    """Returns chronological trigger memory for a specific node."""
    node = await get_node_by_identifier(identifier)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    
    triggers = await get_node_triggers(node["node_id"], limit=limit)
    return {
        "node": node,
        "total_triggers": len(triggers),
        "triggers": triggers
    }

@router.get("/alerts")
async def get_alerts(limit: int = 50):
    """Returns recent anomaly/threat alerts across all deployed IoT nodes."""
    alerts = await get_recent_alerts(limit=limit)
    return {"count": len(alerts), "alerts": alerts}

@router.post("/nodes/{identifier}/reset")
async def reset_node_alert(identifier: str):
    """Admin endpoint to clear an alert on a node and set status back to ACTIVE."""
    node = await get_node_by_identifier(identifier)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    
    await update_node_status(node["node_id"], status="ACTIVE")
    
    # Broadcast reset
    await manager.broadcast({
        "event": "node_status_reset",
        "node_id": node["node_id"],
        "device_uid": node["device_uid"],
        "status": "ACTIVE",
        "timestamp": datetime.now(timezone.utc).isoformat()
    })

    return {"status": "success", "message": f"Node '{node['name']}' status reset to ACTIVE"}
