import pandas as pd
from playwright.sync_api import sync_playwright, Playwright, expect, Browser, BrowserContext as Context
import time
import sys
import datetime
import os
import json  # <--- EZT KELL HOZZÁADNI
import re  # <--- EZT IMPORTÁLD BE! (Regular Expression)

from dotenv import load_dotenv


# --- 1. LÉPÉS: Adatbeolvasás (Vesszővel elválasztott kategóriák támogatása) ---
def adatok_beolvasasa(excel_fajl_neve):
    """
    Beolvassa az Excel fájlt.
    A kategória oszlop nevét vessző mentén szétszedi listává.
    Javítva: Kezeli a Pandas által hozzáadott .1, .2 duplikáció-jelölőket.
    """
    try:
        df = pd.read_excel(excel_fajl_neve, dtype=str)
    except FileNotFoundError:
        print(f"HIBA: Az '{excel_fajl_neve}' fájl nem található.")
        return None
    except Exception as e:
        print(f"HIBA az Excel beolvasása közben: {e}")
        return None

    feldolgozando_lista = []

    for kategoria_fejlec in df.columns:
        cikkszamok = df[kategoria_fejlec].dropna().tolist()

        # --- JAVÍTÁS KEZDTE ---
        # Az eredeti fejléc sztringgé alakítása
        nyers_fejlec = str(kategoria_fejlec)

        # Regex segítségével eltávolítjuk a string végéről a .<szám> mintát (pl. ".1", ".15")
        # Csak akkor vágja le, ha pont és szám van a végén, amit a Pandas rakott oda.
        tiszta_fejlec = re.sub(r'\.\d+$', '', nyers_fejlec)
        # --- JAVÍTÁS VÉGE ---

        # Vessző mentén darabolunk a TISZTA fejlécből
        kategoriak_listaja = [k.strip() for k in tiszta_fejlec.split(',')]

        for cikkszam in cikkszamok:
            cikkszam_str = str(cikkszam).strip()
            # Csak akkor adjuk hozzá, ha van cikkszám és kategória is
            if cikkszam_str and kategoriak_listaja:
                feldolgozando_lista.append((cikkszam_str, kategoriak_listaja))

    return feldolgozando_lista


def stabil_kategoria_valasztas(page, input_locator, dropdown_locator, kategoria_nev):
    """
    5.0 - HTML HIERARCHIA BIZTOS VERZIÓ
    Képes kezelni a "- - " előtagokat a HTML-ben.
    """
    # 1. Excel név tisztítása
    cel_nev = kategoria_nev.strip()

    # --- Mező ürítése ---
    try:
        input_locator.click()
        input_locator.fill("")
    except:
        pass

    # --- Gépelés (Szűrés) ---
    try:
        # Beírjuk a nevet, hogy szűkítsük a listát
        input_locator.type(cel_nev, delay=50)

        # Megvárjuk a legördülő menüt
        dropdown_locator.wait_for(state="visible", timeout=5000)
        time.sleep(1.0)  # Hagyunk időt a renderelésre

        # --- AZ OKOS KERESÉS ---
        # Lekérjük az összes LÁTHATÓ opciót.
        # Fontos: csak a visible elemek kellenek, mert a selectize elrejti a nem passzolókat.
        opciok = dropdown_locator.locator("div.option").all()

        # Ha nincs találat a szűrés után, azonnal kilépünk (ne nyomjon entert!)
        if not opciok:
            print(f"   ⛔ Nincs találat a listában erre: '{cel_nev}'")
            input_locator.press("Escape")
            return False

        talalat_megvan = False

        print(f"   🔎 Keresem: '{cel_nev}'")

        for opcio in opciok:
            # Kivesszük a nyers szöveget (pl: "- - ProCut Telibefúró lapka")
            nyers_szoveg = opcio.inner_text()

            # --- ITT A VARÁZSLAT: LEVÁGJUK A KÖTŐJELEKET AZ ELEJÉRŐL ---
            # A regex jelentése: A szöveg elejéről (^) minden kötőjelet, szóközt, tabulátort, &nbsp;-t eltüntet.
            tiszta_html_nev = re.sub(r'^[- \t\xa0]+', '', nyers_szoveg).strip()

            # Debug kiírás, hogy lásd mit csinál (ha akarod, kikommentelheted)
            # print(f"      Lista elem: '{nyers_szoveg}' -> Tisztítva: '{tiszta_html_nev}'")

            # Összehasonlítás (Kisbetűsítve a biztonság kedvéért)
            if tiszta_html_nev.lower() == cel_nev.lower():
                print(f"      ✅ PONTOS EGYEZÉS: '{nyers_szoveg}'")
                opcio.click()  # Ez a biztos kattintás!
                talalat_megvan = True
                break

        # --- HA MÉG ÍGY SEM TALÁLJA ---
        if not talalat_megvan:
            print(f"   ⚠️ Nem találtam egyezést a szűrt listában sem.")
            # NEM NYOMUNK ENTERT, mert az választja ki a rosszat!
            input_locator.press("Escape")
            return False

        time.sleep(0.5)
        return True

    except Exception as e:
        print(f"   ❌ HIBA: {e}")
        try:
            input_locator.press("Escape")
        except:
            pass
        return False

# --- 2. LÉPÉS: Fő Feldolgozó Funkció ---

def run_processor(context: Context, termek_lista, mod, progress_file_path):
    """
    Végigviszi a böngésző-automatizálási lépéseket a megadott listán.
    """
    # --- ÁLLAPOT BETÖLTÉSE ---
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
    sikertelen_lista_elso_kor = []
    veglegesen_sikertelen_lista = []
    veglegesen_sikertelen_db = 0
    log_fajl_neve = "error_log.txt"

    print("=" * 50)
    print(f"FELDOLGOZÁSI MÓD: '{mod}'")
    print("=" * 50)

    try:
        with open(log_fajl_neve, "a", encoding="utf-8") as f:
            f.write(f"\n--- ÚJ FUTTATÁS INDULT: {datetime.datetime.now()} (MÓD: {mod}) ---\n")
            f.write(f"Összesen {len(termek_lista)} termék feldolgozása.\n")
            f.write("=" * 40 + "\n")
    except Exception as e:
        print(f"Figyelmeztetés: Nem sikerült a log fájlba írni az indítást: {e}")

    try:
        page = context.new_page()
        print("Új böngésző lap nyitva a feldolgozáshoz.")
    except Exception as e:
        print(f"HIBA: Nem sikerült új lapot nyitni a kontextusban: {e}")
        return

    print(f"Indul a feldolgozás, 1. KÖR: Összesen {len(termek_lista)} termék.")

    # --- FŐ CIKLUS (1. KÖR) ---
    if not feldolgozando_maradek and sikertelen_lista_elso_kor:
        print("✅ A fő lista már kész, a javítandó elemekkel folytatom.")
    elif not feldolgozando_maradek and not sikertelen_lista_elso_kor:
        print("✅ A mentés alapján ez a munka teljesen kész!")

    # Itt kezdődik a ciklus a maradékkal
    for i, (cikkszam, kategoriak) in enumerate(feldolgozando_maradek):
        aktualis_sorszam = start_index + i + 1  # Kiszámoljuk a valódi sorszámot
        print(f"\n[{aktualis_sorszam}/{len(termek_lista)}] Feldolgozás...")
        # ... (a többi kód marad a régiben: print cikkszám, stb.)
        print(f"  Cikkszám: {cikkszam}")
        print(f"  Kategóriák: {', '.join(kategoriak)}")

        try:
            # --- Közös logika (Keresés) ---
            page.goto("https://szvgtoolsshop.hu/administrator/", timeout=60000)

            search_field = page.locator("#searchField_all")
            search_field.wait_for(timeout=10000)
            search_field.fill(cikkszam)
            search_field.press("Enter")

            sor = page.locator(f"tr:has(td:text-is('{cikkszam}'))")
            termek_link = sor.locator("a[href*='view=product']")
            termek_link.wait_for(timeout=10000)
            termek_link.click()

            # --- MÓD VÁLASZTÓ LOGIKA ---

            if mod == "kategorizalo":
                # --- 1. SIMA KATEGORIZÁLÓ (Csak az első kategória) ---
                kat = kategoriak[0]

                page.locator("a:has-text('A termék kategorizálása')").click()
                popup_ablak = page.locator("#popup")
                popup_ablak.wait_for(timeout=10000)

                popup_kereso = popup_ablak.locator("div.selectize-control.categories input[type='text']")
                popup_kereso.wait_for(timeout=5000)

                # Sima módnál is használhatjuk a stabil logikát, de a gyorsaság miatt itt maradhat az egyszerűbb
                popup_kereso.press_sequentially(kat, delay=50)
                time.sleep(1.0)

                dropdown = page.locator("div.selectize-dropdown.categories")
                dropdown.locator(f"div.option:has-text('{kat}')").first.click()

                popup_ablak.locator("div.pure-button:has-text('Hozzáadás a választott kategóriákhoz')").click()

            elif mod == "multi_kategorizalo":
                # --- 3. MULTI KATEGORIZÁLÓ (Mindegyik hozzáadása) ---
                # Itt használjuk az ÚJ stabilizáló függvényt!

                page.locator("a:has-text('A termék kategorizálása')").click()
                popup_ablak = page.locator("#popup")
                popup_ablak.wait_for(timeout=10000)

                popup_kereso = popup_ablak.locator("div.selectize-control.categories input[type='text']")
                dropdown = page.locator("div.selectize-dropdown.categories")
                popup_kereso.wait_for(state="visible")

                for kat in kategoriak:
                    stabil_kategoria_valasztas(page, popup_kereso, dropdown, kat)

                # Mentés a végén
                popup_ablak.locator("div.pure-button:has-text('Hozzáadás a választott kategóriákhoz')").click()
                time.sleep(1.5)  # Biztonsági várakozás

            elif mod == "atkategorizalo":
                # --- 2. SIMA ÁTKATEGORIZÁLÓ (Csere az elsőre) ---
                kat = kategoriak[0]

                # --- JAVÍTOTT TÖRLÉS KEZDETE ---
                #print("   Meglévő kategóriák keresése és törlése...")
                # Várunk picit, hogy a Selectize (és a törlő gombok) biztosan betöltsenek az első terméknél is
                page.locator("div.selectize-control.categories").wait_for(state="visible", timeout=5000)
                time.sleep(1.0)  # Biztonsági várakozás az első kör miatt

                # Ciklus: amíg találunk "remove" gombot, addig kattintgatunk
                # Max 50-szer fut le, hogy ne ragadjon be végtelen ciklusba
                for _ in range(50):
                    torles_gomb = page.locator("div.selectize-control.categories div.selectize-input a.remove").first
                    if torles_gomb.is_visible():
                        torles_gomb.click(force=True)  # Erőltetett kattintás
                        time.sleep(0.3)  # Hagyunk időt a DOM frissülésre
                    else:
                        break  # Ha nincs több látható gomb, kilépünk
                # --- JAVÍTOTT TÖRLÉS VÉGE ---

                # Hozzáadás (A te eredeti logikád, vagy használd ide is a stabil_kategoria_valasztas-t!)
                # Javaslom, hogy ide is a stabil függvényt hívd meg, ha már megírtuk:
                atkat_kereso = page.locator(
                    "div.selectize-control.categories div.selectize-input input[type='text']").first
                dropdown = page.locator("div.selectize-dropdown.categories").first  # Csak a definíció miatt kell
                stabil_kategoria_valasztas(page, atkat_kereso, dropdown, kat)

                page.locator("a#save:has-text('Mentés')").click()
                time.sleep(3)

            elif mod == "multi_atkategorizalo":
                # --- 4. MULTI ÁTKATEGORIZÁLÓ (Csere az összesre) ---

                # --- JAVÍTOTT TÖRLÉS KEZDETE ---
                #print("   Meglévő kategóriák keresése és törlése...")
                page.locator("div.selectize-control.categories").wait_for(state="visible", timeout=5000)
                time.sleep(1.0)  # Biztonsági várakozás az első kör miatt

                for _ in range(50):
                    torles_gomb = page.locator("div.selectize-control.categories div.selectize-input a.remove").first
                    if torles_gomb.is_visible():
                        torles_gomb.click(force=True)
                        time.sleep(0.3)
                    else:
                        break
                # --- JAVÍTOTT TÖRLÉS VÉGE ---

                atkat_kereso = page.locator(
                    "div.selectize-control.categories div.selectize-input input[type='text']").first
                dropdown = page.locator("div.selectize-dropdown.categories").first

                # Ciklus a stabil függvénnyel
                for kat in kategoriak:
                    stabil_kategoria_valasztas(page, atkat_kereso, dropdown, kat)

                page.locator("a#save:has-text('Mentés')").click()
                time.sleep(3)

            # --- Siker ---
            print(f"  ✅ Sikeresen feldolgozva.")
            sikeres_db += 1
            mentes_allapot(aktualis_sorszam)
            time.sleep(1)

        except Exception as e:
            print(f"  ❌ HIBA (1. KÖR) történt a {cikkszam} feldolgozásakor.")
            sikertelen_lista_elso_kor.append((cikkszam, kategoriak))
            mentes_allapot(aktualis_sorszam)

            # Hiba naplózása
            with open(log_fajl_neve, "a", encoding="utf-8") as f:
                f.write(f"HIBA (1. kör): {cikkszam} - {e}\n")

            time.sleep(2)

    # --- FŐ CIKLUS VÉGE ---

    # --- ÚJRAPRÓBÁLKOZÁSI CIKLUS (2. KÖR) ---
    if sikertelen_lista_elso_kor:
        print("\n" + "=" * 50)
        print(f"Indul a feldolgozás, 2. KÖR: Újrapróbálkozás {len(sikertelen_lista_elso_kor)} termékkel.")
        print("=" * 50 + "\n")

        for i, (cikkszam, kategoriak) in enumerate(sikertelen_lista_elso_kor):
            print(f"\n[{i + 1}/{len(sikertelen_lista_elso_kor)}] Újrapróbálkozás...")
            print(f"  Cikkszám: {cikkszam}")

            try:
                # --- Navigáció ---
                page.goto("https://szvgtoolsshop.hu/administrator/", timeout=60000)
                search_field = page.locator("#searchField_all")
                search_field.wait_for(timeout=10000)
                search_field.fill(cikkszam)
                search_field.press("Enter")
                sor = page.locator(f"tr:has(td:text-is('{cikkszam}'))")
                termek_link = sor.locator("a[href*='view=product']")
                termek_link.wait_for(timeout=10000)
                termek_link.click()

                # --- MÓDOK ISMÉTLÉSE (Teljes logika) ---

                if mod == "kategorizalo":
                    kat = kategoriak[0]
                    page.locator("a:has-text('A termék kategorizálása')").click()
                    popup_ablak = page.locator("#popup")
                    popup_ablak.wait_for()
                    popup_kereso = popup_ablak.locator("div.selectize-control.categories input[type='text']")
                    popup_kereso.press_sequentially(kat, delay=60)  # Kicsit lassabban a 2. körben
                    time.sleep(1.5)
                    dropdown = page.locator("div.selectize-dropdown.categories")
                    dropdown.locator(f"div.option:has-text('{kat}')").first.click()
                    popup_ablak.locator("div.pure-button:has-text('Hozzáadás a választott kategóriákhoz')").click()

                elif mod == "multi_kategorizalo":
                    page.locator("a:has-text('A termék kategorizálása')").click()
                    popup_ablak = page.locator("#popup")
                    popup_ablak.wait_for()
                    popup_kereso = popup_ablak.locator("div.selectize-control.categories input[type='text']")
                    dropdown = page.locator("div.selectize-dropdown.categories")

                    for kat in kategoriak:
                        stabil_kategoria_valasztas(page, popup_kereso, dropdown, kat)

                    popup_ablak.locator("div.pure-button:has-text('Hozzáadás a választott kategóriákhoz')").click()
                    time.sleep(1.5)

                elif mod == "atkategorizalo":
                    # --- 2. SIMA ÁTKATEGORIZÁLÓ (Csere az elsőre) ---
                    kat = kategoriak[0]

                    # --- JAVÍTOTT TÖRLÉS KEZDETE ---
                    #print("   Meglévő kategóriák keresése és törlése...")
                    # Várunk picit, hogy a Selectize (és a törlő gombok) biztosan betöltsenek az első terméknél is
                    page.locator("div.selectize-control.categories").wait_for(state="visible", timeout=5000)
                    time.sleep(1.0)  # Biztonsági várakozás az első kör miatt

                    # Ciklus: amíg találunk "remove" gombot, addig kattintgatunk
                    # Max 50-szer fut le, hogy ne ragadjon be végtelen ciklusba
                    for _ in range(50):
                        torles_gomb = page.locator(
                            "div.selectize-control.categories div.selectize-input a.remove").first
                        if torles_gomb.is_visible():
                            torles_gomb.click(force=True)  # Erőltetett kattintás
                            time.sleep(0.3)  # Hagyunk időt a DOM frissülésre
                        else:
                            break  # Ha nincs több látható gomb, kilépünk
                    # --- JAVÍTOTT TÖRLÉS VÉGE ---

                    # Hozzáadás (A te eredeti logikád, vagy használd ide is a stabil_kategoria_valasztas-t!)
                    # Javaslom, hogy ide is a stabil függvényt hívd meg, ha már megírtuk:
                    atkat_kereso = page.locator(
                        "div.selectize-control.categories div.selectize-input input[type='text']").first
                    dropdown = page.locator("div.selectize-dropdown.categories").first  # Csak a definíció miatt kell
                    stabil_kategoria_valasztas(page, atkat_kereso, dropdown, kat)

                    page.locator("a#save:has-text('Mentés')").click()
                    time.sleep(3)

                elif mod == "multi_atkategorizalo":
                    # --- 4. MULTI ÁTKATEGORIZÁLÓ (Csere az összesre) ---

                    # --- JAVÍTOTT TÖRLÉS KEZDETE ---
                    #print("   Meglévő kategóriák keresése és törlése...")
                    page.locator("div.selectize-control.categories").wait_for(state="visible", timeout=5000)
                    time.sleep(1.0)  # Biztonsági várakozás az első kör miatt

                    for _ in range(50):
                        torles_gomb = page.locator(
                            "div.selectize-control.categories div.selectize-input a.remove").first
                        if torles_gomb.is_visible():
                            torles_gomb.click(force=True)
                            time.sleep(0.3)
                        else:
                            break
                    # --- JAVÍTOTT TÖRLÉS VÉGE ---

                    atkat_kereso = page.locator(
                        "div.selectize-control.categories div.selectize-input input[type='text']").first
                    dropdown = page.locator("div.selectize-dropdown.categories").first

                    # Ciklus a stabil függvénnyel
                    for kat in kategoriak:
                        stabil_kategoria_valasztas(page, atkat_kereso, dropdown, kat)

                    page.locator("a#save:has-text('Mentés')").click()
                    time.sleep(3)

                # --- Siker (2. kör) ---
                print(f"  ✅ Sikeresen hozzáadva (ÚJRAPRÓBÁLVA).")
                sikeres_db += 1
                # Kivesszük a listából és mentünk
                sikertelen_lista_elso_kor = [x for x in sikertelen_lista_elso_kor if x[0] != cikkszam]
                mentes_allapot(start_index + len(feldolgozando_maradek))
                time.sleep(1)

            except Exception as e:
                # VÉGLEGES HIBA
                print(f"  ❌ HIBA (VÉGLEGES) történt a {cikkszam} feldolgozásakor.")
                veglegesen_sikertelen_db += 1
                veglegesen_sikertelen_lista.append((cikkszam, kategoriak))
                # Kivesszük a listából (mert végeztünk vele, még ha hiba is) és mentünk
                sikertelen_lista_elso_kor = [x for x in sikertelen_lista_elso_kor if x[0] != cikkszam]
                mentes_allapot(start_index + len(feldolgozando_maradek))

                with open(log_fajl_neve, "a", encoding="utf-8") as f:
                    f.write(f"VÉGLEGES HIBA: {cikkszam} - {e}\n")

                time.sleep(2)

    # --- VÉGE ---
    page.close()
    # Takarítás
    if os.path.exists(progress_file_path) and not sikertelen_lista_elso_kor:
        try:
            os.remove(progress_file_path)
            print("\n🗑️  Munkamenet fájl törölve (Minden kész).")
        except:
            pass
    print("\n" + "=" * 50)
    print("A feldolgozás befejeződött.")
    print(f"  ✅ Sikeres: {sikeres_db}")
    print(f"  ❌ Végleges hiba: {veglegesen_sikertelen_db}")
    print("=" * 50)

    # --- EXPORTÁLÁS ---
    if veglegesen_sikertelen_lista:
        print(f"\n📑 Exportálás: {len(veglegesen_sikertelen_lista)} sikertelen termék...")
        SIKERTELEN_MAPPA = "sikertelen_tablak"
        try:
            os.makedirs(SIKERTELEN_MAPPA, exist_ok=True)
            export_data = []
            for cikk, kats in veglegesen_sikertelen_lista:
                export_data.append({"Cikkszám": cikk, "Kategória": ", ".join(kats)})

            df_sikertelen = pd.DataFrame(export_data)
            timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M")
            fnev = f"sikertelen_{mod}_{timestamp}_{len(veglegesen_sikertelen_lista)}db.xlsx"
            utvonal = os.path.join(SIKERTELEN_MAPPA, fnev)

            df_sikertelen.to_excel(utvonal, index=False, engine='openpyxl')
            print(f"  ✅ Sikeres export: {utvonal}")
        except Exception as e:
            print(f"  ❌ HIBA az exportnál: {e}")


# --- 3. LÉPÉS: Bejelentkezés ---
def bejelentkezes_kezelese(browser: Browser, username, password, state_fajl="state.json"):
    if os.path.exists(state_fajl):
        print(f"\nMeglévő bejelentkezés ('{state_fajl}') ellenőrzése...")
        try:
            context = browser.new_context(storage_state=state_fajl)
            page_test = context.new_page()
            page_test.goto("https://szvgtoolsshop.hu/administrator/", timeout=15000)
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
    page.goto("https://szvgtoolsshop.hu/administrator/", timeout=15000)

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

    STATE_FAJL = "state.json"
    FAJLOK_MAPPAJA = "input_tablak"
    FELHASZNALONEV = os.environ.get("ADMIN_USERNAME")
    JELSZO = os.environ.get("ADMIN_PASSWORD")

    if not FELHASZNALONEV or not JELSZO:
        print("HIBA: Nincs .env fájl vagy hiányzó adatok!")
        sys.exit(1)

    # Fájl választás
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

    # Mód választás
    mod = ""
    while True:
        print("\n--- Mód Választás ---")
        print("  1: Sima Kategorizáló (Csak 1. kat)")
        print("  2: Sima Átkategorizáló (Csak 1. kat)")
        print("  3: MULTI Kategorizáló (Több kat hozzáadása)")
        print("  4: MULTI Átkategorizáló (Csere több kat-ra)")
        val = input("Választás (1-4): ").strip()

        if val == '1': mod = "kategorizalo"; break
        if val == '2': mod = "atkategorizalo"; break
        if val == '3': mod = "multi_kategorizalo"; break
        if val == '4': mod = "multi_atkategorizalo"; break

    # Indítás
    with sync_playwright() as p:
        print("\nBöngésző indítása...")
        browser = p.chromium.launch(headless=False)
        ctx = bejelentkezes_kezelese(browser, FELHASZNALONEV, JELSZO, STATE_FAJL)
        if ctx:
            run_processor(ctx, termekek, mod, progress_file)
        browser.close()