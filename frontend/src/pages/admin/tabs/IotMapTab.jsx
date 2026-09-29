import React, { useState, useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Radio, MapPin, Search, Plus, Trash2, Battery, BatteryCharging,
  Layers, Globe, Shield, RefreshCw, X, AlertTriangle, CheckCircle, Crosshair,
  Navigation, LocateFixed, PenTool, Shapes, Undo2, Check, Info, Compass,
  History, Eye, Clock, AlertCircle, ChevronRight, Filter, Activity,
  Camera, Video, Mic, Sun, Usb, Cable, Power, Play, Settings, Terminal, Cpu, Send
} from "lucide-react";
import api from "../../../api/axiosInstance";
import { Eyebrow, Badge, Modal, Inp, Sel, inputStyle, SubmitButton } from "../shared/adminComponents";
import { NODE_STATUS_COLOR } from "../shared/adminConstants";
import NodeMemoryModal from "./components/NodeMemoryModal";
import LiveCameraModal from "./components/LiveCameraModal";
import {
  fetchComPorts,
  connectNodeSerial,
  disconnectNodeSerial,
  triggerManualAudio,
  triggerManualSnapshot,
  fetchNodeLogs,
  updateNodeHardwareConfig,
  triggerTelegramTestAlert,
} from "../../../api/hardwareApi";

// Fix Leaflet's default icon paths in bundled environments
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// Standard spherical excess geodesic polygon area calculation in km²
export const calculatePolygonAreaSqKm = (coords) => {
  if (!coords || coords.length < 3) return 0;
  const RADIUS = 6378.137; // Earth mean radius in km
  let totalAngle = 0;
  const len = coords.length;

  for (let i = 0; i < len; i++) {
    const p1 = coords[i];
    const p2 = coords[(i + 1) % len];
    const lat1 = (p1[0] * Math.PI) / 180;
    const lat2 = (p2[0] * Math.PI) / 180;
    const dLng = ((p2[1] - p1[1]) * Math.PI) / 180;

    totalAngle += dLng * (2 + Math.sin(lat1) + Math.sin(lat2));
  }

  const area = Math.abs((totalAngle * RADIUS * RADIUS) / 2);
  return parseFloat(area.toFixed(2));
};

// Calculate centroid of coordinate array
export const calculateCentroid = (coords) => {
  if (!coords || coords.length === 0) return [0, 0];
  let latSum = 0;
  let lngSum = 0;
  coords.forEach(([lat, lng]) => {
    latSum += lat;
    lngSum += lng;
  });
  return [parseFloat((latSum / coords.length).toFixed(6)), parseFloat((lngSum / coords.length).toFixed(6))];
};

// Calculate polygon perimeter in km
export const calculatePerimeterKm = (coords) => {
  if (!coords || coords.length < 2) return 0;
  const RADIUS = 6378.137;
  let dist = 0;
  for (let i = 0; i < coords.length; i++) {
    const p1 = coords[i];
    const p2 = coords[(i + 1) % coords.length];
    const dLat = ((p2[0] - p1[0]) * Math.PI) / 180;
    const dLng = ((p2[1] - p1[1]) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((p1[0] * Math.PI) / 180) *
        Math.cos((p2[0] * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    dist += RADIUS * c;
  }
  return parseFloat(dist.toFixed(2));
};

// Major preset forest & wildlife sanctuary polygons (India & Global)
const PRESET_SANCTUARIES = [
  {
    id: "corbett",
    name: "Jim Corbett National Park",
    region: "Uttarakhand, India",
    area: "1,288 km²",
    climate: "Sub-Himalayan Subtropical",
    color: "#22c55e",
    coords: [
      [29.62, 78.75],
      [29.75, 78.85],
      [29.72, 79.15],
      [29.50, 79.12],
      [29.45, 78.90],
      [29.62, 78.75],
    ],
  },
  {
    id: "kaziranga",
    name: "Kaziranga National Park",
    region: "Assam, India",
    area: "858 km²",
    climate: "Tropical Wetland & Floodplain",
    color: "#10b981",
    coords: [
      [26.55, 93.10],
      [26.70, 93.25],
      [26.75, 93.65],
      [26.60, 93.60],
      [26.50, 93.30],
      [26.55, 93.10],
    ],
  },
  {
    id: "gir",
    name: "Gir National Park & Lion Sanctuary",
    region: "Gujarat, India",
    area: "1,412 km²",
    climate: "Dry Deciduous Teak Forest",
    color: "#eab308",
    coords: [
      [21.05, 70.70],
      [21.25, 70.80],
      [21.30, 71.15],
      [21.15, 71.25],
      [20.95, 71.00],
      [21.05, 70.70],
    ],
  },
  {
    id: "sundarbans",
    name: "Sundarbans Tiger Reserve",
    region: "West Bengal, India",
    area: "2,585 km²",
    climate: "Mangrove Tidal Wetland",
    color: "#06b6d4",
    coords: [
      [21.75, 88.60],
      [22.20, 88.65],
      [22.25, 89.05],
      [21.80, 89.15],
      [21.75, 88.60],
    ],
  },
  {
    id: "bandipur",
    name: "Bandipur Tiger Reserve",
    region: "Karnataka, India",
    area: "874 km²",
    climate: "Moist & Dry Deciduous",
    color: "#84cc16",
    coords: [
      [11.60, 76.45],
      [11.85, 76.50],
      [11.80, 76.85],
      [11.55, 76.80],
      [11.50, 76.55],
      [11.60, 76.45],
    ],
  },
  {
    id: "serengeti",
    name: "Serengeti National Park",
    region: "Tanzania, Africa",
    area: "14,763 km²",
    climate: "Tropical Savanna Plains",
    color: "#f97316",
    coords: [
      [-1.50, 34.60],
      [-2.20, 34.40],
      [-3.10, 34.90],
      [-2.80, 35.30],
      [-1.70, 35.20],
      [-1.50, 34.60],
    ],
  },
  {
    id: "amazon_sector",
    name: "Amazon Bio-Reserve Sector A",
    region: "Amazonas, Brazil",
    area: "25,000 km²",
    climate: "Equatorial Dense Rainforest",
    color: "#16a34a",
    coords: [
      [-3.00, -60.50],
      [-2.50, -59.80],
      [-3.20, -59.20],
      [-3.80, -60.00],
      [-3.00, -60.50],
    ],
  },
];

const TILE_PROVIDERS = {
  satellite: {
    name: "Satellite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, GIS User Community",
    maxZoom: 19,
  },
  street: {
    name: "Streets",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors",
    maxZoom: 19,
  },
  topo: {
    name: "Topographic",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: "Map data: &copy; OpenStreetMap, SRTM | Map style: &copy; OpenTopoMap",
    maxZoom: 17,
  },
};

const AREA_COLOR_PALETTE = [
  { name: "Emerald", hex: "#22c55e" },
  { name: "Lime", hex: "#a3e635" },
  { name: "Amber", hex: "#f59e0b" },
  { name: "Cyan", hex: "#06b6d4" },
  { name: "Violet", hex: "#8b5cf6" },
  { name: "Red Core", hex: "#ef4444" },
];

const createNodeIcon = (status, name) => {
  const color = NODE_STATUS_COLOR[status] || "#4ade80";
  const isAlert = status === "ALERT";
  const isOffline = status === "OFFLINE";

  const pulseHtml = isAlert
    ? `<span class="absolute -inset-2 rounded-full animate-ping opacity-75" style="background:${color}"></span>`
    : !isOffline
    ? `<span class="absolute -inset-1 rounded-full animate-pulse opacity-40" style="background:${color}"></span>`
    : "";

  return L.divIcon({
    className: "custom-iot-marker",
    html: `
      <div class="relative flex items-center justify-center cursor-pointer select-none group" style="width: 32px; height: 32px;">
        ${pulseHtml}
        <div class="relative flex items-center justify-center rounded-full shadow-lg transition-transform transform group-hover:scale-125"
             style="width: 26px; height: 26px; background: rgba(13,26,15,0.92); border: 2px solid ${color}; box-shadow: 0 0 14px ${color}88;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/>
            <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/>
            <circle cx="12" cy="12" r="2"/>
            <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/>
            <path d="M19.1 4.9C23 8.8 23 15.2 19.1 19.1"/>
          </svg>
        </div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -18],
  });
};

const IotMapTab = ({ toast }) => {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const tileLayerRef = useRef(null);
  const presetPolygonsLayerRef = useRef(null);
  const customPolygonsLayerRef = useRef(null);
  const drawLayerRef = useRef(null);
  const markersLayerRef = useRef(null);
  const tempMarkerRef = useRef(null);
  const searchMarkerRef = useRef(null);
  const userLocMarkerRef = useRef(null);
  const searchContainerRef = useRef(null);

  // Map & Controls State
  const [activeLayer, setActiveLayer] = useState("satellite");
  const [showSanctuaryBorders, setShowSanctuaryBorders] = useState(true);
  const [deployMode, setDeployMode] = useState(false);
  const [drawMode, setDrawMode] = useState(false);
  const [drawPoints, setDrawPoints] = useState([]);

  // Data State
  const [nodes, setNodes] = useState([]);
  const [zones, setZones] = useState([]);
  const [customAreas, setCustomAreas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [locating, setLocating] = useState(false);

  // Left Sidebar State
  const [sidebarTab, setSidebarTab] = useState("areas"); // 'areas' | 'nodes' | 'history'
  const [visitedHistory, setVisitedHistory] = useState([]);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  // Detail Drawer States
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedArea, setSelectedArea] = useState(null);

  // Deploy Modal State
  const [showDeployModal, setShowDeployModal] = useState(false);
  const [submittingNode, setSubmittingNode] = useState(false);
  const [availableComPorts, setAvailableComPorts] = useState([]);
  const [liveCameraNode, setLiveCameraNode] = useState(null);
  const [triggeringAudio, setTriggeringAudio] = useState(false);
  const [triggeringPhoto, setTriggeringPhoto] = useState(false);
  const [togglingCom, setTogglingCom] = useState(false);

  const [nodeForm, setNodeForm] = useState({
    name: "",
    device_uid: "",
    latitude: "",
    longitude: "",
    status: "ACTIVE",
    battery_level: "100",
    sensor_type: "ACOUSTIC_VISION",
    zone_id: "",
    custom_area_id: "",
    com_port: "",
    baud_rate: "115200",
    camera_url: "",
    camera_stream_url: "",
    notes: "",
  });

  // Query hardware COM ports physically connected to the host
  const refreshComPorts = useCallback(async () => {
    try {
      const data = await fetchComPorts();
      setAvailableComPorts(data.ports || []);
    } catch (e) {
      console.warn("COM ports lookup failed:", e);
    }
  }, []);

  useEffect(() => {
    refreshComPorts();
  }, [refreshComPorts]);

  // Connect or disconnect the Python serial listener for a node
  const handleToggleCom = async (node) => {
    if (!node?.node_id) return;
    setTogglingCom(true);
    try {
      if (node.is_listening) {
        await disconnectNodeSerial(node.node_id);
        toast(`Released ${node.com_port} listener for ${node.name}.`, "info");
      } else {
        await connectNodeSerial(node.node_id);
        toast(`🔌 Serial bridge connected to ${node.com_port} for ${node.name}!`, "success");
      }
      loadData(true);
      setSelectedNode((prev) =>
        prev && prev.node_id === node.node_id ? { ...prev, is_listening: !prev.is_listening } : prev
      );
    } catch (err) {
      toast(err.response?.data?.detail || err.message || "Failed to toggle COM port.", "error");
    } finally {
      setTogglingCom(false);
    }
  };

  const [audioCountdown, setAudioCountdown] = useState(0);

  // Trigger manual 5-second acoustic acquisition from Device 1
  const handleTriggerAudio = async (node) => {
    if (!node?.node_id) return;
    setTriggeringAudio(true);
    setAudioCountdown(5);

    try {
      toast(`🎙️ Transmitting CMD:RECORD_5S to Device 1 (${node.com_port || "Serial"})...`, "info");
      const res = await triggerManualAudio(node.node_id);
      if (res.status === "success") {
        toast(`📡 5s Recording command received by ESP32! Acquiring audio...`, "info");
        
        // Start visible countdown for operator
        let remaining = 5;
        const countdownInterval = setInterval(() => {
          remaining -= 1;
          setAudioCountdown(remaining);
          if (remaining <= 0) {
            clearInterval(countdownInterval);
            toast("🧠 Stream received over USB! AI agent analyzing acoustic spectrogram...", "info");
            setTimeout(() => {
              loadData(true);
              handleOpenNodeMemory(node);
              setTriggeringAudio(false);
            }, 3000);
          }
        }, 1000);
      } else {
        toast(res.message || "Manual audio trigger failed.", "error");
        setTriggeringAudio(false);
      }
    } catch (err) {
      toast(err.response?.data?.detail || "Manual audio failed. Ensure COM port is open.", "error");
      setTriggeringAudio(false);
    }
  };

  // Trigger manual optical snapshot from Device 2 ESP32-CAM
  const handleTriggerSnapshot = async (node) => {
    if (!node?.node_id) return;
    setTriggeringPhoto(true);
    try {
      toast(`📸 Capturing snapshot & running Vision AI analysis (${node.camera_url})...`, "info");
      const res = await triggerManualSnapshot(node.node_id);
      if (res.status === "success") {
        toast(`✅ Snapshot captured & analyzed by Vision AI! Saved to Node Memory.`, "success");
        loadData(true);
        handleOpenNodeMemory(node);
      } else {
        toast(res.message || "Snapshot trigger failed.", "error");
      }
    } catch (err) {
      toast(err.response?.data?.detail || "Snapshot request failed. Check camera URL & Wi-Fi.", "error");
    } finally {
      setTriggeringPhoto(false);
    }
  };

  // Hardware Config Modal State (for updating COM port, baud rate, and camera URLs)
  const [showHardwareConfigModal, setShowHardwareConfigModal] = useState(false);
  const [hardwareConfigNode, setHardwareConfigNode] = useState(null);
  const [submittingConfig, setSubmittingConfig] = useState(false);
  const [hardwareForm, setHardwareForm] = useState({
    com_port: "",
    baud_rate: "115200",
    camera_url: "",
    camera_stream_url: "",
    connect_serial: true,
  });

  // Dedicated Inline COM Port Quick Updater for Selected Node Drawer
  const [inlinePortValue, setInlinePortValue] = useState("");
  const [updatingInlinePort, setUpdatingInlinePort] = useState(false);

  useEffect(() => {
    if (selectedNode) {
      setInlinePortValue(selectedNode.com_port || "");
    }
  }, [selectedNode?.node_id, selectedNode?.com_port]);

  const handleQuickUpdatePort = async () => {
    if (!selectedNode) return;
    setUpdatingInlinePort(true);
    try {
      const portToSave = inlinePortValue.trim();

      // 1. Update backend Postgres DB via Express API
      await api.patch(`/admin/iot-nodes/${selectedNode.node_id}`, {
        com_port: portToSave || null,
        is_listening: Boolean(portToSave),
      });

      // 2. Synchronize and trigger FastAPI Serial Bridge
      let listening = Boolean(portToSave);
      try {
        const hwRes = await updateNodeHardwareConfig(selectedNode.node_id, {
          com_port: portToSave,
          connect_serial: Boolean(portToSave),
        });
        if (hwRes && hwRes.is_listening !== undefined) {
          listening = hwRes.is_listening;
        }
      } catch (fastApiErr) {
        console.warn("FastAPI serial sync note:", fastApiErr);
      }

      toast(`✅ Serial COM port updated to ${portToSave || "Unassigned"} for ${selectedNode.name}!`, "success");
      setSelectedNode((prev) =>
        prev && prev.node_id === selectedNode.node_id
          ? { ...prev, com_port: portToSave, is_listening: listening }
          : prev
      );
      loadData(true);
    } catch (err) {
      toast(err.response?.data?.error || err.response?.data?.detail || "Failed to update COM port.", "error");
    } finally {
      setUpdatingInlinePort(false);
    }
  };

  const handleOpenHardwareConfig = (node) => {
    setHardwareConfigNode(node);
    setHardwareForm({
      com_port: node.com_port || "",
      baud_rate: String(node.baud_rate || 115200),
      camera_url: node.camera_url || "",
      camera_stream_url: node.camera_stream_url || "",
      connect_serial: Boolean(node.is_listening || node.com_port),
    });
    refreshComPorts();
    setShowHardwareConfigModal(true);
  };

  const handleSaveHardwareConfig = async (e) => {
    e.preventDefault();
    if (!hardwareConfigNode) return;
    setSubmittingConfig(true);
    try {
      const portVal = hardwareForm.com_port ? hardwareForm.com_port.trim() : null;
      const baudVal = parseInt(hardwareForm.baud_rate, 10) || 115200;
      const camVal = hardwareForm.camera_url ? hardwareForm.camera_url.trim() : null;
      const streamVal = hardwareForm.camera_stream_url ? hardwareForm.camera_stream_url.trim() : null;

      // 1. Save to Express Postgres database
      await api.patch(`/admin/iot-nodes/${hardwareConfigNode.node_id}`, {
        com_port: portVal,
        baud_rate: baudVal,
        camera_url: camVal,
        camera_stream_url: streamVal,
        is_listening: hardwareForm.connect_serial,
      });

      // 2. Configure FastAPI hardware bridge
      let isListening = hardwareForm.connect_serial;
      try {
        const res = await updateNodeHardwareConfig(hardwareConfigNode.node_id, {
          com_port: portVal,
          baud_rate: baudVal,
          camera_url: camVal,
          camera_stream_url: streamVal,
          connect_serial: hardwareForm.connect_serial,
        });
        if (res && res.is_listening !== undefined) {
          isListening = res.is_listening;
        }
      } catch (fastApiErr) {
        console.warn("FastAPI hardware config error:", fastApiErr);
      }

      toast(`✅ Hardware settings updated for ${hardwareConfigNode.name}!`, "success");
      setShowHardwareConfigModal(false);
      loadData(true);
      setSelectedNode((prev) =>
        prev && prev.node_id === hardwareConfigNode.node_id
          ? {
              ...prev,
              com_port: portVal,
              baud_rate: baudVal,
              camera_url: camVal,
              camera_stream_url: streamVal,
              is_listening: isListening,
            }
          : prev
      );
    } catch (err) {
      toast(err.response?.data?.error || err.response?.data?.detail || "Failed to update hardware config.", "error");
    } finally {
      setSubmittingConfig(false);
    }
  };

  // Live Serial Logs Modal State
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [logsNode, setLogsNode] = useState(null);
  const [liveLogs, setLiveLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const handleOpenLogs = async (node) => {
    setLogsNode(node);
    setShowLogsModal(true);
    setLoadingLogs(true);
    try {
      const logs = await fetchNodeLogs(node.node_id);
      setLiveLogs(logs);
    } finally {
      setLoadingLogs(false);
    }
  };

  // Auto-refresh live logs every 1.5s when logs modal is open
  useEffect(() => {
    if (!showLogsModal || !logsNode) return;
    const interval = setInterval(async () => {
      const logs = await fetchNodeLogs(logsNode.node_id);
      setLiveLogs(logs);
    }, 1500);
    return () => clearInterval(interval);
  }, [showLogsModal, logsNode]);

  // Custom Area Modal State
  const [showAreaModal, setShowAreaModal] = useState(false);
  const [submittingArea, setSubmittingArea] = useState(false);
  const [areaForm, setAreaForm] = useState({
    name: "",
    area_type: "CORE_SANCTUARY",
    color: "#22c55e",
    climate: "Tropical Moist Deciduous",
    description: "",
  });

  // Node Memory & Trigger Graph Modal State
  const [memoryModalNode, setMemoryModalNode] = useState(null);

  // Record node/area to visited history
  const recordHistory = useCallback((item) => {
    setVisitedHistory((prev) => {
      const filtered = prev.filter((x) => !(x.id === item.id && x.type === item.type));
      return [
        {
          ...item,
          visitedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
        ...filtered,
      ].slice(0, 15);
    });
  }, []);

  // Open node memory modal & log visit
  const handleOpenNodeMemory = useCallback((node) => {
    setMemoryModalNode(node);
    recordHistory({
      type: "node",
      id: node.node_id,
      name: node.name,
      subtitle: `Inspected Memory • ${node.device_uid}`,
      lat: Number(node.latitude),
      lng: Number(node.longitude),
      status: node.status,
    });
  }, [recordHistory]);

  // Real-time callback when a trigger is logged in memory
  const handleTriggerLogged = useCallback((nodeId, trigger) => {
    setNodes((prev) =>
      prev.map((n) => {
        if (n.node_id !== nodeId) return n;
        const newStatus = trigger.severity === "ALERT" ? "ALERT" : n.status;
        return {
          ...n,
          status: newStatus,
          _count: {
            ...n._count,
            trigger_events: (n._count?.trigger_events || 0) + 1,
          },
        };
      })
    );
    setSelectedNode((prev) => {
      if (!prev || prev.node_id !== nodeId) return prev;
      return {
        ...prev,
        status: trigger.severity === "ALERT" ? "ALERT" : prev.status,
      };
    });
  }, []);

  // Load deployed nodes, zones & custom marked areas
  const loadData = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const [nodesRes, zonesRes, areasRes] = await Promise.all([
        api.get("/admin/iot-nodes"),
        api.get("/zones"),
        api.get("/admin/custom-areas"),
      ]);
      setNodes(nodesRes.data.nodes || []);
      setZones(zonesRes.data.zones || []);
      setCustomAreas(areasRes.data.areas || []);
    } catch (err) {
      if (!silent) {
        toast(err.response?.data?.error || "Failed to load telemetry & area data.", "error");
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [toast]);

  // Initial load and auto-refresh polling every 3.5s
  useEffect(() => {
    loadData(false);
    const pollInterval = setInterval(() => {
      loadData(true);
    }, 3500);
    return () => clearInterval(pollInterval);
  }, [loadData]);

  // Real-time WebSocket Telemetry & Threat Ingestion listener
  useEffect(() => {
    let ws = null;
    let reconnectTimeout = null;

    const connectWs = () => {
      try {
        ws = new WebSocket("ws://localhost:8000/ws/telemetry");

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.event === "telemetry_update") {
              // Update node live in state
              setNodes((prev) =>
                prev.map((n) => {
                  if (n.node_id === data.node_id || n.device_uid === data.device_uid) {
                    return {
                      ...n,
                      status: data.node_status || n.status,
                      battery_level: data.battery_level ?? n.battery_level,
                      last_ping: data.timestamp,
                      _count: {
                        ...n._count,
                        trigger_events: (n._count?.trigger_events || 0) + (data.is_anomaly ? 1 : 0),
                      },
                    };
                  }
                  return n;
                })
              );

              // Update selected node if open
              setSelectedNode((prev) => {
                if (!prev || (prev.node_id !== data.node_id && prev.device_uid !== data.device_uid)) return prev;
                return {
                  ...prev,
                  status: data.node_status || prev.status,
                  battery_level: data.battery_level ?? prev.battery_level,
                };
              });

              if (data.is_anomaly || data.severity === "ALERT") {
                toast?.(
                  `🚨 [THREAT DETECTED] ${data.node_name || 'Node'}: ${data.threat_type || 'Acoustic spike'} (${data.sound_level_db} dB)`,
                  "error"
                );
              }
            }
          } catch (e) {
            // ignore non-json packet
          }
        };

        ws.onerror = () => {
          ws?.close();
        };

        ws.onclose = () => {
          reconnectTimeout = setTimeout(connectWs, 5000);
        };
      } catch (err) {
        reconnectTimeout = setTimeout(connectWs, 5000);
      }
    };

    connectWs();
    return () => {
      if (ws) ws.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, [toast]);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [22.5, 79.5],
      zoom: 5,
      minZoom: 3,
      maxZoom: 19,
      zoomControl: false,
    });

    L.control.zoom({ position: "bottomright" }).addTo(map);

    const provider = TILE_PROVIDERS.satellite;
    tileLayerRef.current = L.tileLayer(provider.url, {
      attribution: provider.attribution,
      maxZoom: provider.maxZoom,
    }).addTo(map);

    presetPolygonsLayerRef.current = L.layerGroup().addTo(map);
    customPolygonsLayerRef.current = L.layerGroup().addTo(map);
    drawLayerRef.current = L.layerGroup().addTo(map);
    markersLayerRef.current = L.layerGroup().addTo(map);

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update Base Layer
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !tileLayerRef.current) return;

    map.removeLayer(tileLayerRef.current);
    const provider = TILE_PROVIDERS[activeLayer];
    tileLayerRef.current = L.tileLayer(provider.url, {
      attribution: provider.attribution,
      maxZoom: provider.maxZoom,
    }).addTo(map);
  }, [activeLayer]);

  // Draw Preset Sanctuary Polygons
  useEffect(() => {
    if (!presetPolygonsLayerRef.current) return;
    presetPolygonsLayerRef.current.clearLayers();

    if (!showSanctuaryBorders) return;

    PRESET_SANCTUARIES.forEach((s) => {
      const polygon = L.polygon(s.coords, {
        color: s.color,
        fillColor: s.color,
        fillOpacity: 0.16,
        weight: 2,
        dashArray: "4, 6",
      });

      polygon.bindPopup(`
        <div style="font-family: sans-serif; min-width: 210px; color: #fff; padding: 4px;">
          <div style="display:flex; align-items:center; gap: 6px; margin-bottom: 6px;">
            <span style="width: 8px; height: 8px; border-radius: 50%; background: ${s.color};"></span>
            <strong style="font-size: 13px; color: #fff;">${s.name}</strong>
          </div>
          <p style="margin: 2px 0; font-size: 11px; color: #a1a1aa;"><strong>Region:</strong> ${s.region}</p>
          <p style="margin: 2px 0; font-size: 11px; color: #a1a1aa;"><strong>Coverage Area:</strong> ${s.area}</p>
          <p style="margin: 2px 0; font-size: 11px; color: #a1a1aa;"><strong>Biophilic Climate:</strong> ${s.climate}</p>
          <div style="margin-top: 8px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.1); font-size: 10px; color: #a3e635;">
            ✓ Active Wildlife Bio-Reserve Protection
          </div>
        </div>
      `, { className: "deepgreen-leaflet-popup" });

      polygon.addTo(presetPolygonsLayerRef.current);
    });
  }, [showSanctuaryBorders]);

  // Draw User-Marked Custom Areas
  useEffect(() => {
    if (!customPolygonsLayerRef.current) return;
    customPolygonsLayerRef.current.clearLayers();

    if (!showSanctuaryBorders) return;

    customAreas.forEach((area) => {
      if (!area.coordinates || !Array.isArray(area.coordinates) || area.coordinates.length < 3) return;

      const color = area.color || "#22c55e";
      const polygon = L.polygon(area.coordinates, {
        color: color,
        fillColor: color,
        fillOpacity: 0.22,
        weight: 2.5,
      });

      const centroid = calculateCentroid(area.coordinates);

      polygon.bindPopup(`
        <div style="font-family: sans-serif; min-width: 220px; color: #fff; padding: 4px;">
          <div style="display:flex; align-items:center; justify-content:space-between; gap: 6px; margin-bottom: 6px;">
            <strong style="font-size: 13px; color: #fff;">${area.name}</strong>
            <span style="font-size: 9px; font-weight:800; padding: 2px 6px; border-radius: 999px; background: ${color}22; color: ${color}; border: 1px solid ${color}44;">
              ${area.area_type.replace(/_/g, " ")}
            </span>
          </div>
          <p style="margin: 2px 0; font-size: 11px; color: #a1a1aa;"><strong>Surface Area:</strong> <span style="color:#a3e635; font-weight:bold;">${parseFloat(area.area_sq_km).toLocaleString()} km²</span></p>
          <p style="margin: 2px 0; font-size: 11px; color: #a1a1aa;"><strong>Center Coordinates:</strong> ${centroid[0]}, ${centroid[1]}</p>
          ${area.climate ? `<p style="margin: 2px 0; font-size: 11px; color: #a1a1aa;"><strong>Climate:</strong> ${area.climate}</p>` : ""}
          <div style="margin-top: 8px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.1); font-size: 10px; color: #38bdf8;">
            Click polygon to view details & deploy IoT nodes
          </div>
        </div>
      `, { className: "deepgreen-leaflet-popup" });

      polygon.on("click", () => {
        setSelectedArea(area);
        setSelectedNode(null);
        recordHistory({
          type: "area",
          id: area.area_id,
          name: area.name,
          subtitle: `${parseFloat(area.area_sq_km).toLocaleString()} km² · ${area.area_type}`,
          lat: centroid[0],
          lng: centroid[1],
          color: area.color,
        });
      });

      polygon.addTo(customPolygonsLayerRef.current);
    });
  }, [customAreas, showSanctuaryBorders, recordHistory]);

  // Handle Interactive Map Click (Deploy Mode vs. Draw Area Mode)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const handleMapClick = (e) => {
      const { lat, lng } = e.latlng;
      const formattedLat = parseFloat(lat.toFixed(6));
      const formattedLng = parseFloat(lng.toFixed(6));

      if (drawMode) {
        setDrawPoints((prev) => [...prev, [formattedLat, formattedLng]]);
        return;
      }

      if (deployMode) {
        if (tempMarkerRef.current) {
          map.removeLayer(tempMarkerRef.current);
        }
        tempMarkerRef.current = L.circleMarker([formattedLat, formattedLng], {
          radius: 8,
          color: "#a3e635",
          fillColor: "#a3e635",
          fillOpacity: 0.8,
          dashArray: "2, 4",
        }).addTo(map);

        const autoUid = `DGN-NODE-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;

        setNodeForm((prev) => ({
          ...prev,
          latitude: formattedLat.toString(),
          longitude: formattedLng.toString(),
          device_uid: autoUid,
          name: `Sensor Node ${nodes.length + 1}`,
        }));

        setShowDeployModal(true);
        setDeployMode(false);
      }
    };

    map.on("click", handleMapClick);
    return () => {
      map.off("click", handleMapClick);
    };
  }, [drawMode, deployMode, nodes.length]);

  // Real-time render of points while actively drawing an area
  useEffect(() => {
    const layer = drawLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    if (!drawMode || drawPoints.length === 0) return;

    drawPoints.forEach((pt, index) => {
      const marker = L.marker(pt, {
        icon: L.divIcon({
          className: "custom-draw-vertex",
          html: `
            <div class="flex items-center justify-center rounded-full font-black text-[10px] text-black shadow-lg"
                 style="width: 22px; height: 22px; background: #a3e635; border: 2px solid #ffffff; box-shadow: 0 0 10px rgba(163,230,53,0.9);">
              ${index + 1}
            </div>
          `,
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        }),
      });
      marker.addTo(layer);
    });

    if (drawPoints.length === 2) {
      L.polyline(drawPoints, {
        color: "#a3e635",
        weight: 3,
        dashArray: "5, 5",
      }).addTo(layer);
    } else if (drawPoints.length >= 3) {
      L.polygon(drawPoints, {
        color: "#a3e635",
        fillColor: "#a3e635",
        fillOpacity: 0.25,
        weight: 3,
        dashArray: "5, 5",
      }).addTo(layer);
    }
  }, [drawMode, drawPoints]);

  // Render IoT Markers
  useEffect(() => {
    if (!markersLayerRef.current) return;
    markersLayerRef.current.clearLayers();

    nodes.forEach((node) => {
      const lat = parseFloat(node.latitude);
      const lng = parseFloat(node.longitude);
      if (isNaN(lat) || isNaN(lng)) return;

      const marker = L.marker([lat, lng], {
        icon: createNodeIcon(node.status, node.name),
      });

      const statusColor = NODE_STATUS_COLOR[node.status] || "#4ade80";

      const popupContent = `
        <div style="font-family: sans-serif; min-width: 220px; color: #fff; padding: 4px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 6px;">
            <strong style="font-size: 13px; color: #fff;">${node.name}</strong>
            <span style="font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 999px; background: ${statusColor}22; color: ${statusColor}; border: 1px solid ${statusColor}44;">
              ${node.status}
            </span>
          </div>
          <div style="font-size: 11px; color: #a1a1aa; line-height: 1.6;">
            <div><strong>UID:</strong> <code style="color: #a3e635;">${node.device_uid}</code></div>
            <div><strong>Coordinates:</strong> ${lat.toFixed(4)}, ${lng.toFixed(4)}</div>
            <div><strong>Battery:</strong> ${node.battery_level}%</div>
            <div><strong>Capabilities:</strong> ${node.sensor_type || "Acoustic / Optical"}</div>
            ${node.custom_area ? `<div><strong>Marked Area:</strong> <span style="color:${node.custom_area.color}">${node.custom_area.name}</span></div>` : ""}
            ${node.zone ? `<div><strong>Zone:</strong> ${node.zone.name}</div>` : ""}
            ${node.notes ? `<div style="margin-top: 4px; font-style: italic; color: #71717a;">${node.notes}</div>` : ""}
          </div>
        </div>
      `;

      marker.bindPopup(popupContent, { className: "deepgreen-leaflet-popup" });

      marker.on("click", () => {
        setSelectedNode(node);
        setSelectedArea(null);
        recordHistory({
          type: "node",
          id: node.node_id,
          name: node.name,
          subtitle: `${node.device_uid} · ${node.status}`,
          lat,
          lng,
          status: node.status,
        });
      });

      marker.addTo(markersLayerRef.current);
    });
  }, [nodes, recordHistory]);

  // Geocoding & Local Search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const q = searchQuery.toLowerCase();

        // 1. Search locally marked areas
        const matchedAreas = customAreas
          .filter((a) => a.name.toLowerCase().includes(q))
          .map((a) => {
            const centroid = calculateCentroid(a.coordinates);
            return {
              type: "area",
              id: a.area_id,
              display_name: `${a.name} (${a.area_type.replace(/_/g, " ")})`,
              lat: centroid[0],
              lon: centroid[1],
              area_sq_km: a.area_sq_km,
              color: a.color,
            };
          });

        // 2. Search local nodes
        const matchedLocalNodes = nodes
          .filter((n) => n.name.toLowerCase().includes(q) || n.device_uid.toLowerCase().includes(q))
          .map((n) => ({
            type: "node",
            id: n.node_id,
            display_name: `${n.name} (${n.device_uid})`,
            lat: parseFloat(n.latitude),
            lon: parseFloat(n.longitude),
            status: n.status,
          }));

        // 3. Search global / Indian places from OpenStreetMap Nominatim
        const osmRes = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=5`
        );
        const osmData = await osmRes.json();
        const matchedOsm = (osmData || []).map((item) => ({
          type: "osm",
          id: item.place_id,
          display_name: item.display_name,
          lat: parseFloat(item.lat),
          lon: parseFloat(item.lon),
        }));

        setSearchResults([...matchedAreas, ...matchedLocalNodes, ...matchedOsm]);
        setShowDropdown(true);
      } catch {
        // Silently fallback if Nominatim rate limits
      } finally {
        setSearching(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [searchQuery, nodes, customAreas]);

  // Dismiss search dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  // Center and fly to a marked area
  const handleZoomToArea = (area) => {
    const centroid = calculateCentroid(area.coordinates);
    setSelectedArea(area);
    setSelectedNode(null);
    recordHistory({
      type: "area",
      id: area.area_id,
      name: area.name,
      subtitle: `${parseFloat(area.area_sq_km).toLocaleString()} km² · ${area.area_type}`,
      lat: centroid[0],
      lng: centroid[1],
      color: area.color,
    });

    const map = mapInstanceRef.current;
    if (map) {
      map.flyTo(centroid, 13, { duration: 1.5 });
    }
  };

  // Center and fly to a node
  const handleZoomToNode = (node) => {
    const lat = parseFloat(node.latitude);
    const lng = parseFloat(node.longitude);
    setSelectedNode(node);
    setSelectedArea(null);
    recordHistory({
      type: "node",
      id: node.node_id,
      name: node.name,
      subtitle: `${node.device_uid} · ${node.status}`,
      lat,
      lng,
      status: node.status,
    });

    const map = mapInstanceRef.current;
    if (map) {
      map.flyTo([lat, lng], 16, { duration: 1.5 });
    }
  };

  // Navigate & zoom in closely to selected search result
  const handleSelectLocation = (loc) => {
    setShowDropdown(false);
    const shortName = loc.display_name.split(",")[0];
    setSearchQuery(shortName);

    const map = mapInstanceRef.current;
    if (map) {
      const zoomLevel = loc.type === "node" ? 16 : loc.type === "area" ? 13 : 14;
      map.flyTo([loc.lat, loc.lon], zoomLevel, { duration: 1.5 });

      if (searchMarkerRef.current) {
        map.removeLayer(searchMarkerRef.current);
        searchMarkerRef.current = null;
      }

      if (loc.type === "node") {
        const found = nodes.find((n) => n.node_id === loc.id);
        if (found) handleZoomToNode(found);
      } else if (loc.type === "area") {
        const found = customAreas.find((a) => a.area_id === loc.id);
        if (found) handleZoomToArea(found);
      } else {
        searchMarkerRef.current = L.marker([loc.lat, loc.lon], {
          icon: L.divIcon({
            className: "custom-search-marker",
            html: `
              <div class="relative flex items-center justify-center animate-bounce" style="width: 34px; height: 34px;">
                <div class="flex items-center justify-center rounded-full shadow-2xl"
                     style="width: 30px; height: 30px; background: #0284c7; border: 2.5px solid #38bdf8; box-shadow: 0 0 18px rgba(56,189,248,0.9);">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                    <circle cx="12" cy="10" r="3"></circle>
                  </svg>
                </div>
              </div>
            `,
            iconSize: [34, 34],
            iconAnchor: [17, 30],
            popupAnchor: [0, -30],
          }),
        })
          .bindPopup(`
            <div style="font-family: sans-serif; min-width: 190px; color: #fff; padding: 4px;">
              <div style="font-size: 13px; font-weight: 800; color: #38bdf8; margin-bottom: 3px;">${shortName}</div>
              <div style="font-size: 11px; color: #94a3b8; line-height: 1.4;">${loc.display_name}</div>
              <div style="font-size: 10px; color: #a3e635; margin-top: 5px;">GPS: ${loc.lat.toFixed(4)}, ${loc.lon.toFixed(4)}</div>
            </div>
          `, { className: "deepgreen-leaflet-popup" })
          .addTo(map)
          .openPopup();
      }
    }
  };

  // Zoom to Current GPS Location
  const handleLocateMe = () => {
    if (!navigator.geolocation) {
      toast("Geolocation is not supported by your browser.", "error");
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const { latitude, longitude, accuracy } = pos.coords;
        const map = mapInstanceRef.current;
        if (map) {
          map.flyTo([latitude, longitude], 15, { duration: 1.5 });

          if (userLocMarkerRef.current) {
            map.removeLayer(userLocMarkerRef.current);
          }

          userLocMarkerRef.current = L.marker([latitude, longitude], {
            icon: L.divIcon({
              className: "custom-user-marker",
              html: `
                <div class="relative flex items-center justify-center" style="width: 32px; height: 32px;">
                  <span class="absolute -inset-2 rounded-full animate-ping opacity-75" style="background: #38bdf8;"></span>
                  <div class="relative flex items-center justify-center rounded-full shadow-2xl"
                       style="width: 24px; height: 24px; background: #0284c7; border: 2.5px solid #ffffff; box-shadow: 0 0 16px rgba(56,189,248,0.9);">
                    <div style="width: 7px; height: 7px; border-radius: 50%; background: #ffffff;"></div>
                  </div>
                </div>
              `,
              iconSize: [32, 32],
              iconAnchor: [16, 16],
              popupAnchor: [0, -18],
            }),
          })
            .bindPopup(`
              <div style="font-family: sans-serif; min-width: 170px; color: #fff; padding: 4px;">
                <div style="font-size: 13px; font-weight: 800; color: #38bdf8; margin-bottom: 2px;">Your Current Location</div>
                <div style="font-size: 11px; color: #94a3b8;">Coordinates: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}</div>
                <div style="font-size: 10px; color: #a3e635; margin-top: 4px;">Accuracy: ±${Math.round(accuracy)}m</div>
              </div>
            `, { className: "deepgreen-leaflet-popup" })
            .addTo(map)
            .openPopup();
        }
        toast("Centered and zoomed to your current location.");
      },
      (err) => {
        setLocating(false);
        toast(`Location error: ${err.message}`, "error");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Open Deploy Modal directly with default values & center coordinates
  const handleOpenDeployModal = () => {
    const map = mapInstanceRef.current;
    const center = map ? map.getCenter() : { lat: 22.5, lng: 79.5 };
    const autoUid = `DGN-NODE-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;

    setNodeForm({
      name: `Sensor Node ${nodes.length + 1}`,
      device_uid: autoUid,
      latitude: center.lat.toFixed(6),
      longitude: center.lng.toFixed(6),
      status: "ACTIVE",
      battery_level: "100",
      sensor_type: "ACOUSTIC_VISION",
      zone_id: "",
      custom_area_id: "",
      com_port: availableComPorts[0]?.port || "",
      baud_rate: "115200",
      camera_url: "",
      camera_stream_url: "",
      notes: "",
    });

    refreshComPorts();
    setShowDeployModal(true);
  };

  // Submit Deploy Node
  const handleDeploySubmit = async (e) => {
    e.preventDefault();
    if (!nodeForm.name || !nodeForm.latitude || !nodeForm.longitude) {
      toast("Name, Latitude, and Longitude are required.", "error");
      return;
    }

    setSubmittingNode(true);
    try {
      const res = await api.post("/admin/iot-nodes", {
        ...nodeForm,
        battery_level: parseInt(nodeForm.battery_level, 10) || 100,
        zone_id: nodeForm.zone_id ? parseInt(nodeForm.zone_id, 10) : null,
        custom_area_id: nodeForm.custom_area_id ? parseInt(nodeForm.custom_area_id, 10) : null,
        is_listening: Boolean(nodeForm.com_port),
      });

      const deployedNode = res.data?.node;
      if (deployedNode && nodeForm.com_port) {
        try {
          await updateNodeHardwareConfig(deployedNode.node_id, {
            com_port: nodeForm.com_port,
            baud_rate: parseInt(nodeForm.baud_rate, 10) || 115200,
            camera_url: nodeForm.camera_url,
            camera_stream_url: nodeForm.camera_stream_url,
            connect_serial: true,
          });
        } catch (hwErr) {
          console.warn("Auto-connect serial on deployment:", hwErr);
        }
      }

      toast("✅ IoT Node deployed successfully to sanctuary grid!", "success");
      setShowDeployModal(false);
      if (tempMarkerRef.current && mapInstanceRef.current) {
        mapInstanceRef.current.removeLayer(tempMarkerRef.current);
        tempMarkerRef.current = null;
      }
      setNodeForm({
        name: "",
        device_uid: "",
        latitude: "",
        longitude: "",
        status: "ACTIVE",
        battery_level: "100",
        sensor_type: "ACOUSTIC_VISION",
        zone_id: "",
        custom_area_id: "",
        com_port: "",
        baud_rate: "115200",
        camera_url: "",
        camera_stream_url: "",
        notes: "",
      });
      loadData(false);
    } catch (err) {
      toast(err.response?.data?.error || "Failed to deploy IoT node.", "error");
    } finally {
      setSubmittingNode(false);
    }
  };

  // Delete / Decommission Node
  const handleDeleteNode = async (node_id) => {
    if (!window.confirm("Decommission and remove this IoT node from the remote monitoring grid?")) return;
    try {
      await api.delete(`/admin/iot-nodes/${node_id}`);
      setNodes((prev) => prev.filter((n) => n.node_id !== node_id));
      if (selectedNode?.node_id === node_id) setSelectedNode(null);
      toast("IoT Node decommissioned.");
    } catch (err) {
      toast(err.response?.data?.error || "Failed to decommission IoT node.", "error");
    }
  };

  // Trigger Node Deployment inside a specific Custom Area
  const handleDeployInArea = (area) => {
    const centroid = calculateCentroid(area.coordinates);
    const autoUid = `DGN-NODE-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;

    setNodeForm({
      name: `${area.name} Perimeter Node`,
      device_uid: autoUid,
      latitude: centroid[0].toString(),
      longitude: centroid[1].toString(),
      status: "ACTIVE",
      battery_level: "100",
      sensor_type: "ACOUSTIC_VISION",
      zone_id: "",
      custom_area_id: area.area_id.toString(),
      notes: `Deployed in marked area: ${area.name}`,
    });

    setShowDeployModal(true);
  };

  // Submit Save Custom Area
  const handleSaveAreaSubmit = async (e) => {
    e.preventDefault();
    if (drawPoints.length < 3) {
      toast("At least 3 coordinates are required to form an area.", "error");
      return;
    }
    if (!areaForm.name.trim()) {
      toast("Area name is required.", "error");
      return;
    }

    const area_sq_km = calculatePolygonAreaSqKm(drawPoints);
    setSubmittingArea(true);

    try {
      const res = await api.post("/admin/custom-areas", {
        name: areaForm.name.trim(),
        area_type: areaForm.area_type,
        coordinates: drawPoints,
        area_sq_km,
        color: areaForm.color,
        climate: areaForm.climate,
        description: areaForm.description,
      });

      toast(`Custom area '${res.data.area.name}' (${area_sq_km.toLocaleString()} km²) marked and saved.`);
      setShowAreaModal(false);
      setDrawMode(false);
      setDrawPoints([]);
      setAreaForm({
        name: "",
        area_type: "CORE_SANCTUARY",
        color: "#22c55e",
        climate: "Tropical Moist Deciduous",
        description: "",
      });
      loadData();
    } catch (err) {
      toast(err.response?.data?.error || "Failed to save custom area.", "error");
    } finally {
      setSubmittingArea(false);
    }
  };

  // Delete Custom Area
  const handleDeleteArea = async (area_id) => {
    if (!window.confirm("Remove this custom marked forest/sanctuary area? Any deployed nodes will remain active.")) return;
    try {
      await api.delete(`/admin/custom-areas/${area_id}`);
      setCustomAreas((prev) => prev.filter((a) => a.area_id !== area_id));
      if (selectedArea?.area_id === area_id) setSelectedArea(null);
      toast("Custom marked area removed.");
    } catch (err) {
      toast(err.response?.data?.error || "Failed to delete custom area.", "error");
    }
  };

  // Live Drawing Stats
  const liveDrawArea = drawPoints.length >= 3 ? calculatePolygonAreaSqKm(drawPoints) : 0;
  const liveDrawPerimeter = drawPoints.length >= 2 ? calculatePerimeterKm(drawPoints) : 0;

  // Fleet Statistics
  const activeCount = nodes.filter((n) => n.status === "ACTIVE").length;
  const alertCount = nodes.filter((n) => n.status === "ALERT").length;

  return (
    <div className="relative flex flex-col gap-4">
      {/* ── Top Header & Stats Bar ── */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <Eyebrow>DeepGreen · Remote Sensing Infrastructure</Eyebrow>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-black uppercase tracking-tight text-white">
              IoT Telemetry & <span style={{ color: "#a3e635" }}>Surveillance Grid</span>
            </h2>
            <div className="flex items-center gap-1.5 rounded-full px-2.5 py-1" style={{ background: "rgba(163,230,53,0.1)", border: "1px solid rgba(163,230,53,0.2)" }}>
              <span className="h-2 w-2 rounded-full animate-ping" style={{ background: "#a3e635" }} />
              <span className="text-[10px] font-black uppercase tracking-wider text-lime-400">Live Grid</span>
            </div>
          </div>
          <p className="mt-1 text-xs text-white/40">
            OpenStreetMap geospatial monitoring with multi-spectral satellite imagery, sanctuary area marking, and edge IoT telemetry.
          </p>
        </div>

        {/* Quick Fleet Metrics */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: "rgba(13,26,15,0.70)", border: "1px solid rgba(163,230,53,0.12)" }}>
            <Radio size={14} className="text-lime-400" />
            <span className="text-xs text-white/50">Nodes:</span>
            <span className="text-sm font-black text-white">{nodes.length}</span>
          </div>

          <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: "rgba(13,26,15,0.70)", border: "1px solid rgba(34,197,94,0.2)" }}>
            <Shapes size={14} className="text-emerald-400" />
            <span className="text-xs text-white/50">Marked Areas:</span>
            <span className="text-sm font-black text-emerald-400">{customAreas.length}</span>
          </div>

          <div className="flex items-center gap-1.5 rounded-xl px-3 py-2" style={{ background: "rgba(13,26,15,0.70)", border: "1px solid rgba(74,222,128,0.2)" }}>
            <span className="h-2 w-2 rounded-full" style={{ background: "#4ade80" }} />
            <span className="text-xs font-bold text-emerald-400">{activeCount} Active</span>
          </div>

          {alertCount > 0 && (
            <div className="flex items-center gap-1.5 rounded-xl px-3 py-2" style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)" }}>
              <AlertTriangle size={13} className="text-red-400 animate-bounce" />
              <span className="text-xs font-bold text-red-400">{alertCount} Alerts</span>
            </div>
          )}

          <button
            onClick={loadData}
            title="Refresh Fleet Data"
            className="flex h-9 w-9 items-center justify-center rounded-xl transition hover:bg-white/10"
            style={{ background: "rgba(13,26,15,0.70)", border: "1px solid rgba(163,230,53,0.12)", color: "#a3e635" }}
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>

          {/* Telegram Security Bot Link */}
          <a
            href="https://t.me/DeepGreen_TheBot"
            target="_blank"
            rel="noopener noreferrer"
            title="Open Telegram Security Chatbot @DeepGreen_TheBot"
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition hover:bg-sky-500/25 cursor-pointer shadow-sm"
            style={{ background: "rgba(14,165,233,0.15)", border: "1px solid rgba(14,165,233,0.3)", color: "#38bdf8" }}
          >
            <Send size={13} className="text-sky-400" />
            <span>@DeepGreen_TheBot</span>
          </a>
        </div>
      </div>

      {/* ── Main Layout: Left Control Sidebar + Right Interactive Map ── */}
      <div className="flex flex-col lg:flex-row gap-4 items-stretch">
        {/* ── LEFT SIDEBAR: Controls, Marked Areas List, Nodes, & Visited History ── */}
        <div
          className="w-full lg:w-96 flex flex-col shrink-0 rounded-2xl p-4 gap-4"
          style={{
            background: "linear-gradient(145deg, rgba(13,26,15,0.92) 0%, rgba(9,18,10,0.97) 100%)",
            border: "1px solid rgba(163,230,53,0.15)",
            boxShadow: "0 10px 40px rgba(0,0,0,0.5)",
          }}
        >
          {/* Action Tools Header */}
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/40 mb-2">Fleet Operations</p>
            <div className="grid grid-cols-2 gap-2">
              {/* Mark Area Button */}
              <button
                onClick={() => {
                  setDrawMode((prev) => {
                    if (!prev) setDeployMode(false);
                    setDrawPoints([]);
                    return !prev;
                  });
                }}
                className={`flex items-center justify-center gap-2 rounded-xl py-2.5 px-3 text-xs font-black uppercase tracking-wider transition ${
                  drawMode
                    ? "bg-emerald-500 text-black shadow-lg shadow-emerald-500/30"
                    : "bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/30"
                }`}
              >
                <PenTool size={14} />
                {drawMode ? "Drawing..." : "Mark Area"}
              </button>

              {/* Deploy Node Button */}
              <button
                onClick={handleOpenDeployModal}
                title="Deploy a new IoT sensing node"
                className="flex items-center justify-center gap-2 rounded-xl py-2.5 px-3 text-xs font-black uppercase tracking-wider transition bg-lime-400 text-black hover:bg-lime-300 shadow-md hover:scale-[1.02] cursor-pointer"
              >
                <Plus size={14} />
                Deploy Node
              </button>
            </div>
          </div>

          {/* Map Layer Switcher & Boundaries in Sidebar */}
          <div className="flex flex-col gap-2 pt-2 border-t border-white/5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">Imagery Layer</span>
              <button
                onClick={() => setShowSanctuaryBorders((prev) => !prev)}
                className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider transition"
                style={{ color: showSanctuaryBorders ? "#a3e635" : "rgba(255,255,255,0.3)" }}
              >
                <Shield size={12} /> Borders {showSanctuaryBorders ? "ON" : "OFF"}
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1 rounded-xl p-1" style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.06)" }}>
              {Object.entries(TILE_PROVIDERS).map(([key, provider]) => (
                <button
                  key={key}
                  onClick={() => setActiveLayer(key)}
                  className={`rounded-lg py-1.5 text-[11px] font-bold transition text-center ${
                    activeLayer === key
                      ? "bg-lime-400 text-black shadow-sm"
                      : "text-white/50 hover:text-white"
                  }`}
                >
                  {provider.name}
                </button>
              ))}
            </div>
          </div>

          {/* Sidebar Tab Switcher */}
          <div className="flex rounded-xl p-1 bg-black/40 border border-white/5">
            <button
              onClick={() => setSidebarTab("areas")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-bold rounded-lg transition ${
                sidebarTab === "areas"
                  ? "bg-white/10 text-lime-400"
                  : "text-white/40 hover:text-white"
              }`}
            >
              <Shapes size={13} />
              Areas ({customAreas.length})
            </button>
            <button
              onClick={() => setSidebarTab("nodes")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-bold rounded-lg transition ${
                sidebarTab === "nodes"
                  ? "bg-white/10 text-lime-400"
                  : "text-white/40 hover:text-white"
              }`}
            >
              <Radio size={13} />
              Nodes ({nodes.length})
            </button>
            <button
              onClick={() => setSidebarTab("history")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-bold rounded-lg transition ${
                sidebarTab === "history"
                  ? "bg-white/10 text-lime-400"
                  : "text-white/40 hover:text-white"
              }`}
            >
              <History size={13} />
              History ({visitedHistory.length})
            </button>
          </div>

          {/* Sidebar Content List Area */}
          <div className="flex-1 overflow-y-auto max-h-[500px] flex flex-col gap-2 pr-1 custom-scrollbar">
            {/* Tab 1: Marked Areas */}
            {sidebarTab === "areas" && (
              <>
                {customAreas.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center text-white/30 text-xs">
                    <Shapes size={32} className="mb-2 text-white/20" />
                    <p className="font-semibold text-white/50">No Marked Areas Yet</p>
                    <p className="text-[11px] mt-1">Click "Mark Area" above to draw custom forest zones on the map.</p>
                  </div>
                ) : (
                  customAreas.map((area) => {
                    const areaNodes = nodes.filter((n) => n.custom_area_id === area.area_id);
                    const hasAlert = areaNodes.some((n) => n.status === "ALERT");
                    const isSelected = selectedArea?.area_id === area.area_id;

                    return (
                      <div
                        key={area.area_id}
                        className={`group rounded-xl p-3 border transition flex flex-col gap-2 ${
                          isSelected
                            ? "bg-white/10 border-lime-400/50 shadow-lg"
                            : "bg-white/[0.02] border-white/5 hover:bg-white/[0.06] hover:border-white/10"
                        }`}
                      >
                        <div
                          onClick={() => handleZoomToArea(area)}
                          className="flex items-start justify-between cursor-pointer"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="h-3 w-3 rounded-full shrink-0"
                              style={{ background: area.color || "#22c55e" }}
                            />
                            <div>
                              <h4 className="text-xs font-black text-white group-hover:text-lime-300 transition">
                                {area.name}
                              </h4>
                              <p className="text-[10px] text-white/40">
                                {area.area_type.replace(/_/g, " ")} · <strong className="text-lime-400">{parseFloat(area.area_sq_km).toLocaleString()} km²</strong>
                              </p>
                            </div>
                          </div>
                          <ChevronRight size={14} className="text-white/30 group-hover:text-white transition" />
                        </div>

                        {/* Status badges & Actions */}
                        <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[11px]">
                          <span className="text-white/50 flex items-center gap-1">
                            <Radio size={11} className="text-lime-400" /> {areaNodes.length} Sensors
                            {hasAlert && (
                              <span className="flex items-center gap-0.5 text-red-400 font-bold ml-1 animate-pulse">
                                <AlertTriangle size={10} /> Alert!
                              </span>
                            )}
                          </span>

                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeployInArea(area);
                              }}
                              title="Deploy Node in this Area"
                              className="px-2 py-0.5 rounded text-[10px] font-bold bg-lime-400/10 text-lime-400 border border-lime-400/20 hover:bg-lime-400 hover:text-black transition"
                            >
                              + Deploy Node
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteArea(area.area_id);
                              }}
                              title="Delete Area"
                              className="p-1 rounded text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </>
            )}

            {/* Tab 2: IoT Fleet Nodes */}
            {sidebarTab === "nodes" && (
              <>
                {nodes.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center text-white/30 text-xs">
                    <Radio size={32} className="mb-2 text-white/20" />
                    <p className="font-semibold text-white/50">No Nodes Deployed</p>
                    <p className="text-[11px] mt-1">Click "Deploy Node" to drop sensors on the map.</p>
                  </div>
                ) : (
                  nodes.map((node) => {
                    const statusColor = NODE_STATUS_COLOR[node.status] || "#4ade80";
                    const isSelected = selectedNode?.node_id === node.node_id;

                    return (
                      <div
                        key={node.node_id}
                        onClick={() => handleZoomToNode(node)}
                        className={`group rounded-xl p-3 border transition flex flex-col gap-1.5 cursor-pointer ${
                          node.status === "ALERT"
                            ? "bg-red-500/10 border-red-500/40 shadow-lg shadow-red-500/10"
                            : isSelected
                            ? "bg-white/10 border-lime-400/50"
                            : "bg-white/[0.02] border-white/5 hover:bg-white/[0.06]"
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <Radio size={13} style={{ color: statusColor }} />
                              <h4 className="text-xs font-black text-white group-hover:text-lime-300 transition">
                                {node.name}
                              </h4>
                            </div>
                            <p className="text-[10px] text-white/40 font-mono mt-0.5">{node.device_uid}</p>
                          </div>
                          <Badge label={node.status} color={statusColor} />
                        </div>

                        <div className="flex items-center justify-between text-[10px] text-white/50 pt-1 border-t border-white/5">
                          <span className="flex items-center gap-1">
                            <Battery size={12} className="text-lime-400" /> {node.battery_level}%
                          </span>
                          {node.custom_area && (
                            <span className="truncate max-w-[140px]" style={{ color: node.custom_area.color }}>
                              {node.custom_area.name}
                            </span>
                          )}
                        </div>

                        {node.status === "ALERT" && (
                          <div className="flex items-center gap-1 text-[10px] font-bold text-red-400 bg-red-500/10 rounded p-1 border border-red-500/20">
                            <AlertCircle size={12} /> Anomaly / Disturbance Triggered
                          </div>
                        )}

                        {/* Memory & Quick Actions */}
                        <div className="flex items-center justify-between pt-1.5 border-t border-white/5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenNodeMemory(node);
                            }}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold text-lime-400 bg-lime-400/10 hover:bg-lime-400/20 border border-lime-400/20 transition"
                          >
                            <Activity size={12} />
                            <span>Memory (History)</span>
                            {node._count?.trigger_events > 0 && (
                              <span className="ml-0.5 rounded-full px-1.5 py-0.2 text-[9px] bg-lime-400 text-black font-black">
                                {node._count.trigger_events}
                              </span>
                            )}
                          </button>

                          <span className="text-[10px] text-white/40 group-hover:text-white flex items-center gap-0.5 transition">
                            Locate <ChevronRight size={11} />
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </>
            )}

            {/* Tab 3: Visited History */}
            {sidebarTab === "history" && (
              <>
                {visitedHistory.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center text-white/30 text-xs">
                    <History size={32} className="mb-2 text-white/20" />
                    <p className="font-semibold text-white/50">No Inspection History</p>
                    <p className="text-[11px] mt-1">Click on any marked area or node to track your inspection trail.</p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between pb-1">
                      <span className="text-[10px] uppercase font-bold text-white/40">Recent Activity</span>
                      <button
                        onClick={() => setVisitedHistory([])}
                        className="text-[10px] text-white/40 hover:text-white"
                      >
                        Clear
                      </button>
                    </div>

                    {visitedHistory.map((item, index) => (
                      <div
                        key={`${item.type}-${item.id}-${index}`}
                        onClick={() => {
                          const map = mapInstanceRef.current;
                          if (map) {
                            map.flyTo([item.lat, item.lng], item.type === "node" ? 16 : 13, { duration: 1.5 });
                          }
                          if (item.type === "node") {
                            const found = nodes.find((n) => n.node_id === item.id);
                            if (found) setSelectedNode(found);
                          } else {
                            const found = customAreas.find((a) => a.area_id === item.id);
                            if (found) setSelectedArea(found);
                          }
                        }}
                        className="group flex items-center justify-between p-2.5 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.06] cursor-pointer transition"
                      >
                        <div className="flex items-center gap-2 truncate">
                          {item.type === "node" ? (
                            <Radio size={13} className="text-lime-400 shrink-0" />
                          ) : (
                            <Shapes size={13} className="shrink-0" style={{ color: item.color || "#22c55e" }} />
                          )}
                          <div className="truncate">
                            <h4 className="text-xs font-bold text-white group-hover:text-lime-300 truncate">
                              {item.name}
                            </h4>
                            <p className="text-[10px] text-white/40 truncate">{item.subtitle}</p>
                          </div>
                        </div>
                        <span className="text-[9px] text-white/30 shrink-0 flex items-center gap-1 font-mono">
                          <Clock size={10} /> {item.visitedAt}
                        </span>
                      </div>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── RIGHT MAIN MAP AREA ── */}
        <div className="flex-1 flex flex-col gap-3 min-w-0">
          {/* Top Search Bar with Geolocation */}
          <div className="relative z-[1000] flex flex-wrap items-center justify-between gap-3">
            <div ref={searchContainerRef} className="relative z-[1010] flex items-center gap-2 w-full max-w-lg">
              <div
                className="flex flex-1 items-center rounded-xl px-3 py-2"
                style={{
                  background: "rgba(13,26,15,0.92)",
                  border: "1px solid rgba(163,230,53,0.22)",
                  boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
                }}
              >
                <Search size={15} className="mr-2 shrink-0 text-white/40" />
                <input
                  type="text"
                  value={searchQuery}
                  onFocus={() => { if (searchResults.length > 0) setShowDropdown(true); }}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search places (Corbett, Delhi, Amazon), marked areas, or Node UID..."
                  className="w-full bg-transparent text-xs text-white placeholder-white/30 outline-none"
                />
                {searching && <RefreshCw size={12} className="animate-spin text-lime-400 ml-2 shrink-0" />}
                {searchQuery && (
                  <button onClick={() => { setSearchQuery(""); setShowDropdown(false); }} className="text-white/40 hover:text-white ml-1.5 shrink-0">
                    <X size={13} />
                  </button>
                )}
              </div>

              {/* Zoom to Current Location Button */}
              <button
                onClick={handleLocateMe}
                disabled={locating}
                title="Zoom to My Current GPS Location"
                className="flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-xs font-bold transition hover:bg-white/10 shrink-0"
                style={{
                  background: "rgba(13,26,15,0.92)",
                  border: "1px solid rgba(56,189,248,0.35)",
                  color: "#38bdf8",
                  boxShadow: "0 4px 15px rgba(2,132,199,0.2)",
                }}
              >
                {locating ? (
                  <RefreshCw size={14} className="animate-spin text-sky-400" />
                ) : (
                  <Navigation size={14} className="text-sky-400" />
                )}
                <span>Locate Me</span>
              </button>

              {/* Autocomplete Dropdown (z-[1050]) */}
              {showDropdown && searchResults.length > 0 && (
                <div
                  className="absolute left-0 right-0 top-full mt-1.5 z-[1050] max-h-72 overflow-y-auto rounded-xl p-1 shadow-2xl backdrop-blur-md"
                  style={{ background: "rgba(9,18,10,0.98)", border: "1px solid rgba(163,230,53,0.3)", boxShadow: "0 10px 40px rgba(0,0,0,0.9)" }}
                >
                  {searchResults.map((res) => (
                    <button
                      key={`${res.type}-${res.id}`}
                      onClick={() => handleSelectLocation(res)}
                      className="flex w-full items-start gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs transition hover:bg-white/10 border-b border-white/5 last:border-0"
                    >
                      {res.type === "area" ? (
                        <Shapes size={14} className="mt-0.5 shrink-0" style={{ color: res.color || "#22c55e" }} />
                      ) : res.type === "node" ? (
                        <Radio size={14} className="mt-0.5 shrink-0 text-lime-400" />
                      ) : (
                        <MapPin size={14} className="mt-0.5 shrink-0 text-sky-400" />
                      )}
                      <div className="truncate">
                        <p className="font-semibold text-white truncate">{res.display_name}</p>
                        <p className="text-[10px] text-white/40">
                          {res.type === "area"
                            ? `Custom Marked Area · ${parseFloat(res.area_sq_km).toLocaleString()} km²`
                            : res.type === "node"
                            ? `Deployed IoT Node · Status: ${res.status}`
                            : "OpenStreetMap Global Geocoding · Click to Zoom"}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Interactive Draw Area Active HUD Bar */}
          {drawMode && (
            <div
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl px-5 py-3 animate-fadeIn"
              style={{
                background: "linear-gradient(90deg, rgba(16,185,129,0.25) 0%, rgba(9,18,10,0.98) 100%)",
                border: "1.5px solid rgba(16,185,129,0.5)",
                boxShadow: "0 10px 30px rgba(0,0,0,0.7)",
              }}
            >
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="flex h-3 w-3 rounded-full bg-emerald-400 animate-ping" />
                  <span className="text-xs font-black uppercase tracking-wider text-emerald-300">
                    Area Marking Mode Active
                  </span>
                </div>
                <div className="h-4 w-px bg-white/10 hidden sm:block" />
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-white/60">
                    Points: <strong className="text-white">{drawPoints.length}</strong>
                  </span>
                  <span className="text-white/60">
                    Area: <strong className="text-lime-300">{liveDrawArea.toLocaleString()} km²</strong>
                  </span>
                  <span className="text-white/60">
                    Perimeter: <strong className="text-sky-300">{liveDrawPerimeter.toLocaleString()} km</strong>
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {drawPoints.length > 0 && (
                  <button
                    onClick={() => setDrawPoints((prev) => prev.slice(0, -1))}
                    className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold text-white/70 hover:bg-white/10"
                  >
                    <Undo2 size={13} /> Undo
                  </button>
                )}

                <button
                  onClick={() => {
                    if (drawPoints.length < 3) {
                      toast("Click at least 3 points on the map to define an area.", "error");
                      return;
                    }
                    setShowAreaModal(true);
                  }}
                  disabled={drawPoints.length < 3}
                  className={`flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-black uppercase tracking-wider transition ${
                    drawPoints.length >= 3
                      ? "bg-lime-400 text-black hover:bg-lime-300 shadow-md"
                      : "bg-white/10 text-white/30 cursor-not-allowed"
                  }`}
                >
                  <Check size={14} /> Complete & Mark Area
                </button>

                <button
                  onClick={() => {
                    setDrawMode(false);
                    setDrawPoints([]);
                  }}
                  className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold text-red-400 hover:bg-red-500/10"
                >
                  <X size={13} /> Cancel
                </button>
              </div>
            </div>
          )}

          {/* Deploy Mode Instruction Banner */}
          {deployMode && (
            <div
              className="flex items-center justify-between rounded-xl px-4 py-2.5 animate-fadeIn"
              style={{ background: "rgba(163,230,53,0.12)", border: "1px solid rgba(163,230,53,0.3)" }}
            >
              <div className="flex items-center gap-2">
                <Crosshair size={16} className="text-lime-400 animate-spin" />
                <span className="text-xs font-semibold text-lime-300">
                  Interactive Deployment Active: Click anywhere on the map to set the IoT node coordinates.
                </span>
              </div>
              <button
                onClick={() => setDeployMode(false)}
                className="text-xs font-bold text-white/50 hover:text-white"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* ── Main Leaflet Map Display (z-0) ── */}
          <div
            className="relative z-0 h-[640px] w-full overflow-hidden rounded-2xl shadow-2xl"
            style={{
              border: "1px solid rgba(163,230,53,0.18)",
              cursor: drawMode ? "crosshair" : deployMode ? "crosshair" : "grab",
            }}
          >
            <div ref={mapContainerRef} className="h-full w-full" />

            {/* Selected Custom Area Drawer (floating on bottom left of map) */}
            {selectedArea && (
              <div
                className="absolute bottom-4 left-4 z-[500] w-84 rounded-xl p-4 shadow-2xl backdrop-blur-md animate-fadeIn"
                style={{
                  background: "rgba(9,18,10,0.96)",
                  border: `1.5px solid ${selectedArea.color || "#22c55e"}66`,
                  boxShadow: `0 10px 40px rgba(0,0,0,0.8)`,
                }}
              >
                <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full" style={{ background: selectedArea.color || "#22c55e" }} />
                    <h4 className="text-sm font-black text-white truncate">{selectedArea.name}</h4>
                  </div>
                  <button onClick={() => setSelectedArea(null)} className="text-white/40 hover:text-white">
                    <X size={14} />
                  </button>
                </div>

                <div className="mt-2.5 flex flex-col gap-1.5 text-xs text-white/70">
                  <div className="flex justify-between items-center">
                    <span>Category:</span>
                    <span
                      className="rounded-full px-2 py-0.5 text-[9px] font-black uppercase"
                      style={{ background: `${selectedArea.color || "#22c55e"}22`, color: selectedArea.color || "#22c55e", border: `1px solid ${selectedArea.color || "#22c55e"}44` }}
                    >
                      {selectedArea.area_type.replace(/_/g, " ")}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total Surface Area:</span>
                    <span className="font-bold text-lime-300">{parseFloat(selectedArea.area_sq_km).toLocaleString()} km²</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Centroid Coordinates:</span>
                    <span className="font-mono text-[11px] text-white/90">
                      {calculateCentroid(selectedArea.coordinates).join(", ")}
                    </span>
                  </div>
                  {selectedArea.climate && (
                    <div className="flex justify-between">
                      <span>Climate / Biome:</span>
                      <span className="text-white">{selectedArea.climate}</span>
                    </div>
                  )}
                  {selectedArea.description && (
                    <div className="mt-1 rounded p-1.5 text-[11px] text-white/60 italic" style={{ background: "rgba(255,255,255,0.03)" }}>
                      "{selectedArea.description}"
                    </div>
                  )}

                  {/* Associated Nodes in this Area */}
                  <div className="mt-1 pt-1.5 border-t border-white/5 flex justify-between items-center text-[11px]">
                    <span>Deployed Nodes:</span>
                    <span className="font-bold text-emerald-400">
                      {nodes.filter((n) => n.custom_area_id === selectedArea.area_id).length} Active Sensors
                    </span>
                  </div>
                </div>

                <div className="mt-3 flex flex-col gap-2 pt-2 border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
                  <button
                    onClick={() => handleDeployInArea(selectedArea)}
                    className="flex items-center justify-center gap-1.5 w-full rounded-lg py-1.5 text-xs font-black uppercase tracking-wider text-black bg-lime-400 hover:bg-lime-300 transition shadow-md"
                  >
                    <Plus size={13} /> Deploy IoT Node in this Area
                  </button>
                  <button
                    onClick={() => handleDeleteArea(selectedArea.area_id)}
                    className="flex items-center justify-center gap-1.5 w-full rounded-lg py-1.5 text-xs font-bold text-red-400 transition hover:bg-red-500/10 border border-red-500/20"
                  >
                    <Trash2 size={13} /> Delete Marked Area
                  </button>
                </div>
              </div>
            )}

            {/* Selected Node Quick Info Drawer */}
            {selectedNode && (
              <div
                className="absolute bottom-4 left-4 z-[500] w-80 rounded-xl p-4 shadow-2xl backdrop-blur-md animate-fadeIn"
                style={{
                  background: "rgba(9,18,10,0.95)",
                  border: "1px solid rgba(163,230,53,0.25)",
                }}
              >
                <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
                  <div className="flex items-center gap-2">
                    <Radio size={15} style={{ color: NODE_STATUS_COLOR[selectedNode.status] }} />
                    <h4 className="text-sm font-black text-white">{selectedNode.name}</h4>
                  </div>
                  <button onClick={() => setSelectedNode(null)} className="text-white/40 hover:text-white">
                    <X size={14} />
                  </button>
                </div>

                <div className="mt-2.5 flex flex-col gap-1.5 text-xs text-white/60">
                  <div className="flex justify-between">
                    <span>Device UID:</span>
                    <code className="text-lime-300 font-mono text-[11px]">{selectedNode.device_uid}</code>
                  </div>
                  <div className="flex justify-between">
                    <span>Status:</span>
                    <Badge label={selectedNode.status} color={NODE_STATUS_COLOR[selectedNode.status]} />
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Battery Level:</span>
                    <span className="font-bold text-white flex items-center gap-1">
                      <Battery size={13} className="text-lime-400" /> {selectedNode.battery_level}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Sensors:</span>
                    <span className="text-white">{selectedNode.sensor_type || "Acoustic + Optical"}</span>
                  </div>
                  {selectedNode.custom_area && (
                    <div className="flex justify-between">
                      <span>Marked Area:</span>
                      <span className="font-bold" style={{ color: selectedNode.custom_area.color }}>
                        {selectedNode.custom_area.name}
                      </span>
                    </div>
                  )}
                  {selectedNode.zone && (
                    <div className="flex justify-between">
                      <span>Sanctuary Zone:</span>
                      <span className="text-white">{selectedNode.zone.name}</span>
                    </div>
                  )}
                  {selectedNode.notes && (
                    <div className="mt-1 rounded p-1.5 text-[11px] text-white/50 italic" style={{ background: "rgba(255,255,255,0.03)" }}>
                      "{selectedNode.notes}"
                    </div>
                  )}

                  {/* Hardware Interface & Dedicated Port Updater */}
                  <div className="mt-2 pt-2 border-t border-white/10 flex flex-col gap-2 text-[11px]">
                    {/* Inline Quick Port Updater */}
                    <div className="flex flex-col gap-1.5 p-2 rounded-xl bg-white/[0.03] border border-white/10">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-lime-400 flex items-center gap-1">
                          <Usb size={11} /> Serial COM Port Assignment
                        </span>
                        <button
                          type="button"
                          onClick={refreshComPorts}
                          title="Detect physically plugged USB ports"
                          className="p-1 rounded hover:bg-white/10 text-white/50 hover:text-white transition"
                        >
                          <RefreshCw size={10} />
                        </button>
                      </div>

                      <div className="flex gap-1.5 items-center">
                        <input
                          list="drawer-com-port-list"
                          value={inlinePortValue}
                          onChange={(e) => setInlinePortValue(e.target.value)}
                          placeholder="e.g. COM3 or COM6"
                          className="flex-1 min-w-0 rounded-lg px-2.5 py-1 text-xs text-white placeholder-white/20 outline-none"
                          style={{ ...inputStyle, color: "#ffffff", padding: "5px 8px" }}
                        />
                        <datalist id="drawer-com-port-list">
                          {availableComPorts.map((p) => (
                            <option key={p.port} value={p.port}>
                              {p.port} - {p.description}
                            </option>
                          ))}
                        </datalist>
                        <button
                          type="button"
                          onClick={handleQuickUpdatePort}
                          disabled={updatingInlinePort}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-lime-400 hover:bg-lime-300 text-black transition disabled:opacity-50 whitespace-nowrap shadow flex items-center gap-1 cursor-pointer"
                        >
                          {updatingInlinePort ? "Saving..." : "Update Port"}
                        </button>
                      </div>
                    </div>

                    {/* Listener Bridge status & connect toggle */}
                    {selectedNode.com_port && (
                      <div className="flex items-center justify-between px-1">
                        <span className="text-white/60 flex items-center gap-1.5">
                          <span className={`h-2 w-2 rounded-full ${selectedNode.is_listening ? "bg-emerald-400 animate-pulse" : "bg-red-400"}`} />
                          Listener Bridge ({selectedNode.com_port}):
                        </span>
                        <button
                          type="button"
                          onClick={() => handleToggleCom(selectedNode)}
                          disabled={togglingCom}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold transition ${
                            selectedNode.is_listening
                              ? "bg-red-500/20 text-red-300 hover:bg-red-500/30 border border-red-500/30"
                              : "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30"
                          } disabled:opacity-40`}
                        >
                          {togglingCom ? "Toggling..." : selectedNode.is_listening ? "Disconnect" : "Connect"}
                        </button>
                      </div>
                    )}

                    <div className="flex items-center justify-between px-1">
                      <span className="flex items-center gap-1 text-white/70">
                        <Camera size={12} className="text-purple-400" /> Device 2 (Camera):
                      </span>
                      <span className="font-mono text-[10px] text-purple-300 truncate max-w-[140px]">
                        {selectedNode.camera_url ? "ESP32-CAM Ready" : "Unassigned"}
                      </span>
                    </div>

                    {/* Quick Config & Diagnostic Tools */}
                    <div className="flex items-center gap-1.5 pt-1.5 border-t border-white/5">
                      <button
                        type="button"
                        onClick={() => handleOpenHardwareConfig(selectedNode)}
                        className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg text-[10px] font-bold bg-white/5 hover:bg-white/10 text-white/80 border border-white/10 transition"
                      >
                        <Settings size={11} className="text-lime-400" /> Edit COM / Cam
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenLogs(selectedNode)}
                        className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg text-[10px] font-bold bg-white/5 hover:bg-white/10 text-white/80 border border-white/10 transition"
                      >
                        <Terminal size={11} className="text-cyan-400" /> Hardware Log
                      </button>
                    </div>
                  </div>
                </div>

                {/* On-Demand Hardware Action Toolbar */}
                <div className="mt-3 pt-2 border-t border-white/10 flex flex-col gap-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-lime-400">
                    On-Demand Edge Hardware Controls
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleTriggerAudio(selectedNode)}
                      disabled={triggeringAudio}
                      className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl text-[11px] font-bold bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25 border border-cyan-500/30 transition disabled:opacity-50"
                    >
                      <Mic size={13} className={triggeringAudio ? "animate-spin" : ""} />
                      {triggeringAudio ? (audioCountdown > 0 ? `Recording (${audioCountdown}s)...` : "Analyzing...") : "Record 5s Audio"}
                    </button>

                    <button
                      onClick={() => handleTriggerSnapshot(selectedNode)}
                      disabled={triggeringPhoto || !selectedNode.camera_url}
                      className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl text-[11px] font-bold bg-purple-500/15 text-purple-300 hover:bg-purple-500/25 border border-purple-500/30 transition disabled:opacity-50"
                    >
                      <Camera size={13} className={triggeringPhoto ? "animate-spin" : ""} />
                      {triggeringPhoto ? "Capturing & AI..." : "Capture Photo"}
                    </button>
                  </div>

                  <button
                    onClick={() => setLiveCameraNode(selectedNode)}
                    className="flex items-center justify-center gap-1.5 w-full py-2 px-3 rounded-xl text-[11px] font-bold bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 border border-emerald-500/30 transition"
                  >
                    <Video size={13} className="text-emerald-400" />
                    Open Live Video Feed (ESP32-CAM)
                  </button>

                  <button
                    onClick={() => handleOpenNodeMemory(selectedNode)}
                    className="flex items-center justify-center gap-2 w-full rounded-xl py-2 px-3 text-xs font-black text-black bg-lime-400 hover:bg-lime-300 transition shadow-lg shadow-lime-500/20"
                  >
                    <Activity size={14} /> View Node Memory & Trigger Graph
                  </button>

                  <button
                    onClick={() => handleDeleteNode(selectedNode.node_id)}
                    className="flex items-center justify-center gap-1.5 w-full rounded-lg py-1.5 text-xs font-bold text-red-400 transition hover:bg-red-500/10 border border-red-500/20"
                  >
                    <Trash2 size={13} /> Decommission Node
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Save Custom Area Modal (High Z-Index & Crisp Text) ── */}
      {showAreaModal && (
        <Modal title="Register & Mark Sanctuary Area" onClose={() => setShowAreaModal(false)}>
          <form onSubmit={handleSaveAreaSubmit} className="flex flex-col gap-3">
            {/* Computed Geometry Preview */}
            <div
              className="grid grid-cols-3 gap-2 rounded-xl p-3"
              style={{ background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.35)" }}
            >
              <div>
                <p className="text-[10px] font-bold uppercase text-emerald-400">Total Area</p>
                <p className="text-base font-black text-white">{liveDrawArea.toLocaleString()} km²</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-sky-400">Perimeter</p>
                <p className="text-base font-black text-white">{liveDrawPerimeter.toLocaleString()} km</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-lime-400">Boundary Points</p>
                <p className="text-base font-black text-white">{drawPoints.length} Vertices</p>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-lime-300/80">Area / Forest Name</label>
              <Inp
                value={areaForm.name}
                onChange={(e) => setAreaForm({ ...areaForm, name: e.target.value })}
                placeholder="e.g. Corbett North-West Bio-Corridor Sector 4"
                style={{ ...inputStyle, color: "#ffffff", fontWeight: "600" }}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-lime-300/80">Classification Type</label>
                <Sel
                  value={areaForm.area_type}
                  onChange={(e) => setAreaForm({ ...areaForm, area_type: e.target.value })}
                  style={{ ...inputStyle, color: "#ffffff", background: "#0d1a0f" }}
                >
                  <option value="CORE_SANCTUARY" style={{ background: "#0d1a0f", color: "#ffffff" }}>Core Sanctuary Reserve</option>
                  <option value="BUFFER_ZONE" style={{ background: "#0d1a0f", color: "#ffffff" }}>Buffer Conservation Zone</option>
                  <option value="RESERVE_FOREST" style={{ background: "#0d1a0f", color: "#ffffff" }}>Reserve Forest Tract</option>
                  <option value="WILDLIFE_CORRIDOR" style={{ background: "#0d1a0f", color: "#ffffff" }}>Wildlife Migration Corridor</option>
                  <option value="WETLAND_PRESERVE" style={{ background: "#0d1a0f", color: "#ffffff" }}>Wetland & Floodplain Preserve</option>
                  <option value="BIOSPHERE_SECTOR" style={{ background: "#0d1a0f", color: "#ffffff" }}>Biosphere Protection Sector</option>
                </Sel>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-lime-300/80">Climate / Ecology</label>
                <Inp
                  value={areaForm.climate}
                  onChange={(e) => setAreaForm({ ...areaForm, climate: e.target.value })}
                  placeholder="Tropical Moist Deciduous"
                  style={{ ...inputStyle, color: "#ffffff" }}
                />
              </div>
            </div>

            {/* Color Palette Selector */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-lime-300/80">Boundary & Fill Accent</label>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {AREA_COLOR_PALETTE.map((pal) => (
                  <button
                    key={pal.hex}
                    type="button"
                    onClick={() => setAreaForm({ ...areaForm, color: pal.hex })}
                    className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                      areaForm.color === pal.hex
                        ? "border-2 border-white shadow-lg text-white"
                        : "border border-white/10 text-white/50 hover:text-white"
                    }`}
                    style={{ background: `${pal.hex}25` }}
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: pal.hex }} />
                    {pal.name}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-lime-300/80">Operational Description & Notes</label>
              <textarea
                value={areaForm.description}
                onChange={(e) => setAreaForm({ ...areaForm, description: e.target.value })}
                rows={2}
                placeholder="High density tiger territory, acoustic sensors deployed along northern ridge..."
                className="w-full rounded-xl p-3 text-xs text-white placeholder-white/20 outline-none"
                style={{ ...inputStyle, color: "#ffffff" }}
              />
            </div>

            <div className="mt-3 flex justify-end gap-2 border-t border-white/10 pt-3">
              <button
                type="button"
                onClick={() => setShowAreaModal(false)}
                className="rounded-xl px-4 py-2 text-xs font-bold text-white/50 hover:text-white transition"
              >
                Cancel
              </button>
              <SubmitButton
                submitting={submittingArea}
                label="Save & Mark Area"
                loadingLabel="Saving Area..."
              >
                Save & Mark Area
              </SubmitButton>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Deploy IoT Node Modal ── */}
      {showDeployModal && (
        <Modal title="Deploy Remote IoT Sensing Node" onClose={() => setShowDeployModal(false)}>
          <form onSubmit={handleDeploySubmit} className="flex flex-col gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-lime-300/80">Node Name</label>
              <Inp
                value={nodeForm.name}
                onChange={(e) => setNodeForm({ ...nodeForm, name: e.target.value })}
                placeholder="e.g. Corbett North Rim Acoustic-01"
                style={{ ...inputStyle, color: "#ffffff", fontWeight: "600" }}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-lime-300/80">Device UID</label>
                <Inp
                  value={nodeForm.device_uid}
                  onChange={(e) => setNodeForm({ ...nodeForm, device_uid: e.target.value })}
                  placeholder="DGN-XXXX-001"
                  style={{ ...inputStyle, color: "#ffffff" }}
                  required
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-lime-300/80">Initial Battery (%)</label>
                <Inp
                  type="number"
                  min="0"
                  max="100"
                  value={nodeForm.battery_level}
                  onChange={(e) => setNodeForm({ ...nodeForm, battery_level: e.target.value })}
                  style={{ ...inputStyle, color: "#ffffff" }}
                  required
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-lime-300/80">Geospatial Coordinates</span>
                <button
                  type="button"
                  onClick={() => {
                    setShowDeployModal(false);
                    setDeployMode(true);
                    toast("Click anywhere on the map to pinpoint this node's location.", "info");
                  }}
                  className="flex items-center gap-1 text-[10px] font-bold text-lime-400 hover:text-lime-300 bg-lime-400/10 hover:bg-lime-400/20 px-2 py-0.5 rounded border border-lime-400/20 transition cursor-pointer"
                >
                  <Crosshair size={11} /> Pick on Map
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-medium text-white/50">Latitude</label>
                  <Inp
                    type="number"
                    step="any"
                    value={nodeForm.latitude}
                    onChange={(e) => setNodeForm({ ...nodeForm, latitude: e.target.value })}
                    placeholder="29.6200"
                    style={{ ...inputStyle, color: "#ffffff" }}
                    required
                  />
                </div>

                <div>
                  <label className="text-[9px] font-medium text-white/50">Longitude</label>
                  <Inp
                    type="number"
                    step="any"
                    value={nodeForm.longitude}
                    onChange={(e) => setNodeForm({ ...nodeForm, longitude: e.target.value })}
                    placeholder="78.8500"
                    style={{ ...inputStyle, color: "#ffffff" }}
                    required
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-lime-300/80">Operational Status</label>
                <Sel
                  value={nodeForm.status}
                  onChange={(e) => setNodeForm({ ...nodeForm, status: e.target.value })}
                  style={{ ...inputStyle, color: "#ffffff", background: "#0d1a0f" }}
                >
                  <option value="ACTIVE" style={{ background: "#0d1a0f", color: "#ffffff" }}>ACTIVE</option>
                  <option value="ALERT" style={{ background: "#0d1a0f", color: "#ffffff" }}>ALERT</option>
                  <option value="OFFLINE" style={{ background: "#0d1a0f", color: "#ffffff" }}>OFFLINE</option>
                  <option value="MAINTENANCE" style={{ background: "#0d1a0f", color: "#ffffff" }}>MAINTENANCE</option>
                </Sel>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-lime-300/80">Assigned Custom Area</label>
                <Sel
                  value={nodeForm.custom_area_id}
                  onChange={(e) => setNodeForm({ ...nodeForm, custom_area_id: e.target.value })}
                  style={{ ...inputStyle, color: "#ffffff", background: "#0d1a0f" }}
                >
                  <option value="" style={{ background: "#0d1a0f", color: "#ffffff" }}>None (Stand-alone Location)</option>
                  {customAreas.map((a) => (
                    <option key={a.area_id} value={a.area_id} style={{ background: "#0d1a0f", color: "#ffffff" }}>
                      {a.name} ({parseFloat(a.area_sq_km).toLocaleString()} km²)
                    </option>
                  ))}
                </Sel>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-lime-300/80">Sanctuary Zone</label>
                <Sel
                  value={nodeForm.zone_id}
                  onChange={(e) => setNodeForm({ ...nodeForm, zone_id: e.target.value })}
                  style={{ ...inputStyle, color: "#ffffff", background: "#0d1a0f" }}
                >
                  <option value="" style={{ background: "#0d1a0f", color: "#ffffff" }}>None</option>
                  {zones.map((z) => (
                    <option key={z.zone_id} value={z.zone_id} style={{ background: "#0d1a0f", color: "#ffffff" }}>
                      {z.name}
                    </option>
                  ))}
                </Sel>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-lime-300/80">Sensor Capabilities</label>
                <Inp
                  value={nodeForm.sensor_type}
                  onChange={(e) => setNodeForm({ ...nodeForm, sensor_type: e.target.value })}
                  placeholder="ACOUSTIC_VISION, SEISMIC"
                  style={{ ...inputStyle, color: "#ffffff" }}
                />
              </div>
            </div>

            {/* Hardware Bridge Configuration (COM Port & Camera) */}
            <div className="rounded-xl p-3 border border-white/10 bg-white/[0.02] flex flex-col gap-2.5">
              <span className="text-[10px] font-black uppercase tracking-wider text-lime-400 flex items-center gap-1">
                <Usb size={12} /> Physical Edge Hardware Binding
              </span>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-lime-300/80">
                    Device 1 COM Port (USB Serial)
                  </label>
                  <div className="flex gap-1.5 mt-1">
                    <input
                      list="com-port-list"
                      value={nodeForm.com_port}
                      onChange={(e) => setNodeForm({ ...nodeForm, com_port: e.target.value })}
                      placeholder="e.g. COM3 or COM5"
                      className="w-full rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-white/20 outline-none"
                      style={{ ...inputStyle, color: "#ffffff" }}
                    />
                    <datalist id="com-port-list">
                      {availableComPorts.map((p) => (
                        <option key={p.port} value={p.port}>
                          {p.port} - {p.description}
                        </option>
                      ))}
                    </datalist>
                    <button
                      type="button"
                      onClick={refreshComPorts}
                      title="Detect physically plugged USB ports"
                      className="px-2 rounded-lg bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition"
                    >
                      <RefreshCw size={12} />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-lime-300/80">Baud Rate</label>
                  <Sel
                    value={nodeForm.baud_rate}
                    onChange={(e) => setNodeForm({ ...nodeForm, baud_rate: e.target.value })}
                    style={{ ...inputStyle, color: "#ffffff", background: "#0d1a0f", marginTop: "4px" }}
                  >
                    <option value="115200" style={{ background: "#0d1a0f", color: "#ffffff" }}>115200 baud (Default)</option>
                    <option value="9600" style={{ background: "#0d1a0f", color: "#ffffff" }}>9600 baud</option>
                    <option value="57600" style={{ background: "#0d1a0f", color: "#ffffff" }}>57600 baud</option>
                    <option value="230400" style={{ background: "#0d1a0f", color: "#ffffff" }}>230400 baud</option>
                  </Sel>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-purple-300/80">
                    Device 2 Snapshot URL (/capture)
                  </label>
                  <Inp
                    value={nodeForm.camera_url}
                    onChange={(e) => setNodeForm({ ...nodeForm, camera_url: e.target.value })}
                    placeholder="http://192.168.1.105/capture"
                    style={{ ...inputStyle, color: "#ffffff" }}
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-purple-300/80">
                    Device 2 Video Stream URL (/stream)
                  </label>
                  <Inp
                    value={nodeForm.camera_stream_url}
                    onChange={(e) => setNodeForm({ ...nodeForm, camera_stream_url: e.target.value })}
                    placeholder="http://192.168.1.105:81/stream"
                    style={{ ...inputStyle, color: "#ffffff" }}
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-lime-300/80">Deployment Notes</label>
              <textarea
                value={nodeForm.notes}
                onChange={(e) => setNodeForm({ ...nodeForm, notes: e.target.value })}
                rows={2}
                placeholder="Tree canopy mount, 50W solar module..."
                className="w-full rounded-xl p-3 text-xs text-white placeholder-white/20 outline-none"
                style={{ ...inputStyle, color: "#ffffff" }}
              />
            </div>

            <div className="mt-3 flex justify-end gap-2 border-t border-white/10 pt-3">
              <button
                type="button"
                onClick={() => setShowDeployModal(false)}
                className="rounded-xl px-4 py-2 text-xs font-bold text-white/50 hover:text-white transition"
              >
                Cancel
              </button>
              <SubmitButton
                submitting={submittingNode}
                label="Deploy Node"
                loadingLabel="Deploying..."
              >
                Deploy Node
              </SubmitButton>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Node Memory & Trigger Graph Modal ── */}
      {memoryModalNode && (
        <NodeMemoryModal
          node={memoryModalNode}
          onClose={() => setMemoryModalNode(null)}
          onTriggerLogged={handleTriggerLogged}
          toast={{
            success: (msg) => toast(msg, "success"),
            error: (msg) => toast(msg, "error"),
          }}
        />
      )}

      {/* ── Live ESP32-CAM Video Stream Modal ── */}
      {liveCameraNode && (
        <LiveCameraModal
          node={liveCameraNode}
          onClose={() => setLiveCameraNode(null)}
          onSnapshotTaken={(data) => {
            loadData(true);
            handleOpenNodeMemory(liveCameraNode);
          }}
          toast={(msg, type) => toast(msg, type)}
        />
      )}

      {/* ── Edit Hardware Configuration Modal ── */}
      {showHardwareConfigModal && hardwareConfigNode && (
        <Modal
          title={`Configure Edge Hardware Binding — ${hardwareConfigNode.name}`}
          onClose={() => setShowHardwareConfigModal(false)}
        >
          <form onSubmit={handleSaveHardwareConfig} className="flex flex-col gap-3">
            <div className="rounded-xl p-3 border border-white/10 bg-white/[0.02] flex flex-col gap-2.5">
              <span className="text-[10px] font-black uppercase tracking-wider text-lime-400 flex items-center gap-1">
                <Usb size={12} /> Device 1: Acoustic & Vibration Sensor (USB UART)
              </span>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-lime-300/80">
                    COM / Serial Port
                  </label>
                  <div className="flex gap-1.5 mt-1">
                    <input
                      list="edit-com-port-list"
                      value={hardwareForm.com_port}
                      onChange={(e) => setHardwareForm({ ...hardwareForm, com_port: e.target.value })}
                      placeholder="e.g. COM3 or COM5"
                      className="w-full rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-white/20 outline-none"
                      style={{ ...inputStyle, color: "#ffffff" }}
                    />
                    <datalist id="edit-com-port-list">
                      {availableComPorts.map((p) => (
                        <option key={p.port} value={p.port}>
                          {p.port} - {p.description}
                        </option>
                      ))}
                    </datalist>
                    <button
                      type="button"
                      onClick={refreshComPorts}
                      title="Detect physically plugged USB ports"
                      className="px-2 rounded-lg bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition"
                    >
                      <RefreshCw size={12} />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-lime-300/80">Baud Rate</label>
                  <Sel
                    value={hardwareForm.baud_rate}
                    onChange={(e) => setHardwareForm({ ...hardwareForm, baud_rate: e.target.value })}
                    style={{ ...inputStyle, color: "#ffffff", background: "#0d1a0f", marginTop: "4px" }}
                  >
                    <option value="115200" style={{ background: "#0d1a0f", color: "#ffffff" }}>115200 baud (Default)</option>
                    <option value="9600" style={{ background: "#0d1a0f", color: "#ffffff" }}>9600 baud</option>
                    <option value="57600" style={{ background: "#0d1a0f", color: "#ffffff" }}>57600 baud</option>
                    <option value="230400" style={{ background: "#0d1a0f", color: "#ffffff" }}>230400 baud</option>
                  </Sel>
                </div>
              </div>
            </div>

            <div className="rounded-xl p-3 border border-white/10 bg-white/[0.02] flex flex-col gap-2.5">
              <span className="text-[10px] font-black uppercase tracking-wider text-purple-400 flex items-center gap-1">
                <Camera size={12} /> Device 2: Optical Surveillance (ESP32-CAM)
              </span>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-purple-300/80">
                    Snapshot URL (/capture)
                  </label>
                  <Inp
                    value={hardwareForm.camera_url}
                    onChange={(e) => setHardwareForm({ ...hardwareForm, camera_url: e.target.value })}
                    placeholder="http://192.168.1.105/capture"
                    style={{ ...inputStyle, color: "#ffffff" }}
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-purple-300/80">
                    Live Video Stream URL (/stream)
                  </label>
                  <Inp
                    value={hardwareForm.camera_stream_url}
                    onChange={(e) => setHardwareForm({ ...hardwareForm, camera_stream_url: e.target.value })}
                    placeholder="http://192.168.1.105:81/stream"
                    style={{ ...inputStyle, color: "#ffffff" }}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 p-2 rounded-xl bg-white/[0.03] border border-white/5">
              <input
                type="checkbox"
                id="connect-serial-check"
                checked={hardwareForm.connect_serial}
                onChange={(e) => setHardwareForm({ ...hardwareForm, connect_serial: e.target.checked })}
                className="h-4 w-4 rounded accent-lime-400"
              />
              <label htmlFor="connect-serial-check" className="text-xs text-white/80 cursor-pointer select-none">
                Continuously monitor and listen on this COM port immediately
              </label>
            </div>

            <div className="mt-2 flex justify-end gap-2 border-t border-white/10 pt-3">
              <button
                type="button"
                onClick={() => setShowHardwareConfigModal(false)}
                className="rounded-xl px-4 py-2 text-xs font-bold text-white/50 hover:text-white transition"
              >
                Cancel
              </button>
              <SubmitButton
                submitting={submittingConfig}
                label="Update Port & Hardware Settings"
                loadingLabel="Updating..."
              >
                Update Port & Hardware Settings
              </SubmitButton>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Real-Time Serial Hardware Diagnostic Log Modal ── */}
      {showLogsModal && logsNode && (
        <Modal
          title={`Serial Hardware Log — ${logsNode.name} (${logsNode.com_port || "COM"})`}
          onClose={() => setShowLogsModal(false)}
        >
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between text-xs text-white/60">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="font-mono">Live Serial Stream (auto-polling every 1.5s)</span>
              </div>
              <button
                onClick={() => handleOpenLogs(logsNode)}
                className="flex items-center gap-1 text-[11px] text-lime-400 hover:text-lime-300 transition"
              >
                <RefreshCw size={11} className={loadingLogs ? "animate-spin" : ""} /> Refresh Now
              </button>
            </div>

            <div
              className="rounded-xl p-3 h-72 overflow-y-auto font-mono text-xs flex flex-col gap-1 border border-white/10"
              style={{ background: "#050b07", color: "#86efac" }}
            >
              {liveLogs.length === 0 ? (
                <div className="text-white/40 italic p-4 text-center">
                  No serial logs received yet on {logsNode.com_port || "configured port"}. Ensure Device 1 is plugged in and the listener bridge is connected.
                </div>
              ) : (
                liveLogs.map((logLine, idx) => {
                  const isVibe = logLine.includes("VIBRATION") || logLine.includes("strike") || logLine.includes("EVENT");
                  const isHeartbeat = logLine.includes("HEARTBEAT");
                  const isErr = logLine.includes("ERROR") || logLine.includes("FATAL");

                  return (
                    <div
                      key={idx}
                      className={`leading-relaxed px-1.5 py-0.5 rounded ${
                        isVibe
                          ? "bg-red-500/20 text-red-300 font-bold border-l-2 border-red-500"
                          : isHeartbeat
                          ? "text-sky-300"
                          : isErr
                          ? "bg-amber-500/20 text-amber-300"
                          : "text-emerald-400/90"
                      }`}
                    >
                      {logLine}
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex items-center justify-between text-[11px] text-white/50 border-t border-white/10 pt-2">
              <span>💡 Tap the vibration sensor on GPIO 34 to observe the strike impulse above.</span>
              <button
                type="button"
                onClick={() => setShowLogsModal(false)}
                className="px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default IotMapTab;
