// src/components/sheet/ExportButton.tsx
"use client";

import { useState, useRef } from "react";
import { Download } from "lucide-react";
import { useSheetStore } from "@/lib/sheetStore";
import { COLS } from "@/lib/constants";
import toast from "react-hot-toast";

export default function ExportButton() {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  
  // A méretek lekérése a store-ból (figyelj, hogy a colWidthsByTab és rowHeightsByTab benne legyen a store-ban!)
  const { cellsByTab, rowCountByTab, tabs, title, colWidthsByTab, rowHeightsByTab } = useSheetStore();
  const fileName = title || "tablazat";

  const exportCSV = () => {
    const activeTabIdx = useSheetStore.getState().activeTab;
    const cells = cellsByTab[activeTabIdx] || {};
    const rowCount = rowCountByTab[activeTabIdx] || 100;

    const rows: string[][] = [];
    for (let r = 1; r <= rowCount; r++) {
      const row = COLS.map((col) => cells[`${col}${r}`]?.value ?? "");
      if (row.some((v) => v !== "")) {
        rows.push(row);
      }
    }

    const csv = rows.map((r) =>
      r.map((v) => (v.includes(",") || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v)).join(",")
    ).join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast.success("CSV exportálva!");
    setOpen(false);
  };

  const exportXLSX = async () => {
    const toastId = toast.loading("Excel generálása...");
    try {
      // ÚJ MOTOR: ExcelJS betöltése (Sokkal profibb a formázásokhoz és méretekhez)
      const exceljsModule = await import("exceljs");
      const ExcelJS = exceljsModule.default || exceljsModule;
      
      const wb = new ExcelJS.Workbook();
      
      // Friss állapot lekérése
      const state = useSheetStore.getState();

      // Végigmegyünk az összes fülön
      state.tabs.forEach((tabName, tabIdx) => {
        const ws = wb.addWorksheet(tabName);
        const cells = state.cellsByTab[tabIdx] || {};
        
        // Biztonságos lekérés, ha esetleg undefined lenne
        const colWidths = state.colWidthsByTab?.[tabIdx] || {};
        const rowHeights = state.rowHeightsByTab?.[tabIdx] || {};

        // --- OSZLOP SZÉLESSÉGEK EXPORTÁLÁSA ---
        Object.entries(colWidths).forEach(([colLetter, width]) => {
          ws.getColumn(colLetter).width = width / 7;
        });

        // --- SOR MAGASSÁGOK EXPORTÁLÁSA ---
        Object.entries(rowHeights).forEach(([rowStr, height]) => {
          ws.getRow(parseInt(rowStr)).height = height / 1.33;
        });

        // --- CELLÁK ÉS FORMÁZÁSOK EXPORTÁLÁSA ---
        Object.entries(cells).forEach(([cellRef, cellData]) => {
          if (!cellData || (!cellData.value && !cellData.formula)) return;

          const cell = ws.getCell(cellRef);

          // Érték vagy Képlet visszaírása
          if (cellData.formula) {
            const cleanFormula = cellData.formula.startsWith("=")
              ? cellData.formula.slice(1)
              : cellData.formula;
            cell.value = { formula: cleanFormula, result: undefined };
          } else {
            cell.value = cellData.value;
          }

          // Formázások (Stílusok) átadása
          if (cellData.format) {
            const fmt = cellData.format;

            cell.font = {
              bold: !!fmt.bold,
              italic: !!fmt.italic,
              underline: !!fmt.underline,
              size: fmt.fontSize || undefined,
              color: fmt.color ? { argb: "FF" + fmt.color.replace("#", "").toUpperCase() } : undefined,
            };

            if (fmt.bgColor) {
              cell.fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: "FF" + fmt.bgColor.replace("#", "").toUpperCase() },
              };
            }

            if (fmt.align) {
              cell.alignment = { horizontal: fmt.align as any };
            }

if (fmt.border) {
              const mapExportBorder = (b: any) => {
                if (!b) return undefined;
                // Visszamenőleges kompatibilitás a régi "true" értékes szegélyekhez
                if (b === true) return { style: "thin", color: { argb: "FF000000" } }; 
                return { 
                  style: b.style || "thin", 
                  color: { argb: "FF" + (b.color || "#000000").replace("#", "").toUpperCase() } 
                };
              };
              cell.border = {
                top: mapExportBorder(fmt.border.top),
                bottom: mapExportBorder(fmt.border.bottom),
                left: mapExportBorder(fmt.border.left),
                right: mapExportBorder(fmt.border.right),
              };
            }
          }
        });
      });

      // Fájl írása és letöltése
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${fileName}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success("Excel fájl sikeresen kiexportálva!", { id: toastId });
    } catch (error) {
      console.error(error);
      toast.error("Hiba történt az exportálás során.", { id: toastId });
    } finally {
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-green-600 hover:bg-gray-100 px-2.5 py-1.5 rounded-lg transition"
        title="Exportálás"
      >
        <Download className="w-4 h-4" />
        Exportálás
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="fixed mt-1 bg-white border border-gray-200 rounded-xl shadow-lg py-1.5 z-50 min-w-[140px]"
            style={{
              top: btnRef.current ? btnRef.current.getBoundingClientRect().bottom : 0,
              left: btnRef.current ? btnRef.current.getBoundingClientRect().left : 0,
            }}
          >
            <button
              onClick={exportCSV}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition"
            >
              📄 CSV (.csv)
            </button>
            <button
              onClick={exportXLSX}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition"
            >
              📊 Excel (.xlsx)
            </button>
          </div>
        </>
      )}
    </div>
  );
}