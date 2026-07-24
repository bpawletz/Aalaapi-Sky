import xml.etree.ElementTree as ET

tree = ET.parse("scratch/extracted_rc2/wpmz/waylines.wpml")
root = tree.getroot()

ns = {'kml': 'http://www.opengis.net/kml/2.2', 'wpml': 'http://www.uav.com/wpmz/1.0.2'}

print("=== ALL Action Groups in RC2 Native File ===")
for pm in root.findall('.//kml:Placemark', ns):
    idx = pm.findtext('wpml:index', namespaces=ns)
    ags = pm.findall('wpml:actionGroup', ns)
    for ag in ags:
        ag_id = ag.findtext('wpml:actionGroupId', namespaces=ns)
        start = ag.findtext('wpml:actionGroupStartIndex', namespaces=ns)
        end = ag.findtext('wpml:actionGroupEndIndex', namespaces=ns)
        func = ag.findtext('.//wpml:actionActuatorFunc', namespaces=ns)
        print(f"WP {idx}: actionGroup id={ag_id}, start={start}, end={end}, func={func}")
