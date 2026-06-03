"use client";

import { useAutoMode } from "@/src/hooks/useAutoMode";
import { AutoControlBar, AutoWorkspace } from "@/src/components/AutoUI";
// Figyelem: Ha átnevezted a fájlt, akkor SharedUI, ha nem, akkor CollageUI
import { TopNavbar } from "@/src/components/SharedUI";

export default function AutoCollagePage() {
  const state = useAutoMode();

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "var(--bg-elevated)", overflow: "hidden" }}>
      
      {/* 1. A közös fejléc */}
      <TopNavbar 
        currentMode="automata" 
        onDownload={state.download} 
        isDownloadDisabled={!state.hasLayouts} 
        downloading={state.downloading} 
        imageCount={state.images.length}
        isSaved={state.isSaved} // <--- EZT AZ EGY SORT ADD HOZZÁ!
      />

      {/* 2. A felső vezérlősáv a képekkel és beállításokkal */}
      <AutoControlBar state={state} />

      {/* 3. A kártyákat megjelenítő munkaterület */}
      <AutoWorkspace state={state} />

      {/* Láthatatlan fájlfeltöltő */}
      <input 
        ref={state.fileInputRef} 
        type="file" multiple accept="image/*" style={{ display: "none" }} 
        onChange={(e) => { if(e.target.files) state.handleAutoUpload(e.target.files); e.target.value = ''; }} 
      />
    </div>
  );
}