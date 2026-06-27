import urllib.request

# Construct a standard WMS GetMap request for a small tile
wms_url = (
    "https://opengeo.ncep.noaa.gov/geoserver/ows"
    "?service=WMS"
    "&version=1.3.0"
    "&request=GetMap"
    "&layers=conus:conus_bref_qcd"
    "&styles="
    "&bbox=39.5,-83.5,40.5,-82.5"  # rough bounding box near Columbus, OH
    "&width=256"
    "&height=256"
    "&srs=EPSG:4326"
    "&format=image/png"
    "&transparent=true"
)

req = urllib.request.Request(
    wms_url, 
    headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
)

try:
    print("Requesting WMS tile for conus:conus_bref_qcd...")
    with urllib.request.urlopen(req, timeout=10) as response:
        print(f"  Status: {response.status}")
        print(f"  Content-Type: {response.headers.get('Content-Type')}")
        print(f"  Content-Length: {response.headers.get('Content-Length')}")
        # Save a sample image if valid
        if "image" in response.headers.get('Content-Type', ''):
            with open("scratch/sample_radar.png", "wb") as f:
                f.write(response.read())
            print("  Successfully saved sample tile to scratch/sample_radar.png!")
except Exception as e:
    print(f"  Error: {e}")
