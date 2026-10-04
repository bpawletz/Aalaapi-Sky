function isPointInGeoJsonPolygon(lat, lon, geometry) {
  if (!geometry || !geometry.coordinates || lat == null || lon == null || isNaN(lat) || isNaN(lon)) return false;
  
  function pointInRing(px, py, ring) {
    if (!ring || ring.length < 3) return false;
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1];
      const xj = ring[j][0], yj = ring[j][1];
      const intersect = ((yi > py) !== (yj > py)) &&
        (px < (xj - xi) * (py - yi) / ((yj - yi) || 0.000001) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  if (geometry.type === 'Polygon') {
    return pointInRing(lon, lat, geometry.coordinates[0]);
  } else if (geometry.type === 'MultiPolygon') {
    for (let poly of geometry.coordinates) {
      if (pointInRing(lon, lat, poly[0])) return true;
    }
  }
  return false;
}

function getGeoJsonCentroid(geometry) {
  if (!geometry || !geometry.coordinates) return null;
  let pts = [];
  if (geometry.type === 'Polygon' && geometry.coordinates[0]) {
    pts = geometry.coordinates[0];
  } else if (geometry.type === 'MultiPolygon' && geometry.coordinates[0] && geometry.coordinates[0][0]) {
    pts = geometry.coordinates[0][0];
  } else if (geometry.type === 'Point') {
    return { lon: geometry.coordinates[0], lng: geometry.coordinates[0], lat: geometry.coordinates[1] };
  }
  if (!pts || pts.length === 0) return null;
  let sumLon = 0, sumLat = 0, count = 0;
  for (let p of pts) {
    if (typeof p[0] === 'number' && typeof p[1] === 'number') {
      sumLon += p[0];
      sumLat += p[1];
      count++;
    }
  }
  if (count === 0) return null;
  const avgLon = sumLon / count;
  const avgLat = sumLat / count;
  return { lon: avgLon, lng: avgLon, lat: avgLat };
}

function formatTfrDistance(distKm, isInside = false, compassDir = '') {
  if (isInside) return '⚠️ INSIDE TFR';
  if (distKm === null || distKm === undefined || isNaN(distKm)) return '-';
  const nm = distKm / 1.852;
  const dirSuffix = compassDir ? ` ${compassDir}` : '';
  const unit = (typeof getUnitSystem === 'function') ? getUnitSystem() : 'imperial';
  if (unit === 'metric') {
    return `${nm.toFixed(1)} NM (${Number(distKm).toFixed(1)} km)${dirSuffix}`;
  }
  return `${nm.toFixed(1)} NM${dirSuffix}`;
}

function sanitizeNotamHtml(rawHtml) {
  if (!rawHtml || typeof rawHtml !== 'string') return '';
  const regexStrip = (s) => {
    return s
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
      .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
      .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '')
      .replace(/\s+on\w+\s*=\s*"[^"]*"/gi, '')
      .replace(/\s+on\w+\s*=\s*'[^']*'/gi, '')
      .replace(/\s+on\w+\s*=\s*[^\s>]+/gi, '')
      .replace(/javascript:[^"']*/gi, '');
  };

  if (typeof DOMParser === 'undefined') {
    return regexStrip(rawHtml);
  }
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHtml, 'text/html');
    if (!doc || typeof doc.querySelectorAll !== 'function' || !doc.body) {
      return regexStrip(rawHtml);
    }
    const dangerous = doc.querySelectorAll('script, iframe, object, embed, form, input, button, link, meta, style');
    dangerous.forEach(el => el.remove());
    const allElements = doc.querySelectorAll('*');
    allElements.forEach(el => {
      const attrs = Array.from(el.attributes || []);
      for (const attr of attrs) {
        if (attr.name.startsWith('on') || (typeof attr.value === 'string' && attr.value.toLowerCase().includes('javascript:'))) {
          el.removeAttribute(attr.name);
        }
      }
    });
    return doc.body.innerHTML;
  } catch (e) {
    return regexStrip(rawHtml);
  }
}

async function fetchAndProcessTFRs(centerLat, centerLon, force = false) {
  if (centerLat == null || centerLon == null || isNaN(centerLat) || isNaN(centerLon)) return;
  if (!force && tfrLastFetchCenter) {
    const distKm = calculateDistance(centerLat, centerLon, tfrLastFetchCenter.lat, tfrLastFetchCenter.lon);
    if (distKm < 5 && tfrActiveNotams.length > 0) {
      filterAndUpdateTfrUI(centerLat, centerLon);
      return;
    }
  }

  tfrLastFetchCenter = { lat: centerLat, lon: centerLon };
  updateTfrPanelUI(null, "Checking FAA NOTAMs...", true);

  let notamList = [];
  let geojson = null;

  // Tier 1: Companion Bridge Proxy (dynamically resolved host, e.g. Port 8765)
  const apiBase = (typeof getCompanionApiBase === 'function') ? getCompanionApiBase() : 'http://127.0.0.1:8765';
  try {
    const notamRes = await fetch(`${apiBase}/api/tfr/notams${force ? '?refresh=true' : ''}`, { signal: AbortSignal.timeout(3000) });
    if (notamRes.ok) {
      const json = await notamRes.json();
      if (json && json.success && Array.isArray(json.data)) notamList = json.data;
    }
  } catch (err) {}

  try {
    const geoRes = await fetch(`${apiBase}/api/tfr/geojson${force ? '?refresh=true' : ''}`, { signal: AbortSignal.timeout(4000) });
    if (geoRes.ok) {
      const json = await geoRes.json();
      if (json && json.success && json.data) geojson = json.data;
    }
  } catch (err) {}

  // Tier 2: Static repository cache (zero-latency, CORS-safe bundle for GitHub Pages / web hosting)
  if (notamList.length === 0) {
    try {
      const staticNotamRes = await fetch('./data/tfr_notams.json', { signal: AbortSignal.timeout(4000) });
      if (staticNotamRes.ok) {
        const data = await staticNotamRes.json();
        if (Array.isArray(data) && data.length > 0) notamList = data;
      }
    } catch (e) {}
  }

  if (!geojson || !geojson.features || geojson.features.length === 0) {
    try {
      const staticGeoRes = await fetch('./data/tfr_geojson.json', { signal: AbortSignal.timeout(4000) });
      if (staticGeoRes.ok) {
        const g = await staticGeoRes.json();
        if (g && Array.isArray(g.features) && g.features.length > 0) geojson = g;
      }
    } catch (e) {}
  }

  // Tier 3: Native FAA ArcGIS Online FeatureServers (Stadiums, Defense Airspace, Part-Time Security UAS)
  // Merged into geojson features so active TFR polygons and stadiums both coexist cleanly
  try {
    const arcgisUrls = [
      { url: 'https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/National_Defense_Airspace_TFR_Areas/FeatureServer/0/query?where=1%3D1&outFields=*&returnGeometry=true&f=geojson', type: 'defense' },
      { url: 'https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/Stadiums/FeatureServer/0/query?where=1%3D1&outFields=*&returnGeometry=true&f=geojson', type: 'stadium' },
      { url: 'https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/Part_Time_National_Security_UAS_Flight_Restrictions/FeatureServer/0/query?where=1%3D1&outFields=*&returnGeometry=true&f=geojson', type: 'security' }
    ];
    const results = await Promise.allSettled(arcgisUrls.map(item => fetch(item.url, { signal: AbortSignal.timeout(6000) }).then(r => r.json()).then(data => ({ data, type: item.type }))));
    const arcgisFeatures = [];
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value && r.value.data && Array.isArray(r.value.data.features)) {
        const ftype = r.value.type;
        r.value.data.features.forEach(f => {
          if (!f.properties) f.properties = {};
          if (ftype === 'stadium') {
            f.properties._sourceType = 'stadium';
            f.properties.isStadium = true;
          }
          arcgisFeatures.push(f);
        });
      }
    }
    if (arcgisFeatures.length > 0) {
      const existingFeatures = (geojson && Array.isArray(geojson.features)) ? geojson.features : [];
      geojson = { type: 'FeatureCollection', features: [...existingFeatures, ...arcgisFeatures] };
    }
  } catch (e) {}

  processTfrData(geojson, notamList, centerLat, centerLon);
}

function processTfrData(geojson, notamList, centerLat, centerLon) {
  const notamMap = new Map();
  if (Array.isArray(notamList)) {
    for (const n of notamList) {
      if (n.notam_id) notamMap.set(String(n.notam_id).trim(), n);
      if (n.gid) notamMap.set(String(n.gid).trim(), n);
    }
  }

  const features = (geojson && Array.isArray(geojson.features)) ? geojson.features : [];
  const processed = [];

  for (const feat of features) {
    if (!feat.geometry) continue;
    const props = feat.properties || {};
    let notamId = props.notam_id || props.NOTAM_KEY || feat.id || '';
    if (typeof notamId === 'string' && notamId.startsWith('V_TFR_LOC.')) {
      notamId = notamId.replace('V_TFR_LOC.', '');
    }
    if (typeof notamId === 'string' && notamId.includes('-')) {
      notamId = notamId.split('-')[0];
    }
    notamId = String(notamId).trim();

    const matchedNotam = notamMap.get(notamId) || {};
    const hasLiveNotam = !!(matchedNotam.notam_id || matchedNotam.gid);

    // Identify if this feature represents a stadium venue
    const isStadiumVenue = props._sourceType === 'stadium' || props.isStadium === true || props.TYPE === 'STADIUM' || props.LEGAL === 'STADIUM' || (props.TITLE && props.TITLE.toLowerCase().includes('stadium')) || (props.NAME && (props.CITY || props.LATITUDE || props.OBJECTID) && !props.notam_id && !props.NOTAM_KEY);
    const isStandbyStadium = isStadiumVenue && !hasLiveNotam;

    let title;
    let type;
    if (isStandbyStadium) {
      title = props.NAME || props.TITLE || 'Major Sporting Venue';
      type = 'STADIUM';
      if (props.NAME) notamId = String(props.NAME).trim();
    } else {
      title = matchedNotam.description || props.TITLE || props.title || props.NAME || props.TxtName || 'Temporary Flight Restriction';
      type = matchedNotam.type || props.LEGAL || props.TYPE_CODE || 'TFR';
    }

    const state = matchedNotam.state || props.STATE || props.state || '';
    const city = props.CITY || props.city || '';
    const centroid = getGeoJsonCentroid(feat.geometry);

    let distKm = null;
    let distNM = null;
    let bearing = null;
    let compassDir = '';
    let isInside = false;
    let isInsideStadiumZone = false;

    if (centroid && centerLat != null && centerLon != null) {
      distKm = calculateDistance(centerLat, centerLon, centroid.lat, centroid.lon);
      distNM = distKm / 1.852;
      bearing = getCompassBearing(centerLat, centerLon, centroid.lat, centroid.lon);
      compassDir = bearingToCompassDirection(bearing);
      if (isStadiumVenue && distNM <= 3.0) {
        isInsideStadiumZone = true;
      }
    }

    if (centerLat != null && centerLon != null) {
      if (isStandbyStadium) {
        // Standby stadium is not an active emergency TFR violation
        isInside = false;
      } else {
        isInside = isPointInGeoJsonPolygon(centerLat, centerLon, feat.geometry);
        if (isInside) {
          distKm = 0;
          distNM = 0;
        }
      }
    }

    // Augment feature properties for Leaflet popup
    feat.properties = {
      ...props,
      notam_id: notamId,
      title: title,
      type: type,
      state: state,
      city: city,
      isStadium: isStadiumVenue,
      isActiveTfr: !isStandbyStadium,
      isInsideStadiumZone: isInsideStadiumZone,
      stadiumId: feat.id || props.OBJECTID || null,
      distanceKm: distKm,
      distanceNM: distNM,
      bearing: bearing,
      compassDir: compassDir,
      isInside: isInside
    };

    processed.push({
      notamId: notamId,
      title: title,
      type: type,
      state: state,
      city: city,
      isStadium: isStadiumVenue,
      isActiveTfr: !isStandbyStadium,
      isInsideStadiumZone: isInsideStadiumZone,
      stadiumId: feat.id || props.OBJECTID || null,
      centroid: centroid,
      geometry: feat.geometry,
      distanceKm: distKm,
      distanceNM: distNM,
      bearing: bearing,
      compassDir: compassDir,
      isInside: isInside,
      feature: feat
    });
  }

  // Also process NOTAMs without shapes
  if (Array.isArray(notamList)) {
    for (const n of notamList) {
      const nid = String(n.notam_id || n.gid || '').trim();
      if (nid && !processed.some(p => p.notamId === nid)) {
        processed.push({
          notamId: nid,
          title: n.description || `TFR ${n.type || 'Notice'}`,
          type: n.type || 'TFR',
          state: n.state || '',
          city: '',
          isStadium: false,
          isActiveTfr: true,
          isInsideStadiumZone: false,
          stadiumId: null,
          centroid: null,
          geometry: null,
          distanceKm: 99999,
          distanceNM: 99999,
          bearing: null,
          compassDir: '',
          isInside: false,
          feature: null
        });
      }
    }
  }

  tfrActiveFeatures = features;
  tfrActiveNotams = processed;

  // Update Leaflet layer if available
  if (tfrAirspaceLayer) {
    tfrAirspaceLayer.clearLayers();
    if (features.length > 0) {
      tfrAirspaceLayer.addData({ type: 'FeatureCollection', features: features });
    }
  }

  filterAndUpdateTfrUI(centerLat, centerLon);
  return processed;
}

function filterAndUpdateTfrUI(centerLat, centerLon) {
  if (!tfrActiveNotams || tfrActiveNotams.length === 0) {
    updateTfrPanelUI([], "No active TFRs detected", false);
    return;
  }

  // Recalculate distance / bearing if coordinates changed
  if (centerLat != null && centerLon != null) {
    for (const item of tfrActiveNotams) {
      const isStandby = item.isStadium && item.isActiveTfr === false;
      if (item.geometry) {
        if (isStandby) {
          item.isInside = false;
        } else {
          item.isInside = isPointInGeoJsonPolygon(centerLat, centerLon, item.geometry);
        }
      }
      if (item.centroid) {
        const rawDistKm = calculateDistance(centerLat, centerLon, item.centroid.lat, item.centroid.lon);
        item.distanceKm = item.isInside ? 0 : rawDistKm;
        item.distanceNM = item.distanceKm / 1.852;
        item.bearing = getCompassBearing(centerLat, centerLon, item.centroid.lat, item.centroid.lon);
        item.compassDir = bearingToCompassDirection(item.bearing);
        if (item.isStadium) {
          item.isInsideStadiumZone = (rawDistKm / 1.852) <= 3.0;
        }
      }
    }
  }

  // Sort by priority: Active TFRs where inside first, then active TFRs by distance, then standby Stadium Advisories by distance
  tfrActiveNotams.sort((a, b) => {
    const aActive = a.isActiveTfr !== false;
    const bActive = b.isActiveTfr !== false;
    if (aActive && !bActive) return -1;
    if (!aActive && bActive) return 1;

    if (a.isInside && !b.isInside) return -1;
    if (!a.isInside && b.isInside) return 1;
    return (a.distanceNM || 99999) - (b.distanceNM || 99999);
  });

  const radiusNM = tfrFilterRadiusNM || 30;
  const filtered = tfrActiveNotams.filter(t => t.isInside || (t.distanceNM != null && t.distanceNM <= radiusNM));

  updateTfrPanelUI(filtered, null, false);
}

function updateTfrPanelUI(tfrList, statusText, isLoading) {
  const badgeEl = document.getElementById('pop-tfr-badge');
  const summaryEl = document.getElementById('pop-tfr-summary');
  const listEl = document.getElementById('pop-tfr-list');
  const headerWarningBadge = document.getElementById('header-tfr-warning-badge');

  if (isLoading) {
    if (badgeEl) {
      badgeEl.textContent = 'UPDATING';
      badgeEl.style.background = 'rgba(56, 189, 248, 0.2)';
      badgeEl.style.color = '#38bdf8';
    }
    if (summaryEl) {
      summaryEl.textContent = statusText || 'Checking FAA NOTAMs...';
      summaryEl.style.color = '#38bdf8';
    }
    if (headerWarningBadge) {
      headerWarningBadge.className = 'header-tfr-badge is-loading';
      headerWarningBadge.textContent = '🔄 TFR';
      headerWarningBadge.title = 'Checking active FAA NOTAMs & TFR boundaries...';
    }
    return;
  }

  const items = Array.isArray(tfrList) ? tfrList : [];
  const radius = tfrFilterRadiusNM >= 9999 ? 'US' : `${tfrFilterRadiusNM} NM`;
  const activeTfrs = items.filter(t => t.isActiveTfr !== false);
  const stadiumAdvisories = items.filter(t => t.isActiveTfr === false && t.isStadium);
  const insideAnyActive = activeTfrs.some(t => t.isInside);
  const nearbyActiveCount = activeTfrs.length;

  // Header Warning & Health Status Badge on Topbar Telemetry Pill
  if (headerWarningBadge) {
    if (insideAnyActive || activeTfrs.some(t => t.distanceNM <= 5)) {
      headerWarningBadge.className = 'header-tfr-badge is-critical';
      headerWarningBadge.textContent = insideAnyActive ? '🚨 IN TFR' : '⚠️ TFR';
      headerWarningBadge.title = insideAnyActive ? 'CRITICAL: Location is inside an active TFR!' : 'Warning: Active TFR within 5 NM of location!';
    } else if (activeTfrs.some(t => t.distanceNM <= 15)) {
      headerWarningBadge.className = 'header-tfr-badge is-warning';
      headerWarningBadge.textContent = '⚠️ TFR';
      headerWarningBadge.title = 'Warning: Active TFR within 15 NM of location';
    } else if (statusText && (statusText.toLowerCase().includes('failed') || statusText.toLowerCase().includes('error') || statusText.toLowerCase().includes('offline') || statusText.toLowerCase().includes('unable'))) {
      headerWarningBadge.className = 'header-tfr-badge is-offline';
      headerWarningBadge.textContent = '⚪ TFR Off';
      headerWarningBadge.title = 'TFR Service: Offline / Unable to connect to FAA servers';
    } else {
      headerWarningBadge.className = 'header-tfr-badge is-operational';
      headerWarningBadge.textContent = '🛡️ TFR';
      if (stadiumAdvisories.length > 0 && activeTfrs.length === 0) {
        headerWarningBadge.title = `FAA TFR Service: Operational (Airspace clear; ${stadiumAdvisories.length} standby stadium advisory nearby)`;
      } else {
        headerWarningBadge.title = `FAA TFR Service: Operational (${items.length === 0 ? 'No active TFRs in range' : 'Airspace clear within 15 NM'})`;
      }
    }
  }

  // Popover TFR Status Badge & Summary
  if (insideAnyActive) {
    if (badgeEl) {
      badgeEl.textContent = 'CRITICAL ALERT';
      badgeEl.style.background = 'rgba(239, 68, 68, 0.3)';
      badgeEl.style.color = '#ef4444';
    }
    if (summaryEl) {
      const active = activeTfrs.find(t => t.isInside);
      summaryEl.textContent = `🚨 LOCATION INSIDE TFR: ${active.notamId || ''} (${active.type || 'RESTRICTION'})`;
      summaryEl.style.color = '#ef4444';
    }
  } else if (nearbyActiveCount > 0) {
    if (badgeEl) {
      badgeEl.textContent = `${nearbyActiveCount} ACTIVE`;
      badgeEl.style.background = 'rgba(245, 158, 11, 0.25)';
      badgeEl.style.color = '#f59e0b';
    }
    if (summaryEl) {
      const closest = activeTfrs[0];
      const distStr = formatTfrDistance(closest.distanceKm, false, closest.compassDir);
      summaryEl.textContent = `⚠️ Closest: ${closest.notamId} • ${distStr} (${closest.type || 'TFR'})`;
      summaryEl.style.color = '#f59e0b';
    }
  } else if (stadiumAdvisories.length > 0) {
    if (badgeEl) {
      badgeEl.textContent = `${stadiumAdvisories.length} VENUE${stadiumAdvisories.length > 1 ? 'S' : ''}`;
      badgeEl.style.background = 'rgba(139, 92, 246, 0.22)';
      badgeEl.style.color = '#a78bfa';
    }
    if (summaryEl) {
      const closest = stadiumAdvisories[0];
      const distStr = formatTfrDistance(closest.distanceKm, false, closest.compassDir);
      const zoneNote = closest.isInsideStadiumZone ? ' • Inside 3 NM Zone' : '';
      summaryEl.textContent = `🏟️ Closest: ${closest.title || closest.notamId} • ${distStr}${zoneNote} (Standby)`;
      summaryEl.style.color = '#a78bfa';
    }
  } else {
    if (badgeEl) {
      badgeEl.textContent = 'CLEAR';
      badgeEl.style.background = 'rgba(16, 185, 129, 0.2)';
      badgeEl.style.color = '#34d399';
    }
    if (summaryEl) {
      summaryEl.textContent = `No active TFRs within ${radius}`;
      summaryEl.style.color = '#34d399';
    }
  }

  // Render TFR cards
  if (listEl) {
    if (typeof listEl.replaceChildren === 'function') listEl.replaceChildren(); else listEl.innerHTML = '';
    if (items.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.style.cssText = 'font-size: 0.7rem; color: var(--text-muted); font-style: italic; padding: 4px 0;';
      emptyDiv.textContent = `No temporary flight restrictions found within ${radius}.`;
      if (typeof listEl.appendChild === 'function') listEl.appendChild(emptyDiv);
      return;
    }

    items.forEach((item, idx) => {
      const isStandbyStadium = item.isStadium && item.isActiveTfr === false;
      const card = document.createElement('div');
      card.className = `tfr-item-card ${item.isInside ? 'is-critical' : ''} ${isStandbyStadium ? 'is-stadium' : ''}`;

      const infoDiv = document.createElement('div');
      infoDiv.className = 'tfr-item-info';

      const headerDiv = document.createElement('div');
      headerDiv.className = 'tfr-item-header';

      const typeBadge = document.createElement('span');
      if (isStandbyStadium) {
        typeBadge.style.cssText = 'font-size: 0.6rem; padding: 1px 5px; border-radius: 3px; font-weight: 700; background: rgba(139, 92, 246, 0.25); color: #c4b5fd; border: 1px solid rgba(139, 92, 246, 0.4);';
        typeBadge.textContent = 'STADIUM';
      } else {
        typeBadge.style.cssText = `font-size: 0.6rem; padding: 1px 4px; border-radius: 3px; font-weight: 700; ${
          item.isInside ? 'background: #ef4444; color: #fff;' : 'background: rgba(245,158,11,0.25); color: #f59e0b;'
        }`;
        typeBadge.textContent = item.type || 'TFR';
      }
      headerDiv.appendChild(typeBadge);

      const idSpan = document.createElement('span');
      idSpan.style.cssText = isStandbyStadium ? 'font-weight: 700; color: var(--text-main);' : '';
      idSpan.textContent = isStandbyStadium ? (item.title || item.notamId) : item.notamId;
      headerDiv.appendChild(idSpan);

      const distSpan = document.createElement('span');
      distSpan.style.cssText = `font-size: 0.68rem; margin-left: auto; ${
        item.isInside ? 'color: #ef4444; font-weight: 700;' : (isStandbyStadium ? 'color: #a78bfa;' : 'color: var(--accent-cyan);')
      }`;
      distSpan.textContent = formatTfrDistance(item.distanceKm, item.isInside, item.compassDir);
      headerDiv.appendChild(distSpan);

      infoDiv.appendChild(headerDiv);

      const descDiv = document.createElement('div');
      descDiv.className = 'tfr-item-desc';
      if (isStandbyStadium) {
        const cityState = (item.city && item.state) ? `${item.city}, ${item.state}` : (item.state || 'US');
        descDiv.innerHTML = `<span style="color:#a78bfa; font-weight:600;">Standby Advisory:</span> Major venue (${cityState}) • 14 CFR § 99.7 active during events ±1 hr`;
      } else {
        descDiv.textContent = item.title;
      }
      infoDiv.appendChild(descDiv);

      card.appendChild(infoDiv);

      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'tfr-item-actions';

      if (item.centroid) {
        const locateBtn = document.createElement('button');
        locateBtn.type = 'button';
        locateBtn.className = 'btn-sm';
        locateBtn.style.cssText = 'padding: 2px 5px; font-size: 0.65rem; background: rgba(255,255,255,0.06); color: var(--text-main); border: 1px solid var(--border-color); border-radius: 4px; cursor: pointer;';
        locateBtn.textContent = '📍';
        locateBtn.title = isStandbyStadium ? 'Focus Stadium on Map' : 'Focus TFR on Map';
        locateBtn.onclick = (e) => {
          e.stopPropagation();
          focusTfrOnMap(item);
        };
        actionsDiv.appendChild(locateBtn);
      }

      const briefBtn = document.createElement('button');
      briefBtn.type = 'button';
      briefBtn.className = 'btn-sm';
      briefBtn.style.cssText = isStandbyStadium
        ? 'padding: 2px 6px; font-size: 0.65rem; background: rgba(139,92,246,0.18); color: #c4b5fd; border: 1px solid rgba(139,92,246,0.35); border-radius: 4px; cursor: pointer; font-weight: 600;'
        : 'padding: 2px 6px; font-size: 0.65rem; background: rgba(56,189,248,0.15); color: #38bdf8; border: 1px solid rgba(56,189,248,0.3); border-radius: 4px; cursor: pointer; font-weight: 600;';
      briefBtn.textContent = 'Briefing';
      briefBtn.onclick = (e) => {
        e.stopPropagation();
        openTfrBriefingModal(item.notamId);
      };
      actionsDiv.appendChild(briefBtn);

      card.appendChild(actionsDiv);
      if (typeof listEl.appendChild === 'function') listEl.appendChild(card);
    });
  }
}

function focusTfrOnMap(target) {
  let item = null;
  if (typeof target === 'object' && target !== null) {
    item = target;
  } else if (typeof target === 'string') {
    item = (tfrActiveNotams || []).find(t => t.notamId === target || t.title === target || String(t.stadiumId) === target);
  } else if (typeof target === 'number') {
    item = (tfrActiveNotams || [])[target];
  }
  if (!item || !map) return;

  // Make sure TFR overlay is enabled and visible
  if (tfrAirspaceLayer && !map.hasLayer(tfrAirspaceLayer)) {
    map.addLayer(tfrAirspaceLayer);
    if (typeof airspaceActiveSet !== 'undefined' && airspaceActiveSet) {
      airspaceActiveSet.add('Temporary Flight Restrictions (TFR / NOTAM) (US Only)');
    }
    if (typeof updateAirspaceLegend === 'function') {
      updateAirspaceLegend();
    }
  }

  const lat = item.centroid ? item.centroid.lat : null;
  const lon = item.centroid ? (item.centroid.lon != null ? item.centroid.lon : item.centroid.lng) : null;

  if (lat != null && lon != null && !isNaN(lat) && !isNaN(lon)) {
    const targetZoom = item.isStadium ? Math.max(map.getZoom(), 13) : Math.max(map.getZoom(), 11);
    map.setView([lat, lon], targetZoom);

    // Attempt to locate and open matching popup
    if (tfrAirspaceLayer) {
      tfrAirspaceLayer.eachLayer(layer => {
        const p = layer.feature && layer.feature.properties ? layer.feature.properties : {};
        if (p.notam_id === item.notamId || p.title === item.title || (p.stadiumId != null && p.stadiumId === item.stadiumId)) {
          if (typeof layer.openPopup === 'function') {
            layer.openPopup(L.latLng(lat, lon));
          }
        }
      });
    }
  }
}

async function openTfrBriefingModal(notamId) {
  const modal = document.getElementById('tfr-briefing-modal');
  const titleEl = document.getElementById('tfr-modal-title');
  const contentEl = document.getElementById('tfr-modal-content');
  const extLink = document.getElementById('tfr-modal-external-link');

  if (!modal || !contentEl) return;

  // Find local item metadata
  const activeList = (typeof window !== 'undefined' && Array.isArray(window.tfrActiveNotams) && window.tfrActiveNotams.length > 0) ? window.tfrActiveNotams : tfrActiveNotams;
  const localItem = activeList ? activeList.find(t => t.notamId === notamId || t.title === notamId || String(t.stadiumId) === String(notamId)) : null;

  modal.classList.remove('hidden');
  if (typeof contentEl.replaceChildren === 'function') contentEl.replaceChildren(); else contentEl.innerHTML = '';

  // Dedicated handling for Standby Stadium Advisories
  if (localItem && (localItem.isStadium || localItem.type === 'STADIUM') && localItem.isActiveTfr === false) {
    const venueName = localItem.title || localItem.notamId || 'Major Sporting Venue';
    if (titleEl) titleEl.textContent = `FAA Airspace Advisory: ${venueName}`;
    if (extLink) {
      extLink.href = 'https://tfr.faa.gov/';
      extLink.textContent = 'FAA TFR Portal ↗';
    }

    const locationStr = [localItem.city, localItem.state].filter(Boolean).join(', ') || 'United States';
    const distText = formatTfrDistance(localItem.distanceKm, false, localItem.compassDir);
    const coordsStr = localItem.centroid ? `${localItem.centroid.lat.toFixed(4)}° N, ${Math.abs(localItem.centroid.lon).toFixed(4)}° W` : 'Coordinates Available';

    const stadiumCard = document.createElement('div');
    stadiumCard.className = 'stadium-briefing-container';
    stadiumCard.style.cssText = 'display:flex; flex-direction:column; gap:12px; font-size:0.78rem; line-height:1.5; color:var(--text-main);';
    stadiumCard.innerHTML = `
      <div style="background: rgba(139,92,246,0.1); border: 1px solid rgba(139,92,246,0.3); border-radius: 8px; padding: 12px;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
          <span style="background: rgba(139,92,246,0.25); color: #c4b5fd; font-size: 0.65rem; font-weight: 700; padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(139,92,246,0.4);">SPORTING VENUE ADVISORY</span>
          <span style="color: #34d399; font-weight: 700; font-size: 0.72rem;">● Standby / Non-Active</span>
        </div>
        <div style="font-size: 1.05rem; font-weight: 700; color: #fff;">🏟️ ${venueName}</div>
        <div style="color: var(--text-muted); font-size: 0.75rem; margin-top: 2px;">Location: <b>${locationStr}</b> (${coordsStr}) • Distance from Pilot: <b style="color: #a78bfa;">${distText}</b></div>
      </div>

      <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 8px;">
        <div><strong style="color: var(--accent-cyan);">Federal Aviation Regulation:</strong> 14 CFR § 99.7 Special Security Instructions (Sporting Events)</div>
        <div><strong style="color: var(--text-main);">Venue Threshold:</strong> Any stadium or speedway with a seating capacity of <b>30,000 or more</b> hosting NCAA Division I football, NFL, MLB, NASCAR, or IndyCar events.</div>
        <div><strong style="color: var(--text-main);">Effective Flight Restriction Window:</strong> Flight restrictions automatically take effect <b>1 hour before</b> scheduled event start time and expire <b>1 hour after</b> event conclusion.</div>
        <div><strong style="color: var(--text-main);">Protected Airspace Dimensions:</strong> Surface up to <b>3,000 ft AGL</b> within a <b>3 Nautical Mile (3 NM / 5.56 km)</b> radius centered on the venue.</div>
        <div><strong style="color: var(--text-main);">Drone (UAS) Compliance:</strong> All UAS flights within the 3 NM perimeter are strictly prohibited during active event windows unless granted explicit FAA airspace authorization/waiver. Outside active event windows, standard Part 107 and Recreational rules apply.</div>
      </div>

      <div style="padding: 10px 12px; background: rgba(56,189,248,0.08); border: 1px solid rgba(56,189,248,0.25); border-radius: 8px; font-size: 0.74rem; color: var(--text-muted);">
        💡 <b>Operational Note:</b> This venue is displayed as a situational advisory because it is within your 30 NM monitor radius. If no game or major event is currently scheduled today, the 3 NM flight restriction is in standby and not active.
      </div>
    `;
    contentEl.appendChild(stadiumCard);
    return;
  }

  if (titleEl) titleEl.textContent = `FAA NOTAM Briefing: FDC ${notamId}`;
  if (extLink) {
    const formattedId = notamId ? notamId.replace('/', '_') : '';
    extLink.href = `https://tfr.faa.gov/tfr3/?page=detail_${formattedId}`;
    extLink.textContent = 'View on FAA Portal ↗';
  }

  const loadingDiv = document.createElement('div');
  loadingDiv.style.cssText = 'padding: 20px; text-align: center; color: var(--text-muted); font-size: 0.8rem;';
  loadingDiv.textContent = 'Loading official NOTAM briefing from FAA servers...';
  contentEl.appendChild(loadingDiv);

  let notamText = null;

  // Try Companion
  try {
    const apiBase = (typeof getCompanionApiBase === 'function') ? getCompanionApiBase() : 'http://127.0.0.1:8765';
    const res = await fetch(`${apiBase}/api/tfr/detail?notamId=${encodeURIComponent(notamId)}`, { signal: AbortSignal.timeout(3500) });
    if (res.ok) {
      const json = await res.json();
      if (json && json.data && json.data[0] && json.data[0].text) {
        notamText = json.data[0].text;
      }
    }
  } catch (e) {}

  if (typeof contentEl.replaceChildren === 'function') contentEl.replaceChildren(); else contentEl.innerHTML = '';

  if (localItem) {
    const metaCard = document.createElement('div');
    metaCard.style.cssText = 'background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 4px; font-size: 0.75rem;';
    metaCard.innerHTML = `
      <div><strong style="color: var(--text-main);">${localItem.title}</strong></div>
      <div style="color: var(--text-muted);">Type: <b style="color: var(--text-main);">${localItem.type || 'TFR'}</b> • State: <b style="color: var(--text-main);">${localItem.state || 'N/A'}</b></div>
      <div style="color: ${localItem.isInside ? '#ef4444' : '#34d399'}; font-weight: 700;">Distance from Pilot: ${formatTfrDistance(localItem.distanceKm, localItem.isInside, localItem.compassDir)}</div>
    `;
    contentEl.appendChild(metaCard);
  }

  if (notamText) {
    const briefingContainer = document.createElement('div');
    briefingContainer.className = 'notam-table-container';
    briefingContainer.innerHTML = sanitizeNotamHtml(notamText);
    contentEl.appendChild(briefingContainer);
  } else {
    const fallbackNotice = document.createElement('div');
    fallbackNotice.style.cssText = 'padding: 16px; background: rgba(245,158,11,0.08); border: 1px solid rgba(245,158,11,0.25); border-radius: 8px; font-size: 0.78rem; color: var(--text-muted); line-height: 1.4;';
    const formattedId = notamId ? notamId.replace('/', '_') : '';
    fallbackNotice.innerHTML = `
      <div style="font-weight: 700; color: #f59e0b; margin-bottom: 4px;">⚠️ Live Text Briefing Offline</div>
      <div>Direct text payload could not be loaded from FAA servers at this moment. You can view the full graphic NOTAM, lateral limits, and official text directly on the FAA TFR Portal.</div>
      <div style="margin-top: 8px;"><a href="https://tfr.faa.gov/tfr3/?page=detail_${formattedId}" target="_blank" rel="noopener noreferrer" style="color: var(--accent-cyan); text-decoration: underline; font-weight: 600;">Open FDC ${notamId} on FAA TFR Portal ↗</a></div>
    `;
    contentEl.appendChild(fallbackNotice);
  }
}

function closeTfrBriefingModal() {
  const modal = document.getElementById('tfr-briefing-modal');
  if (modal) modal.classList.add('hidden');
}

if (typeof window !== 'undefined') {
  window.isPointInGeoJsonPolygon = isPointInGeoJsonPolygon;
  window.getGeoJsonCentroid = getGeoJsonCentroid;
  window.formatTfrDistance = formatTfrDistance;
  window.sanitizeNotamHtml = sanitizeNotamHtml;
  window.fetchAndProcessTFRs = fetchAndProcessTFRs;
  window.processTfrData = processTfrData;
  window.filterAndUpdateTfrUI = filterAndUpdateTfrUI;
  window.updateTfrPanelUI = updateTfrPanelUI;
  window.focusTfrOnMap = focusTfrOnMap;
  window.openTfrBriefingModal = openTfrBriefingModal;
  window.closeTfrBriefingModal = closeTfrBriefingModal;
}


// Helper to update OpenSky link URL based on current map center or mission center
function updateOpenSkyLink() {
  const linkEl = document.getElementById('opensky-link');
  if (linkEl && map) {
    const center = centerMarker ? centerMarker.getLatLng() : map.getCenter();
    linkEl.href = `https://map.opensky-network.org/?lat=${center.lat.toFixed(4)}&lon=${center.lng.toFixed(4)}&zoom=11`;
  }
}

// Interactive Collapsible Help Drawer for Heading Mode
function initHeadingHelpDrawer() {
  const helpBtn = document.getElementById('heading-help-btn');
  const helpDrawer = document.getElementById('heading-help-drawer');
  const tabFollow = document.getElementById('heading-tab-follow');
  const tabFixed = document.getElementById('heading-tab-fixed');
  const tabPoi = document.getElementById('heading-tab-poi');
  const tabCustom = document.getElementById('heading-tab-custom');
  const helpDesc = document.getElementById('heading-help-desc');
  const helpDetails = document.getElementById('heading-help-details');
  const animDrone = document.getElementById('anim-drone');
  const animPoiTarget = document.getElementById('anim-poi-target');
  const activePath = document.getElementById('anim-flight-path-active');
  const layerHelpBtn = document.getElementById('layer-heading-help-btn');

  if (!helpBtn || !helpDrawer || !tabFollow || !tabFixed || !tabPoi || !helpDesc || !animDrone || !animPoiTarget) return;

  let activeMode = 'followWayline'; // 'followWayline', 'fixed', 'poi', or 'custom'
  let animationFrameId = null;
  let isDrawerOpen = false;

  const allTabs = [tabFollow, tabFixed, tabPoi, tabCustom].filter(Boolean);

  function setActiveTabStyle(activeTab) {
    allTabs.forEach(t => {
      if (t === activeTab) {
        t.classList.add('active');
        t.style.background = 'rgba(6, 182, 212, 0.15)';
        t.style.borderColor = 'rgba(6, 182, 212, 0.3)';
        t.style.color = 'var(--accent-cyan)';
      } else {
        t.classList.remove('active');
        t.style.background = 'none';
        t.style.borderColor = 'transparent';
        t.style.color = 'var(--text-muted)';
      }
    });
  }

  function renderHeadingHelpDetails(mode) {
    if (!helpDetails) return;
    if (mode === 'followWayline') {
      helpDetails.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="font-size: 0.62rem; font-weight: 700; color: #06b6d4; background: rgba(6, 182, 212, 0.12); border: 1px solid rgba(6, 182, 212, 0.25); border-radius: 4px; padding: 1px 5px;">Forward Alignment</span>
            <span style="font-size: 0.68rem; color: #f8fafc; font-weight: 600;">Travel Vector Alignment</span>
          </div>
          <div style="color: #94a3b8; line-height: 1.35;">
            • <strong>Nadir (-90°):</strong> Camera looks straight down. Alternating passes reverse by 180° across serpentine grids.
            <br>• <strong>Oblique (0° to -60°):</strong> Camera looks ahead in flight direction. Ideal for corridor, road, pipeline, and linear obstacle awareness.
            <br>• <strong>Photo Trigger:</strong> Fires automatically via Distance Interval, Time Interval, or Waypoint Hover.
          </div>
        </div>`;
    } else if (mode === 'fixed') {
      helpDetails.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="font-size: 0.62rem; font-weight: 700; color: #38bdf8; background: rgba(56, 189, 248, 0.12); border: 1px solid rgba(56, 189, 248, 0.25); border-radius: 4px; padding: 1px 5px;">North (0°) Locked</span>
            <span style="font-size: 0.68rem; color: #f8fafc; font-weight: 600;">Omnidirectional Strafing</span>
          </div>
          <div style="color: #94a3b8; line-height: 1.35;">
            • <strong>Nadir (-90°) Mapping:</strong> Camera points straight down; top of photo frame is always True North. Eliminates 180° pass flips, preserves uniform sun/shadow angles, and accelerates photogrammetry processing (WebODM, Pix4D, Metashape).
            <br>• <strong>Oblique (-30° to -60°):</strong> Aircraft maintains steady Northward gaze while flying sideways/backwards. Ideal for North-facing building facades, cliff inspections, and south-tilted solar arrays.
            <br>• <strong>Photo Trigger:</strong> Distance Interval, Time Interval, or Stop-and-Shoot captures seamlessly in any travel direction.
          </div>
        </div>`;
    } else if (mode === 'poi') {
      helpDetails.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="font-size: 0.62rem; font-weight: 700; color: #c2622d; background: rgba(194, 98, 45, 0.15); border: 1px solid rgba(194, 98, 45, 0.3); border-radius: 4px; padding: 1px 5px;">Target Tracking</span>
            <span style="font-size: 0.68rem; color: #f8fafc; font-weight: 600;">Point of Interest (POI)</span>
          </div>
          <div style="color: #94a3b8; line-height: 1.35;">
            • <strong>Dynamic Yaw:</strong> Aircraft and camera continually swivel toward the POI coordinates during flybys.
            <br>• <strong>Orbit & Tower Audits:</strong> Gimbal tilts toward center target for 360° structure inspections (cell towers, water tanks, monuments).
            <br>• <strong>Photo Trigger:</strong> Captures overlapping perspective shots at regular distance or waypoint intervals.
          </div>
        </div>`;
    } else if (mode === 'custom') {
      helpDetails.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="font-size: 0.62rem; font-weight: 700; color: #a855f7; background: rgba(168, 85, 247, 0.12); border: 1px solid rgba(168, 85, 247, 0.25); border-radius: 4px; padding: 1px 5px;">Custom Yaw</span>
            <span style="font-size: 0.68rem; color: #f8fafc; font-weight: 600;">User-Defined Azimuth (0°–359°)</span>
          </div>
          <div style="color: #94a3b8; line-height: 1.35;">
            • <strong>Explicit Compass Heading:</strong> Locks aircraft to any custom angle (e.g., 180° South, 90° East).
            <br>• <strong>Specialized Inspections:</strong> Align camera with angled infrastructure, solar panel rows, or directly into prevailing headwinds.
            <br>• <strong>Photo Trigger:</strong> Supports Distance Interval, Time Cadence, or Waypoint Stop-and-Shoot.
          </div>
        </div>`;
    }
  }

  // Toggle drawer visibility from Section 3 button
  helpBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    isDrawerOpen = !isDrawerOpen;
    helpDrawer.classList.toggle('hidden', !isDrawerOpen);
    
    if (isDrawerOpen) {
      startAnimation();
    } else {
      stopAnimation();
    }
  });

  // Open drawer from Section 2 layer heading help button
  if (layerHelpBtn) {
    layerHelpBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const s3 = document.getElementById('mission-failsafes-section');
      if (s3 && s3.classList.contains('collapsed')) {
        s3.classList.remove('collapsed');
      }
      isDrawerOpen = true;
      helpDrawer.classList.remove('hidden');
      startAnimation();
      if (typeof helpDrawer.scrollIntoView === 'function') {
        helpDrawer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
  }

  // Switch to Follow Path Tab
  tabFollow.addEventListener('click', () => {
    activeMode = 'followWayline';
    setActiveTabStyle(tabFollow);
    animPoiTarget.style.opacity = '0';
    helpDesc.textContent = "Drone rotates forward along the path. Camera always points ahead.";
    renderHeadingHelpDetails(activeMode);
  });

  // Switch to Fixed Heading Tab
  tabFixed.addEventListener('click', () => {
    activeMode = 'fixed';
    setActiveTabStyle(tabFixed);
    animPoiTarget.style.opacity = '0';
    helpDesc.textContent = "Drone keeps a constant heading (North). The aircraft flies sideways or backwards as needed.";
    renderHeadingHelpDetails(activeMode);
  });

  // Switch to POI Tab
  tabPoi.addEventListener('click', () => {
    activeMode = 'poi';
    setActiveTabStyle(tabPoi);
    animPoiTarget.style.opacity = '1';
    helpDesc.textContent = "Camera locks onto a Point of Interest (POI). The drone continuously yaws to face the target subject.";
    renderHeadingHelpDetails(activeMode);
  });

  // Switch to Custom Angle Tab (if present)
  if (tabCustom) {
    tabCustom.addEventListener('click', () => {
      activeMode = 'custom';
      setActiveTabStyle(tabCustom);
      animPoiTarget.style.opacity = '0';
      helpDesc.textContent = "Drone maintains a constant user-defined heading angle (0°–359°).";
      renderHeadingHelpDetails(activeMode);
    });
  }

  // Render initial details
  renderHeadingHelpDetails(activeMode);

  // Animation logic
  let startTime = null;
  const duration = 4000; // 4 seconds loop

  // Path coordinates: segment 1 is (30,65) to (100,25), segment 2 is (100,25) to (170,65)
  const p0 = { x: 30, y: 65 };
  const p1 = { x: 100, y: 25 };
  const p2 = { x: 170, y: 65 };
  const poi = { x: 100, y: 48 };

  // Angle of segments in degrees (+90 offset to align the North-oriented pointer polygon)
  const angle1 = Math.atan2(p1.y - p0.y, p1.x - p0.x) * 180 / Math.PI + 90;
  const angle2 = Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI + 90;

  function animate(timestamp) {
    if (!startTime) startTime = timestamp;
    let elapsed = timestamp - startTime;
    let progress = (elapsed % duration) / duration;

    let x, y, angle;
    // Segment 1 (0% to 50% of loop time)
    if (progress < 0.5) {
      let tSeg = progress / 0.5;
      x = p0.x + (p1.x - p0.x) * tSeg;
      y = p0.y + (p1.y - p0.y) * tSeg;
      if (activeMode === 'followWayline') {
        angle = angle1;
      } else if (activeMode === 'fixed') {
        angle = 0;
      } else if (activeMode === 'custom') {
        angle = 90;
      } else { // POI mode
        angle = Math.atan2(poi.y - y, poi.x - x) * 180 / Math.PI + 90;
      }
    } 
    // Segment 2 (50% to 100% of loop time)
    else {
      let tSeg = (progress - 0.5) / 0.5;
      x = p1.x + (p2.x - p1.x) * tSeg;
      y = p1.y + (p2.y - p1.y) * tSeg;
      if (activeMode === 'followWayline') {
        angle = angle2;
      } else if (activeMode === 'fixed') {
        angle = 0;
      } else if (activeMode === 'custom') {
        angle = 90;
      } else { // POI mode
        angle = Math.atan2(poi.y - y, poi.x - x) * 180 / Math.PI + 90;
      }
    }

    animDrone.setAttribute('transform', `translate(${x}, ${y}) rotate(${angle})`);

    if (activePath) {
      const totalPathLength = 250;
      let dashOffset = totalPathLength * (1 - progress);
      activePath.setAttribute('stroke-dashoffset', dashOffset);
    }

    animationFrameId = requestAnimationFrame(animate);
  }

  function startAnimation() {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    startTime = null;
    animationFrameId = requestAnimationFrame(animate);
  }

  function stopAnimation() {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
  }
}

// =============================================================================
// Forward Photogrammetric World-to-Camera Projection & Layer Boundaries (v1.100.0)
// =============================================================================

/**
 * Projects a real-world geodetic point (lat, lon, alt) onto normalized photo coordinates (u, v)
 * using a forward pinhole camera projective model based on drone camera pose.
 */
