#!/usr/bin/env python3
"""
tools/companion/wireframe_extractor.py
Aalaapi Sky - Real-Time Architectural Edge Extraction & Telemetry Ray Projection Engine

Performs high-speed OpenCV computer vision on drone aerial imagery:
1. Downscales image to 1080p (maintaining aspect ratio).
2. Applies Gaussian Blur, Canny edge detection, and Probabilistic Hough Line Transform (cv2.HoughLinesP).
3. Projects 2D pixel lines into 3D world rays using the camera intrinsic matrix and telemetry spatial logs.
4. Calculates explicit intersecting 3D vertices [x1, y1, z1, x2, y2, z2] in Three.js / ENU world coordinates.
5. Returns a lightweight structural JSON payload.
"""

import sys
import os
import json
import math
import argparse

try:
    import cv2
    import numpy as np
    HAS_OPENCV = True
except ImportError:
    HAS_OPENCV = False

def project_pixel_to_ray(u, v, width, height, hfov_deg, vfov_deg, cam_pos, yaw_deg, pitch_deg, roll_deg=0.0):
    """
    Projects a 2D pixel coordinate (u, v) into a 3D unit direction vector in Three.js world space:
    X = East (+X), Y = Up (+Y), Z = South (+Z, North is -Z).
    """
    hfov_rad = math.radians(hfov_deg if hfov_deg else 73.7)
    vfov_rad = math.radians(vfov_deg if vfov_deg else 53.1)

    fx = (width / 2.0) / math.tan(hfov_rad / 2.0)
    fy = (height / 2.0) / math.tan(vfov_rad / 2.0)
    cx = width / 2.0
    cy = height / 2.0

    # Normalized camera optical coordinates (right, down, forward)
    xc = (u - cx) / fx
    yc = (v - cy) / fy

    # Camera orientation in Three.js coordinates:
    # Yaw: 0 = North (-Z), 90 = East (+X), 180 = South (+Z), 270 = West (-X)
    # Pitch: 0 = horizontal, -90 = nadir (looking straight down toward ground: -Y)
    psi = math.radians(yaw_deg)
    theta = math.radians(pitch_deg)
    phi = math.radians(roll_deg)

    # Forward vector (optical axis looking into scene)
    cos_t = math.cos(theta)
    sin_t = math.sin(theta)
    sin_p = math.sin(psi)
    cos_p = math.cos(psi)

    fwd = np.array([cos_t * sin_p, sin_t, -cos_t * cos_p], dtype=np.float64)
    # Camera right vector (horizontal right)
    right = np.array([cos_p, 0.0, sin_p], dtype=np.float64)
    # Camera up vector = right x forward
    cam_up = np.cross(right, fwd)
    norm_up = np.linalg.norm(cam_up)
    if norm_up > 1e-6:
        cam_up /= norm_up

    # Apply roll if present
    if abs(phi) > 1e-4:
        c_r = math.cos(phi)
        s_r = math.sin(phi)
        right_rolled = c_r * right + s_r * cam_up
        cam_up_rolled = -s_r * right + c_r * cam_up
        right = right_rolled
        cam_up = cam_up_rolled

    # Ray direction in world space
    ray_dir = xc * right - yc * cam_up + 1.0 * fwd
    norm_dir = np.linalg.norm(ray_dir)
    if norm_dir > 1e-6:
        ray_dir /= norm_dir
    else:
        ray_dir = np.array([0.0, -1.0, 0.0], dtype=np.float64)

    return ray_dir

def intersect_ray_with_plane(cam_pos, ray_dir, plane_y=0.0, max_dist=1200.0):
    """
    Finds the intersection point of a 3D ray with a horizontal plane at height plane_y.
    If the ray points away or is nearly parallel, bounds to max_dist.
    """
    px, py, pz = cam_pos
    rx, ry, rz = ray_dir

    if abs(ry) > 1e-4:
        t = (plane_y - py) / ry
        if 0 < t <= max_dist:
            return np.array([px + rx * t, plane_y, pz + rz * t], dtype=np.float64)

    # Fallback projection along ray at reasonable distance
    t_fallback = min(max_dist, max(15.0, py * 1.5))
    return np.array([px + rx * t_fallback, max(plane_y, py + ry * t_fallback), pz + rz * t_fallback], dtype=np.float64)

def extract_wireframe_from_image(image_path, telemetry=None, options=None):
    """
    Core OpenCV edge extraction and telemetry extrusion.
    """
    if options is None:
        options = {}
    if telemetry is None:
        telemetry = {}

    if not HAS_OPENCV:
        return {
            "success": False,
            "error": "OpenCV (cv2) is not installed in the Python environment.",
            "lines": []
        }

    if not os.path.exists(image_path):
        return {
            "success": False,
            "error": f"Image file not found: {image_path}",
            "lines": []
        }

    # Load image
    img = cv2.imread(image_path)
    if img is None:
        return {
            "success": False,
            "error": f"Failed to decode image: {image_path}",
            "lines": []
        }

    orig_h, orig_w = img.shape[:2]

    # Downscale imagery to 1080p
    target_max = int(options.get("maxDimension", 1920))
    scale = min(1.0, float(target_max) / max(orig_w, orig_h))
    new_w = max(100, int(orig_w * scale))
    new_h = max(100, int(orig_h * scale))

    if scale < 0.999:
        resized = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_AREA)
    else:
        resized = img

    # Grayscale conversion
    gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)

    # 1. Performance-optimized Gaussian Blur
    blur_kernel = int(options.get("blurKernel", 5))
    if blur_kernel % 2 == 0:
        blur_kernel += 1
    blurred = cv2.GaussianBlur(gray, (blur_kernel, blur_kernel), float(options.get("blurSigma", 1.5)))

    # 2. Canny Edge Isolation
    canny_low = int(options.get("cannyLow", 50))
    canny_high = int(options.get("cannyHigh", 150))
    edges = cv2.Canny(blurred, canny_low, canny_high, apertureSize=3, L2gradient=True)

    # 3. Probabilistic Hough Line Transform
    hough_thresh = int(options.get("houghThreshold", 50))
    min_line_len = int(options.get("minLineLength", 40))
    max_line_gap = int(options.get("maxLineGap", 10))

    hough_lines = cv2.HoughLinesP(
        edges,
        rho=1,
        theta=np.pi / 180.0,
        threshold=hough_thresh,
        minLineLength=min_line_len,
        maxLineGap=max_line_gap
    )

    if hough_lines is None:
        return {
            "success": True,
            "lines": [],
            "totalRawLines": 0,
            "count": 0,
            "imageSize": [new_w, new_h]
        }

    # Telemetry parameters
    cam_x = float(telemetry.get("worldX", 0.0))
    cam_y = float(telemetry.get("worldY", telemetry.get("alt", 25.0)))
    cam_z = float(telemetry.get("worldZ", 0.0))
    cam_pos = np.array([cam_x, cam_y, cam_z], dtype=np.float64)

    yaw_deg = float(telemetry.get("yaw", 0.0))
    pitch_deg = float(telemetry.get("pitch", -60.0))
    roll_deg = float(telemetry.get("roll", 0.0))
    hfov_deg = float(telemetry.get("hfov", 73.7))
    vfov_deg = float(telemetry.get("vfov", 53.1))
    ground_y = float(options.get("groundAltitude", 0.0))
    max_lines_limit = int(options.get("maxLinesLimit", 500))

    extracted_lines = []

    for item in hough_lines:
        line_entry = item[0] if (hasattr(item, '__len__') and len(item) > 0 and hasattr(item[0], '__len__') and len(item[0]) == 4) else item
        x1_pix, y1_pix, x2_pix, y2_pix = int(line_entry[0]), int(line_entry[1]), int(line_entry[2]), int(line_entry[3])

        # Calculate 2D length in pixels
        dx_pix = x2_pix - x1_pix
        dy_pix = y2_pix - y1_pix
        pix_len = math.hypot(dx_pix, dy_pix)
        if pix_len < min_line_len:
            continue

        # Project 2D endpoints into 3D world rays
        ray1 = project_pixel_to_ray(x1_pix, y1_pix, new_w, new_h, hfov_deg, vfov_deg, cam_pos, yaw_deg, pitch_deg, roll_deg)
        ray2 = project_pixel_to_ray(x2_pix, y2_pix, new_w, new_h, hfov_deg, vfov_deg, cam_pos, yaw_deg, pitch_deg, roll_deg)

        # Check line orientation (is it a vertical structural column or horizontal facade line?)
        is_vertical = abs(dx_pix) < abs(dy_pix) * 0.35

        if is_vertical:
            # For vertical architectural edges (columns, building corners):
            # Intersect midpoint ray with ground plane, and estimate height delta
            u_mid = (x1_pix + x2_pix) / 2.0
            ray_bottom = ray1 if y1_pix > y2_pix else ray2
            ray_top = ray2 if y1_pix > y2_pix else ray1

            pt_bottom = intersect_ray_with_plane(cam_pos, ray_bottom, plane_y=ground_y)
            # Estimate structural height proportionally from optical angle
            dist_to_base = np.linalg.norm(pt_bottom - cam_pos)
            vert_angle = math.acos(np.clip(np.dot(ray_bottom, ray_top), -1.0, 1.0))
            height_delta = max(1.0, dist_to_base * math.tan(vert_angle))

            pt_top = np.array([pt_bottom[0], pt_bottom[1] + height_delta, pt_bottom[2]], dtype=np.float64)
            p1_3d = pt_bottom
            p2_3d = pt_top
        else:
            # Horizontal or oblique edge: intersect both rays onto estimated terrain or structure plane
            p1_3d = intersect_ray_with_plane(cam_pos, ray1, plane_y=ground_y)
            p2_3d = intersect_ray_with_plane(cam_pos, ray2, plane_y=ground_y)

        # Validate non-NaN and reasonable bounds
        coords = [
            round(float(p1_3d[0]), 3),
            round(float(p1_3d[1]), 3),
            round(float(p1_3d[2]), 3),
            round(float(p2_3d[0]), 3),
            round(float(p2_3d[1]), 3),
            round(float(p2_3d[2]), 3)
        ]

        if not any(math.isnan(c) or math.isinf(c) for c in coords):
            # Discard duplicate / zero-length 3D segments
            dist_3d = math.hypot(coords[3] - coords[0], coords[4] - coords[1], coords[5] - coords[2])
            if dist_3d >= 0.5:
                extracted_lines.append(coords)

        if len(extracted_lines) >= max_lines_limit:
            break

    return {
        "success": True,
        "lines": extracted_lines,
        "count": len(extracted_lines),
        "totalRawLines": len(hough_lines),
        "imageSize": [new_w, new_h]
    }

def main():
    parser = argparse.ArgumentParser(description="Aalaapi Sky Architectural Wireframe Extractor")
    parser.add_argument("--input", type=str, help="Path to input JSON payload or image file")
    parser.add_argument("--image", type=str, help="Path to single drone photo image")
    parser.add_argument("--telemetry", type=str, help="JSON string or file of telemetry parameters")
    parser.add_argument("--options", type=str, help="JSON string or file of OpenCV tuning options")
    parser.add_argument("--output", type=str, help="Path to write JSON output")

    args = parser.parse_args()

    input_payload = None

    if args.input and os.path.exists(args.input):
        with open(args.input, "r", encoding="utf-8") as f:
            try:
                input_payload = json.load(f)
            except Exception:
                # May be raw image path
                input_payload = {"imagePath": args.input}
    elif not sys.stdin.isatty():
        try:
            stdin_data = sys.stdin.read().strip()
            if stdin_data:
                input_payload = json.loads(stdin_data)
        except Exception:
            pass

    if input_payload is None:
        input_payload = {}

    image_path = args.image or input_payload.get("imagePath") or input_payload.get("filePath")
    telemetry = input_payload.get("telemetry", {})
    options = input_payload.get("options", {})

    if args.telemetry:
        try:
            telemetry = json.loads(args.telemetry)
        except Exception:
            pass

    if args.options:
        try:
            options = json.loads(args.options)
        except Exception:
            pass

    # Batch support: if photos array is provided in payload
    photos = input_payload.get("photos", [])
    if photos and isinstance(photos, list):
        all_lines = []
        total_raw = 0
        for photo in photos:
            p_path = photo.get("filePath") or photo.get("rawPath") or photo.get("path")
            p_telem = photo.get("telemetry", photo)
            res = extract_wireframe_from_image(p_path, telemetry=p_telem, options=options)
            if res.get("success"):
                all_lines.extend(res.get("lines", []))
                total_raw += res.get("totalRawLines", 0)

        out_data = {
            "success": True,
            "lines": all_lines,
            "count": len(all_lines),
            "totalRawLines": total_raw,
            "totalPhotosProcessed": len(photos)
        }
    else:
        out_data = extract_wireframe_from_image(image_path, telemetry=telemetry, options=options)

    json_str = json.dumps(out_data, indent=2)

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(json_str)
    else:
        print(json_str)

if __name__ == "__main__":
    main()
