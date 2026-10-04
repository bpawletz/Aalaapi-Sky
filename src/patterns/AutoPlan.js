let autoPlanActive = false;
let autoPlanRect = null;
let autoPlanStartLatLng = null;
let lastTouchMoveLatLng = null;
let autoPlanFootprintWidth = 0;
let autoPlanFootprintDepth = 0;
let autoPlanBounds = null;

function initAutoPlan() {
  const autoPlanBtn = document.getElementById('auto-plan-btn');
  const closeAutoPlanBtn = document.getElementById('close-auto-plan-btn');
  const apCancelBtn = document.getElementById('ap-cancel-btn');
  const apApplyBtn = document.getElementById('ap-apply-btn');
  const cancelDrawBtn = document.getElementById('cancel-draw-btn');
  
  const apHeightInput = document.getElementById('ap-height');
  const apClearanceInput = document.getElementById('ap-clearance');

  if (autoPlanBtn) {
    autoPlanBtn.addEventListener('click', () => {
      if (autoPlanActive) {
        exitAutoPlanMode();
      } else {
        enterAutoPlanMode();
      }
    });
  }

  if (closeAutoPlanBtn) {
    closeAutoPlanBtn.addEventListener('click', () => {
      hideAutoPlanModal(true);
    });
  }

  if (apCancelBtn) {
    apCancelBtn.addEventListener('click', () => {
      hideAutoPlanModal(true);
    });
  }

  if (cancelDrawBtn) {
    cancelDrawBtn.addEventListener('click', () => {
      exitAutoPlanMode();
    });
  }

  if (apApplyBtn) {
    apApplyBtn.addEventListener('click', () => {
      applyAutoPlan();
    });
  }

  // Live preview updates when inputs change
  if (apHeightInput) {
    apHeightInput.addEventListener('input', updateAutoPlanPreview);
  }
  if (apClearanceInput) {
    apClearanceInput.addEventListener('input', updateAutoPlanPreview);
  }

  // Sync unit labels inside modal
  const unit = getUnitSystem();
  const heightUnitEl = document.getElementById('ap-height-unit');
  const clearanceUnitEl = document.getElementById('ap-clearance-unit');
  if (heightUnitEl) heightUnitEl.textContent = unit === 'imperial' ? 'ft' : 'm';
  if (clearanceUnitEl) clearanceUnitEl.textContent = unit === 'imperial' ? 'ft' : 'm';
  
  // Set default values based on unit system
  if (unit === 'imperial') {
    if (apHeightInput) apHeightInput.value = 50; // ~15m
    if (apClearanceInput) apClearanceInput.value = 35; // ~10m
  } else {
    if (apHeightInput) apHeightInput.value = 15;
    if (apClearanceInput) apClearanceInput.value = 10;
  }
}

function enterAutoPlanMode() {
  autoPlanActive = true;
  const autoPlanBtn = document.getElementById('auto-plan-btn');
  if (autoPlanBtn) autoPlanBtn.classList.add('active');

  // Clear any existing mission so the user starts fresh
  if (centerMarker) { map.removeLayer(centerMarker); centerMarker = null; }
  clearAllPois();
  importedWaypoints = null;
  importedPhotos = null;
  importedFileName = null;
  generatedWaypoints = null;
  generatedPhotos = null;
  roadWaypoints = [];
  activeSplitStartIndices = new Set();
  if (flightPathPolyline) flightPathPolyline.clearLayers();
  if (roadPathGroup) roadPathGroup.clearLayers();
  if (gridBoundsPolygon) { map.removeLayer(gridBoundsPolygon); gridBoundsPolygon = null; }
  if (waypointMarkersGroup) waypointMarkersGroup.clearLayers();
  if (pitchLabelsGroup) pitchLabelsGroup.clearLayers();
  if (photoMarkersGroup) photoMarkersGroup.clearLayers();
  const clearImportedBtn = document.getElementById('clear-imported-btn');
  if (clearImportedBtn) clearImportedBtn.classList.add('hidden');
  toggleUIControlsState(false);
  updateStatsPanel(null);

  document.getElementById('auto-plan-banner').classList.remove('hidden');
  const mapContainer = document.getElementById('map');
  mapContainer.classList.add('map-crosshair');
  
  // Close any open popups to clean screen
  map.closePopup();
  
  // Disable map panning & zoom-handling during drag drawing
  map.dragging.disable();
  map.touchZoom.disable();
  map.doubleClickZoom.disable();
  map.boxZoom.disable();
  
  // Bind drawing listeners (mouse + touch)
  map.on('mousedown touchstart', onMapMouseDown);
  map.on('mousemove touchmove', onMapMouseMove);
  map.on('mouseup touchend', onMapMouseUp);

  // Bind DOM pointer events for stylus/pen
  if (mapContainer) {
    mapContainer.addEventListener('pointerdown', onDomPointerDown, { passive: false });
    mapContainer.addEventListener('pointermove', onDomPointerMove, { passive: false });
    mapContainer.addEventListener('pointerup', onDomPointerUp, { passive: false });
  }
}

function exitAutoPlanMode() {
  autoPlanActive = false;
  const autoPlanBtn = document.getElementById('auto-plan-btn');
  if (autoPlanBtn) autoPlanBtn.classList.remove('active');
  const banner = document.getElementById('auto-plan-banner');
  if (banner) banner.classList.add('hidden');
  const mapContainer = document.getElementById('map');
  if (mapContainer) mapContainer.classList.remove('map-crosshair');
  
  // Re-enable map features
  if (map) {
    map.dragging.enable();
    map.touchZoom.enable();
    map.doubleClickZoom.enable();
    map.boxZoom.enable();
    
    // Unbind drawing listeners
    map.off('mousedown touchstart', onMapMouseDown);
    map.off('mousemove touchmove', onMapMouseMove);
    map.off('mouseup touchend', onMapMouseUp);
    
    if (mapContainer) {
      mapContainer.removeEventListener('pointerdown', onDomPointerDown);
      mapContainer.removeEventListener('pointermove', onDomPointerMove);
      mapContainer.removeEventListener('pointerup', onDomPointerUp);
    }

    if (autoPlanRect) {
      map.removeLayer(autoPlanRect);
      autoPlanRect = null;
    }
  }
  autoPlanStartLatLng = null;
  lastTouchMoveLatLng = null;
}

function onDomPointerDown(e) {
  if (e.pointerType === 'mouse') return; // let mousedown handle it
  e.preventDefault(); // prevent browser handling
  const latlng = map.mouseEventToLatLng(e);
  onMapMouseDown({ latlng: latlng });
}

function onDomPointerMove(e) {
  if (e.pointerType === 'mouse') return;
  e.preventDefault();
  const latlng = map.mouseEventToLatLng(e);
  onMapMouseMove({ latlng: latlng });
}

function onDomPointerUp(e) {
  if (e.pointerType === 'mouse') return;
  e.preventDefault();
  const latlng = map.mouseEventToLatLng(e);
  onMapMouseUp({ latlng: latlng });
}

function onMapMouseDown(e) {
  // Store start coordinates
  autoPlanStartLatLng = e.latlng;
  lastTouchMoveLatLng = e.latlng;
  
  if (autoPlanRect) {
    map.removeLayer(autoPlanRect);
  }
  
  // Create dotted selection rectangle
  const bounds = L.latLngBounds(autoPlanStartLatLng, autoPlanStartLatLng);
  autoPlanRect = L.rectangle(bounds, {
    color: '#06b6d4',
    weight: 2,
    dashArray: '5, 5',
    fillColor: '#06b6d4',
    fillOpacity: 0.15,
    interactive: false
  }).addTo(map);
}

function onMapMouseMove(e) {
  if (e.latlng) {
    lastTouchMoveLatLng = e.latlng;
  }
  if (!autoPlanStartLatLng || !autoPlanRect) return;
  
  const currentLatLng = e.latlng || lastTouchMoveLatLng;
  if (!currentLatLng) return;
  
  const bounds = L.latLngBounds(autoPlanStartLatLng, currentLatLng);
  autoPlanRect.setBounds(bounds);
}

function onMapMouseUp(e) {
  if (!autoPlanStartLatLng || !autoPlanRect) return;
  
  const currentLatLng = e.latlng || lastTouchMoveLatLng;
  if (!currentLatLng) return;
  
  const bounds = L.latLngBounds(autoPlanStartLatLng, currentLatLng);
  autoPlanRect.setBounds(bounds);
  
  // Calculate footprint dimensions
  const southWest = bounds.getSouthWest();
  const northEast = bounds.getNorthEast();
  const northWest = L.latLng(northEast.lat, southWest.lng);
  
  const southEast = L.latLng(southWest.lat, northEast.lng);
  autoPlanFootprintWidth = southWest.distanceTo(southEast); // in meters
  autoPlanFootprintDepth = southWest.distanceTo(northWest); // in meters
  autoPlanBounds = bounds;

  if (autoPlanFootprintWidth < 1.0 && autoPlanFootprintDepth < 1.0) {
    // Too small (e.g. accidental tap)
    exitAutoPlanMode();
    return;
  }

  // Show the modal
  showAutoPlanModal();
  
  // Pause map listeners
  map.off('mousedown touchstart', onMapMouseDown);
  map.off('mousemove touchmove', onMapMouseMove);
  map.off('mouseup touchend', onMapMouseUp);
  
  const mapContainer = document.getElementById('map');
  if (mapContainer) {
    mapContainer.removeEventListener('pointerdown', onDomPointerDown);
    mapContainer.removeEventListener('pointermove', onDomPointerMove);
    mapContainer.removeEventListener('pointerup', onDomPointerUp);
  }

  // Re-enable map dragging
  map.dragging.enable();
  map.touchZoom.enable();
  map.doubleClickZoom.enable();
  map.boxZoom.enable();
  
  if (mapContainer) mapContainer.classList.remove('map-crosshair');
  const banner = document.getElementById('auto-plan-banner');
  if (banner) banner.classList.add('hidden');
}

function showAutoPlanModal() {
  const modal = document.getElementById('auto-plan-modal');
  if (!modal) return;

  // Record original settings in case of cancel
  originalMissionSettings = {
    gridType: document.getElementById('grid-type').value,
    altitude: document.getElementById('altitude').value,
    width: document.getElementById('grid-width').value,
    height: document.getElementById('grid-height').value,
    pitch: document.getElementById('gimbal-pitch').value,
    frontOverlap: document.getElementById('front-overlap').value,
    sideOverlap: document.getElementById('side-overlap').value,
    rotation: document.getElementById('grid-rotation').value,
    center: centerMarker ? centerMarker.getLatLng() : null,
    cameraModel: document.getElementById('camera-model').value,
    droneModel: document.getElementById('drone-model') ? document.getElementById('drone-model').value : '68',
    cameraHfov: document.getElementById('camera-hfov').value,
    cameraVfov: document.getElementById('camera-vfov').value
  };
  
  // Display measured footprint
  const unit = getUnitSystem();
  if (unit === 'imperial') {
    document.getElementById('ap-footprint-width').textContent = `${Math.round(autoPlanFootprintWidth * M_TO_FT)} ft`;
    document.getElementById('ap-footprint-depth').textContent = `${Math.round(autoPlanFootprintDepth * M_TO_FT)} ft`;
  } else {
    document.getElementById('ap-footprint-width').textContent = `${autoPlanFootprintWidth.toFixed(1)} m`;
    document.getElementById('ap-footprint-depth').textContent = `${autoPlanFootprintDepth.toFixed(1)} m`;
  }
  
  // Sync inputs unit labels
  document.getElementById('ap-height-unit').textContent = unit === 'imperial' ? 'ft' : 'm';
  document.getElementById('ap-clearance-unit').textContent = unit === 'imperial' ? 'ft' : 'm';

  // Configure range slider limits and defaults dynamically
  const heightSlider = document.getElementById('ap-height');
  const clearanceSlider = document.getElementById('ap-clearance');
  
  if (heightSlider && clearanceSlider) {
    if (unit === 'imperial') {
      heightSlider.min = 5;
      heightSlider.max = 600;
      heightSlider.step = 5;
      heightSlider.value = 50; // default 50 ft
      
      clearanceSlider.min = 5;
      clearanceSlider.max = 150;
      clearanceSlider.step = 5;
      clearanceSlider.value = 35; // default 35 ft
    } else {
      heightSlider.min = 1;
      heightSlider.max = 200;
      heightSlider.step = 1;
      heightSlider.value = 15; // default 15 m
      
      clearanceSlider.min = 2;
      clearanceSlider.max = 50;
      clearanceSlider.step = 1;
      clearanceSlider.value = 10; // default 10 m
    }
  }

  modal.classList.remove('hidden');
  const statsPanel = document.getElementById('stats-panel');
  if (statsPanel) {
    statsPanel.classList.add('on-top');
  }
  updateAutoPlanPreview();
}

function hideAutoPlanModal(isCancelled = false) {
  const modal = document.getElementById('auto-plan-modal');
  if (modal) {
    modal.classList.add('hidden');
  }
  const statsPanel = document.getElementById('stats-panel');
  if (statsPanel) {
    statsPanel.classList.remove('on-top');
  }
  if (isCancelled) {
    restoreOriginalSettings();
  } else {
    originalMissionSettings = null;
  }
  exitAutoPlanMode();
}

function restoreOriginalSettings() {
  if (!originalMissionSettings) return;

  const gridTypeEl = document.getElementById('grid-type');
  if (gridTypeEl) {
    gridTypeEl.value = originalMissionSettings.gridType;
    gridTypeEl.dispatchEvent(new Event('change'));
  }

  const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
  if (activeLayer && originalMissionSettings.gridType) {
    activeLayer.pattern = originalMissionSettings.gridType;
  }
  
  const altitudeEl = document.getElementById('altitude');
  if (altitudeEl) altitudeEl.value = originalMissionSettings.altitude;

  const widthEl = document.getElementById('grid-width');
  if (widthEl) widthEl.value = originalMissionSettings.width;

  const heightEl = document.getElementById('grid-height');
  if (heightEl) heightEl.value = originalMissionSettings.height;

  const pitchEl = document.getElementById('gimbal-pitch');
  if (pitchEl) pitchEl.value = originalMissionSettings.pitch;

  const frontOverlapEl = document.getElementById('front-overlap');
  if (frontOverlapEl) frontOverlapEl.value = originalMissionSettings.frontOverlap;

  const sideOverlapEl = document.getElementById('side-overlap');
  if (sideOverlapEl) sideOverlapEl.value = originalMissionSettings.sideOverlap;

  const rotationEl = document.getElementById('grid-rotation');
  if (rotationEl) rotationEl.value = originalMissionSettings.rotation;

  if (originalMissionSettings.center && centerMarker) {
    centerMarker.setLatLng(originalMissionSettings.center);
  }

  if (originalMissionSettings.cameraModel) {
    const cameraModelEl = document.getElementById('camera-model');
    if (cameraModelEl) cameraModelEl.value = originalMissionSettings.cameraModel;
  }
  if (originalMissionSettings.droneModel) {
    const droneModelEl = document.getElementById('drone-model');
    if (droneModelEl) droneModelEl.value = originalMissionSettings.droneModel;
  }
  if (originalMissionSettings.cameraHfov) {
    const hfovEl = document.getElementById('camera-hfov');
    if (hfovEl) hfovEl.value = originalMissionSettings.cameraHfov;
  }
  if (originalMissionSettings.cameraVfov) {
    const vfovEl = document.getElementById('camera-vfov');
    if (vfovEl) vfovEl.value = originalMissionSettings.cameraVfov;
  }

  syncDisplayValues();
  togglePatternParameters();
  updateGrid();

  originalMissionSettings = null;
}

function applyAutoPlanLive(plan) {
  if (!autoPlanBounds && (typeof window !== 'undefined' && window.autoPlanBounds)) {
    autoPlanBounds = window.autoPlanBounds;
  }
  if (!autoPlanBounds) return;

  const gridTypeEl = document.getElementById('grid-type');
  if (gridTypeEl) {
    gridTypeEl.value = plan.pattern;
    gridTypeEl.dispatchEvent(new Event('change'));
  }

  // Explicitly sync pattern selector cards highlight
  if (typeof document !== 'undefined' && typeof document.querySelectorAll === 'function') {
    const cards = document.querySelectorAll('.pattern-card');
    cards.forEach(card => {
      const cardVal = card.getAttribute('data-value');
      if (!cardVal) {
        card.classList.remove('active');
        return;
      }
      if (cardVal === plan.pattern) {
        card.classList.add('active');
      } else {
        card.classList.remove('active');
      }
    });
  }

  const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
  if (activeLayer) {
    activeLayer.pattern = plan.pattern;
    activeLayer.altitude = Math.round(plan.altitude);
    activeLayer.width = Math.round(plan.width);
    activeLayer.height = Math.round(plan.height);
    activeLayer.gimbalPitch = plan.gimbalPitch;
    activeLayer.overlapFront = plan.frontOverlap;
    activeLayer.overlapSide = plan.sideOverlap;
  }

  const altitudeEl = document.getElementById('altitude');
  if (altitudeEl) altitudeEl.value = Math.round(plan.altitude);

  const widthEl = document.getElementById('grid-width');
  if (widthEl) widthEl.value = Math.round(plan.width);

  const heightEl = document.getElementById('grid-height');
  if (heightEl) heightEl.value = Math.round(plan.height);

  const pitchEl = document.getElementById('gimbal-pitch');
  if (pitchEl) pitchEl.value = plan.gimbalPitch;

  const frontOverlapEl = document.getElementById('front-overlap');
  if (frontOverlapEl) frontOverlapEl.value = plan.frontOverlap;

  const sideOverlapEl = document.getElementById('side-overlap');
  if (sideOverlapEl) sideOverlapEl.value = plan.sideOverlap;

  const rotationEl = document.getElementById('grid-rotation');
  if (rotationEl) rotationEl.value = 0;

  const centerLatLng = autoPlanBounds.getCenter();
  // Always create/reposition the center marker, then trigger grid generation
  setGridCenter(centerLatLng.lat, centerLatLng.lng);

  syncDisplayValues();
  togglePatternParameters();
}

// Calculate preview values
function calculateAutoPlanParams() {
  const heightInputVal = parseFloat(document.getElementById('ap-height').value) || 15;
  const clearanceInputVal = parseFloat(document.getElementById('ap-clearance').value) || 10;
  
  // Convert inputs to meters for calculations
  const unit = getUnitSystem();
  let heightMeters = heightInputVal;
  let clearanceMeters = clearanceInputVal;
  
  if (unit === 'imperial') {
    heightMeters = heightInputVal * FT_TO_M;
    clearanceMeters = clearanceInputVal * FT_TO_M;
  }

  // 1. Altitude
  let altitudeM = heightMeters + clearanceMeters;
  altitudeM = Math.min(120, Math.max(10, altitudeM)); // Clamp to slider limits

  // 2. Pattern
  let pattern = 'double';
  const footprintMax = Math.max(autoPlanFootprintWidth, autoPlanFootprintDepth);

  if (heightMeters < 3.0) {
    pattern = 'double';
  } else if (footprintMax < 15.0) {
    pattern = 'multi-orbit';
  } else if (footprintMax <= 60.0) {
    if (heightMeters < 15.0) {
      pattern = 'grid-orbit-combo';
    } else {
      pattern = 'grid-multi-orbit-combo';
    }
  } else { // footprintMax > 60
    if (heightMeters < 15.0) {
      pattern = 'double';
    } else {
      pattern = 'grid-multi-orbit-combo';
    }
  }

  // 3. Grid size / Radius
  let finalWidthM = autoPlanFootprintWidth;
  let finalHeightM = autoPlanFootprintDepth;
  
  const diagonal = Math.sqrt(autoPlanFootprintWidth * autoPlanFootprintWidth + autoPlanFootprintDepth * autoPlanFootprintDepth);
  let orbitRadiusM = (diagonal / 2) + altitudeM * Math.tan((CAMERA_HFOV / 2.0) * Math.PI / 180.0) * 0.3;
  orbitRadiusM = Math.min(500, Math.max(20, orbitRadiusM));

  if (pattern === 'orbit' || pattern === 'multi-orbit' || pattern === 'grid-orbit-combo' || pattern === 'grid-multi-orbit-combo') {
    finalWidthM = orbitRadiusM;
    finalHeightM = orbitRadiusM; // unused by orbit slider but stored
  } else {
    // Add safety margins for grid coverage
    finalWidthM = Math.min(500, Math.max(20, autoPlanFootprintWidth + 15));
    finalHeightM = Math.min(500, Math.max(20, autoPlanFootprintDepth + 15));
  }

  // 4. Gimbal pitch
  let gimbalPitch = -90;
  if (pattern === 'orbit' || pattern === 'multi-orbit') {
    const altDiff = altitudeM - (heightMeters / 2);
    let pitch = -Math.atan2(altDiff, orbitRadiusM) * 180 / Math.PI;
    gimbalPitch = Math.min(-30, Math.max(-90, Math.round(pitch)));
  } else if (pattern === 'grid-orbit-combo' || pattern === 'grid-multi-orbit-combo') {
    // Oblique rings look at center, combo default Oblique is usually -45 or calculated
    const altDiff = altitudeM - (heightMeters / 2);
    let pitch = -Math.atan2(altDiff, orbitRadiusM) * 180 / Math.PI;
    gimbalPitch = Math.min(-30, Math.max(-90, Math.round(pitch)));
  } else {
    gimbalPitch = -90;
  }

  // 5. Overlaps
  let frontOverlap = 80;
  let sideOverlap = 75;
  if (heightMeters > 20) {
    frontOverlap = 85;
    sideOverlap = 80;
  }

  return {
    pattern,
    altitude: altitudeM,
    width: finalWidthM,
    height: finalHeightM,
    gimbalPitch,
    frontOverlap,
    sideOverlap
  };
}

function updateAutoPlanPreview() {
  // Update the height and clearance slider label readouts
  const heightSlider = document.getElementById('ap-height');
  const clearanceSlider = document.getElementById('ap-clearance');
  const heightValEl = document.getElementById('ap-height-val');
  const clearanceValEl = document.getElementById('ap-clearance-val');

  if (heightSlider && heightValEl) heightValEl.textContent = heightSlider.value;
  if (clearanceSlider && clearanceValEl) clearanceValEl.textContent = clearanceSlider.value;

  const plan = calculateAutoPlanParams();
  
  const patternLabelMap = {
    'single': '2D Map (Nadir Grid)',
    'double': '3D Splat (Double Grid)',
    'orbit': '3D Object (Circular Orbit)',
    'multi-orbit': '3D Object (Multi-Tiered Orbit)',
    'grid-orbit-combo': '2D + 3D Hybrid (Grid + Orbit Combo)',
    'grid-multi-orbit-combo': '2D + 3D Hybrid (Grid + Multi-Orbit)'
  };

  const patternNameEl = document.getElementById('ap-rec-pattern');
  if (patternNameEl) patternNameEl.textContent = patternLabelMap[plan.pattern] || plan.pattern;
  
  // Format altitude output
  const unit = getUnitSystem();
  const altEl = document.getElementById('ap-rec-altitude');
  const sizeEl = document.getElementById('ap-rec-size');
  const pitchEl = document.getElementById('ap-rec-pitch');

  if (unit === 'imperial') {
    if (altEl) altEl.textContent = `${Math.round(plan.altitude * M_TO_FT)} ft`;
    
    if (sizeEl) {
      if (plan.pattern.includes('orbit')) {
        sizeEl.textContent = `Radius: ${Math.round(plan.width * M_TO_FT)} ft`;
      } else {
        sizeEl.textContent = `${Math.round(plan.width * M_TO_FT)} x ${Math.round(plan.height * M_TO_FT)} ft`;
      }
    }
  } else {
    if (altEl) altEl.textContent = `${plan.altitude.toFixed(0)} m`;
    
    if (sizeEl) {
      if (plan.pattern.includes('orbit')) {
        sizeEl.textContent = `Radius: ${plan.width.toFixed(0)} m`;
      } else {
        sizeEl.textContent = `${plan.width.toFixed(0)} x ${plan.height.toFixed(0)} m`;
      }
    }
  }

  if (pitchEl) pitchEl.textContent = `${plan.gimbalPitch}°`;

  // Apply settings live to the map/mission details!
  applyAutoPlanLive(plan);
}

function applyAutoPlan() {
  const plan = calculateAutoPlanParams();
  if (!autoPlanBounds) return;

  applyAutoPlanLive(plan);

  // Pan map view to center the grid
  const centerLatLng = autoPlanBounds.getCenter();
  map.setView(centerLatLng, map.getZoom() < 17 ? 17 : map.getZoom());

  // Close modal without restoring original settings
  hideAutoPlanModal(false);
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function parseMetar(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const cleaned = raw.trim();
  const tokens = cleaned.split(/\s+/);
  if (tokens.length < 2) return null;

  let icao = null;
  let timestamp = null;
  let windSpeedKmH = null;
  let visSM = null;
  let ceilingFt = null;
  let fltCat = null;

  let idx = 0;
  if (tokens[idx] === 'METAR' || tokens[idx] === 'SPECI') idx++;
  if (idx < tokens.length && /^[A-Z0-9]{3,6}$/.test(tokens[idx])) {
    icao = tokens[idx];
    idx++;
  }

  // Optional modifier: AUTO, COR
  if (idx < tokens.length && (tokens[idx] === 'AUTO' || tokens[idx] === 'COR')) {
    idx++;
  }

  // Timestamp DDHHMMZ
  if (idx < tokens.length && /^\d{6}Z$/.test(tokens[idx])) {
    const timeToken = tokens[idx];
    const now = new Date();
    const day = parseInt(timeToken.slice(0, 2), 10);
    const hour = parseInt(timeToken.slice(2, 4), 10);
    const min = parseInt(timeToken.slice(4, 6), 10);
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day, hour, min));
    // If parsed day makes date in future by > 1 day, it's from previous month
    if (date.getTime() - now.getTime() > 86400000) {
      date.setUTCMonth(date.getUTCMonth() - 1);
    }
    timestamp = date.toISOString();
    idx++;
  }

  // Scan remaining tokens up to 'RMK'
  for (let i = idx; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === 'RMK') break;

    // Wind: 12010KT, VRB04KT, 24015G25KT, 00000KT
    const windMatch = t.match(/^(?:\d{3}|VRB)(\d{2,3})(?:G\d{2,3})?KT$/);
    if (windMatch && windSpeedKmH === null) {
      const kt = parseInt(windMatch[1], 10);
      windSpeedKmH = kt * 1.852;
      continue;
    }

    // Visibility US: e.g. 10SM, 7SM, 3/4SM, 1 1/2SM, M1/4SM
    if (t.endsWith('SM')) {
      let visStr = t.slice(0, -2);
      if (visStr.startsWith('M')) visStr = visStr.slice(1);
      if (visStr.includes('/')) {
        let whole = 0;
        if (i > idx && /^\d+$/.test(tokens[i - 1])) {
          whole = parseInt(tokens[i - 1], 10);
        }
        const [num, den] = visStr.split('/').map(Number);
        if (den) visSM = whole + (num / den);
      } else {
        const val = parseFloat(visStr);
        if (!isNaN(val)) visSM = val;
      }
      continue;
    }

    // Visibility CAVOK or 4-digit metric
    if (t === 'CAVOK') {
      visSM = 10;
      ceilingFt = 99999;
      continue;
    }
    if (/^\d{4}$/.test(t) && visSM === null && i < 7) {
      const meters = parseInt(t, 10);
      visSM = meters >= 9999 ? 10 : (meters / 1609.34);
      continue;
    }

    // Sky conditions: CLR, SKC, NCD, NSC
    if (t === 'CLR' || t === 'SKC' || t === 'NCD' || t === 'NSC') {
      if (ceilingFt === null) ceilingFt = 99999;
      continue;
    }

    // Cloud layers: BKN015, OVC020, VV002, etc. (FEW and SCT do not form a ceiling)
    const cloudMatch = t.match(/^(BKN|OVC|VV)(\d{3})/);
    if (cloudMatch) {
      const baseFt = parseInt(cloudMatch[2], 10) * 100;
      if (ceilingFt === null || baseFt < ceilingFt) {
        ceilingFt = baseFt;
      }
    }
  }

  // Calculate flight category
  const v = visSM !== null ? visSM : 99;
  const c = ceilingFt !== null ? ceilingFt : 99999;
  if (v < 1 || c < 500) {
    fltCat = 'LIFR';
  } else if (v < 3 || c < 1000) {
    fltCat = 'IFR';
  } else if (v <= 5 || c <= 3000) {
    fltCat = 'MVFR';
  } else {
    fltCat = 'VFR';
  }

  return {
    icao,
    timestamp,
    windSpeedKmH,
    visSM,
    ceilingFt: (ceilingFt === 99999) ? null : ceilingFt,
    fltCat,
    raw: cleaned
  };
}

/**
 * Offline Astronomical Solar Ephemeris & Flight Window Calculator
 * Implements pure JavaScript astronomical algorithms (NOAA / Jean Meeus equations).
 * Computes solar coordinates, solar noon, sunrise, sunset, civil/nautical/astronomical twilights,
 * sun elevation/azimuth, daylight remaining, and FAA Part 107 flight window states.
 */
const SolarEphemeris = {
  RAD: Math.PI / 180,
  DEG: 180 / Math.PI,

  toJulian(date) {
    const d = (date instanceof Date) ? date : new Date(date);
    return d.getTime() / 86400000 + 2440587.5;
  },

  fromJulian(j) {
    return new Date((j - 2440587.5) * 86400000);
  },

  toDays(date) {
    return this.toJulian(date) - 2451545.0;
  },

  solarCoordinates(d) {
    const M = (357.5291 + 0.98560028 * d) * this.RAD;
    const C = (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) * this.RAD;
    const P = 102.9372 * this.RAD;
    const L = M + C + P + Math.PI;
    const e = 23.4397 * this.RAD;
    const sinDec = Math.sin(L) * Math.sin(e);
    const dec = Math.asin(sinDec);
    const ra = Math.atan2(Math.sin(L) * Math.cos(e), Math.cos(L));
    return { dec, ra, L, M };
  },

  getSunPosition(date, lat, lon) {
    const d = this.toDays(date);
    const lw = -lon * this.RAD;
    const phi = lat * this.RAD;
    const sc = this.solarCoordinates(d);

    const theta = (280.1600 + 360.9856235 * d) * this.RAD - lw;
    const H = theta - sc.ra;

    const sinAlt = Math.sin(phi) * Math.sin(sc.dec) + Math.cos(phi) * Math.cos(sc.dec) * Math.cos(H);
    const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));

    const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(sc.dec) * Math.cos(phi));
    let azDeg = (az * this.DEG + 180) % 360;
    if (azDeg < 0) azDeg += 360;

    const compass = this.bearingToCompassDirection(azDeg);

    return {
      altitudeDeg: alt * this.DEG,
      azimuthDeg: azDeg,
      compassDirection: compass
    };
  },

  bearingToCompassDirection(bearing) {
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const idx = Math.round(((bearing % 360 + 360) % 360) / 22.5) % 16;
    return directions[idx];
  },

  getSolarTimesForDay(date, lat, lon) {
    const d = this.toDays(date);
    const phi = lat * this.RAD;
    const n = Math.round(d - 0.0009 - (-lon / 360));
    const Japprox = 2451545.0 + 0.0009 + (-lon / 360) + n;
    const sc = this.solarCoordinates(Japprox - 2451545.0);
    const Jnoon = Japprox + 0.0053 * Math.sin(sc.M) - 0.0069 * Math.sin(2 * sc.L);

    const self = this;
    function getTimes(h0) {
      const sinH0 = Math.sin(h0 * self.RAD);
      const cosH0 = (sinH0 - Math.sin(phi) * Math.sin(sc.dec)) / (Math.cos(phi) * Math.cos(sc.dec));
      if (cosH0 > 1) return { rise: null, set: null, status: 'always_down' };
      if (cosH0 < -1) return { rise: null, set: null, status: 'always_up' };
      const H0 = Math.acos(cosH0);
      const Jrise = Jnoon - H0 / (2 * Math.PI);
      const Jset = Jnoon + H0 / (2 * Math.PI);
      return { rise: self.fromJulian(Jrise), set: self.fromJulian(Jset), status: 'normal' };
    }

    return {
      noon: this.fromJulian(Jnoon),
      official: getTimes(-0.833),
      civil: getTimes(-6.0),
      nautical: getTimes(-12.0),
      astronomical: getTimes(-18.0),
      goldenHour: getTimes(6.0)
    };
  },

  formatTime(date) {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) return '--:--';
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  },

  formatDuration(minutes) {
    if (minutes == null || isNaN(minutes) || minutes < 0) return '0m';
    const hrs = Math.floor(minutes / 60);
    const mins = Math.floor(minutes % 60);
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins}m`;
  },

  getSolar24hWindow(nowInput, lat, lon) {
    const now = (nowInput instanceof Date) ? nowInput : new Date(nowInput || Date.now());
    const tNow = now.getTime();

    const timesToday = this.getSolarTimesForDay(now, lat, lon);
    const tomorrow = new Date(tNow + 86400000);
    const timesTomorrow = this.getSolarTimesForDay(tomorrow, lat, lon);
    const yesterday = new Date(tNow - 86400000);
    const timesYesterday = this.getSolarTimesForDay(yesterday, lat, lon);

    const allEvents = [];
    [timesYesterday, timesToday, timesTomorrow].forEach(t => {
      if (t.astronomical.rise) allEvents.push({ type: 'astronomical_dawn', name: 'Astronomical Dawn', time: t.astronomical.rise, icon: '🌌' });
      if (t.nautical.rise) allEvents.push({ type: 'nautical_dawn', name: 'Nautical Dawn', time: t.nautical.rise, icon: '⚓' });
      if (t.civil.rise) allEvents.push({ type: 'civil_dawn', name: 'Civil Dawn', time: t.civil.rise, icon: '🌅', faaTwilight: true });
      if (t.official.rise) allEvents.push({ type: 'sunrise', name: 'Sunrise', time: t.official.rise, icon: '☀️', isKey: true });
      if (t.goldenHour.rise) allEvents.push({ type: 'golden_hour_end', name: 'Golden Hour Ends', time: t.goldenHour.rise, icon: '📸' });
      if (t.noon) allEvents.push({ type: 'solar_noon', name: 'Solar Noon', time: t.noon, icon: '☀️' });
      if (t.goldenHour.set) allEvents.push({ type: 'golden_hour_start', name: 'Golden Hour Begins', time: t.goldenHour.set, icon: '📸' });
      if (t.official.set) allEvents.push({ type: 'sunset', name: 'Sunset', time: t.official.set, icon: '🌇', isKey: true });
      if (t.civil.set) allEvents.push({ type: 'civil_dusk', name: 'Civil Dusk', time: t.civil.set, icon: '🌆', faaTwilight: true });
      if (t.nautical.set) allEvents.push({ type: 'nautical_dusk', name: 'Nautical Dusk', time: t.nautical.set, icon: '⚓' });
      if (t.astronomical.set) allEvents.push({ type: 'astronomical_dusk', name: 'Astronomical Dusk', time: t.astronomical.set, icon: '🌌' });
    });

    allEvents.sort((a, b) => a.time.getTime() - b.time.getTime());

    const windowEnd = tNow + 86400000;
    const timeline24h = allEvents.filter(e => e.time.getTime() >= tNow && e.time.getTime() <= windowEnd);

    const nextSunriseEvent = allEvents.find(e => e.type === 'sunrise' && e.time.getTime() >= tNow);
    const nextSunsetEvent = allEvents.find(e => e.type === 'sunset' && e.time.getTime() >= tNow);

    const pastEvents = allEvents.filter(e => e.time.getTime() <= tNow);
    const lastSunrise = [...pastEvents].reverse().find(e => e.type === 'sunrise');
    const lastSunset = [...pastEvents].reverse().find(e => e.type === 'sunset');
    const lastCivilDawn = [...pastEvents].reverse().find(e => e.type === 'civil_dawn');
    const lastCivilDusk = [...pastEvents].reverse().find(e => e.type === 'civil_dusk');

    let isDaylight = false;
    let isCivilTwilight = false;
    let daylightRemainingMs = 0;
    let faaCategory = 'NIGHT';
    let faaBadgeText = 'Night';
    let faaBadgeColor = '#ef4444';
    let faaAdvisory = '';

    const nextCivilDuskEvent = allEvents.find(e => e.type === 'civil_dusk' && e.time.getTime() >= tNow);

    if (timesToday.official.status === 'always_up') {
      isDaylight = true;
      faaCategory = 'POLAR_DAY';
      faaBadgeText = 'Midnight Sun';
      faaBadgeColor = '#10b981';
      daylightRemainingMs = 86400000;
      faaAdvisory = '24-Hour Continuous Daylight (Midnight Sun)';
    } else if (timesToday.official.status === 'always_down') {
      isDaylight = false;
      faaCategory = 'POLAR_NIGHT';
      faaBadgeText = 'Polar Night';
      faaBadgeColor = '#ef4444';
      daylightRemainingMs = 0;
      faaAdvisory = '24-Hour Continuous Night (Anti-Collision Strobe Required)';
    } else if (lastSunrise && (!lastSunset || lastSunrise.time.getTime() > lastSunset.time.getTime())) {
      isDaylight = true;
      const sunsetMs = nextSunsetEvent ? nextSunsetEvent.time.getTime() : 0;
      daylightRemainingMs = Math.max(0, sunsetMs - tNow);
      faaCategory = 'DAYLIGHT';
      faaBadgeText = 'Daylight';
      faaBadgeColor = '#10b981';
      const duskStr = nextCivilDuskEvent ? this.formatTime(nextCivilDuskEvent.time) : '';
      faaAdvisory = duskStr
        ? `Legal civil twilight flight permitted until ${duskStr} (+30 min with anti-collision lights).`
        : 'Standard FAA daylight flight operations permitted.';
    } else if (lastSunset && (!lastCivilDusk || lastSunset.time.getTime() > lastCivilDusk.time.getTime())) {
      isCivilTwilight = true;
      faaCategory = 'CIVIL_TWILIGHT_EVENING';
      faaBadgeText = 'Civil Twilight';
      faaBadgeColor = '#f59e0b';
      const remainingDuskMs = nextCivilDuskEvent ? Math.max(0, nextCivilDuskEvent.time.getTime() - tNow) : 0;
      const duskStr = nextCivilDuskEvent ? this.formatTime(nextCivilDuskEvent.time) : '';
      faaAdvisory = `Evening civil twilight: ${this.formatDuration(Math.floor(remainingDuskMs / 60000))} remaining (ends ${duskStr}). Anti-collision strobe required.`;
    } else if (lastCivilDawn && (!lastSunrise || lastCivilDawn.time.getTime() > lastSunrise.time.getTime())) {
      isCivilTwilight = true;
      faaCategory = 'CIVIL_TWILIGHT_MORNING';
      faaBadgeText = 'Civil Twilight';
      faaBadgeColor = '#f59e0b';
      const riseStr = nextSunriseEvent ? this.formatTime(nextSunriseEvent.time) : '';
      faaAdvisory = `Morning civil twilight: Sunrise at ${riseStr}. Anti-collision strobe required.`;
    } else {
      faaCategory = 'NIGHT';
      faaBadgeText = 'Night';
      faaBadgeColor = '#ef4444';
      const nextDawnEvent = allEvents.find(e => e.type === 'civil_dawn' && e.time.getTime() >= tNow);
      const dawnStr = nextDawnEvent ? this.formatTime(nextDawnEvent.time) : '';
      const dawnCountdown = nextDawnEvent ? this.formatDuration(Math.floor((nextDawnEvent.time.getTime() - tNow) / 60000)) : '';
      faaAdvisory = dawnStr
        ? `Night flight: Next civil dawn in ${dawnCountdown} (${dawnStr}). Part 107.29 anti-collision strobe & training required.`
        : 'Night flight: Part 107.29 anti-collision strobe & night training required.';
    }

    const pos = this.getSunPosition(now, lat, lon);

    return {
      now,
      coordinates: { lat, lon },
      isDaylight,
      isCivilTwilight,
      daylightRemainingMinutes: Math.floor(daylightRemainingMs / 60000),
      daylightRemainingFormatted: this.formatDuration(Math.floor(daylightRemainingMs / 60000)),
      faaCategory,
      faaBadgeText,
      faaBadgeColor,
      faaAdvisory,
      nextSunrise: nextSunriseEvent ? nextSunriseEvent.time : null,
      nextSunset: nextSunsetEvent ? nextSunsetEvent.time : null,
      currentPosition: pos,
      twilights: {
        civilDawn: timesToday.civil.rise,
        civilDusk: timesToday.civil.set,
        nauticalDawn: timesToday.nautical.rise,
        nauticalDusk: timesToday.nautical.set,
        astronomicalDawn: timesToday.astronomical.rise,
        astronomicalDusk: timesToday.astronomical.set,
        solarNoon: timesToday.noon
      },
      timeline24h
    };
  }
};

let currentSolarEphemeris = null;
let solarEphemerisTickerInterval = null;

function renderSolarCardUI(ephemeris) {
  if (!ephemeris || typeof document === 'undefined' || !document || !document.getElementById) return;

  const now = ephemeris.now || new Date();

  function formatRelative(targetDate) {
    if (!targetDate) return '';
    const diffMs = targetDate.getTime() - now.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins <= 0) return 'now';
    return `in ${SolarEphemeris.formatDuration(diffMins)}`;
  }

  const sunriseText = ephemeris.nextSunrise
    ? `${SolarEphemeris.formatTime(ephemeris.nextSunrise)} <span style="opacity:0.75; font-size:0.68rem; font-weight:normal;">(${formatRelative(ephemeris.nextSunrise)})</span>`
    : 'No Sunrise (Polar)';

  const sunsetText = ephemeris.nextSunset
    ? `${SolarEphemeris.formatTime(ephemeris.nextSunset)} <span style="opacity:0.75; font-size:0.68rem; font-weight:normal;">(${formatRelative(ephemeris.nextSunset)})</span>`
    : 'No Sunset (Polar)';

  let remainingText = '';
  if (ephemeris.isDaylight) {
    remainingText = `${ephemeris.daylightRemainingFormatted} remaining`;
  } else if (ephemeris.isCivilTwilight) {
    remainingText = `Civil Twilight (${ephemeris.faaBadgeText})`;
  } else {
    remainingText = `0h 0m (Night Flight)`;
  }

  const anglesText = `☀️ Alt: ${ephemeris.currentPosition.altitudeDeg >= 0 ? '+' : ''}${ephemeris.currentPosition.altitudeDeg.toFixed(1)}° • Az: ${ephemeris.currentPosition.azimuthDeg.toFixed(0)}° (${ephemeris.currentPosition.compassDirection})`;

  function buildTimelineHtml(timeline) {
    if (!Array.isArray(timeline) || timeline.length === 0) {
      return '<div style="color: var(--text-muted); font-size: 0.68rem;">No solar events within 24h</div>';
    }
    return timeline.map(ev => {
      const rel = formatRelative(ev.time);
      const isKey = ev.isKey ? 'font-weight: 700; color: #38bdf8;' : 'color: var(--text-main);';
      return `
        <div class="psolar-timeline-item" style="display: flex; justify-content: space-between; align-items: center; padding: 2px 4px; border-radius: 4px; ${isKey}">
          <span>${ev.icon} ${escapeHtml(ev.name)}</span>
          <span><b>${SolarEphemeris.formatTime(ev.time)}</b> <span style="opacity: 0.7; font-size: 0.64rem;">(${rel})</span></span>
        </div>
      `;
    }).join('');
  }

  // Update Topbar Popover
  const popSunrise = document.getElementById('pop-solar-sunrise');
  const popSunset = document.getElementById('pop-solar-sunset');
  const popRemaining = document.getElementById('pop-solar-remaining');
  const popFaaBadge = document.getElementById('pop-solar-faa-badge');
  const popAdvisory = document.getElementById('pop-solar-window-advisory');
  const popAngles = document.getElementById('pop-solar-angles');
  const popTimeline = document.getElementById('pop-solar-timeline');

  if (popSunrise) popSunrise.innerHTML = sunriseText;
  if (popSunset) popSunset.innerHTML = sunsetText;
  if (popRemaining) popRemaining.innerHTML = remainingText;
  if (popFaaBadge) {
    popFaaBadge.textContent = ephemeris.faaBadgeText;
    popFaaBadge.style.color = ephemeris.faaBadgeColor;
    popFaaBadge.style.borderColor = ephemeris.faaBadgeColor;
    popFaaBadge.style.background = ephemeris.faaBadgeColor === '#10b981' ? 'rgba(16, 185, 129, 0.15)' : (ephemeris.faaBadgeColor === '#f59e0b' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(239, 68, 68, 0.15)');
  }
  if (popAdvisory) popAdvisory.textContent = ephemeris.faaAdvisory;
  if (popAngles) popAngles.textContent = anglesText;
  if (popTimeline) popTimeline.innerHTML = buildTimelineHtml(ephemeris.timeline24h);

  // Update Sidebar Card
  const statSunrise = document.getElementById('stat-solar-sunrise');
  const statSunset = document.getElementById('stat-solar-sunset');
  const statRemaining = document.getElementById('stat-solar-remaining');
  const statFaaBadge = document.getElementById('stat-solar-faa-badge');
  const statAdvisory = document.getElementById('stat-solar-window-advisory');
  const statAngles = document.getElementById('stat-solar-angles');
  const statTimeline = document.getElementById('stat-solar-timeline');

  if (statSunrise) statSunrise.innerHTML = sunriseText;
  if (statSunset) statSunset.innerHTML = sunsetText;
  if (statRemaining) statRemaining.innerHTML = remainingText;
  if (statFaaBadge) {
    statFaaBadge.textContent = ephemeris.faaBadgeText;
    statFaaBadge.style.color = ephemeris.faaBadgeColor;
    statFaaBadge.style.borderColor = ephemeris.faaBadgeColor;
    statFaaBadge.style.background = ephemeris.faaBadgeColor === '#10b981' ? 'rgba(16, 185, 129, 0.15)' : (ephemeris.faaBadgeColor === '#f59e0b' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(239, 68, 68, 0.15)');
  }
  if (statAdvisory) statAdvisory.textContent = ephemeris.faaAdvisory;
  if (statAngles) statAngles.textContent = anglesText;
  if (statTimeline) statTimeline.innerHTML = buildTimelineHtml(ephemeris.timeline24h);

  // Hook toggle button listeners if not already bound
  initSolarEphemerisEventListeners();
}

let solarListenersBound = false;
function initSolarEphemerisEventListeners() {
  if (solarListenersBound || typeof document === 'undefined' || !document || !document.getElementById) return;
  solarListenersBound = true;

  const popToggleBtn = document.getElementById('pop-btn-toggle-solar-timeline');
  const popTimeline = document.getElementById('pop-solar-timeline');
  if (popToggleBtn && popTimeline) {
    popToggleBtn.onclick = (e) => {
      if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
      const isHidden = popTimeline.classList.toggle('hidden');
      popToggleBtn.textContent = isHidden ? '▾ 24h Timeline' : '▴ 24h Timeline';
    };
  }

  const statToggleBtn = document.getElementById('stat-btn-toggle-solar-timeline');
  const statTimeline = document.getElementById('stat-solar-timeline');
  if (statToggleBtn && statTimeline) {
    statToggleBtn.onclick = (e) => {
      if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
      const isHidden = statTimeline.classList.toggle('hidden');
      statToggleBtn.textContent = isHidden ? '▾ 24h Timeline' : '▴ 24h Timeline';
    };
  }
}

function updateSolarEphemeris(centerLat, centerLon, forceTime = null) {
  let lat = centerLat;
  let lon = centerLon;

  if (lat == null || lon == null || isNaN(lat) || isNaN(lon)) {
    if (typeof centerMarker !== 'undefined' && centerMarker && typeof centerMarker.getLatLng === 'function') {
      const ll = centerMarker.getLatLng();
      lat = ll.lat;
      lon = ll.lng;
    } else if (typeof map !== 'undefined' && map && typeof map.getCenter === 'function') {
      const c = map.getCenter();
      lat = c.lat;
      lon = c.lng;
    } else {
      lat = 41.3215;
      lon = -88.9950;
    }
  }

  const now = forceTime || new Date();
  const ephemeris = SolarEphemeris.getSolar24hWindow(now, lat, lon);
  currentSolarEphemeris = ephemeris;

  renderSolarCardUI(ephemeris);
  return ephemeris;
}

let lastWeatherFetchCenter = null;

async function fetchAndProcessWeather(centerLat, centerLon, force = false) {
  try {
    if (typeof updateSolarEphemeris === 'function') {
      updateSolarEphemeris(centerLat, centerLon);
    }
    // Only fetch weather if center changed by > 5km, wasn't fetched yet, or forced
    if (!force && lastWeatherFetchCenter) {
      const dist = calculateDistance(centerLat, centerLon, lastWeatherFetchCenter.lat, lastWeatherFetchCenter.lon);
      if (dist < 5) return;
    }

    lastWeatherFetchCenter = { lat: centerLat, lon: centerLon };
    updateWeatherPanelUI(null, "Loading...", true);

    const headers = { 'User-Agent': 'AalaapiSkyMissionPlanner/1.0' };

    // 1. Get the gridpoint stations for the center location
    const pointUrl = `https://api.weather.gov/points/${centerLat.toFixed(4)},${centerLon.toFixed(4)}`;
    const pointRes = await fetch(pointUrl, { headers });
    if (!pointRes.ok) throw new Error("Failed to fetch NWS grid points");
    const pointData = await pointRes.json();
    const stationsUrl = pointData.properties.observationStations;

    // 2. Fetch the list of observation stations
    const stationsRes = await fetch(stationsUrl, { headers });
    if (!stationsRes.ok) throw new Error("Failed to fetch NWS stations");
    const stationsData = await stationsRes.json();

    const stations = stationsData.features || [];
    if (!stations.length) throw new Error("No stations found");

    // Sort all stations by distance from mission center
    const sortedStations = stations.map(f => {
      const slon = f.geometry.coordinates[0];
      const slat = f.geometry.coordinates[1];
      const d = calculateDistance(centerLat, centerLon, slat, slon);
      return {
        id: f.properties.stationIdentifier,
        name: f.properties.name,
        lat: slat,
        lon: slon,
        dist: d
      };
    }).sort((a, b) => a.dist - b.dist);

    const topStations = sortedStations.slice(0, 4);

    // 3. Fetch latest observations from NWS and real-time live METARs in parallel
    const stationIds = topStations.map(st => st.id).filter(Boolean);
    const [obsResults, vatsimResult] = await Promise.all([
      Promise.allSettled(
        topStations.map(st =>
          fetch(`https://api.weather.gov/stations/${st.id}/observations/latest`, { headers })
            .then(res => res.ok ? res.json() : null)
            .catch(() => null)
        )
      ),
      stationIds.length > 0
        ? fetch(`https://metar.vatsim.net/metar.php?id=${stationIds.join(',')}`)
            .then(res => res.ok ? res.text() : null)
            .catch(() => null)
        : Promise.resolve(null)
    ]);

    // Parse real-time live METAR lines into map by ICAO
    const liveMetarMap = new Map();
    if (vatsimResult && typeof vatsimResult === 'string') {
      const lines = vatsimResult.split('\n');
      for (const line of lines) {
        const parsed = parseMetar(line);
        if (parsed && parsed.icao) {
          liveMetarMap.set(parsed.icao.toUpperCase(), parsed);
        }
      }
    }

    const stationDataList = [];
    topStations.forEach((st, idx) => {
      const res = obsResults[idx];
      const obsData = (res && res.status === 'fulfilled' && res.value) ? res.value : null;

      let fltCat = null;
      let visSM = null;
      let ceilingFt = null;
      let windSpeedKmH = null;
      let timestamp = null;
      let raw = null;

      // Extract NWS data if available
      let nwsTimestamp = null;
      if (obsData && obsData.properties) {
        nwsTimestamp = obsData.properties.timestamp || null;
        fltCat = obsData.properties.flightCategory || null;

        if (obsData.properties.visibility && obsData.properties.visibility.value != null) {
          visSM = obsData.properties.visibility.value / 1609.34;
        }

        if (obsData.properties.windSpeed && obsData.properties.windSpeed.value != null) {
          const rawVal = obsData.properties.windSpeed.value;
          const unitCode = String(obsData.properties.windSpeed.unitCode || '');
          if (unitCode.includes('m_s-1') || unitCode.includes('m/s')) {
            windSpeedKmH = rawVal * 3.6;
          } else if (unitCode.includes('knot') || unitCode.includes('kt')) {
            windSpeedKmH = rawVal * 1.852;
          } else {
            windSpeedKmH = rawVal;
          }
        }

        if (Array.isArray(obsData.properties.cloudLayers)) {
          for (let layer of obsData.properties.cloudLayers) {
            if (layer.amount === 'OVC' || layer.amount === 'BKN' || layer.amount === 'VV') {
              if (layer.base && layer.base.value != null) {
                let baseFt = layer.base.value * 3.28084;
                if (ceilingFt === null || baseFt < ceilingFt) {
                  ceilingFt = baseFt;
                }
              }
            }
          }
        }

        if (!fltCat) {
          if (visSM !== null || ceilingFt !== null) {
            let v = visSM !== null ? visSM : 99;
            let c = ceilingFt !== null ? ceilingFt : 99999;

            if (v < 1 || c < 500) {
              fltCat = "LIFR";
            } else if (v < 3 || c < 1000) {
              fltCat = "IFR";
            } else if (v <= 5 || c <= 3000) {
              fltCat = "MVFR";
            } else {
              fltCat = "VFR";
            }
          }
        }

        timestamp = nwsTimestamp;
        raw = obsData.properties.rawMessage || obsData.properties.textDescription || "No raw METAR";
      }

      // Check if real-time live METAR is available and fresher than NWS
      const liveMetar = liveMetarMap.get(String(st.id || '').toUpperCase());
      if (liveMetar) {
        let useLiveMetar = false;
        if (!timestamp) {
          useLiveMetar = true;
        } else if (liveMetar.timestamp) {
          const liveTime = Date.parse(liveMetar.timestamp);
          const nwsTime = Date.parse(timestamp);
          // If live METAR is equal or newer than NWS, or NWS timestamp is invalid
          if (isNaN(nwsTime) || (!isNaN(liveTime) && liveTime >= nwsTime)) {
            useLiveMetar = true;
          }
        } else {
          useLiveMetar = true;
        }

        if (useLiveMetar) {
          fltCat = liveMetar.fltCat || fltCat;
          if (liveMetar.visSM !== null) visSM = liveMetar.visSM;
          ceilingFt = liveMetar.ceilingFt;
          if (liveMetar.windSpeedKmH !== null) windSpeedKmH = liveMetar.windSpeedKmH;
          if (liveMetar.timestamp) timestamp = liveMetar.timestamp;
          if (liveMetar.raw) raw = liveMetar.raw;
        }
      }

      // Fallback: If flight category is still missing and raw message exists, parse raw METAR
      if (!fltCat && raw && typeof raw === 'string') {
        const parsedNwsRaw = parseMetar(raw);
        if (parsedNwsRaw) {
          fltCat = parsedNwsRaw.fltCat;
          if (visSM === null && parsedNwsRaw.visSM !== null) visSM = parsedNwsRaw.visSM;
          if (ceilingFt === null && parsedNwsRaw.ceilingFt !== null) ceilingFt = parsedNwsRaw.ceilingFt;
        }
      }

      const bearing = getCompassBearing(centerLat, centerLon, st.lat, st.lon);
      const compassDir = bearingToCompassDirection(bearing);

      stationDataList.push({
        icaoId: st.id,
        name: st.name,
        lat: st.lat,
        lon: st.lon,
        distance: st.dist,
        bearing: bearing,
        compassDir: compassDir,
        fltCat: fltCat,
        visibilitySM: visSM,
        ceilingFt: ceilingFt,
        windSpeedKmH: windSpeedKmH,
        timestamp: timestamp,
        raw: raw || "No raw METAR"
      });
    });

    let directions = null;
    if (stationDataList.length > 0) {
      directions = {
        closest: stationDataList[0],
        stations: stationDataList,
        activeIndex: 0
      };
      currentWeatherDirections = directions;
      activeWeatherStationIndex = 0;
    }

    updateWeatherPanelUI(directions, null, false);

  } catch (error) {
    Logger.error("Error fetching weather data:", error);
    updateWeatherPanelUI(null, "Error", false);
  }
}




const WIND_SPEED_SVG_ICON = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: text-bottom; display: inline-block;"><path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2M9.6 4.6A2 2 0 1 1 11 8H2M12.6 19.4A2 2 0 1 0 14 16H2"/></svg>`;

function formatWindSpeed(speedKmH) {
  if (speedKmH == null || isNaN(speedKmH)) return "Calm / Unknown";
  const sys = (typeof getUnitSystem === 'function') ? getUnitSystem() : 'imperial';
  if (sys === 'metric') {
    return `${Number(speedKmH).toFixed(1)} km/h`;
  }
  const speedMph = Number(speedKmH) * 0.621371;
  return `${speedMph.toFixed(1)} mph`;
}

function updateWeatherStationMarker(closest, allStations, activeIdx) {
  if (typeof map === 'undefined' || !map || typeof L === 'undefined') return;

  const currentStations = Array.isArray(allStations) ? allStations : (closest ? [closest] : []);
  const currentIdx = (typeof activeIdx === 'number' && activeIdx >= 0 && activeIdx < currentStations.length) ? activeIdx : 0;
  const activeStation = currentStations[currentIdx] || closest;

  if (!activeStation || activeStation.lat == null || activeStation.lon == null) {
    if (weatherStationMarker) {
      if (weatherStationLayer && typeof weatherStationLayer.removeLayer === 'function') {
        try { weatherStationLayer.removeLayer(weatherStationMarker); } catch (e) {}
      } else if (map && typeof map.removeLayer === 'function') {
        try { map.removeLayer(weatherStationMarker); } catch (e) {}
      }
      weatherStationMarker = null;
    }
    if (Array.isArray(weatherStationMarkers)) {
      weatherStationMarkers.forEach(m => {
        if (weatherStationLayer && typeof weatherStationLayer.removeLayer === 'function') {
          try { weatherStationLayer.removeLayer(m); } catch (e) {}
        } else if (map && typeof map.removeLayer === 'function') {
          try { map.removeLayer(m); } catch (e) {}
        }
      });
      weatherStationMarkers = [];
    }
    if (weatherStationLine) {
      if (weatherStationLayer && typeof weatherStationLayer.removeLayer === 'function') {
        try { weatherStationLayer.removeLayer(weatherStationLine); } catch (e) {}
      } else if (map && typeof map.removeLayer === 'function') {
        try { map.removeLayer(weatherStationLine); } catch (e) {}
      }
      weatherStationLine = null;
    }
    return;
  }

  // Clear previous secondary markers
  if (Array.isArray(weatherStationMarkers)) {
    weatherStationMarkers.forEach(m => {
      if (m !== weatherStationMarker) {
        if (weatherStationLayer && typeof weatherStationLayer.removeLayer === 'function') {
          try { weatherStationLayer.removeLayer(m); } catch (e) {}
        } else if (map && typeof map.removeLayer === 'function') {
          try { map.removeLayer(m); } catch (e) {}
        }
      }
    });
    weatherStationMarkers = [];
  }

  const icao = activeStation.icaoId || 'NWS';
  const name = activeStation.name || 'Observation Station';
  const cDir = activeStation.compassDir || (typeof centerMarker !== 'undefined' && centerMarker && typeof getCompassBearing === 'function' ? bearingToCompassDirection(getCompassBearing(centerMarker.getLatLng().lat, centerMarker.getLatLng().lng, activeStation.lat, activeStation.lon)) : '');
  const distKm = (activeStation.distance != null) ? Number(activeStation.distance).toFixed(1) : '-';
  const distMi = (activeStation.distance != null) ? (Number(activeStation.distance) * 0.621371).toFixed(1) : '-';
  const formattedDist = (typeof formatWeatherDistance === 'function') ? formatWeatherDistance(activeStation.distance, cDir) : `${distKm} km${cDir ? ' ' + cDir : ''}`;
  const fltCat = activeStation.fltCat || 'VFR';

  let badgeColor = '#10b981'; // VFR
  if (fltCat === 'MVFR') badgeColor = '#f59e0b';
  else if (fltCat === 'IFR' || fltCat === 'LIFR') badgeColor = '#ef4444';

  const iconHtml = `
    <div class="weather-station-pin active-station" style="position: relative; display: flex; flex-direction: column; align-items: center; cursor: pointer; user-select: none;">
      <div style="background: rgba(15, 23, 42, 0.92); border: 2px solid ${badgeColor}; box-shadow: 0 0 12px ${badgeColor}; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="${badgeColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>
        </svg>
      </div>
      <span style="background: rgba(15, 23, 42, 0.9); color: #f8fafc; border: 1px solid ${badgeColor}80; font-size: 0.62rem; font-weight: 700; padding: 1px 4px; border-radius: 3px; margin-top: 2px; white-space: nowrap; box-shadow: 0 2px 5px rgba(0,0,0,0.6);">
        ${icao}${cDir ? ` (${cDir})` : ''}
      </span>
    </div>
  `;

  let weatherIcon;
  if (typeof L.divIcon === 'function') {
    weatherIcon = L.divIcon({
      className: 'custom-weather-station-marker',
      html: iconHtml,
      iconSize: [36, 46],
      iconAnchor: [18, 20],
      popupAnchor: [0, -18]
    });
  }

  const popupHtml = `
    <div style="min-width: 220px; font-family: inherit; font-size: 0.8rem; color: #f8fafc; line-height: 1.4;">
      <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.15); padding-bottom: 5px; margin-bottom: 6px;">
        <strong style="color: #38bdf8; font-size: 0.85rem; display: flex; align-items: center; gap: 4px;">🌤️ ${icao}</strong>
        <span style="background: ${badgeColor}25; color: ${badgeColor}; border: 1px solid ${badgeColor}60; font-size: 0.65rem; font-weight: 700; padding: 1px 6px; border-radius: 999px;">${fltCat}</span>
      </div>
      <div style="font-weight: 600; color: #f1f5f9; margin-bottom: 4px;">${name}</div>
      <div style="color: #94a3b8; font-size: 0.75rem; margin-bottom: 6px;">
        Distance: <b>${formattedDist}</b> (${distKm} km / ${distMi} mi) from center
      </div>
      <div style="background: rgba(255,255,255,0.06); padding: 6px 8px; border-radius: 4px; font-size: 0.72rem; line-height: 1.45; margin-bottom: 8px;">
        <div>Visibility: <b>${activeStation.visibilitySM != null ? Number(activeStation.visibilitySM).toFixed(1) + ' SM' : 'Unknown'}</b></div>
        <div>Ceiling: <b>${activeStation.ceilingFt != null ? (activeStation.ceilingFt >= 99999 ? 'Clear' : Number(activeStation.ceilingFt).toFixed(0) + ' ft') : 'Clear / Unknown'}</b></div>
        <div>Wind Speed: <b>${WIND_SPEED_SVG_ICON} ${formatWindSpeed(activeStation.windSpeedKmH)}</b></div>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center; gap: 6px;">
        <div style="display: flex; align-items: center; gap: 6px;">
          <span style="font-size: 0.65rem; color: #64748b;">NWS Observation</span>
          ${activeStation.icaoId ? `<a href="https://aviationweather.gov/data/metar/?id=${encodeURIComponent(activeStation.icaoId)}" target="_blank" rel="noopener noreferrer" style="font-size: 0.68rem; color: #38bdf8; text-decoration: underline;" title="${escapeHtml(activeStation.raw ? 'RAW METAR: ' + activeStation.raw : 'Full METAR Report')}">📄 METAR Report</a>` : ''}
        </div>
        <button type="button" class="btn-sm" style="padding: 2px 6px; font-size: 0.68rem; background: rgba(6,182,212,0.2); color: #22d3ee; border: 1px solid rgba(6,182,212,0.4); border-radius: 3px; cursor: pointer;" onclick="if (typeof centerMarker !== 'undefined' && centerMarker && typeof map !== 'undefined' && map && typeof map.flyTo === 'function') { map.flyTo(centerMarker.getLatLng(), typeof map.getZoom === 'function' ? map.getZoom() : 14); }">
          ✈️ Return to Center
        </button>
      </div>
    </div>
  `;

  if (!weatherStationMarker) {
    if (typeof L.marker !== 'function') return;
    weatherStationMarker = L.marker([activeStation.lat, activeStation.lon], { icon: weatherIcon, zIndexOffset: 850 });
    if (typeof weatherStationMarker.bindPopup === 'function') weatherStationMarker.bindPopup(popupHtml, { className: 'weather-station-popup' });
    if (typeof weatherStationMarker.bindTooltip === 'function') weatherStationMarker.bindTooltip(`🌤️ Weather Station: ${icao} (${name}) • ${formattedDist}`, { direction: 'top', offset: [0, -18] });
    if (weatherStationLayer && typeof weatherStationLayer.addLayer === 'function') {
      weatherStationLayer.addLayer(weatherStationMarker);
    } else if (map && typeof map.addLayer === 'function') {
      map.addLayer(weatherStationMarker);
    }
  } else {
    if (typeof weatherStationMarker.setLatLng === 'function') weatherStationMarker.setLatLng([activeStation.lat, activeStation.lon]);
    if (weatherIcon && typeof weatherStationMarker.setIcon === 'function') weatherStationMarker.setIcon(weatherIcon);
    if (typeof weatherStationMarker.setPopupContent === 'function') weatherStationMarker.setPopupContent(popupHtml);
    if (typeof weatherStationMarker.setTooltipContent === 'function') weatherStationMarker.setTooltipContent(`🌤️ Weather Station: ${icao} (${name}) • ${formattedDist}`);
    if (weatherStationLayer && typeof weatherStationLayer.hasLayer === 'function' && !weatherStationLayer.hasLayer(weatherStationMarker)) {
      if (typeof weatherStationLayer.addLayer === 'function') weatherStationLayer.addLayer(weatherStationMarker);
    }
  }
  weatherStationMarkers.push(weatherStationMarker);

  // Plot secondary nearby stations
  if (currentStations.length > 1 && typeof L.marker === 'function' && typeof L.divIcon === 'function') {
    currentStations.forEach((st, sIdx) => {
      if (sIdx === currentIdx || st.lat == null || st.lon == null) return;
      const sIcao = st.icaoId || 'NWS';
      const sName = st.name || 'Observation Station';
      const sCDir = st.compassDir || (typeof centerMarker !== 'undefined' && centerMarker && typeof getCompassBearing === 'function' ? bearingToCompassDirection(getCompassBearing(centerMarker.getLatLng().lat, centerMarker.getLatLng().lng, st.lat, st.lon)) : '');
      const sDistFormatted = (typeof formatWeatherDistance === 'function') ? formatWeatherDistance(st.distance, sCDir) : `${st.distance != null ? Number(st.distance).toFixed(1) + ' km' : ''}`;
      const sDistKm = (st.distance != null) ? Number(st.distance).toFixed(1) : '-';
      const sCat = st.fltCat || 'VFR';
      let sColor = '#10b981';
      if (sCat === 'MVFR') sColor = '#f59e0b';
      else if (sCat === 'IFR' || sCat === 'LIFR') sColor = '#ef4444';

      const secIconHtml = `
        <div class="weather-station-pin secondary-station" style="position: relative; display: flex; flex-direction: column; align-items: center; cursor: pointer; user-select: none; opacity: 0.85;">
          <div style="background: rgba(15, 23, 42, 0.9); border: 1.5px solid ${sColor}; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="${sColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>
            </svg>
          </div>
          <span style="background: rgba(15, 23, 42, 0.85); color: #cbd5e1; border: 1px solid ${sColor}60; font-size: 0.58rem; font-weight: 600; padding: 1px 3px; border-radius: 3px; margin-top: 1px; white-space: nowrap;">
            ${sIcao}${sCDir ? ` (${sCDir})` : ''}
          </span>
        </div>
      `;

      const secIcon = L.divIcon({
        className: 'custom-weather-station-marker-sec',
        html: secIconHtml,
        iconSize: [32, 40],
        iconAnchor: [16, 18],
        popupAnchor: [0, -16]
      });

      const secPopupHtml = `
        <div style="min-width: 200px; font-family: inherit; font-size: 0.78rem; color: #f8fafc; line-height: 1.4;">
          <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.15); padding-bottom: 4px; margin-bottom: 5px;">
            <strong style="color: #38bdf8;">🌤️ ${sIcao}</strong>
            <span style="background: ${sColor}25; color: ${sColor}; border: 1px solid ${sColor}60; font-size: 0.62rem; font-weight: 700; padding: 1px 5px; border-radius: 999px;">${sCat}</span>
          </div>
          <div style="font-weight: 600; margin-bottom: 2px;">${sName}</div>
          <div style="color: #94a3b8; font-size: 0.72rem; margin-bottom: 6px;">Distance: <b>${sDistFormatted}</b> (${sDistKm} km) from center</div>
          <button type="button" class="btn-sm" style="width: 100%; padding: 4px 8px; font-size: 0.72rem; background: rgba(56,189,248,0.2); color: #38bdf8; border: 1px solid #38bdf8; border-radius: 4px; cursor: pointer;" onclick="if (typeof selectActiveWeatherStationFromPopup === 'function') { selectActiveWeatherStationFromPopup(${sIdx}); }">
            Select This Station
          </button>
        </div>
      `;

      const secMarker = L.marker([st.lat, st.lon], { icon: secIcon, zIndexOffset: 800 });
      if (typeof secMarker.bindPopup === 'function') secMarker.bindPopup(secPopupHtml, { className: 'weather-station-popup' });
      if (typeof secMarker.bindTooltip === 'function') secMarker.bindTooltip(`🌤️ Weather Station: ${sIcao} (${sName}) • ${sDistFormatted}`, { direction: 'top', offset: [0, -16] });
      secMarker.on('click', () => {
        if (typeof selectActiveWeatherStationFromPopup === 'function') {
          selectActiveWeatherStationFromPopup(sIdx);
        }
      });
      if (weatherStationLayer && typeof weatherStationLayer.addLayer === 'function') {
        weatherStationLayer.addLayer(secMarker);
      } else if (map && typeof map.addLayer === 'function') {
        map.addLayer(secMarker);
      }
      weatherStationMarkers.push(secMarker);
    });
  }

  // Update connecting line between mission center and active weather station
  if (typeof centerMarker !== 'undefined' && centerMarker && typeof centerMarker.getLatLng === 'function' && typeof L.polyline === 'function') {
    const centerLatLng = centerMarker.getLatLng();
    const stationLatLng = [activeStation.lat, activeStation.lon];
    if (!weatherStationLine) {
      weatherStationLine = L.polyline([centerLatLng, stationLatLng], {
        color: badgeColor,
        weight: 2,
        dashArray: '6, 8',
        opacity: 0.75
      });
      if (typeof weatherStationLine.bindTooltip === 'function') {
        weatherStationLine.bindTooltip(`Weather Station: ${icao} (${formattedDist})`, { sticky: true });
      }
      if (weatherStationLayer && typeof weatherStationLayer.addLayer === 'function') {
        weatherStationLayer.addLayer(weatherStationLine);
      } else if (map && typeof map.addLayer === 'function') {
        map.addLayer(weatherStationLine);
      }
    } else {
      if (typeof weatherStationLine.setLatLngs === 'function') {
        weatherStationLine.setLatLngs([centerLatLng, stationLatLng]);
      }
      if (typeof weatherStationLine.setStyle === 'function') {
        weatherStationLine.setStyle({ color: badgeColor });
      }
      if (typeof weatherStationLine.setTooltipContent === 'function') {
        weatherStationLine.setTooltipContent(`Weather Station: ${icao} (${formattedDist})`);
      }
    }
  }
}

function selectActiveWeatherStation(idx) {
  if (!currentWeatherDirections || !Array.isArray(currentWeatherDirections.stations)) return;
  if (idx < 0 || idx >= currentWeatherDirections.stations.length) return;

  activeWeatherStationIndex = idx;
  currentWeatherDirections.activeIndex = idx;
  currentWeatherDirections.closest = currentWeatherDirections.stations[idx];

  updateWeatherPanelUI(currentWeatherDirections, null, false);
  // Do not auto-pan the map when switching stations; user can use the 📍 Map button if needed.
}

// Compatibility alias for popup context
function selectActiveWeatherStationFromPopup(idx) {
  selectActiveWeatherStation(idx);
}

function toggleWeatherDetails(forceState) {
  const dirsEl = document.getElementById('stat-weather-dirs');
  const solarCard = document.getElementById('stat-solar-card');
  const toggleBtn = document.getElementById('btn-toggle-weather-details');
  if (!dirsEl) return;

  const isCurrentlyHidden = dirsEl.classList.contains('hidden');
  const shouldShow = (typeof forceState === 'boolean') ? forceState : isCurrentlyHidden;

  if (shouldShow) {
    dirsEl.classList.remove('hidden');
    if (solarCard) solarCard.classList.remove('hidden');
    if (toggleBtn) toggleBtn.textContent = '▴ Details';
    try { localStorage.setItem('aalaapi_weather_details_expanded', 'true'); } catch (e) {}
  } else {
    dirsEl.classList.add('hidden');
    if (solarCard) solarCard.classList.add('hidden');
    if (toggleBtn) toggleBtn.textContent = '▾ Details';
    try { localStorage.setItem('aalaapi_weather_details_expanded', 'false'); } catch (e) {}
  }
}

function focusWeatherStationOnMap(targetStation) {
  if (typeof map === 'undefined' || !map) return;
  const target = targetStation || (currentWeatherDirections && currentWeatherDirections.closest);
  if (!target || target.lat == null || target.lon == null) return;

  if (weatherStationLayer && typeof map.hasLayer === 'function' && !map.hasLayer(weatherStationLayer)) {
    if (typeof map.addLayer === 'function') map.addLayer(weatherStationLayer);
  }

  if (typeof centerMarker !== 'undefined' && centerMarker && typeof centerMarker.getLatLng === 'function' && typeof L.latLngBounds === 'function' && typeof map.fitBounds === 'function') {
    const bounds = L.latLngBounds([centerMarker.getLatLng(), [target.lat, target.lon]]);
    map.fitBounds(bounds, { padding: [70, 70], maxZoom: 15 });
  } else if (typeof map.flyTo === 'function') {
    map.flyTo([target.lat, target.lon], Math.max(typeof map.getZoom === 'function' ? map.getZoom() : 12, 12));
  }

  if (weatherStationMarker && typeof weatherStationMarker.openPopup === 'function') {
    weatherStationMarker.openPopup();
  }
}

function updateWeatherPanelUI(directions, statusMsg, isLoading) {
  const windowEl = document.getElementById('stat-weather-window');
  const dirsEl = document.getElementById('stat-weather-dirs');
  const solarCard = document.getElementById('stat-solar-card');
  const locateHeaderBtn = document.getElementById('btn-locate-weather-station');
  const toggleBtn = document.getElementById('btn-toggle-weather-details');

  if (!windowEl || !dirsEl) return;

  if (isLoading || statusMsg) {
    windowEl.textContent = statusMsg || "Loading...";
    windowEl.style.color = "var(--text-secondary)";
    if (typeof dirsEl.replaceChildren === 'function') dirsEl.replaceChildren(); else dirsEl.innerHTML = '';
    dirsEl.classList.add("hidden");
    if (solarCard) solarCard.classList.add("hidden");
    if (locateHeaderBtn) locateHeaderBtn.classList.add('hidden');
    if (toggleBtn) toggleBtn.textContent = '▾ Details';
    updateWeatherStationMarker(null);
    return;
  }

  if (!directions || !directions.closest) {
    windowEl.textContent = "🔴 No Data";
    windowEl.style.color = "var(--error-color)";
    if (typeof dirsEl.replaceChildren === 'function') dirsEl.replaceChildren(); else dirsEl.innerHTML = '';
    dirsEl.classList.add("hidden");
    if (solarCard) solarCard.classList.add("hidden");
    if (locateHeaderBtn) locateHeaderBtn.classList.add('hidden');
    if (toggleBtn) toggleBtn.textContent = '▾ Details';
    updateWeatherStationMarker(null);
    return;
  }

  // Store active directions
  currentWeatherDirections = directions;

  // Evaluate flight condition based on closest / active station
  const closest = directions.closest;
  let isAllowed = false;
  let statusText = "";
  let color = "";

  if (closest.fltCat === "VFR") {
    isAllowed = true;
    statusText = "🟢 Allowed (VFR)";
    color = "var(--success-color)";
  } else if (closest.fltCat === "MVFR") {
    isAllowed = true;
    statusText = "🟡 Caution (MVFR)";
    color = "var(--warning-color)";
  } else {
    isAllowed = false;
    statusText = `🔴 Not Allowed (${closest.fltCat || 'Unknown'})`;
    color = "var(--error-color)";
  }

  let timeString = "Unknown";
  if (closest.timestamp) {
    const d = new Date(closest.timestamp);
    if (!isNaN(d.getTime())) {
      timeString = d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    }
  }

  const cDir = closest.compassDir || (typeof centerMarker !== 'undefined' && centerMarker && typeof getCompassBearing === 'function' ? bearingToCompassDirection(getCompassBearing(centerMarker.getLatLng().lat, centerMarker.getLatLng().lng, closest.lat, closest.lon)) : '');
  const distKm = closest.distance != null ? Number(closest.distance).toFixed(1) : '-';
  const distMi = closest.distance != null ? (Number(closest.distance) * 0.621371).toFixed(1) : '-';
  const formattedDist = (typeof formatWeatherDistance === 'function') ? formatWeatherDistance(closest.distance, cDir) : `${distKm} km${cDir ? ' ' + cDir : ''}`;

  if (typeof windowEl.replaceChildren === 'function') windowEl.replaceChildren(); else windowEl.innerHTML = '';
  const statusSpan = document.createElement("span");
  statusSpan.style.color = color;
  statusSpan.textContent = statusText;
  windowEl.appendChild(statusSpan);

  const timeDiv = document.createElement("div");
  timeDiv.style.cssText = "font-size: 0.7rem; color: var(--text-muted); margin-top: 2px;";
  const stationLabel = closest.icaoId ? ` • 📡 ${closest.icaoId} (${formattedDist})` : '';
  timeDiv.textContent = `Last Polled: ${timeString}${stationLabel}`;
  windowEl.appendChild(timeDiv);

  windowEl.title = `Station: ${closest.icaoId || 'NWS'} - ${closest.name || 'Station'} (${formattedDist})\nRaw: ${closest.raw || ''}\nClick to toggle checklist`;

  if (locateHeaderBtn) {
    if (closest.icaoId) {
      locateHeaderBtn.textContent = `📍 ${closest.icaoId} (${formattedDist})`;
      locateHeaderBtn.classList.remove('hidden');
    } else {
      locateHeaderBtn.classList.add('hidden');
    }
  }

  if (typeof dirsEl.replaceChildren === 'function') dirsEl.replaceChildren(); else dirsEl.innerHTML = '';
  const container = document.createElement("div");
  container.style.cssText = "font-size: 0.8rem; line-height: 1.4;";

  const titleDiv = document.createElement("div");
  titleDiv.style.cssText = "margin-bottom: 4px; font-weight: bold; color: var(--text-primary); display: flex; justify-content: space-between; align-items: center;";
  titleDiv.textContent = "Flight Conditions Checklist";
  container.appendChild(titleDiv);

  const visDiv = document.createElement("div");
  if (closest.visibilitySM !== null && closest.visibilitySM !== undefined) {
    let visCheck = closest.visibilitySM >= 3 ? "✅" : "❌";
    let visColor = closest.visibilitySM >= 3 ? "var(--success-color)" : "var(--error-color)";
    visDiv.style.color = visColor;
    visDiv.textContent = `${visCheck} Visibility: ${closest.visibilitySM.toFixed(1)} SM (Req ≥ 3)`;
  } else {
    visDiv.style.color = "var(--text-secondary)";
    visDiv.textContent = "❓ Visibility: Unknown";
  }
  container.appendChild(visDiv);

  const ceilDiv = document.createElement("div");
  if (closest.ceilingFt !== null && closest.ceilingFt !== undefined) {
    let ceilCheck = closest.ceilingFt >= 1000 ? "✅" : "❌";
    let ceilColor = closest.ceilingFt >= 1000 ? "var(--success-color)" : "var(--error-color)";
    const cStr = closest.ceilingFt >= 99999 ? "Clear" : `${closest.ceilingFt.toFixed(0)} ft`;
    ceilDiv.style.color = ceilColor;
    ceilDiv.textContent = `${ceilCheck} Ceiling: ${cStr} (Req ≥ 1000 ft)`;
  } else {
    ceilDiv.style.color = "var(--success-color)";
    ceilDiv.textContent = "✅ Ceiling: Clear / Unlimited (Req ≥ 1000 ft)";
  }
  container.appendChild(ceilDiv);

  const windDiv = document.createElement("div");
  if (closest.windSpeedKmH !== null && closest.windSpeedKmH !== undefined) {
    windDiv.style.color = "var(--text-main)";
    windDiv.innerHTML = `💨 Wind Speed: <b>${WIND_SPEED_SVG_ICON} ${formatWindSpeed(closest.windSpeedKmH)}</b>`;
  } else {
    windDiv.style.color = "var(--text-secondary)";
    windDiv.innerHTML = `💨 Wind Speed: <b>${WIND_SPEED_SVG_ICON} Unknown</b>`;
  }
  container.appendChild(windDiv);

  const categoryDefinitions = {
    "VFR": { name: "VFR", color: "var(--success-color)", desc: "Vis >5mi, Ceil >3000ft" },
    "MVFR": { name: "MVFR", color: "var(--warning-color)", desc: "Vis 3-5mi, Ceil 1k-3k ft" },
    "IFR": { name: "IFR", color: "var(--error-color)", desc: "Vis 1-3mi, Ceil 500-1k ft" },
    "LIFR": { name: "LIFR", color: "var(--error-color)", desc: "Vis <1mi, Ceil <500ft" }
  };

  if (closest.fltCat && Object.prototype.hasOwnProperty.call(categoryDefinitions, closest.fltCat)) {
    const catSection = document.createElement("div");
    catSection.style.cssText = "margin-top: 8px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.1); font-size: 0.75rem; color: var(--text-secondary);";

    const catTitle = document.createElement("div");
    catTitle.style.cssText = "font-weight: 600; margin-bottom: 2px;";
    catTitle.textContent = "Current Category:";
    catSection.appendChild(catTitle);

    const catContent = document.createElement("div");
    const catDef = categoryDefinitions[closest.fltCat];
    const catNameSpan = document.createElement("span");
    catNameSpan.style.color = catDef.color;
    catNameSpan.textContent = `${catDef.name}:`;
    catContent.appendChild(catNameSpan);
    catContent.appendChild(document.createTextNode(` ${catDef.desc}`));

    catSection.appendChild(catContent);
    container.appendChild(catSection);
  }

  // Reporting Observation Station Info Section
  const stationSection = document.createElement("div");
  stationSection.className = "weather-station-info-card";
  stationSection.style.cssText = "margin-top: 8px; padding: 8px 10px; background: rgba(56, 189, 248, 0.07); border: 1px solid rgba(56, 189, 248, 0.2); border-radius: 6px; font-size: 0.75rem; color: var(--text-main); display: flex; flex-direction: column; gap: 4px;";

  const stationHeader = document.createElement("div");
  stationHeader.style.cssText = "display: flex; align-items: center; justify-content: space-between; gap: 6px;";

  const stationTitle = document.createElement("div");
  stationTitle.style.cssText = "font-weight: 700; color: #38bdf8; display: flex; align-items: center; gap: 4px;";
  stationTitle.textContent = `📡 Station: ${closest.icaoId || 'NWS'}${cDir ? ` (${cDir})` : ''}`;
  stationHeader.appendChild(stationTitle);

  if (closest.icaoId) {
    const metarLink = document.createElement("a");
    metarLink.href = `https://aviationweather.gov/data/metar/?id=${encodeURIComponent(closest.icaoId)}`;
    metarLink.target = "_blank";
    metarLink.rel = "noopener noreferrer";
    metarLink.style.cssText = "font-size: 0.68rem; color: #38bdf8; text-decoration: underline; margin-left: 4px;";
    metarLink.textContent = "📄 METAR Report";
    if (closest.raw) {
      metarLink.title = `RAW METAR: ${closest.raw}`;
    }
    metarLink.onclick = (e) => e.stopPropagation();
    stationTitle.appendChild(metarLink);
  }

  const locateBtn = document.createElement("button");
  locateBtn.className = "btn-sm weather-station-locate-btn";
  locateBtn.type = "button";
  locateBtn.style.cssText = "padding: 1px 6px; font-size: 0.68rem; background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.35); border-radius: 4px; cursor: pointer;";
  locateBtn.textContent = "📍 Locate on Map";
  locateBtn.title = "Show weather station and mission center on map";
  locateBtn.onclick = (e) => {
    e.stopPropagation();
    if (typeof focusWeatherStationOnMap === 'function') {
      focusWeatherStationOnMap(closest);
    }
  };
  stationHeader.appendChild(locateBtn);
  stationSection.appendChild(stationHeader);

  const stationNameDiv = document.createElement("div");
  stationNameDiv.style.cssText = "color: var(--text-primary); font-size: 0.72rem; line-height: 1.3;";
  stationNameDiv.textContent = closest.name || "Observation Station";
  stationSection.appendChild(stationNameDiv);

  const distDiv = document.createElement("div");
  distDiv.style.cssText = "color: var(--text-muted); font-size: 0.7rem;";
  distDiv.textContent = `Distance: ${formattedDist} (${distKm} km / ${distMi} mi) from mission center`;
  stationSection.appendChild(distDiv);

  // If multiple stations are available, render station switcher tabs
  if (directions.stations && directions.stations.length > 1) {
    const multiStationsBar = document.createElement("div");
    multiStationsBar.className = "multi-station-switcher";
    multiStationsBar.style.cssText = "display: flex; gap: 4px; margin-top: 6px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.08); flex-wrap: wrap;";

    directions.stations.forEach((st, sIdx) => {
      const tabBtn = document.createElement("button");
      tabBtn.type = "button";
      tabBtn.className = `btn-sm station-tab-btn ${sIdx === (directions.activeIndex || 0) ? 'active' : ''}`;
      const isActive = sIdx === (directions.activeIndex || 0);
      tabBtn.style.cssText = `padding: 2px 6px; font-size: 0.68rem; border-radius: 4px; cursor: pointer; ${
        isActive
          ? 'background: rgba(56, 189, 248, 0.25); color: #38bdf8; border: 1px solid #38bdf8; font-weight: 700;'
          : 'background: rgba(255, 255, 255, 0.05); color: var(--text-muted); border: 1px solid rgba(255,255,255,0.15);'
      }`;
      const sCDir = st.compassDir || (typeof centerMarker !== 'undefined' && centerMarker && typeof getCompassBearing === 'function' ? bearingToCompassDirection(getCompassBearing(centerMarker.getLatLng().lat, centerMarker.getLatLng().lng, st.lat, st.lon)) : '');
      const sDistFormatted = (typeof formatWeatherDistance === 'function') ? formatWeatherDistance(st.distance, sCDir) : `${st.distance != null ? Number(st.distance).toFixed(1) + ' km' : ''}`;
      tabBtn.textContent = `${st.icaoId} (${sDistFormatted})`;
      tabBtn.onclick = (e) => {
        e.stopPropagation();
        if (typeof selectActiveWeatherStation === 'function') {
          selectActiveWeatherStation(sIdx);
        }
      };
      multiStationsBar.appendChild(tabBtn);
    });

    stationSection.appendChild(multiStationsBar);
  }

  container.appendChild(stationSection);
  dirsEl.appendChild(container);

  // Check saved preference: default to expanded unless user explicitly minimized
  let shouldExpand = true;
  try {
    const saved = localStorage.getItem('aalaapi_weather_details_expanded');
    if (saved === 'false') shouldExpand = false;
  } catch (e) {}

  if (shouldExpand) {
    dirsEl.classList.remove("hidden");
    if (solarCard) solarCard.classList.remove("hidden");
    if (toggleBtn) toggleBtn.textContent = '▴ Details';
  } else {
    dirsEl.classList.add("hidden");
    if (solarCard) solarCard.classList.add("hidden");
    if (toggleBtn) toggleBtn.textContent = '▾ Details';
  }

  // Sync Header Telemetry Pill Weather & Popover Card
  const headerWeatherSummary = document.getElementById('header-weather-summary');
  const sidebarSummaryText = document.getElementById('sidebar-summary-text');
  const popWeatherSummary = document.getElementById('pop-weather-summary');
  const popWeatherDetails = document.getElementById('pop-weather-details');

  const weatherPillText = `${statusText.split(' ')[0]} ${closest.fltCat || 'VFR'} (${closest.icaoId || 'Station'})`;
  if (headerWeatherSummary) {
    headerWeatherSummary.textContent = weatherPillText;
    headerWeatherSummary.style.color = color;
  }
  if (sidebarSummaryText) {
    const telemText = document.getElementById('dock-waypoint-summary')?.textContent || document.getElementById('header-telemetry-summary')?.textContent || '0 WPs • 0.0 km • 0m 0s';
    sidebarSummaryText.textContent = `⚡ ${telemText} • ${weatherPillText}`;
  }
  if (popWeatherSummary) {
    popWeatherSummary.textContent = `${statusText} • ${closest.icaoId || 'NWS Station'} (${formattedDist})`;
    popWeatherSummary.style.color = color;
  }
  if (popWeatherDetails) {
    let multiStationsHtml = '';
    if (directions.stations && directions.stations.length > 1) {
      multiStationsHtml = `
        <div class="pop-station-switcher" style="display: flex; gap: 4px; margin-top: 8px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.08); flex-wrap: wrap;">
          ${directions.stations.map((st, sIdx) => {
            const isActive = sIdx === (directions.activeIndex || 0);
            const sCDir = st.compassDir || (typeof centerMarker !== 'undefined' && centerMarker && typeof getCompassBearing === 'function' ? bearingToCompassDirection(getCompassBearing(centerMarker.getLatLng().lat, centerMarker.getLatLng().lng, st.lat, st.lon)) : '');
            const sDist = (typeof formatWeatherDistance === 'function') ? formatWeatherDistance(st.distance, sCDir) : `${st.distance != null ? Number(st.distance).toFixed(1) + ' km' : ''}`;
            const sCat = st.fltCat || 'VFR';
            let catDot = '🟢';
            if (sCat === 'MVFR') catDot = '🟡';
            else if (sCat === 'IFR' || sCat === 'LIFR') catDot = '🔴';
            return `
              <button type="button" class="btn-sm pop-station-tab-btn ${isActive ? 'active' : ''}" 
                style="padding: 3px 8px; font-size: 0.68rem; border-radius: 4px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; ${
                  isActive
                    ? 'background: rgba(56, 189, 248, 0.25); color: #38bdf8; border: 1px solid #38bdf8; font-weight: 700;'
                    : 'background: rgba(255, 255, 255, 0.05); color: var(--text-muted); border: 1px solid rgba(255,255,255,0.15);'
                }" onclick="if (typeof event !== 'undefined' && event && typeof event.stopPropagation === 'function') { event.stopPropagation(); } if (typeof selectActiveWeatherStation === 'function') { selectActiveWeatherStation(${sIdx}); }" title="Switch active station to ${escapeHtml(st.icaoId)}">
                <span>${catDot}</span>
                <span>${escapeHtml(st.icaoId)}</span>
                <span style="opacity: 0.75; font-size: 0.62rem;">(${sDist})</span>
              </button>
            `;
          }).join('')}
        </div>
      `;
    }

    popWeatherDetails.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 6px;">
        <div>
          <div>Visibility: <b>${closest.visibilitySM != null ? Number(closest.visibilitySM).toFixed(1) + ' SM' : 'Unknown'}</b> • Ceiling: <b>${closest.ceilingFt != null ? (closest.ceilingFt >= 99999 ? 'Clear' : Number(closest.ceilingFt).toFixed(0) + ' ft') : 'Clear'}</b></div>
          <div style="margin-top: 2px;">Wind: <b>${WIND_SPEED_SVG_ICON} ${formatWindSpeed(closest.windSpeedKmH)}</b></div>
          <div style="color: var(--text-muted); font-size: 0.68rem; margin-top: 2px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
            <span>Station: ${escapeHtml(closest.name || closest.icaoId || 'NWS')}${cDir ? ` (${cDir})` : ''} • Last polled: ${timeString}</span>
            ${closest.icaoId ? `<a href="https://aviationweather.gov/data/metar/?id=${encodeURIComponent(closest.icaoId)}" target="_blank" rel="noopener noreferrer" style="color: #38bdf8; text-decoration: underline;" title="${escapeHtml(closest.raw ? 'RAW METAR: ' + closest.raw : 'Full METAR Report')}">📄 METAR Report</a>` : ''}
          </div>
        </div>
        <button type="button" class="btn-sm pop-locate-weather-btn" style="padding: 2px 6px; font-size: 0.66rem; background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.35); border-radius: 4px; cursor: pointer; white-space: nowrap;" onclick="if (typeof event !== 'undefined' && event && typeof event.stopPropagation === 'function') { event.stopPropagation(); } if (typeof focusWeatherStationOnMap === 'function') { focusWeatherStationOnMap(); }" title="Locate weather station on map">📍 Map</button>
      </div>
      ${multiStationsHtml}
    `;
  }

  // Update map marker
  updateWeatherStationMarker(closest, directions.stations, directions.activeIndex || 0);

  if (typeof updateSolarEphemeris === 'function') {
    updateSolarEphemeris();
  }
}

function getCompassBearing(fromLat, fromLon, toLat, toLon) {
  if (fromLat == null || fromLon == null || toLat == null || toLon == null) return 0;
  const dLon = (toLon - fromLon) * Math.PI / 180.0;
  const lat1 = fromLat * Math.PI / 180.0;
  const lat2 = toLat * Math.PI / 180.0;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  let brng = Math.atan2(y, x) * 180.0 / Math.PI;
  brng = (brng + 360) % 360;
  return brng;
}

function bearingToCompassDirection(bearingDeg) {
  if (bearingDeg == null || isNaN(bearingDeg)) return '';
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(bearingDeg / 22.5) % 16;
  return directions[index];
}

function formatWeatherDistance(distKm, compassDir = '') {
  if (distKm === null || distKm === undefined || isNaN(distKm)) return '-';
  const unit = (typeof getUnitSystem === 'function') ? getUnitSystem() : 'imperial';
  const dirSuffix = compassDir ? ` ${compassDir}` : '';
  if (unit === 'imperial') {
    const mi = Number(distKm) * 0.621371;
    return `${mi.toFixed(1)} mi${dirSuffix}`;
  }
  return `${Number(distKm).toFixed(1)} km${dirSuffix}`;
}

if (typeof window !== 'undefined') {
  window.selectActiveWeatherStation = selectActiveWeatherStation;
  window.selectActiveWeatherStationFromPopup = selectActiveWeatherStationFromPopup;
  window.focusWeatherStationOnMap = focusWeatherStationOnMap;
  window.formatWeatherDistance = formatWeatherDistance;
  window.getCompassBearing = getCompassBearing;
  window.bearingToCompassDirection = bearingToCompassDirection;
  window.formatWindSpeed = formatWindSpeed;
  window.WIND_SPEED_SVG_ICON = WIND_SPEED_SVG_ICON;
  window.parseMetar = parseMetar;
}

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btn-refresh-weather');
  if (btn) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (centerMarker) {
        lastWeatherFetchCenter = null;
        fetchAndProcessWeather(centerMarker.getLatLng().lat, centerMarker.getLatLng().lng, true);
      }
    });
  }

  const toggleBtn = document.getElementById('btn-toggle-weather-details');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleWeatherDetails();
    });
  }

  const weatherWindow = document.getElementById('stat-weather-window');
  if (weatherWindow) {
    weatherWindow.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleWeatherDetails();
    });
  }

  const locateBtn = document.getElementById('btn-locate-weather-station');
  if (locateBtn) {
    locateBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      focusWeatherStationOnMap();
    });
  }
});

// ============================================================================
// FAA Temporary Flight Restrictions (TFR) & Location-Based NOTAM Engine
// ============================================================================

