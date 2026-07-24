import zipfile
import os
import xml.etree.ElementTree as ET

input_kmz = "354A8F93-759C-42C3-A8D5-746F79C7622A.kmz"
extract_dir = "scratch/extracted_user_failing"

# Read waylines.wpml
waylines_path = os.path.join(extract_dir, "wpmz", "waylines.wpml")
template_path = os.path.join(extract_dir, "wpmz", "template.kml")

with open(template_path, 'r', encoding='utf-8') as f:
    t_content = f.read()

with open(waylines_path, 'r', encoding='utf-8') as f:
    w_content = f.read()

# Apply fixes:
# 1. Namespace
t_fixed = t_content.replace('http://www.dji.com/wpmz/1.0.2', 'http://www.uav.com/wpmz/1.0.2')
w_fixed = w_content.replace('http://www.dji.com/wpmz/1.0.2', 'http://www.uav.com/wpmz/1.0.2')

# 2. Replace gimbalRotate block with gimbalEvenlyRotate
import re
gimbal_rotate_pattern = re.compile(
    r'<wpml:actionActuatorFunc>gimbalRotate</wpml:actionActuatorFunc>\s*'
    r'<wpml:actionActuatorFuncParam>.*?</wpml:actionActuatorFuncParam>',
    re.DOTALL
)

def fix_gimbal(match):
    # Extract pitch angle if present
    pitch_match = re.search(r'<wpml:gimbalPitchRotateAngle>(.*?)</wpml:gimbalPitchRotateAngle>', match.group(0))
    pitch = pitch_match.group(1) if pitch_match else "-45"
    return f"""<wpml:actionActuatorFunc>gimbalEvenlyRotate</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>
              <wpml:gimbalPitchRotateAngle>{pitch}</wpml:gimbalPitchRotateAngle>
              <wpml:gimbalRollRotateAngle>0</wpml:gimbalRollRotateAngle>
              <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
            </wpml:actionActuatorFuncParam>"""

w_fixed = gimbal_rotate_pattern.sub(fix_gimbal, w_fixed)

output_fixed_kmz = "354A8F93-759C-42C3-A8D5-746F79C7622A_fixed.kmz"
with zipfile.ZipFile(output_fixed_kmz, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr("wpmz/template.kml", t_fixed)
    z.writestr("wpmz/waylines.wpml", w_fixed)

print(f"Created fixed KMZ: {output_fixed_kmz}")
print("Fixed template header snippet:")
print(t_fixed[:300])
print("\nFixed waylines snippet around gimbal action:")
for line in w_fixed.splitlines()[:60]:
    if 'gimbal' in line:
        print("  ", line)
