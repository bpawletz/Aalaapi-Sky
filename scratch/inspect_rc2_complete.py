import xml.etree.ElementTree as ET

t_tree = ET.parse("scratch/extracted_rc2/wpmz/template.kml")
w_tree = ET.parse("scratch/extracted_rc2/wpmz/waylines.wpml")

print("=== RC2 TEMPLATE.KML ===")
print(ET.tostring(t_tree.getroot(), encoding='utf-8').decode('utf-8'))

print("\n=== RC2 WAYLINES.WPML (First Placemark & Header) ===")
w_root = w_tree.getroot()
print("Folder children:")
folder = w_root.find('.//{*}Folder')
for c in folder:
    if c.tag.endswith('Placemark'):
        print("  Placemark element:", c)
        print(ET.tostring(c, encoding='utf-8').decode('utf-8'))
        break
    else:
        print(f"  <{c.tag.split('}')[-1]}>: {c.text}")
