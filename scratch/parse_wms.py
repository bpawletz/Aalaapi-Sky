import urllib.request
import xml.etree.ElementTree as ET

url = "https://opengeo.ncep.noaa.gov/geoserver/ows?service=wms&version=1.3.0&request=GetCapabilities"
req = urllib.request.Request(
    url, 
    headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
)

try:
    with urllib.request.urlopen(req, timeout=15) as response:
        xml_data = response.read()
    
    root = ET.fromstring(xml_data)
    
    namespaces = {'wms': 'http://www.opengis.net/wms'}
    
    layers = root.findall('.//wms:Layer', namespaces)
    if not layers:
        layers = root.findall('.//Layer')
        
    print(f"Total layers: {len(layers)}")
    # Find unique namespaces (prefixes before colon)
    prefixes = set()
    for layer in layers:
        name_elem = layer.find('wms:Name', namespaces)
        if name_elem is None:
            name_elem = layer.find('Name')
        name = name_elem.text if name_elem is not None else ""
        if name and ":" in name:
            prefixes.add(name.split(":")[0])
            
    print(f"Unique workspaces/prefixes: {prefixes}")
    
    # Print the first 100 layer names
    print("First 100 layer names:")
    count = 0
    for layer in layers:
        name_elem = layer.find('wms:Name', namespaces)
        if name_elem is None:
            name_elem = layer.find('Name')
        name = name_elem.text if name_elem is not None else ""
        title_elem = layer.find('wms:Title', namespaces)
        if title_elem is None:
            title_elem = layer.find('Title')
        title = title_elem.text if title_elem is not None else ""
        
        if name and len(name.strip()) > 0:
            print(f"  {name} | {title}")
            count += 1
            if count >= 100:
                break
            
except Exception as e:
    print(f"Error: {e}")
