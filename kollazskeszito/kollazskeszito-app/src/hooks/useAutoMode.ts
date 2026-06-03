"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { useCollage } from "@/src/components/CollageContext";
import { processAndCrop, computeLayouts, renderToCanvas, AutoLayout } from "@/src/lib/autoLayoutEngine"; 
import { downloadCanvasAsImage } from "@/src/lib/imageProcessing";

export function useAutoMode() {
  const { images, addFiles, removeImage, rotateImage, reorderImages, clearImages, shuffleImages, toggleImageBg, setAllImagesBg } = useCollage(); // ÚJ: Behúztuk a Contextből

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
    reorderImages, clearImages, shuffleImages, toggleImageBg, setAllImagesBg, isSaved // ÚJ
  };
}