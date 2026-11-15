function calculateStats(waypoints, photoLocations, speed, sLine, sPhoto, captureMode) {
  if (!waypoints || waypoints.length === 0) return null;
  if (waypoints.length === 1 && (waypoints[0].isPhotoSphereActionGroup || waypoints[0].isPhotoSpherePoint || waypoints[0].isPhotoSphere || waypoints[0].gridType === 'photo-sphere' || waypoints[0].layerPattern === 'photo-sphere')) {
    const wp = waypoints[0];
    const shots = wp.totalRawPhotos || wp.totalShots || (Array.isArray(wp.photoSphereActions) ? wp.photoSphereActions.length : 1);
    const settling = (wp.hoverTime !== undefined && !isNaN(wp.hoverTime)) ? Number(wp.hoverTime) : 2.0;
    const flightTimeSeconds = Math.round(shots * (settling + 1.5) + 30);
    const min = Math.floor(flightTimeSeconds / 60);
    const sec = Math.round(flightTimeSeconds % 60);
    return {
      waypointsCount: 1,
      photoCount: shots,
      lineSpacing: sLine,
      photoSpacing: sPhoto,
      distance: 0,
      timeStr: `${min}m ${sec}s`,
      flightTimeSeconds: flightTimeSeconds,
      maxNearestNeighborDist: 0,
      hasIsolatedWaypoint: false,
      isFarFromTakeoff: false,
      userDistanceToTakeoff: null,
      intersectingTfrs: []
    };
  }
  if (waypoints.length < 2) return null;

  // 1. Calculate path length in meters
  let totalDistance = 0;
  for (let i = 1; i < waypoints.length; i++) {
    const p1 = waypoints[i - 1];
    const p2 = waypoints[i];
    let d = 0;
    if (p1.x !== undefined && p1.x !== null && p2.x !== undefined && p2.x !== null) {
      d = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    } else if (p1.lat !== undefined && p2.lat !== undefined && typeof haversineDistance === 'function') {
      const lon1 = p1.lon !== undefined ? p1.lon : p1.lng;
      const lon2 = p2.lon !== undefined ? p2.lon : p2.lng;
      d = haversineDistance(p1.lat, lon1, p2.lat, lon2);
    }
    totalDistance += d;
  }

  // Nearest neighbor calculation for each waypoint
  let maxNearestNeighborDistSq = 0;
  for (let i = 0; i < waypoints.length; i++) {
    const p1 = waypoints[i];
    let minDistSq = Infinity;
    for (let j = 0; j < waypoints.length; j++) {
      if (i === j) continue;
      const p2 = waypoints[j];
      let dSq;
      if (p1.x !== undefined && p1.x !== null && p2.x !== undefined && p2.x !== null) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        dSq = dx * dx + dy * dy;
      } else if (p1.lat !== undefined && p2.lat !== undefined && typeof haversineDistance === 'function') {
        const lon1 = p1.lon !== undefined ? p1.lon : p1.lng;
        const lon2 = p2.lon !== undefined ? p2.lon : p2.lng;
        const hDist = haversineDistance(p1.lat, lon1, p2.lat, lon2);
        dSq = hDist * hDist;
      } else {
        dSq = 0;
      }
      if (dSq < minDistSq) {
        minDistSq = dSq;
      }
    }
    if (minDistSq !== Infinity && minDistSq > maxNearestNeighborDistSq) {
      maxNearestNeighborDistSq = minDistSq;
    }
  }
  const maxNearestNeighborDist = Math.sqrt(maxNearestNeighborDistSq);
  const hasIsolatedWaypoint = maxNearestNeighborDist > 100.0;

  // Geolocation check
  let isFarFromTakeoff = false;
  let userDistanceToTakeoff = null;
  if (userLocation && waypoints.length > 0) {
    const takeoffL = L.latLng(waypoints[0].lat, waypoints[0].lon);
    const userL = L.latLng(userLocation.lat, userLocation.lon);
    userDistanceToTakeoff = userL.distanceTo(takeoffL); // in meters
    isFarFromTakeoff = userDistanceToTakeoff > 609.6; // 2000 ft in meters
  }

  // 2. Photo count
  const isHyperlapse = waypoints.some(w => w && (w.isHyperlapse || w.gridType === 'hyperlapse' || w.layerPattern === 'hyperlapse'));
  let photoCount = photoLocations ? photoLocations.length : (waypoints ? waypoints.length : 0);
  if (isHyperlapse && (!photoLocations || photoLocations.length === 0)) {
    const interval = (waypoints.find(w => w && w.hyperlapseInterval)?.hyperlapseInterval) || 3;
    const effSpeed = Math.max(0.1, (speed !== undefined && !isNaN(speed) && speed > 0) ? Number(speed) : 2.0);
    const frameSpacing = Math.max(0.05, effSpeed * interval);
    if (totalDistance > 0 && frameSpacing > 0) {
      photoCount = Math.floor(totalDistance / frameSpacing) + 1;
    }
  }
  // 3. Est flight time (accounting for stop-and-shoot hover delays)
  let flightTimeSeconds = totalDistance / speed;
  if (captureMode === 'stopAndShoot') {
    flightTimeSeconds += photoCount * 4.5;
  }
  
  // Sum hover times across all waypoints
  const globalHoverEl = document.getElementById('global-hover-time');
  const globalHover = globalHoverEl ? (parseInt(globalHoverEl.value) || 0) : 0;

  let totalHoverSeconds = 0;
  const defaultGimbalEl = typeof document !== 'undefined' ? document.getElementById('gimbal-pitch') : null;
  const defaultGimbalVal = defaultGimbalEl ? (parseFloat(defaultGimbalEl.value) || -60) : -60;
  let prevPitch = defaultGimbalVal;
  waypoints.forEach((wp, idx) => {
    const wpCapture = (wp.captureMode && wp.captureMode !== 'inherit') ? wp.captureMode : (wp.layerCaptureMode && wp.layerCaptureMode !== 'inherit') ? wp.layerCaptureMode : captureMode;
    const wpIsStopAndShoot = wpCapture === 'stopAndShoot';

    const wpLayer = (wp.layerId && typeof flightLayers !== 'undefined') ? flightLayers.find(l => l.id === wp.layerId) : ((typeof getActiveLayer === 'function') ? getActiveLayer() : null);

    let baseHover = globalHover;
    const layerHover = wp.layerHoverTime !== undefined ? wp.layerHoverTime : (wpLayer && wpLayer.hoverTime);
    if (layerHover !== undefined && layerHover !== null && layerHover !== 'inherit') {
      baseHover = parseInt(layerHover, 10) || 0;
    }
    if (wp.hoverTime !== null && wp.hoverTime !== undefined && wp.hoverTime !== 'inherit') {
      baseHover = parseInt(wp.hoverTime, 10) || 0;
    }
    let wpEffectiveHover = baseHover;

    const autoSettling = (wp.autoSettlingEnabled !== undefined)
      ? (wp.autoSettlingEnabled !== false)
      : ((wpLayer && wpLayer.autoSettlingEnabled !== undefined) ? (wpLayer.autoSettlingEnabled !== false) : true);

    const baseSettling = (wp.baseSettlingTime !== undefined && wp.baseSettlingTime !== null && wp.baseSettlingTime !== 'inherit')
      ? parseFloat(wp.baseSettlingTime)
      : ((wpLayer && wpLayer.baseSettlingTime !== undefined && wpLayer.baseSettlingTime !== null && wpLayer.baseSettlingTime !== 'inherit') ? parseFloat(wpLayer.baseSettlingTime) : 2.0);
    const majorTurnSettling = (wp.majorTurnSettlingTime !== undefined && wp.majorTurnSettlingTime !== null && wp.majorTurnSettlingTime !== 'inherit')
      ? parseFloat(wp.majorTurnSettlingTime)
      : ((wpLayer && wpLayer.majorTurnSettlingTime !== undefined && wpLayer.majorTurnSettlingTime !== null && wpLayer.majorTurnSettlingTime !== 'inherit') ? parseFloat(wpLayer.majorTurnSettlingTime) : 5.0);
    const modTurnSettling = (wp.moderateTurnSettlingTime !== undefined && wp.moderateTurnSettlingTime !== null && wp.moderateTurnSettlingTime !== 'inherit')
      ? parseFloat(wp.moderateTurnSettlingTime)
      : ((wpLayer && wpLayer.moderateTurnSettlingTime !== undefined && wpLayer.moderateTurnSettlingTime !== null && wpLayer.moderateTurnSettlingTime !== 'inherit') ? parseFloat(wpLayer.moderateTurnSettlingTime) : 4.0);
    const pitchSettling = (wp.pitchSettlingTime !== undefined && wp.pitchSettlingTime !== null && wp.pitchSettlingTime !== 'inherit')
      ? parseFloat(wp.pitchSettlingTime)
      : ((wpLayer && wpLayer.pitchSettlingTime !== undefined && wpLayer.pitchSettlingTime !== null && wpLayer.pitchSettlingTime !== 'inherit') ? parseFloat(wpLayer.pitchSettlingTime) : 3.0);

    const reposInfo = (typeof checkNeedsReposition === 'function') ? checkNeedsReposition(idx, waypoints) : { needsReposition: false, headingDiff: 0, isGimbalChanged: false, pitchDiff: 0 };
    const gridTypeEl = typeof document !== 'undefined' ? document.getElementById('grid-type') : null;
    const gridTypeVal = (gridTypeEl && gridTypeEl.value) ? gridTypeEl.value : (waypoints.find(w => w && w.gridType)?.gridType || '');
    const isTargetSplat = gridTypeVal === 'target-splat' ||
      gridTypeVal === 'photo-sphere' ||
      (wp.gridType === 'target-splat') ||
      (wp.gridType === 'photo-sphere') ||
      (wp.isPhotoSpherePoint) ||
      (wp.isPhotoSphere) ||
      (wp.layerPattern === 'photo-sphere') ||
      (wp.layerId && typeof flightLayers !== 'undefined' && flightLayers.some(l => l.id === wp.layerId && (l.pattern === 'target-splat' || l.pattern === 'photo-sphere'))) ||
      (wp.majorTurnSettlingTime !== undefined && wp.layerId);

    const hasExplicitPitch = (wp.pitch !== undefined && wp.pitch !== null && !isNaN(wp.pitch)) || (wp.gimbalPitch !== undefined && wp.gimbalPitch !== null && !isNaN(wp.gimbalPitch));
    const currentPitch = hasExplicitPitch ? (parseFloat(wp.pitch !== undefined && wp.pitch !== null ? wp.pitch : wp.gimbalPitch)) : prevPitch;
    const pitchDiff = (idx === 0) ? (reposInfo.pitchDiff || 0) : Math.abs(currentPitch - prevPitch);
    prevPitch = currentPitch;

    const isPitchSlew = (idx === 0) ? (pitchDiff >= 5.0) : (pitchDiff >= 5.0 || reposInfo.isGimbalChanged);
    const isExtendedSettling = isTargetSplat || (wpLayer && (wpLayer.pattern === 'target-splat' || wpLayer.pattern === 'photo-sphere'));
    const isPhotoSphere = (wp.gridType === 'photo-sphere') || (wp.isPhotoSpherePoint) || (wp.isPhotoSphere) || (wp.layerPattern === 'photo-sphere') || (wpLayer && wpLayer.pattern === 'photo-sphere');
    const needsSettling = reposInfo.needsReposition || isPitchSlew || (idx === 0 && (wp.hoverTime === null || wp.hoverTime === undefined));

    if ((wpIsStopAndShoot || isPhotoSphere) && autoSettling && needsSettling && !wp.skipPhoto && !wp.isDetour && !wp.isTransition) {
      let settlingDelay = baseSettling;
      // 1. Yaw turn settling (extended settling on target-splat/photo-sphere)
      if (idx > 0 && isExtendedSettling) {
        if (reposInfo.headingDiff >= 60) {
          settlingDelay = Math.max(settlingDelay, majorTurnSettling);
        } else if (reposInfo.headingDiff >= 25) {
          settlingDelay = Math.max(settlingDelay, modTurnSettling);
        }
      }
      // 2. Gimbal pitch slew settling across ALL patterns and ALL waypoints (idx >= 0)
      if (isPitchSlew) {
        if (pitchDiff >= 65.0) {
          settlingDelay = Math.max(settlingDelay, majorTurnSettling, 5.0);
        } else if (pitchDiff >= 35.0) {
          settlingDelay = Math.max(settlingDelay, modTurnSettling, 4.0);
        } else {
          settlingDelay = Math.max(settlingDelay, pitchSettling);
        }
        if (isPhotoSphere) {
          settlingDelay = Math.max(settlingDelay, modTurnSettling);
        }
      }
      wpEffectiveHover = Math.max(wpEffectiveHover, settlingDelay);
    }
    totalHoverSeconds += wpEffectiveHover;
  });
  flightTimeSeconds += totalHoverSeconds;
  
  flightTimeSeconds += 45;

  const min = Math.floor(flightTimeSeconds / 60);
  const sec = Math.round(flightTimeSeconds % 60);

  // TFR intersection check
  const intersectingTfrs = [];
  const intersectingActiveTfrs = [];
  const intersectingUpcomingTfrs = [];
  const activeTfrFeats = (typeof tfrActiveFeatures !== 'undefined' && Array.isArray(tfrActiveFeatures) && tfrActiveFeatures.length > 0)
    ? tfrActiveFeatures
    : ((typeof global !== 'undefined' && Array.isArray(global.tfrActiveFeatures) && global.tfrActiveFeatures.length > 0)
        ? global.tfrActiveFeatures
        : ((typeof window !== 'undefined' && Array.isArray(window.tfrActiveFeatures)) ? window.tfrActiveFeatures : []));
  if (activeTfrFeats && activeTfrFeats.length > 0) {
    for (const feat of activeTfrFeats) {
      if (!feat.geometry) continue;
      const hit = waypoints.some(wp => {
        if (!wp) return false;
        const lat = wp.lat !== undefined ? wp.lat : wp.origLat;
        const lon = wp.lon !== undefined ? wp.lon : wp.origLon;
        if (lat == null || lon == null || isNaN(lat) || isNaN(lon)) return false;
        return (typeof isPointInGeoJsonPolygon === 'function') && isPointInGeoJsonPolygon(lat, lon, feat.geometry);
      });
      if (hit) {
        const notamId = feat.properties?.NOTAM_KEY || feat.properties?.notam_id || feat.id || 'Active TFR';
        const name = feat.properties?.TITLE || feat.properties?.NAME || 'TFR';
        const status = feat.properties?.temporalStatus || (feat.properties?.isActiveNow ? 'ACTIVE' : (feat.properties?.isUpcoming ? 'UPCOMING' : 'ACTIVE'));
        const countdown = feat.properties?.countdownText || '';
        const itemObj = { notamId, name, status, countdown };
        intersectingTfrs.push(itemObj);
        if (status === 'UPCOMING') {
          intersectingUpcomingTfrs.push(itemObj);
        } else if (status === 'ACTIVE' || (status !== 'EXPIRED' && status !== 'STANDBY')) {
          intersectingActiveTfrs.push(itemObj);
        }
      }
    }
  }

  const wireframeReadiness = evaluateFlightPlanWireframeReadiness(waypoints, photoLocations, {
    captureMode: captureMode
  });

  return {
    waypointsCount: waypoints.length,
    photoCount: photoCount,
    lineSpacing: sLine,
    photoSpacing: sPhoto,
    distance: totalDistance,
    timeStr: `${min}m ${sec}s`,
    flightTimeSeconds: flightTimeSeconds,
    maxNearestNeighborDist: maxNearestNeighborDist,
    hasIsolatedWaypoint: hasIsolatedWaypoint,
    isFarFromTakeoff: isFarFromTakeoff,
    userDistanceToTakeoff: userDistanceToTakeoff,
    intersectingTfrs: intersectingTfrs,
    intersectingActiveTfrs: intersectingActiveTfrs,
    intersectingUpcomingTfrs: intersectingUpcomingTfrs,
    wireframeReadiness: wireframeReadiness
  };
}

/**
 * Precalculates whether a planned flight mission (or correlated photo set) satisfies
 * OpenCV 5 Multi-View Stereo (MVS) 3D wireframe triangulation requirements.
 */
function evaluateFlightPlanWireframeReadiness(waypoints, photoLocations = null, options = {}) {
  const wfLatLonToWorld = (lat, lon, origLat, origLon) => {
    const zoom = 18;
    const tileW = 40075016.686 * Math.cos(origLat * Math.PI / 180) / Math.pow(2, zoom);
    const sinLat0 = Math.sin(origLat * Math.PI / 180);
    const xTile0 = ((origLon + 180) / 360) * Math.pow(2, zoom);
    const yTile0 = (0.5 - Math.log((1 + sinLat0) / (1 - sinLat0)) / (4 * Math.PI)) * Math.pow(2, zoom);
    const sinLat = Math.sin(lat * Math.PI / 180);
    const xTile = ((lon + 180) / 360) * Math.pow(2, zoom);
    const yTile = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * Math.pow(2, zoom);
    return { x: (xTile - xTile0) * tileW, z: (yTile - yTile0) * tileW };
  };

  const wfPointInPolyXZ = (x, z, poly) => {
    if (!poly || poly.length < 3) return true;
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], zi = poly[i][1];
      const xj = poly[j][0], zj = poly[j][1];
      const intersect = ((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / ((zj - zi) || 1e-12) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  };

  const wfComputeBearingDeg = (lat1, lon1, lat2, lon2) => {
    const p1 = lat1 * Math.PI / 180;
    const p2 = lat2 * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const y = Math.sin(dLon) * Math.cos(p2);
    const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dLon);
    return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
  };

  const globalCapture = options.captureMode
    || (typeof document !== 'undefined' && document.getElementById('capture-mode')?.value)
    || 'stopAndShoot';
  const globalAlt = (options.altitude !== undefined && !isNaN(options.altitude))
    ? Number(options.altitude)
    : ((typeof document !== 'undefined' && parseFloat(document.getElementById('altitude')?.value)) || 50);
  const globalPitch = (options.gimbalPitch !== undefined && !isNaN(options.gimbalPitch))
    ? Number(options.gimbalPitch)
    : ((typeof document !== 'undefined' && typeof parseGimbalPitch === 'function')
      ? parseGimbalPitch(document.getElementById('gimbal-pitch')?.value, -60)
      : ((typeof document !== 'undefined' && parseFloat(document.getElementById('gimbal-pitch')?.value)) ?? -60));

  const activeLayer = options.layer || ((typeof getActiveLayer === 'function') ? getActiveLayer() : null);
  const layersArr = options.flightLayers || ((typeof flightLayers !== 'undefined' && Array.isArray(flightLayers)) ? flightLayers : []);

  const hasExplicitPhotos = Array.isArray(photoLocations) && photoLocations.length > 0;
  const sourceItems = hasExplicitPhotos ? photoLocations : (Array.isArray(waypoints) ? waypoints : []);

  if (sourceItems.length === 0) {
    return {
      status: 'insufficient',
      badgeText: 'No Waypoints',
      totalPlannedPhotos: 0,
      validPitchPhotos: 0,
      rejectedShallowPhotos: 0,
      marginalPitchPhotos: 0,
      stereoPairsCount: 0,
      avgBaselineMeters: 0,
      insideBoundaryCount: 0,
      hasBoundaryPolygon: false,
      canAutoOptimize: false,
      reasons: ['No waypoints or photo poses are defined in the active mission.'],
      recommendations: ['Draw or generate a flight pattern with at least 4 photo waypoints.']
    };
  }

  let originLat = options.origin?.lat ?? null;
  let originLon = options.origin?.lon ?? null;
  for (const item of sourceItems) {
    const act = item?.actual || {};
    const lat = item?.lat ?? act.lat;
    const lon = item?.lon ?? item?.lng ?? act.lon;
    if (typeof lat === 'number' && typeof lon === 'number' && !isNaN(lat) && !isNaN(lon)) {
      if (originLat === null) {
        originLat = lat;
        originLon = lon;
        break;
      }
    }
  }
  if (originLat === null) originLat = 41.3215;
  if (originLon === null) originLon = -88.9950;

  let boundaryPolyXZ = null;
  const rawPoly = options.boundaryPolygon || (activeLayer && Array.isArray(activeLayer.boundaryPolygon) ? activeLayer.boundaryPolygon : null);
  if (Array.isArray(rawPoly) && rawPoly.length >= 3) {
    boundaryPolyXZ = rawPoly.map(bp => {
      if (Array.isArray(bp) && bp.length >= 2) return [Number(bp[0]), Number(bp[1])];
      if (bp && typeof bp.x === 'number' && typeof bp.z === 'number') return [bp.x, bp.z];
      const lat = bp?.lat ?? bp?.latitude;
      const lon = bp?.lon ?? bp?.longitude ?? bp?.lng;
      if (typeof lat === 'number' && typeof lon === 'number') {
        const w = wfLatLonToWorld(lat, lon, originLat, originLon);
        return [w.x, w.z];
      }
      return null;
    }).filter(Boolean);
    if (boundaryPolyXZ.length < 3) boundaryPolyXZ = null;
  }

  let totalPlannedPhotos = 0;
  let rejectedShallowPhotos = 0;
  let marginalPitchPhotos = 0;
  let noGroundInterceptCount = 0;
  let videoOnlyCount = 0;
  let hoverNoPhotoCount = 0;
  const validPoses = [];

  for (let i = 0; i < sourceItems.length; i++) {
    const item = sourceItems[i];
    if (!item || item.skipPhoto || item.isDetour || item.isTransition) continue;

    const act = item.actual || {};
    const wpLayer = (item.layerId && layersArr.length > 0)
      ? layersArr.find(l => l.id === item.layerId)
      : activeLayer;

    let effCapture = globalCapture;
    if (wpLayer && wpLayer.captureMode && wpLayer.captureMode !== 'inherit') effCapture = wpLayer.captureMode;
    if (item.layerCaptureMode && item.layerCaptureMode !== 'inherit') effCapture = item.layerCaptureMode;
    if (item.captureMode && item.captureMode !== 'inherit') effCapture = item.captureMode;

    const isPhotoPose = hasExplicitPhotos || item.isPhoto || item.isPhotoSphere || item.isPhotoSpherePoint ||
      (Array.isArray(item.photoSphereActions) && item.photoSphereActions.length > 0) ||
      (effCapture !== 'video' && effCapture !== 'hover');

    if (!isPhotoPose) {
      if (effCapture === 'video') videoOnlyCount++;
      else hoverNoPhotoCount++;
      continue;
    }

    totalPlannedPhotos++;

    let effPitch = globalPitch;
    if (wpLayer && wpLayer.gimbalPitch !== undefined && wpLayer.gimbalPitch !== null && wpLayer.gimbalPitch !== 'inherit' && !isNaN(parseFloat(wpLayer.gimbalPitch))) {
      effPitch = parseFloat(wpLayer.gimbalPitch);
    }
    const itemPitch = item.pitch ?? item.gimbalPitch ?? act.gimbalPitch;
    if (itemPitch !== undefined && itemPitch !== null && itemPitch !== 'inherit' && !isNaN(parseFloat(itemPitch))) {
      effPitch = parseFloat(itemPitch);
    }

    if (effPitch > -20.0) {
      rejectedShallowPhotos++;
      continue;
    }
    if (effPitch > -35.0) {
      marginalPitchPhotos++;
    }

    const lat = item.lat ?? act.lat ?? originLat;
    const lon = item.lon ?? item.lng ?? act.lon ?? originLon;
    const altAgl = Math.max(5.0, Number(item.altAgl ?? item.altitude ?? item.alt ?? act.altAgl ?? act.alt ?? wpLayer?.altitude ?? globalAlt ?? 30));

    let wx = item.worldX;
    let wz = item.worldZ;
    if (wx === undefined || wz === undefined) {
      const w = wfLatLonToWorld(lat, lon, originLat, originLon);
      wx = w.x;
      wz = w.z;
    }

    let effYaw = item.yaw ?? item.heading ?? act.heading;
    if (effYaw === undefined || effYaw === null || isNaN(Number(effYaw))) {
      const next = sourceItems[i + 1];
      const prev = sourceItems[i - 1];
      if (next && typeof next.lat === 'number' && typeof (next.lon ?? next.lng) === 'number') {
        effYaw = wfComputeBearingDeg(lat, lon, next.lat, next.lon ?? next.lng);
      } else if (prev && typeof prev.lat === 'number' && typeof (prev.lon ?? prev.lng) === 'number') {
        effYaw = wfComputeBearingDeg(prev.lat, prev.lon ?? prev.lng, lat, lon);
      } else {
        effYaw = 0;
      }
    } else {
      effYaw = Number(effYaw);
    }

    const psi = effYaw * Math.PI / 180;
    const theta = effPitch * Math.PI / 180;
    const cosT = Math.cos(theta), sinT = Math.sin(theta);
    const fwdX = cosT * Math.sin(psi);
    const fwdY = sinT;
    const fwdZ = -cosT * Math.cos(psi);

    let gx = wx, gz = wz;
    if (Math.abs(fwdY) > 1e-4) {
      const tc = (0 - altAgl) / fwdY;
      if (tc > 0 && tc < 350) {
        gx = wx + fwdX * tc;
        gz = wz + fwdZ * tc;
      } else {
        noGroundInterceptCount++;
        continue;
      }
    } else {
      noGroundInterceptCount++;
      continue;
    }

    validPoses.push({ wx, wy: altAgl, wz, gx, gz, fwdX, fwdY, fwdZ, pitch: effPitch, yaw: effYaw });
  }

  let stereoPairsCount = 0;
  let baselineSum = 0;
  let tooCloseCount = 0;
  let tooFarCount = 0;
  let poorOverlapCount = 0;
  let wideAngleCount = 0;

  for (let i = 0; i < validPoses.length; i++) {
    const a = validPoses[i];
    for (let j = i + 1; j < validPoses.length; j++) {
      const b = validPoses[j];
      const avgAlt = Math.max(5.0, (a.wy + b.wy) / 2.0);
      const baseline = Math.hypot(a.wx - b.wx, a.wy - b.wy, a.wz - b.wz);
      const minB = Math.max(1.0, avgAlt * 0.03);
      const maxB = Math.max(20.0, avgAlt * 1.25);

      if (baseline < minB) { tooCloseCount++; continue; }
      if (baseline > maxB) { tooFarCount++; continue; }

      const gDist = Math.hypot(a.gx - b.gx, a.gz - b.gz);
      if (gDist > Math.max(35.0, avgAlt * 1.4)) { poorOverlapCount++; continue; }

      const cosAng = Math.max(-1.0, Math.min(1.0, a.fwdX * b.fwdX + a.fwdY * b.fwdY + a.fwdZ * b.fwdZ));
      const angDeg = Math.acos(cosAng) * 180 / Math.PI;
      if (angDeg > 80.0) { wideAngleCount++; continue; }

      stereoPairsCount++;
      baselineSum += baseline;
    }
  }

  const avgBaselineMeters = stereoPairsCount > 0 ? Math.round((baselineSum / stereoPairsCount) * 10) / 10 : 0;
  let insideBoundaryCount = validPoses.length;
  if (boundaryPolyXZ) {
    insideBoundaryCount = validPoses.filter(p => wfPointInPolyXZ(p.gx, p.gz, boundaryPolyXZ)).length;
  }

  const reasons = [];
  const recommendations = [];
  let canAutoOptimize = false;

  if (totalPlannedPhotos === 0) {
    if (videoOnlyCount > 0) {
      reasons.push(`Capture mode is set to Video (${videoOnlyCount} waypoints, 0 still photos).`);
      recommendations.push('Switch Capture Mode to "Stop & Shoot" or interval photos.');
      canAutoOptimize = true;
    } else if (hoverNoPhotoCount > 0) {
      reasons.push(`Capture mode is set to Hover Only (${hoverNoPhotoCount} waypoints, 0 still photos).`);
      recommendations.push('Switch Capture Mode to "Stop & Shoot" so photos are triggered.');
      canAutoOptimize = true;
    } else {
      reasons.push('No photo-capture waypoints detected in this flight plan.');
      recommendations.push('Ensure at least 4 waypoints trigger still photos.');
    }
  } else if (totalPlannedPhotos < 2) {
    reasons.push(`Only ${totalPlannedPhotos} photo planned (MVS requires >= 2 overlapping photos from distinct positions).`);
    recommendations.push('Add more waypoints or use a Grid / Target Splat / Orbit pattern.');
  }

  if (rejectedShallowPhotos > 0) {
    reasons.push(`${rejectedShallowPhotos} of ${totalPlannedPhotos} photos have shallow gimbal pitch (> -20°) and will be ignored by OpenCV 5 MVS.`);
    recommendations.push('Tilt gimbal pitch to -45° to -60° (oblique) or -90° (nadir).');
    canAutoOptimize = true;
  } else if (marginalPitchPhotos > 0 && validPoses.length > 0 && marginalPitchPhotos === validPoses.length) {
    reasons.push(`Gimbal pitch (-20° to -34°) is marginal for JS fallback; -45° to -60° is recommended.`);
    recommendations.push('Set gimbal pitch to -55° for reliable roof & wall triangulation.');
    canAutoOptimize = true;
  }

  if (noGroundInterceptCount > 0) {
    reasons.push(`${noGroundInterceptCount} camera rays exceed 350m slant range to ground.`);
    recommendations.push('Lower altitude or steepen gimbal pitch downward.');
    canAutoOptimize = true;
  }

  if (validPoses.length >= 2 && stereoPairsCount === 0) {
    if (tooCloseCount > 0 && tooFarCount === 0 && poorOverlapCount === 0) {
      reasons.push('All valid photos are stationary at the same coordinate (0m stereo baseline).');
      recommendations.push('Add spatial translation between shots (e.g. Grid, Double Grid, or Orbit).');
    } else if (tooFarCount > 0 && poorOverlapCount === 0) {
      reasons.push('Waypoints are spaced too far apart for stereo baseline pairing at this altitude.');
      recommendations.push('Increase photo overlap (75–80%) or raise flight altitude.');
      canAutoOptimize = true;
    } else if (poorOverlapCount > 0) {
      reasons.push('Camera ground footprints do not overlap enough (< 35m / 1.4x alt) between consecutive shots.');
      recommendations.push('Increase front/side overlap or point cameras toward a shared target.');
      canAutoOptimize = true;
    } else if (wideAngleCount > 0) {
      reasons.push('Camera viewing angles diverge > 80° between adjacent photos.');
      recommendations.push('Add intermediate waypoints/orbit steps so adjacent views stay within 80°.');
    } else {
      reasons.push('0 valid stereo baseline pairs formed from planned camera poses.');
    }
  }

  if (boundaryPolyXZ && validPoses.length > 0 && insideBoundaryCount === 0) {
    reasons.push('0 planned camera ground footprints intersect the active Layer Boundary Hull.');
    recommendations.push('Move the pattern over the Layer Boundary or uncheck "Boundary Hull" in the 3D Wireframe Toolkit.');
  }

  let status = 'insufficient';
  if (validPoses.length >= 4 && stereoPairsCount >= 2 && (!boundaryPolyXZ || insideBoundaryCount > 0)) {
    status = 'ready';
  } else if (validPoses.length >= 2 && stereoPairsCount >= 1 && (!boundaryPolyXZ || insideBoundaryCount > 0)) {
    status = 'marginal';
    if (reasons.length === 0) {
      reasons.push(`Only ${stereoPairsCount} stereo baseline pair detected (recommend >= 2 baselines & >= 4 photos).`);
      recommendations.push('Increase overlap or add another pass for stronger 3D plane fitting.');
    }
  }

  const badgeText = status === 'ready'
    ? `✅ Ready (${stereoPairsCount} Baselines)`
    : (status === 'marginal'
      ? `⚠️ Marginal (${stereoPairsCount} Baseline${stereoPairsCount === 1 ? '' : 's'})`
      : `❌ Insufficient (${stereoPairsCount} Baselines)`);

  return {
    status,
    badgeText,
    totalPlannedPhotos,
    validPitchPhotos: validPoses.length,
    rejectedShallowPhotos,
    marginalPitchPhotos,
    stereoPairsCount,
    avgBaselineMeters,
    insideBoundaryCount,
    hasBoundaryPolygon: Boolean(boundaryPolyXZ),
    canAutoOptimize,
    reasons,
    recommendations
  };
}

/**
 * One-click optimizer that adjusts the active layer's capture mode, gimbal pitch,
 * and grid overlap so the flight plan satisfies OpenCV 5 MVS 3D wireframe requirements.
 */
function optimizeLayerForWireframe() {
  if (typeof isRestoringUndoState === 'undefined' || !isRestoringUndoState) {
    if (typeof pushUndoSnapshot === 'function') {
      pushUndoSnapshot('Optimize Layer for 3D Wireframe');
    }
  }

  const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
  const captureEl = (typeof document !== 'undefined') ? document.getElementById('capture-mode') : null;
  const pitchEl = (typeof document !== 'undefined') ? document.getElementById('gimbal-pitch') : null;
  const pitchValEl = (typeof document !== 'undefined') ? document.getElementById('gimbal-pitch-val') : null;
  const frontOvEl = (typeof document !== 'undefined') ? document.getElementById('front-overlap') : null;
  const sideOvEl = (typeof document !== 'undefined') ? document.getElementById('side-overlap') : null;

  const currentCapture = (activeLayer && activeLayer.captureMode && activeLayer.captureMode !== 'inherit')
    ? activeLayer.captureMode
    : (captureEl ? captureEl.value : 'stopAndShoot');
  if (currentCapture === 'video' || currentCapture === 'hover') {
    if (activeLayer) activeLayer.captureMode = 'stopAndShoot';
    if (captureEl) captureEl.value = 'stopAndShoot';
  }

  const currentPitch = (activeLayer && activeLayer.gimbalPitch !== undefined && activeLayer.gimbalPitch !== 'inherit')
    ? parseFloat(activeLayer.gimbalPitch)
    : (pitchEl ? parseFloat(pitchEl.value) : -60);
  if (isNaN(currentPitch) || currentPitch > -35) {
    if (activeLayer) activeLayer.gimbalPitch = -55;
    if (pitchEl) pitchEl.value = '-55';
    if (pitchValEl) pitchValEl.textContent = '-55°';
  }

  const pat = activeLayer ? activeLayer.pattern : (typeof document !== 'undefined' ? document.getElementById('grid-type')?.value : '');
  if (pat === 'single' || pat === 'double' || pat === 'smart-oblique') {
    if (activeLayer) {
      if ((activeLayer.frontOverlap || 0) < 75) activeLayer.frontOverlap = 80;
      if ((activeLayer.sideOverlap || 0) < 70) activeLayer.sideOverlap = 75;
    }
    if (frontOvEl && parseFloat(frontOvEl.value) < 75) frontOvEl.value = '80';
    if (sideOvEl && parseFloat(sideOvEl.value) < 70) sideOvEl.value = '75';
  }

  if (typeof saveActiveLayerFromUi === 'function') saveActiveLayerFromUi();
  if (typeof updateGrid === 'function') updateGrid();

  if (typeof showToast === 'function') {
    showToast('🏗️ Layer optimized for 3D Wireframe (Stop & Shoot, -55° oblique pitch)', 'success');
  }
}

// Update stats panel UI elements
function updateStatsPanel(stats) {
  if (typeof document === 'undefined' || !document || !document.getElementById) return;
  if (centerMarker && typeof centerMarker.getLatLng === 'function') {
    fetchAndProcessWeather(centerMarker.getLatLng().lat, centerMarker.getLatLng().lng);
    if (typeof fetchAndProcessTFRs === 'function') {
      fetchAndProcessTFRs(centerMarker.getLatLng().lat, centerMarker.getLatLng().lng);
    }
  }
  const warningsEl = document.getElementById('stats-warnings');
  const headerSummaryEl = document.getElementById('header-telemetry-summary');
  const sidebarSummaryText = document.getElementById('sidebar-summary-text');
  const popWaypoints = document.getElementById('pop-stat-waypoints');
  const popPhotos = document.getElementById('pop-stat-photos');
  const popDistance = document.getElementById('pop-stat-distance');
  const popTime = document.getElementById('pop-stat-time');
  const popSpacing = document.getElementById('pop-stat-line-spacing');
  const popInterval = document.getElementById('pop-stat-photo-interval');

  const statWps = document.getElementById('stat-waypoints');
  const statPhotos = document.getElementById('stat-photos');
  const statLineSpacing = document.getElementById('stat-line-spacing');
  const statPhotoInterval = document.getElementById('stat-photo-interval');
  const statDistance = document.getElementById('stat-distance');
  const statFlightTime = document.getElementById('stat-flight-time');
  const statWireframeReadiness = document.getElementById('stat-wireframe-readiness');
  const dockLayerSummary = document.getElementById('dock-layer-summary');
  const dockWaypointSummary = document.getElementById('dock-waypoint-summary');

  if (!stats) {
    if (statWps) statWps.textContent = "-";
    if (statPhotos) statPhotos.textContent = "-";
    if (statLineSpacing) statLineSpacing.textContent = "-";
    if (statPhotoInterval) statPhotoInterval.textContent = "-";
    if (statDistance) statDistance.textContent = "-";
    if (statFlightTime) statFlightTime.textContent = "-";
    if (statWireframeReadiness) {
      statWireframeReadiness.textContent = "-";
      statWireframeReadiness.style.color = '';
    }
    if (headerSummaryEl) headerSummaryEl.textContent = "0 WPs • 0.0 km • 0m 0s";
    if (sidebarSummaryText) {
      const weatherSnippet = document.getElementById('header-weather-summary')?.textContent || '☀️ Weather';
      sidebarSummaryText.textContent = `⚡ 0 WPs • 0.0 km • 0m 0s • ${weatherSnippet}`;
    }
    if (dockLayerSummary) {
      const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
      const count = (typeof flightLayers !== 'undefined') ? flightLayers.length : 1;
      dockLayerSummary.textContent = `${count} Layer${count === 1 ? '' : 's'}${activeLayer ? ` • ${activeLayer.name}` : ''}`;
    }
    if (dockWaypointSummary) {
      dockWaypointSummary.textContent = "0 WPs • 0.0 km • 0m 0s";
    }
    if (popWaypoints) popWaypoints.textContent = "-";
    if (popPhotos) popPhotos.textContent = "-";
    if (popDistance) popDistance.textContent = "-";
    if (popTime) popTime.textContent = "-";
    if (popSpacing) popSpacing.textContent = "-";
    if (popInterval) popInterval.textContent = "-";
    if (warningsEl) {
      warningsEl.classList.add('hidden');
    }
    return;
  }

  const unit = (typeof getUnitSystem === 'function') ? getUnitSystem() : 'metric';

  if (statWps) statWps.textContent = stats.waypointsCount;
  const activeWps = (typeof waypoints !== 'undefined' && Array.isArray(waypoints)) ? waypoints : ((typeof generatedWaypoints !== 'undefined' && Array.isArray(generatedWaypoints)) ? generatedWaypoints : []);
  const isHyperlapseActive = (typeof getActiveLayer === 'function' && getActiveLayer()?.pattern === 'hyperlapse') || activeWps.some(w => w && (w.isHyperlapse || w.gridType === 'hyperlapse'));
  const activeLayerForCap = typeof getActiveLayer === 'function' ? getActiveLayer() : null;
  const captureModeVal = (typeof getEffectiveLayerCaptureMode === 'function' && activeLayerForCap)
    ? getEffectiveLayerCaptureMode(activeLayerForCap)
    : ((typeof document !== 'undefined' && document.getElementById('capture-mode')) ? document.getElementById('capture-mode').value : 'stopAndShoot');
  const photoText = (captureModeVal === 'video') ? "Video (Record)" : (isHyperlapseActive ? `${stats.photoCount} frames` : stats.photoCount);
  if (statPhotos) statPhotos.textContent = photoText;

  // Update Section 2 Hyperlapse Frame & Duration Badges if active
  const hlBadge = document.getElementById('hyperlapse-frame-badge');
  const hlDurationBadge = document.getElementById('hyperlapse-duration-badge');
  if (isHyperlapseActive) {
    const clip24 = (stats.photoCount / 24).toFixed(1);
    const clip30 = (stats.photoCount / 30).toFixed(1);
    if (hlBadge) {
      hlBadge.textContent = `${stats.photoCount} Frames (${clip30}s Clip @ 30fps)`;
    }
    if (hlDurationBadge) {
      hlDurationBadge.textContent = `Clip: ${clip30}s (30fps) | ${clip24}s (24fps)`;
    }
  }

  // Format spacing
  const lineSpacingStr = (stats.lineSpacing !== null && stats.lineSpacing !== undefined) ? formatDistance(stats.lineSpacing) : "N/A";
  const photoSpacingStr = (stats.photoSpacing !== null && stats.photoSpacing !== undefined) ? formatDistance(stats.photoSpacing) : "N/A";
  if (statLineSpacing) statLineSpacing.textContent = lineSpacingStr;
  if (statPhotoInterval) statPhotoInterval.textContent = photoSpacingStr;

  // Format total distance
  let distStr = "";
  if (unit === 'imperial') {
    const feet = stats.distance * M_TO_FT;
    if (feet > 5280) {
      distStr = `${(feet / 5280).toFixed(2)} mi`;
    } else {
      distStr = `${Math.round(feet)} ft`;
    }
  } else {
    if (stats.distance > 1000) {
      distStr = `${(stats.distance / 1000).toFixed(2)} km`;
    } else {
      distStr = `${Math.round(stats.distance)} m`;
    }
  }
  if (statDistance) statDistance.textContent = distStr;
  if (statFlightTime) statFlightTime.textContent = stats.timeStr;
  if (statWireframeReadiness) {
    const wf = stats.wireframeReadiness;
    if (wf) {
      statWireframeReadiness.textContent = wf.badgeText;
      statWireframeReadiness.style.color = wf.status === 'ready' ? '#34d399' : (wf.status === 'marginal' ? '#fbbf24' : '#f87171');
      statWireframeReadiness.title = wf.reasons && wf.reasons.length > 0 ? wf.reasons.join(' ') : 'OpenCV 5 MVS 3D Wireframe stereo baseline readiness';
    } else {
      statWireframeReadiness.textContent = '-';
      statWireframeReadiness.style.color = '';
    }
  }

  // Sync Header & Popover Telemetry
  const clipInfoStr = isHyperlapseActive ? ` (${(stats.photoCount / 30).toFixed(1)}s clip)` : '';
  const summaryStr = `${stats.waypointsCount} WPs • ${distStr} • ${stats.timeStr}${clipInfoStr}`;
  if (headerSummaryEl) headerSummaryEl.textContent = summaryStr;
  if (sidebarSummaryText) {
    const weatherSnippet = document.getElementById('header-weather-summary')?.textContent || '☀️ Weather';
    sidebarSummaryText.textContent = `⚡ ${summaryStr} • ${weatherSnippet}`;
  }
  if (popWaypoints) popWaypoints.textContent = stats.waypointsCount;
  if (popPhotos) popPhotos.textContent = photoText;
  if (popDistance) popDistance.textContent = distStr;
  if (popTime) popTime.textContent = stats.timeStr;
  if (popSpacing) popSpacing.textContent = lineSpacingStr;
  if (popInterval) popInterval.textContent = photoSpacingStr;

  // Sync Sticky Bottom Action Dock Summary
  if (dockLayerSummary) {
    const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
    const count = (typeof flightLayers !== 'undefined') ? flightLayers.length : 1;
    dockLayerSummary.textContent = `${count} Layer${count === 1 ? '' : 's'}${activeLayer ? ` • ${activeLayer.name}` : ''}`;
  }
  if (dockWaypointSummary) {
    dockWaypointSummary.textContent = summaryStr;
  }

  // Warnings display
  if (warningsEl) {
    warningsEl.textContent = '';
    let hasWarnings = false;
    
    // Check isolated waypoints
    if (stats.hasIsolatedWaypoint) {
      const formattedGap = formatDistance(stats.maxNearestNeighborDist);
      const limitStr = unit === 'imperial' ? "328 ft" : "100m";

      const div = document.createElement('div');
      const strong = document.createElement('strong');
      strong.textContent = 'Warning:';
      div.appendChild(document.createTextNode('⚠️ '));
      div.appendChild(strong);
      div.appendChild(document.createTextNode(` Waypoints are isolated (>${limitStr} from any other)! (Max gap: ${formattedGap})`));
      warningsEl.appendChild(div);
      hasWarnings = true;
    }

    // Check geolocation distance
    if (stats.isFarFromTakeoff) {
      const formattedUserDist = formatDistance(stats.userDistanceToTakeoff);
      const limitStr = unit === 'imperial' ? "2000 ft" : "609.6m";

      const div = document.createElement('div');
      div.style.marginTop = '4px';
      const strong = document.createElement('strong');
      strong.textContent = 'Geolocation Warning:';
      div.appendChild(document.createTextNode('⚠️ '));
      div.appendChild(strong);
      div.appendChild(document.createTextNode(` Pilot is far from takeoff location (>${limitStr} away)! (Distance: ${formattedUserDist})`));
      warningsEl.appendChild(div);
      hasWarnings = true;
    }

    // Check TFR intersections
    if (stats.intersectingActiveTfrs && stats.intersectingActiveTfrs.length > 0) {
      const div = document.createElement('div');
      div.style.marginTop = '4px';
      const strong = document.createElement('strong');
      strong.textContent = 'Active TFR Conflict:';
      div.appendChild(document.createTextNode('🚫 '));
      div.appendChild(strong);
      const names = stats.intersectingActiveTfrs.map(t => `${t.notamId}`).slice(0, 3).join(', ');
      div.appendChild(document.createTextNode(` Flight path intersects active FAA Temporary Flight Restriction (${names})!`));
      warningsEl.appendChild(div);
      hasWarnings = true;
    } else if (stats.intersectingUpcomingTfrs && stats.intersectingUpcomingTfrs.length > 0) {
      const div = document.createElement('div');
      div.style.marginTop = '4px';
      const strong = document.createElement('strong');
      strong.textContent = 'Upcoming TFR Notice:';
      div.appendChild(document.createTextNode('⏱️ '));
      div.appendChild(strong);
      const details = stats.intersectingUpcomingTfrs.map(t => `${t.notamId} (${t.countdown || 'upcoming'})`).slice(0, 3).join(', ');
      div.appendChild(document.createTextNode(` Flight path intersects scheduled TFR (${details}). Verify flight concludes before restriction activates.`));
      warningsEl.appendChild(div);
      hasWarnings = true;
    } else if (stats.intersectingTfrs && stats.intersectingTfrs.length > 0) {
      const div = document.createElement('div');
      div.style.marginTop = '4px';
      const strong = document.createElement('strong');
      strong.textContent = 'Active TFR Conflict:';
      div.appendChild(document.createTextNode('🚫 '));
      div.appendChild(strong);
      const names = stats.intersectingTfrs.map(t => `${t.notamId}`).slice(0, 3).join(', ');
      div.appendChild(document.createTextNode(` Flight path intersects active FAA Temporary Flight Restriction (${names})!`));
      warningsEl.appendChild(div);
      hasWarnings = true;
    }

    // Check 3D Wireframe / MVS Stereo Readiness
    if (stats.wireframeReadiness && stats.wireframeReadiness.status !== 'ready') {
      const wf = stats.wireframeReadiness;
      const div = document.createElement('div');
      div.id = 'stats-wireframe-warning';
      div.style.marginTop = '4px';
      const strong = document.createElement('strong');
      strong.textContent = '3D Wireframe Readiness:';
      div.appendChild(document.createTextNode(wf.status === 'marginal' ? '⚠️ ' : '🏗️ '));
      div.appendChild(strong);
      const reasonText = (wf.reasons && wf.reasons.length > 0) ? wf.reasons[0] : 'Insufficient stereo baselines for 3D wireframe.';
      div.appendChild(document.createTextNode(` ${reasonText}`));

      if (wf.canAutoOptimize && typeof document.createElement === 'function') {
        const optBtn = document.createElement('button');
        optBtn.id = 'btn-optimize-wireframe-plan';
        optBtn.type = 'button';
        optBtn.textContent = '✨ Optimize for 3D Wireframe';
        optBtn.style.cssText = 'display: inline-block; margin-top: 4px; margin-left: 6px; padding: 2px 7px; font-size: 0.68rem; font-weight: 600; border-radius: 4px; background: rgba(56, 189, 248, 0.16); border: 1px solid rgba(56, 189, 248, 0.45); color: #38bdf8; cursor: pointer;';
        optBtn.addEventListener('click', () => {
          if (typeof optimizeLayerForWireframe === 'function') optimizeLayerForWireframe();
        });
        div.appendChild(optBtn);
      }

      warningsEl.appendChild(div);
      hasWarnings = true;
    }

    if (hasWarnings) {
      warningsEl.classList.remove('hidden');
    } else {
      warningsEl.classList.add('hidden');
    }
  }
}

// Generate the WPML template.kml content
