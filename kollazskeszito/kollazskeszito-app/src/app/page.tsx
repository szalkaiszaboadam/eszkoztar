"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useCollage, LoadedImg } from "@/src/components/CollageContext";

// --- KOMPONENSEK ---

function ModeCard({ title, badge, desc, href, icon, disabled }: { title: string, badge: string, desc: string, href: string, icon: string, disabled: boolean }) {
  return (
    <Link href={disabled ? "#" : href} style={{ textDecoration: "none", opacity: disabled ? 0.5 : 1, pointerEvents: disabled ? "none" : "auto", display: "block", height: "100%" }}>
      <div style={{
        background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 16,
        padding: 24, display: "flex", flexDirection: "column", gap: 12,
        cursor: disabled ? "not-allowed" : "pointer", transition: "all 0.2s ease", height: "100%",
        boxShadow: "0 4px 12px rgba(0,0,0,0.02)"
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        e.currentTarget.style.borderColor = "var(--accent)";
        e.currentTarget.style.transform = "translateY(-4px)";
        e.currentTarget.style.boxShadow = "0 8px 24px var(--accent-glow)";
      }}
      onMouseLeave={(e) => {
        if (disabled) return;
        e.currentTarget.style.borderColor = "var(--border)";
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.02)";
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ fontSize: 28 }}>{icon}</div>
          <span style={{ fontSize: 10, fontWeight: 800, color: "var(--accent)", background: "rgba(91,80,232,0.1)", borderRadius: 6, padding: "4px 8px", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            {badge}
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: "var(--text)", marginBottom: 6 }}>{title}</h2>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>{desc}</p>
        </div>
      </div>
    </Link>
  );
}

// --- FŐALKALMAZÁS ---

export default function HomePage() {
  const { images, addFiles, removeImage, clearImages } = useCollage();
  const [isDragOver, setIsDragOver] = useState(false);
  const [previewImg, setPreviewImg] = useState<LoadedImg | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasImages = images.length > 0;
  const isAutoDisabled = !hasImages || images.length > 6;

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--bg)", padding: 24, boxSizing: "border-box", overflowY: "auto" }}>
      
      {/* FEJLÉC */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, flexShrink: 0, marginBottom: 24 }}>
        <div style={{ width: 44, height: 44, borderRadius: 10, background: "var(--accent)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 800 }}>⊞</div>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.02em" }}>Kollázskészítő</h1>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 32, maxWidth: 1100, width: "100%", margin: "0 auto", minHeight: 0 }}>
        
        {/* 1. LÉPÉS: KÉPFELTÖLTÉS */}
        <div style={{ 
          flexShrink: 0, height: 224, background: "var(--bg-panel)", border: "1px solid var(--border)", 
          borderRadius: 16, padding: 24, boxShadow: "0 4px 20px rgba(0,0,0,0.02)",
          display: "flex", flexDirection: "column"
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexShrink: 0 }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: "var(--text)" }}>1. Lépés: Képek feltöltése {hasImages && <span style={{ color: "var(--text-secondary)", fontSize: 13 }}>({images.length}/30)</span>}</h2>
            {hasImages && (
              <button onClick={clearImages} style={{ background: "none", border: "none", color: "var(--accent)", fontWeight: 700, cursor: "pointer", textDecoration: "underline", fontSize: 13 }}>
                Összes törlése
              </button>
            )}
          </div>

          <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
            {!hasImages ? (
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setIsDragOver(false); addFiles(e.dataTransfer.files); }}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  width: "100%", height: "100%",
                  border: `2px dashed ${isDragOver ? "var(--accent)" : "var(--border-medium)"}`, borderRadius: 12,
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer",
                  background: isDragOver ? "rgba(91,80,232,0.04)" : "var(--bg-elevated)", transition: "all 0.2s ease"
                }}
              >
                <div style={{ fontSize: 32, color: isDragOver ? "var(--accent)" : "var(--text-secondary)", lineHeight: 1 }}>⇪</div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text)", marginBottom: 2 }}>Húzd ide a képeket!</div>
                  <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Kattints a böngészéshez (max 30 db)</div>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 16, overflowX: "auto", width: "100%", alignItems: "center", padding: "12px 12px 12px 4px" }}>
                {images.map((img, i) => (
                  <div key={img.uid} style={{ position: "relative", width: 88, height: 88, flexShrink: 0 }}>
                    <div 
                      onClick={() => setPreviewImg(img)}
                      style={{
                        width: "100%", height: "100%", borderRadius: 10, overflow: "hidden", background: "#fff",
                        border: "1px solid var(--border-medium)", position: "relative", cursor: "zoom-in",
                        boxShadow: "0 2px 6px rgba(0,0,0,0.03)", transition: "transform 0.15s ease",
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.04)"}
                      onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
                      title="Nagyítás"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.src} alt={img.name} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                    </div>
                    
                    <button 
                      onClick={(e) => { e.stopPropagation(); removeImage(i); }} title="Törlés" 
                      style={{
                        position: "absolute", top: -8, right: -8, width: 24, height: 24, borderRadius: "50%",
                        background: "#fff", border: "1px solid #fca5a5", color: "#dc2626", 
                        display: "flex", alignItems: "center", justifyContent: "center", 
                        cursor: "pointer", padding: 0, boxShadow: "0 2px 6px rgba(0,0,0,0.15)", zIndex: 2
                      }}
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                      </svg>
                    </button>
                  </div>
                ))}
                
                {images.length < 30 && (
                  <div
                    onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={(e) => { e.preventDefault(); setIsDragOver(false); addFiles(e.dataTransfer.files); }}
                    onClick={() => fileInputRef.current?.click()}
                    title="További kép hozzáadása"
                    style={{
                      width: 88, height: 88, flexShrink: 0, // <--- INNEN KERÜLT KI AZ ALIGN-SELF!
                      border: `2px dashed ${isDragOver ? "var(--accent)" : "var(--border-medium)"}`,
                      borderRadius: 10, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
                      cursor: "pointer", background: isDragOver ? "rgba(91,80,232,0.04)" : "transparent",
                      color: isDragOver ? "var(--accent)" : "var(--text-secondary)", transition: "all 0.2s ease"
                    }}
                  >
                    <div style={{ fontSize: 28, fontWeight: 300, lineHeight: 1 }}>+</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 2. LÉPÉS: MÓDVÁLASZTÓ */}
        <div style={{ display: "flex", flexDirection: "column", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: "var(--text)" }}>2. Lépés: Válassz kollázs módot</h2>
            {!hasImages && <span style={{ color: "#ef4444", fontSize: 13, fontWeight: 600, background: "#fef2f2", padding: "2px 8px", borderRadius: 4 }}>Elsőnek tölts fel legalább 1 képet!</span>}
            {images.length > 6 && <span style={{ color: "#ef4444", fontSize: 13, fontWeight: 600, background: "#fef2f2", padding: "2px 8px", borderRadius: 4 }}>Automata módhoz max 6 kép engedélyezett!</span>}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
            <ModeCard disabled={!hasImages} href="/manualis" icon="🛠️" title="Manuális" badge="Pro" desc="Teljes szabadság. Te kezeled a rétegeket, méreteket és a pontos pozíciókat." />
            <ModeCard disabled={!hasImages} href="/segitett" icon="🎯" title="Segített" badge="Okos" desc="Szabad mozgástér, de intelligens mágneses rácsvonalakkal a tökéletes illesztésért." />
            <ModeCard disabled={isAutoDisabled} href="/automata" icon="⚡️" title="Automata" badge="Gyors" desc="Az algoritmus másodpercek alatt megtalálja a legjobb elrendezést. (Max 6 kép)" />
          </div>
        </div>

      </div>

      {/* --- PREVIEW MODAL --- */}
      {previewImg && (
        <div 
          onClick={() => setPreviewImg(null)} 
          style={{
            position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh",
            background: "rgba(0, 0, 0, 0.85)", backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 9999, cursor: "zoom-out", padding: 40
          }}
        >
          <button 
            onClick={() => setPreviewImg(null)}
            style={{
              position: "absolute", top: 24, right: 32, width: 44, height: 44, borderRadius: "50%",
              background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff",
              fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", transition: "background 0.2s ease"
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.2)"}
            onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}
          >✕</button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewImg.src} alt={previewImg.name} onClick={(e) => e.stopPropagation()} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 8, boxShadow: "0 10px 40px rgba(0,0,0,0.5)", cursor: "default" }} />
        </div>
      )}

      {/* Rejtett input */}
      <input ref={fileInputRef} type="file" multiple accept="image/*" style={{ display: "none" }} onChange={(e) => { if(e.target.files) addFiles(e.target.files); e.target.value = ''; }} />
    </div>
  );
}