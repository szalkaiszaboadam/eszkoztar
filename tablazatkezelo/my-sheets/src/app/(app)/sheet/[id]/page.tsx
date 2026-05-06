// src/app/(app)/sheet/[id]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/store";
import { useSheetStore } from "@/lib/sheetStore";
import { saveCells, loadCells, renameSheet, getSheets } from "@/lib/sheetsService";
import Grid from "@/components/sheet/Grid";
import FormulaBar from "@/components/sheet/FormulaBar";
import Toolbar from "@/components/sheet/Toolbar";
import SheetTabs from "@/components/sheet/SheetTabs";
import toast from "react-hot-toast";
import { Save, ArrowLeft, FileSpreadsheet } from "lucide-react";

export default function SheetPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuthStore();
  const router = useRouter();
  const { cells, setCells, title, setTitle, isDirty, setDirty } = useSheetStore();
  const [saving, setSaving] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);

  useEffect(() => {
    if (!user || !id) return;
    // Cím betöltése
    getSheets(user.uid).then((sheets) => {
      const current = sheets.find((s) => s.id === id);
      if (current) setTitle(current.title);
    });
    // Cellák betöltése
    loadCells(user.uid, id).then((data) => {
      setCells(data);
      setDirty(false);
    });
  }, [user, id]);

  // Auto-save
  useEffect(() => {
    if (!isDirty) return;
    const timer = setTimeout(() => handleSave(true), 3000);
    return () => clearTimeout(timer);
  }, [cells, isDirty]);

  // Ctrl+S
  useEffect(() => {
    const handler = () => handleSave(false);
    window.addEventListener("sheet-save", handler);
    return () => window.removeEventListener("sheet-save", handler);
  }, [cells]);

  const handleSave = async (silent = false) => {
    if (!user || !id) return;
    setSaving(true);
    await saveCells(user.uid, id, cells);
    setDirty(false);
    setSaving(false);
    if (!silent) toast.success("Mentve!");
  };

  const handleTitleSave = async () => {
    if (!user || !id || !title.trim()) return;
    await renameSheet(user.uid, id, title.trim());
    setEditingTitle(false);
  };

  return (
    <div className="h-screen flex flex-col bg-white">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-2 border-b border-gray-200 bg-white shrink-0">
        <button onClick={() => router.push("/dashboard")} className="p-1.5 hover:bg-gray-100 rounded-lg transition">
          <ArrowLeft className="w-4 h-4 text-gray-600" />
        </button>
        <div className="bg-green-600 rounded-md p-1">
          <FileSpreadsheet className="w-4 h-4 text-white" />
        </div>
        {editingTitle ? (
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleTitleSave}
            onKeyDown={(e) => { if (e.key === "Enter") handleTitleSave(); }}
            className="font-semibold text-gray-800 border-b border-blue-400 focus:outline-none text-sm"
          />
        ) : (
          <span
            className="font-semibold text-gray-800 text-sm cursor-pointer hover:text-blue-600"
            onClick={() => setEditingTitle(true)}
          >
            {title || "Névtelen táblázat"}
          </span>
        )}
        <div className="flex-1" />
        <span className="text-xs text-gray-400">
          {saving ? "Mentés..." : isDirty ? "Nem mentett változások" : "Mentve ✓"}
        </span>
        <button
          onClick={() => handleSave(false)}
          className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-sm px-3 py-1.5 rounded-lg transition"
        >
          <Save className="w-3.5 h-3.5" /> Mentés
        </button>
      </header>

      {/* Toolbar */}
      <Toolbar />

      {/* Formula bar */}
      <FormulaBar />

      {/* Grid */}
      <Grid />

      {/* Sheet fülek */}
      <SheetTabs />
    </div>
  );
}