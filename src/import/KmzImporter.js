function handleKMZImport(e) {
  const file = e.target.files[0];
  if (!file) return;

  importedFileName = file.name;
  const statusText = document.getElementById('import-status-text');
  if (statusText) statusText.textContent = `Loading ${file.name}...`;

  // Auto-detect DJI UUID from filename (e.g. "354A8F93-759C-42C3-A8D5-746F79C7622A.kmz")
  const uuidMatch = file.name.match(/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  if (uuidMatch && !getRC2UUID()) {
    setRC2UUID(uuidMatch[1]);
  }

  const reader = new FileReader();
  reader.onload = function(evt) {
    JSZip.loadAsync(evt.target.result)
      .then(zip => {
        let waylinesFile = null;
        zip.forEach((relativePath, zipEntry) => {
          if (relativePath.endsWith('waylines.wpml')) {
            waylinesFile = zipEntry;
          }
        });

        if (!waylinesFile) {
          throw new Error("Could not find waylines.wpml inside the KMZ archive.");
        }

        return waylinesFile.async("text");
      })
      .then(wpmlText => {
        parseWPML(wpmlText);
      })
      .catch(err => {
        Logger.error("KMZ Import error:", err);
        alert(`Failed to import KMZ: ${err.message}`);
        clearImportedMission();
      });
  };
  reader.readAsArrayBuffer(file);
}

function parseWPML(wpmlText) {
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(wpmlText, "text/xml");
    
    // Parse droneEnumValue to restore the selected target drone model
    const droneEnumNode = xmlDoc.getElementsByTagName("wpml:droneEnumValue")[0] || xmlDoc.getElementsByTagName("droneEnumValue")[0];
    if (droneEnumNode) {
      const droneVal = droneEnumNode.textContent.trim();
      const droneSelect = document.getElementById('drone-model');
      if (droneSelect && droneSelect.options) {
        for (let i = 0; i < droneSelect.options.length; i++) {
          if (droneSelect.options[i].value === droneVal) {
            droneSelect.value = droneVal;
            break;
          }
        }
      }
    }

    const placemarks = xmlDoc.getElementsByTagName("Placemark");
    if (placemarks.length === 0) {
      throw new Error("No waypoints found in the mission file.");
    }

    const waypoints = [];
    const photos = [];
    let sumLat = 0;
    let sumLon = 0;
    let currentPitch = null;

    for (let i = 0; i < placemarks.length; i++) {
      const pm = placemarks[i];
      
      const indexNode = pm.getElementsByTagName("wpml:index")[0] || pm.getElementsByTagName("index")[0];
      const idx = indexNode ? parseInt(indexNode.textContent, 10) : i;

      const coordsNode = pm.getElementsByTagName("coordinates")[0];
      if (!coordsNode) continue;
      const coordsStr = coordsNode.textContent.trim();
      const parts = coordsStr.split(",");
      if (parts.length < 2) continue;
      const lon = parseFloat(parts[0]);
      const lat = parseFloat(parts[1]);

      sumLat += lat;
      sumLon += lon;

      const heightNode = pm.getElementsByTagName("wpml:executeHeight")[0] || pm.getElementsByTagName("executeHeight")[0];
      const alt = heightNode ? parseFloat(heightNode.textContent) : 50;

      const speedNode = pm.getElementsByTagName("wpml:waypointSpeed")[0] || pm.getElementsByTagName("waypointSpeed")[0];
      const speed = speedNode ? parseFloat(speedNode.textContent) : 4;

      const headingModeNode = pm.getElementsByTagName("wpml:waypointHeadingMode")[0] || pm.getElementsByTagName("waypointHeadingMode")[0];
      const headingAngleNode = pm.getElementsByTagName("wpml:waypointHeadingAngle")[0] || pm.getElementsByTagName("wpml:waypointHeadingAngle")[0];
      const headingAngleEnableNode = pm.getElementsByTagName("wpml:waypointHeadingAngleEnable")[0] || pm.getElementsByTagName("wpml:waypointHeadingAngleEnable")[0];

      const hMode = headingModeNode ? headingModeNode.textContent : "followWayline";
      const hAngle = headingAngleNode ? parseFloat(headingAngleNode.textContent) : 0;
      const hEnable = headingAngleEnableNode ? parseInt(headingAngleEnableNode.textContent, 10) === 1 : false;

      let heading = null;
      if (hMode === "smoothTransition" || hMode === "custom" || hEnable) {
        heading = hAngle;
      }

      let pitch = null;
      let isRingStart = false;
      let hasPhoto = false;
      const actionGroups = pm.getElementsByTagName("wpml:actionGroup") || pm.getElementsByTagName("actionGroup");
      for (let j = 0; j < actionGroups.length; j++) {
        const ag = actionGroups[j];
        const actions = ag.getElementsByTagName("wpml:action") || ag.getElementsByTagName("action");
        for (let k = 0; k < actions.length; k++) {
          const act = actions[k];
          const actuatorNode = act.getElementsByTagName("wpml:actionActuatorFunc")[0] || act.getElementsByTagName("actionActuatorFunc")[0];
          if (actuatorNode) {
            if (actuatorNode.textContent === "gimbalRotate" || actuatorNode.textContent === "gimbalEvenlyRotate") {
              const pitchNode = act.getElementsByTagName("wpml:gimbalPitchRotateAngle")[0] || act.getElementsByTagName("gimbalPitchRotateAngle")[0];
              if (pitchNode) {
                pitch = parseFloat(pitchNode.textContent);
                isRingStart = true;
              }
            } else if (actuatorNode.textContent === "rotateYaw") {
              const yawNode = act.getElementsByTagName("wpml:aircraftHeading")[0] || act.getElementsByTagName("aircraftHeading")[0];
              if (yawNode) {
                heading = parseFloat(yawNode.textContent);
              }
            } else if (actuatorNode.textContent === "takePhoto") {
              hasPhoto = true;
            }
          }
        }
      }

      if (pitch === null) {
        const gPitchNode = pm.getElementsByTagName("wpml:waypointGimbalPitchAngle")[0] || pm.getElementsByTagName("waypointGimbalPitchAngle")[0];
        if (gPitchNode) {
          pitch = parseFloat(gPitchNode.textContent);
        }
      }

      if (pitch !== null) {
        currentPitch = pitch;
      } else if (currentPitch !== null) {
        pitch = currentPitch;
      }

      waypoints.push({
        idx: idx,
        lat: lat,
        lon: lon,
        alt: alt,
        speed: speed,
        heading: heading,
        pitch: pitch,
        isRingStart: isRingStart,
        ringIndex: null
      });

      if (hasPhoto) {
        photos.push({
          lat: lat,
          lon: lon,
          alt: alt,
          heading: heading,
          pitch: pitch
        });
      }
    }

    if (waypoints.length === 0) {
      throw new Error("No valid coordinates parsed from the waypoint mission.");
    }

    waypoints.sort((a, b) => a.idx - b.idx);

    const refLat = waypoints[0].lat;
    const refLon = waypoints[0].lon;

    waypoints.forEach(wp => {
      const offsets = geodeticToLocal(wp.lat, wp.lon, refLat, refLon);
      wp.x = offsets.x;
      wp.y = offsets.y;
      wp.origLat = wp.lat;
      wp.origLon = wp.lon;
      wp.origX = offsets.x;
      wp.origY = offsets.y;
      wp.origAlt = wp.alt;
      wp.origPitch = wp.pitch;
      wp.origHeading = wp.heading;
      wp.origHeadingMode = wp.headingMode || 'inherit';
      wp.origSpeed = wp.speed !== undefined ? wp.speed : null;
      wp.origHoverTime = wp.hoverTime !== undefined ? wp.hoverTime : null;
      wp.origTurnMode = wp.turnMode || 'inherit';
      wp.origCameraAction = wp.cameraAction || 'inherit';
      wp.origZoom = wp.zoom !== undefined ? wp.zoom : 1.0;
      wp.origIsRingStart = wp.isRingStart || false;
      wp.origIsModified = false;
    });

    photos.forEach(pt => {
      const offsets = geodeticToLocal(pt.lat, pt.lon, refLat, refLon);
      pt.x = offsets.x;
      pt.y = offsets.y;
      pt.origLat = pt.lat;
      pt.origLon = pt.lon;
      pt.origX = offsets.x;
      pt.origY = offsets.y;
      pt.origAlt = pt.alt;
      pt.origPitch = pt.pitch;
      pt.origHeading = pt.heading;
      pt.origIsRingStart = false;
      pt.origIsModified = false;
    });

    // Map altitudes to ringIndexes for visual segmentation on map
    const uniqueAlts = [...new Set(waypoints.map(wp => wp.alt))].sort((a, b) => b - a);
    waypoints.forEach(wp => {
      if (uniqueAlts.length > 1) {
        const altIdx = uniqueAlts.indexOf(wp.alt);
        if (uniqueAlts.length === 4) {
          wp.ringIndex = altIdx;
        } else if (uniqueAlts.length === 3) {
          wp.ringIndex = altIdx;
        } else if (uniqueAlts.length === 2) {
          wp.ringIndex = altIdx === 0 ? 0 : 1;
        } else {
          wp.ringIndex = altIdx % 4;
        }
      } else {
        wp.ringIndex = null;
      }
    });

    importedWaypoints = waypoints;
    importedPhotos = photos;

    if (typeof setGridCenter === 'function') setGridCenter(refLat, refLon);
    if (typeof map !== 'undefined' && map && typeof map.setView === 'function') map.setView([refLat, refLon], 17);

    if (typeof toggleUIControlsState === 'function') toggleUIControlsState(true);

    const statusTextEl = document.getElementById('import-status-text');
    if (statusTextEl) {
      statusTextEl.textContent = '';
      const spanEl = document.createElement('span');
      spanEl.style.color = 'var(--accent-green)';
      spanEl.style.fontWeight = '600';
      spanEl.textContent = `Active: ${importedFileName}`;
      statusTextEl.appendChild(spanEl);
    }
    const clearBtn = document.getElementById('clear-imported-btn');
    if (clearBtn && clearBtn.classList) clearBtn.classList.remove('hidden');

    if (typeof updateGrid === 'function') updateGrid();

    return { waypoints, photos };
  } catch (err) {
    if (typeof Logger !== 'undefined' && Logger && Logger.error) Logger.error("XML Parsing error:", err);
    if (typeof alert === 'function') alert(`Failed to parse KML: ${err.message}`);
    if (typeof clearImportedMission === 'function') clearImportedMission();
    return null;
  }
}

function geodeticToLocal(lat, lon, centerLat, centerLon) {
  const R = 6378137.0;
  const dLat = (lat - centerLat) * Math.PI / 180.0;
  const dLon = (lon - centerLon) * Math.PI / 180.0;
  const y = dLat * R;
  const x = dLon * R * Math.cos(centerLat * Math.PI / 180.0);
  return { x, y };
}

function toggleUIControlsState(disable) {
  const elements = [
    'grid-width', 'grid-height', 'grid-rotation', 'grid-type',
    'front-overlap', 'side-overlap', 'gimbal-pitch', 'altitude'
  ];

  elements.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.disabled = disable;
      const container = el.closest('.control-group');
      if (container) {
        container.style.opacity = disable ? '0.5' : '1';
        container.style.pointerEvents = disable ? 'none' : 'auto';
      }
    }
  });
}

function clearImportedMission() {
  importedWaypoints = null;
  importedPhotos = null;
  importedFileName = null;

  toggleUIControlsState(false);

  document.getElementById('clear-imported-btn').classList.add('hidden');
  document.getElementById('import-status-text').textContent = "Or click anywhere on the map to place the flight center.";
  document.getElementById('import-file-input').value = "";

  updateGrid();
}

function clearMap() {
  if (confirm("Are you sure you want to clear the current flight plan and center location?")) {
    if (centerMarker) {
      map.removeLayer(centerMarker);
      centerMarker = null;
    }
    clearAllPois();
    importedWaypoints = null;
    importedPhotos = null;
    importedFileName = null;
    generatedWaypoints = null;
    generatedPhotos = null;
    roadWaypoints = [];
    activeSplitStartIndices = new Set();

    if (typeof flightLayers !== 'undefined' && flightLayers) {
      flightLayers.forEach(l => {
        l.freeformWaypoints = [];
        l.freeformPhotos = [];
        l.roadWaypoints = [];
        l.waypoints = [];
        l.photos = [];
        l.targetPoly = [];
      });
    }

    if (flightPathPolyline) flightPathPolyline.clearLayers();
    if (roadPathGroup) roadPathGroup.clearLayers();
    if (targetPolygonGroup) targetPolygonGroup.clearLayers();
    setTargetPolyEditMode(false);
    if (gridBoundsPolygon) {
      map.removeLayer(gridBoundsPolygon);
      gridBoundsPolygon = null;
    }
    waypointMarkersGroup.clearLayers();
    if (pitchLabelsGroup) pitchLabelsGroup.clearLayers();
    photoMarkersGroup.clearLayers();

    // Reset controls visibility / state
    toggleUIControlsState(false);

    const clearImportedBtn = document.getElementById('clear-imported-btn');
    if (clearImportedBtn) clearImportedBtn.classList.add('hidden');
    
    const importStatusText = document.getElementById('import-status-text');
    if (importStatusText) {
      importStatusText.textContent = "Or click anywhere on the map to place the flight center.";
    }
    
    const importFileInput = document.getElementById('import-file-input');
    if (importFileInput) importFileInput.value = "";

    updateStatsPanel(null);
    cleanup3DPreview();
    
    // Reset Three.js preview container display text
    const container = document.getElementById('three-container');
    if (container) {
      container.innerHTML = `<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #94a3b8; font-size: 0.9rem;">Please place a flight center and generate waypoints first.</div>`;
    }
  }
}

function updatePathLinesAndStats(waypoints, photoLocations, centerLat, centerLon, gridWidth, gridHeight, rotationDeg) {
  const gridType = document.getElementById('grid-type').value;
  const speed = parseFloat(document.getElementById('speed').value);
  const captureMode = document.getElementById('capture-mode').value;

  drawFlightPathLines(waypoints, gridType);

  const stats = calculateStats(waypoints, photoLocations, speed, null, null, captureMode);
  updateStatsPanel(stats);
}

function convertToFreeformMission() {
  const currentWps = getCurrentWaypoints();
  if (!currentWps || currentWps.length === 0) return;
  const altitude = parseFloat(document.getElementById('altitude').value);
  
  generatedWaypoints = currentWps.map((w, idx) => ({
    lat: w.lat,
    lon: w.lon,
    x: w.x,
    y: w.y,
    alt: w.alt || altitude,
    pitch: w.pitch !== undefined ? w.pitch : null,
    heading: w.heading !== undefined ? w.heading : null,
    headingMode: w.headingMode || 'inherit',
    poiIndex: w.poiIndex || 0,
    speed: w.speed !== undefined ? w.speed : null,
    hoverTime: w.hoverTime !== undefined ? w.hoverTime : null,
    turnMode: w.turnMode || 'inherit',
    cameraAction: w.cameraAction || 'inherit',
    zoom: w.zoom !== undefined ? w.zoom : 1.0,
    isRingStart: w.isRingStart || false,
    ringIndex: w.ringIndex || null,
    idx: idx,
    origLat: w.origLat !== undefined ? w.origLat : w.lat,
    origLon: w.origLon !== undefined ? w.origLon : w.lon,
    origX: w.origX !== undefined ? w.origX : w.x,
    origY: w.origY !== undefined ? w.origY : w.y,
    origAlt: w.origAlt !== undefined ? w.origAlt : (w.alt || altitude),
    origPitch: w.origPitch !== undefined ? w.origPitch : (w.pitch !== undefined ? w.pitch : null),
    origHeading: w.origHeading !== undefined ? w.origHeading : (w.heading !== undefined ? w.heading : null),
    origHeadingMode: w.origHeadingMode || w.headingMode || 'inherit',
    origPoiIndex: w.origPoiIndex !== undefined ? w.origPoiIndex : (w.poiIndex || 0),
    origSpeed: w.origSpeed !== undefined ? w.origSpeed : (w.speed !== undefined ? w.speed : null),
    origHoverTime: w.origHoverTime !== undefined ? w.origHoverTime : (w.hoverTime !== undefined ? w.hoverTime : null),
    origTurnMode: w.origTurnMode || w.turnMode || 'inherit',
    origCameraAction: w.origCameraAction || w.cameraAction || 'inherit',
    origZoom: w.origZoom !== undefined ? w.origZoom : (w.zoom !== undefined ? w.zoom : 1.0)
  }));

  roadWaypoints = [];
  importedWaypoints = null;

  const activeLayer = typeof getActiveLayer === 'function' ? getActiveLayer() : null;
  if (activeLayer) {
    activeLayer.pattern = 'freeform';
    activeLayer.freeformWaypoints = generatedWaypoints.map(w => ({
      ...w,
      layerId: activeLayer.id,
      layerName: activeLayer.name,
      layerPattern: 'freeform'
    }));
    activeLayer.freeformPhotos = generatedWaypoints.map(w => ({
      lat: w.lat,
      lon: w.lon,
      x: w.x,
      y: w.y,
      alt: w.alt,
      pitch: w.pitch,
      heading: w.heading,
      layerId: activeLayer.id
    }));
    activeLayer.waypoints = activeLayer.freeformWaypoints;
    activeLayer.photos = activeLayer.freeformPhotos;
  }

  const gridTypeSelect = document.getElementById('grid-type');
  if (gridTypeSelect) {
    gridTypeSelect.value = 'freeform';
    gridTypeSelect.dispatchEvent(new Event('change'));
  }
  togglePatternParameters();
  syncDisplayValues();
  redrawCurrentMission();
}

/**
 * Helper to build Flight Leg Phase Badges with interactive hover breadcrumb ribbons (v1.82.0)
 * @param {string} phase - 'pre' | 'at' | 'post' | 'transition' | 'na'
 * @param {number} idx - 0-indexed waypoint index
 * @param {number} totalCount - total waypoints count
 * @param {string} paramLabel - e.g. 'Flight Speed', 'Heading Mode', 'Altitude'
 * @param {string} customDesc - optional custom explanatory text for tooltip
 */
function buildLegPhaseBadgeHTML(phase, idx, totalCount, paramLabel, customDesc) {
  const isStart = (idx === 0);
  const isEnd = (totalCount > 1 && idx === totalCount - 1);
  const wpNum = idx + 1; // 1-based display number

  let badgeText = '';
  let badgeClass = `phase-${phase}`;
  let preLabel = (idx > 0) ? `Leg ${idx}→${wpNum}` : 'Takeoff';
  let postLabel = (idx < totalCount - 1) ? `Leg ${wpNum}→${wpNum + 1}` : 'RTH / Land';
  let atLabel = `WP ${wpNum}`;

  let preNodeClass = (phase === 'pre') ? 'wp-leg-crumb-node active-pre' : 'wp-leg-crumb-node';
  let atNodeClass = (phase === 'at') ? 'wp-leg-crumb-node active-at' : 'wp-leg-crumb-node';
  let postNodeClass = (phase === 'post') ? 'wp-leg-crumb-node active-post' : (phase === 'transition' ? 'wp-leg-crumb-node active-transition' : 'wp-leg-crumb-node');

  let defaultDesc = '';

  switch (phase) {
    case 'pre':
      badgeText = '↗';
      defaultDesc = `Approach Leg (${preLabel}): Governs flight dynamics leading into Waypoint ${wpNum}.`;
      break;
    case 'at':
      badgeText = '📍';
      defaultDesc = `Stationary Point Action: Executes while holding position at Waypoint ${wpNum}.`;
      break;
    case 'post':
      badgeText = '↘';
      defaultDesc = `Departure Leg (${postLabel}): Governs flight dynamics departing Waypoint ${wpNum} toward the next waypoint.`;
      break;
    case 'transition':
      badgeText = '⤹';
      defaultDesc = `Trajectory Curvature: Governs transition curvature turning through Waypoint ${wpNum}.`;
      break;
    case 'na':
    default:
      badgeText = '⛔';
      badgeClass = 'phase-na';
      defaultDesc = customDesc || `Not applicable: Waypoint ${wpNum} is the final destination. Drone halts and triggers Mission Landing / RTH.`;
      break;
  }

  const desc = customDesc || defaultDesc;

  return `
    <span class="wp-leg-phase-badge ${badgeClass}" tabindex="0" title="${escapeHtml(desc)}">
      ${badgeText}
      <div class="wp-leg-breadcrumb-tooltip">
        <div class="wp-leg-breadcrumb-track">
          <span class="${preNodeClass}">${isStart ? '🛫 Takeoff' : preLabel}</span>
          <span class="wp-leg-crumb-arrow">▶</span>
          <span class="${atNodeClass}">${atLabel}</span>
          <span class="wp-leg-crumb-arrow">▶</span>
          <span class="${postNodeClass}">${isEnd ? '🏁 Finish' : postLabel}</span>
        </div>
        <div class="wp-leg-breadcrumb-desc">
          <strong style="color: var(--text-main); display: block; margin-bottom: 2px;">${escapeHtml(paramLabel)}:</strong>
          ${escapeHtml(desc)}
        </div>
      </div>
    </span>
  `;
}

/**
 * Universal Floating Tooltip Manager for Waypoint Leg Phase Badges (v1.86.5)
 * Prevents breadcrumb popups from being clipped by scrollable containers like #fpv-editor-panel
 * or Leaflet map popup boundaries.
 */
function initLegPhaseBadgeTooltips() {
  if (typeof document === 'undefined') return null;

  let floatingTooltip = document.getElementById('wp-leg-floating-tooltip');
  if (!floatingTooltip && document.body && typeof document.createElement === 'function') {
    floatingTooltip = document.createElement('div');
    floatingTooltip.id = 'wp-leg-floating-tooltip';
    floatingTooltip.className = 'wp-leg-breadcrumb-tooltip';
    floatingTooltip.style.display = 'none';
    floatingTooltip.style.position = 'fixed';
    floatingTooltip.style.zIndex = '10000000';
    floatingTooltip.style.pointerEvents = 'none';
    document.body.appendChild(floatingTooltip);
  }

  let activeBadge = null;

  function showTooltip(badge) {
    if (!badge) return;
    if (!floatingTooltip) {
      floatingTooltip = document.getElementById('wp-leg-floating-tooltip');
      if (!floatingTooltip && document.body && typeof document.createElement === 'function') {
        floatingTooltip = document.createElement('div');
        floatingTooltip.id = 'wp-leg-floating-tooltip';
        floatingTooltip.className = 'wp-leg-breadcrumb-tooltip';
        floatingTooltip.style.display = 'none';
        floatingTooltip.style.position = 'fixed';
        floatingTooltip.style.zIndex = '10000000';
        floatingTooltip.style.pointerEvents = 'none';
        document.body.appendChild(floatingTooltip);
      }
    }
    if (!floatingTooltip) return;

    const innerTooltip = badge.querySelector ? badge.querySelector('.wp-leg-breadcrumb-tooltip') : null;
    if (!innerTooltip) return;

    activeBadge = badge;
    floatingTooltip.innerHTML = innerTooltip.innerHTML;
    floatingTooltip.style.display = 'flex';
    positionTooltip(badge);
  }

  function hideTooltip() {
    activeBadge = null;
    if (floatingTooltip) {
      floatingTooltip.style.display = 'none';
    }
  }

  function positionTooltip(badge) {
    if (!badge || !floatingTooltip || floatingTooltip.style.display === 'none') return;
    if (badge.isConnected === false || badge.offsetParent === null) {
      hideTooltip();
      return;
    }
    if (typeof badge.getBoundingClientRect !== 'function') return;

    const badgeRect = badge.getBoundingClientRect();
    const tooltipWidth = floatingTooltip.offsetWidth || 260;
    const tooltipHeight = floatingTooltip.offsetHeight || 90;

    const fpvPanel = (typeof badge.closest === 'function') ? badge.closest('#fpv-editor-panel') : null;
    if (fpvPanel && typeof fpvPanel.getBoundingClientRect === 'function') {
      const panelRect = fpvPanel.getBoundingClientRect();

      // If badge has scrolled out of view in the editor panel, hide it
      if (badgeRect.bottom < panelRect.top || badgeRect.top > panelRect.bottom) {
        hideTooltip();
        return;
      }

      // If there is space to the left of the FPV editor panel, dock it to the left
      if (panelRect.left - tooltipWidth - 12 >= 10) {
        const left = panelRect.left - tooltipWidth - 12;
        let top = badgeRect.top + badgeRect.height / 2 - tooltipHeight / 2;
        const winH = (typeof window !== 'undefined' && window.innerHeight) ? window.innerHeight : 800;
        top = Math.max(16, Math.min(winH - tooltipHeight - 16, top));
        floatingTooltip.style.left = `${left}px`;
        floatingTooltip.style.top = `${top}px`;
        floatingTooltip.style.bottom = 'auto';
        floatingTooltip.style.right = 'auto';
        floatingTooltip.style.transform = 'none';
        return;
      }
    }

    // Default positioning: above or below badge, clamped to viewport boundaries
    const winW = (typeof window !== 'undefined' && window.innerWidth) ? window.innerWidth : 1200;
    const winH = (typeof window !== 'undefined' && window.innerHeight) ? window.innerHeight : 800;

    let left = badgeRect.left + badgeRect.width / 2 - tooltipWidth / 2;
    left = Math.max(12, Math.min(winW - tooltipWidth - 12, left));

    let top = badgeRect.top - tooltipHeight - 8;
    if (top < 12) {
      top = badgeRect.bottom + 8;
    }
    if (top + tooltipHeight > winH - 12) {
      top = Math.max(12, winH - tooltipHeight - 12);
    }

    floatingTooltip.style.left = `${left}px`;
    floatingTooltip.style.top = `${top}px`;
    floatingTooltip.style.bottom = 'auto';
    floatingTooltip.style.right = 'auto';
    floatingTooltip.style.transform = 'none';
  }

  // Delegated mouseover / mouseout / focusin / focusout
  if (typeof document.addEventListener === 'function') {
    document.addEventListener('mouseover', (e) => {
      const badge = e.target && e.target.closest ? e.target.closest('.wp-leg-phase-badge') : null;
      if (badge) {
        showTooltip(badge);
      }
    });

    document.addEventListener('mouseout', (e) => {
      const badge = e.target && e.target.closest ? e.target.closest('.wp-leg-phase-badge') : null;
      if (badge && (!e.relatedTarget || !badge.contains(e.relatedTarget))) {
        hideTooltip();
      }
    });

    document.addEventListener('focusin', (e) => {
      const badge = e.target && e.target.closest ? e.target.closest('.wp-leg-phase-badge') : null;
      if (badge) {
        showTooltip(badge);
      }
    });

    document.addEventListener('focusout', (e) => {
      const badge = e.target && e.target.closest ? e.target.closest('.wp-leg-phase-badge') : null;
      if (badge) {
        hideTooltip();
      }
    });
  }

  // Reposition on scroll (capture phase catches internal scrolling of #fpv-editor-panel)
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('scroll', () => {
      if (activeBadge) positionTooltip(activeBadge);
    }, true);

    window.addEventListener('resize', () => {
      if (activeBadge) positionTooltip(activeBadge);
    });
  }

  return { showTooltip, hideTooltip, positionTooltip, getFloatingTooltip: () => floatingTooltip };
}

/**
 * showHeadingHelpPopover — Lightweight, reusable heading mode help popover (v1.88.0)
 * Opens a small floating popover with 4-tab content explaining each heading mode.
 * Used consistently by the map waypoint popup AND the FPV editor panel.
 * @param {HTMLElement} anchorEl - The ? button that was clicked (used for positioning)
 */
function showHeadingHelpPopover(anchorEl) {
  if (typeof document === 'undefined') return;

  // Create popover once, reuse on subsequent calls
  let popover = document.getElementById('wp-heading-help-popover');
  if (!popover) {
    popover = document.createElement('div');
    popover.id = 'wp-heading-help-popover';
    popover.innerHTML = `
      <div class="wp-help-title">
        Heading Mode
        <button class="wp-help-close" id="wp-heading-help-close-btn" title="Close">✕</button>
      </div>
      <div class="wp-help-tab-row">
        <button class="wp-help-tab active" data-mode="followWayline">Follow Path</button>
        <button class="wp-help-tab" data-mode="fixed">Fixed (N)</button>
        <button class="wp-help-tab" data-mode="towardPOI">POI</button>
        <button class="wp-help-tab" data-mode="custom">Custom</button>
      </div>
      <div class="wp-help-content" id="wp-heading-help-content"></div>
    `;
    document.body.appendChild(popover);

    const helpContent = {
      followWayline: {
        title: 'Follow Flight Path',
        body: 'Drone yaws to always face the direction of travel. Camera looks forward along the route. Best for corridors, roads, and linear surveys.'
      },
      fixed: {
        title: 'Fixed Heading (North)',
        body: 'Drone maintains a fixed 0° (North) yaw throughout the entire flight, regardless of flight direction.'
      },
      towardPOI: {
        title: 'Point of Interest (POI)',
        body: 'Drone continuously rotates to keep its camera aimed at a designated Point of Interest (POI) marker on the map. Ideal for orbital and target-centric missions.'
      },
      custom: {
        title: 'Custom Angle',
        body: 'Set a specific yaw angle (0°–359°) for this waypoint override. The drone will rotate to this heading before departing.'
      }
    };

    const contentEl = popover.querySelector('#wp-heading-help-content');
    let activeMode = 'followWayline';

    function renderContent(mode) {
      const info = helpContent[mode] || helpContent['followWayline'];
      contentEl.innerHTML = `<strong>${info.title}</strong>${info.body}`;
    }
    renderContent(activeMode);

    popover.querySelectorAll('.wp-help-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        e.stopPropagation();
        activeMode = tab.dataset.mode;
        popover.querySelectorAll('.wp-help-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        renderContent(activeMode);
      });
    });

    const closeBtn = popover.querySelector('#wp-heading-help-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        popover.style.display = 'none';
        popover._anchorEl = null;
      });
    }

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (popover.style.display === 'flex' && !popover.contains(e.target) && e.target !== popover._anchorEl) {
        popover.style.display = 'none';
        popover._anchorEl = null;
      }
    }, { capture: true });
  }

  // Toggle if same button clicked again
  if (popover._anchorEl === anchorEl && popover.style.display === 'flex') {
    popover.style.display = 'none';
    popover._anchorEl = null;
    return;
  }
  popover._anchorEl = anchorEl;

  // Position relative to anchor button
  const rect = anchorEl.getBoundingClientRect();
  const popoverW = 240;
  let left = rect.right + 6;
  if (left + popoverW > window.innerWidth - 8) {
    left = rect.left - popoverW - 6;
  }
  let top = rect.top;
  if (top + 200 > window.innerHeight - 8) {
    top = window.innerHeight - 208;
  }
  popover.style.left = `${Math.max(4, left)}px`;
  popover.style.top = `${Math.max(4, top)}px`;
  popover.style.display = 'flex';
}

function deleteFlightWaypoint(wp, idx) {
  if (!wp && (idx === undefined || idx === null)) return;
  const gridType = (typeof document !== 'undefined' && document && document.getElementById && document.getElementById('grid-type'))
    ? document.getElementById('grid-type').value
    : '';
  // Determine target layer from wp.layerId or active layer
  const targetLayer = (wp && wp.layerId && typeof flightLayers !== 'undefined' && Array.isArray(flightLayers))
    ? flightLayers.find(l => l.id === wp.layerId)
    : (typeof getActiveLayer === 'function' ? getActiveLayer() : null);

  const isRoadFollow = (gridType === 'road-following') || (targetLayer && targetLayer.pattern === 'road-following');

  if (isRoadFollow) {
    if (typeof generatedWaypoints !== 'undefined' && Array.isArray(generatedWaypoints) && generatedWaypoints.length > idx) {
      generatedWaypoints.splice(idx, 1);
      generatedWaypoints.forEach((w, newIdx) => { w.idx = newIdx; });
    }
    if (targetLayer && Array.isArray(targetLayer.roadWaypoints)) {
      let rIdx = targetLayer.roadWaypoints.indexOf(wp);
      if (rIdx === -1 && wp && wp.idx !== undefined && wp.idx < targetLayer.roadWaypoints.length) {
        rIdx = wp.idx;
      }
      if (rIdx === -1 && idx !== undefined && idx !== null && idx < targetLayer.roadWaypoints.length) {
        rIdx = idx;
      }
      if (rIdx !== -1 && rIdx < targetLayer.roadWaypoints.length) {
        targetLayer.roadWaypoints.splice(rIdx, 1);
        targetLayer.roadWaypoints.forEach((w, newIdx) => { w.idx = newIdx; });
        if (typeof roadWaypoints !== 'undefined') {
          roadWaypoints = targetLayer.roadWaypoints;
        }
      }
    } else if (typeof roadWaypoints !== 'undefined' && Array.isArray(roadWaypoints) && roadWaypoints.length > idx) {
      roadWaypoints.splice(idx, 1);
      roadWaypoints.forEach((w, newIdx) => { w.idx = newIdx; });
    }
    if (typeof updateGrid === 'function') updateGrid();
  } else {
    // 1. If targetLayer is freeform (or current gridType is freeform), clean up targetLayer's internal arrays
    if (targetLayer && (targetLayer.pattern === 'freeform' || gridType === 'freeform')) {
      if (Array.isArray(targetLayer.freeformWaypoints) && targetLayer.freeformWaypoints.length > 0) {
        let fIdx = wp ? targetLayer.freeformWaypoints.indexOf(wp) : -1;
        if (fIdx === -1 && wp && wp.idx !== undefined && wp.idx !== null && targetLayer.freeformWaypoints[wp.idx]) {
          fIdx = wp.idx;
        }
        if (fIdx === -1 && wp) {
          fIdx = targetLayer.freeformWaypoints.findIndex(w =>
            Math.abs(w.lat - wp.lat) < 1e-7 && Math.abs(w.lon - wp.lon) < 1e-7
          );
        }
        if (fIdx === -1 && idx !== undefined && idx !== null && idx < targetLayer.freeformWaypoints.length) {
          fIdx = idx;
        }
        if (fIdx !== -1 && fIdx < targetLayer.freeformWaypoints.length) {
          targetLayer.freeformWaypoints.splice(fIdx, 1);
          targetLayer.freeformWaypoints.forEach((w, newIdx) => {
            w.layerWaypointIndex = newIdx;
          });
          if (Array.isArray(targetLayer.freeformPhotos) && targetLayer.freeformPhotos.length > fIdx) {
            targetLayer.freeformPhotos.splice(fIdx, 1);
          }
          if (Array.isArray(targetLayer.polygonVertices) && targetLayer.polygonVertices.length > fIdx) {
            targetLayer.polygonVertices.splice(fIdx, 1);
          }
        }
      }
      if (Array.isArray(targetLayer.waypoints) && targetLayer.waypoints.length > 0) {
        let lWpIdx = wp ? targetLayer.waypoints.indexOf(wp) : -1;
        if (lWpIdx !== -1 && lWpIdx < targetLayer.waypoints.length) {
          targetLayer.waypoints.splice(lWpIdx, 1);
          targetLayer.waypoints.forEach((w, newIdx) => {
            w.layerWaypointIndex = newIdx;
          });
          if (Array.isArray(targetLayer.photos) && targetLayer.photos.length > lWpIdx) {
            targetLayer.photos.splice(lWpIdx, 1);
          }
        } else {
          targetLayer.waypoints = (targetLayer.freeformWaypoints || []).slice();
          targetLayer.photos = (targetLayer.freeformPhotos || []).slice();
        }
      }
    }

    // 2. Remove from active mission waypoints and photos
    const activeWps = typeof getCurrentWaypoints === 'function' ? getCurrentWaypoints() : (typeof generatedWaypoints !== 'undefined' ? generatedWaypoints : null);
    const activePts = typeof getCurrentPhotos === 'function' ? getCurrentPhotos() : (typeof generatedPhotos !== 'undefined' ? generatedPhotos : null);
    let gIdx = (wp && activeWps) ? activeWps.indexOf(wp) : -1;
    if (gIdx === -1 && idx !== undefined && idx !== null && activeWps && idx < activeWps.length) {
      gIdx = idx;
    }
    if (gIdx === -1 && wp && activeWps) {
      gIdx = activeWps.findIndex(w =>
        Math.abs(w.lat - wp.lat) < 1e-7 && Math.abs(w.lon - wp.lon) < 1e-7
      );
    }
    if (gIdx !== -1 && activeWps && activeWps[gIdx]) {
      activeWps.splice(gIdx, 1);
      activeWps.forEach((w, newIdx) => { w.idx = newIdx; });
    }
    if (activePts && gIdx !== -1 && activePts[gIdx]) {
      activePts.splice(gIdx, 1);
    }
  }

  // 3. Update view / map / 3D scenes
  if (targetLayer && targetLayer.pattern === 'freeform' && typeof updateGrid === 'function') {
    updateGrid();
  } else {
    if (typeof redrawCurrentMission === 'function') redrawCurrentMission();
    if (typeof renderLayersList === 'function') renderLayersList();
    if (typeof recreate3DWaypointsAndPaths === 'function') recreate3DWaypointsAndPaths();
  }
}

function createWaypointEditorDOM(wp, idx, marker, popupMarker, customWaypointsList = null) {
  const popupContent = document.createElement('div');
  popupContent.className = 'wp-editor-popup';
  popupContent.style.width = '100%';
  popupContent.style.maxWidth = '100%';
  popupContent.style.boxSizing = 'border-box';
  popupContent.style.color = '#f8fafc';
  popupContent.style.fontFamily = 'Outfit, sans-serif';

  const overlappingItems = getOverlappingItemsAt({ lat: wp.lat, lng: wp.lon });
  let overlappingHTML = '';
  if (overlappingItems.length > 1) {
    let optionsHTML = '';
    overlappingItems.forEach(item => {
      const isCurrent = (item.marker === marker || (item.type === 'waypoint' && item.idx === idx));
      const valKey = `${item.type}_${item.idx !== undefined ? item.idx : 0}`;
      optionsHTML += `<option value="${valKey}" ${isCurrent ? 'selected' : ''}>${item.name}</option>`;
    });
    overlappingHTML = `
      <div style="margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,0.15);">
        <label style="display:block; font-size:0.75rem; color:#94a3b8; margin-bottom:2px;">Stacked Items Here:</label>
        <select id="edit-wp-stacked-select" class="form-select" style="width:100%; font-size:0.8rem; padding:2px 4px; background:#1e293b; color:#fff; border:1px solid #475569; border-radius:4px;">
          ${optionsHTML}
        </select>
      </div>
    `;
  }

  const gridType = document.getElementById('grid-type')?.value;
  if (gridType === 'road-following') {
    if (wp.roadMarker) {
      popupContent.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 8px; color: var(--text-main); font-size: 0.9rem; border-bottom: 1px solid var(--border-color); padding-bottom: 6px; display: flex; justify-content: space-between; align-items: center;">
          <span>Road Node ${idx}</span>
        </div>
        ${overlappingHTML}
        <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 12px; line-height: 1.35;">
          ℹ️ Drag this amber marker on the map to adjust the road driving path.
        </div>
        <button id="delete-road-node-btn" class="btn btn-danger" style="width: 100%; font-size: 0.8rem; padding: 6px 10px; background: #ef4444; color: white; border: none; border-radius: 6px; font-weight: 600; cursor: pointer;">
          <span>Delete Road Node ${idx}</span>
        </button>
      `;

      const deleteBtn = popupContent.querySelector('#delete-road-node-btn');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
          const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
          const roadList = (activeLayer && activeLayer.roadWaypoints) ? activeLayer.roadWaypoints : (typeof roadWaypoints !== 'undefined' ? roadWaypoints : []);
          if (roadList && roadList.length <= 2) {
            alert("Cannot delete road node: a road follow path must contain at least 2 points.");
            return;
          }
          if (confirm(`Are you sure you want to delete Road Node ${idx}?`)) {
            if (activeLayer && activeLayer.roadWaypoints && activeLayer.roadWaypoints.length > idx) {
              activeLayer.roadWaypoints.splice(idx, 1);
              activeLayer.roadWaypoints.forEach((w, newIdx) => { w.idx = newIdx; });
              roadWaypoints = activeLayer.roadWaypoints;
            } else if (roadWaypoints && roadWaypoints.length > idx) {
              roadWaypoints.splice(idx, 1);
              roadWaypoints.forEach((w, newIdx) => { w.idx = newIdx; });
            }
            if (marker && marker.closePopup) marker.closePopup();
            updateGrid();
          }
        });
      }
      return popupContent;
    } else {
      const defaultGimbalPitch = parseGimbalPitch(document.getElementById('gimbal-pitch')?.value, -60);
      const pitch = (wp.pitch !== undefined && wp.pitch !== null && !isNaN(wp.pitch)) ? wp.pitch : defaultGimbalPitch;
      const displayPitch = (typeof pitch === 'number' && !isNaN(pitch)) ? Math.round(pitch) : pitch;
      const headingDisplay = (wp.heading !== null && wp.heading !== undefined && !isNaN(wp.heading)) ? wp.heading.toFixed(0) : '—';

      popupContent.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 8px; color: var(--text-main); font-size: 0.9rem; border-bottom: 1px solid var(--border-color); padding-bottom: 6px; display: flex; justify-content: space-between; align-items: center;">
          <span>Drone Waypoint ${idx}</span>
        </div>
        ${overlappingHTML}
        <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 10px; display: flex; flex-direction: column; gap: 4px;">
          <div><strong>Height:</strong> ${formatDistance(wp.alt, 0)}</div>
          <div><strong>Yaw:</strong> ${headingDisplay}°</div>
          <div><strong>Gimbal Pitch:</strong> ${displayPitch}°</div>
        </div>
        <div style="background: rgba(6, 182, 212, 0.1); border: 1px solid rgba(6, 182, 212, 0.25); padding: 8px; border-radius: 6px; font-size: 0.75rem; color: #cbd5e1; margin-bottom: 10px; line-height: 1.35;">
          ℹ️ Road Follow waypoints are automatically calculated relative to the road offset.<br><br>
          To edit, move, or nudge individual waypoints, please convert to <strong>Freeform</strong> mode.
        </div>
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <button id="delete-road-drone-wp-btn" class="btn btn-danger" style="width: 100%; font-size: 0.8rem; padding: 6px 10px; display: flex; align-items: center; justify-content: center; gap: 6px; background: #ef4444; color: white; border: none; border-radius: 6px; font-weight: 600; cursor: pointer;">
            <span>🗑️ Delete Waypoint ${idx}</span>
          </button>
          <button id="convert-to-freeform-btn" class="btn btn-primary" style="width: 100%; font-size: 0.8rem; padding: 6px 10px; display: flex; align-items: center; justify-content: center; gap: 6px; background: var(--accent-cyan); color: #0f172a; border: none; border-radius: 6px; font-weight: 600; cursor: pointer;">
            <span>✏️ Convert to Freeform Mode</span>
          </button>
        </div>
      `;

      const deleteWpBtn = popupContent.querySelector('#delete-road-drone-wp-btn');
      if (deleteWpBtn) {
        deleteWpBtn.addEventListener('click', () => {
          const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
          const roadList = (activeLayer && activeLayer.roadWaypoints) ? activeLayer.roadWaypoints : (typeof roadWaypoints !== 'undefined' ? roadWaypoints : []);
          if (roadList && roadList.length <= 2) {
            alert("Cannot delete waypoint: a flight plan must contain at least 2 waypoints.");
            return;
          }
          if (confirm(`Are you sure you want to delete Waypoint ${idx}?`)) {
            if (activeLayer && activeLayer.roadWaypoints && activeLayer.roadWaypoints.length > idx) {
              activeLayer.roadWaypoints.splice(idx, 1);
              activeLayer.roadWaypoints.forEach((w, newIdx) => { w.idx = newIdx; });
              roadWaypoints = activeLayer.roadWaypoints;
            } else if (roadWaypoints && roadWaypoints.length > idx) {
              roadWaypoints.splice(idx, 1);
              roadWaypoints.forEach((w, newIdx) => { w.idx = newIdx; });
            }
            if (marker && marker.closePopup) marker.closePopup();
            updateGrid();
          }
        });
      }

      const convertBtn = popupContent.querySelector('#convert-to-freeform-btn');
      if (convertBtn) {
        convertBtn.addEventListener('click', () => {
          if (marker && marker.closePopup) marker.closePopup();
          convertToFreeformMission();
        });
      }

      return popupContent;
    }
  }

  const headingVal = (wp.heading !== undefined && wp.heading !== null) ? wp.heading.toFixed(0) : '';
  const wpLayer = (wp.layerId && typeof flightLayers !== 'undefined') ? flightLayers.find(l => l.id === wp.layerId) : ((typeof getActiveLayer === 'function') ? getActiveLayer() : null);
  const targetPoi = (typeof getTargetPoiCoordinates === 'function') ? getTargetPoiCoordinates(wp, wpLayer) : null;
  const autoPitchVal = (typeof calculate3DPoiPitch === 'function') ? calculate3DPoiPitch(wp, targetPoi, wp.alt || 50) : -45;

  let isAutoPitch = (wp.pitch === 'auto') || ((wp.pitch === undefined || wp.pitch === null) && (wpLayer?.gimbalPitch === 'auto'));
  const pitchVal = (wp.pitch !== undefined && wp.pitch !== null && wp.pitch !== 'auto') ? Math.round(wp.pitch) : autoPitchVal;
  const pitchValTextDisplay = isAutoPitch ? `Auto 🎯 (${autoPitchVal}°)` : `${pitchVal}°`;

  if (typeof fpvProgressIndex !== 'undefined' && idx !== null && idx !== undefined) {
    fpvProgressIndex = idx;
    if (typeof updateFPVEditorUI === 'function') {
      updateFPVEditorUI();
    }
  }

  const originalLat = wp.lat;
  const originalLon = wp.lon;
  const originalX = wp.x;
  const originalY = wp.y;
  const originalAlt = wp.alt;
  const originalPitch = wp.pitch;
  const originalHeading = wp.heading;
  const originalHeadingMode = wp.headingMode || 'inherit';
  const originalPoiIndex = wp.poiIndex || 0;
  const originalSpeed = wp.speed;
  const originalHoverTime = wp.hoverTime;
  const originalTurnMode = wp.turnMode || 'inherit';
  const originalCameraAction = wp.cameraAction || 'inherit';
  const originalZoom = wp.zoom;
  const originalIsRingStart = wp.isRingStart;
  const originalIsModified = wp.isModified;
  const originalOrigIsRingStart = wp.origIsRingStart;
  const originalOrigIsModified = wp.origModified;

  const originalRoadLat = (roadWaypoints && roadWaypoints[idx]) ? roadWaypoints[idx].lat : null;
  const originalRoadLon = (roadWaypoints && roadWaypoints[idx]) ? roadWaypoints[idx].lon : null;
  const originalRoadX = (roadWaypoints && roadWaypoints[idx]) ? roadWaypoints[idx].x : null;
  const originalRoadY = (roadWaypoints && roadWaypoints[idx]) ? roadWaypoints[idx].y : null;

  // Track photo offsets if applicable
  let originalPhotoLat = null;
  let originalPhotoLon = null;
  let originalPhotoX = null;
  let originalPhotoY = null;
  const activePhotos = getCurrentPhotos();
  const hasPhoto = activePhotos && activePhotos[idx];
  if (hasPhoto) {
    originalPhotoLat = activePhotos[idx].lat;
    originalPhotoLon = activePhotos[idx].lon;
    originalPhotoX = activePhotos[idx].x;
    originalPhotoY = activePhotos[idx].y;
  }

  const unit = getUnitSystem();
  const altDisp = unit === 'imperial' ? Math.round(wp.alt * M_TO_FT) : wp.alt.toFixed(0);
  const altUnitStr = unit === 'imperial' ? 'ft' : 'm';
  const initialStepLabel = unit === 'imperial' ? '5 ft' : '1m';

  const hasMoved = (
    (wp.origLat !== undefined && wp.origLat !== null && Math.abs(wp.lat - wp.origLat) > 1e-9) ||
    (wp.origLon !== undefined && wp.origLon !== null && Math.abs(wp.lon - wp.origLon) > 1e-9) ||
    (wp.origAlt !== undefined && wp.origAlt !== null && Math.abs(wp.alt - wp.origAlt) > 1e-3) ||
    (wp.origPitch !== undefined && wp.origPitch !== null && wp.pitch !== wp.origPitch) ||
    (wp.origHeadingMode !== undefined && wp.origHeadingMode !== null && wp.headingMode !== wp.origHeadingMode) ||
    (wp.origPoiIndex !== undefined && wp.origPoiIndex !== null && (wp.poiIndex || 0) !== wp.origPoiIndex) ||
    (wp.origHeading !== undefined && wp.origHeading !== null && wp.heading !== wp.origHeading) ||
    (wp.origHeading === null && wp.heading !== null) ||
    (wp.origHeading !== null && wp.heading === null)
  );

  const curMode = wp.headingMode || 'inherit';
  let layerPoiName = 'Default (POI 0)';
  if (wpLayer && wpLayer.targetPoiId && wpLayer.targetPoiId !== 'inherit' && Array.isArray(pois)) {
    const lp = pois.find(p => p.id === wpLayer.targetPoiId);
    if (lp) layerPoiName = lp.name;
  } else if (Array.isArray(pois) && pois[0]) {
    layerPoiName = pois[0].name;
  }

  const isInheritedPoi = !wp.targetPoiId || wp.targetPoiId === 'inherit';
  const poiIndex = (!isInheritedPoi && wp.targetPoiId && Array.isArray(pois) && pois.findIndex(p => p.id === wp.targetPoiId) !== -1)
    ? pois.findIndex(p => p.id === wp.targetPoiId)
    : (!isInheritedPoi && wp.poiIndex !== undefined && wp.poiIndex !== null ? wp.poiIndex : null);
  const isPoiMode = (getEffectiveWaypointHeadingMode(wp) === 'towardPOI');
  let poiSelectOptions = `<option value="inherit" ${isInheritedPoi ? 'selected' : ''}>🌐 Inherit Layer POI (${layerPoiName})</option>`;
  if (Array.isArray(pois)) {
    pois.forEach((poi, idx) => {
      poiSelectOptions += `<option value="${idx}" ${(!isInheritedPoi && poiIndex === idx) ? 'selected' : ''}>${poi.name}</option>`;
    });
  }

  // Calculate waypoint total and boundary context for leg indicators (v1.82.0)
  const allWaypoints = customWaypointsList || (typeof getCurrentWaypoints === 'function' ? getCurrentWaypoints() : null) || (typeof generatedWaypoints !== 'undefined' ? generatedWaypoints : null) || [];
  const totalWaypointsCount = allWaypoints.length || 1;
  const isStartWp = (idx === 0);
  const isEndWp = (totalWaypointsCount > 1 && idx === totalWaypointsCount - 1);

  // Determine Heading Mode Phase
  const headingPhase = isStartWp ? 'at' : 'pre';
  const headingCustomDesc = isStartWp
    ? 'Executes at Takeoff: Drone rotates on-axis to initial heading before commencing flight.'
    : undefined;

  // Determine Speed Phase & Boundary Adaptation
  const speedPhase = isEndWp ? 'na' : 'post';
  const speedCustomDesc = isEndWp
    ? 'No departure leg exists. The drone comes to a full stop at this final waypoint to execute Mission Landing / RTH.'
    : undefined;

  // Determine Turn Mode Phase & Boundary Adaptation
  const turnPhase = isEndWp ? 'na' : 'transition';
  const turnCustomDesc = isEndWp
    ? 'End of route: The drone must stop at the final destination coordinate before RTH or mission finish.'
    : undefined;

  // Generate Phase Badges
  const altBadgeHTML = buildLegPhaseBadgeHTML('at', idx, totalWaypointsCount, 'Altitude');
  const pitchBadgeHTML = buildLegPhaseBadgeHTML('at', idx, totalWaypointsCount, 'Gimbal Pitch');
  const speedBadgeHTML = buildLegPhaseBadgeHTML(speedPhase, idx, totalWaypointsCount, 'Flight Speed', speedCustomDesc);
  const hoverBadgeHTML = buildLegPhaseBadgeHTML('at', idx, totalWaypointsCount, 'Hover Time');
  const turnBadgeHTML = buildLegPhaseBadgeHTML(turnPhase, idx, totalWaypointsCount, 'Turn Mode', turnCustomDesc);
  const cameraBadgeHTML = buildLegPhaseBadgeHTML('at', idx, totalWaypointsCount, 'Camera Action');
  const zoomBadgeHTML = buildLegPhaseBadgeHTML('at', idx, totalWaypointsCount, 'Camera Zoom');
  const headingBadgeHTML = buildLegPhaseBadgeHTML(headingPhase, idx, totalWaypointsCount, 'Heading Mode', headingCustomDesc);

  // Resolve Speed Label
  let resolvedWpSpeed = 4.0;
  if (wp.isTurnaroundPoint && wp.turnaroundSpeed !== null && wp.turnaroundSpeed !== undefined && !isNaN(wp.turnaroundSpeed)) {
    resolvedWpSpeed = wp.turnaroundSpeed;
  } else if (wpLayer && wpLayer.speed !== undefined && wpLayer.speed !== null && !isNaN(wpLayer.speed)) {
    resolvedWpSpeed = wpLayer.speed;
  } else {
    const speedEl = document.getElementById('speed');
    resolvedWpSpeed = speedEl ? (parseFloat(speedEl.value) || 4.0) : 4.0;
  }
  const resolvedSpeedStr = `${resolvedWpSpeed.toFixed(1)} m/s`;

  // Resolve Camera Action Label
  const effCaptureMode = (wp.layerCaptureMode && wp.layerCaptureMode !== 'inherit') ? wp.layerCaptureMode : getEffectiveLayerCaptureMode(wpLayer);
  const mapCaptureName = {
    'stopAndShoot': 'Stop & Shoot',
    'continuous': 'Continuous Flight',
    'video': 'Video Mode'
  };
  const resolvedCapLabel = mapCaptureName[effCaptureMode] || effCaptureMode;

  // Resolve Heading Mode Label
  const effHeadingMode = (wp.layerHeadingMode && wp.layerHeadingMode !== 'inherit') ? wp.layerHeadingMode : getEffectiveLayerHeadingMode(wpLayer);
  const mapHeadingName = {
    'followWayline': 'Follow Flight Path',
    'fixed': 'Fixed North',
    'towardPOI': 'Point of Interest (POI)',
    'custom': 'Custom Angle'
  };
  const resolvedHeadingLabel = mapHeadingName[effHeadingMode] || effHeadingMode;

  popupContent.innerHTML = `
    <div id="wp-popup-drag-handle" style="cursor: grab; padding: 0 24px 6px 0; margin-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.08); user-select: none;">
      <div style="font-weight: 600; color: #06b6d4; font-size: 0.85rem; display: flex; align-items: center; justify-content: space-between;">
        <div style="display: flex; align-items: center; gap: 6px;">
          <span>🛠️ Edit Waypoint <span id="edit-wp-title-text">${idx}</span></span>
          <button id="wp-popup-collapse-btn" type="button" style="background: transparent; border: none; color: #94a3b8; cursor: pointer; font-size: 0.75rem; padding: 0 4px; flex-shrink: 0;" title="Minimize/Expand Popup">▼</button>
        </div>
        <span style="font-size: 0.65rem; color: #94a3b8; display: inline-flex; align-items: center; gap: 3px; font-weight: normal; background: rgba(255,255,255,0.05); padding: 1px 5px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.08);">⠿ Drag</span>
      </div>
      <div style="font-family: monospace; font-size: 0.7rem; color: #94a3b8; margin-top: 3px;">
        <span id="edit-wp-coords-display">${wp.lat.toFixed(5)}, ${wp.lon.toFixed(5)}</span>
      </div>
    </div>
    <div id="edit-wp-body" style="display: flex; flex-direction: column; gap: 10px; font-size: 0.75rem;">
      ${overlappingHTML}

      <!-- 2-column grid: Altitude, Pitch, Speed, Hover -->
      <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px;">

        <!-- Altitude Slider -->
        <div style="display: flex; flex-direction: column; gap: 3px; min-width: 0;">
          <div style="display: flex; justify-content: space-between; align-items: center; min-width: 0;">
            <span style="color: #94a3b8; display: inline-flex; align-items: center; gap: 4px; font-size: 0.72rem; white-space: nowrap;">
              <svg viewBox="0 0 24 24" width="14" height="14" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><line x1="3" y1="21" x2="21" y2="21" stroke="#c2622d"/><path d="M12 21v-12M9 12l3-3 3 3" stroke="#06b6d4" fill="none"/><circle cx="12" cy="7" r="1.5" fill="#f5f0e8"/></svg>
              Altitude:
              ${altBadgeHTML}
            </span>
            <span style="color: #06b6d4; font-weight: 600; font-size: 0.72rem; white-space: nowrap;"><span id="edit-wp-alt-val">${altDisp}</span> ${altUnitStr}</span>
          </div>
          <input type="range" id="edit-wp-alt" min="5" max="120" value="${wp.alt.toFixed(0)}" style="width: 100%; height: 4px; accent-color: #06b6d4; cursor: pointer; min-width: 0; box-sizing: border-box;">
        </div>

        <!-- Pitch Slider -->
        <div style="display: flex; flex-direction: column; gap: 3px; min-width: 0;">
          <div style="display: flex; justify-content: space-between; align-items: center; min-width: 0; gap: 4px;">
            <span style="color: #94a3b8; display: inline-flex; align-items: center; gap: 4px; font-size: 0.72rem; white-space: nowrap;">
              <svg viewBox="0 0 24 24" width="14" height="14" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><circle cx="8" cy="8" r="3" stroke="#c2622d" fill="none"/><line x1="8" y1="5" x2="8" y2="2" stroke="#c2622d"/><line x1="8" y1="8" x2="16" y2="16" stroke="#06b6d4"/><path d="M13 17l4-1-1-4" fill="#06b6d4" stroke="#06b6d4"/></svg>
              Pitch:
              ${pitchBadgeHTML}
            </span>
            <span style="color: #06b6d4; font-weight: 600; font-size: 0.72rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: right;"><span id="edit-wp-pitch-val">${pitchValTextDisplay}</span></span>
          </div>
          <div style="display: flex; gap: 4px; align-items: center; min-width: 0;">
            <input type="range" id="edit-wp-pitch" min="-90" max="60" value="${pitchVal}" style="flex: 1; width: 0; min-width: 0; height: 4px; accent-color: #06b6d4; cursor: pointer; box-sizing: border-box;">
            <button id="edit-wp-pitch-auto-btn" type="button" style="padding: 2px 5px; font-size: 0.65rem; font-weight: 600; border-radius: 4px; background: ${isAutoPitch ? 'rgba(6, 182, 212, 0.2)' : 'rgba(255,255,255,0.06)'}; border: 1px solid ${isAutoPitch ? 'rgba(6, 182, 212, 0.4)' : 'rgba(255,255,255,0.1)'}; color: ${isAutoPitch ? 'var(--accent-cyan)' : 'var(--text-muted)'}; cursor: pointer; line-height: 1; white-space: nowrap; flex-shrink: 0;" title="Toggle 3D Auto POI Tracking">🎯 Auto</button>
          </div>
        </div>

        <!-- Speed Override Slider -->
        <div id="edit-wp-speed-container" class="${isEndWp ? 'wp-leg-control-disabled' : ''}" style="display: flex; flex-direction: column; gap: 3px; min-width: 0;">
          <div style="display: flex; justify-content: space-between; align-items: center; min-width: 0; gap: 4px;">
            <span style="color: #94a3b8; display: inline-flex; align-items: center; gap: 4px; font-size: 0.72rem; white-space: nowrap;">
              <svg viewBox="0 0 24 24" width="14" height="14" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><path d="M3 12a9 9 0 0 1 15-6.7M21 12a9 9 0 0 1-9 9" stroke="#06b6d4" fill="none"/><line x1="12" y1="12" x2="17" y2="8" stroke="#c2622d"/><circle cx="12" cy="12" r="1.5" fill="#f5f0e8"/></svg>
              Speed:
              ${speedBadgeHTML}
            </span>
            <span style="color: #06b6d4; font-weight: 600; font-size: 0.72rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: right;"><span id="edit-wp-speed-val">${isEndWp ? 'N/A' : (wp.speed ? wp.speed + ' m/s' : `Auto (${resolvedSpeedStr})`)}</span></span>
          </div>
          <input type="range" id="edit-wp-speed" min="0.2" max="15" step="0.1" value="${wp.speed || 5}" ${isEndWp ? 'disabled' : ''} style="width: 100%; height: 4px; accent-color: #06b6d4; cursor: ${isEndWp ? 'not-allowed' : 'pointer'}; min-width: 0; box-sizing: border-box;">
          ${isEndWp ? `<span class="wp-leg-na-notice">🏁 Final waypoint: no departure leg. Speed is not applicable.</span>` : ''}
        </div>

        <!-- Hover Duration Slider -->
        <div style="display: flex; flex-direction: column; gap: 3px; min-width: 0;">
          <div style="display: flex; justify-content: space-between; align-items: center; min-width: 0; gap: 4px;">
            <span style="color: #94a3b8; display: inline-flex; align-items: center; gap: 4px; font-size: 0.72rem; white-space: nowrap;">
              <svg viewBox="0 0 24 24" width="14" height="14" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><circle cx="12" cy="12" r="9" stroke="#06b6d4" fill="none"/><polyline points="12 6 12 12 16 14" stroke="#c2622d"/></svg>
              Hover:
              ${hoverBadgeHTML}
            </span>
            <span style="color: #06b6d4; font-weight: 600; font-size: 0.72rem; white-space: nowrap;"><span id="edit-wp-hover-val">${wp.hoverTime !== null && wp.hoverTime !== undefined && wp.hoverTime !== 'inherit' ? wp.hoverTime : ((wp.layerHoverTime !== undefined && wp.layerHoverTime !== 'inherit') ? wp.layerHoverTime : (document.getElementById('global-hover-time') ? parseInt(document.getElementById('global-hover-time').value) : 0))}</span>s</span>
          </div>
          <input type="range" id="edit-wp-hover" min="0" max="60" step="1" value="${wp.hoverTime !== null && wp.hoverTime !== undefined && wp.hoverTime !== 'inherit' ? wp.hoverTime : ((wp.layerHoverTime !== undefined && wp.layerHoverTime !== 'inherit') ? wp.layerHoverTime : (document.getElementById('global-hover-time') ? parseInt(document.getElementById('global-hover-time').value) : 0))}" style="width: 100%; height: 4px; accent-color: #06b6d4; cursor: pointer; min-width: 0; box-sizing: border-box;">
          <div id="edit-wp-hover-warning" style="display: none; font-size: 0.65rem; color: #f59e0b; margin-top: 2px; line-height: 1.2;">
            ⚠️ Repositioning detected: auto-settling delay will be applied in KML export.
          </div>
        </div>


        <!-- Turn Mode Selector (full width) -->
        <div id="edit-wp-turn-mode-container" class="${isEndWp ? 'wp-leg-control-disabled' : ''}" style="display: flex; flex-direction: column; gap: 3px; grid-column: 1 / -1;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="color: #94a3b8; display: inline-flex; align-items: center; gap: 5px;">
              <svg viewBox="0 0 24 24" width="14" height="14" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" stroke="#06b6d4" fill="none"/><line x1="4" y1="22" x2="4" y2="15" stroke="#c2622d"/></svg>
              Turn Mode:
              ${turnBadgeHTML}
            </span>
            <select id="edit-wp-turn-mode" class="form-select" ${isEndWp ? 'disabled' : ''} style="font-size: 0.72rem; padding: 3px 6px; border-radius: 6px; background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255,255,255,0.1); color: var(--text-main); cursor: ${isEndWp ? 'not-allowed' : 'pointer'};">
              <option value="inherit" ${!wp.turnMode || wp.turnMode === 'inherit' ? 'selected' : ''}>🌐 Inherit Layer (${(wp.layerPathMode && wp.layerPathMode !== 'inherit') ? (wp.layerPathMode === 'straight' ? 'Stop & Turn' : 'Curved Pass') : (document.getElementById('path-mode')?.value === 'straight' ? 'Stop & Turn' : 'Curved Pass')})</option>
              <option value="stop" ${wp.turnMode === 'stop' ? 'selected' : ''}>Stop & Turn</option>
              <option value="pass" ${wp.turnMode === 'pass' ? 'selected' : ''}>Curved Pass</option>
            </select>
          </div>
          ${isEndWp ? `<span class="wp-leg-na-notice">🛑 End of route: drone stops at destination before RTH/Landing.</span>` : ''}
        </div>

        <!-- Camera Action Selector (full width) -->
        <div style="display: flex; flex-direction: column; gap: 3px; grid-column: 1 / -1;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="color: #94a3b8; display: inline-flex; align-items: center; gap: 5px;">
              <svg viewBox="0 0 24 24" width="14" height="14" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" stroke="#06b6d4" fill="none"/><circle cx="12" cy="13" r="4" stroke="#c2622d" fill="none"/></svg>
              Camera Action:
              ${cameraBadgeHTML}
            </span>
            <select id="edit-wp-camera-action" class="form-select" style="font-size: 0.72rem; padding: 3px 6px; border-radius: 6px; background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255,255,255,0.1); color: var(--text-main); cursor: pointer;">
              <option value="inherit" ${!wp.cameraAction || wp.cameraAction === 'inherit' ? 'selected' : ''}>🌐 Inherit Layer Mode (${resolvedCapLabel})</option>
              <option value="none" ${wp.cameraAction === 'none' ? 'selected' : ''}>None (No Action)</option>
              <option value="takePhoto" ${wp.cameraAction === 'takePhoto' ? 'selected' : ''}>Take Photo</option>
              <option value="startRecord" ${wp.cameraAction === 'startRecord' ? 'selected' : ''}>Start Recording</option>
              <option value="stopRecord" ${wp.cameraAction === 'stopRecord' ? 'selected' : ''}>Stop Recording</option>
              <option value="zoom" ${wp.cameraAction === 'zoom' ? 'selected' : ''}>Set Camera Zoom</option>
            </select>
          </div>
        </div>

        <!-- Camera Zoom Factor (full width, conditional) -->
        <div id="edit-wp-zoom-container" style="display: ${wp.cameraAction === 'zoom' ? 'flex' : 'none'}; flex-direction: column; gap: 3px; grid-column: 1 / -1;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="color: #94a3b8; display: inline-flex; align-items: center; gap: 5px;">
              <svg viewBox="0 0 24 24" width="14" height="14" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><circle cx="11" cy="11" r="8" fill="none" stroke="#06b6d4"></circle><line x1="21" y1="21" x2="16.65" y2="16.65" stroke="#06b6d4"></line></svg>
              Camera Zoom:
              ${zoomBadgeHTML}
            </span>
            <span style="color: #06b6d4; font-weight: 600;"><span id="edit-wp-zoom-val">${(wp.zoom || 1.0).toFixed(1)}</span>x</span>
          </div>
          <input type="range" id="edit-wp-zoom" min="1.0" max="4.0" step="0.1" value="${wp.zoom || 1.0}" style="width: 100%; height: 4px; accent-color: #06b6d4; cursor: pointer;">
        </div>

        <!-- Heading Mode (full width) -->
        <div style="display: flex; flex-direction: column; gap: 3px; grid-column: 1 / -1;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="color: #94a3b8; display: inline-flex; align-items: center; gap: 5px;">
              <svg viewBox="0 0 24 24" width="14" height="14" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><polygon points="3 11 22 2 13 21 11 13 3 11" stroke="#06b6d4" fill="none"/></svg>
              Heading Mode:
              ${headingBadgeHTML}
            </span>
            <div style="display: inline-flex; align-items: center; gap: 4px;">
              <span id="edit-wp-heading-val" style="color: #06b6d4; font-weight: 600;">Auto</span>
              <button id="edit-wp-heading-help-btn" type="button" class="wp-editor-help-btn" title="Heading Mode Help">?</button>
            </div>
          </div>
          <div style="display: flex; flex-direction: column; gap: 6px; margin-top: 2px;">
            <select id="edit-wp-heading-mode" class="form-select" style="font-size: 0.72rem; padding: 4px 8px; border-radius: 6px; background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255,255,255,0.1); color: var(--text-main); cursor: pointer; width: 100%;">
              <option value="inherit" ${curMode === 'inherit' ? 'selected' : ''}>🌐 Inherit Layer Default (${resolvedHeadingLabel})</option>
              <option value="followWayline" ${curMode === 'followWayline' ? 'selected' : ''}>Follow Flight Path</option>
              <option value="fixed" ${curMode === 'fixed' ? 'selected' : ''}>Fixed Heading (North)</option>
              <option value="towardPOI" ${curMode === 'towardPOI' ? 'selected' : ''}>Point of Interest (POI)</option>
              <option value="custom" ${curMode === 'custom' ? 'selected' : ''}>Custom Angle</option>
            </select>
            <select id="edit-wp-poi-select" class="form-select" style="font-size: 0.72rem; padding: 4px 8px; border-radius: 6px; background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255,255,255,0.1); color: var(--text-main); cursor: pointer; width: 100%; display: ${isPoiMode ? 'block' : 'none'};">
              ${poiSelectOptions}
            </select>
            <input type="range" id="edit-wp-heading" min="0" max="359" value="${headingVal !== '' ? headingVal : 0}" style="width: 100%; height: 4px; accent-color: #06b6d4; cursor: pointer; display: ${curMode === 'custom' ? 'block' : 'none'};">
          </div>
        </div>

      </div><!-- end 2-col grid -->

      <!-- Position Nudge & Lat/Lon Inputs -->
      <div style="display: flex; flex-direction: column; gap: 6px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 8px;">
        <span style="color: #94a3b8; font-weight: 500; display: inline-flex; align-items: center; gap: 5px;"><svg viewBox="0 0 24 24" width="14" height="14" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z" stroke="#06b6d4" fill="none"/><circle cx="12" cy="10" r="3" stroke="#c2622d" fill="none"/></svg>Position (Nudge):</span>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <!-- D-Pad (22×22px matching FPV) -->
          <div style="display: grid; grid-template-columns: repeat(3, 22px); grid-template-rows: repeat(3, 22px); gap: 2px; justify-content: center; width: 72px;">
            <div></div>
            <button id="nudge-n-btn" type="button" style="background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.2); color: #06b6d4; border-radius: 4px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 0.75rem; font-weight: bold; width: 22px; height: 22px; padding: 0;">▲</button>
            <div></div>
            <button id="nudge-w-btn" type="button" style="background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.2); color: #06b6d4; border-radius: 4px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 0.75rem; font-weight: bold; width: 22px; height: 22px; padding: 0;">◀</button>
            <div id="nudge-step-display" style="display: flex; align-items: center; justify-content: center; font-size: 0.6rem; color: var(--accent-cyan); font-weight: bold; user-select: none; cursor: pointer;" title="Click to cycle step distance">${initialStepLabel}</div>
            <button id="nudge-e-btn" type="button" style="background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.2); color: #06b6d4; border-radius: 4px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 0.75rem; font-weight: bold; width: 22px; height: 22px; padding: 0;">▶</button>
            <div></div>
            <button id="nudge-s-btn" type="button" style="background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.2); color: #06b6d4; border-radius: 4px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 0.75rem; font-weight: bold; width: 22px; height: 22px; padding: 0;">▼</button>
            <div></div>
          </div>

          <!-- Lat/Lon inputs -->
          <div style="display: flex; flex-direction: column; gap: 4px; flex: 1; margin-left: 8px;">
            <input type="text" id="edit-wp-lat" value="${wp.lat.toFixed(7)}" style="background: rgba(15,23,42,0.6); border: 1px solid var(--border-color); border-radius: 4px; padding: 2px 4px; color: #fff; font-size: 0.7rem; width: 100%; text-align: center;" placeholder="Latitude">
            <input type="text" id="edit-wp-lon" value="${wp.lon.toFixed(7)}" style="background: rgba(15,23,42,0.6); border: 1px solid var(--border-color); border-radius: 4px; padding: 2px 4px; color: #fff; font-size: 0.7rem; width: 100%; text-align: center;" placeholder="Longitude">
          </div>
        </div>
      </div>

      <!-- Action Buttons (matching FPV button style) -->
      <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 8px; font-size: 0.72rem; box-sizing: border-box; width: 100%;">
        <button id="save-wp-btn" class="btn-primary" type="button" style="flex: 1 1 calc(50% - 3px); min-width: 0; box-sizing: border-box; padding: 5px 4px; background: var(--primary-gradient); border-radius: 6px; font-weight: 600;">Save</button>
        <button id="reset-wp-btn" class="btn-secondary" type="button" style="flex: 1 1 calc(50% - 3px); min-width: 0; box-sizing: border-box; padding: 5px 4px; color: #eab308; border-color: rgba(234, 179, 8, 0.3); border-radius: 6px; font-weight: 600;">Revert</button>
        <button id="delete-wp-btn" class="btn-secondary" type="button" style="flex: 1 1 calc(50% - 3px); min-width: 0; box-sizing: border-box; padding: 5px 4px; border-color: rgba(239, 68, 68, 0.3); color: #ef4444; border-radius: 6px; font-weight: 600;">Delete</button>
        <button id="insert-wp-btn" class="btn-secondary" type="button" style="flex: 1 1 calc(50% - 3px); min-width: 0; box-sizing: border-box; padding: 5px 4px; color: #06b6d4; border-color: rgba(6, 182, 212, 0.3); border-radius: 6px; font-weight: 600;">Insert</button>
      </div>
    </div>
  `;

  if (typeof popupContent.querySelector !== 'function') {
    return popupContent;
  }

  const popupCollapseBtn = popupContent.querySelector('#wp-popup-collapse-btn');
  const popupBody = popupContent.querySelector('#edit-wp-body');
  if (popupCollapseBtn && popupBody) {
    popupCollapseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = popupBody.style.display === 'none';
      popupBody.style.display = isHidden ? 'flex' : 'none';
      popupCollapseBtn.textContent = isHidden ? '▼' : '▲';
    });
  }

  // Drag-to-move for the popup (v1.88.1)
  const dragHandle = popupContent.querySelector('#wp-popup-drag-handle');
  if (dragHandle) {
    if (typeof L !== 'undefined' && L && L.DomEvent) {
      if (L.DomEvent.disableClickPropagation) L.DomEvent.disableClickPropagation(dragHandle);
      if (L.DomEvent.disableScrollPropagation) L.DomEvent.disableScrollPropagation(dragHandle);
    }

    let isDragging = false;
    let startMouseX = 0, startMouseY = 0;
    let startPoint = null;
    let popupEl = null;

    const onPointerDown = (e) => {
      // Don't drag if clicking buttons or inputs inside header
      if (e.target.closest && (e.target.closest('#wp-popup-collapse-btn') || e.target.closest('button') || e.target.closest('input') || e.target.closest('select'))) {
        return;
      }
      popupEl = popupContent.closest('.leaflet-popup');
      if (!popupEl) return;

      e.preventDefault();
      e.stopPropagation();
      if (typeof L !== 'undefined' && L.DomEvent && L.DomEvent.stopPropagation) {
        L.DomEvent.stopPropagation(e);
      }

      isDragging = true;
      startMouseX = e.clientX;
      startMouseY = e.clientY;
      dragHandle.style.cursor = 'grabbing';

      // Disable Leaflet map dragging while dragging popup
      if (typeof map !== 'undefined' && map && map.dragging && typeof map.dragging.disable === 'function') {
        map.dragging.disable();
      }

      // Get initial position using Leaflet DomUtil
      startPoint = (typeof L !== 'undefined' && L.DomUtil && L.DomUtil.getPosition)
        ? L.DomUtil.getPosition(popupEl)
        : null;

      if (!startPoint) {
        const computed = window.getComputedStyle(popupEl);
        const transform = computed.transform || computed.webkitTransform;
        let x = 0, y = 0;
        if (transform && transform !== 'none') {
          const match = transform.match(/matrix\(([^)]+)\)/);
          if (match) {
            const parts = match[1].split(',').map(s => parseFloat(s.trim()));
            x = parts[4] || 0;
            y = parts[5] || 0;
          }
        }
        startPoint = { x, y };
      }

      try {
        if (dragHandle.setPointerCapture && e.pointerId) {
          dragHandle.setPointerCapture(e.pointerId);
        }
      } catch (_) {}

      window.addEventListener('pointermove', onPointerMove, { passive: false });
      window.addEventListener('pointerup', onPointerUp, { passive: false });
      window.addEventListener('pointercancel', onPointerUp, { passive: false });
    };

    const onPointerMove = (e) => {
      if (!isDragging || !popupEl || !startPoint) return;
      e.preventDefault();
      e.stopPropagation();

      const dx = e.clientX - startMouseX;
      const dy = e.clientY - startMouseY;
      const newX = startPoint.x + dx;
      const newY = startPoint.y + dy;

      if (typeof L !== 'undefined' && L.DomUtil && L.DomUtil.setPosition) {
        L.DomUtil.setPosition(popupEl, new L.Point(newX, newY));
      } else {
        popupEl.style.transform = `translate3d(${newX}px, ${newY}px, 0px)`;
      }
    };

    const onPointerUp = (e) => {
      if (!isDragging) return;
      isDragging = false;
      dragHandle.style.cursor = 'grab';

      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);

      try {
        if (e && e.pointerId && dragHandle.hasPointerCapture && dragHandle.hasPointerCapture(e.pointerId)) {
          dragHandle.releasePointerCapture(e.pointerId);
        }
      } catch (_) {}

      // Re-enable Leaflet map dragging
      if (typeof map !== 'undefined' && map && map.dragging && typeof map.dragging.enable === 'function') {
        map.dragging.enable();
      }

      // Update popup's latlng so map zoom/pan maintains dragged location
      if (typeof map !== 'undefined' && map && popupEl && typeof map.layerPointToLatLng === 'function') {
        try {
          const finalPos = (typeof L !== 'undefined' && L.DomUtil && L.DomUtil.getPosition) ? L.DomUtil.getPosition(popupEl) : null;
          if (finalPos) {
            const popupObj = popupMarker ? (popupMarker.getPopup ? popupMarker.getPopup() : null) : (marker && marker.getPopup ? marker.getPopup() : null);
            if (popupObj) {
              const offset = (typeof L !== 'undefined' && L.point) ? L.point(popupObj.options.offset || [0, 0]) : { x: 0, y: 0 };
              const anchor = (popupObj._getAnchor && typeof L !== 'undefined' && L.point) ? popupObj._getAnchor() : { x: 0, y: 0 };
              const adjustedX = finalPos.x - offset.x - anchor.x;
              const adjustedY = finalPos.y - offset.y - anchor.y;
              const newLatLng = map.layerPointToLatLng([adjustedX, adjustedY]);
              if (newLatLng && typeof popupObj.setLatLng === 'function') {
                popupObj.setLatLng(newLatLng);
              }
            }
          }
        } catch (_) {}
      }
    };

    dragHandle.addEventListener('pointerdown', onPointerDown);
  }

  // Bind events to the elements directly before they are inserted into the DOM
  const saveBtn = popupContent.querySelector('#save-wp-btn');
  const resetBtn = popupContent.querySelector('#reset-wp-btn');
  const deleteBtn = popupContent.querySelector('#delete-wp-btn');
  const insertBtn = popupContent.querySelector('#insert-wp-btn');

  const altSlider = popupContent.querySelector('#edit-wp-alt');
  const altValText = popupContent.querySelector('#edit-wp-alt-val');

  const pitchSlider = popupContent.querySelector('#edit-wp-pitch');
  const pitchValText = popupContent.querySelector('#edit-wp-pitch-val');

  const headingSlider = popupContent.querySelector('#edit-wp-heading');
  const headingValText = popupContent.querySelector('#edit-wp-heading-val');
  const headingModeSelect = popupContent.querySelector('#edit-wp-heading-mode');
  const poiSelect = popupContent.querySelector('#edit-wp-poi-select');

  const latInput = popupContent.querySelector('#edit-wp-lat');
  const lonInput = popupContent.querySelector('#edit-wp-lon');

  // Wire ? help button on Heading Mode
  const headingHelpBtn = popupContent.querySelector('#edit-wp-heading-help-btn');
  if (headingHelpBtn) {
    headingHelpBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof showHeadingHelpPopover === 'function') showHeadingHelpPopover(headingHelpBtn);
    });
  }

  // Wire Insert button — insert after current waypoint then close popup
  if (insertBtn) {
    insertBtn.addEventListener('click', () => {
      if (typeof fpvProgressIndex !== 'undefined') fpvProgressIndex = idx;
      if (typeof fpvInsertWaypoint === 'function') fpvInsertWaypoint();
      const popupObj = popupMarker ? (typeof popupMarker.getPopup === 'function' ? popupMarker.getPopup() : null) : (marker && typeof marker.getPopup === 'function' ? marker.getPopup() : null);
      if (popupObj) { if (popupObj.close) popupObj.close(); else if (marker && marker.closePopup) marker.closePopup(); }
      else if (marker && marker.closePopup) marker.closePopup();
    });
  }


  // Real-time map update helper
  const updateRealtimeMarker = () => {
    const mode = headingModeSelect.value;
    const tempPitch = parseFloat(pitchSlider.value);
    const tempAlt = parseFloat(altSlider.value);
    const rotationDeg = parseFloat(document.getElementById('grid-rotation').value) || 0;
    const autoHead = getDefaultHeading(idx, getCurrentWaypoints(), rotationDeg);

    // Apply temporary lat/lon position to marker representation on map
    const latVal = parseFloat(latInput.value);
    const lonVal = parseFloat(lonInput.value);

    let tempHeading = null;
    let effectiveMode = mode;
    if (mode === 'inherit') {
      const wpLayer = (wp.layerId && typeof flightLayers !== 'undefined') ? flightLayers.find(l => l.id === wp.layerId) : ((typeof getActiveLayer === 'function') ? getActiveLayer() : null);
      effectiveMode = getEffectiveLayerHeadingMode(wpLayer);
    }

    if (effectiveMode === 'custom') {
      if (mode === 'custom') {
        tempHeading = parseFloat(headingSlider.value);
      } else {
        const wpLayer = (wp.layerId && typeof flightLayers !== 'undefined') ? flightLayers.find(l => l.id === wp.layerId) : ((typeof getActiveLayer === 'function') ? getActiveLayer() : null);
        tempHeading = (wp.heading !== null && wp.heading !== undefined) ? wp.heading : getEffectiveLayerCustomHeading(wpLayer);
      }
    } else if (effectiveMode === 'followWayline') {
      tempHeading = autoHead;
    } else if (effectiveMode === 'fixed') {
      tempHeading = 0;
    } else if (effectiveMode === 'towardPOI') {
      let targetPoi = null;
      if (poiSelect && poiSelect.value === 'inherit') {
        const wpLayer = (wp.layerId && typeof flightLayers !== 'undefined') ? flightLayers.find(l => l.id === wp.layerId) : null;
        const tempWp = { ...wp, targetPoiId: 'inherit', lat: (isNaN(latVal) ? wp.lat : latVal), lon: (isNaN(lonVal) ? wp.lon : lonVal) };
        targetPoi = getTargetPoiCoordinates(tempWp, wpLayer);
      } else {
        const selectedPoiIndex = poiSelect ? parseInt(poiSelect.value) : (wp.poiIndex || 0);
        targetPoi = (Array.isArray(pois) && pois[selectedPoiIndex]) ? pois[selectedPoiIndex] : null;
      }
      if (targetPoi) {
        const centerLat = (isNaN(latVal) ? wp.lat : latVal);
        const latRad = centerLat * Math.PI / 180;
        const dy = (targetPoi.lat - centerLat) * 111139;
        const dx = (targetPoi.lon - (isNaN(lonVal) ? wp.lon : lonVal)) * 111139 * Math.cos(latRad);
        tempHeading = (90 - (Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360;
      } else {
        tempHeading = 0;
      }
    }
    
    // Temporarily update wp properties for real-time calculation
    wp.alt = tempAlt;
    wp.pitch = tempPitch;
    wp.heading = (mode === 'custom') ? tempHeading : null;
    wp.headingMode = mode;
    if (poiSelect && poiSelect.value === 'inherit') {
      wp.targetPoiId = 'inherit';
    } else {
      wp.poiIndex = poiSelect ? parseInt(poiSelect.value) : (wp.poiIndex || 0);
      if (pois && pois[wp.poiIndex] && pois[wp.poiIndex].id) {
        wp.targetPoiId = pois[wp.poiIndex].id;
      }
    }

    if (!isNaN(latVal) && !isNaN(lonVal)) {
      marker.setLatLng([latVal, lonVal]);
      
      // Update global wp temporary values for real-time path updates
      const wpLayer = (wp.layerId && typeof flightLayers !== 'undefined') ? flightLayers.find(l => l.id === wp.layerId) : null;
      const centerLat = (wpLayer && wpLayer.centerLat !== null && wpLayer.centerLat !== undefined) ? wpLayer.centerLat : (centerMarker ? centerMarker.getLatLng().lat : (pois[0] ? pois[0].lat : latVal));
      const centerLon = (wpLayer && wpLayer.centerLon !== null && wpLayer.centerLon !== undefined) ? wpLayer.centerLon : (centerMarker ? centerMarker.getLatLng().lng : (pois[0] ? pois[0].lon : lonVal));
      const offsets = geodeticToLocal(latVal, lonVal, centerLat, centerLon);
      if (wp.origLat === undefined || wp.origLat === null) {
        wp.origLat = wp.lat;
        wp.origLon = wp.lon;
        wp.origX = wp.x;
        wp.origY = wp.y;
      }
      wp.lat = latVal;
      wp.lon = lonVal;
      wp.x = offsets.x;
      wp.y = offsets.y;
      
      if (Math.abs(latVal - wp.origLat) > 1e-9 || Math.abs(lonVal - wp.origLon) > 1e-9) {
        wp.isModified = true;
      }

      if (saveBtn) saveBtn.style.display = 'inline-block';
      if (resetBtn) resetBtn.style.display = 'inline-block';
      
      const gridType = document.getElementById('grid-type')?.value;
      if (hasPhoto && gridType !== 'road-following') {
        activePhotos[idx].lat = latVal;
        activePhotos[idx].lon = lonVal;
        activePhotos[idx].x = offsets.x;
        activePhotos[idx].y = offsets.y;
      }
      
      if (gridType === 'road-following') {
        if (!wp.roadMarker && roadWaypoints && roadWaypoints[idx]) {
          const prevLat = (wp._lastLat !== undefined) ? wp._lastLat : originalLat;
          const prevLon = (wp._lastLon !== undefined) ? wp._lastLon : originalLon;
          const dLat = latVal - prevLat;
          const dLon = lonVal - prevLon;
          wp._lastLat = latVal;
          wp._lastLon = lonVal;

          roadWaypoints[idx].lat += dLat;
          roadWaypoints[idx].lon += dLon;
          const rOffsets = geodeticToLocal(roadWaypoints[idx].lat, roadWaypoints[idx].lon, centerLatLng.lat, centerLatLng.lng);
          roadWaypoints[idx].x = rOffsets.x;
          roadWaypoints[idx].y = rOffsets.y;
          roadWaypoints[idx].isModified = true;

          if (roadWaypoints[idx].roadMarker) {
            roadWaypoints[idx].roadMarker.setLatLng([roadWaypoints[idx].lat, roadWaypoints[idx].lon]);
          }
        }

        recalculateRoadOffsetPath(centerLatLng.lat, centerLatLng.lng);

        // Update all drone markers positions and tooltips
        const defaultGimbalPitch = parseGimbalPitch(document.getElementById('gimbal-pitch')?.value, -60);
        generatedWaypoints.forEach((gwp) => {
          if (gwp.mapMarker) {
            gwp.mapMarker.setLatLng([gwp.lat, gwp.lon]);
            const gPitch = (gwp.pitch !== undefined && gwp.pitch !== null && !isNaN(gwp.pitch)) ? gwp.pitch : defaultGimbalPitch;
            const displayGPitch = (typeof gPitch === 'number' && !isNaN(gPitch)) ? Math.round(gPitch) : gPitch;
            const headingDisplay = (gwp.heading !== null && gwp.heading !== undefined && !isNaN(gwp.heading)) ? gwp.heading.toFixed(0) : '—';
            const tooltipContent = `Drone Waypoint ${gwp.idx}<br>Height: ${formatDistance(gwp.alt, 0)}<br>Yaw: ${headingDisplay}°<br>Pitch: ${displayGPitch}°`;
            gwp.mapMarker.setTooltipContent(tooltipContent);
          }
        });

        // Update road path connection line in real-time
        if (roadPathGroup) {
          roadPathGroup.eachLayer(layer => {
            if (layer instanceof L.Polyline && !(layer instanceof L.Polygon)) {
              layer.setLatLngs(roadWaypoints.map(w => [w.lat, w.lon]));
            }
          });
        }
      }
      
      // Update path polyline in real-time
      const speed = parseFloat(document.getElementById('speed').value);
      const captureMode = document.getElementById('capture-mode').value;
      updatePathLinesAndStats(getCurrentWaypoints(), getCurrentPhotos(), centerLatLng.lat, centerLatLng.lng, parseFloat(document.getElementById('grid-width').value), parseFloat(document.getElementById('grid-height').value), rotationDeg);
    }

    const gridType = document.getElementById('grid-type')?.value;
    if (gridType !== 'road-following') {
      // Generate and set temporary pink marker icon
      const newIcon = getMarkerIcon(wp, idx, getCurrentWaypoints(), rotationDeg, tempHeading, tempPitch, true);
      marker.setIcon(newIcon);
      
      // Update tooltip for standard waypoints
      const isStart = idx === 0;
      const isEnd = idx === getCurrentWaypoints().length - 1;
      const yawDisplay = (tempHeading !== null && !isNaN(tempHeading)) ? tempHeading.toFixed(0) : '—';
      const displayTempPitch = (typeof tempPitch === 'number' && !isNaN(tempPitch)) ? Math.round(tempPitch) : tempPitch;
      const newTitle = `${isStart ? "Start Point" : (isEnd ? "End Point" : `Waypoint ${idx}`)}<br>Height: ${formatDistance(tempAlt, 0)}<br>Yaw: ${yawDisplay}°<br>Pitch: ${displayTempPitch}°`;
      if (marker.getTooltip()) marker.getTooltip().setContent(newTitle);
    } else {
      // Keep simple tooltip for road nodes
      if (marker.getTooltip()) marker.getTooltip().setContent(`Road Node ${idx}`);
    }

    // Dynamic visibility update for Reset button
    const currentLat = parseFloat(latInput.value);
    const currentLon = parseFloat(lonInput.value);
    const currentAlt = parseFloat(altSlider.value);
    const currentPitch = parseFloat(pitchSlider.value);
    const currentSpeed = speedSlider ? parseFloat(speedSlider.value) : (wp.speed || null);
    const currentHover = hoverSlider ? parseInt(hoverSlider.value) : (wp.hoverTime || 0);
    const currentTurnMode = turnModeSelect ? turnModeSelect.value : (wp.turnMode || 'inherit');
    const currentCameraAction = cameraActionSelect ? cameraActionSelect.value : (wp.cameraAction || 'inherit');
    const currentZoom = zoomSlider ? parseFloat(zoomSlider.value) : (wp.zoom || 1.0);

    const baseLat = (wp.origLat !== undefined && wp.origLat !== null) ? wp.origLat : originalLat;
    const baseLon = (wp.origLon !== undefined && wp.origLon !== null) ? wp.origLon : originalLon;
    const baseAlt = (wp.origAlt !== undefined && wp.origAlt !== null) ? wp.origAlt : originalAlt;
    const basePitch = (wp.origPitch !== undefined && wp.origPitch !== null) ? wp.origPitch : originalPitch;
    const baseHeading = (wp.origHeading !== undefined) ? wp.origHeading : originalHeading;
    const baseHeadingMode = wp.origHeadingMode || originalHeadingMode || 'inherit';
    const basePoiIndex = (wp.origPoiIndex !== undefined && wp.origPoiIndex !== null) ? wp.origPoiIndex : originalPoiIndex;
    const baseSpeed = (wp.origSpeed !== undefined && wp.origSpeed !== null) ? wp.origSpeed : originalSpeed;
    const baseHover = (wp.origHoverTime !== undefined && wp.origHoverTime !== null) ? wp.origHoverTime : originalHoverTime;
    const baseTurnMode = wp.origTurnMode || originalTurnMode || 'inherit';
    const baseCameraAction = wp.origCameraAction || originalCameraAction || 'inherit';
    const baseZoom = (wp.origZoom !== undefined && wp.origZoom !== null) ? wp.origZoom : originalZoom;

    const isChangedFromOrig = (
      Math.abs(currentLat - baseLat) > 1e-9 ||
      Math.abs(currentLon - baseLon) > 1e-9 ||
      Math.abs(currentAlt - baseAlt) > 1e-3 ||
      currentPitch !== basePitch ||
      (currentSpeed !== null && currentSpeed !== baseSpeed) ||
      (currentHover !== baseHover) ||
      currentTurnMode !== baseTurnMode ||
      currentCameraAction !== baseCameraAction ||
      currentZoom !== baseZoom ||
      baseHeadingMode !== mode ||
      basePoiIndex !== (wp.poiIndex || 0) ||
      (mode === 'custom' && baseHeading !== null && tempHeading !== baseHeading) ||
      !!wp.isModified
    );

    if (resetBtn) {
      resetBtn.style.display = isChangedFromOrig ? 'inline-block' : 'none';
    }
    if (saveBtn) {
      saveBtn.style.display = isChangedFromOrig ? 'inline-block' : 'none';
    }

    if (typeof fpvActive !== 'undefined' && fpvActive && typeof updateFPVCamera === 'function') {
      updateFPVCamera(0);
    }
  };
  const throttledUpdateRealtimeMarker = throttle(updateRealtimeMarker, 32);

  const updateWarningVisibility = () => {
    const warningDiv = popupContent.querySelector('#edit-wp-hover-warning');
    if (!warningDiv) return;
    
    const currentHoverVal = hoverSlider ? parseInt(hoverSlider.value) : 0;
    const effCapture = (wp.captureMode && wp.captureMode !== 'inherit') ? wp.captureMode : (wp.layerCaptureMode && wp.layerCaptureMode !== 'inherit') ? wp.layerCaptureMode : document.getElementById('capture-mode')?.value;
    const isStopAndShoot = effCapture === 'stopAndShoot';
    
    const tempWp = {
      ...wp,
      alt: parseFloat(altSlider.value),
      pitch: parseFloat(pitchSlider.value),
      headingMode: headingModeSelect.value,
      heading: headingModeSelect.value === 'custom' ? parseFloat(headingSlider.value) : (wp.heading !== undefined ? wp.heading : null),
      poiIndex: poiSelect ? parseInt(poiSelect.value) : (wp.poiIndex || 0),
    };
    
    const curWps = getCurrentWaypoints();
    if (!curWps) return;
    const waypointsCopy = curWps.map((w, i) => i === idx ? tempWp : w);
    const reposInfo = checkNeedsReposition(idx, waypointsCopy);
    
    const autoSettling = wp.autoSettlingEnabled !== false;
    const baseSettling = wp.baseSettlingTime !== undefined ? wp.baseSettlingTime : 2.0;
    const majorTurnSettling = wp.majorTurnSettlingTime !== undefined ? wp.majorTurnSettlingTime : 5.0;
    const modTurnSettling = wp.moderateTurnSettlingTime !== undefined ? wp.moderateTurnSettlingTime : 4.0;
    const pitchSettling = wp.pitchSettlingTime !== undefined ? wp.pitchSettlingTime : 3.0;

    let requiredDelay = 0;
    if (isStopAndShoot && autoSettling) {
      if (idx > 0) {
        if (reposInfo.headingDiff >= 60) requiredDelay = majorTurnSettling;
        else if (reposInfo.headingDiff >= 25) requiredDelay = modTurnSettling;
        else if (reposInfo.isGimbalChanged) requiredDelay = pitchSettling;
        else if (reposInfo.needsReposition) requiredDelay = baseSettling;
      } else if (reposInfo.needsReposition) {
        requiredDelay = baseSettling;
      }
    }

    if (requiredDelay > 0 && currentHoverVal < requiredDelay) {
      warningDiv.textContent = `⚠️ Turn/pitch settling: ${requiredDelay.toFixed(1)}s auto-pause will be applied in KML export.`;
      warningDiv.style.display = 'block';
    } else {
      warningDiv.style.display = 'none';
    }
  };

  // Add event listeners to sliders
  altSlider.addEventListener('input', () => {
    const val = parseFloat(altSlider.value);
    altValText.textContent = unit === 'imperial' ? Math.round(val * M_TO_FT) : val.toFixed(0);
    updateWarningVisibility();
    throttledUpdateRealtimeMarker();
  });

  pitchSlider.addEventListener('input', () => {
    isAutoPitch = false;
    pitchValText.textContent = `${pitchSlider.value}°`;
    const autoBtn = popupContent.querySelector('#edit-wp-pitch-auto-btn');
    if (autoBtn) {
      autoBtn.style.background = 'rgba(255,255,255,0.06)';
      autoBtn.style.borderColor = 'rgba(255,255,255,0.1)';
      autoBtn.style.color = 'var(--text-muted)';
    }
    updateWarningVisibility();
    throttledUpdateRealtimeMarker();
  });

  const autoPitchBtn = popupContent.querySelector('#edit-wp-pitch-auto-btn');
  if (autoPitchBtn) {
    autoPitchBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      isAutoPitch = !isAutoPitch;
      if (isAutoPitch) {
        pitchSlider.value = autoPitchVal;
        pitchValText.textContent = `Auto 🎯 (${autoPitchVal}°)`;
        autoPitchBtn.style.background = 'rgba(6, 182, 212, 0.2)';
        autoPitchBtn.style.borderColor = 'rgba(6, 182, 212, 0.4)';
        autoPitchBtn.style.color = 'var(--accent-cyan)';
      } else {
        pitchValText.textContent = `${pitchSlider.value}°`;
        autoPitchBtn.style.background = 'rgba(255,255,255,0.06)';
        autoPitchBtn.style.borderColor = 'rgba(255,255,255,0.1)';
        autoPitchBtn.style.color = 'var(--text-muted)';
      }
      updateWarningVisibility();
      throttledUpdateRealtimeMarker();
    });
  }

  const speedSlider = popupContent.querySelector('#edit-wp-speed');
  const speedValText = popupContent.querySelector('#edit-wp-speed-val');
  if (speedSlider && speedValText) {
    speedSlider.addEventListener('input', () => {
      const val = parseFloat(speedSlider.value);
      speedValText.textContent = `${val} m/s`;
      throttledUpdateRealtimeMarker();
    });
  }

  const hoverSlider = popupContent.querySelector('#edit-wp-hover');
  const hoverValText = popupContent.querySelector('#edit-wp-hover-val');
  if (hoverSlider && hoverValText) {
    hoverSlider.addEventListener('input', () => {
      const val = parseInt(hoverSlider.value);
      hoverValText.textContent = `${val}`;
      updateWarningVisibility();
      throttledUpdateRealtimeMarker();
    });
  }

  const turnModeSelect = popupContent.querySelector('#edit-wp-turn-mode');
  if (turnModeSelect) {
    turnModeSelect.addEventListener('change', () => {
      throttledUpdateRealtimeMarker();
    });
  }

  const cameraActionSelect = popupContent.querySelector('#edit-wp-camera-action');
  const zoomContainer = popupContent.querySelector('#edit-wp-zoom-container');
  const zoomSlider = popupContent.querySelector('#edit-wp-zoom');
  const zoomValText = popupContent.querySelector('#edit-wp-zoom-val');

  if (cameraActionSelect) {
    cameraActionSelect.addEventListener('change', () => {
      if (zoomContainer) {
        zoomContainer.style.display = (cameraActionSelect.value === 'zoom') ? 'flex' : 'none';
      }
      throttledUpdateRealtimeMarker();
    });
  }

  if (zoomSlider && zoomValText) {
    zoomSlider.addEventListener('input', () => {
      zoomValText.textContent = parseFloat(zoomSlider.value).toFixed(1);
      throttledUpdateRealtimeMarker();
    });
  }

  headingSlider.addEventListener('input', () => {
    headingValText.textContent = headingSlider.value + '°';
    updateWarningVisibility();
    throttledUpdateRealtimeMarker();
  });

  headingModeSelect.addEventListener('change', () => {
    if (headingModeSelect.value === 'custom') {
      headingSlider.style.display = 'block';
      headingValText.textContent = headingSlider.value + '°';
    } else {
      headingSlider.style.display = 'none';
    }
    if (poiSelect) {
      const mode = headingModeSelect.value;
      const wpLayer = (wp.layerId && typeof flightLayers !== 'undefined') ? flightLayers.find(l => l.id === wp.layerId) : ((typeof getActiveLayer === 'function') ? getActiveLayer() : null);
      const effectiveMode = (mode === 'inherit') ? getEffectiveLayerHeadingMode(wpLayer) : mode;
      const isPoi = (effectiveMode === 'towardPOI');
      poiSelect.style.display = isPoi ? 'block' : 'none';
    }
    updateWarningVisibility();
    updateRealtimeMarker();
  });

  if (poiSelect) {
    poiSelect.addEventListener('change', () => {
      updateWarningVisibility();
      updateRealtimeMarker();
    });
  }

  // Set initial warning visibility
  setTimeout(updateWarningVisibility, 0);

  // Direct coordinate inputs listeners
  latInput.addEventListener('input', throttledUpdateRealtimeMarker);
  lonInput.addEventListener('input', throttledUpdateRealtimeMarker);

  // D-Pad Nudge functionality
  const steps = unit === 'imperial'
    ? [0.3048, 1.524, 6.096] // 1ft, 5ft, 20ft in meters
    : [0.2, 1.0, 5.0];      // 0.2m, 1m, 5m in meters
  const stepLabels = unit === 'imperial'
    ? ['1 ft', '5 ft', '20 ft']
    : ['0.2m', '1m', '5m'];
  let currentStepIndex = 1; // Default to middle index (5ft or 1m)
  const R_EARTH = 6378137.0;

  const stepDisplay = popupContent.querySelector('#nudge-step-display');
  stepDisplay.addEventListener('click', () => {
    currentStepIndex = (currentStepIndex + 1) % steps.length;
    stepDisplay.textContent = stepLabels[currentStepIndex];
  });

  const nudge = (dLatDir, dLonDir) => {
    const latVal = parseFloat(latInput.value);
    const lonVal = parseFloat(lonInput.value);
    if (isNaN(latVal) || isNaN(lonVal)) return;

    const dist = steps[currentStepIndex];
    const dLatMeters = dLatDir * dist;
    const dLonMeters = dLonDir * dist;

    const latRad = latVal * Math.PI / 180.0;
    const deltaLat = (dLatMeters / R_EARTH) * (180.0 / Math.PI);
    const deltaLon = (dLonMeters / (R_EARTH * Math.cos(latRad))) * (180.0 / Math.PI);

    latInput.value = (latVal + deltaLat).toFixed(7);
    lonInput.value = (lonVal + deltaLon).toFixed(7);

    updateRealtimeMarker();
  };

  popupContent.querySelector('#nudge-n-btn').addEventListener('click', () => nudge(1, 0));
  popupContent.querySelector('#nudge-s-btn').addEventListener('click', () => nudge(-1, 0));
  popupContent.querySelector('#nudge-e-btn').addEventListener('click', () => nudge(0, 1));
  popupContent.querySelector('#nudge-w-btn').addEventListener('click', () => nudge(0, -1));

  // Revert listener if popup is closed without clicking save
  let isSaved = false;
  let isReverted = false;
  
  const revertChanges = () => {
    if (isSaved || isReverted) return;
    
    // Restore original values in the state
    wp.lat = originalLat;
    wp.lon = originalLon;
    wp.x = originalX;
    wp.y = originalY;
    wp.alt = originalAlt;
    wp.pitch = originalPitch;
    wp.heading = originalHeading;
    wp.headingMode = originalHeadingMode;
    wp.poiIndex = originalPoiIndex;
    wp.speed = originalSpeed;
    wp.hoverTime = originalHoverTime;
    wp.turnMode = originalTurnMode;
    wp.cameraAction = originalCameraAction;
    wp.zoom = originalZoom;
    wp.isRingStart = originalIsRingStart;
    wp.isModified = originalIsModified;
    wp.origIsRingStart = originalOrigIsRingStart;
    wp.origIsModified = originalOrigIsModified;

    if (hasPhoto) {
      activePhotos[idx].lat = originalPhotoLat;
      activePhotos[idx].lon = originalPhotoLon;
      activePhotos[idx].x = originalPhotoX;
      activePhotos[idx].y = originalPhotoY;
    }

    // Revert marker position, icon and tooltip
    marker.setLatLng([originalLat, originalLon]);
    const gridType = document.getElementById('grid-type')?.value;
    if (gridType !== 'road-following') {
      const originalIcon = getMarkerIcon(wp, idx, getCurrentWaypoints(), parseFloat(document.getElementById('grid-rotation').value));
      marker.setIcon(originalIcon);
    }

    const rotationDeg = parseFloat(document.getElementById('grid-rotation').value);
    const gridType2 = document.getElementById('grid-type')?.value;
    delete wp._lastLat;
    delete wp._lastLon;

    if (gridType2 === 'road-following') {
      if (roadWaypoints && roadWaypoints[idx] && originalRoadLat !== null) {
        roadWaypoints[idx].lat = originalRoadLat;
        roadWaypoints[idx].lon = originalRoadLon;
        roadWaypoints[idx].x = originalRoadX;
        roadWaypoints[idx].y = originalRoadY;
        roadWaypoints[idx].alt = originalAlt;
        roadWaypoints[idx].pitch = originalPitch;
        roadWaypoints[idx].heading = originalHeading;
        roadWaypoints[idx].headingMode = originalHeadingMode;
        roadWaypoints[idx].poiIndex = originalPoiIndex;
        roadWaypoints[idx].speed = originalSpeed;
        roadWaypoints[idx].hoverTime = originalHoverTime;
        roadWaypoints[idx].turnMode = originalTurnMode;
        roadWaypoints[idx].cameraAction = originalCameraAction;
        roadWaypoints[idx].zoom = originalZoom;
        roadWaypoints[idx].isModified = originalIsModified;
      }

      if (wp.roadMarker) {
        if (marker.getTooltip()) marker.getTooltip().setContent(`Road Node ${idx}`);
      } else {
        const defaultGimbalPitch = parseGimbalPitch(document.getElementById('gimbal-pitch')?.value, -60);
        const pitch = (wp.pitch !== undefined && wp.pitch !== null && !isNaN(wp.pitch)) ? wp.pitch : defaultGimbalPitch;
        const displayPitch = (typeof pitch === 'number' && !isNaN(pitch)) ? Math.round(pitch) : pitch;
        const headingDisplay = (wp.heading !== null && wp.heading !== undefined) ? wp.heading.toFixed(0) : '—';
        const tooltipContent = `Drone Waypoint ${idx}<br>Height: ${formatDistance(wp.alt, 0)}<br>Yaw: ${headingDisplay}°<br>Pitch: ${displayPitch}°`;
        if (marker.getTooltip()) marker.getTooltip().setContent(tooltipContent);
      }
      redrawCurrentMission();
    } else {
      const isStart = idx === 0;
      const isEnd = idx === getCurrentWaypoints().length - 1;
      let heading = 0;
      if (wp.heading !== null && wp.heading !== undefined) {
        heading = wp.heading;
      } else {
        heading = getDefaultHeading(idx, getCurrentWaypoints(), rotationDeg);
      }
      const defaultGimbalPitch = parseGimbalPitch(document.getElementById('gimbal-pitch')?.value, -60);
      const pitch = (wp.pitch !== undefined && wp.pitch !== null && !isNaN(wp.pitch)) ? wp.pitch : defaultGimbalPitch;
      const displayPitch = (typeof pitch === 'number' && !isNaN(pitch)) ? Math.round(pitch) : pitch;
      const originalTitle = `${isStart ? "Start Point" : (isEnd ? "End Point" : `Waypoint ${idx}`)}<br>Height: ${formatDistance(wp.alt, 0)}<br>Yaw: ${heading.toFixed(0)}°<br>Pitch: ${displayPitch}°`;
      if (marker.getTooltip()) marker.getTooltip().setContent(originalTitle);

      // Redraw lines and stats
      const wpLayer = (wp.layerId && typeof flightLayers !== 'undefined') ? flightLayers.find(l => l.id === wp.layerId) : null;
      const centerLat = (wpLayer && wpLayer.centerLat !== null && wpLayer.centerLat !== undefined) ? wpLayer.centerLat : (centerMarker ? centerMarker.getLatLng().lat : 0);
      const centerLon = (wpLayer && wpLayer.centerLon !== null && wpLayer.centerLon !== undefined) ? wpLayer.centerLon : (centerMarker ? centerMarker.getLatLng().lng : 0);
      updatePathLinesAndStats(getCurrentWaypoints(), getCurrentPhotos(), centerLat, centerLon, parseFloat(document.getElementById('grid-width').value), parseFloat(document.getElementById('grid-height').value), rotationDeg);
    }
  };

  const popupObj = popupMarker ? (typeof popupMarker.getPopup === 'function' ? popupMarker.getPopup() : null) : (marker && typeof marker.getPopup === 'function' ? marker.getPopup() : null);

  // Clear only previously accumulated revertChanges listener on this marker/popup.
  // Never call marker.off('popupclose') or popupObj.off('remove') without the specific listener,
  // as doing so strips Leaflet's internal removal/cleanup handlers, orphaning zoom listeners.
  if (marker && marker._revertHandler) {
    if (typeof marker.off === 'function') marker.off('popupclose', marker._revertHandler);
    if (popupObj && typeof popupObj.off === 'function') popupObj.off('remove', marker._revertHandler);
    marker._revertHandler = null;
  }

  const unbindRevert = () => {
    isSaved = true; // Prevent revert from firing
    if (popupObj && typeof popupObj.off === 'function') popupObj.off('remove', revertChanges);
    if (marker && typeof marker.off === 'function') marker.off('popupclose', revertChanges);
    if (marker) marker._revertHandler = null;
  };
  if (marker) marker._revertHandler = revertChanges;
  if (popupObj && typeof popupObj.on === 'function') popupObj.on('remove', revertChanges);
  if (marker && typeof marker.on === 'function') marker.on('popupclose', revertChanges);

  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      unbindRevert();
      
      const altVal = parseFloat(altSlider.value);
      const pitchVal = parseFloat(pitchSlider.value);
      const mode = headingModeSelect.value;
      const headingVal = (mode === 'custom') ? parseFloat(headingSlider.value) : null;
      const isPoiInherit = (poiSelect && poiSelect.value === 'inherit');
      const poiIndexVal = isPoiInherit ? 0 : (poiSelect ? parseInt(poiSelect.value) : 0);
      const latVal = parseFloat(latInput.value);
      const lonVal = parseFloat(lonInput.value);

      const speedVal = speedSlider ? parseFloat(speedSlider.value) : NaN;
      const hoverVal = hoverSlider ? parseInt(hoverSlider.value) : NaN;
      const turnModeVal = turnModeSelect ? turnModeSelect.value : null;
      const cameraActionVal = cameraActionSelect ? cameraActionSelect.value : null;
      const zoomVal = zoomSlider ? parseFloat(zoomSlider.value) : NaN;

      // Save custom edits and mark as modified (preserving orig baseline for Reset)
      if (!isNaN(latVal) && !isNaN(lonVal)) {
        if (centerMarker && (wp.origLat === undefined || wp.origLat === null)) {
          const centerLatLng = centerMarker.getLatLng();
          const gridWidth = parseFloat(document.getElementById('grid-width')?.value || 100);
          const gridHeight = parseFloat(document.getElementById('grid-height')?.value || 100);
          const rotationDeg = parseFloat(document.getElementById('grid-rotation')?.value || 0);
          const gridType = document.getElementById('grid-type')?.value || 'single';
          const captureMode = document.getElementById('capture-mode')?.value || 'hover';
          const altitude = parseFloat(document.getElementById('altitude')?.value || 50);
          const overlapFront = parseFloat(document.getElementById('overlap-front')?.value || 70);
          const overlapSide = parseFloat(document.getElementById('overlap-side')?.value || 70);
          const spacings = getSpacings(overlapFront, overlapSide, altitude);
          const gridData = generateGridCoordinates(gridWidth, gridHeight, rotationDeg, gridType, captureMode, spacings.sLine, spacings.sPhoto);
          if (gridData && gridData.waypoints && gridData.waypoints[idx]) {
            const pt = gridData.waypoints[idx];
            const geo = localToGeodetic(pt.x, pt.y, centerLatLng.lat, centerLatLng.lng, rotationDeg);
            wp.origLat = geo.lat;
            wp.origLon = geo.lon;
            wp.origX = pt.x;
            wp.origY = pt.y;
          }
        }

        wp.lat = latVal;
        wp.lon = lonVal;
        const wpLayer = (wp.layerId && typeof flightLayers !== 'undefined') ? flightLayers.find(l => l.id === wp.layerId) : null;
        const centerLat = (wpLayer && wpLayer.centerLat !== null && wpLayer.centerLat !== undefined) ? wpLayer.centerLat : (centerMarker ? centerMarker.getLatLng().lat : (pois[0] ? pois[0].lat : latVal));
        const centerLon = (wpLayer && wpLayer.centerLon !== null && wpLayer.centerLon !== undefined) ? wpLayer.centerLon : (centerMarker ? centerMarker.getLatLng().lng : (pois[0] ? pois[0].lon : lonVal));
        const offsets = geodeticToLocal(latVal, lonVal, centerLat, centerLon);
        wp.x = offsets.x;
        wp.y = offsets.y;
      }
      wp.alt = altVal;
      wp.pitch = isAutoPitch ? 'auto' : pitchVal;
      wp.heading = headingVal;
      wp.headingMode = mode;
      if (isPoiInherit) {
        wp.targetPoiId = 'inherit';
      } else {
        wp.poiIndex = poiIndexVal;
        if (pois && pois[poiIndexVal] && pois[poiIndexVal].id) {
          wp.targetPoiId = pois[poiIndexVal].id;
        }
      }
      if (!isNaN(speedVal)) wp.speed = speedVal;
      if (!isNaN(hoverVal)) wp.hoverTime = hoverVal;
      if (turnModeVal) wp.turnMode = turnModeVal;
      if (cameraActionVal) wp.cameraAction = cameraActionVal;
      if (!isNaN(zoomVal)) wp.zoom = zoomVal;
      wp.isRingStart = true; // Mark as explicit parameter change point
      wp.isModified = true; // Mark as edited

      const gridType = document.getElementById('grid-type')?.value;
      if (gridType === 'road-following' && wp.roadMarker && roadWaypoints && roadWaypoints[idx]) {
        const rWp = roadWaypoints[idx];
        if (!isNaN(latVal) && !isNaN(lonVal)) {
          if (rWp.origLat === undefined || rWp.origLat === null) rWp.origLat = (originalRoadLat !== null ? originalRoadLat : rWp.lat);
          if (rWp.origLon === undefined || rWp.origLon === null) rWp.origLon = (originalRoadLon !== null ? originalRoadLon : rWp.lon);
          if (rWp.origX === undefined || rWp.origX === null) rWp.origX = (originalRoadX !== null ? originalRoadX : rWp.x);
          if (rWp.origY === undefined || rWp.origY === null) rWp.origY = (originalRoadY !== null ? originalRoadY : rWp.y);

          rWp.lat = latVal;
          rWp.lon = lonVal;
          const centerLat = centerMarker ? centerMarker.getLatLng().lat : (pois[0] ? pois[0].lat : latVal);
          const centerLon = centerMarker ? centerMarker.getLatLng().lng : (pois[0] ? pois[0].lon : lonVal);
          const offsets = geodeticToLocal(latVal, lonVal, centerLat, centerLon);
          rWp.x = offsets.x;
          rWp.y = offsets.y;
        }
        rWp.alt = altVal;
        rWp.pitch = isAutoPitch ? 'auto' : pitchVal;
        rWp.heading = headingVal;
        rWp.headingMode = mode;
        if (isPoiInherit) {
          rWp.targetPoiId = 'inherit';
        } else {
          rWp.poiIndex = poiIndexVal;
          if (pois && pois[poiIndexVal] && pois[poiIndexVal].id) {
            rWp.targetPoiId = pois[poiIndexVal].id;
          }
        }
        if (!isNaN(speedVal)) rWp.speed = speedVal;
        if (!isNaN(hoverVal)) rWp.hoverTime = hoverVal;
        if (turnModeVal) rWp.turnMode = turnModeVal;
        if (cameraActionVal) rWp.cameraAction = cameraActionVal;
        if (!isNaN(zoomVal)) rWp.zoom = zoomVal;
        rWp.isModified = true;
      }

      if (popupObj) popupObj.close ? popupObj.close() : (marker && marker.closePopup());
      redrawCurrentMission();
      recreate3DWaypointsAndPaths();
      if (fpvActive) {
        updateFPVEditorUI();
        updateFPVCamera(0);
      }
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      isSaved = true;
      isReverted = true;
      unbindRevert();
      
      const defaultAlt = parseFloat(document.getElementById('altitude')?.value || 50);
      const defaultPitch = parseGimbalPitch(document.getElementById('gimbal-pitch')?.value, -45);

      wp.lat = (wp.origLat !== undefined && wp.origLat !== null) ? wp.origLat : (wp._baseLat !== undefined ? wp._baseLat : wp.lat);
      wp.lon = (wp.origLon !== undefined && wp.origLon !== null) ? wp.origLon : (wp._baseLon !== undefined ? wp._baseLon : wp.lon);
      
      const centerLatLng = centerMarker ? centerMarker.getLatLng() : { lat: centerLat, lng: centerLon };
      const offsets = geodeticToLocal(wp.lat, wp.lon, centerLatLng.lat, centerLatLng.lng);
      wp.x = (wp.origX !== undefined && wp.origX !== null) ? wp.origX : offsets.x;
      wp.y = (wp.origY !== undefined && wp.origY !== null) ? wp.origY : offsets.y;
      
      wp.alt = (wp.origAlt !== undefined && wp.origAlt !== null) ? wp.origAlt : defaultAlt;
      wp.pitch = (wp.origPitch !== undefined && wp.origPitch !== null) ? wp.origPitch : defaultPitch;
      wp.heading = (wp.origHeading !== undefined) ? wp.origHeading : null;
      wp.headingMode = wp.origHeadingMode || 'inherit';
      wp.poiIndex = (wp.origPoiIndex !== undefined && wp.origPoiIndex !== null) ? wp.origPoiIndex : 0;
      wp.speed = (wp.origSpeed !== undefined) ? wp.origSpeed : null;
      wp.hoverTime = (wp.origHoverTime !== undefined) ? wp.origHoverTime : null;
      wp.turnMode = wp.origTurnMode || 'inherit';
      wp.cameraAction = wp.origCameraAction || 'inherit';
      wp.zoom = (wp.origZoom !== undefined && wp.origZoom !== null) ? wp.origZoom : 1.0;
      wp.isRingStart = wp.origIsRingStart !== undefined ? wp.origIsRingStart : false;
      wp.isModified = false;
      delete wp._lastLat;
      delete wp._lastLon;
      
      // Also reset photo locations if they exist
      const activePhotos = getCurrentPhotos();
      if (hasPhoto && activePhotos && activePhotos[idx]) {
        const photo = activePhotos[idx];
        photo.lat = (photo.origLat !== undefined && photo.origLat !== null) ? photo.origLat : wp.lat;
        photo.lon = (photo.origLon !== undefined && photo.origLon !== null) ? photo.origLon : wp.lon;
        const ptOffsets = geodeticToLocal(photo.lat, photo.lon, centerLatLng.lat, centerLatLng.lng);
        photo.x = ptOffsets.x;
        photo.y = ptOffsets.y;
        photo.alt = (photo.origAlt !== undefined && photo.origAlt !== null) ? photo.origAlt : wp.alt;
        photo.pitch = (photo.origPitch !== undefined && photo.origPitch !== null) ? photo.origPitch : wp.pitch;
        photo.heading = (photo.origHeading !== undefined) ? photo.origHeading : wp.heading;
        photo.isRingStart = photo.origIsRingStart !== undefined ? photo.origIsRingStart : false;
        photo.isModified = false;
      }
      
      const gridType = document.getElementById('grid-type')?.value;
      if (gridType === 'road-following' && roadWaypoints && roadWaypoints[idx]) {
        const rWp = roadWaypoints[idx];
        rWp.lat = (rWp.origLat !== undefined && rWp.origLat !== null) ? rWp.origLat : rWp.lat;
        rWp.lon = (rWp.origLon !== undefined && rWp.origLon !== null) ? rWp.origLon : rWp.lon;
        const rOffsets = geodeticToLocal(rWp.lat, rWp.lon, centerLatLng.lat, centerLatLng.lng);
        rWp.x = rOffsets.x;
        rWp.y = rOffsets.y;
        rWp.alt = (rWp.origAlt !== undefined && rWp.origAlt !== null) ? rWp.origAlt : defaultAlt;
        rWp.pitch = (rWp.origPitch !== undefined && rWp.origPitch !== null) ? rWp.origPitch : defaultPitch;
        rWp.heading = rWp.origHeading !== undefined ? rWp.origHeading : null;
        rWp.headingMode = rWp.origHeadingMode || 'inherit';
        rWp.poiIndex = rWp.origPoiIndex || 0;
        rWp.speed = rWp.origSpeed !== undefined ? rWp.origSpeed : null;
        rWp.hoverTime = rWp.origHoverTime !== undefined ? rWp.origHoverTime : 0;
        rWp.turnMode = rWp.origTurnMode || 'inherit';
        rWp.cameraAction = rWp.origCameraAction || 'inherit';
        rWp.zoom = rWp.origZoom !== undefined ? rWp.origZoom : 1.0;
        rWp.isModified = false;
        delete rWp._lastLat;
        delete rWp._lastLon;
        if (rWp.roadMarker && typeof rWp.roadMarker.setLatLng === 'function') {
          rWp.roadMarker.setLatLng([rWp.lat, rWp.lon]);
        }
      }

      // Reposition Leaflet markers back to original baseline
      if (marker && typeof marker.setLatLng === 'function') {
        marker.setLatLng([wp.lat, wp.lon]);
      }
      if (wp.mapMarker && typeof wp.mapMarker.setLatLng === 'function') {
        wp.mapMarker.setLatLng([wp.lat, wp.lon]);
      }
      if (wp.roadMarker && typeof wp.roadMarker.setLatLng === 'function') {
        wp.roadMarker.setLatLng([wp.lat, wp.lon]);
      }

      const rotationDeg = parseFloat(document.getElementById('grid-rotation')?.value || 0);
      if (gridType !== 'road-following') {
        const originalIcon = getMarkerIcon(wp, idx, getCurrentWaypoints(), rotationDeg);
        if (marker && typeof marker.setIcon === 'function') marker.setIcon(originalIcon);
        if (wp.mapMarker && typeof wp.mapMarker.setIcon === 'function') wp.mapMarker.setIcon(originalIcon);

        const isStart = idx === 0;
        const isEnd = idx === getCurrentWaypoints().length - 1;
        let heading = 0;
        if (wp.heading !== null && wp.heading !== undefined) {
          heading = wp.heading;
        } else {
          heading = getDefaultHeading(idx, getCurrentWaypoints(), rotationDeg);
        }
        const pitch = (wp.pitch !== undefined && wp.pitch !== null && !isNaN(wp.pitch)) ? wp.pitch : parseGimbalPitch(document.getElementById('gimbal-pitch')?.value, -45);
        const originalTitle = `${isStart ? "Start Point" : (isEnd ? "End Point" : `Waypoint ${idx}`)}<br>Height: ${formatDistance(wp.alt, 0)}<br>Yaw: ${heading.toFixed(0)}°<br>Pitch: ${pitch}°`;
        if (marker && typeof marker.setTooltipContent === 'function') marker.setTooltipContent(originalTitle);
        if (wp.mapMarker && typeof wp.mapMarker.setTooltipContent === 'function') wp.mapMarker.setTooltipContent(originalTitle);
      } else {
        if (wp.roadMarker) {
          if (marker && typeof marker.setTooltipContent === 'function') marker.setTooltipContent(`Road Node ${idx}`);
        } else {
          const defaultGimbalPitch = parseGimbalPitch(document.getElementById('gimbal-pitch')?.value, -45);
          const pitch = (wp.pitch !== undefined && wp.pitch !== null && !isNaN(wp.pitch)) ? wp.pitch : defaultGimbalPitch;
          const headingDisplay = (wp.heading !== null && wp.heading !== undefined) ? wp.heading.toFixed(0) : '—';
          const tooltipContent = `Drone Waypoint ${idx}<br>Height: ${formatDistance(wp.alt, 0)}<br>Yaw: ${headingDisplay}°<br>Pitch: ${pitch}°`;
          if (marker && typeof marker.setTooltipContent === 'function') marker.setTooltipContent(tooltipContent);
          if (wp.mapMarker && typeof wp.mapMarker.setTooltipContent === 'function') wp.mapMarker.setTooltipContent(tooltipContent);
        }
      }

      if (popupObj) popupObj.close ? popupObj.close() : (marker && marker.closePopup());

      if (gridType !== 'freeform') {
        updateGrid();
      } else {
        redrawCurrentMission();
      }
      
      recreate3DWaypointsAndPaths();
      if (fpvActive) {
        updateFPVEditorUI();
        updateFPVCamera(0);
      }
    });
  }

  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      const gridType = document.getElementById('grid-type').value;
      const isRoadFollow = (gridType === 'road-following');
      const label = isRoadFollow ? 'Road Node / Waypoint' : 'Waypoint';
      if (confirm(`Are you sure you want to delete ${label} ${idx}?`)) {
        unbindRevert();
        deleteFlightWaypoint(wp, idx);
        if (popupObj) popupObj.close ? popupObj.close() : (marker && marker.closePopup());
      }
    });
  }

  const switcherSelect = popupContent.querySelector('.overlapping-switcher-select');
  if (switcherSelect) {
    switcherSelect.addEventListener('change', (e) => {
      const selectedVal = e.target.value;
      const targetItem = overlappingItems.find(item => `${item.type}_${item.idx !== undefined ? item.idx : 0}` === selectedVal);
      if (targetItem && targetItem.marker) {
        if (typeof unbindRevert === 'function') unbindRevert();
        if (marker && marker.closePopup) marker.closePopup();
        bringMarkerToFront(targetItem.marker);
        setTimeout(() => {
          targetItem.marker.openPopup();
        }, 50);
      }
    });
  }

  return popupContent;
}

// Three.js 3D Preview State Variables
let threeScene, threeCamera, threeRenderer, threeControls, threeAnimationId;
let showCones = true;
let autoRotate3D = false;
let coneGroups = [];
let waypointsGroup, pathsGroup, groundLinesGroup, conesGroup;
let cachedTileImages = [];
let threeGroundCanvas = null;
let threeGroundCtx = null;
let threeGroundTexture = null;
let groundPlaneOffsetX = 0;
let groundPlaneOffsetZ = 0;
let groundPlaneSize = 0;
let showFootprints = true;

// FPV Walkthrough & Editor State Variables
