import xml.etree.ElementTree as ET

def get_folder_elements(path):
    tree = ET.parse(path)
    root = tree.getroot()
    folder = root.find('.//{*}Folder')
    res = []
    for elem in folder:
        if not elem.tag.endswith('Placemark'):
            tag = elem.tag.split('}')[-1]
            res.append(f"{tag}: {elem.text}")
    return res

print("=== RC2 NATIVE Folder Header ===")
for line in get_folder_elements("scratch/extracted_rc2/wpmz/waylines.wpml"):
    print("  ", line)

print("\n=== USER FAILING Folder Header ===")
for line in get_folder_elements("scratch/extracted_user_failing/wpmz/waylines.wpml"):
    print("  ", line)
