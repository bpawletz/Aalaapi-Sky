with open("index_template.html", "r", encoding="utf-8") as f:
    lines = f.readlines()

for idx, line in enumerate(lines):
    if "version-tag" in line or "Changelog (" in line:
        print(f"Line {idx + 1}: {line.strip()}")
