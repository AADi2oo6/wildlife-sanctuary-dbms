from pydantic import BaseModel, Field
from typing import Optional, Union, List, Any
from datetime import datetime

class TelemetryPayload(BaseModel):
    """
    Ingestion payload sent from edge devices (ESP32, Raspberry Pi, Arduino)
    Compatible with DeepGreen client protocol and enhanced environmental sensors.
    """
    node_id: Optional[Union[str, int]] = Field(
        None, 
        description="Node identifier: can be integer ID (e.g. 5) or Device UID (e.g. 'DGN-NODE-67SF-608')"
    )
    device_uid: Optional[str] = Field(
        None,
        description="Explicit Device UID string"
    )
    threat_type: Optional[str] = Field(
        None,
        description="Classified acoustic/environmental threat: 'Chainsaw', 'Gunshot', 'Vehicle', 'Fire', 'PIR Motion', 'Animal'"
    )
    confidence_score: Optional[float] = Field(
        None,
        ge=0.0,
        le=1.0,
        description="Classification model confidence score between 0.0 and 1.0"
    )
    sound_level_db: Optional[float] = Field(
        None,
        ge=0.0,
        le=160.0,
        description="Acoustic decibel sound pressure reading (dB)"
    )
    battery_level: Optional[int] = Field(
        None,
        ge=0,
        le=100,
        description="Battery percentage remaining (0-100)"
    )
    temperature: Optional[float] = Field(
        None,
        description="Ambient temperature in Celsius"
    )
    humidity: Optional[float] = Field(
        None,
        ge=0.0,
        le=100.0,
        description="Relative ambient humidity percentage"
    )
    latitude: Optional[float] = Field(
        None,
        ge=-90.0,
        le=90.0,
        description="GPS Latitude if mobile/re-located"
    )
    longitude: Optional[float] = Field(
        None,
        ge=-180.0,
        le=180.0,
        description="GPS Longitude if mobile/re-located"
    )
    notes: Optional[str] = Field(
        None,
        description="Edge diagnostics or supplementary telemetry details"
    )
    audio_sample_url: Optional[str] = Field(
        None,
        description="URL or path to captured raw audio snippet for AI analysis"
    )
    image_snapshot_url: Optional[str] = Field(
        None,
        description="URL or path to captured optical camera snapshot"
    )
    audio_ai_analysis: Optional[Any] = Field(
        None,
        description="Audio AI diagnostic output (threat type, confidence, reasoning)"
    )
    vision_ai_analysis: Optional[Any] = Field(
        None,
        description="Vision AI diagnostic output (detected objects, vision threat score, reasoning)"
    )
    vision_score: Optional[float] = Field(
        None,
        ge=0.0,
        le=1.0,
        description="Vision classification score between 0.0 and 1.0"
    )
    is_manual: Optional[bool] = Field(
        False,
        description="Whether this trigger was requested manually by operator"
    )

class NodeHardwareConfig(BaseModel):
    com_port: Optional[str] = Field(None, description="Host COM port (e.g. 'COM3', '/dev/ttyUSB0')")
    baud_rate: Optional[int] = Field(115200, description="Serial baud rate, default 115200")
    camera_url: Optional[str] = Field(None, description="ESP32-CAM Snapshot Capture URL (e.g. 'http://192.168.1.105/capture')")
    camera_stream_url: Optional[str] = Field(None, description="ESP32-CAM Live Video Stream URL (e.g. 'http://192.168.1.105:81/stream')")
    is_listening: Optional[bool] = Field(False, description="Whether serial bridge is actively listening")

class TelemetryResponse(BaseModel):
    status: str
    message: str
    node_id: int
    device_uid: str
    node_name: str
    node_status: str
    is_anomaly: bool
    trigger_event_id: Optional[int] = None
    decibel_level: Optional[float] = None
    confidence: Optional[float] = None
    processed_at: datetime

class AlertWorkflowUpdate(BaseModel):
    workflow_status: str = Field(..., description="Status: 'investigating', 'resolved', 'false_alarm', 'escalated'")

class AlertActionPayload(BaseModel):
    action_type: str = Field(..., description="Action: 'Dispatch Ranger', 'Mark False Alarm', 'Escalate'")
    notes: Optional[str] = None
