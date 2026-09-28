import asyncpg
import logging
from urllib.parse import urlparse, unquote
from typing import Optional, Dict, Any, List
from config import DATABASE_URL

logger = logging.getLogger("fastapi_iot.database")

_pool: Optional[asyncpg.Pool] = None

async def init_db_pool() -> asyncpg.Pool:
    global _pool
    if not DATABASE_URL:
        raise ValueError("DATABASE_URL is not configured. Check backend/.env or local .env.")

    parsed = urlparse(DATABASE_URL)
    user = parsed.username
    password = unquote(parsed.password) if parsed.password else None
    host = parsed.hostname
    port = parsed.port or 5432
    database = parsed.path.lstrip("/")

    # Enable SSL for Supabase connections
    ssl_context = "require" if "supabase" in (host or "").lower() or "sslmode=require" in DATABASE_URL else None

    logger.info(f"Connecting to database at {host}:{port}/{database}...")
    try:
        _pool = await asyncpg.create_pool(
            host=host,
            port=port,
            user=user,
            password=password,
            database=database,
            min_size=1,
            max_size=10,
            command_timeout=20,
            ssl=ssl_context
        )
        logger.info("✅ Database connection pool initialized successfully.")
        return _pool
    except Exception as e:
        logger.error(f"❌ Failed to initialize database connection pool: {e}")
        raise

async def close_db_pool():
    global _pool
    if _pool:
        await _pool.close()
        logger.info("Database connection pool closed.")

def get_pool() -> asyncpg.Pool:
    if not _pool:
        raise RuntimeError("Database pool not initialized. Call init_db_pool() first.")
    return _pool

async def get_node_by_identifier(identifier: str) -> Optional[Dict[str, Any]]:
    """Finds an IoT node by either its device_uid or its integer node_id."""
    pool = get_pool()
    async with pool.acquire() as conn:
        node_id_int = int(identifier) if identifier.isdigit() else None
        
        row = await conn.fetchrow(
            """
            SELECT node_id, device_uid, name, latitude, longitude, status, 
                   battery_level, sensor_type, notes, last_ping, zone_id, custom_area_id
            FROM iot_nodes
            WHERE device_uid = $1 OR ($2::int IS NOT NULL AND node_id = $2::int)
            LIMIT 1
            """,
            identifier,
            node_id_int
        )
        return dict(row) if row else None

async def update_node_status(
    node_id: int, 
    status: Optional[str] = None, 
    battery_level: Optional[int] = None,
    lat: Optional[float] = None,
    lng: Optional[float] = None
) -> None:
    pool = get_pool()
    async with pool.acquire() as conn:
        updates = ["last_ping = NOW()", "updated_at = NOW()"]
        args = [node_id]
        idx = 2

        if status:
            updates.append(f"status = ${idx}::\"NodeStatus\"")
            args.append(status)
            idx += 1
        if battery_level is not None:
            updates.append(f"battery_level = ${idx}")
            args.append(battery_level)
            idx += 1
        if lat is not None and lng is not None:
            updates.append(f"latitude = ${idx}, longitude = ${idx+1}")
            args.extend([lat, lng])
            idx += 2

        query = f"UPDATE iot_nodes SET {', '.join(updates)} WHERE node_id = $1"
        await conn.execute(query, *args)

async def insert_trigger_event(
    node_id: int,
    trigger_type: str,
    severity: str = "ALERT",
    decibel_level: Optional[float] = None,
    confidence: Optional[float] = None,
    details: Optional[str] = None,
    audio_sample_url: Optional[str] = None
) -> Dict[str, Any]:
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO iot_trigger_events 
                (node_id, trigger_type, severity, decibel_level, confidence, details, audio_sample_url, triggered_at, created_at)
            VALUES 
                ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
            RETURNING event_id, node_id, trigger_type, severity, decibel_level, confidence, details, triggered_at
            """,
            node_id,
            trigger_type,
            severity,
            decibel_level,
            confidence,
            details,
            audio_sample_url
        )
        return dict(row) if row else {}

async def get_recent_alerts(limit: int = 50) -> List[Dict[str, Any]]:
    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT e.event_id, e.node_id, n.name AS node_name, n.device_uid,
                   e.trigger_type, e.severity, e.decibel_level, e.confidence, 
                   e.details, e.audio_sample_url, e.triggered_at,
                   n.latitude, n.longitude
            FROM iot_trigger_events e
            JOIN iot_nodes n ON e.node_id = n.node_id
            ORDER BY e.triggered_at DESC
            LIMIT $1
            """,
            limit
        )
        return [dict(r) for r in rows]

async def get_node_triggers(node_id: int, limit: int = 100) -> List[Dict[str, Any]]:
    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT event_id, node_id, trigger_type, severity, decibel_level, confidence, details, audio_sample_url, triggered_at
            FROM iot_trigger_events
            WHERE node_id = $1
            ORDER BY triggered_at ASC
            LIMIT $2
            """,
            node_id,
            limit
        )
        return [dict(r) for r in rows]
