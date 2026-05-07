// src/components/sheet/Grid.tsx
"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
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
  const {
    selectedCell, setSelectedCell,
    selectedRows, selectedCols,
    selectRow, selectCol, clearHeaderSelection,
    insertRowAt, deleteSelectedRows,
    insertColAt, deleteSelectedCols,
    rowCount, colWidths, rowHeights,
    setColWidth, setRowHeight,
    startDrag, updateDrag, endDrag,
    dragSelection, isDragging,
  } = useSheetStore();

  const ROWS = Array.from({ length: rowCount }, (_, i) => i + 1);
  const gridRef = useRef<HTMLDivElement>(null);
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);

  // Resize state (lokális, nem store)
  const resizingCol = useRef<{ col: string; startX: number; startW: number } | null>(null);
  const resizingRow = useRef<{ row: number; startY: number; startH: number } | null>(null);

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
    const onUp = () => { if (isDragging) endDrag(); };
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, [isDragging, endDrag]);

  // ── Ctrl+S + Delete ────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("sheet-save"));
      }
      if (e.key === "Delete" && !selectedCell) {
        if (selectedRows.length > 0) deleteSelectedRows();
        if (selectedCols.length > 0) deleteSelectedCols();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedRows, selectedCols, selectedCell, deleteSelectedRows, deleteSelectedCols]);

  // ── Navigáció ──────────────────────────────────────────
  const navigate = useCallback((from: string, dir: "up" | "down" | "left" | "right" | "tab") => {
    const [col, row] = parseCell(from);
    const colIdx = COLS.indexOf(col);
    let newCol = col, newRow = row;
    if (dir === "up") newRow = Math.max(1, row - 1);
    else if (dir === "down") newRow = Math.min(ROWS.length, row + 1);
    else if (dir === "left") newCol = COLS[Math.max(0, colIdx - 1)];
    else if (dir === "right" || dir === "tab") newCol = COLS[Math.min(COLS.length - 1, colIdx + 1)];
    const newId = `${newCol}${newRow}`;
    setSelectedCell(newId);
    setTimeout(() => {
      (gridRef.current?.querySelector(`[data-cell="${newId}"]`) as HTMLElement)?.focus();
    }, 0);
  }, [setSelectedCell, ROWS.length]);

  // ── Context menük ──────────────────────────────────────
  const onColContextMenu = (e: React.MouseEvent, col: string) => {
    e.preventDefault();
    if (!selectedCols.includes(col)) selectCol(col, false);
    setCtxMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label: "Oszlop beszúrása elé", icon: "insert-before", onClick: () => insertColAt(col, true) },
        { label: "Oszlop beszúrása mögé", icon: "insert-after", onClick: () => insertColAt(col, false) },
        {
          label: selectedCols.length > 1 ? `${selectedCols.length} oszlop törlése` : "Oszlop törlése",
          icon: "delete", danger: true,
          onClick: () => { if (!selectedCols.includes(col)) selectCol(col, false); deleteSelectedCols(); },
        },
      ],
    });
  };

  const onRowContextMenu = (e: React.MouseEvent, row: number) => {
    e.preventDefault();
    if (!selectedRows.includes(row)) selectRow(row, false);
    setCtxMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label: "Sor beszúrása fölé", icon: "insert-before", onClick: () => insertRowAt(row, true) },
        { label: "Sor beszúrása alá", icon: "insert-after", onClick: () => insertRowAt(row, false) },
        {
          label: selectedRows.length > 1 ? `${selectedRows.length} sor törlése` : "Sor törlése",
          icon: "delete", danger: true,
          onClick: () => { if (!selectedRows.includes(row)) selectRow(row, false); deleteSelectedRows(); },
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
        onClick={(e) => {
          const target = e.target as HTMLElement;
          if (!target.closest("[data-header]")) clearHeaderSelection();
        }}
      >
        <div className="grid" style={{ gridTemplateColumns, minWidth: "fit-content" }}>

          {/* Sarokblokk */}
          <div className="bg-gray-100 border-b border-r border-gray-300 sticky top-0 left-0 z-20" />

          {/* Oszlop fejlécek */}
          {COLS.map((col) => {
            const isSelected = selectedCols.includes(col);
            const width = colWidths[col] ?? DEFAULT_COL_WIDTH;
            return (
              <div
                key={col}
                data-header="col"
                className={`relative border-b border-r border-gray-300 flex items-center justify-center text-xs font-semibold select-none sticky top-0 z-10 cursor-pointer transition-colors ${
                  isSelected ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
                style={{ height: 28 }}
                onClick={(e) => selectCol(col, e.shiftKey)}
                onContextMenu={(e) => onColContextMenu(e, col)}
              >
                {col}
                {/* Oszlop resize handle */}
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

          {/* Sorok */}
          {ROWS.map((row) => {
            const isRowSelected = selectedRows.includes(row);
            const height = rowHeights[row] ?? DEFAULT_ROW_HEIGHT;
            return (
              <React.Fragment key={row}>
                {/* Sor fejléc */}
                <div
                  data-header="row"
                  className={`relative border-b border-r border-gray-300 flex items-center justify-center text-xs font-semibold select-none sticky left-0 z-10 cursor-pointer transition-colors ${
                    isRowSelected ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  }`}
                  style={{ height }}
                  onClick={(e) => selectRow(row, e.shiftKey)}
                  onContextMenu={(e) => onRowContextMenu(e, row)}
                >
                  {row}
                  {/* Sor resize handle */}
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
                    isRowSelected={isRowSelected}
                    isColSelected={selectedCols.includes(col)}
                    isInDragSelection={dragSelection.includes(`${col}${row}`)}
                    onDragStart={startDrag}
                    onDragEnter={updateDrag}
                  />
                ))}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {ctxMenu && (
        <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxMenu.items} onClose={() => setCtxMenu(null)} />
      )}
    </>
  );
}