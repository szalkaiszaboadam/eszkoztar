// src/components/sheet/Grid.tsx
import React, { useCallback, useEffect, useRef, useState, useMemo } from "react";
import Cell from "./Cell";
import ContextMenu, { MenuItem } from "./ContextMenu";
import { useSheetStore } from "@/lib/sheetStore";
import { COLS } from "@/lib/constants";

interface CtxMenu { x: number; y: number; items: MenuItem[] }

const DEFAULT_COL_WIDTH = 120;
const DEFAULT_ROW_HEIGHT = 28;

function parseCell(id: string): [string, number] {
  return [id.match(/[A-Z]+/)?.[0] ?? "A", parseInt(id.match(/\d+/)?.[0] ?? "1")];
}

export default function Grid() {
  const rowCount = useSheetStore(s => s.rowCount);
  const colWidths = useSheetStore(s => s.colWidths);
  const rowHeights = useSheetStore(s => s.rowHeights);
  const selectedRows = useSheetStore(s => s.selectedRows);
  const selectedCols = useSheetStore(s => s.selectedCols);
  
  const selectRow = useSheetStore(s => s.selectRow);
  const selectCol = useSheetStore(s => s.selectCol);
  const selectRowRange = useSheetStore(s => s.selectRowRange);
  const selectColRange = useSheetStore(s => s.selectColRange);
  const clearHeaderSelection = useSheetStore(s => s.clearHeaderSelection);
  const insertRowAt = useSheetStore(s => s.insertRowAt);
  const deleteSelectedRows = useSheetStore(s => s.deleteSelectedRows);
  const insertColAt = useSheetStore(s => s.insertColAt);
  const deleteSelectedCols = useSheetStore(s => s.deleteSelectedCols);
  const setColWidth = useSheetStore(s => s.setColWidth);
  const setRowHeight = useSheetStore(s => s.setRowHeight);

  // --- ÚJ: Az aktív cella lekérése a fejlécek kiemeléséhez ---
  const selectedCell = useSheetStore(s => s.selectedCell);
  const activeCol = selectedCell ? parseCell(selectedCell)[0] : null;
  const activeRow = selectedCell ? parseCell(selectedCell)[1] : null;

  const gridRef = useRef<HTMLDivElement>(null);
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);
  const resizingCol = useRef<{ col: string; startX: number; startW: number } | null>(null);
  const resizingRow = useRef<{ row: number; startY: number; startH: number } | null>(null);
  const headerDrag = useRef<{ type: 'col' | 'row' | null; start: any }>({ type: null, start: null });
  
  // ── VIRTUALIZÁCIÓS LOGIKA ──────────────────────────────
  const [scrollTop, setScrollTop] = useState(0);
  const [clientHeight, setClientHeight] = useState(800);

  useEffect(() => {
    if (gridRef.current) setClientHeight(gridRef.current.clientHeight);
    const onResize = () => { if (gridRef.current) setClientHeight(gridRef.current.clientHeight); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const { positions, totalHeight } = useMemo(() => {
    const pos = [0];
    let y = 0;
    for (let r = 1; r <= rowCount; r++) {
      y += rowHeights[r] ?? DEFAULT_ROW_HEIGHT;
      pos.push(y);
    }
    return { positions: pos, totalHeight: y };
  }, [rowCount, rowHeights]);

  const { startIndex, endIndex } = useMemo(() => {
    let start = 1;
    while (start <= rowCount && positions[start] < scrollTop - 400) start++;
    let end = start;
    while (end <= rowCount && positions[end] < scrollTop + clientHeight + 400) end++;
    return { startIndex: Math.max(1, start), endIndex: Math.min(rowCount, end) };
  }, [scrollTop, clientHeight, positions, rowCount]);

  const VISIBLE_ROWS = useMemo(() => {
    const r = [];
    for (let i = startIndex; i <= endIndex; i++) r.push(i);
    return r;
  }, [startIndex, endIndex]);

  const topSpacerHeight = positions[startIndex - 1] || 0;
  const bottomSpacerHeight = totalHeight - (positions[endIndex] || 0);
  
  // ── Resize event listenrek ─────────────────────────────
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (resizingCol.current) {
        const { col, startX, startW } = resizingCol.current;
        setColWidth(col, startW + (e.clientX - startX));
      }
      if (resizingRow.current) {
        const { row, startY, startH } = resizingRow.current;
        setRowHeight(row, startH + (e.clientY - startY));
      }
    };
    const onUp = () => {
      resizingCol.current = null;
      resizingRow.current = null;
      headerDrag.current = { type: null, start: null };
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [setColWidth, setRowHeight]);


  // ── Drag kijelölés vége ────────────────────────────────
  useEffect(() => {
    const onUp = () => { 
        const state = useSheetStore.getState();
        if (state.isDragging) state.endDrag(); 
        if (state.fillDragStart) state.endFillDrag();
        
        resizingCol.current = null;
        resizingRow.current = null;
        headerDrag.current = { type: null, start: null };
    };
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, []);

  // ── Ctrl+S + Delete ────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("sheet-save"));
      }
      if (e.key === "Delete" && !useSheetStore.getState().selectedCell) {
        if (useSheetStore.getState().selectedRows.length > 0) deleteSelectedRows();
        if (useSheetStore.getState().selectedCols.length > 0) deleteSelectedCols();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [deleteSelectedRows, deleteSelectedCols]);

  // ── Navigáció ──────────────────────────────────────────
  const navigate = useCallback((from: string, dir: "up" | "down" | "left" | "right" | "tab") => {
    const [col, row] = parseCell(from);
    const colIdx = COLS.indexOf(col);
    let newCol = col, newRow = row;
    const maxRow = useSheetStore.getState().rowCount;
    if (dir === "up") newRow = Math.max(1, row - 1);
    else if (dir === "down") newRow = Math.min(maxRow, row + 1);
    else if (dir === "left") newCol = COLS[Math.max(0, colIdx - 1)];
    else if (dir === "right" || dir === "tab") newCol = COLS[Math.min(COLS.length - 1, colIdx + 1)];
    const newId = `${newCol}${newRow}`;
    
    useSheetStore.getState().setSelectedCell(newId);
    
    setTimeout(() => {
      (gridRef.current?.querySelector(`[data-cell="${newId}"]`) as HTMLElement)?.focus();
    }, 0);
  }, []);

  // ── Context menük ──────────────────────────────────────
  const onColContextMenu = (e: React.MouseEvent, col: string) => {
    e.preventDefault();
    const state = useSheetStore.getState();
    const isSelected = state.selectedCols.includes(col);
    const label = isSelected && state.selectedCols.length > 1 ? `${state.selectedCols.length} oszlop törlése` : "Oszlop törlése";

    setCtxMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: "Oszlop beszúrása balra", icon: "insert-before", onClick: () => insertColAt(col, true) },
        { label: "Oszlop beszúrása jobbra", icon: "insert-after", onClick: () => insertColAt(col, false) },
        { 
          label, 
          icon: "delete",
          onClick: () => {
            if (!isSelected) useSheetStore.getState().selectCol(col, false);
            setTimeout(() => useSheetStore.getState().deleteSelectedCols(), 0);
          } 
        },
      ],
    });
  };

  const onRowContextMenu = (e: React.MouseEvent, row: number) => {
    e.preventDefault();
    const state = useSheetStore.getState();
    const isSelected = state.selectedRows.includes(row);
    const label = isSelected && state.selectedRows.length > 1 ? `${state.selectedRows.length} sor törlése` : "Sor törlése";

    setCtxMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: "Sor beszúrása fölé", icon: "insert-before", onClick: () => insertRowAt(row, true) },
        { label: "Sor beszúrása alá", icon: "insert-after", onClick: () => insertRowAt(row, false) },
        { 
          label, 
          icon: "delete",
          onClick: () => {
            if (!isSelected) useSheetStore.getState().selectRow(row, false);
            setTimeout(() => useSheetStore.getState().deleteSelectedRows(), 0);
          } 
        },
      ],
    });
  };

  const gridTemplateColumns = `48px ${COLS.map((c) => `${colWidths[c] ?? DEFAULT_COL_WIDTH}px`).join(" ")}`;

  return (
    <>
      <div
        ref={gridRef}
        className="overflow-auto flex-1 select-none"
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      >
        <div className="grid" style={{ gridTemplateColumns, minWidth: "fit-content" }}>

          {/* Sarokblokk */}
          <div className="bg-gray-100 border-b border-r border-gray-300 sticky top-0 left-0 z-20" />

          {/* Oszlop fejlécek */}
          {COLS.map((col) => {
            const isSelected = selectedCols.includes(col);
            const isActive = col === activeCol;
            const width = colWidths[col] ?? DEFAULT_COL_WIDTH;
            return (
              <div
                key={col}
                data-header="col"
                className={`relative border-b border-r border-gray-300 flex items-center justify-center text-xs font-semibold select-none sticky top-0 z-10 cursor-pointer transition-colors ${
                  isSelected ? "bg-blue-100 text-blue-700" : 
                  isActive ? "bg-gray-300 text-blue-800" : 
                  "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
                style={{ height: 28 }}
                onMouseDown={(e) => {
                  if (e.button !== 0) return;
                  headerDrag.current = { type: 'col', start: col };
                  selectCol(col, e.shiftKey);
                }}
                onMouseEnter={() => {
                  if (headerDrag.current.type === 'col') {
                    selectColRange(headerDrag.current.start, col);
                  }
                }}
                onContextMenu={(e) => onColContextMenu(e, col)}
              >
                {col}
                <div
                  className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-blue-400 z-20"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    resizingCol.current = { col, startX: e.clientX, startW: width };
                  }}
                />
              </div>
            );
          })}

          {/* VIRTUALIZÁCIÓ: Térkitöltő FENT */}
          {topSpacerHeight > 0 && (
            <div style={{ gridColumn: "1 / -1", height: topSpacerHeight }} />
          )}

          {/* Sorok */}
          {VISIBLE_ROWS.map((row) => {
            const isRowSelected = selectedRows.includes(row);
            const isActiveRow = row === activeRow;
            const height = rowHeights[row] ?? DEFAULT_ROW_HEIGHT;
            return (
              <React.Fragment key={row}>
                {/* Sor fejléc */}
                <div
                  data-header="row"
                  className={`relative border-b border-r border-gray-300 flex items-center justify-center text-xs font-semibold select-none sticky left-0 z-10 cursor-pointer transition-colors ${
                    isRowSelected ? "bg-blue-100 text-blue-700" : 
                    isActiveRow ? "bg-gray-300 text-blue-800" : 
                    "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  }`}
                  style={{ height }}
                  onMouseDown={(e) => {
                    if (e.button !== 0) return;
                    headerDrag.current = { type: 'row', start: row };
                    selectRow(row, e.shiftKey);
                  }}
                  onMouseEnter={() => {
                    if (headerDrag.current.type === 'row') {
                      selectRowRange(headerDrag.current.start, row);
                    }
                  }}
                  onContextMenu={(e) => onRowContextMenu(e, row)}
                >
                  {row}
                  <div
                    className="absolute bottom-0 left-0 w-full h-1.5 cursor-row-resize hover:bg-blue-400 z-20"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      resizingRow.current = { row, startY: e.clientY, startH: height };
                    }}
                  />
                </div>

                {/* Cellák */}
                {COLS.map((col) => (
                  <Cell
                    key={`${col}${row}`}
                    id={`${col}${row}`}
                    height={height}
                    onNavigate={navigate}
                  />
                ))}
              </React.Fragment>
            );
          })}

          {/* VIRTUALIZÁCIÓ: Térkitöltő LENT */}
          {bottomSpacerHeight > 0 && (
            <div style={{ gridColumn: "1 / -1", height: bottomSpacerHeight }} />
          )}

        </div>
      </div>

      {ctxMenu && (
        <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxMenu.items} onClose={() => setCtxMenu(null)} />
      )}
    </>
  );
}