// src/components/sheet/FormulaBar.tsx
"use client";

import { useSheetStore } from "@/lib/sheetStore";

export default function FormulaBar() {
  const selectedCell = useSheetStore(s => s.selectedCell);
  const cellData = useSheetStore(s => selectedCell ? s.cells[selectedCell] : null);
  const content = cellData?.formula || cellData?.value || "";

  return (
    <div 
      className="flex items-center gap-2 border-b border-gray-200 bg-white px-3 py-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']"
      onWheel={(e) => {
        if (e.deltaY !== 0) e.currentTarget.scrollLeft += e.deltaY;
      }}
    >
      <span className="text-sm font-mono font-semibold text-gray-600 w-12 shrink-0 text-center bg-gray-100 rounded px-2 py-0.5">
        {selectedCell ?? ""}
      </span>
      <span className="text-gray-300 shrink-0 font-serif italic">fx</span>
      <span className="text-sm text-gray-700 font-mono flex-1 whitespace-nowrap min-w-0">{content}</span>
    </div>
  );
}