with open("index_template.html", "r", encoding="utf-8") as f:
    lines = f.readlines()

for idx, line in enumerate(lines):
    if 'id="' in line and 'modal' in line.lower():
        print(f"Line {idx + 1}: {line.strip()}")
