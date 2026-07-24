import xml.etree.ElementTree as ET

def get_xml_structure(path):
    tree = ET.parse(path)
    root = tree.getroot()
    tags = []
    for elem in root.iter():
        tag = elem.tag.split('}')[-1]
        tags.append(tag)
    return tags

rc2_tags = get_xml_structure("scratch/extracted_rc2/wpmz/waylines.wpml")
user_tags = get_xml_structure("scratch/extracted_user_failing/wpmz/waylines.wpml")

print("=== Tag counts ===")
print("RC2 unique tags:", set(rc2_tags))
print("User unique tags:", set(user_tags))
print("Tags in RC2 but NOT in User:", set(rc2_tags) - set(user_tags))
print("Tags in User but NOT in RC2:", set(user_tags) - set(rc2_tags))
