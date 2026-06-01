"use client";

import { useRef, useEffect } from "react";
import { renderPreview, AutoLayout } from "@/src/lib/autoCollage";
import { LoadedImg } from "./CollageContext"; 

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

// --- JAVÍTVA: Tiszta Drag & Drop kártya nyilak nélkül ---
export function CompactImageThumb({ 
  img, onRemove, onRotate, 
  onDragStart, onDragOver, onDragLeave, onDrop, isDragTarget 
}: {
  img: LoadedImg; onRemove: () => void; onRotate: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent) => void;
  isDragTarget?: boolean;
}) {
  return (
    <div 
      draggable={!!onDragStart}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={{
        position: "relative", width: 76, height: 76, flexShrink: 0,
        borderRadius: 8, overflow: "hidden", background: "#fff", 
        border: `2px solid ${isDragTarget ? "var(--accent)" : "var(--border-medium)"}`, 
        boxShadow: isDragTarget ? "0 4px 16px var(--accent-glow)" : "0 2px 4px rgba(0,0,0,0.02)",
        cursor: onDragStart ? "grab" : "default",
        transition: "all 0.2s ease",
        transform: isDragTarget ? "scale(1.05)" : "scale(1)"
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={img.src} alt={img.name} style={{ width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none" }} />
      
      {/* Forgatás Gomb (Bal Felső) */}
      <button onClick={(e) => { e.stopPropagation(); onRotate(); }} title="Forgatás" style={{
        position: "absolute", top: 4, left: 4, width: 22, height: 22, borderRadius: "50%",
        background: "rgba(255,255,255,0.95)", border: "1px solid var(--border-medium)", color: "var(--text)",
        display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0, zIndex: 10
      }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 2v6h-6"></path><path d="M21 13a9 9 0 1 1-3-7.7L21 8"></path>
        </svg>
      </button>

      {/* Törlés Gomb (Jobb Felső) */}
      <button onClick={(e) => { e.stopPropagation(); onRemove(); }} title="Törlés" style={{
        position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: "50%",
        background: "rgba(255,255,255,0.95)", border: "1px solid #fca5a5", color: "#dc2626",
        display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0, zIndex: 10
      }}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
  );
}

export function QuickSelect({ label, value, options, onChange }: {
  label: string; value: number; options: number[];
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <span style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 800, width: 44, flexShrink: 0, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </span>
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(4, 1fr)", flex: 1, background: "var(--bg-panel)", 
        padding: 4, borderRadius: 8, border: "1px solid var(--border-medium)", gap: 4
      }}>
        {options.map((opt) => (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            style={{
              padding: "6px 0", border: "none", borderRadius: 6,
              fontSize: 13, fontWeight: 800, cursor: "pointer",
              background: value === opt ? "var(--bg-elevated)" : "transparent",
              color: value === opt ? "var(--accent)" : "var(--text-secondary)",
              boxShadow: value === opt ? "0 2px 4px rgba(0,0,0,0.05)" : "none",
              transition: "all 0.2s ease"
            }}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}