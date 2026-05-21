"use client";

import { useState, useRef } from "react";
import { useSheetStore } from "@/lib/sheetStore";
import {
  Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight,
  PaintBucket, Type, Plus, Grid3X3, Square, X, Eraser, ChevronDown
} from "lucide-react";
import ImportButton from "./ImportButton";
import ExportButton from "./ExportButton";

const COLS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 24, 36];

export default function Toolbar() {

  const [activeTab, setActiveTab] = useState("Kezdőlap");
  const [borderMenuOpen, setBorderMenuOpen] = useState(false);
  const borderBtnRef = useRef<HTMLButtonElement>(null);

  // Szegély stílus és szín állapotok
  const [borderLineColor, setBorderLineColor] = useState("#000000");
  const [borderLineStyle, setBorderLineStyle] = useState("thin");
  
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

  // ÚJ: Formázás "leradírozása"
  const clearFormatting = () => {
    apply({
      bold: false,
      italic: false,
      underline: false,
      color: undefined,
      bgColor: undefined,
      fontSize: 14,
      align: "left",
      border: undefined // Ha a Cell.tsx támogatja a kerettörlést
    });
  };

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

      const borderDef = { style: borderLineStyle, color: borderLineColor };

      if (type === "none") { newBorder = {}; }
      else if (type === "all") { newBorder = { top: borderDef, bottom: borderDef, left: borderDef, right: borderDef }; }
      else if (type === "outside") {
        if (r === minR) newBorder.top = borderDef;
        if (r === maxR) newBorder.bottom = borderDef;
        if (cIdx === minC) newBorder.left = borderDef;
        if (cIdx === maxC) newBorder.right = borderDef;
      }
      else if (type === "bottom") newBorder.bottom = borderDef;
      else if (type === "top") newBorder.top = borderDef;
      else if (type === "left") newBorder.left = borderDef;
      else if (type === "right") newBorder.right = borderDef;

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

  // --- ÚJ: Ellenőrizzük, hogy az aktuális cellán van-e egyedi formázás ---
  const hasCustomColor = !!fmt.color;
  const hasCustomBg = !!fmt.bgColor;
  const hasCustomBorder = !!(fmt.border && Object.keys(fmt.border).length > 0);

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
                ? "border-blue-600 text-blue-700 font-medium bg-white rounded-t-md"
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
            {/* 1. BETŰMÉRET VÁLASZTÓ - Formázott */}
            <div className="flex items-center bg-gray-50 border border-gray-200 rounded hover:border-gray-300 transition px-1.5 shrink-0">
              <select
                value={fmt.fontSize || 14}
                onChange={(e) => apply({ fontSize: Number(e.target.value) })}
                className="bg-transparent text-sm text-gray-700 outline-none cursor-pointer py-1 appearance-none pr-2"
                title="Betűméret"
              >
                {FONT_SIZES.map(size => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
              <ChevronDown className="w-3 h-3 text-gray-400 pointer-events-none" />
            </div>

            <div className="w-px h-5 bg-gray-300 mx-1 shrink-0" />

            {/* 2. ALAP FORMÁZÁS (Félkövér, Dőlt, Aláhúzott) */}
            <div className="flex items-center gap-0.5">
              <button className={`p-1.5 rounded transition ${fmt.bold ? "bg-blue-100 text-blue-700" : "text-gray-700 hover:bg-gray-200"}`} onClick={() => toggle("bold")} title="Félkövér (Ctrl+B)"><Bold className="w-4 h-4" /></button>
              <button className={`p-1.5 rounded transition ${fmt.italic ? "bg-blue-100 text-blue-700" : "text-gray-700 hover:bg-gray-200"}`} onClick={() => toggle("italic")} title="Dőlt (Ctrl+I)"><Italic className="w-4 h-4" /></button>
              <button className={`p-1.5 rounded transition ${fmt.underline ? "bg-blue-100 text-blue-700" : "text-gray-700 hover:bg-gray-200"}`} onClick={() => toggle("underline")} title="Aláhúzott (Ctrl+U)"><Underline className="w-4 h-4" /></button>
            </div>

            <div className="w-px h-5 bg-gray-300 mx-1 shrink-0" />

{/* 3. SZÍNEK (Feltételes X gombbal és profi hitbox-szal) */}
            <div className="flex items-center gap-1 shrink-0">
              
              {/* Szövegszín */}
              <div className={`flex items-center transition h-8 ${hasCustomColor ? 'bg-gray-50 border border-gray-200 rounded hover:border-gray-300' : 'rounded hover:bg-gray-200'}`}>
                <label className={`relative flex items-center justify-center h-full cursor-pointer ${hasCustomColor ? 'w-8 rounded-l hover:bg-gray-200' : 'w-8 rounded'}`} title="Szöveg színe">
                  <Type className="w-4 h-4 text-gray-700" />
                  <div className="absolute bottom-1.5 left-1.5 right-1.5 h-[3px] rounded-sm" style={{ backgroundColor: fmt.color ?? "#000000" }} />
                  <input type="color" className="absolute inset-0 opacity-0 cursor-pointer" value={fmt.color ?? "#000000"} onChange={(e) => apply({ color: e.target.value })} />
                </label>
                {hasCustomColor && (
                  <>
                    <div className="w-px h-5 bg-gray-200" />
                    <button 
                      onClick={() => apply({ color: undefined })} 
                      className="w-7 h-full flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-r transition" 
                      title="Betűszín visszaállítása"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>

              {/* Háttérszín Kombinált Gomb */}
              <div className={`flex items-center transition h-8 ${hasCustomBg ? 'bg-gray-50 border border-gray-200 rounded hover:border-gray-300' : 'rounded hover:bg-gray-200'}`}>
                <label className={`relative flex items-center justify-center h-full cursor-pointer ${hasCustomBg ? 'w-8 rounded-l hover:bg-gray-200' : 'w-8 rounded'}`} title="Kitöltőszín">
                  <PaintBucket className="w-4 h-4 text-gray-700" />
                  <div className="absolute bottom-1.5 left-1.5 right-1.5 h-[3px] rounded-sm border border-gray-300" style={{ backgroundColor: fmt.bgColor ?? "#ffffff" }} />
                  <input type="color" className="absolute inset-0 opacity-0 cursor-pointer" value={fmt.bgColor ?? "#ffffff"} onChange={(e) => apply({ bgColor: e.target.value })} />
                </label>
                {hasCustomBg && (
                  <>
                    <div className="w-px h-5 bg-gray-200" />
                    <button 
                      onClick={() => apply({ bgColor: undefined })} 
                      className="w-7 h-full flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-r transition" 
                      title="Kitöltés törlése"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="w-px h-5 bg-gray-300 mx-1 shrink-0" />

            {/* 4. SZEGÉLYEK (Feltételes X gombbal) */}
            <div className="relative shrink-0">
              <div className={`flex items-center transition h-8 ${hasCustomBorder ? 'bg-gray-50 border border-gray-200 rounded hover:border-gray-300' : ''}`}>
                <button
                  ref={borderBtnRef}
                  onClick={() => setBorderMenuOpen(!borderMenuOpen)}
                  className={`flex items-center justify-center h-full gap-1 transition ${hasCustomBorder ? 'px-2 rounded-l hover:bg-gray-200' : 'px-2 rounded hover:bg-gray-200'} ${borderMenuOpen ? "bg-blue-100 text-blue-700" : "text-gray-700"}`}
                  title="Szegélyek menü"
                >
                  <Grid3X3 className="w-4 h-4" />
                  <ChevronDown className="w-3 h-3 opacity-50" />
                </button>

                {hasCustomBorder && (
                  <>
                    <div className="w-px h-5 bg-gray-200" />
                    <button 
                      onClick={() => applyBorders("none")} 
                      className="w-7 h-full flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-r transition" 
                      title="Szegélyek törlése"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>

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
                    <button onClick={() => { applyBorders("all"); setBorderMenuOpen(false); }} title="Minden szegély" className="p-1.5 flex justify-center hover:bg-gray-100 rounded border border-gray-200"><Grid3X3 className="w-4 h-4 text-gray-700" /></button>
                    <button onClick={() => { applyBorders("outside"); setBorderMenuOpen(false); }} title="Külső szegély" className="p-1.5 flex justify-center hover:bg-gray-100 rounded border border-gray-200"><Square className="w-4 h-4 text-gray-700" /></button>
                    <button onClick={() => { applyBorders("none"); setBorderMenuOpen(false); }} title="Nincs szegély" className="p-1.5 flex justify-center hover:bg-gray-100 rounded border border-gray-200 text-red-500"><X className="w-4 h-4" /></button>

                    <div className="col-span-4 h-px bg-gray-200 my-1" />
                    
                    <div className="col-span-4 flex items-center gap-2 px-1 pb-1">
                      <input type="color" value={borderLineColor} onChange={e => setBorderLineColor(e.target.value)} className="w-6 h-6 p-0 border-0 rounded cursor-pointer shrink-0" title="Szegély színe" />
                      <select value={borderLineStyle} onChange={e => setBorderLineStyle(e.target.value)} className="text-xs border border-gray-300 rounded p-1 outline-none flex-1 text-gray-700 bg-white">
                        <option value="thin">Vékony</option>
                        <option value="medium">Közepes</option>
                        <option value="thick">Vastag</option>
                        <option value="dashed">Szaggatott</option>
                        <option value="dotted">Pontozott</option>
                      </select>
                    </div>

                    <div className="col-span-4 h-px bg-gray-200 my-1" />
                    
                    <button onClick={() => { applyBorders("top"); setBorderMenuOpen(false); }} title="Felső szegély" className="p-1.5 flex justify-center hover:bg-gray-100 rounded border border-gray-200"><div className="w-4 h-4 border-t-2 border-black" /></button>
                    <button onClick={() => { applyBorders("bottom"); setBorderMenuOpen(false); }} title="Alsó szegély" className="p-1.5 flex justify-center hover:bg-gray-100 rounded border border-gray-200"><div className="w-4 h-4 border-b-2 border-black" /></button>
                    <button onClick={() => { applyBorders("left"); setBorderMenuOpen(false); }} title="Bal szegély" className="p-1.5 flex justify-center hover:bg-gray-100 rounded border border-gray-200"><div className="w-4 h-4 border-l-2 border-black" /></button>
                    <button onClick={() => { applyBorders("right"); setBorderMenuOpen(false); }} title="Jobb szegély" className="p-1.5 flex justify-center hover:bg-gray-100 rounded border border-gray-200"><div className="w-4 h-4 border-r-2 border-black" /></button>
                  </div>
                </>
              )}
            </div>

            <div className="w-px h-5 bg-gray-300 mx-1 shrink-0" />

            {/* 5. IGAZÍTÁS (Csoportosított "Toggle" dizájn) */}
            <div className="flex items-center bg-gray-100 rounded p-0.5 shrink-0">
              <button className={`p-1.5 rounded-sm transition ${fmt.align === "left" || !fmt.align ? "bg-white shadow-sm text-blue-600" : "text-gray-600 hover:bg-gray-200"}`} onClick={() => apply({ align: "left" })} title="Balra igazítás"><AlignLeft className="w-4 h-4" /></button>
              <button className={`p-1.5 rounded-sm transition ${fmt.align === "center" ? "bg-white shadow-sm text-blue-600" : "text-gray-600 hover:bg-gray-200"}`} onClick={() => apply({ align: "center" })} title="Középre igazítás"><AlignCenter className="w-4 h-4" /></button>
              <button className={`p-1.5 rounded-sm transition ${fmt.align === "right" ? "bg-white shadow-sm text-blue-600" : "text-gray-600 hover:bg-gray-200"}`} onClick={() => apply({ align: "right" })} title="Jobbra igazítás"><AlignRight className="w-4 h-4" /></button>
            </div>

            <div className="w-px h-5 bg-gray-300 mx-1 shrink-0" />

            {/* 6. EXTRA: Formázás Törlése */}
            <button 
              className="p-1.5 rounded text-gray-600 hover:text-red-600 hover:bg-red-50 transition shrink-0" 
              onClick={clearFormatting} 
              title="Formázás törlése"
            >
              <Eraser className="w-4 h-4" />
            </button>
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