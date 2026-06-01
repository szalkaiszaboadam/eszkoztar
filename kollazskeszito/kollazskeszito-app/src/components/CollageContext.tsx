"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";

export interface LoadedImg {
  el: HTMLImageElement;
  src: string;
  name: string;
  uid: string;
}

interface CollageContextType {
  images: LoadedImg[];
  setImages: React.Dispatch<React.SetStateAction<LoadedImg[]>>;
  addFiles: (files: FileList | File[]) => Promise<void>;
  removeImage: (index: number) => void;
  rotateImage: (index: number, degrees: 90 | -90) => void;
  reorderImages: (oldIndex: number, newIndex: number) => void; // <-- ÚJ D&D FÜGGVÉNY
  clearImages: () => void;
  shuffleImages: () => void;
}

const CollageContext = createContext<CollageContextType | null>(null);

function uid() { return Math.random().toString(36).slice(2); }

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function CollageProvider({ children }: { children: ReactNode }) {
  const [images, setImages] = useState<LoadedImg[]>([]);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files).filter(f => f.type.startsWith("image/"));
    if (!arr.length) return;
    const newImgs: LoadedImg[] = [];
    for (const file of arr) {
      try {
        const el = await loadImageFromFile(file);
        newImgs.push({ el, src: el.src, name: file.name, uid: uid() });
      } catch { /* skip */ }
    }
    setImages(prev => [...prev, ...newImgs].slice(0, 30));
  }, []);

  const removeImage = useCallback((index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  }, []);

  const rotateImage = useCallback((index: number, degrees: 90 | -90) => {
    setImages(prev => {
      const next = [...prev];
      const img = next[index];
      const canvas = document.createElement("canvas");
      canvas.width = img.el.height; canvas.height = img.el.width;
      const ctx = canvas.getContext("2d")!;
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((degrees * Math.PI) / 180);
      ctx.drawImage(img.el, -img.el.width / 2, -img.el.height / 2);
      const newSrc = canvas.toDataURL();
      const newEl = new Image(); newEl.src = newSrc;
      next[index] = { ...img, el: newEl, src: newSrc };
      return next;
    });
  }, []);

  // ÚJ: A Fogd és Vidd átrendező logikája
  const reorderImages = useCallback((oldIndex: number, newIndex: number) => {
    setImages(prev => {
      const next = [...prev];
      const [moved] = next.splice(oldIndex, 1);
      next.splice(newIndex, 0, moved);
      return next;
    });
  }, []);

  const clearImages = useCallback(() => setImages([]), []);

  const shuffleImages = useCallback(() => {
    setImages(prev => {
      const next = [...prev];
      for (let i = next.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [next[i], next[j]] = [next[j], next[i]];
      }
      return next;
    });
  }, []);

  return (
    <CollageContext.Provider value={{ images, setImages, addFiles, removeImage, rotateImage, reorderImages, clearImages, shuffleImages }}>
      {children}
    </CollageContext.Provider>
  );
}

export function useCollage() {
  const context = useContext(CollageContext);
  if (!context) throw new Error("useCollage must be used within a CollageProvider");
  return context;
}