import xml.etree.ElementTree as ET
import math

ns = {'kml': 'http://www.opengis.net/kml/2.2', 'wpml': 'http://www.dji.com/wpmz/1.0.2'}

rc2_tree = ET.parse("scratch/extracted_rc2/wpmz/waylines.wpml")
rc2_root = rc2_tree.getroot()

user_tree = ET.parse("scratch/extracted_user_failing/wpmz/waylines.wpml")
user_root = user_tree.getroot()

print("=== FOLDER ELEMENTS ===")
rc2_folder = rc2_root.find('.//kml:Folder', ns)
user_folder = user_root.find('.//kml:Folder', ns)

print("RC2 Folder children:")
for c in rc2_folder:
    if c.tag.endswith('Placemark'):
        break
    print(f"  <{c.tag.split('}')[-1]}>: {c.text}")

print("\nUser Folder children:")
for c in user_folder:
    if c.tag.endswith('Placemark'):
        break
    print(f"  <{c.tag.split('}')[-1]}>: {c.text}")

# Check all 100 placemarks in user KMZ for anomalies
user_pms = user_root.findall('.//kml:Placemark', ns)
print(f"\nScanning all {len(user_pms)} placemarks in user failing KMZ...")

anomalies = []
for i, pm in enumerate(user_pms):
    # Coords
    c_elem = pm.find('.//kml:coordinates', ns)
    if c_elem is None or not c_elem.text:
        anomalies.append((i, "Missing coordinates"))
    else:
        parts = c_elem.text.strip().split(',')
        if len(parts) < 2:
            anomalies.append((i, f"Invalid coords string: {c_elem.text}"))
        else:
            try:
                lon = float(parts[0])
                lat = float(parts[1])
                if math.isnan(lon) or math.isnan(lat):
                    anomalies.append((i, f"NaN coords: {c_elem.text}"))
            except ValueError:
                anomalies.append((i, f"Non-numeric coords: {c_elem.text}"))

    # executeHeight
    h_elem = pm.find('wpml:executeHeight', ns)
    if h_elem is None or not h_elem.text:
        anomalies.append((i, "Missing executeHeight"))
    else:
        try:
            h = float(h_elem.text)
            if math.isnan(h):
                anomalies.append((i, f"NaN executeHeight: {h_elem.text}"))
        except ValueError:
            anomalies.append((i, f"Non-numeric executeHeight: {h_elem.text}"))

    # waypointSpeed
    s_elem = pm.find('wpml:waypointSpeed', ns)
    if s_elem is None or not s_elem.text:
        anomalies.append((i, "Missing waypointSpeed"))

    # Heading param
    hp = pm.find('wpml:waypointHeadingParam', ns)
    if hp is None:
        anomalies.append((i, "Missing waypointHeadingParam"))
    else:
        mode = hp.find('wpml:waypointHeadingMode', ns)
        if mode is None or not mode.text:
            anomalies.append((i, "Missing waypointHeadingMode"))

    # Gimbal heading param
    ghp = pm.find('wpml:waypointGimbalHeadingParam', ns)
    if ghp is None:
        anomalies.append((i, "Missing waypointGimbalHeadingParam"))
    else:
        pitch = ghp.find('wpml:waypointGimbalPitchAngle', ns)
        if pitch is None or pitch.text is None or pitch.text == 'null' or pitch.text == 'undefined':
            anomalies.append((i, f"Invalid pitch in waypointGimbalHeadingParam: {pitch.text if pitch is not None else None}"))

    # Action groups
    ags = pm.findall('wpml:actionGroup', ns)
    for ag in ags:
        actions = ag.findall('wpml:action', ns)
        for act in actions:
            func = act.find('wpml:actionActuatorFunc', ns)
            if func is None or not func.text:
                anomalies.append((i, "Action missing actionActuatorFunc"))
            params = act.find('wpml:actionActuatorFuncParam', ns)
            if params is not None:
                for pchild in params:
                    if pchild.text is None or 'null' in pchild.text or 'undefined' in pchild.text or 'NaN' in pchild.text:
                        anomalies.append((i, f"Invalid param value in action {func.text if func is not None else ''}: {pchild.tag.split('}')[-1]}={pchild.text}"))

print(f"Total anomalies found: {len(anomalies)}")
for a in anomalies:
    print(" - Waypoint", a[0], ":", a[1])
