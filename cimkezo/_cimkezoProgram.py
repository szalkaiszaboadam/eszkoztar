import pandas as pd
from playwright.sync_api import sync_playwright, Playwright, expect, Browser, BrowserContext as Context
import time
import sys
import datetime
import os
import json
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

    # ÚJ: A 'Név' oszlop is kötelezővé vált
    if "Cikkszám" not in df.columns or "Címke" not in df.columns or "Márka" not in df.columns or "Név" not in df.columns:
        print("HIBA: Az Excel fájlnak tartalmaznia kell 'Cikkszám', 'Márka', 'Név' és 'Címke' oszlopokat.")
        return None

    feldolgozando_lista = []
    for index, row in df.iterrows():
        cikkszam = str(row["Cikkszám"]).strip()
        marka = str(row["Márka"]).strip()
        nev = str(row["Név"]).strip()
        cimke_string = str(row["Címke"]).strip()

        if not cikkszam or cikkszam.lower() == 'nan':
            continue

        if nev.lower() == 'nan':
            nev = ""

        if cimke_string and cimke_string.lower() != 'nan':
            raw_list = [c.strip().lower() for c in cimke_string.split(',') if c.strip()]
            cimke_lista = list(set(raw_list))
        else:
            cimke_lista = []

        # Név hozzáadva a listához
        feldolgozando_lista.append((cikkszam, marka, nev, cimke_lista))

    return feldolgozando_lista


# --- 2. LÉPÉS: Fő Feldolgozó Funkció ---
def run_processor(context: Context, termek_lista, progress_file_path, bemeneti_fajl_neve, feluliras_mod=False):
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

        for i, (cikkszam, marka, nev, cimke_lista) in enumerate(feldolgozando_maradek):
            aktualis_sorszam = start_index + i + 1
            print(f"\n[{aktualis_sorszam}/{len(termek_lista)}] Feldolgozás...")
            print(f"  Cikkszám: {cikkszam} | Márka: {marka} | Név: {nev}")

            try:
                if "administrator" not in page.url:
                    page.goto("https://szvgtoolsshop.hu/administrator/", timeout=60000)

                search_field = page.locator("#searchField_all")
                try:
                    search_field.wait_for(state="visible", timeout=5000)
                except:
                    page.goto("https://szvgtoolsshop.hu/administrator/", timeout=60000)
                    search_field.wait_for(state="visible", timeout=10000)

                search_field.fill(cikkszam)
                search_field.press("Enter")

                # --- ÚJ: MÁRKA ÉS NÉV SZŰRÉS LOGIKA ---
                sorok = page.locator(f"tr:has(td:text-is('{cikkszam}'))")
                sorok.first.wait_for(timeout=10000)

                talalat_db = sorok.count()

                if talalat_db == 1:
                    sor = sorok.first
                elif talalat_db > 1:
                    print(f"  ⚠️ Több találat ({talalat_db} db). Szűrés márkára ('{marka}') és névre ('{nev}')...")
                    # Rászűrünk a látható szövegre a soron belül, ami tartalmazza a márkát és a nevet is.
                    # Ez sokkal biztonságosabb, ha a névben speciális karakterek (pl. " vagy ') vannak.
                    # Szigorú szűrés a márkára (pontos cella), és a névre
                    szurt_sorok = sorok.filter(has=page.locator(f"td:text-is('{marka}')")).filter(has_text=nev)
                    szurt_db = szurt_sorok.count()

                    if szurt_db == 1:
                        print("  ✅ Márka és név alapján sikeresen beazonosítva az egyetlen termék.")
                        sor = szurt_sorok.first
                    elif szurt_db > 1:
                        raise Exception("Duplikáció miatt átugorva: Több azonos cikkszám, márka ÉS név található!")
                    else:
                        raise Exception(
                            f"Több azonos cikkszám, de egyiknél sem stimmel a megadott márka és név egyszerre!")
                else:
                    raise Exception("Nem található a cikkszám a keresés után!")
                # -------------------------------

                termek_link = sor.locator("a[href*='view=product']")
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
                page.locator("a#save:has-text('Mentés')").click()
                time.sleep(3)

                print(f"  ✅ Sikeres.")
                sikeres_db += 1

            except Exception as e:
                hiba_uzenet = str(e)
                print(f"  ❌ HIBA (1. KÖR): {hiba_uzenet}")
                # Hozzáadjuk a nevet és a hibaüzenetet is a listához
                sikertelen_lista_elso_kor.append([cikkszam, marka, nev, cimke_lista, hiba_uzenet])
                try:
                    with open(log_fajl_neve, "a", encoding="utf-8") as f:
                        f.write(f"HIBA {cikkszam} ({marka} - {nev}): {hiba_uzenet}\n")
                except:
                    pass

                try:
                    page.goto("https://szvgtoolsshop.hu/administrator/", timeout=10000)
                except:
                    pass

            mentes_allapot(aktualis_sorszam)

    # --- 2. KÖR (Retry) ---
    if sikertelen_lista_elso_kor:
        print("\n" + "=" * 50)
        print(f"2. KÖR: Újrapróbálkozás ({len(sikertelen_lista_elso_kor)} db).")
        feldolgozando_retry = list(sikertelen_lista_elso_kor)

        # Itt már 5 elemet csomagolunk ki
        for i, (cikkszam, marka, nev, cimke_lista, elozo_hiba) in enumerate(feldolgozando_retry):
            print(f"[{i + 1}/{len(feldolgozando_retry)}] Retry: {cikkszam} | {marka} | {nev}")

            # Ha már az első körben duplikáció miatt dobta el, azt felesleges újrapróbálni
            if "Duplikáció" in elozo_hiba or "Több azonos cikkszám" in elozo_hiba:
                print(f"  ⚠️ Újrapróbálkozás átugorva, mert korábban duplikációs hibát kapott.")
                veglegesen_sikertelen_db += 1
                veglegesen_sikertelen_lista.append((cikkszam, marka, nev, cimke_lista, elozo_hiba))
                sikertelen_lista_elso_kor = [x for x in sikertelen_lista_elso_kor if x[0] != cikkszam]
                mentes_allapot(start_index + len(feldolgozando_maradek))
                continue

            try:
                page.goto("https://szvgtoolsshop.hu/administrator/", timeout=60000)
                sf = page.locator("#searchField_all")
                sf.wait_for(state="visible", timeout=10000)
                sf.fill(cikkszam)
                sf.press("Enter")

                sorok = page.locator(f"tr:has(td:text-is('{cikkszam}'))")
                sorok.first.wait_for(timeout=10000)

                talalat_db = sorok.count()

                if talalat_db == 1:
                    sor = sorok.first
                elif talalat_db > 1:
                    # Szigorú szűrés a márkára (pontos cella), és a névre
                    szurt_sorok = sorok.filter(has=page.locator(f"td:text-is('{marka}')")).filter(has_text=nev)
                    szurt_db = szurt_sorok.count()
                    if szurt_db == 1:
                        sor = szurt_sorok.first
                    elif szurt_db > 1:
                        raise Exception("Duplikáció miatt átugorva: Több azonos cikkszám, márka ÉS név található!")
                    else:
                        raise Exception(
                            f"Több azonos cikkszám, de egyiknél sem stimmel a megadott márka és név egyszerre!")
                else:
                    raise Exception("Nem található a cikkszám a keresés után!")

                sor.locator("a[href*='view=product']").click()

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

                page.locator("a#save:has-text('Mentés')").click()
                time.sleep(3)

                print("  ✅ Sikeres (2. kör).")
                sikeres_db += 1

                sikertelen_lista_elso_kor = [x for x in sikertelen_lista_elso_kor if x[0] != cikkszam]
                mentes_allapot(start_index + len(feldolgozando_maradek))

            except Exception as e:
                vegleges_hiba = str(e)
                print(f"  ❌ VÉGLEGES HIBA: {cikkszam} - {vegleges_hiba}")
                veglegesen_sikertelen_db += 1
                veglegesen_sikertelen_lista.append((cikkszam, marka, nev, cimke_lista, vegleges_hiba))
                sikertelen_lista_elso_kor = [x for x in sikertelen_lista_elso_kor if x[0] != cikkszam]
                mentes_allapot(start_index + len(feldolgozando_maradek))

    page.close()

    if os.path.exists(progress_file_path) and not sikertelen_lista_elso_kor:
        os.remove(progress_file_path)
        print("\n🗑️  Munkamenet fájl törölve.")
    elif sikertelen_lista_elso_kor:
        print("\n⚠️ A munkamenet fájl megmaradt.")

    print("\n" + "=" * 50)
    print(f"Sikeres: {sikeres_db}")
    print(f"Végleges hiba: {veglegesen_sikertelen_db}")

    # --- ÚJ: HIBALISTA EXPORTÁLÁSA NÉVVEL ÉS MEGJEGYZÉSSEL ---
    if veglegesen_sikertelen_lista:
        try:
            os.makedirs("sikertelen_tablak", exist_ok=True)
            df_err = pd.DataFrame([
                {
                    "Cikkszám": c,
                    "Márka": m,
                    "Név": n,
                    "Címke": ', '.join(l),
                    "Megjegyzés": h
                } for c, m, n, l, h in veglegesen_sikertelen_lista
            ])
            # Kinyerjük a bemeneti fájl nevét kiterjesztés nélkül (pl. "termekek.xlsx" -> "termekek")
            alap_nev = os.path.splitext(os.path.basename(bemeneti_fajl_neve))[0]
            fnev = f"sikertelen_tablak/{alap_nev}_hiba_{datetime.datetime.now().strftime('%Y%m%d_%H%M')}.xlsx"

            df_err.to_excel(fnev, index=False)
            print(f"Hibalista mentve ide: {fnev}")
        except Exception as e:
            print(f"Nem sikerült a hibalistát elmenteni: {e}")


# --- 3. LÉPÉS: Bejelentkezés kezelése (Változatlan) ---
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


# --- 4. LÉPÉS: Main (Változatlan) ---
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
            run_processor(context, termekek, progress_file, valasztott_path, feluliras_mod=feluliras)
        browser.close()