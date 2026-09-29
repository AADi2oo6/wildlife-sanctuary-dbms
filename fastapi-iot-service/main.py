import uvicorn
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config import HOST, PORT, DEBUG
from database import init_db_pool, close_db_pool
from pathlib import Path
from fastapi.staticfiles import StaticFiles
from routers.telemetry import router as telemetry_router
from routers.nodes import router as nodes_router
from routers.hardware import router as hardware_router
from services.event_pipeline import init_event_pipeline
from routers.websocket_manager import manager

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(name)s - %(message)s"
)
logger = logging.getLogger("fastapi_iot.main")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: initialize database connection pool & hardware event pipeline
    logger.info("🌲 DeepGreen IoT Ingestion & Telemetry Service starting up...")
    try:
        await init_db_pool()
        init_event_pipeline()
        logger.info("📡 Ready to ingest IoT device telemetry and acoustic threat packets.")
    except Exception as e:
        logger.error(f"⚠️ Database initialization failed on startup: {e}")
    yield
    # Shutdown: cleanly close pool
    logger.info("Shutting down IoT Ingestion Service...")
    await close_db_pool()

app = FastAPI(
    title="DeepGreen IoT Ingestion & Telemetry Service",
    description="Asynchronous FastAPI microservice for ingesting acoustic edge-AI sensor telemetry, threat events, and real-time WebSocket broadcasting.",
    version="2.0.0",
    lifespan=lifespan
)

# Configure CORS for React dashboard and external devices
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount Static Uploads (audio & images)
uploads_dir = Path(__file__).resolve().parent / "uploads"
uploads_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(uploads_dir)), name="uploads")

# Mount Telemetry, Nodes & Hardware Routers
app.include_router(telemetry_router)
app.include_router(nodes_router)
app.include_router(hardware_router)

# WebSocket endpoint for real-time live telemetry streaming to web clients
@app.websocket("/ws/telemetry")
async def websocket_telemetry_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Keep connection alive; clients can also send heartbeat pings
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.warning(f"WebSocket client error: {e}")
        manager.disconnect(websocket)

@app.get("/")
async def root():
    return {
        "service": "DeepGreen IoT Ingestion & Telemetry Microservice",
        "phase": "Phase 2: FastAPI IoT Ingestion",
        "status": "online",
        "documentation": "/docs",
        "endpoints": {
            "ingest_telemetry": "POST /api/telemetry (or /api/iot/telemetry)",
            "live_websocket": "ws://localhost:8000/ws/telemetry",
            "nodes_list": "GET /api/nodes",
            "recent_alerts": "GET /api/alerts"
        }
    }

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "fastapi-iot-service"}

if __name__ == "__main__":
    uvicorn.run("main:app", host=HOST, port=PORT, reload=DEBUG)
