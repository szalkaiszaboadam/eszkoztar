// src/lib/imageProcessing.ts

// 1. A HÁTTÉRELTÁVOLÍTÓ FÜGGVÉNY (Ami eddig is itt volt)
export async function processWhiteBackground(img: HTMLImageElement): Promise<{ src: string, el: HTMLImageElement }> {
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    
    // willReadFrequently: true felgyorsítja a pixel-olvasást a böngészőben!
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    
    if (!ctx) {
      resolve({ src: img.src, el: img });
      return;
    }

    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];

      if (a > 20 && r > 235 && g > 235 && b > 235) {
        data[i + 3] = 0; 
      }
    }

    ctx.putImageData(imageData, 0, 0);
    const newSrc = canvas.toDataURL("image/png");
    const newEl = new Image();
    
    newEl.onload = () => resolve({ src: newSrc, el: newEl });
    newEl.src = newSrc;
  });
}

// 2. ÚJ: A KÖZÖS LETÖLTŐ FÜGGVÉNY (Ez hiányzott a fájlból!)
export function downloadCanvasAsImage(canvas: HTMLCanvasElement, filenamePrefix: string) {
  const now = new Date();
  const ds = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
  const ts = `${String(now.getHours()).padStart(2,"0")}-${String(now.getMinutes()).padStart(2,"0")}`;
  
  const a = document.createElement("a");
  a.download = `${filenamePrefix}_${ds}_${ts}.jpg`;
  a.href = canvas.toDataURL("image/jpeg", 0.95);
  a.click();
}