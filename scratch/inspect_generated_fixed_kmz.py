import zipfile
import xml.etree.ElementTree as ET

kmz_path = "354A8F93-759C-42C3-A8D5-746F79C7622A_fixed.kmz"

with zipfile.ZipFile(kmz_path, 'r') as z:
    t_txt = z.read("wpmz/template.kml").decode('utf-8')
    w_txt = z.read("wpmz/waylines.wpml").decode('utf-8')

print("Template length:", len(t_txt))
print("Waylines length:", len(w_txt))

try:
    tree = ET.fromstring(w_txt)
    pms = tree.findall('.//{*}Placemark')
    print(f"Placemarks found in generated waylines.wpml: {len(pms)}")
    if len(pms) > 0:
        print("First placemark tag:")
        print(ET.tostring(pms[0], encoding='utf-8').decode('utf-8'))
except Exception as e:
    print("XML ERR:", e)
