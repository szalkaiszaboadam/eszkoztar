// src/components/sheet/Toolbar.tsx
"use client";

import { useState } from "react";
import { useSheetStore } from "@/lib/sheetStore";
import {
  Bold, Italic, Underline,
  AlignLeft, AlignCenter, AlignRight,
  Paintbrush, Type, Plus, Save
} from "lucide-react";
import ImportButton from "./ImportButton";
import ExportButton from "./ExportButton";

const COLS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export default function Toolbar() {
  const [activeTab, setActiveTab] = useState("Kezdőlap");
  
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

  // Egérgörgő átalakítása vízszintes görgetéssé
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.deltaY !== 0) {
      e.currentTarget.scrollLeft += e.deltaY;
    }
  };

  return (
    <div className="flex flex-col bg-[#f9fafb] border-b border-gray-200 w-full overflow-hidden">
      {/* ── FÜLEK (TABS) ── */}
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

      {/* ── ESZKÖZÖK (TOOLS) ── */}
      <div 
        onWheel={handleWheel}
        className="flex items-center gap-1 px-3 py-1.5 bg-white min-h-[44px] overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']"
      >
        
        {activeTab === "Fájl" && (
          <>
            <button 
              onClick={() => window.dispatchEvent(new CustomEvent("sheet-save"))} 
              className="flex items-center gap-1.5 text-sm text-gray-700 hover:bg-gray-100 px-2.5 py-1.5 rounded-lg shrink-0 transition"
            >
              <Save className="w-4 h-4 text-blue-600" /> Mentés (Ctrl+S)
            </button>
            <div className="w-px h-5 bg-gray-300 mx-2 shrink-0" />
            <ImportButton />
            <div className="w-px h-5 bg-gray-300 mx-2 shrink-0" />
            <ExportButton />
          </>
        )}

        {activeTab === "Kezdőlap" && (
          <>
            <button className={btnClass(fmt.bold)} onClick={() => toggle("bold")} title="Félkövér"><Bold className="w-4 h-4" /></button>
            <button className={btnClass(fmt.italic)} onClick={() => toggle("italic")} title="Dőlt"><Italic className="w-4 h-4" /></button>
            <button className={btnClass(fmt.underline)} onClick={() => toggle("underline")} title="Aláhúzott"><Underline className="w-4 h-4" /></button>

            <div className="w-px h-5 bg-gray-300 mx-2 shrink-0" />

            <button className={btnClass(fmt.align === "left")} onClick={() => apply({ align: "left" })}><AlignLeft className="w-4 h-4" /></button>
            <button className={btnClass(fmt.align === "center")} onClick={() => apply({ align: "center" })}><AlignCenter className="w-4 h-4" /></button>
            <button className={btnClass(fmt.align === "right")} onClick={() => apply({ align: "right" })}><AlignRight className="w-4 h-4" /></button>

            <div className="w-px h-5 bg-gray-300 mx-2 shrink-0" />

            <label className="flex items-center gap-1.5 cursor-pointer p-1.5 rounded hover:bg-gray-200 shrink-0" title="Szöveg színe">
              <Type className="w-4 h-4 text-gray-700" />
              <input type="color" className="w-4 h-4 cursor-pointer rounded border-0" value={fmt.color ?? "#1f2937"} onChange={(e) => apply({ color: e.target.value })} />
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer p-1.5 rounded hover:bg-gray-200 shrink-0" title="Háttér színe">
              <Paintbrush className="w-4 h-4 text-gray-700" />
              <input type="color" className="w-4 h-4 cursor-pointer rounded border-0" value={fmt.bgColor ?? "#ffffff"} onChange={(e) => apply({ bgColor: e.target.value })} />
            </label>
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