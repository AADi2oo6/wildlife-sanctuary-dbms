import React, { useEffect } from "react";
import { Leaf, AlertTriangle, CheckCircle, X } from "lucide-react";

/* ── Eyebrow label ─────────────────────────────────── */
export const Eyebrow = ({ children }) => (
  <div className="mb-2 flex items-center gap-2">
    <Leaf size={10} className="text-lime-300/50" />
    <span className="text-[9px] font-black uppercase tracking-[0.4em] text-lime-300/50">{children}</span>
  </div>
);

/* ── Stat card ──────────────────────────────────────── */
export const StatCard = ({ icon: Icon, label, value, accent = "#a3e635", loading }) => (
  <div
    className="flex flex-col gap-3 p-5"
    style={{ background: "linear-gradient(145deg,rgba(13,26,15,0.88) 0%,rgba(9,18,10,0.95) 100%)", borderRadius: "18px", border: "1px solid rgba(163,230,53,0.09)" }}
  >
    <div className="flex h-10 w-10 items-center justify-center" style={{ background: `${accent}12`, border: `1px solid ${accent}22`, borderRadius: "10px", color: accent }}>
      <Icon size={18} strokeWidth={1.6} />
    </div>
    {loading ? (
      <div className="h-8 w-20 animate-pulse rounded" style={{ background: "rgba(255,255,255,0.05)" }} />
    ) : (
      <p className="text-3xl font-black text-white">{typeof value === "number" ? value.toLocaleString("en-IN") : value}</p>
    )}
    <p className="text-[9px] font-bold uppercase tracking-[0.28em] text-white/30">{label}</p>
  </div>
);

/* ── Badge chip ─────────────────────────────────────── */
export const Badge = ({ label, color }) => (
  <span className="rounded-full px-2.5 py-0.5 text-[9px] font-black uppercase tracking-[0.18em]"
    style={{ background: `${color}14`, color, border: `1px solid ${color}28` }}>
    {label}
  </span>
);

/* ── Modal wrapper ──────────────────────────────────── */
export const Modal = ({ title, onClose, children }) => (
  <div
    className="fixed inset-0 z-[2500] flex items-center justify-center p-4"
    style={{ background: "rgba(0,0,0,0.80)", backdropFilter: "blur(8px)" }}
    onClick={e => e.target === e.currentTarget && onClose()}
  >
    <div className="relative w-full max-w-lg overflow-hidden"
      style={{ background: "linear-gradient(145deg,rgba(13,26,15,0.98) 0%,rgba(9,18,10,0.99) 100%)", borderRadius: "20px", border: "1px solid rgba(163,230,53,0.15)", boxShadow: "0 0 60px rgba(163,230,53,0.07)" }}>
      <div className="h-0.5 w-full" style={{ background: "linear-gradient(90deg,#a3e635,rgba(163,230,53,0.1),transparent)" }} />
      <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <p className="text-sm font-black uppercase tracking-[0.22em] text-white">{title}</p>
        <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-full transition hover:bg-white/10" style={{ color: "rgba(255,255,255,0.35)" }}><X size={15} /></button>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  </div>
);

/* ── Shared input styles ────────────────────────────── */
export const inputStyle = {
  background: "rgba(13,26,15,0.70)",
  border: "1px solid rgba(163,230,53,0.12)",
  borderRadius: "8px",
  color: "rgba(255,255,255,0.75)",
  outline: "none",
  fontSize: "13px",
};

export const Inp = ({ label, ...props }) => (
  <div className="flex flex-col gap-1.5">
    <label className="text-[9px] font-bold uppercase tracking-[0.28em] text-white/30">{label}</label>
    <input {...props} className="w-full px-3 py-2.5 placeholder-white/18 transition focus:border-lime-400/50" style={inputStyle} />
  </div>
);

export const Sel = ({ label, children, ...props }) => (
  <div className="flex flex-col gap-1.5">
    <label className="text-[9px] font-bold uppercase tracking-[0.28em] text-white/30">{label}</label>
    <select {...props} className="w-full cursor-pointer px-3 py-2.5" style={{ ...inputStyle, color: props.value ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.22)" }}>{children}</select>
  </div>
);

/* ── Toast notification ─────────────────────────────── */
export const Toast = ({ msg, type, onDone }) => {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t); }, []);
  const bg     = type === "error" ? "rgba(239,68,68,0.12)"  : "rgba(163,230,53,0.10)";
  const border = type === "error" ? "rgba(239,68,68,0.30)"  : "rgba(163,230,53,0.30)";
  const color  = type === "error" ? "#f87171"               : "#a3e635";
  return (
    <div className="fixed bottom-6 right-6 z-100 flex items-center gap-3 px-5 py-3.5 shadow-2xl"
      style={{ background: bg, border: `1px solid ${border}`, borderRadius: "12px", maxWidth: "340px" }}>
      {type === "error" ? <AlertTriangle size={16} style={{ color }} /> : <CheckCircle size={16} style={{ color }} />}
      <p className="text-[12px] font-semibold" style={{ color: "rgba(255,255,255,0.80)" }}>{msg}</p>
    </div>
  );
};

/* ── Table skeleton loader ──────────────────────────── */
export const TableSkeleton = ({ rows = 4 }) => (
  <div className="flex flex-col gap-3 p-5">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="h-12 animate-pulse rounded-lg" style={{ background: "rgba(255,255,255,0.03)" }} />
    ))}
  </div>
);

/* ── Primary action button ──────────────────────────── */
export const AddButton = ({ onClick, children }) => (
  <button onClick={onClick}
    className="flex items-center gap-2 px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-black transition hover:brightness-110"
    style={{ background: "#a3e635", borderRadius: "8px" }}>
    {children}
  </button>
);

/* ── Delete icon button ─────────────────────────────── */
export const DeleteButton = ({ onClick, disabled }) => (
  <button onClick={onClick} disabled={disabled}
    className="flex h-7 w-7 items-center justify-center rounded transition hover:bg-red-500/12"
    style={{ color: "rgba(248,113,113,0.45)" }}>
    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
    </svg>
  </button>
);

/* ── Submit form button ─────────────────────────────── */
export const SubmitButton = ({ submitting, label, loadingLabel, children, loading }) => {
  const isSubmitting = submitting || loading;
  const content = isSubmitting ? (loadingLabel || "Processing...") : (children || label || "Submit");
  return (
    <button type="submit" disabled={isSubmitting}
      className="mt-1 w-full py-3 text-[11px] font-black uppercase tracking-[0.28em] text-black transition hover:brightness-110 disabled:opacity-50"
      style={{ background: "#a3e635", borderRadius: "8px" }}>
      {content}
    </button>
  );
};

/* ── Empty state ────────────────────────────────────── */
export const EmptyState = ({ message }) => (
  <p className="py-12 text-center text-sm text-white/20">{message}</p>
);

/* ── Table container ────────────────────────────────── */
export const TableWrap = ({ children }) => (
  <div style={{ background: "linear-gradient(145deg,rgba(13,26,15,0.85) 0%,rgba(9,18,10,0.92) 100%)", borderRadius: "18px", border: "1px solid rgba(163,230,53,0.09)", overflow: "hidden" }}>
    {children}
  </div>
);
