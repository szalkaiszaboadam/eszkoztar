"use client";

import { useState } from "react";
import { Eye, EyeOff, Trash2, CheckSquare, XSquare, Wand2, Layers } from "lucide-react";
import { useManualMode } from "@/src/hooks/useManualMode";

type ManualState = ReturnType<typeof useManualMode>;
type Props = { state: ManualState };

// --- 2. BAL OSZLOP (RÉTEGEK) ---
export function LayerSidebar({ state }: Props) {
  const { images, layers, activeUids, setActiveUids, updateLayer, removeImage, reorderImages, toggleImageBg } = state;
  const [draggedListIdx, setDraggedListIdx] = useState<number | null>(null);
  const [dragOverListIdx, setDragOverListIdx] = useState<number | null>(null);

  return (
    <aside style={{ width: 300, background: "var(--bg-panel)", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", zIndex: 20 }}>
      <div style={{ padding: "20px 24px 12px 24px" }}>
        <h2 style={{ fontSize: 14, fontWeight: 800, color: "var(--text)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Rétegek</h2>
        <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>Fogd és vidd a sorrendhez. Shift kattintással többet is kijelölhetsz!</p>
      </div>

      {images.length > 0 && (
        <div style={{ padding: "0 12px 12px 12px", display: "flex", gap: "8px", borderBottom: "1px solid var(--border)" }}>
          <button onClick={() => setActiveUids(images.map(i => i.uid))} style={{ flex: 1, padding: "8px", background: "var(--bg-elevated)", border: "1px solid var(--border-medium)", borderRadius: "6px", fontSize: "12px", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", color: "var(--text)" }}>
            <CheckSquare size={14} /> Összes kijelölése
          </button>
          {activeUids.length > 0 && (
            <button onClick={() => setActiveUids([])} style={{ padding: "8px", background: "var(--bg-elevated)", border: "1px solid var(--border-medium)", borderRadius: "6px", cursor: "pointer", color: "var(--text-secondary)", display: "flex", alignItems: "center", justifyContent: "center" }} title="Kijelölés megszüntetése">
              <XSquare size={14} />
            </button>
          )}
        </div>
      )}

      <div style={{ flex: 1, overflowY: "auto", padding: "12px" }}>
        {images.length === 0 ? (
          <div style={{ padding: 20, textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>Nincs még feltöltve kép.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[...images].reverse().map((img, reversedIndex) => {
              const actualIndex = images.length - 1 - reversedIndex;
              const lState = layers[img.uid];
              const isActive = activeUids.includes(img.uid);
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
                  onClick={(e) => {
                    if (e.shiftKey || e.ctrlKey || e.metaKey) {
                      setActiveUids(prev => prev.includes(img.uid) ? prev.filter(id => id !== img.uid) : [...prev, img.uid]);
                    } else { setActiveUids([img.uid]); }
                  }}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
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
                    <button onClick={(e) => { e.stopPropagation(); toggleImageBg(img.uid); }} title="Fehér háttér eltüntetése" style={{ width: 26, height: 26, borderRadius: 4, border: "none", background: img.removeBg ? "rgba(91,80,232,0.1)" : "transparent", color: img.removeBg ? "var(--accent)" : "var(--text-secondary)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s" }}><Wand2 size={14} /></button>
                    <button onClick={(e) => { e.stopPropagation(); updateLayer(img.uid, { visible: !lState.visible }); }} title="Láthatóság" style={{ width: 26, height: 26, borderRadius: 4, border: "none", background: "transparent", color: "var(--text-secondary)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>{lState.visible ? <Eye size={14} /> : <EyeOff size={14} />}</button>
                    <button onClick={(e) => { e.stopPropagation(); setActiveUids(prev => prev.filter(id => id !== img.uid)); removeImage(actualIndex); }} title="Törlés" style={{ width: 26, height: 26, borderRadius: 4, border: "none", background: "transparent", color: "#ef4444", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Trash2 size={14} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}

// --- 3. KÖZÉPSŐ OSZLOP (VÁSZON) ---
export function WorkspaceCanvas({ state }: Props) {
  const { 
    containerRef, canvasPixelSize, canvasScale, showGrid, gridDivisions, activeSnapLines, 
    images, layers, activeUids, setActiveUids, processedImages,
    onPointerDownCanvas, onPointerMoveCanvas, onPointerUpCanvas, isDraggingCanvas 
  } = state;

  return (
    <main 
      ref={containerRef} onPointerDown={() => setActiveUids([])} 
      style={{ flex: 1, background: "var(--bg)", position: "relative", overflow: "hidden", userSelect: "none", WebkitUserSelect: "none", touchAction: "none" }}
    >
      <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: canvasPixelSize, height: canvasPixelSize, background: "#ffffff", boxShadow: "0 10px 40px rgba(0,0,0,0.08)", overflow: "hidden" }}>
        <div style={{ width: 2000, height: 2000, transformOrigin: "top left", transform: `scale(${canvasScale})`, position: "absolute", top: 0, left: 0 }}>
            {images.map((img, index) => {
              const l = layers[img.uid];
              if (!l || !l.visible) return null;
              const isActive = activeUids.includes(img.uid);

              const baseScale = Math.min(2000 / img.el.width, 2000 / img.el.height) * 0.5;
              const w = img.el.width * baseScale;
              const h = img.el.height * baseScale;
              
              const currentSrc = (img.removeBg && processedImages[img.uid]) ? processedImages[img.uid].src : img.src;

              return (
                <div
                  key={img.uid}
                  onPointerDown={(e) => onPointerDownCanvas(e, img.uid)}
                  onPointerMove={onPointerMoveCanvas}
                  onPointerUp={onPointerUpCanvas}
                  onPointerCancel={onPointerUpCanvas}
                  style={{
                    position: "absolute", left: 1000 + l.x, top: 1000 + l.y, width: w, height: h,
                    transform: `translate(-50%, -50%) rotate(${l.rot}deg) scale(${l.zoom})`,
                    zIndex: index, cursor: isActive ? (isDraggingCanvas ? "grabbing" : "grab") : "pointer",
                    boxShadow: isActive ? "0 0 0 6px var(--accent)" : "none", borderRadius: 4,
                    userSelect: "none", WebkitUserSelect: "none", touchAction: "none"
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={currentSrc} alt="" draggable={false} style={{ width: "100%", height: "100%", display: "block", pointerEvents: "none", userSelect: "none" }} />
                </div>
              );
            })}

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
              <svg width="100%" height="100%" style={{ position: "absolute", inset: 0 }}>
                {activeSnapLines.x !== null && <line x1={activeSnapLines.x} y1="0" x2={activeSnapLines.x} y2="2000" stroke="#ef4444" strokeWidth="3" filter="drop-shadow(0px 0px 4px rgba(239,68,68,0.8))" />}
                {activeSnapLines.y !== null && <line x1="0" y1={activeSnapLines.y} x2="2000" y2={activeSnapLines.y} stroke="#ef4444" strokeWidth="3" filter="drop-shadow(0px 0px 4px rgba(239,68,68,0.8))" />}
              </svg>
            </div>
        </div>
      </div>
    </main>
  );
}

// --- 4. JOBB OSZLOP (TULAJDONSÁGOK) ---
export function PropertiesSidebar({ state }: Props) {
  const { 
    showGrid, setShowGrid, gridDivisions, setGridDivisions, isSnapEnabled, setIsSnapEnabled, 
    activeLayerData, activeUids, updateActiveLayers, setImagesBg, setAllImagesBg, images
  } = state;

  const isAllBgRemoved = images.length > 0 && images.every(img => img.removeBg);
  const activeImg = activeUids.length > 0 ? images.find(i => i.uid === activeUids[0]) : null;

  return (
    <aside style={{ width: 300, background: "var(--bg-panel)", borderLeft: "1px solid var(--border)", display: "flex", flexDirection: "column", zIndex: 20, overflowY: "auto" }}>
      
      <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)", background: "rgba(91,80,232,0.03)" }}>
        <h2 style={{ fontSize: 14, fontWeight: 800, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
          <Layers size={16} /> Globális Képek
        </h2>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
          {/* JAVÍTÁS: !! logikai típus-kényszerítés */}
          <input type="checkbox" checked={!!isAllBgRemoved} onChange={(e) => setAllImagesBg(e.target.checked)} style={{ accentColor: "var(--accent)", width: 16, height: 16 }} />
          Minden háttér eltüntetése
        </label>
      </div>

      <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)" }}>
        <h2 style={{ fontSize: 14, fontWeight: 800, color: "var(--text)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 16 }}>Vászon</h2>
        
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: showGrid ? 12 : 16 }}>
          <input type="checkbox" checked={!!showGrid} onChange={(e) => setShowGrid(e.target.checked)} style={{ accentColor: "var(--accent)", width: 16, height: 16 }} />
          Segédrács mutatása
        </label>

        {showGrid && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16, paddingLeft: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>Rács sűrűsége</span>
              <span style={{ fontSize: 11, fontWeight: 800, color: "var(--accent)" }}>{gridDivisions} × {gridDivisions}</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {[2, 4, 10, 20, 25, 40, 50].map((val) => (
                <button key={val} onClick={() => setGridDivisions(val)} style={{ padding: "6px 0", background: gridDivisions === val ? "var(--bg-elevated)" : "transparent", border: `1px solid ${gridDivisions === val ? "var(--accent)" : "var(--border-medium)"}`, color: gridDivisions === val ? "var(--accent)" : "var(--text-secondary)", borderRadius: 6, fontSize: 12, fontWeight: 800, cursor: "pointer", flex: "1 1 calc(25% - 6px)", transition: "all 0.15s ease", boxShadow: gridDivisions === val ? "0 2px 4px rgba(0,0,0,0.05)" : "none" }}>{val}</button>
              ))}
            </div>
          </div>
        )}

        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
          <input type="checkbox" checked={!!isSnapEnabled} onChange={(e) => setIsSnapEnabled(e.target.checked)} style={{ accentColor: "var(--accent)", width: 16, height: 16 }} />
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
            
            <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "14px", background: "rgba(91,80,232,0.04)", borderRadius: "8px", border: "1px solid rgba(91,80,232,0.15)" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, fontWeight: 800, color: "var(--accent)" }}>
                {/* JAVÍTÁS: !! és biztonsági fallback értékek */}
                <input type="checkbox" checked={!!activeImg?.removeBg} onChange={(e) => setImagesBg(activeUids, e.target.checked)} style={{ accentColor: "var(--accent)", width: 16, height: 16 }} />
                <Wand2 size={16} /> Fehér háttér eltüntetése
              </label>
              <span style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.4, fontWeight: 500 }}>
                Kijelölt képek automatikus feldolgozása. (Nem módosítja az eredeti képarányokat)
              </span>
            </div>

            {activeUids.length > 1 && (
              <div style={{ background: "rgba(91,80,232,0.1)", color: "var(--accent)", padding: "8px 12px", borderRadius: 6, fontSize: 11, fontWeight: 700, textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <CheckSquare size={14} /> {activeUids.length} kép kijelölve (csoportos mód)
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Méret (Zoom)</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: "var(--accent)" }}>{(activeLayerData.zoom ?? 1).toFixed(2)}x</span>
              </div>
              <input type="range" min="0.1" max="3.0" step="0.05" value={activeLayerData.zoom ?? 1} onChange={(e) => updateActiveLayers({ zoom: parseFloat(e.target.value) })} onDoubleClick={() => updateActiveLayers({ zoom: 1 })} style={{ accentColor: "var(--accent)", width: "100%" }} />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Forgatás</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: "var(--accent)" }}>{activeLayerData.rot ?? 0}°</span>
              </div>
              <input type="range" min="-180" max="180" step="1" value={activeLayerData.rot ?? 0} onChange={(e) => { let val = parseInt(e.target.value); const snaps = [-180, -135, -90, -45, 0, 45, 90, 135, 180]; for (let s of snaps) { if (Math.abs(val - s) < 5) val = s; } updateActiveLayers({ rot: val }); }} onDoubleClick={() => updateActiveLayers({ rot: 0 })} style={{ accentColor: "var(--accent)", width: "100%" }} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 10, fontWeight: 800, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>X Tengely</label>
                <input type="number" value={Math.round(activeLayerData.x ?? 0)} onChange={(e) => updateActiveLayers({ x: parseInt(e.target.value) || 0 })} style={{ width: "100%", padding: "8px", borderRadius: 6, border: "1px solid var(--border-medium)", background: "var(--bg-elevated)", fontSize: 13, fontFamily: "inherit" }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 10, fontWeight: 800, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Y Tengely</label>
                <input type="number" value={Math.round(activeLayerData.y ?? 0)} onChange={(e) => updateActiveLayers({ y: parseInt(e.target.value) || 0 })} style={{ width: "100%", padding: "8px", borderRadius: 6, border: "1px solid var(--border-medium)", background: "var(--bg-elevated)", fontSize: 13, fontFamily: "inherit" }} />
              </div>
            </div>
            
            <button onClick={() => updateActiveLayers({ x: 0, y: 0, zoom: 0.8, rot: 0 })} style={{ marginTop: 12, padding: "10px", background: "var(--bg-elevated)", border: "1px solid var(--border-medium)", borderRadius: 8, color: "var(--text)", fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all 0.15s ease" }}>
              Középre igazítás & Alaphelyzet
            </button>

          </div>
        )}
      </div>
    </aside>
  );
}