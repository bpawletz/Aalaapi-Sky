import zipfile
import xml.etree.ElementTree as ET

with zipfile.ZipFile("354A8F93-759C-42C3-A8D5-746F79C7622A.kmz", "r") as z:
    tree = ET.fromstring(z.read("wpmz/waylines.wpml"))

ns = {'kml': 'http://www.opengis.net/kml/2.2', 'wpml': 'http://www.uav.com/wpmz/1.0.2'}

print("=== Action Groups in 354A8F93-759C-42C3-A8D5-746F79C7622A.kmz ===")
for pm in tree.findall('.//kml:Placemark', ns):
    idx = pm.findtext('wpml:index', namespaces=ns)
    ags = pm.findall('wpml:actionGroup', ns)
    for ag in ags:
        ag_id = ag.findtext('wpml:actionGroupId', namespaces=ns)
        start = ag.findtext('wpml:actionGroupStartIndex', namespaces=ns)
        end = ag.findtext('wpml:actionGroupEndIndex', namespaces=ns)
        func = ag.findtext('.//wpml:actionActuatorFunc', namespaces=ns)
        if func == 'gimbalEvenlyRotate':
            print(f"WP {idx}: actionGroup id={ag_id}, start={start}, end={end}, func={func}")
