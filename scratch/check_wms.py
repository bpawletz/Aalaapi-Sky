import urllib.request

urls = {
    "NWS Watch/Warn/Adv MapServer": "https://services.weather.gov/arcgis/rest/services/WWA/watch_warn_adv/MapServer?f=json",
    "NCEP GeoServer WMS": "https://opengeo.ncep.noaa.gov/geoserver/ows?service=wms&version=1.3.0&request=GetCapabilities",
    "Weather API Alerts": "https://api.weather.gov/alerts/active?area=OH"
}

for name, url in urls.items():
    try:
        print(f"Testing {name}...")
        req = urllib.request.Request(
            url, 
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
        )
        with urllib.request.urlopen(req, timeout=10) as response:
            print(f"  Status: {response.status}")
            print(f"  Content-Type: {response.headers.get('Content-Type')}")
            # If it's json, print a small preview
            if "json" in response.headers.get('Content-Type', ''):
                data = response.read(200)
                print(f"  Preview: {data[:100]}...")
    except Exception as e:
        print(f"  Error: {e}")
