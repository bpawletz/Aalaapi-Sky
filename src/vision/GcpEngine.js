const ARUCO_4X4_50_DATA = [
  [181, 50], [15, 154], [51, 45], [153, 70], [84, 158], [121, 205], [158, 46], [196, 242],
  [254, 218], [207, 86], [249, 145], [17, 167], [14, 183], [42, 15], [36, 177], [38, 62],
  [70, 101], [102, 0], [108, 94], [118, 175], [134, 139], [176, 43], [204, 213], [221, 130],
  [254, 71], [148, 113], [172, 228], [165, 84], [33, 35], [52, 111], [68, 21], [87, 178],
  [158, 207], [240, 203], [8, 174], [9, 41], [24, 117], [4, 255], [13, 246], [28, 90],
  [23, 24], [42, 40], [50, 140], [56, 178], [36, 232], [46, 235], [45, 63], [75, 100],
  [80, 46], [80, 19]
];

/**
 * Predefined dictionary data for Classic ArUco 5x5 (first 50 markers from OpenCV DICT_ARUCO_BYTES)
 * Each tuple represents 4 bytes (25 bits, 5x5 grid in row-major order).
 */
const ARUCO_5X5_DATA = [
  [132, 33, 8, 0], [132, 33, 11, 1], [132, 33, 4, 1], [132, 33, 7, 0],
  [132, 33, 120, 0], [132, 33, 123, 1], [132, 33, 116, 1], [132, 33, 119, 0],
  [132, 32, 152, 0], [132, 32, 155, 1], [132, 32, 148, 1], [132, 32, 151, 0],
  [132, 32, 232, 0], [132, 32, 235, 1], [132, 32, 228, 1], [132, 32, 231, 0],
  [132, 47, 8, 0], [132, 47, 11, 1], [132, 47, 4, 1], [132, 47, 7, 0],
  [132, 47, 120, 0], [132, 47, 123, 1], [132, 47, 116, 1], [132, 47, 119, 0],
  [132, 46, 152, 0], [132, 46, 155, 1], [132, 46, 148, 1], [132, 46, 151, 0],
  [132, 46, 232, 0], [132, 46, 235, 1], [132, 46, 228, 1], [132, 46, 231, 0],
  [132, 37, 8, 0], [132, 37, 11, 1], [132, 37, 4, 1], [132, 37, 7, 0],
  [132, 37, 120, 0], [132, 37, 123, 1], [132, 37, 116, 1], [132, 37, 119, 0],
  [132, 36, 152, 0], [132, 36, 155, 1], [132, 36, 148, 1], [132, 36, 151, 0],
  [132, 36, 232, 0], [132, 36, 235, 1], [132, 36, 228, 1], [132, 36, 231, 0],
  [132, 43, 8, 0], [132, 43, 11, 1]
];

/**
 * Predefined dictionary data for AprilTag 16h5 (OpenCV DICT_APRILTAG_16h5_BYTES / AprilRobotics)
 */
const APRILTAG_16H5_DATA = [
  [216, 196], [165, 116], [86, 44], [157, 162], [101, 158], [214, 254], [26, 205], [233, 49],
  [83, 193], [146, 85], [178, 163], [75, 41], [171, 91], [106, 219], [43, 151], [53, 107],
  [203, 101], [109, 137], [182, 73], [115, 23]
];

/**
 * Official AprilRobotics AprilTag 25h9 Dictionary (35 unique IDs 0–34)
 * 5x5 data payload with Hamming distance 9 in a 7x7 black frame (9x9 canvas).
 */
const APRILTAG_25H9_CODES = [
  0x0156f1f4, 0x01f28cd5, 0x016ce32c, 0x01ea379c, 0x01390f89,
  0x0034fad0, 0x007dcdb5, 0x0119ba95, 0x01ae9daa, 0x00df02aa,
  0x0082fc15, 0x00465123, 0x00ceee98, 0x01f17260, 0x014429cd,
  0x017248a8, 0x016ad452, 0x009670ad, 0x016f65b2, 0x00b8322b,
  0x005d715b, 0x01a1c7e7, 0x00d7890d, 0x01813522, 0x01c9c611,
  0x0099e4a4, 0x00855234, 0x017b81c0, 0x00c294bb, 0x0089fae3,
  0x0044df5f, 0x01360159, 0x00ec31e8, 0x01bcc0f6, 0x00a64f8d
];
const APRILTAG_25H9_BIT_X = [1,2,3,4,2,3,5,5,5,5,4,4,5,4,3,2,4,3,1,1,1,1,2,2,3];
const APRILTAG_25H9_BIT_Y = [1,1,1,1,2,2,1,2,3,4,2,3,5,5,5,5,4,4,5,4,3,2,4,3,3];

/**
 * Official AprilRobotics AprilTag 36h11 Dictionary (first 50 IDs 0–49)
 * 6x6 data payload with Hamming distance 11 in an 8x8 black frame (10x10 canvas).
 */
const APRILTAG_36H11_CODES = [
  0x0dc4a1c821n, 0x0e17b470e9n, 0x0ef91d01b1n, 0x0f429cdd73n, 0x005da29225n,
  0x01106cba43n, 0x0223bed79dn, 0x021f51213cn, 0x033eb19ca6n, 0x03f76eb0f8n,
  0x0469a97414n, 0x045dcfe0b0n, 0x04a6465f72n, 0x051801db96n, 0x05eb946b4en,
  0x068a7cc2ecn, 0x06f0ba2652n, 0x078765559dn, 0x087b83d129n, 0x086cc4a5c5n,
  0x08b64df90fn, 0x09c577b611n, 0x0a3810f2f5n, 0x0af4d75b83n, 0x0b59a03fefn,
  0x0bb1096f85n, 0x0d1b92fc76n, 0x0d0dd509d2n, 0x0e2cfda160n, 0x02ff497c63n,
  0x047240671bn, 0x05047a2e55n, 0x0635ca87c7n, 0x0691254166n, 0x068f43d94an,
  0x06ef24bdb6n, 0x08cdd8f886n, 0x09de96b718n, 0x0aff6e5a8an, 0x0bae46f029n,
  0x0d9c490e6cn, 0x0e8d08594dn, 0x0e97be6f54n, 0x0fb0a3a41fn, 0x0059f1d08an,
  0x011f8e13f9n, 0x01b0b69bc8n, 0x01be486a41n, 0x027cfc1f7fn, 0x02613d943en
];
const APRILTAG_36H11_BIT_X = [1,2,3,4,5,2,3,4,3,6,6,6,6,6,5,5,5,4,6,5,4,3,2,4,4,4,3,1,1,1,1,1,2,2,2,3];
const APRILTAG_36H11_BIT_Y = [1,1,1,1,1,2,2,2,3,1,2,3,4,5,2,3,4,3,6,6,6,6,6,5,4,3,4,6,5,4,3,2,5,4,3,4];

/**
 * Official AprilRobotics AprilTag 16h5 Dictionary (30 unique IDs 0–29)
 * 4x4 data payload with Hamming distance 5 in a 6x6 black frame (8x8 canvas).
 */
const APRILTAG_16H5_CODES = [
  0xd6c4, 0xa574, 0x562c, 0x9da2, 0x659e, 0xd6fe, 0x1acd, 0xe931,
  0x53c1, 0x9255, 0xb2a3, 0x4b29, 0xab5b, 0x6adb, 0x2b97, 0x356b,
  0xcb65, 0x6d89, 0xb649, 0x7317, 0x550d, 0x44d8, 0x6c96, 0x9376,
  0x3e18, 0x5825, 0x3a77, 0x7770, 0x23ac, 0xac60
];
const APRILTAG_16H5_BIT_X = [1,2,3,2,4,4,4,3,4,3,2,3,1,1,1,2];
const APRILTAG_16H5_BIT_Y = [1,1,1,2,1,2,3,2,4,4,4,3,4,3,2,3];

/**
 * Adds a new fiducial marker / GCP to the active layer.
 */
function addFiducialMarkerPoint(lat, lng, layerOrOptions = {}, maybeOptions = {}) {
  let targetLayer = null;
  let options = {};
  if (layerOrOptions && typeof layerOrOptions === 'object' && ('fiducialMarkers' in layerOrOptions || 'isDrawingLayer' in layerOrOptions || 'id' in layerOrOptions)) {
    targetLayer = layerOrOptions;
    options = maybeOptions || {};
  } else {
    options = layerOrOptions || {};
  }

  const activeLayer = targetLayer || ((typeof getActiveLayer === 'function') ? getActiveLayer() : null);
  if (!activeLayer) return null;

  if (!Array.isArray(activeLayer.fiducialMarkers)) {
    activeLayer.fiducialMarkers = [];
  }

  const idx = activeLayer.fiducialMarkers.length;
  const role = options.role || activeLayer.defaultTargetRole || 'gcp';
  const type = options.type || activeLayer.defaultTargetType || 'aruco_4x4';
  const prefix = role === 'checkpoint' ? 'CHK' : (role === 'scale_bar' ? 'SCL' : (role === 'anchor' ? 'ANC' : 'GCP'));
  const code = options.code || `${prefix}-${String(idx + 1).padStart(2, '0')}`;
  const size = (typeof options.physicalSizeMeters === 'number' && options.physicalSizeMeters > 0)
    ? options.physicalSizeMeters
    : (parseFloat(activeLayer.defaultPhysicalSize) || 0.50);
  const alt = (typeof options.alt === 'number') ? options.alt : (parseFloat(activeLayer.altitude) || 0.0);
  const color = options.color || activeLayer.markerColor || '#f59e0b';

  const marker = {
    id: options.id || `gcp-${Date.now()}-${idx + 1}-${Math.floor(Math.random() * 1000)}`,
    code,
    role,
    type,
    markerId: typeof options.markerId === 'number' ? options.markerId : idx,
    lat,
    lon: lng,
    alt,
    physicalSizeMeters: size,
    color,
    notes: options.notes || ''
  };

  activeLayer.fiducialMarkers.push(marker);
  updateGrid();
  renderFiducialMarkersTable(activeLayer);
  return marker;
}

/**
 * Deletes a fiducial marker by ID from a layer.
 */
function deleteFiducialMarker(layerId, markerId) {
  const allLayers = (typeof flightLayers !== 'undefined' && Array.isArray(flightLayers)) ? flightLayers : [];
  const layer = allLayers.find(l => l.id === layerId) || ((typeof getActiveLayer === 'function') ? getActiveLayer() : null);
  if (!layer || !Array.isArray(layer.fiducialMarkers)) return;

  layer.fiducialMarkers = layer.fiducialMarkers.filter(m => m.id !== markerId);
  updateGrid();
  renderFiducialMarkersTable(layer);
}

/**
 * Updates properties of a fiducial marker.
 */
function updateFiducialMarker(layerId, markerId, updates = {}) {
  const allLayers = (typeof flightLayers !== 'undefined' && Array.isArray(flightLayers)) ? flightLayers : [];
  const layer = allLayers.find(l => l.id === layerId) || ((typeof getActiveLayer === 'function') ? getActiveLayer() : null);
  if (!layer || !Array.isArray(layer.fiducialMarkers)) return;

  const marker = layer.fiducialMarkers.find(m => m.id === markerId);
  if (marker) {
    Object.assign(marker, updates);
    updateGrid();
    renderFiducialMarkersTable(layer);
  }
}

/**
 * Clears all fiducial markers for the active layer.
 */
function clearFiducialMarkers() {
  const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
  if (!activeLayer) return;
  activeLayer.fiducialMarkers = [];
  updateGrid();
  renderFiducialMarkersTable(activeLayer);
}

/**
 * Resolves the adjacent and mission flight altitudes for a given fiducial layer.
 */
function getSurroundingFlightAltitudes(layerId) {
  const globalAltEl = typeof document !== 'undefined' ? document.getElementById('altitude') : null;
  const globalAlt = globalAltEl ? (parseFloat(globalAltEl.value) || 50) : 50;

  const layers = (typeof flightLayers !== 'undefined' && Array.isArray(flightLayers))
    ? flightLayers
    : ((typeof global !== 'undefined' && Array.isArray(global.flightLayers)) ? global.flightLayers : []);

  if (!layers || layers.length === 0) {
    return {
      prevAltitude: null,
      nextAltitude: null,
      maxAltitude: globalAlt,
      minAltitude: globalAlt,
      primaryAltitude: globalAlt,
      prevLayerName: null,
      nextLayerName: null
    };
  }

  const idx = layers.findIndex(l => l.id === layerId);
  const targetIdx = idx !== -1 ? idx : 0;

  let prevLayer = null;
  for (let i = targetIdx - 1; i >= 0; i--) {
    const l = layers[i];
    if (l && l.enabled && !l.isDrawingLayer && !l.isFiducialLayer && !l.isExclusionZone) {
      prevLayer = l;
      break;
    }
  }

  let nextLayer = null;
  for (let i = targetIdx + 1; i < layers.length; i++) {
    const l = layers[i];
    if (l && l.enabled && !l.isDrawingLayer && !l.isFiducialLayer && !l.isExclusionZone) {
      nextLayer = l;
      break;
    }
  }

  const flightAlts = [];
  layers.forEach(l => {
    if (l && l.enabled && !l.isDrawingLayer && !l.isFiducialLayer && !l.isExclusionZone) {
      const alt = parseFloat(l.altitude);
      if (!isNaN(alt) && alt > 0) flightAlts.push(alt);
    }
  });

  const maxAlt = flightAlts.length > 0 ? Math.max(...flightAlts) : globalAlt;
  const minAlt = flightAlts.length > 0 ? Math.min(...flightAlts) : globalAlt;
  const primaryAlt = maxAlt;

  return {
    prevAltitude: prevLayer ? (parseFloat(prevLayer.altitude) || globalAlt) : null,
    nextAltitude: nextLayer ? (parseFloat(nextLayer.altitude) || globalAlt) : null,
    prevLayerName: prevLayer ? prevLayer.name : null,
    nextLayerName: nextLayer ? nextLayer.name : null,
    maxAltitude: maxAlt,
    minAltitude: minAlt,
    primaryAltitude: primaryAlt
  };
}

/**
 * Calculates photogrammetric GSD, aerial pixel span, max detection slant distance,
 * and ground detection radius for a fiducial marker at a given flight altitude.
 */
function calculateFiducialResolution(targetSizeMeters, altitudeMeters, cameraSpecs = {}) {
  const sW = parseFloat(cameraSpecs.sensorWidthMm) || 9.6;
  const fL = parseFloat(cameraSpecs.focalLengthMm) || 6.72;
  const imgW = parseFloat(cameraSpecs.imageWidthPx) || 4032;
  const alt = Math.max(1, parseFloat(altitudeMeters) || 50);
  const size = Math.max(0.05, parseFloat(targetSizeMeters) || 0.20);

  // GSD in cm/pixel: (sensorWidth_mm * alt_m * 100) / (focalLength_mm * imgW_px)
  const gsdCmPerPx = (sW * alt * 100.0) / (fL * imgW);
  const gsdMetersPerPx = gsdCmPerPx / 100.0;

  // Pixel span across target edge in photo: size_meters / gsd_meters
  const pixelSpan = size / gsdMetersPerPx;

  // Maximum direct slant distance where target spans >= 10 px
  // 10 = (size * fL * imgW) / (sW * D_max) => D_max = (size * fL * imgW) / (sW * 10)
  const maxSlantDistanceMeters = (size * fL * imgW) / (sW * 10.0);

  // Ground detection radius at flight altitude alt
  // R_ground^2 + alt^2 = D_max^2 => R_ground = sqrt(D_max^2 - alt^2)
  let groundDetectionRadiusMeters = 0;
  if (maxSlantDistanceMeters > alt) {
    groundDetectionRadiusMeters = Math.sqrt(Math.pow(maxSlantDistanceMeters, 2) - Math.pow(alt, 2));
  }

  // Recommended target size for altitude:
  // Survey standard requires 12-15 px across tag. Using 14 px:
  const recSizeMeters = Math.round((14.0 * gsdMetersPerPx) * 20) / 20; // round to nearest 0.05m
  const recommendedSizeMeters = Math.max(0.20, recSizeMeters);

  let status = 'optimal';
  if (pixelSpan < 10.0) {
    status = 'undersized';
  } else if (pixelSpan < 14.0) {
    status = 'marginal';
  }

  return {
    altitudeMeters: alt,
    targetSizeMeters: size,
    gsdCmPerPx: Math.round(gsdCmPerPx * 100) / 100,
    pixelSpan: Math.round(pixelSpan * 10) / 10,
    maxSlantDistanceMeters: Math.round(maxSlantDistanceMeters * 10) / 10,
    groundDetectionRadiusMeters: Math.round(groundDetectionRadiusMeters * 10) / 10,
    recommendedSizeMeters,
    status
  };
}

/**
 * Updates the live Altitude Sizing Advisor card inside Section 2 Card 6.
 */
function updateFiducialAltitudeAdvisor(layer) {
  if (typeof document === 'undefined') return;
  const activeLayer = layer || (typeof getActiveLayer === 'function' ? getActiveLayer() : null);
  if (!activeLayer) return;

  const altContext = getSurroundingFlightAltitudes(activeLayer.id);
  const sizeSelect = document.getElementById('fiducial-default-size');
  const targetSize = sizeSelect ? (parseFloat(sizeSelect.value) || 0.20) : (activeLayer.defaultPhysicalSize || 0.20);

  const metrics = calculateFiducialResolution(targetSize, altContext.primaryAltitude);

  const altBadge = document.getElementById('fid-advisor-altitude-badge');
  if (altBadge) {
    altBadge.textContent = `Flight Alt: ${altContext.primaryAltitude}m`;
  }

  const prevLayerEl = document.getElementById('fid-advisor-prev-layer');
  if (prevLayerEl) {
    prevLayerEl.textContent = altContext.prevAltitude !== null ? `${altContext.prevAltitude}m` : 'None';
  }

  const nextLayerEl = document.getElementById('fid-advisor-next-layer');
  if (nextLayerEl) {
    nextLayerEl.textContent = altContext.nextAltitude !== null ? `${altContext.nextAltitude}m` : 'None';
  }

  const maxLayerEl = document.getElementById('fid-advisor-max-layer');
  if (maxLayerEl) {
    maxLayerEl.textContent = `${altContext.maxAltitude}m`;
  }

  const gsdEl = document.getElementById('fid-advisor-gsd-val');
  if (gsdEl) {
    gsdEl.textContent = `${metrics.gsdCmPerPx.toFixed(2)} cm/px`;
  }

  const pxEl = document.getElementById('fid-advisor-pixel-span-val');
  if (pxEl) {
    pxEl.textContent = `${metrics.pixelSpan.toFixed(1)} px`;
    pxEl.style.color = metrics.status === 'optimal' ? '#34d399' : (metrics.status === 'marginal' ? '#fbbf24' : '#f87171');
  }

  const slantEl = document.getElementById('fid-advisor-slant-dist-val');
  if (slantEl) {
    slantEl.textContent = `${metrics.maxSlantDistanceMeters.toFixed(0)} m`;
  }

  const groundEl = document.getElementById('fid-advisor-ground-radius-val');
  if (groundEl) {
    groundEl.textContent = metrics.groundDetectionRadiusMeters > 0 ? `${metrics.groundDetectionRadiusMeters.toFixed(0)} m` : '0 m (Too high)';
    groundEl.style.color = metrics.groundDetectionRadiusMeters > 0 ? '#fbbf24' : '#f87171';
  }

  const statusBox = document.getElementById('fid-advisor-status-box');
  const statusIcon = document.getElementById('fid-advisor-status-icon');
  const statusMsg = document.getElementById('fid-advisor-status-msg');
  if (statusBox && statusIcon && statusMsg) {
    if (metrics.status === 'optimal') {
      statusBox.style.background = 'rgba(16, 185, 129, 0.1)';
      statusBox.style.borderColor = 'rgba(16, 185, 129, 0.3)';
      statusBox.style.color = '#a7f3d0';
      statusIcon.textContent = '✅';
      statusMsg.textContent = `Optimal resolution: Target spans ${metrics.pixelSpan.toFixed(1)} px at ${altContext.primaryAltitude}m flight altitude for reliable sub-pixel corner solving.`;
    } else if (metrics.status === 'marginal') {
      statusBox.style.background = 'rgba(245, 158, 11, 0.1)';
      statusBox.style.borderColor = 'rgba(245, 158, 11, 0.3)';
      statusBox.style.color = '#fde68a';
      statusIcon.textContent = '🟡';
      statusMsg.textContent = `Marginal resolution: Target spans ${metrics.pixelSpan.toFixed(1)} px at ${altContext.primaryAltitude}m. Detectable under bright sun, but recommended size is ≥ ${metrics.recommendedSizeMeters.toFixed(2)}m.`;
    } else {
      statusBox.style.background = 'rgba(239, 68, 68, 0.12)';
      statusBox.style.borderColor = 'rgba(239, 68, 68, 0.35)';
      statusBox.style.color = '#fca5a5';
      statusIcon.textContent = '⚠️';
      statusMsg.textContent = `Target Undersized: At ${altContext.primaryAltitude}m AGL (GSD ${metrics.gsdCmPerPx} cm/px), a ${targetSize}m target spans only ${metrics.pixelSpan.toFixed(1)} px (under 10 px minimum). Computer vision tag detection will likely fail.`;
    }
  }

  const autoSetVal = document.getElementById('fid-autoset-size-val');
  if (autoSetVal) {
    autoSetVal.textContent = `${metrics.recommendedSizeMeters.toFixed(2)}m`;
  }
}

/**
 * Updates the flight altitude context banner inside the Printable Target Sheet modal.
 */
function updateTargetGeneratorAdvisor() {
  if (typeof document === 'undefined') return;
  const activeLayer = typeof getActiveLayer === 'function' ? getActiveLayer() : null;
  const altContext = getSurroundingFlightAltitudes(activeLayer ? activeLayer.id : null);
  const sizeSelect = document.getElementById('gen-target-size');
  const size = sizeSelect ? (parseFloat(sizeSelect.value) || 0.20) : 0.20;

  const metrics = calculateFiducialResolution(size, altContext.primaryAltitude);

  const altVal = document.getElementById('gen-adv-altitude-val');
  if (altVal) altVal.textContent = `${altContext.primaryAltitude}m`;

  const gsdVal = document.getElementById('gen-adv-gsd-val');
  if (gsdVal) gsdVal.textContent = `(GSD: ${metrics.gsdCmPerPx.toFixed(2)} cm/px)`;

  const statusText = document.getElementById('gen-adv-status-text');
  if (statusText) {
    if (metrics.status === 'optimal') {
      statusText.innerHTML = `<span style="color: #34d399; font-weight: 600;">✅ Optimal (${metrics.pixelSpan.toFixed(1)} px)</span> &mdash; clear sub-pixel detection at ${altContext.primaryAltitude}m.`;
    } else if (metrics.status === 'marginal') {
      statusText.innerHTML = `<span style="color: #fbbf24; font-weight: 600;">🟡 Marginal (${metrics.pixelSpan.toFixed(1)} px)</span> &mdash; recommend &ge; ${metrics.recommendedSizeMeters.toFixed(2)}m for ${altContext.primaryAltitude}m flight.`;
    } else {
      statusText.innerHTML = `<span style="color: #f87171; font-weight: 600;">⚠️ Undersized (${metrics.pixelSpan.toFixed(1)} px)</span> &mdash; target spans &lt;10 px at ${altContext.primaryAltitude}m; recommend &ge; ${metrics.recommendedSizeMeters.toFixed(2)}m.`;
    }
  }

  const recVal = document.getElementById('gen-adv-rec-size-val');
  if (recVal) recVal.textContent = `${metrics.recommendedSizeMeters.toFixed(2)}m`;
}

/**
 * Renders fiducial marker pins on the Leaflet 2D map.
 */
function drawFiducialLayers(globalCenterLat, globalCenterLon) {
  if (!fiducialMarkersGroup || typeof L === 'undefined' || !map) return;
  fiducialMarkersGroup.clearLayers();

  const enabledFiducials = (typeof flightLayers !== 'undefined' && Array.isArray(flightLayers))
    ? flightLayers.filter(l => l.enabled && (l.pattern === 'fiducial-markers' || l.isFiducialLayer))
    : [];

  const showRangeRings = typeof document !== 'undefined'
    ? (document.getElementById('fiducial-show-range-rings')?.checked !== false)
    : true;

  enabledFiducials.forEach(layer => {
    const markers = Array.isArray(layer.fiducialMarkers) ? layer.fiducialMarkers : [];
    const isCurrentActive = (typeof activeLayerId !== 'undefined' && layer.id === activeLayerId);
    const altRef = getSurroundingFlightAltitudes(layer.id);

    markers.forEach((m, idx) => {
      const color = m.color || layer.markerColor || '#f59e0b';
      const role = m.role || 'gcp';
      const roleColor = role === 'checkpoint' ? '#10b981' : (role === 'scale_bar' ? '#06b6d4' : (role === 'anchor' ? '#a855f7' : '#f59e0b'));
      const targetSize = m.physicalSizeMeters || layer.defaultPhysicalSize || 0.20;
      const res = calculateFiducialResolution(targetSize, altRef.primaryAltitude);

      // Draw detection range ring on map if enabled
      if (showRangeRings && res.groundDetectionRadiusMeters > 0 && typeof L.circle === 'function') {
        try {
          const rangeCircle = L.circle([m.lat, m.lon], {
            radius: res.groundDetectionRadiusMeters,
            color: roleColor,
            fillColor: roleColor,
            fillOpacity: 0.08,
            weight: 1.5,
            dashArray: '4, 6',
            interactive: true
          });
          if (typeof rangeCircle.bindTooltip === 'function') {
            rangeCircle.bindTooltip(
              `<strong>${escapeHtml(m.code || `GCP-${idx + 1}`)} Detection Envelope</strong><br>` +
              `Radius: ${res.groundDetectionRadiusMeters.toFixed(0)}m (${res.pixelSpan.toFixed(1)} px at ${altRef.primaryAltitude}m alt)<br>` +
              `Max Slant: ${res.maxSlantDistanceMeters.toFixed(0)}m`,
              { direction: 'top', className: 'fiducial-range-tooltip' }
            );
          }
          rangeCircle.addTo(fiducialMarkersGroup);
        } catch (e) {
          // gracefully catch in stub environments
        }
      }

      const customIcon = L.divIcon({
        className: 'fiducial-pin-wrapper',
        html: `
          <div class="fiducial-pin-label" style="border-color: ${roleColor}; color: ${roleColor};">${escapeHtml(m.code || `GCP-${idx + 1}`)}</div>
          <div class="fiducial-node-icon" style="background-color: ${color}; border-color: ${roleColor};" title="${escapeHtml(m.code)} (${role.toUpperCase()})">
            🎯
          </div>
        `,
        iconSize: [26, 26],
        iconAnchor: [13, 13]
      });

      const leafletMarker = L.marker([m.lat, m.lon], {
        icon: customIcon,
        draggable: isCurrentActive
      }).addTo(fiducialMarkersGroup);

      // Draggable handles for active layer
      if (isCurrentActive) {
        leafletMarker.on('drag', (e) => {
          const newLatLng = e.target.getLatLng();
          m.lat = newLatLng.lat;
          m.lon = newLatLng.lng;
        });

        leafletMarker.on('dragend', () => {
          renderFiducialMarkersTable(layer);
          updateGrid();
        });
      }

      // Popup editor with optical range metrics
      const popupHtml = `
        <div style="min-width: 195px; font-family: sans-serif; font-size: 0.78rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 4px;">
            <strong style="color: ${roleColor}; font-size: 0.82rem;">🎯 ${escapeHtml(m.code)}</strong>
            <span style="font-size: 0.65rem; background: rgba(255,255,255,0.1); padding: 1px 5px; border-radius: 3px; text-transform: uppercase;">${escapeHtml(role)}</span>
          </div>
          <div style="display: flex; flex-direction: column; gap: 5px;">
            <div>
              <label style="font-size: 0.7rem; color: #94a3b8; display: block;">Code / Label:</label>
              <input type="text" id="pop-fid-code-${m.id}" value="${escapeHtml(m.code)}" class="form-control" style="font-size: 0.75rem; padding: 2px 5px; width: 100%;">
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px;">
              <div>
                <label style="font-size: 0.7rem; color: #94a3b8; display: block;">Role:</label>
                <select id="pop-fid-role-${m.id}" class="form-select" style="font-size: 0.72rem; padding: 2px 4px; width: 100%;">
                  <option value="gcp" ${role === 'gcp' ? 'selected' : ''}>GCP</option>
                  <option value="checkpoint" ${role === 'checkpoint' ? 'selected' : ''}>Check Point</option>
                  <option value="scale_bar" ${role === 'scale_bar' ? 'selected' : ''}>Scale Bar</option>
                  <option value="anchor" ${role === 'anchor' ? 'selected' : ''}>Anchor</option>
                </select>
              </div>
              <div>
                <label style="font-size: 0.7rem; color: #94a3b8; display: block;">Alt (m):</label>
                <input type="number" id="pop-fid-alt-${m.id}" value="${m.alt || 0}" step="0.1" class="form-control" style="font-size: 0.72rem; padding: 2px 4px; width: 100%;">
              </div>
            </div>
            <div style="font-size: 0.68rem; color: #cbd5e1; margin-top: 2px;">
              Lat: ${m.lat.toFixed(6)}°<br>Lon: ${m.lon.toFixed(6)}°
            </div>
            <div style="font-size: 0.68rem; color: #94a3b8; background: rgba(0,0,0,0.25); padding: 4px 6px; border-radius: 4px; display: flex; flex-direction: column; gap: 2px;">
              <div>Optical Range: <strong style="color: #38bdf8;">${res.groundDetectionRadiusMeters > 0 ? res.groundDetectionRadiusMeters.toFixed(0) + 'm ground radius' : '0m (Alt too high)'}</strong> (${res.maxSlantDistanceMeters.toFixed(0)}m slant)</div>
              <div>Aerial Res: <strong style="color: ${res.status === 'optimal' ? '#34d399' : (res.status === 'marginal' ? '#fbbf24' : '#f87171')};">~${res.pixelSpan.toFixed(1)} px</strong> at ${altRef.primaryAltitude}m</div>
            </div>
            <div style="display: flex; gap: 4px; margin-top: 4px;">
              <button type="button" class="btn-primary btn-sm" style="flex: 1; padding: 3px 6px; font-size: 0.7rem;" onclick="saveFiducialPopup('${layer.id}', '${m.id}')">Save</button>
              <button type="button" class="btn-secondary btn-sm" style="padding: 3px 6px; font-size: 0.7rem; color: #ef4444;" onclick="deleteFiducialMarker('${layer.id}', '${m.id}')">🗑️</button>
            </div>
          </div>
        </div>
      `;
      leafletMarker.bindPopup(popupHtml);
    });
  });
}

/**
 * Saves edits made inside a fiducial map marker popup.
 */
function saveFiducialPopup(layerId, markerId) {
  const codeEl = document.getElementById(`pop-fid-code-${markerId}`);
  const roleEl = document.getElementById(`pop-fid-role-${markerId}`);
  const altEl = document.getElementById(`pop-fid-alt-${markerId}`);
  const updates = {};
  if (codeEl && codeEl.value) updates.code = codeEl.value.trim();
  if (roleEl && roleEl.value) updates.role = roleEl.value;
  if (altEl && !isNaN(parseFloat(altEl.value))) updates.alt = parseFloat(altEl.value);

  updateFiducialMarker(layerId, markerId, updates);
  if (map) map.closePopup();
}

/**
 * Renders the interactive table of placed fiducial markers in Section 2 Card 6.
 */
function renderFiducialMarkersTable(layer) {
  const tbody = document.getElementById('fiducial-markers-tbody');
  const summaryEl = document.getElementById('fiducial-metrics-summary');
  if (!layer || !Array.isArray(layer.fiducialMarkers) || layer.fiducialMarkers.length === 0) {
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" style="padding: 10px; text-align: center; color: var(--text-muted); font-style: italic;">
            No markers placed yet. Click on the map or import CSV/GeoJSON.
          </td>
        </tr>
      `;
    }
    if (summaryEl) summaryEl.textContent = "0 Markers";
    return;
  }

  const markers = layer.fiducialMarkers;
  const gcpCount = markers.filter(m => m.role === 'gcp').length;
  const cpCount = markers.filter(m => m.role === 'checkpoint').length;
  const otherCount = markers.length - gcpCount - cpCount;

  if (summaryEl) {
    let summaryText = `${markers.length} Markers (${gcpCount} GCPs, ${cpCount} CPs`;
    if (otherCount > 0) summaryText += `, ${otherCount} other`;
    summaryText += ')';
    summaryEl.textContent = summaryText;
  }

  if (!tbody) return;
  tbody.innerHTML = markers.map((m, idx) => {
    const roleBadgeColor = m.role === 'checkpoint' ? 'rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4)' :
      (m.role === 'scale_bar' ? 'rgba(6, 182, 212, 0.2); color: #22d3ee; border: 1px solid rgba(6, 182, 212, 0.4)' :
      (m.role === 'anchor' ? 'rgba(168, 85, 247, 0.2); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.4)' :
      'rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.4)'));

    return `
      <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.05);">
        <td style="padding: 4px 6px; font-weight: 600; color: #f8fafc;">${escapeHtml(m.code || `GCP-${idx + 1}`)}</td>
        <td style="padding: 4px 6px;">
          <span style="font-size: 0.62rem; padding: 1px 4px; border-radius: 3px; font-weight: 700; ${roleBadgeColor}">
            ${m.role ? m.role.toUpperCase() : 'GCP'}
          </span>
        </td>
        <td style="padding: 4px 6px; font-family: monospace; color: #94a3b8;">${(m.alt !== undefined ? m.alt : 0).toFixed(1)}m</td>
        <td style="padding: 4px 6px; text-align: right; white-space: nowrap;">
          <button type="button" class="btn-secondary btn-sm" style="padding: 1px 5px; font-size: 0.65rem; margin-right: 2px;" onclick="flyToFiducialMarker(${m.lat}, ${m.lon})" title="Center on map">📍</button>
          <button type="button" class="btn-secondary btn-sm" style="padding: 1px 5px; font-size: 0.65rem; color: #ef4444;" onclick="deleteFiducialMarker('${layer.id}', '${m.id}')" title="Delete marker">✕</button>
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * Centers the Leaflet map on a fiducial marker.
 */
function flyToFiducialMarker(lat, lon) {
  if (typeof map !== 'undefined' && map && typeof map.setView === 'function') {
    map.setView([lat, lon], Math.max(map.getZoom ? map.getZoom() : 18, 19));
  }
}

/**
 * Parses RTK GNSS rover point surveys from CSV text.
 * Auto-detects standard columns: Name/Code, Latitude/Y, Longitude/X, Altitude/Z, Role, Type, Size.
 */
function parseSurveyCsv(csvText) {
  if (!csvText || typeof csvText !== 'string') return [];
  const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length === 0) return [];

  const delimiter = lines[0].includes('\t') ? '\t' : (lines[0].includes(';') ? ';' : ',');
  const rows = lines.map(line => line.split(delimiter).map(c => c.trim().replace(/^["']|["']$/g, '')));
  if (rows.length === 0) return [];

  const header = rows[0].map(h => h.toLowerCase());
  let nameIdx = -1, latIdx = -1, lonIdx = -1, altIdx = -1, roleIdx = -1, typeIdx = -1, sizeIdx = -1;

  header.forEach((h, idx) => {
    if (['name', 'code', 'point', 'point id', 'pt', 'id', 'label', 'target'].includes(h)) nameIdx = idx;
    else if (['lat', 'latitude', 'y', 'northing'].includes(h)) latIdx = idx;
    else if (['lon', 'lng', 'long', 'longitude', 'x', 'easting'].includes(h)) lonIdx = idx;
    else if (['alt', 'altitude', 'height', 'elev', 'elevation', 'z', 'ellipsoid'].includes(h)) altIdx = idx;
    else if (['role', 'class', 'marker_role'].includes(h)) roleIdx = idx;
    else if (['type', 'target_type', 'family', 'dict'].includes(h)) typeIdx = idx;
    else if (['size', 'target_size', 'dimension', 'width'].includes(h)) sizeIdx = idx;
  });

  const hasHeader = (latIdx !== -1 && lonIdx !== -1);
  const dataRows = hasHeader ? rows.slice(1) : rows;

  const markers = [];
  dataRows.forEach((cols, rowIdx) => {
    if (cols.length < 2) return;
    let code = '', lat = NaN, lon = NaN, alt = 0, role = 'gcp', type = 'aruco_4x4', size = 0.5;

    if (hasHeader) {
      code = nameIdx !== -1 ? cols[nameIdx] : `GCP-${rowIdx + 1}`;
      lat = parseFloat(cols[latIdx]);
      lon = parseFloat(cols[lonIdx]);
      if (altIdx !== -1 && !isNaN(parseFloat(cols[altIdx]))) alt = parseFloat(cols[altIdx]);
      if (roleIdx !== -1 && cols[roleIdx]) role = cols[roleIdx].toLowerCase();
      if (typeIdx !== -1 && cols[typeIdx]) type = cols[typeIdx].toLowerCase();
      if (sizeIdx !== -1 && !isNaN(parseFloat(cols[sizeIdx]))) size = parseFloat(cols[sizeIdx]);
    } else {
      if (cols.length >= 3 && !isNaN(parseFloat(cols[1])) && !isNaN(parseFloat(cols[2]))) {
        code = cols[0];
        lat = parseFloat(cols[1]);
        lon = parseFloat(cols[2]);
        if (cols.length >= 4 && !isNaN(parseFloat(cols[3]))) alt = parseFloat(cols[3]);
      } else if (!isNaN(parseFloat(cols[0])) && !isNaN(parseFloat(cols[1]))) {
        code = `GCP-${rowIdx + 1}`;
        lat = parseFloat(cols[0]);
        lon = parseFloat(cols[1]);
        if (cols.length >= 3 && !isNaN(parseFloat(cols[2]))) alt = parseFloat(cols[2]);
      }
    }

    if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      const cleanRole = ['checkpoint', 'check', 'cp'].includes(role) ? 'checkpoint' :
        (['scale_bar', 'scale', 'scalebar'].includes(role) ? 'scale_bar' :
        (['anchor', 'origin'].includes(role) ? 'anchor' : 'gcp'));
      const cleanType = ['aruco_5x5', 'apriltag_36h11', 'checkerboard', 'crosshair', 'circular_coded'].includes(type) ? type : 'aruco_4x4';

      markers.push({
        id: `gcp-${Date.now()}-${rowIdx + 1}-${Math.floor(Math.random() * 1000)}`,
        code: code || `GCP-${rowIdx + 1}`,
        role: cleanRole,
        type: cleanType,
        markerId: rowIdx,
        lat,
        lon,
        alt: isNaN(alt) ? 0 : alt,
        physicalSizeMeters: isNaN(size) || size <= 0 ? 0.5 : size,
        color: '#f59e0b',
        notes: ''
      });
    }
  });

  return markers;
}

/**
 * Parses GeoJSON FeatureCollection into fiducial marker objects.
 */
function parseSurveyGeoJson(geoJsonText) {
  if (!geoJsonText) return [];
  let data;
  try {
    data = typeof geoJsonText === 'string' ? JSON.parse(geoJsonText) : geoJsonText;
  } catch (e) {
    return [];
  }
  const features = (data && data.type === 'FeatureCollection' && Array.isArray(data.features))
    ? data.features
    : ((data && data.type === 'Feature') ? [data] : []);

  const markers = [];
  features.forEach((feat, idx) => {
    if (!feat.geometry || feat.geometry.type !== 'Point' || !Array.isArray(feat.geometry.coordinates)) return;
    const coords = feat.geometry.coordinates;
    const lon = parseFloat(coords[0]);
    const lat = parseFloat(coords[1]);
    const alt = coords.length >= 3 ? parseFloat(coords[2]) || 0 : 0;
    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return;

    const props = feat.properties || {};
    const code = props.name || props.code || props.id || props.label || `GCP-${idx + 1}`;
    const roleRaw = (props.role || props.class || 'gcp').toLowerCase();
    const role = ['checkpoint', 'check', 'cp'].includes(roleRaw) ? 'checkpoint' :
      (['scale_bar', 'scale'].includes(roleRaw) ? 'scale_bar' :
      (['anchor', 'origin'].includes(roleRaw) ? 'anchor' : 'gcp'));
    const type = props.type || 'aruco_4x4';
    const size = parseFloat(props.size || props.physicalSizeMeters) || 0.5;

    markers.push({
      id: `gcp-${Date.now()}-${idx + 1}-${Math.floor(Math.random() * 1000)}`,
      code: String(code),
      role,
      type,
      markerId: idx,
      lat,
      lon,
      alt: isNaN(alt) ? 0 : alt,
      physicalSizeMeters: size,
      color: props.color || '#f59e0b',
      notes: props.notes || ''
    });
  });
  return markers;
}

/**
 * Exports a layer's fiducial markers as a standard surveyor CSV download.
 */
function exportFiducialMarkersCsv(layer) {
  if (!layer || !Array.isArray(layer.fiducialMarkers) || layer.fiducialMarkers.length === 0) {
    alert("No fiducial markers to export in this layer.");
    return;
  }

  const rows = [
    ['Code', 'Latitude', 'Longitude', 'Altitude_m', 'Role', 'Type', 'Size_m', 'Notes'].join(',')
  ];

  layer.fiducialMarkers.forEach(m => {
    rows.push([
      `"${(m.code || '').replace(/"/g, '""')}"`,
      m.lat.toFixed(8),
      m.lon.toFixed(8),
      (m.alt !== undefined ? m.alt : 0).toFixed(3),
      m.role || 'gcp',
      m.type || 'aruco_4x4',
      (m.physicalSizeMeters || 0.5).toFixed(2),
      `"${(m.notes || '').replace(/"/g, '""')}"`
    ].join(','));
  });

  const csvBlob = new Blob([rows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(csvBlob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  const safeName = (layer.name || 'GCP_Survey').replace(/[^a-z0-9_-]/gi, '_');
  link.setAttribute('download', `Aalaapi_Fiducial_Markers_${safeName}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Exports a layer's fiducial markers as standard GeoJSON FeatureCollection.
 */
function exportFiducialMarkersGeoJson(layer) {
  if (!layer || !Array.isArray(layer.fiducialMarkers) || layer.fiducialMarkers.length === 0) {
    alert("No fiducial markers to export in this layer.");
    return;
  }

  const geojson = {
    type: 'FeatureCollection',
    name: layer.name || 'Fiducial Markers',
    features: layer.fiducialMarkers.map(m => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [m.lon, m.lat, m.alt || 0]
      },
      properties: {
        code: m.code,
        role: m.role,
        type: m.type,
        physicalSizeMeters: m.physicalSizeMeters,
        color: m.color,
        notes: m.notes
      }
    }))
  };

  const jsonBlob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/geo+json;charset=utf-8;' });
  const url = URL.createObjectURL(jsonBlob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  const safeName = (layer.name || 'GCP_Survey').replace(/[^a-z0-9_-]/gi, '_');
  link.setAttribute('download', `Aalaapi_Fiducial_Markers_${safeName}.geojson`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Extracts raw millimeter-accurate vector primitives for optical fiducial markers.
 * Coordinate space is normalized to [0..500], where the fiducial marker itself
 * occupies [50, 50] to [450, 450] (400x400 units).
 */
function getFiducialMarkerVectorContent(options = {}) {
  const type = options.type || 'aruco_4x4';
  const id = Math.max(0, parseInt(options.id, 10) || 0);
  const showCrosshair = options.showCrosshair !== false;
  const showCornerTicks = options.showCornerTicks !== false;

  const totalSize = 500;
  const margin = 50;
  const targetSize = totalSize - (margin * 2); // 400x400
  const center = totalSize / 2;

  const stencilMode = options.stencilMode === true || options.renderStyle === 'stencil';

  let markerContent = '';

  function renderGridCells(grid, gridSize) {
    let content = '';
    const cSize = targetSize / gridSize;
    for (let r = 0; r < gridSize; r++) {
      for (let c = 0; c < gridSize; c++) {
        const x = margin + c * cSize;
        const y = margin + r * cSize;
        if (grid[r][c]) {
          content += `<rect x="${x}" y="${y}" width="${cSize}" height="${cSize}" fill="#ffffff" stroke="#cbd5e1" stroke-width="0.75" stroke-dasharray="2,2" />`;
          if (cSize >= 28) {
            content += `<text x="${x + cSize / 2}" y="${y + cSize / 2 + 3}" font-family="sans-serif" font-size="${Math.max(7, Math.round(cSize * 0.16))}" font-weight="600" fill="#94a3b8" text-anchor="middle">KEEP</text>`;
          }
        } else {
          content += `<rect x="${x}" y="${y}" width="${cSize}" height="${cSize}" fill="rgba(15, 23, 42, 0.04)" stroke="#0f172a" stroke-width="1.75" stroke-dasharray="6,3" />`;
          content += `<text x="${x + cSize / 2}" y="${y + cSize / 2 + 3}" font-family="sans-serif" font-size="${Math.max(7, Math.round(cSize * 0.2))}" font-weight="700" fill="#0f172a" text-anchor="middle">✂ CUT</text>`;
        }
      }
    }
    return content;
  }

  if (type === 'aruco_4x4') {
    // 6x6 grid: 1-cell black border, inner 4x4 data payload
    const dataPair = ARUCO_4X4_50_DATA[id % ARUCO_4X4_50_DATA.length] || [181, 50];
    const cellSize = targetSize / 6;

    if (!stencilMode) {
      markerContent += `<rect x="${margin}" y="${margin}" width="${targetSize}" height="${targetSize}" fill="#000000" />`;

      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
          const bitIdx = r * 4 + c;
          const byteIdx = Math.floor(bitIdx / 8);
          const bitInByte = 7 - (bitIdx % 8);
          const bitVal = (dataPair[byteIdx] >> bitInByte) & 1;

          if (bitVal === 1) {
            const x = margin + (c + 1) * cellSize;
            const y = margin + (r + 1) * cellSize;
            markerContent += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="#ffffff" />`;
          }
        }
      }
    } else {
      const grid = Array.from({ length: 6 }, () => Array(6).fill(false));
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
          const bitIdx = r * 4 + c;
          const byteIdx = Math.floor(bitIdx / 8);
          const bitInByte = 7 - (bitIdx % 8);
          const bitVal = (dataPair[byteIdx] >> bitInByte) & 1;
          if (bitVal === 1) grid[r + 1][c + 1] = true;
        }
      }
      markerContent += renderGridCells(grid, 6);
    }
  } else if (type === 'aruco_5x5') {
    // 7x7 grid: 1-cell black border, inner 5x5 data payload
    const dataTuple = ARUCO_5X5_DATA[id % ARUCO_5X5_DATA.length] || [132, 33, 8, 0];
    const cellSize = targetSize / 7;

    if (!stencilMode) {
      markerContent += `<rect x="${margin}" y="${margin}" width="${targetSize}" height="${targetSize}" fill="#000000" />`;

      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
          const bitIdx = r * 5 + c;
          const byteIdx = Math.floor(bitIdx / 8);
          const bitInByte = 7 - (bitIdx % 8);
          const bitVal = (dataTuple[byteIdx] >> bitInByte) & 1;

          if (bitVal === 1) {
            const x = margin + (c + 1) * cellSize;
            const y = margin + (r + 1) * cellSize;
            markerContent += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="#ffffff" />`;
          }
        }
      }
    } else {
      const grid = Array.from({ length: 7 }, () => Array(7).fill(false));
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
          const bitIdx = r * 5 + c;
          const byteIdx = Math.floor(bitIdx / 8);
          const bitInByte = 7 - (bitIdx % 8);
          const bitVal = (dataTuple[byteIdx] >> bitInByte) & 1;
          if (bitVal === 1) grid[r + 1][c + 1] = true;
        }
      }
      markerContent += renderGridCells(grid, 7);
    }
  } else if (type === 'apriltag_25h9') {
    // 7x7 grid: 1-cell black border, inner 5x5 data payload (35 codes, Hamming 9)
    const code = APRILTAG_25H9_CODES[id % APRILTAG_25H9_CODES.length];
    const cellSize = targetSize / 7;

    if (!stencilMode) {
      markerContent += `<rect x="${margin}" y="${margin}" width="${targetSize}" height="${targetSize}" fill="#000000" />`;

      for (let i = 0; i < 25; i++) {
        const bitVal = (code >> (24 - i)) & 1;
        if (bitVal === 1) {
          const x = margin + APRILTAG_25H9_BIT_X[i] * cellSize;
          const y = margin + APRILTAG_25H9_BIT_Y[i] * cellSize;
          markerContent += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="#ffffff" />`;
        }
      }
    } else {
      const grid = Array.from({ length: 7 }, () => Array(7).fill(false));
      for (let i = 0; i < 25; i++) {
        const bitVal = (code >> (24 - i)) & 1;
        if (bitVal === 1) grid[APRILTAG_25H9_BIT_Y[i]][APRILTAG_25H9_BIT_X[i]] = true;
      }
      markerContent += renderGridCells(grid, 7);
    }
  } else if (type === 'apriltag_36h11') {
    // 8x8 grid: 1-cell black border, inner 6x6 data payload (50+ codes, Hamming 11)
    const code = APRILTAG_36H11_CODES[id % APRILTAG_36H11_CODES.length];
    const cellSize = targetSize / 8;

    if (!stencilMode) {
      markerContent += `<rect x="${margin}" y="${margin}" width="${targetSize}" height="${targetSize}" fill="#000000" />`;

      for (let i = 0; i < 36; i++) {
        const bitVal = Number((code >> BigInt(35 - i)) & 1n);
        if (bitVal === 1) {
          const x = margin + APRILTAG_36H11_BIT_X[i] * cellSize;
          const y = margin + APRILTAG_36H11_BIT_Y[i] * cellSize;
          markerContent += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="#ffffff" />`;
        }
      }
    } else {
      const grid = Array.from({ length: 8 }, () => Array(8).fill(false));
      for (let i = 0; i < 36; i++) {
        const bitVal = Number((code >> BigInt(35 - i)) & 1n);
        if (bitVal === 1) grid[APRILTAG_36H11_BIT_Y[i]][APRILTAG_36H11_BIT_X[i]] = true;
      }
      markerContent += renderGridCells(grid, 8);
    }
  } else if (type === 'apriltag_16h5') {
    // 6x6 grid: 1-cell black border, inner 4x4 data payload (30 codes, Hamming 5)
    const code = APRILTAG_16H5_CODES[id % APRILTAG_16H5_CODES.length];
    const cellSize = targetSize / 6;

    if (!stencilMode) {
      markerContent += `<rect x="${margin}" y="${margin}" width="${targetSize}" height="${targetSize}" fill="#000000" />`;

      for (let i = 0; i < 16; i++) {
        const bitVal = (code >> (15 - i)) & 1;
        if (bitVal === 1) {
          const x = margin + APRILTAG_16H5_BIT_X[i] * cellSize;
          const y = margin + APRILTAG_16H5_BIT_Y[i] * cellSize;
          markerContent += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="#ffffff" />`;
        }
      }
    } else {
      const grid = Array.from({ length: 6 }, () => Array(6).fill(false));
      for (let i = 0; i < 16; i++) {
        const bitVal = (code >> (15 - i)) & 1;
        if (bitVal === 1) grid[APRILTAG_16H5_BIT_Y[i]][APRILTAG_16H5_BIT_X[i]] = true;
      }
      markerContent += renderGridCells(grid, 6);
    }
  } else if (type === 'checkerboard') {
    // 4x4 alternating black & white squares
    const cellSize = targetSize / 4;

    if (!stencilMode) {
      markerContent += `<rect x="${margin}" y="${margin}" width="${targetSize}" height="${targetSize}" fill="#ffffff" stroke="#000000" stroke-width="2" />`;

      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
          if ((r + c) % 2 === 0) {
            const x = margin + c * cellSize;
            const y = margin + r * cellSize;
            markerContent += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="#000000" />`;
          }
        }
      }
    } else {
      const grid = Array.from({ length: 4 }, () => Array(4).fill(false));
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
          grid[r][c] = ((r + c) % 2 !== 0);
        }
      }
      markerContent += renderGridCells(grid, 4);
    }
  } else {
    // High-Contrast Crosshair / AeroPoint target
    if (!stencilMode) {
      markerContent += `
        <rect x="${margin}" y="${margin}" width="${targetSize}" height="${targetSize}" fill="#ffffff" stroke="#000000" stroke-width="2" />
        <!-- Quadrants -->
        <rect x="${margin}" y="${margin}" width="${targetSize / 2}" height="${targetSize / 2}" fill="#000000" />
        <rect x="${center}" y="${center}" width="${targetSize / 2}" height="${targetSize / 2}" fill="#000000" />
        <!-- Concentric Target Circles -->
        <circle cx="${center}" cy="${center}" r="${targetSize * 0.35}" fill="none" stroke="#f59e0b" stroke-width="3" stroke-dasharray="4,4" />
        <circle cx="${center}" cy="${center}" r="${targetSize * 0.15}" fill="none" stroke="#000000" stroke-width="2" />
      `;
    } else {
      const half = targetSize / 2;
      markerContent += `
        <rect x="${margin}" y="${margin}" width="${targetSize}" height="${targetSize}" fill="#ffffff" stroke="#cbd5e1" stroke-width="1" />
        <!-- Top-Left Cut Quadrant -->
        <rect x="${margin}" y="${margin}" width="${half}" height="${half}" fill="rgba(15, 23, 42, 0.04)" stroke="#0f172a" stroke-width="1.75" stroke-dasharray="6,3" />
        <text x="${margin + half / 2}" y="${margin + half / 2 + 4}" font-family="sans-serif" font-size="14" font-weight="700" fill="#0f172a" text-anchor="middle">✂ CUT HERE (PAINT)</text>
        <!-- Top-Right Keep Quadrant -->
        <rect x="${center}" y="${margin}" width="${half}" height="${half}" fill="#ffffff" stroke="#cbd5e1" stroke-width="0.75" stroke-dasharray="2,2" />
        <text x="${center + half / 2}" y="${margin + half / 2 + 4}" font-family="sans-serif" font-size="12" font-weight="600" fill="#94a3b8" text-anchor="middle">KEEP (WHITE)</text>
        <!-- Bottom-Left Keep Quadrant -->
        <rect x="${margin}" y="${center}" width="${half}" height="${half}" fill="#ffffff" stroke="#cbd5e1" stroke-width="0.75" stroke-dasharray="2,2" />
        <text x="${margin + half / 2}" y="${center + half / 2 + 4}" font-family="sans-serif" font-size="12" font-weight="600" fill="#94a3b8" text-anchor="middle">KEEP (WHITE)</text>
        <!-- Bottom-Right Cut Quadrant -->
        <rect x="${center}" y="${center}" width="${half}" height="${half}" fill="rgba(15, 23, 42, 0.04)" stroke="#0f172a" stroke-width="1.75" stroke-dasharray="6,3" />
        <text x="${center + half / 2}" y="${center + half / 2 + 4}" font-family="sans-serif" font-size="14" font-weight="700" fill="#0f172a" text-anchor="middle">✂ CUT HERE (PAINT)</text>
        <!-- Concentric Target Circles -->
        <circle cx="${center}" cy="${center}" r="${targetSize * 0.35}" fill="none" stroke="#f59e0b" stroke-width="3" stroke-dasharray="4,4" />
        <circle cx="${center}" cy="${center}" r="${targetSize * 0.15}" fill="none" stroke="#0f172a" stroke-width="1.5" stroke-dasharray="4,2" />
      `;
    }
  }

  // Corner alignment ticks
  let cornerTicksSvg = '';
  if (showCornerTicks) {
    cornerTicksSvg = `
      <!-- Top-Left -->
      <path d="M ${margin - 10} ${margin} L ${margin - 10} ${margin - 10} L ${margin} ${margin - 10}" fill="none" stroke="#000000" stroke-width="2" />
      <!-- Top-Right -->
      <path d="M ${totalSize - margin + 10} ${margin} L ${totalSize - margin + 10} ${margin - 10} L ${totalSize - margin} ${margin - 10}" fill="none" stroke="#000000" stroke-width="2" />
      <!-- Bottom-Left -->
      <path d="M ${margin - 10} ${totalSize - margin} L ${margin - 10} ${totalSize - margin + 10} L ${margin} ${totalSize - margin + 10}" fill="none" stroke="#000000" stroke-width="2" />
      <!-- Bottom-Right -->
      <path d="M ${totalSize - margin + 10} ${totalSize - margin} L ${totalSize - margin + 10} ${totalSize - margin + 10} L ${totalSize - margin} ${totalSize - margin + 10}" fill="none" stroke="#000000" stroke-width="2" />
    `;
  }

  // Center crosshair
  let crosshairSvg = '';
  if (showCrosshair) {
    crosshairSvg = `
      <line x1="${center}" y1="${margin - 5}" x2="${center}" y2="${center - 6}" stroke="#ef4444" stroke-width="1.5" />
      <line x1="${center}" y1="${center + 6}" x2="${center}" y2="${totalSize - margin + 5}" stroke="#ef4444" stroke-width="1.5" />
      <line x1="${margin - 5}" y1="${center}" x2="${center - 6}" y2="${center}" stroke="#ef4444" stroke-width="1.5" />
      <line x1="${center + 6}" y1="${center}" x2="${totalSize - margin + 5}" y2="${center}" stroke="#ef4444" stroke-width="1.5" />
      <circle cx="${center}" cy="${center}" r="2" fill="#ef4444" />
    `;
  }

  return {
    markerContent,
    cornerTicksSvg,
    crosshairSvg,
    margin,
    targetSize,
    totalSize,
    center
  };
}

/**
 * Generates an authentic, millimeter-accurate vector SVG string for optical fiducial targets.
 */
function generateFiducialSvg(options = {}) {
  const type = options.type || 'aruco_4x4';
  const id = Math.max(0, parseInt(options.id, 10) || 0);
  const targetEdgeM = parseFloat(options.physicalSizeMeters) || 0.20;
  const showRuler = options.showRuler !== false;
  const showIdLabel = options.showIdLabel !== false;
  const stencilMode = options.stencilMode === true || options.renderStyle === 'stencil';

  const { markerContent, cornerTicksSvg, crosshairSvg, margin, targetSize, totalSize } = getFiducialMarkerVectorContent(options);

  // Ruler Scale Bar (10 cm / 4 in)
  let rulerSvg = '';
  if (showRuler) {
    const rx = margin;
    const ry = totalSize - 18;
    const rw = targetSize;
    rulerSvg = `
      <g id="scale-ruler" font-family="sans-serif" font-size="8" fill="#334155">
        <line x1="${rx}" y1="${ry}" x2="${rx + rw}" y2="${ry}" stroke="#334155" stroke-width="1.5" />
        <line x1="${rx}" y1="${ry - 6}" x2="${rx}" y2="${ry + 6}" stroke="#334155" stroke-width="1.5" />
        <line x1="${rx + rw / 2}" y1="${ry - 4}" x2="${rx + rw / 2}" y2="${ry + 4}" stroke="#334155" stroke-width="1" />
        <line x1="${rx + rw}" y1="${ry - 6}" x2="${rx + rw}" y2="${ry + 6}" stroke="#334155" stroke-width="1.5" />
        <text x="${rx}" y="${ry - 8}" text-anchor="start">0</text>
        <text x="${rx + rw / 2}" y="${ry - 8}" text-anchor="middle">50%</text>
        <text x="${rx + rw}" y="${ry - 8}" text-anchor="end">Target Width: ${(targetEdgeM * 1000).toFixed(0)} mm (${(targetEdgeM * 39.37).toFixed(1)} in)</text>
      </g>
    `;
  }

  // Header Target Label
  let idLabelSvg = '';
  if (showIdLabel) {
    const typeLabel = type === 'aruco_4x4' ? `ArUco 4x4 (DICT_4X4_50) #ID:${id}` :
      (type === 'aruco_5x5' ? `ArUco 5x5 (DICT_5X5_100) #ID:${id}` :
      (type === 'apriltag_25h9' ? `AprilTag 25h9 (tag25h9) #ID:${id}` :
      (type === 'apriltag_36h11' ? `AprilTag 36h11 (tag36h11) #ID:${id}` :
      (type === 'apriltag_16h5' ? `AprilTag 16h5 (tag16h5) #ID:${id}` :
      (type === 'checkerboard' ? `Survey Checkerboard 4x4` : `Survey AeroPoint Crosshair`)))));

    idLabelSvg = `
      <g id="header-label" font-family="sans-serif">
        <text x="${margin}" y="24" font-size="11" font-weight="700" fill="#0f172a">${escapeHtml(typeLabel)}${stencilMode ? ' • ✂ STENCIL CUTOUT' : ''}</text>
        <text x="${totalSize - margin}" y="24" font-size="10" font-weight="600" fill="${stencilMode ? '#d97706' : '#64748b'}" text-anchor="end">${stencilMode ? 'CUT BLACK ZONES • SPRAY PAINT' : 'AALAAPI SKY SURVEY'}</text>
      </g>
    `;
  }

  // Optional Tiling Grid Cutline Overlay for Assembled View
  let tilingGridOverlay = '';
  if (options.showTilingGrid && options.matrix && options.matrix.requiresTiling) {
    const mRows = options.matrix.rows;
    const mCols = options.matrix.cols;
    const cellW = targetSize / mCols;
    const cellH = targetSize / mRows;
    let gridLines = '';
    let sheetBadges = '';
    for (let c = 1; c < mCols; c++) {
      const gx = margin + c * cellW;
      gridLines += `<line x1="${gx}" y1="${margin}" x2="${gx}" y2="${margin + targetSize}" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="6,4" opacity="0.85" />`;
    }
    for (let r = 1; r < mRows; r++) {
      const gy = margin + r * cellH;
      gridLines += `<line x1="${margin}" y1="${gy}" x2="${margin + targetSize}" y2="${gy}" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="6,4" opacity="0.85" />`;
    }
    for (let r = 0; r < mRows; r++) {
      for (let c = 0; c < mCols; c++) {
        const bx = margin + c * cellW + 6;
        const by = margin + r * cellH + 14;
        sheetBadges += `<text x="${bx}" y="${by}" font-family="sans-serif" font-size="8" font-weight="700" fill="#f59e0b" opacity="0.9">Sheet ${r * mCols + c + 1} [${r + 1},${c + 1}]</text>`;
      }
    }
    tilingGridOverlay = `
      <g id="tiling-assembled-grid">
        ${gridLines}
        ${sheetBadges}
      </g>
    `;
  }

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSize} ${totalSize}" width="100%" height="100%" style="background-color: #ffffff; display: block; max-width: 100%; height: auto;">
      <rect x="0" y="0" width="${totalSize}" height="${totalSize}" fill="#ffffff" />
      ${idLabelSvg}
      ${markerContent}
      ${cornerTicksSvg}
      ${crosshairSvg}
      ${tilingGridOverlay}
      ${rulerSvg}
    </svg>
  `.trim();
}

/**
 * Calculates row and column matrix split for multi-sheet poster tiling (GCP Studio).
 */
function calculateFiducialTilingMatrix(targetSizeMeters, paperFormat = 'letter', overlapMm = 6.35) {
  const targetMm = (parseFloat(targetSizeMeters) || 0.20) * 1000;
  
  // Paper sheet dimensions in mm (US Letter vs ISO A4)
  let sheetW = paperFormat === 'a4' ? 210 : 215.9;
  let sheetH = paperFormat === 'a4' ? 297 : 279.4;
  
  // Printer safety margin (6mm on edges)
  const printMarginMm = 6.0;
  const usableSheetW = sheetW - (printMarginMm * 2);
  const usableSheetH = sheetH - (printMarginMm * 2);

  // Reserve margin for tile headers & ruler footer (~35mm top/bottom)
  const headerFooterReservedMm = 35.0;
  const effectivePrintableW = usableSheetW;
  const effectivePrintableH = usableSheetH - headerFooterReservedMm;
  
  // Effective printable square side per sheet accounting for overlap bleed
  const stepW = effectivePrintableW - overlapMm;
  const stepH = effectivePrintableH - overlapMm;
  const minStep = Math.max(250, Math.min(stepW, stepH)); // 250mm (~0.25m) threshold for desktop sheets

  // Single sheet if target <= 0.32m (320mm)
  if (targetMm <= 320) {
    return {
      requiresTiling: false,
      rows: 1,
      cols: 1,
      totalSheets: 1,
      targetMm,
      sheetW,
      sheetH,
      overlapMm,
      tileSizeMm: targetMm
    };
  }

  const cols = Math.max(1, Math.ceil(targetMm / minStep));
  const rows = Math.max(1, Math.ceil(targetMm / minStep));
  const totalSheets = rows * cols;
  const tileSizeMm = targetMm / cols;

  return {
    requiresTiling: true,
    rows,
    cols,
    totalSheets,
    targetMm,
    sheetW,
    sheetH,
    overlapMm,
    tileSizeMm
  };
}

/**
 * Generates an SVG string for a specific tile sheet (row, col) in a multi-sheet matrix.
 */
function generateTiledFiducialSheetSvg(options = {}, row = 0, col = 0, matrixInfo = null) {
  const type = options.type || 'aruco_4x4';
  const id = Math.max(0, parseInt(options.id, 10) || 0);
  const targetEdgeM = parseFloat(options.physicalSizeMeters) || 0.60;
  const paperFormat = options.paperFormat || 'letter';
  const overlapMm = parseFloat(options.overlapMm) || 0;
  const showTrimLines = options.showTrimLines !== false;
  const showSeamCrosshairs = options.showSeamCrosshairs !== false;
  const showTileStamps = options.showTileStamps !== false;
  const stencilMode = options.stencilMode === true || options.renderStyle === 'stencil';

  const matrix = matrixInfo || calculateFiducialTilingMatrix(targetEdgeM, paperFormat, overlapMm);
  const rows = matrix.rows || 1;
  const cols = matrix.cols || 1;

  // Viewport setup (normalized 500x500 for single sheet canvas)
  const totalCanvasSize = 500;
  const margin = 40;
  const headerHeight = 40;
  const footerHeight = 40;
  const printableWidth = totalCanvasSize - (margin * 2); // 420
  const printableHeight = totalCanvasSize - headerHeight - footerHeight; // 420 (square 420x420)

  // Get raw marker vector primitives
  const { markerContent, cornerTicksSvg, crosshairSvg, margin: targetOrigin, targetSize, totalSize } = getFiducialMarkerVectorContent(options);

  // Target coordinates: target is placed at [50, 50] with width 400 and height 400.
  const sliceSize = targetSize / cols;
  const nominalX = targetOrigin + col * sliceSize;
  const nominalY = targetOrigin + row * sliceSize;

  // Overlap bleed in target vector units
  const normOverlap = (overlapMm / (matrix.targetMm || (targetEdgeM * 1000))) * targetSize;
  const bleedLeft = col > 0 ? normOverlap : 0;
  const bleedRight = col < cols - 1 ? normOverlap : 0;
  const bleedTop = row > 0 ? normOverlap : 0;
  const bleedBottom = row < rows - 1 ? normOverlap : 0;

  const vbX = nominalX - bleedLeft;
  const vbY = nominalY - bleedTop;
  const vbW = sliceSize + bleedLeft + bleedRight;
  const vbH = sliceSize + bleedTop + bleedBottom;

  // Dashed trim line overlays
  let trimLinesSvg = '';
  if (showTrimLines && overlapMm > 0) {
    if (col > 0) {
      const x = margin + (bleedLeft / vbW) * printableWidth;
      trimLinesSvg += `<line x1="${x}" y1="${headerHeight}" x2="${x}" y2="${headerHeight + printableHeight}" stroke="#d97706" stroke-width="1.5" stroke-dasharray="5,4" />`;
    }
    if (col < cols - 1) {
      const x = margin + (1 - bleedRight / vbW) * printableWidth;
      trimLinesSvg += `<line x1="${x}" y1="${headerHeight}" x2="${x}" y2="${headerHeight + printableHeight}" stroke="#d97706" stroke-width="1.5" stroke-dasharray="5,4" />`;
    }
    if (row > 0) {
      const y = headerHeight + (bleedTop / vbH) * printableHeight;
      trimLinesSvg += `<line x1="${margin}" y1="${y}" x2="${margin + printableWidth}" y2="${y}" stroke="#d97706" stroke-width="1.5" stroke-dasharray="5,4" />`;
    }
    if (row < rows - 1) {
      const y = headerHeight + (1 - bleedBottom / vbH) * printableHeight;
      trimLinesSvg += `<line x1="${margin}" y1="${y}" x2="${margin + printableWidth}" y2="${y}" stroke="#d97706" stroke-width="1.5" stroke-dasharray="5,4" />`;
    }
  }

  // Seam alignment crosshairs & registration marks along trim lines / seams
  let seamCrosshairsSvg = '';
  if (showSeamCrosshairs) {
    const leftX = col > 0 && overlapMm > 0 ? margin + (bleedLeft / vbW) * printableWidth : (col > 0 ? margin : null);
    const rightX = col < cols - 1 && overlapMm > 0 ? margin + (1 - bleedRight / vbW) * printableWidth : (col < cols - 1 ? margin + printableWidth : null);
    const topY = row > 0 && overlapMm > 0 ? headerHeight + (bleedTop / vbH) * printableHeight : (row > 0 ? headerHeight : null);
    const bottomY = row < rows - 1 && overlapMm > 0 ? headerHeight + (1 - bleedBottom / vbH) * printableHeight : (row < rows - 1 ? headerHeight + printableHeight : null);
    const midX = margin + printableWidth / 2;
    const midY = headerHeight + printableHeight / 2;

    const crosshairs = [];
    if (leftX !== null) crosshairs.push({ x: leftX, y: midY });
    if (rightX !== null) crosshairs.push({ x: rightX, y: midY });
    if (topY !== null) crosshairs.push({ x: midX, y: topY });
    if (bottomY !== null) crosshairs.push({ x: midX, y: bottomY });

    if (leftX !== null && topY !== null) crosshairs.push({ x: leftX, y: topY });
    if (rightX !== null && topY !== null) crosshairs.push({ x: rightX, y: topY });
    if (leftX !== null && bottomY !== null) crosshairs.push({ x: leftX, y: bottomY });
    if (rightX !== null && bottomY !== null) crosshairs.push({ x: rightX, y: bottomY });

    let marks = '';
    for (const ch of crosshairs) {
      marks += `
        <g stroke="#ef4444" stroke-width="1.5" opacity="0.9">
          <line x1="${ch.x - 7}" y1="${ch.y}" x2="${ch.x + 7}" y2="${ch.y}" />
          <line x1="${ch.x}" y1="${ch.y - 7}" x2="${ch.x}" y2="${ch.y + 7}" />
          <circle cx="${ch.x}" cy="${ch.y}" r="2.5" fill="none" stroke="#ef4444" stroke-width="1" />
        </g>
      `;
    }
    seamCrosshairsSvg = marks;
  }

  // Header and Footer info with interactive puzzle matrix diagram
  let tileStampSvg = '';
  if (showTileStamps) {
    const typeLabel = type === 'aruco_4x4' ? `ArUco 4x4 #ID:${id}` :
      (type === 'aruco_5x5' ? `ArUco 5x5 #ID:${id}` :
      (type === 'apriltag_25h9' ? `AprilTag 25h9 #ID:${id}` :
      (type === 'apriltag_36h11' ? `AprilTag 36h11 #ID:${id}` :
      (type === 'apriltag_16h5' ? `AprilTag 16h5 #ID:${id}` :
      (type === 'checkerboard' ? `Checkerboard 4x4` : `Crosshair`)))));

    const tileEdgeMm = (matrix.tileSizeMm || (targetEdgeM * 1000 / cols)).toFixed(0);
    const targetMmStr = (matrix.targetMm || (targetEdgeM * 1000)).toFixed(0);

    // Mini-map puzzle matrix icon (24x24 px)
    const mmSize = 24;
    const mmX = margin;
    const mmY = 8;
    const cellW = mmSize / cols;
    const cellH = mmSize / rows;
    let miniMapCells = '';
    for (let mr = 0; mr < rows; mr++) {
      for (let mc = 0; mc < cols; mc++) {
        const isCurrent = (mr === row && mc === col);
        const cellFill = isCurrent ? '#fbbf24' : 'rgba(255,255,255,0.2)';
        const cellStroke = isCurrent ? '#ffffff' : '#64748b';
        miniMapCells += `<rect x="${mmX + mc * cellW}" y="${mmY + mr * cellH}" width="${cellW}" height="${cellH}" fill="${cellFill}" stroke="${cellStroke}" stroke-width="0.75" />`;
      }
    }

    tileStampSvg = `
      <!-- Header Tile Stamp & Assembly Puzzle Diagram -->
      <g font-family="sans-serif">
        <rect x="0" y="0" width="${totalCanvasSize}" height="${headerHeight}" fill="#0f172a" />
        
        <!-- Assembly Puzzle Diagram Icon -->
        <g id="tile-puzzle-map">
          <rect x="${mmX - 2}" y="${mmY - 2}" width="${mmSize + 4}" height="${mmSize + 4}" fill="#1e293b" rx="2" stroke="#475569" stroke-width="0.5" />
          ${miniMapCells}
        </g>

        <!-- Tile Identification Text -->
        <text x="${mmX + mmSize + 10}" y="19" font-size="11" font-weight="700" fill="#fbbf24">${stencilMode ? 'STENCIL TILE' : 'TILE'} [Row ${row + 1} of ${rows}, Col ${col + 1} of ${cols}]</text>
        <text x="${mmX + mmSize + 10}" y="32" font-size="9" fill="#94a3b8">Sheet ${row * cols + col + 1} of ${rows * cols} | ${(tileEdgeMm)} mm / tile${stencilMode ? ' • ✂ Cutout Template' : ''}</text>

        <!-- Right Header Text -->
        <text x="${totalCanvasSize - margin}" y="20" font-size="10" font-weight="600" fill="#f1f5f9" text-anchor="end">${escapeHtml(typeLabel)}${stencilMode ? ' • STENCIL' : ''}</text>
        <text x="${totalCanvasSize - margin}" y="32" font-size="9" fill="#94a3b8" text-anchor="end">Target: ${targetMmStr} mm (${(targetEdgeM * 39.37).toFixed(1)}")</text>
      </g>

      <!-- Footer Stamp & Calibration Ruler -->
      <g font-family="sans-serif">
        <rect x="0" y="${totalCanvasSize - footerHeight}" width="${totalCanvasSize}" height="${footerHeight}" fill="#0f172a" />
        <text x="${margin}" y="${totalCanvasSize - 22}" font-size="9" font-weight="600" fill="#e2e8f0">Overlap Bleed: ${overlapMm.toFixed(2)} mm (${(overlapMm / 25.4).toFixed(2)}")</text>
        <text x="${margin}" y="${totalCanvasSize - 10}" font-size="8" fill="#94a3b8">${stencilMode ? '✂ Cut out outlined black sections with blade and spray paint onto target backing' : (overlapMm > 0 ? 'Cut along dashed orange lines before taping' : 'Zero bleed (butt joints) — tape sheets edge-to-edge')}</text>
        
        <!-- 1:1 Scale Verification Ruler (50 mm / 2 in) -->
        <g transform="translate(${totalCanvasSize - margin - 120}, ${totalCanvasSize - 30})" font-size="8" fill="#e2e8f0">
          <line x1="0" y1="12" x2="100" y2="12" stroke="#e2e8f0" stroke-width="1.5" />
          <line x1="0" y1="5" x2="0" y2="19" stroke="#e2e8f0" stroke-width="1.5" />
          <line x1="50" y1="7" x2="50" y2="17" stroke="#e2e8f0" stroke-width="1" />
          <line x1="100" y1="5" x2="100" y2="19" stroke="#e2e8f0" stroke-width="1.5" />
          <text x="50" y="3" text-anchor="middle">50 mm / 2.0 in</text>
        </g>
      </g>
    `;
  }

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalCanvasSize} ${totalCanvasSize}" width="100%" height="100%" style="background-color: #ffffff; display: block; max-width: 100%; height: auto;">
      <rect x="0" y="0" width="${totalCanvasSize}" height="${totalCanvasSize}" fill="#ffffff" />
      
      <!-- Clipped Sub-tile Target Content -->
      <svg x="${margin}" y="${headerHeight}" width="${printableWidth}" height="${printableHeight}" viewBox="${vbX} ${vbY} ${vbW} ${vbH}" preserveAspectRatio="none">
        <rect x="0" y="0" width="${totalSize}" height="${totalSize}" fill="#ffffff" />
        ${markerContent}
        ${cornerTicksSvg}
        ${crosshairSvg}
      </svg>

      <!-- Trim lines, seam crosshairs, and header/footer stamps -->
      ${trimLinesSvg}
      ${seamCrosshairsSvg}
      ${tileStampSvg}
    </svg>
  `.trim();
}

/**
 * Opens the Printable Target Generator modal.
 */
function openTargetGeneratorModal(options = {}) {
  const modal = document.getElementById('fiducial-generator-modal');
  if (!modal) return;

  const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
  const targetTypeEl = document.getElementById('gen-target-type');
  const targetIdEl = document.getElementById('gen-target-id');
  const targetSizeEl = document.getElementById('gen-target-size');

  if (targetTypeEl) targetTypeEl.value = options.type || (activeLayer ? activeLayer.defaultTargetType : 'aruco_4x4') || 'aruco_4x4';
  if (targetIdEl) targetIdEl.value = typeof options.id === 'number' ? options.id : 0;
  if (targetSizeEl) targetSizeEl.value = options.physicalSizeMeters || (activeLayer ? activeLayer.defaultPhysicalSize : 0.20) || 0.20;

  modal.classList.remove('hidden');
  renderTargetGeneratorPreview();
}

/**
 * Closes the Printable Target Generator modal.
 */
function closeTargetGeneratorModal() {
  const modal = document.getElementById('fiducial-generator-modal');
  if (modal) modal.classList.add('hidden');
}

let currentTilingSheetIndex = 0;

/**
 * Updates the interactive puzzle piece helper diagram and sheet selector controls.
 */
function updateTilingPuzzleDiagram(matrix, activeIndex) {
  const puzzleHelper = document.getElementById('gen-tiling-puzzle-helper');
  const puzzleGrid = document.getElementById('gen-tiling-puzzle-grid');
  const pageSelect = document.getElementById('gen-tiling-page-select');
  const activeTitle = document.getElementById('gen-tiling-puzzle-active-title');
  const activeDesc = document.getElementById('gen-tiling-puzzle-active-desc');

  if (!puzzleHelper || !puzzleGrid) return;

  const totalSheets = matrix.totalSheets || (matrix.rows * matrix.cols);
  const rows = matrix.rows || 1;
  const cols = matrix.cols || 1;
  const clampedIndex = Math.max(0, Math.min(activeIndex, totalSheets - 1));
  const activeRow = Math.floor(clampedIndex / cols);
  const activeCol = clampedIndex % cols;

  puzzleGrid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  puzzleGrid.style.gridTemplateRows = `repeat(${rows}, 1fr)`;

  let buttonsHtml = '';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const isActive = (idx === clampedIndex);
      const bg = isActive ? '#fbbf24' : 'rgba(255, 255, 255, 0.15)';
      const border = isActive ? '1px solid #ffffff' : '1px solid rgba(255, 255, 255, 0.15)';
      const color = isActive ? '#0f172a' : '#cbd5e1';
      buttonsHtml += `<button type="button" class="tiling-puzzle-cell-btn" data-sheet-idx="${idx}" style="background: ${bg}; border: ${border}; color: ${color}; width: 14px; height: 14px; border-radius: 2px; font-size: 8px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0;" title="Sheet ${idx + 1}: Tile [Row ${r + 1}, Col ${c + 1}]">${idx + 1}</button>`;
    }
  }
  puzzleGrid.innerHTML = buttonsHtml;

  // Attach click events to puzzle cells
  puzzleGrid.querySelectorAll('.tiling-puzzle-cell-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const newIdx = parseInt(btn.getAttribute('data-sheet-idx'), 10);
      if (!isNaN(newIdx)) {
        currentTilingSheetIndex = newIdx;
        renderTargetGeneratorPreview();
      }
    });
  });

  // Update Page Selector Dropdown
  if (pageSelect) {
    let optionsHtml = '';
    for (let idx = 0; idx < totalSheets; idx++) {
      const r = Math.floor(idx / cols);
      const c = idx % cols;
      const selected = (idx === clampedIndex) ? 'selected' : '';
      optionsHtml += `<option value="${idx}" ${selected}>Sheet ${idx + 1} of ${totalSheets} [R${r + 1}, C${c + 1}]</option>`;
    }
    pageSelect.innerHTML = optionsHtml;
  }

  // Positional text description
  let posDesc = '';
  if (rows > 1 || cols > 1) {
    const vPos = activeRow === 0 ? 'Top' : (activeRow === rows - 1 ? 'Bottom' : 'Middle');
    const hPos = activeCol === 0 ? 'Left' : (activeCol === cols - 1 ? 'Right' : 'Center');
    posDesc = (vPos === 'Middle' && hPos === 'Center') ? 'Center piece' : `${vPos}-${hPos} piece`;
  } else {
    posDesc = 'Complete target';
  }

  if (activeTitle) {
    activeTitle.textContent = `Sheet ${clampedIndex + 1} of ${totalSheets} — Tile [${activeRow + 1}, ${activeCol + 1}]`;
  }
  if (activeDesc) {
    activeDesc.textContent = `${posDesc} • Click any piece in the puzzle to preview`;
  }
}

/**
 * Renders the live SVG target preview inside the target generator modal.
 */
function renderTargetGeneratorPreview() {
  const previewEl = document.getElementById('gen-target-preview-svg');
  if (!previewEl) return;

  const type = document.getElementById('gen-target-type')?.value || 'aruco_4x4';
  const targetIdEl = document.getElementById('gen-target-id');
  let maxId = 99;
  if (type === 'apriltag_25h9') {
    maxId = 34;
  } else if (type === 'apriltag_16h5') {
    maxId = 29;
  } else if (type === 'apriltag_36h11' || type === 'aruco_4x4') {
    maxId = 49;
  } else if (type === 'aruco_5x5') {
    maxId = 99;
  }

  if (targetIdEl) {
    targetIdEl.max = String(maxId);
    const currVal = parseInt(targetIdEl.value, 10);
    if (!isNaN(currVal) && currVal > maxId) {
      targetIdEl.value = String(maxId);
    }
  }

  const id = parseInt(document.getElementById('gen-target-id')?.value, 10) || 0;
  const size = parseFloat(document.getElementById('gen-target-size')?.value) || 0.20;
  const paperFormat = document.getElementById('gen-sheet-size')?.value || 'letter';
  const showCrosshair = document.getElementById('gen-opt-crosshair')?.checked !== false;
  const showCornerTicks = document.getElementById('gen-opt-cornerticks')?.checked !== false;
  const showRuler = document.getElementById('gen-opt-ruler')?.checked !== false;
  const showIdLabel = document.getElementById('gen-opt-idlabel')?.checked !== false;

  const forceTilingEnable = document.getElementById('gen-opt-tiling-enable')?.checked === true;
  const overlapMm = parseFloat(document.getElementById('gen-tiling-overlap')?.value) || 6.35;
  const viewMode = document.getElementById('gen-tiling-view-mode')?.value || 'assembled';
  const showTrimLines = document.getElementById('gen-opt-trim-lines')?.checked !== false;
  const showSeamCrosshairs = document.getElementById('gen-opt-seam-crosshairs')?.checked !== false;
  const showTileStamps = document.getElementById('gen-opt-tile-stamps')?.checked !== false;
  const renderStyle = document.getElementById('gen-render-style')?.value || 'solid';
  const stencilMode = renderStyle === 'stencil';

  // Compute tiling matrix
  const matrix = calculateFiducialTilingMatrix(size, paperFormat, overlapMm);
  const isTiled = forceTilingEnable || matrix.requiresTiling;

  // Auto-check tiling enable checkbox if physical size > min step
  const enableCheckbox = document.getElementById('gen-opt-tiling-enable');
  if (enableCheckbox && matrix.requiresTiling && !enableCheckbox.checked) {
    enableCheckbox.checked = true;
  }

  // Update Tiling Badge & Info Text
  const matrixBadge = document.getElementById('gen-tiling-matrix-badge');
  const infoText = document.getElementById('gen-tiling-info-text');
  if (isTiled) {
    if (matrixBadge) {
      matrixBadge.textContent = `${matrix.totalSheets} Sheets (${matrix.rows} × ${matrix.cols} Grid)`;
      matrixBadge.style.background = 'rgba(245, 158, 11, 0.2)';
      matrixBadge.style.color = '#fbbf24';
    }
    if (infoText) {
      infoText.textContent = `Requires ${matrix.totalSheets} ${paperFormat.toUpperCase()} sheets (${matrix.rows}x${matrix.cols}) | Tile: ${(matrix.tileSizeMm || 300).toFixed(0)}mm`;
    }
  } else {
    if (matrixBadge) {
      matrixBadge.textContent = 'Single Sheet';
      matrixBadge.style.background = 'rgba(56, 189, 248, 0.15)';
      matrixBadge.style.color = '#38bdf8';
    }
    if (infoText) {
      infoText.textContent = `Single ${paperFormat.toUpperCase()} sheet output`;
    }
  }

  const options = {
    type,
    id,
    physicalSizeMeters: size,
    paperFormat,
    overlapMm,
    renderStyle,
    stencilMode,
    showCrosshair,
    showCornerTicks,
    showRuler,
    showIdLabel,
    showTrimLines,
    showSeamCrosshairs,
    showTileStamps
  };

  const puzzleHelper = document.getElementById('gen-tiling-puzzle-helper');
  const totalSheets = matrix.totalSheets || (matrix.rows * matrix.cols);
  currentTilingSheetIndex = Math.max(0, Math.min(currentTilingSheetIndex, totalSheets - 1));
  const activeRow = Math.floor(currentTilingSheetIndex / matrix.cols);
  const activeCol = currentTilingSheetIndex % matrix.cols;

  if (!isTiled) {
    if (puzzleHelper) puzzleHelper.style.display = 'none';
    const svgStr = generateFiducialSvg(options);
    previewEl.innerHTML = svgStr;
  } else if (viewMode === 'assembled') {
    if (puzzleHelper) puzzleHelper.style.display = 'none';
    const svgStr = generateFiducialSvg({ ...options, showTilingGrid: true, matrix });
    previewEl.innerHTML = svgStr;
  } else if (viewMode === 'tile_grid') {
    if (puzzleHelper) {
      puzzleHelper.style.display = 'flex';
      updateTilingPuzzleDiagram(matrix, currentTilingSheetIndex);
    }
    // Render HTML grid matrix of all tiles
    let gridHtml = `<div class="tiling-grid-preview-container" style="grid-template-columns: repeat(${matrix.cols}, 1fr);">`;
    for (let r = 0; r < matrix.rows; r++) {
      for (let c = 0; c < matrix.cols; c++) {
        const idx = r * matrix.cols + c;
        const isCurrent = (idx === currentTilingSheetIndex);
        const activeStyle = isCurrent ? 'border: 2px solid #fbbf24; box-shadow: 0 0 10px rgba(245, 158, 11, 0.4);' : '';
        const tileSvg = generateTiledFiducialSheetSvg(options, r, c, matrix);
        gridHtml += `
          <div class="tiling-tile-card" data-sheet-idx="${idx}" style="cursor: pointer; ${activeStyle}">
            <span class="tiling-tile-badge">Tile [${r + 1},${c + 1}] (Sheet ${idx + 1})</span>
            <div style="width: 100%; height: 100%; min-height: 120px; display: flex; align-items: center; justify-content: center;">
              ${tileSvg}
            </div>
          </div>
        `;
      }
    }
    gridHtml += `</div>`;
    previewEl.innerHTML = gridHtml;

    // Card click event in tile_grid view
    previewEl.querySelectorAll('.tiling-tile-card').forEach(card => {
      card.addEventListener('click', () => {
        const cardIdx = parseInt(card.getAttribute('data-sheet-idx'), 10);
        if (!isNaN(cardIdx)) {
          currentTilingSheetIndex = cardIdx;
          renderTargetGeneratorPreview();
        }
      });
    });
  } else {
    // Single tile preview
    if (puzzleHelper) {
      puzzleHelper.style.display = 'flex';
      updateTilingPuzzleDiagram(matrix, currentTilingSheetIndex);
    }
    const singleTileSvg = generateTiledFiducialSheetSvg(options, activeRow, activeCol, matrix);
    previewEl.innerHTML = singleTileSvg;
  }

  updateTargetGeneratorAdvisor();
}

/**
 * Downloads the currently generated target as vector SVG file(s).
 */
function exportTargetSvg() {
  const type = document.getElementById('gen-target-type')?.value || 'aruco_4x4';
  const id = parseInt(document.getElementById('gen-target-id')?.value, 10) || 0;
  const size = parseFloat(document.getElementById('gen-target-size')?.value) || 0.20;
  const paperFormat = document.getElementById('gen-sheet-size')?.value || 'letter';
  const showCrosshair = document.getElementById('gen-opt-crosshair')?.checked !== false;
  const showCornerTicks = document.getElementById('gen-opt-cornerticks')?.checked !== false;
  const showRuler = document.getElementById('gen-opt-ruler')?.checked !== false;
  const showIdLabel = document.getElementById('gen-opt-idlabel')?.checked !== false;
  const forceTilingEnable = document.getElementById('gen-opt-tiling-enable')?.checked === true;
  const overlapMm = parseFloat(document.getElementById('gen-tiling-overlap')?.value) || 6.35;
  const renderStyle = document.getElementById('gen-render-style')?.value || 'solid';
  const stencilMode = renderStyle === 'stencil';

  const matrix = calculateFiducialTilingMatrix(size, paperFormat, overlapMm);
  const isTiled = forceTilingEnable || matrix.requiresTiling;

  const options = {
    type,
    id,
    physicalSizeMeters: size,
    paperFormat,
    overlapMm,
    renderStyle,
    stencilMode,
    showCrosshair,
    showCornerTicks,
    showRuler,
    showIdLabel
  };

  const suffix = stencilMode ? '_Stencil' : '';

  if (!isTiled) {
    const svgStr = generateFiducialSvg(options);
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Target_${type}_ID${id}_${(size * 1000).toFixed(0)}mm${suffix}.svg`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } else {
    // Multi-tile export: download each tile sheet
    for (let r = 0; r < matrix.rows; r++) {
      for (let c = 0; c < matrix.cols; c++) {
        const tileSvg = generateTiledFiducialSheetSvg(options, r, c, matrix);
        const blob = new Blob([tileSvg], { type: 'image/svg+xml;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `Target_${type}_ID${id}_Tile_R${r + 1}_C${c + 1}_of_${matrix.totalSheets}${suffix}.svg`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 1000 + (r * matrix.cols + c) * 150);
      }
    }
  }
}

/**
 * Prints the target sheet using an isolated print iframe supporting multi-page `@media print` layouts.
 */
function printTargetSheet() {
  renderTargetGeneratorPreview();

  const type = document.getElementById('gen-target-type')?.value || 'aruco_4x4';
  const id = parseInt(document.getElementById('gen-target-id')?.value, 10) || 0;
  const size = parseFloat(document.getElementById('gen-target-size')?.value) || 0.20;
  const paperFormat = document.getElementById('gen-sheet-size')?.value || 'letter';
  const showCrosshair = document.getElementById('gen-opt-crosshair')?.checked !== false;
  const showCornerTicks = document.getElementById('gen-opt-cornerticks')?.checked !== false;
  const showRuler = document.getElementById('gen-opt-ruler')?.checked !== false;
  const showIdLabel = document.getElementById('gen-opt-idlabel')?.checked !== false;
  const forceTilingEnable = document.getElementById('gen-opt-tiling-enable')?.checked === true;
  const overlapMm = parseFloat(document.getElementById('gen-tiling-overlap')?.value) || 6.35;
  const renderStyle = document.getElementById('gen-render-style')?.value || 'solid';
  const stencilMode = renderStyle === 'stencil';

  const matrix = calculateFiducialTilingMatrix(size, paperFormat, overlapMm);
  const isTiled = forceTilingEnable || matrix.requiresTiling;

  const options = {
    type,
    id,
    physicalSizeMeters: size,
    paperFormat,
    overlapMm,
    renderStyle,
    stencilMode,
    showCrosshair,
    showCornerTicks,
    showRuler,
    showIdLabel
  };

  let pagesHtml = '';
  if (!isTiled) {
    const svgStr = generateFiducialSvg(options);
    pagesHtml = `
      <div class="print-target-wrapper">
        ${svgStr}
      </div>
    `;
  } else {
    // Generate multi-page tiled print sheets separated by page breaks
    for (let r = 0; r < matrix.rows; r++) {
      for (let c = 0; c < matrix.cols; c++) {
        const isLast = (r === matrix.rows - 1 && c === matrix.cols - 1);
        const pageBreakClass = isLast ? '' : 'has-break';
        const tileSvg = generateTiledFiducialSheetSvg(options, r, c, matrix);
        pagesHtml += `
          <div class="print-target-wrapper tiled-page ${pageBreakClass}">
            ${tileSvg}
          </div>
        `;
      }
    }
  }

  // Create or reuse an isolated hidden iframe for printing with explicit non-zero dimensions
  let printIframe = document.getElementById('fiducial-print-iframe');
  if (!printIframe) {
    printIframe = document.createElement('iframe');
    printIframe.id = 'fiducial-print-iframe';
    printIframe.style.position = 'fixed';
    printIframe.style.right = '0';
    printIframe.style.bottom = '0';
    printIframe.style.width = '1000px';
    printIframe.style.height = '1000px';
    printIframe.style.border = '0';
    printIframe.style.opacity = '0.01';
    printIframe.style.pointerEvents = 'none';
    printIframe.style.zIndex = '-9999';
    document.body.appendChild(printIframe);
  }

  const iframeDoc = printIframe.contentDocument || printIframe.contentWindow?.document;
  if (!iframeDoc) {
    window.print();
    return;
  }

  iframeDoc.open();
  iframeDoc.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Target_${type}_ID${id}_Print</title>
  <style>
    @page {
      size: ${paperFormat === 'a4' ? 'A4' : 'letter'} portrait;
      margin: 8mm;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .print-target-wrapper {
      width: 100%;
      height: 100%;
      max-width: 92vw;
      max-height: 92vh;
      display: flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .tiled-page {
      width: 100%;
      height: 98vh;
      box-sizing: border-box;
    }
    .tiled-page.has-break {
      page-break-after: always !important;
      break-after: page !important;
    }
    .print-target-wrapper svg {
      width: 100%;
      height: 100%;
      max-width: 100%;
      max-height: 96vh;
      display: block;
    }
  </style>
</head>
<body>
  ${pagesHtml}
</body>
</html>`);
  iframeDoc.close();

  setTimeout(() => {
    try {
      if (printIframe.contentWindow) {
        printIframe.contentWindow.focus();
        printIframe.contentWindow.print();
      } else {
        window.print();
      }
    } catch (e) {
      window.print();
    }
  }, 250);
}
 
 // Geolocation state
let userLocation = null;

// Utility functions
