import os
import re
import time
import sys
from playwright.sync_api import sync_playwright, Browser, BrowserContext as Context
from dotenv import load_dotenv

# --- .env betöltése egy mappával feljebb ---
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env'))

# --- MAGYAR ABC SORREND ---
MAGYAR_ABC = {
    'a': 1, 'á': 2,
    'b': 3,
    'c': 4, 'cs': 5,
    'd': 6, 'dz': 7, 'dzs': 8,
    'e': 9, 'é': 10,
    'f': 11,
    'g': 12, 'gy': 13,
    'h': 14,
    'i': 15, 'í': 16,
    'j': 17,
    'k': 18,
    'l': 19, 'ly': 20,
    'm': 21,
    'n': 22, 'ny': 23,
    'o': 24, 'ó': 25, 'ö': 26, 'ő': 27,
    'p': 28,
    'r': 29,
    's': 30, 'sz': 31,
    't': 32, 'ty': 33,
    'u': 34, 'ú': 35, 'ü': 36, 'ű': 37,
    'v': 38,
    'z': 39, 'zs': 40,
    'q': 41, 'w': 42, 'x': 43, 'y': 44,  # idegen betűk a végére
}

def magyar_char_ertek(s, pos):
    """Visszaadja a magyar ABC értékét és a karakter hosszát (digráfok miatt)."""
    # Kétbetűs digráfok ellenőrzése (cs, dz, gy, ly, ny, sz, ty, zs, dzs)
    if pos + 2 < len(s) and s[pos:pos+3].lower() == 'dzs':
        return MAGYAR_ABC.get('dzs', 99), 3
    if pos + 1 < len(s):
        ketbetus = s[pos:pos+2].lower()
        if ketbetus in MAGYAR_ABC:
            return MAGYAR_ABC[ketbetus], 2
    egybetus = s[pos].lower()
    return MAGYAR_ABC.get(egybetus, 50 + ord(s[pos])), 1

def magyar_string_key(s):
    """Egy stringet alakít át magyar ABC szerinti összehasonlítható tuple-lé."""
    result = []
    i = 0
    while i < len(s):
        ertek, hossz = magyar_char_ertek(s, i)
        result.append(ertek)
        i += hossz
    return tuple(result)

# --- UTILS ---
def tiszta_nev(nev):
    return re.sub(r'[\\/*?:"<>|]', "", nev).strip()

def natural_sort_key(s):
    def no_kalkulator(match):
        ertek = float(match.group(1))
        return str(ertek * 0.001)

    s_mod = re.sub(r'NO\.?\s*(\d+)', no_kalkulator, s, flags=re.IGNORECASE)
    
    def tort_kiszamolo(match):
        szamlalo, nevezo = match.group(1).split('/')
        try:
            return str(float(szamlalo) / float(nevezo))
        except:
            return match.group(0)

    s_mod = re.sub(r'(\d+/\d+)', tort_kiszamolo, s_mod)
    parts = re.split(r'(\d+\.\d+|\d+)', s_mod)
    
    result = []
    for text in parts:
        try:
            if re.match(r'^\d+\.\d+$', text):
                result.append((0, float(text)))
            elif re.match(r'^\d+$', text):
                result.append((0, int(text)))
            else:
                # Magyar ABC szerinti rendezés szöveges részekre
                result.append((1, magyar_string_key(text)))
        except ValueError:
            result.append((1, magyar_string_key(text)))
    return result

# --- RENDEZŐ LOGIKA ---
def algoritmus_alapu_rendezes(termek_lista):
    print(f"   🔢 Matematikai sorrend kalkulálása ({len(termek_lista)} termék)...")
    rendezett = sorted(termek_lista, key=lambda x: natural_sort_key(x['nev']))
    
    print("\n   --- A KISZÁMOLT HELYES SORREND ---")
    for idx, t in enumerate(rendezett):
        print(f"   {idx+1}. {t['nev']}")
    print("   ----------------------------------\n")
    
    return [t['id'] for t in rendezett]

# --- OLDAL MÉRET BEÁLLÍTÁSA 400-ra ---
def osszes_termek_egy_oldalra(page, url):
    if "limit=" in url:
        url = re.sub(r'limit=\d+', 'limit=400', url)
    elif "?" in url:
        url += "&limit=400"
    else:
        url += "?limit=400"
    
    page.goto(url, timeout=60000)
    page.wait_for_selector("table#productsList tbody tr", timeout=5000)
    return url

# --- BOMBABIZTOS ÖNJAVÍTÓ MOZGATÁS ---
def termekek_helyere_huzasa(page, kivan_sorrend_id):
    print(f"   🏗️ Fizikai átrendezés megkezdése (Önjavító módban)...")
    
    for cel_index, t_id in enumerate(kivan_sorrend_id):
        siker = False
        
        for proba in range(3):
            cel_sor = page.locator("table#productsList tbody tr").nth(cel_index)
            current_at_pos = cel_sor.get_attribute("id")
            
            if current_at_pos == t_id:
                siker = True
                break
                
            print(f"      ➡️ [{t_id}] mozgatása a(z) {cel_index + 1}. helyre (Próba: {proba+1}/3)")
            
            try:
                mozgatando_sor = page.locator(f"tr[id='{t_id}']")
                handle = mozgatando_sor.locator(".handle")
                
                handle.drag_to(
                    cel_sor, 
                    target_position={'x': 20, 'y': 2}, 
                    force=True, 
                    timeout=3000
                )
                time.sleep(0.5)
            except Exception as e:
                print(f"         [!] Húzó hiba, újrapróbálkozás... ({e})")
                time.sleep(0.5)
                
        if not siker:
            print(f"      ⚠️ Figyelem: A böngésző nem engedte helyre tenni ezt az elemet: {t_id}")

# --- FŐ RENDEZŐ FÁZIS ---
def kategoria_rendezes_vegrehajtasa(page, url, kategoria_utvonal):
    kat_nev = kategoria_utvonal[-1]
    print(f"\n⚡ RENDEZÉS INDÍTÁSA: {kat_nev}")
    
    try:
        url_teljes = osszes_termek_egy_oldalra(page, url)
        
        termek_sorok = page.locator("table#productsList tbody tr").all()
        adatok = []
        
        for sor in termek_sorok:
            t_id = sor.get_attribute("id")
            if not t_id or t_id == "p0": continue
            
            nev_el = sor.locator("td").nth(2).locator("b")
            nev = nev_el.inner_text().strip() if nev_el.count() else "Névtelen"
            
            adatok.append({"id": t_id, "nev": nev})
            
        if len(adatok) < 2:
            print("   ℹ️ Nincs mit rendezni.")
            return

        print(f"   📦 Összesen {len(adatok)} termék található ebben a kategóriában.")
        optimalis_id_sorrend = algoritmus_alapu_rendezes(adatok)
        
        if optimalis_id_sorrend:
            termekek_helyere_huzasa(page, optimalis_id_sorrend)
            print(f"✅ Kategória kész: {kat_nev}")

    except Exception as e:
        print(f"   ❌ Hiba: {e}")

# --- BEJÁRÓ ---
def kategoria_bejaro_rendezes(page, url, kategoria_utvonal, alap_url):
    print(f"\n📂 Bejárás: {' > '.join(kategoria_utvonal)}")
    try:
        page.goto(url, timeout=60000)
        time.sleep(1)
    except: return

    bejarando = []
    if page.locator("table#categoriesList tbody tr").count() > 0:
        rows = page.locator("table#categoriesList tbody tr").all()
        for row in rows:
            try:
                nev_cella = row.locator("td").nth(2)
                nev = nev_cella.inner_text().strip()
                href = nev_cella.locator("a").get_attribute("href")
                
                alkat_szam = int(re.sub(r'\D', '', row.locator("td").nth(7).inner_text() or "0"))
                termek_szam = int(re.sub(r'\D', '', row.locator("td").nth(8).inner_text() or "0"))
                
                if alkat_szam > 0 or termek_szam > 0:
                    bejarando.append({"url": alap_url + href, "nev": nev})
            except: continue

    for link in bejarando:
        uj_utvonal = kategoria_utvonal + [link["nev"]]
        kategoria_bejaro_rendezes(page, link["url"], uj_utvonal, alap_url)

    try:
        page.goto(url, timeout=60000)
        if page.locator("table#productsList tbody tr").count() > 0:
            kategoria_rendezes_vegrehajtasa(page, url, kategoria_utvonal)
    except: pass

def bejelentkezes(browser: Browser, base_url, username, password):
    context = browser.new_context(no_viewport=True)
    page = context.new_page()
    page.goto(f"{base_url}/administrator/")
    page.fill("input[name='username']", str(username))
    page.fill("input[name='password']", str(password))
    page.click("button[type='submit']")
    page.wait_for_selector("#searchField_all", timeout=20000)
    return context

if __name__ == "__main__":
    print("Melyik webshopot szeretnéd rendezni?")
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
        print("❌ Érvénytelen választás. Kilépés.")
        sys.exit(1)

    BASE_URL = f"https://{DOMAIN}.hu"
    ADMIN_URL = f"{BASE_URL}/administrator"

    fokategoria = input("Főkategória neve a rendezéshez: ").strip()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False, args=['--start-maximized'])
        ctx = bejelentkezes(browser, BASE_URL, F_NEV, J_SZO)
        page = ctx.new_page()

        try:
            page.goto(f"{ADMIN_URL}/index.php?view=store")
            cel = page.locator(f"table#categoriesList tbody tr td a b:has-text('{fokategoria}')").first
            
            if cel.count() > 0:
                link = ADMIN_URL + "/" + cel.locator("..").get_attribute("href")
                kategoria_bejaro_rendezes(page, link, [fokategoria], ADMIN_URL + "/")
                print("\n🎉 KÉSZ! A termékek mérnöki pontossággal sorba lettek rendezve.")
            else:
                print("❌ Nem található kategória.")
        finally:
            browser.close()