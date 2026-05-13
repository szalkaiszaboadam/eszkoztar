import pandas as pd
from playwright.sync_api import sync_playwright, Playwright, expect, Browser, BrowserContext as Context
import time
import sys
import datetime
import os
import json
import re

from dotenv import load_dotenv


# --- 1. LÉPÉS: Adatbeolvasás (SORONKÉNTI, Fejléces verzió) ---
def adatok_beolvasasa(excel_fajl_neve):
    try:
        # Most már van fejléc, így elhagyjuk a header=None beállítást
        df = pd.read_excel(excel_fajl_neve, dtype=str)
    except FileNotFoundError:
        print(f"HIBA: Az '{excel_fajl_neve}' fájl nem található.")
        return None
    except Exception as e:
        print(f"HIBA az Excel beolvasása közben: {e}")
        return None

    # Ellenőrizzük, hogy megvannak-e a kötelező oszlopok
    szukseges_oszlopok = ["Cikkszám", "Alkategória", "Márka"]
    hianyzo_oszlopok = [oszlop for oszlop in szukseges_oszlopok if oszlop not in df.columns]

    if hianyzo_oszlopok:
        print(f"HIBA: Az Excel fájlból hiányoznak a következő kötelező oszlopok: {', '.join(hianyzo_oszlopok)}")
        print(f"A fájl jelenlegi oszlopai: {', '.join(df.columns.tolist())}")
        return None

    feldolgozando_lista = []

    for index, row in df.iterrows():
        cikkszam = str(row["Cikkszám"]).strip()
        marka = str(row["Márka"]).strip()
        kategoria_fejlec = str(row["Alkategória"]).strip()

        # Ha nincs cikkszám, vagy hiányzik a márka/kategória, átugorjuk a sort
        if not cikkszam or cikkszam.lower() == 'nan' or marka.lower() == 'nan' or kategoria_fejlec.lower() == 'nan':
            continue

        # Tisztítás
        tiszta_fejlec = re.sub(r'\.\d+$', '', kategoria_fejlec)

        # Pontosvessző (;) alapján választjuk szét a multi kategóriákat!
        kategoriak_listaja = [k.strip() for k in tiszta_fejlec.split(';') if k.strip()]

        if kategoriak_listaja:
            # Hozzáadjuk a listához pontosan úgy, ahogy a feldolgozó (run_processor) várja
            feldolgozando_lista.append((cikkszam, marka, kategoria_fejlec, kategoriak_listaja))

    return feldolgozando_lista


# --- ÚJ, GOLYÓÁLLÓ KATEGÓRIA KIVÁLASZTÓ ---
def stabil_kategoria_valasztas(page, input_locator, dropdown_locator, kategoria_nev):
    cel_nev = kategoria_nev.strip()
    gepelendo_szoveg = cel_nev.split(',')[0].strip()

    try:
        input_locator.click(timeout=5000)
        input_locator.fill("")
        time.sleep(0.5)

        input_locator.press_sequentially(gepelendo_szoveg, delay=60)
        dropdown_locator.wait_for(state="visible", timeout=8000)
        time.sleep(1.5)

        opciok = dropdown_locator.locator("div.option").all()

        if not opciok:
            print(f"   ⛔ Nincs találat a legördülőben erre: '{cel_nev}'")
            input_locator.press("Escape")
            return False

        for opcio in opciok:
            nyers_szoveg = opcio.inner_text()
            tiszta_html_nev = re.sub(r'^[- \t\xa0]+', '', nyers_szoveg).strip()

            if tiszta_html_nev.lower() == cel_nev.lower():
                print(f"      ✅ Megvan a kategória: '{nyers_szoveg}'")
                opcio.click(force=True)
                time.sleep(0.5)
                return True

        print(f"   ⚠️ Látok opciókat, de nincs PONTOS egyezés erre: '{cel_nev}'")
        input_locator.press("Escape")
        return False

    except Exception as e:
        print(f"   ❌ Kategória választási hiba: {e}")
        try:
            input_locator.press("Escape")
        except:
            pass
        return False


# --- 2. LÉPÉS: Fő Feldolgozó Funkció ---
def run_processor(context: Context, termek_lista, mod, progress_file_path, bemeneti_fajl_neve, base_url):
    mar_kesz_db = 0
    sikertelen_lista_elso_kor = []

    if os.path.exists(progress_file_path):
        try:
            with open(progress_file_path, "r", encoding="utf-8") as f:
                state_data = json.load(f)
                mar_kesz_db = state_data.get("index", 0)
                sikertelen_lista_elso_kor = state_data.get("retry_list", [])
            print(f"\n📢 KORÁBBI ÁLLAPOT BETÖLTVE:")
            print(f"   - Feldolgozva eddig: {mar_kesz_db} db")
            print(f"   - Javításra vár: {len(sikertelen_lista_elso_kor)} db")
        except:
            mar_kesz_db = 0
            sikertelen_lista_elso_kor = []

    def mentes_allapot(aktualis_index):
        try:
            state = {"index": aktualis_index, "retry_list": sikertelen_lista_elso_kor, "mod": mod}
            with open(progress_file_path, "w", encoding="utf-8") as f:
                json.dump(state, f, ensure_ascii=False, indent=2)
        except:
            pass

    start_index = mar_kesz_db
    feldolgozando_maradek = termek_lista[start_index:]

    sikeres_db = 0
    veglegesen_sikertelen_lista = []
    veglegesen_sikertelen_db = 0

    try:
        page = context.new_page()
    except Exception as e:
        print(f"HIBA: Nem sikerült új lapot nyitni: {e}")
        return

    # --- FŐ CIKLUS (1. KÖR) ---
    for i, (cikkszam, marka, eredeti_fejlec, kategoriak) in enumerate(feldolgozando_maradek):
        aktualis_sorszam = start_index + i + 1
        print(f"\n[{aktualis_sorszam}/{len(termek_lista)}] Feldolgozás...")
        print(f"  Cikkszám: {cikkszam} | Márka: {marka} | Kategória db: {len(kategoriak)}")

        try:
            page.goto(f"{base_url}/administrator/", timeout=60000)

            # --- NÉZET ELLENŐRZÉSE ÉS VÁLTÁSA ---
            # Keresünk egy gombot, aminek az onclick eseménye a 'switchMode(2)'-t (Bizonylatkészítőt) hívja
            nezet_valto_gomb = page.locator("li.modeSwitch[onclick*='switchMode(2)']")

            # Ha ez a gomb látható, az azt jelenti, hogy a rossz (Weblap admin) nézetben vagyunk
            if nezet_valto_gomb.is_visible(timeout=3000):
                print("🔄 Rossz nézet (Weblap admin) észlelve! Átváltás Bizonylatkészítőre...")
                nezet_valto_gomb.click()

                # Várunk egy kicsit, hogy az oldal biztosan újratöltsön a Bizonylatkészítő nézetben
                time.sleep(3)
                page.locator("#searchField_all").wait_for(state="visible", timeout=10000)
                print("✅ Sikeresen átváltottunk a Bizonylatkészítő nézetre!")
            else:
                print("✅ Eleve a jó (Bizonylatkészítő) nézetben vagyunk.")

            search_field = page.locator("#searchField_all")
            search_field.wait_for(timeout=10000)
            time.sleep(0.5)
            search_field.fill(cikkszam)
            search_field.press("Enter")
            time.sleep(1.5)

            sorok = page.locator(f"tr:has(td:text-is('{cikkszam}'))")
            sorok.first.wait_for(timeout=10000)
            talalat_db = sorok.count()

            if talalat_db == 1:
                sor = sorok.first
            elif talalat_db > 1:
                print(f"   ⚠️ Több találat ({talalat_db} db). Szűrés márkára: '{marka}'...")
                szurt_sorok = sorok.filter(has=page.locator(f"td:text-is('{marka}')"))
                szurt_db = szurt_sorok.count()

                if szurt_db == 1:
                    print("   ✅ Márka alapján beazonosítva.")
                    sor = szurt_sorok.first
                elif szurt_db > 1:
                    raise Exception("DUPLIKÁCIÓ")
                else:
                    raise Exception(f"Nincs olyan cikkszám, aminek '{marka}' a márkája!")
            else:
                raise Exception("Nem található a cikkszám!")

            termek_link = sor.locator("a[href*='view=product']")
            termek_link.wait_for(timeout=10000)
            termek_link.click()
            time.sleep(2)

            # --- KATEGORIZÁLÓ MÓD ---
            if mod == "kategorizalo":
                page.locator("a:has-text('A termék kategorizálása')").click()
                popup_ablak = page.locator("#popup")
                popup_ablak.wait_for(timeout=10000)
                time.sleep(1)

                popup_kereso = popup_ablak.locator("div.selectize-control.categories input[type='text']")
                dropdown = page.locator("div.selectize-dropdown.categories")

                for kat in kategoriak:
                    stabil_kategoria_valasztas(page, popup_kereso, dropdown, kat)

                # Itt a módosítás:
                popup_ablak.locator("div.pure-button:has-text('Hozzáadás a választott kategóriákhoz')").click()

                # Megvárjuk, amíg a popup ténylegesen bezárul, mielőtt továbbmennénk
                popup_ablak.wait_for(state="hidden", timeout=10000)
                print("   ✅ Popup bezárult, kategóriák hozzáadva.")
                time.sleep(2)

            # --- ÁTKATEGORIZÁLÓ MÓD (Törlés, majd új hozzáadása) ---
            elif mod == "atkategorizalo":
                page.locator("div.selectize-control.categories").wait_for(state="visible", timeout=5000)
                time.sleep(1.5)

                print("   Régi kategóriák törlése...")
                for _ in range(50):
                    torles_gomb = page.locator("div.selectize-control.categories div.selectize-input a.remove").first
                    if torles_gomb.is_visible():
                        torles_gomb.click(force=True)
                        time.sleep(0.3)
                    else:
                        break

                atkat_kereso = page.locator(
                    "div.selectize-control.categories div.selectize-input input[type='text']").first
                dropdown = page.locator("div.selectize-dropdown.categories").first

                for kat in kategoriak:
                    stabil_kategoria_valasztas(page, atkat_kereso, dropdown, kat)

                # Itt a módosítás:
                save_button = page.locator("a#save:has-text('Mentés')")
                save_button.click()

                # Megvárjuk, amíg a mentés utáni hálózati forgalom lecsendesedik
                page.wait_for_load_state("networkidle")
                print("   ✅ Mentés sikeres, oldal frissült.")
                time.sleep(2.5)

            print(f"  ✅ Sikeresen feldolgozva.")
            sikeres_db += 1
            mentes_allapot(aktualis_sorszam)

        except Exception as e:
            hiba_uzenet = str(e)
            print(f"  ❌ HIBA (1. KÖR): {hiba_uzenet}")
            sikertelen_lista_elso_kor.append((cikkszam, marka, eredeti_fejlec, kategoriak, hiba_uzenet))
            mentes_allapot(aktualis_sorszam)

    # --- ÚJRAPRÓBÁLKOZÁSI CIKLUS (2. KÖR) ---
    if sikertelen_lista_elso_kor:
        print("\n" + "=" * 50)
        print(f"Indul a feldolgozás, 2. KÖR: Újrapróbálkozás {len(sikertelen_lista_elso_kor)} termékkel.")
        feldolgozando_retry = list(sikertelen_lista_elso_kor)

        for i, (cikkszam, marka, eredeti_fejlec, kategoriak, elozo_hiba) in enumerate(feldolgozando_retry):
            print(f"\n[{i + 1}/{len(feldolgozando_retry)}] Retry: {cikkszam}")

            if "DUPLIKÁCIÓ" in elozo_hiba:
                print("   ⚠️ Újrapróbálkozás átugorva (Duplikációs hiba miatt).")
                veglegesen_sikertelen_db += 1
                veglegesen_sikertelen_lista.append((cikkszam, marka, eredeti_fejlec, kategoriak, elozo_hiba))
                sikertelen_lista_elso_kor = [x for x in sikertelen_lista_elso_kor if x[0] != cikkszam]
                mentes_allapot(start_index + len(feldolgozando_maradek))
                continue

            try:
                page.goto(f"{base_url}/administrator/", timeout=60000)
                search_field = page.locator("#searchField_all")
                search_field.wait_for(timeout=10000)
                time.sleep(0.5)
                search_field.fill(cikkszam)
                search_field.press("Enter")
                time.sleep(1.5)

                sorok = page.locator(f"tr:has(td:text-is('{cikkszam}'))")
                sorok.first.wait_for(timeout=10000)
                talalat_db = sorok.count()

                if talalat_db == 1:
                    sor = sorok.first
                elif talalat_db > 1:
                    szurt_sorok = sorok.filter(has=page.locator(f"td:text-is('{marka}')"))
                    szurt_db = szurt_sorok.count()
                    if szurt_db == 1:
                        sor = szurt_sorok.first
                    elif szurt_db > 1:
                        raise Exception("DUPLIKÁCIÓ")
                    else:
                        raise Exception(f"Több cikkszám, de egyik sem '{marka}'.")
                else:
                    raise Exception("Nem található a cikkszám!")

                termek_link = sor.locator("a[href*='view=product']")
                termek_link.wait_for(timeout=10000)
                termek_link.click()
                time.sleep(2)

                if mod == "kategorizalo":
                    page.locator("a:has-text('A termék kategorizálása')").click()
                    popup_ablak = page.locator("#popup")
                    popup_ablak.wait_for(timeout=10000)
                    time.sleep(1)

                    popup_kereso = popup_ablak.locator("div.selectize-control.categories input[type='text']")
                    dropdown = page.locator("div.selectize-dropdown.categories")

                    for kat in kategoriak:
                        stabil_kategoria_valasztas(page, popup_kereso, dropdown, kat)

                    popup_ablak.locator("div.pure-button:has-text('Hozzáadás a választott kategóriákhoz')").click()
                    time.sleep(2)

                elif mod == "atkategorizalo":
                    page.locator("div.selectize-control.categories").wait_for(state="visible", timeout=5000)
                    time.sleep(1.5)
                    for _ in range(50):
                        torles_gomb = page.locator(
                            "div.selectize-control.categories div.selectize-input a.remove").first
                        if torles_gomb.is_visible():
                            torles_gomb.click(force=True);
                            time.sleep(0.3)
                        else:
                            break
                    atkat_kereso = page.locator(
                        "div.selectize-control.categories div.selectize-input input[type='text']").first
                    dropdown = page.locator("div.selectize-dropdown.categories").first

                    for kat in kategoriak:
                        stabil_kategoria_valasztas(page, atkat_kereso, dropdown, kat)

                    page.locator("a#save:has-text('Mentés')").click()
                    time.sleep(3)

                print(f"  ✅ Sikeres (2. kör).")
                sikeres_db += 1
                sikertelen_lista_elso_kor = [x for x in sikertelen_lista_elso_kor if x[0] != cikkszam]
                mentes_allapot(start_index + len(feldolgozando_maradek))

            except Exception as e:
                vegleges_hiba = str(e)
                print(f"  ❌ VÉGLEGES HIBA: {cikkszam} - {vegleges_hiba}")
                veglegesen_sikertelen_db += 1
                veglegesen_sikertelen_lista.append((cikkszam, marka, eredeti_fejlec, kategoriak, vegleges_hiba))
                sikertelen_lista_elso_kor = [x for x in sikertelen_lista_elso_kor if x[0] != cikkszam]
                mentes_allapot(start_index + len(feldolgozando_maradek))

    page.close()
    if os.path.exists(progress_file_path) and not sikertelen_lista_elso_kor:
        os.remove(progress_file_path)

        # --- EXPORTÁLÁS ---
        if veglegesen_sikertelen_lista:
            print(f"\n📑 Exportálás: {len(veglegesen_sikertelen_lista)} sikertelen termék...")
            SIKERTELEN_MAPPA = "sikertelen_tablak"
            try:
                os.makedirs(SIKERTELEN_MAPPA, exist_ok=True)

                # ÚJ, SOROS FORMÁTUM (Bemeneti fájllal megegyező)
                export_adatok = []
                for cikkszam, marka, eredeti_fejlec, kats, hiba in veglegesen_sikertelen_lista:
                    export_adatok.append({
                        "Cikkszám": cikkszam,
                        "Márka": marka,
                        "Alkategória": eredeti_fejlec,
                        "Hiba oka": str(hiba).strip()
                    })

                # DataFrame létrehozása a dict listából
                df_sikertelen = pd.DataFrame(export_adatok)

                alap_nev = os.path.splitext(os.path.basename(bemeneti_fajl_neve))[0]
                timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M")
                fnev = f"{alap_nev}_hiba_{mod}_{timestamp}.xlsx"
                utvonal = os.path.join(SIKERTELEN_MAPPA, fnev)

                # Mentés Excelbe, fejlécekkel együtt! (header=True az alapértelmezett, ezért elhagyható a header=False)
                df_sikertelen.to_excel(utvonal, index=False, engine='openpyxl')
                print(f"  ✅ Sikeres export: {utvonal}")
            except Exception as e:
                print(f"  ❌ HIBA az exportnál: {e}")

# --- 3. LÉPÉS: Bejelentkezés ---
def bejelentkezes_kezelese(browser: Browser, username, password, base_url, state_fajl="state.json"):
    if os.path.exists(state_fajl):
        print(f"\nMeglévő bejelentkezés ('{state_fajl}') ellenőrzése...")
        try:
            context = browser.new_context(storage_state=state_fajl)
            page_test = context.new_page()
            page_test.goto(f"{base_url}/administrator/", timeout=15000)
            page_test.locator("#searchField_all").wait_for(timeout=5000)
            print("✅ Bejelentkezés érvényes.")
            page_test.close()
            return context
        except Exception:
            print("❌ Lejárt vagy érvénytelen. Új bejelentkezés...")
            pass

    print("\nÚj automatikus bejelentkezés...")
    context = browser.new_context()
    page = context.new_page()
    page.goto(f"{base_url}/administrator/", timeout=15000)

    try:
        page.fill("input[name='username']", username)
        page.fill("input[name='password']", password)
        page.click("button[type='submit']")
        page.locator("#searchField_all").wait_for(timeout=10000)
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

    # --- WEBSHOP VÁLASZTÁS ---
    print("\n" + "=" * 50)
    print(" 📂 EXCEL ALAPÚ KATEGORIZÁLÓ ASSZISZTENS 📂")
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

    if not FELHASZNALONEV or not JELSZO:
        print(f"HIBA: Nincs user/pass a .env-ben a kiválasztott webshophoz!")
        sys.exit(1)

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
    progress_file = kivalasztott_fajl_utvonala + ".progress.json"

    if not termekek: sys.exit(1)

    folytatas = False
    mod = ""

    if os.path.exists(progress_file):
        valasz_folytat = input(
            f"\n⚠️ Találtam egy félbemaradt mentést ehhez a fájlhoz.\nSzeretnéd folytatni onnan, ahol abbamaradt? (i/n): ").strip().lower()
        if valasz_folytat == 'i':
            folytatas = True
            try:
                with open(progress_file, "r", encoding="utf-8") as f:
                    state_data = json.load(f)
                    mod = state_data.get("mod", "")
            except:
                pass
            mod_nev = "Kategorizáló (Hozzáadás)" if mod == "kategorizalo" else "Átkategorizáló (Törlés + Új)"
            print(f"   ⏩ Folytatás kiválasztva. (Mód: {mod_nev})")
        else:
            os.remove(progress_file)
            print("   🗑️ Régi mentés törölve. Tiszta lappal indulunk.")

    if not folytatas or not mod:
        while True:
            print("\n--- Mód Választás ---")
            print("  1: Kategorizáló (Hozzáadás meglévőkhöz)")
            print("  2: Átkategorizáló (Régi törlése, új kategóriák hozzáadása)")
            val = input("Választás (1-2): ").strip()

            if val == '1': mod = "kategorizalo"; break
            if val == '2': mod = "atkategorizalo"; break

    with sync_playwright() as p:
        print("\nBöngésző indítása...")
        browser = p.chromium.launch(headless=False)
        ctx = bejelentkezes_kezelese(browser, FELHASZNALONEV, JELSZO, BASE_URL, STATE_FAJL)
        if ctx:
            run_processor(ctx, termekek, mod, progress_file, kivalasztott_fajl_utvonala, base_url=BASE_URL)
        browser.close()