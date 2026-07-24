import zipfile
import os
import xml.etree.ElementTree as ET

kmz_files = {
    'user_failing': '354A8F93-759C-42C3-A8D5-746F79C7622A.kmz',
    'root_other': 'F2DCCB5A-6705-4403-940C-097BBBF3F4B1.kmz',
    'error_dir': 'error/CE0D7948-AB09-40AB-A749-C0169AB5F9AD.kmz'
}

for name, path in kmz_files.items():
    if os.path.exists(path):
        out_dir = f"scratch/extracted_{name}"
        with zipfile.ZipFile(path, 'r') as z:
            z.extractall(out_dir)
            print(f"=== Extracted {name} ({path}) ===")
            print("Files:", z.namelist())

def check_xml_diffs():
    dirs = ['extracted_rc2', 'extracted_user_failing', 'extracted_root_other', 'extracted_error_dir']
    for d in dirs:
        full_d = os.path.join('scratch', d)
        if not os.path.exists(full_d):
            continue
        print(f"\n==================== {d} ====================")
        wpmz_dir = os.path.join(full_d, 'wpmz')
        if not os.path.exists(wpmz_dir):
            print("No wpmz dir!")
            continue
        for f in os.listdir(wpmz_dir):
            fpath = os.path.join(wpmz_dir, f)
            print(f"\n--- {f} ---")
            with open(fpath, 'r', encoding='utf-8') as fp:
                txt = fp.read()
                print("Header lines:")
                print('\n'.join(txt.splitlines()[:15]))
                print("Total length:", len(txt))

check_xml_diffs()
