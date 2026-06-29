"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { useCollage } from "@/src/components/CollageContext";
import { processAndCrop, computeLayouts, renderToCanvas, AutoLayout } from "@/src/lib/autoLayoutEngine";
import { downloadCanvasAsImage } from "@/src/lib/imageProcessing";
import { useRouter } from "next/navigation";

export function useAutoMode() {
  const router = useRouter(); // <--- ÚJ

  const { images, deletedImages, restoreImage, addFiles, removeImage, rotateImage, reorderImages, clearImages, shuffleImages, toggleImageBg, setAllImagesBg, setManualLayersOverride, toggleBadge } = useCollage();

  const [layouts, setLayouts] = useState<AutoLayout[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  const [gap, setGap] = useState(0);
    const [margin, setMargin] = useState(0);
    const [keepOrder, setKeepOrder] = useState(false);


  const [downloading, setDownloading] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isDragOverDropzone, setIsDragOverDropzone] = useState(false);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);



    useEffect(() => {
        const savedGap = localStorage.getItem("kollazs_auto_gap");
        if (savedGap !== null) setGap(parseInt(savedGap, 10));
        
        const savedMargin = localStorage.getItem("kollazs_auto_margin");
        if (savedMargin !== null) setMargin(parseInt(savedMargin, 10));
    }, []);

    // 💡 2. ÚJ: Azonnali mentés a LocalStorage-be minden változtatáskor
    useEffect(() => {
        localStorage.setItem("kollazs_auto_gap", gap.toString());
        localStorage.setItem("kollazs_auto_margin", margin.toString());
    }, [gap, margin]);

// 💥 JAVÍTOTT FUNKCIÓ: ÁTKÜLDÉS MANUÁLIS MÓDBA 💥
  const handleEditInManual = useCallback(() => {
    if (!layouts[selectedIdx]) return;
    const layout = layouts[selectedIdx];
    const newLayers: Record<string, any> = {};
    
    // 💡 1. BIZTONSÁGI JAVÍTÁS: Először minden képnek (matricáknak is) adunk egy alap réteget!
    images.forEach(img => {
      newLayers[img.uid] = { x: 0, y: 0, zoom: 0.8, rot: 0, visible: true };
    });
    
    const canvasW = 2000;
    const canvasH = 2000;
    const marginPx = layout.externalMargin;
    
    const drawW = canvasW - marginPx * 2;
    const drawH = canvasH - marginPx * 2;
    const scale = Math.min(drawW / layout.totalW, drawH / layout.totalH);
    const offX = (canvasW - layout.totalW * scale) / 2;
    const offY = (canvasH - layout.totalH * scale) / 2;

    const processItem = (item: any, boxX: number, boxY: number, boxW: number, boxH: number) => {
      // 💡 2. BIZTONSÁGI JAVÍTÁS: Biztosítjuk, hogy megtalálja az eredeti képet a listában
      const origIndex = item.originalIndex !== undefined ? item.originalIndex : layout.perm.indexOf(item);
      const origImg = images[origIndex];
      if (!origImg) return;
      const uid = origImg.uid;
      
      const baseScale = Math.min(2000 / origImg.el.width, 2000 / origImg.el.height) * 0.5;
      const actualScale = boxW / item.cropW;
      const zoom = actualScale / baseScale;

      const boxCenterX = boxX + boxW / 2;
      const boxCenterY = boxY + boxH / 2;

      const cropCenterX = item.cropOffsetX + item.cropW / 2;
      const cropCenterY = item.cropOffsetY + item.cropH / 2;

      const dx = (origImg.el.width / 2) - cropCenterX;
      const dy = (origImg.el.height / 2) - cropCenterY;

      const origCenterX = boxCenterX + dx * actualScale;
      const origCenterY = boxCenterY + dy * actualScale;

      newLayers[uid] = {
        x: origCenterX - 1000,
        y: origCenterY - 1000,
        zoom: zoom,
        rot: 0,
        visible: true
      };
    };

    if (layout.type === "cols") {
      let cx = offX;
      for (const col of layout.colData!) {
        const cw = col.colW * scale;
        let cy = offY;
        for (let i = 0; i < col.count; i++) {
          const item = layout.perm[col.startIndex + i];
          const ch = (col.colW / item.ar) * scale;
          processItem(item, cx, cy, cw, ch);
          cy += ch + layout.gap * scale;
        }
        cx += cw + layout.gap * scale;
      }
    } else {
      let cy = offY;
      for (const row of layout.rowData!) {
        const rh = row.rowH * scale;
        let cx = offX;
        for (let i = 0; i < row.count; i++) {
          const item = layout.perm[row.startIndex + i];
          const rw = item.ar * row.rowH * scale;
          processItem(item, cx, cy, rw, rh);
          cx += rw + layout.gap * scale;
        }
        cy += rh + layout.gap * scale;
      }
    }

    setManualLayersOverride(newLayers);
    router.push("/manualis");

  }, [layouts, selectedIdx, images, setManualLayersOverride, router]);



  // ÚJ: Bármi változik az automatánál, újra lehessen menteni
  useEffect(() => {
    setIsSaved(false);
  }, [images, selectedIdx, gap, margin, keepOrder]);

const handleAutoUpload = useCallback((files: FileList | File[]) => {
        // 💡 Csak a valódi képeket számoljuk!
        const photoCount = images.filter(img => !img.isBadge).length; 
        const slotsLeft = 8 - photoCount;
        
        if (slotsLeft <= 0) {
            alert("A szerkesztőkben maximum 8 kép engedélyezett! Törölj párat a Lomtárba az új képek hozzáadásához.");
            return;
        }
        const filesArray = Array.from(files);
        if (filesArray.length > slotsLeft) {
            alert(`Maximum 8 kép lehet! Ebből a feltöltésből csak az első ${slotsLeft} képet adjuk hozzá.`);
        }
        addFiles(filesArray.slice(0, slotsLeft));
    }, [images, addFiles]);

  useEffect(() => {
    if (!images.length) { setLayouts([]); return; }

    let isCancelled = false;

const generate = async () => {
            try {
                // 💡 Szűrjük a listát: a matricákat kihagyjuk a vágásból és a rácsból, 
                // de az indexeket megtartjuk, hogy visszatérésnél a Manuális mód felismerje őket.
                const cropped = await Promise.all(
                    images.map(async (img, i) => {
                        if (img.isBadge) return null; 
                        return await processAndCrop(img.el, i, img.removeBg);
                    })
                );

                if (isCancelled) return;

                // Kiszedjük a null értékeket
                const validCropped = cropped.filter(c => c !== null) as any[];
                
                const computed = computeLayouts(validCropped, gap, margin, keepOrder);
                setLayouts(computed);
                setSelectedIdx(s => Math.min(s, computed.length - 1));
            } catch (error) {
                console.error("Hiba az automata generálásnál:", error);
            }
        };

    const timer = setTimeout(generate, 80);
    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [images, gap, margin, keepOrder]); // Mivel a `images` frissül a removeBg állításakor, újra lefut!

const download = useCallback(() => {
        if (!layouts[selectedIdx]) return;
        setDownloading(true);
        setTimeout(() => {
            const canvas = document.createElement("canvas");
            renderToCanvas(canvas, layouts[selectedIdx], images, "#ffffff"); // 💡 Passzoljuk az 'images'-t

            downloadCanvasAsImage(canvas, "kollazs_automata");
            setDownloading(false);
            setIsSaved(true);
        }, 60);
    }, [selectedIdx, layouts, images]);

  const hasLayouts = layouts.length > 0;

return {
        // Állapotok, memóriák és lomtár
        images, deletedImages, restoreImage, layouts, selectedIdx, setSelectedIdx, 
        gap, setGap, margin, setMargin, keepOrder, setKeepOrder, downloading,
        
        // Drag & Drop és fájlfeltöltés állapotok
        isDragOverDropzone, setIsDragOverDropzone, draggedIdx, setDraggedIdx,
        dragOverIdx, setDragOverIdx, fileInputRef, handleAutoUpload, download,
        
        // Műveletek és egyéb funkciók
        hasLayouts, removeImage, rotateImage, reorderImages, clearImages, 
        shuffleImages, toggleImageBg, setAllImagesBg, isSaved, handleEditInManual,

        toggleBadge
    };
}