"use client";

import { useManualMode } from "../../hooks/useManualMode";
import {LayerSidebar, WorkspaceCanvas, PropertiesSidebar } from "@/src/components/ManualUI";
import { TopNavbar } from "@/src/components/SharedUI";


export default function ManualisPage() {
  const state = useManualMode();

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "var(--bg-elevated)", overflow: "hidden" }}>
      <TopNavbar 
        currentMode="manualis" 
        onDownload={state.download} 
        isDownloadDisabled={!state.images.length} 
        downloading={state.downloading} 
        imageCount={state.images.length} 
        isSaved={state.isSaved}// <-- EZT A SORT ADD HOZZÁ!
      />

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <LayerSidebar state={state} />
        <WorkspaceCanvas state={state} />
        <PropertiesSidebar state={state} />
      </div>
    </div>
  );
}