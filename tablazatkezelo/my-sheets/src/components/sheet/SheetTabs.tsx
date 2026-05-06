// src/components/sheet/SheetTabs.tsx
"use client";

import { useState } from "react";
import { useSheetStore } from "@/lib/sheetStore";
import { Plus, Check, X } from "lucide-react";

export default function SheetTabs() {
  const { tabs, activeTab, setActiveTab, setTabs } = useSheetStore();
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editVal, setEditVal] = useState("");

  const addTab = () => {
    const newTabs = [...tabs, `Sheet${tabs.length + 1}`];
    setTabs(newTabs);
    setActiveTab(newTabs.length - 1);
  };

  const renameTab = (idx: number) => {
    if (!editVal.trim()) return;
    const newTabs = [...tabs];
    newTabs[idx] = editVal.trim();
    setTabs(newTabs);
    setEditingIdx(null);
  };

  const removeTab = (idx: number) => {
    if (tabs.length === 1) return;
    const newTabs = tabs.filter((_, i) => i !== idx);
    setTabs(newTabs);
    setActiveTab(Math.min(activeTab, newTabs.length - 1));
  };

  return (
    <div className="flex items-center border-t border-gray-200 bg-gray-50 px-2 overflow-x-auto">
      {tabs.map((tab, idx) => (
        <div
          key={idx}
          className={`group flex items-center gap-1 px-3 py-2 border-r border-gray-200 cursor-pointer text-sm select-none min-w-fit transition ${
            activeTab === idx
              ? "bg-white border-t-2 border-t-green-500 text-green-700 font-semibold"
              : "text-gray-500 hover:bg-gray-100"
          }`}
          onClick={() => setActiveTab(idx)}
          onDoubleClick={() => { setEditingIdx(idx); setEditVal(tab); }}
        >
          {editingIdx === idx ? (
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <input
                autoFocus
                value={editVal}
                onChange={(e) => setEditVal(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") renameTab(idx); if (e.key === "Escape") setEditingIdx(null); }}
                className="w-20 border border-blue-400 rounded px-1 text-xs focus:outline-none"
              />
              <button onClick={() => renameTab(idx)}><Check className="w-3 h-3 text-green-600" /></button>
              <button onClick={() => setEditingIdx(null)}><X className="w-3 h-3 text-gray-400" /></button>
            </div>
          ) : (
            <>
              {tab}
              {tabs.length > 1 && (
                <button
                  onClick={(e) => { e.stopPropagation(); removeTab(idx); }}
                  className="opacity-0 group-hover:opacity-100 ml-1 hover:text-red-400 transition"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </>
          )}
        </div>
      ))}
      <button
        onClick={addTab}
        className="px-3 py-2 text-gray-400 hover:text-green-600 hover:bg-gray-100 transition"
        title="Új fül"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
}