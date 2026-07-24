import zipfile

with zipfile.ZipFile("scratch/test_no_dir.kmz", "w", compression=zipfile.ZIP_DEFLATED) as z:
    z.writestr("wpmz/template.kml", "<kml>test</kml>")
    z.writestr("wpmz/waylines.wpml", "<kml>test</kml>")

print("=== Python zip entries (no dir entry) ===")
with zipfile.ZipFile("scratch/test_no_dir.kmz", "r") as z:
    for info in z.infolist():
        print(f"Entry: '{info.filename}'")
