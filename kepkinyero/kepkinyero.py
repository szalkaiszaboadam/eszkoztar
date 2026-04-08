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
# --- 1. FÁZIS: CSAK LETÖLTÉS (CORE MAG) ---
# ==============================================================================
def letoltes_vegrehajtasa_fajl_visszaadas(page, p_url, mappa_path, fallback_idx):
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
                          befejezett_kategoriak, retry_list):
    kat_azonosito = " > ".join(kategoria_utvonal)

    tiszta_utvonal = [tiszta_nev(p) for p in kategoria_utvonal]
    mappa_path = os.path.join("Kollazs_Kepek", *tiszta_utvonal)
    os.makedirs(mappa_path, exist_ok=True)

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
                    osszes_termek_link.append("https://szvgtoolsshop.hu/administrator/" + href)
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
    termek_linkek = [osszes_termek_link[idx] for idx in cel_indexek]

    lokalis_fajlok = []

    for i, p_url in enumerate(termek_linkek):
        try:
            fajl_ut = letoltes_vegrehajtasa_fajl_visszaadas(page, p_url, mappa_path, fallback_idx=i + 1)
            if fajl_ut:
                lokalis_fajlok.append(fajl_ut)
        except Exception as e:
            print(f"      ❌ Hiba (1. FÁZIS): {e}")
            retry_list.append({
                "url": p_url,
                "kategoria_utvonal": kategoria_utvonal,
                "fallback_idx": i + 1
            })

    befejezett_kategoriak.append(kat_azonosito)
    allapot_mentese_scraper(progress_file, befejezett_kategoriak, retry_list)

    return osszes_termek_link, lokalis_fajlok


# ==============================================================================
# --- REKURZÍV BEJÁRÓ ---
# ==============================================================================
def kategoria_bejaro_fázis1(page, url, kategoria_utvonal, alap_letoltendo_db, eloszlas_mod, progress_file,
                            befejezett_kategoriak, retry_list, letolt_koztes):
    print(f"\n📂 Bejárás: {' > '.join(kategoria_utvonal)}")

    image_map = {}

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
                        "url": "https://szvgtoolsshop.hu/administrator/" + href,
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
                                                                             retry_list, letolt_koztes)
                max_gyerek_melyseg = max(max_gyerek_melyseg, melyseg)
                osszes_osszegujtott_link.extend(gyerek_linkek)
                image_map.update(gyerek_map)
            elif link["termek_db"] > 0:
                gyerek_linkek, lokalis_fajlok = termek_letolto_fázis1(page, link["url"], uj_utvonal, alap_letoltendo_db,
                                                                      eloszlas_mod, progress_file,
                                                                      befejezett_kategoriak, retry_list)
                max_gyerek_melyseg = max(max_gyerek_melyseg, 1)
                if gyerek_linkek: osszes_osszegujtott_link.extend(gyerek_linkek)
                if lokalis_fajlok: image_map[" > ".join(uj_utvonal)] = lokalis_fajlok

        sajat_melyseg = max_gyerek_melyseg + 1

        try:
            page.goto(url, timeout=60000)
            time.sleep(2.5)
            if page.locator("table#productsList tbody tr").count() > 0:
                kozvetlen_linkek, kozvetlen_fajlok = termek_letolto_fázis1(page, url, kategoria_utvonal,
                                                                           alap_letoltendo_db, eloszlas_mod,
                                                                           progress_file, befejezett_kategoriak,
                                                                           retry_list)
                if kozvetlen_linkek: osszes_osszegujtott_link.extend(kozvetlen_linkek)
                if kozvetlen_fajlok:
                    kat_id = " > ".join(kategoria_utvonal)
                    if kat_id in image_map:
                        image_map[kat_id].extend(kozvetlen_fajlok)
                    else:
                        image_map[kat_id] = kozvetlen_fajlok
        except:
            pass

        if letolt_koztes and osszes_osszegujtott_link:
            aktualis_db = alap_letoltendo_db * sajat_melyseg
            egyedi_linkek = list(set(osszes_osszegujtott_link))
            tiszta_utvonal = [tiszta_nev(p) for p in kategoria_utvonal]
            mappa_path = os.path.join("Kollazs_Kepek", *tiszta_utvonal)

            kat_azonosito_full = " > ".join(kategoria_utvonal) + " (Összesítő)"

            if kat_azonosito_full not in befejezett_kategoriak:
                print(f"\n   📦 [Összesítő szint] Gyűjtemény letöltése ide: {' > '.join(kategoria_utvonal)}")

                cel_linkek = []
                if len(egyedi_linkek) <= aktualis_db:
                    cel_linkek = egyedi_linkek
                else:
                    if eloszlas_mod == "random":
                        cel_linkek = random.sample(egyedi_linkek, aktualis_db)
                    else:
                        lepes = (len(egyedi_linkek) - 1) / (aktualis_db - 1)
                        cel_linkek = [egyedi_linkek[round(lepes * i)] for i in range(aktualis_db)]

                os.makedirs(mappa_path, exist_ok=True)
                lokalis_osszesito_fajlok = []

                for i, p_url in enumerate(cel_linkek):
                    try:
                        fajl_ut = letoltes_vegrehajtasa_fajl_visszaadas(page, p_url, mappa_path, fallback_idx=2000 + i)
                        if fajl_ut: lokalis_osszesito_fajlok.append(fajl_ut)
                    except Exception as e:
                        print(f"      ❌ Hiba (Összesítő kör): {e}")
                        retry_list.append({
                            "url": p_url,
                            "kategoria_utvonal": kategoria_utvonal,
                            "fallback_idx": 2000 + i
                        })

                if lokalis_osszesito_fajlok: image_map[kat_azonosito_full] = lokalis_osszesito_fajlok
                befejezett_kategoriak.append(kat_azonosito_full)
                allapot_mentese_scraper(progress_file, befejezett_kategoriak, retry_list)
            else:
                print(f"   ⏭️ MÁR LETÖLTVE (Összesítő), ÁTUGRÁS: {kat_azonosito_full}")
                meglevo_fajlok = []
                if os.path.exists(mappa_path):
                    for f in os.listdir(mappa_path):
                        if f.lower().endswith(('.jpg', '.jpeg', '.png')) and not f.startswith('_kollazs'):
                            meglevo_fajlok.append(os.path.join(mappa_path, f))
                if meglevo_fajlok: image_map[kat_azonosito_full] = meglevo_fajlok

        return sajat_melyseg, egyedi_linkek, image_map

    else:
        gyerek_linkek, lokalis_fajlok = termek_letolto_fázis1(page, url, kategoria_utvonal, alap_letoltendo_db,
                                                              eloszlas_mod, progress_file, befejezett_kategoriak,
                                                              retry_list)
        if lokalis_fajlok: image_map[" > ".join(kategoria_utvonal)] = lokalis_fajlok
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

    befejezett_kollazsok = allapot_betoltese_egyszeru(collage_progress_file)
    page = ctx.new_page()

    current_download_dir = ["Kollazs_Kepek"]

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
            current_download_dir[0] = os.path.join("Kollazs_Kepek", *[tiszta_nev(p) for p in kat_utvonal])

            abs_fajlok = [os.path.abspath(f) for f in fajl_list if os.path.exists(f)]

            if not abs_fajlok:
                print(f"   ⚠️ Hiba: Nem találhatók a képek a lemezen.")
                continue

            try:
                # --- ELŐZŐ KÉPEK ÉS VÁSZON TÖRLÉSE (Memória törlés reload előtt) ---
                page.evaluate("""
                                () => {
                                    // Kimentjük a világos témát, hogy ne vesszen el
                                    const theme = localStorage.getItem('kp-theme');

                                    // Teljesen kiürítjük a helyi memóriát (itt ragadnak be a képek)
                                    localStorage.clear();
                                    sessionStorage.clear();

                                    // Visszatöltjük a témát
                                    if (theme) localStorage.setItem('kp-theme', theme);

                                    // Ha IndexedDB-t (nagy adatbázist) is használ az oldal a képek tárolására:
                                    if (window.indexedDB && window.indexedDB.databases) {
                                        window.indexedDB.databases().then(dbs => {
                                            dbs.forEach(db => window.indexedDB.deleteDatabase(db.name));
                                        }).catch(() => {});
                                    }
                                }
                            """)

                # Most már tiszta lappal, üres memóriával frissítjük az oldalt!
                page.reload()
                time.sleep(1.5)  # Picit több időt hagyunk a tiszta betöltésre

                # --- VILÁGOS MÓD KIKÉNSZERÍTÉSE AZ OLDAL SAJÁT LOGIKÁJÁVAL ---
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
                # ------------------------------------------------------------

                file_input = page.locator('input[type="file"]').first
                file_input.wait_for(state="attached", timeout=5000)
                file_input.set_input_files(abs_fajlok)
                print("   ✔️ Képek automatikusan betöltve az oldalra.")
            except Exception as e:
                print(f"   ⚠️ Automatikus feltöltés hiba: {e}. Kérlek húzd be kézzel a képeket.")

            # FIGYELEM: Itt kellenek a dupla kapcsos zárójelek a JavaScript kód miatt
            header_js = f"""
                            () => {{
                                const oldHeader = document.getElementById('bot-header');
                                if (oldHeader) oldHeader.remove();

                                const header = document.createElement('div');
                                header.id = 'bot-header';
                                header.style.position = 'fixed';
                                header.style.top = '50%'; /* FÜGGŐLEGESEN KÖZÉPRE */
                                header.style.left = '20px'; /* BAL OLDALRA */
                                header.style.transform = 'translateY(-50%)'; /* PONTOS KÖZÉPRE IGAZÍTÁS */
                                header.style.background = '#FFD700'; 
                                header.style.color = '#000'; 
                                header.style.zIndex = '999999';
                                header.style.padding = '20px 15px'; 
                                header.style.fontFamily = 'Arial, sans-serif';
                                header.style.boxShadow = '0 8px 25px rgba(0,0,0,0.5)';
                                header.style.display = 'flex'; 
                                header.style.flexDirection = 'column'; /* EGYMÁS ALÁ RENDEZÉS */
                                header.style.alignItems = 'center';
                                header.style.gap = '15px';
                                header.style.borderRadius = '20px'; /* Modern kerekített kinézet */
                                header.style.maxWidth = '220px'; /* Max szélesség, hogy ne lógjon be nagyon */

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


            page.evaluate(header_js)

            print(
                "   ⏳ Várakozás rád... Készítsd el a kollázst, mentsd le, majd kattints a piros 'KÖVETKEZŐ' gombra a fejlécen!")
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
def feltoltes_falis3(ctx: Context, image_map_full):
    print("\n" + "=" * 50)
    print(" 🚀 3. FÁZIS: KÉSZ KOLLÁZSOK FELTÖLTÉSE (Cseréje) 🚀")
    print("=" * 50)

    page = ctx.new_page()
    feltoltendo_kollazsok = {}

    for kat_id in image_map_full.keys():
        tiszta_kat_id = kat_id.replace(" (Összesítő)", "")
        kat_utvonal = tiszta_kat_id.split(" > ")
        mappa_path = os.path.join("Kollazs_Kepek", *[tiszta_nev(p) for p in kat_utvonal])

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

    for kat_id, file_path in feltoltendo_kollazsok.items():
        print(f"\n🔼 Kép cseréje indul: {kat_id}")
        kat_utvonal = [p.strip() for p in kat_id.split(" > ")]

        try:
            page.goto("https://szvgtoolsshop.hu/administrator/index.php?view=store", timeout=30000)
            time.sleep(2)

            sikeres_navigacio = True

            for i, part in enumerate(kat_utvonal):
                asztal = page.locator("table#categoriesList:not(.fixedHeader)").first
                sor = asztal.locator("tbody tr", has=page.locator(f"b:has-text('{part}')")).first

                if sor.count() == 0:
                    print(f"   ❌ Hiba: Nem találom a '{part}' nevű kategóriát a valódi táblázatban.")
                    sikeres_navigacio = False
                    break

                if i == len(kat_utvonal) - 1:
                    print(f"   🔗 Cél kategória megvan ({part}), belépés a szerkesztésbe...")
                    szerkesztes_gomb = sor.locator("a.btn.btn-default:has-text('Szerkesztés')").first
                    szerkesztes_gomb.click()
                    time.sleep(2)
                else:
                    print(f"   📂 Belépés ide: {part}")
                    kategoria_link = sor.locator(f"a:has(b:has-text('{part}'))").first
                    kategoria_link.click()
                    time.sleep(2)

            if not sikeres_navigacio:
                continue

            # --- KÉPEK FÜL MEGNYITÁSA ---
            page.locator("label[for='kepek']").wait_for(state="visible", timeout=10000)
            page.locator("label[for='kepek']").click()
            time.sleep(1.5)

            # --- ÚJ: MEGLÉVŐ KÉPEK TÖRLÉSE ---
            # Automatikus 'OK' gomb nyomás, ha a rendszer megerősítést kérne a törlésnél
            def handle_dialog(dialog):
                try:
                    dialog.accept()
                except:
                    pass

            page.on("dialog", handle_dialog)

            torles_gombok = page.locator("ul#categoryImages li div.deleteImage")
            if torles_gombok.count() > 0:
                print(f"   🗑️ {torles_gombok.count()} db meglévő kép törlése...")
                while torles_gombok.count() > 0:
                    torles_gombok.first.click(force=True)
                    time.sleep(1.5) # Várunk, amíg a törlés a háttérben megtörténik
            else:
                print("   🧹 A kategória eddig is üres volt (nincs törlendő kép).")

            page.remove_listener("dialog", handle_dialog)
            # ----------------------------------

            # --- ÚJ KÉP FELTÖLTÉSE ---
            file_input = page.locator("input#newImage")
            file_input.set_input_files(file_path)

            print("   ⏳ Új kollázs feltöltése a szerverre folyamatban...")
            time.sleep(4)

            page.locator("a#save_close").click()

            # Visszavárjuk a valódi táblázatot
            page.locator("table#categoriesList:not(.fixedHeader)").first.wait_for(state="visible", timeout=15000)

            print(f"   ✅ Kép sikeresen kicserélve ehhez: {kat_id}!")

        except Exception as e:
            print(f"   ❌ Hiba a feltöltés során ({kat_id}): {e}")

    page.close()
    print("\n✅ Képcsere fázis lezárva.")

# ==============================================================================
# --- MAIN FLOW ---
# ==============================================================================
def bejelentkezes_kezelese(browser: Browser, username, password, state_fajl="state.json"):
    if os.path.exists(state_fajl):
        print(f"\nMeglévő session betöltése.")
        try:
            context = browser.new_context(storage_state=state_fajl, no_viewport=True, color_scheme='light')
            p = context.new_page()
            p.goto("https://szvgtoolsshop.hu/administrator/index.php?view=store", timeout=15000)
            p.locator("#searchField_all").wait_for(timeout=5000)
            p.close()
            return context
        except:
            print("❌ Érvénytelen session, új login...")

    context = browser.new_context(no_viewport=True, color_scheme='light')
    page = context.new_page()
    try:
        page.goto("https://szvgtoolsshop.hu/administrator/", timeout=15000)
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
    F_NEV = os.environ.get("ADMIN_USERNAME")
    J_SZO = os.environ.get("ADMIN_PASSWORD")
    STATE_F = "state.json"

    print("\n" + "=" * 50)
    print(" 📸 KÉP-SCRAPER ÉS INTERAKTÍV KOLLÁZS ASSZISZTENS 📸")
    print("=" * 50)

    fokategoria = input("\nKérlek add meg a főkategória PONTOS nevét (pl. INGCO termékek): ").strip()

    clean_fokat = tiszta_nev(fokategoria)
    scr_prog_f = f"scraper_progress_{clean_fokat}.json"
    coll_prog_f = f"collage_progress_{clean_fokat}.json"

    folytatas = False
    letoltes_szukseges = True  # Alapértelmezett, ha új
    kivan_db = 10
    kivalasztott_mod = "random"

    # --- OKOS FOLYTATÁS MENÜ ---
    if os.path.exists(scr_prog_f):
        print(f"\n⚠️ Találtam egy mentett állapotot a(z) '{fokategoria}' kategóriához.")
        print("  1: Folytatás a LETÖLTÉSTŐL (A pók átugorja a kész képeket, és befejezi a maradékot)")
        print("  2: Ugrás egyenesen a KOLLÁZSOKHOZ (Ha a letöltés már teljesen befejeződött)")
        print("  3: ÚJRAKEZDÉS (Régi mentések törlése, tiszta lap)")
        valasz_folytat = input("Választás (1-3): ").strip()

        if valasz_folytat == '1':
            folytatas = True
            letoltes_szukseges = True
            print("   ⏩ Letöltés folytatása kiválasztva. (A program emlékszik a beállításokra)")
        elif valasz_folytat == '2':
            folytatas = True
            letoltes_szukseges = False
            print("   ⏩ Ugrás a kollázsokhoz és feltöltéshez.")
        else:
            os.remove(scr_prog_f)
            if os.path.exists(coll_prog_f):
                os.remove(coll_prog_f)
            print("   🗑️ Régi mentések törölve. Tiszta lappal indulunk.")

    # --- BEÁLLÍTÁSOK (Ha újrakezdjük, vagy nincs mentés) ---
    if not folytatas:
        db_input = input("\nMax hány képet letölteni alap kategóriánként? (Alap: 10): ").strip()
        kivan_db = int(db_input) if db_input.isdigit() else 10

        print("\n--- Letöltési mód? ---")
        print("  1: Véletlenszerű (ajánlott)")
        print("  2: Arányos")
        mod_v = input("Választás (1-2): ").strip()
        kivalasztott_mod = "random" if mod_v == "1" else "even"

    # ALAPBÓL IGEN: Összesítő kollázsok letöltése automatikusan bekapcsolva
    letolt_koztes = True

    final_image_map = {}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False, args=['--start-maximized'])
        ctx = bejelentkezes_kezelese(browser, F_NEV, J_SZO, STATE_F)

        if ctx:
            page = ctx.new_page()

            befejezett_kategoriak, retry_list = allapot_betoltese_scraper(scr_prog_f)

            if letoltes_szukseges:
                print("\n" + "=" * 50)
                print(" ⚙️ 1. FÁZIS: KÉPEK LETÖLTÉSE A HÁTTÉRBEN ⚙️")
                print("=" * 50)

                if not os.path.exists(scr_prog_f):
                    print("   (Új munkamenet indítása)")
                else:
                    print(f"   (Folytatás... {len(befejezett_kategoriak)} kategória kész, {len(retry_list)} hiba)")

                try:
                    page.goto("https://szvgtoolsshop.hu/administrator/index.php?view=store", timeout=60000)
                    cel_sor = page.locator(f"table#categoriesList tbody tr td a b:has-text('{fokategoria}')").first

                    if cel_sor.count() > 0:
                        kezdo_link = cel_sor.locator("..").get_attribute("href")
                        full_kezdo_link = "https://szvgtoolsshop.hu/administrator/" + kezdo_link

                        print(f"✅ Főkategória megvan. Indul a pók...\n")

                        _, _, final_image_map = kategoria_bejaro_fázis1(page, full_kezdo_link, [fokategoria], kivan_db,
                                                                        kivalasztott_mod, scr_prog_f,
                                                                        befejezett_kategoriak, retry_list,
                                                                        letolt_koztes)

                        if retry_list:
                            print("\n" + "-" * 30)
                            print(f" ♻️ 2. KÖR: Hibás letöltések javítása ({len(retry_list)} db)")
                            print("-" * 30)

                            for item in list(retry_list):
                                try:
                                    tiszta_utvonal = [tiszta_nev(p) for p in item["kategoria_utvonal"]]
                                    mappa_path = os.path.join("Kollazs_Kepek", *tiszta_utvonal)
                                    os.makedirs(mappa_path, exist_ok=True)

                                    fajl_ut = letoltes_vegrehajtasa_fajl_visszaadas(page, item["url"], mappa_path,
                                                                                    item["fallback_idx"])

                                    if fajl_ut:
                                        kat_id = " > ".join(item["kategoria_utvonal"])
                                        if kat_id in final_image_map: final_image_map[kat_id].append(fajl_ut)

                                    retry_list.remove(item)
                                    allapot_mentese_scraper(scr_prog_f, befejezett_kategoriak, retry_list)
                                except Exception as e:
                                    print(f"      ❌ Végleges hiba: {e}")
                                    retry_list.remove(item)
                                    allapot_mentese_scraper(scr_prog_f, befejezett_kategoriak, retry_list)

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
            else:
                # --- HA A 2-ES OPCIÓT VÁLASZTOTTA (Átugorja az 1. fázist) ---
                print("\n✅ 1. Fázis (Letöltés) átugorva, adatok betöltése a mappákból...")
                page.close()
                if not final_image_map and befejezett_kategoriak:
                    print("🔄 Belső fájl-térkép rekonstruálása a Kollazs_Kepek mappából...")

                    if os.path.exists("Kollazs_Kepek"):
                        for f_id in befejezett_kategoriak:
                            tiszta_id = f_id.replace(" (Összesítő)", "")
                            utvonal = tiszta_id.split(" > ")

                            tiszta_utvonal = [tiszta_nev(p) for p in utvonal]
                            mappa_path = os.path.join("Kollazs_Kepek", *tiszta_utvonal)

                            if os.path.exists(mappa_path):
                                image_files = []
                                for filename in os.listdir(mappa_path):
                                    if filename.lower().endswith(('.jpg', '.jpeg', '.png')) and not filename.startswith(
                                            '_kollazs'):
                                        image_files.append(os.path.join(mappa_path, filename))

                                if image_files: final_image_map[f_id] = image_files
                    print(f"   ({len(final_image_map)} kategória rekonstruálva)")

            # --- KÉRDÉS A 2. FÁZIS ELŐTT ---
            kollazs_valasz = input("\n🎨 Szeretnéd most elkészíteni a kollázsokat? (i/n): ").strip().lower()

            if kollazs_valasz == 'i':
                # --- 2. FÁZIS ---
                interaktiv_kollazs_fázis2(ctx, final_image_map, coll_prog_f)

                if os.path.exists(scr_prog_f) and not os.path.exists(coll_prog_f):
                    os.remove(scr_prog_f)
                    print("🗑️ Letöltési menetfájl törölve (Minden kész).")

                # --- 3. FÁZIS ---
                valasz = input(
                    "\nSzeretnéd most automatikusan feltölteni az elkészült kollázsokat? (i/n): ").strip().lower()
                if valasz == 'i':
                    feltoltes_falis3(ctx, final_image_map)
            else:
                print("\n⏭️ Kollázskészítés és feltöltés kihagyva.")

        browser.close()
        print("\n🎉 Program befejeződött!")