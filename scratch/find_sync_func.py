with open("index.js", "r", encoding="utf-8") as f:
    lines = f.readlines()

for idx, line in enumerate(lines):
    if "function syncDisplayValues" in line:
        print(f"Line {idx+1}: {line.strip()}")
