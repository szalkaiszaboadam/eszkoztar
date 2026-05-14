import xml.etree.ElementTree as ET
import pandas as pd

input_file = "/Users/nagygabor/Library/Mobile Documents/com~apple~CloudDocs/munka_fajlok/ingco/ProductFeed_2025_10_14.xml"
output_file = "termekek_ingco.xlsx"
target_marka = "ingco"
excel_oszlop="kepek"


tree = ET.parse(input_file)
root = tree.getroot()
items = root.findall(".//cikk")

if not items:
    print("Nincs egyetlen <cikk> elem sem az XML-ben.")
    exit()

first_item = items[0]
columns = [elem.tag for elem in first_item if len(elem) == 0 or elem.text]
if excel_oszlop not in columns:
    columns.append(excel_oszlop)  

data = []
for item in items:
    marka_elem = item.find("marka")
    marka_text = (marka_elem.text or "").strip().lower() if marka_elem is not None else ""

    if marka_text == target_marka.lower():
        row = {}
        for col in columns:
            element = item.find(col)
            if element is not None:
                if col == excel_oszlop:
                    images = [kep.text.strip() for kep in element.findall("kep") if kep.text]
                    row[col] = ", ".join(images)
                else:
                    row[col] = element.text.strip() if element.text else ""
            else:
                row[col] = ""
        data.append(row)

if not data:
    print(f"Nincs {target_marka}")
else:
    df = pd.DataFrame(data, columns=columns)
    df.to_excel(output_file, index=False)
    print(f"pipa")

