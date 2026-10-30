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

// ============================================================================
// 360° Spherical Panorama Stationary Capture Engine (v1.157.0 - Issue #134 Update)
// Upward Zenith Sky Capture, Multi-Tier AEB (1x/3x/5x), FOV Overlap & Duration
// ============================================================================

function calculatePhotoSphereOverlap(shotsPerRing = 12, hfov = 82.1, vfov = 52.6) {
  const step = 360.0 / Math.max(1, shotsPerRing);
  const horizOverlap = Math.max(0, Math.min(99, Math.round((1.0 - (step / hfov)) * 100)));
  const vertPitchDelta = 30.0; // Standard 30° row spacing
  const vertOverlap = Math.max(0, Math.min(99, Math.round((1.0 - (vertPitchDelta / vfov)) * 100)));
  let quality = 'Adequate';
  if (horizOverlap >= 65 && vertOverlap >= 40) quality = 'Optimal';
  else if (horizOverlap <= 45 || vertOverlap < 30) quality = 'Marginal';
  return { horizOverlap, vertOverlap, quality, step };
}

function estimatePhotoSphereDuration(totalPositions, aebMultiplier = 1, settlingTime = 2.0, shotsPerRing = 12) {
  const step = 360.0 / Math.max(1, shotsPerRing);
  const yawTimePerShot = Math.max(0.6, step / 35.0); // ~35 deg/sec yaw speed
  const shutterTimePerExposure = 0.7; // shutter trigger + write buffer
  const exposureTime = shutterTimePerExposure * aebMultiplier;
  const timePerPosition = yawTimePerShot + settlingTime + exposureTime;
  const totalSeconds = Math.round(totalPositions * timePerPosition + 12); // +12s setup/climb
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  const durationText = `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
  const batteryPct = Math.min(95, Math.max(1, Math.round((totalSeconds / 60) * 3.4)));
  return { totalSeconds, durationText, batteryPct };
}

function updatePhotoSphereBadge() {
  if (typeof document === 'undefined') return;
  const badge = document.getElementById('photo-sphere-shot-count-badge');
  const rZenith = document.getElementById('photo-sphere-ring-zenith');
  const r1 = document.getElementById('photo-sphere-ring-1');
  const r2 = document.getElementById('photo-sphere-ring-2');
  const r3 = document.getElementById('photo-sphere-ring-3');
  const rNadir = document.getElementById('photo-sphere-ring-nadir');
  const shotsSelect = document.getElementById('photo-sphere-shots-per-ring');
  const settlingSlider = document.getElementById('photo-sphere-settling-time');
  const aebSelect = document.getElementById('photo-sphere-aeb-mode') || document.getElementById('photo-sphere-aeb');
  
  const shots = shotsSelect ? (parseInt(shotsSelect.value, 10) || 12) : 12;
  const settling = settlingSlider ? (parseFloat(settlingSlider.value) || 2.0) : 2.0;
  
  let aebMode = 'none';
  let aebMultiplier = 1;
  if (aebSelect) {
    if (aebSelect.tagName === 'SELECT') {
      aebMode = aebSelect.value || 'none';
      aebMultiplier = (aebMode === '5') ? 5 : (aebMode === '3' ? 3 : 1);
    } else if (aebSelect.type === 'checkbox') {
      aebMode = aebSelect.checked ? '3' : 'none';
      aebMultiplier = aebSelect.checked ? 3 : 1;
    }
  }

  let positions = 0;
  if (rZenith && rZenith.checked) positions += shots;
  if (r1 && r1.checked) positions += shots;
  if (r2 && r2.checked) positions += shots;
  if (r3 && r3.checked) positions += shots;
  if (rNadir && rNadir.checked) positions += 1;

  const totalRawPhotos = positions * aebMultiplier;
  
  if (badge) {
    if (aebMultiplier > 1) {
      badge.textContent = `${positions} Positions (${totalRawPhotos} Photos - ${aebMultiplier}x AEB)`;
    } else {
      badge.textContent = `${positions} Shot${positions === 1 ? '' : 's'} Total`;
    }
  }

  // Update Overlap Advisor & Duration Metrics
  const overlapInfo = calculatePhotoSphereOverlap(shots);
  const overlapEl = document.getElementById('photo-sphere-overlap-advisor');
  if (overlapEl) {
    overlapEl.textContent = `Overlap: ${overlapInfo.horizOverlap}% Horiz / ${overlapInfo.vertOverlap}% Vert (${overlapInfo.quality})`;
    overlapEl.style.color = overlapInfo.quality === 'Optimal' ? '#34d399' : (overlapInfo.quality === 'Marginal' ? '#f59e0b' : '#38bdf8');
  }

  const durationInfo = estimatePhotoSphereDuration(positions, aebMultiplier, settling, shots);
  const durationBadge = document.getElementById('photo-sphere-duration-badge');
  if (durationBadge) {
    durationBadge.textContent = `⏱️ ${durationInfo.durationText} | ~${durationInfo.batteryPct}% Battery`;
  }
}

// Generate 360° Photo Sphere coordinates (v1.157.0 - Issue #134 Expansion)
// Supports Zenith Sky (+20°), selective elevation rings, configurable shots per ring, multi-tier AEB, and stationary action groups
function generatePhotoSphereCoordinates(baseAltitude, layer) {
  const waypoints = [];
  const photos = [];

  let rings = (layer && layer.photoSphereRings) ? layer.photoSphereRings : null;
  if (!rings && typeof document !== 'undefined') {
    const rZenith = document.getElementById('photo-sphere-ring-zenith');
    const r1 = document.getElementById('photo-sphere-ring-1');
    const r2 = document.getElementById('photo-sphere-ring-2');
    const r3 = document.getElementById('photo-sphere-ring-3');
    const rNadir = document.getElementById('photo-sphere-ring-nadir');
    if ((rZenith && typeof rZenith.checked === 'boolean') || (r1 && typeof r1.checked === 'boolean') || (r2 && typeof r2.checked === 'boolean') || (r3 && typeof r3.checked === 'boolean') || (rNadir && typeof rNadir.checked === 'boolean')) {
      rings = {
        zenith: rZenith && typeof rZenith.checked === 'boolean' ? rZenith.checked : false,
        ring1: r1 && typeof r1.checked === 'boolean' ? r1.checked : true,
        ring2: r2 && typeof r2.checked === 'boolean' ? r2.checked : true,
        ring3: r3 && typeof r3.checked === 'boolean' ? r3.checked : true,
        nadir: rNadir && typeof rNadir.checked === 'boolean' ? rNadir.checked : true
      };
    }
  }
  if (!rings) {
    rings = { zenith: false, ring1: true, ring2: true, ring3: true, nadir: true };
  }

  // Fallback safety: ensure at least one ring is active
  if (!rings.zenith && !rings.ring1 && !rings.ring2 && !rings.ring3 && !rings.nadir) {
    rings.ring1 = true;
  }

  const rawShots = (layer && layer.photoSphereShotsPerRing !== undefined) ? Number(layer.photoSphereShotsPerRing) : 12;
  const shotsPerRing = Math.max(6, Math.min(36, isNaN(rawShots) ? 12 : rawShots));
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

  // Multi-tier AEB mode: 'none' (1x), '3' (3-shot), '5' (5-shot)
  let aebMode = null;
  if (layer && layer.photoSphereAebMode && layer.photoSphereAebMode !== 'none') {
    aebMode = String(layer.photoSphereAebMode);
  } else if (layer && layer.photoSphereAebEnabled) {
    aebMode = (layer.photoSphereAebMode === '5') ? '5' : '3';
  } else if (layer && layer.photoSphereAebMode === 'none' && layer.photoSphereAebEnabled === false) {
    aebMode = 'none';
  }
  if (!aebMode && typeof document !== 'undefined') {
    const psAebSelect = document.getElementById('photo-sphere-aeb-mode');
    if (psAebSelect && psAebSelect.value) {
      aebMode = psAebSelect.value;
    } else {
      const psAeb = document.getElementById('photo-sphere-aeb');
      if (psAeb && typeof psAeb.checked === 'boolean') {
        aebMode = psAeb.checked ? '3' : 'none';
      }
    }
  }
  if (!aebMode) {
    aebMode = 'none';
  }
  const aebMultiplier = (aebMode === '5') ? 5 : (aebMode === '3' ? 3 : 1);
  const aebEnabled = (aebMultiplier > 1);

  const zenithPitch = (layer && layer.photoSphereZenithPitch !== undefined) ? Number(layer.photoSphereZenithPitch) : 20.0;

  const rows = [];
  if (rings.zenith) rows.push({ pitch: zenithPitch, count: shotsPerRing, step: step, ringIndex: -1, isZenith: true });
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
        isZenith: Boolean(row.isZenith),
        shotIndex: shotIndex++,
        hoverTime: settlingTime,
        aebEnabled: aebEnabled,
        aebMode: aebMode,
        aebMultiplier: aebMultiplier
      };
      allActions.push(actionItem);

      const pt = {
        x: 0,
        y: 0,
        alt: baseAltitude,
        pitch: row.pitch,
        gimbalPitch: row.pitch,
        heading: heading,
        headingMode: 'smoothTransition',
        gridType: 'photo-sphere',
        layerPattern: 'photo-sphere',
        isPhotoSpherePoint: true,
        ringIndex: row.ringIndex,
        isZenith: Boolean(row.isZenith),
        isRingStart: (i === 0),
        shotIndex: actionItem.shotIndex,
        hoverTime: settlingTime,
        cameraAction: 'takePhoto',
        photoSphereMode: mode,
        aebEnabled: aebEnabled,
        aebMode: aebMode,
        aebMultiplier: aebMultiplier
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
      isZenith: false,
      shotIndex: shotIndex++,
      hoverTime: settlingTime,
      aebEnabled: aebEnabled,
      aebMode: aebMode,
      aebMultiplier: aebMultiplier
    };
    allActions.push(nadirAction);

    const nadirPt = {
      x: 0,
      y: 0,
      alt: baseAltitude,
      pitch: -90,
      gimbalPitch: -90,
      heading: 0,
      headingMode: 'smoothTransition',
      gridType: 'photo-sphere',
      layerPattern: 'photo-sphere',
      isPhotoSpherePoint: true,
      ringIndex: 3,
      isZenith: false,
      isRingStart: true,
      shotIndex: nadirAction.shotIndex,
      hoverTime: settlingTime,
      cameraAction: 'takePhoto',
      photoSphereMode: mode,
      aebEnabled: aebEnabled,
      aebMode: aebMode,
      aebMultiplier: aebMultiplier
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
      pitch: rows.length > 0 ? rows[0].pitch : -15,
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
      totalRawPhotos: allActions.length * aebMultiplier,
      aebEnabled: aebEnabled,
      aebMode: aebMode,
      aebMultiplier: aebMultiplier,
      hasZenithRing: Boolean(rings.zenith)
    });
  }

  const overlapMetrics = calculatePhotoSphereOverlap(shotsPerRing);
  const durationMetrics = estimatePhotoSphereDuration(allActions.length, aebMultiplier, settlingTime, shotsPerRing);

  return {
    waypoints,
    photos,
    totalShots: allActions.length,
    totalRawPhotos: allActions.length * aebMultiplier,
    mode,
    overlap: overlapMetrics,
    duration: durationMetrics,
    hasZenith: Boolean(rings.zenith)
  };
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

  // Continuous 3D Oblique Canvas Tilt:
  //   tilt = 0: Horizontal plane (overhead)
  //   tilt = 90: Vertical Billboard standing upright facing cameraAzimuth
  //   tilt in (0, 90): Oblique plane tilted back towards observer bearing
  let tilt = 0;
  if (layer && typeof layer.lightArtTilt === 'number' && !isNaN(layer.lightArtTilt)) {
    tilt = Math.max(0, Math.min(90, layer.lightArtTilt));
  } else if (orientation === 'vertical') {
    tilt = 90;
  } else {
    tilt = 0;
  }

  // Minimum Safe Ground Clearance Deck (default 10m, pilot configurable)
  const minClearance = (layer && typeof layer.lightArtMinClearance === 'number' && layer.lightArtMinClearance >= 0)
    ? layer.lightArtMinClearance
    : 10;
  const enforceClearance = !!(layer && layer.lightArtEnforceClearance);

  // Observer Bearing (Ground Camera Azimuth in degrees 0-359)
  const radAz = (cameraAzimuth * Math.PI) / 180.0;
  const radTilt = (tilt * Math.PI) / 180.0;
  const cosTilt = Math.cos(radTilt);
  const sinTilt = Math.sin(radTilt);
  const cosAz = Math.cos(radAz);
  const sinAz = Math.sin(radAz);

  // Determine vertical extent of artwork across stroke points to check ground clearance
  let minRawV = 0;
  rawPoints.forEach(pt => {
    if (pt.v < minRawV) minRawV = pt.v;
  });
  const minStrokeV = (tilt > 0) ? minRawV : 0;
  const rawMinArtAlt = baseAltitude + minStrokeV * sinTilt;
  const hasClearanceWarning = (tilt > 0) && (rawMinArtAlt < minClearance);
  const recommendedBaseAltitude = Math.max(minClearance, Math.ceil(minClearance - minStrokeV * sinTilt));

  // Effective Base Altitude (auto-elevates if enforcement is active)
  let effectiveBaseAltitude = baseAltitude;
  if (enforceClearance && hasClearanceWarning) {
    effectiveBaseAltitude = recommendedBaseAltitude;
  }

  let totalDistance = 0;
  let prevPt = null;

  rawPoints.forEach((pt, idx) => {
    let x, y, alt;
    if (tilt === 0 && (orientation === 'horizontal' || !orientation) && cameraAzimuth === 0) {
      // Direct legacy horizontal mode:
      x = pt.u;
      y = pt.v;
      alt = Math.max(minClearance, effectiveBaseAltitude + pt.zOffset);
    } else {
      // 3D Oblique Canvas Tilt:
      // u is transverse (cross-track) across observer sightline
      // v is longitudinal along the canvas plane, tilted by angle theta relative to ground
      const vGround = pt.v * cosTilt;
      const vAlt = pt.v * sinTilt;

      // Project onto ground coordinates (x, y) aligned with camera bearing:
      x = pt.u * cosAz + vGround * sinAz;
      y = -pt.u * sinAz + vGround * cosAz;
      alt = Math.max(minClearance, effectiveBaseAltitude + vAlt + pt.zOffset);
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
    orientation,
    tilt,
    cameraAzimuth,
    minClearance,
    minArtAlt: Math.round(rawMinArtAlt * 10) / 10,
    hasClearanceWarning,
    recommendedBaseAltitude,
    enforceClearance,
    effectiveBaseAltitude
  };
}

/**
 * Automatically calculates the physical canvas radius (in meters) required to achieve
 * a target exposure or flight duration (in seconds) for a given Light Art pattern.
 *
 * @param {Object} layer - The light-art flight layer configuration
 * @param {number} targetDurationSec - Target flight / shutter duration in seconds
 * @param {number} strokeSpeed - Flight speed in m/s (optional, defaults to layer speed or 3.0 m/s)
 * @returns {number} Calculated radius in meters (clamped between 5m and 200m)
 */
function calculateLightArtRadiusForDuration(layer, targetDurationSec, strokeSpeed) {
  const speed = (layer && typeof layer.speed === 'number' && layer.speed > 0) ? layer.speed : (strokeSpeed || 3.0);
  const targetTime = Math.max(5, parseFloat(targetDurationSec) || 60);
  const targetDist = speed * targetTime;
  const preset = (layer && layer.lightArtPreset) ? layer.lightArtPreset : 'spiral';
  const turns = (layer && typeof layer.lightArtTurns === 'number' && layer.lightArtTurns > 0) ? layer.lightArtTurns : 3;
  const climb = (layer && typeof layer.lightArtClimb === 'number') ? layer.lightArtClimb : 15;

  let rEst = 25;
  if (preset === 'helix') {
    const minClimbDist = climb;
    if (targetDist <= minClimbDist) {
      rEst = 5;
    } else {
      const dh = Math.sqrt(Math.max(0, targetDist * targetDist - climb * climb));
      rEst = dh / (2 * Math.PI * turns);
    }
  } else {
    // Reference run at R = 25m
    const refLayer = Object.assign({}, layer, { lightArtRadius: 25 });
    const refRes = generateLightArtCoordinates(refLayer, 50, 0, speed);
    const refDist = Math.max(0.1, refRes.totalDistance);
    rEst = 25 * (targetDist / refDist);
  }

  // Refine with 1 second-pass evaluation to guarantee exact discretization match
  rEst = Math.max(5, Math.min(200, rEst));
  const evalLayer = Object.assign({}, layer, { lightArtRadius: rEst });
  const evalRes = generateLightArtCoordinates(evalLayer, 50, 0, speed);
  const evalDist = Math.max(0.1, evalRes.totalDistance);
  if (evalDist > 0 && Math.abs(evalDist - targetDist) > 0.5) {
    rEst = rEst * (targetDist / evalDist);
  }

  // Clamp within safe flight canvas bounds: 5m to 200m
  rEst = Math.max(5, Math.min(200, Math.round(rEst * 10) / 10));
  return rEst;
}

/**
 * Calculates the required flight speed (in m/s) to complete a given Light Art pattern
 * within a target flight / shutter duration at a fixed canvas radius.
 *
 * @param {Object} layer - The light-art flight layer configuration
 * @param {number} targetDurationSec - Target flight / shutter duration in seconds
 * @param {number} radius - Fixed canvas radius in meters (optional, defaults to layer radius)
 * @returns {number} Calculated speed in m/s (clamped between 0.5 m/s and 12.0 m/s)
 */
function calculateLightArtSpeedForDuration(layer, targetDurationSec, radius) {
  const targetTime = Math.max(5, parseFloat(targetDurationSec) || 60);
  const rad = (radius !== undefined && !isNaN(radius) && radius > 0) ? radius : ((layer && layer.lightArtRadius) || 25);
  const testLayer = Object.assign({}, layer, { lightArtRadius: rad });
  const testRes = generateLightArtCoordinates(testLayer, 50, 0, 3.0);
  const dist = Math.max(0.1, testRes.totalDistance);
  const speed = dist / targetTime;
  return Math.max(0.5, Math.min(12.0, Math.round(speed * 10) / 10));
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


/**
 * Issue #159: Hemispherical Dome / Geodesic Shell Flight Pattern (dome-shell)
 * Concentric orbital tiers spaced along a 3D hemisphere with constant radial standoff
 * from subject centroid and automatic inward radial gimbal pitch.
 */
function generateDomeShellCoordinates(layer, sPhoto, altitude, defaultGimbalPitch) {
  const waypoints = [];
  const photos = [];

  const radius = Math.max(5, layer && layer.domeRadius ? parseFloat(layer.domeRadius) : 40);
  const baseAlt = Math.max(0, layer && layer.domeBaseAlt !== undefined ? parseFloat(layer.domeBaseAlt) : 10);
  const nTiers = Math.max(2, Math.min(10, layer && layer.domeTiers ? parseInt(layer.domeTiers, 10) : 4));
  const minAngle = Math.max(5, Math.min(60, layer && layer.domeMinAngle !== undefined ? parseFloat(layer.domeMinAngle) : 20));
  const maxAngle = Math.max(minAngle + 5, Math.min(88, layer && layer.domeMaxAngle !== undefined ? parseFloat(layer.domeMaxAngle) : 80));
  const altOrder = (layer && layer.domeAltitudeOrder === 'min-to-max') ? 'min-to-max' : 'max-to-min';
  const hasCap = (layer && layer.domeZenithCap !== false);
  const speed = (layer && layer.speed !== undefined && layer.speed !== null) ? layer.speed : 4;
  const photoSpacing = Math.max(2, (typeof sPhoto === 'number' && !isNaN(sPhoto) && sPhoto > 0) ? sPhoto : 10);

  const calcHeading = (dx, dy) => {
    return Math.round(((Math.atan2(dx, dy) * 180.0 / Math.PI) + 360.0) % 360.0 * 10) / 10;
  };

  const tiersData = [];

  for (let k = 0; k < nTiers; k++) {
    const fraction = (nTiers > 1) ? (k / (nTiers - 1)) : 0.5;
    const thetaDeg = minAngle + fraction * (maxAngle - minAngle);
    const thetaRad = thetaDeg * Math.PI / 180.0;
    const rTier = radius * Math.cos(thetaRad);
    const altTier = baseAlt + radius * Math.sin(thetaRad);
    const pitchTier = -Math.round(thetaDeg * 10) / 10;

    const ringCircumference = 2 * Math.PI * rTier;
    const nPoints = Math.max(6, Math.round(ringCircumference / photoSpacing));
    const angularOffset = (k % 2 === 1) ? (Math.PI / nPoints) : 0; // Stagger alternate rings

    const ringWps = [];
    for (let j = 0; j < nPoints; j++) {
      const phi = (2 * Math.PI * j) / nPoints + angularOffset;
      const px = Math.round(rTier * Math.cos(phi) * 100) / 100;
      const py = Math.round(rTier * Math.sin(phi) * 100) / 100;
      const heading = calcHeading(-px, -py);

      const wp = {
        x: px,
        y: py,
        alt: Math.round(altTier * 10) / 10,
        pitch: pitchTier,
        gimbalPitch: pitchTier,
        heading: heading,
        headingMode: 'towardCenter',
        speed: speed,
        gridType: 'dome-shell',
        layerPattern: 'dome-shell',
        isRingStart: (j === 0),
        ringIndex: k,
        tierElevation: Math.round(thetaDeg)
      };
      ringWps.push(wp);
    }
    tiersData.push({ tierIndex: k, alt: altTier, points: ringWps });
  }

  // Optional Zenith Nadir Cap: x = 0, y = 0, z = baseAlt + radius, pitch = -90
  const zenithCapWp = {
    x: 0,
    y: 0,
    alt: Math.round((baseAlt + radius) * 10) / 10,
    pitch: -90,
    gimbalPitch: -90,
    heading: 0,
    headingMode: 'towardCenter',
    speed: speed,
    gridType: 'dome-shell',
    layerPattern: 'dome-shell',
    isZenithCap: true,
    ringIndex: nTiers
  };

  if (altOrder === 'max-to-min') {
    if (hasCap) {
      waypoints.push(zenithCapWp);
      photos.push({ ...zenithCapWp });
    }
    for (let i = tiersData.length - 1; i >= 0; i--) {
      tiersData[i].points.forEach(pt => {
        waypoints.push(pt);
        photos.push({ ...pt });
      });
    }
  } else {
    for (let i = 0; i < tiersData.length; i++) {
      tiersData[i].points.forEach(pt => {
        waypoints.push(pt);
        photos.push({ ...pt });
      });
    }
    if (hasCap) {
      waypoints.push(zenithCapWp);
      photos.push({ ...zenithCapWp });
    }
  }

  return { waypoints, photos };
}

/**
 * Issue #160: Custom Polygon Area Grid (polygon-grid)
 * Generates ray-clipped single or crosshatch lawn-mower survey lines inside an arbitrary polygon.
 */
function computeOptimalPolygonSweepAngle(vertices) {
  if (!Array.isArray(vertices) || vertices.length < 3) return 0;

  let minSpan = Infinity;
  let bestAngle = 0;

  // Test sweep angles in 5-degree increments from 0 to 175
  for (let deg = 0; deg < 180; deg += 5) {
    const rad = deg * Math.PI / 180.0;
    const sinA = Math.sin(rad);
    const cosA = Math.cos(rad);

    let minPerp = Infinity;
    let maxPerp = -Infinity;

    for (let i = 0; i < vertices.length; i++) {
      const v = vertices[i];
      const vx = (v.x !== undefined) ? v.x : 0;
      const vy = (v.y !== undefined) ? v.y : 0;
      const perp = -vx * sinA + vy * cosA;
      if (perp < minPerp) minPerp = perp;
      if (perp > maxPerp) maxPerp = perp;
    }

    const span = maxPerp - minPerp;
    if (span < minSpan) {
      minSpan = span;
      bestAngle = deg;
    }
  }

  return bestAngle;
}

function generatePolygonGridCoordinates(layer, sLine, sPhoto, altitude, defaultGimbalPitch, speed) {
  const waypoints = [];
  const photos = [];

  // Retrieve polygon vertices from layer or generate default regular polygon
  let vertices = (layer && Array.isArray(layer.polygonVertices) && layer.polygonVertices.length >= 3)
    ? layer.polygonVertices
    : ((layer && Array.isArray(layer.boundaryPolygon) && layer.boundaryPolygon.length >= 3)
      ? layer.boundaryPolygon
      : null);

  if (!vertices || vertices.length < 3) {
    const defaultRad = Math.max(25, ((layer && layer.gridWidth) ? layer.gridWidth : 100) / 2);
    vertices = [];
    const nDefault = 5;
    for (let i = 0; i < nDefault; i++) {
      const ang = (2 * Math.PI * i) / nDefault;
      vertices.push({ x: defaultRad * Math.cos(ang), y: defaultRad * Math.sin(ang) });
    }
  }

  const polyPts = vertices.map(v => ({
    x: (v.x !== undefined && !isNaN(v.x)) ? v.x : 0,
    y: (v.y !== undefined && !isNaN(v.y)) ? v.y : 0
  }));

  let sweepAngle = (layer && layer.polygonGridAngle !== undefined && layer.polygonGridAngle !== 'auto')
    ? parseFloat(layer.polygonGridAngle)
    : (layer && layer.gridRotation !== undefined ? layer.gridRotation : 0);

  if (layer && (layer.polygonGridAngle === 'auto' || isNaN(sweepAngle))) {
    sweepAngle = computeOptimalPolygonSweepAngle(polyPts);
  }

  const passMode = (layer && layer.polygonGridPass === 'double') ? 'double' : 'single';
  const lineSpacing = Math.max(5, (typeof sLine === 'number' && !isNaN(sLine) && sLine > 0) ? sLine : 15);
  const photoSpacing = Math.max(3, (typeof sPhoto === 'number' && !isNaN(sPhoto) && sPhoto > 0) ? sPhoto : 10);
  const alt = Math.max(5, (typeof altitude === 'number' && !isNaN(altitude)) ? altitude : 50);
  const pitch = (typeof defaultGimbalPitch === 'number' && !isNaN(defaultGimbalPitch)) ? defaultGimbalPitch : -90;
  const spd = Math.max(1, (typeof speed === 'number' && !isNaN(speed)) ? speed : 4);

  const generatePassForAngle = (angDeg, passIdx) => {
    const angRad = angDeg * Math.PI / 180.0;
    const cosR = Math.cos(-angRad);
    const sinR = Math.sin(-angRad);

    // Rotate vertices into sweep coordinate frame
    const rotPts = polyPts.map(p => ({
      x: p.x * cosR - p.y * sinR,
      y: p.x * sinR + p.y * cosR
    }));

    let minY = Infinity, maxY = -Infinity;
    rotPts.forEach(p => {
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    });

    const N = rotPts.length;
    let lineIndex = 0;

    for (let curY = minY + lineSpacing / 2; curY <= maxY; curY += lineSpacing) {
      // Find intersections with polygon edges
      const xIntersections = [];
      for (let i = 0; i < N; i++) {
        const p1 = rotPts[i];
        const p2 = rotPts[(i + 1) % N];

        if ((p1.y <= curY && p2.y > curY) || (p2.y <= curY && p1.y > curY)) {
          const t = (curY - p1.y) / (p2.y - p1.y);
          const xInt = p1.x + t * (p2.x - p1.x);
          xIntersections.push(xInt);
        }
      }

      xIntersections.sort((a, b) => a - b);

      // Pair intersections into interior segments
      for (let s = 0; s < xIntersections.length - 1; s += 2) {
        let xStart = xIntersections[s];
        let xEnd = xIntersections[s + 1];
        if (xEnd - xStart < 1) continue;

        const isReverse = (lineIndex % 2 === 1);
        const segLen = xEnd - xStart;
        const nSteps = Math.max(2, Math.round(segLen / photoSpacing) + 1);

        for (let j = 0; j < nSteps; j++) {
          const stepFrac = isReverse ? (1 - j / (nSteps - 1)) : (j / (nSteps - 1));
          const rx = xStart + stepFrac * segLen;
          const ry = curY;

          // Rotate back to map coordinates
          const cosBack = Math.cos(angRad);
          const sinBack = Math.sin(angRad);
          const wx = Math.round((rx * cosBack - ry * sinBack) * 100) / 100;
          const wy = Math.round((rx * sinBack + ry * cosBack) * 100) / 100;

          const heading = isReverse ? ((angDeg + 270) % 360) : ((angDeg + 90) % 360);

          const wp = {
            x: wx,
            y: wy,
            alt: alt,
            pitch: pitch,
            gimbalPitch: pitch,
            heading: heading,
            headingMode: 'followWayline',
            speed: spd,
            gridType: 'polygon-grid',
            layerPattern: 'polygon-grid',
            passIndex: passIdx,
            lineIndex: lineIndex
          };

          waypoints.push(wp);
          photos.push({ ...wp });
        }
        lineIndex++;
      }
    }
  };

  generatePassForAngle(sweepAngle, 0);
  if (passMode === 'double') {
    generatePassForAngle((sweepAngle + 90) % 360, 1);
  }

  return { waypoints, photos, optimalAngle: sweepAngle };
}

/**
 * Issue #161: Search & Rescue (sar-search)
 * Expanding Square Search (ESS) & Sector Search (Victor Sierra) from central datum.
 */
function generateSarSearchCoordinates(layer, sPhoto, altitude, defaultGimbalPitch, speed) {
  const waypoints = [];
  const photos = [];

  const sarMode = (layer && layer.sarMode === 'sector-search') ? 'sector-search' : 'expanding-square';
  const trackSpacing = Math.max(10, layer && layer.sarTrackSpacing ? parseFloat(layer.sarTrackSpacing) : 30);
  const bearing = (layer && layer.sarBearing !== undefined) ? (parseFloat(layer.sarBearing) % 360) : 0;
  const pitch = (layer && layer.sarGimbalPitch !== undefined) ? parseFloat(layer.sarGimbalPitch) : -45;
  const alt = Math.max(5, (typeof altitude === 'number' && !isNaN(altitude)) ? altitude : 50);
  const spd = Math.max(1, (typeof speed === 'number' && !isNaN(speed)) ? speed : 4);
  const photoStep = Math.max(3, (typeof sPhoto === 'number' && !isNaN(sPhoto) && sPhoto > 0) ? sPhoto : 10);

  if (sarMode === 'expanding-square') {
    const nLegs = Math.max(4, Math.min(30, layer && layer.sarMaxLegs ? parseInt(layer.sarMaxLegs, 10) : 12));
    let curX = 0;
    let curY = 0;

    // Center Datum Waypoint
    const datumWp = {
      x: 0,
      y: 0,
      alt: alt,
      pitch: pitch,
      gimbalPitch: pitch,
      heading: bearing,
      headingMode: 'followWayline',
      speed: spd,
      gridType: 'sar-search',
      layerPattern: 'sar-search',
      isDatum: true
    };
    waypoints.push(datumWp);
    photos.push({ ...datumWp });

    for (let i = 1; i <= nLegs; i++) {
      const legDist = Math.ceil(i / 2) * trackSpacing;
      const legHeading = (bearing + (i - 1) * 90) % 360;
      const radH = legHeading * Math.PI / 180.0;
      const ux = Math.sin(radH);
      const uy = Math.cos(radH);

      const nSteps = Math.max(1, Math.round(legDist / photoStep));
      for (let s = 1; s <= nSteps; s++) {
        const frac = s / nSteps;
        const px = Math.round((curX + frac * legDist * ux) * 100) / 100;
        const py = Math.round((curY + frac * legDist * uy) * 100) / 100;

        const wp = {
          x: px,
          y: py,
          alt: alt,
          pitch: pitch,
          gimbalPitch: pitch,
          heading: legHeading,
          headingMode: 'followWayline',
          speed: spd,
          gridType: 'sar-search',
          layerPattern: 'sar-search',
          legIndex: i,
          isCorner: (s === nSteps)
        };
        waypoints.push(wp);
        photos.push({ ...wp });
      }

      curX = Math.round((curX + legDist * ux) * 100) / 100;
      curY = Math.round((curY + legDist * uy) * 100) / 100;
    }
  } else {
    // Sector Search (Victor Sierra)
    const radius = Math.max(20, Math.min(500, layer && layer.sarRadius ? parseFloat(layer.sarRadius) : 60));
    const nSectors = Math.max(3, Math.min(6, layer && layer.sarSectors ? parseInt(layer.sarSectors, 10) : 3));
    const sectorAngle = 360.0 / (2 * nSectors);

    for (let s = 0; s < nSectors; s++) {
      const beta = (bearing + s * sectorAngle) % 360;

      // Leg 1: (0,0) to Outer 1
      const rad1 = beta * Math.PI / 180.0;
      const x1 = radius * Math.sin(rad1);
      const y1 = radius * Math.cos(rad1);

      // Leg 2: Outer 1 to Outer 2 (120 deg right turn)
      const h2 = (beta + 120) % 360;
      const rad2 = h2 * Math.PI / 180.0;
      const x2 = x1 + radius * Math.sin(rad2);
      const y2 = y1 + radius * Math.cos(rad2);

      const legs = [
        { from: { x: 0, y: 0 }, to: { x: x1, y: y1 }, h: beta },
        { from: { x: x1, y: y1 }, to: { x: x2, y: y2 }, h: h2 },
        { from: { x: x2, y: y2 }, to: { x: 0, y: 0 }, h: (beta + 240) % 360 }
      ];

      legs.forEach((leg, lIdx) => {
        const dx = leg.to.x - leg.from.x;
        const dy = leg.to.y - leg.from.y;
        const len = Math.hypot(dx, dy);
        const steps = Math.max(1, Math.round(len / photoStep));

        for (let j = 1; j <= steps; j++) {
          const frac = j / steps;
          const px = Math.round((leg.from.x + frac * dx) * 100) / 100;
          const py = Math.round((leg.from.y + frac * dy) * 100) / 100;

          const wp = {
            x: px,
            y: py,
            alt: alt,
            pitch: pitch,
            gimbalPitch: pitch,
            heading: leg.h,
            headingMode: 'followWayline',
            speed: spd,
            gridType: 'sar-search',
            layerPattern: 'sar-search',
            sectorIndex: s,
            sectorLegIndex: lIdx
          };
          waypoints.push(wp);
          photos.push({ ...wp });
        }
      });
    }
  }

  return { waypoints, photos };
}

/**
 * Issue #162: Perimeter / Fenceline Patrol (perimeter-patrol)
 * Closed-loop polygon perimeter with signed standoff offset and directional camera lock.
 */
function generatePerimeterPatrolCoordinates(layer, sPhoto, altitude, defaultGimbalPitch, speed) {
  const waypoints = [];
  const photos = [];

  let vertices = (layer && Array.isArray(layer.polygonVertices) && layer.polygonVertices.length >= 3)
    ? layer.polygonVertices
    : ((layer && Array.isArray(layer.boundaryPolygon) && layer.boundaryPolygon.length >= 3)
      ? layer.boundaryPolygon
      : null);

  if (!vertices || vertices.length < 3) {
    const defaultRad = Math.max(25, ((layer && layer.gridWidth) ? layer.gridWidth : 100) / 2);
    vertices = [
      { x: -defaultRad, y: -defaultRad },
      { x: defaultRad, y: -defaultRad },
      { x: defaultRad, y: defaultRad },
      { x: -defaultRad, y: defaultRad }
    ];
  }

  let polyPts = vertices.map(v => ({
    x: (v.x !== undefined && !isNaN(v.x)) ? v.x : 0,
    y: (v.y !== undefined && !isNaN(v.y)) ? v.y : 0
  }));

  const offset = (layer && layer.perimeterOffset !== undefined) ? parseFloat(layer.perimeterOffset) : 0;
  const headingLock = (layer && layer.perimeterHeadingLock) ? layer.perimeterHeadingLock : 'inward';
  const direction = (layer && layer.perimeterDirection === 'ccw') ? 'ccw' : 'cw';
  const laps = Math.max(1, Math.min(5, layer && layer.perimeterLaps ? parseInt(layer.perimeterLaps, 10) : 1));
  const alt = Math.max(5, (typeof altitude === 'number' && !isNaN(altitude)) ? altitude : 50);
  const pitch = (typeof defaultGimbalPitch === 'number' && !isNaN(defaultGimbalPitch)) ? defaultGimbalPitch : -60;
  const spd = Math.max(1, (typeof speed === 'number' && !isNaN(speed)) ? speed : 4);
  const photoStep = Math.max(3, (typeof sPhoto === 'number' && !isNaN(sPhoto) && sPhoto > 0) ? sPhoto : 10);

  // Compute shoelace signed area to test winding order
  let signedArea = 0;
  const N = polyPts.length;
  for (let i = 0; i < N; i++) {
    const p1 = polyPts[i];
    const p2 = polyPts[(i + 1) % N];
    signedArea += (p1.x * p2.y - p2.x * p1.y);
  }

  const isCCW = (signedArea > 0);
  if ((direction === 'cw' && isCCW) || (direction === 'ccw' && !isCCW)) {
    polyPts.reverse();
  }

  // Generate offset vertices
  const offsetPts = [];
  for (let i = 0; i < N; i++) {
    const prev = polyPts[(i - 1 + N) % N];
    const cur = polyPts[i];
    const next = polyPts[(i + 1) % N];

    const d1x = cur.x - prev.x;
    const d1y = cur.y - prev.y;
    const l1 = Math.hypot(d1x, d1y) || 1;
    const n1x = -d1y / l1;
    const n1y = d1x / l1;

    const d2x = next.x - cur.x;
    const d2y = next.y - cur.y;
    const l2 = Math.hypot(d2x, d2y) || 1;
    const n2x = -d2y / l2;
    const n2y = d2x / l2;

    const avgNx = (n1x + n2x) / 2.0;
    const avgNy = (n1y + n2y) / 2.0;
    const avgLen = Math.hypot(avgNx, avgNy) || 1;

    // Normal points outward for CW polygon
    const ox = cur.x + (avgNx / avgLen) * offset;
    const oy = cur.y + (avgNy / avgLen) * offset;
    offsetPts.push({ x: Math.round(ox * 100) / 100, y: Math.round(oy * 100) / 100 });
  }

  const calcHeading = (dx, dy) => {
    return Math.round(((Math.atan2(dx, dy) * 180.0 / Math.PI) + 360.0) % 360.0 * 10) / 10;
  };

  for (let lap = 0; lap < laps; lap++) {
    for (let i = 0; i < N; i++) {
      const p1 = offsetPts[i];
      const p2 = offsetPts[(i + 1) % N];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const edgeLen = Math.hypot(dx, dy);
      const tangentHeading = calcHeading(dx, dy);

      let edgeHeading = tangentHeading;
      if (headingLock === 'inward') {
        edgeHeading = (tangentHeading + 90) % 360;
      } else if (headingLock === 'outward') {
        edgeHeading = (tangentHeading + 270) % 360;
      }

      const nSteps = Math.max(1, Math.round(edgeLen / photoStep));
      for (let s = 0; s < nSteps; s++) {
        const frac = s / nSteps;
        const px = Math.round((p1.x + frac * dx) * 100) / 100;
        const py = Math.round((p1.y + frac * dy) * 100) / 100;

        const wp = {
          x: px,
          y: py,
          alt: alt,
          pitch: pitch,
          gimbalPitch: pitch,
          heading: edgeHeading,
          headingMode: (headingLock === 'tangent' ? 'followWayline' : 'custom'),
          speed: spd,
          gridType: 'perimeter-patrol',
          layerPattern: 'perimeter-patrol',
          edgeIndex: i,
          lapIndex: lap
        };
        waypoints.push(wp);
        photos.push({ ...wp });
      }
    }
  }

  // Close the loop squarely on the first point
  if (waypoints.length > 0) {
    const firstWp = { ...waypoints[0], isLoopClosure: true };
    waypoints.push(firstWp);
  }

  return { waypoints, photos };
}

/**
 * Issue #163: Cinematic Reveal & Boomerang (cinematic-reveal)
 * Automated Dronie pull-back climb, Rocket crane, and Elliptical Boomerang with trigonometric POI tracking.
 */
function generateCinematicRevealCoordinates(layer, sPhoto, altitude, defaultGimbalPitch, speed) {
  const waypoints = [];
  const photos = [];

  const mode = (layer && layer.cinematicMode) ? layer.cinematicMode : 'dronie';
  const azimuth = (layer && layer.cinematicAzimuth !== undefined) ? (parseFloat(layer.cinematicAzimuth) % 360) : 180;
  const startDist = Math.max(1, layer && layer.cinematicStartDist ? parseFloat(layer.cinematicStartDist) : 5);
  const endDist = Math.max(startDist + 5, layer && layer.cinematicEndDist ? parseFloat(layer.cinematicEndDist) : 50);
  const startAlt = Math.max(2, layer && layer.cinematicStartAlt ? parseFloat(layer.cinematicStartAlt) : 10);
  const endAlt = Math.max(startAlt, layer && layer.cinematicEndAlt ? parseFloat(layer.cinematicEndAlt) : 40);
  const poiAlt = (layer && layer.cinematicPoiAlt !== undefined) ? parseFloat(layer.cinematicPoiAlt) : 2;
  const eccentricity = Math.max(0.2, Math.min(1.0, layer && layer.cinematicEccentricity ? parseFloat(layer.cinematicEccentricity) : 0.5));
  const spd = Math.max(1, (typeof speed === 'number' && !isNaN(speed)) ? speed : 3);

  const calcHeading = (dx, dy) => {
    return Math.round(((Math.atan2(dx, dy) * 180.0 / Math.PI) + 360.0) % 360.0 * 10) / 10;
  };

  if (mode === 'dronie') {
    const nSteps = 24;
    const radAz = azimuth * Math.PI / 180.0;
    const ux = Math.sin(radAz);
    const uy = Math.cos(radAz);

    for (let i = 0; i <= nSteps; i++) {
      const frac = i / nSteps;
      const curDist = startDist + frac * (endDist - startDist);
      const curAlt = startAlt + frac * (endAlt - startAlt);
      const px = Math.round(curDist * ux * 100) / 100;
      const py = Math.round(curDist * uy * 100) / 100;

      // Gimbal pitch looking back at POI (0,0,poiAlt)
      const altDelta = curAlt - poiAlt;
      const pitchRad = -Math.atan2(altDelta, curDist);
      const pitchDeg = Math.round((pitchRad * 180.0 / Math.PI) * 10) / 10;
      const heading = (azimuth + 180) % 360;

      const wp = {
        x: px,
        y: py,
        alt: Math.round(curAlt * 10) / 10,
        pitch: pitchDeg,
        gimbalPitch: pitchDeg,
        heading: heading,
        headingMode: 'towardCenter',
        speed: spd,
        gridType: 'cinematic-reveal',
        layerPattern: 'cinematic-reveal',
        cinematicMode: 'dronie',
        frameIndex: i
      };
      waypoints.push(wp);
      photos.push({ ...wp });
    }
  } else if (mode === 'rocket') {
    const nSteps = 16;
    const radAz = azimuth * Math.PI / 180.0;
    const px = Math.round(1.5 * Math.sin(radAz) * 100) / 100;
    const py = Math.round(1.5 * Math.cos(radAz) * 100) / 100;

    for (let i = 0; i <= nSteps; i++) {
      const frac = i / nSteps;
      const curAlt = startAlt + frac * (endAlt - startAlt);
      const pitchDeg = Math.round((-15 - frac * 75) * 10) / 10; // Pan from -15 deg horizon down to -90 deg nadir

      const wp = {
        x: px,
        y: py,
        alt: Math.round(curAlt * 10) / 10,
        pitch: pitchDeg,
        gimbalPitch: pitchDeg,
        heading: azimuth,
        headingMode: 'custom',
        speed: spd,
        gridType: 'cinematic-reveal',
        layerPattern: 'cinematic-reveal',
        cinematicMode: 'rocket',
        frameIndex: i
      };
      waypoints.push(wp);
      photos.push({ ...wp });
    }
  } else {
    // Boomerang (Elliptical Orbit)
    const nSteps = 36;
    const a = endDist;
    const b = a * eccentricity;
    const radAz = azimuth * Math.PI / 180.0;
    const cosAz = Math.cos(radAz);
    const sinAz = Math.sin(radAz);

    for (let i = 0; i < nSteps; i++) {
      const phi = (2 * Math.PI * i) / nSteps;
      const lx = a * Math.cos(phi);
      const ly = b * Math.sin(phi);

      // Rotate by azimuth
      const px = Math.round((lx * cosAz - ly * sinAz) * 100) / 100;
      const py = Math.round((lx * sinAz + ly * cosAz) * 100) / 100;
      const curDist = Math.hypot(px, py);

      // Altitude rises on the far end, descends on near end
      const curAlt = startAlt + (endAlt - startAlt) * (0.5 - 0.5 * Math.cos(phi));
      const altDelta = curAlt - poiAlt;
      const pitchDeg = Math.round((-Math.atan2(altDelta, curDist) * 180.0 / Math.PI) * 10) / 10;
      const heading = calcHeading(-px, -py);

      const wp = {
        x: px,
        y: py,
        alt: Math.round(curAlt * 10) / 10,
        pitch: pitchDeg,
        gimbalPitch: pitchDeg,
        heading: heading,
        headingMode: 'towardCenter',
        speed: spd,
        gridType: 'cinematic-reveal',
        layerPattern: 'cinematic-reveal',
        cinematicMode: 'boomerang',
        frameIndex: i
      };
      waypoints.push(wp);
      photos.push({ ...wp });
    }
  }

  return { waypoints, photos };
}

if (typeof window !== 'undefined') {
  window.generateLightArtCoordinates = generateLightArtCoordinates;
  window.calculateLightArtRadiusForDuration = calculateLightArtRadiusForDuration;
  window.calculateLightArtSpeedForDuration = calculateLightArtSpeedForDuration;
  window.generateVerticalFacadeCoordinates = generateVerticalFacadeCoordinates;
  window.generateHelixCoordinates = generateHelixCoordinates;
  window.generateStarPassCoordinates = generateStarPassCoordinates;
  window.generateCorridorCoordinates = generateCorridorCoordinates;
  window.generatePhotoSphereCoordinates = generatePhotoSphereCoordinates;
  window.calculatePhotoSphereOverlap = calculatePhotoSphereOverlap;
  window.estimatePhotoSphereDuration = estimatePhotoSphereDuration;
  window.updatePhotoSphereBadge = updatePhotoSphereBadge;
  window.generateDomeShellCoordinates = generateDomeShellCoordinates;
  window.generatePolygonGridCoordinates = generatePolygonGridCoordinates;
  window.computeOptimalPolygonSweepAngle = computeOptimalPolygonSweepAngle;
  window.generateSarSearchCoordinates = generateSarSearchCoordinates;
  window.generatePerimeterPatrolCoordinates = generatePerimeterPatrolCoordinates;
  window.generateCinematicRevealCoordinates = generateCinematicRevealCoordinates;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    generatePhotoSphereCoordinates,
    calculatePhotoSphereOverlap,
    estimatePhotoSphereDuration,
    updatePhotoSphereBadge,
    generateLightArtCoordinates,
    calculateLightArtRadiusForDuration,
    calculateLightArtSpeedForDuration,
    generateVerticalFacadeCoordinates,
    generateHelixCoordinates,
    generateStarPassCoordinates,
    generateDomeShellCoordinates,
    generatePolygonGridCoordinates,
    computeOptimalPolygonSweepAngle,
    generateSarSearchCoordinates,
    generatePerimeterPatrolCoordinates,
    generateCinematicRevealCoordinates,
    generateCorridorCoordinates
  };
}

