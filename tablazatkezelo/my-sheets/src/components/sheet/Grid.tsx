// src/components/sheet/Grid.tsx
"use client";

import React, { useCallback, useEffect, useRef } from "react";
import Cell from "./Cell";
import { useSheetStore } from "@/lib/sheetStore";

const COLS = ["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T"];
const ROWS = Array.from({ length: 50 }, (_, i) => i + 1);

function parseCell(id: string): [string, number] {
  const col = id.match(/[A-Z]+/)?.[0] ?? "A";
  const row = parseInt(id.match(/\d+/)?.[0] ?? "1");
  return [col, row];
}

function buildCellId(col: string, row: number): string {
  return `${col}${row}`;
}

export default function Grid() {
  const { selectedCell, setSelectedCell } = useSheetStore();
  const gridRef = useRef<HTMLDivElement>(null);

  const navigate = useCallback((from: string, direction: "up" | "down" | "left" | "right" | "tab") => {
    const [col, row] = parseCell(from);
    const colIdx = COLS.indexOf(col);

    let newCol = col;
    let newRow = row;

    if (direction === "up") newRow = Math.max(1, row - 1);
    else if (direction === "down") newRow = Math.min(ROWS.length, row + 1);
    else if (direction === "left") newCol = COLS[Math.max(0, colIdx - 1)];
    else if (direction === "right" || direction === "tab") newCol = COLS[Math.min(COLS.length - 1, colIdx + 1)];

    const newId = buildCellId(newCol, newRow);
    setSelectedCell(newId);

    // Fókusz az új cellára
    setTimeout(() => {
      const el = gridRef.current?.querySelector(`[data-cell="${newId}"]`) as HTMLElement;
      el?.focus();
    }, 0);
  }, [setSelectedCell]);

  // Ctrl+Z / Ctrl+S kezelés (grid szintű)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        // Mentés esemény kiváltása
        window.dispatchEvent(new CustomEvent("sheet-save"));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div ref={gridRef} className="overflow-auto flex-1">
      <div
        className="grid"
        style={{
          gridTemplateColumns: `48px repeat(${COLS.length}, 120px)`,
          minWidth: "fit-content",
        }}
      >
        {/* Fejléc sor */}
        <div className="bg-gray-100 border-b border-r border-gray-300 sticky top-0 left-0 z-20" />
        {COLS.map((col) => (
          <Cell key={col} id={col} isHeader label={col} />
        ))}

        {/* Adatsorok */}
        {ROWS.map((row) => (
          <React.Fragment key={row}>
            <div className="bg-gray-100 border-b border-r border-gray-300 flex items-center justify-center text-xs font-semibold text-gray-500 select-none sticky left-0 z-10">
              {row}
            </div>
            {COLS.map((col) => (
              <Cell
                key={`${col}${row}`}
                id={`${col}${row}`}
                onNavigate={navigate}
              />
            ))}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}