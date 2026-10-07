function localToGeodetic(x, y, centerLat, centerLon, rotationDeg) {
  rotationDeg = rotationDeg || 0;
  const alpha = (rotationDeg * Math.PI) / 180.0;
  
  // Rotate local coordinates
  const dx = x * Math.cos(alpha) - y * Math.sin(alpha);
  const dy = x * Math.sin(alpha) + y * Math.cos(alpha);

  // Earth Radius
  const R = 6378137.0;

  const latOffset = (dy / R) * (180.0 / Math.PI);
  const lonOffset = ((dx / R) * (180.0 / Math.PI)) / Math.cos((centerLat * Math.PI) / 180.0);

  return {
    lat: centerLat + latOffset,
    lon: centerLon + lonOffset,
    x: x, // Retain original local meters
    y: y
  };
}

// Calculate the default path-following heading for a waypoint
function getDefaultHeading(idx, waypoints, rotationDeg) {
  if (!waypoints || !Array.isArray(waypoints) || waypoints.length === 0) return 0;
  if (waypoints && waypoints[idx]) {
    const wp = waypoints[idx];
    if (wp.heading !== null && wp.heading !== undefined && !isNaN(wp.heading)) {
      return ((wp.heading % 360) + 360) % 360;
    }
  }
  let heading = 0;
  if (idx < waypoints.length - 1) {
    const nextWp = waypoints[idx + 1];
    heading = Math.atan2(nextWp.x - waypoints[idx].x, nextWp.y - waypoints[idx].y) * (180.0 / Math.PI) + rotationDeg;
  } else if (idx > 0) {
    const prevWp = waypoints[idx - 1];
    heading = Math.atan2(waypoints[idx].x - prevWp.x, waypoints[idx].y - prevWp.y) * (180.0 / Math.PI) + rotationDeg;
  }
  if (heading < 0) heading += 360;
  return heading % 360;
}

// Generate Leaflet divIcon with color and rotation logic
function getMarkerIcon(wp, idx, waypoints, rotationDeg, tempHeading, tempPitch, isTempModified) {
  const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
  const wpLayer = (wp && wp.layerId && typeof flightLayers !== 'undefined') ? flightLayers.find(l => l.id === wp.layerId) : activeLayer;
  const gridType = (wp && wp.layerPattern)
    ? wp.layerPattern
    : ((typeof document !== 'undefined' && document && document.getElementById && document.getElementById('grid-type'))
      ? document.getElementById('grid-type').value
      : (wpLayer ? wpLayer.pattern : 'double'));

  if (wp && (wp.isPhotoSphere || wp.layerPattern === 'photo-sphere' || gridType === 'photo-sphere')) {
    return L.divIcon({
      className: 'custom-wp-marker photo-sphere-marker',
      html: `
        <div style="background: linear-gradient(135deg, #06b6d4, #2563eb); border: 2px solid #ffffff; width: 28px; height: 28px; border-radius: 50%; box-shadow: 0 0 10px rgba(6, 182, 212, 0.6); display: flex; align-items: center; justify-content: center; font-size: 14px; cursor: pointer;">
          🌐
        </div>
      `,
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });
  }

  const isMultiOrbit = gridType === 'multi-orbit';
  const isCombo = gridType === 'grid-orbit-combo';
  const isMultiCombo = gridType === 'grid-multi-orbit-combo';
  const defaultGimbalPitch = (typeof document !== 'undefined' && document && document.getElementById && document.getElementById('gimbal-pitch'))
    ? parseGimbalPitch(document.getElementById('gimbal-pitch').value, (activeLayer && activeLayer.gimbalPitch !== undefined ? activeLayer.gimbalPitch : -60))
    : (activeLayer && activeLayer.gimbalPitch !== undefined ? activeLayer.gimbalPitch : -60);

  const isModified = isTempModified || wp.isModified;
  const isStart = idx === 0;
  const isEnd = idx === waypoints.length - 1;

  const isSkipped = (wp.skipPhoto === true);

  let color = wp.layerColor || '#06b6d4'; // default cyan or layer color
  if (isModified) {
    color = '#ec4899'; // Hot pink for modified waypoints
  } else if (isStart) {
    color = '#10b981'; // Emerald Green for starting point
  } else if (isSkipped) {
    color = '#64748b'; // Muted slate gray for transit-only waypoints where photo is skipped
  } else if (wp.isTransition) {
    color = '#a855f7'; // Purple for transition points
  } else if (isMultiOrbit || isCombo || isMultiCombo || importedWaypoints) {
    if (wp.ringIndex === 0) color = '#a855f7';
    else if (wp.ringIndex === 1) color = '#06b6d4';
    else if (wp.ringIndex === 2) color = '#f59e0b';
    else if (wp.ringIndex === 3) color = '#3b82f6';
  }

  const radius = isStart || isEnd ? 6 : (isSkipped ? 3.5 : 4);
  const borderWeight = isStart || isEnd ? 2 : 1;
  const borderColor = isStart ? '#10b981' : (isEnd ? '#ef4444' : (isSkipped ? '#94a3b8' : '#ffffff'));

  // Heading calculation
  const rot = (rotationDeg !== undefined && rotationDeg !== null && !isNaN(rotationDeg))
    ? rotationDeg
    : ((typeof document !== 'undefined' && document && document.getElementById && document.getElementById('grid-rotation'))
      ? parseFloat(document.getElementById('grid-rotation').value) || 0
      : 0);
  const heading = getEffectiveWaypointHeading(wp, idx, waypoints, rot, tempHeading, wpLayer);

  // Pitch calculation
  const pitch = tempPitch !== undefined && tempPitch !== null ? tempPitch : (wp.pitch !== undefined && wp.pitch !== null ? wp.pitch : defaultGimbalPitch);

  const activePalette = (typeof getActiveCameraPalette === 'function') ? getActiveCameraPalette() : null;
  const conesEnabled = (typeof isCameraConeEnabled === 'function') ? isCameraConeEnabled() : true;

  let coneColor = (activePalette && activePalette.coneColor) ? activePalette.coneColor : 'rgba(245, 158, 11, 0.38)';
  if (isModified) {
    coneColor = 'rgba(236, 72, 153, 0.38)'; // Pink cone
  } else if (!activePalette || activePalette.id === 'classic-cyan') {
    if (isMultiOrbit || isCombo || isMultiCombo) {
      if (wp.ringIndex === 0) coneColor = 'rgba(168, 85, 247, 0.35)';
      else if (wp.ringIndex === 1) coneColor = 'rgba(6, 182, 212, 0.35)';
      else if (wp.ringIndex === 2) coneColor = 'rgba(245, 158, 11, 0.35)';
      else if (wp.ringIndex === 3) coneColor = 'rgba(59, 130, 246, 0.35)';
    } else {
      coneColor = 'rgba(6, 182, 212, 0.35)';
    }
  }

  const showCone = !isSkipped && conesEnabled;
  const coneHtml = showCone
    ? `<div class="wp-camera-cone" style="border-top-color: ${coneColor};"></div>`
    : '';

  let arrowColor = color;
  if (isModified) {
    arrowColor = '#ec4899';
  } else if (activePalette && activePalette.arrowColor) {
    arrowColor = activePalette.arrowColor;
  }

  const arrowStyle = isSkipped
    ? `border-bottom-color: #64748b; opacity: 0.5;`
    : `border-bottom-color: ${arrowColor};`;
  const dotHtml = isSkipped
    ? `<div class="wp-dot wp-dot-skipped" style="background-color: ${color}; border-color: ${borderColor}; width: ${radius * 2}px; height: ${radius * 2}px; border-width: ${borderWeight}px; border-style: dashed;"></div>`
    : `<div class="wp-dot" style="background-color: ${color}; border-color: ${borderColor}; width: ${radius * 2}px; height: ${radius * 2}px; border-width: ${borderWeight}px;"></div>`;
  const displayPitch = (typeof pitch === 'number' && !isNaN(pitch))
    ? Math.round(pitch)
    : (pitch !== undefined && pitch !== null ? (isNaN(parseFloat(pitch)) ? pitch : Math.round(parseFloat(pitch))) : defaultGimbalPitch);
  const normalizedHeading = (typeof heading === 'number' && !isNaN(heading))
    ? (((heading % 360) + 360) % 360)
    : 0;
  // If camera/arrow points southward (into lower hemisphere 75°–285°), anchor pitch badge above dot (North)
  // so it never covers or collides with the downward-pointing camera cone and directional arrow.
  const posClass = (normalizedHeading >= 75 && normalizedHeading <= 285)
    ? 'wp-pitch-pos-top'
    : 'wp-pitch-pos-bottom';
  const pitchHtml = isSkipped
    ? `<div class="wp-pitch-label wp-pitch-skipped ${posClass}" style="opacity: 0.55;">${displayPitch}°</div>`
    : `<div class="wp-pitch-label ${posClass}">${displayPitch}°</div>`;
  const markerClass = isSkipped ? 'custom-wp-marker wp-marker-skipped' : 'custom-wp-marker';

  return L.divIcon({
    className: markerClass,
    html: `
      <div class="wp-marker-wrapper" style="transform: rotate(${heading}deg);">
        ${coneHtml}
        <div class="wp-arrow" style="${arrowStyle}"></div>
      </div>
      <div class="wp-static-container">
        ${dotHtml}
        ${pitchHtml}
      </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });
}

// Draw flight path lines segment by segment (highlighting >100m in dashed red)
function drawFlightPathLines(waypoints, gridType) {
  if (typeof L === 'undefined' || !L || !flightPathPolyline) return;
  if (flightPathPolyline.clearLayers) flightPathPolyline.clearLayers();
  if (!waypoints || waypoints.length < 2) return;

  const importedWaypoints = !!importedFileName;

  // If imported, draw the original raw path as a faint gray background line first
  if (importedWaypoints) {
    const fullPath = waypoints.map(w => [w.lat, w.lon]);
    L.polyline(fullPath, {
      color: '#94a3b8',
      weight: 2,
      opacity: 0.4,
      dashArray: '4, 4',
      interactive: false
    }).addTo(flightPathPolyline);
  }

  const activePalette = (typeof getActiveCameraPalette === 'function') ? getActiveCameraPalette() : null;
  const defaultPathColor = (activePalette && activePalette.pathColor) ? activePalette.pathColor : '#06b6d4';

  // Draw segment by segment to color-code warnings
  for (let i = 1; i < waypoints.length; i++) {
    const p1 = waypoints[i - 1];
    const p2 = waypoints[i];
    const latlngs = [[p1.lat, p1.lon], [p2.lat, p2.lon]];
    const dist = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
    if (dist < 0.001) continue;

    let color = p2.layerColor || defaultPathColor;
    let dashArray = null;
    let weight = 3.5;
    let opacity = 0.85;

    if (p2.isTransition || p1.isTransition || (p1.layerId && p2.layerId && p1.layerId !== p2.layerId)) {
      color = '#a855f7'; // Purple transition vector
      dashArray = '6, 6';
      weight = 3.5;
      opacity = 0.9;
    } else if (dist > 100.0) {
      color = '#ef4444'; // Red warning
      dashArray = '5, 5'; // Dashed segment
      weight = 4.5;
      opacity = 0.95;
    } else if (gridType === 'multi-orbit' || gridType === 'grid-orbit-combo' || gridType === 'grid-multi-orbit-combo' || importedWaypoints) {
      const ringIdx = p2.ringIndex;
      if (ringIdx === 0) color = '#a855f7';      // Violet (High / Orbit)
      else if (ringIdx === 1) color = '#06b6d4'; // Cyan (Medium / Orbit)
      else if (ringIdx === 2) color = '#f59e0b'; // Amber (Low)
      else if (ringIdx === 3) color = '#3b82f6'; // Blue (Grid in 3D combo)
    }

    L.polyline(latlngs, {
      color: color,
      weight: weight,
      opacity: opacity,
      dashArray: dashArray,
      className: (dist > 100.0 || p2.isTransition) ? '' : 'flight-path-line',
      interactive: false
    }).addTo(flightPathPolyline);
  }
}

function drawExclusionZones(globalCenterLat, globalCenterLon) {
  if (!exclusionZonesGroup || typeof L === 'undefined' || !map) return;
  exclusionZonesGroup.clearLayers();

  const enabledZones = flightLayers.filter(l => l.enabled && (l.pattern === 'exclusion-box' || l.pattern === 'exclusion-freeform' || l.isExclusionZone));

  enabledZones.forEach(zone => {
    const centerLat = (zone.centerLat !== undefined && zone.centerLat !== null) ? zone.centerLat : globalCenterLat;
    const centerLon = (zone.centerLon !== undefined && zone.centerLon !== null) ? zone.centerLon : globalCenterLon;
    const isBox = zone.pattern === 'exclusion-box';
    const isPoly = zone.pattern === 'exclusion-freeform';
    const zeroFormatted = (typeof formatDistance === 'function') ? formatDistance(0) : '0m';
    const altLabel = (zone.allAltitudes !== false)
      ? `All Altitudes (${zeroFormatted} – ∞)`
      : `${formatDistance(zone.minAltitude || 0)} – ${formatDistance(zone.maxAltitude || 60)}`;
    const tooltipText = `🚫 <strong>${escapeHtml(zone.name)}</strong><br>3D Envelope: ${altLabel}${zone.filteredCount ? `<br>Blocked: ${zone.filteredCount} waypoints` : ''}`;

    if (isBox) {
      const halfW = (zone.gridWidth !== undefined ? zone.gridWidth : 100) / 2.0;
      const halfH = (zone.gridHeight !== undefined ? zone.gridHeight : 100) / 2.0;
      const rotDeg = zone.gridRotation !== undefined ? zone.gridRotation : 0;
      const corners = [
        localToGeodetic(-halfW, halfH, centerLat, centerLon, rotDeg),
        localToGeodetic(halfW, halfH, centerLat, centerLon, rotDeg),
        localToGeodetic(halfW, -halfH, centerLat, centerLon, rotDeg),
        localToGeodetic(-halfW, -halfH, centerLat, centerLon, rotDeg)
      ];
      const latlngs = corners.map(c => [c.lat, c.lon]);

      const poly = L.polygon(latlngs, {
        color: '#ef4444',
        weight: 2.5,
        dashArray: '6, 6',
        fillColor: '#ef4444',
        fillOpacity: 0.22,
        className: 'exclusion-zone-polygon'
      }).addTo(exclusionZonesGroup);

      poly.bindTooltip(tooltipText, { direction: 'center', permanent: false });

    } else if (isPoly) {
      const vertices = (zone.freeformWaypoints && zone.freeformWaypoints.length > 0)
        ? zone.freeformWaypoints
        : (zone.polygonVertices && zone.polygonVertices.length > 0 ? zone.polygonVertices : []);

      let exclusionPoly = null;
      if (vertices.length >= 3) {
        const latlngs = vertices.map(v => [v.lat, v.lon]);
        exclusionPoly = L.polygon(latlngs, {
          color: '#ef4444',
          weight: 2.5,
          dashArray: '6, 6',
          fillColor: '#ef4444',
          fillOpacity: 0.22,
          className: 'exclusion-zone-polygon'
        }).addTo(exclusionZonesGroup);

        exclusionPoly.bindTooltip(tooltipText, { direction: 'center', permanent: false });
      } else if (vertices.length === 2) {
        const latlngs = vertices.map(v => [v.lat, v.lon]);
        exclusionPoly = L.polyline(latlngs, {
          color: '#ef4444',
          weight: 2,
          dashArray: '4, 4',
          opacity: 0.7
        }).addTo(exclusionZonesGroup);
      }

      // Render draggable vertex handles if this zone is the active layer
      if (zone.id === activeLayerId) {
        vertices.forEach((v, vIdx) => {
          const nodeIcon = L.divIcon({
            className: 'exclusion-node-icon-wrapper',
            html: `<div class="exclusion-node-icon" title="Exclusion Vertex ${vIdx + 1} (Drag to move, click to remove)">${vIdx + 1}</div>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10]
          });

          const nodeMarker = L.marker([v.lat, v.lon], {
            icon: nodeIcon,
            draggable: true
          }).addTo(exclusionZonesGroup);

          nodeMarker.on('drag', (e) => {
            const newLatLng = e.target.getLatLng();
            const offsets = geodeticToLocal(newLatLng.lat, newLatLng.lng, centerLat, centerLon);
            v.lat = newLatLng.lat;
            v.lon = newLatLng.lng;
            v.x = offsets.x;
            v.y = offsets.y;
            if (exclusionPoly && typeof exclusionPoly.setLatLngs === 'function') {
              exclusionPoly.setLatLngs(vertices.map(pt => [pt.lat, pt.lon]));
            }
          });

          nodeMarker.on('dragend', () => {
            updateGrid();
          });

          nodeMarker.on('click', (e) => {
            if (e.originalEvent && e.originalEvent.stopPropagation) e.originalEvent.stopPropagation();
            if (zone.freeformWaypoints) zone.freeformWaypoints.splice(vIdx, 1);
            if (zone.polygonVertices) zone.polygonVertices.splice(vIdx, 1);
            updateGrid();
          });
        });
      }
    }
  });
}

function addTargetPolygonPoint(lat, lng) {
  const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
  if (!activeLayer) return;
  if (!activeLayer.targetPoly) activeLayer.targetPoly = [];

  // If no center marker exists yet, place one at this first click so updateGrid() won't bail out early
  if (typeof centerMarker === 'undefined' || !centerMarker) {
    setGridCenter(lat, lng);
  }

  const cLat = (activeLayer.centerLat !== undefined && activeLayer.centerLat !== null) ? activeLayer.centerLat : lat;
  const cLon = (activeLayer.centerLon !== undefined && activeLayer.centerLon !== null) ? activeLayer.centerLon : lng;
  const offsets = geodeticToLocal(lat, lng, cLat, cLon);
  activeLayer.targetPoly.push({ lat: lat, lon: lng, x: offsets.x, y: offsets.y });
  activeLayer.targetMode = 'polygon';

  recomputeTargetPolygonCentroid(activeLayer);
  if (activeLayer.targetAutoDimensions !== false) {
    applyTargetSplatAutoDimensions(activeLayer);
  }
  setTargetPolyEditMode(true);
  updateGrid();
}

function recomputeTargetPolygonCentroid(activeLayer) {
  if (!activeLayer || !activeLayer.targetPoly || activeLayer.targetPoly.length < 3) return;
  let sumLat = 0, sumLon = 0;
  activeLayer.targetPoly.forEach(p => {
    sumLat += p.lat;
    sumLon += p.lon;
  });
  const avgLat = sumLat / activeLayer.targetPoly.length;
  const avgLon = sumLon / activeLayer.targetPoly.length;
  activeLayer.centerLat = avgLat;
  activeLayer.centerLon = avgLon;
  // Recompute offsets relative to the new centroid
  activeLayer.targetPoly.forEach(p => {
    const off = geodeticToLocal(p.lat, p.lon, avgLat, avgLon);
    p.x = off.x;
    p.y = off.y;
  });
  if (typeof centerLat !== 'undefined' && typeof centerLon !== 'undefined') {
    centerLat = avgLat;
    centerLon = avgLon;
  }
}

function drawTargetSplatOverlay(layer, centerLat, centerLon, rotationDeg) {
  if (!targetPolygonGroup || typeof map === 'undefined' || !map) return;
  const targetMode = layer.targetMode || 'polygon';
  const targetRadius = (layer.targetRadius > 0) ? layer.targetRadius : 25;
  const targetHeight = (layer.targetHeight !== undefined && layer.targetHeight !== null) ? layer.targetHeight : 8;

  const dimCheck = (typeof checkTargetSplatDimensionSufficiency === 'function')
    ? checkTargetSplatDimensionSufficiency(layer)
    : { isUndersized: false, isCritical: false };
  const overlayColor = dimCheck.isCritical ? '#ef4444' : (dimCheck.isUndersized ? '#f59e0b' : '#10b981');
  const dimStatusSuffix = dimCheck.isCritical
    ? ' — 🚨 CRITICAL: Survey grid smaller than target object!'
    : (dimCheck.isUndersized ? ' — ⚠️ CAUTION: Survey grid undersized for camera standoff' : '');

  if (targetMode === 'radius') {
    const circle = L.circle([centerLat, centerLon], {
      radius: targetRadius,
      color: overlayColor,
      weight: 2.5,
      dashArray: '6, 6',
      fillColor: overlayColor,
      fillOpacity: 0.15
    }).addTo(targetPolygonGroup);
    circle.bindTooltip(`🎯 Target Object (Radius: ${targetRadius}m, Height: ${targetHeight}m)${dimStatusSuffix}`, { direction: 'center', permanent: false });

  } else {
    // Polygon Mode
    const vertices = layer.targetPoly || [];
    let poly = null;
    let polyline = null;
    if (vertices.length >= 3) {
      const latlngs = vertices.map(v => [v.lat, v.lon]);
      poly = L.polygon(latlngs, {
        color: overlayColor,
        weight: 2.5,
        dashArray: '6, 6',
        fillColor: overlayColor,
        fillOpacity: 0.18
      }).addTo(targetPolygonGroup);
      poly.bindTooltip(`🎯 Target House Polygon (${vertices.length} vertices, Roof Height: ${targetHeight}m)${dimStatusSuffix}`, { direction: 'center', permanent: false });
    } else if (vertices.length === 2) {
      const latlngs = vertices.map(v => [v.lat, v.lon]);
      polyline = L.polyline(latlngs, {
        color: overlayColor,
        weight: 2.5,
        dashArray: '4, 4'
      }).addTo(targetPolygonGroup);
    } else if (vertices.length === 0 && !isTargetPolyEditActive) {
      // Show default circular envelope placeholder only if not actively tracing
      const circle = L.circle([centerLat, centerLon], {
        radius: targetRadius,
        color: overlayColor,
        weight: 2,
        dashArray: '4, 4',
        fillColor: overlayColor,
        fillOpacity: 0.08
      }).addTo(targetPolygonGroup);
      circle.bindTooltip(`🎯 Target Envelope (${targetRadius}m - Click 'Edit Target Polygon' to trace house)${dimStatusSuffix}`, { direction: 'center', permanent: false });
    }

    // Draw Perimeter Orbit ring preview (amber dashed) when enabled (v1.77.4)
    let orbitPolyline = null;
    const updateOrbitPreview = () => {
      if (!layer.targetPerimeterPass) return;
      const localTargetPoly = getLocalTargetPolygon(layer, centerLat, centerLon, rotationDeg);
      const centroidX = localTargetPoly.length ? localTargetPoly.reduce((s, v) => s + v.x, 0) / localTargetPoly.length : 0;
      const centroidY = localTargetPoly.length ? localTargetPoly.reduce((s, v) => s + v.y, 0) / localTargetPoly.length : 0;
      const standoff = parseFloat(layer.targetPerimeterStandoff) || 8;

      let offsetPoly = [];
      if (localTargetPoly.length >= 3) {
        offsetPoly = localTargetPoly.map(v => {
          const dx = v.x - centroidX, dy = v.y - centroidY;
          const dist = Math.hypot(dx, dy);
          if (dist < 0.001) return { x: v.x + standoff, y: v.y };
          return { x: v.x + (dx / dist) * standoff, y: v.y + (dy / dist) * standoff };
        });
      } else {
        const r = (layer.targetRadius || 25) + standoff;
        const nPts = Math.max(16, Math.round((2 * Math.PI * r) / 3));
        for (let i = 0; i < nPts; i++) {
          const theta = (i / nPts) * 2 * Math.PI;
          offsetPoly.push({ x: centroidX + r * Math.cos(theta), y: centroidY + r * Math.sin(theta) });
        }
      }

      if (offsetPoly.length >= 2) {
        const R = 6378137.0;
        const cosLat = Math.cos(centerLat * Math.PI / 180.0);
        const orbitLatLngs = offsetPoly.map(pt => {
          const rotRad = (rotationDeg || 0) * Math.PI / 180.0;
          const rx = pt.x * Math.cos(rotRad) - pt.y * Math.sin(rotRad);
          const ry = pt.x * Math.sin(rotRad) + pt.y * Math.cos(rotRad);
          const lat = centerLat + (ry / R) * (180.0 / Math.PI);
          const lon = centerLon + ((rx / R) * (180.0 / Math.PI)) / cosLat;
          return [lat, lon];
        });
        orbitLatLngs.push(orbitLatLngs[0]); // Close ring
        if (orbitPolyline && typeof orbitPolyline.setLatLngs === 'function') {
          orbitPolyline.setLatLngs(orbitLatLngs);
        } else {
          orbitPolyline = L.polyline(orbitLatLngs, {
            color: '#f59e0b',
            weight: 2,
            dashArray: '6, 5',
            opacity: 0.85
          }).addTo(targetPolygonGroup).bindTooltip('🔄 Perimeter Orbit Path', { direction: 'top', sticky: true });
        }
      }
    };

    updateOrbitPreview();

    // Render numbered draggable vertex markers for all vertices (1, 2, 3...)
    vertices.forEach((v, vIdx) => {
      const nodeIcon = L.divIcon({
        className: 'target-poly-node-icon-wrapper',
        html: `<div class="target-poly-node-icon" style="width: 22px; height: 22px; background: #10b981; color: white; border: 2px solid white; border-radius: 50%; box-shadow: 0 2px 6px rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; cursor: grab;" title="Target Corner ${vIdx + 1} (Drag to adjust, click to remove)">${vIdx + 1}</div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11]
      });

      const nodeMarker = L.marker([v.lat, v.lon], {
        icon: nodeIcon,
        draggable: true
      }).addTo(targetPolygonGroup);

      nodeMarker.on('drag', (e) => {
        const newLatLng = e.target.getLatLng();
        const offsets = geodeticToLocal(newLatLng.lat, newLatLng.lng, centerLat, centerLon);
        v.lat = newLatLng.lat;
        v.lon = newLatLng.lng;
        v.x = offsets.x;
        v.y = offsets.y;
        if (poly && typeof poly.setLatLngs === 'function') {
          poly.setLatLngs(vertices.map(pt => [pt.lat, pt.lon]));
        } else if (polyline && typeof polyline.setLatLngs === 'function') {
          polyline.setLatLngs(vertices.map(pt => [pt.lat, pt.lon]));
        }
        updateOrbitPreview();
      });

      nodeMarker.on('dragend', () => {
        recomputeTargetPolygonCentroid(layer);
        if (layer.targetAutoDimensions !== false) {
          applyTargetSplatAutoDimensions(layer);
        }
        updateGrid();
      });

      nodeMarker.on('click', (e) => {
        if (e.originalEvent && e.originalEvent.stopPropagation) e.originalEvent.stopPropagation();
        vertices.splice(vIdx, 1);
        recomputeTargetPolygonCentroid(layer);
        if (layer.targetAutoDimensions !== false) {
          applyTargetSplatAutoDimensions(layer);
        }
        setTargetPolyEditMode(isTargetPolyEditActive || vertices.length < 3);
        updateGrid();
      });
    });
  }

  updateTargetSplatAutoFitUI(layer);
  updateTargetSplatDiagram(layer);

  // Update saved photos pill in UI
  const savedPill = document.getElementById('target-splat-saved-pill');
  if (savedPill) {
    if (layer.targetPrunedCount && layer.targetPrunedCount > 0) {
      savedPill.textContent = `${layer.targetPrunedCount} pruned (${layer.targetSavedPercent || 0}% saved)`;
      savedPill.style.display = 'inline-block';
    } else {
      savedPill.style.display = 'none';
    }
  }
}

// Render bounding box, flight path, and markers on Leaflet
function drawFlightPath(waypoints, photoLocations, centerLat, centerLon, gridWidth, gridHeight, rotationDeg) {
  recalculateSplitStarts();
  if (typeof L === 'undefined' || !L || typeof map === 'undefined' || !map) return;
  // 1. Clear previous layers
  if (typeof map !== 'undefined' && map && typeof map.closePopup === 'function') {
    map.closePopup();
  }
  if (flightPathPolyline) flightPathPolyline.clearLayers();
  if (exclusionZonesGroup) exclusionZonesGroup.clearLayers();
  if (targetPolygonGroup) targetPolygonGroup.clearLayers();
  if (gridBoundsPolygon && map && typeof map.removeLayer === 'function') map.removeLayer(gridBoundsPolygon);
  if (waypointMarkersGroup) waypointMarkersGroup.clearLayers();
  if (pitchLabelsGroup) pitchLabelsGroup.clearLayers();
  if (photoMarkersGroup) photoMarkersGroup.clearLayers();
  if (roadPathGroup) roadPathGroup.clearLayers();
  if (boundaryLayersGroup) boundaryLayersGroup.clearLayers();
  if (fiducialMarkersGroup) fiducialMarkersGroup.clearLayers();

  // Draw 3D Exclusion Zones
  drawExclusionZones(centerLat, centerLon);

  // Draw Drawing & Parcel Boundary Layers (v1.102.0)
  if (typeof drawBoundaryLayers === 'function') {
    drawBoundaryLayers(centerLat, centerLon);
  }

  // Draw Survey Fiducial & Ground Control Point Layers (v1.104.0)
  if (typeof drawFiducialLayers === 'function') {
    drawFiducialLayers(centerLat, centerLon);
  }

  const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
  const gridType = (typeof document !== 'undefined' && document && document.getElementById && document.getElementById('grid-type'))
    ? document.getElementById('grid-type').value
    : (activeLayer ? activeLayer.pattern : 'double');
  const activeCenterLat = (activeLayer && activeLayer.centerLat !== null && activeLayer.centerLat !== undefined) ? activeLayer.centerLat : centerLat;
  const activeCenterLon = (activeLayer && activeLayer.centerLon !== null && activeLayer.centerLon !== undefined) ? activeLayer.centerLon : centerLon;

  // Draw Target Splat Object Boundary / Polygon Overlay
  if (activeLayer && activeLayer.pattern === 'target-splat') {
    drawTargetSplatOverlay(activeLayer, activeCenterLat, activeCenterLon, rotationDeg);
  }

  // When tracing target house polygon perimeter, hide flight path waypoints & cones so user can mark corners cleanly
  const isTargetTracingActive = (activeLayer && activeLayer.pattern === 'target-splat' && (
    isTargetPolyEditActive || (activeLayer.targetMode === 'polygon' && (!activeLayer.targetPoly || activeLayer.targetPoly.length < 3))
  ));

  if (isTargetTracingActive) {
    updateStatsPanel(null);
    return;
  }

  // If active layer is a pure drawing / parcel layer, update stats with null and return early
  if (activeLayer && (activeLayer.pattern === 'boundary-polygon' || activeLayer.isDrawingLayer)) {
    updateStatsPanel(null);
    return;
  }

  // 2. Draw boundary overlay
  if (activeLayer && Array.isArray(activeLayer.boundaryPolygon) && activeLayer.boundaryPolygon.length >= 2) {
    const polyColor = activeLayer.color || '#06b6d4';
    const latlngs = activeLayer.boundaryPolygon.map(p => [p.lat, p.lon]);
    if (typeof L !== 'undefined' && typeof L.polygon === 'function' && typeof map !== 'undefined' && map) {
      gridBoundsPolygon = L.polygon(latlngs, {
        color: polyColor,
        weight: 2.5,
        dashArray: '6, 6',
        fillColor: polyColor,
        fillOpacity: 0.10
      }).addTo(map);
    }
  } else if (waypoints.length === 0 || gridType === 'road-following' || gridType === 'freeform' || gridType === 'hyperlapse' || gridType === 'exclusion-box' || gridType === 'exclusion-freeform') {
    // No boundary overlay when no waypoints are active or for road-following/freeform/exclusion
  } else if (gridType === 'photo-sphere') {
    const sphereRadius = Math.max(8, (waypoints[0]?.alt || 30) * 0.4);
    if (typeof L !== 'undefined' && typeof L.circle === 'function' && typeof map !== 'undefined' && map) {
      gridBoundsPolygon = L.circle([activeCenterLat, activeCenterLon], {
        radius: sphereRadius,
        color: '#06b6d4',
        weight: 2,
        dashArray: '4, 4',
        fillColor: '#06b6d4',
        fillOpacity: 0.08
      }).addTo(map);
    }
  } else if (gridType === 'orbit' || gridType === 'multi-orbit' || gridType === 'grid-orbit-combo' || gridType === 'grid-multi-orbit-combo') {
    const maxRadius = (gridType === 'multi-orbit' || gridType === 'grid-multi-orbit-combo') ? gridWidth * 1.1 : gridWidth;
    if (typeof L !== 'undefined' && typeof L.circle === 'function' && typeof map !== 'undefined' && map) {
      gridBoundsPolygon = L.circle([activeCenterLat, activeCenterLon], {
        radius: maxRadius,
        color: '#f59e0b',
        weight: 2,
        dashArray: '5, 5',
        fillColor: '#f59e0b',
        fillOpacity: 0.03
      }).addTo(map);
    }
  } else if (gridType === 'tower') {
    const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
    const towerRad = activeLayer ? (activeLayer.towerRadius !== undefined ? Math.max(1, activeLayer.towerRadius) : 30) : 30;
    const guyBuf = activeLayer ? (activeLayer.towerGuyWireBuffer !== undefined ? Math.max(0, activeLayer.towerGuyWireBuffer) : 15) : 15;
    const effRadius = Math.max(1, towerRad + guyBuf);
    if (typeof L !== 'undefined' && typeof L.circle === 'function' && typeof map !== 'undefined' && map) {
      gridBoundsPolygon = L.circle([activeCenterLat, activeCenterLon], {
        radius: effRadius,
        color: '#f59e0b',
        weight: 2,
        dashArray: '4, 4',
        fillColor: '#f59e0b',
        fillOpacity: 0.04
      }).addTo(map);
    }
  } else {
    // Draw rotated bounding box
    const halfW = gridWidth / 2.0;
    const halfH = gridHeight / 2.0;
    const corners = [
      localToGeodetic(-halfW, halfH, activeCenterLat, activeCenterLon, rotationDeg), // TL
      localToGeodetic(halfW, halfH, activeCenterLat, activeCenterLon, rotationDeg),  // TR
      localToGeodetic(halfW, -halfH, activeCenterLat, activeCenterLon, rotationDeg), // BR
      localToGeodetic(-halfW, -halfH, activeCenterLat, activeCenterLon, rotationDeg) // BL
    ];
    
    const polygonLatLngs = corners.map(c => [c.lat, c.lon]);
    if (typeof L !== 'undefined' && L && typeof L.polygon === 'function' && typeof map !== 'undefined' && map) {
      gridBoundsPolygon = L.polygon(polygonLatLngs, {
        color: '#f59e0b',
        weight: 2,
        dashArray: '5, 5',
        fillColor: '#f59e0b',
        fillOpacity: 0.05
      }).addTo(map);
    }
  }

  // 3. Draw flight path line segments
  drawFlightPathLines(waypoints, gridType);

  // 4. Draw Road Paths & Road Nodes for all enabled road-following layers
  if (typeof flightLayers !== 'undefined' && Array.isArray(flightLayers)) {
    flightLayers.forEach(l => {
      if (l.enabled && l.pattern === 'road-following') {
        const roadNodes = (l.roadWaypoints && Array.isArray(l.roadWaypoints) && l.roadWaypoints.length > 0)
          ? l.roadWaypoints
          : (l.id === activeLayerId && Array.isArray(roadWaypoints) ? roadWaypoints : []);
        if (roadNodes && roadNodes.length > 0) {
          const isActive = (l.id === activeLayerId);
          const roadColor = l.color || '#f59e0b';
          const roadLatLngs = roadNodes.map(wp => [wp.lat, wp.lon]);
          L.polyline(roadLatLngs, {
            color: roadColor,
            weight: 3,
            dashArray: '6, 6',
            opacity: isActive ? 0.9 : 0.6,
            interactive: false
          }).addTo(roadPathGroup);

          roadNodes.forEach((wp, idx) => {
            const roadIcon = L.divIcon({
              className: 'road-waypoint-icon',
              html: `<div style="background-color: ${roadColor}; width: 18px; height: 18px; border-radius: 50%; border: 2px solid #ffffff; box-shadow: 0 0 6px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; font-size: 10px; color: white; font-weight: bold; cursor: ${isActive ? 'pointer' : 'default'};">${idx}</div>`,
              iconSize: [24, 24],
              iconAnchor: [12, 12]
            });

            const marker = L.marker([wp.lat, wp.lon], {
              icon: roadIcon,
              draggable: isActive
            });

            wp.roadMarker = marker;
            marker.bindTooltip(`${l.name} Road Node ${idx}`, { direction: 'top', offset: [0, -10] });

            if (isActive) {
              marker.on('dragstart', () => {
                if (typeof map !== 'undefined' && map && map.closePopup) map.closePopup();
                // Record originals on first drag so Revert works correctly
                if (wp.origLat === undefined || wp.origLat === null) {
                  wp.origLat = wp.lat;
                  wp.origLon = wp.lon;
                  wp.origX = wp.x;
                  wp.origY = wp.y;
                }
                wp.isModified = true;
              });

              marker.on('drag', (e) => {
                const newLatLng = e.target.getLatLng();
                const layerCenterLat = (l.centerLat !== undefined && l.centerLat !== null) ? l.centerLat : centerLat;
                const layerCenterLon = (l.centerLon !== undefined && l.centerLon !== null) ? l.centerLon : centerLon;
                const offsets = geodeticToLocal(newLatLng.lat, newLatLng.lng, layerCenterLat, layerCenterLon);
                wp.lat = newLatLng.lat;
                wp.lon = newLatLng.lng;
                wp.x = offsets.x;
                wp.y = offsets.y;
                wp.isModified = true;
                // Lightweight live update: only redraw the road path polyline, no full grid recalc
                if (roadPathGroup && l.roadWaypoints && l.roadWaypoints.length > 0) {
                  const updatedLatLngs = l.roadWaypoints.map(n => [n.lat, n.lon]);
                  roadPathGroup.eachLayer(layer => {
                    if (typeof layer.setLatLngs === 'function' && layer.getLatLngs) {
                      layer.setLatLngs(updatedLatLngs);
                    }
                  });
                }
              });

              marker.on('dragend', () => {
                // Full recalc once, after the user releases the marker
                updateGrid();
              });

              marker.on('click', (e) => {
                L.DomEvent.stopPropagation(e);
                marker.openPopup();
              });

              marker.bindPopup(() => {
                return createWaypointEditorDOM(wp, idx, marker);
              }, {
                className: 'wp-editor-leaflet-popup',
                maxWidth: 320,
                minWidth: 310,
                offset: [0, -20]
              });
            }

            marker.addTo(roadPathGroup);
          });
        }
      }
    });
  }

  // 5. Draw Waypoint Markers
  const gimbalPitch = (typeof document !== 'undefined' && document && document.getElementById && document.getElementById('gimbal-pitch'))
    ? parseGimbalPitch(document.getElementById('gimbal-pitch').value, (activeLayer && activeLayer.gimbalPitch !== undefined ? activeLayer.gimbalPitch : -60))
    : (activeLayer && activeLayer.gimbalPitch !== undefined ? activeLayer.gimbalPitch : -60);

  waypoints.forEach((wp, idx) => {
    const isPhotoSphere = wp.isPhotoSphere || wp.layerPattern === 'photo-sphere' || gridType === 'photo-sphere';
    if (isPhotoSphere && idx > 0) {
      wp.droneMarker = waypoints[0] ? waypoints[0].droneMarker : null;
      wp.mapMarker = waypoints[0] ? waypoints[0].mapMarker : null;
      return;
    }

    const isRoadWp = wp.isRoadDroneWaypoint || wp.layerPattern === 'road-following';

    if (isRoadWp) {
      const isStart = idx === 0;
      const isEnd = idx === waypoints.length - 1;
      const markerIcon = getMarkerIcon(wp, idx, waypoints, rotationDeg);

      let heading = (wp.heading !== null && wp.heading !== undefined) ? wp.heading : 0;
      const pitch = wp.pitch !== undefined && wp.pitch !== null ? wp.pitch : gimbalPitch;
      const displayPitch = (typeof pitch === 'number' && !isNaN(pitch)) ? Math.round(pitch) : pitch;
      const headingDisplay = (!isNaN(heading)) ? heading.toFixed(0) : '—';
      const tooltipContent = `${isStart ? "Road Start Point" : (isEnd ? "Road End Point" : `Road Waypoint ${idx}`)}<br>Height: ${formatDistance(wp.alt, 0)}<br>Yaw: ${headingDisplay}°<br>Pitch: ${displayPitch}°`;

      const droneMarker = L.marker([wp.lat, wp.lon], {
        icon: markerIcon,
        draggable: true
      });

      wp.droneMarker = droneMarker;
      wp.mapMarker = droneMarker;

      droneMarker.bindTooltip(tooltipContent, { direction: 'top', offset: [0, -10] });
      droneMarker.addTo(waypointMarkersGroup);

      droneMarker.on('dragstart', () => {
        bringMarkerToFront(droneMarker, idx);
        if (typeof map !== 'undefined' && map && map.closePopup) {
          map.closePopup();
        }
        if (wp.origLat === undefined || wp.origLat === null) {
          wp.origLat = wp.lat;
          wp.origLon = wp.lon;
          wp.origX = wp.x;
          wp.origY = wp.y;
        }
        wp.isModified = true;
      });

      droneMarker.on('drag', (e) => {
        const newLatLng = e.target.getLatLng();
        const layerCenterLat = (wp.layerId && flightLayers.find(l => l.id === wp.layerId)?.centerLat) || centerLat;
        const layerCenterLon = (wp.layerId && flightLayers.find(l => l.id === wp.layerId)?.centerLon) || centerLon;
        const offsets = geodeticToLocal(newLatLng.lat, newLatLng.lng, layerCenterLat, layerCenterLon);

        wp.lat = newLatLng.lat;
        wp.lon = newLatLng.lng;
        wp.x = offsets.x;
        wp.y = offsets.y;
        wp.isModified = true;

        const activePhotos = getCurrentPhotos();
        if (activePhotos && activePhotos[idx]) {
          activePhotos[idx].lat = newLatLng.lat;
          activePhotos[idx].lon = newLatLng.lng;
          activePhotos[idx].x = offsets.x;
          activePhotos[idx].y = offsets.y;
        }

        updatePathLinesAndStats(waypoints, photoLocations, centerLat, centerLon, gridWidth, gridHeight, rotationDeg);
      });

      droneMarker.on('dragend', () => {
        redrawCurrentMission();
        if (wp.mapMarker) bringMarkerToFront(wp.mapMarker, idx);
      });

      droneMarker.bindPopup(() => {
        return createWaypointEditorDOM(wp, idx, droneMarker);
      }, {
        className: 'wp-editor-leaflet-popup',
        maxWidth: 320,
        minWidth: 310,
        offset: [0, -20]
      });

      droneMarker.on('popupopen', () => bringMarkerToFront(droneMarker, idx));
      droneMarker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        const items = getOverlappingItemsAt(droneMarker.getLatLng());
        if (items.length > 1 && currentlySelectedMarker !== droneMarker) {
          openDisambiguationPopup(droneMarker.getLatLng(), items);
        } else {
          bringMarkerToFront(droneMarker, idx);
          droneMarker.openPopup();
        }
      });

    } else {
      // Standard waypoint marker rendering with directional icon, dragging, etc.
      const isStart = idx === 0;
      const isEnd = idx === waypoints.length - 1;
      const markerIcon = getMarkerIcon(wp, idx, waypoints, rotationDeg);

      const wpLayer = (wp.layerId && typeof flightLayers !== 'undefined') ? flightLayers.find(l => l.id === wp.layerId) : activeLayer;
      let heading = (wp.heading !== null && wp.heading !== undefined)
        ? wp.heading
        : getEffectiveWaypointHeading(wp, idx, waypoints, rotationDeg, null, wpLayer);

      const pitch = wp.pitch !== undefined && wp.pitch !== null ? wp.pitch : gimbalPitch;
      const displayPitch = (typeof pitch === 'number' && !isNaN(pitch)) ? Math.round(pitch) : pitch;
      let photoStatusHtml = '';
      if (wp.skipPhoto === true) {
        photoStatusHtml = '<br><span style="color: #94a3b8; font-weight: 600;">📷 Photo: Skipped (Transit Only)</span>';
      } else if (activeLayer && activeLayer.pattern === 'target-splat') {
        photoStatusHtml = '<br><span style="color: #10b981; font-weight: 600;">📷 Photo: Active (Target in View)</span>';
      }
      const title = isPhotoSphere
        ? `🌐 <strong>360° Photo Sphere</strong><br>37 Photos (Full Equirectangular Coverage)<br>Height: ${formatDistance(wp.alt, 0)}<br>Mode: Stop & Shoot`
        : `${isStart ? "Start Point" : (isEnd ? "End Point" : `Waypoint ${idx}`)}<br>Height: ${formatDistance(wp.alt, 0)}<br>Yaw: ${heading.toFixed(0)}°<br>Pitch: ${displayPitch}°${photoStatusHtml}`;

      const isDraggable = true;
      const marker = L.marker([wp.lat, wp.lon], {
        icon: markerIcon,
        draggable: isDraggable
      });

      marker.bindTooltip(title, { direction: 'top', offset: [0, -10] });

      if (isDraggable) {
        marker.on('dragstart', () => {
          bringMarkerToFront(marker, idx);
          if (typeof map !== 'undefined' && map && map.closePopup) {
            map.closePopup();
          }
          if (wp.origLat === undefined || wp.origLat === null) {
            wp.origLat = wp.lat;
            wp.origLon = wp.lon;
            wp.origX = wp.x;
            wp.origY = wp.y;
          }
          wp.isModified = true;
        });

        marker.on('drag', (e) => {
          const newLatLng = e.target.getLatLng();
          const layerCenterLat = (wp.layerId && flightLayers.find(l => l.id === wp.layerId)?.centerLat) || centerLat;
          const layerCenterLon = (wp.layerId && flightLayers.find(l => l.id === wp.layerId)?.centerLon) || centerLon;
          const offsets = geodeticToLocal(newLatLng.lat, newLatLng.lng, layerCenterLat, layerCenterLon);

          if (isPhotoSphere) {
            const activePhotos = getCurrentPhotos();
            waypoints.forEach((w, wIdx) => {
              w.lat = newLatLng.lat;
              w.lon = newLatLng.lng;
              w.x = offsets.x;
              w.y = offsets.y;
              w.isModified = true;
              if (activePhotos && activePhotos[wIdx]) {
                activePhotos[wIdx].lat = newLatLng.lat;
                activePhotos[wIdx].lon = newLatLng.lng;
                activePhotos[wIdx].x = offsets.x;
                activePhotos[wIdx].y = offsets.y;
              }
            });
          } else {
            wp.lat = newLatLng.lat;
            wp.lon = newLatLng.lng;
            wp.x = offsets.x;
            wp.y = offsets.y;
            wp.isModified = true;

            const activePhotos = getCurrentPhotos();
            if (activePhotos && activePhotos[idx]) {
              activePhotos[idx].lat = newLatLng.lat;
              activePhotos[idx].lon = newLatLng.lng;
              activePhotos[idx].x = offsets.x;
              activePhotos[idx].y = offsets.y;
            }
          }

          updatePathLinesAndStats(waypoints, photoLocations, centerLat, centerLon, gridWidth, gridHeight, rotationDeg);
        });

        marker.on('dragend', () => {
          redrawCurrentMission();
          if (wp.mapMarker) bringMarkerToFront(wp.mapMarker, idx);
        });
      }

      marker.bindPopup(() => {
        return createWaypointEditorDOM(wp, idx, marker);
      }, {
        className: 'wp-editor-leaflet-popup',
        maxWidth: 320,
        minWidth: 310,
        offset: [0, -20]
      });

      marker.on('popupopen', () => bringMarkerToFront(marker, idx));
      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        const items = getOverlappingItemsAt(marker.getLatLng());
        if (items.length > 1 && currentlySelectedMarker !== marker) {
          openDisambiguationPopup(marker.getLatLng(), items);
        } else {
          bringMarkerToFront(marker, idx);
          marker.openPopup();
        }
      });

      wp.mapMarker = marker;
      marker.addTo(waypointMarkersGroup);
    }
  });

  // 5. Draw Photo trigger markers (yellow dots) in continuous mode
  const captureMode = (typeof document !== 'undefined' && document && document.getElementById && document.getElementById('capture-mode'))
    ? document.getElementById('capture-mode').value
    : (activeLayer ? activeLayer.captureMode : 'stopAndShoot');
  if (captureMode === 'continuous') {
    photoLocations.forEach((pt, idx) => {
      L.circleMarker([pt.lat, pt.lon], {
        radius: 2,
        color: '#f59e0b',
        fillColor: '#f59e0b',
        fillOpacity: 0.7,
        weight: 0
      }).addTo(photoMarkersGroup);
    });
  }

  // Elevate active selected marker after redraw
  if (selectedWaypointIndex !== null && waypoints[selectedWaypointIndex] && waypoints[selectedWaypointIndex].mapMarker) {
    bringMarkerToFront(waypoints[selectedWaypointIndex].mapMarker, selectedWaypointIndex);
  }

  // 6. Update Map Legend
  updateMapLegend();
}

// Add Map Legend for Multi-Orbit altitudes
let mapLegend = null;
function updateMapLegend() {
  if (typeof map === 'undefined' || !map) return;
  if (mapLegend) {
    map.removeControl(mapLegend);
    mapLegend = null;
  }

  const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
  const gridType = (typeof document !== 'undefined' && document && document.getElementById && document.getElementById('grid-type'))
    ? document.getElementById('grid-type').value
    : (activeLayer ? activeLayer.pattern : 'double');

  if (importedWaypoints) {
    mapLegend = L.control({ position: 'bottomright' });
    mapLegend.onAdd = function () {
      const div = L.DomUtil.create('div', 'map-legend glass');
      L.DomEvent.disableClickPropagation(div);
      if (isLegendCollapsed) {
        div.classList.add('collapsed');
      }
      
      const uniqueAlts = [...new Set(importedWaypoints.map(w => w.alt))].sort((a, b) => b - a);
      
      const legendItems = [];
      uniqueAlts.forEach((alt, idx) => {
        let color = '#06b6d4'; // default cyan
        if (uniqueAlts.length > 1) {
          if (uniqueAlts.length === 4) {
            if (idx === 0) color = '#a855f7';
            else if (idx === 1) color = '#06b6d4';
            else if (idx === 2) color = '#f59e0b';
            else if (idx === 3) color = '#3b82f6';
          } else if (uniqueAlts.length === 3) {
            if (idx === 0) color = '#a855f7';
            else if (idx === 1) color = '#06b6d4';
            else if (idx === 2) color = '#f59e0b';
          } else if (uniqueAlts.length === 2) {
            color = idx === 0 ? '#a855f7' : '#06b6d4';
          } else {
            const colors = ['#a855f7', '#06b6d4', '#f59e0b', '#3b82f6'];
            color = colors[idx % 4];
          }
        }

        const itemDiv = document.createElement('div');
        itemDiv.className = 'legend-item';

        const colorSpan = document.createElement('span');
        colorSpan.className = 'legend-color';
        colorSpan.style.backgroundColor = color;

        const textNode = document.createTextNode(` Alt: ${formatDistance(alt, 1)}`);

        itemDiv.appendChild(colorSpan);
        itemDiv.appendChild(textNode);

        legendItems.push(itemDiv);
      });
      
      const headerDiv = document.createElement('div');
      headerDiv.className = 'legend-header';
      headerDiv.style.cssText = 'display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 8px;';

      const h4 = document.createElement('h4');
      h4.style.cssText = 'margin: 0; line-height: 1.2;';
      h4.textContent = "Imported Layers";
      headerDiv.appendChild(h4);

      const toggleBtn = document.createElement('button');
      toggleBtn.className = 'legend-toggle-btn';
      toggleBtn.type = 'button';
      toggleBtn.setAttribute('aria-label', 'Toggle legend details');
      toggleBtn.style.cssText = 'background: none; border: none; color: var(--text-muted); cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 2px; border-radius: 4px;';

      const svgNS = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(svgNS, "svg");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("width", "14");
      svg.setAttribute("height", "14");
      svg.setAttribute("fill", "none");
      svg.setAttribute("stroke", "currentColor");
      svg.setAttribute("stroke-width", "2.5");
      svg.setAttribute("stroke-linecap", "round");
      svg.setAttribute("stroke-linejoin", "round");
      svg.style.cssText = "transition: transform 0.3s ease;";

      const polyline = document.createElementNS(svgNS, "polyline");
      polyline.setAttribute("points", "6 9 12 15 18 9");
      svg.appendChild(polyline);

      toggleBtn.appendChild(svg);
      headerDiv.appendChild(toggleBtn);

      div.appendChild(headerDiv);

      const contentDiv = document.createElement('div');
      contentDiv.className = 'legend-content';
      contentDiv.style.cssText = 'transition: opacity 0.2s ease;';
      legendItems.forEach(item => contentDiv.appendChild(item));

      div.appendChild(contentDiv);
      
      // Bind toggle listener after inserting content
      setTimeout(() => {
        const toggleBtn = div.querySelector('.legend-toggle-btn');
        if (toggleBtn) {
          toggleBtn.addEventListener('click', () => {
            div.classList.toggle('collapsed');
            isLegendCollapsed = div.classList.contains('collapsed');
          });
        }
      }, 0);
      
      return div;
    };
    mapLegend.addTo(map);
    return;
  }

  const altitudeVal = (typeof document !== 'undefined' && document && document.getElementById && document.getElementById('altitude'))
    ? parseFloat(document.getElementById('altitude').value)
    : (activeLayer && activeLayer.altitude !== undefined ? activeLayer.altitude : 50);

  mapLegend = L.control({ position: 'bottomright' });

  mapLegend.onAdd = function () {
    const div = L.DomUtil.create('div', 'map-legend glass');
    L.DomEvent.disableClickPropagation(div);
    if (isLegendCollapsed) {
      div.classList.add('collapsed');
    }
    
    let title = "Altitude Layers";
    let itemsHtml = '';
    
    if (gridType === 'single') {
      title = "Mission Layers";
      itemsHtml = `
        <div class="legend-item"><span class="legend-color" style="background-color: #06b6d4;"></span> Nadir Grid (-90°): ${formatDistance(altitudeVal, 1)}</div>
      `;
    } else if (gridType === 'double') {
      title = "Mission Layers";
      itemsHtml = `
        <div class="legend-item"><span class="legend-color" style="background-color: #06b6d4;"></span> Double Grid: ${formatDistance(altitudeVal, 1)}</div>
      `;
    } else if (gridType === 'orbit') {
      title = "Altitude Layers";
      itemsHtml = `
        <div class="legend-item"><span class="legend-color" style="background-color: #06b6d4;"></span> Oblique Orbit: ${formatDistance(altitudeVal, 1)}</div>
      `;
    } else if (gridType === 'grid-orbit-combo') {
      title = "Mission Layers";
      itemsHtml = `
        <div class="legend-item"><span class="legend-color" style="background-color: #06b6d4;"></span> 1. Nadir Grid (-90°): ${formatDistance(altitudeVal, 1)}</div>
        <div class="legend-item"><span class="legend-color" style="background-color: #a855f7;"></span> 2. Oblique Orbit: ${formatDistance(altitudeVal, 1)}</div>
      `;
    } else if (gridType === 'grid-multi-orbit-combo') {
      title = "Mission Layers";
      itemsHtml = `
        <div class="legend-item"><span class="legend-color" style="background-color: #3b82f6;"></span> 1. Nadir Grid (-90°): ${formatDistance(altitudeVal, 1)}</div>
        <div class="legend-item"><span class="legend-color" style="background-color: #a855f7;"></span> 2. Orbit (High, -60°): ${formatDistance(altitudeVal * 1.2, 1)}</div>
        <div class="legend-item"><span class="legend-color" style="background-color: #06b6d4;"></span> 3. Orbit (Mid, -45°): ${formatDistance(altitudeVal * 1.0, 1)}</div>
        <div class="legend-item"><span class="legend-color" style="background-color: #f59e0b;"></span> 4. Orbit (Low, -30°): ${formatDistance(altitudeVal * 0.8, 1)}</div>
      `;
    } else if (gridType === 'freeform') {
      title = "Mission Layers";
      itemsHtml = `
        <div class="legend-item"><span class="legend-color" style="background-color: #06b6d4;"></span> Manual Waypoint</div>
      `;
    } else if (gridType === 'hyperlapse') {
      title = "Hyperlapse";
      itemsHtml = `
        <div class="legend-item"><span class="legend-color" style="background-color: #f59e0b;"></span> Route Waypoint</div>
        <div class="legend-item"><span class="legend-color" style="background-color: #f59e0b; border: 1px dashed rgba(255,255,255,0.6);"></span> Interval Photo Frame</div>
      `;
    } else if (gridType === 'road-following') {
      title = "Mission Layers";
      itemsHtml = `
        <div class="legend-item"><span class="legend-color" style="background-color: #f59e0b; border: 1px dashed rgba(255,255,255,0.4);"></span> Road Path</div>
        <div class="legend-item"><span class="legend-color" style="background-color: #06b6d4;"></span> Drone Path (Offset)</div>
      `;
    } else if (gridType === 'target-splat') {
      title = "Target Splat";
      itemsHtml = `
        <div class="legend-item"><span class="legend-color" style="background-color: #06b6d4;"></span> Photo Waypoint: ${formatDistance(altitudeVal, 1)}</div>
        <div class="legend-item"><span class="legend-color" style="background-color: #64748b; border: 1px dashed #94a3b8;"></span> Transit Waypoint (No Photo)</div>
        <div class="legend-item"><span class="legend-color" style="background-color: rgba(16, 185, 129, 0.4); border: 1px dashed #10b981;"></span> Target Object Boundary</div>
      `;
    } else if (gridType === 'photo-sphere') {
      title = "360° Pano Rings";
      const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
      let rings = (activeLayer && activeLayer.photoSphereRings) ? activeLayer.photoSphereRings : null;
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
      if (!rings) rings = { ring1: true, ring2: true, ring3: true, nadir: true };

      let ringsHtml = '';
      if (rings.ring1) {
        ringsHtml += `<div class="legend-item"><span class="legend-color" style="background-color: #38bdf8;"></span> Row 1 (-15°): 12 shots @ ${formatDistance(altitudeVal, 1)}</div>`;
      }
      if (rings.ring2) {
        ringsHtml += `<div class="legend-item"><span class="legend-color" style="background-color: #06b6d4;"></span> Row 2 (-45°): 12 shots @ ${formatDistance(altitudeVal, 1)}</div>`;
      }
      if (rings.ring3) {
        ringsHtml += `<div class="legend-item"><span class="legend-color" style="background-color: #f59e0b;"></span> Row 3 (-75°): 12 shots @ ${formatDistance(altitudeVal, 1)}</div>`;
      }
      if (rings.nadir) {
        ringsHtml += `<div class="legend-item"><span class="legend-color" style="background-color: #10b981;"></span> Nadir (-90°): 1 shot @ ${formatDistance(altitudeVal, 1)}</div>`;
      }
      if (!ringsHtml) {
        ringsHtml = `<div class="legend-item"><span class="legend-color" style="background-color: #38bdf8;"></span> Center Lock: ${formatDistance(altitudeVal, 1)}</div>`;
      }
      itemsHtml = ringsHtml;
    } else {
      title = "Altitude Layers";
      itemsHtml = `
        <div class="legend-item"><span class="legend-color" style="background-color: #a855f7;"></span> Ring 1 (High): ${formatDistance(altitudeVal * 1.2, 1)}</div>
        <div class="legend-item"><span class="legend-color" style="background-color: #06b6d4;"></span> Ring 2 (Mid): ${formatDistance(altitudeVal * 1.0, 1)}</div>
        <div class="legend-item"><span class="legend-color" style="background-color: #f59e0b;"></span> Ring 3 (Low): ${formatDistance(altitudeVal * 0.8, 1)}</div>
      `;
    }

    const headerDiv = document.createElement('div');
    headerDiv.className = 'legend-header';
    headerDiv.style.cssText = 'display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 8px;';

    const h4 = document.createElement('h4');
    h4.style.cssText = 'margin: 0; line-height: 1.2;';
    h4.textContent = title; // Safely set text content
    headerDiv.appendChild(h4);

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'legend-toggle-btn';
    toggleBtn.type = 'button';
    toggleBtn.setAttribute('aria-label', 'Toggle legend details');
    toggleBtn.style.cssText = 'background: none; border: none; color: var(--text-muted); cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 2px; border-radius: 4px;';

    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "14");
    svg.setAttribute("height", "14");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2.5");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.style.cssText = "transition: transform 0.3s ease;";

    const polyline = document.createElementNS(svgNS, "polyline");
    polyline.setAttribute("points", "6 9 12 15 18 9");
    svg.appendChild(polyline);

    toggleBtn.appendChild(svg);
    headerDiv.appendChild(toggleBtn);

    div.appendChild(headerDiv);

    const contentDiv = document.createElement('div');
    contentDiv.className = 'legend-content';
    contentDiv.style.cssText = 'transition: opacity 0.2s ease;';
    contentDiv.innerHTML = itemsHtml; // itemsHtml contains only internal HTML elements and numbers, so it's safe

    div.appendChild(contentDiv);

    // Bind toggle listener after inserting content
    setTimeout(() => {
      const toggleBtn = div.querySelector('.legend-toggle-btn');
      if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
          div.classList.toggle('collapsed');
          isLegendCollapsed = div.classList.contains('collapsed');
        });
      }
    }, 0);

    return div;
  };

  mapLegend.addTo(map);
}

// ── Airspace Legend ─────────────────────────────────────────────────────────
// Tracks which airspace overlays are currently visible so the legend can
// show/hide each section dynamically.
let airspaceLegendControl = null;
const airspaceActiveSet = new Set(); // stores layer-name strings

function initAirspaceLegend() {
  airspaceLegendControl = L.control({ position: 'bottomleft' });
  airspaceLegendControl.onAdd = function () {
    const div = L.DomUtil.create('div', 'map-legend glass airspace-legend');
    L.DomEvent.disableClickPropagation(div);
    div.id = 'airspace-legend-container';
    div.style.display = 'none'; // hidden until a layer is toggled on
    return div;
  };
  airspaceLegendControl.addTo(map);
}

function updateAirspaceLegend(e) {
  // Track which layers are on
  if (e) {
    if (e.type === 'overlayadd')    airspaceActiveSet.add(e.name);
    if (e.type === 'overlayremove') airspaceActiveSet.delete(e.name);
  }

  const container = document.getElementById('airspace-legend-container');
  if (!container) return;

  const overlayNames = [
    'VFR Sectional Chart (US Only)',
    'Controlled Airspace (Class B/C/D/E) (US Only)',
    'Restricted & Special Use Airspace (US Only)',
    'Temporary Flight Restrictions (TFR / NOTAM) (US Only)',
    'UAS Facility Maps (LAANC) (US Only)',
    'Obstacles & Antennas (FAA) (US Only)',
    'Power Lines (HIFLD) (US Only)',
    'Weather Radar (NEXRAD) (US Only)',
    'Weather Warnings (NWS Hazards) (US Only)'
  ];

  const hasOverlay = overlayNames.some(n => airspaceActiveSet.has(n));
  container.style.display = hasOverlay ? '' : 'none';
  if (!hasOverlay) return;

  const currentZoom = map ? map.getZoom() : 99;
  const laancActive = airspaceActiveSet.has('UAS Facility Maps (LAANC) (US Only)');
  const laancZoomedOut = laancActive && currentZoom < LAANC_MIN_ZOOM;
  const obstaclesActive = airspaceActiveSet.has('Obstacles & Antennas (FAA) (US Only)');
  const obstaclesZoomedOut = obstaclesActive && currentZoom < OBSTACLES_MIN_ZOOM;
  const powerLinesActive = airspaceActiveSet.has('Power Lines (HIFLD) (US Only)');
  const powerLinesZoomedOut = powerLinesActive && currentZoom < POWER_LINES_MIN_ZOOM;

  container.replaceChildren();

  const headerDiv = document.createElement('div');
  headerDiv.className = 'legend-header';
  headerDiv.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:8px;';

  const h4 = document.createElement('h4');
  h4.style.cssText = 'margin:0;line-height:1.2;';
  h4.textContent = 'Map Overlays';
  headerDiv.appendChild(h4);

  container.appendChild(headerDiv);

  const contentDiv = document.createElement('div');
  contentDiv.className = 'legend-content';

  function createSectionHeader(text) {
    const div = document.createElement('div');
    div.style.cssText = 'font-size:0.72rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin:6px 0 4px;';
    div.textContent = text;
    return div;
  }

  function createLegendItem(bgStyle, text) {
    const div = document.createElement('div');
    div.className = 'legend-item';

    const span = document.createElement('span');
    span.className = 'legend-color';
    span.style.cssText = bgStyle;

    div.appendChild(span);
    div.appendChild(document.createTextNode(' ' + text));
    return div;
  }

  function createZoomWarning(minZoom, featureName) {
    const div = document.createElement('div');
    div.style.cssText = 'font-size:0.75rem;color:var(--accent-yellow);display:flex;align-items:center;gap:5px;margin-bottom:4px;';

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "12");
    svg.setAttribute("height", "12");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2.5");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");

    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", "12");
    circle.setAttribute("cy", "12");
    circle.setAttribute("r", "10");
    svg.appendChild(circle);

    const line1 = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line1.setAttribute("x1", "12");
    line1.setAttribute("y1", "8");
    line1.setAttribute("x2", "12");
    line1.setAttribute("y2", "12");
    svg.appendChild(line1);

    const line2 = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line2.setAttribute("x1", "12");
    line2.setAttribute("y1", "16");
    line2.setAttribute("x2", "12.01");
    line2.setAttribute("y2", "16");
    svg.appendChild(line2);

    div.appendChild(svg);
    div.appendChild(document.createTextNode(` Zoom in to zoom level ${minZoom}+ to load ${featureName}`));

    return div;
  }

  if (airspaceActiveSet.has('VFR Sectional Chart (US Only)')) {
    contentDiv.appendChild(createSectionHeader('VFR Chart'));
    contentDiv.appendChild(createLegendItem('background:linear-gradient(135deg,#6eb5ff,#a0c8ff);border:1px solid rgba(255,255,255,0.2);opacity:0.8;', 'Raster aeronautical chart'));
  }

  if (airspaceActiveSet.has('Controlled Airspace (Class B/C/D/E) (US Only)')) {
    contentDiv.appendChild(createSectionHeader('Controlled Airspace'));
    contentDiv.appendChild(createLegendItem('background:#2563eb;', 'Class B (Surface–10,000 ft)'));
    contentDiv.appendChild(createLegendItem('background:#a855f7;', 'Class C (Surface–4,000 ft)'));
    contentDiv.appendChild(createLegendItem('background:#ec4899;', 'Class D (Surface–2,500 ft)'));
    contentDiv.appendChild(createLegendItem('background:#10b981;', 'Class E (Varies)'));
  }

  if (airspaceActiveSet.has('Restricted & Special Use Airspace (US Only)')) {
    contentDiv.appendChild(createSectionHeader('Special Use Airspace'));
    contentDiv.appendChild(createLegendItem('background:#ef4444;', 'Prohibited / Restricted'));
    contentDiv.appendChild(createLegendItem('background:#f59e0b;', 'Warning Area / MOA'));
  }

  if (airspaceActiveSet.has('Temporary Flight Restrictions (TFR / NOTAM) (US Only)')) {
    contentDiv.appendChild(createSectionHeader('Temporary Flight Restrictions (TFR)'));
    contentDiv.appendChild(createLegendItem('background:#dc2626;border:1px dashed #ef4444;', 'Active TFR (Flight Prohibited)'));
    contentDiv.appendChild(createLegendItem('background:#f59e0b;border:1px dashed #fbbf24;', 'TFR Advisory / Stadium / Event'));
  }

  if (laancActive) {
    contentDiv.appendChild(createSectionHeader('LAANC Grid Ceilings'));
    if (laancZoomedOut) {
      contentDiv.appendChild(createZoomWarning(LAANC_MIN_ZOOM, 'grids'));
    } else {
      contentDiv.appendChild(createLegendItem('background:#ef4444;', '0 ft (No ops without LAANC auth)'));
      contentDiv.appendChild(createLegendItem('background:#f97316;', '≤100 ft'));
      contentDiv.appendChild(createLegendItem('background:#f59e0b;', '≤200 ft'));
      contentDiv.appendChild(createLegendItem('background:#eab308;', '≤300 ft'));
      contentDiv.appendChild(createLegendItem('background:#10b981;', '400 ft (Standard max)'));
    }
  }

  if (obstaclesActive) {
    contentDiv.appendChild(createSectionHeader('Obstacles & Antennas'));
    if (obstaclesZoomedOut) {
      contentDiv.appendChild(createZoomWarning(OBSTACLES_MIN_ZOOM, 'obstacles'));
    } else {
      contentDiv.appendChild(createLegendItem('background:#f97316; border-radius: 50%; width: 12px; height: 12px; display: inline-block;', 'FAA Obstacle/Antenna'));
    }
  }

  if (powerLinesActive) {
    contentDiv.appendChild(createSectionHeader('Power Lines'));
    if (powerLinesZoomedOut) {
      contentDiv.appendChild(createZoomWarning(POWER_LINES_MIN_ZOOM, 'power lines'));
    } else {
      contentDiv.appendChild(createLegendItem('background:#fde047; height: 3px; display: inline-block;', 'HIFLD Electric Power Transmission Line'));
    }
  }

  if (airspaceActiveSet.has('Weather Radar (NEXRAD) (US Only)')) {
    contentDiv.appendChild(createSectionHeader('Weather Radar'));

    const wrapper = document.createElement('div');
    wrapper.className = 'legend-item';
    wrapper.style.cssText = 'flex-direction: column; align-items: stretch; gap: 4px; width: 100%;';

    const gradientBar = document.createElement('div');
    gradientBar.style.cssText = 'display: flex; height: 8px; border-radius: 4px; overflow: hidden; background: linear-gradient(to right, #00ecec, #00d800, #ff0000, #d800d8);';
    wrapper.appendChild(gradientBar);

    const labelsDiv = document.createElement('div');
    labelsDiv.style.cssText = 'display: flex; justify-content: space-between; font-size: 0.65rem; color: var(--text-muted); width: 100%;';

    const lightRain = document.createElement('span');
    lightRain.textContent = 'Light Rain';
    labelsDiv.appendChild(lightRain);

    const heavyStorm = document.createElement('span');
    heavyStorm.textContent = 'Heavy Storm';
    labelsDiv.appendChild(heavyStorm);

    wrapper.appendChild(labelsDiv);
    contentDiv.appendChild(wrapper);
  }

  if (airspaceActiveSet.has('Weather Warnings (NWS Hazards) (US Only)')) {
    contentDiv.appendChild(createSectionHeader('Weather Warnings'));
    contentDiv.appendChild(createLegendItem('background:#ef4444; border: 1px solid rgba(255,255,255,0.2);', 'NWS Active Warning Area'));
    contentDiv.appendChild(createLegendItem('background:#f59e0b; border: 1px solid rgba(255,255,255,0.2);', 'NWS Active Watch / Advisory'));
  }

  container.appendChild(contentDiv);
}

// Apply or remove FeatureServer data based on current zoom level.
// Uses setWhere('1=0') to suppress all network requests when zoomed out,
// and setWhere('') to restore normal queries when zoomed in enough.
function applyZoomGates() {
  const activeMap = (typeof map !== 'undefined' && map) || (typeof window !== 'undefined' && window.map) || (typeof global !== 'undefined' && global.map);
  if (!activeMap || typeof activeMap.getZoom !== 'function') return;
  const zoom = activeMap.getZoom();

  if (uasFacilityMapLayer && uasFacilityMapEnabled) {
    if (zoom >= LAANC_MIN_ZOOM) {
      uasFacilityMapLayer.setWhere('');
    } else {
      uasFacilityMapLayer.setWhere('1=0');
    }
  }

  if (obstaclesLayer && obstaclesEnabled) {
    if (zoom >= OBSTACLES_MIN_ZOOM) {
      obstaclesLayer.setWhere('');
    } else {
      obstaclesLayer.setWhere('1=0');
    }
  }

  if (powerLinesLayer && powerLinesEnabled) {
    if (zoom >= POWER_LINES_MIN_ZOOM) {
      powerLinesLayer.setWhere('');
    } else {
      powerLinesLayer.setWhere('1=0');
    }
  }

  // Refresh the legend to show/hide the zoom notice
  if (typeof updateAirspaceLegend === 'function') {
    try { updateAirspaceLegend(null); } catch (e) {}
  }

  // Responsive continuous zoom scaling for camera cones, directional arrows, and pitch labels:
  // - Zoom >= 20.5: Full-scale view (cone scale 1.0, pitch scale 1.0, top 24px)
  // - Zoom 18 - 20.5: Smooth continuous interpolation preventing overlap in dense grids
  // - Zoom 16 - 18: Micro-cones (0.18 - 0.38) and arrows for heading orientation; pitch labels hidden
  // - Zoom < 16: Low-zoom macro overview (.wp-zoomed-out) hides labels/cones to keep overview clean
  const WP_MACRO_MIN_ZOOM = 16;
  const WP_PITCH_MIN_ZOOM = 18;
  const mapContainer = (activeMap && typeof activeMap.getContainer === 'function') ? activeMap.getContainer() : null;
  if (mapContainer) {
    if (zoom >= WP_MACRO_MIN_ZOOM) {
      mapContainer.classList.remove('wp-zoomed-out');
      mapContainer.classList.remove('wp-zoom-high', 'wp-zoom-mid', 'wp-zoom-compact');

      let coneScale;
      let pitchScale;
      let pitchTop;
      let arrowScale;

      if (zoom >= 20.5) {
        coneScale = 1.0;
        pitchScale = 1.0;
        pitchTop = 24;
        arrowScale = 1.0;
        mapContainer.classList.add('wp-zoom-high');
      } else if (zoom >= 18) {
        // Continuous smooth interpolation from zoom 18 to 20.5
        const t = (zoom - 18) / 2.5;
        coneScale = 0.38 + t * (1.0 - 0.38);
        pitchScale = 0.65 + t * (1.0 - 0.65);
        pitchTop = 16 + t * (24 - 16);
        arrowScale = 0.90 + t * (1.0 - 0.90);
        if (zoom >= 19.5) {
          mapContainer.classList.add('wp-zoom-high');
        } else if (zoom >= 18.5) {
          mapContainer.classList.add('wp-zoom-mid');
        } else {
          mapContainer.classList.add('wp-zoom-compact');
        }
      } else {
        // Micro-cones for zoom 16 to 18 (flight orientation view)
        const t = (zoom - 16) / 2.0;
        coneScale = 0.18 + t * (0.38 - 0.18);
        pitchScale = 0;
        pitchTop = 14;
        arrowScale = 0.70 + t * (0.90 - 0.70);
        mapContainer.classList.add('wp-zoom-compact');
      }

      if (zoom < WP_PITCH_MIN_ZOOM) {
        mapContainer.classList.add('wp-zoom-pitch-hidden');
      } else {
        mapContainer.classList.remove('wp-zoom-pitch-hidden');
      }

      if (mapContainer.style && typeof mapContainer.style.setProperty === 'function') {
        mapContainer.style.setProperty('--wp-cone-scale', coneScale.toFixed(3));
        mapContainer.style.setProperty('--wp-pitch-scale', pitchScale.toFixed(3));
        mapContainer.style.setProperty('--wp-pitch-top', pitchTop.toFixed(1) + 'px');
        mapContainer.style.setProperty('--wp-arrow-scale', arrowScale.toFixed(3));
      }
    } else {
      mapContainer.classList.add('wp-zoomed-out');
      mapContainer.classList.remove('wp-zoom-high', 'wp-zoom-mid', 'wp-zoom-compact', 'wp-zoom-pitch-hidden');
      if (mapContainer.style && typeof mapContainer.style.removeProperty === 'function') {
        mapContainer.style.removeProperty('--wp-cone-scale');
        mapContainer.style.removeProperty('--wp-pitch-scale');
        mapContainer.style.removeProperty('--wp-pitch-top');
        mapContainer.style.removeProperty('--wp-arrow-scale');
      }
    }
  }
}
if (typeof window !== 'undefined') {
  window.applyZoomGates = applyZoomGates;
}
function getSubMissionFlightTime(wps, startIdx, endIdx, speed, captureMode) {
  let distance = 0;
  for (let i = startIdx + 1; i <= endIdx; i++) {
    const p1 = wps[i - 1];
    const p2 = wps[i];
    const d = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
    distance += d;
  }
  let photoCount = 0;
  if (captureMode === 'stopAndShoot') {
    photoCount = (endIdx - startIdx + 1);
  }
  let timeSec = distance / speed;
  if (captureMode === 'stopAndShoot') {
    timeSec += photoCount * 4.5;
  }
  
  // Sum hover times across the sub-mission waypoints
  const globalHoverEl = document.getElementById('global-hover-time');
  const globalHover = globalHoverEl ? (parseInt(globalHoverEl.value) || 0) : 0;
  
  let totalHoverSeconds = 0;
  for (let i = startIdx; i <= endIdx; i++) {
    const wp = wps[i];
    if (!wp) continue;
    const wpCapture = (wp.captureMode && wp.captureMode !== 'inherit') ? wp.captureMode : (wp.layerCaptureMode && wp.layerCaptureMode !== 'inherit') ? wp.layerCaptureMode : captureMode;
    const wpIsStopAndShoot = wpCapture === 'stopAndShoot';

    let baseHover = globalHover;
    if (wp.layerHoverTime !== undefined && wp.layerHoverTime !== null && wp.layerHoverTime !== 'inherit') {
      baseHover = parseInt(wp.layerHoverTime, 10) || 0;
    }
    if (wp.hoverTime !== null && wp.hoverTime !== undefined && wp.hoverTime !== 'inherit') {
      baseHover = parseInt(wp.hoverTime, 10) || 0;
    }
    let wpEffectiveHover = baseHover;

    const autoSettling = wp.autoSettlingEnabled !== false;
    const baseSettling = wp.baseSettlingTime !== undefined ? wp.baseSettlingTime : 2.0;
    const majorTurnSettling = wp.majorTurnSettlingTime !== undefined ? wp.majorTurnSettlingTime : 5.0;
    const modTurnSettling = wp.moderateTurnSettlingTime !== undefined ? wp.moderateTurnSettlingTime : 4.0;
    const pitchSettling = wp.pitchSettlingTime !== undefined ? wp.pitchSettlingTime : 3.0;

    const reposInfo = checkNeedsReposition(i, wps);
    const gridTypeEl = typeof document !== 'undefined' ? document.getElementById('grid-type') : null;
    const gridTypeVal = (gridTypeEl && gridTypeEl.value) ? gridTypeEl.value : (wps.find(w => w && w.gridType)?.gridType || '');
    const isTargetSplat = gridTypeVal === 'target-splat' ||
      gridTypeVal === 'photo-sphere' ||
      (wp.gridType === 'target-splat') ||
      (wp.gridType === 'photo-sphere') ||
      (wp.isPhotoSpherePoint) ||
      (wp.isPhotoSphere) ||
      (wp.layerPattern === 'photo-sphere') ||
      (wp.layerId && typeof flightLayers !== 'undefined' && flightLayers.some(l => l.id === wp.layerId && (l.pattern === 'target-splat' || l.pattern === 'photo-sphere'))) ||
      (wp.majorTurnSettlingTime !== undefined && wp.layerId);

    if (wpIsStopAndShoot && autoSettling && reposInfo.needsReposition) {
      let settlingDelay = baseSettling;
      if (isTargetSplat && i > 0) {
        if (reposInfo.headingDiff >= 60) {
          settlingDelay = Math.max(settlingDelay, majorTurnSettling);
        } else if (reposInfo.headingDiff >= 25) {
          settlingDelay = Math.max(settlingDelay, modTurnSettling);
        } else if (reposInfo.isGimbalChanged) {
          settlingDelay = Math.max(settlingDelay, pitchSettling);
        }
      }
      wpEffectiveHover = Math.max(wpEffectiveHover, settlingDelay);
    }
    totalHoverSeconds += wpEffectiveHover;
  }
  timeSec += totalHoverSeconds;
  
  timeSec += 45; // Takeoff, landing, and acceleration buffer
  return timeSec;
}

function splitWaypointsIntoParts(waypoints, maxFlightTimeMinutes, speed, captureMode) {
  const maxFlightTimeSeconds = maxFlightTimeMinutes * 60;
  const parts = [];
  let startIdx = 0;
  
  while (startIdx < waypoints.length - 1) {
    let endIdx = startIdx + 1;
    
    while (endIdx < waypoints.length) {
      const estTime = getSubMissionFlightTime(waypoints, startIdx, endIdx, speed, captureMode);
      if (estTime > maxFlightTimeSeconds) {
        if (endIdx > startIdx + 1) {
          endIdx--;
        }
        break;
      }
      endIdx++;
    }
    
    if (endIdx >= waypoints.length) {
      endIdx = waypoints.length - 1;
    }
    
    const partWaypoints = waypoints.slice(startIdx, endIdx + 1);
    parts.push({
      startIdx: startIdx,
      endIdx: endIdx,
      waypoints: partWaypoints
    });
    
    startIdx = endIdx;
    
    if (partWaypoints.length < 2) {
      break;
    }
  }
  return parts;
}

function recalculateSplitStarts() {
  activeSplitStartIndices = new Set();
}

function addFreeformWaypoint(lat, lng) {
  if (!centerMarker) {
    setGridCenter(lat, lng);
  }

  const centerLatLng = centerMarker ? centerMarker.getLatLng() : { lat, lng };
  const offsets = geodeticToLocal(lat, lng, centerLatLng.lat, centerLatLng.lng);
  const altitude = parseFloat(document.getElementById('altitude')?.value) || 50;
  const defaultGimbalPitch = parseGimbalPitch(document.getElementById('gimbal-pitch')?.value, -60);

  const activeLayer = typeof getActiveLayer === 'function' ? getActiveLayer() : null;
  const currentFreeformList = activeLayer ? (activeLayer.freeformWaypoints || []) : [];
  const idx = currentFreeformList.length;

  const wp = {
    lat: lat,
    lon: lng,
    x: offsets.x,
    y: offsets.y,
    alt: altitude,
    pitch: defaultGimbalPitch,
    heading: null,
    isRingStart: false,
    ringIndex: null,
    idx: idx,
    layerId: activeLayer ? activeLayer.id : null,
    layerName: activeLayer ? activeLayer.name : null,
    layerPattern: activeLayer ? activeLayer.pattern : 'freeform',
    layerHeadingMode: activeLayer ? (activeLayer.headingMode || 'inherit') : 'inherit',
    targetPoiId: (activeLayer && activeLayer.targetPoiId) ? activeLayer.targetPoiId : null,
    origLat: lat,
    origLon: lng,
    origX: offsets.x,
    origY: offsets.y,
    origAlt: altitude,
    origPitch: defaultGimbalPitch,
    origHeading: null,
    origIsRingStart: false,
    origIsModified: false
  };

  const pt = {
    lat: lat,
    lon: lng,
    x: offsets.x,
    y: offsets.y,
    alt: altitude,
    pitch: defaultGimbalPitch,
    heading: null,
    origLat: lat,
    origLon: lng,
    origX: offsets.x,
    origY: offsets.y,
    origAlt: altitude,
    origPitch: defaultGimbalPitch,
    origHeading: null,
    origIsRingStart: false,
    origIsModified: false
  };

  if (importedWaypoints) {
    importedWaypoints.push(wp);
    importedPhotos.push(pt);
  } else if (activeLayer) {
    if (!activeLayer.freeformWaypoints) activeLayer.freeformWaypoints = [];
    if (!activeLayer.freeformPhotos) activeLayer.freeformPhotos = [];
    activeLayer.freeformWaypoints.push(wp);
    activeLayer.freeformPhotos.push(pt);
    if (!activeLayer.polygonVertices) activeLayer.polygonVertices = [];
    activeLayer.polygonVertices.push({ lat, lon: lng, x: offsets.x, y: offsets.y });
  }

  updateGrid();
}

function removeBacktrackingSpurs(wps) {
  if (wps.length < 3) return wps;
  
  let points = [...wps];
  let changed = true;
  
  while (changed) {
    changed = false;
    
    // Precompute cumulative path lengths to avoid O(N^3) nested loop
    let cumulativePath = new Float64Array(points.length);
    cumulativePath[0] = 0;
    for (let k = 1; k < points.length; k++) {
      const dx = points[k].x - points[k-1].x;
      const dy = points[k].y - points[k-1].y;
      cumulativePath[k] = cumulativePath[k-1] + Math.sqrt(dx * dx + dy * dy);
    }

    for (let i = 0; i < points.length - 2; i++) {
      for (let j = points.length - 1; j > i + 1; j--) {
        const dx = points[j].x - points[i].x;
        const dy = points[j].y - points[i].y;
        const distSq = dx * dx + dy * dy;
        
        // If the start and end of this candidate loop are close (e.g. < 25 meters, squared is 625)
        if (distSq < 625.0) {
          const pathLength = cumulativePath[j] - cumulativePath[i];
          
          // If the path length is significant (at least 25 meters)
          if (pathLength > 25.0) {
            // Find the tip index which is furthest from points[i]
            let tip = i + 1;
            let maxDistToISq = 0;
            for (let k = i + 1; k < j; k++) {
              const kdx = points[k].x - points[i].x;
              const kdy = points[k].y - points[i].y;
              const dSq = kdx * kdx + kdy * kdy;
              if (dSq > maxDistToISq) {
                maxDistToISq = dSq;
                tip = k;
              }
            }
            
            let maxWidthSq = 0;
            // For every point a in Leg 1 (i to tip)
            for (let a = i; a <= tip; a++) {
              let minDistSq = Infinity;
              // Find closest point b on Leg 2 (tip to j)
              for (let b = tip; b <= j; b++) {
                const bdx = points[b].x - points[a].x;
                const bdy = points[b].y - points[a].y;
                const dSq = bdx * bdx + bdy * bdy;
                if (dSq < minDistSq) minDistSq = dSq;
              }
              if (minDistSq > maxWidthSq) maxWidthSq = minDistSq;
            }
            
            // Also check Leg 2 to Leg 1 to be symmetric
            for (let b = tip; b <= j; b++) {
              let minDistSq = Infinity;
              for (let a = i; a <= tip; a++) {
                const adx = points[a].x - points[b].x;
                const ady = points[a].y - points[b].y;
                const dSq = adx * adx + ady * ady;
                if (dSq < minDistSq) minDistSq = dSq;
              }
              if (minDistSq > maxWidthSq) maxWidthSq = minDistSq;
            }
            
            // Check if any point inside the loop to be removed is a user-clicked point
            let hasClickedPoint = false;
            for (let k = i + 1; k < j; k++) {
              if (points[k].isClicked) {
                hasClickedPoint = true;
                break;
              }
            }
            
            // If it's a very narrow loop and contains no clicked points, it's a backtracking spur!
            if (!hasClickedPoint && maxWidthSq < 625.0) {
              points.splice(i + 1, j - i - 1);
              changed = true;
              break;
            }
          }
        }
      }
      if (changed) break;
    }
  }
  
  // Re-index remaining points
  points.forEach((wp, idx) => {
    wp.idx = idx;
  });
  
  return points;
}


function addRoadWaypoint(lat, lng) {
  if (!centerMarker) {
    setGridCenter(lat, lng);
    return;
  }

  const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
  const centerLatLng = centerMarker.getLatLng();
  const layerCenterLat = (activeLayer && activeLayer.centerLat !== null && activeLayer.centerLat !== undefined) ? activeLayer.centerLat : centerLatLng.lat;
  const layerCenterLon = (activeLayer && activeLayer.centerLon !== null && activeLayer.centerLon !== undefined) ? activeLayer.centerLon : centerLatLng.lng;
  const altitude = (activeLayer && activeLayer.altitude !== undefined) ? activeLayer.altitude : parseFloat(document.getElementById('altitude').value);

  const roadSnapCheckbox = document.getElementById('road-snap');
  const snapToRoad = roadSnapCheckbox ? roadSnapCheckbox.checked : (activeLayer ? !!activeLayer.roadSnap : true);

  if (activeLayer) {
    if (!activeLayer.roadWaypoints) activeLayer.roadWaypoints = [];
    roadWaypoints = activeLayer.roadWaypoints;
  } else {
    if (!roadWaypoints) roadWaypoints = [];
  }

  if (roadWaypoints.length === 0 || !snapToRoad) {
    const offsets = geodeticToLocal(lat, lng, layerCenterLat, layerCenterLon);
    const wp = {
      lat: lat,
      lon: lng,
      x: offsets.x,
      y: offsets.y,
      alt: altitude,
      pitch: null,
      heading: null,
      isRingStart: false,
      ringIndex: null,
      isClicked: true,
      idx: roadWaypoints.length,
      origLat: lat,
      origLon: lng,
      origX: offsets.x,
      origY: offsets.y,
      origAlt: altitude,
      origPitch: null,
      origHeading: null,
      origIsRingStart: false,
      origIsModified: false
    };
    roadWaypoints.push(wp);
    if (activeLayer) activeLayer.roadWaypoints = roadWaypoints;
    updateGrid();
    return;
  }

  const lastWp = roadWaypoints[roadWaypoints.length - 1];
  isRouting = true;

  const freeformInstructions = document.getElementById('freeform-instructions');
  let originalAlertText = "";
  if (freeformInstructions) {
    const span = freeformInstructions.querySelector('span');
    originalAlertText = span ? span.textContent : '';
    if (span) span.textContent = "⏳ Snapping to road via OpenStreetMap routing service...";
    freeformInstructions.style.background = "rgba(245, 158, 11, 0.15)";
    freeformInstructions.style.borderColor = "rgba(245, 158, 11, 0.3)";
    freeformInstructions.style.color = "#f59e0b";
  }

  const url = `https://router.project-osrm.org/route/v1/driving/${lastWp.lon},${lastWp.lat};${lng},${lat}?overview=full&geometries=geojson`;

  fetch(url)
    .then(res => res.json())
    .then(data => {
      isRouting = false;
      
      if (freeformInstructions) {
        const span = freeformInstructions.querySelector('span');
        if (span) span.textContent = originalAlertText;
        freeformInstructions.style.background = "";
        freeformInstructions.style.borderColor = "";
        freeformInstructions.style.color = "";
      }

      if (data && data.code === 'Ok' && data.routes && data.routes.length > 0) {
        const coords = data.routes[0].geometry.coordinates;
        if (coords && coords.length > 1) {
          for (let i = 1; i < coords.length; i++) {
            const ptLon = coords[i][0];
            const ptLat = coords[i][1];
            const offsets = geodeticToLocal(ptLat, ptLon, layerCenterLat, layerCenterLon);
            
            const wp = {
              lat: ptLat,
              lon: ptLon,
              x: offsets.x,
              y: offsets.y,
              alt: altitude,
              pitch: null,
              heading: null,
              isRingStart: false,
              ringIndex: null,
              isClicked: i === coords.length - 1,
              idx: roadWaypoints.length,
              origLat: ptLat,
              origLon: ptLon,
              origX: offsets.x,
              origY: offsets.y,
              origAlt: altitude,
              origPitch: null,
              origHeading: null,
              origIsRingStart: false,
              origIsModified: false
            };
            roadWaypoints.push(wp);
          }
          
          roadWaypoints = removeBacktrackingSpurs(roadWaypoints);
          if (activeLayer) activeLayer.roadWaypoints = roadWaypoints;
          updateGrid();
          return;
        }
      }

      Logger.warn("OSRM routing failed, falling back to direct line segment.");
      fallbackDirectLine();
    })
    .catch(err => {
      isRouting = false;
      if (freeformInstructions) {
        const span = freeformInstructions.querySelector('span');
        if (span) span.textContent = originalAlertText;
        freeformInstructions.style.background = "";
        freeformInstructions.style.borderColor = "";
        freeformInstructions.style.color = "";
      }
      Logger.error("OSRM error:", err);
      fallbackDirectLine();
    });

  function fallbackDirectLine() {
    const offsets = geodeticToLocal(lat, lng, layerCenterLat, layerCenterLon);
    const wp = {
      lat: lat,
      lon: lng,
      x: offsets.x,
      y: offsets.y,
      alt: altitude,
      pitch: null,
      heading: null,
      isRingStart: false,
      ringIndex: null,
      isClicked: true,
      idx: roadWaypoints.length,
      origLat: lat,
      origLon: lng,
      origX: offsets.x,
      origY: offsets.y,
      origAlt: altitude,
      origPitch: null,
      origHeading: null,
      origIsRingStart: false,
      origIsModified: false
    };
    roadWaypoints.push(wp);
    roadWaypoints = removeBacktrackingSpurs(roadWaypoints);
    if (activeLayer) activeLayer.roadWaypoints = roadWaypoints;
    updateGrid();
  }
}

// Calculate flight stats
