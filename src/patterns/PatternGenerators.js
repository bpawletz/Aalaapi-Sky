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
  let count = 0;
  if (r1 && r1.checked) count += 12;
  if (r2 && r2.checked) count += 12;
  if (r3 && r3.checked) count += 12;
  if (rNadir && rNadir.checked) count += 1;
  badge.textContent = `${count} Shot${count === 1 ? '' : 's'} Total`;
}

// Generate 360° Photo Sphere coordinates (Issue #89, v1.125.1)
// Supports selective elevation rings (Row 1: -15°, Row 2: -45°, Row 3: -75°, Nadir: -90°)
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

  const rows = [];
  if (rings.ring1) rows.push({ pitch: -15, count: 12, step: 30, ringIndex: 0 });
  if (rings.ring2) rows.push({ pitch: -45, count: 12, step: 30, ringIndex: 1 });
  if (rings.ring3) rows.push({ pitch: -75, count: 12, step: 30, ringIndex: 2 });

  let shotIndex = 0;
  rows.forEach(row => {
    for (let i = 0; i < row.count; i++) {
      const heading = (i * row.step) % 360;
      const pt = {
        x: 0,
        y: 0,
        alt: baseAltitude,
        pitch: row.pitch,
        heading: heading,
        headingMode: 'smoothTransition',
        gridType: 'photo-sphere',
        isPhotoSpherePoint: true,
        ringIndex: row.ringIndex,
        isRingStart: (i === 0),
        shotIndex: shotIndex++,
        hoverTime: 2
      };
      waypoints.push(pt);
      photos.push(pt);
    }
  });

  // Nadir Catch: 1 final ground-lock shot at -90° pitch
  if (rings.nadir) {
    const nadirPt = {
      x: 0,
      y: 0,
      alt: baseAltitude,
      pitch: -90,
      heading: 0,
      headingMode: 'smoothTransition',
      gridType: 'photo-sphere',
      isPhotoSpherePoint: true,
      ringIndex: 3,
      isRingStart: true,
      shotIndex: shotIndex++,
      hoverTime: 2
    };
    waypoints.push(nadirPt);
    photos.push(nadirPt);
  }

  return { waypoints, photos };
}

// ============================================================================
// Hyperlapse Moving Time-Lapse Pattern Generator (v1.146.0 - Closes #102)
// ============================================================================
function generateHyperlapseWaypoints(rawWps, layer, speed, altitude) {
  if (!rawWps || !Array.isArray(rawWps) || rawWps.length === 0) {
    return { waypoints: [], framePoints: [], interval: 3, frameSpacing: 0 };
  }

  const rawInterval = layer ? layer.hyperlapseInterval : 3;
  let interval = parseInt(rawInterval, 10);
  if (isNaN(interval) || interval < 2) interval = 2;
  if (interval > 10) interval = 10;

  const layerPitch = (layer && layer.gimbalPitch !== undefined && layer.gimbalPitch !== 'auto' && !isNaN(layer.gimbalPitch))
    ? parseInt(layer.gimbalPitch, 10)
    : -60;

  const rawStart = (layer && layer.hyperlapseStartPitch !== undefined && !isNaN(layer.hyperlapseStartPitch)) ? parseInt(layer.hyperlapseStartPitch, 10) : null;
  const rawEnd = (layer && layer.hyperlapseEndPitch !== undefined && !isNaN(layer.hyperlapseEndPitch)) ? parseInt(layer.hyperlapseEndPitch, 10) : null;
  const hasCustomSweep = (rawStart !== null && rawEnd !== null && rawStart !== rawEnd);
  const startPitch = hasCustomSweep ? rawStart : (rawStart !== null && rawStart !== -15 ? rawStart : layerPitch);
  const endPitch = hasCustomSweep ? rawEnd : (rawEnd !== null && rawEnd !== -15 ? rawEnd : layerPitch);

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

  // Generate per-waypoint parameters
  const waypoints = rawWps.map((wp, idx) => {
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
  const effectiveSpeed = Math.max(0.2, speed || 4);
  const frameSpacing = Math.max(0.2, effectiveSpeed * interval);

  if (waypoints.length >= 2 && totalDist > 0) {
    let currentDist = 0;
    while (currentDist <= totalDist + 0.01) {
      let segIdx = 0;
      while (segIdx < cumDists.length - 2 && cumDists[segIdx + 1] < currentDist) {
        segIdx++;
      }
      const pA = waypoints[segIdx];
      const pB = waypoints[segIdx + 1] || pA;
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
      } else {
        fPitch = Math.round(startPitch + (endPitch - startPitch) * globalT);
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
  }

  return { waypoints, framePoints, interval, frameSpacing };
}

// ============================================================================
// Target Splat 3D Frustum Culling & Geometry Engine (v1.77.0)
// ============================================================================

