import pandas as pd
import re

def szur_hibas_cikkszamok(bemeneti_fajl, kimeneti_fajl):
    # 1. Excel fájl beolvasása
    try:
        df = pd.read_excel(bemeneti_fajl)
    except Exception as e:
        print(f"Hiba a fájl beolvasásakor: {e}")
        return

    # Ellenőrizzük, hogy létezik-e a "Cikkszám" oszlop
    if "Cikkszám" not in df.columns:
        print("Hiba: Nincs 'Cikkszám' nevű oszlop a fájlban!")
        return

    # 2. Szűrési logika definiálása
    
    # Reguláris kifejezés a dátum formátumhoz (pl. 2025.03.24)
    # Formátum: 4 számjegy . 2 számjegy . 2 számjegy
    datum_regex = r'^\d{4}\.\d{2}\.\d{2}'
    
    # Reguláris kifejezés a hónapos formátumhoz (pl. aug.47, szept.90)
    # Magyar hónap rövidítések + pont + számok
    honap_regex = r'^(jan|febr|márc|ápr|máj|jún|júl|aug|szept|okt|nov|dec)\.\d+'

    def hiba_e(ertek):
        # Ha üres (NaN / None)
        if pd.isna(ertek) or str(ertek).strip() == "":
            return True
        
        s_ertek = str(ertek).strip()
        
        # Ellenőrzés dátum formátumra
        if re.match(datum_regex, s_ertek):
            return True
            
        # Ellenőrzés a hónapos formátumra
        if re.search(honap_regex, s_ertek, re.IGNORECASE):
            return True
            
        return False

    # 3. A szűrés végrehajtása
    # Kiválasztjuk azokat a sorokat, ahol a hiba_e függvény True-t ad vissza
    hibas_mask = df["Cikkszám"].apply(hiba_e)
    hibas_df = df[hibas_mask]

    # 4. Mentés külön fájlba
    if not hibas_df.empty:
        hibas_df.to_excel(kimeneti_fajl, index=False)
        print(f"Sikeresen kigyűjtve {len(hibas_df)} sor ide: {kimeneti_fajl}")
    else:
        print("Nem találtam a feltételeknek megfelelő hibás sort.")

# Futtatás
# Példa: Írd át a saját elérési utadra!
if __name__ == "__main__":
    bemenet = "/Users/szalkaiadaam/Documents/GitHub/eszkoztar/segedanyagok/programok/King Tony_Árlista_20260509_184742.xlsx"
    kimenet = "/Users/szalkaiadaam/Documents/GitHub/eszkoztar/segedanyagok/programok/King Tony_hibas_cikkszamok_20260509.xlsx"
    
    szur_hibas_cikkszamok(bemenet, kimenet)