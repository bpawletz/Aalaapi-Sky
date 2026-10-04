let map;
let centerMarker = null;
let pois = []; // Array of POI objects: { lat, lon, marker, name }
let flightPathPolyline = null;
let gridBoundsPolygon = null;
let waypointMarkersGroup = null;
let pitchLabelsGroup = null; // Separate layer for pitch labels — avoids ghost-dot artifacts in marker pane during zoom
let photoMarkersGroup = null;
let photoInspectionGroup = null;
let activeInspectionManifest = null;
let exclusionZonesGroup = null;
let boundaryLayersGroup = null;
let fiducialMarkersGroup = null;
let targetPolygonGroup = null;
let isTargetPolyEditActive = false;
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
// 🎯 Fiducial Markers & Ground Control Points (GCPs) Engine (v1.104.0)
// ============================================================================

/**
 * Predefined dictionary data for ArUco 4x4 (first 50 markers from OpenCV DICT_4X4_1000_BYTES)
 * Each pair represents 2 bytes (16 bits, 4x4 grid in row-major order).
 */
