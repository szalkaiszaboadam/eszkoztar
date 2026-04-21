import pandas as pd

def normalize(x):
    x = str(x).strip()
    if x in ["nan", "None", ""]:
        return None
    if x.endswith(".0"):
        x = x[:-2]
    return x


file_1 = r"D:\Nagy_Gabor\SZVG_cuccok\kennedy\alapfajlok\osszes_kategorizalt.xlsx"
file_2 = r"D:\Nagy_Gabor\SZVG_cuccok\kennedy\alapfajlok\osszes_kategorinelkul.xlsx"
file_3 = r"D:\Nagy_Gabor\SZVG_cuccok\kennedy\alapfajlok\javitott_SZVG_GoogleADs_20251003.xlsx"

df1 = pd.read_excel(file_1)
df2 = pd.read_excel(file_2)
df3 = pd.read_excel(file_3)

col1_name_1 = df1.columns[0]
col1_name_2 = df2.columns[0]
col1_name_3 = df3.columns[0]

all_items = pd.concat([
    df1[col1_name_1].map(normalize),
    df2[col1_name_2].map(normalize)
]).dropna().drop_duplicates().tolist()

df3["normalized_code"] = df3[col1_name_3].map(normalize)
df3 = df3.dropna(subset=["normalized_code"])  
df3 = df3.drop_duplicates(subset=["normalized_code"]) 

existing = df3[df3["normalized_code"].isin(all_items)]
missing = df3[~df3["normalized_code"].isin(all_items)]

missing_output = r"D:\Nagy_Gabor\SZVG_cuccok\kennedy\kesz\osszes_termek_nincsfent.xlsx"
existing_output = r"D:\Nagy_Gabor\SZVG_cuccok\kennedy\kesz\osszes_termek_fentvan.xlsx"

missing.to_excel(missing_output, index=False)
existing.to_excel(existing_output, index=False)

print("Kész!")
print(f"Google fájl egyedi cikkszámok: {df3['normalized_code'].nunique()}")
print(f"Megtalált cikkszámok (fent van): {len(existing)}")
print(f"Nem szereplő cikkszámok (nincs fent): {len(missing)}")
print(f"pipa")
