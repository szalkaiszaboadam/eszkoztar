// src/lib/sheetsService.ts
import {
  collection, addDoc, getDocs, deleteDoc,
  doc, updateDoc, serverTimestamp, query, orderBy, where,
} from "firebase/firestore";
import {
  ref as dbRef, set, get, remove, update
} from "firebase/database";
import { db, rtdb } from "./firebase";
import { DEFAULT_ROW_COUNT } from "./constants";

export interface Sheet {
  id: string;
  title: string;
  createdAt: any;
  updatedAt: any;
  rowCount?: number;
  folderId?: string | null;
  previewData?: string[];
  isFavorite?: boolean;
}

export interface Folder {
  id: string;
  title: string;
  createdAt: any;
  parentId?: string | null;
  isFavorite?: boolean;
}

// -----------------------------------------------------------------------------
// CACHE: Tárolja a cellák referencia-állapotát a villámgyors ellenőrzéshez
// -----------------------------------------------------------------------------
const sheetCache = new Map<string, {
  cellsRef: any;
  chunkedRows: any;
}>();

export async function createSheet(userId: string, title: string, folderId: string | null = null): Promise<string> {
  const docRef = await addDoc(collection(db, "users", userId, "sheets"), {
    title,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    rowCount: DEFAULT_ROW_COUNT,
    folderId,
  });
  return docRef.id;
}

export async function getSheets(userId: string): Promise<Sheet[]> {
  const q = query(collection(db, "users", userId, "sheets"), orderBy("updatedAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Sheet));
}

export async function deleteSheet(userId: string, sheetId: string): Promise<void> {
  await deleteDoc(doc(db, "users", userId, "sheets", sheetId));
  await remove(dbRef(rtdb, `sheets/${userId}/${sheetId}`));
  sheetCache.delete(sheetId);
}

export async function renameSheet(userId: string, sheetId: string, title: string): Promise<void> {
  await updateDoc(doc(db, "users", userId, "sheets", sheetId), {
    title, updatedAt: serverTimestamp(),
  });
}

// -----------------------------------------------------------------------------
// MENTÉS: Extrém gyors Delta-frissítéssel (Csak a megváltozott sorokat menti)
// -----------------------------------------------------------------------------
export async function saveCells(
  userId: string,
  sheetId: string,
  cellsByTab: any,
  rowCountByTab: any,
  tabs: any[],
  colWidthsByTab: any,
  rowHeightsByTab: any
): Promise<void> {

  const cache = sheetCache.get(sheetId) || { cellsRef: {}, chunkedRows: {} };
  const newCellsRef: any = {};
  const newChunkedRows: any = {};
  const updates: any = {};

  let totalUpdatedRows = 0;

  for (const tab in cellsByTab) {
    const currentCells = cellsByTab[tab] || {};
    const prevCells = cache.cellsRef[tab] || {};
    const prevChunked = cache.chunkedRows[tab] || {};

    newCellsRef[tab] = currentCells;
    newChunkedRows[tab] = {};

    const dirtyRows = new Set<string>();

    // 1. LÉPÉS: Megkeressük, hogy mely cellák memóriacíme (referenciája) változott meg. Ez szupergyors!
    const currentCellIds = Object.keys(currentCells);
    for (let i = 0; i < currentCellIds.length; i++) {
      const cellId = currentCellIds[i];
      if (currentCells[cellId] !== prevCells[cellId]) {
        let idx = 0;
        while (idx < cellId.length && (cellId.charCodeAt(idx) < 48 || cellId.charCodeAt(idx) > 57)) idx++;
        dirtyRows.add(cellId.substring(idx) || "0");
      }
    }

    // Törölt cellák keresése
    const prevCellIds = Object.keys(prevCells);
    for (let i = 0; i < prevCellIds.length; i++) {
      const cellId = prevCellIds[i];
      if (!(cellId in currentCells)) {
        let idx = 0;
        while (idx < cellId.length && (cellId.charCodeAt(idx) < 48 || cellId.charCodeAt(idx) > 57)) idx++;
        dirtyRows.add(cellId.substring(idx) || "0");
      }
    }

    // 2. LÉPÉS: Csoportosítjuk az ezen a lapon lévő cellákat sorok szerint
    const rowData: Record<string, Record<string, any>> = {};
    for (let i = 0; i < currentCellIds.length; i++) {
      const cellId = currentCellIds[i];
      let idx = 0;
      while (idx < cellId.length && (cellId.charCodeAt(idx) < 48 || cellId.charCodeAt(idx) > 57)) idx++;
      const row = cellId.substring(idx) || "0";

      if (!rowData[row]) rowData[row] = {};
      rowData[row][cellId] = currentCells[cellId];
    }

    // 3. LÉPÉS: CSAK A MÓDOSULT sorokat csomagoljuk be szöveggé! A többit kivesszük a Cache-ből.
    for (const row in rowData) {
      if (dirtyRows.has(row) || !prevChunked[row]) {
        const cleanRow: any = {};
        const cellsInRow = rowData[row];
        for (const cellId in cellsInRow) {
          const cell = cellsInRow[cellId];
          if (!cell) continue;

          const hasValue = cell.value !== undefined && cell.value !== null && cell.value !== "";
          const hasFormula = cell.formula !== undefined && cell.formula !== null && cell.formula !== "";
          const hasFormat = cell.format !== undefined && cell.format !== null && Object.keys(cell.format).length > 0;

          if (hasValue || hasFormula || hasFormat) {
            const cleanCell: any = {};
            if (hasValue) cleanCell.value = cell.value;
            if (hasFormula) cleanCell.formula = cell.formula;
            if (hasFormat) cleanCell.format = cell.format;
            cleanRow[cellId] = cleanCell;
          }
        }
        const rowString = JSON.stringify(cleanRow);
        newChunkedRows[tab][row] = rowString;

        // Ha tényleg változott az adat
        if (rowString !== prevChunked[row]) {
          updates[`cellsByTab/${tab}/${row}`] = rowString;
          totalUpdatedRows++;
        }
      } else {
        // Nem változott? Használjuk az elmentettet (Zéró CPU használat!)
        newChunkedRows[tab][row] = prevChunked[row];
      }
    }

    // Törölt sorok regisztrálása
    for (const oldRow in prevChunked) {
      if (!rowData[oldRow]) {
        updates[`cellsByTab/${tab}/${oldRow}`] = null;
        totalUpdatedRows++;
      }
    }
  }

  // Törölt fülek (Munkalapok) kezelése
  for (const oldTab in cache.chunkedRows) {
    if (!cellsByTab[oldTab]) {
      updates[`cellsByTab/${oldTab}`] = null;
      totalUpdatedRows += Object.keys(cache.chunkedRows[oldTab]).length || 1;
    }
  }

  const cleanColWidths = JSON.parse(JSON.stringify(colWidthsByTab || {}));
  const cleanRowHeights = JSON.parse(JSON.stringify(rowHeightsByTab || {}));

  updates["rowCountByTab"] = rowCountByTab || { 0: 50 };
  updates["tabs"] = tabs || ["Sheet1"];
  updates["colWidthsByTab"] = cleanColWidths;
  updates["rowHeightsByTab"] = cleanRowHeights;
  updates["updatedAt"] = Date.now();

  // 4. LÉPÉS: FIREBASE FELTÖLTÉS BIZTONSÁGI SZELEPPEL
  if (totalUpdatedRows > 100) {
    // Ha sok sort törölsz vagy újat importálsz, az update() lefagyna. Itt a set() a nyerő.
    const payload = {
      cellsByTab: newChunkedRows,
      rowCountByTab: updates["rowCountByTab"],
      tabs: updates["tabs"],
      colWidthsByTab: updates["colWidthsByTab"],
      rowHeightsByTab: updates["rowHeightsByTab"],
      updatedAt: updates["updatedAt"],
    };
    await set(dbRef(rtdb, `sheets/${userId}/${sheetId}`), payload);
  } else {
    // Ha 1-2 cellát átírsz, az update() azonnal, ezredmásodpercek alatt végez!
    await update(dbRef(rtdb, `sheets/${userId}/${sheetId}`), updates);
  }

  // Gyorstár frissítése a következő leütéshez
  sheetCache.set(sheetId, { cellsRef: newCellsRef, chunkedRows: newChunkedRows });

  // 5. Előnézet generálása aszinkron módon a Firestore-ba (nem váratja a felhasználót)
  try {
    let preview: string[] = [];
    const firstTabKey = Object.keys(newChunkedRows)[0];
    if (firstTabKey !== undefined) {
      const firstTabRows = newChunkedRows[firstTabKey] || {};
      const previewCells: any = {};
      for (let i = 1; i <= 4; i++) {
        if (firstTabRows[i]) Object.assign(previewCells, JSON.parse(firstTabRows[i]));
      }
      const PREVIEW_COLS = ["A", "B", "C", "D"];
      for (let r = 1; r <= 4; r++) {
        for (let c = 0; c < PREVIEW_COLS.length; c++) {
          const cellKey = `${PREVIEW_COLS[c]}${r}`;
          const cell = previewCells[cellKey];
          let val = ""; let fmt = null;
          if (cell) {
            val = typeof cell === "string" ? cell : (cell.value || cell.computed || "");
            if (cell.format) { fmt = { bold: cell.format.bold, italic: cell.format.italic, underline: cell.format.underline, bgColor: cell.format.bgColor, color: cell.format.color, align: cell.format.align, border: cell.format.border }; }
          }
          preview.push(JSON.stringify({ v: val.toString().substring(0, 20), f: fmt }));
        }
      }
    }

    const rcVals = Object.values(rowCountByTab || {});
    const maxRowC = rcVals.length > 0 ? Math.max(...(rcVals as number[])) : 50;

    // Nem várjuk meg a Firestore-t (nincs await), a Mentve szöveg azonnal megjelenik
    updateDoc(doc(db, "users", userId, "sheets", sheetId), {
      updatedAt: serverTimestamp(),
      rowCount: maxRowC,
      previewData: preview,
    }).catch(console.error);

  } catch (e) { console.error(e); }
}

// -----------------------------------------------------------------------------
// BETÖLTÉS: Villámgyors, memória-barát beolvasás
// -----------------------------------------------------------------------------
export async function loadSheetData(userId: string, sheetId: string) {
  const snap = await get(dbRef(rtdb, `sheets/${userId}/${sheetId}`));
  if (!snap.exists()) {
    return {
      cellsByTab: { 0: {} }, rowCountByTab: { 0: 50 },
      tabs: ["Sheet1"], colWidthsByTab: { 0: {} }, rowHeightsByTab: { 0: {} },
    };
  }
  const data = snap.val();
  let parsedCells: any = {};
  const chunkedRowsCache: any = {};
  const dataCells = data.cellsByTab || {};

  if (typeof dataCells === "string") {
    try { parsedCells = JSON.parse(dataCells); } catch (e) { }
  } else {
    for (const tab in dataCells) {
      parsedCells[tab] = {};
      chunkedRowsCache[tab] = {};
      const tabData = dataCells[tab];

      if (typeof tabData === "string") {
        try { parsedCells[tab] = JSON.parse(tabData); } catch (e) { }
      } else if (typeof tabData === "object") {
        const rowKeys = Object.keys(tabData);
        for (let i = 0; i < rowKeys.length; i++) {
          // Finom pihentetés betöltés alatt: A "Betöltés..." animáció nem fagy meg!
          if (i > 0 && i % 1000 === 0) await new Promise(r => setTimeout(r, 0));

          const key = rowKeys[i];
          const val = tabData[key];
          if (typeof val === "string") {
            chunkedRowsCache[tab][key] = val;
            try {
              const parsedRow = JSON.parse(val);
              const cellKeys = Object.keys(parsedRow);
              for (let j = 0; j < cellKeys.length; j++) {
                parsedCells[tab][cellKeys[j]] = parsedRow[cellKeys[j]];
              }
            } catch (e) { }
          } else {
            parsedCells[tab][key] = val;
          }
        }
      }
    }
  }

  // BEÁLLÍTJUK A CACHE-T! Így az első mentés már villámgyors lesz.
  sheetCache.set(sheetId, { cellsRef: parsedCells, chunkedRows: chunkedRowsCache });

  return {
    cellsByTab: Object.keys(parsedCells).length > 0 ? parsedCells : { 0: {} },
    rowCountByTab: data.rowCountByTab ?? { 0: 50 },
    tabs: data.tabs ?? ["Sheet1"],
    colWidthsByTab: data.colWidthsByTab ?? { 0: {} },
    rowHeightsByTab: data.rowHeightsByTab ?? { 0: {} },
  };
}

// --- INNENTŐL LEFELÉ A TÖBBI KÓD (Import, Mappák) VÁLTOZATLAN MARAD ---

export function csvToCells(csv: string) {
  const Papa = require("papaparse");
  const result = Papa.parse(csv, { skipEmptyLines: true });
  const rows = result.data as string[][];
  const cells: Record<string, any> = {};

  const getColLetter = (idx: number) => {
    let temp, letter = '';
    while (idx > 0) {
      temp = (idx - 1) % 26;
      letter = String.fromCharCode(temp + 65) + letter;
      idx = (idx - temp - 1) / 26;
    }
    return letter;
  };

  rows.forEach((row, rIdx) => {
    row.forEach((val, cIdx) => {
      const finalValue = val !== undefined && val !== null ? String(val).trim() : "";
      if (finalValue !== "") {
        const cellRef = `${getColLetter(cIdx + 1)}${rIdx + 1}`;
        const isFormula = finalValue.startsWith("=");
        cells[cellRef] = { value: finalValue, formula: isFormula ? finalValue : "" };
      }
    });
  });

  const rowCount = Math.max(50, rows.length + 10);
  return {
    cellsByTab: { 0: cells }, rowCountByTab: { 0: rowCount },
    tabs: ["Sheet1"], colWidthsByTab: { 0: {} }, rowHeightsByTab: { 0: {} }
  };
}

export async function xlsxToCells(data: ArrayBuffer) {
  const exceljsModule = await import("exceljs");
  const ExcelJS = exceljsModule.default || exceljsModule;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data);

  const cellsByTab: Record<number, Record<string, any>> = {};
  const rowCountByTab: Record<number, number> = {};
  const colWidthsByTab: Record<number, Record<string, number>> = {};
  const rowHeightsByTab: Record<number, Record<string, number>> = {};
  const tabs: string[] = [];

  const getColLetter = (idx: number) => {
    let temp, letter = '';
    while (idx > 0) {
      temp = (idx - 1) % 26;
      letter = String.fromCharCode(temp + 65) + letter;
      idx = (idx - temp - 1) / 26;
    }
    return letter;
  };

  wb.eachSheet((worksheet, sheetId) => {
    const tabIdx = tabs.length;
    tabs.push(worksheet.name);

    const cells: Record<string, any> = {};
    const colWidths: Record<string, number> = {};
    const rowHeights: Record<string, number> = {};
    let maxRow = 50;

    for (let i = 1; i <= worksheet.columnCount; i++) {
      const col = worksheet.getColumn(i);
      if (col && col.width) colWidths[getColLetter(i)] = Math.round(col.width * 7);
    }

    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber > maxRow) maxRow = rowNumber;
      if (row.height) rowHeights[rowNumber.toString()] = Math.round(row.height * 1.33);

      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const cellRef = cell.address;
        const format: any = {};

        if (cell.font) {
          if (cell.font.bold) format.bold = true;
          if (cell.font.italic) format.italic = true;
          if (cell.font.underline) format.underline = true;
          if (cell.font.size) format.fontSize = cell.font.size;
          if (cell.font.color && cell.font.color.argb) {
            let argb = cell.font.color.argb;
            if (argb && argb.length === 8) argb = argb.substring(2);
            format.color = "#" + argb.toLowerCase();
          }
        }

        if (cell.fill && cell.fill.type === 'pattern' && cell.fill.fgColor) {
          let argb = cell.fill.fgColor.argb;
          if (argb && argb.length === 8) {
            argb = argb.substring(2);
            format.bgColor = "#" + argb.toLowerCase();
          }
        }

        if (cell.alignment && cell.alignment.horizontal) {
          const align = cell.alignment.horizontal;
          if (align === "left" || align === "center" || align === "right") format.align = align;
        }

        if (cell.border) {
          const mapBorder = (b: any) => {
            if (!b) return null;
            let color = "#000000";
            if (b.color && b.color.argb) {
              let argb = b.color.argb;
              if (argb && argb.length === 8) argb = argb.substring(2);
              color = "#" + argb.toLowerCase();
            }
            return { style: b.style || "thin", color };
          };
          const cleanBorders: any = {};
          const t = mapBorder(cell.border.top); if (t) cleanBorders.top = t;
          const b = mapBorder(cell.border.bottom); if (b) cleanBorders.bottom = b;
          const l = mapBorder(cell.border.left); if (l) cleanBorders.left = l;
          const r = mapBorder(cell.border.right); if (r) cleanBorders.right = r;
          if (Object.keys(cleanBorders).length > 0) format.border = cleanBorders;
        }

        let value: any = cell.value;
        let formula = "";
        if (value instanceof Date) {
          value = value.toLocaleDateString("hu-HU");
        } else if (value && typeof value === 'object') {
          if ('formula' in value) {
            formula = "=" + (value.formula as string);
            let res = value.result;
            if (res instanceof Date) value = res.toLocaleDateString("hu-HU");
            else if (res && typeof res === 'object' && 'error' in res) value = "#HIBA";
            else value = res !== undefined ? res : "";
          } else if ('richText' in value) {
            value = (value.richText as any[]).map(rt => rt.text).join("");
          }
        }

        const finalValue = value !== undefined && value !== null ? String(value) : "";
        const hasFormat = Object.keys(format).length > 0;

        if (finalValue !== "" || formula !== "" || hasFormat) {
          cells[cellRef] = { value: finalValue, formula: formula, ...(hasFormat ? { format } : {}) };
        }
      });
    });

    cellsByTab[tabIdx] = cells;
    rowCountByTab[tabIdx] = Math.max(50, maxRow + 10);
    colWidthsByTab[tabIdx] = colWidths;
    rowHeightsByTab[tabIdx] = rowHeights;
  });

  if (tabs.length === 0) {
    tabs.push("Sheet1"); cellsByTab[0] = {}; rowCountByTab[0] = 50; colWidthsByTab[0] = {}; rowHeightsByTab[0] = {};
  }
  return { cellsByTab, rowCountByTab, tabs, colWidthsByTab, rowHeightsByTab };
}

export async function createFolder(userId: string, title: string, parentId: string | null = null) {
  const docRef = await addDoc(collection(db, "users", userId, "folders"), { title, createdAt: serverTimestamp(), parentId });
  return docRef.id;
}

export async function moveFolder(userId: string, folderId: string, newParentId: string | null) {
  await updateDoc(doc(db, "users", userId, "folders", folderId), { parentId: newParentId });
}

export async function getFolders(userId: string): Promise<Folder[]> {
  const snap = await getDocs(query(collection(db, "users", userId, "folders")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Folder[];
}

export async function moveSheetToFolder(userId: string, sheetId: string, folderId: string | null) {
  await updateDoc(doc(db, "users", userId, "sheets", sheetId), { folderId, updatedAt: serverTimestamp() });
}

export async function deleteFolder(userId: string, folderId: string) {
  const sheetsQ = query(collection(db, "users", userId, "sheets"), where("folderId", "==", folderId));
  const sSnap = await getDocs(sheetsQ);
  for (const d of sSnap.docs) await deleteSheet(userId, d.id);
  const foldersQ = query(collection(db, "users", userId, "folders"), where("parentId", "==", folderId));
  const fSnap = await getDocs(foldersQ);
  for (const d of fSnap.docs) await deleteFolder(userId, d.id);
  await deleteDoc(doc(db, "users", userId, "folders", folderId));
}

export async function renameFolder(userId: string, folderId: string, newTitle: string) {
  await updateDoc(doc(db, "users", userId, "folders", folderId), { title: newTitle });
}

export async function toggleSheetFavorite(userId: string, sheetId: string, isFavorite: boolean) {
  await updateDoc(doc(db, "users", userId, "sheets", sheetId), { isFavorite });
}

export async function toggleFolderFavorite(userId: string, folderId: string, isFavorite: boolean) {
  await updateDoc(doc(db, "users", userId, "folders", folderId), { isFavorite });
}

export async function updateLastOpened(userId: string, sheetId: string) {
  await updateDoc(doc(db, "users", userId, "sheets", sheetId), { lastOpenedAt: serverTimestamp() });
}