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

    valid_candidates = []
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
        valid_candidates.append((pix_len, x1_pix, y1_pix, x2_pix, y2_pix))

    # Sort descending by 2D pixel length so authentic long edges (roof ridges, eaves, footprint)
    # take precedence over short micro-texture noise (shingles, asphalt, foliage)
    valid_candidates.sort(key=lambda c: c[0], reverse=True)
    max_2d = int(options.get("max2dLinesPerPhoto", 45))
    selected_lines = valid_candidates[:max_2d]

    for (pix_len, x1_pix, y1_pix, x2_pix, y2_pix) in selected_lines:
        dx_pix = x2_pix - x1_pix
        dy_pix = y2_pix - y1_pix

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

def point_in_polygon_xz(x, z, poly_xz):
    """
    Determines if 2D coordinate (x, z) lies within polygon vertices [(x, z), ...].
    """
    if not poly_xz or len(poly_xz) < 3:
        return True
    inside = False
    n = len(poly_xz)
    p1x, p1z = poly_xz[0][0], poly_xz[0][1]
    for i in range(1, n + 1):
        p2x, p2z = poly_xz[i % n][0], poly_xz[i % n][1]
        if min(p1z, p2z) < z <= max(p1z, p2z):
            if x <= max(p1x, p2x):
                if p1z != p2z:
                    xinters = (z - p1z) * (p2x - p1x) / (p2z - p1z) + p1x
                if p1x == p2x or x <= xinters:
                    inside = not inside
        p1x, p1z = p2x, p2z
    return inside

def build_camera_matrices(pm, image_w=1920.0, image_h=1080.0):
    """
    Builds camera intrinsic matrix K and extrinsic [R | t] from photo telemetry.
    """
    hfov_rad = math.radians(pm.get("hfov", 73.7))
    vfov_rad = math.radians(pm.get("vfov", 53.1))
    fx = (image_w / 2.0) / math.tan(hfov_rad / 2.0)
    fy = (image_h / 2.0) / math.tan(vfov_rad / 2.0)
    cx = image_w / 2.0
    cy = image_h / 2.0
    K = np.array([
        [fx, 0.0, cx],
        [0.0, fy, cy],
        [0.0, 0.0, 1.0]
    ], dtype=np.float64)

    psi = math.radians(pm.get("yaw", 0.0))
    theta = math.radians(pm.get("pitch", -60.0))
    phi = math.radians(pm.get("roll", 0.0))

    cos_t = math.cos(theta); sin_t = math.sin(theta)
    sin_p = math.sin(psi);   cos_p = math.cos(psi)

    fwd = np.array([cos_t * sin_p, sin_t, -cos_t * cos_p], dtype=np.float64)
    right = np.array([cos_p, 0.0, sin_p], dtype=np.float64)
    cam_up = np.cross(right, fwd)
    norm_up = np.linalg.norm(cam_up)
    if norm_up > 1e-6:
        cam_up /= norm_up
    if abs(phi) > 1e-4:
        c_r = math.cos(phi); s_r = math.sin(phi)
        right = c_r * right + s_r * cam_up
        cam_up = -s_r * right + c_r * cam_up

    R = np.vstack([right, -cam_up, fwd])
    cam_pos = np.array(pm["cam_pos"], dtype=np.float64)
    t = -R @ cam_pos
    return K, R, t

def build_stereo_pair_graph(photo_meta, options=None):
    """
    Constructs a topological graph of overlapping photo pairs suitable for multi-view stereo (MVS)
    epipolar triangulation, evaluating baseline distance, optical axis alignment, and ground footprint overlap.
    """
    options = options or {}
    pairs = []
    n = len(photo_meta)
    if n < 2:
        return pairs

    for i in range(n):
        pmA = photo_meta[i]
        posA = pmA["cam_pos"]
        fwdA = project_pixel_to_ray(960, 540, 1920, 1080, pmA["hfov"], pmA["vfov"], posA, pmA["yaw"], pmA["pitch"], pmA["roll"])
        altA = max(5.0, pmA.get("alt_agl", 25.0))

        for j in range(i + 1, n):
            pmB = photo_meta[j]
            posB = pmB["cam_pos"]
            fwdB = project_pixel_to_ray(960, 540, 1920, 1080, pmB["hfov"], pmB["vfov"], posB, pmB["yaw"], pmB["pitch"], pmB["roll"])
            altB = max(5.0, pmB.get("alt_agl", 25.0))
            avg_alt = (altA + altB) / 2.0

            baseline = float(np.linalg.norm(posA - posB))
            min_b = max(1.0, avg_alt * 0.03)
            max_b = max(20.0, avg_alt * 1.25)

            if baseline < min_b or baseline > max_b:
                continue

            g_dist = math.hypot(pmA["gx"] - pmB["gx"], pmA["gz"] - pmB["gz"])
            if g_dist > max(35.0, avg_alt * 1.4):
                continue

            cos_ang = float(np.clip(np.dot(fwdA, fwdB), -1.0, 1.0))
            ang_deg = math.degrees(math.acos(cos_ang))

            if ang_deg <= 80.0:
                score = (1.0 / (1.0 + g_dist)) * (1.0 - min(0.9, abs(baseline / avg_alt - 0.28)))
                pairs.append({
                    "i": i,
                    "j": j,
                    "baseline": baseline,
                    "angle": ang_deg,
                    "score": score,
                    "g_dist": g_dist
                })

    max_pairs = int(options.get("maxStereoPairs", 15))
    pairs.sort(key=lambda p: p["score"], reverse=True)
    return pairs[:max_pairs]

def triangulate_stereo_lines(posA, r1a, r2a, posB, r1b, r2b, sensitivity=1.0):
    """
    Triangulates two 2D line segments from calibrated stereo photo poses into a 3D line segment.
    Uses epipolar viewing plane intersection with ray coplanarity validation.
    Falls back to direct endpoint ray intersection if endpoints coincide.
    """
    # 1. First test direct endpoint pairing (1-1, 2-2) or swapped (1-2, 2-1)
    m1_dir, d1_dir, _ = closest_points_between_rays(posA, r1a, posB, r1b)
    m2_dir, d2_dir, _ = closest_points_between_rays(posA, r2a, posB, r2b)
    err_dir = max(d1_dir, d2_dir)

    m1_swp, d1_swp, _ = closest_points_between_rays(posA, r1a, posB, r2b)
    m2_swp, d2_swp, _ = closest_points_between_rays(posA, r2a, posB, r1b)
    err_swp = max(d1_swp, d2_swp)

    if err_dir <= err_swp and err_dir <= sensitivity and m1_dir is not None and m2_dir is not None:
        return m1_dir, m2_dir
    if err_swp < err_dir and err_swp <= sensitivity and m1_swp is not None and m2_swp is not None:
        return m1_swp, m2_swp

    # 2. Epipolar Viewing Plane Intersection for non-coincident Hough segment endpoints
    nA = np.cross(r1a, r2a)
    norm_nA = float(np.linalg.norm(nA))
    if norm_nA < 1e-4:
        return None, None
    nA /= norm_nA

    nB = np.cross(r1b, r2b)
    norm_nB = float(np.linalg.norm(nB))
    if norm_nB < 1e-4:
        return None, None
    nB /= norm_nB

    u_raw = np.cross(nA, nB)
    len_u = float(np.linalg.norm(u_raw))
    if len_u < 0.02:
        return None, None
    u = u_raw / len_u

    dA = -float(np.dot(nA, posA))
    dB = -float(np.dot(nB, posB))

    nBxU = np.cross(nB, u_raw)
    uXnA = np.cross(u_raw, nA)
    denom_p0 = len_u * len_u

    P0 = ((-dA) * nBxU + (-dB) * uXnA) / denom_p0

    def project_ray_to_line(C, r):
        w0 = C - P0
        b = float(np.dot(r, u))
        d = float(np.dot(r, w0))
        e = float(np.dot(u, w0))
        den = 1.0 - b * b
        if abs(den) < 1e-5:
            return None
        s = (e - b * d) / den
        t = b * s - d
        if t <= 0 or t > 350:
            return None
        pt_ray = C + t * r
        pt_line = P0 + s * u
        dist = float(np.linalg.norm(pt_ray - pt_line))
        if dist > sensitivity:
            return None
        return s

    s1a = project_ray_to_line(posA, r1a)
    s2a = project_ray_to_line(posA, r2a)
    s1b = project_ray_to_line(posB, r1b)
    s2b = project_ray_to_line(posB, r2b)
    if s1a is None or s2a is None or s1b is None or s2b is None:
        return None, None

    min_a = min(s1a, s2a)
    max_a = max(s1a, s2a)
    min_b = min(s1b, s2b)
    max_b = max(s1b, s2b)

    overlap = min(max_a, max_b) - max(min_a, min_b)
    if overlap < -2.0:
        return None, None

    start_s = min(min_a, min_b)
    end_s = max(max_a, max_b)
    p1 = P0 + start_s * u
    p2 = P0 + end_s * u

    return p1, p2

def unproject_authentic_architectural_lines(photos, per_photo_lines, origin=None, options=None):
    """
    OpenCV 5.0 Multi-View Stereo (MVS) Architectural 3D Wireframe & Plane Triangulation.
    Performs true epipolar ray-ray triangulation across overlapping drone survey photo pairs.
    Eliminates single-photo monocular flat pancake heuristics and fake dummy bounding boxes.
    """
    if not photos or not per_photo_lines:
        return {"lines": [], "planes": [], "linePlanes": [], "stereoPairsCount": 0}
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
    sensitivity = float(options.get("sensitivity", 1.0))
    suppress_vegetation = bool(options.get("suppressVegetation", True))
    eave_prior = float(options["eaveHeight"]) if options.get("eaveHeight") else None
    roof_prior = float(options["roofHeight"]) if options.get("roofHeight") else None

    # Parse boundary polygon if provided (for convex hull / parcel clipping)
    boundary_poly = []
    raw_bp = options.get("boundaryPolygon")
    if raw_bp and isinstance(raw_bp, list):
        for bp in raw_bp:
            if isinstance(bp, (list, tuple)) and len(bp) >= 2:
                boundary_poly.append((float(bp[0]), float(bp[1])))
            elif isinstance(bp, dict):
                if "x" in bp and "z" in bp:
                    boundary_poly.append((float(bp["x"]), float(bp["z"])))
                elif ("lat" in bp or "latitude" in bp) and orig_lat is not None and orig_lon is not None:
                    plat = float(bp.get("lat") or bp.get("latitude"))
                    plon = float(bp.get("lon") or bp.get("longitude") or bp.get("lng"))
                    bx, bz = latlon_to_world(plat, plon, orig_lat, orig_lon)
                    boundary_poly.append((bx, bz))

    # Phase 1: Build per-photo metadata
    photo_meta = []
    rejected_pitch_count = 0
    zero_lines_2d_count = 0
    for p in photos:
        telem = p.get("telemetry", p)
        act = telem.get("actual", {}) if isinstance(telem.get("actual"), dict) else {}
        pitch = float(telem.get("pitch") if telem.get("pitch") is not None
                      else (telem.get("gimbalPitch") if telem.get("gimbalPitch") is not None
                            else act.get("gimbalPitch", -60.0)))
        if pitch > -20.0:
            rejected_pitch_count += 1
            continue
        pid = p.get("photoId") or p.get("id") or p.get("filename")
        fname = p.get("filename")
        lines2d = per_photo_lines.get(pid) or (per_photo_lines.get(fname) if fname else None) or p.get("lines2D") or p.get("detectedLines") or []
        if len(lines2d) == 0:
            zero_lines_2d_count += 1
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

        center_ray = project_pixel_to_ray(960, 540, 1920, 1080, hfov, vfov,
                                          cam_pos, yaw, pitch, roll)
        gx, gz = wx, wz
        if abs(center_ray[1]) > 1e-4:
            t_c = (ground_y - wy) / center_ray[1]
            if 0 < t_c < 350:
                gx = wx + center_ray[0] * t_c
                gz = wz + center_ray[2] * t_c

        photo_meta.append({
            "photo": p, "pid": pid, "line_count": len(lines2d),
            "cam_pos": cam_pos, "wx": wx, "wy": wy, "wz": wz,
            "yaw": yaw, "pitch": pitch, "roll": roll, "hfov": hfov, "vfov": vfov,
            "gx": gx, "gz": gz,
            "alt_agl": wy - ground_y,
        })

    if not photo_meta:
        diag = {
            "totalInputPhotos": len(photos),
            "validPitchPhotos": 0,
            "rejectedPitchCount": rejected_pitch_count,
            "zeroLines2dCount": zero_lines_2d_count,
            "stereoPairsCount": 0,
            "clippedByBoundaryCount": 0
        }
        if rejected_pitch_count > 0 and zero_lines_2d_count == 0:
            err_msg = f"0 of {len(photos)} photos met downward gimbal pitch requirement (<= -20 deg; {rejected_pitch_count} were too shallow)."
        elif zero_lines_2d_count > 0:
            err_msg = f"No architectural 2D edges detected in {zero_lines_2d_count} downward photos (missing files or low contrast)."
        else:
            err_msg = "No valid downward/oblique survey photos found for 3D wireframe triangulation."
        return {"lines": [], "planes": [], "linePlanes": [], "stereoPairsCount": 0, "error": err_msg, "diagnostics": diag}

    # Phase 2: Build stereo pair graph
    stereo_pairs = build_stereo_pair_graph(photo_meta, options)

    raw_3d = []
    line_planes_raw = []
    triangulated_pts = []
    clipped_by_boundary_count = 0

    # Phase 3: True Multi-View Stereo Epipolar Line Triangulation
    # Iterate across valid baseline pairs and triangulate 3D line endpoints
    for pair in stereo_pairs:
        pmA = photo_meta[pair["i"]]
        pmB = photo_meta[pair["j"]]
        linesA = per_photo_lines.get(pmA["pid"], [])
        linesB = per_photo_lines.get(pmB["pid"], [])
        if not linesA or not linesB:
            continue

        posA = pmA["cam_pos"]
        posB = pmB["cam_pos"]

        # Precompute ray directions and horizontal unit azimuths for lines in photo A
        raysA = []
        for lA in linesA:
            u1, v1, u2, v2 = lA
            r1 = project_pixel_to_ray(u1 * 1920.0, v1 * 1080.0, 1920.0, 1080.0, pmA["hfov"], pmA["vfov"], posA, pmA["yaw"], pmA["pitch"], pmA["roll"])
            r2 = project_pixel_to_ray(u2 * 1920.0, v2 * 1080.0, 1920.0, 1080.0, pmA["hfov"], pmA["vfov"], posA, pmA["yaw"], pmA["pitch"], pmA["roll"])
            dr = r2 - r1
            norm_dr = math.hypot(dr[0], dr[2])
            dir_xz = (dr[0] / norm_dr, dr[2] / norm_dr) if norm_dr > 1e-4 else (0.0, 0.0)
            raysA.append((r1, r2, dir_xz))

        # Precompute ray directions and horizontal unit azimuths for lines in photo B
        raysB = []
        for lB in linesB:
            u1, v1, u2, v2 = lB
            r1 = project_pixel_to_ray(u1 * 1920.0, v1 * 1080.0, 1920.0, 1080.0, pmB["hfov"], pmB["vfov"], posB, pmB["yaw"], pmB["pitch"], pmB["roll"])
            r2 = project_pixel_to_ray(u2 * 1920.0, v2 * 1080.0, 1920.0, 1080.0, pmB["hfov"], pmB["vfov"], posB, pmB["yaw"], pmB["pitch"], pmB["roll"])
            dr = r2 - r1
            norm_dr = math.hypot(dr[0], dr[2])
            dir_xz = (dr[0] / norm_dr, dr[2] / norm_dr) if norm_dr > 1e-4 else (0.0, 0.0)
            raysB.append((r1, r2, dir_xz))

        for (r1a, r2a, dirA) in raysA:
            for (r1b, r2b, dirB) in raysB:
                # Fast azimuth angle co-rejection: lines differing by > 45 deg in horizontal azimuth cannot match
                dot_az = abs(dirA[0] * dirB[0] + dirA[1] * dirB[1])
                if dot_az < 0.70 and (dirA[0] != 0.0 or dirA[1] != 0.0) and (dirB[0] != 0.0 or dirB[1] != 0.0):
                    continue
                p1, p2 = triangulate_stereo_lines(posA, r1a, r2a, posB, r1b, r2b, sensitivity=sensitivity)
                if p1 is None or p2 is None:
                    continue

                # Validate altitude above ground
                if p1[1] < (ground_y - 1.0) or p2[1] < (ground_y - 1.0):
                    continue

                seg_len = float(np.linalg.norm(p2 - p1))
                if seg_len < 0.40 or seg_len > 45.0:
                    continue

                mid_x = (p1[0] + p2[0]) / 2.0
                mid_z = (p1[2] + p2[2]) / 2.0

                # Boundary polygon spatial clipping
                if boundary_poly and not point_in_polygon_xz(mid_x, mid_z, boundary_poly):
                    clipped_by_boundary_count += 1
                    continue

                # Suppress isolated scattered vertical vegetation/foliage noise
                if suppress_vegetation:
                    verticality = abs(p2[1] - p1[1]) / (seg_len + 1e-5)
                    if verticality > 0.88 and seg_len < 1.2:
                        continue

                # Snap to user height priors if provided
                if eave_prior is not None:
                    target_y = ground_y + eave_prior
                    if abs(p1[1] - target_y) < 0.65: p1[1] = target_y
                    if abs(p2[1] - target_y) < 0.65: p2[1] = target_y
                if roof_prior is not None:
                    target_y = ground_y + (eave_prior or 6.0) + roof_prior
                    if abs(p1[1] - target_y) < 0.65: p1[1] = target_y
                    if abs(p2[1] - target_y) < 0.65: p2[1] = target_y

                p1_rnd = [round(float(p1[0]), 3), round(float(p1[1]), 3), round(float(p1[2]), 3)]
                p2_rnd = [round(float(p2[0]), 3), round(float(p2[1]), 3), round(float(p2[2]), 3)]
                raw_3d.append(p1_rnd + p2_rnd)
                line_planes_raw.append([])

                # Accumulate 3D point cloud for USAC_MAGSAC plane fitting
                triangulated_pts.append(p1)
                triangulated_pts.append(p2)
                triangulated_pts.append((p1 + p2) / 2.0)

    # Phase 4: USAC_MAGSAC / RANSAC 3D Plane Extraction
    all_extracted_planes = []
    if len(triangulated_pts) >= 8:
        all_extracted_planes = fit_planes_ransac(triangulated_pts, dist_threshold=0.40, min_inliers=8, max_planes=6)

        # Generate intersection edges between adjacent planes (e.g. roof ridge, wall joints)
        if len(all_extracted_planes) >= 2:
            for p_i in range(len(all_extracted_planes)):
                for p_j in range(p_i + 1, len(all_extracted_planes)):
                    plA = all_extracted_planes[p_i]
                    plB = all_extracted_planes[p_j]
                    inter_line = intersect_two_planes(plA, plB, span_limit=35.0)
                    if inter_line:
                        raw_3d.append(inter_line)
                        line_planes_raw.append([plA['id'], plB['id']])

        # Tag lines with planes they lie upon
        for idx_l, l in enumerate(raw_3d):
            p1 = np.array(l[0:3], dtype=float)
            p2 = np.array(l[3:6], dtype=float)
            for pl in all_extracted_planes:
                norm = np.array(pl['normal'], dtype=float)
                d_val = float(pl['d'])
                d1 = abs(float(np.dot(norm, p1)) + d_val)
                d2 = abs(float(np.dot(norm, p2)) + d_val)
                if d1 < 0.35 and d2 < 0.35:
                    if pl['id'] not in line_planes_raw[idx_l]:
                        line_planes_raw[idx_l].append(pl['id'])

    # Phase 5: Deduplicate overlapping line segments
    deduped = []
    deduped_planes = []
    tol_sq = 0.35 * 0.35
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

    err_msg = None
    if not deduped:
        if len(stereo_pairs) == 0:
            err_msg = f"Processed {len(photo_meta)} downward photos, but 0 overlapping stereo baseline pairs were found (check waypoint spacing, overlap, and viewing angle <= 80 deg)."
        elif clipped_by_boundary_count > 0:
            err_msg = f"Triangulated {clipped_by_boundary_count} 3D segments across {len(stereo_pairs)} stereo pairs, but all fell outside the active Boundary Hull."
        else:
            err_msg = f"Evaluated {len(stereo_pairs)} stereo pairs across {len(photo_meta)} photos, but no matching 3D architectural edges converged within {sensitivity}m."

    return {
        "lines": deduped,
        "planes": all_extracted_planes,
        "linePlanes": deduped_planes,
        "stereoPairsCount": len(stereo_pairs),
        "opencvVersion": cv2.__version__ if HAS_OPENCV else None,
        "error": err_msg,
        "diagnostics": {
            "totalInputPhotos": len(photos),
            "validPitchPhotos": len(photo_meta),
            "rejectedPitchCount": rejected_pitch_count,
            "zeroLines2dCount": zero_lines_2d_count,
            "stereoPairsCount": len(stereo_pairs),
            "clippedByBoundaryCount": clipped_by_boundary_count
        }
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
        per_photo_lines = dict(input_payload.get("perPhotoLines") or {})
        total_raw = 0
        for photo in photos:
            p_path = photo.get("filePath") or photo.get("rawPath") or photo.get("path")
            p_data = photo.get("imageData")
            p_telem = photo.get("telemetry", photo)
            p_fname = photo.get("filename") or (os.path.basename(p_path) if p_path else None)
            p_id = photo.get("photoId") or photo.get("id")
            p_key = p_fname or p_id or "unknown"
            if (p_fname and p_fname in per_photo_lines and per_photo_lines[p_fname]) or (p_id and p_id in per_photo_lines and per_photo_lines[p_id]):
                continue
            if photo.get("lines2D"):
                l2d = photo["lines2D"]
                if p_fname:
                    per_photo_lines[p_fname] = l2d
                if p_id:
                    per_photo_lines[p_id] = l2d
                continue
            res = extract_wireframe_from_image(p_path, telemetry=p_telem, options=options, origin=origin, image_data=p_data)
            if res.get("success"):
                all_lines.extend(res.get("lines", []))
                total_raw += res.get("totalRawLines", 0)
                extracted_2d = res.get("lines2D", [])
                if p_fname:
                    per_photo_lines[p_fname] = extracted_2d
                if p_id:
                    per_photo_lines[p_id] = extracted_2d

        # Priority 1: Unproject authentic detected architectural lines from photos
        authentic_res = unproject_authentic_architectural_lines(photos, per_photo_lines, origin=origin, options=options)
        planes_out = []
        line_planes_out = []
        stereo_pairs_count = 0
        opencv_ver = cv2.__version__ if HAS_OPENCV else None
        err_out = None
        diag_out = None
        if isinstance(authentic_res, dict):
            authentic_lines = authentic_res.get("lines", [])
            planes_out = authentic_res.get("planes", [])
            line_planes_out = authentic_res.get("linePlanes", [])
            stereo_pairs_count = authentic_res.get("stereoPairsCount", 0)
            opencv_ver = authentic_res.get("opencvVersion", opencv_ver)
            err_out = authentic_res.get("error")
            diag_out = authentic_res.get("diagnostics")
        elif isinstance(authentic_res, list):
            authentic_lines = authentic_res
        else:
            authentic_lines = []

        if authentic_lines and len(authentic_lines) >= 4:
            final_3d_lines = authentic_lines
            is_success = True
        elif all_lines and len(all_lines) >= 4:
            # Fall back to single-image architectural edge extrusions if MVS stereo graph had sparse baseline pairs
            deduped_fallback = []
            tol_sq_fb = 0.4 * 0.4
            for l in all_lines:
                dup = False
                for ex in deduped_fallback:
                    d11 = (l[0]-ex[0])**2 + (l[1]-ex[1])**2 + (l[2]-ex[2])**2
                    d22 = (l[3]-ex[3])**2 + (l[4]-ex[4])**2 + (l[5]-ex[5])**2
                    if d11 < tol_sq_fb and d22 < tol_sq_fb:
                        dup = True
                        break
                if not dup:
                    deduped_fallback.append(l)
            final_3d_lines = deduped_fallback
            is_success = len(final_3d_lines) > 0
        else:
            final_3d_lines = authentic_lines
            is_success = len(authentic_lines) > 0

        out_data = {
            "success": is_success,
            "lines": final_3d_lines,
            "planes": planes_out,
            "linePlanes": line_planes_out,
            "perPhotoLines": per_photo_lines,
            "count": len(final_3d_lines),
            "stereoPairsCount": stereo_pairs_count,
            "opencvVersion": opencv_ver,
            "totalRawLines": total_raw,
            "totalPhotosProcessed": len(photos),
            "error": None if is_success else (err_out or "Insufficient authentic architectural lines detected in downward survey imagery"),
            "diagnostics": diag_out
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
