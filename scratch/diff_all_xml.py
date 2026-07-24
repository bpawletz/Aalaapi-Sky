import xml.etree.ElementTree as ET
import os

def dump_file_full(path):
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()

rc2_t = dump_file_full("scratch/extracted_rc2/wpmz/template.kml")
user_t = dump_file_full("scratch/extracted_user_failing/wpmz/template.kml")

rc2_w = dump_file_full("scratch/extracted_rc2/wpmz/waylines.wpml")
user_w = dump_file_full("scratch/extracted_user_failing/wpmz/waylines.wpml")

print("=== TEMPLATE.KML COMPARISON ===")
print("--- RC2 template.kml ---")
print(rc2_t)
print("\n--- USER FAILING template.kml ---")
print(user_t)

print("\n=== WAYLINES.WPML FOLDER & DOCUMENT HEADER COMPARISON ===")
print("--- RC2 waylines header (first 50 lines) ---")
print('\n'.join(rc2_w.splitlines()[:50]))
print("\n--- USER FAILING waylines header (first 50 lines) ---")
print('\n'.join(user_w.splitlines()[:50]))
