import xml.etree.ElementTree as ET

def dump_all_elements(filepath):
    tree = ET.parse(filepath)
    root = tree.getroot()
    print(f"\n=== All tags in {filepath} ===")
    tags = []
    for elem in root.iter():
        tag = elem.tag.split('}')[-1]
        tags.append(tag)
    print("Unique tags:", sorted(list(set(tags))))
    
    doc = root.find('.//{*}Document')
    if doc is not None:
        print("Document children tags:", [c.tag.split('}')[-1] for c in doc])
        mc = doc.find('.//{*}missionConfig')
        if mc is not None:
            print("missionConfig children tags:", [c.tag.split('}')[-1] for c in mc])

dump_all_elements("scratch/extracted_rc2/wpmz/template.kml")
dump_all_elements("scratch/extracted_rc2/wpmz/waylines.wpml")
dump_all_elements("scratch/extracted_user_failing/wpmz/template.kml")
dump_all_elements("scratch/extracted_user_failing/wpmz/waylines.wpml")
