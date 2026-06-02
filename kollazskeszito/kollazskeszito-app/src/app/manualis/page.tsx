"use client";

import { useManualCollage } from "./useManualCollage";
import { ManualHeader, LayerSidebar, WorkspaceCanvas, PropertiesSidebar } from "@/src/components/ManualUI";

export default function ManualisPage() {
  const state = useManualCollage();

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "var(--bg-elevated)", overflow: "hidden" }}>
      <ManualHeader state={state} />
      
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <LayerSidebar state={state} />
        <WorkspaceCanvas state={state} />
        <PropertiesSidebar state={state} />
      </div>
    </div>
  );
}