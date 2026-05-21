"use client";

import { useState, useRef } from "react";
import { useSheetStore } from "@/lib/sheetStore";
import {
  Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight,
  PaintBucket, Type, Plus, Grid3X3, Square, X, Eraser, ChevronDown,
  Upload, Download
} from "lucide-react";
import ImportButton from "./ImportButton";
import ExportButton from "./ExportButton";

const COLS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72];

// ─── Kis segéd: tooltip wrapper ──────────────────────────────────────────────
function Tip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="relative group shrink-0">
      {children}
      <div className="pointer-events-none absolute top-full left-1/2 -translate-x-1/2 mt-1.5 px-2 py-0.5 rounded bg-gray-800 text-white text-[11px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity delay-300 z-50 shadow-md">
        {label}
      </div>
    </div>
  );
}

// ─── Vékony elválasztó ────────────────────────────────────────────────────────
function Sep() {
  return <div className="w-px h-5 bg-gray-200 mx-0.5 shrink-0" />;
}

export default function Toolbar() {
  const [activeTab, setActiveTab] = useState("Kezdőlap");
  const [borderMenuOpen, setBorderMenuOpen] = useState(false);
  const borderBtnRef = useRef<HTMLButtonElement>(null);
  const [borderLineColor, setBorderLineColor] = useState("#000000");
  const [borderLineStyle, setBorderLineStyle] = useState("thin");

  const formatCells = useSheetStore(s => s.formatCells);
  const insertRowAt  = useSheetStore(s => s.insertRowAt);
  const insertColAt  = useSheetStore(s => s.insertColAt);

  // ─── Aktív cella ID ──────────────────────────────────────────────────────
  // SZABÁLY: a toolbar KIZÁRÓLAG az aktív cella (selectedCell, vagy a drag
  // kijelölés első eleme, stb.) formázását tükrözi – soha nem pásztázza
  // a teljes kijelölést.
  const activeCellId = useSheetStore(s => {
    if (s.selectedCell)           return s.selectedCell;
    if (s.dragSelection.length)   return s.dragSelection[0];
    if (s.selectedCols.length)    return `${s.selectedCols[0]}1`;
    if (s.selectedRows.length)    return `A${s.selectedRows[0]}`;
    return null;
  });

  // ─── Az AKTÍV CELLA formázása ─────────────────────────────────────────────
  // Ez az egyetlen forrás, amit a toolbar mutat – pont mint Excel / GSheets.
  // FONTOS: selector soha ne adjon vissza új {}-t → végtelen loop!
  // A fallback csak a selectoron kívül kerül alkalmazásra.
  const rawFmt = useSheetStore(s =>
    activeCellId ? s.cells[activeCellId]?.format : undefined
  );
  const fmt = rawFmt ?? {};

  const activeRow = activeCellId ? parseInt(activeCellId.match(/\d+/)?.[0] ?? "1") : 1;
  const activeCol = activeCellId ? activeCellId.match(/[A-Z]+/)?.[0] ?? "A" : "A";

  // ─── Formázás alkalmazása a TELJES kijelölésre ───────────────────────────
  const apply = (format: Record<string, unknown>) => {
    const state = useSheetStore.getState();
    let ids: string[] = [];
    if (state.selectedCols.length) {
      state.selectedCols.forEach(col => {
        for (let r = 1; r <= state.rowCount; r++) ids.push(`${col}${r}`);
      });
    } else if (state.selectedRows.length) {
      state.selectedRows.forEach(row => COLS.forEach(col => ids.push(`${col}${row}`)));
    } else if (state.dragSelection.length) {
      ids = state.dragSelection;
    } else if (state.selectedCell) {
      ids = [state.selectedCell];
    }
    if (ids.length) formatCells(ids, format);
  };

  const toggle = (key: "bold" | "italic" | "underline") =>
    apply({ [key]: !fmt[key] });

  const clearFormatting = () =>
    apply({ bold: false, italic: false, underline: false,
            color: undefined, bgColor: undefined, fontSize: 14,
            align: "left", border: undefined });

  // ─── Szegély alkalmazás ───────────────────────────────────────────────────
  const applyBorders = (type: "all"|"none"|"outside"|"bottom"|"top"|"left"|"right") => {
    const state = useSheetStore.getState();
    let ids = state.dragSelection.length
      ? state.dragSelection
      : state.selectedCell ? [state.selectedCell] : [];
    if (!ids.length) return;

    const parse = (id: string) => ({
      c: id.match(/[A-Z]+/)?.[0] ?? "A",
      r: parseInt(id.match(/\d+/)?.[0] ?? "1"),
    });

    const cells  = ids.map(parse);
    const minR   = Math.min(...cells.map(x => x.r));
    const maxR   = Math.max(...cells.map(x => x.r));
    const minC   = Math.min(...cells.map(x => COLS.indexOf(x.c)));
    const maxC   = Math.max(...cells.map(x => COLS.indexOf(x.c)));
    const bd     = { style: borderLineStyle, color: borderLineColor };
    const newCells = { ...state.cells };

    ids.forEach(id => {
      const { c, r } = parse(id);
      const cIdx    = COLS.indexOf(c);
      const existing = newCells[id] ?? { value: "", formula: "" };
      type BorderSide = { style: string; color: string };
      const existingBorder = (existing.format?.border ?? {}) as Record<string, BorderSide>;
      let brd: Record<string, BorderSide> = { ...existingBorder };

      if      (type === "none")    { brd = {}; }
      else if (type === "all")     { brd = { top: bd, bottom: bd, left: bd, right: bd }; }
      else if (type === "outside") {
        if (r === minR) brd.top    = bd;
        if (r === maxR) brd.bottom = bd;
        if (cIdx === minC) brd.left  = bd;
        if (cIdx === maxC) brd.right = bd;
      }
      else if (type === "bottom") brd.bottom = bd;
      else if (type === "top")    brd.top    = bd;
      else if (type === "left")   brd.left   = bd;
      else if (type === "right")  brd.right  = bd;

      // Üres kulcsok takarítása
      (Object.keys(brd) as (keyof typeof brd)[]).forEach(k => { if (!brd[k]) delete brd[k]; });

      newCells[id] = {
        ...existing,
        format: {
          ...existing.format,
          border: Object.keys(brd).length ? brd : undefined,
        },
      };
    });

    state.setCells(newCells);
  };

  // ─── Megjelenítési értékek (kizárólag az aktív cellából!) ─────────────────
  const displayColor   = fmt.color   ?? "#1a1a1a";
  const displayBgColor = fmt.bgColor ?? "#ffffff";
  const hasBorder      = !!(fmt.border && Object.keys(fmt.border).length > 0);

  // ─── Görgős toolbar ───────────────────────────────────────────────────────
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.deltaY !== 0) e.currentTarget.scrollLeft += e.deltaY;
  };

  // ─── Gomb stílusok ────────────────────────────────────────────────────────
  const btnBase   = "inline-flex items-center justify-center h-7 w-7 rounded text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors";
  const btnActive = "bg-blue-50 text-blue-700 ring-1 ring-blue-200";

  return (
    <div className="flex flex-col bg-white border-b border-gray-200 w-full select-none shadow-sm">

      {/* ── Fül sor ── */}
      <div
        onWheel={handleWheel}
        className="flex items-end px-3 gap-0.5 border-b border-gray-100 overflow-x-auto scrollbar-hide"
      >
        {(["Fájl", "Kezdőlap", "Beszúrás"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`
              px-3.5 py-1.5 text-xs font-medium tracking-wide rounded-t transition-colors shrink-0
              ${activeTab === tab
                ? "bg-white border border-b-white border-gray-200 text-gray-900 -mb-px shadow-sm"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50 border border-transparent"}
            `}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ── Eszközök sora ── */}
      <div
        onWheel={handleWheel}
        className="flex items-center gap-0.5 px-2 py-1 min-h-[40px] overflow-x-auto scrollbar-hide"
      >

        {/* ══ FÁJL ══ */}
        {activeTab === "Fájl" && (
          <div className="flex items-center gap-1">
            <ImportButton />
            <Sep />
            <ExportButton />
          </div>
        )}

        {/* ══ KEZDŐLAP ══ */}
        {activeTab === "Kezdőlap" && (
          <>
            {/* 1 · Betűméret */}
            <Tip label="Betűméret">
              <div className="flex items-center h-7 bg-gray-50 border border-gray-200 rounded hover:border-gray-300 transition-colors pl-2 pr-1 gap-0.5">
                <select
                  value={fmt.fontSize ?? 14}
                  onChange={e => apply({ fontSize: Number(e.target.value) })}
                  className="bg-transparent text-xs text-gray-700 outline-none cursor-pointer appearance-none w-7"
                >
                  {FONT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <ChevronDown className="w-3 h-3 text-gray-400 pointer-events-none shrink-0" />
              </div>
            </Tip>

            <Sep />

            {/* 2 · Félkövér / Dőlt / Aláhúzott */}
            <div className="flex items-center gap-0.5">
              <Tip label="Félkövér (Ctrl+B)">
                <button className={`${btnBase} ${fmt.bold ? btnActive : ""}`} onClick={() => toggle("bold")}>
                  <Bold className="w-3.5 h-3.5" />
                </button>
              </Tip>
              <Tip label="Dőlt (Ctrl+I)">
                <button className={`${btnBase} ${fmt.italic ? btnActive : ""}`} onClick={() => toggle("italic")}>
                  <Italic className="w-3.5 h-3.5" />
                </button>
              </Tip>
              <Tip label="Aláhúzott (Ctrl+U)">
                <button className={`${btnBase} ${fmt.underline ? btnActive : ""}`} onClick={() => toggle("underline")}>
                  <Underline className="w-3.5 h-3.5" />
                </button>
              </Tip>
            </div>

            <Sep />

            {/* 3 · Szövegszín */}
            <Tip label="Szöveg színe">
              <label className={`${btnBase} relative cursor-pointer`}>
                <Type className="w-3.5 h-3.5" />
                <span
                  className="absolute bottom-[5px] left-[5px] right-[5px] h-[3px] rounded-full"
                  style={{ backgroundColor: displayColor }}
                />
                <input
                  type="color"
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  value={displayColor}
                  onChange={e => apply({ color: e.target.value })}
                />
              </label>
            </Tip>

            {/* 4 · Háttérszín */}
            <Tip label="Kitöltőszín">
              <label className={`${btnBase} relative cursor-pointer`}>
                <PaintBucket className="w-3.5 h-3.5" />
                <span
                  className="absolute bottom-[5px] left-[5px] right-[5px] h-[3px] rounded-full border border-gray-300"
                  style={{ backgroundColor: displayBgColor }}
                />
                <input
                  type="color"
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  value={displayBgColor}
                  onChange={e => apply({ bgColor: e.target.value })}
                />
              </label>
            </Tip>

            <Sep />

            {/* 5 · Szegélyek */}
            <div className="relative shrink-0">
              <Tip label="Szegélyek">
                <button
                  ref={borderBtnRef}
                  onClick={() => setBorderMenuOpen(v => !v)}
                  className={`${btnBase} gap-0.5 w-auto px-1.5 ${hasBorder ? btnActive : ""} ${borderMenuOpen ? btnActive : ""}`}
                >
                  <Grid3X3 className="w-3.5 h-3.5" />
                  <ChevronDown className="w-2.5 h-2.5 opacity-60" />
                </button>
              </Tip>

              {borderMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setBorderMenuOpen(false)} />
                  <div
                    className="fixed z-50 mt-1 bg-white border border-gray-200 rounded-xl shadow-2xl p-3 w-44"
                    style={{
                      top:  borderBtnRef.current?.getBoundingClientRect().bottom ?? 0,
                      left: borderBtnRef.current?.getBoundingClientRect().left   ?? 0,
                    }}
                  >
                    {/* Szín + stílus */}
                    <div className="flex items-center gap-2 mb-2">
                      <input
                        type="color"
                        value={borderLineColor}
                        onChange={e => setBorderLineColor(e.target.value)}
                        className="w-6 h-6 rounded cursor-pointer border border-gray-200 shrink-0"
                        title="Szegély színe"
                      />
                      <select
                        value={borderLineStyle}
                        onChange={e => setBorderLineStyle(e.target.value)}
                        className="flex-1 text-xs border border-gray-200 rounded-md px-1.5 py-1 outline-none text-gray-700 bg-white"
                      >
                        <option value="thin">Vékony</option>
                        <option value="medium">Közepes</option>
                        <option value="thick">Vastag</option>
                        <option value="dashed">Szaggatott</option>
                        <option value="dotted">Pontozott</option>
                      </select>
                    </div>

                    <div className="h-px bg-gray-100 mb-2" />

                    {/* Gyors szegélyek */}
                    <div className="grid grid-cols-4 gap-1 mb-2">
                      {[
                        { type: "all",     icon: <Grid3X3 className="w-3.5 h-3.5" />,   title: "Minden szegély" },
                        { type: "outside", icon: <Square  className="w-3.5 h-3.5" />,   title: "Külső szegély"  },
                        { type: "none",    icon: <X       className="w-3.5 h-3.5 text-red-500" />, title: "Törlés" },
                      ].map(({ type, icon, title }) => (
                        <button
                          key={type}
                          onClick={() => { applyBorders(type as never); setBorderMenuOpen(false); }}
                          title={title}
                          className="flex items-center justify-center h-7 w-full rounded-md border border-gray-200 hover:bg-gray-50 transition-colors text-gray-700"
                        >
                          {icon}
                        </button>
                      ))}
                    </div>

                    <div className="h-px bg-gray-100 mb-2" />

                    {/* Egyedi oldalak */}
                    <div className="grid grid-cols-4 gap-1">
                      {[
                        { type: "top",    el: <div className="w-3.5 h-3.5 border-t-2 border-current" /> },
                        { type: "bottom", el: <div className="w-3.5 h-3.5 border-b-2 border-current" /> },
                        { type: "left",   el: <div className="w-3.5 h-3.5 border-l-2 border-current" /> },
                        { type: "right",  el: <div className="w-3.5 h-3.5 border-r-2 border-current" /> },
                      ].map(({ type, el }) => (
                        <button
                          key={type}
                          onClick={() => { applyBorders(type as never); setBorderMenuOpen(false); }}
                          className="flex items-center justify-center h-7 w-full rounded-md border border-gray-200 hover:bg-gray-50 transition-colors text-gray-700"
                        >
                          {el}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            <Sep />

            {/* 6 · Igazítás */}
            <div className="flex items-center bg-gray-100 rounded-md p-0.5 gap-0.5 shrink-0">
              {(["left","center","right"] as const).map((dir, i) => {
                const Icon = [AlignLeft, AlignCenter, AlignRight][i];
                const active = fmt.align === dir || (!fmt.align && dir === "left");
                return (
                  <Tip key={dir} label={["Balra", "Középre", "Jobbra"][i]}>
                    <button
                      onClick={() => apply({ align: dir })}
                      className={`inline-flex items-center justify-center h-6 w-6 rounded transition-colors ${active ? "bg-white shadow-sm text-blue-600" : "text-gray-500 hover:text-gray-700"}`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </button>
                  </Tip>
                );
              })}
            </div>

            <Sep />

            {/* 7 · Formázás törlése */}
            <Tip label="Formázás törlése">
              <button
                onClick={clearFormatting}
                className={`${btnBase} hover:text-red-600 hover:bg-red-50`}
              >
                <Eraser className="w-3.5 h-3.5" />
              </button>
            </Tip>
          </>
        )}

        {/* ══ BESZÚRÁS ══ */}
        {activeTab === "Beszúrás" && (
          <div className="flex items-center gap-1">
            {[
              { label: "Sor fölé",       icon: <Plus className="w-3.5 h-3.5 text-emerald-500" />, action: () => insertRowAt(activeRow, true)  },
              { label: "Sor alá",        icon: <Plus className="w-3.5 h-3.5 text-emerald-500" />, action: () => insertRowAt(activeRow, false) },
            ].map(({ label, icon, action }) => (
              <button
                key={label}
                onClick={action}
                className="inline-flex items-center gap-1.5 h-7 px-2.5 text-xs font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded hover:bg-white hover:border-gray-300 transition-colors"
              >
                {icon}
                {label}
              </button>
            ))}

            <Sep />

            {[
              { label: "Oszlop balra",  icon: <Plus className="w-3.5 h-3.5 text-blue-500" />, action: () => insertColAt(activeCol, true)  },
              { label: "Oszlop jobbra", icon: <Plus className="w-3.5 h-3.5 text-blue-500" />, action: () => insertColAt(activeCol, false) },
            ].map(({ label, icon, action }) => (
              <button
                key={label}
                onClick={action}
                className="inline-flex items-center gap-1.5 h-7 px-2.5 text-xs font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded hover:bg-white hover:border-gray-300 transition-colors"
              >
                {icon}
                {label}
              </button>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}