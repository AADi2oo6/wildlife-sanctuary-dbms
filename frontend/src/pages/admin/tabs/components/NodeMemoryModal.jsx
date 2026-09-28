import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  X,
  Activity,
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  Radio,
  Battery,
  Clock,
  Volume2,
  Cpu,
  RefreshCw,
  PlusCircle,
  Sliders,
  Sparkles,
  ChevronDown,
  ChevronUp,
  MapPin,
  TrendingUp,
} from "lucide-react";
import { Badge } from "../../shared/adminComponents";
import api from "../../../../api/axiosInstance";

const SEVERITY_COLORS = {
  ALERT: "#ef4444",
  WARNING: "#f59e0b",
  INFO: "#06b6d4",
};

const TRIGGER_PRESETS = [
  {
    name: "Chainsaw Motor Signature",
    type: "ACOUSTIC_DISTURBANCE",
    severity: "ALERT",
    decibel: 88.5,
    confidence: 0.945,
    details: "Continuous high-RPM 2-stroke mechanical harmonics detected in core sanctuary.",
    icon: "🪚",
  },
  {
    name: "Ballistic Gunshot Wavefront",
    type: "GUNSHOT_ACOUSTIC",
    severity: "ALERT",
    decibel: 115.0,
    confidence: 0.978,
    details: "Sharp supersonic N-wave pressure rise matching centerfire rifle discharge.",
    icon: "💥",
  },
  {
    name: "PIR Boundary Intrusion",
    type: "PIR_MOTION",
    severity: "WARNING",
    decibel: 52.0,
    confidence: 0.885,
    details: "Thermal infrared displacement across unmapped boundary sector.",
    icon: "🚶",
  },
  {
    name: "Elephant Herd Infrasound",
    type: "ANIMAL_PROXIMITY",
    severity: "INFO",
    decibel: 68.0,
    confidence: 0.932,
    details: "Sub-audible rumbling acoustic communication (14-22 Hz) identified.",
    icon: "🐘",
  },
  {
    name: "Wildfire Thermal & VOC Spike",
    type: "WILDFIRE_THERMAL",
    severity: "ALERT",
    decibel: 64.0,
    confidence: 0.915,
    details: "Sudden atmospheric thermal gradient (+16°C) and micro-particulate increase.",
    icon: "🔥",
  },
  {
    name: "Seismic Vehicle Vibration",
    type: "VEHICLE_VIBRATION",
    severity: "WARNING",
    decibel: 77.0,
    confidence: 0.865,
    details: "Low-frequency ground vibration profile matching unauthorized 4WD vehicle.",
    icon: "🚜",
  },
];

export const NodeMemoryModal = ({ node, onClose, onTriggerLogged, toast }) => {
  const [triggers, setTriggers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState("all"); // '24h', '7d', '30d', 'all'
  const [metricMode, setMetricMode] = useState("decibel"); // 'decibel' | 'confidence'
  const [selectedTrigger, setSelectedTrigger] = useState(null);
  const [hoveredTrigger, setHoveredTrigger] = useState(null);

  // Simulation Form State
  const [showSimulate, setShowSimulate] = useState(false);
  const [submittingTrigger, setSubmittingTrigger] = useState(false);
  const [simForm, setSimForm] = useState({
    presetIndex: 0,
    trigger_type: TRIGGER_PRESETS[0].type,
    severity: TRIGGER_PRESETS[0].severity,
    decibel_level: TRIGGER_PRESETS[0].decibel,
    confidence: TRIGGER_PRESETS[0].confidence,
    details: TRIGGER_PRESETS[0].details,
  });

  const svgRef = useRef(null);

  const notify = (msg, type = "info") => {
    if (!toast) return;
    if (type === "error" && typeof toast.error === "function") {
      toast.error(msg);
    } else if (type === "success" && typeof toast.success === "function") {
      toast.success(msg);
    } else if (typeof toast === "function") {
      toast(msg, type);
    }
  };

  const fetchNodeMemory = async (showLoading = true) => {
    if (!node?.node_id) return;
    if (showLoading) setLoading(true);
    try {
      const res = await api.get(`/admin/iot-nodes/${node.node_id}/triggers?timeframe=${timeframe}`);
      const data = res.data;
      if (data.success) {
        setTriggers(data.triggers || []);
        setStats(data.stats || null);
        if (data.triggers?.length > 0) {
          setSelectedTrigger((prev) => {
            if (!prev) return data.triggers[data.triggers.length - 1];
            const found = data.triggers.find((t) => t.event_id === prev.event_id);
            return found || data.triggers[data.triggers.length - 1];
          });
        }
      } else {
        if (showLoading) notify(data.error || "Failed to load node memory.", "error");
      }
    } catch (err) {
      console.error("Error fetching node memory:", err);
      if (showLoading) {
        notify(err.response?.data?.error || "Network error while reading node memory history.", "error");
      }
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    fetchNodeMemory(true);
    // Real-time polling so any mock_esp32 or edge alert automatically paints a dot live
    const interval = setInterval(() => {
      fetchNodeMemory(false);
    }, 3000);
    return () => clearInterval(interval);
  }, [node?.node_id, timeframe]);

  // Handle Preset selection in simulation
  const handleSelectPreset = (idx) => {
    const p = TRIGGER_PRESETS[idx];
    setSimForm({
      presetIndex: idx,
      trigger_type: p.type,
      severity: p.severity,
      decibel_level: p.decibel,
      confidence: p.confidence,
      details: p.details,
    });
  };

  const handleSimulateSubmit = async (e) => {
    e.preventDefault();
    setSubmittingTrigger(true);
    try {
      const res = await api.post(`/admin/iot-nodes/${node.node_id}/triggers`, {
        trigger_type: simForm.trigger_type,
        severity: simForm.severity,
        decibel_level: parseFloat(simForm.decibel_level),
        confidence: parseFloat(simForm.confidence),
        details: simForm.details,
        triggered_at: new Date().toISOString(),
      });

      const data = res.data;
      if (data.success) {
        notify("New trigger logged into node memory!", "success");
        setShowSimulate(false);
        await fetchNodeMemory(false);
        onTriggerLogged?.(node.node_id, data.trigger);
      } else {
        notify(data.error || "Failed to log trigger.", "error");
      }
    } catch (err) {
      console.error("Error simulating trigger:", err);
      notify(err.response?.data?.error || "Server error logging trigger.", "error");
    } finally {
      setSubmittingTrigger(false);
    }
  };

  // ── GRAPH COORDINATE COMPUTATIONS ───────────────────────────────────────
  const graphWidth = 840;
  const graphHeight = 280;
  const padLeft = 65;
  const padRight = 35;
  const padTop = 35;
  const padBottom = 45;
  const plotW = graphWidth - padLeft - padRight;
  const plotH = graphHeight - padTop - padBottom;

  const { points, minTime, maxTime, timeTicks, yTicks, alertLineY, warnLineY } = useMemo(() => {
    if (!triggers || triggers.length === 0) {
      return { points: [], timeTicks: [], yTicks: [] };
    }

    // Sort chronologically
    const sorted = [...triggers].sort(
      (a, b) => new Date(a.triggered_at).getTime() - new Date(b.triggered_at).getTime()
    );

    let tMin = new Date(sorted[0].triggered_at).getTime();
    let tMax = new Date(sorted[sorted.length - 1].triggered_at).getTime();

    // If all events happen at exact same time or only 1 event, pad by 2 hours
    if (tMax - tMin < 60000) {
      tMin -= 3600000;
      tMax += 3600000;
    } else {
      // Add 5% padding on ends for aesthetic margin
      const span = tMax - tMin;
      tMin -= span * 0.05;
      tMax += span * 0.05;
    }

    // Y Axis scaling
    let yMin = 20; // 20 dB minimum baseline
    let yMax = 125; // 125 dB max
    if (metricMode === "confidence") {
      yMin = 0.5;
      yMax = 1.0;
    }

    const pts = sorted.map((t) => {
      const timeMs = new Date(t.triggered_at).getTime();
      const x = padLeft + ((timeMs - tMin) / (tMax - tMin)) * plotW;

      let val = metricMode === "decibel"
        ? (t.decibel_level ? parseFloat(t.decibel_level) : 40)
        : (t.confidence ? parseFloat(t.confidence) : 0.85);

      val = Math.max(yMin, Math.min(yMax, val));
      const y = padTop + plotH - ((val - yMin) / (yMax - yMin)) * plotH;

      return {
        ...t,
        x,
        y,
        val,
        color: SEVERITY_COLORS[t.severity] || "#a3e635",
      };
    });

    // Generate 5 Time Ticks along X-axis
    const tTicks = [];
    const numTicks = 5;
    for (let i = 0; i <= numTicks; i++) {
      const tickTime = tMin + (i / numTicks) * (tMax - tMin);
      const tickX = padLeft + (i / numTicks) * plotW;
      const d = new Date(tickTime);
      const label = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const subLabel = `${d.getDate()} ${d.toLocaleString("default", { month: "short" })}`;
      tTicks.push({ x: tickX, label, subLabel });
    }

    // Generate Y Ticks
    const yTicksList = [];
    if (metricMode === "decibel") {
      const dbSteps = [30, 50, 70, 90, 110];
      dbSteps.forEach((db) => {
        const yPos = padTop + plotH - ((db - yMin) / (yMax - yMin)) * plotH;
        yTicksList.push({ y: yPos, label: `${db} dB` });
      });
    } else {
      const confSteps = [0.6, 0.7, 0.8, 0.9, 1.0];
      confSteps.forEach((cf) => {
        const yPos = padTop + plotH - ((cf - yMin) / (yMax - yMin)) * plotH;
        yTicksList.push({ y: yPos, label: `${Math.round(cf * 100)}%` });
      });
    }

    // Calculate Threshold Reference Line Positions
    const alertY = metricMode === "decibel"
      ? padTop + plotH - ((85 - yMin) / (yMax - yMin)) * plotH
      : padTop + plotH - ((0.92 - yMin) / (yMax - yMin)) * plotH;

    const warnY = metricMode === "decibel"
      ? padTop + plotH - ((70 - yMin) / (yMax - yMin)) * plotH
      : padTop + plotH - ((0.80 - yMin) / (yMax - yMin)) * plotH;

    return {
      points: pts,
      minTime: tMin,
      maxTime: tMax,
      timeTicks: tTicks,
      yTicks: yTicksList,
      alertLineY: alertY,
      warnLineY: warnY,
    };
  }, [triggers, metricMode]);

  // Construct SVG Polyline path for connecting trend
  const polylinePoints = useMemo(() => {
    if (!points || points.length === 0) return "";
    return points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  }, [points]);

  const activeInspectTrigger = hoveredTrigger || selectedTrigger;

  return (
    <div
      className="fixed inset-0 z-[2600] flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
      style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(10px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="relative w-full max-w-5xl my-auto overflow-hidden rounded-2xl flex flex-col"
        style={{
          background: "linear-gradient(155deg, rgba(13,26,15,0.98) 0%, rgba(8,16,10,0.99) 100%)",
          border: "1px solid rgba(163,230,53,0.22)",
          boxShadow: "0 0 60px rgba(0,0,0,0.8), 0 0 40px rgba(163,230,53,0.08)",
        }}
      >
        {/* Top Accent Gradient Bar */}
        <div className="h-1 w-full bg-gradient-to-r from-lime-400 via-emerald-500 to-cyan-500" />

        {/* ── MODAL HEADER ── */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-xl"
              style={{
                background: "rgba(163,230,53,0.12)",
                border: "1px solid rgba(163,230,53,0.28)",
                color: "#a3e635",
              }}
            >
              <Activity size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-white">{node.name}</h3>
                <Badge label={node.status} color={node.status === "ALERT" ? "#ef4444" : "#a3e635"} />
              </div>
              <div className="flex items-center gap-3 text-xs text-white/50 mt-0.5 font-mono">
                <span>UID: {node.device_uid}</span>
                <span>•</span>
                <span className="flex items-center gap-1 text-lime-400">
                  <Battery size={13} /> {node.battery_level}%
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <MapPin size={12} className="text-white/40" />
                  {Number(node.latitude).toFixed(4)}°, {Number(node.longitude).toFixed(4)}°
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSimulate(!showSimulate)}
              className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition"
              style={{
                background: showSimulate ? "rgba(163,230,53,0.25)" : "rgba(163,230,53,0.10)",
                border: "1px solid rgba(163,230,53,0.30)",
                color: "#a3e635",
              }}
            >
              <Sparkles size={14} />
              <span>{showSimulate ? "Close Simulator" : "Simulate Trigger"}</span>
            </button>

            <button
              onClick={fetchNodeMemory}
              disabled={loading}
              title="Refresh Memory Events"
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition border border-white/10"
            >
              <RefreshCw size={14} className={loading ? "animate-spin text-lime-400" : ""} />
            </button>

            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition border border-white/10"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* ── EXPANDABLE TRIGGER SIMULATOR DRAWER ── */}
        {showSimulate && (
          <div
            className="border-b border-white/10 p-5"
            style={{ background: "rgba(16,36,20,0.85)" }}
          >
            <div className="flex items-center justify-between pb-3">
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-lime-400">
                  Real-Time Threat & Telemetry Simulator
                </p>
                <p className="text-[11px] text-white/50">
                  Inject an immediate acoustic or environmental trigger into this node's memory to test live graph plotting.
                </p>
              </div>
            </div>

            {/* Quick Preset Buttons */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 mb-4">
              {TRIGGER_PRESETS.map((p, idx) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => handleSelectPreset(idx)}
                  className={`flex flex-col items-center p-2 rounded-xl border text-center transition ${
                    simForm.presetIndex === idx
                      ? "bg-lime-400/20 border-lime-400 shadow-lg shadow-lime-400/10 text-white"
                      : "bg-white/[0.03] border-white/10 hover:bg-white/[0.08] text-white/60"
                  }`}
                >
                  <span className="text-xl mb-1">{p.icon}</span>
                  <span className="text-[11px] font-bold truncate w-full">{p.name}</span>
                  <span className="text-[9px] font-mono mt-0.5 text-white/40">{p.decibel} dB</span>
                </button>
              ))}
            </div>

            <form onSubmit={handleSimulateSubmit} className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[200px]">
                <label className="text-[10px] font-bold uppercase text-white/40">Anomaly Description</label>
                <input
                  type="text"
                  value={simForm.details}
                  onChange={(e) => setSimForm({ ...simForm, details: e.target.value })}
                  className="w-full mt-1 rounded-xl px-3 py-1.5 text-xs text-white bg-black/40 border border-white/15 outline-none focus:border-lime-400"
                  placeholder="Trigger diagnosis details..."
                  required
                />
              </div>

              <div className="w-28">
                <label className="text-[10px] font-bold uppercase text-white/40">Decibels (dB)</label>
                <input
                  type="number"
                  step="0.1"
                  min="20"
                  max="140"
                  value={simForm.decibel_level}
                  onChange={(e) => setSimForm({ ...simForm, decibel_level: e.target.value })}
                  className="w-full mt-1 rounded-xl px-3 py-1.5 text-xs text-white bg-black/40 border border-white/15 outline-none"
                  required
                />
              </div>

              <div className="w-28">
                <label className="text-[10px] font-bold uppercase text-white/40">Severity</label>
                <select
                  value={simForm.severity}
                  onChange={(e) => setSimForm({ ...simForm, severity: e.target.value })}
                  className="w-full mt-1 rounded-xl px-3 py-1.5 text-xs text-white bg-[#0d1a0f] border border-white/15 outline-none"
                >
                  <option value="ALERT">ALERT</option>
                  <option value="WARNING">WARNING</option>
                  <option value="INFO">INFO</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={submittingTrigger}
                className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-black text-black bg-lime-400 hover:bg-lime-300 transition shadow-lg shadow-lime-500/20"
              >
                {submittingTrigger ? (
                  <span className="flex items-center gap-1.5">
                    <RefreshCw size={12} className="animate-spin" /> Logging...
                  </span>
                ) : (
                  <>
                    <PlusCircle size={14} /> Log Trigger to Memory
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {/* ── SUMMARY STATS BAR ── */}
        <div className="grid grid-cols-2 sm:grid-cols-6 divide-x divide-white/5 border-b border-white/10 bg-white/[0.015]">
          <div className="p-3 text-center">
            <p className="text-[10px] font-bold uppercase text-white/40">Total Memory Events</p>
            <p className="text-lg font-black text-white">{stats?.total || 0}</p>
          </div>
          <div className="p-3 text-center">
            <p className="text-[10px] font-bold uppercase text-red-400">Critical Alerts</p>
            <p className="text-lg font-black text-red-400">{stats?.alertCount || 0}</p>
          </div>
          <div className="p-3 text-center">
            <p className="text-[10px] font-bold uppercase text-amber-400">Warnings</p>
            <p className="text-lg font-black text-amber-400">{stats?.warningCount || 0}</p>
          </div>
          <div className="p-3 text-center">
            <p className="text-[10px] font-bold uppercase text-cyan-400">Routine / Info</p>
            <p className="text-lg font-black text-cyan-400">{stats?.infoCount || 0}</p>
          </div>
          <div className="p-3 text-center">
            <p className="text-[10px] font-bold uppercase text-lime-400">Peak Decibels</p>
            <p className="text-lg font-black text-lime-300">
              {stats?.maxDecibel ? `${stats.maxDecibel} dB` : "--"}
            </p>
          </div>
          <div className="p-3 text-center">
            <p className="text-[10px] font-bold uppercase text-white/40">Avg AI Confidence</p>
            <p className="text-lg font-black text-white">
              {stats?.avgConfidence ? `${(stats.avgConfidence * 100).toFixed(1)}%` : "--"}
            </p>
          </div>
        </div>

        {/* ── CONTROLS & TIMEFRAME SELECTOR ── */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-2.5 bg-white/[0.02] border-b border-white/5">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase text-white/40">Time Scope:</span>
            <div className="flex items-center rounded-xl bg-black/40 p-1 border border-white/10">
              {[
                { id: "24h", label: "24 Hours" },
                { id: "7d", label: "7 Days" },
                { id: "30d", label: "30 Days" },
                { id: "all", label: "All Memory" },
              ].map((tf) => (
                <button
                  key={tf.id}
                  onClick={() => setTimeframe(tf.id)}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                    timeframe === tf.id
                      ? "bg-lime-400 text-black shadow"
                      : "text-white/50 hover:text-white"
                  }`}
                >
                  {tf.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase text-white/40">Y-Axis Metric:</span>
            <div className="flex items-center rounded-xl bg-black/40 p-1 border border-white/10">
              <button
                onClick={() => setMetricMode("decibel")}
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                  metricMode === "decibel"
                    ? "bg-lime-400 text-black shadow"
                    : "text-white/50 hover:text-white"
                }`}
              >
                <Volume2 size={12} /> Decibels (dB)
              </button>
              <button
                onClick={() => setMetricMode("confidence")}
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                  metricMode === "confidence"
                    ? "bg-lime-400 text-black shadow"
                    : "text-white/50 hover:text-white"
                }`}
              >
                <Cpu size={12} /> AI Confidence (%)
              </button>
            </div>
          </div>
        </div>

        {/* ── THE INTERACTIVE TIME GRAPH WITH DOTS ── */}
        <div className="relative p-4 sm:p-6 flex flex-col items-center">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-white/40">
              <RefreshCw size={28} className="animate-spin text-lime-400 mb-2" />
              <p className="text-xs">Loading trigger memory timeline...</p>
            </div>
          ) : points.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-white/30">
              <Activity size={36} className="text-white/20 mb-2" />
              <p className="text-sm font-bold text-white/60">No Trigger Events Recorded</p>
              <p className="text-xs mt-1 text-white/40 max-w-sm">
                This node has not logged any trigger incidents within the selected timeframe.
              </p>
              <button
                onClick={() => setShowSimulate(true)}
                className="mt-3 flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-black text-black bg-lime-400 hover:bg-lime-300 transition"
              >
                <Sparkles size={13} /> Simulate First Trigger
              </button>
            </div>
          ) : (
            <div className="w-full relative">
              {/* SVG Canvas */}
              <svg
                ref={svgRef}
                viewBox={`0 0 ${graphWidth} ${graphHeight}`}
                className="w-full h-auto select-none overflow-visible"
                style={{
                  background: "radial-gradient(ellipse at 50% 30%, rgba(20,45,25,0.45) 0%, rgba(9,18,10,0.85) 100%)",
                  borderRadius: "16px",
                  border: "1px solid rgba(163,230,53,0.15)",
                }}
              >
                <defs>
                  {/* Subtle Gradient fill under line */}
                  <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#a3e635" stopOpacity="0.18" />
                    <stop offset="100%" stopColor="#a3e635" stopOpacity="0.0" />
                  </linearGradient>

                  {/* Red Glow Filter */}
                  <filter id="glowAlert" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                    <feMerge>
                      <feMergeNode in="coloredBlur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>

                {/* Horizontal Gridlines & Y-Axis Labels */}
                {yTicks.map((t, idx) => (
                  <g key={`ytick-${idx}`}>
                    <line
                      x1={padLeft}
                      y1={t.y}
                      x2={padLeft + plotW}
                      y2={t.y}
                      stroke="rgba(255,255,255,0.06)"
                      strokeDasharray="3 3"
                    />
                    <text
                      x={padLeft - 10}
                      y={t.y + 4}
                      fill="rgba(255,255,255,0.35)"
                      fontSize="10"
                      fontWeight="bold"
                      textAnchor="end"
                      fontFamily="monospace"
                    >
                      {t.label}
                    </text>
                  </g>
                ))}

                {/* Critical Alert Threshold Reference Line */}
                {alertLineY >= padTop && alertLineY <= padTop + plotH && (
                  <g>
                    <line
                      x1={padLeft}
                      y1={alertLineY}
                      x2={padLeft + plotW}
                      y2={alertLineY}
                      stroke="#ef4444"
                      strokeWidth="1.2"
                      strokeDasharray="4 4"
                      opacity="0.65"
                    />
                    <text
                      x={padLeft + plotW - 6}
                      y={alertLineY - 4}
                      fill="#ef4444"
                      fontSize="9"
                      fontWeight="900"
                      textAnchor="end"
                      opacity="0.85"
                    >
                      {metricMode === "decibel" ? "ALERT THRESHOLD (85 dB)" : "CRITICAL CONFIDENCE (92%)"}
                    </text>
                  </g>
                )}

                {/* Warning Threshold Reference Line */}
                {warnLineY >= padTop && warnLineY <= padTop + plotH && (
                  <g>
                    <line
                      x1={padLeft}
                      y1={warnLineY}
                      x2={padLeft + plotW}
                      y2={warnLineY}
                      stroke="#f59e0b"
                      strokeWidth="1.2"
                      strokeDasharray="4 4"
                      opacity="0.5"
                    />
                    <text
                      x={padLeft + plotW - 6}
                      y={warnLineY - 4}
                      fill="#f59e0b"
                      fontSize="9"
                      fontWeight="bold"
                      textAnchor="end"
                      opacity="0.75"
                    >
                      {metricMode === "decibel" ? "WARNING THRESHOLD (70 dB)" : "ELEVATED (80%)"}
                    </text>
                  </g>
                )}

                {/* Vertical Time Gridlines & X-Axis Labels */}
                {timeTicks.map((tick, idx) => (
                  <g key={`xtick-${idx}`}>
                    <line
                      x1={tick.x}
                      y1={padTop}
                      x2={tick.x}
                      y2={padTop + plotH}
                      stroke="rgba(255,255,255,0.06)"
                      strokeDasharray="2 4"
                    />
                    <text
                      x={tick.x}
                      y={padTop + plotH + 18}
                      fill="rgba(255,255,255,0.5)"
                      fontSize="10"
                      fontWeight="bold"
                      textAnchor="middle"
                      fontFamily="monospace"
                    >
                      {tick.label}
                    </text>
                    <text
                      x={tick.x}
                      y={padTop + plotH + 30}
                      fill="rgba(255,255,255,0.25)"
                      fontSize="8"
                      textAnchor="middle"
                    >
                      {tick.subLabel}
                    </text>
                  </g>
                ))}

                {/* Connecting Trend Polyline */}
                {polylinePoints && (
                  <polyline
                    fill="none"
                    stroke="rgba(163,230,53,0.35)"
                    strokeWidth="1.5"
                    points={polylinePoints}
                  />
                )}

                {/* Active Selected Point Vertical Crosshair */}
                {activeInspectTrigger && (
                  <line
                    x1={activeInspectTrigger.x}
                    y1={padTop}
                    x2={activeInspectTrigger.x}
                    y2={padTop + plotH}
                    stroke="rgba(255,255,255,0.3)"
                    strokeWidth="1"
                    strokeDasharray="3 3"
                  />
                )}

                {/* ── THE TRIGGER DOTS (The user requirement) ── */}
                {points.map((pt) => {
                  const isSelected = selectedTrigger?.event_id === pt.event_id;
                  const isHovered = hoveredTrigger?.event_id === pt.event_id;
                  const isAlert = pt.severity === "ALERT";

                  return (
                    <g
                      key={`dot-${pt.event_id}`}
                      className="cursor-pointer group"
                      onMouseEnter={() => setHoveredTrigger(pt)}
                      onMouseLeave={() => setHoveredTrigger(null)}
                      onClick={() => setSelectedTrigger(pt)}
                    >
                      {/* Pulsing ring for alerts */}
                      {isAlert && (
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r={14}
                          fill={pt.color}
                          opacity="0.25"
                          className="animate-ping"
                        />
                      )}

                      {/* Halo ring for selection/hover */}
                      {(isSelected || isHovered) && (
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r={12}
                          fill={pt.color}
                          opacity="0.35"
                        />
                      )}

                      {/* Outer Glow Circle */}
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r={isSelected || isHovered ? 8 : 6}
                        fill={pt.color}
                        opacity="0.8"
                        style={{ filter: isAlert ? "url(#glowAlert)" : undefined }}
                      />

                      {/* Central Solid Dot with White Rim */}
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r={isSelected || isHovered ? 5.5 : 4}
                        fill={pt.color}
                        stroke="#ffffff"
                        strokeWidth={isSelected || isHovered ? 2.5 : 1.5}
                      />
                    </g>
                  );
                })}
              </svg>

              {/* Legend Bar */}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[11px] text-white/50 px-2">
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" /> Alert Trigger (Threat / Breach)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Warning Trigger
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-cyan-400" /> Routine / Biological
                  </span>
                </div>
                <div className="text-[10px] text-white/40 italic">
                  💡 Click or hover any dot on the timeline to inspect its trigger telemetry.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── SELECTED TRIGGER INSPECTION CARD ── */}
        {activeInspectTrigger && (
          <div
            className="mx-6 mb-4 p-4 rounded-xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition"
            style={{
              background: "rgba(163,230,53,0.04)",
              borderColor: `${activeInspectTrigger.color}44`,
              boxShadow: `0 4px 20px ${activeInspectTrigger.color}15`,
            }}
          >
            <div className="flex items-start gap-3">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg"
                style={{
                  background: `${activeInspectTrigger.color}20`,
                  border: `1px solid ${activeInspectTrigger.color}40`,
                }}
              >
                {activeInspectTrigger.trigger_type.includes("GUNSHOT")
                  ? "💥"
                  : activeInspectTrigger.trigger_type.includes("CHAINSAW") || activeInspectTrigger.trigger_type.includes("ACOUSTIC")
                  ? "🪚"
                  : activeInspectTrigger.trigger_type.includes("PIR")
                  ? "🚶"
                  : activeInspectTrigger.trigger_type.includes("ANIMAL")
                  ? "🐘"
                  : activeInspectTrigger.trigger_type.includes("FIRE")
                  ? "🔥"
                  : "📡"}
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-black text-white">
                    {activeInspectTrigger.trigger_type.replace(/_/g, " ")}
                  </h4>
                  <Badge label={activeInspectTrigger.severity} color={activeInspectTrigger.color} />
                </div>
                <p className="text-xs text-white/80 mt-1 max-w-xl">
                  {activeInspectTrigger.details || "No diagnostic notes attached."}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs font-mono shrink-0">
              <div className="text-right">
                <p className="text-[10px] uppercase text-white/40">Timestamp</p>
                <p className="text-white font-bold">
                  {new Date(activeInspectTrigger.triggered_at).toLocaleString()}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase text-white/40">Decibel</p>
                <p className="text-lime-300 font-bold">
                  {activeInspectTrigger.decibel_level ? `${activeInspectTrigger.decibel_level} dB` : "--"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase text-white/40">AI Confidence</p>
                <p className="text-cyan-300 font-bold">
                  {activeInspectTrigger.confidence ? `${(Number(activeInspectTrigger.confidence) * 100).toFixed(1)}%` : "--"}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── CHRONOLOGICAL TRIGGER HISTORY FEED ── */}
        <div className="px-6 pb-6">
          <div className="flex items-center justify-between pb-2 border-b border-white/5">
            <span className="text-[10px] uppercase font-black tracking-wider text-lime-400">
              Trigger Memory Feed ({triggers.length} Events)
            </span>
            <span className="text-[10px] text-white/40">Click any row to jump to its dot</span>
          </div>

          <div className="mt-2 max-h-48 overflow-y-auto space-y-1.5 pr-1">
            {triggers
              .slice()
              .reverse()
              .map((trig) => {
                const isSelected = selectedTrigger?.event_id === trig.event_id;
                const trigColor = SEVERITY_COLORS[trig.severity] || "#a3e635";

                return (
                  <div
                    key={trig.event_id}
                    onClick={() => setSelectedTrigger(trig)}
                    className={`flex items-center justify-between p-2.5 rounded-xl border transition cursor-pointer text-xs ${
                      isSelected
                        ? "bg-white/10 border-lime-400/50"
                        : "bg-white/[0.02] border-white/5 hover:bg-white/[0.05]"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ background: trigColor }} />
                      <div className="truncate">
                        <span className="font-bold text-white mr-2">
                          {trig.trigger_type.replace(/_/g, " ")}
                        </span>
                        <span className="text-[11px] text-white/50 truncate hidden sm:inline">
                          {trig.details}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 font-mono text-[11px] text-white/60">
                      {trig.decibel_level && (
                        <span className="text-lime-400">{trig.decibel_level} dB</span>
                      )}
                      <span className="text-white/40 text-[10px]">
                        {new Date(trig.triggered_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <Badge label={trig.severity} color={trigColor} />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NodeMemoryModal;
