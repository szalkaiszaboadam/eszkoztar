"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import Link from "next/link"; 
import { processAndCrop, computeLayouts, renderToCanvas, AutoLayout } from "@/src/lib/autoCollage";
import { LayoutCard, CompactImageThumb, QuickSelect } from "@/src/components/CollageUI"; 
import { useCollage } from "@/src/components/CollageContext"; 

const GAP_OPTIONS = [0, 10, 30, 80];
const MARGIN_OPTIONS = [0, 50, 150, 300];

export default function AutoCollagePage() {
  const { images, addFiles, removeImage, rotateImage, reorderImages, clearImages, shuffleImages } = useCollage(); 

  const [layouts, setLayouts] = useState<AutoLayout[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  const [gap, setGap] = useState(0);
  const [margin, setMargin] = useState(0);
  const [keepOrder, setKeepOrder] = useState(false);
  const [downloading, setDownloading] = useState(false);
  
  // Drag and drop state
  const [isDragOverDropzone, setIsDragOverDropzone] = useState(false);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- ÚJ: 6 KÉPES KORLÁTOZÁS AUTOMATA MÓDBAN ---
  const handleAutoUpload = useCallback((files: FileList | File[]) => {
    const slotsLeft = 6 - images.length;
    if (slotsLeft <= 0) {
      alert("Az Automata módban maximum 6 kép engedélyezett!");
      return;
    }
    
    const filesArray = Array.from(files);
    if (filesArray.length > slotsLeft) {
      alert(`Az Automata módban maximum 6 kép lehet! Ebből a feltöltésből csak az első ${slotsLeft} képet adjuk hozzá.`);
    }
    
    // Csak annyi képet adunk át a memóriának, amennyi szabad hely még van!
    addFiles(filesArray.slice(0, slotsLeft));
  }, [images.length, addFiles]);

  useEffect(() => {
    if (!images.length) { setLayouts([]); return; }
    const timer = setTimeout(() => {
      const cropped = images.map((img, i) => processAndCrop(img.el, i));
      const computed = computeLayouts(cropped, gap, margin, keepOrder);
      setLayouts(computed);
      setSelectedIdx(s => Math.min(s, computed.length - 1));
    }, 80);
    return () => clearTimeout(timer);
  }, [images, gap, margin, keepOrder]);

  const download = useCallback(() => {
    if (!layouts[selectedIdx]) return;
    setDownloading(true);
    setTimeout(() => {
      const canvas = document.createElement("canvas");
      renderToCanvas(canvas, layouts[selectedIdx], "#ffffff");
      const now = new Date();
      const ds = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
      const ts = `${String(now.getHours()).padStart(2,"0")}-${String(now.getMinutes()).padStart(2,"0")}`;
      const a = document.createElement("a");
      a.download = `kollazs_${ds}_${ts}.jpg`;
      a.href = canvas.toDataURL("image/jpeg", 0.93);
      a.click();
      setDownloading(false);
    }, 60);
  }, [selectedIdx, layouts]);

  const hasLayouts = layouts.length > 0;

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "var(--bg-elevated)", overflow: "hidden" }}>

      <header style={{
        height: 64, flexShrink: 0, borderBottom: "1px solid var(--border)", padding: "0 24px", 
        display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", background: "var(--bg-panel)", zIndex: 20
      }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none", justifySelf: "start" }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, color: "#fff", fontWeight: 800 }}>⊞</div>
          <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: "-0.02em", color: "var(--text)" }}>Kollázs</span>
        </Link>

        <div style={{ display: "flex", background: "var(--bg-elevated)", padding: 4, borderRadius: 10, border: "1px solid var(--border)", gap: 4, justifySelf: "center" }}>
          <Link href="/automata" style={{ padding: "8px 18px", background: "var(--bg-panel)", borderRadius: 6, fontSize: 13, fontWeight: 700, color: "var(--text)", textDecoration: "none", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 14 }}>⚡️</span> Automata
          </Link>
          <Link href="/segitett" style={{ padding: "8px 18px", background: "transparent", borderRadius: 6, fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", textDecoration: "none", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 14 }}>🎯</span> Segített
          </Link>
          <Link href="/manualis" style={{ padding: "8px 18px", background: "transparent", borderRadius: 6, fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", textDecoration: "none", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 14 }}>🛠️</span> Manuális
          </Link>
        </div>

        <button onClick={download} disabled={downloading || !hasLayouts} style={{ 
          height: 40, padding: "0 20px", background: hasLayouts ? "var(--accent)" : "var(--bg-elevated)", 
          color: hasLayouts ? "#fff" : "var(--text-secondary)", border: "none", borderRadius: 8, 
          fontFamily: "inherit", fontSize: 13, fontWeight: 800, cursor: hasLayouts ? "pointer" : "not-allowed", 
          display: "flex", alignItems: "center", gap: 8, boxShadow: hasLayouts ? "0 4px 14px var(--accent-glow)" : "none",
          justifySelf: "end"
        }}>
          {downloading ? "⟳ Mentés..." : "↓ Letöltés (2000×2000)"}
        </button>
      </header>

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
                onDragStart={(e) => {
                  e.dataTransfer.setData("idx", i.toString());
                  e.dataTransfer.effectAllowed = "move";
                  setDraggedIdx(i);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (draggedIdx !== null && draggedIdx !== i) setDragOverIdx(i);
                }}
                onDragLeave={() => {
                  if (dragOverIdx === i) setDragOverIdx(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const from = parseInt(e.dataTransfer.getData("idx"));
                  if (!isNaN(from) && from !== i) reorderImages(from, i);
                  setDraggedIdx(null);
                  setDragOverIdx(null);
                }}
                isDragTarget={dragOverIdx === i}
              />
            ))}
            
            {images.length < 6 && (
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragOverDropzone(true); }}
                onDragLeave={() => setIsDragOverDropzone(false)}
                // JAVÍTÁS: Itt már az új szűrőfüggvényt hívjuk a bedobott képeknél!
                onDrop={(e) => { e.preventDefault(); setIsDragOverDropzone(false); handleAutoUpload(e.dataTransfer.files); }}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  width: 76, height: 76, flexShrink: 0,
                  border: `2px dashed ${isDragOverDropzone ? "var(--accent)" : "var(--border-medium)"}`,
                  borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", background: isDragOverDropzone ? "rgba(91,80,232,0.04)" : "transparent",
                  color: isDragOverDropzone ? "var(--accent)" : "var(--text-secondary)", transition: "all 0.2s ease"
                }}
              >
                <div style={{ fontSize: 24, fontWeight: 300, lineHeight: 1 }}>+</div>
              </div>
            )}
          </div>

          <div style={{ width: 1, background: "var(--border-medium)", flexShrink: 0 }} />

          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 10, minWidth: 120 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, color: "var(--text)", padding: "4px 8px", background: keepOrder ? "rgba(91,80,232,0.08)" : "transparent", borderRadius: 6, transition: "all 0.2s ease" }}>
              <input type="checkbox" checked={keepOrder} onChange={(e) => setKeepOrder(e.target.checked)} style={{ accentColor: "var(--accent)", width: 14, height: 14 }} />
              Fix sorrend
            </label>

            <div style={{ display: "flex", gap: 6, padding: "0 6px" }}>
              <button disabled={images.length < 2} onClick={shuffleImages} title="Képek keverése" style={{ flex: 1, height: 32, borderRadius: 6, background: "var(--bg-panel)", border: "1px solid var(--border-medium)", display: "flex", alignItems: "center", justifyContent: "center", cursor: images.length < 2 ? "default" : "pointer", opacity: images.length < 2 ? 0.4 : 1, color: "var(--text)", transition: "all 0.2s ease", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="16 3 21 3 21 8"></polyline><line x1="4" y1="20" x2="21" y2="3"></line><polyline points="21 16 21 21 16 21"></polyline><line x1="15" y1="15" x2="21" y2="21"></line><line x1="4" y1="4" x2="9" y2="9"></line>
                </svg>
              </button>
              <button disabled={images.length === 0} onClick={clearImages} title="Összes törlése" style={{ flex: 1, height: 32, borderRadius: 6, background: images.length === 0 ? "var(--bg-panel)" : "#fef2f2", border: `1px solid ${images.length === 0 ? "var(--border-medium)" : "#fca5a5"}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: images.length === 0 ? "default" : "pointer", opacity: images.length === 0 ? 0.4 : 1, color: images.length === 0 ? "var(--text-secondary)" : "#dc2626", transition: "all 0.2s ease", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          </div>

        </div>

        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", background: "var(--bg-elevated)", border: "1px solid var(--border-medium)", borderRadius: 12, padding: "12px 20px", gap: 12, flexShrink: 0, width: 300 }}>
          <QuickSelect label="Rés" value={gap} options={GAP_OPTIONS} onChange={setGap} />
          <QuickSelect label="Margó" value={margin} options={MARGIN_OPTIONS} onChange={setMargin} />
        </div>

      </div>

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

      {/* JAVÍTÁS: Itt is az új szűrőfüggvényt hívjuk, amikor rákattint valaki a fájlválasztóra! */}
      <input ref={fileInputRef} type="file" multiple accept="image/*" style={{ display: "none" }} onChange={(e) => { if(e.target.files) handleAutoUpload(e.target.files); e.target.value = ''; }} />
    </div>
  );
}