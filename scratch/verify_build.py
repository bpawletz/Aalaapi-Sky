with open("index.html", "r", encoding="utf-8") as f:
    txt = f.read()

print("1.25.5 in index.html:", "1.25.5" in txt)
print("uav.com in index.html:", "http://www.uav.com/wpmz/1.0.2" in txt)
print("gimbalEvenlyRotate in index.html:", "gimbalEvenlyRotate" in txt)
