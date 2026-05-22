import pandas as pd
import os

excel_input_path = r"/Users/nagygabor/Downloads/leltár20251017.xls"
output_dir = r"/Users/nagygabor/Downloads/"
output_filename = "kesz_csavik.xlsx"
output_path = os.path.join(output_dir, output_filename)

os.makedirs(output_dir, exist_ok=True)
df = pd.read_excel(excel_input_path, header=None)

df["Nettó beszerzési ár"] = pd.to_numeric(df["Nettó beszerzési ár"], errors='coerce') / 100

df.to_excel(output_path, index=False, header=False)
print("Kész!")
