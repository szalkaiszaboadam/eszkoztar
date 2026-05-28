// src/lib/sheetStore.ts
import { create } from "zustand";
import { COLS, DEFAULT_ROW_COUNT } from "./constants";

export interface CellFormat {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  align?: "left" | "center" | "right";
  color?: string;
  bgColor?: string;
  fontSize?: number;
  // JAVÍTÁS: A border most már objektum!
  border?: {
    top?: { style: string; color: string } | boolean;
    bottom?: { style: string; color: string } | boolean;
    left?: { style: string; color: string } | boolean;
    right?: { style: string; color: string } | boolean;
  };
}

export interface CellData {
  value: string;
  formula: string;
  format?: CellFormat;
}

function parseCell(id: string): [string, number] {
  return [id.match(/[A-Z]+/)?.[0] ?? "A", parseInt(id.match(/\d+/)?.[0] ?? "1")];
}

export function getCellRange(from: string, to: string): string[] {
  const [col1, row1] = parseCell(from);
  const [col2, row2] = parseCell(to);
  const ci1 = COLS.indexOf(col1);
  const ci2 = COLS.indexOf(col2);
  const minC = Math.min(ci1, ci2), maxC = Math.max(ci1, ci2);
  const minR = Math.min(row1, row2), maxR = Math.max(row1, row2);
  const result: string[] = [];
  for (let c = minC; c <= maxC; c++)
    for (let r = minR; r <= maxR; r++)
      result.push(`${COLS[c]}${r}`);
  return result;
}

interface SheetStore {
  // Tab adatok (Minden fülhöz külön adatok)
  cellsByTab: Record<number, Record<string, CellData>>;
  rowCountByTab: Record<number, number>;
  colWidthsByTab: Record<number, Record<string, number>>;
  rowHeightsByTab: Record<number, Record<number, number>>;
  tabs: string[];
  activeTab: number;

  // Aktuális tab nézet
  cells: Record<string, CellData>;
  rowCount: number;
  colWidths: Record<string, number>;
  rowHeights: Record<number, number>;

  // Kijelölés
  selectedCell: string | null;
  selectedRows: number[];
  selectedCols: string[];
  dragSelection: string[];
  isDragging: boolean;
  dragStart: string | null;

  // Meta
  title: string;
  isDirty: boolean;

  // Alap
  setCell: (id: string, data: CellData) => void;
  setCells: (cells: Record<string, CellData>) => void;
  setAllTabData: (data: {
    cellsByTab: Record<number, Record<string, CellData>>;
    rowCountByTab: Record<number, number>;
    tabs: string[];
    colWidthsByTab: Record<number, Record<string, number>>;
    rowHeightsByTab: Record<number, Record<number, number>>;
  }) => void;
  setSelectedCell: (id: string | null) => void;
  setTitle: (title: string) => void;
  setDirty: (v: boolean) => void;
  setRowCount: (n: number) => void;
  formatCells: (ids: string[], format: Partial<CellFormat>) => void;
  clearSelectionContent: () => void;

  // Tab kezelés
  setActiveTab: (i: number) => void;
  setTabs: (tabs: string[]) => void;

  // Sor/Oszlop kijelölés
  selectRow: (row: number, shift: boolean) => void;
  selectCol: (col: string, shift: boolean) => void;
  clearHeaderSelection: () => void;
  insertRowAt: (row: number, before: boolean) => void;
  deleteSelectedRows: () => void;
  insertColAt: (col: string, before: boolean) => void;
  deleteSelectedCols: () => void;

  // Drag kijelölés
  startDrag: (cellId: string) => void;
  toggleMultiSelect: (cellId: string) => void;
  updateDrag: (cellId: string) => void;
  endDrag: () => void;

  // Kitöltés (Fill handle)
  fillDragStart: string | null;
  fillSelection: string[];
  startFillDrag: (cellId: string) => void;
  updateFillDrag: (cellId: string) => void;
  endFillDrag: () => void;

  // Méretek
  setColWidth: (col: string, width: number) => void;
  setRowHeight: (row: number, height: number) => void;

  // Sor/Oszlop kijelölés alatt:
  selectRowRange: (start: number, end: number) => void;
  selectColRange: (start: string, end: string) => void;
}

export const useSheetStore = create<SheetStore>((set, get) => ({
  cellsByTab: { 0: {} },
  rowCountByTab: { 0: DEFAULT_ROW_COUNT },
  colWidthsByTab: { 0: {} },
  rowHeightsByTab: { 0: {} },
  tabs: ["Sheet1"],
  activeTab: 0,

  cells: {},
  rowCount: DEFAULT_ROW_COUNT,
  colWidths: {},
  rowHeights: {},

  selectedCell: "A1",
  selectedRows: [],
  selectedCols: [],
  dragSelection: [],
  isDragging: false,
  dragStart: null,
  fillDragStart: null,
  fillSelection: [],
  title: "",
  isDirty: false,

setCell: (id, data) =>
    set((s) => {
      const newCells = { ...s.cells };
      
      // OPTIMALIZÁCIÓ: Ha a cellát teljesen kiürítették (nincs érték, képlet, se formázás), töröljük a memóriából!
      if ((!data.value || data.value === "") && (!data.formula || data.formula === "") && (!data.format || Object.keys(data.format).length === 0)) {
        delete newCells[id];
      } else {
        newCells[id] = data;
      }
      
      return {
        cells: newCells,
        cellsByTab: { ...s.cellsByTab, [s.activeTab]: newCells },
        isDirty: true,
      };
    }),

  setCells: (cells) =>
    set((s) => ({
      cells,
      cellsByTab: { ...s.cellsByTab, [s.activeTab]: cells },
      isDirty: true,
    })),

  setAllTabData: ({ cellsByTab, rowCountByTab, tabs, colWidthsByTab, rowHeightsByTab }) =>
    set(() => ({
      cellsByTab,
      rowCountByTab,
      tabs,
      colWidthsByTab: colWidthsByTab ?? { 0: {} },
      rowHeightsByTab: rowHeightsByTab ?? { 0: {} },
      cells: cellsByTab[0] ?? {},
      rowCount: rowCountByTab[0] ?? DEFAULT_ROW_COUNT,
      colWidths: colWidthsByTab?.[0] ?? {},
      rowHeights: rowHeightsByTab?.[0] ?? {},
      activeTab: 0,
      isDirty: false,
    })),

  setSelectedCell: (id) =>
    set({ selectedCell: id, selectedRows: [], selectedCols: [], dragSelection: [] }),

  setTitle: (title) => set({ title }),
  setDirty: (isDirty) => set({ isDirty }),

  setRowCount: (rowCount) =>
    set((s) => ({
      rowCount,
      rowCountByTab: { ...s.rowCountByTab, [s.activeTab]: rowCount },
      isDirty: true,
    })),

  formatCells: (ids, format) =>
    set((s) => {
      const updated = { ...s.cells };
      ids.forEach((id) => {
        updated[id] = {
          value: updated[id]?.value ?? "",
          formula: updated[id]?.formula ?? "",
          format: { ...updated[id]?.format, ...format },
        };
      });
      return {
        cells: updated,
        cellsByTab: { ...s.cellsByTab, [s.activeTab]: updated },
        isDirty: true,
      };
    }),

clearSelectionContent: () =>
    set((s) => {
      const ids = s.dragSelection.length > 0 ? s.dragSelection : (s.selectedCell ? [s.selectedCell] : []);
      if (ids.length === 0) return s;

      const newCells = { ...s.cells };
      ids.forEach((id) => {
        const currentFormat = newCells[id]?.format;
        // OPTIMALIZÁCIÓ: Ha van rajta formázás (pl. háttérszín), megtartjuk. Ha nincs, töröljük az egészet.
        if (currentFormat && Object.keys(currentFormat).length > 0) {
          newCells[id] = { ...newCells[id], value: "", formula: "" };
        } else {
          delete newCells[id];
        }
      });

      return {
        cells: newCells,
        cellsByTab: { ...s.cellsByTab, [s.activeTab]: newCells },
        isDirty: true,
      };
    }),

    
  // ── Tab kezelés ────────────────────────────────────────
  setActiveTab: (i) =>
    set((s) => ({
      activeTab: i,
      cells: s.cellsByTab[i] ?? {},
      rowCount: s.rowCountByTab[i] ?? DEFAULT_ROW_COUNT,
      colWidths: s.colWidthsByTab[i] ?? {},
      rowHeights: s.rowHeightsByTab[i] ?? {},
      selectedCell: null,
      selectedRows: [],
      selectedCols: [],
      dragSelection: [],
    })),

  setTabs: (tabs) =>
    set((s) => {
      const newCellsByTab: Record<number, Record<string, CellData>> = {};
      const newRowCountByTab: Record<number, number> = {};
      const newColWidthsByTab: Record<number, Record<string, number>> = {};
      const newRowHeightsByTab: Record<number, Record<number, number>> = {};

      tabs.forEach((_, i) => {
        newCellsByTab[i] = s.cellsByTab[i] ?? {};
        newRowCountByTab[i] = s.rowCountByTab[i] ?? DEFAULT_ROW_COUNT;
        newColWidthsByTab[i] = s.colWidthsByTab[i] ?? {};
        newRowHeightsByTab[i] = s.rowHeightsByTab[i] ?? {};
      });
      return {
        tabs,
        cellsByTab: newCellsByTab,
        rowCountByTab: newRowCountByTab,
        colWidthsByTab: newColWidthsByTab,
        rowHeightsByTab: newRowHeightsByTab,
        isDirty: true // Tab hozzáadása/törlése is mentést igényel!
      };
    }),

  // ── Sor/Oszlop kijelölés (Változatlanul hagyva, de az isDirty itt is benne van)
  selectRow: (row, shift) =>
    set((s) => {
      if (shift && s.selectedRows.length > 0) {
        const last = s.selectedRows[s.selectedRows.length - 1];
        const range = Array.from({ length: Math.abs(last - row) + 1 }, (_, i) => Math.min(last, row) + i);
        return { selectedRows: range, selectedCols: [], selectedCell: null, dragSelection: [] };
      }
      return { selectedRows: [row], selectedCols: [], selectedCell: null, dragSelection: [] };
    }),

  selectCol: (col, shift) =>
    set((s) => {
      if (shift && s.selectedCols.length > 0) {
        const last = s.selectedCols[s.selectedCols.length - 1];
        const i1 = COLS.indexOf(last), i2 = COLS.indexOf(col);
        const range = COLS.slice(Math.min(i1, i2), Math.max(i1, i2) + 1);
        return { selectedCols: range, selectedRows: [], selectedCell: null, dragSelection: [] };
      }
      return { selectedCols: [col], selectedRows: [], selectedCell: null, dragSelection: [] };
    }),

  selectRowRange: (start, end) =>
    set(() => {
      const range = Array.from(
        { length: Math.abs(start - end) + 1 },
        (_, i) => Math.min(start, end) + i
      );
      return { selectedRows: range, selectedCols: [], selectedCell: null, dragSelection: [] };
    }),

  selectColRange: (start, end) =>
    set(() => {
      const i1 = COLS.indexOf(start);
      const i2 = COLS.indexOf(end);
      const range = COLS.slice(Math.min(i1, i2), Math.max(i1, i2) + 1);
      return { selectedCols: range, selectedRows: [], selectedCell: null, dragSelection: [] };
    }),

  clearHeaderSelection: () => set({ selectedRows: [], selectedCols: [] }),

  insertRowAt: (row, before) =>
    set((s) => {
      const insertAfter = before ? row - 1 : row;
      const newCells: Record<string, CellData> = {};
      Object.entries(s.cells).forEach(([id, data]) => {
        const col = id.match(/[A-Z]+/)?.[0] ?? "";
        const r = parseInt(id.match(/\d+/)?.[0] ?? "0");
        newCells[r > insertAfter ? `${col}${r + 1}` : id] = data;
      });
      const newRowCount = s.rowCount + 1;
      return {
        cells: newCells,
        cellsByTab: { ...s.cellsByTab, [s.activeTab]: newCells },
        rowCount: newRowCount,
        rowCountByTab: { ...s.rowCountByTab, [s.activeTab]: newRowCount },
        isDirty: true,
      };
    }),

  deleteSelectedRows: () =>
    set((s) => {
      if (!s.selectedRows.length) return s;
      const rowSet = new Set(s.selectedRows);
      const newCells: Record<string, CellData> = {};
      Object.entries(s.cells).forEach(([id, data]) => {
        const col = id.match(/[A-Z]+/)?.[0] ?? "";
        const row = parseInt(id.match(/\d+/)?.[0] ?? "0");
        if (rowSet.has(row)) return;
        const shift = s.selectedRows.filter((r) => r < row).length;
        newCells[`${col}${row - shift}`] = data;
      });
      const newRowCount = Math.max(10, s.rowCount - s.selectedRows.length);
      return {
        cells: newCells,
        cellsByTab: { ...s.cellsByTab, [s.activeTab]: newCells },
        rowCount: newRowCount,
        rowCountByTab: { ...s.rowCountByTab, [s.activeTab]: newRowCount },
        selectedRows: [],
        isDirty: true,
      };
    }),

  insertColAt: (col, before) =>
    set((s) => {
      const colIdx = COLS.indexOf(col);
      const insertAfterIdx = before ? colIdx - 1 : colIdx;
      const newCells: Record<string, CellData> = {};
      Object.entries(s.cells).forEach(([id, data]) => {
        const c = id.match(/[A-Z]+/)?.[0] ?? "";
        const row = id.match(/\d+/)?.[0] ?? "";
        const cIdx = COLS.indexOf(c);
        if (cIdx > insertAfterIdx) {
          const newCol = COLS[cIdx + 1];
          if (newCol) newCells[`${newCol}${row}`] = data;
        } else {
          newCells[id] = data;
        }
      });
      return {
        cells: newCells,
        cellsByTab: { ...s.cellsByTab, [s.activeTab]: newCells },
        isDirty: true,
      };
    }),

  deleteSelectedCols: () =>
    set((s) => {
      if (!s.selectedCols.length) return s;
      const colSet = new Set(s.selectedCols);
      const newCells: Record<string, CellData> = {};
      Object.entries(s.cells).forEach(([id, data]) => {
        const col = id.match(/[A-Z]+/)?.[0] ?? "";
        const row = id.match(/\d+/)?.[0] ?? "";
        if (colSet.has(col)) return;
        const colIdx = COLS.indexOf(col);
        const shift = s.selectedCols.filter((c) => COLS.indexOf(c) < colIdx).length;
        const newCol = COLS[colIdx - shift];
        if (newCol) newCells[`${newCol}${row}`] = data;
      });
      return {
        cells: newCells,
        cellsByTab: { ...s.cellsByTab, [s.activeTab]: newCells },
        selectedCols: [],
        isDirty: true,
      };
    }),

  // ── Drag kijelölés ─────────────────────────────────────
  startDrag: (cellId) =>
    set({
      dragStart: cellId,
      isDragging: true,
      dragSelection: [cellId],
      selectedCell: cellId,
      selectedRows: [],
      selectedCols: [],
    }),

  toggleMultiSelect: (cellId) =>
    set((s) => {
      // Összeszedjük, mi van eddig kijelölve
      const current = s.dragSelection.length > 0 ? s.dragSelection : (s.selectedCell ? [s.selectedCell] : []);

      let newSelection;
      if (current.includes(cellId)) {
        // Ha rákattintasz egy már kijelöltre Shift-tel, akkor levesszük a kijelölést
        newSelection = current.filter((id) => id !== cellId);
      } else {
        // Különben hozzáadjuk az eddigiekhez! (CSAK ezt az egyet)
        newSelection = [...current, cellId];
      }

      return {
        dragSelection: newSelection,
        selectedCell: cellId, // Ő lesz a fókuszált cella
        selectedRows: [],
        selectedCols: [],
        isDragging: false // Ilyenkor ne induljon el a területes húzás
      };
    }),

  updateDrag: (cellId) =>
    set((s) => {
      if (!s.isDragging || !s.dragStart) return s;
      return { dragSelection: getCellRange(s.dragStart, cellId) };
    }),

  endDrag: () =>
    set((s) => ({
      isDragging: false,
      // JAVÍTÁS: Nem állítjuk null-ra, így megmarad a kijelölés kiinduló cellája (origin)
      selectedCell: s.dragStart || s.selectedCell,
    })),

  // ── Kitöltés (Fill handle) több cellás, intelligens támogatással ──
  startFillDrag: (cellId) => set((s) => {
    // A kiindulási forrás nem csak egy cella, hanem a teljes aktuális kijelölés!
    const source = s.dragSelection.length > 0 ? s.dragSelection : (s.selectedCell ? [s.selectedCell] : [cellId]);
    return { fillDragStart: cellId, fillSelection: source };
  }),

  updateFillDrag: (cellId) => set((s) => {
    if (!s.fillDragStart) return s;

    // Lekérjük a kiindulási kijelölés határait
    const originalSource = s.dragSelection.length > 0 ? s.dragSelection : (s.selectedCell ? [s.selectedCell] : [s.fillDragStart]);
    const parse = (id: string) => ({ c: id.match(/[A-Z]+/)?.[0] ?? "A", r: parseInt(id.match(/\d+/)?.[0] ?? "1") });

    const sourceParsed = originalSource.map(parse);
    const minC = Math.min(...sourceParsed.map(x => COLS.indexOf(x.c)));
    const maxC = Math.max(...sourceParsed.map(x => COLS.indexOf(x.c)));
    const minR = Math.min(...sourceParsed.map(x => x.r));
    const maxR = Math.max(...sourceParsed.map(x => x.r));

    // A cél cella
    const target = parse(cellId);
    const targetC = COLS.indexOf(target.c);
    const targetR = target.r;

    // ZSENIÁLIS TRÜKK: Csak az egyik tengelyen engedjük a kitöltést (felfelé/lefelé VAGY jobbra/balra), 
    // miközben a másik tengely vastagsága MEGEGYEZIK a forrás kijelöléssel!
    let newMinC = Math.min(minC, targetC);
    let newMaxC = Math.max(maxC, targetC);
    let newMinR = Math.min(minR, targetR);
    let newMaxR = Math.max(maxR, targetR);

    // Eldöntjük, hogy vízszintesen vagy függőlegesen húzza-e jobban az egeret
    const deltaC = Math.max(0, targetC - maxC) + Math.max(0, minC - targetC);
    const deltaR = Math.max(0, targetR - maxR) + Math.max(0, minR - targetR);

    if (deltaR >= deltaC) {
      // Függőleges húzás: az oszlopok (szélesség) marad a forrásé!
      newMinC = minC;
      newMaxC = maxC;
    } else {
      // Vízszintes húzás: a sorok (magasság) marad a forrásé!
      newMinR = minR;
      newMaxR = maxR;
    }

    const newSelection = [];
    for (let c = newMinC; c <= newMaxC; c++) {
      for (let r = newMinR; r <= newMaxR; r++) {
        newSelection.push(`${COLS[c]}${r}`);
      }
    }

    return { fillSelection: newSelection };
  }),

  endFillDrag: () => set((s) => {
    if (!s.fillDragStart || s.fillSelection.length <= 1) {
      return { fillDragStart: null, fillSelection: [] };
    }

    const originalSource = s.dragSelection.length > 0 ? s.dragSelection : (s.selectedCell ? [s.selectedCell] : [s.fillDragStart]);
    const parse = (id: string) => ({ c: id.match(/[A-Z]+/)?.[0] ?? "A", r: parseInt(id.match(/\d+/)?.[0] ?? "1") });

    const sourceParsed = originalSource.map(parse);
    const sourceMinC = Math.min(...sourceParsed.map(x => COLS.indexOf(x.c)));
    const sourceMaxC = Math.max(...sourceParsed.map(x => COLS.indexOf(x.c)));
    const sourceMinR = Math.min(...sourceParsed.map(x => x.r));
    const sourceMaxR = Math.max(...sourceParsed.map(x => x.r));

    // Kiszámoljuk az eredeti kijelölés szélességét és magasságát
    const width = sourceMaxC - sourceMinC + 1;
    const height = sourceMaxR - sourceMinR + 1;

    const newCells = { ...s.cells };

    s.fillSelection.forEach((id) => {
      // Az eredetileg is kijelölt (forrás) cellákat nem írjuk felül!
      if (originalSource.includes(id)) return;

      const target = parse(id);
      const targetC = COLS.indexOf(target.c);

      // MINTÁZAT TÖBBSZÖRÖZÉSE (Modulo operátorral):
      // Kiszámoljuk, hogy a cél cellához melyik eredeti forrás cella adatai tartoznak
      const sourceCOffset = (targetC - sourceMinC) % width;
      const normalizedCOffset = sourceCOffset >= 0 ? sourceCOffset : (sourceCOffset + width) % width;
      const mappedC = sourceMinC + normalizedCOffset;

      const sourceROffset = (target.r - sourceMinR) % height;
      const normalizedROffset = sourceROffset >= 0 ? sourceROffset : (sourceROffset + height) % height;
      const mappedR = sourceMinR + normalizedROffset;

      const sourceId = `${COLS[mappedC]}${mappedR}`;
      const sourceData = s.cells[sourceId];

      // Lemásoljuk a formázást és az értéket
      newCells[id] = sourceData ? { ...sourceData } : { value: "", formula: "" };
    });

    return {
      cells: newCells,
      cellsByTab: { ...s.cellsByTab, [s.activeTab]: newCells },
      isDirty: true,
      fillDragStart: null,

      // A kitöltés befejeztével a teljes, újonnan létrejött terület kijelölve marad
      dragSelection: s.fillSelection,
      fillSelection: [],
    };
  }),

  // ── Méretek (ISDIRTY HOZZÁADVA) ────────────────────────
  setColWidth: (col, width) =>
    set((s) => {
      const newWidths = { ...s.colWidths, [col]: Math.max(40, width) };
      return {
        colWidths: newWidths,
        colWidthsByTab: { ...s.colWidthsByTab, [s.activeTab]: newWidths },
        isDirty: true // Mentsen ha méretezzük
      };
    }),

  setRowHeight: (row, height) =>
    set((s) => {
      const newHeights = { ...s.rowHeights, [row]: Math.max(20, height) };
      return {
        rowHeights: newHeights,
        rowHeightsByTab: { ...s.rowHeightsByTab, [s.activeTab]: newHeights },
        isDirty: true // Mentsen ha méretezzük
      };
    }),
}));