import zipfile
import os
import xml.etree.ElementTree as ET

path = "354A8F93-759C-42C3-A8D5-746F79C7622A_fixed.kmz"

with zipfile.ZipFile(path, 'r') as z:
    print("Zip contents:", z.namelist())
    template_str = z.read("wpmz/template.kml").decode('utf-8')
    waylines_str = z.read("wpmz/waylines.wpml").decode('utf-8')

print("Template len:", len(template_str))
print("Waylines len:", len(waylines_str))

print("\nWaylines first 500 chars:")
print(waylines_str[:500])

print("\nWaylines last 500 chars:")
print(waylines_str[-500:])

try:
    tree = ET.fromstring(waylines_str)
    pms = tree.findall('.//{*}Placemark')
    print(f"\nPlacemarks found by ElementTree: {len(pms)}")
except Exception as e:
    print(f"\nXML PARSE ERROR: {e}")
