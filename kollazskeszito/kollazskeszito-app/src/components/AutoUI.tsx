// src/components/AutoUI.tsx
import React from "react";
import Link from "next/link";
import { Wand2, Wrench, Images, Plus, Trash2} from "lucide-react"; // 💥 JAVÍTÁS: Plus ikon hozzáadása
import { LayoutCard, CompactImageThumb, QuickSelect, useIsMobile } from "@/src/components/SharedUI"; 
import { useAutoMode } from "@/src/hooks/useAutoMode";

type AutoState = ReturnType<typeof useAutoMode>;
type Props = { state: AutoState };

// --- 1. FELSŐ VEZÉRLŐSÁV ---
// src/components/AutoUI.tsx - Csak az AutoControlBar komponenst cserélje:

// --- 1. FELSŐ VEZÉRLŐSÁV ---
export function AutoControlBar({ state }: Props) {
  const { 
    images, deletedImages, restoreImage, removeImage, rotateImage, 
    handleAutoUpload, fileInputRef, setAllImagesBg, toggleImageBg,
    keepOrder, setKeepOrder, shuffleImages, clearImages, gap, setGap, margin, setMargin 
  } = state;

  const isMobile = useIsMobile(); 

  const hasUj = images.some(i => i.name === 'cimke_uj.png');
  const hasPremium = images.some(i => i.name === 'cimke_premium.png');
  
  // 💡 ÚJ: Kiszűrjük a matricákat a képek közül, hogy a gombok és számlálók jól működjenek
  const photosOnly = images.filter(img => !img.isBadge);
  const isAllBgRemoved = photosOnly.length > 0 && photosOnly.every(img => img.removeBg);
  const photoCount = photosOnly.length;

  return (
    <div style={{ flexShrink: 0, background: "var(--bg-panel)", borderBottom: "1px solid var(--border)", zIndex: 10, display: "flex", flexDirection: "column" }}>
      
      {/* Felső vezérlősáv */}
      <div style={{ padding: isMobile ? "12px" : "16px 24px", display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: "stretch", justifyContent: "space-between", gap: 12 }}>
        
        <div style={{ display: "flex", flex: 1, background: "var(--bg-elevated)", flexDirection: isMobile ? "column" : "row", border: "1px solid var(--border-medium)", borderRadius: 12, padding: "12px", gap: 12 }}>
          
          <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1 }}>
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 40 }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Képek</span>
              {/* 💡 ITT VAN A SZÁMLÁLÓ: */}
              <span style={{ fontSize: 16, color: "var(--text)", fontWeight: 800 }}>{photoCount}/8</span>
            </div>
            
            <div style={{ width: 1, height: "100%", background: "var(--border-medium)" }} />
            
            {/* 💡 ITT VAN A KÉPEK LISTÁZÁSA: */}
            <div style={{ display: "flex", gap: 8, flex: 1, overflowX: "auto", padding: "4px" }}>
              {images.map((img, i) => {
                if (img.isBadge) return null; // A matricák nem jelennek meg idefenn!
                return (
                  <CompactImageThumb key={img.uid} img={img} onRemove={() => removeImage(i)} onRotate={() => rotateImage(i, 90)} removeBg={img.removeBg} onToggleBg={() => toggleImageBg(img.uid)} />
                );
              })}
              
              {/* 💡 ITT VAN A FELTÖLTÉS GOMB: */}
              {photoCount < 8 && (
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
              
              <input type="file" ref={fileInputRef} multiple accept="image/*" onChange={(e) => { if(e.target.files) handleAutoUpload(e.target.files); e.target.value = ''; }} style={{ display: "none" }} />
            </div>
          </div>

          <div style={{ width: isMobile ? "100%" : 1, height: isMobile ? 1 : "auto", background: "var(--border-medium)" }} />
          
          {/* Beállítások és Gombok */}
          <div style={{ display: "flex", flexDirection: isMobile ? "row" : "column", flexWrap: "wrap", justifyContent: "center", gap: 8, minWidth: 160 }}>
            <label style={{ display: "flex", flex: isMobile ? "1 1 45%" : "auto", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 11, fontWeight: 800, color: isAllBgRemoved ? "var(--accent)" : "var(--text)", padding: "6px 8px", background: isAllBgRemoved ? "rgba(91,80,232,0.08)" : "transparent", borderRadius: 6 }}>
              <input type="checkbox" checked={!!isAllBgRemoved} onChange={(e) => setAllImagesBg(e.target.checked)} style={{ accentColor: "var(--accent)", width: 14, height: 14 }} />
              Minden háttér eltüntetése
            </label>
            <label style={{ display: "flex", flex: isMobile ? "1 1 45%" : "auto", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 11, fontWeight: 800, color: "var(--text)", padding: "4px 8px" }}>
              <input type="checkbox" checked={!!keepOrder} onChange={(e) => setKeepOrder(e.target.checked)} style={{ accentColor: "var(--accent)", width: 14, height: 14 }} />
              Fix sorrend
            </label>
            <div style={{ display: "flex", gap: 6, flex: isMobile ? "1 1 100%" : "auto" }}>
              <button disabled={photoCount < 2} onClick={shuffleImages} title="Képek keverése" style={{ flex: 1, height: 28, borderRadius: 6, background: "var(--bg-panel)", border: "1px solid var(--border-medium)", display: "flex", alignItems: "center", justifyContent: "center", cursor: photoCount < 2 ? "default" : "pointer", opacity: photoCount < 2 ? 0.4 : 1, color: "var(--text)", transition: "all 0.15s ease", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }} onMouseEnter={(e) => { if(photoCount >= 2) e.currentTarget.style.background = "var(--bg-elevated)"; }} onMouseLeave={(e) => { if(photoCount >= 2) { e.currentTarget.style.background = "var(--bg-panel)"; e.currentTarget.style.transform = "scale(1)"; } }} onMouseDown={(e) => { if(photoCount >= 2) e.currentTarget.style.transform = "scale(0.92)"; }} onMouseUp={(e) => { if(photoCount >= 2) e.currentTarget.style.transform = "scale(1)"; }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 3 21 3 21 8"></polyline><line x1="4" y1="20" x2="21" y2="3"></line><polyline points="21 16 21 21 16 21"></polyline><line x1="15" y1="15" x2="21" y2="21"></line><line x1="4" y1="4" x2="9" y2="9"></line></svg>
              </button>
              <button disabled={images.length === 0} onClick={clearImages} title="Összes törlése" style={{ flex: 1, height: 28, borderRadius: 6, background: images.length === 0 ? "var(--bg-panel)" : "#fef2f2", border: `1px solid ${images.length === 0 ? "var(--border-medium)" : "#fca5a5"}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: images.length === 0 ? "default" : "pointer", opacity: images.length === 0 ? 0.4 : 1, color: images.length === 0 ? "var(--text-secondary)" : "#dc2626", transition: "all 0.15s ease", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }} onMouseEnter={(e) => { if(images.length > 0) e.currentTarget.style.background = "#fee2e2"; }} onMouseLeave={(e) => { if(images.length > 0) { e.currentTarget.style.background = "#fef2f2"; e.currentTarget.style.transform = "scale(1)"; } }} onMouseDown={(e) => { if(images.length > 0) e.currentTarget.style.transform = "scale(0.92)"; }} onMouseUp={(e) => { if(images.length > 0) e.currentTarget.style.transform = "scale(1)"; }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            </div>
          </div>
        </div>

        {/* Hézag és Margó állítók */}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", background: "var(--bg-elevated)", border: "1px solid var(--border-medium)", borderRadius: 12, padding: "12px 20px", gap: 12, flexShrink: 0, width: isMobile ? "100%" : 300 }}>
          <QuickSelect label="Rés" value={gap} options={[0, 50, 150, 300]} onChange={setGap} />
          <QuickSelect label="Margó" value={margin} options={[0, 50, 150, 300]} onChange={setMargin} />
          
          {/* 💡 ÚJ: Címkék az automata módban is! Vizuális Toggle dizájnnal */}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => state.toggleBadge('uj')} style={{ flex: 1, padding: "6px", background: hasUj ? "#fef2f2" : "#FF0000", color: hasUj ? "#dc2626" : "#ffffff", borderRadius: 6, fontWeight: 800, fontSize: 11, border: hasUj ? "1px solid #fca5a5" : "none", cursor: "pointer", transition: "all 0.1s", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
              {hasUj ? <Trash2 size={12} /> : null} ÚJ
            </button>
            <button onClick={() => state.toggleBadge('premium')} style={{ flex: 1, padding: "6px", background: hasPremium ? "#f9fafb" : "#111111", color: hasPremium ? "#4b5563" : "#D4AF37", borderRadius: 6, fontWeight: 800, fontSize: 11, border: hasPremium ? "1px solid var(--border-medium)" : "1px solid #D4AF37", cursor: "pointer", transition: "all 0.1s", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
              {hasPremium ? <Trash2 size={12} /> : null} PRÉMIUM
            </button>
          </div>
        </div>
      </div>

      {/* Lomtár Szekció az Automata módban is */}
      {deletedImages && deletedImages.length > 0 && (
        <div style={{ padding: isMobile ? "8px 12px" : "8px 24px", background: "rgba(0,0,0,0.02)", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12, overflowX: "auto" }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", flexShrink: 0 }}>
            Lomtár (Kattints a visszaállításhoz)
          </div>
          <div style={{ display: "flex", gap: 8, paddingBottom: 4 }}>
            {deletedImages.map((img) => (
              <div
                key={img.uid}
                onClick={() => restoreImage(img.uid)}
                title="Kattints a visszaállításhoz"
                style={{ width: 40, height: 40, borderRadius: 6, background: "#fff", border: "1px solid var(--border-medium)", flexShrink: 0, cursor: "pointer", overflow: "hidden", opacity: 0.7, transition: "all 0.15s ease", boxShadow: "0 2px 4px rgba(0,0,0,0.04)" }}
                onMouseEnter={e => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.transform = "scale(1.05)"; }}
                onMouseLeave={e => { e.currentTarget.style.opacity = "0.7"; e.currentTarget.style.borderColor = "var(--border-medium)"; e.currentTarget.style.transform = "scale(1)"; }}
              >
                <img src={img.src} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
              </div>
            ))}
          </div>
        </div>
      )}
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
     <LayoutCard key={layout.signature} layout={layout} index={i} selected={selectedIdx === i} onSelect={() => setSelectedIdx(i)} images={images} />
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