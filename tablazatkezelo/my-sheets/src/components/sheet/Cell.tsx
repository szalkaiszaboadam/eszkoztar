// src/components/sheet/Cell.tsx
"use client";

import { useState, useRef, useEffect, memo } from "react";
import { useSheetStore } from "@/lib/sheetStore";
import { evaluateCell } from "@/lib/formulaEngine";

interface CellProps {
  id: string;
  isHeader?: boolean;
  label?: string;
  height?: number;
  onNavigate?: (from: string, dir: "up" | "down" | "left" | "right" | "tab") => void;
}

const Cell = memo(function Cell({ id, isHeader, label, height = 28, onNavigate }: CellProps) {
  const cellData = useSheetStore((s) => s.cells[id]);
  const formulaStr = cellData?.formula || cellData?.value || "";
  const isFormula = formulaStr.startsWith("=");

  const allCells = useSheetStore((s) => isFormula ? s.cells : null);

  const isSelected = useSheetStore((s) => s.selectedCell === id);
  const isMultiSelected = useSheetStore((s) => s.dragSelection.includes(id) && s.selectedCell !== id);
  const isInFillSelection = useSheetStore((s) => s.fillSelection.includes(id));

  const col = id.match(/[A-Z]+/)?.[0] ?? "A";
  const row = parseInt(id.match(/\d+/)?.[0] ?? "1");

  const isRowSelected = useSheetStore((s) => s.selectedRows.includes(row));
  const isColSelected = useSheetStore((s) => s.selectedCols.includes(col));

  const setCell = useSheetStore((s) => s.setCell);
  const setSelectedCell = useSheetStore((s) => s.setSelectedCell);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const divRef = useRef<HTMLDivElement>(null);

  const displayValue = isFormula ? evaluateCell(formulaStr, allCells!) : formulaStr;
  const fmt = cellData?.format ?? {};

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);
  useEffect(() => { if (isSelected && !editing) divRef.current?.focus({ preventScroll: false }); }, [isSelected, editing]);

  if (isHeader) {
    return (
      <div className="bg-gray-100 border-b border-r border-gray-300 flex items-center justify-center text-xs font-semibold text-gray-500 select-none sticky top-0 z-10">
        {label}
      </div>
    );
  }

  const handleDoubleClick = () => { setDraft(formulaStr); setEditing(true); };
  const handleClick = (e: React.MouseEvent) => {
    if (e.shiftKey || e.ctrlKey || e.metaKey) return;
    setSelectedCell(id);
  };

  const commitEdit = () => {
    const isF = draft.startsWith("=");
    setCell(id, {
      ...cellData,
      formula: isF ? draft.toUpperCase() : "",
      value: isF ? evaluateCell(draft.toUpperCase(), useSheetStore.getState().cells) : draft,
    });
    setEditing(false);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { commitEdit(); onNavigate?.(id, "down"); }
    else if (e.key === "Tab") { e.preventDefault(); commitEdit(); onNavigate?.(id, "tab"); }
    else if (e.key === "Escape") setEditing(false);
  };

  const handleCellKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (editing) return;
    if (e.key === "ArrowUp") { e.preventDefault(); onNavigate?.(id, "up"); }
    else if (e.key === "ArrowDown") { e.preventDefault(); onNavigate?.(id, "down"); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); onNavigate?.(id, "left"); }
    else if (e.key === "ArrowRight") { e.preventDefault(); onNavigate?.(id, "right"); }
    else if (e.key === "Enter" || e.key === "F2") { setDraft(formulaStr); setEditing(true); }
    else if (e.key === "Delete" || e.key === "Backspace") {
      useSheetStore.getState().clearSelectionContent();
    }
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      setDraft(e.key);
      setEditing(true);
    }
  };

  const isHighlighted = isRowSelected || isColSelected;
  const alignClass = fmt.align === "center" ? "text-center" : fmt.align === "right" ? "text-right" : "text-left";

  let overlayClass = "";
  let zClass = "";

  if (isSelected) { 
    zClass = "z-20"; 
  } else if (isInFillSelection) { 
    overlayClass = "after:absolute after:inset-0 after:bg-blue-500/20 after:pointer-events-none"; 
    zClass = "z-10 outline outline-1 outline-blue-500 outline-dashed -outline-offset-1"; 
  } else if (isMultiSelected) { 
    overlayClass = "after:absolute after:inset-0 after:bg-blue-500/20 after:pointer-events-none"; 
    zClass = ""; 
  } else if (isHighlighted) { 
    overlayClass = "after:absolute after:inset-0 after:bg-blue-500/10 after:pointer-events-none"; 
    zClass = ""; 
  }

  let boxShadows = [];
  if (fmt.border) {
    if (fmt.border.top) boxShadows.push("inset 0 1px 0 0 #000");
    if (fmt.border.right) boxShadows.push("inset -1px 0 0 0 #000");
    if (fmt.border.bottom) boxShadows.push("inset 0 -1px 0 0 #000");
    if (fmt.border.left) boxShadows.push("inset 1px 0 0 0 #000");
  }
  const borderShadow = boxShadows.length > 0 ? boxShadows.join(", ") : undefined;

  return (
    <div
      ref={divRef}
      data-cell={id}
      tabIndex={0}
      className={`border-b border-r border-gray-200 relative focus:outline-none transition-colors ${isSelected ? "ring-2 ring-blue-500 ring-inset" : ""} ${overlayClass} ${zClass}`}
      style={{
        height,
        backgroundColor: fmt.bgColor || undefined,
        boxShadow: borderShadow,
      }}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleCellKeyDown}
      onMouseDown={(e) => {
        if (e.button === 0) {
          e.preventDefault();
          useSheetStore.getState().clearHeaderSelection();
          if (e.shiftKey || e.ctrlKey || e.metaKey) {
            useSheetStore.getState().toggleMultiSelect(id);
          } else {
            useSheetStore.getState().startDrag(id);
          }
        }
      }}
      onMouseEnter={() => {
        const state = useSheetStore.getState();
        if (state.isDragging) state.updateDrag(id);
        else if (state.fillDragStart) state.updateFillDrag(id);
      }}
    >
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={handleInputKeyDown}
          className="absolute inset-0 w-full h-full px-1.5 text-sm text-gray-900 outline-none bg-white border-2 border-blue-500 z-20"
        />
      ) : (
        <span
          className={`block px-1.5 py-0.5 text-sm truncate ${alignClass}`}
          style={{
            fontWeight: fmt.bold ? "bold" : "normal",
            fontStyle: fmt.italic ? "italic" : "normal",
            textDecoration: fmt.underline ? "underline" : "none",
            color: fmt.color ?? "#1f2937",
            fontSize: fmt.fontSize ? `${fmt.fontSize}px` : undefined,
            lineHeight: `${height}px`,
          }}
        >
          {displayValue}
        </span>
      )}

      {isSelected && !editing && (
        <div
          className="absolute -bottom-[3px] -right-[3px] w-2 h-2 bg-blue-600 border border-white cursor-crosshair z-30"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            useSheetStore.getState().startFillDrag(id);
          }}
        />
      )}
    </div>
  );
});

export default Cell;