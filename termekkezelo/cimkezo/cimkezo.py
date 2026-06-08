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
def _progress_mentes(progress_fajl, index, retry_list, feluliras_mod):
    tmp = progress_fajl + ".tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump({
                "index": index,
                "retry_list": retry_list,
                "feluliras_mod": feluliras_mod
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
                    data.get("feluliras_mod", False)
                )
        except Exception as e:
            print(f"⚠️ Sérült progress fájl ({e}), elölről kezdünk.")
    return 0, [], False


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

    szukseges_oszlopok = {"Cikkszám", "Címke", "Márka", "Név"}
    if not szukseges_oszlopok.issubset(df.columns):
        print(f"❌ HIBA: Az Excel fájlnak tartalmaznia kell: {szukseges_oszlopok}")
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
        marka = str(row["Márka"]).strip()
        nev = str(row["Név"]).strip()
        cimke_string = str(row["Címke"]).strip()

        van_azonosito = (cikkszam and cikkszam.lower() != 'nan') or (nev and nev.lower() != 'nan')
        if not van_azonosito:
            continue

        if nev.lower() == 'nan':
            nev = ""

        if cimke_string and cimke_string.lower() != 'nan':
            cimke_lista = list(set(c.strip().lower() for c in cimke_string.split(',') if c.strip()))
        else:
            cimke_lista = []

        feldolgozando_lista.append((cikkszam, marka, nev, cimke_lista))

    return feldolgozando_lista


# ==============================================================================
# --- 2. LÉPÉS: Segédfüggvények ---
# A duplikált keresési és címke-logika ki van emelve, hogy ne ismétlődjön.
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
    print("   ❌ Navigáció végleges hiba: nem sikerült betölteni az oldalt.")
    return False


def termek_megkereses(page, cikkszam, marka, nev):
    """
    Megkeresi a terméket a listában cikkszám, majd márka+név alapján.
    Visszatér: a sor lokátora, vagy kivételt dob ha nem találja/duplikált.
    """
    van_cikkszam = cikkszam and cikkszam.lower() != 'nan'

    # Ha nincs cikkszám, készítünk egy "biztonságos" keresőszót a névből.
    biztonsagos_nev = nev
    if not van_cikkszam:
        biztonsagos_nev = re.split(r'["°=]', nev)[0].strip()

    # A teljes név helyett a biztonságos nevet használjuk a keresőmezőben
    keresendo = cikkszam if van_cikkszam else biztonsagos_nev

    search_field = page.locator("#searchField_all")
    search_field.wait_for(state="visible", timeout=10000)
    time.sleep(0.5)
    search_field.fill(keresendo)
    search_field.press("Enter")
    time.sleep(1.5)

    # A táblázat szűrésénél is a biztonságos nevet használjuk
    if van_cikkszam:
        sorok = page.locator("tbody tr").filter(has_text=cikkszam)
    else:
        sorok = page.locator("tbody tr").filter(has_text=biztonsagos_nev)

    sorok.first.wait_for(timeout=10000)
    talalat_db = sorok.count()

    if talalat_db == 1:
        return sorok.first

    if talalat_db == 0:
        raise Exception("Nem található a keresett termék a listában!")

    # Több találat: fokozatos szűkítés
    print(f"   ⚠️ Több találat ({talalat_db} db). Pontosítás...")

    # 1. Pontos cikkszám egyezés
    if van_cikkszam:
        pontos = sorok.filter(has=page.get_by_text(cikkszam, exact=True))
        if pontos.count() == 1:
            print("   ✅ Pontos cikkszám egyezés alapján beazonosítva.")
            return pontos.first

    # 2. Márka + Név szűrés
    szurt = sorok
    if marka.lower() != 'nan':
        szurt = szurt.filter(has_text=marka)

    van_nev = nev and nev.lower() != 'nan'
    if van_nev:
        # A Playwright pontos szűrésénél maradhat az eredeti név, de ha elszáll,
        # a korábbi filterek (biztonsagos_nev és marka) alapján dönt.
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


def cimkek_feldolgozasa(page, cimke_lista, feluliras_mod):
    """
    Ha feluliras_mod=True: törli a meglévő címkéket, majd hozzáadja az újakat.
    Ha feluliras_mod=False: csak hozzáadja (meglévők maradnak).
    """
    if feluliras_mod:
        print("   [MÓD: FELÜLÍRÁS] Meglévő címkék törlése...")
        try:
            container = page.locator("div.selectize-control.tags div.selectize-input")
            container.wait_for(state="visible", timeout=5000)
            time.sleep(1.0)
            remove_btns = container.locator("div.item a.remove")
            while remove_btns.count() > 0:
                remove_btns.first.click(force=True, timeout=2000)
                page.wait_for_timeout(200)
            print("   Meglévő címkék törölve.")
        except Exception as e:
            print(f"   ⚠️ Törlési hiba (folytatjuk): {e}")
    else:
        print("   [MÓD: HOZZÁADÁS] Meglévő címkék megtartva.")

    if not cimke_lista:
        return

    inp = page.locator(
        "div.selectize-control.tags div.selectize-input input[type='text']"
    ).first
    inp.wait_for(timeout=5000)

    for cimke in cimke_lista:
        if not cimke:
            continue
        inp.fill(cimke)
        inp.press("Space")
        time.sleep(0.2)
        inp.press("Backspace")
        time.sleep(1.0)

        dropdown = page.locator("div.selectize-dropdown.tags").first
        cel = dropdown.locator(
            f"div.option[data-value='{cimke}'], div.create:has-text('Új címke: {cimke}')"
        ).first
        cel.click(timeout=10000)
        time.sleep(0.3)


# ==============================================================================
# --- 3. LÉPÉS: Fő Feldolgozó ---
# 1. kör: végigmegy az összes terméken, a hibásakat retry listára teszi.
# 2. kör: újrapróbálja a retry listát (duplikációs hibákat kihagyja).
# Minden lépés után atomic write-tal menti a progress-t.
# ==============================================================================
def run_processor(context: Context, termek_lista, progress_fajl, bemeneti_fajl_neve,
                  base_url, feluliras_mod=False):

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

        for i, (cikkszam, marka, nev, cimke_lista) in enumerate(feldolgozando):
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

                cimkek_feldolgozasa(page, cimke_lista, feluliras_mod)

                page.locator("a#save:has-text('Mentés')").click()
                page.wait_for_load_state("networkidle")
                time.sleep(2)

                print(f"   ✅ Sikeres.")
                sikeres_db += 1

            except Exception as e:
                hiba = str(e)
                print(f"   ❌ HIBA (1. kör): {hiba}")
                retry_list.append([cikkszam, marka, nev, cimke_lista, hiba])

            _progress_mentes(progress_fajl, aktualis_sorszam, retry_list, feluliras_mod)

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
            cikkszam, marka, nev, cimke_lista, elozo_hiba = elem
            van_cikkszam = cikkszam and cikkszam.lower() != 'nan'
            keresendo = cikkszam if van_cikkszam else nev

            print(f"\n[{i + 1}/{len(feldolgozando_retry)}] Retry: {keresendo}")

            # Duplikációs hibákat nem érdemes újrapróbálni
            if "DUPLIKÁCIÓ" in elozo_hiba.upper():
                print(f"   ⏩ Átugorva: duplikációs hiba nem javítható automatikusan.")
                veglegesen_sikertelen.append((cikkszam, marka, nev, cimke_lista, elozo_hiba))
                _progress_mentes(progress_fajl, len(termek_lista), retry_list, feluliras_mod)
                continue

            try:
                if not biztonsagos_navigacio(page, f"{base_url}/administrator/"):
                    raise Exception("Admin oldal nem töltődött be 3 próba után sem.")

                bizonylatkeszito_nezet(page)

                sor = termek_megkereses(page, cikkszam, marka, nev)
                sor.locator("a[href*='view=product']").click()

                cimkek_feldolgozasa(page, cimke_lista, feluliras_mod)

                page.locator("a#save:has-text('Mentés')").click()
                page.wait_for_load_state("networkidle")
                time.sleep(2)

                print(f"   ✅ Sikeres (2. kör).")
                sikeres_db += 1

            except Exception as e:
                vegleges_hiba = str(e)
                print(f"   ❌ VÉGLEGES HIBA: {vegleges_hiba}")
                veglegesen_sikertelen.append((cikkszam, marka, nev, cimke_lista, vegleges_hiba))

            _progress_mentes(progress_fajl, len(termek_lista), retry_list, feluliras_mod)

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
                    "Márka": m,
                    "Név": n,
                    "Címke": ', '.join(l),
                    "Hiba oka": str(h).strip()
                }
                for c, m, n, l, h in veglegesen_sikertelen
            ])
            alap_nev = os.path.splitext(os.path.basename(bemeneti_fajl_neve))[0]
            timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M")
            fnev = os.path.join("sikertelen_tablak", f"{alap_nev}_hiba_{timestamp}.xlsx")
            df_err.to_excel(fnev, index=False)
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
    print(" 🏷️  TERMÉK CÍMKÉZŐ 🏷️")
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

    valasztott_fajl = ""
    while True:
        try:
            idx = int(input("Fájl sorszáma: ").strip()) - 1
            if 0 <= idx < len(excel_fajlok):
                valasztott_fajl = excel_fajlok[idx]
                break
        except (ValueError, IndexError):
            pass

    valasztott_path = os.path.join(FAJLOK_MAPPAJA, valasztott_fajl)
    progress_fajl = valasztott_path + ".progress.json"

    # ── ÁLLAPOT FELISMERÉS INDULÁSKOR ────────────────────────────────────────
    folytatas = False
    feluliras = False

    if os.path.exists(progress_fajl):
        saved_index, saved_retry, saved_feluliras = _progress_betoltes(progress_fajl)
        osszes_termek = len(adatok_beolvasasa(valasztott_path) or [])

        print(f"\n⚠️ Korábbi félbemaradt munkamenet találva ({valasztott_fajl}):")
        print(f"   Feldolgozva: {saved_index} / {osszes_termek} db")
        print(f"   Retry listán: {len(saved_retry)} db")
        print(f"   Mód: {'FELÜLÍRÁS' if saved_feluliras else 'HOZZÁADÁS'}")
        print()
        print("  1: FOLYTATÁS (onnan ahol abbahagyta)")
        print("  2: ÚJRAKEZDÉS (progress törlése, tiszta lap)")

        ujra_v = ""
        while ujra_v not in ["1", "2"]:
            ujra_v = input("Választás (1-2): ").strip()

        if ujra_v == "1":
            folytatas = True
            feluliras = saved_feluliras
            print(f"   ⏩ Folytatás. Mód: {'FELÜLÍRÁS' if feluliras else 'HOZZÁADÁS'}")
        else:
            os.remove(progress_fajl)
            print("   🗑️ Progress törölve. Tiszta lappal indulunk.")

    if not folytatas:
        print("\n--- Működési mód ---")
        print("  1: HOZZÁADÁS  (meglévő címkék maradnak, újak hozzáadva)")
        print("  2: FELÜLÍRÁS  (meglévő címkék törlése, újak felülírják)")
        mod_valasz = ""
        while mod_valasz not in ["1", "2"]:
            mod_valasz = input("Választás (1-2): ").strip()
        feluliras = (mod_valasz == "2")
        print(f"   Mód: {'FELÜLÍRÁS' if feluliras else 'HOZZÁADÁS'}")

    termekek = adatok_beolvasasa(valasztott_path)
    if not termekek:
        sys.exit(1)

    print(f"\n📋 {len(termekek)} termék betöltve az Excel fájlból.")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = bejelentkezes_kezelese(browser, FELHASZNALONEV, JELSZO, BASE_URL, STATE_FAJL)
        if ctx:
            run_processor(ctx, termekek, progress_fajl, valasztott_path,
                          base_url=BASE_URL, feluliras_mod=feluliras)
        browser.close()

    print("\n🎉 Program befejeződött!")