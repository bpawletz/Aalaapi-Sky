import xml.etree.ElementTree as ET

def get_field_stats(kmz_name):
    tree = ET.parse(f"scratch/{kmz_name}/wpmz/waylines.wpml")
    root = tree.getroot()
    
    print(f"\n==================== FIELD STATS FOR {kmz_name} ====================")
    
    # Check namespace
    ns_uri = root.tag.split('}')[0].strip('{')
    wpml_ns = ""
    for k, v in root.attrib.items():
        if 'wpml' in k:
            wpml_ns = v
    print(f"Root tag: {root.tag}")
    
    # Check Placemarks
    pms = root.findall('.//{*}Placemark')
    print(f"Placemark count: {len(pms)}")
    
    heading_modes = set()
    turn_modes = set()
    path_modes = set()
    action_funcs = set()
    
    for pm in pms:
        for elem in pm.iter():
            tag = elem.tag.split('}')[-1]
            if tag == 'waypointHeadingMode':
                heading_modes.add(elem.text)
            elif tag == 'waypointTurnMode':
                turn_modes.add(elem.text)
            elif tag == 'waypointHeadingPathMode':
                path_modes.add(elem.text)
            elif tag == 'actionActuatorFunc':
                action_funcs.add(elem.text)
                
    print(f"Heading modes: {heading_modes}")
    print(f"Turn modes: {turn_modes}")
    print(f"Heading Path modes: {path_modes}")
    print(f"Action functions: {action_funcs}")

get_field_stats("extracted_rc2")
get_field_stats("extracted_root_other")
get_field_stats("extracted_user_failing")
get_field_stats("extracted_error_dir")
