// src/components/AutoUI.tsx
import React from "react";
import Link from "next/link";
import { Wand2, Wrench, Images, Plus } from "lucide-react"; // 💥 JAVÍTÁS: Plus ikon hozzáadása
import { LayoutCard, CompactImageThumb, QuickSelect, useIsMobile } from "@/src/components/SharedUI"; 
import { useAutoMode } from "@/src/hooks/useAutoMode";

type AutoState = ReturnType<typeof useAutoMode>;
type Props = { state: AutoState };

// --- 1. FELSŐ VEZÉRLŐSÁV ---
export function AutoControlBar({ state }: Props) {
  const { 
    images, removeImage, rotateImage, 
    handleAutoUpload, fileInputRef, setAllImagesBg, toggleImageBg,
    keepOrder, setKeepOrder, shuffleImages, clearImages, gap, setGap, margin, setMargin 
  } = state;

  const isMobile = useIsMobile(); 
  const isAllBgRemoved = images.length > 0 && images.every(img => img.removeBg);

  return (
    <div style={{ flexShrink: 0, background: "var(--bg-panel)", borderBottom: "1px solid var(--border)", padding: isMobile ? "12px" : "16px 24px", display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: "stretch", justifyContent: "space-between", gap: 12, zIndex: 10 }}>
      
      <div style={{ display: "flex", flex: 1, background: "var(--bg-elevated)", flexDirection: isMobile ? "column" : "row", border: "1px solid var(--border-medium)", borderRadius: 12, padding: "12px", gap: 12 }}>
        
        <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1 }}>
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 40 }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Képek</span>
            <span style={{ fontSize: 16, color: "var(--text)", fontWeight: 800 }}>{images.length}/6</span>
          </div>
          <div style={{ width: 1, height: "100%", background: "var(--border-medium)" }} />
          <div style={{ display: "flex", gap: 8, flex: 1, overflowX: "auto", padding: "4px" }}>
            {images.map((img, i) => (
              <CompactImageThumb key={img.uid} img={img} onRemove={() => removeImage(i)} onRotate={() => rotateImage(i, 90)} removeBg={img.removeBg} onToggleBg={() => toggleImageBg(img.uid)} />
            ))}
            
            {/* 💥 ÚJ: KÖZVETLEN FELTÖLTÉS GOMB 💥 */}
            {images.length < 6 && (
              <button 
                onClick={() => fileInputRef.current?.click()} 
                title="További kép feltöltése"
                style={{ width: 76, height: 76, flexShrink: 0, borderRadius: 8, border: "2px dashed var(--border-medium)", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)", cursor: "pointer", transition: "all 0.2s ease" }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-medium)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
              >
                <Plus size={24} />
              </button>
            )}
            
            {/* Rejtett fájlválasztó input */}
            <input type="file" ref={fileInputRef} multiple accept="image/*" onChange={(e) => { if(e.target.files) handleAutoUpload(e.target.files); e.target.value = ''; }} style={{ display: "none" }} />
          </div>
        </div>

        <div style={{ width: isMobile ? "100%" : 1, height: isMobile ? 1 : "auto", background: "var(--border-medium)" }} />
        <div style={{ display: "flex", flexDirection: isMobile ? "row" : "column", flexWrap: "wrap", justifyContent: "center", gap: 8, minWidth: 160 }}>
          <label style={{ display: "flex", flex: isMobile ? "1 1 45%" : "auto", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 11, fontWeight: 800, color: isAllBgRemoved ? "var(--accent)" : "var(--text)", padding: "6px 8px", background: isAllBgRemoved ? "rgba(91,80,232,0.08)" : "transparent", borderRadius: 6 }}>
            <input type="checkbox" checked={!!isAllBgRemoved} onChange={(e) => setAllImagesBg(e.target.checked)} style={{ accentColor: "var(--accent)", width: 14, height: 14 }} />
            <Wand2 size={14} /> Összes háttér
          </label>
          <label style={{ display: "flex", flex: isMobile ? "1 1 45%" : "auto", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 11, fontWeight: 800, color: "var(--text)", padding: "4px 8px" }}>
            <input type="checkbox" checked={!!keepOrder} onChange={(e) => setKeepOrder(e.target.checked)} style={{ accentColor: "var(--accent)", width: 14, height: 14 }} />
            Fix sorrend
          </label>
          <div style={{ display: "flex", gap: 6, flex: isMobile ? "1 1 100%" : "auto" }}>
            {/* 💥 JAVÍTÁS: Betűtípus és stílus javítása (fontFamily, fontWeight) 💥 */}
            <button disabled={images.length < 2} onClick={shuffleImages} style={{ flex: 1, height: 28, borderRadius: 6, background: "var(--bg-panel)", border: "1px solid var(--border-medium)", fontFamily: "inherit", fontSize: 12, fontWeight: 700, cursor: "pointer", color: "var(--text)" }}>Keverés</button>
            <button disabled={images.length === 0} onClick={clearImages} style={{ flex: 1, height: 28, borderRadius: 6, background: "#fef2f2", border: "1px solid #fca5a5", color: "#dc2626", fontFamily: "inherit", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Törlés</button>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", background: "var(--bg-elevated)", border: "1px solid var(--border-medium)", borderRadius: 12, padding: "12px 20px", gap: 12, flexShrink: 0, width: isMobile ? "100%" : 300 }}>
        <QuickSelect label="Rés" value={gap} options={[0, 10, 30, 80]} onChange={setGap} />
        <QuickSelect label="Margó" value={margin} options={[0, 50, 150, 300]} onChange={setMargin} />
      </div>
    </div>
  );
}

// --- 2. KÖZÉPSŐ MUNKATERÜLET ---
export function AutoWorkspace({ state }: Props) {
  const { images, hasLayouts, layouts, selectedIdx, setSelectedIdx, handleEditInManual } = state;
  const isMobile = useIsMobile(); 

  return (
    // 💥 JAVÍTÁS: overflowY: "auto" mobilon és asztalin is, hogy mindig görgethető legyen, ha a kártyák nem férnek ki!
    <main style={{ flex: 1, display: "flex", flexDirection: "column", background: "var(--bg)", minHeight: 0, overflowY: "auto", position: "relative" }}>
      
      <div style={{ padding: isMobile ? "24px 16px" : "40px 30px", display: "flex", flexDirection: "column", minHeight: "100%", alignItems: "center", justifyContent: isMobile ? "flex-start" : "center" }}>
        
        {!images.length ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16, color: "var(--text-secondary)", opacity: 0.6, margin: "auto 0" }}>
            <Images size={56} strokeWidth={1.5} />
            <div style={{ fontSize: 18, fontWeight: 600, color: "var(--text)" }}>Kezdéshez tölts fel képeket a fenti sávban!</div>
          </div>
        ) : !hasLayouts ? (
          <div style={{ color: "var(--text-secondary)", fontWeight: 600, margin: "auto 0" }}>Generálás...</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: isMobile ? 32 : 40, width: "100%" }}>
            
            {/* 💥 JAVÍTÁS: Flex konténer mobilon függőleges (column), és engedi a kártyákat megnőni! */}
            <div style={{ width: "100%", display: "flex", gap: isMobile ? 24 : 32, alignItems: "center", justifyContent: "center", flexDirection: isMobile ? "column" : "row", flexWrap: isMobile ? "nowrap" : "wrap", minHeight: 0 }}>
              {layouts.map((layout, i) => (
                <LayoutCard key={layout.signature} layout={layout} index={i} selected={selectedIdx === i} onSelect={() => setSelectedIdx(i)} />
              ))}
            </div>

            {!isMobile && (
              <button 
                onClick={handleEditInManual}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 32px", background: "var(--bg-panel)", border: "2px solid var(--accent)", color: "var(--accent)", borderRadius: 14, fontSize: 16, fontWeight: 800, cursor: "pointer", transition: "all 0.2s ease", boxShadow: "0 8px 24px rgba(91,80,232,0.15)", fontFamily: "inherit" }}
              >
                <Wrench size={20} strokeWidth={2.5} /> Finomhangolás Manuális módban
              </button>
            )}
          </div>
        )}
      </div>
    </main>
  );
}