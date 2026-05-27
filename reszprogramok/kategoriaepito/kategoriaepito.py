import pandas as pd
from playwright.sync_api import sync_playwright, Browser, BrowserContext as Context
import time
import sys
import os
import json
import re
import datetime
from dotenv import load_dotenv


# ==============================================================================
# --- KÉP KONFIGURÁCIÓ ---
# Ezt az EGY képet tölti fel a program MINDEN kategóriához.
# Hozd létre a "feltoltes_alatt" mappát és tegyél bele egy képet ezzel a névvel.
# Támogatott formátumok: .jpg, .jpeg, .png, .webp
# ==============================================================================
PLACEHOLDER_KEP = os.path.join("feltoltes_alatt", "feltoltes_alatt.jpg")


# ==============================================================================
# --- STATE MANAGEMENT ---
# Atomic write: temp fájlba ír, majd os.replace-el cseréli le.
# Ha a program crash közben áll le, a progress fájl soha nem sérül meg.
# ==============================================================================
def _json_betoltes(fajl, alapertelmezett):
    if os.path.exists(fajl):
        try:
            with open(fajl, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"⚠️ Sérült/hiányzó menetfájl ({fajl}), alapértékkel indulunk: {e}")
    return alapertelmezett


def _json_mentes(fajl, adatok):
    """Atomi mentés: nem sérülhet crash esetén."""
    tmp = fajl + ".tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(adatok, f, ensure_ascii=False, indent=2)
        os.replace(tmp, fajl)
    except Exception as e:
        print(f"⚠️ Menetfájl mentési hiba ({fajl}): {e}")


def progress_betoltes(progress_fajl):
    """
    Betölti a mentett progress-t.
    Visszatér: (completed_set, failed_list)
    - completed_set: sikeresen létrehozott kategóriák raw neve (set a gyors kereséshez)
    - failed_list: véglegesen meghiúsult kategóriák listája (exporthoz)
    """
    data = _json_betoltes(progress_fajl, {"completed": [], "failed": []})
    return set(data.get("completed", [])), data.get("failed", [])


def progress_mentes(progress_fajl, completed_set, failed_list):
    _json_mentes(progress_fajl, {
        "completed": list(completed_set),
        "failed": failed_list
    })


# ==============================================================================
# --- 1. LÉPÉS: Adatbeolvasás és Szintezés ---
# ==============================================================================
def adatok_beolvasasa(excel_fajl_neve):
    try:
        df = pd.read_excel(excel_fajl_neve, dtype=str, header=None)
    except Exception as e:
        print(f"❌ HIBA az Excel beolvasása közben: {e}")
        return None

    if df.empty:
        print("❌ A kiválasztott Excel fájl üres!")
        return None

    feldolgozando_lista = []

    for _, row in df.iterrows():
        raw_name = str(row[0]).strip()
        if not raw_name or raw_name.lower() == 'nan':
            continue
        if raw_name.lower() in ["kategória", "kategóriák", "kategoria"]:
            continue

        match = re.match(r'^([- ]*)(.*)', raw_name)
        prefix = match.group(1).replace(" ", "")
        level = len(prefix)
        tiszta_nev = match.group(2).strip()

        feldolgozando_lista.append({"level": level, "name": tiszta_nev, "raw": raw_name})

    return feldolgozando_lista


# ==============================================================================
# --- 2. LÉPÉS: Kategória Szülő Beállítása ---
# ==============================================================================
def kategoria_szulo_beallitasa(page, kategoria_nev):
    try:
        container = page.locator("div.selectize-control.categories.single").first
        input_mezo = container.locator("input[type='text']")

        input_mezo.click(timeout=5000)
        input_mezo.fill("")
        time.sleep(0.5)

        if kategoria_nev == "Felső szintű kategória":
            input_mezo.fill(kategoria_nev)
        else:
            input_mezo.press_sequentially(kategoria_nev[:10], delay=100)

        time.sleep(2)

        dropdown = page.locator("div.selectize-dropdown.categories.single").first
        opciok = dropdown.locator("div.option").all()

        for opcio in opciok:
            szoveg = opcio.inner_text().strip()
            tiszta_szoveg = re.sub(r'^[-\s\xa0]+', '', szoveg)
            if tiszta_szoveg.lower() == kategoria_nev.lower() or szoveg == kategoria_nev:
                opcio.click(force=True)
                return True

        print(f"   ⚠️ Nem találtam pontos egyezést a szülőre: '{kategoria_nev}'")
        input_mezo.press("Escape")
        return False
    except Exception as e:
        print(f"   ❌ Szülő beállítási hiba: {e}")
        return False


# ==============================================================================
# --- 5. LÉPÉS: Fő Feldolgozó ---
# Crash recovery: minden sikeres létrehozás után menti a progress-t.
# Újraindításkor a completed_set alapján kihagyja a kész kategóriákat,
# de a hierarchiát (utolso_kategoriak) helyesen rekonstruálja.
# Retry: max 3 próba kategóriánként.
# Láncreakció védelem: ha egy szülő elbukik, a gyerekei automatikusan átugrásra kerülnek.
# ==============================================================================
def run_category_builder(context: Context, struktura, base_url, bemeneti_fajl_neve,
                         progress_fajl, completed_set, failed_list,
                         placeholder_kep=PLACEHOLDER_KEP):
    try:
        page = context.new_page()
    except Exception as e:
        print(f"❌ HIBA: Nem sikerült böngészőlapot nyitni: {e}")
        return

    utolso_kategoriak = {-1: "Felső szintű kategória"}
    veglegesen_sikertelen_lista = list(failed_list)  # Másolat a korábbi hibákból
    hibas_ag_szintje = None
    max_proba = 3

    # Placeholder kép ellenőrzés
    placeholder_kep_ut = os.path.abspath(placeholder_kep) if os.path.exists(placeholder_kep) else None
    if placeholder_kep_ut:
        print(f"\n🖼️ Placeholder kép: '{placeholder_kep}' — minden kategóriához feltöltve.")
    else:
        print(f"\n⚠️ Placeholder kép nem található: '{placeholder_kep}' — Képek nélkül folytatjuk.")
        print(f"   (Hozd létre: feltoltes_alatt/feltoltes_alatt.jpg)")

    osszes = len(struktura)
    mar_kesz = len(completed_set)
    print(f"\n--- Építés: {osszes} kategória összesen")
    if mar_kesz > 0:
        print(f"    Már kész (kihagyva): {mar_kesz} db")
        print(f"    Még létrehozandó:    {osszes - mar_kesz} db")
    print("─" * 50)

    for i, elem in enumerate(struktura):
        szint = elem['level']
        nev = elem['name']
        raw = elem['raw']
        szulo_nev = utolso_kategoriak.get(szint - 1, "Felső szintű kategória")

        print(f"\n[{i + 1}/{osszes}] {'›' * (szint + 1)} {nev}  (Szülő: {szulo_nev})")

        # HIERARCHIA FRISSÍTÉS: mindig frissítjük, hogy az átugrott kategóriák
        # gyerekeinek szülő-hivatkozása helyes maradjon újraindítás után is.
        utolso_kategoriak[szint] = nev

        # ── MÁR KÉSZ: kihagyás ──────────────────────────────────────────────
        if raw in completed_set:
            print(f"   ⏩ MÁR LÉTREHOZVA, kihagyás.")
            # Ha egy kész kategória volt az aktív hibás ág szülője, töröljük a zárolást
            if hibas_ag_szintje is not None and szint <= hibas_ag_szintje:
                hibas_ag_szintje = None
            continue

        # ── LÁNCREAKCIÓ VÉDELEM ──────────────────────────────────────────────
        if hibas_ag_szintje is not None:
            if szint > hibas_ag_szintje:
                print(f"   ⏩ ÁTUGORVA: Szülő ág létrehozása korábban meghiúsult.")
                veglegesen_sikertelen_lista.append({
                    "Kategória az Excelben": raw,
                    "Hiba oka": "Átugorva (szülő ág hibás)"
                })
                continue
            else:
                hibas_ag_szintje = None
                print(f"   🔄 Hibás ág elhagyva, folytatás...")

        # ── LÉTREHOZÁS + KÉP FELTÖLTÉS EGYSZERRE (max max_proba próba) ─────
        siker = False
        vegleges_hiba = ""

        for proba in range(1, max_proba + 1):
            try:
                if proba > 1:
                    print(f"   🔁 Újrapróbálkozás ({proba}/{max_proba})...")

                page.goto(
                    f"{base_url}/administrator/index.php?view=category&new=1&parent=0",
                    timeout=60000
                )
                page.wait_for_selector("input#name", timeout=10000)
                page.fill("input#name", nev)

                if szulo_nev != "Felső szintű kategória":
                    szulo_ok = kategoria_szulo_beallitasa(page, szulo_nev)
                    if not szulo_ok:
                        raise Exception(f"Szülő beállítása sikertelen: '{szulo_nev}'")

                # Kép feltöltése a létrehozási formon (mentés ELŐTT)
                if placeholder_kep_ut:
                    page.locator("label[for='kepek']").wait_for(state="visible", timeout=5000)
                    page.locator("label[for='kepek']").click()
                    time.sleep(0.5)
                    page.locator("input#newImage").set_input_files(placeholder_kep_ut)
                    print(f"   🖼️ Kép csatolva.")
                    time.sleep(3)  # Feltöltési idő

                page.locator("a#save_close").click()

                # Megvárjuk, hogy visszatérjünk a listára (mentés jele)
                try:
                    page.wait_for_url(lambda url: "view=store" in url, timeout=20000)
                except:
                    time.sleep(3)

                time.sleep(1.5)
                siker = True
                print(f"   ✅ Kategória létrehozva{' + kép feltöltve' if placeholder_kep_ut else ''}.")
                break

            except Exception as e:
                vegleges_hiba = str(e)
                print(f"   ❌ Hiba ({proba}. próba): {vegleges_hiba}")
                try:
                    page.goto(
                        f"{base_url}/administrator/index.php?view=store&mode=2",
                        timeout=15000
                    )
                    time.sleep(2)
                except:
                    pass

        # ── PROGRESS MENTÉS ─────────────────────────────────────────────────
        if siker:
            completed_set.add(raw)
            progress_mentes(progress_fajl, completed_set, veglegesen_sikertelen_lista)

        # ── HA VÉGLEG ELBUKOTT ───────────────────────────────────────────────
        else:
            print(f"   ⛔ VÉGLEGESEN MEGHIÚSULT: '{nev}'")
            veglegesen_sikertelen_lista.append({
                "Kategória az Excelben": raw,
                "Hiba oka": vegleges_hiba
            })
            hibas_ag_szintje = szint
            progress_mentes(progress_fajl, completed_set, veglegesen_sikertelen_lista)

    print("\n" + "=" * 50)
    print("🎉 Kategória struktúra építése befejeződött!")
    print("=" * 50)
    page.close()

    # ── HIBALISTA EXPORTÁLÁSA ────────────────────────────────────────────────
    if veglegesen_sikertelen_lista:
        print(f"\n📑 Nem feldolgozott kategóriák: {len(veglegesen_sikertelen_lista)} db")
        SIKERTELEN_MAPPA = "sikertelen_tablak"
        try:
            os.makedirs(SIKERTELEN_MAPPA, exist_ok=True)
            df_sikertelen = pd.DataFrame(veglegesen_sikertelen_lista)
            alap_nev = os.path.splitext(os.path.basename(bemeneti_fajl_neve))[0]
            timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M")
            fnev = f"{alap_nev}_kategoria_hiba_{timestamp}.xlsx"
            utvonal = os.path.join(SIKERTELEN_MAPPA, fnev)
            df_sikertelen.to_excel(utvonal, index=False)
            print(f"   💾 Hibalista exportálva: {utvonal}")
        except Exception as e:
            print(f"   ❌ Hibalista export hiba: {e}")
    else:
        print("\n✅ Minden kategória sikeresen létrejött, hibalista nem szükséges.")


# ==============================================================================
# --- BEJELENTKEZÉS ---
# Meglévő session újrafelhasználása, ha érvényes. Különben új login.
# ==============================================================================
def bejelentkezes_kezelese(browser: Browser, username, password, base_url, state_fajl):
    if os.path.exists(state_fajl):
        print(f"   Session betöltése: {state_fajl}")
        try:
            ctx = browser.new_context(storage_state=state_fajl)
            page = ctx.new_page()
            page.goto(f"{base_url}/administrator/", timeout=15000)
            if page.locator("#searchField_all").is_visible(timeout=5000):
                print("   ✅ Session érvényes, újrabejelentkezés nem szükséges.")
                page.close()
                return ctx
            page.close()
            ctx.close()
        except:
            pass
        print("   ⚠️ Session lejárt, új bejelentkezés...")

    ctx = browser.new_context()
    page = ctx.new_page()
    try:
        page.goto(f"{base_url}/administrator/", timeout=15000)
        page.fill("input[name='username']", username)
        page.fill("input[name='password']", password)
        page.click("button[type='submit']")
        page.wait_for_selector("#searchField_all", timeout=10000)
        ctx.storage_state(path=state_fajl)
        print("   ✅ Bejelentkezés sikeres.")
    except Exception as e:
        print(f"❌ LOGIN HIBA: {e}")
        browser.close()
        sys.exit(1)
    page.close()
    return ctx


# ==============================================================================
# --- FŐPROGRAM ---
# ==============================================================================
if __name__ == "__main__":
    load_dotenv()
    MAPPA = "input_tablak"

    print("\n" + "=" * 50)
    print(" 🌳 KATEGÓRIA STRUKTÚRA ÉPÍTŐ + KÉP FELTÖLTŐ 🌳")
    print("=" * 50)

    # Webshop választás
    print("\n  1: SZVG Tools (szvgtoolsshop.hu)")
    print("  2: PTD Bolt (ptdbolt.hu)")
    v = ""
    while v not in ["1", "2"]:
        v = input("Választás (1-2): ").strip()

    if v == '1':
        USER  = os.getenv("SZVG_USERNAME")
        PASS  = os.getenv("SZVG_PASSWORD")
        URL   = "https://szvgtoolsshop.hu"
        STATE = "state_szvg.json"
    else:
        USER  = os.getenv("PTD_USERNAME")
        PASS  = os.getenv("PTD_PASSWORD")
        URL   = "https://ptdbolt.hu"
        STATE = "state_ptd.json"

    if not USER or not PASS:
        print("❌ HIBA: Hiányoznak a bejelentkezési adatok a .env fájlból!")
        sys.exit(1)

    # Excel fájl választás
    if not os.path.exists(MAPPA):
        print(f"\n❌ HIBA: Hozd létre az '{MAPPA}' mappát és tegyél bele Excel fájlt!")
        sys.exit(1)

    fajlok = [f for f in os.listdir(MAPPA) if f.endswith(('.xlsx', '.xls'))]
    if not fajlok:
        print(f"\n❌ HIBA: Üres az '{MAPPA}' mappa.")
        sys.exit(1)

    print("\n--- Excel fájl választása ---")
    for i, f in enumerate(fajlok):
        print(f"  {i + 1}: {f}")

    try:
        idx = int(input("Fájl sorszáma: ").strip()) - 1
        valasztott_fajl = fajlok[idx]
        fajl_utvonal = os.path.join(MAPPA, valasztott_fajl)
    except (ValueError, IndexError):
        print("❌ Érvénytelen választás.")
        sys.exit(1)

    # Progress fájl neve a bemeneti fájl neve alapján (mappánként különböző)
    clean_fajlnev = re.sub(r'[^\w]', '_', os.path.splitext(valasztott_fajl)[0])
    progress_fajl = f"progress_kategoriaepito_{clean_fajlnev}.json"

    # ── ÁLLAPOT FELISMERÉS INDULÁSKOR ───────────────────────────────────────
    completed_set, failed_list = progress_betoltes(progress_fajl)

    struktura = adatok_beolvasasa(fajl_utvonal)
    if not struktura:
        print("❌ Nem sikerült beolvasni az Excel fájlt.")
        sys.exit(1)

    osszes = len(struktura)
    kesz_db = sum(1 for e in struktura if e['raw'] in completed_set)

    if kesz_db > 0:
        print(f"\n⚠️ Korábbi munkamenet nyomait találtam ({valasztott_fajl}):")
        print(f"   Összes kategória:     {osszes} db")
        print(f"   Már sikeresen kész:   {kesz_db} db")
        print(f"   Még létrehozandó:     {osszes - kesz_db} db")
        if failed_list:
            print(f"   Korábbi hibák száma:  {len(failed_list)} db")

        print("\n  1: FOLYTATÁS (kész kategóriák kihagyása)")
        print("  2: ÚJRAKEZDÉS (progress törlése, minden újra)")

        ujra_v = ""
        while ujra_v not in ["1", "2"]:
            ujra_v = input("Választás (1-2): ").strip()

        if ujra_v == "2":
            os.remove(progress_fajl)
            completed_set = set()
            failed_list = []
            print("   🗑️ Progress törölve. Tiszta lappal indulunk.")
    else:
        print(f"\n✅ Új munkamenet: {osszes} kategória fog létrejönni.")

    # Placeholder kép tájékoztató
    print(f"\n📁 Placeholder kép: '{PLACEHOLDER_KEP}'")
    if os.path.exists(PLACEHOLDER_KEP):
        print(f"   ✅ Kép megtalálva — minden kategóriához ez lesz feltöltve.")
    else:
        print(f"   ⚠️ Nem található — képek nélkül futtatjuk.")
        print(f"   Hozd létre: feltoltes_alatt/ mappát, és tegyél bele egy 'feltoltes_alatt.jpg' fájlt.")

    input("\n▶ ENTER a folyamat indításához...")

    # ── BÖNGÉSZŐ INDÍTÁS ÉS FUTTATÁS ────────────────────────────────────────
    with sync_playwright() as p:
        print("\n🔄 Böngésző indítása...")
        browser = p.chromium.launch(headless=False)
        ctx = bejelentkezes_kezelese(browser, USER, PASS, URL, STATE)

        if ctx:
            try:
                run_category_builder(
                    ctx, struktura, URL, valasztott_fajl,
                    progress_fajl, completed_set, failed_list
                )

                # Ha mindent sikeresen feldolgoztunk, a progress fájl törölhető
                osszes_kesz = sum(1 for e in struktura if e['raw'] in completed_set)
                if osszes_kesz == osszes and os.path.exists(progress_fajl):
                    os.remove(progress_fajl)
                    print("\n🗑️ Progress fájl törölve (minden kategória kész).")

            except Exception as e:
                import traceback
                traceback.print_exc()
                print(f"\n⚠️ Váratlan hiba: {e}")
                print("💡 A progress el van mentve. Újraindítás után onnan folytatja.")

        browser.close()

    print("\n🎉 Program befejeződött!")