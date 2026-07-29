import pandas as pd
from playwright.sync_api import sync_playwright, Browser, BrowserContext as Context
import time
import os
import re
import sys
from dotenv import load_dotenv

# Globális lista az eredmények gyűjtéséhez
kategoria_fa_adatok = []


# ==============================================================================
# --- BIZTONSÁGOS NAVIGÁCIÓ (Szerver lehalás ellen) ---
# ==============================================================================
def biztonsagos_navigacio(page, url, max_proba=3):
    """Lassított és újrapróbálós navigáció, hogy elkerüljük az ERR_HTTP2_PROTOCOL_ERROR-t."""
    for proba in range(1, max_proba + 1):
        try:
            page.goto(url, timeout=60000, wait_until="load")
            try:
                page.wait_for_load_state("networkidle", timeout=10000)
            except:
                pass
            return True
        except Exception as e:
            print(f"   ⚠️ Navigációs hiba ({proba}/{max_proba}): {str(e).splitlines()[0]}")
            if proba < max_proba:
                print(f"   🔄 Újrapróbálás 3 mp múlva...")
                time.sleep(3)
    return False


# ==============================================================================
# --- BEJELENTKEZÉS ---
# ==============================================================================
def bejelentkezes_kezelese(browser: Browser, username, password, base_url, state_fajl="state.json"):
    if os.path.exists(state_fajl):
        print(f"\n   Session betöltése: {state_fajl}")
        try:
            ctx = browser.new_context(storage_state=state_fajl)
            page = ctx.new_page()
            page.goto(f"{base_url}/administrator/", timeout=30000)
            if page.locator("#searchField_all").is_visible(timeout=5000):
                print("   ✅ Session érvényes.")
                page.close()
                return ctx
            page.close()
            ctx.close()
        except:
            pass
        print("   ⚠️ Session lejárt, új bejelentkezés...")

    ctx = browser.new_context()
    page = ctx.new_page()
    try:
        page.goto(f"{base_url}/administrator/", timeout=30000)
        page.fill("input[name='username']", username)
        page.fill("input[name='password']", password)
        page.click("button[type='submit']")
        page.locator("#searchField_all").wait_for(state="visible", timeout=15000)
        ctx.storage_state(path=state_fajl)
        print("   ✅ Bejelentkezés sikeres.")
    except Exception as e:
        print(f"❌ LOGIN HIBA: {e}")
        sys.exit(1)
    page.close()
    return ctx


# ==============================================================================
# --- KATEGÓRIAFA FELTÉRKÉPEZŐ LOGIKA ---
# ==============================================================================
def kategoria_feltelkepezo(page, base_url, aktualis_url, szint_utvonal):
    """
    Rekurzív függvény: végigmegy a kategóriákon, és belemegy az alkategóriákba.
    """
    time.sleep(1)  # Kicsit lassítjuk a tempót, hogy a szerver ne haljon le!

    if not biztonsagos_navigacio(page, aktualis_url):
        print(f"   ❌ Végleg feladtam az oldal betöltését: {aktualis_url}")
        return

    # Görgetés az oldal aljára a lusta betöltés (lazy load) miatt
    page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    time.sleep(1)

    # Megvárjuk a TÉNYLEGES táblázatot
    try:
        asztal = page.locator("table#categoriesList:not(.fixedHeader)").first
        asztal.wait_for(state="attached", timeout=10000)
    except:
        return

    kategoria_sorok = asztal.locator("tbody tr[id]").all()
    if not kategoria_sorok:
        return

    gyerek_kategoriak = []

    # 4. Kimentjük a neveket és a linkeket MIELŐTT elnavigálnánk!
    for sor in kategoria_sorok:
        try:
            link_elem = sor.locator("td:nth-child(3) a").first

            if link_elem.count() == 0:
                continue

            nev = link_elem.inner_text().strip()
            link = link_elem.get_attribute("href")

            if nev and link:
                gyerek_kategoriak.append((nev, link))
        except Exception as e:
            continue

    # 5. Végigmegyünk a megtalált gyerekeken, mentjük az adatot és leásunk beléjük
    for nev, link in gyerek_kategoriak:
        teljes_link = f"{base_url}/administrator/{link}" if not link.startswith("http") else link

        # Hozzáadjuk a jelenlegi nevet a szintekhez
        uj_utvonal = szint_utvonal + [nev]

        # A kötőjelek számát úgy határozzuk meg, hogy hányadik szinten vagyunk.
        # Mivel a kezdő kategória is benne van (pl. 0 kötőjel), a gyerekek - jellel indulnak.
        kotojelek = "-" * (len(szint_utvonal))
        kotojeles_nev = f"{kotojelek} {nev}".strip()

        sor_adat = {
            "Kötőjeles Nézet": kotojeles_nev,
            "Kategória Név": nev
        }

        for i, szint_nev in enumerate(uj_utvonal):
            sor_adat[f"Szint {i + 1}"] = szint_nev

        kategoria_fa_adatok.append(sor_adat)

        behuzas = "   " * len(szint_utvonal)
        print(f"{behuzas}📂 {nev}")

        # REKURZIÓ: Belemegyünk az alkategóriába!
        kategoria_feltelkepezo(page, base_url, teljes_link, uj_utvonal)


# ==============================================================================
# --- FŐPROGRAM ---
# ==============================================================================
if __name__ == "__main__":
    load_dotenv()

    print("\n" + "=" * 50)
    print(" 🌳 KATEGÓRIAFA FELTÉRKÉPEZŐ ROBOT 🌳")
    print("=" * 50)

    print("\n  1: SZVG Tools (szvgtoolsshop.hu)")
    print("  2: PTD Bolt (ptdbolt.hu)")
    shop_valasz = ""
    while shop_valasz not in ["1", "2"]:
        shop_valasz = input("Választás (1-2): ").strip()

    if shop_valasz == '1':
        USERNAME = os.environ.get("SZVG_USERNAME")
        PASSWORD = os.environ.get("SZVG_PASSWORD")
        BASE_URL = "https://szvgtoolsshop.hu"
        STATE_FAJL = "state_szvg.json"
    else:
        USERNAME = os.environ.get("PTD_USERNAME")
        PASSWORD = os.environ.get("PTD_PASSWORD")
        BASE_URL = "https://ptdbolt.hu"
        STATE_FAJL = "state_ptd.json"

    if not USERNAME or not PASSWORD:
        print("❌ HIBA: Hiányoznak a bejelentkezési adatok a .env fájlból!")
        sys.exit(1)

    print("\n" + "-" * 50)
    print("🔗 HONNAN INDULJON A KERESÉS?")
    print("   Írd be a főkategória pontos nevét, amin belül térképezzünk (pl: Giasco termékek)!")
    print("   (Ha teljesen üresen hagyod és Entert nyomsz, a legfelső szintről indul a teljes áruházban.)")
    start_kategoria = input("Kategória neve: ").strip()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)

        ctx = bejelentkezes_kezelese(browser, USERNAME, PASSWORD, BASE_URL, STATE_FAJL)
        page = ctx.new_page()

        alap_start_url = f"{BASE_URL}/administrator/index.php?view=store"
        kezdo_utvonal = []

        if start_kategoria:
            print(f"\n🔍 Keresem a(z) '{start_kategoria}' kategóriát a főoldalon...")

            if biztonsagos_navigacio(page, alap_start_url):
                page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                time.sleep(1.5)

                try:
                    asztal = page.locator("table#categoriesList:not(.fixedHeader)").first
                    kategoria_link = asztal.get_by_role("link", name=start_kategoria, exact=True).first
                    kategoria_link.wait_for(state="visible", timeout=15000)

                    talalt_href = kategoria_link.get_attribute("href")
                    START_URL = f"{BASE_URL}/administrator/{talalt_href}" if not talalt_href.startswith(
                        "http") else talalt_href

                    # Ha beírtuk a főkategóriát, vegyük fel azt is a kimentendő adatok közé legelső sorként!
                    kezdo_utvonal = [start_kategoria]
                    kategoria_fa_adatok.append({
                        "Kötőjeles Nézet": start_kategoria,
                        "Kategória Név": start_kategoria,
                        "Szint 1": start_kategoria
                    })

                    print(f"   ✅ Kategória megvan! Indulás...")
                except Exception as e:
                    print(f"   ❌ Hiba: Nem találom a(z) '{start_kategoria}' nevű kategóriát a főoldalon!")
                    print("   Kérlek ellenőrizd, hogy pontosan írtad-e be a nevét (kis/nagybetű számít).")
                    sys.exit(1)
            else:
                print("❌ Nem sikerült betölteni az admin főoldalt.")
                sys.exit(1)
        else:
            START_URL = alap_start_url

        print(f"\n🚀 Kategóriafa feltérképezése elindult...\n")

        # Indítjuk a rekurziót!
        kategoria_feltelkepezo(page, BASE_URL, START_URL, kezdo_utvonal)

        page.close()
        browser.close()

    # --- Excel Generálás ---
    if kategoria_fa_adatok:
        df = pd.DataFrame(kategoria_fa_adatok)

        # Oszlopok rendezése: Kötőjeles Nézet -> Szintek sorrendben -> Kategória Név
        szint_oszlopok = sorted([col for col in df.columns if col.startswith("Szint")])
        oszlopok = ["Kötőjeles Nézet"] + szint_oszlopok + ["Kategória Név"]

        df = df[oszlopok]

        # 1. Export mappa létrehozása (ha még nincs)
        export_mappa = "kategoria_exportok"
        os.makedirs(export_mappa, exist_ok=True)

        # 2. Biztonságos fájlnév generálása a kategória nevéből
        if start_kategoria:
            # Csak alfanumerikus karaktereket és szóközöket/kötőjeleket hagyunk meg, majd a szóközöket aláhúzásra cseréljük
            biztonsagos_nev = re.sub(r'[^\w\s-]', '', start_kategoria).strip().replace(' ', '_')
        else:
            biztonsagos_nev = "Teljes_Webshop"

        # 3. Fájlnév és elérési út összerakása
        fajlnev = f"{biztonsagos_nev}_kategoriastruktura_{time.strftime('%Y%m%d_%H%M')}.xlsx"
        teljes_utvonal = os.path.join(export_mappa, fajlnev)

        # 4. Mentés a mappába
        df.to_excel(teljes_utvonal, index=False, engine='openpyxl')

        print("\n" + "=" * 50)
        print(f"🎉 KÉSZ! {len(kategoria_fa_adatok)} db kategória kimentve.")
        print(f"📁 Fájl elmentve ide: {teljes_utvonal}")
        print("=" * 50)
    else:
        print("\n⚠️ A program rendben lefutott, de nem talált kategóriákat.")