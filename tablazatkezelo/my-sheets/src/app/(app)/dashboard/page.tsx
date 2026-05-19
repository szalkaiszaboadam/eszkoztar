// src/app/(app)/dashboard/page.tsx
"use client";

import { useEffect, useState, Suspense, useRef } from "react";
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
  Trash2, Pencil, LogOut, Check, X, ChevronRight, Home,
  LayoutGrid, List as ListIcon, Search, ArrowDownUp, Upload, Clock
} from "lucide-react";

// ── Legutóbb megnyitott táblák kezelése LocalStorage-ban ──
const RECENT_KEY = "mysheets_recent";
const MAX_RECENT = 5;

interface RecentSheet { id: string; title: string; folderId?: string | null; openedAt: number; }

function getRecent(): RecentSheet[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch { return []; }
}

function saveRecent(sheet: RecentSheet) {
  const prev = getRecent().filter(r => r.id !== sheet.id);
  const next = [sheet, ...prev].slice(0, MAX_RECENT);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

function removeRecentById(ids: string[]) {
  const next = getRecent().filter(r => !ids.includes(r.id));
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

function removeRecentByFolder(folderId: string) {
  const next = getRecent().filter(r => r.folderId !== folderId);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
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

  useEffect(() => {
    setRecentSheets(getRecent());
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
    } catch {
      toast.error("Hiba az adatok betöltésekor.");
    } finally {
      setLoading(false);
    }
  };

  const navigateToFolder = (id: string | null) => {
    if (id) router.push(`/dashboard?folder=${id}`);
    else router.push("/dashboard");
  };

  const openSheet = (sheet: Sheet) => {
    saveRecent({ id: sheet.id, title: sheet.title, folderId: sheet.folderId, openedAt: Date.now() });
    const path = `/sheet/${sheet.id}${currentFolder ? `?folder=${currentFolder}` : ""}`;
    router.push(path);
  };

  const handleCreateSheet = async () => {
    if (!user) return;
    const id = await createSheet(user.uid, "Névtelen táblázat", currentFolder);
    toast.success("Táblázat létrehozva!");
    const path = `/sheet/${id}${currentFolder ? `?folder=${currentFolder}` : ""}`;
    router.push(path);
  };

  // Import gomb: fájl feltöltése majd megnyitás
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const id = await createSheet(user.uid, file.name.replace(/\.[^.]+$/, ""), currentFolder);
    // A Sheet oldalon az ImportButton-t programozottan aktiváljuk
    // Egyelőre csak megnyitjuk a lapot
    toast.success("Táblázat létrehozva! Importáld a fájlt a szerkesztőben.");
    const path = `/sheet/${id}${currentFolder ? `?folder=${currentFolder}` : ""}`;
    router.push(path);
    if (importRef.current) importRef.current.value = "";
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
    removeRecentById([id]);
    setRecentSheets(getRecent());
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
      // Eltávolítjuk a törölt mappában lévő összes lapot a legutóbbiak közül
      removeRecentByFolder(id);
      setRecentSheets(getRecent());
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
    return (f.parentId || null) === currentFolder;
  });
  const filteredSheets = sheets.filter(s => {
    if (searchTerm) return s.title.toLowerCase().includes(searchTerm.toLowerCase());
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

  // Felhasználó neve a welcome sectionhoz
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
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "28px 48px 48px" }}>

        {/* ── VISSZAUGRÁS / LEGUTÓBB MEGNYITOTT ── */}
        {recentSheets.length > 0 && !searchTerm && !currentFolder && (
          <section style={{ marginBottom: 36 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <Clock size={15} color="#6b7280" />
              <h2 style={{ fontSize: 13, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>
                Visszaugrás
              </h2>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
              {recentSheets.slice(0, 4).map(r => (
                <div
                  key={r.id}
                  onClick={() => { saveRecent(r); router.push(`/sheet/${r.id}${r.folderId ? `?folder=${r.folderId}` : ""}`); }}
                  style={{
                    background: "#fff", borderRadius: 10, border: "1px solid #e5e7eb",
                    padding: "12px 14px", cursor: "pointer", display: "flex", alignItems: "center",
                    gap: 12, transition: "all 0.15s", boxShadow: "0 1px 3px rgba(0,0,0,0.04)"
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "#86efac"; (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "#e5e7eb"; (e.currentTarget as HTMLElement).style.boxShadow = "0 1px 3px rgba(0,0,0,0.04)"; }}
                >
                  <div style={{ background: "#f0fdf4", borderRadius: 8, padding: "8px", display: "flex", flexShrink: 0 }}>
                    <FileSpreadsheet size={20} color="#16a34a" />
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#111827", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {r.title}
                    </div>
                    <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>
                      {formatRelative(r.openedAt)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── BREADCRUMB + KERESŐ + KONTROLL SOR ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>

          {/* Bal: Breadcrumb */}
          <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
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
                      <div style={{ display: "flex", gap: 2, opacity: 0, transition: "opacity 0.15s" }} className="folder-actions">
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
                          {/* Előnézet terület */}
                          <div style={{ height: 110, background: "#f9fafb", borderBottom: "1px solid #f3f4f6", padding: "10px 10px 0", overflow: "hidden", position: "relative" }}>
                            {[0,1,2,3,4].map(ri => (
                              <div key={ri} style={{ display: "flex", gap: 2, marginBottom: 2 }}>
                                {[0,1,2,3,4].map(ci => {
                                  const val = sheet.previewData ? sheet.previewData[ri * 5 + ci] : "";
                                  return (
                                    <div key={ci} style={{
                                      background: ri === 0 || ci === 0 ? "#f3f4f6" : "#fff",
                                      border: "1px solid #e5e7eb", borderRadius: 2, overflow: "hidden",
                                      display: "flex", alignItems: "center", padding: "0 3px",
                                      height: 16, flex: ci === 0 ? "0 0 24px" : 1
                                    }}>
                                      <span style={{ fontSize: 7, color: ri === 0 || ci === 0 ? "#9ca3af" : "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                        {val}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            ))}
                            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 40, background: "linear-gradient(to top, #f9fafb, transparent)" }} />
                            {/* Hover akció gombok */}
                            <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 4, opacity: 0, transition: "opacity 0.15s" }} className="sheet-actions">
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
                          <div style={{ display: "flex", gap: 2, flexShrink: 0, opacity: 0, transition: "opacity 0.15s" }} className="sheet-actions">
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