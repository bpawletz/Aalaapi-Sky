import xml.etree.ElementTree as ET

ns = {'kml': 'http://www.opengis.net/kml/2.2', 'wpml': 'http://www.dji.com/wpmz/1.0.2'}

user_w = ET.parse("scratch/extracted_user_failing/wpmz/waylines.wpml").getroot()

placemarks = user_w.findall('.//kml:Placemark', ns)

print(f"Total Placemarks: {len(placemarks)}")

for i, pm in enumerate(placemarks):
    ags = pm.findall('wpml:actionGroup', ns)
    ag_info = []
    for ag in ags:
        ag_id = ag.findtext('wpml:actionGroupId', default='', namespaces=ns)
        start = ag.findtext('wpml:actionGroupStartIndex', default='', namespaces=ns)
        end = ag.findtext('wpml:actionGroupEndIndex', default='', namespaces=ns)
        actions = []
        for act in ag.findall('wpml:action', ns):
            act_id = act.findtext('wpml:actionId', default='', namespaces=ns)
            func = act.findtext('wpml:actionActuatorFunc', default='', namespaces=ns)
            actions.append(f"{func}(id={act_id})")
        ag_info.append(f"agId={ag_id}[start={start},end={end}] -> {','.join(actions)}")
    if i < 10 or i > 95 or i == 50:
        print(f"WP {i}: { ' | '.join(ag_info) }")
