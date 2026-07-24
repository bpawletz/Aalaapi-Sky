import os
import xml.etree.ElementTree as ET

def print_file_tree(dir_path):
    print(f"=== File Listing for {dir_path} ===")
    for root, dirs, files in os.walk(dir_path):
        for f in files:
            rel = os.path.relpath(os.path.join(root, f), dir_path)
            print(f"  {rel}")

print_file_tree("scratch/extracted_rc2")
print()
print_file_tree("scratch/extracted_user_kmz")

# Print full template.kml and waylines.wpml comparison details
def inspect_wpml_details(folder):
    print(f"\n================ DETAILS FOR {folder} ================")
    for fname in ["template.kml", "waylines.wpml"]:
        path = os.path.join(folder, "wpmz", fname)
        if not os.path.exists(path):
            print(f"{fname}: NOT FOUND")
            continue
        print(f"\n--- {fname} ---")
        with open(path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
            print("Total lines:", len(lines))
            # print all non-placemark lines or summary
            for line in lines[:60]:
                print(line, end='')
            if len(lines) > 60:
                print("... [snip] ...")

if os.path.exists("scratch/extracted_rc2"):
    inspect_wpml_details("scratch/extracted_rc2")
inspect_wpml_details("scratch/extracted_user_kmz")
