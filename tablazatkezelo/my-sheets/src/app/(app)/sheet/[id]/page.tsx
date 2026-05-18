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
import { Save, ArrowLeft, FileSpreadsheet, Loader2 } from "lucide-react";
import ImportButton from "@/components/sheet/ImportButton";
import ExportButton from "@/components/sheet/ExportButton";

function SheetContent() {
    const { id } = useParams<{ id: string }>();
    const { user } = useAuthStore();
    const router = useRouter();

    // URL-ből olvassuk a folder ID-t a visszalépéshez
    const searchParams = useSearchParams();
    const folderId = searchParams.get("folder");

    // ITT MÁR DEKLARÁLVA VAN AZ isDirty!
    const {
        title, setTitle, isDirty, setDirty, setAllTabData
    } = useSheetStore();

    const [saving, setSaving] = useState(false);
    const [editingTitle, setEditingTitle] = useState(false);
    const [isInitialLoading, setIsInitialLoading] = useState(true);

    // ── 1. handleSave FELJEBB MOZGATVA ──
    // Hogy a lenti useEffect-ek már lássák és tudják használni
    const handleSave = async (silent = false) => {
        if (!user || !id) return;
        setSaving(true); // Elindul a mentés jelzése

        try {
            const state = useSheetStore.getState();
            await saveCells(
                user.uid,
                id,
                state.cellsByTab,
                state.rowCountByTab,
                state.tabs,
                state.colWidthsByTab,
                state.rowHeightsByTab
            );
            setDirty(false);
            if (!silent) toast.success("Mentve!");
        } catch (error) {
            console.error("Mentési hiba:", error);
            toast.error("Hiba történt a mentés során!");
        } finally {
            setSaving(false); // Bármi történik (hiba vagy siker), a töltés jelző megáll!
        }
    };

    // ── 2. Adatok betöltése ──
    useEffect(() => {
        if (!user || !id) return;

        const fetchData = async () => {
            try {
                const [sheets, data] = await Promise.all([
                    getSheets(user.uid),
                    loadSheetData(user.uid, id)
                ]);

                const current = sheets.find((s) => s.id === id);
                if (current) setTitle(current.title);

                setAllTabData(data);
            } catch (error) {
                console.error("Hiba az adatok lekérésekor:", error);
                toast.error("Nem sikerült betölteni a táblázatot.");
            } finally {
                setIsInitialLoading(false);
            }
        };

        fetchData();
    }, [user, id]);

    // ── 3. A profi automatikus mentés (Debounce) ──
    useEffect(() => {
        if (!isDirty) return;

        const timeoutId = setTimeout(() => {
            handleSave(true);
        }, 1000);

        return () => clearTimeout(timeoutId);
    }, [isDirty]);

    // ── 4. Ctrl+S figyelése ──
    useEffect(() => {
        const handler = (e: Event) => {
            e.preventDefault();
            handleSave(false);
        };
        window.addEventListener("sheet-save", handler);
        return () => window.removeEventListener("sheet-save", handler);
    }, []);

    // ── 5. Oldal elhagyásának megakadályozása ÉS vészmentés ──
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            const isCurrentlyDirty = useSheetStore.getState().isDirty;

            if (isCurrentlyDirty) {
                handleSave(true);
                e.preventDefault();
                e.returnValue = "";
            }
        };

        window.addEventListener("beforeunload", handleBeforeUnload);
        return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    }, [handleSave]);

    const handleTitleSave = async () => {
        if (!user || !id || !title.trim()) return;
        await renameSheet(user.uid, id, title.trim());
        setEditingTitle(false);
    };

    return (
        <div className="h-screen flex flex-col bg-white">
            {/* Header */}
            <header className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 bg-white shrink-0">
                <button
                    onClick={async () => {
                        // 1. Megnézzük, van-e mentetlen változás (akár a legutolsó betű leütése óta)
                        if (isDirty) {
                            // 2. Kikényszerítjük a mentést és MEGVÁRJUK, amíg befejeződik!
                            await handleSave(true);
                        }

                        // 3. Csak azután lépünk vissza, hogy az adatok már biztosan a szerveren vannak
                        const backPath = folderId ? `/dashboard?folder=${folderId}` : "/dashboard";
                        window.location.href = backPath; //router.push(backPath);
                    }}
                    className="p-1.5 hover:bg-gray-100 rounded-lg transition"
                    title="Vissza a dokumentumokhoz"
                >
                    <ArrowLeft className="w-4 h-4 text-gray-600" />
                </button>

                <div className="bg-green-600 rounded-md p-1">
                    <FileSpreadsheet className="w-4 h-4 text-white" />
                </div>

                {/* Cím vagy betöltés jelző */}
                {editingTitle && !isInitialLoading ? (
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
                        className={`font-semibold text-sm transition ${isInitialLoading ? "text-gray-400" : "text-gray-800 cursor-pointer hover:text-blue-600"}`}
                        onClick={() => !isInitialLoading && setEditingTitle(true)}
                    >
                        {isInitialLoading ? "Betöltés..." : (title || "Névtelen táblázat")}
                    </span>
                )}

                <div className="flex-1" />

                {/* Státusz szöveg */}
                <span className="text-xs text-gray-400 hidden sm:block">
                    {isInitialLoading ? "Kapcsolódás..." : saving ? "Mentés..." : isDirty ? "● Nem mentett" : "✓ Mentve"}
                </span>

                <div className="w-px h-5 bg-gray-200" />

                <div className={isInitialLoading ? "opacity-50 pointer-events-none flex items-center" : "flex items-center"}>
                    <ImportButton />
                    <ExportButton />
                </div>

                <div className="w-px h-5 bg-gray-200" />

                <button
                    onClick={() => !isInitialLoading && handleSave(false)}
                    disabled={isInitialLoading}
                    title="Mentés (Ctrl+S)"
                    className={`p-1.5 rounded-lg transition ${isInitialLoading ? "text-gray-300" : "hover:bg-green-50 hover:text-green-600 text-gray-600"}`}
                >
                    <Save className="w-4 h-4" />
                </button>
            </header>

            {/* Toolbar - Fixen látszik */}
            <div className={isInitialLoading ? "opacity-50 pointer-events-none" : ""}>
                <Toolbar />
            </div>

            {/* Formula bar - Fixen látszik */}
            <div className={isInitialLoading ? "opacity-50 pointer-events-none" : ""}>
                <FormulaBar />
            </div>

            {/* Dinamikus tartalom (Vagy Grid vagy Töltőképernyő) */}
            {isInitialLoading ? (
                <div className="flex-1 flex flex-col items-center justify-center bg-gray-50/50">
                    <Loader2 className="w-8 h-8 text-green-500 animate-spin mb-3" />
                    <p className="text-sm font-medium text-gray-500">Adatok szinkronizálása...</p>
                </div>
            ) : (
                <>
                    {/* Grid */}
                    <Grid />

                    {/* Sheet fülek */}
                    <SheetTabs />
                </>
            )}
        </div>
    );
}

// Suspense csomagolás a useSearchParams miatt (kötelező Next.js kliens komponenseknél)
export default function SheetPage() {
    return (
        <Suspense fallback={<div className="h-screen w-full flex items-center justify-center text-gray-500">Betöltés...</div>}>
            <SheetContent />
        </Suspense>
    );
}