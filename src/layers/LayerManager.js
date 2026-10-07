const LAYER_COLORS = [
  { name: 'Cyan', hex: '#06b6d4', bg: 'rgba(6, 182, 212, 0.15)', border: 'rgba(6, 182, 212, 0.4)' },
  { name: 'Purple', hex: '#a855f7', bg: 'rgba(168, 85, 247, 0.15)', border: 'rgba(168, 85, 247, 0.4)' },
  { name: 'Amber', hex: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.4)' },
  { name: 'Emerald', hex: '#10b981', bg: 'rgba(16, 185, 129, 0.15)', border: 'rgba(16, 185, 129, 0.4)' },
  { name: 'Pink', hex: '#ec4899', bg: 'rgba(236, 72, 153, 0.15)', border: 'rgba(236, 72, 153, 0.4)' },
  { name: 'Blue', hex: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)', border: 'rgba(59, 130, 246, 0.4)' },
  { name: 'Rose', hex: '#f43f5e', bg: 'rgba(244, 63, 94, 0.15)', border: 'rgba(244, 63, 94, 0.4)' }
];

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[m]));
}

function getPatternDisplayName(pattern) {
  const map = {
    'single': '2D Nadir Grid',
    'double': '3D Double Grid',
    'orbit': '3D Orbit',
    'multi-orbit': 'Multi-Orbit',
    'tower': '3D Tower Audit',
    'grid-orbit-combo': 'Hybrid Combo',
    'grid-multi-orbit-combo': 'Multi-Hybrid',
    'freeform': 'Freeform Plan',
    'road-following': 'Road Follow',
    'exclusion-box': '🚫 Exclusion (Box)',
    'exclusion-freeform': '🚫 Exclusion (Poly)',
    'boundary-polygon': '🗺️ Boundary / Parcel',
    'fiducial-markers': '🎯 Fiducial / GCPs'
  };
  return map[pattern] || pattern || 'Double Grid';
}

function createDefaultLayer(id, name, colorIndex = 0, pattern = 'double', centerLat = null, centerLon = null) {
  const isExcl = (pattern === 'exclusion-box' || pattern === 'exclusion-freeform');
  const isBoundary = (pattern === 'boundary-polygon');
  const isFiducial = (pattern === 'fiducial-markers');
  const isDrawing = (isBoundary || isFiducial);
  const colorObj = isExcl
    ? { name: 'Crimson', hex: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)', border: 'rgba(239, 68, 68, 0.4)' }
    : (isBoundary
        ? { name: 'Cyan', hex: '#06b6d4', bg: 'rgba(6, 182, 212, 0.15)', border: 'rgba(6, 182, 212, 0.4)' }
        : (isFiducial
            ? { name: 'Amber', hex: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.4)' }
            : LAYER_COLORS[colorIndex % LAYER_COLORS.length]));

  let cLat = centerLat;
  let cLon = centerLon;
  if (cLat === null && typeof centerMarker !== 'undefined' && centerMarker && typeof centerMarker.getLatLng === 'function') {
    const cur = centerMarker.getLatLng();
    cLat = cur.lat;
    cLon = cur.lng;
  }

  return {
    id: id || `layer-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    name: name || `Layer ${colorIndex + 1}: ${getPatternDisplayName(pattern)}`,
    enabled: true,
    color: colorObj.hex,
    colorName: colorObj.name,
    pattern: pattern,
    centerLat: cLat,
    centerLon: cLon,
    isExclusionZone: isExcl,
    isDrawingLayer: isDrawing,
    isFiducialLayer: isFiducial,
    fiducialMarkers: [],
    defaultTargetType: 'aruco_4x4',
    defaultTargetRole: 'gcp',
    defaultRole: 'gcp',
    defaultPhysicalSize: 0.50,
    markerColor: isFiducial ? '#f59e0b' : '#06b6d4',
    strokeColor: '#06b6d4',
    lineStyle: 'dashed',
    fillOpacity: 15,
    allAltitudes: true,
    minAltitude: 0,
    maxAltitude: 60,
    detourMode: 'inherit', // 'inherit', 'perimeter', 'overTop', 'smart'
    clearanceBuffer: 5,
    polygonVertices: [],
    boundaryPolygon: [],
    filteredCount: 0,
    gridWidth: 100,
    gridHeight: 100,
    gridRotation: 0,
    frontOverlap: 80,
    sideOverlap: 75,
    gimbalPitch: -60,
    altitude: 50,
    speed: 4,
    headingMode: 'inherit',
    customHeading: 0,
    pathMode: 'inherit',
    captureMode: 'inherit',
    targetPoiId: null,
    hoverTime: 'inherit',
    turnaroundOvershoot: 0,
    turnaroundSpeed: null,
    turnDampingDist: 0,
    autoSettlingEnabled: true,
    baseSettlingTime: 2.0,
    majorTurnSettlingTime: 5.0,
    moderateTurnSettlingTime: 4.0,
    pitchSettlingTime: 3.0,
    cameraZoom: 1.0,
    cameraAspectRatio: '4:3',
    roadOffset: 15,
    roadSnap: true,
    roadFocusMode: 'focusRoad',
    targetPoly: [],
    targetMode: 'radius', // 'polygon' or 'radius'
    targetRadius: 25,
    targetHeight: 8,
    targetAutoDimensions: true, // Auto-determine Width & Height from target boundary
    targetFramingMode: 'balanced', // 'balanced', 'tight', 'full'
    targetCullingMode: 'smartTrim', // 'smartTrim', 'pruneOnly', 'convergent'
    targetGridPass: 'double', // 'double' or 'single'
    targetPerimeterPass: false, // Enable perimeter orbit pass
    targetPerimeterStandoff: 8, // Meters outside polygon/radius boundary
    targetPerimeterAltitude: null, // null = auto (65% of grid alt)
    targetPerimeterPitch: -55, // Gimbal pitch for facade orbit
    targetPerimeterSpeed: null, // null = inherit layer speed
    targetPrunedCount: 0,
    targetSavedPercent: 0,
    towerMinHeight: 20,
    towerMaxHeight: 100,
    towerRadius: 30,
    towerGuyWireBuffer: 15,
    towerMovementMode: 'horizontal', // 'horizontal' or 'vertical'
    towerAltitudeOrder: 'max-to-min', // 'max-to-min' or 'min-to-max'
    photoSphereRings: { ring1: true, ring2: true, ring3: true, nadir: true },
    hyperlapseInterval: 3,
    hyperlapseStartPitch: -15,
    hyperlapseEndPitch: -15,
    hyperlapseHeadingMode: 'path', // 'path' or 'keyframes'
    hyperlapseStartHeading: 0,
    hyperlapseEndHeading: 90,
    freeformWaypoints: [],
    freeformPhotos: [],
    roadWaypoints: [],
    waypoints: [],
    photos: [],
    transition: {
      type: 'direct', // 'direct', 'climbFirst', 'safeAltitude'
      safeAltitude: 60,
      speed: null,
      dwellTime: 0,
      cameraAction: 'none'
    }
  };
}

let flightLayers = [createDefaultLayer('layer-1', 'Layer 1: 3D Double Grid', 0, 'double')];
let activeLayerId = flightLayers[0].id;

function getActiveLayer() {
  const found = flightLayers.find(l => l.id === activeLayerId);
  if (found) return found;
  if (flightLayers.length > 0) {
    activeLayerId = flightLayers[0].id;
    return flightLayers[0];
  }
  const fallback = createDefaultLayer('layer-1', 'Layer 1: 3D Double Grid', 0, 'double');
  flightLayers.push(fallback);
  activeLayerId = fallback.id;
  return fallback;
}

function getEffectiveLayerCaptureMode(layer) {
  if (layer && layer.captureMode && layer.captureMode !== 'inherit') return layer.captureMode;
  const globalEl = typeof document !== 'undefined' ? document.getElementById('capture-mode') : null;
  return (globalEl && globalEl.value) ? globalEl.value : 'stopAndShoot';
}

function getEffectiveLayerPathMode(layer) {
  if (layer && layer.pathMode && layer.pathMode !== 'inherit') return layer.pathMode;
  const globalEl = typeof document !== 'undefined' ? document.getElementById('path-mode') : null;
  return (globalEl && globalEl.value) ? globalEl.value : 'curved';
}

function getEffectiveLayerHeadingMode(layer) {
  if (layer && layer.headingMode && layer.headingMode !== 'inherit') return layer.headingMode;
  const globalEl = typeof document !== 'undefined' ? document.getElementById('heading-mode') : null;
  return (globalEl && globalEl.value) ? globalEl.value : 'followWayline';
}

function getEffectiveLayerCustomHeading(layer) {
  if (layer && layer.customHeading !== undefined && layer.customHeading !== null && layer.customHeading !== 'inherit') {
    return parseInt(layer.customHeading, 10) || 0;
  }
  const globalEl = typeof document !== 'undefined' ? document.getElementById('global-custom-heading') : null;
  return globalEl ? (parseInt(globalEl.value, 10) || 0) : 0;
}

function getEffectiveLayerHoverTime(layer) {
  if (layer && layer.hoverTime !== undefined && layer.hoverTime !== null && layer.hoverTime !== 'inherit') {
    return parseInt(layer.hoverTime, 10) || 0;
  }
  const globalEl = typeof document !== 'undefined' ? document.getElementById('global-hover-time') : null;
  return globalEl ? (parseInt(globalEl.value, 10) || 0) : 0;
}

// Safely parse gimbal pitch angles preserving 0° horizontal camera tilt without falsy-zero fallback bugs
function parseGimbalPitch(value, defaultVal = -60) {
  if (value === undefined || value === null || value === '') return defaultVal;
  const num = parseFloat(value);
  return !isNaN(num) ? num : defaultVal;
}

function getEffectiveWaypointHeadingMode(wp, layer) {
  if (wp && wp.headingMode && wp.headingMode !== 'inherit') return wp.headingMode;
  if (wp && wp.layerHeadingMode && wp.layerHeadingMode !== 'inherit') return wp.layerHeadingMode;
  const resolvedLayer = layer || (wp && wp.layerId && typeof flightLayers !== 'undefined' ? flightLayers.find(l => l.id === wp.layerId) : null) || ((typeof getActiveLayer === 'function') ? getActiveLayer() : null);
  return getEffectiveLayerHeadingMode(resolvedLayer);
}

function getHorizontalDistanceMeters(lat1, lon1, lat2, lon2) {
  if (lat1 === undefined || lon1 === undefined || lat2 === undefined || lon2 === undefined) return 50;
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calculate3DPoiPitch(wp, targetPoi, defaultAlt = 50) {
  if (!targetPoi) return -45;
  let d;
  if (wp && wp.x !== undefined && targetPoi.x !== undefined) {
    d = Math.hypot(wp.x - targetPoi.x, wp.y - targetPoi.y);
  } else if (wp && wp.lat !== undefined && wp.lon !== undefined && targetPoi.lat !== undefined && targetPoi.lon !== undefined) {
    d = getHorizontalDistanceMeters(wp.lat, wp.lon, targetPoi.lat, targetPoi.lon);
  }
  if (d === undefined || isNaN(d) || d < 0.1) d = 50;
  const wpAlt = (wp && wp.alt !== undefined && !isNaN(wp.alt)) ? wp.alt : defaultAlt;
  const poiAlt = (targetPoi && targetPoi.alt !== undefined && !isNaN(targetPoi.alt)) ? Number(targetPoi.alt) : 0;
  const deltaZ = wpAlt - poiAlt;
  let pitch = -Math.atan2(deltaZ, Math.max(1, d)) * (180 / Math.PI);
  pitch = Math.max(-90, Math.min(60, Math.round(pitch * 10) / 10));
  if (pitch === 0 || Object.is(pitch, -0)) pitch = 0;
  return pitch;
}

function getTargetPoiCoordinates(wp, layer) {
  const wpLayer = (wp && wp.layerId && typeof flightLayers !== 'undefined') ? flightLayers.find(l => l.id === wp.layerId) : null;
  const resolvedLayer = wpLayer || layer || ((typeof getActiveLayer === 'function') ? getActiveLayer() : null);
  const poiList = (typeof pois !== 'undefined' && Array.isArray(pois)) ? pois : [];
  
  // 1. Waypoint Explicit Target POI ID (Tier 3)
  if (wp && wp.targetPoiId && wp.targetPoiId !== 'inherit' && poiList.length > 0) {
    const found = poiList.find(p => p.id === wp.targetPoiId);
    if (found && found.lat !== undefined && (found.lon !== undefined || found.lng !== undefined)) {
      return {
        lat: found.lat,
        lon: found.lon !== undefined ? found.lon : found.lng,
        alt: (found.alt !== undefined && !isNaN(found.alt)) ? Number(found.alt) : 0,
        x: found.x,
        y: found.y,
        id: found.id,
        name: found.name
      };
    }
  }
  
  // 2. Waypoint Explicit POI Index (Tier 3 override)
  if (wp && wp.poiIndex !== undefined && wp.poiIndex !== null && (!wp.targetPoiId || wp.targetPoiId !== 'inherit')) {
    const poiIdx = wp.poiIndex;
    if (poiList[poiIdx] && poiList[poiIdx].lat !== undefined && (poiList[poiIdx].lon !== undefined || poiList[poiIdx].lng !== undefined)) {
      if (wp.isModified || wp.headingMode === 'towardPOI' || !resolvedLayer || !resolvedLayer.targetPoiId || resolvedLayer.targetPoiId === 'inherit') {
        const p = poiList[poiIdx];
        return {
          lat: p.lat,
          lon: p.lon !== undefined ? p.lon : p.lng,
          alt: (p.alt !== undefined && !isNaN(p.alt)) ? Number(p.alt) : 0,
          x: p.x,
          y: p.y,
          id: p.id,
          name: p.name
        };
      }
    }
  }

  // 3. Layer Target POI ID (Tier 2)
  const layerTargetPoiId = resolvedLayer && resolvedLayer.targetPoiId;
  if (layerTargetPoiId && layerTargetPoiId !== 'inherit' && poiList.length > 0) {
    const found = poiList.find(p => p.id === layerTargetPoiId);
    if (found && found.lat !== undefined && (found.lon !== undefined || found.lng !== undefined)) {
      return {
        lat: found.lat,
        lon: found.lon !== undefined ? found.lon : found.lng,
        alt: (found.alt !== undefined && !isNaN(found.alt)) ? Number(found.alt) : 0,
        x: found.x,
        y: found.y,
        id: found.id,
        name: found.name
      };
    }
  }

  // 4. Any remaining wp.poiIndex fallback
  const poiIdx = (wp && wp.poiIndex !== undefined && wp.poiIndex !== null && (!wp.targetPoiId || wp.targetPoiId !== 'inherit')) ? wp.poiIndex : 0;
  if (poiList[poiIdx] && poiList[poiIdx].lat !== undefined && (poiList[poiIdx].lon !== undefined || poiList[poiIdx].lng !== undefined)) {
    const p = poiList[poiIdx];
    return {
      lat: p.lat,
      lon: p.lon !== undefined ? p.lon : p.lng,
      alt: (p.alt !== undefined && !isNaN(p.alt)) ? Number(p.alt) : 0,
      x: p.x,
      y: p.y,
      id: p.id,
      name: p.name
    };
  }
  
  // 5. Fallback to first POI (Tier 1)
  if (poiList.length > 0 && poiList[0].lat !== undefined && (poiList[0].lon !== undefined || poiList[0].lng !== undefined)) {
    const p = poiList[0];
    return {
      lat: p.lat,
      lon: p.lon !== undefined ? p.lon : p.lng,
      alt: (p.alt !== undefined && !isNaN(p.alt)) ? Number(p.alt) : 0,
      x: p.x,
      y: p.y,
      id: p.id,
      name: p.name
    };
  }
  
  // 6. Fallback to center marker
  if (typeof centerMarker !== 'undefined' && centerMarker && typeof centerMarker.getLatLng === 'function') {
    const ll = centerMarker.getLatLng();
    if (ll && !isNaN(ll.lat) && !isNaN(ll.lng)) {
      return {
        lat: ll.lat,
        lon: ll.lng,
        alt: (poiList[0] && poiList[0].alt !== undefined && !isNaN(poiList[0].alt)) ? Number(poiList[0].alt) : 0,
        x: 0,
        y: 0,
        id: 'center',
        name: 'Center'
      };
    }
  }
  
  return null;
}

function getEffectiveWaypointHeading(wp, idx, waypoints, rotationDeg = 0, tempHeading = null, layer = null) {
  if (tempHeading !== undefined && tempHeading !== null && !isNaN(tempHeading)) {
    return tempHeading;
  }
  const effectiveMode = getEffectiveWaypointHeadingMode(wp, layer);
  
  if (effectiveMode === 'towardPOI') {
    const targetPoi = getTargetPoiCoordinates(wp, layer);
    if (targetPoi && wp && wp.lat !== undefined && wp.lon !== undefined) {
      const dy = targetPoi.lat - wp.lat;
      const dx = targetPoi.lon - wp.lon;
      return (90 - (Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360;
    }
    return 0;
  }
  
  if (effectiveMode === 'fixed') {
    return 0;
  }
  
  if (effectiveMode === 'custom') {
    if (wp && wp.heading !== null && wp.heading !== undefined && !isNaN(wp.heading)) {
      return wp.heading;
    }
    const resolvedLayer = layer || (wp && wp.layerId && typeof flightLayers !== 'undefined' ? flightLayers.find(l => l.id === wp.layerId) : null) || ((typeof getActiveLayer === 'function') ? getActiveLayer() : null);
    return getEffectiveLayerCustomHeading(resolvedLayer);
  }
  
  // Default: followWayline / smoothTransition / inherit
  if (wp && wp.heading !== null && wp.heading !== undefined && !isNaN(wp.heading)) {
    return wp.heading;
  }
  return (typeof getDefaultHeading === 'function') ? getDefaultHeading(idx, waypoints, rotationDeg) : 0;
}

function updateLayerHierarchyBadge() {
  if (typeof document === 'undefined' || !document || !document.getElementById) return;
  const badge = document.getElementById('layer-hierarchy-status-badge');
  if (!badge) return;

  const layer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
  if (!layer || layer.pattern === 'photo-sphere') {
    badge.style.display = 'none';
    badge.textContent = '';
    return;
  }

  // Check current UI selections if available, otherwise fallback to layer model properties
  const headingMode = document.getElementById('layer-heading-mode')?.value || layer.headingMode || 'inherit';
  const pathMode = document.getElementById('layer-path-mode')?.value || layer.pathMode || 'inherit';
  const captureMode = document.getElementById('layer-capture-mode')?.value || layer.captureMode || 'inherit';
  const hoverMode = document.getElementById('layer-hover-time-mode')?.value;
  const hoverVal = hoverMode ? (hoverMode === 'custom' ? 'custom' : 'inherit') : ((layer.hoverTime !== 'inherit' && layer.hoverTime !== undefined && layer.hoverTime !== null) ? 'custom' : 'inherit');
  const detourMode = document.getElementById('exclusion-detour-mode')?.value || layer.detourMode || 'inherit';

  const overrides = [];
  if (headingMode !== 'inherit') overrides.push('Heading');
  if (pathMode !== 'inherit') overrides.push('Path Type');
  if (captureMode !== 'inherit') overrides.push('Capture Mode');
  if (hoverVal !== 'inherit') overrides.push('Hover Dwell');
  if (layer.isExclusionZone && detourMode !== 'inherit') overrides.push('Detour Mode');

  if (overrides.length === 0) {
    badge.style.display = 'none';
    badge.textContent = '';
    badge.title = 'Layer inherits all flight parameters from Tier 1 Global Defaults.';
    badge.classList.remove('has-overrides');
  } else {
    badge.style.display = 'inline-flex';
    badge.textContent = overrides.length === 1 ? '⚡ 1 Override' : `⚡ Layer Overrides (${overrides.length})`;
    badge.title = `Active overrides: ${overrides.join(', ')}. Diverges from Tier 1 Global Defaults. Click to view layer dynamics.`;
    badge.classList.add('has-overrides');
    badge.style.background = 'rgba(245, 158, 11, 0.15)';
    badge.style.color = '#fbbf24';
    badge.style.borderColor = 'rgba(245, 158, 11, 0.3)';
  }
}

function updateInheritOptionLabels() {
  if (typeof document === 'undefined') return;

  const globalCaptureModeEl = document.getElementById('capture-mode');
  const globalPathModeEl = document.getElementById('path-mode');
  const globalHeadingModeEl = document.getElementById('heading-mode');
  const globalHoverTimeEl = document.getElementById('global-hover-time');

  const captureOpt = document.getElementById('layer-capture-mode-inherit-opt');
  if (captureOpt && globalCaptureModeEl) {
    const mapName = {
      'stopAndShoot': 'Stop & Shoot',
      'continuous': 'Continuous Flight',
      'video': 'Video Mode'
    };
    const resolved = mapName[globalCaptureModeEl.value] || globalCaptureModeEl.value;
    captureOpt.textContent = `🌐 Inherit Global (${resolved})`;
  }

  const pathOpt = document.getElementById('layer-path-mode-inherit-opt');
  if (pathOpt && globalPathModeEl) {
    const mapPath = {
      'curved': 'Curved Path',
      'straight': 'Straight Lines'
    };
    const resolved = mapPath[globalPathModeEl.value] || globalPathModeEl.value;
    pathOpt.textContent = `🌐 Inherit Global (${resolved})`;
  }

  const headingOpt = document.getElementById('layer-heading-mode-inherit-opt');
  if (headingOpt && globalHeadingModeEl) {
    const globalCustomHeadingEl = document.getElementById('global-custom-heading');
    const globalCustomAngle = globalCustomHeadingEl ? (parseInt(globalCustomHeadingEl.value, 10) || 0) : 0;
    const mapHeading = {
      'followWayline': 'Follow Flight Path',
      'fixed': 'Fixed North',
      'towardPOI': 'Point of Interest',
      'custom': `Custom (${globalCustomAngle}°)`
    };
    const resolved = mapHeading[globalHeadingModeEl.value] || globalHeadingModeEl.value;
    headingOpt.textContent = `🌐 Inherit Global (${resolved})`;
  }

  const hoverOpt = document.getElementById('layer-hover-time-inherit-opt');
  if (hoverOpt && globalHoverTimeEl) {
    hoverOpt.textContent = `🌐 Inherit Global (${globalHoverTimeEl.value}s)`;
  }

  const turnSpeedOpt = document.getElementById('layer-turnaround-speed-inherit-opt');
  if (turnSpeedOpt) {
    const layer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
    const speedEl = document.getElementById('speed');
    const resolvedSpeed = (layer && layer.speed !== undefined && layer.speed !== null && !isNaN(layer.speed))
      ? layer.speed
      : (speedEl ? (parseFloat(speedEl.value) || 4.0) : 4.0);
    turnSpeedOpt.textContent = `🌐 Inherit Layer Speed (${resolvedSpeed.toFixed(1)} m/s)`;
  }

  const detourOpt = document.getElementById('exclusion-detour-mode-inherit-opt');
  const globalDetourEl = document.getElementById('global-exclusion-detour-mode');
  if (detourOpt && (globalDetourEl || typeof globalExclusionDetourMode !== 'undefined')) {
    const rawDetour = globalDetourEl ? globalDetourEl.value : globalExclusionDetourMode;
    const mapDetour = {
      'perimeter': 'Around Perimeter',
      'overTop': 'Over the Top',
      'smart': 'Smart 3D'
    };
    const resolved = mapDetour[rawDetour] || rawDetour;
    detourOpt.textContent = `🌐 Inherit Global (${resolved})`;
  }

  if (typeof updateLayerHierarchyBadge === 'function') {
    updateLayerHierarchyBadge();
  }
}

function updateLayerPoiSelectOptions() {
  if (typeof document === 'undefined') return;
  const select = document.getElementById('layer-poi-select');
  if (!select) return;
  const currentVal = select.value;
  let defaultLabel = '🌐 Nearest / Mission Default POI';
  if (typeof pois !== 'undefined' && Array.isArray(pois) && pois.length > 0) {
    const firstPoiName = pois[0].name || 'POI 1';
    defaultLabel = `🌐 Nearest / Mission Default POI (${firstPoiName})`;
  }
  select.innerHTML = `<option value="">${defaultLabel}</option>`;
  if (typeof pois !== 'undefined' && Array.isArray(pois)) {
    pois.forEach((poi, idx) => {
      const opt = document.createElement('option');
      opt.value = poi.id || `poi-${idx}`;
      opt.textContent = poi.name || `POI ${idx + 1}`;
      select.appendChild(opt);
    });
  }
  select.value = currentVal;
}

function saveActiveLayerFromUi() {
  const layer = getActiveLayer();
  if (!layer) return;

  if (typeof document === 'undefined') return;

  const gridTypeEl = document.getElementById('grid-type');
  const gridWidthEl = document.getElementById('grid-width');
  const gridHeightEl = document.getElementById('grid-height');
  const gridRotationEl = document.getElementById('grid-rotation');
  const frontOverlapEl = document.getElementById('front-overlap');
  const sideOverlapEl = document.getElementById('side-overlap');
  const altitudeEl = document.getElementById('altitude');
  const speedEl = document.getElementById('speed');
  const gimbalPitchEl = document.getElementById('gimbal-pitch');

  // Layer-Specific Flight & Capture Modes (Section 2)
  const layerCaptureModeEl = document.getElementById('layer-capture-mode');
  const layerPathModeEl = document.getElementById('layer-path-mode');
  const layerHeadingModeEl = document.getElementById('layer-heading-mode');
  const layerPoiSelectEl = document.getElementById('layer-poi-select');
  const layerTurnOvershootEl = document.getElementById('layer-turnaround-overshoot');
  const layerTurnSpeedEl = document.getElementById('layer-turnaround-speed');
  const layerCornerDampingEl = document.getElementById('layer-corner-damping');
  const layerHoverModeEl = document.getElementById('layer-hover-time-mode');
  const layerHoverSliderEl = document.getElementById('layer-hover-time-slider');
  const layerAutoSettlingToggleEl = document.getElementById('layer-auto-settling-toggle');
  const layerBaseSettlingEl = document.getElementById('layer-base-settling-slider');
  const layerMajorTurnSettlingEl = document.getElementById('layer-major-turn-settling-slider');
  const layerModTurnSettlingEl = document.getElementById('layer-mod-turn-settling-slider');
  const layerPitchSettlingEl = document.getElementById('layer-pitch-settling-slider');

  // Fallbacks from Section 3
  const headingModeEl = document.getElementById('heading-mode');
  const pathModeEl = document.getElementById('path-mode');
  const captureModeEl = document.getElementById('capture-mode');
  const hoverTimeEl = document.getElementById('global-hover-time');

  const cameraZoomEl = document.getElementById('camera-zoom');
  const roadOffsetEl = document.getElementById('road-offset');
  const roadSnapEl = document.getElementById('road-snap');
  const exclAllAltEl = document.getElementById('exclusion-all-altitudes');
  const exclMinAltEl = document.getElementById('exclusion-min-alt');
  const exclMaxAltEl = document.getElementById('exclusion-max-alt');

  const exclDetourModeEl = document.getElementById('exclusion-detour-mode');
  const exclClearanceEl = document.getElementById('exclusion-clearance-buffer');
  const globalDetourModeEl = document.getElementById('global-exclusion-detour-mode');
  const globalClearanceEl = document.getElementById('global-exclusion-clearance-buffer');

  if (gridTypeEl && gridTypeEl.value) {
    layer.pattern = gridTypeEl.value;
    layer.isExclusionZone = (layer.pattern === 'exclusion-box' || layer.pattern === 'exclusion-freeform');
    layer.isDrawingLayer = (layer.pattern === 'boundary-polygon' || layer.pattern === 'fiducial-markers');
    layer.isFiducialLayer = (layer.pattern === 'fiducial-markers');
  }
  const fTypeEl = document.getElementById('fiducial-default-type');
  const fRoleEl = document.getElementById('fiducial-default-role');
  const fSizeEl = document.getElementById('fiducial-default-size');
  const fColorEl = document.getElementById('fiducial-marker-color');
  if (fTypeEl && fTypeEl.value) layer.defaultTargetType = fTypeEl.value;
  if (fRoleEl && fRoleEl.value) layer.defaultTargetRole = fRoleEl.value;
  if (fSizeEl && fSizeEl.value) layer.defaultPhysicalSize = parseFloat(fSizeEl.value) || 0.50;
  if (fColorEl && fColorEl.value) layer.markerColor = fColorEl.value;

  const bColorEl = document.getElementById('boundary-stroke-color');
  const bStyleEl = document.getElementById('boundary-line-style');
  const bOpacityEl = document.getElementById('boundary-fill-opacity');
  const bElevEl = document.getElementById('boundary-elevation');
  if (bColorEl && bColorEl.value) layer.strokeColor = bColorEl.value;
  if (bStyleEl && bStyleEl.value) layer.lineStyle = bStyleEl.value;
  if (bOpacityEl && bOpacityEl.value) layer.fillOpacity = parseInt(bOpacityEl.value, 10) || 15;
  if (bElevEl && bElevEl.value) layer.targetHeight = parseFloat(bElevEl.value) || 0;
  if (gridWidthEl) layer.gridWidth = parseFloat(gridWidthEl.value) || 100;
  if (gridHeightEl) layer.gridHeight = parseFloat(gridHeightEl.value) || 100;
  if (gridRotationEl) layer.gridRotation = parseFloat(gridRotationEl.value) || 0;
  if (frontOverlapEl) layer.frontOverlap = parseFloat(frontOverlapEl.value) || 80;
  if (sideOverlapEl) layer.sideOverlap = parseFloat(sideOverlapEl.value) || 75;
  if (altitudeEl) layer.altitude = parseFloat(altitudeEl.value) || 50;
  if (speedEl) layer.speed = parseFloat(speedEl.value) || 4;
  if (gimbalPitchEl) layer.gimbalPitch = parseGimbalPitch(gimbalPitchEl.value, -60);

  if (layerCaptureModeEl && layerCaptureModeEl.value) {
    layer.captureMode = layerCaptureModeEl.value;
  } else if (captureModeEl && captureModeEl.value && layer.captureMode === undefined) {
    layer.captureMode = captureModeEl.value;
  }

  if (layerPathModeEl && layerPathModeEl.value) {
    layer.pathMode = layerPathModeEl.value;
  } else if (pathModeEl && pathModeEl.value && layer.pathMode === undefined) {
    layer.pathMode = pathModeEl.value;
  }

  if (layerHeadingModeEl && layerHeadingModeEl.value) {
    layer.headingMode = layerHeadingModeEl.value;
  } else if (headingModeEl && headingModeEl.value && layer.headingMode === undefined) {
    layer.headingMode = headingModeEl.value;
  }

  const layerCustomHeadingEl = document.getElementById('layer-custom-heading');
  if (layerCustomHeadingEl) {
    layer.customHeading = parseInt(layerCustomHeadingEl.value, 10) || 0;
  }

  if (layerPoiSelectEl) {
    layer.targetPoiId = layerPoiSelectEl.value || null;
  }

  if (layerTurnOvershootEl) {
    layer.turnaroundOvershoot = parseFloat(layerTurnOvershootEl.value) || 0;
  }
  if (layerTurnSpeedEl) {
    layer.turnaroundSpeed = (layerTurnSpeedEl.value === 'inherit' || !layerTurnSpeedEl.value) ? null : parseFloat(layerTurnSpeedEl.value);
  }
  if (layerCornerDampingEl) {
    layer.turnDampingDist = parseFloat(layerCornerDampingEl.value) || 0;
  }

  if (layerHoverModeEl) {
    if (layerHoverModeEl.value === 'inherit') {
      layer.hoverTime = 'inherit';
    } else if (layerHoverSliderEl) {
      layer.hoverTime = parseInt(layerHoverSliderEl.value, 10) || 0;
    }
  } else if (hoverTimeEl && layer.hoverTime === undefined) {
    layer.hoverTime = parseInt(hoverTimeEl.value, 10) || 0;
  }

  if (layerAutoSettlingToggleEl) {
    layer.autoSettlingEnabled = layerAutoSettlingToggleEl.checked;
  }
  if (layerBaseSettlingEl) {
    layer.baseSettlingTime = parseFloat(layerBaseSettlingEl.value) || 2.0;
  }
  if (layerMajorTurnSettlingEl) {
    layer.majorTurnSettlingTime = parseFloat(layerMajorTurnSettlingEl.value) || 5.0;
  }
  if (layerModTurnSettlingEl) {
    layer.moderateTurnSettlingTime = parseFloat(layerModTurnSettlingEl.value) || 4.0;
  }
  if (layerPitchSettlingEl) {
    layer.pitchSettlingTime = parseFloat(layerPitchSettlingEl.value) || 3.0;
  }

  if (cameraZoomEl) layer.cameraZoom = parseFloat(cameraZoomEl.value) || 1.0;
  const cameraAspectEl = document.getElementById('camera-aspect-ratio');
  if (cameraAspectEl && cameraAspectEl.value) layer.cameraAspectRatio = cameraAspectEl.value;
  if (roadOffsetEl) layer.roadOffset = parseFloat(roadOffsetEl.value) || 15;
  if (roadSnapEl) layer.roadSnap = roadSnapEl.checked;
  const roadFocusModeEl = document.getElementById('road-focus-mode');
  if (roadFocusModeEl && roadFocusModeEl.value) layer.roadFocusMode = roadFocusModeEl.value;
  if (exclAllAltEl) layer.allAltitudes = exclAllAltEl.checked;
  if (exclMinAltEl) layer.minAltitude = parseFloat(exclMinAltEl.value) || 0;
  if (exclMaxAltEl) layer.maxAltitude = parseFloat(exclMaxAltEl.value) || 60;
  if (exclDetourModeEl && exclDetourModeEl.value) layer.detourMode = exclDetourModeEl.value;
  if (exclClearanceEl) layer.clearanceBuffer = parseFloat(exclClearanceEl.value) || 5;

  const targetRadiusEl = document.getElementById('target-splat-radius');
  const targetHeightEl = document.getElementById('target-splat-height');
  const targetCullingEl = document.getElementById('target-splat-culling-mode');
  const targetGridPassEl = document.getElementById('target-splat-grid-pass');
  const targetFramingEl = document.getElementById('target-splat-framing-mode');
  if (targetRadiusEl) layer.targetRadius = parseFloat(targetRadiusEl.value) || 25;
  if (targetHeightEl) layer.targetHeight = parseFloat(targetHeightEl.value) || 8;
  if (targetCullingEl && targetCullingEl.value) layer.targetCullingMode = targetCullingEl.value;
  if (targetGridPassEl && targetGridPassEl.value) layer.targetGridPass = targetGridPassEl.value;
  if (targetFramingEl && targetFramingEl.value) layer.targetFramingMode = targetFramingEl.value;

  const perimPassEl = document.getElementById('target-perimeter-pass');
  const perimStandoffEl = document.getElementById('target-perimeter-standoff');
  const perimAltEl = document.getElementById('target-perimeter-alt');
  const perimPitchEl = document.getElementById('target-perimeter-pitch');
  if (perimPassEl) layer.targetPerimeterPass = perimPassEl.checked;
  if (perimStandoffEl) layer.targetPerimeterStandoff = parseFloat(perimStandoffEl.value) || 8;
  if (perimAltEl) {
    const rawAlt = parseFloat(perimAltEl.value);
    layer.targetPerimeterAltitude = (rawAlt === 0 || isNaN(rawAlt)) ? null : rawAlt;
  }
  if (perimPitchEl) layer.targetPerimeterPitch = parseFloat(perimPitchEl.value) || -55;

  const towerMinH = document.getElementById('tower-min-height');
  const towerMaxH = document.getElementById('tower-max-height');
  const towerRad = document.getElementById('tower-radius');
  const towerGuyBuf = document.getElementById('tower-guy-wire-buffer');
  const towerMovMode = document.getElementById('tower-movement-mode');
  const towerAltOrd = document.getElementById('tower-altitude-order');
  if (towerMinH) layer.towerMinHeight = parseFloat(towerMinH.value) || 20;
  if (towerMaxH) layer.towerMaxHeight = parseFloat(towerMaxH.value) || 100;
  if (towerRad) {
    const parsedRad = parseFloat(towerRad.value);
    layer.towerRadius = (!isNaN(parsedRad) && parsedRad >= 1) ? parsedRad : 1;
  }
  if (towerGuyBuf) layer.towerGuyWireBuffer = parseFloat(towerGuyBuf.value) || 0;
  if (towerMovMode && towerMovMode.value) layer.towerMovementMode = towerMovMode.value;
  if (towerAltOrd && towerAltOrd.value) layer.towerAltitudeOrder = towerAltOrd.value;
  const psR1 = document.getElementById('photo-sphere-ring-1');
  const psR2 = document.getElementById('photo-sphere-ring-2');
  const psR3 = document.getElementById('photo-sphere-ring-3');
  const psNadir = document.getElementById('photo-sphere-ring-nadir');
  if (psR1 || psR2 || psR3 || psNadir) {
    layer.photoSphereRings = {
      ring1: psR1 ? psR1.checked : true,
      ring2: psR2 ? psR2.checked : true,
      ring3: psR3 ? psR3.checked : true,
      nadir: psNadir ? psNadir.checked : true
    };
    if (!layer.photoSphereRings.ring1 && !layer.photoSphereRings.ring2 && !layer.photoSphereRings.ring3 && !layer.photoSphereRings.nadir) {
      layer.photoSphereRings.ring1 = true;
      if (psR1) psR1.checked = true;
    }
  }

  const hlInterval = document.getElementById('hyperlapse-interval');
  const hlStartPitch = document.getElementById('hyperlapse-start-pitch');
  const hlEndPitch = document.getElementById('hyperlapse-end-pitch');
  const hlHeadingMode = document.getElementById('hyperlapse-heading-mode');
  const hlStartHeading = document.getElementById('hyperlapse-start-heading');
  const hlEndHeading = document.getElementById('hyperlapse-end-heading');
  if (hlInterval) {
    const val = parseInt(hlInterval.value, 10);
    layer.hyperlapseInterval = (!isNaN(val) && val >= 2 && val <= 10) ? val : 3;
  }
  if (hlStartPitch) layer.hyperlapseStartPitch = parseInt(hlStartPitch.value, 10) || -15;
  if (hlEndPitch) layer.hyperlapseEndPitch = parseInt(hlEndPitch.value, 10) || -15;
  if (hlHeadingMode && hlHeadingMode.value) layer.hyperlapseHeadingMode = hlHeadingMode.value;
  if (hlStartHeading) layer.hyperlapseStartHeading = parseFloat(hlStartHeading.value) || 0;
  if (hlEndHeading) layer.hyperlapseEndHeading = parseFloat(hlEndHeading.value) || 90;

  if (globalDetourModeEl && globalDetourModeEl.value) {
    globalExclusionDetourMode = globalDetourModeEl.value;
  }
  if (globalClearanceEl) {
    globalExclusionClearanceBuffer = parseFloat(globalClearanceEl.value) || 5;
  }
  if (typeof updateLayerHierarchyBadge === 'function') {
    updateLayerHierarchyBadge();
  }
}

function syncUiWithActiveLayer() {
  const layer = getActiveLayer();
  if (!layer || typeof document === 'undefined') return;

  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el && val !== undefined && val !== null) el.value = val;
  };

  updateInheritOptionLabels();
  updateLayerPoiSelectOptions();

  setVal('grid-type', layer.pattern);
  setVal('grid-width', layer.gridWidth);
  setVal('grid-height', layer.gridHeight);
  setVal('grid-rotation', layer.gridRotation);
  setVal('front-overlap', layer.frontOverlap);
  setVal('side-overlap', layer.sideOverlap);
  setVal('altitude', layer.altitude);
  setVal('speed', layer.speed);
  setVal('gimbal-pitch', layer.gimbalPitch);

  // Section 2 Layer Controls
  setVal('layer-capture-mode', layer.captureMode || 'inherit');
  setVal('layer-path-mode', layer.pathMode || 'inherit');
  setVal('layer-heading-mode', layer.headingMode || 'inherit');
  setVal('layer-poi-select', layer.targetPoiId || '');
  setVal('layer-turnaround-overshoot', layer.turnaroundOvershoot !== undefined ? layer.turnaroundOvershoot : 0);
  setVal('layer-turnaround-speed', (layer.turnaroundSpeed !== null && layer.turnaroundSpeed !== undefined) ? String(layer.turnaroundSpeed) : 'inherit');
  setVal('layer-corner-damping', layer.turnDampingDist !== undefined ? layer.turnDampingDist : 0);

  const isCustomHover = (layer.hoverTime !== 'inherit' && layer.hoverTime !== undefined && layer.hoverTime !== null);
  setVal('layer-hover-time-mode', isCustomHover ? 'custom' : 'inherit');
  const hoverCustomWrapper = document.getElementById('layer-hover-time-custom-wrapper');
  if (hoverCustomWrapper) {
    if (isCustomHover) hoverCustomWrapper.classList.remove('hidden');
    else hoverCustomWrapper.classList.add('hidden');
  }
  const customHoverVal = isCustomHover ? parseInt(layer.hoverTime, 10) : 0;
  setVal('layer-hover-time-slider', customHoverVal);
  const hoverValDisplay = document.getElementById('layer-hover-time-val');
  if (hoverValDisplay) hoverValDisplay.textContent = customHoverVal;

  const autoSettlingToggle = document.getElementById('layer-auto-settling-toggle');
  if (autoSettlingToggle) {
    autoSettlingToggle.checked = layer.autoSettlingEnabled !== false;
  }
  setVal('layer-base-settling-slider', layer.baseSettlingTime !== undefined ? layer.baseSettlingTime : 2.0);
  const baseSettlingDisplay = document.getElementById('layer-base-settling-val');
  if (baseSettlingDisplay) baseSettlingDisplay.textContent = (layer.baseSettlingTime !== undefined ? layer.baseSettlingTime : 2.0).toFixed(1);

  setVal('layer-major-turn-settling-slider', layer.majorTurnSettlingTime !== undefined ? layer.majorTurnSettlingTime : 5.0);
  const majorTurnDisplay = document.getElementById('layer-major-turn-settling-val');
  if (majorTurnDisplay) majorTurnDisplay.textContent = (layer.majorTurnSettlingTime !== undefined ? layer.majorTurnSettlingTime : 5.0).toFixed(1);

  setVal('layer-mod-turn-settling-slider', layer.moderateTurnSettlingTime !== undefined ? layer.moderateTurnSettlingTime : 4.0);
  const modTurnDisplay = document.getElementById('layer-mod-turn-settling-val');
  if (modTurnDisplay) modTurnDisplay.textContent = (layer.moderateTurnSettlingTime !== undefined ? layer.moderateTurnSettlingTime : 4.0).toFixed(1);

  setVal('layer-pitch-settling-slider', layer.pitchSettlingTime !== undefined ? layer.pitchSettlingTime : 3.0);
  const pitchDisplay = document.getElementById('layer-pitch-settling-val');
  if (pitchDisplay) pitchDisplay.textContent = (layer.pitchSettlingTime !== undefined ? layer.pitchSettlingTime : 3.0).toFixed(1);

  const layerPoiContainer = document.getElementById('layer-poi-container');
  if (layerPoiContainer) {
    if ((layer.headingMode === 'towardPOI') || (layer.headingMode === 'inherit' && document.getElementById('heading-mode')?.value === 'towardPOI')) {
      layerPoiContainer.classList.remove('hidden');
    } else {
      layerPoiContainer.classList.add('hidden');
    }
  }

  const customHeadingVal = (layer.customHeading !== undefined && layer.customHeading !== null) ? parseInt(layer.customHeading, 10) : 0;
  setVal('layer-custom-heading', customHeadingVal);
  const customHeadingValDisplay = document.getElementById('layer-custom-heading-val');
  if (customHeadingValDisplay) customHeadingValDisplay.textContent = customHeadingVal;

  const layerCustomHeadingContainer = document.getElementById('layer-custom-heading-container');
  if (layerCustomHeadingContainer) {
    const effHeadingMode = (layer.headingMode === 'inherit')
      ? (document.getElementById('heading-mode')?.value || 'followWayline')
      : (layer.headingMode || 'inherit');
    if (effHeadingMode === 'custom') {
      layerCustomHeadingContainer.classList.remove('hidden');
    } else {
      layerCustomHeadingContainer.classList.add('hidden');
    }
  }

  setVal('camera-zoom', layer.cameraZoom);
  setVal('camera-aspect-ratio', layer.cameraAspectRatio || CAMERA_ASPECT_RATIO || '4:3');
  setCameraAspectRatio(layer.cameraAspectRatio || CAMERA_ASPECT_RATIO || '4:3', true);
  setVal('road-offset', layer.roadOffset);
  setVal('road-focus-mode', layer.roadFocusMode || 'focusRoad');
  if (typeof updateRoadFocusUI === 'function') updateRoadFocusUI(layer);
  setVal('exclusion-min-alt', layer.minAltitude !== undefined ? layer.minAltitude : 0);
  setVal('exclusion-max-alt', layer.maxAltitude !== undefined ? layer.maxAltitude : 60);
  setVal('exclusion-detour-mode', layer.detourMode || 'inherit');
  setVal('exclusion-clearance-buffer', layer.clearanceBuffer !== undefined ? layer.clearanceBuffer : 5);
  setVal('global-exclusion-detour-mode', globalExclusionDetourMode);
  setVal('global-exclusion-clearance-buffer', globalExclusionClearanceBuffer);
  setVal('target-splat-radius', layer.targetRadius !== undefined ? layer.targetRadius : 25);
  setVal('target-splat-height', layer.targetHeight !== undefined ? layer.targetHeight : 8);
  setVal('target-splat-culling-mode', layer.targetCullingMode || 'smartTrim');
  setVal('target-splat-grid-pass', layer.targetGridPass || 'double');
  setVal('target-splat-framing-mode', layer.targetFramingMode || 'balanced');
  updateTargetSplatAutoFitUI(layer);
  updateTargetSplatDiagram(layer);
  updateTargetSplatDimensionWarning(layer);

  // Perimeter orbit controls
  const perimPassEl = document.getElementById('target-perimeter-pass');
  const perimControls = document.getElementById('target-perimeter-controls');
  if (perimPassEl) {
    perimPassEl.checked = !!(layer.targetPerimeterPass);
    if (perimControls) {
      if (layer.targetPerimeterPass) perimControls.classList.remove('hidden');
      else perimControls.classList.add('hidden');
    }
  }
  setVal('target-perimeter-standoff', layer.targetPerimeterStandoff !== undefined ? layer.targetPerimeterStandoff : 8);
  setVal('target-perimeter-alt', (layer.targetPerimeterAltitude !== null && layer.targetPerimeterAltitude !== undefined) ? layer.targetPerimeterAltitude : 0);
  setVal('target-perimeter-pitch', layer.targetPerimeterPitch !== undefined ? layer.targetPerimeterPitch : -55);

  // Tower controls
  setVal('tower-min-height', layer.towerMinHeight !== undefined ? layer.towerMinHeight : 20);
  setVal('tower-max-height', layer.towerMaxHeight !== undefined ? layer.towerMaxHeight : 100);
  setVal('tower-radius', layer.towerRadius !== undefined ? layer.towerRadius : 30);
  setVal('tower-guy-wire-buffer', layer.towerGuyWireBuffer !== undefined ? layer.towerGuyWireBuffer : 15);
  setVal('tower-movement-mode', layer.towerMovementMode || 'horizontal');
  setVal('tower-altitude-order', layer.towerAltitudeOrder || 'max-to-min');

  // Unit-aware display values for radius/height (will be updated by syncDisplayValues too)
  const _unitForLoad = (typeof getUnitSystem === 'function') ? getUnitSystem() : 'metric';
  const radVal = document.getElementById('target-radius-val');
  const radUnitEl = document.getElementById('target-radius-unit');
  const rMeters = layer.targetRadius !== undefined ? layer.targetRadius : 25;
  if (radVal) radVal.textContent = _unitForLoad === 'imperial' ? Math.round(rMeters * M_TO_FT) : rMeters;
  if (radUnitEl) radUnitEl.textContent = _unitForLoad === 'imperial' ? 'ft' : 'm';
  const hVal = document.getElementById('target-height-val');
  const hUnitEl = document.getElementById('target-height-unit');
  const hMeters = layer.targetHeight !== undefined ? layer.targetHeight : 8;
  if (hVal) hVal.textContent = _unitForLoad === 'imperial' ? Math.round(hMeters * M_TO_FT) : hMeters;
  if (hUnitEl) hUnitEl.textContent = _unitForLoad === 'imperial' ? 'ft' : 'm';

  const polyBtn = document.getElementById('target-mode-poly-btn');
  const radBtn = document.getElementById('target-mode-radius-btn');
  const polyControls = document.getElementById('target-poly-controls');
  const radControls = document.getElementById('target-radius-controls');
  const isPolyMode = (layer.targetMode !== 'radius');
  if (polyBtn && radBtn) {
    if (isPolyMode) {
      polyBtn.classList.add('active');
      radBtn.classList.remove('active');
      if (polyControls) polyControls.classList.remove('hidden');
      if (radControls) radControls.classList.add('hidden');
    } else {
      polyBtn.classList.remove('active');
      radBtn.classList.add('active');
      if (polyControls) polyControls.classList.add('hidden');
      if (radControls) radControls.classList.remove('hidden');
    }
    setTargetPolyEditMode(isPolyMode && isTargetPolyEditActive);
  }

  const exclAllAltEl = document.getElementById('exclusion-all-altitudes');
  if (exclAllAltEl) exclAllAltEl.checked = (layer.allAltitudes !== false);

  const roadSnapEl = document.getElementById('road-snap');
  if (roadSnapEl) roadSnapEl.checked = !!layer.roadSnap;

  const activeNameEl = document.getElementById('active-layer-name-indicator');
  if (activeNameEl) {
    activeNameEl.textContent = layer.name;
    activeNameEl.style.color = layer.color;
  }

  // Sync Pattern Cards in UI
  if (typeof document !== 'undefined' && typeof document.querySelectorAll === 'function') {
    const cards = document.querySelectorAll('.pattern-card');
    if (cards && typeof cards.forEach === 'function') {
      cards.forEach(card => {
        if (card.getAttribute('data-value') === layer.pattern) {
          card.classList.add('active');
        } else {
          card.classList.remove('active');
        }
      });
    }
  }

  // Sync 360 Photo Sphere Ring Checkboxes
  const psRings = layer.photoSphereRings || { ring1: true, ring2: true, ring3: true, nadir: true };
  const psR1 = document.getElementById('photo-sphere-ring-1');
  const psR2 = document.getElementById('photo-sphere-ring-2');
  const psR3 = document.getElementById('photo-sphere-ring-3');
  const psNadir = document.getElementById('photo-sphere-ring-nadir');
  if (psR1) psR1.checked = (psRings.ring1 !== false);
  if (psR2) psR2.checked = (psRings.ring2 !== false);
  if (psR3) psR3.checked = (psRings.ring3 !== false);
  if (psNadir) psNadir.checked = (psRings.nadir !== false);
  if (typeof updatePhotoSphereBadge === 'function') {
    updatePhotoSphereBadge();
  }

  // Sync Hyperlapse Controls
  const hlInterval = document.getElementById('hyperlapse-interval');
  const hlIntervalVal = document.getElementById('hyperlapse-interval-val');
  const hlStartPitch = document.getElementById('hyperlapse-start-pitch');
  const hlEndPitch = document.getElementById('hyperlapse-end-pitch');
  const hlHeadingMode = document.getElementById('hyperlapse-heading-mode');
  const hlStartHeading = document.getElementById('hyperlapse-start-heading');
  const hlEndHeading = document.getElementById('hyperlapse-end-heading');
  const hlKeyframesBox = document.getElementById('hyperlapse-heading-keyframes-box');
  if (hlInterval) hlInterval.value = layer.hyperlapseInterval || 3;
  if (hlIntervalVal) hlIntervalVal.textContent = `${layer.hyperlapseInterval || 3} s`;
  if (hlStartPitch) hlStartPitch.value = layer.hyperlapseStartPitch !== undefined ? layer.hyperlapseStartPitch : -15;
  if (hlEndPitch) hlEndPitch.value = layer.hyperlapseEndPitch !== undefined ? layer.hyperlapseEndPitch : -15;
  if (hlHeadingMode) hlHeadingMode.value = layer.hyperlapseHeadingMode || 'path';
  if (hlStartHeading) hlStartHeading.value = layer.hyperlapseStartHeading !== undefined ? layer.hyperlapseStartHeading : 0;
  if (hlEndHeading) hlEndHeading.value = layer.hyperlapseEndHeading !== undefined ? layer.hyperlapseEndHeading : 90;
  if (hlKeyframesBox) {
    if (layer.hyperlapseHeadingMode === 'keyframes') {
      hlKeyframesBox.classList.remove('hidden');
    } else {
      hlKeyframesBox.classList.add('hidden');
    }
  }

  if (typeof syncDisplayValues === 'function') {
    syncDisplayValues();
  }
  if (typeof togglePatternParameters === 'function') {
    togglePatternParameters();
  }
  if (typeof updateLayerHierarchyBadge === 'function') {
    updateLayerHierarchyBadge();
  }
  if (typeof setLayerBoundaryEditMode === 'function') {
    setLayerBoundaryEditMode(false);
  }
}

function setActiveLayer(layerId) {
  if (layerId === activeLayerId) return;
  saveActiveLayerFromUi();
  const found = flightLayers.find(l => l.id === layerId);
  if (found) {
    activeLayerId = layerId;
    if (found.pattern === 'road-following') {
      if (!found.roadWaypoints) found.roadWaypoints = [];
      roadWaypoints = found.roadWaypoints;
    } else {
      roadWaypoints = [];
    }
    syncUiWithActiveLayer();

    // Dynamically sync centerMarker to the newly active layer's center
    if (typeof centerMarker !== 'undefined' && centerMarker && typeof centerMarker.setLatLng === 'function') {
      if (found.centerLat !== null && found.centerLat !== undefined && found.centerLon !== null && found.centerLon !== undefined) {
        centerMarker.setLatLng([found.centerLat, found.centerLon]);
        if (typeof pois !== 'undefined' && pois && pois[0]) {
          pois[0].lat = found.centerLat;
          pois[0].lon = found.centerLon;
        }
      }
    }

    if (typeof updateGrid === 'function') updateGrid();
    renderLayersList();
  }
}

function addFlightLayer(pattern = 'double') {
  saveActiveLayerFromUi();
  const newIndex = flightLayers.length;

  let initCenterLat = null;
  let initCenterLon = null;
  if (typeof centerMarker !== 'undefined' && centerMarker && typeof centerMarker.getLatLng === 'function') {
    const cur = centerMarker.getLatLng();
    initCenterLat = cur.lat;
    initCenterLon = cur.lng;
  } else if (flightLayers.length > 0 && flightLayers[0].centerLat !== null && flightLayers[0].centerLat !== undefined) {
    initCenterLat = flightLayers[0].centerLat;
    initCenterLon = flightLayers[0].centerLon;
  }

  const newLayer = createDefaultLayer(
    `layer-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    `Layer ${newIndex + 1}: ${getPatternDisplayName(pattern)}`,
    newIndex,
    pattern,
    initCenterLat,
    initCenterLon
  );

  // Automatically create dedicated POI for this new layer
  if (initCenterLat !== null && initCenterLon !== null) {
    const layerPoi = addPoi(initCenterLat, initCenterLon, `Layer ${newIndex + 1} Target`);
    if (layerPoi) {
      newLayer.targetPoiId = layerPoi.id;
    }
  }

  flightLayers.push(newLayer);
  activeLayerId = newLayer.id;
  if (pattern === 'road-following') {
    if (!newLayer.roadWaypoints) newLayer.roadWaypoints = [];
    roadWaypoints = newLayer.roadWaypoints;
  } else {
    roadWaypoints = [];
  }
  syncUiWithActiveLayer();
  if (typeof updateGrid === 'function') updateGrid();
  renderLayersList();
  return newLayer;
}

function duplicateFlightLayer(layerId) {
  saveActiveLayerFromUi();
  const idx = flightLayers.findIndex(l => l.id === layerId);
  if (idx === -1) return;
  const orig = flightLayers[idx];
  const clone = JSON.parse(JSON.stringify(orig));
  clone.id = `layer-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  clone.name = `Copy of ${orig.name}`;
  const colorObj = LAYER_COLORS[(flightLayers.length) % LAYER_COLORS.length];
  clone.color = colorObj.hex;
  clone.colorName = colorObj.name;
  flightLayers.splice(idx + 1, 0, clone);
  activeLayerId = clone.id;
  syncUiWithActiveLayer();
  if (typeof updateGrid === 'function') updateGrid();
  renderLayersList();
}

function deleteFlightLayer(layerId) {
  const idx = flightLayers.findIndex(l => l.id === layerId);
  if (idx === -1) return;

  if (flightLayers.length <= 1) {
    // Single layer deletion: clear its waypoints & disable it so all waypoints are removed from map
    const single = flightLayers[0];
    single.freeformWaypoints = [];
    single.freeformPhotos = [];
    single.roadWaypoints = [];
    single.waypoints = [];
    single.photos = [];
    single.enabled = false;
    generatedWaypoints = [];
    generatedPhotos = [];
    roadWaypoints = [];
  } else {
    const deleted = flightLayers.splice(idx, 1)[0];
    if (deleted) {
      deleted.waypoints = [];
      deleted.photos = [];
      deleted.freeformWaypoints = [];
      deleted.freeformPhotos = [];
      deleted.roadWaypoints = [];
    }
    if (activeLayerId === layerId) {
      activeLayerId = flightLayers[Math.max(0, idx - 1)].id;
      syncUiWithActiveLayer();
    }
  }
  cleanUnusedLayerPois();
  if (typeof updateGrid === 'function') updateGrid();
  renderLayersList();
}

function cleanUnusedLayerPois() {
  if (!pois || pois.length <= 1) return;
  // Collect all targetPoiIds currently referenced by active flightLayers or waypoints
  const usedPoiIds = new Set();
  if (Array.isArray(flightLayers)) {
    flightLayers.forEach(l => {
      if (l.targetPoiId) usedPoiIds.add(l.targetPoiId);
    });
  }
  const wps = (typeof getCurrentWaypoints === 'function') ? getCurrentWaypoints() : [];
  if (Array.isArray(wps)) {
    wps.forEach(wp => {
      if (wp.targetPoiId) usedPoiIds.add(wp.targetPoiId);
    });
  }

  // Iterate backwards from pois.length - 1 down to 1 (keep index 0)
  for (let i = pois.length - 1; i >= 1; i--) {
    const p = pois[i];
    // If this POI was associated with a layer name ("Layer X Target") and its ID is no longer used by any layer
    if (p && p.id && p.name && p.name.includes("Target") && !usedPoiIds.has(p.id)) {
      deletePoi(i);
    }
  }
}

function reorderFlightLayers(fromIndex, toIndex) {
  if (fromIndex < 0 || fromIndex >= flightLayers.length || toIndex < 0 || toIndex >= flightLayers.length) return;
  const item = flightLayers.splice(fromIndex, 1)[0];
  flightLayers.splice(toIndex, 0, item);
  if (typeof updateGrid === 'function') updateGrid();
  renderLayersList();
}

function toggleFlightLayerVisibility(layerId) {
  const layer = flightLayers.find(l => l.id === layerId);
  if (!layer) return;
  layer.enabled = !layer.enabled;
  if (typeof updateGrid === 'function') updateGrid();
  renderLayersList();
}

function updateLayerTransition(fromLayerId, transitionSettings) {
  const layer = flightLayers.find(l => l.id === fromLayerId);
  if (!layer) return;
  layer.transition = {
    ...layer.transition,
    ...transitionSettings
  };
  if (typeof updateGrid === 'function') updateGrid();
  renderLayersList();
}

function formatTransitionSummary(t) {
  if (!t || t.type === 'direct') return 'Direct Transit';
  if (t.type === 'climbFirst') return 'Climb / Descend First';
  if (t.type === 'safeAltitude') return `Safe Alt (${t.safeAltitude || 60}m)`;
  return 'Direct Transit';
}

function ccw(A, B, C) {
  return (C.y - A.y) * (B.x - A.x) > (B.y - A.y) * (C.x - A.x);
}

function doSegmentsIntersect(A, B, C, D) {
  if (Math.max(A.x, B.x) < Math.min(C.x, D.x) || Math.min(A.x, B.x) > Math.max(C.x, D.x) ||
      Math.max(A.y, B.y) < Math.min(C.y, D.y) || Math.min(A.y, B.y) > Math.max(C.y, D.y)) {
    return false;
  }
  return (ccw(A, C, D) !== ccw(B, C, D)) && (ccw(A, B, C) !== ccw(A, B, D));
}

function getSegmentIntersection(A, B, C, D) {
  const denom = (A.x - B.x) * (C.y - D.y) - (A.y - B.y) * (C.x - D.x);
  if (Math.abs(denom) < 1e-9) return null;

  const t = ((A.x - C.x) * (C.y - D.y) - (A.y - C.y) * (C.x - D.x)) / denom;
  const u = -((A.x - B.x) * (A.y - C.y) - (A.y - B.y) * (A.x - C.x)) / denom;

  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return {
      x: A.x + t * (B.x - A.x),
      y: A.y + t * (B.y - A.y),
      t: t
    };
  }
  return null;
}

function isPointInPolygon(px, py, polyPoints) {
  if (!polyPoints || polyPoints.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polyPoints.length - 1; i < polyPoints.length; j = i++) {
    const xi = polyPoints[i].x, yi = polyPoints[i].y;
    const xj = polyPoints[j].x, yj = polyPoints[j].y;
    const intersect = ((yi > py) !== (yj > py)) &&
      (px < (xj - xi) * (py - yi) / ((yj - yi) || 0.000001) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function getExclusionZonePolygon(zone, globalCenterLat, globalCenterLon, bufferMeters = 0) {
  if (!zone) return [];
  const centerLat = (zone.centerLat !== undefined && zone.centerLat !== null) ? zone.centerLat : globalCenterLat;
  const centerLon = (zone.centerLon !== undefined && zone.centerLon !== null) ? zone.centerLon : globalCenterLon;
  const pattern = zone.pattern;

  if (pattern === 'exclusion-box') {
    const width = (zone.gridWidth !== undefined ? zone.gridWidth : 100) + (bufferMeters * 2);
    const height = (zone.gridHeight !== undefined ? zone.gridHeight : 100) + (bufferMeters * 2);
    const rotDeg = zone.gridRotation !== undefined ? zone.gridRotation : 0;
    const rotRad = (rotDeg * Math.PI / 180.0);

    const halfW = width / 2.0;
    const halfH = height / 2.0;

    // 4 corners of box in counter-clockwise order
    const corners = [
      { x: -halfW, y: -halfH },
      { x: halfW, y: -halfH },
      { x: halfW, y: halfH },
      { x: -halfW, y: halfH }
    ];

    return corners.map(c => ({
      x: c.x * Math.cos(rotRad) - c.y * Math.sin(rotRad),
      y: c.x * Math.sin(rotRad) + c.y * Math.cos(rotRad)
    }));

  } else if (pattern === 'exclusion-freeform') {
    const rawVertices = (zone.freeformWaypoints && zone.freeformWaypoints.length > 0)
      ? zone.freeformWaypoints
      : (zone.polygonVertices && zone.polygonVertices.length > 0 ? zone.polygonVertices : []);

    if (rawVertices.length < 3) return [];

    const localPoly = rawVertices.map(v => {
      if (v.x !== undefined && v.y !== undefined) return { x: v.x, y: v.y };
      return geodeticToLocal(v.lat, v.lon, centerLat, centerLon);
    });

    if (bufferMeters <= 0) return localPoly;

    // Expand polygon outward from centroid
    let sumX = 0, sumY = 0;
    for (let i = 0; i < localPoly.length; i++) {
      sumX += localPoly[i].x;
      sumY += localPoly[i].y;
    }
    const cX = sumX / localPoly.length;
    const cY = sumY / localPoly.length;

    return localPoly.map(v => {
      const dx = v.x - cX;
      const dy = v.y - cY;
      const dist = Math.hypot(dx, dy);
      if (dist < 0.001) return { x: v.x, y: v.y };
      return {
        x: v.x + (dx / dist) * bufferMeters,
        y: v.y + (dy / dist) * bufferMeters
      };
    });
  }

  return [];
}

function isSegmentCollidingWithPolygon(p1, p2, poly) {
  if (!poly || poly.length < 3) return false;

  // 1. Check if either endpoint is inside the polygon
  if (isPointInPolygon(p1.x, p1.y, poly) || isPointInPolygon(p2.x, p2.y, poly)) {
    return true;
  }

  // 2. Check if segment intersects any edge of the polygon
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    if (doSegmentsIntersect(p1, p2, poly[i], poly[j])) {
      return true;
    }
  }

  // 3. Check sample points along the segment (midpoint, 25%, 75%)
  const midX = (p1.x + p2.x) / 2.0;
  const midY = (p1.y + p2.y) / 2.0;
  if (isPointInPolygon(midX, midY, poly)) return true;

  const q1X = p1.x * 0.75 + p2.x * 0.25;
  const q1Y = p1.y * 0.75 + p2.y * 0.25;
  if (isPointInPolygon(q1X, q1Y, poly)) return true;

  const q3X = p1.x * 0.25 + p2.x * 0.75;
  const q3Y = p1.y * 0.25 + p2.y * 0.75;
  if (isPointInPolygon(q3X, q3Y, poly)) return true;

  return false;
}

function isSegmentInZoneAltitude(p1, p2, zone) {
  const isAllAlt = zone.allAltitudes !== false;
  if (isAllAlt) return true;

  const alt1 = (p1.alt !== undefined && p1.alt !== null) ? p1.alt : 50;
  const alt2 = (p2.alt !== undefined && p2.alt !== null) ? p2.alt : 50;
  const minWpAlt = Math.min(alt1, alt2);
  const maxWpAlt = Math.max(alt1, alt2);

  const minZoneAlt = zone.minAltitude !== undefined ? zone.minAltitude : 0;
  const maxZoneAlt = zone.maxAltitude !== undefined ? zone.maxAltitude : 60;

  if (maxWpAlt < minZoneAlt || minWpAlt > maxZoneAlt) {
    return false; // Passes safely above or below
  }
  return true;
}

function findDetourPathAroundZone(p1, p2, zone, centerLat, centerLon, bufferMeters = 4) {
  const zoneCenterLat = (zone.centerLat !== undefined && zone.centerLat !== null) ? zone.centerLat : centerLat;
  const zoneCenterLon = (zone.centerLon !== undefined && zone.centerLon !== null) ? zone.centerLon : centerLon;

  const origPoly = getExclusionZonePolygon(zone, zoneCenterLat, zoneCenterLon, 0);
  const buffPoly = getExclusionZonePolygon(zone, zoneCenterLat, zoneCenterLon, bufferMeters);
  if (!origPoly || origPoly.length < 3 || !buffPoly || buffPoly.length < 3) return [];

  const p1Local = (p1.x !== undefined && p1.y !== undefined)
    ? { x: p1.x, y: p1.y }
    : geodeticToLocal(p1.lat, p1.lon, zoneCenterLat, zoneCenterLon);

  const p2Local = (p2.x !== undefined && p2.y !== undefined)
    ? { x: p2.x, y: p2.y }
    : geodeticToLocal(p2.lat, p2.lon, zoneCenterLat, zoneCenterLon);

  // Nodes in visibility graph: [p1Local, ...buffPoly, p2Local]
  const nodes = [
    { x: p1Local.x, y: p1Local.y },
    ...buffPoly,
    { x: p2Local.x, y: p2Local.y }
  ];
  const n = nodes.length;
  const startIndex = 0;
  const endIndex = n - 1;

  const dist = new Array(n).fill(Infinity);
  const prev = new Array(n).fill(null);
  const visited = new Array(n).fill(false);

  dist[startIndex] = 0;

  for (let iter = 0; iter < n; iter++) {
    let u = -1;
    let minDist = Infinity;
    for (let i = 0; i < n; i++) {
      if (!visited[i] && dist[i] < minDist) {
        minDist = dist[i];
        u = i;
      }
    }

    if (u === -1 || u === endIndex) break;
    visited[u] = true;

    for (let v = 0; v < n; v++) {
      if (u === v || visited[v]) continue;

      const nodeU = nodes[u];
      const nodeV = nodes[v];

      // For adjacent vertices on the buffered polygon perimeter, allow traversal directly
      const isBuffNeighbor = (u >= 1 && u <= buffPoly.length && v >= 1 && v <= buffPoly.length &&
        (Math.abs(u - v) === 1 || Math.abs(u - v) === buffPoly.length - 1));

      let hasCollision = false;
      if (!isBuffNeighbor) {
        hasCollision = isSegmentCollidingWithPolygon(nodeU, nodeV, origPoly);
      }

      if (!hasCollision) {
        const edgeWeight = Math.hypot(nodeU.x - nodeV.x, nodeU.y - nodeV.y);
        const newDist = dist[u] + edgeWeight;
        if (newDist < dist[v]) {
          dist[v] = newDist;
          prev[v] = u;
        }
      }
    }
  }

  if (dist[endIndex] === Infinity || prev[endIndex] === null) {
    return [];
  }

  // Reconstruct shortest detour path
  const pathIndices = [];
  let curr = endIndex;
  while (curr !== null) {
    pathIndices.unshift(curr);
    curr = prev[curr];
  }

  // Convert intermediate nodes to detour waypoints
  const detourWaypoints = [];
  const alt1 = (p1.alt !== undefined && p1.alt !== null) ? p1.alt : 50;
  const alt2 = (p2.alt !== undefined && p2.alt !== null) ? p2.alt : 50;

  for (let k = 1; k < pathIndices.length - 1; k++) {
    const nodeIdx = pathIndices[k];
    const node = nodes[nodeIdx];
    const geo = localToGeodetic(node.x, node.y, zoneCenterLat, zoneCenterLon);
    const progress = k / (pathIndices.length - 1);
    const interpAlt = alt1 + (alt2 - alt1) * progress;

    detourWaypoints.push({
      lat: geo.lat,
      lon: geo.lon,
      x: node.x,
      y: node.y,
      alt: interpAlt,
      speed: p1.speed !== undefined ? p1.speed : 5,
      pitch: p1.pitch !== undefined ? p1.pitch : -60,
      heading: p1.heading !== undefined ? p1.heading : 0,
      isDetour: true,
      isAvoidance: true,
      isPhoto: false,
      isExclusionDetour: true,
      skipPhoto: true,       // Detour waypoints are transit-only: never trigger camera actions
      cameraAction: 'none'   // Explicitly suppress per-waypoint camera action in WPML export
    });
  }

  return detourWaypoints;
}

function calculate3DPathDistance(p1, p2, detourWps) {
  const fullSeq = [p1, ...(detourWps || []), p2];
  let totalDist = 0;
  for (let k = 0; k < fullSeq.length - 1; k++) {
    const a = fullSeq[k];
    const b = fullSeq[k + 1];
    const dx = (b.x !== undefined ? b.x : 0) - (a.x !== undefined ? a.x : 0);
    const dy = (b.y !== undefined ? b.y : 0) - (a.y !== undefined ? a.y : 0);
    const dz = (b.alt !== undefined ? b.alt : 50) - (a.alt !== undefined ? a.alt : 50);
    totalDist += Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  return totalDist;
}

function findDetourPathOverZone(p1, p2, zone, centerLat, centerLon, bufferMeters = 4, clearanceBuffer = 5) {
  const zoneCenterLat = (zone.centerLat !== undefined && zone.centerLat !== null) ? zone.centerLat : centerLat;
  const zoneCenterLon = (zone.centerLon !== undefined && zone.centerLon !== null) ? zone.centerLon : centerLon;

  const buffPoly = getExclusionZonePolygon(zone, zoneCenterLat, zoneCenterLon, bufferMeters);
  if (!buffPoly || buffPoly.length < 3) return [];

  const p1Local = (p1.x !== undefined && p1.y !== undefined)
    ? { x: p1.x, y: p1.y, alt: p1.alt }
    : { ...geodeticToLocal(p1.lat, p1.lon, zoneCenterLat, zoneCenterLon), alt: p1.alt };

  const p2Local = (p2.x !== undefined && p2.y !== undefined)
    ? { x: p2.x, y: p2.y, alt: p2.alt }
    : { ...geodeticToLocal(p2.lat, p2.lon, zoneCenterLat, zoneCenterLon), alt: p2.alt };

  const zoneMaxAlt = (zone.maxAltitude !== undefined && zone.maxAltitude !== null) ? zone.maxAltitude : 60;
  const cBuffer = (clearanceBuffer !== undefined && clearanceBuffer !== null) ? clearanceBuffer : (globalExclusionClearanceBuffer || 5);
  const maxCeiling = (typeof document !== 'undefined' && document.getElementById && document.getElementById('max-flight-height'))
    ? (parseFloat(document.getElementById('max-flight-height').value) || 120)
    : 120;
  const targetClimbAlt = Math.min(maxCeiling, zoneMaxAlt + cBuffer);

  // Find line segment (p1, p2) intersections with buffered zone polygon edges
  const intersections = [];
  for (let i = 0, j = buffPoly.length - 1; i < buffPoly.length; j = i++) {
    const inter = getSegmentIntersection(p1Local, p2Local, buffPoly[j], buffPoly[i]);
    if (inter) {
      intersections.push(inter);
    }
  }

  // Sort intersections along line segment from p1 (t=0) to p2 (t=1)
  intersections.sort((a, b) => a.t - b.t);

  const detourWaypoints = [];
  const speedVal = p1.speed !== undefined ? p1.speed : 5;
  const pitchVal = p1.pitch !== undefined ? p1.pitch : -60;
  const headingVal = p1.heading !== undefined ? p1.heading : 0;

  if (intersections.length >= 2) {
    const entryPt = intersections[0];
    const exitPt = intersections[intersections.length - 1];

    const entryGeo = localToGeodetic(entryPt.x, entryPt.y, zoneCenterLat, zoneCenterLon);
    const exitGeo = localToGeodetic(exitPt.x, exitPt.y, zoneCenterLat, zoneCenterLon);

    // 1. Entry climb waypoint (reaches clearance altitude right as entering zone boundary)
    detourWaypoints.push({
      lat: entryGeo.lat,
      lon: entryGeo.lon,
      x: entryPt.x,
      y: entryPt.y,
      alt: targetClimbAlt,
      speed: speedVal,
      pitch: pitchVal,
      heading: headingVal,
      isDetour: true,
      isAvoidance: true,
      isPhoto: false,
      isExclusionDetour: true,
      isClimbOver: true,
      skipPhoto: true,       // Detour waypoints are transit-only: never trigger camera actions
      cameraAction: 'none'   // Explicitly suppress per-waypoint camera action in WPML export
    });

    // 2. Exit cruise waypoint (maintains clearance altitude until leaving zone boundary)
    detourWaypoints.push({
      lat: exitGeo.lat,
      lon: exitGeo.lon,
      x: exitPt.x,
      y: exitPt.y,
      alt: targetClimbAlt,
      speed: speedVal,
      pitch: pitchVal,
      heading: headingVal,
      isDetour: true,
      isAvoidance: true,
      isPhoto: false,
      isExclusionDetour: true,
      isClimbOver: true,
      skipPhoto: true,       // Detour waypoints are transit-only: never trigger camera actions
      cameraAction: 'none'   // Explicitly suppress per-waypoint camera action in WPML export
    });
  } else if (intersections.length === 1) {
    const pt = intersections[0];
    const geo = localToGeodetic(pt.x, pt.y, zoneCenterLat, zoneCenterLon);
    detourWaypoints.push({
      lat: geo.lat,
      lon: geo.lon,
      x: pt.x,
      y: pt.y,
      alt: targetClimbAlt,
      speed: speedVal,
      pitch: pitchVal,
      heading: headingVal,
      isDetour: true,
      isAvoidance: true,
      isPhoto: false,
      isExclusionDetour: true,
      isClimbOver: true,
      skipPhoto: true,       // Detour waypoints are transit-only: never trigger camera actions
      cameraAction: 'none'   // Explicitly suppress per-waypoint camera action in WPML export
    });
  } else {
    // If segment intersects without edge hits (e.g. within zone)
    const midX = (p1Local.x + p2Local.x) / 2.0;
    const midY = (p1Local.y + p2Local.y) / 2.0;
    const geo = localToGeodetic(midX, midY, zoneCenterLat, zoneCenterLon);
    detourWaypoints.push({
      lat: geo.lat,
      lon: geo.lon,
      x: midX,
      y: midY,
      alt: targetClimbAlt,
      speed: speedVal,
      pitch: pitchVal,
      heading: headingVal,
      isDetour: true,
      isAvoidance: true,
      isPhoto: false,
      isExclusionDetour: true,
      isClimbOver: true,
      skipPhoto: true,       // Detour waypoints are transit-only: never trigger camera actions
      cameraAction: 'none'   // Explicitly suppress per-waypoint camera action in WPML export
    });
  }

  return detourWaypoints;
}

function routeWaypointsAroundExclusionZones(waypoints, activeZones, centerLat, centerLon) {
  if (!waypoints || waypoints.length < 2 || !activeZones || activeZones.length === 0) {
    return waypoints || [];
  }

  let result = [...waypoints];
  let maxPasses = 3;
  let modified = true;

  while (modified && maxPasses > 0) {
    modified = false;
    maxPasses--;
    const newWps = [];

    for (let i = 0; i < result.length; i++) {
      newWps.push(result[i]);
      if (i === result.length - 1) break;

      const p1 = result[i];
      const p2 = result[i + 1];

      for (let z = 0; z < activeZones.length; z++) {
        const zone = activeZones[z];
        if (!zone || !zone.enabled) continue;

        const zoneCenterLat = (zone.centerLat !== undefined && zone.centerLat !== null) ? zone.centerLat : centerLat;
        const zoneCenterLon = (zone.centerLon !== undefined && zone.centerLon !== null) ? zone.centerLon : centerLon;

        const p1Local = (p1.lat !== undefined && p1.lon !== undefined && (p1.lat !== zoneCenterLat || p1.lon !== zoneCenterLon || (p1.x === undefined && p1.y === undefined)))
          ? geodeticToLocal(p1.lat, p1.lon, zoneCenterLat, zoneCenterLon)
          : { x: p1.x || 0, y: p1.y || 0 };
        const p2Local = (p2.lat !== undefined && p2.lon !== undefined && (p2.lat !== zoneCenterLat || p2.lon !== zoneCenterLon || (p2.x === undefined && p2.y === undefined)))
          ? geodeticToLocal(p2.lat, p2.lon, zoneCenterLat, zoneCenterLon)
          : { x: p2.x || 0, y: p2.y || 0 };

        if (isSegmentInZoneAltitude(p1, p2, zone)) {
          const zonePoly = getExclusionZonePolygon(zone, zoneCenterLat, zoneCenterLon, 0);
          if (isSegmentCollidingWithPolygon(p1Local, p2Local, zonePoly)) {
            const isAllAlt = zone.allAltitudes !== false;
            let effectiveMode = (zone.detourMode && zone.detourMode !== 'inherit')
              ? zone.detourMode
              : (typeof globalExclusionDetourMode !== 'undefined' ? globalExclusionDetourMode : 'perimeter');

            // If zone has infinite ceiling (All Altitudes), overTop is impossible -> force perimeter
            if (isAllAlt && (effectiveMode === 'overTop' || effectiveMode === 'smart')) {
              effectiveMode = 'perimeter';
            }

            const clearance = (zone.clearanceBuffer !== undefined && zone.clearanceBuffer !== null)
              ? zone.clearanceBuffer
              : (typeof globalExclusionClearanceBuffer !== 'undefined' ? globalExclusionClearanceBuffer : 5);

            let detours = [];
            if (effectiveMode === 'overTop') {
              detours = findDetourPathOverZone(p1Local, p2Local, zone, zoneCenterLat, zoneCenterLon, 4, clearance);
            } else if (effectiveMode === 'smart') {
              const overDetours = findDetourPathOverZone(p1Local, p2Local, zone, zoneCenterLat, zoneCenterLon, 4, clearance);
              const aroundDetours = findDetourPathAroundZone(p1Local, p2Local, zone, zoneCenterLat, zoneCenterLon, 4);

              const distOver = calculate3DPathDistance(p1, p2, overDetours);
              const distAround = calculate3DPathDistance(p1, p2, aroundDetours);

              detours = (distOver <= distAround && overDetours.length > 0) ? overDetours : aroundDetours;
            } else {
              // 'perimeter'
              detours = findDetourPathAroundZone(p1Local, p2Local, zone, zoneCenterLat, zoneCenterLon, 4);
            }

            if (detours.length > 0) {
              detours.forEach(dwp => newWps.push(dwp));
              modified = true;
              break;
            }
          }
        }
      }
    }

    result = newWps;
  }

  return result;
}

function isPointInExclusionZone(wp, zone, globalCenterLat, globalCenterLon) {
  if (!zone || !zone.enabled || (!zone.isExclusionZone && zone.pattern !== 'exclusion-box' && zone.pattern !== 'exclusion-freeform')) {
    return false;
  }

  const centerLat = (zone.centerLat !== undefined && zone.centerLat !== null) ? zone.centerLat : globalCenterLat;
  const centerLon = (zone.centerLon !== undefined && zone.centerLon !== null) ? zone.centerLon : globalCenterLon;

  const wpAlt = (wp.alt !== undefined && wp.alt !== null) ? wp.alt : 50;
  const isAllAlt = zone.allAltitudes !== false;
  const minAlt = isAllAlt ? -9999 : (zone.minAltitude !== undefined ? zone.minAltitude : 0);
  const maxAlt = isAllAlt ? 999999 : (zone.maxAltitude !== undefined ? zone.maxAltitude : 60);

  // 1D Altitude Envelope Check
  if (wpAlt < minAlt || wpAlt > maxAlt) {
    return false;
  }

  // 2D Spatial Envelope Check - strictly project lat/lon relative to zone's center
  const wpOffsets = (wp.lat !== undefined && wp.lon !== undefined && (wp.lat !== centerLat || wp.lon !== centerLon || (wp.x === undefined && wp.y === undefined)))
    ? geodeticToLocal(wp.lat, wp.lon, centerLat, centerLon)
    : { x: wp.x || 0, y: wp.y || 0 };

  const pattern = zone.pattern;

  if (pattern === 'exclusion-box') {
    const width = zone.gridWidth !== undefined ? zone.gridWidth : 100;
    const height = zone.gridHeight !== undefined ? zone.gridHeight : 100;
    const rotDeg = zone.gridRotation !== undefined ? zone.gridRotation : 0;
    const rotRad = -(rotDeg * Math.PI / 180.0);

    // Rotate waypoint coordinates backwards by -rotDeg
    const rx = wpOffsets.x * Math.cos(rotRad) - wpOffsets.y * Math.sin(rotRad);
    const ry = wpOffsets.x * Math.sin(rotRad) + wpOffsets.y * Math.cos(rotRad);

    const halfW = width / 2.0;
    const halfH = height / 2.0;
    return Math.abs(rx) <= halfW && Math.abs(ry) <= halfH;

  } else if (pattern === 'exclusion-freeform') {
    const rawVertices = (zone.freeformWaypoints && zone.freeformWaypoints.length > 0)
      ? zone.freeformWaypoints
      : (zone.polygonVertices && zone.polygonVertices.length > 0 ? zone.polygonVertices : []);

    if (rawVertices.length < 3) return false;

    const localPoly = rawVertices.map(v => {
      if (v.lat !== undefined && v.lon !== undefined && (v.lat !== centerLat || v.lon !== centerLon || (v.x === undefined && v.y === undefined))) {
        return geodeticToLocal(v.lat, v.lon, centerLat, centerLon);
      }
      return { x: v.x || 0, y: v.y || 0 };
    });

    return isPointInPolygon(wpOffsets.x, wpOffsets.y, localPoly);
  }

  return false;
}

function filterWaypointsByExclusionZones(waypoints, photos, activeZones, centerLat, centerLon) {
  if (!activeZones || activeZones.length === 0 || !waypoints || waypoints.length === 0) {
    return { waypoints: waypoints || [], photos: photos || [] };
  }

  const validWaypoints = [];
  const validPhotos = [];

  for (let i = 0; i < waypoints.length; i++) {
    const wp = waypoints[i];
    let blockedByZone = null;

    for (let z = 0; z < activeZones.length; z++) {
      const zone = activeZones[z];
      if (isPointInExclusionZone(wp, zone, centerLat, centerLon)) {
        blockedByZone = zone;
        break;
      }
    }

    if (blockedByZone) {
      blockedByZone.filteredCount = (blockedByZone.filteredCount || 0) + 1;
    } else {
      validWaypoints.push(wp);
    }
  }

  // Route any flight segments that cross exclusion zones around the zones
  const routedWaypoints = routeWaypointsAroundExclusionZones(validWaypoints, activeZones, centerLat, centerLon);

  if (photos && photos.length > 0) {
    for (let i = 0; i < photos.length; i++) {
      const pt = photos[i];
      let blocked = false;
      for (let z = 0; z < activeZones.length; z++) {
        const zone = activeZones[z];
        if (isPointInExclusionZone(pt, zone, centerLat, centerLon)) {
          blocked = true;
          break;
        }
      }
      if (!blocked) {
        validPhotos.push(pt);
      }
    }
  }

  return {
    waypoints: routedWaypoints,
    photos: validPhotos
  };
}

function generateRoadFlightWaypoints(rawRoad, offsetDist, altitude, defaultGimbalPitch, speed, captureMode, centerLat, centerLon, headingMode, roadFocusMode = 'focusRoad') {
  if (!rawRoad || !Array.isArray(rawRoad) || rawRoad.length === 0) {
    return { waypoints: [], photos: [] };
  }

  const D = offsetDist !== undefined ? offsetDist : 15;
  const MIN_DIST = 10.0;

  rawRoad.forEach((rn, idx) => {
    if (rn.lat != null && rn.lon != null) {
      const offsets = geodeticToLocal(rn.lat, rn.lon, centerLat, centerLon);
      rn.x = offsets.x;
      rn.y = offsets.y;
      rn.idx = idx;
    }
  });

  const waypoints = rawRoad.map((roadNode, idx) => {
    let tx = 0;
    let ty = 1;

    if (rawRoad.length > 1) {
      const rIdx = idx;
      let prev = rawRoad[rIdx];
      let next = rawRoad[rIdx];

      for (let i = rIdx - 1; i >= 0; i--) {
        const dx = rawRoad[i].x - rawRoad[rIdx].x;
        const dy = rawRoad[i].y - rawRoad[rIdx].y;
        if (Math.sqrt(dx * dx + dy * dy) >= MIN_DIST) {
          prev = rawRoad[i];
          break;
        }
      }
      if (prev === rawRoad[rIdx] && rIdx > 0) {
        prev = rawRoad[0];
      }

      for (let i = rIdx + 1; i < rawRoad.length; i++) {
        const dx = rawRoad[i].x - rawRoad[rIdx].x;
        const dy = rawRoad[i].y - rawRoad[rIdx].y;
        if (Math.sqrt(dx * dx + dy * dy) >= MIN_DIST) {
          next = rawRoad[i];
          break;
        }
      }
      if (next === rawRoad[rIdx] && rIdx < rawRoad.length - 1) {
        next = rawRoad[rawRoad.length - 1];
      }

      let vx = next.x - prev.x;
      let vy = next.y - prev.y;

      if (vx === 0 && vy === 0) {
        if (idx === 0 && rawRoad.length > 1) {
          vx = rawRoad[1].x - rawRoad[0].x;
          vy = rawRoad[1].y - rawRoad[0].y;
        } else if (idx === rawRoad.length - 1 && rawRoad.length > 1) {
          vx = rawRoad[rawRoad.length - 1].x - rawRoad[rawRoad.length - 2].x;
          vy = rawRoad[rawRoad.length - 1].y - rawRoad[rawRoad.length - 2].y;
        } else if (rawRoad.length > idx + 1 && idx > 0) {
          vx = rawRoad[idx + 1].x - rawRoad[idx - 1].x;
          vy = rawRoad[idx + 1].y - rawRoad[idx - 1].y;
        }
      }

      const len = Math.sqrt(vx * vx + vy * vy);
      if (len > 0) {
        tx = vx / len;
        ty = vy / len;
      }
    }

    const droneX = roadNode.x + D * ty;
    const droneY = roadNode.y - D * tx;
    const geo = localToGeodetic(droneX, droneY, centerLat, centerLon, 0);

    const altVal = roadNode.alt !== undefined && roadNode.alt !== null ? roadNode.alt : altitude;

    // Calculate road surface focus pitch
    let calculatedRoadPitch;
    if (Math.abs(D) < 0.01) {
      calculatedRoadPitch = -90; // Nadir down at the road
    } else {
      calculatedRoadPitch = -Math.round(Math.atan2(altVal, Math.max(Math.abs(D), 1)) * (180.0 / Math.PI));
    }

    // Look-ahead pitch and heading
    let lookAheadPitch = calculatedRoadPitch;
    let lookAheadHeading = null;
    if (idx < rawRoad.length - 1) {
      const nextNode = rawRoad[idx + 1];
      const dNext = Math.hypot(nextNode.x - droneX, nextNode.y - droneY);
      lookAheadPitch = -Math.round(Math.atan2(altVal, Math.max(dNext, 1)) * (180.0 / Math.PI));
      lookAheadHeading = (Math.atan2(nextNode.x - droneX, nextNode.y - droneY) * (180.0 / Math.PI) + 360) % 360;
    }

    let pitchVal = roadNode.pitch;
    if (pitchVal === null || pitchVal === undefined) {
      if (roadFocusMode === 'lookAhead') {
        pitchVal = lookAheadPitch;
      } else if (roadFocusMode === 'focusRoad' || defaultGimbalPitch === 'auto' || defaultGimbalPitch === null || defaultGimbalPitch === undefined) {
        pitchVal = calculatedRoadPitch;
      } else {
        pitchVal = (typeof defaultGimbalPitch === 'number' && !isNaN(defaultGimbalPitch)) ? defaultGimbalPitch : calculatedRoadPitch;
      }
    }

    let standardRoadFacing;
    if (Math.abs(D) < 0.01) {
      standardRoadFacing = Math.atan2(tx, ty) * (180.0 / Math.PI);
    } else {
      standardRoadFacing = Math.atan2(roadNode.x - droneX, roadNode.y - droneY) * (180.0 / Math.PI);
    }
    standardRoadFacing = (standardRoadFacing + 360) % 360;

    let forwardRoadHeading = (Math.atan2(tx, ty) * (180.0 / Math.PI) + 360) % 360;

    let headingVal = standardRoadFacing;
    if (roadNode.heading !== null && roadNode.heading !== undefined) {
      headingVal = roadNode.heading;
    } else if (headingMode === 'fixed') {
      headingVal = 0;
    } else if (headingMode === 'custom') {
      headingVal = roadNode.heading || 0;
    } else if (roadFocusMode === 'followRoad' || (headingMode === 'followWayline' && roadFocusMode === 'custom')) {
      headingVal = forwardRoadHeading;
    } else if (roadFocusMode === 'lookAhead' && lookAheadHeading !== null) {
      headingVal = lookAheadHeading;
    } else {
      // Default: focusRoad (cross-track road targeting)
      headingVal = standardRoadFacing;
    }

    headingVal = (headingVal + 360) % 360;

    return {
      lat: geo.lat,
      lon: geo.lon,
      x: droneX,
      y: droneY,
      alt: altVal,
      pitch: pitchVal,
      heading: headingVal,
      headingMode: (roadFocusMode === 'focusRoad' || roadFocusMode === 'lookAhead') ? 'smoothTransition' : (headingMode || 'followWayline'),
      speed: speed,
      idx: idx,
      isRoadDroneWaypoint: true,
      roadNodeLat: roadNode.lat,
      roadNodeLon: roadNode.lon,
      roadFocusMode: roadFocusMode
    };
  });

  const photos = waypoints.map((wp, idx) => ({
    lat: wp.lat,
    lon: wp.lon,
    x: wp.x,
    y: wp.y,
    idx: idx
  }));

  return { waypoints, photos };
}

function generateLayerWaypoints(layer, globalCenterLat, globalCenterLon) {
  if (!layer || !layer.enabled) return { waypoints: [], photos: [] };
  if (layer.isExclusionZone || layer.pattern === 'exclusion-box' || layer.pattern === 'exclusion-freeform') {
    return { waypoints: [], photos: [], isExclusionZone: true };
  }
  if (layer.isDrawingLayer || layer.pattern === 'boundary-polygon' || layer.pattern === 'fiducial-markers' || layer.isFiducialLayer) {
    return { waypoints: [], photos: [], isDrawingLayer: true };
  }

  const centerLat = (layer.centerLat !== undefined && layer.centerLat !== null) ? layer.centerLat : globalCenterLat;
  const centerLon = (layer.centerLon !== undefined && layer.centerLon !== null) ? layer.centerLon : globalCenterLon;

  let gridWidth = layer.gridWidth !== undefined ? layer.gridWidth : 100;
  let gridHeight = layer.gridHeight !== undefined ? layer.gridHeight : 100;
  const rotation = layer.gridRotation !== undefined ? layer.gridRotation : 0;
  const gridType = layer.pattern || 'double';
  const overlapFront = (layer.frontOverlap !== undefined ? layer.frontOverlap : 80) / 100.0;
  const overlapSide = (layer.sideOverlap !== undefined ? layer.sideOverlap : 75) / 100.0;
  const altitude = layer.altitude !== undefined ? layer.altitude : 50;
  const speed = layer.speed !== undefined ? layer.speed : 4;
  const captureMode = layer.captureMode || 'stopAndShoot';
  const defaultGimbalPitch = layer.gimbalPitch !== undefined ? layer.gimbalPitch : -60;

  if (gridType === 'target-splat' && layer.targetAutoDimensions !== false) {
    const autoDims = calculateTargetSplatDimensions(layer, altitude, defaultGimbalPitch, rotation);
    gridWidth = autoDims.width;
    gridHeight = autoDims.height;
    layer.gridWidth = gridWidth;
    layer.gridHeight = gridHeight;
  }
  const headingMode = layer.headingMode || 'followWayline';
  const hoverTime = layer.hoverTime || 0;
  const cameraZoom = layer.cameraZoom || 1.0;

  let waypoints = [];
  let photos = [];
  let sLine = null;
  let sPhoto = null;
  let actualRotation = rotation;

  if (gridType === 'freeform') {
    const rawWps = (layer.freeformWaypoints && Array.isArray(layer.freeformWaypoints)) ? layer.freeformWaypoints : [];
    const rawPhotos = (layer.freeformPhotos && Array.isArray(layer.freeformPhotos)) ? layer.freeformPhotos : [];
    layer.freeformWaypoints = rawWps;
    layer.freeformPhotos = rawPhotos;

    rawWps.forEach((wp, idx) => {
      const offsets = geodeticToLocal(wp.lat, wp.lon, centerLat, centerLon);
      wp.x = offsets.x;
      wp.y = offsets.y;
      wp.idx = idx;
    });
    rawPhotos.forEach((pt) => {
      const offsets = geodeticToLocal(pt.lat, pt.lon, centerLat, centerLon);
      pt.x = offsets.x;
      pt.y = offsets.y;
    });
    waypoints = rawWps;
    photos = rawPhotos;
  } else if (gridType === 'road-following') {
    const rawRoad = (layer.roadWaypoints && Array.isArray(layer.roadWaypoints)) ? layer.roadWaypoints : (layer.id === activeLayerId ? (roadWaypoints || []) : []);
    if (rawRoad && rawRoad.length > 0) {
      const offsetDist = layer.roadOffset !== undefined ? layer.roadOffset : 15;
      const roadFocusMode = layer.roadFocusMode || 'focusRoad';
      const generated = generateRoadFlightWaypoints(rawRoad, offsetDist, altitude, defaultGimbalPitch, speed, captureMode, centerLat, centerLon, headingMode, roadFocusMode);
      waypoints = generated.waypoints;
      photos = generated.photos;
    }
  } else if (gridType === 'hyperlapse') {
    const rawWps = (layer.freeformWaypoints && Array.isArray(layer.freeformWaypoints)) ? layer.freeformWaypoints : [];
    layer.freeformWaypoints = rawWps;
    rawWps.forEach((wp, idx) => {
      const offsets = geodeticToLocal(wp.lat, wp.lon, centerLat, centerLon);
      wp.x = offsets.x;
      wp.y = offsets.y;
      wp.idx = idx;
    });
    if (typeof generateHyperlapseWaypoints === 'function') {
      const gen = generateHyperlapseWaypoints(rawWps, layer, speed, altitude);
      waypoints = gen.waypoints;
      photos = gen.framePoints;
    } else {
      waypoints = rawWps;
      photos = [];
    }
  } else {
    const hfov = (typeof CAMERA_HFOV === 'number' && !isNaN(CAMERA_HFOV) && CAMERA_HFOV > 0) ? CAMERA_HFOV : 69.7;
    const vfov = (typeof CAMERA_VFOV === 'number' && !isNaN(CAMERA_VFOV) && CAMERA_VFOV > 0) ? CAMERA_VFOV : 55.2;

    let targetDist = altitude;
    if (gridType === 'tower') {
      const towerRad = layer ? (layer.towerRadius !== undefined ? Math.max(1, layer.towerRadius) : 30) : 30;
      const guyBuf = layer ? (layer.towerGuyWireBuffer !== undefined ? Math.max(0, layer.towerGuyWireBuffer) : 15) : 15;
      targetDist = Math.max(1, towerRad + guyBuf);
    }

    const wFoot = 2.0 * targetDist * Math.tan((hfov / 2.0) * Math.PI / 180.0);
    const lFoot = 2.0 * targetDist * Math.tan((vfov / 2.0) * Math.PI / 180.0);
    sLine = (gridType === 'tower') ? lFoot * (1.0 - overlapFront) : wFoot * (1.0 - overlapSide);
    sPhoto = (gridType === 'tower') ? wFoot * (1.0 - overlapSide) : lFoot * (1.0 - overlapFront);

    actualRotation = (gridType === 'orbit' || gridType === 'multi-orbit' || gridType === 'tower' || gridType === 'photo-sphere') ? 0 : rotation;

    let gridData;
    if (gridType === 'tower') {
      gridData = generateTowerCoordinates(layer, sLine, sPhoto, altitude, defaultGimbalPitch);
    } else if (gridType === 'orbit') {
      gridData = generateOrbitCoordinates(gridWidth, sPhoto, altitude, defaultGimbalPitch);
    } else if (gridType === 'multi-orbit') {
      gridData = generateMultiOrbitCoordinates(gridWidth, sPhoto, altitude, defaultGimbalPitch);
    } else if (gridType === 'photo-sphere') {
      gridData = generatePhotoSphereCoordinates(altitude, layer);
    } else if (gridType === 'grid-orbit-combo') {
      gridData = generateGridOrbitComboCoordinates(gridWidth, actualRotation, captureMode, sLine, sPhoto, altitude, defaultGimbalPitch);
    } else if (gridType === 'grid-multi-orbit-combo') {
      gridData = generateGridMultiOrbitComboCoordinates(gridWidth, actualRotation, captureMode, sLine, sPhoto, altitude, defaultGimbalPitch);
    } else if (gridType === 'target-splat') {
      gridData = generateTargetSplatCoordinates(gridWidth, gridHeight, actualRotation, captureMode, sLine, sPhoto, altitude, defaultGimbalPitch, layer);
    } else {
      gridData = generateGridCoordinates(gridWidth, gridHeight, actualRotation, gridType, captureMode, sLine, sPhoto, layer.turnaroundOvershoot || 0);
    }

    waypoints = gridData.waypoints.map((pt, idx) => {
      const geo = localToGeodetic(pt.x, pt.y, centerLat, centerLon, actualRotation);
      const alt = pt.alt !== undefined ? pt.alt : altitude;
      const pitch = pt.pitch !== undefined ? pt.pitch : defaultGimbalPitch;
      let finalHeading = pt.heading;
      let finalHeadingMode = pt.headingMode || headingMode || null;
      if (finalHeading !== null && finalHeading !== undefined) {
        finalHeading = (finalHeading + actualRotation) % 360;
      }
      return {
        ...geo,
        alt: alt,
        pitch: pitch,
        heading: finalHeading,
        headingMode: finalHeadingMode,
        speed: pt.speed !== undefined ? pt.speed : speed,
        hoverTime: pt.hoverTime !== undefined ? pt.hoverTime : hoverTime,
        turnMode: pt.turnMode || 'inherit',
        cameraAction: pt.cameraAction || 'inherit',
        zoom: pt.zoom !== undefined ? pt.zoom : cameraZoom,
        isRingStart: pt.isRingStart || false,
        ringIndex: pt.ringIndex !== undefined ? pt.ringIndex : null,
        isModified: false,
        skipPhoto: pt.skipPhoto || false,
        isTurnaroundPoint: pt.isTurnaroundPoint || false,
        targetVisible: pt.targetVisible !== undefined ? pt.targetVisible : true,
        isPerimeterOrbit: pt.isPerimeterOrbit || false,
        isPhotoSpherePoint: pt.isPhotoSpherePoint || (gridType === 'photo-sphere'),
        isPhotoSphere: pt.isPhotoSphere || (gridType === 'photo-sphere'),
        gridType: pt.gridType || (gridType === 'target-splat' ? 'target-splat' : (gridType === 'photo-sphere' ? 'photo-sphere' : undefined)),
        origLat: geo.lat,
        origLon: geo.lon,
        origX: pt.x,
        origY: pt.y,
        origAlt: alt,
        origPitch: pitch,
        origHeading: finalHeading
      };
    });

    // Preserve custom modified/nudged waypoints from existing layer state
    if (layer.waypoints && Array.isArray(layer.waypoints)) {
      layer.waypoints.forEach((oldWp, oldIdx) => {
        if (oldWp && oldWp.isModified && waypoints[oldIdx]) {
          waypoints[oldIdx].lat = oldWp.lat;
          waypoints[oldIdx].lon = oldWp.lon;
          waypoints[oldIdx].x = oldWp.x;
          waypoints[oldIdx].y = oldWp.y;
          if (oldWp.alt !== undefined) waypoints[oldIdx].alt = oldWp.alt;
          if (oldWp.pitch !== undefined) waypoints[oldIdx].pitch = oldWp.pitch;
          if (oldWp.heading !== undefined) waypoints[oldIdx].heading = oldWp.heading;
          if (oldWp.headingMode !== undefined) waypoints[oldIdx].headingMode = oldWp.headingMode;
          if (oldWp.gridType !== undefined) waypoints[oldIdx].gridType = oldWp.gridType;
          if (oldWp.poiIndex !== undefined) waypoints[oldIdx].poiIndex = oldWp.poiIndex;
          if (oldWp.targetPoiId !== undefined) waypoints[oldIdx].targetPoiId = oldWp.targetPoiId;
          if (oldWp.speed !== undefined) waypoints[oldIdx].speed = oldWp.speed;
          if (oldWp.hoverTime !== undefined) waypoints[oldIdx].hoverTime = oldWp.hoverTime;
          if (oldWp.turnMode !== undefined) waypoints[oldIdx].turnMode = oldWp.turnMode;
          if (oldWp.cameraAction !== undefined) waypoints[oldIdx].cameraAction = oldWp.cameraAction;
          if (oldWp.zoom !== undefined) waypoints[oldIdx].zoom = oldWp.zoom;
          waypoints[oldIdx].isModified = true;
          waypoints[oldIdx].origLat = oldWp.origLat !== undefined ? oldWp.origLat : waypoints[oldIdx].origLat;
          waypoints[oldIdx].origLon = oldWp.origLon !== undefined ? oldWp.origLon : waypoints[oldIdx].origLon;
          waypoints[oldIdx].origX = oldWp.origX !== undefined ? oldWp.origX : waypoints[oldIdx].origX;
          waypoints[oldIdx].origY = oldWp.origY !== undefined ? oldWp.origY : waypoints[oldIdx].origY;
        }
      });
    }

    photos = gridData.photos.map(pt => {
      const geo = localToGeodetic(pt.x, pt.y, centerLat, centerLon, actualRotation);
      const alt = pt.alt !== undefined ? pt.alt : altitude;
      const pitch = pt.pitch !== undefined ? pt.pitch : defaultGimbalPitch;
      let finalHeading = pt.heading;
      if (finalHeading !== null && finalHeading !== undefined) {
        finalHeading = (finalHeading + actualRotation) % 360;
      }
      return {
        ...geo,
        alt: alt,
        pitch: pitch,
        heading: finalHeading,
        origLat: geo.lat,
        origLon: geo.lon,
        origX: pt.x,
        origY: pt.y,
        origAlt: alt,
        origPitch: pitch,
        origHeading: finalHeading
      };
    });
  }

  waypoints.forEach((wp, wIdx) => {
    wp.layerId = layer.id;
    wp.layerName = layer.name;
    wp.layerColor = layer.color;
    wp.layerPattern = layer.pattern;
    wp.layerWaypointIndex = wIdx;
    wp.layerCaptureMode = layer.captureMode || 'inherit';
    wp.layerPathMode = layer.pathMode || 'inherit';
    wp.layerHeadingMode = layer.headingMode || 'inherit';
    if (!wp.isModified || !wp.targetPoiId) {
      wp.targetPoiId = layer.targetPoiId || null;
    }
    wp.baseSettlingTime = layer.baseSettlingTime !== undefined ? layer.baseSettlingTime : 2.0;
    wp.majorTurnSettlingTime = layer.majorTurnSettlingTime !== undefined ? layer.majorTurnSettlingTime : 5.0;
    wp.moderateTurnSettlingTime = layer.moderateTurnSettlingTime !== undefined ? layer.moderateTurnSettlingTime : 4.0;
    wp.pitchSettlingTime = layer.pitchSettlingTime !== undefined ? layer.pitchSettlingTime : 3.0;
    wp.turnDampingDist = layer.turnDampingDist !== undefined ? layer.turnDampingDist : 0;
    wp.turnaroundSpeed = layer.turnaroundSpeed !== undefined ? layer.turnaroundSpeed : null;
    wp.autoSettlingEnabled = layer.autoSettlingEnabled !== false;
    if (wIdx === 0) {
      wp.isLayerStart = true;
      wp.isRingStart = true;
    }
  });

  photos.forEach((pt) => {
    pt.layerId = layer.id;
    pt.layerName = layer.name;
    pt.layerColor = layer.color;
  });

  layer.waypoints = waypoints;
  layer.photos = photos;

  return { waypoints, photos, sLine, sPhoto };
}

function generateTransitionWaypoints(prevLayer, prevLastWp, nextLayer, nextFirstWp, centerLat, centerLon) {
  const transition = (prevLayer && prevLayer.transition) || { type: 'direct' };
  const type = transition.type || 'direct';
  const transitionSpeed = transition.speed || nextLayer.speed || prevLayer.speed || 4;
  const dwellTime = transition.dwellTime || 0;
  const nextPitch = nextLayer.gimbalPitch !== undefined ? nextLayer.gimbalPitch : -60;

  const result = [];

  if (type === 'climbFirst') {
    if (nextLayer.altitude > prevLayer.altitude) {
      result.push({
        lat: prevLastWp.lat,
        lon: prevLastWp.lon,
        x: prevLastWp.x,
        y: prevLastWp.y,
        alt: nextLayer.altitude,
        pitch: nextPitch,
        heading: null,
        headingMode: 'followWayline',
        speed: transitionSpeed,
        hoverTime: dwellTime,
        turnMode: 'stop',
        cameraAction: 'none',
        zoom: 1.0,
        isTransition: true,
        skipPhoto: true,   // Transition waypoints are transit-only: never trigger camera actions
        transitionFrom: prevLayer.id,
        transitionTo: nextLayer.id,
        layerId: prevLayer.id,
        layerName: `Transition: ${prevLayer.name} → ${nextLayer.name}`,
        layerColor: '#a855f7'
      });
    } else if (nextLayer.altitude < prevLayer.altitude) {
      result.push({
        lat: nextFirstWp.lat,
        lon: nextFirstWp.lon,
        x: nextFirstWp.x,
        y: nextFirstWp.y,
        alt: prevLayer.altitude,
        pitch: nextPitch,
        heading: null,
        headingMode: 'followWayline',
        speed: transitionSpeed,
        hoverTime: dwellTime,
        turnMode: 'stop',
        cameraAction: 'none',
        zoom: 1.0,
        isTransition: true,
        skipPhoto: true,   // Transition waypoints are transit-only: never trigger camera actions
        transitionFrom: prevLayer.id,
        transitionTo: nextLayer.id,
        layerId: prevLayer.id,
        layerName: `Transition: ${prevLayer.name} → ${nextLayer.name}`,
        layerColor: '#a855f7'
      });
    }
  } else if (type === 'safeAltitude') {
    const safeAlt = Math.max(prevLayer.altitude || 50, nextLayer.altitude || 50, transition.safeAltitude || 60);
    result.push({
      lat: prevLastWp.lat,
      lon: prevLastWp.lon,
      x: prevLastWp.x,
      y: prevLastWp.y,
      alt: safeAlt,
      pitch: nextPitch,
      heading: null,
      headingMode: 'followWayline',
      speed: transitionSpeed,
      hoverTime: dwellTime,
      turnMode: 'stop',
      cameraAction: 'none',
      zoom: 1.0,
      isTransition: true,
      skipPhoto: true,   // Transition waypoints are transit-only: never trigger camera actions
      transitionFrom: prevLayer.id,
      transitionTo: nextLayer.id,
      layerId: prevLayer.id,
      layerName: `Transition Climb: ${prevLayer.name} → Safe Alt (${safeAlt}m)`,
      layerColor: '#a855f7'
    });
    result.push({
      lat: nextFirstWp.lat,
      lon: nextFirstWp.lon,
      x: nextFirstWp.x,
      y: nextFirstWp.y,
      alt: safeAlt,
      pitch: nextPitch,
      heading: null,
      headingMode: 'followWayline',
      speed: transitionSpeed,
      hoverTime: dwellTime,
      turnMode: 'stop',
      cameraAction: 'none',
      zoom: 1.0,
      isTransition: true,
      skipPhoto: true,   // Transition waypoints are transit-only: never trigger camera actions
      transitionFrom: prevLayer.id,
      transitionTo: nextLayer.id,
      layerId: prevLayer.id,
      layerName: `Transition Cruise: Safe Alt (${safeAlt}m) → ${nextLayer.name}`,
      layerColor: '#a855f7'
    });
  }

  return result;
}

function compileMultiLayerMission(centerLat, centerLon) {
  if (importedWaypoints) {
    return {
      waypoints: importedWaypoints,
      photos: importedPhotos || [],
      sLine: null,
      sPhoto: null,
      layers: []
    };
  }

  const allWaypoints = [];
  const allPhotos = [];
  let sLine = null;
  let sPhoto = null;

  const enabledLayers = flightLayers.filter(l => l.enabled);
  const activeExclusionZones = enabledLayers.filter(l => l.pattern === 'exclusion-box' || l.pattern === 'exclusion-freeform' || l.isExclusionZone);
  activeExclusionZones.forEach(z => { z.filteredCount = 0; });

  const flightLayersOnly = enabledLayers.filter(l => l.pattern !== 'exclusion-box' && l.pattern !== 'exclusion-freeform' && !l.isExclusionZone && !l.isDrawingLayer && l.pattern !== 'boundary-polygon' && l.pattern !== 'fiducial-markers' && !l.isFiducialLayer);

  for (let i = 0; i < flightLayersOnly.length; i++) {
    const currentLayer = flightLayersOnly[i];
    const layerCenterLat = (currentLayer.centerLat !== undefined && currentLayer.centerLat !== null) ? currentLayer.centerLat : centerLat;
    const layerCenterLon = (currentLayer.centerLon !== undefined && currentLayer.centerLon !== null) ? currentLayer.centerLon : centerLon;

    const layerResult = generateLayerWaypoints(currentLayer, layerCenterLat, layerCenterLon);
    if (!sLine && layerResult.sLine) sLine = layerResult.sLine;
    if (!sPhoto && layerResult.sPhoto) sPhoto = layerResult.sPhoto;

    // Filter candidate waypoints & photos against all active exclusion zones
    const rawWps = layerResult.waypoints || [];
    const rawPhotos = layerResult.photos || [];
    const filtered = filterWaypointsByExclusionZones(rawWps, rawPhotos, activeExclusionZones, layerCenterLat, layerCenterLon);

    const currentWps = filtered.waypoints;
    const currentPhotos = filtered.photos;
    currentLayer.waypoints = currentWps;
    currentLayer.photos = currentPhotos;

    if (allWaypoints.length > 0 && currentWps.length > 0) {
      const prevLastWp = allWaypoints[allWaypoints.length - 1];
      const nextFirstWp = currentWps[0];
      const prevLayer = flightLayersOnly[i - 1];

      const rawTransitionWps = generateTransitionWaypoints(prevLayer, prevLastWp, currentLayer, nextFirstWp, layerCenterLat, layerCenterLon);
      const filteredTrans = filterWaypointsByExclusionZones(rawTransitionWps, [], activeExclusionZones, layerCenterLat, layerCenterLon);
      filteredTrans.waypoints.forEach(twp => allWaypoints.push(twp));
    }

    currentWps.forEach(wp => allWaypoints.push(wp));
    currentPhotos.forEach(pt => allPhotos.push(pt));
  }

  const finalRoutedWps = routeWaypointsAroundExclusionZones(allWaypoints, activeExclusionZones, centerLat, centerLon);

  // Re-project all waypoints and photos relative to the primary mission origin (centerLat, centerLon)
  // so that in 3D preview and export, distinct layer positions are correctly positioned in spatial coordinates
  // without stacking/overlapping at (0,0)
  finalRoutedWps.forEach((wp, idx) => {
    wp.idx = idx;
    if (wp.lat !== undefined && wp.lat !== null && wp.lon !== undefined && wp.lon !== null) {
      const proj = geodeticToLocal(wp.lat, wp.lon, centerLat, centerLon);
      wp.x = proj.x;
      wp.y = proj.y;
    }
  });

  allPhotos.forEach(pt => {
    if (pt.lat !== undefined && pt.lat !== null && pt.lon !== undefined && pt.lon !== null) {
      const proj = geodeticToLocal(pt.lat, pt.lon, centerLat, centerLon);
      pt.x = proj.x;
      pt.y = proj.y;
    }
  });

  return {
    waypoints: finalRoutedWps,
    photos: allPhotos,
    sLine,
    sPhoto,
    layers: enabledLayers,
    exclusionZones: activeExclusionZones
  };
}

function renderLayersList() {
  if (typeof document === 'undefined') return;
  const container = document.getElementById('layers-list-container');
  const countBadge = document.getElementById('layer-count-badge');
  if (!container) return;

  if (countBadge) {
    const count = flightLayers.length;
    countBadge.textContent = `${count} ${count === 1 ? 'Layer' : 'Layers'}`;
  }

  container.innerHTML = '';

  flightLayers.forEach((layer, idx) => {
    const isActive = layer.id === activeLayerId;
    const isExcl = (layer.pattern === 'exclusion-box' || layer.pattern === 'exclusion-freeform' || layer.isExclusionZone);
    const isBoundary = (layer.pattern === 'boundary-polygon');
    const isFiducial = (layer.pattern === 'fiducial-markers' || layer.isFiducialLayer);
    const isDrawing = (isBoundary || isFiducial || layer.isDrawingLayer);
    const card = document.createElement('div');
    card.className = `layer-card${isExcl ? ' exclusion-zone' : ''}${isBoundary ? ' boundary-layer' : ''}${isFiducial ? ' fiducial-layer' : ''}${isActive ? ' active' : ''}`;
    if (card.setAttribute) card.setAttribute('data-layer-id', layer.id);

    const isFirst = idx === 0;
    const isLast = idx === flightLayers.length - 1;
    const wCount = (layer.waypoints && layer.waypoints.length) ? layer.waypoints.length : 0;
    const vCount = (Array.isArray(layer.boundaryPolygon) && layer.boundaryPolygon.length)
      ? layer.boundaryPolygon.length
      : ((Array.isArray(layer.polygonVertices) && layer.polygonVertices.length) ? layer.polygonVertices.length : 0);
    const gCount = (Array.isArray(layer.fiducialMarkers) && layer.fiducialMarkers.length) ? layer.fiducialMarkers.length : 0;

    const detailsHtml = isExcl
      ? `<span>Envelope: ${layer.allAltitudes !== false ? 'All Altitudes (0m – ∞)' : `${layer.minAltitude || 0}m – ${layer.maxAltitude || 60}m`}</span>
         <span style="color: ${layer.enabled ? '#f87171' : '#ef4444'}; font-weight: 600;">
           ${layer.enabled ? (layer.filteredCount ? `🚫 ${layer.filteredCount} wps blocked` : '🚫 Active Zone') : 'Disabled'}
         </span>`
      : (isFiducial
        ? `<span>Type: ${escapeHtml(layer.defaultTargetType || 'aruco_4x4')} &bull; Role: ${(layer.defaultTargetRole || 'GCP').toUpperCase()}</span>
           <span style="color: ${layer.enabled ? '#fbbf24' : '#ef4444'}; font-weight: 600;">
             ${layer.enabled ? `0 wps • Survey (${gCount} GCPs)` : 'Disabled'}
           </span>`
        : (isBoundary
          ? `<span>Style: ${layer.lineStyle || 'dashed'} &bull; Elev: ${layer.targetHeight || 0}m</span>
             <span style="color: ${layer.enabled ? '#06b6d4' : '#ef4444'}; font-weight: 600;">
               ${layer.enabled ? `0 wps • Drawing (${vCount} pts)` : 'Disabled'}
             </span>`
          : `<span>Alt: ${layer.altitude}m &bull; Spd: ${layer.speed}m/s &bull; Pitch: ${layer.gimbalPitch}&deg;</span>
           <span style="color: ${layer.enabled ? 'var(--text-muted)' : '#ef4444'}; font-weight: 500;">
             ${layer.enabled ? `${wCount} wps` : 'Disabled'}
           </span>`));

    card.innerHTML = `
      <div class="layer-card-header">
        <div class="layer-card-info">
          <span class="layer-color-dot" style="background-color: ${layer.color}; color: ${layer.color};"></span>
          <span class="layer-card-name" title="${escapeHtml(layer.name)}">${escapeHtml(layer.name)}</span>
          <span class="layer-card-badge">${escapeHtml(getPatternDisplayName(layer.pattern))}</span>
        </div>
        <div class="layer-card-actions">
          <button type="button" class="layer-action-btn toggle-visibility-btn" title="${layer.enabled ? 'Disable / Hide Layer' : 'Enable / Show Layer'}">
            ${layer.enabled ? '👁️' : '👁️‍🗨️'}
          </button>
          <button type="button" class="layer-action-btn move-up-btn" title="Move Up" ${isFirst ? 'disabled style="opacity:0.3;cursor:default;"' : ''}>
            ▲
          </button>
          <button type="button" class="layer-action-btn move-down-btn" title="Move Down" ${isLast ? 'disabled style="opacity:0.3;cursor:default;"' : ''}>
            ▼
          </button>
          <button type="button" class="layer-action-btn duplicate-btn" title="Duplicate Layer">
            📑
          </button>
          <button type="button" class="layer-action-btn delete-btn" title="Delete Layer">
            ✕
          </button>
        </div>
      </div>
      <div class="layer-card-details">
        ${detailsHtml}
      </div>
    `;

    if (card.addEventListener) {
      card.addEventListener('click', (e) => {
        if (e.target && e.target.closest && e.target.closest('.layer-action-btn')) return;
        setActiveLayer(layer.id);
      });
    }

    if (card.querySelector) {
      const visBtn = card.querySelector('.toggle-visibility-btn');
      if (visBtn && visBtn.addEventListener) {
        visBtn.addEventListener('click', (e) => {
          if (e.stopPropagation) e.stopPropagation();
          toggleFlightLayerVisibility(layer.id);
        });
      }

      const upBtn = card.querySelector('.move-up-btn');
      if (upBtn && !isFirst && upBtn.addEventListener) {
        upBtn.addEventListener('click', (e) => {
          if (e.stopPropagation) e.stopPropagation();
          reorderFlightLayers(idx, idx - 1);
        });
      }

      const downBtn = card.querySelector('.move-down-btn');
      if (downBtn && !isLast && downBtn.addEventListener) {
        downBtn.addEventListener('click', (e) => {
          if (e.stopPropagation) e.stopPropagation();
          reorderFlightLayers(idx, idx + 1);
        });
      }

      const dupBtn = card.querySelector('.duplicate-btn');
      if (dupBtn && dupBtn.addEventListener) {
        dupBtn.addEventListener('click', (e) => {
          if (e.stopPropagation) e.stopPropagation();
          duplicateFlightLayer(layer.id);
        });
      }

      const delBtn = card.querySelector('.delete-btn');
      if (delBtn && delBtn.addEventListener) {
        delBtn.addEventListener('click', (e) => {
          if (e.stopPropagation) e.stopPropagation();
          deleteFlightLayer(layer.id);
        });
      }
    }

    container.appendChild(card);

    // If not last, add transition connector divider
    if (!isLast) {
      const divider = document.createElement('div');
      divider.className = 'layer-transition-divider';
      const summary = formatTransitionSummary(layer.transition);
      divider.innerHTML = `
        <span class="transition-pill" data-from-layer="${layer.id}" title="Click to configure transition to next layer">
          🔗 ${escapeHtml(summary)} ⚙️
        </span>
      `;
      if (divider.querySelector) {
        const pill = divider.querySelector('.transition-pill');
        if (pill && pill.addEventListener) {
          pill.addEventListener('click', (e) => {
            if (e.stopPropagation) e.stopPropagation();
            openTransitionsModal(layer.id);
          });
        }
      }
      container.appendChild(divider);
    }
  });
}

function openTransitionsModal(targetFromLayerId = null) {
  if (typeof document === 'undefined') return;
  const modal = document.getElementById('layer-transitions-modal');
  if (!modal) return;
  renderTransitionsModalContent(targetFromLayerId);
  if (modal.classList) modal.classList.remove('hidden');
}

function closeTransitionsModal() {
  if (typeof document === 'undefined') return;
  const modal = document.getElementById('layer-transitions-modal');
  if (modal && modal.classList) modal.classList.add('hidden');
}

function renderTransitionsModalContent(targetFromLayerId = null) {
  if (typeof document === 'undefined') return;
  const container = document.getElementById('transition-rules-container');
  if (!container) return;

  container.innerHTML = '';

  if (flightLayers.length <= 1) {
    container.innerHTML = '<div style="font-size: 0.82rem; color: var(--text-muted); padding: 16px; text-align: center; background: rgba(255,255,255,0.02); border-radius: 8px; border: 1px dashed var(--border-color);">Add 2 or more layers in the Pattern Layers Stack to configure inter-layer flight transitions.</div>';
    return;
  }

  const unit = (typeof getUnitSystem === 'function') ? getUnitSystem() : 'metric';

  for (let i = 0; i < flightLayers.length - 1; i++) {
    const fromLayer = flightLayers[i];
    const toLayer = flightLayers[i + 1];
    const transition = fromLayer.transition || { type: 'direct', safeAltitude: 60, speed: null, dwellTime: 0 };
    const safeAltFormatted = (typeof formatDistance === 'function') ? formatDistance(transition.safeAltitude || 60) : `${transition.safeAltitude || 60}m`;
    const isTarget = targetFromLayerId && fromLayer.id === targetFromLayerId;

    const card = document.createElement('div');
    card.className = 'transition-rule-card';
    if (isTarget) {
      card.style.borderColor = 'var(--accent-cyan)';
      card.style.boxShadow = '0 0 12px rgba(6, 182, 212, 0.25)';
    }
    card.innerHTML = `
      <div class="transition-rule-header">
        <span style="display: flex; align-items: center; gap: 6px;">
          <span style="width: 8px; height: 8px; border-radius: 50%; background-color: ${fromLayer.color};"></span>
          <span>${escapeHtml(fromLayer.name)}</span>
          <span style="color: var(--accent-cyan); font-weight: 700;">&rarr;</span>
          <span style="width: 8px; height: 8px; border-radius: 50%; background-color: ${toLayer.color};"></span>
          <span>${escapeHtml(toLayer.name)}</span>
        </span>
      </div>
      <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 6px;">
        <div>
          <label style="display: block; font-size: 0.75rem; color: var(--text-main); margin-bottom: 4px; font-weight: 600;">
            Transition Altitude Strategy
          </label>
          <select class="form-select transition-type-select" data-from-id="${fromLayer.id}">
            <option value="direct" ${transition.type === 'direct' ? 'selected' : ''}>Direct Linear Path (Continuous 3D vector)</option>
            <option value="climbFirst" ${transition.type === 'climbFirst' ? 'selected' : ''}>Climb / Descend First (Adjust altitude in-place)</option>
            <option value="safeAltitude" ${transition.type === 'safeAltitude' ? 'selected' : ''}>Safe Transit Altitude (Climb to clearance altitude)</option>
          </select>
        </div>

        <div class="safe-alt-group ${transition.type === 'safeAltitude' ? '' : 'hidden'}">
          <label style="display: block; font-size: 0.75rem; color: var(--text-main); margin-bottom: 4px;">
            Safe Transit Altitude (Clearance Height)
          </label>
          <div style="display: flex; align-items: center; gap: 8px;">
            <input type="range" class="slider transition-safe-alt-slider" min="20" max="120" value="${transition.safeAltitude || 60}" data-from-id="${fromLayer.id}" style="flex: 1;">
            <span class="safe-alt-val" style="font-size: 0.75rem; min-width: 44px; color: var(--accent-cyan); font-weight: 600;">${safeAltFormatted}</span>
          </div>
        </div>

        <div>
          <label style="display: block; font-size: 0.75rem; color: var(--text-main); margin-bottom: 4px;">
            Dwell / Settle Time at Transition Points
          </label>
          <div style="display: flex; align-items: center; gap: 8px;">
            <input type="range" class="slider transition-dwell-slider" min="0" max="10" value="${transition.dwellTime || 0}" data-from-id="${fromLayer.id}" style="flex: 1;">
            <span class="dwell-val" style="font-size: 0.75rem; min-width: 28px; color: var(--accent-cyan); font-weight: 600;">${transition.dwellTime || 0}s</span>
          </div>
        </div>
      </div>
    `;

    if (card.querySelector) {
      const typeSelect = card.querySelector('.transition-type-select');
      const safeAltGroup = card.querySelector('.safe-alt-group');
      const safeAltSlider = card.querySelector('.transition-safe-alt-slider');
      const safeAltVal = card.querySelector('.safe-alt-val');
      const dwellSlider = card.querySelector('.transition-dwell-slider');
      const dwellVal = card.querySelector('.dwell-val');

      if (typeSelect && typeSelect.addEventListener) {
        typeSelect.addEventListener('change', (e) => {
          const val = e.target.value;
          if (safeAltGroup && safeAltGroup.classList) {
            if (val === 'safeAltitude') safeAltGroup.classList.remove('hidden');
            else safeAltGroup.classList.add('hidden');
          }
          updateLayerTransition(fromLayer.id, { type: val });
        });
      }

      if (safeAltSlider && safeAltVal && safeAltSlider.addEventListener) {
        safeAltSlider.addEventListener('input', (e) => {
          const val = parseInt(e.target.value, 10);
          safeAltVal.textContent = (typeof formatDistance === 'function') ? formatDistance(val) : `${val}m`;
          updateLayerTransition(fromLayer.id, { safeAltitude: val });
        });
      }

      if (dwellSlider && dwellVal && dwellSlider.addEventListener) {
        dwellSlider.addEventListener('input', (e) => {
          const val = parseInt(e.target.value, 10);
          dwellVal.textContent = `${val}s`;
          updateLayerTransition(fromLayer.id, { dwellTime: val });
        });
      }
    }

    container.appendChild(card);
  }
}

function initLayerManager() {
  if (typeof document === 'undefined') return;

  const addLayerBtn = document.getElementById('add-layer-btn');
  if (addLayerBtn) {
    addLayerBtn.addEventListener('click', () => {
      addFlightLayer('double');
    });
  }

  const configTransBtn = document.getElementById('configure-transitions-btn');
  if (configTransBtn) {
    configTransBtn.addEventListener('click', () => {
      openTransitionsModal();
    });
  }

  const closeTransBtn = document.getElementById('close-transitions-modal-btn');
  const closeTransFooterBtn = document.getElementById('close-transitions-footer-btn');
  const transModal = document.getElementById('layer-transitions-modal');
  if (closeTransBtn) closeTransBtn.addEventListener('click', closeTransitionsModal);
  if (closeTransFooterBtn) closeTransFooterBtn.addEventListener('click', closeTransitionsModal);
  if (transModal) {
    transModal.addEventListener('click', (e) => {
      if (e.target === transModal) closeTransitionsModal();
    });
  }

  renderLayersList();
}

// Helpers to get currently active mission data
