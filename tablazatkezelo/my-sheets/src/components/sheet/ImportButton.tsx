// src/components/sheet/ImportButton.tsx
"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { csvToCells, xlsxToCells } from "@/lib/sheetsService";
import { useSheetStore } from "@/lib/sheetStore";
import toast from "react-hot-toast";

export default function ImportButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const { setCells, setDirty, setRowCount } = useSheetStore(); // ← setRowCount hozzáadva

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);

    try {
      const ext = file.name.split(".").pop()?.toLowerCase();
      let result: ReturnType<typeof csvToCells> | null = null;

      if (ext === "csv") {
        const text = await file.text();
        result = csvToCells(text);
      } else if (ext === "xlsx" || ext === "xls") {
        const buffer = await file.arrayBuffer();
        result = xlsxToCells(buffer);
      } else {
        toast.error("Csak .csv, .xlsx és .xls fájlok támogatottak!");
        return;
      }

      setCells(result.cells);
      setRowCount(result.rowCount); // ← ez volt a hiányzó sor!
      setDirty(true);
      toast.success(`Importálva! ${Object.keys(result.cells).length} cella betöltve.`);
    } catch (err) {
      console.error(err);
      toast.error("Hiba történt az importálás során.");
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        className="hidden"
        onChange={handleFile}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={loading}
        className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-green-600 hover:bg-gray-100 px-2.5 py-1.5 rounded-lg transition disabled:opacity-50"
        title="CSV, XLSX vagy XLS fájl importálása"
      >
        <Upload className="w-4 h-4" />
        {loading ? "Importálás..." : "Importálás"}
      </button>
    </>
  );
}