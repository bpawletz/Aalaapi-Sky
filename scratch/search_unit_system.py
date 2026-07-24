with open("index.js", "r", encoding="utf-8") as f:
    lines = f.readlines()

queries = ["unit-system", "cachedUnitSystem", "syncDisplayValues", "config-modal", "config-btn"]

for q in queries:
    print(f"\n=== {q} ===")
    for idx, line in enumerate(lines):
        if q.lower() in line.lower():
            print(f"Line {idx+1}: {line.strip()[:120]}")
