function calculateCameraGroundFrustum(droneX, droneY, alt, headingDeg, pitchDeg, hfov, vfov, zPlane = 0, framingRatio = 0.55) {
  const deltaH = Math.max(1.0, (alt || 50) - (zPlane || 0));
  const headingRad = ((headingDeg || 0) * Math.PI) / 180.0;
  
  // u = unit vector forward along flight heading
  const ux = Math.sin(headingRad);
  const uy = Math.cos(headingRad);
  // r = unit vector right lateral
  const rx = Math.cos(headingRad);
  const ry = -Math.sin(headingRad);

  // Pitch convention: -90 is nadir, -45 is 45 deg forward-down. Enforce negative downward pitch
  const effectivePitch = -Math.abs(pitchDeg !== undefined && pitchDeg !== null ? pitchDeg : -60);
  const clampedPitch = Math.max(-90.0, Math.min(-5.0, effectivePitch));
  const alphaDeg = 90.0 + clampedPitch;
  const hfovVal = (hfov && !isNaN(hfov) && hfov > 0) ? hfov : 69.7;
  const vfovVal = (vfov && !isNaN(vfov) && vfov > 0) ? vfov : 55.2;

  // framingRatio modulates upper vertical FOV to focus on the photogrammetric sweet spot
  // 1.0 = full theoretical sensor horizon; 0.55 = balanced sweet spot; 0.35 = tight framing
  const fRatio = (typeof framingRatio === 'number' && framingRatio > 0) ? Math.min(1.0, Math.max(0.1, framingRatio)) : 0.55;

  // Angular bounds along vertical field of view
  const alphaNearDeg = Math.max(-85.0, Math.min(85.0, alphaDeg - vfovVal / 2.0));
  const alphaFarDeg = Math.max(-85.0, Math.min(85.0, alphaDeg + (vfovVal / 2.0) * fRatio));

  const dNear = deltaH * Math.tan((alphaNearDeg * Math.PI) / 180.0);
  const dFar = deltaH * Math.tan((alphaFarDeg * Math.PI) / 180.0);

  const slantNear = Math.sqrt(deltaH * deltaH + dNear * dNear);
  const slantFar = Math.sqrt(deltaH * deltaH + dFar * dFar);

  // Modulate lateral (across-track) half-angle by fRatio to prune parallel flight legs
  // that are out of frame or only capture the target at extreme sensor corners
  const halfWNear = slantNear * Math.tan(((hfovVal / 2.0) * fRatio) * Math.PI / 180.0);
  const halfWFar = slantFar * Math.tan(((hfovVal / 2.0) * fRatio) * Math.PI / 180.0);

  return [
    { x: droneX + dNear * ux - halfWNear * rx, y: droneY + dNear * uy - halfWNear * ry }, // Near-Left
    { x: droneX + dNear * ux + halfWNear * rx, y: droneY + dNear * uy + halfWNear * ry }, // Near-Right
    { x: droneX + dFar * ux + halfWFar * rx,   y: droneY + dFar * uy + halfWFar * ry },   // Far-Right
    { x: droneX + dFar * ux - halfWFar * rx,   y: droneY + dFar * uy - halfWFar * ry }    // Far-Left
  ];
}

function isPointInPolygon2D(px, py, poly) {
  if (!poly || poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect = ((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function segmentsIntersect2D(p1, p2, p3, p4) {
  function ccw(a, b, c) {
    return (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x);
  }
  return (ccw(p1, p3, p4) !== ccw(p2, p3, p4)) && (ccw(p1, p2, p3) !== ccw(p1, p2, p4));
}

function doPolygonsIntersect2D(polyA, polyB) {
  if (!polyA || polyA.length < 3 || !polyB || polyB.length < 3) return false;
  for (let i = 0; i < polyA.length; i++) {
    if (isPointInPolygon2D(polyA[i].x, polyA[i].y, polyB)) return true;
  }
  for (let i = 0; i < polyB.length; i++) {
    if (isPointInPolygon2D(polyB[i].x, polyB[i].y, polyA)) return true;
  }
  for (let i = 0; i < polyA.length; i++) {
    const nextA = (i + 1) % polyA.length;
    for (let j = 0; j < polyB.length; j++) {
      const nextB = (j + 1) % polyB.length;
      if (segmentsIntersect2D(polyA[i], polyA[nextA], polyB[j], polyB[nextB])) return true;
    }
  }
  return false;
}

function isTargetVisibleInFrustum(droneX, droneY, alt, headingDeg, pitchDeg, hfov, vfov, targetPoly, objectHeight = 0, framingRatio = 0.55) {
  if (!targetPoly || targetPoly.length < 3) return true;
  // Test ground footprint (Z = 0)
  const groundFrustum = calculateCameraGroundFrustum(droneX, droneY, alt, headingDeg, pitchDeg, hfov, vfov, 0, framingRatio);
  if (doPolygonsIntersect2D(groundFrustum, targetPoly)) return true;

  // Test extruded roof level (Z = objectHeight) to protect rooflines & chimneys
  if (objectHeight > 0 && alt > objectHeight) {
    const roofFrustum = calculateCameraGroundFrustum(droneX, droneY, alt, headingDeg, pitchDeg, hfov, vfov, objectHeight, framingRatio);
    if (doPolygonsIntersect2D(roofFrustum, targetPoly)) return true;
  }
  return false;
}

function getLocalTargetPolygon(layer, centerLat, centerLon, rotationDeg) {
  let rawPoly = [];
  const targetMode = layer ? layer.targetMode : 'polygon';
  const targetRadius = (layer && layer.targetRadius > 0) ? layer.targetRadius : 25;

  if (targetMode === 'radius' || !layer || !layer.targetPoly || layer.targetPoly.length < 3) {
    // Generate regular N-gon circle around local origin (0, 0)
    const nPts = 16;
    for (let k = 0; k < nPts; k++) {
      const angle = (k / nPts) * 2 * Math.PI;
      rawPoly.push({
        x: targetRadius * Math.cos(angle),
        y: targetRadius * Math.sin(angle)
      });
    }
  } else {
    // Convert lat/lon polygon vertices to local meter coordinates relative to center
    rawPoly = layer.targetPoly.map(pt => {
      if (pt.lat !== undefined && pt.lon !== undefined && centerLat && centerLon) {
        return geodeticToLocal(pt.lat, pt.lon, centerLat, centerLon);
      }
      if (pt.x !== undefined && pt.y !== undefined) {
        return { x: pt.x, y: pt.y };
      }
      return { x: 0, y: 0 };
    });
  }

  // Rotate polygon into grid-local coordinate space (-rotationDeg)
  const rotRad = (-(rotationDeg || 0) * Math.PI) / 180.0;
  const cosR = Math.cos(rotRad);
  const sinR = Math.sin(rotRad);
  return rawPoly.map(pt => ({
    x: pt.x * cosR - pt.y * sinR,
    y: pt.x * sinR + pt.y * cosR
  }));
}

/**
 * Automatically calculates optimal Target Splat flight grid dimensions (Width & Height)
 * based on the target boundary (Radius or Freeform Polygon), camera altitude, gimbal pitch,
 * and framing margins.
 */
function calculateTargetSplatDimensions(layer, overrideAltitude, overridePitch, overrideRotation) {
  if (!layer) return { width: 100, height: 100 };

  const targetMode = layer.targetMode || 'radius';
  const targetRadius = (typeof layer.targetRadius === 'number' && layer.targetRadius > 0) ? layer.targetRadius : 25;
  const rotationDeg = (overrideRotation !== undefined) ? overrideRotation : (layer.gridRotation !== undefined ? layer.gridRotation : 0);
  const altitude = (overrideAltitude !== undefined && overrideAltitude > 0) ? overrideAltitude : (layer.altitude !== undefined ? layer.altitude : 50);

  let gimbalPitch = (overridePitch !== undefined) ? overridePitch : (layer.gimbalPitch !== undefined ? layer.gimbalPitch : -45);
  // Normalize pitch to negative downward angle
  gimbalPitch = -Math.abs(gimbalPitch !== null && !isNaN(gimbalPitch) ? gimbalPitch : -45);
  gimbalPitch = Math.max(-90, Math.min(-15, gimbalPitch));

  let halfExtentX = targetRadius;
  let halfExtentY = targetRadius;

  if (targetMode === 'polygon' && Array.isArray(layer.targetPoly) && layer.targetPoly.length >= 3) {
    const centerLat = (layer.centerLat !== undefined && layer.centerLat !== null) ? layer.centerLat : 0;
    const centerLon = (layer.centerLon !== undefined && layer.centerLon !== null) ? layer.centerLon : 0;
    const localPoly = getLocalTargetPolygon(layer, centerLat, centerLon, rotationDeg);
    if (localPoly && localPoly.length >= 3) {
      let maxX = 0;
      let maxY = 0;
      localPoly.forEach(pt => {
        const absX = Math.abs(pt.x);
        const absY = Math.abs(pt.y);
        if (absX > maxX) maxX = absX;
        if (absY > maxY) maxY = absY;
      });
      halfExtentX = Math.max(5, maxX);
      halfExtentY = Math.max(5, maxY);
    }
  }

  // Camera look-ahead standoff distance based on gimbal pitch angle from nadir
  // alpha is angle from nadir: 0 deg = nadir (-90 pitch), 45 deg = 45 oblique (-45 pitch), 30 deg = 60 oblique (-60 pitch)
  const alphaDeg = 90.0 + gimbalPitch;
  const alphaRad = (alphaDeg * Math.PI) / 180.0;
  let dStandoff = altitude * Math.tan(alphaRad);

  const framingMode = layer ? (layer.targetFramingMode || 'balanced') : 'balanced';
  if (framingMode === 'tight') {
    dStandoff *= 0.85;
  }

  // Framing margin for turnaround overshoot, line spacing, and contextual framing
  const margin = Math.max(5, Math.min(20, Math.round(0.2 * altitude)));

  // In Double Grid (or default for Target Splat):
  // Pass 1 flies North/South (aims along Y) -> requires Y standoff on both sides
  // Pass 2 flies East/West (aims along X) -> requires X standoff on both sides
  const gridPass = layer.targetGridPass || 'double';
  let spanX, spanY;

  spanY = 2 * (halfExtentY + dStandoff + margin);

  if (gridPass === 'single') {
    const hfovVal = (typeof CAMERA_HFOV === 'number' && CAMERA_HFOV > 0) ? CAMERA_HFOV : 69.7;
    const halfLateralFootprint = altitude * Math.tan(((hfovVal / 2.0) * Math.PI) / 180.0);
    spanX = 2 * (halfExtentX + Math.max(halfLateralFootprint * 0.5, margin));
  } else {
    spanX = 2 * (halfExtentX + dStandoff + margin);
  }

  // Clamp to slider limits: 20m to 500m, rounded to nearest 5m
  const width = Math.min(500, Math.max(20, Math.round(spanX / 5) * 5));
  const height = Math.min(500, Math.max(20, Math.round(spanY / 5) * 5));

  return { width, height };
}

let isProgrammaticDimensionUpdate = false;

function applyTargetSplatAutoDimensions(layer) {
  if (!layer || layer.pattern !== 'target-splat' || layer.targetAutoDimensions === false) {
    updateTargetSplatAutoFitUI(layer);
    updateTargetSplatDiagram(layer);
    updateTargetSplatDimensionWarning(layer);
    return;
  }
  const dims = calculateTargetSplatDimensions(layer);
  layer.gridWidth = dims.width;
  layer.gridHeight = dims.height;

  isProgrammaticDimensionUpdate = true;
  if (typeof document !== 'undefined') {
    const widthSlider = document.getElementById('grid-width');
    const heightSlider = document.getElementById('grid-height');
    if (widthSlider) widthSlider.value = String(dims.width);
    if (heightSlider) heightSlider.value = String(dims.height);
  }
  isProgrammaticDimensionUpdate = false;

  updateTargetSplatAutoFitUI(layer);
  updateTargetSplatDiagram(layer);
  updateTargetSplatDimensionWarning(layer);
  if (typeof syncDisplayValues === 'function') syncDisplayValues();
}

function updateTargetSplatAutoFitUI(layer) {
  if (typeof document === 'undefined') return;
  const btn = document.getElementById('target-splat-autofit-btn');
  if (!btn) return;
  const isAuto = !layer || (layer.targetAutoDimensions !== false);
  if (isAuto) {
    if (btn.classList && typeof btn.classList.add === 'function') btn.classList.add('active');
    if (btn.style) {
      btn.style.background = 'rgba(16, 185, 129, 0.3)';
      btn.style.borderColor = 'rgba(16, 185, 129, 0.6)';
      btn.style.color = '#34d399';
    }
    btn.textContent = '⚡ Auto-Fit (Active)';
    if (typeof btn.setAttribute === 'function') {
      btn.setAttribute('title', 'Grid Width & Height auto-derived from target boundary. Click to unlock manual mode.');
    }
  } else {
    if (btn.classList && typeof btn.classList.remove === 'function') btn.classList.remove('active');
    if (btn.style) {
      btn.style.background = 'rgba(255, 255, 255, 0.08)';
      btn.style.borderColor = 'rgba(255, 255, 255, 0.2)';
      btn.style.color = 'var(--text-muted)';
    }
    btn.textContent = '⚡ Auto-Fit Grid';
    if (typeof btn.setAttribute === 'function') {
      btn.setAttribute('title', 'Click to recalculate optimal Grid Width & Height from target geometry.');
    }
  }
}

function updateTargetSplatDiagram(layer, overrideAltitude, overridePitch) {
  if (typeof document === 'undefined') return;
  const svg = document.getElementById('target-splat-diagram-svg');
  if (!svg) return;

  const altSlider = document.getElementById('altitude');
  const pitchSlider = document.getElementById('gimbal-pitch');

  const altitude = (overrideAltitude !== undefined && overrideAltitude > 0)
    ? overrideAltitude
    : (altSlider ? (parseFloat(altSlider.value) || 50) : (layer && layer.altitude ? layer.altitude : 50));

  let gimbalPitch = (overridePitch !== undefined)
    ? overridePitch
    : (pitchSlider ? parseGimbalPitch(pitchSlider.value, -45) : (layer && layer.gimbalPitch !== undefined ? layer.gimbalPitch : -45));
  gimbalPitch = -Math.abs(gimbalPitch !== null && !isNaN(gimbalPitch) ? gimbalPitch : -45);
  gimbalPitch = Math.max(-90, Math.min(-15, gimbalPitch));

  const framingMode = layer ? (layer.targetFramingMode || 'balanced') : 'balanced';
  const fRatio = (framingMode === 'tight') ? 0.35 : ((framingMode === 'full') ? 1.0 : 0.55);

  const vfovVal = (typeof CAMERA_VFOV === 'number' && CAMERA_VFOV > 0) ? CAMERA_VFOV : 55.2;
  const alphaDeg = 90.0 + gimbalPitch;

  const dBoresight = altitude * Math.tan((alphaDeg * Math.PI) / 180.0);
  const alphaNearDeg = Math.max(0, alphaDeg - vfovVal / 2.0);
  const dNear = altitude * Math.tan((alphaNearDeg * Math.PI) / 180.0);

  const alphaFarFullDeg = Math.min(85.0, alphaDeg + vfovVal / 2.0);
  const dFarFull = altitude * Math.tan((alphaFarFullDeg * Math.PI) / 180.0);

  const alphaFarEffDeg = Math.min(85.0, alphaDeg + (vfovVal / 2.0) * fRatio);
  const dFarEff = altitude * Math.tan((alphaFarEffDeg * Math.PI) / 180.0);

  const dSaved = Math.max(0, dFarFull - dFarEff);

  // Update badge and stats text
  const badgeEl = document.getElementById('target-splat-framing-badge');
  if (badgeEl) {
    if (framingMode === 'tight') {
      badgeEl.textContent = 'Tight Framing';
      badgeEl.style.background = 'rgba(56, 189, 248, 0.2)';
      badgeEl.style.color = '#38bdf8';
    } else if (framingMode === 'full') {
      badgeEl.textContent = 'Full Horizon';
      badgeEl.style.background = 'rgba(245, 158, 11, 0.2)';
      badgeEl.style.color = '#fbbf24';
    } else {
      badgeEl.textContent = 'Sweet Spot';
      badgeEl.style.background = 'rgba(16, 185, 129, 0.2)';
      badgeEl.style.color = '#34d399';
    }
  }

  const statsEl = document.getElementById('target-splat-diagram-stats');
  if (statsEl) {
    if (framingMode === 'full') {
      statsEl.textContent = `Lead-In: ${Math.round(dFarFull)}m (Full Horizon)`;
    } else {
      statsEl.textContent = `Lead-In: ${Math.round(dFarEff)}m | Save ~${Math.round(dSaved)}m`;
    }
  }

  // Update SVG elements
  const maxMeters = Math.max(75, dFarFull * 1.08);
  const originX = 36;
  const groundY = 72;
  const droneY = 25;
  const svgWidth = 232;
  const availableWidth = svgWidth - originX;

  function toSvgX(distMeters) {
    return originX + Math.min(availableWidth, Math.max(0, (distMeters / maxMeters) * availableWidth));
  }

  const xBoresight = toSvgX(dBoresight);
  const xNear = toSvgX(dNear);
  const xFarEff = toSvgX(dFarEff);
  const xFarFull = toSvgX(dFarFull);

  const setElemAttr = (id, attr, val) => {
    const el = document.getElementById(id);
    if (el && typeof el.setAttribute === 'function') el.setAttribute(attr, val);
  };
  const setElemText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  // Frustum polygons
  setElemAttr('target-splat-diag-sweetspot', 'points', `${originX},${droneY} ${Math.round(xNear)},${groundY} ${Math.round(xFarEff)},${groundY}`);
  
  if (framingMode === 'full' || dSaved < 4) {
    setElemAttr('target-splat-diag-pruned', 'points', `${originX},${droneY} ${Math.round(xFarEff)},${groundY} ${Math.round(xFarEff)},${groundY}`);
    setElemAttr('target-splat-diag-pruned', 'style', 'display: none;');
    setElemText('target-splat-diag-pruned-label', '');
  } else {
    setElemAttr('target-splat-diag-pruned', 'points', `${originX},${droneY} ${Math.round(xFarEff)},${groundY} ${Math.round(xFarFull)},${groundY}`);
    setElemAttr('target-splat-diag-pruned', 'style', 'display: block;');
    const midX = Math.round((xFarEff + xFarFull) / 2);
    setElemAttr('target-splat-diag-pruned-label', 'x', String(midX));
    setElemText('target-splat-diag-pruned-label', '✂ Pruned');
  }

  // Sight lines
  setElemAttr('target-splat-diag-boresight', 'x2', String(Math.round(xBoresight)));
  setElemAttr('target-splat-diag-near', 'x2', String(Math.round(xNear)));
  setElemAttr('target-splat-diag-fareff', 'x2', String(Math.round(xFarEff)));
  setElemAttr('target-splat-diag-farfull', 'x2', String(Math.round(xFarFull)));

  // Building position at boresight center
  const bldgWidth = 24;
  const bldgX = Math.max(xNear + 2, Math.min(svgWidth - bldgWidth - 2, xBoresight - bldgWidth / 2));
  setElemAttr('target-splat-diag-building', 'x', String(Math.round(bldgX)));
  setElemAttr('target-splat-diag-building-label', 'x', String(Math.round(bldgX + bldgWidth / 2)));

  // Altitude & Boresight text
  setElemText('target-splat-diag-alt-text', `${Math.round(altitude)}m`);
  setElemText('target-splat-diag-boresight-text', `Boresight: ${Math.round(dBoresight)}m`);
  setElemAttr('target-splat-diag-boresight-text', 'x', String(Math.round(Math.max(65, Math.min(180, xBoresight)))));
}

/**
 * Evaluates whether Target Splat survey dimensions (gridWidth & gridHeight) are large enough
 * to cover the target area and provide required camera standoff distance at the active
 * altitude and gimbal pitch angle.
 *
 * @param {Object} layer - The active pattern layer
 * @param {number} [overrideWidth] - Optional grid width in meters
 * @param {number} [overrideHeight] - Optional grid height in meters
 * @returns {Object} Dimension sufficiency evaluation result
 */
function checkTargetSplatDimensionSufficiency(layer, overrideWidth, overrideHeight) {
  if (!layer || layer.pattern !== 'target-splat') {
    return {
      isTargetSplat: false,
      isUndersized: false,
      isCritical: false,
      widthOk: true,
      heightOk: true,
      widthUndersized: false,
      heightUndersized: false,
      widthCritical: false,
      heightCritical: false,
      recWidth: 100,
      recHeight: 100,
      currentWidth: 100,
      currentHeight: 100,
      targetSpanX: 0,
      targetSpanY: 0,
      widthDeficit: 0,
      heightDeficit: 0
    };
  }

  const recDims = calculateTargetSplatDimensions(layer);
  const sliderWidth = (typeof document !== 'undefined' && document.getElementById('grid-width'))
    ? parseFloat(document.getElementById('grid-width').value)
    : undefined;
  const sliderHeight = (typeof document !== 'undefined' && document.getElementById('grid-height'))
    ? parseFloat(document.getElementById('grid-height').value)
    : undefined;

  const currentWidth = (overrideWidth !== undefined)
    ? overrideWidth
    : (sliderWidth !== undefined && !isNaN(sliderWidth) ? sliderWidth : (layer.gridWidth !== undefined ? layer.gridWidth : 100));
  const currentHeight = (overrideHeight !== undefined)
    ? overrideHeight
    : (sliderHeight !== undefined && !isNaN(sliderHeight) ? sliderHeight : (layer.gridHeight !== undefined ? layer.gridHeight : 100));

  // Compute physical boundary extent (diameter / bounding box)
  const targetMode = layer.targetMode || 'radius';
  const targetRadius = (typeof layer.targetRadius === 'number' && layer.targetRadius > 0) ? layer.targetRadius : 25;
  const rotationDeg = (layer.gridRotation !== undefined) ? layer.gridRotation : 0;

  let halfExtentX = targetRadius;
  let halfExtentY = targetRadius;

  if (targetMode === 'polygon' && Array.isArray(layer.targetPoly) && layer.targetPoly.length >= 3) {
    const centerLat = (layer.centerLat !== undefined && layer.centerLat !== null) ? layer.centerLat : 0;
    const centerLon = (layer.centerLon !== undefined && layer.centerLon !== null) ? layer.centerLon : 0;
    const localPoly = (typeof getLocalTargetPolygon === 'function') ? getLocalTargetPolygon(layer, centerLat, centerLon, rotationDeg) : null;
    if (localPoly && localPoly.length >= 3) {
      let maxX = 0;
      let maxY = 0;
      localPoly.forEach(pt => {
        const absX = Math.abs(pt.x);
        const absY = Math.abs(pt.y);
        if (absX > maxX) maxX = absX;
        if (absY > maxY) maxY = absY;
      });
      halfExtentX = Math.max(5, maxX);
      halfExtentY = Math.max(5, maxY);
    }
  }

  const targetSpanX = 2 * halfExtentX;
  const targetSpanY = 2 * halfExtentY;

  // Critical check: Survey dimension is smaller than bare target physical extent (turnaround inside structure)
  // Tolerance of 0.5m prevents false positives from floating point rounding
  const widthCritical = currentWidth < (targetSpanX - 0.5);
  const heightCritical = currentHeight < (targetSpanY - 0.5);
  const isCritical = widthCritical || heightCritical;

  // Undersized check: Survey dimension is smaller than recommended standoff coverage
  const widthUndersized = currentWidth < (recDims.width - 0.5);
  const heightUndersized = currentHeight < (recDims.height - 0.5);
  const isUndersized = widthUndersized || heightUndersized;

  const widthDeficit = Math.max(0, recDims.width - currentWidth);
  const heightDeficit = Math.max(0, recDims.height - currentHeight);

  return {
    isTargetSplat: true,
    isUndersized,
    isCritical,
    widthOk: !widthUndersized,
    heightOk: !heightUndersized,
    widthUndersized,
    heightUndersized,
    widthCritical,
    heightCritical,
    recWidth: recDims.width,
    recHeight: recDims.height,
    currentWidth,
    currentHeight,
    targetSpanX,
    targetSpanY,
    widthDeficit,
    heightDeficit
  };
}

/**
 * Updates UI warning badges and callout banner when Target Splat dimensions are undersized.
 *
 * @param {Object} layer - Active pattern layer
 */
function updateTargetSplatDimensionWarning(layer) {
  if (typeof document === 'undefined') return;

  const widthBadge = document.getElementById('width-warning-badge');
  const heightBadge = document.getElementById('height-warning-badge');
  const warningBanner = document.getElementById('target-splat-dimension-warning');

  if (!layer || layer.pattern !== 'target-splat') {
    if (widthBadge) {
      widthBadge.className = 'splat-dim-badge hidden';
    }
    if (heightBadge) {
      heightBadge.className = 'splat-dim-badge hidden';
    }
    if (warningBanner) {
      warningBanner.classList.add('hidden');
    }
    return;
  }

  const check = checkTargetSplatDimensionSufficiency(layer);
  const activeUnit = (typeof getUnitSystem === 'function') ? getUnitSystem() : ((typeof unit !== 'undefined') ? unit : 'imperial');
  const isImperial = activeUnit === 'imperial';
  const unitStr = isImperial ? 'ft' : 'm';
  const scale = isImperial ? M_TO_FT : 1;

  const curW = Math.round(check.currentWidth * scale);
  const curH = Math.round(check.currentHeight * scale);
  const recW = Math.round(check.recWidth * scale);
  const recH = Math.round(check.recHeight * scale);
  const spanX = Math.round(check.targetSpanX * scale);
  const spanY = Math.round(check.targetSpanY * scale);
  const defW = Math.max(0, recW - curW);
  const defH = Math.max(0, recH - curH);

  // Update Survey Width badge
  if (widthBadge) {
    if (check.widthCritical) {
      widthBadge.textContent = '🚨 < Target';
      widthBadge.className = 'splat-dim-badge critical';
      widthBadge.setAttribute('title', `Survey Width (${curW}${unitStr}) is smaller than physical target width (${spanX}${unitStr})! Turnaround legs enter target.`);
    } else if (check.widthUndersized) {
      widthBadge.textContent = '⚠️ Undersized';
      widthBadge.className = 'splat-dim-badge warning';
      widthBadge.setAttribute('title', `Survey Width (${curW}${unitStr}) is smaller than recommended standoff coverage (${recW}${unitStr}). Outer facades will be clipped.`);
    } else {
      widthBadge.className = 'splat-dim-badge hidden';
    }
  }

  // Update Survey Height badge
  if (heightBadge) {
    if (check.heightCritical) {
      heightBadge.textContent = '🚨 < Target';
      heightBadge.className = 'splat-dim-badge critical';
      heightBadge.setAttribute('title', `Survey Height (${curH}${unitStr}) is smaller than physical target height (${spanY}${unitStr})! Turnaround legs enter target.`);
    } else if (check.heightUndersized) {
      heightBadge.textContent = '⚠️ Undersized';
      heightBadge.className = 'splat-dim-badge warning';
      heightBadge.setAttribute('title', `Survey Height (${curH}${unitStr}) is smaller than recommended standoff coverage (${recH}${unitStr}). Outer facades will be clipped.`);
    } else {
      heightBadge.className = 'splat-dim-badge hidden';
    }
  }

  // Update Warning Callout Banner
  if (warningBanner) {
    if (!check.isUndersized) {
      warningBanner.classList.add('hidden');
    } else {
      warningBanner.classList.remove('hidden');

      const iconEl = document.getElementById('target-splat-warning-icon');
      const titleEl = document.getElementById('target-splat-warning-title');
      const textEl = document.getElementById('target-splat-warning-text');
      const deficitBadge = document.getElementById('target-splat-deficit-badge');
      const recDimsEl = document.getElementById('target-splat-rec-dims-text');
      const fixBtn = document.getElementById('target-splat-fix-dims-btn');

      const deficits = [];
      if (defW > 0) deficits.push(`-${defW} ${unitStr} W`);
      if (defH > 0) deficits.push(`-${defH} ${unitStr} H`);
      const deficitStr = deficits.join(', ');

      if (deficitBadge) {
        deficitBadge.textContent = `Deficit: ${deficitStr}`;
        if (check.isCritical) {
          deficitBadge.style.background = 'rgba(239, 68, 68, 0.25)';
          deficitBadge.style.borderColor = 'rgba(239, 68, 68, 0.6)';
          deficitBadge.style.color = '#f87171';
        } else {
          deficitBadge.style.background = 'rgba(245, 158, 11, 0.25)';
          deficitBadge.style.borderColor = 'rgba(245, 158, 11, 0.5)';
          deficitBadge.style.color = '#fbbf24';
        }
      }

      if (recDimsEl) {
        recDimsEl.textContent = `${recW} ${unitStr} × ${recH} ${unitStr}`;
      }

      if (check.isCritical) {
        warningBanner.style.background = 'rgba(239, 68, 68, 0.12)';
        warningBanner.style.borderColor = 'rgba(239, 68, 68, 0.45)';
        if (iconEl) iconEl.textContent = '🚨';
        if (titleEl) {
          titleEl.textContent = 'CRITICAL: Grid Smaller Than Target Object';
          titleEl.style.color = '#f87171';
        }
        if (textEl) {
          textEl.style.color = '#fca5a5';
          textEl.textContent = `Current survey grid (${curW}×${curH} ${unitStr}) is smaller than the physical target boundary (${spanX}×${spanY} ${unitStr}). Flight turnaround legs will enter the structure.`;
        }
      } else {
        warningBanner.style.background = 'rgba(245, 158, 11, 0.12)';
        warningBanner.style.borderColor = 'rgba(245, 158, 11, 0.4)';
        if (iconEl) iconEl.textContent = '⚠️';
        if (titleEl) {
          titleEl.textContent = 'Survey Dimensions Undersized';
          titleEl.style.color = '#fbbf24';
        }
        if (textEl) {
          textEl.style.color = '#fde68a';
          textEl.textContent = `Current flight grid (${curW}×${curH} ${unitStr}) is too narrow to provide required camera standoff distance (${recW}×${recH} ${unitStr} needed at current altitude & gimbal angle). Outer building facades or rooflines will be clipped.`;
        }
      }

      if (fixBtn) {
        fixBtn.innerHTML = `<span>⚡ Auto-Fit Dimensions (${recW} ${unitStr} × ${recH} ${unitStr})</span>`;
      }
    }
  }
}

/**
 * Update Road Focus & Gimbal UI badges and descriptions
 * @param {Object} layer - Active pattern layer
 */
function updateRoadFocusUI(layer) {
  if (typeof document === 'undefined' || !document || !document.getElementById) return;
  const l = layer || ((typeof getActiveLayer === 'function') ? getActiveLayer() : null);
  const mode = (l && l.roadFocusMode) ? l.roadFocusMode : ((document.getElementById('road-focus-mode')?.value) || 'focusRoad');
  const badge = document.getElementById('road-focus-badge');
  const help = document.getElementById('road-focus-help');
  const offset = l ? (l.roadOffset !== undefined ? l.roadOffset : 15) : 15;
  const alt = l ? (l.altitude || 50) : 50;

  let calculatedRoadPitch;
  if (Math.abs(offset) < 0.01) {
    calculatedRoadPitch = -90;
  } else {
    calculatedRoadPitch = -Math.round(Math.atan2(alt, Math.max(Math.abs(offset), 1)) * (180.0 / Math.PI));
  }

  if (badge) {
    if (mode === 'focusRoad') {
      badge.textContent = `Auto Pitch (${calculatedRoadPitch}°)`;
      badge.style.background = 'rgba(6, 182, 212, 0.15)';
      badge.style.color = 'var(--accent-cyan)';
    } else if (mode === 'followRoad') {
      badge.textContent = 'Forward Tangent';
      badge.style.background = 'rgba(59, 130, 246, 0.15)';
      badge.style.color = '#60a5fa';
    } else if (mode === 'lookAhead') {
      badge.textContent = 'Look-Ahead Slant';
      badge.style.background = 'rgba(245, 158, 11, 0.15)';
      badge.style.color = '#fbbf24';
    } else {
      badge.textContent = 'Manual';
      badge.style.background = 'rgba(255, 255, 255, 0.05)';
      badge.style.color = 'var(--text-muted)';
    }
  }

  if (help) {
    if (mode === 'focusRoad') {
      help.textContent = `Camera automatically tilts to ${calculatedRoadPitch}° and yaws to focus directly onto the road surface.`;
    } else if (mode === 'followRoad') {
      help.textContent = 'Camera points forward along the flight path corridor, smoothly tracking road curves.';
    } else if (mode === 'lookAhead') {
      help.textContent = 'Camera points forward and down toward the next road node ahead on the road.';
    } else {
      help.textContent = 'Camera uses manual layer pitch and heading controls.';
    }
  }
}

function generateTargetSplatCoordinates(width, height, rotation, captureMode, sLine, sPhoto, altitude, defaultGimbalPitch, layer) {
  const waypoints = [];
  const photos = [];

  const hfov = (typeof CAMERA_HFOV === 'number' && !isNaN(CAMERA_HFOV) && CAMERA_HFOV > 0) ? CAMERA_HFOV : 69.7;
  const vfov = (typeof CAMERA_VFOV === 'number' && !isNaN(CAMERA_VFOV) && CAMERA_VFOV > 0) ? CAMERA_VFOV : 55.2;

  const framingMode = layer ? (layer.targetFramingMode || 'balanced') : 'balanced';
  const framingRatio = (framingMode === 'tight') ? 0.35 : ((framingMode === 'full') ? 1.0 : 0.55);

  const cullingMode = layer ? (layer.targetCullingMode || 'smartTrim') : 'smartTrim';
  const gridPass = layer ? (layer.targetGridPass || 'double') : 'double';
  const objectHeight = layer ? (parseFloat(layer.targetHeight) || 8) : 8;

  const centerLat = layer ? layer.centerLat : 0;
  const centerLon = layer ? layer.centerLon : 0;
  const localTargetPoly = getLocalTargetPolygon(layer, centerLat, centerLon, rotation);

  // Compute centroid of target polygon in grid-local space
  let centroidX = 0, centroidY = 0;
  if (localTargetPoly.length > 0) {
    localTargetPoly.forEach(pt => {
      centroidX += pt.x;
      centroidY += pt.y;
    });
    centroidX /= localTargetPoly.length;
    centroidY /= localTargetPoly.length;
  }

  let totalCandidates = 0;
  let activePhotosCount = 0;

  // Helper to process a single flight line of points
  function processFlightLine(linePoints, isContinuous) {
    if (!linePoints || linePoints.length === 0) return;
    totalCandidates += linePoints.length;

    // Evaluate visibility for each candidate point
    linePoints.forEach(pt => {
      let isVisible = false;
      let effectivePitch = (pt.pitch !== undefined && pt.pitch !== null) ? pt.pitch : defaultGimbalPitch;
      let effectiveHeading = pt.heading;

      if (cullingMode === 'convergent') {
        // Compute yaw and pitch to point directly at target centroid
        const dx = centroidX - pt.x;
        const dy = centroidY - pt.y;
        const distToCenter = Math.max(1.0, Math.sqrt(dx * dx + dy * dy));
        let centYaw = Math.atan2(dx, dy) * (180.0 / Math.PI);
        if (centYaw < 0) centYaw += 360;
        effectiveHeading = Math.round(centYaw * 10) / 10;
        const deltaZ = Math.max(2.0, (altitude || 50) - (objectHeight * 0.5));
        effectivePitch = -Math.atan2(deltaZ, distToCenter) * (180.0 / Math.PI);
        effectivePitch = Math.round(Math.max(-85, Math.min(-15, effectivePitch)));
        pt.heading = effectiveHeading;
        pt.pitch = effectivePitch;
        pt.headingMode = 'smoothTransition';
        pt.gridType = 'target-splat';
        isVisible = true; // Always pointed at target
      } else {
        isVisible = isTargetVisibleInFrustum(pt.x, pt.y, altitude, pt.heading, effectivePitch, hfov, vfov, localTargetPoly, objectHeight, framingRatio);
      }

      pt.targetVisible = isVisible;
    });

    if (cullingMode === 'smartTrim') {
      // Find first and last indices where target is visible
      let firstVisible = -1;
      let lastVisible = -1;
      for (let k = 0; k < linePoints.length; k++) {
        if (linePoints[k].targetVisible) {
          if (firstVisible === -1) firstVisible = k;
          lastVisible = k;
        }
      }

      if (firstVisible === -1) {
        // No photos on this entire line see the target; skip line entirely
        return;
      }

      // Add a 1-point margin for smooth turnaround lead-in/out
      const startIdx = Math.max(0, firstVisible - 1);
      const endIdx = Math.min(linePoints.length - 1, lastVisible + 1);

      const trimmedPoints = linePoints.slice(startIdx, endIdx + 1);

      trimmedPoints.forEach(pt => {
        if (pt.targetVisible) {
          photos.push({ x: pt.x, y: pt.y, heading: pt.heading, pitch: pt.pitch });
          activePhotosCount++;
        }
      });

      if (isContinuous) {
        waypoints.push(trimmedPoints[0]);
        if (trimmedPoints.length > 1) {
          waypoints.push(trimmedPoints[trimmedPoints.length - 1]);
        }
      } else {
        trimmedPoints.forEach(pt => {
          pt.skipPhoto = !pt.targetVisible;
          waypoints.push(pt);
        });
      }

    } else if (cullingMode === 'pruneOnly') {
      // Keep entire flight line but only trigger photos when target is visible
      linePoints.forEach(pt => {
        if (pt.targetVisible) {
          photos.push({ x: pt.x, y: pt.y, heading: pt.heading, pitch: pt.pitch });
          activePhotosCount++;
        }
      });

      if (isContinuous) {
        waypoints.push(linePoints[0]);
        waypoints.push(linePoints[linePoints.length - 1]);
      } else {
        linePoints.forEach(pt => {
          pt.skipPhoto = !pt.targetVisible;
          waypoints.push(pt);
        });
      }

    } else { // convergent
      linePoints.forEach(pt => {
        photos.push({ x: pt.x, y: pt.y, heading: pt.heading, pitch: pt.pitch });
        activePhotosCount++;
      });

      if (isContinuous) {
        waypoints.push(linePoints[0]);
        waypoints.push(linePoints[linePoints.length - 1]);
      } else {
        linePoints.forEach(pt => waypoints.push(pt));
      }
    }
  }

  // Pass 1: North-South flight lines
  const nLines = Math.max(2, Math.round(width / sLine) + 1);
  const nPhotos = Math.max(2, Math.round(height / sPhoto) + 1);
  const dxLine = nLines > 1 ? width / (nLines - 1) : 0;
  const dyPhoto = nPhotos > 1 ? height / (nPhotos - 1) : 0;
  const isContinuous = (captureMode === 'continuous' || captureMode === 'video');

  for (let i = 0; i < nLines; i++) {
    const x = -width / 2.0 + i * dxLine;
    const startFromSouth = (i % 2 === 0);
    const lineHeading = startFromSouth ? 0 : 180;
    const linePoints = [];

    for (let j = 0; j < nPhotos; j++) {
      const yIdx = startFromSouth ? j : (nPhotos - 1 - j);
      const y = -height / 2.0 + yIdx * dyPhoto;
      linePoints.push({ x: x, y: y, heading: lineHeading, pitch: defaultGimbalPitch, headingMode: 'smoothTransition', gridType: 'target-splat' });
    }

    processFlightLine(linePoints, isContinuous);
  }

  // Pass 2: Perpendicular lines (East-West) if Double Grid
  if (gridPass === 'double') {
    const nLines2 = Math.max(2, Math.round(height / sLine) + 1);
    const nPhotos2 = Math.max(2, Math.round(width / sPhoto) + 1);
    const dyLine2 = nLines2 > 1 ? height / (nLines2 - 1) : 0;
    const dxPhoto2 = nPhotos2 > 1 ? width / (nPhotos2 - 1) : 0;

    const pass1EndsAtNorth = ((nLines - 1) % 2 === 0);

    for (let i = 0; i < nLines2; i++) {
      const y = pass1EndsAtNorth
        ? (height / 2.0 - i * dyLine2)
        : (-height / 2.0 + i * dyLine2);

      const startFromWest = (i % 2 === 1);
      const lineHeading2 = startFromWest ? 90 : 270;
      const linePoints2 = [];

      for (let j = 0; j < nPhotos2; j++) {
        const xIdx = startFromWest ? j : (nPhotos2 - 1 - j);
        const x = -width / 2.0 + xIdx * dxPhoto2;
        linePoints2.push({ x: x, y: y, heading: lineHeading2, pitch: defaultGimbalPitch, headingMode: 'smoothTransition', gridType: 'target-splat' });
      }

      processFlightLine(linePoints2, isContinuous);
    }
  }

  // Save metrics to layer
  if (layer) {
    layer.targetCandidatePhotos = totalCandidates;
    layer.targetActivePhotos = activePhotosCount;
    layer.targetPrunedCount = Math.max(0, totalCandidates - activePhotosCount);
    layer.targetSavedPercent = totalCandidates > 0 ? Math.round((layer.targetPrunedCount / totalCandidates) * 100) : 0;
  }

  // Perimeter Orbit Pass (v1.77.4)
  if (layer && layer.targetPerimeterPass) {
    const standoff = parseFloat(layer.targetPerimeterStandoff) || 8;
    const orbitAlt = (layer.targetPerimeterAltitude !== null && layer.targetPerimeterAltitude !== undefined)
      ? parseFloat(layer.targetPerimeterAltitude)
      : null;
    const orbitPitch = parseFloat(layer.targetPerimeterPitch) || -55;
    const perimResult = generateTargetPerimeterOrbit(layer, standoff, orbitAlt, orbitPitch, sPhoto, centroidX, centroidY, localTargetPoly, altitude);

    if (perimResult.waypoints.length > 0) {
      let reorderedWps = perimResult.waypoints;
      let reorderedPhotos = perimResult.photos;

      if (waypoints.length > 0) {
        const lastGridWp = waypoints[waypoints.length - 1];
        // 1. Find closest perimeter orbit point to end of grid to avoid traversing across property
        let closestIdx = 0;
        let minD = Infinity;
        for (let k = 0; k < perimResult.waypoints.length; k++) {
          const d = Math.hypot(perimResult.waypoints[k].x - lastGridWp.x, perimResult.waypoints[k].y - lastGridWp.y);
          if (d < minD) {
            minD = d;
            closestIdx = k;
          }
        }
        reorderedWps = perimResult.waypoints.slice(closestIdx).concat(perimResult.waypoints.slice(0, closestIdx));
        reorderedPhotos = perimResult.photos.slice(closestIdx).concat(perimResult.photos.slice(0, closestIdx));

        // 2. Safe Clearance Transit Waypoint:
        // When transitioning from overhead grid down to perimeter facade altitude,
        // do not dive diagonally through the roofline or tree canopy!
        // Transit horizontally to the perimeter standoff coordinate at safe grid altitude first,
        // clearing all roof peaks and tree lines, before descending vertically in open air outside the building.
        const firstOrbitWp = reorderedWps[0];
        const safeTransitAlt = Math.max(altitude, firstOrbitWp.alt || altitude);
        if (safeTransitAlt > (firstOrbitWp.alt || altitude) + 0.5) {
          waypoints.push({
            x: firstOrbitWp.x,
            y: firstOrbitWp.y,
            alt: safeTransitAlt,
            pitch: firstOrbitWp.pitch,
            heading: firstOrbitWp.heading,
            headingMode: 'smoothTransition',
            gridType: 'target-splat',
            isTransition: true,
            skipPhoto: true,
            targetVisible: false,
            turnMode: 'stop'
          });
        }
      }

      // Mark the first orbit point as ring start so gimbal rotates to orbitPitch
      reorderedWps[0].isRingStart = true;
      reorderedWps.forEach(wp => waypoints.push(wp));
      reorderedPhotos.forEach(p => photos.push(p));
    }
  }

  return { waypoints, photos };
}

// Generate perimeter orbit waypoints around the target polygon at a given standoff distance.
// Each waypoint faces inward toward the polygon centroid (convergent heading).
// For radius mode or when no polygon exists, falls back to a circular orbit.
// (v1.77.4)
function generateTargetPerimeterOrbit(layer, standoffMeters, orbitAlt, orbitPitch, sPhoto, centroidX, centroidY, localTargetPoly, gridAlt) {
  const waypoints = [];
  const photos = [];

  // Build offset polygon: each vertex pushed outward from centroid by standoffMeters
  let offsetPoly = [];

  if (localTargetPoly && localTargetPoly.length >= 3) {
    // Polygon mode: expand each vertex outward from centroid
    offsetPoly = localTargetPoly.map(v => {
      const dx = v.x - centroidX;
      const dy = v.y - centroidY;
      const dist = Math.hypot(dx, dy);
      if (dist < 0.001) return { x: v.x + standoffMeters, y: v.y };
      return {
        x: v.x + (dx / dist) * standoffMeters,
        y: v.y + (dy / dist) * standoffMeters
      };
    });
  } else {
    // Radius mode: generate circle from targetRadius + standoff
    const r = (layer && layer.targetRadius ? parseFloat(layer.targetRadius) : 25) + standoffMeters;
    const nPts = Math.max(8, Math.round((2 * Math.PI * r) / Math.max(1, sPhoto)));
    for (let i = 0; i < nPts; i++) {
      const theta = (i / nPts) * 2 * Math.PI;
      offsetPoly.push({ x: centroidX + r * Math.cos(theta), y: centroidY + r * Math.sin(theta) });
    }
  }

  if (offsetPoly.length < 2) return { waypoints, photos };

  // Walk the offset polygon edges, placing one waypoint every ~sPhoto meters
  const targetHeight = (layer && layer.targetHeight) ? parseFloat(layer.targetHeight) : 8;
  const autoMinAlt = Math.max(12, targetHeight + 3);
  const effectiveAlt = (orbitAlt !== null && orbitAlt !== undefined && !isNaN(orbitAlt) && orbitAlt > 0)
    ? orbitAlt
    : Math.max(autoMinAlt, Math.round((gridAlt || 50) * 0.65 * 10) / 10);

  // Close the polygon
  const polyPts = [...offsetPoly, offsetPoly[0]];

  for (let i = 0; i < polyPts.length - 1; i++) {
    const a = polyPts[i];
    const b = polyPts[i + 1];
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    if (segLen < 0.01) continue;

    const nSteps = Math.max(1, Math.round(segLen / Math.max(0.5, sPhoto)));
    for (let s = 0; s < nSteps; s++) {
      const t = s / nSteps;
      const px = a.x + t * (b.x - a.x);
      const py = a.y + t * (b.y - a.y);

      // Heading: point inward toward centroid
      const dxC = centroidX - px;
      const dyC = centroidY - py;
      let heading = Math.atan2(dxC, dyC) * (180.0 / Math.PI);
      if (heading < 0) heading += 360;
      heading = Math.round(heading * 10) / 10;
      const effectiveOrbitPitch = Math.round(orbitPitch);

      const pt = {
        x: px,
        y: py,
        alt: effectiveAlt,
        pitch: effectiveOrbitPitch,
        heading: heading,
        headingMode: 'smoothTransition',
        isPerimeterOrbit: true,
        gridType: 'target-splat'
      };
      waypoints.push(pt);
      photos.push({ x: px, y: py, heading: heading, pitch: effectiveOrbitPitch });
    }
  }

  return { waypoints, photos };
}

// Convert relative coordinates (meters) to geodesic coordinates (Lat/Lon)
// Handles rotation (heading in degrees) relative to North
