import pandas as pd

input_file = "termekek_ingco_feltoltott.xlsx"
output_file = "termekek_kulon_oszlopok.xlsx"
max_kep = 10  
excel_oszlop="kepek"


df = pd.read_excel(input_file)

if excel_oszlop not in df.columns:
    print("Nincs {excel_oszlop} -dik oszlop")
    exit()

for i in range(1, max_kep + 1):
    df[f'kep{i}'] = ''

for idx, row in df.iterrows():
    cell_value = row[excel_oszlop]
    if pd.isna(cell_value):
        continue
    urls = [url.strip() for url in str(cell_value).split(",") if url.strip()]
    for i, url in enumerate(urls):
        if i < max_kep:
            df.at[idx, f'kep{i+1}'] = url

df.to_excel(output_file, index=False)
print(f"pipa")
