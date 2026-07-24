import xml.etree.ElementTree as ET

tree = ET.parse("scratch/extracted_user_failing/wpmz/waylines.wpml")
root = tree.getroot()

ns = {'kml': 'http://www.opengis.net/kml/2.2', 'wpml': 'http://www.dji.com/wpmz/1.0.2'}
pms = root.findall('.//kml:Placemark', ns)

print(f"Auditing all {len(pms)} placemarks in 354A8F93-759C-42C3-A8D5-746F79C7622A.kmz...")

issues = []

for i, pm in enumerate(pms):
    # 1. Check index element
    idx_el = pm.find('wpml:index', ns)
    if idx_el is None or idx_el.text != str(i):
        issues.append(f"WP {i}: index element mismatch (found {idx_el.text if idx_el is not None else 'None'})")

    # 2. Check coordinates
    coord_el = pm.find('.//kml:coordinates', ns)
    if coord_el is None or not coord_el.text.strip():
        issues.append(f"WP {i}: missing coordinates")
    else:
        parts = coord_el.text.strip().split(',')
        if len(parts) != 2:
            issues.append(f"WP {i}: coordinates count {len(parts)} != 2: {coord_el.text}")

    # 3. Check executeHeight
    h_el = pm.find('wpml:executeHeight', ns)
    if h_el is None:
        issues.append(f"WP {i}: missing executeHeight")
    else:
        try:
            h_val = float(h_el.text)
            if h_val <= 0:
                issues.append(f"WP {i}: non-positive executeHeight {h_val}")
        except:
            issues.append(f"WP {i}: non-numeric executeHeight {h_el.text}")

    # 4. Check waypointSpeed
    s_el = pm.find('wpml:waypointSpeed', ns)
    if s_el is None:
        issues.append(f"WP {i}: missing waypointSpeed")
    else:
        try:
            s_val = float(s_el.text)
            if s_val <= 0:
                issues.append(f"WP {i}: non-positive waypointSpeed {s_val}")
        except:
            issues.append(f"WP {i}: non-numeric waypointSpeed {s_el.text}")

    # 5. Check waypointHeadingParam
    hp = pm.find('wpml:waypointHeadingParam', ns)
    if hp is None:
        issues.append(f"WP {i}: missing waypointHeadingParam")
    else:
        hm = hp.findtext('wpml:waypointHeadingMode', default='', namespaces=ns)
        ha = hp.findtext('wpml:waypointHeadingAngle', default='', namespaces=ns)
        poi = hp.findtext('wpml:waypointPoiPoint', default='', namespaces=ns)
        hae = hp.findtext('wpml:waypointHeadingAngleEnable', default='', namespaces=ns)
        
        valid_modes = ['followWayline', 'smoothTransition', 'towardPOI', 'fixed']
        if hm not in valid_modes:
            issues.append(f"WP {i}: invalid waypointHeadingMode '{hm}'")

    # 6. Check waypointTurnParam
    tp = pm.find('wpml:waypointTurnParam', ns)
    if tp is None:
        issues.append(f"WP {i}: missing waypointTurnParam")
    else:
        tm = tp.findtext('wpml:waypointTurnMode', default='', namespaces=ns)
        valid_turn_modes = [
            'toPointAndStopWithContinuityCurvature',
            'toPointAndPassWithContinuityCurvature',
            'toPointAndStopWithDiscontinuityCurvature',
            'toPointAndPassWithDiscontinuityCurvature'
        ]
        if tm not in valid_turn_modes:
            issues.append(f"WP {i}: invalid waypointTurnMode '{tm}'")

    # 7. Check useStraightLine
    sl = pm.findtext('wpml:useStraightLine', default='', namespaces=ns)
    if sl not in ['0', '1']:
        issues.append(f"WP {i}: invalid useStraightLine '{sl}'")

    # 8. Check waypointGimbalHeadingParam
    ghp = pm.find('wpml:waypointGimbalHeadingParam', ns)
    if ghp is None:
        issues.append(f"WP {i}: missing waypointGimbalHeadingParam")
    else:
        gp = ghp.findtext('wpml:waypointGimbalPitchAngle', default='', namespaces=ns)
        gy = ghp.findtext('wpml:waypointGimbalYawAngle', default='', namespaces=ns)
        try:
            gp_val = float(gp)
            if gp_val < -90 or gp_val > 30:
                issues.append(f"WP {i}: out-of-range gimbalPitchAngle {gp_val}")
        except:
            issues.append(f"WP {i}: non-numeric gimbalPitchAngle '{gp}'")

    # 9. Check action groups
    ags = pm.findall('wpml:actionGroup', ns)
    for ag in ags:
        ag_id = ag.findtext('wpml:actionGroupId', default='', namespaces=ns)
        start = ag.findtext('wpml:actionGroupStartIndex', default='', namespaces=ns)
        end = ag.findtext('wpml:actionGroupEndIndex', default='', namespaces=ns)
        mode = ag.findtext('wpml:actionGroupMode', default='', namespaces=ns)
        
        if start != str(i) or end != str(i):
            issues.append(f"WP {i}: actionGroup id={ag_id} start={start}, end={end} does not match wp index {i}")
            
        acts = ag.findall('wpml:action', ns)
        for act in acts:
            func = act.findtext('wpml:actionActuatorFunc', default='', namespaces=ns)
            params = act.find('wpml:actionActuatorFuncParam', ns)
            if func == 'gimbalRotate':
                # Check gimbalRotate params
                pass

print(f"\nTotal audit issues found: {len(issues)}")
for iss in issues[:30]:
    print(" -", iss)
