import xml.etree.ElementTree as ET

def find_actiongroup_parents(filename):
    tree = ET.parse(filename)
    root = tree.getroot()
    print(f"\n=== ActionGroup parents in {filename} ===")
    for elem in root.iter():
        tag = elem.tag.split('}')[-1]
        if tag == 'actionGroup':
            # find parent in tree
            parent = None
            for p in root.iter():
                if elem in list(p):
                    parent = p
                    break
            parent_tag = parent.tag.split('}')[-1] if parent is not None else 'None'
            print(f"actionGroup id={elem.findtext('.//{*}actionGroupId')} has parent tag: <{parent_tag}>")

find_actiongroup_parents("scratch/extracted_rc2/wpmz/waylines.wpml")
find_actiongroup_parents("scratch/extracted_user_failing/wpmz/waylines.wpml")
find_actiongroup_parents("scratch/extracted_rc2/wpmz/template.kml")
find_actiongroup_parents("scratch/extracted_user_failing/wpmz/template.kml")
