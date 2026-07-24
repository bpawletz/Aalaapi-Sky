with open("index.js", "r", encoding="utf-8") as f:
    lines = f.readlines()

elements = ["altitude-val", "altitude-unit", "grid-spacing-val", "grid-spacing-unit", "speed-val", "speed-unit"]

for idx, line in enumerate(lines):
    for e in elements:
        if e in line:
            print(f"Line {idx+1}: {line.strip()}")
