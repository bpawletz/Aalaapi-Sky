let map;
let centerMarker = null;
let pois = []; // Array of POI objects: { lat, lon, marker, name }
let flightPathPolyline = null;
let gridBoundsPolygon = null;
let waypointMarkersGroup = null;
let pitchLabelsGroup = null; // Separate layer for pitch labels — avoids ghost-dot artifacts in marker pane during zoom
let photoMarkersGroup = null;
let photoInspectionGroup = null;
let photoFootprintsGroup = null;
let singlePhotoFootprintGroup = null;
let activeInspectionManifest = null;
let exclusionZonesGroup = null;
let boundaryLayersGroup = null;
let fiducialMarkersGroup = null;
let targetPolygonGroup = null;
let solarOverlaysGroup = null;
let acousticOverlaysGroup = null;
let isTargetPolyEditActive = false;
let isCorridorEditActive = false;
let isAnyPopupOpen = false;
let isLegendCollapsed = false;
let originalMissionSettings = null;

function setTargetPolyEditMode(active) {
  isTargetPolyEditActive = !!active;
  if (typeof document === 'undefined') return;

  const btn = document.getElementById('target-poly-draw-toggle');
  const statusEl = document.getElementById('target-poly-status-text');
  const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
  const polyLen = (activeLayer && activeLayer.targetPoly) ? activeLayer.targetPoly.length : 0;

  if (typeof map !== 'undefined' && map && map.getContainer) {
    try {
      const container = map.getContainer();
      if (container) {
        container.style.cursor = isTargetPolyEditActive ? 'crosshair' : '';
      }
    } catch (e) {}
  }

  if (btn) {
    if (isTargetPolyEditActive) {
      btn.textContent = '🛑 Done Tracing';
      btn.style.background = 'rgba(16, 185, 129, 0.35)';
      btn.style.borderColor = '#10b981';
      btn.style.color = '#34d399';
    } else {
      btn.textContent = polyLen >= 3 ? '✏️ Edit Target Polygon' : '✏️ Mark Target Perimeter';
      btn.style.background = '';
      btn.style.borderColor = '';
      btn.style.color = '';
    }
  }

  if (statusEl) {
    if (isTargetPolyEditActive) {
      if (polyLen === 0) {
        statusEl.textContent = '🎯 Click on map to place Corner 1 of house perimeter.';
      } else if (polyLen === 1) {
        statusEl.textContent = '🎯 Corner 1 placed. Click to place Corner 2.';
      } else if (polyLen === 2) {
        statusEl.textContent = '🎯 2 corners placed. Click to place Corner 3 to close polygon.';
      } else {
        statusEl.textContent = `🎯 ${polyLen} corners placed. Click more corners, or click "Done Tracing" to generate grid.`;
      }
      statusEl.style.color = '#34d399';
      statusEl.style.fontWeight = '600';
    } else {
      if (polyLen >= 3) {
        statusEl.textContent = `🎯 Target Polygon (${polyLen} corners). Click "Edit" or drag markers to adjust.`;
        statusEl.style.color = '#a7f3d0';
        statusEl.style.fontWeight = 'normal';
      } else {
        statusEl.textContent = 'Click on map to place perimeter vertices around the house. Drag markers to adjust.';
        statusEl.style.color = '#a7f3d0';
        statusEl.style.fontWeight = 'normal';
      }
    }
  }
}

function setCorridorEditMode(active) {
  isCorridorEditActive = !!active;
  if (typeof window !== 'undefined') {
    window.isCorridorEditActive = isCorridorEditActive;
  }
  if (typeof document === 'undefined') return;

  const btn = document.getElementById('corridor-edit-toggle-btn');
  const statusEl = document.getElementById('corridor-edit-status');
  const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
  const nodes = (activeLayer && Array.isArray(activeLayer.corridorCenterline))
    ? activeLayer.corridorCenterline
    : (typeof corridorCenterline !== 'undefined' && Array.isArray(corridorCenterline) ? corridorCenterline : []);
  const nodeCount = nodes.length;

  if (typeof map !== 'undefined' && map && map.getContainer) {
    try {
      const container = map.getContainer();
      if (container) {
        container.style.cursor = isCorridorEditActive ? 'crosshair' : '';
      }
    } catch (e) {}
  }

  if (btn) {
    if (isCorridorEditActive) {
      btn.innerHTML = '✓ Done Editing';
      btn.style.background = 'rgba(16, 185, 129, 0.25)';
      btn.style.borderColor = '#10b981';
      btn.style.color = '#34d399';
    } else {
      btn.innerHTML = '✏️ Edit Centerline';
      btn.style.background = 'rgba(99, 102, 241, 0.18)';
      btn.style.borderColor = '#6366f1';
      btn.style.color = '#818cf8';
    }
  }

  if (statusEl) {
    if (isCorridorEditActive) {
      statusEl.textContent = `🎯 Edit Mode Active (${nodeCount} nodes): Drag C handles or click map to append vertices. Flight passes isolated.`;
      statusEl.style.color = '#34d399';
      statusEl.style.fontWeight = '600';
    } else {
      statusEl.textContent = 'ℹ️ Click Edit Centerline to isolate handles, or edit coordinates below.';
      statusEl.style.color = 'var(--text-muted)';
      statusEl.style.fontWeight = 'normal';
    }
  }

  if (typeof renderCorridorNodeTable === 'function') {
    renderCorridorNodeTable();
  }
}

if (typeof window !== 'undefined') {
  window.isCorridorEditActive = isCorridorEditActive;
  window.setCorridorEditMode = setCorridorEditMode;
}

let isLayerBoundaryEditActive = false;

function setLayerBoundaryEditMode(active) {
  isLayerBoundaryEditActive = !!active;
  if (typeof document === 'undefined') return;

  const btn = document.getElementById('btn-draw-layer-boundary');
  const clearBtn = document.getElementById('btn-clear-layer-boundary');
  const badge = document.getElementById('layer-boundary-vertex-badge');
  const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
  const polyLen = (activeLayer && Array.isArray(activeLayer.boundaryPolygon)) ? activeLayer.boundaryPolygon.length : 0;

  if (typeof map !== 'undefined' && map && map.getContainer) {
    try {
      const container = map.getContainer();
      if (container) {
        container.style.cursor = isLayerBoundaryEditActive ? 'crosshair' : '';
      }
    } catch (e) {}
  }

  if (btn) {
    if (isLayerBoundaryEditActive) {
      btn.textContent = '🛑 Done Drawing';
      btn.style.background = 'rgba(16, 185, 129, 0.35)';
      btn.style.borderColor = '#10b981';
      btn.style.color = '#34d399';
    } else {
      btn.textContent = polyLen >= 3 ? '✏️ Edit Boundary' : '✏️ Draw on Map';
      btn.style.background = '';
      btn.style.borderColor = '';
      btn.style.color = '';
    }
  }

  if (clearBtn) {
    clearBtn.style.display = polyLen > 0 ? 'inline-block' : 'none';
  }

  if (badge) {
    if (polyLen >= 3) {
      badge.textContent = `${polyLen} Vertices`;
      badge.style.background = 'rgba(16, 185, 129, 0.2)';
      badge.style.color = '#34d399';
    } else if (polyLen > 0) {
      badge.textContent = `${polyLen} Pts (Drawing...)`;
      badge.style.background = 'rgba(245, 158, 11, 0.2)';
      badge.style.color = '#f59e0b';
    } else {
      badge.textContent = 'Auto-Bounds';
      badge.style.background = 'rgba(56, 189, 248, 0.15)';
      badge.style.color = '#38bdf8';
    }
  }
}

function addLayerBoundaryPoint(lat, lon) {
  if (!isRestoringUndoState && typeof pushUndoSnapshot === 'function') {
    pushUndoSnapshot('Add Boundary Vertex');
  }
  const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
  if (!activeLayer) return;
  if (!Array.isArray(activeLayer.boundaryPolygon)) {
    activeLayer.boundaryPolygon = [];
  }
  if (activeLayer.boundaryPolygon.length >= 3) {
    const p0 = activeLayer.boundaryPolygon[0];
    const distM = (typeof haversineDistance === 'function') ? haversineDistance(lat, lon, p0.lat, p0.lon) : 999;
    if (distM < 15) {
      setLayerBoundaryEditMode(false);
      if (typeof updatePlan === 'function') updatePlan();
      return;
    }
  }
  activeLayer.boundaryPolygon.push({ lat, lon });
  setLayerBoundaryEditMode(isLayerBoundaryEditActive);
  if (typeof updatePlan === 'function') updatePlan();
}

function clearLayerBoundary() {
  const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
  if (activeLayer) {
    activeLayer.boundaryPolygon = [];
  }
  setLayerBoundaryEditMode(false);
  if (typeof updatePlan === 'function') updatePlan();
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function hexToRgba(hex, alpha = 1) {
  if (!hex || typeof hex !== 'string') return `rgba(6, 182, 212, ${alpha})`;
  let c = hex.replace('#', '');
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  const num = parseInt(c, 16);
  if (isNaN(num)) return `rgba(6, 182, 212, ${alpha})`;
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function calculateGeodeticPolygonMetrics(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    return { perimeter: 0, area: 0 };
  }

  let totalMeters = 0;
  for (let i = 0; i < coordinates.length; i++) {
    const p1 = coordinates[i];
    const p2 = coordinates[(i + 1) % coordinates.length];
    if (i === coordinates.length - 1 && coordinates.length < 3) break;
    const d = haversineDistance(p1.lat, (p1.lon !== undefined ? p1.lon : p1.lng), p2.lat, (p2.lon !== undefined ? p2.lon : p2.lng));
    totalMeters += d;
  }

  let areaM2 = 0;
  if (coordinates.length >= 3) {
    const lat0 = coordinates[0].lat * (Math.PI / 180);
    const mPerDegLat = 111132.954;
    const mPerDegLon = 111132.954 * Math.cos(lat0);

    const xyPoints = coordinates.map(c => ({
      x: ((c.lon !== undefined ? c.lon : c.lng) - (coordinates[0].lon !== undefined ? coordinates[0].lon : coordinates[0].lng)) * mPerDegLon,
      y: (c.lat - coordinates[0].lat) * mPerDegLat
    }));

    let sum = 0;
    for (let i = 0; i < xyPoints.length; i++) {
      const j = (i + 1) % xyPoints.length;
      sum += xyPoints[i].x * xyPoints[j].y - xyPoints[j].x * xyPoints[i].y;
    }
    areaM2 = Math.abs(sum) / 2;
  }

  return { perimeter: totalMeters, area: areaM2 };
}

function addBoundaryPolygonPoint(lat, lng) {
  if (!isRestoringUndoState && typeof pushUndoSnapshot === 'function') {
    pushUndoSnapshot('Add Boundary Vertex');
  }
  const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
  if (!activeLayer) return;

  if (!Array.isArray(activeLayer.boundaryPolygon)) {
    activeLayer.boundaryPolygon = [];
  }

  if (!centerMarker && typeof setGridCenter === 'function') {
    setGridCenter(lat, lng);
  }

  const centerLatLng = centerMarker ? centerMarker.getLatLng() : { lat, lng };
  const offsets = (typeof geodeticToLocal === 'function')
    ? geodeticToLocal(lat, lng, centerLatLng.lat, centerLatLng.lng)
    : { x: 0, y: 0 };

  const pt = {
    lat: lat,
    lon: lng,
    x: offsets.x,
    y: offsets.y
  };

  activeLayer.boundaryPolygon.push(pt);
  activeLayer.polygonVertices = activeLayer.boundaryPolygon;

  updateGrid();
}

function clearBoundaryPolygon() {
  const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
  if (!activeLayer) return;
  activeLayer.boundaryPolygon = [];
  activeLayer.polygonVertices = [];
  updateGrid();
}

function drawBoundaryLayers(globalCenterLat, globalCenterLon) {
  if (!boundaryLayersGroup || typeof L === 'undefined' || !map) return;
  boundaryLayersGroup.clearLayers();

  const enabledDrawings = (typeof flightLayers !== 'undefined' && Array.isArray(flightLayers))
    ? flightLayers.filter(l => l.enabled && (l.pattern === 'boundary-polygon' || l.isDrawingLayer))
    : [];

  enabledDrawings.forEach(layer => {
    const centerLat = (layer.centerLat !== undefined && layer.centerLat !== null) ? layer.centerLat : globalCenterLat;
    const centerLon = (layer.centerLon !== undefined && layer.centerLon !== null) ? layer.centerLon : globalCenterLon;
    const vertices = (Array.isArray(layer.boundaryPolygon) && layer.boundaryPolygon.length > 0)
      ? layer.boundaryPolygon
      : (Array.isArray(layer.polygonVertices) && layer.polygonVertices.length > 0 ? layer.polygonVertices : []);

    const strokeColor = layer.strokeColor || '#06b6d4';
    const lineStyle = layer.lineStyle || 'dashed';
    const dashArray = lineStyle === 'solid' ? null : (lineStyle === 'dotted' ? '3, 4' : '6, 6');
    const fillOpacity = (typeof layer.fillOpacity === 'number') ? layer.fillOpacity / 100.0 : 0.15;

    const metrics = calculateGeodeticPolygonMetrics(vertices);
    const perimMeters = metrics.perimeter;
    const areaSqM = metrics.area;
    const perimFt = perimMeters * 3.28084;
    const areaAcres = areaSqM * 0.000247105;
    const tooltipText = `🗺️ <strong>${escapeHtml(layer.name || 'Boundary / Parcel')}</strong><br>Vertices: ${vertices.length}<br>Perimeter: ${formatDistance(perimMeters)} (${Math.round(perimFt)}ft)<br>Area: ${Math.round(areaSqM).toLocaleString()} m² (${areaAcres.toFixed(2)} acres)`;

    if (layer.id === activeLayerId) {
      const vBadge = document.getElementById('boundary-metrics-vertices');
      const pBadge = document.getElementById('boundary-metrics-perimeter');
      const aBadge = document.getElementById('boundary-metrics-area');
      if (vBadge) vBadge.textContent = `${vertices.length} Vertices`;
      if (pBadge) pBadge.textContent = `${formatDistance(perimMeters)} (${Math.round(perimFt)}ft)`;
      if (aBadge) aBadge.textContent = `${Math.round(areaSqM).toLocaleString()} m² (${areaAcres.toFixed(2)} acres)`;
    }

    let poly = null;
    if (vertices.length >= 3) {
      const latlngs = vertices.map(v => [v.lat, (v.lon !== undefined ? v.lon : v.lng)]);
      poly = L.polygon(latlngs, {
        color: strokeColor,
        weight: 2.5,
        dashArray: dashArray,
        fillColor: strokeColor,
        fillOpacity: fillOpacity,
        className: 'boundary-drawing-polygon'
      }).addTo(boundaryLayersGroup);

      poly.bindTooltip(tooltipText, { direction: 'center', permanent: false });
    } else if (vertices.length === 2) {
      const latlngs = vertices.map(v => [v.lat, (v.lon !== undefined ? v.lon : v.lng)]);
      poly = L.polyline(latlngs, {
        color: strokeColor,
        weight: 2,
        dashArray: dashArray || '4, 4',
        opacity: 0.8
      }).addTo(boundaryLayersGroup);
    }

    // Draggable vertex handles for active layer
    if (layer.id === activeLayerId) {
      vertices.forEach((v, vIdx) => {
        const vLon = v.lon !== undefined ? v.lon : v.lng;
        const nodeIcon = L.divIcon({
          className: 'boundary-node-icon-wrapper',
          html: `<div class="boundary-node-icon" style="background-color: ${strokeColor};" title="Boundary Vertex ${vIdx + 1} (Drag to reposition, click to remove)">${vIdx + 1}</div>`,
          iconSize: [20, 20],
          iconAnchor: [10, 10]
        });

        const nodeMarker = L.marker([v.lat, vLon], {
          icon: nodeIcon,
          draggable: true
        }).addTo(boundaryLayersGroup);

        nodeMarker.on('drag', (e) => {
          const newLatLng = e.target.getLatLng();
          const offsets = (typeof geodeticToLocal === 'function')
            ? geodeticToLocal(newLatLng.lat, newLatLng.lng, centerLat, centerLon)
            : { x: 0, y: 0 };
          v.lat = newLatLng.lat;
          v.lon = newLatLng.lng;
          v.x = offsets.x;
          v.y = offsets.y;
          if (poly && typeof poly.setLatLngs === 'function') {
            poly.setLatLngs(vertices.map(pt => [pt.lat, (pt.lon !== undefined ? pt.lon : pt.lng)]));
          }
        });

        nodeMarker.on('dragend', () => {
          updateGrid();
        });

        nodeMarker.on('click', (e) => {
          if (e.originalEvent && e.originalEvent.stopPropagation) e.originalEvent.stopPropagation();
          vertices.splice(vIdx, 1);
          if (layer.boundaryPolygon) layer.boundaryPolygon = vertices;
          if (layer.polygonVertices) layer.polygonVertices = vertices;
          updateGrid();
        });
      });
    }
  });
}

// ============================================================================
// ↩️ Mission & Waypoint Undo History Engine (v1.205.0)
// ============================================================================

let undoHistoryStack = [];
let redoHistoryStack = [];
const MAX_UNDO_HISTORY = 30;
let isRestoringUndoState = false;

function cloneWaypointData(wp) {
  if (!wp || typeof wp !== 'object') return wp;
  const copy = {};
  for (const key of Object.keys(wp)) {
    if (key === 'mapMarker' || key === 'marker' || key === 'roadMarker' || key === 'corridorMarker' || key === 'droneMarker' || key === 'polyMarker' || key === 'fiducialMarker') {
      continue;
    }
    const val = wp[key];
    if (val === null || val === undefined) {
      copy[key] = val;
    } else if (Array.isArray(val)) {
      copy[key] = val.map(item => (typeof item === 'object' && item !== null ? cloneWaypointData(item) : item));
    } else if (val instanceof Set) {
      copy[key] = new Set(val);
    } else if (typeof val === 'object') {
      try {
        copy[key] = JSON.parse(JSON.stringify(val));
      } catch (e) {
        copy[key] = val;
      }
    } else {
      copy[key] = val;
    }
  }
  return copy;
}

function cloneLayerData(layer) {
  if (!layer || typeof layer !== 'object') return layer;
  const copy = {};
  for (const key of Object.keys(layer)) {
    if (key === 'mapMarker' || key === 'marker') continue;
    const val = layer[key];
    if (Array.isArray(val)) {
      copy[key] = val.map(cloneWaypointData);
    } else if (val !== null && typeof val === 'object') {
      try {
        copy[key] = JSON.parse(JSON.stringify(val));
      } catch (e) {
        copy[key] = val;
      }
    } else {
      copy[key] = val;
    }
  }
  return copy;
}

function createMissionSnapshot(actionLabel = 'Map Action') {
  // Persist current active layer UI inputs before taking snapshot
  if (typeof saveActiveLayerFromUi === 'function') {
    try {
      saveActiveLayerFromUi();
    } catch (e) {}
  }

  const hasCenter = Boolean(centerMarker && typeof centerMarker.getLatLng === 'function');
  const centerLL = hasCenter ? centerMarker.getLatLng() : null;

  return {
    actionLabel: actionLabel,
    timestamp: Date.now(),
    hasCenterMarker: hasCenter,
    centerLat: centerLL ? centerLL.lat : null,
    centerLon: centerLL ? centerLL.lng : null,
    activeLayerId: (typeof activeLayerId !== 'undefined') ? activeLayerId : null,
    flightLayers: (typeof flightLayers !== 'undefined' && Array.isArray(flightLayers))
      ? flightLayers.map(cloneLayerData)
      : [],
    generatedWaypoints: (typeof generatedWaypoints !== 'undefined' && Array.isArray(generatedWaypoints))
      ? generatedWaypoints.map(cloneWaypointData)
      : null,
    generatedPhotos: (typeof generatedPhotos !== 'undefined' && Array.isArray(generatedPhotos))
      ? generatedPhotos.map(cloneWaypointData)
      : null,
    roadWaypoints: (typeof roadWaypoints !== 'undefined' && Array.isArray(roadWaypoints))
      ? roadWaypoints.map(cloneWaypointData)
      : [],
    corridorCenterline: (typeof corridorCenterline !== 'undefined' && Array.isArray(corridorCenterline))
      ? corridorCenterline.map(cloneWaypointData)
      : [],
    importedWaypoints: (typeof importedWaypoints !== 'undefined' && Array.isArray(importedWaypoints))
      ? importedWaypoints.map(cloneWaypointData)
      : null,
    importedPhotos: (typeof importedPhotos !== 'undefined' && Array.isArray(importedPhotos))
      ? importedPhotos.map(cloneWaypointData)
      : null,
    importedFileName: (typeof importedFileName !== 'undefined') ? importedFileName : '',
    activeSplitStartIndices: (typeof activeSplitStartIndices !== 'undefined' && activeSplitStartIndices instanceof Set)
      ? Array.from(activeSplitStartIndices)
      : [],
    pois: (typeof pois !== 'undefined' && Array.isArray(pois))
      ? pois.map(p => ({
          id: p.id,
          lat: p.lat,
          lon: p.lon,
          alt: p.alt,
          name: p.name,
          isHome: p.isHome
        }))
      : []
  };
}

function pushUndoSnapshot(actionLabel = 'Map Action') {
  if (isRestoringUndoState) return;

  const snapshot = createMissionSnapshot(actionLabel);

  undoHistoryStack.push(snapshot);
  if (undoHistoryStack.length > MAX_UNDO_HISTORY) {
    undoHistoryStack.shift();
  }

  // Any new mutating action clears the redo stack
  redoHistoryStack.length = 0;

  updateUndoUiState();
}

function updateUndoUiState() {
  if (typeof document === 'undefined') return;
  const undoCount = (typeof undoHistoryStack !== 'undefined' && Array.isArray(undoHistoryStack)) ? undoHistoryStack.length : 0;
  const redoCount = (typeof redoHistoryStack !== 'undefined' && Array.isArray(redoHistoryStack)) ? redoHistoryStack.length : 0;

  const lastUndoAction = undoCount > 0 ? undoHistoryStack[undoCount - 1].actionLabel : '';
  const lastRedoAction = redoCount > 0 ? redoHistoryStack[redoCount - 1].actionLabel : '';

  const mapUndoBtn = document.getElementById('map-undo-btn');
  const mapUndoBadge = document.getElementById('map-undo-badge');
  const sidebarUndoBtn = document.getElementById('undo-mission-btn');
  const sidebarUndoBadge = document.getElementById('undo-stack-badge');

  const mapRedoBtn = document.getElementById('map-redo-btn');
  const mapRedoBadge = document.getElementById('map-redo-badge');
  const sidebarRedoBtn = document.getElementById('redo-mission-btn');
  const sidebarRedoBadge = document.getElementById('redo-stack-badge');

  const undoTitleText = undoCount > 0 ? `Undo: ${lastUndoAction} (Ctrl+Z)` : 'Undo Last Map Action (Ctrl+Z)';
  const redoTitleText = redoCount > 0 ? `Redo: ${lastRedoAction} (Ctrl+Y)` : 'Redo Last Map Action (Ctrl+Y)';

  // Update Undo buttons
  if (mapUndoBtn) {
    mapUndoBtn.disabled = (undoCount === 0);
    mapUndoBtn.title = undoTitleText;
  }
  if (mapUndoBadge) {
    if (undoCount > 0) {
      mapUndoBadge.textContent = undoCount;
      mapUndoBadge.style.display = 'inline-block';
    } else {
      mapUndoBadge.style.display = 'none';
    }
  }
  if (sidebarUndoBtn) {
    sidebarUndoBtn.disabled = (undoCount === 0);
    sidebarUndoBtn.title = undoTitleText;
    sidebarUndoBtn.style.opacity = (undoCount === 0) ? '0.45' : '1';
    sidebarUndoBtn.style.cursor = (undoCount === 0) ? 'not-allowed' : 'pointer';
  }
  if (sidebarUndoBadge) {
    if (undoCount > 0) {
      sidebarUndoBadge.textContent = undoCount;
      sidebarUndoBadge.style.display = 'inline-block';
    } else {
      sidebarUndoBadge.style.display = 'none';
    }
  }

  // Update Redo buttons
  if (mapRedoBtn) {
    mapRedoBtn.disabled = (redoCount === 0);
    mapRedoBtn.title = redoTitleText;
  }
  if (mapRedoBadge) {
    if (redoCount > 0) {
      mapRedoBadge.textContent = redoCount;
      mapRedoBadge.style.display = 'inline-block';
    } else {
      mapRedoBadge.style.display = 'none';
    }
  }
  if (sidebarRedoBtn) {
    sidebarRedoBtn.disabled = (redoCount === 0);
    sidebarRedoBtn.title = redoTitleText;
    sidebarRedoBtn.style.opacity = (redoCount === 0) ? '0.45' : '1';
    sidebarRedoBtn.style.cursor = (redoCount === 0) ? 'not-allowed' : 'pointer';
  }
  if (sidebarRedoBadge) {
    if (redoCount > 0) {
      sidebarRedoBadge.textContent = redoCount;
      sidebarRedoBadge.style.display = 'inline-block';
    } else {
      sidebarRedoBadge.style.display = 'none';
    }
  }
}

function showUndoToast(msg) {
  if (typeof document === 'undefined') return;
  const toast = document.getElementById('undo-feedback-toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.style.display = 'block';
  toast.style.opacity = '1';
  if (typeof window !== 'undefined') {
    if (window._undoToastTimer) clearTimeout(window._undoToastTimer);
    window._undoToastTimer = setTimeout(() => {
      if (toast) {
        toast.style.opacity = '0';
        const t2 = setTimeout(() => {
          if (toast) toast.style.display = 'none';
        }, 250);
        if (t2 && typeof t2.unref === 'function') t2.unref();
      }
    }, 2500);
    if (window._undoToastTimer && typeof window._undoToastTimer.unref === 'function') {
      window._undoToastTimer.unref();
    }
  }
}

function restoreMissionSnapshot(snapshot) {
  if (typeof map !== 'undefined' && map && typeof map.closePopup === 'function') {
    try { map.closePopup(); } catch (e) {}
  }

  // 1. Restore Center Marker
  if (!snapshot.hasCenterMarker) {
    if (centerMarker) {
      if (typeof map !== 'undefined' && map && map.hasLayer(centerMarker)) {
        map.removeLayer(centerMarker);
      }
      centerMarker = null;
    }
  } else {
    const lat = snapshot.centerLat;
    const lon = snapshot.centerLon;
    if (centerMarker) {
      if (typeof centerMarker.setLatLng === 'function') {
        centerMarker.setLatLng([lat, lon]);
      }
    } else if (typeof map !== 'undefined' && map && typeof L !== 'undefined') {
      const centerIcon = L.divIcon({
        className: 'custom-center-marker',
        html: `<div style="background-color: #06b6d4; width: 16px; height: 16px; border-radius: 50%; border: 3px solid #f8fafc; box-shadow: 0 0 10px rgba(6,182,212,0.8);"></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      });

      centerMarker = L.marker([lat, lon], { draggable: true, icon: centerIcon }).addTo(map);

      centerMarker.on('dragstart', () => {
        if (typeof pushUndoSnapshot === 'function') pushUndoSnapshot('Move Mission Center');
        if (typeof clearWaypointCustomModifications === 'function') clearWaypointCustomModifications();
      });
      centerMarker.on('drag', () => {
        const curLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
        const latlng = centerMarker.getLatLng();
        if (curLayer) {
          curLayer.centerLat = latlng.lat;
          curLayer.centerLon = latlng.lng;
        }
        if (pois && pois[0]) {
          pois[0].lat = latlng.lat;
          pois[0].lon = latlng.lng;
        }
        if (typeof weatherStationLine !== 'undefined' && weatherStationLine && typeof weatherStationMarker !== 'undefined' && weatherStationMarker && typeof weatherStationLine.setLatLngs === 'function') {
          weatherStationLine.setLatLngs([centerMarker.getLatLng(), weatherStationMarker.getLatLng()]);
        }
        if (typeof updateGrid === 'function') updateGrid();
      });
      centerMarker.on('dragend', () => {
        centerMarker.openPopup();
        if (typeof renderCorridorNodeTable === 'function') {
          renderCorridorNodeTable();
        }
      });
      centerMarker.on('click', (e) => {
        if (typeof L !== 'undefined' && L.DomEvent) L.DomEvent.stopPropagation(e);
        if (typeof getOverlappingItemsAt === 'function' && typeof currentlySelectedMarker !== 'undefined') {
          const items = getOverlappingItemsAt(centerMarker.getLatLng());
          if (items.length > 1 && currentlySelectedMarker !== centerMarker) {
            if (typeof openDisambiguationPopup === 'function') openDisambiguationPopup(centerMarker.getLatLng(), items);
          } else {
            if (typeof bringMarkerToFront === 'function') bringMarkerToFront(centerMarker);
            centerMarker.openPopup();
          }
        }
      });
    }
  }

  // 2. Restore flightLayers and activeLayerId
  if (snapshot.flightLayers && Array.isArray(snapshot.flightLayers)) {
    flightLayers = snapshot.flightLayers.map(cloneLayerData);
  }
  if (snapshot.activeLayerId && typeof activeLayerId !== 'undefined') {
    activeLayerId = snapshot.activeLayerId;
  }

  // 3. Restore waypoints and photos
  generatedWaypoints = snapshot.generatedWaypoints ? snapshot.generatedWaypoints.map(cloneWaypointData) : null;
  generatedPhotos = snapshot.generatedPhotos ? snapshot.generatedPhotos.map(cloneWaypointData) : null;
  roadWaypoints = snapshot.roadWaypoints ? snapshot.roadWaypoints.map(cloneWaypointData) : [];
  corridorCenterline = snapshot.corridorCenterline ? snapshot.corridorCenterline.map(cloneWaypointData) : [];
  importedWaypoints = snapshot.importedWaypoints ? snapshot.importedWaypoints.map(cloneWaypointData) : null;
  importedPhotos = snapshot.importedPhotos ? snapshot.importedPhotos.map(cloneWaypointData) : null;
  importedFileName = snapshot.importedFileName || '';
  if (snapshot.activeSplitStartIndices) {
    activeSplitStartIndices = new Set(snapshot.activeSplitStartIndices);
  }

  // 4. Restore POIs
  if (snapshot.pois && Array.isArray(snapshot.pois)) {
    if (typeof clearAllPois === 'function') {
      clearAllPois();
    }
    pois = snapshot.pois.map(p => ({ ...p }));
    if (centerMarker && pois[0]) {
      pois[0].marker = centerMarker;
      if (typeof updatePoiMarkerPopup === 'function') {
        updatePoiMarkerPopup(pois[0], 0);
      }
    }
  }

  // 5. Sync UI states
  if (typeof toggleUIControlsState === 'function') {
    toggleUIControlsState(importedWaypoints !== null);
  }
  if (typeof syncUiWithActiveLayer === 'function') {
    syncUiWithActiveLayer();
  }
  if (typeof renderLayersList === 'function') {
    renderLayersList();
  }
  if (typeof updatePoiListUI === 'function') {
    updatePoiListUI();
  }
  if (typeof renderCorridorNodeTable === 'function') {
    renderCorridorNodeTable();
  }

  // 6. Redraw Mission / Map
  if (centerMarker) {
    const activeL = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
    if (activeL && activeL.pattern === 'road-following') {
      if (typeof updateGrid === 'function') updateGrid();
    } else {
      if (typeof redrawCurrentMission === 'function') redrawCurrentMission();
    }
  } else {
    if (flightPathPolyline && typeof flightPathPolyline.clearLayers === 'function') flightPathPolyline.clearLayers();
    if (roadPathGroup && typeof roadPathGroup.clearLayers === 'function') roadPathGroup.clearLayers();
    if (targetPolygonGroup && typeof targetPolygonGroup.clearLayers === 'function') targetPolygonGroup.clearLayers();
    if (gridBoundsPolygon && map && map.hasLayer(gridBoundsPolygon)) {
      map.removeLayer(gridBoundsPolygon);
      gridBoundsPolygon = null;
    }
    if (waypointMarkersGroup && typeof waypointMarkersGroup.clearLayers === 'function') waypointMarkersGroup.clearLayers();
    if (pitchLabelsGroup && typeof pitchLabelsGroup.clearLayers === 'function') pitchLabelsGroup.clearLayers();
    if (photoMarkersGroup && typeof photoMarkersGroup.clearLayers === 'function') photoMarkersGroup.clearLayers();
    if (typeof updateStatsPanel === 'function') updateStatsPanel(null);
  }
}

function undoLastAction() {
  if (!undoHistoryStack || undoHistoryStack.length === 0) {
    return false;
  }
  const snapshot = undoHistoryStack.pop();
  if (!snapshot) return false;

  // Capture current state before restoring so redo can return here
  const currentSnapshot = createMissionSnapshot(snapshot.actionLabel);
  redoHistoryStack.push(currentSnapshot);
  if (redoHistoryStack.length > MAX_UNDO_HISTORY) {
    redoHistoryStack.shift();
  }

  isRestoringUndoState = true;
  try {
    restoreMissionSnapshot(snapshot);
    updateUndoUiState();
    showUndoToast(`↩️ Undid: ${snapshot.actionLabel || 'Action'}`);
    return true;
  } finally {
    isRestoringUndoState = false;
  }
}

function redoLastAction() {
  if (!redoHistoryStack || redoHistoryStack.length === 0) {
    return false;
  }
  const snapshot = redoHistoryStack.pop();
  if (!snapshot) return false;

  // Capture current state before restoring so undo can return here
  const currentSnapshot = createMissionSnapshot(snapshot.actionLabel);
  undoHistoryStack.push(currentSnapshot);
  if (undoHistoryStack.length > MAX_UNDO_HISTORY) {
    undoHistoryStack.shift();
  }

  isRestoringUndoState = true;
  try {
    restoreMissionSnapshot(snapshot);
    updateUndoUiState();
    showUndoToast(`↪️ Redid: ${snapshot.actionLabel || 'Action'}`);
    return true;
  } finally {
    isRestoringUndoState = false;
  }
}

if (typeof window !== 'undefined') {
  window.undoLastAction = undoLastAction;
  window.redoLastAction = redoLastAction;
  window.pushUndoSnapshot = pushUndoSnapshot;
  window.updateUndoUiState = updateUndoUiState;
  window.undoHistoryStack = undoHistoryStack;
  window.redoHistoryStack = redoHistoryStack;
}
