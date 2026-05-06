import pandas as pd
from playwright.sync_api import sync_playwright, Browser, BrowserContext as Context
import time
import sys
import os
import json
import re
import datetime
from dotenv import load_dotenv


# --- 1. LÉPÉS: Adatbeolvasás és Szintezés ---
def adatok_beolvasasa(excel_fajl_neve):
    try:
        # header=None: Az első sort is adatnak veszi
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


# --- 2. LÉPÉS: Kategória Kiválasztó ---
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

        print(f"   ⚠️ Nem találtam pontos egyezést a szülőre: {kategoria_nev}")
        input_mezo.press("Escape")
        return False
    except Exception as e:
        print(f"   ❌ Hiba a szülő beállításakor: {e}")
        return False


# --- 3. LÉPÉS: Fő Feldolgozó (Hibakezeléssel) ---
def run_category_builder(context: Context, struktura, base_url, bemeneti_fajl_neve):
    try:
        page = context.new_page()
    except Exception as e:
        print(f"❌ HIBA: Nem sikerült új böngésző lapot nyitni: {e}")
        return

    utolso_kategoriak = {-1: "Felső szintű kategória"}

    veglegesen_sikertelen_lista = []
    # Ha ez nem None, akkor egy szülő elbukott. Tároljuk, hogy MILYEN szinten bukott el.
    hibas_ag_szintje = None

    print(f"\n--- Építés megkezdése: {len(struktura)} kategória ---")

    for i, elem in enumerate(struktura):
        szint = elem['level']
        nev = elem['name']
        eredeti_nev = elem['raw']
        szulo_nev = utolso_kategoriak.get(szint - 1, "Felső szintű kategória")

        print(f"\n[{i + 1}/{len(struktura)}] {'>' * szint} {nev} (Szülő: {szulo_nev})")

        # --- LÁNCREAKCIÓ VÉDELEM ---
        if hibas_ag_szintje is not None:
            # Ha az aktuális elem mélyebben van (vagy egyenlő szinten, de gyerekként beágyazva),
            # mint a hibás szülő, akkor átugorjuk.
            if szint > hibas_ag_szintje:
                print(f"   ⏩ ÁTUGORVA: A szülő ág létrehozása korábban meghiúsult.")
                veglegesen_sikertelen_lista.append((eredeti_nev, "Átugorva (Szülő ág hiba)"))
                continue
            else:
                # Visszaértünk egy azonos vagy magasabb szintű kategóriához, a hiba "lecsengett"
                hibas_ag_szintje = None
                print(f"   🔄 Hibás ág elhagyva, folytatás a(z) {szint}. szinten.")

        # --- ÚJRAPRÓBÁLKOZÁS (MAX 2x) ---
        max_proba = 2
        siker = False
        vegleges_hiba_uzenet = ""

        for proba in range(1, max_proba + 1):
            try:
                if proba > 1:
                    print(f"   ⚠️ Újrapróbálkozás ({proba}/{max_proba})...")

                page.goto(f"{base_url}/administrator/index.php?view=category&new=1&parent=0", timeout=60000)

                page.wait_for_selector("input#name", timeout=10000)
                page.fill("input#name", nev)

                if szulo_nev != "Felső szintű kategória":
                    szulo_siker = kategoria_szulo_beallitasa(page, szulo_nev)
                    if not szulo_siker:
                        raise Exception(f"Nem sikerült beállítani a szülőt: '{szulo_nev}'")

                page.locator("a#save_close").click()
                time.sleep(3)

                utolso_kategoriak[szint] = nev
                siker = True
                print(f"   ✅ Létrehozva.")
                break  # Kilép a próbálkozós ciklusból, ha sikeres

            except Exception as e:
                vegleges_hiba_uzenet = str(e)
                print(f"   ❌ Hiba ({proba}. próba): {vegleges_hiba_uzenet}")
                try:
                    # Hiba esetén "kiszabadítjuk" a felületet
                    page.goto(f"{base_url}/administrator/index.php?view=store&mode=2", timeout=15000)
                except:
                    pass

        # --- HA VÉGLEG ELBUKOTT ---
        if not siker:
            print(f"   ⛔ VÉGLEG MEGHÍUSULT: '{nev}'")
            veglegesen_sikertelen_lista.append((eredeti_nev, vegleges_hiba_uzenet))
            hibas_ag_szintje = szint  # Zároljuk az alatta lévő ágakat!

    print("\n" + "=" * 40)
    print("🎉 A kategória struktúra építése befejeződött!")
    print("=" * 40)
    page.close()

    # --- HIBALISTA EXPORTÁLÁSA ---
    if veglegesen_sikertelen_lista:
        print(f"\n📑 Kategóriák, amiket nem sikerült feldolgozni ({len(veglegesen_sikertelen_lista)} db):")
        SIKERTELEN_MAPPA = "sikertelen_tablak"
        try:
            os.makedirs(SIKERTELEN_MAPPA, exist_ok=True)
            export_adatok = [{"Kategória az Excelben": nev, "Hiba oka": hiba} for nev, hiba in
                             veglegesen_sikertelen_lista]
            df_sikertelen = pd.DataFrame(export_adatok)

            alap_nev = os.path.splitext(os.path.basename(bemeneti_fajl_neve))[0]
            timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M")
            fnev = f"{alap_nev}_kategoria_hiba_{timestamp}.xlsx"
            utvonal = os.path.join(SIKERTELEN_MAPPA, fnev)

            df_sikertelen.to_excel(utvonal, index=False)
            print(f"   💾 Hibalista kimentve ide: {utvonal}")
        except Exception as e:
            print(f"   ❌ Nem sikerült a hibalistát kimenteni: {e}")


# --- 4. LÉPÉS: Bejelentkezés ---
def bejelentkezes_kezelese(browser: Browser, username, password, base_url, state_fajl):
    if os.path.exists(state_fajl):
        try:
            context = browser.new_context(storage_state=state_fajl)
            page = context.new_page()
            page.goto(f"{base_url}/administrator/", timeout=15000)
            if page.locator("#searchField_all").is_visible(timeout=5000):
                page.close()
                return context
        except:
            pass

    context = browser.new_context()
    page = context.new_page()
    page.goto(f"{base_url}/administrator/")
    page.fill("input[name='username']", username)
    page.fill("input[name='password']", password)
    page.click("button[type='submit']")
    page.wait_for_selector("#searchField_all", timeout=10000)
    context.storage_state(path=state_fajl)
    page.close()
    return context


# --- MAIN ---
if __name__ == "__main__":
    load_dotenv()
    MAPPA = "input_tablak"

    print("\n" + "=" * 50)
    print(" 🌳 KATEGÓRIA STRUKTÚRA ÉPÍTŐ 🌳")
    print("=" * 50)

    print("\n1: SZVG Tools | 2: PTD Bolt")
    v = input("Válasz: ")
    if v == '1':
        USER, PASS, URL, STATE = os.getenv("SZVG_USERNAME"), os.getenv(
            "SZVG_PASSWORD"), "https://szvgtoolsshop.hu", "state_szvg.json"
    else:
        USER, PASS, URL, STATE = os.getenv("PTD_USERNAME"), os.getenv(
            "PTD_PASSWORD"), "https://ptdbolt.hu", "state_ptd.json"

    if not os.path.exists(MAPPA):
        print(f"\n❌ HIBA: Kérlek hozd létre a '{MAPPA}' mappát, és tegyél bele Excel fájlt!")
        sys.exit(1)

    fajlok = [f for f in os.listdir(MAPPA) if f.endswith(('.xlsx', '.xls'))]
    if not fajlok:
        print(f"\n❌ HIBA: Üres a '{MAPPA}' mappa.")
        sys.exit(1)

    print("\n--- Fájl választása ---")
    for i, f in enumerate(fajlok): print(f"{i + 1}: {f}")

    try:
        idx = int(input("Fájl sorszáma: ")) - 1
        fajl_utvonal = os.path.join(MAPPA, fajlok[idx])
    except:
        print("Érvénytelen választás.")
        sys.exit(1)

    struktura = adatok_beolvasasa(fajl_utvonal)

    if struktura:
        with sync_playwright() as p:
            print("\nBöngésző indítása...")
            browser = p.chromium.launch(headless=False)
            ctx = bejelentkezes_kezelese(browser, USER, PASS, URL, STATE)
            if ctx:
                run_category_builder(ctx, struktura, URL, fajlok[idx])
            browser.close()