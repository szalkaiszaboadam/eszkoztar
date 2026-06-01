import pandas as pd
from playwright.sync_api import sync_playwright, Browser, BrowserContext as Context
import time
import sys
import datetime
import os
import json
from dotenv import load_dotenv

# --- 1. LÉPÉS: Adatbeolvasás és Szűrés ---
def adatok_beolvasasa(excel_fajl_neve):
    try:
        if excel_fajl_neve.endswith('.csv'):
            df = pd.read_csv(excel_fajl_neve, dtype=str)
        else:
            df = pd.read_excel(excel_fajl_neve, dtype=str)
    except FileNotFoundError:
        print(f"HIBA: Az '{excel_fajl_neve}' fájl nem található.")
        return None
    except Exception as e:
        print(f"HIBA a fájl beolvasása közben: {e}")
        return None

    if "Cikkszám" not in df.columns:
        print(f"HIBA: A fájlból hiányzik a 'Cikkszám' oszlop!")
        return None

    feldolgozando_lista = []

    for index, row in df.iterrows():
        nyers_cikkszam = str(row["Cikkszám"]).strip()

        if nyers_cikkszam.lower() == 'nan' or not nyers_cikkszam:
            continue
            
        if nyers_cikkszam.endswith(" 00:00:00"):
            nyers_cikkszam = nyers_cikkszam.replace(" 00:00:00", "")
            if nyers_cikkszam.endswith("-01"):
                nyers_cikkszam = nyers_cikkszam[:-3]

        # CSAK AZOKAT VESSZÜK FEL, AMIK NEM NULLÁVAL KEZDŐDNEK
        if not nyers_cikkszam.startswith("0"):
            feldolgozando_lista.append(nyers_cikkszam)

    return feldolgozando_lista

# --- 2. LÉPÉS: Fő Feldolgozó Funkció ---
def run_processor(context: Context, termek_lista, progress_file_path, bemeneti_fajl_neve, base_url):
    mar_kesz_db = 0
    sikertelen_lista = []

    if os.path.exists(progress_file_path):
        try:
            with open(progress_file_path, "r", encoding="utf-8") as f:
                state_data = json.load(f)
                mar_kesz_db = state_data.get("index", 0)
                sikertelen_lista = state_data.get("retry_list", [])
            print(f"\n📢 KORÁBBI ÁLLAPOT BETÖLTVE: {mar_kesz_db} db már kész.")
        except:
            pass

    def mentes_allapot(aktualis_index):
        try:
            state = {"index": aktualis_index, "retry_list": sikertelen_lista}
            with open(progress_file_path, "w", encoding="utf-8") as f:
                json.dump(state, f, ensure_ascii=False, indent=2)
        except:
            pass

    start_index = mar_kesz_db
    feldolgozando_maradek = termek_lista[start_index:]

    sikeres_db = 0

    try:
        page = context.new_page()
    except Exception as e:
        print(f"HIBA: Nem sikerült új lapot nyitni: {e}")
        return

    # --- FŐ CIKLUS ---
    for i, cikkszam in enumerate(feldolgozando_maradek):
        aktualis_sorszam = start_index + i + 1
        print(f"\n[{aktualis_sorszam}/{len(termek_lista)}] Keresés: {cikkszam}")

        try:
            # 1. Navigáció
            navigacio_sikeres = False
            for proba in range(3):
                try:
                    page.goto(f"{base_url}/administrator/", timeout=60000, wait_until="domcontentloaded")
                    navigacio_sikeres = True
                    break
                except Exception as nav_e:
                    print(f"   ⚠️ Navigációs hiba, újrapróbálás 3 mp múlva...")
                    time.sleep(3)

            if not navigacio_sikeres:
                raise Exception("Nem sikerült betölteni az admin oldalt.")

            # 2. Nézet ellenőrzés
            nezet_valto_gomb = page.locator("li.modeSwitch[onclick*='switchMode(2)']")
            if nezet_valto_gomb.is_visible(timeout=3000):
                print("🔄 Átváltás Bizonylatkészítőre...")
                nezet_valto_gomb.click()
                time.sleep(3)
                page.locator("#searchField_all").wait_for(state="visible", timeout=10000)
            
            # 3. Keresés
            search_field = page.locator("#searchField_all")
            search_field.wait_for(timeout=10000)
            time.sleep(0.5)
            search_field.fill(cikkszam)
            search_field.press("Enter")
            time.sleep(1.5)

            # 4. Találat kiválasztása
            sorok = page.locator("tbody tr").filter(has_text=cikkszam)
            sorok.first.wait_for(timeout=10000)
            
            pontos_c_sorok = sorok.filter(has=page.get_by_text(cikkszam, exact=True))
            talalat_db = pontos_c_sorok.count()
            
            if talalat_db == 0:
                if sorok.count() == 1:
                    sor = sorok.first
                else:
                    raise Exception(f"Nem egyértelmű vagy nincs találat ({sorok.count()} db).")
            elif talalat_db == 1:
                sor = pontos_c_sorok.first
            else:
                 raise Exception("DUPLIKÁCIÓ a listában!")

            # 5. Adatlap megnyitása
            termek_link = sor.locator("a[href*='view=product']")
            termek_link.wait_for(timeout=10000)
            termek_link.click()
            
            # Megvárjuk amíg a termék adatlap (és benne a cikkszám mező) betölt
            cikkszam_mezo = page.locator("input#sku")
            cikkszam_mezo.wait_for(state="visible", timeout=10000)

            # 6. Nullázás végrehajtása az adatlapon (ID alapján, fixen!)
            uj_cikkszam = f"0{cikkszam}"
            
            # Töröljük a régit, és beírjuk az újat
            cikkszam_mezo.fill(uj_cikkszam)
            print(f"   ✍️  Cikkszám átírva: {cikkszam} -> {uj_cikkszam}")

            # 7. Mentés
            save_button = page.locator("a#save:has-text('Mentés')")
            save_button.click()
            page.wait_for_load_state("networkidle")
            print("   ✅ Mentés sikeres.")
            time.sleep(1.5)

            sikeres_db += 1
            mentes_allapot(aktualis_sorszam)

        except Exception as e:
            hiba_uzenet = str(e)
            print(f"  ❌ HIBA: {hiba_uzenet}")
            sikertelen_lista.append((cikkszam, hiba_uzenet))
            mentes_allapot(aktualis_sorszam)

    page.close()

    # --- EXPORTÁLÁS ÉS MENTÉS TÖRLÉSE ---
    if os.path.exists(progress_file_path) and not sikertelen_lista:
        try: os.remove(progress_file_path)
        except: pass

    if sikertelen_lista:
        print(f"\n📑 Exportálás: {len(sikertelen_lista)} sikertelen termék...")
        SIKERTELEN_MAPPA = "sikertelen_tablak"
        try:
            os.makedirs(SIKERTELEN_MAPPA, exist_ok=True)
            export_adatok = [{"Cikkszám": c_szam, "Hiba oka": str(hiba).strip()} for c_szam, hiba in sikertelen_lista]
            
            df_sikertelen = pd.DataFrame(export_adatok)
            alap_nev = os.path.splitext(os.path.basename(bemeneti_fajl_neve))[0]
            timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M")
            fnev = f"{alap_nev}_nullazo_hiba_{timestamp}.xlsx"
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

    try: context.storage_state(path=state_fajl)
    except: pass

    page.close()
    return context

# --- 4. LÉPÉS: Főprogram ---
if __name__ == "__main__":
    load_dotenv()

    FAJLOK_MAPPAJA = "input_tablak"

    print("\n" + "=" * 50)
    print(" 🛠️ CIKKSZÁM NULLÁZÓ BOT (SKU UPDATER) 🛠️")
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
        os.makedirs(FAJLOK_MAPPAJA, exist_ok=True)
        print(f"HIBA: Létrehoztam a '{FAJLOK_MAPPAJA}' mappát. Tegyél bele egy Excelt, majd indítsd újra!")
        sys.exit(1)

    excel_fajlok = [f for f in os.listdir(FAJLOK_MAPPAJA) if f.endswith('.xlsx') or f.endswith('.csv')]
    if not excel_fajlok:
        print(f"HIBA: Üres a '{FAJLOK_MAPPAJA}' mappa.")
        sys.exit(1)

    print("\n--- Excel/CSV Fájl Választása ---")
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
    
    if not termekek:
        print("Minden cikkszám nullával kezdődik, vagy a fájl üres/hibás. Nincs teendő!")
        sys.exit(0)
        
    print(f"\n📊 Összesen {len(termekek)} db feldolgozandó (nulla nélküli) cikkszámot találtam.")
    
    progress_file = kivalasztott_fajl_utvonala + ".nullazo.json"

    if os.path.exists(progress_file):
        valasz_folytat = input(f"⚠️ Félbemaradt nullázás mentést találtam. Folytassuk? (i/n): ").strip().lower()
        if valasz_folytat != 'i':
            os.remove(progress_file)
            print("   🗑️ Régi mentés törölve. Tiszta lappal indulunk.")

    with sync_playwright() as p:
        # Ha jól működik, ezt átírhatod headless=True-ra, és rejtve, villámgyorsan fogja csinálni!
        browser = p.chromium.launch(headless=False)
        ctx = bejelentkezes_kezelese(browser, FELHASZNALONEV, JELSZO, BASE_URL, STATE_FAJL)
        if ctx:
            run_processor(ctx, termekek, progress_file, kivalasztott_fajl_utvonala, base_url=BASE_URL)
        browser.close()