function generateGridCoordinates(width, height, rotation, gridType, captureMode, sLine, sPhoto, turnaroundOvershoot = 0) {
  const waypoints = [];
  const photos = [];
  const overshoot = (typeof turnaroundOvershoot === 'number' && turnaroundOvershoot > 0) ? turnaroundOvershoot : 0;

  // Pass 1: North-South primary grid flight lines
  const nLines = Math.max(2, Math.round(width / sLine) + 1);
  const nPhotos = Math.max(2, Math.round(height / sPhoto) + 1);
  
  const dxLine = nLines > 1 ? width / (nLines - 1) : 0;
  const dyPhoto = nPhotos > 1 ? height / (nPhotos - 1) : 0;

  for (let i = 0; i < nLines; i++) {
    const x = -width / 2.0 + i * dxLine;
    const startFromSouth = (i % 2 === 0);
    const lineHeading = startFromSouth ? 0 : 180;
    const linePoints = [];

    // If turnaround overshoot is specified, add entry overshoot waypoint before the survey line
    if (overshoot > 0) {
      const entryY = startFromSouth ? (-height / 2.0 - overshoot) : (height / 2.0 + overshoot);
      waypoints.push({ x: x, y: entryY, heading: lineHeading, isTurnaroundPoint: true, skipPhoto: true });
    }

    for (let j = 0; j < nPhotos; j++) {
      const yIdx = startFromSouth ? j : (nPhotos - 1 - j);
      const y = -height / 2.0 + yIdx * dyPhoto;
      linePoints.push({ x: x, y: y, heading: lineHeading });
      
      // Save photo representation
      photos.push({ x: x, y: y, heading: lineHeading });
    }

    if (captureMode === 'continuous' || captureMode === 'video') {
      // In continuous/video mode, waypoints are only at the start and end of each flight line
      waypoints.push(linePoints[0]);
      waypoints.push(linePoints[linePoints.length - 1]);
    } else {
      // In stop & shoot mode, every photo trigger is a waypoint
      linePoints.forEach(pt => waypoints.push(pt));
    }

    // If turnaround overshoot is specified, add exit overshoot waypoint after the survey line
    if (overshoot > 0) {
      const exitY = startFromSouth ? (height / 2.0 + overshoot) : (-height / 2.0 - overshoot);
      waypoints.push({ x: x, y: exitY, heading: lineHeading, isTurnaroundPoint: true, skipPhoto: true });
    }
  }

  // Pass 2: Perpendicular grid lines (if Double Grid)
  if (gridType === 'double') {
    const nLines2 = Math.max(2, Math.round(height / sLine) + 1);
    const nPhotos2 = Math.max(2, Math.round(width / sPhoto) + 1);

    const dyLine2 = nLines2 > 1 ? height / (nLines2 - 1) : 0;
    const dxPhoto2 = nPhotos2 > 1 ? width / (nPhotos2 - 1) : 0;

    // Check where Pass 1 ended to connect Pass 2 seamlessly without deadhead transit across the field
    // Pass 1 lines end at x = +width/2.
    // If (nLines - 1) is even (0, 2, 4...), Pass 1 ended at North (y = +height/2).
    // If (nLines - 1) is odd (1, 3, 5...), Pass 1 ended at South (y = -height/2).
    const pass1EndsAtNorth = ((nLines - 1) % 2 === 0);

    for (let i = 0; i < nLines2; i++) {
      const y = pass1EndsAtNorth
        ? (height / 2.0 - i * dyLine2)
        : (-height / 2.0 + i * dyLine2);

      // Line 0 starts at East (x = +width/2) to connect directly to Pass 1 end.
      // Even lines (0, 2, 4...) start from East and fly West (heading 270°).
      // Odd lines (1, 3, 5...) start from West and fly East (heading 90°).
      const startFromWest = (i % 2 === 1);
      const lineHeading2 = startFromWest ? 90 : 270;
      const linePoints = [];

      // If turnaround overshoot is specified, add entry overshoot waypoint before Pass 2 survey line
      if (overshoot > 0) {
        const entryX = startFromWest ? (-width / 2.0 - overshoot) : (width / 2.0 + overshoot);
        waypoints.push({ x: entryX, y: y, heading: lineHeading2, isTurnaroundPoint: true, skipPhoto: true });
      }

      for (let j = 0; j < nPhotos2; j++) {
        // Skip duplicate coordinate at the exact Pass 1 -> Pass 2 junction point (only if no overshoot separating them)
        if (i === 0 && j === 0 && overshoot === 0) {
          continue;
        }
        const xIdx = startFromWest ? j : (nPhotos2 - 1 - j);
        const x = -width / 2.0 + xIdx * dxPhoto2;
        linePoints.push({ x: x, y: y, heading: lineHeading2 });

        // Save photo representation
        photos.push({ x: x, y: y, heading: lineHeading2 });
      }

      if (linePoints.length > 0) {
        if (captureMode === 'continuous' || captureMode === 'video') {
          // Continuous/video flight waypoints
          waypoints.push(linePoints[0]);
          waypoints.push(linePoints[linePoints.length - 1]);
        } else {
          // Stop & Shoot waypoints
          linePoints.forEach(pt => waypoints.push(pt));
        }
      }

      // If turnaround overshoot is specified, add exit overshoot waypoint after Pass 2 survey line
      if (overshoot > 0) {
        const exitX = startFromWest ? (width / 2.0 + overshoot) : (-width / 2.0 - overshoot);
        waypoints.push({ x: exitX, y: y, heading: lineHeading2, isTurnaroundPoint: true, skipPhoto: true });
      }
    }
  }

  return { waypoints, photos };
}

// Generate Tower flight inspection pattern coordinates (horizontal tiered rings or vertical columns)
function generateTowerCoordinates(layer, sLine, sPhoto, baseAltitude, defaultGimbalPitch) {
  const waypoints = [];
  const photos = [];

  const rawMin = layer ? (layer.towerMinHeight !== undefined ? layer.towerMinHeight : 20) : 20;
  const rawMax = layer ? (layer.towerMaxHeight !== undefined ? layer.towerMaxHeight : 100) : 100;
  const minH = Math.min(rawMin, rawMax);
  const maxH = Math.max(rawMin, rawMax);
  const standoffRad = layer ? (layer.towerRadius !== undefined ? Math.max(1, layer.towerRadius) : 30) : 30;
  const guyBuffer = layer ? (layer.towerGuyWireBuffer !== undefined ? Math.max(0, layer.towerGuyWireBuffer) : 15) : 15;
  const effectiveRadius = Math.max(1, standoffRad + guyBuffer);

  const mode = layer ? (layer.towerMovementMode || 'horizontal') : 'horizontal';
  const order = layer ? (layer.towerAltitudeOrder || 'max-to-min') : 'max-to-min';

  const resolvedPitch = (defaultGimbalPitch !== undefined && defaultGimbalPitch !== null && !isNaN(defaultGimbalPitch))
    ? defaultGimbalPitch
    : (layer && layer.gimbalPitch !== undefined && layer.gimbalPitch !== null && !isNaN(layer.gimbalPitch))
      ? layer.gimbalPitch
      : 0;
  const pitch = Math.max(-90, Math.min(60, resolvedPitch));

  const hDiff = Math.abs(maxH - minH);
  const nTiers = Math.max(2, Math.round(hDiff / Math.max(1, sLine)) + 1);

  const altitudes = [];
  for (let i = 0; i < nTiers; i++) {
    const frac = nTiers > 1 ? i / (nTiers - 1) : 0;
    const alt = (order === 'min-to-max') ? (minH + frac * hDiff) : (maxH - frac * hDiff);
    altitudes.push(alt);
  }

  const circumference = 2 * Math.PI * effectiveRadius;
  const nPosPerRing = Math.max(8, Math.round(circumference / Math.max(1, sPhoto)));

  if (mode === 'horizontal') {
    altitudes.forEach((alt, tierIdx) => {
      for (let i = 0; i < nPosPerRing; i++) {
        const theta = (tierIdx % 2 === 0)
          ? (i / nPosPerRing) * 2 * Math.PI
          : (1.0 - (i / nPosPerRing)) * 2 * Math.PI;

        const x = effectiveRadius * Math.cos(theta);
        const y = effectiveRadius * Math.sin(theta);

        let heading = Math.atan2(-x, -y) * (180.0 / Math.PI);
        if (heading < 0) heading += 360;

        const pt = {
          x: x,
          y: y,
          alt: alt,
          pitch: pitch,
          heading: heading,
          headingMode: 'smoothTransition',
          isRingStart: i === 0,
          ringIndex: tierIdx % 3
        };

        photos.push(pt);
        waypoints.push(pt);
      }
    });
  } else {
    // Vertical columns mode
    for (let colIdx = 0; colIdx < nPosPerRing; colIdx++) {
      const theta = (colIdx / nPosPerRing) * 2 * Math.PI;
      const x = effectiveRadius * Math.cos(theta);
      const y = effectiveRadius * Math.sin(theta);

      let heading = Math.atan2(-x, -y) * (180.0 / Math.PI);
      if (heading < 0) heading += 360;

      const columnAlts = (colIdx % 2 === 0) ? [...altitudes] : [...altitudes].reverse();

      columnAlts.forEach((alt, aIdx) => {
        const pt = {
          x: x,
          y: y,
          alt: alt,
          pitch: pitch,
          heading: heading,
          headingMode: 'smoothTransition',
          isRingStart: aIdx === 0,
          ringIndex: colIdx % 3
        };

        photos.push(pt);
        waypoints.push(pt);
      });
    }
  }

  return { waypoints, photos };
}

// Generate circular orbit around the center (0, 0)
function generateOrbitCoordinates(radius, sPhoto, baseAltitude, defaultGimbalPitch) {
  const waypoints = [];
  const photos = [];

  const circumference = 2 * Math.PI * radius;
  const nPhotos = Math.max(8, Math.round(circumference / sPhoto));

  for (let i = 0; i < nPhotos; i++) {
    const theta = (i / nPhotos) * 2 * Math.PI;
    const x = radius * Math.cos(theta);
    const y = radius * Math.sin(theta);
    
    // Heading points directly to the center (0, 0)
    let heading = Math.atan2(-x, -y) * (180.0 / Math.PI);
    if (heading < 0) heading += 360;

    const pt = {
      x: x,
      y: y,
      alt: baseAltitude,
      pitch: defaultGimbalPitch,
      heading: heading,
      headingMode: 'smoothTransition'
    };

    photos.push(pt);
    waypoints.push(pt);
  }

  return { waypoints, photos };
}

// Generate 3 concentric orbits at different altitudes and radii with custom gimbal pitches
function generateMultiOrbitCoordinates(radius, sPhoto, baseAltitude, defaultGimbalPitch) {
  const waypoints = [];
  const photos = [];
  
  // High, Medium, Low rings
  const rings = [
    { alt: baseAltitude * 1.2, pitch: -60, rFactor: 0.9 },
    { alt: baseAltitude * 1.0, pitch: -45, rFactor: 1.0 },
    { alt: baseAltitude * 0.8, pitch: -30, rFactor: 1.1 }
  ];

  rings.forEach((ring, ringIdx) => {
    const r = radius * ring.rFactor;
    const circumference = 2 * Math.PI * r;
    const nPhotos = Math.max(8, Math.round(circumference / sPhoto));
    
    for (let i = 0; i < nPhotos; i++) {
      // Alternate direction per ring
      const theta = (ringIdx % 2 === 0) 
        ? (i / nPhotos) * 2 * Math.PI 
        : (1.0 - (i / nPhotos)) * 2 * Math.PI;
        
      const x = r * Math.cos(theta);
      const y = r * Math.sin(theta);
      
      let heading = Math.atan2(-x, -y) * (180.0 / Math.PI);
      if (heading < 0) heading += 360;

      const pt = {
        x: x,
        y: y,
        alt: ring.alt,
        pitch: ring.pitch,
        heading: heading,
        headingMode: 'smoothTransition',
        isRingStart: i === 0,
        ringIndex: ringIdx
      };

      photos.push(pt);
      waypoints.push(pt);
    }
  });

  return { waypoints, photos };
}

// Generate a circular-clipped grid of radius R
function generateCircularGridCoordinates(radius, sLine, sPhoto, captureMode) {
  const waypoints = [];
  const photos = [];

  // Determine number of lines
  const nLines = Math.max(2, Math.round((2 * radius) / sLine) + 1);
  const dxLine = nLines > 1 ? (2 * radius) / (nLines - 1) : 0;

  for (let i = 0; i < nLines; i++) {
    const x = -radius + i * dxLine;
    // Calculate the y limits for this x-coordinate inside the circle
    const yMax = Math.sqrt(Math.max(0, radius * radius - x * x));
    
    // Skip lines that are too short at the very edges of the circle
    if (yMax < 5.0) continue;

    const startFromSouth = (i % 2 === 0);
    const lineHeading = startFromSouth ? 0 : 180;
    const linePoints = [];

    const nPhotos = Math.max(2, Math.round((2 * yMax) / sPhoto) + 1);
    const dyPhoto = nPhotos > 1 ? (2 * yMax) / (nPhotos - 1) : 0;

    for (let j = 0; j < nPhotos; j++) {
      const yIdx = startFromSouth ? j : (nPhotos - 1 - j);
      const y = -yMax + yIdx * dyPhoto;
      
      linePoints.push({ x: x, y: y, heading: lineHeading });
      photos.push({ x: x, y: y, heading: lineHeading });
    }

    if (captureMode === 'continuous' || captureMode === 'video') {
      // Waypoints only at start and end of the line segment
      waypoints.push(linePoints[0]);
      waypoints.push(linePoints[linePoints.length - 1]);
    } else {
      // Waypoints at every shutter point
      linePoints.forEach(pt => waypoints.push(pt));
    }
  }

  return { waypoints, photos };
}

// Generate a Nadir grid plus an Oblique orbit around it
function generateGridOrbitComboCoordinates(radius, rotation, captureMode, sLine, sPhoto, baseAltitude, defaultGimbalPitch) {
  const waypoints = [];
  const photos = [];

  // 1. Generate circular-clipped grid coordinates
  // We pass 0 rotation because rotation is applied globally in localToGeodetic
  const gridData = generateCircularGridCoordinates(radius, sLine, sPhoto, captureMode);

  const gridWaypoints = gridData.waypoints.map((pt, idx) => ({
    x: pt.x,
    y: pt.y,
    alt: baseAltitude,
    pitch: -90, // Nadir
    heading: null,
    isRingStart: idx === 0, // Set gimbal to -90 at start
    ringIndex: 1 // Cyan (Mid/Grid)
  }));

  // 2. Generate orbit coordinates circumscribing the grid
  const orbitData = generateOrbitCoordinates(radius, sPhoto, baseAltitude, defaultGimbalPitch);

  const orbitWaypoints = orbitData.waypoints.map((pt, idx) => ({
    x: pt.x,
    y: pt.y,
    alt: baseAltitude,
    pitch: defaultGimbalPitch, // Oblique pitch from slider
    heading: pt.heading, // Point at center (POI)
    headingMode: 'smoothTransition',
    isRingStart: idx === 0, // Set gimbal to oblique at start of orbit
    ringIndex: 0 // Violet (High/Orbit)
  }));

  // Combine them
  gridWaypoints.forEach(wp => waypoints.push(wp));
  orbitWaypoints.forEach(wp => waypoints.push(wp));

  const gridPhotos = gridData.photos.map(pt => ({ x: pt.x, y: pt.y, alt: baseAltitude, pitch: -90, heading: null }));
  const orbitPhotos = orbitData.photos.map(pt => ({ x: pt.x, y: pt.y, alt: baseAltitude, pitch: defaultGimbalPitch, heading: pt.heading }));
  
  gridPhotos.forEach(pt => photos.push(pt));
  orbitPhotos.forEach(pt => photos.push(pt));

  return { waypoints, photos };
}

// Generate a Nadir grid plus a 3D Multi-Tiered Orbit (3 rings) around it
function generateGridMultiOrbitComboCoordinates(radius, rotation, captureMode, sLine, sPhoto, baseAltitude, defaultGimbalPitch) {
  const waypoints = [];
  const photos = [];

  // 1. Generate circular-clipped grid coordinates
  // We pass 0 rotation because rotation is applied globally in localToGeodetic
  const gridData = generateCircularGridCoordinates(radius, sLine, sPhoto, captureMode);

  const gridWaypoints = gridData.waypoints.map((pt, idx) => ({
    x: pt.x,
    y: pt.y,
    alt: baseAltitude,
    pitch: -90, // Nadir
    heading: null,
    isRingStart: idx === 0, // Set gimbal to -90 at start
    ringIndex: 3 // Blue (Grid in 3D combo)
  }));

  // 2. Generate 3 concentric orbits
  const orbitData = generateMultiOrbitCoordinates(radius, sPhoto, baseAltitude, defaultGimbalPitch);

  const orbitWaypoints = orbitData.waypoints.map((pt) => ({
    x: pt.x,
    y: pt.y,
    alt: pt.alt,
    pitch: pt.pitch,
    heading: pt.heading,
    headingMode: 'smoothTransition',
    isRingStart: pt.isRingStart,
    ringIndex: pt.ringIndex // Violet (0), Cyan (1), Amber (2)
  }));

  // Combine them
  gridWaypoints.forEach(wp => waypoints.push(wp));
  orbitWaypoints.forEach(wp => waypoints.push(wp));

  const gridPhotos = gridData.photos.map(pt => ({ x: pt.x, y: pt.y, alt: baseAltitude, pitch: -90, heading: null }));
  const orbitPhotos = orbitData.photos.map(pt => ({
    x: pt.x,
    y: pt.y,
    alt: pt.alt,
    pitch: pt.pitch,
    heading: pt.heading
  }));
  
  gridPhotos.forEach(pt => photos.push(pt));
  orbitPhotos.forEach(pt => photos.push(pt));

  return { waypoints, photos };
}

function updatePhotoSphereBadge() {
  if (typeof document === 'undefined') return;
  const badge = document.getElementById('photo-sphere-shot-count-badge');
  if (!badge) return;
  const r1 = document.getElementById('photo-sphere-ring-1');
  const r2 = document.getElementById('photo-sphere-ring-2');
  const r3 = document.getElementById('photo-sphere-ring-3');
  const rNadir = document.getElementById('photo-sphere-ring-nadir');
  const shotsSelect = document.getElementById('photo-sphere-shots-per-ring');
  const shots = shotsSelect ? (parseInt(shotsSelect.value, 10) || 12) : 12;
  let count = 0;
  if (r1 && r1.checked) count += shots;
  if (r2 && r2.checked) count += shots;
  if (r3 && r3.checked) count += shots;
  if (rNadir && rNadir.checked) count += 1;
  badge.textContent = `${count} Shot${count === 1 ? '' : 's'} Total`;
}

// Generate 360° Photo Sphere coordinates (v1.154.0 - Issue #134)
// Supports selective elevation rings, configurable shots per ring, stationary action groups, and settling delay
function generatePhotoSphereCoordinates(baseAltitude, layer) {
  const waypoints = [];
  const photos = [];

  let rings = (layer && layer.photoSphereRings) ? layer.photoSphereRings : null;
  if (!rings && typeof document !== 'undefined') {
    const r1 = document.getElementById('photo-sphere-ring-1');
    const r2 = document.getElementById('photo-sphere-ring-2');
    const r3 = document.getElementById('photo-sphere-ring-3');
    const rNadir = document.getElementById('photo-sphere-ring-nadir');
    if ((r1 && typeof r1.checked === 'boolean') || (r2 && typeof r2.checked === 'boolean') || (r3 && typeof r3.checked === 'boolean') || (rNadir && typeof rNadir.checked === 'boolean')) {
      rings = {
        ring1: r1 && typeof r1.checked === 'boolean' ? r1.checked : true,
        ring2: r2 && typeof r2.checked === 'boolean' ? r2.checked : true,
        ring3: r3 && typeof r3.checked === 'boolean' ? r3.checked : true,
        nadir: rNadir && typeof rNadir.checked === 'boolean' ? rNadir.checked : true
      };
    }
  }
  if (!rings) {
    rings = { ring1: true, ring2: true, ring3: true, nadir: true };
  }

  // Fallback safety: ensure at least one ring is active
  if (!rings.ring1 && !rings.ring2 && !rings.ring3 && !rings.nadir) {
    rings.ring1 = true;
  }

  const rawShots = (layer && layer.photoSphereShotsPerRing !== undefined) ? Number(layer.photoSphereShotsPerRing) : 12;
  const shotsPerRing = Math.max(6, Math.min(24, isNaN(rawShots) ? 12 : rawShots));
  const step = 360.0 / shotsPerRing;

  const rawSettling = (layer && layer.photoSphereSettlingTime !== undefined) ? Number(layer.photoSphereSettlingTime) : 2.0;
  const settlingTime = Math.max(0.5, Math.min(10.0, isNaN(rawSettling) ? 2.0 : rawSettling));

  let mode = (layer && layer.photoSphereMode) ? layer.photoSphereMode : null;
  if (!mode && typeof document !== 'undefined') {
    const psMode = document.getElementById('photo-sphere-mode');
    if (psMode && psMode.value) mode = psMode.value;
  }
  if (!mode) {
    mode = 'discreteNodes';
  }
  const aebEnabled = Boolean(layer && layer.photoSphereAebEnabled);

  const rows = [];
  if (rings.ring1) rows.push({ pitch: -15, count: shotsPerRing, step: step, ringIndex: 0 });
  if (rings.ring2) rows.push({ pitch: -45, count: shotsPerRing, step: step, ringIndex: 1 });
  if (rings.ring3) rows.push({ pitch: -75, count: shotsPerRing, step: step, ringIndex: 2 });

  let shotIndex = 0;
  const allActions = [];

  rows.forEach(row => {
    for (let i = 0; i < row.count; i++) {
      const heading = Math.round((i * row.step) % 360);
      const actionItem = {
        yaw: heading,
        pitch: row.pitch,
        ringIndex: row.ringIndex,
        shotIndex: shotIndex++,
        hoverTime: settlingTime,
        aebEnabled: aebEnabled
      };
      allActions.push(actionItem);

      const pt = {
        x: 0,
        y: 0,
        alt: baseAltitude,
        pitch: row.pitch,
        heading: heading,
        headingMode: 'smoothTransition',
        gridType: 'photo-sphere',
        layerPattern: 'photo-sphere',
        isPhotoSpherePoint: true,
        ringIndex: row.ringIndex,
        isRingStart: (i === 0),
        shotIndex: actionItem.shotIndex,
        hoverTime: settlingTime,
        photoSphereMode: mode,
        aebEnabled: aebEnabled
      };
      photos.push(pt);
      if (mode !== 'actionGroup') {
        waypoints.push(pt);
      }
    }
  });

  // Nadir Catch: 1 final ground-lock shot at -90° pitch
  if (rings.nadir) {
    const nadirAction = {
      yaw: 0,
      pitch: -90,
      ringIndex: 3,
      shotIndex: shotIndex++,
      hoverTime: settlingTime,
      aebEnabled: aebEnabled
    };
    allActions.push(nadirAction);

    const nadirPt = {
      x: 0,
      y: 0,
      alt: baseAltitude,
      pitch: -90,
      heading: 0,
      headingMode: 'smoothTransition',
      gridType: 'photo-sphere',
      layerPattern: 'photo-sphere',
      isPhotoSpherePoint: true,
      ringIndex: 3,
      isRingStart: true,
      shotIndex: nadirAction.shotIndex,
      hoverTime: settlingTime,
      photoSphereMode: mode,
      aebEnabled: aebEnabled
    };
    photos.push(nadirPt);
    if (mode !== 'actionGroup') {
      waypoints.push(nadirPt);
    }
  }

  // When in stationary actionGroup mode, emit a single waypoint containing the entire action sequence
  if (mode === 'actionGroup') {
    waypoints.push({
      x: 0,
      y: 0,
      alt: baseAltitude,
      pitch: -15,
      heading: 0,
      headingMode: 'smoothTransition',
      gridType: 'photo-sphere',
      layerPattern: 'photo-sphere',
      isPhotoSpherePoint: true,
      isPhotoSphereActionGroup: true,
      hoverTime: settlingTime,
      photoSphereActions: allActions,
      photoSphereMode: 'actionGroup',
      totalShots: allActions.length,
      aebEnabled: aebEnabled
    });
  }

  return { waypoints, photos, totalShots: allActions.length, mode };
}

// ============================================================================
// Hyperlapse Moving Time-Lapse Pattern Generator (v1.146.0 - Closes #102)
// ============================================================================
function generateHyperlapseWaypoints(rawWps, layer, speed, altitude) {
  if (!rawWps || !Array.isArray(rawWps) || rawWps.length === 0) {
    return { waypoints: [], framePoints: [], controlWaypoints: [], denseWaypoints: [], waypointMode: 'dense', interval: 3, frameSpacing: 0 };
  }

  const rawInterval = layer ? layer.hyperlapseInterval : 3;
  let interval = parseInt(rawInterval, 10);
  if (isNaN(interval) || interval < 2) interval = 2;
  if (interval > 10) interval = 10;

  const effectiveCaptureMode = (layer && layer.captureMode && layer.captureMode !== 'inherit')
    ? layer.captureMode
    : ((typeof document !== 'undefined' && document.getElementById('capture-mode')?.value) || 'stopAndShoot');

  // Capture Mode directly determines the waypoint architecture:
  // - 'stopAndShoot' -> ALWAYS 'dense' (all frame points become explicit waypoints with stop turn mode & settling hover)
  // - 'continuous' or 'video' -> 'spline' by default (2 control waypoints with DJI automated multipleTiming trigger), or 'dense' if explicitly selected
  let waypointMode;
  if (layer && layer.hyperlapseWaypointMode) {
    waypointMode = layer.hyperlapseWaypointMode;
  } else if (layer && layer.captureMode === 'stopAndShoot') {
    waypointMode = 'dense';
  } else if (layer && (layer.captureMode === 'continuous' || layer.captureMode === 'video')) {
    waypointMode = 'spline';
  } else if (effectiveCaptureMode === 'continuous' || effectiveCaptureMode === 'video') {
    waypointMode = 'spline';
  } else {
    waypointMode = 'dense';
  }

  const layerPitch = (layer && layer.gimbalPitch !== undefined && layer.gimbalPitch !== 'auto' && !isNaN(layer.gimbalPitch))
    ? parseInt(layer.gimbalPitch, 10)
    : -60;

  const rawStart = (layer && layer.hyperlapseStartPitch !== undefined && !isNaN(layer.hyperlapseStartPitch)) ? parseInt(layer.hyperlapseStartPitch, 10) : null;
  const rawEnd = (layer && layer.hyperlapseEndPitch !== undefined && !isNaN(layer.hyperlapseEndPitch)) ? parseInt(layer.hyperlapseEndPitch, 10) : null;
  const hasCustomSweep = (rawStart !== null && rawEnd !== null && rawStart !== rawEnd);
  const startPitch = hasCustomSweep ? rawStart : (rawStart !== null ? rawStart : layerPitch);
  const endPitch = hasCustomSweep ? rawEnd : (rawEnd !== null ? rawEnd : layerPitch);

  const headingMode = (layer && layer.hyperlapseHeadingMode) ? layer.hyperlapseHeadingMode : 'path';
  const startHeading = (layer && layer.hyperlapseStartHeading !== undefined && !isNaN(layer.hyperlapseStartHeading)) ? parseFloat(layer.hyperlapseStartHeading) % 360 : 0;
  const endHeading = (layer && layer.hyperlapseEndHeading !== undefined && !isNaN(layer.hyperlapseEndHeading)) ? parseFloat(layer.hyperlapseEndHeading) % 360 : 90;

  const targetPoi = (layer && (layer.hyperlapseFocusPoi || layer.headingMode === 'towardPOI') && typeof getTargetPoiCoordinates === 'function')
    ? getTargetPoiCoordinates(null, layer)
    : null;

  // Calculate cumulative distances along waypoints
  const cumDists = [0];
  let totalDist = 0;
  for (let i = 1; i < rawWps.length; i++) {
    const p1 = rawWps[i - 1];
    const p2 = rawWps[i];
    let d = 0;
    if (p1.x !== undefined && p2.x !== undefined) {
      d = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    } else if (p1.lat !== undefined && p2.lat !== undefined && typeof haversineDistance === 'function') {
      d = haversineDistance(p1.lat, p1.lon, p2.lat, p2.lon);
    }
    totalDist += d;
    cumDists.push(totalDist);
  }

  function lerpAngleShortest(a, b, t) {
    let diff = (b - a) % 360;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    let val = (a + diff * t) % 360;
    if (val < 0) val += 360;
    return val;
  }

  function getBearingBetween(p1, p2) {
    if (!p1 || !p2) return 0;
    if (p1.lat !== undefined && p2.lat !== undefined) {
      const lat1 = (p1.lat * Math.PI) / 180;
      const lat2 = (p2.lat * Math.PI) / 180;
      const dLon = ((p2.lon !== undefined ? p2.lon : p2.lng) - (p1.lon !== undefined ? p1.lon : p1.lng)) * Math.PI / 180;
      const y = Math.sin(dLon) * Math.cos(lat2);
      const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
      let brg = Math.atan2(y, x) * 180 / Math.PI;
      return ((brg % 360) + 360) % 360;
    }
    return 0;
  }

  // Generate per-control-waypoint parameters
  const controlWaypoints = rawWps.map((wp, idx) => {
    const t = totalDist > 0 ? cumDists[idx] / totalDist : (rawWps.length > 1 ? idx / (rawWps.length - 1) : 0);
    let pitch, heading;

    const effectiveAlt = (wp.isModified && wp.alt !== undefined && wp.alt !== null) ? wp.alt : altitude;

    if (targetPoi) {
      heading = getBearingBetween(wp, targetPoi);
      pitch = (typeof calculate3DPoiPitch === 'function') ? calculate3DPoiPitch(wp, targetPoi, effectiveAlt) : -45;
    } else if (wp.isModified && wp.pitch !== undefined && wp.pitch !== null && wp.pitch !== 'inherit') {
      pitch = wp.pitch;
    } else if (hasCustomSweep) {
      pitch = Math.round(startPitch + (endPitch - startPitch) * t);
    } else {
      pitch = (layer && layer.gimbalPitch !== undefined && layer.gimbalPitch !== 'auto' && !isNaN(layer.gimbalPitch))
        ? parseInt(layer.gimbalPitch, 10)
        : Math.round(startPitch + (endPitch - startPitch) * t);
    }

    if (headingMode === 'keyframes') {
      heading = lerpAngleShortest(startHeading, endHeading, t);
    } else {
      // Follow flight path tangent
      let inBrg = null;
      let outBrg = null;
      if (idx > 0) inBrg = getBearingBetween(rawWps[idx - 1], wp);
      if (idx < rawWps.length - 1) outBrg = getBearingBetween(wp, rawWps[idx + 1]);

      if (inBrg !== null && outBrg !== null) {
        heading = lerpAngleShortest(inBrg, outBrg, 0.5);
      } else if (outBrg !== null) {
        heading = outBrg;
      } else if (inBrg !== null) {
        heading = inBrg;
      } else {
        heading = 0;
      }
    }

    return {
      ...wp,
      alt: effectiveAlt,
      isModified: Boolean(wp.isModified),
      layerAltitude: (layer && layer.altitude !== undefined && layer.altitude !== null) ? layer.altitude : altitude,
      layerGimbalPitch: (layer && layer.gimbalPitch !== undefined && layer.gimbalPitch !== null) ? layer.gimbalPitch : 'inherit',
      layerId: wp.layerId || (layer ? layer.id : null),
      pitch: pitch,
      heading: Math.round(heading * 10) / 10,
      headingMode: 'smoothTransition',
      turnMode: 'inherit',
      gridType: 'hyperlapse',
      layerPattern: 'hyperlapse',
      isHyperlapse: true,
      skipPhoto: true,
      hyperlapseInterval: interval
    };
  });

  // Sample frame photo points along path every (speed * interval) meters
  const framePoints = [];
  const effectiveSpeed = Math.max(0.1, (speed !== undefined && !isNaN(speed) && speed > 0) ? Number(speed) : 2.0);
  const frameSpacing = Math.max(0.05, effectiveSpeed * interval);

  if (controlWaypoints.length >= 2 && totalDist > 0) {
    let currentDist = 0;
    while (currentDist <= totalDist + 0.01) {
      let segIdx = 0;
      while (segIdx < cumDists.length - 2 && cumDists[segIdx + 1] < currentDist) {
        segIdx++;
      }
      const pA = controlWaypoints[segIdx];
      const pB = controlWaypoints[segIdx + 1] || pA;
      const segLen = cumDists[segIdx + 1] - cumDists[segIdx];
      const segT = segLen > 0 ? Math.min(1, Math.max(0, (currentDist - cumDists[segIdx]) / segLen)) : 0;
      const globalT = currentDist / totalDist;

      const fLat = pA.lat + (pB.lat - pA.lat) * segT;
      const fLon = pA.lon + (pB.lon - pA.lon) * segT;
      const fAlt = pA.alt + (pB.alt - pA.alt) * segT;
      const fX = pA.x !== undefined && pB.x !== undefined ? pA.x + (pB.x - pA.x) * segT : 0;
      const fY = pA.y !== undefined && pB.y !== undefined ? pA.y + (pB.y - pA.y) * segT : 0;

      let fPitch, fHeading;
      if (targetPoi) {
        const samplePt = { lat: fLat, lon: fLon, x: fX, y: fY, alt: fAlt };
        fHeading = getBearingBetween(samplePt, targetPoi);
        fPitch = (typeof calculate3DPoiPitch === 'function') ? calculate3DPoiPitch(samplePt, targetPoi, fAlt) : -45;
      } else if (headingMode === 'keyframes') {
        fPitch = Math.round(startPitch + (endPitch - startPitch) * globalT);
        fHeading = lerpAngleShortest(startHeading, endHeading, globalT);
      } else {
        fPitch = Math.round((pA.pitch !== undefined ? pA.pitch : startPitch) + ((pB.pitch !== undefined ? pB.pitch : endPitch) - (pA.pitch !== undefined ? pA.pitch : startPitch)) * segT);
        fHeading = lerpAngleShortest(pA.heading || 0, pB.heading || 0, segT);
      }

      framePoints.push({
        lat: fLat,
        lon: fLon,
        x: fX,
        y: fY,
        alt: fAlt,
        pitch: fPitch,
        heading: Math.round(fHeading * 10) / 10,
        distMeters: currentDist,
        isHyperlapseFrame: true
      });

      currentDist += frameSpacing;
    }
  } else if (controlWaypoints.length === 1) {
    const p0 = controlWaypoints[0];
    framePoints.push({
      lat: p0.lat,
      lon: p0.lon,
      x: p0.x,
      y: p0.y,
      alt: p0.alt,
      pitch: p0.pitch,
      heading: p0.heading,
      distMeters: 0,
      isHyperlapseFrame: true
    });
  }

  // Generate dense flight waypoints from frame points
  const denseWaypoints = framePoints.map((fp, fIdx) => {
    const isFirst = (fIdx === 0);
    const isLast = (fIdx === framePoints.length - 1);
    const matchedControl = isFirst ? controlWaypoints[0] : (isLast ? controlWaypoints[controlWaypoints.length - 1] : null);
    const isMod = matchedControl ? Boolean(matchedControl.isModified) : false;

    return {
      idx: fIdx,
      lat: fp.lat,
      lon: fp.lon,
      x: Math.round(fp.x * 100) / 100,
      y: Math.round(fp.y * 100) / 100,
      alt: Math.round(fp.alt * 10) / 10,
      pitch: fp.pitch,
      heading: fp.heading,
      isModified: isMod,
      headingMode: 'smoothTransition',
      turnMode: 'curved',
      pathMode: 'curved',
      speed: effectiveSpeed,
      captureMode: effectiveCaptureMode,
      cameraAction: 'takePhoto',
      skipPhoto: false,
      isHyperlapse: true,
      isHyperlapseFrame: true,
      layerId: layer ? layer.id : null,
      layerName: layer ? layer.name : null,
      layerPattern: 'hyperlapse',
      layerAltitude: (layer && layer.altitude !== undefined) ? layer.altitude : altitude,
      layerGimbalPitch: fp.pitch,
      distMeters: fp.distMeters,
      hyperlapseInterval: interval
    };
  });

  const totalFrames = framePoints.length;
  const flightDurationSec = (effectiveSpeed > 0 && totalDist > 0) ? (totalDist / effectiveSpeed) : 0;
  const videoDuration24fps = totalFrames / 24.0;
  const videoDuration30fps = totalFrames / 30.0;

  const finalWaypoints = (waypointMode === 'dense' && denseWaypoints.length > 0)
    ? denseWaypoints
    : controlWaypoints;

  return {
    waypoints: finalWaypoints,
    framePoints: framePoints,
    controlWaypoints: controlWaypoints,
    denseWaypoints: denseWaypoints,
    waypointMode: waypointMode,
    interval,
    frameSpacing,
    totalDist,
    totalFrames,
    flightDurationSec,
    videoDuration24fps,
    videoDuration30fps
  };
}

// ============================================================================
// Light Art & Sky Painting Long Exposure Generator (v1.151.0 - Issue #136)
// ============================================================================

/**
 * Generate 2D/3D Light Art waypoints for long exposure sky calligraphy.
 * Supports presets (spiral, helix, star, heart, circle) in both horizontal
 * (overhead flat) and vertical (upright billboard facing camera bearing) planes.
 */
function generateLightArtCoordinates(layer, baseAltitude, defaultGimbalPitch, speed) {
  const waypoints = [];
  const photos = [];

  const preset = (layer && layer.lightArtPreset) ? layer.lightArtPreset : 'spiral';
  const orientation = (layer && layer.lightArtOrientation) ? layer.lightArtOrientation : 'horizontal';
  const radius = (layer && typeof layer.lightArtRadius === 'number' && layer.lightArtRadius > 0) ? layer.lightArtRadius : 25;
  const turns = (layer && typeof layer.lightArtTurns === 'number' && layer.lightArtTurns > 0) ? layer.lightArtTurns : 3;
  const pointsCount = (layer && typeof layer.lightArtPointsCount === 'number' && layer.lightArtPointsCount >= 3) ? layer.lightArtPointsCount : 5;
  const starInnerRatio = (layer && typeof layer.lightArtStarRatio === 'number' && layer.lightArtStarRatio > 0 && layer.lightArtStarRatio < 1) ? layer.lightArtStarRatio : 0.45;
  const climb = (layer && typeof layer.lightArtClimb === 'number') ? layer.lightArtClimb : 15;
  const cameraAzimuth = (layer && typeof layer.lightArtCameraAzimuth === 'number') ? layer.lightArtCameraAzimuth : 0;
  const strokeSpeed = (layer && typeof layer.speed === 'number' && layer.speed > 0) ? layer.speed : (speed || 3.0);

  // Generate parametric 2D normalized points in canvas coordinates (u, v)
  // where u is horizontal width (-radius to +radius) and v is height/depth (-radius to +radius)
  const rawPoints = [];

  if (preset === 'spiral') {
    // Archimedean Spiral in plane: r = (t / maxT) * radius
    // Enforce >= 0.65m safe flight node spacing so center turns start cleanly without clustering or distortion
    const totalSteps = Math.max(36, Math.round(turns * 24));
    let curU = 0;
    let curV = 0;
    rawPoints.push({ u: 0, v: 0, zOffset: 0 });
    for (let i = 1; i <= totalSteps; i++) {
      const frac = i / totalSteps;
      const angle = frac * turns * 2 * Math.PI;
      const r = frac * radius;
      const u = r * Math.cos(angle);
      const v = r * Math.sin(angle);
      const d = Math.hypot(u - curU, v - curV);
      if (d >= 0.65 || i === totalSteps) {
        if (i === totalSteps && d < 0.65 && rawPoints.length > 1) {
          rawPoints[rawPoints.length - 1] = { u, v, zOffset: 0 };
        } else {
          rawPoints.push({ u, v, zOffset: 0 });
        }
        curU = u;
        curV = v;
      }
    }
  } else if (preset === 'helix') {
    // 3D Climbing Helix: spirals while climbing in altitude
    const totalSteps = Math.max(36, Math.round(turns * 24));
    for (let i = 0; i <= totalSteps; i++) {
      const frac = i / totalSteps;
      const angle = frac * turns * 2 * Math.PI;
      const r = radius;
      const u = r * Math.cos(angle);
      const v = r * Math.sin(angle);
      const zOffset = frac * climb;
      rawPoints.push({ u, v, zOffset });
    }
  } else if (preset === 'star') {
    // N-Point Star polygon with alternating outer and inner vertices
    const numPoints = pointsCount;
    const innerR = radius * starInnerRatio;
    const totalVerts = numPoints * 2;
    for (let i = 0; i <= totalVerts; i++) {
      const isInner = (i % 2 === 1);
      const r = isInner ? innerR : radius;
      const angle = (i / totalVerts) * 2 * Math.PI - Math.PI / 2; // Start pointing straight up
      const u = r * Math.cos(angle);
      const v = r * Math.sin(angle);
      rawPoints.push({ u, v, zOffset: 0 });
    }
  } else if (preset === 'heart') {
    // Parametric Cardioid Heart:
    // x = 16 * sin^3(t)
    // y = 13*cos(t) - 5*cos(2t) - 2*cos(3t) - cos(4t)
    const steps = 48;
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * 2 * Math.PI;
      const sinT = Math.sin(t);
      const uNorm = 16 * Math.pow(sinT, 3);
      const vNorm = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      // Normalized max bounding box of heart is approx ~16 horizontal and ~17 vertical
      const scale = radius / 16.0;
      const u = uNorm * scale;
      const v = vNorm * scale;
      rawPoints.push({ u, v, zOffset: 0 });
    }
  } else {
    // Circle / Ring default
    const steps = 36;
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * 2 * Math.PI;
      const u = radius * Math.cos(t);
      const v = radius * Math.sin(t);
      rawPoints.push({ u, v, zOffset: 0 });
    }
  }

  // Project (u, v, zOffset) into 3D local coordinates (x, y, alt)
  // Horizontal mode:
  //   u maps to East (x), v maps to North (y), zOffset adds to baseAltitude
  // Vertical Billboard mode:
  //   Canvas stands upright in the sky facing ground camera at cameraAzimuth.
  //   u maps across the canvas perpendicular to cameraAzimuth,
  //   v maps up/down along altitude axis (z),
  //   altitude = baseAltitude + v + zOffset.
  const radAz = (cameraAzimuth * Math.PI) / 180.0;
  const perpX = Math.cos(radAz); // Perpendicular cross-track unit vector
  const perpY = -Math.sin(radAz);

  let totalDistance = 0;
  let prevPt = null;

  rawPoints.forEach((pt, idx) => {
    let x, y, alt;
    if (orientation === 'vertical') {
      // In vertical plane:
      // u moves perpendicular to line of sight to ground camera
      // v moves along altitude axis
      x = pt.u * perpX;
      y = pt.u * perpY;
      alt = Math.max(10, baseAltitude + pt.v + pt.zOffset);
    } else {
      // In horizontal plane:
      x = pt.u;
      y = pt.v;
      alt = Math.max(10, baseAltitude + pt.zOffset);
    }

    if (prevPt) {
      const d = Math.hypot(x - prevPt.x, y - prevPt.y, alt - prevPt.alt);
      totalDistance += d;
    }
    prevPt = { x, y, alt };

    // Point aircraft tangent to direction of flight for streamlined aerodynamics
    const wpObj = {
      x: x,
      y: y,
      alt: alt,
      pitch: defaultGimbalPitch,
      heading: null,
      headingMode: 'followWayline',
      gridType: 'light-art',
      layerPattern: 'light-art',
      isLightArtPoint: true,
      skipPhoto: true, // Aircraft itself is the light source; no camera triggers needed
      cameraAction: 'none',
      hoverTime: 0,
      autoSettlingEnabled: false,
      turnMode: 'curved'
    };

    waypoints.push(wpObj);
  });

  // Calculate tangent headings between waypoints
  for (let i = 0; i < waypoints.length; i++) {
    const cur = waypoints[i];
    let nxt = (i < waypoints.length - 1) ? waypoints[i + 1] : waypoints[i];
    let prv = (i > 0) ? waypoints[i - 1] : waypoints[i];
    let dx = nxt.x - prv.x;
    let dy = nxt.y - prv.y;
    if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) {
      let brg = Math.atan2(dx, dy) * (180.0 / Math.PI);
      if (brg < 0) brg += 360;
      cur.heading = Math.round(brg * 10) / 10;
    } else {
      cur.heading = 0;
    }
  }

  // Compute stroke flight duration and recommended ground camera shutter speed
  const flightDurationSec = (strokeSpeed > 0) ? (totalDistance / strokeSpeed) : 0;
  const recommendedShutterSec = Math.ceil(flightDurationSec + 2); // 2s safety buffer for Bulb exposure

  return {
    waypoints,
    photos: [],
    totalDistance: Math.round(totalDistance * 10) / 10,
    flightDurationSec: Math.round(flightDurationSec * 10) / 10,
    recommendedShutterSec: recommendedShutterSec,
    preset,
    orientation
  };
}

// ============================================================================
// Vertical Facade Grid Pattern Generator (v1.153.0 - Issue #132)
// ============================================================================
function generateVerticalFacadeCoordinates(layer, sLine, sPhoto, baseAltitude, defaultGimbalPitch) {
  const waypoints = [];
  const photos = [];

  const rawMin = (layer && layer.facadeMinAlt !== undefined) ? Number(layer.facadeMinAlt) : 10;
  const rawMax = (layer && layer.facadeMaxAlt !== undefined) ? Number(layer.facadeMaxAlt) : 40;
  const minH = Math.min(rawMin, rawMax);
  const maxH = Math.max(rawMin, rawMax);
  const hDiff = Math.max(1, maxH - minH);

  const standoff = (layer && layer.facadeStandoff !== undefined) ? Math.max(1, Number(layer.facadeStandoff)) : 15;
  const width = (layer && layer.facadeWidth !== undefined) ? Math.max(5, Number(layer.facadeWidth)) : 60;
  const scanMode = (layer && layer.facadeScanMode) ? layer.facadeScanMode : 'horizontal';
  const headingMode = (layer && layer.facadeHeadingMode) ? layer.facadeHeadingMode : 'perpendicular';

  const resolvedPitch = (defaultGimbalPitch !== undefined && defaultGimbalPitch !== null && !isNaN(defaultGimbalPitch))
    ? defaultGimbalPitch
    : ((layer && layer.gimbalPitch !== undefined && layer.gimbalPitch !== null && !isNaN(layer.gimbalPitch))
      ? Number(layer.gimbalPitch)
      : 0);

  const effSLine = Math.max(1, sLine || 5);
  const effSPhoto = Math.max(1, sPhoto || 5);

  if (scanMode === 'horizontal') {
    const nTiers = Math.max(2, Math.round(hDiff / effSLine) + 1);
    const nPhotos = Math.max(2, Math.round(width / effSPhoto) + 1);
    const dyAlt = hDiff / (nTiers - 1);
    const dx = width / (nPhotos - 1);

    for (let tierIdx = 0; tierIdx < nTiers; tierIdx++) {
      const alt = maxH - tierIdx * dyAlt;
      const leftToRight = (tierIdx % 2 === 0);

      for (let pIdx = 0; pIdx < nPhotos; pIdx++) {
        const xStep = leftToRight ? pIdx : (nPhotos - 1 - pIdx);
        const x = -width / 2.0 + xStep * dx;
        const y = -standoff; // drone flies parallel to facade wall at y = 0

        let heading = 0; // Perpendicular facing North toward facade
        if (headingMode === 'flightPath') {
          heading = leftToRight ? 90 : 270;
        }

        const pt = {
          x: Math.round(x * 100) / 100,
          y: Math.round(y * 100) / 100,
          alt: Math.round(alt * 10) / 10,
          pitch: Math.round(resolvedPitch),
          heading: heading,
          headingMode: 'smoothTransition',
          gridType: 'vertical-facade',
          layerPattern: 'vertical-facade',
          isVerticalFacade: true,
          isRingStart: (pIdx === 0),
          ringIndex: tierIdx % 4,
          tierIndex: tierIdx
        };

        photos.push(pt);
        waypoints.push(pt);
      }
    }
  } else {
    // Vertical columns mode
    const nCols = Math.max(2, Math.round(width / effSLine) + 1);
    const nPhotosPerCol = Math.max(2, Math.round(hDiff / effSPhoto) + 1);
    const dx = width / (nCols - 1);
    const dyAlt = hDiff / (nPhotosPerCol - 1);

    for (let colIdx = 0; colIdx < nCols; colIdx++) {
      const x = -width / 2.0 + colIdx * dx;
      const y = -standoff;
      const topToBottom = (colIdx % 2 === 0);

      for (let pIdx = 0; pIdx < nPhotosPerCol; pIdx++) {
        const aStep = topToBottom ? pIdx : (nPhotosPerCol - 1 - pIdx);
        const alt = maxH - aStep * dyAlt;

        let heading = 0; // Perpendicular facing North toward facade
        if (headingMode === 'flightPath') {
          heading = 0;
        }

        const pt = {
          x: Math.round(x * 100) / 100,
          y: Math.round(y * 100) / 100,
          alt: Math.round(alt * 10) / 10,
          pitch: Math.round(resolvedPitch),
          heading: heading,
          headingMode: 'smoothTransition',
          gridType: 'vertical-facade',
          layerPattern: 'vertical-facade',
          isVerticalFacade: true,
          isRingStart: (pIdx === 0),
          ringIndex: colIdx % 4,
          tierIndex: colIdx
        };

        photos.push(pt);
        waypoints.push(pt);
      }
    }
  }

  return { waypoints, photos };
}

// ============================================================================
// Continuous Helix / Spiral Corkscrew Pattern Generator (v1.153.0 - Issue #133)
// ============================================================================
function generateHelixCoordinates(layer, sPhoto, baseAltitude, defaultGimbalPitch) {
  const waypoints = [];
  const photos = [];

  const rawRStart = (layer && layer.helixRadiusStart !== undefined) ? Number(layer.helixRadiusStart) : 25;
  const rawREnd = (layer && layer.helixRadiusEnd !== undefined) ? Number(layer.helixRadiusEnd) : 25;
  const rStart = Math.max(2, rawRStart);
  const rEnd = Math.max(2, rawREnd);

  const rawAltStart = (layer && layer.helixAltStart !== undefined) ? Number(layer.helixAltStart) : 20;
  const rawAltEnd = (layer && layer.helixAltEnd !== undefined) ? Number(layer.helixAltEnd) : 60;
  const altStart = Math.max(2, rawAltStart);
  const altEnd = Math.max(2, rawAltEnd);

  const revolutions = (layer && layer.helixRevolutions !== undefined) ? Math.max(1, Math.min(10, Number(layer.helixRevolutions))) : 3;
  const direction = (layer && layer.helixDirection === 'ccw') ? 'ccw' : 'cw';
  const climbDirection = (layer && layer.helixClimbDirection === 'descent') ? 'descent' : 'ascent';

  const pitchStart = (layer && layer.helixPitchStart !== undefined && !isNaN(layer.helixPitchStart)) ? Number(layer.helixPitchStart) : -25;
  const pitchEnd = (layer && layer.helixPitchEnd !== undefined && !isNaN(layer.helixPitchEnd)) ? Number(layer.helixPitchEnd) : -65;
  const headingMode = (layer && layer.helixHeadingMode) ? layer.helixHeadingMode : 'towardCenter';

  // Compute 3D helical arc length
  const rAvg = (rStart + rEnd) / 2.0;
  const circPerRev = 2 * Math.PI * rAvg;
  const totalClimb = Math.abs(altEnd - altStart);
  const totalArcLength = revolutions * Math.sqrt(circPerRev * circPerRev + Math.pow(totalClimb / revolutions, 2));

  // Safe progressive node spacing >= 0.65m
  const stepDist = Math.max(0.65, Math.min(10.0, sPhoto || 5.0));
  const numSteps = Math.max(revolutions * 12, Math.round(totalArcLength / stepDist));

  for (let i = 0; i <= numSteps; i++) {
    const t = i / numSteps;
    const theta = t * revolutions * 2 * Math.PI;
    const currentRadius = rStart + t * (rEnd - rStart);
    const angle = (direction === 'ccw') ? theta : -theta;

    // Local coordinates (centered around 0,0)
    const x = currentRadius * Math.sin(angle);
    const y = currentRadius * Math.cos(angle);

    let alt, pitch;
    if (climbDirection === 'descent') {
      alt = altEnd - t * (altEnd - altStart);
      pitch = pitchEnd - t * (pitchEnd - pitchStart);
    } else {
      alt = altStart + t * (altEnd - altStart);
      pitch = pitchStart + t * (pitchEnd - pitchStart);
    }

    let heading;
    if (headingMode === 'tangent') {
      // Tangent to path
      const dTheta = 0.001;
      const nextAngle = (direction === 'ccw') ? (angle + dTheta) : (angle - dTheta);
      const nextR = rStart + (t + dTheta / (revolutions * 2 * Math.PI)) * (rEnd - rStart);
      const nx = nextR * Math.sin(nextAngle);
      const ny = nextR * Math.cos(nextAngle);
      let brg = Math.atan2(nx - x, ny - y) * (180.0 / Math.PI);
      if (brg < 0) brg += 360;
      heading = brg;
    } else {
      // Inward facing toward central POI / vertical structure axis (0,0)
      let brg = Math.atan2(-x, -y) * (180.0 / Math.PI);
      if (brg < 0) brg += 360;
      heading = brg;
    }

    const pt = {
      x: Math.round(x * 100) / 100,
      y: Math.round(y * 100) / 100,
      alt: Math.round(alt * 10) / 10,
      pitch: Math.round(pitch),
      heading: Math.round(heading * 10) / 10,
      headingMode: 'smoothTransition',
      turnMode: 'curved',
      pathMode: 'curved',
      gridType: 'continuous-helix',
      layerPattern: 'continuous-helix',
      isContinuousHelix: true,
      ringIndex: Math.floor(t * revolutions) % 4,
      isRingStart: (i === 0)
    };

    photos.push(pt);
    waypoints.push(pt);
  }

  return { waypoints, photos };
}

// ============================================================================
// Star Pass / Cross-Hatch Convergent POI Inspection Generator (v1.154.0 - Issue #131)
// ============================================================================
function generateStarPassCoordinates(layer, sPhoto, baseAltitude, defaultGimbalPitch) {
  const waypoints = [];
  const photos = [];

  const rawSpokes = (layer && layer.starPassSpokes !== undefined) ? Number(layer.starPassSpokes) : 3;
  const spokes = Math.max(2, Math.min(8, isNaN(rawSpokes) ? 3 : rawSpokes));

  const rawRadius = (layer && layer.starPassRadius !== undefined) ? Number(layer.starPassRadius) : 35;
  const radius = Math.max(10, Math.min(200, isNaN(rawRadius) ? 35 : rawRadius));

  const headingMode = (layer && layer.starPassHeadingMode) ? layer.starPassHeadingMode : 'convergent';
  const transitMode = (layer && layer.starPassTransitMode) ? layer.starPassTransitMode : 'perimeterHop';
  const apexNadir = (layer && layer.starPassApexNadir !== undefined) ? Boolean(layer.starPassApexNadir) : true;

  const rawAltitude = (layer && layer.altitude !== undefined && layer.altitude !== 'inherit') ? Number(layer.altitude) : baseAltitude;
  const altitude = (!isNaN(rawAltitude) && rawAltitude > 0) ? rawAltitude : 50;

  // Spoke angular increment: 180 degrees / spokes
  const angleStepDeg = 180.0 / spokes;
  const stepDist = Math.max(2.0, Math.min(15.0, sPhoto || 5.0));
  const numStepsPerRadius = Math.max(2, Math.round(radius / stepDist));

  // Helper to compute local coords given angle (deg) and signed dist from center
  const getPoint = (angleDeg, distFromCenter, spokeIdx, isApex) => {
    const rad = angleDeg * (Math.PI / 180.0);
    const x = distFromCenter * Math.sin(rad);
    const y = distFromCenter * Math.cos(rad);
    const dCenter = Math.abs(distFromCenter);

    let pitch, heading;
    if (isApex && apexNadir) {
      pitch = -90;
      heading = 0;
    } else if (headingMode === 'convergent') {
      // Heading looks directly at center (0,0)
      let brg = Math.atan2(-x, -y) * (180.0 / Math.PI);
      if (brg < 0) brg += 360;
      heading = brg;
      // Pitch points toward ground at center (0,0)
      pitch = -Math.round(Math.atan2(altitude, Math.max(0.5, dCenter)) * (180.0 / Math.PI));
      pitch = Math.max(-90, Math.min(0, pitch));
    } else if (headingMode === 'towardPOI') {
      let brg = Math.atan2(-x, -y) * (180.0 / Math.PI);
      if (brg < 0) brg += 360;
      heading = brg;
      pitch = (defaultGimbalPitch !== undefined && !isNaN(defaultGimbalPitch)) ? defaultGimbalPitch : -45;
    } else {
      // flightDirection
      heading = angleDeg;
      pitch = (defaultGimbalPitch !== undefined && !isNaN(defaultGimbalPitch)) ? defaultGimbalPitch : -45;
    }

    return {
      x: Math.round(x * 100) / 100,
      y: Math.round(y * 100) / 100,
      alt: Math.round(altitude * 10) / 10,
      pitch: Math.round(pitch),
      heading: Math.round(heading * 10) / 10,
      headingMode: 'smoothTransition',
      turnMode: 'curved',
      pathMode: 'curved',
      gridType: 'star-pass',
      layerPattern: 'star-pass',
      isStarPass: true,
      spokeIndex: spokeIdx,
      isApexNadir: Boolean(isApex && apexNadir)
    };
  };

  let lastExitAngle = null;

  for (let k = 0; k < spokes; k++) {
    const spokeBaseAngle = k * angleStepDeg;
    // Alternate direction of passes to form a continuous Hamiltonian-like path
    const isEven = (k % 2 === 0);
    const entryAngle = isEven ? (spokeBaseAngle + 180) % 360 : spokeBaseAngle;
    const exitAngle = isEven ? spokeBaseAngle : (spokeBaseAngle + 180) % 360;

    // Perimeter hop from previous exit to this entry
    if (lastExitAngle !== null && transitMode === 'perimeterHop') {
      let dAng = entryAngle - lastExitAngle;
      while (dAng > 180) dAng -= 360;
      while (dAng < -180) dAng += 360;

      // Insert intermediate curved perimeter transit points
      const hopSteps = 3;
      for (let s = 1; s < hopSteps; s++) {
        const hopFrac = s / hopSteps;
        let hopAngle = (lastExitAngle + dAng * hopFrac) % 360;
        if (hopAngle < 0) hopAngle += 360;
        const rad = hopAngle * (Math.PI / 180.0);
        const hx = radius * Math.sin(rad);
        const hy = radius * Math.cos(rad);

        let hHeading = (headingMode === 'convergent' || headingMode === 'towardPOI')
          ? (Math.atan2(-hx, -hy) * (180.0 / Math.PI) + 360) % 360
          : hopAngle;
        let hPitch = (headingMode === 'convergent')
          ? -Math.round(Math.atan2(altitude, radius) * (180.0 / Math.PI))
          : ((defaultGimbalPitch !== undefined && !isNaN(defaultGimbalPitch)) ? defaultGimbalPitch : -45);

        const hopPt = {
          x: Math.round(hx * 100) / 100,
          y: Math.round(hy * 100) / 100,
          alt: Math.round(altitude * 10) / 10,
          pitch: Math.round(hPitch),
          heading: Math.round(hHeading * 10) / 10,
          headingMode: 'smoothTransition',
          turnMode: 'curved',
          pathMode: 'curved',
          gridType: 'star-pass',
          layerPattern: 'star-pass',
          isStarPass: true,
          isPerimeterTransit: true,
          skipPhoto: true
        };
        waypoints.push(hopPt);
      }
    }

    // Now generate waypoints along the spoke from entry (-radius) to exit (+radius)
    // Entry side (inward towards center)
    for (let s = numStepsPerRadius; s >= 1; s--) {
      const dist = (s / numStepsPerRadius) * radius;
      const pt = getPoint(entryAngle, dist, k, false);
      waypoints.push(pt);
      photos.push(pt);
    }

    // Center point (Apex / Nadir)
    const centerPt = getPoint(0, 0, k, true);
    waypoints.push(centerPt);
    photos.push(centerPt);

    // Exit side (outward towards perimeter)
    for (let s = 1; s <= numStepsPerRadius; s++) {
      const dist = (s / numStepsPerRadius) * radius;
      const pt = getPoint(exitAngle, dist, k, false);
      waypoints.push(pt);
      photos.push(pt);
    }

    lastExitAngle = exitAngle;
  }

  return { waypoints, photos, spokes, radius, apexNadir };
}

/**
 * Multi-Pass Corridor Mapping along Complex Linear Features (Issue #130)
 * Generates symmetric/asymmetric parallel offset swaths along an arbitrary multi-vertex polyline
 * with miter angle bisectors, clamped corner smoothing, turnaround extensions, and 3 turnaround styles.
 *
 * @param {Object} layer - Layer configuration
 * @param {Array} centerline - Centerline points [{lat, lon, x, y}, ...]
 * @param {number} sPhoto - Photo trigger interval spacing (meters)
 * @param {number} altitude - Flight altitude (meters)
 * @param {number} defaultGimbalPitch - Default camera pitch (degrees)
 * @param {number} speed - Flight speed (m/s)
 * @param {number} centerLat - Geodetic reference center latitude
 * @param {number} centerLon - Geodetic reference center longitude
 * @returns {Object} { waypoints, photos, passes, width, overshoot }
 */
function generateCorridorCoordinates(layer, centerline, sPhoto = 20, altitude = 50, defaultGimbalPitch = -60, speed = 5.0, centerLat = 0, centerLon = 0) {
  const waypoints = [];
  const photos = [];

  const rawWidth = layer ? (layer.corridorWidth !== undefined ? layer.corridorWidth : 60) : 60;
  const width = Math.max(0, parseFloat(rawWidth) || 60);

  const rawPasses = layer ? (layer.corridorPasses !== undefined ? layer.corridorPasses : 3) : 3;
  const numPasses = Math.max(1, parseInt(rawPasses, 10) || 3);

  const rawOvershoot = layer ? (layer.corridorOvershoot !== undefined ? layer.corridorOvershoot : 20) : 20;
  const overshoot = Math.max(0, parseFloat(rawOvershoot) || 0);

  const turnType = (layer && layer.corridorTurnType) ? layer.corridorTurnType : 'bulb'; // 'bulb', 'arc', 'direct'
  const headingMode = (layer && layer.corridorHeadingMode) ? layer.corridorHeadingMode : 'path'; // 'path', 'centerline', 'fixed'

  const resolvedPitch = (defaultGimbalPitch !== undefined && defaultGimbalPitch !== null && !isNaN(defaultGimbalPitch))
    ? defaultGimbalPitch
    : (layer && layer.gimbalPitch !== undefined && layer.gimbalPitch !== null && !isNaN(layer.gimbalPitch))
      ? layer.gimbalPitch
      : -60;
  const pitch = Math.max(-90, Math.min(60, resolvedPitch));

  // Validate or fallback centerline points
  let poly = [];
  if (Array.isArray(centerline) && centerline.length >= 2) {
    poly = centerline.map((pt, idx) => {
      let x = pt.x;
      let y = pt.y;
      if (x === undefined || y === undefined || isNaN(x) || isNaN(y)) {
        if (typeof geodeticToLocal === 'function' && pt.lat != null && pt.lon != null) {
          const off = geodeticToLocal(pt.lat, pt.lon, centerLat, centerLon);
          x = off.x;
          y = off.y;
        } else {
          x = idx * 50;
          y = 0;
        }
      }
      return { x, y, lat: pt.lat, lon: pt.lon };
    });
  } else {
    // Default 3-node polyline
    poly = [
      { x: -60, y: -35 },
      { x: 0, y: 0 },
      { x: 60, y: 45 }
    ];
  }

  // Deduplicate consecutive identical vertices
  const cleanPoly = [];
  for (let i = 0; i < poly.length; i++) {
    if (i === 0) {
      cleanPoly.push(poly[i]);
    } else {
      const prev = cleanPoly[cleanPoly.length - 1];
      const d = Math.hypot(poly[i].x - prev.x, poly[i].y - prev.y);
      if (d > 0.001) {
        cleanPoly.push(poly[i]);
      }
    }
  }
  if (cleanPoly.length < 2) {
    cleanPoly.push({ x: cleanPoly[0].x + 50, y: cleanPoly[0].y + 50 });
  }

  const M = cleanPoly.length;

  // Compute segment direction vectors segV and segment normals segN
  const segV = []; // unit direction vectors
  const segN = []; // unit left normal vectors (-vy, vx)
  for (let i = 0; i < M - 1; i++) {
    const dx = cleanPoly[i + 1].x - cleanPoly[i].x;
    const dy = cleanPoly[i + 1].y - cleanPoly[i].y;
    const len = Math.hypot(dx, dy);
    const vx = len > 0 ? dx / len : 1;
    const vy = len > 0 ? dy / len : 0;
    segV.push({ vx, vy, len });
    segN.push({ nx: -vy, ny: vx });
  }

  // Compute vertex bisector normal vectors and clamped miter factors (max 2.5)
  const vNormals = [];
  for (let i = 0; i < M; i++) {
    if (i === 0) {
      vNormals.push({ mx: segN[0].nx, my: segN[0].ny, miter: 1.0 });
    } else if (i === M - 1) {
      vNormals.push({ mx: segN[M - 2].nx, my: segN[M - 2].ny, miter: 1.0 });
    } else {
      const nPrev = segN[i - 1];
      const nCurr = segN[i];
      const bx = nPrev.nx + nCurr.nx;
      const by = nPrev.ny + nCurr.ny;
      const bLen = Math.hypot(bx, by);
      if (bLen < 1e-4) {
        // Nearly 180° hairpin bend fallback
        vNormals.push({ mx: nPrev.nx, my: nPrev.ny, miter: 1.0 });
      } else {
        const mx = bx / bLen;
        const my = by / bLen;
        const dot = mx * nCurr.nx + my * nCurr.ny;
        let miter = (dot > 0.05) ? (1.0 / dot) : 2.5;
        if (miter > 2.5) miter = 2.5;
        if (miter < 0.5) miter = 0.5;
        vNormals.push({ mx, my, miter });
      }
    }
  }

  // Calculate parallel swath offsets
  // Offset_k = (k - (N - 1) / 2) * S_line
  const swathSpacing = (numPasses > 1) ? (width / (numPasses - 1)) : 0;
  const swathOffsets = [];
  for (let k = 0; k < numPasses; k++) {
    const off = (k - (numPasses - 1) / 2.0) * swathSpacing;
    swathOffsets.push(off);
  }

  // Helper to calculate heading angle from (dx, dy)
  const calcHeading = (dx, dy) => {
    return Math.round(((Math.atan2(dx, dy) * 180.0 / Math.PI) + 360.0) % 360.0 * 10) / 10;
  };

  // Helper to compute overall centerline heading
  const overallCenterlineHeading = calcHeading(cleanPoly[M - 1].x - cleanPoly[0].x, cleanPoly[M - 1].y - cleanPoly[0].y);

  // Generate each pass
  const passSwaths = [];

  for (let k = 0; k < numPasses; k++) {
    const offDist = swathOffsets[k];
    const isForward = (k % 2 === 0);

    // Build the list of survey points for this swath
    const swathVerts = [];
    for (let i = 0; i < M; i++) {
      const vn = vNormals[i];
      const px = cleanPoly[i].x + offDist * vn.miter * vn.mx;
      const py = cleanPoly[i].y + offDist * vn.miter * vn.my;
      swathVerts.push({ x: px, y: py, vertIdx: i });
    }

    const vStart = segV[0];
    const nStart = segN[0];
    const vEnd = segV[M - 2];
    const nEnd = segN[M - 2];

    const startOvershootPt = {
      x: cleanPoly[0].x - overshoot * vStart.vx + offDist * nStart.nx,
      y: cleanPoly[0].y - overshoot * vStart.vy + offDist * nStart.ny,
      isTurnaroundPoint: true,
      skipPhoto: true,
      isTransition: true,
      turnMode: 'curved',
      pathMode: 'curved'
    };

    const endOvershootPt = {
      x: cleanPoly[M - 1].x + overshoot * vEnd.vx + offDist * nEnd.nx,
      y: cleanPoly[M - 1].y + overshoot * vEnd.vy + offDist * nEnd.ny,
      isTurnaroundPoint: true,
      skipPhoto: true,
      isTransition: true,
      turnMode: 'curved',
      pathMode: 'curved'
    };

    const passPoints = [];

    if (isForward) {
      if (overshoot > 0) {
        passPoints.push(startOvershootPt);
      }
      for (let i = 0; i < M; i++) {
        const curV = swathVerts[i];
        passPoints.push({
          x: curV.x,
          y: curV.y,
          isSurvey: true,
          vertIdx: i
        });

        if (i < M - 1 && sPhoto > 0) {
          const nextV = swathVerts[i + 1];
          const segDist = Math.hypot(nextV.x - curV.x, nextV.y - curV.y);
          if (segDist > sPhoto * 1.25) {
            const steps = Math.floor(segDist / sPhoto);
            for (let s = 1; s <= steps; s++) {
              const frac = (s * sPhoto) / segDist;
              if (frac < 0.95) {
                passPoints.push({
                  x: curV.x + frac * (nextV.x - curV.x),
                  y: curV.y + frac * (nextV.y - curV.y),
                  isSurvey: true,
                  isIntermediate: true
                });
              }
            }
          }
        }
      }
      if (overshoot > 0) {
        passPoints.push(endOvershootPt);
      }
    } else {
      if (overshoot > 0) {
        passPoints.push(endOvershootPt);
      }
      for (let i = M - 1; i >= 0; i--) {
        const curV = swathVerts[i];
        passPoints.push({
          x: curV.x,
          y: curV.y,
          isSurvey: true,
          vertIdx: i
        });

        if (i > 0 && sPhoto > 0) {
          const prevV = swathVerts[i - 1];
          const segDist = Math.hypot(prevV.x - curV.x, prevV.y - curV.y);
          if (segDist > sPhoto * 1.25) {
            const steps = Math.floor(segDist / sPhoto);
            for (let s = 1; s <= steps; s++) {
              const frac = (s * sPhoto) / segDist;
              if (frac < 0.95) {
                passPoints.push({
                  x: curV.x + frac * (prevV.x - curV.x),
                  y: curV.y + frac * (prevV.y - curV.y),
                  isSurvey: true,
                  isIntermediate: true
                });
              }
            }
          }
        }
      }
      if (overshoot > 0) {
        passPoints.push(startOvershootPt);
      }
    }

    passSwaths.push({
      k,
      isForward,
      offDist,
      points: passPoints,
      startOvershootPt,
      endOvershootPt
    });
  }

  // Connect passes with turnaround transitions
  for (let k = 0; k < numPasses; k++) {
    const currentPass = passSwaths[k];
    const pts = currentPass.points;

    for (let pIdx = 0; pIdx < pts.length; pIdx++) {
      const cur = pts[pIdx];

      let hAngle = 0;
      if (headingMode === 'fixed') {
        hAngle = (layer && layer.customHeading !== undefined) ? parseInt(layer.customHeading, 10) || 0 : 0;
      } else if (headingMode === 'centerline') {
        hAngle = currentPass.isForward ? overallCenterlineHeading : (overallCenterlineHeading + 180) % 360;
      } else {
        if (pIdx < pts.length - 1) {
          hAngle = calcHeading(pts[pIdx + 1].x - cur.x, pts[pIdx + 1].y - cur.y);
        } else if (pIdx > 0) {
          hAngle = calcHeading(cur.x - pts[pIdx - 1].x, cur.y - pts[pIdx - 1].y);
        } else {
          hAngle = currentPass.isForward ? overallCenterlineHeading : (overallCenterlineHeading + 180) % 360;
        }
      }

      const wp = {
        x: Math.round(cur.x * 100) / 100,
        y: Math.round(cur.y * 100) / 100,
        alt: Math.round(altitude * 10) / 10,
        pitch: pitch,
        heading: hAngle,
        headingMode: 'smoothTransition',
        turnMode: cur.turnMode || 'toPointAndStopWithContinuityCurvature',
        pathMode: cur.pathMode,
        speed: speed,
        gridType: 'corridor',
        layerPattern: 'corridor',
        isCorridor: true,
        passIndex: k,
        skipPhoto: !!cur.skipPhoto,
        isTurnaroundPoint: !!cur.isTurnaroundPoint,
        isTransition: !!cur.isTransition,
        vertIdx: cur.vertIdx
      };

      waypoints.push(wp);

      if (cur.isSurvey && !cur.skipPhoto) {
        photos.push({
          x: wp.x,
          y: wp.y,
          alt: wp.alt,
          pitch: wp.pitch,
          heading: wp.heading,
          gridType: 'corridor',
          passIndex: k
        });
      }
    }

    // Turnaround transition to next pass
    if (k < numPasses - 1) {
      const nextPass = passSwaths[k + 1];
      const exitPt = pts[pts.length - 1];
      const entryPt = nextPass.points[0];

      const dx = entryPt.x - exitPt.x;
      const dy = entryPt.y - exitPt.y;
      const dSep = Math.hypot(dx, dy);

      const exitTangent = currentPass.isForward
        ? { tx: segV[M - 2].vx, ty: segV[M - 2].vy }
        : { tx: -segV[0].vx, ty: -segV[0].vy };

      const latVec = dSep > 0.001 ? { lx: dx / dSep, ly: dy / dSep } : { lx: 1, ly: 0 };

      if (turnType === 'direct') {
        const midPt = {
          x: Math.round(((exitPt.x + entryPt.x) / 2.0) * 100) / 100,
          y: Math.round(((exitPt.y + entryPt.y) / 2.0) * 100) / 100,
          alt: Math.round(altitude * 10) / 10,
          pitch: pitch,
          heading: calcHeading(dx, dy),
          headingMode: 'smoothTransition',
          turnMode: 'curved',
          pathMode: 'curved',
          speed: speed,
          gridType: 'corridor',
          layerPattern: 'corridor',
          isCorridor: true,
          isTransition: true,
          skipPhoto: true
        };
        waypoints.push(midPt);
      } else if (turnType === 'arc') {
        const mx = (exitPt.x + entryPt.x) / 2.0;
        const my = (exitPt.y + entryPt.y) / 2.0;
        const radius = Math.max(8, dSep / 2.0);
        const arcSteps = 3;
        for (let s = 1; s <= arcSteps; s++) {
          const angle = (Math.PI / (arcSteps + 1)) * s;
          const px = mx - (dSep / 2.0) * Math.cos(angle) * latVec.lx + radius * Math.sin(angle) * exitTangent.tx;
          const py = my - (dSep / 2.0) * Math.cos(angle) * latVec.ly + radius * Math.sin(angle) * exitTangent.ty;

          const arcPt = {
            x: Math.round(px * 100) / 100,
            y: Math.round(py * 100) / 100,
            alt: Math.round(altitude * 10) / 10,
            pitch: pitch,
            heading: calcHeading(exitTangent.tx, exitTangent.ty),
            headingMode: 'smoothTransition',
            turnMode: 'curved',
            pathMode: 'curved',
            speed: speed,
            gridType: 'corridor',
            layerPattern: 'corridor',
            isCorridor: true,
            isTransition: true,
            skipPhoto: true
          };
          waypoints.push(arcPt);
        }
      } else {
        // 'bulb' teardrop turnaround loop
        const extDist = Math.max(15, dSep * 0.7);
        const p1x = exitPt.x + extDist * 0.5 * exitTangent.tx - 0.25 * dSep * latVec.lx;
        const p1y = exitPt.y + extDist * 0.5 * exitTangent.ty - 0.25 * dSep * latVec.ly;

        const mx = (exitPt.x + entryPt.x) / 2.0;
        const my = (exitPt.y + entryPt.y) / 2.0;
        const p2x = mx + extDist * 1.1 * exitTangent.tx;
        const p2y = my + extDist * 1.1 * exitTangent.ty;

        const p3x = entryPt.x + extDist * 0.5 * exitTangent.tx + 0.25 * dSep * latVec.lx;
        const p3y = entryPt.y + extDist * 0.5 * exitTangent.ty + 0.25 * dSep * latVec.ly;

        const loopPoints = [
          { x: p1x, y: p1y },
          { x: p2x, y: p2y },
          { x: p3x, y: p3y }
        ];

        loopPoints.forEach((lp, lIdx) => {
          let nextLp = (lIdx < loopPoints.length - 1) ? loopPoints[lIdx + 1] : entryPt;
          waypoints.push({
            x: Math.round(lp.x * 100) / 100,
            y: Math.round(lp.y * 100) / 100,
            alt: Math.round(altitude * 10) / 10,
            pitch: pitch,
            heading: calcHeading(nextLp.x - lp.x, nextLp.y - lp.y),
            headingMode: 'smoothTransition',
            turnMode: 'curved',
            pathMode: 'curved',
            speed: speed,
            gridType: 'corridor',
            layerPattern: 'corridor',
            isCorridor: true,
            isTransition: true,
            skipPhoto: true
          });
        });
      }
    }
  }

  return {
    waypoints,
    photos,
    passes: numPasses,
    width,
    overshoot
  };
}

if (typeof window !== 'undefined') {
  window.generateLightArtCoordinates = generateLightArtCoordinates;
  window.generateVerticalFacadeCoordinates = generateVerticalFacadeCoordinates;
  window.generateHelixCoordinates = generateHelixCoordinates;
  window.generateStarPassCoordinates = generateStarPassCoordinates;
  window.generateCorridorCoordinates = generateCorridorCoordinates;
}
