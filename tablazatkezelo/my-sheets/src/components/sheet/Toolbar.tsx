// src/components/sheet/Toolbar.tsx
"use client";

import { useSheetStore } from "@/lib/sheetStore";
import {
  Bold, Italic, Underline,
  AlignLeft, AlignCenter, AlignRight,
  Paintbrush, Type
} from "lucide-react";

export default function Toolbar() {
  const selectedCell = useSheetStore(s => s.selectedCell);
  const formatCells = useSheetStore(s => s.formatCells);
  
  // A Zustand csak magát a format objektumot (vagy undefined-ot) adja vissza (stabil referencia)
  const rawFormat = useSheetStore(s => selectedCell ? s.cells[selectedCell]?.format : undefined);
  
  // A fallback üres objektumot már a hook-on kívül adjuk hozzá
  const fmt = rawFormat ?? {};

const apply = (format: any) => { // Ha TypeScript hibát dob, használd a (format: Partial<CellFormat>) típust
    const state = useSheetStore.getState();
    
    // Összegyűjtjük a kijelölt cellákat: ha van húzással kijelölt terület, azt vesszük,
    // különben csak a szimpla aktív cellát.
    const ids = state.dragSelection.length > 0 
      ? state.dragSelection 
      : (state.selectedCell ? [state.selectedCell] : []);

    if (ids.length === 0) return;
    
    // Az összes összegyűjtött ID-t átadjuk a store formázó függvényének
    formatCells(ids, format);
  };

  const toggle = (key: "bold" | "italic" | "underline") => {
    apply({ [key]: !fmt[key] });
  };

  const btnClass = (active?: boolean) =>
    `p-1.5 rounded hover:bg-gray-100 transition ${active ? "bg-gray-200 text-blue-600" : "text-gray-600"}`;

  return (
    <div className="flex items-center gap-1 px-3 py-1.5 border-b border-gray-200 bg-white flex-wrap">
      {/* Szövegformázás */}
      <button className={btnClass(fmt.bold)} onClick={() => toggle("bold")} title="Félkövér (Ctrl+B)">
        <Bold className="w-4 h-4" />
      </button>
      <button className={btnClass(fmt.italic)} onClick={() => toggle("italic")} title="Dőlt (Ctrl+I)">
        <Italic className="w-4 h-4" />
      </button>
      <button className={btnClass(fmt.underline)} onClick={() => toggle("underline")} title="Aláhúzott">
        <Underline className="w-4 h-4" />
      </button>

      <div className="w-px h-5 bg-gray-200 mx-1" />

      {/* Igazítás */}
      <button className={btnClass(fmt.align === "left")} onClick={() => apply({ align: "left" })} title="Balra">
        <AlignLeft className="w-4 h-4" />
      </button>
      <button className={btnClass(fmt.align === "center")} onClick={() => apply({ align: "center" })} title="Középre">
        <AlignCenter className="w-4 h-4" />
      </button>
      <button className={btnClass(fmt.align === "right")} onClick={() => apply({ align: "right" })} title="Jobbra">
        <AlignRight className="w-4 h-4" />
      </button>

      <div className="w-px h-5 bg-gray-200 mx-1" />

      {/* Szín */}
      <label className="flex items-center gap-1 cursor-pointer p-1.5 rounded hover:bg-gray-100" title="Szöveg színe">
        <Type className="w-4 h-4 text-gray-600" />
        <input
          type="color"
          className="w-4 h-4 cursor-pointer rounded border-0"
          value={fmt.color ?? "#1f2937"}
          onChange={(e) => apply({ color: e.target.value })}
        />
      </label>

      <label className="flex items-center gap-1 cursor-pointer p-1.5 rounded hover:bg-gray-100" title="Háttér színe">
        <Paintbrush className="w-4 h-4 text-gray-600" />
        <input
          type="color"
          className="w-4 h-4 cursor-pointer rounded border-0"
          value={fmt.bgColor ?? "#ffffff"}
          onChange={(e) => apply({ bgColor: e.target.value })}
        />
      </label>

      <div className="w-px h-5 bg-gray-200 mx-1" />

      {/* Gyors info */}
      <span className="text-xs text-gray-400 ml-auto">
        Dupla kattintás = szerkesztés &nbsp;|&nbsp; Enter = le &nbsp;|&nbsp; Tab = jobbra &nbsp;|&nbsp; Ctrl+S = mentés
      </span>
    </div>
  );
}