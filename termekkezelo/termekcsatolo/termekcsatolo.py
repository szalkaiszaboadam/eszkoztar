import pandas as pd
from playwright.sync_api import sync_playwright, Browser, BrowserContext as Context
import time
import os
import re
import sys
import json
import datetime
from dotenv import load_dotenv


# ==============================================================================
# --- STATE MANAGEMENT (Folyamatmentés) ---
# ==============================================================================
def _progress_mentes(progress_fajl, index, retry_list, mod):
    tmp = progress_fajl + ".tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump({
                "index": index,
                "retry_list": retry_list,
                "mod": mod
            }, f, ensure_ascii=False, indent=2)
        os.replace(tmp, progress_fajl)
    except Exception as e:
        print(f"⚠️ Progress mentési hiba: {e}")


def _progress_betoltes(progress_fajl):
    if os.path.exists(progress_fajl):
        try:
            with open(progress_fajl, "r", encoding="utf-8") as f:
                data = json.load(f)
                return (
                    data.get("index", 0),
                    data.get("retry_list", []),
                    data.get("mod", "")
                )
        except Exception as e:
            print(f"⚠️ Sérült progress fájl ({e}), elölről kezdünk.")
    return 0, [], ""


# ==============================================================================
# --- ADATBEOLVASÁS ---
# ==============================================================================
def adatok_beolvasasa_kapcsolodo(excel_fajl_neve):
    try:
        df = pd.read_excel(excel_fajl_neve, dtype=str)
    except FileNotFoundError:
        print(f"❌ HIBA: Az '{excel_fajl_neve}' fájl nem található.")
        return None
    except Exception as e:
        print(f"❌ HIBA az Excel beolvasása közben: {e}")
        return None

    szukseges_oszlopok = ["Cikkszám", "Név", "Kapcsolódó termékek", "Márka", "Megjegyzés"]
    hianyzo = [o for o in szukseges_oszlopok if o not in df.columns]
    if hianyzo:
        print(f"❌ HIBA: Hiányzó oszlopok a táblázatban: {', '.join(hianyzo)}")
        return None

    feldolgozando_lista = []

    for _, row in df.iterrows():
        def clean_val(val):
            val_str = str(val).strip()
            return "" if val_str.lower() == 'nan' else val_str

        nyers_cikkszam = clean_val(row["Cikkszám"])
        if nyers_cikkszam.endswith(" 00:00:00"):
            nyers_cikkszam = nyers_cikkszam.replace(" 00:00:00", "")
        if nyers_cikkszam.endswith(".0"):
            nyers_cikkszam = nyers_cikkszam[:-2]

        nev = clean_val(row["Név"])
        marka = clean_val(row["Márka"])
        kapcsolodo_str = clean_val(row["Kapcsolódó termékek"])
        megjegyzes = clean_val(row["Megjegyzés"])

        if not kapcsolodo_str:
            continue

        kapcs_lista = [k.strip() for k in kapcsolodo_str.split(";") if k.strip()]

        van_azonosito = nyers_cikkszam or nev

        if van_azonosito and kapcs_lista:
            feldolgozando_lista.append({
                "cikkszam": nyers_cikkszam,
                "nev": nev,
                "marka": marka,
                "kapcs_lista": kapcs_lista,
                "megjegyzes": megjegyzes,
                "eredeti_sor": row.to_dict()
            })

    return feldolgozando_lista


# ==============================================================================
# --- BIZTONSÁGOS NAVIGÁCIÓ ÉS KERESÉS ---
# ==============================================================================
def biztonsagos_navigacio(page, url, max_proba=3):
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
                print(f"   🔄 Újrapróbálás 5 mp múlva...")
                time.sleep(5)
    print("   ❌ Navigáció végleges hiba.")
    return False


def bizonylatkeszito_nezet(page):
    try:
        nezet_valto = page.locator("li.modeSwitch[onclick*='switchMode(2)']")
        if nezet_valto.is_visible(timeout=3000):
            nezet_valto.click()
            time.sleep(2)
            page.locator("#searchField_all").wait_for(state="visible", timeout=10000)
    except Exception:
        pass


def termek_megkereses(page, cikkszam, marka, nev):
    van_cikkszam = bool(cikkszam)
    biztonsagos_nev = nev
    if not van_cikkszam:
        biztonsagos_nev = re.split(r'["°=]', nev)[0].strip()

    keresendo = cikkszam if van_cikkszam else biztonsagos_nev
    sf = page.locator("#searchField_all")
    sf.wait_for(state="visible", timeout=15000)
    time.sleep(0.5)
    sf.fill(keresendo)
    sf.press("Enter")
    time.sleep(1.5)

    asztal = page.locator("table.table:not(.fixedHeader)").first
    sorok = asztal.locator("tbody tr").filter(has_text=cikkszam if van_cikkszam else biztonsagos_nev)

    sorok.first.wait_for(timeout=15000)
    talalat_db = sorok.count()

    if talalat_db == 1:
        return sorok.first
    if talalat_db == 0:
        raise Exception("Nem található a keresett termék a listában!")

    print(f"   ⚠️ Több találat ({talalat_db} db). Pontosítás...")

    if van_cikkszam:
        pontos = sorok.filter(has=page.get_by_text(cikkszam, exact=True))
        if pontos.count() == 1:
            return pontos.first

    szurt = sorok
    if marka:
        szurt = szurt.filter(has_text=marka)
    if nev:
        szurt = szurt.filter(has_text=nev)

    szurt_db = szurt.count()

    if szurt_db == 1:
        return szurt.first
    if szurt_db > 1 and nev:
        pontos_n = szurt.filter(has=page.get_by_text(nev, exact=True))
        if pontos_n.count() == 1:
            return pontos_n.first
        raise Exception("DUPLIKÁCIÓ: Név és márka alapján is több azonos sor van.")

    raise Exception("DUPLIKÁCIÓ: A szűkítés után egyetlen konkrét termék sem azonosítható!")


# ==============================================================================
# --- KAPCSOLÓDÓ TERMÉKEK HOZZÁADÁSA / TÖRLÉSE ---
# ==============================================================================
def kapcsolodo_termekek_hozzaadasa(page, kapcs_lista, mod):
    try:
        # 1. Átváltás a Kapcsolódó termékek fülre
        fulecske = page.locator("label[for='kapcsolodo']")
        fulecske.wait_for(state="visible", timeout=15000)
        fulecske.click(force=True)
        time.sleep(1)

        # -------------------------------------------------------------
        # --- FELÜLÍRÁS MÓD (TÖRLÉS A VALÓDI GOMBBAL) ---
        # -------------------------------------------------------------
        if mod == "feluliras":
            print("      🧹 Meglévő kapcsolódó termékek törlése...")
            # Biztonsági ciklus: addig kattintgatja a kukákat, amíg el nem tünnek
            for _ in range(100):
                torles_gomb = page.locator("i.fa-trash-o[onclick*='removeRelatedProduct']").first
                try:
                    if torles_gomb.is_visible():
                        torles_gomb.click(force=True)
                        time.sleep(0.4)
                    else:
                        break
                except:
                    break
        # -------------------------------------------------------------

        kereso_mezo = page.locator("#relatedProductKeyword")
        kereso_mezo.wait_for(state="visible", timeout=10000)
        talalati_kontener = page.locator("#relatedProductsResults")

        for kapcs_cikkszam in kapcs_lista:
            print(f"      🔍 Kapcsolódó keresése: {kapcs_cikkszam}")

            sikeres_hozzaadas = False
            max_kereses_proba = 3

            for proba in range(1, max_kereses_proba + 1):
                # Mező ürítése és fókuszálása
                kereso_mezo.focus()
                kereso_mezo.fill("")
                time.sleep(0.3)

                # Emberi gépelés szimulálása
                kereso_mezo.press_sequentially(kapcs_cikkszam, delay=50)
                time.sleep(1)

                # Keresés indítása
                kereso_mezo.press("Enter")

                try:
                    # Várunk a hálózat megnyugvására (AJAX befejezése)
                    page.wait_for_load_state("networkidle", timeout=10000)

                    # Megkeressük a gombot
                    hozzaad_gomb = talalati_kontener.locator("div.pure-button, a.pure-button").filter(
                        has_text=re.compile(r"Hozzáadás", re.IGNORECASE)).first

                    # Adunk neki max 3 másodpercet a vizuális megjelenésre
                    hozzaad_gomb.wait_for(state="visible", timeout=3000)

                    # Ha idáig eljutott (nem dobott timeout hibát), akkor kattinthatunk!
                    hozzaad_gomb.click(force=True)
                    print(f"      ✅ Kapcsolódó hozzáadva: {kapcs_cikkszam}")
                    time.sleep(1.5)
                    sikeres_hozzaadas = True
                    break  # Kilép a próbálkozós ciklusból, megy a következő termékre!

                except Exception as e:
                    if proba < max_kereses_proba:
                        print(f"      🔄 Nincs találat, újrapróbálom ({proba}/{max_kereses_proba})...")
                        time.sleep(1)

            # Ha a 3. próba után is False maradt a státusz:
            if not sikeres_hozzaadas:
                print(f"      ⚠️ Végleg feladtam. Nem található a cikkszám vagy a 'Hozzáadás' gomb: {kapcs_cikkszam}")

    except Exception as e:
        print(f"   ❌ Hiba a Kapcsolódó termékek fül megnyitásakor: {e}")
        raise e

# ==============================================================================
# --- FŐ FELDOLGOZÓ (PROCESSZOR) ---
# ==============================================================================
def run_processor(context: Context, termek_lista, progress_fajl, bemeneti_fajl_neve, base_url, mod):
    start_index, retry_list, _ = _progress_betoltes(progress_fajl)

    if start_index > 0 or retry_list:
        print(f"\n📢 KORÁBBI ÁLLAPOT BETÖLTVE: {start_index} db feldolgozva, {len(retry_list)} db javításra vár.")

    feldolgozando = termek_lista[start_index:]
    sikeres_db = 0
    veglegesen_sikertelen = []

    if not feldolgozando and not retry_list:
        if os.path.exists(progress_fajl): os.remove(progress_fajl)
        return

    try:
        page = context.new_page()
    except Exception as e:
        print(f"❌ Nem sikerült böngészőlapot nyitni: {e}")
        return

    # --- 1. KÖR ---
    if feldolgozando:
        print(f"\n{'─' * 50}\n 1. KÖR: {len(feldolgozando)} termékhez kapcsolódók csatolása\n{'─' * 50}")
        for i, termek in enumerate(feldolgozando):
            aktualis_sorszam = start_index + i + 1
            keresendo_nev = termek['cikkszam'] if termek['cikkszam'] else termek['nev']
            print(f"\n[{aktualis_sorszam}/{len(termek_lista)}] Termék: {keresendo_nev}")

            try:
                if not biztonsagos_navigacio(page, f"{base_url}/administrator/"):
                    raise Exception("Nem sikerült betölteni az admin főoldalt.")

                bizonylatkeszito_nezet(page)

                sor = termek_megkereses(page, termek["cikkszam"], termek["marka"], termek["nev"])
                szerkesztes_link = sor.locator("a[href*='view=product']").first
                szerkesztes_link.wait_for(state="visible", timeout=10000)
                szerkesztes_link.click(force=True)

                page.wait_for_load_state("domcontentloaded")
                time.sleep(1.5)

                kapcsolodo_termekek_hozzaadasa(page, termek["kapcs_lista"], mod)

                print("   💾 Mentés és visszatérés a listába...")
                try:
                    with page.expect_navigation(timeout=20000):
                        page.evaluate("saveProduct('close')")
                except:
                    print("   ⚠️ Aszinkron mentési várakozás... (a lap lehet, hogy már frissült)")

                print(f"   ✅ Termék sikeresen frissítve.")
                sikeres_db += 1

            except Exception as e:
                hiba = str(e).splitlines()[0]
                print(f"   ❌ HIBA: {hiba}")
                retry_list.append([termek, hiba])

            _progress_mentes(progress_fajl, aktualis_sorszam, retry_list, mod)

    # --- 2. KÖR (RETRY) ---
    if retry_list:
        print(f"\n{'─' * 50}\n 2. KÖR (RETRY): {len(retry_list)} db újrapróbálása\n{'─' * 50}")
        feldolgozando_retry = list(retry_list)
        retry_list.clear()

        for i, elem in enumerate(feldolgozando_retry):
            termek, elozo_hiba = elem
            keresendo_nev = termek['cikkszam'] if termek['cikkszam'] else termek['nev']
            print(f"\n[{i + 1}/{len(feldolgozando_retry)}] Retry: {keresendo_nev}")

            if "DUPLIKÁCIÓ" in elozo_hiba.upper():
                print(f"   ⏩ Átugorva: duplikációs hiba.")
                veglegesen_sikertelen.append((termek, elozo_hiba))
                _progress_mentes(progress_fajl, len(termek_lista), retry_list, mod)
                continue

            try:
                if not biztonsagos_navigacio(page, f"{base_url}/administrator/"):
                    raise Exception("Nem sikerült betölteni az admin főoldalt.")
                bizonylatkeszito_nezet(page)

                sor = termek_megkereses(page, termek["cikkszam"], termek["marka"], termek["nev"])
                szerkesztes_link = sor.locator("a[href*='view=product']").first
                szerkesztes_link.click(force=True)
                page.wait_for_load_state("domcontentloaded")
                time.sleep(1.5)

                kapcsolodo_termekek_hozzaadasa(page, termek["kapcs_lista"], mod)

                print("   💾 Mentés és visszatérés a listába...")
                try:
                    with page.expect_navigation(timeout=20000):
                        page.evaluate("saveProduct('close')")
                except:
                    pass

                print(f"   ✅ Sikeres (2. kör).")
                sikeres_db += 1

            except Exception as e:
                vegleges_hiba = str(e).splitlines()[0]
                print(f"   ❌ VÉGLEGES HIBA: {vegleges_hiba}")
                veglegesen_sikertelen.append((termek, vegleges_hiba))

            _progress_mentes(progress_fajl, len(termek_lista), retry_list, mod)

    page.close()
    if not retry_list and os.path.exists(progress_fajl): os.remove(progress_fajl)

    if veglegesen_sikertelen:
        os.makedirs("sikertelen_tablak", exist_ok=True)
        df_err = pd.DataFrame([{
            "Cikkszám": t["cikkszam"],
            "Név": t["nev"],
            "Márka": t["marka"],
            "Kapcsolódó termékek": "; ".join(t["kapcs_lista"]),
            "Hiba oka": h}
            for t, h in veglegesen_sikertelen])
        alap_nev = os.path.splitext(os.path.basename(bemeneti_fajl_neve))[0]
        fnev = os.path.join("sikertelen_tablak",
                            f"{alap_nev}_csatolasi_hiba_{datetime.datetime.now().strftime('%Y%m%d_%H%M')}.xlsx")
        df_err.to_excel(fnev, index=False, engine='openpyxl')
        print(f"\n💾 Hibalista mentve: {fnev}")


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
# --- FŐPROGRAM ---
# ==============================================================================
if __name__ == "__main__":
    load_dotenv()
    FAJLOK_MAPPAJA = "input_tablak"

    print("\n" + "=" * 50)
    print(" 🔗 TERMÉKCSATOLÓ ROBOT 🔗")
    print("=" * 50)

    print("\n  1: SZVG Tools (szvgtoolsshop.hu)")
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
        print("❌ HIBA: Hiányoznak a bejelentkezési adatok a .env fájlból!")
        sys.exit(1)

    os.makedirs(FAJLOK_MAPPAJA, exist_ok=True)

    excel_fajlok = [f for f in os.listdir(FAJLOK_MAPPAJA) if f.endswith(('.xlsx', '.xls'))]
    if not excel_fajlok:
        print(f"❌ Nincs Excel fájl az '{FAJLOK_MAPPAJA}' mappában!")
        sys.exit(1)

    print("\n--- Excel fájl választása ---")
    for i, f in enumerate(excel_fajlok):
        print(f"  {i + 1}: {f}")

    while True:
        try:
            idx = int(input(f"Fájl sorszáma (1-{len(excel_fajlok)}): ").strip()) - 1
            if 0 <= idx < len(excel_fajlok):
                valasztott_path = os.path.join(FAJLOK_MAPPAJA, excel_fajlok[idx])
                break
        except (ValueError, IndexError):
            pass

    progress_fajl = valasztott_path + ".csatolo_progress.json"

    # Progress betöltés / törlés
    folytatas = False
    mod = ""
    if os.path.exists(progress_fajl):
        saved_index, saved_retry, saved_mod = _progress_betoltes(progress_fajl)

        print(f"\n⚠️ Korábbi félbemaradt munkamenet találva:")
        print(f"   Feldolgozva: {saved_index} db")
        print(f"   Retry listán: {len(saved_retry)} db")
        mod_nev = "Felülírás (Régi törlése)" if saved_mod == "feluliras" else "Hozzáadás (Régi megtartása)"
        print(f"   Korábbi mód: {mod_nev}")
        print()
        print("  1: FOLYTATÁS (onnan ahol abbahagyta)")
        print("  2: ÚJRAKEZDÉS (progress törlése, tiszta lap)")

        ujra_v = ""
        while ujra_v not in ["1", "2"]:
            ujra_v = input("Választás (1-2): ").strip()

        if ujra_v == "1":
            folytatas = True
            mod = saved_mod
        else:
            os.remove(progress_fajl)
            print("   🗑️ Progress törölve. Tiszta lappal indulunk.")

    if not folytatas:
        print("\n--- Kapcsolódó Termékek Mód Választás ---")
        print("  1: HOZZÁADÁS (A meglévő kapcsolódó termékek megtartása)")
        print("  2: FELÜLÍRÁS (A meglévő kapcsolódó termékek TÖRLÉSE, csak az újak maradnak)")
        mod_v = ""
        while mod_v not in ["1", "2"]:
            mod_v = input("Választás (1-2): ").strip()
        mod = "hozzaadas" if mod_v == "1" else "feluliras"

    termekek = adatok_beolvasasa_kapcsolodo(valasztott_path)
    if not termekek:
        print("⚠️ Nincs feldolgozható sor a táblázatban (vagy mindegyik 'Kapcsolódó termékek' oszlopa üres).")
        sys.exit(1)

    print(f"\n📋 {len(termekek)} termék betöltve (csak a kapcsolódóval rendelkezők).")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        ctx = bejelentkezes_kezelese(browser, FELHASZNALONEV, JELSZO, BASE_URL, STATE_FAJL)
        if ctx:
            run_processor(ctx, termekek, progress_fajl, valasztott_path, base_url=BASE_URL, mod=mod)
        browser.close()

    print("\n🎉 Program befejeződött!")