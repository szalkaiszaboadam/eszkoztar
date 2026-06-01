import pandas as pd
from playwright.sync_api import sync_playwright, Browser, BrowserContext as Context
import time
import sys
import datetime
import os
import json
import re
from dotenv import load_dotenv


# ==============================================================================
# --- STATE MANAGEMENT ---
# Atomic write: temp fájlba ír, majd os.replace-el cseréli le.
# Ha a program crash közben áll le, a progress fájl soha nem sérül meg.
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
# Ha nem Bizonylatkészítő nézetben van az oldal, egy kattintással átváltja.
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
        pass  # Már jó nézetben vagyunk


# ==============================================================================
# --- 1. LÉPÉS: Adatbeolvasás ---
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
        print(f"   Jelenlegi oszlopok: {', '.join(df.columns.tolist())}")
        return None

    feldolgozando_lista = []
    for _, row in df.iterrows():
        # Excel dátum-hiba javítás: "6511-10" → "6511-10-01 00:00:00" → visszaalakítás
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
# --- 2. LÉPÉS: Segédfüggvények ---
# A duplikált navigációs, keresési és kategorizáló logika ki van emelve.
# ==============================================================================
def biztonsagos_navigacio(page, url, max_proba=3):
    """ERR_ABORTED és hálózati hibák ellen: max 3 próba."""
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
    """
    Megkeresi a terméket a listában cikkszám, majd márka+név alapján.
    Visszatér: a sor lokátora, vagy kivételt dob ha nem találja/duplikált.
    """
    van_cikkszam = cikkszam and cikkszam.lower() != 'nan'
    keresendo = cikkszam if van_cikkszam else nev

    sf = page.locator("#searchField_all")
    sf.wait_for(state="visible", timeout=10000)
    time.sleep(0.5)
    sf.fill(keresendo)
    sf.press("Enter")
    time.sleep(1.5)

    sorok = page.locator("tbody tr").filter(has_text=cikkszam if van_cikkszam else nev)
    sorok.first.wait_for(timeout=10000)
    talalat_db = sorok.count()

    if talalat_db == 1:
        return sorok.first

    if talalat_db == 0:
        raise Exception("Nem található a keresett termék a listában!")

    # Több találat: fokozatos szűkítés
    print(f"   ⚠️ Több találat ({talalat_db} db). Pontosítás...")

    if van_cikkszam:
        pontos = sorok.filter(has=page.get_by_text(cikkszam, exact=True))
        if pontos.count() == 1:
            print("   ✅ Pontos cikkszám egyezés alapján beazonosítva.")
            return pontos.first

    szurt = sorok
    if marka.lower() != 'nan':
        szurt = szurt.filter(has_text=marka)

    van_nev = nev and nev.lower() != 'nan'
    if van_nev:
        szurt = szurt.filter(has_text=nev)

    szurt_db = szurt.count()

    if szurt_db == 1:
        print("   ✅ Márka/Név szűrés alapján beazonosítva.")
        return szurt.first

    if szurt_db > 1 and van_nev:
        pontos_n = szurt.filter(has=page.get_by_text(nev, exact=True))
        if pontos_n.count() == 1:
            print("   ✅ Pontos név egyezés alapján beazonosítva.")
            return pontos_n.first
        raise Exception("DUPLIKÁCIÓ: Név és márka alapján is több azonos sor van.")

    if szurt_db > 1:
        raise Exception("DUPLIKÁCIÓ: Több találat maradt, de nincs Név a döntéshez.")

    raise Exception("A szűkítés után egyetlen termék sem maradt!")


def stabil_kategoria_valasztas(page, input_locator, dropdown_locator, kategoria_nev):
    """
    Megkeresi és kiválasztja a kategóriát a legördülőből.
    Pontos egyezésre törekszik, Escape-pel lép ki ha nem találja.
    """
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


def kategoriak_feldolgozasa(page, mod, kategoriak):
    """
    Elvégzi a kategorizálást a választott módban:
    - 'kategorizalo': popup-on keresztül hozzáadás a meglévőkhöz
    - 'atkategorizalo': törlés majd új kategóriák beállítása, mentéssel
    """
    if mod == "kategorizalo":
        kategorizalo_gomb = page.locator("a:has-text('A termék kategorizálása')")
        try:
            kategorizalo_gomb.wait_for(state="visible", timeout=3000)
            gomb_elerheto = True
        except:
            gomb_elerheto = False

        if not gomb_elerheto:
            print("   ℹ️ Nincs 'A termék kategorizálása' gomb — már be van kategorizálva. Átugrás.")
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

        print("   Régi kategóriák törlése...")
        for _ in range(50):
            torles = page.locator(
                "div.selectize-control.categories div.selectize-input a.remove"
            ).first
            if torles.is_visible():
                torles.click(force=True)
                time.sleep(0.3)
            else:
                break

        atkat_input = page.locator(
            "div.selectize-control.categories div.selectize-input input[type='text']"
        ).first
        dropdown = page.locator("div.selectize-dropdown.categories").first

        for kat in kategoriak:
            stabil_kategoria_valasztas(page, atkat_input, dropdown, kat)

        page.locator("a#save:has-text('Mentés')").click()
        page.wait_for_load_state("networkidle")
        print("   ✅ Mentés sikeres.")
        time.sleep(2.5)


# ==============================================================================
# --- 3. LÉPÉS: Fő Feldolgozó ---
# 1. kör: végigmegy az összes terméken, a hibásakat retry listára teszi.
# 2. kör: újrapróbálja a retry listát (duplikációs hibákat kihagyja).
# Minden lépés után atomic write-tal menti a progress-t.
# ==============================================================================
def run_processor(context: Context, termek_lista, mod, progress_fajl,
                  bemeneti_fajl_neve, base_url):

    start_index, retry_list, _ = _progress_betoltes(progress_fajl)

    if start_index > 0 or retry_list:
        print(f"\n📢 KORÁBBI ÁLLAPOT BETÖLTVE:")
        print(f"   Feldolgozva eddig: {start_index} db")
        print(f"   Javításra vár:     {len(retry_list)} db")

    feldolgozando = termek_lista[start_index:]
    sikeres_db = 0
    veglegesen_sikertelen = []

    if not feldolgozando and not retry_list:
        print("✅ Ez a munka már teljesen kész!")
        if os.path.exists(progress_fajl):
            os.remove(progress_fajl)
        return

    try:
        page = context.new_page()
    except Exception as e:
        print(f"❌ Nem sikerült böngészőlapot nyitni: {e}")
        return

    # ══════════════════════════════════════════════════════════════════════════
    # 1. KÖR
    # ══════════════════════════════════════════════════════════════════════════
    if feldolgozando:
        print(f"\n{'─' * 50}")
        print(f" 1. KÖR: {len(feldolgozando)} termék feldolgozása")
        print(f"{'─' * 50}")

        for i, (cikkszam, marka, nev, eredeti_fejlec, kategoriak) in enumerate(feldolgozando):
            aktualis_sorszam = start_index + i + 1
            van_cikkszam = cikkszam and cikkszam.lower() != 'nan'
            keresendo = cikkszam if van_cikkszam else nev

            print(f"\n[{aktualis_sorszam}/{len(termek_lista)}] "
                  f"{'Cikkszám' if van_cikkszam else 'Név'}: {keresendo}")

            try:
                if not biztonsagos_navigacio(page, f"{base_url}/administrator/"):
                    raise Exception("Admin oldal nem töltődött be 3 próba után sem.")

                bizonylatkeszito_nezet(page)

                sor = termek_megkereses(page, cikkszam, marka, nev)
                sor.locator("a[href*='view=product']").click()
                time.sleep(2)

                kategoriak_feldolgozasa(page, mod, kategoriak)

                print(f"   ✅ Sikeresen feldolgozva.")
                sikeres_db += 1

            except Exception as e:
                hiba = str(e)
                print(f"   ❌ HIBA (1. kör): {hiba}")
                retry_list.append([cikkszam, marka, nev, eredeti_fejlec, kategoriak, hiba])

            _progress_mentes(progress_fajl, aktualis_sorszam, retry_list, mod)

    # ══════════════════════════════════════════════════════════════════════════
    # 2. KÖR (Retry)
    # ══════════════════════════════════════════════════════════════════════════
    if retry_list:
        print(f"\n{'─' * 50}")
        print(f" 2. KÖR (RETRY): {len(retry_list)} db újrapróbálása")
        print(f"{'─' * 50}")

        feldolgozando_retry = list(retry_list)
        retry_list.clear()

        for i, elem in enumerate(feldolgozando_retry):
            cikkszam, marka, nev, eredeti_fejlec, kategoriak, elozo_hiba = elem
            van_cikkszam = cikkszam and cikkszam.lower() != 'nan'
            keresendo = cikkszam if van_cikkszam else nev

            print(f"\n[{i + 1}/{len(feldolgozando_retry)}] Retry: {keresendo}")

            # Duplikációs hibákat nem érdemes újrapróbálni
            if "DUPLIKÁCIÓ" in elozo_hiba.upper():
                print(f"   ⏩ Átugorva: duplikációs hiba nem javítható automatikusan.")
                veglegesen_sikertelen.append(
                    (cikkszam, marka, nev, eredeti_fejlec, kategoriak, elozo_hiba))
                _progress_mentes(progress_fajl, len(termek_lista), retry_list, mod)
                continue

            try:
                if not biztonsagos_navigacio(page, f"{base_url}/administrator/"):
                    raise Exception("Admin oldal nem töltődött be 3 próba után sem.")

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
                veglegesen_sikertelen.append(
                    (cikkszam, marka, nev, eredeti_fejlec, kategoriak, vegleges_hiba))

            _progress_mentes(progress_fajl, len(termek_lista), retry_list, mod)

    page.close()

    # Progress fájl törlése ha minden kész
    if not retry_list and os.path.exists(progress_fajl):
        os.remove(progress_fajl)
        print("\n🗑️ Progress fájl törölve (minden kész).")

    # ── ÖSSZESÍTŐ ─────────────────────────────────────────────────────────────
    print("\n" + "=" * 50)
    print(f"✅ Sikeres:        {sikeres_db} db")
    print(f"❌ Végleges hiba:  {len(veglegesen_sikertelen)} db")
    print("=" * 50)

    # ── HIBALISTA EXPORTÁLÁSA ─────────────────────────────────────────────────
    if veglegesen_sikertelen:
        try:
            os.makedirs("sikertelen_tablak", exist_ok=True)
            df_err = pd.DataFrame([
                {
                    "Cikkszám": c,
                    "Név": n,
                    "Márka": m,
                    "Alkategória": e,
                    "Hiba oka": str(h).strip()
                }
                for c, m, n, e, _, h in veglegesen_sikertelen
            ])
            alap_nev = os.path.splitext(os.path.basename(bemeneti_fajl_neve))[0]
            timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M")
            fnev = os.path.join("sikertelen_tablak", f"{alap_nev}_hiba_{mod}_{timestamp}.xlsx")
            df_err.to_excel(fnev, index=False, engine='openpyxl')
            print(f"\n💾 Hibalista mentve: {fnev}")
        except Exception as e:
            print(f"❌ Hibalista mentési hiba: {e}")


# ==============================================================================
# --- 4. LÉPÉS: Bejelentkezés ---
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
    print(" 📂 EXCEL ALAPÚ KATEGORIZÁLÓ ASSZISZTENS 📂")
    print("=" * 50)

    print("\n  1: SZVG Tools (szvgtoolsshop.hu)")
    print("  2: PTD Bolt (ptdbolt.hu)")
    shop_valasz = ""
    while shop_valasz not in ["1", "2"]:
        shop_valasz = input("Választás (1-2): ").strip()

    if shop_valasz == '1':
        FELHASZNALONEV = os.environ.get("SZVG_USERNAME")
        JELSZO         = os.environ.get("SZVG_PASSWORD")
        BASE_URL       = "https://szvgtoolsshop.hu"
        STATE_FAJL     = "state_szvg.json"
    else:
        FELHASZNALONEV = os.environ.get("PTD_USERNAME")
        JELSZO         = os.environ.get("PTD_PASSWORD")
        BASE_URL       = "https://ptdbolt.hu"
        STATE_FAJL     = "state_ptd.json"

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

    # ── ÁLLAPOT FELISMERÉS INDULÁSKOR ────────────────────────────────────────
    folytatas = False
    mod = ""

    if os.path.exists(progress_fajl):
        saved_index, saved_retry, saved_mod = _progress_betoltes(progress_fajl)
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

    if not folytatas:
        print("\n--- Mód választás ---")
        print("  1: Kategorizáló     (Hozzáadás a meglévőkhöz)")
        print("  2: Átkategorizáló   (Régi törlése, új kategóriák beállítása)")
        mod_v = ""
        while mod_v not in ["1", "2"]:
            mod_v = input("Választás (1-2): ").strip()
        mod = "kategorizalo" if mod_v == "1" else "atkategorizalo"
        mod_nev = "Kategorizáló (Hozzáadás)" if mod == "kategorizalo" else "Átkategorizáló (Törlés + Új)"
        print(f"   Mód: {mod_nev}")

    termekek = adatok_beolvasasa(valasztott_path)
    if not termekek:
        sys.exit(1)

    print(f"\n📋 {len(termekek)} termék betöltve az Excel fájlból.")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = bejelentkezes_kezelese(browser, FELHASZNALONEV, JELSZO, BASE_URL, STATE_FAJL)
        if ctx:
            run_processor(ctx, termekek, mod, progress_fajl, valasztott_path, base_url=BASE_URL)
        browser.close()

    print("\n🎉 Program befejeződött!")