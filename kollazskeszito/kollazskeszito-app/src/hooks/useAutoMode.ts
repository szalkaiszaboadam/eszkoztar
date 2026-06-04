"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { useCollage } from "@/src/components/CollageContext";
import { processAndCrop, computeLayouts, renderToCanvas, AutoLayout } from "@/src/lib/autoLayoutEngine";
import { downloadCanvasAsImage } from "@/src/lib/imageProcessing";
import { useRouter } from "next/navigation";

export function useAutoMode() {
    const router = useRouter(); // <--- ÚJ
    const { images, addFiles, removeImage, rotateImage, reorderImages, clearImages, shuffleImages, toggleImageBg, setAllImagesBg, setManualLayersOverride } = useCollage(); // <--- setManualLayersOverride behúzása


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


// 💥 ÚJ FUNKCIÓ: ÁTKÜLDÉS MANUÁLIS MÓDBA 💥
  const handleEditInManual = useCallback(() => {
    if (!layouts[selectedIdx]) return;
    const layout = layouts[selectedIdx];
    const newLayers: Record<string, any> = {};
    
    const canvasW = 2000;
    const canvasH = 2000;
    const marginPx = layout.externalMargin;
    
    // Kiszámoljuk a belső rajzolási területet és a skálázást, pont ahogy a renderelő motor teszi!
    const drawW = canvasW - marginPx * 2;
    const drawH = canvasH - marginPx * 2;
    const scale = Math.min(drawW / layout.totalW, drawH / layout.totalH);
    const offX = (canvasW - layout.totalW * scale) / 2;
    const offY = (canvasH - layout.totalH * scale) / 2;

    // Belső segédfüggvény a dobozok transzformálásához
    const processItem = (item: any, boxX: number, boxY: number, boxW: number, boxH: number) => {
      const origImg = images[item.originalIndex];
      if (!origImg) return;
      const uid = origImg.uid;
      
      // A Manuális mód alap skálázása
      const baseScale = Math.min(2000 / origImg.el.width, 2000 / origImg.el.height) * 0.5;
      
      // Milyen arányban kell lennie a képnek, hogy kitöltse a dobozt?
      const actualScale = boxW / item.cropW;
      const zoom = actualScale / baseScale;

      const boxCenterX = boxX + boxW / 2;
      const boxCenterY = boxY + boxH / 2;

      // Hol volt a képzeletbeli doboz közepe a vágás előtt?
      const cropCenterX = item.cropOffsetX + item.cropW / 2;
      const cropCenterY = item.cropOffsetY + item.cropH / 2;

      // Eltolás az eredeti kép közepe és a vágott doboz közepe között
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

    // Elmentjük a memóriába és átirányítjuk a felhasználót!
    setManualLayersOverride(newLayers);
    router.push("/manualis");

  }, [layouts, selectedIdx, images, setManualLayersOverride, router]);




    // ÚJ: Bármi változik az automatánál, újra lehessen menteni
    useEffect(() => {
        setIsSaved(false);
    }, [images, selectedIdx, gap, margin, keepOrder]);

    const handleAutoUpload = useCallback((files: FileList | File[]) => {
        const slotsLeft = 6 - images.length;
        if (slotsLeft <= 0) {
            alert("Az Automata módban maximum 6 kép engedélyezett!");
            return;
        }
        const filesArray = Array.from(files);
        if (filesArray.length > slotsLeft) {
            alert(`Az Automata módban maximum 6 kép lehet! Ebből a feltöltésből csak az első ${slotsLeft} képet adjuk hozzá.`);
        }
        addFiles(filesArray.slice(0, slotsLeft));
    }, [images.length, addFiles]);

    useEffect(() => {
        if (!images.length) { setLayouts([]); return; }

        let isCancelled = false;

        const generate = async () => {
            try {
                // ÚJ: A globális img.removeBg-t olvassuk!
                const cropped = await Promise.all(
                    images.map((img, i) => processAndCrop(img.el, i, img.removeBg))
                );

                if (isCancelled) return;

                const computed = computeLayouts(cropped, gap, margin, keepOrder);
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
            renderToCanvas(canvas, layouts[selectedIdx], "#ffffff");

            downloadCanvasAsImage(canvas, "kollazs_automata");
            setDownloading(false);
            setIsSaved(true); // <--- EZT ADD HOZZÁ
        }, 60);
    }, [selectedIdx, layouts]);

    const hasLayouts = layouts.length > 0;

    return {
        images, layouts, selectedIdx, setSelectedIdx, gap, setGap, margin, setMargin,
        keepOrder, setKeepOrder, downloading,
        isDragOverDropzone, setIsDragOverDropzone, draggedIdx, setDraggedIdx,
        dragOverIdx, setDragOverIdx, fileInputRef, handleAutoUpload, download,
        hasLayouts, removeImage, rotateImage,
        reorderImages, clearImages, shuffleImages, toggleImageBg, setAllImagesBg, isSaved, handleEditInManual // ÚJ
    };
}