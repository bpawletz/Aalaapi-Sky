import struct
import glob
import os

def read_tiff_exif(filepath):
    with open(filepath, 'rb') as f:
        data = f.read(1024*1024) # Read first 1MB, which always contains the headers/EXIF in DNG
        
    if len(data) < 8:
        return None
        
    # Check byte order
    byte_order = data[0:2]
    if byte_order == b'II':
        endian = '<'
    elif byte_order == b'MM':
        endian = '>'
    else:
        return None
        
    # Magic number 42
    magic = struct.unpack(endian + 'H', data[2:4])[0]
    if magic != 42:
        return None
        
    # Offset to IFD0
    ifd_offset = struct.unpack(endian + 'I', data[4:8])[0]
    
    gps_info_offset = None
    exif_offset = None
    
    # Parse IFD0
    def parse_ifd(offset):
        nonlocal gps_info_offset, exif_offset
        if offset + 2 > len(data):
            return
        num_entries = struct.unpack(endian + 'H', data[offset:offset+2])[0]
        curr = offset + 2
        for _ in range(num_entries):
            if curr + 12 > len(data):
                break
            tag, typ, count, val_or_offset = struct.unpack(endian + 'HHII', data[curr:curr+12])
            
            # EXIF IFD pointer tag is 34665 (0x8769)
            if tag == 34665:
                exif_offset = val_or_offset
            # GPS Info IFD pointer tag is 34853 (0x8825)
            elif tag == 34853:
                gps_info_offset = val_or_offset
                
            curr += 12
            
    parse_ifd(ifd_offset)
    
    if not gps_info_offset:
        return None
        
    # Parse GPS IFD
    gps_data = {}
    
    def get_rational(offset):
        if offset + 8 > len(data):
            return 0.0
        num, den = struct.unpack(endian + 'II', data[offset:offset+8])
        return num / den if den != 0 else 0.0

    offset = gps_info_offset
    if offset + 2 > len(data):
        return None
        
    num_entries = struct.unpack(endian + 'H', data[offset:offset+2])[0]
    curr = offset + 2
    for _ in range(num_entries):
        if curr + 12 > len(data):
            break
        tag, typ, count, val_or_offset = struct.unpack(endian + 'HHII', data[curr:curr+12])
        
        # Tag 1: GPSLatitudeRef ('N' or 'S')
        if tag == 1:
            gps_data['lat_ref'] = chr(val_or_offset & 0xFF)
        # Tag 2: GPSLatitude (3 rationals)
        elif tag == 2:
            gps_data['lat'] = [get_rational(val_or_offset + i * 8) for i in range(3)]
        # Tag 3: GPSLongitudeRef ('E' or 'W')
        elif tag == 3:
            gps_data['lon_ref'] = chr(val_or_offset & 0xFF)
        # Tag 4: GPSLongitude (3 rationals)
        elif tag == 4:
            gps_data['lon'] = [get_rational(val_or_offset + i * 8) for i in range(3)]
        # Tag 6: GPSAltitude (1 rational)
        elif tag == 6:
            gps_data['alt'] = get_rational(val_or_offset)
            
        curr += 12
        
    if 'lat' in gps_data and 'lon' in gps_data:
        lat_deg = gps_data['lat'][0] + gps_data['lat'][1]/60.0 + gps_data['lat'][2]/3600.0
        if gps_data.get('lat_ref') == 'S':
            lat_deg = -lat_deg
            
        lon_deg = gps_data['lon'][0] + gps_data['lon'][1]/60.0 + gps_data['lon'][2]/3600.0
        if gps_data.get('lon_ref') == 'W':
            lon_deg = -lon_deg
            
        return {
            'lat': lat_deg,
            'lon': lon_deg,
            'alt': gps_data.get('alt', 0.0)
        }
        
    return None

def verify_photos():
    files = sorted(glob.glob('run/*.DNG'))
    if not files:
        print("No DNG files found.")
        return
        
    print(f"Verifying GPS EXIF data for {len(files)} photos...")
    
    first_photo = files[0]
    last_photo = files[-1]
    
    first_gps = read_tiff_exif(first_photo)
    last_gps = read_tiff_exif(last_photo)
    
    if first_gps:
        print(f"First Photo ({os.path.basename(first_photo)}):")
        print(f"  GPS Coordinate: Lat {first_gps['lat']:.7f}, Lon {first_gps['lon']:.7f}")
        print(f"  GPS Altitude: {first_gps['alt']:.2f}m")
    else:
        print(f"Failed to read GPS data for {first_photo}")
        
    if last_gps:
        print(f"Last Photo ({os.path.basename(last_photo)}):")
        print(f"  GPS Coordinate: Lat {last_gps['lat']:.7f}, Lon {last_gps['lon']:.7f}")
        print(f"  GPS Altitude: {last_gps['alt']:.2f}m")
    else:
        print(f"Failed to read GPS data for {last_photo}")

if __name__ == '__main__':
    verify_photos()
