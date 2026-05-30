"use client";

import { useRef, useEffect } from "react";
import { renderPreview, AutoLayout } from "@/src/lib/autoCollage";

// Típus, amit a képekre használunk
export interface LoadedImg {
  el: HTMLImageElement;
  src: string;
  name: string;
  uid: string;
}

export function LayoutCard({ layout, index, selected, onSelect }: {
  layout: AutoLayout; index: number; selected: boolean; onSelect: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    renderPreview(c, layout, "#ffffff", 800);
  }, [layout]);

  return (
    <button
      onClick={onSelect}
      style={{
        flex: "1 1 0", minWidth: 0, maxWidth: 380, 
        display: "flex", flexDirection: "column", alignItems: "stretch", gap: 12,
        background: selected ? "rgba(91,80,232,0.04)" : "var(--bg-panel)",
        border: `2px solid ${selected ? "var(--accent)" : "transparent"}`,
        borderRadius: 16, padding: 16,
        cursor: "pointer", transition: "all 0.2s ease",
        boxShadow: selected ? "0 4px 24px var(--accent-glow)" : "0 4px 12px rgba(0,0,0,0.03)",
      }}
    >
      <div style={{
        width: "100%", aspectRatio: "1 / 1", borderRadius: 8,
        border: "1px solid var(--border-medium)", background: "#fff",
        overflow: "hidden", position: "relative", flexShrink: 0,
      }}>
        <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", objectFit: "contain" }} />
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, flexShrink: 0 }}>
        <div style={{
          width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
          border: `2px solid ${selected ? "var(--accent)" : "var(--border-medium)"}`,
          background: selected ? "var(--accent)" : "transparent",
          display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s ease"
        }}>
          {selected && <span style={{ color: "#fff", fontSize: 12, lineHeight: 1 }}>✓</span>}
        </div>
        <span style={{ fontSize: 13, fontWeight: 800, color: selected ? "var(--accent)" : "var(--text-secondary)" }}>
          {index + 1}. változat
        </span>
      </div>
    </button>
  );
}

export function CompactImageThumb({ img, index, total, onRemove, onRotateCW, onRotateCCW, onMoveLeft, onMoveRight }: {
  img: LoadedImg; index: number; total: number;
  onRemove: () => void; onRotateCW: () => void; onRotateCCW: () => void;
  onMoveLeft: () => void; onMoveRight: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, width: 68, flexShrink: 0 }}>
      <div style={{
        width: 68, height: 68, borderRadius: 8, overflow: "hidden", background: "#fff", 
        border: "1px solid var(--border-medium)", position: "relative", boxShadow: "0 2px 4px rgba(0,0,0,0.02)"
      }}>
        <img src={img.src} alt={img.name} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
        <button onClick={onRemove} title="Törlés" style={{
          position: "absolute", top: 4, right: 4, width: 18, height: 18, borderRadius: "50%",
          background: "rgba(255,255,255,0.9)", border: "1px solid #fca5a5", color: "#dc2626",
          fontSize: 9, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", padding: 0, boxShadow: "0 1px 3px rgba(0,0,0,0.1)"
        }}>✕</button>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 2 }}>
        <button onClick={onRotateCCW} style={{ flex: 1, height: 20, borderRadius: 4, fontSize: 10, border: "1px solid var(--border-medium)", background: "var(--bg-panel)", cursor: "pointer", color: "var(--text-secondary)" }}>↺</button>
        <button onClick={onMoveLeft} disabled={index === 0} style={{ flex: 1, height: 20, borderRadius: 4, fontSize: 10, border: "1px solid var(--border-medium)", background: "var(--bg-panel)", cursor: index === 0 ? "default" : "pointer", opacity: index === 0 ? 0.3 : 1, color: "var(--text-secondary)" }}>←</button>
        <button onClick={onMoveRight} disabled={index === total - 1} style={{ flex: 1, height: 20, borderRadius: 4, fontSize: 10, border: "1px solid var(--border-medium)", background: "var(--bg-panel)", cursor: index === total - 1 ? "default" : "pointer", opacity: index === total - 1 ? 0.3 : 1, color: "var(--text-secondary)" }}>→</button>
      </div>
    </div>
  );
}

export function HorizontalSlider({ label, value, min, max, unit, onChange }: {
  label: string; value: number; min: number; max: number; unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600, width: 44, flexShrink: 0 }}>{label}</span>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ flex: 1, accentColor: "var(--accent)", cursor: "pointer" }} />
      <span style={{ fontSize: 12, fontWeight: 800, color: "var(--text)", width: 40, textAlign: "right", flexShrink: 0 }}>{value}{unit}</span>
    </div>
  );
}