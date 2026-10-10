function searchAddress() {
  const query = document.getElementById('location-input').value.trim();
  if (!query) return;

  const topbarCenter = (typeof document !== 'undefined' && typeof document.querySelector === 'function') ? document.querySelector('.topbar-center') : null;
  const topbar = (typeof document !== 'undefined' && typeof document.querySelector === 'function') ? document.querySelector('.studio-topbar') : null;
  if (typeof window !== 'undefined' && window.innerWidth <= 640) {
    if (topbarCenter) topbarCenter.classList.remove('search-open');
    if (topbar) topbar.classList.remove('search-open');
  }

  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;

  fetch(url, {
    headers: {
      'User-Agent': 'AalaapiSkyGenerator/1.0'
    }
  })
    .then(res => res.json())
    .then(data => {
      if (data && data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lon = parseFloat(data[0].lon);
        map.setView([lat, lon], 17);
        setGridCenter(lat, lon);
      } else {
        alert("Location not found. Please try a different query.");
      }
    })
    .catch(err => {
      Logger.error("Search error:", err);
      alert("Error finding location. Check your internet connection.");
    });
}

let currentlySelectedMarker = null;
let selectedWaypointIndex = null;

// Elevate selected marker z-index to top and apply visual highlight
function bringMarkerToFront(targetMarker, idx = null) {
  if (!targetMarker) return;
  if (idx !== null) {
    selectedWaypointIndex = idx;
    if (typeof fpvProgressIndex !== 'undefined') {
      fpvProgressIndex = idx;
      if (typeof updateFPVEditorUI === 'function') {
        updateFPVEditorUI();
      }
    }
  }
  if (currentlySelectedMarker === targetMarker && targetMarker._icon && (targetMarker._icon.classList ? targetMarker._icon.classList.contains('marker-selected') : true)) {
    return;
  }
  
  const removeHighlight = (m) => {
    if (!m) return;
    if (m.setZIndexOffset) m.setZIndexOffset(0);
    if (m._icon) {
      if (typeof L !== 'undefined' && L && L.DomUtil && typeof L.DomUtil.removeClass === 'function') {
        L.DomUtil.removeClass(m._icon, 'marker-selected');
      } else if (m._icon.classList && typeof m._icon.classList.remove === 'function') {
        m._icon.classList.remove('marker-selected');
      }
    }
  };

  if (typeof centerMarker !== 'undefined' && centerMarker) removeHighlight(centerMarker);

  const waypoints = (typeof getCurrentWaypoints === 'function' ? getCurrentWaypoints() : null) || [];
  waypoints.forEach(wp => {
    if (wp && wp.mapMarker) removeHighlight(wp.mapMarker);
  });

  if (typeof roadWaypoints !== 'undefined' && roadWaypoints) {
    roadWaypoints.forEach(wp => {
      if (wp && wp.roadMarker) removeHighlight(wp.roadMarker);
    });
  }

  if (typeof pois !== 'undefined' && pois) {
    pois.forEach(p => {
      if (p && p.marker) removeHighlight(p.marker);
    });
  }

  if (targetMarker.setZIndexOffset) {
    targetMarker.setZIndexOffset(1000);
  }
  if (targetMarker._icon) {
    if (typeof L !== 'undefined' && L && L.DomUtil && typeof L.DomUtil.addClass === 'function') {
      L.DomUtil.addClass(targetMarker._icon, 'marker-selected');
    } else if (targetMarker._icon.classList && typeof targetMarker._icon.classList.add === 'function') {
      targetMarker._icon.classList.add('marker-selected');
    }
  }

  currentlySelectedMarker = targetMarker;
}

// Helper to detect visually overlapping items at a map position (in screen pixels)
function getOverlappingItemsAt(targetLatLng, maxPixelDistance = 15) {
  const items = [];
  if (!targetLatLng || typeof map === 'undefined' || !map || typeof map.latLngToContainerPoint !== 'function') return items;
  if (typeof L === 'undefined' || !L || typeof L.latLng !== 'function') return items;

  const targetPoint = L.latLng(targetLatLng.lat, targetLatLng.lng);
  const targetPixel = map.latLngToContainerPoint(targetPoint);
  if (!targetPixel) return items;

  if (centerMarker && typeof centerMarker.getLatLng === 'function') {
    const centerLatLng = centerMarker.getLatLng();
    const centerPixel = map.latLngToContainerPoint(centerLatLng);
    if (centerPixel) {
      const dist = Math.hypot(targetPixel.x - centerPixel.x, targetPixel.y - centerPixel.y);
      if (dist <= maxPixelDistance) {
        items.push({
          type: 'center',
          name: '📍 Flight Mission Center',
          marker: centerMarker,
          latLng: centerLatLng
        });
      }
    }
  }

  const waypoints = (typeof getCurrentWaypoints === 'function' ? getCurrentWaypoints() : null) || [];
  waypoints.forEach((wp, idx) => {
    if (wp.mapMarker) {
      const wpLatLng = L.latLng(wp.lat, wp.lon);
      const wpPixel = map.latLngToContainerPoint(wpLatLng);
      if (wpPixel) {
        const dist = Math.hypot(targetPixel.x - wpPixel.x, targetPixel.y - wpPixel.y);
        if (dist <= maxPixelDistance) {
          items.push({
            type: 'waypoint',
            name: `🔵 Waypoint ${idx}`,
            wp: wp,
            idx: idx,
            marker: wp.mapMarker,
            latLng: wpLatLng
          });
        }
      }
    }
  });

  if (typeof roadWaypoints !== 'undefined' && roadWaypoints) {
    roadWaypoints.forEach((wp, idx) => {
      if (wp.roadMarker && !items.some(i => i.marker === wp.roadMarker)) {
        const rLatLng = L.latLng(wp.lat, wp.lon);
        const rPixel = map.latLngToContainerPoint(rLatLng);
        if (rPixel) {
          const dist = Math.hypot(targetPixel.x - rPixel.x, targetPixel.y - rPixel.y);
          if (dist <= maxPixelDistance) {
            items.push({
              type: 'roadNode',
              name: `🛣️ Road Node ${idx}`,
              wp: wp,
              idx: idx,
              marker: wp.roadMarker,
              latLng: rLatLng
            });
          }
        }
      }
    });
  }

  return items;
}

// Open disambiguation choice popup when items overlap at the same spot
function openDisambiguationPopup(latLng, items) {
  if (!map || items.length <= 1) return false;

  const container = document.createElement('div');
  container.className = 'disambiguation-popup-container';
  container.style.cssText = 'padding: 4px; font-family: var(--font-secondary); min-width: 190px;';

  const title = document.createElement('div');
  title.style.cssText = 'font-size: 0.8rem; font-weight: 700; color: var(--text-main); margin-bottom: 8px; border-bottom: 1px solid var(--border-color); padding-bottom: 4px; text-align: center;';
  title.textContent = 'Overlapping Map Items';
  container.appendChild(title);

  const list = document.createElement('div');
  list.style.cssText = 'display: flex; flex-direction: column; gap: 6px;';

  items.forEach(item => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-secondary';
    btn.style.cssText = 'display: flex; align-items: center; gap: 8px; justify-content: flex-start; padding: 6px 10px; width: 100%; font-size: 0.8rem; border-radius: 6px; cursor: pointer; text-align: left; background: rgba(255, 255, 255, 0.05); border: 1px solid var(--border-color); color: var(--text-main);';

    const label = document.createElement('span');
    label.style.cssText = 'font-weight: 600; flex: 1;';
    label.textContent = item.name;

    btn.appendChild(label);

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      map.closePopup();
      setTimeout(() => {
        if (item.marker) {
          bringMarkerToFront(item.marker, item.idx !== undefined ? item.idx : null);
          item.marker.openPopup();
        }
      }, 50);
    });

    list.appendChild(btn);
  });

  container.appendChild(list);

  L.popup({ maxWidth: 230, minWidth: 200 })
    .setLatLng(latLng)
    .setContent(container)
    .openOn(map);

  return true;
}

// Clear custom waypoint modifications when grid center moves so all waypoints recalculate procedurally
function clearWaypointCustomModifications() {
  const wps = (typeof generatedWaypoints !== 'undefined' && generatedWaypoints) ? generatedWaypoints : [];
  wps.forEach(wp => {
    if (wp) {
      wp.isModified = false;
      delete wp.origLat;
      delete wp.origLon;
      delete wp.origX;
      delete wp.origY;
    }
  });
  const rWps = (typeof roadWaypoints !== 'undefined' && roadWaypoints) ? roadWaypoints : [];
  rWps.forEach(wp => {
    if (wp) {
      wp.isModified = false;
      delete wp.origLat;
      delete wp.origLon;
      delete wp.origX;
      delete wp.origY;
    }
  });
}

// Position the grid center marker
function setGridCenter(lat, lng) {
  clearWaypointCustomModifications();
  const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
  if (activeLayer) {
    activeLayer.centerLat = lat;
    activeLayer.centerLon = lng;
  }

  if (centerMarker) {
    if (typeof centerMarker.setLatLng === 'function') {
      centerMarker.setLatLng([lat, lng]);
    }
    if (pois[0]) {
      pois[0].lat = lat;
      pois[0].lon = lng;
    }
  } else {
    // Custom iconic marker for mission center
    const centerIcon = L.divIcon({
      className: 'custom-center-marker',
      html: `<div style="background-color: #06b6d4; width: 16px; height: 16px; border-radius: 50%; border: 3px solid #f8fafc; box-shadow: 0 0 10px rgba(6,182,212,0.8);"></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    });

    centerMarker = L.marker([lat, lng], { draggable: true, icon: centerIcon }).addTo(map);
    
    // Set pois[0]
    const poi0Id = `poi-center-${Date.now()}`;
    pois[0] = {
      id: poi0Id,
      lat: lat,
      lon: lng,
      alt: (pois[0] && pois[0].alt !== undefined && !isNaN(pois[0].alt)) ? pois[0].alt : 0,
      marker: centerMarker,
      name: "Layer 1 Target"
    };
    if (flightLayers && flightLayers[0] && !flightLayers[0].targetPoiId) {
      flightLayers[0].targetPoiId = poi0Id;
    }
    updatePoiMarkerPopup(pois[0], 0);
    centerMarker.openPopup();

    // Recalculate grid when center is dragged
    centerMarker.on('dragstart', () => {
      clearWaypointCustomModifications();
    });
    centerMarker.on('drag', () => {
      const curLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
      const latlng = centerMarker.getLatLng();
      if (curLayer) {
        curLayer.centerLat = latlng.lat;
        curLayer.centerLon = latlng.lng;
      }
      if (pois[0]) {
        pois[0].lat = latlng.lat;
        pois[0].lon = latlng.lng;
      }
      if (weatherStationLine && weatherStationMarker && typeof weatherStationLine.setLatLngs === 'function') {
        weatherStationLine.setLatLngs([centerMarker.getLatLng(), weatherStationMarker.getLatLng()]);
      }
      updateGrid();
    });
    centerMarker.on('dragend', () => {
      centerMarker.openPopup();
    });
    centerMarker.on('click', (e) => {
      L.DomEvent.stopPropagation(e);
      const items = getOverlappingItemsAt(centerMarker.getLatLng());
      if (items.length > 1 && currentlySelectedMarker !== centerMarker) {
        openDisambiguationPopup(centerMarker.getLatLng(), items);
      } else {
        bringMarkerToFront(centerMarker);
        centerMarker.openPopup();
      }
    });
  }

  updatePoiListUI();
  updateGrid();
  updateOpenSkyLink();
}

function updatePoiMarkerPopup(poi, idx) {
  if (!poi || !poi.marker) return;
  const unit = (typeof getUnitSystem === 'function') ? getUnitSystem() : 'metric';
  const altUnitLabel = unit === 'imperial' ? 'ft' : 'm';
  const curAlt = (poi.alt !== undefined && !isNaN(poi.alt)) ? poi.alt : 0;
  const dispAlt = unit === 'imperial' ? Math.round(curAlt * M_TO_FT) : Math.round(curAlt);
  const popupHtml = `
    <div style="font-size: 0.8rem; min-width: 150px;">
      <div style="font-weight: 700; color: ${idx === 0 ? '#06b6d4' : '#f43f5e'}; margin-bottom: 3px;">${poi.name}</div>
      <div style="color: #94a3b8; font-size: 0.7rem; margin-bottom: 6px;">Drag marker to reposition target.</div>
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; background: rgba(0,0,0,0.25); padding: 4px 6px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.08);">
        <label style="font-size: 0.72rem; font-weight: 600; color: #cbd5e1; margin: 0;">Target AGL:</label>
        <div style="display: flex; align-items: center; gap: 3px;">
          <input type="number" class="poi-popup-alt-input" value="${dispAlt}" min="0" style="width: 48px; font-size: 0.75rem; font-weight: 700; color: #38bdf8; background: rgba(15,23,42,0.8); border: 1px solid rgba(255,255,255,0.2); border-radius: 3px; padding: 2px 4px; text-align: right;">
          <span style="font-size: 0.7rem; color: #94a3b8;">${altUnitLabel}</span>
        </div>
      </div>
    </div>
  `;
  if (typeof poi.marker.bindPopup === 'function') {
    poi.marker.bindPopup(popupHtml);
  }
  if (typeof poi.marker.off === 'function') {
    poi.marker.off('popupopen');
  }
  if (typeof poi.marker.on === 'function') {
    poi.marker.on('popupopen', () => {
      const popupEl = (typeof poi.marker.getPopup === 'function') ? poi.marker.getPopup()?.getElement() : null;
      const input = popupEl?.querySelector('.poi-popup-alt-input');
      if (input) {
        input.addEventListener('change', () => {
          const val = parseFloat(input.value) || 0;
          poi.alt = unit === 'imperial' ? (val / M_TO_FT) : val;
          updatePoiListUI();
          updateGrid();
        });
      }
    });
  }
}

function addPoi(lat, lon, name = null, alt = 0) {
  const idx = pois.length;
  const poiId = `poi-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const poiName = name || (idx === 0 ? "Layer 1 Target" : `POI ${idx}`);
  const poiAlt = (typeof alt === 'number' && !isNaN(alt)) ? alt : (parseFloat(alt) || 0);

  let marker = null;
  if (map) {
    const poiIcon = L.divIcon({
      className: `custom-poi-marker-${idx}`,
      html: `<div style="background-color: #f43f5e; width: 16px; height: 16px; border-radius: 50%; border: 3px solid #f8fafc; box-shadow: 0 0 10px rgba(244,63,94,0.8); display: flex; align-items: center; justify-content: center; color: white; font-size: 8px; font-weight: bold;">${idx}</div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    });

    marker = L.marker([lat, lon], { draggable: true, icon: poiIcon }).addTo(map);
  }

  const poiObj = {
    id: poiId,
    lat: lat,
    lon: lon,
    alt: poiAlt,
    marker: marker,
    name: poiName
  };
  pois.push(poiObj);

  if (marker) {
    updatePoiMarkerPopup(poiObj, idx);
    marker.openPopup();

    marker.on('drag', () => {
      const latlng = marker.getLatLng();
      poiObj.lat = latlng.lat;
      poiObj.lon = latlng.lng;
      updateGrid();
    });

    marker.on('dragend', () => {
      marker.openPopup();
    });
  }

  updatePoiListUI();
  updateLayerPoiSelectOptions();
  updateGrid();
  return poiObj;
}

function deletePoi(idx) {
  if (idx === 0) return; // Cannot delete POI 0 (Center)
  const poi = pois[idx];
  if (poi) {
    if (poi.marker) {
      map.removeLayer(poi.marker);
    }
    // Remove it from the list
    pois.splice(idx, 1);
    
    // Re-index remaining POIs after index
    for (let i = idx; i < pois.length; i++) {
      pois[i].name = `POI ${i}`;
      // Update marker text and class
      const newHtml = `<div style="background-color: #f43f5e; width: 16px; height: 16px; border-radius: 50%; border: 3px solid #f8fafc; box-shadow: 0 0 10px rgba(244,63,94,0.8); display: flex; align-items: center; justify-content: center; color: white; font-size: 8px; font-weight: bold;">${i}</div>`;
      if (pois[i].marker) {
        pois[i].marker.setIcon(L.divIcon({
          className: `custom-poi-marker-${i}`,
          html: newHtml,
          iconSize: [16, 16],
          iconAnchor: [8, 8]
        }));
        updatePoiMarkerPopup(pois[i], i);
      }
    }

    const deletedPoiId = poi ? poi.id : null;
    // Reset any waypoint pointing to this POI or higher
    const wps = getCurrentWaypoints();
    if (wps) {
      wps.forEach(wp => {
        if (wp.targetPoiId === deletedPoiId || wp.poiIndex === idx) {
          wp.poiIndex = 0;
          wp.targetPoiId = (pois[0] && pois[0].id) || null;
        } else if (wp.poiIndex > idx) {
          wp.poiIndex--;
          wp.targetPoiId = (pois[wp.poiIndex] && pois[wp.poiIndex].id) || null;
        }
      });
    }

    // Do the same for roadWaypoints
    if (roadWaypoints) {
      roadWaypoints.forEach(wp => {
        if (wp.targetPoiId === deletedPoiId || wp.poiIndex === idx) {
          wp.poiIndex = 0;
          wp.targetPoiId = (pois[0] && pois[0].id) || null;
        } else if (wp.poiIndex > idx) {
          wp.poiIndex--;
          wp.targetPoiId = (pois[wp.poiIndex] && pois[wp.poiIndex].id) || null;
        }
      });
    }

    // Keep layer targetPoiIds and waypoints consistent across all flight layers
    if (typeof flightLayers !== 'undefined' && Array.isArray(flightLayers)) {
      flightLayers.forEach(l => {
        if (l.targetPoiId === deletedPoiId) {
          l.targetPoiId = (pois[0] && pois[0].id) || null;
        }
        if (Array.isArray(l.waypoints)) {
          l.waypoints.forEach(wp => {
            if (wp.targetPoiId === deletedPoiId || wp.poiIndex === idx) {
              wp.poiIndex = 0;
              wp.targetPoiId = (pois[0] && pois[0].id) || null;
            } else if (wp.poiIndex > idx) {
              wp.poiIndex--;
              wp.targetPoiId = (pois[wp.poiIndex] && pois[wp.poiIndex].id) || null;
            }
          });
        }
      });
    }

    updatePoiListUI();
    updateGrid();
  }
}

function updatePoiListUI() {
  const container = document.getElementById('poi-items-list');
  if (!container) return;
  container.innerHTML = '';

  const unit = (typeof getUnitSystem === 'function') ? getUnitSystem() : 'metric';
  const altUnitLabel = unit === 'imperial' ? 'ft' : 'm';

  pois.forEach((poi, idx) => {
    const item = document.createElement('div');
    item.className = 'poi-item';
    item.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; font-size: 0.75rem; color: var(--text-main);';

    const infoDiv = document.createElement('div');
    infoDiv.style.cssText = 'display: flex; align-items: center; gap: 6px;';
    
    const dot = document.createElement('span');
    dot.style.cssText = `display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${idx === 0 ? '#06b6d4' : '#f43f5e'};`;
    infoDiv.appendChild(dot);

    const titleSpan = document.createElement('span');
    titleSpan.style.cssText = 'font-weight: 600;';
    titleSpan.textContent = poi.name;
    infoDiv.appendChild(titleSpan);

    item.appendChild(infoDiv);

    const actionDiv = document.createElement('div');
    actionDiv.style.cssText = 'display: flex; align-items: center; gap: 6px;';

    // AGL Height Input
    const curAlt = (poi.alt !== undefined && !isNaN(poi.alt)) ? poi.alt : 0;
    const dispAlt = unit === 'imperial' ? Math.round(curAlt * M_TO_FT) : Math.round(curAlt);

    const altContainer = document.createElement('div');
    altContainer.style.cssText = 'display: inline-flex; align-items: center; gap: 2px; background: rgba(0,0,0,0.3); padding: 1px 4px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.1);';
    altContainer.title = 'Target Altitude (AGL)';

    const altLabel = document.createElement('span');
    altLabel.style.cssText = 'font-size: 0.65rem; color: var(--text-muted); font-weight: 500;';
    altLabel.textContent = 'AGL:';
    altContainer.appendChild(altLabel);

    const altInput = document.createElement('input');
    altInput.type = 'number';
    altInput.className = 'poi-alt-input';
    altInput.value = dispAlt;
    altInput.min = '0';
    altInput.max = unit === 'imperial' ? '1640' : '500';
    altInput.style.cssText = 'width: 42px; background: transparent; border: none; color: #38bdf8; font-size: 0.7rem; font-weight: 600; text-align: right; padding: 0; outline: none;';
    if (typeof altInput.addEventListener === 'function') {
      altInput.addEventListener('change', () => {
        const val = parseFloat(altInput.value) || 0;
        poi.alt = unit === 'imperial' ? (val / M_TO_FT) : val;
        if (poi.marker) {
          updatePoiMarkerPopup(poi, idx);
        }
        updateGrid();
      });
    }
    altContainer.appendChild(altInput);

    const unitSpan = document.createElement('span');
    unitSpan.style.cssText = 'font-size: 0.65rem; color: var(--text-muted);';
    unitSpan.textContent = altUnitLabel;
    altContainer.appendChild(unitSpan);

    actionDiv.appendChild(altContainer);

    const coordSpan = document.createElement('span');
    coordSpan.style.cssText = 'color: var(--text-muted); font-size: 0.65rem;';
    coordSpan.textContent = `${poi.lat.toFixed(5)}, ${poi.lon.toFixed(5)}`;
    actionDiv.appendChild(coordSpan);

    if (idx > 0) {
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.innerHTML = '&times;';
      deleteBtn.style.cssText = 'background: none; border: none; color: #ef4444; cursor: pointer; padding: 0 4px; font-size: 1rem; line-height: 1; transition: opacity 0.2s;';
      if (typeof deleteBtn.addEventListener === 'function') {
        deleteBtn.addEventListener('mouseover', () => { deleteBtn.style.opacity = '0.7'; });
        deleteBtn.addEventListener('mouseout', () => { deleteBtn.style.opacity = '1.0'; });
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          deletePoi(idx);
        });
      }
      actionDiv.appendChild(deleteBtn);
    }

    item.appendChild(actionDiv);
    container.appendChild(item);
  });
  updateLayerPoiSelectOptions();
}

function clearAllPois() {
  pois.forEach((poi, idx) => {
    if (idx > 0 && poi.marker) {
      map.removeLayer(poi.marker);
    }
  });
  pois = [];
  if (centerMarker) {
    pois[0] = {
      id: `poi-center-${Date.now()}`,
      lat: centerMarker.getLatLng().lat,
      lon: centerMarker.getLatLng().lng,
      alt: 0,
      marker: centerMarker,
      name: "POI 0 (Center)"
    };
    updatePoiMarkerPopup(pois[0], 0);
  }

  const defaultPoiId = (pois[0] && pois[0].id) || null;
  const wps = getCurrentWaypoints();
  if (wps) {
    wps.forEach(wp => {
      wp.poiIndex = 0;
      wp.targetPoiId = defaultPoiId;
    });
  }
  if (roadWaypoints) {
    roadWaypoints.forEach(wp => {
      wp.poiIndex = 0;
      wp.targetPoiId = defaultPoiId;
    });
  }
  if (typeof flightLayers !== 'undefined' && Array.isArray(flightLayers)) {
    flightLayers.forEach(l => {
      l.targetPoiId = defaultPoiId;
      if (Array.isArray(l.waypoints)) {
        l.waypoints.forEach(wp => {
          wp.poiIndex = 0;
          wp.targetPoiId = defaultPoiId;
        });
      }
    });
  }

  updatePoiListUI();
  updateGrid();
}


function recalculateRoadOffsetPath(centerLat, centerLon) {
  if (!roadWaypoints || roadWaypoints.length === 0) {
    generatedWaypoints = [];
    generatedPhotos = [];
    return;
  }

  const roadOffsetSlider = document.getElementById('road-offset');
  const D = roadOffsetSlider ? parseFloat(roadOffsetSlider.value) : 15;
  const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
  const isRoadLayer = activeLayer && activeLayer.pattern === 'road-following';
  const altitude = (isRoadLayer && activeLayer.altitude !== undefined && activeLayer.altitude !== null && activeLayer.altitude !== 'inherit')
    ? activeLayer.altitude
    : (parseFloat(document.getElementById('altitude')?.value) || 50);

  const targetList = (generatedWaypoints && generatedWaypoints.length >= roadWaypoints.length) ? generatedWaypoints : roadWaypoints;

  generatedWaypoints = targetList.map((wp, idx) => {
    const roadNode = (roadWaypoints && roadWaypoints[idx]) ? roadWaypoints[idx] : (roadWaypoints ? roadWaypoints[Math.min(idx, roadWaypoints.length - 1)] : wp);

    // 1. Calculate stable tangent vector using lookahead/lookbehind (minimum 10.0m distance)
    let tx = 0;
    let ty = 1;
    if (roadWaypoints.length > 1) {
      const MIN_DIST = 10.0;
      const rIdx = Math.min(idx, roadWaypoints.length - 1);
      let prev = roadWaypoints[rIdx];
      let next = roadWaypoints[rIdx];

      // Find backward point at least MIN_DIST meters away
      for (let i = rIdx - 1; i >= 0; i--) {
        const dx = roadWaypoints[i].x - roadWaypoints[rIdx].x;
        const dy = roadWaypoints[i].y - roadWaypoints[rIdx].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist >= MIN_DIST) {
          prev = roadWaypoints[i];
          break;
        }
      }
      if (prev === roadWaypoints[rIdx] && rIdx > 0) {
        prev = roadWaypoints[0];
      }

      // Find forward point at least MIN_DIST meters away
      for (let i = rIdx + 1; i < roadWaypoints.length; i++) {
        const dx = roadWaypoints[i].x - roadWaypoints[rIdx].x;
        const dy = roadWaypoints[i].y - roadWaypoints[rIdx].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist >= MIN_DIST) {
          next = roadWaypoints[i];
          break;
        }
      }
      if (next === roadWaypoints[rIdx] && rIdx < roadWaypoints.length - 1) {
        next = roadWaypoints[roadWaypoints.length - 1];
      }

      let vx = next.x - prev.x;
      let vy = next.y - prev.y;

      // Fallback if the path is extremely short or overlapping
      if (vx === 0 && vy === 0) {
        if (idx === 0) {
          vx = roadWaypoints[1].x - roadWaypoints[0].x;
          vy = roadWaypoints[1].y - roadWaypoints[0].y;
        } else if (idx === roadWaypoints.length - 1) {
          vx = roadWaypoints[roadWaypoints.length - 1].x - roadWaypoints[roadWaypoints.length - 2].x;
          vy = roadWaypoints[roadWaypoints.length - 1].y - roadWaypoints[roadWaypoints.length - 2].y;
        } else {
          vx = roadWaypoints[idx + 1].x - roadWaypoints[idx - 1].x;
          vy = roadWaypoints[idx + 1].y - roadWaypoints[idx - 1].y;
        }
      }

      const len = Math.sqrt(vx * vx + vy * vy);
      if (len > 0) {
        tx = vx / len;
        ty = vy / len;
      }
    }

    // 2. Project drone position (offset by D along normal)
    // Normal is (ty, -tx)
    const droneX = roadNode.x + D * ty;
    const droneY = roadNode.y - D * tx;

    // 3. Convert drone local coordinates back to geodetic lat/lon
    const geo = localToGeodetic(droneX, droneY, centerLat, centerLon, 0);

    const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
    const roadFocusMode = (activeLayer && activeLayer.roadFocusMode) ? activeLayer.roadFocusMode : (document.getElementById('road-focus-mode')?.value || 'focusRoad');

    // 4. Calculate gimbal pitch and heading pointing to the road
    const altVal = (roadNode && roadNode.alt !== undefined && roadNode.alt !== null)
      ? roadNode.alt
      : ((wp && wp.alt !== undefined && wp.alt !== null)
        ? wp.alt
        : altitude);
    let calculatedRoadPitch;
    if (Math.abs(D) < 0.01) {
      calculatedRoadPitch = -90;
    } else {
      calculatedRoadPitch = -Math.round(Math.atan2(altVal, Math.max(Math.abs(D), 1)) * (180.0 / Math.PI));
    }

    let lookAheadPitch = calculatedRoadPitch;
    let lookAheadHeading = null;
    if (idx < roadWaypoints.length - 1) {
      const nextNode = roadWaypoints[idx + 1];
      const dNext = Math.hypot(nextNode.x - droneX, nextNode.y - droneY);
      lookAheadPitch = -Math.round(Math.atan2(altVal, Math.max(dNext, 1)) * (180.0 / Math.PI));
      lookAheadHeading = (Math.atan2(nextNode.x - droneX, nextNode.y - droneY) * (180.0 / Math.PI) + 360) % 360;
    }

    let pitchVal = wp.pitch;
    if (pitchVal === null || pitchVal === undefined) {
      if (roadFocusMode === 'lookAhead') {
        pitchVal = lookAheadPitch;
      } else if (roadFocusMode === 'focusRoad' || activeLayer?.gimbalPitch === 'auto' || activeLayer?.gimbalPitch === null || activeLayer?.gimbalPitch === undefined) {
        pitchVal = calculatedRoadPitch;
      } else {
        pitchVal = (typeof activeLayer?.gimbalPitch === 'number' && !isNaN(activeLayer.gimbalPitch)) ? activeLayer.gimbalPitch : calculatedRoadPitch;
      }
    }
    
    // Resolve heading and headingMode
    const mode = wp.headingMode || 'inherit';
    let effectiveMode = mode;
    if (mode === 'inherit') {
      const globalMode = document.getElementById('heading-mode')?.value;
      effectiveMode = globalMode || 'followWayline';
    }

    // Default standard road-facing heading (pointing from drone to the road segment)
    let standardRoadFacing;
    if (Math.abs(D) < 0.01) {
      standardRoadFacing = Math.atan2(tx, ty) * (180.0 / Math.PI);
    } else {
      standardRoadFacing = Math.atan2(roadNode.x - droneX, roadNode.y - droneY) * (180.0 / Math.PI);
    }
    standardRoadFacing = (standardRoadFacing + 360) % 360;

    let forwardRoadHeading = (Math.atan2(tx, ty) * (180.0 / Math.PI) + 360) % 360;

    let headingVal;
    if (effectiveMode === 'custom' && wp.heading !== null && wp.heading !== undefined) {
      headingVal = wp.heading;
    } else if (effectiveMode === 'fixed') {
      headingVal = 0;
    } else if (effectiveMode === 'towardPOI') {
      const selectedPoiIndex = wp.poiIndex || 0;
      const targetPoi = pois[selectedPoiIndex];
      if (targetPoi) {
        const dy = targetPoi.lat - geo.lat;
        const dx = targetPoi.lon - geo.lon;
        headingVal = (90 - (Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360;
      } else {
        headingVal = standardRoadFacing;
      }
    } else if (roadFocusMode === 'followRoad' || (effectiveMode === 'followWayline' && roadFocusMode === 'custom')) {
      headingVal = forwardRoadHeading;
    } else if (roadFocusMode === 'lookAhead' && lookAheadHeading !== null) {
      headingVal = lookAheadHeading;
    } else {
      // Default: focusRoad (cross-track road targeting)
      headingVal = standardRoadFacing;
    }
    headingVal = (headingVal + 360) % 360;

    const existingGwp = (generatedWaypoints && generatedWaypoints[idx]) ? generatedWaypoints[idx] : null;
    const isCustomPosition = (existingGwp && !!existingGwp.isModified);

    const finalLat = isCustomPosition ? existingGwp.lat : geo.lat;
    const finalLon = isCustomPosition ? existingGwp.lon : geo.lon;
    const finalX = isCustomPosition ? existingGwp.x : droneX;
    const finalY = isCustomPosition ? existingGwp.y : droneY;

    const finalAlt = (existingGwp && existingGwp.alt !== undefined && existingGwp.alt !== null && existingGwp.isModified) ? existingGwp.alt : altVal;
    const finalPitch = (existingGwp && existingGwp.pitch !== undefined && existingGwp.pitch !== null && existingGwp.isModified) ? existingGwp.pitch : pitchVal;
    const finalSpeed = (existingGwp && existingGwp.speed !== undefined && existingGwp.speed !== null) ? existingGwp.speed : (wp.speed !== undefined ? wp.speed : null);
    const finalHover = (existingGwp && existingGwp.hoverTime !== undefined && existingGwp.hoverTime !== null) ? existingGwp.hoverTime : (wp.hoverTime !== undefined ? wp.hoverTime : null);
    const finalTurn = (existingGwp && existingGwp.turnMode !== undefined && existingGwp.turnMode !== null) ? existingGwp.turnMode : (wp.turnMode || 'inherit');
    const finalAction = (existingGwp && existingGwp.cameraAction !== undefined && existingGwp.cameraAction !== null) ? existingGwp.cameraAction : (wp.cameraAction || 'inherit');
    const finalZoom = (existingGwp && existingGwp.zoom !== undefined && existingGwp.zoom !== null) ? existingGwp.zoom : (wp.zoom !== undefined ? wp.zoom : 1.0);

    if (existingGwp) {
      existingGwp.lat = finalLat;
      existingGwp.lon = finalLon;
      existingGwp.x = finalX;
      existingGwp.y = finalY;
      existingGwp.alt = finalAlt;
      existingGwp.pitch = finalPitch;
      existingGwp.heading = headingVal;
      existingGwp.headingMode = (mode !== 'inherit') ? mode : ((roadFocusMode === 'focusRoad' || roadFocusMode === 'lookAhead') ? 'smoothTransition' : 'inherit');
      existingGwp.roadFocusMode = roadFocusMode;
      existingGwp.roadNodeLat = roadNode.lat;
      existingGwp.roadNodeLon = roadNode.lon;
      existingGwp.speed = finalSpeed;
      existingGwp.hoverTime = finalHover;
      existingGwp.turnMode = finalTurn;
      existingGwp.cameraAction = finalAction;
      existingGwp.zoom = finalZoom;
      existingGwp.poiIndex = wp.poiIndex || 0;
      if (existingGwp.origLat === undefined || existingGwp.origLat === null) {
        existingGwp.origLat = geo.lat;
        existingGwp.origLon = geo.lon;
        existingGwp.origX = droneX;
        existingGwp.origY = droneY;
      }
      if (existingGwp.origAlt === undefined || existingGwp.origAlt === null) existingGwp.origAlt = altVal;
      if (existingGwp.origPitch === undefined || existingGwp.origPitch === null) existingGwp.origPitch = pitchVal;
      if (existingGwp.origHeading === undefined) existingGwp.origHeading = headingVal;
      if (existingGwp.origHeadingMode === undefined) existingGwp.origHeadingMode = mode;
      if (existingGwp.origSpeed === undefined) existingGwp.origSpeed = wp.origSpeed !== undefined ? wp.origSpeed : null;
      if (existingGwp.origHoverTime === undefined) existingGwp.origHoverTime = wp.origHoverTime !== undefined ? wp.origHoverTime : null;
      if (existingGwp.origTurnMode === undefined) existingGwp.origTurnMode = wp.origTurnMode || 'inherit';
      if (existingGwp.origCameraAction === undefined) existingGwp.origCameraAction = wp.origCameraAction || 'inherit';
      if (existingGwp.origZoom === undefined) existingGwp.origZoom = wp.origZoom !== undefined ? wp.origZoom : 1.0;
      if (existingGwp.origPoiIndex === undefined) existingGwp.origPoiIndex = wp.origPoiIndex || 0;
      if (activeLayer) {
        existingGwp.layerId = activeLayer.id;
        existingGwp.layerName = activeLayer.name;
        existingGwp.layerColor = activeLayer.color;
        existingGwp.layerPattern = activeLayer.pattern;
        existingGwp.layerCaptureMode = activeLayer.captureMode || 'inherit';
        existingGwp.layerPathMode = activeLayer.pathMode || 'inherit';
      }
      existingGwp.captureMode = (wp && wp.captureMode !== undefined) ? wp.captureMode : 'inherit';
      existingGwp.isRingStart = wp.isRingStart || false;
      existingGwp.idx = idx;
      return existingGwp;
    }

    return {
      lat: finalLat,
      lon: finalLon,
      x: finalX,
      y: finalY,
      alt: finalAlt,
      pitch: finalPitch,
      heading: headingVal,
      headingMode: (mode !== 'inherit') ? mode : ((roadFocusMode === 'focusRoad' || roadFocusMode === 'lookAhead') ? 'smoothTransition' : 'inherit'),
      roadFocusMode: roadFocusMode,
      roadNodeLat: roadNode.lat,
      roadNodeLon: roadNode.lon,
      isRoadDroneWaypoint: true,
      layerId: activeLayer ? activeLayer.id : (wp && wp.layerId ? wp.layerId : undefined),
      layerName: activeLayer ? activeLayer.name : (wp && wp.layerName ? wp.layerName : undefined),
      layerColor: activeLayer ? activeLayer.color : (wp && wp.layerColor ? wp.layerColor : undefined),
      layerPattern: activeLayer ? activeLayer.pattern : (wp && wp.layerPattern ? wp.layerPattern : undefined),
      layerCaptureMode: activeLayer ? (activeLayer.captureMode || 'inherit') : (wp && wp.layerCaptureMode ? wp.layerCaptureMode : 'inherit'),
      layerPathMode: activeLayer ? (activeLayer.pathMode || 'inherit') : (wp && wp.layerPathMode ? wp.layerPathMode : 'inherit'),
      captureMode: (wp && wp.captureMode !== undefined) ? wp.captureMode : 'inherit',
      speed: finalSpeed,
      hoverTime: finalHover,
      turnMode: finalTurn,
      cameraAction: finalAction,
      zoom: finalZoom,
      poiIndex: wp.poiIndex || 0,
      origLat: geo.lat,
      origLon: geo.lon,
      origX: droneX,
      origY: droneY,
      origAlt: altVal,
      origPitch: pitchVal,
      origHeading: headingVal,
      origHeadingMode: mode,
      origSpeed: wp.origSpeed !== undefined ? wp.origSpeed : null,
      origHoverTime: wp.origHoverTime !== undefined ? wp.origHoverTime : null,
      origTurnMode: wp.origTurnMode || 'inherit',
      origCameraAction: wp.origCameraAction || 'inherit',
      origZoom: wp.origZoom !== undefined ? wp.origZoom : 1.0,
      origPoiIndex: wp.origPoiIndex || 0,
      isRingStart: wp.isRingStart || false,
      isModified: false,
      ringIndex: wp.ringIndex !== undefined ? wp.ringIndex : null,
      idx: idx
    };
  });

  generatedPhotos = generatedWaypoints.map(wp => ({
    lat: wp.lat,
    lon: wp.lon,
    x: wp.x,
    y: wp.y,
    alt: wp.alt,
    pitch: wp.pitch,
    heading: wp.heading
  }));
}

function updateGrid() {
  if (!centerMarker) {
    // Show empty stats if map center not set yet
    updateStatsPanel(null);
    return;
  }

  const centerLatLng = centerMarker.getLatLng();
  const centerLat = centerLatLng.lat;
  const centerLon = centerLatLng.lng;

  // Retrieve slider values
  const gridWidth = parseFloat(document.getElementById('grid-width')?.value) || 100;
  const gridHeight = parseFloat(document.getElementById('grid-height')?.value) || 100;
  const rotation = parseFloat(document.getElementById('grid-rotation')?.value) || 0;
  const speed = parseFloat(document.getElementById('speed')?.value) || 4;
  const captureMode = document.getElementById('capture-mode')?.value || 'stopAndShoot';
  const defaultGimbalPitch = parseGimbalPitch(document.getElementById('gimbal-pitch')?.value, -60);

  // If imported mission is active, use imported waypoints instead of generating
  let waypoints = [];
  let photoLocations = [];
  let sLine = null;
  let sPhoto = null;
  let actualRotation = rotation;

  if (importedWaypoints) {
    generatedWaypoints = null;
    generatedPhotos = null;

    // Re-project local offsets in place relative to the new centerLatLng
    importedWaypoints.forEach(wp => {
      const geo = localToGeodetic(wp.x, wp.y, centerLat, centerLon, 0); // 0 rotation since offsets already hold rotation
      wp.lat = geo.lat;
      wp.lon = geo.lon;
      if (wp.speed === null || wp.speed === undefined) {
        wp.speed = speed;
      }
    });

    importedPhotos.forEach(pt => {
      const geo = localToGeodetic(pt.x, pt.y, centerLat, centerLon, 0);
      pt.lat = geo.lat;
      pt.lon = geo.lon;
      if (pt.pitch === null || pt.pitch === undefined) {
        pt.pitch = defaultGimbalPitch;
      }
    });

    waypoints = importedWaypoints;
    photoLocations = importedPhotos;
  } else {
    saveActiveLayerFromUi();
    const compiled = compileMultiLayerMission(centerLat, centerLon);
    waypoints = compiled.waypoints;
    photoLocations = compiled.photos;
    sLine = compiled.sLine;
    sPhoto = compiled.sPhoto;
    generatedWaypoints = waypoints;
    generatedPhotos = photoLocations;
  }

  // 4. Update Map Drawings
  drawFlightPath(waypoints, photoLocations, centerLat, centerLon, gridWidth, gridHeight, actualRotation);

  // 5. Update Stats Panel
  const stats = calculateStats(waypoints, photoLocations, speed, sLine, sPhoto, captureMode);
  updateStatsPanel(stats);

  // 6. Update Layers List UI
  renderLayersList();

  // 7. Update 3D Preview if active
  if (typeof threeScene !== 'undefined' && threeScene) {
    if (typeof recreate3DWaypointsAndPaths === 'function') {
      recreate3DWaypointsAndPaths();
    }
    if (typeof showFootprints !== 'undefined' && showFootprints && typeof redrawGroundPlane === 'function') {
      redrawGroundPlane(0, 0);
    }
    if (typeof fpvActive !== 'undefined' && fpvActive && typeof updateFPVCamera === 'function') {
      updateFPVCamera(0);
      if (typeof updateFPVEditorUI === 'function') updateFPVEditorUI();
    }
  }
}

function redrawCurrentMission() {
  if (!centerMarker) return;

  const gridTypeEl = document.getElementById('grid-type');
  const gridType = gridTypeEl ? gridTypeEl.value : 'single';
  if (gridType === 'road-following') {
    updateGrid();
    return;
  }

  const waypoints = getCurrentWaypoints();
  const photoLocations = getCurrentPhotos();
  if (!waypoints || waypoints.length === 0) return;

  const centerLatLng = centerMarker.getLatLng();
  const centerLat = centerLatLng.lat;
  const centerLon = centerLatLng.lng;
  const gridWidth = parseFloat(document.getElementById('grid-width')?.value) || 100;
  const gridHeight = parseFloat(document.getElementById('grid-height')?.value) || 100;
  const rotation = parseFloat(document.getElementById('grid-rotation')?.value) || 0;
  const speed = parseFloat(document.getElementById('speed')?.value) || 4;
  const captureMode = document.getElementById('capture-mode')?.value || 'time';

  const actualRotation = (gridType === 'orbit' || gridType === 'multi-orbit') ? 0 : rotation;

  drawFlightPath(waypoints, photoLocations, centerLat, centerLon, gridWidth, gridHeight, actualRotation);

  const stats = calculateStats(waypoints, photoLocations, speed, null, null, captureMode);
  updateStatsPanel(stats);

  // Update 3D Preview if active
  if (typeof threeScene !== 'undefined' && threeScene) {
    if (typeof recreate3DWaypointsAndPaths === 'function') {
      recreate3DWaypointsAndPaths();
    }
    if (typeof showFootprints !== 'undefined' && showFootprints && typeof redrawGroundPlane === 'function') {
      redrawGroundPlane(0, 0);
    }
    if (typeof fpvActive !== 'undefined' && fpvActive && typeof updateFPVCamera === 'function') {
      updateFPVCamera(0);
      if (typeof updateFPVEditorUI === 'function') updateFPVEditorUI();
    }
  }
}

// Generate relative meter-offset grid points
