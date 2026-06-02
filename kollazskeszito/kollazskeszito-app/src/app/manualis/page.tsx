"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useCollage } from "@/src/components/CollageContext";

type LayerState = {
  x: number;
  y: number;
  zoom: number;
  rot: number;
  visible: boolean;
};

export default function ManualisPage() {
  const { images, removeImage, reorderImages } = useCollage();

  const [layers, setLayers] = useState<Record<string, LayerState>>({});
  const [activeUid, setActiveUid] = useState<string | null>(null);
  
  const [canvasPixelSize, setCanvasPixelSize] = useState(800);
  const containerRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  // --- VÁSZON BEÁLLÍTÁSOK ---
  const [showGrid, setShowGrid] = useState(false);
const [gridDivisions, setGridDivisions] = useState(20); // 20x20-as háló az alapértelmezett
  const [isSnapEnabled, setIsSnapEnabled] = useState(true);
  const [activeSnapLines, setActiveSnapLines] = useState<{x: number | null, y: number | null}>({ x: null, y: null });

  useEffect(() => {
    const updateSize = (w: number, h: number) => {
      const minDim = Math.min(w, h) - 64;
      setCanvasPixelSize(Math.max(100, minDim));
    };

    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      updateSize(rect.width, rect.height);
    }

    const obs = new ResizeObserver((entries) => {
      for (let e of entries) {
        updateSize(e.contentRect.width, e.contentRect.height);
      }
    });

    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const canvasScale = canvasPixelSize / 2000;

  useEffect(() => {
    setLayers(prev => {
      const next = { ...prev };
      let changed = false;
      images.forEach(img => {
        if (!next[img.uid]) {
          next[img.uid] = { x: 0, y: 0, zoom: 0.8, rot: 0, visible: true };
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [images]);

  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, itemX: 0, itemY: 0 });

  const onPointerDownCanvas = (e: React.PointerEvent, uid: string) => {
    e.stopPropagation();
    if (layers[uid]?.visible === false) return;
    
    setActiveUid(uid);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    
    setIsDraggingCanvas(true);
    setDragStart({
      x: e.clientX,
      y: e.clientY,
      itemX: layers[uid].x,
      itemY: layers[uid].y
    });
  };

  const onPointerMoveCanvas = (e: React.PointerEvent) => {
    if (!isDraggingCanvas || !activeUid) return;
    
    const dx = (e.clientX - dragStart.x) / canvasScale;
    const dy = (e.clientY - dragStart.y) / canvasScale;

    let newX = dragStart.itemX + dx;
    let newY = dragStart.itemY + dy;

    let snapLineX: number | null = null;
    let snapLineY: number | null = null;

    if (isSnapEnabled) {
      const SNAP_THRESHOLD = 20; 
      
      const draggedImg = images.find(img => img.uid === activeUid);
      const draggedLayer = layers[activeUid];
      
      if (draggedImg && draggedLayer) {
        const baseScale = Math.min(2000 / draggedImg.el.width, 2000 / draggedImg.el.height) * 0.5;
        const w = draggedImg.el.width * baseScale * draggedLayer.zoom;
        const h = draggedImg.el.height * baseScale * draggedLayer.zoom;

        const cx = 1000 + newX;
        const cy = 1000 + newY;
        const left = cx - w / 2;
        const right = cx + w / 2;
        const top = cy - h / 2;
        const bottom = cy + h / 2;

        const targetsX: number[] = [0, 1000, 2000];
        const targetsY: number[] = [0, 1000, 2000];

        images.forEach(img => {
          if (img.uid !== activeUid && layers[img.uid]?.visible) {
            const l = layers[img.uid];
            const oBaseScale = Math.min(2000 / img.el.width, 2000 / img.el.height) * 0.5;
            const ow = img.el.width * oBaseScale * l.zoom;
            const oh = img.el.height * oBaseScale * l.zoom;
            const ocx = 1000 + l.x;
            const ocy = 1000 + l.y;
            
            targetsX.push(ocx, ocx - ow / 2, ocx + ow / 2);
            targetsY.push(ocy, ocy - oh / 2, ocy + oh / 2);
          }
        });

        let minDiffX = Infinity;
        let correctionX = 0;
        
        const checkX = (val: number, target: number) => {
          const diff = target - val;
          if (Math.abs(diff) < SNAP_THRESHOLD && Math.abs(diff) < Math.abs(minDiffX)) {
            minDiffX = diff;
            correctionX = diff;
            snapLineX = target;
          }
        };

        targetsX.forEach(tx => { checkX(cx, tx); checkX(left, tx); checkX(right, tx); });

        let minDiffY = Infinity;
        let correctionY = 0;

        const checkY = (val: number, target: number) => {
          const diff = target - val;
          if (Math.abs(diff) < SNAP_THRESHOLD && Math.abs(diff) < Math.abs(minDiffY)) {
            minDiffY = diff;
            correctionY = diff;
            snapLineY = target;
          }
        };

        targetsY.forEach(ty => { checkY(cy, ty); checkY(top, ty); checkY(bottom, ty); });

        newX += correctionX;
        newY += correctionY;
      }
    }

    setActiveSnapLines({ x: snapLineX, y: snapLineY });

    setLayers(prev => ({
      ...prev,
      [activeUid]: {
        ...prev[activeUid],
        x: newX,
        y: newY
      }
    }));
  };

  const onPointerUpCanvas = (e: React.PointerEvent) => {
    setIsDraggingCanvas(false);
    setActiveSnapLines({ x: null, y: null });
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  const [draggedListIdx, setDraggedListIdx] = useState<number | null>(null);
  const [dragOverListIdx, setDragOverListIdx] = useState<number | null>(null);

  const updateLayer = (uid: string, updates: Partial<LayerState>) => {
    setLayers(prev => ({ ...prev, [uid]: { ...prev[uid], ...updates } }));
  };

  const updateActiveLayer = (updates: Partial<LayerState>) => {
    if (!activeUid) return;
    updateLayer(activeUid, updates);
  };

  const download = useCallback(() => {
    setDownloading(true);
    setTimeout(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 2000; canvas.height = 2000;
      const ctx = canvas.getContext("2d")!;
      
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, 2000, 2000);

      images.forEach(img => {
        const l = layers[img.uid];
        if (!l || !l.visible) return;
        
        ctx.save();
        ctx.translate(1000 + l.x, 1000 + l.y);
        ctx.rotate(l.rot * Math.PI / 180);
        
        const baseScale = Math.min(2000 / img.el.width, 2000 / img.el.height) * 0.5;
        const finalScale = baseScale * l.zoom;
        const w = img.el.width * finalScale;
        const h = img.el.height * finalScale;
        
        ctx.drawImage(img.el, -w / 2, -h / 2, w, h);
        ctx.restore();
      });

      const now = new Date();
      const ds = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
      const ts = `${String(now.getHours()).padStart(2,"0")}-${String(now.getMinutes()).padStart(2,"0")}`;
      
      const a = document.createElement("a");
      a.download = `kollazs_manualis_${ds}_${ts}.jpg`;
      a.href = canvas.toDataURL("image/jpeg", 0.95);
      a.click();
      
      setDownloading(false);
    }, 100);
  }, [images, layers]);

  const activeLayerData = activeUid ? layers[activeUid] : null;

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "var(--bg-elevated)", overflow: "hidden" }}>
      
      <header style={{
        height: 64, flexShrink: 0, borderBottom: "1px solid var(--border)", padding: "0 24px", 
        display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", background: "var(--bg-panel)", zIndex: 30
      }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none", justifySelf: "start" }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, color: "#fff", fontWeight: 800 }}>⊞</div>
          <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: "-0.02em", color: "var(--text)" }}>Kollázs</span>
        </Link>

        <div style={{ display: "flex", background: "var(--bg-elevated)", padding: 4, borderRadius: 10, border: "1px solid var(--border)", gap: 4, justifySelf: "center" }}>
          <Link href="/automata" style={{ padding: "8px 18px", background: "transparent", borderRadius: 6, fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", textDecoration: "none", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 14 }}>⚡️</span> Automata
          </Link>
          <Link href="/segitett" style={{ padding: "8px 18px", background: "transparent", borderRadius: 6, fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", textDecoration: "none", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 14 }}>🎯</span> Segített
          </Link>
          <Link href="/manualis" style={{ padding: "8px 18px", background: "var(--bg-panel)", borderRadius: 6, fontSize: 13, fontWeight: 700, color: "var(--text)", textDecoration: "none", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 14 }}>🛠️</span> Manuális
          </Link>
        </div>

        <button onClick={download} disabled={downloading || !images.length} style={{ 
          height: 40, padding: "0 20px", background: images.length ? "var(--accent)" : "var(--bg-elevated)", 
          color: images.length ? "#fff" : "var(--text-secondary)", border: "none", borderRadius: 8, 
          fontFamily: "inherit", fontSize: 13, fontWeight: 800, cursor: images.length ? "pointer" : "not-allowed", 
          display: "flex", alignItems: "center", gap: 8, boxShadow: images.length ? "0 4px 14px var(--accent-glow)" : "none",
          justifySelf: "end", transition: "all 0.2s ease"
        }}>
          {downloading ? "⟳ Mentés..." : "↓ Letöltés (2000×2000)"}
        </button>
      </header>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        
        {/* BAL OSZLOP: Rétegek */}
        <aside style={{ width: 280, background: "var(--bg-panel)", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", zIndex: 20 }}>
          <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)" }}>
            <h2 style={{ fontSize: 14, fontWeight: 800, color: "var(--text)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Rétegek</h2>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>Fogd és vidd a sorrendhez (ami lent van, az kerül felülre a vásznon)</p>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "12px" }}>
            {images.length === 0 ? (
              <div style={{ padding: 20, textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>Nincs még feltöltve kép.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[...images].reverse().map((img, reversedIndex) => {
                  const actualIndex = images.length - 1 - reversedIndex;
                  const lState = layers[img.uid];
                  const isActive = activeUid === img.uid;
                  const isDragTarget = dragOverListIdx === actualIndex;

                  if (!lState) return null;

                  return (
                    <div 
                      key={img.uid} draggable
                      onDragStart={(e) => { e.dataTransfer.setData("idx", actualIndex.toString()); setDraggedListIdx(actualIndex); }}
                      onDragOver={(e) => { e.preventDefault(); if (draggedListIdx !== null && draggedListIdx !== actualIndex) setDragOverListIdx(actualIndex); }}
                      onDragLeave={() => { if (dragOverListIdx === actualIndex) setDragOverListIdx(null); }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const from = parseInt(e.dataTransfer.getData("idx"));
                        if (!isNaN(from) && from !== actualIndex) reorderImages(from, actualIndex);
                        setDraggedListIdx(null); setDragOverListIdx(null);
                      }}
                      onClick={() => setActiveUid(img.uid)}
                      style={{
                        display: "flex", alignItems: "center", gap: 12, padding: "8px 12px",
                        background: isActive ? "rgba(91,80,232,0.06)" : "var(--bg-elevated)",
                        border: `1px solid ${isDragTarget ? "var(--accent)" : isActive ? "rgba(91,80,232,0.3)" : "var(--border-medium)"}`,
                        borderRadius: 8, cursor: "grab", transition: "all 0.15s ease", opacity: lState.visible ? 1 : 0.5
                      }}
                    >
                      <div style={{ width: 32, height: 32, borderRadius: 4, background: "#fff", border: "1px solid var(--border-medium)", flexShrink: 0, overflow: "hidden" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img.src} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                      </div>
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: isActive ? "var(--accent)" : "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Réteg {actualIndex + 1}</span>
                      
                      <div style={{ display: "flex", gap: 4 }}>
                        <button onClick={(e) => { e.stopPropagation(); updateLayer(img.uid, { visible: !lState.visible }); }} title="Láthatóság" style={{ width: 24, height: 24, borderRadius: 4, border: "none", background: "transparent", color: "var(--text-secondary)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>{lState.visible ? "👁️" : "🙈"}</button>
                        <button onClick={(e) => { e.stopPropagation(); if (activeUid === img.uid) setActiveUid(null); removeImage(actualIndex); }} title="Törlés" style={{ width: 24, height: 24, borderRadius: 4, border: "none", background: "transparent", color: "#ef4444", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        {/* KÖZÉPSŐ OSZLOP: Vászon */}
        <main 
          ref={containerRef}
          onPointerDown={() => setActiveUid(null)} 
          style={{ 
            flex: 1, background: "var(--bg)", position: "relative", overflow: "hidden",
            // JAVÍTÁS: Letiltjuk a böngésző natív kék kijelölését a teljes munkaterületen!
            userSelect: "none", WebkitUserSelect: "none", touchAction: "none" 
          }}
        >
          <div style={{
              position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
              width: canvasPixelSize, height: canvasPixelSize, background: "#ffffff",
              boxShadow: "0 10px 40px rgba(0,0,0,0.08)", overflow: "hidden"
          }}>
              <div style={{
                  width: 2000, height: 2000, transformOrigin: "top left",
                  transform: `scale(${canvasScale})`, position: "absolute", top: 0, left: 0
              }}>
                 {/* 1. KÉPEK RÉTEGE */}
                 {images.map((img, index) => {
                    const l = layers[img.uid];
                    if (!l || !l.visible) return null;
                    const isActive = activeUid === img.uid;

                    const baseScale = Math.min(2000 / img.el.width, 2000 / img.el.height) * 0.5;
                    const w = img.el.width * baseScale;
                    const h = img.el.height * baseScale;

                    return (
                      <div
                        key={img.uid}
                        onPointerDown={(e) => onPointerDownCanvas(e, img.uid)}
                        onPointerMove={onPointerMoveCanvas}
                        onPointerUp={onPointerUpCanvas}
                        onPointerCancel={onPointerUpCanvas}
                        style={{
                          position: "absolute", left: 1000 + l.x, top: 1000 + l.y,
                          width: w, height: h,
                          transform: `translate(-50%, -50%) rotate(${l.rot}deg) scale(${l.zoom})`,
                          zIndex: index, 
                          // JAVÍTÁS: Zárt ököl kurzor, amikor épp húzod a képet!
                          cursor: isActive ? (isDraggingCanvas ? "grabbing" : "grab") : "pointer",
                          boxShadow: isActive ? "0 0 0 6px var(--accent)" : "none",
                          borderRadius: 4,
                          // JAVÍTÁS: A képekre is egyesével rátesszük a kijelölés blokkolását
                          userSelect: "none", WebkitUserSelect: "none", touchAction: "none"
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img.src} alt="" draggable={false} style={{ width: "100%", height: "100%", display: "block", pointerEvents: "none", userSelect: "none" }} />
                      </div>
                    );
                 })}

                 {/* 2. JAVÍTOTT SVG RÁCS (A KÉPEK FÖLÖTT!) */}
                 <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 10000 }}>
                   {showGrid && (
                     <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" shapeRendering="crispEdges">
                       <defs>
                         <pattern id="gridPattern" width={2000 / gridDivisions} height={2000 / gridDivisions} patternUnits="userSpaceOnUse" x="0" y="0">
                           <path d={`M ${2000 / gridDivisions} 0 L 0 0 0 ${2000 / gridDivisions}`} fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth="2" />
                         </pattern>
                       </defs>
                       <rect width="100%" height="100%" fill="url(#gridPattern)" />
                     </svg>
                   )}
                   
                   {/* 3. VILÁGÍTÓ PIROS MÁGNESVONALAK */}
                   <svg width="100%" height="100%" style={{ position: "absolute", inset: 0 }}>
                     {activeSnapLines.x !== null && (
                       <line x1={activeSnapLines.x} y1="0" x2={activeSnapLines.x} y2="2000" stroke="#ef4444" strokeWidth="3" filter="drop-shadow(0px 0px 4px rgba(239,68,68,0.8))" />
                     )}
                     {activeSnapLines.y !== null && (
                       <line x1="0" y1={activeSnapLines.y} x2="2000" y2={activeSnapLines.y} stroke="#ef4444" strokeWidth="3" filter="drop-shadow(0px 0px 4px rgba(239,68,68,0.8))" />
                     )}
                   </svg>
                 </div>

              </div>
          </div>
        </main>

        {/* JOBB OSZLOP: Tulajdonságok */}
        <aside style={{ width: 280, background: "var(--bg-panel)", borderLeft: "1px solid var(--border)", display: "flex", flexDirection: "column", zIndex: 20, overflowY: "auto" }}>
          
          <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)" }}>
            <h2 style={{ fontSize: 14, fontWeight: 800, color: "var(--text)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 16 }}>Vászon</h2>
            
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: showGrid ? 12 : 16 }}>
              <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} style={{ accentColor: "var(--accent)", width: 16, height: 16 }} />
              Segédrács mutatása
            </label>

            {showGrid && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16, paddingLeft: 24 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>Rács sűrűsége</span>
                  <span style={{ fontSize: 11, fontWeight: 800, color: "var(--accent)" }}>{gridDivisions} × {gridDivisions}</span>
                </div>
                
                {/* ÚJ: Gomb rács a csúszka helyett (Max 7 lehetőség, 50x50-ig) */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {[10, 20, 40, 50].map((val) => (
                    <button
                      key={val}
                      onClick={() => setGridDivisions(val)}
                      style={{
                        padding: "6px 0",
                        background: gridDivisions === val ? "var(--bg-elevated)" : "transparent",
                        border: `1px solid ${gridDivisions === val ? "var(--accent)" : "var(--border-medium)"}`,
                        color: gridDivisions === val ? "var(--accent)" : "var(--text-secondary)",
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 800,
                        cursor: "pointer",
                        flex: "1 1 calc(25% - 6px)", // Oszlopokba rendezi őket
                        transition: "all 0.15s ease",
                        boxShadow: gridDivisions === val ? "0 2px 4px rgba(0,0,0,0.05)" : "none"
                      }}
                    >
                      {val}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
              <input type="checkbox" checked={isSnapEnabled} onChange={(e) => setIsSnapEnabled(e.target.checked)} style={{ accentColor: "var(--accent)", width: 16, height: 16 }} />
              Mágneses tapadás
            </label>
          </div>

          <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)" }}>
            <h2 style={{ fontSize: 14, fontWeight: 800, color: "var(--text)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Transzformáció</h2>
          </div>
          
          <div style={{ flex: 1, padding: "24px" }}>
            {!activeLayerData ? (
              <div style={{ textAlign: "center", color: "var(--text-secondary)", fontSize: 13, marginTop: 20 }}>
                <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.5 }}>🖱️</div>
                Válassz ki egy képet a vásznon<br/>vagy a rétegek között!
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Méret (Zoom)</span>
                    <span style={{ fontSize: 12, fontWeight: 800, color: "var(--accent)" }}>{activeLayerData.zoom.toFixed(2)}x</span>
                  </div>
                  <input type="range" min="0.1" max="3.0" step="0.05" value={activeLayerData.zoom} onChange={(e) => updateActiveLayer({ zoom: parseFloat(e.target.value) })} onDoubleClick={() => updateActiveLayer({ zoom: 1 })} style={{ accentColor: "var(--accent)", width: "100%" }} />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Forgatás</span>
                    <span style={{ fontSize: 12, fontWeight: 800, color: "var(--accent)" }}>{activeLayerData.rot}°</span>
                  </div>
                  <input type="range" min="-180" max="180" step="1" value={activeLayerData.rot} onChange={(e) => { let val = parseInt(e.target.value); const snaps = [-180, -135, -90, -45, 0, 45, 90, 135, 180]; for (let s of snaps) { if (Math.abs(val - s) < 5) val = s; } updateActiveLayer({ rot: val }); }} onDoubleClick={() => updateActiveLayer({ rot: 0 })} style={{ accentColor: "var(--accent)", width: "100%" }} />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <label style={{ fontSize: 10, fontWeight: 800, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>X Tengely</label>
                    <input type="number" value={Math.round(activeLayerData.x)} onChange={(e) => updateActiveLayer({ x: parseInt(e.target.value) || 0 })} style={{ width: "100%", padding: "8px", borderRadius: 6, border: "1px solid var(--border-medium)", background: "var(--bg-elevated)", fontSize: 13, fontFamily: "inherit" }} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <label style={{ fontSize: 10, fontWeight: 800, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Y Tengely</label>
                    <input type="number" value={Math.round(activeLayerData.y)} onChange={(e) => updateActiveLayer({ y: parseInt(e.target.value) || 0 })} style={{ width: "100%", padding: "8px", borderRadius: 6, border: "1px solid var(--border-medium)", background: "var(--bg-elevated)", fontSize: 13, fontFamily: "inherit" }} />
                  </div>
                </div>
                
                <button onClick={() => updateActiveLayer({ x: 0, y: 0, zoom: 0.8, rot: 0 })} style={{ marginTop: 12, padding: "10px", background: "var(--bg-elevated)", border: "1px solid var(--border-medium)", borderRadius: 8, color: "var(--text)", fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all 0.15s ease" }}>
                  Középre igazítás & Alaphelyzet
                </button>

              </div>
            )}
          </div>
        </aside>

      </div>
    </div>
  );
}