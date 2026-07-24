import zipfile
import xml.etree.ElementTree as ET

kmz_path = "354A8F93-759C-42C3-A8D5-746F79C7622A.kmz"

print(f"=== Inspecting Latest User File: {kmz_path} ===")
with zipfile.ZipFile(kmz_path, 'r') as z:
    for info in z.infolist():
        print(f"Zip Entry: '{info.filename}', size: {info.file_size}, mode: {info.compress_type}")
    
    t_xml = z.read("wpmz/template.kml").decode('utf-8')
    w_xml = z.read("wpmz/waylines.wpml").decode('utf-8')

print("\n--- template.kml ---")
print(t_xml)

print("\n--- waylines.wpml Header ---")
print(w_xml[:1200])

w_tree = ET.fromstring(w_xml)
ns = {'kml': 'http://www.opengis.net/kml/2.2', 'wpml': 'http://www.uav.com/wpmz/1.0.2'}

pms = w_tree.findall('.//kml:Placemark', ns)
print(f"\nTotal Placemarks: {len(pms)}")

print("\n--- Placemark 0 ---")
print(ET.tostring(pms[0], encoding='utf-8').decode('utf-8'))
