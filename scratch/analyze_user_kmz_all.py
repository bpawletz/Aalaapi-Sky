import xml.etree.ElementTree as ET

ns = {'kml': 'http://www.opengis.net/kml/2.2', 'wpml': 'http://www.dji.com/wpmz/1.0.2'}

tree = ET.parse("scratch/extracted_user_failing/wpmz/waylines.wpml")
root = tree.getroot()

placemarks = root.findall('.//kml:Placemark', ns)

print(f"Total Placemarks: {len(placemarks)}")

for i, pm in enumerate(placemarks):
    # Check heading params
    hp = pm.find('wpml:waypointHeadingParam', ns)
    hm = hp.findtext('wpml:waypointHeadingMode', default='', namespaces=ns)
    ha = hp.findtext('wpml:waypointHeadingAngle', default='', namespaces=ns)
    poi = hp.findtext('wpml:waypointPoiPoint', default='', namespaces=ns)
    h_enable = hp.findtext('wpml:waypointHeadingAngleEnable', default='', namespaces=ns)
    path_mode = hp.findtext('wpml:waypointHeadingPathMode', default='', namespaces=ns)
    poi_idx = hp.findtext('wpml:waypointHeadingPoiIndex', default='', namespaces=ns)
    
    # Check turn params
    tp = pm.find('wpml:waypointTurnParam', ns)
    tm = tp.findtext('wpml:waypointTurnMode', default='', namespaces=ns)
    
    # Check coords & height
    coord = pm.findtext('.//kml:coordinates', default='', namespaces=ns).strip()
    h = pm.findtext('wpml:executeHeight', default='', namespaces=ns)
    spd = pm.findtext('wpml:waypointSpeed', default='', namespaces=ns)
    
    if i in [0, 1, 2, 63, 64, 65, 99]:
        print(f"\n--- Waypoint {i} ---")
        print(f"  Coords: {coord}, Alt: {h}, Speed: {spd}")
        print(f"  HeadingMode: {hm}, Angle: {ha}, Enable: {h_enable}, Poi: {poi}, PathMode: {path_mode}, PoiIdx: {poi_idx}")
        print(f"  TurnMode: {tm}")
