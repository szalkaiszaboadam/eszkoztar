import pandas as pd
from playwright.sync_api import sync_playwright, Playwright, expect, Browser, BrowserContext as Context
import time
import sys
import datetime
import os
import json
import re
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

    if "Cikkszám" not in df.columns or "Címke" not in df.columns or "Márka" not in df.columns or "Név" not in df.columns:
        print("HIBA: Az Excel fájlnak tartalmaznia kell 'Cikkszám', 'Márka', 'Név' és 'Címke' oszlopokat.")
        return None

    feldolgozando_lista = []
    for index, row in df.iterrows():
        # --- EXCEL DÁTUM HIBA JAVÍTÁSA ---
        # Az Excel a "6511-10"-et dátumnak hiszi, és átalakítja: "6511-10-01 00:00:00"-ra
        nyers_cikkszam = str(row["Cikkszám"]).strip()

        if nyers_cikkszam.endswith(" 00:00:00"):
            # Először levágjuk az időt
            nyers_cikkszam = nyers_cikkszam.replace(" 00:00:00", "")
            # Ha az Excel önkényesen hozzáadott egy "-01" (első nap) toldatot, azt is levágjuk
            if nyers_cikkszam.endswith("-01"):
                nyers_cikkszam = nyers_cikkszam[:-3]

        cikkszam = nyers_cikkszam

        marka = str(row["Márka"]).strip()
        nev = str(row["Név"]).strip()
        cimke_string = str(row["Címke"]).strip()

        van_azonosito = (cikkszam and cikkszam.lower() != 'nan') or (nev and nev.lower() != 'nan')
        if not van_azonosito:
            continue

        if nev.lower() == 'nan':
            nev = ""

        if cimke_string and cimke_string.lower() != 'nan':
            raw_list = [c.strip().lower() for c in cimke_string.split(',') if c.strip()]
            cimke_lista = list(set(raw_list))
        else:
            cimke_lista = []

        feldolgozando_lista.append((cikkszam, marka, nev, cimke_lista))

    return feldolgozando_lista


# --- 2. LÉPÉS: Fő Feldolgozó Funkció ---
def run_processor(context: Context, termek_lista, progress_file_path, bemeneti_fajl_neve, base_url,
                  feluliras_mod=False):
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

    def mentes_allapot(aktualis_index):
        try:
            state = {
                "index": aktualis_index,
                "retry_list": sikertelen_lista_elso_kor,
                "feluliras_mod": feluliras_mod
            }
            with open(progress_file_path, "w", encoding="utf-8") as f:
                json.dump(state, f, ensure_ascii=False, indent=2)
        except Exception as e:
            pass

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

        for i, (cikkszam, marka, nev, cimke_lista) in enumerate(feldolgozando_maradek):
            aktualis_sorszam = start_index + i + 1

            van_cikkszam = cikkszam and cikkszam.lower() != 'nan'
            keresendo = cikkszam if van_cikkszam else nev

            print(f"\n[{aktualis_sorszam}/{len(termek_lista)}] Feldolgozás...")
            print(f"  Keresés alapja: {'Cikkszám' if van_cikkszam else 'Név'} -> {keresendo}")

            try:
                # --- ÚJ, BIZTONSÁGOS NAVIGÁCIÓ (ERR_ABORTED ellen) ---
                navigacio_sikeres = False
                for proba in range(3):
                    try:
                        page.goto(f"{base_url}/administrator/", timeout=60000, wait_until="domcontentloaded")
                        navigacio_sikeres = True
                        break
                    except Exception as nav_e:
                        print(
                            f"   ⚠️ Navigációs hiba ({proba + 1}/3. próba): {str(nav_e).splitlines()[0]}. Újrapróbálás 3 mp múlva...")
                        time.sleep(3)

                if not navigacio_sikeres:
                    raise Exception("Nem sikerült betölteni az admin oldalt 3 próbálkozás után sem (ERR_ABORTED).")

                # --- NÉZET ELLENŐRZÉSE ÉS VÁLTÁSA ---
                nezet_valto_gomb = page.locator("li.modeSwitch[onclick*='switchMode(2)']")
                if nezet_valto_gomb.is_visible(timeout=3000):
                    print("🔄 Rossz nézet észlelve! Átváltás Bizonylatkészítőre...")
                    nezet_valto_gomb.click()
                    time.sleep(3)
                    page.locator("#searchField_all").wait_for(state="visible", timeout=10000)

                search_field = page.locator("#searchField_all")
                search_field.wait_for(state="visible", timeout=10000)
                time.sleep(0.5)

                search_field.fill(keresendo)
                search_field.press("Enter")
                time.sleep(1.5)

                # --- ÚJ, BIZTONSÁGOSABB KERESÉSI LOGIKA ---
                if van_cikkszam:
                    sorok = page.locator("tbody tr").filter(has_text=cikkszam)
                else:
                    sorok = page.locator("tbody tr").filter(has_text=nev)

                sorok.first.wait_for(timeout=10000)
                talalat_db = sorok.count()

                if talalat_db == 1:
                    sor = sorok.first
                elif talalat_db > 1:
                    print(f"   ⚠️ Több találat ({talalat_db} db). Pontosítás...")
                    sor = None

                    # 1. Próba: Pontos cikkszám
                    if van_cikkszam:
                        pontos_c_sorok = sorok.filter(has=page.get_by_text(cikkszam, exact=True))
                        if pontos_c_sorok.count() == 1:
                            sor = pontos_c_sorok.first
                            print("   ✅ Pontos cikkszám egyezés alapján beazonosítva.")

                    # 2. Próba: Márka és Név
                    if sor is None:
                        szurt_sorok = sorok
                        if marka.lower() != 'nan':
                            szurt_sorok = szurt_sorok.filter(has_text=marka)

                        van_nev = nev and nev.lower() != 'nan'
                        if van_nev:
                            szurt_sorok = szurt_sorok.filter(has_text=nev)

                        szurt_db = szurt_sorok.count()

                        if szurt_db == 1:
                            sor = szurt_sorok.first
                            print("   ✅ Szűrés (márka/név) alapján beazonosítva.")
                        elif szurt_db > 1:
                            if van_nev:
                                pontos_n_sorok = szurt_sorok.filter(has=page.get_by_text(nev, exact=True))
                                if pontos_n_sorok.count() == 1:
                                    sor = pontos_n_sorok.first
                                    print("   ✅ Pontos név egyezés alapján beazonosítva.")
                                else:
                                    raise Exception("DUPLIKÁCIÓ (név és márka alapján is több azonos sor van)")
                            else:
                                raise Exception("DUPLIKÁCIÓ (több találat maradt, de nincs Név a döntéshez)")
                        else:
                            raise Exception("A szűkítés után egyetlen termék sem maradt!")
                else:
                    raise Exception("Nem található a keresett termék a listában!")

                termek_link = sor.locator("a[href*='view=product']")
                termek_link.wait_for(timeout=10000)
                termek_link.click()

                # Törlés
                if feluliras_mod:
                    print("  [MÓD: FELÜLÍRÁS] Meglévő címkék törlése...")
                    try:
                        time.sleep(1.0)
                        container = page.locator("div.selectize-control.tags div.selectize-input")
                        container.wait_for(state="visible", timeout=5000)
                        time.sleep(1.0)
                        remove_btns = container.locator("div.item a.remove")

                        while remove_btns.count() > 0:
                            remove_btns.first.click(force=True, timeout=2000)
                            page.wait_for_timeout(200)

                        print("  Minden meglévő címke törölve.")
                    except Exception as e:
                        print(f"  Törlési hiba (figyelmen kívül hagyva): {e}")
                else:
                    print("  [MÓD: HOZZÁADÁS] Meglévő címkék megtartása.")

                # Hozzáadás
                if cimke_lista:
                    cimke_beviteli_mezo = page.locator(
                        "div.selectize-control.tags div.selectize-input input[type='text']").first
                    cimke_beviteli_mezo.wait_for(timeout=5000)

                    for cimke in cimke_lista:
                        if cimke:
                            cimke_beviteli_mezo.fill(cimke)
                            cimke_beviteli_mezo.press("Space")
                            time.sleep(0.2)
                            cimke_beviteli_mezo.press("Backspace")
                            time.sleep(1.0)

                            dropdown = page.locator("div.selectize-dropdown.tags").first
                            target_option = dropdown.locator(
                                f"div.option[data-value='{cimke}'], div.create:has-text('Új címke: {cimke}')"
                            ).first

                            target_option.click(timeout=10000)
                            time.sleep(0.3)

                # Mentés
                save_button = page.locator("a#save:has-text('Mentés')")
                save_button.click()
                page.wait_for_load_state("networkidle")
                time.sleep(2)

                print(f"  ✅ Sikeres.")
                sikeres_db += 1

            except Exception as e:
                hiba_uzenet = str(e)
                print(f"  ❌ HIBA (1. KÖR): {hiba_uzenet}")
                sikertelen_lista_elso_kor.append([cikkszam, marka, nev, cimke_lista, hiba_uzenet])
                try:
                    with open(log_fajl_neve, "a", encoding="utf-8") as f:
                        f.write(f"HIBA {keresendo} ({marka} - {nev}): {hiba_uzenet}\n")
                except:
                    pass

            mentes_allapot(aktualis_sorszam)

    # --- 2. KÖR (Retry) ---
    if sikertelen_lista_elso_kor:
        print("\n" + "=" * 50)
        print(f"2. KÖR: Újrapróbálkozás ({len(sikertelen_lista_elso_kor)} db).")
        feldolgozando_retry = list(sikertelen_lista_elso_kor)

        for i, (cikkszam, marka, nev, cimke_lista, elozo_hiba) in enumerate(feldolgozando_retry):

            van_cikkszam = cikkszam and cikkszam.lower() != 'nan'
            keresendo = cikkszam if van_cikkszam else nev

            print(f"\n[{i + 1}/{len(feldolgozando_retry)}] Retry: Keresés alapja -> {keresendo}")

            if "DUPLIKÁCIÓ" in elozo_hiba.upper() or "AZONOS" in elozo_hiba.upper():
                print(f"  ⚠️ Újrapróbálkozás átugorva, mert korábban duplikációs hibát kapott.")
                veglegesen_sikertelen_db += 1
                veglegesen_sikertelen_lista.append((cikkszam, marka, nev, cimke_lista, elozo_hiba))
                if sikertelen_lista_elso_kor: sikertelen_lista_elso_kor.pop(0)
                mentes_allapot(start_index + len(feldolgozando_maradek))
                continue

            try:
                # --- ÚJ, BIZTONSÁGOS NAVIGÁCIÓ (ERR_ABORTED ellen) ---
                navigacio_sikeres = False
                for proba in range(3):
                    try:
                        page.goto(f"{base_url}/administrator/", timeout=60000, wait_until="domcontentloaded")
                        navigacio_sikeres = True
                        break
                    except Exception as nav_e:
                        print(
                            f"   ⚠️ Navigációs hiba ({proba + 1}/3. próba): {str(nav_e).splitlines()[0]}. Újrapróbálás 3 mp múlva...")
                        time.sleep(3)

                if not navigacio_sikeres:
                    raise Exception("Nem sikerült betölteni az admin oldalt 3 próbálkozás után sem (ERR_ABORTED).")

                sf = page.locator("#searchField_all")
                sf.wait_for(state="visible", timeout=10000)
                time.sleep(0.5)
                sf.fill(keresendo)
                sf.press("Enter")
                time.sleep(1.5)

                if van_cikkszam:
                    sorok = page.locator("tbody tr").filter(has_text=cikkszam)
                else:
                    sorok = page.locator("tbody tr").filter(has_text=nev)

                sorok.first.wait_for(timeout=10000)
                talalat_db = sorok.count()

                if talalat_db == 1:
                    sor = sorok.first
                elif talalat_db > 1:
                    print(f"   ⚠️ Több találat ({talalat_db} db). Pontosítás...")
                    sor = None

                    if van_cikkszam:
                        pontos_c_sorok = sorok.filter(has=page.get_by_text(cikkszam, exact=True))
                        if pontos_c_sorok.count() == 1:
                            sor = pontos_c_sorok.first
                            print("   ✅ Pontos cikkszám egyezés alapján beazonosítva.")

                    if sor is None:
                        szurt_sorok = sorok
                        if marka.lower() != 'nan':
                            szurt_sorok = szurt_sorok.filter(has_text=marka)

                        van_nev = nev and nev.lower() != 'nan'
                        if van_nev:
                            szurt_sorok = szurt_sorok.filter(has_text=nev)

                        szurt_db = szurt_sorok.count()

                        if szurt_db == 1:
                            sor = szurt_sorok.first
                            print("   ✅ Szűrés (márka/név) alapján beazonosítva.")
                        elif szurt_db > 1:
                            if van_nev:
                                pontos_n_sorok = szurt_sorok.filter(has=page.get_by_text(nev, exact=True))
                                if pontos_n_sorok.count() == 1:
                                    sor = pontos_n_sorok.first
                                    print("   ✅ Pontos név egyezés alapján beazonosítva.")
                                else:
                                    raise Exception("DUPLIKÁCIÓ (név és márka alapján is több azonos sor van)")
                            else:
                                raise Exception("DUPLIKÁCIÓ (több találat maradt, de nincs Név a döntéshez)")
                        else:
                            raise Exception("A szűkítés után egyetlen termék sem maradt!")
                else:
                    raise Exception("Nem található a keresett termék a listában!")

                sor.locator("a[href*='view=product']").click()

                if feluliras_mod:
                    try:
                        time.sleep(1)
                        container = page.locator("div.selectize-control.tags div.selectize-input")
                        container.wait_for(state="visible", timeout=5000)
                        remove_btns = container.locator("div.item a.remove")

                        while remove_btns.count() > 0:
                            remove_btns.first.click(force=True, timeout=2000)
                            page.wait_for_timeout(200)
                    except:
                        pass

                if cimke_lista:
                    inp = page.locator("div.selectize-control.tags div.selectize-input input[type='text']").first
                    for cimke in cimke_lista:
                        if cimke:
                            inp.fill(cimke)
                            inp.press("Space")
                            time.sleep(0.2)
                            inp.press("Backspace")
                            time.sleep(1.0)
                            dd = page.locator("div.selectize-dropdown.tags").first
                            dd.locator(
                                f"div.option[data-value='{cimke}'], div.create:has-text('Új címke: {cimke}')").first.click(
                                timeout=10000)
                            time.sleep(0.3)

                save_button = page.locator("a#save:has-text('Mentés')")
                save_button.click()
                page.wait_for_load_state("networkidle")
                time.sleep(2)

                print("  ✅ Sikeres (2. kör).")
                sikeres_db += 1

                if sikertelen_lista_elso_kor: sikertelen_lista_elso_kor.pop(0)
                mentes_allapot(start_index + len(feldolgozando_maradek))

            except Exception as e:
                vegleges_hiba = str(e)
                print(f"  ❌ VÉGLEGES HIBA: {keresendo} - {vegleges_hiba}")
                veglegesen_sikertelen_db += 1
                veglegesen_sikertelen_lista.append((cikkszam, marka, nev, cimke_lista, vegleges_hiba))
                if sikertelen_lista_elso_kor: sikertelen_lista_elso_kor.pop(0)
                mentes_allapot(start_index + len(feldolgozando_maradek))

    page.close()

    if os.path.exists(progress_file_path) and not sikertelen_lista_elso_kor:
        try:
            os.remove(progress_file_path)
            print("\n🗑️  Munkamenet fájl törölve.")
        except:
            pass
    elif sikertelen_lista_elso_kor:
        print("\n⚠️ A munkamenet fájl megmaradt.")

    print("\n" + "=" * 50)
    print(f"Sikeres: {sikeres_db}")
    print(f"Végleges hiba: {veglegesen_sikertelen_db}")

    # --- EXPORTÁLÁS --- (Akkor is lefut, ha volt végleges hiba!)
    if veglegesen_sikertelen_lista:
        try:
            os.makedirs("sikertelen_tablak", exist_ok=True)
            df_err = pd.DataFrame([
                {
                    "Cikkszám": c,
                    "Márka": m,
                    "Név": n,
                    "Címke": ', '.join(l),
                    "Megjegyzés": str(h).strip()
                } for c, m, n, l, h in veglegesen_sikertelen_lista
            ])
            alap_nev = os.path.splitext(os.path.basename(bemeneti_fajl_neve))[0]
            fnev = f"sikertelen_tablak/{alap_nev}_hiba_{datetime.datetime.now().strftime('%Y%m%d_%H%M')}.xlsx"

            df_err.to_excel(fnev, index=False)
            print(f"Hibalista mentve ide: {fnev}")
        except Exception as e:
            print(f"Nem sikerült a hibalistát elmenteni: {e}")


# --- 3. LÉPÉS: Bejelentkezés kezelése ---
def bejelentkezes_kezelese(browser: Browser, username, password, base_url, state_fajl="state.json"):
    context = None
    if os.path.exists(state_fajl):
        print(f"\nMeglévő bejelentkezési fájl ('{state_fajl}') található.")
        try:
            context = browser.new_context(storage_state=state_fajl)
            page_test = context.new_page()
            page_test.goto(f"{base_url}/administrator/", timeout=15000)
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
    page.goto(f"{base_url}/administrator/", timeout=15000)
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
    FAJLOK_MAPPAJA = "input_tablak"

    # --- WEBSHOP VÁLASZTÁS ---
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

    folytatas = False
    feluliras = False

    if os.path.exists(progress_file):
        valasz_folytat = input(
            f"\n⚠️ Találtam egy félbemaradt mentést ehhez a fájlhoz.\nSzeretnéd folytatni onnan, ahol abbamaradt? (i/n): ").strip().lower()
        if valasz_folytat == 'i':
            folytatas = True
            try:
                with open(progress_file, "r", encoding="utf-8") as f:
                    state_data = json.load(f)
                    feluliras = state_data.get("feluliras_mod", False)
            except:
                pass
            print(f"   ⏩ Folytatás kiválasztva. (Mód: {'FELÜLÍRÁS' if feluliras else 'HOZZÁADÁS'})")
        else:
            os.remove(progress_file)
            print("   🗑️ Régi mentés törölve. Tiszta lappal indulunk.")

    if not folytatas:
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
        # headless=False - így látod is, ahogy dolgozik
        browser = p.chromium.launch(headless=True)
        context = bejelentkezes_kezelese(browser, FELHASZNALONEV, JELSZO, BASE_URL, STATE_FAJL)
        if context:
            run_processor(context, termekek, progress_file, valasztott_path, base_url=BASE_URL, feluliras_mod=feluliras)
        browser.close()