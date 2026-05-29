"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { processAndCrop, computeLayouts, renderToCanvas, CroppedImage, AutoLayout } from "@/lib/autoCollage";

interface LoadedImg {
  el: HTMLImageElement;
  src: string;
  name: string;
  uid: string;
}

function uid() { return Math.random().toString(36).slice(2); }

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── LAYOUT PREVIEW CARD ───────────────────────────────────

function LayoutCard({
  layout, index, selected, onSelect,
}: {
  layout: AutoLayout; index: number; selected: boolean; onSelect: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (canvasRef.current) renderToCanvas(canvasRef.current, layout, "#ffffff");
  }, [layout]);

  return (
    <button
      onClick={onSelect}
      style={{
        flex: 1,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
        background: selected ? "rgba(91,80,232,0.06)" : "var(--bg-elevated)",
        border: `2px solid ${selected ? "var(--accent)" : "var(--border)"}`,
        borderRadius: 10, padding: "10px 10px 10px",
        cursor: "pointer", transition: "all 0.15s ease",
        boxShadow: selected ? "0 0 0 3px var(--accent-glow)" : "none",
        animation: `cardIn 0.35s cubic-bezier(0.22,1,0.36,1) ${index * 0.08}s both`,
        minWidth: 0,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: "100%", aspectRatio: "1",
          borderRadius: 6, border: "1px solid var(--border)",
          display: "block",
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{
          width: 16, height: 16, borderRadius: "50%", flexShrink: 0,
          border: `2px solid ${selected ? "var(--accent)" : "var(--border-medium)"}`,
          background: selected ? "var(--accent)" : "transparent",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {selected && <span style={{ color: "#fff", fontSize: 9, lineHeight: 1 }}>✓</span>}
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: selected ? "var(--accent)" : "var(--text-secondary)" }}>
          {index + 1}. változat
        </span>
      </div>
    </button>
  );
}

// ── IMAGE THUMB ───────────────────────────────────────────

function ImageThumb({
  img, index, total, onRemove, onRotateCW, onRotateCCW, onMoveLeft, onMoveRight,
}: {
  img: LoadedImg; index: number; total: number;
  onRemove: () => void; onRotateCW: () => void; onRotateCCW: () => void;
  onMoveLeft: () => void; onMoveRight: () => void;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      background: "var(--bg-elevated)", border: "1px solid var(--border)",
      borderRadius: 8, padding: "6px 8px",
      animation: "cardIn 0.25s cubic-bezier(0.22,1,0.36,1) both",
    }}>
      {/* Thumbnail */}
      <div style={{
        width: 36, height: 36, borderRadius: 5, overflow: "hidden",
        background: "#fff", border: "1px solid var(--border)", flexShrink: 0,
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={img.src} alt={img.name}
          style={{ width: "100%", height: "100%", objectFit: "contain" }} />
      </div>

      {/* Name */}
      <span style={{
        fontSize: 11, color: "var(--text-secondary)", flex: 1,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0,
      }}>{img.name}</span>

      {/* Controls */}
      <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
        {[
          { label: "↺", title: "Forgatás balra", fn: onRotateCCW, dis: false },
          { label: "↻", title: "Forgatás jobbra", fn: onRotateCW, dis: false },
          { label: "←", title: "Mozgatás balra", fn: onMoveLeft, dis: index === 0 },
          { label: "→", title: "Mozgatás jobbra", fn: onMoveRight, dis: index === total - 1 },
          { label: "✕", title: "Törlés", fn: onRemove, dis: false, danger: true },
        ].map(({ label, title, fn, dis, danger }) => (
          <button key={label} title={title} onClick={fn} disabled={dis} style={{
            width: 24, height: 24, borderRadius: 5, fontSize: 11,
            border: `1px solid ${danger ? "#fca5a5" : "var(--border)"}`,
            background: danger ? "#fff1f1" : "var(--bg-panel)",
            color: dis ? "var(--border)" : danger ? "#dc2626" : "var(--text-secondary)",
            cursor: dis ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
          }}>{label}</button>
        ))}
      </div>
    </div>
  );
}

function Slider({ label, value, min, max, unit, onChange }: {
  label: string; value: number; min: number; max: number; unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 600, minWidth: 32 }}>{label}</span>
      <input type="range" min={min} max={max} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ flex: 1, accentColor: "var(--accent)" }} />
      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text)", minWidth: 28, textAlign: "right" }}>
        {value}{unit}
      </span>
    </div>
  );
}

// ── MAIN ──────────────────────────────────────────────────

export default function Home() {
  const [images, setImages] = useState<LoadedImg[]>([]);
  const [croppedImages, setCroppedImages] = useState<CroppedImage[]>([]);
  const [layouts, setLayouts] = useState<AutoLayout[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  const [showLayouts, setShowLayouts] = useState(false);
  const [gap, setGap] = useState(15);
  const [margin, setMargin] = useState(50);
  const [keepOrder, setKeepOrder] = useState(false);
  const [bgColor, setBgColor] = useState("#ffffff");
  const [computing, setComputing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files).filter(f => f.type.startsWith("image/"));
    if (!arr.length) return;
    const newImgs: LoadedImg[] = [];
    for (const file of arr) {
      try {
        const el = await loadImageFromFile(file);
        newImgs.push({ el, src: el.src, name: file.name, uid: uid() });
      } catch { /* skip */ }
    }
    setImages(prev => [...prev, ...newImgs].slice(0, 6));
  }, []);

  const rotateImage = useCallback((index: number, degrees: 90 | -90) => {
    setImages(prev => {
      const next = [...prev];
      const img = next[index];
      const canvas = document.createElement("canvas");
      canvas.width = img.el.height; canvas.height = img.el.width;
      const ctx = canvas.getContext("2d")!;
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((degrees * Math.PI) / 180);
      ctx.drawImage(img.el, -img.el.width / 2, -img.el.height / 2);
      const newSrc = canvas.toDataURL();
      const newEl = new Image(); newEl.src = newSrc;
      next[index] = { ...img, el: newEl, src: newSrc };
      return next;
    });
  }, []);

  const moveImage = useCallback((index: number, dir: -1 | 1) => {
    setImages(prev => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }, []);

  // Live recompute
  useEffect(() => {
    if (!images.length) { setCroppedImages([]); setLayouts([]); return; }
    const timer = setTimeout(() => {
      const cropped = images.map((img, i) => processAndCrop(img.el, i));
      const computed = computeLayouts(cropped, gap, margin, keepOrder);
      setCroppedImages(cropped);
      setLayouts(computed);
      setSelectedIdx(s => Math.min(s, computed.length - 1));
    }, 80);
    return () => clearTimeout(timer);
  }, [images, gap, margin, keepOrder]);

  const generate = useCallback(() => {
    if (!images.length) return;
    setComputing(true);
    setTimeout(() => {
      const cropped = images.map((img, i) => processAndCrop(img.el, i));
      const computed = computeLayouts(cropped, gap, margin, keepOrder);
      setCroppedImages(cropped);
      setLayouts(computed);
      setSelectedIdx(0);
      setShowLayouts(true);
      setComputing(false);
    }, 60);
  }, [images, gap, margin, keepOrder]);

  const download = useCallback(() => {
    if (!layouts[selectedIdx]) return;
    setDownloading(true);
    setTimeout(() => {
      const canvas = document.createElement("canvas");
      renderToCanvas(canvas, layouts[selectedIdx], bgColor);
      const now = new Date();
      const ds = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
      const ts = `${String(now.getHours()).padStart(2,"0")}-${String(now.getMinutes()).padStart(2,"0")}`;
      const a = document.createElement("a"); a.download = `kollazs_${ds}_${ts}.jpg`;
      a.href = canvas.toDataURL("image/jpeg", 0.93); a.click();
      setDownloading(false);
    }, 60);
  }, [selectedIdx, layouts, bgColor]);

  const hasImages = images.length > 0;

  return (
    <div style={{
      height: "100vh", display: "flex", flexDirection: "column",
      background: "var(--bg)", overflow: "hidden",
    }}>

      {/* ── HEADER ── */}
      <header style={{
        height: 48, flexShrink: 0,
        borderBottom: "1px solid var(--border)",
        padding: "0 20px", display: "flex", alignItems: "center", gap: 10,
        background: "var(--bg-panel)",
      }}>
        <div style={{
          width: 24, height: 24, borderRadius: 6, background: "var(--accent)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, color: "#fff", fontWeight: 800,
        }}>⊞</div>
        <span style={{ fontWeight: 800, fontSize: 14, letterSpacing: "-0.02em" }}>Kollázs</span>
        <span style={{
          fontSize: 9, fontWeight: 800, color: "var(--accent)",
          background: "rgba(91,80,232,0.1)", border: "1px solid rgba(91,80,232,0.25)",
          borderRadius: 4, padding: "1px 5px", letterSpacing: "0.06em",
        }}>AUTO</span>
      </header>

      {/* ── BODY ── */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>

        {/* ── BAL PANEL ── */}
        <aside style={{
          width: 300, flexShrink: 0,
          borderRight: "1px solid var(--border)",
          background: "var(--bg-panel)",
          display: "flex", flexDirection: "column",
          overflow: "hidden",
        }}>

          {/* Képek lista — scrollozható */}
          <div style={{ flex: 1, overflowY: "auto", padding: "14px 14px 0" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>
                Képek {hasImages ? `(${images.length}/6)` : ""}
              </span>
              <div style={{ display: "flex", gap: 5 }}>
                {hasImages && (
                  <button onClick={() => { setImages([]); setShowLayouts(false); }} style={{
                    background: "none", border: "1px solid var(--border)", borderRadius: 5,
                    padding: "2px 7px", cursor: "pointer", fontSize: 10, color: "var(--text-secondary)", fontFamily: "inherit",
                  }}>Összes törlése</button>
                )}
                {images.length < 6 && (
                  <button onClick={() => fileInputRef.current?.click()} style={{
                    background: "var(--accent)", border: "none", borderRadius: 5,
                    padding: "2px 9px", cursor: "pointer", fontSize: 10, color: "#fff",
                    fontFamily: "inherit", fontWeight: 700,
                  }}>+ Hozzáad</button>
                )}
              </div>
            </div>

            {/* Drop zone */}
            {!hasImages && (
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setIsDragOver(false); addFiles(e.dataTransfer.files); }}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${isDragOver ? "var(--accent)" : "var(--border-medium)"}`,
                  borderRadius: 10, padding: "28px 16px",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                  cursor: "pointer", background: isDragOver ? "rgba(91,80,232,0.04)" : "var(--bg-elevated)",
                  transition: "all 0.2s ease",
                }}
              >
                <div style={{ fontSize: 24 }}>↑</div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 2 }}>Képek feltöltése</div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Húzd ide vagy kattints · max 6 db</div>
                </div>
              </div>
            )}

            {/* Image list */}
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {images.map((img, i) => (
                <ImageThumb key={img.uid} img={img} index={i} total={images.length}
                  onRemove={() => setImages(prev => prev.filter((_, j) => j !== i))}
                  onRotateCW={() => rotateImage(i, 90)}
                  onRotateCCW={() => rotateImage(i, -90)}
                  onMoveLeft={() => moveImage(i, -1)}
                  onMoveRight={() => moveImage(i, 1)} />
              ))}
              {/* Drop target ha már van kép */}
              {hasImages && images.length < 6 && (
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={(e) => { e.preventDefault(); setIsDragOver(false); addFiles(e.dataTransfer.files); }}
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    border: `1.5px dashed ${isDragOver ? "var(--accent)" : "var(--border)"}`,
                    borderRadius: 8, padding: "8px", textAlign: "center",
                    cursor: "pointer", color: "var(--text-secondary)", fontSize: 11,
                    background: isDragOver ? "rgba(91,80,232,0.04)" : "transparent",
                  }}
                >+ kép hozzáadása</div>
              )}
            </div>
          </div>

          {/* ── Beállítások — fixált alul ── */}
          <div style={{
            flexShrink: 0, borderTop: "1px solid var(--border)",
            padding: "10px 14px",
            display: "flex", flexDirection: "column", gap: 8,
          }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text)" }}>Beállítások</span>
            <Slider label="Rés" value={gap} min={0} max={60} unit="px" onChange={setGap} />
            <Slider label="Margó" value={margin} min={0} max={100} unit="px" onChange={setMargin} />
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 600, minWidth: 32 }}>Háttér</span>
              <div style={{ position: "relative", width: 22, height: 22 }}>
                <div style={{ width: 22, height: 22, borderRadius: 5, background: bgColor, border: "1.5px solid var(--border)" }} />
                <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)}
                  style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%", cursor: "pointer" }} />
              </div>
              <span style={{ fontSize: 10, color: "var(--text-secondary)", fontFamily: "monospace" }}>{bgColor}</span>
              <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 11, color: "var(--text-secondary)", marginLeft: "auto" }}>
                <input type="checkbox" checked={keepOrder} onChange={(e) => setKeepOrder(e.target.checked)}
                  style={{ accentColor: "var(--accent)", width: 12, height: 12 }} />
                Sorrend
              </label>
            </div>

            {/* CTA */}
            {!showLayouts ? (
              <button onClick={generate} disabled={!hasImages || computing} style={{
                height: 36, background: hasImages ? "var(--accent)" : "var(--bg-elevated)",
                color: hasImages ? "#fff" : "var(--text-secondary)",
                border: "none", borderRadius: 8,
                fontFamily: "inherit", fontSize: 12, fontWeight: 700,
                cursor: hasImages ? "pointer" : "not-allowed",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                boxShadow: hasImages ? "0 2px 10px var(--accent-glow)" : "none",
              }}>
                {computing ? "⟳ Generálás..." : "★ Elrendezések generálása"}
              </button>
            ) : (
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setShowLayouts(false)} style={{
                  height: 36, flex: 1, background: "var(--bg-elevated)", border: "1px solid var(--border)",
                  borderRadius: 8, fontFamily: "inherit", fontSize: 11, color: "var(--text-secondary)",
                  cursor: "pointer",
                }}>← Vissza</button>
                <button onClick={download} disabled={downloading} style={{
                  height: 36, flex: 2, background: "var(--accent)", color: "#fff",
                  border: "none", borderRadius: 8, fontFamily: "inherit", fontSize: 12, fontWeight: 700,
                  cursor: "pointer", boxShadow: "0 2px 10px var(--accent-glow)",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                }}>
                  {downloading ? "⟳ Letöltés..." : "↓ Letöltés"}
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* ── JOBB PANEL ── */}
        <main style={{
          flex: 1, display: "flex", flexDirection: "column",
          padding: 20, minWidth: 0, overflow: "hidden",
        }}>
          {!hasImages ? (
            <div style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
              color: "var(--text-secondary)", flexDirection: "column", gap: 10,
            }}>
              <div style={{ fontSize: 40, opacity: 0.2 }}>⊞</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>Automatikus kollázs</div>
              <div style={{ fontSize: 12, maxWidth: 220, textAlign: "center", lineHeight: 1.6 }}>
                Tölts fel képeket a bal oldalon
              </div>
            </div>
          ) : !showLayouts ? (
            /* ── Előnézet (generálás előtt) ── */
            <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 10 }}>
                Élő előnézet
              </div>
              <div style={{
                flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <div style={{ width: "100%", maxWidth: "min(100%, calc(100vh - 160px))", aspectRatio: "1" }}>
                  {layouts[0] ? (
                    <LiveCanvas layout={layouts[0]} bg={bgColor} />
                  ) : (
                    <div style={{
                      width: "100%", aspectRatio: "1", borderRadius: 10,
                      background: "var(--bg-elevated)", border: "1px solid var(--border)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: "var(--text-secondary)", fontSize: 12,
                    }}>Feldolgozás…</div>
                  )}
                </div>
              </div>
              <div style={{ marginTop: 10, fontSize: 11, color: "var(--accent)", textAlign: "center", fontWeight: 600 }}>
                Kattints az „Elrendezések generálása" gombra a 3 változat megtekintéséhez
              </div>
            </div>
          ) : (
            /* ── 3 változat egymás mellett ── */
            <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 10 }}>
                Válassz változatot
              </div>
              <div style={{
                flex: 1, minHeight: 0,
                display: "flex", gap: 14, alignItems: "stretch",
              }}>
                {layouts.map((layout, i) => (
                  <LayoutCard
                    key={layout.signature}
                    layout={layout}
                    index={i}
                    selected={selectedIdx === i}
                    onSelect={() => setSelectedIdx(i)}
                  />
                ))}
              </div>
            </div>
          )}
        </main>
      </div>

      <input ref={fileInputRef} type="file" multiple accept="image/*" style={{ display: "none" }}
        onChange={(e) => e.target.files && addFiles(e.target.files)} />
    </div>
  );
}

// ── LIVE CANVAS ───────────────────────────────────────────

function LiveCanvas({ layout, bg }: { layout: AutoLayout; bg: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (canvasRef.current) renderToCanvas(canvasRef.current, layout, bg);
  }, [layout, bg]);
  return (
    <canvas ref={canvasRef} style={{
      width: "100%", height: "100%",
      borderRadius: 10, border: "1px solid var(--border)",
      display: "block", background: bg,
      boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
    }} />
  );
}