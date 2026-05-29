"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { processAndCrop, computeLayouts, renderToCanvas, CroppedImage, AutoLayout } from "@/lib/autoCollage";

type Step = "upload" | "select" | "preview";

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

function LayoutCard({ layout, index, selected, onSelect }: {
  layout: AutoLayout; index: number; selected: boolean; onSelect: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (canvasRef.current) renderToCanvas(canvasRef.current, layout, "#1a1a1e");
  }, [layout]);

  return (
    <button
      onClick={onSelect}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
        background: selected ? "rgba(108,99,255,0.08)" : "var(--bg-panel)",
        border: `2px solid ${selected ? "var(--accent)" : "var(--border)"}`,
        borderRadius: "var(--radius)", padding: "14px 14px 16px",
        cursor: "pointer", transition: "all 0.18s ease",
        boxShadow: selected ? "0 0 24px var(--accent-glow)" : "none",
        animation: `cardIn 0.4s cubic-bezier(0.22,1,0.36,1) ${index * 0.1}s both`,
      }}
      onMouseEnter={(e) => {
        if (!selected) { e.currentTarget.style.borderColor = "var(--border-medium)"; e.currentTarget.style.transform = "translateY(-3px)"; }
      }}
      onMouseLeave={(e) => {
        if (!selected) { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.transform = ""; }
      }}
    >
      <canvas ref={canvasRef} style={{ width: 240, height: 240, borderRadius: 6, border: "1px solid var(--border)", display: "block" }} />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, width: "100%" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
          {index + 1}. változat
        </span>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          background: selected ? "var(--accent)" : "var(--bg-elevated)",
          color: selected ? "#fff" : "var(--text-secondary)",
          border: selected ? "none" : "1px solid var(--border)",
          borderRadius: 6, padding: "6px 14px", fontSize: 12, fontWeight: 700, width: "100%",
        }}>
          {selected ? "✓ Kiválasztva" : "Kiválasztás"}
        </div>
      </div>
    </button>
  );
}

function ImageThumb({ img, onRemove, onRotate }: { img: LoadedImg; onRemove: () => void; onRotate: () => void; }) {
  return (
    <div style={{
      position: "relative", width: 72, height: 72, borderRadius: 8, overflow: "hidden",
      border: "1.5px solid var(--border)", background: "var(--bg-sunken)", flexShrink: 0,
      animation: "cardIn 0.3s cubic-bezier(0.22,1,0.36,1) both",
    }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={img.src} alt={img.name} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
      <button onClick={onRemove} style={{
        position: "absolute", top: 3, right: 3, width: 20, height: 20, borderRadius: 4,
        background: "rgba(0,0,0,0.75)", border: "none", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", padding: 0, fontSize: 11,
      }}>✕</button>
      <button onClick={onRotate} title="Forgatás 90°" style={{
        position: "absolute", bottom: 3, right: 3, width: 20, height: 20, borderRadius: 4,
        background: "rgba(0,0,0,0.75)", border: "none", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", padding: 0, fontSize: 10,
      }}>↻</button>
    </div>
  );
}

function Slider({ label, value, min, max, unit, onChange }: {
  label: string; value: number; min: number; max: number; unit: string; onChange: (v: number) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600, minWidth: 36 }}>{label}</span>
      <input type="range" min={min} max={max} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: 120, accentColor: "var(--accent)" }} />
      <span style={{ fontSize: 12, color: "var(--text)", fontWeight: 700, minWidth: 36 }}>{value}{unit}</span>
    </div>
  );
}

export default function Home() {
  const [step, setStep] = useState<Step>("upload");
  const [images, setImages] = useState<LoadedImg[]>([]);
  const [layouts, setLayouts] = useState<AutoLayout[]>([]);
  const [croppedImages, setCroppedImages] = useState<CroppedImage[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [gap, setGap] = useState(15);
  const [margin, setMargin] = useState(50);
  const [keepOrder, setKeepOrder] = useState(false);
  const [computing, setComputing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedCanvasRef = useRef<HTMLCanvasElement>(null);

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

  const rotateImage = useCallback((index: number) => {
    setImages(prev => {
      const next = [...prev];
      const img = next[index];
      const canvas = document.createElement("canvas");
      canvas.width = img.el.height; canvas.height = img.el.width;
      const ctx = canvas.getContext("2d")!;
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(img.el, -img.el.width / 2, -img.el.height / 2);
      const newSrc = canvas.toDataURL();
      const newEl = new Image(); newEl.src = newSrc;
      next[index] = { ...img, el: newEl, src: newSrc };
      return next;
    });
  }, []);

  const generateLayouts = useCallback(() => {
    if (!images.length) return;
    setComputing(true);
    setSelectedIdx(null);
    setTimeout(() => {
      const cropped = images.map((img, i) => processAndCrop(img.el, i));
      const computed = computeLayouts(cropped, gap, margin, keepOrder);
      setCroppedImages(cropped);
      setLayouts(computed);
      setStep("select");
      setComputing(false);
    }, 60);
  }, [images, gap, margin, keepOrder]);

  // Live-update layouts when settings change on select step
  useEffect(() => {
    if (step !== "select" || !croppedImages.length) return;
    const computed = computeLayouts(croppedImages, gap, margin, keepOrder);
    setLayouts(computed);
    setSelectedIdx(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gap, margin, keepOrder]);

  const selectLayout = useCallback((idx: number) => {
    setSelectedIdx(idx);
    setStep("preview");
    setTimeout(() => {
      if (selectedCanvasRef.current) renderToCanvas(selectedCanvasRef.current, layouts[idx], "#ffffff");
    }, 30);
  }, [layouts]);

  const download = useCallback(() => {
    if (selectedIdx === null) return;
    setDownloading(true);
    setTimeout(() => {
      const canvas = document.createElement("canvas");
      renderToCanvas(canvas, layouts[selectedIdx], "#ffffff");
      const now = new Date();
      const ds = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
      const ts = `${String(now.getHours()).padStart(2,"0")}-${String(now.getMinutes()).padStart(2,"0")}`;
      const a = document.createElement("a");
      a.download = `kollazs_${ds}_${ts}.jpg`;
      a.href = canvas.toDataURL("image/jpeg", 0.92);
      a.click();
      setDownloading(false);
    }, 60);
  }, [selectedIdx, layouts]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragOver(false); addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const btnStyle = (active: boolean) => ({
    background: active ? "var(--accent)" : "var(--bg-elevated)",
    color: active ? "#fff" : "var(--text-secondary)",
    border: active ? "none" : "1px solid var(--border)",
    borderRadius: 8, padding: "9px 18px", cursor: active ? "pointer" : "not-allowed",
    fontFamily: "inherit", fontSize: 13, fontWeight: 700, display: "flex" as const,
    alignItems: "center" as const, gap: 7, transition: "all 0.18s ease",
    boxShadow: active ? "0 2px 16px var(--accent-glow)" : "none",
  });

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <header style={{
        borderBottom: "1px solid var(--border)", padding: "0 32px", height: 56,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "rgba(15,15,17,0.9)", backdropFilter: "blur(12px)",
        position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>⊞</div>
          <span style={{ fontWeight: 800, fontSize: 15, letterSpacing: "-0.02em" }}>Kollázs</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: "var(--accent)", background: "rgba(108,99,255,0.12)", border: "1px solid rgba(108,99,255,0.3)", borderRadius: 4, padding: "2px 6px", letterSpacing: "0.06em" }}>AUTO</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
          {(["upload","select","preview"] as Step[]).map((s, i) => (
            <span key={s} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {i > 0 && <span style={{ color: "var(--border-medium)" }}>›</span>}
              <span style={{ fontWeight: step === s ? 700 : 400, color: step === s ? "var(--text)" : "var(--text-secondary)" }}>
                {s === "upload" ? "Feltöltés" : s === "select" ? "Elrendezés" : "Előnézet"}
              </span>
            </span>
          ))}
        </div>
      </header>

      <main style={{ flex: 1, padding: "44px 32px", maxWidth: 1000, margin: "0 auto", width: "100%" }}>

        {/* ── UPLOAD ── */}
        {step === "upload" && (
          <div style={{ animation: "fadeUp 0.4s ease both" }}>
            <h1 style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.04em", marginBottom: 8 }}>
              Automatikus kollázs
            </h1>
            <p style={{ color: "var(--text-secondary)", fontSize: 15, marginBottom: 40, maxWidth: 480 }}>
              Tölts fel 1–6 képet. Az algoritmus megtalálja a legjobb 3 elrendezést az arányaid alapján.
            </p>

            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${isDragOver ? "var(--accent)" : "var(--border-medium)"}`,
                borderRadius: "var(--radius)", padding: "56px 32px",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 14,
                cursor: "pointer", background: isDragOver ? "rgba(108,99,255,0.06)" : "var(--bg-panel)",
                transition: "all 0.2s ease", marginBottom: 28,
                boxShadow: isDragOver ? "0 0 0 4px var(--accent-glow)" : "none",
              }}
            >
              <div style={{ fontSize: 36 }}>↑</div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 5 }}>Húzd ide a képeket, vagy kattints</div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Maximum 6 kép · PNG, JPG, WebP · Fehér háttér levágva</div>
              </div>
            </div>
            <input ref={fileInputRef} type="file" multiple accept="image/*" style={{ display: "none" }}
              onChange={(e) => e.target.files && addFiles(e.target.files)} />

            {images.length > 0 && (
              <div style={{ marginBottom: 28 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>
                    {images.length}/6 kép
                  </span>
                  <button onClick={() => setImages([])} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", fontSize: 12 }}>
                    ✕ Összes törlése
                  </button>
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {images.map((img, i) => (
                    <ImageThumb key={img.uid} img={img}
                      onRemove={() => setImages(prev => prev.filter((_, j) => j !== i))}
                      onRotate={() => rotateImage(i)} />
                  ))}
                </div>
              </div>
            )}

            <div style={{
              background: "var(--bg-panel)", border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)", padding: "16px 20px", marginBottom: 24,
              display: "flex", gap: 32, flexWrap: "wrap", alignItems: "center",
            }}>
              <Slider label="Rés" value={gap} min={0} max={60} unit="px" onChange={setGap} />
              <Slider label="Margó" value={margin} min={0} max={100} unit="px" onChange={setMargin} />
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "var(--text-secondary)" }}>
                <input type="checkbox" checked={keepOrder} onChange={(e) => setKeepOrder(e.target.checked)} style={{ accentColor: "var(--accent)" }} />
                Sorrend megtartása
              </label>
            </div>

            <button onClick={generateLayouts} disabled={!images.length || computing}
              style={btnStyle(images.length > 0 && !computing)}>
              {computing ? "⟳ Generálás..." : "★ Elrendezések generálása"}
            </button>
          </div>
        )}

        {/* ── SELECT ── */}
        {step === "select" && (
          <div style={{ animation: "fadeUp 0.4s ease both" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28 }}>
              <div>
                <h2 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.03em", marginBottom: 6 }}>Válassz elrendezést</h2>
                <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>
                  {layouts.length === 1 ? "Az algoritmus elkészítette az elrendezést" : `Az algoritmus megtalálta a legjobb ${layouts.length} elrendezést`}
                </p>
              </div>
              <button onClick={() => setStep("upload")} style={{
                background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 8,
                padding: "8px 14px", cursor: "pointer", color: "var(--text-secondary)", fontSize: 13, fontFamily: "inherit",
              }}>← Vissza</button>
            </div>

            <div style={{
              background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 8,
              padding: "12px 20px", marginBottom: 28, display: "flex", gap: 32, flexWrap: "wrap", alignItems: "center",
            }}>
              <Slider label="Rés" value={gap} min={0} max={60} unit="px" onChange={setGap} />
              <Slider label="Margó" value={margin} min={0} max={100} unit="px" onChange={setMargin} />
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "var(--text-secondary)" }}>
                <input type="checkbox" checked={keepOrder} onChange={(e) => setKeepOrder(e.target.checked)} style={{ accentColor: "var(--accent)" }} />
                Sorrend megtartása
              </label>
            </div>

            <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
              {layouts.map((layout, i) => (
                <LayoutCard key={layout.signature} layout={layout} index={i}
                  selected={selectedIdx === i} onSelect={() => selectLayout(i)} />
              ))}
            </div>
          </div>
        )}

        {/* ── PREVIEW ── */}
        {step === "preview" && selectedIdx !== null && (
          <div style={{ animation: "fadeUp 0.4s ease both" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28 }}>
              <div>
                <h2 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.03em", marginBottom: 6 }}>
                  {selectedIdx + 1}. változat
                </h2>
                <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>Letöltheted, vagy visszatérhetsz más változathoz</p>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setStep("select")} style={{
                  background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 8,
                  padding: "10px 16px", cursor: "pointer", color: "var(--text-secondary)", fontSize: 13, fontFamily: "inherit",
                }}>← Más változat</button>
                <button onClick={download} disabled={downloading} style={btnStyle(!downloading)}>
                  {downloading ? "⟳ Letöltés..." : "↓ Letöltés (JPEG)"}
                </button>
              </div>
            </div>

            <div style={{
              background: "var(--bg-panel)", border: "1px solid var(--border)",
              borderRadius: "var(--radius)", padding: 20, display: "inline-block",
            }}>
              <canvas ref={selectedCanvasRef} style={{ display: "block", maxWidth: "min(760px, 100%)", borderRadius: 6 }} />
            </div>

            <div style={{
              marginTop: 18, padding: "12px 16px", background: "var(--bg-panel)", border: "1px solid var(--border)",
              borderRadius: 8, display: "inline-flex", gap: 20, fontSize: 12, color: "var(--text-secondary)",
            }}>
              <span>📐 2000 × 2000 px</span>
              <span>🗜 JPEG · 92%</span>
              <span>✂️ Rés: {gap}px · Margó: {margin}px</span>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
