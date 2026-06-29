import pandas as pd
from playwright.sync_api import sync_playwright, Browser, BrowserContext as Context
import time
import sys
import datetime
import os
import json
import re
import unicodedata
from dotenv import load_dotenv


# --- ÉKEZET- ÉS SZÓKÖZ GYALU ---
def eltavolit_ekezet(szoveg):
    if not szoveg:
        return ""
    # Kisbetűsítjük és levágjuk a szélső szóközöket
    sz = str(szoveg).strip().lower()
    # Porszívó: minden dupla/tripla szóközből és rejtett karakterből 1 sima szóköz lesz
    sz = re.sub(r'\s+', ' ', sz)
    # Ékezet eltávolító varázslat (NFD normalizálás, majd a mellékjelek eldobása)
    return ''.join(c for c in unicodedata.normalize('NFD', sz) if unicodedata.category(c) != 'Mn')


# --- 1. LÉPÉS: Adatbeolvasás ---
def adatok_beolvasasa(excel_fajl_neve):
    try:
        df = pd.read_excel(excel_fajl_neve, dtype=str)
    except Exception as e:
        print(f"HIBA az Excel beolvasása közben: {e}")
        return None

    szukseges_oszlopok = ["Régi cikkszám", "Új cikkszám", "Név", "Márka", "Alternatív cikkszám"]
    hianyzo_oszlopok = [oszlop for oszlop in szukseges_oszlopok if oszlop not in df.columns]

    if hianyzo_oszlopok:
        print(f"HIBA: Az Excelből hiányoznak a kötelező oszlopok: {', '.join(hianyzo_oszlopok)}")
        return None

    feldolgozando_lista = []

    def tisztit_szoveg(ertek):
        ertek = str(ertek).strip()
        if ertek.lower() == 'nan':
            return ""
        ertek = re.sub(r'-01 00:00:00$', '', ertek)
        ertek = re.sub(r' 00:00:00$', '', ertek)
        ertek = re.sub(r'\s+', ' ', ertek).strip()
        return ertek

    for index, row in df.iterrows():
        regi_cikkszam = tisztit_szoveg(row.get("Régi cikkszám", ""))
        uj_cikkszam = tisztit_szoveg(row.get("Új cikkszám", ""))
        alt_cikkszam = tisztit_szoveg(row.get("Alternatív cikkszám", ""))
        nev = tisztit_szoveg(row.get("Név", ""))
        marka = tisztit_szoveg(row.get("Márka", ""))

        if not uj_cikkszam and not alt_cikkszam:
            continue

        feldolgozando_lista.append({
            "regi_cikkszam": regi_cikkszam,
            "uj_cikkszam": uj_cikkszam,
            "nev": nev,
            "marka": marka,
            "alt_cikkszam": alt_cikkszam
        })

    return feldolgozando_lista


# --- 2. LÉPÉS: Fő Feldolgozó Funkció ---
def run_processor(context: Context, termek_lista, bemeneti_fajl_neve, base_url, progress_file_path):
    sikeres_db = 0
    mar_kesz_db = 0
    sikertelen_lista_elso_kor = []
    veglegesen_sikertelen_lista = []

    if os.path.exists(progress_file_path):
        try:
            with open(progress_file_path, "r", encoding="utf-8") as f:
                state_data = json.load(f)
                mar_kesz_db = state_data.get("index", 0)
                sikertelen_lista_elso_kor = state_data.get("retry_list", [])
            print(f"\n📢 KORÁBBI ÁLLAPOT BETÖLTVE:")
            print(f"   - Feldolgozva eddig: {mar_kesz_db} db")
            print(f"   - Javításra vár a 2. körben: {len(sikertelen_lista_elso_kor)} db")
        except:
            mar_kesz_db = 0
            sikertelen_lista_elso_kor = []

    def mentes_allapot(aktualis_index):
        try:
            state = {"index": aktualis_index, "retry_list": sikertelen_lista_elso_kor}
            with open(progress_file_path, "w", encoding="utf-8") as f:
                json.dump(state, f, ensure_ascii=False, indent=2)
        except:
            pass

    try:
        page = context.new_page()
    except Exception as e:
        print(f"HIBA: Nem sikerült új lapot nyitni: {e}")
        return

    print("\n🚀 Cikkszámozó indul...")

    start_index = mar_kesz_db
    feldolgozando_maradek = termek_lista[start_index:]

    if feldolgozando_maradek:
        print("\n" + "=" * 50)
        print(f" 1. KÖR: Hátralévő {len(feldolgozando_maradek)} termék feldolgozása")
        print("=" * 50)

        for i, termek in enumerate(feldolgozando_maradek):
            regi_cikkszam = termek["regi_cikkszam"]
            uj_cikkszam = termek["uj_cikkszam"]
            nev = termek["nev"]
            marka = termek["marka"]
            alt_cikkszam = termek["alt_cikkszam"]

            aktualis_sorszam = start_index + i + 1
            keresendo = regi_cikkszam if regi_cikkszam else nev
            kereses_tipusa = "Cikkszám" if regi_cikkszam else "Név"

            biztonsagos_keresendo = re.split(r'["\']', keresendo)[0].strip()

            print(f"\n[{aktualis_sorszam}/{len(termek_lista)}] Feldolgozás...")
            if biztonsagos_keresendo != keresendo:
                print(f"  Keresés ({kereses_tipusa}): '{biztonsagos_keresendo}' (Rövidítve)")
            else:
                print(f"  Keresés ({kereses_tipusa}): '{keresendo}'")

            try:
                page.goto(f"{base_url}/administrator/", timeout=60000)

                nezet_valto_gomb = page.locator("li.modeSwitch[onclick*='switchMode(2)']")
                if nezet_valto_gomb.is_visible(timeout=5000):
                    page.evaluate("switchMode(2);")
                    time.sleep(4)

                search_field = page.locator("#searchField_all")
                search_field.wait_for(state="visible", timeout=20000)
                search_field.fill(biztonsagos_keresendo)
                time.sleep(0.5)
                search_field.press("Enter")

                talalat_megvan = False
                sor = None
                oldal_szamlalo = 1
                max_oldal = 30

                # --- 100% ÉKEZETMENTES KERESŐ LÉTREHOZÁSA ---
                keresendo_norm = eltavolit_ekezet(keresendo)
                nev_norm = eltavolit_ekezet(nev)
                marka_norm = eltavolit_ekezet(marka)

                while not talalat_megvan and oldal_szamlalo <= max_oldal:
                    time.sleep(3)

                    for _ in range(8):
                        page.keyboard.press("PageDown")
                        time.sleep(0.2)
                    page.keyboard.press("Home")
                    time.sleep(0.5)

                    # Minden látható sort kiszedünk a táblázatból
                    minden_sor = page.locator("table#productsList tbody tr").filter(visible=True)

                    try:
                        minden_sor.first.wait_for(state="visible", timeout=3000)
                    except:
                        pass

                    sor_count = minden_sor.count()

                    if sor_count > 0:
                        jo_sorok_indexei = []

                        for idx in range(sor_count):
                            aktualis_sor = minden_sor.nth(idx)
                            cellak = aktualis_sor.locator("td").all_inner_texts()

                            is_match = False
                            for cella_szoveg in cellak:
                                # Webshopos cella lebutítása (ékezet és szóköz nélkül)
                                cella_norm = eltavolit_ekezet(cella_szoveg)

                                # PONTOS EGYEZÉS az ékezetmentesített verziók között
                                if keresendo_norm == cella_norm:
                                    is_match = True
                                    break

                            if is_match:
                                sor_teljes = " ".join([eltavolit_ekezet(c) for c in cellak])
                                biztonsagos = True

                                # Csak akkor legyünk szigorúak a névvel és márkával, ha NÉV alapján kerestünk.
                                # Ha cikkszám alapján van meg az egyezés, bízunk a cikkszám egyediségében.
                                if kereses_tipusa == "Név":
                                    if nev_norm and nev_norm not in sor_teljes:
                                        biztonsagos = False
                                    if marka_norm and marka_norm not in sor_teljes:
                                        biztonsagos = False

                                if biztonsagos:
                                    jo_sorok_indexei.append(idx)

                        if len(jo_sorok_indexei) == 1:
                            sor = minden_sor.nth(jo_sorok_indexei[0])
                            talalat_megvan = True
                        elif len(jo_sorok_indexei) > 1:
                            raise Exception(
                                f"DUPLIKÁCIÓ: {len(jo_sorok_indexei)} db teljesen azonos nevű termék van az oldalon!")

                    if not talalat_megvan:
                        kovetkezo_gomb = page.locator("li.paginationButton").filter(
                            has_text=re.compile("Következő", re.IGNORECASE))
                        if kovetkezo_gomb.is_visible(timeout=1000):
                            print(f"   -> Nincs pontos egyezés a(z) {oldal_szamlalo}. oldalon. Lapozás...")
                            kovetkezo_gomb.first.click()
                            oldal_szamlalo += 1
                        else:
                            break

                if not talalat_megvan:
                    if oldal_szamlalo > max_oldal:
                        raise Exception(f"Túl sok oldal ({max_oldal}), keresés megszakítva.")
                    else:
                        raise Exception(f"A termék pontos névvel egyáltalán nem található a rendszerben!")

                termek_link = sor.locator("a[href*='view=product']")
                termek_link.wait_for(state="visible", timeout=15000)
                termek_link.scroll_into_view_if_needed()
                termek_link.click()

                # Várakozás a termékoldal betöltésére
                page.locator("a#save_close").wait_for(state="visible", timeout=20000)
                time.sleep(2)

                if nem_ures(uj_cikkszam):
                    cikkszam_mezo = page.locator("input#sku")
                    cikkszam_mezo.wait_for(state="visible", timeout=10000)
                    cikkszam_mezo.fill(uj_cikkszam)
                    print(f"   -> Fő cikkszám módosítva erre: {uj_cikkszam}")

                # VONALKÓD HOZZÁADÁS
                if nem_ures(alt_cikkszam):
                    tab_label = page.locator("label.tabLabel[for='vonalkodok']")
                    tab_label.wait_for(state="visible", timeout=10000)
                    tab_label.click(force=True)

                    time.sleep(1.5)

                    barcode_input = page.locator("input#newBarcode")
                    barcode_input.wait_for(state="visible", timeout=10000)

                    vonalkodok_lista = [v.strip() for v in alt_cikkszam.split(';') if v.strip()]

                    for vonalkod in vonalkodok_lista:
                        barcode_input.fill(vonalkod)
                        time.sleep(0.5)

                        add_btn = page.locator("div.addBarcode div.pure-button").filter(
                            has_text=re.compile("Hozzáadás", re.IGNORECASE)).first
                        add_btn.click(force=True)
                        time.sleep(1)
                        print(f"      + Másodlagos cikkszám beírva: {vonalkod}")

                # Mentés és kilépés
                page.locator("a#save_close").click(timeout=10000)
                page.locator("#searchField_all").wait_for(state="visible", timeout=35000)
                time.sleep(2)

                print(f"   ✅ Sikeresen mentve.")
                sikeres_db += 1
                mentes_allapot(aktualis_sorszam)

            except Exception as e:
                hiba_uzenet = str(e)
                print(f"   ❌ HIBA (1. KÖR): {hiba_uzenet}")
                termek["hiba_oka"] = hiba_uzenet
                sikertelen_lista_elso_kor.append(termek)
                mentes_allapot(aktualis_sorszam)

    # ==========================================
    # --- ÚJRAPRÓBÁLKOZÁSI CIKLUS (2. KÖR) ---
    # ==========================================
    if sikertelen_lista_elso_kor:
        print("\n" + "=" * 50)
        print(f" 2. KÖR: Újrapróbálkozás {len(sikertelen_lista_elso_kor)} termékkel")
        print("=" * 50)

        feldolgozando_retry = list(sikertelen_lista_elso_kor)

        for i, termek in enumerate(feldolgozando_retry):
            regi_cikkszam = termek["regi_cikkszam"]
            uj_cikkszam = termek["uj_cikkszam"]
            nev = termek["nev"]
            marka = termek["marka"]
            alt_cikkszam = termek["alt_cikkszam"]

            keresendo = regi_cikkszam if regi_cikkszam else nev
            biztonsagos_keresendo = re.split(r'["\']', keresendo)[0].strip()

            print(f"\n[{i + 1}/{len(feldolgozando_retry)}] Retry: '{biztonsagos_keresendo}'")

            if "DUPLIKÁCIÓ" in termek["hiba_oka"] or "Egyáltalán nem található" in termek["hiba_oka"]:
                print("   ⚠️ Újrapróbálkozás átugorva az előző egyértelmű hiba miatt.")
                veglegesen_sikertelen_lista.append(termek)
                sikertelen_lista_elso_kor = [x for x in sikertelen_lista_elso_kor if x != termek]
                mentes_allapot(start_index + len(feldolgozando_maradek))
                continue

            try:
                page.goto(f"{base_url}/administrator/", timeout=60000)
                nezet_valto_gomb = page.locator("li.modeSwitch[onclick*='switchMode(2)']")
                if nezet_valto_gomb.is_visible(timeout=5000):
                    page.evaluate("switchMode(2);")
                    time.sleep(4)

                search_field = page.locator("#searchField_all")
                search_field.wait_for(state="visible", timeout=20000)
                search_field.fill(biztonsagos_keresendo)
                time.sleep(0.5)
                search_field.press("Enter")

                talalat_megvan = False
                sor = None
                oldal_szamlalo = 1
                max_oldal = 30

                keresendo_norm = eltavolit_ekezet(keresendo)
                nev_norm = eltavolit_ekezet(nev)
                marka_norm = eltavolit_ekezet(marka)

                while not talalat_megvan and oldal_szamlalo <= max_oldal:
                    time.sleep(3)
                    for _ in range(8):
                        page.keyboard.press("PageDown")
                        time.sleep(0.2)
                    page.keyboard.press("Home")
                    time.sleep(0.5)

                    minden_sor = page.locator("table#productsList tbody tr").filter(visible=True)

                    try:
                        minden_sor.first.wait_for(state="visible", timeout=3000)
                    except:
                        pass

                    sor_count = minden_sor.count()

                    if sor_count > 0:
                        jo_sorok_indexei = []

                        for idx in range(sor_count):
                            aktualis_sor = minden_sor.nth(idx)
                            cellak = aktualis_sor.locator("td").all_inner_texts()

                            is_match = False
                            for cella_szoveg in cellak:
                                cella_norm = eltavolit_ekezet(cella_szoveg)
                                if keresendo_norm == cella_norm:
                                    is_match = True
                                    break

                            if is_match:
                                sor_teljes = " ".join([eltavolit_ekezet(c) for c in cellak])
                                biztonsagos = True

                                # Csak akkor legyünk szigorúak a névvel és márkával, ha NÉV alapján kerestünk.
                                # Ha cikkszám alapján van meg az egyezés, bízunk a cikkszám egyediségében.
                                if kereses_tipusa == "Név":
                                    if nev_norm and nev_norm not in sor_teljes:
                                        biztonsagos = False
                                    if marka_norm and marka_norm not in sor_teljes:
                                        biztonsagos = False

                                if biztonsagos:
                                    jo_sorok_indexei.append(idx)

                        if len(jo_sorok_indexei) == 1:
                            sor = minden_sor.nth(jo_sorok_indexei[0])
                            talalat_megvan = True
                        elif len(jo_sorok_indexei) > 1:
                            raise Exception(
                                f"DUPLIKÁCIÓ: {len(jo_sorok_indexei)} db teljesen azonos nevű termék van az oldalon!")

                    if not talalat_megvan:
                        kovetkezo_gomb = page.locator("li.paginationButton").filter(
                            has_text=re.compile("Következő", re.IGNORECASE))
                        if kovetkezo_gomb.is_visible(timeout=1000):
                            print(f"   -> Nincs pontos egyezés a(z) {oldal_szamlalo}. oldalon. Lapozás...")
                            kovetkezo_gomb.first.click()
                            oldal_szamlalo += 1
                        else:
                            break

                if not talalat_megvan:
                    if oldal_szamlalo > max_oldal:
                        raise Exception(f"Túl sok oldal ({max_oldal}), keresés megszakítva.")
                    else:
                        raise Exception(f"A termék pontos névvel egyáltalán nem található a rendszerben!")

                termek_link = sor.locator("a[href*='view=product']")
                termek_link.wait_for(state="visible", timeout=15000)
                termek_link.scroll_into_view_if_needed()
                termek_link.click()

                page.locator("a#save_close").wait_for(state="visible", timeout=20000)
                time.sleep(2)

                if nem_ures(uj_cikkszam):
                    cikkszam_mezo = page.locator("input#sku")
                    cikkszam_mezo.wait_for(state="visible", timeout=10000)
                    cikkszam_mezo.fill(uj_cikkszam)

                # VONALKÓD HOZZÁADÁS 2. KÖR
                if nem_ures(alt_cikkszam):
                    tab_label = page.locator("label.tabLabel[for='vonalkodok']")
                    tab_label.wait_for(state="visible", timeout=10000)
                    tab_label.click(force=True)
                    time.sleep(1.5)

                    barcode_input = page.locator("input#newBarcode")
                    barcode_input.wait_for(state="visible", timeout=10000)

                    vonalkodok_lista = [v.strip() for v in alt_cikkszam.split(';') if v.strip()]

                    for vonalkod in vonalkodok_lista:
                        barcode_input.fill(vonalkod)
                        time.sleep(0.5)
                        add_btn = page.locator("div.addBarcode div.pure-button").filter(
                            has_text=re.compile("Hozzáadás", re.IGNORECASE)).first
                        add_btn.click(force=True)
                        time.sleep(1)

                page.locator("a#save_close").click(timeout=10000)
                page.locator("#searchField_all").wait_for(state="visible", timeout=35000)
                time.sleep(2)

                print(f"   ✅ Sikeres (2. kör).")
                sikeres_db += 1
                sikertelen_lista_elso_kor = [x for x in sikertelen_lista_elso_kor if x != termek]
                mentes_allapot(start_index + len(feldolgozando_maradek))

            except Exception as e:
                vegleges_hiba = str(e)
                print(f"   ❌ VÉGLEGES HIBA: {vegleges_hiba}")
                termek["hiba_oka"] = vegleges_hiba
                veglegesen_sikertelen_lista.append(termek)
                sikertelen_lista_elso_kor = [x for x in sikertelen_lista_elso_kor if x != termek]
                mentes_allapot(start_index + len(feldolgozando_maradek))

    page.close()

    if os.path.exists(progress_file_path) and not sikertelen_lista_elso_kor:
        os.remove(progress_file_path)

    # ==========================================
    # --- EXPORTÁLÁS (Hibás elemek) ---
    # ==========================================
    if veglegesen_sikertelen_lista:
        print(f"\n📑 Exportálás: {len(veglegesen_sikertelen_lista)} sikertelen termék...")
        SIKERTELEN_MAPPA = "sikertelen_tablak"
        os.makedirs(SIKERTELEN_MAPPA, exist_ok=True)

        export_adatok = []
        for termek in veglegesen_sikertelen_lista:
            export_adatok.append({
                "Régi cikkszám": termek["regi_cikkszam"],
                "Új cikkszám": termek["uj_cikkszam"],
                "Alternatív cikkszám": termek["alt_cikkszam"],
                "Név": termek["nev"],
                "Márka": termek["marka"],
                "Hiba oka": termek["hiba_oka"]
            })

        df_sikertelen = pd.DataFrame(export_adatok)
        alap_nev = os.path.splitext(os.path.basename(bemeneti_fajl_neve))[0]
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M")
        fnev = f"{alap_nev}_hiba_cikkszam_{timestamp}.xlsx"
        utvonal = os.path.join(SIKERTELEN_MAPPA, fnev)

        df_sikertelen.to_excel(utvonal, index=False, engine='openpyxl')
        print(f"  ✅ Sikeres hiba-export: {utvonal}")
    else:
        print("\n🎉 Minden termék sikeresen frissítve lett!")


def nem_ures(ertek):
    return ertek is not None and str(ertek).strip() != "" and str(ertek).strip().lower() != "nan"


# --- 3. LÉPÉS: Bejelentkezés ---
def bejelentkezes_kezelese(browser: Browser, username, password, base_url, state_fajl="state.json"):
    if os.path.exists(state_fajl):
        try:
            context = browser.new_context(storage_state=state_fajl)
            page_test = context.new_page()
            page_test.goto(f"{base_url}/administrator/", timeout=30000)
            page_test.locator("#searchField_all").wait_for(timeout=10000)
            page_test.close()
            return context
        except Exception:
            pass

    print("Új automatikus bejelentkezés...")
    context = browser.new_context()
    page = context.new_page()
    page.goto(f"{base_url}/administrator/", timeout=30000)

    try:
        page.fill("input[name='username']", username)
        page.fill("input[name='password']", password)
        page.click("button[type='submit']")
        page.locator("#searchField_all").wait_for(timeout=15000)
        print("✅ Bejelentkezés sikeres.")
    except Exception as e:
        print(f"❌ HIBA: Bejelentkezés sikertelen: {e}")
        browser.close()
        sys.exit(1)

    try:
        context.storage_state(path=state_fajl)
    except:
        pass

    page.close()
    return context


# --- 4. LÉPÉS: Főprogram ---
if __name__ == "__main__":
    load_dotenv()
    FAJLOK_MAPPAJA = "input_tablak"

    print("\n" + "=" * 50)
    print(" 🛠️ UNIVERZÁLIS CIKKSZÁMOZÓ BOT 🛠️")
    print("=" * 50)

    print("\n--- Melyik webshopot szeretnéd használni? ---")
    print("  1: SZVG Tools (szvgtoolsshop.hu)")
    print("  2: PTD Bolt (ptdbolt.hu)")
    shop_valasz = ""
    while shop_valasz not in ["1", "2"]:
        shop_valasz = input("Választás (1-2): ").strip()

    if shop_valasz == '1':
        FELHASZNALONEV = os.environ.get("SZVG_USERNAME")
        JELSZO = os.environ.get("SZVG_PASSWORD")
        BASE_URL = "https://szvgtoolsshop.hu"
        STATE_FAJL = "state_szvg.json"
    else:
        FELHASZNALONEV = os.environ.get("PTD_USERNAME")
        JELSZO = os.environ.get("PTD_PASSWORD")
        BASE_URL = "https://ptdbolt.hu"
        STATE_FAJL = "state_ptd.json"

    if not os.path.exists(FAJLOK_MAPPAJA):
        print(f"HIBA: Létre kell hozni a '{FAJLOK_MAPPAJA}' mappát!")
        sys.exit(1)

    excel_fajlok = [f for f in os.listdir(FAJLOK_MAPPAJA) if f.endswith('.xlsx') or f.endswith('.xls')]
    if not excel_fajlok:
        print(f"HIBA: Üres a '{FAJLOK_MAPPAJA}' mappa.")
        sys.exit(1)

    print("\n--- Excel Fájl Választása ---")
    for i, f in enumerate(excel_fajlok):
        print(f"  {i + 1}: {f}")

    kivalasztott_fajl_utvonala = ""
    while True:
        try:
            val = input(f"Válassz sorszámot (1-{len(excel_fajlok)}): ").strip()
            idx = int(val) - 1
            if 0 <= idx < len(excel_fajlok):
                kivalasztott_fajl_utvonala = os.path.join(FAJLOK_MAPPAJA, excel_fajlok[idx])
                break
            print("Hibás szám.")
        except:
            print("Számot adj meg.")

    termekek = adatok_beolvasasa(kivalasztott_fajl_utvonala)
    if not termekek: sys.exit(1)

    progress_file = kivalasztott_fajl_utvonala + ".progress.json"

    if os.path.exists(progress_file):
        valasz_folytat = input(
            f"\n⚠️ Találtam egy félbemaradt mentést ehhez a fájlhoz.\nSzeretnéd folytatni onnan, ahol abbamaradt? (i/n): ").strip().lower()
        if valasz_folytat == 'i':
            print("   ⏩ Folytatás kiválasztva.")
        else:
            os.remove(progress_file)
            print("   🗑️ Régi mentés törölve. Tiszta lappal indulunk.")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        ctx = bejelentkezes_kezelese(browser, FELHASZNALONEV, JELSZO, BASE_URL, STATE_FAJL)
        if ctx:
            run_processor(ctx, termekek, kivalasztott_fajl_utvonala, BASE_URL, progress_file)
        browser.close()