// src/app/(app)/dashboard/page.tsx
"use client";

import { useEffect, useState, Suspense } from "react";
import { useAuthStore } from "@/lib/store";
import { useAuth } from "@/lib/useAuth";
import { 
  getFolders, createFolder, Folder, moveFolder, deleteFolder, renameFolder,
  createSheet, getSheets, deleteSheet, renameSheet, Sheet, moveSheetToFolder 
} from "@/lib/sheetsService";
import { useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { 
  Folder as FolderIcon, FolderPlus, Plus, FileSpreadsheet, 
  Trash2, Pencil, LogOut, Check, X, ChevronRight, Home 
} from "lucide-react";

function DashboardContent() {
  const { user } = useAuthStore();
  const { logout } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // URL-ből olvassuk ki az aktuális mappát (?folder=XYZ)
  const currentFolder = searchParams.get("folder");

  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Sheet szerkesztés
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  
  // Mappa létrehozás
  const [newFolderName, setNewFolderName] = useState("");
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);

  useEffect(() => {
    if (user) loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    try {
      const [fetchedSheets, fetchedFolders] = await Promise.all([
        getSheets(user.uid),
        getFolders(user.uid)
      ]);
      setSheets(fetchedSheets);
      setFolders(fetchedFolders);
    } catch (error) {
      toast.error("Hiba az adatok betöltésekor.");
    } finally {
      setLoading(false);
    }
  };

  // Navigáció a mappák között
  const navigateToFolder = (id: string | null) => {
    if (id) router.push(`/dashboard?folder=${id}`);
    else router.push("/dashboard");
  };

// ── Létrehozás frissítése ──────────────────────────────────
  const handleCreateSheet = async () => {
    if (!user) return;
    const id = await createSheet(user.uid, "Névtelen táblázat", currentFolder);
    toast.success("Táblázat létrehozva!");
    // HA van currentFolder, vigyük magunkkal az URL-ben!
    const path = `/sheet/${id}${currentFolder ? `?folder=${currentFolder}` : ""}`;
    router.push(path);
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newFolderName.trim()) return;
    try {
      await createFolder(user.uid, newFolderName.trim(), currentFolder);
      setNewFolderName("");
      setIsFolderModalOpen(false);
      loadData(); // Újratöltjük az adatokat, hogy látszódjon
      toast.success("Mappa létrehozva!");
    } catch (error) {
      toast.error("Hiba a mappa létrehozásakor.");
    }
  };

  // ── Törlés & Átnevezés ──────────────────────────────────────
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

  // Mappa szerkesztés állapotai
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editFolderTitle, setEditFolderTitle] = useState("");

  const handleDeleteFolder = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation(); // Ne navigáljon bele a mappába törléskor
    if (!user || !confirm("Biztosan törlöd a mappát? (A benne lévő fájlok nem törlődnek, de kikerülnek a főoldalra)")) return;
    
    try {
      await deleteFolder(user.uid, id);
      // Opcionális: A benne lévő fájlok folderId-ját is nullázhatnád itt egy loop-pal, 
      // de a legegyszerűbb, ha csak töröljük a mappát.
      setFolders((prev) => prev.filter((f) => f.id !== id));
      toast.success("Mappa törölve!");
    } catch (error) {
      toast.error("Hiba a törléskor.");
    }
  };

  const handleRenameFolder = async (id: string) => {
    if (!user || !editFolderTitle.trim()) return;
    try {
      await renameFolder(user.uid, id, editFolderTitle.trim());
      setFolders((prev) => prev.map((f) => f.id === id ? { ...f, title: editFolderTitle.trim() } : f));
      setEditingFolderId(null);
      toast.success("Mappa átnevezve!");
      loadData(); // Frissítés a biztonság kedvéért
    } catch (error) {
      toast.error("Hiba az átnevezéskor.");
    }
  };

  // ── Drag & Drop Áthelyezés ──────────────────────────────────
  const handleDropToFolder = async (e: React.DragEvent, targetFolderId: string | null) => {
    e.preventDefault();
    e.stopPropagation(); // Ne probálja a szülő elem is elkapni
    
    const sheetId = e.dataTransfer.getData("sheetId");
    const draggedFolderId = e.dataTransfer.getData("folderId");
    if (!user) return;

    try {
      if (sheetId) {
        // Táblázat áthelyezése
        await moveSheetToFolder(user.uid, sheetId, targetFolderId);
        toast.success(targetFolderId ? "Táblázat mappába mozgatva!" : "Táblázat kihelyezve a főoldalra!");
      } else if (draggedFolderId) {
        // Mappa áthelyezése (ne dobjuk önmagába)
        if (draggedFolderId === targetFolderId) return;
        await moveFolder(user.uid, draggedFolderId, targetFolderId);
        toast.success("Mappa áthelyezve!");
      }
      loadData(); // Frissítjük a felületet
    } catch (error) {
      toast.error("Hiba az áthelyezéskor.");
    }
  };

  const formatDate = (ts: any) => {
    if (!ts) return "";
    const d = ts.toDate?.() ?? new Date(ts);
    return d.toLocaleDateString("hu-HU", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

// ── Morzsamenü (Breadcrumb) generálása ──────────────────────
  const breadcrumbs = [];
  let curr = folders.find(f => f.id === currentFolder);
  while (curr) {
    breadcrumbs.unshift(curr); // Mindig az elejére fűzzük, hogy "Gyökér -> Gyermek -> Unoka" sorrend legyen
    curr = folders.find(f => f.id === curr?.parentId);
  }

  // Csak az aktuális mappában lévő elemeket szűrjük ki
  const visibleFolders = folders.filter((f) => (f.parentId || null) === currentFolder);
  const visibleSheets = sheets.filter((sheet) => (sheet.folderId || null) === currentFolder);

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
{/* Content */}
      <main className="max-w-5xl mx-auto px-6 py-10">
        
        {/* Okos Morzsamenü (Breadcrumb) - Minden eleme Dropzone! */}
        <div className="flex items-center flex-wrap gap-2 mb-6 p-2 rounded-xl bg-white border border-gray-200 shadow-sm overflow-x-auto">
          
          {/* Főoldal (Gyökér) */}
          <div
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={(e) => handleDropToFolder(e, null)}
            className="flex items-center"
          >
            <button 
              onClick={() => navigateToFolder(null)} 
              className={`flex items-center gap-1.5 p-1.5 px-3 rounded-lg transition ${!currentFolder ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-100"}`}
              title="Húzd ide a főoldalra helyezéshez"
            >
              <Home className="w-4 h-4" /> <span className="text-sm font-semibold">Főoldal</span>
            </button>
          </div>

          {/* Dinamikus Mappa Szintek */}
          {breadcrumbs.map((crumb, index) => {
            const isLast = index === breadcrumbs.length - 1;
            return (
              <div key={crumb.id} className="flex items-center gap-2">
                <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                <div
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onDrop={(e) => handleDropToFolder(e, crumb.id)}
                  className="flex items-center"
                >
                  <button
                    onClick={() => navigateToFolder(crumb.id)}
                    className={`text-sm font-semibold p-1.5 px-3 rounded-lg transition ${isLast ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-100"}`}
                    title={`Húzd ide az áthelyezéshez a(z) ${crumb.title} mappába`}
                  >
                    {crumb.title}
                  </button>
                </div>
              </div>
            );
          })}

          {currentFolder && (
            <span className="text-xs font-medium text-blue-500 ml-auto bg-blue-50/50 px-2 py-1 rounded-md border border-dashed border-blue-200 hidden sm:block">
              (Húzd a fájlt a fenti mappa nevekre az áthelyezéshez)
            </span>
          )}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">
              {currentFolder ? folders.find(f => f.id === currentFolder)?.title : "Fájlok és Mappák"}
            </h2>
            <p className="text-gray-500 text-sm mt-1">{visibleFolders.length} mappa, {visibleSheets.length} táblázat</p>
          </div>
          
          <div className="flex gap-3">
            <button
              onClick={() => setIsFolderModalOpen(true)}
              className="flex items-center gap-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2.5 rounded-xl font-medium text-sm transition shadow-sm"
            >
              <FolderPlus className="w-4 h-4 text-blue-500" /> Új mappa
            </button>

            <button
              onClick={handleCreateSheet}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-xl font-medium text-sm transition shadow-sm"
            >
              <Plus className="w-4 h-4" /> Új táblázat
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-20 text-gray-400">Betöltés...</div>
        ) : (
          <>
            {/* MAPPÁK LISTÁZÁSA */}
            {visibleFolders.length > 0 && (
              <div className="mb-8">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Mappák</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
     {visibleFolders.map((folder) => (
                    <div
                      key={folder.id}
                      draggable
                      onDragStart={(e) => {
                        e.stopPropagation();
                        e.dataTransfer.setData("folderId", folder.id);
                      }}
                      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                      onDrop={(e) => handleDropToFolder(e, folder.id)}
                      onClick={() => editingFolderId !== folder.id && navigateToFolder(folder.id)}
                      className="bg-white border border-gray-200 rounded-xl p-4 cursor-pointer hover:border-blue-400 hover:shadow-md transition flex flex-col gap-2 group active:cursor-grabbing relative"
                    >
                      <div className="flex items-center gap-3">
                        <FolderIcon className="w-8 h-8 text-blue-500 fill-blue-100 group-hover:fill-blue-200 transition" />
                        
                        {editingFolderId === folder.id ? (
                          <div className="flex items-center gap-1 flex-1" onClick={(e) => e.stopPropagation()}>
                            <input
                              autoFocus
                              value={editFolderTitle}
                              onChange={(e) => setEditFolderTitle(e.target.value)}
                              onKeyDown={(e) => { 
                                if (e.key === "Enter") handleRenameFolder(folder.id); 
                                if (e.key === "Escape") setEditingFolderId(null); 
                              }}
                              className="flex-1 border border-blue-400 rounded px-2 py-1 text-sm focus:outline-none w-full"
                            />
                          </div>
                        ) : (
                          <span className="font-medium text-gray-800 truncate flex-1">{folder.title}</span>
                        )}
                      </div>

                      {/* Mappa műveletek gombok (lebegő) */}
                      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition bg-white/80 rounded-lg p-0.5">
                        <button
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            setEditingFolderId(folder.id); 
                            setEditFolderTitle(folder.title); 
                          }}
                          className="p-1 hover:bg-gray-100 rounded"
                        >
                          <Pencil className="w-3.5 h-3.5 text-gray-500" />
                        </button>
                        <button
                          onClick={(e) => handleDeleteFolder(e, folder.id)}
                          className="p-1 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-400" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TÁBLÁZATOK LISTÁZÁSA */}
            {visibleSheets.length === 0 && visibleFolders.length === 0 ? (
              <div className="text-center py-20 bg-white border border-dashed border-gray-300 rounded-2xl">
                <FileSpreadsheet className="w-14 h-14 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 text-lg">Üres mappa.</p>
                <p className="text-gray-400 text-sm mt-1">Kattints az "Új táblázat" vagy "Új mappa" gombra a kezdéshez.</p>
              </div>
            ) : visibleSheets.length > 0 ? (
              <div>
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Táblázatok</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {visibleSheets.map((sheet) => (
                <div
    key={sheet.id}
    draggable
                      onDragStart={(e) => {
                        e.stopPropagation();
                        e.dataTransfer.setData("sheetId", sheet.id);
                      }}
                      className="bg-white rounded-2xl border border-gray-200 p-5 hover:shadow-md transition group cursor-pointer active:cursor-grabbing"
                      onClick={() => {
      if (editingId !== sheet.id) {
        // Kattintáskor is vigyük a mappa ID-t
        const path = `/sheet/${sheet.id}${currentFolder ? `?folder=${currentFolder}` : ""}`;
        router.push(path);
      }
    }}
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
              </div>
            ) : null}
          </>
        )}
      </main>

      {/* Mappa létrehozó Modal */}
      {isFolderModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-bold text-gray-800">Új mappa</h3>
              <button onClick={() => setIsFolderModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleCreateFolder}>
              <input
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Mappa neve..."
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-5"
              />
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsFolderModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition"
                >
                  Mégse
                </button>
                <button
                  type="submit"
                  disabled={!newFolderName.trim()}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 transition"
                >
                  Létrehozás
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// Fő export, ami becsomagolja a fenti logikát egy Suspense határvonalba
// (Erre azért van szükség, mert a useSearchParams() kliens oldalon ezt megköveteli)
export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="h-screen w-full flex items-center justify-center text-gray-500">Betöltés...</div>}>
      <DashboardContent />
    </Suspense>
  );
}