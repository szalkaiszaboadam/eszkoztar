"use client";

import React from "react";
import Link from "next/link";
import { Wand2 } from "lucide-react";
import { LayoutCard, CompactImageThumb, QuickSelect } from "@/src/components/SharedUI"; 
import { useAutoMode } from "@/src/hooks/useAutoMode";

type AutoState = ReturnType<typeof useAutoMode>;
type Props = { state: AutoState };

const GAP_OPTIONS = [0, 10, 30, 80];
const MARGIN_OPTIONS = [0, 50, 150, 300];

// --- 1. FELSŐ VEZÉRLŐSÁV ---
export function AutoControlBar({ state }: Props) {
  const { 
    images, removeImage, rotateImage, reorderImages, draggedIdx, setDraggedIdx,
    dragOverIdx, setDragOverIdx, isDragOverDropzone,
    setIsDragOverDropzone, handleAutoUpload, fileInputRef, setAllImagesBg, toggleImageBg,
    keepOrder, setKeepOrder, shuffleImages, clearImages, gap, setGap, margin, setMargin 
  } = state;

  // ÚJ
  const isAllBgRemoved = images.length > 0 && images.every(img => img.removeBg);

  return (
    <div style={{ flexShrink: 0, background: "var(--bg-panel)", borderBottom: "1px solid var(--border)", padding: "16px 24px", display: "flex", alignItems: "stretch", justifyContent: "space-between", gap: 16, overflowX: "auto", zIndex: 10 }}>
      
      <div style={{ display: "flex", flex: 1, background: "var(--bg-elevated)", border: "1px solid var(--border-medium)", borderRadius: 12, padding: "12px", gap: 16 }}>
        
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 60 }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Képek</span>
          <span style={{ fontSize: 16, color: "var(--text)", fontWeight: 800 }}>{images.length} / 6</span>
        </div>

        <div style={{ width: 1, background: "var(--border-medium)", flexShrink: 0 }} />

        <div style={{ display: "flex", gap: 12, alignItems: "center", flex: 1, overflowX: "auto", padding: "4px" }}>
          {images.map((img, i) => (
            <CompactImageThumb 
              key={img.uid} img={img} 
              onRemove={() => removeImage(i)} 
              onRotate={() => rotateImage(i, 90)}
              // ÚJ: Itt adjuk át a globális állapotot
              removeBg={img.removeBg}
              onToggleBg={() => toggleImageBg(img.uid)}
              onDragStart={(e: React.DragEvent) => { e.dataTransfer.setData("idx", i.toString()); e.dataTransfer.effectAllowed = "move"; setDraggedIdx(i); }}
              onDragOver={(e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (draggedIdx !== null && draggedIdx !== i) setDragOverIdx(i); }}
              onDragLeave={() => { if (dragOverIdx === i) setDragOverIdx(null); }}
              onDrop={(e: React.DragEvent) => { e.preventDefault(); const from = parseInt(e.dataTransfer.getData("idx")); if (!isNaN(from) && from !== i) reorderImages(from, i); setDraggedIdx(null); setDragOverIdx(null); }}
              isDragTarget={dragOverIdx === i}
            />
          ))}
          
          {images.length < 6 && (
            <div
              onDragOver={(e: React.DragEvent) => { e.preventDefault(); setIsDragOverDropzone(true); }}
              onDragLeave={() => setIsDragOverDropzone(false)}
              onDrop={(e: React.DragEvent) => { e.preventDefault(); setIsDragOverDropzone(false); handleAutoUpload(e.dataTransfer.files); }}
              onClick={() => fileInputRef.current?.click()}
              style={{
                width: 76, height: 76, flexShrink: 0, border: `2px dashed ${isDragOverDropzone ? "var(--accent)" : "var(--border-medium)"}`,
                borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", 
                background: isDragOverDropzone ? "rgba(91,80,232,0.04)" : "transparent",
                color: isDragOverDropzone ? "var(--accent)" : "var(--text-secondary)", transition: "all 0.2s ease"
              }}
            >
              <div style={{ fontSize: 24, fontWeight: 300, lineHeight: 1 }}>+</div>
            </div>
          )}
        </div>

        <div style={{ width: 1, background: "var(--border-medium)", flexShrink: 0 }} />

        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 8, minWidth: 160 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 11, fontWeight: 800, color: isAllBgRemoved ? "var(--accent)" : "var(--text)", padding: "6px 8px", background: isAllBgRemoved ? "rgba(91,80,232,0.08)" : "transparent", borderRadius: 6, transition: "all 0.2s ease", border: isAllBgRemoved ? "1px solid rgba(91,80,232,0.15)" : "1px solid transparent" }}>
            {/* JAVÍTÁS: !! logikai érték */}
            <input type="checkbox" checked={!!isAllBgRemoved} onChange={(e) => setAllImagesBg(e.target.checked)} style={{ accentColor: "var(--accent)", width: 14, height: 14 }} />
            <Wand2 size={14} /> Minden háttér ki/be
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 11, fontWeight: 800, color: "var(--text)", padding: "4px 8px", background: keepOrder ? "rgba(91,80,232,0.08)" : "transparent", borderRadius: 6, transition: "all 0.2s ease", border: "1px solid transparent" }}>
            {/* JAVÍTÁS: !! logikai érték */}
            <input type="checkbox" checked={!!keepOrder} onChange={(e) => setKeepOrder(e.target.checked)} style={{ accentColor: "var(--accent)", width: 14, height: 14 }} />
            Fix sorrend
          </label>
          <div style={{ display: "flex", gap: 6, padding: "0 6px" }}>
            <button disabled={images.length < 2} onClick={shuffleImages} title="Képek keverése" style={{ flex: 1, height: 28, borderRadius: 6, background: "var(--bg-panel)", border: "1px solid var(--border-medium)", display: "flex", alignItems: "center", justifyContent: "center", cursor: images.length < 2 ? "default" : "pointer", opacity: images.length < 2 ? 0.4 : 1, color: "var(--text)", transition: "all 0.2s ease", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 3 21 3 21 8"></polyline><line x1="4" y1="20" x2="21" y2="3"></line><polyline points="21 16 21 21 16 21"></polyline><line x1="15" y1="15" x2="21" y2="21"></line><line x1="4" y1="4" x2="9" y2="9"></line></svg>
            </button>
            <button disabled={images.length === 0} onClick={clearImages} title="Összes törlése" style={{ flex: 1, height: 28, borderRadius: 6, background: images.length === 0 ? "var(--bg-panel)" : "#fef2f2", border: `1px solid ${images.length === 0 ? "var(--border-medium)" : "#fca5a5"}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: images.length === 0 ? "default" : "pointer", opacity: images.length === 0 ? 0.4 : 1, color: images.length === 0 ? "var(--text-secondary)" : "#dc2626", transition: "all 0.2s ease", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", background: "var(--bg-elevated)", border: "1px solid var(--border-medium)", borderRadius: 12, padding: "12px 20px", gap: 12, flexShrink: 0, width: 300 }}>
        <QuickSelect label="Rés" value={gap} options={GAP_OPTIONS} onChange={setGap} />
        <QuickSelect label="Margó" value={margin} options={MARGIN_OPTIONS} onChange={setMargin} />
      </div>
    </div>
  );
}

// --- 2. KÖZÉPSŐ MUNKATERÜLET ---
export function AutoWorkspace({ state }: Props) {
  const { images, hasLayouts, layouts, selectedIdx, setSelectedIdx } = state;

  return (
    <main style={{ flex: 1, display: "flex", flexDirection: "column", background: "var(--bg)", minHeight: 0, overflow: "hidden", position: "relative" }}>
      <div style={{ padding: "40px 30px", display: "flex", flexDirection: "column", height: "100%", alignItems: "center", justifyContent: "center" }}>
        {!images.length ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16, color: "var(--text-secondary)", opacity: 0.6 }}>
            <div style={{ fontSize: 56 }}>⊞</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: "var(--text)" }}>Kezdéshez menj vissza a főoldalra és tölts fel képeket!</div>
            <Link href="/" style={{ padding: "10px 20px", background: "var(--text)", color: "var(--bg-panel)", borderRadius: 8, textDecoration: "none", fontWeight: 700, marginTop: 12 }}>← Vissza a feltöltéshez</Link>
          </div>
        ) : !hasLayouts ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)", fontSize: 15, fontWeight: 600 }}>Kollázs változatok generálása…</div>
        ) : (
          <div style={{ width: "100%", display: "flex", gap: 32, alignItems: "center", justifyContent: "center", flexWrap: "nowrap", minHeight: 0 }}>
            {layouts.map((layout, i) => (
              <LayoutCard key={layout.signature} layout={layout} index={i} selected={selectedIdx === i} onSelect={() => setSelectedIdx(i)} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}