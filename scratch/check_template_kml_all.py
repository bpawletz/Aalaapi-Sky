import os
import xml.etree.ElementTree as ET

dirs = ['extracted_rc2', 'extracted_root_other', 'extracted_error_dir', 'extracted_user_failing']

for d in dirs:
    p = os.path.join('scratch', d, 'wpmz', 'template.kml')
    if os.path.exists(p):
        print(f"\n==================== {d} / template.kml ====================")
        with open(p, 'r', encoding='utf-8') as f:
            content = f.read()
            print(content)
            tree = ET.fromstring(content)
            pms = tree.findall('.//{*}Placemark')
            folders = tree.findall('.//{*}Folder')
            print(f"Folders in template.kml: {len(folders)}")
            print(f"Placemarks in template.kml: {len(pms)}")
