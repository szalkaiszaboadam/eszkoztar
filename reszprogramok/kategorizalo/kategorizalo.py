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

    # Ellenőrizzük, hogy megvannak-e a kötelező oszlopok (Név hozzáadva)
    szukseges_oszlopok = ["Cikkszám", "Név", "Alkategória", "Márka"]
    hianyzo_oszlopok = [oszlop for oszlop in szukseges_oszlopok if oszlop not in df.columns]

    if hianyzo_oszlopok:
        print(f"HIBA: Az Excel fájlból hiányoznak a következő kötelező oszlopok: {', '.join(hianyzo_oszlopok)}")
        print(f"A fájl jelenlegi oszlopai: {', '.join(df.columns.tolist())}")
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

        nev = str(row["Név"]).strip()
        marka = str(row["Márka"]).strip()
        kategoria_fejlec = str(row["Alkategória"]).strip()
        # ÚJ: Adatellenőrzés (Cikkszám VAGY Név kötelező)
        van_azonosito = (cikkszam and cikkszam.lower() != 'nan') or (nev and nev.lower() != 'nan')
        if not van_azonosito or marka.lower() == 'nan' or kategoria_fejlec.lower() == 'nan':
            continue

        tiszta_fejlec = re.sub(r'\.\d+$', '', kategoria_fejlec)
        kategoriak_listaja = [k.strip() for k in tiszta_fejlec.split(';') if k.strip()]

        if kategoriak_listaja:
            # ÚJ: 'nev' hozzáadása a listához
            feldolgozando_lista.append((cikkszam, marka, nev, kategoria_fejlec, kategoriak_listaja))

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
    for i, (cikkszam, marka, nev, eredeti_fejlec, kategoriak) in enumerate(feldolgozando_maradek):
        aktualis_sorszam = start_index + i + 1

        # ÚJ: Keresési kifejezés meghatározása
        van_cikkszam = cikkszam and cikkszam.lower() != 'nan'
        keresendo = cikkszam if van_cikkszam else nev

        print(f"\n[{aktualis_sorszam}/{len(termek_lista)}] Feldolgozás...")
        print(f"  Keresés alapja: {'Cikkszám' if van_cikkszam else 'Név'} -> {keresendo}")

        try:
            # --- ÚJ, BIZTONSÁGOS NAVIGÁCIÓ ---
            navigacio_sikeres = False
            for proba in range(3):
                try:
                    # A 'domcontentloaded' gyorsabb, nem vár minden apró képre, és kevésbé dob ERR_ABORTED-ot
                    page.goto(f"{base_url}/administrator/", timeout=60000, wait_until="domcontentloaded")
                    navigacio_sikeres = True
                    break  # Ha sikerült, kilépünk a próbálkozós ciklusból
                except Exception as nav_e:
                    print(
                        f"   ⚠️ Navigációs hiba ({proba + 1}/3. próba): {str(nav_e).splitlines()[0]}. Újrapróbálás 3 mp múlva...")
                    time.sleep(3)

            if not navigacio_sikeres:
                raise Exception("Nem sikerült betölteni az admin oldalt 3 próbálkozás után sem (ERR_ABORTED).")

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
            search_field.fill(keresendo)  # ÚJ: cikkszám helyett 'keresendo'
            search_field.press("Enter")
            time.sleep(1.5)

            # --- ÚJ, BIZTONSÁGOSABB KERESÉSI LOGIKA ---
            if van_cikkszam:
                sorok = page.locator("tbody tr").filter(has_text=cikkszam)
            else:
                sorok = page.locator("tbody tr").filter(has_text=nev)

            # Megvárjuk, hogy betöltsön a táblázat sora
            sorok.first.wait_for(timeout=10000)
            talalat_db = sorok.count()

            if talalat_db == 1:
                sor = sorok.first
            elif talalat_db > 1:
                print(f"   ⚠️ Több találat ({talalat_db} db). Pontosítás...")
                sor = None

                # 1. Próba: Pontos cikkszám keresése (kizárja a hasonló végződéseket, pl. .25)
                if van_cikkszam:
                    pontos_c_sorok = sorok.filter(has=page.get_by_text(cikkszam, exact=True))
                    if pontos_c_sorok.count() == 1:
                        sor = pontos_c_sorok.first
                        print("   ✅ Pontos cikkszám egyezés alapján beazonosítva.")

                # 2. Próba: Ha a pontos cikkszám nem segített, jöhet a márka és név szűrés
                if sor is None:
                    szurt_sorok = sorok
                    if marka.lower() != 'nan':
                        szurt_sorok = szurt_sorok.filter(has_text=marka)

                    # Csak akkor szűrünk névre, ha nem 'nan'
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
            time.sleep(2)

            # --- KATEGORIZÁLÓ MÓD ---
            if mod == "kategorizalo":
                kategorizalo_gomb = page.locator("a:has-text('A termék kategorizálása')")

                try:
                    # Várunk maximum 3 másodpercet, hátha megjelenik a gomb
                    kategorizalo_gomb.wait_for(state="visible", timeout=3000)
                    gomb_elerheto = True
                except:
                    gomb_elerheto = False

                if gomb_elerheto:
                    kategorizalo_gomb.click()
                    popup_ablak = page.locator("#popup")
                    popup_ablak.wait_for(timeout=10000)
                    time.sleep(1)

                    popup_kereso = popup_ablak.locator("div.selectize-control.categories input[type='text']")
                    dropdown = page.locator("div.selectize-dropdown.categories")

                    for kat in kategoriak:
                        stabil_kategoria_valasztas(page, popup_kereso, dropdown, kat)

                    popup_ablak.locator("div.pure-button:has-text('Hozzáadás a választott kategóriákhoz')").click()

                    popup_ablak.wait_for(state="hidden", timeout=10000)
                    print("   ✅ Popup bezárult, kategóriák hozzáadva.")
                    time.sleep(2)
                else:
                    print("   ℹ️ Nincs 'A termék kategorizálása' gomb. Valószínűleg már be van kategorizálva. Átugrás.")
                    time.sleep(0.5)

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
            sikertelen_lista_elso_kor.append((cikkszam, marka, nev, eredeti_fejlec, kategoriak, hiba_uzenet))
            mentes_allapot(aktualis_sorszam)

        # --- ÚJRAPRÓBÁLKOZÁSI CIKLUS (2. KÖR) ---
    if sikertelen_lista_elso_kor:
        print("\n" + "=" * 50)
        print(f"Indul a feldolgozás, 2. KÖR: Újrapróbálkozás {len(sikertelen_lista_elso_kor)} termékkel.")
        feldolgozando_retry = list(sikertelen_lista_elso_kor)

        for i, (cikkszam, marka, nev, eredeti_fejlec, kategoriak, elozo_hiba) in enumerate(feldolgozando_retry):

            van_cikkszam = cikkszam and cikkszam.lower() != 'nan'
            keresendo = cikkszam if van_cikkszam else nev

            print(f"\n[{i + 1}/{len(feldolgozando_retry)}] Retry: Keresés alapja -> {keresendo}")

            if "DUPLIKÁCIÓ" in elozo_hiba:
                print("   ⚠️ Újrapróbálkozás átugorva (Duplikációs hiba miatt).")
                veglegesen_sikertelen_db += 1
                veglegesen_sikertelen_lista.append((cikkszam, marka, nev, eredeti_fejlec, kategoriak, elozo_hiba))

                # JAVÍTÁS: Pontosan az aktuális elemet vesszük ki a listából, nem a cikkszámra szűrünk!
                if sikertelen_lista_elso_kor: sikertelen_lista_elso_kor.pop(0)
                mentes_allapot(start_index + len(feldolgozando_maradek))
                continue

            try:
                # --- ÚJ, BIZTONSÁGOS NAVIGÁCIÓ ---
                navigacio_sikeres = False
                for proba in range(3):
                    try:
                        # A 'domcontentloaded' gyorsabb, nem vár minden apró képre, és kevésbé dob ERR_ABORTED-ot
                        page.goto(f"{base_url}/administrator/", timeout=60000, wait_until="domcontentloaded")
                        navigacio_sikeres = True
                        break  # Ha sikerült, kilépünk a próbálkozós ciklusból
                    except Exception as nav_e:
                        print(
                            f"   ⚠️ Navigációs hiba ({proba + 1}/3. próba): {str(nav_e).splitlines()[0]}. Újrapróbálás 3 mp múlva...")
                        time.sleep(3)

                if not navigacio_sikeres:
                    raise Exception("Nem sikerült betölteni az admin oldalt 3 próbálkozás után sem (ERR_ABORTED).")
                search_field = page.locator("#searchField_all")
                search_field.wait_for(timeout=10000)
                time.sleep(0.5)

                search_field.fill(keresendo)
                search_field.press("Enter")
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

                    popup_ablak.get_by_text("Hozzáadás a választott kategóriákhoz").click()
                    popup_ablak.wait_for(state="hidden", timeout=10000)
                    time.sleep(2)

                elif mod == "atkategorizalo":
                    page.locator("div.selectize-control.categories").wait_for(state="visible", timeout=5000)
                    time.sleep(1.5)
                    for _ in range(50):
                        torles_gomb = page.locator(
                            "div.selectize-control.categories div.selectize-input a.remove").first
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

                    save_button = page.locator("a#save:has-text('Mentés')")
                    save_button.click()
                    page.wait_for_load_state("networkidle")
                    time.sleep(2.5)

                print(f"  ✅ Sikeres (2. kör).")
                sikeres_db += 1

                # JAVÍTÁS: Itt is .pop(0)-val törlünk
                if sikertelen_lista_elso_kor: sikertelen_lista_elso_kor.pop(0)
                mentes_allapot(start_index + len(feldolgozando_maradek))

            except Exception as e:
                vegleges_hiba = str(e)
                print(f"  ❌ VÉGLEGES HIBA: {keresendo} - {vegleges_hiba}")
                veglegesen_sikertelen_db += 1
                veglegesen_sikertelen_lista.append((cikkszam, marka, nev, eredeti_fejlec, kategoriak, vegleges_hiba))

                # JAVÍTÁS: Itt is .pop(0)-val törlünk
                if sikertelen_lista_elso_kor: sikertelen_lista_elso_kor.pop(0)
                mentes_allapot(start_index + len(feldolgozando_maradek))

    page.close()

    # --- EXPORTÁLÁS ÉS MENTÉS TÖRLÉSE (JAVÍTOTT LOGIKA) ---

    # 1. Csak akkor töröljük a mentést, ha a sikertelen lista tényleg teljesen kiürült
    if os.path.exists(progress_file_path) and not sikertelen_lista_elso_kor:
        try:
            os.remove(progress_file_path)
        except:
            pass

    # 2. EXPORTÁLÁS: Ez MINDIG lefut, ha van véglegesen hibás elem, függetlenül mindentől!
    if veglegesen_sikertelen_lista:
        print(f"\n📑 Exportálás: {len(veglegesen_sikertelen_lista)} sikertelen termék...")
        SIKERTELEN_MAPPA = "sikertelen_tablak"
        try:
            os.makedirs(SIKERTELEN_MAPPA, exist_ok=True)
            export_adatok = []
            for c_szam, m_ka, n_ev, e_fejlec, kats, hiba in veglegesen_sikertelen_lista:
                export_adatok.append({
                    "Cikkszám": c_szam,
                    "Név": n_ev,
                    "Márka": m_ka,
                    "Alkategória": e_fejlec,
                    "Hiba oka": str(hiba).strip()
                })

            df_sikertelen = pd.DataFrame(export_adatok)
            alap_nev = os.path.splitext(os.path.basename(bemeneti_fajl_neve))[0]
            timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M")
            fnev = f"{alap_nev}_hiba_{mod}_{timestamp}.xlsx"
            utvonal = os.path.join(SIKERTELEN_MAPPA, fnev)
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
        browser = p.chromium.launch(headless=True)
        ctx = bejelentkezes_kezelese(browser, FELHASZNALONEV, JELSZO, BASE_URL, STATE_FAJL)
        if ctx:
            run_processor(ctx, termekek, mod, progress_file, kivalasztott_fajl_utvonala, base_url=BASE_URL)
        browser.close()