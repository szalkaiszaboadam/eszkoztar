import pandas as pd
from playwright.sync_api import sync_playwright, Playwright, expect, Browser, BrowserContext as Context
import time
import sys
import datetime
import os
import json  # <--- EZ KELL A MENTÉSHEZ (1. PONT)
from dotenv import load_dotenv


# --- 1. LÉPÉS: Adatbeolvasás ---
def adatok_beolvasasa(excel_fajl_neve):
    """
    Beolvassa az Excel fájlt.
    """
    try:
        df = pd.read_excel(excel_fajl_neve, dtype=str)
    except FileNotFoundError:
        print(f"HIBA: Az '{excel_fajl_neve}' fájl nem található.")
        return None
    except Exception as e:
        print(f"HIBA az Excel beolvasása közben: {e}")
        return None

    if "Cikkszám" not in df.columns or "Címke" not in df.columns:
        print("HIBA: Az Excel fájlnak tartalmaznia kell 'Cikkszám' és 'Címke' oszlopokat.")
        return None

    feldolgozando_lista = []
    for index, row in df.iterrows():
        cikkszam = str(row["Cikkszám"]).strip()
        cimke_string = str(row["Címke"]).strip()

        if not cikkszam or cikkszam.lower() == 'nan':
            continue

        if cimke_string and cimke_string.lower() != 'nan':
            # 1. Lépés: split és tisztítás
            raw_list = [c.strip().lower() for c in cimke_string.split(',') if c.strip()]
            # 2. Lépés: set() kiszűri a duplikációt, list() visszaalakítja
            cimke_lista = list(set(raw_list))
        else:
            cimke_lista = []

        feldolgozando_lista.append((cikkszam, cimke_lista))

    return feldolgozando_lista


# --- 2. LÉPÉS: Fő Feldolgozó Funkció (KOMBINÁLT VERZIÓ) ---
def run_processor(context: Context, termek_lista, progress_file_path, feluliras_mod=False):
    """
    EGYESÍTETT VERZIÓ:
    - 1. PONT: Mentés (JSON) kezelése.
    - 4. PONT: Felülírás mód (feluliras_mod) kezelése.
    - LOGIKA: A régi, jól működő kereső/kattintó logika.
    """

    # --- ÁLLAPOT BETÖLTÉSE (1. PONT) ---
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
        except Exception as e:
            print(f"\n⚠️ Hiba a mentés olvasásakor ({e}), elölről kezdjük.")
            mar_kesz_db = 0
            sikertelen_lista_elso_kor = []

    # Segédfüggvény a mentéshez
    def mentes_allapot(aktualis_index):
        try:
            state = {
                "index": aktualis_index,
                "retry_list": sikertelen_lista_elso_kor
            }
            with open(progress_file_path, "w", encoding="utf-8") as f:
                json.dump(state, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f" (Mentési hiba: {e})")

    start_index = mar_kesz_db
    feldolgozando_maradek = termek_lista[start_index:]

    sikeres_db = 0
    veglegesen_sikertelen_lista = []
    veglegesen_sikertelen_db = 0
    log_fajl_neve = "error_log.txt"

    if not feldolgozando_maradek and sikertelen_lista_elso_kor:
        print("✅ A fő lista már kész, a javítandó elemekkel folytatom.")
    elif not feldolgozando_maradek and not sikertelen_lista_elso_kor:
        print("✅ A mentés alapján ez a munka teljesen kész!")
        if os.path.exists(progress_file_path):
            os.remove(progress_file_path)
        return

    try:
        page = context.new_page()
        print("Új böngésző lap nyitva.")
    except Exception as e:
        print(f"HIBA: Nem sikerült új lapot nyitni: {e}")
        return

    # --- FŐ CIKLUS (1. KÖR) ---
    if feldolgozando_maradek:
        print(f"\n--- 1. KÖR FOLYTATÁSA ({len(feldolgozando_maradek)} termék) ---")

        for i, (cikkszam, cimke_lista) in enumerate(feldolgozando_maradek):
            aktualis_sorszam = start_index + i + 1
            print(f"\n[{aktualis_sorszam}/{len(termek_lista)}] Feldolgozás...")
            print(f"  Cikkszám: {cikkszam}")

            try:
                # Navigálás biztosítása
                if "administrator" not in page.url:
                    page.goto("https://szvgtoolsshop.hu/administrator/", timeout=60000)

                # Keresés
                search_field = page.locator("#searchField_all")
                try:
                    search_field.wait_for(state="visible", timeout=5000)
                except:
                    page.goto("https://szvgtoolsshop.hu/administrator/", timeout=60000)
                    search_field.wait_for(state="visible", timeout=10000)

                search_field.fill(cikkszam)
                search_field.press("Enter")

                sor = page.locator(f"tr:has(td:text-is('{cikkszam}'))")
                sor.wait_for(timeout=10000)
                termek_link = sor.locator("a[href*='view=product']")
                termek_link.click()

                # --- 4. PONT: TÖRLÉS (JAVÍTOTT LOGIKA) ---
                if feluliras_mod:
                    print("  [MÓD: FELÜLÍRÁS] Meglévő címkék törlése...")
                    try:
                        time.sleep(1.0)
                        # Megvárjuk, hogy a mező látható legyen
                        container = page.locator("div.selectize-control.tags div.selectize-input")
                        container.wait_for(state="visible", timeout=5000)
                        time.sleep(1.0)
                        # Lokátor a kis "x" gombokhoz
                        remove_btns = container.locator("div.item a.remove")

                        # Addig kattintunk az ELSŐ gombra, amíg van találat (count > 0)
                        while remove_btns.count() > 0:
                            # force=True: átkattint az esetleges takaráson
                            remove_btns.first.click(force=True, timeout=2000)
                            # Várunk picit, hogy a JS kivegye a listából
                            page.wait_for_timeout(200)

                        print("  Minden meglévő címke törölve.")
                    except Exception as e:
                        print(f"  Törlési hiba (figyelmen kívül hagyva): {e}")
                else:
                    print("  [MÓD: HOZZÁADÁS] Meglévő címkék megtartása.")
                # --------------------------------------

                # --- RÉGI, JÓ HOZZÁADÁS LOGIKA ---
                if cimke_lista:
                    cimke_beviteli_mezo = page.locator(
                        "div.selectize-control.tags div.selectize-input input[type='text']").first
                    cimke_beviteli_mezo.wait_for(timeout=5000)

                    for cimke in cimke_lista:
                        if cimke:
                            # 1. Fill
                            cimke_beviteli_mezo.fill(cimke)
                            # 2. Space + Backspace (Trükk a lista frissítéshez)
                            cimke_beviteli_mezo.press("Space")
                            time.sleep(0.2)
                            cimke_beviteli_mezo.press("Backspace")
                            time.sleep(1.0)  # Várjunk, hogy a JS betöltse a listát

                            # 3. Kombinált lokátor (RÉGI, JÓ verzió)
                            dropdown = page.locator("div.selectize-dropdown.tags").first
                            target_option = dropdown.locator(
                                f"div.option[data-value='{cimke}'], div.create:has-text('Új címke: {cimke}')"
                            ).first

                            target_option.click(timeout=10000)
                            time.sleep(0.3)

                # Mentés
                page.locator("a#save:has-text('Mentés')").click()
                time.sleep(3)  # Fix várakozás a mentésre

                print(f"  ✅ Sikeres.")
                sikeres_db += 1

            except Exception as e:
                print(f"  ❌ HIBA (1. KÖR): {e}")
                sikertelen_lista_elso_kor.append([cikkszam, cimke_lista])
                try:
                    with open(log_fajl_neve, "a", encoding="utf-8") as f:
                        f.write(f"HIBA {cikkszam}: {e}\n")
                except:
                    pass

                # Ha hiba volt, próbáljunk visszamenni a főoldalra
                try:
                    page.goto("https://szvgtoolsshop.hu/administrator/", timeout=10000)
                except:
                    pass

            # --- 1. PONT: Mentés minden lépés után ---
            mentes_allapot(aktualis_sorszam)

    # --- 2. KÖR (Retry) ---
    if sikertelen_lista_elso_kor:
        print("\n" + "=" * 50)
        print(f"2. KÖR: Újrapróbálkozás ({len(sikertelen_lista_elso_kor)} db).")
        feldolgozando_retry = list(sikertelen_lista_elso_kor)  # Másolat

        for i, (cikkszam, cimke_lista) in enumerate(feldolgozando_retry):
            print(f"[{i + 1}/{len(feldolgozando_retry)}] Retry: {cikkszam}")
            try:
                page.goto("https://szvgtoolsshop.hu/administrator/", timeout=60000)
                sf = page.locator("#searchField_all")
                sf.wait_for(state="visible", timeout=10000)
                sf.fill(cikkszam)
                sf.press("Enter")

                sor = page.locator(f"tr:has(td:text-is('{cikkszam}'))")
                sor.wait_for(timeout=10000)
                sor.locator("a[href*='view=product']").click()

                # Törlés (ha kell)
                # Törlés (ha kell) - JAVÍTOTT
                if feluliras_mod:
                    try:
                        container = page.locator("div.selectize-control.tags div.selectize-input")
                        container.wait_for(state="visible", timeout=5000)
                        remove_btns = container.locator("div.item a.remove")

                        while remove_btns.count() > 0:
                            remove_btns.first.click(force=True, timeout=2000)
                            page.wait_for_timeout(200)
                    except:
                        pass

                # Hozzáadás (Régi logika)
                if cimke_lista:
                    inp = page.locator("div.selectize-control.tags div.selectize-input input[type='text']").first
                    for cimke in cimke_lista:
                        if cimke:
                            inp.fill(cimke)
                            inp.press("Space");
                            time.sleep(0.2);
                            inp.press("Backspace");
                            time.sleep(1.0)
                            dd = page.locator("div.selectize-dropdown.tags").first
                            dd.locator(
                                f"div.option[data-value='{cimke}'], div.create:has-text('Új címke: {cimke}')").first.click(
                                timeout=10000)
                            time.sleep(0.3)

                page.locator("a#save:has-text('Mentés')").click()
                time.sleep(3)

                print("  ✅ Sikeres (2. kör).")
                sikeres_db += 1

                # Frissítjük a hibalistát és mentünk
                sikertelen_lista_elso_kor = [x for x in sikertelen_lista_elso_kor if x[0] != cikkszam]
                mentes_allapot(start_index + len(feldolgozando_maradek))

            except Exception as e:
                print(f"  ❌ VÉGLEGES HIBA: {cikkszam}")
                veglegesen_sikertelen_db += 1
                veglegesen_sikertelen_lista.append((cikkszam, cimke_lista))
                # Kivesszük a retry listából, mert végeztünk vele
                sikertelen_lista_elso_kor = [x for x in sikertelen_lista_elso_kor if x[0] != cikkszam]
                mentes_allapot(start_index + len(feldolgozando_maradek))

    page.close()

    # Takarítás
    if os.path.exists(progress_file_path) and not sikertelen_lista_elso_kor:
        os.remove(progress_file_path)
        print("\n🗑️  Munkamenet fájl törölve.")
    elif sikertelen_lista_elso_kor:
        print("\n⚠️ A munkamenet fájl megmaradt.")

    print("\n" + "=" * 50)
    print(f"Sikeres: {sikeres_db}")
    print(f"Végleges hiba: {veglegesen_sikertelen_db}")

    if veglegesen_sikertelen_lista:
        try:
            os.makedirs("sikertelen_tablak", exist_ok=True)
            df_err = pd.DataFrame([{"Cikkszám": c, "Címke": ', '.join(l)} for c, l in veglegesen_sikertelen_lista])
            fnev = f"sikertelen_tablak/sikertelen_{datetime.datetime.now().strftime('%Y%m%d_%H%M')}.xlsx"
            df_err.to_excel(fnev, index=False)
            print(f"Hibalista mentve: {fnev}")
        except:
            pass


# --- 3. LÉPÉS: Bejelentkezés kezelése ---
def bejelentkezes_kezelese(browser: Browser, username, password, state_fajl="state.json"):
    context = None
    if os.path.exists(state_fajl):
        print(f"\nMeglévő bejelentkezési fájl ('{state_fajl}') található.")
        try:
            context = browser.new_context(storage_state=state_fajl)
            page_test = context.new_page()
            page_test.goto("https://szvgtoolsshop.hu/administrator/", timeout=15000)
            page_test.locator("#searchField_all").wait_for(timeout=5000)
            print("✅ Bejelentkezés érvényes.")
            page_test.close()
            return context
        except:
            print("❌ Érvénytelen session, új bejelentkezés...")
            if context: context.close()

    print("\nÚj bejelentkezés...")
    context = browser.new_context()
    page = context.new_page()
    page.goto("https://szvgtoolsshop.hu/administrator/", timeout=15000)
    try:
        page.fill("input[name='username']", username)
        page.fill("input[name='password']", password)
        page.click("button[type='submit']")
        page.locator("#searchField_all").wait_for(timeout=10000)
        print("✅ Bejelentkezés sikeres.")
        context.storage_state(path=state_fajl)
    except Exception as e:
        print(f"❌ HIBA: {e}")
        browser.close()
        sys.exit(1)
    page.close()
    return context


# --- 4. LÉPÉS: Main ---
if __name__ == "__main__":
    load_dotenv()
    STATE_FAJL = "state.json"
    FAJLOK_MAPPAJA = "input_tablak"
    FELHASZNALONEV = os.environ.get("ADMIN_USERNAME")
    JELSZO = os.environ.get("ADMIN_PASSWORD")

    if not FELHASZNALONEV or not JELSZO:
        print("HIBA: Nincs user/pass a .env-ben!")
        sys.exit(1)

    if not os.path.exists(FAJLOK_MAPPAJA): os.makedirs(FAJLOK_MAPPAJA); sys.exit(1)
    excel_fajlok = [f for f in os.listdir(FAJLOK_MAPPAJA) if f.endswith(('.xlsx', '.xls'))]
    if not excel_fajlok: print("Nincs Excel fájl!"); sys.exit(1)

    print("\n--- Fájl Választása ---")
    for i, f in enumerate(excel_fajlok): print(f"  {i + 1}: {f}")

    valasztott_path = ""
    while True:
        try:
            idx = int(input("Szám: ")) - 1
            if 0 <= idx < len(excel_fajlok):
                valasztott_path = os.path.join(FAJLOK_MAPPAJA, excel_fajlok[idx])
                break
        except:
            pass

    progress_file = valasztott_path + ".progress.json"

    # --- 4. PONT: MŰKÖDÉSI MÓD ---
    print("\n--- Működési Mód ---")
    print("  1: HOZZÁADÁS (Meglévők maradnak)")
    print("  2: FELÜLÍRÁS (Meglévők törlése)")

    mod_valasz = ""
    while mod_valasz not in ["1", "2"]:
        mod_valasz = input("Válassz (1/2): ").strip()

    feluliras = (mod_valasz == "2")
    print(f">> Mód: {'FELÜLÍRÁS' if feluliras else 'HOZZÁADÁS'}")

    termekek = adatok_beolvasasa(valasztott_path)
    if not termekek: sys.exit(1)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = bejelentkezes_kezelese(browser, FELHASZNALONEV, JELSZO, STATE_FAJL)
        if context:
            run_processor(context, termekek, progress_file, feluliras_mod=feluliras)
        browser.close()