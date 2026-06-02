// src/lib/bgRemoval.ts

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

    // --- AZ AUTOMATA MÓD ALGORITMUSA ---
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];

      // Ha a pixel látható (a > 20) és a színe fehér/világosszürke, akkor átlátszóvá tesszük (a = 0)
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