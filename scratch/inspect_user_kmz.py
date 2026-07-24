import zipfile
import os
import xml.etree.ElementTree as ET

kmz_path = "354A8F93-759C-42C3-A8D5-746F79C7622A.kmz"
extract_dir = "scratch/extracted_user_kmz"

print(f"Extracting {kmz_path}...")
with zipfile.ZipFile(kmz_path, 'r') as zip_ref:
    zip_ref.extractall(extract_dir)
    print("Files in KMZ:")
    for name in zip_ref.namelist():
        print(" -", name)

for root_dir, dirs, files in os.walk(extract_dir):
    for f in files:
        if f.endswith('.kml') or f.endswith('.wpml'):
            full_p = os.path.join(root_dir, f)
            print(f"\n--- {full_p} ---")
            with open(full_p, 'r', encoding='utf-8') as file:
                content = file.read()
                print(content[:2000]) # First 2000 chars
                if len(content) > 2000:
                    print("\n... [TRUNCATED] ...\n")
                    print(content[-1500:]) # Last 1500 chars
