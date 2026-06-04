// src/app/page.tsx
"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useCollage, LoadedImg } from "@/src/components/CollageContext";
import { Wand2, Zap, Target, Wrench, MonitorX } from "lucide-react"; 
import { useIsMobile } from "@/src/components/SharedUI"; 

// --- KOMPONENSEK ---
function ModeCard({ title, desc, href, icon, disabled, mobileDisabledMsg }: { title: string, desc: string, href: string, icon: React.ReactNode, disabled: boolean, mobileDisabledMsg?: string }) {
  return (
    <Link href={disabled ? "#" : href} style={{ textDecoration: "none", opacity: disabled ? 0.6 : 1, pointerEvents: disabled ? "none" : "auto", display: "block", height: "100%" }}>
      <div style={{
        background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 16,
        padding: 24, display: "flex", flexDirection: "column", gap: 16,
        cursor: disabled ? "not-allowed" : "pointer", transition: "all 0.2s ease", height: "100%",
        boxShadow: "0 4px 12px rgba(0,0,0,0.02)"
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        e.currentTarget.style.borderColor = "var(--accent)";
        e.currentTarget.style.transform = "translateY(-6px)";
        e.currentTarget.style.boxShadow = "0 12px 32px var(--accent-glow)";
      }}
      onMouseLeave={(e) => {
        if (disabled) return;
        e.currentTarget.style.borderColor = "var(--border)";
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.02)";
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text)" }}>{icon}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: "var(--text)", marginBottom: 8 }}>{title}</h2>
          
          {disabled && mobileDisabledMsg && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#ef4444", fontSize: 13, fontWeight: 700, marginBottom: 8, background: "#fef2f2", padding: "4px 8px", borderRadius: 6, width: "fit-content" }}>
              <MonitorX size={14} /> {mobileDisabledMsg}
            </div>
          )}

          <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.5 }}>{desc}</p>
        </div>
      </div>
    </Link>
  );
}

// --- FŐ ALKALMAZÁS ---
export default function HomePage() {
  // JAVÍTÁS: Visszahúztuk a reorderImages-t is a Contextből!
  const { images, addFiles, removeImage, rotateImage, reorderImages, clearImages, toggleImageBg } = useCollage(); 
  const isMobile = useIsMobile(); 
  
  const [isDragOverDropzone, setIsDragOverDropzone] = useState(false);
  // JAVÍTÁS: Visszakerültek az állapotok az előnézethez és a drag&drophoz!
  const [previewImg, setPreviewImg] = useState<LoadedImg | null>(null);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const hasImages = images.length > 0;
  const isAutoDisabled = !hasImages || images.length > 6;

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--bg)", padding: isMobile ? "16px 16px 40px 16px" : "24px 24px 64px 24px", boxSizing: "border-box", overflowY: "auto" }}>
      
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: isMobile ? 24 : 48, marginBottom: isMobile ? 32 : 56, textAlign: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 12 : 20, marginBottom: 16 }}>
          <div style={{ width: isMobile ? 44 : 56, height: isMobile ? 44 : 56, borderRadius: 14, background: "var(--accent)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: isMobile ? 24 : 28, fontWeight: 800, boxShadow: "0 8px 24px var(--accent-glow)" }}>⊞</div>
          <h1 style={{ fontSize: isMobile ? 36 : 48, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.03em", lineHeight: 1 }}>Kollázs</h1>
        </div>
        <p style={{ fontSize: isMobile ? 14 : 16, color: "var(--text-secondary)", fontWeight: 500, padding: "0 16px" }}>Tölts fel képeket, és készíts profi elrendezéseket másodpercek alatt.</p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 32 : 48, maxWidth: 1000, width: "100%", margin: "0 auto" }}>
        
        {/* 1. LÉPÉS */}
        <div style={{ height: isMobile ? "auto" : 240, minHeight: 240, background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 20, padding: isMobile ? 20 : 28, boxShadow: "0 8px 32px rgba(0,0,0,0.03)", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexShrink: 0 }}>
            <h2 style={{ fontSize: isMobile ? 16 : 18, fontWeight: 800, color: "var(--text)" }}>1. Lépés: Képek feltöltése {hasImages && <span style={{ color: "var(--text-secondary)", fontSize: 14, fontWeight: 600 }}>({images.length}/30)</span>}</h2>
            {hasImages && (
              <button onClick={clearImages} style={{ background: "none", border: "none", color: "var(--accent)", fontWeight: 700, cursor: "pointer", textDecoration: "underline", fontSize: 14 }}>Törlés</button>
            )}
          </div>

          <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
            {!hasImages ? (
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragOverDropzone(true); }}
                onDragLeave={() => setIsDragOverDropzone(false)}
                onDrop={(e) => { e.preventDefault(); setIsDragOverDropzone(false); addFiles(e.dataTransfer.files); }}
                onClick={() => fileInputRef.current?.click()}
                style={{ width: "100%", height: "100%", minHeight: 140, border: `2px dashed ${isDragOverDropzone ? "var(--accent)" : "var(--border-medium)"}`, borderRadius: 12, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, cursor: "pointer", background: isDragOverDropzone ? "rgba(91,80,232,0.04)" : "var(--bg-elevated)", transition: "all 0.2s ease" }}
              >
                <div style={{ fontSize: 32, color: isDragOverDropzone ? "var(--accent)" : "var(--text-secondary)", lineHeight: 1 }}>↓</div>
                <div style={{ textAlign: "center", padding: "0 16px" }}>
                  <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text)", marginBottom: 4 }}>Kattints a feltöltéshez!</div>
                  <div style={{ fontSize: 14, color: "var(--text-secondary)" }}>(max 30 kép)</div>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 16, overflowX: "auto", width: "100%", alignItems: "center", padding: "4px" }}>
                {images.map((img, i) => (
                  <div key={img.uid} style={{ width: 88, height: 88, flexShrink: 0 }}>
                    {/* JAVÍTÁS: Visszakerült a teljes interakciós blokk! */}
                    <div 
                      onClick={() => setPreviewImg(img)}
                      draggable
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
                      style={{
                        width: "100%", height: "100%", borderRadius: 10, overflow: "hidden", background: "#fff",
                        border: `2px solid ${dragOverIdx === i ? "var(--accent)" : "var(--border-medium)"}`, position: "relative", cursor: "grab",
                        boxShadow: dragOverIdx === i ? "0 4px 16px var(--accent-glow)" : "0 2px 6px rgba(0,0,0,0.03)", transition: "all 0.2s ease",
                        transform: dragOverIdx === i ? "scale(1.05)" : "scale(1)"
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.src} alt={img.name} style={{ width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none" }} />
                      
                      {/* VISSZAKERÜLT A FORGATÁS GOMB */}
                      <button onClick={(e) => { e.stopPropagation(); rotateImage(i, 90); }} title="Forgatás" style={{
                        position: "absolute", top: 4, left: 4, width: 24, height: 24, borderRadius: "50%",
                        background: "rgba(255,255,255,0.95)", border: "1px solid var(--border-medium)", color: "var(--text)", 
                        display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0, zIndex: 10
                      }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 2v6h-6"></path><path d="M21 13a9 9 0 1 1-3-7.7L21 8"></path>
                        </svg>
                      </button>

                      <button onClick={(e) => { e.stopPropagation(); removeImage(i); }} title="Törlés" style={{
                        position: "absolute", top: 4, right: 4, width: 24, height: 24, borderRadius: "50%",
                        background: "rgba(255,255,255,0.95)", border: "1px solid #fca5a5", color: "#dc2626", 
                        display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0, zIndex: 10
                      }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                      </button>

                      <button onClick={(e) => { e.stopPropagation(); toggleImageBg(img.uid); }} title="Háttér eltüntetése" style={{
                        position: "absolute", bottom: 4, left: 4, width: 24, height: 24, borderRadius: "50%",
                        background: img.removeBg ? "rgba(91,80,232,0.95)" : "rgba(255,255,255,0.95)",
                        border: `1px solid ${img.removeBg ? "var(--accent)" : "var(--border-medium)"}`,
                        color: img.removeBg ? "#fff" : "var(--text-secondary)",
                        display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0, zIndex: 10,
                        transition: "all 0.2s ease"
                      }}>
                        <Wand2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
                {images.length < 30 && (
                  <div onClick={() => fileInputRef.current?.click()} style={{ width: 88, height: 88, flexShrink: 0, border: "2px dashed var(--border-medium)", borderRadius: 10, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><div style={{ fontSize: 32, fontWeight: 300, lineHeight: 1, color: "var(--text-secondary)" }}>+</div></div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 2. LÉPÉS */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "flex-start" : "center", gap: 12, marginBottom: 20 }}>
            <h2 style={{ fontSize: isMobile ? 16 : 18, fontWeight: 800, color: "var(--text)" }}>2. Lépés: Válassz módot</h2>
            {!hasImages && <span style={{ color: "#ef4444", fontSize: 13, fontWeight: 700, background: "#fef2f2", padding: "4px 10px", borderRadius: 6 }}>Tölts fel képet a kezdéshez!</span>}
            {images.length > 6 && <span style={{ color: "#ef4444", fontSize: 13, fontWeight: 700, background: "#fef2f2", padding: "4px 10px", borderRadius: 6 }}>Automata módhoz max 6 kép engedélyezett!</span>}
          </div>
          
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 24 }}>
            <ModeCard disabled={!hasImages || isMobile} mobileDisabledMsg={isMobile ? "Csak számítógépen elérhető" : undefined} href="/manualis" icon={<Wrench size={32} strokeWidth={1.5} />} title="Manuális" desc="Teljes szabadság. Te kezeled a rétegeket, méreteket és a pontos pozíciókat." />
            <ModeCard disabled={!hasImages || isMobile} mobileDisabledMsg={isMobile ? "Csak számítógépen elérhető" : undefined} href="/segitett" icon={<Target size={32} strokeWidth={1.5} />} title="Segített" desc="Szabad mozgástér, de intelligens mágneses rácsvonalakkal a tökéletes illesztésért." />
            <ModeCard disabled={isAutoDisabled} href="/automata" icon={<Zap size={32} strokeWidth={1.5} />} title="Automata" desc="Az algoritmus másodpercek alatt megtalálja a legjobb elrendezést. (Max 6 kép)" />
          </div>
        </div>
      </div>

      {/* JAVÍTÁS: Visszakerült a nagyítási modal (Preview)! */}
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
          <img src={previewImg?.src} alt={previewImg?.name} onClick={(e) => e.stopPropagation()} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 8, boxShadow: "0 10px 40px rgba(0,0,0,0.5)", cursor: "default" }} />
        </div>
      )}

      <input ref={fileInputRef} type="file" multiple accept="image/*" style={{ display: "none" }} onChange={(e) => { if(e.target.files) addFiles(e.target.files); e.target.value = ''; }} />
    </div>
  );
}