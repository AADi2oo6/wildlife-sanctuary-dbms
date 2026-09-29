import axios from "axios";

export const FASTAPI_BASE_URL = import.meta.env.VITE_FASTAPI_URL || "http://localhost:8000";

const fastApiClient = axios.create({
  baseURL: FASTAPI_BASE_URL,
  timeout: 15000,
});

/**
 * Returns formatted absolute URL for audio/image assets stored in FastAPI /uploads.
 */
export const getAssetUrl = (url) => {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("blob:") || url.startsWith("data:")) {
    return url;
  }
  const cleanPath = url.startsWith("/") ? url : `/${url}`;
  return `${FASTAPI_BASE_URL}${cleanPath}`;
};

/**
 * List detected COM / Serial ports physically attached to the host.
 */
export const fetchComPorts = async () => {
  try {
    const res = await fastApiClient.get("/api/hardware/com-ports");
    return res.data;
  } catch (err) {
    console.warn("Could not query COM ports from FastAPI hardware service:", err.message);
    return { ports: [] };
  }
};

/**
 * Query current connection & streaming status of a node.
 */
export const fetchNodeHardwareStatus = async (nodeId) => {
  try {
    const res = await fastApiClient.get(`/api/hardware/nodes/${nodeId}/status`);
    return res.data;
  } catch (err) {
    return { error: err.response?.data?.detail || err.message };
  }
};

/**
 * Connect the Python serial listener to the node's configured COM port.
 */
export const connectNodeSerial = async (nodeId) => {
  const res = await fastApiClient.post(`/api/hardware/nodes/${nodeId}/connect`);
  return res.data;
};

/**
 * Disconnect and release the node's COM port.
 */
export const disconnectNodeSerial = async (nodeId) => {
  const res = await fastApiClient.post(`/api/hardware/nodes/${nodeId}/disconnect`);
  return res.data;
};

/**
 * Send on-demand CMD:RECORD_5S command to Device 1 to record audio immediately.
 */
export const triggerManualAudio = async (nodeId) => {
  const res = await fastApiClient.post(`/api/hardware/nodes/${nodeId}/manual-audio`);
  return res.data;
};

/**
 * Send HTTP snapshot request to Device 2 ESP32-CAM (/capture).
 */
export const triggerManualSnapshot = async (nodeId) => {
  const res = await fastApiClient.post(`/api/hardware/nodes/${nodeId}/manual-snapshot`);
  return res.data;
};

/**
 * Toggle onboard illuminator flash LED on Device 2 ESP32-CAM.
 */
export const toggleNodeFlash = async (nodeId, state = true) => {
  const res = await fastApiClient.post(`/api/hardware/nodes/${nodeId}/flash?state=${state}`);
  return res.data;
};

/**
 * Fetch real-time hardware serial logs for diagnostic visibility.
 */
export const fetchNodeLogs = async (nodeId) => {
  try {
    const res = await fastApiClient.get(`/api/hardware/nodes/${nodeId}/logs`);
    return res.data.logs || [];
  } catch (err) {
    return [];
  }
};

/**
 * Update node COM port, baud rate, and camera URLs.
 */
export const updateNodeHardwareConfig = async (nodeId, configData) => {
  const res = await fastApiClient.patch(`/api/hardware/nodes/${nodeId}/config`, configData);
  return res.data;
};

/**
 * Dispatch test threat alert to registered Telegram subscribers.
 */
export const triggerTelegramTestAlert = async () => {
  const res = await fastApiClient.post("/api/hardware/telegram/test-alert");
  return res.data;
};

export default fastApiClient;

