// src/hooks/useManualMode.ts
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useCollage, LoadedImg } from "@/src/components/CollageContext";
import { processWhiteBackground, downloadCanvasAsImage } from "@/src/lib/imageProcessing";

export type LayerState = {
  x: number;
  y: number;
  zoom: number;
  rot: number;
  visible: boolean;
};

type HistorySnapshot = {
  images: LoadedImg[];
  layers: Record<string, LayerState>;
};

export function useManualMode() {
  const { 
    images, setImages, removeImage, removeImages, reorderImages, 
    toggleImageBg, setImagesBg, setAllImagesBg, addFiles,
    manualLayersOverride, setManualLayersOverride // <--- ÚJ
  } = useCollage();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [layers, setLayers] = useState<Record<string, LayerState>>({});
  const [activeUids, setActiveUids] = useState<string[]>([]);
  const [processedImages, setProcessedImages] = useState<Record<string, { src: string, el: HTMLImageElement }>>({});
  const processedRef = useRef<Set<string>>(new Set());

  const [canvasPixelSize, setCanvasPixelSize] = useState(800);
  const containerRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  const [showGrid, setShowGrid] = useState(false);
  const [gridDivisions, setGridDivisions] = useState(20);
  const [isSnapEnabled, setIsSnapEnabled] = useState(true);
  const [activeSnapLines, setActiveSnapLines] = useState<{x: number | null, y: number | null}>({ x: null, y: null });

  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const historyRef = useRef<HistorySnapshot[]>([]);
  const historyIndexRef = useRef(-1);
  const isRestoringRef = useRef(false); 

  const saveSnapshot = useCallback((currentImages: LoadedImg[], currentLayers: Record<string, LayerState>) => {
    if (isRestoringRef.current) return;

    const mappedImages = currentImages.map(img => ({ uid: img.uid, removeBg: img.removeBg, el: img.el, src: img.src, name: img.name }));
    const lastState = historyRef.current[historyIndexRef.current];
    
    if (lastState) {
      const isImagesSame = JSON.stringify(lastState.images.map(i => ({ u: i.uid, b: i.removeBg }))) === JSON.stringify(mappedImages.map(i => ({ u: i.uid, b: i.removeBg })));
      const isLayersSame = JSON.stringify(lastState.layers) === JSON.stringify(currentLayers);
      if (isImagesSame && isLayersSame) return; 
    }

    const newHistory = historyRef.current.slice(0, historyIndexRef.current + 1);
    newHistory.push({ images: mappedImages as LoadedImg[], layers: JSON.parse(JSON.stringify(currentLayers)) });
    
    if (newHistory.length > 30) newHistory.shift(); 
    
    historyRef.current = newHistory;
    historyIndexRef.current = newHistory.length - 1;
    
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
  }, []);


  // --- ÚJ: Friss állapot referencia a gyors billentyűparancsokhoz ---
  const latestStateRef = useRef({ images, layers });
  useEffect(() => {
    latestStateRef.current = { images, layers };
  }, [images, layers]);

  useEffect(() => {
    setIsSaved(false);
  }, [images, layers]);


// 💥 ÚJ, GOLYÓÁLLÓ RESIZEOBSERVER (Nincs több beragadó kicsi vászon!) 💥
  useEffect(() => {
    let animationFrameId: number;
    let observer: ResizeObserver;

    const updateSize = () => {
      if (!containerRef.current) return;
      
      const rect = containerRef.current.getBoundingClientRect();
      
      // A FŐ JAVÍTÁS: Ha a Flexbox még nem rendezte el a layoutot (méret = 0), 
      // akkor ignoráljuk, így nem ugrik össze 100x100-ra!
      if (rect.width === 0 || rect.height === 0) return;
      
      const minDim = Math.min(rect.width, rect.height) - 64;
      setCanvasPixelSize(Math.max(100, minDim));
    };

    // 1. Késleltetett első mérés: hagyjuk, hogy a böngésző CSS-e végezzen az elrendezéssel
    const initTimeout = setTimeout(() => {
      updateSize();
      
      // 2. Csak a stabilizálódás után indítjuk a figyelőt
      if (containerRef.current) {
        observer = new ResizeObserver(() => {
          cancelAnimationFrame(animationFrameId);
          animationFrameId = requestAnimationFrame(updateSize);
        });
        observer.observe(containerRef.current);
      }
    }, 50);

    // 3. Biztonsági háló: Ha a ResizeObserver mégis leállna, a sima ablakméretezés is frissít!
    window.addEventListener("resize", updateSize);

    return () => {
      clearTimeout(initTimeout);
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", updateSize);
      if (observer) observer.disconnect();
    };
  }, []);

  const canvasScale = canvasPixelSize / 2000;

  useEffect(() => {
    if (isRestoringRef.current) return; 

    // HA ÉRKEZETT ÁTADOTT ÁLLAPOT AZ AUTOMATA MÓDBÓL:
    if (manualLayersOverride) {
      setLayers(manualLayersOverride);
      
      // Azonnal elmentjük a történetbe (History), hogy az Undo azonnal működjön rá!
      setTimeout(() => {
        saveSnapshot(images, manualLayersOverride);
      }, 100);
      
      setManualLayersOverride(null); // Töröljük a memóriából, hogy ne ragadjon be
      return;
    }

   // ALAPÉRTELMEZETT ESET (Sima Manuális mód megnyitása)
    setLayers(prev => {
      const next = { ...prev };
      let changed = false;
      images.forEach(img => {
        if (!next[img.uid]) {
          next[img.uid] = { x: 0, y: 0, zoom: 0.8, rot: 0, visible: true };
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [images, manualLayersOverride, setManualLayersOverride, saveSnapshot]); 

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

  useEffect(() => {
    if (isRestoringRef.current || isDraggingCanvas) return;
    if (images.length === 0 && historyRef.current.length === 0) return;

    const timer = setTimeout(() => {
      saveSnapshot(images, layers);
    }, 400);

    return () => clearTimeout(timer);
  }, [images, layers, isDraggingCanvas, saveSnapshot]);

  const undo = useCallback(() => {
    if (historyIndexRef.current > 0) {
      isRestoringRef.current = true;
      historyIndexRef.current -= 1;
      const state = historyRef.current[historyIndexRef.current];
      
      setImages(state.images);
      setLayers(state.layers);
      
      setCanUndo(historyIndexRef.current > 0);
      setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
      
      setTimeout(() => { isRestoringRef.current = false; }, 50);
    }
  }, [setImages]);

  const redo = useCallback(() => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      isRestoringRef.current = true;
      historyIndexRef.current += 1;
      const state = historyRef.current[historyIndexRef.current];
      
      setImages(state.images);
      setLayers(state.layers);
      
      setCanUndo(historyIndexRef.current > 0);
      setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
      
      setTimeout(() => { isRestoringRef.current = false; }, 50);
    }
  }, [setImages]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        // ÚJ: Azonnali mentés a Ctrl+Z lenyomásakor, hogy a legutolsó gyors mozdulat se vesszen el!
        saveSnapshot(latestStateRef.current.images, latestStateRef.current.layers);
        if (e.shiftKey) redo(); else undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        saveSnapshot(latestStateRef.current.images, latestStateRef.current.layers);
        redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, saveSnapshot]);

  const onPointerDownCanvas = (e: React.PointerEvent, uid: string) => {
    e.stopPropagation();

    // 💥 A FŐ JAVÍTÁS ITT VAN 💥
    // Mielőtt egy új húzás elkezdődne, belekényszerítjük a legutóbbi állapotot a történetbe.
    // Így ha a 400ms-es várakozás még nem járt le az előző kép elengedése óta, az is biztosan külön lépés lesz!
    saveSnapshot(images, layers);

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
        
        const imageToDraw = (img.removeBg && processedImages[img.uid]) ? processedImages[img.uid].el : img.el;
        ctx.drawImage(imageToDraw, -w / 2, -h / 2, w, h);
        ctx.restore();
      });

      downloadCanvasAsImage(canvas, "kollazs_manualis");
      setDownloading(false);
      setIsSaved(true); 
    }, 100);
  }, [images, layers, processedImages]);

  const activeLayerData = activeUids.length > 0 ? layers[activeUids[0]] : null;

return {
    images, layers, activeUids, setActiveUids, processedImages,
    containerRef, canvasPixelSize, canvasScale, downloading,
    showGrid, setShowGrid, gridDivisions, setGridDivisions,
    isSnapEnabled, setIsSnapEnabled, activeSnapLines,
    isDraggingCanvas, onPointerDownCanvas, onPointerMoveCanvas, onPointerUpCanvas,
    removeImage, removeImages, reorderImages, updateLayer, updateActiveLayers,
    download, activeLayerData, 
    toggleImageBg, setImagesBg, setAllImagesBg, addFiles, fileInputRef, isSaved,
    undo, redo, canUndo, canRedo 
  };
}