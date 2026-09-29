import React, { useState, useEffect } from "react";
import {
  X,
  Camera,
  Video,
  Radio,
  RefreshCw,
  Sun,
  Maximize2,
  AlertTriangle,
  CheckCircle,
  ExternalLink,
  ShieldAlert,
} from "lucide-react";
import { triggerManualSnapshot, toggleNodeFlash } from "../../../../api/hardwareApi";

export const LiveCameraModal = ({ node, onClose, onSnapshotTaken, toast }) => {
  const [isStreaming, setIsStreaming] = useState(true);
  const [streamError, setStreamError] = useState(false);
  const [flashActive, setFlashActive] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [streamKey, setStreamKey] = useState(Date.now());

  const streamUrl = node?.camera_stream_url || (node?.camera_url ? node.camera_url.replace(/\/capture$/, ":81/stream") : "");

  const handleCaptureSnapshot = async () => {
    if (!node?.node_id) return;
    setCapturing(true);
    try {
      const res = await triggerManualSnapshot(node.node_id);
      if (res.status === "success") {
        if (toast) toast("📸 Snapshot captured & processed by Vision AI agent!", "success");
        if (onSnapshotTaken) onSnapshotTaken(res.data);
      } else {
        if (toast) toast(res.message || "Failed to capture snapshot from camera", "error");
      }
    } catch (err) {
      if (toast) toast(err.response?.data?.detail || "Camera snapshot failed", "error");
    } finally {
      setCapturing(false);
    }
  };

  const handleToggleFlash = async () => {
    if (!node?.node_id) return;
    const newState = !flashActive;
    try {
      await toggleNodeFlash(node.node_id, newState);
      setFlashActive(newState);
      if (toast) toast(`Flash illuminator turned ${newState ? "ON" : "OFF"}.`, "info");
    } catch (err) {
      if (toast) toast("Failed to toggle flashlight", "error");
    }
  };

  const handleReloadStream = () => {
    setStreamError(false);
    setIsStreaming(true);
    setStreamKey(Date.now());
  };

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div
        className="w-full max-w-4xl rounded-2xl overflow-hidden border shadow-2xl flex flex-col"
        style={{
          background: "rgba(10, 18, 12, 0.98)",
          borderColor: "rgba(163, 230, 53, 0.3)",
          boxShadow: "0 25px 60px rgba(0,0,0,0.85)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-black/40">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-lime-500/15 border border-lime-500/30 flex items-center justify-center text-lime-400">
              <Video size={18} className="animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black text-white">{node?.name} — Live Optical Feed</h3>
                <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-ping" />
                  LIVE MJPEG
                </span>
              </div>
              <p className="text-[11px] text-white/50 font-mono">
                Device UID: {node?.device_uid} &bull; Stream URL: {streamUrl || "Not configured"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleReloadStream}
              title="Refresh Stream"
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition"
            >
              <RefreshCw size={15} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Video Canvas Area */}
        <div className="relative aspect-video w-full bg-black flex items-center justify-center overflow-hidden">
          {streamUrl && !streamError ? (
            <img
              key={streamKey}
              src={`${streamUrl}?t=${streamKey}`}
              alt={`Live feed from ${node?.name}`}
              className="w-full h-full object-contain"
              onError={() => setStreamError(true)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center p-8 text-center max-w-md">
              <div className="h-14 w-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-3">
                <AlertTriangle size={28} />
              </div>
              <h4 className="text-sm font-black text-white">Stream Signal Unavailable</h4>
              <p className="text-xs text-white/50 mt-1.5">
                {streamUrl
                  ? `Could not establish MJPEG video connection to ${streamUrl}. Ensure Device 2 is powered on and joined to the Wi-Fi network.`
                  : "No Camera Stream URL configured for this node. Configure the camera URL in node settings."}
              </p>
              <div className="mt-4 flex gap-2">
                <button
                  onClick={handleReloadStream}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-lime-400 hover:bg-lime-300 text-black text-xs font-black transition"
                >
                  <RefreshCw size={13} /> Retry Connection
                </button>
                {node?.camera_url && (
                  <button
                    onClick={handleCaptureSnapshot}
                    disabled={capturing}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition disabled:opacity-50"
                  >
                    <Camera size={13} /> {capturing ? "Capturing..." : "Try Snapshot Instead"}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Stream Overlay HUD */}
          <div className="absolute top-3 left-3 flex items-center gap-2 pointer-events-none">
            <span className="bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold text-lime-400 border border-white/10">
              OV2640 OPTICAL SENSOR
            </span>
            <span className="bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-lg text-[10px] font-mono text-white/70 border border-white/10">
              SVGA / 800x600
            </span>
          </div>

          <div className="absolute top-3 right-3 pointer-events-none">
            <span className="bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-lg text-[10px] font-mono text-white/50 border border-white/10">
              {new Date().toLocaleTimeString()}
            </span>
          </div>
        </div>

        {/* Bottom Control Bar */}
        <div className="px-6 py-4 bg-black/60 border-t border-white/10 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={handleCaptureSnapshot}
              disabled={capturing || !node?.camera_url}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black text-black bg-lime-400 hover:bg-lime-300 disabled:opacity-40 transition shadow-lg shadow-lime-500/20"
            >
              <Camera size={14} />
              {capturing ? "Triggering Snapshot..." : "📸 Instant Forensic Snapshot"}
            </button>

            <button
              onClick={handleToggleFlash}
              disabled={!node?.camera_url}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition border ${
                flashActive
                  ? "bg-amber-400 text-black border-amber-300"
                  : "bg-white/5 text-white/80 hover:bg-white/10 border-white/10"
              } disabled:opacity-40`}
            >
              <Sun size={14} className={flashActive ? "text-black" : "text-amber-400"} />
              {flashActive ? "Night Flash: ON" : "Night Flash: OFF"}
            </button>
          </div>

          <div className="text-[11px] text-white/40 flex items-center gap-2">
            <ShieldAlert size={13} className="text-lime-400" />
            <span>High-confidence acoustic threats automatically escalate and trigger this optical sensor.</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LiveCameraModal;
