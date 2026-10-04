function projectGeoPointToPixel(geoPoint, cameraPose, options = {}) {
  if (!geoPoint || !cameraPose || typeof geoPoint.lat !== 'number' || typeof geoPoint.lon !== 'number') {
    return { u: 0.5, v: 0.5, opticalDepthMeters: 0, isInFront: false, isInsideFrame: false };
  }

  const camLat = typeof cameraPose.lat === 'number' ? cameraPose.lat : 0;
  const camLon = typeof cameraPose.lon === 'number' ? cameraPose.lon : 0;
  const camAlt = (typeof cameraPose.altAgl === 'number' && cameraPose.altAgl > 0) ? cameraPose.altAgl : ((typeof cameraPose.alt === 'number') ? cameraPose.alt : 25.0);
  const pitchDeg = typeof cameraPose.gimbalPitch === 'number' ? cameraPose.gimbalPitch : -90.0;
  const yawDeg = typeof cameraPose.heading === 'number' ? cameraPose.heading : 0.0;

  const targetH = typeof options.targetHeightMeters === 'number' ? options.targetHeightMeters : 0.0;
  const ptAlt = typeof geoPoint.alt === 'number' ? geoPoint.alt : targetH;

  // 1. Geodetic to local East-North-Up (ENU)
  const latRad = (camLat * Math.PI) / 180.0;
  const dLatRad = ((geoPoint.lat - camLat) * Math.PI) / 180.0;
  const dLonRad = ((geoPoint.lon - camLon) * Math.PI) / 180.0;
  const R = 6378137.0; // WGS84 Earth radius in meters

  const dN = dLatRad * R;
  const dE = dLonRad * R * Math.cos(latRad);
  const dU = ptAlt - camAlt;

  // 2. Rotate by Camera Heading / Yaw (psi) around Up axis
  const psi = (yawDeg * Math.PI) / 180.0;
  const Xh = dE * Math.cos(psi) - dN * Math.sin(psi);
  const Yh = dE * Math.sin(psi) + dN * Math.cos(psi);
  const Zh = dU;

  // 3. Rotate by Camera Gimbal Pitch (theta) around Transverse axis
  const theta = (pitchDeg * Math.PI) / 180.0;
  const cosTheta = Math.cos(theta);
  const sinTheta = Math.sin(theta);

  const Xcam = Xh;
  const Ycam = Yh * cosTheta + Zh * sinTheta; // Optical depth in front of lens
  const Zcam = -Yh * sinTheta + Zh * cosTheta; // Vertical in camera sensor frame

  const sW = parseFloat(options.sensorWidthMm) || 9.6;
  const fL = parseFloat(options.focalLengthMm) || 6.72;
  const aspect = options.aspectRatio || (options.imageWidth && options.imageHeight ? options.imageWidth / options.imageHeight : (4 / 3));
  const sH = sW / aspect;

  const tanHalfH = sW / (2.0 * fL);
  const tanHalfV = sH / (2.0 * fL);

  const isInFront = Ycam > 0.05;
  if (!isInFront) {
    return {
      u: 0.5,
      v: 0.5,
      opticalDepthMeters: Math.round(Ycam * 100) / 100,
      isInFront: false,
      isInsideFrame: false,
      xCam: Math.round(Xcam * 100) / 100,
      yCam: Math.round(Ycam * 100) / 100,
      zCam: Math.round(Zcam * 100) / 100
    };
  }

  const u = 0.5 + (Xcam / (2.0 * Ycam * tanHalfH));
  const v = 0.5 - (Zcam / (2.0 * Ycam * tanHalfV));
  const isInsideFrame = (u >= 0.0 && u <= 1.0 && v >= 0.0 && v <= 1.0);

  return {
    u: Math.round(u * 10000) / 10000,
    v: Math.round(v * 10000) / 10000,
    opticalDepthMeters: Math.round(Ycam * 100) / 100,
    isInFront: true,
    isInsideFrame,
    xCam: Math.round(Xcam * 100) / 100,
    yCam: Math.round(Ycam * 100) / 100,
    zCam: Math.round(Zcam * 100) / 100
  };
}

/**
 * Projects a geographic polygon (array of lat/lon vertices) onto photo coordinates.
 */
function projectGeoPolygonToPhoto(geoPolygon, cameraPose, options = {}) {
  if (!Array.isArray(geoPolygon) || geoPolygon.length < 2 || !cameraPose) {
    return { points: [], hasVisiblePoints: false, hasPointsInFront: false, rawPolygon: geoPolygon || [] };
  }

  const points = geoPolygon.map((pt, idx) => {
    const proj = projectGeoPointToPixel(pt, cameraPose, options);
    return {
      vertexIndex: idx,
      lat: pt.lat,
      lon: pt.lon,
      u: proj.u,
      v: proj.v,
      opticalDepthMeters: proj.opticalDepthMeters,
      isInFront: proj.isInFront,
      isInsideFrame: proj.isInsideFrame
    };
  });

  const hasVisiblePoints = points.some(p => p.isInsideFrame);
  const hasPointsInFront = points.some(p => p.isInFront);

  return {
    points,
    hasVisiblePoints,
    hasPointsInFront,
    rawPolygon: geoPolygon
  };
}

/**
 * Computes the 2D convex hull of an array of geographic points ({lat, lon}) using monotone chain algorithm.
 * Returns an ordered array of polygon vertices forming the exterior boundary.
 * @param {Array<{lat: number, lon: number}>} points
 * @returns {Array<{lat: number, lon: number}>}
 */
function computeConvexHullGeo(points) {
  if (!Array.isArray(points) || points.length < 3) return points || [];
  const pts = points.map(p => ({ lat: p.lat, lon: p.lon })).filter(p => typeof p.lat === 'number' && typeof p.lon === 'number');
  if (pts.length < 3) return pts;
  pts.sort((a, b) => a.lon === b.lon ? a.lat - b.lat : a.lon - b.lon);
  function cross(o, a, b) {
    return (a.lon - o.lon) * (b.lat - o.lat) - (a.lat - o.lat) * (b.lon - o.lon);
  }
  const lower = [];
  for (let i = 0; i < pts.length; i++) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pts[i]) <= 0) {
      lower.pop();
    }
    lower.push(pts[i]);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pts[i]) <= 0) {
      upper.pop();
    }
    upper.push(pts[i]);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/**
 * Extracts or derives the geographic boundary polygon for a flight layer.
 */
function getLayerBoundaryGeoPolygon(layer) {
  if (!layer) return [];
  if (Array.isArray(layer.boundaryPolygon) && layer.boundaryPolygon.length >= 3) {
    return layer.boundaryPolygon;
  }
  if (layer.pattern === 'target-splat' && Array.isArray(layer.targetPoly) && layer.targetPoly.length >= 3) {
    return layer.targetPoly;
  }
  if (Array.isArray(layer.polygonVertices) && layer.polygonVertices.length >= 3) {
    return layer.polygonVertices;
  }
  if (Array.isArray(layer.freeformWaypoints) && layer.freeformWaypoints.length >= 3) {
    return layer.freeformWaypoints;
  }
  if (Array.isArray(layer.waypoints) && layer.waypoints.length >= 3) {
    return computeConvexHullGeo(layer.waypoints);
  }

  // Default survey / grid bounding box
  const cLat = typeof layer.centerLat === 'number' ? layer.centerLat : (typeof activeCenterLat === 'number' ? activeCenterLat : 0);
  const cLon = typeof layer.centerLon === 'number' ? layer.centerLon : (typeof activeCenterLon === 'number' ? activeCenterLon : 0);
  const w = typeof layer.gridWidth === 'number' ? layer.gridWidth : (typeof gridWidth === 'number' ? gridWidth : 100);
  const h = typeof layer.gridHeight === 'number' ? layer.gridHeight : (typeof gridHeight === 'number' ? gridHeight : 100);
  const rot = typeof layer.gridRotation === 'number' ? layer.gridRotation : (typeof rotationDeg === 'number' ? rotationDeg : 0);

  const isOrbitalOrRadial = (
    layer.pattern === 'orbit' ||
    layer.pattern === 'multi-orbit' ||
    layer.pattern === 'tower' ||
    layer.pattern === 'grid-orbit-combo' ||
    layer.pattern === 'grid-multi-orbit-combo' ||
    (layer.pattern === 'target-splat' && (!Array.isArray(layer.targetPoly) || layer.targetPoly.length < 3))
  );

  const radiusMeters = layer.orbitRadius || layer.targetRadius || layer.towerRadius || 25;
  if (isOrbitalOrRadial && (cLat !== 0 || cLon !== 0) && typeof localToGeodetic === 'function') {
    const circlePoints = [];
    const numPoints = 36;
    for (let i = 0; i < numPoints; i++) {
      const angle = (i / numPoints) * 2 * Math.PI;
      const x = radiusMeters * Math.cos(angle);
      const y = radiusMeters * Math.sin(angle);
      circlePoints.push(localToGeodetic(x, y, cLat, cLon, 0));
    }
    return circlePoints;
  }

  if ((cLat !== 0 || cLon !== 0) && typeof localToGeodetic === 'function') {
    const halfW = w / 2.0;
    const halfH = h / 2.0;
    return [
      localToGeodetic(-halfW, halfH, cLat, cLon, rot),  // TL
      localToGeodetic(halfW, halfH, cLat, cLon, rot),   // TR
      localToGeodetic(halfW, -halfH, cLat, cLon, rot),  // BR
      localToGeodetic(-halfW, -halfH, cLat, cLon, rot)  // BL
    ];
  }
  return [];
}


/**
 * Extracts embedded DJI XMP flight telemetry (GPS, altitude, gimbal pitch/yaw, aircraft model)
 * from a JPEG ArrayBuffer, Uint8Array, Buffer, or text string.
 * @param {ArrayBuffer|Uint8Array|Buffer|string} data
 * @returns {object|null}
 */
function extractDjiXmpMetadata(data) {
  if (!data) return null;
  let xmpStr = '';
  if (typeof data === 'string') {
    const s = data.indexOf('<x:xmpmeta');
    const e = data.indexOf('</x:xmpmeta>');
    if (s !== -1 && e !== -1) xmpStr = data.substring(s, e + 12);
  } else if (typeof Buffer !== 'undefined' && Buffer.isBuffer(data)) {
    const s = data.indexOf('<x:xmpmeta', 0, 'utf8');
    const e = data.indexOf('</x:xmpmeta>', s, 'utf8');
    if (s !== -1 && e !== -1) xmpStr = data.subarray(s, e + 12).toString('utf8');
  } else if (data instanceof Uint8Array || data instanceof ArrayBuffer) {
    const u8 = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
    const searchLimit = Math.min(u8.length, 524288);
    const headerStr = new TextDecoder('utf-8', { fatal: false }).decode(u8.subarray(0, searchLimit));
    const s = headerStr.indexOf('<x:xmpmeta');
    const e = headerStr.indexOf('</x:xmpmeta>');
    if (s !== -1 && e !== -1) xmpStr = headerStr.substring(s, e + 12);
  }

  if (!xmpStr) return null;
  const result = {};
  const getAttr = (name) => {
    const attrRegex = new RegExp(`drone-dji:${name}="([^"]+)"`, 'i');
    const elemRegex = new RegExp(`<drone-dji:${name}>([^<]+)</drone-dji:${name}>`, 'i');
    const m = xmpStr.match(attrRegex) || xmpStr.match(elemRegex);
    return m ? m[1].trim() : null;
  };

  const latStr = getAttr('GpsLatitude');
  const lonStr = getAttr('GpsLongitude');
  const relAltStr = getAttr('RelativeAltitude');
  const absAltStr = getAttr('AbsoluteAltitude');
  const gimbalPitchStr = getAttr('GimbalPitchDegree');
  const gimbalYawStr = getAttr('GimbalYawDegree');
  const flightPitchStr = getAttr('FlightPitchDegree');
  const flightYawStr = getAttr('FlightYawDegree');
  const flightRollStr = getAttr('FlightRollDegree');
  const modelStr = getAttr('ProductName');

  if (latStr !== null && !isNaN(parseFloat(latStr))) result.lat = parseFloat(latStr);
  if (lonStr !== null && !isNaN(parseFloat(lonStr))) result.lon = parseFloat(lonStr);
  if (relAltStr !== null && !isNaN(parseFloat(relAltStr))) {
    result.altAgl = parseFloat(relAltStr);
    result.alt = result.altAgl;
  }
  if (absAltStr !== null && !isNaN(parseFloat(absAltStr))) result.altMsl = parseFloat(absAltStr);
  if (gimbalPitchStr !== null && !isNaN(parseFloat(gimbalPitchStr))) result.gimbalPitch = parseFloat(gimbalPitchStr);
  if (gimbalYawStr !== null && !isNaN(parseFloat(gimbalYawStr))) result.heading = parseFloat(gimbalYawStr);
  if (flightPitchStr !== null && !isNaN(parseFloat(flightPitchStr))) result.flightPitch = parseFloat(flightPitchStr);
  if (flightYawStr !== null && !isNaN(parseFloat(flightYawStr))) result.flightYaw = parseFloat(flightYawStr);
  if (flightRollStr !== null && !isNaN(parseFloat(flightRollStr))) result.flightRoll = parseFloat(flightRollStr);
  if (modelStr) result.droneModel = modelStr;

  return Object.keys(result).length > 0 ? result : null;
}

// =============================================================================
// Optical Tag Detector (AprilTag & ArUco) WebAssembly/JS Engine (v1.114.0)
// =============================================================================

/**
 * Aalaapi Sky — Optical Tag Detector (AprilTag & ArUco)
 * 
 * High-performance, lazy-loaded computer vision detection engine for:
 * - AprilTag 25h9 (tag25h9, 35 codes, Hamming 9)
 * - AprilTag 36h11 (tag36h11, 50 codes, Hamming 11)
 * - AprilTag 16h5 (tag16h5, 30 codes, Hamming 5)
 * - ArUco 4x4 (DICT_4X4_50, 50 codes)
 * - ArUco 5x5 (DICT_5X5_100, 50 codes)
 * 
 * Compatible with both Browser (HTML5 Canvas ImageData) and Node.js.
 */

