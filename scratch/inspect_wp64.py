import xml.etree.ElementTree as ET

tree = ET.parse("scratch/extracted_user_failing/wpmz/waylines.wpml")
root = tree.getroot()

ns = {'kml': 'http://www.opengis.net/kml/2.2', 'wpml': 'http://www.dji.com/wpmz/1.0.2'}
pms = root.findall('.//kml:Placemark', ns)

print(f"Total placemarks: {len(pms)}")
print("\n=== Placemark 0 ===")
print(ET.tostring(pms[0], encoding='utf-8').decode('utf-8'))

print("\n=== Placemark 64 ===")
print(ET.tostring(pms[64], encoding='utf-8').decode('utf-8'))
