// src/components/sheet/ExportButton.tsx
"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { useSheetStore } from "@/lib/sheetStore";
import { COLS } from "@/lib/constants";
import toast from "react-hot-toast";

export default function ExportButton() {
  const [open, setOpen] = useState(false);
  const { cells, rowCount, title } = useSheetStore();
  const fileName = title || "tablazat";

  // Cellák → 2D tömb
  const toRows = (): string[][] => {
    const rows: string[][] = [];
    for (let r = 1; r <= rowCount; r++) {
      const row = COLS.map((col) => cells[`${col}${r}`]?.value ?? "");
      // Üres sorokat kihagyjuk a végéről
      if (row.some((v) => v !== "")) {
        rows.push(row);
      }
    }
    return rows;
  };

  const exportCSV = () => {
    const rows = toRows();
    const csv = rows.map((r) =>
      r.map((v) => (v.includes(",") || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v)).join(",")
    ).join("\n");

    download(`${fileName}.csv`, csv, "text/csv;charset=utf-8;");
    toast.success("CSV exportálva!");
    setOpen(false);
  };

  const exportXLSX = async () => {
    const XLSX = (await import("xlsx")).default;
    const rows = toRows();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    XLSX.writeFile(wb, `${fileName}.xlsx`);
    toast.success("XLSX exportálva!");
    setOpen(false);
  };

  const download = (name: string, content: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-green-600 hover:bg-gray-100 px-2.5 py-1.5 rounded-lg transition"
        title="Exportálás"
      >
        <Download className="w-4 h-4" />
        Exportálás
      </button>

      {open && (
        <>
          {/* Háttér klikk bezárja */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg py-1.5 z-50 min-w-[140px]">
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