function getCurrentWaypoints() {
  return importedWaypoints || generatedWaypoints;
}

function getCurrentPhotos() {
  return importedPhotos || generatedPhotos;
}

// Camera specifications and Aspect Ratio settings (v1.85.0)
let CAMERA_ASPECT_RATIO = '4:3'; // Default '4:3' (Photo standard) or '16:9' (Video / Wide Crop)
let CAMERA_HFOV = 69.7; // Horizontal field of view in degrees (4:3 default)
let CAMERA_VFOV = 55.2; // Vertical field of view in degrees (4:3 default)

function setCameraAspectRatio(ratio, skipUpdate = false) {
  const normRatio = (ratio === '16:9') ? '16:9' : '4:3';
  CAMERA_ASPECT_RATIO = normRatio;
  if (normRatio === '16:9') {
    CAMERA_HFOV = 69.7;
    CAMERA_VFOV = 44.2;
  } else {
    CAMERA_HFOV = 69.7;
    CAMERA_VFOV = 55.2;
  }
  if (typeof localStorage !== 'undefined') {
    try { localStorage.setItem('aalaapi_camera_aspect_ratio', normRatio); } catch (e) {}
  }
  if (typeof document !== 'undefined') {
    const aspectSelect = document.getElementById('camera-aspect-ratio');
    if (aspectSelect && aspectSelect.value !== normRatio) {
      aspectSelect.value = normRatio;
    }
    const badge = document.getElementById('camera-aspect-ratio-badge');
    if (badge) {
      if (normRatio === '16:9') {
        badge.textContent = '16:9 Widescreen';
        badge.style.background = 'rgba(245, 158, 11, 0.15)';
        badge.style.borderColor = 'rgba(245, 158, 11, 0.3)';
        badge.style.color = '#fbbf24';
      } else {
        badge.textContent = '4:3 Native';
        badge.style.background = 'rgba(6, 182, 212, 0.15)';
        badge.style.borderColor = 'rgba(6, 182, 212, 0.3)';
        badge.style.color = 'var(--accent-cyan)';
      }
    }
    const layerOpticsBadge = document.getElementById('layer-optics-aspect-display');
    if (layerOpticsBadge) {
      if (normRatio === '16:9') {
        layerOpticsBadge.textContent = '16:9 Widescreen';
        layerOpticsBadge.style.background = 'rgba(245, 158, 11, 0.15)';
        layerOpticsBadge.style.borderColor = 'rgba(245, 158, 11, 0.3)';
        layerOpticsBadge.style.color = '#fbbf24';
      } else {
        layerOpticsBadge.textContent = '4:3 Native';
        layerOpticsBadge.style.background = 'rgba(6, 182, 212, 0.15)';
        layerOpticsBadge.style.borderColor = 'rgba(6, 182, 212, 0.3)';
        layerOpticsBadge.style.color = 'var(--accent-cyan)';
      }
    }
    const hfovEl = document.getElementById('camera-hfov');
    const vfovEl = document.getElementById('camera-vfov');
    if (hfovEl) hfovEl.value = String(CAMERA_HFOV);
    if (vfovEl) vfovEl.value = String(CAMERA_VFOV);
  }
  if (typeof flightLayers !== 'undefined' && Array.isArray(flightLayers)) {
    flightLayers.forEach(l => {
      l.cameraAspectRatio = normRatio;
    });
  }
  if (!skipUpdate) {
    const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
    if (activeLayer) {
      activeLayer.cameraAspectRatio = normRatio;
      if (activeLayer.pattern === 'target-splat') {
        if (typeof applyTargetSplatAutoDimensions === 'function' && activeLayer.targetAutoDimensions !== false) {
          applyTargetSplatAutoDimensions(activeLayer);
        } else if (typeof updateTargetSplatDiagram === 'function') {
          updateTargetSplatDiagram(activeLayer);
        }
      }
    }
    if (typeof updateGrid === 'function') updateGrid();
  }
}

// Localhost / offline environment detection utility
function isLocalhostEnvironment() {
  if (typeof window === 'undefined' || !window.location) return false;
  const host = (window.location.hostname || '').toLowerCase();
  const proto = (window.location.protocol || '').toLowerCase();
  return (
    proto === 'file:' ||
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '[::1]' ||
    host === '0.0.0.0' ||
    host.endsWith('.local')
  );
}

// Standard satellite and street map layers
let streetLayer;
let esriStreetLayer;
let satelliteLayer;
let topoLayer;

// FAA Airspace Overlay layers
let vfrSectionalLayer;
let classAirspaceLayer;
let specialUseAirspaceLayer;
let uasFacilityMapLayer;
let uasFacilityMapEnabled = false; // tracks layer-control checkbox state
const LAANC_MIN_ZOOM = 12;         // only load LAANC features at this zoom level or above

let obstaclesLayer;
let obstaclesEnabled = false; // tracks layer-control checkbox state
const OBSTACLES_MIN_ZOOM = 12; // only load obstacles at this zoom level or above

let powerLinesLayer;
let powerLinesEnabled = false; // tracks layer-control checkbox state
const POWER_LINES_MIN_ZOOM = 11; // only load power lines at this zoom level or above

// Remote ID Airspace Overlay
let remoteIdAirspaceLayer;

// FAA Temporary Flight Restrictions (TFR) & NOTAM Ingestion State
let tfrAirspaceLayer = null;
let tfrEnabled = false;
let tfrActiveFeatures = [];
let tfrActiveNotams = [];
let tfrLastFetchCenter = null;
let tfrFilterRadiusNM = 30;

// NOAA Weather Overlays
let weatherRadarLayer;
let weatherWarningsLayer;
let weatherStationLayer;
let weatherStationMarker = null;
let weatherStationMarkers = [];
let weatherStationLine = null;
let currentWeatherDirections = null;
let activeWeatherStationIndex = 0;

// Initialize the application when the DOM is fully loaded
document.addEventListener("DOMContentLoaded", () => {
  // Initialize Theme (Light / Dark)
  initTheme();

  // Safety Disclaimer Check
  const accepted = localStorage.getItem('aalaapi_sky_disclaimer_accepted');
  const disclaimerModal = document.getElementById('disclaimer-modal');
  if (accepted !== 'true') {
    if (disclaimerModal) {
      disclaimerModal.classList.remove('hidden');
    }
  }

  // Wires up Disclaimer elements
  const agreeCheckbox = document.getElementById('disclaimer-agree-checkbox');
  const proceedBtn = document.getElementById('disclaimer-proceed-btn');
  if (agreeCheckbox && proceedBtn && disclaimerModal) {
    agreeCheckbox.addEventListener('change', (e) => {
      proceedBtn.disabled = !e.target.checked;
      if (e.target.checked) {
        proceedBtn.style.opacity = '1.0';
        proceedBtn.style.cursor = 'pointer';
      } else {
        proceedBtn.style.opacity = '0.5';
        proceedBtn.style.cursor = 'not-allowed';
      }
    });

    proceedBtn.addEventListener('click', () => {
      localStorage.setItem('aalaapi_sky_disclaimer_accepted', 'true');
      disclaimerModal.classList.add('hidden');
      showWelcomeTourBanner();
    });
  } else if (accepted === 'true') {
    showWelcomeTourBanner();
  }

  // Restore unit system selection
  const savedUnit = localStorage.getItem('aalaapi_sky_unit_system') || 'imperial';
  const unitSystemEl = document.getElementById('unit-system');
  if (unitSystemEl) {
    unitSystemEl.value = savedUnit;
    cachedUnitSystem = savedUnit;
  }

  // Restore all range sliders and configurations from localStorage
  restoreSettingsFromLocalStorage();

  initMap();
  initUIEventListeners();
  initMobileNav();
  initGeolocation(); // Wires up the Locate Me button — does NOT auto-request permission
  initAutoPlan();
  initPatternSelectorCards();
  initHeadingHelpDrawer();
  // No updateGrid() here — map starts clean; user clicks map or uses Auto-Plan/Import to begin
  syncDisplayValues();
  togglePatternParameters();

  if (typeof updateSolarEphemeris === 'function') {
    updateSolarEphemeris();
    if (typeof setInterval === 'function' && !solarEphemerisTickerInterval) {
      solarEphemerisTickerInterval = setInterval(() => {
        if (typeof updateSolarEphemeris === 'function') {
          updateSolarEphemeris();
        }
      }, 60000);
    }
  }
});

// Initialize Leaflet Map
function initMap() {
  // Default to Grand Village of the Illinois / Utica, IL (Historic Miami-Illinois tribe settlement & rural cornfield)
  const defaultLat = 41.3215;
  const defaultLng = -88.9950;

  // Use the last known location as the starting view if cached, so mobile
  // users land on their area without needing a GPS fix on every session.
  let startLat = defaultLat;
  let startLng = defaultLng;
  try {
    const cached = JSON.parse(localStorage.getItem('aalaapi_sky_last_location'));
    if (cached && typeof cached.lat === 'number' && typeof cached.lon === 'number') {
      startLat = cached.lat;
      startLng = cached.lon;
    }
  } catch (e) { /* ignore — fall back to default */ }

  // Initialize Map
  map = L.map('map', {
    zoomControl: false // We will add zoom control on top-left instead of default top-left
  }).setView([startLat, startLng], 17);

  // Add zoom control to top-left
  L.control.zoom({ position: 'topleft' }).addTo(map);

  // Defensive guard for Leaflet zoom animations: prevent 'Cannot read properties of null (reading _latLngToNewLayerPoint)'
  // if a popup or tooltip was detached or unmapped while a zoom animation fired.
  if (typeof L !== 'undefined') {
    if (L.Popup && L.Popup.prototype && L.Popup.prototype._animateZoom) {
      const _origPopupAnimateZoom = L.Popup.prototype._animateZoom;
      L.Popup.prototype._animateZoom = function(opt) {
        if (!this._map) {
          if (this._source && this._source._map) {
            this._map = this._source._map;
          } else {
            return;
          }
        }
        return _origPopupAnimateZoom.call(this, opt);
      };
    }
    if (L.Tooltip && L.Tooltip.prototype && L.Tooltip.prototype._animateZoom) {
      const _origTooltipAnimateZoom = L.Tooltip.prototype._animateZoom;
      L.Tooltip.prototype._animateZoom = function(opt) {
        if (!this._map) {
          if (this._source && this._source._map) {
            this._map = this._source._map;
          } else {
            return;
          }
        }
        return _origTooltipAnimateZoom.call(this, opt);
      };
    }
  }

  // Map Tile & Spatial Asset Proxy Interceptor (Issue #91)
  if (typeof L !== 'undefined' && L.TileLayer && !L.TileLayer.prototype._proxyHookInstalled) {
    L.TileLayer.prototype._proxyHookInstalled = true;
    const _origGetTileUrl = L.TileLayer.prototype.getTileUrl;
    L.TileLayer.prototype.getTileUrl = function(coords) {
      const tileUrl = _origGetTileUrl.call(this, coords);
      if (!tileUrl) return tileUrl;
      if (typeof getBridgeProxyUrl === 'function') {
        return getBridgeProxyUrl(tileUrl);
      }
      return tileUrl;
    };
  }

  // Setup Tile Layers
  streetLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 22,
    maxNativeZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  });

  esriStreetLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 22,
    maxNativeZoom: 19,
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, NPS, NRCAN, GeoBase, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), and the GIS User Community'
  });

  satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 22,
    maxNativeZoom: 19,
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
  });

  topoLayer = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    maxZoom: 17,
    attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)'
  });

  // Default to Satellite View (best for drone planning)
  satelliteLayer.addTo(map);

  // Initialize Airspace Overlays
  // VFR tile layer — always available (standard L.tileLayer, no Esri dependency)
  vfrSectionalLayer = L.tileLayer('https://tiles.arcgis.com/tiles/ssFJjBXIUyZDrSYZ/arcgis/rest/services/VFR_Sectional/MapServer/WMTS/tile/1.0.0/VFR_Sectional/default/default028mm/{z}/{y}/{x}', {
    maxZoom: 22,
    maxNativeZoom: 11, // FAA tiles only go to zoom 11 globally; browser upscales beyond that
    minZoom: 4,
    attribution: 'FAA VFR Sectional Chart'
  });
  vfrSectionalLayer.setOpacity(0.55); // Default opacity so base map shows through

  // Esri FeatureServer layers — only initialize if esri-leaflet CDN loaded successfully
  if (typeof L !== 'undefined' && L.esri) {
    classAirspaceLayer = L.esri.featureLayer({
      url: 'https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/Class_Airspace/FeatureServer/0',
      style: function (feature) {
        const type = feature.properties.CLASS;
        let color = '#3b82f6'; // default blue
        if (type === 'B') color = '#2563eb'; // Class B: deep blue
        else if (type === 'C') color = '#a855f7'; // Class C: magenta/purple
        else if (type === 'D') color = '#ec4899'; // Class D: hot pink
        else if (type === 'E') color = '#10b981'; // Class E: emerald green
        return { color: color, weight: 1.5, fillOpacity: 0.15 };
      },
      onEachFeature: function (feature, layer) {
        const props = feature.properties;
        const title = `<b>Class ${props.CLASS} Controlled Airspace</b><br>Ceiling: ${props.CEILING || 'Unknown'}<br>Floor: ${props.FLOOR || 'Unknown'}<br>Sector: ${props.SECTOR || 'Main'}`;
        layer.bindPopup(title);
      }
    });

    specialUseAirspaceLayer = L.esri.featureLayer({
      url: 'https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/Special_Use_Airspace/FeatureServer/0',
      style: function (feature) {
        const type = feature.properties.TYPE_CODE;
        let color = '#ef4444'; // Red for restricted/prohibited
        if (type === 'WARNING_AREA' || type === 'MOA') color = '#f59e0b'; // Amber for warning/MOAs
        return { color: color, weight: 1.5, fillOpacity: 0.2 };
      },
      onEachFeature: function (feature, layer) {
        const props = feature.properties;
        const title = `<b>Special Use Airspace</b><br>Name: ${props.NAME}<br>Type: ${props.TYPE_CODE}<br>Ceiling: ${props.CEILING || 'Unknown'}<br>Floor: ${props.FLOOR || 'Unknown'}`;
        layer.bindPopup(title);
      }
    });

    uasFacilityMapLayer = L.esri.featureLayer({
      url: 'https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/FAA_UAS_FacilityMap_Data/FeatureServer/0',
      // Start with an impossible where clause so no data loads until the user zooms in
      where: '1=0',
      style: function (feature) {
        const ceiling = feature.properties.CEILING;
        let color = '#10b981'; // Green for 400ft ceiling
        if (ceiling === 0) color = '#ef4444'; // Red for 0ft ceiling (highly restricted)
        else if (ceiling <= 100) color = '#f97316'; // Orange (50-100ft)
        else if (ceiling <= 200) color = '#f59e0b'; // Amber (150-200ft)
        else if (ceiling <= 300) color = '#eab308'; // Yellow (250-300ft)
        return { color: color, weight: 1, fillOpacity: 0.15, dashArray: '3, 3' };
      },
      onEachFeature: function (feature, layer) {
        const props = feature.properties;
        const title = `<b>UAS Facility Map Grid (LAANC)</b><br>Max Allowed Height: <b>${props.CEILING} ft</b><br>Airport: ${props.AIRPORT_NAME || 'N/A'}`;
        layer.bindPopup(title);
        if (props.CEILING !== undefined) {
          layer.bindTooltip(`${props.CEILING}ft`, { permanent: true, direction: 'center', className: 'uasfm-grid-label' });
        }
      }
    });

    obstaclesLayer = L.esri.featureLayer({
      url: 'https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/Digital_Obstacle_File/FeatureServer/0',
      where: '1=0', // Start with impossible clause like LAANC
      pointToLayer: function (geojson, latlng) {
        return L.circleMarker(latlng, {
          radius: 5,
          fillColor: "#f97316", // orange
          color: "#fff",
          weight: 1,
          opacity: 1,
          fillOpacity: 0.8
        });
      },
      onEachFeature: function (feature, layer) {
        const props = feature.properties;
        const title = `<b>FAA Obstacle</b><br>Type: ${props.Type_Code || 'Unknown'}<br>Height (AGL): <b>${props.AGL || 'N/A'} ft</b><br>Height (AMSL): ${props.AMSL || 'N/A'} ft`;
        layer.bindPopup(title);
      }
    });

    powerLinesLayer = L.esri.featureLayer({
      url: 'https://services1.arcgis.com/Hp6G80Pky0om7QvQ/arcgis/rest/services/Electric_Power_Transmission_Lines/FeatureServer/0',
      where: '1=0', // Start with impossible clause like LAANC
      style: function (feature) {
        return {
          color: "#fde047", // yellow
          weight: 2,
          opacity: 0.8
        };
      },
      onEachFeature: function (feature, layer) {
        const props = feature.properties;
        let title = '<b>Power Transmission Line</b>';
        if (props.OWNER) title += '<br>Owner: ' + props.OWNER;
        if (props.VOLTAGE) title += '<br>Voltage: <b>' + props.VOLTAGE + ' kV</b>';
        if (props.STATUS) title += '<br>Status: ' + props.STATUS;
        if (props.TYPE) title += '<br>Type: ' + props.TYPE;
        layer.bindPopup(title);
      }
    });
  } else {
    Logger.warn('Esri Leaflet not loaded — FAA FeatureServer airspace layers unavailable. VFR Sectional Chart (tile layer) still available.');
  }

  // Initialize NOAA Weather Overlays (WMS)
  weatherRadarLayer = L.tileLayer.wms('https://opengeo.ncep.noaa.gov/geoserver/ows', {
    layers: 'conus:conus_bref_qcd',
    format: 'image/png',
    transparent: true,
    opacity: 0.45,
    attribution: 'NOAA/NWS NEXRAD'
  });

  weatherWarningsLayer = L.tileLayer.wms('https://opengeo.ncep.noaa.gov/geoserver/ows', {
    layers: 'wwa:hazards',
    format: 'image/png',
    transparent: true,
    opacity: 0.35,
    attribution: 'NOAA/NWS Hazards'
  });

  const isLocal = isLocalhostEnvironment();
  const osmStreetLabel = isLocal ? "Street Map (OSM - Disabled on Localhost)" : "Street Map (OpenStreetMap)";

  // Add Layer Control — include only layers that successfully initialized
  const baseMaps = {
    "Satellite View": satelliteLayer,
    "Street Map (Esri)": esriStreetLayer,
    [osmStreetLabel]: streetLayer,
    "Topography Map": topoLayer
  };

  const overlays = {
    "VFR Sectional Chart (US Only)": vfrSectionalLayer
  };
  if (classAirspaceLayer) overlays["Controlled Airspace (Class B/C/D/E) (US Only)"] = classAirspaceLayer;
  if (specialUseAirspaceLayer) overlays["Restricted & Special Use Airspace (US Only)"] = specialUseAirspaceLayer;
  if (uasFacilityMapLayer) overlays["UAS Facility Maps (LAANC) (US Only)"] = uasFacilityMapLayer;
  if (obstaclesLayer) overlays["Obstacles & Antennas (FAA) (US Only)"] = obstaclesLayer;
  if (powerLinesLayer) overlays["Power Lines (HIFLD) (US Only)"] = powerLinesLayer;

  // Temporary Flight Restrictions (TFR) & NOTAM Airspace Overlay
  tfrAirspaceLayer = L.geoJSON(null, {
    style: function(feature) {
      const props = feature.properties || {};
      const isStadium = props.isStadium || (props.TYPE === 'STADIUM' || props.LEGAL === 'STADIUM' || (props.TITLE && props.TITLE.toLowerCase().includes('stadium')) || (props.NAME && (props.CITY || props.OBJECTID)));
      if (isStadium) {
        return {
          color: '#a78bfa',
          weight: 1.8,
          dashArray: '5, 4',
          fillColor: '#8b5cf6',
          fillOpacity: 0.12
        };
      }
      return {
        color: '#dc2626',
        weight: 2.2,
        dashArray: '6, 4',
        fillColor: '#ef4444',
        fillOpacity: 0.22
      };
    },
    pointToLayer: function(feature, latlng) {
      const props = feature.properties || {};
      const isStadium = props.isStadium || (props.TYPE === 'STADIUM' || props.LEGAL === 'STADIUM' || (props.TITLE && props.TITLE.toLowerCase().includes('stadium')) || (props.NAME && (props.CITY || props.OBJECTID)));
      if (isStadium) {
        // 3 Nautical Miles = 5556 meters
        return L.circle(latlng, {
          radius: 5556,
          color: '#a78bfa',
          weight: 1.8,
          dashArray: '5, 4',
          fillColor: '#8b5cf6',
          fillOpacity: 0.12
        });
      }
      return L.circleMarker(latlng, {
        radius: 6,
        color: '#ffffff',
        weight: 1.5,
        fillColor: '#ef4444',
        fillOpacity: 0.9
      });
    },
    onEachFeature: function(feature, layer) {
      const props = feature.properties || {};
      const notamId = props.notam_id || props.NOTAM_KEY || feature.id || 'FAA TFR';
      const title = props.title || props.TITLE || props.NAME || props.TxtName || 'Temporary Flight Restriction';
      const isStandbyStadium = (props.isStadium || props.TYPE === 'STADIUM' || props.type === 'STADIUM' || (props.NAME && (props.CITY || props.OBJECTID))) && props.isActiveTfr === false;
      const type = isStandbyStadium ? 'STADIUM' : (props.type || props.LEGAL || props.TYPE_CODE || 'RESTRICTION');
      const state = props.state || props.STATE || '';
      const cDist = props.distanceKm != null ? formatTfrDistance(props.distanceKm, props.isInside, props.compassDir) : '';
      
      let popupHtml = `<div style="font-size:0.78rem; line-height:1.4; min-width:210px;">`;
      if (isStandbyStadium) {
        const locationStr = [props.city || props.CITY, state].filter(Boolean).join(', ');
        popupHtml += `<div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:4px;"><span style="background:rgba(139,92,246,0.25); color:#c4b5fd; border:1px solid rgba(139,92,246,0.4); font-size:0.65rem; font-weight:700; padding:1px 6px; border-radius:4px;">STADIUM ADVISORY</span><span style="color:#34d399; font-size:0.7rem; font-weight:600;">Standby</span></div>`;
        popupHtml += `<div style="font-weight:700; color:#fff; font-size:0.92rem; margin-bottom:4px;">🏟️ ${title}</div>`;
        if (locationStr) popupHtml += `<div style="color:var(--text-muted); font-size:0.72rem;">Location: <b>${locationStr}</b></div>`;
        popupHtml += `<div style="color:var(--text-muted); font-size:0.72rem;">Rule: <b>14 CFR § 99.7 (3 NM • 3,000 ft AGL)</b></div>`;
        popupHtml += `<div style="color:var(--text-muted); font-size:0.72rem;">Window: <b>Event start -1h to end +1h (30k+ seats)</b></div>`;
      } else {
        popupHtml += `<div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;"><span style="background:#ef4444; color:#fff; font-size:0.65rem; font-weight:700; padding:1px 5px; border-radius:4px;">TFR NOTAM</span><strong style="color:var(--text-main); font-size:0.85rem;">${notamId}</strong></div>`;
        popupHtml += `<div style="font-weight:600; color:#38bdf8; margin-bottom:4px;">${title}</div>`;
        if (type) popupHtml += `<div style="color:var(--text-muted); font-size:0.72rem;">Type: <b>${type}</b> ${state ? `(${state})` : ''}</div>`;
        if (props.effectiveTime) popupHtml += `<div style="color:var(--text-muted); font-size:0.72rem;">Schedule: <b>${props.effectiveTime}</b></div>`;
        if (props.altitude) popupHtml += `<div style="color:var(--text-muted); font-size:0.72rem;">Altitudes: <b>${props.altitude}</b></div>`;
      }
      if (cDist) popupHtml += `<div style="color:${props.isInside ? '#ef4444' : '#34d399'}; font-weight:700; font-size:0.74rem; margin-top:4px;">Proximity: ${cDist}</div>`;
      popupHtml += `<div style="margin-top:8px; display:flex; gap:6px;">`;
      popupHtml += `<button type="button" class="btn-sm" style="padding:2px 8px; font-size:0.68rem; background:var(--accent-cyan); color:#0f172a; font-weight:700; border:none; border-radius:4px; cursor:pointer;" onclick="openTfrBriefingModal('${notamId}')">📄 View Briefing</button>`;
      popupHtml += `</div>`;
      popupHtml += `</div>`;
      layer.bindPopup(popupHtml);
    }
  });
  overlays["Temporary Flight Restrictions (TFR / NOTAM) (US Only)"] = tfrAirspaceLayer;
  
  // Weather Overlays
  weatherStationLayer = L.layerGroup().addTo(map);
  overlays["Weather Observation Station (NWS)"] = weatherStationLayer;
  overlays["Weather Radar (NEXRAD) (US Only)"] = weatherRadarLayer;
  overlays["Weather Warnings (NWS Hazards) (US Only)"] = weatherWarningsLayer;

  // Live Remote ID Airspace Overlay (Drones & Takeoff Locations)
  remoteIdAirspaceLayer = L.layerGroup().addTo(map);
  overlays["Live Remote ID Airspace (Drone & Takeoff)"] = remoteIdAirspaceLayer;
  if (typeof RemoteIdRadar !== 'undefined' && RemoteIdRadar) {
    RemoteIdRadar.layerGroup = remoteIdAirspaceLayer;
  }

  // Live Manned Aircraft Airspace Overlay (ADS-B / Mode S)
  const adsbAirspaceLayer = L.layerGroup().addTo(map);
  overlays["Manned Aircraft (ADS-B Airspace)"] = adsbAirspaceLayer;
  if (typeof AdsbAirspaceManager !== 'undefined' && AdsbAirspaceManager) {
    AdsbAirspaceManager.layerGroup = adsbAirspaceLayer;
  }

  const layerControl = L.control.layers(baseMaps, overlays, { position: 'topleft' }).addTo(map);

  // If running on localhost or file://, disable the OpenStreetMap radio button with styled indicator & tooltip
  if (isLocal) {
    const applyOsmDisabledStyle = () => {
      const container = (layerControl && typeof layerControl.getContainer === 'function') ? layerControl.getContainer() : null;
      if (!container) return;
      const labels = container.querySelectorAll('.leaflet-control-layers-base label');
      labels.forEach(lbl => {
        if (lbl.textContent.includes('Disabled on Localhost') || (lbl.textContent.includes('OSM') && lbl.textContent.includes('Street'))) {
          const input = lbl.querySelector('input');
          if (input) {
            input.disabled = true;
          }
          lbl.style.opacity = '0.45';
          lbl.style.cursor = 'not-allowed';
          lbl.title = 'OpenStreetMap tiles are disabled on localhost/file:// due to OSM Tile Usage Policy (missing Referer / 403 Access Blocked). Use Street Map (Esri) or Satellite View instead.';
          const span = lbl.querySelector('span');
          if (span) {
            span.style.cursor = 'not-allowed';
          }
        }
      });
    };
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(applyOsmDisabledStyle);
    } else {
      setTimeout(applyOsmDisabledStyle, 0);
    }
  }

  // Intercept layer change to prevent activating OSM Street Map on localhost
  map.on('baselayerchange', function(e) {
    if (isLocalhostEnvironment() && (e.layer === streetLayer || (e.name && (e.name.includes('OSM') || e.name.includes('OpenStreetMap'))))) {
      if (typeof showToast === 'function') {
        showToast('OpenStreetMap tiles are disabled on localhost per OSM policy. Switched to Esri Street Map.', 4000);
      }
      if (map.hasLayer(streetLayer)) {
        map.removeLayer(streetLayer);
      }
      if (typeof esriStreetLayer !== 'undefined' && esriStreetLayer) {
        esriStreetLayer.addTo(map);
      }
    }
  });

  // Airspace legend — shown/hidden based on which overlays are active
  initAirspaceLegend();
  map.on('overlayadd overlayremove', function(e) {
    // Track TFR checkbox state
    if (e.type === 'overlayadd' && e.name === 'Temporary Flight Restrictions (TFR / NOTAM) (US Only)') {
      tfrEnabled = true;
      if (typeof centerMarker !== 'undefined' && centerMarker) {
        fetchAndProcessTFRs(centerMarker.getLatLng().lat, centerMarker.getLatLng().lng);
      }
    }
    if (e.type === 'overlayremove' && e.name === 'Temporary Flight Restrictions (TFR / NOTAM) (US Only)') {
      tfrEnabled = false;
    }

    // Track LAANC checkbox state
    if (uasFacilityMapLayer) {
      if (e.type === 'overlayadd'    && e.name === 'UAS Facility Maps (LAANC) (US Only)') uasFacilityMapEnabled = true;
      if (e.type === 'overlayremove' && e.name === 'UAS Facility Maps (LAANC) (US Only)') {
        uasFacilityMapEnabled = false;
        // Clear all features immediately to free memory
        uasFacilityMapLayer.setWhere('1=0');
      }
      // When enabled, respect current zoom
      if (uasFacilityMapEnabled) applyZoomGates();
    }

    // Track Obstacles checkbox state
    if (obstaclesLayer) {
      if (e.type === 'overlayadd'    && e.name === 'Obstacles & Antennas (FAA) (US Only)') obstaclesEnabled = true;
      if (e.type === 'overlayremove' && e.name === 'Obstacles & Antennas (FAA) (US Only)') {
        obstaclesEnabled = false;
        obstaclesLayer.setWhere('1=0');
      }
      if (obstaclesEnabled) applyZoomGates();

      if (e.type === 'overlayadd'    && e.name === 'Power Lines (HIFLD) (US Only)') powerLinesEnabled = true;
      if (e.type === 'overlayremove' && e.name === 'Power Lines (HIFLD) (US Only)') {
        powerLinesEnabled = false;
        powerLinesLayer.setWhere('1=0');
      }
      if (powerLinesEnabled) applyZoomGates();
    }
    updateAirspaceLegend(e);
  });

  // Zoom-gate: show LAANC, Obstacles, and responsive camera cone scaling
  map.on('zoom', function() {
    applyZoomGates();
  });
  map.on('zoomend', function() {
    applyZoomGates();
  });

  // Layer groups for flight paths and markers
  flightPathPolyline = L.layerGroup().addTo(map);
  exclusionZonesGroup = L.layerGroup().addTo(map);
  boundaryLayersGroup = L.layerGroup().addTo(map);
  fiducialMarkersGroup = L.layerGroup().addTo(map);
  waypointMarkersGroup = L.layerGroup().addTo(map);
  pitchLabelsGroup = L.layerGroup().addTo(map); // Above waypointMarkersGroup
  photoMarkersGroup = L.layerGroup().addTo(map);
  roadPathGroup = L.layerGroup().addTo(map);
  targetPolygonGroup = L.layerGroup().addTo(map);
  photoInspectionGroup = L.layerGroup().addTo(map);

  // Issue #123: Initialize 2D Flight Replay Engine
  if (typeof init2dReplayEngine === 'function') {
    init2dReplayEngine();
  }

  // No default center marker — map starts clean; user clicks to place grid center

  // Track popup open/close state globally
  map.on('popupopen', () => {
    isAnyPopupOpen = true;
  });
  map.on('popupclose', () => {
    isAnyPopupOpen = false;
  });

  // Update OpenSky link when map moves
  map.on('moveend', () => {
    updateOpenSkyLink();
  });

  // Map Click Listener to set/move grid center or add manual waypoints
  map.on('click', (e) => {
    if (isAnyPopupOpen || autoPlanActive || isRouting) {
      return;
    }
    if (isLayerBoundaryEditActive) {
      addLayerBoundaryPoint(e.latlng.lat, e.latlng.lng);
      return;
    }
    const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
    const gridTypeEl = (typeof document !== 'undefined' && document) ? document.getElementById('grid-type') : null;
    const currentPattern = gridTypeEl ? gridTypeEl.value : (activeLayer ? activeLayer.pattern : 'double');

    const isTargetSplatPoly = (currentPattern === 'target-splat') && (
      isTargetPolyEditActive || (activeLayer && activeLayer.targetMode === 'polygon' && (!activeLayer.targetPoly || activeLayer.targetPoly.length < 3))
    );

    if (currentPattern === 'freeform' || currentPattern === 'exclusion-freeform' || currentPattern === 'hyperlapse') {
      addFreeformWaypoint(e.latlng.lat, e.latlng.lng);
    } else if (currentPattern === 'boundary-polygon') {
      addBoundaryPolygonPoint(e.latlng.lat, e.latlng.lng);
    } else if (currentPattern === 'fiducial-markers') {
      addFiducialMarkerPoint(e.latlng.lat, e.latlng.lng);
    } else if (currentPattern === 'road-following') {
      addRoadWaypoint(e.latlng.lat, e.latlng.lng);
    } else if (isTargetSplatPoly) {
      addTargetPolygonPoint(e.latlng.lat, e.latlng.lng);
    } else {
      setGridCenter(e.latlng.lat, e.latlng.lng);
    }
  });

  // Initial update
  updateOpenSkyLink();
  applyZoomGates(); // Set initial zoom-gate state (e.g. wp-zoomed-out class)
}

const CONTROLS_LIST = [
  'grid-type', 'grid-width', 'grid-height', 'grid-rotation',
  'front-overlap', 'side-overlap', 'gimbal-pitch',
  'altitude', 'speed', 'heading-mode', 'finish-action', 'capture-mode', 'path-mode', 'signal-lost-action',
  'camera-model', 'drone-model', 'camera-zoom', 'camera-aspect-ratio', 'camera-hfov', 'camera-vfov', 'road-offset',
  'global-hover-time', 'global-exclusion-detour-mode', 'global-exclusion-clearance-buffer',
  'max-flight-height', 'rth-altitude',
  'target-splat-radius', 'target-splat-height', 'target-splat-culling-mode', 'target-splat-grid-pass',
  'tower-min-height', 'tower-max-height', 'tower-radius', 'tower-guy-wire-buffer', 'tower-movement-mode', 'tower-altitude-order'
];

// Factory Defaults Schema for Reset & Modified Detection (v1.75.0)
const FACTORY_DEFAULTS = {
  // Flight & Layer Parameters
  'altitude': '50',
  'speed': '4',
  'grid-width': '100',
  'grid-height': '100',
  'grid-rotation': '0',
  'front-overlap': '75',
  'side-overlap': '75',
  'gimbal-pitch': '-60',
  'target-splat-radius': '25',
  'target-splat-height': '8',
  'target-splat-culling-mode': 'smartTrim',
  'target-splat-grid-pass': 'double',
  'camera-action': 'none',
  'orbit-radius': '50',
  'orbit-waypoints': '12',
  'orbit-speed': '3',
  'multi-orbit-radius': '50',
  'multi-orbit-tiers': '3',
  'multi-orbit-bottom-alt': '30',
  'multi-orbit-top-alt': '90',
  'multi-orbit-pitch-bottom': '-30',
  'multi-orbit-pitch-top': '-60',
  'multi-orbit-wps': '8',
  'multi-orbit-speed': '3',
  'tower-min-height': '20',
  'tower-max-height': '100',
  'tower-radius': '30',
  'tower-guy-wire-buffer': '15',
  'tower-movement-mode': 'horizontal',
  'tower-altitude-order': 'max-to-min',
  'road-offset': '10',
  'road-turn-mode': 'toPointAndStopWithDiscontinuitySlightlyRounded',
  'road-action': 'none',
  'road-snap': false,
  // Section 3: Mission Failsafes & Defaults
  'max-flight-height': '120',
  'rth-altitude': '50',
  'signal-lost-action': 'goHome',
  'exit-on-rc-lost': 'executeLostAction',
  'flight-path-mode': 'goToFirstWaypoint',
  'heading-mode': 'followWayline',
  'drone-model': 'mini4pro',
  'finish-action': 'goHome',
  'capture-mode': 'time',
  'path-mode': 'smoothTransition',
  'camera-model': 'mini4pro',
  'camera-zoom': '1',
  'camera-aspect-ratio': '4:3',
  'camera-hfov': '69.7',
  'camera-vfov': '55.2',
  'global-hover-time': '0',
  'global-exclusion-detour-mode': 'perimeter',
  'global-exclusion-clearance-buffer': '10',
  'max-flight-time': '25',
  // UI & Layout Preferences
  'unit-system': 'imperial',
  'theme': 'dark',
  'nav-layout-select': 'header',
  'camera-palette-select': 'high-viz-amber',
  'camera-cones-toggle': true,
  'accordion-mode-toggle': true,
  'minimize-sidebar-toggle': false,
  'multivendor-toggle': false,
  'companion-host': 'http://localhost:8765'
};

function saveAllSettingsToLocalStorage() {
  const settings = {};
  CONTROLS_LIST.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      settings[id] = el.value;
    }
  });
  const roadSnapEl = document.getElementById('road-snap');
  if (roadSnapEl) {
    settings['road-snap'] = roadSnapEl.checked;
  }
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('aalaapi_sky_input_settings', JSON.stringify(settings));
    }
  } catch (e) {}
  updateModifiedSettingsIndicators();
}

function restoreSettingsFromLocalStorage() {
  try {
    if (typeof localStorage === 'undefined') return;
    const saved = localStorage.getItem('aalaapi_sky_input_settings');
    if (!saved) return;
    const settings = JSON.parse(saved);
    CONTROLS_LIST.forEach(id => {
      if (settings[id] !== undefined) {
        const el = document.getElementById(id);
        if (el) {
          el.value = settings[id];
        }
      }
    });
    const roadSnapEl = document.getElementById('road-snap');
    if (roadSnapEl && settings['road-snap'] !== undefined) {
      roadSnapEl.checked = settings['road-snap'];
    }
  } catch (err) {
    Logger.error("Failed to restore settings from localStorage:", err);
  }
}

// ============================================================================
// Issue #123: 2D Flight Replay Engine, Drone Marker & Layer Cache Management
// ============================================================================

let historicalReplayGroup = null;
let historicalDroneMarker = null;
let historicalPlannedLine = null;
let historicalActualLine = null;

function createDroneSvgHtml(headingDeg = 0) {
  const normDeg = Math.round(headingDeg || 0);
  return `
    <div style="transform: rotate(${normDeg}deg); width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; filter: drop-shadow(0 2px 6px rgba(0,0,0,0.65)); pointer-events: none;">
      <svg viewBox="0 0 36 36" width="34" height="34" fill="none" xmlns="http://www.w3.org/2000/svg">
        <!-- Drone Propeller Arms -->
        <line x1="6" y1="6" x2="30" y2="30" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="6" y1="30" x2="30" y2="6" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round"/>
        <!-- Propeller Rotors -->
        <circle cx="6" cy="6" r="4.5" fill="rgba(56, 189, 248, 0.4)" stroke="#38bdf8" stroke-width="1.5"/>
        <circle cx="30" cy="6" r="4.5" fill="rgba(56, 189, 248, 0.4)" stroke="#38bdf8" stroke-width="1.5"/>
        <circle cx="6" cy="30" r="4.5" fill="rgba(56, 189, 248, 0.4)" stroke="#38bdf8" stroke-width="1.5"/>
        <circle cx="30" cy="30" r="4.5" fill="rgba(56, 189, 248, 0.4)" stroke="#38bdf8" stroke-width="1.5"/>
        <!-- Fuselage / Cockpit -->
        <rect x="13" y="10" width="10" height="16" rx="4" fill="#0f172a" stroke="#06b6d4" stroke-width="2"/>
        <!-- Heading Nose Indicator -->
        <polygon points="18,5 14,10 22,10" fill="#f59e0b" stroke="#fbbf24" stroke-width="1"/>
        <circle cx="18" cy="17" r="3" fill="#38bdf8"/>
      </svg>
    </div>
  `;
}

function init2dReplayEngine() {
  if (typeof L === 'undefined' || !map) return;
  if (typeof PlaybackManager === 'undefined') return;

  if (!historicalReplayGroup) {
    historicalReplayGroup = L.layerGroup().addTo(map);
  }

  // Handle replay mode transitions
  PlaybackManager.on('replaymode', ({ active, radarCacheMode }) => {
    const replayBar = document.getElementById('replay-2d-bar');
    if (active) {
      if (replayBar) replayBar.classList.remove('hidden');
      render2dHistoricalTracks();
      update2dRadarCacheMode(radarCacheMode);
    } else {
      if (replayBar) replayBar.classList.add('hidden');
      clear2dHistoricalTracks();
      restoreLiveRadarMode();
    }
  });

  // Handle active flight change
  PlaybackManager.on('flightchange', ({ flightId, name }) => {
    const titleEl = document.getElementById('replay-2d-flight-title');
    if (titleEl) {
      titleEl.textContent = name || flightId || 'Active Flight';
    }
    if (PlaybackManager.is2dReplayActive) {
      render2dHistoricalTracks();
    }
  });

  // Real-time telemetry tick update
  PlaybackManager.on('timeupdate', ({ point, elapsedSeconds, progress }) => {
    update2dDronePosition(point);
    update2dReplayHud(point, elapsedSeconds, progress);
  });

  PlaybackManager.on('seek', ({ point, elapsedSeconds, progress }) => {
    update2dDronePosition(point);
    update2dReplayHud(point, elapsedSeconds, progress);
  });

  PlaybackManager.on('play', () => {
    const playIcon = document.getElementById('replay-2d-play-icon');
    if (playIcon) playIcon.textContent = '⏸ Pause';
  });

  PlaybackManager.on('pause', () => {
    const playIcon = document.getElementById('replay-2d-play-icon');
    if (playIcon) playIcon.textContent = '▶ Play';
  });

  initReplay2dBarListeners();
}

function render2dHistoricalTracks() {
  if (!map || !historicalReplayGroup || typeof PlaybackManager === 'undefined') return;

  clear2dHistoricalTracks();

  const telem = PlaybackManager.telemetryData;
  const plannedWps = PlaybackManager.plannedWaypoints;
  const boundsPoints = [];

  // 1. Render planned flight path (dashed cyan line)
  if (Array.isArray(plannedWps) && plannedWps.length > 0) {
    const plannedCoords = plannedWps.map(w => [
      typeof w.lat === 'function' ? w.lat() : Number(w.lat || 0),
      typeof w.lon === 'function' ? w.lon() : (w.lng !== undefined ? Number(w.lng) : Number(w.lon || 0))
    ]).filter(c => !isNaN(c[0]) && !isNaN(c[1]) && (c[0] !== 0 || c[1] !== 0));

    if (plannedCoords.length > 1) {
      historicalPlannedLine = L.polyline(plannedCoords, {
        color: '#06b6d4',
        weight: 3,
        dashArray: '6, 6',
        opacity: 0.85
      }).addTo(historicalReplayGroup);
      plannedCoords.forEach(c => boundsPoints.push(c));
    }
  }

  // 2. Render actual flown trajectory (solid emerald line)
  const pts = PlaybackManager.points || [];
  if (pts.length > 1) {
    const flownCoords = pts.map(p => [Number(p.lat || 0), Number(p.lon || 0)])
      .filter(c => !isNaN(c[0]) && !isNaN(c[1]) && (c[0] !== 0 || c[1] !== 0));

    if (flownCoords.length > 1) {
      historicalActualLine = L.polyline(flownCoords, {
        color: '#10b981',
        weight: 3.5,
        opacity: 0.95
      }).addTo(historicalReplayGroup);
      flownCoords.forEach(c => boundsPoints.push(c));
    }
  }

  // 3. Render dynamic drone marker
  const initialPt = PlaybackManager.getInterpolatedPoint() || pts[0] || (plannedWps && plannedWps[0]);
  if (initialPt && initialPt.lat && initialPt.lon) {
    const droneIcon = L.divIcon({
      className: 'replay-drone-div-icon',
      html: createDroneSvgHtml(initialPt.yaw || 0),
      iconSize: [34, 34],
      iconAnchor: [17, 17]
    });

    historicalDroneMarker = L.marker([initialPt.lat, initialPt.lon], {
      icon: droneIcon,
      zIndexOffset: 1000
    }).addTo(historicalReplayGroup);
  }

  // 4. Center map view to fit historical bounds
  if (boundsPoints.length > 0) {
    try {
      const bounds = L.latLngBounds(boundsPoints);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 18 });
    } catch (_) {}
  }
}

function clear2dHistoricalTracks() {
  if (historicalReplayGroup) {
    historicalReplayGroup.clearLayers();
  }
  historicalDroneMarker = null;
  historicalPlannedLine = null;
  historicalActualLine = null;
}

function update2dDronePosition(point) {
  if (!point || !historicalDroneMarker) return;
  if (typeof point.lat !== 'number' || typeof point.lon !== 'number') return;

  historicalDroneMarker.setLatLng([point.lat, point.lon]);

  const el = historicalDroneMarker.getElement();
  if (el) {
    const rotContainer = el.querySelector('div');
    if (rotContainer) {
      rotContainer.style.transform = `rotate(${Math.round(point.yaw || 0)}deg)`;
    }
  }
}

function update2dReplayHud(point, elapsedSeconds, progress) {
  if (typeof document === 'undefined') return;

  const altEl = document.getElementById('replay-2d-hud-alt');
  const spdEl = document.getElementById('replay-2d-hud-spd');
  const yawEl = document.getElementById('replay-2d-hud-yaw');
  const posEl = document.getElementById('replay-2d-hud-pos');
  const curTimeEl = document.getElementById('replay-2d-current-time');
  const totTimeEl = document.getElementById('replay-2d-total-time');
  const scrubber = document.getElementById('replay-2d-scrubber');

  const formatTime = (secs) => {
    const s = Math.max(0, Math.floor(secs || 0));
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  };

  if (altEl && point) altEl.textContent = `${(point.alt || 0).toFixed(1)}m`;
  if (spdEl && point) spdEl.textContent = `${(point.speed || 0).toFixed(1)}m/s`;
  if (yawEl && point) yawEl.textContent = `${Math.round(point.yaw || 0)}°`;
  if (posEl && point) posEl.textContent = `${point.lat.toFixed(5)}, ${point.lon.toFixed(5)}`;

  if (curTimeEl) curTimeEl.textContent = formatTime(elapsedSeconds);
  if (totTimeEl && typeof PlaybackManager !== 'undefined') {
    totTimeEl.textContent = formatTime(PlaybackManager.durationSeconds);
  }

  if (scrubber && !scrubber._isDragging) {
    scrubber.value = Math.round((progress || 0) * 1000);
  }
}

function update2dRadarCacheMode(mode) {
  const badgeText = document.getElementById('replay-2d-cache-mode-text');
  if (badgeText) {
    badgeText.textContent = (mode === 'cached') ? '🛰️ Radar: Cached Snapshot' : '📡 Radar: Live Stream';
  }

  // If weatherRadarLayer exists, set query parameter to allow caching
  if (typeof weatherRadarLayer !== 'undefined' && weatherRadarLayer && typeof weatherRadarLayer.setParams === 'function') {
    if (mode === 'cached') {
      weatherRadarLayer.setParams({ historical: 1, snapshot: 'true' });
    } else {
      weatherRadarLayer.setParams({ historical: undefined, snapshot: undefined });
    }
  }
}

function restoreLiveRadarMode() {
  if (typeof weatherRadarLayer !== 'undefined' && weatherRadarLayer && typeof weatherRadarLayer.setParams === 'function') {
    weatherRadarLayer.setParams({ historical: undefined, snapshot: undefined });
  }
}

function initReplay2dBarListeners() {
  const scrubber = document.getElementById('replay-2d-scrubber');
  const playBtn = document.getElementById('replay-2d-play-btn');
  const closeBtn = document.getElementById('replay-2d-close-btn');
  const open3dBtn = document.getElementById('replay-2d-open-3d-btn');
  const cacheBadge = document.getElementById('replay-2d-cache-badge');

  if (scrubber) {
    scrubber.addEventListener('mousedown', () => { scrubber._isDragging = true; });
    scrubber.addEventListener('touchstart', () => { scrubber._isDragging = true; });
    scrubber.addEventListener('mouseup', () => { scrubber._isDragging = false; });
    scrubber.addEventListener('touchend', () => { scrubber._isDragging = false; });

    scrubber.addEventListener('input', (e) => {
      const frac = parseFloat(e.target.value) / 1000;
      if (typeof PlaybackManager !== 'undefined') {
        PlaybackManager.seekTo(frac, { isFraction: true });
      }
    });
  }

  if (playBtn) {
    playBtn.addEventListener('click', () => {
      if (typeof PlaybackManager !== 'undefined') {
        PlaybackManager.togglePlay();
      }
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      if (typeof restoreActiveWorkspacePlanning === 'function') {
        restoreActiveWorkspacePlanning();
      }
    });
  }

  if (open3dBtn) {
    open3dBtn.addEventListener('click', () => {
      if (typeof FlightDiagnostics !== 'undefined' && FlightDiagnostics.open) {
        const fid = (typeof PlaybackManager !== 'undefined') ? PlaybackManager.activeFlightId : null;
        FlightDiagnostics.open('3d', fid || 'active-mission');
      }
    });
  }

  if (cacheBadge) {
    cacheBadge.addEventListener('click', () => {
      if (typeof PlaybackManager !== 'undefined') {
        const nextMode = (PlaybackManager.radarCacheMode === 'cached') ? 'live' : 'cached';
        PlaybackManager.setRadarCacheMode(nextMode);
        update2dRadarCacheMode(nextMode);
        if (typeof showToast === 'function') {
          showToast(`Radar Layer Mode: ${nextMode === 'cached' ? 'Cached Historical Snapshot' : 'Live Environmental Stream'}`, 'info');
        }
      }
    });
  }

  // Speed buttons
  const speedBtns = document.querySelectorAll('.replay-2d-speed-btn');
  speedBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const spd = parseFloat(btn.getAttribute('data-speed') || '1');
      if (typeof PlaybackManager !== 'undefined') {
        PlaybackManager.setSpeed(spd);
      }
      speedBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}


// Computes current state of modified settings across all 5 domains
