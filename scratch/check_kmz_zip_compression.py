import zipfile
import os

def check_zip(path):
    print(f"\n=== ZIP CHECK: {path} ===")
    with zipfile.ZipFile(path, 'r') as z:
        for info in z.infolist():
            print(f"  file: '{info.filename}', size: {info.file_size}, compress_size: {info.compress_size}, mode: {info.compress_type}")

check_zip("354A8F93-759C-42C3-A8D5-746F79C7622A.kmz")
check_zip("F2DCCB5A-6705-4403-940C-097BBBF3F4B1.kmz")
