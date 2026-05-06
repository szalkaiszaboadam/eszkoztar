// src/components/sheet/FormulaBar.tsx
"use client";

import { useSheetStore } from "@/lib/sheetStore";

export default function FormulaBar() {
  const { selectedCell, cells } = useSheetStore();
  const cellData = selectedCell ? cells[selectedCell] : null;
  const content = cellData?.formula || cellData?.value || "";

  return (
    <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-1.5">
      <span className="text-sm font-mono font-semibold text-gray-600 w-12 text-center bg-gray-100 rounded px-2 py-0.5">
        {selectedCell ?? ""}
      </span>
      <span className="text-gray-300">fx</span>
      <span className="text-sm text-gray-700 font-mono flex-1">{content}</span>
    </div>
  );
}