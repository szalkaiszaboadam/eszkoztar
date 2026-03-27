import pandas as pd
import os

excel_input_path = r"D:\Nagy_Gabor\SZVG_cuccok\csavarok\alapfajlok\kapupant_csavar.xlsx"
output_dir = r"D:\Nagy_Gabor\SZVG_cuccok\csavarok\kesz"
output_filename = "kesz_kapupant_csavar.xlsx"
output_path = os.path.join(output_dir, output_filename)

os.makedirs(output_dir, exist_ok=True)
df = pd.read_excel(excel_input_path, header=None)

df.iloc[:, 19] = df.iloc[:, 19] / 100   # 20. oszlop
df.iloc[:, 1] = df.iloc[:, 1] * 100     # 2. oszlop

df.to_excel(output_path, index=False, header=False)
print("Kész!")
