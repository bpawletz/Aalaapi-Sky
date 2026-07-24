import os
import shutil

node_path = shutil.which("node")
print("node in PATH:", node_path)

search_dirs = [
    r"C:\Program Files\nodejs",
    r"C:\Program Files (x86)\nodejs",
    os.path.expanduser(r"~\AppData\Local\Programs\node"),
    os.path.expanduser(r"~\AppData\Roaming\nvm"),
    os.path.expanduser(r"~\AppData\Local\nvs")
]

for sd in search_dirs:
    if os.path.exists(sd):
        for root, dirs, files in os.walk(sd):
            if "node.exe" in files:
                print("Found node.exe at:", os.path.join(root, "node.exe"))
