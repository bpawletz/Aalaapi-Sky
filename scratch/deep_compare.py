import xml.etree.ElementTree as ET
import os

def dump_structure(elem, indent=0):
    res = []
    tag = elem.tag.split('}')[-1]
    res.append("  " * indent + tag)
    for child in elem:
        res.extend(dump_structure(child, indent + 1))
    return res

print("=== TEMPLATE.KML STRUCTURE ===")
rc2_t = ET.parse("scratch/extracted_rc2/wpmz/template.kml").getroot()
user_t = ET.parse("scratch/extracted_user_failing/wpmz/template.kml").getroot()

print("RC2 template root tag & attribs:", rc2_t.tag, rc2_t.attrib)
print("User template root tag & attribs:", user_t.tag, user_t.attrib)

print("\nRC2 template tags:")
for line in dump_structure(rc2_t)[:30]:
    print(line)

print("\nUser template tags:")
for line in dump_structure(user_t)[:30]:
    print(line)

print("\n=== WAYLINES.WPML STRUCTURE ===")
rc2_w = ET.parse("scratch/extracted_rc2/wpmz/waylines.wpml").getroot()
user_w = ET.parse("scratch/extracted_user_failing/wpmz/waylines.wpml").getroot()

print("RC2 waylines root tag & attribs:", rc2_w.tag, rc2_w.attrib)
print("User waylines root tag & attribs:", user_w.tag, user_w.attrib)

# Compare Placemark 0 children and action groups
rc2_pm0 = rc2_w.find('.//{http://www.opengis.net/kml/2.2}Placemark')
user_pm0 = user_w.find('.//{http://www.opengis.net/kml/2.2}Placemark')

print("\nRC2 Placemark 0 tags:")
for line in dump_structure(rc2_pm0):
    print(line)

print("\nUser Placemark 0 tags:")
for line in dump_structure(user_pm0):
    print(line)
