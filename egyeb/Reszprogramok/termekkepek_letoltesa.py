import os
import pandas as pd
import requests

input_file = "/Users/nagygabor/Library/Mobile Documents/com~apple~CloudDocs/munka_fajlok/ingco/termekek_ingco.xlsx"
output_folder = "kepek"
log_file = "letoltott_kepek.txt"
target_column = "kepek"

os.makedirs(output_folder, exist_ok=True)

df = pd.read_excel(input_file)

if target_column not in df.columns:
    print(f"Nincs '{target_column}' nevű oszlop az Excelben.")
    exit()

urls = df[target_column].dropna().astype(str)
downloaded_files = []

for cell in urls:
    parts = [url.strip() for url in cell.split(",") if url.strip()]
    for i, url in enumerate(parts, start=1):
        if "name=" in url:
            name_part = url.split("name=")[-1]
            base_name = name_part.split(".jpg")[0]
        else:
            base_name = f"kep"
        filename = f"{base_name}_{i}.jpg"
        filepath = os.path.join(output_folder, filename)
        try:
            r = requests.get(url, timeout=15)
            if r.status_code == 200 and r.content:
                with open(filepath, "wb") as f:
                    f.write(r.content)
                downloaded_files.append(filename)
                print(f"{filename} letöltve")
            else:
                print(f"Nem sikerült letölteni: {url}")
        except Exception as e:
            print(f"Hiba: {url} ({e})")

if downloaded_files:
    with open(log_file, "w", encoding="utf-8") as f:
        f.write("\n".join(downloaded_files))
    print(f"\nPipa {len(downloaded_files)} kép mentve ide: {output_folder}")
    print(f"Lista: {log_file}")
else:
    print("Nem sikerült egy képet sem letölteni.")
