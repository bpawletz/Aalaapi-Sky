import xml.etree.ElementTree as ET
import os

wpml_path = "scratch/extracted_user_kmz/wpmz/waylines.wpml"
template_path = "scratch/extracted_user_kmz/wpmz/template.kml"

tree = ET.parse(wpml_path)
root = tree.getroot()

ns = {'kml': 'http://www.opengis.net/kml/2.2', 'wpml': 'http://www.dji.com/wpmz/1.0.2'}

placemarks = root.findall('.//kml:Placemark', ns)
print(f"Total Placemarks (Waypoints) in user KMZ: {len(placemarks)}")

errors = []

for i, pm in enumerate(placemarks):
    idx_elem = pm.find('wpml:index', ns)
    idx = idx_elem.text if idx_elem is not None else None
    
    # Check coords
    coord_elem = pm.find('.//kml:coordinates', ns)
    coords = coord_elem.text.strip() if coord_elem is not None else ""
    
    # Check height
    h_elem = pm.find('wpml:executeHeight', ns)
    h = h_elem.text if h_elem is not None else None
    
    # Check action groups
    action_groups = pm.findall('wpml:actionGroup', ns)
    for ag in action_groups:
        ag_id = ag.find('wpml:actionGroupId', ns)
        ag_start = ag.find('wpml:actionGroupStartIndex', ns)
        ag_end = ag.find('wpml:actionGroupEndIndex', ns)
        
        start_val = ag_start.text if ag_start is not None else None
        end_val = ag_end.text if ag_end is not None else None
        
        if start_val != str(i) or end_val != str(i):
            errors.append(f"Placemark index {i} (wpml:index={idx}): actionGroupStartIndex={start_val}, actionGroupEndIndex={end_val} - MISMATCH with waypoint index {i}!")
            
        actions = ag.findall('wpml:action', ns)
        for act in actions:
            act_func = act.find('wpml:actionActuatorFunc', ns)
            act_func_name = act_func.text if act_func is not None else ""
            act_params = act.find('wpml:actionActuatorFuncParam', ns)
            # check param children
            if act_params is not None:
                param_tags = [c.tag.split('}')[-1] for c in act_params]
                # check for valid params per action type
                if act_func_name == 'gimbalRotate':
                    # expected gimbalPitch, gimbalRoll, gimbalYaw, etc.
                    pass

print("\n--- Validation Errors Found ---")
if not errors:
    print("No index mismatch errors found in Placemark action groups.")
else:
    print(f"Found {len(errors)} action group index mismatch errors!")
    for e in errors[:20]:
        print(" -", e)

# Also check template.kml
print("\n--- Template.kml check ---")
t_tree = ET.parse(template_path)
t_root = t_tree.getroot()
t_doc = t_root.find('kml:Document', ns)
print("Template namespace:", t_root.tag)
print("Template children tags:", [c.tag.split('}')[-1] for c in t_doc])
