function exportKMZ() {
  if (!centerMarker) {
    alert("Please select a flight mission center on the map first.");
    return;
  }

  const centerLatLng = centerMarker.getLatLng();
  const centerLat = centerLatLng.lat;
  const centerLon = centerLatLng.lng;

  // Retrieve slider values
  const gridWidth = parseFloat(document.getElementById('grid-width').value);
  const gridHeight = parseFloat(document.getElementById('grid-height').value);
  const rotation = parseFloat(document.getElementById('grid-rotation').value);
  const gridType = document.getElementById('grid-type').value;
  const overlapFront = parseFloat(document.getElementById('front-overlap').value) / 100.0;
  const overlapSide = parseFloat(document.getElementById('side-overlap').value) / 100.0;
  const altitude = parseFloat(document.getElementById('altitude').value);
  const speed = parseFloat(document.getElementById('speed').value);
  const headingMode = document.getElementById('heading-mode').value;
  const finishAction = document.getElementById('finish-action').value;
  const gimbalPitch = parseGimbalPitch(document.getElementById('gimbal-pitch')?.value, -60);
  const captureMode = document.getElementById('capture-mode').value;
  const pathMode = document.getElementById('path-mode').value;

  let waypoints = [];
  const currentWps = getCurrentWaypoints();

  if (currentWps && currentWps.length > 0) {
    waypoints = currentWps.map(wp => {
      const pitch = wp.pitch !== undefined && wp.pitch !== null ? wp.pitch : gimbalPitch;
      return {
        ...wp,
        lat: wp.lat,
        lon: wp.lon,
        alt: wp.alt,
        pitch: pitch,
        speed: wp.speed !== undefined && wp.speed !== null ? wp.speed : speed,
        heading: wp.heading,
        isRingStart: wp.isRingStart || false,
        ringIndex: wp.ringIndex !== undefined ? wp.ringIndex : null,
        poiIndex: wp.poiIndex !== undefined ? wp.poiIndex : null,
        headingMode: wp.headingMode !== undefined ? wp.headingMode : null
      };
    });
  }

  if (waypoints.length === 0) {
    alert("No waypoints generated. Please check your grid dimensions and overlap settings.");
    return;
  }

  // Check isolated waypoints
  let maxNearestNeighborDist = 0;
  for (let i = 0; i < currentWps.length; i++) {
    const p1 = currentWps[i];
    let minDist = Infinity;
    for (let j = 0; j < currentWps.length; j++) {
      if (i === j) continue;
      const p2 = currentWps[j];
      const d = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
      if (d < minDist) {
        minDist = d;
      }
    }
    if (minDist !== Infinity && minDist > maxNearestNeighborDist) {
      maxNearestNeighborDist = minDist;
    }
  }
  const hasIsolatedWaypoint = maxNearestNeighborDist > 100.0;

  // Check geolocation
  let isFarFromTakeoff = false;
  let userDistanceToTakeoff = null;
  if (userLocation && waypoints.length > 0) {
    const takeoffL = L.latLng(waypoints[0].lat, waypoints[0].lon);
    const userL = L.latLng(userLocation.lat, userLocation.lon);
    userDistanceToTakeoff = userL.distanceTo(takeoffL);
    isFarFromTakeoff = userDistanceToTakeoff > 609.6;
  }

  // Construct confirmation warning
  let warningMessage = "";
  if (hasIsolatedWaypoint) {
    const formattedGap = formatDistance(maxNearestNeighborDist);
    const limitStr = getUnitSystem() === 'imperial' ? "328 ft" : "100m";
    warningMessage += `• Waypoint Separation: There are waypoints separated by more than ${limitStr} from any other (Max gap: ${formattedGap}). This might affect flight safety.\n\n`;
  }
  if (isFarFromTakeoff) {
    const formattedDist = formatDistance(userDistanceToTakeoff);
    const limitStr = getUnitSystem() === 'imperial' ? "2000 ft" : "609.6m";
    warningMessage += `• Geolocation Check: Your current pilot position is more than ${limitStr} away from the takeoff area (Takeoff distance: ${formattedDist}). Please ensure you are at the correct flight location.\n\n`;
  }

  // Pre-flight Drone Camera & Safety Checklist (v1.94.1)
  const isVideoAspect = (typeof CAMERA_ASPECT_RATIO === 'string' && CAMERA_ASPECT_RATIO === '16:9');
  const aspectFormatStr = isVideoAspect ? '16:9 Widescreen (Vertical Crop - 69.7° × 44.2°)' : '4:3 Native (Full Sensor - 69.7° × 55.2°)';
  const aspectNotice = 
    `🚨 CRITICAL ON-DRONE CAMERA SETTING:\n` +
    `  • Mission Camera Aspect Ratio: ${aspectFormatStr}\n` +
    `  • In DJI Fly > Camera Settings on your controller, confirm camera aspect ratio is set to ${isVideoAspect ? '16:9 (Widescreen)' : '4:3 (Native)'} before takeoff (applicable whether capturing still photos or recording video).\n` +
    `  • Waypoint line spacing and photo triggers were mathematically calculated for this ratio to achieve ${Math.round(overlapFront * 100)}% front / ${Math.round(overlapSide * 100)}% side overlap. Flying with a mismatched ratio will compromise photogrammetric overlap or framing!\n\n`;

  const onDroneBestSettings = 
    `📋 RECOMMENDED ON-DRONE SETTINGS (Not Controllable via KMZ):\n` +
    `  1. Focus Mode: Set to Manual Focus (MF) locked to infinity (∞) before pressing Go to eliminate autofocus hunting between waypoints.\n` +
    `  2. Shutter / Exposure: Use Shutter Priority (1/1000s or faster for sharp imagery) or Manual Exposure to eliminate motion blur.\n` +
    `  3. Obstacle Sensing: Verify APAS / Obstacle Avoidance is configured appropriately for the site in DJI Fly.\n` +
    `  4. Max Flight Altitude: Ensure DJI Fly safety altitude limit exceeds mission altitude (${altitude}m).\n` +
    `  5. Return-to-Home (RTH): Confirm Home Point is updated and RTH height clears all surrounding obstacles.\n\n`;

  const pressGoWarning = 
    `⚠️ "Press Go" Upload Notice:\n` +
    `Waypoint missions may fail to start if:\n` +
    `  • The drone does not have a strong GPS lock (at least 10+ satellites) at takeoff.\n` +
    `  • You are too far away from the first waypoint.\n` +
    `  • The flight area lies within an unauthorized NFZ / Geozone.\n\n`;

  let confirmMessage = "";
  if (warningMessage) {
    confirmMessage = `Safety Warning Details:\n\n${warningMessage}${aspectNotice}${onDroneBestSettings}${pressGoWarning}Do you acknowledge these camera & flight settings and wish to export the KMZ?`;
  } else {
    confirmMessage = `${aspectNotice}${onDroneBestSettings}${pressGoWarning}Do you acknowledge these camera & flight settings and wish to export the KMZ?`;
  }

  if (!confirm(confirmMessage)) {
    return;
  }

  // 4. Generate XML contents and KMZ package
  generateKMZBlob().then(function (result) {
    if (!result || !result.blob) return;

    const link = document.createElement("a");
    link.href = URL.createObjectURL(result.blob);
    
    const storedUuid = getRC2UUID();
    let downloadBase = "";
    const isoTimestamp = formatISO8601ForFilename();
    if (importedFileName) {
      link.download = importedFileName;
      downloadBase = importedFileName.replace(/\.kmz$/i, "");
    } else if (storedUuid && RC2_UUID_PATTERN.test(storedUuid)) {
      link.download = `${storedUuid}.kmz`;
      downloadBase = storedUuid;
    } else {
      link.download = `GridMission_Alt${altitude}m_${isoTimestamp}.kmz`;
      downloadBase = `GridMission_Alt${altitude}m_${isoTimestamp}`;
    }
    link.click();

    // Also auto-export comprehensive Flight Diagnostics JSON (User Agent, 3D Simulation, Plan, & Camera)
    try {
      const diagData = buildFlightDiagnosticsJSON(waypoints, {
        altitude,
        speed,
        gimbalPitch,
        filename: link.download,
        uuid: storedUuid || downloadBase,
        validation: result.validation,
        isValid: result.validation ? result.validation.valid : true,
        wpmlXml: result.waylinesWpml,
        templateXml: result.templateKml
      });

      // If bad or invalid KMZ, save to local browser history
      if (diagData && (!diagData.isValid || (diagData.validationErrors && diagData.validationErrors.length > 0))) {
        try {
          if (typeof localStorage !== 'undefined') {
            const rawHist = localStorage.getItem('aalaapi_bad_kmz_history');
            const badHist = rawHist ? JSON.parse(rawHist) : [];
            badHist.unshift({
              archive_id: diagData.archiveId || `${diagData.uuid}_${diagData.createdAt}`,
              uuid: diagData.uuid,
              filename: diagData.filename,
              created_at: diagData.createdAt,
              flight_pattern: diagData.flightPattern,
              waypoint_count: diagData.summary?.waypointCount || waypoints.length,
              validation_rules_passed: diagData.validationRulesPassed,
              validation_errors: diagData.validationErrors,
              is_valid: 0,
              execution_status: 'invalid'
            });
            localStorage.setItem('aalaapi_bad_kmz_history', JSON.stringify(badHist.slice(0, 20)));
          }
        } catch (storageErr) {}
      }

      if (diagData && typeof Blob !== 'undefined' && typeof document !== 'undefined') {
        const jsonBlob = new Blob([JSON.stringify(diagData, null, 2)], { type: "application/json" });
        const jsonLink = document.createElement("a");
        jsonLink.href = URL.createObjectURL(jsonBlob);
        jsonLink.download = `${downloadBase}_diag.json`;
        jsonLink.click();
      }

      // Automatically archive diagnostics to local Companion SQLite service if running
      if (typeof fetch !== 'undefined') {
        const apiBase = typeof getCompanionApiBase === 'function' ? getCompanionApiBase() : 'http://127.0.0.1:8765';
        fetch(`${apiBase}/api/diagnostics/archive`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(diagData)
        }).catch(() => {
          // Companion service offline - file was already downloaded locally
        });
      }
    } catch (e) {
      if (typeof Logger !== 'undefined' && Logger.warn) Logger.warn("Could not export diagnostics JSON:", e);
    }
  }).catch(err => {
    Logger.error("ZIP creation failed:", err);
    alert("An error occurred while creating the KMZ file. Check console for details.");
  });
}

// ─── Multi-Vendor Autopilot Generators & Exporters ──────────────────────────

function buildQgcMissionPlan(waypoints, options = {}) {
  const cruiseSpeed = options.speed || 4.0;
  const hoverSpeed = 3.0;
  const defaultAlt = options.altitude || 50.0;
  const globalPitch = options.gimbalPitch !== undefined ? options.gimbalPitch : -90.0;
  const home = options.homePosition || (waypoints && waypoints.length > 0 ? [waypoints[0].lat, waypoints[0].lon, defaultAlt] : [0, 0, 0]);

  const items = [];
  let seq = 1;

  // 1. Takeoff Command (Command 22 = MAV_CMD_NAV_TAKEOFF)
  items.push({
    AMSLAltAboveTerrain: null,
    Altitude: defaultAlt,
    AltitudeMode: 1,
    autoContinue: true,
    command: 22,
    doJumpId: seq,
    frame: 3,
    params: [15, 0, 0, null, home[0], home[1], defaultAlt],
    type: "SimpleItem"
  });
  seq++;

  // 2. Set Gimbal Pitch (Command 205 = MAV_CMD_DO_MOUNT_CONTROL)
  items.push({
    AMSLAltAboveTerrain: null,
    Altitude: defaultAlt,
    AltitudeMode: 1,
    autoContinue: true,
    command: 205,
    doJumpId: seq,
    frame: 2,
    params: [globalPitch, 0, 0, 0, 0, 0, 2],
    type: "SimpleItem"
  });
  seq++;

  // 3. Waypoint Items (Command 16 = MAV_CMD_NAV_WAYPOINT)
  (waypoints || []).forEach((wp) => {
    const lat = wp.lat;
    const lon = wp.lon;
    const alt = wp.alt !== undefined ? wp.alt : (wp.altitude !== undefined ? wp.altitude : defaultAlt);
    const yaw = wp.heading !== undefined ? wp.heading : null;
    const hoverTime = wp.hoverTime !== undefined ? wp.hoverTime : (wp.isPhoto ? 2 : 0);

    items.push({
      AMSLAltAboveTerrain: null,
      Altitude: alt,
      AltitudeMode: 1,
      autoContinue: true,
      command: 16,
      doJumpId: seq,
      frame: 3,
      params: [hoverTime, 2, 0, yaw, lat, lon, alt],
      type: "SimpleItem"
    });
    seq++;

    if (wp.isPhoto) {
      // Camera shutter trigger (Command 203 = MAV_CMD_DO_DIGICAM_CONTROL)
      items.push({
        AMSLAltAboveTerrain: null,
        Altitude: alt,
        AltitudeMode: 1,
        autoContinue: true,
        command: 203,
        doJumpId: seq,
        frame: 2,
        params: [0, 0, 0, 0, 1, 0, 0],
        type: "SimpleItem"
      });
      seq++;
    }
  });

  // 4. Return To Launch (Command 20 = MAV_CMD_NAV_RETURN_TO_LAUNCH)
  items.push({
    AMSLAltAboveTerrain: null,
    Altitude: defaultAlt,
    AltitudeMode: 1,
    autoContinue: true,
    command: 20,
    doJumpId: seq,
    frame: 2,
    params: [0, 0, 0, 0, 0, 0, 0],
    type: "SimpleItem"
  });

  return {
    fileType: "Plan",
    geoFence: { circles: [], polygons: [], version: 2 },
    groundStation: "QGroundControl",
    mission: {
      cruiseSpeed: cruiseSpeed,
      firmwareType: 12,
      hoverSpeed: hoverSpeed,
      items: items,
      plannedHomePosition: home,
      vehicleType: 2,
      version: 2
    },
    rallyPoints: { points: [], version: 2 },
    version: 1
  };
}

function buildAutelMissionKml(waypoints, options = {}) {
  const name = options.name || 'Autel_Mission';
  const speed = options.speed || 4.0;
  const defaultAlt = options.altitude || 50.0;
  const gimbalPitch = options.gimbalPitch !== undefined ? options.gimbalPitch : -90.0;

  let placemarksXml = '';
  (waypoints || []).forEach((wp, idx) => {
    const lat = wp.lat;
    const lon = wp.lon;
    const alt = wp.alt !== undefined ? wp.alt : (wp.altitude !== undefined ? wp.altitude : defaultAlt);
    const pitch = wp.pitch !== undefined ? wp.pitch : (wp.gimbalPitch !== undefined ? wp.gimbalPitch : gimbalPitch);
    const heading = wp.heading !== undefined ? wp.heading : 0;

    placemarksXml += `
        <Placemark>
          <name>Waypoint ${idx + 1}</name>
          <description>Autel Waypoint ${idx + 1}</description>
          <Point>
            <altitudeMode>relativeToGround</altitudeMode>
            <coordinates>${lon},${lat},${alt}</coordinates>
          </Point>
          <ExtendedData>
            <Data name="speed"><value>${speed}</value></Data>
            <Data name="gimbalPitch"><value>${pitch}</value></Data>
            <Data name="heading"><value>${heading}</value></Data>
            <Data name="action"><value>${wp.isPhoto ? 'takePhoto' : 'none'}</value></Data>
          </ExtendedData>
        </Placemark>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${name}</name>
    <Folder>
      <name>Waypoints</name>${placemarksXml}
    </Folder>
  </Document>
</kml>`;
}

function exportQgcPlan() {
  const currentWps = typeof getCurrentWaypoints === 'function' ? getCurrentWaypoints() : [];
  if (!currentWps || currentWps.length === 0) {
    alert("Please select or generate waypoints first.");
    return;
  }
  const speed = parseFloat(document.getElementById('speed')?.value) || 4.0;
  const altitude = parseFloat(document.getElementById('altitude')?.value) || 50.0;
  const gimbalPitch = parseGimbalPitch(document.getElementById('gimbal-pitch')?.value, -90.0);

  const plan = buildQgcMissionPlan(currentWps, { speed, altitude, gimbalPitch });
  const blob = new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const ts = typeof formatISO8601ForFilename === 'function' ? formatISO8601ForFilename() : new Date().toISOString().replace(/:/g, '-');
  a.download = `Mission_QGC_${ts}.plan`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportAutelKml() {
  const currentWps = typeof getCurrentWaypoints === 'function' ? getCurrentWaypoints() : [];
  if (!currentWps || currentWps.length === 0) {
    alert("Please select or generate waypoints first.");
    return;
  }
  const speed = parseFloat(document.getElementById('speed')?.value) || 4.0;
  const altitude = parseFloat(document.getElementById('altitude')?.value) || 50.0;
  const gimbalPitch = parseGimbalPitch(document.getElementById('gimbal-pitch')?.value, -90.0);

  const kml = buildAutelMissionKml(currentWps, { speed, altitude, gimbalPitch });
  const blob = new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const ts = typeof formatISO8601ForFilename === 'function' ? formatISO8601ForFilename() : new Date().toISOString().replace(/:/g, '-');
  a.download = `Mission_Autel_${ts}.kml`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function initMultiVendorToggle() {
  const toggle = document.getElementById('multivendor-toggle');
  const exportContainer = document.getElementById('multivendor-export-container');
  const qgcBtn = document.getElementById('export-qgc-btn');
  const autelBtn = document.getElementById('export-autel-btn');

  const updateState = (enabled) => {
    if (toggle) toggle.checked = enabled;
    if (exportContainer) {
      exportContainer.style.display = enabled ? 'flex' : 'none';
    }
    try {
      localStorage.setItem('aalaapi-multivendor-enabled', enabled ? 'true' : 'false');
    } catch (e) {}
  };

  const isEnabled = typeof localStorage !== 'undefined' && localStorage.getItem('aalaapi-multivendor-enabled') === 'true';
  updateState(isEnabled);

  if (toggle) {
    toggle.addEventListener('change', () => {
      updateState(toggle.checked);
    });
  }

  if (qgcBtn) qgcBtn.addEventListener('click', exportQgcPlan);
  if (autelBtn) autelBtn.addEventListener('click', exportAutelKml);
}

// ─── Settings & Mission Plan JSON Builder & Exporter ──────────────────────────
// Generates a comprehensive, structured JSON representation of all application
// settings, geometry parameters, camera profiles, flight configurations,
// computed statistics, and waypoint coordinates for troubleshooting or archival.

/**
 * Extracts and serializes all spatial environment layers (Ground Control Points / Fiducials,
 * Inclusion Zones / Target Polygons, Exclusion Zones, and Parcel Boundaries)
 * from active flightLayers for bundling into Mission Plans and Diagnostics archives.
 */
function extractSpatialMissionLayers(layers = null) {
  const allLayers = (layers && Array.isArray(layers))
    ? layers
    : ((typeof flightLayers !== 'undefined' && Array.isArray(flightLayers)) ? flightLayers : []);

  const groundControl = [];
  const inclusionZones = [];
  const exclusionZones = [];
  const parcels = [];

  allLayers.forEach(l => {
    if (!l) return;

    // 1. Ground Control Points & Optical Fiducial Markers
    if (Array.isArray(l.fiducialMarkers) && l.fiducialMarkers.length > 0) {
      l.fiducialMarkers.forEach(m => {
        if (!m) return;
        groundControl.push({
          id: m.id,
          code: m.code || 'GCP',
          role: m.role || 'gcp',
          type: m.type || 'aruco_4x4',
          markerId: typeof m.markerId === 'number' ? m.markerId : 0,
          lat: m.lat,
          lon: m.lon !== undefined ? m.lon : m.lng,
          alt: typeof m.alt === 'number' ? m.alt : 0.0,
          physicalSizeMeters: typeof m.physicalSizeMeters === 'number' ? m.physicalSizeMeters : 0.50,
          color: m.color || l.markerColor || '#f59e0b',
          notes: m.notes || '',
          layerId: l.id,
          layerName: l.name || 'Fiducial Survey'
        });
      });
    }

    // 2. Inclusion Zones & Target Polygons (targetPoly)
    if (Array.isArray(l.targetPoly) && l.targetPoly.length >= 3) {
      inclusionZones.push({
        layerId: l.id,
        layerName: l.name || 'Target Inclusion Zone',
        targetMode: l.targetMode || 'polygon',
        targetHeight: typeof l.targetHeight === 'number' ? l.targetHeight : 8,
        targetRadius: typeof l.targetRadius === 'number' ? l.targetRadius : 25,
        polygon: l.targetPoly.map(pt => ({
          lat: pt.lat,
          lon: pt.lon !== undefined ? pt.lon : pt.lng,
          x: typeof pt.x === 'number' ? pt.x : null,
          y: typeof pt.y === 'number' ? pt.y : null
        }))
      });
    }

    // 3. Exclusion Zones (Obstacles / No-Fly Keep-Out)
    if (l.isExclusionZone || l.pattern === 'exclusion-box' || l.pattern === 'exclusion-freeform') {
      const vertices = Array.isArray(l.polygonVertices) && l.polygonVertices.length >= 3
        ? l.polygonVertices
        : (Array.isArray(l.boundaryPolygon) && l.boundaryPolygon.length >= 3 ? l.boundaryPolygon : []);

      if (vertices.length >= 3) {
        exclusionZones.push({
          layerId: l.id,
          layerName: l.name || 'Obstacle Exclusion Zone',
          pattern: l.pattern,
          enabled: l.enabled !== false,
          allAltitudes: !!l.allAltitudes,
          minAltitude: typeof l.minAltitude === 'number' ? l.minAltitude : 0,
          maxAltitude: typeof l.maxAltitude === 'number' ? l.maxAltitude : 60,
          clearanceBuffer: typeof l.clearanceBuffer === 'number' ? l.clearanceBuffer : 5,
          detourMode: l.detourMode || 'inherit',
          polygon: vertices.map(pt => ({
            lat: pt.lat,
            lon: pt.lon !== undefined ? pt.lon : pt.lng
          }))
        });
      }
    }

    // 4. Parcel & Survey Boundaries (Property / Site Lines)
    if (!l.isExclusionZone && !l.isFiducialLayer && l.pattern !== 'exclusion-box' && l.pattern !== 'exclusion-freeform' && l.pattern !== 'fiducial-markers') {
      const hasDrawnBoundary = (Array.isArray(l.boundaryPolygon) && l.boundaryPolygon.length >= 3)
        || ((l.pattern === 'boundary-polygon' || l.isDrawingLayer) && Array.isArray(l.polygonVertices) && l.polygonVertices.length >= 3);

      if (l.pattern === 'boundary-polygon' || l.isDrawingLayer || hasDrawnBoundary) {
        const vertices = Array.isArray(l.polygonVertices) && l.polygonVertices.length >= 3
          ? l.polygonVertices
          : (Array.isArray(l.boundaryPolygon) && l.boundaryPolygon.length >= 3 ? l.boundaryPolygon : []);

        if (vertices.length >= 3) {
          parcels.push({
            layerId: l.id,
            layerName: l.name || 'Boundary / Parcel',
            enabled: l.enabled !== false,
            strokeColor: l.strokeColor || '#06b6d4',
            lineStyle: l.lineStyle || 'dashed',
            fillOpacity: typeof l.fillOpacity === 'number' ? l.fillOpacity : 15,
            targetHeight: (l.pattern === 'boundary-polygon' || l.isDrawingLayer) ? (typeof l.targetHeight === 'number' ? l.targetHeight : 0) : 0,
            polygon: vertices.map(pt => ({
              lat: pt.lat,
              lon: pt.lon !== undefined ? pt.lon : pt.lng
            }))
          });
        }
      }
    }
  });

  return {
    groundControl,
    inclusionZones,
    exclusionZones,
    parcels
  };
}

function buildMissionPlanJSON(customWps = null) {
  const currentWps = customWps || (typeof getCurrentWaypoints === 'function' ? getCurrentWaypoints() : null) || [];
  const centerLatLng = (typeof centerMarker !== 'undefined' && centerMarker && centerMarker.getLatLng) ? centerMarker.getLatLng() : null;

  const gridType = document.getElementById('grid-type')?.value || 'single';
  const gridWidth = parseFloat(document.getElementById('grid-width')?.value) || 100;
  const gridHeight = parseFloat(document.getElementById('grid-height')?.value) || 100;
  const rotation = parseFloat(document.getElementById('grid-rotation')?.value) || 0;
  const roadOffset = parseFloat(document.getElementById('road-offset')?.value) || 15;
  const roadSnap = !!(document.getElementById('road-snap')?.checked);

  const cameraModel = document.getElementById('camera-model')?.value || 'dji_mini_4_pro_std';
  const droneModel = document.getElementById('drone-model')?.value || '68';
  const cameraZoom = parseFloat(document.getElementById('camera-zoom')?.value) || 1.0;
  const cameraHFOV = parseFloat(document.getElementById('camera-hfov')?.value) || 69.7;
  const cameraVFOV = parseFloat(document.getElementById('camera-vfov')?.value) || 55.2;
  const overlapFront = parseFloat(document.getElementById('front-overlap')?.value) || 80;
  const overlapSide = parseFloat(document.getElementById('side-overlap')?.value) || 75;
  const gimbalPitch = parseGimbalPitch(document.getElementById('gimbal-pitch')?.value, -60);

  const altitude = parseFloat(document.getElementById('altitude')?.value) || 50;
  const speed = parseFloat(document.getElementById('speed')?.value) || 4;
  const headingMode = document.getElementById('heading-mode')?.value || 'followWayline';
  const finishAction = document.getElementById('finish-action')?.value || 'goHome';
  const signalLostAction = document.getElementById('signal-lost-action')?.value || 'goBack';
  const pathMode = document.getElementById('path-mode')?.value || 'curved';
  const captureMode = document.getElementById('capture-mode')?.value || 'stopAndShoot';
  const globalHoverTime = parseFloat(document.getElementById('global-hover-time')?.value) || 0;

  const unitSystem = typeof getUnitSystem === 'function' ? getUnitSystem() : 'imperial';
  const storedUuid = typeof getRC2UUID === 'function' ? getRC2UUID() : null;

  const formattedWaypoints = currentWps.map((wp, idx) => ({
    index: idx,
    lat: wp.lat,
    lon: wp.lon,
    alt: wp.alt !== undefined ? wp.alt : altitude,
    pitch: wp.pitch !== undefined && wp.pitch !== null ? wp.pitch : gimbalPitch,
    heading: wp.heading !== undefined ? wp.heading : null,
    speed: wp.speed !== undefined ? wp.speed : speed,
    hoverTime: wp.hoverTime !== undefined ? wp.hoverTime : globalHoverTime,
    x: wp.x !== undefined ? wp.x : null,
    y: wp.y !== undefined ? wp.y : null,
    isRingStart: !!wp.isRingStart,
    ringIndex: wp.ringIndex !== undefined ? wp.ringIndex : null,
    poiIndex: wp.poiIndex !== undefined ? wp.poiIndex : null,
    headingMode: wp.headingMode !== undefined ? wp.headingMode : null
  }));

  const totalStats = typeof calculateStats === 'function'
    ? calculateStats(formattedWaypoints, typeof getCurrentPhotos === 'function' ? getCurrentPhotos() : null, speed, null, null, captureMode)
    : null;

  const spatialData = typeof extractSpatialMissionLayers === 'function'
    ? extractSpatialMissionLayers()
    : { groundControl: [], inclusionZones: [], exclusionZones: [], parcels: [] };

  const allPois = (typeof global !== 'undefined' && Array.isArray(global.pois) && global.pois.length > 0)
    ? global.pois
    : ((typeof pois !== 'undefined' && Array.isArray(pois)) ? pois : ((typeof pointsOfInterest !== 'undefined' && Array.isArray(pointsOfInterest)) ? pointsOfInterest : []));
  const allLayers = (typeof global !== 'undefined' && Array.isArray(global.flightLayers) && global.flightLayers.length > 0)
    ? global.flightLayers
    : ((typeof flightLayers !== 'undefined' && Array.isArray(flightLayers)) ? flightLayers : []);

  return {
    schemaVersion: "1.1.0",
    generator: "Aalaapi Sky",
    version: "1.110.0",
    exportedAt: new Date().toISOString(),
    mission: {
      uuid: storedUuid || null,
      importedFileName: typeof importedFileName !== 'undefined' ? importedFileName : null,
      pattern: gridType,
      unitSystem: unitSystem,
      center: centerLatLng ? { lat: centerLatLng.lat, lon: centerLatLng.lng } : null
    },
    settings: {
      geometry: {
        gridWidth,
        gridHeight,
        gridRotation: rotation,
        roadOffset,
        roadSnap
      },
      camera: {
        cameraModel,
        droneModelId: parseInt(droneModel, 10) || 68,
        cameraZoom,
        cameraHFOV,
        cameraVFOV,
        frontOverlapPercent: overlapFront,
        sideOverlapPercent: overlapSide,
        gimbalPitch
      },
      flight: {
        altitude,
        speed,
        headingMode,
        finishAction,
        signalLostAction,
        pathMode,
        captureMode,
        globalHoverTimeSeconds: globalHoverTime
      }
    },

    pointsOfInterest: allPois.map(p => ({
      id: p.id,
      name: p.name,
      lat: p.lat,
      lon: p.lon !== undefined ? p.lon : p.lng,
      alt: p.alt || 0
    })),
    layers: allLayers.map(l => ({
      id: l.id,
      name: l.name,
      pattern: l.pattern,
      enabled: l.enabled !== false,
      altitude: l.altitude,
      speed: l.speed,
      gimbalPitch: l.gimbalPitch,
      headingMode: l.headingMode,
      captureMode: l.captureMode,
      pathMode: l.pathMode,
      waypointCount: (l.waypoints && l.waypoints.length) || (l.freeformWaypoints && l.freeformWaypoints.length) || 0
    })),
    groundControl: spatialData.groundControl,
    inclusionZones: spatialData.inclusionZones,
    exclusionZones: spatialData.exclusionZones,
    parcels: spatialData.parcels,
    statistics: totalStats ? {
      waypointCount: formattedWaypoints.length,
      photoCount: totalStats.photoCount || formattedWaypoints.length,
      totalDistanceMeters: totalStats.distance || 0,
      totalFlightTimeSeconds: totalStats.flightTimeSeconds || 0,
      flightTimeFormatted: totalStats.timeStr || '',
      groundControlCount: spatialData.groundControl.length,
      inclusionZoneCount: spatialData.inclusionZones.length,
      exclusionZoneCount: spatialData.exclusionZones.length,
      parcelCount: spatialData.parcels.length
    } : {
      waypointCount: formattedWaypoints.length,
      groundControlCount: spatialData.groundControl.length,
      inclusionZoneCount: spatialData.inclusionZones.length,
      exclusionZoneCount: spatialData.exclusionZones.length,
      parcelCount: spatialData.parcels.length
    },
    waypoints: formattedWaypoints
  };
}

function exportMissionPlanJSON(customWps = null) {
  const plan = buildMissionPlanJSON(customWps);
  const jsonStr = JSON.stringify(plan, null, 2);
  let blob = null;
  if (typeof Blob !== 'undefined') {
    blob = new Blob([jsonStr], { type: "application/json" });
  }

  const storedUuid = typeof getRC2UUID === 'function' ? getRC2UUID() : null;
  let downloadBase = "";
  const isoTimestamp = formatISO8601ForFilename();
  if (typeof importedFileName !== 'undefined' && importedFileName) {
    downloadBase = importedFileName.replace(/\.kmz$/i, "");
  } else if (storedUuid && typeof RC2_UUID_PATTERN !== 'undefined' && RC2_UUID_PATTERN.test(storedUuid)) {
    downloadBase = storedUuid;
  } else {
    const altitude = parseFloat(document.getElementById('altitude')?.value) || 50;
    downloadBase = `GridMission_Alt${altitude}m_${isoTimestamp}`;
  }

  if (blob && typeof document !== 'undefined' && document.createElement) {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${downloadBase}_plan.json`;
    link.click();
  }

  return { plan, blob, jsonStr };
}

// ─── Flight Diagnostics JSON Builder & Exporter ──────────────────────────────
// Generates a comprehensive diagnostics export containing the complete mission plan,
// simulated 3D trajectory time-series, photo capture events, turn dynamics,
// and detailed client User Agent / hardware environment specs.

function buildFlightDiagnosticsJSON(customWps = null, options = {}) {
  const currentWps = customWps || (typeof getCurrentWaypoints === 'function' ? getCurrentWaypoints() : null) || [];
  const plan = typeof buildMissionPlanJSON === 'function' ? buildMissionPlanJSON(currentWps) : null;
  const isoTimestamp = typeof formatISO8601ForFilename === 'function' ? formatISO8601ForFilename() : new Date().toISOString().replace(/:/g, '-');
  const uuid = options.uuid || (typeof getRC2UUID === 'function' && getRC2UUID()) || (plan && plan.metadata && plan.metadata.uuid) || `mission_${Date.now()}`;

  const altitude = options.altitude ?? (typeof document !== 'undefined' && parseFloat(document.getElementById('altitude')?.value)) ?? 50.0;
  const speed = options.speed ?? (typeof document !== 'undefined' && parseFloat(document.getElementById('speed')?.value)) ?? 4.0;
  const gimbalPitch = options.gimbalPitch ?? parseGimbalPitch(typeof document !== 'undefined' ? document.getElementById('gimbal-pitch')?.value : null, -60.0);

  const telemetry = typeof generateTelemetryFromWaypoints === 'function'
    ? generateTelemetryFromWaypoints(currentWps, { altitude, speed, gimbalPitch, isSimulation: true, flightId: uuid })
    : null;

  const userAgent = {
    raw: (typeof navigator !== 'undefined' && navigator.userAgent) ? navigator.userAgent : 'NodeJS/TestRunner',
    platform: (typeof navigator !== 'undefined' && (navigator.userAgentData?.platform || navigator.platform)) || (typeof process !== 'undefined' ? process.platform : ''),
    language: (typeof navigator !== 'undefined' && navigator.language) || 'en-US',
    languages: (typeof navigator !== 'undefined' && Array.isArray(navigator.languages)) ? navigator.languages : ['en-US'],
    screen: (typeof window !== 'undefined' && window.screen) ? {
      width: window.screen.width,
      height: window.screen.height,
      colorDepth: window.screen.colorDepth,
      pixelRatio: window.devicePixelRatio || 1
    } : null,
    viewport: (typeof window !== 'undefined') ? {
      width: window.innerWidth,
      height: window.innerHeight
    } : null,
    appVersion: '1.56.0',
    capturedAt: new Date().toISOString()
  };

  const isValid = options.isValid !== undefined ? options.isValid : (options.validation ? options.validation.valid : true);
  const validationErrors = options.validationErrors || options.validation?.errors || [];
  const validationWarnings = options.validationWarnings || options.validation?.warnings || [];
  const validationRulesPassed = options.validationRulesPassed ?? options.validation?.rulesPassed ?? (isValid ? 10 : 10 - validationErrors.length);

  const spatialData = (plan && plan.groundControl) ? {
    groundControl: plan.groundControl,
    inclusionZones: plan.inclusionZones || [],
    exclusionZones: plan.exclusionZones || [],
    parcels: plan.parcels || []
  } : (typeof extractSpatialMissionLayers === 'function' ? extractSpatialMissionLayers() : {
    groundControl: [],
    inclusionZones: [],
    exclusionZones: [],
    parcels: []
  });

  const createdAt = options.createdAt || new Date().toISOString();
  const archiveId = options.archiveId || `${uuid}_${createdAt}`;

  return {
    schemaVersion: '1.56.0',
    archiveId,
    uuid,
    createdAt,
    filename: options.filename || `${uuid}.kmz`,
    flightPattern: options.flightPattern || options.pattern || (typeof document !== 'undefined' && document.getElementById('grid-type')?.value) || plan?.geometry?.pattern || 'single',
    altitude,
    speed,
    gimbalPitch,
    userAgent,
    plan,
    diagnostics: telemetry,
    layers: (plan && plan.layers) ? plan.layers : ((typeof flightLayers !== 'undefined' && Array.isArray(flightLayers)) ? flightLayers.map(l => ({
      id: l.id,
      name: l.name,
      pattern: l.pattern,
      enabled: l.enabled !== false,
      altitude: l.altitude,
      speed: l.speed,
      gimbalPitch: l.gimbalPitch,
      headingMode: l.headingMode,
      captureMode: l.captureMode,
      pathMode: l.pathMode,
      waypointCount: (l.waypoints && l.waypoints.length) || (l.freeformWaypoints && l.freeformWaypoints.length) || 0
    })) : []),
    pointsOfInterest: (plan && plan.pointsOfInterest) ? plan.pointsOfInterest : ((typeof pois !== 'undefined' && Array.isArray(pois)) ? pois.map(p => ({
      id: p.id,
      name: p.name,
      lat: p.lat,
      lon: p.lon !== undefined ? p.lon : p.lng,
      alt: p.alt || 0
    })) : []),
    groundControl: spatialData.groundControl,
    inclusionZones: spatialData.inclusionZones,
    exclusionZones: spatialData.exclusionZones,
    parcels: spatialData.parcels,
    isValid,
    validationRulesPassed,
    validationErrors,
    validationWarnings,
    validationReport: options.validationReport || options.validation || null,
    wpmlXml: options.wpmlXml || '',
    templateXml: options.templateXml || '',
    executionStatus: options.executionStatus || (!isValid ? 'invalid' : 'pending'),
    executionError: options.executionError || (validationErrors.length > 0 ? validationErrors.join('; ') : ''),
    summary: {
      waypointCount: currentWps.length,
      photoCount: telemetry?.photoCount ?? currentWps.length,
      totalDistance: telemetry?.totalDistance ?? plan?.statistics?.totalDistanceMeters ?? 0,
      estimatedDuration: telemetry?.durationSeconds ?? plan?.statistics?.totalFlightTimeSeconds ?? 0,
      durationFormatted: telemetry?.durationFormatted ?? plan?.statistics?.flightTimeFormatted ?? '',
      maxAltitude: telemetry?.maxAltitude ?? altitude,
      homePoint: telemetry?.homePoint ?? plan?.centerPoint ?? null,
      groundControlCount: spatialData.groundControl.length,
      inclusionZoneCount: spatialData.inclusionZones.length,
      exclusionZoneCount: spatialData.exclusionZones.length,
      parcelCount: spatialData.parcels.length
    }
  };
}

function exportFlightDiagnosticsJSON(customWps = null, options = {}) {
  const diagData = buildFlightDiagnosticsJSON(customWps, options);
  const jsonStr = JSON.stringify(diagData, null, 2);
  let blob = null;
  if (typeof Blob !== 'undefined') {
    blob = new Blob([jsonStr], { type: "application/json" });
  }

  const storedUuid = typeof getRC2UUID === 'function' ? getRC2UUID() : null;
  let downloadBase = "";
  const isoTimestamp = typeof formatISO8601ForFilename === 'function' ? formatISO8601ForFilename() : new Date().toISOString().replace(/:/g, '-');
  if (typeof importedFileName !== 'undefined' && importedFileName) {
    downloadBase = importedFileName.replace(/\.kmz$/i, "");
  } else if (storedUuid && typeof RC2_UUID_PATTERN !== 'undefined' && RC2_UUID_PATTERN.test(storedUuid)) {
    downloadBase = storedUuid;
  } else {
    const altitude = parseFloat(document.getElementById('altitude')?.value) || 50;
    downloadBase = `GridMission_Alt${altitude}m_${isoTimestamp}`;
  }

  if (blob && typeof document !== 'undefined' && document.createElement) {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${downloadBase}_diag.json`;
    link.click();
  }

  // Also notify companion archive service
  if (typeof fetch !== 'undefined') {
    const apiBase = typeof getCompanionApiBase === 'function' ? getCompanionApiBase() : 'http://127.0.0.1:8765';
    fetch(`${apiBase}/api/diagnostics/archive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(diagData)
    }).catch(() => {});
  }

  return { diagData, blob, jsonStr };
}

// Generate KMZ Blob in-memory
function generateKMZBlob(wps = null) {
  let effectiveWps = wps;
  if (!effectiveWps) {
    const current = typeof getCurrentWaypoints === 'function' ? getCurrentWaypoints() : null;
    effectiveWps = current || (typeof waypoints !== 'undefined' && waypoints ? waypoints : []);
  }
  const finishAction = document.getElementById('finish-action')?.value || 'goHome';
  const altitude = parseFloat(document.getElementById('altitude')?.value) || 50;
  const speed = parseFloat(document.getElementById('speed')?.value) || 4;
  const headingMode = document.getElementById('heading-mode')?.value || 'followWayline';
  const gimbalPitch = parseGimbalPitch(document.getElementById('gimbal-pitch')?.value, -90);
  const captureMode = document.getElementById('capture-mode')?.value || 'hover';
  const pathMode = document.getElementById('path-mode')?.value || 'normal';

  const templateKml = buildTemplateKml(finishAction, speed);
  const waylinesWpml = buildWaylinesWpml(effectiveWps, altitude, speed, headingMode, finishAction, gimbalPitch, captureMode, pathMode);

  const currentGridType = document.getElementById('grid-type')?.value || 'single';
  // Auto-audit and fix subtle firmware incompatibilities
  const fixed = validateAndFixWpml(waylinesWpml, templateKml, {
    waypoints: effectiveWps,
    gridType: currentGridType,
    flightLayers: (typeof flightLayers !== 'undefined' && Array.isArray(flightLayers)) ? flightLayers : null
  });
  const finalWpml = fixed.wpmlXml;
  const finalTemplate = fixed.templateXml;
  const validation = fixed.validation;

  if (typeof JSZip === 'undefined') {
    return Promise.resolve(null);
  }

  const zip = new JSZip();
  zip.file("wpmz/template.kml", finalTemplate, { createFolders: false });
  zip.file("wpmz/waylines.wpml", finalWpml, { createFolders: false });

  // If 3D architectural wireframe is present, embed it as part of the package
  if (typeof FlightDiagnostics !== 'undefined' && FlightDiagnostics.wireframeData && Array.isArray(FlightDiagnostics.wireframeData.lines) && FlightDiagnostics.wireframeData.lines.length > 0) {
    const wData = FlightDiagnostics.wireframeData;
    const elevOffset = typeof FlightDiagnostics.wireframeElevationOffset === 'number' ? FlightDiagnostics.wireframeElevationOffset : 0.0;
    zip.file("wpmz/res/wireframe.json", JSON.stringify(wData, null, 2), { createFolders: false });

    // Wavefront OBJ (CAD / threejs.org compatible)
    let vCount = 1;
    let objStr = `# Aalaapi Sky 3D Architectural Wireframe\n# Generated: ${new Date().toISOString()}\n\n`;
    wData.lines.forEach(line => {
      if (!Array.isArray(line) || line.length < 6) return;
      objStr += `v ${line[0]} ${line[1] + elevOffset} ${line[2]}\n`;
      objStr += `v ${line[3]} ${line[4] + elevOffset} ${line[5]}\n`;
      objStr += `l ${vCount} ${vCount + 1}\n`;
      vCount += 2;
    });
    zip.file("wpmz/res/wireframe.obj", objStr, { createFolders: false });

    // Three.js JSON (threejs.org/editor compatible Digital Twin)
    const dtOptions = { elevationOffset: elevOffset };
    if (typeof FlightDiagnostics !== 'undefined' && typeof FlightDiagnostics.gatherDigitalTwinData === 'function') {
      try {
        const dt = FlightDiagnostics.gatherDigitalTwinData();
        if (dt.flightPath && dt.flightPath.length >= 2) dtOptions.flightPath = dt.flightPath;
        if (dt.photos && dt.photos.length >= 1) dtOptions.photos = dt.photos;
        if (dt.boundary && dt.boundary.length >= 3) dtOptions.boundary = dt.boundary;
        if (dtOptions.flightPath || dtOptions.photos || dtOptions.boundary) dtOptions.asGroup = true;
      } catch (_) {}
    }
    const threeJson = (typeof buildThreeDigitalTwinJson === 'function')
      ? buildThreeDigitalTwinJson(wData.lines, dtOptions)
      : {
          metadata: { version: 4.5, type: "Object", generator: "Aalaapi-Sky Digital Twin Engine", source: "threejs.org compatible" },
          geometries: [],
          materials: [],
          object: { type: "LineSegments", name: "Aalaapi_Wireframe" }
        };
    zip.file("wpmz/res/wireframe_threejs.json", JSON.stringify(threeJson, null, 2), { createFolders: false });
  }

  return zip.generateAsync({ type: "blob", compression: "DEFLATE" }).then(blob => ({
    blob,
    templateKml: finalTemplate,
    waylinesWpml: finalWpml,
    validation
  }));
}

// ─── Map Preview Thumbnail Generator ──────────────────────────────────────────
// Generates a 400x300 JPG thumbnail preview of the waypoint flight path matching
// the DJI Fly map_preview thumbnail specifications for RC 2 controller display.

function generateMissionPreviewBlob(waypoints, width = 400, height = 300) {
  if (typeof document === 'undefined' || !document.createElement) return Promise.resolve(null);
  const canvas = document.createElement('canvas');
  if (!canvas || !canvas.getContext) return Promise.resolve(null);
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.resolve(null);

  // Dark slate background
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, width, height);

  // Subtle coordinate grid lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;
  for (let x = 40; x < width; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 30; y < height; y += 30) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  if (waypoints && waypoints.length > 0) {
    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    waypoints.forEach(wp => {
      if (wp.lat < minLat) minLat = wp.lat;
      if (wp.lat > maxLat) maxLat = wp.lat;
      if (wp.lon < minLon) minLon = wp.lon;
      if (wp.lon > maxLon) maxLon = wp.lon;
    });

    const spanLat = (maxLat - minLat) || 0.0001;
    const spanLon = (maxLon - minLon) || 0.0001;
    const pad = 45;
    const drawW = width - pad * 2;
    const drawH = height - pad * 2;

    const toScreen = (lat, lon) => ({
      x: pad + ((lon - minLon) / spanLon) * drawW,
      y: height - (pad + ((lat - minLat) / spanLat) * drawH)
    });

    // Draw wayline path
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 3.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (ctx.shadowBlur !== undefined) {
      ctx.shadowColor = 'rgba(6, 182, 212, 0.7)';
      ctx.shadowBlur = 8;
    }

    ctx.beginPath();
    waypoints.forEach((wp, i) => {
      const pt = toScreen(wp.lat, wp.lon);
      if (i === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.stroke();
    if (ctx.shadowBlur !== undefined) ctx.shadowBlur = 0;

    // Draw waypoint nodes
    waypoints.forEach((wp, i) => {
      const pt = toScreen(wp.lat, wp.lon);
      ctx.fillStyle = (i === 0) ? '#22c55e' : (i === waypoints.length - 1) ? '#ef4444' : '#38bdf8';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, (i === 0 || i === waypoints.length - 1) ? 5.5 : 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.stroke();
    });
  }

  // Header branding badge
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.fillText('AALAAPI SKY', 14, 22);

  return new Promise(resolve => {
    if (canvas.toBlob) {
      canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.85);
    } else {
      resolve(null);
    }
  });
}

// ─── DJI RC 2 Companion Bridge & Direct Sync ────────────────────────────────

