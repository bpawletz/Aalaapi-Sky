import xml.etree.ElementTree as ET

user_w = ET.parse("scratch/extracted_user_failing/wpmz/waylines.wpml").getroot()
rc2_w = ET.parse("scratch/extracted_rc2/wpmz/waylines.wpml").getroot()

def clean_xml(elem):
    tag = elem.tag.split('}')[-1]
    text = elem.text.strip() if elem.text else None
    children = [clean_xml(c) for c in elem]
    return (tag, text, children)

print("=== USER FAILING PLACEMARK 0 ===")
pm0_u = clean_xml(user_w.find('.//{http://www.opengis.net/kml/2.2}Placemark'))
import pprint
pprint.pprint(pm0_u, depth=6)

print("\n=== RC2 PLACEMARK 0 ===")
pm0_r = clean_xml(rc2_w.find('.//{http://www.opengis.net/kml/2.2}Placemark'))
pprint.pprint(pm0_r, depth=6)
