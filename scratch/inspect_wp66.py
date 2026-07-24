import xml.etree.ElementTree as ET

ns = {'kml': 'http://www.opengis.net/kml/2.2', 'wpml': 'http://www.dji.com/wpmz/1.0.2'}
user_w = ET.parse("scratch/extracted_user_failing/wpmz/waylines.wpml").getroot()

placemarks = user_w.findall('.//kml:Placemark', ns)

for i, pm in enumerate(placemarks):
    ags = pm.findall('wpml:actionGroup', ns)
    if len(ags) > 1:
        print(f"Placemark index {i} has {len(ags)} action groups:")
        for ag in ags:
            ag_id = ag.findtext('wpml:actionGroupId', default='', namespaces=ns)
            start = ag.findtext('wpml:actionGroupStartIndex', default='', namespaces=ns)
            end = ag.findtext('wpml:actionGroupEndIndex', default='', namespaces=ns)
            act_funcs = [act.findtext('wpml:actionActuatorFunc', default='', namespaces=ns) for act in ag.findall('wpml:action', ns)]
            print(f"  agId={ag_id}, start={start}, end={end}, funcs={act_funcs}")
