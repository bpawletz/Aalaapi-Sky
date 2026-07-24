with open("index.js", "r", encoding="utf-8") as f:
    lines = f.readlines()

queries = ["wpmz", "xmlns:wpml", "droneEnumValue", "gimbalRotate", "actionGroup", "template.kml", "waylines.wpml", "exportKmz", "buildKmz", "generateKmz", "exportToKMZ", "createKmz"]

results = {}
for q in queries:
    results[q] = []

for idx, line in enumerate(lines):
    for q in queries:
        if q.lower() in line.lower():
            results[q].append((idx + 1, line.strip()))

for q, hits in results.items():
    print(f"\n=== Query: {q} ({len(hits)} hits) ===")
    for h in hits[:15]:
        print(f"Line {h[0]}: {h[1][:120]}")
