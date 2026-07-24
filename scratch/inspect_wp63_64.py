import xml.etree.ElementTree as ET

ns = {'kml': 'http://www.opengis.net/kml/2.2', 'wpml': 'http://www.dji.com/wpmz/1.0.2'}
tree = ET.parse("scratch/extracted_user_failing/wpmz/waylines.wpml")
root = tree.getroot()

placemarks = root.findall('.//kml:Placemark', ns)

print("=== PLACEMARK 63 ===")
print(ET.tostring(placemarks[63], encoding='utf-8').decode('utf-8'))

print("\n=== PLACEMARK 64 ===")
print(ET.tostring(placemarks[64], encoding='utf-8').decode('utf-8'))
