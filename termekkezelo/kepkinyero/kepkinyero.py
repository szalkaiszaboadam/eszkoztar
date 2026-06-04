import os
import re
import random
import requests
import json
from playwright.sync_api import sync_playwright, Browser, BrowserContext as Context
import time
import sys
from dotenv import load_dotenv

import urllib3
urllib3.disable_warnings(urllib3.exceptions.NotOpenSSLWarning)


# ==============================================================================
# --- UTILS & CLEANERS ---
# ==============================================================================
def biztonsagos_oldalbetoltes(page, url, max_probalkozas=3):
    """Megpróbál betölteni egy oldalt. Ha elmegy a net, vár és újrapróbálja."""
    for proba in range(1, max_probalkozas + 1):
        try:
            page.goto(url, timeout=60000)
            time.sleep(2.5)
            return True
        except Exception as e:
            print(f"      ⚠️ Hálózat/Betöltési hiba ({proba}/{max_probalkozas}): {e}")
            if proba < max_probalkozas:
                print("      🔄 Újrapróbálkozás 5 másodperc múlva...")
                time.sleep(5)
            else:
                print("      ❌ Végleges hiba: Nem sikerült betölteni az oldalt.")
                return False


def tiszta_nev(nev):
    return re.sub(r'[\\/*?:"<>|]', "", nev).strip()


def bizonylatkeszito_nezet(page):
    """
    Megvizsgalja, hogy Bizonylatkeszito (mode=2) nezetben van-e az oldal.
    Ha nem, egy kattintassal atvaltja, es megvarja az ujratoltodest.
    Hivd meg minden store-navigacio utan, mielott a tablazatokkal dolgozol.
    """
    try:
        nezet_valto = page.locator("li.modeSwitch[onclick*=\'switchMode(2)\']")
        if nezet_valto.is_visible(timeout=3000):
            print("   \U0001f504 Rossz nezet eszlelve! Bizonylatkeszitore valtas...")
            nezet_valto.click()
            time.sleep(3)
            page.locator("#searchField_all").wait_for(state="visible", timeout=10000)
            print("   \u2705 Bizonylatkeszito nezet aktiv.")
    except Exception:
        pass  # Mar jo nezetben vagyunk, vagy a gomb nem talalhato


# ==============================================================================
# --- STATE MANAGEMENT ---
# Mindhárom fázishoz külön progress fájl van.
# Ha a program bárhol leáll, újraindításkor pontosan onnan folytatja.
# ==============================================================================

def _json_betoltes(progress_file, alapertelmezett):
    """Általános JSON betöltő. Ha a fájl sérült vagy hiányzik, az alapértékkel tér vissza."""
    if os.path.exists(progress_file):
        try:
            with open(progress_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"⚠️ Sérült menetfájl ({progress_file}), alapértékkel indulunk: {e}")
    return alapertelmezett


def _json_mentes(progress_file, adatok):
    """Általános JSON mentő. Atomic write: temp fájlba ír, majd átnevezi."""
    temp_file = progress_file + ".tmp"
    try:
        with open(temp_file, "w", encoding="utf-8") as f:
            json.dump(adatok, f, ensure_ascii=False, indent=2)
        os.replace(temp_file, progress_file)  # Atomi felülírás: nem sérülhet meg crash esetén
    except Exception as e:
        print(f"⚠️ Hiba a menetfájl mentésekor ({progress_file}): {e}")


# 1. FÁZIS - Letöltési progress
def scraper_progress_betoltes(progress_file):
    data = _json_betoltes(progress_file, {"completed_categories": [], "retry_list": []})
    return data.get("completed_categories", []), data.get("retry_list", [])


def scraper_progress_mentes(progress_file, completed_categories, retry_list):
    _json_mentes(progress_file, {
        "completed_categories": completed_categories,
        "retry_list": retry_list
    })


# 2. FÁZIS - Kollázs progress (lista a kész kategória ID-kból)
def kollazs_progress_betoltes(progress_file):
    return _json_betoltes(progress_file, [])


def kollazs_progress_mentes(progress_file, befejezett_kollazsok):
    _json_mentes(progress_file, befejezett_kollazsok)


# 3. FÁZIS - Feltöltési progress (lista a sikeresen feltöltött kategória ID-kból)
def feltoltes_progress_betoltes(progress_file):
    return _json_betoltes(progress_file, [])


def feltoltes_progress_mentes(progress_file, feltoltott_kategoriak):
    _json_mentes(progress_file, feltoltott_kategoriak)


# ==============================================================================
# --- MATH ---
# ==============================================================================
def indexek_kiszamitasa(osszes_termek, kivan_db=10, mod="random"):
    if osszes_termek <= kivan_db:
        return list(range(osszes_termek))
    if mod == "random":
        veletlen_indexek = random.sample(range(osszes_termek), kivan_db)
        veletlen_indexek.sort()
        return veletlen_indexek
    else:
        lepes = (osszes_termek - 1) / (kivan_db - 1)
        return [round(lepes * i) for i in range(kivan_db)]


# ==============================================================================
# --- KÉP-TÉRKÉP REKONSTRUKCIÓ (lemezről, újraindításhoz) ---
# ==============================================================================
def rekurziv_image_map_betoltes(mappa, kat_id_list, current_map):
    """
    Bejárja a kollazs_kepek mappát és feltölti a final_image_map-et
    a lemezen lévő képek alapján. Minden újraindításkor lefut,
    hogy a térkép mindig konzisztens legyen a valósággal.
    """
    if not os.path.exists(mappa):
        return

    kepek = [os.path.join(mappa, f) for f in sorted(os.listdir(mappa))
             if f.lower().endswith(('.jpg', '.jpeg', '.png')) and not f.startswith('_kollazs')]

    if kepek and kat_id_list:
        kat_id = " > ".join(kat_id_list)
        if kat_id in current_map:
            meglevo_abs = set(os.path.abspath(f) for f in current_map[kat_id])
            for f in kepek:
                if os.path.abspath(f) not in meglevo_abs:
                    current_map[kat_id].append(f)
        else:
            current_map[kat_id] = kepek

    for item in sorted(os.listdir(mappa)):
        path = os.path.join(mappa, item)
        if os.path.isdir(path) and not item.startswith('_'):
            rekurziv_image_map_betoltes(path, kat_id_list + [item], current_map)


def kollazs_kesz_e(kat_id):
    """
    Igaz, ha már van _kollazs_*.png fájl a kategória mappájában.
    Ez a fájlrendszer-alapú ellenőrzés működik akkor is, ha a progress
    fájl hiányzik (pl. manuálisan törölték, vagy crash után).
    """
    tiszta_kat_id = kat_id.replace(" (Összesítő)", "")
    kat_utvonal = tiszta_kat_id.split(" > ")
    mappa_path = os.path.join("kollazs_kepek", *[tiszta_nev(p) for p in kat_utvonal])

    if os.path.exists(mappa_path):
        for f in os.listdir(mappa_path):
            if f.startswith("_kollazs") and f.lower().endswith(('.png', '.jpg', '.jpeg')):
                return True
    return False


# ==============================================================================
# --- 1. FÁZIS: LETÖLTÉS ---
# ==============================================================================
def letoltes_vegrehajtasa_fajl_visszaadas(page, p_url, mappa_path, fallback_idx, base_url):
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
                kep_url = "https:" + kep_url if kep_url.startswith("//") else base_url + kep_url
            # Kiterjesztes az URL-bol, majd Content-Type alapjan pontositva
            url_ext = os.path.splitext(kep_url.split("?")[0])[1].lower()
            ext = url_ext if url_ext in ('.jpg', '.jpeg', '.png', '.webp') else '.jpg'

            # Letezik-e mar valamelyik formatumban?
            for meglevo_ext in ('.jpg', '.jpeg', '.png', '.webp'):
                meglevo_ut = os.path.join(mappa_path, f"{fajlnev}{meglevo_ext}")
                if os.path.exists(meglevo_ut):
                    print(f"      ⏩ Kép már létezik: {fajlnev}{meglevo_ext}")
                    return meglevo_ut

            response = requests.get(kep_url, stream=True, timeout=10)
            if response.status_code == 200:
                ct = response.headers.get("Content-Type", "")
                if "png" in ct:
                    ext = ".png"
                elif "jpeg" in ct or "jpg" in ct:
                    ext = ".jpg"
                elif "webp" in ct:
                    ext = ".webp"
                fajl_utvonal = os.path.join(mappa_path, f"{fajlnev}{ext}")
                with open(fajl_utvonal, 'wb') as f:
                    for chunk in response.iter_content(1024):
                        f.write(chunk)
                print(f"      ✅ Kép letöltve: {fajlnev}{ext}")
                return fajl_utvonal
            else:
                raise Exception(f"Szerver hiba letöltéskor ({response.status_code}): {kep_url}")
    else:
        print(f"      ⚠️ A {fajlnev} termékhez nincs feltöltve kép.")
        return None


def termek_letolto_fázis1(page, url, kategoria_utvonal, letoltendo_db, eloszlas_mod, progress_file,
                          befejezett_kategoriak, retry_list, base_url):
    """
    Letölti egy levél-kategória képeit.
    - Ha a kategória már befejezett (progress fájl alapján): visszaadja a meglévő fájlokat.
    - Ha egy kép letöltése sikertelen: retry_list-re kerül, nem blokkolja a többit.
    - Ha egy terméknek nincs képe: automatikusan próbál pótló terméket keresni.
    """
    kat_azonosito = " > ".join(kategoria_utvonal)
    tiszta_utvonal = [tiszta_nev(p) for p in kategoria_utvonal]
    mappa_path = os.path.join("kollazs_kepek", *tiszta_utvonal)
    os.makedirs(mappa_path, exist_ok=True)

    if not biztonsagos_oldalbetoltes(page, url):
        return [], []

    try:
        page.goto(url, timeout=60000)
        time.sleep(2.5)
    except:
        return [], []

    termek_sorok = page.locator("table#productsList tbody tr").all()
    osszes_termek = len(termek_sorok)

    osszes_termek_link = []
    for sor in termek_sorok:
        try:
            href = sor.locator("td").nth(2).locator("a").get_attribute("href")
            if href:
                osszes_termek_link.append(f"{base_url}/administrator/" + href)
        except:
            continue

    # Ha ez a kategória már kész: csak visszaadjuk a meglévő fájlokat
    if kat_azonosito in befejezett_kategoriak:
        print(f"   ⏭️ MÁR LETÖLTVE, ÁTUGRÁS: {kat_azonosito}")
        meglevo_fajlok = []
        if os.path.exists(mappa_path):
            for f in os.listdir(mappa_path):
                if f.lower().endswith(('.jpg', '.jpeg', '.png')) and not f.startswith('_kollazs'):
                    meglevo_fajlok.append(os.path.join(mappa_path, f))
        return osszes_termek_link, meglevo_fajlok

    if osszes_termek == 0:
        return [], []

    print(f"   ⚙️ Képek letöltése: {kat_azonosito}")
    cel_indexek = indexek_kiszamitasa(osszes_termek, letoltendo_db, eloszlas_mod)
    kiprobalatlan_indexek = [i for i in range(osszes_termek) if i not in cel_indexek]
    if eloszlas_mod == "random":
        random.shuffle(kiprobalatlan_indexek)

    vonal = [osszes_termek_link[idx] for idx in cel_indexek]
    lokalis_fajlok = []
    szukseges_db = min(letoltendo_db, osszes_termek)
    probalkozas_szam = 0

    while len(lokalis_fajlok) < szukseges_db and vonal:
        p_url = vonal.pop(0)
        probalkozas_szam += 1
        try:
            fajl_ut = letoltes_vegrehajtasa_fajl_visszaadas(page, p_url, mappa_path, probalkozas_szam, base_url)
            if fajl_ut:
                lokalis_fajlok.append(fajl_ut)
            else:
                print("      🔄 Nincs kép, pótlás egy másik termékkel...")
                if kiprobalatlan_indexek:
                    vonal.append(osszes_termek_link[kiprobalatlan_indexek.pop(0)])
        except Exception as e:
            print(f"      ❌ Letöltési hiba: {e} → Retry listára téve, pótlás keres...")
            retry_list.append({
                "kategoria_utvonal": kategoria_utvonal,
                "url": p_url,
                "fallback_idx": probalkozas_szam
            })
            if kiprobalatlan_indexek:
                vonal.append(osszes_termek_link[kiprobalatlan_indexek.pop(0)])

    befejezett_kategoriak.append(kat_azonosito)
    scraper_progress_mentes(progress_file, befejezett_kategoriak, retry_list)
    return osszes_termek_link, lokalis_fajlok


def kategoria_bejaro_fázis1(page, url, kategoria_utvonal, alap_letoltendo_db, eloszlas_mod, progress_file,
                            befejezett_kategoriak, retry_list, letolt_koztes, base_url):
    """Rekurzívan bejárja a kategória-fát és letölti a képeket."""
    print(f"\n📂 Bejárás: {' > '.join(kategoria_utvonal)}")
    image_map = {}

    if not biztonsagos_oldalbetoltes(page, url):
        return 1, [], image_map

    try:
        page.goto(url, timeout=60000)
        time.sleep(2.5)
    except Exception as e:
        print(f"   ❌ Oldal betöltési hiba: {e}")
        return 1, [], image_map

    bizonylatkeszito_nezet(page)
    alkategoriak_vannak = page.locator("table#categoriesList tbody tr").count() > 0
    osszes_osszegujtott_link = []
    max_gyerek_melyseg = 0

    if alkategoriak_vannak:
        rows = page.locator("table#categoriesList tbody tr").all()
        bejarando_linkek = []

        for row in rows:
            try:
                nev_cella = row.locator("td").nth(2)
                cat_nev = nev_cella.inner_text().strip()
                href = nev_cella.locator("a").get_attribute("href")
                alkat_db = int(re.sub(r'\D', '', row.locator("td").nth(7).inner_text()) or 0)
                termek_db = int(re.sub(r'\D', '', row.locator("td").nth(8).inner_text()) or 0)
                if alkat_db > 0 or termek_db > 0:
                    bejarando_linkek.append({
                        "url": f"{base_url}/administrator/" + href,
                        "nev": cat_nev,
                        "alkat_db": alkat_db,
                        "termek_db": termek_db
                    })
            except:
                continue

        for link in bejarando_linkek:
            uj_utvonal = list(kategoria_utvonal) + [link["nev"]]
            if link["alkat_db"] > 0:
                melyseg, gyerek_linkek, gyerek_map = kategoria_bejaro_fázis1(
                    page, link["url"], uj_utvonal, alap_letoltendo_db, eloszlas_mod,
                    progress_file, befejezett_kategoriak, retry_list, letolt_koztes, base_url)
                max_gyerek_melyseg = max(max_gyerek_melyseg, melyseg)
                osszes_osszegujtott_link.extend(gyerek_linkek)
                image_map.update(gyerek_map)
            elif link["termek_db"] > 0:
                gyerek_linkek, lokalis_fajlok = termek_letolto_fázis1(
                    page, link["url"], uj_utvonal, alap_letoltendo_db,
                    eloszlas_mod, progress_file, befejezett_kategoriak, retry_list, base_url)
                max_gyerek_melyseg = max(max_gyerek_melyseg, 1)
                if gyerek_linkek: osszes_osszegujtott_link.extend(gyerek_linkek)
                if lokalis_fajlok: image_map[" > ".join(uj_utvonal)] = lokalis_fajlok

        sajat_melyseg = max_gyerek_melyseg + 1

        # Közvetlen termékek a kategóriában (ha vannak)
        try:
            page.goto(url, timeout=60000)
            time.sleep(2.5)
            if page.locator("table#productsList tbody tr").count() > 0:
                kozvetlen_linkek, kozvetlen_fajlok = termek_letolto_fázis1(
                    page, url, kategoria_utvonal, alap_letoltendo_db, eloszlas_mod,
                    progress_file, befejezett_kategoriak, retry_list, base_url)
                if kozvetlen_linkek: osszes_osszegujtott_link.extend(kozvetlen_linkek)
                if kozvetlen_fajlok:
                    kat_id = " > ".join(kategoria_utvonal)
                    image_map.setdefault(kat_id, []).extend(kozvetlen_fajlok)
        except:
            pass

        egyedi_linkek = list(set(osszes_osszegujtott_link))

        # Összesítő szint letöltése (ha be van kapcsolva)
        if letolt_koztes and egyedi_linkek:
            aktualis_db = alap_letoltendo_db * sajat_melyseg
            tiszta_utvonal = [tiszta_nev(p) for p in kategoria_utvonal]
            mappa_path = os.path.join("kollazs_kepek", *tiszta_utvonal)
            kat_azonosito_full = " > ".join(kategoria_utvonal) + " (Összesítő)"

            if kat_azonosito_full not in befejezett_kategoriak:
                print(f"\n   📦 [Összesítő] Letöltés: {' > '.join(kategoria_utvonal)}")
                os.makedirs(mappa_path, exist_ok=True)

                cel_indexek = indexek_kiszamitasa(len(egyedi_linkek), aktualis_db, eloszlas_mod)
                kiprobalatlan_indexek = [i for i in range(len(egyedi_linkek)) if i not in cel_indexek]
                if eloszlas_mod == "random":
                    random.shuffle(kiprobalatlan_indexek)

                vonal = [egyedi_linkek[idx] for idx in cel_indexek]
                szukseges_db = min(aktualis_db, len(egyedi_linkek))
                lokalis_osszesito_fajlok = []
                prob_idx = 0

                while len(lokalis_osszesito_fajlok) < szukseges_db and vonal:
                    p_url = vonal.pop(0)
                    prob_idx += 1
                    try:
                        fajl_ut = letoltes_vegrehajtasa_fajl_visszaadas(
                            page, p_url, mappa_path, 2000 + prob_idx, base_url)
                        if fajl_ut:
                            lokalis_osszesito_fajlok.append(fajl_ut)
                        else:
                            if kiprobalatlan_indexek:
                                vonal.append(egyedi_linkek[kiprobalatlan_indexek.pop(0)])
                    except Exception as e:
                        print(f"      ❌ [Összesítő] Hiba: {e}")
                        if kiprobalatlan_indexek:
                            vonal.append(egyedi_linkek[kiprobalatlan_indexek.pop(0)])

                if lokalis_osszesito_fajlok:
                    # JAVÍTÁS: Nem rakjuk mögé az "(Összesítő)" szöveget a térképben
                    alap_kat_id = " > ".join(kategoria_utvonal)
                    image_map.setdefault(alap_kat_id, []).extend(lokalis_osszesito_fajlok)
                befejezett_kategoriak.append(kat_azonosito_full)
                scraper_progress_mentes(progress_file, befejezett_kategoriak, retry_list)
            else:
                print(f"   ⏭️ MÁR LETÖLTVE (Összesítő): {kat_azonosito_full}")
                meglevo_fajlok = []
                if os.path.exists(mappa_path):
                    for f in os.listdir(mappa_path):
                        if f.lower().endswith(('.jpg', '.jpeg', '.png')) and not f.startswith('_kollazs'):
                            meglevo_fajlok.append(os.path.join(mappa_path, f))
                if meglevo_fajlok:
                    # JAVÍTÁS ITT IS:
                    alap_kat_id = " > ".join(kategoria_utvonal)
                    image_map.setdefault(alap_kat_id, []).extend(meglevo_fajlok)

        return sajat_melyseg, egyedi_linkek, image_map

    else:
        gyerek_linkek, lokalis_fajlok = termek_letolto_fázis1(
            page, url, kategoria_utvonal, alap_letoltendo_db,
            eloszlas_mod, progress_file, befejezett_kategoriak, retry_list, base_url)
        if lokalis_fajlok:
            image_map[" > ".join(kategoria_utvonal)] = lokalis_fajlok
        return 1, (gyerek_linkek or []), image_map


def letoltes_retry_korök(page, retry_list, final_image_map, befejezett_kategoriak, progress_file, base_url,
                         max_kor=5):
    """
    Újrapróbálja a sikertelen letöltéseket. Maximum max_kor körben fut.
    Minden körben csak az előző körben is sikertelen elemekkel próbálkozik.
    Ha egy elem végül sikerül, bekerül a final_image_map-be.
    """
    aktualis_kor = 2
    while retry_list and aktualis_kor <= max_kor:
        print(f"\n{'─' * 40}")
        print(f" ♻️  {aktualis_kor}. RETRY KÖR: {len(retry_list)} db sikertelen letöltés újrapróbálása")
        print(f"{'─' * 40}")
        uj_retry_list = []

        for item in retry_list:
            try:
                tiszta_utvonal = [tiszta_nev(p) for p in item["kategoria_utvonal"]]
                mappa_path = os.path.join("kollazs_kepek", *tiszta_utvonal)
                os.makedirs(mappa_path, exist_ok=True)

                fajl_ut = letoltes_vegrehajtasa_fajl_visszaadas(
                    page, item["url"], mappa_path, item["fallback_idx"], base_url)

                if fajl_ut:
                    kat_id = " > ".join(item["kategoria_utvonal"])
                    final_image_map.setdefault(kat_id, []).append(fajl_ut)
                    print(f"      ✅ Retry sikeres: {kat_id}")
                else:
                    uj_retry_list.append(item)
            except Exception as e:
                print(f"      ❌ Retry hiba ({aktualis_kor}. kör): {e}")
                uj_retry_list.append(item)

        retry_list.clear()
        retry_list.extend(uj_retry_list)
        scraper_progress_mentes(progress_file, befejezett_kategoriak, retry_list)
        aktualis_kor += 1

        if retry_list and aktualis_kor <= max_kor:
            print(f"   ⏳ Rövid pihenő a következő retry kör előtt...")
            time.sleep(3)

    if retry_list:
        print(f"\n⚠️ {len(retry_list)} db letöltés {max_kor} kör után is sikertelen. Továbblépünk.")
    else:
        print(f"\n✅ Minden retry-elem sikeresen letöltve.")


# ==============================================================================
# --- 2. FÁZIS: INTERAKTÍV KOLLÁZSKÉSZÍTÉS ---
# ==============================================================================
def interaktiv_kollazs_fázis2(ctx: Context, image_map_full, collage_progress_file):
    if not image_map_full:
        print("\n⚠️ Nincs letöltött kép, kollázskészítés átugorva.")
        return

    print("\n" + "=" * 50)
    print(" 🎨 2. FÁZIS: INTERAKTÍV KOLLÁZSKÉSZÍTÉS 🎨")
    print("=" * 50)

    befejezett_kollazsok = kollazs_progress_betoltes(collage_progress_file)

    for kat_id in list(image_map_full.keys()):
        if kat_id not in befejezett_kollazsok and kollazs_kesz_e(kat_id):
            print(f"   🔍 Kollázs lemezen megtalálva (auto-szinkron): {kat_id}")
            befejezett_kollazsok.append(kat_id)

    kollazs_progress_mentes(collage_progress_file, befejezett_kollazsok)

    meg_hianyzok = [k for k in image_map_full.keys() if k not in befejezett_kollazsok]
    if not meg_hianyzok:
        print("\n✅ Minden kollázs már kész! Fázis átugorva.")
        return

    print(f"\n   Kész: {len(befejezett_kollazsok)} db  |  Hiányzik: {len(meg_hianyzok)} db")

    page = ctx.new_page()

    try:
        page.goto("https://eszkoztar.vercel.app/kollazskeszito/", timeout=60000)
        time.sleep(1)

        for kat_id, fajl_list in image_map_full.items():
            if kat_id in befejezett_kollazsok:
                continue

            print(f"\n🎨 Kollázs: {kat_id} ({len(fajl_list)} kép)")

            tiszta_kat_id = kat_id.replace(" (Összesítő)", "")
            kat_utvonal = tiszta_kat_id.split(" > ")
            mappa_path = os.path.join("kollazs_kepek", *[tiszta_nev(p) for p in kat_utvonal])

            abs_fajlok = [os.path.abspath(f) for f in fajl_list if os.path.exists(f)]
            if not abs_fajlok:
                print(f"   ⚠️ Nem találhatók a képek a lemezen, átugrás.")
                continue

            try:
                page.evaluate("""() => {
                    const theme = localStorage.getItem('kp-theme');
                    localStorage.clear(); sessionStorage.clear();
                    if (theme) localStorage.setItem('kp-theme', theme);
                    if (window.indexedDB?.databases) {
                        window.indexedDB.databases().then(dbs =>
                            dbs.forEach(db => window.indexedDB.deleteDatabase(db.name))
                        ).catch(() => {});
                    }
                }""")
                page.reload()
                time.sleep(1.5)

                page.evaluate("""() => {
                    document.documentElement.setAttribute('data-theme', 'light');
                    localStorage.setItem('kp-theme', 'light');
                    const li = document.getElementById('themeIconLight');
                    const di = document.getElementById('themeIconDark');
                    if (li) li.style.display = 'none';
                    if (di) di.style.display = 'block';
                }""")
                time.sleep(0.5)

                file_input = page.locator('input[type="file"]').first
                file_input.wait_for(state="attached", timeout=5000)
                file_input.set_input_files(abs_fajlok)
                print("   ✔️ Képek betöltve.")
            except Exception as e:
                print(f"   ⚠️ Auto-feltöltési hiba: {e}. Húzd be kézzel a képeket.")

            osszes_kollazs = len(image_map_full)
            kesz_kollazs = len(befejezett_kollazsok)
            hatralevo = max(0, osszes_kollazs - kesz_kollazs - 1)

            header_js = f"""() => {{
                const oldHeader = document.getElementById('bot-header');
                if (oldHeader) oldHeader.remove();

                const h = document.createElement('div');
                h.id = 'bot-header';
                Object.assign(h.style, {{
                    position: 'fixed', bottom: '0', left: '0', width: '100%',
                    background: 'rgba(44, 62, 80, 0.85)', color: '#ecf0f1',
                    zIndex: '999999', padding: '12px 25px',
                    fontFamily: 'Arial, sans-serif', boxShadow: '0 -4px 15px rgba(0,0,0,0.3)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    boxSizing: 'border-box', backdropFilter: 'blur(5px)'
                }});

                h.innerHTML = `
                    <div style="font-size: 15px; flex: 1;">
                        <span style="opacity: 0.7;">Aktuális kategória:</span>
                        <strong style="font-size: 17px; margin-left: 8px; color: #fff;">{kat_id}</strong>
                    </div>
                    <div style="font-size: 15px; font-weight: bold; color: #f1c40f; flex: 1; text-align: center;">
                        ⏳ Rendezd el, majd kattints a "Letöltés" gombra!
                    </div>
                    <div style="font-size: 14px; flex: 1; text-align: right;">
                        Kész: <b style="color: #fff;">{kesz_kollazs} / {osszes_kollazs}</b>
                        <span style="opacity: 0.7; margin-left: 15px;">Hátralévő: {hatralevo} db</span>
                    </div>
                `;
                document.body.appendChild(h);
            }}"""
            page.evaluate(header_js)

            print("   ⏳ Rendezd el, majd mentsd le a kollázst!")

            # --- ITT TÖRTÉNIK A VARÁZSLAT ---
            # A program itt teljesen megáll és vár, amíg a böngészőben el nem indítasz egy letöltést
            download = page.wait_for_event("download", timeout=0)

            # Amint rányomtál a letöltésre, a kód azonnal folytatódik: elmentjük a fájlt
            vegso_fajl = os.path.join(mappa_path, f"_kollazs_kesz_{int(time.time())}.png")
            download.save_as(vegso_fajl)
            print(f"   📥 KOLLÁZS ELMENTVE: {vegso_fajl}")

            # Zöld sávos vizuális megerősítés
            page.evaluate("""() => {
                const h = document.getElementById('bot-header');
                if(h) {
                    h.style.background = 'rgba(39, 174, 96, 0.95)';
                    h.innerHTML = '<div style="width: 100%; text-align: center; font-size: 16px; font-weight: bold; color: white;">✅ Sikeresen lementve! Mindjárt jön a következő...</div>';
                }
            }""")

            time.sleep(2.5)  # Kényelmes szünet, mielőtt töröl és betölti az újat

            befejezett_kollazsok.append(kat_id)
            kollazs_progress_mentes(collage_progress_file, befejezett_kollazsok)

    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"\n❌ Hiba a kollázs fázisban: {e}")
    finally:
        page.close()
        if len(befejezett_kollazsok) >= len(image_map_full) and os.path.exists(collage_progress_file):
            os.remove(collage_progress_file)
            print("\n🗑️ Kollázs menetfájl törölve (minden kész).")

# ==============================================================================
# --- 3. FÁZIS: FELTÖLTÉS ---
# Teljes crash-recovery: minden sikeres feltöltés után menti a progress-t.
# Újraindításkor kihagyja a már feltöltött kategóriákat.
# Sikertelen feltöltések esetén max 3 körben újrapróbálkozik.
# ==============================================================================
def feltoltes_falis3(ctx: Context, image_map_full, base_url, upload_progress_file):
    print("\n" + "=" * 50)
    print(" 🚀 3. FÁZIS: KÉSZ KOLLÁZSOK FELTÖLTÉSE 🚀")
    print("=" * 50)

    # Már feltöltött kategóriák betöltése (crash-recovery)
    mar_feltoltott = feltoltes_progress_betoltes(upload_progress_file)
    if mar_feltoltott:
        print(f"   ℹ️ {len(mar_feltoltott)} db kategória már fel van töltve (korábbi menetből), ezeket kihagyjuk.")

    # Feltöltendő kollázsok összegyűjtése a lemezről
    feltoltendo_kollazsok = {}
    for kat_id in image_map_full.keys():
        tiszta_kat_id = kat_id.replace(" (Összesítő)", "")
        if tiszta_kat_id in mar_feltoltott:
            print(f"   ⏭️ MÁR FELTÖLTVE, ÁTUGRÁS: {tiszta_kat_id}")
            continue

        kat_utvonal = tiszta_kat_id.split(" > ")
        mappa_path = os.path.join("kollazs_kepek", *[tiszta_nev(p) for p in kat_utvonal])
        if os.path.exists(mappa_path):
            for f in sorted(os.listdir(mappa_path)):
                if f.startswith("_kollazs") and f.lower().endswith(('.png', '.jpg', '.jpeg')):
                    feltoltendo_kollazsok[tiszta_kat_id] = os.path.abspath(os.path.join(mappa_path, f))
                    break

    if not feltoltendo_kollazsok:
        print("✅ Nincs feltöltendő kollázs (vagy mind fel van töltve már).")
        return

    print(f"\nFeltöltendő: {len(feltoltendo_kollazsok)} db kategória")

    page = ctx.new_page()
    max_feltoltesi_kor = 3
    aktualis_kor = 1

    while feltoltendo_kollazsok and aktualis_kor <= max_feltoltesi_kor:
        print(f"\n{'─' * 40}")
        print(f" 🔄 {aktualis_kor}. FELTÖLTÉSI KÖR ({len(feltoltendo_kollazsok)} db maradt)")
        print(f"{'─' * 40}")
        sikertelen_kollazsok = {}

        for kat_id, file_path in feltoltendo_kollazsok.items():
            print(f"\n🔼 Feltöltés: {kat_id}")
            kat_utvonal = [p.strip() for p in kat_id.split(" > ")]

            try:
                page.goto(f"{base_url}/administrator/index.php?view=store", timeout=30000)
                time.sleep(2)
                bizonylatkeszito_nezet(page)

                sikeres_navigacio = True
                for i, part in enumerate(kat_utvonal):
                    asztal = page.locator("table#categoriesList:not(.fixedHeader)").first
                    sor = asztal.locator("tbody tr", has=page.locator(f"b:has-text('{part}')")).first

                    if sor.count() == 0:
                        print(f"   ❌ Kategória nem található: '{part}' → következő körre halasztva")
                        sikeres_navigacio = False
                        break

                    if i == len(kat_utvonal) - 1:
                        sor.locator("a.btn.btn-default:has-text('Szerkesztés')").first.click()
                        time.sleep(2)
                    else:
                        sor.locator(f"a:has(b:has-text('{part}'))").first.click()
                        time.sleep(2)

                if not sikeres_navigacio:
                    sikertelen_kollazsok[kat_id] = file_path
                    continue

                # Képek fül
                page.locator("label[for='kepek']").wait_for(state="visible", timeout=10000)
                page.locator("label[for='kepek']").click()
                time.sleep(1.5)

                # Meglévő képek törlése
                def handle_dialog(dialog):
                    try: dialog.accept()
                    except: pass

                page.on("dialog", handle_dialog)
                torles_gombok = page.locator("ul#categoryImages li div.deleteImage")
                while torles_gombok.count() > 0:
                    torles_gombok.first.click(force=True)
                    time.sleep(1.5)
                page.remove_listener("dialog", handle_dialog)

                # Kollázs feltöltése
                page.locator("input#newImage").set_input_files(file_path)
                print("   ⏳ Feltöltés folyamatban...")
                time.sleep(5)

                # Mentés
                page.locator("a#save_close").wait_for(state="visible", timeout=15000)
                page.locator("a#save_close").click(force=True)

                print("   ⏳ Kép feltöltése és mentése (ez lassú neten eltarthat egy darabig)...")

                # Kivettük a belső try-exceptet!
                # Felemeltük a várakozást 90 másodpercre. Ha ezen belül sem végez,
                # akkor szabályosan hibára fut, és a program újra fogja próbálni a következő körben.
                page.wait_for_url(lambda url: "view=store" in url, timeout=90000)

                # Megvárjuk, hogy az átirányítás után a táblázat tényleg betöltsön
                page.locator("table#categoriesList:not(.fixedHeader)").first.wait_for(state="visible", timeout=15000)

                # ✅ SIKER: mentjük a progress fájlba, hogy crash esetén ne töltse fel újra
                mar_feltoltott.append(kat_id)
                feltoltes_progress_mentes(upload_progress_file, mar_feltoltott)
                print(f"   ✅ Sikeresen feltöltve: {kat_id}")

            except Exception as e:
                print(f"   ❌ Feltöltési hiba ({kat_id}): {e} → Következő körre halasztva")
                sikertelen_kollazsok[kat_id] = file_path

        feltoltendo_kollazsok = sikertelen_kollazsok
        aktualis_kor += 1

        if feltoltendo_kollazsok and aktualis_kor <= max_feltoltesi_kor:
            print(f"\n⏳ Pihenő a következő feltöltési kör előtt...")
            time.sleep(3)

    if feltoltendo_kollazsok:
        print(f"\n⚠️ {len(feltoltendo_kollazsok)} db {max_feltoltesi_kor} kör után is sikertelen. Kézi javítás szükséges.")
    else:
        # Minden sikeres: progress fájl törölhető
        if os.path.exists(upload_progress_file):
            os.remove(upload_progress_file)
            print("\n🗑️ Feltöltési menetfájl törölve (minden kész).")

    page.close()
    print("\n✅ Feltöltési fázis lezárva.")


# ==============================================================================
# --- BEJELENTKEZÉS ---
# ==============================================================================
def bejelentkezes_kezelese(browser: Browser, username, password, base_url, state_fajl="state.json"):
    if os.path.exists(state_fajl):
        print(f"\nMeglévő session betöltése ({state_fajl}).")
        try:
            ctx = browser.new_context(storage_state=state_fajl, no_viewport=True, color_scheme='light')
            p = ctx.new_page()
            p.goto(f"{base_url}/administrator/index.php?view=store", timeout=15000)
            p.locator("#searchField_all").wait_for(timeout=5000)
            p.close()
            return ctx
        except:
            print("❌ Érvénytelen session, új login szükséges...")

    ctx = browser.new_context(no_viewport=True, color_scheme='light')
    page = ctx.new_page()
    try:
        page.goto(f"{base_url}/administrator/", timeout=15000)
        page.fill("input[name='username']", username)
        page.fill("input[name='password']", password)
        page.click("button[type='submit']")
        page.locator("#searchField_all").wait_for(timeout=10000)
        print("✅ Belépés sikeres.")
        ctx.storage_state(path=state_fajl)
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

    print("\n" + "=" * 50)
    print(" 📸 KÉP-SCRAPER ÉS KOLLÁZS ASSZISZTENS 📸")
    print("=" * 50)

    print("\n--- Melyik webshopot szeretnéd használni? ---")
    print("  1: SZVG Tools (szvgtoolsshop.hu)")
    print("  2: PTD Bolt (ptdbolt.hu)")
    shop_valasz = ""
    while shop_valasz not in ["1", "2"]:
        shop_valasz = input("Választás (1-2): ").strip()

    if shop_valasz == '1':
        F_NEV = os.environ.get("SZVG_USERNAME")
        J_SZO = os.environ.get("SZVG_PASSWORD")
        BASE_URL = "https://szvgtoolsshop.hu"
        STATE_F = "state_szvg.json"
    else:
        F_NEV = os.environ.get("PTD_USERNAME")
        J_SZO = os.environ.get("PTD_PASSWORD")
        BASE_URL = "https://ptdbolt.hu"
        STATE_F = "state_ptd.json"

    if not F_NEV or not J_SZO:
        print(f"\n❌ HIBA: Hiányoznak a bejelentkezési adatok a .env fájlból!")
        sys.exit(1)

    fokategoria = input("\nFőkategória PONTOS neve (pl. INGCO termékek): ").strip()

    clean_fokat = tiszta_nev(fokategoria)
    # Progress fájlok — mindhárom fázishoz külön
    scr_prog_f  = f"progress_1_letoltes_{clean_fokat}.json"
    coll_prog_f = f"progress_2_kollazs_{clean_fokat}.json"
    upl_prog_f  = f"progress_3_feltoltes_{clean_fokat}.json"

    # ─────────────────────────────────────────────────────────────────────────
    # INDULÁSKOR: automatikusan felismerjük a jelenlegi állapotot
    # ─────────────────────────────────────────────────────────────────────────
    kepek_vannak = os.path.exists("kollazs_kepek") and any(
        f.lower().endswith(('.jpg', '.jpeg', '.png')) and not f.startswith('_kollazs')
        for _, _, files in os.walk("kollazs_kepek")
        for f in files
    )
    kollazsok_vannak = os.path.exists("kollazs_kepek") and any(
        f.startswith('_kollazs') and f.lower().endswith('.png')
        for _, _, files in os.walk("kollazs_kepek")
        for f in files
    )

    letoltes_szukseges = True
    kollazs_szukseges  = True
    feltoltes_azonnali = False

    kivan_db = 10
    kivalasztott_mod = "random"

    # Scope-hiba fix: mindig definiáljuk a változókat
    befejezett_kategoriak, retry_list = scraper_progress_betoltes(scr_prog_f)

    elso_indit = not kepek_vannak and not os.path.exists(scr_prog_f)

    if not elso_indit:
        print(f"\n⚠️  Korábbi munkamenet nyomait találtam ('{fokategoria}'):")
        print(f"   Letöltött képek:  {'✅ MEGVAN' if kepek_vannak else '❌ NINCS'}")
        print(f"   Kész kollázsok:   {'✅ VAN' if kollazsok_vannak else '❌ NINCS'}")
        print(f"   Letöltési progress fájl:  {'✅' if os.path.exists(scr_prog_f) else '—'}")
        print(f"   Kollázs progress fájl:    {'✅' if os.path.exists(coll_prog_f) else '—'}")
        print(f"   Feltöltési progress fájl: {'✅' if os.path.exists(upl_prog_f) else '—'}")
        print()
        print("  1: Folytatás a LETÖLTÉSTŐL (kész képeket kihagyja)")
        print("  2: Ugrás a KOLLÁZSOKHOZ (letöltés már teljesen kész)")
        print("  3: Ugrás a FELTÖLTÉSHEZ (kollázsok is el vannak készítve)")
        print("  4: ÚJRAKEZDÉS (menetfájlok törlése, képek MEGMARADNAK)")

        valasz = ""
        while valasz not in ["1", "2", "3", "4"]:
            valasz = input("Választás (1-4): ").strip()

        if valasz == "1":
            letoltes_szukseges = True
            kollazs_szukseges  = True
        elif valasz == "2":
            letoltes_szukseges = False
            kollazs_szukseges  = True
        elif valasz == "3":
            letoltes_szukseges  = False
            kollazs_szukseges   = False
            feltoltes_azonnali  = True
        else:
            for f in [scr_prog_f, coll_prog_f, upl_prog_f]:
                if os.path.exists(f):
                    os.remove(f)
            befejezett_kategoriak, retry_list = [], []
            print("   🗑️ Menetfájlok törölve. Képek megmaradtak.")

    if elso_indit or (not elso_indit and "valasz" in dir() and valasz == "4") or elso_indit:
        db_input = input("\nMax hány képet letölteni alap kategóriánként? (Alap: 10): ").strip()
        kivan_db = int(db_input) if db_input.isdigit() else 10
        print("\n--- Letöltési mód ---")
        print("  1: Véletlenszerű (ajánlott)  2: Arányos")
        mod_v = input("Választás (1-2): ").strip()
        kivalasztott_mod = "random" if mod_v != "2" else "even"

    letolt_koztes = True
    final_image_map = {}

    # ══════════════════════════════════════════════════════════════════════════
    # 1. FÁZIS: LETÖLTÉS
    # ══════════════════════════════════════════════════════════════════════════
    if letoltes_szukseges:
        print("\n" + "=" * 50)
        print(" ⚙️  1. FÁZIS: KÉPEK LETÖLTÉSE (headless) ⚙️")
        print("=" * 50)
        if befejezett_kategoriak:
            print(f"   Folytatás: {len(befejezett_kategoriak)} kész, {len(retry_list)} retry-elem")

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, args=['--start-maximized'])
            ctx = bejelentkezes_kezelese(browser, F_NEV, J_SZO, BASE_URL, STATE_F)

            if ctx:
                page = ctx.new_page()
                try:
                    page.goto(f"{BASE_URL}/administrator/index.php?view=store", timeout=60000)
                    bizonylatkeszito_nezet(page)
                    cel_sor = page.locator(
                        f"table#categoriesList tbody tr td a b:has-text('{fokategoria}')").first

                    if cel_sor.count() > 0:
                        kezdo_link = cel_sor.locator("..").get_attribute("href")
                        full_kezdo_link = f"{BASE_URL}/administrator/" + kezdo_link
                        print(f"✅ Főkategória megtalálva. Indulás...\n")

                        _, _, final_image_map = kategoria_bejaro_fázis1(
                            page, full_kezdo_link, [fokategoria], kivan_db,
                            kivalasztott_mod, scr_prog_f,
                            befejezett_kategoriak, retry_list, letolt_koztes, BASE_URL)

                        # Retry körök a sikertelen letöltésekhez
                        if retry_list:
                            letoltes_retry_korök(
                                page, retry_list, final_image_map,
                                befejezett_kategoriak, scr_prog_f, BASE_URL, max_kor=5)

                        print("\n✅ 1. Fázis befejezve.")
                    else:
                        print(f"❌ Főkategória nem található: '{fokategoria}'")
                        browser.close()
                        sys.exit(1)

                except Exception as e:
                    import traceback
                    traceback.print_exc()
                    print(f"\n⚠️ Hiba az 1. fázisban: {e}")
                    print("💡 A progress el van mentve, folytasd az újraindítás után (1-es opció).")
                    browser.close()
                    sys.exit(1)
                finally:
                    page.close()
            browser.close()

    # ══════════════════════════════════════════════════════════════════════════
    # LEMEZ-SZINKRON: minden fázis között frissítjük a final_image_map-et.
    # Ha a letöltési fázis során nem minden kerül be (pl. crash), a lemez
    # alapján mindig teljes képet kapunk.
    # ══════════════════════════════════════════════════════════════════════════
    if os.path.exists("kollazs_kepek"):
        print("\n🔄 Kép-térkép szinkronizálása a lemezzel...")
        rekurziv_image_map_betoltes("kollazs_kepek", [], final_image_map)
        print(f"   ✅ {len(final_image_map)} kategória betöltve.")
    else:
        print("\n⚠️ Nincs 'kollazs_kepek' mappa — a letöltési fázis még nem futott?")

    if not final_image_map:
        print("❌ Nem találtam képet. Ellenőrizd a kollazs_kepek mappát!")
        sys.exit(1)

    # ══════════════════════════════════════════════════════════════════════════
    # 2. FÁZIS: KOLLÁZSKÉSZÍTÉS
    # ══════════════════════════════════════════════════════════════════════════
    if not feltoltes_azonnali and kollazs_szukseges:
        kollazs_valasz = input("\n🎨 Szeretnéd most elkészíteni/folytatni a kollázsokat? (i/n): ").strip().lower()

        if kollazs_valasz == 'i':
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=False, args=['--start-maximized'])
                ctx = browser.new_context(no_viewport=True)
                interaktiv_kollazs_fázis2(ctx, final_image_map, coll_prog_f)
                browser.close()

            # Ha a scraper progress fájl megvan, de a kollázs már kész → törölhető
            if os.path.exists(scr_prog_f) and not os.path.exists(coll_prog_f):
                os.remove(scr_prog_f)
                print("🗑️ Letöltési menetfájl törölve.")
        else:
            print("\n⏭️ Kollázskészítés kihagyva.")

    # ══════════════════════════════════════════════════════════════════════════
    # 3. FÁZIS: FELTÖLTÉS
    # ══════════════════════════════════════════════════════════════════════════
    feltoltes_valasz = input("\n🚀 Szeretnéd feltölteni a kész kollázsokat a webshopba? (i/n): ").strip().lower()

    if feltoltes_valasz == 'i':
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, args=['--start-maximized'])
            ctx = bejelentkezes_kezelese(browser, F_NEV, J_SZO, BASE_URL, STATE_F)
            if ctx:
                feltoltes_falis3(ctx, final_image_map, BASE_URL, upl_prog_f)
            browser.close()
    else:
        print("\n⏭️ Feltöltés kihagyva.")

    print("\n🎉 Program befejeződött!")