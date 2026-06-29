"use client";
import { Trash2, RotateCcw } from "lucide-react";

export function TrashPanel({ deletedImages, restoreImage, onClose }: { deletedImages: any[], restoreImage: (uid: string) => void, onClose: () => void }) {
  if (deletedImages.length === 0) return null;

  return (
    <div style={{
      position: "absolute", top: "100%", right: 0, marginTop: 10,
      width: 280, background: "var(--bg-panel)", border: "1px solid var(--border)",
      borderRadius: 12, boxShadow: "0 10px 25px rgba(0,0,0,0.1)", zIndex: 100, padding: 12
    }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: "var(--text-secondary)", marginBottom: 8, textTransform: "uppercase" }}>Törölt képek ({deletedImages.length})</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
        {deletedImages.map(img => (
          <div key={img.uid} onClick={() => restoreImage(img.uid)} style={{ 
            width: 50, height: 50, borderRadius: 6, cursor: "pointer", position: "relative",
            border: "1px solid var(--border-medium)", overflow: "hidden" 
          }}>
            <img src={img.src} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.4)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <RotateCcw size={16} color="var(--accent)" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}