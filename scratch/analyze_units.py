with open("index.js", "r", encoding="utf-8") as f:
    lines = f.readlines()

for idx, line in enumerate(lines):
    if any(k in line for k in ["cachedUnitSystem", "syncDisplayValues", "aalaapi_sky_unit_system"]):
        print(f"Line {idx+1}: {line.strip()}")
