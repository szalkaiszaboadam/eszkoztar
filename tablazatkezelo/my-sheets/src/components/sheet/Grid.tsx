// src/components/sheet/Grid.tsx
"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Cell from "./Cell";
import ContextMenu, { MenuItem } from "./ContextMenu";
import { useSheetStore } from "@/lib/sheetStore";
import { COLS } from "@/lib/constants";

interface CtxMenu { x: number; y: number; items: MenuItem[] }

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
    rowCount,
  } = useSheetStore();

  const ROWS = Array.from({ length: rowCount }, (_, i) => i + 1);
  const gridRef = useRef<HTMLDivElement>(null);
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);

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

  // ── Ctrl+S ─────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("sheet-save"));
      }
      // Delete gomb – kijelölt sorok/oszlopok törlése
      if (e.key === "Delete" && !selectedCell) {
        if (selectedRows.length > 0) deleteSelectedRows();
        if (selectedCols.length > 0) deleteSelectedCols();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedRows, selectedCols, selectedCell, deleteSelectedRows, deleteSelectedCols]);

  // ── Oszlop header jobb klikk ───────────────────────────
  const onColContextMenu = (e: React.MouseEvent, col: string) => {
    e.preventDefault();
    if (!selectedCols.includes(col)) selectCol(col, false);
    setCtxMenu({
      x: e.clientX, y: e.clientY,
      items: [
        {
          label: "Oszlop beszúrása elé",
          icon: "insert-before",
          onClick: () => { selectCol(col, false); insertColAt(col, true); },
        },
        {
          label: "Oszlop beszúrása mögé",
          icon: "insert-after",
          onClick: () => { selectCol(col, false); insertColAt(col, false); },
        },
        {
          label: selectedCols.length > 1
            ? `${selectedCols.length} oszlop törlése`
            : "Oszlop törlése",
          icon: "delete",
          danger: true,
          onClick: () => {
            if (!selectedCols.includes(col)) selectCol(col, false);
            deleteSelectedCols();
          },
        },
      ],
    });
  };

  // ── Sor header jobb klikk ──────────────────────────────
  const onRowContextMenu = (e: React.MouseEvent, row: number) => {
    e.preventDefault();
    if (!selectedRows.includes(row)) selectRow(row, false);
    setCtxMenu({
      x: e.clientX, y: e.clientY,
      items: [
        {
          label: "Sor beszúrása fölé",
          icon: "insert-before",
          onClick: () => insertRowAt(row, true),
        },
        {
          label: "Sor beszúrása alá",
          icon: "insert-after",
          onClick: () => insertRowAt(row, false),
        },
        {
          label: selectedRows.length > 1
            ? `${selectedRows.length} sor törlése`
            : "Sor törlése",
          icon: "delete",
          danger: true,
          onClick: () => {
            if (!selectedRows.includes(row)) selectRow(row, false);
            deleteSelectedRows();
          },
        },
      ],
    });
  };

  return (
    <>
      <div
        ref={gridRef}
        className="overflow-auto flex-1"
        onClick={(e) => {
          // Ha nem headerre kattintottunk, töröljük a sor/oszlop kijelölést
          const target = e.target as HTMLElement;
          if (!target.closest("[data-header]")) clearHeaderSelection();
        }}
      >
        <div
          className="grid"
          style={{
            gridTemplateColumns: `48px repeat(${COLS.length}, 120px)`,
            minWidth: "fit-content",
          }}
        >
          {/* ── Sarokblokk ── */}
          <div className="bg-gray-100 border-b border-r border-gray-300 sticky top-0 left-0 z-20" />

          {/* ── Oszlop fejlécek ── */}
          {COLS.map((col) => {
            const isSelected = selectedCols.includes(col);
            return (
              <div
                key={col}
                data-header="col"
                className={`border-b border-r border-gray-300 flex items-center justify-center text-xs font-semibold select-none sticky top-0 z-10 cursor-pointer transition-colors ${
                  isSelected
                    ? "bg-blue-100 text-blue-700"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
                onClick={(e) => selectCol(col, e.shiftKey)}
                onContextMenu={(e) => onColContextMenu(e, col)}
                title="Kattints a kijelöléshez, Shift+kattintás a többes kijelöléshez, jobb klikk a műveletekhez"
              >
                {col}
              </div>
            );
          })}

          {/* ── Sorok ── */}
          {ROWS.map((row) => {
            const isRowSelected = selectedRows.includes(row);
            return (
              <React.Fragment key={row}>
                {/* Sor fejléc */}
                <div
                  data-header="row"
                  className={`border-b border-r border-gray-300 flex items-center justify-center text-xs font-semibold select-none sticky left-0 z-10 cursor-pointer transition-colors ${
                    isRowSelected
                      ? "bg-blue-100 text-blue-700"
                      : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  }`}
                  onClick={(e) => selectRow(row, e.shiftKey)}
                  onContextMenu={(e) => onRowContextMenu(e, row)}
                  title="Kattints a kijelöléshez, Shift+kattintás a többes kijelöléshez, jobb klikk a műveletekhez"
                >
                  {row}
                </div>

                {/* Cellák */}
                {COLS.map((col) => (
                  <Cell
                    key={`${col}${row}`}
                    id={`${col}${row}`}
                    onNavigate={navigate}
                    isRowSelected={isRowSelected}
                    isColSelected={selectedCols.includes(col)}
                  />
                ))}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Context menü */}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={ctxMenu.items}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </>
  );
}