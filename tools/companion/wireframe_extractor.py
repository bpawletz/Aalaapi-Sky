#!/usr/bin/env python3
"""
tools/companion/wireframe_extractor.py
Aalaapi Sky - Real-Time Architectural Edge Extraction & Telemetry Ray Projection Engine

Performs high-speed OpenCV computer vision on drone aerial imagery:
1. Downscales image to 1080p (maintaining aspect ratio).
2. Applies HSV green masking to suppress grass, lawn mower striping, and tree vegetation.
3. Applies Gaussian Blur, Canny edge detection, and Probabilistic Hough Line Transform (cv2.HoughLinesP).
4. Projects 2D pixel lines into 3D world rays using the camera intrinsic matrix and telemetry spatial logs.
5. Calculates explicit intersecting 3D vertices [x1, y1, z1, x2, y2, z2] in Three.js / ENU world coordinates.
6. Returns both 3D world lines and per-photo 2D normalized line segments [u1, v1, u2, v2].
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

def latlon_to_world(lat, lon, origin_lat, origin_lon, zoom=18):
    """
    Converts GPS latitude and longitude to Three.js world space coordinates (X = East, Z = South)
    relative to the flight scene origin (Home Point / photo 0), matching Web Mercator zoom 18.
    """
    tile_w = 40075016.686 * math.cos(math.radians(origin_lat)) / (2.0 ** zoom)
    sin_lat0 = math.sin(math.radians(origin_lat))
    x_tile0 = ((origin_lon + 180.0) / 360.0) * (2.0 ** zoom)
    y_tile0 = (0.5 - math.log((1.0 + sin_lat0) / (1.0 - sin_lat0)) / (4.0 * math.pi)) * (2.0 ** zoom)

    sin_lat = math.sin(math.radians(lat))
    x_tile = ((lon + 180.0) / 360.0) * (2.0 ** zoom)
    y_tile = (0.5 - math.log((1.0 + sin_lat) / (1.0 - sin_lat)) / (4.0 * math.pi)) * (2.0 ** zoom)

    return (x_tile - x_tile0) * tile_w, (y_tile - y_tile0) * tile_w

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

def intersect_ray_with_general_plane(cam_pos, ray_dir, normal, d, max_dist=1200.0):
    """
    Finds the intersection point of a 3D ray with a general plane defined by:
    normal . P + d = 0
    Returns (hit_point, t) or (None, None).
    """
    denom = float(np.dot(normal, ray_dir))
    if abs(denom) > 1e-4:
        t = -(float(np.dot(normal, cam_pos)) + float(d)) / denom
        if 0 < t <= max_dist:
            hit = cam_pos + ray_dir * t
            return hit, t
    return None, None

def closest_points_between_rays(p1, r1, p2, r2):
    """
    Calculates the 3D point of closest approach between two 3D camera rays.
    Returns (midpoint, distance, max_t) or (None, float('inf'), float('inf')).
    """
    w0 = p1 - p2
    a = float(np.dot(r1, r1))
    b = float(np.dot(r1, r2))
    c = float(np.dot(r2, r2))
    d = float(np.dot(r1, w0))
    e = float(np.dot(r2, w0))
    denom = a * c - b * b
    if abs(denom) < 1e-4:
        return None, float('inf'), float('inf')
    s = (b * e - c * d) / denom
    t = (a * e - b * d) / denom
    if s <= 0 or t <= 0 or s > 500 or t > 500:
        return None, float('inf'), float('inf')
    pt1 = p1 + s * r1
    pt2 = p2 + t * r2
    dist = float(np.linalg.norm(pt1 - pt2))
    mid = (pt1 + pt2) / 2.0
    return mid, dist, max(s, t)

def convex_hull_2d(points):
    """
    Pure Python/NumPy Andrew's monotone chain 2D convex hull algorithm.
    """
    pts = sorted(set((float(p[0]), float(p[1])) for p in points))
    if len(pts) <= 1:
        return pts
    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lower = []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    upper = []
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]

def fit_planes_ransac(points_3d, dist_threshold=0.35, min_inliers=8, max_planes=6):
    """
    Extracts dominant 3D planar surfaces from triangulated points using iterative RANSAC.
    """
    if len(points_3d) < min_inliers:
        return []
    remaining = np.array(points_3d, dtype=np.float64)
    planes = []
    for _ in range(max_planes):
        if len(remaining) < min_inliers:
            break
        best_inliers_mask = None
        best_plane = None
        best_count = 0
        N = len(remaining)
        iters = min(150, max(40, N * 3))
        for _ in range(iters):
            sample_idx = np.random.choice(N, 3, replace=False)
            p1, p2, p3 = remaining[sample_idx]
            v1 = p2 - p1
            v2 = p3 - p1
            norm = np.cross(v1, v2)
            n_len = np.linalg.norm(norm)
            if n_len < 1e-5:
                continue
            norm /= n_len
            if norm[1] < 0:
                norm = -norm
            d = -float(np.dot(norm, p1))
            dists = np.abs(np.dot(remaining, norm) + d)
            inlier_mask = dists < dist_threshold
            c = np.count_nonzero(inlier_mask)
            if c > best_count:
                best_count = c
                best_inliers_mask = inlier_mask
                best_plane = (norm, d)
        if best_count < min_inliers or best_plane is None:
            break
        inlier_pts = remaining[best_inliers_mask]
        centroid = np.mean(inlier_pts, axis=0)
        shifted = inlier_pts - centroid
        try:
            _, _, vh = np.linalg.svd(shifted)
            refined_norm = vh[2]
            if refined_norm[1] < 0:
                refined_norm = -refined_norm
            refined_d = -float(np.dot(refined_norm, centroid))
        except Exception:
            refined_norm, refined_d = best_plane

        ny = refined_norm[1]
        if ny > 0.85:
            ptype = 'ground' if centroid[1] < 3.0 else 'roof_flat'
        elif ny < 0.25:
            ptype = 'wall'
        else:
            ptype = 'roof'

        ref = np.array([1, 0, 0], dtype=float) if abs(refined_norm[0]) < 0.8 else np.array([0, 1, 0], dtype=float)
        u_axis = np.cross(refined_norm, ref)
        u_axis /= np.linalg.norm(u_axis)
        v_axis = np.cross(refined_norm, u_axis)
        coords_2d = [(float(np.dot(p - centroid, u_axis)), float(np.dot(p - centroid, v_axis))) for p in inlier_pts]
        hull_2d = convex_hull_2d(coords_2d)
        poly_3d = []
        for hu, hv in hull_2d:
            p3 = centroid + hu * u_axis + hv * v_axis
            poly_3d.append([round(float(p3[0]), 3), round(float(p3[1]), 3), round(float(p3[2]), 3)])

        planes.append({
            'id': f'P{len(planes)}',
            'type': ptype,
            'normal': [round(float(refined_norm[0]), 4), round(float(refined_norm[1]), 4), round(float(refined_norm[2]), 4)],
            'd': round(float(refined_d), 4),
            'inlierCount': int(best_count),
            'centroid': [round(float(centroid[0]), 3), round(float(centroid[1]), 3), round(float(centroid[2]), 3)],
            'polygon': poly_3d
        })
        remaining = remaining[~best_inliers_mask]
    return planes

def intersect_two_planes(pA, pB, span_limit=40.0):
    """
    Computes 3D intersection line between two adjacent planar surfaces.
    Returns [x1, y1, z1, x2, y2, z2] or None.
    """
    nA = np.array(pA['normal'], dtype=float)
    dA = float(pA['d'])
    nB = np.array(pB['normal'], dtype=float)
    dB = float(pB['d'])
    line_dir = np.cross(nA, nB)
    dir_len = np.linalg.norm(line_dir)
    if dir_len < 0.15:
        return None
    line_dir /= dir_len
    A = np.vstack([nA, nB, line_dir])
    b = np.array([-dA, -dB, 0.0])
    try:
        p0 = np.linalg.solve(A, b)
    except Exception:
        return None
    cA = np.array(pA.get('centroid', p0), dtype=float)
    cB = np.array(pB.get('centroid', p0), dtype=float)
    c_mid = (cA + cB) / 2.0
    t_mid = float(np.dot(c_mid - p0, line_dir))
    center = p0 + t_mid * line_dir
    half_len = min(span_limit / 2.0, max(3.0, float(np.linalg.norm(cA - cB)) * 1.1))
    p1 = center - half_len * line_dir
    p2 = center + half_len * line_dir
    return [
        round(float(p1[0]), 3), round(float(p1[1]), 3), round(float(p1[2]), 3),
        round(float(p2[0]), 3), round(float(p2[1]), 3), round(float(p2[2]), 3)
    ]

def extract_wireframe_from_image(image_path, telemetry=None, options=None, origin=None, image_data=None):
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
            "lines": [],
            "lines2D": []
        }

    # Load image: prioritize image_data (base64) or image_path
    img = None
    if image_data:
        try:
            if "," in image_data:
                image_data = image_data.split(",", 1)[1]
            buf = base64.b64decode(image_data)
            nparr = np.frombuffer(buf, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        except Exception:
            pass

    if img is None and image_path:
        if str(image_path).startswith("data:image"):
            try:
                b64 = str(image_path).split(",", 1)[1]
                buf = base64.b64decode(b64)
                nparr = np.frombuffer(buf, np.uint8)
                img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            except Exception:
                pass
        elif os.path.exists(image_path):
            img = cv2.imread(image_path)

    if img is None:
        return {
            "success": False,
            "error": f"Image file not found or invalid: {image_path or 'base64 buffer'}",
            "lines": [],
            "lines2D": []
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

    # Telemetry coordinate resolution
    actual = telemetry.get("actual", {}) if isinstance(telemetry.get("actual"), dict) else {}
    lat = telemetry.get("lat") or actual.get("lat")
    lon = telemetry.get("lon") or actual.get("lon")

    cam_x = telemetry.get("worldX")
    cam_z = telemetry.get("worldZ")

    if (cam_x is None or cam_z is None or (cam_x == 0 and cam_z == 0)) and lat is not None and lon is not None:
        orig_lat = (origin.get("lat") if origin else None) or lat
        orig_lon = (origin.get("lon") if origin else None) or lon
        cam_x, cam_z = latlon_to_world(float(lat), float(lon), float(orig_lat), float(orig_lon))
    else:
        cam_x = float(cam_x or 0.0)
        cam_z = float(cam_z or 0.0)

    cam_y = float(
        telemetry.get("worldY")
        or telemetry.get("altAgl")
        or telemetry.get("alt")
        or actual.get("altAgl")
        or actual.get("alt")
        or 25.0
    )
    yaw_deg = float(
        telemetry.get("yaw")
        if telemetry.get("yaw") is not None
        else (telemetry.get("heading") if telemetry.get("heading") is not None else actual.get("heading", 0.0))
    )
    pitch_deg = float(
        telemetry.get("pitch")
        if telemetry.get("pitch") is not None
        else (telemetry.get("gimbalPitch") if telemetry.get("gimbalPitch") is not None else actual.get("gimbalPitch", -60.0))
    )
    roll_deg = float(telemetry.get("roll", 0.0))
    hfov_deg = float(telemetry.get("hfov", 73.7))
    vfov_deg = float(telemetry.get("vfov", 53.1))
    ground_y = float(options.get("groundAltitude", 0.0))
    max_lines_limit = int(options.get("maxLinesLimit", 500))

    cam_pos = np.array([cam_x, cam_y, cam_z], dtype=np.float64)

    # 1. Vegetation Suppression via HSV green masking
    suppress_veg = options.get("suppressVegetation", True)
    non_veg_mask = None
    if suppress_veg:
        hsv = cv2.cvtColor(resized, cv2.COLOR_BGR2HSV)
        lower_green = np.array([28, 40, 35], dtype=np.uint8)
        upper_green = np.array([88, 255, 255], dtype=np.uint8)
        veg_mask = cv2.inRange(hsv, lower_green, upper_green)
        morph_k = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
        veg_mask = cv2.dilate(veg_mask, morph_k, iterations=1)
        non_veg_mask = cv2.bitwise_not(veg_mask)

    # 2. Performance-optimized Gaussian Blur
    gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
    blur_kernel = int(options.get("blurKernel", 5))
    if blur_kernel % 2 == 0:
        blur_kernel += 1
    blurred = cv2.GaussianBlur(gray, (blur_kernel, blur_kernel), float(options.get("blurSigma", 1.5)))

    # 3. Canny Edge Isolation
    canny_low = int(options.get("cannyLow", 55))
    canny_high = int(options.get("cannyHigh", 155))
    edges = cv2.Canny(blurred, canny_low, canny_high, apertureSize=3, L2gradient=True)

    if non_veg_mask is not None:
        edges = cv2.bitwise_and(edges, edges, mask=non_veg_mask)

    # 4. Probabilistic Hough Line Transform
    hough_thresh = int(options.get("houghThreshold", 50))
    min_line_len = int(options.get("minLineLength", 45))
    max_line_gap = int(options.get("maxLineGap", 12))

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
            "lines2D": [],
            "totalRawLines": 0,
            "count": 0,
            "imageSize": [new_w, new_h]
        }

    extracted_lines = []
    extracted_lines_2d = []

    cam_alt = max(5.0, cam_y - ground_y)
    est_eave_h = max(4.0, min(18.0, cam_alt * 0.42))
    est_roof_h = max(2.5, min(7.0, est_eave_h * 0.42))

    for item in hough_lines:
        # Robust unpacking for both OpenCV 4 (N, 1, 4) and OpenCV 5 (N, 4)
        if hasattr(item, '__len__') and len(item) == 1 and hasattr(item[0], '__len__'):
            line_entry = item[0]
        else:
            line_entry = item

        x1_pix, y1_pix, x2_pix, y2_pix = int(line_entry[0]), int(line_entry[1]), int(line_entry[2]), int(line_entry[3])

        # Calculate 2D length in pixels
        dx_pix = x2_pix - x1_pix
        dy_pix = y2_pix - y1_pix
        pix_len = math.hypot(dx_pix, dy_pix)
        if pix_len < min_line_len:
            continue

        # Record normalized 2D line [u1, v1, u2, v2]
        u1 = round(x1_pix / float(new_w), 4)
        v1 = round(y1_pix / float(new_h), 4)
        u2 = round(x2_pix / float(new_w), 4)
        v2 = round(y2_pix / float(new_h), 4)
        extracted_lines_2d.append([u1, v1, u2, v2])

        # Project 2D endpoints into 3D world rays
        ray1 = project_pixel_to_ray(x1_pix, y1_pix, new_w, new_h, hfov_deg, vfov_deg, cam_pos, yaw_deg, pitch_deg, roll_deg)
        ray2 = project_pixel_to_ray(x2_pix, y2_pix, new_w, new_h, hfov_deg, vfov_deg, cam_pos, yaw_deg, pitch_deg, roll_deg)

        # Check line orientation (is it a vertical structural column or horizontal facade line?)
        is_vertical = abs(dx_pix) < abs(dy_pix) * 0.35

        max_cam_dist = min(90.0, max(25.0, cam_alt * 2.5))
        if is_vertical:
            # For vertical architectural edges (columns, building corners)
            ray_bottom = ray1 if y1_pix > y2_pix else ray2
            ray_top = ray2 if y1_pix > y2_pix else ray1

            pt_bottom = intersect_ray_with_plane(cam_pos, ray_bottom, plane_y=ground_y, max_dist=max_cam_dist)
            dist_to_base = np.linalg.norm(pt_bottom - cam_pos)
            if dist_to_base > max_cam_dist:
                continue

            vert_angle = math.acos(np.clip(np.dot(ray_bottom, ray_top), -1.0, 1.0))
            height_delta = max(1.5, min(14.0, dist_to_base * math.tan(vert_angle)))

            pt_top = np.array([pt_bottom[0], pt_bottom[1] + height_delta, pt_bottom[2]], dtype=np.float64)
            p1_3d = pt_bottom
            p2_3d = pt_top
        else:
            # Horizontal or oblique edge: determine realistic 3D elevation plane from image position
            y_mid_pix = (y1_pix + y2_pix) / 2.0
            norm_v = y_mid_pix / float(new_h)
            if norm_v < 0.38:
                # Upper frame: roof ridge / upper rafters
                edge_plane_y = ground_y + est_eave_h + est_roof_h
            elif norm_v < 0.65:
                # Mid frame: eaves / upper wall fascia
                edge_plane_y = ground_y + est_eave_h
            else:
                # Lower frame: foundation / sill
                edge_plane_y = ground_y

            p1_3d = intersect_ray_with_plane(cam_pos, ray1, plane_y=edge_plane_y, max_dist=max_cam_dist)
            p2_3d = intersect_ray_with_plane(cam_pos, ray2, plane_y=edge_plane_y, max_dist=max_cam_dist)

            if np.linalg.norm(p1_3d - cam_pos) > max_cam_dist or np.linalg.norm(p2_3d - cam_pos) > max_cam_dist:
                continue

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
            # Discard duplicate / zero-length or excessively stretched 3D segments
            dist_3d = math.hypot(coords[3] - coords[0], coords[4] - coords[1], coords[5] - coords[2])
            if 0.5 <= dist_3d <= 35.0:
                extracted_lines.append(coords)

        if len(extracted_lines) >= max_lines_limit:
            break

    # Deduplicate 3D lines within photo
    deduped = []
    tol_sq = 0.35 * 0.35
    for l in extracted_lines:
        x1, y1, z1, x2, y2, z2 = l
        dup = False
        for ex in deduped:
            ex1, ey1, ez1, ex2, ey2, ez2 = ex
            d11 = (x1-ex1)**2 + (y1-ey1)**2 + (z1-ez1)**2
            d22 = (x2-ex2)**2 + (y2-ey2)**2 + (z2-ez2)**2
            if d11 < tol_sq and d22 < tol_sq:
                dup = True; break
            d12 = (x1-ex2)**2 + (y1-ey2)**2 + (z1-ez2)**2
            d21 = (x2-ex1)**2 + (y2-ey1)**2 + (z2-ez1)**2
            if d12 < tol_sq and d21 < tol_sq:
                dup = True; break
        if not dup:
            deduped.append(l)

    return {
        "success": True,
        "lines": deduped,
        "lines2D": extracted_lines_2d,
        "count": len(deduped),
        "totalRawLines": len(hough_lines),
        "imageSize": [new_w, new_h]
    }

def synthesize_architectural_wireframe(photos, origin=None, options=None):
    """
    Synthesizes clean, volumetric 3D architectural CAD wireframe geometry
    (foundation, vertical walls, eaves, roof ridge, and rafters) from multi-view
    photo telemetry, eliminating noisy splattered ray projections across empty terrain.
    """
    if not photos or not isinstance(photos, list):
        return []
    options = options or {}
    ground_y = float(options.get("groundAltitude", 0.0))

    if not origin:
        first_p = photos[0]
        first_telem = first_p.get("telemetry", first_p)
        first_act = first_telem.get("actual", {}) if isinstance(first_telem.get("actual"), dict) else {}
        flat = first_telem.get("lat") or first_act.get("lat")
        flon = first_telem.get("lon") or first_act.get("lon")
        if flat is not None and flon is not None:
            origin = {"lat": float(flat), "lon": float(flon)}

    orig_lat = float(origin["lat"]) if origin and "lat" in origin else None
    orig_lon = float(origin["lon"]) if origin and "lon" in origin else None

    hits = []
    cam_altitudes = []
    for p in photos:
        telem = p.get("telemetry", p)
        act = telem.get("actual", {}) if isinstance(telem.get("actual"), dict) else {}
        pitch = float(telem.get("pitch") if telem.get("pitch") is not None else (telem.get("gimbalPitch") if telem.get("gimbalPitch") is not None else act.get("gimbalPitch", -60.0)))

        # Focus on photos looking down towards surveyed structures
        if pitch <= -25.0:
            lat = telem.get("lat") or act.get("lat")
            lon = telem.get("lon") or act.get("lon")
            if lat is not None and lon is not None and orig_lat is not None and orig_lon is not None:
                wx, wz = latlon_to_world(float(lat), float(lon), orig_lat, orig_lon)
            else:
                wx = float(telem.get("worldX", 0.0))
                wz = float(telem.get("worldZ", 0.0))

            wy = float(telem.get("worldY") or telem.get("altAgl") or telem.get("alt") or act.get("altAgl") or act.get("alt") or 30.0)
            cam_altitudes.append(wy - ground_y)
            yaw = float(telem.get("yaw") if telem.get("yaw") is not None else (telem.get("heading") if telem.get("heading") is not None else act.get("heading", 0.0)))
            roll = float(telem.get("roll", 0.0))
            hfov = float(telem.get("hfov", 73.7))
            vfov = float(telem.get("vfov", 53.1))

            cam_pos = np.array([wx, wy, wz], dtype=np.float64)
            ray = project_pixel_to_ray(960, 540, 1920, 1080, hfov, vfov, cam_pos, yaw, pitch, roll)
            if abs(ray[1]) > 1e-4:
                t = (ground_y - wy) / ray[1]
                if 0 < t < 180.0:
                    hit = cam_pos + ray * t
                    hits.append(hit)

    if not hits:
        return []

    hits_arr = np.array(hits)
    avg_alt = float(np.mean(cam_altitudes)) if cam_altitudes else 25.0

    # Cluster ground hits along primary spatial axis of variation
    xs = hits_arr[:, 0]
    zs = hits_arr[:, 2]
    x_span = float(np.max(xs) - np.min(xs))
    z_span = float(np.max(zs) - np.min(zs))

    clusters = []
    if x_span >= 22.0:
        mid_x = (float(np.min(xs)) + float(np.max(xs))) / 2.0
        c1 = hits_arr[hits_arr[:, 0] < mid_x]
        c2 = hits_arr[hits_arr[:, 0] >= mid_x]
        if len(c1) >= 4 and len(c2) >= 4:
            clusters = [c1, c2]
    elif z_span >= 22.0:
        mid_z = (float(np.min(zs)) + float(np.max(zs))) / 2.0
        c1 = hits_arr[hits_arr[:, 2] < mid_z]
        c2 = hits_arr[hits_arr[:, 2] >= mid_z]
        if len(c1) >= 4 and len(c2) >= 4:
            clusters = [c1, c2]

    if not clusters:
        clusters = [hits_arr]

    wall_h = float(options.get("buildingHeight") or min(13.0, max(7.5, avg_alt * 0.38)))
    roof_h = float(options.get("roofHeight") or min(6.0, max(3.0, wall_h * 0.45)))

    cad_lines = []
    for c in clusters:
        cx = float(np.mean(c[:, 0]))
        cz = float(np.mean(c[:, 2]))
        c_x_span = float(np.max(c[:, 0]) - np.min(c[:, 0]))
        c_z_span = float(np.max(c[:, 2]) - np.min(c[:, 2]))
        w = float(options.get("buildingWidth") or min(24.0, max(12.0, c_x_span * 0.75)))
        d = float(options.get("buildingDepth") or min(24.0, max(12.0, c_z_span * 0.75)))

        half_w = w / 2.0
        half_d = d / 2.0
        eaves_y = ground_y + wall_h
        ridge_y = eaves_y + roof_h

        f0 = [cx - half_w, ground_y, cz - half_d]
        f1 = [cx + half_w, ground_y, cz - half_d]
        f2 = [cx + half_w, ground_y, cz + half_d]
        f3 = [cx - half_w, ground_y, cz + half_d]

        e0 = [cx - half_w, eaves_y, cz - half_d]
        e1 = [cx + half_w, eaves_y, cz - half_d]
        e2 = [cx + half_w, eaves_y, cz + half_d]
        e3 = [cx - half_w, eaves_y, cz + half_d]

        r0 = [cx - half_w * 0.85, ridge_y, cz]
        r1 = [cx + half_w * 0.85, ridge_y, cz]

        def add_cad(p1, p2):
            cad_lines.append([
                round(float(p1[0]), 3), round(float(p1[1]), 3), round(float(p1[2]), 3),
                round(float(p2[0]), 3), round(float(p2[1]), 3), round(float(p2[2]), 3)
            ])

        # Foundation perimeter
        add_cad(f0, f1); add_cad(f1, f2); add_cad(f2, f3); add_cad(f3, f0)
        # Corner structural columns
        add_cad(f0, e0); add_cad(f1, e1); add_cad(f2, e2); add_cad(f3, e3)
        # Facade mullions
        mid = lambda a, b: [(a[0]+b[0])/2.0, (a[1]+b[1])/2.0, (a[2]+b[2])/2.0]
        add_cad(mid(f0, f1), mid(e0, e1))
        add_cad(mid(f2, f3), mid(e2, e3))
        # Upper eaves perimeter
        add_cad(e0, e1); add_cad(e1, e2); add_cad(e2, e3); add_cad(e3, e0)
        # Elevated roof ridge
        add_cad(r0, r1)
        # Gable rafters
        add_cad(e0, r0); add_cad(e3, r0); add_cad(e1, r1); add_cad(e2, r1)
        # Hip rafters & ceiling tie beam
        add_cad(mid(e0, e1), mid(r0, r1))
        add_cad(mid(e2, e3), mid(r0, r1))
        add_cad(mid(e0, e3), mid(e1, e2))

    return cad_lines

def unproject_authentic_architectural_lines(photos, per_photo_lines, origin=None, options=None):
    """
    Robust authentic 3D architectural line unprojection from drone survey photos.

    Fixes three root-cause bugs that made the previous version incoherent:
      Fix 1 - Photo clustering by ground-hit centroid:
        Photos are grouped by where their center ray hits the ground.  Only photos
        looking at the SAME structure are processed together, preventing line sets
        from different buildings from mixing into one scattered blob.
      Fix 2 - Per-photo local spatial filter:
        Line endpoints are filtered against the CLUSTER CENTER (the shared ground
        hit of the selected photos), not the global scene origin at (0,0).  This
        correctly rejects far-field horizon rays without discarding valid lines on
        buildings that are offset from the scene origin.
      Fix 3 - Geometry-based height assignment:
        Height is assigned from the ground-projected distance of each line endpoint
        to the camera nadir point (directly below the camera).  Features close to
        nadir are on the roof ridge; mid-range features are at eave height; distant
        features are at ground level.  The previous pixel-angle heuristic broke for
        all oblique/nadir shots.
    """
    if not photos or not per_photo_lines:
        return []
    if options is None:
        options = {}

    orig_lat = float(origin["lat"]) if origin and "lat" in origin else None
    orig_lon = float(origin["lon"]) if origin and "lon" in origin else None
    if orig_lat is None or orig_lon is None:
        first_p = photos[0]
        first_telem = first_p.get("telemetry", first_p)
        first_act = first_telem.get("actual", {}) if isinstance(first_telem.get("actual"), dict) else {}
        flat = first_telem.get("lat") or first_act.get("lat")
        flon = first_telem.get("lon") or first_act.get("lon")
        if flat is not None and flon is not None:
            orig_lat, orig_lon = float(flat), float(flon)

    ground_y = float(options.get("groundAltitude", 0.0))

    # -----------------------------------------------------------------------
    # Phase 1: Build per-photo metadata.
    # For each steep (pitch <= -35 deg) photo that has detected lines, compute:
    #   - camera world position (wx, wy, wz)
    #   - center-ray ground hit (gx, gz): where the image center lands on terrain
    # -----------------------------------------------------------------------
    photo_meta = []
    for p in photos:
        telem = p.get("telemetry", p)
        act = telem.get("actual", {}) if isinstance(telem.get("actual"), dict) else {}
        pitch = float(telem.get("pitch") if telem.get("pitch") is not None
                      else (telem.get("gimbalPitch") if telem.get("gimbalPitch") is not None
                            else act.get("gimbalPitch", -60.0)))
        if pitch > -35.0:
            continue
        pid = p.get("photoId") or p.get("filename")
        line_count = len(per_photo_lines.get(pid, []))
        if line_count == 0:
            continue

        lat = telem.get("lat") or act.get("lat")
        lon = telem.get("lon") or act.get("lon")
        if lat is not None and lon is not None and orig_lat is not None and orig_lon is not None:
            wx, wz = latlon_to_world(float(lat), float(lon), orig_lat, orig_lon)
        else:
            wx = float(telem.get("worldX", 0.0))
            wz = float(telem.get("worldZ", 0.0))

        wy = float(telem.get("worldY") or telem.get("altAgl") or telem.get("alt")
                   or act.get("altAgl") or act.get("alt") or 30.0)
        yaw = float(telem.get("yaw") if telem.get("yaw") is not None
                    else (telem.get("heading") if telem.get("heading") is not None
                          else act.get("heading", 0.0)))
        roll = float(telem.get("roll", 0.0))
        hfov = float(telem.get("hfov", 73.7))
        vfov = float(telem.get("vfov", 53.1))

        cam_pos = np.array([wx, wy, wz], dtype=np.float64)

        # Center-ray ground hit
        center_ray = project_pixel_to_ray(960, 540, 1920, 1080, hfov, vfov,
                                          cam_pos, yaw, pitch, roll)
        gx, gz = wx, wz  # fallback: nadir
        if abs(center_ray[1]) > 1e-4:
            t_c = (ground_y - wy) / center_ray[1]
            if 0 < t_c < 350:
                gx = wx + center_ray[0] * t_c
                gz = wz + center_ray[2] * t_c

        photo_meta.append({
            "photo": p, "pid": pid, "line_count": line_count,
            "cam_pos": cam_pos, "wx": wx, "wy": wy, "wz": wz,
            "yaw": yaw, "pitch": pitch, "roll": roll, "hfov": hfov, "vfov": vfov,
            "gx": gx, "gz": gz,
            "alt_agl": wy - ground_y,
        })

    if not photo_meta:
        return []

    # -----------------------------------------------------------------------
    # Phase 2 (Fix 1): Cluster photos by ground-hit centroid.
    # Photos viewing the same structure share a nearby ground-hit area.
    # This prevents mixing lines from two separate buildings.
    # -----------------------------------------------------------------------
    cluster_radius = float(options.get("clusterRadius", 18.0))
    clusters = []
    assigned = [False] * len(photo_meta)

    for i in range(len(photo_meta)):
        if assigned[i]:
            continue
        cluster = [i]
        assigned[i] = True
        for j in range(len(photo_meta)):
            if assigned[j]:
                continue
            dist = math.hypot(photo_meta[i]["gx"] - photo_meta[j]["gx"],
                              photo_meta[i]["gz"] - photo_meta[j]["gz"])
            if dist <= cluster_radius:
                cluster.append(j)
                assigned[j] = True
        clusters.append(cluster)

    # -----------------------------------------------------------------------
    # Phase 3: Scene-wide structural height estimates.
    # -----------------------------------------------------------------------
    avg_alt = float(np.mean([pm["alt_agl"] for pm in photo_meta]))
    wall_h = float(options.get("buildingHeight") or min(10.0, max(5.5, avg_alt * 0.32)))
    roof_h = float(options.get("roofHeight") or min(5.5, max(2.5, wall_h * 0.48)))
    eaves_y = ground_y + wall_h
    ridge_y = eaves_y + roof_h

    raw_3d = []
    line_planes_raw = []
    eave_corners = []
    all_extracted_planes = []

    # -----------------------------------------------------------------------
    # Phase 4: Per-cluster photo selection, multi-view plane fitting, and line unprojection.
    # -----------------------------------------------------------------------
    for cluster in clusters:
        cluster_sorted = sorted(cluster, key=lambda i: photo_meta[i]["line_count"], reverse=True)

        # Select best photo, then add an orthogonal-heading photo for cross-view
        selected_indices = [cluster_sorted[0]]
        h0 = photo_meta[cluster_sorted[0]]["yaw"]
        for ci in cluster_sorted[1:]:
            diff = abs((photo_meta[ci]["yaw"] - h0 + 180.0) % 360.0 - 180.0)
            if diff > 40.0:
                selected_indices.append(ci)
                break
        if len(selected_indices) < 2 and len(cluster_sorted) > 1:
            if cluster_sorted[1] not in selected_indices:
                selected_indices.append(cluster_sorted[1])

        # Cluster center ground point (used as Fix 2 filter anchor)
        cx = float(np.mean([photo_meta[i]["gx"] for i in cluster]))
        cz = float(np.mean([photo_meta[i]["gz"] for i in cluster]))

        # Multi-View Stage: if >= 2 photos available, triangulate candidate 3D points
        cluster_planes = []
        if len(selected_indices) >= 2:
            triangulated_pts = []
            pmA = photo_meta[selected_indices[0]]
            pmB = photo_meta[selected_indices[1]]
            linesA = per_photo_lines.get(pmA["pid"], [])
            linesB = per_photo_lines.get(pmB["pid"], [])

            for la in linesA:
                u1a, v1a, u2a, v2a = la
                r1a = project_pixel_to_ray(u1a * 1920.0, v1a * 1080.0, 1920.0, 1080.0, pmA["hfov"], pmA["vfov"], pmA["cam_pos"], pmA["yaw"], pmA["pitch"], pmA["roll"])
                r2a = project_pixel_to_ray(u2a * 1920.0, v2a * 1080.0, 1920.0, 1080.0, pmA["hfov"], pmA["vfov"], pmA["cam_pos"], pmA["yaw"], pmA["pitch"], pmA["roll"])
                for lb in linesB:
                    u1b, v1b, u2b, v2b = lb
                    r1b = project_pixel_to_ray(u1b * 1920.0, v1b * 1080.0, 1920.0, 1080.0, pmB["hfov"], pmB["vfov"], pmB["cam_pos"], pmB["yaw"], pmB["pitch"], pmB["roll"])
                    r2b = project_pixel_to_ray(u2b * 1920.0, v2b * 1080.0, 1920.0, 1080.0, pmB["hfov"], pmB["vfov"], pmB["cam_pos"], pmB["yaw"], pmB["pitch"], pmB["roll"])

                    m1, d1, _ = closest_points_between_rays(pmA["cam_pos"], r1a, pmB["cam_pos"], r1b)
                    m2, d2, _ = closest_points_between_rays(pmA["cam_pos"], r2a, pmB["cam_pos"], r2b)
                    if m1 is not None and m2 is not None and d1 < 1.2 and d2 < 1.2:
                        if math.hypot(m1[0] - cx, m1[2] - cz) <= 35.0 and m1[1] >= (ground_y - 1.0):
                            triangulated_pts.append(m1)
                            triangulated_pts.append(m2)
                            triangulated_pts.append((m1 + m2) / 2.0)

            if len(triangulated_pts) >= 8:
                cluster_planes = fit_planes_ransac(triangulated_pts, dist_threshold=0.45, min_inliers=8, max_planes=6)
                for cp in cluster_planes:
                    cp['id'] = f'P{len(all_extracted_planes)}'
                    all_extracted_planes.append(cp)

        for idx in selected_indices:
            pm = photo_meta[idx]
            cam_pos = pm["cam_pos"]
            pid = pm["pid"]
            lines2d = per_photo_lines.get(pid, [])
            if not lines2d:
                continue

            alt_agl = pm["alt_agl"]
            filter_r = min(32.0, max(12.0, alt_agl * 0.90))
            ridge_thresh = alt_agl * 0.42
            eave_thresh  = alt_agl * 0.78
            nadir_x = pm["wx"]
            nadir_z = pm["wz"]

            for l in lines2d:
                u1, v1, u2, v2 = l
                dx_px = (u2 - u1) * 1920.0
                dy_px = (v2 - v1) * 1080.0
                if math.hypot(dx_px, dy_px) < 32.0:
                    continue

                r1 = project_pixel_to_ray(u1 * 1920.0, v1 * 1080.0, 1920.0, 1080.0,
                                          pm["hfov"], pm["vfov"], cam_pos,
                                          pm["yaw"], pm["pitch"], pm["roll"])
                r2 = project_pixel_to_ray(u2 * 1920.0, v2 * 1080.0, 1920.0, 1080.0,
                                          pm["hfov"], pm["vfov"], cam_pos,
                                          pm["yaw"], pm["pitch"], pm["roll"])

                if r1[1] >= -0.04 or r2[1] >= -0.04:
                    continue

                # Project endpoints to ground plane
                t1_g = (ground_y - pm["wy"]) / r1[1]
                t2_g = (ground_y - pm["wy"]) / r2[1]
                g1 = cam_pos + r1 * t1_g
                g2 = cam_pos + r2 * t2_g
                mid_gx = (g1[0] + g2[0]) / 2.0
                mid_gz = (g1[2] + g2[2]) / 2.0

                # Fix 2: filter against cluster center, not global (0,0) origin
                if math.hypot(mid_gx - cx, mid_gz - cz) > filter_r:
                    continue

                assigned_plane_id = None
                p1_use = None
                p2_use = None
                h1_use = ground_y
                h2_use = ground_y

                # Attempt snap to best fitted plane in this cluster
                if cluster_planes:
                    best_pl = None
                    best_cost = float('inf')
                    for pl in cluster_planes:
                        norm = np.array(pl['normal'], dtype=float)
                        d_val = float(pl['d'])
                        hp1, t_p1 = intersect_ray_with_general_plane(cam_pos, r1, norm, d_val, max_dist=350.0)
                        hp2, t_p2 = intersect_ray_with_general_plane(cam_pos, r2, norm, d_val, max_dist=350.0)
                        if hp1 is not None and hp2 is not None and t_p1 > 0 and t_p2 > 0:
                            s_len = float(np.linalg.norm(hp2 - hp1))
                            if 0.5 <= s_len <= 35.0:
                                mid_pt = (hp1 + hp2) / 2.0
                                cost = float(np.linalg.norm(mid_pt - np.array(pl.get('centroid', mid_pt), dtype=float)))
                                if cost < best_cost and cost < 25.0:
                                    best_cost = cost
                                    best_pl = pl
                                    p1_use = hp1
                                    p2_use = hp2
                                    h1_use = float(hp1[1])
                                    h2_use = float(hp2[1])

                    if best_pl is not None:
                        assigned_plane_id = best_pl['id']

                # Fallback to nadir-distance height heuristic
                if p1_use is None or p2_use is None:
                    d1 = math.hypot(g1[0] - nadir_x, g1[2] - nadir_z)
                    d2 = math.hypot(g2[0] - nadir_x, g2[2] - nadir_z)
                    d_avg = (d1 + d2) / 2.0

                    if d_avg <= ridge_thresh:
                        h1_use = h2_use = ridge_y
                    elif d_avg <= eave_thresh:
                        h1_use = h2_use = eaves_y
                    else:
                        h1_use = h2_use = ground_y

                    t1 = (h1_use - pm["wy"]) / r1[1]
                    t2 = (h2_use - pm["wy"]) / r2[1]
                    if t1 <= 0 or t2 <= 0 or t1 > 350 or t2 > 350:
                        continue
                    p1_use = cam_pos + r1 * t1
                    p2_use = cam_pos + r2 * t2

                seg_len = np.linalg.norm(p2_use - p1_use)
                if 0.50 <= seg_len <= 35.0:
                    p1_rnd = [round(float(p1_use[0]), 3), round(float(p1_use[1]), 3), round(float(p1_use[2]), 3)]
                    p2_rnd = [round(float(p2_use[0]), 3), round(float(p2_use[1]), 3), round(float(p2_use[2]), 3)]
                    raw_3d.append(p1_rnd + p2_rnd)
                    line_planes_raw.append([assigned_plane_id] if assigned_plane_id else [])
                    if abs(h1_use - eaves_y) < 0.2:
                        eave_corners.append(p1_rnd)
                    if abs(h2_use - eaves_y) < 0.2:
                        eave_corners.append(p2_rnd)

        # Generate intersection edges between adjacent planes in this cluster
        if len(cluster_planes) >= 2:
            for p_i in range(len(cluster_planes)):
                for p_j in range(p_i + 1, len(cluster_planes)):
                    plA = cluster_planes[p_i]
                    plB = cluster_planes[p_j]
                    inter_line = intersect_two_planes(plA, plB, span_limit=30.0)
                    if inter_line:
                        raw_3d.append(inter_line)
                        line_planes_raw.append([plA['id'], plB['id']])

    # Deduplicate overlapping line segments while preserving plane associations
    deduped = []
    deduped_planes = []
    tol_sq = 0.4 * 0.4
    for idx_l, l in enumerate(raw_3d):
        x1, y1, z1, x2, y2, z2 = l
        assigned_pids = line_planes_raw[idx_l] if idx_l < len(line_planes_raw) else []
        is_dup = False
        for ex_idx, ex in enumerate(deduped):
            ex1, ey1, ez1, ex2, ey2, ez2 = ex
            d11 = (x1-ex1)**2 + (y1-ey1)**2 + (z1-ez1)**2
            d22 = (x2-ex2)**2 + (y2-ey2)**2 + (z2-ez2)**2
            if d11 < tol_sq and d22 < tol_sq:
                is_dup = True
                for pid in assigned_pids:
                    if pid not in deduped_planes[ex_idx]:
                        deduped_planes[ex_idx].append(pid)
                break
            d12 = (x1-ex2)**2 + (y1-ey2)**2 + (z1-ez2)**2
            d21 = (x2-ex1)**2 + (y2-ey1)**2 + (z2-ez1)**2
            if d12 < tol_sq and d21 < tol_sq:
                is_dup = True
                for pid in assigned_pids:
                    if pid not in deduped_planes[ex_idx]:
                        deduped_planes[ex_idx].append(pid)
                break
        if not is_dup:
            deduped.append(l)
            deduped_planes.append(list(assigned_pids))

    # Add structural corner columns (eave corners down to ground)
    if eave_corners:
        eaves_arr = np.array(eave_corners)
        min_x = np.min(eaves_arr[:, 0])
        max_x = np.max(eaves_arr[:, 0])
        sub_groups = []
        if (max_x - min_x) >= 18.0:
            mid_x = (min_x + max_x) / 2.0
            sub_groups.append(eaves_arr[eaves_arr[:, 0] < mid_x])
            sub_groups.append(eaves_arr[eaves_arr[:, 0] >= mid_x])
        else:
            sub_groups.append(eaves_arr)

        for grp in sub_groups:
            if len(grp) >= 3:
                for pt in [grp[np.argmin(grp[:, 0])], grp[np.argmax(grp[:, 0])],
                           grp[np.argmin(grp[:, 2])], grp[np.argmax(grp[:, 2])]]:
                    col = [round(float(pt[0]), 3), ground_y, round(float(pt[2]), 3),
                           round(float(pt[0]), 3), round(float(pt[1]), 3), round(float(pt[2]), 3)]
                    deduped.append(col)
                    deduped_planes.append([])

    return {
        "lines": deduped,
        "planes": all_extracted_planes,
        "linePlanes": deduped_planes
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
    image_data = input_payload.get("imageData") or input_payload.get("imageBuffer")
    telemetry = input_payload.get("telemetry", {})
    options = input_payload.get("options", {})
    origin = input_payload.get("origin")

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
        if not origin:
            # Derive origin from homePoint or photo 0
            first_p = photos[0]
            first_telem = first_p.get("telemetry", first_p)
            first_act = first_telem.get("actual", {}) if isinstance(first_telem.get("actual"), dict) else {}
            flat = first_telem.get("lat") or first_act.get("lat")
            flon = first_telem.get("lon") or first_act.get("lon")
            if flat is not None and flon is not None:
                origin = {"lat": float(flat), "lon": float(flon)}

        all_lines = []
        per_photo_lines = {}
        total_raw = 0
        for photo in photos:
            p_path = photo.get("filePath") or photo.get("rawPath") or photo.get("path")
            p_data = photo.get("imageData")
            p_telem = photo.get("telemetry", photo)
            p_key = photo.get("filename") or photo.get("photoId") or os.path.basename(p_path) if p_path else "unknown"
            res = extract_wireframe_from_image(p_path, telemetry=p_telem, options=options, origin=origin, image_data=p_data)
            if res.get("success"):
                all_lines.extend(res.get("lines", []))
                total_raw += res.get("totalRawLines", 0)
                per_photo_lines[p_key] = res.get("lines2D", [])
                if photo.get("photoId") and photo.get("photoId") != p_key:
                    per_photo_lines[photo["photoId"]] = res.get("lines2D", [])

        # Priority 1: Unproject authentic detected architectural lines from photos
        authentic_res = unproject_authentic_architectural_lines(photos, per_photo_lines, origin=origin, options=options)
        planes_out = []
        line_planes_out = []
        if isinstance(authentic_res, dict):
            authentic_lines = authentic_res.get("lines", [])
            planes_out = authentic_res.get("planes", [])
            line_planes_out = authentic_res.get("linePlanes", [])
        elif isinstance(authentic_res, list):
            authentic_lines = authentic_res
        else:
            authentic_lines = []

        if authentic_lines and len(authentic_lines) >= 15:
            final_3d_lines = authentic_lines
        else:
            # Priority 2: Multi-structure CAD synthesis fallback
            cad_lines = synthesize_architectural_wireframe(photos, origin=origin, options=options)
            if cad_lines:
                final_3d_lines = cad_lines
                planes_out = []
                line_planes_out = []
            else:
                final_3d_lines = all_lines
                planes_out = []
                line_planes_out = []

        out_data = {
            "success": True,
            "lines": final_3d_lines,
            "planes": planes_out,
            "linePlanes": line_planes_out,
            "perPhotoLines": per_photo_lines,
            "count": len(final_3d_lines),
            "totalRawLines": total_raw,
            "totalPhotosProcessed": len(photos)
        }
    else:
        out_data = extract_wireframe_from_image(image_path, telemetry=telemetry, options=options, origin=origin, image_data=image_data)

    json_str = json.dumps(out_data, indent=2)

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(json_str)
    else:
        print(json_str)

if __name__ == "__main__":
    main()
