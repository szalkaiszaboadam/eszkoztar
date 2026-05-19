// src/app/(app)/sheet/[id]/page.tsx
"use client";

import { useEffect, useState, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useAuthStore } from "@/lib/store";
import { useSheetStore } from "@/lib/sheetStore";
import { saveCells, loadSheetData, renameSheet, getSheets } from "@/lib/sheetsService";
import Grid from "@/components/sheet/Grid";
import FormulaBar from "@/components/sheet/FormulaBar";
import Toolbar from "@/components/sheet/Toolbar";
import SheetTabs from "@/components/sheet/SheetTabs";
import toast from "react-hot-toast";
import { Save, ArrowLeft, FileSpreadsheet, Loader2, Columns, X, GripVertical, AlertCircle, Cloud } from "lucide-react";
import ImportButton from "@/components/sheet/ImportButton";
import ExportButton from "@/components/sheet/ExportButton";

// ── SHEET CONTENT (Szerkesztő) ──
function SheetContent({ onToggleSplit, isSplit }: { onToggleSplit: () => void, isSplit: boolean }) {
    const { id } = useParams<{ id: string }>();
    const { user } = useAuthStore();
    const searchParams = useSearchParams();
    const folderId = searchParams.get("folder");

    const { title, setTitle, isDirty, setDirty, setAllTabData } = useSheetStore();

    const [saving, setSaving] = useState(false);
    const [editingTitle, setEditingTitle] = useState(false);
    const [isInitialLoading, setIsInitialLoading] = useState(true);

    const handleSave = async (silent = false) => {
        if (!user || !id) return;
        setSaving(true);
        try {
            const state = useSheetStore.getState();
            await saveCells(
                user.uid, id, state.cellsByTab, state.rowCountByTab,
                state.tabs, state.colWidthsByTab, state.rowHeightsByTab
            );
            setDirty(false);
            if (!silent) toast.success("Mentve!");
        } catch (error) {
            toast.error("Hiba történt a mentés során!");
        } finally {
            setSaving(false);
        }
    };

    useEffect(() => {
        if (!user || !id) return;
        const fetchData = async () => {
            try {
                const [sheets, data] = await Promise.all([
                    getSheets(user.uid), loadSheetData(user.uid, id)
                ]);
                const current = sheets.find((s) => s.id === id);
                if (current) {
                    setTitle(current.title);

                    // ZSENIÁLIS: Bárhonnan nyílik meg a tábla, a szerkesztő azonnal bejegyzi a legutóbbiakhoz!
                    try {
                        const recentItem = {
                            id: current.id,
                            title: current.title,
                            folderId: current.folderId || null,
                            openedAt: Date.now()
                        };
                        localStorage.setItem("mysheets_recent", JSON.stringify([recentItem]));
                    } catch (e) { console.error(e); }
                }

                setAllTabData(data);
            } catch (error) {
                toast.error("Nem sikerült betölteni a táblázatot.");
            } finally {
                setIsInitialLoading(false);
            }
        };
        fetchData();
    }, [user, id]);

    useEffect(() => {
        if (!isDirty) return;
        const timeoutId = setTimeout(() => handleSave(true), 1000);
        return () => clearTimeout(timeoutId);
    }, [isDirty]);

    useEffect(() => {
        const handler = (e: Event) => { e.preventDefault(); handleSave(false); };
        window.addEventListener("sheet-save", handler);
        return () => window.removeEventListener("sheet-save", handler);
    }, []);

    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (useSheetStore.getState().isDirty) {
                handleSave(true);
                e.preventDefault(); e.returnValue = "";
            }
        };
        window.addEventListener("beforeunload", handleBeforeUnload);
        return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    }, [handleSave]);

    const handleTitleSave = async () => {
        if (!user || !id || !title.trim()) return;
        await renameSheet(user.uid, id, title.trim());
        setEditingTitle(false);

        // Ha átnevezik a táblát, a legutóbbi kártyán is azonnal frissüljön a név
        try {
            const recentItem = {
                id,
                title: title.trim(),
                folderId: folderId || null,
                openedAt: Date.now()
            };
            localStorage.setItem("mysheets_recent", JSON.stringify([recentItem]));
        } catch (e) { console.error(e); }
    };

    return (
        <div className="h-full flex flex-col bg-white">
            {/* ── RESZPONZÍV HEADER ── */}
            {/* ── RESZPONZÍV HEADER ── */}
            <header
                className="flex items-center gap-1.5 px-3 py-2 border-b border-gray-200 bg-white shrink-0 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']"
                onWheel={(e) => {
                    if (e.deltaY !== 0) e.currentTarget.scrollLeft += e.deltaY;
                }}
            >
                <button
                    onClick={async () => {
                        if (useSheetStore.getState().isDirty) await handleSave(true);
                        const backPath = folderId ? `/dashboard?folder=${folderId}` : "/dashboard";
                        window.location.href = backPath;
                    }}
                    className="p-1.5 hover:bg-gray-100 rounded-lg transition shrink-0"
                    title="Vissza a dokumentumokhoz"
                >
                    <ArrowLeft className="w-4 h-4 text-gray-600" />
                </button>

                <div className="bg-green-600 rounded-md p-1 shrink-0">
                    <FileSpreadsheet className="w-4 h-4 text-white" />
                </div>

                {/* Cím vagy betöltés jelző (Összehúzódó) */}
                <div className="flex-1 min-w-[80px] px-1">
                    {editingTitle && !isInitialLoading ? (
                        <input
                            autoFocus value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            onBlur={handleTitleSave}
                            onKeyDown={(e) => { if (e.key === "Enter") handleTitleSave(); }}
                            className="font-semibold text-gray-800 border-b border-blue-400 focus:outline-none text-sm w-full max-w-[200px]"
                        />
                    ) : (
                        <span
                            className={`font-semibold text-sm truncate block transition ${isInitialLoading ? "text-gray-400" : "text-gray-800 cursor-pointer hover:text-blue-600"}`}
                            onClick={() => !isInitialLoading && setEditingTitle(true)}
                        >
                            {isInitialLoading ? "Betöltés..." : (title || "Névtelen táblázat")}
                        </span>
                    )}
                </div>

                {/* ── PROFI STÁTUSZ JELZŐ (Pill dizájn) ── */}
                <div className="flex items-center shrink-0 px-2">
                    {isInitialLoading || saving || isDirty ? (
                        <div className="flex items-center gap-1.5 text-xs font-medium text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-100 shadow-sm transition-all">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Mentés...
                        </div>
                    ) : (
                        <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100 shadow-sm transition-all">
                            <Cloud className="w-3.5 h-3.5" /> Mentve
                        </div>
                    )}
                </div>

                <div className="w-px h-5 bg-gray-200 shrink-0 mx-1" />

                <button
                    onClick={onToggleSplit}
                    title="Párhuzamos nézet megnyitása/bezárása"
                    className={`p-1.5 rounded-lg transition shrink-0 relative ${isSplit ? "bg-blue-100 text-blue-600" : "hover:bg-blue-50 hover:text-blue-600 text-gray-600"}`}
                >
                    <Columns className="w-4 h-4" />
                    {isSplit && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-blue-500 rounded-full border border-white" />}
                </button>
            </header>
            <div className={isInitialLoading ? "opacity-50 pointer-events-none" : ""}><Toolbar /></div>
            <div className={isInitialLoading ? "opacity-50 pointer-events-none" : ""}><FormulaBar /></div>

            {isInitialLoading ? (
                <div className="flex-1 flex flex-col items-center justify-center bg-gray-50/50">
                    <Loader2 className="w-8 h-8 text-green-500 animate-spin mb-3" />
                    <p className="text-sm font-medium text-gray-500">Adatok szinkronizálása...</p>
                </div>
            ) : (
                <>
                    <Grid />
                    <SheetTabs />
                </>
            )}
        </div>
    );
}

// ── FŐ OLDAL & OSZTOTT KÉPERNYŐ LOGIKA ──
export default function SheetPage() {
    const [isSplit, setIsSplit] = useState(false);
    const [splitWidth, setSplitWidth] = useState(50);
    const [isDragging, setIsDragging] = useState(false);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging) return;
            const newWidth = (e.clientX / window.innerWidth) * 100;
            if (newWidth > 20 && newWidth < 80) {
                setSplitWidth(newWidth);
            }
        };

        const handleMouseUp = () => {
            setIsDragging(false);
        };

        if (isDragging) {
            window.addEventListener("mousemove", handleMouseMove);
            window.addEventListener("mouseup", handleMouseUp);
        }

        return () => {
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mouseup", handleMouseUp);
        };
    }, [isDragging]);

    return (
        <div className="flex h-screen w-full overflow-hidden bg-gray-100">
            <div
                style={{ width: isSplit ? `${splitWidth}%` : '100%' }}
                className="h-full relative flex flex-col z-10"
            >
                <Suspense fallback={<div className="h-full w-full flex items-center justify-center text-gray-500">Betöltés...</div>}>
                    <SheetContent onToggleSplit={() => setIsSplit(!isSplit)} isSplit={isSplit} />
                </Suspense>
            </div>

            {isSplit && (
                <div
                    onMouseDown={() => setIsDragging(true)}
                    className={`relative w-1.5 flex items-center justify-center cursor-col-resize z-30 transition-colors duration-200
                        ${isDragging ? "bg-blue-500" : "bg-gray-200 hover:bg-blue-400"}`
                    }
                >
                    <div className="absolute flex items-center justify-center w-4 h-8 bg-white border border-gray-200 rounded shadow-sm text-gray-400 select-none pointer-events-none">
                        <GripVertical className="w-3 h-3" />
                    </div>
                </div>
            )}

            {isSplit && (
                <div
                    style={{ width: `${100 - splitWidth}%` }}
                    className="h-full flex flex-col relative bg-white z-20 shadow-[-10px_0_20px_-10px_rgba(0,0,0,0.1)]"
                >
                    {isDragging && <div className="absolute inset-0 z-50 cursor-col-resize" />}

                    {/* ── ÚJ: LEBEGŐ BEZÁRÓ GOMB ──
                        Eltávolítottuk a fix fejlécet, így az iframe 0px-nél kezdődik, tökéletes vonalban a bal oldallal!
                        A gombot top-[11px] és left-3 pozícióval hajszálpontosan beillesztettük az iframe belső oldalainak üres fejléc-paddingjébe. */}
                    <button
                        onClick={() => setIsSplit(false)}
                        className="absolute top-[11px] left-3 z-40 p-1.5 bg-white hover:bg-gray-50 border border-gray-200 text-gray-500 hover:text-red-600 rounded-lg shadow-md transition-all duration-200 cursor-pointer flex items-center justify-center"
                        title="Párhuzamos nézet bezárása"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>

                    <iframe
                        src="/dashboard"
                        className="w-full flex-1 border-none bg-gray-50"
                        title="Split View Dashboard"
                    />
                </div>
            )}
        </div>
    );
}