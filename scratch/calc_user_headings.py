import zipfile
import xml.etree.ElementTree as ET
import math

z = zipfile.ZipFile('354A8F93-759C-42C3-A8D5-746F79C7622A.kmz')
tree = ET.fromstring(z.read('wpmz/waylines.wpml'))
ns = {'kml': 'http://www.opengis.net/kml/2.2', 'wpml': 'http://www.uav.com/wpmz/1.0.2'}

pms = tree.findall('.//kml:Placemark', ns)
coords = []
for p in pms:
    c = p.find('.//kml:coordinates', ns).text.strip().split(',')
    coords.append((float(c[0]), float(c[1])))

headings = []
for i in range(len(coords) - 1):
    lon1, lat1 = coords[i]
    lon2, lat2 = coords[i+1]
    # bearing from pt1 to pt2
    dlon = math.radians(lon2 - lon1)
    lat1_r = math.radians(lat1)
    lat2_r = math.radians(lat2)
    y = math.sin(dlon) * math.cos(lat2_r)
    x = math.cos(lat1_r) * math.sin(lat2_r) - math.sin(lat1_r) * math.cos(lat2_r) * math.cos(dlon)
    brng = (math.degrees(math.atan2(y, x)) + 360) % 360
    headings.append(round(brng, 1))

print("Leg 1 (PM 0..6):", headings[0:6])
print("Step 1->2 (PM 6->7):", headings[6])
print("Leg 2 (PM 7..13):", headings[7:13])
print("Step 2->3 (PM 13->14):", headings[13])
print("Leg 3 (PM 14..20):", headings[14:20])
print("Step 3->4 (PM 20->21):", headings[20])
print("Leg 4 (PM 21..27):", headings[21:])
