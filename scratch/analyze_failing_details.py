import xml.etree.ElementTree as ET
import math

def haversine(lat1, lon1, lat2, lon2):
    R = 6371000 # meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

tree = ET.parse("scratch/extracted_user_failing/wpmz/waylines.wpml")
root = tree.getroot()

pms = root.findall('.//{*}Placemark')
print(f"Total Placemarks: {len(pms)}")

coords_list = []
total_dist = 0.0

for i, pm in enumerate(pms):
    c_str = pm.findtext('.//{*}coordinates', default='').strip()
    parts = c_str.split(',')
    lon = float(parts[0])
    lat = float(parts[1])
    coords_list.append((lat, lon))
    if i > 0:
        d = haversine(coords_list[i-1][0], coords_list[i-1][1], lat, lon)
        total_dist += d
        if d < 0.01:
            print(f"WARNING: Co-located waypoints! WP {i-1} and WP {i} distance = {d:.4f} meters")

print(f"Total calculated path distance: {total_dist:.2f} meters")
print(f"Start point: {coords_list[0]}")
print(f"End point: {coords_list[-1]}")

print("\n--- ACTION GROUP SUMMARY ---")
action_count = 0
for i, pm in enumerate(pms):
    ags = pm.findall('{*}actionGroup')
    for ag in ags:
        ag_id = ag.findtext('{*}actionGroupId', default='')
        start = ag.findtext('{*}actionGroupStartIndex', default='')
        end = ag.findtext('{*}actionGroupEndIndex', default='')
        mode = ag.findtext('{*}actionGroupMode', default='')
        trig = ag.findtext('.//{*}actionTriggerType', default='')
        actions = ag.findall('{*}action')
        for act in actions:
            act_id = act.findtext('{*}actionId', default='')
            func = act.findtext('{*}actionActuatorFunc', default='')
            action_count += 1
            if i in [0, 1, 2, 63, 64, 65, 99]:
                print(f"WP {i}: agId={ag_id}(start={start},end={end},mode={mode},trig={trig}) -> actionId={act_id}, func={func}")

print(f"Total actions across all waypoints: {action_count}")
