"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { processAndCrop, computeLayouts, renderToCanvas, AutoLayout } from "@/src/lib/autoCollage";
import { LayoutCard, HorizontalSlider } from "@/src/components/CollageUI";
import { useCollage } from "@/src/components/CollageContext"; // <-- GLOBÁLIS ÁLLAPOT

export default function AutoCollagePage() {
  // Innen jönnek a képek, amiket a főoldalon feltöltöttünk!
  const { images } = useCollage(); 

  const [layouts, setLayouts] = useState<AutoLayout[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  const [gap, setGap] = useState(15);
  const [margin, setMargin] = useState(50);
  const [keepOrder, setKeepOrder] = useState(false);
  const [downloading, setDownloading] = useState(false);

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

      <header style={{ height: 64, flexShrink: 0, borderBottom: "1px solid var(--border)", padding: "0 24px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", background: "var(--bg-panel)", zIndex: 20 }}>
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

        <button onClick={download} disabled={downloading || !hasLayouts} style={{ height: 40, padding: "0 20px", background: hasLayouts ? "var(--accent)" : "var(--bg-elevated)", color: hasLayouts ? "#fff" : "var(--text-secondary)", border: "none", borderRadius: 8, fontFamily: "inherit", fontSize: 13, fontWeight: 800, cursor: hasLayouts ? "pointer" : "not-allowed", display: "flex", alignItems: "center", gap: 8, boxShadow: hasLayouts ? "0 4px 14px var(--accent-glow)" : "none", justifySelf: "end" }}>
          {downloading ? "⟳ Mentés..." : "↓ Letöltés (2000×2000)"}
        </button>
      </header>

      <div style={{ flexShrink: 0, background: "var(--bg-panel)", borderBottom: "1px solid var(--border)", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "center", gap: 32, zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
          <HorizontalSlider label="Rés" value={gap} min={0} max={150} unit="px" onChange={setGap} />
          <div style={{ width: 1, height: 40, background: "var(--border-medium)" }} />
          <HorizontalSlider label="Margó" value={margin} min={0} max={300} unit="px" onChange={setMargin} />
          <div style={{ width: 1, height: 40, background: "var(--border-medium)" }} />
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
            <input type="checkbox" checked={keepOrder} onChange={(e) => setKeepOrder(e.target.checked)} style={{ accentColor: "var(--accent)", width: 16, height: 16 }} />
            Fix sorrend
          </label>
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
    </div>
  );
}