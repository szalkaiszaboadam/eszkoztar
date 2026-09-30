import os
import re
import sys
import json
import time
import requests
import pandas as pd
from playwright.sync_api import sync_playwright, Browser, BrowserContext as Context
from dotenv import load_dotenv

import urllib3

urllib3.disable_warnings(urllib3.exceptions.NotOpenSSLWarning)


# ==============================================================================
# --- UTILS & CLEANERS ---
# ==============================================================================
def tiszta_nev(nev):
    return re.sub(r'[\\/*?:"<>|]', "", str(nev)).strip()


def biztonsagos_navigacio(page, url, max_proba=3):
    for proba in range(1, max_proba + 1):
        try:
            page.goto(url, timeout=60000, wait_until="load")
            try:
                page.wait_for_load_state("networkidle", timeout=5000)
            except:
                pass
            return True
        except Exception as e:
            print(f"   ⚠️ Navigációs hiba ({proba}/{max_proba})")
            time.sleep(3)
    return False


# ==============================================================================
# --- STATE MANAGEMENT ---
# ==============================================================================
def _progress_betoltes(progress_fajl):
    alap_data = {
        "befejezett_letoltesek": [],
        "befejezett_kollazsok": [],
        "befejezett_feltoltesek": [],
        "kategoria_idk": {}
    }
    if os.path.exists(progress_fajl):
        try:
            with open(progress_fajl, "r", encoding="utf-8") as f:
                data = json.load(f)
                alap_data.update(data)
                return alap_data
        except Exception:
            pass
    return alap_data


def _progress_mentes(progress_fajl, adatok):
    tmp = progress_fajl + ".tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(adatok, f, ensure_ascii=False, indent=2)
        os.replace(tmp, progress_fajl)
    except Exception as e:
        print(f"⚠️ Progress mentési hiba: {e}")


# ==============================================================================
# --- WEBSHOP BEJELENTKEZÉS ÉS KERESÉS ---
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


def termek_megkereses(page, cikkszam):
    sf = page.locator("#searchField_all")
    sf.wait_for(state="visible", timeout=15000)
    time.sleep(0.5)
    sf.fill(cikkszam)
    sf.press("Enter")
    time.sleep(1.5)

    asztal = page.locator("table.table:not(.fixedHeader)").first
    sorok = asztal.locator("tbody tr").filter(has=page.get_by_text(cikkszam, exact=True))

    try:
        sorok.first.wait_for(timeout=10000)
    except:
        raise Exception(f"Nem található a cikkszám: {cikkszam}")

    return sorok.first


def kategoria_id_kinyerese_termeklaprol(page, kat_nev):
    try:
        kat_linkek = page.locator("a.categoryLink").all()
        for k_link in kat_linkek:
            szoveg = k_link.inner_text().strip()
            href = k_link.get_attribute("href") or ""
            tiszta_szoveg = re.sub(r'^[- \t\xa0]+', '', szoveg).strip()
            if kat_nev.lower() in tiszta_szoveg.lower():
                match = re.search(r'categoryId=(\d+)', href)
                if match:
                    return match.group(1)

        primary_id = page.locator("#primaryCategoryId").input_value()
        if primary_id:
            return primary_id
    except:
        pass
    return None


# ==============================================================================
# --- 1. FÁZIS: KÉPEK LETÖLTÉSE ---
# ==============================================================================
def kepek_letoltese(ctx: Context, excel_adatok, base_url, progress_data, progress_fajl):
    print("\n" + "─" * 50)
    print(" 1. FÁZIS: Képek letöltése a webshopból")
    print("─" * 50)

    page = ctx.new_page()
    befejezett = progress_data.get("befejezett_letoltesek", [])
    kat_id_tarolo = progress_data.get("kategoria_idk", {})

    if not biztonsagos_navigacio(page, f"{base_url}/administrator/index.php?view=store"):
        print("❌ Hiba az admin oldal betöltésekor.")
        return

    for index, row in excel_adatok.iterrows():
        kat_nev = str(row.get("Alkategória", "")).strip()
        cikkszamok_str = str(row.get("Cikkszám", "")).strip()

        if not kat_nev or kat_nev.lower() == 'nan' or not cikkszamok_str or cikkszamok_str.lower() == 'nan':
            continue

        if kat_nev in befejezett:
            print(f"   ⏭️ MÁR LETÖLTVE: {kat_nev}")
            continue

        cikkszam_lista = [c.strip() for c in cikkszamok_str.split(";") if c.strip()]
        mappa_path = os.path.join("kollazs_kepek", tiszta_nev(kat_nev))
        os.makedirs(mappa_path, exist_ok=True)

        print(f"\n📂 Kategória feldolgozása: {kat_nev} ({len(cikkszam_lista)} db kép)")

        for cikkszam in cikkszam_lista:
            try:
                sor = termek_megkereses(page, cikkszam)
                szerkesztes_link = sor.locator("a[href*='view=product']").first
                szerkesztes_link.click(force=True)
                page.wait_for_load_state("domcontentloaded")
                time.sleep(1.5)

                if kat_nev not in kat_id_tarolo:
                    kinyert_id = kategoria_id_kinyerese_termeklaprol(page, kat_nev)
                    if kinyert_id:
                        kat_id_tarolo[kat_nev] = kinyert_id
                        progress_data["kategoria_idk"] = kat_id_tarolo
                        _progress_mentes(progress_fajl, progress_data)
                        print(f"      📌 Kategória ID rögzítve a feltöltéshez: {kinyert_id}")

                kepek_ful = page.locator("label[for='kepek']")
                kepek_ful.wait_for(state="visible", timeout=5000)
                kepek_ful.click()
                time.sleep(1.0)

                kep_lista = page.locator("ul#productImages li.thumbImage a")
                if kep_lista.count() > 0:
                    kep_url = kep_lista.first.get_attribute("href")
                    if kep_url:
                        if not kep_url.startswith("http"):
                            kep_url = "https:" + kep_url if kep_url.startswith("//") else base_url + kep_url

                        response = requests.get(kep_url, stream=True, timeout=15)
                        if response.status_code == 200:
                            fajl_utvonal = os.path.join(mappa_path, f"{tiszta_nev(cikkszam)}.jpg")
                            with open(fajl_utvonal, 'wb') as f:
                                for chunk in response.iter_content(1024):
                                    f.write(chunk)
                            print(f"      ✅ Kép letöltve: {cikkszam}.jpg")
                        else:
                            print(f"      ❌ Hiba a kép letöltésekor: {cikkszam}")
                else:
                    print(f"      ⚠️ Nincs feltöltött kép a terméknél: {cikkszam}")

                biztonsagos_navigacio(page, f"{base_url}/administrator/index.php?view=store")

            except Exception as e:
                print(f"      ❌ Hiba a(z) {cikkszam} feldolgozásakor: {str(e).splitlines()[0]}")
                biztonsagos_navigacio(page, f"{base_url}/administrator/index.php?view=store")

        befejezett.append(kat_nev)
        progress_data["befejezett_letoltesek"] = befejezett
        _progress_mentes(progress_fajl, progress_data)

    page.close()
    print("\n✅ Letöltési fázis befejezve.")


# ==============================================================================
# --- 2. FÁZIS: AUTOMATA KOLLÁZSKÉSZÍTÉS ---
# ==============================================================================
def kollazsok_keszitese(ctx: Context, excel_adatok, progress_data, progress_fajl):
    print("\n" + "─" * 50)
    print(" 2. FÁZIS: Automata Kollázskészítés")
    print("─" * 50)

    mappa_alap = "kollazs_kepek"
    if not os.path.exists(mappa_alap):
        print("❌ Nincs 'kollazs_kepek' mappa!")
        return

    befejezett = progress_data.get("befejezett_kollazsok", [])
    kategoriak_excelben = [k.strip() for k in excel_adatok["Alkategória"].dropna().unique() if k.strip()]

    for kat_nev in kategoriak_excelben:
        tiszta_kat = tiszta_nev(kat_nev)

        if kat_nev in befejezett:
            print(f"   ⏭️ MÁR ELKÉSZÜLT: {kat_nev}")
            continue

        mappa_path = os.path.join(mappa_alap, tiszta_kat)
        if not os.path.exists(mappa_path):
            continue

        kepek = [os.path.abspath(os.path.join(mappa_path, f)) for f in os.listdir(mappa_path) if
                 f.lower().endswith(('.jpg', '.jpeg', '.png')) and not f.startswith('_kollazs')]

        if not kepek:
            continue

        print(f"\n🎨 Kollázs generálása: {kat_nev} ({len(kepek)} kép)")
        page = ctx.new_page()

        try:
            page.goto("https://eszkoztar.vercel.app/kollazskeszito/", timeout=60000)
            time.sleep(1.5)
            page.evaluate("localStorage.clear(); sessionStorage.clear();")

            file_input = page.locator('input[type="file"]').first
            file_input.wait_for(state="attached", timeout=5000)
            file_input.set_input_files(kepek)
            print("   ✔️ Képek betöltve az oldalra.")
            time.sleep(1.5)

            print("   ✔️ Automata mód kiválasztása.")
            page.locator('a[href="/kollazskeszito/automata"]').click()
            page.wait_for_load_state("networkidle")
            time.sleep(2)

            # --- PONTOSÍTOTT GOMB-KIVÁLASZTÁS A TÉVES KATTINTÁSOK ELLEN ---
            print("   ✔️ Rés beállítása (100).")
            # Kizárólag a Rés sorában lévő 100-as gombra kattintunk
            res_gomb = page.locator('span:text-is("Rés")').locator('..').locator('button:text-is("100")')
            res_gomb.wait_for(state="visible", timeout=5000)
            res_gomb.click()
            time.sleep(0.5)

            print("   ✔️ Margó beállítása (0).")
            # Kizárólag a Margó sorában lévő 0-s gombra kattintunk
            margo_gomb = page.locator('span:text-is("Margó")').locator('..').locator('button:text-is("0")')
            margo_gomb.wait_for(state="visible", timeout=5000)
            margo_gomb.click(force=True)
            time.sleep(1.5)
            # -------------------------------------------------------------

            print("   📥 Letöltés indítása...")
            with page.expect_download(timeout=30000) as download_info:
                page.locator('button:has-text("Letöltés")').click()

            download = download_info.value
            vegso_fajl = os.path.join(mappa_path, f"_kollazs_kesz_{int(time.time())}.png")
            download.save_as(vegso_fajl)

            print(f"   ✅ KOLLÁZS ELMENTVE: {vegso_fajl}")

            befejezett.append(kat_nev)
            progress_data["befejezett_kollazsok"] = befejezett
            _progress_mentes(progress_fajl, progress_data)

        except Exception as e:
            print(f"   ❌ Hiba a kollázskészítés közben ({kat_nev}): {str(e).splitlines()[0]}")
        finally:
            page.close()

    print("\n✅ Kollázskészítési fázis befejezve.")


# ==============================================================================
# --- 3. FÁZIS: KOLLÁZSOK FELTÖLTÉSE ---
# ==============================================================================
def feltoltes_fazis3(ctx: Context, excel_adatok, base_url, progress_data, progress_fajl):
    print("\n" + "─" * 50)
    print(" 3. FÁZIS: Kész kollázsok feltöltése a kategóriákhoz")
    print("─" * 50)

    page = ctx.new_page()

    # Bármilyen felugró alert/confirm ablak azonnali elfogadása
    page.on("dialog", lambda dialog: dialog.accept())

    befejezett = progress_data.get("befejezett_feltoltesek", [])
    kat_id_tarolo = progress_data.get("kategoria_idk", {})
    mappa_alap = "kollazs_kepek"
    kategoriak_excelben = [k.strip() for k in excel_adatok["Alkategória"].dropna().unique() if k.strip()]

    for kat_nev in kategoriak_excelben:
        if kat_nev in befejezett:
            print(f"   ⏭️ MÁR FELTÖLTVE: {kat_nev}")
            continue

        tiszta_kat = tiszta_nev(kat_nev)
        mappa_path = os.path.join(mappa_alap, tiszta_kat)

        if not os.path.exists(mappa_path):
            continue

        kollazs_fajlok = [f for f in os.listdir(mappa_path) if f.startswith("_kollazs_kesz_") and f.endswith(".png")]
        if not kollazs_fajlok:
            print(f"   ⚠️ Nincs kész kollázs a mappában ehhez: {kat_nev}")
            continue

        kollazs_utvonal = os.path.abspath(os.path.join(mappa_path, sorted(kollazs_fajlok)[-1]))

        print(f"\n🔼 Kategória előkészítése feltöltéshez: {kat_nev}")

        try:
            cat_id = kat_id_tarolo.get(kat_nev)

            if not cat_id:
                print("   🔍 Kategória ID keresése a termék adatai alapján...")
                sor_adat = excel_adatok[excel_adatok["Alkategória"].astype(str).str.strip() == kat_nev].iloc[0]
                cikkszamok = str(sor_adat.get("Cikkszám", "")).split(";")
                elso_cikkszam = cikkszamok[0].strip() if cikkszamok else ""

                if elso_cikkszam:
                    biztonsagos_navigacio(page, f"{base_url}/administrator/index.php?view=store")
                    sor = termek_megkereses(page, elso_cikkszam)
                    sor.locator("a[href*='view=product']").first.click(force=True)
                    page.wait_for_load_state("domcontentloaded")
                    time.sleep(1.5)
                    cat_id = kategoria_id_kinyerese_termeklaprol(page, kat_nev)

                    if cat_id:
                        kat_id_tarolo[kat_nev] = cat_id
                        progress_data["kategoria_idk"] = kat_id_tarolo
                        _progress_mentes(progress_fajl, progress_data)

            if not cat_id:
                print(f"   ❌ Nem sikerült kideríteni a(z) '{kat_nev}' kategória ID-ját!")
                continue

            edit_url = f"{base_url}/administrator/index.php?view=category&id={cat_id}"
            print(f"   🚀 Ugrás a szerkesztőre (ID: {cat_id})...")
            if not biztonsagos_navigacio(page, edit_url):
                print(f"   ❌ Nem sikerült megnyitni a kategóriát: {edit_url}")
                continue

            page.wait_for_load_state("domcontentloaded")
            time.sleep(1.5)

            kepek_ful = page.locator("label[for='kepek']")
            kepek_ful.wait_for(state="visible", timeout=10000)
            kepek_ful.click(force=True)
            time.sleep(1.5)

            torles_gombok = page.locator("ul#categoryImages li div.deleteImage")
            while torles_gombok.count() > 0:
                torles_gombok.first.click(force=True)
                time.sleep(1.0)

            page.locator("input#newImage").set_input_files(kollazs_utvonal)
            print("   ⏳ Kép feltöltése...")
            time.sleep(4)

            # Mentés és bezárás
            save_btn = page.locator("a#save_close")
            save_btn.wait_for(state="visible", timeout=15000)
            save_btn.click(force=True)
            print("   💾 Mentés folyamatban...")

            # RUGALMAS VÁRAKOZÁS: Nem hagyjuk, hogy elakadjon, ha nem vált rögtön URL-t!
            try:
                page.wait_for_load_state("networkidle", timeout=10000)
            except:
                pass
            time.sleep(2)

            befejezett.append(kat_nev)
            progress_data["befejezett_feltoltesek"] = befejezett
            _progress_mentes(progress_fajl, progress_data)

            print(f"   ✅ Sikeresen feltöltve a webshopba: {kat_nev}")

        except Exception as e:
            print(f"   ❌ Hiba a feltöltés során ({kat_nev}): {str(e).splitlines()[0]}")

    page.close()

    if len(befejezett) >= len(kategoriak_excelben) and os.path.exists(progress_fajl):
        os.remove(progress_fajl)
        print("\n🗑️ Menetfájl törölve, MINDEN FELADAT SIKERESEN LEFUTOTT!")


# ==============================================================================
# --- FŐPROGRAM ---
# ==============================================================================
if __name__ == "__main__":
    load_dotenv()
    FAJLOK_MAPPAJA = "input_tablak"

    print("\n" + "=" * 50)
    print(" 🤖 EXCEL ALAPÚ KÉPLETÖLTŐ ÉS KOLLÁZSKÉSZÍTŐ ROBOT 🤖")
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

    try:
        excel_adatok = pd.read_excel(valasztott_path, dtype=str)
        if "Alkategória" not in excel_adatok.columns or "Cikkszám" not in excel_adatok.columns:
            print("❌ HIBA: Az Excelnek tartalmaznia kell a 'Alkategória' és 'Cikkszám' oszlopokat!")
            sys.exit(1)
    except Exception as e:
        print(f"❌ Hiba az Excel beolvasásakor: {e}")
        sys.exit(1)

    unique_kategoriak = [k.strip() for k in excel_adatok["Alkategória"].dropna().unique() if k.strip()]
    progress_fajl = valasztott_path + ".kollazs_progress.json"
    progress_data = _progress_betoltes(progress_fajl)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False, args=['--start-maximized'])

        # --- 1. Fázis: Letöltés ---
        if len(progress_data.get("befejezett_letoltesek", [])) < len(unique_kategoriak):
            ctx = bejelentkezes_kezelese(browser, FELHASZNALONEV, JELSZO, BASE_URL, STATE_FAJL)
            if ctx:
                kepek_letoltese(ctx, excel_adatok, BASE_URL, progress_data, progress_fajl)
        else:
            print("\n⏭️ Képek letöltése már kész, ugrás a kollázsokhoz.")

        # --- 2. Fázis: Kollázs készítés ---
        if len(progress_data.get("befejezett_kollazsok", [])) < len(unique_kategoriak):
            kollazs_ctx = browser.new_context(no_viewport=True)
            kollazsok_keszitese(kollazs_ctx, excel_adatok, progress_data, progress_fajl)
            kollazs_ctx.close()
        else:
            print("\n⏭️ Kollázsok készítése már kész, ugrás a feltöltéshez.")

        # --- 3. Fázis: Feltöltés ---
        if len(progress_data.get("befejezett_feltoltesek", [])) < len(unique_kategoriak):
            feltolto_ctx = bejelentkezes_kezelese(browser, FELHASZNALONEV, JELSZO, BASE_URL, STATE_FAJL)
            if feltolto_ctx:
                feltoltes_fazis3(feltolto_ctx, excel_adatok, BASE_URL, progress_data, progress_fajl)
        else:
            print("\n⏭️️ Kollázsok feltöltése már kész.")

        browser.close()

    print("\n🎉 Minden feladat automatikusan befejeződött!")
