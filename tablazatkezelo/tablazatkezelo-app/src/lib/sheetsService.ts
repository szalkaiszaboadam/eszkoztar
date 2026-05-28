// src/lib/sheetsService.ts
import {
  collection, addDoc, getDocs, deleteDoc,
  doc, updateDoc, serverTimestamp, query, orderBy, where,
} from "firebase/firestore";
import {
  ref as dbRef, set, get, remove
} from "firebase/database";
import { db, rtdb } from "./firebase";
import { CellData } from "./sheetStore";
import { DEFAULT_ROW_COUNT } from "./constants";

export interface Sheet {
  id: string;
  title: string;
  createdAt: any;
  updatedAt: any;
  rowCount?: number;
  folderId?: string | null;
  previewData?: string[]; // JAVÍTVA: Sima tömb (flat array)
  isFavorite?: boolean;
}

export interface Folder {
  id: string;
  title: string;
  createdAt: any;
  parentId?: string | null;
  isFavorite?: boolean;
}

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
  const q = query(
    collection(db, "users", userId, "sheets"),
    orderBy("updatedAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Sheet));
}

export async function deleteSheet(userId: string, sheetId: string): Promise<void> {
  await deleteDoc(doc(db, "users", userId, "sheets", sheetId));
  await remove(dbRef(rtdb, `sheets/${userId}/${sheetId}`));
}

export async function renameSheet(userId: string, sheetId: string, title: string): Promise<void> {
  await updateDoc(doc(db, "users", userId, "sheets", sheetId), {
    title,
    updatedAt: serverTimestamp(),
  });
}


export async function saveCells(
  userId: string,
  sheetId: string,
  cellsByTab: any,
  rowCountByTab: any,
  tabs: any[],
  colWidthsByTab: any,
  rowHeightsByTab: any
): Promise<void> {

  const chunkedCellsByTab: any = {};
  
  for (const tab in cellsByTab) {
    const cells = cellsByTab[tab];
    const rows: any = {};
    
    for (const cellId in cells) {
      const cell = cells[cellId];
      if (!cell) continue;
      
      const hasValue = cell.value !== undefined && cell.value !== null && cell.value !== "";
      const hasFormula = cell.formula !== undefined && cell.formula !== null && cell.formula !== "";
      const hasFormat = cell.format !== undefined && cell.format !== null && Object.keys(cell.format).length > 0;

      if (hasValue || hasFormula || hasFormat) {
         const cleanCell: any = {};
         if (cell.value !== undefined) cleanCell.value = cell.value;
         if (cell.formula !== undefined) cleanCell.formula = cell.formula;
         if (cell.format !== undefined) cleanCell.format = cell.format;
         
         // Kinyerjük a sorszámot a cella nevéből (pl. A12 -> 12)
         const match = cellId.match(/^[A-Z]+(\d+)$/);
         const row = match ? match[1] : "0";
         
         // A cellákat betesszük a megfelelő sor dobozába
         if (!rows[row]) rows[row] = {};
         rows[row][cellId] = cleanCell;
      }
    }

    chunkedCellsByTab[tab] = {};
    // SORONKÉNT csomagoljuk be szöveggé. Így nincs 10MB-os túllépés, de fagyás sincs!
    for (const row in rows) {
       chunkedCellsByTab[tab][row] = JSON.stringify(rows[row]);
    }
  }

  const cleanColWidths = JSON.parse(JSON.stringify(colWidthsByTab || {}));
  const cleanRowHeights = JSON.parse(JSON.stringify(rowHeightsByTab || {}));

  const payload = {
    cellsByTab: chunkedCellsByTab, 
    rowCountByTab: rowCountByTab || { 0: 50 },
    tabs: tabs || ["Sheet1"],
    colWidthsByTab: cleanColWidths,
    rowHeightsByTab: cleanRowHeights,
    updatedAt: Date.now(),
  };

  // 1. RTDB Mentés (Villámgyors és biztonságos méretű)
  await set(dbRef(rtdb, `sheets/${userId}/${sheetId}`), payload);
  
  // 2. Előnézet generálása 4x4-es adatmagból
  let preview: string[] = [];
  try {
     const firstTabKey = Object.keys(chunkedCellsByTab)[0];
     const firstTabRows = chunkedCellsByTab[firstTabKey] || {};
     
     // Összefűzzük az első 4 sort a memóriában, hogy megcsináljuk az előnézeti képet
     const previewCells: any = {};
     for (let i = 1; i <= 4; i++) {
         if (firstTabRows[i]) {
             Object.assign(previewCells, JSON.parse(firstTabRows[i]));
         }
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
  } catch (e) { console.error(e); }

  // 3. Firestore frissítés
  const rcVals = Object.values(rowCountByTab || {});
  const maxRowC = rcVals.length > 0 ? Math.max(...(rcVals as number[])) : 50;

  await updateDoc(doc(db, "users", userId, "sheets", sheetId), {
    updatedAt: serverTimestamp(),
    rowCount: maxRowC,
    previewData: preview,
  });
}


export async function loadSheetData(userId: string, sheetId: string) {
  const snap = await get(dbRef(rtdb, `sheets/${userId}/${sheetId}`));
  if (!snap.exists()) {
    return {
      cellsByTab: { 0: {} },
      rowCountByTab: { 0: 50 },
      tabs: ["Sheet1"],
      colWidthsByTab: { 0: {} },
      rowHeightsByTab: { 0: {} },
    };
  }
  const data = snap.val();
  
  let parsedCells: any = {};
  const dataCells = data.cellsByTab || {};
  
  // UNIVERZÁLIS VISSZAFEJTŐ: Kezeli a régi formátumot, az egyben lévőt és az új sor-alapút is
  if (typeof dataCells === "string") {
    try { parsedCells = JSON.parse(dataCells); } catch(e) {}
  } else {
    for (const tab in dataCells) {
      parsedCells[tab] = {};
      const tabData = dataCells[tab];
      
      if (typeof tabData === "string") {
         try { parsedCells[tab] = JSON.parse(tabData); } catch(e) {}
      } else if (typeof tabData === "object") {
         for (const key in tabData) {
            const val = tabData[key];
            if (typeof val === "string") {
               // Új módszer: Soronkénti JSON darab visszafejtése
               try { Object.assign(parsedCells[tab], JSON.parse(val)); } catch(e) {}
            } else {
               // Legrégebbi módszer: Cellánkénti tárolás
               parsedCells[tab][key] = val;
            }
         }
      }
    }
  }

  return {
    cellsByTab: Object.keys(parsedCells).length > 0 ? parsedCells : { 0: {} },
    rowCountByTab: data.rowCountByTab ?? { 0: 50 },
    tabs: data.tabs ?? ["Sheet1"],
    colWidthsByTab: data.colWidthsByTab ?? { 0: {} },
    rowHeightsByTab: data.rowHeightsByTab ?? { 0: {} },
  };
}


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
      // Biztonságos érték kinyerés
      const finalValue = val !== undefined && val !== null ? String(val).trim() : "";
      
      if (finalValue !== "") {
        const cellRef = `${getColLetter(cIdx + 1)}${rIdx + 1}`;
        const isFormula = finalValue.startsWith("=");
        cells[cellRef] = { 
          value: finalValue, 
          formula: isFormula ? finalValue : "" 
        };
      }
    });
  });
  
  const rowCount = Math.max(50, rows.length + 10);
  const cellsByTab: Record<number, Record<string, any>> = { 0: cells };
  const rowCountByTab: Record<number, number> = { 0: rowCount };
  
  return { 
    cellsByTab, 
    rowCountByTab, 
    tabs: ["Sheet1"],
    colWidthsByTab: { 0: {} },
    rowHeightsByTab: { 0: {} }
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
       if (col && col.width) {
           const colLetter = getColLetter(i);
           colWidths[colLetter] = Math.round(col.width * 7);
       }
    }

    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber > maxRow) maxRow = rowNumber;

      if (row.height) {
         rowHeights[rowNumber.toString()] = Math.round(row.height * 1.33);
      }

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

           if (Object.keys(cleanBorders).length > 0) {
             format.border = cleanBorders;
           }
        }
        let value: any = cell.value;
        let formula = "";
        
        if (value instanceof Date) {
            value = value.toLocaleDateString("hu-HU");
        } else if (value && typeof value === 'object') {
            if ('formula' in value) {
                formula = "=" + (value.formula as string);
                let res = value.result;
                if (res instanceof Date) {
                    value = res.toLocaleDateString("hu-HU");
                } else if (res && typeof res === 'object' && 'error' in res) {
                    value = "#HIBA";
                } else {
                    value = res !== undefined ? res : "";
                }
            } else if ('richText' in value) {
                value = (value.richText as any[]).map(rt => rt.text).join("");
            }
        }

        // --- BIZTONSÁGOS EXTRÉM OPTIMALIZÁCIÓ ---
        const finalValue = value !== undefined && value !== null ? String(value) : "";
        const hasFormat = Object.keys(format).length > 0;
        
        // Csak akkor rakjuk be a memóriába, ha valóban van mit megjeleníteni
        if (finalValue !== "" || formula !== "" || hasFormat) {
          cells[cellRef] = {
            value: finalValue,
            formula: formula,
            ...(hasFormat ? { format } : {})
          };
        }
      });
    });

    cellsByTab[tabIdx] = cells;
    rowCountByTab[tabIdx] = Math.max(50, maxRow + 10);
    colWidthsByTab[tabIdx] = colWidths;
    rowHeightsByTab[tabIdx] = rowHeights;
  });

  if (tabs.length === 0) {
    tabs.push("Sheet1");
    cellsByTab[0] = {};
    rowCountByTab[0] = 50;
    colWidthsByTab[0] = {};
    rowHeightsByTab[0] = {};
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

// sheetService.ts - egy új függvény
export async function updateLastOpened(userId: string, sheetId: string) {
  await updateDoc(doc(db, "users", userId, "sheets", sheetId), {
    lastOpenedAt: serverTimestamp(),
  });
}