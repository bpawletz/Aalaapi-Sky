import xml.etree.ElementTree as ET

tree = ET.parse('scratch/extracted_rc2/wpmz/waylines.wpml')
root = tree.getroot()

def find_poi_everywhere(elem, path=""):
    tag_clean = elem.tag.split('}')[-1]
    current_path = f"{path}/{tag_clean}"
    if 'poi' in tag_clean.lower() or (elem.text and 'poi' in elem.text.lower()):
        print(f"Path: {current_path}")
        print(f"  Tag: {elem.tag}")
        print(f"  Attribs: {elem.attrib}")
        print(f"  Text: {elem.text.strip() if elem.text else None}")
        if len(elem) > 0:
            print("  Children:")
            for child in elem:
                print(f"    <{child.tag.split('}')[-1]}>: {child.text.strip() if child.text else None}")
        print("-" * 40)
    for child in elem:
        find_poi_everywhere(child, current_path)

find_poi_everywhere(root)
