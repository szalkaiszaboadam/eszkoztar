import os
import re
import math
import random
import requests
import json
from playwright.sync_api import sync_playwright, Playwright, expect, Browser, BrowserContext as Context
import time
import sys
from dotenv import load_dotenv

# Mac-es SSL figyelmeztetés eltüntetése
import urllib3

urllib3.disable_warnings(urllib3.exceptions.NotOpenSSLWarning)


# --- 1. Mappa és Fájlnév tisztító (Mac/Win kompatibilis) ---
def tiszta_nev(nev):
    """Eltávolítja a mappanevekben tiltott karaktereket"""
    return re.sub(r'[\\/*?:"<>|]', "", nev).strip()


# --- 2. Állapot (Mentés) Kezelő Funkciók ---
def allapot_betoltese(progress_file):
    if os.path.exists(progress_file):
        try:
            with open(progress_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data.get("completed_categories", []), data.get("retry_list", [])
        except Exception as e:
            print(f"⚠️ Hiba a mentés olvasásakor: {e}")
    return [], []


def allapot_mentese(progress_file, completed_categories, retry_list):
    try:
        with open(progress_file, "w", encoding="utf-8") as f:
            json.dump({
                "completed_categories": completed_categories,
                "retry_list": retry_list
            }, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"⚠️ Hiba a mentés során: {e}")


# --- 3. Matematikai eloszlás (Választható mód) ---
def indexek_kiszamitasa(osszes_termek, kivan_db=10, mod="random"):
    """Kiszámolja, melyik sorokat kell letölteni a választott mód alapján"""
    if osszes_termek <= kivan_db:
        return list(range(osszes_termek))

    if mod == "random":
        veletlen_indexek = random.sample(range(osszes_termek), kivan_db)
        veletlen_indexek.sort()
        return veletlen_indexek
    else:
        lepes = (osszes_termek - 1) / (kivan_db - 1)
        return [round(lepes * i) for i in range(kivan_db)]


# --- 4. A LETÖLTÉS MAGJA (Ezt hívja az 1. és a 2. kör is) ---
def letoltes_vegrehajtasa(page, p_url, mappa_path, fallback_idx):
    """Megnyitja a terméket, kiolvassa a cikkszámot és letölti az első képet"""
    page.goto(p_url, timeout=60000)
    time.sleep(2.0)

    kepek_ful = page.locator("label[for='kepek']")
    kepek_ful.wait_for(state="visible", timeout=5000)
    kepek_ful.click()
    time.sleep(1.0)

    cikkszam = page.locator("input#sku").input_value().strip()
    fajlnev = tiszta_nev(cikkszam) if cikkszam else f"kep_{fallback_idx}"

    kep_lista = page.locator("ul#productImages li.thumbImage a")

    if kep_lista.count() > 0:
        kep_url = kep_lista.first.get_attribute("href")

        if kep_url:
            if not kep_url.startswith("http"):
                kep_url = "https:" + kep_url if kep_url.startswith("//") else "https://szvgtoolsshop.hu" + kep_url

            fajl_utvonal = os.path.join(mappa_path, f"{fajlnev}.jpg")

            response = requests.get(kep_url, stream=True, timeout=10)
            if response.status_code == 200:
                with open(fajl_utvonal, 'wb') as f:
                    for chunk in response.iter_content(1024):
                        f.write(chunk)
                print(f"      ✅ Kép letöltve: {fajlnev}.jpg")
            else:
                raise Exception(f"Szerver hiba letöltéskor ({response.status_code}): {kep_url}")
    else:
        print(f"      ⚠️ A {fajlnev} termékhez nincs feltöltve kép.")


# --- 5. REKURZÍV KATEGÓRIA BEJÁRÓ (PÓK ROBOT) ---
def kategoria_bejaro(page, url, kategoria_utvonal, letoltendo_db, eloszlas_mod, progress_file, befejezett_kategoriak, retry_list, letolt_koztes):
    print(f"\n📂 Belépés ide: {' > '.join(kategoria_utvonal)}")

    try:
        page.goto(url, timeout=60000)
        time.sleep(2.5)
    except Exception as e:
        print(f"   ❌ Hiba az oldal betöltésekor: {e}")
        return

    alkategoriak_lehetnek = page.locator("table#categoriesList tbody tr").count() > 0

    # --- ÚJ: KÖZTES KATEGÓRIÁK LETÖLTÉSE ---
    if alkategoriak_lehetnek and letolt_koztes:
        if page.locator("table#productsList tbody tr").count() > 0:
            print(f"   🔽 [Köztes kategória aktív] Termékek keresése a(z) {' > '.join(kategoria_utvonal)} szinten...")
            
            # Letöltjük a képeket ebből a köztes (összesítő) nézetből is
            termek_letolto(page, url, kategoria_utvonal, letoltendo_db, eloszlas_mod, progress_file, befejezett_kategoriak, retry_list)
            
            # FIGYELEM: A termek_letolto elnavigált a termékek oldalára, így vissza kell töltenünk
            # a kategória oldalát, hogy a pók folytatni tudja a bejárást lefelé!
            try:
                page.goto(url, timeout=60000)
                time.sleep(2.5)
            except Exception as e:
                print(f"   ❌ Hiba az oldal visszatöltésekor: {e}")
                return

    if alkategoriak_lehetnek:
        rows = page.locator("table#categoriesList tbody tr").all()
        bejarando_linkek = []

        for row in rows:
            nev_cella = row.locator("td").nth(2)
            cat_nev = nev_cella.inner_text().strip()
            href = nev_cella.locator("a").get_attribute("href")

            alkat_text = row.locator("td").nth(7).inner_text()
            termek_text = row.locator("td").nth(8).inner_text()

            alkat_db = int(re.sub(r'\D', '', alkat_text)) if re.sub(r'\D', '', alkat_text) else 0
            termek_db = int(re.sub(r'\D', '', termek_text)) if re.sub(r'\D', '', termek_text) else 0

            if alkat_db > 0 or termek_db > 0:
                bejarando_linkek.append({
                    "url": "https://szvgtoolsshop.hu/administrator/" + href,
                    "nev": cat_nev,
                    "alkat_db": alkat_db,
                    "termek_db": termek_db
                })

        for link in bejarando_linkek:
            uj_utvonal = list(kategoria_utvonal)
            uj_utvonal.append(link["nev"])

            if link["alkat_db"] > 0:
                # Továbbra is haladunk lefelé a fában, átadva a letolt_koztes kapcsolót
                kategoria_bejaro(page, link["url"], uj_utvonal, letoltendo_db, eloszlas_mod, progress_file, befejezett_kategoriak, retry_list, letolt_koztes)
            elif link["termek_db"] > 0:
                # Elértünk egy "vonalvégi" (leaf) kategóriához
                termek_letolto(page, link["url"], uj_utvonal, letoltendo_db, eloszlas_mod, progress_file, befejezett_kategoriak, retry_list)

    else:
        # Ha nincsenek alkategóriák, akkor ez biztosan egy végkategória
        if page.locator("table#productsList tbody tr").count() > 0:
            termek_letolto(page, url, kategoria_utvonal, letoltendo_db, eloszlas_mod, progress_file, befejezett_kategoriak, retry_list)


# --- 6. TERMÉKEK KIGYŰJTÉSE ÉS FELDOLGOZÁSA (1. KÖR) ---
def termek_letolto(page, url, kategoria_utvonal, letoltendo_db, eloszlas_mod, progress_file, befejezett_kategoriak, retry_list):
    kat_azonosito = " > ".join(kategoria_utvonal)

    # --- MENTÉS ELLENŐRZÉSE: Ha már kész van, átugorjuk! ---
    if kat_azonosito in befejezett_kategoriak:
        print(f"   ⏭️ MÁR LETÖLTVE, ÁTUGRÁS: {kat_azonosito}")
        return

    print(f"   ⚙️ Termékek feldolgozása: {kat_azonosito}")

    try:
        page.goto(url, timeout=60000)
        time.sleep(2.5)
    except:
        return

    termek_sorok = page.locator("table#productsList tbody tr").all()
    osszes_termek = len(termek_sorok)

    if osszes_termek == 0:
        print("   ⚠️ Nincs termék a listában.")
        return

    cel_indexek = indexek_kiszamitasa(osszes_termek, letoltendo_db, eloszlas_mod)
    mod_neve = "Véletlenszerű" if eloszlas_mod == "random" else "Arányos"
    print(f"   📊 Összesen {osszes_termek} termék. Kijelölve letöltésre ({mod_neve} eloszlás): {len(cel_indexek)} db.")

    termek_linkek = []
    for idx in cel_indexek:
        sor = termek_sorok[idx]
        href = sor.locator("td").nth(2).locator("a").get_attribute("href")
        termek_linkek.append("https://szvgtoolsshop.hu/administrator/" + href)

    # Mappa létrehozása a Mac formátumnak megfelelően
    tiszta_utvonal = [tiszta_nev(p) for p in kategoria_utvonal]
    mappa_path = os.path.join("Kollazs_Kepek", *tiszta_utvonal)
    os.makedirs(mappa_path, exist_ok=True)

    for i, p_url in enumerate(termek_linkek):
        try:
            # Maga a letöltés végrehajtása
            letoltes_vegrehajtasa(page, p_url, mappa_path, fallback_idx=i + 1)
        except Exception as e:
            print(f"      ❌ Hiba (1. KÖR): {e}")
            # Hiba esetén felírjuk a javítandó listára
            retry_list.append({
                "url": p_url,
                "kategoria_utvonal": kategoria_utvonal,
                "fallback_idx": i + 1
            })

    print(f"   ✔️ Kategória befejezve!")

    # --- ÁLLAPOT MENTÉSE (A kategória mappán végigmentünk) ---
    befejezett_kategoriak.append(kat_azonosito)
    allapot_mentese(progress_file, befejezett_kategoriak, retry_list)


# --- 7. BEJELENTKEZÉS ---
def bejelentkezes_kezelese(browser: Browser, username, password, state_fajl="state.json"):
    context = None
    if os.path.exists(state_fajl):
        print(f"\nMeglévő bejelentkezési fájl található.")
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


if __name__ == "__main__":
    load_dotenv()
    FELHASZNALONEV = os.environ.get("ADMIN_USERNAME")
    JELSZO = os.environ.get("ADMIN_PASSWORD")
    STATE_FAJL = "state.json"

    print("\n" + "=" * 50)
    print(" 📸 OKOS KÉP-SCRAPER ROBOT (Kollázsokhoz) 📸")
    print("=" * 50)

    fokategoria = input("\nKérlek add meg a főkategória PONTOS nevét (pl. INGCO termékek): ").strip()
    db_szam_input = input("Maximum hány képet töltsön le egy-egy kategóriából? (Alap: 10): ").strip()
    kivan_db = int(db_szam_input) if db_szam_input.isdigit() else 10

    print("\n--- Melyik letöltési módot választod? ---")
    print("  1: Véletlenszerű (Random eloszlás, ajánlott a változatos kollázsokhoz)")
    print("  2: Arányos (Eleje, közepe, vége)")
    mod_valasz = ""
    while mod_valasz not in ["1", "2"]:
        mod_valasz = input("Választás (1-2): ").strip()
    kivalasztott_mod = "random" if mod_valasz == "1" else "even"

    # --- ÚJ BEKÉRÉS: Köztes kategóriák letöltése ---
    koztes_valasz = input("\nSzeretnéd a köztes (alkategóriákat tartalmazó) mappákból is letölteni a 10 képet? (i/n): ").strip().lower()
    letolt_koztes = True if koztes_valasz == 'i' else False

    # --- MENTÉS INICIALIZÁLÁSA ---
    progress_file = f"scraper_progress_{tiszta_nev(fokategoria)}.json"
    befejezett_kategoriak, retry_list = allapot_betoltese(progress_file)

    if befejezett_kategoriak or retry_list:
        print(f"\n📢 Korábbi munkamenet betöltve!")
        print(f"   - Feldolgozva: {len(befejezett_kategoriak)} kategória")
        print(f"   - Javításra vár: {len(retry_list)} kép")

    # Böngésző indítása (headless=True a láthatatlan futáshoz)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        ctx = bejelentkezes_kezelese(browser, FELHASZNALONEV, JELSZO, STATE_FAJL)

        if ctx:
            try:
                page = ctx.new_page()
                print("\n🔍 Keresem a főoldalon a megadott kategóriát...")
                page.goto("https://szvgtoolsshop.hu/administrator/index.php?view=store", timeout=60000)
                time.sleep(2)

                cel_sor = page.locator(f"table#categoriesList tbody tr td a b:has-text('{fokategoria}')").first

                if cel_sor.count() > 0:
                    kezdo_link = cel_sor.locator("..").get_attribute("href")
                    teljes_kezdo_link = "https://szvgtoolsshop.hu/administrator/" + kezdo_link

                    print(f"✅ Főkategória megvan! Indul a robot pók (1. KÖR)...\n")

                    # --- 1. KÖR INDÍTÁSA ---
                    # Átadjuk a letolt_koztes flaget is!
                    kategoria_bejaro(page, teljes_kezdo_link, [fokategoria], kivan_db, kivalasztott_mod, progress_file, befejezett_kategoriak, retry_list, letolt_koztes)

                    # --- 2. KÖR: ÚJRAPRÓBÁLKOZÁS ---
                    if retry_list:
                        print("\n" + "=" * 50)
                        print(f" 2. KÖR: Újrapróbálkozás ({len(retry_list)} db hibás letöltés)")
                        print("=" * 50)

                        feldolgozando_retry = list(retry_list)  # Másolat készítése a ciklushoz

                        for i, item in enumerate(feldolgozando_retry):
                            p_url = item["url"]
                            kat_utvonal = item["kategoria_utvonal"]
                            fallback_idx = item["fallback_idx"]

                            tiszta_utvonal = [tiszta_nev(p) for p in kat_utvonal]
                            mappa_path = os.path.join("Kollazs_Kepek", *tiszta_utvonal)
                            os.makedirs(mappa_path, exist_ok=True)

                            print(f"\n[{i + 1}/{len(feldolgozando_retry)}] Retry: {' > '.join(kat_utvonal)}")

                            try:
                                letoltes_vegrehajtasa(page, p_url, mappa_path, fallback_idx)
                                # Ha sikeres volt, kivehetjük a hibalistából
                                retry_list.remove(item)
                                allapot_mentese(progress_file, befejezett_kategoriak, retry_list)
                            except Exception as e:
                                print(f"      ❌ VÉGLEGES HIBA: {e}")
                                # Végleges hiba esetén is kivesszük, ne próbálja a végtelenségig
                                retry_list.remove(item)
                                allapot_mentese(progress_file, befejezett_kategoriak, retry_list)

                    # --- VÉGSŐ TAKARÍTÁS ---
                    if os.path.exists(progress_file) and not retry_list:
                        os.remove(progress_file)
                        print("\n🗑️  Munkamenet fájl törölve (Minden kép letöltve).")

                else:
                    print(f"❌ Nem találom a(z) '{fokategoria}' nevű kategóriát a főoldalon!")

            except Exception as e:
                print(f"\n⚠️ Végzetes hiba történt: {e}")
                print("💡 A program elmentette, hogy meddig jutott. Következő indításkor innen folytatja!")
            finally:
                page.close()

        browser.close()
        print("\n🎉 A folyamat befejeződött!")