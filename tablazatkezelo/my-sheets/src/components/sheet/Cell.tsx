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

  // Ellenőrizzük, hogy a cellának van-e egyedi szegélye
  const hasCustomBorder = !!(fmt.border && (fmt.border.top || fmt.border.bottom || fmt.border.left || fmt.border.right));

  if (isSelected) { 
    zClass = "z-20"; 
  } else if (isInFillSelection) { 
    overlayClass = "after:absolute after:inset-0 after:bg-blue-500/20 after:pointer-events-none"; 
    zClass = "z-10 outline outline-1 outline-blue-500 outline-dashed -outline-offset-1"; 
  } else if (isMultiSelected) { 
    overlayClass = "after:absolute after:inset-0 after:bg-blue-500/20 after:pointer-events-none"; 
    zClass = hasCustomBorder ? "z-10" : ""; 
  } else if (isHighlighted) { 
    overlayClass = "after:absolute after:inset-0 after:bg-blue-500/10 after:pointer-events-none"; 
    zClass = hasCustomBorder ? "z-10" : ""; 
  } else if (hasCustomBorder) {
    zClass = "z-10"; // A szegélyes cellák mindig feljebb kerülnek, hogy rárajzolhassanak a gridre
  }

  // --- ÚJ: A szegélyek generálása abszolút, tökéletesen átfedő rétegekként ---
  const renderBorder = (b: any, side: "top" | "bottom" | "left" | "right") => {
    if (!b) return null;
    let w = 1; let style = "solid";
    
    if (b !== true) {
      if (b.style === "thick") w = 3;
      else if (b.style === "medium") w = 2;
      if (b.style?.toLowerCase().includes("dash")) style = "dashed";
      else if (b.style?.toLowerCase().includes("dot")) style = "dotted";
    }
    const color = b.color || '#000000';
    
    // ZSENIÁLIS TRÜKK: Középre igazítjuk a vonalat a cella határvonalán, vastagságtól függően!
    const shift = Math.floor((w - 1) / 2);
    const offset = `-${1 + shift}px`;

    const common: React.CSSProperties = { position: "absolute", zIndex: 11, pointerEvents: "none" };
    
    // MINDIG borderTop-ot és borderLeft-et használunk!
    // Így az egymás melletti cellák szegélyei pixelre pontosan EGYMÁSRA kerülnek, nem pedig egymás mellé!
    if (side === "top") return <div style={{ ...common, top: offset, left: offset, right: offset, borderTop: `${w}px ${style} ${color}` }} />;
    if (side === "bottom") return <div style={{ ...common, top: `calc(100% - ${1 + shift}px)`, left: offset, right: offset, borderTop: `${w}px ${style} ${color}` }} />;
    
    if (side === "left") return <div style={{ ...common, left: offset, top: offset, bottom: offset, borderLeft: `${w}px ${style} ${color}` }} />;
    if (side === "right") return <div style={{ ...common, left: `calc(100% - ${1 + shift}px)`, top: offset, bottom: offset, borderLeft: `${w}px ${style} ${color}` }} />;
  };

  return (
    <div
      ref={divRef}
      data-cell={id}
      tabIndex={0}
      // A default tailwind border színt (border-gray-200) kivettük, dinamikussá tettük!
      className={`border-b border-r relative focus:outline-none transition-colors ${isSelected ? "ring-2 ring-blue-500 ring-inset" : ""} ${overlayClass} ${zClass}`}
      style={{
        height,
        backgroundColor: fmt.bgColor || undefined,
        // HÁTTÉRSZÍN TRÜKK: Ha van háttérszín, a gridvonal átszíneződik arra, így láthatatlanul összeolvad!
        borderColor: fmt.bgColor ? fmt.bgColor : "#e5e7eb",
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
      {/* A szegélyek kirajzolása független rétegként a cella felett */}
      {fmt.border?.top && renderBorder(fmt.border.top, "top")}
      {fmt.border?.bottom && renderBorder(fmt.border.bottom, "bottom")}
      {fmt.border?.left && renderBorder(fmt.border.left, "left")}
      {fmt.border?.right && renderBorder(fmt.border.right, "right")}

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

      {/* A Kitöltő Fogantyú (Kék Négyzet) */}
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