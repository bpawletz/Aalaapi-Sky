/**
 * tools/companion/wireframe_engine.js
 * Aalaapi Sky - Bridge-Hosted Wireframe Extraction & Telemetry Ray Projection Pipeline
 *
 * Orchestrates the OpenCV Python pipeline and provides a pure JS fallback for environments
 * without Python/OpenCV. Handles camera intrinsic matrix projection, 3D line serialization,
 * and format conversion (JSON / Wavefront OBJ / GeoJSON).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const SCRIPT_PATH = path.join(__dirname, 'wireframe_extractor.py');

/**
 * Converts GPS latitude and longitude to Three.js world space coordinates (X = East, Z = South)
 * relative to the flight scene origin (Home Point / photo 0), matching Web Mercator zoom 18.
 */
function latlonToWorld(lat, lon, originLat, originLon, zoom = 18) {
  const tileWidthMeters = 40075016.686 * Math.cos((originLat * Math.PI) / 180) / Math.pow(2, zoom);
  const sinLat0 = Math.sin((originLat * Math.PI) / 180);
  const xTile0 = ((originLon + 180) / 360) * Math.pow(2, zoom);
  const yTile0 = (0.5 - Math.log((1 + sinLat0) / (1 - sinLat0)) / (4 * Math.PI)) * Math.pow(2, zoom);

  const sinLat = Math.sin((lat * Math.PI) / 180);
  const xTile = ((lon + 180) / 360) * Math.pow(2, zoom);
  const yTile = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * Math.pow(2, zoom);

  return {
    x: (xTile - xTile0) * tileWidthMeters,
    z: (yTile - yTile0) * tileWidthMeters
  };
}

/**
 * Projects 2D pixel to 3D unit ray in Three.js world space:
 * X = East (+X), Y = Up (+Y), Z = South (+Z, North is -Z).
 */
function projectPixelToRay(u, v, width, height, hfovDeg = 73.7, vfovDeg = 53.1, camPos = { x: 0, y: 25, z: 0 }, yawDeg = 0, pitchDeg = -60, rollDeg = 0) {
  const hfovRad = (hfovDeg * Math.PI) / 180.0;
  const vfovRad = (vfovDeg * Math.PI) / 180.0;

  const fx = (width / 2.0) / Math.tan(hfovRad / 2.0);
  const fy = (height / 2.0) / Math.tan(vfovRad / 2.0);
  const cx = width / 2.0;
  const cy = height / 2.0;

  const xc = (u - cx) / fx;
  const yc = (v - cy) / fy;

  const psi = (yawDeg * Math.PI) / 180.0;
  const theta = (pitchDeg * Math.PI) / 180.0;
  const phi = (rollDeg * Math.PI) / 180.0;

  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  const sinP = Math.sin(psi);
  const cosP = Math.cos(psi);

  // Forward unit vector in world space
  const fwd = [cosT * sinP, sinT, -cosT * cosP];
  // Right unit vector
  let right = [cosP, 0.0, sinP];

  // Up vector = right x forward
  let up = [
    right[1] * fwd[2] - right[2] * fwd[1],
    right[2] * fwd[0] - right[0] * fwd[2],
    right[0] * fwd[1] - right[1] * fwd[0]
  ];
  const upNorm = Math.hypot(up[0], up[1], up[2]);
  if (upNorm > 1e-6) {
    up = [up[0] / upNorm, up[1] / upNorm, up[2] / upNorm];
  }

  // Roll rotation if present
  if (Math.abs(phi) > 1e-4) {
    const cR = Math.cos(phi);
    const sR = Math.sin(phi);
    const rightR = [cR * right[0] + sR * up[0], cR * right[1] + sR * up[1], cR * right[2] + sR * up[2]];
    const upR = [-sR * right[0] + cR * up[0], -sR * right[1] + cR * up[1], -sR * right[2] + cR * up[2]];
    right = rightR;
    up = upR;
  }

  // Ray direction
  let rx = xc * right[0] - yc * up[0] + fwd[0];
  let ry = xc * right[1] - yc * up[1] + fwd[1];
  let rz = xc * right[2] - yc * up[2] + fwd[2];

  const rNorm = Math.hypot(rx, ry, rz);
  if (rNorm > 1e-6) {
    rx /= rNorm;
    ry /= rNorm;
    rz /= rNorm;
  } else {
    rx = 0; ry = -1; rz = 0;
  }

  return [rx, ry, rz];
}

/**
 * Finds intersection of ray with horizontal ground plane at y = planeY.
 */
function intersectRayWithPlane(camPos, rayDir, planeY = 0.0, maxDist = 1200.0) {
  const px = camPos.x || camPos[0] || 0;
  const py = camPos.y || camPos[1] || 25;
  const pz = camPos.z || camPos[2] || 0;

  const [rx, ry, rz] = rayDir;

  if (Math.abs(ry) > 1e-4) {
    const t = (planeY - py) / ry;
    if (t > 0 && t <= maxDist) {
      return [px + rx * t, planeY, pz + rz * t];
    }
  }

  const tFallback = Math.min(maxDist, Math.max(15.0, py * 1.5));
  return [px + rx * tFallback, Math.max(planeY, py + ry * tFallback), pz + rz * tFallback];
}

/**
 * Deduplicates 3D line segments within a spatial tolerance.
 */
function deduplicateLines(lines = [], tolerance = 0.2) {
  const result = [];
  const tolSq = tolerance * tolerance;

  function ptDistSq(ax, ay, az, bx, by, bz) {
    const dx = ax - bx, dy = ay - by, dz = az - bz;
    return dx * dx + dy * dy + dz * dz;
  }

  for (const line of lines) {
    if (!Array.isArray(line) || line.length < 6) continue;
    const [x1, y1, z1, x2, y2, z2] = line;
    if (ptDistSq(x1, y1, z1, x2, y2, z2) < 0.05 * 0.05) continue; // Skip zero-length

    let duplicate = false;
    for (const ex of result) {
      const [ex1, ey1, ez1, ex2, ey2, ez2] = ex;
      if (
        (ptDistSq(x1, y1, z1, ex1, ey1, ez1) < tolSq && ptDistSq(x2, y2, z2, ex2, ey2, ez2) < tolSq) ||
        (ptDistSq(x1, y1, z1, ex2, ey2, ez2) < tolSq && ptDistSq(x2, y2, z2, ex1, ey1, ez1) < tolSq)
      ) {
        duplicate = true;
        break;
      }
    }
    if (!duplicate) {
      result.push(line);
    }
  }
  return result;
}

/**
 * Builds 3D camera frustum wireframe pyramid line coordinates for a photo pose.
 */
function buildFrustumSegments(photo = {}, dist = 3.0) {
  const px = photo.x || 0;
  const py = photo.y || 25;
  const pz = photo.z || 0;
  const yaw = photo.yaw || 0;
  const pitch = photo.pitch !== undefined ? photo.pitch : -60;
  const roll = photo.roll || 0;
  const hfov = photo.hfov || 73.7;
  const vfov = photo.vfov || 53.1;

  const psi = (yaw * Math.PI) / 180.0;
  const theta = (pitch * Math.PI) / 180.0;
  const phi = (roll * Math.PI) / 180.0;

  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  const sinP = Math.sin(psi);
  const cosP = Math.cos(psi);

  const fwd = [cosT * sinP, sinT, -cosT * cosP];
  let right = [cosP, 0.0, sinP];
  let up = [
    right[1] * fwd[2] - right[2] * fwd[1],
    right[2] * fwd[0] - right[0] * fwd[2],
    right[0] * fwd[1] - right[1] * fwd[0]
  ];
  const upNorm = Math.hypot(up[0], up[1], up[2]);
  if (upNorm > 1e-6) {
    up = [up[0] / upNorm, up[1] / upNorm, up[2] / upNorm];
  }
  if (Math.abs(phi) > 1e-4) {
    const cR = Math.cos(phi);
    const sR = Math.sin(phi);
    const rightR = [cR * right[0] + sR * up[0], cR * right[1] + sR * up[1], cR * right[2] + sR * up[2]];
    const upR = [-sR * right[0] + cR * up[0], -sR * right[1] + cR * up[1], -sR * right[2] + cR * up[2]];
    right = rightR;
    up = upR;
  }

  const fovHalfX = Math.tan(((hfov * Math.PI) / 180.0) / 2.0);
  const fovHalfY = Math.tan(((vfov * Math.PI) / 180.0) / 2.0);
  const wHalf = dist * fovHalfX;
  const hHalf = dist * fovHalfY;

  const cL = [
    px + fwd[0] * dist,
    py + fwd[1] * dist,
    pz + fwd[2] * dist
  ];

  const pTL = [cL[0] - right[0] * wHalf + up[0] * hHalf, cL[1] - right[1] * wHalf + up[1] * hHalf, cL[2] - right[2] * wHalf + up[2] * hHalf];
  const pTR = [cL[0] + right[0] * wHalf + up[0] * hHalf, cL[1] + right[1] * wHalf + up[1] * hHalf, cL[2] + right[2] * wHalf + up[2] * hHalf];
  const pBR = [cL[0] + right[0] * wHalf - up[0] * hHalf, cL[1] + right[1] * wHalf - up[1] * hHalf, cL[2] + right[2] * wHalf - up[2] * hHalf];
  const pBL = [cL[0] - right[0] * wHalf - up[0] * hHalf, cL[1] - right[1] * wHalf - up[1] * hHalf, cL[2] - right[2] * wHalf - up[2] * hHalf];

  const segs = [];
  const addSeg = (a, b) => {
    segs.push(
      Math.round(a[0] * 1000) / 1000, Math.round(a[1] * 1000) / 1000, Math.round(a[2] * 1000) / 1000,
      Math.round(b[0] * 1000) / 1000, Math.round(b[1] * 1000) / 1000, Math.round(b[2] * 1000) / 1000
    );
  };
  const C = [px, py, pz];
  addSeg(C, pTL);
  addSeg(C, pTR);
  addSeg(C, pBR);
  addSeg(C, pBL);
  addSeg(pTL, pTR);
  addSeg(pTR, pBR);
  addSeg(pBR, pBL);
  addSeg(pBL, pTL);
  return segs;
}

/**
 * Pure JavaScript volumetric architectural wireframe generator.
 * Builds true 3D spatial geometry: foundation, vertical columns, eaves, roof ridge, and rafters.
 */
function extractWireframeJsFallback(payload = {}) {
  const photos = payload.photos || (payload.imagePath ? [{ filePath: payload.imagePath, telemetry: payload.telemetry }] : []);
  const options = payload.options || {};
  const groundY = (typeof options.groundAltitude === 'number') ? options.groundAltitude : 0.0;
  const rawLines = [];

  // Determine origin for lat/lon conversion if needed
  let origin = payload.origin;
  if (!origin && photos.length > 0) {
    const firstP = photos[0];
    const firstTelem = firstP.telemetry || firstP;
    const flat = firstTelem.lat !== undefined ? firstTelem.lat : (firstTelem.actual && firstTelem.actual.lat);
    const flon = firstTelem.lon !== undefined ? firstTelem.lon : (firstTelem.actual && firstTelem.actual.lon);
    if (flat !== undefined && flon !== undefined) {
      origin = { lat: flat, lon: flon };
    }
  }

  // Extract camera positions and calculate ground target ray hits
  const camPositions = [];
  const groundHits = [];

  photos.forEach(photo => {
    const telem = photo.telemetry || photo || {};
    const actual = telem.actual || {};
    const lat = telem.lat !== undefined ? telem.lat : actual.lat;
    const lon = telem.lon !== undefined ? telem.lon : actual.lon;

    let wx = telem.worldX !== undefined ? telem.worldX : (photo.x !== undefined ? photo.x : 0);
    let wz = telem.worldZ !== undefined ? telem.worldZ : (photo.z !== undefined ? photo.z : 0);

    if ((wx === 0 && wz === 0) && lat !== undefined && lon !== undefined && origin) {
      const wPos = latlonToWorld(lat, lon, origin.lat, origin.lon);
      wx = wPos.x;
      wz = wPos.z;
    }

    const wy = telem.worldY !== undefined ? telem.worldY : (telem.altAgl || telem.alt || actual.altAgl || actual.alt || photo.y || 25);
    const camPos = { x: wx, y: wy, z: wz };
    camPositions.push(camPos);

    const yaw = telem.yaw !== undefined ? telem.yaw : (telem.heading !== undefined ? telem.heading : (actual.heading || 0));
    const pitch = telem.pitch !== undefined ? telem.pitch : (telem.gimbalPitch !== undefined ? telem.gimbalPitch : (actual.gimbalPitch !== undefined ? actual.gimbalPitch : -60));
    const roll = telem.roll || 0;
    const hfov = telem.hfov || 73.7;
    const vfov = telem.vfov || 53.1;

    // Optical center ground intercept
    const centerRay = projectPixelToRay(960, 540, 1920, 1080, hfov, vfov, camPos, yaw, pitch, roll);
    const hit = intersectRayWithPlane(camPos, centerRay, groundY);
    if (hit && !isNaN(hit[0]) && !isNaN(hit[2])) {
      groundHits.push(hit);
    }
  });

  // Group ground hits into spatial clusters if multiple structures exist
  let clusters = [];
  if (groundHits.length >= 8) {
    const xs = groundHits.map(h => h[0]);
    const zs = groundHits.map(h => h[2]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minZ = Math.min(...zs), maxZ = Math.max(...zs);
    const xSpan = maxX - minX;
    const zSpan = maxZ - minZ;

    if (xSpan >= 22.0) {
      const midX = (minX + maxX) / 2.0;
      const c1 = groundHits.filter(h => h[0] < midX);
      const c2 = groundHits.filter(h => h[0] >= midX);
      if (c1.length >= 4 && c2.length >= 4) {
        clusters = [c1, c2];
      }
    } else if (zSpan >= 22.0) {
      const midZ = (minZ + maxZ) / 2.0;
      const c1 = groundHits.filter(h => h[2] < midZ);
      const c2 = groundHits.filter(h => h[2] >= midZ);
      if (c1.length >= 4 && c2.length >= 4) {
        clusters = [c1, c2];
      }
    }
  }

  if (clusters.length === 0) {
    clusters = [groundHits.length > 0 ? groundHits : (camPositions.length > 0 ? camPositions.map(c => [c.x, groundY, c.z]) : [[0, groundY, 0]])];
  }

  // Determine structural building dimensions based on flight scale
  const avgCamAlt = camPositions.length
    ? Math.max(8.0, (camPositions.reduce((sum, c) => sum + c.y, 0) / camPositions.length) - groundY)
    : 25.0;

  const wallH = (typeof options.buildingHeight === 'number')
    ? options.buildingHeight
    : Math.max(5.5, Math.min(18.0, avgCamAlt * 0.42));

  const roofH = (typeof options.roofHeight === 'number')
    ? options.roofHeight
    : Math.max(2.5, Math.min(6.5, wallH * 0.42));

  const addLine = (p1, p2) => {
    rawLines.push([
      Math.round(p1[0] * 1000) / 1000,
      Math.round(p1[1] * 1000) / 1000,
      Math.round(p1[2] * 1000) / 1000,
      Math.round(p2[0] * 1000) / 1000,
      Math.round(p2[1] * 1000) / 1000,
      Math.round(p2[2] * 1000) / 1000
    ]);
  };
  const midPt = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];

  let primaryCenter = [0, groundY, 0];

  clusters.forEach((clusterPts, cIdx) => {
    const cXs = clusterPts.map(pt => pt[0]);
    const cZs = clusterPts.map(pt => pt[2]);
    const cx = cXs.reduce((a, b) => a + b, 0) / clusterPts.length;
    const cz = cZs.reduce((a, b) => a + b, 0) / clusterPts.length;
    if (cIdx === 0) primaryCenter = [Math.round(cx * 100) / 100, Math.round(groundY * 100) / 100, Math.round(cz * 100) / 100];
    const cXSpan = Math.max(...cXs) - Math.min(...cXs);
    const cZSpan = Math.max(...cZs) - Math.min(...cZs);

    const halfW = (typeof options.buildingWidth === 'number')
      ? options.buildingWidth / 2.0
      : Math.max(5.5, Math.min(12.0, cXSpan > 4.0 ? cXSpan * 0.38 : avgCamAlt * 0.35));

    const halfD = (typeof options.buildingDepth === 'number')
      ? options.buildingDepth / 2.0
      : Math.max(5.5, Math.min(12.0, cZSpan > 4.0 ? cZSpan * 0.38 : avgCamAlt * 0.28));

    // 1. Foundation footprint corners at ground level (Y = groundY)
    const F0 = [cx - halfW, groundY, cz - halfD];
    const F1 = [cx + halfW, groundY, cz - halfD];
    const F2 = [cx + halfW, groundY, cz + halfD];
    const F3 = [cx - halfW, groundY, cz + halfD];

    // 2. Upper eaves corners (Y = groundY + wallH)
    const eavesY = groundY + wallH;
    const E0 = [cx - halfW, eavesY, cz - halfD];
    const E1 = [cx + halfW, eavesY, cz - halfD];
    const E2 = [cx + halfW, eavesY, cz + halfD];
    const E3 = [cx - halfW, eavesY, cz + halfD];

    // 3. Elevated roof ridge line (Y = groundY + wallH + roofH)
    const ridgeY = eavesY + roofH;
    const R0 = [cx - halfW * 0.85, ridgeY, cz];
    const R1 = [cx + halfW * 0.85, ridgeY, cz];

    // Base foundation perimeter
    addLine(F0, F1);
    addLine(F1, F2);
    addLine(F2, F3);
    addLine(F3, F0);

    // Vertical structural wall corner columns (Y = groundY -> eavesY)
    addLine(F0, E0);
    addLine(F1, E1);
    addLine(F2, E2);
    addLine(F3, E3);

    // Intermediate vertical facade mullions
    addLine(midPt(F0, F1), midPt(E0, E1));
    addLine(midPt(F2, F3), midPt(E2, E3));
    addLine(midPt(F0, F3), midPt(E0, E3));
    addLine(midPt(F1, F2), midPt(E1, E2));

    // Upper eaves perimeter (Y = eavesY)
    addLine(E0, E1);
    addLine(E1, E2);
    addLine(E2, E3);
    addLine(E3, E0);

    // Roof ridge line (Y = ridgeY)
    addLine(R0, R1);

    // Gable rafters connecting eaves to roof ridge
    addLine(E0, R0);
    addLine(E3, R0);
    addLine(E1, R1);
    addLine(E2, R1);

    // Mid-span roof hip rafters & ceiling tie beam
    addLine(midPt(E0, E1), midPt(R0, R1));
    addLine(midPt(E2, E3), midPt(R0, R1));
    addLine(midPt(E0, E3), midPt(E1, E2));
  });

  // Deduplicate lines
  const lines = deduplicateLines(rawLines);

  return {
    success: true,
    lines,
    count: lines.length,
    engine: 'javascript_fallback',
    assetCenter: primaryCenter,
    wallHeight: Math.round(wallH * 100) / 100,
    roofHeight: Math.round(roofH * 100) / 100,
    timestamp: new Date().toISOString()
  };
}

/**
 * Executes wireframe extraction using Python OpenCV with automatic JS fallback.
 */
function extractWireframe(payload = {}) {
  const startTime = Date.now();
  const tmpFile = path.join(os.tmpdir(), `wireframe_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);

  try {
    fs.writeFileSync(tmpFile, JSON.stringify(payload), 'utf8');

    // Run python wireframe_extractor.py
    const proc = spawnSync('python', [SCRIPT_PATH, '--input', tmpFile], {
      timeout: 60000,
      encoding: 'utf8',
      windowsHide: true
    });

    try { fs.unlinkSync(tmpFile); } catch (_) {}

    if (proc.status === 0 && proc.stdout) {
      try {
        const parsed = JSON.parse(proc.stdout.trim());
        if (parsed.success && Array.isArray(parsed.lines) && parsed.lines.length > 0) {
          parsed.executionTimeMs = Date.now() - startTime;
          parsed.engine = 'opencv_python';
          return parsed;
        }
      } catch (jsonErr) {
        // Fall through to JS fallback
      }
    }

    // Fall back to JS engine if python fails or returned error
    const fallbackRes = extractWireframeJsFallback(payload);
    fallbackRes.executionTimeMs = Date.now() - startTime;
    return fallbackRes;
  } catch (err) {
    try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch (_) {}
    const fallbackRes = extractWireframeJsFallback(payload);
    fallbackRes.executionTimeMs = Date.now() - startTime;
    fallbackRes.note = `Python execution note: ${err.message}`;
    return fallbackRes;
  }
}

/**
 * Converts wireframe lines [[x1,y1,z1, x2,y2,z2], ...] to Wavefront OBJ format.
 */
function wireframeToObj(lines = []) {
  let vCount = 1;
  let objStr = `# Aalaapi Sky 3D Architectural Wireframe\n# Generated: ${new Date().toISOString()}\n\n`;

  lines.forEach(line => {
    if (!Array.isArray(line) || line.length < 6) return;
    const [x1, y1, z1, x2, y2, z2] = line;
    objStr += `v ${x1} ${y1} ${z1}\n`;
    objStr += `v ${x2} ${y2} ${z2}\n`;
    objStr += `l ${vCount} ${vCount + 1}\n`;
    vCount += 2;
  });

  return objStr;
}

/**
 * Converts wireframe lines [[x1,y1,z1, x2,y2,z2], ...] to standard Three.js Object JSON format
 * directly importable into the official Three.js Editor (https://threejs.org/editor/).
 *
 * When flightPath, photos, or boundary are supplied, builds a complete 3D Digital Twin scene:
 * - Building_3D_Wireframe (cyan line segments with walls, eaves & roof)
 * - Drone_Flight_Trajectory (amber flight trajectory line)
 * - Camera_Photo_Frustums (emerald camera pyramid frustums showing photo capture points)
 * - Mission_Boundary (cyan coverage boundary loop)
 */
function wireframeToThreeJson(lines = [], options = {}) {
  const elevOffset = typeof options.elevationOffset === 'number' ? options.elevationOffset : 0.0;
  const isMultiObject = !!(
    options.asGroup ||
    (Array.isArray(options.flightPath) && options.flightPath.length >= 2) ||
    (Array.isArray(options.photos) && options.photos.length >= 1) ||
    (Array.isArray(options.boundary) && options.boundary.length >= 3)
  );

  const wfPositions = [];
  lines.forEach(line => {
    if (!Array.isArray(line) || line.length < 6) return;
    const [x1, y1, z1, x2, y2, z2] = line;
    wfPositions.push(
      Math.round(x1 * 1000) / 1000,
      Math.round((y1 + elevOffset) * 1000) / 1000,
      Math.round(z1 * 1000) / 1000,
      Math.round(x2 * 1000) / 1000,
      Math.round((y2 + elevOffset) * 1000) / 1000,
      Math.round(z2 * 1000) / 1000
    );
  });

  const geomWfUuid = 'geom-wireframe-' + Math.random().toString(36).slice(2, 10);
  const matWfUuid = 'mat-wireframe-' + Math.random().toString(36).slice(2, 10);
  const objWfUuid = 'obj-wireframe-' + Math.random().toString(36).slice(2, 10);

  const geometries = [
    {
      uuid: geomWfUuid,
      type: "BufferGeometry",
      data: {
        attributes: {
          position: {
            itemSize: 3,
            type: "Float32Array",
            array: wfPositions,
            normalized: false
          }
        }
      }
    }
  ];

  const materials = [
    {
      uuid: matWfUuid,
      type: "LineBasicMaterial",
      color: 3718648, // 0x38bdf8 cyan
      linewidth: 2,
      opacity: 0.95,
      transparent: true
    }
  ];

  if (!isMultiObject) {
    return {
      metadata: {
        version: 4.5,
        type: "Object",
        generator: "Aalaapi-Sky Wireframe Engine",
        source: "threejs.org compatible"
      },
      geometries,
      materials,
      object: {
        uuid: objWfUuid,
        type: "LineSegments",
        name: "Aalaapi_Architectural_Wireframe",
        layers: 1,
        matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
        geometry: geomWfUuid,
        material: matWfUuid
      }
    };
  }

  // Multi-object Digital Twin Scene Graph
  const children = [
    {
      uuid: objWfUuid,
      type: "LineSegments",
      name: "Building_3D_Wireframe",
      layers: 1,
      matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      geometry: geomWfUuid,
      material: matWfUuid
    }
  ];

  // 1. Drone Flight Trajectory Line
  if (Array.isArray(options.flightPath) && options.flightPath.length >= 2) {
    const trajPositions = [];
    options.flightPath.forEach(pt => {
      const px = Array.isArray(pt) ? pt[0] : (pt.x || 0);
      const py = Array.isArray(pt) ? pt[1] : (pt.y || 0);
      const pz = Array.isArray(pt) ? pt[2] : (pt.z || 0);
      trajPositions.push(
        Math.round(px * 1000) / 1000,
        Math.round((py + elevOffset) * 1000) / 1000,
        Math.round(pz * 1000) / 1000
      );
    });

    const geomTrajUuid = 'geom-traj-' + Math.random().toString(36).slice(2, 10);
    const matTrajUuid = 'mat-traj-' + Math.random().toString(36).slice(2, 10);
    const objTrajUuid = 'obj-traj-' + Math.random().toString(36).slice(2, 10);

    geometries.push({
      uuid: geomTrajUuid,
      type: "BufferGeometry",
      data: {
        attributes: {
          position: {
            itemSize: 3,
            type: "Float32Array",
            array: trajPositions,
            normalized: false
          }
        }
      }
    });

    materials.push({
      uuid: matTrajUuid,
      type: "LineBasicMaterial",
      color: 1610507, // 0xf59e0b vibrant amber
      linewidth: 3,
      opacity: 0.95,
      transparent: true
    });

    children.push({
      uuid: objTrajUuid,
      type: "Line",
      name: "Drone_Flight_Trajectory",
      layers: 1,
      matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      geometry: geomTrajUuid,
      material: matTrajUuid
    });
  }

  // 2. Camera Photo Frustums (pyramids pointing down at structure)
  if (Array.isArray(options.photos) && options.photos.length >= 1) {
    const frustumPositions = [];
    options.photos.forEach(photo => {
      const segs = buildFrustumSegments(photo, options.frustumDistance || 3.0);
      frustumPositions.push(...segs);
    });

    if (frustumPositions.length > 0) {
      const geomFrustUuid = 'geom-frust-' + Math.random().toString(36).slice(2, 10);
      const matFrustUuid = 'mat-frust-' + Math.random().toString(36).slice(2, 10);
      const objFrustUuid = 'obj-frust-' + Math.random().toString(36).slice(2, 10);

      geometries.push({
        uuid: geomFrustUuid,
        type: "BufferGeometry",
        data: {
          attributes: {
            position: {
              itemSize: 3,
              type: "Float32Array",
              array: frustumPositions,
              normalized: false
            }
          }
        }
      });

      materials.push({
        uuid: matFrustUuid,
        type: "LineBasicMaterial",
        color: 1096065, // 0x10b981 emerald green
        linewidth: 1.5,
        opacity: 0.85,
        transparent: true
      });

      children.push({
        uuid: objFrustUuid,
        type: "LineSegments",
        name: "Camera_Photo_Frustums",
        layers: 1,
        matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
        geometry: geomFrustUuid,
        material: matFrustUuid
      });
    }
  }

  // 3. Mission Boundary Loop
  if (Array.isArray(options.boundary) && options.boundary.length >= 3) {
    const bndPositions = [];
    const bndPts = [...options.boundary, options.boundary[0]]; // Closed loop
    bndPts.forEach(pt => {
      const px = Array.isArray(pt) ? pt[0] : (pt.x || 0);
      const py = Array.isArray(pt) ? pt[1] : (pt.y || 0.15);
      const pz = Array.isArray(pt) ? pt[2] : (pt.z || 0);
      bndPositions.push(
        Math.round(px * 1000) / 1000,
        Math.round((py + elevOffset) * 1000) / 1000,
        Math.round(pz * 1000) / 1000
      );
    });

    const geomBndUuid = 'geom-bnd-' + Math.random().toString(36).slice(2, 10);
    const matBndUuid = 'mat-bnd-' + Math.random().toString(36).slice(2, 10);
    const objBndUuid = 'obj-bnd-' + Math.random().toString(36).slice(2, 10);

    geometries.push({
      uuid: geomBndUuid,
      type: "BufferGeometry",
      data: {
        attributes: {
          position: {
            itemSize: 3,
            type: "Float32Array",
            array: bndPositions,
            normalized: false
          }
        }
      }
    });

    materials.push({
      uuid: matBndUuid,
      type: "LineBasicMaterial",
      color: 440020, // 0x06b6d4 teal/cyan
      linewidth: 2,
      opacity: 0.9,
      transparent: true
    });

    children.push({
      uuid: objBndUuid,
      type: "Line",
      name: "Mission_Boundary",
      layers: 1,
      matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      geometry: geomBndUuid,
      material: matBndUuid
    });
  }

  const groupUuid = 'group-digital-twin-' + Math.random().toString(36).slice(2, 10);

  return {
    metadata: {
      version: 4.5,
      type: "Object",
      generator: "Aalaapi-Sky Digital Twin Engine",
      source: "threejs.org compatible"
    },
    geometries,
    materials,
    object: {
      uuid: groupUuid,
      type: "Group",
      name: "Aalaapi_Inspection_Digital_Twin",
      layers: 1,
      matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      children
    }
  };
}

/**
 * Computes 2D Convex Hull of ground vertices for boundary polygon conversion.
 */
function computeConvexHull2D(pts) {
  if (pts.length <= 3) return pts;

  const sorted = [...pts].sort((a, b) => a.x === b.x ? a.z - b.z : a.x - b.x);

  const cross = (o, a, b) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);

  const lower = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  const upper = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

module.exports = {
  latlonToWorld,
  projectPixelToRay,
  intersectRayWithPlane,
  extractWireframe,
  extractWireframeJsFallback,
  wireframeToObj,
  wireframeToThreeJson,
  computeConvexHull2D,
  deduplicateLines,
  buildFrustumSegments
};
