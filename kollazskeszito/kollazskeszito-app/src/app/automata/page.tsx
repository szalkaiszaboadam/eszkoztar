"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { processAndCrop, computeLayouts, renderToCanvas, AutoLayout } from "@/src/lib/autoCollage";
import { LoadedImg, LayoutCard, CompactImageThumb, HorizontalSlider } from "@/src/components/CollageUI";

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

export default function AutoCollagePage() {
  const [images, setImages] = useState<LoadedImg[]>([]);
  const [layouts, setLayouts] = useState<AutoLayout[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  const [gap, setGap] = useState(15);
  const [margin, setMargin] = useState(50);
  const [keepOrder, setKeepOrder] = useState(false);
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

  const hasImages = images.length > 0;
  const hasLayouts = layouts.length > 0;

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "var(--bg-elevated)", overflow: "hidden" }}>

      {/* FEJLÉC ÉS EXPORT */}
      <header style={{
        height: 64, flexShrink: 0, borderBottom: "1px solid var(--border)", padding: "0 24px", 
        display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--bg-panel)", zIndex: 20
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link href="/" style={{ textDecoration: "none", color: "var(--text-secondary)", fontSize: 13, fontWeight: 800, marginRight: 16 }}>← Vissza</Link>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, color: "#fff", fontWeight: 800 }}>⊞</div>
          <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: "-0.02em", color: "var(--text)" }}>Kollázs</span>
          <span style={{ fontSize: 10, fontWeight: 800, color: "var(--accent)", background: "rgba(91,80,232,0.1)", borderRadius: 6, padding: "3px 8px", letterSpacing: "0.06em" }}>AUTO</span>
        </div>
        <button onClick={download} disabled={downloading || !hasLayouts} style={{ height: 40, padding: "0 20px", background: hasLayouts ? "var(--accent)" : "var(--bg-elevated)", color: hasLayouts ? "#fff" : "var(--text-secondary)", border: "none", borderRadius: 8, fontFamily: "inherit", fontSize: 13, fontWeight: 800, cursor: hasLayouts ? "pointer" : "not-allowed", display: "flex", alignItems: "center", gap: 8, boxShadow: hasLayouts ? "0 4px 14px var(--accent-glow)" : "none" }}>
          {downloading ? "⟳ Mentés..." : "↓ Letöltés (2000×2000)"}
        </button>
      </header>

      {/* VÍZSZINTES VEZÉRLŐPULT */}
      <div style={{ flexShrink: 0, background: "var(--bg-panel)", borderBottom: "1px solid var(--border)", padding: "16px 24px", display: "flex", alignItems: "center", gap: 32, zIndex: 10 }}>
        
        {/* Képek */}
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 24, minWidth: 0 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, width: 90, flexShrink: 0 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Forrásképek</span>
            <span style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 600 }}>{images.length} / 6 kép</span>
            {hasImages && <button onClick={() => setImages([])} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "var(--accent)", fontWeight: 700, textAlign: "left", padding: 0, marginTop: 4 }}>Összes törlése</button>}
          </div>
          <div style={{ display: "flex", gap: 12, overflowX: "auto", alignItems: "center", paddingBottom: 4 }}>
            {images.map((img, i) => (
              <CompactImageThumb key={img.uid} img={img} index={i} total={images.length} onRemove={() => setImages(prev => prev.filter((_, j) => j !== i))} onRotateCW={() => rotateImage(i, 90)} onRotateCCW={() => rotateImage(i, -90)} onMoveLeft={() => moveImage(i, -1)} onMoveRight={() => moveImage(i, 1)} />
            ))}
            {images.length < 6 && (
              <div onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }} onDragLeave={() => setIsDragOver(false)} onDrop={(e) => { e.preventDefault(); setIsDragOver(false); addFiles(e.dataTransfer.files); }} onClick={() => fileInputRef.current?.click()} style={{ width: 68, height: 68, flexShrink: 0, alignSelf: "flex-start", border: `2px dashed ${isDragOver ? "var(--accent)" : "var(--border-medium)"}`, borderRadius: 8, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", background: isDragOver ? "rgba(91,80,232,0.04)" : "transparent", color: isDragOver ? "var(--accent)" : "var(--text-secondary)", transition: "all 0.2s ease" }}>
                <div style={{ fontSize: 24, fontWeight: 300, lineHeight: 1 }}>+</div>
              </div>
            )}
          </div>
        </div>

        <div style={{ width: 1, height: 60, background: "var(--border-medium)", flexShrink: 0 }} />

        {/* Csúszkák */}
        <div style={{ width: 280, display: "flex", flexDirection: "column", gap: 12, flexShrink: 0 }}>
          <HorizontalSlider label="Rés" value={gap} min={0} max={150} unit="px" onChange={setGap} />
          <HorizontalSlider label="Margó" value={margin} min={0} max={300} unit="px" onChange={setMargin} />
        </div>

        <div style={{ width: 1, height: 60, background: "var(--border-medium)", flexShrink: 0 }} />

        {/* Extrák */}
        <div style={{ width: 120, display: "flex", flexDirection: "column", justifyContent: "center", flexShrink: 0 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
            <input type="checkbox" checked={keepOrder} onChange={(e) => setKeepOrder(e.target.checked)} style={{ accentColor: "var(--accent)", width: 16, height: 16, flexShrink: 0 }} />
            Fix sorrend
          </label>
        </div>

      </div>

      {/* FŐ MUNKATERÜLET */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", background: "var(--bg)", minHeight: 0, overflow: "hidden", position: "relative" }}>
        <div style={{ padding: "40px 30px", display: "flex", flexDirection: "column", height: "100%", alignItems: "center", justifyContent: "center" }}>
          {!hasImages ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16, color: "var(--text-secondary)", opacity: 0.6 }}>
              <div style={{ fontSize: 56 }}>⊞</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: "var(--text)" }}>Kezdéshez tölts fel képeket a fenti sávban</div>
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

      <input ref={fileInputRef} type="file" multiple accept="image/*" style={{ display: "none" }} onChange={(e) => { if(e.target.files) addFiles(e.target.files); e.target.value = ''; }} />
    </div>
  );
}