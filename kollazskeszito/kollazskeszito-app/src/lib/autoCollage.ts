// ── TÍPUSOK ────────────────────────────────────────────────

export interface CroppedImage {
  canvas: HTMLCanvasElement;
  ar: number;              // aspect ratio (width / height)
  originalIndex: number;
  cropOffsetX: number;
  cropOffsetY: number;
  cropW: number;
  cropH: number;
}

export interface RowData {
  count: number;
  rowH: number;
  sumAR: number;
  startIndex: number;
}

export interface ColData {
  count: number;
  sumInvAR: number;
  colW: number;
  startIndex: number;
}

export interface AutoLayout {
  type: "rows" | "cols";
  score: number;
  perm: CroppedImage[];
  part: number[];
  rowData?: RowData[];
  colData?: ColData[];
  totalH: number;
  totalW: number;
  gap: number;
  externalMargin: number;
  signature: string;
}

// ── KÉPVÁGÁS ───────────────────────────────────────────────

export function processAndCrop(img: HTMLImageElement, originalIndex: number): CroppedImage {
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = img.width;
  tempCanvas.height = img.height;
  const ctx = tempCanvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
  const data = imageData.data;
  let minX = tempCanvas.width, minY = tempCanvas.height, maxX = 0, maxY = 0;
  let found = false;

  for (let y = 0; y < tempCanvas.height; y++) {
    for (let x = 0; x < tempCanvas.width; x++) {
      const idx = (y * tempCanvas.width + x) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2], a = data[idx + 3];
      // Átlátszó vagy fehér pixelek kizárása
      const isVisible = a > 20 && !(r > 235 && g > 235 && b > 235);
      if (isVisible) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        found = true;
      } else {
        data[idx + 3] = 0;
      }
    }
  }
  ctx.putImageData(imageData, 0, 0);

  if (!found) {
    // JAVÍTÁS: 'ar: 1' helyett az eredeti képarányt adjuk vissza, ha teljesen világos a kép!
    return { 
      canvas: tempCanvas, 
      ar: img.width / img.height, 
      originalIndex, 
      cropOffsetX: 0, 
      cropOffsetY: 0, 
      cropW: img.width, 
      cropH: img.height 
    };
  }

  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;
  const cropped = document.createElement("canvas");
  cropped.width = cropW;
  cropped.height = cropH;
  cropped.getContext("2d")!.drawImage(tempCanvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);

  return { canvas: cropped, ar: cropW / cropH, originalIndex, cropOffsetX: minX, cropOffsetY: minY, cropW, cropH };
}

// ── PERMUTÁCIÓK & PARTÍCIÓK ────────────────────────────────

function getPermutations(arr: CroppedImage[]): CroppedImage[][] {
  if (arr.length <= 1) return [arr];
  const result: CroppedImage[][] = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const perm of getPermutations(rest)) result.push([arr[i], ...perm]);
  }
  return result;
}

function getPartitions(n: number): number[][] {
  if (n === 0) return [];
  const result: number[][] = [];
  const numSplits = 1 << (n - 1);
  for (let i = 0; i < numSplits; i++) {
    let part: number[] = [], count = 1;
    for (let j = 0; j < n - 1; j++) {
      if ((i & (1 << j)) !== 0) { part.push(count); count = 1; }
      else count++;
    }
    part.push(count);
    result.push(part);
  }
  return result;
}

// ── LAYOUT SZÁMÍTÁS ────────────────────────────────────────

const TARGET = 2000;

function scoreLayout(dims: number[], totalH: number, totalW: number): number {
  const aspectScore = Math.abs(totalH / totalW - 1) * 8000;
  const maxDim = Math.max(...dims);
  const minDim = Math.min(...dims);
  const balanceScore = dims.length > 1 ? (maxDim / minDim - 1) * 1500 : 0;
  return aspectScore + balanceScore;
}

function tryRowLayout(perm: CroppedImage[], part: number[], gap: number, externalMargin: number): AutoLayout | null {
  let totalH = 0;
  const rowData: RowData[] = [];
  const rowHeights: number[] = [];
  let imgIdx = 0;

  for (const count of part) {
    let sumAR = 0;
    for (let i = 0; i < count; i++) sumAR += perm[imgIdx + i].ar;
    const availW = TARGET - (count - 1) * gap;
    if (availW <= 0) return null;
    const rowH = availW / sumAR;
    rowHeights.push(rowH);
    totalH += rowH;
    rowData.push({ count, rowH, sumAR, startIndex: imgIdx });
    imgIdx += count;
  }

  totalH += (part.length - 1) * gap;

  return {
    type: "rows",
    score: scoreLayout(rowHeights, totalH, TARGET),
    perm, part, rowData,
    totalH, totalW: TARGET,
    gap, externalMargin,
    signature: "r:" + part.join("-"),
  };
}

function tryColLayout(perm: CroppedImage[], part: number[], gap: number, externalMargin: number): AutoLayout | null {
  const colInfos: { count: number; sumInvAR: number; startIndex: number }[] = [];
  let imgIdx = 0;

  for (const count of part) {
    let sumInvAR = 0;
    for (let i = 0; i < count; i++) sumInvAR += 1 / perm[imgIdx + i].ar;
    if (sumInvAR <= 0) return null;
    colInfos.push({ count, sumInvAR, startIndex: imgIdx });
    imgIdx += count;
  }

  const availW = TARGET - (part.length - 1) * gap;
  if (availW <= 0) return null;

  let sumInverse = 0, sumGapTerm = 0;
  for (const ci of colInfos) {
    sumInverse += 1 / ci.sumInvAR;
    sumGapTerm += ((ci.count - 1) * gap) / ci.sumInvAR;
  }

  const totalH = (availW + sumGapTerm) / sumInverse;
  if (totalH <= 0 || !isFinite(totalH)) return null;

  const colWidths = colInfos.map(ci => (totalH - (ci.count - 1) * gap) / ci.sumInvAR);
  if (colWidths.some(w => w <= 0)) return null;

  const colData: ColData[] = colInfos.map((ci, i) => ({ ...ci, colW: colWidths[i] }));

  return {
    type: "cols",
    score: scoreLayout(colWidths, totalH, TARGET),
    perm, part, colData,
    totalH, totalW: TARGET,
    gap, externalMargin,
    signature: "c:" + part.join("-"),
  };
}

export function computeLayouts(images: CroppedImage[], gap: number, margin: number, keepOrder = false): AutoLayout[] {
  const allCandidates: AutoLayout[] = [];
  const parts = getPartitions(images.length);

  let allPerms: CroppedImage[][];
  if (keepOrder) {
    allPerms = [images];
  } else {
    const perms = getPermutations(images);
    const sortedAsc = [...images].sort((a, b) => a.ar - b.ar);
    const sortedDesc = [...images].sort((a, b) => b.ar - a.ar);
    allPerms = [...perms, sortedAsc, sortedDesc];
  }

  for (const perm of allPerms) {
    for (const part of parts) {
      const r = tryRowLayout(perm, part, gap, margin);
      if (r) allCandidates.push(r);
      const c = tryColLayout(perm, part, gap, margin);
      if (c) allCandidates.push(c);
    }
  }

  allCandidates.sort((a, b) => a.score - b.score);

  const seen = new Set<string>();
  const top: AutoLayout[] = [];
  const maxVariants = images.length === 1 ? 1 : 3;

  for (const item of allCandidates) {
    if (!seen.has(item.signature)) {
      top.push(item);
      seen.add(item.signature);
    }
    if (top.length === maxVariants) break;
  }

  return top;
}

// ── CANVAS RAJZOLÁS ────────────────────────────────────────

function drawLayout(
  ctx: CanvasRenderingContext2D,
  layout: AutoLayout,
  canvasW: number,
  canvasH: number,
  bgColor: string,
  marginPx: number,
) {
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, canvasW, canvasH);

  const { gap, totalH, totalW, perm } = layout;
  const drawW = canvasW - marginPx * 2;
  const drawH = canvasH - marginPx * 2;
  const scale = Math.min(drawW / totalW, drawH / totalH);
  const offX = (canvasW - totalW * scale) / 2;
  const offY = (canvasH - totalH * scale) / 2;

  if (layout.type === "cols") {
    let cx = offX;
    for (const col of layout.colData!) {
      const cw = col.colW * scale;
      let cy = offY;
      for (let i = 0; i < col.count; i++) {
        const item = perm[col.startIndex + i];
        const ch = (col.colW / item.ar) * scale;
        ctx.drawImage(item.canvas, cx, cy, cw, ch);
        cy += ch + gap * scale;
      }
      cx += cw + gap * scale;
    }
  } else {
    let cy = offY;
    for (const row of layout.rowData!) {
      let cx = offX;
      const rh = row.rowH * scale;
      for (let i = 0; i < row.count; i++) {
        const item = perm[row.startIndex + i];
        const rw = item.ar * row.rowH * scale;
        ctx.drawImage(item.canvas, cx, cy, rw, rh);
        cx += rw + gap * scale;
      }
      cy += rh + gap * scale;
    }
  }
}

/** Végleges 2000×2000 px export */
export function renderToCanvas(canvas: HTMLCanvasElement, layout: AutoLayout, bgColor = "#ffffff") {
  canvas.width = 2000;
  canvas.height = 2000;
  const ctx = canvas.getContext("2d")!;
  drawLayout(ctx, layout, 2000, 2000, bgColor, layout.externalMargin);
}

/** Preview: a canvas mindig fix 1:1 arányú négyzet, akárcsak a 2000x2000-es letöltés */
export function renderPreview(canvas: HTMLCanvasElement, layout: AutoLayout, bgColor = "#ffffff", size = 800) {
  // 1. Kőbe vésett négyzet méret
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  
  // 2. A margót arányosítjuk a 2000-es célmérethez képest a preview méretére
  const marginPx = (layout.externalMargin / 2000) * size;
  
  // 3. A drawLayout funkció magától középre rendezi a tartalmat a négyzeten belül!
  drawLayout(ctx, layout, size, size, bgColor, marginPx);
}