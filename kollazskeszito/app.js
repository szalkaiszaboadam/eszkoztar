
// --- BETÖLTŐKÉPERNYŐ LOGIKA ---
const appStartTime = performance.now();
let loadTimerInterval;

// Amint a HTML nagyja betöltött, indítjuk az órát és a szövegeket
document.addEventListener("DOMContentLoaded", () => {
    const timeEl = document.getElementById('loader-time');
    const statusEl = document.getElementById('loader-status');

    loadTimerInterval = setInterval(() => {
        if (timeEl) timeEl.innerText = ((performance.now() - appStartTime) / 1000).toFixed(1) + 's';
    }, 100);

    // Státuszszövegek animálása
    if (statusEl) {
        setTimeout(() => statusEl.innerText = "Kezelőfelület előkészítése...", 300);
        setTimeout(() => statusEl.innerText = "Adatbázis szinkronizálása...", 600);
    }
});

// Amikor a teljes oldal betöltött (vagy a böngésző végzett)
window.addEventListener('load', () => {
    // Garantáljuk, hogy legalább 1.2 másodpercig látszódjon a menő animáció
    const elapsed = performance.now() - appStartTime;
    const remainingTime = Math.max(0, 1200 - elapsed);

    setTimeout(() => {
        clearInterval(loadTimerInterval);
        const statusEl = document.getElementById('loader-status');
        const loaderEl = document.getElementById('initial-loader');

        if (statusEl) statusEl.innerText = "Kész!";

        // Fél másodperc múlva elegánsan elhalványítjuk a képernyőt
        setTimeout(() => {
            if (loaderEl) loaderEl.classList.add('hidden');
        }, 300);

    }, remainingTime);
});



// ── Theme Logic ──────────────────────────────────────────
const html = document.documentElement;

// Init: respect system preference
(function () {
    const saved = localStorage.getItem('kp-theme');
    const sys = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    html.setAttribute('data-theme', saved || sys);
    syncThemeIcons();
})();

function toggleTheme() {
    const current = html.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    localStorage.setItem('kp-theme', next);
    syncThemeIcons();
}

function syncThemeIcons() {
    const isDark = html.getAttribute('data-theme') === 'dark';
    const light = document.getElementById('themeIconLight');
    const dark = document.getElementById('themeIconDark');
    if (!light || !dark) return;
    light.style.display = isDark ? 'block' : 'none';
    dark.style.display = !isDark ? 'block' : 'none';
}




let hasUnsavedChanges = false;

// Átkapcsolja a gombot "Menteni kell" állapotba
function markAsUnsaved() {
    if (hasUnsavedChanges) return; // Ha már át van kapcsolva, nem terheljük a DOM-ot
    hasUnsavedChanges = true;
    const btn = document.getElementById('downloadBtn');
    if (btn) {
        btn.className = 'btn-compact needs-saving';
        btn.innerHTML = '<i data-lucide="download"></i><span>Mentés *</span>';
        if (window.lucide) refreshIcons();
    }
}

// Átkapcsolja a gombot "Mentve" állapotba
function markAsSaved() {
    hasUnsavedChanges = false;
    const btn = document.getElementById('downloadBtn');
    if (btn) {
        btn.className = 'btn-compact is-saved';
        btn.innerHTML = '<i data-lucide="check"></i><span>Mentve</span>';
        if (window.lucide) refreshIcons();
    }
}

function markAutoAsUnsaved() {
    const btn = document.getElementById('autoDownloadBtn');
    if (!btn) return;
    btn.style.cssText = 'height:36px;padding:0 16px;background:var(--accent-color)!important;color:#fff!important;border-color:transparent!important;box-shadow:0 2px 8px var(--accent-glow);';
    btn.innerHTML = '<i data-lucide="download"></i><span>Letöltés *</span>';
    if (window.lucide) refreshIcons();
}

function markAutoAsSaved() {
    const btn = document.getElementById('autoDownloadBtn');
    if (!btn) return;
    btn.style.cssText = 'height:36px;padding:0 16px;background:var(--bg-sunken)!important;color:var(--text-secondary)!important;border:1px solid var(--border-subtle)!important;';
    btn.innerHTML = '<i data-lucide="check"></i><span>Mentve</span>';
    if (window.lucide) refreshIcons();
}


/* --- GLOBÁLIS VÁLTOZÓK --- */
let originalImages = [];
let loadedImages = [];
let zoomLevels = [];
let imageOffsets = [];
let rotations = [];
let visibilities = [];
let renderHitBoxes = [];
let deletedImagesTrash = []; // <--- ÚJ: Kuka memóriája
let exportFormat = 'image/jpeg'; // Átállítva JPG-re
let exportQuality = 0.8;        // Átállítva 80%-ra
let isGridVisible = false;
let isSnapEnabled = true; // Alapértelmezés szerint bekapcsolva

let isSimplifiedEditingEnabled = false; // Alapértelmezésben KI van kapcsolva (tehát a haladó az alap)

function toggleSimplifiedEditing() {
    isSimplifiedEditingEnabled = document.getElementById('simplifiedEditingToggle').checked;
    localStorage.setItem('collage_simplified_editing', isSimplifiedEditingEnabled);
    updateVisualSelection();
    updateCanvasHUD();
}

let isGridFlipped = false;
let currentMode = 'grid';
let activeImageIndex = -1;

// Mozgatás változók
let isDraggingCanvas = false;
let dragStartMouseX = 0;
let dragStartMouseY = 0;
let dragStartImageX = 0;
let dragStartImageY = 0;
let isRenderPending = false;



/* --- GLOBÁLIS VÁLTOZÓK --- */
// ... a többi változó után ...
let selectedIndices = new Set(); // Ez tárolja a több kiválasztott képet

let activeSnapLines = { x: null, y: null }; // Aktuális piros vonalak helye
const SNAP_THRESHOLD = 10; // Távolság pixelben, aminél "ugrik" és tapad (pl. 10px)

let dragStartOffsets = []; // Ebben tároljuk el a képek helyzetét a kattintáskor


// --- TRANSFORM VEZÉRLŐ VÁLTOZÓK ---
let isDraggingHandle = null; // 'tl', 'tr', 'bl', 'br', 'rot'
let dragStartDist = 0;
let dragStartAngle = 0;
let dragStartZoom = 1;
let dragStartRot = 0;
const HANDLE_SIZE = 10; // A sarkok mérete pixelben


let dragStartZooms = []; // Csoportos méretezéshez
let dragStartRots = [];  // Csoportos forgatáshoz

let hasPushedStateForCurrentAction = false;
let isKeyMovingSession = false;


let currentDeltaRot = 0;
let currentDeltaZoom = 0;

let dragStartBoxCX = 0;
let dragStartBoxCY = 0;

let isSessionActive = false; // Alapból hamis, amíg nem választottunk módot

let activeHUDParam = null; // 'zoom', 'rotate' vagy null


let hudStartValues = { zoom: 1, rotate: 0 };

// Külön tárolók a két mód elrendezéseinek és előzményeinek
let layoutStates = {
    grid: { zoomLevels: [], imageOffsets: [], rotations: [], history: [], redo: [] },
    free: { zoomLevels: [], imageOffsets: [], rotations: [], history: [], redo: [] }
};

/* --- PERSISTENCE (MENTÉS) LOGIKA --- */
const DB_NAME = "KepszerkesztoDB";
const STORE_NAME = "munkaterulet";


function refreshIcons() {
    if (window.lucide) lucide.createIcons();
}




function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 2);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
    });
}


async function saveToPersistentStorage() {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    // Frissítjük a memóriában lévő állapotot a jelenlegi módhoz
    if (loadedImages.length > 0) {
        layoutStates[currentMode] = {
            zoomLevels: [...zoomLevels],
            imageOffsets: JSON.parse(JSON.stringify(imageOffsets)),
            rotations: [...rotations],
            visibilities: [...visibilities], // <--- ÚJ
            history: [...historyStack],
            redo: [...redoStack]
        };
    }

    const savedData = {
        allImageData: loadedImages.map((img, i) => ({
            src: img.src,
            uId: img.dataset.uId
        })),
        currentMode,
        isGridFlipped, // <--- ÚJ
        layoutStates, // Mindkét mód mentése
        // Biztonsági mentés a jelenlegi állapotról a legfelső szinten is
        zoomLevels: [...zoomLevels],
        imageOffsets: JSON.parse(JSON.stringify(imageOffsets)),
        rotations: [...rotations],
        visibilities: [...visibilities], // <--- ÚJ
        historyStack: [...historyStack],
        redoStack: [...redoStack],
        // ...
        visibilities: [...visibilities],
        historyStack: [...historyStack],
        redoStack: [...redoStack],
        // --- ÚJ RÉSZ ---
        trash: deletedImagesTrash.map(item => ({
            src: item.loaded.src,
            uId: item.loaded.dataset.uId,
            zoom: item.zoom,
            rotation: item.rotation,
            offset: { x: item.offset.x, y: item.offset.y },
            visible: item.visible
        })),
        // ---------------
        timestamp: Date.now()
    };

    store.put(savedData, "current_workspace");
}



async function clearPersistentStorage() {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.delete("current_workspace");
}


/* --- UNDO & REDO (VISSZAVONÁS ÉS ISMÉTLÉS) LOGIKA --- */
let historyStack = [];
let redoStack = []; // Új verem az ismétléshez
const MAX_HISTORY = 20;

function getCurrentState() {
    // Elmentjük a teljes képadat-struktúrát a visszavonáshoz
    const state = {
        images: loadedImages.map((img, i) => ({
            src: img.src,
            uId: img.dataset.uId,
            zoom: zoomLevels[i],
            rotation: rotations[i],
            offset: { x: imageOffsets[i].x, y: imageOffsets[i].y },
            visible: visibilities[i] // ÚJ: elmentjük, hogy látható-e
        })),
        // --- ÚJ: Kuka állapotának mentése ---
        trash: deletedImagesTrash.map(item => ({
            src: item.loaded.src,
            uId: item.loaded.dataset.uId,
            zoom: item.zoom,
            rotation: item.rotation,
            offset: { x: item.offset.x, y: item.offset.y },
            visible: item.visible
        })),
        currentMode: currentMode,
        isGridFlipped: isGridFlipped, // ÚJ: elmentjük a rács irányát
        activeImageIndex: activeImageIndex,
        selectedIndices: Array.from(selectedIndices)
    };
    return JSON.stringify(state);
}

function pushState() {
    const currentState = getCurrentState();

    // Ne mentsük el kétszer ugyanazt az állapotot egymás után
    if (historyStack.length > 0 && historyStack[historyStack.length - 1] === currentState) return;

    historyStack.push(currentState);
    redoStack = []; // Új műveletnél a redo ürül

    if (historyStack.length > MAX_HISTORY) {
        historyStack.shift();
    }

    updateHistoryButtonsUI();
    saveToPersistentStorage();

    markAsUnsaved(); // <--- ÚJ: Bármilyen módosítás történik, jelezzük
}

async function undo() {
    if (historyStack.length === 0) return;

    // Mentjük a JELENLEGI állapotot a Redo staccbe
    redoStack.push(getCurrentState());

    // Kivesszük az UTOLSÓ elmentett állapotot
    const lastState = historyStack.pop();
    await applyState(lastState);

    saveToPersistentStorage(); // Adatbázis szinkron
    markAsUnsaved(); // <--- ÚJ
}

async function redo() {
    if (redoStack.length === 0) return;

    // A jelenlegit elrakjuk az Undo-ba
    historyStack.push(getCurrentState());

    // Előre lépünk
    const nextState = redoStack.pop();
    await applyState(nextState);

    saveToPersistentStorage(); // Adatbázis szinkron
    markAsUnsaved(); // <--- ÚJ
}

async function applyState(stateJson) {
    if (!stateJson) return;
    const state = JSON.parse(stateJson);
    const overlay = document.getElementById('processingOverlay');
    if (overlay) overlay.style.display = 'flex';

    try {
        const newLoadedImages = [];
        const newOriginalImages = [];
        const newZoomLevels = [];
        const newRotations = [];
        const newImageOffsets = [];
        const newVisibilities = []; // ÚJ

        // ... itt van a régi for ciklus a normál képekre ...

        // --- ÚJ RÉSZ AZ APPLYSTATE FÜGGVÉNYBEN: Kuka visszatöltése ---
        const newTrash = [];
        if (state.trash) {
            for (const item of state.trash) {
                const img = await new Promise((resolve, reject) => {
                    const iObj = new Image();
                    iObj.onload = () => resolve(iObj);
                    iObj.onerror = reject;
                    iObj.src = item.src;
                });
                img.dataset.uId = item.uId;
                newTrash.push({
                    original: img,
                    loaded: img,
                    zoom: item.zoom,
                    offset: item.offset,
                    rotation: item.rotation,
                    visible: item.visible
                });
            }
        }
        deletedImagesTrash = newTrash;
        // --------------------------------------------------------------

        loadedImages = newLoadedImages;    

        for (const item of state.images) {
            const img = await new Promise((resolve, reject) => {
                const i = new Image();
                i.onload = () => resolve(i);
                i.onerror = reject;
                i.src = item.src;
            });
            img.dataset.uId = item.uId;

            newLoadedImages.push(img);
            newOriginalImages.push(img);
            newZoomLevels.push(item.zoom);
            newRotations.push(item.rotation);
            newImageOffsets.push(item.offset);
            newVisibilities.push(item.visible !== undefined ? item.visible : true); // ÚJ
        }

        loadedImages = newLoadedImages;
        originalImages = newOriginalImages;
        zoomLevels = newZoomLevels;
        rotations = newRotations;
        imageOffsets = newImageOffsets;
        visibilities = newVisibilities; // ÚJ
        currentMode = state.currentMode;
        isGridFlipped = state.isGridFlipped || false; // ÚJ
        activeImageIndex = state.activeImageIndex;
        selectedIndices = new Set(state.selectedIndices);

        updateUIControls(); // Ez most már látni fogja a helyes darabszámot!
        renderCollage(true);
        updateHistoryButtonsUI();

    } catch (err) {
        console.error("Hiba az állapot visszaállításakor:", err);
    } finally {
        if (overlay) overlay.style.display = 'none';
    }
}

// UI frissítése: gombok halványítása, ha nincs mit visszavonni/ismételni
function updateHistoryButtonsUI() {
    const uBtn = document.getElementById('undoBtn');
    const rBtn = document.getElementById('redoBtn');

    if (uBtn) {
        uBtn.style.opacity = historyStack.length > 0 ? "1" : "0.3";
        uBtn.style.pointerEvents = historyStack.length > 0 ? "auto" : "none";
    }
    if (rBtn) {
        rBtn.style.opacity = redoStack.length > 0 ? "1" : "0.3";
        rBtn.style.pointerEvents = redoStack.length > 0 ? "auto" : "none";
    }
}


window.onload = async function () {
    loadSavedSettings();
    const overlay = document.getElementById('processingOverlay');
    if (!overlay) return;

    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const request = store.get("current_workspace");


        request.onsuccess = async () => {
            const data = request.result;
            if (!data || !data.allImageData || data.allImageData.length === 0) {
                overlay.style.display = 'none';
                toggleView('start');
                return;
            }

            isSessionActive = true;
            overlay.style.display = 'flex';

            try {
                // 1. Állapotok visszatöltése
                layoutStates = data.layoutStates || layoutStates;
                currentMode = data.currentMode || 'grid';
                isGridFlipped = data.isGridFlipped || false; // <--- ÚJ

                const savedZoom = data.zoomLevels || (layoutStates[currentMode]?.zoomLevels) || [];
                const savedOffsets = data.imageOffsets || (layoutStates[currentMode]?.imageOffsets) || [];
                const savedRots = data.rotations || (layoutStates[currentMode]?.rotations) || [];
                const savedVis = data.visibilities || (layoutStates[currentMode]?.visibilities) || []; // <--- ÚJ

                historyStack = data.historyStack || (layoutStates[currentMode]?.history) || [];
                redoStack = data.redoStack || (layoutStates[currentMode]?.redo) || [];

                loadedImages = [];
                originalImages = [];
                zoomLevels = [];
                imageOffsets = [];
                rotations = [];
                visibilities = []; // <--- ÚJ (Ürítjük, hogy újra feltöltsük)

                // 2. Képek betöltése
                for (let i = 0; i < data.allImageData.length; i++) {
                    const item = data.allImageData[i];
                    try {
                        const img = await new Promise((resolve, reject) => {
                            const iObj = new Image();
                            iObj.onload = () => resolve(iObj);
                            iObj.onerror = reject;
                            iObj.src = item.src;
                        });
                        img.dataset.uId = item.uId;
                        loadedImages.push(img);
                        originalImages.push(img);

                        // Adatok hozzárendelése (vagy alapérték, ha hiányzik)
                        zoomLevels.push(savedZoom[i] !== undefined ? savedZoom[i] : 1.0);
                        imageOffsets.push(savedOffsets[i] || { x: 0, y: 0 });
                        rotations.push(savedRots[i] || 0);
                        visibilities.push(savedVis[i] !== undefined ? savedVis[i] : true); // <--- ÚJ
                    } catch (e) { console.error("Hiba egy képnél"); }
                }

                // --- ÚJ RÉSZ: KUKA ADATBÁZIS VISSZATÖLTÉSE ---
                const savedTrash = data.trash || [];
                deletedImagesTrash = [];
                for (let i = 0; i < savedTrash.length; i++) {
                    const item = savedTrash[i];
                    try {
                        const img = await new Promise((resolve, reject) => {
                            const iObj = new Image();
                            iObj.onload = () => resolve(iObj);
                            iObj.onerror = reject;
                            iObj.src = item.src;
                        });
                        img.dataset.uId = item.uId;
                        deletedImagesTrash.push({
                            original: img, loaded: img, zoom: item.zoom, offset: item.offset, rotation: item.rotation, visible: item.visible
                        });
                    } catch (e) { console.error("Hiba kuka képnél"); }
                }
                // ---------------------------------------------

                // 3. Felület frissítése
                toggleView('editor');
                document.querySelectorAll('.mode-option').forEach(el => el.classList.remove('active'));
                document.getElementById(`mode-${currentMode}`)?.classList.add('active');

                snapCanvasSizeToGrid();
                setupCanvasInteractions();
                updateHistoryButtonsUI();
                updateUIControls();
                renderCollage();

            } finally {
                overlay.style.display = 'none';
            }
        };

        request.onerror = () => {
            overlay.style.display = 'none';
            toggleView('start');
        };

    } catch (err) {
        console.error("Adatbázis hiba:", err);
        overlay.style.display = 'none';
        toggleView('start');
    }

    window.addEventListener('resize', snapCanvasSizeToGrid);
    setTimeout(snapCanvasSizeToGrid, 100);
};




/* --- OKOS CLICK OUTSIDE LOGIKA --- */
document.addEventListener('mousedown', (e) => {
    if (activeImageIndex === -1) return;

    if (e.target.closest('.modern-hud')) return;
    if (e.target.closest('.sidebar')) return; // Ez javítja meg a réteg gombokat!
    if (e.target.closest('.secondary-header')) return;

    const target = e.target;
    const canvas = document.getElementById('collageCanvas');
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (2000 / rect.width);
    const my = (e.clientY - rect.top) * (2000 / rect.height);

    // 1. ELLENŐRZÉS: Fogantyút találtunk-e? (Vásznon kívül is!)
    const box = renderHitBoxes.find(b => b.index === activeImageIndex);
    const handle = getHandleAtMouse(mx, my, box);
    if (handle) return; // Ha fogantyúra kattintasz, NE csinálj semmit (marad a kijelölés)

    // 2. ELLENŐRZÉS: Képet találtunk-e?
    const hit = getHitFromCoords(mx, my);
    if (hit.index !== -1) return; // Ha képre kattintasz, marad

    // 3. ELLENŐRZÉS: Védett UI elemek (Toolbar, Sidebar kártyák, Gombok)
    if (target.closest('#floating-toolbar') ||
        target.closest('.edit-card') ||
        target.closest('.secondary-header') ||
        target.tagName === 'BUTTON' ||
        target.tagName === 'INPUT' ||
        target.tagName === 'LABEL') {
        return;
    }

    // Ha egyik sem teljesül, akkor tényleg a "semmibe" kattintottál
    deselectImage();
});

/* --- BEÁLLÍTÁSOK BETÖLTÉSE (SNAP NÉLKÜL) --- */
function loadSavedSettings() {
    // 1. Háttér eltávolítás (Remove BG) betöltése
    const savedRemoveBg = localStorage.getItem('collage_remove_bg');
    const removeBgEl = document.getElementById('removeBgToggle');
    if (removeBgEl) {
        removeBgEl.checked = savedRemoveBg === null ? true : savedRemoveBg === 'true';
    }
    const savedSnap = localStorage.getItem('collage_snap_enabled');
    if (savedSnap !== null) {
        isSnapEnabled = (savedSnap === 'true');
        document.getElementById('snapToggle').checked = isSnapEnabled;
    }

    // 2. Rács Engedélyezés (Grid Enabled) betöltése
    const savedGridEnabled = localStorage.getItem('collage_grid_enabled');
    // Alapértelmezett: FALSE (kikapcsolva), ha nincs mentett adat
    isGridVisible = savedGridEnabled === null ? false : (savedGridEnabled === 'true');

    const savedSimplified = localStorage.getItem('collage_simplified_editing');
    // Alapértelmezett: FALSE (kikapcsolva = haladó mód az alap), ha nincs mentett adat
    isSimplifiedEditingEnabled = savedSimplified === null ? false : (savedSimplified === 'true');
    const simpEl = document.getElementById('simplifiedEditingToggle');
    if (simpEl) simpEl.checked = isSimplifiedEditingEnabled;

    // Kapcsoló UI beállítása
    const gridToggle = document.getElementById('gridToggle');
    if (gridToggle) {
        gridToggle.checked = isGridVisible;
    }

    // Léptető gombok vizuális állapota (aktív / inaktív)
    const stepperGroup = document.getElementById('grid-stepper-group');
    if (stepperGroup) {
        stepperGroup.style.opacity = isGridVisible ? '1' : '0.3';
        stepperGroup.style.pointerEvents = isGridVisible ? 'auto' : 'none';
    }

    // 3. Rács Méret (Grid Size) betöltése és ELLENŐRZÉSE
    const savedGridSize = localStorage.getItem('collage_grid_size');
    let currentSize = savedGridSize !== null ? parseInt(savedGridSize) : 4; // Alapértelmezés: 4

    // BIZTONSÁGI ELLENŐRZÉS:
    // Ha a mentett érték nincs benne az engedélyezett (páros) listában (pl. régen 5 volt),
    // vagy sérült az adat, akkor visszaállítjuk a stabil 4-esre.
    // (Feltételezzük, hogy a GRID_VALUES tömb már létezik a kódban)
    if (typeof GRID_VALUES !== 'undefined' && !GRID_VALUES.includes(currentSize)) {
        currentSize = 4;
    }

    // Input érték beállítása
    const sliderInput = document.getElementById('gridSizeSlider');
    if (sliderInput) sliderInput.value = currentSize;

    // Szöveg kiírása (pl. "4 egység")
    const display = document.getElementById('stepperDisplay');
    if (display) {
        display.innerText = currentSize + ' egység';
    }

    // --- ÚJ RÉSZ: Háttér stílus betöltése ---
    const savedBg = localStorage.getItem('collage_preview_bg') || 'white'; // Alapértelmezett a fehér
    const bgRadio = document.querySelector(`input[name="previewBg"][value="${savedBg}"]`);

    if (bgRadio) {
        bgRadio.checked = true;
        // Meghívjuk a függvényt, hogy a CSS osztályokat is rátegye a vászonra
        updatePreviewBg();
    }

    // --- ÚJ RÉSZ: Export beállítások betöltése ---
    const savedFormat = localStorage.getItem('collage_export_format');
    if (savedFormat) exportFormat = savedFormat;

    const savedQuality = localStorage.getItem('collage_export_quality');
    if (savedQuality) exportQuality = parseFloat(savedQuality);

    const formatSelect = document.getElementById('exportFormatSelect');
    const qualitySlider = document.getElementById('exportQualitySlider');
    const qualityContainer = document.getElementById('exportQualityContainer');
    const qualityVal = document.getElementById('exportQualityVal');

    if (formatSelect) formatSelect.value = exportFormat;
    if (qualitySlider) qualitySlider.value = exportQuality;
    if (qualityVal) qualityVal.innerText = Math.round(exportQuality * 100) + '%';

    // A PNG nem támogat minőség-állítást, így eltüntetjük a csúszkát, ha az van kiválasztva
    if (qualityContainer) {
        qualityContainer.style.display = (exportFormat === 'image/png') ? 'none' : 'flex';
    }

    // 4. Rács tényleges kirajzolása a beállítások alapján
    updateGridSettings();
}






function setMode(mode) {
    if (currentMode === mode) return;

    if (loadedImages.length > 0) {
        layoutStates[currentMode] = {
            zoomLevels: [...zoomLevels],
            imageOffsets: JSON.parse(JSON.stringify(imageOffsets)),
            rotations: [...rotations],
            visibilities: [...visibilities], // <--- ÚJ
            history: [...historyStack],
            redo: [...redoStack]
        };
    }

    currentMode = mode;

    document.querySelectorAll('.mode-option').forEach(el => el.classList.remove('active'));
    document.getElementById(`mode-${mode}`)?.classList.add('active');

    if (loadedImages.length > 0) {
        if (layoutStates[mode].zoomLevels.length > 0) {
            zoomLevels = [...layoutStates[mode].zoomLevels];
            imageOffsets = JSON.parse(JSON.stringify(layoutStates[mode].imageOffsets));
            rotations = [...layoutStates[mode].rotations];
            visibilities = layoutStates[mode].visibilities ? [...layoutStates[mode].visibilities] : loadedImages.map(() => true); // <--- ÚJ
            historyStack = [...layoutStates[mode].history];
            redoStack = [...layoutStates[mode].redo];
        } else {
            resetPositionsForMode();
            historyStack = [];
            redoStack = [];
        }

        updateUIControls();
        updateHistoryButtonsUI();
        renderCollage();
        // AZONNALI FRISSÍTÉS MÓDVÁLTÁSKOR:
        updateCanvasHUD();
        saveToPersistentStorage();
    }
}




function resetPositionsForMode() {
    // Csak akkor fusson, ha van képünk
    if (loadedImages.length === 0) return;

    imageOffsets = loadedImages.map(() => ({ x: 0, y: 0 }));
    rotations = loadedImages.map(() => 0);
    zoomLevels = loadedImages.map(() => currentMode === 'free' ? 0.8 : 1.0);
}



document.addEventListener('DOMContentLoaded', () => {
    setupDropZone(document.getElementById('dropZone'));
    setupDropZone(document.getElementById('sidebarDropZone'));
    // toggleView('start');  <-- EZT TÖRÖLD KI, mert ez mindig visszadob a startra!
    refreshIcons();
    setupSidebarDrop();

    if (typeof lucide !== 'undefined') refreshIcons();
    syncThemeIcons();
});

// Segédfüggvény a drop zónák beállításához
function setupDropZone(element) {
    if (!element) return;

    // --- KATTINTÁS KEZELÉSE ---
    element.addEventListener('click', () => {
        const fileInput = document.getElementById('imageInput');
        if (fileInput) {
            fileInput.click();
        }
    });

    // --- DRAG & DROP KEZELÉSE ---
    element.addEventListener('dragover', (e) => {
        e.preventDefault();
        element.classList.add('drag-over');
    });

    element.addEventListener('dragleave', () => {
        element.classList.remove('drag-over');
    });

    element.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        element.classList.remove('drag-over');
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFiles(e.dataTransfer.files);
        }
    });
}


const MAX_IMAGES_LIMIT = 30; // Állítsd be a kívánt maximumot (pl. 15-20)

async function handleFiles(fileList) {
    let files = Array.from(fileList);
    if (files.length === 0) return;

    // --- ÚJ: Képszám biztonsági korlátozása ---
    if (loadedImages.length + files.length > MAX_IMAGES_LIMIT) {
        const remainingSpace = MAX_IMAGES_LIMIT - loadedImages.length;

        if (remainingSpace <= 0) {
            alert(`Elérted a maximális limitet (${MAX_IMAGES_LIMIT} kép)! Kérlek, törölj párat a vászonról, mielőtt újat töltesz fel.`);
            document.getElementById('imageInput').value = '';
            return; // Megállítjuk a folyamatot
        } else {
            alert(`Figyelem! A böngésző stabilitása érdekében maximum ${MAX_IMAGES_LIMIT} kép engedélyezett. A kiválasztott képekből csak az első ${remainingSpace} darabot adtuk hozzá.`);
            files = files.slice(0, remainingSpace); // Levágjuk a többletet a listáról
        }
    }
    // ------------------------------------------

    const overlay = document.getElementById('processingOverlay');
    if (overlay) overlay.style.display = 'flex';

    try {
        const newImages = await Promise.all(files.map(file => new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    img.dataset.uId = 'img-' + Date.now() + '-' + Math.floor(Math.random() * 1000000);
                    resolve(img);
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        })));

        let processedNewImages;
        const removeBgChecked = document.getElementById('removeBgToggle')?.checked;

        if (removeBgChecked) {
            processedNewImages = await processImagesBackground(newImages);
            processedNewImages.forEach((img, idx) => {
                img.dataset.uId = newImages[idx].dataset.uId;
            });
        } else {
            processedNewImages = [...newImages];
        }

        // Adatok hozzáadása a globális tömbökhöz
        originalImages.push(...newImages);
        loadedImages.push(...processedNewImages);

        const defaultZoom = currentMode === 'free' ? 0.8 : 1.0;
        processedNewImages.forEach(() => {
            zoomLevels.push(defaultZoom);
            rotations.push(0);
            imageOffsets.push({ x: 0, y: 0 });
            visibilities.push(true);
        });

        // Átváltás a módválasztóra
        document.getElementById('upload-step').classList.add('d-none');
        document.getElementById('mode-selection-step').classList.remove('d-none');
        renderUploadPreview();

        // UI frissítése
        updateUIControls();
        renderCollage();
        markAsUnsaved();

    } catch (error) {
        console.error("Részletes hiba:", error);
        alert("Hiba történt a képek feldolgozása közben. Ellenőrizd a konzolt!");
    } finally {
        if (overlay) overlay.style.display = 'none';
        document.getElementById('imageInput').value = '';
    }
}


function renderUploadPreview() {
    const grid = document.getElementById('upload-preview-grid');
    if (!grid) return;
    grid.innerHTML = '';

    loadedImages.forEach((img, index) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'upload-preview-item';

        const thumb = document.createElement('img');
        thumb.src = img.src;
        thumb.className = 'upload-preview-thumb';

        const delBtn = document.createElement('button');
        delBtn.className = 'upload-preview-del';
        delBtn.innerHTML = '×';
        delBtn.title = 'Eltávolítás';
        delBtn.onclick = () => {
            loadedImages.splice(index, 1);
            originalImages.splice(index, 1);
            zoomLevels.splice(index, 1);
            imageOffsets.splice(index, 1);
            rotations.splice(index, 1);
            visibilities.splice(index, 1);

            if (loadedImages.length === 0) {
                document.getElementById('mode-selection-step').classList.add('d-none');
                document.getElementById('upload-step').classList.remove('d-none');
                return;
            }

            renderUploadPreview();
        };

        wrapper.appendChild(thumb);
        wrapper.appendChild(delBtn);
        grid.appendChild(wrapper);
    });
    updateAutoModeCard();
}


function updateAutoModeCard() {
    const autoCard = document.querySelector('.mode-card[onclick="finalizeModeSelection(\'auto\')"]');
    if (!autoCard) return;

    const tooMany = loadedImages.length > 6;
    autoCard.classList.toggle('disabled', tooMany);

    const existing = autoCard.querySelector('.mode-card-limit-badge');
    if (existing) existing.remove();

    if (tooMany) {
        const badge = document.createElement('span');
        badge.className = 'mode-card-limit-badge';
        badge.textContent = 'Max. 6 kép';
        autoCard.appendChild(badge);
    }
}

// A régi initCollage most már csak egy híd a handleFiles felé
function initCollage() {
    const input = document.getElementById('imageInput');
    handleFiles(input.files);
}

async function toggleBackgroundRemoval() {
    // Ha már folyamatban van egy vágás, ne engedjük újra elindítani
    const overlay = document.getElementById('processingOverlay');
    if (overlay && overlay.style.display === 'flex') return;

    localStorage.setItem('collage_remove_bg', document.getElementById('removeBgToggle').checked);
    if (originalImages.length === 0) return;

    // pushState(); 
    // Mentünk egy pontot a visszavonáshoz

    if (overlay) overlay.style.display = 'flex';

    // Kis szünetet hagyunk a UI-nak, hogy megjelenítse a töltőt
    await new Promise(r => setTimeout(r, 100));

    try {
        if (document.getElementById('removeBgToggle').checked) {
            loadedImages = await processImagesBackground(originalImages);
        } else {
            // Fontos: Újraalkotjuk a tömböt az eredetikből
            loadedImages = [...originalImages];
        }
        renderCollage();
        saveToPersistentStorage();
    } catch (err) {
        console.error("Hiba a háttérvágásnál:", err);
    } finally {
        if (overlay) overlay.style.display = 'none';
    }
}


async function processImagesBackground(images) {
    const results = [];
    const statusEl = document.getElementById('loader-status');

    for (const img of images) {
        try {
            if (statusEl) statusEl.innerText = "Háttér eltávolítása...";

            // 1. Lefuttatjuk a te saját pixel-alapú háttérvágódat
            const tempImgFallback = await removeBgFallback(img);

            // 2. Szorosan körbevágjuk a tárgyat (hogy a hitbox tökéletes legyen)
            const croppedFallback = await cropToVisible(tempImgFallback);

            croppedFallback.dataset.uId = img.dataset.uId;
            results.push(croppedFallback);

        } catch (err) {
            console.error('Hiba a háttérvágásnál:', err);
            // Ha valami nagyon félremegy, inkább adjuk vissza az eredeti képet, minthogy lefagyjon
            results.push(img);
        }
    }

    if (statusEl) statusEl.innerText = ""; // Szöveg eltüntetése a végén
    return results;
}


async function removeBgFallback(img) {
    return new Promise(resolve => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // Kíméletlen, "baltával faragott" módszer: ami fehér, az kuka.
        // Nincs élsimítás, így nincsenek láthatatlan szellem-pixelek sem!
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2];

            // Ha a pixel majdnem teljesen fehér (240 felett), akkor 100%-ig átlátszó lesz (alpha = 0)
            if (r > 240 && g > 240 && b > 240) {
                data[i + 3] = 0;
            }
        }

        ctx.putImageData(imageData, 0, 0);

        const newImg = new Image();
        newImg.dataset.uId = img.dataset.uId;
        newImg.onload = () => resolve(newImg);
        newImg.src = canvas.toDataURL();
    });
}

// --- ÚJ SEGÉDFÜGGVÉNY: Körülvágja a képet a látható pixelek mentén ---
function cropToVisible(imageOrCanvas) {
    return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        canvas.width = imageOrCanvas.width;
        canvas.height = imageOrCanvas.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(imageOrCanvas, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0;
        let hasVisiblePixels = false;

        // Végigmegyünk az összes pixelen, és keressük azokat, amik nem átlátszóak
        for (let y = 0; y < canvas.height; y++) {
            for (let x = 0; x < canvas.width; x++) {
                const alpha = data[(y * canvas.width + x) * 4 + 3];
                if (alpha > 10) { // 10 a tolerancia az átlátszóságra
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                    hasVisiblePixels = true;
                }
            }
        }

        // Ha a kép teljesen átlátszó lenne valami hiba miatt, adjuk vissza az eredetit
        if (!hasVisiblePixels) {
            resolve(imageOrCanvas);
            return;
        }

        // Kiszámoljuk az új szélességet és magasságot (hagyunk 2 pixel "biztonsági ráhagyást")
        const padding = 0;
        minX = Math.max(0, minX - padding);
        minY = Math.max(0, minY - padding);
        maxX = Math.min(canvas.width - 1, maxX + padding);
        maxY = Math.min(canvas.height - 1, maxY + padding);

        const cropW = maxX - minX + 1;
        const cropH = maxY - minY + 1;

        // Létrehozunk egy új, már kisebb vásznat a kivágott tartalomnak
        const croppedCanvas = document.createElement('canvas');
        croppedCanvas.width = cropW;
        croppedCanvas.height = cropH;
        croppedCanvas.getContext('2d').drawImage(canvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);

        // Visszaalakítjuk Image objektummá
        const newImg = new Image();
        newImg.onload = () => resolve(newImg);
        newImg.src = croppedCanvas.toDataURL();
    });
}


// --- BEÁLLÍTÁSOK MENÜ KEZELÉSE ---
function toggleSettingsMenu(event) {
    if (event) event.stopPropagation();
    const popover = document.getElementById('settingsPopover');
    if (popover) {
        popover.classList.toggle('active');
    }
}

// Bezárás, ha máshova kattintunk
document.addEventListener('click', (e) => {
    const popover = document.getElementById('settingsPopover');
    const settingsBtn = document.getElementById('settingsBtn');
    if (popover && popover.classList.contains('active')) {
        if (!popover.contains(e.target) && !settingsBtn.contains(e.target)) {
            popover.classList.remove('active');
        }
    }
});

async function resetCollage() {
    if (!confirm("Biztosan törölni szeretnéd a teljes munkaterületet és az összes előzményt?")) return;

    // 1. Minden aktív változó azonnali ürítése
    deletedImagesTrash = [];
    originalImages = [];
    loadedImages = [];
    zoomLevels = [];
    imageOffsets = [];
    rotations = [];
    visibilities = [];
    renderHitBoxes = [];
    selectedIndices.clear();
    activeImageIndex = -1;

    // 2. Globális előzmények (Undo/Redo) azonnali ürítése
    historyStack = [];
    redoStack = [];

    // 3. A két mód külön memóriájának (layoutStates) teljes alaphelyzetbe állítása
    layoutStates = {
        grid: { zoomLevels: [], imageOffsets: [], rotations: [], history: [], redo: [] },
        free: { zoomLevels: [], imageOffsets: [], rotations: [], history: [], redo: [] }
    };

    // 4. UI frissítése (gombok elszürkítése)
    updateHistoryButtonsUI();
    updateUIControls();

    // 5. ADATBÁZIS AZONNALI ÜRÍTÉSE ÉS SZINKRONIZÁLÁSA
    // Nem csak töröljük, hanem egy üres objektumot mentünk rá, hogy biztosan ne maradjon szemét
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    await store.clear(); // Teljes ürítés az IndexedDB-ben

    // 6. Vászon letakarítása
    const canvas = document.getElementById('collageCanvas');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    // 7. Vissza a kezdőképernyőre
    toggleView('start');
    document.getElementById('upload-step').classList.remove('d-none'); // Mutassuk a feltöltőt
    document.getElementById('mode-selection-step').classList.add('d-none'); // Rejtsük a módválasztót
    //showToast("Minden adat és előzmény törölve", "trash-2", "#ff4d4f");
}



// 1. KÉP TÖRLÉSE KUKÁVAL
function removeImage(index) {
    pushState();

    // Mentés a kukába
    deletedImagesTrash.push({
        original: originalImages[index],
        loaded: loadedImages[index],
        zoom: zoomLevels[index],
        offset: { x: imageOffsets[index].x, y: imageOffsets[index].y },
        rotation: rotations[index],
        visible: visibilities[index]
    });

    loadedImages.splice(index, 1);
    originalImages.splice(index, 1);
    zoomLevels.splice(index, 1);
    imageOffsets.splice(index, 1);
    rotations.splice(index, 1);
    visibilities.splice(index, 1); 

    const newSelected = new Set();
    selectedIndices.forEach(idx => {
        if (idx < index) newSelected.add(idx);
        else if (idx > index) newSelected.add(idx - 1);
    });

    if (activeImageIndex === index) {
        if (newSelected.size > 0) activeImageIndex = newSelected.values().next().value;
        else activeImageIndex = -1;
    } else if (activeImageIndex > index) {
        activeImageIndex--;
    }

    selectedIndices = newSelected;

    updateUIControls();
    renderCollage();
}

// 2. CSOPORTOS TÖRLÉS KUKÁVAL
function deleteSelectedImages() {
    const indicesToDelete = Array.from(selectedIndices).sort((a, b) => b - a);

    indicesToDelete.forEach(index => {
        // Mentés a kukába
        deletedImagesTrash.push({
            original: originalImages[index],
            loaded: loadedImages[index],
            zoom: zoomLevels[index],
            offset: { x: imageOffsets[index].x, y: imageOffsets[index].y },
            rotation: rotations[index],
            visible: visibilities[index]
        });

        loadedImages.splice(index, 1);
        originalImages.splice(index, 1);
        zoomLevels.splice(index, 1);
        imageOffsets.splice(index, 1);
        rotations.splice(index, 1);
        visibilities.splice(index, 1);
    });

    selectedIndices.clear();
    activeImageIndex = -1;
    updateUIControls();
    renderCollage();
}

// 3. UI FRISSÍTÉSE (Ez rajzolja ki a kukát is a legvégén!)
function updateUIControls(fullRefresh = true) {
    if (!fullRefresh) return;

    const sliderContainer = document.getElementById('sliders-container');
    const slidersArea = document.getElementById('sliders-area');
    const canvasWrapper = document.getElementById('canvas-wrapper');
    const layoutControls = document.getElementById('layout-controls');
    const downloadBtn = document.getElementById('downloadBtn');
    const shuffleBtn = document.getElementById('shuffleBtn');
    const selectAllBtn = document.getElementById('selectAllBtn');
    const addBtnHeader = document.getElementById('addImagesHeaderBtn');

    if (!sliderContainer || !slidersArea) return;

    if (canvasWrapper) canvasWrapper.style.display = 'block';
    if (downloadBtn) downloadBtn.style.display = 'inline-flex';

    if (loadedImages.length === 0) {
        slidersArea.style.display = 'flex';
        if (shuffleBtn) shuffleBtn.style.display = 'none';
        if (layoutControls) layoutControls.style.display = 'none';
        if (selectAllBtn) selectAllBtn.style.display = 'none';
        if (addBtnHeader) addBtnHeader.classList.add('pulse-button');

        sliderContainer.innerHTML = `
            <div class="pulse-border" onclick="document.getElementById('imageInput').click()" style="display: flex; flex-direction: column; justify-content: center; align-items: center; flex: 1; min-height: 200px; padding: 20px; text-align: center; color: var(--ui-accent); font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; border: 2px dashed var(--ui-accent); border-radius: 8px; margin: 0 5px 10px 5px; cursor: pointer; transition: all 0.3s ease;">
                <i data-lucide="image-plus" style="width: 32px; height: 32px; margin-bottom: 15px;"></i>
                Kattintson ide vagy a fenti gombra<br>új képek betöltéséhez
            </div>
        `;
        if (window.lucide) refreshIcons();
        updateScrollFades();
        renderTrashUI(); // Kuka rajzolása üres állapotnál is
        return;
    }

    if (addBtnHeader) addBtnHeader.classList.remove('pulse-button');
    slidersArea.style.display = 'flex';

    const visibleCount = visibilities.filter(v => v !== false).length;

    if (layoutControls) {
        layoutControls.style.display = (currentMode === 'grid' && visibleCount > 1) ? 'flex' : 'none';
        const gridOption = document.querySelector('input[name="layout"][value="grid"]');
        const gridLabel = gridOption?.closest('label');
        if (gridLabel) gridLabel.style.display = visibleCount === 2 ? 'none' : '';

        if (visibleCount === 2 && gridOption?.checked) {
            const horizontal = document.querySelector('input[name="layout"][value="horizontal"]');
            if (horizontal) { horizontal.checked = true; renderCollage(); }
        }
    }

    if (shuffleBtn) shuffleBtn.style.display = (currentMode !== 'free' && visibleCount > 1) ? 'inline-flex' : 'none';
    if (selectAllBtn) selectAllBtn.style.display = (loadedImages.length >= 2) ? 'inline-flex' : 'none';

    const flipBtn = document.getElementById('flipLayoutBtn');
    if (flipBtn) flipBtn.style.display = (currentMode === 'grid' && visibleCount > 2 && visibleCount % 2 !== 0) ? 'inline-flex' : 'none';

    sliderContainer.innerHTML = '';

    if (selectedIndices.size > 1) {
        const batchHeader = document.createElement('div');
        batchHeader.className = 'batch-header';
        batchHeader.style.cssText = 'display: flex; gap: 6px; margin-bottom: 8px;';
        batchHeader.innerHTML = `
            <button class="btn-batch" style="flex:1; justify-content:center;" onclick="batchToggleVisibilitySelected()" title="Kijelöltek elrejtése/megjelenítése"><i data-lucide="eye"></i></button>
            <button class="btn-batch" style="flex:1; justify-content:center;" onclick="batchResetSelected()"><i data-lucide="rotate-ccw"></i></button>
            <button class="btn-batch del" style="flex:1; justify-content:center;" onclick="batchDeleteSelected()"><i data-lucide="trash-2"></i></button>
        `;
        sliderContainer.appendChild(batchHeader);
    }

    loadedImages.forEach((img, index) => {
        const isPrimary = (index === activeImageIndex);
        const isSelected = selectedIndices.has(index);
        const isHidden = visibilities[index] === false;

        const card = document.createElement('div');
        card.className = `edit-card ${isPrimary ? 'active' : (isSelected ? 'selected' : '')}`;
        card.dataset.index = index;
        card.draggable = true;

        card.addEventListener('dragstart', handleDragStart);
        card.addEventListener('dragover', handleDragOver);
        card.addEventListener('dragleave', handleDragLeave);
        card.addEventListener('drop', handleDrop);
        card.addEventListener('click', (e) => selectImageFromSidebar(index, e));

        card.innerHTML = `
            <div class="edit-card-header">
                <div class="edit-thumb-container" style="opacity: ${isHidden ? '0.3' : '1'};">
                    <img src="${img.src}" class="edit-thumb" draggable="false">
                </div>
                <span class="edit-card-title" style="text-decoration: ${isHidden ? 'line-through' : 'none'}; color: ${isHidden ? 'var(--text-muted)' : 'var(--text-main)'}">${index + 1}. kép</span>
                <div style="display: flex; gap: 4px;">
                    <button class="btn-reset-icon" ${selectedIndices.size > 1 && isSelected ? 'disabled' : `onclick="event.stopPropagation(); toggleVisibility(${index})"`} title="${isHidden ? 'Megjelenítés' : 'Elrejtés'}"><i data-lucide="${isHidden ? 'eye-off' : 'eye'}"></i></button>
                    <button class="btn-reset-icon" ${selectedIndices.size > 1 && isSelected ? 'disabled' : `onclick="event.stopPropagation(); resetImageParams(${index})"`} title="Alaphelyzet"><i data-lucide="undo-2"></i></button>
                    <button class="btn-delete-icon" ${selectedIndices.size > 1 && isSelected ? 'disabled' : `onclick="event.stopPropagation(); removeImage(${index})"`} title="Törlés"><i data-lucide="trash-2"></i></button>
                </div>
            </div>
        `;
        sliderContainer.appendChild(card);
    });

    if (window.lucide) refreshIcons();
    updateScrollFades();
    renderTrashUI(); // <--- EZ A KULCS! Itt hívjuk meg a kukát kirajzoló függvényt.
}



function updateLayerParam(index, type, value) {
    let val = parseFloat(value);
    let indicesToUpdate = selectedIndices.has(index) ? Array.from(selectedIndices) : [index];

    if (type === 'zoom') {
        indicesToUpdate.forEach(idx => {
            zoomLevels[idx] = val;
            updateCardUI(idx, 'zoom', val);
        });
    } else if (type === 'rotate') {
        let finalVal = parseInt(val);

        // --- PROFESSZIONÁLIS FORGATÁS SNAP (45 fokonként) ---
        // A 0, 45, 90, 135, 180, -45, -90, -135, -180 pontokon "megakad"
        const snapPoints = [-180, -135, -90, -45, 0, 45, 90, 135, 180];
        const threshold = 5; // 5 fokos körzetben rántja be

        for (let p of snapPoints) {
            if (Math.abs(finalVal - p) <= threshold) {
                finalVal = p;
                break;
            }
        }

        indicesToUpdate.forEach(idx => {
            rotations[idx] = finalVal;
            updateCardUI(idx, 'rotate', finalVal);
        });
    }

    renderCollage();
}

// SEGÉDFÜGGVÉNY: Frissíti a számokat és csúszkákat a Sidebarban a többi kártyán is
function updateCardUI(index, type, value) {
    const card = document.querySelector(`.edit-card[data-index='${index}']`);
    if (!card) return;

    const inputs = card.querySelectorAll('.control-input');   // Szöveges mezők
    const sliders = card.querySelectorAll('.control-slider'); // Csúszkák

    if (type === 'zoom') {
        if (inputs[0]) inputs[0].value = value.toFixed(2);
        if (sliders[0] && parseFloat(sliders[0].value) !== value) sliders[0].value = value;
    } else if (type === 'rotate') {
        if (inputs[1]) inputs[1].value = value;
        if (sliders[1] && parseInt(sliders[1].value) !== value) sliders[1].value = value;
    }
}

let dragStartIndex = null;
let dropPosition = 'top'; // 'top' vagy 'bottom'

function handleDragStart(e) {
    // Csak a kártyát lehessen fogni, a gombokat/inputokat ne
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.closest('button')) {
        e.preventDefault();
        return;
    }

    dragStartIndex = parseInt(this.dataset.index);
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragOver(e) {
    e.preventDefault();
    if (parseInt(this.dataset.index) === dragStartIndex) return;

    const rect = this.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;

    // Meghatározzuk, hogy a kártya felső vagy alsó felén állunk
    if (e.clientY < midpoint) {
        dropPosition = 'top';
        this.classList.add('drop-top');
        this.classList.remove('drop-bottom');
    } else {
        dropPosition = 'bottom';
        this.classList.add('drop-bottom');
        this.classList.remove('drop-top');
    }
}

function handleDragLeave() {
    this.classList.remove('drop-top', 'drop-bottom');
}

function handleDrop(e) {
    e.preventDefault();
    this.classList.remove('drop-top', 'drop-bottom', 'dragging');

    const targetIndex = parseInt(this.dataset.index);
    if (dragStartIndex === null || dragStartIndex === targetIndex) return;

    // Kiszámoljuk az új indexet
    let newIndex = targetIndex;
    if (dropPosition === 'bottom') {
        newIndex = targetIndex + 1;
    }

    // Ha a listában lejjebb mozgatjuk, az index korrekcióra szorul a splice miatt
    if (dragStartIndex < newIndex) {
        newIndex--;
    }

    // Elmentjük az állapotot az Undo-hoz
    pushState();

    // Végrehajtjuk az áthelyezést az összes tömbben
    const moveInArray = (arr) => {
        const item = arr[dragStartIndex];
        arr.splice(dragStartIndex, 1);
        arr.splice(newIndex, 0, item);
    };

    // Cseréld le a meglévő foreach sort erre:
    [loadedImages, originalImages, zoomLevels, imageOffsets, rotations, visibilities].forEach(moveInArray);

    // Frissítjük a kijelölt indexet, hogy kövesse a mozgatott képet
    activeImageIndex = newIndex;
    selectedIndices.clear();
    selectedIndices.add(newIndex);

    // UI és Vászon újrarajzolása
    updateUIControls();
    renderCollage();
}


function reorderLayers(from, to, position) {
    // Meghatározzuk a pontos új pozíciót
    let newIndex = to;

    // Ha a kártya ALÁ dobjuk, az index eggyel nő
    if (position === 'bottom') {
        newIndex = to + 1;
    }

    // Ha a listában lejjebb rakjuk, a kivétel miatt eltolódnak az indexek
    if (from < newIndex) {
        newIndex--;
    }

    const move = (arr) => {
        const item = arr[from];
        arr.splice(from, 1);
        arr.splice(newIndex, 0, item);
    };

    [loadedImages, originalImages, zoomLevels, imageOffsets, rotations].forEach(move);

    // Kijelölés frissítése az új helyre
    selectedIndices.clear();
    activeImageIndex = newIndex;
    selectedIndices.add(newIndex);
}


// Átnevezzük és pontosítjuk a mozgatást (nem csak csere, hanem beillesztés)
function reorderArrayItems(fromIndex, toIndex) {
    const move = (arr) => {
        const item = arr[fromIndex];
        arr.splice(fromIndex, 1);
        arr.splice(toIndex, 0, item);
    };

    move(loadedImages);
    move(originalImages);
    move(zoomLevels);
    move(imageOffsets);
    move(rotations);

    // Kijelölés követése
    if (activeImageIndex === fromIndex) {
        activeImageIndex = toIndex;
    } else {
        // Ha a mozgatás érintette a kijelölt indexet, frissíteni kell
        selectedIndices.clear(); // Egyszerűség kedvéért mozgatáskor töröljük a csoportos kijelölést
        activeImageIndex = -1;
    }
}

function swapArrayItems(fromIndex, toIndex) {
    const move = (arr) => { const item = arr[fromIndex]; arr.splice(fromIndex, 1); arr.splice(toIndex, 0, item); };
    move(loadedImages); move(originalImages); move(zoomLevels); move(imageOffsets); move(rotations);
    if (activeImageIndex === fromIndex) activeImageIndex = toIndex;
    else if (activeImageIndex === toIndex && fromIndex < toIndex) activeImageIndex--;
    else if (activeImageIndex === toIndex && fromIndex > toIndex) activeImageIndex++;
}




let isHUDSliding = false;


function startHUDSlide(type) {
    if (activeImageIndex === -1) return;

    isHUDSliding = true;
    activeHUDParam = type;
    hasPushedStateForCurrentAction = false;

    const slider = document.getElementById(type === 'zoom' ? 'hud-zoom-slider' : 'hud-rotate-slider');

    if (type === 'zoom') {
        // A csúszka felveszi az elsődleges kép pontos értékét
        slider.value = zoomLevels[activeImageIndex];
        // Ezt az értéket mentjük el kezdőpontnak a csúszkához
        hudStartValues.zoom = parseFloat(slider.value);
        dragStartZooms = [...zoomLevels];
    } else if (type === 'rotate') {
        slider.value = rotations[activeImageIndex];
        hudStartValues.rotate = parseInt(slider.value);
        dragStartRots = [...rotations];
    }

    currentDeltaZoom = 0;
    currentDeltaRot = 0;
}


function endHUDSlide() {
    isHUDSliding = false;
    activeHUDParam = null;

    // Utolsó igazítás: a csúszka vegye fel a kerekített, végleges értéket
    if (activeImageIndex !== -1) {
        const zSlider = document.getElementById('hud-zoom-slider');
        const rSlider = document.getElementById('hud-rotate-slider');
        if (zSlider) zSlider.value = zoomLevels[activeImageIndex];
        if (rSlider) rSlider.value = rotations[activeImageIndex];
    }

    currentDeltaZoom = 0;
    currentDeltaRot = 0;

    updateCanvasHUD();
    renderCollage(true);
    saveToPersistentStorage();
}



function updateParamFromHUD(type, value) {
    if (activeImageIndex === -1) return;

    if (!hasPushedStateForCurrentAction) {
        pushState();
        hasPushedStateForCurrentAction = true;
    }

    let rawVal = parseFloat(value);

    if (type === 'rotate') {
        const snapPoints = [-180, -135, -90, -45, 0, 45, 90, 135, 180];
        let finalValue = rawVal;
        for (let p of snapPoints) {
            if (Math.abs(rawVal - p) < 6) { finalValue = p; break; }
        }

        currentDeltaRot = Math.round(finalValue - hudStartValues.rotate);

        selectedIndices.forEach(idx => {
            if (idx === activeImageIndex) {
                rotations[idx] = finalValue; // Az elsődleges kép tűpontosan követi a snappelt csúszkát
            } else {
                let newVal = dragStartRots[idx] + currentDeltaRot;
                while (newVal > 180) newVal -= 360;
                while (newVal < -180) newVal += 360;
                rotations[idx] = newVal;
            }
        });
    } else if (type === 'zoom') {
        // 1.00-ás mágnes (Snap)
        let snappedZoom = rawVal;
        if (Math.abs(rawVal - 1.0) < 0.03) snappedZoom = 1.0;

        // Kiszámoljuk a csúszka elmozdulását a kattintáskori értékéhez képest
        let delta = snappedZoom - hudStartValues.zoom;
        currentDeltaZoom = Math.round(delta * 100) / 100;

        selectedIndices.forEach(idx => {
            if (idx === activeImageIndex) {
                // A fő kép közvetlenül a (snappelt) csúszka értékét kapja meg!
                zoomLevels[idx] = Math.round(snappedZoom * 100) / 100;
            } else {
                // A többi kép relatívan követi
                let newVal = dragStartZooms[idx] + delta;
                zoomLevels[idx] = Math.round(Math.max(0.1, Math.min(2.0, newVal)) * 100) / 100;
            }
        });
    }

    renderCollage(false);
    updateCanvasHUD();
}


function updateCanvasHUD() {
    const hud = document.getElementById('canvas-info-hud');
    const countLabel = document.getElementById('hud-selection-count');
    if (!hud) return;

    const totalSelected = selectedIndices.size;
    if (activeImageIndex === -1 || totalSelected === 0) {
        hud.style.display = 'none';
        return;
    }

    hud.style.display = 'flex';
    if (countLabel) countLabel.innerText = `${totalSelected} kép`;

    // MÓDOSÍTÁS: Csak a csúszkát rejtjük el, a felirat (label) marad
    const sliderGroups = hud.querySelectorAll('.hud-slider-group');
    sliderGroups.forEach(group => {
        const slider = group.querySelector('input[type="range"]');
        if (slider) {
            // Ha egyszerűsített mód van (igaz), mutassuk a csúszkát. Ha haladó (hamis), rejtsük el.
            slider.style.display = isSimplifiedEditingEnabled ? 'block' : 'none';
        }
        // A csoport maga marad flex, hogy a label látszódjon
        group.style.display = 'flex';
    });

    const zoomVal = document.getElementById('hud-zoom-val');
    const rotVal = document.getElementById('hud-rot-val');

    if (zoomVal) {
        // Itt mindig a zoomLevels[activeImageIndex]-et mutatjuk, ami 
        // az updateParamFromHUD-ban most már kényszerítve lett a csúszka értékére!
        zoomVal.innerText = zoomLevels[activeImageIndex].toFixed(2) + "x";

        // Ha több kép van kijelölve és épp húzzuk, színezzük el a számot visszajelzésként
        zoomVal.style.color = (totalSelected > 1 && isHUDSliding && activeHUDParam === 'zoom') ? "var(--accent-color)" : "";
    }

    if (rotVal) {
        rotVal.innerText = rotations[activeImageIndex] + "°";
        rotVal.style.color = (totalSelected > 1 && isHUDSliding && activeHUDParam === 'rotate') ? "var(--accent-color)" : "";
    }

    if (!isHUDSliding && !isDraggingHandle) {
        const zSlider = document.getElementById('hud-zoom-slider');
        const rSlider = document.getElementById('hud-rotate-slider');
        if (zSlider) zSlider.value = zoomLevels[activeImageIndex];
        if (rSlider) rSlider.value = rotations[activeImageIndex];
    }

    if (window.lucide) refreshIcons();
}


// Módosított fogantyú rajzolás (csak ha a Haladó mód aktív)
function updateVisualSelection() {
    const layer = document.getElementById('selection-layer');
    const wrapper = document.getElementById('canvas-wrapper');
    if (!layer || !wrapper || selectedIndices.size === 0) {
        if (layer) layer.innerHTML = '';
        return;
    }

    layer.innerHTML = '';
    const scale = wrapper.clientWidth / 2000;

    selectedIndices.forEach(idx => {
        const box = renderHitBoxes.find(b => b.index === idx);
        if (!box) return;

        const isPrimary = (idx === activeImageIndex);
        const div = document.createElement('div');
        div.className = `visual-selection-box ${isPrimary ? 'active' : 'multi'}`;

        div.style.width = (box.w * scale) + 'px';
        div.style.height = (box.h * scale) + 'px';
        div.style.left = (box.cx * scale) + 'px';
        div.style.top = (box.cy * scale) + 'px';
        div.style.transform = `translate(-50%, -50%) rotate(${box.rotation}deg)`;

        // --- CSAK AKKOR ADUNK HOZZÁ FOGANTYÚKAT, HA AZ EGYSZERŰSÍTETT MÓD KI VAN KAPCSOLVA ---
        if (isPrimary && !isSimplifiedEditingEnabled) {
            ['top-left', 'top-right', 'bottom-left', 'bottom-right'].forEach(pos => {
                const h = document.createElement('div');
                h.className = 'visual-handle';
                if (pos.includes('top')) h.style.top = '-6px'; else h.style.bottom = '-6px';
                if (pos.includes('left')) h.style.left = '-6px'; else h.style.right = '-6px';
                div.appendChild(h);
            });

            const line = document.createElement('div');
            line.className = 'visual-rotator-line';
            line.style.height = (40 * scale) + 'px';
            const dot = document.createElement('div');
            dot.className = 'visual-rotator-dot';
            line.appendChild(dot);
            div.appendChild(line);
        }
        layer.appendChild(div);
    });
}



function getHitFromCoords(mx, my) {
    // Visszafelé haladunk a rétegeken (legfelső kép az első)
    for (let i = renderHitBoxes.length - 1; i >= 0; i--) {
        const box = renderHitBoxes[i];

        // 1. Kiszámoljuk az egér távolságát a kép középpontjától
        const dx = mx - box.cx;
        const dy = my - box.cy;

        // 2. Visszaforgatjuk az egér pozícióját a kép dőlésszögével ellentétesen
        const rad = -box.rotation * Math.PI / 180;
        const rx = dx * Math.cos(rad) - dy * Math.sin(rad);
        const ry = dx * Math.sin(rad) + dy * Math.cos(rad);

        // 3. A kép szélességének és magasságának a fele
        const halfW = box.w / 2;
        const halfH = box.h / 2;

        // 4. Hit-teszt az "egyenesített" lokális koordinátákon
        if (rx >= -halfW && rx <= halfW && ry >= -halfH && ry <= halfH) {
            return { index: box.index };
        }
    }
    return { index: -1 };
}


let dbSaveTimeout;
/* --- FRISSÍTETT RAJZOLÁS EXPORT FUNKCIÓVAL --- */
function renderCollage(shouldUpdateLink = true, isExport = false) {
    const count = loadedImages.length;
    //if (count === 0) return;

    renderHitBoxes = [];
    const CANVAS_SIZE = 2000;
    const canvas = document.getElementById('collageCanvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;

    // 1. Háttér
    const bgWhite = document.querySelector('input[name="previewBg"][value="white"]').checked;
    if (bgWhite) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    } else {
        ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    }

    // 2. Képek rajzolása
    if (currentMode === 'grid') renderGridMode(ctx, CANVAS_SIZE);
    else renderFreeMode(ctx, CANVAS_SIZE);



    // 5. Letöltési link frissítése - CSAK HA LÉTEZIK AZ ELEM
    if (shouldUpdateLink && !isExport) {
        const dlLink = document.getElementById('downloadLink');
        if (dlLink) {
            // "image/png" HELYETT az aktuálisan beállított formátumot és minőséget használjuk:
            dlLink.href = canvas.toDataURL(exportFormat, exportQuality);
        }
    }
    updateVisualSelection();
    updateGridSettings();
    updateCanvasHUD();
    if (!isExport && loadedImages.length > 0 && isSessionActive) { // --- MÓDOSÍTVA: + isSessionActive ---
        clearTimeout(dbSaveTimeout);
        dbSaveTimeout = setTimeout(() => {
            saveToPersistentStorage();
        }, 1500);
    }
}


function renderGridMode(ctx, CANVAS_SIZE) {
    // 1. Csak a látható képek indexeinek kigyűjtése
    const visibleIndices = [];
    for (let i = 0; i < loadedImages.length; i++) {
        if (visibilities[i] !== false) {
            visibleIndices.push(i);
        }
    }

    const count = visibleIndices.length;
    if (count === 0) return; // Ha nincs látható kép, nem rajzolunk semmit

    // Lekérjük a kiválasztott elrendezést
    const layoutInputs = document.querySelectorAll('input[name="layout"]');
    let layout = 'grid'; // Alapértelmezett a rács
    layoutInputs.forEach(input => { if (input.checked) layout = input.value; });

    let rowCount = Math.round(Math.sqrt(count)); // Automata rács (pl. 4 képnél 2x2)

    // Ha a felhasználó felülírja a gombokkal:
    if (layout === 'horizontal') {
        rowCount = 1; // 1 sor = az összes kép egymás mellé kerül
    } else if (layout === 'vertical') {
        rowCount = count; // Annyi sor, ahány kép = az összes kép egymás alá kerül
    }

    const distribution = distributeImages(count, rowCount);

    // --- ÚJ RÉSZ: Ha a felhasználó megfordította az elrendezést ---
    if (isGridFlipped) {
        distribution.reverse();
    }
    // --------------------------------------------------------------

    const rowHeight = CANVAS_SIZE / rowCount;

    // Először kiszámoljuk a látható képek adatait egy ideiglenes listába
    let tempItems = [];
    let visibleArrayIdx = 0;
    for (let r = 0; r < rowCount; r++) {
        const imagesInThisRow = distribution[r];
        const colWidth = CANVAS_SIZE / imagesInThisRow;
        for (let c = 0; c < imagesInThisRow; c++) {
            const originalIdx = visibleIndices[visibleArrayIdx];
            tempItems.push({
                img: loadedImages[originalIdx],
                idx: originalIdx,
                cellX: c * colWidth,
                cellY: r * rowHeight,
                colWidth: colWidth,
                rowHeight: rowHeight
            });
            visibleArrayIdx++;
        }
    }

    // Most kirajzoljuk őket FORDÍTOTT sorrendben (utolsótól az elsőig)
    for (let i = tempItems.length - 1; i >= 0; i--) {
        const item = tempItems[i];
        const img = item.img;
        const index = item.idx;

        // (Itt már nem kell a 'continue' vizsgálat, mert csak a láthatókat dolgozzuk fel)

        const zoom = zoomLevels[index];
        const offset = imageOffsets[index];
        const rotation = rotations[index];

        const centerX = item.cellX + (item.colWidth / 2) + offset.x;
        const centerY = item.cellY + (item.rowHeight / 2) + offset.y;

        const hRatio = item.colWidth / img.width;
        const vRatio = item.rowHeight / img.height;
        let ratio = Math.min(hRatio, vRatio) * zoom;
        const newWidth = img.width * ratio;
        const newHeight = img.height * ratio;

        renderHitBoxes.push({
            index: index,
            x: centerX - newWidth / 2, y: centerY - newHeight / 2,
            w: newWidth, h: newHeight,
            cx: centerX, cy: centerY, rotation: rotation
        });

        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(rotation * Math.PI / 180);
        ctx.drawImage(img, -newWidth / 2, -newHeight / 2, newWidth, newHeight);
        ctx.restore();
    }
}


function renderFreeMode(ctx, CANVAS_SIZE) {
    const centerCanvasX = CANVAS_SIZE / 2;
    const centerCanvasY = CANVAS_SIZE / 2;

    // Megfordítjuk a sorrendet: a tömb végétől haladunk az eleje felé.
    // Így a 0. indexű kép kerül utoljára a vászonra (legfelülre).
    for (let i = loadedImages.length - 1; i >= 0; i--) {
        const img = loadedImages[i];
        const index = i;

        if (visibilities[index] === false) continue;

        const zoom = zoomLevels[index];
        const offset = imageOffsets[index];
        const rotation = rotations[index];

        const baseScale = Math.min(CANVAS_SIZE / img.width, CANVAS_SIZE / img.height) * 0.5;
        const finalScale = baseScale * zoom;
        const newWidth = img.width * finalScale;
        const newHeight = img.height * finalScale;
        const centerX = centerCanvasX + offset.x;
        const centerY = centerCanvasY + offset.y;

        renderHitBoxes.push({
            index: index,
            x: centerX - newWidth / 2, y: centerY - newHeight / 2,
            w: newWidth, h: newHeight,
            cx: centerX, cy: centerY, rotation: rotation
        });

        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(rotation * Math.PI / 180);
        ctx.drawImage(img, -newWidth / 2, -newHeight / 2, newWidth, newHeight);
        ctx.restore();
    }
}

function distributeImages(totalItems, rows) {
    const result = new Array(rows).fill(0);
    let remaining = totalItems;
    const base = Math.floor(totalItems / rows);
    result.fill(base);
    remaining -= base * rows;
    let i = 0;
    while (remaining > 0) { result[i]++; remaining--; i++; if (i >= rows) i = 0; }
    return result.reverse();
}


function getHandleAtMouse(mx, my, box) {
    if (!box) return null;

    // Visszaforgatjuk az egér koordinátáit a kép saját rendszerébe
    const dx = mx - box.cx;
    const dy = my - box.cy;
    const rad = -box.rotation * Math.PI / 180;
    const rx = dx * Math.cos(rad) - dy * Math.sin(rad);
    const ry = dx * Math.sin(rad) + dy * Math.cos(rad);

    const halfW = box.w / 2;
    const halfH = box.h / 2;

    // A függvényen belül a forgató rész:
    const handleOffsetCanvas = 40; // Ugyanaz, mint fent!
    const rotDist = Math.sqrt(rx * rx + (ry + halfH + handleOffsetCanvas) ** 2);
    if (rotDist < 20) return 'rot'; // 20 egységnyi "érzékenységi zóna" a kör körül
    // Ellenőrizzük a sarkokat
    if (Math.abs(rx - (-halfW)) < 10 && Math.abs(ry - (-halfH)) < 10) return 'tl';
    if (Math.abs(rx - halfW) < 10 && Math.abs(ry - (-halfH)) < 10) return 'tr';
    if (Math.abs(rx - (-halfW)) < 10 && Math.abs(ry - halfH) < 10) return 'bl';
    if (Math.abs(rx - halfW) < 10 && Math.abs(ry - halfH) < 10) return 'br';

    return null;



}



function setupCanvasInteractions() {
    const canvas = document.getElementById('collageCanvas');
    const workspace = document.querySelector('.main-workspace'); // A teljes munkaterület

    if (!workspace || !canvas) return;

    // A kattintást a teljes munkaterületen figyeljük
    workspace.onmousedown = (e) => {
        // Ha gombra vagy inputra kattintunk, ne zavarjuk az alapműködést

        if (e.target.closest('.modern-hud')) {
            return;
        }

        if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;

        // --- EZT A SORT ADD HOZZÁ AZ ELEJÉRE ---
        hasPushedStateForCurrentAction = false;
        // ---------------------------------------

        const rect = canvas.getBoundingClientRect();
        const mx = (e.clientX - rect.left) * (2000 / rect.width);
        const my = (e.clientY - rect.top) * (2000 / rect.height);


        // A. Fogantyú kezelése (BÁRHOL a képernyőn, ha az egyszerűsített mód ki van kapcsolva)
        if (activeImageIndex !== -1 && !isSimplifiedEditingEnabled) {
            const box = renderHitBoxes.find(b => b.index === activeImageIndex);
            const handle = getHandleAtMouse(mx, my, box);

            if (handle) {
                isDraggingHandle = handle;
                const dx = mx - box.cx;
                const dy = my - box.cy;
                dragStartDist = Math.sqrt(dx * dx + dy * dy);
                dragStartAngle = Math.atan2(dy, dx);
                dragStartZooms = [...zoomLevels];
                dragStartRots = [...rotations];

                window.addEventListener('mousemove', globalMouseMove);
                window.addEventListener('mouseup', globalMouseUp);
                return;
            }
        }

        // B. Kép kijelölés/mozgatás hit-Teszt cimkezo
        const { index } = getHitFromCoords(mx, my);

        if (index !== -1) {
            if (e.shiftKey) {
                if (selectedIndices.has(index)) selectedIndices.delete(index);
                else selectedIndices.add(index);
            } else {
                if (!selectedIndices.has(index)) {
                    selectedIndices.clear();
                    selectedIndices.add(index);
                }
            }
            activeImageIndex = index;

            // Mozgatás indítása
            isDraggingCanvas = true;
            dragStartMouseX = mx;
            dragStartMouseY = my;
            dragStartOffsets = loadedImages.map((_, i) => ({
                x: imageOffsets[i].x,
                y: imageOffsets[i].y
            }));

            // --- EZT A KÉT SORT ADD HOZZÁ ---
            const box = renderHitBoxes.find(b => b.index === index);
            if (box) {
                dragStartBoxCX = box.cx;
                dragStartBoxCY = box.cy;
            }
            // ----

            window.addEventListener('mousemove', globalMouseMove);
            window.addEventListener('mouseup', globalMouseUp);
        }

        renderCollage();
        updateUIControls();
    };

    // Kurzorkezelés
    workspace.onmousemove = (e) => {
        if (isDraggingCanvas || isDraggingHandle) return;
        const rect = canvas.getBoundingClientRect();
        const mx = (e.clientX - rect.left) * (2000 / rect.width);
        const my = (e.clientY - rect.top) * (2000 / rect.height);

        const { index } = getHitFromCoords(mx, my);
        const box = renderHitBoxes.find(b => b.index === activeImageIndex);
        const handle = getHandleAtMouse(mx, my, box);

        if (handle) {
            workspace.style.cursor = (handle === 'rot') ? 'crosshair' : 'nwse-resize';
        } else if (index !== -1) {
            workspace.style.cursor = selectedIndices.has(index) ? 'grab' : 'pointer';
        } else {
            workspace.style.cursor = 'default';
        }
    };
}







function globalMouseMove(e) {
    if (!isDraggingCanvas && !isDraggingHandle) return;

    if (!hasPushedStateForCurrentAction) {
        pushState();
        hasPushedStateForCurrentAction = true;
    }

    const canvas = document.getElementById('collageCanvas');
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (2000 / rect.width);
    const my = (e.clientY - rect.top) * (2000 / rect.height);

    if (isDraggingHandle && activeImageIndex !== -1) {
        // ... (A transzformációs kód - forgatás/méretezés - maradjon változatlan) ...
        const box = renderHitBoxes.find(b => b.index === activeImageIndex);
        const dx = mx - box.cx;
        const dy = my - box.cy;

        if (isDraggingHandle === 'rot') {
            const currentMouseAngle = Math.atan2(dy, dx) * (180 / Math.PI);
            let angleDiff = currentMouseAngle - (dragStartAngle * (180 / Math.PI));
            if (angleDiff > 180) angleDiff -= 360;
            if (angleDiff < -180) angleDiff += 360;

            let targetRot = dragStartRots[activeImageIndex] + angleDiff;
            const snapPoints = [-180, -135, -90, -45, 0, 45, 90, 135, 180];
            for (let p of snapPoints) {
                if (Math.abs(targetRot - p) < 6) { targetRot = p; break; }
            }
            currentDeltaRot = Math.round(targetRot - dragStartRots[activeImageIndex]);
            selectedIndices.forEach(idx => rotations[idx] = Math.round(dragStartRots[idx] + currentDeltaRot));
        } else {
            const currentDist = Math.sqrt(dx * dx + dy * dy);
            const ratio = currentDist / dragStartDist;
            currentDeltaZoom = ratio - 1;
            selectedIndices.forEach(idx => zoomLevels[idx] = Math.max(0.1, dragStartZooms[idx] * ratio));
        }
    }
    else if (isDraggingCanvas) {
        const totalMouseDeltaX = mx - dragStartMouseX;
        const totalMouseDeltaY = my - dragStartMouseY;

        activeSnapLines = { x: null, y: null };
        let snapCorrectionX = 0;
        let snapCorrectionY = 0;

        if (isSnapEnabled && activeImageIndex !== -1) {
            const refIdx = activeImageIndex;
            const box = renderHitBoxes.find(b => b.index === refIdx);

            if (box) {
                // A "nyers" virtuális pozíció (mágnes nélkül)
                const virtualCX = dragStartBoxCX + totalMouseDeltaX;
                const virtualCY = dragStartBoxCY + totalMouseDeltaY;

                const vL = virtualCX - box.w / 2;
                const vR = virtualCX + box.w / 2;
                const vT = virtualCY - box.h / 2;
                const vB = virtualCY + box.h / 2;

                const targetsX = [0, 1000, 2000];
                const targetsY = [0, 1000, 2000];

                renderHitBoxes.forEach(other => {
                    if (!selectedIndices.has(other.index)) {
                        targetsX.push(other.cx, other.cx - other.w / 2, other.cx + other.w / 2);
                        targetsY.push(other.cy, other.cy - other.h / 2, other.cy + other.h / 2);
                    }
                });

                // X irányú mágnes (Vízszintes illesztés javítva)
                for (let tx of targetsX) {
                    if (Math.abs(vL - tx) < SNAP_THRESHOLD) { snapCorrectionX = tx - vL; activeSnapLines.x = tx; break; }
                    if (Math.abs(vR - tx) < SNAP_THRESHOLD) { snapCorrectionX = tx - vR; activeSnapLines.x = tx; break; }
                    if (Math.abs(virtualCX - tx) < SNAP_THRESHOLD) { snapCorrectionX = tx - virtualCX; activeSnapLines.x = tx; break; }
                }

                // Y irányú mágnes (Függőleges illesztés)
                for (let ty of targetsY) {
                    if (Math.abs(vT - ty) < SNAP_THRESHOLD) { snapCorrectionY = ty - vT; activeSnapLines.y = ty; break; }
                    if (Math.abs(vB - ty) < SNAP_THRESHOLD) { snapCorrectionY = ty - vB; activeSnapLines.y = ty; break; }
                    if (Math.abs(virtualCY - ty) < SNAP_THRESHOLD) { snapCorrectionY = ty - virtualCY; activeSnapLines.y = ty; break; }
                }
            }
        }

        selectedIndices.forEach(idx => {
            imageOffsets[idx].x = dragStartOffsets[idx].x + totalMouseDeltaX + snapCorrectionX;
            imageOffsets[idx].y = dragStartOffsets[idx].y + totalMouseDeltaY + snapCorrectionY;
        });
    }

    updateCanvasHUD();
    renderCollage(false);
}



function globalMouseUp() {
    isDraggingCanvas = false;
    isDraggingHandle = null;
    activeHUDParam = null;

    // --- EZT ADD HOZZÁ ---
    hasPushedStateForCurrentAction = false;
    // ---------------------

    // INTELIGENS ILLESZTÉS TÖRLÉSE ELENGEDÉSKOR
    activeSnapLines = { x: null, y: null };
    updateGridSettings(); // Ez törli le a piros vonalakat a grid-overlay canvas-ről

    window.removeEventListener('mousemove', globalMouseMove);
    window.removeEventListener('mouseup', globalMouseUp);

    updateCanvasHUD();
    renderCollage(true);
    saveToPersistentStorage();
}

/* --- BILLENTYŰZET VEZÉRLÉS EGYSÉGESÍTVE ÉS JAVÍTVA --- */
document.addEventListener('keyup', (e) => {
    // Amikor elengedi bármelyik mozgató billentyűt, lezárjuk a folyamatot
    const moveKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    if (moveKeys.includes(e.key)) {
        isKeyMovingSession = false;
    }
});

document.addEventListener('keydown', (e) => {

    // Undo: Ctrl+Z
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
    }
    // Redo: Ctrl+Y vagy Ctrl+Shift+Z
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
        return;
    }

    // Ha nincs kijelölés vagy épp szöveget ír be a felhasználó, ne csináljon semmit
    if (selectedIndices.size === 0) return;
    if (e.target.tagName === 'INPUT') return;

    const moveKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

    if (moveKeys.includes(e.key)) {
        // --- KRITIKUS JAVÍTÁS: Csak az első gombnyomáskor mentünk állapotot ---
        if (!isKeyMovingSession) {
            pushState();
            isKeyMovingSession = true;
        }

        const step = e.shiftKey ? 20 : 2;
        let moved = false;

        switch (e.key) {
            case 'ArrowUp':
                selectedIndices.forEach(idx => imageOffsets[idx].y -= step);
                moved = true;
                break;
            case 'ArrowDown':
                selectedIndices.forEach(idx => imageOffsets[idx].y += step);
                moved = true;
                break;
            case 'ArrowLeft':
                selectedIndices.forEach(idx => imageOffsets[idx].x -= step);
                moved = true;
                break;
            case 'ArrowRight':
                selectedIndices.forEach(idx => imageOffsets[idx].x += step);
                moved = true;
                break;
        }

        if (moved) {
            e.preventDefault();
            renderCollage();
        }
    } else if (e.key === 'Escape') {
        deselectImage();
        e.preventDefault();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
        deleteSelectedImages();
        e.preventDefault();
    }
});




function getHitFromMouse(e) {
    const canvas = document.getElementById('collageCanvas');
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;

    for (let i = renderHitBoxes.length - 1; i >= 0; i--) {
        const box = renderHitBoxes[i];
        if (mouseX >= box.x && mouseX <= box.x + box.w && mouseY >= box.y && mouseY <= box.y + box.h) {
            return { index: box.index };
        }
    }
    return { index: -1 };
}


function toggleVisibility(index) {
    pushState(); // Visszavonható lépés
    if (visibilities[index] === undefined) visibilities[index] = true;
    visibilities[index] = !visibilities[index]; // Kapcsoló
    updateUIControls(true);
    renderCollage();
}

function batchToggleVisibilitySelected() {
    if (selectedIndices.size === 0) return;
    pushState();

    // Megnézzük, van-e köztük látható. Ha igen, mindet elrejtjük, különben megjelenítjük.
    let anyVisible = false;
    selectedIndices.forEach(idx => {
        if (visibilities[idx] !== false) anyVisible = true;
    });

    selectedIndices.forEach(idx => {
        visibilities[idx] = !anyVisible;
    });

    updateUIControls(true);
    renderCollage();
}

function selectImageFromSidebar(index, event) {
    const isMulti = event ? event.shiftKey : false;

    if (isMulti) {
        if (selectedIndices.has(index)) {
            selectedIndices.delete(index);
            // Ha az aktív képet töröltük ki, az első maradó legyen az aktív
            if (activeImageIndex === index) {
                activeImageIndex = selectedIndices.size > 0
                    ? selectedIndices.values().next().value
                    : -1;
            }
        } else {
            selectedIndices.add(index);
            activeImageIndex = index;
        }
    } else {
        selectedIndices.clear();
        selectedIndices.add(index);
        activeImageIndex = index;
    }

    updateUIControls(true);
    renderCollage();
    updateVisualSelection();
    updateCanvasHUD();
}




// Toolbar törlés gombja
function removeActiveImageFromToolbar() {
    deleteSelectedImages();
}
function deselectImage() {
    selectedIndices.clear();
    activeImageIndex = -1;
    updateCanvasHUD(); // Ez fogja elrejteni a HUD-ot a fenti check miatt
    renderCollage();
    updateUIControls();
}



function shuffleImages() {
    if (loadedImages.length < 2) return;
    const canvas = document.getElementById('collageCanvas');

    // Előbb mentünk az előzményekbe
    pushState();

    // Animáció osztály hozzáadása
    canvas.classList.remove('shuffle-anim'); // Előző törlése
    void canvas.offsetWidth; // "Reflow" kényszerítése az animáció újraindításához
    canvas.classList.add('shuffle-anim');

    // Keverés logikája (maradhat a régi)
    for (let i = loadedImages.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [loadedImages[i], loadedImages[j]] = [loadedImages[j], loadedImages[i]];
        [originalImages[i], originalImages[j]] = [originalImages[j], originalImages[i]];
        [zoomLevels[i], zoomLevels[j]] = [zoomLevels[j], zoomLevels[i]];
        [imageOffsets[i], imageOffsets[j]] = [imageOffsets[j], imageOffsets[i]];
        [rotations[i], rotations[j]] = [rotations[j], rotations[i]];
        [visibilities[i], visibilities[j]] = [visibilities[j], visibilities[i]]; // <--- ADD HOZZÁ
    }

    selectedIndices.clear();
    activeImageIndex = -1;

    updateUIControls();
    renderCollage();
}

function selectAllImages() {
    if (loadedImages.length === 0) return;

    // Töröljük az eddigi kijelölést, majd hozzáadjuk az összes indexet
    selectedIndices.clear();
    for (let i = 0; i < loadedImages.length; i++) {
        selectedIndices.add(i);
    }

    // Ha épp egy kép sem volt aktív, legyen az első (a fókusz miatt kell)
    if (activeImageIndex === -1) {
        activeImageIndex = 0;
    }

    // UI frissítése, vászon újrarajzolása és HUD megjelenítése
    updateUIControls(true);
    renderCollage();
    updateCanvasHUD();

    // Vizuális visszajelzés
    //showToast("Minden kép kijelölve!", "check-square", "var(--accent-color)");
}



/* --- JAVÍTOTT TOOLBAR LOGIKA (SNAP + DUPLA KLIKK) --- */
function updateFloatingToolbar() {
    const toolbar = document.getElementById('floating-toolbar');
    if (!toolbar) return;

    if (activeImageIndex === -1) {
        toolbar.style.display = 'none';
        return;
    }

    toolbar.style.display = 'flex';
    const inputs = {
        zoomSlider: document.getElementById('ft-zoom'),
        zoomInput: document.getElementById('ft-zoom-input'),
        rotateSlider: document.getElementById('ft-rotate'),
        rotateInput: document.getElementById('ft-rotate-input')
    };

    if (!inputs.zoomSlider || !inputs.zoomInput) return;

    // ZOOM BEÁLLÍTÁSOK (Max 2.0)
    inputs.zoomSlider.max = "2.0";



    const currentZoom = zoomLevels[activeImageIndex];
    const currentRotate = rotations[activeImageIndex];

    if (document.activeElement !== inputs.zoomInput) {
        inputs.zoomSlider.value = currentZoom;
        inputs.zoomInput.value = currentZoom.toFixed(2);
    }
    if (document.activeElement !== inputs.rotateInput) {
        inputs.rotateSlider.value = currentRotate;
        inputs.rotateInput.value = currentRotate;
    }

    // --- DUPLA KLIKK RESET ---
    inputs.zoomSlider.ondblclick = () => {
        zoomLevels[activeImageIndex] = 1.0;
        inputs.zoomSlider.value = 1.0;
        inputs.zoomInput.value = "1.00";
        // Szinkronizálás a sidebarral is
        updateUIControls(true);
        renderCollage();
    };

    inputs.rotateSlider.ondblclick = () => {
        rotations[activeImageIndex] = 0;
        inputs.rotateSlider.value = 0;
        inputs.rotateInput.value = 0;
        // Szinkronizálás a sidebarral is
        updateUIControls(true);
        renderCollage();
    };

    // ZOOM INPUT
    inputs.zoomSlider.oninput = (e) => {
        zoomLevels[activeImageIndex] = parseFloat(e.target.value);
        inputs.zoomInput.value = zoomLevels[activeImageIndex].toFixed(2);
        renderCollage();
    };

    // FORGATÁS SNAP LOGIKA (Marad a régi)
    // ... (a függvény eleje változatlan marad) ...

    // FORGATÁS SNAP LOGIKA (JAVÍTOTT)
    inputs.rotateSlider.oninput = (e) => {
        let val = parseInt(e.target.value);
        const snapPoints = [-180, -90, 0, 90, 180];

        // JAVÍTÁS: Itt is 4 fokra vettük a 10 helyett
        const threshold = 4;

        for (let p of snapPoints) {
            if (Math.abs(val - p) <= threshold) {
                val = p;
                break;
            }
        }

        // Vizuális korrekció a csúszkán, ha behúzta a mágnes
        if (val !== parseInt(e.target.value)) {
            e.target.value = val;
        }

        rotations[activeImageIndex] = val;
        inputs.rotateInput.value = rotations[activeImageIndex];
        renderCollage();
    };
} // Függvény vége


function toggleView(view) {
    const startScreen = document.getElementById('start-screen');
    const autoScreen = document.getElementById('auto-screen');
    const editorElements = document.querySelectorAll('.editor-ui');

    // Mindent elrejt alapból
    startScreen.classList.add('d-none');
    if (autoScreen) autoScreen.classList.add('d-none');
    editorElements.forEach(el => el.classList.add('d-none'));

    if (view === 'start') {
        startScreen.classList.remove('d-none');
        document.getElementById('upload-step').classList.remove('d-none');
        document.getElementById('mode-selection-step').classList.add('d-none');
    } else if (view === 'auto') {
        if (autoScreen) autoScreen.classList.remove('d-none');
    } else {
        // editor
        editorElements.forEach(el => el.classList.remove('d-none'));
        setTimeout(snapCanvasSizeToGrid, 50);
    }
}

function updateGridSettings() {
    const overlayCanvas = document.getElementById('grid-overlay');
    const wrapper = document.getElementById('canvas-wrapper');
    const toggle = document.getElementById('gridToggle');

    if (!overlayCanvas || !wrapper || !toggle) return;
    if (wrapper.clientWidth === 0 || wrapper.clientHeight === 0) return;

    const isEnabled = toggle.checked;
    const tilesPerBlock = 4;
    const TILE_SIZE = 20;

    overlayCanvas.width = wrapper.clientWidth;
    overlayCanvas.height = wrapper.clientHeight;

    const ctx = overlayCanvas.getContext('2d');
    ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    // --- 1. ALAPRÁCS RAJZOLÁSA (ha be van kapcsolva) ---
    if (isEnabled) {
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)'; // Halványabb rács
        ctx.lineWidth = 1;
        const gridIntervalPx = tilesPerBlock * TILE_SIZE;

        ctx.beginPath();
        for (let x = gridIntervalPx; x < overlayCanvas.width; x += gridIntervalPx) {
            const sharpX = Math.round(x) + 0.5;
            ctx.moveTo(sharpX, 0); ctx.lineTo(sharpX, overlayCanvas.height);
        }
        for (let y = gridIntervalPx; y < overlayCanvas.height; y += gridIntervalPx) {
            const sharpY = Math.round(y) + 0.5;
            ctx.moveTo(0, sharpY); ctx.lineTo(overlayCanvas.width, sharpY);
        }
        ctx.stroke();
    }

    // --- 2. INTELLIGENS ILLESZTÉS VONALAI (Piros vonalak) ---
    // Akkor is rajzoljuk, ha a rács ki van kapcsolva, de a snapping aktív!
    if (isSnapEnabled && (activeSnapLines.x !== null || activeSnapLines.y !== null)) {
        const scale = overlayCanvas.width / 2000; 

        ctx.save();
        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]); // Szaggatott vonal

        if (activeSnapLines.x !== null) {
            const drawX = Math.round(activeSnapLines.x * scale) + 0.5;
            ctx.beginPath();
            ctx.moveTo(drawX, 0);
            ctx.lineTo(drawX, overlayCanvas.height);
            ctx.stroke();
        }

        if (activeSnapLines.y !== null) {
            const drawY = Math.round(activeSnapLines.y * scale) + 0.5;
            ctx.beginPath();
            ctx.moveTo(0, drawY);
            ctx.lineTo(overlayCanvas.width, drawY);
            ctx.stroke();
        }
        ctx.restore();
    }
}


function updatePreviewBg() {
    const wrapper = document.getElementById('canvas-wrapper');
    const radio = document.querySelector('input[name="previewBg"]:checked');
    if (!radio) return;

    const mode = radio.value;

    // MENTÉS: elmentjük a választott háttér típusát
    localStorage.setItem('collage_preview_bg', mode);

    if (mode === 'white') {
        wrapper.classList.remove('bg-checkerboard');
        wrapper.classList.add('bg-white');
    } else {
        wrapper.classList.remove('bg-white');
        wrapper.classList.add('bg-checkerboard');
    }

    updateGridSettings();
    renderCollage();
}


/* --- STEPPER LOGIKA (Stabil, 80-as osztókra optimalizálva) --- */
// Csak olyan számok, amikkel szépen osztható a 80-as alapú vászon
const GRID_VALUES = [2, 4, 5, 8, 10, 16];

function stepGrid(direction) {
    const hiddenInput = document.getElementById('gridSizeSlider');
    const display = document.getElementById('stepperDisplay');
    const wrapper = document.getElementById('canvas-wrapper');

    let currentVal = parseInt(hiddenInput.value);
    let idx = GRID_VALUES.indexOf(currentVal);

    if (idx === -1) idx = 1; // Alapból a 4-es

    // Irány: + Sűrít (balra), - Ritkít (jobbra)
    let newIdx = idx - direction;

    // Határok
    if (newIdx < 0) newIdx = 0;
    if (newIdx >= GRID_VALUES.length) newIdx = GRID_VALUES.length - 1;

    // --- OKOS ELLENŐRZÉS ---
    // Mielőtt kiválasztjuk, megnézzük, hogy a jelenlegi vászonhoz tényleg jó-e.
    // Ha véletlenül nem jön ki matek (pl. nagyon kicsi ablaknál), átugorjuk.
    // De a 80-as snap miatt 99%-ban jó lesz.
    let newVal = GRID_VALUES[newIdx];

    // Érték mentése és kiírás
    hiddenInput.value = newVal;
    display.innerText = newVal + ' egység';

    // ITT A TITOK: A vásznat NEM méretezzük át! Csak a rácsot rajzoljuk újra.
    updateGridSettings();
}




// A régi updateGridButtonsUI függvényt cseréld le erre:
function updateGridButtonsUI() {
    const sliderInput = document.getElementById('gridSizeSlider');
    const display = document.getElementById('stepperDisplay');
    if (sliderInput && display) {
        display.innerText = sliderInput.value + 'x';
    }
}



function toggleSnapping() {
    isSnapEnabled = document.getElementById('snapToggle').checked;
    // Opcionálisan elmenthetjük localStorage-ba is
    localStorage.setItem('collage_snap_enabled', isSnapEnabled);
}


function toggleGrid() {
    const toggle = document.getElementById('gridToggle');
    isGridVisible = toggle.checked;
    localStorage.setItem('collage_grid_enabled', isGridVisible);

    // A méret fix, nem kell újraszámolni, csak a vonalakat kapcsoljuk ki/be
    updateGridSettings();
}


function snapCanvasSizeToGrid() {
    const wrapper = document.getElementById('canvas-wrapper');
    const container = document.querySelector('.canvas-column');
    const appContainer = document.getElementById('app-container');
    const mobileWarning = document.getElementById('mobile-warning');

    const FIX_GRID_UNIT = 80;
    const MIN_WORKABLE_SIZE = 320;

    // Ha nincs container (pl. még nem töltött be), ne fussunk tovább
    if (!container || !appContainer) return;

    // Ha az appContainer display: none, akkor ideiglenesen tegyük láthatóvá a méréshez
    const originalDisplay = appContainer.style.display;
    if (originalDisplay === 'none') {
        appContainer.style.display = 'grid';
    }

    const containerRect = container.getBoundingClientRect();
    const availableWidth = containerRect.width;
    // Ha a magasság 0 (mert rejtve van), használjuk az ablak magasságát viszonyításnak
    const availableHeight = (containerRect.height > 0 ? containerRect.height : window.innerHeight - 150) - 80;

    let baseSize = Math.min(availableWidth, availableHeight);
    let snappedSize = Math.floor(baseSize / FIX_GRID_UNIT) * FIX_GRID_UNIT;

    // Visszaállítjuk az eredeti állapotot a mérés után
    appContainer.style.display = originalDisplay;

    // KRITIKUS JAVÍTÁS: Csak akkor blokkoljunk, ha tényleg kicsi a képernyő (window.innerWidth)
    // Ne a kiszámolt snappedSize-ra alapozzuk a teljes tiltást!
    if (window.innerWidth < 1024 || window.innerHeight < 500) {
        appContainer.style.display = 'none';
        mobileWarning.style.display = 'flex';
        return;
    } else {
        // Ha desktopon vagyunk, az app legyen látható
        appContainer.style.display = 'grid';
        mobileWarning.style.display = 'none';
    }

    if (wrapper) {
        wrapper.style.width = snappedSize + 'px';
        wrapper.style.height = snappedSize + 'px';
    }

    updateGridSettings();
    renderCollage(false);
    updateVisualSelection();
}


function resetImageParams(index) {
    // --- ÚJ: Mentés, mielőtt visszaállítjuk ---
    pushState();
    // Visszaállítjuk az alapértelmezett értékeket
    zoomLevels[index] = (currentMode === 'free' ? 0.8 : 1.0);
    rotations[index] = 0;
    imageOffsets[index] = { x: 0, y: 0 };

    // Frissítjük a nézetet
    renderCollage();
    updateUIControls();
}

function downloadImage(event) {
    if (event) event.preventDefault();

    renderCollage(false, true);

    const canvas = document.getElementById('collageCanvas');

    // Itt használjuk a beállított formátumot és minőséget!
    const dataURL = canvas.toDataURL(exportFormat, exportQuality);

    const now = new Date();
    const dateStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    const timeStr = String(now.getHours()).padStart(2, '0') + '-' + String(now.getMinutes()).padStart(2, '0');

    // Fájlkiterjesztés meghatározása
    const ext = exportFormat === 'image/jpeg' ? 'jpg' : (exportFormat === 'image/webp' ? 'webp' : 'png');

    const tempLink = document.createElement('a');
    tempLink.download = `termek_kollazs_${dateStr}_${timeStr}.${ext}`;
    tempLink.href = dataURL;
    document.body.appendChild(tempLink);
    tempLink.click();
    document.body.removeChild(tempLink);

    renderCollage(true, false);
    markAsSaved();
}

// Csoportos alaphelyzetbe állítás
function batchResetSelected() {
    if (selectedIndices.size === 0) return; // JAVÍTVA: < 2 helyett === 0
    pushState(); // ÚJ: Hozzáadva a visszavonhatóság miatt

    selectedIndices.forEach(idx => {
        zoomLevels[idx] = (currentMode === 'free' ? 0.8 : 1.0);
        rotations[idx] = 0;
        imageOffsets[idx] = { x: 0, y: 0 };
    });

    renderCollage();
    updateUIControls();
}

// Csoportos törlés (átnevezve/tisztázva)
function batchDeleteSelected() {
    if (selectedIndices.size === 0) return; // JAVÍTVA: < 2 helyett === 0
    if (confirm(`Biztosan törölni szeretnéd a kijelölt ${selectedIndices.size} képet?`)) {
        pushState(); // ÚJ: Hozzáadva a visszavonhatóság miatt
        deleteSelectedImages(); // Ezt a függvényt már korábban megírtuk
    }
}

function toggleGridLayout() {
    pushState(); // Mentjük az állapotot, hogy a visszavonás (Ctrl+Z) működjön
    isGridFlipped = !isGridFlipped; // Átállítjuk az ellenkezőjére
    renderCollage(); // Újrarajzoljuk a vásznat
}

function updateScrollFades() {
    const container = document.getElementById('sliders-container');
    const area = document.getElementById('sliders-area');
    if (!container || !area) return;

    const scrollTop = container.scrollTop;
    const scrollHeight = container.scrollHeight;
    const clientHeight = container.clientHeight;

    // Ha a tartalom kisebb, mint a konténer, egyik fade sem kell
    if (scrollHeight <= clientHeight) {
        area.classList.remove('show-top-fade', 'show-bottom-fade');
        return;
    }

    // Felső fade: ha nem a legtetején vagyunk
    if (scrollTop > 5) {
        area.classList.add('show-top-fade');
    } else {
        area.classList.remove('show-top-fade');
    }

    // Alsó fade: ha nem értük el az alját (hagyunk 5px hibahatárt)
    if (scrollTop + clientHeight < scrollHeight - 5) {
        area.classList.add('show-bottom-fade');
    } else {
        area.classList.remove('show-bottom-fade');
    }
}


function showToast(message, iconName = 'check-circle', iconColor = '#4cd137') {
    let toast = document.getElementById('toast-container');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast-container';
        toast.className = 'toast-notification';
        document.body.appendChild(toast);
    }

    // Beállítjuk a tartalmat az egyedi ikonnal és színnel
    toast.innerHTML = `
        <div class="toast-icon" style="color: ${iconColor}"><i data-lucide="${iconName}"></i></div>
        <span>${message}</span>
    `;

    refreshIcons();

    // Reseteljük az animációt, ha már látszik
    toast.classList.remove('show');
    void toast.offsetWidth; // Force reflow
    toast.classList.add('show');

    // Meglévő időzítő törlése (ha gyorsan nyomkodunk)
    if (toast.timeout) clearTimeout(toast.timeout);

    toast.timeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}


// --- SIDEBAR DRAG & DROP LOGIKA ---
function setupSidebarDrop() {
    document.body.addEventListener('dragover', (e) => {
        if (!isSessionActive) return;
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
    });

    document.body.addEventListener('drop', (e) => {
        if (!isSessionActive) return;
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFiles(e.dataTransfer.files);
        }
    });
}


/* --- BIZTONSÁGI FIGYELMEZTETÉS BEZÁRÁSKOR --- */
window.addEventListener('beforeunload', (e) => {
    // Csak akkor riasztunk, ha van feltöltött kép a munkaterületen
    if (loadedImages.length > 0) {
        // Megakadályozzuk az azonnali bezárást
        e.preventDefault();

        // A modern böngészőkhöz szükséges beállítás (a szöveg itt már nem számít, a rendszerét fogja mutatni)
        e.returnValue = 'Biztosan törölni szeretnéd a teljes munkaterületet?';
        return e.returnValue;
    }
});


function finalizeModeSelection(selectedMode) {
    if (selectedMode === 'auto' && loadedImages.length > 6) return;
    if (selectedMode === 'auto') {
        toggleView('editor');
        setupCanvasInteractions();
        updateUIControls();
        launchAutoCollage();
        return;
    }

    currentMode = selectedMode;
    isSessionActive = true;

    resetPositionsForMode();
    toggleView('editor');
    setupCanvasInteractions();
    updateUIControls();
    renderCollage();
    saveToPersistentStorage();
    updateCanvasHUD();
}

function backToUpload() {
    isSessionActive = false; // --- ÚJ: Kikapcsoljuk a mentési lehetőséget ---
    // 1. Kitakarítjuk a memóriát, hogy ne maradjanak ott a képek
    deletedImagesTrash = [];
    loadedImages = [];
    originalImages = [];
    zoomLevels = [];
    imageOffsets = [];
    rotations = [];
    selectedIndices.clear();
    activeImageIndex = -1;

    // 2. Töröljük az IndexedDB mentést is, hogy frissítés után se jöjjön vissza
    clearPersistentStorage();

    // 3. Váltunk a nézetek között (JS-sel, oldalfrissítés nélkül)
    document.getElementById('mode-selection-step').classList.add('d-none');
    document.getElementById('upload-step').classList.remove('d-none');

    // 4. Az input mezőt is ürítjük, hogy ugyanazt a képet újra fel lehessen tölteni
    document.getElementById('imageInput').value = '';

    //showToast("Képek törölve, új feltöltés indítható", "image", "#888");
}


// ── AUTO KOLLÁZS — ÁLLAPOT ──────────────────────────────
let autoCurrentLayouts = [];
let autoSelectedLayout = null;
let autoGap = 15;
let autoMargin = 50;
let autoCroppedImages = [];

// ── INDÍTÁS ─────────────────────────────────────────────
function launchAutoCollage() {
    clearPersistentStorage();
    const overlay = document.getElementById('processingOverlay');
    if (overlay) overlay.style.display = 'flex';

    setTimeout(() => {
        try {
            autoGap = 15;
            autoMargin = 50;

            const ms = document.getElementById('auto-margin-slider');
            const gs = document.getElementById('auto-gap-slider');
            if (ms) { ms.value = 50; document.getElementById('auto-margin-val').textContent = '50px'; }
            if (gs) { gs.value = 15; document.getElementById('auto-gap-val').textContent = '15px'; }

            // --- JAVÍTOTT SOR: originalImages helyett loadedImages ---
            autoCroppedImages = loadedImages.map((img, i) => processAndCropForAuto(img, i));

            // --- ÚJ RÉSZ A MEGJELENÍTÉSNÉL ---
            const keepOrderCb = document.getElementById('auto-keep-order');
            if (keepOrderCb) keepOrderCb.checked = false; // Alapból hagyjuk az automatát mixelni

            document.getElementById('auto-mini-gallery-container').style.display = 'flex'; // ÚJ
            document.getElementById('auto-variants-row').style.display = 'flex';
            document.getElementById('auto-variants-row').style.display = 'flex';
            document.getElementById('auto-back-container').style.display = 'flex';
            document.getElementById('auto-controls').style.display = 'flex';
            document.getElementById('auto-selected-view').style.display = 'none';
            document.getElementById('auto-title').textContent = 'Válassz egy elrendezést';
            document.getElementById('auto-subtitle').textContent = 'Az algoritmus megtalálta a legjobb 3 elrendezést';

            toggleView('auto');
            renderAutoMiniGallery(); // ÚJ: Kirajzoljuk a minigalériát
            regenerateAutoLayouts();
        } catch (err) {
            console.error(err);
            alert('Hiba az automatikus generálás során.');
        } finally {
            if (overlay) overlay.style.display = 'none';
        }
    }, 50);
}

// ── KÉPEK KÖRÜLVÁGÁSA ────────────────────────────────────
function processAndCropForAuto(img, originalIndex) {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = img.width; tempCanvas.height = img.height;
    const tCtx = tempCanvas.getContext('2d');
    tCtx.drawImage(img, 0, 0);
    const imageData = tCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    const data = imageData.data;
    let minX = tempCanvas.width, minY = tempCanvas.height, maxX = 0, maxY = 0;

    const isBgRemoved = document.getElementById('removeBgToggle')?.checked;

    for (let y = 0; y < tempCanvas.height; y++) {
        for (let x = 0; x < tempCanvas.width; x++) {
            const idx = (y * tempCanvas.width + x) * 4;
            const r = data[idx], g = data[idx + 1], b = data[idx + 2], a = data[idx + 3];

            let isVisible = false;
            // Ha a háttér átlátszó, akkor CSAK azt nézzük, hogy a pixel látható-e
            if (isBgRemoved) {
                isVisible = (a > 10);
            } else {
                // Ha kikapcsolta a vágást, akkor ignoráljuk a fehér(es) színeket
                isVisible = (a > 20 && !(r > 235 && g > 235 && b > 235));
            }

            if (isVisible) {
                if (x < minX) minX = x; if (x > maxX) maxX = x;
                if (y < minY) minY = y; if (y > maxY) maxY = y;
            } else {
                data[idx + 3] = 0;
            }
        }
    }
    tCtx.putImageData(imageData, 0, 0);
    const cropW = maxX - minX + 1, cropH = maxY - minY + 1;
    if (cropW <= 0) return {
        canvas: tempCanvas, ar: 1, originalIndex,
        cropOffsetX: 0, cropOffsetY: 0,
        cropW: img.width, cropH: img.height
    };
    const cropped = document.createElement('canvas');
    cropped.width = cropW; cropped.height = cropH;
    cropped.getContext('2d').drawImage(tempCanvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
    return {
        canvas: cropped, ar: cropW / cropH, originalIndex,
        cropOffsetX: minX, cropOffsetY: minY, cropW, cropH
    };
}

// ── LAYOUT SZÁMÍTÁS ──────────────────────────────────────
function getAutoPermutations(arr) {
    if (arr.length <= 1) return [arr];
    const result = [];
    for (let i = 0; i < arr.length; i++) {
        const current = arr[i];
        const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
        for (let perm of getAutoPermutations(rest)) result.push([current, ...perm]);
    }
    return result;
}

function getAutoPartitions(n) {
    if (n === 0) return [];
    const result = [];
    const numSplits = 1 << (n - 1);
    for (let i = 0; i < numSplits; i++) {
        let part = [], count = 1;
        for (let j = 0; j < n - 1; j++) {
            if ((i & (1 << j)) !== 0) { part.push(count); count = 1; } else count++;
        }
        part.push(count);
        result.push(part);
    }
    return result;
}



function computeAutoLayouts(images, gap, externalMargin) {
    const TARGET = 2000;
    const allCandidates = [];

const keepOrder = document.getElementById('auto-keep-order')?.checked;
    let allPerms;

    if (keepOrder) {
        // Csak a jelenlegi, kézzel beállított sorrendet engedjük
        allPerms = [images];
    } else {
        // Hagyjuk, hogy az algoritmus kipróbálja az összes variációt
        const perms = getAutoPermutations(images);
        const sortedAsc = [...images].sort((a, b) => a.ar - b.ar);
        const sortedDesc = [...images].sort((a, b) => b.ar - a.ar);
        allPerms = [...perms, sortedAsc, sortedDesc];
    }

    const parts = getAutoPartitions(images.length);


    for (let perm of allPerms) {
        for (let part of parts) {
            const rowLayout = tryRowLayout(perm, part, gap, externalMargin, TARGET);
            if (rowLayout) allCandidates.push(rowLayout);

            const colLayout = tryColLayout(perm, part, gap, externalMargin, TARGET);
            if (colLayout) allCandidates.push(colLayout);
        }
    }

    allCandidates.sort((a, b) => a.score - b.score);

    const seen = new Set();
    const top = [];

    // --- ÚJ MATEMATIKA: Ha csak 1 kép van, maximum 1 változatot adjon, különben 3-at ---
    const maxVariants = images.length === 1 ? 1 : 3;

    for (const item of allCandidates) {
        if (!seen.has(item.signature)) {
            top.push(item);
            seen.add(item.signature);
        }
        if (top.length === maxVariants) break; // Itt használjuk a dinamikus limitet
    }
    return top;
}

function tryRowLayout(perm, part, gap, externalMargin, TARGET) {
    let totalH = 0, valid = true, imgIdx = 0;
    const rowData = [], rowHeights = [];

    for (let count of part) {
        let sumAR = 0;
        for (let i = 0; i < count; i++) sumAR += perm[imgIdx + i].ar;
        const availW = TARGET - (count - 1) * gap;
        if (availW <= 0) { valid = false; break; }
        const rowH = availW / sumAR;
        rowHeights.push(rowH);
        totalH += rowH;
        rowData.push({ count, rowH, sumAR, startIndex: imgIdx });
        imgIdx += count;
    }
    if (!valid) return null;
    totalH += (part.length - 1) * gap;

    return {
        type: 'rows',
        score: scoreAutoLayout(rowHeights, totalH, TARGET),
        perm, part, rowData,
        totalH, totalW: TARGET,
        gap, externalMargin,
        signature: 'r:' + part.join('-')
    };
}


function tryColLayout(perm, part, gap, externalMargin, TARGET) {
    const colInfos = [];
    let imgIdx = 0;

    for (let count of part) {
        let sumInvAR = 0;
        for (let i = 0; i < count; i++) sumInvAR += 1 / perm[imgIdx + i].ar;
        if (sumInvAR <= 0) return null;
        colInfos.push({ count, sumInvAR, startIndex: imgIdx });
        imgIdx += count;
    }

    const availW = TARGET - (part.length - 1) * gap;
    if (availW <= 0) return null;

    // --- MATEMATIKAI JAVÍTÁS: Itt számoljuk bele a függőleges réseket is a teljes magasságba! ---
    let sumInverse = 0;
    let sumGapTerm = 0;
    for (let ci of colInfos) {
        sumInverse += 1 / ci.sumInvAR;
        sumGapTerm += ((ci.count - 1) * gap) / ci.sumInvAR;
    }

    const totalH = (availW + sumGapTerm) / sumInverse;
    if (totalH <= 0 || !isFinite(totalH)) return null;

    const colWidths = colInfos.map(ci => (totalH - (ci.count - 1) * gap) / ci.sumInvAR);

    // Ha valamelyik oszlop szélessége negatív lenne (mert túl nagy a gap csúszka), ez a layout érvénytelen
    if (colWidths.some(w => w <= 0)) return null;

    const colData = colInfos.map((ci, i) => ({ ...ci, colW: colWidths[i] }));

    return {
        type: 'cols',
        score: scoreAutoLayout(colWidths, totalH, TARGET), // JAVÍTVA a sorrend is
        perm, part, colData,
        totalH, totalW: TARGET,
        gap, externalMargin,
        signature: 'c:' + part.join('-')
    };
}


function scoreAutoLayout(dims, totalH, totalW) {
    // Elsősorban: mennyire négyzetes a végeredmény
    const aspectScore = Math.abs(totalH / totalW - 1) * 8000;
    // Másodsorban: mennyire egyenlők a sorok/oszlopok méretei
    const maxDim = Math.max(...dims);
    const minDim = Math.min(...dims);
    const balanceScore = dims.length > 1 ? (maxDim / minDim - 1) * 1500 : 0;
    return aspectScore + balanceScore;
}

// ── CANVAS RAJZOLÁS ──────────────────────────────────────
function renderAutoCanvas(canvas, layout) {
    canvas.width = 2000; canvas.height = 2000;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 2000, 2000);

    const { gap, externalMargin, totalH, totalW, perm } = layout;
    const maxDrawArea = 2000 - externalMargin * 2;
    const finalScale = Math.min(maxDrawArea / totalW, maxDrawArea / totalH);
    const offsetX = (2000 - totalW * finalScale) / 2;
    const offsetY = (2000 - totalH * finalScale) / 2;

    if (layout.type === 'cols') {
        let currentX = offsetX;
        for (let col of layout.colData) {
            const finalColW = col.colW * finalScale;
            let currentY = offsetY;
            for (let i = 0; i < col.count; i++) {
                const imgItem = perm[col.startIndex + i];
                const finalImgH = (col.colW / imgItem.ar) * finalScale;
                ctx.drawImage(imgItem.canvas, currentX, currentY, finalColW, finalImgH);
                currentY += finalImgH + gap * finalScale;
            }
            currentX += finalColW + gap * finalScale;
        }
    } else {
        let currentY = offsetY;
        for (let row of layout.rowData) {
            let currentX = offsetX;
            const finalRowH = row.rowH * finalScale;
            for (let i = 0; i < row.count; i++) {
                const imgItem = perm[row.startIndex + i];
                const finalImgW = imgItem.ar * row.rowH * finalScale;
                ctx.drawImage(imgItem.canvas, currentX, currentY, finalImgW, finalRowH);
                currentX += finalImgW + gap * finalScale;
            }
            currentY += finalRowH + gap * finalScale;
        }
    }
}


function editAutoCollage() {
    if (!autoSelectedLayout) return;

    const layout = autoSelectedLayout;
    const gap = layout.gap;
    const externalMargin = layout.externalMargin;
    const AUTO_SIZE = 2000;
    const EDITOR_SIZE = 800;
    const scaleFactor = EDITOR_SIZE / AUTO_SIZE;

    // Képek átrendezése a layout perm sorrendje szerint
    loadedImages = layout.perm.map(item => loadedImages[item.originalIndex]);
    originalImages = layout.perm.map(item => originalImages[item.originalIndex]);

    const n = loadedImages.length;
    zoomLevels = new Array(n).fill(1);
    imageOffsets = Array.from({ length: n }, () => ({ x: 0, y: 0 }));
    rotations = new Array(n).fill(0);
    visibilities = new Array(n).fill(true);

    const maxDrawArea = AUTO_SIZE - externalMargin * 2;
    const finalScale = Math.min(maxDrawArea / layout.totalW, maxDrawArea / layout.totalH);
    const offsetXBase = (AUTO_SIZE - layout.totalW * finalScale) / 2;
    const offsetYBase = (AUTO_SIZE - layout.totalH * finalScale) / 2;

    let permIdx = 0;

    const processItem = (imgItem, currentX, currentY, itemW, itemH) => {
        const editorCX = (currentX + itemW / 2) * scaleFactor;
        const editorCY = (currentY + itemH / 2) * scaleFactor;

        const img = loadedImages[permIdx];
        const baseScale = Math.min(EDITOR_SIZE / img.width, EDITOR_SIZE / img.height) * 0.5;

        const finalImgWPx = itemW * scaleFactor;
        const zoom = finalImgWPx / (imgItem.cropW * baseScale);
        zoomLevels[permIdx] = Math.max(0.1, Math.min(3.0, Math.round(zoom * 100) / 100));

        const Z = zoomLevels[permIdx];

        // --- Visszaállítottuk a tiszta, tökéletes matematikát ---
        const prodOffX = (imgItem.cropOffsetX + imgItem.cropW / 2 - img.width / 2) * baseScale * Z;
        const prodOffY = (imgItem.cropOffsetY + imgItem.cropH / 2 - img.height / 2) * baseScale * Z;

        imageOffsets[permIdx] = {
            x: Math.round(editorCX - 1000 - prodOffX),
            y: Math.round(editorCY - 1000 - prodOffY)
        };
        permIdx++;
    };

    if (layout.type === 'cols') {
        let currentX = offsetXBase;
        for (let col of layout.colData) {
            const finalColW = col.colW * finalScale;
            let currentY = offsetYBase;
            for (let i = 0; i < col.count; i++) {
                const imgItem = layout.perm[col.startIndex + i];
                const finalImgH = (col.colW / imgItem.ar) * finalScale;
                processItem(imgItem, currentX, currentY, finalColW, finalImgH);
                currentY += finalImgH + gap * finalScale;
            }
            currentX += finalColW + gap * finalScale;
        }
    } else {
        let currentY = offsetYBase;
        for (let row of layout.rowData) {
            let currentX = offsetXBase;
            const finalRowH = row.rowH * finalScale;
            for (let i = 0; i < row.count; i++) {
                const imgItem = layout.perm[row.startIndex + i];
                const finalImgW = imgItem.ar * row.rowH * finalScale;
                processItem(imgItem, currentX, currentY, finalImgW, finalRowH);
                currentX += finalImgW + gap * finalScale;
            }
            currentY += finalRowH + gap * finalScale;
        }
    }

    currentMode = 'free';
    isSessionActive = true;
    historyStack = [];
    redoStack = [];
    selectedIndices.clear();
    activeImageIndex = -1;

    toggleView('editor');
    setupCanvasInteractions();
    updateUIControls();
    renderCollage();
    saveToPersistentStorage();
    updateHistoryButtonsUI();
    updateCanvasHUD();
}



function regenerateAutoLayouts() {
    autoCurrentLayouts = computeAutoLayouts(autoCroppedImages, autoGap, autoMargin);

    // --- ÚJ RÉSZ: Dinamikus szöveg beállítása ---
    const subtitle = document.getElementById('auto-subtitle');
    if (subtitle) {
        if (autoCurrentLayouts.length === 1) {
            subtitle.textContent = 'Az algoritmus elkészítette az elrendezést';
        } else {
            subtitle.textContent = `Az algoritmus megtalálta a legjobb ${autoCurrentLayouts.length} elrendezést`;
        }
    }

    renderAutoVariants();
}

function renderAutoVariants() {
    const container = document.getElementById('auto-variants-row');
    if (!container) return;
    container.innerHTML = '';

    autoCurrentLayouts.forEach((layout, index) => {
        const card = document.createElement('div');
        card.style.cssText = `
            background:var(--bg-panel);
            border:1.5px solid var(--border-subtle);
            border-radius:var(--radius-lg);
            padding:12px;
            display:flex; flex-direction:column; align-items:center; gap:12px;
            box-shadow:var(--shadow-sm);
            transition:all .2s ease;
            animation: cardEntrance .35s var(--ease-out) forwards;
            animation-delay:${index * 0.08}s;
            opacity:0;
        `;
        card.onmouseenter = () => {
            card.style.borderColor = 'var(--border-medium)';
            card.style.boxShadow = 'var(--shadow-md)';
            card.style.transform = 'translateY(-2px)';
        };
        card.onmouseleave = () => {
            card.style.borderColor = 'var(--border-subtle)';
            card.style.boxShadow = 'var(--shadow-sm)';
            card.style.transform = '';
        };

        const canvas = document.createElement('canvas');
        renderAutoCanvas(canvas, layout);
        canvas.style.cssText = 'width:260px;height:260px;border-radius:0;display:block;border:1px solid var(--border-subtle);';

        const label = document.createElement('div');
        label.style.cssText = 'font-size:11px;font-weight:700;color:var(--text-secondary);letter-spacing:.01em;';
        label.textContent = `${index + 1}. változat`;

        const btn = document.createElement('button');
        btn.style.cssText = `
            width:100%; height:34px;
            border:none; border-radius:var(--radius-sm);
            background:var(--text-main); color:var(--bg-panel);
            font-family:'Plus Jakarta Sans',sans-serif;
            font-size:12px; font-weight:700; cursor:pointer;
            display:flex; align-items:center; justify-content:center; gap:5px;
            transition:opacity .15s ease;
        `;
        btn.innerHTML = '<i data-lucide="check" style="width:13px;height:13px;"></i> Kiválasztás';
        btn.onmouseenter = () => btn.style.opacity = '.82';
        btn.onmouseleave = () => btn.style.opacity = '1';
        btn.onclick = () => selectAutoLayout(layout, index);

        card.appendChild(canvas);
        card.appendChild(label);
        card.appendChild(btn);
        container.appendChild(card);
    });

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ── KIVÁLASZTÁS ──────────────────────────────────────────
function selectAutoLayout(layout, index) {
    autoSelectedLayout = layout;

    document.getElementById('auto-variants-row').style.display = 'none';
    document.getElementById('auto-back-container').style.display = 'none'; // <--- EZT ADD
    document.getElementById('auto-controls').style.display = 'none';
    document.getElementById('auto-selected-view').style.display = 'flex';
    document.getElementById('auto-title').textContent = `${index + 1}. változat kiválasztva`;
    document.getElementById('auto-subtitle').textContent = 'Letöltheted, vagy megnyithatod szerkesztésre';
    document.getElementById('auto-mini-gallery-container').style.display = 'none'; // ÚJ: Elrejtjük

    const canvas = document.getElementById('auto-selected-canvas');
    renderAutoCanvas(canvas, layout);

    if (typeof lucide !== 'undefined') lucide.createIcons();
    markAutoAsUnsaved();
}

// ── VISSZALÉPÉS A MÓDVÁLASZTÓHOZ (Automata módból) ──
function backToModeSelection() {
    // 1. Megnyitjuk a Start képernyőt
    toggleView('start');

    // 2. A toggleView alapból a feltöltőt mutatná, ezt felülbíráljuk:
    document.getElementById('upload-step').classList.add('d-none');
    document.getElementById('mode-selection-step').classList.remove('d-none');

    // 3. Biztonság kedvéért elrejtjük az automata képernyőt
    document.getElementById('auto-screen').classList.add('d-none');

    // 4. Kinullázzuk az automata állapotokat
    autoSelectedLayout = null;
}

function backToAutoSelect() {
    autoSelectedLayout = null;
    document.getElementById('auto-variants-row').style.display = 'flex';
    document.getElementById('auto-back-container').style.display = 'flex'; // <--- EZT
    document.getElementById('auto-controls').style.display = 'flex';
    document.getElementById('auto-selected-view').style.display = 'none';
    document.getElementById('auto-title').textContent = 'Válassz egy elrendezést';
    document.getElementById('auto-mini-gallery-container').style.display = 'flex'; // ÚJ: Visszahozzuk

    // --- ÚJ RÉSZ: Visszaálláskor is dinamikus a szöveg ---
    const subtitle = document.getElementById('auto-subtitle');
    if (subtitle) {
        if (autoCurrentLayouts.length === 1) {
            subtitle.textContent = 'Az algoritmus elkészítette az elrendezést';
        } else {
            subtitle.textContent = `Az algoritmus megtalálta a legjobb ${autoCurrentLayouts.length} elrendezést`;
        }
    }
}

function downloadAutoCollage() {
    if (!autoSelectedLayout) return;
    const canvas = document.getElementById('auto-selected-canvas');
    const now = new Date();
    const ds = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    const ts = String(now.getHours()).padStart(2, '0') + '-' + String(now.getMinutes()).padStart(2, '0');

    // Fájlkiterjesztés meghatározása itt is
    const ext = exportFormat === 'image/jpeg' ? 'jpg' : (exportFormat === 'image/webp' ? 'webp' : 'png');

    const link = document.createElement('a');
    link.download = `auto_kollazs_${ds}_${ts}.${ext}`;
    // Itt is alkalmazzuk a minőségi beállításokat
    link.href = canvas.toDataURL(exportFormat, exportQuality);
    link.click();
    markAutoAsSaved();
}


// --- EXPORT BEÁLLÍTÁSOK KEZELÉSE ---
function updateExportSettings() {
    const formatSelect = document.getElementById('exportFormatSelect');
    const qualitySlider = document.getElementById('exportQualitySlider');
    const qualityContainer = document.getElementById('exportQualityContainer');
    const qualityVal = document.getElementById('exportQualityVal');

    exportFormat = formatSelect.value;
    exportQuality = parseFloat(qualitySlider.value);

    // Mentés a böngészőbe
    localStorage.setItem('collage_export_format', exportFormat);
    localStorage.setItem('collage_export_quality', exportQuality);

    // Csúszka megjelenítése/elrejtése formátumtól függően
    if (exportFormat === 'image/png') {
        qualityContainer.style.display = 'none';
    } else {
        qualityContainer.style.display = 'flex';
        qualityVal.innerText = Math.round(exportQuality * 100) + '%';
    }
}


// --- ÚJ: Minigaléria kirajzolása és Drag&Drop kezelése ---
function renderAutoMiniGallery() {
    const gallery = document.getElementById('auto-mini-gallery');
    if (!gallery) return;
    gallery.innerHTML = '';

    loadedImages.forEach((img, i) => {
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'position: relative; width: 64px; height: 64px; border-radius: 6px; border: 1.5px solid var(--border-subtle); background: var(--bg-sunken); flex-shrink: 0; cursor: grab; overflow: hidden; transition: border-color 0.2s;';
        wrapper.draggable = true;
        
        // Drag események az átrendezéshez
        wrapper.ondragstart = (e) => {
            e.dataTransfer.setData('text/plain', i);
            wrapper.style.opacity = '0.4';
        };
        wrapper.ondragend = () => { wrapper.style.opacity = '1'; };
        wrapper.ondragover = (e) => { e.preventDefault(); wrapper.style.borderColor = 'var(--accent-color)'; };
        wrapper.ondragleave = () => { wrapper.style.borderColor = 'var(--border-subtle)'; };
        
        wrapper.ondrop = (e) => {
            e.preventDefault();
            wrapper.style.borderColor = 'var(--border-subtle)';
            const fromIdx = parseInt(e.dataTransfer.getData('text/plain'));
            const toIdx = i;
            if (fromIdx !== toIdx && !isNaN(fromIdx)) {
                // 1. Átrendezzük a globális tömböket (ezzel a meglévő függvényeddel)
                reorderArrayItems(fromIdx, toIdx);
                
                // 2. Átrendezzük az autoCroppedImages tömböt is
                const item = autoCroppedImages[fromIdx];
                autoCroppedImages.splice(fromIdx, 1);
                autoCroppedImages.splice(toIdx, 0, item);
                
                // 3. Frissítjük az eredeti indexeket, nehogy elcsússzon
                autoCroppedImages.forEach((ac, idx) => ac.originalIndex = idx);

                // 4. Okos UX: Ha a felhasználó kézzel átrendezi, biztos ragaszkodik hozzá. Bekapcsoljuk a pipát.
                const keepOrderCb = document.getElementById('auto-keep-order');
                if(keepOrderCb && !keepOrderCb.checked) keepOrderCb.checked = true;

                renderAutoMiniGallery();
                regenerateAutoLayouts();
            }
        };

        const thumb = document.createElement('img');
        thumb.src = img.src;
        thumb.style.cssText = 'width: 100%; height: 100%; object-fit: contain; pointer-events: none;';

        // Forgatás gomb
        const rotBtn = document.createElement('button');
        rotBtn.innerHTML = '<i data-lucide="rotate-cw"></i>';
        rotBtn.style.cssText = 'position: absolute; bottom: 3px; right: 3px; width: 22px; height: 22px; border-radius: 4px; background: var(--bg-overlay); border: 1px solid var(--border-subtle); display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--text-main); padding: 0; box-shadow: var(--shadow-sm);';
        
        rotBtn.onclick = (e) => {
            e.stopPropagation();
            physicallyRotateImageForAuto(i);
        };

        wrapper.appendChild(thumb);
        wrapper.appendChild(rotBtn);
        gallery.appendChild(wrapper);
    });

    if (window.lucide) lucide.createIcons();
}

// --- ÚJ: Kép fizikai elforgatása (hogy tökéletes maradjon a vágás és a hitbox is) ---
function physicallyRotateImageForAuto(index) {
    const overlay = document.getElementById('processingOverlay');
    if(overlay) overlay.style.display = 'flex';

    setTimeout(() => {
        // Létrehozunk egy segédfüggvényt, ami forgat egy képet 90 fokkal
        const rotateCanvas = (img) => {
            return new Promise(resolve => {
                const canvas = document.createElement('canvas');
                canvas.width = img.height; // Felcseréljük a méreteket
                canvas.height = img.width;
                const ctx = canvas.getContext('2d');
                ctx.translate(canvas.width / 2, canvas.height / 2);
                ctx.rotate(90 * Math.PI / 180);
                ctx.drawImage(img, -img.width / 2, -img.height / 2);
                
                const newImg = new Image();
                newImg.dataset.uId = img.dataset.uId;
                newImg.onload = () => resolve(newImg);
                newImg.src = canvas.toDataURL();
            });
        };

        // Forgatjuk a látható és az eredeti képet is egyszerre
        Promise.all([
            rotateCanvas(loadedImages[index]),
            rotateCanvas(originalImages[index])
        ]).then(([newLoaded, newOriginal]) => {
            loadedImages[index] = newLoaded;
            originalImages[index] = newOriginal;
            
            // Frissítjük a vágott auto-verziót is, hiszen megváltoztak az arányai!
            autoCroppedImages[index] = processAndCropForAuto(newLoaded, index);
            
            renderAutoMiniGallery();
            regenerateAutoLayouts();
            if(overlay) overlay.style.display = 'none';
        });
    }, 50);
}



// ==========================================
// ── KUKA (TRASH) LOGIKA ──
// ==========================================

function renderTrashUI() {
    const trashSection = document.getElementById('trash-section');
    const trashContainer = document.getElementById('trash-items-container');
    if (!trashSection || !trashContainer) return;

    if (deletedImagesTrash.length === 0) {
        trashSection.style.display = 'none';
        return;
    }

    trashSection.style.display = 'flex';
    trashContainer.innerHTML = '';

    deletedImagesTrash.forEach((item, idx) => {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'position: relative; width: 44px; height: 44px; border-radius: 6px; border: 1px solid var(--border-subtle); background: var(--bg-elevated); flex-shrink: 0; cursor: pointer; overflow: hidden;';
        wrap.title = 'Kattints a visszaállításhoz';
        wrap.onclick = () => restoreFromTrash(idx);

        const img = document.createElement('img');
        img.src = item.loaded.src;
        img.style.cssText = 'width: 100%; height: 100%; object-fit: contain; opacity: 0.7; transition: all 0.2s ease;';
        
        const restoreIcon = document.createElement('div');
        restoreIcon.innerHTML = '<i data-lucide="undo"></i>';
        restoreIcon.style.cssText = 'position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.5); color: white; opacity: 0; transition: all 0.2s ease;';
        
        wrap.onmouseenter = () => { img.style.opacity = '1'; img.style.transform = 'scale(1.1)'; restoreIcon.style.opacity = '1'; };
        wrap.onmouseleave = () => { img.style.opacity = '0.7'; img.style.transform = 'scale(1)'; restoreIcon.style.opacity = '0'; };

        wrap.appendChild(img);
        wrap.appendChild(restoreIcon);
        trashContainer.appendChild(wrap);
    });

    if (window.lucide) lucide.createIcons();
}

function restoreFromTrash(trashIdx) {
    pushState(); // Visszavonható lépés
    
    const item = deletedImagesTrash[trashIdx];
    
    // Visszatöltés a munkaterületre
    originalImages.push(item.original);
    loadedImages.push(item.loaded);
    zoomLevels.push(item.zoom);
    imageOffsets.push({ x: item.offset.x, y: item.offset.y });
    rotations.push(item.rotation);
    visibilities.push(item.visible);

    // Kiveszük a kukából
    deletedImagesTrash.splice(trashIdx, 1);

    // Automatikus kijelölés a visszaállított képen
    selectedIndices.clear();
    const newIndex = loadedImages.length - 1;
    selectedIndices.add(newIndex);
    activeImageIndex = newIndex;

    updateUIControls(true);
    renderCollage();
    saveToPersistentStorage();
}

function emptyTrash() {
    if (!confirm('Biztosan véglegesen törlöd a kuka tartalmát?')) return;
    pushState(); // Az ürítés is visszavonható!
    deletedImagesTrash = [];
    updateUIControls(true);
    saveToPersistentStorage();
}

function switchLayoutMode() {
    clearPersistentStorage();
    historyStack = [];
    redoStack = [];
    selectedIndices.clear();
    activeImageIndex = -1;
    isSessionActive = false;

    toggleView('start');
    document.getElementById('upload-step').classList.add('d-none');
    document.getElementById('mode-selection-step').classList.remove('d-none');

    renderUploadPreview();
    updateAutoModeCard();
    lucide.createIcons();
}