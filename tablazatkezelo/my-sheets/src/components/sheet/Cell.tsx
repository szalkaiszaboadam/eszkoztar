// src/components/sheet/Cell.tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { useSheetStore } from "@/lib/sheetStore";
import { evaluateCell } from "@/lib/formulaEngine";

interface CellProps {
  id: string;
  isHeader?: boolean;
  label?: string;
  height?: number;
  isRowSelected?: boolean;
  isColSelected?: boolean;
  isInDragSelection?: boolean;
  onNavigate?: (from: string, dir: "up" | "down" | "left" | "right" | "tab") => void;
  onDragStart?: (cellId: string) => void;
  onDragEnter?: (cellId: string) => void;
}

export default function Cell({
  id, isHeader, label, height = 28,
  onNavigate, isRowSelected, isColSelected,
  isInDragSelection, onDragStart, onDragEnter,
}: CellProps) {
  const { cells, selectedCell, setCell, setSelectedCell, isDragging } = useSheetStore();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const divRef = useRef<HTMLDivElement>(null);

  const isSelected = selectedCell === id;
  const cellData = cells[id] ?? { value: "", formula: "" };
  const displayValue = evaluateCell(cellData.formula || cellData.value, cells);
  const fmt = cellData.format ?? {};

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);
  useEffect(() => { if (isSelected && !editing) divRef.current?.focus({ preventScroll: false }); }, [isSelected, editing]);

  if (isHeader) {
    return (
      <div className="bg-gray-100 border-b border-r border-gray-300 flex items-center justify-center text-xs font-semibold text-gray-500 select-none sticky top-0 z-10">
        {label}
      </div>
    );
  }

  const handleDoubleClick = () => { setDraft(cellData.formula || cellData.value); setEditing(true); };
  const handleClick = () => setSelectedCell(id);

  const commitEdit = () => {
    const isFormula = draft.startsWith("=");
    setCell(id, {
      ...cellData,
      formula: isFormula ? draft.toUpperCase() : "",
      value: isFormula ? evaluateCell(draft.toUpperCase(), cells) : draft,
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
    else if (e.key === "Enter" || e.key === "F2") { setDraft(cellData.formula || cellData.value); setEditing(true); }
    else if (e.key === "Delete" || e.key === "Backspace") setCell(id, { ...cellData, value: "", formula: "" });
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      setDraft(e.key);
      setEditing(true);
    }
  };

  const isHighlighted = isRowSelected || isColSelected;
  const isMultiSelected = isInDragSelection && !isSelected;

  const alignClass =
    fmt.align === "center" ? "text-center" :
    fmt.align === "right" ? "text-right" : "text-left";

  let bgClass = "";
  if (isSelected) bgClass = "";
  else if (isMultiSelected) bgClass = "bg-blue-100";
  else if (isHighlighted) bgClass = "bg-blue-50";

  return (
    <div
      ref={divRef}
      data-cell={id}
      tabIndex={0}
      className={`border-b border-r border-gray-200 relative focus:outline-none transition-colors ${
        isSelected ? "ring-2 ring-blue-500 ring-inset z-10" : ""
      } ${bgClass}`}
      style={{
        height,
        backgroundColor: (!isSelected && !isMultiSelected && !isHighlighted)
          ? (fmt.bgColor ?? "transparent")
          : undefined,
      }}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleCellKeyDown}
      onMouseDown={(e) => {
        if (e.button === 0) {
          e.preventDefault();
          onDragStart?.(id);
        }
      }}
      onMouseEnter={() => {
        if (isDragging) onDragEnter?.(id);
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
            lineHeight: `${height}px`,
          }}
        >
          {displayValue}
        </span>
      )}
    </div>
  );
}