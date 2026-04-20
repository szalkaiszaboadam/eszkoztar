import os
import re
import time
import sys
from playwright.sync_api import sync_playwright, Browser
from dotenv import load_dotenv
from datetime import datetime

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '..', '.env'))

# --- BEJELENTKEZÉS ---
def bejelentkezes(browser: Browser, base_url, username, password):
    context = browser.new_context(no_viewport=True)
    page = context.new_page()
    page.goto(f"{base_url}/administrator/")
    page.fill("input[name='username']", str(username))
    page.fill("input[name='password']", str(password))
    page.click("button[type='submit']")
    page.wait_for_selector("#searchField_all", timeout=20000)
    return context

# --- TERMÉKEK KIOLVASÁSA AZ AKTUÁLIS OLDALRÓL ---
def termekek_kiolvasasa(page, url, melyseg=0):
    """
    Elmegy a kategória URL-jére és kinyeri a termékek nevét + cikkszámát
    közvetlenül a table#productsList táblából.
    """
    termekek = []
    try:
        # 800-as limit hogy minden termék egy oldalon legyen
        if "limit=" in url:
            lim_url = re.sub(r'limit=\d+', 'limit=800', url)
        elif "?" in url:
            lim_url = url + "&limit=800"
        else:
            lim_url = url + "?limit=800"

        page.goto(lim_url, timeout=60000)
        time.sleep(0.8)

        if page.locator("table#productsList tbody tr").count() == 0:
            return termekek

        sorok = page.locator("table#productsList tbody tr").all()
        for sor in sorok:
            try:
                t_id = sor.get_attribute("id")
                if not t_id or t_id == "p0":
                    continue

                # Név: td[2] > b
                nev_el = sor.locator("td").nth(2).locator("b")
                nev = nev_el.inner_text().strip() if nev_el.count() else ""

                # Cikkszám: a HTML alapján a 6. cellában van, ami a 5-ös index
                cikkszam = sor.locator("td").nth(5).inner_text().strip()

                if nev:
                    termekek.append({'nev': nev, 'cikkszam': cikkszam})
                    # A konzolba is pontosvesszővel írjuk ki
                    print(f"{'  ' * (melyseg+1)}🏷️  {nev}; {cikkszam}")
            except Exception as e:
                print(f"{'  ' * melyseg}⚠️ Termék sor kihagyva: {e}")
                continue

    except Exception as e:
        print(f"{'  ' * melyseg}❌ Termék kiolvasás sikertelen: {e}")

    return termekek

# --- ALKATEGÓRIÁK BEJÁRÁSA (rekurzív) ---
def kategoria_bejaro(page, url, admin_url, melyseg=0):
    """
    Rekurzívan bejárja a kategóriákat és visszaadja a struktúrát listaként.
    Minden elem: { 'nev', 'melyseg', 'termek_szam', 'alkategoria_szam', 'gyerekek', 'termekek' }
    """
    eredmeny = []

    try:
        page.goto(url, timeout=60000)
        time.sleep(0.8)
    except Exception as e:
        print(f"{'  ' * melyseg}❌ Nem sikerült megnyitni: {url} ({e})")
        return eredmeny

    alkategoriak = []
    if page.locator("table#categoriesList tbody tr").count() > 0:
        rows = page.locator("table#categoriesList tbody tr").all()
        for row in rows:
            try:
                nev_cella = row.locator("td").nth(2)
                nev = nev_cella.inner_text().strip()
                href = nev_cella.locator("a").get_attribute("href")
                alkat_szam_str = row.locator("td").nth(7).inner_text() or "0"
                termek_szam_str = row.locator("td").nth(8).inner_text() or "0"
                alkat_szam = int(re.sub(r'\D', '', alkat_szam_str) or "0")
                termek_szam = int(re.sub(r'\D', '', termek_szam_str) or "0")
                alkategoriak.append({
                    'nev': nev,
                    'url': admin_url + "/" + href,
                    'alkat_szam': alkat_szam,
                    'termek_szam': termek_szam,
                })
            except Exception as e:
                print(f"{'  ' * melyseg}⚠️ Sor kihagyva: {e}")
                continue

    for alk in alkategoriak:
        print(f"{'  ' * melyseg}📂 {alk['nev']} (alkategóriák: {alk['alkat_szam']}, termékek: {alk['termek_szam']})")

        gyerekek = []
        termekek = []

        # Először rekurzívan bejárjuk az alkategóriákat
        if alk['alkat_szam'] > 0 or alk['termek_szam'] > 0:
            gyerekek = kategoria_bejaro(page, alk['url'], admin_url, melyseg + 1)

        # Majd visszajövünk és kiolvasszuk a termékeket
        if alk['termek_szam'] > 0:
            print(f"{'  ' * (melyseg+1)}🔍 Termékek kiolvasása...")
            termekek = termekek_kiolvasasa(page, alk['url'], melyseg)

        eredmeny.append({
            'nev': alk['nev'],
            'melyseg': melyseg,
            'termek_szam': alk['termek_szam'],
            'alkategoria_szam': alk['alkat_szam'],
            'gyerekek': gyerekek,
            'termekek': termekek,
        })

    return eredmeny

# --- TXT GENERÁLÁS ---
def struktura_txt(csomopont_lista, kimeneti_sorok, melyseg=0):
    for csomopont in csomopont_lista:
        nev = csomopont['nev']
        termek = csomopont['termek_szam']
        alkat = csomopont['alkategoria_szam']

        prefix = ("├── " if melyseg == 0 else "│   " * melyseg + "├── ")

        info_reszek = []
        if alkat > 0:
            info_reszek.append(f"{alkat} alkategória")
        if termek > 0:
            info_reszek.append(f"{termek} termék")
        info = f"  [{', '.join(info_reszek)}]" if info_reszek else ""

        kimeneti_sorok.append(f"{prefix}{nev}{info}")

        # Termékek kiírása a kategória alá
        if csomopont.get('termekek'):
            termek_prefix = "│   " * (melyseg + 1)
            for t in csomopont['termekek']:
                # Itt fűzzük hozzá pontosvesszővel a cikkszámot
                cikkszam_resz = f"; {t['cikkszam']}" if t['cikkszam'] else ""
                kimeneti_sorok.append(f"{termek_prefix}🏷️  {t['nev']}{cikkszam_resz}")

        if csomopont['gyerekek']:
            struktura_txt(csomopont['gyerekek'], kimeneti_sorok, melyseg + 1)

def exportalas_txtbe(fokategoria_nev, struktura, domain):
    sorok = []
    sorok.append("=" * 70)
    sorok.append(f"KATEGÓRIA STRUKTÚRA EXPORT")
    sorok.append(f"Webshop: {domain}")
    sorok.append(f"Főkategória: {fokategoria_nev}")
    sorok.append(f"Exportálva: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    sorok.append("=" * 70)
    sorok.append("")
    sorok.append(f"📁 {fokategoria_nev}")
    struktura_txt(struktura, sorok, melyseg=0)
    sorok.append("")
    sorok.append("=" * 70)

    def osszeszamol(lista):
        kat = len(lista)
        ter = sum(c['termek_szam'] for c in lista)
        for c in lista:
            k2, t2 = osszeszamol(c['gyerekek'])
            kat += k2
            ter += t2
        return kat, ter

    ossz_kat, ossz_ter = osszeszamol(struktura)
    sorok.append(f"Összesen: {ossz_kat} kategória, {ossz_ter} termék")
    sorok.append("=" * 70)

    fajlnev = f"struktura_{domain}_{fokategoria_nev[:30].replace(' ', '_').replace(',', '')}.txt"
    fajlnev = re.sub(r'[\\/*?:"<>|]', '', fajlnev)

    with open(fajlnev, 'w', encoding='utf-8') as f:
        f.write('\n'.join(sorok))

    print(f"\n✅ Exportálva: {fajlnev}")
    return fajlnev

# --- FŐPROGRAM ---
if __name__ == "__main__":
    print("Melyik webshopot szeretnéd bejárni?")
    print("  1 - SZVG Tools Shop (szvgtoolsshop.hu)")
    print("  2 - PTD Bolt (ptdbolt.hu)")
    valasztas = input("Választás (1 vagy 2): ").strip()

    if valasztas == "1":
        DOMAIN = "szvgtoolsshop"
        F_NEV = os.environ.get("SZVG_USERNAME")
        J_SZO = os.environ.get("SZVG_PASSWORD")
    elif valasztas == "2":
        DOMAIN = "ptdbolt"
        F_NEV = os.environ.get("PTD_USERNAME")
        J_SZO = os.environ.get("PTD_PASSWORD")
    else:
        print("❌ Érvénytelen választás.")
        sys.exit(1)

    BASE_URL = f"https://{DOMAIN}.hu"
    ADMIN_URL = f"{BASE_URL}/administrator"

    fokategoria = input("Főkategória neve (pontosan): ").strip()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False, args=['--start-maximized'])
        ctx = bejelentkezes(browser, BASE_URL, F_NEV, J_SZO)
        page = ctx.new_page()
        try:
            page.goto(f"{ADMIN_URL}/index.php?view=store")
            cel = page.locator(
                f"table#categoriesList tbody tr td a b:has-text('{fokategoria}')"
            ).first

            if cel.count() == 0:
                print(f"❌ Nem található főkategória: '{fokategoria}'")
                sys.exit(1)

            href = cel.locator("..").get_attribute("href")
            kat_url = ADMIN_URL + "/" + href
            print(f"\n🚀 Bejárás indul: {fokategoria}\n")
            struktura = kategoria_bejaro(page, kat_url, ADMIN_URL, melyseg=0)
            fajl = exportalas_txtbe(fokategoria, struktura, DOMAIN)
            print(f"\n🎉 KÉSZ! Fájl: {fajl}")
        finally:
            browser.close()