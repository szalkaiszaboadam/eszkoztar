// src/components/sheet/Cell.tsx
"use client";

import { useState, useRef, useEffect, memo, useMemo } from "react";
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

// --- PROFI KIJELÖLÉS ÉS TARTOMÁNYKERET LOGIKA ---
  const dragSelection = useSheetStore((s) => s.dragSelection);
  const fillSelection = useSheetStore((s) => s.fillSelection); // ÚJ: Kitöltési (húzás) tartomány lekérése
  
  const activeSelection = dragSelection.length > 0 ? dragSelection : (isSelected ? [id] : []);
  const isInSelection = activeSelection.includes(id);
  
  let overlayClass = "";
  let zClass = "";

  const hasCustomBorder = !!(fmt.border && (fmt.border.top || fmt.border.bottom || fmt.border.left || fmt.border.right));

// JAVÍTÁS: Kiszámoljuk, hogy a meglévő kijelölés több cellás-e
  const isMultiSelectActive = activeSelection.length > 1;

if (isSelected) { 
    zClass = "z-30"; 
  } else if (isInSelection && isMultiSelectActive) { 
    // JAVÍTÁS: Az 'inset-0' helyett kinyújtjuk a kék fóliát a cella alsó és jobb keretére is (-bottom-px -right-px).
    // Így a szegély színe is tökéletesen beleolvad a színezett háttérbe!
    overlayClass = "after:absolute after:top-0 after:left-0 after:-bottom-px after:-right-px after:bg-blue-600/15 after:pointer-events-none"; 
    zClass = "z-20"; 
  } else if (isInFillSelection) { 
    overlayClass = ""; 
    zClass = "z-20"; 
  } else if (isHighlighted) { 
    // Ugyanígy kiterjesztjük a fejléc-kijelölés fóliáját is
    overlayClass = "after:absolute after:top-0 after:left-0 after:-bottom-px after:-right-px after:bg-blue-600/5 after:pointer-events-none"; 
    zClass = hasCustomBorder ? "z-10" : ""; 
  } else if (hasCustomBorder) {
    zClass = "z-10";
  }

  // DINAMIKUS TARTOMÁNY-PERIMETER (SIMA KIJELÖLÉS KÜLSŐ SZÉLE)
  const selectionEdges = useMemo(() => {
    if (!isInSelection) return null;
    
    const rows = activeSelection.map(x => parseInt(x.match(/\d+/)?.[0] ?? "1"));
    const cols = activeSelection.map(x => x.match(/[A-Z]+/)?.[0] ?? "A");
    const colIndices = cols.map(c => "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").indexOf(c));
    
    const minR = Math.min(...rows);
    const maxR = Math.max(...rows);
    const minC = Math.min(...colIndices);
    const maxC = Math.max(...colIndices);
    
    const currentColIdx = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").indexOf(col);
    
    return {
      top: row === minR,
      bottom: row === maxR,
      left: currentColIdx === minC,
      right: currentColIdx === maxC
    };
  }, [isInSelection, activeSelection, row, col]);

  // ÚJ: KITÖLTÉSI TARTOMÁNY (SZAGGATOTT VONAL) KÜLSŐ SZÉLEINEK SZÁMÍTÁSA
  const fillEdges = useMemo(() => {
    if (!isInFillSelection) return null;
    
    const rows = fillSelection.map(x => parseInt(x.match(/\d+/)?.[0] ?? "1"));
    const cols = fillSelection.map(x => x.match(/[A-Z]+/)?.[0] ?? "A");
    const colIndices = cols.map(c => "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").indexOf(c));
    
    const minR = Math.min(...rows);
    const maxR = Math.max(...rows);
    const minC = Math.min(...colIndices);
    const maxC = Math.max(...colIndices);
    
    const currentColIdx = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").indexOf(col);
    
    return {
      top: row === minR,
      bottom: row === maxR,
      left: currentColIdx === minC,
      right: currentColIdx === maxC
    };
  }, [isInFillSelection, fillSelection, row, col]);

  // Személyre szabott szegélyek (változatlan)
// src/components/sheet/Cell.tsx (részlet, keresd meg a renderBorder függvényt)

// src/components/sheet/Cell.tsx (részlet)
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
    const common: React.CSSProperties = { position: "absolute", zIndex: 11, pointerEvents: "none" };
    
    // Nincs több "calc"! Fixált túlnyúlásokkal hajszálpontosan fedik egymást, és lezárják a sarkokat.
    if (side === "top") return <div style={{ ...common, top: "-1px", left: "-1px", right: `-${w}px`, borderTop: `${w}px ${style} ${color}` }} />;
    if (side === "bottom") return <div style={{ ...common, bottom: `-${w}px`, left: "-1px", right: `-${w}px`, borderBottom: `${w}px ${style} ${color}` }} />;
    if (side === "left") return <div style={{ ...common, left: "-1px", top: "-1px", bottom: `-${w}px`, borderLeft: `${w}px ${style} ${color}` }} />;
    if (side === "right") return <div style={{ ...common, right: `-${w}px`, top: "-1px", bottom: `-${w}px`, borderRight: `${w}px ${style} ${color}` }} />;
  };

  // ÚJ ÉS JAVÍTOTT: KÜLSŐ KERET RENDERELÉSE (Sima kijelölés ÉS Szaggatott kitöltés)
  const renderOuterBorder = (edges: any, isDashed: boolean = false) => {
    if (!edges) return null;
    const zInd = isDashed ? 40 : 25; // A szaggatott vonal a sima kijelölés fölött van
    const common: React.CSSProperties = { position: "absolute", zIndex: zInd, pointerEvents: "none" };
    
    // JAVÍTÁS: A -2px eltolás teljesen kiviszi a keretet a cella dobozából (a szomszédokra), 
    // így garantáltan kívül lesz és nem nyomja össze a cellát! A szaggatottnak elég a -1px.
    const offset = isDashed ? "-1px" : "-2px"; 
    const bStyle = isDashed ? "1px dashed #2563eb" : "2px solid #2563eb"; 
    
    return (
      <>
        {edges.top && <div style={{ ...common, top: offset, left: offset, right: offset, borderTop: bStyle }} />}
        {edges.bottom && <div style={{ ...common, bottom: offset, left: offset, right: offset, borderBottom: bStyle }} />}
        {edges.left && <div style={{ ...common, left: offset, top: offset, bottom: offset, borderLeft: bStyle }} />}
        {edges.right && <div style={{ ...common, right: offset, top: offset, bottom: offset, borderRight: bStyle }} />}
      </>
    );
  };

  const isBottomRightOfSelection = isInSelection && selectionEdges?.bottom && selectionEdges?.right;
  if (isBottomRightOfSelection) {
    zClass += " z-30";
  }

  return (
    <div
      ref={divRef}
      data-cell={id}
      tabIndex={0}
      className={`border-b border-r relative focus:outline-none transition-colors ${zClass} ${overlayClass}`}
      style={{
        height,
        backgroundColor: fmt.bgColor || undefined,
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
      {/* Egyedi cellaszegélyek */}
      {fmt.border?.top && renderBorder(fmt.border.top, "top")}
      {fmt.border?.bottom && renderBorder(fmt.border.bottom, "bottom")}
      {fmt.border?.left && renderBorder(fmt.border.left, "left")}
      {fmt.border?.right && renderBorder(fmt.border.right, "right")}

      {/* JAVÍTOTT: TARTOMÁNY KÉK VÉGLEGES KERETE (Teljesen kívül fut, -2px eltolással) */}
      {selectionEdges && renderOuterBorder(selectionEdges, false)}

      {/* ÚJ: TARTOMÁNY KITÖLTÉSI (SZAGGATOTT) KERETE (Csak a peremen!) */}
      {fillEdges && renderOuterBorder(fillEdges, true)}

      {/* ... Innen lefelé az input / span és a kitöltő fogantyú kódja változatlan marad ... */}

      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={handleInputKeyDown}
          // JAVÍTÁS: Eltávolítottuk a 'border-2 border-blue-500' osztályokat, így nem lesz dupla keret!
          className="absolute inset-0 w-full h-full px-1.5 text-sm text-gray-900 outline-none bg-white z-40"
        />
      ) : (
        <span
          className={`block px-1.5 py-0.5 text-sm truncate ${alignClass} relative z-10`}
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

      {/* JAVÍTOTT: A Kitöltő Fogantyú (Kék Négyzet) most már a tartomány jobb alsó sarkán jelenik meg! */}
      {isBottomRightOfSelection && !editing && (
        <div
          className="absolute -bottom-[3px] -right-[3px] w-2 h-2 bg-blue-600 border border-white cursor-crosshair z-50"
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