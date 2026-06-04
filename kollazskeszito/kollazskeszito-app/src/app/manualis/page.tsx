"use client";

import Link from "next/link";
import { useManualMode } from "../../hooks/useManualMode";
import { LayerSidebar, WorkspaceCanvas, PropertiesSidebar } from "@/src/components/ManualUI";
import { TopNavbar, useIsMobile } from "@/src/components/SharedUI"; // 💥 IMPORT

export default function ManualisPage() {
  const state = useManualMode();
  const isMobile = useIsMobile(); // 💥 ELLENŐRZÉS

  // HA MOBIL, LELÖVI A BETÖLTÉST
  if (isMobile) {
    return (
      <div style={{ height: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "var(--bg)", padding: 24, textAlign: "center" }}>
        <h1 style={{ fontSize: 24, fontWeight: 900, color: "var(--text)", marginBottom: 12 }}>Asztali mód szükséges</h1>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", marginBottom: 32, maxWidth: 300 }}>A kézi szerkesztéshez és a rétegek kezeléséhez nagyobb képernyőre és egérre van szükség.</p>
        <Link href="/" style={{ padding: "14px 28px", background: "var(--accent)", color: "#fff", textDecoration: "none", borderRadius: 10, fontWeight: 800 }}>← Vissza a főoldalra</Link>
      </div>
    );
  }

  // Eredeti asztali kód
  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "var(--bg-elevated)", overflow: "hidden" }}>
      <TopNavbar currentMode="manualis" onDownload={state.download} isDownloadDisabled={!state.images.length} downloading={state.downloading} imageCount={state.images.length} isSaved={state.isSaved}/>
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <LayerSidebar state={state} />
        <WorkspaceCanvas state={state} />
        <PropertiesSidebar state={state} />
      </div>
    </div>
  );
}