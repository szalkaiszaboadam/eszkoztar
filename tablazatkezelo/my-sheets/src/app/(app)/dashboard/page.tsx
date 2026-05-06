// src/app/(app)/dashboard/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/lib/store";
import { useAuth } from "@/lib/useAuth";
import { createSheet, getSheets, deleteSheet, renameSheet, Sheet } from "@/lib/sheetsService";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Plus, FileSpreadsheet, Trash2, Pencil, LogOut, Check, X } from "lucide-react";

export default function DashboardPage() {
  const { user } = useAuthStore();
  const { logout } = useAuth();
  const router = useRouter();
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  useEffect(() => {
    if (user) loadSheets();
  }, [user]);

  const loadSheets = async () => {
    if (!user) return;
    const data = await getSheets(user.uid);
    setSheets(data);
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!user) return;
    const id = await createSheet(user.uid, "Névtelen táblázat");
    toast.success("Táblázat létrehozva!");
    router.push(`/sheet/${id}`);
  };

  const handleDelete = async (id: string) => {
    if (!user || !confirm("Biztosan törlöd?")) return;
    await deleteSheet(user.uid, id);
    setSheets((prev) => prev.filter((s) => s.id !== id));
    toast.success("Törölve!");
  };

  const handleRename = async (id: string) => {
    if (!user || !editTitle.trim()) return;
    await renameSheet(user.uid, id, editTitle.trim());
    setSheets((prev) => prev.map((s) => s.id === id ? { ...s, title: editTitle.trim() } : s));
    setEditingId(null);
    toast.success("Átnevezve!");
  };

  const formatDate = (ts: any) => {
    if (!ts) return "";
    const d = ts.toDate?.() ?? new Date(ts);
    return d.toLocaleDateString("hu-HU", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-green-600 rounded-lg p-1.5">
            <FileSpreadsheet className="text-white w-5 h-5" />
          </div>
          <h1 className="text-xl font-bold text-gray-800">My Sheets</h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">{user?.email}</span>
          <button
            onClick={logout}
            className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-red-500 transition"
          >
            <LogOut className="w-4 h-4" /> Kilépés
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Táblázataid</h2>
            <p className="text-gray-500 text-sm mt-1">{sheets.length} fájl</p>
          </div>
          <button
            onClick={handleCreate}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-xl font-medium text-sm transition shadow-sm"
          >
            <Plus className="w-4 h-4" /> Új táblázat
          </button>
        </div>

        {loading ? (
          <div className="text-center py-20 text-gray-400">Betöltés...</div>
        ) : sheets.length === 0 ? (
          <div className="text-center py-20">
            <FileSpreadsheet className="w-14 h-14 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">Még nincs táblázatod</p>
            <p className="text-gray-400 text-sm mt-1">Kattints az "Új táblázat" gombra a kezdéshez</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sheets.map((sheet) => (
              <div
                key={sheet.id}
                className="bg-white rounded-2xl border border-gray-200 p-5 hover:shadow-md transition group cursor-pointer"
                onClick={() => editingId !== sheet.id && router.push(`/sheet/${sheet.id}`)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="bg-green-100 rounded-lg p-2">
                    <FileSpreadsheet className="w-5 h-5 text-green-600" />
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingId(sheet.id); setEditTitle(sheet.title); }}
                      className="p-1.5 hover:bg-gray-100 rounded-lg"
                    >
                      <Pencil className="w-3.5 h-3.5 text-gray-500" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(sheet.id); }}
                      className="p-1.5 hover:bg-red-50 rounded-lg"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    </button>
                  </div>
                </div>

                {editingId === sheet.id ? (
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <input
                      autoFocus
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleRename(sheet.id); if (e.key === "Escape") setEditingId(null); }}
                      className="flex-1 border border-green-400 rounded px-2 py-1 text-sm focus:outline-none"
                    />
                    <button onClick={() => handleRename(sheet.id)} className="p-1 hover:bg-green-50 rounded">
                      <Check className="w-3.5 h-3.5 text-green-600" />
                    </button>
                    <button onClick={() => setEditingId(null)} className="p-1 hover:bg-gray-100 rounded">
                      <X className="w-3.5 h-3.5 text-gray-400" />
                    </button>
                  </div>
                ) : (
                  <p className="font-semibold text-gray-800 truncate">{sheet.title}</p>
                )}

                <p className="text-xs text-gray-400 mt-1">Módosítva: {formatDate(sheet.updatedAt)}</p>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}