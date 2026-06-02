// src/app/(app)/dashboard/page.tsx
"use client";

import { useEffect, useState, Suspense, useRef } from "react";
import { useAuthStore } from "@/lib/store";
import { useAuth } from "@/lib/useAuth";
import {
  getFolders, createFolder, Folder, moveFolder, deleteFolder, renameFolder,
  createSheet, getSheets, deleteSheet, renameSheet, Sheet, moveSheetToFolder,
  csvToCells, xlsxToCells, saveCells, toggleSheetFavorite, toggleFolderFavorite, // <-- EZ HIÁNYZOTT AZ IMPORTOK KÖZÜL
} from "@/lib/sheetsService";
import { useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import {
  Folder as FolderIcon, FolderPlus, Plus, FileSpreadsheet,
  Trash2, Pencil, LogOut, Check, X, ChevronRight, Home,
  LayoutGrid, List as ListIcon, Search, ArrowDownUp, Upload, Clock, Star
} from "lucide-react";

// ── Legutóbb megnyitott táblák kezelése LocalStorage-ban ──
const MAX_RECENT = 1;

interface RecentSheet { id: string; title: string; folderId?: string | null; openedAt: number; }

// ÚJ: A userId alapján generáljuk a kulcsot
function getRecentKey(userId: string) {
  return `mysheets_recent_${userId}`;
}

function getRecent(userId: string): RecentSheet[] {
  try {
    const items = JSON.parse(localStorage.getItem(getRecentKey(userId)) || "[]");
    return items.slice(0, MAX_RECENT);
  } catch { return []; }
}

function saveRecent(userId: string, sheet: RecentSheet) {
  try {
    const prev = getRecent(userId).filter(r => r.id !== sheet.id);
    const next = [sheet, ...prev].slice(0, MAX_RECENT);
    localStorage.setItem(getRecentKey(userId), JSON.stringify(next));
  } catch (e) { console.error(e); }
}

function removeRecentById(userId: string, ids: string[]) {
  try {
    const next = getRecent(userId).filter(r => !ids.includes(r.id));
    localStorage.setItem(getRecentKey(userId), JSON.stringify(next));
  } catch (e) { console.error(e); }
}

function removeRecentByFolder(userId: string, folderId: string) {
  try {
    const next = getRecent(userId).filter(r => r.folderId !== folderId);
    localStorage.setItem(getRecentKey(userId), JSON.stringify(next));
  } catch (e) { console.error(e); }
}


function DashboardContent() {
  const { user } = useAuthStore();
  const { logout } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const importRef = useRef<HTMLInputElement>(null);

  const currentFolder = searchParams.get("folder");

  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [recentSheets, setRecentSheets] = useState<RecentSheet[]>([]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<"date-desc" | "date-asc" | "name-asc" | "name-desc">("date-desc");
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editFolderTitle, setEditFolderTitle] = useState("");
  const [refreshTrigger, setRefreshTrigger] = useState(0);


  // ── ÚJ: Kedvencek állapota és logikája ──
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  const handleToggleFavoriteSheet = async (e: React.MouseEvent, sheet: Sheet) => {
    e.stopPropagation();
    if (!user) return;
    const newValue = !sheet.isFavorite;
    setSheets(prev => prev.map(s => s.id === sheet.id ? { ...s, isFavorite: newValue } : s));
    try { await toggleSheetFavorite(user.uid, sheet.id, newValue); }
    catch { toast.error("Hiba a mentéskor."); setSheets(prev => prev.map(s => s.id === sheet.id ? { ...s, isFavorite: !newValue } : s)); }
  };

  const handleToggleFavoriteFolder = async (e: React.MouseEvent, folder: Folder) => {
    e.stopPropagation();
    if (!user) return;
    const newValue = !folder.isFavorite;
    setFolders(prev => prev.map(f => f.id === folder.id ? { ...f, isFavorite: newValue } : f));
    try { await toggleFolderFavorite(user.uid, folder.id, newValue); }
    catch { toast.error("Hiba a mentéskor."); setFolders(prev => prev.map(f => f.id === folder.id ? { ...f, isFavorite: !newValue } : f)); }
  };

  useEffect(() => {
    if (user) {
      setRecentSheets(getRecent(user.uid));
      loadData();
    } else {
      setRecentSheets([]); // Ha nincs user, ürítjük az állapotot
    }
  }, [user, refreshTrigger]);


  // ── JAVÍTÁS: Kíméletes, Next.js kompatibilis visszalépés kezelés ──
  useEffect(() => {
    const handleRestore = () => {
      // Ez a sor garantálja, hogy a React a legfrissebb user adatokkal ébred fel!
      setRefreshTrigger(prev => prev + 1);

      if (typeof getRecent === "function" && typeof setRecentSheets === "function" && user) {
        setRecentSheets(getRecent(user.uid));
      }

      router.refresh();
    };

    // Amikor a history-ban lépünk (egér oldalsó gomb vagy böngésző vissza gomb)
    window.addEventListener("popstate", handleRestore);

    // Amikor a böngésző a memóriájából (BFCache) húzza elő az oldalt
    window.addEventListener("pageshow", (e) => {
      if (e.persisted) handleRestore();
    });

    // Ha az ablak visszakapja a fókuszt (pl. átkattintottál egy másik fülről vissza)
    window.addEventListener("focus", handleRestore);

    return () => {
      window.removeEventListener("popstate", handleRestore);
      window.removeEventListener("pageshow", handleRestore);
      window.removeEventListener("focus", handleRestore);
    };
  }, [router]);


  const loadData = async () => {
    if (!user) return;
    try {
      const [fetchedSheets, fetchedFolders] = await Promise.all([
        getSheets(user.uid),
        getFolders(user.uid)
      ]);
      setSheets(fetchedSheets);
      setFolders(fetchedFolders);
    } catch {
      toast.error("Hiba az adatok betöltésekor.");
    } finally {
      setLoading(false);
    }
  };

  const navigateToFolder = (id: string | null) => {
    setShowFavoritesOnly(false); // Reseteljük a kedvenceket mappaváltáskor
    if (id) router.push(`/dashboard?folder=${id}`);
    else router.push("/dashboard");
  };

  const openSheet = (sheet: Sheet) => {
    if (user) saveRecent(user.uid, { id: sheet.id, title: sheet.title, folderId: sheet.folderId, openedAt: Date.now() });
    const path = `/sheet/${sheet.id}${currentFolder ? `?folder=${currentFolder}` : ""}`;
    router.push(path);
  };

  const handleCreateSheet = async () => {
    if (!user) return;
    const id = await createSheet(user.uid, "Névtelen táblázat", currentFolder);
    toast.success("Táblázat létrehozva!");
    saveRecent(user.uid, { id, title: "Névtelen táblázat", folderId: currentFolder, openedAt: Date.now() });
    // ...
    const path = `/sheet/${id}${currentFolder ? `?folder=${currentFolder}` : ""}`;
router.push(path);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    const toastId = toast.loading("Importálás...");
    try {
      const ext = file.name.split(".").pop()?.toLowerCase();
      let result: {
        cellsByTab: Record<number, Record<string, any>>;
        rowCountByTab: Record<number, number>;
        tabs: string[];
        colWidthsByTab: Record<number, Record<string, number>>;
        rowHeightsByTab: Record<number, Record<string, number>>;
      } | null = null;

      if (ext === "csv") {
        const text = await file.text();
        result = csvToCells(text);
      } else if (ext === "xlsx" || ext === "xls") {
        const buffer = await file.arrayBuffer();
        result = await xlsxToCells(buffer); // <-- JAVÍTVA: await hozzáadva
      } else {
        toast.error("Csak .csv, .xlsx és .xls fájlok támogatottak!", { id: toastId });
        if (importRef.current) importRef.current.value = "";
        return;
      }

      if (!result) throw new Error("Üres eredmény");
      const sheetTitle = file.name.replace(/\.[^.]+$/, "");
      const id = await createSheet(user.uid, sheetTitle, currentFolder);

      // JAVÍTÁS: Itt adjuk át a valódi szélességeket és magasságokat a { 0: {} } helyett!
      await saveCells(
        user.uid,
        id,
        result.cellsByTab,
        result.rowCountByTab,
        result.tabs,
        result.colWidthsByTab,    // <-- ÚJ SOR
        result.rowHeightsByTab    // <-- ÚJ SOR
      );
      // ...
      toast.success(`Importálva! ${Object.keys(result.cellsByTab[0] || {}).length} cella betöltve.`, { id: toastId });
      saveRecent(user.uid, { id, title: sheetTitle, folderId: currentFolder, openedAt: Date.now() });
      // ...
      const path = `/sheet/${id}${currentFolder ? `?folder=${currentFolder}` : ""}`;
router.push(path);
    } catch (err) {
      console.error(err);
      toast.error("Hiba történt az importálás során.", { id: toastId });
    } finally {
      if (importRef.current) importRef.current.value = "";
    }
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newFolderName.trim()) return;
    try {
      await createFolder(user.uid, newFolderName.trim(), currentFolder);
      setNewFolderName("");
      setIsFolderModalOpen(false);
      loadData();
      toast.success("Mappa létrehozva!");
    } catch { toast.error("Hiba a mappa létrehozásakor."); }
  };

  const handleDelete = async (id: string) => {
    if (!user || !confirm("Biztosan törlöd?")) return;
    await deleteSheet(user.uid, id);
    setSheets(prev => prev.filter(s => s.id !== id));
    removeRecentById(user.uid, [id]);
    setRecentSheets(getRecent(user.uid));
    toast.success("Törölve!");
  };

  const handleRename = async (id: string) => {
    if (!user || !editTitle.trim()) return;
    await renameSheet(user.uid, id, editTitle.trim());
    setSheets(prev => prev.map(s => s.id === id ? { ...s, title: editTitle.trim() } : s));
    setEditingId(null);
    toast.success("Átnevezve!");
  };

  const handleDeleteFolder = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!user || !confirm("Biztosan törlöd a mappát? (A tartalma is törlődik!)")) return;
    try {
      await deleteFolder(user.uid, id);
      removeRecentByFolder(user.uid, id);
      setRecentSheets(getRecent(user.uid));
      loadData();
      toast.success("Mappa törölve!");
    } catch { toast.error("Hiba a törléskor."); }
  };

  const handleRenameFolder = async (id: string) => {
    if (!user || !editFolderTitle.trim()) return;
    try {
      await renameFolder(user.uid, id, editFolderTitle.trim());
      setFolders(prev => prev.map(f => f.id === id ? { ...f, title: editFolderTitle.trim() } : f));
      setEditingFolderId(null);
      toast.success("Mappa átnevezve!");
      loadData();
    } catch { toast.error("Hiba az átnevezéskor."); }
  };

  const handleDropToFolder = async (e: React.DragEvent, targetFolderId: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    const sheetId = e.dataTransfer.getData("sheetId");
    const draggedFolderId = e.dataTransfer.getData("folderId");
    if (!user) return;
    try {
      if (sheetId) {
        await moveSheetToFolder(user.uid, sheetId, targetFolderId);
        toast.success(targetFolderId ? "Táblázat mappába mozgatva!" : "Táblázat kihelyezve!");
      } else if (draggedFolderId && draggedFolderId !== targetFolderId) {
        await moveFolder(user.uid, draggedFolderId, targetFolderId);
        toast.success("Mappa áthelyezve!");
      }
      loadData();
    } catch { toast.error("Hiba az áthelyezéskor."); }
  };

  const formatDate = (ts: any) => {
    if (!ts) return "";
    const d = ts.toDate?.() ?? new Date(ts);
    return d.toLocaleDateString("hu-HU", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  const formatRelative = (ms: number) => {
    const diff = Date.now() - ms;
    if (diff < 60_000) return "Most";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} perce`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} órája`;
    return new Date(ms).toLocaleDateString("hu-HU", { month: "short", day: "numeric" });
  };

  const breadcrumbs: Folder[] = [];
  let curr = folders.find(f => f.id === currentFolder);
  while (curr) { breadcrumbs.unshift(curr); curr = folders.find(f => f.id === curr?.parentId); }

  const filteredFolders = folders.filter(f => {
    if (searchTerm) return f.title.toLowerCase().includes(searchTerm.toLowerCase());
    if (showFavoritesOnly) return f.isFavorite;
    return (f.parentId || null) === currentFolder;
  });

  const filteredSheets = sheets.filter(s => {
    if (searchTerm) return s.title.toLowerCase().includes(searchTerm.toLowerCase());
    if (showFavoritesOnly) return s.isFavorite;
    return (s.folderId || null) === currentFolder;
  });

  const sortItems = <T,>(items: T[]): T[] => [...items].sort((a: any, b: any) => {
    if (sortBy.startsWith("name")) {
      const na = (a.title || "").toLowerCase(), nb = (b.title || "").toLowerCase();
      return sortBy === "name-asc" ? na.localeCompare(nb, "hu") : nb.localeCompare(na, "hu");
    }
    const getMs = (i: any) => { const t = i.updatedAt || i.createdAt; return t ? (t.toDate ? t.toDate().getTime() : new Date(t).getTime()) : 0; };
    return sortBy === "date-desc" ? getMs(b) - getMs(a) : getMs(a) - getMs(b);
  });

  const finalFolders = sortItems(filteredFolders);
  const finalSheets = sortItems(filteredSheets);

  const displayName = user?.displayName || user?.email?.split("@")[0] || "Felhasználó";

  return (
    <div className="min-h-screen" style={{ background: "#f3f4f6", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>

      {/* ── HEADER NAV ── */}
      <header style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "0 48px" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 52 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ background: "#16a34a", borderRadius: 8, padding: "6px 8px", display: "flex" }}>
              <FileSpreadsheet size={18} color="#fff" />
            </div>
            <span style={{ fontWeight: 700, fontSize: 16, color: "#111827" }}>My Sheets</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ fontSize: 13, color: "#6b7280" }}>{user?.email}</span>
            <button
              onClick={logout}
              style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#6b7280", background: "none", border: "none", cursor: "pointer", padding: "6px 10px", borderRadius: 8, transition: "all 0.15s" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#fef2f2"; (e.currentTarget as HTMLElement).style.color = "#ef4444"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "none"; (e.currentTarget as HTMLElement).style.color = "#6b7280"; }}
            >
              <LogOut size={15} /> Kilépés
            </button>
          </div>
        </div>
      </header>

      {/* ── WELCOME BANNER ── */}
      <div style={{ background: "linear-gradient(135deg, #f0fdf4 0%, #dcfce7 50%, #bbf7d0 100%)", borderBottom: "1px solid #d1fae5", padding: "32px 48px" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: "#14532d", marginBottom: 20 }}>
            Üdvözöljük, {displayName}!
          </h1>

          {/* ── KÉT GOMB EGYMÁS MELLETT ── */}
          <div style={{ display: "flex", gap: 12 }}>
            <input ref={importRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: "none" }} onChange={handleImportFile} />

            <button
              onClick={handleCreateSheet}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                background: "#16a34a", color: "#fff", border: "none",
                borderRadius: 8, padding: "9px 18px", fontSize: 14, fontWeight: 600,
                cursor: "pointer", boxShadow: "0 1px 3px rgba(22,163,74,0.3)", transition: "all 0.15s"
              }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#15803d"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "#16a34a"}
            >
              <Plus size={16} /> Üres munkafüzet létrehozása
            </button>

            <button
              onClick={() => importRef.current?.click()}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                background: "#fff", color: "#374151", border: "1px solid #d1d5db",
                borderRadius: 8, padding: "9px 18px", fontSize: 14, fontWeight: 600,
                cursor: "pointer", boxShadow: "0 1px 2px rgba(0,0,0,0.05)", transition: "all 0.15s"
              }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#f9fafb"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "#fff"}
            >
              <Upload size={16} /> Fájl feltöltése
            </button>
          </div>
        </div>
      </div>

      {/* ── FŐ TARTALOM ── */}
      <div style={{ padding: "0 48px" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "28px 0 48px" }}>

          {/* ── VISSZAUGRÁS / LEGUTÓBB MEGNYITOTT ── */}
          {/* ── VISSZAUGRÁS / LEGUTÓBB MEGNYITOTT ── */}
          {recentSheets.length > 0 && !searchTerm && !currentFolder && !showFavoritesOnly && (
            <section style={{ marginBottom: 36 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <Clock size={15} color="#6b7280" />
                <h2 style={{ fontSize: 13, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>
                  Folytatás innen
                </h2>
              </div>

              <div
                onClick={() => {
                  if (user) saveRecent(user.uid, { ...recentSheets[0], openedAt: Date.now() });
                  router.push(`/sheet/${recentSheets[0].id}${recentSheets[0].folderId ? `?folder=${recentSheets[0].folderId}` : ""}`);
                }}
                style={{
                  background: "#fff", borderRadius: 10, border: "1px solid #e5e7eb",
                  padding: "12px 14px", cursor: "pointer", display: "flex", alignItems: "center",
                  gap: 12, transition: "all 0.15s", boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                  maxWidth: "400px"
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "#86efac"; (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "#e5e7eb"; (e.currentTarget as HTMLElement).style.boxShadow = "0 1px 3px rgba(0,0,0,0.04)"; }}
              >
                <div style={{ background: "#f0fdf4", borderRadius: 8, padding: "8px", display: "flex", flexShrink: 0 }}>
                  <FileSpreadsheet size={20} color="#16a34a" />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#111827", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {recentSheets[0].title}
                  </div>
                  <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>
                    {formatRelative(recentSheets[0].openedAt)}
                  </div>
                </div>
                <ChevronRight size={18} color="#d1d5db" />
              </div>
            </section>
          )}

          {/* ── BREADCRUMB + KERESŐ + KONTROLL SOR ── */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>

            {/* Bal: Breadcrumb */}
            <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", visibility: showFavoritesOnly ? "hidden" : "visible" }}>
              <button
                onClick={() => { setSearchTerm(""); navigateToFolder(null); }}
                onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={e => handleDropToFolder(e, null)}
                style={{
                  display: "flex", alignItems: "center", gap: 6, background: "none", border: "none",
                  padding: "6px 10px", borderRadius: 8, cursor: "pointer", fontSize: 14,
                  fontWeight: 600, color: currentFolder ? "#6b7280" : "#111827",
                  transition: "background 0.1s"
                }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#f3f4f6"}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "none"}
              >
                <Home size={15} /> Főoldal
              </button>
              {breadcrumbs.map(crumb => (
                <div key={crumb.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <ChevronRight size={14} color="#d1d5db" />
                  <button
                    onClick={() => { setSearchTerm(""); navigateToFolder(crumb.id); }}
                    style={{
                      background: "none", border: "none", padding: "6px 10px", borderRadius: 8,
                      cursor: "pointer", fontSize: 14, fontWeight: 600, color: "#111827", transition: "background 0.1s"
                    }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#f3f4f6"}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "none"}
                  >
                    {crumb.title}
                  </button>
                </div>
              ))}
            </div>

            {/* Jobb: Kereső + kontrollok */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {/* Kereső */}
              <div style={{ position: "relative" }}>
                <Search size={14} color={searchTerm ? "#16a34a" : "#9ca3af"} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
                <input
                  type="text"
                  placeholder="Keresés..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  style={{
                    paddingLeft: 36, paddingRight: searchTerm ? 32 : 14, paddingTop: 8, paddingBottom: 8,
                    border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13, outline: "none",
                    background: "#fff", width: 220, transition: "all 0.2s",
                    color: "#111827"
                  }}
                  onFocus={e => (e.currentTarget as HTMLElement).style.borderColor = "#86efac"}
                  onBlur={e => (e.currentTarget as HTMLElement).style.borderColor = "#e5e7eb"}
                />
                {searchTerm && (
                  <button onClick={() => setSearchTerm("")} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", padding: 2, color: "#9ca3af", display: "flex" }}>
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Rendezés */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: "0 10px", height: 36 }}>
                <ArrowDownUp size={13} color="#6b7280" />
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value as any)}
                  style={{ background: "transparent", border: "none", fontSize: 13, color: "#374151", outline: "none", cursor: "pointer" }}
                >
                  <option value="date-desc">Legújabb</option>
                  <option value="date-asc">Legrégebbi</option>
                  <option value="name-asc">Név (A-Z)</option>
                  <option value="name-desc">Név (Z-A)</option>
                </select>
              </div>

              {/* Nézetváltó */}
              <div style={{ display: "flex", background: "#f3f4f6", borderRadius: 8, padding: 3, gap: 2 }}>
                {(["grid", "list"] as const).map(mode => (
                  <button
                    key={mode}
                    onClick={() => setViewMode(mode)}
                    style={{
                      background: viewMode === mode ? "#fff" : "transparent",
                      border: "none", borderRadius: 6, padding: "5px 10px", cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: viewMode === mode ? "#16a34a" : "#6b7280",
                      boxShadow: viewMode === mode ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                      transition: "all 0.15s"
                    }}
                  >
                    {mode === "grid" ? <LayoutGrid size={16} /> : <ListIcon size={16} />}
                  </button>
                ))}
              </div>

              <button
                onClick={() => {
                  const next = !showFavoritesOnly;
                  setShowFavoritesOnly(next);
                  if (next) { setSearchTerm(""); router.push("/dashboard"); }
                }}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  background: showFavoritesOnly ? "#fef08a" : "#fff",
                  border: `1px solid ${showFavoritesOnly ? "#fde047" : "#e5e7eb"}`,
                  borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 600,
                  color: showFavoritesOnly ? "#854d0e" : "#374151",
                  cursor: "pointer", transition: "all 0.15s", height: 36
                }}
              >
                <Star size={15} fill={showFavoritesOnly ? "currentColor" : "none"} color={showFavoritesOnly ? "#854d0e" : "#9ca3af"} />
                Kedvencek
              </button>

              {/* Új mappa */}
              <button
                onClick={() => setIsFolderModalOpen(true)}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8,
                  padding: "7px 14px", fontSize: 13, fontWeight: 600, color: "#374151",
                  cursor: "pointer", transition: "all 0.15s", height: 36
                }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#f9fafb"}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "#fff"}
              >
                <FolderPlus size={15} color="#3b82f6" /> Új mappa
              </button>
            </div>
          </div>

          {/* Szekció cím + darabszám */}
          <div style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "#111827", margin: 0 }}>
              {searchTerm ? `Keresési találatok: "${searchTerm}"` : (currentFolder ? folders.find(f => f.id === currentFolder)?.title : "Saját munkafüzetek")}
            </h2>
            <p style={{ fontSize: 13, color: "#9ca3af", marginTop: 2 }}>
              {filteredFolders.length + filteredSheets.length === 0
                ? "Nincs elem"
                : `${filteredFolders.length} mappa, ${filteredSheets.length} táblázat`
              }
            </p>
          </div>

          {loading ? (
            <div style={{ textAlign: "center", padding: "80px 0", color: "#9ca3af" }}>Betöltés...</div>
          ) : (
            <>
              {/* ── MAPPÁK ── */}
              {finalFolders.length > 0 && (
                <div style={{ marginBottom: 32 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Mappák</p>
                  <div style={viewMode === "grid"
                    ? { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }
                    : { display: "flex", flexDirection: "column", gap: 6 }
                  }>
                    {finalFolders.map(folder => (
                      <div
                        key={folder.id}
                        draggable
                        onDragStart={e => { e.stopPropagation(); e.dataTransfer.setData("folderId", folder.id); }}
                        onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                        onDrop={e => handleDropToFolder(e, folder.id)}
                        onClick={() => editingFolderId !== folder.id && navigateToFolder(folder.id)}
                        className="group"
                        style={{
                          background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10,
                          padding: viewMode === "grid" ? "12px 14px" : "10px 14px",
                          cursor: "pointer", display: "flex", alignItems: "center", gap: 12,
                          transition: "all 0.15s", position: "relative",
                          boxShadow: "0 1px 2px rgba(0,0,0,0.04)"
                        }}
                        onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = "#93c5fd"; el.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)"; }}
                        onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = "#e5e7eb"; el.style.boxShadow = "0 1px 2px rgba(0,0,0,0.04)"; }}
                      >
                        <FolderIcon size={22} color="#3b82f6" fill="#dbeafe" style={{ flexShrink: 0 }} />
                        {editingFolderId === folder.id ? (
                          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 4 }} onClick={e => e.stopPropagation()}>
                            <input
                              autoFocus
                              value={editFolderTitle}
                              onChange={e => setEditFolderTitle(e.target.value)}
                              onKeyDown={e => { if (e.key === "Enter") handleRenameFolder(folder.id); if (e.key === "Escape") setEditingFolderId(null); }}
                              style={{ flex: 1, border: "1px solid #93c5fd", borderRadius: 6, padding: "3px 8px", fontSize: 13, outline: "none", color: "#111827" }}
                            />
                            <button onClick={() => handleRenameFolder(folder.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#16a34a", padding: 2 }}><Check size={14} /></button>
                            <button onClick={() => setEditingFolderId(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", padding: 2 }}><X size={14} /></button>
                          </div>
                        ) : (
                          <span style={{ fontSize: 14, fontWeight: 600, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{folder.title}</span>
                        )}
                        <div style={{ display: "flex", gap: 2, opacity: folder.isFavorite ? 1 : 0, transition: "opacity 0.15s" }} className={folder.isFavorite ? "" : "folder-actions"}>
                          <button onClick={e => handleToggleFavoriteFolder(e, folder)} style={{ background: "none", border: "none", cursor: "pointer", padding: 5, borderRadius: 6, color: folder.isFavorite ? "#eab308" : "#9ca3af" }}><Star size={14} fill={folder.isFavorite ? "currentColor" : "none"} /></button>
                          {/* Itt marad a Pencil és a Trash2 gombod */}
                          <button onClick={e => { e.stopPropagation(); setEditingFolderId(folder.id); setEditFolderTitle(folder.title); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 5, borderRadius: 6, color: "#6b7280" }}><Pencil size={13} /></button>
                          <button onClick={e => handleDeleteFolder(e, folder.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 5, borderRadius: 6, color: "#ef4444" }}><Trash2 size={13} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── TÁBLÁZATOK ── */}
              {finalSheets.length === 0 && finalFolders.length === 0 ? (
                <div style={{ textAlign: "center", padding: "64px 0", background: "#fff", borderRadius: 16, border: "2px dashed #e5e7eb" }}>
                  <Search size={48} color="#d1d5db" style={{ margin: "0 auto 12px" }} />
                  <p style={{ fontSize: 16, color: "#9ca3af", marginBottom: 4 }}>
                    {searchTerm ? `Nincs találat: "${searchTerm}"` : "Ez a mappa üres."}
                  </p>
                  <p style={{ fontSize: 13, color: "#d1d5db" }}>
                    {searchTerm ? "Ellenőrizd a helyesírást." : "Hozz létre egy új táblázatot vagy mappát!"}
                  </p>
                </div>
              ) : finalSheets.length > 0 ? (
                <div>
                  <p style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Táblázatok</p>
                  <div style={viewMode === "grid"
                    ? { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }
                    : { display: "flex", flexDirection: "column", gap: 6 }
                  }>
                    {finalSheets.map(sheet => (
                      <div
                        key={sheet.id}
                        draggable
                        onDragStart={e => { e.stopPropagation(); e.dataTransfer.setData("sheetId", sheet.id); }}
                        onClick={() => editingId !== sheet.id && openSheet(sheet)}
                        style={{
                          background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12,
                          cursor: "pointer", overflow: "hidden", transition: "all 0.15s", position: "relative",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                          ...(viewMode === "list" ? { display: "flex", alignItems: "center", gap: 14, padding: "10px 14px", borderRadius: 10 } : {})
                        }}
                        onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = "#86efac"; el.style.boxShadow = "0 6px 16px rgba(0,0,0,0.1)"; }}
                        onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = "#e5e7eb"; el.style.boxShadow = "0 1px 3px rgba(0,0,0,0.04)"; }}
                      >
                        {viewMode === "grid" ? (
                          <>

                            {/* src/app/(app)/dashboard/page.tsx (keresd meg az előnézet renderelő részét) */}

                            {/* Előnézet terület */}
                            <div style={{ height: 110, background: "#f9fafb", borderBottom: "1px solid #f3f4f6", padding: "10px 10px 0", overflow: "hidden", position: "relative" }}>

                              {/* HTML table helyett CSS Grid, ami pont úgy viselkedik, mint a valódi szerkesztő */}
                              <div style={{
                                display: "grid",
                                gridTemplateColumns: "24px repeat(4, 1fr)",
                                borderTop: "1px solid #d1d5db",
                                borderLeft: "1px solid #d1d5db",
                                background: "#fff"
                              }}>
                                {[0, 1, 2, 3, 4].map(ri => (
                                  [0, 1, 2, 3, 4].map(ci => {
                                    const isHeader = ri === 0 || ci === 0;

                                    let cellValue = "";
                                    let cellFormat: any = null;

                                    if (!isHeader && sheet.previewData) {
                                      const dataIndex = (ri - 1) * 4 + (ci - 1);
                                      const rawData = sheet.previewData[dataIndex];

                                      if (rawData) {
                                        try {
                                          if (rawData.startsWith("{")) {
                                            const parsed = JSON.parse(rawData);
                                            cellValue = parsed.v || "";
                                            cellFormat = parsed.f;
                                          } else {
                                            cellValue = rawData;
                                          }
                                        } catch {
                                          cellValue = rawData;
                                        }
                                      }
                                    }

                                    let label = "";
                                    if (ri === 0 && ci > 0) label = ["", "A", "B", "C", "D"][ci];
                                    if (ci === 0 && ri > 0) label = String(ri);

                                    const alignClass = cellFormat?.align === "center" ? "center" : cellFormat?.align === "right" ? "right" : "left";

                                    // Itt a varázslat: KIVETTÜK az 'overflow: "hidden"'-t a cella konténeréből!
                                    const cellStyle: React.CSSProperties = isHeader
                                      ? {
                                        background: "#f3f4f6", color: "#9ca3af", fontWeight: "600", fontSize: 8,
                                        textAlign: "center", height: 18, borderBottom: "1px solid #d1d5db", borderRight: "1px solid #d1d5db",
                                        position: "relative", display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box"
                                      }
                                      : {
                                        background: cellFormat?.bgColor || "#fff", color: cellFormat?.color || "#374151",
                                        fontWeight: cellFormat?.bold ? "bold" : "normal", fontStyle: cellFormat?.italic ? "italic" : "normal",
                                        textDecoration: cellFormat?.underline ? "underline" : "none", textAlign: alignClass as any,
                                        fontSize: 8, height: 18, borderBottom: "1px solid #e5e7eb", borderRight: "1px solid #e5e7eb",
                                        position: "relative", boxSizing: "border-box"
                                      };

                                    // Hajszálpontosan A TE Cell.tsx kódod a tökéletes szegélyekhez:
                                    const renderPreviewBorder = (b: any, side: string) => {
                                      if (!b) return null;
                                      let w = 1; let style = "solid";
                                      if (b !== true) {
                                        if (b.style === "thick") w = 3;
                                        else if (b.style === "medium") w = 2;
                                        if (b.style?.includes("dash")) style = "dashed";
                                        else if (b.style?.includes("dot")) style = "dotted";
                                      }
                                      const color = b.color || '#000000';
                                      const shift = Math.floor((w - 1) / 2);
                                      const offset = `-${1 + shift}px`;
                                      const common: React.CSSProperties = { position: "absolute", zIndex: 11, pointerEvents: "none" };

                                      if (side === "top") return <div style={{ ...common, top: offset, left: offset, right: offset, borderTop: `${w}px ${style} ${color}` }} />;
                                      if (side === "bottom") return <div style={{ ...common, top: `calc(100% - ${1 + shift}px)`, left: offset, right: offset, borderTop: `${w}px ${style} ${color}` }} />;
                                      if (side === "left") return <div style={{ ...common, left: offset, top: offset, bottom: offset, borderLeft: `${w}px ${style} ${color}` }} />;
                                      if (side === "right") return <div style={{ ...common, left: `calc(100% - ${1 + shift}px)`, top: offset, bottom: offset, borderLeft: `${w}px ${style} ${color}` }} />;
                                    };

                                    return (
                                      <div key={`${ri}-${ci}`} style={cellStyle}>
                                        {/* A szöveget egy belső span-be zárjuk, így CSAK a szöveg lesz levágva, nem a szegély! */}
                                        <span style={{
                                          display: "block", padding: "0 4px", lineHeight: "17px",
                                          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                                          position: "relative", zIndex: 10, width: "100%", boxSizing: "border-box"
                                        }}>
                                          {isHeader ? label : cellValue}
                                        </span>

                                        {/* Szegélyek (immár szabadon kinyúlhatnak a div-ből) */}
                                        {!isHeader && cellFormat?.border?.top && renderPreviewBorder(cellFormat.border.top, "top")}
                                        {!isHeader && cellFormat?.border?.bottom && renderPreviewBorder(cellFormat.border.bottom, "bottom")}
                                        {!isHeader && cellFormat?.border?.left && renderPreviewBorder(cellFormat.border.left, "left")}
                                        {!isHeader && cellFormat?.border?.right && renderPreviewBorder(cellFormat.border.right, "right")}
                                      </div>
                                    );
                                  })
                                ))}
                              </div>

                              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 40, background: "linear-gradient(to top, #f9fafb, transparent)", pointerEvents: "none", zIndex: 15 }} />

                              {/* Hover akció gombok */}
                              <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 4, opacity: sheet.isFavorite ? 1 : 0, transition: "opacity 0.15s", zIndex: 20 }} className={sheet.isFavorite ? "" : "sheet-actions"}>
                                <button onClick={e => handleToggleFavoriteSheet(e, sheet)} style={{ background: "rgba(255,255,255,0.9)", border: "1px solid #e5e7eb", borderRadius: 6, padding: "4px 7px", cursor: "pointer", display: "flex" }}><Star size={13} color={sheet.isFavorite ? "#eab308" : "#6b7280"} fill={sheet.isFavorite ? "#eab308" : "none"} /></button>
                                <button onClick={e => { e.stopPropagation(); setEditingId(sheet.id); setEditTitle(sheet.title); }} style={{ background: "rgba(255,255,255,0.9)", border: "1px solid #e5e7eb", borderRadius: 6, padding: "4px 7px", cursor: "pointer", display: "flex" }}><Pencil size={13} color="#6b7280" /></button>
                                <button onClick={e => { e.stopPropagation(); handleDelete(sheet.id); }} style={{ background: "rgba(255,255,255,0.9)", border: "1px solid #e5e7eb", borderRadius: 6, padding: "4px 7px", cursor: "pointer", display: "flex" }}><Trash2 size={13} color="#ef4444" /></button>
                              </div>
                            </div>


                            {/* Cím + dátum */}
                            <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                              <div style={{ background: "#f0fdf4", borderRadius: 8, padding: "7px", display: "flex", flexShrink: 0 }}>
                                <FileSpreadsheet size={16} color="#16a34a" />
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                {editingId === sheet.id ? (
                                  <div style={{ display: "flex", gap: 4 }} onClick={e => e.stopPropagation()}>
                                    <input
                                      autoFocus value={editTitle}
                                      onChange={e => setEditTitle(e.target.value)}
                                      onKeyDown={e => { if (e.key === "Enter") handleRename(sheet.id); if (e.key === "Escape") setEditingId(null); }}
                                      style={{ flex: 1, border: "1px solid #86efac", borderRadius: 6, padding: "2px 6px", fontSize: 13, outline: "none", color: "#111827" }}
                                    />
                                    <button onClick={() => handleRename(sheet.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#16a34a" }}><Check size={14} /></button>
                                    <button onClick={() => setEditingId(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af" }}><X size={14} /></button>
                                  </div>
                                ) : (
                                  <p style={{ fontSize: 14, fontWeight: 600, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: 0 }}>{sheet.title}</p>
                                )}
                                <p style={{ fontSize: 11, color: "#9ca3af", margin: "2px 0 0" }}>Módosítva: {formatDate(sheet.updatedAt)}</p>
                              </div>
                            </div>
                          </>
                        ) : (
                          /* Lista nézet */
                          <>
                            <div style={{ background: "#f0fdf4", borderRadius: 8, padding: "7px", display: "flex", flexShrink: 0 }}>
                              <FileSpreadsheet size={16} color="#16a34a" />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              {editingId === sheet.id ? (
                                <div style={{ display: "flex", gap: 4 }} onClick={e => e.stopPropagation()}>
                                  <input
                                    autoFocus value={editTitle}
                                    onChange={e => setEditTitle(e.target.value)}
                                    onKeyDown={e => { if (e.key === "Enter") handleRename(sheet.id); if (e.key === "Escape") setEditingId(null); }}
                                    style={{ flex: 1, border: "1px solid #86efac", borderRadius: 6, padding: "2px 6px", fontSize: 13, outline: "none", color: "#111827", maxWidth: 280 }}
                                  />
                                </div>
                              ) : (
                                <p style={{ fontSize: 14, fontWeight: 600, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: 0 }}>{sheet.title}</p>
                              )}
                            </div>
                            <p style={{ fontSize: 12, color: "#9ca3af", flexShrink: 0, marginLeft: "auto" }}>
                              {formatDate(sheet.updatedAt)}
                            </p>
                            <div style={{ display: "flex", gap: 2, flexShrink: 0, opacity: sheet.isFavorite ? 1 : 0, transition: "opacity 0.15s" }} className={sheet.isFavorite ? "" : "sheet-actions"}>
                              <button onClick={e => handleToggleFavoriteSheet(e, sheet)} style={{ background: "none", border: "none", cursor: "pointer", padding: "5px 8px", borderRadius: 6, color: sheet.isFavorite ? "#eab308" : "#9ca3af" }}><Star size={14} fill={sheet.isFavorite ? "currentColor" : "none"} /></button>
                              {/* Itt marad a Pencil és a Trash2 gombod */}
                              {editingId === sheet.id ? (
                                <>
                                  <button onClick={e => { e.stopPropagation(); handleRename(sheet.id); }} style={{ background: "none", border: "none", cursor: "pointer", padding: "5px 8px", borderRadius: 6, color: "#16a34a" }}><Check size={14} /></button>
                                  <button onClick={e => { e.stopPropagation(); setEditingId(null); }} style={{ background: "none", border: "none", cursor: "pointer", padding: "5px 8px", borderRadius: 6, color: "#9ca3af" }}><X size={14} /></button>
                                </>
                              ) : (
                                <>
                                  <button onClick={e => { e.stopPropagation(); setEditingId(sheet.id); setEditTitle(sheet.title); }} style={{ background: "none", border: "none", cursor: "pointer", padding: "5px 8px", borderRadius: 6, color: "#6b7280" }}><Pencil size={14} /></button>
                                  <button onClick={e => { e.stopPropagation(); handleDelete(sheet.id); }} style={{ background: "none", border: "none", cursor: "pointer", padding: "5px 8px", borderRadius: 6, color: "#ef4444" }}><Trash2 size={14} /></button>
                                </>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>

      {/* ── CSS a hover opacity effektekhez ── */}
      <style>{`
        .group:hover .folder-actions { opacity: 1 !important; }
        div:hover > .sheet-actions { opacity: 1 !important; }
      `}</style>

      {/* ── ÚJ MAPPA MODAL ── */}
      {isFolderModalOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: "28px", width: "100%", maxWidth: 380, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: "#111827", margin: 0 }}>Új mappa</h3>
              <button onClick={() => setIsFolderModalOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", padding: 4 }}><X size={18} /></button>
            </div>
            <form onSubmit={handleCreateFolder}>
              <input
                autoFocus
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                placeholder="Mappa neve..."
                style={{
                  width: "100%", border: "1px solid #e5e7eb", borderRadius: 8,
                  padding: "10px 14px", fontSize: 14, outline: "none", marginBottom: 20,
                  color: "#111827", boxSizing: "border-box"
                }}
                onFocus={e => (e.currentTarget as HTMLElement).style.borderColor = "#86efac"}
                onBlur={e => (e.currentTarget as HTMLElement).style.borderColor = "#e5e7eb"}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button type="button" onClick={() => setIsFolderModalOpen(false)} style={{ padding: "9px 18px", fontSize: 14, fontWeight: 500, color: "#374151", background: "none", border: "1px solid #e5e7eb", borderRadius: 8, cursor: "pointer" }}>
                  Mégse
                </button>
                <button type="submit" disabled={!newFolderName.trim()} style={{ padding: "9px 18px", fontSize: 14, fontWeight: 600, color: "#fff", background: "#3b82f6", border: "none", borderRadius: 8, cursor: "pointer", opacity: newFolderName.trim() ? 1 : 0.5 }}>
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

export default function DashboardPage() {
  return (
    <Suspense fallback={<div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af" }}>Betöltés...</div>}>
      <DashboardContent />
    </Suspense>
  );
}