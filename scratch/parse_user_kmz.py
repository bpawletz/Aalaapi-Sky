import zipfile
import xml.etree.ElementTree as ET

z = zipfile.ZipFile('354A8F93-759C-42C3-A8D5-746F79C7622A.kmz')
tree = ET.fromstring(z.read('wpmz/waylines.wpml'))
ns = {
    'kml': 'http://www.opengis.net/kml/2.2',
    'wpml': 'http://www.uav.com/wpmz/1.0.2'
}

pms = tree.findall('.//kml:Placemark', ns)
print(f"Total Placemarks: {len(pms)}")

for i, p in enumerate(pms):
    idx = p.find('wpml:index', ns).text
    coords = p.find('.//kml:coordinates', ns).text.strip()
    mode = p.find('.//wpml:waypointHeadingMode', ns).text
    angle = p.find('.//wpml:waypointHeadingAngle', ns).text
    enable = p.find('.//wpml:waypointHeadingAngleEnable', ns).text
    turn_mode = p.find('.//wpml:waypointTurnMode', ns).text
    actions = [a.find('wpml:actionActuatorFunc', ns).text for a in p.findall('.//wpml:action', ns)]
    print(f"PM {idx}: coords={coords} | mode={mode} | angle={angle} | enable={enable} | turn={turn_mode} | actions={actions}")
