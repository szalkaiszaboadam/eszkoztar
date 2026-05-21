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

import urllib3

urllib3.disable_warnings(urllib3.exceptions.NotOpenSSLWarning)


# --- UTILS & CLEANERS ---
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


# --- STATE MANAGEMENT (Simplified for Collage Phase) ---
def allapot_betoltese_egyszeru(progress_file):
    if os.path.exists(progress_file):
        try:
            with open(progress_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except:
            pass
    return []


def allapot_mentese_egyszeru(progress_file, adatok):
    try:
        with open(progress_file, "w", encoding="utf-8") as f:
            json.dump(adatok, f, ensure_ascii=False, indent=2)
    except:
        pass


# --- LEGACY STATE MANAGEMENT (For Scraper Phase) ---
def allapot_betoltese_scraper(progress_file):
    if os.path.exists(progress_file):
        try:
            with open(progress_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data.get("completed_categories", []), data.get("retry_list", [])
        except Exception as e:
            print(f"⚠️ Hiba a scraper mentés olvasásakor: {e}")
    return [], []


def allapot_mentese_scraper(progress_file, completed_categories, retry_list):
    try:
        with open(progress_file, "w", encoding="utf-8") as f:
            json.dump({
                "completed_categories": completed_categories,
                "retry_list": retry_list
            }, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"⚠️ Hiba a scraper mentés során: {e}")


# --- MATH ---
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
# --- REKURZÍV KÉP-TÉRKÉP REKONSTRUKCIÓ (MODUL SZINTEN!) ---
# JAVÍTÁS: Ez a függvény korábban az else blokkba volt indentálva,
# ezért az 1. fázis után sosem futott le, és final_image_map üres maradt.
# ==============================================================================
def rekurziv_image_map_betoltes(mappa, kat_id_list, current_map):
    """
    Rekurzívan bejárja a kollazs_kepek mappát és feltölti a final_image_map-et
    a lemezen lévő képek alapján. Újraindításkor ez adja vissza az állapotot.
    """
    if not os.path.exists(mappa):
        return

    kepek = [os.path.join(mappa, f) for f in os.listdir(mappa)
             if f.lower().endswith(('.jpg', '.jpeg', '.png')) and not f.startswith('_kollazs')]

    if kepek and kat_id_list:  # Gyökér mappa ('kollazs_kepek') nem kap saját bejegyzést
        kat_id = " > ".join(kat_id_list)
        if kat_id in current_map:
            # Duplikátumok elkerülése: csak az új fájlokat adjuk hozzá
            meglevo_abspath = set(os.path.abspath(f) for f in current_map[kat_id])
            for f in kepek:
                if os.path.abspath(f) not in meglevo_abspath:
                    current_map[kat_id].append(f)
        else:
            current_map[kat_id] = kepek

    for item in os.listdir(mappa):
        path = os.path.join(mappa, item)
        if os.path.isdir(path) and not item.startswith('_'):
            rekurziv_image_map_betoltes(path, kat_id_list + [item], current_map)


def kollazs_kesz_e(kat_id):
    """
    Megvizsgálja, hogy egy kategóriához már el van-e készítve a kollázs
    (azaz van-e _kollazs_*.png fájl a megfelelő mappában).
    """
    tiszta_kat_id = kat_id.replace(" (Összesítő)", "")
    kat_utvonal = tiszta_kat_id.split(" > ")
    mappa_path = os.path.join("kollazs_kepek", *[tiszta_nev(p) for p in kat_utvonal])

    if os.path.exists(mappa_path):
        for f in os.listdir(mappa_path):
            if f.startswith("_kollazs") and f.lower().endswith('.png'):
                return True
    return False


# ==============================================================================
# --- 1. FÁZIS: CSAK LETÖLTÉS (CORE MAG) ---
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
            fajl_utvonal = os.path.join(mappa_path, f"{fajlnev}.jpg")

            if os.path.exists(fajl_utvonal):
                print(f"      ⏩ Kép már létezik: {fajlnev}.jpg")
                return fajl_utvonal

            response = requests.get(kep_url, stream=True, timeout=10)
            if response.status_code == 200:
                with open(fajl_utvonal, 'wb') as f:
                    for chunk in response.iter_content(1024):
                        f.write(chunk)
                print(f"      ✅ Kép letöltve: {fajlnev}.jpg")
                return fajl_utvonal
            else:
                raise Exception(f"Szerver hiba letöltéskor ({response.status_code}): {kep_url}")
    else:
        print(f"      ⚠️ A {fajlnev} termékhez nincs feltöltve kép.")
        return None


# ==============================================================================
# --- TERMÉKEK FELDOLGOZÁSA ---
# ==============================================================================
def termek_letolto_fázis1(page, url, kategoria_utvonal, letoltendo_db, eloszlas_mod, progress_file,
                          befejezett_kategoriak, retry_list, base_url):
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
    if osszes_termek > 0:
        for sor in termek_sorok:
            try:
                href = sor.locator("td").nth(2).locator("a").get_attribute("href")
                if href:
                    osszes_termek_link.append(f"{base_url}/administrator/" + href)
            except:
                continue

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

    print(f"   ⚙️ Képek letöltése ide: {kat_azonosito}")
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
                    uj_idx = kiprobalatlan_indexek.pop(0)
                    vonal.append(osszes_termek_link[uj_idx])
        except Exception as e:
            print(f"      ❌ Hiba (1. FÁZIS): {e} -> Kép mentése a javító listára (Retry List)!")
            retry_list.append({
                "kategoria_utvonal": kategoria_utvonal,
                "url": p_url,
                "fallback_idx": probalkozas_szam
            })
            if kiprobalatlan_indexek:
                uj_idx = kiprobalatlan_indexek.pop(0)
                vonal.append(osszes_termek_link[uj_idx])

    befejezett_kategoriak.append(kat_azonosito)
    allapot_mentese_scraper(progress_file, befejezett_kategoriak, retry_list)

    return osszes_termek_link, lokalis_fajlok


# ==============================================================================
# --- REKURZÍV BEJÁRÓ ---
# ==============================================================================
def kategoria_bejaro_fázis1(page, url, kategoria_utvonal, alap_letoltendo_db, eloszlas_mod, progress_file,
                            befejezett_kategoriak, retry_list, letolt_koztes, base_url):
    print(f"\n📂 Bejárás: {' > '.join(kategoria_utvonal)}")

    image_map = {}

    if not biztonsagos_oldalbetoltes(page, url):
        return 1, [], image_map

    try:
        page.goto(url, timeout=60000)
        time.sleep(2.5)
    except Exception as e:
        print(f"   ❌ Hiba az oldal betöltésekor: {e}")
        return 1, [], image_map

    alkategoriak_lehetnek = page.locator("table#categoriesList tbody tr").count() > 0

    osszes_osszegujtott_link = []
    max_gyerek_melyseg = 0

    if alkategoriak_lehetnek:
        rows = page.locator("table#categoriesList tbody tr").all()
        bejarando_linkek = []

        for row in rows:
            try:
                nev_cella = row.locator("td").nth(2)
                cat_nev = nev_cella.inner_text().strip()
                href = nev_cella.locator("a").get_attribute("href")
                alkat_text = row.locator("td").nth(7).inner_text()
                termek_text = row.locator("td").nth(8).inner_text()
                alkat_db = int(re.sub(r'\D', '', alkat_text)) if re.sub(r'\D', '', alkat_text) else 0
                termek_db = int(re.sub(r'\D', '', termek_text)) if re.sub(r'\D', '', termek_text) else 0

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
            uj_utvonal = list(kategoria_utvonal)
            uj_utvonal.append(link["nev"])

            if link["alkat_db"] > 0:
                melyseg, gyerek_linkek, gyerek_map = kategoria_bejaro_fázis1(page, link["url"], uj_utvonal,
                                                                             alap_letoltendo_db, eloszlas_mod,
                                                                             progress_file, befejezett_kategoriak,
                                                                             retry_list, letolt_koztes, base_url)
                max_gyerek_melyseg = max(max_gyerek_melyseg, melyseg)
                osszes_osszegujtott_link.extend(gyerek_linkek)
                image_map.update(gyerek_map)
            elif link["termek_db"] > 0:
                gyerek_linkek, lokalis_fajlok = termek_letolto_fázis1(page, link["url"], uj_utvonal, alap_letoltendo_db,
                                                                      eloszlas_mod, progress_file,
                                                                      befejezett_kategoriak, retry_list, base_url)
                max_gyerek_melyseg = max(max_gyerek_melyseg, 1)
                if gyerek_linkek:
                    osszes_osszegujtott_link.extend(gyerek_linkek)
                if lokalis_fajlok:
                    image_map[" > ".join(uj_utvonal)] = lokalis_fajlok

        sajat_melyseg = max_gyerek_melyseg + 1

        try:
            page.goto(url, timeout=60000)
            time.sleep(2.5)
            if page.locator("table#productsList tbody tr").count() > 0:
                kozvetlen_linkek, kozvetlen_fajlok = termek_letolto_fázis1(page, url, kategoria_utvonal,
                                                                           alap_letoltendo_db, eloszlas_mod,
                                                                           progress_file, befejezett_kategoriak,
                                                                           retry_list, base_url)
                if kozvetlen_linkek:
                    osszes_osszegujtott_link.extend(kozvetlen_linkek)
                if kozvetlen_fajlok:
                    kat_id = " > ".join(kategoria_utvonal)
                    if kat_id in image_map:
                        image_map[kat_id].extend(kozvetlen_fajlok)
                    else:
                        image_map[kat_id] = kozvetlen_fajlok
        except:
            pass

        egyedi_linkek = list(set(osszes_osszegujtott_link))

        if letolt_koztes and egyedi_linkek:
            aktualis_db = alap_letoltendo_db * sajat_melyseg
            tiszta_utvonal = [tiszta_nev(p) for p in kategoria_utvonal]
            mappa_path = os.path.join("kollazs_kepek", *tiszta_utvonal)

            kat_azonosito_full = " > ".join(kategoria_utvonal) + " (Összesítő)"

            if kat_azonosito_full not in befejezett_kategoriak:
                print(f"\n   📦 [Összesítő szint] Gyűjtemény letöltése ide: {' > '.join(kategoria_utvonal)}")
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
                        fajl_ut = letoltes_vegrehajtasa_fajl_visszaadas(page, p_url, mappa_path, 2000 + prob_idx,
                                                                        base_url)
                        if fajl_ut:
                            lokalis_osszesito_fajlok.append(fajl_ut)
                        else:
                            print("      🔄 [Összesítő] Nincs kép, pótlás...")
                            if kiprobalatlan_indexek:
                                uj_idx = kiprobalatlan_indexek.pop(0)
                                vonal.append(egyedi_linkek[uj_idx])
                    except Exception as e:
                        print(f"      ❌ Hiba (Összesítő kör): {e} -> Kihagyás, keresünk másikat...")
                        if kiprobalatlan_indexek:
                            uj_idx = kiprobalatlan_indexek.pop(0)
                            vonal.append(egyedi_linkek[uj_idx])

                if lokalis_osszesito_fajlok:
                    image_map[kat_azonosito_full] = lokalis_osszesito_fajlok
                befejezett_kategoriak.append(kat_azonosito_full)
                allapot_mentese_scraper(progress_file, befejezett_kategoriak, retry_list)
            else:
                print(f"   ⏭️ MÁR LETÖLTVE (Összesítő), ÁTUGRÁS: {kat_azonosito_full}")
                meglevo_fajlok = []
                if os.path.exists(mappa_path):
                    for f in os.listdir(mappa_path):
                        if f.lower().endswith(('.jpg', '.jpeg', '.png')) and not f.startswith('_kollazs'):
                            meglevo_fajlok.append(os.path.join(mappa_path, f))
                if meglevo_fajlok:
                    image_map[kat_azonosito_full] = meglevo_fajlok

        return sajat_melyseg, egyedi_linkek, image_map

    else:
        gyerek_linkek, lokalis_fajlok = termek_letolto_fázis1(page, url, kategoria_utvonal, alap_letoltendo_db,
                                                              eloszlas_mod, progress_file, befejezett_kategoriak,
                                                              retry_list, base_url)
        if lokalis_fajlok:
            image_map[" > ".join(kategoria_utvonal)] = lokalis_fajlok
        return 1, (gyerek_linkek if gyerek_linkek else []), image_map


# ==============================================================================
# --- 2. FÁZIS: INTERAKTÍV KOLLÁZS VEZÉRLŐ ---
# ==============================================================================
def interaktiv_kollazs_fázis2(ctx: Context, image_map_full, collage_progress_file):
    if not image_map_full:
        print("\n⚠️ Nincs letöltött kép, kollázskészítés átugorva.")
        return

    print("\n" + "=" * 50)
    print(" 🎨 2. FÁZIS: INTERAKTÍV KOLLÁZSKÉSZÍTÉS 🎨")
    print("=" * 50)
    print(f"Összesen {len(image_map_full)} kategóriát kell feldolgozni.")

    # Progress betöltése
    befejezett_kollazsok = allapot_betoltese_egyszeru(collage_progress_file)

    # JAVÍTÁS: Automatikus kész-jelölés a fájlrendszer alapján (újraindításkor is működik)
    for kat_id in list(image_map_full.keys()):
        if kat_id not in befejezett_kollazsok and kollazs_kesz_e(kat_id):
            print(f"   🔍 Kollázs megtalálva a lemezen (automatikus észlelés): {kat_id}")
            befejezett_kollazsok.append(kat_id)

    allapot_mentese_egyszeru(collage_progress_file, befejezett_kollazsok)

    # Ha minden kész, ki sem nyitjuk a böngészőt
    meg_hianyzok = [k for k in image_map_full.keys() if k not in befejezett_kollazsok]
    if not meg_hianyzok:
        print("\n✅ Minden kollázs már el van készítve! Kollázskészítési fázis átugorva.")
        return

    print(f"   ℹ️ {len(befejezett_kollazsok)} db már kész, {len(meg_hianyzok)} db még hiányzik.")

    page = ctx.new_page()
    current_download_dir = ["kollazs_kepek"]

    def handle_download(download):
        mappa_path = os.path.join(*current_download_dir)
        vegso_fajl = os.path.join(mappa_path, f"_kollazs_kesz_{int(time.time())}.png")
        download.save_as(vegso_fajl)
        print(f"   📥 [WEB] KOLLÁZS ELMENTVE IDE: {vegso_fajl}")

    page.on("download", handle_download)

    try:
        page.goto("https://eszkoztar.vercel.app/kollazskeszito/", timeout=60000)
        time.sleep(1)

        for kat_id, fajl_list in image_map_full.items():
            if kat_id in befejezett_kollazsok:
                print(f"\n   ⏩ Kollázs már kész: {kat_id}")
                continue

            print(f"\n🎨 Kollázs készítése: {kat_id} ({len(fajl_list)} kép)")

            tiszta_kat_id = kat_id.replace(" (Összesítő)", "")
            kat_utvonal = tiszta_kat_id.split(" > ")
            current_download_dir[0] = os.path.join("kollazs_kepek", *[tiszta_nev(p) for p in kat_utvonal])

            abs_fajlok = [os.path.abspath(f) for f in fajl_list if os.path.exists(f)]

            if not abs_fajlok:
                print(f"   ⚠️ Hiba: Nem találhatók a képek a lemezen.")
                continue

            try:
                page.evaluate("""
                    () => {
                        const theme = localStorage.getItem('kp-theme');
                        localStorage.clear();
                        sessionStorage.clear();
                        if (theme) localStorage.setItem('kp-theme', theme);
                        if (window.indexedDB && window.indexedDB.databases) {
                            window.indexedDB.databases().then(dbs => {
                                dbs.forEach(db => window.indexedDB.deleteDatabase(db.name));
                            }).catch(() => {});
                        }
                    }
                """)

                page.reload()
                time.sleep(1.5)

                page.evaluate("""
                    () => {
                        const html = document.documentElement;
                        html.setAttribute('data-theme', 'light');
                        localStorage.setItem('kp-theme', 'light');
                        const lightIcon = document.getElementById('themeIconLight');
                        const darkIcon  = document.getElementById('themeIconDark');
                        if (lightIcon) lightIcon.style.display = 'none';
                        if (darkIcon)  darkIcon.style.display = 'block';
                    }
                """)
                time.sleep(0.5)

                file_input = page.locator('input[type="file"]').first
                file_input.wait_for(state="attached", timeout=5000)
                file_input.set_input_files(abs_fajlok)
                print("   ✔️ Képek automatikusan betöltve az oldalra.")
            except Exception as e:
                print(f"   ⚠️ Automatikus feltöltés hiba: {e}. Kérlek húzd be kézzel a képeket.")

            header_js = f"""
                () => {{
                    const oldHeader = document.getElementById('bot-header');
                    if (oldHeader) oldHeader.remove();

                    const header = document.createElement('div');
                    header.id = 'bot-header';
                    header.style.position = 'fixed';
                    header.style.top = '50%';
                    header.style.left = '20px';
                    header.style.transform = 'translateY(-50%)';
                    header.style.background = '#FFD700';
                    header.style.color = '#000';
                    header.style.zIndex = '999999';
                    header.style.padding = '20px 15px';
                    header.style.fontFamily = 'Arial, sans-serif';
                    header.style.boxShadow = '0 8px 25px rgba(0,0,0,0.5)';
                    header.style.display = 'flex';
                    header.style.flexDirection = 'column';
                    header.style.alignItems = 'center';
                    header.style.gap = '15px';
                    header.style.borderRadius = '20px';
                    header.style.maxWidth = '220px';

                    header.innerHTML = `
                        <div style="text-align:center; line-height:1.3;">
                            <span style="font-size:12px; font-weight:normal;">Aktuális kategória:</span><br>
                            <span style="font-size:15px; font-weight:bold;">{kat_id}</span>
                        </div>
                        <div style="font-size:14px; font-weight:bold; text-align:center;">
                            1. Rendezd el<br>⬇<br>2. Mentsd le<br>⬇
                        </div>
                        <button id="bot-tovabb-btn" style="padding:12px 15px; font-size:14px; font-weight:bold; background:#e74c3c; color:white; border:none; border-radius:25px; cursor:pointer; text-transform:uppercase; width:100%; box-sizing:border-box;">
                            Következő >
                        </button>
                    `;
                    document.body.appendChild(header);

                    document.getElementById('bot-tovabb-btn').addEventListener('click', () => {{
                        document.getElementById('bot-header').setAttribute('data-clicked', 'true');
                        document.getElementById('bot-tovabb-btn').innerText = 'Kérem várjon...';
                        document.getElementById('bot-tovabb-btn').style.background = '#95a5a6';
                    }});
                }}
            """
            page.evaluate(header_js)

            print("   ⏳ Várakozás rád... Készítsd el a kollázst, mentsd le, majd kattints a piros 'KÖVETKEZŐ' gombra!")
            page.wait_for_selector("#bot-header[data-clicked='true']", timeout=0)

            befejezett_kollazsok.append(kat_id)
            allapot_mentese_egyszeru(collage_progress_file, befejezett_kollazsok)
            time.sleep(1)

    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"\n❌ Hiba a kollázs fázisban: {e}")
    finally:
        page.close()
        if len(befejezett_kollazsok) >= len(image_map_full) and os.path.exists(collage_progress_file):
            os.remove(collage_progress_file)
            print("\n🗑️ Kollázs menetfájl törölve (Minden kész).")


# ==============================================================================
# --- 3. FÁZIS: KOLLÁZSOK AUTOMATIKUS FELTÖLTÉSE A KATEGÓRIÁKHOZ ---
# ==============================================================================
def feltoltes_falis3(ctx: Context, image_map_full, base_url):
    print("\n" + "=" * 50)
    print(" 🚀 3. FÁZIS: KÉSZ KOLLÁZSOK FELTÖLTÉSE (Cseréje) 🚀")
    print("=" * 50)

    page = ctx.new_page()
    feltoltendo_kollazsok = {}

    for kat_id in image_map_full.keys():
        tiszta_kat_id = kat_id.replace(" (Összesítő)", "")
        kat_utvonal = tiszta_kat_id.split(" > ")
        mappa_path = os.path.join("kollazs_kepek", *[tiszta_nev(p) for p in kat_utvonal])

        if os.path.exists(mappa_path):
            for f in os.listdir(mappa_path):
                if f.startswith("_kollazs") and f.lower().endswith('.png'):
                    feltoltendo_kollazsok[tiszta_kat_id] = os.path.abspath(os.path.join(mappa_path, f))
                    break

    if not feltoltendo_kollazsok:
        print("⚠️ Nem találtam kész kollázsokat a feltöltéshez.")
        page.close()
        return

    print(f"Összesen {len(feltoltendo_kollazsok)} db kategóriához van kész kollázs.")

    max_feltoltesi_kor = 3
    aktualis_kor = 1

    while feltoltendo_kollazsok and aktualis_kor <= max_feltoltesi_kor:
        print(f"\n--- 🔄 {aktualis_kor}. FELTÖLTÉSI KÖR INDUL ---")
        sikertelen_kollazsok = {}

        for kat_id, file_path in feltoltendo_kollazsok.items():
            print(f"\n🔼 Kép cseréje indul: {kat_id}")
            kat_utvonal = [p.strip() for p in kat_id.split(" > ")]

            try:
                page.goto(f"{base_url}/administrator/index.php?view=store", timeout=30000)
                time.sleep(2)

                sikeres_navigacio = True

                for i, part in enumerate(kat_utvonal):
                    asztal = page.locator("table#categoriesList:not(.fixedHeader)").first
                    sor = asztal.locator("tbody tr", has=page.locator(f"b:has-text('{part}')")).first

                    if sor.count() == 0:
                        print(f"   ❌ Hiba: Nem találom a '{part}' nevű kategóriát. (Újrapróbáljuk később)")
                        sikeres_navigacio = False
                        break

                    if i == len(kat_utvonal) - 1:
                        print(f"   🔗 Cél kategória megvan ({part}), belépés a szerkesztésbe...")
                        sor.locator("a.btn.btn-default:has-text('Szerkesztés')").first.click()
                        time.sleep(2)
                    else:
                        print(f"   📂 Belépés ide: {part}")
                        sor.locator(f"a:has(b:has-text('{part}'))").first.click()
                        time.sleep(2)

                if not sikeres_navigacio:
                    sikertelen_kollazsok[kat_id] = file_path
                    continue

                page.locator("label[for='kepek']").wait_for(state="visible", timeout=10000)
                page.locator("label[for='kepek']").click()
                time.sleep(1.5)

                def handle_dialog(dialog):
                    try:
                        dialog.accept()
                    except:
                        pass

                page.on("dialog", handle_dialog)
                torles_gombok = page.locator("ul#categoryImages li div.deleteImage")
                if torles_gombok.count() > 0:
                    while torles_gombok.count() > 0:
                        torles_gombok.first.click(force=True)
                        time.sleep(1.5)
                page.remove_listener("dialog", handle_dialog)

                page.locator("input#newImage").set_input_files(file_path)
                print("   ⏳ Új kollázs feltöltése a szerverre folyamatban...")
                time.sleep(5)

                print("   💾 Mentés és bezárás...")
                page.locator("a#save_close").wait_for(state="visible", timeout=15000)
                page.locator("a#save_close").click(force=True)

                try:
                    page.wait_for_url(lambda url: "view=store" in url, timeout=20000)
                    print("   ✅ Mentés sikeres, visszatértünk a listára.")
                except:
                    print("   ⚠️ Mentés utáni átirányítás lassú, manuális ellenőrzés...")

                time.sleep(3)

                if not page.locator("table#categoriesList:not(.fixedHeader)").first.is_visible():
                    print("   ⚠️ A táblázat még nem látszik, egy kis ráhagyás...")
                    time.sleep(3)

                print(f"   ✅ Kép sikeresen kicserélve ehhez: {kat_id}!")

            except Exception as e:
                print(f"   ❌ Hiba a feltöltés során ({kat_id}): {e}")
                print("   🔄 Hozzáadva a következő körhöz...")
                sikertelen_kollazsok[kat_id] = file_path

        feltoltendo_kollazsok = sikertelen_kollazsok
        aktualis_kor += 1

        if feltoltendo_kollazsok and aktualis_kor <= max_feltoltesi_kor:
            print(f"\n⏳ Rövid szünet a következő feltöltési kör előtt...")
            time.sleep(3)

    if feltoltendo_kollazsok:
        print(f"\n⚠️ {len(feltoltendo_kollazsok)} db kollázst {max_feltoltesi_kor} kör alatt sem sikerült feltölteni.")

    page.close()
    print("\n✅ Képcsere fázis lezárva.")


# ==============================================================================
# --- MAIN FLOW ---
# ==============================================================================
def bejelentkezes_kezelese(browser: Browser, username, password, base_url, state_fajl="state.json"):
    if os.path.exists(state_fajl):
        print(f"\nMeglévő session betöltése ({state_fajl}).")
        try:
            context = browser.new_context(storage_state=state_fajl, no_viewport=True, color_scheme='light')
            p = context.new_page()
            p.goto(f"{base_url}/administrator/index.php?view=store", timeout=15000)
            p.locator("#searchField_all").wait_for(timeout=5000)
            p.close()
            return context
        except:
            print("❌ Érvénytelen session, új login...")

    context = browser.new_context(no_viewport=True, color_scheme='light')
    page = context.new_page()
    try:
        page.goto(f"{base_url}/administrator/", timeout=15000)
        page.fill("input[name='username']", username)
        page.fill("input[name='password']", password)
        page.click("button[type='submit']")
        page.locator("#searchField_all").wait_for(timeout=10000)
        print("✅ Belépés sikeres.")
        context.storage_state(path=state_fajl)
    except Exception as e:
        print(f"❌ LOGIN HIBA: {e}")
        browser.close()
        sys.exit(1)
    page.close()
    return context


if __name__ == "__main__":
    load_dotenv()

    print("\n" + "=" * 50)
    print(" 📸 KÉP-SCRAPER ÉS INTERAKTÍV KOLLÁZS ASSZISZTENS 📸")
    print("=" * 50)

    # --- WEBSHOP VÁLASZTÁS ---
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
        print(f"\n❌ HIBA: Nem találom a bejelentkezési adatokat a .env fájlban ehhez a webshophoz!")
        sys.exit(1)

    fokategoria = input("\nKérlek add meg a főkategória PONTOS nevét (pl. INGCO termékek): ").strip()

    clean_fokat = tiszta_nev(fokategoria)
    scr_prog_f = f"scraper_progress_{clean_fokat}.json"
    coll_prog_f = f"collage_progress_{clean_fokat}.json"

    folytatas = False
    letoltes_szukseges = True
    kivan_db = 10
    kivalasztott_mod = "random"

    # ==============================================================================
    # JAVÍTÁS: Induláskor MINDIG megvizsgáljuk a fájlrendszer állapotát,
    # hogy meghatározzuk, hol tart a folyamat.
    # ==============================================================================
    kepek_vannak = os.path.exists("kollazs_kepek") and any(
        f.lower().endswith(('.jpg', '.jpeg', '.png'))
        for root, dirs, files in os.walk("kollazs_kepek")
        for f in files
        if not f.startswith('_kollazs')
    )

    kollazsok_vannak = os.path.exists("kollazs_kepek") and any(
        f.startswith('_kollazs') and f.lower().endswith('.png')
        for root, dirs, files in os.walk("kollazs_kepek")
        for f in files
    )

    scraper_progress_letezik = os.path.exists(scr_prog_f)
    collage_progress_letezik = os.path.exists(coll_prog_f)

    # Automatikus állapotfelismerés induláskor
    if kepek_vannak or scraper_progress_letezik:
        print(f"\n⚠️ Találtam egy korábbi munkamenet nyomait a(z) '{fokategoria}' kategóriához.")

        if kollazsok_vannak:
            print("  ✅ Letöltött képek: MEGVANNAK")
            print("  ✅ Kész kollázsok: TALÁLHATÓK (részben vagy teljesen kész)")
        elif kepek_vannak:
            print("  ✅ Letöltött képek: MEGVANNAK")
            print("  ❌ Kész kollázsok: MÉG NINCSENEK")
        else:
            print("  ⚠️ Folyamatban lévő letöltés (menetfájl megvan, mappák részben üresek)")

        print("\n  1: Folytatás a LETÖLTÉSTŐL (átugorja a kész képeket)")
        print("  2: Ugrás a KOLLÁZSOKHOZ (letöltés már teljesen kész)")
        print("  3: Ugrás a FELTÖLTÉSHEZ (kollázsok is el vannak készítve)")
        print("  4: ÚJRAKEZDÉS (Régi mentések törlése, tiszta lap)")
        valasz_folytat = input("Választás (1-4): ").strip()

        if valasz_folytat == '1':
            folytatas = True
            letoltes_szukseges = True
            print("   ⏩ Letöltés folytatása kiválasztva.")
        elif valasz_folytat == '2':
            folytatas = True
            letoltes_szukseges = False
            print("   ⏩ Ugrás a kollázsokhoz.")
        elif valasz_folytat == '3':
            folytatas = True
            letoltes_szukseges = False
            print("   ⏩ Ugrás a feltöltési fázishoz.")
        else:
            # Mindent törlünk
            if scraper_progress_letezik:
                os.remove(scr_prog_f)
            if collage_progress_letezik:
                os.remove(coll_prog_f)
            print("   🗑️ Régi menetfájlok törölve. Tiszta lappal indulunk.")
            print("   ℹ️ (A már letöltött képek megmaradnak a mappában)")
            folytatas = False

    if not folytatas:
        db_input = input("\nMax hány képet letölteni alap kategóriánként? (Alap: 10): ").strip()
        kivan_db = int(db_input) if db_input.isdigit() else 10

        print("\n--- Letöltési mód? ---")
        print("  1: Véletlenszerű (ajánlott)")
        print("  2: Arányos")
        mod_v = input("Választás (1-2): ").strip()
        kivalasztott_mod = "random" if mod_v == "1" else "even"

    letolt_koztes = True
    final_image_map = {}
    befejezett_kategoriak, retry_list = allapot_betoltese_scraper(scr_prog_f)

    # ==============================================================================
    # 1. FÁZIS: LETÖLTÉS (LÁTHATATLAN - HEADLESS: TRUE)
    # ==============================================================================
    if letoltes_szukseges:
        print("\n" + "=" * 50)
        print(" ⚙️ 1. FÁZIS: KÉPEK LETÖLTÉSE A HÁTTÉRBEN (Láthatatlanul) ⚙️")
        print("=" * 50)

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, args=['--start-maximized'])
            ctx = bejelentkezes_kezelese(browser, F_NEV, J_SZO, BASE_URL, STATE_F)

            if ctx:
                page = ctx.new_page()

                if not scraper_progress_letezik:
                    print("   (Új munkamenet indítása)")
                else:
                    print(f"   (Folytatás... {len(befejezett_kategoriak)} kategória kész, {len(retry_list)} hiba)")

                try:
                    page.goto(f"{BASE_URL}/administrator/index.php?view=store", timeout=60000)
                    cel_sor = page.locator(
                        f"table#categoriesList tbody tr td a b:has-text('{fokategoria}')").first

                    if cel_sor.count() > 0:
                        kezdo_link = cel_sor.locator("..").get_attribute("href")
                        full_kezdo_link = f"{BASE_URL}/administrator/" + kezdo_link

                        print(f"✅ Főkategória megvan. Indul a pók...\n")

                        _, _, final_image_map = kategoria_bejaro_fázis1(
                            page, full_kezdo_link, [fokategoria], kivan_db,
                            kivalasztott_mod, scr_prog_f,
                            befejezett_kategoriak, retry_list,
                            letolt_koztes, BASE_URL
                        )

                        if retry_list:
                            max_letoltesi_kor = 5
                            aktualis_let_kor = 2

                            while retry_list and aktualis_let_kor <= max_letoltesi_kor:
                                print("\n" + "-" * 30)
                                print(
                                    f" ♻️ {aktualis_let_kor}. KÖR: Hibás letöltések javítása ({len(retry_list)} db maradék)")
                                print("-" * 30)

                                uj_retry_list = []

                                for item in retry_list:
                                    try:
                                        tiszta_utvonal = [tiszta_nev(p) for p in item["kategoria_utvonal"]]
                                        mappa_path = os.path.join("kollazs_kepek", *tiszta_utvonal)
                                        os.makedirs(mappa_path, exist_ok=True)

                                        fajl_ut = letoltes_vegrehajtasa_fajl_visszaadas(
                                            page, item["url"], mappa_path, item["fallback_idx"], BASE_URL)

                                        if fajl_ut:
                                            kat_id = " > ".join(item["kategoria_utvonal"])
                                            if kat_id in final_image_map:
                                                final_image_map[kat_id].append(fajl_ut)
                                            else:
                                                final_image_map[kat_id] = [fajl_ut]
                                        else:
                                            uj_retry_list.append(item)
                                    except Exception as e:
                                        print(f"      ❌ Újabb hiba: {e}")
                                        uj_retry_list.append(item)

                                retry_list = uj_retry_list
                                allapot_mentese_scraper(scr_prog_f, befejezett_kategoriak, retry_list)
                                aktualis_let_kor += 1

                                if retry_list and aktualis_let_kor <= max_letoltesi_kor:
                                    time.sleep(3)

                            if retry_list:
                                print(
                                    f"\n⚠️ {len(retry_list)} db fájlt {max_letoltesi_kor} kör alatt sem sikerült letölteni. Továbblépünk.")

                        if not retry_list:
                            print("\n✅ 1. Fázis sikeresen befejeződött.")
                    else:
                        print(f"❌ Kategória nem található: {fokategoria}")
                        browser.close()
                        sys.exit()

                except Exception as e:
                    import traceback
                    traceback.print_exc()
                    print(f"\n⚠️ Hiba az 1. fázisban: {e}")
                    print("💡 Mentve, honnan folytassa.")
                    browser.close()
                    sys.exit()
                finally:
                    page.close()
            browser.close()

    # ==============================================================================
    # JAVÍTÁS: final_image_map MINDIG a lemezről van rekonstruálva a fázisok között.
    # Ez biztosítja, hogy újraindítás után (bármely opciónál) a térkép teljes legyen.
    # Korábban ez csak az else ágban volt definiálva (indentálási hiba),
    # és a letöltési fázis után sosem futott le.
    # ==============================================================================
    if os.path.exists("kollazs_kepek"):
        print("\n🔄 Kép-térkép szinkronizálása a lemezzel...")
        rekurziv_image_map_betoltes("kollazs_kepek", [], final_image_map)
        print(f"   ✅ {len(final_image_map)} kategória betöltve/frissítve a lemezről.")
    else:
        print("\n⚠️ Nincs 'kollazs_kepek' mappa. Letöltés még nem futott?")

    if not final_image_map:
        print("⚠️ Nem találtam egyetlen képet sem. Ellenőrizd a kollazs_kepek mappát!")
        sys.exit(1)

    # Ha a felhasználó a "3: Ugrás a feltöltéshez" opciót választotta, átugorjuk a kollázsokat
    if folytatas and valasz_folytat == '3':
        print("\n⏭️ Kollázskészítési fázis átugorva (felhasználói kérésre).")
    else:
        kollazs_valasz = input("\n🎨 Szeretnéd most elkészíteni/folytatni a kollázsokat? (i/n): ").strip().lower()

        # ==============================================================================
        # 2. FÁZIS: KOLLÁZS (LÁTHATÓ - HEADLESS: FALSE)
        # ==============================================================================
        if kollazs_valasz == 'i':
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=False, args=['--start-maximized'])
                ctx = browser.new_context(no_viewport=True)

                interaktiv_kollazs_fázis2(ctx, final_image_map, coll_prog_f)
                browser.close()

            if os.path.exists(scr_prog_f) and not os.path.exists(coll_prog_f):
                os.remove(scr_prog_f)
                print("🗑️ Letöltési menetfájl törölve (Minden kész).")
        else:
            print("\n⏭️ Kollázskészítés kihagyva.")

    valasz = input("\nSzeretnéd most automatikusan feltölteni az elkészült kollázsokat? (i/n): ").strip().lower()

    # ==============================================================================
    # 3. FÁZIS: FELTÖLTÉS (LÁTHATATLAN - HEADLESS: TRUE)
    # ==============================================================================
    if valasz == 'i':
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, args=['--start-maximized'])
            ctx = bejelentkezes_kezelese(browser, F_NEV, J_SZO, BASE_URL, STATE_F)
            if ctx:
                feltoltes_falis3(ctx, final_image_map, BASE_URL)
            browser.close()
    else:
        print("\n⏭️ Feltöltés kihagyva.")

    print("\n🎉 Program befejeződött!")