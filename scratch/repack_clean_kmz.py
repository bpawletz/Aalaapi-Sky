import zipfile
import os
import re
import xml.etree.ElementTree as ET

extract_dir = "scratch/extracted_user_failing"
waylines_path = os.path.join(extract_dir, "wpmz", "waylines.wpml")
template_path = os.path.join(extract_dir, "wpmz", "template.kml")

with open(template_path, 'r', encoding='utf-8') as f:
    t_content = f.read()

with open(waylines_path, 'r', encoding='utf-8') as f:
    w_content = f.read()

# Fix 1: Namespace
t_fixed = t_content.replace('http://www.dji.com/wpmz/1.0.2', 'http://www.uav.com/wpmz/1.0.2')
w_fixed = w_content.replace('http://www.dji.com/wpmz/1.0.2', 'http://www.uav.com/wpmz/1.0.2')

# Fix 2: Remove author/createTime/updateTime from waylines.wpml Document
w_fixed = re.sub(r'<wpml:author>.*?</wpml:author>\s*', '', w_fixed)
w_fixed = re.sub(r'<wpml:createTime>.*?</wpml:createTime>\s*', '', w_fixed)
w_fixed = re.sub(r'<wpml:updateTime>.*?</wpml:updateTime>\s*', '', w_fixed)

# Fix 3: Replace gimbalRotate with gimbalEvenlyRotate
gimbal_rotate_pattern = re.compile(
    r'<wpml:actionActuatorFunc>gimbalRotate</wpml:actionActuatorFunc>\s*'
    r'<wpml:actionActuatorFuncParam>.*?</wpml:actionActuatorFuncParam>',
    re.DOTALL
)

def fix_gimbal(match):
    pitch_match = re.search(r'<wpml:gimbalPitchRotateAngle>(.*?)</wpml:gimbalPitchRotateAngle>', match.group(0))
    pitch = pitch_match.group(1) if pitch_match else "-45"
    return f"""<wpml:actionActuatorFunc>gimbalEvenlyRotate</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>
              <wpml:gimbalPitchRotateAngle>{pitch}</wpml:gimbalPitchRotateAngle>
              <wpml:gimbalRollRotateAngle>0</wpml:gimbalRollRotateAngle>
              <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
            </wpml:actionActuatorFuncParam>"""

w_fixed = gimbal_rotate_pattern.sub(fix_gimbal, w_fixed)

# Fix 4: Fix waypointHeadingAngleEnable when waypointHeadingMode is followWayline
tree = ET.fromstring(w_fixed)
ns = {'kml': 'http://www.opengis.net/kml/2.2', 'wpml': 'http://www.uav.com/wpmz/1.0.2'}

for pm in tree.findall('.//kml:Placemark', ns):
    hp = pm.find('wpml:waypointHeadingParam', ns)
    if hp is not None:
        hm = hp.find('wpml:waypointHeadingMode', ns)
        hae = hp.find('wpml:waypointHeadingAngleEnable', ns)
        if hm is not None and hae is not None:
            if hm.text == 'followWayline':
                hae.text = '0'
            else:
                hae.text = '1'

w_fixed_xml = ET.tostring(tree, encoding='utf-8', xml_declaration=True).decode('utf-8')

# Output file: 354A8F93-759C-42C3-A8D5-746F79C7622A.kmz (OVERWRITE original in root)
output_kmz = "354A8F93-759C-42C3-A8D5-746F79C7622A.kmz"
with zipfile.ZipFile(output_kmz, 'w', compression=zipfile.ZIP_DEFLATED) as z:
    z.writestr("wpmz/template.kml", t_fixed)
    z.writestr("wpmz/waylines.wpml", w_fixed_xml)

print(f"Repacked {output_kmz} with clean ZIP structure and DEFLATE compression.")

# Inspect zip
with zipfile.ZipFile(output_kmz, 'r') as z:
    for info in z.infolist():
        print(f"  file: '{info.filename}', size: {info.file_size}, compress_size: {info.compress_size}, mode: {info.compress_type}")
