import xml.etree.ElementTree as ET

def check_heading_details(kmz_name):
    tree = ET.parse(f"scratch/{kmz_name}/wpmz/waylines.wpml")
    root = tree.getroot()
    ns = {'kml': 'http://www.opengis.net/kml/2.2'}
    
    print(f"\n=== Heading Param details in {kmz_name} ===")
    for pm in root.findall('.//kml:Placemark', ns):
        hp = pm.find('.//{*}waypointHeadingParam')
        if hp is not None:
            mode = hp.findtext('{*}waypointHeadingMode')
            angle = hp.findtext('{*}waypointHeadingAngle')
            enable = hp.findtext('{*}waypointHeadingAngleEnable')
            poi_pt = hp.findtext('{*}waypointPoiPoint')
            path_mode = hp.findtext('{*}waypointHeadingPathMode')
            poi_idx = hp.findtext('{*}waypointHeadingPoiIndex')
            print(f"Mode={mode}, Angle={angle}, Enable={enable}, Poi={poi_pt}, PathMode={path_mode}, PoiIdx={poi_idx}")
            break

check_heading_details("extracted_rc2")
check_heading_details("extracted_root_other")
check_heading_details("extracted_user_failing")
