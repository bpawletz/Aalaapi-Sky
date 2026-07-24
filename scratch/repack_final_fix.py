import zipfile
import re
import xml.etree.ElementTree as ET

kmz_path = "354A8F93-759C-42C3-A8D5-746F79C7622A.kmz"

with zipfile.ZipFile(kmz_path, 'r') as z:
    t_xml = z.read("wpmz/template.kml").decode('utf-8')
    w_xml = z.read("wpmz/waylines.wpml").decode('utf-8')

tree = ET.fromstring(w_xml)
ns = {'kml': 'http://www.opengis.net/kml/2.2', 'wpml': 'http://www.uav.com/wpmz/1.0.2'}

pms = tree.findall('.//kml:Placemark', ns)
num_pms = len(pms)

for i, pm in enumerate(pms):
    ags = pm.findall('wpml:actionGroup', ns)
    for ag in ags:
        func = ag.findtext('.//wpml:actionActuatorFunc', namespaces=ns)
        if func == 'gimbalEvenlyRotate':
            end_el = ag.find('wpml:actionGroupEndIndex', ns)
            if end_el is not None:
                new_end = i + 1 if i < num_pms - 1 else i
                end_el.text = str(new_end)

fixed_w_xml = ET.tostring(tree, encoding='utf-8', xml_declaration=True).decode('utf-8')

with zipfile.ZipFile("354A8F93-759C-42C3-A8D5-746F79C7622A.kmz", 'w', compression=zipfile.ZIP_DEFLATED) as z:
    z.writestr("wpmz/template.kml", t_xml)
    z.writestr("wpmz/waylines.wpml", fixed_w_xml)

print("Repacked 354A8F93-759C-42C3-A8D5-746F79C7622A.kmz with actionGroupEndIndex = idx + 1 for gimbalEvenlyRotate.")
