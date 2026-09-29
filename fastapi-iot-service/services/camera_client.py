import httpx
import time
import os
import logging
from pathlib import Path
from typing import Optional, Dict, Any

logger = logging.getLogger("fastapi_iot.camera_client")

# Base directory for storing captured JPEG images
BASE_DIR = Path(__file__).resolve().parent.parent
IMAGES_DIR = BASE_DIR / "uploads" / "images"
IMAGES_DIR.mkdir(parents=True, exist_ok=True)

class CameraClient:
    """
    Client for interacting with Device 2 (ESP32-CAM).
    Supports high-speed snapshot acquisition, status inspection, and flash LED toggling.
    """

    @staticmethod
    async def capture_snapshot(camera_url: str, node_id: int = 0) -> Optional[Dict[str, Any]]:
        """
        Request a fresh JPEG snapshot from the ESP32-CAM.
        Saves image to uploads/images/ and returns metadata with local relative URL.
        """
        if not camera_url:
            logger.warning("[CameraClient] No camera_url configured for node.")
            return None

        # Clean URL: ensure /capture endpoint
        url = camera_url.strip()
        if not url.endswith("/capture") and not url.endswith(".jpg"):
            url = url.rstrip("/") + "/capture"

        filename = f"snapshot_node{node_id}_{int(time.time() * 1000)}.jpg"
        filepath = IMAGES_DIR / filename
        relative_url = f"/uploads/images/{filename}"

        logger.info(f"📸 [CameraClient] Requesting snapshot from {url} for Node #{node_id}...")

        try:
            async with httpx.AsyncClient(timeout=4.5) as client:
                res = await client.get(url)
                if res.status_code == 200 and len(res.content) > 100:
                    with open(filepath, "wb") as f:
                        f.write(res.content)
                    
                    file_size = len(res.content)
                    logger.info(f"✅ [CameraClient] Snapshot captured successfully: {filename} ({file_size:,} bytes)")
                    return {
                        "success": True,
                        "filename": filename,
                        "relative_url": relative_url,
                        "file_path": str(filepath),
                        "file_size": file_size,
                        "timestamp": int(time.time() * 1000)
                    }
                else:
                    logger.warning(f"⚠️ [CameraClient] ESP32-CAM responded with HTTP {res.status_code}")
                    return None
        except httpx.ConnectError:
            logger.warning(f"⚠️ [CameraClient] Connection refused at {url}. ESP32-CAM may be powered off or offline.")
            return None
        except httpx.TimeoutException:
            logger.warning(f"⚠️ [CameraClient] Timeout waiting for snapshot from {url}.")
            return None
        except Exception as e:
            logger.error(f"❌ [CameraClient] Error capturing snapshot: {e}")
            return None

    @staticmethod
    async def toggle_flash(camera_url: str, enable: bool) -> bool:
        """
        Toggle the high-power flashlight LED on the ESP32-CAM (GPIO 4) for night surveillance.
        """
        if not camera_url:
            return False

        # Derive base origin e.g. http://192.168.1.105
        base_url = "/".join(camera_url.split("/")[:3])
        flash_url = f"{base_url}/flash?val={1 if enable else 0}"

        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                res = await client.get(flash_url)
                return res.status_code == 200
        except Exception as e:
            logger.warning(f"⚠️ [CameraClient] Failed to toggle flashlight at {flash_url}: {e}")
            return False

    @staticmethod
    async def check_status(camera_url: str) -> Optional[Dict[str, Any]]:
        """
        Check health and status of the ESP32-CAM node.
        """
        if not camera_url:
            return None

        base_url = "/".join(camera_url.split("/")[:3])
        status_url = f"{base_url}/status"

        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                res = await client.get(status_url)
                if res.status_code == 200:
                    return res.json()
        except Exception:
            return None
        return None
