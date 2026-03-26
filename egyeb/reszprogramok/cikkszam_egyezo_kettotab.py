import pandas as pd
import os

leltar_path = "/Users/nagygabor/MELO/ingco_raktarkeszlet/leltár20251017.xls"
ingco_path = "/Users/nagygabor/MELO/ingcos_cuccok/ingco_termekek.xlsx"
output_path = "/Users/nagygabor/MELO/raktaronlevo_ingcoookkkkk.xlsx"

def safe_read_excel(path):
    try:
        return pd.read_excel(path, engine="xlrd")   # régi .xls
    except Exception:
        return pd.read_excel(path, engine="openpyxl")  # új .xlsx

print("Leltár fájl beolvasása...")
leltar_df = safe_read_excel(leltar_path)

if 'P' in leltar_df.columns:
    leltar_cikkszamok = leltar_df['P']
else:
    leltar_cikkszamok = leltar_df.iloc[:, 15]

def normalizal(szoveg):
    if pd.isna(szoveg):
        return ""
    return (
        str(szoveg)
        .replace(" ", "")
        .replace("-", "")
        .lower()
        .strip()
    )

leltar_cikkszamok_norm = leltar_cikkszamok.apply(normalizal)

print("Ingco termékek beolvasása...")
ingco_df = safe_read_excel(ingco_path)

possible_cols = [col for col in ingco_df.columns if "cikk" in col.lower() or "sku" in col.lower() or "term" in col.lower()]
if possible_cols:
    ingco_cikkszam_col = possible_cols[0]
else:
    ingco_cikkszam_col = ingco_df.columns[0]  

ingco_df["__norm_cikkszam__"] = ingco_df[ingco_cikkszam_col].apply(normalizal)

talalatok_df = ingco_df[ingco_df["__norm_cikkszam__"].isin(leltar_cikkszamok_norm)]

print(f"{len(talalatok_df)} egyezés található. Mentés ide: {output_path}")
talalatok_df.drop(columns=["__norm_cikkszam__"], inplace=True)
talalatok_df.to_excel(output_path, index=False)

print("pipa")
