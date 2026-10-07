function calculateStats(waypoints, photoLocations, speed, sLine, sPhoto, captureMode) {
  if (waypoints.length < 2) return null;

  // 1. Calculate path length in meters
  let totalDistance = 0;
  for (let i = 1; i < waypoints.length; i++) {
    const p1 = waypoints[i - 1];
    const p2 = waypoints[i];
    const d = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
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
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dSq = dx * dx + dy * dy;
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
  const photoCount = photoLocations ? photoLocations.length : (waypoints ? waypoints.length : 0);
  // 3. Est flight time (accounting for stop-and-shoot hover delays)
  let flightTimeSeconds = totalDistance / speed;
  if (captureMode === 'stopAndShoot') {
    flightTimeSeconds += photoCount * 4.5;
  }
  
  // Sum hover times across all waypoints
  const globalHoverEl = document.getElementById('global-hover-time');
  const globalHover = globalHoverEl ? (parseInt(globalHoverEl.value) || 0) : 0;

  let totalHoverSeconds = 0;
  waypoints.forEach((wp, idx) => {
    const wpCapture = (wp.captureMode && wp.captureMode !== 'inherit') ? wp.captureMode : (wp.layerCaptureMode && wp.layerCaptureMode !== 'inherit') ? wp.layerCaptureMode : captureMode;
    const wpIsStopAndShoot = wpCapture === 'stopAndShoot';

    let baseHover = globalHover;
    if (wp.layerHoverTime !== undefined && wp.layerHoverTime !== null && wp.layerHoverTime !== 'inherit') {
      baseHover = parseInt(wp.layerHoverTime, 10) || 0;
    }
    if (wp.hoverTime !== null && wp.hoverTime !== undefined && wp.hoverTime !== 'inherit') {
      baseHover = parseInt(wp.hoverTime, 10) || 0;
    }
    let wpEffectiveHover = baseHover;

    const autoSettling = wp.autoSettlingEnabled !== false;
    const baseSettling = wp.baseSettlingTime !== undefined ? wp.baseSettlingTime : 2.0;
    const majorTurnSettling = wp.majorTurnSettlingTime !== undefined ? wp.majorTurnSettlingTime : 5.0;
    const modTurnSettling = wp.moderateTurnSettlingTime !== undefined ? wp.moderateTurnSettlingTime : 4.0;
    const pitchSettling = wp.pitchSettlingTime !== undefined ? wp.pitchSettlingTime : 3.0;

    const reposInfo = checkNeedsReposition(idx, waypoints);
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

    if (wpIsStopAndShoot && autoSettling && reposInfo.needsReposition) {
      let settlingDelay = baseSettling;
      if (isTargetSplat && idx > 0) {
        if (reposInfo.headingDiff >= 60) {
          settlingDelay = Math.max(settlingDelay, majorTurnSettling);
        } else if (reposInfo.headingDiff >= 25) {
          settlingDelay = Math.max(settlingDelay, modTurnSettling);
        } else if (reposInfo.isGimbalChanged) {
          settlingDelay = Math.max(settlingDelay, pitchSettling);
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
  if (typeof tfrActiveFeatures !== 'undefined' && Array.isArray(tfrActiveFeatures) && tfrActiveFeatures.length > 0) {
    for (const feat of tfrActiveFeatures) {
      if (!feat.geometry) continue;
      const hit = waypoints.some(wp => {
        if (!wp) return false;
        const lat = wp.lat !== undefined ? wp.lat : wp.origLat;
        const lon = wp.lon !== undefined ? wp.lon : wp.origLon;
        if (lat == null || lon == null || isNaN(lat) || isNaN(lon)) return false;
        return (typeof isPointInGeoJsonPolygon === 'function') && isPointInGeoJsonPolygon(lat, lon, feat.geometry);
      });
      if (hit) {
        intersectingTfrs.push({
          notamId: feat.properties?.NOTAM_KEY || feat.properties?.notam_id || feat.id || 'Active TFR',
          name: feat.properties?.TITLE || feat.properties?.NAME || 'TFR'
        });
      }
    }
  }

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
    intersectingTfrs: intersectingTfrs
  };
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
  const dockLayerSummary = document.getElementById('dock-layer-summary');
  const dockWaypointSummary = document.getElementById('dock-waypoint-summary');

  if (!stats) {
    if (statWps) statWps.textContent = "-";
    if (statPhotos) statPhotos.textContent = "-";
    if (statLineSpacing) statLineSpacing.textContent = "-";
    if (statPhotoInterval) statPhotoInterval.textContent = "-";
    if (statDistance) statDistance.textContent = "-";
    if (statFlightTime) statFlightTime.textContent = "-";
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
  const captureModeVal = (typeof document !== 'undefined' && document.getElementById('capture-mode')) ? document.getElementById('capture-mode').value : 'stopAndShoot';
  const photoText = (captureModeVal === 'video') ? "Video (Record)" : (isHyperlapseActive ? `${stats.photoCount} frames` : stats.photoCount);
  if (statPhotos) statPhotos.textContent = photoText;

  // Update Section 2 Hyperlapse Frame Badge if active
  const hlBadge = document.getElementById('hyperlapse-frame-badge');
  if (hlBadge && isHyperlapseActive) {
    const clipDurationSec = (stats.photoCount / 30).toFixed(1);
    hlBadge.textContent = `${stats.photoCount} Frames (${clipDurationSec}s Clip @ 30fps)`;
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
    if (stats.intersectingTfrs && stats.intersectingTfrs.length > 0) {
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

    if (hasWarnings) {
      warningsEl.classList.remove('hidden');
    } else {
      warningsEl.classList.add('hidden');
    }
  }
}

// Generate the WPML template.kml content
