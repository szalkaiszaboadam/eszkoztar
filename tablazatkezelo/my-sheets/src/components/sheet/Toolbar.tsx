// src/components/sheet/Toolbar.tsx
"use client";

import { useSheetStore } from "@/lib/sheetStore";
import {
  Bold, Italic, Underline,
  AlignLeft, AlignCenter, AlignRight,
  Paintbrush, Type
} from "lucide-react";

// Definiáljuk az oszlopokat, hogy a sor-kijelölésnél végig tudjunk menni rajtuk (A-Z)
const COLS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export default function Toolbar() {
  const formatCells = useSheetStore(s => s.formatCells);

  // ── 1. OKOSABB AKTÍV CELLA KERESÉS A GOMBOK ÁLLAPOTÁHOZ ──
  // Megkeressük a kijelölés "legelső" celláját, hogy a gombok tudják, be vannak-e nyomva
  const activeCellId = useSheetStore(s => {
    if (s.selectedCell) return s.selectedCell;
    if (s.dragSelection.length > 0) return s.dragSelection[0];
    if (s.selectedCols.length > 0) return `${s.selectedCols[0]}1`; // Oszlop első cellája
    if (s.selectedRows.length > 0) return `A${s.selectedRows[0]}`; // Sor első cellája
    return null;
  });

  const rawFormat = useSheetStore(s => activeCellId ? s.cells[activeCellId]?.format : undefined);
  const fmt = rawFormat ?? {};

  // ── 2. OKOSABB FORMÁZÁS ALKALMAZÁSA ──
  const apply = (format: any) => {
    const state = useSheetStore.getState();
    let ids: string[] = [];

    // A) Ha oszlop(ok) van(nak) kijelölve: Generáljuk le a cellákat A1-től A[rowCount]-ig
    if (state.selectedCols.length > 0) {
      state.selectedCols.forEach(col => {
        for (let r = 1; r <= state.rowCount; r++) {
          ids.push(`${col}${r}`);
        }
      });
    }
    // B) Ha sor(ok) van(nak) kijelölve: Generáljuk le A1-től Z1-ig
    else if (state.selectedRows.length > 0) {
      state.selectedRows.forEach(row => {
        COLS.forEach(col => {
          ids.push(`${col}${row}`);
        });
      });
    }
    // C) Ha egérrel húzott terület van kijelölve
    else if (state.dragSelection.length > 0) {
      ids = state.dragSelection;
    }
    // D) Ha egyetlen sima cella van kijelölve
    else if (state.selectedCell) {
      ids = [state.selectedCell];
    }

    // Ha véletlenül tényleg nincs semmi kijelölve, kilépünk
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
      {/* 
      <span className="text-xs text-gray-400 ml-auto">
        Dupla kattintás = szerkesztés &nbsp;|&nbsp; Enter = le &nbsp;|&nbsp; Tab = jobbra &nbsp;|&nbsp; Ctrl+S = mentés
      </span>*/}
    </div>
  );
}