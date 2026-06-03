"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useCollage } from "@/src/components/CollageContext";
import { processWhiteBackground, downloadCanvasAsImage } from "@/src/lib/imageProcessing";

// ÚJ: Kikerült a removeBg a LayerState-ből, mert a globálisból vesszük!
export type LayerState = {
  x: number;
  y: number;
  zoom: number;
  rot: number;
  visible: boolean;
};

export function useManualMode() {
// Így nézzen ki:
  const { images, removeImage, removeImages, reorderImages, toggleImageBg, setImagesBg, setAllImagesBg, addFiles } = useCollage(); // ÚJ: addFiles

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [layers, setLayers] = useState<Record<string, LayerState>>({});
  const [activeUids, setActiveUids] = useState<string[]>([]);
  const [processedImages, setProcessedImages] = useState<Record<string, { src: string, el: HTMLImageElement }>>({});
  const processedRef = useRef<Set<string>>(new Set());

  const [canvasPixelSize, setCanvasPixelSize] = useState(800);
  const containerRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [isSaved, setIsSaved] = useState(false); // <--- EZT ADD HOZZÁ

  const [showGrid, setShowGrid] = useState(false);
  const [gridDivisions, setGridDivisions] = useState(20);
  const [isSnapEnabled, setIsSnapEnabled] = useState(true);
  const [activeSnapLines, setActiveSnapLines] = useState<{x: number | null, y: number | null}>({ x: null, y: null });

// ÚJ: Bármi változik a vásznon, a Mentés gomb újra aktív lesz!
  useEffect(() => {
    setIsSaved(false);
  }, [images, layers]);

  useEffect(() => {
    const updateSize = (w: number, h: number) => {
      const minDim = Math.min(w, h) - 64;
      setCanvasPixelSize(Math.max(100, minDim));
    };

    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      updateSize(rect.width, rect.height);
    }

    const obs = new ResizeObserver((entries) => {
      for (let e of entries) { updateSize(e.contentRect.width, e.contentRect.height); }
    });

    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const canvasScale = canvasPixelSize / 2000;

  useEffect(() => {
    setLayers(prev => {
      const next = { ...prev };
      let changed = false;
      images.forEach(img => {
        if (!next[img.uid]) {
          // ÚJ: Már nem itt állítjuk be a removeBg-t!
          next[img.uid] = { x: 0, y: 0, zoom: 0.8, rot: 0, visible: true };
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [images]);

  useEffect(() => {
    images.forEach(async (img) => {
      if (!processedRef.current.has(img.uid)) {
        processedRef.current.add(img.uid);
        const processed = await processWhiteBackground(img.el);
        setProcessedImages(prev => ({ ...prev, [img.uid]: processed }));
      }
    });
  }, [images]);

  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
  const [dragStart, setDragStart] = useState<{ mouseX: number, mouseY: number, itemStarts: Record<string, {x: number, y: number}> }>({ mouseX: 0, mouseY: 0, itemStarts: {} });

  const onPointerDownCanvas = (e: React.PointerEvent, uid: string) => {
    e.stopPropagation();
    if (layers[uid]?.visible === false) return;
    
    let newActiveUids = [...activeUids];
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      if (newActiveUids.includes(uid)) newActiveUids = newActiveUids.filter(id => id !== uid);
      else newActiveUids.push(uid);
    } else {
      if (!activeUids.includes(uid)) newActiveUids = [uid];
    }
    
    setActiveUids(newActiveUids);

    if (newActiveUids.length > 0) {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      setIsDraggingCanvas(true);
      
      const starts: Record<string, {x: number, y: number}> = {};
      newActiveUids.forEach(id => { if (layers[id]) starts[id] = { x: layers[id].x, y: layers[id].y }; });
      setDragStart({ mouseX: e.clientX, mouseY: e.clientY, itemStarts: starts });
    }
  };

  const onPointerMoveCanvas = (e: React.PointerEvent) => {
    if (!isDraggingCanvas || activeUids.length === 0) return;
    
    const dx = (e.clientX - dragStart.mouseX) / canvasScale;
    const dy = (e.clientY - dragStart.mouseY) / canvasScale;

    let snapLineX: number | null = null;
    let snapLineY: number | null = null;
    let correctionX = 0;
    let correctionY = 0;

    if (isSnapEnabled && activeUids.length === 1) {
      const activeUid = activeUids[0];
      const SNAP_THRESHOLD = 20; 
      const draggedImg = images.find(img => img.uid === activeUid);
      const draggedLayer = layers[activeUid];
      
      if (draggedImg && draggedLayer && dragStart.itemStarts[activeUid]) {
        const baseScale = Math.min(2000 / draggedImg.el.width, 2000 / draggedImg.el.height) * 0.5;
        const w = draggedImg.el.width * baseScale * draggedLayer.zoom;
        const h = draggedImg.el.height * baseScale * draggedLayer.zoom;
        const newX = dragStart.itemStarts[activeUid].x + dx;
        const newY = dragStart.itemStarts[activeUid].y + dy;
        const cx = 1000 + newX; const cy = 1000 + newY;
        const left = cx - w / 2; const right = cx + w / 2;
        const top = cy - h / 2; const bottom = cy + h / 2;

        const targetsX: number[] = [0, 1000, 2000];
        const targetsY: number[] = [0, 1000, 2000];

        images.forEach(img => {
          if (img.uid !== activeUid && layers[img.uid]?.visible) {
            const l = layers[img.uid];
            const oBaseScale = Math.min(2000 / img.el.width, 2000 / img.el.height) * 0.5;
            const ow = img.el.width * oBaseScale * l.zoom;
            const oh = img.el.height * oBaseScale * l.zoom;
            const ocx = 1000 + l.x; const ocy = 1000 + l.y;
            targetsX.push(ocx, ocx - ow / 2, ocx + ow / 2);
            targetsY.push(ocy, ocy - oh / 2, ocy + oh / 2);
          }
        });

        let minDiffX = Infinity;
        const checkX = (val: number, target: number) => {
          const diff = target - val;
          if (Math.abs(diff) < SNAP_THRESHOLD && Math.abs(diff) < Math.abs(minDiffX)) { minDiffX = diff; correctionX = diff; snapLineX = target; }
        };
        targetsX.forEach(tx => { checkX(cx, tx); checkX(left, tx); checkX(right, tx); });

        let minDiffY = Infinity;
        const checkY = (val: number, target: number) => {
          const diff = target - val;
          if (Math.abs(diff) < SNAP_THRESHOLD && Math.abs(diff) < Math.abs(minDiffY)) { minDiffY = diff; correctionY = diff; snapLineY = target; }
        };
        targetsY.forEach(ty => { checkY(cy, ty); checkY(top, ty); checkY(bottom, ty); });
      }
    }

    setActiveSnapLines({ x: snapLineX, y: snapLineY });

    setLayers(prev => {
      const next = { ...prev };
      activeUids.forEach(uid => {
        if (dragStart.itemStarts[uid]) {
          next[uid] = { ...next[uid], x: dragStart.itemStarts[uid].x + dx + correctionX, y: dragStart.itemStarts[uid].y + dy + correctionY };
        }
      });
      return next;
    });
  };

  const onPointerUpCanvas = (e: React.PointerEvent) => {
    setIsDraggingCanvas(false);
    setActiveSnapLines({ x: null, y: null });
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  const updateLayer = (uid: string, updates: Partial<LayerState>) => {
    setLayers(prev => ({ ...prev, [uid]: { ...prev[uid], ...updates } }));
  };

  const updateActiveLayers = (updates: Partial<LayerState>) => {
    if (activeUids.length === 0) return;
    setLayers(prev => {
      const next = { ...prev };
      activeUids.forEach(uid => { next[uid] = { ...next[uid], ...updates }; });
      return next;
    });
  };

  const download = useCallback(() => {
    setDownloading(true);
    setTimeout(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 2000; canvas.height = 2000;
      const ctx = canvas.getContext("2d")!;
      
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, 2000, 2000);

      images.forEach(img => {
        const l = layers[img.uid];
        if (!l || !l.visible) return;
        
        ctx.save();
        ctx.translate(1000 + l.x, 1000 + l.y);
        ctx.rotate(l.rot * Math.PI / 180);
        
        const baseScale = Math.min(2000 / img.el.width, 2000 / img.el.height) * 0.5;
        const finalScale = baseScale * l.zoom;
        const w = img.el.width * finalScale;
        const h = img.el.height * finalScale;
        
        // ÚJ: A 'removeBg' már az 'img'-ből jön, nem a layer-ből!
        const imageToDraw = (img.removeBg && processedImages[img.uid]) ? processedImages[img.uid].el : img.el;
        ctx.drawImage(imageToDraw, -w / 2, -h / 2, w, h);
        ctx.restore();
      });

      downloadCanvasAsImage(canvas, "kollazs_manualis");
      setDownloading(false);
      setIsSaved(true); // <--- EZT ADD HOZZÁ A setTimeout VÉGÉRE
    }, 100);
  }, [images, layers, processedImages]);

  const activeLayerData = activeUids.length > 0 ? layers[activeUids[0]] : null;

return {
    images, layers, activeUids, setActiveUids, processedImages,
    containerRef, canvasPixelSize, canvasScale, downloading,
    showGrid, setShowGrid, gridDivisions, setGridDivisions,
    isSnapEnabled, setIsSnapEnabled, activeSnapLines,
    isDraggingCanvas, onPointerDownCanvas, onPointerMoveCanvas, onPointerUpCanvas,
    // JAVÍTÁS: Innen vettük ki az updateAllLayers-t, mert már nincs rá szükség!
    removeImage, removeImages, reorderImages, updateLayer, updateActiveLayers,
    download, activeLayerData, 
    toggleImageBg, setImagesBg, setAllImagesBg, addFiles, fileInputRef, isSaved
  };
}