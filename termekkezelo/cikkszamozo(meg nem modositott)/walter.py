import pandas as pd
from playwright.sync_api import sync_playwright, Browser, BrowserContext as Context
import time
import sys
import datetime
import os
import json
import re # <-- ÚJ: Regex a kis/nagybetű független kereséshez
from dotenv import load_dotenv

try:
    import msvcrt  # Windows
except ImportError:
    pass
try:
    import select  # Linux/Mac
except ImportError:
    pass

# --- 1. LÉPÉS: Adatbeolvasás (EXCEL / CSV) ---
def adatok_beolvasasa(fajl_neve):
    print(f"\n📂 Fájl feldolgozása: {fajl_neve}...")
    try:
        if fajl_neve.lower().endswith('.csv'):
            df = pd.read_csv(fajl_neve, dtype=str)
        else:
            df = pd.read_excel(fajl_neve, dtype=str)
    except FileNotFoundError:
        print(f"HIBA: Az '{fajl_neve}' fájl nem található.")
        return None
    except Exception as e:
        print(f"HIBA a beolvasás közben: {e}")
        return None

    feldolgozando_lista = []
    nev_oszlop = None
    gyartoi_cikk_oszlop = None

    # Oszlopnevek keresése (a tokeleteswalter.xlsx alapján)
    for col in df.columns:
        col_clean = str(col).strip().lower()
        if "magyarnev" in col_clean or "név" in col_clean or "nev" in col_clean:
            nev_oszlop = col
        elif "gyártoicikkszam" in col_clean or "gyártói cikkszám" in col_clean or "gyartoi" in col_clean:
            gyartoi_cikk_oszlop = col

    if not nev_oszlop or not gyartoi_cikk_oszlop:
        print("❌ HIBA: Nem találom a 'Magyarnev' (Név) vagy 'Gyártoicikkszam' (Gyártói cikkszám) oszlopokat!")
        print(f"   Elérhető oszlopok: {list(df.columns)}")
        return None

    print(f"   ℹ️  Név oszlop: '{nev_oszlop}'")
    print(f"   ℹ️  Gyártói cikkszám oszlop: '{gyartoi_cikk_oszlop}'")

    for index, row in df.iterrows():
        termek_nev = str(row[nev_oszlop]).strip()
        gyartoi_cikk = str(row[gyartoi_cikk_oszlop]).strip()

        if termek_nev.lower() == "nan" or not termek_nev:
            continue
        if gyartoi_cikk.lower() == "nan" or not gyartoi_cikk:
             continue

        feldolgozando_lista.append((termek_nev, gyartoi_cikk))

    print(f"✅ Sikeres beolvasás! Talált tételek száma: {len(feldolgozando_lista)}")
    return feldolgozando_lista

# --- SEGÉDFÜGGVÉNY A LEÁLLÍTÁSHOZ ---
def ellenoriz_leallitast():
    if os.name == 'nt':
        if 'msvcrt' in sys.modules and msvcrt.kbhit():
            msvcrt.getch()
            return True
    else:
        if 'select' in sys.modules and select.select([sys.stdin], [], [], 0)[0]:
            sys.stdin.readline()
            return True
    return False

# --- 2. LÉPÉS: Gyártói Cikkszám Feldolgozó Funkció ---
def run_sku_processor(context: Context, termek_lista, progress_file_path):
    start_index = 0
    if os.path.exists(progress_file_path):
        try:
            with open(progress_file_path, "r", encoding="utf-8") as f:
                state_data = json.load(f)
                start_index = state_data.get("index", 0)
            print(f"\n📢 KORÁBBI ÁLLAPOT BETÖLTVE: {start_index}. sorszámtól folytatom.")
        except Exception:
            start_index = 0

    def mentes_allapot(aktualis_index):
        try:
            with open(progress_file_path, "w", encoding="utf-8") as f:
                json.dump({"index": aktualis_index}, f)
        except:
            pass

    maradek_lista = termek_lista[start_index:]
    nem_talalhato_termekek = [] 
    frissitett_db = 0
    kihagyott_egyezo_db = 0
    log_fajl_neve = "sku_log.txt"
    leallitas_kerve = False

    try:
        page = context.new_page()
    except:
        return

    print(f"Indul a CIKKSZÁM CSERE: {len(maradek_lista)} termék maradt.")
    print("-" * 50)
    print("🔴 LEÁLLÍTÁS: Nyomj ENTER-t (vagy Space-t Windowson) a leállításhoz!")
    print("-" * 50)

    for i, (termek_nev, gyartoi_cikk) in enumerate(maradek_lista):
        if ellenoriz_leallitast():
            print("\n🛑 LEÁLLÍTÁS KÉRVE! Befejezem az aktuális terméket...")
            leallitas_kerve = True

        aktualis_sorszam = start_index + i + 1
        print(f"\n[{aktualis_sorszam}/{len(termek_lista)}] Név keresése: {termek_nev[:30]}... | Cél cikkszám: {gyartoi_cikk}")

        try:
            # 1. Keresés a webshop admin felületén NÉV alapján
            page.goto("https://szvgtoolsshop.hu/administrator/", timeout=60000)
            search_field = page.locator("#searchField_all")
            search_field.wait_for()
            search_field.fill(termek_nev)
            search_field.press("Enter")
            
            # Várakozás, amíg befrissül a lista
            page.wait_for_timeout(2000) 

            # Pontos egyezés keresése a név alapján KIS- ÉS NAGYBETŰ FÜGGETLENÜL
            try:
                # Regex minta összeállítása (pontos egyezés = ^ és $ jelekkel, IGNORECASE = kis/nagybetű mindegy)
                regex_pattern = re.compile(f"^{re.escape(termek_nev)}$", re.IGNORECASE)
                
                # Olyan linket keresünk, aminek a szövege pont a fenti mintának felel meg
                termek_link = page.locator("a").filter(has_text=regex_pattern).first
                
                termek_link.wait_for(state="visible", timeout=5000)
                termek_link.click()
            except:
                print("   ⚠️  A termék pontos neve nem található a rendszerben -> Kimaradtak listába kerül.")
                nem_talalhato_termekek.append({
                    "Termék Neve": termek_nev,
                    "Gyártói Cikkszám": gyartoi_cikk
                })
                mentes_allapot(aktualis_sorszam)
                if leallitas_kerve: break
                continue 

            # 2. Cikkszám (SKU) mező ellenőrzése és cseréje
            try:
                sku_input = page.locator("#sku") # KÉRLEK ELLENŐRIZD EZT AZ ID-T AZ OLDALADON!
                sku_input.wait_for(state="visible", timeout=5000)
                
                jelenlegi_cikkszam = sku_input.input_value()
                
                if jelenlegi_cikkszam == gyartoi_cikk:
                    print(f"   ⏩ Egyezik a cikkszám ({jelenlegi_cikkszam}), nincs teendő.")
                    kihagyott_egyezo_db += 1
                else:
                    print(f"   ✏️  Cikkszám cseréje: '{jelenlegi_cikkszam}' -> '{gyartoi_cikk}'")
                    sku_input.fill(gyartoi_cikk)
                    
                    # Mentés és bezárás
                    save_close_btn = page.locator("#save_close")
                    save_close_btn.click()
                    
                    # Várakozás a listára visszatéréshez
                    page.locator("#searchField_all").wait_for()
                    frissitett_db += 1
                    print("   ✅ Mentés sikeres.")

            except Exception as e:
                print(f"   ❌ Hiba a cikkszám mező kezelésekor: {e}")
                print("   ❗ Ellenőrizd, hogy megfelelő-e az ID ('#sku') a scriptben!")
                page.go_back()

            mentes_allapot(aktualis_sorszam)
            
            if leallitas_kerve:
                print(f"\n🛑 A program biztonságosan megállt.")
                break

        except Exception as e:
            print(f"   ❌ VÁRATLAN HIBA: {e}")
            with open(log_fajl_neve, "a", encoding="utf-8") as f:
                f.write(f"{termek_nev}: {e}\n")
            mentes_allapot(aktualis_sorszam)
            try:
                page.goto("https://szvgtoolsshop.hu/administrator/")
            except:
                pass
            
            if leallitas_kerve: break

    page.close()
    
    if not leallitas_kerve and os.path.exists(progress_file_path):
        os.remove(progress_file_path)
        print("\n🏁 A teljes lista feldolgozása befejeződött.")
    
    print("\n" + "=" * 50)
    print("Összesítés:")
    print(f"   ✅ Frissített termékek: {frissitett_db}")
    print(f"   ⏩ Egyező, kihagyott termékek: {kihagyott_egyezo_db}")
    print(f"   ❌ Nem található/kimaradt termékek: {len(nem_talalhato_termekek)}")
    print("=" * 50)

    # --- EXPORTÁLÁS ---
    if nem_talalhato_termekek:
        print(f"\n📑 Kimaradt termékek exportálása...")
        SIKERTELEN_MAPPA = "kimaradt_termekek"
        try:
            os.makedirs(SIKERTELEN_MAPPA, exist_ok=True)
            df_hianyzo = pd.DataFrame(nem_talalhato_termekek)
            timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M")
            fnev = f"kimaradt_cikkszamok_{timestamp}.xlsx"
            utvonal = os.path.join(SIKERTELEN_MAPPA, fnev)
            
            df_hianyzo.to_excel(utvonal, index=False, engine='openpyxl')
            print(f"   ✅ Fájl mentve: {utvonal}")
        except Exception as e:
            print(f"   ❌ HIBA az exportnál: {e}")

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
        print("HIBA: Nincs .env fájl vagy hiányzó adatok (ADMIN_USERNAME, ADMIN_PASSWORD)!")
        sys.exit(1)

    if not os.path.exists(FAJLOK_MAPPAJA):
        print(f"Létrehozom a '{FAJLOK_MAPPAJA}' mappát. Kérlek másold bele a táblázatot és indítsd újra a programot!")
        os.makedirs(FAJLOK_MAPPAJA)
        sys.exit(1)

    kiterjesztes = (".xlsx", ".xls", ".csv")
    elerheto_fajlok = [f for f in os.listdir(FAJLOK_MAPPAJA) if f.lower().endswith(kiterjesztes)]

    if not elerheto_fajlok:
        print(f"HIBA: Üres a '{FAJLOK_MAPPAJA}' mappa, vagy nincs benne Excel/CSV fájl.")
        sys.exit(1)

    print(f"\n--- Fájl Választása ---")
    for i, f in enumerate(elerheto_fajlok):
        print(f"  {i + 1}: {f}")

    kivalasztott_fajl_utvonala = ""
    while True:
        try:
            val = input(f"Válassz sorszámot (1-{len(elerheto_fajlok)}): ").strip()
            idx = int(val) - 1
            if 0 <= idx < len(elerheto_fajlok):
                kivalasztott_fajl_utvonala = os.path.join(FAJLOK_MAPPAJA, elerheto_fajlok[idx])
                break
            print("Hibás szám.")
        except:
            print("Számot adj meg.")

    # Adatok beolvasása
    termekek = adatok_beolvasasa(kivalasztott_fajl_utvonala)
    progress_file = kivalasztott_fajl_utvonala + ".progress_sku.json"
    
    if not termekek:
        print(f"Nem találtam feldolgozható adatot a fájlban.")
        sys.exit(1)

    print(f"\nIndul a CIKKSZÁM CSERÉLŐ modul {len(termekek)} termékkel.")
    
    with sync_playwright() as p:
        print("\nBöngésző indítása...")
        browser = p.chromium.launch(headless=False)
        ctx = bejelentkezes_kezelese(browser, FELHASZNALONEV, JELSZO, STATE_FAJL)
        if ctx:
            run_sku_processor(ctx, termekek, progress_file)
        browser.close()