import pandas as pd
from playwright.sync_api import sync_playwright, Browser, BrowserContext as Context
import time
import sys
import datetime
import os
import json
import re
import math
from dotenv import load_dotenv


# ==============================================================================
# --- STATE MANAGEMENT ---
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
# --- NÉZET HELPER ---
# ==============================================================================
def bizonylatkeszito_nezet(page):
    try:
        nezet_valto = page.locator("li.modeSwitch[onclick*='switchMode(2)']")
        if nezet_valto.is_visible(timeout=3000):
            print("   🔄 Rossz nézet észlelve! Bizonylatkészítőre váltás...")
            nezet_valto.click()
            time.sleep(3)
            page.locator("#searchField_all").wait_for(state="visible", timeout=10000)
            print("   ✅ Bizonylatkészítő nézet aktív.")
    except Exception:
        pass

    # ==============================================================================


# --- 1. LÉPÉS: Adatbeolvasás (SIMA TERMÉK) ---
# ==============================================================================
def adatok_beolvasasa(excel_fajl_neve):
    try:
        df = pd.read_excel(excel_fajl_neve, dtype=str)
    except FileNotFoundError:
        print(f"❌ HIBA: Az '{excel_fajl_neve}' fájl nem található.")
        return None
    except Exception as e:
        print(f"❌ HIBA az Excel beolvasása közben: {e}")
        return None

    szukseges_oszlopok = ["Cikkszám", "Név", "Alkategória", "Márka"]
    hianyzo = [o for o in szukseges_oszlopok if o not in df.columns]
    if hianyzo:
        print(f"❌ HIBA: Hiányzó oszlopok: {', '.join(hianyzo)}")
        return None

    feldolgozando_lista = []
    for _, row in df.iterrows():
        nyers_cikkszam = str(row["Cikkszám"]).strip()
        if nyers_cikkszam.endswith(" 00:00:00"):
            nyers_cikkszam = nyers_cikkszam.replace(" 00:00:00", "")
            if nyers_cikkszam.endswith("-01"):
                nyers_cikkszam = nyers_cikkszam[:-3]

        cikkszam = nyers_cikkszam
        nev = str(row["Név"]).strip()
        marka = str(row["Márka"]).strip()
        kategoria_fejlec = str(row["Alkategória"]).strip()

        van_azonosito = (cikkszam and cikkszam.lower() != 'nan') or (nev and nev.lower() != 'nan')
        if not van_azonosito or marka.lower() == 'nan' or kategoria_fejlec.lower() == 'nan':
            continue

        tiszta_fejlec = re.sub(r'\.\d+$', '', kategoria_fejlec)
        kategoriak_listaja = [k.strip() for k in tiszta_fejlec.split(';') if k.strip()]

        if kategoriak_listaja:
            feldolgozando_lista.append((cikkszam, marka, nev, kategoria_fejlec, kategoriak_listaja))

    return feldolgozando_lista


# ==============================================================================
# --- 1/B. LÉPÉS: Adatbeolvasás (GYŰJTŐ TERMÉK) ---
# ==============================================================================
def adatok_beolvasasa_gyujtokhoz(excel_fajl_neve):
    try:
        df = pd.read_excel(excel_fajl_neve, dtype=str)
    except Exception as e:
        print(f"❌ HIBA az Excel beolvasása közben: {e}")
        return None

    szukseges = ["Márka", "Termékjellemző Név", "Termékjellemző Érték", "Cikkszám",
                 "Név", "Hosszú Leírás", "Nettó Ár", "Alkategória", "Kép"]

    for oszlop in szukseges:
        if oszlop not in df.columns:
            print(f"❌ HIBA: Hiányzó oszlop: {oszlop}")
            return None

    feldolgozando_lista = []
    aktualis_gyujto = None

    for index, row in df.iterrows():
        jellemzo_ertek = str(row["Termékjellemző Érték"]).strip()

        def clean_val(val):
            val_str = str(val).strip()
            return "" if val_str.lower() == 'nan' else val_str

        # --- GYŰJTŐ TERMÉK (SZÜLŐ) SOR ---
        if jellemzo_ertek == "-":
            if aktualis_gyujto:
                feldolgozando_lista.append(aktualis_gyujto)

            tulajdonsagok = [t.strip() for t in clean_val(row["Termékjellemző Név"]).split(",") if t.strip()]
            alkategoriak = [k.strip() for k in clean_val(row["Alkategória"]).split(';') if k.strip()]

            aktualis_gyujto = {
                "tipus": "gyujto",
                "marka": clean_val(row["Márka"]),
                "nev": clean_val(row["Név"]),
                "leiras": clean_val(row["Hosszú Leírás"]),
                "alapar": clean_val(row["Nettó Ár"]),
                "kategoriak": alkategoriak,
                "jellemzo_nevek": tulajdonsagok,
                "alapkep": clean_val(row["Kép"]),
                "valtozatok": []
            }

        # --- TERMÉKVÁLTOZAT (GYEREK) SOR ---
        elif aktualis_gyujto is not None and jellemzo_ertek:
            ertekek = [e.strip() for e in jellemzo_ertek.split(",") if e.strip()]

            valtozat = {
                "cikkszam": clean_val(row["Cikkszám"]),
                "jellemzo_ertekek": ertekek,
                "egyedi_ar": clean_val(row["Nettó Ár"]),
                "egyedi_kep": clean_val(row["Kép"])
            }
            aktualis_gyujto["valtozatok"].append(valtozat)

    if aktualis_gyujto:
        feldolgozando_lista.append(aktualis_gyujto)

    return feldolgozando_lista


# ==============================================================================
# --- 2. LÉPÉS: Segédfüggvények ---
# ==============================================================================
def biztonsagos_navigacio(page, url, max_proba=3):
    for proba in range(1, max_proba + 1):
        try:
            page.goto(url, timeout=60000, wait_until="domcontentloaded")
            return True
        except Exception as e:
            print(f"   ⚠️ Navigációs hiba ({proba}/{max_proba}): {str(e).splitlines()[0]}")
            if proba < max_proba:
                print(f"   🔄 Újrapróbálás 3 mp múlva...")
                time.sleep(3)
    print("   ❌ Navigáció végleges hiba.")
    return False


def termek_megkereses(page, cikkszam, marka, nev):
    van_cikkszam = cikkszam and cikkszam.lower() != 'nan'
    biztonsagos_nev = nev
    if not van_cikkszam:
        biztonsagos_nev = re.split(r'["°=]', nev)[0].strip()

    keresendo = cikkszam if van_cikkszam else biztonsagos_nev
    sf = page.locator("#searchField_all")
    sf.wait_for(state="visible", timeout=10000)
    time.sleep(0.5)
    sf.fill(keresendo)
    sf.press("Enter")
    time.sleep(1.5)

    sorok = page.locator("tbody tr").filter(has_text=cikkszam if van_cikkszam else biztonsagos_nev)
    sorok.first.wait_for(timeout=10000)
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
    if marka.lower() != 'nan':
        szurt = szurt.filter(has_text=marka)

    van_nev = nev and nev.lower() != 'nan'
    if van_nev:
        szurt = szurt.filter(has_text=nev)

    szurt_db = szurt.count()

    if szurt_db == 1:
        return szurt.first
    if szurt_db > 1 and van_nev:
        pontos_n = szurt.filter(has=page.get_by_text(nev, exact=True))
        if pontos_n.count() == 1:
            return pontos_n.first
        raise Exception("DUPLIKÁCIÓ: Név és márka alapján is több azonos sor van.")
    if szurt_db > 1:
        raise Exception("DUPLIKÁCIÓ: Több találat maradt, de nincs Név a döntéshez.")

    raise Exception("A szűkítés után egyetlen termék sem maradt!")


def stabil_kategoria_valasztas(page, input_locator, dropdown_locator, kategoria_nev):
    cel_nev = kategoria_nev.strip()
    gepelendo = cel_nev.split(',')[0].strip()
    try:
        input_locator.click(timeout=5000)
        input_locator.fill("")
        time.sleep(0.5)
        input_locator.press_sequentially(gepelendo, delay=60)
        dropdown_locator.wait_for(state="visible", timeout=8000)
        time.sleep(1.5)

        opciok = dropdown_locator.locator("div.option").all()
        if not opciok:
            print(f"   ⛔ Nincs találat a legördülőben: '{cel_nev}'")
            input_locator.press("Escape")
            return False

        for opcio in opciok:
            tiszta = re.sub(r'^[- \t\xa0]+', '', opcio.inner_text()).strip()
            if tiszta.lower() == cel_nev.lower():
                print(f"      ✅ Kategória megvan: '{tiszta}'")
                opcio.click(force=True)
                time.sleep(0.5)
                return True

        print(f"   ⚠️ Nincs pontos egyezés: '{cel_nev}'")
        input_locator.press("Escape")
        return False
    except Exception as e:
        print(f"   ❌ Kategória választási hiba: {e}")
        try:
            input_locator.press("Escape")
        except:
            pass
        return False


# ==============================================================================
# --- 3. LÉPÉS: GYŰJTŐ ÉS VÁLTOZAT LOGIKA ---
# ==============================================================================
def gyujto_termek_letrehozasa(page, base_url, termek_adatok):
    print(f"\n📦 Új gyűjtő termék létrehozása: {termek_adatok['nev']}")

    if not biztonsagos_navigacio(page, f"{base_url}/administrator/index.php?view=product&new&collector=-1"):
        raise Exception("Nem sikerült megnyitni a gyűjtő létrehozó oldalt.")
    time.sleep(1)

    page.locator("#name").fill(termek_adatok["nev"])

    marka = termek_adatok["marka"]
    if marka:
        marka_input = page.locator("div.selectize-control.brand input[type='text']")
        marka_dropdown = page.locator("div.selectize-dropdown.brand")
        stabil_kategoria_valasztas(page, marka_input, marka_dropdown, marka)

    kat_input = page.locator("div.selectize-control.categories input[type='text']")
    kat_dropdown = page.locator("div.selectize-dropdown.categories")
    for kat in termek_adatok["kategoriak"]:
        stabil_kategoria_valasztas(page, kat_input, kat_dropdown, kat)

    leiras = termek_adatok["leiras"]
    if leiras:
        page.locator("label[for='leirasok']").click(force=True)
        time.sleep(1)
        js_code = f"CKEDITOR.instances.description.setData(`{leiras}`)"
        page.evaluate(js_code)

    alapar = termek_adatok["alapar"]
    if alapar:
        try:
            page.locator("label[for='price1']").click(force=True)
            page.locator("#netto").fill(alapar)
            page.locator("#brutto").click()
        except:
            print("   ⚠️ Nem találtam a nettó ár mezőt a gyűjtőnél.")

    page.locator("label[for='altalanos']").click(force=True)
    time.sleep(0.5)

    for i, jellemzo_nev in enumerate(termek_adatok["jellemzo_nevek"]):
        page.locator("#addProperty").click()
        time.sleep(0.5)
        utolso_jellemzo_input = page.locator("table#propertiesTable tbody tr").last.locator("input[type='text']")
        utolso_jellemzo_input.fill(jellemzo_nev)

    print("   💾 Gyűjtő termék mentése...")
    page.evaluate("saveProduct('save')")
    page.wait_for_load_state("networkidle")
    time.sleep(4)

    try:
        szulo_id = page.locator("input[name='id']").input_value()
        if not szulo_id or szulo_id == "new":
            raise Exception("A mentés után nem kaptunk érvényes ID-t.")
        print(f"   ✅ Gyűjtő létrehozva. ID: {szulo_id}")
        return szulo_id
    except Exception as e:
        print(f"   ❌ Nem sikerült kinyerni a szülő ID-t: {e}")
        return None


def valtozatok_letrehozasa(page, base_url, szulo_id, valtozatok, jellemzo_nevek):
    if not szulo_id:
        return

    for i, valtozat in enumerate(valtozatok):
        print(f"   ↳ {i + 1}. Változat létrehozása: {valtozat['cikkszam']}")

        url = f"{base_url}/administrator/index.php?view=product&new&collector={szulo_id}"
        if not biztonsagos_navigacio(page, url):
            print(f"      ❌ Változat hiba: Nem töltött be az oldal.")
            continue
        time.sleep(1)

        if valtozat['cikkszam']:
            page.locator("#sku").fill(valtozat['cikkszam'])

        for idx, ertek in enumerate(valtozat['jellemzo_ertekek']):
            sor_index = idx + 1
            input_locator = page.locator(f"#property_value_{sor_index}")
            if input_locator.is_visible():
                input_locator.fill(ertek)
            else:
                print(f"      ⚠️ Jellemző input nem található: {ertek}")

        if valtozat['egyedi_ar']:
            try:
                page.locator("label[for='price1']").click(force=True)
                page.locator("#netto").fill(valtozat['egyedi_ar'])
                page.locator("#brutto").click()
            except:
                pass

        if valtozat['egyedi_kep']:
            print(
                f"      ℹ️ (A képek automatikus feltöltése a JS ablakok miatt egyelőre manuális figyelmet igényelhet)")

        page.evaluate("saveProduct('save')")
        page.wait_for_load_state("networkidle")
        time.sleep(2.5)

    print(f"   ✅ Minden változat hozzáadva a gyűjtőhöz.")


# ==============================================================================
# --- 4. LÉPÉS: Processzorok (SIMA vs GYŰJTŐ) ---
# ==============================================================================
def kategoriak_feldolgozasa(page, mod, kategoriak):
    if mod == "kategorizalo":
        kategorizalo_gomb = page.locator("a:has-text('A termék kategorizálása')")
        try:
            kategorizalo_gomb.wait_for(state="visible", timeout=3000)
            if not kategorizalo_gomb.is_visible():
                return
        except:
            return

        kategorizalo_gomb.click()
        popup = page.locator("#popup")
        popup.wait_for(timeout=10000)
        time.sleep(1)

        popup_input = popup.locator("div.selectize-control.categories input[type='text']")
        dropdown = page.locator("div.selectize-dropdown.categories")

        for kat in kategoriak:
            stabil_kategoria_valasztas(page, popup_input, dropdown, kat)

        popup.locator("div.pure-button:has-text('Hozzáadás a választott kategóriákhoz')").click()
        popup.wait_for(state="hidden", timeout=10000)
        print("   ✅ Kategóriák hozzáadva, popup bezárult.")
        time.sleep(2)

    elif mod == "atkategorizalo":
        page.locator("div.selectize-control.categories").wait_for(state="visible", timeout=5000)
        time.sleep(1.5)

        for _ in range(50):
            torles = page.locator("div.selectize-control.categories div.selectize-input a.remove").first
            if torles.is_visible():
                torles.click(force=True)
                time.sleep(0.3)
            else:
                break

        atkat_input = page.locator("div.selectize-control.categories div.selectize-input input[type='text']").first
        dropdown = page.locator("div.selectize-dropdown.categories").first

        for kat in kategoriak:
            stabil_kategoria_valasztas(page, atkat_input, dropdown, kat)

        page.locator("a#save:has-text('Mentés')").click()
        page.wait_for_load_state("networkidle")
        print("   ✅ Mentés sikeres.")
        time.sleep(2.5)


def run_processor_normal(context: Context, termek_lista, mod, progress_fajl, bemeneti_fajl_neve, base_url):
    start_index, retry_list, _ = _progress_betoltes(progress_fajl)

    if start_index > 0 or retry_list:
        print(f"\n📢 KORÁBBI ÁLLAPOT BETÖLTVE:")
        print(f"   Feldolgozva eddig: {start_index} db")
        print(f"   Javításra vár:     {len(retry_list)} db")

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

    if feldolgozando:
        print(f"\n{'─' * 50}\n 1. KÖR (Sima): {len(feldolgozando)} termék feldolgozása\n{'─' * 50}")
        for i, (cikkszam, marka, nev, eredeti_fejlec, kategoriak) in enumerate(feldolgozando):
            aktualis_sorszam = start_index + i + 1
            keresendo = cikkszam if (cikkszam and cikkszam.lower() != 'nan') else nev
            print(f"\n[{aktualis_sorszam}/{len(termek_lista)}] {keresendo}")

            try:
                if not biztonsagos_navigacio(page, f"{base_url}/administrator/"):
                    raise Exception("Admin oldal nem töltődött be.")
                bizonylatkeszito_nezet(page)
                sor = termek_megkereses(page, cikkszam, marka, nev)
                sor.locator("a[href*='view=product']").click()
                time.sleep(2)
                kategoriak_feldolgozasa(page, mod, kategoriak)
                print(f"   ✅ Sikeresen feldolgozva.")
                sikeres_db += 1
            except Exception as e:
                hiba = str(e)
                print(f"   ❌ HIBA: {hiba}")
                retry_list.append([cikkszam, marka, nev, eredeti_fejlec, kategoriak, hiba])

            _progress_mentes(progress_fajl, aktualis_sorszam, retry_list, mod)

    if retry_list:
        print(f"\n{'─' * 50}\n 2. KÖR (RETRY): {len(retry_list)} db újrapróbálása\n{'─' * 50}")
        feldolgozando_retry = list(retry_list)
        retry_list.clear()

        for i, elem in enumerate(feldolgozando_retry):
            cikkszam, marka, nev, eredeti_fejlec, kategoriak, elozo_hiba = elem
            print(f"\n[{i + 1}/{len(feldolgozando_retry)}] Retry: {cikkszam or nev}")

            if "DUPLIKÁCIÓ" in elozo_hiba.upper():
                print(f"   ⏩ Átugorva: duplikációs hiba.")
                veglegesen_sikertelen.append((cikkszam, marka, nev, eredeti_fejlec, elozo_hiba))
                _progress_mentes(progress_fajl, len(termek_lista), retry_list, mod)
                continue

            try:
                if not biztonsagos_navigacio(page, f"{base_url}/administrator/"):
                    raise Exception("Admin oldal nem töltődött be.")
                bizonylatkeszito_nezet(page)
                sor = termek_megkereses(page, cikkszam, marka, nev)
                sor.locator("a[href*='view=product']").click()
                time.sleep(2)
                kategoriak_feldolgozasa(page, mod, kategoriak)
                print(f"   ✅ Sikeres (2. kör).")
                sikeres_db += 1
            except Exception as e:
                vegleges_hiba = str(e)
                print(f"   ❌ VÉGLEGES HIBA: {vegleges_hiba}")
                veglegesen_sikertelen.append((cikkszam, marka, nev, eredeti_fejlec, vegleges_hiba))

            _progress_mentes(progress_fajl, len(termek_lista), retry_list, mod)

    page.close()
    if not retry_list and os.path.exists(progress_fajl): os.remove(progress_fajl)

    if veglegesen_sikertelen:
        os.makedirs("sikertelen_tablak", exist_ok=True)
        df_err = pd.DataFrame([{"Cikkszám": c, "Név": n, "Márka": m, "Alkategória": e, "Hiba oka": str(h).strip()}
                               for c, m, n, e, h in veglegesen_sikertelen])
        fnev = os.path.join("sikertelen_tablak", f"hiba_{mod}_{datetime.datetime.now().strftime('%Y%m%d_%H%M')}.xlsx")
        df_err.to_excel(fnev, index=False, engine='openpyxl')
        print(f"\n💾 Hibalista mentve: {fnev}")


def run_processor_gyujto(context: Context, termek_lista, mod, progress_fajl, bemeneti_fajl_neve, base_url):
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

    if feldolgozando:
        print(f"\n{'─' * 50}\n 1. KÖR (Gyűjtő): {len(feldolgozando)} gyűjtő feldolgozása\n{'─' * 50}")
        for i, termek in enumerate(feldolgozando):
            aktualis_sorszam = start_index + i + 1
            print(f"\n[{aktualis_sorszam}/{len(termek_lista)}] Gyűjtő: {termek['nev']}")

            try:
                szulo_id = gyujto_termek_letrehozasa(page, base_url, termek)
                if not szulo_id:
                    raise Exception("Nem kaptunk szülő ID-t a mentés után.")

                valtozatok_letrehozasa(page, base_url, szulo_id, termek["valtozatok"], termek["jellemzo_nevek"])

                print(f"   ✅ Teljes gyűjtő struktúra sikeresen létrehozva.")
                sikeres_db += 1
            except Exception as e:
                hiba = str(e)
                print(f"   ❌ HIBA a gyűjtőnél: {hiba}")
                retry_list.append([termek, hiba])

            _progress_mentes(progress_fajl, aktualis_sorszam, retry_list, mod)

    if retry_list:
        print(f"\n{'─' * 50}\n 2. KÖR (RETRY): {len(retry_list)} db újrapróbálása\n{'─' * 50}")
        feldolgozando_retry = list(retry_list)
        retry_list.clear()

        for i, elem in enumerate(feldolgozando_retry):
            termek, elozo_hiba = elem
            print(f"\n[{i + 1}/{len(feldolgozando_retry)}] Retry Gyűjtő: {termek['nev']}")

            try:
                szulo_id = gyujto_termek_letrehozasa(page, base_url, termek)
                if not szulo_id:
                    raise Exception("Nem kaptunk szülő ID-t a mentés után.")
                valtozatok_letrehozasa(page, base_url, szulo_id, termek["valtozatok"], termek["jellemzo_nevek"])
                sikeres_db += 1
            except Exception as e:
                vegleges_hiba = str(e)
                print(f"   ❌ VÉGLEGES HIBA: {vegleges_hiba}")
                veglegesen_sikertelen.append((
                    termek["valtozatok"][0]["cikkszam"] if termek["valtozatok"] else "",
                    termek["marka"], termek["nev"], ", ".join(termek["kategoriak"]), vegleges_hiba
                ))

            _progress_mentes(progress_fajl, len(termek_lista), retry_list, mod)

    page.close()
    if not retry_list and os.path.exists(progress_fajl): os.remove(progress_fajl)

    if veglegesen_sikertelen:
        os.makedirs("sikertelen_tablak", exist_ok=True)
        df_err = pd.DataFrame([{"Cikkszám": c, "Név": n, "Márka": m, "Alkategória": e, "Hiba oka": h}
                               for c, m, n, e, h in veglegesen_sikertelen])
        fnev = os.path.join("sikertelen_tablak", f"hiba_{mod}_{datetime.datetime.now().strftime('%Y%m%d_%H%M')}.xlsx")
        df_err.to_excel(fnev, index=False, engine='openpyxl')


# ==============================================================================
# --- 5. LÉPÉS: Bejelentkezés ---
# ==============================================================================
def bejelentkezes_kezelese(browser: Browser, username, password, base_url, state_fajl="state.json"):
    if os.path.exists(state_fajl):
        print(f"\n   Session betöltése: {state_fajl}")
        try:
            ctx = browser.new_context(storage_state=state_fajl)
            page = ctx.new_page()
            page.goto(f"{base_url}/administrator/", timeout=15000)
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
        page.goto(f"{base_url}/administrator/", timeout=15000)
        page.fill("input[name='username']", username)
        page.fill("input[name='password']", password)
        page.click("button[type='submit']")
        page.locator("#searchField_all").wait_for(timeout=10000)
        ctx.storage_state(path=state_fajl)
        print("   ✅ Bejelentkezés sikeres.")
    except Exception as e:
        print(f"❌ LOGIN HIBA: {e}")
        browser.close()
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
    print(" 📂 EXCEL ALAPÚ KATEGORIZÁLÓ ÉS LÉTREHOZÓ ASSZISZTENS 📂")
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

    if not os.path.exists(FAJLOK_MAPPAJA):
        os.makedirs(FAJLOK_MAPPAJA)
        print(f"📁 '{FAJLOK_MAPPAJA}' mappa létrehozva. Tegyél bele Excel fájlt!")
        sys.exit(1)

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

    progress_fajl = valasztott_path + ".progress.json"

    # ── FŐ MŰVELET KIVÁLASZTÁSA (Sima vs Gyűjtő) ──────────────────────────────
    folytatas = False
    mod = ""
    fo_mod = ""

    if os.path.exists(progress_fajl):
        saved_index, saved_retry, saved_mod = _progress_betoltes(progress_fajl)

        # Determine the flow from saved mod
        if saved_mod == "gyujto_letrehozas":
            fo_mod = "2"
            osszes_termek = len(adatok_beolvasasa_gyujtokhoz(valasztott_path) or [])
            mod_nev = "Gyűjtő termékek és változatok létrehozása"
        else:
            fo_mod = "1"
            osszes_termek = len(adatok_beolvasasa(valasztott_path) or [])
            mod_nev = "Kategorizáló (Hozzáadás)" if saved_mod == "kategorizalo" else "Átkategorizáló (Törlés + Új)"

        print(f"\n⚠️ Korábbi félbemaradt munkamenet találva:")
        print(f"   Feldolgozva: {saved_index} / {osszes_termek} db")
        print(f"   Retry listán: {len(saved_retry)} db")
        print(f"   Mód: {mod_nev}")
        print()
        print("  1: FOLYTATÁS (onnan ahol abbahagyta)")
        print("  2: ÚJRAKEZDÉS (progress törlése, tiszta lap)")

        ujra_v = ""
        while ujra_v not in ["1", "2"]:
            ujra_v = input("Választás (1-2): ").strip()

        if ujra_v == "1":
            folytatas = True
            mod = saved_mod
            print(f"   ⏩ Folytatás. Mód: {mod_nev}")
        else:
            os.remove(progress_fajl)
            print("   🗑️ Progress törölve. Tiszta lappal indulunk.")
            fo_mod = ""  # Resetelünk, hogy újra választhasson

    if not folytatas:
        print("\n--- Fő Művelet Választás ---")
        print("  1: Sima termékek kategorizálása (Meglévőekhez kategória adás/cserélés)")
        print("  2: Gyűjtő termékek és változatok LÉTREHOZÁSA (Új felvitel)")
        while fo_mod not in ["1", "2"]:
            fo_mod = input("Választás (1-2): ").strip()

        if fo_mod == "1":
            print("\n--- Alkategória Mód választás ---")
            print("  1: Kategorizáló     (Hozzáadás a meglévőkhöz)")
            print("  2: Átkategorizáló   (Régi törlése, új kategóriák beállítása)")
            mod_v = ""
            while mod_v not in ["1", "2"]:
                mod_v = input("Választás (1-2): ").strip()
            mod = "kategorizalo" if mod_v == "1" else "atkategorizalo"
            mod_nev = "Kategorizáló (Hozzáadás)" if mod == "kategorizalo" else "Átkategorizáló (Törlés + Új)"
        else:
            mod = "gyujto_letrehozas"
            mod_nev = "Gyűjtő termékek és változatok létrehozása"

        print(f"   Mód rögzítve: {mod_nev}")

    # ── ADATOK BEOLVASÁSA A KIVÁLASZTOTT MÓD ALAPJÁN ─────────────────────────
    if fo_mod == "1":
        termekek = adatok_beolvasasa(valasztott_path)
    else:
        termekek = adatok_beolvasasa_gyujtokhoz(valasztott_path)

    if not termekek:
        sys.exit(1)

    print(f"\n📋 {len(termekek)} elem betöltve az Excel fájlból.")

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=False)  # Headless=False jó lehet debugra, de ha serveren futtatod írd át True-ra
        ctx = bejelentkezes_kezelese(browser, FELHASZNALONEV, JELSZO, BASE_URL, STATE_FAJL)
        if ctx:
            if fo_mod == "1":
                run_processor_normal(ctx, termekek, mod, progress_fajl, valasztott_path, base_url=BASE_URL)
            else:
                run_processor_gyujto(ctx, termekek, mod, progress_fajl, valasztott_path, base_url=BASE_URL)
        browser.close()

    print("\n🎉 Program befejeződött!")