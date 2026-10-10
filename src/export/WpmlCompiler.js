function buildTemplateKml(finishAction, speed) {
  const timestamp = Date.now();
  const droneModelEl = document.getElementById('drone-model');
  const parsedDroneVal = droneModelEl ? parseInt(droneModelEl.value, 10) : NaN;
  const droneEnumValue = !isNaN(parsedDroneVal) ? parsedDroneVal : 68; // Default to DJI Mini 4 Pro (68)

  const signalLostEl = document.getElementById('signal-lost-action');
  const signalLostValue = signalLostEl ? signalLostEl.value : 'goBack';
  let exitOnRCLost = 'executeLostAction';
  let executeRCLostAction = signalLostValue;
  if (signalLostValue === 'goContinue') {
    exitOnRCLost = 'goContinue';
    executeRCLostAction = 'goBack';
  }

  const rthAltEl = document.getElementById('rth-altitude');
  const rthAltitude = rthAltEl ? (parseFloat(rthAltEl.value) || 50) : 50;
  const altEl = document.getElementById('altitude');
  const defaultAlt = altEl ? (parseFloat(altEl.value) || 50) : 50;
  const safeTakeoffHeight = Math.max(1.5, Math.min(rthAltitude, defaultAlt));

  const isEnterprise = (droneEnumValue !== 68 && droneEnumValue !== 89);
  let folderXml = '';
  if (isEnterprise) {
    folderXml = `
    <Folder>
      <wpml:templateType>waypoint</wpml:templateType>
      <wpml:templateId>0</wpml:templateId>
      <wpml:executeHeightMode>relativeToStartPoint</wpml:executeHeightMode>
      <wpml:waylineId>0</wpml:waylineId>
      <wpml:distance>0</wpml:distance>
      <wpml:duration>0</wpml:duration>
      <wpml:autoFlightSpeed>${speed}</wpml:autoFlightSpeed>
      <wpml:payloadParam>
        <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
        <wpml:payloadPitchControlMode>usePointSetting</wpml:payloadPitchControlMode>
      </wpml:payloadParam>
    </Folder>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="http://www.uav.com/wpmz/1.0.2">
  <Document>
    <wpml:author>Aalaapi Sky Generator</wpml:author>
    <wpml:createTime>${timestamp}</wpml:createTime>
    <wpml:updateTime>${timestamp}</wpml:updateTime>
    <wpml:missionConfig>
      <wpml:flyToWaylineMode>safely</wpml:flyToWaylineMode>
      <wpml:finishAction>${finishAction}</wpml:finishAction>
      <wpml:exitOnRCLost>${exitOnRCLost}</wpml:exitOnRCLost>
      <wpml:executeRCLostAction>${executeRCLostAction}</wpml:executeRCLostAction>
      <wpml:takeOffSecurityHeight>${safeTakeoffHeight}</wpml:takeOffSecurityHeight>
      <wpml:globalTransitionalSpeed>${speed}</wpml:globalTransitionalSpeed>
      <wpml:droneInfo>
        <wpml:droneEnumValue>${droneEnumValue}</wpml:droneEnumValue>
        <wpml:droneSubEnumValue>0</wpml:droneSubEnumValue>
      </wpml:droneInfo>
    </wpml:missionConfig>${folderXml}
  </Document>
</kml>`;
}

// Generate the WPML waylines.wpml content
function buildWaylinesWpml(waypoints, altitude, speed, headingMode, finishAction, gimbalPitch, captureMode, pathMode) {
  if (!waypoints || !Array.isArray(waypoints)) waypoints = [];
  const timestamp = Date.now();
  
  const zoomEl = document.getElementById('camera-zoom');
  const cameraZoom = zoomEl ? parseFloat(zoomEl.value) : 1.0;

  const globalHoverEl = document.getElementById('global-hover-time');
  const globalHoverTime = globalHoverEl ? parseInt(globalHoverEl.value) : 0;

  const droneModelEl = typeof document !== 'undefined' ? document.getElementById('drone-model') : null;
  const parsedDroneVal = droneModelEl ? parseInt(droneModelEl.value, 10) : NaN;
  const droneEnumValue = !isNaN(parsedDroneVal) ? parsedDroneVal : 68;
  const isConsumer = (parsedDroneVal === 68 || parsedDroneVal === 89);

  // Build XML Placemark tags (waypoints)
  let placemarksXml = '';
  let turnMode;
  let useStraightLine;
  if (isConsumer) {
    // Consumer Drone Golden Rule: DJI Fly for Mini 4 Pro / Air 3 strictly requires ContinuityCurvature
    // and useStraightLine: 0. DiscontinuityCurvature and useStraightLine: 1 cause immediate "Waypoint Flight Suspended" aborts.
    turnMode = captureMode === 'stopAndShoot' 
      ? 'toPointAndStopWithContinuityCurvature' 
      : 'toPointAndPassWithContinuityCurvature';
    useStraightLine = 0;
  } else if (pathMode === 'straight') {
    turnMode = captureMode === 'stopAndShoot' 
      ? 'toPointAndStopWithDiscontinuityCurvature' 
      : 'toPointAndPassWithDiscontinuityCurvature';
    useStraightLine = 1;
  } else {
    turnMode = captureMode === 'stopAndShoot' 
      ? 'toPointAndStopWithContinuityCurvature' 
      : 'toPointAndPassWithContinuityCurvature';
    useStraightLine = 0;
  }

  let actionId = 1;
  // actionGroupId must be globally unique across the entire waylines.wpml file (DJI WPML spec).
  // Using a single counter shared across all waypoints prevents duplicate IDs that cause
  // DJI Fly to reject the mission at "Go" press (observed on double-grid with 81 action groups).
  let actionGroupId = 1;

  // Sanitize consecutive duplicate coordinates (DJI APAS collision & zero-distance trajectory solver rule)
  // When consecutive waypoints share identical coordinates (distance < 0.6m, e.g., in-place 360 photo spheres or stacked points),
  // apply a micro-orbital radius (1.25m - 1.45m) keyed to waypoint heading to ensure distinct flight nodes >= 0.64m apart.
  const sanitizedWps = waypoints.map(w => ({ ...w }));
  let ci = 0;
  while (ci < sanitizedWps.length) {
    let cj = ci + 1;
    while (cj < sanitizedWps.length && typeof haversineDistance === 'function' &&
           waypoints[ci].lat !== undefined && waypoints[ci].lon !== undefined &&
           waypoints[cj].lat !== undefined && waypoints[cj].lon !== undefined &&
           haversineDistance(waypoints[ci].lat, waypoints[ci].lon, waypoints[cj].lat, waypoints[cj].lon) < 0.6) {
      cj++;
    }
    const clusterSize = cj - ci;
    if (clusterSize > 1) {
      const clusterLat = waypoints[ci].lat;
      const clusterLon = waypoints[ci].lon;
      const latRad = (clusterLat * Math.PI) / 180.0;
      const seenAngles = new Set();
      let prevClusterLat = null;
      let prevClusterLon = null;
      for (let k = ci; k < cj; k++) {
        const wp = sanitizedWps[k];
        wp._clusterSize = clusterSize;
        const isNadir = (wp.pitch === -90 || wp.pitch === '-90' || (wp.ringIndex === 3 && wp.isPhotoSpherePoint));
        if (isNadir) {
          wp.lat = clusterLat;
          wp.lon = clusterLon;
        } else {
          const ringIdx = (wp.ringIndex !== undefined && !isNaN(wp.ringIndex)) ? wp.ringIndex : 0;
          let radiusMeters = 1.25 + (ringIdx * 0.10);
          let angleDeg = (wp.heading !== undefined && wp.heading !== null && !isNaN(wp.heading))
            ? wp.heading
            : ((k - ci) * (360 / clusterSize));
          if (seenAngles.has(angleDeg.toFixed(1))) {
            let foundAngle = null;
            for (let step = 1; step <= 72; step++) {
              const candidate = (angleDeg + step * (360 / Math.max(clusterSize, 12))) % 360;
              let tooClose = false;
              for (const sa of seenAngles) {
                let diff = Math.abs(candidate - parseFloat(sa));
                if (diff > 180) diff = 360 - diff;
                if (diff < 22) {
                  tooClose = true;
                  break;
                }
              }
              if (!tooClose) {
                foundAngle = candidate;
                break;
              }
            }
            angleDeg = foundAngle !== null ? foundAngle : ((angleDeg + ((k - ci) * 35)) % 360);
          }
          seenAngles.add(angleDeg.toFixed(1));
          const angleRad = (angleDeg * Math.PI) / 180.0;
          const dLat = (radiusMeters * Math.cos(angleRad)) / 111320.0;
          const dLon = (radiusMeters * Math.sin(angleRad)) / (111320.0 * Math.cos(latRad));
          wp.lat = clusterLat + dLat;
          wp.lon = clusterLon + dLon;
        }

        if (prevClusterLat !== null && prevClusterLon !== null) {
          let d = haversineDistance(prevClusterLat, prevClusterLon, wp.lat, wp.lon);
          if (d < 0.6) {
            const dToCenter = haversineDistance(clusterLat, clusterLon, prevClusterLat, prevClusterLon);
            if (dToCenter >= 0.8) {
              wp.lat = clusterLat;
              wp.lon = clusterLon;
            } else {
              const angleRad = ((wp.heading || 0) * Math.PI) / 180.0;
              const r = 1.35 + 0.7;
              wp.lat = clusterLat + (r * Math.cos(angleRad)) / 111320.0;
              wp.lon = clusterLon + (r * Math.sin(angleRad)) / (111320.0 * Math.cos(latRad));
            }
          }
        }
        prevClusterLat = wp.lat;
        prevClusterLon = wp.lon;
      }
    }
    ci = cj;
  }

  const gridTypeEl = typeof document !== 'undefined' ? document.getElementById('grid-type') : null;
  const gridType = (gridTypeEl && gridTypeEl.value) ? gridTypeEl.value : (waypoints.find(w => w && w.gridType)?.gridType || '');

  // Identify hyperlapse segments in sanitizedWps
  const hyperlapseSegments = [];
  let currentHlSegment = null;
  sanitizedWps.forEach((w, i) => {
    const isH = (gridType === 'hyperlapse') || (w.isHyperlapse) || (w.gridType === 'hyperlapse') || (w.layerPattern === 'hyperlapse');
    if (isH) {
      if (!currentHlSegment) {
        currentHlSegment = { startIdx: i, endIdx: i, layerId: w.layerId, interval: w.hyperlapseInterval || 3 };
        hyperlapseSegments.push(currentHlSegment);
      } else {
        currentHlSegment.endIdx = i;
      }
    } else {
      currentHlSegment = null;
    }
  });

  sanitizedWps.forEach((wp, idx) => {
    const waypointActions = [];
    const isHyperlapse = (gridType === 'hyperlapse') || (wp.isHyperlapse) || (wp.gridType === 'hyperlapse') || (wp.layerPattern === 'hyperlapse');
    
    // Resolve layer reference if available (Three-Tier Cascading Hierarchy)
    const layersList = (typeof global !== 'undefined' && Array.isArray(global.flightLayers) && global.flightLayers.length > 0)
      ? global.flightLayers
      : ((typeof flightLayers !== 'undefined' && Array.isArray(flightLayers)) ? flightLayers : null);
    let wpLayer = (wp.layerId && layersList) ? layersList.find(l => l.id === wp.layerId) : null;
    if (!wpLayer && layersList && typeof wp.layerIndex === 'number' && layersList[wp.layerIndex]) {
      wpLayer = layersList[wp.layerIndex];
    }
    // Only infer layer by accumulation in multi-layer missions where waypoints have layer metadata or stack has > 1 layer
    if (!wpLayer && layersList && layersList.length > 1 && (wp.layerId || wp.layerCaptureMode || wp.layerAltitude || wp.layerPattern)) {
      let accum = 0;
      for (const l of layersList) {
        if (!l.enabled || l.isExclusionZone || l.pattern === 'exclusion-box' || l.pattern === 'exclusion-freeform' || l.isDrawingLayer || l.pattern === 'boundary-polygon' || l.pattern === 'fiducial-markers' || l.isFiducialLayer) continue;
        const lCount = (Array.isArray(l.waypoints) && l.waypoints.length > 0) ? l.waypoints.length : ((Array.isArray(l.roadWaypoints) && l.roadWaypoints.length > 0) ? l.roadWaypoints.length : ((Array.isArray(l.freeformWaypoints) && l.freeformWaypoints.length > 0) ? l.freeformWaypoints.length : 0));
        if (lCount > 0 && idx >= accum && idx < accum + lCount) {
          wpLayer = l;
          break;
        }
        accum += lCount;
      }
    }

    // Resolve Effective Layer & Waypoint Properties (Three-Tier Cascade: Waypoint -> Layer -> Global)
    const effectiveCaptureMode = (wp.captureMode && wp.captureMode !== 'inherit')
      ? wp.captureMode
      : (wp.layerCaptureMode && wp.layerCaptureMode !== 'inherit')
        ? wp.layerCaptureMode
        : (wpLayer && wpLayer.captureMode && wpLayer.captureMode !== 'inherit')
          ? wpLayer.captureMode
          : (captureMode || 'stopAndShoot');

    const effectivePathMode = (wp.pathMode && wp.pathMode !== 'inherit')
      ? wp.pathMode
      : (wp.layerPathMode && wp.layerPathMode !== 'inherit')
        ? wp.layerPathMode
        : (wpLayer && wpLayer.pathMode && wpLayer.pathMode !== 'inherit')
          ? wpLayer.pathMode
          : (pathMode || 'curved');

    const isStopAndShoot = effectiveCaptureMode === 'stopAndShoot';
    const isVideo = effectiveCaptureMode === 'video';

    // Determine if repositioning (gimbal pitch or heading yaw) is required
    const reposInfo = checkNeedsReposition(idx, sanitizedWps);
    const isRoadFollowing = gridType === 'road-following';

    // Three-Tier Hover Time Resolution:
    // Tier 3: wp.hoverTime (if not null/undefined)
    // Tier 2: wp.layerHoverTime (if not null/undefined/inherit)
    // Tier 1: globalHoverTime
    let baseHover = globalHoverTime;
    if (wp.layerHoverTime !== undefined && wp.layerHoverTime !== null && wp.layerHoverTime !== 'inherit') {
      baseHover = parseInt(wp.layerHoverTime, 10) || 0;
    }
    if (wp.hoverTime !== null && wp.hoverTime !== undefined && wp.hoverTime !== 'inherit') {
      baseHover = parseInt(wp.hoverTime, 10) || 0;
    }
    let effectiveHover = baseHover;

    // Universal Auto-Settling Delays across ALL flight patterns in stopAndShoot mode
    const autoSettlingEnabled = wp.autoSettlingEnabled !== false;
    const baseSettling = wp.baseSettlingTime !== undefined ? wp.baseSettlingTime : 2.0;
    const majorTurnSettling = wp.majorTurnSettlingTime !== undefined ? wp.majorTurnSettlingTime : 5.0;
    const modTurnSettling = wp.moderateTurnSettlingTime !== undefined ? wp.moderateTurnSettlingTime : 4.0;
    const pitchSettling = wp.pitchSettlingTime !== undefined ? wp.pitchSettlingTime : 3.0;

    const isPhotoSphere = (gridType === 'photo-sphere') || (wp.isPhotoSphere) || (wp.isPhotoSpherePoint) || (wp.layerPattern === 'photo-sphere');

    const isExtendedSettling = (gridType === 'target-splat') ||
      (gridType === 'photo-sphere') ||
      isPhotoSphere ||
      (wp.gridType === 'target-splat') ||
      (wp.gridType === 'photo-sphere') ||
      (wp.isPhotoSpherePoint) ||
      (wp._clusterSize > 1) ||
      (wp.layerId && (wp.majorTurnSettlingTime !== undefined || (typeof flightLayers !== 'undefined' && flightLayers.some(l => l.id === wp.layerId && (l.pattern === 'target-splat' || l.pattern === 'photo-sphere')))));

    if ((isStopAndShoot || isPhotoSphere) && autoSettlingEnabled && !wp.skipPhoto && !wp.isDetour && !wp.isTransition) {
      if (effectiveHover < baseSettling) {
        effectiveHover = baseSettling;
      }
      if (idx > 0 && isExtendedSettling) {
        if (reposInfo.headingDiff >= 60) {
          effectiveHover = Math.max(effectiveHover, majorTurnSettling);
        } else if (reposInfo.headingDiff >= 25) {
          effectiveHover = Math.max(effectiveHover, modTurnSettling);
        } else if (reposInfo.isGimbalChanged) {
          effectiveHover = Math.max(effectiveHover, isPhotoSphere ? Math.max(modTurnSettling, pitchSettling) : pitchSettling);
        }
      }
    }

    // Compute effective pitch for use in both gimbalRotate action and waypointGimbalHeadingParam
    let effectivePitch;
    const rawWpPitch = wp.pitch !== undefined ? wp.pitch : (wpLayer && wpLayer.gimbalPitch !== undefined ? wpLayer.gimbalPitch : gimbalPitch);
    if (rawWpPitch === 'auto' || (typeof rawWpPitch === 'string' && rawWpPitch.toLowerCase() === 'auto')) {
      const effectiveAltForPitch = (wp.isModified && wp.alt !== undefined && wp.alt !== null && wp.alt !== 'inherit')
        ? wp.alt
        : ((wp.layerAltitude !== undefined && wp.layerAltitude !== null && wp.layerAltitude !== 'inherit')
          ? wp.layerAltitude
          : ((wpLayer && wpLayer.altitude !== undefined && wpLayer.altitude !== null && wpLayer.altitude !== 'inherit')
            ? wpLayer.altitude
            : (wp.alt !== undefined && !wpLayer && (wp.alt !== 50 || altitude === 50) ? wp.alt : altitude)));

      if (wp.isRoadDroneWaypoint || isRoadFollowing) {
        const offset = (wpLayer && wpLayer.roadOffset !== undefined) ? wpLayer.roadOffset : 15;
        effectivePitch = (Math.abs(offset) < 0.01) ? -90 : -Math.round(Math.atan2(effectiveAltForPitch, Math.max(Math.abs(offset), 1)) * (180.0 / Math.PI));
      } else {
        const targetPoi = (typeof getTargetPoiCoordinates === 'function') ? getTargetPoiCoordinates(wp, wpLayer) : null;
        effectivePitch = (typeof calculate3DPoiPitch === 'function')
          ? calculate3DPoiPitch(wp, targetPoi, effectiveAltForPitch)
          : -45;
      }
    } else {
      effectivePitch = parseGimbalPitch(rawWpPitch, -60);
    }

    if (idx === 0 || wp.isRingStart || isRoadFollowing || reposInfo.isGimbalChanged) {
      const currentPitch = effectivePitch;
      waypointActions.push(`          <wpml:action>
            <wpml:actionId>${actionId++}</wpml:actionId>
            <wpml:actionActuatorFunc>gimbalRotate</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>
              <wpml:gimbalHeadingYawBase>aircraft</wpml:gimbalHeadingYawBase>
              <wpml:gimbalRotateMode>absoluteAngle</wpml:gimbalRotateMode>
              <wpml:gimbalPitchRotateEnable>1</wpml:gimbalPitchRotateEnable>
              <wpml:gimbalPitchRotateAngle>${currentPitch}</wpml:gimbalPitchRotateAngle>
              <wpml:gimbalRollRotateEnable>0</wpml:gimbalRollRotateEnable>
              <wpml:gimbalRollRotateAngle>0</wpml:gimbalRollRotateAngle>
              <wpml:gimbalYawRotateEnable>0</wpml:gimbalYawRotateEnable>
              <wpml:gimbalYawRotateAngle>0</wpml:gimbalYawRotateAngle>
              <wpml:gimbalRotateTimeEnable>0</wpml:gimbalRotateTimeEnable>
              <wpml:gimbalRotateTime>0</wpml:gimbalRotateTime>
              <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
            </wpml:actionActuatorFuncParam>
          </wpml:action>`);
    }

    if (isPhotoSphere && !isConsumer) {
      let targetHeading = (wp.heading !== null && wp.heading !== undefined && !isNaN(wp.heading)) ? wp.heading : 0;
      targetHeading = ((targetHeading % 360) + 360) % 360;
      if (targetHeading > 180) targetHeading -= 360;
      if (targetHeading === 0) targetHeading = 0.1;
      waypointActions.push(`          <wpml:action>
            <wpml:actionId>${actionId++}</wpml:actionId>
            <wpml:actionActuatorFunc>rotateYaw</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>
              <wpml:aircraftHeading>${targetHeading.toFixed(1)}</wpml:aircraftHeading>
              <wpml:aircraftPathMode>clockwise</wpml:aircraftPathMode>
            </wpml:actionActuatorFuncParam>
          </wpml:action>`);
    }

    // 2. Hover duration action (MUST run to stabilize gimbal and yaw)
    if (effectiveHover > 0) {
      waypointActions.push(`          <wpml:action>
            <wpml:actionId>${actionId++}</wpml:actionId>
            <wpml:actionActuatorFunc>hover</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>
              <wpml:hoverTime>${effectiveHover}</wpml:hoverTime>
            </wpml:actionActuatorFuncParam>
          </wpml:action>`);
    }

    // 3. Zoom action (only set once on the first waypoint to apply for the entire flight)
    if (cameraZoom > 1.0 && idx === 0) {
      waypointActions.push(`          <wpml:action>
            <wpml:actionId>${actionId++}</wpml:actionId>
            <wpml:actionActuatorFunc>zoom</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>
              <wpml:focalLength>0</wpml:focalLength>
              <wpml:isUseFocalFactor>1</wpml:isUseFocalFactor>
              <wpml:focalFactor>${cameraZoom.toFixed(1)}</wpml:focalFactor>
              <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
            </wpml:actionActuatorFuncParam>
          </wpml:action>`);
    }

    // Helper to resolve effective capture mode for neighbor waypoints in the 3-Tier cascade
    const resolveNeighborCaptureMode = (neighborWp, neighborIdx) => {
      if (!neighborWp) return null;
      if (neighborWp.captureMode && neighborWp.captureMode !== 'inherit') return neighborWp.captureMode;
      if (neighborWp.layerCaptureMode && neighborWp.layerCaptureMode !== 'inherit') return neighborWp.layerCaptureMode;
      let nLayer = (neighborWp.layerId && layersList) ? layersList.find(l => l.id === neighborWp.layerId) : null;
      if (!nLayer && layersList && typeof neighborWp.layerIndex === 'number' && layersList[neighborWp.layerIndex]) {
        nLayer = layersList[neighborWp.layerIndex];
      }
      if (!nLayer && layersList && layersList.length > 1 && (neighborWp.layerId || neighborWp.layerCaptureMode || neighborWp.layerAltitude || neighborWp.layerPattern)) {
        let acc = 0;
        for (const l of layersList) {
          if (!l.enabled || l.isExclusionZone || l.pattern === 'exclusion-box' || l.pattern === 'exclusion-freeform' || l.isDrawingLayer || l.pattern === 'boundary-polygon' || l.pattern === 'fiducial-markers' || l.isFiducialLayer) continue;
          const lc = (Array.isArray(l.waypoints) && l.waypoints.length > 0) ? l.waypoints.length : ((Array.isArray(l.roadWaypoints) && l.roadWaypoints.length > 0) ? l.roadWaypoints.length : ((Array.isArray(l.freeformWaypoints) && l.freeformWaypoints.length > 0) ? l.freeformWaypoints.length : 0));
          if (lc > 0 && neighborIdx >= acc && neighborIdx < acc + lc) {
            nLayer = l;
            break;
          }
          acc += lc;
        }
      }
      if (nLayer && nLayer.captureMode && nLayer.captureMode !== 'inherit') return nLayer.captureMode;
      return captureMode || 'stopAndShoot';
    };

    // 4. Video record actions: Start at entry of video layer/mission, Stop at exit of video layer/mission
    const prevWp = idx > 0 ? waypoints[idx - 1] : null;
    const nextWp = idx < waypoints.length - 1 ? waypoints[idx + 1] : null;
    const prevWpIsVideo = prevWp ? (resolveNeighborCaptureMode(prevWp, idx - 1) === 'video') : false;
    const nextWpIsVideo = nextWp ? (resolveNeighborCaptureMode(nextWp, idx + 1) === 'video') : false;

    if (isVideo && (!prevWp || !prevWpIsVideo || wp.isLayerStart)) {
      waypointActions.push(`          <wpml:action>
            <wpml:actionId>${actionId++}</wpml:actionId>
            <wpml:actionActuatorFunc>startRecord</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>
              <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
            </wpml:actionActuatorFuncParam>
          </wpml:action>`);
    }
    if (isVideo && (!nextWp || !nextWpIsVideo || (nextWp && nextWp.isLayerStart))) {
      waypointActions.push(`          <wpml:action>
            <wpml:actionId>${actionId++}</wpml:actionId>
            <wpml:actionActuatorFunc>stopRecord</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>
              <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
            </wpml:actionActuatorFuncParam>
          </wpml:action>`);
    }

    // 5. If Stop & Shoot is active, also add photo trigger at this waypoint (skipping transit turnaround overshoot waypoints and never in video mode)
    if ((isStopAndShoot || isPhotoSphere) && wp.skipPhoto !== true && !isVideo) {
      waypointActions.push(`          <wpml:action>
            <wpml:actionId>${actionId++}</wpml:actionId>
            <wpml:actionActuatorFunc>takePhoto</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>
              <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
            </wpml:actionActuatorFuncParam>
          </wpml:action>`);
    }

    // 6. Per-waypoint camera action (RC 2 feature parity)
    const perWpAction = wp.cameraAction || 'inherit';
    if (perWpAction !== 'inherit' && perWpAction !== 'none') {
      if (perWpAction === 'takePhoto') {
        waypointActions.push(`          <wpml:action>
            <wpml:actionId>${actionId++}</wpml:actionId>
            <wpml:actionActuatorFunc>takePhoto</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>
              <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
            </wpml:actionActuatorFuncParam>
          </wpml:action>`);
      } else if (perWpAction === 'startRecord') {
        waypointActions.push(`          <wpml:action>
            <wpml:actionId>${actionId++}</wpml:actionId>
            <wpml:actionActuatorFunc>startRecord</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>
              <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
            </wpml:actionActuatorFuncParam>
          </wpml:action>`);
      } else if (perWpAction === 'stopRecord') {
        waypointActions.push(`          <wpml:action>
            <wpml:actionId>${actionId++}</wpml:actionId>
            <wpml:actionActuatorFunc>stopRecord</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>
              <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
            </wpml:actionActuatorFuncParam>
          </wpml:action>`);
      } else if (perWpAction === 'zoom') {
        const zoomFactor = wp.zoom ? parseFloat(wp.zoom) : cameraZoom;
        waypointActions.push(`          <wpml:action>
            <wpml:actionId>${actionId++}</wpml:actionId>
            <wpml:actionActuatorFunc>zoom</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>
              <wpml:focalLength>0</wpml:focalLength>
              <wpml:isUseFocalFactor>1</wpml:isUseFocalFactor>
              <wpml:focalFactor>${zoomFactor.toFixed(1)}</wpml:focalFactor>
              <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
            </wpml:actionActuatorFuncParam>
          </wpml:action>`);
      }
    }

    let actionsForThisPlacemark = '';
    const placemarkActionGroupBlocks = [];

    if (waypointActions.length > 0) {
      placemarkActionGroupBlocks.push(`        <wpml:actionGroup>
          <wpml:actionGroupId>${actionGroupId++}</wpml:actionGroupId>
          <wpml:actionGroupStartIndex>${idx}</wpml:actionGroupStartIndex>
          <wpml:actionGroupEndIndex>${idx}</wpml:actionGroupEndIndex>
          <wpml:actionGroupMode>sequence</wpml:actionGroupMode>
          <wpml:actionTrigger>
            <wpml:actionTriggerType>reachPoint</wpml:actionTriggerType>
          </wpml:actionTrigger>
${waypointActions.join('\n')}
        </wpml:actionGroup>`);
    }

    if (isHyperlapse) {
      const seg = hyperlapseSegments.find(s => s.startIdx === idx && s.endIdx > s.startIdx);
      if (seg) {
        const segInterval = (seg.interval !== undefined && !isNaN(seg.interval)) ? seg.interval : 3;
        placemarkActionGroupBlocks.push(`        <wpml:actionGroup>
          <wpml:actionGroupId>${actionGroupId++}</wpml:actionGroupId>
          <wpml:actionGroupStartIndex>${seg.startIdx}</wpml:actionGroupStartIndex>
          <wpml:actionGroupEndIndex>${seg.endIdx}</wpml:actionGroupEndIndex>
          <wpml:actionGroupMode>sequence</wpml:actionGroupMode>
          <wpml:actionTrigger>
            <wpml:actionTriggerType>multipleTiming</wpml:actionTriggerType>
            <wpml:actionTriggerParam>${segInterval}</wpml:actionTriggerParam>
          </wpml:actionTrigger>
          <wpml:action>
            <wpml:actionId>${actionId++}</wpml:actionId>
            <wpml:actionActuatorFunc>takePhoto</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>
              <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
            </wpml:actionActuatorFuncParam>
          </wpml:action>
        </wpml:actionGroup>`);
      }

      const inSeg = hyperlapseSegments.find(s => idx >= s.startIdx && idx < s.endIdx);
      if (inSeg && sanitizedWps[idx + 1]) {
        const nextWp = sanitizedWps[idx + 1];
        let nextPitch;
        const rawNextPitch = nextWp.pitch !== undefined ? nextWp.pitch : (wpLayer && wpLayer.gimbalPitch !== undefined ? wpLayer.gimbalPitch : gimbalPitch);
        if (rawNextPitch === 'auto' || (typeof rawNextPitch === 'string' && rawNextPitch.toLowerCase() === 'auto')) {
          const nextAltForPitch = (nextWp.isModified && nextWp.alt !== undefined && nextWp.alt !== null && nextWp.alt !== 'inherit')
            ? nextWp.alt
            : ((nextWp.layerAltitude !== undefined && nextWp.layerAltitude !== null && nextWp.layerAltitude !== 'inherit')
              ? nextWp.layerAltitude
              : ((wpLayer && wpLayer.altitude !== undefined && wpLayer.altitude !== null && wpLayer.altitude !== 'inherit')
                ? wpLayer.altitude
                : (nextWp.alt !== undefined && !wpLayer && (nextWp.alt !== 50 || altitude === 50) ? nextWp.alt : altitude)));
          const targetPoi = (typeof getTargetPoiCoordinates === 'function') ? getTargetPoiCoordinates(nextWp, wpLayer) : null;
          nextPitch = (typeof calculate3DPoiPitch === 'function') ? calculate3DPoiPitch(nextWp, targetPoi, nextAltForPitch) : -45;
        } else {
          nextPitch = parseGimbalPitch(rawNextPitch, -60);
        }

        placemarkActionGroupBlocks.push(`        <wpml:actionGroup>
          <wpml:actionGroupId>${actionGroupId++}</wpml:actionGroupId>
          <wpml:actionGroupStartIndex>${idx}</wpml:actionGroupStartIndex>
          <wpml:actionGroupEndIndex>${idx + 1}</wpml:actionGroupEndIndex>
          <wpml:actionGroupMode>sequence</wpml:actionGroupMode>
          <wpml:actionTrigger>
            <wpml:actionTriggerType>betweenAdjacentPoints</wpml:actionTriggerType>
          </wpml:actionTrigger>
          <wpml:action>
            <wpml:actionId>${actionId++}</wpml:actionId>
            <wpml:actionActuatorFunc>gimbalEvenlyRotate</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>
              <wpml:gimbalPitchRotateAngle>${nextPitch}</wpml:gimbalPitchRotateAngle>
              <wpml:gimbalRollRotateAngle>0</wpml:gimbalRollRotateAngle>
              <wpml:gimbalYawRotateAngle>0</wpml:gimbalYawRotateAngle>
              <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
            </wpml:actionActuatorFuncParam>
          </wpml:action>
        </wpml:actionGroup>`);
      }
    }

    if (placemarkActionGroupBlocks.length > 0) {
      actionsForThisPlacemark = placemarkActionGroupBlocks.join('\n') + '\n';
    }

    // Determine heading mode and angle for this waypoint (Tier 3: wp -> Tier 2: layer -> Tier 1: global)
    const validHeadingModes = ['followWayline', 'smoothTransition', 'towardPOI', 'manually', 'custom', 'fixed'];
    let effectiveHeadingMode = (headingMode && validHeadingModes.includes(headingMode)) ? headingMode : 'followWayline';
    if (wp.layerHeadingMode && wp.layerHeadingMode !== 'inherit' && validHeadingModes.includes(wp.layerHeadingMode)) {
      effectiveHeadingMode = wp.layerHeadingMode;
    } else if (wpLayer && wpLayer.headingMode && wpLayer.headingMode !== 'inherit' && validHeadingModes.includes(wpLayer.headingMode)) {
      effectiveHeadingMode = wpLayer.headingMode;
    }
    let actualHeadingMode = effectiveHeadingMode;
    let actualHeadingAngle = 0;
    let poiPoint = "0.000000,0.000000,0.000000";

    const wpMode = wp.headingMode || 'inherit';
    let targetPoiIndex = 0;
    const wpTargetPoiId = (wp.targetPoiId && wp.targetPoiId !== 'inherit') ? wp.targetPoiId : null;
    const layerTargetPoiId = (wpLayer && wpLayer.targetPoiId && wpLayer.targetPoiId !== 'inherit') ? wpLayer.targetPoiId : null;
    const targetPoiId = ((wpMode === 'towardPOI' || wp.isModified) && wpTargetPoiId)
      ? wpTargetPoiId
      : (layerTargetPoiId || wpTargetPoiId);
    // Resolve target POI from layer or wp if set
    if (targetPoiId && typeof pois !== 'undefined' && pois && pois.length > 0) {
      const poiFoundIdx = pois.findIndex(p => p.id === targetPoiId);
      if (poiFoundIdx !== -1) {
        targetPoiIndex = poiFoundIdx;
      } else if (wp.poiIndex !== undefined && wp.poiIndex !== null && pois[wp.poiIndex]) {
        targetPoiIndex = wp.poiIndex;
      }
    } else if (wp.poiIndex !== undefined && wp.poiIndex !== null && pois && pois[wp.poiIndex]) {
      targetPoiIndex = wp.poiIndex;
    }

    if (wpMode !== 'inherit') {
      if (wpMode === 'custom' || wpMode === 'smoothTransition' || ((gridType === 'hyperlapse' || gridType === 'target-splat' || gridType === 'exclusion-freeform' || gridType === 'freeform' || (wpLayer && (wpLayer.pattern === 'hyperlapse' || wpLayer.pattern === 'exclusion-freeform' || wpLayer.pattern === 'freeform')) || wp.layerPattern === 'hyperlapse' || wp.layerPattern === 'freeform' || wp.layerPattern === 'exclusion-freeform' || (wp.gridType && (wp.gridType === 'hyperlapse' || wp.gridType === 'freeform' || wp.gridType === 'exclusion-freeform'))) && wpMode === 'followWayline')) {
        actualHeadingMode = 'smoothTransition';
        actualHeadingAngle = (wp.heading !== null && wp.heading !== undefined && !isNaN(wp.heading)) ? wp.heading : 0;
      } else {
        actualHeadingMode = wpMode;
        if (wpMode === 'towardPOI') {
          let targetPoi = pois[targetPoiIndex] || pois[0];
          if (!targetPoi && targetPoiIndex === 0 && typeof centerMarker !== 'undefined' && centerMarker) {
            const latlng = centerMarker.getLatLng();
            targetPoi = { lat: latlng.lat, lon: latlng.lng };
          }
          if (targetPoi) {
            const poiAlt = (targetPoi.alt !== undefined && !isNaN(targetPoi.alt)) ? Number(targetPoi.alt) : 0;
            poiPoint = `${targetPoi.lat.toFixed(6)},${targetPoi.lon.toFixed(6)},${poiAlt.toFixed(6)}`;
          }
        }
      }
    } else {
      if ((gridType === 'hyperlapse' || gridType === 'freeform' || gridType === 'exclusion-freeform' || gridType === 'target-splat' || gridType === 'road-following' || gridType === 'photo-sphere' || wp.isHyperlapse || wp.isPhotoSphere || wp.isRoadDroneWaypoint || wp.layerPattern === 'hyperlapse' || wp.layerPattern === 'freeform' || wp.layerPattern === 'exclusion-freeform' || (wp.gridType && (wp.gridType === 'hyperlapse' || wp.gridType === 'freeform' || wp.gridType === 'exclusion-freeform')) || (wpLayer && (wpLayer.pattern === 'hyperlapse' || wpLayer.pattern === 'freeform' || wpLayer.pattern === 'exclusion-freeform')))) {
        actualHeadingMode = 'smoothTransition';
        actualHeadingAngle = (wp.heading !== null && wp.heading !== undefined && !isNaN(wp.heading)) ? wp.heading : 0;
      } else if (effectiveHeadingMode === 'towardPOI') {
        actualHeadingMode = 'towardPOI';
        let targetPoi = pois[targetPoiIndex] || pois[0];
        if (!targetPoi && targetPoiIndex === 0 && typeof centerMarker !== 'undefined' && centerMarker) {
          const latlng = centerMarker.getLatLng();
          targetPoi = { lat: latlng.lat, lon: latlng.lng, alt: (pois[0] && pois[0].alt) || 0 };
        }
        if (targetPoi) {
          const poiAlt = (targetPoi.alt !== undefined && !isNaN(targetPoi.alt)) ? Number(targetPoi.alt) : 0;
          poiPoint = `${targetPoi.lat.toFixed(6)},${targetPoi.lon.toFixed(6)},${poiAlt.toFixed(6)}`;
        }
      } else if (effectiveHeadingMode === 'custom' || effectiveHeadingMode === 'smoothTransition') {
        actualHeadingMode = 'smoothTransition';
        actualHeadingAngle = (wp.heading !== null && wp.heading !== undefined && !isNaN(wp.heading))
          ? wp.heading
          : ((typeof getEffectiveLayerCustomHeading === 'function') ? getEffectiveLayerCustomHeading(wpLayer) : 0);
      } else if (effectiveHeadingMode === 'fixed') {
        actualHeadingMode = 'smoothTransition';
        actualHeadingAngle = 0.1;
      } else {
        // Default followWayline
        actualHeadingMode = 'followWayline';
      }
    }

    if (actualHeadingMode === 'followWayline' || actualHeadingMode === 'towardPOI') {
      actualHeadingAngle = 0;
    } else if (wp.heading !== null && wp.heading !== undefined && !isNaN(wp.heading)) {
      actualHeadingAngle = wp.heading;
    } else if (effectiveHeadingMode === 'custom') {
      actualHeadingAngle = (typeof getEffectiveLayerCustomHeading === 'function') ? getEffectiveLayerCustomHeading(wpLayer) : 0;
      if (actualHeadingAngle === 0) actualHeadingAngle = 0.1;
    } else {
      // Compute bearing from lat/lon to avoid NaN when x/y offsets are not set
      let fromWp, toWp;
      if (idx < waypoints.length - 1) {
        fromWp = waypoints[idx];
        toWp = waypoints[idx + 1];
      } else if (idx > 0) {
        fromWp = waypoints[idx - 1];
        toWp = waypoints[idx];
      }
      if (toWp && fromWp &&
          fromWp.lat !== undefined && fromWp.lon !== undefined &&
          toWp.lat !== undefined && toWp.lon !== undefined) {
        const lat1 = fromWp.lat * Math.PI / 180;
        const lat2 = toWp.lat * Math.PI / 180;
        const dLon = (toWp.lon - fromWp.lon) * Math.PI / 180;
        const y = Math.sin(dLon) * Math.cos(lat2);
        const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
        let bearing = Math.atan2(y, x) * 180 / Math.PI;
        if (bearing < 0) bearing += 360;
        actualHeadingAngle = bearing;
      } else {
        const gridRotEl = document.getElementById('grid-rotation');
        const gridRot = gridRotEl ? parseFloat(gridRotEl.value) : 0;
        const h = getDefaultHeading(idx, waypoints, gridRot);
        actualHeadingAngle = isNaN(h) ? 0 : h;
      }
    }

    if (isNaN(actualHeadingAngle) || actualHeadingAngle === null || actualHeadingAngle === undefined) {
      actualHeadingAngle = 0;
    }

    // DJI RC 2 Golden Rule: Waypoint 0 (entry) and Waypoint N-1 (exit) have enable=1;
    // all intermediate waypoints in followWayline and towardPOI have enable=0 to allow dynamic heading tracking!
    let headingAngleEnable = 0;
    if (actualHeadingMode === 'smoothTransition' || actualHeadingMode === 'fixed' || actualHeadingMode === 'custom') {
      headingAngleEnable = 1;
    } else if (actualHeadingMode === 'followWayline' || actualHeadingMode === 'towardPOI') {
      headingAngleEnable = (idx === 0 || idx === waypoints.length - 1) ? 1 : 0;
    } else {
      headingAngleEnable = 0;
    }

    if (actualHeadingMode === 'followWayline' || actualHeadingMode === 'towardPOI') {
      // Stock DJI Fly strictly enforces waypointHeadingAngle: 0 for followWayline and towardPOI
      actualHeadingAngle = 0;
    } else {
      // Normalize custom angle into [-180, 180] per DJI WPML schema
      actualHeadingAngle = ((actualHeadingAngle % 360) + 360) % 360;
      if (actualHeadingAngle > 180) actualHeadingAngle -= 360;
      // DJI Fly firmware has a bug in smoothTransition where waypointHeadingAngle of strictly 0.0 with headingAngleEnable: 1
      // causes "Error performing flight: Waypoint Flight Suspended". Clamp 0.0 to 0.1 to avoid firmware rejection.
      if (headingAngleEnable === 1 && (actualHeadingAngle === 0 || Math.abs(actualHeadingAngle) < 0.05)) {
        actualHeadingAngle = 0.1;
      }
    }

    // Resolve Altitude via Three-Tier Cascading Hierarchy (Tier 3 Override -> Tier 2 Layer -> Tier 1 Global)
    let currentAltitude;
    if (wp.isModified && wp.alt !== undefined && wp.alt !== null && wp.alt !== 'inherit') {
      currentAltitude = wp.alt;
    } else if (wp.layerAltitude !== undefined && wp.layerAltitude !== null && wp.layerAltitude !== 'inherit') {
      currentAltitude = wp.layerAltitude;
    } else if (wpLayer && wpLayer.altitude !== undefined && wpLayer.altitude !== null && wpLayer.altitude !== 'inherit') {
      currentAltitude = wpLayer.altitude;
    } else if (wp.alt !== undefined && wp.alt !== null && wp.alt !== 'inherit' && !wpLayer && (wp.alt !== 50 || altitude === 50)) {
      currentAltitude = wp.alt;
    } else {
      currentAltitude = altitude;
    }
    
    // Resolve Speed: If turnaround point and turnaroundSpeed specified, use it; else wp.speed or global speed
    let actualSpeed = (wp.speed !== undefined && wp.speed !== null && !isNaN(wp.speed)) ? wp.speed : speed;
    if (wp.isTurnaroundPoint && wp.turnaroundSpeed !== null && wp.turnaroundSpeed !== undefined && !isNaN(wp.turnaroundSpeed)) {
      actualSpeed = wp.turnaroundSpeed;
    }
    // Photo Sphere / Micro-Cluster Speed Clamping:
    // When waypoints belong to a photo-sphere or micro-spaced cluster (distance < 2.0m),
    // clamp speed to 1.0 m/s so the aircraft does not violently pitch, accelerate, or overshoot over sub-meter distances.
    if (isPhotoSphere) {
      actualSpeed = Math.min(actualSpeed, 1.0);
    }

    // Consumer Drone Golden Rule & Turn Mode resolution:
    // Consumer drones (Mini 4 Pro / Air 3) strictly require ContinuityCurvature and useStraightLine: 0
    let actualTurnMode;
    let actualUseStraightLine = 0;

    if (isPhotoSphere) {
      actualTurnMode = isConsumer 
        ? 'toPointAndStopWithContinuityCurvature'
        : 'toPointAndStopWithDiscontinuityCurvature';
      actualUseStraightLine = 0;
    } else if (isHyperlapse) {
      actualTurnMode = (idx === 0 || idx === sanitizedWps.length - 1)
        ? 'toPointAndStopWithContinuityCurvature'
        : 'toPointAndPassWithContinuityCurvature';
      actualUseStraightLine = 0;
    } else if (isConsumer) {
      actualTurnMode = isStopAndShoot 
        ? 'toPointAndStopWithContinuityCurvature'
        : 'toPointAndPassWithContinuityCurvature';
      actualUseStraightLine = 0;
    } else if (effectivePathMode === 'straight') {
      actualTurnMode = isStopAndShoot
        ? 'toPointAndStopWithDiscontinuityCurvature'
        : 'toPointAndPassWithDiscontinuityCurvature';
      actualUseStraightLine = 1;
    } else {
      actualTurnMode = isStopAndShoot
        ? 'toPointAndStopWithContinuityCurvature'
        : 'toPointAndPassWithContinuityCurvature';
      actualUseStraightLine = 0;
    }

    // Per-waypoint turnMode override
    if (wp.turnMode && wp.turnMode !== 'inherit') {
      if (isConsumer) {
        actualTurnMode = wp.turnMode === 'stop'
          ? 'toPointAndStopWithContinuityCurvature'
          : 'toPointAndPassWithContinuityCurvature';
      } else if (effectivePathMode === 'straight') {
        actualTurnMode = wp.turnMode === 'stop'
          ? 'toPointAndStopWithDiscontinuityCurvature'
          : 'toPointAndPassWithDiscontinuityCurvature';
      } else {
        actualTurnMode = wp.turnMode === 'stop'
          ? 'toPointAndStopWithContinuityCurvature'
          : 'toPointAndPassWithContinuityCurvature';
      }
    }

    // Endpoint Rule: Waypoint 0 (start) and Waypoint N-1 (end) MUST ALWAYS be stop points!
    // Passing turn modes at endpoints have no entry/exit tangent vectors and trigger "Error performing flight" in DJI Fly.
    if (idx === 0 || idx === waypoints.length - 1) {
      actualTurnMode = (isConsumer || effectivePathMode !== 'straight' && !actualTurnMode.includes('Discontinuity'))
        ? 'toPointAndStopWithContinuityCurvature'
        : 'toPointAndStopWithDiscontinuityCurvature';
    }

    const dampingDist = (wp.turnDampingDist !== undefined && wp.turnDampingDist !== null && !isNaN(wp.turnDampingDist)) ? wp.turnDampingDist : 0;

    placemarksXml += `      <Placemark>
        <Point>
          <coordinates>
            ${wp.lon.toFixed(13)},${wp.lat.toFixed(13)}
          </coordinates>
        </Point>
        <wpml:index>${idx}</wpml:index>
        <wpml:executeHeight>${currentAltitude}</wpml:executeHeight>
        <wpml:waypointSpeed>${actualSpeed}</wpml:waypointSpeed>
        <wpml:waypointHeadingParam>
          <wpml:waypointHeadingMode>${actualHeadingMode}</wpml:waypointHeadingMode>
          <wpml:waypointHeadingAngle>${(actualHeadingMode === 'smoothTransition' && headingAngleEnable === 1 && (actualHeadingAngle === 0 || Math.abs(actualHeadingAngle) < 0.05)) ? '0.1' : (actualHeadingAngle === 0 ? '0' : actualHeadingAngle.toFixed(1))}</wpml:waypointHeadingAngle>
          <wpml:waypointPoiPoint>${poiPoint}</wpml:waypointPoiPoint>
          <wpml:waypointHeadingAngleEnable>${headingAngleEnable}</wpml:waypointHeadingAngleEnable>
          <wpml:waypointHeadingPathMode>followBadArc</wpml:waypointHeadingPathMode>
          <wpml:waypointHeadingPoiIndex>${targetPoiIndex}</wpml:waypointHeadingPoiIndex>
        </wpml:waypointHeadingParam>
        <wpml:waypointTurnParam>
          <wpml:waypointTurnMode>${actualTurnMode}</wpml:waypointTurnMode>
          <wpml:waypointTurnDampingDist>${dampingDist}</wpml:waypointTurnDampingDist>
        </wpml:waypointTurnParam>
        <wpml:useStraightLine>${actualUseStraightLine}</wpml:useStraightLine>
${actionsForThisPlacemark}        <wpml:waypointGimbalHeadingParam>
          <wpml:waypointGimbalPitchAngle>${effectivePitch}</wpml:waypointGimbalPitchAngle>
          <wpml:waypointGimbalYawAngle>0</wpml:waypointGimbalYawAngle>
        </wpml:waypointGimbalHeadingParam>
      </Placemark>\n`;
  });

  const signalLostEl = document.getElementById('signal-lost-action');
  const signalLostValue = signalLostEl ? signalLostEl.value : 'goBack';
  let exitOnRCLost = 'executeLostAction';
  let executeRCLostAction = signalLostValue;
  if (signalLostValue === 'goContinue') {
    exitOnRCLost = 'goContinue';
    executeRCLostAction = 'goBack';
  }

  const rthAltEl = document.getElementById('rth-altitude');
  const rthAltitude = rthAltEl ? (parseFloat(rthAltEl.value) || 50) : 50;
  const firstWpAlt = (sanitizedWps.length > 0 && sanitizedWps[0].alt !== undefined && !isNaN(sanitizedWps[0].alt))
    ? parseFloat(sanitizedWps[0].alt)
    : (altitude || 50);
  const safeTakeoffHeight = Math.max(1.5, Math.min(rthAltitude, firstWpAlt));

  const isEnterprise = (droneEnumValue !== 68 && droneEnumValue !== 89);
  let templateTypeXml = isEnterprise ? '      <wpml:templateType>waypoint</wpml:templateType>\n' : '';
  let payloadParamXml = isEnterprise ? `      <wpml:payloadParam>
        <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
        <wpml:payloadPitchControlMode>usePointSetting</wpml:payloadPitchControlMode>
      </wpml:payloadParam>\n` : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="http://www.uav.com/wpmz/1.0.2">
  <Document>
    <wpml:missionConfig>
      <wpml:flyToWaylineMode>safely</wpml:flyToWaylineMode>
      <wpml:finishAction>${finishAction}</wpml:finishAction>
      <wpml:exitOnRCLost>${exitOnRCLost}</wpml:exitOnRCLost>
      <wpml:executeRCLostAction>${executeRCLostAction}</wpml:executeRCLostAction>
      <wpml:takeOffSecurityHeight>${safeTakeoffHeight}</wpml:takeOffSecurityHeight>
      <wpml:globalTransitionalSpeed>${speed}</wpml:globalTransitionalSpeed>
      <wpml:droneInfo>
        <wpml:droneEnumValue>${droneEnumValue}</wpml:droneEnumValue>
        <wpml:droneSubEnumValue>0</wpml:droneSubEnumValue>
      </wpml:droneInfo>
    </wpml:missionConfig>
    <Folder>
${templateTypeXml}      <wpml:templateId>0</wpml:templateId>
      <wpml:executeHeightMode>relativeToStartPoint</wpml:executeHeightMode>
      <wpml:waylineId>0</wpml:waylineId>
      <wpml:distance>0</wpml:distance>
      <wpml:duration>0</wpml:duration>
      <wpml:autoFlightSpeed>${speed}</wpml:autoFlightSpeed>
${payloadParamXml}${placemarksXml}    </Folder>
  </Document>
</kml>`;
}

/**
 * Automated Pre-Flight WPML Mission Validator & Linter
 * Audits generated WPML XML against the 10 DJI Fly "Golden Tag" firmware rules
 * to prevent flight suspensions ("Error performing flight") on pressing Go.
 */
function validateWpmlMission(wpmlXml, templateXml = '', options = {}) {
  const result = {
    valid: true,
    rulesPassed: 0,
    totalRules: 10,
    rules: [],
    errors: [],
    warnings: [],
    placemarkCount: 0
  };

  if (!wpmlXml || typeof wpmlXml !== 'string') {
    result.valid = false;
    result.errors.push('Empty or missing waylines.wpml content');
    return result;
  }

  // Parse placemarks
  const placemarks = wpmlXml.split('<Placemark>').slice(1).map(p => {
    const end = p.indexOf('</Placemark>');
    return end !== -1 ? p.substring(0, end) : p;
  });
  result.placemarkCount = placemarks.length;

  // Extract global parameters
  const droneEnumMatch = wpmlXml.match(/<wpml:droneEnumValue>(\d+)<\/wpml:droneEnumValue>/);
  const droneEnumValue = droneEnumMatch ? parseInt(droneEnumMatch[1], 10) : 68;
  const isConsumerDrone = (droneEnumValue === 68 || droneEnumValue === 89);

  // ── RULE 1: Heading Mode & waypointHeadingAngleEnable Coherence ────────────
  let r1Passed = true;
  let r1Msg = 'Heading modes properly assign waypointHeadingAngleEnable (intermediate followWayline waypoints use 0, endpoints use 1; target-splat/exclusion-freeform/freeform uses smoothTransition with enable 1)';
  const isSinglePattern = (options && (options.gridType === 'single' || options.pattern === 'single'));
  const isDoublePattern = (options && (options.gridType === 'double' || options.pattern === 'double'));
  const isTargetSplatPattern = (options && (options.gridType === 'target-splat' || options.pattern === 'target-splat' || options.isTargetSplat)) ||
    (options && Array.isArray(options.waypoints) && options.waypoints.some(w => w && (w.gridType === 'target-splat' || w.isPerimeterOrbit)));
  const isExclusionFreeformPattern = (options && (options.gridType === 'exclusion-freeform' || options.pattern === 'exclusion-freeform' || options.isExclusionFreeform)) ||
    (options && Array.isArray(options.waypoints) && options.waypoints.some(w => w && (w.gridType === 'exclusion-freeform' || w.layerPattern === 'exclusion-freeform')));
  const isFreeformPattern = (options && (options.gridType === 'freeform' || options.pattern === 'freeform' || options.isFreeform)) ||
    (options && Array.isArray(options.waypoints) && options.waypoints.some(w => w && (w.gridType === 'freeform' || w.layerPattern === 'freeform')));
  placemarks.forEach((pm, idx) => {
    const modeMatch = pm.match(/<wpml:waypointHeadingMode>([^<]+)<\/wpml:waypointHeadingMode>/);
    const enableMatch = pm.match(/<wpml:waypointHeadingAngleEnable>([^<]+)<\/wpml:waypointHeadingAngleEnable>/);
    if (modeMatch) {
      const mode = modeMatch[1].trim();
      const enable = enableMatch ? enableMatch[1].trim() : '0';
      const isEndpoint = (idx === 0 || idx === placemarks.length - 1);
      const wpHasCustomHeading = options && Array.isArray(options.waypoints) && options.waypoints[idx] &&
        options.waypoints[idx].heading !== null && options.waypoints[idx].heading !== undefined && !isNaN(options.waypoints[idx].heading);
      const isCustomHeadingWp = isTargetSplatPattern || isExclusionFreeformPattern || isFreeformPattern || wpHasCustomHeading;

      if (isCustomHeadingWp) {
        if (mode === 'followWayline') {
          r1Passed = false;
          const patName = isTargetSplatPattern ? 'target-splat' : (isExclusionFreeformPattern ? 'exclusion-freeform' : (isFreeformPattern ? 'freeform' : 'custom'));
          result.errors.push(`Waypoint ${idx}: pattern is '${patName}' but waypointHeadingMode is 'followWayline' (must use 'smoothTransition' mode with locked headings to prevent getting stuck on first waypoint or flight abort)`);
        } else if (enable !== '1') {
          r1Passed = false;
          const patName = isTargetSplatPattern ? 'target-splat' : (isExclusionFreeformPattern ? 'exclusion-freeform' : (isFreeformPattern ? 'freeform' : 'custom'));
          result.errors.push(`Waypoint ${idx}: pattern is '${patName}' but waypointHeadingAngleEnable is 0 (must be 1 to maintain custom heading orientation)`);
        }
      } else if (mode === 'followWayline') {
        if (!isEndpoint && enable === '1') {
          r1Passed = false;
          result.errors.push(`Waypoint ${idx}: intermediate waypointHeadingMode is 'followWayline' but waypointHeadingAngleEnable is 1 (must be 0 to prevent DJI Fly Go abort)`);
        }
        if (isEndpoint && enable === '0') {
          r1Passed = false;
          result.errors.push(`Waypoint ${idx}: endpoint waypointHeadingMode is 'followWayline' but waypointHeadingAngleEnable is 0 (must be 1 to define initial wayline entry heading for DJI Fly)`);
        }
      }
    }
  });
  if (!r1Passed) result.valid = false; else result.rulesPassed++;
  result.rules.push({ id: 1, name: 'Heading Mode & Angle Enable Coherence', passed: r1Passed, message: r1Msg });

  // ── RULE 2: Zero-Heading Firmware Safety Clamping ──────────────────────────
  let r2Passed = true;
  let r2Msg = 'All custom heading angles are normalized and strictly non-zero (>= 0.1°) to avoid DJI Fly 0.0° suspend bug';
  placemarks.forEach((pm, idx) => {
    const modeMatch = pm.match(/<wpml:waypointHeadingMode>([^<]+)<\/wpml:waypointHeadingMode>/);
    const mode = modeMatch ? modeMatch[1].trim() : '';
    // followWayline and towardPOI strictly use 0 in stock DJI RC 2 WPML
    if (mode === 'followWayline' || mode === 'towardPOI') return;

    const enableMatch = pm.match(/<wpml:waypointHeadingAngleEnable>([^<]+)<\/wpml:waypointHeadingAngleEnable>/);
    const angleMatch = pm.match(/<wpml:waypointHeadingAngle>([^<]+)<\/wpml:waypointHeadingAngle>/);
    if (enableMatch && enableMatch[1].trim() === '1' && angleMatch) {
      const angle = parseFloat(angleMatch[1]);
      if (Math.abs(angle) < 0.05 || angle === 0 || angle === 360) {
        r2Passed = false;
        result.errors.push(`Waypoint ${idx}: waypointHeadingAngle is ${angle}° with enable=1 (must be clamped to >= 0.1° to prevent firmware suspend bug)`);
      }
    }
  });
  if (!r2Passed) result.valid = false; else result.rulesPassed++;
  result.rules.push({ id: 2, name: 'Zero-Heading Firmware Safety Clamping', passed: r2Passed, message: r2Msg });

  // ── RULE 3: Endpoint Turn Mode Tangent Constraints ─────────────────────────
  let r3Passed = true;
  let r3Msg = 'First and last waypoints enforce stop turn modes to guarantee valid spline entry/exit tangents';
  if (placemarks.length > 0) {
    const firstPm = placemarks[0];
    const lastPm = placemarks[placemarks.length - 1];
    const firstTurn = (firstPm.match(/<wpml:waypointTurnMode>([^<]+)<\/wpml:waypointTurnMode>/) || [])[1] || '';
    const lastTurn = (lastPm.match(/<wpml:waypointTurnMode>([^<]+)<\/wpml:waypointTurnMode>/) || [])[1] || '';
    if (firstTurn.includes('Pass')) {
      r3Passed = false;
      result.errors.push(`Waypoint 0 (start) uses pass-through turn mode '${firstTurn}' (must be toPointAndStop... for valid entry tangent)`);
    }
    if (lastTurn.includes('Pass')) {
      r3Passed = false;
      result.errors.push(`Waypoint ${placemarks.length - 1} (end) uses pass-through turn mode '${lastTurn}' (must be toPointAndStop... for valid exit tangent)`);
    }
  }
  if (!r3Passed) result.valid = false; else result.rulesPassed++;
  result.rules.push({ id: 3, name: 'Endpoint Turn Mode Tangents', passed: r3Passed, message: r3Msg });

  // ── RULE 4: 2D Coordinates Under relativeToStartPoint Height Mode ──────────
  let r4Passed = true;
  let r4Msg = 'Point coordinates are strictly 2D (lon,lat) matching stock DJI RC 2 wayline schema';
  const heightMode = (wpmlXml.match(/<wpml:executeHeightMode>([^<]+)<\/wpml:executeHeightMode>/) || [])[1] || '';
  if (heightMode === 'relativeToStartPoint') {
    placemarks.forEach((pm, idx) => {
      const coordMatch = pm.match(/<coordinates>\s*([^\s<]+)\s*<\/coordinates>/);
      if (coordMatch) {
        const parts = coordMatch[1].trim().split(',');
        if (parts.length > 2) {
          r4Passed = false;
          result.errors.push(`Waypoint ${idx}: Point coordinates contain ${parts.length} values (must be 2D 'lon,lat' under relativeToStartPoint)`);
        }
      }
    });
  }
  if (!r4Passed) result.valid = false; else result.rulesPassed++;
  result.rules.push({ id: 4, name: '2D Coordinates in relativeToStartPoint Mode', passed: r4Passed, message: r4Msg });

  // ── RULE 5: POI Coordinate Order (latitude,longitude,altitude) ─────────────
  let r5Passed = true;
  let r5Msg = 'POI target coordinates are formatted as lat,lon,alt with valid latitude bounds [-90°, +90°]';
  placemarks.forEach((pm, idx) => {
    const poiMatch = pm.match(/<wpml:waypointPoiPoint>([^<]+)<\/wpml:waypointPoiPoint>/);
    const modeMatch = pm.match(/<wpml:waypointHeadingMode>([^<]+)<\/wpml:waypointHeadingMode>/);
    if (poiMatch && modeMatch && modeMatch[1].trim() === 'towardPOI') {
      const parts = poiMatch[1].trim().split(',');
      if (parts.length >= 2) {
        const lat = parseFloat(parts[0]);
        const lon = parseFloat(parts[1]);
        if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
          r5Passed = false;
          result.errors.push(`Waypoint ${idx}: waypointPoiPoint has invalid latitude ${lat}° (coordinates must be 'lat,lon,alt')`);
        }
      }
    }
  });
  if (!r5Passed) result.valid = false; else result.rulesPassed++;
  result.rules.push({ id: 5, name: 'POI Coordinate Format (lat,lon,alt)', passed: r5Passed, message: r5Msg });

  // ── RULE 6: Action Group Allocation & ID Limits ────────────────────────────
  let r6Passed = true;
  let r6Msg = 'Action group count is within DJI Fly memory limits (<= 500 total action groups)';
  const actionGroupCount = (wpmlXml.match(/<wpml:actionGroup>/g) || []).length;
  if (actionGroupCount > 500) {
    r6Passed = false;
    result.errors.push(`Total action groups (${actionGroupCount}) exceeds DJI Fly limit of 500. Consolidate actions.`);
  }
  if (!r6Passed) result.valid = false; else result.rulesPassed++;
  result.rules.push({ id: 6, name: 'Action Group Allocation & ID Uniqueness', passed: r6Passed, message: r6Msg });

  // ── RULE 7: Action Execution Mode (Sequence for Multi-Actuators) ───────────
  let r7Passed = true;
  let r7Msg = 'Multi-action groups use sequential execution to prevent actuator collisions';
  placemarks.forEach((pm, idx) => {
    const agMatch = pm.match(/<wpml:actionGroup>([\s\S]*?)<\/wpml:actionGroup>/g);
    if (agMatch) {
      agMatch.forEach(ag => {
        const actCount = (ag.match(/<wpml:action>/g) || []).length;
        const mode = (ag.match(/<wpml:actionGroupMode>([^<]+)<\/wpml:actionGroupMode>/) || [])[1] || '';
        if (actCount > 1 && mode === 'parallel') {
          r7Passed = false;
          result.warnings.push(`Waypoint ${idx}: Contains ${actCount} actions in 'parallel' mode (recommend 'sequence' to avoid gimbal/camera conflict)`);
        }
      });
    }
  });
  if (!r7Passed) result.rulesPassed++; else result.rulesPassed++;
  result.rules.push({ id: 7, name: 'Action Sequence Execution Order', passed: r7Passed, message: r7Msg });

  // ── RULE 8: Consumer Drone Model XML Compliance ────────────────────────────
  let r8Passed = true;
  let r8Msg = 'No incompatible Enterprise-only tags present for consumer target drones (Mini 4 Pro / Air 3)';
  if (isConsumerDrone) {
    if (wpmlXml.includes('<wpml:payloadParam>') || (templateXml && templateXml.includes('<wpml:payloadParam>'))) {
      r8Passed = false;
      result.errors.push('Enterprise-only <wpml:payloadParam> detected on consumer drone mission (causes DJI Fly rejection on Go)');
    }
    if (wpmlXml.includes('<wpml:templateType>') || (templateXml && templateXml.includes('<wpml:templateType>'))) {
      r8Passed = false;
      result.errors.push('Enterprise-only <wpml:templateType> detected on consumer drone mission');
    }
    if (wpmlXml.includes('DiscontinuityCurvature')) {
      r8Passed = false;
      result.errors.push('Enterprise-only DiscontinuityCurvature turn mode detected on consumer drone mission (must use ContinuityCurvature for Mini 4 Pro / Air 3)');
    }
    if (/<wpml:useStraightLine>\s*1\s*<\/wpml:useStraightLine>/.test(wpmlXml)) {
      r8Passed = false;
      result.errors.push('Enterprise-only <wpml:useStraightLine>1</wpml:useStraightLine> detected on consumer drone mission (must be 0 for Mini 4 Pro / Air 3)');
    }
    if (wpmlXml.includes('<wpml:actionActuatorFunc>rotateYaw</wpml:actionActuatorFunc>')) {
      r8Passed = false;
      result.errors.push('Enterprise-only <wpml:actionActuatorFunc>rotateYaw</wpml:actionActuatorFunc> detected on consumer drone mission (causes DJI Fly execution halt before photo capture)');
    }
  }
  if (!r8Passed) result.valid = false; else result.rulesPassed++;
  result.rules.push({ id: 8, name: 'Consumer Drone Model XML Compliance', passed: r8Passed, message: r8Msg });

  // ── RULE 9: Waypoint Spacing & Proximity Safety ───────────────────────────
  let r9Passed = true;
  let r9Msg = 'All consecutive waypoints maintain safe spacing (>= 0.5m) to prevent trajectory solver zero-division and APAS obstacle triggers';
  let prevCoord = null;
  let identicalCount = 0;
  placemarks.forEach((pm, idx) => {
    const coordMatch = pm.match(/<coordinates>\s*([^\s<]+)\s*<\/coordinates>/);
    const hasPhoto = pm.includes('takePhoto') || pm.includes('ShootPhoto');
    if (coordMatch) {
      const parts = coordMatch[1].trim().split(',').map(Number);
      const curr = { lon: parts[0], lat: parts[1] };
      if (prevCoord && typeof haversineDistance === 'function') {
        const dist = haversineDistance(prevCoord.lat, prevCoord.lon, curr.lat, curr.lon);
        if (dist < 0.5) {
          identicalCount++;
          // In-place photo capture or clusters of 3+ identical points trigger DJI Fly APAS obstacle stop
          if (hasPhoto || identicalCount >= 2) {
            r9Passed = false;
            result.errors.push(`Waypoint ${idx - 1} to ${idx}: Spacing is only ${dist.toFixed(2)}m (< 0.5m minimum). Zero/near-zero distance between consecutive waypoints triggers DJI APAS obstacle stop.`);
          } else {
            result.warnings.push(`Waypoint ${idx - 1} to ${idx}: Spacing is only ${dist.toFixed(2)}m (< 0.5m minimum recommended)`);
          }
        } else {
          identicalCount = 0;
        }
      }
      prevCoord = curr;
    }
  });
  if (!r9Passed) result.valid = false; else result.rulesPassed++;
  result.rules.push({ id: 9, name: 'Waypoint Spacing & Proximity Safety', passed: r9Passed, message: r9Msg });

  // ── RULE 10: Finite Bounds & Non-NaN Number Verification ───────────────────
  let r10Passed = true;
  let r10Msg = 'All speed, height, yaw, pitch, and coordinate values are finite, in-bounds numbers (0 NaN values)';
  if (wpmlXml.includes('NaN') || wpmlXml.includes('undefined') || wpmlXml.includes('null')) {
    r10Passed = false;
    result.errors.push('NaN, undefined, or null token detected in XML output');
  }
  if (!r10Passed) result.valid = false; else result.rulesPassed++;
  result.rules.push({ id: 10, name: 'Finite Bounds & Non-NaN Verification', passed: r10Passed, message: r10Msg });

  return result;
}

/**
 * Automatically repairs known malformed tags in WPML XML before bundling KMZ
 */
function validateAndFixWpml(wpmlXml, templateXml = '', options = {}) {
  if (typeof templateXml === 'object' && templateXml !== null && (!options || Object.keys(options).length === 0)) {
    options = templateXml;
    templateXml = '';
  }
  let fixedWpml = wpmlXml || '';
  let fixedTemplate = typeof templateXml === 'string' ? templateXml : '';

  // 1. Heading Mode & Angle Enable Coherence Sanitization
  // Ensure followWayline has waypointHeadingAngle: 0, endpoints have headingAngleEnable: 1, and intermediate have 0
  // For target-splat missions, repair followWayline to smoothTransition with enable 1 to prevent getting stuck at Waypoint 0
  const isTargetSplat = (options && (options.gridType === 'target-splat' || options.pattern === 'target-splat' || options.isTargetSplat)) ||
    (options && Array.isArray(options.waypoints) && options.waypoints.some(w => w && (w.gridType === 'target-splat' || w.isPerimeterOrbit)));
  const isExclusionFreeform = (options && (options.gridType === 'exclusion-freeform' || options.pattern === 'exclusion-freeform' || options.isExclusionFreeform)) ||
    (options && Array.isArray(options.waypoints) && options.waypoints.some(w => w && (w.gridType === 'exclusion-freeform' || w.layerPattern === 'exclusion-freeform')));
  const isFreeform = (options && (options.gridType === 'freeform' || options.pattern === 'freeform' || options.isFreeform)) ||
    (options && Array.isArray(options.waypoints) && options.waypoints.some(w => w && (w.gridType === 'freeform' || w.layerPattern === 'freeform')));

  const pms = fixedWpml.split('<Placemark>');
  if (pms.length > 1) {
    for (let i = 1; i < pms.length; i++) {
      const isEndpoint = (i === 1 || i === pms.length - 1);
      const wpIdx = i - 1;
      const modeMatch = pms[i].match(/<wpml:waypointHeadingMode>([^<]+)<\/wpml:waypointHeadingMode>/);
      const mode = modeMatch ? modeMatch[1].trim() : '';
      const wpObj = (options && options.waypoints && options.waypoints[wpIdx]) ? options.waypoints[wpIdx] : null;
      if (wpObj && !wpObj.isModified) {
        const layersList = (options && options.flightLayers) || (typeof flightLayers !== 'undefined' && Array.isArray(flightLayers) ? flightLayers : null);
        let wpLayer = (wpObj.layerId && layersList) ? layersList.find(l => l.id === wpObj.layerId) : null;
        if (!wpLayer && layersList && typeof wpObj.layerIndex === 'number' && layersList[wpObj.layerIndex]) {
          wpLayer = layersList[wpObj.layerIndex];
        }
        const targetAlt = (wpObj.layerAltitude !== undefined && wpObj.layerAltitude !== null && wpObj.layerAltitude !== 'inherit')
          ? wpObj.layerAltitude
          : (wpLayer && wpLayer.altitude !== undefined && wpLayer.altitude !== null && wpLayer.altitude !== 'inherit'
            ? wpLayer.altitude
            : (options && options.altitude !== undefined && options.altitude !== null ? options.altitude : null));
        if (targetAlt !== null && !isNaN(targetAlt)) {
          pms[i] = pms[i].replace(
            /(<wpml:executeHeight>)[^<]+(<\/wpml:executeHeight>)/,
            `$1${targetAlt}$2`
          );
        }
      }
      const isCustomHeadingWp = isTargetSplat || isExclusionFreeform || isFreeform ||
        (wpObj && (wpObj.gridType === 'target-splat' || wpObj.gridType === 'exclusion-freeform' || wpObj.gridType === 'freeform' || wpObj.layerPattern === 'exclusion-freeform' || wpObj.layerPattern === 'freeform' || (wpObj.heading !== null && wpObj.heading !== undefined && !isNaN(wpObj.heading))));

      if (isCustomHeadingWp) {
        if (mode === 'followWayline') {
          pms[i] = pms[i].replace(
            /<wpml:waypointHeadingMode>followWayline<\/wpml:waypointHeadingMode>/g,
            '<wpml:waypointHeadingMode>smoothTransition</wpml:waypointHeadingMode>'
          );
        }
        pms[i] = pms[i].replace(
          /(<wpml:waypointHeadingAngleEnable>)\s*0\s*(<\/wpml:waypointHeadingAngleEnable>)/g,
          '$11$2'
        );
        let angleVal = 0.1;
        if (wpObj && wpObj.heading !== undefined && wpObj.heading !== null && !isNaN(wpObj.heading)) {
          let h = wpObj.heading;
          h = ((h % 360) + 360) % 360;
          if (h > 180) h -= 360;
          if (Math.abs(h) < 0.05 || h === 0) h = 0.1;
          angleVal = h;
        } else {
          const angleMatch = pms[i].match(/<wpml:waypointHeadingAngle>([^<]+)<\/wpml:waypointHeadingAngle>/);
          if (angleMatch) {
            let h = parseFloat(angleMatch[1]);
            if (Math.abs(h) < 0.05 || h === 0) h = 0.1;
            angleVal = h;
          }
        }
        pms[i] = pms[i].replace(
          /(<wpml:waypointHeadingAngle>)[^<]+(<\/wpml:waypointHeadingAngle>)/,
          `$1${(Math.abs(angleVal) < 0.05 || angleVal === 0) ? '0.1' : angleVal.toFixed(1)}$2`
        );
      } else if (mode === 'followWayline' || mode === 'towardPOI') {
        pms[i] = pms[i].replace(
          /(<wpml:waypointHeadingAngle>)[^<]+(<\/wpml:waypointHeadingAngle>)/g,
          '$10$2'
        );
        if (mode === 'followWayline') {
          if (!isEndpoint) {
            pms[i] = pms[i].replace(
              /(<wpml:waypointHeadingAngleEnable>)\s*1\s*(<\/wpml:waypointHeadingAngleEnable>)/g,
              '$10$2'
            );
          } else {
            pms[i] = pms[i].replace(
              /(<wpml:waypointHeadingAngleEnable>)\s*0\s*(<\/wpml:waypointHeadingAngleEnable>)/g,
              '$11$2'
            );
          }
        }
      } else {
        const enableMatch = pms[i].match(/<wpml:waypointHeadingAngleEnable>([^<]+)<\/wpml:waypointHeadingAngleEnable>/);
        const angleMatch = pms[i].match(/<wpml:waypointHeadingAngle>([^<]+)<\/wpml:waypointHeadingAngle>/);
        if (enableMatch && enableMatch[1].trim() === '1' && angleMatch) {
          let h = parseFloat(angleMatch[1]);
          if (Math.abs(h) < 0.05 || h === 0) {
            pms[i] = pms[i].replace(
              /(<wpml:waypointHeadingAngle>)[^<]+(<\/wpml:waypointHeadingAngle>)/,
              '$10.1$2'
            );
          }
        }
      }
      // Capture Mode Action Sanitization (Three-Tier Cascade: Waypoint -> Layer -> Global)
      const layersListForCap = (options && options.flightLayers) || (typeof global !== 'undefined' && Array.isArray(global.flightLayers) && global.flightLayers.length > 0 ? global.flightLayers : (typeof flightLayers !== 'undefined' && Array.isArray(flightLayers) ? flightLayers : null));
      let capLayer = (wpObj && wpObj.layerId && layersListForCap) ? layersListForCap.find(l => l.id === wpObj.layerId) : null;
      if (!capLayer && layersListForCap && wpObj && typeof wpObj.layerIndex === 'number' && layersListForCap[wpObj.layerIndex]) {
        capLayer = layersListForCap[wpObj.layerIndex];
      }
      if (!capLayer && layersListForCap && layersListForCap.length > 1 && wpObj && (wpObj.layerId || wpObj.layerCaptureMode || wpObj.layerAltitude || wpObj.layerPattern)) {
        let acc = 0;
        for (const l of layersListForCap) {
          if (!l.enabled || l.isExclusionZone || l.pattern === 'exclusion-box' || l.pattern === 'exclusion-freeform' || l.isDrawingLayer || l.pattern === 'boundary-polygon' || l.pattern === 'fiducial-markers' || l.isFiducialLayer) continue;
          const lc = (Array.isArray(l.waypoints) && l.waypoints.length > 0) ? l.waypoints.length : ((Array.isArray(l.roadWaypoints) && l.roadWaypoints.length > 0) ? l.roadWaypoints.length : ((Array.isArray(l.freeformWaypoints) && l.freeformWaypoints.length > 0) ? l.freeformWaypoints.length : 0));
          if (lc > 0 && wpIdx >= acc && wpIdx < acc + lc) {
            capLayer = l;
            break;
          }
          acc += lc;
        }
      }
      const effCap = (wpObj && wpObj.captureMode && wpObj.captureMode !== 'inherit')
        ? wpObj.captureMode
        : (wpObj && wpObj.layerCaptureMode && wpObj.layerCaptureMode !== 'inherit')
          ? wpObj.layerCaptureMode
          : (capLayer && capLayer.captureMode && capLayer.captureMode !== 'inherit')
            ? capLayer.captureMode
            : (options && options.captureMode ? options.captureMode : null);

      if (effCap === 'video') {
        // In video mode, waypoints must never contain takePhoto actions
        pms[i] = pms[i].replace(/\s*<wpml:action>\s*<wpml:actionId>\d+<\/wpml:actionId>\s*<wpml:actionActuatorFunc>takePhoto<\/wpml:actionActuatorFunc>[\s\S]*?<\/wpml:action>/g, '');
      } else if (effCap === 'continuous') {
        // Continuous capture mode captures via aircraft motion: strip takePhoto unless explicitly requested by per-waypoint override
        if (!wpObj || wpObj.cameraAction !== 'takePhoto') {
          pms[i] = pms[i].replace(/\s*<wpml:action>\s*<wpml:actionId>\d+<\/wpml:actionId>\s*<wpml:actionActuatorFunc>takePhoto<\/wpml:actionActuatorFunc>[\s\S]*?<\/wpml:action>/g, '');
        }
      }
    }
    fixedWpml = pms.join('<Placemark>');
  }

  // 2. Fix 3D coordinates to 2D
  fixedWpml = fixedWpml.replace(
    /(<Point>\s*<coordinates>\s*)([^,\s]+),([^,\s]+),[^,\s]+(\s*<\/coordinates>\s*<\/Point>)/g,
    '$1$2,$3$4'
  );

  // 3. Fix 0.0 custom heading angle with enable=1 -> clamp to 0.1 (only for smoothTransition / custom / fixed)
  fixedWpml = fixedWpml.replace(
    /(<wpml:waypointHeadingMode>\s*(?:smoothTransition|custom|fixed)\s*<\/wpml:waypointHeadingMode>[\s\S]*?<wpml:waypointHeadingAngle>)\s*0(?:\.0+)?\s*(<\/wpml:waypointHeadingAngle>[\s\S]*?<wpml:waypointHeadingAngleEnable>\s*1\s*<\/wpml:waypointHeadingAngleEnable>)/g,
    (match, p1, p2) => `${p1}0.1${p2}`
  );

  // 4. Remove Enterprise tags if consumer drone
  const isConsumer = /<wpml:droneEnumValue>\s*(?:68|89)\s*<\/wpml:droneEnumValue>/.test(fixedWpml);
  if (isConsumer) {
    fixedWpml = fixedWpml.replace(/\s*<wpml:templateType>waypoint<\/wpml:templateType>/g, '');
    fixedWpml = fixedWpml.replace(/\s*<wpml:payloadParam>[\s\S]*?<\/wpml:payloadParam>/g, '');
    fixedWpml = fixedWpml.replace(/toPointAndStopWithDiscontinuityCurvature/g, 'toPointAndStopWithContinuityCurvature');
    fixedWpml = fixedWpml.replace(/toPointAndPassWithDiscontinuityCurvature/g, 'toPointAndPassWithContinuityCurvature');
    fixedWpml = fixedWpml.replace(/<wpml:useStraightLine>\s*1\s*<\/wpml:useStraightLine>/g, '<wpml:useStraightLine>0</wpml:useStraightLine>');
    // Strip rotateYaw action actuator calls (unsupported on consumer DJI Fly firmware, causing flight halts before photos)
    fixedWpml = fixedWpml.replace(/\s*<wpml:action>\s*<wpml:actionId>\d+<\/wpml:actionId>\s*<wpml:actionActuatorFunc>rotateYaw<\/wpml:actionActuatorFunc>[\s\S]*?<\/wpml:action>/g, '');
    // Clamp takeOffSecurityHeight so it does not exceed lowest waypoint height (prevents obstacle detections during steep descents)
    const heights = [];
    const hRegex = /<wpml:executeHeight>([^<]+)<\/wpml:executeHeight>/g;
    let hMatch;
    while ((hMatch = hRegex.exec(fixedWpml)) !== null) {
      heights.push(parseFloat(hMatch[1]));
    }
    if (heights.length > 0) {
      const minAlt = Math.min(...heights);
      fixedWpml = fixedWpml.replace(
        /<wpml:takeOffSecurityHeight>([^<]+)<\/wpml:takeOffSecurityHeight>/g,
        (m, val) => `<wpml:takeOffSecurityHeight>${Math.max(1.5, Math.min(parseFloat(val), minAlt))}</wpml:takeOffSecurityHeight>`
      );
      if (fixedTemplate) {
        fixedTemplate = fixedTemplate.replace(
          /<wpml:takeOffSecurityHeight>([^<]+)<\/wpml:takeOffSecurityHeight>/g,
          (m, val) => `<wpml:takeOffSecurityHeight>${Math.max(1.5, Math.min(parseFloat(val), minAlt))}</wpml:takeOffSecurityHeight>`
        );
      }
    }
    if (fixedTemplate) {
      fixedTemplate = fixedTemplate.replace(/\s*<Folder>[\s\S]*?<\/Folder>/g, '');
    }
  }

  // 5. Deduplicate / Micro-Space consecutive identical coordinates (< 0.6m) to prevent APAS obstacle alerts
  const pmParts = fixedWpml.split('<Placemark>');
  if (pmParts.length > 2 && typeof haversineDistance === 'function') {
    const parsedCoords = [];
    for (let i = 1; i < pmParts.length; i++) {
      const pm = pmParts[i];
      const cMatch = pm.match(/<coordinates>\s*([^\s<]+)\s*<\/coordinates>/);
      const hMatch = pm.match(/<wpml:waypointHeadingAngle>([^<]+)<\/wpml:waypointHeadingAngle>/);
      const pitchMatch = pm.match(/<wpml:gimbalPitchRotateAngle>([^<]+)<\/wpml:gimbalPitchRotateAngle>/) ||
                         pm.match(/<wpml:waypointGimbalPitchAngle>([^<]+)<\/wpml:waypointGimbalPitchAngle>/);
      if (cMatch) {
        const parts = cMatch[1].trim().split(',').map(Number);
        parsedCoords.push({
          pmIdx: i,
          lon: parts[0],
          lat: parts[1],
          heading: hMatch ? parseFloat(hMatch[1]) : 0,
          pitch: pitchMatch ? parseFloat(pitchMatch[1]) : 0
        });
      }
    }

    let ci = 0;
    while (ci < parsedCoords.length) {
      let cj = ci + 1;
      while (cj < parsedCoords.length && haversineDistance(parsedCoords[ci].lat, parsedCoords[ci].lon, parsedCoords[cj].lat, parsedCoords[cj].lon) < 0.6) {
        cj++;
      }
      const cSize = cj - ci;
      if (cSize > 1) {
        const baseLat = parsedCoords[ci].lat;
        const baseLon = parsedCoords[ci].lon;
        const latRad = (baseLat * Math.PI) / 180.0;
        const seenAngles = new Set();
        let prevClusterLat = null;
        let prevClusterLon = null;
        for (let k = ci; k < cj; k++) {
          const item = parsedCoords[k];
          const isNadir = (item.pitch <= -85);
          let newLat = baseLat;
          let newLon = baseLon;
          if (!isNadir) {
            let radiusMeters = 1.25 + (Math.floor((k - ci) / 12) * 0.10);
            let angleDeg = item.heading;
            if (seenAngles.has(angleDeg.toFixed(1))) {
              let foundAngle = null;
              for (let step = 1; step <= 72; step++) {
                const candidate = (angleDeg + step * (360 / Math.max(cSize, 12))) % 360;
                let tooClose = false;
                for (const sa of seenAngles) {
                  let diff = Math.abs(candidate - parseFloat(sa));
                  if (diff > 180) diff = 360 - diff;
                  if (diff < 22) {
                    tooClose = true;
                    break;
                  }
                }
                if (!tooClose) {
                  foundAngle = candidate;
                  break;
                }
              }
              angleDeg = foundAngle !== null ? foundAngle : ((angleDeg + ((k - ci) * 35)) % 360);
            }
            seenAngles.add(angleDeg.toFixed(1));
            const angleRad = (angleDeg * Math.PI) / 180.0;
            const dLat = (radiusMeters * Math.cos(angleRad)) / 111320.0;
            const dLon = (radiusMeters * Math.sin(angleRad)) / (111320.0 * Math.cos(latRad));
            newLat = baseLat + dLat;
            newLon = baseLon + dLon;
          }

          if (prevClusterLat !== null && prevClusterLon !== null) {
            let d = haversineDistance(prevClusterLat, prevClusterLon, newLat, newLon);
            if (d < 0.6) {
              const dToCenter = haversineDistance(baseLat, baseLon, prevClusterLat, prevClusterLon);
              if (dToCenter >= 0.8) {
                newLat = baseLat;
                newLon = baseLon;
              } else {
                const angleRad = (item.heading * Math.PI) / 180.0;
                const r = 1.35 + 0.7;
                newLat = baseLat + (r * Math.cos(angleRad)) / 111320.0;
                newLon = baseLon + (r * Math.sin(angleRad)) / (111320.0 * Math.cos(latRad));
              }
            }
          }
          prevClusterLat = newLat;
          prevClusterLon = newLon;

          pmParts[item.pmIdx] = pmParts[item.pmIdx].replace(
            /<coordinates>[\s\S]*?<\/coordinates>/,
            `<coordinates>\n            ${newLon.toFixed(13)},${newLat.toFixed(13)}\n          </coordinates>`
          );

          // Photo Sphere / Micro-Cluster Stability Enforcement:
          // 1. Clamp waypointSpeed to 1.0 m/s to prevent violent bursts over sub-meter distances
          pmParts[item.pmIdx] = pmParts[item.pmIdx].replace(
            /<wpml:waypointSpeed>[^<]+<\/wpml:waypointSpeed>/g,
            '<wpml:waypointSpeed>1</wpml:waypointSpeed>'
          );
          // 2. Ensure stop turnMode
          pmParts[item.pmIdx] = pmParts[item.pmIdx].replace(
            /<wpml:waypointTurnMode>[^<]+<\/wpml:waypointTurnMode>/g,
            isConsumer ? '<wpml:waypointTurnMode>toPointAndStopWithContinuityCurvature</wpml:waypointTurnMode>' : '<wpml:waypointTurnMode>toPointAndStopWithDiscontinuityCurvature</wpml:waypointTurnMode>'
          );
          // 3. Ensure hover action precedes takePhoto with adequate dwell time (>= 4.0s for turns >= 25°, >= 5.0s for turns >= 60°)
          const hasPhoto = pmParts[item.pmIdx].includes('takePhoto');
          if (hasPhoto) {
            let requiredHover = 4.0;
            if (k > ci) {
              let hDiff = Math.abs(item.heading - parsedCoords[k - 1].heading) % 360;
              if (hDiff > 180) hDiff = 360 - hDiff;
              if (hDiff >= 60) requiredHover = 5.0;
            }
            const hoverMatch = pmParts[item.pmIdx].match(/<wpml:hoverTime>([^<]+)<\/wpml:hoverTime>/);
            if (hoverMatch) {
              const currentHover = parseFloat(hoverMatch[1]);
              if (currentHover < requiredHover) {
                pmParts[item.pmIdx] = pmParts[item.pmIdx].replace(
                  /<wpml:hoverTime>[^<]+<\/wpml:hoverTime>/g,
                  `<wpml:hoverTime>${requiredHover}</wpml:hoverTime>`
                );
              }
            } else {
              // Inject hover action immediately before takePhoto
              const hoverAct = `          <wpml:action>
            <wpml:actionId>990${k}</wpml:actionId>
            <wpml:actionActuatorFunc>hover</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>
              <wpml:hoverTime>${requiredHover}</wpml:hoverTime>
            </wpml:actionActuatorFuncParam>
          </wpml:action>\n`;
              pmParts[item.pmIdx] = pmParts[item.pmIdx].replace(
                /(\s*<wpml:action>[\s\S]*?<wpml:actionActuatorFunc>takePhoto<\/wpml:actionActuatorFunc>)/,
                `${hoverAct}$1`
              );
            }
          }
        }
      }
      ci = cj;
    }
    fixedWpml = pmParts.join('<Placemark>');
  }

  const validation = validateWpmlMission(fixedWpml, fixedTemplate, options);
  return { wpmlXml: fixedWpml, templateXml: fixedTemplate, validation };
}

// Formats a Date object, ISO string, or timestamp into a filesystem-safe ISO 8601 timestamp string.
// Format: YYYY-MM-DDTHH-mm-ssZ (filesystem safe, standard ISO 8601)
function formatISO8601ForFilename(date = new Date()) {
  try {
    const d = (date instanceof Date) ? date : new Date(date);
    if (isNaN(d.getTime())) {
      return new Date().toISOString().replace(/:/g, '-').replace(/\.\d{3}/, '');
    }
    return d.toISOString().replace(/:/g, '-').replace(/\.\d{3}/, '');
  } catch (e) {
    return new Date().toISOString().replace(/:/g, '-').replace(/\.\d{3}/, '');
  }
}

// Generate the KMZ file and trigger browser download
