let fpvActive = false;
let fpvPlaying = false;
let fpvProgressIndex = 0;
let fpvNudgeStepIndex = 1;
let fpvSubInterpolation = 0.0;
let fpvSpeed = 1.0;
let fpvOriginalCamPos = null;
let fpvOriginalCamTarget = null;
let fpvPhotoFlashActive = false;
let fpvPhotoDelayTimer = null;
let fpvRecordTimer = null;
let fpvRecordSeconds = 0;
let lastFpvRedrawTime = 0;
let lastFpvHeading = null;
let lastFpvPitch = null;
let lastFpvX = null;
let lastFpvZ = null;
let fpvActiveDroneMesh = null;
let fpvCameraMode = (function() {
  try {
    return localStorage.getItem('aalaapi_fpv_camera_mode') || 'follow';
  } catch (e) {
    return 'follow';
  }
})();

function setFPVCameraMode(mode) {
  if (mode !== 'follow' && mode !== 'cockpit') mode = 'follow';
  fpvCameraMode = mode;
  try {
    localStorage.setItem('aalaapi_fpv_camera_mode', mode);
  } catch (e) {}

  const btnText = document.getElementById('fpv-cam-mode-text');
  const btnIcon = document.getElementById('fpv-cam-mode-icon');
  const camBtn = document.getElementById('fpv-btn-cam-mode');
  const reticle = document.getElementById('fpv-center-reticle');

  if (mode === 'follow') {
    if (btnText) btnText.textContent = 'Movie';
    if (btnIcon) btnIcon.textContent = '🎬';
    if (camBtn) camBtn.title = 'Current: Movie View (Follow Cam). Click to switch to Cockpit FPV (Hot key: C)';
    if (reticle) reticle.style.display = 'none';
    if (fpvActiveDroneMesh) fpvActiveDroneMesh.visible = (fpvActive === true);
  } else {
    if (btnText) btnText.textContent = 'Cockpit';
    if (btnIcon) btnIcon.textContent = '🎥';
    if (camBtn) camBtn.title = 'Current: Cockpit FPV. Click to switch to Movie Follow Cam (Hot key: C)';
    if (reticle) reticle.style.display = 'flex';
    if (fpvActiveDroneMesh) fpvActiveDroneMesh.visible = false;
  }

  if (fpvActive && typeof updateFPVCamera === 'function') {
    updateFPVCamera(0);
  }
}

function getEffectiveWaypointSpeed(wp) {
  if (wp && wp.speed !== undefined && wp.speed !== null && !isNaN(wp.speed)) {
    return parseFloat(wp.speed);
  }
  const wpLayer = (wp && wp.layerId && typeof flightLayers !== 'undefined')
    ? flightLayers.find(l => l.id === wp.layerId)
    : ((typeof getActiveLayer === 'function') ? getActiveLayer() : null);
  if (wpLayer && wpLayer.speed !== undefined && wpLayer.speed !== null && !isNaN(wpLayer.speed)) {
    return parseFloat(wpLayer.speed);
  }
  const globalSpeedEl = document.getElementById('speed');
  return globalSpeedEl ? (parseFloat(globalSpeedEl.value) || 5) : 5;
}

function getEffectiveWaypointHoverTime(wp) {
  if (wp && wp.hoverTime !== undefined && wp.hoverTime !== null && !isNaN(wp.hoverTime)) {
    return parseFloat(wp.hoverTime);
  }
  const wpLayer = (wp && wp.layerId && typeof flightLayers !== 'undefined')
    ? flightLayers.find(l => l.id === wp.layerId)
    : ((typeof getActiveLayer === 'function') ? getActiveLayer() : null);
  if (wpLayer && wpLayer.hoverTime !== undefined && wpLayer.hoverTime !== null && !isNaN(wpLayer.hoverTime)) {
    return parseFloat(wpLayer.hoverTime);
  }
  const globalHoverEl = document.getElementById('global-hover-time');
  return globalHoverEl ? (parseFloat(globalHoverEl.value) || 0) : 0;
}

function getEffectiveWaypointCameraAction(wp) {
  if (wp && wp.cameraAction && wp.cameraAction !== 'inherit') {
    return wp.cameraAction;
  }
  const wpLayer = (wp && wp.layerId && typeof flightLayers !== 'undefined')
    ? flightLayers.find(l => l.id === wp.layerId)
    : ((typeof getActiveLayer === 'function') ? getActiveLayer() : null);
  if (wpLayer && wpLayer.captureMode && wpLayer.captureMode !== 'inherit') {
    return wpLayer.captureMode;
  }
  const globalCaptureEl = document.getElementById('capture-mode');
  return globalCaptureEl ? (globalCaptureEl.value || 'stopAndShoot') : 'stopAndShoot';
}


// Draw photogrammetry coverage heatmap on the ground plane canvas
function drawCoverageHeatmap(ctx, planeOffsetX, planeOffsetZ, planeSize) {
  if (fpvActive || !showFootprints) return;
  const waypoints = getCurrentWaypoints();
  if (!waypoints || waypoints.length === 0) return;

  const rotationDeg = parseFloat(document.getElementById('grid-rotation')?.value) || 0;
  const defaultGimbalPitch = parseGimbalPitch(document.getElementById('gimbal-pitch')?.value, -60);

  waypoints.forEach((wp, idx) => {
    const alt = wp.alt; // in meters
    const pitch = (wp.pitch !== undefined && wp.pitch !== null && !isNaN(wp.pitch)) ? wp.pitch : defaultGimbalPitch;
    
    let heading = 0;
    if (wp.heading !== null && wp.heading !== undefined) {
      heading = wp.heading;
    } else {
      heading = getDefaultHeading(idx, waypoints, rotationDeg);
    }
    
    const pitchRad = pitch * Math.PI / 180;
    const headingRad = heading * Math.PI / 180;
    
    const xDrone = wp.x;
    const zDrone = -wp.y;
    
    let d = 0;
    if (pitch > -90) {
      d = alt * Math.tan((90 + pitch) * Math.PI / 180);
    }
    
    const xGround = xDrone + d * Math.sin(headingRad);
    const zGround = zDrone - d * Math.cos(headingRad);
    
    const pixelX = ((xGround - planeOffsetX) / planeSize + 0.5) * 768;
    const pixelY = ((zGround - planeOffsetZ) / planeSize + 0.5) * 768;
    
    const radiusAcross = alt * Math.tan((CAMERA_HFOV / 2.0) * Math.PI / 180.0);
    const sinAbsPitch = Math.max(0.1, Math.sin(Math.abs(pitchRad)));
    const radiusAlong = alt * Math.tan((CAMERA_VFOV / 2.0) * Math.PI / 180.0) / sinAbsPitch;
    
    const pixelRadiusAcross = (radiusAcross / planeSize) * 768;
    const pixelRadiusAlong = (radiusAlong / planeSize) * 768;
    
    ctx.save();
    ctx.translate(pixelX, pixelY);
    ctx.rotate(headingRad);
    ctx.beginPath();
    ctx.ellipse(0, 0, pixelRadiusAcross, pixelRadiusAlong, 0, 0, 2 * Math.PI);
    
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(pixelRadiusAcross, pixelRadiusAlong));
    grad.addColorStop(0, "rgba(34, 197, 94, 0.45)");
    grad.addColorStop(0.5, "rgba(34, 197, 94, 0.25)");
    grad.addColorStop(1, "rgba(34, 197, 94, 0.0)");
    
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();
  });
}

// Check if a waypoint requires repositioning of gimbal or drone heading
function checkNeedsReposition(idx, waypoints) {
  if (!waypoints || waypoints.length === 0 || idx === null || idx === undefined || idx < 0 || idx >= waypoints.length) {
    return { needsReposition: false, isGimbalChanged: false, isHeadingChanged: false, headingDiff: 0 };
  }
  const current = getWaypointHeadingAndPitch(idx, waypoints);
  
  let isGimbalChanged = false;
  let isHeadingChanged = false;
  let headingDiff = 0;
  
  if (idx === 0) {
    // Takeoff: gimbal defaults to 0. Any target pitch less than -5 is a change.
    isGimbalChanged = current.pitch < -5;
    isHeadingChanged = false;
    headingDiff = 0;
  } else {
    const prev = getWaypointHeadingAndPitch(idx - 1, waypoints);
    isGimbalChanged = Math.abs(current.pitch - prev.pitch) >= 5;
    
    headingDiff = Math.abs(current.heading - prev.heading) % 360;
    if (headingDiff > 180) headingDiff = 360 - headingDiff;
    isHeadingChanged = headingDiff >= 10;
  }
  
  return {
    needsReposition: isGimbalChanged || isHeadingChanged,
    isGimbalChanged,
    isHeadingChanged,
    headingDiff
  };
}

// Calculate the heading and pitch for a waypoint index
function getWaypointHeadingAndPitch(idx, waypoints) {
  const wps = Array.isArray(waypoints) ? waypoints : [];
  const wp = (wps && wps[idx]) ? wps[idx] : {};
  const wpLayer = (wp.layerId && typeof flightLayers !== 'undefined')
    ? flightLayers.find(l => l.id === wp.layerId)
    : ((typeof getActiveLayer === 'function') ? getActiveLayer() : null);
  const rotationDeg = (typeof document !== 'undefined' && document && document.getElementById && document.getElementById('grid-rotation'))
    ? parseFloat(document.getElementById('grid-rotation').value) || 0
    : 0;
  const heading = getEffectiveWaypointHeading(wp, idx, wps, rotationDeg, null, wpLayer);

  const defaultGimbalPitch = (wpLayer && wpLayer.gimbalPitch !== undefined)
    ? wpLayer.gimbalPitch
    : ((typeof document !== 'undefined' && document && document.getElementById && document.getElementById('gimbal-pitch'))
      ? document.getElementById('gimbal-pitch').value
      : -60);

  const rawPitch = (wp.pitch !== undefined && wp.pitch !== null) ? wp.pitch : defaultGimbalPitch;
  let pitch;
  if (rawPitch === 'auto' || (typeof rawPitch === 'string' && rawPitch.toLowerCase() === 'auto')) {
    const targetPoi = (typeof getTargetPoiCoordinates === 'function') ? getTargetPoiCoordinates(wp, wpLayer) : null;
    pitch = (typeof calculate3DPoiPitch === 'function')
      ? calculate3DPoiPitch(wp, targetPoi, wp.alt || (wpLayer?.altitude) || 50)
      : -45;
  } else {
    pitch = parseGimbalPitch(rawPitch, -60);
  }

  return { heading, pitch };
}

let showDroneModels = true;

// Create a procedural 3D Quadcopter Drone mesh for waypoint visualization
function create3DDroneMesh(colorHex, scale = 1.0) {
  const droneGroup = new THREE.Group();

  const bodyMat = new THREE.MeshPhongMaterial({
    color: 0x1e293b,
    shininess: 80
  });
  const accentMat = new THREE.MeshPhongMaterial({
    color: colorHex,
    shininess: 90
  });
  const armMat = new THREE.MeshPhongMaterial({
    color: 0x475569,
    shininess: 50
  });
  const rotorMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.65,
    side: THREE.DoubleSide
  });
  const lensMat = new THREE.MeshPhongMaterial({
    color: 0x0f172a,
    shininess: 100
  });

  // 1. Central Fuselage Body
  const bodyGeom = new THREE.BoxGeometry(1.2 * scale, 0.4 * scale, 1.6 * scale);
  const bodyMesh = new THREE.Mesh(bodyGeom, bodyMat);
  droneGroup.add(bodyMesh);

  // Top Accent Shell
  const shellGeom = new THREE.BoxGeometry(0.9 * scale, 0.25 * scale, 1.2 * scale);
  const shellMesh = new THREE.Mesh(shellGeom, accentMat);
  shellMesh.position.y = 0.25 * scale;
  droneGroup.add(shellMesh);

  // Top Status LED Light
  const ledGeom = new THREE.SphereGeometry(0.15 * scale, 8, 8);
  const ledMesh = new THREE.Mesh(ledGeom, accentMat);
  ledMesh.position.set(0, 0.35 * scale, -0.5 * scale);
  droneGroup.add(ledMesh);

  // 2. Camera Gimbal Payload (Front - Negative Z)
  const gimbalGroup = new THREE.Group();
  gimbalGroup.position.set(0, -0.1 * scale, -0.8 * scale);
  
  const gimbalGeom = new THREE.SphereGeometry(0.3 * scale, 12, 12);
  const gimbalMesh = new THREE.Mesh(gimbalGeom, bodyMat);
  gimbalGroup.add(gimbalMesh);

  const lensGeom = new THREE.CylinderGeometry(0.18 * scale, 0.18 * scale, 0.2 * scale, 12);
  const lensMesh = new THREE.Mesh(lensGeom, lensMat);
  lensMesh.rotation.x = Math.PI / 2;
  lensMesh.position.z = -0.15 * scale;
  gimbalGroup.add(lensMesh);

  droneGroup.add(gimbalGroup);
  droneGroup.userData.gimbalGroup = gimbalGroup;

  // 3. Four Quadcopter Rotor Arms & Propeller Discs
  const armPositions = [
    { x: 1.1 * scale, z: -1.1 * scale }, // Front Right
    { x: -1.1 * scale, z: -1.1 * scale }, // Front Left
    { x: 1.1 * scale, z: 1.1 * scale },  // Rear Right
    { x: -1.1 * scale, z: 1.1 * scale }   // Rear Left
  ];

  armPositions.forEach((pos, idx) => {
    // Carbon Arm Shaft
    const dx = pos.x;
    const dz = pos.z;
    const armLen = Math.sqrt(dx * dx + dz * dz);
    const armGeom = new THREE.CylinderGeometry(0.08 * scale, 0.08 * scale, armLen, 8);
    const armMesh = new THREE.Mesh(armGeom, armMat);

    armMesh.position.set(dx / 2, 0, dz / 2);
    armMesh.rotation.z = Math.PI / 2;
    armMesh.rotation.y = -Math.atan2(dz, dx);
    droneGroup.add(armMesh);

    // Motor Pod
    const motorGeom = new THREE.CylinderGeometry(0.2 * scale, 0.2 * scale, 0.3 * scale, 12);
    const motorMat = idx < 2 ? accentMat : armMat; // Highlight front motors
    const motorMesh = new THREE.Mesh(motorGeom, motorMat);
    motorMesh.position.set(pos.x, 0.1 * scale, pos.z);
    droneGroup.add(motorMesh);

    // Rotor Propeller Blur Disc
    const propGeom = new THREE.CylinderGeometry(0.8 * scale, 0.8 * scale, 0.02 * scale, 16);
    const propMesh = new THREE.Mesh(propGeom, rotorMat);
    propMesh.position.set(pos.x, 0.28 * scale, pos.z);
    droneGroup.add(propMesh);
  });

  return droneGroup;
}

// Recreate waypoints, lines, and cones inside the active Three.js scene
function recreate3DWaypointsAndPaths() {
  if (!threeScene) return;

  // Clear existing groups from scene
  if (waypointsGroup) threeScene.remove(waypointsGroup);
  if (pathsGroup) threeScene.remove(pathsGroup);
  if (groundLinesGroup) threeScene.remove(groundLinesGroup);
  if (conesGroup) threeScene.remove(conesGroup);

  const waypoints = getCurrentWaypoints();
  if (!waypoints || waypoints.length === 0) return;

  coneGroups = [];
  const rotationDeg = parseFloat(document.getElementById('grid-rotation')?.value) || 0;
  const defaultGimbalPitch = parseGimbalPitch(document.getElementById('gimbal-pitch')?.value, -60);

  waypointsGroup = new THREE.Group();
  pathsGroup = new THREE.Group();
  groundLinesGroup = new THREE.Group();
  conesGroup = new THREE.Group();

  const materialCache = {};

  waypoints.forEach((wp, idx) => {
    const x3d = wp.x;
    const y3d = wp.alt;
    const z3d = -wp.y;

    const isStart = idx === 0;
    const isEnd = idx === waypoints.length - 1;

    // Plot Waypoint Sphere
    let r = 1.8;
    let colorHex = 0x06b6d4; // Default cyan

    if (isStart) {
      r = 3.0;
      colorHex = 0x10b981; // Green for start
    } else if (isEnd) {
      r = 3.0;
      colorHex = 0xef4444; // Red
    } else if (wp.isModified) {
      colorHex = 0xec4899; // Pink
    } else {
      const ring = wp.ringIndex;
      if (ring === 0) colorHex = 0xa855f7; // purple
      else if (ring === 1) colorHex = 0x06b6d4; // cyan
      else if (ring === 2) colorHex = 0xf59e0b; // orange
      else if (ring === 3) colorHex = 0x3b82f6; // blue
    }

    // Waypoint target sphere marker
    const sphereGeom = new THREE.SphereGeometry(r, 12, 12);
    let sphereMat = materialCache[colorHex];
    if (!sphereMat) {
      sphereMat = new THREE.MeshBasicMaterial({ color: colorHex, wireframe: false });
      materialCache[colorHex] = sphereMat;
    }
    const sphereMesh = new THREE.Mesh(sphereGeom, sphereMat);
    sphereMesh.position.set(x3d, y3d, z3d);
    sphereMesh.userData = { isWaypointSphere: true };
    sphereMesh.visible = (!showDroneModels || fpvActive);
    waypointsGroup.add(sphereMesh);

    if (showDroneModels) {
      const hp = getWaypointHeadingAndPitch(idx, waypoints);
      const droneScale = (isStart || isEnd) ? 0.55 : 0.4;
      const droneMesh = create3DDroneMesh(colorHex, droneScale);
      droneMesh.position.set(x3d, y3d, z3d);
      droneMesh.userData.isWaypointDrone = true;
      droneMesh.visible = !fpvActive;

      // Rotate drone body to face flight heading
      const headingRad = (hp.heading || 0) * Math.PI / 180.0;
      droneMesh.rotation.y = -headingRad;

      // Tilt camera gimbal inside drone group to pitch angle
      const pitchRad = ((hp.pitch !== undefined && hp.pitch !== null && !isNaN(hp.pitch)) ? hp.pitch : -60) * Math.PI / 180.0;
      if (droneMesh.userData && droneMesh.userData.gimbalGroup) {
        droneMesh.userData.gimbalGroup.rotation.x = -pitchRad;
      }

      waypointsGroup.add(droneMesh);
    }

    // Plot Ground Line Projection
    const groundLinePoints = [
      new THREE.Vector3(x3d, y3d, z3d),
      new THREE.Vector3(x3d, 0, z3d)
    ];
    const groundLineGeom = new THREE.BufferGeometry().setFromPoints(groundLinePoints);
    const groundLineMat = new THREE.LineDashedMaterial({
      color: 0x475569,
      dashSize: 3,
      gapSize: 2
    });
    const groundLine = new THREE.Line(groundLineGeom, groundLineMat);
    groundLine.computeLineDistances();
    groundLinesGroup.add(groundLine);

    // Plot Flight Path Line between wp and nextWp
    if (idx < waypoints.length - 1) {
      const nextWp = waypoints[idx + 1];
      const nX = nextWp.x;
      const nY = nextWp.alt;
      const nZ = -nextWp.y;

      const startVec = new THREE.Vector3(x3d, y3d, z3d);
      const endVec = new THREE.Vector3(nX, nY, nZ);

      const pathPoints = [startVec, endVec];
      const segGeom = new THREE.BufferGeometry().setFromPoints(pathPoints);
      const d = Math.sqrt(Math.pow(nextWp.x - wp.x, 2) + Math.pow(nextWp.y - wp.y, 2));
      let segColor = 0x06b6d4;
      let isWarning = d > 100.0;

      if (isWarning) {
        segColor = 0xef4444; // Warning Red
      } else {
        const nextRing = nextWp.ringIndex;
        if (nextRing === 0) segColor = 0xa855f7;
        else if (nextRing === 1) segColor = 0x06b6d4;
        else if (nextRing === 2) segColor = 0xf59e0b;
        else if (nextRing === 3) segColor = 0x3b82f6;
      }

      let segLine;
      if (isWarning) {
        const segMat = new THREE.LineDashedMaterial({
          color: segColor,
          dashSize: 4,
          gapSize: 2
        });
        segLine = new THREE.Line(segGeom, segMat);
        segLine.computeLineDistances();
      } else {
        const segMat = new THREE.LineBasicMaterial({
          color: segColor,
          linewidth: 2
        });
        segLine = new THREE.Line(segGeom, segMat);
      }
      pathsGroup.add(segLine);

      // Add Directional Arrow Cone
      const direction = new THREE.Vector3().subVectors(endVec, startVec);
      const segLen3d = direction.length();
      if (segLen3d > 4.0) {
        direction.normalize();
        const midpoint = new THREE.Vector3().addVectors(startVec, endVec).multiplyScalar(0.5);
        const arrowConeGeom = new THREE.ConeGeometry(0.8, 2.5, 8);
        const arrowConeMat = new THREE.MeshBasicMaterial({ color: segColor, depthTest: true });
        const arrowConeMesh = new THREE.Mesh(arrowConeGeom, arrowConeMat);
        arrowConeMesh.position.copy(midpoint);
        const upVector = new THREE.Vector3(0, 1, 0);
        arrowConeMesh.quaternion.setFromUnitVectors(upVector, direction);
        pathsGroup.add(arrowConeMesh);
      }
    }

    // Plot Camera FOV Cone
    const { heading, pitch } = getWaypointHeadingAndPitch(idx, waypoints);

    const localConeGroup = new THREE.Group();
    localConeGroup.position.set(x3d, y3d, z3d);
    localConeGroup.rotation.y = -heading * Math.PI / 180; // Compass rotation clockwise

    const coneHeight = 8;
    const coneGeom = createCameraPyramidGeometry(CAMERA_HFOV, CAMERA_VFOV, coneHeight);

    let coneColorHex = colorHex;
    if (!wp.isModified && wp.ringIndex === null) {
      coneColorHex = 0x06b6d4;
    }

    const coneMat = new THREE.MeshBasicMaterial({
      color: coneColorHex,
      wireframe: false,
      transparent: true,
      opacity: 0.15,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const coneMesh = new THREE.Mesh(coneGeom, coneMat);
    coneMesh.rotation.x = ((90 + pitch) * Math.PI) / 180; // Correctly align default downward geometry to gimbal pitch

    // Add wireframe outlines
    const wireGeom = new THREE.EdgesGeometry(coneGeom);
    const wireMat = new THREE.LineBasicMaterial({
      color: coneColorHex,
      transparent: true,
      opacity: 0.55
    });
    const wireframe = new THREE.LineSegments(wireGeom, wireMat);
    coneMesh.add(wireframe);

    // Optical Axis Center Ray
    const axisPoints = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, -coneHeight, 0)
    ];
    const axisGeom = new THREE.BufferGeometry().setFromPoints(axisPoints);
    const axisMat = new THREE.LineBasicMaterial({
      color: coneColorHex,
      transparent: true,
      opacity: 0.4
    });
    const axisLine = new THREE.Line(axisGeom, axisMat);
    coneMesh.add(axisLine);

    localConeGroup.add(coneMesh);
    conesGroup.add(localConeGroup);
    coneGroups.push(localConeGroup);
  });

  // Plot 3D Points of Interest (Target Poles with glowing Beacon Spheres)
  if (typeof pois !== 'undefined' && Array.isArray(pois)) {
    pois.forEach((poi, pIdx) => {
      if (!poi) return;
      let px = poi.x;
      let py = poi.y;
      if ((px === undefined || py === undefined) && typeof centerMarker !== 'undefined' && centerMarker) {
        const cPos = (typeof getMissionOrigin === 'function') ? getMissionOrigin() : { lat: centerMarker.getLatLng().lat, lon: centerMarker.getLatLng().lng };
        if (poi.lat !== undefined && poi.lon !== undefined && cPos.lat !== undefined && cPos.lon !== undefined) {
          px = (poi.lon - cPos.lon) * (111320 * Math.cos(cPos.lat * Math.PI / 180));
          py = (poi.lat - cPos.lat) * 111320;
        }
      }
      if (px !== undefined && py !== undefined) {
        const pAlt = (poi.alt !== undefined && !isNaN(poi.alt)) ? Number(poi.alt) : 0;
        const pz = -py;
        const beaconColor = pIdx === 0 ? 0x06b6d4 : 0xf43f5e;

        // Ground Target Base Ring
        const baseGeom = new THREE.RingGeometry(1.0, 1.8, 16);
        const baseMat = new THREE.MeshBasicMaterial({ color: beaconColor, side: THREE.DoubleSide });
        const baseMesh = new THREE.Mesh(baseGeom, baseMat);
        baseMesh.rotation.x = Math.PI / 2;
        baseMesh.position.set(px, 0.05, pz);
        waypointsGroup.add(baseMesh);

        // Vertical Target Pole from 0 up to pAlt
        if (pAlt > 0) {
          const stemGeom = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(px, 0, pz),
            new THREE.Vector3(px, pAlt, pz)
          ]);
          const stemMat = new THREE.LineDashedMaterial({ color: beaconColor, dashSize: 2, gapSize: 1 });
          const stemLine = new THREE.Line(stemGeom, stemMat);
          stemLine.computeLineDistances();
          waypointsGroup.add(stemLine);
        }

        // Beacon Sphere at target height
        const beaconGeom = new THREE.SphereGeometry(2.0, 16, 16);
        const beaconMat = new THREE.MeshBasicMaterial({ color: beaconColor, wireframe: false });
        const beaconMesh = new THREE.Mesh(beaconGeom, beaconMat);
        beaconMesh.position.set(px, pAlt, pz);
        waypointsGroup.add(beaconMesh);
      }
    });
  }

  // Plot Hyperlapse Frame Marker Spheres (v1.146.0)
  const activeLayerFor3D = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
  if (activeLayerFor3D && activeLayerFor3D.pattern === 'hyperlapse' && Array.isArray(activeLayerFor3D.photos) && activeLayerFor3D.photos.length > 0) {
    const frameMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, wireframe: false });
    const frameGeom = new THREE.SphereGeometry(0.8, 8, 8);
    const maxFrames = 2000;
    const step = Math.max(1, Math.ceil(activeLayerFor3D.photos.length / maxFrames));
    for (let fIdx = 0; fIdx < activeLayerFor3D.photos.length; fIdx += step) {
      const fPt = activeLayerFor3D.photos[fIdx];
      if (!fPt) continue;
      const fMesh = new THREE.Mesh(frameGeom, frameMat);
      fMesh.position.set(fPt.x, fPt.alt || 50, -fPt.y);
      waypointsGroup.add(fMesh);
    }
  }

  threeScene.add(waypointsGroup);
  threeScene.add(pathsGroup);
  threeScene.add(groundLinesGroup);

  conesGroup.visible = fpvActive ? false : showCones;
  threeScene.add(conesGroup);
}

// Draws the dynamic photogrammetry coverage footprint for the active FPV camera
function drawActiveFPVFootprint(ctx, heading, pitch) {
  if (!fpvActive || !showFootprints || !threeCamera) return;
  if (!groundPlaneSize || groundPlaneSize <= 0) return;

  const alt = threeCamera.position.y;
  const headingRad = (heading * Math.PI) / 180;

  const xDrone = threeCamera.position.x;
  const zDrone = threeCamera.position.z;

  let d = 0;
  if (pitch > -90) {
    d = alt * Math.tan((90 + pitch) * Math.PI / 180);
  }

  // Centroid of projection on ground (heading 0 = North = -Z in Three.js)
  const px = xDrone + d * Math.sin(headingRad);
  const pz = zDrone - d * Math.cos(headingRad);

  // Slant range to center of footprint
  const cosAngle = Math.cos((90 + pitch) * Math.PI / 180);
  const slantRange = cosAngle > 0.05 ? alt / cosAngle : alt;

  const alphaAcross = (CAMERA_HFOV / 2) * Math.PI / 180;
  const alphaAlong = (CAMERA_VFOV / 2) * Math.PI / 180;

  const radiusAcross = slantRange * Math.tan(alphaAcross);
  const radiusAlong = slantRange * Math.tan(alphaAlong) / (cosAngle > 0.05 ? cosAngle : 1.0);

  // Map to canvas pixel space (matching drawCoverageHeatmap UV offset)
  const pixelX = ((px - groundPlaneOffsetX) / groundPlaneSize + 0.5) * 768;
  const pixelY = ((pz - groundPlaneOffsetZ) / groundPlaneSize + 0.5) * 768;

  const pixelRadiusAcross = (radiusAcross / groundPlaneSize) * 768;
  const pixelRadiusAlong = (radiusAlong / groundPlaneSize) * 768;

  ctx.save();
  ctx.translate(pixelX, pixelY);
  ctx.rotate(headingRad);
  ctx.beginPath();
  ctx.ellipse(0, 0, pixelRadiusAcross, pixelRadiusAlong, 0, 0, 2 * Math.PI);

  // Create focal point radial gradient: brightest at center (optical axis intersection)
  const maxRadius = Math.max(pixelRadiusAcross, pixelRadiusAlong);
  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, maxRadius);
  grad.addColorStop(0, "rgba(34, 197, 94, 0.55)");   // Bright green center
  grad.addColorStop(0.3, "rgba(34, 197, 94, 0.25)"); // Soft green
  grad.addColorStop(1, "rgba(34, 197, 94, 0.0)");     // Fades to transparent

  ctx.fillStyle = grad;
  ctx.fill();
  ctx.restore();
}

// Redraws the 2D ground plane canvas and flags the Three.js texture for updates
function redrawGroundPlane(heading, pitch) {
  if (!threeGroundCanvas || !threeGroundCtx || !threeGroundTexture) return;

  const ctx = threeGroundCtx;
  ctx.fillStyle = "#070a13";
  ctx.fillRect(0, 0, 768, 768);

  cachedTileImages.forEach(t => {
    try {
      ctx.drawImage(t.img, t.dx * 256, t.dy * 256, 256, 256);
    } catch(e) {}
    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
    ctx.lineWidth = 1;
    ctx.strokeRect(t.dx * 256, t.dy * 256, 256, 256);
  });

  // Draw the grid lines
  ctx.strokeStyle = "rgba(6, 182, 212, 0.15)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 12; i++) {
    const coord = i * 64;
    ctx.beginPath(); ctx.moveTo(coord, 0); ctx.lineTo(coord, 768); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, coord); ctx.lineTo(768, coord); ctx.stroke();
  }

  // Draw heatmap ONLY if FPV is not active and showFootprints is true
  if (!fpvActive && showFootprints) {
    drawCoverageHeatmap(ctx, groundPlaneOffsetX, groundPlaneOffsetZ, groundPlaneSize);
  } else if (fpvActive && showFootprints) {
    drawActiveFPVFootprint(ctx, heading, pitch);
  }

  threeGroundTexture.needsUpdate = true;
}

// Initialize 3D Preview Scene
