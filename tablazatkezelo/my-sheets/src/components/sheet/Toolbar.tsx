"use client";

import { useState, useRef, useEffect } from "react";
import { useSheetStore } from "@/lib/sheetStore";
import {
  Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight,
  PaintBucket, Type, Plus, Grid3X3, Square, X, Eraser, ChevronDown,
  Slash, Pipette,
} from "lucide-react";
import ImportButton from "./ImportButton";
import ExportButton from "./ExportButton";

// ─────────────────────────────────────────────────────────────────────────────
// Konstansok
// ─────────────────────────────────────────────────────────────────────────────
const COLS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72];

const PALETTE: string[][] = [
  ["#000000","#434343","#666666","#999999","#b7b7b7","#cccccc","#d9d9d9","#ffffff"],
  ["#ff0000","#ff4500","#ff9900","#ffff00","#00ff00","#00ffff","#4a86e8","#9900ff"],
  ["#ea9999","#f9cb9c","#ffe599","#b6d7a8","#a2c4c9","#9fc5e8","#b4a7d6","#d5a6bd"],
  ["#e06666","#f6b26b","#ffd966","#93c47d","#76a5af","#6fa8dc","#8e7cc3","#c27ba0"],
  ["#cc0000","#e69138","#f1c232","#6aa84f","#45818e","#3d85c8","#674ea7","#a64d79"],
  ["#990000","#b45309","#bf9000","#38761d","#134f5c","#1155cc","#351c75","#741b47"],
];

// ─────────────────────────────────────────────────────────────────────────────
// Segéd: panel pozíció hook (marad a viewport-on belül)
// ─────────────────────────────────────────────────────────────────────────────
function usePanelPos(anchorRef: React.RefObject<HTMLButtonElement | null>, open: boolean) {
  const [pos, setPos] = useState({ top: 0, left: 0 });
  useEffect(() => {
    if (!open || !anchorRef.current) return;
    const r = anchorRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left });
  }, [open, anchorRef]);
  return pos;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tooltip
// ─────────────────────────────────────────────────────────────────────────────
function Tip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="relative group shrink-0">
      {children}
      <div className="pointer-events-none absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2 py-0.5 rounded-md bg-gray-900 text-white text-[11px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity delay-500 z-[100] shadow-lg">
        {label}
        <div className="absolute -top-1 left-1/2 -translate-x-1/2 border-4 border-transparent border-b-gray-900" />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Elválasztó
// ─────────────────────────────────────────────────────────────────────────────
function Sep() {
  return <div className="w-px h-5 bg-gray-200 mx-1 shrink-0" />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Szín panel – szövegszín és háttérszínhez egyaránt
// ─────────────────────────────────────────────────────────────────────────────
interface ColorPanelProps {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  value: string | undefined;       // aktív cella jelenlegi színe
  isBackground: boolean;
  onSelect: (color: string | undefined) => void;
  onClose: () => void;
}

function ColorPanel({ anchorRef, value, isBackground, onSelect, onClose }: ColorPanelProps) {
  const pos = usePanelPos(anchorRef, true);
  const defaultHex = isBackground ? "#ffffff" : "#000000";
  const [hex, setHex] = useState(value ?? defaultHex);

  // Ha a szülő értéke megváltozik (más cellára kattintás), frissítsük a hex inputot
  useEffect(() => { setHex(value ?? defaultHex); }, [value, defaultHex]);

  const isValidHex = /^#[0-9a-fA-F]{6}$/.test(hex);

  const commit = (color: string | undefined) => {
    onSelect(color);
    onClose();
  };

  return (
    <>
      {/* Háttér-záró réteg */}
      <div className="fixed inset-0 z-[90]" onMouseDown={onClose} />

      <div
        className="fixed z-[91] bg-white rounded-xl shadow-2xl border border-gray-200/80 p-3 w-[220px]"
        style={{ top: pos.top, left: pos.left }}
        onMouseDown={e => e.stopPropagation()}
      >
        {/* ── Reset gomb ── */}
        <button
          onClick={() => commit(undefined)}
          className={`
            w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium
            transition-colors mb-2
            ${!value
              ? "bg-blue-50 text-blue-700 ring-1 ring-blue-200"
              : "text-gray-700 hover:bg-gray-100"}
          `}
        >
          {isBackground ? (
            <>
              {/* Sakktábla minta = átlátszó jelzés */}
              <span className="w-5 h-5 rounded border border-gray-300 shrink-0 overflow-hidden" style={{
                background: "repeating-conic-gradient(#ccc 0% 25%, white 0% 50%) 0 0 / 8px 8px",
              }} />
              Nincs kitöltés (átlátszó)
            </>
          ) : (
            <>
              <span className="w-5 h-5 rounded border border-gray-300 shrink-0 flex items-center justify-center bg-white">
                <span className="text-[10px] font-bold text-gray-800">A</span>
              </span>
              Automatikus (alap fekete)
            </>
          )}
          {!value && <span className="ml-auto text-blue-500">✓</span>}
        </button>

        <div className="h-px bg-gray-100 mb-2.5" />

        {/* ── Paletta ── */}
        <div className="flex flex-col gap-[3px] mb-2.5">
          {PALETTE.map((row, ri) => (
            <div key={ri} className="flex gap-[3px]">
              {row.map(color => {
                const isSelected = value === color;
                return (
                  <button
                    key={color}
                    title={color}
                    onClick={() => commit(color)}
                    className="relative w-6 h-6 rounded-[3px] transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1"
                    style={{
                      backgroundColor: color,
                      boxShadow: color === "#ffffff" ? "inset 0 0 0 1px #e5e7eb" : undefined,
                      outline: isSelected ? "2px solid #3b82f6" : undefined,
                      outlineOffset: isSelected ? "1px" : undefined,
                    }}
                  >
                    {isSelected && (
                      <span className="absolute inset-0 flex items-center justify-center">
                        <span className="w-[5px] h-[5px] rounded-full bg-white shadow-sm" style={{ mixBlendMode: "difference" }} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="h-px bg-gray-100 mb-2.5" />

        {/* ── Egyedi szín sor ── */}
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Egyedi szín</p>
        <div className="flex items-center gap-2">
          {/* Szín-picker (color input vizuálisan stílusozva) */}
          <div
            className="w-8 h-8 rounded-lg border-2 border-gray-200 shrink-0 overflow-hidden relative cursor-pointer hover:border-gray-300 transition-colors"
            style={{ backgroundColor: isValidHex ? hex : (value ?? defaultHex) }}
            title="Szín kiválasztása"
          >
            <input
              type="color"
              value={isValidHex ? hex : defaultHex}
              onChange={e => setHex(e.target.value)}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            />
          </div>

          {/* Hex mező */}
          <div className="relative flex-1">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-mono pointer-events-none">#</span>
            <input
              type="text"
              value={hex.replace("#", "")}
              onChange={e => {
                const v = e.target.value.replace("#", "");
                if (/^[0-9a-fA-F]{0,6}$/.test(v)) setHex(`#${v}`);
              }}
              onKeyDown={e => { if (e.key === "Enter" && isValidHex) commit(hex); }}
              maxLength={6}
              spellCheck={false}
              className="w-full pl-5 pr-2 py-1.5 text-xs font-mono border border-gray-200 rounded-md outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 text-gray-800 transition-colors"
              placeholder="000000"
            />
          </div>

          {/* OK gomb */}
          <button
            disabled={!isValidHex}
            onClick={() => isValidHex && commit(hex)}
            className="shrink-0 h-8 px-2.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            OK
          </button>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Szegély panel
// ─────────────────────────────────────────────────────────────────────────────
interface BorderPanelProps {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  borderColor: string;
  borderStyle: string;
  onBorderColorChange: (c: string) => void;
  onBorderStyleChange: (s: string) => void;
  onApply: (type: "all"|"none"|"outside"|"top"|"bottom"|"left"|"right") => void;
  onClose: () => void;
}

const BORDER_STYLES = [
  { value: "thin",   label: "Vékony",      preview: "1px solid"   },
  { value: "medium", label: "Közepes",     preview: "2px solid"   },
  { value: "thick",  label: "Vastag",      preview: "3px solid"   },
  { value: "dashed", label: "Szaggatott",  preview: "2px dashed"  },
  { value: "dotted", label: "Pontozott",   preview: "2px dotted"  },
];

function BorderPanel({ anchorRef, borderColor, borderStyle, onBorderColorChange, onBorderStyleChange, onApply, onClose }: BorderPanelProps) {
  const pos = usePanelPos(anchorRef, true);

  const btn = "flex items-center justify-center h-9 rounded-lg border border-gray-200 hover:bg-gray-50 hover:border-gray-300 transition-colors text-gray-700";

  return (
    <>
      <div className="fixed inset-0 z-[90]" onMouseDown={onClose} />
      <div
        className="fixed z-[91] bg-white rounded-xl shadow-2xl border border-gray-200/80 p-3.5 w-[200px]"
        style={{ top: pos.top, left: pos.left }}
        onMouseDown={e => e.stopPropagation()}
      >
        {/* Stílus beállítók */}
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Szegély stílusa</p>

        {/* Szín */}
        <div className="flex items-center gap-2 mb-2">
          <div
            className="w-8 h-8 rounded-lg border border-gray-200 overflow-hidden relative cursor-pointer shrink-0 hover:border-gray-300 transition-colors"
            style={{ backgroundColor: borderColor }}
          >
            <input
              type="color"
              value={borderColor}
              onChange={e => onBorderColorChange(e.target.value)}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            />
          </div>
          <span className="text-xs text-gray-600 font-mono">{borderColor}</span>
        </div>

        {/* Vonalstílus */}
        <div className="flex flex-col gap-0.5 mb-3">
          {BORDER_STYLES.map(s => (
            <button
              key={s.value}
              onClick={() => onBorderStyleChange(s.value)}
              className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                borderStyle === s.value
                  ? "bg-blue-50 text-blue-700 ring-1 ring-blue-200"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              <span className="w-10 shrink-0 flex items-center">
                <span className="w-full" style={{ borderTop: `${s.preview} ${borderColor}`, display: "block" }} />
              </span>
              {s.label}
              {borderStyle === s.value && <span className="ml-auto text-blue-500">✓</span>}
            </button>
          ))}
        </div>

        <div className="h-px bg-gray-100 mb-3" />

        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Elhelyezés</p>

        {/* Preset: Mind / Külső / Törlés */}
        <div className="grid grid-cols-3 gap-1 mb-2">
          <Tip label="Minden szegély">
            <button className={`${btn} w-full`} onClick={() => { onApply("all"); onClose(); }}>
              <Grid3X3 className="w-4 h-4" />
            </button>
          </Tip>
          <Tip label="Külső szegély">
            <button className={`${btn} w-full`} onClick={() => { onApply("outside"); onClose(); }}>
              <Square className="w-4 h-4" />
            </button>
          </Tip>
          <Tip label="Szegélyek törlése">
            <button className={`${btn} w-full text-red-500 hover:bg-red-50 hover:border-red-200`} onClick={() => { onApply("none"); onClose(); }}>
              <X className="w-4 h-4" />
            </button>
          </Tip>
        </div>

        {/* Oldalak: Felső / Alsó / Bal / Jobb */}
        <div className="grid grid-cols-4 gap-1">
          {([
            { type: "top"    as const, label: "Felső",  el: <div className="w-4 h-4 border-t-2 border-gray-700" /> },
            { type: "bottom" as const, label: "Alsó",   el: <div className="w-4 h-4 border-b-2 border-gray-700" /> },
            { type: "left"   as const, label: "Bal",    el: <div className="w-4 h-4 border-l-2 border-gray-700" /> },
            { type: "right"  as const, label: "Jobb",   el: <div className="w-4 h-4 border-r-2 border-gray-700" /> },
          ]).map(({ type, label, el }) => (
            <Tip key={type} label={label}>
              <button className={`${btn} w-full`} onClick={() => { onApply(type); onClose(); }}>
                {el}
              </button>
            </Tip>
          ))}
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Split gomb (szín-ikon + lenyíló nyíl)
// ─────────────────────────────────────────────────────────────────────────────
interface SplitColorBtnProps {
  icon: React.ReactNode;
  colorValue: string | undefined;   // az aktív cella értéke (undefined = nincs beállítva)
  isBackground: boolean;
  isOpen: boolean;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  tooltipLabel: string;
  onIconClick: () => void;
  onArrowClick: () => void;
}

function SplitColorBtn({ icon, colorValue, isBackground, isOpen, anchorRef, tooltipLabel, onIconClick, onArrowClick }: SplitColorBtnProps) {
  // Az alsó csík színe: ha van érték, azt mutatja; ha nincs (= default), semleges szín
  const stripColor  = colorValue ?? (isBackground ? "transparent" : "#1a1a1a");
  const isTransparent = isBackground && !colorValue;

  return (
    <Tip label={tooltipLabel}>
      <div className={`
        flex items-stretch h-7 rounded transition-colors
        ${isOpen ? "ring-1 ring-blue-300 bg-blue-50" : "hover:bg-gray-100"}
      `}>
        {/* Bal: ikon + csík */}
        <button
          className="relative flex items-center justify-center w-7 rounded-l"
          onClick={onIconClick}
          title={colorValue ? `${tooltipLabel}: ${colorValue}` : `${tooltipLabel}: alapértelmezett`}
        >
          {icon}
          {/* Szín csík – sakktábla minta ha átlátszó */}
          <span
            className="absolute bottom-[4px] left-[5px] right-[5px] h-[3px] rounded-full overflow-hidden"
            style={{
              background: isTransparent
                ? "repeating-conic-gradient(#bbb 0% 25%, white 0% 50%) 0 0 / 6px 6px"
                : stripColor,
              boxShadow: stripColor === "#ffffff" ? "inset 0 0 0 1px #d1d5db" : undefined,
            }}
          />
        </button>

        {/* Jobb: lenyíló nyíl */}
        <button
          ref={anchorRef}
          className="flex items-center justify-center w-[14px] rounded-r border-l border-gray-200 hover:bg-gray-200/70 transition-colors"
          onClick={onArrowClick}
          tabIndex={-1}
          aria-label="Szín panel megnyitása"
        >
          <ChevronDown className="w-2.5 h-2.5 text-gray-500" />
        </button>
      </div>
    </Tip>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TOOLBAR
// ═════════════════════════════════════════════════════════════════════════════
export default function Toolbar() {
  const [activeTab, setActiveTab] = useState("Kezdőlap");

  // Dropdown nyitott állapotok
  const [colorOpen,   setColorOpen]   = useState(false);
  const [bgOpen,      setBgOpen]      = useState(false);
  const [borderOpen,  setBorderOpen]  = useState(false);

  // Anchor ref-ek a panel pozicionáláshoz
  const colorAnchorRef  = useRef<HTMLButtonElement>(null);
  const bgAnchorRef     = useRef<HTMLButtonElement>(null);
  const borderAnchorRef = useRef<HTMLButtonElement>(null);

  // Szegély beállítás lokális állapot (a panel állapota)
  const [borderLineColor, setBorderLineColor] = useState("#000000");
  const [borderLineStyle, setBorderLineStyle] = useState("thin");

  // Store
  const formatCells = useSheetStore(s => s.formatCells);
  const insertRowAt  = useSheetStore(s => s.insertRowAt);
  const insertColAt  = useSheetStore(s => s.insertColAt);

  // ── Aktív cella ID ──────────────────────────────────────────────────────
  const activeCellId = useSheetStore(s => {
    if (s.selectedCell)         return s.selectedCell;
    if (s.dragSelection.length) return s.dragSelection[0];
    if (s.selectedCols.length)  return `${s.selectedCols[0]}1`;
    if (s.selectedRows.length)  return `A${s.selectedRows[0]}`;
    return null;
  });

  // ── Az aktív cella formázása – EGYETLEN forrás (nem pásztázza a kijelölést)
  // Selector NEM adhat vissza új objektum literált → végtelen loop!
  const rawFmt = useSheetStore(s =>
    activeCellId ? s.cells[activeCellId]?.format : undefined
  );
  const fmt = rawFmt ?? {};

  const activeRow = activeCellId ? parseInt(activeCellId.match(/\d+/)?.[0] ?? "1") : 1;
  const activeCol = activeCellId ? activeCellId.match(/[A-Z]+/)?.[0] ?? "A" : "A";

  // ── Formázás alkalmazása ──────────────────────────────────────────────────
  const apply = (format: Record<string, unknown>) => {
    const state = useSheetStore.getState();
    let ids: string[] = [];
    if (state.selectedCols.length)
      state.selectedCols.forEach(col => { for (let r = 1; r <= state.rowCount; r++) ids.push(`${col}${r}`); });
    else if (state.selectedRows.length)
      state.selectedRows.forEach(row => COLS.forEach(col => ids.push(`${col}${row}`)));
    else if (state.dragSelection.length)
      ids = state.dragSelection;
    else if (state.selectedCell)
      ids = [state.selectedCell];
    if (ids.length) formatCells(ids, format);
  };

  const toggle = (key: "bold" | "italic" | "underline") => apply({ [key]: !fmt[key] });

  const clearFormatting = () =>
    apply({ bold: false, italic: false, underline: false,
            color: undefined, bgColor: undefined, fontSize: 14,
            align: "left", border: undefined });

  // ── Szegély alkalmazás ────────────────────────────────────────────────────
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
    const cells = ids.map(parse);
    const minR  = Math.min(...cells.map(x => x.r));
    const maxR  = Math.max(...cells.map(x => x.r));
    const minC  = Math.min(...cells.map(x => COLS.indexOf(x.c)));
    const maxC  = Math.max(...cells.map(x => COLS.indexOf(x.c)));
    const bd    = { style: borderLineStyle, color: borderLineColor };
    const newCells = { ...state.cells };

    ids.forEach(id => {
      const { c, r } = parse(id);
      const cIdx    = COLS.indexOf(c);
      const existing = newCells[id] ?? { value: "", formula: "" };
      type BS = { style: string; color: string };
      let brd: Record<string, BS> = { ...((existing.format?.border ?? {}) as Record<string, BS>) };

      if      (type === "none")    { brd = {}; }
      else if (type === "all")     { brd = { top: bd, bottom: bd, left: bd, right: bd }; }
      else if (type === "outside") {
        if (r === minR)    brd.top    = bd;
        if (r === maxR)    brd.bottom = bd;
        if (cIdx === minC) brd.left   = bd;
        if (cIdx === maxC) brd.right  = bd;
      }
      else if (type === "bottom") brd.bottom = bd;
      else if (type === "top")    brd.top    = bd;
      else if (type === "left")   brd.left   = bd;
      else if (type === "right")  brd.right  = bd;

      (Object.keys(brd) as string[]).forEach(k => { if (!brd[k]) delete brd[k]; });

      newCells[id] = {
        ...existing,
        format: { ...existing.format, border: Object.keys(brd).length ? brd : undefined },
      };
    });

    state.setCells(newCells);
  };

  // ── Segédfüggvény: összes dropdown bezárása ───────────────────────────────
  const closeAll = () => { setColorOpen(false); setBgOpen(false); setBorderOpen(false); };

  // ── Megjelenítési értékek ─────────────────────────────────────────────────
  const hasBorder = !!(fmt.border && Object.keys(fmt.border as object).length > 0);

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.deltaY !== 0) e.currentTarget.scrollLeft += e.deltaY;
  };

  const btnBase   = "inline-flex items-center justify-center h-7 w-7 rounded text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors";
  const btnActive = "bg-blue-50 text-blue-700 ring-1 ring-blue-200";

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col bg-white border-b border-gray-200 w-full select-none">

      {/* ── Fül sor ── */}
      <div
        onWheel={handleWheel}
        className="flex items-end px-3 gap-0.5 border-b border-gray-100 overflow-x-auto [&::-webkit-scrollbar]:hidden"
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

      {/* ── Eszközök ── */}
      <div
        onWheel={handleWheel}
        className="flex items-center gap-0.5 px-2 py-1 min-h-[40px] overflow-x-auto [&::-webkit-scrollbar]:hidden"
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

            {/* 2 · B / I / U */}
            <div className="flex items-center gap-0.5">
              <Tip label="Félkövér (Ctrl+B)">
                <button className={`${btnBase} ${fmt.bold ? btnActive : ""}`} onClick={() => toggle("bold")}><Bold className="w-3.5 h-3.5" /></button>
              </Tip>
              <Tip label="Dőlt (Ctrl+I)">
                <button className={`${btnBase} ${fmt.italic ? btnActive : ""}`} onClick={() => toggle("italic")}><Italic className="w-3.5 h-3.5" /></button>
              </Tip>
              <Tip label="Aláhúzott (Ctrl+U)">
                <button className={`${btnBase} ${fmt.underline ? btnActive : ""}`} onClick={() => toggle("underline")}><Underline className="w-3.5 h-3.5" /></button>
              </Tip>
            </div>

            <Sep />

            {/* 3 · Szövegszín */}
            <SplitColorBtn
              icon={<Type className="w-3.5 h-3.5" />}
              colorValue={fmt.color as string | undefined}
              isBackground={false}
              isOpen={colorOpen}
              anchorRef={colorAnchorRef}
              tooltipLabel="Szöveg színe"
              onIconClick={() => {
                // Bal kattintás: ha nincs szín, a legelső palettaszínt alkalmazza;
                // ha van, az utolsó panel által kiválasztott szín újraalkalmazza (nem csinál semmit feleslegesen)
                if (!fmt.color) apply({ color: "#000000" });
              }}
              onArrowClick={() => { const next = !colorOpen; closeAll(); setColorOpen(next); }}
            />
            {colorOpen && (
              <ColorPanel
                anchorRef={colorAnchorRef}
                value={fmt.color as string | undefined}
                isBackground={false}
                onSelect={color => apply({ color })}
                onClose={() => setColorOpen(false)}
              />
            )}

            {/* 4 · Háttérszín */}
            <SplitColorBtn
              icon={<PaintBucket className="w-3.5 h-3.5" />}
              colorValue={fmt.bgColor as string | undefined}
              isBackground={true}
              isOpen={bgOpen}
              anchorRef={bgAnchorRef}
              tooltipLabel="Kitöltőszín"
              onIconClick={() => {
                if (!fmt.bgColor) apply({ bgColor: "#ffff00" }); // sárga = tipikus highlight
              }}
              onArrowClick={() => { const next = !bgOpen; closeAll(); setBgOpen(next); }}
            />
            {bgOpen && (
              <ColorPanel
                anchorRef={bgAnchorRef}
                value={fmt.bgColor as string | undefined}
                isBackground={true}
                onSelect={bgColor => apply({ bgColor })}
                onClose={() => setBgOpen(false)}
              />
            )}

            <Sep />

            {/* 5 · Szegélyek */}
            <Tip label="Szegélyek">
              <button
                ref={borderAnchorRef}
                onClick={() => { const next = !borderOpen; closeAll(); setBorderOpen(next); }}
                className={`${btnBase} gap-0.5 w-auto px-1.5 ${hasBorder || borderOpen ? btnActive : ""}`}
              >
                <Grid3X3 className="w-3.5 h-3.5" />
                <ChevronDown className="w-2.5 h-2.5 opacity-60" />
              </button>
            </Tip>
            {borderOpen && (
              <BorderPanel
                anchorRef={borderAnchorRef}
                borderColor={borderLineColor}
                borderStyle={borderLineStyle}
                onBorderColorChange={setBorderLineColor}
                onBorderStyleChange={setBorderLineStyle}
                onApply={applyBorders}
                onClose={() => setBorderOpen(false)}
              />
            )}

            <Sep />

            {/* 6 · Igazítás */}
            <div className="flex items-center bg-gray-100 rounded-md p-0.5 gap-0.5 shrink-0">
              {(["left","center","right"] as const).map((dir, i) => {
                const Icon = [AlignLeft, AlignCenter, AlignRight][i];
                const isActive = fmt.align === dir || (!fmt.align && dir === "left");
                return (
                  <Tip key={dir} label={["Balra igazítás","Középre igazítás","Jobbra igazítás"][i]}>
                    <button
                      onClick={() => apply({ align: dir })}
                      className={`inline-flex items-center justify-center h-6 w-6 rounded transition-colors ${isActive ? "bg-white shadow-sm text-blue-600" : "text-gray-500 hover:text-gray-700"}`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </button>
                  </Tip>
                );
              })}
            </div>

            <Sep />

            {/* 7 · Formázás törlése */}
            <Tip label="Minden formázás törlése">
              <button onClick={clearFormatting} className={`${btnBase} hover:text-red-600 hover:bg-red-50`}>
                <Eraser className="w-3.5 h-3.5" />
              </button>
            </Tip>
          </>
        )}

        {/* ══ BESZÚRÁS ══ */}
        {activeTab === "Beszúrás" && (
          <div className="flex items-center gap-1">
            {[
              { label: "Sor fölé",       color: "text-emerald-500", action: () => insertRowAt(activeRow, true)  },
              { label: "Sor alá",        color: "text-emerald-500", action: () => insertRowAt(activeRow, false) },
            ].map(({ label, color, action }) => (
              <button key={label} onClick={action}
                className="inline-flex items-center gap-1.5 h-7 px-2.5 text-xs font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded hover:bg-white hover:border-gray-300 transition-colors">
                <Plus className={`w-3.5 h-3.5 ${color}`} />{label}
              </button>
            ))}
            <Sep />
            {[
              { label: "Oszlop balra",  color: "text-blue-500", action: () => insertColAt(activeCol, true)  },
              { label: "Oszlop jobbra", color: "text-blue-500", action: () => insertColAt(activeCol, false) },
            ].map(({ label, color, action }) => (
              <button key={label} onClick={action}
                className="inline-flex items-center gap-1.5 h-7 px-2.5 text-xs font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded hover:bg-white hover:border-gray-300 transition-colors">
                <Plus className={`w-3.5 h-3.5 ${color}`} />{label}
              </button>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}