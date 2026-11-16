#!/usr/bin/env python3
"""
tools/companion/stitcher_worker.py
Aalaapi Sky - Real-Time OpenCV Field Preview Stitcher Worker (Issue #305)

Generates rapid in-field visual coverage previews within seconds of landing:
1. 2D Map Quick-Stitch (SCANS): cv2.Stitcher_create(cv2.Stitcher_SCANS)
   Generates a georeferenced orthomosaic preview for nadir/oblique survey passes.
   Includes deterministic affine georeferenced canvas composite fallback when
   feature matching homography fails on low-texture or synthetic frames.
2. 360° Sphere Quick-Stitch (PANORAMA): cv2.Stitcher_create(cv2.Stitcher_PANORAMA)
   Stitches multi-ring photo-sphere captures into an equirectangular 2:1 projection
   with embedded Google Photo Sphere (GPano) XMP metadata.
"""

import sys
import os
import json
import math
import argparse
import base64

try:
    import cv2
    import numpy as np
    HAS_OPENCV = True
except ImportError:
    HAS_OPENCV = False

def parse_args():
    parser = argparse.ArgumentParser(description="Aalaapi Sky OpenCV Field Preview Stitcher")
    parser.add_argument("--input-json", required=True, help="Path to input manifest JSON")
    parser.add_argument("--output-img", required=True, help="Destination image path (.png or .jpg)")
    parser.add_argument("--output-meta", required=False, help="Destination JSON path for metadata")
    return parser.parse_args()

def latlon_to_world(lat, lon, origin_lat, origin_lon, zoom=18):
    tile_w = 40075016.686 * math.cos(math.radians(origin_lat)) / (2.0 ** zoom)
    sin_lat0 = math.sin(math.radians(origin_lat))
    x_tile0 = ((origin_lon + 180.0) / 360.0) * (2.0 ** zoom)
    y_tile0 = (0.5 - math.log((1.0 + sin_lat0) / (1.0 - sin_lat0)) / (4.0 * math.pi)) * (2.0 ** zoom)

    sin_lat = math.sin(math.radians(lat))
    x_tile = ((lon + 180.0) / 360.0) * (2.0 ** zoom)
    y_tile = (0.5 - math.log((1.0 + sin_lat) / (1.0 - sin_lat)) / (4.0 * math.pi)) * (2.0 ** zoom)

    return (x_tile - x_tile0) * tile_w, (y_tile - y_tile0) * tile_w

def compute_footprint_bounds(photos, default_gsd_cm=1.5):
    """
    Computes [south, west, north, east] bounding box in GPS coords from photos.
    """
    lats = []
    lons = []
    alt_max = 25.0
    for p in photos:
        if isinstance(p, str):
            continue
        lat = p.get('lat') if isinstance(p, dict) else None
        lon = p.get('lon') if isinstance(p, dict) else None
        if (lat is None or lon is None) and isinstance(p, dict) and isinstance(p.get('actual'), dict):
            lat = p['actual'].get('lat')
            lon = p['actual'].get('lon')
        if lat is not None and lon is not None:
            try:
                lats.append(float(lat))
                lons.append(float(lon))
            except (ValueError, TypeError):
                pass
        alt = (p.get('altAgl') or p.get('alt') or (p.get('actual', {}).get('altAgl') if isinstance(p.get('actual'), dict) else None) or (p.get('telemetry', {}).get('worldY') if isinstance(p.get('telemetry'), dict) else None)) if isinstance(p, dict) else None
        if alt:
            try:
                alt_max = max(alt_max, float(alt))
            except (ValueError, TypeError):
                pass

    if not lats:
        return None

    min_lat = min(lats)
    max_lat = max(lats)
    min_lon = min(lons)
    max_lon = max(lons)

    # Add buffer based on altitude and 70 deg camera FOV: ~0.7 * alt in meters
    buffer_meters = max(10.0, alt_max * 0.7)
    lat_deg_buf = buffer_meters / 111139.0
    cos_lat = math.cos(math.radians((min_lat + max_lat) / 2.0))
    lon_deg_buf = buffer_meters / (111139.0 * max(0.01, cos_lat))

    return [
        min_lat - lat_deg_buf,
        min_lon - lon_deg_buf,
        max_lat + lat_deg_buf,
        max_lon + lon_deg_buf
    ]

def load_image(photo_entry, max_dim=1280):
    """
    Loads an image from file path or base64 and downscales to max_dim.
    """
    path = None
    if isinstance(photo_entry, str):
        path = photo_entry
    elif isinstance(photo_entry, dict):
        path = photo_entry.get('filePath') or photo_entry.get('rawPath') or photo_entry.get('previewUrl')

    img = None
    if path and os.path.exists(path):
        img = cv2.imread(path)
    elif isinstance(photo_entry, dict) and photo_entry.get('base64'):
        try:
            b64 = photo_entry['base64']
            if ',' in b64:
                b64 = b64.split(',', 1)[1]
            buf = base64.b64decode(b64)
            nparr = np.frombuffer(buf, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        except Exception:
            pass

    if img is None:
        return None

    h, w = img.shape[:2]
    if max(h, w) > max_dim:
        scale = max_dim / float(max(h, w))
        new_w = max(32, int(w * scale))
        new_h = max(32, int(h * scale))
        img = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_AREA)

    return img

def build_synthetic_fallback_2d(photos, output_w=1280, output_h=960, bounds=None):
    """
    Builds a reliable north-up georeferenced orthomosaic canvas composite
    when OpenCV feature-matching stitcher cannot find sufficient keypoints
    (e.g., featureless grass, water, or synthetic testing frames).
    """
    # Create canvas with RGBA transparency
    canvas = np.zeros((output_h, output_w, 4), dtype=np.uint8)
    if not photos or bounds is None:
        return canvas

    south, west, north, east = bounds
    lat_span = max(1e-6, north - south)
    lon_span = max(1e-6, east - west)

    covered_pixels = 0
    total_pixels = output_w * output_h

    # Sort photos by altitude descending so lower-alt higher-res overlays on top
    sorted_photos = sorted(photos, key=lambda p: float(p.get('altAgl') or p.get('alt') or 25.0), reverse=True)

    for p in sorted_photos:
        lat = p.get('lat')
        lon = p.get('lon')
        if lat is None or lon is None:
            continue
        lat = float(lat)
        lon = float(lon)

        # Center in canvas coordinates (0,0 is top-left, North is top)
        cx = int(((lon - west) / lon_span) * output_w)
        cy = int(((north - lat) / lat_span) * output_h)

        alt = float(p.get('altAgl') or p.get('alt') or 25.0)
        heading = float(p.get('yaw') or p.get('heading') or 0.0)

        img = load_image(p, max_dim=640)
        if img is None:
            # Generate a procedural patterned tile if image file not on disk
            pw, ph = 240, 180
            patch = np.zeros((ph, pw, 3), dtype=np.uint8)
            patch[:, :] = [35, 80, 45] # aerial terrain green
            cv2.rectangle(patch, (4, 4), (pw - 4, ph - 4), (55, 120, 65), -1)
            cv2.circle(patch, (pw // 2, ph // 2), 12, (56, 189, 248), 2)
            fname = p.get('filename') or p.get('id') or 'PHOTO'
            cv2.putText(patch, fname[:12], (10, ph // 2 - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1)
        else:
            patch = img
            ph, pw = patch.shape[:2]

        # Calculate footprint dimensions on canvas based on FOV (~70 deg)
        footprint_w_m = max(8.0, alt * 1.4)
        footprint_h_m = max(6.0, alt * 1.05)
        scale_x = (footprint_w_m / (lon_span * 111139.0 * math.cos(math.radians(lat)))) * output_w
        scale_y = (footprint_h_m / (lat_span * 111139.0)) * output_h

        scaled_w = max(30, int(scale_x))
        scaled_h = max(20, int(scale_y))
        scaled_patch = cv2.resize(patch, (scaled_w, scaled_h), interpolation=cv2.INTER_LINEAR)

        # Rotate by yaw heading
        center = (scaled_w // 2, scaled_h // 2)
        rot_mat = cv2.getRotationMatrix2D(center, -heading, 1.0)
        cos = np.abs(rot_mat[0, 0])
        sin = np.abs(rot_mat[0, 1])
        bound_w = int((scaled_h * sin) + (scaled_w * cos))
        bound_h = int((scaled_h * cos) + (scaled_w * sin))
        rot_mat[0, 2] += (bound_w / 2) - center[0]
        rot_mat[1, 2] += (bound_h / 2) - center[1]

        # Create 4-channel rotated patch
        patch_rgba = cv2.cvtColor(scaled_patch, cv2.COLOR_BGR2BGRA)
        rotated_patch = cv2.warpAffine(patch_rgba, rot_mat, (bound_w, bound_h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0))

        # Blend onto canvas
        rx0 = max(0, cx - bound_w // 2)
        ry0 = max(0, cy - bound_h // 2)
        rx1 = min(output_w, rx0 + bound_w)
        ry1 = min(output_h, ry0 + bound_h)

        pw_crop = rx1 - rx0
        ph_crop = ry1 - ry0
        if pw_crop <= 0 or ph_crop <= 0:
            continue

        src_crop = rotated_patch[0:ph_crop, 0:pw_crop]
        alpha = src_crop[:, :, 3] / 255.0
        alpha_inv = 1.0 - alpha

        for c in range(3):
            canvas[ry0:ry1, rx0:rx1, c] = (
                alpha * src_crop[:, :, c] + alpha_inv * canvas[ry0:ry1, rx0:rx1, c]
            ).astype(np.uint8)

        canvas[ry0:ry1, rx0:rx1, 3] = np.maximum(
            canvas[ry0:ry1, rx0:rx1, 3],
            src_crop[:, :, 3]
        )

    return canvas

def build_synthetic_fallback_pano(photos, output_w=2048, output_h=1024):
    """
    Builds a 2:1 equirectangular panorama preview across spherical yaw/pitch coordinates.
    """
    pano = np.zeros((output_h, output_w, 3), dtype=np.uint8)
    # Background gradient: sky gradient in top half, ground in bottom half
    for y in range(output_h):
        pitch = 90.0 - (y / float(output_h)) * 180.0 # +90 at top, -90 at bottom
        if pitch > 0:
            # Sky: deep blue at zenith, lighter near horizon
            t = pitch / 90.0
            r = int(120 * (1 - t) + 30 * t)
            g = int(180 * (1 - t) + 100 * t)
            b = int(240 * (1 - t) + 210 * t)
        else:
            # Ground: terrain tone
            t = abs(pitch) / 90.0
            r = int(45 * (1 - t) + 25 * t)
            g = int(75 * (1 - t) + 40 * t)
            b = int(40 * (1 - t) + 20 * t)
        pano[y, :] = [b, g, r]

    # Map each photo onto equirectangular coordinates
    for p in photos:
        yaw = 0.0
        pitch = 0.0
        if isinstance(p, dict):
            yaw = float(p.get('yaw') or p.get('heading') or (p.get('actual', {}).get('heading') if isinstance(p.get('actual'), dict) else 0.0) or 0.0) % 360.0
            pitch = float(p.get('pitch') or p.get('gimbalPitch') or (p.get('actual', {}).get('gimbalPitch') if isinstance(p.get('actual'), dict) else 0.0) or 0.0)

        # X corresponds to yaw (0..360 -> 0..output_w)
        cx = int((yaw / 360.0) * output_w)
        # Y corresponds to pitch (+90..-90 -> 0..output_h)
        cy = int(((90.0 - pitch) / 180.0) * output_h)

        img = load_image(p, max_dim=480)
        if img is None:
            # Generate procedural labeled camera frame patch for virtual/simulated captures
            pw, ph = 140, 100
            patch = np.zeros((ph, pw, 3), dtype=np.uint8)
            patch[:, :] = [45, 95, 60]
            cv2.rectangle(patch, (2, 2), (pw - 2, ph - 2), (90, 180, 110), 2)
            cv2.circle(patch, (pw // 2, ph // 2), 10, (56, 189, 248), 2)
            fname = (p.get('filename') or p.get('id') or f"Y{int(yaw)}P{int(pitch)}") if isinstance(p, dict) else "FRAME"
            cv2.putText(patch, str(fname)[:10], (8, ph // 2 - 4), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (255, 255, 255), 1)
            cv2.putText(patch, f"Y:{int(yaw)} P:{int(pitch)}", (8, ph // 2 + 16), cv2.FONT_HERSHEY_SIMPLEX, 0.34, (56, 189, 248), 1)
            img = patch

        ih, iw = img.shape[:2]
        target_w = max(80, int(output_w * 0.16))
        target_h = max(60, int(target_w * (ih / float(iw))))
        scaled = cv2.resize(img, (target_w, target_h), interpolation=cv2.INTER_AREA)

        x0 = cx - target_w // 2
        y0 = cy - target_h // 2

        # Wrap horizontally across 360 boundary
        for dy in range(target_h):
            py = y0 + dy
            if py < 0 or py >= output_h:
                continue
            for dx in range(target_w):
                px = (x0 + dx) % output_w
                # Blend with alpha feathering around borders
                bx = dx / float(target_w)
                by = dy / float(target_h)
                border_dist = min(bx, 1.0 - bx, by, 1.0 - by)
                alpha = min(1.0, border_dist * 5.0)
                pano[py, px] = (alpha * scaled[dy, dx] + (1.0 - alpha) * pano[py, px]).astype(np.uint8)

    return pano

def run_scans_stitcher(photos, output_img_path, options=None):
    """
    Executes 2D map orthomosaic stitching via cv2.Stitcher_create(cv2.Stitcher_SCANS).
    """
    options = options or {}
    max_dim = int(options.get('maxDimension', 1280))
    bounds = compute_footprint_bounds(photos)
    if not bounds:
        bounds = [41.3200, -88.9980, 41.3230, -88.9920]

    loaded_images = []
    for p in photos:
        im = load_image(p, max_dim=max_dim)
        if im is not None:
            loaded_images.append(im)

    stitched_img = None
    stitch_method = "opencv_scans"

    if HAS_OPENCV and len(loaded_images) >= 2:
        try:
            # OpenCV 4 & 5 Stitcher instantiation
            stitcher = cv2.Stitcher_create(cv2.Stitcher_SCANS)
            status, pano = stitcher.stitch(loaded_images)
            if status == cv2.Stitcher_OK and pano is not None and pano.size > 0:
                # Add alpha channel for transparent borders
                stitched_img = cv2.cvtColor(pano, cv2.COLOR_BGR2BGRA)
                # Crop near-black border pixels
                gray = cv2.cvtColor(pano, cv2.COLOR_BGR2GRAY)
                _, thresh = cv2.threshold(gray, 3, 255, cv2.THRESH_BINARY)
                contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                if contours:
                    c = max(contours, key=cv2.contourArea)
                    x, y, w, h = cv2.boundingRect(c)
                    if w > 50 and h > 50:
                        stitched_img = stitched_img[y:y+h, x:x+w]
            else:
                stitch_method = f"composite_fallback_status_{status}"
        except Exception as e:
            stitch_method = f"composite_fallback_err_{str(e)[:40]}"

    if stitched_img is None:
        # Fallback to deterministic georeferenced canvas composite
        stitched_img = build_synthetic_fallback_2d(photos, output_w=1280, output_h=960, bounds=bounds)
        if stitch_method == "opencv_scans":
            stitch_method = "georeferenced_composite"

    # Compute coverage metrics
    alpha_channel = stitched_img[:, :, 3] if stitched_img.shape[2] == 4 else np.ones(stitched_img.shape[:2], dtype=np.uint8) * 255
    covered_px = int(np.count_nonzero(alpha_channel > 20))
    total_px = int(stitched_img.shape[0] * stitched_img.shape[1])
    coverage_ratio = round((covered_px / float(max(1, total_px))) * 100.0, 1)

    # Save output
    out_dir = os.path.dirname(output_img_path)
    if out_dir and not os.path.exists(out_dir):
        os.makedirs(out_dir, exist_ok=True)

    cv2.imwrite(output_img_path, stitched_img)

    h, w = stitched_img.shape[:2]
    south, west, north, east = bounds
    meta = {
        "success": True,
        "mode": "scans",
        "method": stitch_method,
        "photoCount": len(photos),
        "validPhotosLoaded": len(loaded_images),
        "dimensions": [w, h],
        "bounds": [
            [round(south, 7), round(west, 7)],
            [round(north, 7), round(east, 7)]
        ],
        "coveragePercent": coverage_ratio,
        "hasCoverageGaps": bool(coverage_ratio < 75.0),
        "outputPath": output_img_path
    }
    return meta

def run_panorama_stitcher(photos, output_img_path, options=None):
    """
    Executes 360° spherical panorama stitching via cv2.Stitcher_create(cv2.Stitcher_PANORAMA).
    """
    options = options or {}
    max_dim = int(options.get('maxDimension', 1280))

    loaded_images = []
    for p in photos:
        im = load_image(p, max_dim=max_dim)
        if im is not None:
            loaded_images.append(im)

    pano_img = None
    stitch_method = "opencv_panorama"

    if HAS_OPENCV and len(loaded_images) >= 2:
        try:
            stitcher = cv2.Stitcher_create(cv2.Stitcher_PANORAMA)
            status, pano = stitcher.stitch(loaded_images)
            if status == cv2.Stitcher_OK and pano is not None and pano.size > 0:
                ph, pw = pano.shape[:2]
                # Force exact 2:1 equirectangular aspect ratio
                target_w = max(1024, (pw // 2) * 2)
                target_h = target_w // 2
                pano_img = cv2.resize(pano, (target_w, target_h), interpolation=cv2.INTER_AREA)
            else:
                stitch_method = f"pano_fallback_status_{status}"
        except Exception as e:
            stitch_method = f"pano_fallback_err_{str(e)[:40]}"

    if pano_img is None:
        pano_img = build_synthetic_fallback_pano(photos, output_w=2048, output_h=1024)
        if stitch_method == "opencv_panorama":
            stitch_method = "equirectangular_composite"

    out_dir = os.path.dirname(output_img_path)
    if out_dir and not os.path.exists(out_dir):
        os.makedirs(out_dir, exist_ok=True)

    cv2.imwrite(output_img_path, pano_img, [int(cv2.IMWRITE_JPEG_QUALITY), 92])

    h, w = pano_img.shape[:2]
    meta = {
        "success": True,
        "mode": "panorama",
        "method": stitch_method,
        "photoCount": len(photos),
        "validPhotosLoaded": len(loaded_images),
        "dimensions": [w, h],
        "aspectRatio": round(w / float(max(1, h)), 2),
        "projection": "equirectangular",
        "hasGpanoXmp": False, # Will be injected by stitcher_engine.js
        "outputPath": output_img_path
    }
    return meta

def main():
    args = parse_args()
    if not os.path.exists(args.input_json):
        print(json.dumps({"success": False, "error": f"Input file not found: {args.input_json}"}))
        sys.exit(1)

    with open(args.input_json, "r", encoding="utf-8") as f:
        data = json.load(f)

    mode = (data.get("mode") or "auto").lower()
    photos = data.get("photos") or []
    options = data.get("options") or {}

    # Auto-detect mode if not explicit
    if mode == "auto":
        is_pano = any(p.get('isPhotoSphere') or p.get('isPhotoSpherePoint') or (p.get('ringIndex') is not None) for p in photos)
        mode = "panorama" if is_pano else "scans"

    if mode == "panorama":
        meta = run_panorama_stitcher(photos, args.output_img, options)
    else:
        meta = run_scans_stitcher(photos, args.output_img, options)

    if args.output_meta:
        with open(args.output_meta, "w", encoding="utf-8") as mf:
            json.dump(meta, mf, indent=2)

    print(json.dumps(meta))
    sys.exit(0)

if __name__ == "__main__":
    main()
