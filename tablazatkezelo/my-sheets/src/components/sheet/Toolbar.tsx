// src/components/sheet/Toolbar.tsx
"use client";

import { useState, useRef } from "react";
import { useSheetStore } from "@/lib/sheetStore";
import {
  Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight,
  Paintbrush, Type, Plus, Grid3X3, Square, X
} from "lucide-react";
import ImportButton from "./ImportButton";
import ExportButton from "./ExportButton";

const COLS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 24, 36];

export default function Toolbar() {
  const [activeTab, setActiveTab] = useState("Kezdőlap");
  const [borderMenuOpen, setBorderMenuOpen] = useState(false);
  const borderBtnRef = useRef<HTMLButtonElement>(null);
  
  const formatCells = useSheetStore(s => s.formatCells);
  const insertRowAt = useSheetStore(s => s.insertRowAt);
  const insertColAt = useSheetStore(s => s.insertColAt);

  const activeCellId = useSheetStore(s => {
    if (s.selectedCell) return s.selectedCell;
    if (s.dragSelection.length > 0) return s.dragSelection[0];
    if (s.selectedCols.length > 0) return `${s.selectedCols[0]}1`;
    if (s.selectedRows.length > 0) return `A${s.selectedRows[0]}`;
    return null;
  });

  const rawFormat = useSheetStore(s => activeCellId ? s.cells[activeCellId]?.format : undefined);
  const fmt = rawFormat ?? {};

  const activeRow = activeCellId ? parseInt(activeCellId.match(/\d+/)?.[0] ?? "1") : 1;
  const activeCol = activeCellId ? activeCellId.match(/[A-Z]+/)?.[0] ?? "A" : "A";

  const apply = (format: any) => {
    const state = useSheetStore.getState();
    let ids: string[] = [];

    if (state.selectedCols.length > 0) {
      state.selectedCols.forEach(col => { for (let r = 1; r <= state.rowCount; r++) ids.push(`${col}${r}`); });
    } else if (state.selectedRows.length > 0) {
      state.selectedRows.forEach(row => { COLS.forEach(col => ids.push(`${col}${row}`)); });
    } else if (state.dragSelection.length > 0) {
      ids = state.dragSelection;
    } else if (state.selectedCell) {
      ids = [state.selectedCell];
    }
    if (ids.length === 0) return;
    formatCells(ids, format);
  };

  const toggle = (key: "bold" | "italic" | "underline") => apply({ [key]: !fmt[key] });

  const btnClass = (active?: boolean) =>
    `p-1.5 rounded hover:bg-gray-200 transition flex items-center gap-1.5 shrink-0 ${active ? "bg-blue-100 text-blue-700" : "text-gray-700"}`;

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.deltaY !== 0) e.currentTarget.scrollLeft += e.deltaY;
  };

  // --- PROFI SZEGÉLY LOGIKA ---
  const applyBorders = (type: "all" | "none" | "outside" | "bottom" | "top" | "left" | "right") => {
    const state = useSheetStore.getState();
    let ids = state.dragSelection.length > 0 ? state.dragSelection : (state.selectedCell ? [state.selectedCell] : []);
    if (ids.length === 0) return;

    const parse = (id: string) => ({ c: id.match(/[A-Z]+/)?.[0]??"A", r: parseInt(id.match(/\d+/)?.[0]??"1") });
    const cells = ids.map(parse);
    const minR = Math.min(...cells.map(x => x.r));
    const maxR = Math.max(...cells.map(x => x.r));
    const minC = Math.min(...cells.map(x => COLS.indexOf(x.c)));
    const maxC = Math.max(...cells.map(x => COLS.indexOf(x.c)));

    const newCells = { ...state.cells };
    let hasChanges = false;

    ids.forEach(id => {
      const { c, r } = parse(id);
      const cIdx = COLS.indexOf(c);
      const existing = newCells[id] || { value: "", formula: "" };
      const prevBorder = existing.format?.border || {};
      let newBorder = { ...prevBorder };

      if (type === "none") { newBorder = {}; }
      else if (type === "all") { newBorder = { top: true, bottom: true, left: true, right: true }; }
      else if (type === "outside") {
        if (r === minR) newBorder.top = true;
        if (r === maxR) newBorder.bottom = true;
        if (cIdx === minC) newBorder.left = true;
        if (cIdx === maxC) newBorder.right = true;
      }
      else if (type === "bottom") newBorder.bottom = true;
      else if (type === "top") newBorder.top = true;
      else if (type === "left") newBorder.left = true;
      else if (type === "right") newBorder.right = true;

      // Tisztítás
      Object.keys(newBorder).forEach(k => !newBorder[k as keyof typeof newBorder] && delete newBorder[k as keyof typeof newBorder]);

      newCells[id] = {
        ...existing,
        format: {
          ...existing.format,
          border: Object.keys(newBorder).length > 0 ? newBorder : undefined
        }
      };
      hasChanges = true;
    });

    if (hasChanges) {
      state.setCells(newCells);
    }
  };

  return (
    <div className="flex flex-col bg-[#f9fafb] border-b border-gray-200 w-full overflow-hidden">
      <div 
        onWheel={handleWheel}
        className="flex items-center px-2 pt-1 gap-1 border-b border-gray-200 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']"
      >
        {["Fájl", "Kezdőlap", "Beszúrás"].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 text-sm transition shrink-0 border-b-2 ${
              activeTab === tab
                ? "border-green-600 text-green-700 font-medium bg-white rounded-t-md"
                : "border-transparent text-gray-600 hover:bg-gray-200 rounded-t-md"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div 
        onWheel={handleWheel}
        className="flex items-center gap-1 px-3 py-1.5 bg-white min-h-[44px] overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']"
      >
        {activeTab === "Fájl" && (
          <>
            <ImportButton />
            <div className="w-px h-5 bg-gray-300 mx-2 shrink-0" />
            <ExportButton />
          </>
        )}

        {activeTab === "Kezdőlap" && (
          <>
            <div className="flex items-center gap-1 border border-gray-300 rounded bg-white px-1 hover:bg-gray-50 transition shrink-0">
              <select
                value={fmt.fontSize || 14}
                onChange={(e) => apply({ fontSize: Number(e.target.value) })}
                className="bg-transparent text-sm text-gray-700 outline-none cursor-pointer py-1"
                title="Betűméret"
              >
                {FONT_SIZES.map(size => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
            </div>

            <div className="w-px h-5 bg-gray-300 mx-1 shrink-0" />

            <button className={btnClass(fmt.bold)} onClick={() => toggle("bold")} title="Félkövér"><Bold className="w-4 h-4" /></button>
            <button className={btnClass(fmt.italic)} onClick={() => toggle("italic")} title="Dőlt"><Italic className="w-4 h-4" /></button>
            <button className={btnClass(fmt.underline)} onClick={() => toggle("underline")} title="Aláhúzott"><Underline className="w-4 h-4" /></button>

            <div className="w-px h-5 bg-gray-300 mx-1 shrink-0" />

            <button className={btnClass(fmt.align === "left")} onClick={() => apply({ align: "left" })}><AlignLeft className="w-4 h-4" /></button>
            <button className={btnClass(fmt.align === "center")} onClick={() => apply({ align: "center" })}><AlignCenter className="w-4 h-4" /></button>
            <button className={btnClass(fmt.align === "right")} onClick={() => apply({ align: "right" })}><AlignRight className="w-4 h-4" /></button>

            <div className="w-px h-5 bg-gray-300 mx-1 shrink-0" />

            <label className="flex items-center gap-1.5 cursor-pointer p-1.5 rounded hover:bg-gray-200 shrink-0" title="Szöveg színe">
              <Type className="w-4 h-4 text-gray-700" />
              <input type="color" className="w-4 h-4 cursor-pointer rounded border-0" value={fmt.color ?? "#1f2937"} onChange={(e) => apply({ color: e.target.value })} />
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer p-1.5 rounded hover:bg-gray-200 shrink-0" title="Háttér színe">
              <Paintbrush className="w-4 h-4 text-gray-700" />
              <input type="color" className="w-4 h-4 cursor-pointer rounded border-0" value={fmt.bgColor ?? "#ffffff"} onChange={(e) => apply({ bgColor: e.target.value })} />
            </label>

            <div className="w-px h-5 bg-gray-300 mx-1 shrink-0" />

            {/* PROFI SZEGÉLY MENÜ */}
            <div className="relative">
              <button
                ref={borderBtnRef}
                onClick={() => setBorderMenuOpen(!borderMenuOpen)}
                className={btnClass(false)}
                title="Szegélyek"
              >
                <Grid3X3 className="w-4 h-4" />
              </button>

              {borderMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setBorderMenuOpen(false)} />
                  <div
                    className="fixed mt-1 bg-white border border-gray-200 rounded-lg shadow-xl p-2 z-50 grid grid-cols-4 gap-1 w-36"
                    style={{
                      top: borderBtnRef.current ? borderBtnRef.current.getBoundingClientRect().bottom : 0,
                      left: borderBtnRef.current ? borderBtnRef.current.getBoundingClientRect().left : 0,
                    }}
                  >
                    <button onClick={() => { applyBorders("all"); setBorderMenuOpen(false); }} title="Minden szegély" className="p-1.5 flex justify-center hover:bg-gray-100 rounded border border-gray-200">
                      <Grid3X3 className="w-4 h-4 text-gray-700" />
                    </button>
                    <button onClick={() => { applyBorders("outside"); setBorderMenuOpen(false); }} title="Külső szegély" className="p-1.5 flex justify-center hover:bg-gray-100 rounded border border-gray-200">
                      <Square className="w-4 h-4 text-gray-700" />
                    </button>
                    <button onClick={() => { applyBorders("none"); setBorderMenuOpen(false); }} title="Nincs szegély" className="p-1.5 flex justify-center hover:bg-gray-100 rounded border border-gray-200 text-red-500">
                      <X className="w-4 h-4" />
                    </button>
                    <div className="col-span-4 h-px bg-gray-200 my-1" />
                    <button onClick={() => { applyBorders("top"); setBorderMenuOpen(false); }} title="Felső szegély" className="p-1.5 flex justify-center hover:bg-gray-100 rounded border border-gray-200">
                      <div className="w-4 h-4 border-t-2 border-black" />
                    </button>
                    <button onClick={() => { applyBorders("bottom"); setBorderMenuOpen(false); }} title="Alsó szegély" className="p-1.5 flex justify-center hover:bg-gray-100 rounded border border-gray-200">
                      <div className="w-4 h-4 border-b-2 border-black" />
                    </button>
                    <button onClick={() => { applyBorders("left"); setBorderMenuOpen(false); }} title="Bal szegély" className="p-1.5 flex justify-center hover:bg-gray-100 rounded border border-gray-200">
                      <div className="w-4 h-4 border-l-2 border-black" />
                    </button>
                    <button onClick={() => { applyBorders("right"); setBorderMenuOpen(false); }} title="Jobb szegély" className="p-1.5 flex justify-center hover:bg-gray-100 rounded border border-gray-200">
                      <div className="w-4 h-4 border-r-2 border-black" />
                    </button>
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {activeTab === "Beszúrás" && (
          <>
            <button onClick={() => insertRowAt(activeRow, true)} className="flex items-center gap-1.5 text-sm text-gray-700 hover:bg-gray-100 px-2 py-1.5 rounded shrink-0 transition">
              <Plus className="w-4 h-4 text-green-600" /> Sor fölé
            </button>
            <button onClick={() => insertRowAt(activeRow, false)} className="flex items-center gap-1.5 text-sm text-gray-700 hover:bg-gray-100 px-2 py-1.5 rounded shrink-0 transition">
              <Plus className="w-4 h-4 text-green-600" /> Sor alá
            </button>
            <div className="w-px h-5 bg-gray-300 mx-2 shrink-0" />
            <button onClick={() => insertColAt(activeCol, true)} className="flex items-center gap-1.5 text-sm text-gray-700 hover:bg-gray-100 px-2 py-1.5 rounded shrink-0 transition">
              <Plus className="w-4 h-4 text-blue-600" /> Oszlop balra
            </button>
            <button onClick={() => insertColAt(activeCol, false)} className="flex items-center gap-1.5 text-sm text-gray-700 hover:bg-gray-100 px-2 py-1.5 rounded shrink-0 transition">
              <Plus className="w-4 h-4 text-blue-600" /> Oszlop jobbra
            </button>
          </>
        )}
      </div>
    </div>
  );
}