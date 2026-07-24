import zipfile
import xml.etree.ElementTree as ET

# Load working RC2 native XMLs
rc2_t_tree = ET.parse("scratch/extracted_rc2/wpmz/template.kml")
rc2_w_tree = ET.parse("scratch/extracted_rc2/wpmz/waylines.wpml")

# Load new Auto-Plan KMZ
with zipfile.ZipFile("354A8F93-759C-42C3-A8D5-746F79C7622A.kmz", "r") as z:
    ap_t_tree = ET.fromstring(z.read("wpmz/template.kml"))
    ap_w_tree = ET.fromstring(z.read("wpmz/waylines.wpml"))

print("=== 1. COMPARE template.kml ===")
print("RC2 template tags:")
for elem in rc2_t_tree.getroot().iter():
    tag = elem.tag.split('}')[-1]
    if elem.text and elem.text.strip():
        print(f"  RC2 {tag}: {elem.text.strip()}")

print("\nAuto-Plan template tags:")
for elem in ap_t_tree.iter():
    tag = elem.tag.split('}')[-1]
    if elem.text and elem.text.strip():
        print(f"  AP  {tag}: {elem.text.strip()}")

print("\n=== 2. COMPARE waylines.wpml Document / Folder / Placemark ===")
rc2_pm0 = rc2_w_tree.getroot().find('.//{*}Placemark')
ap_pm0 = ap_w_tree.find('.//{*}Placemark')

print("--- RC2 PM 0 ---")
print(ET.tostring(rc2_pm0, encoding='utf-8').decode('utf-8'))

print("\n--- AP PM 0 ---")
print(ET.tostring(ap_pm0, encoding='utf-8').decode('utf-8'))
