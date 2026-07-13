"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";

export interface LoadedImg {
  el: HTMLImageElement;
  src: string;
  name: string;
  uid: string;
  removeBg: boolean;
  isBadge?: boolean; // 💡 Ebből tudja a rendszer, hogy ez nem valódi kép
}

interface CollageContextType {
  images: LoadedImg[];
  deletedImages: LoadedImg[];
  setImages: React.Dispatch<React.SetStateAction<LoadedImg[]>>;
  addFiles: (files: FileList | File[]) => Promise<void>;
  removeImage: (index: number) => void;
  removeImages: (uidsToRemove: string[]) => void;
  restoreImage: (uid: string) => void;
  rotateImage: (index: number, degrees: 90 | -90) => void;
  reorderImages: (oldIndex: number, newIndex: number) => void;
  clearImages: () => void;
  shuffleImages: () => void;
  toggleImageBg: (uid: string) => void;
  setImagesBg: (uids: string[], removeBg: boolean) => void;
  setAllImagesBg: (removeBg: boolean) => void;
  manualLayersOverride: Record<string, any> | null;
  setManualLayersOverride: React.Dispatch<React.SetStateAction<Record<string, any> | null>>;
  toggleBadge: (type: 'uj' | 'premium') => void; // 💡 addBadge helyett
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
  const [deletedImages, setDeletedImages] = useState<LoadedImg[]>([]);
  const [manualLayersOverride, setManualLayersOverride] = useState<Record<string, any> | null>(null);


  const toggleBadge = useCallback((type: 'uj' | 'premium') => {
    const badgeName = `cimke_${type}.png`;
    let existed = false;

    // 💡 ELLENŐRZÉS ÉS TÖRLÉS: Ha már van ilyen matrica, akkor letöröljük (Toggle)
    setImages(prev => {
      if (prev.some(img => img.name === badgeName)) {
        existed = true;
        return prev.filter(img => img.name !== badgeName);
      }
      return prev;
    });

    if (existed) return; // Ha letöröltük, nincs más dolgunk!

    // HA NINCS, AKKOR LEGENERÁLJUK:
    const canvas = document.createElement("canvas");
    canvas.width = 700; 
canvas.height = 700;
const ctx = canvas.getContext("2d");
if (!ctx) return;

ctx.scale(1.75, 1.75); // 💡 Felnagyítjuk 1.75-szörösére

    ctx.shadowColor = "rgba(0, 0, 0, 0.35)"; ctx.shadowBlur = 18; ctx.shadowOffsetY = 8;
    const cx = 200; const cy = 200; const outerRadius = 135; const innerRadius = 115; const points = 16;
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const angle = (i * Math.PI) / points;
      const r = (i % 2 === 0) ? outerRadius : innerRadius;
      const x = cx + r * Math.cos(angle); const y = cy + r * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.lineJoin = "round"; ctx.lineWidth = 18;
    const badgeColor = type === 'uj' ? "#FF0000" : "#F4C430";
    ctx.strokeStyle = badgeColor; ctx.fillStyle = badgeColor;
    ctx.stroke(); ctx.shadowColor = "transparent"; ctx.fill();

    if (type === 'uj') {
      ctx.font = "900 125px 'Montserrat', 'Inter', 'Helvetica Neue', 'Segoe UI', sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 4; ctx.lineJoin = "round";
      ctx.strokeText("ÚJ", 200, 205); ctx.fillStyle = "#ffffff"; ctx.fillText("ÚJ", 200, 205);
    } else {
      // --- 💡 ÚJ PRÉMIUM MATRICA: Elegáns Ötágú Csillag ---
      const darkColor = "#1A1A1A";

      ctx.save();
      ctx.translate(200, 200);
      ctx.scale(7, 7); // A csillag méretezése

      // Tökéletes, klasszikus 5 ágú csillag SVG útvonala
      const starPath = new Path2D("M 0 -10 L 3.09 -3.74 L 10 -2.73 L 5 2.14 L 6.18 9.02 L 0 5.77 L -6.18 9.02 L -5 2.14 L -10 -2.73 L -3.09 -3.74 Z");

      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.strokeStyle = darkColor;
      ctx.lineWidth = 1.5;
      ctx.stroke(starPath);
      ctx.fillStyle = darkColor;
      ctx.fill(starPath);
      ctx.restore();
    }

    const dataUrl = canvas.toDataURL("image/png");
    const img = new Image();
    img.onload = () => {
      const newImg = { el: img, src: dataUrl, name: badgeName, uid: Math.random().toString(36).slice(2), removeBg: false, isBadge: true };
      setImages(prev => prev.some(p => p.name === badgeName) ? prev : [...prev, newImg]); // Duplikáció védelem
    };
    img.src = dataUrl;
  }, []);


  const addFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files).filter(f => f.type.startsWith("image/"));
    if (!arr.length) return;
    const newImgs: LoadedImg[] = [];
    for (const file of arr) {
      try {
        const el = await loadImageFromFile(file);
        newImgs.push({ el, src: el.src, name: file.name, uid: uid(), removeBg: true });
      } catch { /* skip */ }
    }
    setImages(prev => [...prev, ...newImgs].slice(0, 150));
  }, []);

  const removeImage = useCallback((index: number) => {
    setImages(prev => {
      const next = [...prev];
      const [removed] = next.splice(index, 1);

      if (removed) {
        setDeletedImages(del => {
          if (del.some(img => img.uid === removed.uid)) return del;
          return [...del, removed].slice(-150); // 💡 -30 helyett -150
        });
      }
      return next;
    });
  }, []);

  const removeImages = useCallback((uidsToRemove: string[]) => {
    setImages(prev => {
      const toTrash = prev.filter(img => uidsToRemove.includes(img.uid));

      if (toTrash.length > 0) {
        setDeletedImages(del => {
          const newToAdd = toTrash.filter(t => !del.some(d => d.uid === t.uid));
          return [...del, ...newToAdd].slice(-150); // 💡 -30 helyett -150
        });
      }
      return prev.filter(img => !uidsToRemove.includes(img.uid));
    });
  }, []);

  // A korábbi restoreImage helyett ezt másolja be:
  const restoreImage = useCallback((uid: string) => {
    // 💡 1. Szigorú ellenőrzés: ha már van 8 képünk, megállítjuk a folyamatot!


    const found = deletedImages.find(img => img.uid === uid);
    if (!found) return;

    setImages(curr => {
      if (curr.some(img => img.uid === uid)) return curr;
      return [...curr, found].slice(0, 150); // 💡 30 helyett 150
    });

    setDeletedImages(del => del.filter(img => img.uid !== uid));
  }, [deletedImages]); // 💡 Fontos: a függőségi tömbbe bekerült az 'images' és 'deletedImages'

  // --- HIÁNYZÓ FÜGGVÉNYEK VISSZAPÓTLÁSA ---

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

  const reorderImages = useCallback((oldIndex: number, newIndex: number) => {
    setImages(prev => {
      const next = [...prev];
      const [moved] = next.splice(oldIndex, 1);
      next.splice(newIndex, 0, moved);
      return next;
    });
  }, []);

  // ----------------------------------------


  const clearImages = useCallback(() => {
    setImages([]);
    setDeletedImages([]);
  }, []);

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

  const toggleImageBg = useCallback((uid: string) => {
    setImages(prev => prev.map(img => img.uid === uid ? { ...img, removeBg: !img.removeBg } : img));
  }, []);

  const setImagesBg = useCallback((uids: string[], removeBg: boolean) => {
    setImages(prev => prev.map(img => uids.includes(img.uid) ? { ...img, removeBg } : img));
  }, []);

  const setAllImagesBg = useCallback((removeBg: boolean) => {
    setImages(prev => prev.map(img => ({ ...img, removeBg })));
  }, []);

  return (
    <CollageContext.Provider value={{
      images, deletedImages, setImages, addFiles, removeImage, removeImages, restoreImage, rotateImage, reorderImages, clearImages, shuffleImages,
      toggleImageBg, setImagesBg, setAllImagesBg,
      manualLayersOverride, setManualLayersOverride, toggleBadge
    }}>
      {children}
    </CollageContext.Provider>
  );
}

export function useCollage() {
  const context = useContext(CollageContext);
  if (!context) throw new Error("useCollage must be used within a CollageProvider");
  return context;
}