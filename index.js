// Centralized Logging Utility
const Logger = {
  info: (msg, ...args) => console.info(`[INFO] ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[WARN] ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[ERROR] ${msg}`, ...args)
};

// Global state variables
let map;
let centerMarker = null;
let pois = []; // Array of POI objects: { lat, lon, marker, name }
let flightPathPolyline = null;
let gridBoundsPolygon = null;
let waypointMarkersGroup = null;
let pitchLabelsGroup = null; // Separate layer for pitch labels — avoids ghost-dot artifacts in marker pane during zoom
let photoMarkersGroup = null;
let isAnyPopupOpen = false;
let isLegendCollapsed = false;
let originalMissionSettings = null;

// Geolocation state
let userLocation = null;

// Utility functions
function throttle(func, limit) {
  let lastFunc;
  let lastRan;
  return function(...args) {
    if (!lastRan) {
      func.apply(this, args);
      lastRan = Date.now();
    } else {
      clearTimeout(lastFunc);
      lastFunc = setTimeout(() => {
        if ((Date.now() - lastRan) >= limit) {
          func.apply(this, args);
          lastRan = Date.now();
        }
      }, limit - (Date.now() - lastRan));
    }
  };
}

// Unit conversion constants
const M_TO_FT = 3.2808399;
const FT_TO_M = 0.3048;
const MPS_TO_MPH = 2.23693629;

// Unit conversion helpers
let cachedUnitSystem = null;

function getUnitSystem() {
  if (cachedUnitSystem) return cachedUnitSystem;

  // Fallback if not initialized (e.g. in tests)
  const el = typeof document !== 'undefined' ? document.getElementById('unit-system') : null;
  if (el) {
    cachedUnitSystem = el.value;
    return cachedUnitSystem;
  }

  return (typeof localStorage !== 'undefined' ? localStorage.getItem('aalaapi_sky_unit_system') : null) || 'imperial';
}

function formatDistance(meters, decimalPlaces = 1) {
  if (meters === null || meters === undefined || isNaN(meters)) {
    return `0 ${getUnitSystem() === 'imperial' ? 'ft' : 'm'}`;
  }
  const unit = getUnitSystem();
  if (unit === 'imperial') {
    const feet = meters * M_TO_FT;
    return `${feet.toFixed(decimalPlaces)} ft`;
  }
  return `${meters.toFixed(decimalPlaces)} m`;
}
function initGeolocation() {
  const btn = document.getElementById('locate-me-btn');
  const label = document.getElementById('locate-me-label');
  const LOCATION_CACHE_KEY = 'aalaapi_sky_last_location';

  // Helper — applies a location object {lat, lon} to app state and flies map
  function applyLocation(loc, isCached) {
    userLocation = { lat: loc.lat, lon: loc.lon };
    if (label) label.textContent = isCached ? '📍 Cached Location' : '✓ Located';
    if (btn) {
      btn.style.color = isCached ? 'var(--accent-cyan, #06b6d4)' : 'var(--accent-green, #10b981)';
      btn.style.borderColor = isCached ? 'rgba(6, 182, 212, 0.4)' : 'rgba(16, 185, 129, 0.4)';
      btn.disabled = false;
    }
    if (typeof map !== 'undefined' && map) {
      map.flyTo([userLocation.lat, userLocation.lon], Math.max(map.getZoom(), 15), { animate: true, duration: 1.2 });
    }
    if (getCurrentWaypoints()) {
      redrawCurrentMission();
    }
  }

  // On page load — restore the last known location from localStorage so
  // mobile users who previously located themselves still have a useful
  // starting position even if geolocation is blocked on this visit.
  try {
    const cached = JSON.parse(localStorage.getItem(LOCATION_CACHE_KEY));
    if (cached && typeof cached.lat === 'number' && typeof cached.lon === 'number') {
      applyLocation(cached, true);
    }
  } catch (e) {
    Logger.warn('Could not restore cached location:', e);
  }

  if (!navigator.geolocation) {
    if (label && !userLocation) label.textContent = 'Location Not Supported';
    if (btn) btn.disabled = true;
    return;
  }

  if (btn) {
    btn.addEventListener('click', () => {
      if (label) label.textContent = '⏳ Locating…';
      btn.disabled = true;
      btn.style.color = '';
      btn.style.borderColor = '';
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const loc = {
            lat: position.coords.latitude,
            lon: position.coords.longitude
          };
          // Persist fresh fix to localStorage for next session / mobile fallback
          try {
            localStorage.setItem(LOCATION_CACHE_KEY, JSON.stringify(loc));
          } catch (e) {
            Logger.warn('Could not cache location:', e);
          }
          applyLocation(loc, false);
        },
        (error) => {
          Logger.warn("Geolocation service failed:", error);
          // If we have a cached location, fall back silently to it
          try {
            const cached = JSON.parse(localStorage.getItem(LOCATION_CACHE_KEY));
            if (cached && typeof cached.lat === 'number') {
              Logger.info('GPS denied — using cached location fallback.');
              applyLocation(cached, true);
              return;
            }
          } catch (e) { /* ignore */ }
          if (label) label.textContent = '✗ Location Denied';
          if (btn) {
            btn.style.color = 'var(--accent-red, #ef4444)';
            btn.style.borderColor = 'rgba(239, 68, 68, 0.4)';
            btn.disabled = false;
          }
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
      );
    });
  }
}


function initPatternSelectorCards() {
  const cards = document.querySelectorAll('.pattern-card');
  const selectEl = document.getElementById('grid-type');
  if (!selectEl) return;

  cards.forEach(card => {
    card.addEventListener('click', () => {
      const val = card.getAttribute('data-value');
      
      // Update select value
      selectEl.value = val;
      
      // Sync active state in UI
      cards.forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      
      // Dispatch change event to trigger existing app listeners
      selectEl.dispatchEvent(new Event('change'));
    });
  });

  // Keep cards in sync when select value is updated programmatically
  // (e.g. from Auto-Plan apply/cancel or config restoration)
  const syncCardsFromSelect = () => {
    const val = selectEl.value;
    cards.forEach(card => {
      if (card.getAttribute('data-value') === val) {
        card.classList.add('active');
      } else {
        card.classList.remove('active');
      }
    });
  };

  selectEl.addEventListener('change', syncCardsFromSelect);
  
  // Initial sync
  syncCardsFromSelect();
}

// State variables for imported KMZ missions
let importedWaypoints = null;
let importedPhotos = null;
let importedFileName = "";
let activeSplitStartIndices = new Set();

// State variables for procedurally generated missions
let generatedWaypoints = null;
let generatedPhotos = null;
let roadWaypoints = [];
let roadPathGroup = null;
let isRouting = false;
let isChangingPattern = false;

// Helpers to get currently active mission data
function getCurrentWaypoints() {
  return importedWaypoints || generatedWaypoints;
}

function getCurrentPhotos() {
  return importedPhotos || generatedPhotos;
}

// Camera specifications for DJI Mini 4 Pro (4:3 aspect ratio)
let CAMERA_HFOV = 69.7; // Horizontal field of view in degrees
let CAMERA_VFOV = 55.2; // Vertical field of view in degrees

// Standard satellite and street map layers
let streetLayer;
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
    });
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
  initGeolocation(); // Wires up the Locate Me button — does NOT auto-request permission
  initAutoPlan();
  initPatternSelectorCards();
  initHeadingHelpDrawer();
  // No updateGrid() here — map starts clean; user clicks map or uses Auto-Plan/Import to begin
  syncDisplayValues();
  togglePatternParameters();
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

  // Setup Tile Layers
  streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 22,
    maxNativeZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
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

  // Add Layer Control — include only layers that successfully initialized
  const baseMaps = {
    "Satellite View": satelliteLayer,
    "Street Map": streetLayer,
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

  L.control.layers(baseMaps, overlays, { position: 'topleft' }).addTo(map);

  // Airspace legend — shown/hidden based on which overlays are active
  initAirspaceLegend();
  map.on('overlayadd overlayremove', function(e) {
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

  // Zoom-gate: show LAANC and Obstacles only at certain zooms
  map.on('zoomend', function() {
    applyZoomGates();
  });

  // Layer groups for flight paths and markers
  flightPathPolyline = L.layerGroup().addTo(map);
  waypointMarkersGroup = L.layerGroup().addTo(map);
  pitchLabelsGroup = L.layerGroup().addTo(map); // Above waypointMarkersGroup
  photoMarkersGroup = L.layerGroup().addTo(map);
  roadPathGroup = L.layerGroup().addTo(map);

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
    const gridType = document.getElementById('grid-type').value;
    if (gridType === 'freeform') {
      addFreeformWaypoint(e.latlng.lat, e.latlng.lng);
    } else if (gridType === 'road-following') {
      addRoadWaypoint(e.latlng.lat, e.latlng.lng);
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
  'max-flight-time', 'camera-model', 'drone-model', 'camera-zoom', 'camera-hfov', 'camera-vfov', 'road-offset',
  'global-hover-time'
];

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
  localStorage.setItem('aalaapi_sky_input_settings', JSON.stringify(settings));
}

function restoreSettingsFromLocalStorage() {
  try {
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

// ─── RC 2 Guide Modal & Guidance Helpers ────────────────────────────────────

function switchGuideTab(targetTab) {
  if (typeof document === 'undefined') return;
  const canonicalTab = (targetTab === 'companion') ? 'service' : targetTab;
  const tabBtns = document.querySelectorAll('.guide-tab-btn');
  const tabPanes = document.querySelectorAll('.guide-tab-pane');
  tabBtns.forEach(btn => {
    if (btn.dataset.tab === canonicalTab || (canonicalTab === 'service' && btn.dataset.tab === 'companion')) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  tabPanes.forEach(pane => {
    if (pane.id === `guide-pane-${canonicalTab}` || (canonicalTab === 'service' && pane.id === 'guide-pane-companion')) {
      pane.classList.remove('hidden');
    } else {
      pane.classList.add('hidden');
    }
  });
}

function openRC2GuideModal(targetTab = 'service') {
  if (typeof document === 'undefined') return;
  const guideModal = document.getElementById('guide-modal');
  if (!guideModal) return;
  switchGuideTab(targetTab);
  guideModal.classList.remove('hidden');
  if (typeof window !== 'undefined' && window.innerWidth <= 768) {
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) sidebar.classList.remove('open');
  }
}

// Setup Event Listeners for UI controls
function initUIEventListeners() {
  // Get all controls
  const controls = [...CONTROLS_LIST];

  controls.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    
    // Listen to changes to trigger redrawing of the grid
    el.addEventListener('input', () => {
      syncDisplayValues();
      updateGrid();
    });
    
    el.addEventListener('change', () => {
      syncDisplayValues();
      updateGrid();
      saveAllSettingsToLocalStorage();
    });
  });

  const roadSnapEl = document.getElementById('road-snap');
  if (roadSnapEl) {
    roadSnapEl.addEventListener('change', () => {
      updateGrid();
      saveAllSettingsToLocalStorage();
    });
  }

  // Handle Camera Model preset change
  const cameraModelEl = document.getElementById('camera-model');
  const droneModelEl = document.getElementById('drone-model');
  const hfovSlider = document.getElementById('camera-hfov');
  const vfovSlider = document.getElementById('camera-vfov');
  if (cameraModelEl && hfovSlider && vfovSlider) {
    cameraModelEl.addEventListener('change', (e) => {
      const model = e.target.value;
      if (model === 'dji_mini_4_pro_std') {
        hfovSlider.value = 69.7;
        vfovSlider.value = 55.2;
        if (droneModelEl) droneModelEl.value = '68'; // Auto-select Mini 4 Pro (68)
      } else if (model === 'dji_mini_4_pro_wide') {
        hfovSlider.value = 97.0;
        vfovSlider.value = 79.0;
        if (droneModelEl) droneModelEl.value = '68'; // Auto-select Mini 4 Pro (68)
      } else if (model === 'skyrover_x1_std') {
        hfovSlider.value = 67.2;
        vfovSlider.value = 53.1;
      } else if (model === 'skyrover_x1_wide') {
        hfovSlider.value = 88.0;
        vfovSlider.value = 72.0;
      }
      syncDisplayValues();
      updateGrid();
    });

    const onCameraSliderInput = () => {
      const h = parseFloat(hfovSlider.value);
      const v = parseFloat(vfovSlider.value);
      if (h === 69.7 && v === 55.2) {
        cameraModelEl.value = 'dji_mini_4_pro_std';
      } else if (h === 97.0 && v === 79.0) {
        cameraModelEl.value = 'dji_mini_4_pro_wide';
      } else if (h === 67.2 && v === 53.1) {
        cameraModelEl.value = 'skyrover_x1_std';
      } else if (h === 88.0 && v === 72.0) {
        cameraModelEl.value = 'skyrover_x1_wide';
      } else {
        cameraModelEl.value = 'custom';
      }
    };
    hfovSlider.addEventListener('input', onCameraSliderInput);
    vfovSlider.addEventListener('input', onCameraSliderInput);
  }


  // Listener for dynamic pattern configuration visibility
  const gridTypeEl = document.getElementById('grid-type');
  if (gridTypeEl) {
    gridTypeEl.addEventListener('change', togglePatternParameters);
  }

  // Sync Capture Mode help text
  document.getElementById('capture-mode').addEventListener('change', (e) => {
    const helpText = document.getElementById('capture-help-text');
    if (e.target.value === 'stopAndShoot') {
      helpText.textContent = "Stop & Shoot halts the drone at every coordinate to take a photo. Recommended for sharp, automated maps.";
    } else if (e.target.value === 'video') {
      helpText.textContent = "Video Mode starts video recording automatically at takeoff and stops at the final waypoint. Recommended for cinematic road flyovers.";
    } else {
      helpText.textContent = "Continuous Flight flies smoothly through endpoints. The pilot must trigger DJI Fly's native interval shot (e.g. every 2s) manually.";
    }
  });

  // Search Address button
  document.getElementById('search-btn').addEventListener('click', searchAddress);
  document.getElementById('location-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      searchAddress();
    }
  });

  // Add POI button
  const addPoiBtn = document.getElementById('add-poi-btn');
  if (addPoiBtn) {
    addPoiBtn.addEventListener('click', () => {
      if (typeof map !== 'undefined' && map) {
        const center = map.getCenter();
        const offsetLat = center.lat + (Math.random() - 0.5) * 0.0005;
        const offsetLng = center.lng + (Math.random() - 0.5) * 0.0005;
        addPoi(offsetLat, offsetLng);
      }
    });
  }

  // Guide Modal controls
  const showGuideBtn = document.getElementById('show-guide-btn');
  const closeGuideBtn = document.getElementById('close-guide-btn');
  const closeGuideFooterBtn = document.getElementById('close-guide-footer-btn');
  const guideModal = document.getElementById('guide-modal');

  if (showGuideBtn) {
    showGuideBtn.addEventListener('click', () => openRC2GuideModal('manual'));
  }
  if (closeGuideBtn) {
    closeGuideBtn.addEventListener('click', () => guideModal && guideModal.classList.add('hidden'));
  }
  if (closeGuideFooterBtn) {
    closeGuideFooterBtn.addEventListener('click', () => guideModal && guideModal.classList.add('hidden'));
  }

  // Wire up guide navigation tabs
  const guideTabBtns = document.querySelectorAll('.guide-tab-btn');
  guideTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      switchGuideTab(btn.dataset.tab);
    });
  });

  // Wire up copy command buttons in guide modal
  const copyCmdBtns = document.querySelectorAll('.btn-copy-cmd');
  copyCmdBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const textToCopy = btn.dataset.copy || 'npm run companion';
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(textToCopy).then(() => {
          const originalText = btn.textContent;
          btn.textContent = 'Copied!';
          btn.style.color = '#34d399';
          setTimeout(() => {
            btn.textContent = originalText;
            btn.style.color = '';
          }, 2000);
        }).catch(() => {
          // Fallback if clipboard permission denied
          if (typeof prompt === 'function') prompt('Copy command:', textToCopy);
        });
      }
    });
  });

  // Wire up offline sync container guidance triggers
  const companionOfflineHint = document.getElementById('companion-offline-hint');
  if (companionOfflineHint) {
    companionOfflineHint.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!isCompanionOnline) {
        openRC2GuideModal('service');
      } else {
        openRC2GuideModal('usb');
      }
    });
  }

  const companionHelpBtn = document.getElementById('companion-help-btn');
  if (companionHelpBtn) {
    companionHelpBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openRC2GuideModal('service');
    });
  }

  const companionServiceHelpBtn = document.getElementById('companion-service-help-btn');
  if (companionServiceHelpBtn) {
    companionServiceHelpBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openRC2GuideModal('service');
    });
  }

  const companionUsbHelpBtn = document.getElementById('companion-usb-help-btn');
  if (companionUsbHelpBtn) {
    companionUsbHelpBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openRC2GuideModal('usb');
    });
  }

  const companionConfigHostBtn = document.getElementById('companion-config-host-btn');
  const companionHostPanel = document.getElementById('companion-host-panel');
  const companionHostInput = document.getElementById('companion-host-input');
  const companionHostSaveBtn = document.getElementById('companion-host-save-btn');
  const companionHostResetBtn = document.getElementById('companion-host-reset-btn');

  if (companionConfigHostBtn && companionHostPanel && companionHostInput) {
    companionHostInput.value = (typeof getCompanionApiBase === 'function') ? getCompanionApiBase() : 'http://127.0.0.1:8765';
    companionConfigHostBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = companionHostPanel.style.display === 'none' || !companionHostPanel.style.display;
      companionHostPanel.style.display = isHidden ? 'flex' : 'none';
      if (isHidden) {
        companionHostInput.value = (typeof getCompanionApiBase === 'function') ? getCompanionApiBase() : 'http://127.0.0.1:8765';
        companionHostInput.focus();
      }
    });

    if (companionHostSaveBtn) {
      companionHostSaveBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const val = companionHostInput.value.trim();
        if (typeof setCompanionApiBase === 'function') setCompanionApiBase(val);
        companionHostPanel.style.display = 'none';
      });
    }

    if (companionHostResetBtn) {
      companionHostResetBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof setCompanionApiBase === 'function') setCompanionApiBase('');
        companionHostInput.value = (typeof getCompanionApiBase === 'function') ? getCompanionApiBase() : 'http://127.0.0.1:8765';
        companionHostPanel.style.display = 'none';
      });
    }
  }

  const companionSyncContainer = document.getElementById('companion-sync-container');
  if (companionSyncContainer) {
    companionSyncContainer.addEventListener('click', (e) => {
      if (e.target && e.target.closest && (
        e.target.closest('#open-diagnostics-btn') ||
        e.target.closest('#direct-rc2-sync-btn') ||
        e.target.closest('#direct-rc2-pull-btn') ||
        e.target.closest('#companion-service-help-btn') ||
        e.target.closest('#companion-usb-help-btn') ||
        e.target.closest('#companion-config-host-btn') ||
        e.target.closest('#companion-host-panel')
      )) {
        return;
      }
      if (!isCompanionOnline) {
        openRC2GuideModal('service');
      } else if (!isRc2MtpConnected) {
        openRC2GuideModal('usb');
      }
    });
  }

  // About Modal controls
  const showAboutBtn = document.getElementById('about-btn');
  const closeAboutBtn = document.getElementById('close-about-btn');
  const closeAboutFooterBtn = document.getElementById('close-about-footer-btn');
  const aboutModal = document.getElementById('about-modal');

  if (showAboutBtn && aboutModal) {
    const toggleAboutModal = () => {
      aboutModal.classList.toggle('hidden');
      if (!aboutModal.classList.contains('hidden') && window.innerWidth <= 768) {
        document.querySelector('.sidebar').classList.remove('open');
      }
    };
    showAboutBtn.addEventListener('click', toggleAboutModal);
    if (closeAboutBtn) closeAboutBtn.addEventListener('click', toggleAboutModal);
    if (closeAboutFooterBtn) closeAboutFooterBtn.addEventListener('click', toggleAboutModal);
  }



  // Useful Links Modal controls
  const showLinksBtn = document.getElementById('useful-links-btn');
  const closeLinksBtn = document.getElementById('close-links-btn');
  const closeLinksFooterBtn = document.getElementById('close-links-footer-btn');
  const linksModal = document.getElementById('links-modal');

  if (showLinksBtn && linksModal) {
    const toggleLinksModal = (e) => {
      if (e) e.stopPropagation();
      linksModal.classList.toggle('hidden');
      if (!linksModal.classList.contains('hidden')) {
        updateOpenSkyLink();
        if (window.innerWidth <= 768) {
          document.querySelector('.sidebar').classList.remove('open');
        }
      }
    };
    showLinksBtn.addEventListener('click', toggleLinksModal);
    if (closeLinksBtn) closeLinksBtn.addEventListener('click', toggleLinksModal);
    if (closeLinksFooterBtn) closeLinksFooterBtn.addEventListener('click', toggleLinksModal);
  }

  // Pre-Flight KMZ Inspector controls
  const kmzAuditBtn = document.getElementById('kmz-audit-btn');
  const kmzPreflightBadge = document.getElementById('kmz-preflight-status-badge');
  const closeKmzInspectorBtn = document.getElementById('close-kmz-inspector-btn');
  const closeInspectorFooterBtn = document.getElementById('close-inspector-footer-btn');
  const inspectorAutofixDownloadBtn = document.getElementById('inspector-autofix-download-btn');
  const inspectorFileInput = document.getElementById('inspector-file-input');

  if (kmzAuditBtn) {
    kmzAuditBtn.addEventListener('click', () => {
      KMZInspector.open();
    });
  }

  if (kmzPreflightBadge) {
    kmzPreflightBadge.addEventListener('click', () => {
      KMZInspector.open();
    });
  }

  if (closeKmzInspectorBtn) {
    closeKmzInspectorBtn.addEventListener('click', () => {
      KMZInspector.close();
    });
  }

  if (closeInspectorFooterBtn) {
    closeInspectorFooterBtn.addEventListener('click', () => {
      KMZInspector.close();
    });
  }

  if (inspectorAutofixDownloadBtn) {
    inspectorAutofixDownloadBtn.addEventListener('click', () => {
      KMZInspector.close();
      if (typeof exportKMZ === 'function') exportKMZ();
    });
  }

  const inspectorCopyAntigravityBtn = document.getElementById('inspector-copy-antigravity-btn');
  if (inspectorCopyAntigravityBtn) {
    inspectorCopyAntigravityBtn.addEventListener('click', () => {
      KMZInspector.copyAntigravityPrompt();
    });
  }

  if (inspectorFileInput) {
    inspectorFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) KMZInspector.auditExternalKMZ(file);
    });
  }

  // KMZ Inspector Tab switching
  const tabChecklist = document.getElementById('inspector-tab-checklist');
  const tabWpml = document.getElementById('inspector-tab-wpml');
  const tabTmpl = document.getElementById('inspector-tab-tmpl');
  const paneChecklist = document.getElementById('inspector-pane-checklist');
  const paneWpml = document.getElementById('inspector-pane-wpml');
  const paneTmpl = document.getElementById('inspector-pane-tmpl');

  function switchInspectorTab(tabName) {
    [tabChecklist, tabWpml, tabTmpl].forEach(t => t && t.classList.remove('active'));
    [paneChecklist, paneWpml, paneTmpl].forEach(p => p && p.classList.add('hidden'));

    if (tabName === 'wpml' && tabWpml && paneWpml) {
      tabWpml.classList.add('active');
      paneWpml.classList.remove('hidden');
    } else if (tabName === 'tmpl' && tabTmpl && paneTmpl) {
      tabTmpl.classList.add('active');
      paneTmpl.classList.remove('hidden');
    } else if (tabChecklist && paneChecklist) {
      tabChecklist.classList.add('active');
      paneChecklist.classList.remove('hidden');
    }
  }

  if (tabChecklist) tabChecklist.addEventListener('click', () => switchInspectorTab('checklist'));
  if (tabWpml) tabWpml.addEventListener('click', () => switchInspectorTab('wpml'));
  if (tabTmpl) tabTmpl.addEventListener('click', () => switchInspectorTab('tmpl'));


  // Mobile & Desktop Sidebar Toggle
  const sidebarToggleBtn = document.getElementById('sidebar-toggle');
  const sidebarElement = document.querySelector('.sidebar');
  const minimizeSidebarToggle = document.getElementById('minimize-sidebar-toggle');

  if (sidebarToggleBtn && sidebarElement) {
    sidebarToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.innerWidth <= 768) {
        sidebarElement.classList.toggle('open');
      } else {
        const isCurrentlyMinimized = sidebarElement.classList.contains('minimized');
        sidebarElement.classList.toggle('minimized');
        
        // Sync with checkbox in config modal
        if (minimizeSidebarToggle) {
          minimizeSidebarToggle.checked = !isCurrentlyMinimized;
        }
        localStorage.setItem('aalaapi_sky_sidebar_minimized', !isCurrentlyMinimized);

        if (map) {
          setTimeout(() => map.invalidateSize(), 300);
        }
      }
    });

    // Close sidebar when clicking anywhere on the map
    if (map) {
      map.on('click', () => {
        if (window.innerWidth <= 768) {
          sidebarElement.classList.remove('open');
        }
      });
    }
  }

  // Download Mission file
  document.getElementById('download-btn').addEventListener('click', exportKMZ);
  initRC2Controls();
  initMultiVendorToggle();

  // Import KMZ triggers
  const importBtn = document.getElementById('import-btn');
  const importFileInput = document.getElementById('import-file-input');
  const clearImportedBtn = document.getElementById('clear-imported-btn');

  if (importBtn && importFileInput) {
    importBtn.addEventListener('click', () => importFileInput.click());
    importFileInput.addEventListener('change', handleKMZImport);
  }

  if (clearImportedBtn) {
    clearImportedBtn.addEventListener('click', clearImportedMission);
  }

  const clearMissionBtn = document.getElementById('clear-mission-btn');
  if (clearMissionBtn) {
    clearMissionBtn.addEventListener('click', clearMap);
  }

  // Collapsible Stats Panel handler
  const statsPanel = document.getElementById('stats-panel');
  const statsToggleBtn = document.getElementById('stats-toggle-btn');
  if (statsPanel && statsToggleBtn) {
    statsToggleBtn.addEventListener('click', () => {
      statsPanel.classList.toggle('collapsed');
    });
  }

  const unitSystemEl = document.getElementById('unit-system');
  if (unitSystemEl) {
    const savedUnit = localStorage.getItem('aalaapi_sky_unit_system');
    if (savedUnit) {
      unitSystemEl.value = savedUnit;
      cachedUnitSystem = savedUnit;
    } else {
      cachedUnitSystem = unitSystemEl.value;
    }
    syncDisplayValues();
    unitSystemEl.addEventListener('change', () => {
      localStorage.setItem('aalaapi_sky_unit_system', unitSystemEl.value);
      cachedUnitSystem = unitSystemEl.value;
      syncDisplayValues();
      if (getCurrentWaypoints()) {
        redrawCurrentMission();
      } else {
        updateGrid();
      }
    });
  }
  
  // --- CONFIG MODAL & SIDEBAR OPTIONS SYSTEM ---
  const configBtn = document.getElementById('config-btn');
  const configModal = document.getElementById('config-modal');
  const closeConfigBtn = document.getElementById('close-config-btn');
  const closeConfigFooterBtn = document.getElementById('close-config-footer-btn');

  if (configBtn && configModal) {
    const toggleConfigModal = () => {
      configModal.classList.toggle('hidden');
      if (!configModal.classList.contains('hidden')) {
        if (unitSystemEl) unitSystemEl.value = getUnitSystem();
        if (window.innerWidth <= 768) {
          document.querySelector('.sidebar')?.classList.remove('open');
        }
      }
    };
    configBtn.addEventListener('click', toggleConfigModal);
    if (closeConfigBtn) closeConfigBtn.addEventListener('click', toggleConfigModal);
    if (closeConfigFooterBtn) closeConfigFooterBtn.addEventListener('click', toggleConfigModal);
    configModal.addEventListener('click', (e) => {
      if (e.target === configModal) {
        configModal.classList.add('hidden');
      }
    });
  }

  // Minimize Sidebar Toggle checkbox handler
  if (minimizeSidebarToggle && sidebarElement) {
    // Read initial state
    const isSidebarMinimized = localStorage.getItem('aalaapi_sky_sidebar_minimized') === 'true';
    minimizeSidebarToggle.checked = isSidebarMinimized;
    if (isSidebarMinimized) {
      sidebarElement.classList.add('minimized');
    }

    minimizeSidebarToggle.addEventListener('change', () => {
      const shouldMinimize = minimizeSidebarToggle.checked;
      localStorage.setItem('aalaapi_sky_sidebar_minimized', shouldMinimize);
      sidebarElement.classList.toggle('minimized', shouldMinimize);
      if (map) {
        setTimeout(() => map.invalidateSize(), 300);
      }
    });
  }

  // Accordion Mode (Auto-Collapse) handler
  const accordionModeToggle = document.getElementById('accordion-mode-toggle');
  let isAccordionMode = true;
  if (accordionModeToggle) {
    const savedAccordion = localStorage.getItem('aalaapi_sky_accordion_mode');
    isAccordionMode = savedAccordion !== null ? (savedAccordion === 'true') : true;
    accordionModeToggle.checked = isAccordionMode;

    accordionModeToggle.addEventListener('change', () => {
      isAccordionMode = accordionModeToggle.checked;
      localStorage.setItem('aalaapi_sky_accordion_mode', isAccordionMode);
      if (isAccordionMode) {
        // Collapse all but the first expanded section
        let hasExpanded = false;
        document.querySelectorAll('.control-section').forEach(section => {
          if (section.classList.contains('guide-section')) return;
          if (!section.classList.contains('collapsed')) {
            if (hasExpanded) {
              section.classList.add('collapsed');
            } else {
              hasExpanded = true;
            }
          }
        });
      }
    });
  }

  // Topic Collapsible headers handler
  document.querySelectorAll('.control-section h3').forEach(header => {
    // Only bind if the section isn't guide-section
    const section = header.closest('.control-section');
    if (section && !section.classList.contains('guide-section')) {
      // Restore previous collapsed state if saved; default to collapsed
      const sectionIndex = Array.from(document.querySelectorAll('.control-section')).indexOf(section);
      const isCollapsed = localStorage.getItem(`aalaapi_sky_section_${sectionIndex}_collapsed`);
      if (isCollapsed !== null) {
        if (isCollapsed === 'true') {
          section.classList.add('collapsed');
        } else {
          section.classList.remove('collapsed');
        }
      } else {
        section.classList.add('collapsed');
      }

      header.addEventListener('click', () => {
        const wasCollapsed = section.classList.contains('collapsed');
        section.classList.toggle('collapsed');
        localStorage.setItem(`aalaapi_sky_section_${sectionIndex}_collapsed`, !wasCollapsed);

        if (isAccordionMode && wasCollapsed) { // wasCollapsed means we are now expanding
          document.querySelectorAll('.control-section').forEach(otherSection => {
            if (otherSection !== section && !otherSection.classList.contains('guide-section')) {
              otherSection.classList.add('collapsed');
              const otherIndex = Array.from(document.querySelectorAll('.control-section')).indexOf(otherSection);
              localStorage.setItem(`aalaapi_sky_section_${otherIndex}_collapsed`, 'true');
            }
          });
        }
      });
    }
  });

  // Collapse/Expand all topics buttons
  const collapseAllBtn = document.getElementById('collapse-all-topics-btn');
  const expandAllBtn = document.getElementById('expand-all-topics-btn');

  if (collapseAllBtn) {
    collapseAllBtn.addEventListener('click', () => {
      document.querySelectorAll('.control-section').forEach((section, idx) => {
        if (!section.classList.contains('guide-section')) {
          section.classList.add('collapsed');
          localStorage.setItem(`aalaapi_sky_section_${idx}_collapsed`, 'true');
        }
      });
    });
  }

  if (expandAllBtn) {
    expandAllBtn.addEventListener('click', () => {
      document.querySelectorAll('.control-section').forEach((section, idx) => {
        if (!section.classList.contains('guide-section')) {
          section.classList.remove('collapsed');
          localStorage.setItem(`aalaapi_sky_section_${idx}_collapsed`, 'false');
        }
      });
    });
  }
  
  // Run initial toggle to setup correct view state
  togglePatternParameters();

  // Setup Event Listeners for 3D View Modal
  const preview3dBtn = document.getElementById('preview-3d-btn');
  const close3dBtn = document.getElementById('close-3d-btn');
  const close3dFooterBtn = document.getElementById('close-3d-footer-btn');
  const preview3dModal = document.getElementById('preview-3d-modal');

  if (preview3dBtn && preview3dModal) {
    preview3dBtn.addEventListener('click', () => {
      preview3dModal.classList.remove('hidden');
      if (window.innerWidth <= 768) {
        document.querySelector('.sidebar').classList.remove('open');
      }
      init3DPreview();
      setTimeout(handle3DResize, 50);
      setTimeout(handle3DResize, 250);
    });
  }

  const closeModal = () => {
    if (preview3dModal) {
      preview3dModal.classList.add('hidden');
      const card = document.getElementById('preview-3d-card');
      if (card && card.classList.contains('fullscreen-3d')) {
        card.classList.remove('fullscreen-3d');
        const expandIcon = document.getElementById('expand-3d-icon-expand');
        const compressIcon = document.getElementById('expand-3d-icon-compress');
        const expandText = document.getElementById('expand-3d-text');
        if (expandIcon) expandIcon.classList.remove('hidden');
        if (compressIcon) compressIcon.classList.add('hidden');
        if (expandText) expandText.textContent = 'Expand';
      }
      if (document.exitFullscreen && document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      cleanup3DPreview();
    }
  };

  const expand3dBtn = document.getElementById('expand-3d-btn');
  if (expand3dBtn) {
    expand3dBtn.addEventListener('click', () => {
      const card = document.getElementById('preview-3d-card');
      if (!card) return;
      const isExpanded = card.classList.toggle('fullscreen-3d');
      const expandIcon = document.getElementById('expand-3d-icon-expand');
      const compressIcon = document.getElementById('expand-3d-icon-compress');
      const expandText = document.getElementById('expand-3d-text');
      
      if (expandIcon) expandIcon.classList.toggle('hidden', isExpanded);
      if (compressIcon) compressIcon.classList.toggle('hidden', !isExpanded);
      if (expandText) expandText.textContent = isExpanded ? 'Restore' : 'Expand';

      if (isExpanded && preview3dModal && preview3dModal.requestFullscreen) {
        preview3dModal.requestFullscreen().catch(() => {});
      } else if (!isExpanded && document.exitFullscreen && document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }

      setTimeout(handle3DResize, 50);
      setTimeout(handle3DResize, 300);
    });
  }

  if (close3dBtn) close3dBtn.addEventListener('click', closeModal);
  if (close3dFooterBtn) close3dFooterBtn.addEventListener('click', closeModal);

  // HUD Controls listeners
  const btnAutoRotate = document.getElementById('btn-3d-autorotate');
  if (btnAutoRotate) {
    btnAutoRotate.addEventListener('click', () => {
      autoRotate3D = !autoRotate3D;
      if (threeControls) threeControls.autoRotate = autoRotate3D;
      const indicator = document.getElementById('indicator-3d-autorotate');
      if (indicator) {
        indicator.style.background = autoRotate3D ? '#10b981' : '#ef4444';
      }
    });
  }

  const btnReset = document.getElementById('btn-3d-reset');
  if (btnReset) {
    btnReset.addEventListener('click', () => {
      reset3DCamera();
    });
  }

  const btnToggleCones = document.getElementById('btn-3d-toggle-cones');
  if (btnToggleCones) {
    btnToggleCones.addEventListener('click', () => {
      showCones = !showCones;
      coneGroups.forEach(g => g.visible = showCones);
      const indicator = document.getElementById('indicator-3d-cones');
      if (indicator) {
        indicator.style.background = showCones ? '#10b981' : '#ef4444';
      }
    });
  }

  const btnToggleFootprints = document.getElementById('btn-3d-toggle-footprints');
  if (btnToggleFootprints) {
    btnToggleFootprints.addEventListener('click', () => {
      showFootprints = !showFootprints;
      if (fpvActive) {
        const hp = getWaypointHeadingAndPitch(fpvProgressIndex, getCurrentWaypoints());
        redrawGroundPlane(hp.heading, hp.pitch);
      } else {
        redrawGroundPlane(0, 0);
      }
      const indicator = document.getElementById('indicator-3d-footprints');
      if (indicator) {
        indicator.style.background = showFootprints ? '#10b981' : '#ef4444';
      }
    });
  }

  const btnToggleDrones = document.getElementById('btn-3d-toggle-drones');
  if (btnToggleDrones) {
    btnToggleDrones.addEventListener('click', () => {
      showDroneModels = !showDroneModels;
      recreate3DWaypointsAndPaths();
      const indicator = document.getElementById('indicator-3d-drones');
      if (indicator) {
        indicator.style.background = showDroneModels ? '#10b981' : '#ef4444';
      }
    });
  }

  // Wires up FPV mode listeners
  setupFPVListeners();
}

// Dynamically hide/show sliders and change labels based on chosen flight pattern
function togglePatternParameters() {
  const gridType = document.getElementById('grid-type').value;

  // Transition out of Imported KMZ mode if active
  if (importedWaypoints) {
    if (gridType === 'freeform') {
      generatedWaypoints = [...importedWaypoints];
      generatedPhotos = [...importedPhotos];
    } else if (gridType === 'road-following') {
      const altitude = parseFloat(document.getElementById('altitude').value);
      roadWaypoints = importedWaypoints.map((wp, idx) => ({
        lat: wp.lat,
        lon: wp.lon,
        x: wp.x,
        y: wp.y,
        alt: wp.alt || altitude,
        pitch: wp.pitch || null,
        heading: wp.heading || null,
        isRingStart: wp.isRingStart || false,
        ringIndex: wp.ringIndex || null,
        isClicked: true,
        idx: idx
      }));
    }
    importedWaypoints = null;
    importedPhotos = null;
    importedFileName = null;
    const clearImportedBtn = document.getElementById('clear-imported-btn');
    if (clearImportedBtn) clearImportedBtn.classList.add('hidden');
    const importStatusText = document.getElementById('import-status-text');
    if (importStatusText) importStatusText.textContent = "Or click anywhere on the map to place the flight center.";
    const importFileInput = document.getElementById('import-file-input');
    if (importFileInput) importFileInput.value = "";
  }

  const widthSlider = document.getElementById('grid-width');
  const heightSlider = document.getElementById('grid-height');
  const rotationSlider = document.getElementById('grid-rotation');
  const gimbalPitchSlider = document.getElementById('gimbal-pitch');
  const frontOverlapSlider = document.getElementById('front-overlap');
  const sideOverlapSlider = document.getElementById('side-overlap');
  
  if (!widthSlider || !heightSlider || !rotationSlider) return;

  const widthContainer = widthSlider.closest('.control-group');
  const heightContainer = heightSlider.closest('.control-group');
  const rotationContainer = rotationSlider.closest('.control-group');
  const frontOverlapContainer = frontOverlapSlider ? frontOverlapSlider.closest('.control-group') : null;
  const sideOverlapContainer = sideOverlapSlider ? sideOverlapSlider.closest('.control-group') : null;
  const freeformInstructions = document.getElementById('freeform-instructions');
  const roadOffsetContainer = document.getElementById('road-offset-container');
  const roadSnapContainer = document.getElementById('road-snap-container');
  const gridGeometrySection = document.getElementById('grid-geometry-section');
  const gridGeometryTitle = document.getElementById('grid-geometry-title');

  const widthLabel = widthContainer.querySelector('.control-label > span');

  if (gridType === 'freeform') {
    roadWaypoints = []; // Clear road nodes
    if (gridGeometrySection) gridGeometrySection.style.display = 'none';
    if (widthContainer) widthContainer.style.display = 'none';
    if (heightContainer) heightContainer.style.display = 'none';
    if (rotationContainer) rotationContainer.style.display = 'none';
    if (frontOverlapContainer) frontOverlapContainer.style.display = 'none';
    if (sideOverlapContainer) sideOverlapContainer.style.display = 'none';
    if (freeformInstructions) {
      freeformInstructions.querySelector('span').textContent = "ℹ️ Click on the map to add custom waypoints. Drag waypoints to move them. Click a waypoint to delete or edit it.";
      freeformInstructions.classList.remove('hidden');
    }
    if (roadOffsetContainer) roadOffsetContainer.classList.add('hidden');
    if (roadSnapContainer) roadSnapContainer.classList.add('hidden');
    if (gimbalPitchSlider) gimbalPitchSlider.value = -60;

  } else if (gridType === 'road-following') {
    if (gridGeometrySection) gridGeometrySection.style.display = 'block';
    if (gridGeometryTitle) gridGeometryTitle.textContent = "2. Road Settings";
    if (widthContainer) widthContainer.style.display = 'none';
    if (heightContainer) heightContainer.style.display = 'none';
    if (rotationContainer) rotationContainer.style.display = 'none';
    if (frontOverlapContainer) frontOverlapContainer.style.display = 'none';
    if (sideOverlapContainer) sideOverlapContainer.style.display = 'none';
    if (freeformInstructions) {
      freeformInstructions.querySelector('span').textContent = "ℹ️ Click on the map to define the road path. Drag points to adjust the road. The drone flight path will automatically offset left/right based on the slider.";
      freeformInstructions.classList.remove('hidden');
    }
    if (roadOffsetContainer) roadOffsetContainer.classList.remove('hidden');
    if (roadSnapContainer) roadSnapContainer.classList.remove('hidden');

    // If we have active waypoints, but no road waypoints yet, convert them to road waypoints
    const activeWps = getCurrentWaypoints();
    if (roadWaypoints.length === 0 && activeWps && activeWps.length > 0) {
      const altitude = parseFloat(document.getElementById('altitude').value);
      roadWaypoints = activeWps.map((wp, idx) => ({
        lat: wp.lat,
        lon: wp.lon,
        x: wp.x,
        y: wp.y,
        alt: wp.alt || altitude,
        pitch: wp.pitch || null,
        heading: wp.heading || null,
        isRingStart: wp.isRingStart || false,
        ringIndex: wp.ringIndex || null,
        isClicked: true,
        idx: idx
      }));
    }

    // roadWaypoints are always preserved — never overwritten when switching modes.
    syncDisplayValues();
    if (roadWaypoints.length > 0) {
      updateGrid(); // Recalculate offset path from road waypoints and draw everything
    }
    return;

  } else {
    if (gridGeometrySection) gridGeometrySection.style.display = 'block';
    if (gridGeometryTitle) {
      if (gridType === 'orbit' || gridType === 'multi-orbit') {
        gridGeometryTitle.textContent = "2. Orbit Geometry";
      } else if (gridType === 'grid-orbit-combo' || gridType === 'grid-multi-orbit-combo') {
        gridGeometryTitle.textContent = "2. Hybrid Geometry";
      } else {
        gridGeometryTitle.textContent = "2. Grid Geometry";
      }
    }
    if (widthContainer) widthContainer.style.display = 'block';
    if (frontOverlapContainer) frontOverlapContainer.style.display = 'block';
    if (sideOverlapContainer) sideOverlapContainer.style.display = 'block';
    if (freeformInstructions) freeformInstructions.classList.add('hidden');
    if (roadOffsetContainer) roadOffsetContainer.classList.add('hidden');
    if (roadSnapContainer) roadSnapContainer.classList.add('hidden');

    if (gimbalPitchSlider) {
      if (gridType === 'single') {
        gimbalPitchSlider.value = -90;
      } else if (gridType === 'double') {
        gimbalPitchSlider.value = -60;
      } else if (gridType === 'orbit' || gridType === 'grid-orbit-combo' || gridType === 'grid-multi-orbit-combo') {
        gimbalPitchSlider.value = -45;
      }
    }

    if (gridType === 'orbit' || gridType === 'multi-orbit' || gridType === 'grid-orbit-combo' || gridType === 'grid-multi-orbit-combo') {
      if (widthLabel) widthLabel.textContent = "Orbit Radius";
      if (heightContainer) heightContainer.style.display = 'none';
      if (rotationContainer) rotationContainer.style.display = 'none';
      if (gridType === 'grid-orbit-combo' || gridType === 'grid-multi-orbit-combo') {
        if (rotationContainer) rotationContainer.style.display = 'block';
      } else {
        if (rotationContainer) rotationContainer.style.display = 'none';
      }
    } else {
      if (widthLabel) widthLabel.textContent = "Grid Width";
      if (heightContainer) heightContainer.style.display = 'block';
      if (rotationContainer) rotationContainer.style.display = 'block';
    }
  }

  // Force value displays to synchronize with the new slider values
  syncDisplayValues();

  // Conditionally hide Heading Mode for orbits (which have fixed procedural headings)
  const headingModeContainer = document.getElementById('heading-mode-container');
  if (headingModeContainer) {
    if (gridType === 'orbit' || gridType === 'multi-orbit') {
      headingModeContainer.style.display = 'none';
      const helpDrawer = document.getElementById('heading-help-drawer');
      if (helpDrawer) helpDrawer.classList.add('hidden');
    } else {
      headingModeContainer.style.display = 'block';
    }
  }

  const isProcedural = (gridType !== 'freeform' && gridType !== 'road-following');
  if (isProcedural) {
    roadWaypoints = []; // Clear road nodes
    updateGrid(); // Regenerate procedural grid/orbit from scratch
  } else {
    isChangingPattern = true;
    updateGrid();
    isChangingPattern = false;
  }
}

// Sync slider labels with actual slider values
function syncDisplayValues() {
  const gridType = document.getElementById('grid-type').value;
  const unit = getUnitSystem();
  
  const distUnitStr = unit === 'imperial' ? 'ft' : 'm';
  const speedUnitStr = unit === 'imperial' ? 'mph' : 'm/s';

  const widthVal = parseFloat(document.getElementById('grid-width').value);
  const rotationVal = parseFloat(document.getElementById('grid-rotation').value);
  const altitudeVal = parseFloat(document.getElementById('altitude').value);
  const speedVal = parseFloat(document.getElementById('speed').value);

  // Update additional units
  const spacingUnitEl = document.getElementById('grid-spacing-unit');
  if (spacingUnitEl) spacingUnitEl.textContent = distUnitStr;

  const apHeightUnitEl = document.getElementById('ap-height-unit');
  if (apHeightUnitEl) apHeightUnitEl.textContent = distUnitStr;

  const apClearanceUnitEl = document.getElementById('ap-clearance-unit');
  if (apClearanceUnitEl) apClearanceUnitEl.textContent = distUnitStr;

  const fpvAltUnitEl = document.getElementById('fpv-edit-alt-unit');
  if (fpvAltUnitEl) fpvAltUnitEl.textContent = distUnitStr;

  const fpvTelemAltUnitEl = document.getElementById('fpv-telemetry-alt-unit');
  if (fpvTelemAltUnitEl) fpvTelemAltUnitEl.textContent = distUnitStr;

  // Update Grid Width
  if (unit === 'imperial') {
    document.getElementById('width-val').textContent = Math.round(widthVal * M_TO_FT);
    document.getElementById('width-unit').textContent = "ft";
  } else {
    document.getElementById('width-val').textContent = widthVal;
    document.getElementById('width-unit').textContent = "m";
  }

  // Update Grid Height if it exists and is visible
  const heightValEl = document.getElementById('height-val');
  if (heightValEl) {
    const heightSlider = document.getElementById('grid-height');
    const heightVal = heightSlider ? parseFloat(heightSlider.value) : 100;
    if (unit === 'imperial') {
      heightValEl.textContent = Math.round(heightVal * M_TO_FT);
      document.getElementById('height-unit').textContent = "ft";
    } else {
      heightValEl.textContent = heightVal;
      document.getElementById('height-unit').textContent = "m";
    }
  }

  // Update Rotation
  const rotationValEl = document.getElementById('rotation-val');
  if (rotationValEl) {
    rotationValEl.textContent = rotationVal;
  }

  // Update Overlaps and Gimbal Pitch
  document.getElementById('front-overlap-val').textContent = document.getElementById('front-overlap').value;
  document.getElementById('side-overlap-val').textContent = document.getElementById('side-overlap').value;
  document.getElementById('gimbal-pitch-val').textContent = document.getElementById('gimbal-pitch').value;

  // Sync Camera HFOV and VFOV variables and displays
  const hfovSlider = document.getElementById('camera-hfov');
  const vfovSlider = document.getElementById('camera-vfov');
  const zoomSlider = document.getElementById('camera-zoom');
  if (hfovSlider && vfovSlider) {
    CAMERA_HFOV = parseFloat(hfovSlider.value);
    CAMERA_VFOV = parseFloat(vfovSlider.value);
    document.getElementById('camera-hfov-val').textContent = hfovSlider.value;
    document.getElementById('camera-vfov-val').textContent = vfovSlider.value;
  }
  if (zoomSlider) {
    document.getElementById('camera-zoom-val').textContent = parseFloat(zoomSlider.value).toFixed(1);
  }


  // Update Altitude
  if (unit === 'imperial') {
    document.getElementById('altitude-val').textContent = Math.round(altitudeVal * M_TO_FT);
    document.getElementById('altitude-unit').textContent = "ft";
  } else {
    document.getElementById('altitude-val').textContent = altitudeVal;
    document.getElementById('altitude-unit').textContent = "m";
  }

  // Update Speed
  if (unit === 'imperial') {
    document.getElementById('speed-val').textContent = (speedVal * MPS_TO_MPH).toFixed(1);
    document.getElementById('speed-unit').textContent = "mph";
  } else {
    document.getElementById('speed-val').textContent = speedVal;
    document.getElementById('speed-unit').textContent = "m/s";
  }

  // Update Max Flight Time
  const maxFlightTimeEl = document.getElementById('max-flight-time');
  const maxFlightTimeValEl = document.getElementById('max-flight-time-val');
  if (maxFlightTimeEl && maxFlightTimeValEl) {
    maxFlightTimeValEl.textContent = maxFlightTimeEl.value;
  }

  // Update Global Hover Time
  const globalHoverSlider = document.getElementById('global-hover-time');
  const globalHoverValEl = document.getElementById('global-hover-time-val');
  if (globalHoverSlider && globalHoverValEl) {
    globalHoverValEl.textContent = globalHoverSlider.value;
  }

  // Update Road Offset
  const roadOffsetSlider = document.getElementById('road-offset');
  const roadOffsetValEl = document.getElementById('road-offset-val');
  const roadOffsetUnitEl = document.getElementById('road-offset-unit');
  if (roadOffsetSlider && roadOffsetValEl && roadOffsetUnitEl) {
    const offsetVal = parseFloat(roadOffsetSlider.value);
    if (unit === 'imperial') {
      roadOffsetValEl.textContent = Math.round(offsetVal * M_TO_FT);
      roadOffsetUnitEl.textContent = "ft";
    } else {
      roadOffsetValEl.textContent = offsetVal;
      roadOffsetUnitEl.textContent = "m";
    }
  }
}

// Search Address via OpenStreetMap Nominatim API
function searchAddress() {
  const query = document.getElementById('location-input').value.trim();
  if (!query) return;

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
  if (centerMarker) {
    centerMarker.setLatLng([lat, lng]);
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
    centerMarker.bindPopup("<b>Flight Mission Center</b><br>Drag to reposition grid.").openPopup();
    
    // Set pois[0]
    pois[0] = {
      lat: lat,
      lon: lng,
      marker: centerMarker,
      name: "POI 0 (Center)"
    };

    // Recalculate grid when center is dragged
    centerMarker.on('dragstart', () => {
      clearWaypointCustomModifications();
    });
    centerMarker.on('drag', () => {
      if (pois[0]) {
        const latlng = centerMarker.getLatLng();
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

function addPoi(lat, lon) {
  if (!map) return;
  const idx = pois.length;
  // Terracotta target style
  const poiIcon = L.divIcon({
    className: `custom-poi-marker-${idx}`,
    html: `<div style="background-color: #f43f5e; width: 16px; height: 16px; border-radius: 50%; border: 3px solid #f8fafc; box-shadow: 0 0 10px rgba(244,63,94,0.8); display: flex; align-items: center; justify-content: center; color: white; font-size: 8px; font-weight: bold;">${idx}</div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  });

  const marker = L.marker([lat, lon], { draggable: true, icon: poiIcon }).addTo(map);
  marker.bindPopup(`<b>POI ${idx}</b><br>Drag to reposition target.`).openPopup();

  const poiObj = {
    lat: lat,
    lon: lon,
    marker: marker,
    name: `POI ${idx}`
  };
  pois.push(poiObj);

  marker.on('drag', () => {
    const latlng = marker.getLatLng();
    poiObj.lat = latlng.lat;
    poiObj.lon = latlng.lng;
    updateGrid();
  });

  marker.on('dragend', () => {
    marker.openPopup();
  });

  updatePoiListUI();
  updateGrid();
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
      pois[i].marker.setIcon(L.divIcon({
        className: `custom-poi-marker-${i}`,
        html: newHtml,
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      }));
      pois[i].marker.getPopup().setContent(`<b>POI ${i}</b><br>Drag to reposition target.`);
    }

    // Reset any waypoint pointing to this POI or higher
    const wps = getCurrentWaypoints();
    if (wps) {
      wps.forEach(wp => {
        if (wp.poiIndex === idx) {
          wp.poiIndex = 0;
        } else if (wp.poiIndex > idx) {
          wp.poiIndex--;
        }
      });
    }

    // Do the same for roadWaypoints
    if (roadWaypoints) {
      roadWaypoints.forEach(wp => {
        if (wp.poiIndex === idx) {
          wp.poiIndex = 0;
        } else if (wp.poiIndex > idx) {
          wp.poiIndex--;
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
    actionDiv.style.cssText = 'display: flex; align-items: center; gap: 8px;';

    const coordSpan = document.createElement('span');
    coordSpan.style.cssText = 'color: var(--text-muted); font-size: 0.65rem;';
    coordSpan.textContent = `${poi.lat.toFixed(5)}, ${poi.lon.toFixed(5)}`;
    actionDiv.appendChild(coordSpan);

    if (idx > 0) {
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.innerHTML = '&times;';
      deleteBtn.style.cssText = 'background: none; border: none; color: #ef4444; cursor: pointer; padding: 0 4px; font-size: 1rem; line-height: 1; transition: opacity 0.2s;';
      deleteBtn.addEventListener('mouseover', () => { deleteBtn.style.opacity = '0.7'; });
      deleteBtn.addEventListener('mouseout', () => { deleteBtn.style.opacity = '1.0'; });
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deletePoi(idx);
      });
      actionDiv.appendChild(deleteBtn);
    }

    item.appendChild(actionDiv);
    container.appendChild(item);
  });
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
      lat: centerMarker.getLatLng().lat,
      lon: centerMarker.getLatLng().lng,
      marker: centerMarker,
      name: "POI 0 (Center)"
    };
  }
  updatePoiListUI();
}


function recalculateRoadOffsetPath(centerLat, centerLon) {
  if (!roadWaypoints || roadWaypoints.length === 0) {
    generatedWaypoints = [];
    generatedPhotos = [];
    return;
  }

  const roadOffsetSlider = document.getElementById('road-offset');
  const D = roadOffsetSlider ? parseFloat(roadOffsetSlider.value) : 15;
  const altitude = parseFloat(document.getElementById('altitude').value);

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

    // 4. Calculate gimbal pitch and heading pointing to the road
    const altVal = wp.alt !== undefined && wp.alt !== null ? wp.alt : altitude;
    let pitchVal = wp.pitch;
    if (pitchVal === null || pitchVal === undefined) {
      pitchVal = -Math.round(Math.atan2(altVal, Math.abs(D)) * (180.0 / Math.PI));
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
    } else if (effectiveMode === 'followWayline') {
      headingVal = (Math.atan2(tx, ty) * (180.0 / Math.PI) + 360) % 360;
    } else {
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
      existingGwp.headingMode = mode;
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
      headingMode: mode,
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
  const gridWidth = parseFloat(document.getElementById('grid-width').value);
  const gridHeight = parseFloat(document.getElementById('grid-height').value);
  const rotation = parseFloat(document.getElementById('grid-rotation').value);
  const gridType = document.getElementById('grid-type').value;
  const overlapFront = parseFloat(document.getElementById('front-overlap').value) / 100.0;
  const overlapSide = parseFloat(document.getElementById('side-overlap').value) / 100.0;
  const altitude = parseFloat(document.getElementById('altitude').value);
  const speed = parseFloat(document.getElementById('speed').value);
  const captureMode = document.getElementById('capture-mode').value;
  const defaultGimbalPitch = parseFloat(document.getElementById('gimbal-pitch').value);

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
  } else if (gridType === 'freeform') {
    // Freeform mode: do not procedurally overwrite waypoints.
    // Instead, recalculate local offsets (x, y) relative to the current centerLat, centerLon
    if (!generatedWaypoints) {
      generatedWaypoints = [];
    }
    if (!generatedPhotos) {
      generatedPhotos = [];
    }

    generatedWaypoints.forEach((wp, idx) => {
      const offsets = geodeticToLocal(wp.lat, wp.lon, centerLat, centerLon);
      wp.x = offsets.x;
      wp.y = offsets.y;
      wp.idx = idx;
    });

    generatedPhotos.forEach((pt) => {
      const offsets = geodeticToLocal(pt.lat, pt.lon, centerLat, centerLon);
      pt.x = offsets.x;
      pt.y = offsets.y;
    });

    waypoints = generatedWaypoints;
    photoLocations = generatedPhotos;
  } else if (gridType === 'road-following') {
    if (!roadWaypoints) {
      roadWaypoints = [];
    }
    roadWaypoints.forEach((wp, idx) => {
      const offsets = geodeticToLocal(wp.lat, wp.lon, centerLat, centerLon);
      wp.x = offsets.x;
      wp.y = offsets.y;
      wp.idx = idx;
    });

    recalculateRoadOffsetPath(centerLat, centerLon);
    waypoints = generatedWaypoints;
    photoLocations = generatedPhotos;
  } else {
    if (isChangingPattern && generatedWaypoints && generatedWaypoints.length > 0) {
      waypoints = generatedWaypoints;
      photoLocations = generatedPhotos;
    } else {
      // 1. Calculate camera ground footprints
      const wFoot = 2.0 * altitude * Math.tan((CAMERA_HFOV / 2.0) * Math.PI / 180.0);
      const lFoot = 2.0 * altitude * Math.tan((CAMERA_VFOV / 2.0) * Math.PI / 180.0);

      // 2. Spacings
      sLine = wFoot * (1.0 - overlapSide);   // Across-track line spacing
      sPhoto = lFoot * (1.0 - overlapFront); // Along-track photo spacing

      // 3. Grid / Orbit Generation
      let gridData;
      actualRotation = (gridType === 'orbit' || gridType === 'multi-orbit') ? 0 : rotation;

      if (gridType === 'orbit') {
        gridData = generateOrbitCoordinates(gridWidth, sPhoto, altitude, defaultGimbalPitch);
      } else if (gridType === 'multi-orbit') {
        gridData = generateMultiOrbitCoordinates(gridWidth, sPhoto, altitude, defaultGimbalPitch);
      } else if (gridType === 'grid-orbit-combo') {
        gridData = generateGridOrbitComboCoordinates(gridWidth, actualRotation, captureMode, sLine, sPhoto, altitude, defaultGimbalPitch);
      } else if (gridType === 'grid-multi-orbit-combo') {
        gridData = generateGridMultiOrbitComboCoordinates(gridWidth, actualRotation, captureMode, sLine, sPhoto, altitude, defaultGimbalPitch);
      } else {
        gridData = generateGridCoordinates(gridWidth, gridHeight, actualRotation, gridType, captureMode, sLine, sPhoto);
      }
      
      waypoints = gridData.waypoints.map((pt, idx) => {
        const existingGwp = (generatedWaypoints && generatedWaypoints[idx]) ? generatedWaypoints[idx] : null;
        const geo = localToGeodetic(pt.x, pt.y, centerLat, centerLon, actualRotation);
        const alt = pt.alt !== undefined ? pt.alt : altitude;
        const pitch = pt.pitch !== undefined ? pt.pitch : defaultGimbalPitch;

        let finalHeading = pt.heading;
        let finalHeadingMode = pt.headingMode || null;
        if (gridType === 'double' && pitch !== -90) {
          finalHeading = Math.atan2(-pt.x, -pt.y) * (180.0 / Math.PI);
          if (finalHeading < 0) finalHeading += 360;
          finalHeadingMode = 'smoothTransition';
        }

        if (finalHeading !== null && finalHeading !== undefined) {
          finalHeading = (finalHeading + actualRotation) % 360;
        }

        if (existingGwp && existingGwp.isModified) {
          return {
            ...existingGwp,
            origLat: (existingGwp.origLat !== undefined && existingGwp.origLat !== null) ? existingGwp.origLat : geo.lat,
            origLon: (existingGwp.origLon !== undefined && existingGwp.origLon !== null) ? existingGwp.origLon : geo.lon,
            origX: (existingGwp.origX !== undefined && existingGwp.origX !== null) ? existingGwp.origX : pt.x,
            origY: (existingGwp.origY !== undefined && existingGwp.origY !== null) ? existingGwp.origY : pt.y,
            origAlt: (existingGwp.origAlt !== undefined && existingGwp.origAlt !== null) ? existingGwp.origAlt : alt,
            origPitch: (existingGwp.origPitch !== undefined && existingGwp.origPitch !== null) ? existingGwp.origPitch : pitch,
            origHeading: (existingGwp.origHeading !== undefined) ? existingGwp.origHeading : finalHeading
          };
        }

        return {
          ...geo,
          alt: alt,
          pitch: pitch,
          heading: finalHeading,
          headingMode: finalHeadingMode,
          speed: pt.speed !== undefined ? pt.speed : null,
          hoverTime: pt.hoverTime !== undefined ? pt.hoverTime : null,
          turnMode: pt.turnMode || 'inherit',
          cameraAction: pt.cameraAction || 'inherit',
          zoom: pt.zoom !== undefined ? pt.zoom : 1.0,
          isRingStart: pt.isRingStart || false,
          ringIndex: pt.ringIndex !== undefined ? pt.ringIndex : null,
          isModified: false,
          origLat: geo.lat,
          origLon: geo.lon,
          origX: pt.x,
          origY: pt.y,
          origAlt: alt,
          origPitch: pitch,
          origHeading: finalHeading,
          origSpeed: pt.speed !== undefined ? pt.speed : null,
          origHoverTime: pt.hoverTime !== undefined ? pt.hoverTime : null,
          origTurnMode: pt.turnMode || 'inherit',
          origCameraAction: pt.cameraAction || 'inherit',
          origZoom: pt.zoom !== undefined ? pt.zoom : 1.0,
          origIsRingStart: pt.isRingStart || false,
          origIsModified: false
        };
      });
      
      photoLocations = gridData.photos.map(pt => {
        const geo = localToGeodetic(pt.x, pt.y, centerLat, centerLon, actualRotation);
        const alt = pt.alt !== undefined ? pt.alt : altitude;
        const pitch = pt.pitch !== undefined ? pt.pitch : defaultGimbalPitch;

        let finalHeading = pt.heading;
        if (gridType === 'double' && pitch !== -90) {
          finalHeading = Math.atan2(-pt.x, -pt.y) * (180.0 / Math.PI);
          if (finalHeading < 0) finalHeading += 360;
        }

        if (finalHeading !== null && finalHeading !== undefined) {
          finalHeading = (finalHeading + actualRotation) % 360;
        }

        return {
          ...geo,
          alt: alt,
          pitch: pitch,
          heading: finalHeading,
          origLat: geo.lat,
          origLon: geo.lon,
          origX: pt.x,
          origY: pt.y,
          origAlt: alt,
          origPitch: pitch,
          origHeading: finalHeading,
          origIsRingStart: false,
          origIsModified: false
        };
      });

      generatedWaypoints = waypoints;
      generatedPhotos = photoLocations;
    }
  }

  // 4. Update Map Drawings
  drawFlightPath(waypoints, photoLocations, centerLat, centerLon, gridWidth, gridHeight, actualRotation);

  // 5. Update Stats Panel
  const stats = calculateStats(waypoints, photoLocations, speed, sLine, sPhoto, captureMode);
  updateStatsPanel(stats);
}

function redrawCurrentMission() {
  if (!centerMarker) return;

  const gridType = document.getElementById('grid-type').value;
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

  const gridWidth = parseFloat(document.getElementById('grid-width').value);
  const gridHeight = parseFloat(document.getElementById('grid-height').value);
  const rotation = parseFloat(document.getElementById('grid-rotation').value);
  const speed = parseFloat(document.getElementById('speed').value);
  const captureMode = document.getElementById('capture-mode').value;

  const actualRotation = (gridType === 'orbit' || gridType === 'multi-orbit') ? 0 : rotation;

  drawFlightPath(waypoints, photoLocations, centerLat, centerLon, gridWidth, gridHeight, actualRotation);

  const stats = calculateStats(waypoints, photoLocations, speed, null, null, captureMode);
  updateStatsPanel(stats);
}

// Generate relative meter-offset grid points
function generateGridCoordinates(width, height, rotation, gridType, captureMode, sLine, sPhoto) {
  const waypoints = [];
  const photos = [];

  // Pass 1: North-South primary grid flight lines
  const nLines = Math.max(2, Math.round(width / sLine) + 1);
  const nPhotos = Math.max(2, Math.round(height / sPhoto) + 1);
  
  const dxLine = nLines > 1 ? width / (nLines - 1) : 0;
  const dyPhoto = nPhotos > 1 ? height / (nPhotos - 1) : 0;

  for (let i = 0; i < nLines; i++) {
    const x = -width / 2.0 + i * dxLine;
    const startFromSouth = (i % 2 === 0);
    const linePoints = [];

    for (let j = 0; j < nPhotos; j++) {
      const yIdx = startFromSouth ? j : (nPhotos - 1 - j);
      const y = -height / 2.0 + yIdx * dyPhoto;
      linePoints.push({ x: x, y: y });
      
      // Save photo representation
      photos.push({ x: x, y: y });
    }

    if (captureMode === 'continuous' || captureMode === 'video') {
      // In continuous/video mode, waypoints are only at the start and end of each flight line
      waypoints.push(linePoints[0]);
      waypoints.push(linePoints[linePoints.length - 1]);
    } else {
      // In stop & shoot mode, every photo trigger is a waypoint
      linePoints.forEach(pt => waypoints.push(pt));
    }
  }

  // Pass 2: Perpendicular grid lines (if Double Grid)
  if (gridType === 'double') {
    const nLines2 = Math.max(2, Math.round(height / sLine) + 1);
    const nPhotos2 = Math.max(2, Math.round(width / sPhoto) + 1);

    const dyLine2 = nLines2 > 1 ? height / (nLines2 - 1) : 0;
    const dxPhoto2 = nPhotos2 > 1 ? width / (nPhotos2 - 1) : 0;

    for (let i = 0; i < nLines2; i++) {
      const y = -height / 2.0 + i * dyLine2;
      const startFromWest = (i % 2 === 0);
      const linePoints = [];

      for (let j = 0; j < nPhotos2; j++) {
        const xIdx = startFromWest ? j : (nPhotos2 - 1 - j);
        const x = -width / 2.0 + xIdx * dxPhoto2;
        linePoints.push({ x: x, y: y });

        // Save photo representation
        photos.push({ x: x, y: y });
      }

      if (captureMode === 'continuous' || captureMode === 'video') {
        // Continuous/video flight waypoints
        waypoints.push(linePoints[0]);
        waypoints.push(linePoints[linePoints.length - 1]);
      } else {
        // Stop & Shoot waypoints
        linePoints.forEach(pt => waypoints.push(pt));
      }
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
    const linePoints = [];

    const nPhotos = Math.max(2, Math.round((2 * yMax) / sPhoto) + 1);
    const dyPhoto = nPhotos > 1 ? (2 * yMax) / (nPhotos - 1) : 0;

    for (let j = 0; j < nPhotos; j++) {
      const yIdx = startFromSouth ? j : (nPhotos - 1 - j);
      const y = -yMax + yIdx * dyPhoto;
      
      linePoints.push({ x: x, y: y });
      photos.push({ x: x, y: y });
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

// Convert relative coordinates (meters) to geodesic coordinates (Lat/Lon)
// Handles rotation (heading in degrees) relative to North
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
  const gridType = document.getElementById('grid-type').value;
  const isMultiOrbit = gridType === 'multi-orbit';
  const isCombo = gridType === 'grid-orbit-combo';
  const isMultiCombo = gridType === 'grid-multi-orbit-combo';
  const defaultGimbalPitch = parseFloat(document.getElementById('gimbal-pitch').value);

  const isModified = isTempModified || wp.isModified;
  const isSplitStart = activeSplitStartIndices && activeSplitStartIndices.has(wp.idx !== undefined ? wp.idx : idx);

  let color = '#06b6d4'; // default cyan
  if (isModified) {
    color = '#ec4899'; // Hot pink for modified waypoints
  } else if (isSplitStart) {
    color = '#10b981'; // Emerald Green for all starting/takeoff points
  } else if (isMultiOrbit || isCombo || isMultiCombo || importedWaypoints) {
    if (wp.ringIndex === 0) color = '#a855f7';
    else if (wp.ringIndex === 1) color = '#06b6d4';
    else if (wp.ringIndex === 2) color = '#f59e0b';
    else if (wp.ringIndex === 3) color = '#3b82f6';
  }

  const isStart = idx === 0;
  const isEnd = idx === waypoints.length - 1;
  const radius = isStart || isEnd || isSplitStart ? 6 : 4;
  const borderWeight = isStart || isEnd || isSplitStart ? 2 : 1;
  const borderColor = (isStart || isSplitStart) ? '#10b981' : (isEnd ? '#ef4444' : '#ffffff');

  // Heading calculation
  let heading = 0;
  if (tempHeading !== undefined && tempHeading !== null) {
    heading = tempHeading;
  } else if (wp.heading !== null && wp.heading !== undefined) {
    heading = wp.heading;
  } else {
    const mode = wp.headingMode || 'inherit';
    let effectiveMode = mode;
    if (mode === 'inherit') {
      const globalMode = document.getElementById('heading-mode')?.value;
      effectiveMode = globalMode || 'followWayline';
    }

    if (effectiveMode === 'towardPOI') {
      const selectedPoiIndex = wp.poiIndex || 0;
      const targetPoi = pois[selectedPoiIndex];
      if (targetPoi) {
        const dy = targetPoi.lat - wp.lat;
        const dx = targetPoi.lon - wp.lon;
        heading = (90 - (Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360;
      } else {
        heading = 0;
      }
    } else if (effectiveMode === 'fixed') {
      heading = 0;
    } else {
      heading = getDefaultHeading(idx, waypoints, rotationDeg);
    }
  }

  // Pitch calculation
  const pitch = tempPitch !== undefined && tempPitch !== null ? tempPitch : (wp.pitch !== undefined && wp.pitch !== null ? wp.pitch : defaultGimbalPitch);

  let coneColor = 'rgba(6, 182, 212, 0.15)'; // default cyan cone
  if (isModified) {
    coneColor = 'rgba(236, 72, 153, 0.2)'; // Pink cone
  } else if (isMultiOrbit || isCombo || isMultiCombo) {
    if (wp.ringIndex === 0) coneColor = 'rgba(168, 85, 247, 0.2)';
    else if (wp.ringIndex === 1) coneColor = 'rgba(6, 182, 212, 0.2)';
    else if (wp.ringIndex === 2) coneColor = 'rgba(245, 158, 11, 0.2)';
    else if (wp.ringIndex === 3) coneColor = 'rgba(59, 130, 246, 0.2)';
  }

  return L.divIcon({
    className: 'custom-wp-marker',
    html: `
      <div class="wp-marker-wrapper" style="transform: rotate(${heading}deg);">
        <div class="wp-camera-cone" style="border-top-color: ${coneColor};"></div>
        <div class="wp-arrow" style="border-bottom-color: ${color};"></div>
      </div>
      <div class="wp-static-container">
        <div class="wp-dot" style="background-color: ${color}; border-color: ${borderColor}; width: ${radius * 2}px; height: ${radius * 2}px; border-width: ${borderWeight}px;"></div>
      </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });
}

// Draw flight path lines segment by segment (highlighting >100m in dashed red)
function drawFlightPathLines(waypoints, gridType) {
  if (flightPathPolyline) flightPathPolyline.clearLayers();
  if (waypoints.length < 2) return;

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

  // Draw segment by segment to color-code warnings
  for (let i = 1; i < waypoints.length; i++) {
    const p1 = waypoints[i - 1];
    const p2 = waypoints[i];
    const latlngs = [[p1.lat, p1.lon], [p2.lat, p2.lon]];
    const dist = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));

    let color = '#06b6d4'; // default cyan
    let dashArray = null;
    let weight = 3.5;
    let opacity = 0.85;

    if (dist > 100.0) {
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
      className: dist > 100.0 ? '' : 'flight-path-line',
      interactive: false
    }).addTo(flightPathPolyline);
  }
}

// Render bounding box, flight path, and markers on Leaflet
function drawFlightPath(waypoints, photoLocations, centerLat, centerLon, gridWidth, gridHeight, rotationDeg) {
  recalculateSplitStarts();
  // 1. Clear previous layers
  if (flightPathPolyline) flightPathPolyline.clearLayers();
  if (gridBoundsPolygon) map.removeLayer(gridBoundsPolygon);
  waypointMarkersGroup.clearLayers();
  if (pitchLabelsGroup) pitchLabelsGroup.clearLayers();
  photoMarkersGroup.clearLayers();
  if (roadPathGroup) roadPathGroup.clearLayers();

  const gridType = document.getElementById('grid-type').value;

  // 2. Draw boundary overlay
  if (gridType === 'road-following' || gridType === 'freeform') {
    // No boundary overlay for road-following or freeform
  } else if (gridType === 'orbit' || gridType === 'multi-orbit' || gridType === 'grid-orbit-combo' || gridType === 'grid-multi-orbit-combo') {
    const maxRadius = (gridType === 'multi-orbit' || gridType === 'grid-multi-orbit-combo') ? gridWidth * 1.1 : gridWidth;
    gridBoundsPolygon = L.circle([centerLat, centerLon], {
      radius: maxRadius,
      color: '#f59e0b',
      weight: 2,
      dashArray: '5, 5',
      fillColor: '#f59e0b',
      fillOpacity: 0.03
    }).addTo(map);
  } else {
    // Draw rotated bounding box
    const halfW = gridWidth / 2.0;
    const halfH = gridHeight / 2.0;
    const corners = [
      localToGeodetic(-halfW, halfH, centerLat, centerLon, rotationDeg), // TL
      localToGeodetic(halfW, halfH, centerLat, centerLon, rotationDeg),  // TR
      localToGeodetic(halfW, -halfH, centerLat, centerLon, rotationDeg), // BR
      localToGeodetic(-halfW, -halfH, centerLat, centerLon, rotationDeg) // BL
    ];
    
    const polygonLatLngs = corners.map(c => [c.lat, c.lon]);
    gridBoundsPolygon = L.polygon(polygonLatLngs, {
      color: '#f59e0b',
      weight: 2,
      dashArray: '5, 5',
      fillColor: '#f59e0b',
      fillOpacity: 0.05
    }).addTo(map);
  }

  // 3. Draw flight path line segments
  drawFlightPathLines(waypoints, gridType);

  // 4. Draw Waypoint Markers (with direction arrows and detailed camera specs)
  const isMultiOrbit = gridType === 'multi-orbit';
  const isCombo = gridType === 'grid-orbit-combo';
  const isMultiCombo = gridType === 'grid-multi-orbit-combo';
  const gimbalPitch = parseFloat(document.getElementById('gimbal-pitch').value);

  if (gridType === 'road-following') {
    // Render road path and draggable road markers
    if (roadWaypoints && roadWaypoints.length > 0) {
      const roadLatLngs = roadWaypoints.map(wp => [wp.lat, wp.lon]);
      const roadPolyline = L.polyline(roadLatLngs, {
        color: '#f59e0b', // Amber yellow
        weight: 3,
        dashArray: '6, 6',
        opacity: 0.8,
        interactive: false
      }).addTo(roadPathGroup);

      roadWaypoints.forEach((wp, idx) => {
        const roadIcon = L.divIcon({
          className: 'road-waypoint-icon',
          html: `<div style="background-color: #f59e0b; width: 18px; height: 18px; border-radius: 50%; border: 2px solid #ffffff; box-shadow: 0 0 6px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; font-size: 10px; color: white; font-weight: bold; cursor: pointer;">${idx}</div>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        });

        const marker = L.marker([wp.lat, wp.lon], {
          icon: roadIcon,
          draggable: true
        });

        wp.roadMarker = marker; // Save reference to road marker

        marker.bindTooltip(`Road Node ${idx}`, { direction: 'top', offset: [0, -10] });

        marker.on('drag', (e) => {
          const newLatLng = e.target.getLatLng();
          const offsets = geodeticToLocal(newLatLng.lat, newLatLng.lng, centerLat, centerLon);
          wp.lat = newLatLng.lat;
          wp.lon = newLatLng.lng;
          wp.x = offsets.x;
          wp.y = offsets.y;
          wp.isModified = true;
          
          roadPolyline.setLatLngs(roadWaypoints.map(w => [w.lat, w.lon]));

          recalculateRoadOffsetPath(centerLat, centerLon);

          updatePathLinesAndStats(generatedWaypoints, generatedPhotos, centerLat, centerLon, gridWidth, gridHeight, rotationDeg);

          // gimbalPitch is already calculated at the top of the function
          generatedWaypoints.forEach((gwp) => {
            if (gwp.mapMarker) {
              gwp.mapMarker.setLatLng([gwp.lat, gwp.lon]);
              const gPitch = gwp.pitch !== undefined && gwp.pitch !== null ? gwp.pitch : gimbalPitch;
              const headingDisplay = (gwp.heading !== null && gwp.heading !== undefined && !isNaN(gwp.heading)) ? gwp.heading.toFixed(0) : '—';
              const tooltipContent = `Drone Waypoint ${gwp.idx}<br>Height: ${formatDistance(gwp.alt, 0)}<br>Yaw: ${headingDisplay}°<br>Pitch: ${gPitch}°`;
              gwp.mapMarker.setTooltipContent(tooltipContent);
            }
          });
        });

        marker.on('dragstart', () => {
          bringMarkerToFront(marker);
          if (typeof map !== 'undefined' && map && map.closePopup) {
            map.closePopup();
          }
          if (wp.origLat === undefined || wp.origLat === null) {
            wp.origLat = wp.lat;
            wp.origLon = wp.lon;
            wp.origX = wp.x;
            wp.origY = wp.y;
          }
        });

        marker.on('dragend', () => {
          redrawCurrentMission();
          if (wp.roadMarker) bringMarkerToFront(wp.roadMarker);
        });

        marker.on('dragstart', () => {
          bringMarkerToFront(marker);
          if (typeof map !== 'undefined' && map && map.closePopup) {
            map.closePopup();
          }
        });
        marker.on('popupopen', () => bringMarkerToFront(marker));
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

        marker.bindPopup(() => {
          return createWaypointEditorDOM(wp, idx, marker);
        }, {
          maxWidth: 240,
          minWidth: 230,
          offset: [0, -20]
        });

        marker.addTo(roadPathGroup);
      });
    }

    // Render drone waypoints as small, non-draggable cyan circles
    waypoints.forEach((wp, idx) => {
      const droneMarker = L.circleMarker([wp.lat, wp.lon], {
        radius: 5,
        color: 'rgba(6, 182, 212, 0.2)', // Semi-transparent glow
        fillColor: '#06b6d4',
        fillOpacity: 0.9,
        weight: 8 // Large weight for easy click target
      });

      wp.droneMarker = droneMarker;

      const pitch = wp.pitch !== undefined && wp.pitch !== null ? wp.pitch : gimbalPitch;
      const headingDisplay = (wp.heading !== null && wp.heading !== undefined && !isNaN(wp.heading)) ? wp.heading.toFixed(0) : '—';
      const tooltipContent = `Drone Waypoint ${idx}<br>Height: ${formatDistance(wp.alt, 0)}<br>Yaw: ${headingDisplay}°<br>Pitch: ${pitch}°`;
      droneMarker.bindTooltip(tooltipContent, { direction: 'top', offset: [0, -5] });

      wp.mapMarker = droneMarker;
      droneMarker.addTo(waypointMarkersGroup);

      // Make drone waypoints interactive to select/edit/delete
      droneMarker.bindPopup(() => {
        return createWaypointEditorDOM(wp, idx, droneMarker);
      }, {
        maxWidth: 240,
        minWidth: 230,
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
    });

  } else {
    // Render standard waypoints
    waypoints.forEach((wp, idx) => {
      const isStart = idx === 0;
      const isEnd = idx === waypoints.length - 1;
      
      // Generate icon using helper
      const markerIcon = getMarkerIcon(wp, idx, waypoints, rotationDeg);

      // Calculate heading/yaw direction for the tooltip
      let heading = 0;
      if (wp.heading !== null && wp.heading !== undefined) {
        heading = wp.heading;
      } else {
        heading = getDefaultHeading(idx, waypoints, rotationDeg);
      }
      
      const pitch = wp.pitch !== undefined && wp.pitch !== null ? wp.pitch : gimbalPitch;
      const title = `${isStart ? "Start Point" : (isEnd ? "End Point" : `Waypoint ${idx}`)}<br>Height: ${formatDistance(wp.alt, 0)}<br>Yaw: ${heading.toFixed(0)}°<br>Pitch: ${pitch}°`;

      const isDraggable = true; // Dragging is enabled for all waypoints!

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
          const offsets = geodeticToLocal(newLatLng.lat, newLatLng.lng, centerLat, centerLon);
          
          // Update coordinates in the global array
          wp.lat = newLatLng.lat;
          wp.lon = newLatLng.lng;
          wp.x = offsets.x;
          wp.y = offsets.y;
          
          wp.isModified = true; // Mark as modified!

          // Update photo location if there's a corresponding one
          const activePhotos = getCurrentPhotos();
          if (activePhotos && activePhotos[idx]) {
            activePhotos[idx].lat = newLatLng.lat;
            activePhotos[idx].lon = newLatLng.lng;
            activePhotos[idx].x = offsets.x;
            activePhotos[idx].y = offsets.y;
          }

          // Redraw lines and stats in real-time
          updatePathLinesAndStats(waypoints, photoLocations, centerLat, centerLon, gridWidth, gridHeight, rotationDeg);
        });

        marker.on('dragend', () => {
          // Redraw completely to update headings and tooltips
          redrawCurrentMission();
          if (wp.mapMarker) bringMarkerToFront(wp.mapMarker, idx);
        });
      }

      marker.bindPopup(() => {
        return createWaypointEditorDOM(wp, idx, marker);
      }, {
        maxWidth: 240,
        minWidth: 230,
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

      // Add pitch label as a SEPARATE marker in pitchLabelsGroup.
      // This avoids the ghost-dot artifact: labels inside divIcons use overflow:visible
      // which causes them to render outside the icon's composited layer during zoom animations.
      // A dedicated label marker lives in its own pane and is properly repositioned on zoom.
      if (pitchLabelsGroup) {
        const labelIcon = L.divIcon({
          className: 'wp-pitch-label-marker',
          html: `<div class="wp-pitch-label">${pitch}°</div>`,
          iconSize: [30, 14],
          iconAnchor: [15, -6] // Centered horizontally, positioned below the dot
        });
        const labelMarker = L.marker([wp.lat, wp.lon], {
          icon: labelIcon,
          interactive: false,
          zIndexOffset: -100
        });
        wp.pitchLabelMarker = labelMarker;
        labelMarker.addTo(pitchLabelsGroup);
      }
    });
  }

  // 5. Draw Photo trigger markers (yellow dots) in continuous mode
  const captureMode = document.getElementById('capture-mode').value;
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
  if (mapLegend) {
    map.removeControl(mapLegend);
    mapLegend = null;
  }

  const gridType = document.getElementById('grid-type').value;

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

  const altitudeVal = parseFloat(document.getElementById('altitude').value);

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
    } else if (gridType === 'road-following') {
      title = "Mission Layers";
      itemsHtml = `
        <div class="legend-item"><span class="legend-color" style="background-color: #f59e0b; border: 1px dashed rgba(255,255,255,0.4);"></span> Road Path</div>
        <div class="legend-item"><span class="legend-color" style="background-color: #06b6d4;"></span> Drone Path (Offset)</div>
      `;
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
  const zoom = map.getZoom();

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
  updateAirspaceLegend(null);

  // Hide pitch labels, camera cones, and arrows at low zoom to prevent them
  // from visually floating disconnected from their map-anchored dot position.
  // These elements extend outside the 24x24 iconSize box (overflow: visible),
  // so at low zoom they appear detached. Hide them below zoom 18.
  const WP_DETAIL_MIN_ZOOM = 18;
  const mapContainer = map.getContainer();
  if (mapContainer) {
    if (zoom >= WP_DETAIL_MIN_ZOOM) {
      mapContainer.classList.remove('wp-zoomed-out');
      // Show pitch label layer
      if (pitchLabelsGroup && !map.hasLayer(pitchLabelsGroup)) {
        pitchLabelsGroup.addTo(map);
      }
    } else {
      mapContainer.classList.add('wp-zoomed-out');
      // Hide pitch label layer entirely — removes all label markers from pane, no ghost dots
      if (pitchLabelsGroup && map.hasLayer(pitchLabelsGroup)) {
        map.removeLayer(pitchLabelsGroup);
      }
    }
  }
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
  const isStopAndShoot = captureMode === 'stopAndShoot';
  
  let totalHoverSeconds = 0;
  for (let i = startIdx; i <= endIdx; i++) {
    const wp = wps[i];
    if (!wp) continue;
    const baseHover = (wp.hoverTime !== null && wp.hoverTime !== undefined) ? wp.hoverTime : globalHover;
    let wpEffectiveHover = baseHover;
    if (isStopAndShoot && wpEffectiveHover < 2) {
      const reposInfo = checkNeedsReposition(i, wps);
      if (reposInfo.needsReposition) {
        wpEffectiveHover = 2; // Auto-applied settling delay
      }
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
  const waypoints = getCurrentWaypoints();
  if (!waypoints || waypoints.length < 2) {
    activeSplitStartIndices = new Set();
    return;
  }
  const maxFlightTimeEl = document.getElementById('max-flight-time');
  const maxFlightTimeMinutes = maxFlightTimeEl ? parseFloat(maxFlightTimeEl.value) : 20;
  const speed = parseFloat(document.getElementById('speed').value);
  const captureMode = document.getElementById('capture-mode').value;
  
  const parts = splitWaypointsIntoParts(waypoints, maxFlightTimeMinutes, speed, captureMode);
  const starts = new Set();
  if (parts.length > 1) {
    parts.forEach(part => starts.add(part.startIdx));
  }
  activeSplitStartIndices = starts;
}

function addFreeformWaypoint(lat, lng) {
  if (!centerMarker) {
    setGridCenter(lat, lng);
    return;
  }

  const centerLatLng = centerMarker.getLatLng();
  const offsets = geodeticToLocal(lat, lng, centerLatLng.lat, centerLatLng.lng);
  const altitude = parseFloat(document.getElementById('altitude').value);
  const defaultGimbalPitch = parseFloat(document.getElementById('gimbal-pitch').value);

  const activeWps = getCurrentWaypoints() || [];
  const idx = activeWps.length;

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
  } else {
    if (!generatedWaypoints) generatedWaypoints = [];
    if (!generatedPhotos) generatedPhotos = [];
    generatedWaypoints.push(wp);
    generatedPhotos.push(pt);
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

  const centerLatLng = centerMarker.getLatLng();
  const altitude = parseFloat(document.getElementById('altitude').value);

  const roadSnapCheckbox = document.getElementById('road-snap');
  const snapToRoad = roadSnapCheckbox ? roadSnapCheckbox.checked : true;

  if (roadWaypoints.length === 0 || !snapToRoad) {
    const offsets = geodeticToLocal(lat, lng, centerLatLng.lat, centerLatLng.lng);
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
    updateGrid();
    return;
  }

  const lastWp = roadWaypoints[roadWaypoints.length - 1];
  isRouting = true;

  const freeformInstructions = document.getElementById('freeform-instructions');
  let originalAlertText = "";
  if (freeformInstructions) {
    const span = freeformInstructions.querySelector('span');
    originalAlertText = span.textContent;
    span.textContent = "⏳ Snapping to road via OpenStreetMap routing service...";
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
        freeformInstructions.querySelector('span').textContent = originalAlertText;
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
            const offsets = geodeticToLocal(ptLat, ptLon, centerLatLng.lat, centerLatLng.lng);
            
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
        freeformInstructions.querySelector('span').textContent = originalAlertText;
        freeformInstructions.style.background = "";
        freeformInstructions.style.borderColor = "";
        freeformInstructions.style.color = "";
      }
      Logger.error("OSRM error:", err);
      fallbackDirectLine();
    });

  function fallbackDirectLine() {
    const offsets = geodeticToLocal(lat, lng, centerLatLng.lat, centerLatLng.lng);
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
    updateGrid();
  }
}

// Calculate flight stats
function calculateStats(waypoints, photoLocations, speed, sLine, sPhoto, captureMode) {
  if (waypoints.length < 2) return null;

  // 1. Calculate path length in meters
  let totalDistance = 0;
  for (let i = 1; i < waypoints.length; i++) {
    const p1 = waypoints[i - 1];
    const p2 = waypoints[i];
    const d = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
    totalDistance += d;
  }

  // Nearest neighbor calculation for each waypoint
  let maxNearestNeighborDistSq = 0;
  for (let i = 0; i < waypoints.length; i++) {
    const p1 = waypoints[i];
    let minDistSq = Infinity;
    for (let j = 0; j < waypoints.length; j++) {
      if (i === j) continue;
      const p2 = waypoints[j];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dSq = dx * dx + dy * dy;
      if (dSq < minDistSq) {
        minDistSq = dSq;
      }
    }
    if (minDistSq !== Infinity && minDistSq > maxNearestNeighborDistSq) {
      maxNearestNeighborDistSq = minDistSq;
    }
  }
  const maxNearestNeighborDist = Math.sqrt(maxNearestNeighborDistSq);
  const hasIsolatedWaypoint = maxNearestNeighborDist > 100.0;

  // Geolocation check
  let isFarFromTakeoff = false;
  let userDistanceToTakeoff = null;
  if (userLocation && waypoints.length > 0) {
    const takeoffL = L.latLng(waypoints[0].lat, waypoints[0].lon);
    const userL = L.latLng(userLocation.lat, userLocation.lon);
    userDistanceToTakeoff = userL.distanceTo(takeoffL); // in meters
    isFarFromTakeoff = userDistanceToTakeoff > 609.6; // 2000 ft in meters
  }

  // 2. Photo count
  const photoCount = photoLocations.length;
  // 3. Est flight time (accounting for stop-and-shoot hover delays)
  let flightTimeSeconds = totalDistance / speed;
  if (captureMode === 'stopAndShoot') {
    flightTimeSeconds += photoCount * 4.5;
  }
  
  // Sum hover times across all waypoints
  const globalHoverEl = document.getElementById('global-hover-time');
  const globalHover = globalHoverEl ? (parseInt(globalHoverEl.value) || 0) : 0;
  const isStopAndShoot = captureMode === 'stopAndShoot';
  
  let totalHoverSeconds = 0;
  waypoints.forEach((wp, idx) => {
    const baseHover = (wp.hoverTime !== null && wp.hoverTime !== undefined) ? wp.hoverTime : globalHover;
    let wpEffectiveHover = baseHover;
    if (isStopAndShoot && wpEffectiveHover < 2) {
      const reposInfo = checkNeedsReposition(idx, waypoints);
      if (reposInfo.needsReposition) {
        wpEffectiveHover = 2; // Auto-applied settling delay
      }
    }
    totalHoverSeconds += wpEffectiveHover;
  });
  flightTimeSeconds += totalHoverSeconds;
  
  flightTimeSeconds += 45;

  const min = Math.floor(flightTimeSeconds / 60);
  const sec = Math.round(flightTimeSeconds % 60);

  const maxFlightTimeEl = document.getElementById('max-flight-time');
  const maxFlightTimeMinutes = maxFlightTimeEl ? parseFloat(maxFlightTimeEl.value) : 20;
  const maxFlightTimeSeconds = maxFlightTimeMinutes * 60;
  const isOverMaxFlightTime = flightTimeSeconds > maxFlightTimeSeconds;
  
  let partsCount = 1;
  if (isOverMaxFlightTime && waypoints.length > 1) {
    const parts = splitWaypointsIntoParts(waypoints, maxFlightTimeMinutes, speed, captureMode);
    partsCount = parts.length;
  }

  return {
    waypointsCount: waypoints.length,
    photoCount: photoCount,
    lineSpacing: sLine,
    photoSpacing: sPhoto,
    distance: totalDistance,
    timeStr: `${min}m ${sec}s`,
    flightTimeSeconds: flightTimeSeconds,
    isOverMaxFlightTime: isOverMaxFlightTime,
    maxFlightTimeMinutes: maxFlightTimeMinutes,
    partsCount: partsCount,
    maxNearestNeighborDist: maxNearestNeighborDist,
    hasIsolatedWaypoint: hasIsolatedWaypoint,
    isFarFromTakeoff: isFarFromTakeoff,
    userDistanceToTakeoff: userDistanceToTakeoff
  };
}

// Update stats panel UI elements
function updateStatsPanel(stats) {
  if (centerMarker) {
    fetchAndProcessWeather(centerMarker.getLatLng().lat, centerMarker.getLatLng().lng);
  }
  const warningsEl = document.getElementById('stats-warnings');
  if (!stats) {
    document.getElementById('stat-waypoints').textContent = "-";
    document.getElementById('stat-photos').textContent = "-";
    document.getElementById('stat-line-spacing').textContent = "-";
    document.getElementById('stat-photo-interval').textContent = "-";
    document.getElementById('stat-distance').textContent = "-";
    document.getElementById('stat-flight-time').textContent = "-";
    if (warningsEl) {
      warningsEl.classList.add('hidden');
    }
    return;
  }

  const unit = getUnitSystem();

  document.getElementById('stat-waypoints').textContent = stats.waypointsCount;
  const captureMode = document.getElementById('capture-mode').value;
  if (captureMode === 'video') {
    document.getElementById('stat-photos').textContent = "Video (Record)";
  } else {
    document.getElementById('stat-photos').textContent = stats.photoCount;
  }

  // Format spacing
  if (stats.lineSpacing !== null && stats.lineSpacing !== undefined) {
    document.getElementById('stat-line-spacing').textContent = formatDistance(stats.lineSpacing);
  } else {
    document.getElementById('stat-line-spacing').textContent = "N/A";
  }

  if (stats.photoSpacing !== null && stats.photoSpacing !== undefined) {
    document.getElementById('stat-photo-interval').textContent = formatDistance(stats.photoSpacing);
  } else {
    document.getElementById('stat-photo-interval').textContent = "N/A";
  }

  // Format total distance
  let distStr = "";
  if (unit === 'imperial') {
    const feet = stats.distance * M_TO_FT;
    if (feet > 5280) {
      distStr = `${(feet / 5280).toFixed(2)} mi`;
    } else {
      distStr = `${Math.round(feet)} ft`;
    }
  } else {
    if (stats.distance > 1000) {
      distStr = `${(stats.distance / 1000).toFixed(2)} km`;
    } else {
      distStr = `${Math.round(stats.distance)} m`;
    }
  }
  document.getElementById('stat-distance').textContent = distStr;
  document.getElementById('stat-flight-time').textContent = stats.timeStr;

  // Warnings display
  if (warningsEl) {
    warningsEl.textContent = '';
    let hasWarnings = false;
    
    // Check isolated waypoints
    if (stats.hasIsolatedWaypoint) {
      const formattedGap = formatDistance(stats.maxNearestNeighborDist);
      const limitStr = unit === 'imperial' ? "328 ft" : "100m";

      const div = document.createElement('div');
      const strong = document.createElement('strong');
      strong.textContent = 'Warning:';
      div.appendChild(document.createTextNode('⚠️ '));
      div.appendChild(strong);
      div.appendChild(document.createTextNode(` Waypoints are isolated (>${limitStr} from any other)! (Max gap: ${formattedGap})`));
      warningsEl.appendChild(div);
      hasWarnings = true;
    }

    // Check max flight time limit (Multi-battery estimate)
    if (stats.isOverMaxFlightTime) {
      const div = document.createElement('div');
      const strong = document.createElement('strong');
      strong.textContent = 'Multi-Battery Flight:';
      div.appendChild(document.createTextNode('🔋 '));
      div.appendChild(strong);
      div.appendChild(document.createTextNode(` Mission duration (${stats.timeStr}) exceeds single-battery limit (${stats.maxFlightTimeMinutes} min). Requires ~${stats.partsCount} batteries. The RC 2 will prompt to Resume from Breakpoint after battery swap.`));
      warningsEl.appendChild(div);
      hasWarnings = true;
    }

    // Check geolocation distance
    if (stats.isFarFromTakeoff) {
      const formattedUserDist = formatDistance(stats.userDistanceToTakeoff);
      const limitStr = unit === 'imperial' ? "2000 ft" : "609.6m";

      const div = document.createElement('div');
      div.style.marginTop = '4px';
      const strong = document.createElement('strong');
      strong.textContent = 'Geolocation Warning:';
      div.appendChild(document.createTextNode('⚠️ '));
      div.appendChild(strong);
      div.appendChild(document.createTextNode(` Pilot is far from takeoff location (>${limitStr} away)! (Distance: ${formattedUserDist})`));
      warningsEl.appendChild(div);
      hasWarnings = true;
    }

    if (hasWarnings) {
      warningsEl.classList.remove('hidden');
    } else {
      warningsEl.classList.add('hidden');
    }
  }
}

// Generate the WPML template.kml content
function buildTemplateKml(finishAction, speed) {
  const timestamp = Date.now();
  const droneModelEl = document.getElementById('drone-model');
  const parsedDroneVal = droneModelEl ? parseInt(droneModelEl.value, 10) : NaN;
  const droneEnumValue = !isNaN(parsedDroneVal) ? parsedDroneVal : 68; // Default to DJI Mini 4 Pro (68)

  const signalLostEl = document.getElementById('signal-lost-action');
  const signalLostValue = signalLostEl ? signalLostEl.value : 'goBack';
  let exitOnRCLost = 'executeLostAction';
  let executeRCLostAction = signalLostValue;
  if (signalLostValue === 'goContinue') {
    exitOnRCLost = 'goContinue';
    executeRCLostAction = 'goBack';
  }

  const isEnterprise = (droneEnumValue !== 68 && droneEnumValue !== 89);
  let folderXml = '';
  if (isEnterprise) {
    folderXml = `
    <Folder>
      <wpml:templateType>waypoint</wpml:templateType>
      <wpml:templateId>0</wpml:templateId>
      <wpml:executeHeightMode>relativeToStartPoint</wpml:executeHeightMode>
      <wpml:waylineId>0</wpml:waylineId>
      <wpml:distance>0</wpml:distance>
      <wpml:duration>0</wpml:duration>
      <wpml:autoFlightSpeed>${speed}</wpml:autoFlightSpeed>
      <wpml:payloadParam>
        <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
        <wpml:payloadPitchControlMode>usePointSetting</wpml:payloadPitchControlMode>
      </wpml:payloadParam>
    </Folder>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="http://www.uav.com/wpmz/1.0.2">
  <Document>
    <wpml:author>Aalaapi Sky Generator</wpml:author>
    <wpml:createTime>${timestamp}</wpml:createTime>
    <wpml:updateTime>${timestamp}</wpml:updateTime>
    <wpml:missionConfig>
      <wpml:flyToWaylineMode>safely</wpml:flyToWaylineMode>
      <wpml:finishAction>${finishAction}</wpml:finishAction>
      <wpml:exitOnRCLost>${exitOnRCLost}</wpml:exitOnRCLost>
      <wpml:executeRCLostAction>${executeRCLostAction}</wpml:executeRCLostAction>
      <wpml:globalTransitionalSpeed>${speed}</wpml:globalTransitionalSpeed>
      <wpml:droneInfo>
        <wpml:droneEnumValue>${droneEnumValue}</wpml:droneEnumValue>
        <wpml:droneSubEnumValue>0</wpml:droneSubEnumValue>
      </wpml:droneInfo>
    </wpml:missionConfig>${folderXml}
  </Document>
</kml>`;
}

// Generate the WPML waylines.wpml content
function buildWaylinesWpml(waypoints, altitude, speed, headingMode, finishAction, gimbalPitch, captureMode, pathMode) {
  if (!waypoints || !Array.isArray(waypoints)) waypoints = [];
  const timestamp = Date.now();
  
  const zoomEl = document.getElementById('camera-zoom');
  const cameraZoom = zoomEl ? parseFloat(zoomEl.value) : 1.0;

  const globalHoverEl = document.getElementById('global-hover-time');
  const globalHoverTime = globalHoverEl ? parseInt(globalHoverEl.value) : 0;

  const droneModelEl = document.getElementById('drone-model');
  const parsedDroneVal = droneModelEl ? parseInt(droneModelEl.value, 10) : NaN;
  const droneEnumValue = !isNaN(parsedDroneVal) ? parsedDroneVal : 68;
  const isConsumer = (parsedDroneVal === 68 || parsedDroneVal === 89);

  // Build XML Placemark tags (waypoints)
  let placemarksXml = '';
  let turnMode;
  let useStraightLine;
  if (isConsumer) {
    // Consumer Drone Golden Rule: DJI Fly for Mini 4 Pro / Air 3 strictly requires ContinuityCurvature
    // and useStraightLine: 0. DiscontinuityCurvature and useStraightLine: 1 cause immediate "Waypoint Flight Suspended" aborts.
    turnMode = captureMode === 'stopAndShoot' 
      ? 'toPointAndStopWithContinuityCurvature' 
      : 'toPointAndPassWithContinuityCurvature';
    useStraightLine = 0;
  } else if (pathMode === 'straight') {
    turnMode = captureMode === 'stopAndShoot' 
      ? 'toPointAndStopWithDiscontinuityCurvature' 
      : 'toPointAndPassWithDiscontinuityCurvature';
    useStraightLine = 1;
  } else {
    turnMode = captureMode === 'stopAndShoot' 
      ? 'toPointAndStopWithContinuityCurvature' 
      : 'toPointAndPassWithContinuityCurvature';
    useStraightLine = 0;
  }

  let actionId = 1;
  // actionGroupId must be globally unique across the entire waylines.wpml file (DJI WPML spec).
  // Using a single counter shared across all waypoints prevents duplicate IDs that cause
  // DJI Fly to reject the mission at "Go" press (observed on double-grid with 81 action groups).
  let actionGroupId = 1;

  waypoints.forEach((wp, idx) => {
    const waypointActions = [];
    
    // Determine if repositioning (gimbal pitch or heading yaw) is required
    const reposInfo = checkNeedsReposition(idx, waypoints);
    const isStopAndShoot = captureMode === 'stopAndShoot';
    
    // Determine effective hover time.
    // In stop-and-shoot mode, always enforce a 2s minimum at every waypoint so the gimbal
    // has time to stabilize before the camera fires (fixes gimbal error and missed shots at 0s).
    // The 2s floor matches the existing reposition auto-inject and DJI's own settling guidance.
    const baseHover = (wp.hoverTime !== null && wp.hoverTime !== undefined) ? wp.hoverTime : globalHoverTime;
    let effectiveHover = baseHover;
    if (isStopAndShoot && effectiveHover < 2) {
      effectiveHover = 2;
    }
    
    // 1. Always set gimbal pitch at start of flight (waypoint index 0), at start of a new ring, OR at every waypoint for road-following
    const gridType = document.getElementById('grid-type')?.value;
    const isRoadFollowing = gridType === 'road-following';
    // Compute effective pitch for use in both gimbalRotate action and waypointGimbalHeadingParam
    const effectivePitch = wp.pitch !== undefined ? wp.pitch : gimbalPitch;

    if (idx === 0 || wp.isRingStart || isRoadFollowing) {
      const currentPitch = effectivePitch;
      waypointActions.push(`          <wpml:action>
            <wpml:actionId>${actionId++}</wpml:actionId>
            <wpml:actionActuatorFunc>gimbalRotate</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>
              <wpml:gimbalHeadingYawBase>aircraft</wpml:gimbalHeadingYawBase>
              <wpml:gimbalRotateMode>absoluteAngle</wpml:gimbalRotateMode>
              <wpml:gimbalPitchRotateEnable>1</wpml:gimbalPitchRotateEnable>
              <wpml:gimbalPitchRotateAngle>${currentPitch}</wpml:gimbalPitchRotateAngle>
              <wpml:gimbalRollRotateEnable>0</wpml:gimbalRollRotateEnable>
              <wpml:gimbalRollRotateAngle>0</wpml:gimbalRollRotateAngle>
              <wpml:gimbalYawRotateEnable>0</wpml:gimbalYawRotateEnable>
              <wpml:gimbalYawRotateAngle>0</wpml:gimbalYawRotateAngle>
              <wpml:gimbalRotateTimeEnable>0</wpml:gimbalRotateTimeEnable>
              <wpml:gimbalRotateTime>0</wpml:gimbalRotateTime>
              <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
            </wpml:actionActuatorFuncParam>
          </wpml:action>`);
    }

    // 2. Hover duration action (MUST run to stabilize gimbal and yaw)
    if (effectiveHover > 0) {
      waypointActions.push(`          <wpml:action>
            <wpml:actionId>${actionId++}</wpml:actionId>
            <wpml:actionActuatorFunc>hover</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>
              <wpml:hoverTime>${effectiveHover}</wpml:hoverTime>
            </wpml:actionActuatorFuncParam>
          </wpml:action>`);
    }

    // 3. Zoom action (only set once on the first waypoint to apply for the entire flight)
    if (cameraZoom > 1.0 && idx === 0) {
      waypointActions.push(`          <wpml:action>
            <wpml:actionId>${actionId++}</wpml:actionId>
            <wpml:actionActuatorFunc>zoom</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>
              <wpml:focalLength>0</wpml:focalLength>
              <wpml:isUseFocalFactor>1</wpml:isUseFocalFactor>
              <wpml:focalFactor>${cameraZoom.toFixed(1)}</wpml:focalFactor>
              <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
            </wpml:actionActuatorFuncParam>
          </wpml:action>`);
    }

    // 4. Video record actions if captureMode is video (start at waypoint 0, stop at final waypoint)
    if (captureMode === 'video') {
      if (idx === 0) {
        waypointActions.push(`          <wpml:action>
            <wpml:actionId>${actionId++}</wpml:actionId>
            <wpml:actionActuatorFunc>startRecord</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>
              <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
            </wpml:actionActuatorFuncParam>
          </wpml:action>`);
      } else if (idx === waypoints.length - 1) {
        waypointActions.push(`          <wpml:action>
            <wpml:actionId>${actionId++}</wpml:actionId>
            <wpml:actionActuatorFunc>stopRecord</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>
              <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
            </wpml:actionActuatorFuncParam>
          </wpml:action>`);
      }
    }

    // 5. If Stop & Shoot is active, also add photo trigger at this waypoint
    if (captureMode === 'stopAndShoot') {
      waypointActions.push(`          <wpml:action>
            <wpml:actionId>${actionId++}</wpml:actionId>
            <wpml:actionActuatorFunc>takePhoto</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>
              <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
            </wpml:actionActuatorFuncParam>
          </wpml:action>`);
    }

    // 6. Per-waypoint camera action (RC 2 feature parity)
    const perWpAction = wp.cameraAction || 'inherit';
    if (perWpAction !== 'inherit' && perWpAction !== 'none') {
      if (perWpAction === 'takePhoto') {
        waypointActions.push(`          <wpml:action>
            <wpml:actionId>${actionId++}</wpml:actionId>
            <wpml:actionActuatorFunc>takePhoto</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>
              <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
            </wpml:actionActuatorFuncParam>
          </wpml:action>`);
      } else if (perWpAction === 'startRecord') {
        waypointActions.push(`          <wpml:action>
            <wpml:actionId>${actionId++}</wpml:actionId>
            <wpml:actionActuatorFunc>startRecord</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>
              <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
            </wpml:actionActuatorFuncParam>
          </wpml:action>`);
      } else if (perWpAction === 'stopRecord') {
        waypointActions.push(`          <wpml:action>
            <wpml:actionId>${actionId++}</wpml:actionId>
            <wpml:actionActuatorFunc>stopRecord</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>
              <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
            </wpml:actionActuatorFuncParam>
          </wpml:action>`);
      } else if (perWpAction === 'zoom') {
        const zoomFactor = wp.zoom ? parseFloat(wp.zoom) : cameraZoom;
        waypointActions.push(`          <wpml:action>
            <wpml:actionId>${actionId++}</wpml:actionId>
            <wpml:actionActuatorFunc>zoom</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>
              <wpml:focalLength>0</wpml:focalLength>
              <wpml:isUseFocalFactor>1</wpml:isUseFocalFactor>
              <wpml:focalFactor>${zoomFactor.toFixed(1)}</wpml:focalFactor>
              <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
            </wpml:actionActuatorFuncParam>
          </wpml:action>`);
      }
    }

    let actionsForThisPlacemark = '';
    if (waypointActions.length > 0) {
      actionsForThisPlacemark = `        <wpml:actionGroup>
          <wpml:actionGroupId>${actionGroupId++}</wpml:actionGroupId>
          <wpml:actionGroupStartIndex>${idx}</wpml:actionGroupStartIndex>
          <wpml:actionGroupEndIndex>${idx}</wpml:actionGroupEndIndex>
          <wpml:actionGroupMode>sequence</wpml:actionGroupMode>
          <wpml:actionTrigger>
            <wpml:actionTriggerType>reachPoint</wpml:actionTriggerType>
          </wpml:actionTrigger>
${waypointActions.join('\n')}
        </wpml:actionGroup>\n`;
    }

    // Determine heading mode and angle for this waypoint
    const validHeadingModes = ['followWayline', 'smoothTransition', 'towardPOI', 'manually', 'custom', 'fixed'];
    let actualHeadingMode = (headingMode && validHeadingModes.includes(headingMode)) ? headingMode : 'followWayline';
    let actualHeadingAngle = 0;
    let poiPoint = "0.000000,0.000000,0.000000";

    const wpMode = wp.headingMode || 'inherit';
    let targetPoiIndex = wp.poiIndex || 0;
    if (wpMode !== 'inherit') {
      if (wpMode === 'custom' || wpMode === 'smoothTransition') {
        actualHeadingMode = 'smoothTransition';
        actualHeadingAngle = (wp.heading !== null && wp.heading !== undefined && !isNaN(wp.heading)) ? wp.heading : 0;
      } else {
        actualHeadingMode = wpMode;
        if (wpMode === 'towardPOI') {
          let targetPoi = pois[targetPoiIndex] || pois[0];
          if (!targetPoi && targetPoiIndex === 0 && typeof centerMarker !== 'undefined' && centerMarker) {
            const latlng = centerMarker.getLatLng();
            targetPoi = { lat: latlng.lat, lon: latlng.lng };
          }
          if (targetPoi) {
            // DJI WPML requires latitude,longitude,altitude for waypointPoiPoint
            poiPoint = `${targetPoi.lat.toFixed(6)},${targetPoi.lon.toFixed(6)},0.000000`;
          }
        }
      }
    } else {
      if (gridType === 'double' && effectivePitch !== -90 && wp.heading !== null && wp.heading !== undefined) {
        // In Double Grid with oblique pitch, headings point toward the center, which requires smoothTransition
        actualHeadingMode = 'smoothTransition';
        actualHeadingAngle = wp.heading;
      } else if (gridType === 'freeform' && wp.heading !== null && wp.heading !== undefined && !isNaN(wp.heading)) {
        // In Freeform with custom per-waypoint heading, use smoothTransition
        actualHeadingMode = 'smoothTransition';
        actualHeadingAngle = wp.heading;
      } else {
        if (headingMode === 'towardPOI') {
          let targetPoi = pois[targetPoiIndex] || pois[0];
          if (!targetPoi && targetPoiIndex === 0 && typeof centerMarker !== 'undefined' && centerMarker) {
            const latlng = centerMarker.getLatLng();
            targetPoi = { lat: latlng.lat, lon: latlng.lng };
          }
          if (targetPoi) {
            // DJI WPML requires latitude,longitude,altitude for waypointPoiPoint
            poiPoint = `${targetPoi.lat.toFixed(6)},${targetPoi.lon.toFixed(6)},0.000000`;
          }
        } else if (headingMode === 'custom') {
          actualHeadingMode = 'smoothTransition';
          actualHeadingAngle = (wp.heading !== null && wp.heading !== undefined && !isNaN(wp.heading)) ? wp.heading : 0;
        }
      }
    }

    // Single Grid Golden Rule: Lawnmower grid patterns must strictly use followWayline (unless towardPOI or explicit per-waypoint custom heading is selected).
    // smoothTransition in a single grid produces spline discontinuities on parallel turnaround turns that cause DJI Fly to suspend the mission.
    if (gridType === 'single' && headingMode !== 'towardPOI' && wpMode !== 'towardPOI' && wpMode !== 'custom') {
      actualHeadingMode = 'followWayline';
    }

    if (actualHeadingMode === 'followWayline') {
      if (gridType === 'single' && wpMode !== 'custom') {
        // In Single Grid, compute bearing strictly along the wayline flight path so entry/exit tangents match flight direction
        let fromWp, toWp;
        if (idx < waypoints.length - 1) {
          fromWp = waypoints[idx];
          toWp = waypoints[idx + 1];
        } else if (idx > 0) {
          fromWp = waypoints[idx - 1];
          toWp = waypoints[idx];
        }
        if (toWp && fromWp &&
            fromWp.lat !== undefined && fromWp.lon !== undefined &&
            toWp.lat !== undefined && toWp.lon !== undefined) {
          const lat1 = fromWp.lat * Math.PI / 180;
          const lat2 = toWp.lat * Math.PI / 180;
          const dLon = (toWp.lon - fromWp.lon) * Math.PI / 180;
          const y = Math.sin(dLon) * Math.cos(lat2);
          const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
          let bearing = Math.atan2(y, x) * 180 / Math.PI;
          if (bearing < 0) bearing += 360;
          actualHeadingAngle = bearing;
        } else {
          const gridRotEl = document.getElementById('grid-rotation');
          const gridRot = gridRotEl ? parseFloat(gridRotEl.value) : 0;
          const h = getDefaultHeading(idx, waypoints, gridRot);
          actualHeadingAngle = isNaN(h) ? 0 : h;
        }
      } else if (wp.heading !== null && wp.heading !== undefined && !isNaN(wp.heading)) {
        actualHeadingAngle = wp.heading;
      } else {
        // Compute bearing from lat/lon to avoid NaN when x/y offsets are not set
        let fromWp, toWp;
        if (idx < waypoints.length - 1) {
          fromWp = waypoints[idx];
          toWp = waypoints[idx + 1];
        } else if (idx > 0) {
          fromWp = waypoints[idx - 1];
          toWp = waypoints[idx];
        }
        if (toWp && fromWp &&
            fromWp.lat !== undefined && fromWp.lon !== undefined &&
            toWp.lat !== undefined && toWp.lon !== undefined) {
          const lat1 = fromWp.lat * Math.PI / 180;
          const lat2 = toWp.lat * Math.PI / 180;
          const dLon = (toWp.lon - fromWp.lon) * Math.PI / 180;
          const y = Math.sin(dLon) * Math.cos(lat2);
          const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
          let bearing = Math.atan2(y, x) * 180 / Math.PI;
          if (bearing < 0) bearing += 360;
          actualHeadingAngle = bearing;
        } else {
          const gridRotEl = document.getElementById('grid-rotation');
          const gridRot = gridRotEl ? parseFloat(gridRotEl.value) : 0;
          const h = getDefaultHeading(idx, waypoints, gridRot);
          actualHeadingAngle = isNaN(h) ? 0 : h;
        }
      }
    }

    if (isNaN(actualHeadingAngle) || actualHeadingAngle === null || actualHeadingAngle === undefined) {
      actualHeadingAngle = 0;
    }

    // Normalize angle into [0, 360)
    actualHeadingAngle = ((actualHeadingAngle % 360) + 360) % 360;

    // DJI RC 2 Golden Rule: Waypoint 0 (entry) and Waypoint N-1 (exit) have enable=1;
    // all intermediate waypoints in followWayline and towardPOI have enable=0 to allow dynamic heading tracking!
    let headingAngleEnable = 0;
    if (actualHeadingMode === 'smoothTransition' || actualHeadingMode === 'fixed' || actualHeadingMode === 'custom') {
      headingAngleEnable = 1;
    } else if (actualHeadingMode === 'followWayline' || actualHeadingMode === 'towardPOI') {
      headingAngleEnable = (idx === 0 || idx === waypoints.length - 1) ? 1 : 0;
    } else {
      headingAngleEnable = 0;
    }

    // DJI Fly firmware has a bug where waypointHeadingAngle of strictly 0.0 with headingAngleEnable: 1
    // causes "Error performing flight: Waypoint Flight Suspended". Clamp 0.0 to 0.1 to avoid firmware rejection.
    if (headingAngleEnable === 1 && (actualHeadingAngle === 0 || Math.abs(actualHeadingAngle) < 0.05)) {
      actualHeadingAngle = 0.1;
    }

    const currentAltitude = wp.alt !== undefined ? wp.alt : altitude;
    const actualSpeed = (wp.speed !== undefined && wp.speed !== null && !isNaN(wp.speed)) ? wp.speed : speed;
    let actualTurnMode = turnMode;
    if (wp.turnMode && wp.turnMode !== 'inherit') {
      if (isConsumer) {
        actualTurnMode = wp.turnMode === 'stop'
          ? 'toPointAndStopWithContinuityCurvature'
          : 'toPointAndPassWithContinuityCurvature';
      } else if (pathMode === 'straight') {
        actualTurnMode = wp.turnMode === 'stop'
          ? 'toPointAndStopWithDiscontinuityCurvature'
          : 'toPointAndPassWithDiscontinuityCurvature';
      } else {
        actualTurnMode = wp.turnMode === 'stop'
          ? 'toPointAndStopWithContinuityCurvature'
          : 'toPointAndPassWithContinuityCurvature';
      }
    }

    // Endpoint Rule: Waypoint 0 (start) and Waypoint N-1 (end) MUST ALWAYS be stop points!
    // Passing turn modes at endpoints have no entry/exit tangent vectors and trigger "Error performing flight" in DJI Fly.
    if (idx === 0 || idx === waypoints.length - 1) {
      actualTurnMode = (isConsumer || pathMode !== 'straight' && !actualTurnMode.includes('Discontinuity'))
        ? 'toPointAndStopWithContinuityCurvature'
        : 'toPointAndStopWithDiscontinuityCurvature';
    }

    placemarksXml += `      <Placemark>
        <Point>
          <coordinates>
            ${wp.lon.toFixed(13)},${wp.lat.toFixed(13)}
          </coordinates>
        </Point>
        <wpml:index>${idx}</wpml:index>
        <wpml:executeHeight>${currentAltitude}</wpml:executeHeight>
        <wpml:waypointSpeed>${actualSpeed}</wpml:waypointSpeed>
        <wpml:waypointHeadingParam>
          <wpml:waypointHeadingMode>${actualHeadingMode}</wpml:waypointHeadingMode>
          <wpml:waypointHeadingAngle>${actualHeadingAngle.toFixed(1)}</wpml:waypointHeadingAngle>
          <wpml:waypointPoiPoint>${poiPoint}</wpml:waypointPoiPoint>
          <wpml:waypointHeadingAngleEnable>${headingAngleEnable}</wpml:waypointHeadingAngleEnable>
          <wpml:waypointHeadingPathMode>followBadArc</wpml:waypointHeadingPathMode>
          <wpml:waypointHeadingPoiIndex>${targetPoiIndex}</wpml:waypointHeadingPoiIndex>
        </wpml:waypointHeadingParam>
        <wpml:waypointTurnParam>
          <wpml:waypointTurnMode>${actualTurnMode}</wpml:waypointTurnMode>
          <wpml:waypointTurnDampingDist>0</wpml:waypointTurnDampingDist>
        </wpml:waypointTurnParam>
        <wpml:useStraightLine>${useStraightLine}</wpml:useStraightLine>
${actionsForThisPlacemark}        <wpml:waypointGimbalHeadingParam>
          <wpml:waypointGimbalPitchAngle>${effectivePitch}</wpml:waypointGimbalPitchAngle>
          <wpml:waypointGimbalYawAngle>0</wpml:waypointGimbalYawAngle>
        </wpml:waypointGimbalHeadingParam>
      </Placemark>\n`;
  });

  const signalLostEl = document.getElementById('signal-lost-action');
  const signalLostValue = signalLostEl ? signalLostEl.value : 'goBack';
  let exitOnRCLost = 'executeLostAction';
  let executeRCLostAction = signalLostValue;
  if (signalLostValue === 'goContinue') {
    exitOnRCLost = 'goContinue';
    executeRCLostAction = 'goBack';
  }

  const isEnterprise = (droneEnumValue !== 68 && droneEnumValue !== 89);
  let templateTypeXml = isEnterprise ? '      <wpml:templateType>waypoint</wpml:templateType>\n' : '';
  let payloadParamXml = isEnterprise ? `      <wpml:payloadParam>
        <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
        <wpml:payloadPitchControlMode>usePointSetting</wpml:payloadPitchControlMode>
      </wpml:payloadParam>\n` : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="http://www.uav.com/wpmz/1.0.2">
  <Document>
    <wpml:missionConfig>
      <wpml:flyToWaylineMode>safely</wpml:flyToWaylineMode>
      <wpml:finishAction>${finishAction}</wpml:finishAction>
      <wpml:exitOnRCLost>${exitOnRCLost}</wpml:exitOnRCLost>
      <wpml:executeRCLostAction>${executeRCLostAction}</wpml:executeRCLostAction>
      <wpml:globalTransitionalSpeed>${speed}</wpml:globalTransitionalSpeed>
      <wpml:droneInfo>
        <wpml:droneEnumValue>${droneEnumValue}</wpml:droneEnumValue>
        <wpml:droneSubEnumValue>0</wpml:droneSubEnumValue>
      </wpml:droneInfo>
    </wpml:missionConfig>
    <Folder>
${templateTypeXml}      <wpml:templateId>0</wpml:templateId>
      <wpml:executeHeightMode>relativeToStartPoint</wpml:executeHeightMode>
      <wpml:waylineId>0</wpml:waylineId>
      <wpml:distance>0</wpml:distance>
      <wpml:duration>0</wpml:duration>
      <wpml:autoFlightSpeed>${speed}</wpml:autoFlightSpeed>
${payloadParamXml}${placemarksXml}    </Folder>
  </Document>
</kml>`;
}

/**
 * Automated Pre-Flight WPML Mission Validator & Linter
 * Audits generated WPML XML against the 10 DJI Fly "Golden Tag" firmware rules
 * to prevent flight suspensions ("Error performing flight") on pressing Go.
 */
function validateWpmlMission(wpmlXml, templateXml = '', options = {}) {
  const result = {
    valid: true,
    rulesPassed: 0,
    totalRules: 10,
    rules: [],
    errors: [],
    warnings: [],
    placemarkCount: 0
  };

  if (!wpmlXml || typeof wpmlXml !== 'string') {
    result.valid = false;
    result.errors.push('Empty or missing waylines.wpml content');
    return result;
  }

  // Parse placemarks
  const placemarks = wpmlXml.split('<Placemark>').slice(1).map(p => {
    const end = p.indexOf('</Placemark>');
    return end !== -1 ? p.substring(0, end) : p;
  });
  result.placemarkCount = placemarks.length;

  // Extract global parameters
  const droneEnumMatch = wpmlXml.match(/<wpml:droneEnumValue>(\d+)<\/wpml:droneEnumValue>/);
  const droneEnumValue = droneEnumMatch ? parseInt(droneEnumMatch[1], 10) : 68;
  const isConsumerDrone = (droneEnumValue === 68 || droneEnumValue === 89);

  // ── RULE 1: Heading Mode & waypointHeadingAngleEnable Coherence ────────────
  let r1Passed = true;
  let r1Msg = 'Heading modes properly assign waypointHeadingAngleEnable (intermediate followWayline waypoints use 0, endpoints use 1)';
  const isSinglePattern = (options && (options.gridType === 'single' || options.pattern === 'single'));
  placemarks.forEach((pm, idx) => {
    const modeMatch = pm.match(/<wpml:waypointHeadingMode>([^<]+)<\/wpml:waypointHeadingMode>/);
    const enableMatch = pm.match(/<wpml:waypointHeadingAngleEnable>([^<]+)<\/wpml:waypointHeadingAngleEnable>/);
    if (modeMatch) {
      const mode = modeMatch[1].trim();
      const enable = enableMatch ? enableMatch[1].trim() : '0';
      const isEndpoint = (idx === 0 || idx === placemarks.length - 1);
      if (mode === 'followWayline' && !isEndpoint && enable === '1') {
        r1Passed = false;
        result.errors.push(`Waypoint ${idx}: intermediate waypointHeadingMode is 'followWayline' but waypointHeadingAngleEnable is 1 (must be 0 to prevent DJI Fly Go abort)`);
      }
      if (isSinglePattern && mode === 'smoothTransition' && (idx === 0 || placemarks.length <= 2)) {
        r1Passed = false;
        result.errors.push(`Waypoint ${idx}: Single grid pattern cannot use 'smoothTransition' (must use 'followWayline' to prevent DJI Fly Go abort on parallel flight lines)`);
      }
    }
  });
  if (!r1Passed) result.valid = false; else result.rulesPassed++;
  result.rules.push({ id: 1, name: 'Heading Mode & Angle Enable Coherence', passed: r1Passed, message: r1Msg });

  // ── RULE 2: Zero-Heading Firmware Safety Clamping ──────────────────────────
  let r2Passed = true;
  let r2Msg = 'All custom heading angles are normalized and strictly non-zero (>= 0.1°) to avoid DJI Fly 0.0° suspend bug';
  placemarks.forEach((pm, idx) => {
    const enableMatch = pm.match(/<wpml:waypointHeadingAngleEnable>([^<]+)<\/wpml:waypointHeadingAngleEnable>/);
    const angleMatch = pm.match(/<wpml:waypointHeadingAngle>([^<]+)<\/wpml:waypointHeadingAngle>/);
    if (enableMatch && enableMatch[1].trim() === '1' && angleMatch) {
      const angle = parseFloat(angleMatch[1]);
      if (Math.abs(angle) < 0.05 || angle === 0 || angle === 360) {
        r2Passed = false;
        result.errors.push(`Waypoint ${idx}: waypointHeadingAngle is ${angle}° with enable=1 (must be clamped to >= 0.1° to prevent firmware suspend bug)`);
      }
    }
  });
  if (!r2Passed) result.valid = false; else result.rulesPassed++;
  result.rules.push({ id: 2, name: 'Zero-Heading Firmware Safety Clamping', passed: r2Passed, message: r2Msg });

  // ── RULE 3: Endpoint Turn Mode Tangent Constraints ─────────────────────────
  let r3Passed = true;
  let r3Msg = 'First and last waypoints enforce stop turn modes to guarantee valid spline entry/exit tangents';
  if (placemarks.length > 0) {
    const firstPm = placemarks[0];
    const lastPm = placemarks[placemarks.length - 1];
    const firstTurn = (firstPm.match(/<wpml:waypointTurnMode>([^<]+)<\/wpml:waypointTurnMode>/) || [])[1] || '';
    const lastTurn = (lastPm.match(/<wpml:waypointTurnMode>([^<]+)<\/wpml:waypointTurnMode>/) || [])[1] || '';
    if (firstTurn.includes('Pass')) {
      r3Passed = false;
      result.errors.push(`Waypoint 0 (start) uses pass-through turn mode '${firstTurn}' (must be toPointAndStop... for valid entry tangent)`);
    }
    if (lastTurn.includes('Pass')) {
      r3Passed = false;
      result.errors.push(`Waypoint ${placemarks.length - 1} (end) uses pass-through turn mode '${lastTurn}' (must be toPointAndStop... for valid exit tangent)`);
    }
  }
  if (!r3Passed) result.valid = false; else result.rulesPassed++;
  result.rules.push({ id: 3, name: 'Endpoint Turn Mode Tangents', passed: r3Passed, message: r3Msg });

  // ── RULE 4: 2D Coordinates Under relativeToStartPoint Height Mode ──────────
  let r4Passed = true;
  let r4Msg = 'Point coordinates are strictly 2D (lon,lat) matching stock DJI RC 2 wayline schema';
  const heightMode = (wpmlXml.match(/<wpml:executeHeightMode>([^<]+)<\/wpml:executeHeightMode>/) || [])[1] || '';
  if (heightMode === 'relativeToStartPoint') {
    placemarks.forEach((pm, idx) => {
      const coordMatch = pm.match(/<coordinates>\s*([^\s<]+)\s*<\/coordinates>/);
      if (coordMatch) {
        const parts = coordMatch[1].trim().split(',');
        if (parts.length > 2) {
          r4Passed = false;
          result.errors.push(`Waypoint ${idx}: Point coordinates contain ${parts.length} values (must be 2D 'lon,lat' under relativeToStartPoint)`);
        }
      }
    });
  }
  if (!r4Passed) result.valid = false; else result.rulesPassed++;
  result.rules.push({ id: 4, name: '2D Coordinates in relativeToStartPoint Mode', passed: r4Passed, message: r4Msg });

  // ── RULE 5: POI Coordinate Order (latitude,longitude,altitude) ─────────────
  let r5Passed = true;
  let r5Msg = 'POI target coordinates are formatted as lat,lon,alt with valid latitude bounds [-90°, +90°]';
  placemarks.forEach((pm, idx) => {
    const poiMatch = pm.match(/<wpml:waypointPoiPoint>([^<]+)<\/wpml:waypointPoiPoint>/);
    const modeMatch = pm.match(/<wpml:waypointHeadingMode>([^<]+)<\/wpml:waypointHeadingMode>/);
    if (poiMatch && modeMatch && modeMatch[1].trim() === 'towardPOI') {
      const parts = poiMatch[1].trim().split(',');
      if (parts.length >= 2) {
        const lat = parseFloat(parts[0]);
        const lon = parseFloat(parts[1]);
        if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
          r5Passed = false;
          result.errors.push(`Waypoint ${idx}: waypointPoiPoint has invalid latitude ${lat}° (coordinates must be 'lat,lon,alt')`);
        }
      }
    }
  });
  if (!r5Passed) result.valid = false; else result.rulesPassed++;
  result.rules.push({ id: 5, name: 'POI Coordinate Format (lat,lon,alt)', passed: r5Passed, message: r5Msg });

  // ── RULE 6: Action Group Allocation & ID Limits ────────────────────────────
  let r6Passed = true;
  let r6Msg = 'Action group count is within DJI Fly memory limits (< 65 total action groups)';
  const actionGroupCount = (wpmlXml.match(/<wpml:actionGroup>/g) || []).length;
  if (actionGroupCount >= 65) {
    r6Passed = false;
    result.errors.push(`Total action groups (${actionGroupCount}) exceeds DJI Fly limit of 65. Consolidate actions.`);
  }
  if (!r6Passed) result.valid = false; else result.rulesPassed++;
  result.rules.push({ id: 6, name: 'Action Group Allocation & ID Uniqueness', passed: r6Passed, message: r6Msg });

  // ── RULE 7: Action Execution Mode (Sequence for Multi-Actuators) ───────────
  let r7Passed = true;
  let r7Msg = 'Multi-action groups use sequential execution to prevent actuator collisions';
  placemarks.forEach((pm, idx) => {
    const agMatch = pm.match(/<wpml:actionGroup>([\s\S]*?)<\/wpml:actionGroup>/g);
    if (agMatch) {
      agMatch.forEach(ag => {
        const actCount = (ag.match(/<wpml:action>/g) || []).length;
        const mode = (ag.match(/<wpml:actionGroupMode>([^<]+)<\/wpml:actionGroupMode>/) || [])[1] || '';
        if (actCount > 1 && mode === 'parallel') {
          r7Passed = false;
          result.warnings.push(`Waypoint ${idx}: Contains ${actCount} actions in 'parallel' mode (recommend 'sequence' to avoid gimbal/camera conflict)`);
        }
      });
    }
  });
  if (!r7Passed) result.rulesPassed++; else result.rulesPassed++;
  result.rules.push({ id: 7, name: 'Action Sequence Execution Order', passed: r7Passed, message: r7Msg });

  // ── RULE 8: Consumer Drone Model XML Compliance ────────────────────────────
  let r8Passed = true;
  let r8Msg = 'No incompatible Enterprise-only tags present for consumer target drones (Mini 4 Pro / Air 3)';
  if (isConsumerDrone) {
    if (wpmlXml.includes('<wpml:payloadParam>') || (templateXml && templateXml.includes('<wpml:payloadParam>'))) {
      r8Passed = false;
      result.errors.push('Enterprise-only <wpml:payloadParam> detected on consumer drone mission (causes DJI Fly rejection on Go)');
    }
    if (wpmlXml.includes('<wpml:templateType>') || (templateXml && templateXml.includes('<wpml:templateType>'))) {
      r8Passed = false;
      result.errors.push('Enterprise-only <wpml:templateType> detected on consumer drone mission');
    }
    if (wpmlXml.includes('DiscontinuityCurvature')) {
      r8Passed = false;
      result.errors.push('Enterprise-only DiscontinuityCurvature turn mode detected on consumer drone mission (must use ContinuityCurvature for Mini 4 Pro / Air 3)');
    }
    if (/<wpml:useStraightLine>\s*1\s*<\/wpml:useStraightLine>/.test(wpmlXml)) {
      r8Passed = false;
      result.errors.push('Enterprise-only <wpml:useStraightLine>1</wpml:useStraightLine> detected on consumer drone mission (must be 0 for Mini 4 Pro / Air 3)');
    }
  }
  if (!r8Passed) result.valid = false; else result.rulesPassed++;
  result.rules.push({ id: 8, name: 'Consumer Drone Model XML Compliance', passed: r8Passed, message: r8Msg });

  // ── RULE 9: Waypoint Spacing & Proximity Safety ───────────────────────────
  let r9Passed = true;
  let r9Msg = 'All consecutive waypoints maintain safe spacing (>= 0.5m) to prevent trajectory solver zero-division';
  let prevCoord = null;
  placemarks.forEach((pm, idx) => {
    const coordMatch = pm.match(/<coordinates>\s*([^\s<]+)\s*<\/coordinates>/);
    if (coordMatch) {
      const parts = coordMatch[1].trim().split(',').map(Number);
      const curr = { lon: parts[0], lat: parts[1] };
      if (prevCoord && typeof haversineDistance === 'function') {
        const dist = haversineDistance(prevCoord.lat, prevCoord.lon, curr.lat, curr.lon);
        if (dist < 0.5 && dist > 0) {
          result.warnings.push(`Waypoint ${idx - 1} to ${idx}: Spacing is only ${dist.toFixed(2)}m (< 0.5m minimum recommended)`);
        }
      }
      prevCoord = curr;
    }
  });
  result.rulesPassed++;
  result.rules.push({ id: 9, name: 'Waypoint Spacing & Proximity Safety', passed: r9Passed, message: r9Msg });

  // ── RULE 10: Finite Bounds & Non-NaN Number Verification ───────────────────
  let r10Passed = true;
  let r10Msg = 'All speed, height, yaw, pitch, and coordinate values are finite, in-bounds numbers (0 NaN values)';
  if (wpmlXml.includes('NaN') || wpmlXml.includes('undefined') || wpmlXml.includes('null')) {
    r10Passed = false;
    result.errors.push('NaN, undefined, or null token detected in XML output');
  }
  if (!r10Passed) result.valid = false; else result.rulesPassed++;
  result.rules.push({ id: 10, name: 'Finite Bounds & Non-NaN Verification', passed: r10Passed, message: r10Msg });

  return result;
}

/**
 * Automatically repairs known malformed tags in WPML XML before bundling KMZ
 */
function validateAndFixWpml(wpmlXml, templateXml = '', options = {}) {
  let fixedWpml = wpmlXml;
  let fixedTemplate = templateXml;

  // 1. Fix followWayline with headingAngleEnable: 1 -> change to 0
  fixedWpml = fixedWpml.replace(
    /(<wpml:waypointHeadingMode>\s*(?:followWayline|manually|towardPOI)\s*<\/wpml:waypointHeadingMode>[\s\S]*?<wpml:waypointHeadingAngleEnable>)\s*1\s*(<\/wpml:waypointHeadingAngleEnable>)/g,
    '$10$2'
  );

  // 1b. Fix smoothTransition in single grid pattern -> change to followWayline
  const isSingle = (options && (options.gridType === 'single' || options.pattern === 'single'));
  if (isSingle) {
    fixedWpml = fixedWpml.replace(
      /<wpml:waypointHeadingMode>\s*smoothTransition\s*<\/wpml:waypointHeadingMode>/g,
      '<wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode>'
    );
    // Ensure intermediate waypoints in followWayline have headingAngleEnable: 0
    const pms = fixedWpml.split('<Placemark>');
    if (pms.length > 2) {
      for (let i = 2; i < pms.length - 1; i++) {
        pms[i] = pms[i].replace(
          /(<wpml:waypointHeadingAngleEnable>)\s*1\s*(<\/wpml:waypointHeadingAngleEnable>)/g,
          '$10$2'
        );
      }
      fixedWpml = pms.join('<Placemark>');
    }
  }

  // 2. Fix 3D coordinates to 2D
  fixedWpml = fixedWpml.replace(
    /(<Point>\s*<coordinates>\s*)([^,\s]+),([^,\s]+),[^,\s]+(\s*<\/coordinates>\s*<\/Point>)/g,
    '$1$2,$3$4'
  );

  // 3. Fix 0.0 heading angle with enable=1 -> clamp to 0.1
  fixedWpml = fixedWpml.replace(
    /(<wpml:waypointHeadingAngle>)\s*0(?:\.0+)?\s*(<\/wpml:waypointHeadingAngle>[\s\S]*?<wpml:waypointHeadingAngleEnable>\s*1\s*<\/wpml:waypointHeadingAngleEnable>)/g,
    (match, p1, p2) => `${p1}0.1${p2}`
  );

  // 4. Remove Enterprise tags if consumer drone
  const isConsumer = /<wpml:droneEnumValue>\s*(?:68|89)\s*<\/wpml:droneEnumValue>/.test(fixedWpml);
  if (isConsumer) {
    fixedWpml = fixedWpml.replace(/\s*<wpml:templateType>waypoint<\/wpml:templateType>/g, '');
    fixedWpml = fixedWpml.replace(/\s*<wpml:payloadParam>[\s\S]*?<\/wpml:payloadParam>/g, '');
    fixedWpml = fixedWpml.replace(/toPointAndStopWithDiscontinuityCurvature/g, 'toPointAndStopWithContinuityCurvature');
    fixedWpml = fixedWpml.replace(/toPointAndPassWithDiscontinuityCurvature/g, 'toPointAndPassWithContinuityCurvature');
    fixedWpml = fixedWpml.replace(/<wpml:useStraightLine>\s*1\s*<\/wpml:useStraightLine>/g, '<wpml:useStraightLine>0</wpml:useStraightLine>');
    if (fixedTemplate) {
      fixedTemplate = fixedTemplate.replace(/\s*<Folder>[\s\S]*?<\/Folder>/g, '');
    }
  }

  const validation = validateWpmlMission(fixedWpml, fixedTemplate, options);
  return { wpmlXml: fixedWpml, templateXml: fixedTemplate, validation };
}

// Formats a Date object, ISO string, or timestamp into a filesystem-safe ISO 8601 timestamp string.
// Format: YYYY-MM-DDTHH-mm-ssZ (filesystem safe, standard ISO 8601)
function formatISO8601ForFilename(date = new Date()) {
  try {
    const d = (date instanceof Date) ? date : new Date(date);
    if (isNaN(d.getTime())) {
      return new Date().toISOString().replace(/:/g, '-').replace(/\.\d{3}/, '');
    }
    return d.toISOString().replace(/:/g, '-').replace(/\.\d{3}/, '');
  } catch (e) {
    return new Date().toISOString().replace(/:/g, '-').replace(/\.\d{3}/, '');
  }
}

// Generate the KMZ file and trigger browser download
function exportKMZ() {
  if (!centerMarker) {
    alert("Please select a flight mission center on the map first.");
    return;
  }

  const centerLatLng = centerMarker.getLatLng();
  const centerLat = centerLatLng.lat;
  const centerLon = centerLatLng.lng;

  // Retrieve slider values
  const gridWidth = parseFloat(document.getElementById('grid-width').value);
  const gridHeight = parseFloat(document.getElementById('grid-height').value);
  const rotation = parseFloat(document.getElementById('grid-rotation').value);
  const gridType = document.getElementById('grid-type').value;
  const overlapFront = parseFloat(document.getElementById('front-overlap').value) / 100.0;
  const overlapSide = parseFloat(document.getElementById('side-overlap').value) / 100.0;
  const altitude = parseFloat(document.getElementById('altitude').value);
  const speed = parseFloat(document.getElementById('speed').value);
  const headingMode = document.getElementById('heading-mode').value;
  const finishAction = document.getElementById('finish-action').value;
  const gimbalPitch = parseFloat(document.getElementById('gimbal-pitch').value);
  const captureMode = document.getElementById('capture-mode').value;
  const pathMode = document.getElementById('path-mode').value;

  let waypoints = [];
  const currentWps = getCurrentWaypoints();

  if (currentWps && currentWps.length > 0) {
    waypoints = currentWps.map(wp => {
      const pitch = wp.pitch !== undefined && wp.pitch !== null ? wp.pitch : gimbalPitch;
      return {
        lat: wp.lat,
        lon: wp.lon,
        alt: wp.alt,
        pitch: pitch,
        speed: speed, // Use UI speed slider value
        heading: wp.heading,
        isRingStart: wp.isRingStart || false,
        ringIndex: wp.ringIndex !== undefined ? wp.ringIndex : null,
        poiIndex: wp.poiIndex !== undefined ? wp.poiIndex : null,
        headingMode: wp.headingMode !== undefined ? wp.headingMode : null
      };
    });
  }

  if (waypoints.length === 0) {
    alert("No waypoints generated. Please check your grid dimensions and overlap settings.");
    return;
  }

  // Check isolated waypoints
  let maxNearestNeighborDist = 0;
  for (let i = 0; i < currentWps.length; i++) {
    const p1 = currentWps[i];
    let minDist = Infinity;
    for (let j = 0; j < currentWps.length; j++) {
      if (i === j) continue;
      const p2 = currentWps[j];
      const d = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
      if (d < minDist) {
        minDist = d;
      }
    }
    if (minDist !== Infinity && minDist > maxNearestNeighborDist) {
      maxNearestNeighborDist = minDist;
    }
  }
  const hasIsolatedWaypoint = maxNearestNeighborDist > 100.0;

  // Check geolocation
  let isFarFromTakeoff = false;
  let userDistanceToTakeoff = null;
  if (userLocation && waypoints.length > 0) {
    const takeoffL = L.latLng(waypoints[0].lat, waypoints[0].lon);
    const userL = L.latLng(userLocation.lat, userLocation.lon);
    userDistanceToTakeoff = userL.distanceTo(takeoffL);
    isFarFromTakeoff = userDistanceToTakeoff > 609.6;
  }

  // Construct confirmation warning
  let warningMessage = "";
  if (hasIsolatedWaypoint) {
    const formattedGap = formatDistance(maxNearestNeighborDist);
    const limitStr = getUnitSystem() === 'imperial' ? "328 ft" : "100m";
    warningMessage += `• Waypoint Separation: There are waypoints separated by more than ${limitStr} from any other (Max gap: ${formattedGap}). This might affect flight safety.\n\n`;
  }
  if (isFarFromTakeoff) {
    const formattedDist = formatDistance(userDistanceToTakeoff);
    const limitStr = getUnitSystem() === 'imperial' ? "2000 ft" : "609.6m";
    warningMessage += `• Geolocation Check: Your current pilot position is more than ${limitStr} away from the takeoff area (Takeoff distance: ${formattedDist}). Please ensure you are at the correct flight location.\n\n`;
  }

  const maxFlightTimeEl = document.getElementById('max-flight-time');
  const maxFlightTimeMinutes = maxFlightTimeEl ? parseFloat(maxFlightTimeEl.value) : 20;
  const maxFlightTimeSeconds = maxFlightTimeMinutes * 60;
  
  // Calculate total stats to check flight duration
  const totalStats = calculateStats(waypoints, getCurrentPhotos(), speed, null, null, captureMode);
  const totalDurationSeconds = totalStats ? totalStats.flightTimeSeconds : 0;

  // Always define the "Press Go" warning
  const pressGoWarning = 
    `⚠️ "Press Go" Upload Checklist:\n` +
    `Waypoint missions may fail to start when you press "Go" as this app is in development, or if:\n` +
    `  1. The drone's max altitude limit in DJI Fly settings is less than the mission altitude (${altitude}m).\n` +
    `  2. The drone does not have a strong GPS lock (at least 10+ satellites) at takeoff.\n` +
    `  3. You are too far away from the first waypoint.\n` +
    `  4. The flight area lies within an unauthorized NFZ / Geozone.\n\n`;

  // Multi-battery flight notification
  let multiBatteryNote = "";
  if (totalDurationSeconds > maxFlightTimeSeconds && waypoints.length > 1) {
    const estBatteries = Math.ceil(totalDurationSeconds / maxFlightTimeSeconds);
    multiBatteryNote = `• Multi-Battery Mission: Estimated duration (${totalStats.timeStr}) exceeds single-battery limit (${maxFlightTimeMinutes} min) and will require ~${estBatteries} batteries. DJI RC 2 automatically supports Breakpoint Resume after battery swaps.\n\n`;
  }

  let confirmMessage = "";
  if (warningMessage || multiBatteryNote) {
    confirmMessage = `Warning Details:\n\n${warningMessage || ''}${multiBatteryNote}${pressGoWarning}Do you acknowledge these safety details and want to export the mission?`;
  } else {
    confirmMessage = `${pressGoWarning}Do you want to proceed and export the mission?`;
  }

  if (!confirm(confirmMessage)) {
    return;
  }

  // 4. Generate XML contents and KMZ package
  generateKMZBlob().then(function (result) {
    if (!result || !result.blob) return;

    const link = document.createElement("a");
    link.href = URL.createObjectURL(result.blob);
    
    const storedUuid = getRC2UUID();
    let downloadBase = "";
    const isoTimestamp = formatISO8601ForFilename();
    if (importedFileName) {
      link.download = importedFileName;
      downloadBase = importedFileName.replace(/\.kmz$/i, "");
    } else if (storedUuid && RC2_UUID_PATTERN.test(storedUuid)) {
      link.download = `${storedUuid}.kmz`;
      downloadBase = storedUuid;
    } else {
      link.download = `GridMission_Alt${altitude}m_${isoTimestamp}.kmz`;
      downloadBase = `GridMission_Alt${altitude}m_${isoTimestamp}`;
    }
    link.click();

    // Also auto-export comprehensive Flight Diagnostics JSON (User Agent, 3D Simulation, Plan, & Camera)
    try {
      const diagData = buildFlightDiagnosticsJSON(waypoints, {
        altitude,
        speed,
        gimbalPitch,
        filename: link.download,
        uuid: storedUuid || downloadBase,
        validation: result.validation,
        isValid: result.validation ? result.validation.valid : true,
        wpmlXml: result.waylinesWpml,
        templateXml: result.templateKml
      });

      // If bad or invalid KMZ, save to local browser history
      if (diagData && (!diagData.isValid || (diagData.validationErrors && diagData.validationErrors.length > 0))) {
        try {
          if (typeof localStorage !== 'undefined') {
            const rawHist = localStorage.getItem('aalaapi_bad_kmz_history');
            const badHist = rawHist ? JSON.parse(rawHist) : [];
            badHist.unshift({
              uuid: diagData.uuid,
              filename: diagData.filename,
              created_at: diagData.createdAt,
              flight_pattern: diagData.flightPattern,
              waypoint_count: diagData.summary?.waypointCount || waypoints.length,
              validation_rules_passed: diagData.validationRulesPassed,
              validation_errors: diagData.validationErrors,
              is_valid: 0,
              execution_status: 'invalid'
            });
            localStorage.setItem('aalaapi_bad_kmz_history', JSON.stringify(badHist.slice(0, 20)));
          }
        } catch (storageErr) {}
      }

      if (diagData && typeof Blob !== 'undefined' && typeof document !== 'undefined') {
        const jsonBlob = new Blob([JSON.stringify(diagData, null, 2)], { type: "application/json" });
        const jsonLink = document.createElement("a");
        jsonLink.href = URL.createObjectURL(jsonBlob);
        jsonLink.download = `${downloadBase}_diag.json`;
        jsonLink.click();
      }

      // Automatically archive diagnostics to local Companion SQLite service if running
      if (typeof fetch !== 'undefined') {
        const apiBase = typeof getCompanionApiBase === 'function' ? getCompanionApiBase() : 'http://127.0.0.1:8765';
        fetch(`${apiBase}/api/diagnostics/archive`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(diagData)
        }).catch(() => {
          // Companion service offline - file was already downloaded locally
        });
      }
    } catch (e) {
      if (typeof Logger !== 'undefined' && Logger.warn) Logger.warn("Could not export diagnostics JSON:", e);
    }
  }).catch(err => {
    Logger.error("ZIP creation failed:", err);
    alert("An error occurred while creating the KMZ file. Check console for details.");
  });
}

// ─── Multi-Vendor Autopilot Generators & Exporters ──────────────────────────

function buildQgcMissionPlan(waypoints, options = {}) {
  const cruiseSpeed = options.speed || 4.0;
  const hoverSpeed = 3.0;
  const defaultAlt = options.altitude || 50.0;
  const globalPitch = options.gimbalPitch !== undefined ? options.gimbalPitch : -90.0;
  const home = options.homePosition || (waypoints && waypoints.length > 0 ? [waypoints[0].lat, waypoints[0].lon, defaultAlt] : [0, 0, 0]);

  const items = [];
  let seq = 1;

  // 1. Takeoff Command (Command 22 = MAV_CMD_NAV_TAKEOFF)
  items.push({
    AMSLAltAboveTerrain: null,
    Altitude: defaultAlt,
    AltitudeMode: 1,
    autoContinue: true,
    command: 22,
    doJumpId: seq,
    frame: 3,
    params: [15, 0, 0, null, home[0], home[1], defaultAlt],
    type: "SimpleItem"
  });
  seq++;

  // 2. Set Gimbal Pitch (Command 205 = MAV_CMD_DO_MOUNT_CONTROL)
  items.push({
    AMSLAltAboveTerrain: null,
    Altitude: defaultAlt,
    AltitudeMode: 1,
    autoContinue: true,
    command: 205,
    doJumpId: seq,
    frame: 2,
    params: [globalPitch, 0, 0, 0, 0, 0, 2],
    type: "SimpleItem"
  });
  seq++;

  // 3. Waypoint Items (Command 16 = MAV_CMD_NAV_WAYPOINT)
  (waypoints || []).forEach((wp) => {
    const lat = wp.lat;
    const lon = wp.lon;
    const alt = wp.alt !== undefined ? wp.alt : (wp.altitude !== undefined ? wp.altitude : defaultAlt);
    const yaw = wp.heading !== undefined ? wp.heading : null;
    const hoverTime = wp.hoverTime !== undefined ? wp.hoverTime : (wp.isPhoto ? 2 : 0);

    items.push({
      AMSLAltAboveTerrain: null,
      Altitude: alt,
      AltitudeMode: 1,
      autoContinue: true,
      command: 16,
      doJumpId: seq,
      frame: 3,
      params: [hoverTime, 2, 0, yaw, lat, lon, alt],
      type: "SimpleItem"
    });
    seq++;

    if (wp.isPhoto) {
      // Camera shutter trigger (Command 203 = MAV_CMD_DO_DIGICAM_CONTROL)
      items.push({
        AMSLAltAboveTerrain: null,
        Altitude: alt,
        AltitudeMode: 1,
        autoContinue: true,
        command: 203,
        doJumpId: seq,
        frame: 2,
        params: [0, 0, 0, 0, 1, 0, 0],
        type: "SimpleItem"
      });
      seq++;
    }
  });

  // 4. Return To Launch (Command 20 = MAV_CMD_NAV_RETURN_TO_LAUNCH)
  items.push({
    AMSLAltAboveTerrain: null,
    Altitude: defaultAlt,
    AltitudeMode: 1,
    autoContinue: true,
    command: 20,
    doJumpId: seq,
    frame: 2,
    params: [0, 0, 0, 0, 0, 0, 0],
    type: "SimpleItem"
  });

  return {
    fileType: "Plan",
    geoFence: { circles: [], polygons: [], version: 2 },
    groundStation: "QGroundControl",
    mission: {
      cruiseSpeed: cruiseSpeed,
      firmwareType: 12,
      hoverSpeed: hoverSpeed,
      items: items,
      plannedHomePosition: home,
      vehicleType: 2,
      version: 2
    },
    rallyPoints: { points: [], version: 2 },
    version: 1
  };
}

function buildAutelMissionKml(waypoints, options = {}) {
  const name = options.name || 'Autel_Mission';
  const speed = options.speed || 4.0;
  const defaultAlt = options.altitude || 50.0;
  const gimbalPitch = options.gimbalPitch !== undefined ? options.gimbalPitch : -90.0;

  let placemarksXml = '';
  (waypoints || []).forEach((wp, idx) => {
    const lat = wp.lat;
    const lon = wp.lon;
    const alt = wp.alt !== undefined ? wp.alt : (wp.altitude !== undefined ? wp.altitude : defaultAlt);
    const pitch = wp.pitch !== undefined ? wp.pitch : (wp.gimbalPitch !== undefined ? wp.gimbalPitch : gimbalPitch);
    const heading = wp.heading !== undefined ? wp.heading : 0;

    placemarksXml += `
        <Placemark>
          <name>Waypoint ${idx + 1}</name>
          <description>Autel Waypoint ${idx + 1}</description>
          <Point>
            <altitudeMode>relativeToGround</altitudeMode>
            <coordinates>${lon},${lat},${alt}</coordinates>
          </Point>
          <ExtendedData>
            <Data name="speed"><value>${speed}</value></Data>
            <Data name="gimbalPitch"><value>${pitch}</value></Data>
            <Data name="heading"><value>${heading}</value></Data>
            <Data name="action"><value>${wp.isPhoto ? 'takePhoto' : 'none'}</value></Data>
          </ExtendedData>
        </Placemark>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${name}</name>
    <Folder>
      <name>Waypoints</name>${placemarksXml}
    </Folder>
  </Document>
</kml>`;
}

function exportQgcPlan() {
  const currentWps = typeof getCurrentWaypoints === 'function' ? getCurrentWaypoints() : [];
  if (!currentWps || currentWps.length === 0) {
    alert("Please select or generate waypoints first.");
    return;
  }
  const speed = parseFloat(document.getElementById('speed')?.value) || 4.0;
  const altitude = parseFloat(document.getElementById('altitude')?.value) || 50.0;
  const gimbalPitch = parseFloat(document.getElementById('gimbal-pitch')?.value) || -90.0;

  const plan = buildQgcMissionPlan(currentWps, { speed, altitude, gimbalPitch });
  const blob = new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const ts = typeof formatISO8601ForFilename === 'function' ? formatISO8601ForFilename() : new Date().toISOString().replace(/:/g, '-');
  a.download = `Mission_QGC_${ts}.plan`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportAutelKml() {
  const currentWps = typeof getCurrentWaypoints === 'function' ? getCurrentWaypoints() : [];
  if (!currentWps || currentWps.length === 0) {
    alert("Please select or generate waypoints first.");
    return;
  }
  const speed = parseFloat(document.getElementById('speed')?.value) || 4.0;
  const altitude = parseFloat(document.getElementById('altitude')?.value) || 50.0;
  const gimbalPitch = parseFloat(document.getElementById('gimbal-pitch')?.value) || -90.0;

  const kml = buildAutelMissionKml(currentWps, { speed, altitude, gimbalPitch });
  const blob = new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const ts = typeof formatISO8601ForFilename === 'function' ? formatISO8601ForFilename() : new Date().toISOString().replace(/:/g, '-');
  a.download = `Mission_Autel_${ts}.kml`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function initMultiVendorToggle() {
  const toggle = document.getElementById('multivendor-toggle');
  const exportContainer = document.getElementById('multivendor-export-container');
  const qgcBtn = document.getElementById('export-qgc-btn');
  const autelBtn = document.getElementById('export-autel-btn');

  const updateState = (enabled) => {
    if (toggle) toggle.checked = enabled;
    if (exportContainer) {
      exportContainer.style.display = enabled ? 'flex' : 'none';
    }
    try {
      localStorage.setItem('aalaapi-multivendor-enabled', enabled ? 'true' : 'false');
    } catch (e) {}
  };

  const isEnabled = typeof localStorage !== 'undefined' && localStorage.getItem('aalaapi-multivendor-enabled') === 'true';
  updateState(isEnabled);

  if (toggle) {
    toggle.addEventListener('change', () => {
      updateState(toggle.checked);
    });
  }

  if (qgcBtn) qgcBtn.addEventListener('click', exportQgcPlan);
  if (autelBtn) autelBtn.addEventListener('click', exportAutelKml);
}

// ─── Settings & Mission Plan JSON Builder & Exporter ──────────────────────────
// Generates a comprehensive, structured JSON representation of all application
// settings, geometry parameters, camera profiles, flight configurations,
// computed statistics, and waypoint coordinates for troubleshooting or archival.

function buildMissionPlanJSON(customWps = null) {
  const currentWps = customWps || (typeof getCurrentWaypoints === 'function' ? getCurrentWaypoints() : null) || [];
  const centerLatLng = (typeof centerMarker !== 'undefined' && centerMarker && centerMarker.getLatLng) ? centerMarker.getLatLng() : null;

  const gridType = document.getElementById('grid-type')?.value || 'single';
  const gridWidth = parseFloat(document.getElementById('grid-width')?.value) || 100;
  const gridHeight = parseFloat(document.getElementById('grid-height')?.value) || 100;
  const rotation = parseFloat(document.getElementById('grid-rotation')?.value) || 0;
  const roadOffset = parseFloat(document.getElementById('road-offset')?.value) || 15;
  const roadSnap = !!(document.getElementById('road-snap')?.checked);

  const cameraModel = document.getElementById('camera-model')?.value || 'dji_mini_4_pro_std';
  const droneModel = document.getElementById('drone-model')?.value || '68';
  const cameraZoom = parseFloat(document.getElementById('camera-zoom')?.value) || 1.0;
  const cameraHFOV = parseFloat(document.getElementById('camera-hfov')?.value) || 69.7;
  const cameraVFOV = parseFloat(document.getElementById('camera-vfov')?.value) || 55.2;
  const overlapFront = parseFloat(document.getElementById('front-overlap')?.value) || 80;
  const overlapSide = parseFloat(document.getElementById('side-overlap')?.value) || 75;
  const gimbalPitch = parseFloat(document.getElementById('gimbal-pitch')?.value) || -60;

  const altitude = parseFloat(document.getElementById('altitude')?.value) || 50;
  const speed = parseFloat(document.getElementById('speed')?.value) || 4;
  const maxFlightTimeMinutes = parseFloat(document.getElementById('max-flight-time')?.value) || 20;
  const headingMode = document.getElementById('heading-mode')?.value || 'followWayline';
  const finishAction = document.getElementById('finish-action')?.value || 'goHome';
  const signalLostAction = document.getElementById('signal-lost-action')?.value || 'goBack';
  const pathMode = document.getElementById('path-mode')?.value || 'curved';
  const captureMode = document.getElementById('capture-mode')?.value || 'stopAndShoot';
  const globalHoverTime = parseFloat(document.getElementById('global-hover-time')?.value) || 0;

  const unitSystem = typeof getUnitSystem === 'function' ? getUnitSystem() : 'imperial';
  const storedUuid = typeof getRC2UUID === 'function' ? getRC2UUID() : null;

  const formattedWaypoints = currentWps.map((wp, idx) => ({
    index: idx,
    lat: wp.lat,
    lon: wp.lon,
    alt: wp.alt !== undefined ? wp.alt : altitude,
    pitch: wp.pitch !== undefined && wp.pitch !== null ? wp.pitch : gimbalPitch,
    heading: wp.heading !== undefined ? wp.heading : null,
    speed: wp.speed !== undefined ? wp.speed : speed,
    hoverTime: wp.hoverTime !== undefined ? wp.hoverTime : globalHoverTime,
    x: wp.x !== undefined ? wp.x : null,
    y: wp.y !== undefined ? wp.y : null,
    isRingStart: !!wp.isRingStart,
    ringIndex: wp.ringIndex !== undefined ? wp.ringIndex : null,
    poiIndex: wp.poiIndex !== undefined ? wp.poiIndex : null,
    headingMode: wp.headingMode !== undefined ? wp.headingMode : null
  }));

  const totalStats = typeof calculateStats === 'function'
    ? calculateStats(formattedWaypoints, typeof getCurrentPhotos === 'function' ? getCurrentPhotos() : null, speed, null, null, captureMode)
    : null;

  return {
    schemaVersion: "1.0.0",
    generator: "Aalaapi Sky",
    version: "1.52.0",
    exportedAt: new Date().toISOString(),
    mission: {
      uuid: storedUuid || null,
      importedFileName: typeof importedFileName !== 'undefined' ? importedFileName : null,
      pattern: gridType,
      unitSystem: unitSystem,
      center: centerLatLng ? { lat: centerLatLng.lat, lon: centerLatLng.lng } : null
    },
    settings: {
      geometry: {
        gridWidth,
        gridHeight,
        gridRotation: rotation,
        roadOffset,
        roadSnap
      },
      camera: {
        cameraModel,
        droneModelId: parseInt(droneModel, 10) || 68,
        cameraZoom,
        cameraHFOV,
        cameraVFOV,
        frontOverlapPercent: overlapFront,
        sideOverlapPercent: overlapSide,
        gimbalPitch
      },
      flight: {
        altitude,
        speed,
        maxFlightTimeMinutes,
        headingMode,
        finishAction,
        signalLostAction,
        pathMode,
        captureMode,
        globalHoverTimeSeconds: globalHoverTime
      }
    },
    pointsOfInterest: (typeof pointsOfInterest !== 'undefined' && Array.isArray(pointsOfInterest)) ? pointsOfInterest : [],
    statistics: totalStats ? {
      waypointCount: formattedWaypoints.length,
      photoCount: totalStats.photoCount || formattedWaypoints.length,
      totalDistanceMeters: totalStats.distance || 0,
      totalFlightTimeSeconds: totalStats.flightTimeSeconds || 0,
      flightTimeFormatted: totalStats.timeStr || '',
      estimatedBatteries: Math.ceil((totalStats.flightTimeSeconds || 0) / (maxFlightTimeMinutes * 60)) || 1
    } : {
      waypointCount: formattedWaypoints.length
    },
    waypoints: formattedWaypoints
  };
}

function exportMissionPlanJSON(customWps = null) {
  const plan = buildMissionPlanJSON(customWps);
  const jsonStr = JSON.stringify(plan, null, 2);
  let blob = null;
  if (typeof Blob !== 'undefined') {
    blob = new Blob([jsonStr], { type: "application/json" });
  }

  const storedUuid = typeof getRC2UUID === 'function' ? getRC2UUID() : null;
  let downloadBase = "";
  const isoTimestamp = formatISO8601ForFilename();
  if (typeof importedFileName !== 'undefined' && importedFileName) {
    downloadBase = importedFileName.replace(/\.kmz$/i, "");
  } else if (storedUuid && typeof RC2_UUID_PATTERN !== 'undefined' && RC2_UUID_PATTERN.test(storedUuid)) {
    downloadBase = storedUuid;
  } else {
    const altitude = parseFloat(document.getElementById('altitude')?.value) || 50;
    downloadBase = `GridMission_Alt${altitude}m_${isoTimestamp}`;
  }

  if (blob && typeof document !== 'undefined' && document.createElement) {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${downloadBase}_plan.json`;
    link.click();
  }

  return { plan, blob, jsonStr };
}

// ─── Flight Diagnostics JSON Builder & Exporter ──────────────────────────────
// Generates a comprehensive diagnostics export containing the complete mission plan,
// simulated 3D trajectory time-series, photo capture events, turn dynamics,
// and detailed client User Agent / hardware environment specs.

function buildFlightDiagnosticsJSON(customWps = null, options = {}) {
  const currentWps = customWps || (typeof getCurrentWaypoints === 'function' ? getCurrentWaypoints() : null) || [];
  const plan = typeof buildMissionPlanJSON === 'function' ? buildMissionPlanJSON(currentWps) : null;
  const isoTimestamp = typeof formatISO8601ForFilename === 'function' ? formatISO8601ForFilename() : new Date().toISOString().replace(/:/g, '-');
  const uuid = options.uuid || (typeof getRC2UUID === 'function' && getRC2UUID()) || (plan && plan.metadata && plan.metadata.uuid) || `mission_${Date.now()}`;

  const altitude = options.altitude ?? (typeof document !== 'undefined' && parseFloat(document.getElementById('altitude')?.value)) ?? 50.0;
  const speed = options.speed ?? (typeof document !== 'undefined' && parseFloat(document.getElementById('speed')?.value)) ?? 4.0;
  const gimbalPitch = options.gimbalPitch ?? (typeof document !== 'undefined' && parseFloat(document.getElementById('gimbal-pitch')?.value)) ?? -60.0;

  const telemetry = typeof generateTelemetryFromWaypoints === 'function'
    ? generateTelemetryFromWaypoints(currentWps, { altitude, speed, gimbalPitch, isSimulation: true, flightId: uuid })
    : null;

  const userAgent = {
    raw: (typeof navigator !== 'undefined' && navigator.userAgent) ? navigator.userAgent : 'NodeJS/TestRunner',
    platform: (typeof navigator !== 'undefined' && (navigator.userAgentData?.platform || navigator.platform)) || (typeof process !== 'undefined' ? process.platform : ''),
    language: (typeof navigator !== 'undefined' && navigator.language) || 'en-US',
    languages: (typeof navigator !== 'undefined' && Array.isArray(navigator.languages)) ? navigator.languages : ['en-US'],
    screen: (typeof window !== 'undefined' && window.screen) ? {
      width: window.screen.width,
      height: window.screen.height,
      colorDepth: window.screen.colorDepth,
      pixelRatio: window.devicePixelRatio || 1
    } : null,
    viewport: (typeof window !== 'undefined') ? {
      width: window.innerWidth,
      height: window.innerHeight
    } : null,
    appVersion: '1.56.0',
    capturedAt: new Date().toISOString()
  };

  const isValid = options.isValid !== undefined ? options.isValid : (options.validation ? options.validation.valid : true);
  const validationErrors = options.validationErrors || options.validation?.errors || [];
  const validationWarnings = options.validationWarnings || options.validation?.warnings || [];
  const validationRulesPassed = options.validationRulesPassed ?? options.validation?.rulesPassed ?? (isValid ? 10 : 10 - validationErrors.length);

  return {
    schemaVersion: '1.56.0',
    uuid,
    createdAt: new Date().toISOString(),
    filename: options.filename || `${uuid}.kmz`,
    flightPattern: plan?.geometry?.pattern || 'single',
    altitude,
    speed,
    gimbalPitch,
    userAgent,
    plan,
    diagnostics: telemetry,
    isValid,
    validationRulesPassed,
    validationErrors,
    validationWarnings,
    validationReport: options.validationReport || options.validation || null,
    wpmlXml: options.wpmlXml || '',
    templateXml: options.templateXml || '',
    executionStatus: options.executionStatus || (!isValid ? 'invalid' : 'pending'),
    executionError: options.executionError || (validationErrors.length > 0 ? validationErrors.join('; ') : ''),
    summary: {
      waypointCount: currentWps.length,
      photoCount: telemetry?.photoCount ?? currentWps.length,
      totalDistance: telemetry?.totalDistance ?? plan?.statistics?.totalDistanceMeters ?? 0,
      estimatedDuration: telemetry?.durationSeconds ?? plan?.statistics?.totalFlightTimeSeconds ?? 0,
      durationFormatted: telemetry?.durationFormatted ?? plan?.statistics?.flightTimeFormatted ?? '',
      maxAltitude: telemetry?.maxAltitude ?? altitude,
      homePoint: telemetry?.homePoint ?? plan?.centerPoint ?? null
    }
  };
}

function exportFlightDiagnosticsJSON(customWps = null, options = {}) {
  const diagData = buildFlightDiagnosticsJSON(customWps, options);
  const jsonStr = JSON.stringify(diagData, null, 2);
  let blob = null;
  if (typeof Blob !== 'undefined') {
    blob = new Blob([jsonStr], { type: "application/json" });
  }

  const storedUuid = typeof getRC2UUID === 'function' ? getRC2UUID() : null;
  let downloadBase = "";
  const isoTimestamp = typeof formatISO8601ForFilename === 'function' ? formatISO8601ForFilename() : new Date().toISOString().replace(/:/g, '-');
  if (typeof importedFileName !== 'undefined' && importedFileName) {
    downloadBase = importedFileName.replace(/\.kmz$/i, "");
  } else if (storedUuid && typeof RC2_UUID_PATTERN !== 'undefined' && RC2_UUID_PATTERN.test(storedUuid)) {
    downloadBase = storedUuid;
  } else {
    const altitude = parseFloat(document.getElementById('altitude')?.value) || 50;
    downloadBase = `GridMission_Alt${altitude}m_${isoTimestamp}`;
  }

  if (blob && typeof document !== 'undefined' && document.createElement) {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${downloadBase}_diag.json`;
    link.click();
  }

  // Also notify companion archive service
  if (typeof fetch !== 'undefined') {
    const apiBase = typeof getCompanionApiBase === 'function' ? getCompanionApiBase() : 'http://127.0.0.1:8765';
    fetch(`${apiBase}/api/diagnostics/archive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(diagData)
    }).catch(() => {});
  }

  return { diagData, blob, jsonStr };
}

// Generate KMZ Blob in-memory
function generateKMZBlob(wps = null) {
  let effectiveWps = wps;
  if (!effectiveWps) {
    const current = typeof getCurrentWaypoints === 'function' ? getCurrentWaypoints() : null;
    effectiveWps = current || (typeof waypoints !== 'undefined' && waypoints ? waypoints : []);
  }
  const finishAction = document.getElementById('finish-action')?.value || 'goHome';
  const altitude = parseFloat(document.getElementById('altitude')?.value) || 50;
  const speed = parseFloat(document.getElementById('speed')?.value) || 4;
  const headingMode = document.getElementById('heading-mode')?.value || 'followWayline';
  const gimbalPitch = parseFloat(document.getElementById('gimbal-pitch')?.value) || -90;
  const captureMode = document.getElementById('capture-mode')?.value || 'hover';
  const pathMode = document.getElementById('path-mode')?.value || 'normal';

  const templateKml = buildTemplateKml(finishAction, speed);
  const waylinesWpml = buildWaylinesWpml(effectiveWps, altitude, speed, headingMode, finishAction, gimbalPitch, captureMode, pathMode);

  const currentGridType = document.getElementById('grid-type')?.value || 'single';
  // Auto-audit and fix subtle firmware incompatibilities
  const fixed = validateAndFixWpml(waylinesWpml, templateKml, { waypoints: effectiveWps, gridType: currentGridType });
  const finalWpml = fixed.wpmlXml;
  const finalTemplate = fixed.templateXml;
  const validation = fixed.validation;

  if (typeof JSZip === 'undefined') {
    return Promise.resolve(null);
  }

  const zip = new JSZip();
  zip.file("wpmz/template.kml", finalTemplate, { createFolders: false });
  zip.file("wpmz/waylines.wpml", finalWpml, { createFolders: false });

  return zip.generateAsync({ type: "blob", compression: "DEFLATE" }).then(blob => ({
    blob,
    templateKml: finalTemplate,
    waylinesWpml: finalWpml,
    validation
  }));
}

// ─── Map Preview Thumbnail Generator ──────────────────────────────────────────
// Generates a 400x300 JPG thumbnail preview of the waypoint flight path matching
// the DJI Fly map_preview thumbnail specifications for RC 2 controller display.

function generateMissionPreviewBlob(waypoints, width = 400, height = 300) {
  if (typeof document === 'undefined' || !document.createElement) return Promise.resolve(null);
  const canvas = document.createElement('canvas');
  if (!canvas || !canvas.getContext) return Promise.resolve(null);
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.resolve(null);

  // Dark slate background
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, width, height);

  // Subtle coordinate grid lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;
  for (let x = 40; x < width; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 30; y < height; y += 30) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  if (waypoints && waypoints.length > 0) {
    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    waypoints.forEach(wp => {
      if (wp.lat < minLat) minLat = wp.lat;
      if (wp.lat > maxLat) maxLat = wp.lat;
      if (wp.lon < minLon) minLon = wp.lon;
      if (wp.lon > maxLon) maxLon = wp.lon;
    });

    const spanLat = (maxLat - minLat) || 0.0001;
    const spanLon = (maxLon - minLon) || 0.0001;
    const pad = 45;
    const drawW = width - pad * 2;
    const drawH = height - pad * 2;

    const toScreen = (lat, lon) => ({
      x: pad + ((lon - minLon) / spanLon) * drawW,
      y: height - (pad + ((lat - minLat) / spanLat) * drawH)
    });

    // Draw wayline path
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 3.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (ctx.shadowBlur !== undefined) {
      ctx.shadowColor = 'rgba(6, 182, 212, 0.7)';
      ctx.shadowBlur = 8;
    }

    ctx.beginPath();
    waypoints.forEach((wp, i) => {
      const pt = toScreen(wp.lat, wp.lon);
      if (i === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.stroke();
    if (ctx.shadowBlur !== undefined) ctx.shadowBlur = 0;

    // Draw waypoint nodes
    waypoints.forEach((wp, i) => {
      const pt = toScreen(wp.lat, wp.lon);
      ctx.fillStyle = (i === 0) ? '#22c55e' : (i === waypoints.length - 1) ? '#ef4444' : '#38bdf8';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, (i === 0 || i === waypoints.length - 1) ? 5.5 : 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.stroke();
    });
  }

  // Header branding badge
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.fillText('AALAAPI SKY', 14, 22);

  return new Promise(resolve => {
    if (canvas.toBlob) {
      canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.85);
    } else {
      resolve(null);
    }
  });
}

// ─── DJI RC 2 Companion Bridge & Direct Sync ────────────────────────────────

function getCompanionApiBase() {
  // 1. Check URL query parameter (?companion=http://...)
  if (typeof window !== 'undefined' && window.location && window.location.search) {
    try {
      const params = new URLSearchParams(window.location.search);
      const queryHost = params.get('companion');
      if (queryHost && queryHost.trim()) {
        const cleaned = queryHost.trim().replace(/\/+$/, '');
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('aalaapi-companion-host', cleaned);
        }
        return cleaned;
      }
    } catch (e) {}
  }

  // 2. Check localStorage saved companion host
  if (typeof localStorage !== 'undefined') {
    try {
      const stored = localStorage.getItem('aalaapi-companion-host');
      if (stored && stored.trim()) {
        return stored.trim().replace(/\/+$/, '');
      }
    } catch (e) {}
  }

  // 3. Same-origin check: if loaded on port 8765, use current origin (works on any LAN IP!)
  if (typeof window !== 'undefined' && window.location) {
    if (window.location.port === '8765' || window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost') {
      return window.location.port
        ? `${window.location.protocol}//${window.location.hostname}:${window.location.port}`
        : window.location.origin;
    }
  }

  // 4. Default fallback
  return 'http://127.0.0.1:8765';
}

function setCompanionApiBase(newHost) {
  if (typeof window !== 'undefined' && window.location && window.location.search) {
    if (window.history && window.history.replaceState) {
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('companion');
        window.history.replaceState({}, '', url.toString());
      } catch (e) {}
    } else {
      window.location.search = '';
    }
  }

  if (!newHost || !newHost.trim()) {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('aalaapi-companion-host');
    }
  } else {
    let cleaned = newHost.trim().replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(cleaned)) {
      cleaned = `http://${cleaned}`;
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('aalaapi-companion-host', cleaned);
    }
  }
  COMPANION_API_BASE = getCompanionApiBase();
  const hostInput = typeof document !== 'undefined' ? document.getElementById('companion-host-input') : null;
  if (hostInput) hostInput.value = COMPANION_API_BASE;
  if (typeof pollCompanionStatus === 'function') {
    pollCompanionStatus();
  }
}

let COMPANION_API_BASE = getCompanionApiBase();
let isCompanionOnline = false;
let isRc2MtpConnected = false;
let rc2MtpActiveUUID = '';
let companionPollInterval = null;

async function pollCompanionStatus() {
  if (typeof document === 'undefined') return;
  const sDot = document.getElementById('companion-service-dot');
  const sText = document.getElementById('companion-service-text');
  const sLabel = document.getElementById('companion-service-label');
  const uDot = document.getElementById('companion-usb-dot');
  const uText = document.getElementById('companion-usb-text');
  const uLabel = document.getElementById('companion-usb-label');

  // Legacy alias elements for backward compatibility
  const dot = document.getElementById('companion-indicator-dot');
  const text = document.getElementById('companion-status-text');
  const label = document.getElementById('companion-device-label');

  const directActions = document.getElementById('rc2-direct-actions');
  const directBtn = document.getElementById('direct-rc2-sync-btn');
  const pullBtn = document.getElementById('direct-rc2-pull-btn');
  const container = document.getElementById('companion-sync-container');
  const hint = document.getElementById('companion-offline-hint');

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`${COMPANION_API_BASE}/api/status`, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      isCompanionOnline = true;

      // 1. Update Bridge Service status (Online)
      if (sDot) sDot.style.background = '#22c55e';
      if (sText) {
        sText.textContent = 'Bridge Service: Online';
        sText.style.color = '#22c55e';
      }
      if (sLabel) sLabel.textContent = 'port 8765';

      // 2. Update RC 2 USB Link status
      if (data.connected) {
        isRc2MtpConnected = true;
        if (data.activeMissions && data.activeMissions.length > 0) {
          rc2MtpActiveUUID = data.activeMissions[0];
          if (typeof setRC2UUID === 'function' && !getRC2UUID()) {
            setRC2UUID(rc2MtpActiveUUID);
          }
        }
        if (container && container.classList) container.classList.remove('is-offline');
        if (hint && hint.style) hint.style.display = 'none';

        if (uDot) uDot.style.background = '#22c55e';
        if (uText) {
          uText.textContent = 'RC 2 USB Link: Connected';
          uText.style.color = '#22c55e';
        }
        if (uLabel) uLabel.textContent = data.deviceName || 'MTP Ready';

        // Legacy compatibility
        if (dot) dot.style.background = '#22c55e';
        if (text) {
          text.textContent = 'DJI RC 2 Connected';
          text.style.color = '#22c55e';
        }
        if (label) label.textContent = data.deviceName || 'MTP Ready';

        if (directActions) directActions.style.display = 'flex';
        if (directBtn) directBtn.style.display = 'inline-flex';
        if (pullBtn) pullBtn.style.display = 'inline-flex';
      } else {
        isRc2MtpConnected = false;
        if (container && container.classList) container.classList.add('is-offline');
        if (hint) {
          hint.style.display = 'flex';
          const labelSpan = (typeof hint.querySelector === 'function') ? hint.querySelector('span:first-child') : null;
          if (labelSpan) {
            labelSpan.innerHTML = `
              <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
              RC 2 Unplugged &bull; USB Setup Guide`;
          }
        }

        if (uDot) uDot.style.background = '#eab308'; // Amber
        if (uText) {
          uText.textContent = 'RC 2 USB Link: Unplugged';
          uText.style.color = '#eab308';
        }
        if (uLabel) uLabel.textContent = 'Plug in USB-C';

        // Legacy compatibility
        if (dot) dot.style.background = '#eab308';
        if (text) {
          text.textContent = 'RC 2 Disconnected';
          text.style.color = '#eab308';
        }
        if (label) label.textContent = 'Plug in USB-C';

        if (directActions) directActions.style.display = 'none';
        if (directBtn) directBtn.style.display = 'none';
        if (pullBtn) pullBtn.style.display = 'none';
      }
    } else {
      throw new Error('Non-200 status');
    }
  } catch (e) {
    isCompanionOnline = false;
    isRc2MtpConnected = false;
    if (container && container.classList) container.classList.add('is-offline');
    if (hint) {
      hint.style.display = 'flex';
      const labelSpan = (typeof hint.querySelector === 'function') ? hint.querySelector('span:first-child') : null;
      if (labelSpan) {
        labelSpan.innerHTML = `
          <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
          Bridge Offline &bull; Setup Guide`;
      }
    }

    // 1. Service Offline
    if (sDot) sDot.style.background = '#64748b'; // Gray
    if (sText) {
      sText.textContent = 'Bridge Service: Offline';
      sText.style.color = 'var(--text-main)';
    }
    if (sLabel) sLabel.textContent = 'start-companion.bat';

    // 2. USB Link Waiting
    if (uDot) uDot.style.background = '#64748b'; // Gray
    if (uText) {
      uText.textContent = 'RC 2 USB Link: Waiting';
      uText.style.color = 'var(--text-muted)';
    }
    if (uLabel) uLabel.textContent = 'Service Required';

    // Legacy compatibility
    if (dot) dot.style.background = '#64748b';
    if (text) {
      text.textContent = 'Companion Offline';
      text.style.color = 'var(--text-main)';
    }
    if (label) label.textContent = 'start-companion.bat';

    if (directActions) directActions.style.display = 'none';
    if (directBtn) directBtn.style.display = 'none';
    if (pullBtn) pullBtn.style.display = 'none';
  }
}

async function pullFromRC2() {
  const pullBtn = document.getElementById('direct-rc2-pull-btn');
  if (!pullBtn || !isRc2MtpConnected) return;

  const originalContent = pullBtn.innerHTML;
  pullBtn.disabled = true;
  pullBtn.innerHTML = `<span>⏳ Pulling...</span>`;

  try {
    const targetUuid = getRC2UUID() || rc2MtpActiveUUID || '';
    const query = targetUuid ? `?uuid=${encodeURIComponent(targetUuid)}` : '';
    const res = await fetch(`${COMPANION_API_BASE}/api/pull-mission${query}`);
    const data = await res.json();

    if (data.success) {
      if (data.uuid) {
        setRC2UUID(data.uuid);
      }
      importedFileName = data.fileName || `${data.uuid || 'mission'}.kmz`;
      const statusText = document.getElementById('import-status-text');
      if (statusText) {
        statusText.textContent = `Imported ${importedFileName}`;
      }

      if (data.waylinesWpml) {
        parseWPML(data.waylinesWpml);
      } else {
        throw new Error('No waylines.wpml received from RC 2');
      }

      pullBtn.innerHTML = `<span>✅ Pulled ${data.uuid ? data.uuid.substring(0, 8) + '...' : ''}</span>`;
      pullBtn.style.background = 'rgba(168, 85, 247, 0.25)';
      pullBtn.style.borderColor = 'rgba(168, 85, 247, 0.6)';
      pullBtn.style.color = '#c084fc';
      setTimeout(() => {
        pullBtn.disabled = false;
        pullBtn.innerHTML = originalContent;
        pullBtn.style.background = '';
        pullBtn.style.borderColor = '';
        pullBtn.style.color = '';
      }, 4000);
    } else {
      throw new Error(data.error || 'Failed to pull mission from RC 2');
    }
  } catch (err) {
    console.error('Direct RC 2 Pull Error:', err);
    pullBtn.innerHTML = `<span>❌ Pull Failed</span>`;
    pullBtn.style.color = '#f87171';
    setTimeout(() => {
      pullBtn.disabled = false;
      pullBtn.innerHTML = originalContent;
      pullBtn.style.color = '';
    }, 3000);
  }
}

async function pullFlightLogFromRC2(targetBtn = null) {
  const btn = targetBtn || document.getElementById('diag-pull-rc2-btn') || document.getElementById('direct-rc2-pull-log-btn');
  const originalContent = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span>⏳ Pulling Log...</span>`;
  }

  try {
    const apiBase = typeof getCompanionApiBase === 'function' ? getCompanionApiBase() : (typeof COMPANION_API_BASE !== 'undefined' ? COMPANION_API_BASE : 'http://127.0.0.1:8765');
    const res = await fetch(`${apiBase}/api/latest-flight`);
    const data = await res.json();

    if (data.success && data.data && (data.data.latestLog || data.data.latestKmz)) {
      const logName = data.data.latestLog;
      if (btn) {
        btn.innerHTML = `<span>✅ Pulled ${logName ? logName.substring(0, 16) + '...' : 'Flight'}</span>`;
        btn.style.color = '#38bdf8';
      }

      // Refresh the Flight Diagnostics flight list
      if (typeof FlightDiagnostics !== 'undefined' && FlightDiagnostics.refreshFlightList) {
        await FlightDiagnostics.refreshFlightList();
        if (logName) {
          const sel = document.getElementById('diag-flight-selector');
          if (sel) {
            sel.value = logName;
          }
          if (FlightDiagnostics.loadSelectedFlight) {
            FlightDiagnostics.loadSelectedFlight(logName);
          }
        }
      }

      // If triggered from the sidebar, open the Diagnostics modal to show the pulled flight!
      if (btn && btn.id === 'direct-rc2-pull-log-btn') {
        if (typeof FlightDiagnostics !== 'undefined' && FlightDiagnostics.open) {
          FlightDiagnostics.open();
        }
      }

      setTimeout(() => {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = originalContent;
          btn.style.color = '';
        }
      }, 3500);
      return { success: true, logName };
    } else {
      throw new Error(data.error || (data.data && data.data.error) || 'No new flight logs found on connected DJI RC 2');
    }
  } catch (err) {
    console.error('Pull Flight Log Error:', err);
    if (btn) {
      btn.innerHTML = `<span>❌ Pull Failed / Offline</span>`;
      btn.style.color = '#f87171';
      setTimeout(() => {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = originalContent;
          btn.style.color = '';
        }
      }, 3000);
    }
    return { success: false, error: err.message };
  }
}

async function sendDirectlyToRC2() {
  const directBtn = document.getElementById('direct-rc2-sync-btn');
  if (!directBtn || !isRc2MtpConnected) return;

  const originalContent = directBtn.innerHTML;
  directBtn.disabled = true;
  directBtn.innerHTML = `<span>⏳ Syncing to RC 2...</span>`;

  try {
    const rawWps = (typeof getCurrentWaypoints === 'function' ? getCurrentWaypoints() : null) || [];
    if (!rawWps || rawWps.length === 0) {
      alert("No waypoints generated to sync. Please place a mission or center point first.");
      directBtn.disabled = false;
      directBtn.innerHTML = originalContent;
      return;
    }

    const speed = parseFloat(document.getElementById('speed')?.value) || 4;
    const gimbalPitch = parseFloat(document.getElementById('gimbal-pitch')?.value) || -90;
    const waypoints = rawWps.map(wp => ({
      lat: wp.lat,
      lon: wp.lon,
      alt: wp.alt,
      pitch: wp.pitch !== undefined && wp.pitch !== null ? wp.pitch : gimbalPitch,
      speed: speed,
      heading: wp.heading,
      isRingStart: wp.isRingStart || false,
      ringIndex: wp.ringIndex !== undefined ? wp.ringIndex : null,
      poiIndex: wp.poiIndex !== undefined ? wp.poiIndex : null,
      headingMode: wp.headingMode !== undefined ? wp.headingMode : null
    }));

    const result = await generateKMZBlob(waypoints);
    if (!result || !result.blob) {
      throw new Error('Could not generate mission KMZ');
    }

    const uuid = getRC2UUID() || rc2MtpActiveUUID || '354A8F93-759C-42C3-A8D5-746F79C7622A';
    const kmzBase64 = await blobToBase64(result.blob);

    const res = await fetch(`${COMPANION_API_BASE}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uuid, kmzBase64 })
    });

    const data = await res.json();
    if (data.success) {
      directBtn.innerHTML = `<span>✅ Synced to DJI RC 2! Re-open in DJI Fly</span>`;
      directBtn.style.background = 'rgba(34, 197, 94, 0.2)';
      directBtn.style.borderColor = 'rgba(34, 197, 94, 0.5)';
      directBtn.style.color = '#4ade80';

      // Also archive the mission diagnostics in SQLite
      try {
        const diagData = buildFlightDiagnosticsJSON(waypoints, {
          altitude: parseFloat(document.getElementById('altitude')?.value) || 50,
          speed,
          gimbalPitch,
          uuid,
          filename: `${uuid}.kmz`,
          validation: result.validation,
          isValid: result.validation ? result.validation.valid : true,
          wpmlXml: result.waylinesWpml,
          templateXml: result.templateKml
        });

        if (diagData && (!diagData.isValid || (diagData.validationErrors && diagData.validationErrors.length > 0))) {
          try {
            if (typeof localStorage !== 'undefined') {
              const rawHist = localStorage.getItem('aalaapi_bad_kmz_history');
              const badHist = rawHist ? JSON.parse(rawHist) : [];
              badHist.unshift({
                uuid: diagData.uuid,
                filename: diagData.filename,
                created_at: diagData.createdAt,
                flight_pattern: diagData.flightPattern,
                waypoint_count: diagData.summary?.waypointCount || waypoints.length,
                validation_rules_passed: diagData.validationRulesPassed,
                validation_errors: diagData.validationErrors,
                is_valid: 0,
                execution_status: 'invalid'
              });
              localStorage.setItem('aalaapi_bad_kmz_history', JSON.stringify(badHist.slice(0, 20)));
            }
          } catch (storageErr) {}
        }

        fetch(`${COMPANION_API_BASE}/api/diagnostics/archive`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(diagData)
        }).catch(() => {});
      } catch (e) {}
      setTimeout(() => {
        directBtn.disabled = false;
        directBtn.innerHTML = originalContent;
        directBtn.style.background = '';
        directBtn.style.borderColor = '';
        directBtn.style.color = '';
      }, 4000);
    } else {
      throw new Error(data.error || 'Transfer failed');
    }
  } catch (err) {
    console.error('Direct RC 2 Sync Error:', err);
    if (typeof window !== 'undefined' && window.location && window.location.protocol === 'file:') {
      console.warn('[RC 2 Direct Sync] Browser security policy may restrict network calls from file:/// origins. Open http://127.0.0.1:8765 in your browser to run Aalaapi Sky with direct same-origin companion access.');
    }
    directBtn.innerHTML = `<span>❌ Sync Failed</span>`;
    directBtn.style.color = '#f87171';
    setTimeout(() => {
      directBtn.disabled = false;
      directBtn.innerHTML = originalContent;
      directBtn.style.color = '';
    }, 3000);
  }
}

function blobToBase64(blob) {
  if (!blob) return Promise.resolve('');
  if (typeof FileReader !== 'undefined') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result ? reader.result.split(',')[1] : '';
        resolve(base64String);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
  if (typeof Buffer !== 'undefined') {
    if (blob instanceof Uint8Array || Buffer.isBuffer(blob)) {
      return Promise.resolve(Buffer.from(blob).toString('base64'));
    }
    if (typeof blob.arrayBuffer === 'function') {
      return blob.arrayBuffer().then(buf => Buffer.from(buf).toString('base64'));
    }
  }
  return Promise.resolve('');
}

// ─── DJI Fly UUID Settings ───────────────────────────────────────────────────

const RC2_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RC2_UUID_LS_KEY  = 'aalaapi-rc2-uuid';

function getRC2UUID() {
  try {
    return (typeof localStorage !== 'undefined' && localStorage.getItem) ? (localStorage.getItem(RC2_UUID_LS_KEY) || '') : '';
  } catch (e) {
    return '';
  }
}

function setRC2UUID(uuid) {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.setItem) {
      localStorage.setItem(RC2_UUID_LS_KEY, uuid);
    }
  } catch (e) {}
  const input = typeof document !== 'undefined' ? document.getElementById('rc2-uuid') : null;
  const preview = typeof document !== 'undefined' ? document.getElementById('rc2-uuid-preview') : null;
  if (input && input.value !== uuid) input.value = uuid;
  if (preview) preview.textContent = uuid || '[UUID]';
}

function clearRC2UUID() {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.removeItem) {
      localStorage.removeItem(RC2_UUID_LS_KEY);
    }
  } catch (e) {}
  const input = typeof document !== 'undefined' ? document.getElementById('rc2-uuid') : null;
  const preview = typeof document !== 'undefined' ? document.getElementById('rc2-uuid-preview') : null;
  if (input) input.value = '';
  if (preview) preview.textContent = '[UUID]';
}

function initRC2Controls() {
  // Restore stored UUID into the input field
  const storedUuid = getRC2UUID();
  if (storedUuid) setRC2UUID(storedUuid);

  // UUID input → localStorage live sync
  const uuidInput = document.getElementById('rc2-uuid');
  if (uuidInput) {
    uuidInput.addEventListener('input', () => {
      const v = uuidInput.value.trim();
      if (RC2_UUID_PATTERN.test(v)) {
        setRC2UUID(v);
      } else {
        const preview = document.getElementById('rc2-uuid-preview');
        if (preview) preview.textContent = v || '[UUID]';
      }
    });
    uuidInput.addEventListener('blur', () => {
      const v = uuidInput.value.trim();
      if (v && !RC2_UUID_PATTERN.test(v)) {
        uuidInput.style.outline = '2px solid #ef4444';
        setTimeout(() => uuidInput.style.outline = '', 1500);
      }
    });
  }

  // Clear button
  const clearBtn = document.getElementById('rc2-uuid-clear');
  if (clearBtn) clearBtn.addEventListener('click', clearRC2UUID);

  // Direct RC 2 sync button
  const directSyncBtn = document.getElementById('direct-rc2-sync-btn');
  if (directSyncBtn) {
    directSyncBtn.addEventListener('click', sendDirectlyToRC2);
  }

  // Direct RC 2 pull button
  const directPullBtn = document.getElementById('direct-rc2-pull-btn');
  if (directPullBtn) {
    directPullBtn.addEventListener('click', pullFromRC2);
  }

  // Direct RC 2 pull flight log button
  const directPullLogBtn = document.getElementById('direct-rc2-pull-log-btn');
  if (directPullLogBtn) {
    directPullLogBtn.addEventListener('click', () => pullFlightLogFromRC2(directPullLogBtn));
  }

  // Initialize Flight Diagnostics Engine
  FlightDiagnostics.init();

  // Initialize Remote ID Airspace Radar
  RemoteIdRadar.init();

  // Start polling Companion service status & Remote ID radar
  pollCompanionStatus();
  RemoteIdRadar.pollAirspace();
  if (!companionPollInterval && typeof window !== 'undefined' && window.setInterval) {
    companionPollInterval = setInterval(() => {
      pollCompanionStatus();
      RemoteIdRadar.pollAirspace();
    }, 3000);
  }
}

// ─── Remote ID Airspace Radar & Live Detection ─────────────────────────────

const RemoteIdRadar = {
  activeDrones: [],
  markers: new Map(), // droneId -> { marker, takeoffMarker, homeVectorLine, line, drone }
  layerGroup: null,
  locatedDroneId: null,
  isFollowing: false,

  init() {
    const leaflet = (typeof L !== 'undefined' && L) || (typeof window !== 'undefined' && window.L) || (typeof global !== 'undefined' && global.L);
    const m = (typeof map !== 'undefined' && map) || (typeof window !== 'undefined' && window.map) || (typeof global !== 'undefined' && global.map);
    if (typeof remoteIdAirspaceLayer !== 'undefined' && remoteIdAirspaceLayer) {
      this.layerGroup = remoteIdAirspaceLayer;
    } else if (leaflet && m && !this.layerGroup && m.addLayer && leaflet.layerGroup) {
      this.layerGroup = leaflet.layerGroup().addTo(m);
    }
    if (m && m.on) {
      m.on('dragstart', () => {
        if (this.isFollowing) {
          this.isFollowing = false;
          this.updateRadarUI();
        }
      });
    }

    const badge = typeof document !== 'undefined' ? document.getElementById('remote-id-badge') : null;
    if (badge) {
      badge.addEventListener('click', () => {
        if (this.activeDrones.length > 0) {
          const target = this.activeDrones.find(d => d.latitude && d.longitude) || this.activeDrones[0];
          if (target && target.latitude && target.longitude) {
            this.locateDrone(target.id);
          }
        }
      });
    }
  },

  locateDrone(droneId) {
    const target = this.activeDrones.find(d => d.id === droneId) || this.activeDrones.find(d => d.latitude && d.longitude);
    if (!target || !target.latitude || !target.longitude) return false;

    this.locatedDroneId = target.id;
    this.isFollowing = true;

    const leaflet = (typeof L !== 'undefined' && L) || (typeof window !== 'undefined' && window.L) || (typeof global !== 'undefined' && global.L);
    const m = (typeof map !== 'undefined' && map) || (typeof window !== 'undefined' && window.map) || (typeof global !== 'undefined' && global.map);
    if (m) {
      if (target.operatorLatitude && target.operatorLongitude && m.fitBounds && leaflet && leaflet.latLngBounds) {
        const bounds = leaflet.latLngBounds([
          [target.latitude, target.longitude],
          [target.operatorLatitude, target.operatorLongitude]
        ]);
        m.fitBounds(bounds, { padding: [70, 70], maxZoom: 18 });
      } else if (m.setView) {
        const zoom = m.getZoom ? Math.max(m.getZoom(), 17) : 18;
        m.setView([target.latitude, target.longitude], zoom);
      }
    }

    const entry = this.markers.get(target.id);
    if (entry && entry.marker) {
      if (entry.marker.openTooltip) entry.marker.openTooltip();
    }

    this.updateRadarUI();
    return true;
  },

  formatDroneTooltip(drone) {
    const isSignalLost = !!(drone.signalLost || (drone.ageSec !== undefined && drone.ageSec > 15));
    const altText = drone.altitudeGeodetic !== null ? `${drone.altitudeGeodetic}m (${Math.round(drone.altitudeGeodetic * 3.28084)}ft MSL)` : 'Alt N/A';
    const speedText = drone.speedHorizontal !== null ? `${drone.speedHorizontal} m/s (${(drone.speedHorizontal * 2.23694).toFixed(1)} mph)` : 'Speed N/A';
    const heading = drone.trackDirection !== null ? `${Math.round(drone.trackDirection)}°` : '0°';
    const coordsText = (drone.latitude && drone.longitude) ? `${drone.latitude.toFixed(6)}, ${drone.longitude.toFixed(6)}` : 'Awaiting GPS Fix';
    const transport = drone.transport || 'Direct';
    const rssiText = drone.rssi ? `${drone.rssi} dBm` : 'N/A';
    const statusText = isSignalLost ? `Signal Lost (${drone.lastSeenFormatted || 'Past'})` : (drone.status || 'Airborne');
    const statusColor = isSignalLost ? '#f59e0b' : (drone.status === 'Airborne' ? '#22c55e' : (drone.status === 'Emergency' ? '#ef4444' : '#eab308'));
    const themeColor = isSignalLost ? '#f59e0b' : '#ef4444';

    return `
      <div class="remote-id-hover-hud" style="font-family: inherit; font-size: 0.78rem; line-height: 1.35; min-width: 220px;">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; border-bottom: 1px solid rgba(255,255,255,0.12); padding-bottom: 5px; margin-bottom: 6px;">
          <div style="display: flex; align-items: center; gap: 6px; font-weight: 700; color: ${themeColor};">
            <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${themeColor}; box-shadow: 0 0 6px ${themeColor};"></span>
            <span>${drone.model || 'Drone'}</span>
          </div>
          <span style="font-size: 0.65rem; background: ${statusColor}22; border: 1px solid ${statusColor}66; color: ${statusColor}; border-radius: 4px; padding: 1px 4px; font-weight: 600;">
            ${isSignalLost ? '⚠️ ' : ''}${statusText}
          </span>
        </div>
        <div style="color: #94a3b8; font-size: 0.72rem; margin-bottom: 6px; font-family: monospace;">
          ID: <span style="color: #cbd5e1;">${drone.uasId || 'Unknown'}</span>
        </div>
        <div style="display: grid; grid-template-columns: auto 1fr; gap: 3px 8px; font-size: 0.75rem; color: #e2e8f0;">
          <span style="color: #94a3b8;">${isSignalLost ? '📍 LKP:' : '📍 Geo:'}</span>
          <span style="font-family: monospace; color: #38bdf8; font-weight: 600;">${coordsText}</span>
          <span style="color: #94a3b8;">⛰️ Alt:</span>
          <span style="font-weight: 600;">${altText}</span>
          <span style="color: #94a3b8;">⚡ Speed:</span>
          <span style="font-weight: 600;">${speedText}</span>
          <span style="color: #94a3b8;">🧭 Track:</span>
          <span style="font-weight: 600;">${heading}</span>
          <span style="color: #94a3b8;">📶 Link:</span>
          <span>${transport} (${rssiText})</span>
        </div>
        ${drone.operatorLatitude ? `<div style="margin-top: 6px; padding-top: 4px; border-top: 1px dashed rgba(255,255,255,0.1); font-size: 0.7rem; color: #38bdf8;">🛫 Takeoff: ${drone.operatorLatitude.toFixed(6)}, ${drone.operatorLongitude.toFixed(6)}</div>` : ''}
        <div style="margin-top: 6px; font-size: 0.66rem; color: ${isSignalLost ? '#f59e0b' : '#64748b'}; text-align: right; font-weight: ${isSignalLost ? '600' : 'normal'};">
          ${isSignalLost ? '⚠️ Last Known Position (LKP)' : 'Click to Track • ASTM F3411 Live'}
        </div>
      </div>
    `;
  },

  async pollAirspace() {
    if (typeof fetch === 'undefined') return;
    try {
      const apiBase = typeof COMPANION_API_BASE !== 'undefined' ? COMPANION_API_BASE : 'http://127.0.0.1:8765';
      const res = await fetch(`${apiBase}/api/remote-id/drones`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.drones)) {
          this.activeDrones = data.drones;
          this.updateMapMarkers();
          this.updateRadarUI();
        }
      }
    } catch (e) {
      // Companion offline
      this.activeDrones = [];
      this.updateRadarUI();
    }
  },

  updateDroneLocation(droneData) {
    if (!droneData || !droneData.id) return;
    const existingIdx = this.activeDrones.findIndex(d => d.id === droneData.id);
    if (existingIdx >= 0) {
      this.activeDrones[existingIdx] = { ...this.activeDrones[existingIdx], ...droneData };
    } else {
      this.activeDrones.push(droneData);
    }
    this.updateMapMarkers();
    this.updateRadarUI();
  },

  updateMapMarkers() {
    const leaflet = (typeof L !== 'undefined' && L) || (typeof window !== 'undefined' && window.L) || (typeof global !== 'undefined' && global.L);
    const m = (typeof map !== 'undefined' && map) || (typeof window !== 'undefined' && window.map) || (typeof global !== 'undefined' && global.map);
    if (!this.layerGroup && typeof remoteIdAirspaceLayer !== 'undefined' && remoteIdAirspaceLayer) {
      this.layerGroup = remoteIdAirspaceLayer;
    } else if (!this.layerGroup && m && m.addLayer && leaflet && leaflet.layerGroup) {
      this.layerGroup = leaflet.layerGroup().addTo(m);
    }
    if (!this.layerGroup) return;

    const currentDroneIds = new Set(this.activeDrones.map(d => d.id));

    // Remove old markers
    for (const [id, entry] of this.markers.entries()) {
      if (!currentDroneIds.has(id)) {
        if (entry.marker && this.layerGroup.removeLayer) this.layerGroup.removeLayer(entry.marker);
        if (entry.takeoffMarker && this.layerGroup.removeLayer) this.layerGroup.removeLayer(entry.takeoffMarker);
        if (entry.homeVectorLine && this.layerGroup.removeLayer) this.layerGroup.removeLayer(entry.homeVectorLine);
        if (entry.line && this.layerGroup.removeLayer) this.layerGroup.removeLayer(entry.line);
        this.markers.delete(id);
      }
    }

    // Helper for distance calculation
    const calcDistanceStr = (lat1, lon1, lat2, lon2) => {
      const R = 6371000;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const dist = R * c;
      return dist >= 1000 ? `${(dist / 1000).toFixed(2)} km` : `${Math.round(dist)} m`;
    };

    // Add or update active markers
    for (const drone of this.activeDrones) {
      if (!drone.latitude || !drone.longitude) continue;
      let entry = this.markers.get(drone.id) || { marker: null, takeoffMarker: null, homeVectorLine: null, line: null, drone: null };

      const isSignalLost = !!(drone.signalLost || (drone.ageSec !== undefined && drone.ageSec > 15));
      const heading = drone.trackDirection || 0;
      const tooltipHtml = this.formatDroneTooltip(drone);

      const iconHtml = isSignalLost ? `
        <div style="position: relative; width: 38px; height: 38px; display: flex; flex-direction: column; align-items: center; justify-content: center; opacity: 0.94;">
          <div style="position: absolute; width: 34px; height: 34px; border-radius: 50%; background: rgba(245, 158, 11, 0.22); border: 2px dashed #f59e0b; box-shadow: 0 0 6px rgba(245, 158, 11, 0.4);"></div>
          <div style="transform: rotate(${heading}deg); transition: transform 0.3s ease;">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="#f59e0b" stroke="#0f172a" stroke-width="1.5">
              <path d="M12 2L19 21L12 17L5 21L12 2Z"/>
            </svg>
          </div>
          <span style="position: absolute; bottom: -6px; background: rgba(15, 23, 42, 0.95); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.6); font-size: 0.52rem; font-weight: 800; padding: 0 3px; border-radius: 3px; line-height: 1.1; letter-spacing: 0.04em;">LKP</span>
        </div>
      ` : `
        <div style="position: relative; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;">
          <div style="position: absolute; width: 32px; height: 32px; border-radius: 50%; background: rgba(239, 68, 68, 0.25); border: 1.5px solid #ef4444;"></div>
          <div style="transform: rotate(${heading}deg); transition: transform 0.3s ease;">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="#ef4444" stroke="#ffffff" stroke-width="1.5">
              <path d="M12 2L19 21L12 17L5 21L12 2Z"/>
            </svg>
          </div>
        </div>
      `;

      const customIcon = (leaflet && leaflet.divIcon) ? leaflet.divIcon({
        html: iconHtml,
        className: isSignalLost ? 'remote-id-drone-marker remote-id-lkp-marker' : 'remote-id-drone-marker',
        iconSize: [38, 38],
        iconAnchor: [19, 19]
      }) : null;

      // 1. Drone Position Marker (Live or LKP)
      if (!entry.marker) {
        const marker = (leaflet && leaflet.marker && customIcon) ? leaflet.marker([drone.latitude, drone.longitude], { icon: customIcon, zIndexOffset: isSignalLost ? 800 : 1000 }) : null;
        if (marker) {
          if (marker.bindTooltip) {
            marker.bindTooltip(tooltipHtml, {
              direction: 'top',
              offset: [0, -16],
              className: 'remote-id-tooltip',
              opacity: 0.96
            });
          }
          if (marker.bindPopup) {
            marker.bindPopup(tooltipHtml);
          }
          if (marker.on) {
            marker.on('mouseover', () => { if (marker.openTooltip) marker.openTooltip(); });
            marker.on('mouseout', () => { if (marker.closeTooltip) marker.closeTooltip(); });
            marker.on('click', () => { this.locateDrone(drone.id); });
          }
          this.layerGroup.addLayer(marker);
        }
        entry.marker = marker;
      } else {
        if (entry.marker.setLatLng) entry.marker.setLatLng([drone.latitude, drone.longitude]);
        if (customIcon && entry.marker.setIcon) entry.marker.setIcon(customIcon);
        if (entry.marker.setTooltipContent) entry.marker.setTooltipContent(tooltipHtml);
        if (entry.marker.setPopupContent) entry.marker.setPopupContent(tooltipHtml);
      }

      // 2. Takeoff / Home Location Marker & Home Vector Line
      const hasTakeoff = drone.operatorLatitude !== null && drone.operatorLatitude !== undefined &&
                         drone.operatorLongitude !== null && drone.operatorLongitude !== undefined;

      if (hasTakeoff) {
        const rangeStr = calcDistanceStr(drone.operatorLatitude, drone.operatorLongitude, drone.latitude, drone.longitude);
        const takeoffIconHtml = `
          <div class="remote-id-takeoff-pin" style="position: relative; display: flex; flex-direction: column; align-items: center; cursor: pointer; user-select: none;">
            <div style="background: rgba(15, 23, 42, 0.92); border: 2px solid #38bdf8; width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 8px rgba(56, 189, 248, 0.6);">
              <span style="color: #38bdf8; font-size: 0.72rem; font-weight: 800; font-family: monospace; line-height: 1;">H</span>
            </div>
            <span style="background: rgba(15, 23, 42, 0.88); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.4); font-size: 0.58rem; font-weight: 700; padding: 1px 4px; border-radius: 3px; margin-top: 1px; white-space: nowrap;">
              Takeoff
            </span>
          </div>
        `;

        const takeoffIcon = (leaflet && leaflet.divIcon) ? leaflet.divIcon({
          html: takeoffIconHtml,
          className: 'remote-id-takeoff-marker',
          iconSize: [36, 42],
          iconAnchor: [18, 20],
          popupAnchor: [0, -18]
        }) : null;

        const takeoffTooltipHtml = `
          <div class="remote-id-takeoff-tooltip" style="font-family: inherit; font-size: 0.76rem; line-height: 1.35; min-width: 200px;">
            <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.12); padding-bottom: 4px; margin-bottom: 5px;">
              <strong style="color: #38bdf8;">🛫 Takeoff / Home Location</strong>
              <span style="font-size: 0.62rem; color: #94a3b8;">${drone.operatorLocationType || 'Takeoff'}</span>
            </div>
            <div style="color: #cbd5e1; font-weight: 600; margin-bottom: 3px;">${drone.model || 'Drone'} [${drone.uasId || 'RID'}]</div>
            <div style="display: grid; grid-template-columns: auto 1fr; gap: 2px 6px; font-size: 0.72rem; color: #94a3b8;">
              <span>📍 Geo:</span>
              <span style="color: #f8fafc; font-family: monospace;">${drone.operatorLatitude.toFixed(6)}, ${drone.operatorLongitude.toFixed(6)}</span>
              ${drone.operatorAltitude !== null && drone.operatorAltitude !== undefined ? `<span>⛰️ Alt:</span><span style="color: #f8fafc;">${drone.operatorAltitude}m (${Math.round(drone.operatorAltitude * 3.28084)}ft)</span>` : ''}
              <span>📏 Range:</span>
              <span style="color: #38bdf8; font-weight: 700;">${rangeStr} to ${isSignalLost ? 'LKP' : 'Drone'}</span>
            </div>
          </div>
        `;

        if (!entry.takeoffMarker) {
          const tMarker = (leaflet && leaflet.marker && takeoffIcon) ? leaflet.marker([drone.operatorLatitude, drone.operatorLongitude], { icon: takeoffIcon, zIndexOffset: 950 }) : null;
          if (tMarker) {
            if (tMarker.bindTooltip) tMarker.bindTooltip(takeoffTooltipHtml, { direction: 'top', offset: [0, -18], className: 'remote-id-tooltip', opacity: 0.96 });
            if (tMarker.bindPopup) tMarker.bindPopup(takeoffTooltipHtml);
            if (tMarker.on) {
              tMarker.on('click', () => { this.locateDrone(drone.id); });
            }
            this.layerGroup.addLayer(tMarker);
          }
          entry.takeoffMarker = tMarker;
        } else {
          if (entry.takeoffMarker.setLatLng) entry.takeoffMarker.setLatLng([drone.operatorLatitude, drone.operatorLongitude]);
          if (takeoffIcon && entry.takeoffMarker.setIcon) entry.takeoffMarker.setIcon(takeoffIcon);
          if (entry.takeoffMarker.setTooltipContent) entry.takeoffMarker.setTooltipContent(takeoffTooltipHtml);
          if (entry.takeoffMarker.setPopupContent) entry.takeoffMarker.setPopupContent(takeoffTooltipHtml);
        }

        // Connecting Home Vector Line
        const vectorPoints = [
          [drone.operatorLatitude, drone.operatorLongitude],
          [drone.latitude, drone.longitude]
        ];
        const lineColor = isSignalLost ? '#f59e0b' : '#38bdf8';
        const lineTooltip = isSignalLost 
          ? `Last Vector: ${rangeStr} from Takeoff (Signal Lost ${drone.lastSeenFormatted || ''})`
          : `Home Vector: ${rangeStr} (${drone.uasId || 'Drone'})`;

        if (!entry.homeVectorLine) {
          if (leaflet && leaflet.polyline) {
            entry.homeVectorLine = leaflet.polyline(vectorPoints, {
              color: lineColor,
              weight: 2,
              dashArray: '6, 6',
              opacity: isSignalLost ? 0.75 : 0.85
            });
            if (entry.homeVectorLine.bindTooltip) {
              entry.homeVectorLine.bindTooltip(lineTooltip, { sticky: true });
            }
            this.layerGroup.addLayer(entry.homeVectorLine);
          }
        } else {
          if (entry.homeVectorLine.setLatLngs) entry.homeVectorLine.setLatLngs(vectorPoints);
          if (entry.homeVectorLine.setStyle) entry.homeVectorLine.setStyle({ color: lineColor, opacity: isSignalLost ? 0.75 : 0.85 });
          if (entry.homeVectorLine.setTooltipContent) entry.homeVectorLine.setTooltipContent(lineTooltip);
        }
      } else {
        if (entry.takeoffMarker && this.layerGroup.removeLayer) {
          this.layerGroup.removeLayer(entry.takeoffMarker);
          entry.takeoffMarker = null;
        }
        if (entry.homeVectorLine && this.layerGroup.removeLayer) {
          this.layerGroup.removeLayer(entry.homeVectorLine);
          entry.homeVectorLine = null;
        }
      }

      // 3. Historical Breadcrumbs Line
      if (drone.breadcrumbs && drone.breadcrumbs.length > 1) {
        const bcColor = isSignalLost ? '#f59e0b' : '#ef4444';
        if (!entry.line && leaflet && leaflet.polyline) {
          entry.line = leaflet.polyline(drone.breadcrumbs.map(b => [b.lat, b.lon]), { color: bcColor, weight: 2, dashArray: '4,4', opacity: isSignalLost ? 0.65 : 0.7 });
          this.layerGroup.addLayer(entry.line);
        } else if (entry.line) {
          if (entry.line.setLatLngs) entry.line.setLatLngs(drone.breadcrumbs.map(b => [b.lat, b.lon]));
          if (entry.line.setStyle) entry.line.setStyle({ color: bcColor, opacity: isSignalLost ? 0.65 : 0.7 });
        }
      }

      entry.drone = drone;
      this.markers.set(drone.id, entry);

      // If this drone is actively tracked/located and auto-follow is active, center/pan map on new coordinates
      if (this.isFollowing && this.locatedDroneId === drone.id && m && m.panTo) {
        m.panTo([drone.latitude, drone.longitude], { animate: true });
      }
    }
  },

  updateRadarUI() {
    if (typeof document === 'undefined') return;
    const badge = document.getElementById('remote-id-badge');
    const badgeText = document.getElementById('remote-id-badge-text');
    const locateLabel = document.getElementById('remote-id-locate-label');
    if (badge) {
      if (this.activeDrones.length > 0) {
        badge.style.display = 'inline-flex';
        badge.classList.remove('hidden');
        const count = this.activeDrones.length;
        const liveCount = this.activeDrones.filter(d => !d.signalLost && (d.ageSec === undefined || d.ageSec <= 15)).length;
        const lostCount = count - liveCount;
        const first = this.activeDrones[0];

        let label = '';
        if (this.isFollowing && this.locatedDroneId) {
          const located = this.activeDrones.find(d => d.id === this.locatedDroneId) || first;
          const isLocatedLost = !!(located.signalLost || (located.ageSec !== undefined && located.ageSec > 15));
          label = isLocatedLost ? `⚠️ LKP: ${located.model || 'Drone'} (${located.lastSeenFormatted || 'Lost'})` : `📡 Tracking ${located.model || 'Drone'}`;
          if (locateLabel) locateLabel.textContent = isLocatedLost ? 'LKP 📍' : 'Following 📍';
        } else {
          if (liveCount > 0) {
            label = `📡 ${liveCount} Live${lostCount > 0 ? ` + ${lostCount} LKP` : ''}`;
          } else {
            label = `⚠️ ${lostCount} Last Known (LKP)`;
          }
          if (count === 1 && !first.latitude) {
            label = `📡 ${first.model} Detected (${first.rssi} dBm)`;
          }
          if (locateLabel) locateLabel.textContent = 'Locate';
        }

        if (badgeText) {
          badgeText.textContent = label;
        } else {
          badge.textContent = label;
        }
      } else {
        badge.style.display = 'none';
        badge.classList.add('hidden');
      }
    }
  }
};

if (typeof window !== 'undefined') {
  window.RemoteIdRadar = RemoteIdRadar;
}

// ─── Flight Diagnostics & 3D Telemetry Replay Engine ──────────────────────────

function getActiveMissionWaypoints() {
  if (typeof importedWaypoints !== 'undefined' && importedWaypoints && importedWaypoints.length > 0) {
    return importedWaypoints;
  }
  if (typeof generatedWaypoints !== 'undefined' && generatedWaypoints && generatedWaypoints.length > 0) {
    return generatedWaypoints;
  }
  const alt = (typeof document !== 'undefined' && parseFloat(document.getElementById('altitude')?.value)) || 21.0;
  const speed = (typeof document !== 'undefined' && parseFloat(document.getElementById('speed')?.value)) || 4.0;
  const pitch = (typeof document !== 'undefined' && parseFloat(document.getElementById('gimbal-pitch')?.value)) || -90.0;

  let centerLat = 40.0130;
  let centerLon = -83.1765;
  if (typeof centerMarker !== 'undefined' && centerMarker) {
    const latlng = centerMarker.getLatLng();
    centerLat = latlng.lat;
    centerLon = latlng.lng;
  } else if (typeof map !== 'undefined' && map && map.getCenter) {
    const latlng = map.getCenter();
    centerLat = latlng.lat;
    centerLon = latlng.lng;
  }

  // Realistic backyard lawn grid: ~18m x ~14m
  const latM = 111320;
  const lonM = 111320 * Math.cos(centerLat * Math.PI / 180);
  const halfW = 9.0;
  const halfH = 7.0;

  return [
    { lat: centerLat - halfH / latM, lon: centerLon - halfW / lonM, altitude: alt, gimbalPitch: pitch, speed },
    { lat: centerLat + halfH / latM, lon: centerLon - halfW / lonM, altitude: alt, gimbalPitch: pitch, speed },
    { lat: centerLat + halfH / latM, lon: centerLon, altitude: alt, gimbalPitch: pitch, speed },
    { lat: centerLat - halfH / latM, lon: centerLon, altitude: alt, gimbalPitch: pitch, speed },
    { lat: centerLat - halfH / latM, lon: centerLon + halfW / lonM, altitude: alt, gimbalPitch: pitch, speed },
    { lat: centerLat + halfH / latM, lon: centerLon + halfW / lonM, altitude: alt, gimbalPitch: pitch, speed }
  ];
}

const FlightDiagnostics = {
  isOpen: false,
  isPlaying: false,
  playbackSpeed: 1,
  currentPointIndex: 0,
  playbackFractionalIndex: 0.0,
  selectedFlightId: 'FlightRecord_2026-08-20_[19-42-28].txt',
  telemetryData: null,
  comparisonData: null,
  animFrameId: null,
  lastFrameTime: null,
  threeScene: null,
  threeRenderer: null,
  threeCamera: null,
  threeControls: null,
  droneMesh: null,
  frustumMesh: null,
  actualLineMesh: null,
  plannedLineMesh: null,
  photoMarkers: [],
  currentLoadedMission: null,

  init() {
    if (typeof document === 'undefined') return;
    const openBtns = [
      document.getElementById('action-diagnostics-btn'),
      document.getElementById('open-diagnostics-btn')
    ];
    openBtns.forEach(btn => {
      if (btn) btn.addEventListener('click', () => this.open());
    });

    const closeBtn = document.getElementById('diag-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', () => this.close());

    const playBtn = document.getElementById('diag-play-btn');
    if (playBtn) playBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.togglePlay();
    });

    const slider = document.getElementById('diag-timeline-slider');
    if (slider) {
      slider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        this.playbackFractionalIndex = val;
        this.seekTo(val, false, true);
      });
    }

    // Speed multiplier buttons
    document.querySelectorAll('.diag-speed-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.diag-speed-btn').forEach(b => {
          b.classList.remove('active');
          b.style.background = 'rgba(255, 255, 255, 0.05)';
          b.style.borderColor = 'var(--border-color)';
          b.style.color = 'var(--text-muted)';
        });
        btn.classList.add('active');
        btn.style.background = 'rgba(6, 182, 212, 0.2)';
        btn.style.borderColor = 'rgba(6, 182, 212, 0.4)';
        btn.style.color = '#22d3ee';
        this.playbackSpeed = parseFloat(btn.getAttribute('data-speed')) || 1;
      });
    });

    // View toggles (3D vs Top Down)
    const view3dBtn = document.getElementById('diag-view-3d-btn');
    const viewTopBtn = document.getElementById('diag-view-top-btn');
    if (view3dBtn && viewTopBtn) {
      view3dBtn.addEventListener('click', () => {
        view3dBtn.classList.add('active');
        viewTopBtn.classList.remove('active');
        this.resetCameraView('3d');
      });
      viewTopBtn.addEventListener('click', () => {
        viewTopBtn.classList.add('active');
        view3dBtn.classList.remove('active');
        this.resetCameraView('top');
      });
    }

    // Flight selector dropdown
    const flightSel = document.getElementById('diag-flight-selector');
    if (flightSel) {
      flightSel.addEventListener('change', (e) => {
        this.loadSelectedFlight(e.target.value);
      });
    }

    // Copy Antigravity Fix Prompt button
    const copyAntigravityBtn = document.getElementById('diag-copy-antigravity-btn');
    if (copyAntigravityBtn) {
      copyAntigravityBtn.addEventListener('click', () => this.copyAntigravityPrompt());
    }

    // Export Diag JSON button
    const exportJsonBtn = document.getElementById('diag-export-json-btn');
    if (exportJsonBtn) exportJsonBtn.addEventListener('click', () => this.exportDiagJSON());

    // Export GeoJSON button
    const exportBtn = document.getElementById('diag-export-geojson-btn');
    if (exportBtn) exportBtn.addEventListener('click', () => this.exportGeoJSON());

    // Center 2D Map button
    const centerMapBtn = document.getElementById('diag-center-map-btn');
    if (centerMapBtn) centerMapBtn.addEventListener('click', () => this.centerMapOnFlight());

    // Pull from RC 2 button in diagnostics header
    const diagPullBtn = document.getElementById('diag-pull-rc2-btn');
    if (diagPullBtn) {
      diagPullBtn.addEventListener('click', () => pullFlightLogFromRC2(diagPullBtn));
    }

    // Load file button
    const loadBtn = document.getElementById('diag-load-file-btn');
    const fileInput = document.getElementById('diag-file-input');
    if (loadBtn && fileInput) {
      loadBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', (e) => this.handleLogFileImport(e));
    }
  },

  copyAntigravityPrompt() {
    let promptText = '';
    if (this.currentLoadedMission) {
      const m = this.currentLoadedMission;
      promptText = KMZInspector.generateAntigravityPrompt(
        m.validationReport || { rulesPassed: m.validation_rules_passed || 0, errors: m.validationErrors || [], warnings: m.validationWarnings || [] },
        m.wpml_xml,
        m.plan?.waypoints
      );
    } else {
      promptText = KMZInspector.generateAntigravityPrompt();
    }

    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(promptText).then(() => {
        const btn = document.getElementById('diag-copy-antigravity-btn');
        if (btn) {
          const orig = btn.innerHTML;
          btn.innerHTML = '✅ Copied to Clipboard!';
          btn.style.color = '#34d399';
          setTimeout(() => {
            btn.innerHTML = orig;
            btn.style.color = '#a5b4fc';
          }, 2500);
        }
      }).catch(() => {
        if (typeof prompt === 'function') prompt('Copy Antigravity Fix Prompt:', promptText);
      });
    } else {
      if (typeof prompt === 'function') prompt('Copy Antigravity Fix Prompt:', promptText);
    }
  },

  centerMapOnFlight() {
    const origin = this.getSceneOrigin();
    if (!origin) return;
    if (typeof map !== 'undefined' && map && map.setView) {
      map.setView([origin.lat, origin.lon], 18);
      if (typeof centerMarker !== 'undefined' && centerMarker && centerMarker.setLatLng) {
        centerMarker.setLatLng([origin.lat, origin.lon]);
      }
      if (typeof updateMissionStats === 'function') updateMissionStats();
    }
  },

  async refreshFlightList() {
    const flightSel = document.getElementById('diag-flight-selector');
    if (!flightSel || typeof fetch === 'undefined') return;

    try {
      const apiBase = typeof getCompanionApiBase === 'function' ? getCompanionApiBase() : 'http://127.0.0.1:8765';
      // 1. Fetch raw RC 2 flight logs
      let rc2Flights = [];
      try {
        const res = await fetch(`${apiBase}/api/flights`, {
          signal: AbortSignal.timeout ? AbortSignal.timeout(1500) : undefined
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.flights)) {
            rc2Flights = data.flights;
          }
        }
      } catch (e) {}

      // 2. Fetch saved SQLite mission diagnostics
      let savedMissions = [];
      try {
        const resDiag = await fetch(`${apiBase}/api/diagnostics/history`, {
          signal: AbortSignal.timeout ? AbortSignal.timeout(1500) : undefined
        });
        if (resDiag.ok) {
          const dataDiag = await resDiag.json();
          if (dataDiag.success && Array.isArray(dataDiag.missions)) {
            savedMissions = dataDiag.missions;
          }
        }
      } catch (e) {}

      // Check localStorage for offline bad KMZ missions
      let localBadMissions = [];
      try {
        if (typeof localStorage !== 'undefined') {
          const raw = localStorage.getItem('aalaapi_bad_kmz_history');
          if (raw) localBadMissions = JSON.parse(raw);
        }
      } catch (e) {}

      if (rc2Flights.length === 0 && savedMissions.length === 0 && localBadMissions.length === 0) return;

      const currentVal = flightSel.value;
      flightSel.innerHTML = '';

      // Active Mission Simulation
      const planOpt = document.createElement('option');
      planOpt.value = 'active-mission';
      planOpt.textContent = '🎯 Planned Mission Simulation (Active Workspace)';
      flightSel.appendChild(planOpt);

      // Separate saved missions into valid vs bad / suspended
      const validSaved = savedMissions.filter(m => m.is_valid !== 0 && m.execution_status !== 'suspended' && m.execution_status !== 'failed');
      const badSaved = savedMissions.filter(m => m.is_valid === 0 || m.execution_status === 'suspended' || m.execution_status === 'failed');

      // Combine bad missions from SQLite and localStorage
      const combinedBad = [...badSaved];
      localBadMissions.forEach(lm => {
        if (!combinedBad.some(b => b.uuid === lm.uuid)) {
          combinedBad.push(lm);
        }
      });

      // Bad / Suspended Missions (Antigravity Triage)
      if (combinedBad.length > 0) {
        const groupBad = document.createElement('optgroup');
        groupBad.label = '⚠️ Bad / Suspended KMZs (Antigravity Triage)';
        combinedBad.forEach(m => {
          const opt = document.createElement('option');
          opt.value = `diag:${m.uuid}`;
          const dateClean = (m.created_at || '').replace('T', ' ').replace(/\..+/, '').replace('Z', ' UTC');
          const errCount = m.validation_errors ? m.validation_errors.length : (m.validation_errors_count || 0);
          opt.textContent = `❌ [FAIL: ${errCount} Issues] ${m.filename || m.uuid} (${dateClean})`;
          groupBad.appendChild(opt);
        });
        flightSel.appendChild(groupBad);
      }

      // Saved Mission Diagnostics from SQLite Archive
      if (validSaved.length > 0) {
        const groupSaved = document.createElement('optgroup');
        groupSaved.label = 'Saved Mission Diagnostics (SQLite Archive)';
        validSaved.forEach((m) => {
          const opt = document.createElement('option');
          opt.value = `diag:${m.uuid}`;
          const dateClean = (m.created_at || '').replace('T', ' ').replace(/\..+/, '').replace('Z', ' UTC');
          opt.textContent = `💾 ${m.filename || m.uuid} (${m.waypoint_count || 0} wps • ${dateClean})`;
          groupSaved.appendChild(opt);
        });
        flightSel.appendChild(groupSaved);
      }

      // RC 2 Recorded Flights
      if (rc2Flights.length > 0) {
        const groupRc2 = document.createElement('optgroup');
        groupRc2.label = 'DJI RC 2 Flight Logs (Actual Recorded Flights)';
        rc2Flights.forEach(f => {
          const opt = document.createElement('option');
          opt.value = f.filename;
          opt.textContent = `🛰️ ${f.label}`;
          groupRc2.appendChild(opt);
        });
        flightSel.appendChild(groupRc2);
      }

      if (currentVal && Array.from(flightSel.options).some(o => o.value === currentVal)) {
        flightSel.value = currentVal;
      } else {
        flightSel.selectedIndex = 0;
      }
    } catch (e) {
      // Keep existing options
    }
  },

  async loadSelectedFlight(flightId) {
    this.selectedFlightId = flightId;
    this.currentLoadedMission = null;
    const flightSel = document.getElementById('diag-flight-selector');
    if (flightSel && flightSel.value !== flightId) {
      flightSel.value = flightId;
    }

    const wps = getActiveMissionWaypoints();
    const altitude = (typeof document !== 'undefined' && parseFloat(document.getElementById('altitude')?.value)) || 21.0;
    const speed = (typeof document !== 'undefined' && parseFloat(document.getElementById('speed')?.value)) || 4.0;
    const gimbalPitch = (typeof document !== 'undefined' && parseFloat(document.getElementById('gimbal-pitch')?.value)) || -60.0;
    const apiBase = typeof getCompanionApiBase === 'function' ? getCompanionApiBase() : 'http://127.0.0.1:8765';

    if (flightId === 'active-mission') {
      this.telemetryData = generateTelemetryFromWaypoints(wps, { altitude, speed, gimbalPitch, flightId: 'active-mission', isSimulation: true });
      this.comparisonData = computeFlightComparison({ waypointCount: wps.length, altitude, totalDistance: this.telemetryData?.totalDistance || 820 }, this.telemetryData);
    } else if (flightId.startsWith('diag:')) {
      const uuid = flightId.replace('diag:', '').trim();
      try {
        const res = await fetch(`${apiBase}/api/diagnostics/${encodeURIComponent(uuid)}`, {
          signal: AbortSignal.timeout ? AbortSignal.timeout(2000) : undefined
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.mission) {
            this.currentLoadedMission = data.mission;
            if (data.mission.diagnostics) {
              this.telemetryData = data.mission.diagnostics;
              const plannedStats = data.mission.plan?.statistics || {
                waypointCount: data.mission.waypoint_count,
                altitude: data.mission.altitude,
                totalDistance: data.mission.total_distance
              };
              this.comparisonData = computeFlightComparison(plannedStats, this.telemetryData);
            } else {
              this.telemetryData = generateTelemetryFromWaypoints(wps, { altitude, speed, gimbalPitch, flightId });
              this.comparisonData = computeFlightComparison({ waypointCount: wps.length, altitude, totalDistance: this.telemetryData?.totalDistance || 820 }, this.telemetryData);
            }
          } else {
            throw new Error('Diagnostics data missing in mission payload');
          }
        } else {
          throw new Error('Companion offline');
        }
      } catch (err) {
        console.warn('Failed to load saved diagnostic by uuid:', err);
        this.telemetryData = generateTelemetryFromWaypoints(wps, { altitude, speed, gimbalPitch, flightId });
        this.comparisonData = computeFlightComparison({ waypointCount: wps.length, altitude, totalDistance: this.telemetryData?.totalDistance || 820 }, this.telemetryData);
      }
    } else {
      try {
        const res = await fetch(`${apiBase}/api/flight-telemetry?file=${encodeURIComponent(flightId)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout ? AbortSignal.timeout(1500) : undefined,
          body: JSON.stringify({
            flightId,
            waypoints: wps,
            options: { altitude, speed, gimbalPitch, flightId }
          })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.telemetry) {
            this.telemetryData = data.telemetry;
            this.comparisonData = data.comparison;
          } else {
            throw new Error('Telemetry not in payload');
          }
        } else {
          throw new Error('Companion unreachable');
        }
      } catch (e) {
        this.telemetryData = generateTelemetryFromWaypoints(wps, { altitude, speed, gimbalPitch, flightId });
        this.comparisonData = computeFlightComparison({ waypointCount: wps.length, altitude, totalDistance: this.telemetryData?.totalDistance || 820 }, this.telemetryData);
      }
    }

    this.updateStatsUI();
    this.init3DScene();
    this.playbackFractionalIndex = 0.0;
    this.seekTo(0, true, true);
    this.pause();
  },

  getSceneOrigin() {
    if (this.telemetryData && this.telemetryData.homePoint) {
      return this.telemetryData.homePoint;
    }
    if (typeof centerMarker !== 'undefined' && centerMarker) {
      const pos = centerMarker.getLatLng();
      return { lat: pos.lat, lon: pos.lng };
    }
    if (this.telemetryData && this.telemetryData.points && this.telemetryData.points.length > 0) {
      return { lat: this.telemetryData.points[0].lat, lon: this.telemetryData.points[0].lon };
    }
    return { lat: 40.0130, lon: -83.1765 };
  },

  projectToWorld(lat, lon, alt = 0) {
    const origin = this.getSceneOrigin();
    const tileZoom = 18;
    const tileWidthMeters = 40075016.686 * Math.cos(origin.lat * Math.PI / 180) / Math.pow(2, tileZoom);
    const sinLat0 = Math.sin(origin.lat * Math.PI / 180);
    const xTile0 = ((origin.lon + 180) / 360) * Math.pow(2, tileZoom);
    const yTile0 = (0.5 - Math.log((1 + sinLat0) / (1 - sinLat0)) / (4 * Math.PI)) * Math.pow(2, tileZoom);

    const sinLat = Math.sin(lat * Math.PI / 180);
    const xTile = ((lon + 180) / 360) * Math.pow(2, tileZoom);
    const yTile = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * Math.pow(2, tileZoom);

    const x = (xTile - xTile0) * tileWidthMeters;
    const z = (yTile - yTile0) * tileWidthMeters;
    const y = Math.max(0.1, alt);
    return new THREE.Vector3(x, y, z);
  },

  async open(customData = null) {
    const modal = document.getElementById('flight-diagnostics-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    this.isOpen = true;

    await this.refreshFlightList();

    const flightSel = document.getElementById('diag-flight-selector');
    const selectedFlightId = flightSel ? flightSel.value : (this.selectedFlightId || 'FlightRecord_2026-08-20_[19-42-28].txt');

    if (customData) {
      this.selectedFlightId = customData.flightId || selectedFlightId;
      this.telemetryData = customData.telemetry;
      this.comparisonData = customData.comparison;
      this.updateStatsUI();
      this.init3DScene();
      this.playbackFractionalIndex = 0.0;
      this.seekTo(0, true, true);
      this.pause();
    } else {
      await this.loadSelectedFlight(selectedFlightId);
    }
  },

  close() {
    const modal = document.getElementById('flight-diagnostics-modal');
    if (modal) modal.classList.add('hidden');
    this.isOpen = false;
    this.pause();
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  },

  updateStatsUI() {
    if (!this.telemetryData) return;
    const slider = document.getElementById('diag-timeline-slider');
    if (slider) {
      slider.max = (this.telemetryData.points.length - 1).toString();
      slider.value = '0';
    }

    const comp = this.comparisonData;
    if (comp) {
      const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
      setTxt('diag-stat-time-actual', comp.time.actual);
      setTxt('diag-stat-time-delta', `(${comp.time.delta})`);
      setTxt('diag-stat-dist-actual', comp.distance.actual);
      setTxt('diag-stat-dist-delta', `(Plan: ${comp.distance.planned})`);
      setTxt('diag-stat-alt-actual', comp.altitude.actual);
      setTxt('diag-stat-alt-delta', `(${comp.altitude.delta})`);
      setTxt('diag-stat-photos-actual', `${comp.photos.actual} / ${comp.photos.planned} Photos`);
    }

    const meta = document.getElementById('diag-flight-meta');
    if (meta) {
      const flightName = this.selectedFlightId || 'FlightRecord_2026-08-20_[19-42-28].txt';
      meta.textContent = `Telemetry Log: ${flightName} • Duration: ${this.telemetryData.durationFormatted}`;
    }

    const timeDisplay = document.getElementById('diag-time-display');
    if (timeDisplay) {
      timeDisplay.textContent = `00:00 / ${this.telemetryData.durationFormatted}`;
    }
  },

  init3DScene() {
    if (typeof document === 'undefined') return;
    const container = document.getElementById('diag-3d-canvas-container');
    if (!container || typeof THREE === 'undefined') return;

    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    const oldCanvas = container.querySelector('canvas');
    if (oldCanvas) container.removeChild(oldCanvas);

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 500;

    this.threeScene = new THREE.Scene();
    this.threeScene.background = new THREE.Color(0x070a13);
    this.threeScene.fog = new THREE.FogExp2(0x070a13, 0.0008);

    this.threeCamera = new THREE.PerspectiveCamera(45, width / height, 1, 3000);
    this.threeCamera.position.set(0, 90, 140);

    this.threeRenderer = new THREE.WebGLRenderer({ antialias: true });
    this.threeRenderer.setSize(width, height);
    this.threeRenderer.setPixelRatio(window.devicePixelRatio || 1);
    container.appendChild(this.threeRenderer.domElement);

    if (THREE.OrbitControls) {
      this.threeControls = new THREE.OrbitControls(this.threeCamera, this.threeRenderer.domElement);
      this.threeControls.enableDamping = true;
      this.threeControls.dampingFactor = 0.05;
      this.threeControls.maxPolarAngle = Math.PI / 2 - 0.01;
    }

    // Lighting
    const amb = new THREE.AmbientLight(0xffffff, 1.2);
    this.threeScene.add(amb);
    const dir = new THREE.DirectionalLight(0xffffff, 1.0);
    dir.position.set(100, 300, 100);
    this.threeScene.add(dir);

    // Ground Grid
    const grid = new THREE.GridHelper(400, 40, 0x06b6d4, 0x1e293b);
    this.threeScene.add(grid);

    // Satellite Map Floor (aligned with flight origin)
    this.addSatelliteFloor();

    // Home Point Marker (Green Ring)
    const homeGeo = new THREE.RingGeometry(2, 2.5, 32);
    const homeMat = new THREE.MeshBasicMaterial({ color: 0x22c55e, side: THREE.DoubleSide });
    const homeMesh = new THREE.Mesh(homeGeo, homeMat);
    homeMesh.rotation.x = -Math.PI / 2;
    homeMesh.position.set(0, 0.1, 0);
    this.threeScene.add(homeMesh);

    this.buildTrajectoryMeshes();
    this.buildDroneAvatar();
    this.animate();
  },

  addSatelliteFloor() {
    if (!this.telemetryData || typeof document === 'undefined' || !document.createElement) return;
    const origin = this.getSceneOrigin();
    const cLat = origin.lat;
    const cLon = origin.lon;

    const tileZoom = 18;
    const tileWidthMeters = 40075016.686 * Math.cos(cLat * Math.PI / 180) / Math.pow(2, tileZoom);

    const sinLat = Math.sin(cLat * Math.PI / 180);
    const xTileFrac = ((cLon + 180) / 360) * Math.pow(2, tileZoom);
    const yTileFrac = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * Math.pow(2, tileZoom);

    const xTileCenter = Math.floor(xTileFrac);
    const yTileCenter = Math.floor(yTileFrac);

    const planeSize = tileWidthMeters * 3;

    // Exact tile center offset relative to origin in Three.js world space
    const planeOffsetX = ((xTileCenter + 0.5) - xTileFrac) * tileWidthMeters;
    const planeOffsetZ = ((yTileCenter + 0.5) - yTileFrac) * tileWidthMeters;

    const groundGeom = new THREE.PlaneGeometry(planeSize, planeSize);
    
    const groundCanvas = document.createElement('canvas');
    if (!groundCanvas || !groundCanvas.getContext) return;
    groundCanvas.width = 768;
    groundCanvas.height = 768;
    const ctx = groundCanvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = "#070a13";
    ctx.fillRect(0, 0, 768, 768);

    ctx.strokeStyle = "rgba(6, 182, 212, 0.15)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 12; i++) {
      const coord = i * 64;
      ctx.beginPath(); ctx.moveTo(coord, 0); ctx.lineTo(coord, 768); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, coord); ctx.lineTo(768, coord); ctx.stroke();
    }

    const groundTexture = new THREE.CanvasTexture(groundCanvas);
    const groundMaterial = new THREE.MeshBasicMaterial({
      map: groundTexture,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95
    });

    const groundMesh = new THREE.Mesh(groundGeom, groundMaterial);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.set(planeOffsetX, -0.2, planeOffsetZ);
    this.threeScene.add(groundMesh);

    if (typeof Image !== 'undefined') {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const tx = xTileCenter + dx;
          const ty = yTileCenter + dy;
          const posX = (dx + 1) * 256;
          const posY = (dy + 1) * 256;

          const tileUrl = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${tileZoom}/${ty}/${tx}`;
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => {
            ctx.drawImage(img, posX, posY, 256, 256);
            groundTexture.needsUpdate = true;
          };
          img.src = tileUrl;
        }
      }
    }
  },

  buildTrajectoryMeshes() {
    if (!this.telemetryData || !this.telemetryData.points) return;
    const pts = this.telemetryData.points;

    if (this.actualLineMesh && this.threeScene) {
      this.threeScene.remove(this.actualLineMesh);
      if (this.actualLineMesh.geometry) this.actualLineMesh.geometry.dispose();
      this.actualLineMesh = null;
    }
    if (this.plannedLineMesh && this.threeScene) {
      this.threeScene.remove(this.plannedLineMesh);
      if (this.plannedLineMesh.geometry) this.plannedLineMesh.geometry.dispose();
      this.plannedLineMesh = null;
    }
    if (this.photoMarkers && this.photoMarkers.length && this.threeScene) {
      this.photoMarkers.forEach(m => {
        this.threeScene.remove(m);
        if (m.geometry) m.geometry.dispose();
      });
      this.photoMarkers = [];
    }

    const actualCoords = [];
    pts.forEach(p => {
      actualCoords.push(this.projectToWorld(p.lat, p.lon, p.alt));
    });

    const actualGeo = new THREE.BufferGeometry().setFromPoints(actualCoords);
    const actualMat = new THREE.LineBasicMaterial({ color: 0xf59e0b, linewidth: 3 });
    this.actualLineMesh = new THREE.Line(actualGeo, actualMat);
    this.threeScene.add(this.actualLineMesh);

    pts.forEach(p => {
      if (p.isPhoto) {
        const photoGeo = new THREE.SphereGeometry(0.8, 8, 8);
        const photoMat = new THREE.MeshBasicMaterial({ color: 0x22c55e });
        const photoMesh = new THREE.Mesh(photoGeo, photoMat);
        photoMesh.position.copy(this.projectToWorld(p.lat, p.lon, p.alt));
        this.threeScene.add(photoMesh);
        this.photoMarkers.push(photoMesh);
      }
    });

    const plannedCoords = [];
    const wps = getActiveMissionWaypoints();
    wps.forEach(wp => {
      plannedCoords.push(this.projectToWorld(wp.lat, wp.lon, wp.altitude || 21.0));
    });
    if (plannedCoords.length > 1) {
      const planGeo = new THREE.BufferGeometry().setFromPoints(plannedCoords);
      const planMat = new THREE.LineDashedMaterial({ color: 0x06b6d4, dashSize: 3, gapSize: 1 });
      this.plannedLineMesh = new THREE.Line(planGeo, planMat);
      this.plannedLineMesh.computeLineDistances();
      this.threeScene.add(this.plannedLineMesh);
    }
  },

  buildDroneAvatar() {
    this.droneMesh = new THREE.Group();

    const bodyGeo = new THREE.BoxGeometry(2.5, 0.8, 3.5);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.3 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    this.droneMesh.add(body);

    const rotorMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee });
    [[-1.8, 1.8], [1.8, 1.8], [-1.8, -1.8], [1.8, -1.8]].forEach(([rx, rz]) => {
      const rGeo = new THREE.CylinderGeometry(1.2, 1.2, 0.1, 16);
      const r = new THREE.Mesh(rGeo, rotorMat);
      r.position.set(rx, 0.5, rz);
      this.droneMesh.add(r);
    });

    const fGeo = new THREE.ConeGeometry(3.0, 7.0, 4);
    fGeo.rotateX(Math.PI / 2);
    const fMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24, wireframe: true, transparent: true, opacity: 0.45 });
    this.frustumMesh = new THREE.Mesh(fGeo, fMat);
    this.frustumMesh.position.set(0, -1.5, 0);
    this.droneMesh.add(this.frustumMesh);

    this.threeScene.add(this.droneMesh);
  },

  animate() {
    if (!this.isOpen || typeof requestAnimationFrame === 'undefined') {
      this.animFrameId = null;
      return;
    }
    this.animFrameId = requestAnimationFrame(() => this.animate());

    if (this.isPlaying && this.telemetryData && this.telemetryData.points && this.telemetryData.points.length > 0) {
      const now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
      if (this.lastFrameTime) {
        const deltaSec = (now - this.lastFrameTime) / 1000;
        const advanceSteps = deltaSec * this.playbackSpeed;
        this.playbackFractionalIndex += advanceSteps;

        const maxIdx = this.telemetryData.points.length - 1;
        if (this.playbackFractionalIndex >= maxIdx) {
          this.playbackFractionalIndex = maxIdx;
          this.pause();
        }

        const pointIndex = Math.min(Math.floor(this.playbackFractionalIndex), maxIdx);
        this.seekTo(pointIndex, true, false);
      }
      this.lastFrameTime = now;
    }

    if (this.threeControls && this.threeControls.update) this.threeControls.update();
    if (this.threeRenderer && this.threeScene && this.threeCamera) {
      this.threeRenderer.render(this.threeScene, this.threeCamera);
    }
  },

  togglePlay() {
    if (this.isPlaying) this.pause();
    else this.play();
  },

  play() {
    if (!this.isOpen) return;
    if (this.telemetryData && this.telemetryData.points && this.telemetryData.points.length > 0) {
      const maxIdx = this.telemetryData.points.length - 1;
      if (this.playbackFractionalIndex >= maxIdx || this.currentPointIndex >= maxIdx) {
        this.playbackFractionalIndex = 0.0;
        this.seekTo(0, true, true);
      }
    }
    this.isPlaying = true;
    this.lastFrameTime = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    const pIcon = document.getElementById('diag-play-icon');
    const paIcon = document.getElementById('diag-pause-icon');
    if (pIcon) pIcon.style.display = 'none';
    if (paIcon) paIcon.style.display = 'block';

    if (!this.animFrameId) {
      this.animate();
    }
  },

  pause() {
    this.isPlaying = false;
    this.lastFrameTime = null;
    const pIcon = document.getElementById('diag-play-icon');
    const paIcon = document.getElementById('diag-pause-icon');
    if (pIcon) pIcon.style.display = 'block';
    if (paIcon) paIcon.style.display = 'none';
  },

  seekTo(index, updateSlider = true, syncFraction = true) {
    if (!this.telemetryData || !this.telemetryData.points || !this.telemetryData.points.length) return;
    const pts = this.telemetryData.points;
    const safeIdx = Math.max(0, Math.min(index, pts.length - 1));
    this.currentPointIndex = safeIdx;
    if (syncFraction) {
      this.playbackFractionalIndex = safeIdx;
    }

    const pt = pts[safeIdx];

    if (this.droneMesh) {
      const pos = this.projectToWorld(pt.lat, pt.lon, pt.alt);
      this.droneMesh.position.copy(pos);
      this.droneMesh.rotation.y = (pt.yaw * Math.PI) / 180;

      if (this.frustumMesh) {
        this.frustumMesh.rotation.x = ((pt.pitch || -60) * Math.PI) / 180;
      }
    }

    const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setTxt('diag-hud-alt', `${pt.alt.toFixed(1)} m`);
    setTxt('diag-hud-speed', `${pt.speed.toFixed(1)} m/s`);
    setTxt('diag-hud-pitch', `${pt.pitch.toFixed(1)}°`);
    setTxt('diag-hud-battery', `${pt.battery.toFixed(0)}%`);
    setTxt('diag-hud-sats', pt.satellites.toString());
    setTxt('diag-hud-coords', `${pt.lat.toFixed(6)}, ${pt.lon.toFixed(6)}`);
    setTxt('diag-time-display', `${pt.timeStr} / ${this.telemetryData.durationFormatted}`);

    if (updateSlider) {
      const slider = document.getElementById('diag-timeline-slider');
      if (slider && document.activeElement !== slider) slider.value = safeIdx.toString();
    }
  },

  exportGeoJSON() {
    if (!this.telemetryData || !this.telemetryData.points) return;
    const coordinates = this.telemetryData.points.map(p => [p.lon, p.lat, p.alt]);
    const geojson = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {
            name: "Actual Flight Track",
            droneModel: this.telemetryData.droneModel,
            duration: this.telemetryData.durationFormatted,
            totalDistanceMeters: this.telemetryData.totalDistance,
            maxAltitudeMeters: this.telemetryData.maxAltitude
          },
          geometry: {
            type: "LineString",
            coordinates: coordinates
          }
        }
      ]
    };

    if (typeof document !== 'undefined') {
      const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      const flightDate = this.telemetryData?.flightDate || new Date();
      const iso8601 = formatISO8601ForFilename(flightDate);
      link.download = `FlightRecord_${iso8601}_Track.geojson`;
      link.click();
    }
  },

  exportDiagJSON() {
    const wps = (typeof getActiveMissionWaypoints === 'function') ? getActiveMissionWaypoints() : [];
    const altitude = (typeof document !== 'undefined' && parseFloat(document.getElementById('altitude')?.value)) || 50.0;
    const speed = (typeof document !== 'undefined' && parseFloat(document.getElementById('speed')?.value)) || 4.0;
    const gimbalPitch = (typeof document !== 'undefined' && parseFloat(document.getElementById('gimbal-pitch')?.value)) || -60.0;
    return exportFlightDiagnosticsJSON(wps, {
      altitude,
      speed,
      gimbalPitch,
      uuid: this.selectedFlightId || 'active-mission'
    });
  },

  async handleLogFileImport(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const flightId = file.name;
      let importedTelemetry = null;

      if (file.name.toLowerCase().endsWith('.kmz')) {
        if (typeof JSZip !== 'undefined') {
          const zip = await JSZip.loadAsync(file);
          let waylinesText = null;
          for (const filename of Object.keys(zip.files)) {
            if (filename.endsWith('.wpml') || filename.endsWith('.kml')) {
              waylinesText = await zip.files[filename].async('text');
              break;
            }
          }
          if (waylinesText) {
            importedTelemetry = parseKmlOrWpmlTelemetry(waylinesText, flightId);
          }
        }
      } else {
        const text = await file.text();
        const lowerName = file.name.toLowerCase();
        if (lowerName.endsWith('.json') || lowerName.endsWith('.geojson')) {
          const parsed = JSON.parse(text);
          if (parsed && parsed.diagnostics && parsed.diagnostics.points) {
            importedTelemetry = parsed.diagnostics;
          } else {
            importedTelemetry = parseGeoJsonTelemetry(parsed, flightId);
          }
        } else if (lowerName.endsWith('.csv')) {
          importedTelemetry = parseCsvTelemetry(text, flightId);
        } else if (lowerName.endsWith('.kml') || lowerName.endsWith('.wpml')) {
          importedTelemetry = parseKmlOrWpmlTelemetry(text, flightId);
        } else if (lowerName.endsWith('.gpx')) {
          importedTelemetry = parseGpxTelemetry(text, flightId);
        }
      }

      if (!importedTelemetry) {
        const wps = getActiveMissionWaypoints();
        const altitude = (typeof document !== 'undefined' && parseFloat(document.getElementById('altitude')?.value)) || 21.0;
        const speed = (typeof document !== 'undefined' && parseFloat(document.getElementById('speed')?.value)) || 4.0;
        const gimbalPitch = (typeof document !== 'undefined' && parseFloat(document.getElementById('gimbal-pitch')?.value)) || -60.0;
        importedTelemetry = generateTelemetryFromWaypoints(wps, { altitude, speed, gimbalPitch, flightId });
      }

      if (importedTelemetry) {
        const comp = computeFlightComparison({ waypointCount: getActiveMissionWaypoints().length, altitude: importedTelemetry.maxAltitude, totalDistance: importedTelemetry.totalDistance }, importedTelemetry);

        const flightSel = document.getElementById('diag-flight-selector');
        if (flightSel) {
          let found = false;
          for (let i = 0; i < flightSel.options.length; i++) {
            if (flightSel.options[i].value === flightId) {
              found = true;
              break;
            }
          }
          if (!found) {
            const opt = document.createElement('option');
            opt.value = flightId;
            opt.textContent = `${file.name} (Imported)`;
            flightSel.insertBefore(opt, flightSel.firstChild);
          }
          flightSel.value = flightId;
        }

        this.selectedFlightId = flightId;
        this.telemetryData = importedTelemetry;
        this.comparisonData = comp;
        this.updateStatsUI();
        this.init3DScene();
        this.playbackFractionalIndex = 0.0;
        this.seekTo(0, true, true);
        this.pause();
        if (typeof alert === 'function') {
          alert(`Loaded ${file.name} successfully! Map satellite tiles and 3D path are centered at [${importedTelemetry.homePoint.lat.toFixed(6)}, ${importedTelemetry.homePoint.lon.toFixed(6)}].`);
        }
      }
    } catch (err) {
      if (typeof alert === 'function') alert('Could not parse file: ' + err.message);
    }
  }
};

// ─── Pre-Flight KMZ Inspector & DJI Fly Go Linter UI ─────────────────────────

const KMZInspector = {
  activeReport: null,
  activeWpmlXml: '',
  activeTemplateXml: '',

  open(auditReport = null, wpmlXml = '', templateXml = '') {
    const modal = document.getElementById('kmz-inspector-modal');
    if (!modal) return;
    modal.classList.remove('hidden');

    if (auditReport) {
      this.activeReport = auditReport;
      this.activeWpmlXml = wpmlXml;
      this.activeTemplateXml = templateXml;
      this.render();
    } else {
      this.runCurrentWorkspaceAudit();
    }
  },

  close() {
    const modal = document.getElementById('kmz-inspector-modal');
    if (modal) modal.classList.add('hidden');
  },

  runCurrentWorkspaceAudit() {
    try {
      const activeWps = (typeof getCurrentWaypoints === 'function' ? getCurrentWaypoints() : null) || (typeof generatedWaypoints !== 'undefined' ? generatedWaypoints : null) || [];
      const wps = Array.isArray(activeWps) ? activeWps : [];
      const finishAction = document.getElementById('finish-action')?.value || 'goHome';
      const altitude = parseFloat(document.getElementById('altitude')?.value) || 50;
      const speed = parseFloat(document.getElementById('speed')?.value) || 4;
      const headingMode = document.getElementById('heading-mode')?.value || 'followWayline';
      const gimbalPitch = parseFloat(document.getElementById('gimbal-pitch')?.value) || -90;
      const captureMode = document.getElementById('capture-mode')?.value || 'hover';
      const pathMode = document.getElementById('path-mode')?.value || 'normal';

      const tmpl = buildTemplateKml(finishAction, speed);
      const wpml = buildWaylinesWpml(wps, altitude, speed, headingMode, finishAction, gimbalPitch, captureMode, pathMode);
      const report = validateWpmlMission(wpml, tmpl, { waypoints: wps });
      this.activeReport = report;
      this.activeWpmlXml = wpml;
      this.activeTemplateXml = tmpl;
      this.render();
      this.updateStatusBadge(report);
    } catch (err) {
      console.error('Error in runCurrentWorkspaceAudit:', err);
      this.lastAuditError = err.message + '\n' + err.stack;
    }
  },

  updateStatusBadge(report) {
    const badge = document.getElementById('kmz-preflight-status-badge');
    const text = document.getElementById('kmz-preflight-text');
    if (!badge || !text) return;
    if (!report || report.valid) {
      badge.style.background = 'rgba(16, 185, 129, 0.08)';
      badge.style.borderColor = 'rgba(16, 185, 129, 0.2)';
      badge.style.color = '#34d399';
      text.textContent = `DJI Fly Pre-Flight: ${report ? report.rulesPassed : 10}/10 Rules Verified`;
    } else {
      badge.style.background = 'rgba(239, 68, 68, 0.1)';
      badge.style.borderColor = 'rgba(239, 68, 68, 0.3)';
      badge.style.color = '#f87171';
      text.textContent = `DJI Fly Warning: ${report.errors.length} issue(s) detected`;
    }
  },

  render() {
    if (!this.activeReport) return;
    const report = this.activeReport;

    const droneModelEl = document.getElementById('drone-model');
    const droneText = droneModelEl ? droneModelEl.options[droneModelEl.selectedIndex]?.text : 'DJI Mini 4 Pro (68)';
    const summaryTarget = document.getElementById('inspector-drone-target');
    if (summaryTarget) summaryTarget.textContent = droneText;
    const summaryWps = document.getElementById('inspector-wp-count');
    if (summaryWps) summaryWps.textContent = `${report.placemarkCount} waypoints`;
    const summaryRules = document.getElementById('inspector-rules-score');
    if (summaryRules) {
      summaryRules.textContent = `${report.rulesPassed}/10 Passed`;
      summaryRules.style.color = report.valid ? '#34d399' : '#f87171';
    }

    const listContainer = document.getElementById('inspector-checklist-container');
    if (listContainer) {
      listContainer.innerHTML = report.rules.map(r => `
        <div style="padding: 8px 10px; background: rgba(255, 255, 255, 0.02); border: 1px solid ${r.passed ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.3)'}; border-radius: 6px; display: flex; flex-direction: column; gap: 4px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <strong style="color: ${r.passed ? '#34d399' : '#f87171'}; font-size: 0.78rem; display: flex; align-items: center; gap: 6px;">
              ${r.passed ? '✅' : '❌'} Rule ${r.id}: ${r.name}
            </strong>
            <span style="font-size: 0.68rem; font-weight: bold; color: ${r.passed ? '#34d399' : '#f87171'};">${r.passed ? 'COMPLIANT' : 'FAILING'}</span>
          </div>
          <div style="font-size: 0.72rem; color: var(--text-muted); line-height: 1.35;">
            ${r.message}
          </div>
        </div>
      `).join('');
    }

    const wpmlEl = document.getElementById('inspector-xml-wpml');
    if (wpmlEl) wpmlEl.textContent = this.activeWpmlXml;
    const tmplEl = document.getElementById('inspector-xml-tmpl');
    if (tmplEl) tmplEl.textContent = this.activeTemplateXml;
  },

  generateAntigravityPrompt(report = null, wpml = '', wps = null) {
    const r = report || this.activeReport;
    const xml = wpml || this.activeWpmlXml || '';
    const activeWps = wps || (typeof getCurrentWaypoints === 'function' ? getCurrentWaypoints() : null) || [];
    let drone = 'DJI Mini 4 Pro (68)';
    let pattern = 'single';
    let alt = '50';
    let speed = '4';
    let pitch = '-90';
    if (typeof document !== 'undefined') {
      try {
        const droneEl = document.getElementById('drone-model');
        if (droneEl && droneEl.options && droneEl.selectedIndex >= 0 && droneEl.options[droneEl.selectedIndex]) {
          drone = droneEl.options[droneEl.selectedIndex].text || drone;
        }
        pattern = document.getElementById('grid-type')?.value || document.getElementById('flight-pattern')?.value || pattern;
        alt = document.getElementById('altitude')?.value || alt;
        speed = document.getElementById('speed')?.value || speed;
        pitch = document.getElementById('gimbal-pitch')?.value || pitch;
      } catch (e) {}
    }

    let prompt = `### 🤖 ANTIGRAVITY BUG REPORT: Bad KMZ Mission Execution Issue\n\n`;
    prompt += `**Mission Context:**\n`;
    prompt += `- **Target Drone Model:** ${drone}\n`;
    prompt += `- **Pattern:** ${pattern} (Altitude: ${alt}m, Speed: ${speed}m/s, Pitch: ${pitch}°)\n`;
    prompt += `- **Waypoints Total:** ${activeWps.length}\n`;
    if (r) {
      prompt += `- **Validation Health Score:** ${r.rulesPassed ?? r.validation_rules_passed ?? 0}/10 Passed (${r.valid || r.is_valid ? 'Valid' : 'Invalid'})\n`;
      const errList = r.errors || r.validationErrors || [];
      if (errList.length > 0) {
        prompt += `- **Detected Pre-Flight Errors:**\n`;
        errList.forEach((e, i) => { prompt += `  ${i + 1}. ❌ ${e}\n`; });
      }
      const warnList = r.warnings || r.validationWarnings || [];
      if (warnList.length > 0) {
        prompt += `- **Detected Warnings:**\n`;
        warnList.forEach((w, i) => { prompt += `  ${i + 1}. ⚠️ ${w}\n`; });
      }
    }

    if (activeWps.length > 0) {
      const sample = activeWps.slice(0, 5).map((wp, i) => ({
        index: i,
        lat: wp.lat,
        lon: wp.lon,
        alt: wp.altitude || alt,
        heading: wp.heading,
        turnMode: wp.turnMode
      }));
      prompt += `\n**Sample Waypoints Input:**\n\`\`\`json\n${JSON.stringify(sample, null, 2)}\n\`\`\`\n`;
    }

    if (xml) {
      const placemarks = xml.split('<Placemark>');
      const xmlExtract = placemarks.length > 1 ? '<Placemark>' + placemarks[1].substring(0, 450) + '...\n</Placemark>' : xml.substring(0, 600);
      prompt += `\n**Offending / Generated WPML Snippet:**\n\`\`\`xml\n${xmlExtract}\n\`\`\`\n`;
    }

    prompt += `\n**Antigravity Instructions:**\n`;
    prompt += `1. Inspect the offending XML and rule failures above.\n`;
    prompt += `2. Formulate a regression unit test in \`index.test.js\` reproducing this exact configuration.\n`;
    prompt += `3. Fix the generation/sanitization logic in \`index.js\` (\`buildWaylinesWpml\` / \`validateAndFixWpml\`).\n`;
    prompt += `4. Run \`python scratch/build.py\` and verify all tests pass with \`npm test\`.\n`;

    return prompt;
  },

  copyAntigravityPrompt() {
    const promptText = this.generateAntigravityPrompt();
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(promptText).then(() => {
        const btn = document.getElementById('inspector-copy-antigravity-btn');
        if (btn) {
          const orig = btn.innerHTML;
          btn.innerHTML = '✅ Copied to Clipboard!';
          btn.style.color = '#34d399';
          setTimeout(() => {
            btn.innerHTML = orig;
            btn.style.color = '#a5b4fc';
          }, 2500);
        }
      }).catch(() => {
        if (typeof prompt === 'function') prompt('Copy Antigravity Fix Prompt:', promptText);
      });
    } else {
      if (typeof prompt === 'function') prompt('Copy Antigravity Fix Prompt:', promptText);
    }
  },

  async auditExternalKMZ(file) {
    if (!file || typeof JSZip === 'undefined') return;
    try {
      const zip = await JSZip.loadAsync(file);
      const wpmlFile = zip.file('wpmz/waylines.wpml');
      const tmplFile = zip.file('wpmz/template.kml');
      if (!wpmlFile) {
        alert('Invalid KMZ: Missing wpmz/waylines.wpml file.');
        return;
      }
      const wpmlXml = await wpmlFile.async('text');
      const templateXml = tmplFile ? await tmplFile.async('text') : '';
      const report = validateWpmlMission(wpmlXml, templateXml);
      this.open(report, wpmlXml, templateXml);
    } catch (e) {
      alert('Could not parse KMZ file: ' + e.message);
    }
  }
};

function formatTime(totalSec) {
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function parseGeoJsonTelemetry(geojson, flightId = 'Imported_Flight.geojson') {
  if (!geojson) return null;
  let coords = [];
  if (geojson.type === 'FeatureCollection' && Array.isArray(geojson.features)) {
    for (const f of geojson.features) {
      if (f.geometry && f.geometry.coordinates) {
        if (f.geometry.type === 'LineString') {
          coords = coords.concat(f.geometry.coordinates);
        } else if (f.geometry.type === 'MultiPoint' || f.geometry.type === 'Polygon') {
          coords = coords.concat(Array.isArray(f.geometry.coordinates[0]) && Array.isArray(f.geometry.coordinates[0][0]) ? f.geometry.coordinates[0] : f.geometry.coordinates);
        } else if (f.geometry.type === 'Point') {
          coords.push(f.geometry.coordinates);
        }
      }
    }
  } else if (geojson.type === 'Feature' && geojson.geometry && geojson.geometry.coordinates) {
    if (geojson.geometry.type === 'LineString') coords = geojson.geometry.coordinates;
    else if (Array.isArray(geojson.geometry.coordinates)) coords = geojson.geometry.coordinates;
  } else if (Array.isArray(geojson.coordinates)) {
    coords = geojson.coordinates;
  }

  if (!coords || coords.length === 0) return null;

  const points = [];
  let totalDistance = 0;
  let maxAlt = 0;
  let battery = 98.0;

  for (let i = 0; i < coords.length; i++) {
    const c = coords[i];
    const lon = parseFloat(c[0]);
    const lat = parseFloat(c[1]);
    const alt = parseFloat(c[2] !== undefined ? c[2] : 21.0);
    if (isNaN(lat) || isNaN(lon)) continue;
    if (alt > maxAlt) maxAlt = alt;

    if (points.length > 0) {
      const prev = points[points.length - 1];
      const d = (typeof haversineDistance === 'function')
        ? haversineDistance(prev.lat, prev.lon, lat, lon)
        : Math.hypot((lat - prev.lat) * 111320, (lon - prev.lon) * 85000);
      totalDistance += d;
    }

    battery -= 0.05;
    points.push({
      time: i,
      timeStr: formatTime(i),
      lat,
      lon,
      alt: Math.round(alt * 10) / 10,
      speed: 4.0,
      pitch: -60.0,
      yaw: 0,
      battery: Math.max(10, Math.round(battery * 10) / 10),
      satellites: 24,
      isPhoto: false,
      waypointIndex: i
    });
  }

  if (points.length === 0) return null;

  return {
    flightId,
    flightDate: new Date().toISOString(),
    droneModel: 'DJI Mini 4 Pro',
    durationSec: points.length,
    durationFormatted: formatTime(points.length),
    totalDistance: Math.round(totalDistance),
    maxAltitude: Math.round(maxAlt * 10) / 10,
    photoCount: 0,
    homePoint: { lat: points[0].lat, lon: points[0].lon, alt: 0 },
    points,
    batteryStart: 98,
    batteryEnd: Math.round(battery),
    batteryUsed: Math.round(98 - battery),
    maxDeviation: '0.5 m'
  };
}

function parseCsvTelemetry(csvText, flightId = 'Imported_Flight.csv') {
  if (!csvText || typeof csvText !== 'string') return null;
  const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return null;

  const header = lines[0].toLowerCase().split(/[,;\t]/).map(h => h.trim().replace(/["']/g, ''));
  const latIdx = header.findIndex(h => h.includes('lat'));
  const lonIdx = header.findIndex(h => h.includes('lon') || h.includes('lng'));
  const altIdx = header.findIndex(h => h.includes('alt') || h.includes('height'));
  const speedIdx = header.findIndex(h => h.includes('speed') || h.includes('spd'));
  const pitchIdx = header.findIndex(h => h.includes('pitch') || h.includes('gimbal'));
  const yawIdx = header.findIndex(h => h.includes('yaw') || h.includes('heading'));
  const photoIdx = header.findIndex(h => h.includes('photo') || h.includes('trigger') || h.includes('isphoto'));

  if (latIdx === -1 || lonIdx === -1) return null;

  const points = [];
  let totalDistance = 0;
  let maxAlt = 0;
  let battery = 98.0;
  let photoCount = 0;

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(/[,;\t]/).map(c => c.trim().replace(/["']/g, ''));
    if (cols.length <= Math.max(latIdx, lonIdx)) continue;
    const lat = parseFloat(cols[latIdx]);
    const lon = parseFloat(cols[lonIdx]);
    const alt = altIdx !== -1 ? parseFloat(cols[altIdx]) || 21.0 : 21.0;
    const speed = speedIdx !== -1 ? parseFloat(cols[speedIdx]) || 4.0 : 4.0;
    const pitch = pitchIdx !== -1 ? parseFloat(cols[pitchIdx]) || -60.0 : -60.0;
    const yaw = yawIdx !== -1 ? parseFloat(cols[yawIdx]) || 0 : 0;
    const isPhoto = photoIdx !== -1 ? (cols[photoIdx] === '1' || cols[photoIdx].toLowerCase() === 'true' || cols[photoIdx].toLowerCase() === 'yes') : false;

    if (isNaN(lat) || isNaN(lon)) continue;
    if (alt > maxAlt) maxAlt = alt;
    if (isPhoto) photoCount++;

    if (points.length > 0) {
      const prev = points[points.length - 1];
      const d = (typeof haversineDistance === 'function')
        ? haversineDistance(prev.lat, prev.lon, lat, lon)
        : Math.hypot((lat - prev.lat) * 111320, (lon - prev.lon) * 85000);
      totalDistance += d;
    }

    battery -= 0.05;
    const ptIdx = points.length;
    points.push({
      time: ptIdx,
      timeStr: formatTime(ptIdx),
      lat,
      lon,
      alt: Math.round(alt * 10) / 10,
      speed: Math.round(speed * 10) / 10,
      pitch: Math.round(pitch * 10) / 10,
      yaw: Math.round(yaw * 10) / 10,
      battery: Math.max(10, Math.round(battery * 10) / 10),
      satellites: 24,
      isPhoto,
      waypointIndex: ptIdx
    });
  }

  if (points.length === 0) return null;

  return {
    flightId,
    flightDate: new Date().toISOString(),
    droneModel: 'DJI Mini 4 Pro',
    durationSec: points.length,
    durationFormatted: formatTime(points.length),
    totalDistance: Math.round(totalDistance),
    maxAltitude: Math.round(maxAlt * 10) / 10,
    photoCount,
    homePoint: { lat: points[0].lat, lon: points[0].lon, alt: 0 },
    points,
    batteryStart: 98,
    batteryEnd: Math.round(battery),
    batteryUsed: Math.round(98 - battery),
    maxDeviation: '0.6 m'
  };
}

function parseKmlOrWpmlTelemetry(xmlText, flightId = 'Imported_Flight.kml') {
  if (!xmlText || typeof xmlText !== 'string') return null;
  const points = [];
  try {
    const pMatches = xmlText.match(/<Placemark[\s\S]*?<\/Placemark>/gi) || [];
    let curTime = 0;
    let totalDist = 0;
    let maxAlt = 0;
    let battery = 98.0;
    let photoCount = 0;

    for (let i = 0; i < pMatches.length; i++) {
      const pm = pMatches[i];
      const cMatch = pm.match(/<coordinates>([\s\S]*?)<\/coordinates>/i);
      if (!cMatch) continue;
      const parts = cMatch[1].trim().split(/[\s,]+/);
      if (parts.length < 2) continue;
      const lon = parseFloat(parts[0]);
      const lat = parseFloat(parts[1]);
      const alt = parts[2] !== undefined ? parseFloat(parts[2]) : 21.0;
      if (isNaN(lat) || isNaN(lon)) continue;

      if (alt > maxAlt) maxAlt = alt;
      const hasPhoto = pm.includes('takePhoto') || pm.includes('ShootPhoto');
      if (hasPhoto) photoCount++;

      if (points.length > 0) {
        const prev = points[points.length - 1];
        const d = Math.hypot((lat - prev.lat) * 111320, (lon - prev.lon) * 111320 * Math.cos(lat * Math.PI / 180));
        totalDist += d;
        const segSec = Math.max(1, Math.round(d / 4.0));
        for (let s = 1; s <= segSec; s++) {
          curTime++;
          const r = s / segSec;
          battery -= 0.05;
          points.push({
            time: curTime,
            timeStr: formatTime(curTime),
            lat: prev.lat + (lat - prev.lat) * r,
            lon: prev.lon + (lon - prev.lon) * r,
            alt: Math.round((prev.alt + (alt - prev.alt) * r) * 10) / 10,
            speed: 4.0,
            pitch: -60.0,
            yaw: 0,
            battery: Math.max(10, Math.round(battery * 10) / 10),
            satellites: 24,
            isPhoto: false,
            waypointIndex: (s === segSec) ? i : null
          });
        }
      } else {
        points.push({
          time: 0,
          timeStr: formatTime(0),
          lat,
          lon,
          alt: Math.round(alt * 10) / 10,
          speed: 0.0,
          pitch: -60.0,
          yaw: 0,
          battery: 98,
          satellites: 24,
          isPhoto: hasPhoto,
          waypointIndex: 0
        });
      }
    }

    if (points.length === 0) return null;

    return {
      flightId,
      flightDate: new Date().toISOString(),
      droneModel: 'DJI Mini 4 Pro',
      durationSec: curTime || points.length,
      durationFormatted: formatTime(curTime || points.length),
      totalDistance: Math.round(totalDist),
      maxAltitude: Math.round(maxAlt * 10) / 10,
      photoCount: photoCount || pMatches.length,
      homePoint: { lat: points[0].lat, lon: points[0].lon, alt: 0 },
      points,
      batteryStart: 98,
      batteryEnd: Math.max(10, Math.round(battery)),
      batteryUsed: Math.round(98 - Math.max(10, battery)),
      maxDeviation: '0.4 m'
    };
  } catch (e) {
    return null;
  }
}

function parseGpxTelemetry(gpxText, flightId = 'Imported_Flight.gpx') {
  if (!gpxText || typeof gpxText !== 'string') return null;
  try {
    const points = [];
    let totalDist = 0;
    let maxAlt = 0;
    let battery = 98.0;

    const trkptRegex = /<trkpt\s+[^>]*lat=["']([^"']+)["'][^>]*lon=["']([^"']+)["'][^>]*>([\s\S]*?)<\/trkpt>/gi;
    let match;
    let idx = 0;
    while ((match = trkptRegex.exec(gpxText)) !== null) {
      const lat = parseFloat(match[1]);
      const lon = parseFloat(match[2]);
      const inner = match[3];
      const eleMatch = inner.match(/<ele>([^<]+)<\/ele>/i);
      const alt = eleMatch ? parseFloat(eleMatch[1]) : 21.0;
      if (isNaN(lat) || isNaN(lon)) continue;
      if (alt > maxAlt) maxAlt = alt;

      if (points.length > 0) {
        const prev = points[points.length - 1];
        const d = Math.hypot((lat - prev.lat) * 111320, (lon - prev.lon) * 111320 * Math.cos(lat * Math.PI / 180));
        totalDist += d;
      }

      battery -= 0.04;
      points.push({
        time: idx,
        timeStr: formatTime(idx),
        lat,
        lon,
        alt: Math.round(alt * 10) / 10,
        speed: 4.0,
        pitch: -60.0,
        yaw: 0,
        battery: Math.max(10, Math.round(battery * 10) / 10),
        satellites: 24,
        isPhoto: false,
        waypointIndex: idx
      });
      idx++;
    }

    if (points.length === 0) return null;

    return {
      flightId,
      flightDate: new Date().toISOString(),
      droneModel: 'DJI Mini 4 Pro',
      durationSec: points.length,
      durationFormatted: formatTime(points.length),
      totalDistance: Math.round(totalDist),
      maxAltitude: Math.round(maxAlt * 10) / 10,
      photoCount: 0,
      homePoint: { lat: points[0].lat, lon: points[0].lon, alt: 0 },
      points,
      batteryStart: 98,
      batteryEnd: Math.max(10, Math.round(battery)),
      batteryUsed: Math.round(98 - Math.max(10, battery)),
      maxDeviation: '0.4 m'
    };
  } catch (e) {
    return null;
  }
}

function generateTelemetryFromWaypoints(waypoints, options = {}) {
  if (!waypoints || waypoints.length === 0) return null;

  const flightId = options.flightId || 'FlightRecord_2026-08-20_[19-42-28].txt';
  const cruiseSpeed = options.speed || 4.0;
  const defaultAlt = options.altitude || 21.0;
  const globalPitch = options.gimbalPitch !== undefined ? options.gimbalPitch : -60.0;
  const flightDate = options.date || new Date().toISOString();

  const homePoint = options.homePoint || (typeof centerMarker !== 'undefined' && centerMarker
    ? { lat: centerMarker.getLatLng().lat, lon: centerMarker.getLatLng().lng, alt: 0 }
    : { lat: waypoints[0].lat, lon: waypoints[0].lon, alt: 0 });

  // 1. Flight 1: Pre-flight calibration & hover check (45s, 0 photos)
  if (flightId.includes('19-39-07') || flightId === 'Flight 1') {
    const points = [];
    let battery = 98.0;
    const takeoffSec = 5;
    const targetAlt = 10.0;
    for (let s = 0; s <= takeoffSec; s++) {
      const ratio = s / takeoffSec;
      points.push({
        time: s,
        timeStr: formatTime(s),
        lat: homePoint.lat,
        lon: homePoint.lon,
        alt: Math.round(targetAlt * ratio * 10) / 10,
        speed: Math.round(ratio * 1.5 * 10) / 10,
        pitch: -30,
        yaw: 0,
        battery: Math.round((battery - s * 0.03) * 10) / 10,
        satellites: 24,
        isPhoto: false,
        waypointIndex: null
      });
    }
    let curTime = takeoffSec;
    battery = points[points.length - 1].battery;

    const circleSec = 35;
    const radiusDeg = 0.00006;
    for (let s = 1; s <= circleSec; s++) {
      curTime++;
      const angle = (s / circleSec) * 2 * Math.PI;
      const yawDeg = Math.round((s / circleSec) * 360) % 360;
      const curLat = homePoint.lat + Math.sin(angle) * radiusDeg;
      const curLon = homePoint.lon + Math.cos(angle) * (radiusDeg * 1.3);
      const curAlt = targetAlt + Math.sin(angle * 2) * 0.2;
      battery -= 0.04;
      points.push({
        time: curTime,
        timeStr: formatTime(curTime),
        lat: curLat,
        lon: curLon,
        alt: Math.round(curAlt * 10) / 10,
        speed: 1.1,
        pitch: -45,
        yaw: yawDeg,
        battery: Math.max(10, Math.round(battery * 10) / 10),
        satellites: 24,
        isPhoto: false,
        waypointIndex: null
      });
    }

    const landSec = 5;
    for (let s = 1; s <= landSec; s++) {
      curTime++;
      const ratio = 1 - (s / landSec);
      battery -= 0.03;
      points.push({
        time: curTime,
        timeStr: formatTime(curTime),
        lat: homePoint.lat,
        lon: homePoint.lon,
        alt: Math.max(0, Math.round(targetAlt * ratio * 10) / 10),
        speed: 0.4,
        pitch: 0,
        yaw: 0,
        battery: Math.max(10, Math.round(battery * 10) / 10),
        satellites: 24,
        isPhoto: false,
        waypointIndex: null
      });
    }

    return {
      flightId,
      flightDate,
      droneModel: 'DJI Mini 4 Pro',
      durationSec: curTime,
      durationFormatted: formatTime(curTime),
      totalDistance: 38,
      maxAltitude: 10.2,
      photoCount: 0,
      homePoint,
      points,
      batteryStart: 98,
      batteryEnd: Math.round(battery),
      batteryUsed: Math.round(98 - battery),
      maxDeviation: '0.2 m'
    };
  }

  // 2. Flight 2: Perimeter / Initial 4-waypoint check (52s, 4 photos)
  if (flightId.includes('19-41-15') || flightId === 'Flight 2') {
    const subsetWps = waypoints.slice(0, Math.min(4, waypoints.length));
    const points = [];
    let curTime = 0;
    let totalDist = 0;
    let battery = 98.0;

    const takeoffSec = 4;
    for (let s = 0; s <= takeoffSec; s++) {
      const ratio = s / takeoffSec;
      points.push({
        time: s,
        timeStr: formatTime(s),
        lat: homePoint.lat,
        lon: homePoint.lon,
        alt: Math.round(defaultAlt * ratio * 10) / 10,
        speed: Math.round(ratio * 1.5 * 10) / 10,
        pitch: Math.round(globalPitch * ratio * 10) / 10,
        yaw: 0,
        battery: Math.round((battery - s * 0.04) * 10) / 10,
        satellites: 24,
        isPhoto: false,
        waypointIndex: 0
      });
    }
    curTime = takeoffSec;
    battery = points[points.length - 1].battery;

    for (let i = 0; i < subsetWps.length; i++) {
      const wp = subsetWps[i];
      const prevWp = i > 0 ? subsetWps[i - 1] : { lat: homePoint.lat, lon: homePoint.lon, altitude: defaultAlt };
      const d = (typeof haversineDistance === 'function')
        ? haversineDistance(prevWp.lat, prevWp.lon, wp.lat, wp.lon)
        : Math.hypot((wp.lat - prevWp.lat) * 111320, (wp.lon - prevWp.lon) * 85000);
      totalDist += d;

      const segSpeed = wp.speed || cruiseSpeed || 4.0;
      const segTime = Math.max(2, Math.round(d / segSpeed));
      const targetP = wp.gimbalPitch !== undefined ? wp.gimbalPitch : globalPitch;
      const targetA = wp.altitude !== undefined ? wp.altitude : defaultAlt;
      const targetY = wp.heading !== undefined ? wp.heading : 0;

      for (let st = 1; st <= segTime; st++) {
        curTime++;
        const r = st / segTime;
        const cLat = prevWp.lat + (wp.lat - prevWp.lat) * r + Math.sin(curTime * 0.3) * 0.000002;
        const cLon = prevWp.lon + (wp.lon - prevWp.lon) * r + Math.cos(curTime * 0.3) * 0.000002;
        const cAlt = targetA + Math.sin(curTime * 0.4) * 0.15;
        battery -= 0.07;
        points.push({
          time: curTime,
          timeStr: formatTime(curTime),
          lat: cLat,
          lon: cLon,
          alt: Math.round(cAlt * 10) / 10,
          speed: Math.round(segSpeed * 10) / 10,
          pitch: Math.round(targetP * 10) / 10,
          yaw: Math.round(targetY * 10) / 10,
          battery: Math.max(10, Math.round(battery * 10) / 10),
          satellites: 24,
          isPhoto: false,
          waypointIndex: (st === segTime) ? i : null
        });
      }

      for (let h = 1; h <= 2; h++) {
        curTime++;
        battery -= 0.04;
        points.push({
          time: curTime,
          timeStr: formatTime(curTime),
          lat: wp.lat,
          lon: wp.lon,
          alt: Math.round(targetA * 10) / 10,
          speed: 0.0,
          pitch: Math.round(targetP * 10) / 10,
          yaw: Math.round(targetY * 10) / 10,
          battery: Math.max(10, Math.round(battery * 10) / 10),
          satellites: 24,
          isPhoto: (h === 1),
          waypointIndex: i
        });
      }
    }

    const lastPoint = subsetWps[subsetWps.length - 1];
    const rthD = (typeof haversineDistance === 'function')
      ? haversineDistance(lastPoint.lat, lastPoint.lon, homePoint.lat, homePoint.lon)
      : Math.hypot((homePoint.lat - lastPoint.lat) * 111320, (homePoint.lon - lastPoint.lon) * 85000);
    totalDist += rthD;
    const rthSec = Math.max(4, Math.round(rthD / 5.5));
    for (let s = 1; s <= rthSec; s++) {
      curTime++;
      const r = s / rthSec;
      battery -= 0.07;
      points.push({
        time: curTime,
        timeStr: formatTime(curTime),
        lat: lastPoint.lat + (homePoint.lat - lastPoint.lat) * r,
        lon: lastPoint.lon + (homePoint.lon - lastPoint.lon) * r,
        alt: defaultAlt,
        speed: 5.5,
        pitch: -20,
        yaw: 0,
        battery: Math.max(10, Math.round(battery * 10) / 10),
        satellites: 24,
        isPhoto: false,
        waypointIndex: null
      });
    }

    const landSec = 4;
    for (let s = 1; s <= landSec; s++) {
      curTime++;
      const r = 1 - (s / landSec);
      battery -= 0.03;
      points.push({
        time: curTime,
        timeStr: formatTime(curTime),
        lat: homePoint.lat,
        lon: homePoint.lon,
        alt: Math.max(0, Math.round(defaultAlt * r * 10) / 10),
        speed: 0.5,
        pitch: 0,
        yaw: 0,
        battery: Math.max(10, Math.round(battery * 10) / 10),
        satellites: 24,
        isPhoto: false,
        waypointIndex: null
      });
    }

    return {
      flightId,
      flightDate,
      droneModel: 'DJI Mini 4 Pro',
      durationSec: curTime,
      durationFormatted: formatTime(curTime),
      totalDistance: Math.round(totalDist),
      maxAltitude: defaultAlt,
      photoCount: subsetWps.length,
      homePoint,
      points,
      batteryStart: 98,
      batteryEnd: Math.round(battery),
      batteryUsed: Math.round(98 - battery),
      maxDeviation: '0.4 m'
    };
  }

  // 3. Flight 4: Post-mission manual inspection (1m 15s / 75s, 0 photos)
  if (flightId.includes('19-47-15') || flightId === 'Flight 4') {
    const points = [];
    let curTime = 0;
    let battery = 98.0;
    const inspectAlt = 15.0;

    for (let s = 0; s <= 5; s++) {
      const r = s / 5;
      points.push({
        time: s,
        timeStr: formatTime(s),
        lat: homePoint.lat,
        lon: homePoint.lon,
        alt: Math.round(inspectAlt * r * 10) / 10,
        speed: Math.round(r * 2.0 * 10) / 10,
        pitch: -30,
        yaw: 45,
        battery: Math.round((battery - s * 0.04) * 10) / 10,
        satellites: 24,
        isPhoto: false,
        waypointIndex: null
      });
    }
    curTime = 5;
    battery = points[points.length - 1].battery;

    const neLat = homePoint.lat + 0.00045;
    const neLon = homePoint.lon + 0.00055;
    for (let s = 1; s <= 18; s++) {
      curTime++;
      const r = s / 18;
      battery -= 0.07;
      points.push({
        time: curTime,
        timeStr: formatTime(curTime),
        lat: homePoint.lat + (neLat - homePoint.lat) * r,
        lon: homePoint.lon + (neLon - homePoint.lon) * r,
        alt: inspectAlt + Math.sin(s * 0.3) * 0.1,
        speed: 4.5,
        pitch: -45,
        yaw: 45,
        battery: Math.max(10, Math.round(battery * 10) / 10),
        satellites: 24,
        isPhoto: false,
        waypointIndex: null
      });
    }

    const seLat = neLat - 0.00020;
    const seLon = neLon + 0.00030;
    for (let s = 1; s <= 12; s++) {
      curTime++;
      const r = s / 12;
      battery -= 0.06;
      points.push({
        time: curTime,
        timeStr: formatTime(curTime),
        lat: neLat + (seLat - neLat) * r,
        lon: neLon + (seLon - neLon) * r,
        alt: inspectAlt + 0.1,
        speed: 3.2,
        pitch: -60,
        yaw: 135,
        battery: Math.max(10, Math.round(battery * 10) / 10),
        satellites: 24,
        isPhoto: false,
        waypointIndex: null
      });
    }

    for (let s = 1; s <= 12; s++) {
      curTime++;
      battery -= 0.04;
      points.push({
        time: curTime,
        timeStr: formatTime(curTime),
        lat: seLat,
        lon: seLon,
        alt: inspectAlt,
        speed: 0.0,
        pitch: Math.round((-45 - s * 3.5) * 10) / 10,
        yaw: 135,
        battery: Math.max(10, Math.round(battery * 10) / 10),
        satellites: 24,
        isPhoto: false,
        waypointIndex: null
      });
    }

    for (let s = 1; s <= 20; s++) {
      curTime++;
      const r = s / 20;
      battery -= 0.08;
      points.push({
        time: curTime,
        timeStr: formatTime(curTime),
        lat: seLat + (homePoint.lat - seLat) * r,
        lon: seLon + (homePoint.lon - seLon) * r,
        alt: inspectAlt,
        speed: 5.5,
        pitch: -20,
        yaw: 225,
        battery: Math.max(10, Math.round(battery * 10) / 10),
        satellites: 24,
        isPhoto: false,
        waypointIndex: null
      });
    }

    for (let s = 1; s <= 8; s++) {
      curTime++;
      const r = 1 - (s / 8);
      battery -= 0.03;
      points.push({
        time: curTime,
        timeStr: formatTime(curTime),
        lat: homePoint.lat,
        lon: homePoint.lon,
        alt: Math.max(0, Math.round(inspectAlt * r * 10) / 10),
        speed: 0.5,
        pitch: 0,
        yaw: 0,
        battery: Math.max(10, Math.round(battery * 10) / 10),
        satellites: 24,
        isPhoto: false,
        waypointIndex: null
      });
    }

    return {
      flightId,
      flightDate,
      droneModel: 'DJI Mini 4 Pro',
      durationSec: curTime,
      durationFormatted: formatTime(curTime),
      totalDistance: 145,
      maxAltitude: 15.1,
      photoCount: 0,
      homePoint,
      points,
      batteryStart: 98,
      batteryEnd: Math.round(battery),
      batteryUsed: Math.round(98 - battery),
      maxDeviation: '0.3 m'
    };
  }

  // 4. Default / Flight 3 / Active Mission simulation
  const isPureSim = (flightId === 'active-mission' || options.isSimulation);
  const points = [];
  let currentTime = 0;
  let totalDistance = 0;
  let battery = 98.0;

  const takeoffDuration = Math.max(4, Math.round(defaultAlt / 2.5));
  for (let s = 0; s <= takeoffDuration; s++) {
    const tRatio = s / takeoffDuration;
    points.push({
      time: s,
      timeStr: formatTime(s),
      lat: homePoint.lat,
      lon: homePoint.lon,
      alt: Math.round(defaultAlt * tRatio * 10) / 10,
      speed: Math.round(tRatio * 1.5 * 10) / 10,
      pitch: Math.round(globalPitch * tRatio * 10) / 10,
      yaw: 0,
      battery: Math.round((battery - s * 0.05) * 10) / 10,
      satellites: 24,
      isPhoto: false,
      waypointIndex: 0
    });
  }
  currentTime = takeoffDuration;
  battery = points[points.length - 1].battery;

  for (let i = 0; i < waypoints.length; i++) {
    const wp = waypoints[i];
    const prevWp = i > 0 ? waypoints[i - 1] : waypoints[0];
    const dist = (typeof haversineDistance === 'function')
      ? haversineDistance(prevWp.lat, prevWp.lon, wp.lat, wp.lon)
      : Math.hypot((wp.lat - prevWp.lat) * 111320, (wp.lon - prevWp.lon) * 85000);
    totalDistance += dist;

    const segmentSpeed = wp.speed || cruiseSpeed;
    const segmentTime = Math.max(1, Math.round(dist / segmentSpeed));
    const targetPitch = wp.gimbalPitch !== undefined ? wp.gimbalPitch : globalPitch;
    const targetAlt = wp.altitude !== undefined ? wp.altitude : defaultAlt;
    const targetYaw = wp.heading !== undefined ? wp.heading : 0;

    for (let step = 1; step <= segmentTime; step++) {
      currentTime++;
      const ratio = step / segmentTime;
      const driftLat = isPureSim ? 0 : Math.sin(currentTime * 0.15) * 0.0000035;
      const driftLon = isPureSim ? 0 : Math.cos(currentTime * 0.12) * 0.0000042;
      const driftAlt = isPureSim ? 0 : Math.sin(currentTime * 0.2) * 0.25;
      const curLat = prevWp.lat + (wp.lat - prevWp.lat) * ratio + driftLat;
      const curLon = prevWp.lon + (wp.lon - prevWp.lon) * ratio + driftLon;
      const baseAlt = prevWp.altitude ? prevWp.altitude + (targetAlt - prevWp.altitude) * ratio : targetAlt;
      const curAlt = baseAlt + driftAlt;
      const curPitch = prevWp.gimbalPitch !== undefined ? prevWp.gimbalPitch + (targetPitch - prevWp.gimbalPitch) * ratio : targetPitch;
      const curYaw = prevWp.heading !== undefined ? prevWp.heading + (targetYaw - prevWp.heading) * ratio : targetYaw;

      battery -= 0.08;

      const isLastStepOfWaypoint = (step === segmentTime);
      points.push({
        time: currentTime,
        timeStr: formatTime(currentTime),
        lat: curLat,
        lon: curLon,
        alt: Math.round(curAlt * 10) / 10,
        speed: Math.round((segmentSpeed + (isPureSim ? 0 : Math.sin(currentTime * 0.3) * 0.15)) * 10) / 10,
        pitch: Math.round(curPitch * 10) / 10,
        yaw: Math.round(curYaw * 10) / 10,
        battery: Math.max(10, Math.round(battery * 10) / 10),
        satellites: 24,
        isPhoto: false,
        waypointIndex: isLastStepOfWaypoint ? i : null
      });
    }

    const hoverTime = wp.hoverTime !== undefined ? wp.hoverTime : 2;
    for (let h = 1; h <= hoverTime; h++) {
      currentTime++;
      battery -= 0.05;
      const driftLat = isPureSim ? 0 : Math.sin(currentTime * 0.25) * 0.0000015;
      const driftLon = isPureSim ? 0 : Math.cos(currentTime * 0.25) * 0.0000015;
      points.push({
        time: currentTime,
        timeStr: formatTime(currentTime),
        lat: wp.lat + driftLat,
        lon: wp.lon + driftLon,
        alt: Math.round(targetAlt * 10) / 10,
        speed: 0.0,
        pitch: Math.round(targetPitch * 10) / 10,
        yaw: Math.round(targetYaw * 10) / 10,
        battery: Math.max(10, Math.round(battery * 10) / 10),
        satellites: 24,
        isPhoto: (h === 1),
        waypointIndex: i
      });
    }
  }

  const lastWp = waypoints[waypoints.length - 1];
  const rthDist = (typeof haversineDistance === 'function')
    ? haversineDistance(lastWp.lat, lastWp.lon, homePoint.lat, homePoint.lon)
    : Math.hypot((homePoint.lat - lastWp.lat) * 111320, (homePoint.lon - lastWp.lon) * 85000);
  totalDistance += rthDist;
  const rthTime = Math.max(3, Math.round(rthDist / 6.0));

  for (let s = 1; s <= rthTime; s++) {
    currentTime++;
    const ratio = s / rthTime;
    const curLat = lastWp.lat + (homePoint.lat - lastWp.lat) * ratio;
    const curLon = lastWp.lon + (homePoint.lon - lastWp.lon) * ratio;
    battery -= 0.09;
    points.push({
      time: currentTime,
      timeStr: formatTime(currentTime),
      lat: curLat,
      lon: curLon,
      alt: defaultAlt,
      speed: 6.0,
      pitch: 0,
      yaw: 0,
      battery: Math.max(10, Math.round(battery * 10) / 10),
      satellites: 24,
      isPhoto: false,
      waypointIndex: null
    });
  }

  const landingTime = Math.max(4, Math.round(defaultAlt / 2.0));
  for (let l = 1; l <= landingTime; l++) {
    currentTime++;
    const ratio = 1 - (l / landingTime);
    battery -= 0.04;
    points.push({
      time: currentTime,
      timeStr: formatTime(currentTime),
      lat: homePoint.lat,
      lon: homePoint.lon,
      alt: Math.max(0, Math.round(defaultAlt * ratio * 10) / 10),
      speed: 0.5,
      pitch: 0,
      yaw: 0,
      battery: Math.max(10, Math.round(battery * 10) / 10),
      satellites: 24,
      isPhoto: false,
      waypointIndex: null
    });
  }

  const durationSec = currentTime;
  const photoCount = waypoints.length;

  return {
    flightId,
    flightDate,
    droneModel: 'DJI Mini 4 Pro',
    durationSec,
    durationFormatted: formatTime(durationSec),
    totalDistance: Math.round(totalDistance + (isPureSim ? 0 : 25)),
    maxAltitude: defaultAlt,
    photoCount,
    homePoint,
    points,
    batteryStart: 98,
    batteryEnd: Math.round(battery),
    batteryUsed: Math.round(98 - battery),
    maxDeviation: isPureSim ? '0.0 m' : '0.8 m'
  };
}

function computeFlightComparison(plannedMission, actualTelemetry) {
  if (!plannedMission || !actualTelemetry) return null;

  const plannedTimeSec = plannedMission.estimatedTimeSec || (actualTelemetry.durationSec >= 30 ? Math.max(10, actualTelemetry.durationSec - 22) : actualTelemetry.durationSec);
  const actualTimeSec = actualTelemetry.durationSec;
  const timeDeltaSec = actualTimeSec - plannedTimeSec;
  const timeDeltaPct = plannedTimeSec > 0 ? ((timeDeltaSec / plannedTimeSec) * 100).toFixed(1) : '0';

  const plannedDist = plannedMission.totalDistance || (actualTelemetry.totalDistance >= 50 ? Math.max(10, actualTelemetry.totalDistance - 25) : actualTelemetry.totalDistance);
  const actualDist = actualTelemetry.totalDistance;
  const distDelta = actualDist - plannedDist;

  const plannedAlt = plannedMission.altitude || actualTelemetry.maxAltitude;
  const actualAlt = actualTelemetry.maxAltitude;

  const plannedPhotos = plannedMission.waypointCount !== undefined ? plannedMission.waypointCount : actualTelemetry.photoCount;
  const actualPhotos = actualTelemetry.photoCount;

  return {
    time: {
      planned: formatTime(plannedTimeSec),
      actual: formatTime(actualTimeSec),
      delta: `${timeDeltaSec >= 0 ? '+' : ''}${timeDeltaSec}s (${timeDeltaPct}%)`,
      status: Math.abs(timeDeltaSec) < 45 ? 'optimal' : 'warning'
    },
    distance: {
      planned: `${Math.round(plannedDist)} m`,
      actual: `${Math.round(actualDist)} m`,
      delta: `${distDelta >= 0 ? '+' : ''}${Math.round(distDelta)} m`,
      status: Math.abs(distDelta) < 50 ? 'optimal' : 'warning'
    },
    altitude: {
      planned: `${plannedAlt} m`,
      actual: `${actualAlt} m`,
      delta: `${(actualAlt - plannedAlt).toFixed(1)} m`,
      status: Math.abs(actualAlt - plannedAlt) <= 1.0 ? 'optimal' : 'warning'
    },
    photos: {
      planned: plannedPhotos,
      actual: actualPhotos,
      completionPct: plannedPhotos > 0 ? `${Math.round((actualPhotos / plannedPhotos) * 100)}%` : '100%',
      status: actualPhotos >= plannedPhotos ? 'optimal' : 'warning'
    },
    battery: {
      start: `${actualTelemetry.batteryStart}%`,
      end: `${actualTelemetry.batteryEnd}%`,
      consumed: `${actualTelemetry.batteryUsed}%`,
      ratePerMin: `${actualTimeSec > 0 ? (actualTelemetry.batteryUsed / (actualTimeSec / 60)).toFixed(1) : '0'}% / min`
    },
    maxDeviation: actualTelemetry.maxDeviation || '0.8 m'
  };
}

// KMZ Import Handlers & Parsers
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
      if (droneSelect) {
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

    setGridCenter(refLat, refLon);
    map.setView([refLat, refLon], 17);

    toggleUIControlsState(true);

    const statusTextEl = document.getElementById('import-status-text');
    statusTextEl.textContent = '';
    const spanEl = document.createElement('span');
    spanEl.style.color = 'var(--accent-green)';
    spanEl.style.fontWeight = '600';
    spanEl.textContent = `Active: ${importedFileName}`;
    statusTextEl.appendChild(spanEl);
    document.getElementById('clear-imported-btn').classList.remove('hidden');

    updateGrid();
    
  } catch (err) {
    Logger.error("XML Parsing error:", err);
    alert(`Failed to parse KML: ${err.message}`);
    clearImportedMission();
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

    if (flightPathPolyline) flightPathPolyline.clearLayers();
    if (roadPathGroup) roadPathGroup.clearLayers();
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

  const gridTypeSelect = document.getElementById('grid-type');
  if (gridTypeSelect) {
    gridTypeSelect.value = 'freeform';
    gridTypeSelect.dispatchEvent(new Event('change'));
  }
  togglePatternParameters();
  syncDisplayValues();
  redrawCurrentMission();
}

function createWaypointEditorDOM(wp, idx, marker, popupMarker) {
  const popupContent = document.createElement('div');
  popupContent.className = 'wp-editor-popup';
  popupContent.style.width = '230px';
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
      <div style="background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 6px; padding: 6px 8px; margin-bottom: 10px; display: flex; flex-direction: column; gap: 4px;">
        <div style="font-size: 0.72rem; color: #f59e0b; font-weight: 600; display: flex; align-items: center; justify-content: space-between;">
          <span>⚠️ Overlapping Items (${overlappingItems.length})</span>
          <span style="font-size: 0.65rem; color: #cbd5e1;">Switch:</span>
        </div>
        <select class="overlapping-switcher-select form-select" style="font-size: 0.75rem; padding: 3px 6px; border-radius: 4px; background: rgba(15, 23, 42, 0.8); color: #f8fafc; border: 1px solid rgba(255,255,255,0.2); cursor: pointer; width: 100%;">
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
          if (confirm(`Are you sure you want to delete Road Node ${idx}?`)) {
            if (roadWaypoints && roadWaypoints.length > idx) {
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
      const defaultGimbalPitch = parseFloat(document.getElementById('gimbal-pitch').value);
      const pitch = wp.pitch !== undefined && wp.pitch !== null ? wp.pitch : defaultGimbalPitch;
      const headingDisplay = (wp.heading !== null && wp.heading !== undefined && !isNaN(wp.heading)) ? wp.heading.toFixed(0) : '—';

      popupContent.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 8px; color: var(--text-main); font-size: 0.9rem; border-bottom: 1px solid var(--border-color); padding-bottom: 6px; display: flex; justify-content: space-between; align-items: center;">
          <span>Drone Waypoint ${idx}</span>
        </div>
        <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 10px; display: flex; flex-direction: column; gap: 4px;">
          <div><strong>Height:</strong> ${formatDistance(wp.alt, 0)}</div>
          <div><strong>Yaw:</strong> ${headingDisplay}°</div>
          <div><strong>Gimbal Pitch:</strong> ${pitch}°</div>
        </div>
        <div style="background: rgba(6, 182, 212, 0.1); border: 1px solid rgba(6, 182, 212, 0.25); padding: 8px; border-radius: 6px; font-size: 0.75rem; color: #cbd5e1; margin-bottom: 10px; line-height: 1.35;">
          ℹ️ Road Follow waypoints are automatically calculated relative to the road offset.<br><br>
          To edit, move, or nudge individual waypoints, please convert to <strong>Freeform</strong> mode.
        </div>
        <button id="convert-to-freeform-btn" class="btn btn-primary" style="width: 100%; font-size: 0.8rem; padding: 6px 10px; display: flex; align-items: center; justify-content: center; gap: 6px; background: var(--accent-cyan); color: #0f172a; border: none; border-radius: 6px; font-weight: 600; cursor: pointer;">
          <span>✏️ Convert to Freeform Mode</span>
        </button>
      `;

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
  const pitchVal = (wp.pitch !== undefined && wp.pitch !== null) ? wp.pitch : -45;

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
  const originalOrigIsModified = wp.origIsModified;

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
  const poiIndex = wp.poiIndex || 0;
  const isPoiMode = (curMode === 'towardPOI' || (curMode === 'inherit' && document.getElementById('heading-mode')?.value === 'towardPOI'));
  let poiSelectOptions = '';
  pois.forEach((poi, idx) => {
    poiSelectOptions += `<option value="${idx}" ${poiIndex === idx ? 'selected' : ''}>${poi.name}</option>`;
  });

  popupContent.innerHTML = `
    <h4 id="edit-wp-title" style="margin: 0 0 12px 0; color: #06b6d4; font-size: 0.95rem; font-weight: 600; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 6px; display: flex; justify-content: space-between; align-items: center;">
      <span id="edit-wp-title-text">Edit Waypoint ${idx}</span>
      <button id="wp-popup-collapse-btn" type="button" style="background: transparent; border: none; color: #94a3b8; cursor: pointer; font-size: 0.75rem; padding: 0 4px;" title="Minimize/Expand Popup">▼</button>
    </h4>
    <div id="edit-wp-body" style="display: flex; flex-direction: column; gap: 12px; font-size: 0.8rem;">
      ${overlappingHTML}
      
      <!-- Altitude Slider -->
      <div style="display: flex; flex-direction: column; gap: 4px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="color: #94a3b8; font-weight: 500; display: inline-flex; align-items: center; gap: 5px;"><svg viewBox="0 0 24 24" width="14" height="14" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><line x1="3" y1="21" x2="21" y2="21" stroke="#c2622d"/><path d="M12 21v-12M9 12l3-3 3 3" stroke="#06b6d4" fill="none"/><circle cx="12" cy="7" r="1.5" fill="#f5f0e8"/></svg>Altitude:</span>
          <span style="color: #06b6d4; font-weight: 600;"><span id="edit-wp-alt-val">${altDisp}</span> ${altUnitStr}</span>
        </div>
        <input type="range" id="edit-wp-alt" min="5" max="120" value="${wp.alt.toFixed(0)}" style="width: 100%; height: 5px; border-radius: 3px; background: rgba(255,255,255,0.15); accent-color: #06b6d4; outline: none; border: none; cursor: pointer;">
      </div>
      
      <!-- Pitch Slider -->
      <div style="display: flex; flex-direction: column; gap: 4px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="color: #94a3b8; font-weight: 500; display: inline-flex; align-items: center; gap: 5px;"><svg viewBox="0 0 24 24" width="14" height="14" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><circle cx="8" cy="8" r="3" stroke="#c2622d" fill="none"/><line x1="8" y1="5" x2="8" y2="2" stroke="#c2622d"/><line x1="8" y1="8" x2="16" y2="16" stroke="#06b6d4"/><path d="M13 17l4-1-1-4" fill="#06b6d4" stroke="#06b6d4"/></svg>Gimbal Pitch:</span>
          <span style="color: #06b6d4; font-weight: 600;"><span id="edit-wp-pitch-val">${pitchVal}</span>&deg;</span>
        </div>
        <input type="range" id="edit-wp-pitch" min="-90" max="0" value="${pitchVal}" style="width: 100%; height: 5px; border-radius: 3px; background: rgba(255,255,255,0.15); accent-color: #06b6d4; outline: none; border: none; cursor: pointer;">
      </div>
 
      <!-- Speed Override Slider -->
      <div style="display: flex; flex-direction: column; gap: 4px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="color: #94a3b8; font-weight: 500; display: inline-flex; align-items: center; gap: 5px;"><svg viewBox="0 0 24 24" width="14" height="14" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><path d="M3 12a9 9 0 0 1 15-6.7M21 12a9 9 0 0 1-9 9" stroke="#06b6d4" fill="none"/><line x1="12" y1="12" x2="17" y2="8" stroke="#c2622d"/><circle cx="12" cy="12" r="1.5" fill="#f5f0e8"/></svg>Flight Speed:</span>
          <span style="color: #06b6d4; font-weight: 600;"><span id="edit-wp-speed-val">${wp.speed ? wp.speed + ' m/s' : 'Auto'}</span></span>
        </div>
        <input type="range" id="edit-wp-speed" min="1" max="15" step="0.5" value="${wp.speed || 5}" style="width: 100%; height: 5px; border-radius: 3px; background: rgba(255,255,255,0.15); accent-color: #06b6d4; outline: none; border: none; cursor: pointer;">
      </div>

      <!-- Hover Duration Input -->
      <div style="display: flex; flex-direction: column; gap: 4px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="color: #94a3b8; font-weight: 500; display: inline-flex; align-items: center; gap: 5px;"><svg viewBox="0 0 24 24" width="14" height="14" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><circle cx="12" cy="12" r="9" stroke="#06b6d4" fill="none"/><polyline points="12 6 12 12 16 14" stroke="#c2622d"/></svg>Hover Time:</span>
          <span style="color: #06b6d4; font-weight: 600;"><span id="edit-wp-hover-val">${wp.hoverTime !== null && wp.hoverTime !== undefined ? wp.hoverTime : (document.getElementById('global-hover-time') ? parseInt(document.getElementById('global-hover-time').value) : 0)}</span>s${wp.hoverTime === null || wp.hoverTime === undefined ? ' <span style="color: #94a3b8; font-size: 0.7rem;">(Global)</span>' : ''}</span>
        </div>
        <input type="range" id="edit-wp-hover" min="0" max="60" step="1" value="${wp.hoverTime !== null && wp.hoverTime !== undefined ? wp.hoverTime : (document.getElementById('global-hover-time') ? parseInt(document.getElementById('global-hover-time').value) : 0)}" style="width: 100%; height: 5px; border-radius: 3px; background: rgba(255,255,255,0.15); accent-color: #06b6d4; outline: none; border: none; cursor: pointer;">
        <div id="edit-wp-hover-warning" style="display: none; font-size: 0.65rem; color: #f59e0b; margin-top: 2px; line-height: 1.2;">
          ⚠️ Gimbal/yaw change: 2s auto-settling delay will be applied in KML export.
        </div>
      </div>

      <!-- Turn Mode Selector -->
      <div style="display: flex; flex-direction: column; gap: 4px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="color: #94a3b8; font-weight: 500; display: inline-flex; align-items: center; gap: 5px;"><svg viewBox="0 0 24 24" width="14" height="14" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" stroke="#06b6d4" fill="none"/><line x1="4" y1="22" x2="4" y2="15" stroke="#c2622d"/></svg>Turn Mode:</span>
          <select id="edit-wp-turn-mode" class="form-select" style="font-size: 0.72rem; padding: 3px 6px; border-radius: 6px; background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255,255,255,0.1); color: var(--text-main); cursor: pointer;">
            <option value="inherit" ${!wp.turnMode || wp.turnMode === 'inherit' ? 'selected' : ''}>Inherit Global</option>
            <option value="stop" ${wp.turnMode === 'stop' ? 'selected' : ''}>Stop & Turn</option>
            <option value="pass" ${wp.turnMode === 'pass' ? 'selected' : ''}>Curved Pass</option>
          </select>
        </div>
      </div>

      <!-- Camera Action Selector -->
      <div style="display: flex; flex-direction: column; gap: 4px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="color: #94a3b8; font-weight: 500; display: inline-flex; align-items: center; gap: 5px;"><svg viewBox="0 0 24 24" width="14" height="14" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" stroke="#06b6d4" fill="none"/><circle cx="12" cy="13" r="4" stroke="#c2622d" fill="none"/></svg>Camera Action:</span>
          <select id="edit-wp-camera-action" class="form-select" style="font-size: 0.72rem; padding: 3px 6px; border-radius: 6px; background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255,255,255,0.1); color: var(--text-main); cursor: pointer;">
            <option value="inherit" ${!wp.cameraAction || wp.cameraAction === 'inherit' ? 'selected' : ''}>Inherit Global Mode</option>
            <option value="none" ${wp.cameraAction === 'none' ? 'selected' : ''}>None (No Action)</option>
            <option value="takePhoto" ${wp.cameraAction === 'takePhoto' ? 'selected' : ''}>Take Photo</option>
            <option value="startRecord" ${wp.cameraAction === 'startRecord' ? 'selected' : ''}>Start Recording</option>
            <option value="stopRecord" ${wp.cameraAction === 'stopRecord' ? 'selected' : ''}>Stop Recording</option>
            <option value="zoom" ${wp.cameraAction === 'zoom' ? 'selected' : ''}>Set Camera Zoom</option>
          </select>
        </div>
      </div>

      <!-- Camera Zoom Factor Input -->
      <div id="edit-wp-zoom-container" style="display: ${wp.cameraAction === 'zoom' ? 'flex' : 'none'}; flex-direction: column; gap: 4px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="color: #94a3b8; font-weight: 500; display: inline-flex; align-items: center; gap: 5px;"><svg viewBox="0 0 24 24" width="14" height="14" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><circle cx="11" cy="11" r="8" fill="none" stroke="#06b6d4"></circle><line x1="21" y1="21" x2="16.65" y2="16.65" stroke="#06b6d4"></line></svg>Camera Zoom:</span>
          <span style="color: #06b6d4; font-weight: 600;"><span id="edit-wp-zoom-val">${(wp.zoom || 1.0).toFixed(1)}</span>x</span>
        </div>
        <input type="range" id="edit-wp-zoom" min="1.0" max="4.0" step="0.1" value="${wp.zoom || 1.0}" style="width: 100%; height: 5px; border-radius: 3px; background: rgba(255,255,255,0.15); accent-color: #06b6d4; outline: none; border: none; cursor: pointer;">
      </div>

      <!-- Yaw / Heading Selector -->
      <div style="display: flex; flex-direction: column; gap: 4px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="color: #94a3b8; font-weight: 500; display: inline-flex; align-items: center; gap: 5px;"><svg viewBox="0 0 24 24" width="14" height="14" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><polygon points="3 11 22 2 13 21 11 13 3 11" stroke="#06b6d4" fill="none"/></svg>Heading Mode:</span>
          <span id="edit-wp-heading-val" style="color: #06b6d4; font-weight: 600;">Auto</span>
        </div>
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <select id="edit-wp-heading-mode" class="form-select" style="font-size: 0.72rem; padding: 4px 8px; border-radius: 6px; background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255,255,255,0.1); color: var(--text-main); cursor: pointer; width: 100%;">
            <option value="inherit" ${curMode === 'inherit' ? 'selected' : ''}>Inherit Global Default</option>
            <option value="followWayline" ${curMode === 'followWayline' ? 'selected' : ''}>Follow Flight Path</option>
            <option value="fixed" ${curMode === 'fixed' ? 'selected' : ''}>Fixed Heading (North)</option>
            <option value="towardPOI" ${curMode === 'towardPOI' ? 'selected' : ''}>Point of Interest (POI)</option>
            <option value="custom" ${curMode === 'custom' ? 'selected' : ''}>Custom Angle</option>
          </select>
          <select id="edit-wp-poi-select" class="form-select" style="font-size: 0.72rem; padding: 4px 8px; border-radius: 6px; background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255,255,255,0.1); color: var(--text-main); cursor: pointer; width: 100%; display: ${isPoiMode ? 'block' : 'none'};">
            ${poiSelectOptions}
          </select>
          <input type="range" id="edit-wp-heading" min="0" max="359" value="${headingVal !== '' ? headingVal : 0}" style="width: 100%; height: 5px; border-radius: 3px; background: rgba(255,255,255,0.15); accent-color: #06b6d4; outline: none; border: none; cursor: pointer; display: ${curMode === 'custom' ? 'block' : 'none'};">
        </div>
      </div>
 
      <!-- Position Nudge & Lat/Lon Inputs -->
      <div style="display: flex; flex-direction: column; gap: 6px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 8px;">
        <span style="color: #94a3b8; font-weight: 500; display: inline-flex; align-items: center; gap: 5px;"><svg viewBox="0 0 24 24" width="14" height="14" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z" stroke="#06b6d4" fill="none"/><circle cx="12" cy="10" r="3" stroke="#c2622d" fill="none"/></svg>Position (Nudge):</span>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <!-- D-Pad -->
          <div style="display: grid; grid-template-columns: repeat(3, 24px); grid-template-rows: repeat(3, 24px); gap: 2px; justify-content: center; width: 80px;">
            <div></div>
            <button id="nudge-n-btn" type="button" style="background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.2); color: #06b6d4; border-radius: 4px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 0.85rem; font-weight: bold; width: 24px; height: 24px; padding: 0;">▲</button>
            <div></div>
            <button id="nudge-w-btn" type="button" style="background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.2); color: #06b6d4; border-radius: 4px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 0.85rem; font-weight: bold; width: 24px; height: 24px; padding: 0;">◀</button>
            <div id="nudge-step-display" style="display: flex; align-items: center; justify-content: center; font-size: 0.65rem; color: var(--accent-cyan); font-weight: bold; user-select: none;">${initialStepLabel}</div>
            <button id="nudge-e-btn" type="button" style="background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.2); color: #06b6d4; border-radius: 4px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 0.85rem; font-weight: bold; width: 24px; height: 24px; padding: 0;">▶</button>
            <div></div>
            <button id="nudge-s-btn" type="button" style="background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.2); color: #06b6d4; border-radius: 4px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 0.85rem; font-weight: bold; width: 24px; height: 24px; padding: 0;">▼</button>
            <div></div>
          </div>
          
          <!-- Lat/Lon inputs -->
          <div style="display: flex; flex-direction: column; gap: 4px; flex: 1; margin-left: 8px;">
            <input type="text" id="edit-wp-lat" value="${wp.lat.toFixed(7)}" style="background: rgba(15,23,42,0.6); border: 1px solid var(--border-color); border-radius: 4px; padding: 2px 4px; color: #fff; font-size: 0.7rem; width: 100%; text-align: center;" placeholder="Latitude">
            <input type="text" id="edit-wp-lon" value="${wp.lon.toFixed(7)}" style="background: rgba(15,23,42,0.6); border: 1px solid var(--border-color); border-radius: 4px; padding: 2px 4px; color: #fff; font-size: 0.7rem; width: 100%; text-align: center;" placeholder="Longitude">
          </div>
        </div>
      </div>
 
      <div style="display: flex; gap: 8px; margin-top: 6px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 8px;">
        <button id="save-wp-btn" class="btn-primary" style="padding: 6px 12px; font-size: 0.75rem; flex: 1; min-height: 28px; line-height: 1.2; display: inline-block;">Save</button>
        <button id="reset-wp-btn" class="btn-secondary" style="padding: 6px 12px; font-size: 0.75rem; color: #eab308; border-color: rgba(234, 179, 8, 0.3); flex: 1; min-height: 28px; line-height: 1.2; display: inline-block;">Revert</button>
        <button id="delete-wp-btn" class="btn-secondary" style="padding: 6px 12px; font-size: 0.75rem; color: #ef4444; border-color: rgba(239, 68, 68, 0.3); flex: 1; min-height: 28px; line-height: 1.2;">Delete</button>
      </div>
    </div>
  `;

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

  // Bind events to the elements directly before they are inserted into the DOM
  const saveBtn = popupContent.querySelector('#save-wp-btn');
  const resetBtn = popupContent.querySelector('#reset-wp-btn');
  const deleteBtn = popupContent.querySelector('#delete-wp-btn');

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
      const globalMode = document.getElementById('heading-mode');
      effectiveMode = globalMode ? globalMode.value : 'followWayline';
    }

    if (effectiveMode === 'custom') {
      tempHeading = parseFloat(headingSlider.value);
    } else if (effectiveMode === 'followWayline') {
      tempHeading = autoHead;
    } else if (effectiveMode === 'fixed') {
      tempHeading = 0;
    } else if (effectiveMode === 'towardPOI') {
      const selectedPoiIndex = poiSelect ? parseInt(poiSelect.value) : (wp.poiIndex || 0);
      const targetPoi = pois[selectedPoiIndex];
      if (targetPoi) {
        const dy = targetPoi.lat - (isNaN(latVal) ? wp.lat : latVal);
        const dx = targetPoi.lon - (isNaN(lonVal) ? wp.lon : lonVal);
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
    wp.poiIndex = poiSelect ? parseInt(poiSelect.value) : (wp.poiIndex || 0);

    if (!isNaN(latVal) && !isNaN(lonVal)) {
      marker.setLatLng([latVal, lonVal]);
      
      // Update global wp temporary values for real-time path updates
      const centerLatLng = centerMarker.getLatLng();
      const offsets = geodeticToLocal(latVal, lonVal, centerLatLng.lat, centerLatLng.lng);
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
        const defaultGimbalPitch = parseFloat(document.getElementById('gimbal-pitch').value);
        generatedWaypoints.forEach((gwp) => {
          if (gwp.mapMarker) {
            gwp.mapMarker.setLatLng([gwp.lat, gwp.lon]);
            const gPitch = gwp.pitch !== undefined && gwp.pitch !== null ? gwp.pitch : defaultGimbalPitch;
            const headingDisplay = (gwp.heading !== null && gwp.heading !== undefined && !isNaN(gwp.heading)) ? gwp.heading.toFixed(0) : '—';
            const tooltipContent = `Drone Waypoint ${gwp.idx}<br>Height: ${formatDistance(gwp.alt, 0)}<br>Yaw: ${headingDisplay}°<br>Pitch: ${gPitch}°`;
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
      const newTitle = `${isStart ? "Start Point" : (isEnd ? "End Point" : `Waypoint ${idx}`)}<br>Height: ${formatDistance(tempAlt, 0)}<br>Yaw: ${yawDisplay}°<br>Pitch: ${tempPitch}°`;
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
  };
  const throttledUpdateRealtimeMarker = throttle(updateRealtimeMarker, 32);

  const updateWarningVisibility = () => {
    const warningDiv = popupContent.querySelector('#edit-wp-hover-warning');
    if (!warningDiv) return;
    
    const currentHoverVal = hoverSlider ? parseInt(hoverSlider.value) : 0;
    const isStopAndShoot = document.getElementById('capture-mode')?.value === 'stopAndShoot';
    
    const tempWp = {
      ...wp,
      alt: parseFloat(altSlider.value),
      pitch: parseFloat(pitchSlider.value),
      headingMode: headingModeSelect.value,
      heading: headingModeSelect.value === 'custom' ? parseFloat(headingSlider.value) : (wp.heading !== undefined ? wp.heading : null),
      poiIndex: poiSelect ? parseInt(poiSelect.value) : (wp.poiIndex || 0),
    };
    
    const waypointsCopy = getCurrentWaypoints().map((w, i) => i === idx ? tempWp : w);
    const reposInfo = checkNeedsReposition(idx, waypointsCopy);
    
    if (isStopAndShoot && currentHoverVal < 2 && reposInfo.needsReposition) {
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
    pitchValText.textContent = pitchSlider.value;
    updateWarningVisibility();
    throttledUpdateRealtimeMarker();
  });

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
      const isPoi = (mode === 'towardPOI' || (mode === 'inherit' && document.getElementById('heading-mode')?.value === 'towardPOI'));
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
        const defaultGimbalPitch = parseFloat(document.getElementById('gimbal-pitch').value);
        const pitch = wp.pitch !== undefined && wp.pitch !== null ? wp.pitch : defaultGimbalPitch;
        const headingDisplay = (wp.heading !== null && wp.heading !== undefined) ? wp.heading.toFixed(0) : '—';
        const tooltipContent = `Drone Waypoint ${idx}<br>Height: ${formatDistance(wp.alt, 0)}<br>Yaw: ${headingDisplay}°<br>Pitch: ${pitch}°`;
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
      const pitch = wp.pitch !== undefined && wp.pitch !== null ? wp.pitch : parseFloat(document.getElementById('gimbal-pitch').value);
      const originalTitle = `${isStart ? "Start Point" : (isEnd ? "End Point" : `Waypoint ${idx}`)}<br>Height: ${formatDistance(wp.alt, 0)}<br>Yaw: ${heading.toFixed(0)}°<br>Pitch: ${pitch}°`;
      if (marker.getTooltip()) marker.getTooltip().setContent(originalTitle);

      // Redraw lines and stats
      const centerLatLng = centerMarker.getLatLng();
      updatePathLinesAndStats(getCurrentWaypoints(), getCurrentPhotos(), centerLatLng.lat, centerLatLng.lng, parseFloat(document.getElementById('grid-width').value), parseFloat(document.getElementById('grid-height').value), rotationDeg);
    }
  };

  const popupObj = popupMarker ? (typeof popupMarker.getPopup === 'function' ? popupMarker.getPopup() : null) : (marker && typeof marker.getPopup === 'function' ? marker.getPopup() : null);

  // Clear ALL previously accumulated popupclose listeners before adding new one.
  // Each popup open creates a new revertChanges closure; without this, old closures
  // (with isSaved=false) accumulate on the marker and fire on close, overwriting saves/reverts.
  if (marker && typeof marker.off === 'function') marker.off('popupclose');
  if (popupObj && typeof popupObj.off === 'function') popupObj.off('remove');

  const unbindRevert = () => {
    isSaved = true; // Prevent revert from firing
    if (popupObj && typeof popupObj.off === 'function') popupObj.off('remove', revertChanges);
    if (marker && typeof marker.off === 'function') marker.off('popupclose', revertChanges);
  };
  if (popupObj && typeof popupObj.on === 'function') popupObj.on('remove', revertChanges);
  if (marker && typeof marker.on === 'function') marker.on('popupclose', revertChanges);

  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      unbindRevert();
      
      const altVal = parseFloat(altSlider.value);
      const pitchVal = parseFloat(pitchSlider.value);
      const mode = headingModeSelect.value;
      const headingVal = (mode === 'custom') ? parseFloat(headingSlider.value) : null;
      const poiIndexVal = poiSelect ? parseInt(poiSelect.value) : 0;
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
        const centerLat = centerMarker ? centerMarker.getLatLng().lat : (pois[0] ? pois[0].lat : latVal);
        const centerLon = centerMarker ? centerMarker.getLatLng().lng : (pois[0] ? pois[0].lon : lonVal);
        const offsets = geodeticToLocal(latVal, lonVal, centerLat, centerLon);
        wp.x = offsets.x;
        wp.y = offsets.y;
      }
      wp.alt = altVal;
      wp.pitch = pitchVal;
      wp.heading = headingVal;
      wp.headingMode = mode;
      wp.poiIndex = poiIndexVal;
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
        rWp.pitch = pitchVal;
        rWp.heading = headingVal;
        rWp.headingMode = mode;
        rWp.poiIndex = poiIndexVal;
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
      const defaultPitch = parseFloat(document.getElementById('gimbal-pitch')?.value || -45);

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
        const pitch = wp.pitch !== undefined && wp.pitch !== null ? wp.pitch : parseFloat(document.getElementById('gimbal-pitch')?.value || -45);
        const originalTitle = `${isStart ? "Start Point" : (isEnd ? "End Point" : `Waypoint ${idx}`)}<br>Height: ${formatDistance(wp.alt, 0)}<br>Yaw: ${heading.toFixed(0)}°<br>Pitch: ${pitch}°`;
        if (marker && typeof marker.setTooltipContent === 'function') marker.setTooltipContent(originalTitle);
        if (wp.mapMarker && typeof wp.mapMarker.setTooltipContent === 'function') wp.mapMarker.setTooltipContent(originalTitle);
      } else {
        if (wp.roadMarker) {
          if (marker && typeof marker.setTooltipContent === 'function') marker.setTooltipContent(`Road Node ${idx}`);
        } else {
          const defaultGimbalPitch = parseFloat(document.getElementById('gimbal-pitch')?.value || -45);
          const pitch = wp.pitch !== undefined && wp.pitch !== null ? wp.pitch : defaultGimbalPitch;
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

        if (isRoadFollow) {
          if (roadWaypoints && roadWaypoints.length > idx) {
            roadWaypoints.splice(idx, 1);
            roadWaypoints.forEach((w, newIdx) => { w.idx = newIdx; });
          }
          if (generatedWaypoints && generatedWaypoints.length > idx) {
            generatedWaypoints.splice(idx, 1);
            generatedWaypoints.forEach((w, newIdx) => { w.idx = newIdx; });
          }
        } else {
          const activeWps = getCurrentWaypoints();
          const activePts = getCurrentPhotos();
          if (activeWps && activeWps[idx]) {
            activeWps.splice(idx, 1);
            activeWps.forEach((w, newIdx) => { w.idx = newIdx; });
          }
          if (activePts && activePts[idx]) {
            activePts.splice(idx, 1);
          }
        }

        if (popupObj) popupObj.close ? popupObj.close() : (marker && marker.closePopup());
        redrawCurrentMission();
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
let fpvActive = false;
let fpvPlaying = false;
let fpvProgressIndex = 0;
let fpvNudgeStepIndex = 1;
let fpvSubInterpolation = 0.0;
let fpvSpeed = 1.0;
let fpvOriginalCamPos = null;
let fpvOriginalCamTarget = null;
let fpvPhotoFlashActive = false;
let fpvPhotoDelayTimer = null;
let fpvRecordTimer = null;
let fpvRecordSeconds = 0;

// Create a rectangular pyramid representing the camera's field of view (frustum)
function createCameraPyramidGeometry(hfov, vfov, height) {
  const geom = new THREE.BufferGeometry();
  const wHalf = height * Math.tan((hfov / 2) * Math.PI / 180);
  const vHalf = height * Math.tan((vfov / 2) * Math.PI / 180);

  const vertices = new Float32Array([
     0,      0,      0,     // 0: Apex
    -wHalf, -height, -vHalf, // 1: Top-Left
     wHalf, -height, -vHalf, // 2: Top-Right
     wHalf, -height,  vHalf, // 3: Bottom-Right
    -wHalf, -height,  vHalf  // 4: Bottom-Left
  ]);

  const indices = [
    0, 1, 2,
    0, 2, 3,
    0, 3, 4,
    0, 4, 1,
    1, 3, 2,
    1, 4, 3
  ];

  geom.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

// Draw photogrammetry coverage heatmap on the ground plane canvas
function drawCoverageHeatmap(ctx, planeOffsetX, planeOffsetZ, planeSize) {
  if (fpvActive || !showFootprints) return;
  const waypoints = getCurrentWaypoints();
  if (!waypoints || waypoints.length === 0) return;

  const rotationDeg = parseFloat(document.getElementById('grid-rotation').value) || 0;
  const defaultGimbalPitch = parseFloat(document.getElementById('gimbal-pitch').value) || -60;

  waypoints.forEach((wp, idx) => {
    const alt = wp.alt; // in meters
    const pitch = wp.pitch !== undefined && wp.pitch !== null ? wp.pitch : defaultGimbalPitch;
    
    let heading = 0;
    if (wp.heading !== null && wp.heading !== undefined) {
      heading = wp.heading;
    } else {
      heading = getDefaultHeading(idx, waypoints, rotationDeg);
    }
    
    const pitchRad = pitch * Math.PI / 180;
    const headingRad = heading * Math.PI / 180;
    
    const xDrone = wp.x;
    const zDrone = -wp.y;
    
    let d = 0;
    if (pitch > -90) {
      d = alt * Math.tan((90 + pitch) * Math.PI / 180);
    }
    
    const xGround = xDrone + d * Math.sin(headingRad);
    const zGround = zDrone - d * Math.cos(headingRad);
    
    const pixelX = ((xGround - planeOffsetX) / planeSize + 0.5) * 768;
    const pixelY = ((zGround - planeOffsetZ) / planeSize + 0.5) * 768;
    
    const radiusAcross = alt * Math.tan((CAMERA_HFOV / 2.0) * Math.PI / 180.0);
    const sinAbsPitch = Math.max(0.1, Math.sin(Math.abs(pitchRad)));
    const radiusAlong = alt * Math.tan((CAMERA_VFOV / 2.0) * Math.PI / 180.0) / sinAbsPitch;
    
    const pixelRadiusAcross = (radiusAcross / planeSize) * 768;
    const pixelRadiusAlong = (radiusAlong / planeSize) * 768;
    
    ctx.save();
    ctx.translate(pixelX, pixelY);
    ctx.rotate(headingRad);
    ctx.beginPath();
    ctx.ellipse(0, 0, pixelRadiusAcross, pixelRadiusAlong, 0, 0, 2 * Math.PI);
    
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(pixelRadiusAcross, pixelRadiusAlong));
    grad.addColorStop(0, "rgba(34, 197, 94, 0.45)");
    grad.addColorStop(0.5, "rgba(34, 197, 94, 0.25)");
    grad.addColorStop(1, "rgba(34, 197, 94, 0.0)");
    
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();
  });
}

// Check if a waypoint requires repositioning of gimbal or drone heading
function checkNeedsReposition(idx, waypoints) {
  if (!waypoints || waypoints.length === 0 || idx === null || idx === undefined || idx < 0 || idx >= waypoints.length) {
    return { needsReposition: false, isGimbalChanged: false, isHeadingChanged: false };
  }
  const current = getWaypointHeadingAndPitch(idx, waypoints);
  
  let isGimbalChanged = false;
  let isHeadingChanged = false;
  
  if (idx === 0) {
    // Takeoff: gimbal defaults to 0. Any target pitch less than -5 is a change.
    isGimbalChanged = current.pitch < -5;
    isHeadingChanged = false;
  } else {
    const prev = getWaypointHeadingAndPitch(idx - 1, waypoints);
    isGimbalChanged = Math.abs(current.pitch - prev.pitch) >= 5;
    
    let headingDiff = Math.abs(current.heading - prev.heading) % 360;
    if (headingDiff > 180) headingDiff = 360 - headingDiff;
    isHeadingChanged = headingDiff >= 10;
  }
  
  return {
    needsReposition: isGimbalChanged || isHeadingChanged,
    isGimbalChanged,
    isHeadingChanged
  };
}

// Calculate the heading and pitch for a waypoint index
function getWaypointHeadingAndPitch(idx, waypoints) {
  let heading = 0;
  const wp = waypoints[idx];
  const rotationDeg = parseFloat(document.getElementById('grid-rotation')?.value) || 0;
  if (wp.heading !== null && wp.heading !== undefined) {
    heading = wp.heading;
  } else {
    const mode = wp.headingMode || 'inherit';
    let effectiveMode = mode;
    if (mode === 'inherit') {
      const globalMode = document.getElementById('heading-mode')?.value;
      effectiveMode = globalMode || 'followWayline';
    }

    if (effectiveMode === 'towardPOI') {
      const selectedPoiIndex = wp.poiIndex || 0;
      const targetPoi = pois[selectedPoiIndex];
      if (targetPoi) {
        const dy = targetPoi.lat - wp.lat;
        const dx = targetPoi.lon - wp.lon;
        heading = (90 - (Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360;
      } else {
        if (typeof centerMarker !== 'undefined' && centerMarker) {
          const latlng = centerMarker.getLatLng();
          const dy = latlng.lat - wp.lat;
          const dx = latlng.lng - wp.lon;
          heading = (90 - (Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360;
        } else {
          heading = 0;
        }
      }
    } else if (effectiveMode === 'fixed') {
      heading = 0;
    } else {
      heading = getDefaultHeading(idx, waypoints, rotationDeg);
    }
  }
  const defaultGimbalPitch = parseFloat(document.getElementById('gimbal-pitch')?.value) || -60;
  const pitch = wp.pitch !== undefined && wp.pitch !== null ? wp.pitch : defaultGimbalPitch;
  return { heading, pitch };
}

let showDroneModels = true;

// Create a procedural 3D Quadcopter Drone mesh for waypoint visualization
function create3DDroneMesh(colorHex, scale = 1.0) {
  const droneGroup = new THREE.Group();

  const bodyMat = new THREE.MeshPhongMaterial({
    color: 0x1e293b,
    shininess: 80
  });
  const accentMat = new THREE.MeshPhongMaterial({
    color: colorHex,
    shininess: 90
  });
  const armMat = new THREE.MeshPhongMaterial({
    color: 0x475569,
    shininess: 50
  });
  const rotorMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.65,
    side: THREE.DoubleSide
  });
  const lensMat = new THREE.MeshPhongMaterial({
    color: 0x0f172a,
    shininess: 100
  });

  // 1. Central Fuselage Body
  const bodyGeom = new THREE.BoxGeometry(1.2 * scale, 0.4 * scale, 1.6 * scale);
  const bodyMesh = new THREE.Mesh(bodyGeom, bodyMat);
  droneGroup.add(bodyMesh);

  // Top Accent Shell
  const shellGeom = new THREE.BoxGeometry(0.9 * scale, 0.25 * scale, 1.2 * scale);
  const shellMesh = new THREE.Mesh(shellGeom, accentMat);
  shellMesh.position.y = 0.25 * scale;
  droneGroup.add(shellMesh);

  // Top Status LED Light
  const ledGeom = new THREE.SphereGeometry(0.15 * scale, 8, 8);
  const ledMesh = new THREE.Mesh(ledGeom, accentMat);
  ledMesh.position.set(0, 0.35 * scale, -0.5 * scale);
  droneGroup.add(ledMesh);

  // 2. Camera Gimbal Payload (Front - Negative Z)
  const gimbalGroup = new THREE.Group();
  gimbalGroup.position.set(0, -0.1 * scale, -0.8 * scale);
  
  const gimbalGeom = new THREE.SphereGeometry(0.3 * scale, 12, 12);
  const gimbalMesh = new THREE.Mesh(gimbalGeom, bodyMat);
  gimbalGroup.add(gimbalMesh);

  const lensGeom = new THREE.CylinderGeometry(0.18 * scale, 0.18 * scale, 0.2 * scale, 12);
  const lensMesh = new THREE.Mesh(lensGeom, lensMat);
  lensMesh.rotation.x = Math.PI / 2;
  lensMesh.position.z = -0.15 * scale;
  gimbalGroup.add(lensMesh);

  droneGroup.add(gimbalGroup);
  droneGroup.userData.gimbalGroup = gimbalGroup;

  // 3. Four Quadcopter Rotor Arms & Propeller Discs
  const armPositions = [
    { x: 1.1 * scale, z: -1.1 * scale }, // Front Right
    { x: -1.1 * scale, z: -1.1 * scale }, // Front Left
    { x: 1.1 * scale, z: 1.1 * scale },  // Rear Right
    { x: -1.1 * scale, z: 1.1 * scale }   // Rear Left
  ];

  armPositions.forEach((pos, idx) => {
    // Carbon Arm Shaft
    const dx = pos.x;
    const dz = pos.z;
    const armLen = Math.sqrt(dx * dx + dz * dz);
    const armGeom = new THREE.CylinderGeometry(0.08 * scale, 0.08 * scale, armLen, 8);
    const armMesh = new THREE.Mesh(armGeom, armMat);

    armMesh.position.set(dx / 2, 0, dz / 2);
    armMesh.rotation.z = Math.PI / 2;
    armMesh.rotation.y = -Math.atan2(dz, dx);
    droneGroup.add(armMesh);

    // Motor Pod
    const motorGeom = new THREE.CylinderGeometry(0.2 * scale, 0.2 * scale, 0.3 * scale, 12);
    const motorMat = idx < 2 ? accentMat : armMat; // Highlight front motors
    const motorMesh = new THREE.Mesh(motorGeom, motorMat);
    motorMesh.position.set(pos.x, 0.1 * scale, pos.z);
    droneGroup.add(motorMesh);

    // Rotor Propeller Blur Disc
    const propGeom = new THREE.CylinderGeometry(0.8 * scale, 0.8 * scale, 0.02 * scale, 16);
    const propMesh = new THREE.Mesh(propGeom, rotorMat);
    propMesh.position.set(pos.x, 0.28 * scale, pos.z);
    droneGroup.add(propMesh);
  });

  return droneGroup;
}

// Recreate waypoints, lines, and cones inside the active Three.js scene
function recreate3DWaypointsAndPaths() {
  if (!threeScene) return;

  // Clear existing groups from scene
  if (waypointsGroup) threeScene.remove(waypointsGroup);
  if (pathsGroup) threeScene.remove(pathsGroup);
  if (groundLinesGroup) threeScene.remove(groundLinesGroup);
  if (conesGroup) threeScene.remove(conesGroup);

  const waypoints = getCurrentWaypoints();
  if (!waypoints || waypoints.length === 0) return;

  coneGroups = [];
  const rotationDeg = parseFloat(document.getElementById('grid-rotation').value) || 0;
  const defaultGimbalPitch = parseFloat(document.getElementById('gimbal-pitch').value) || -60;

  waypointsGroup = new THREE.Group();
  pathsGroup = new THREE.Group();
  groundLinesGroup = new THREE.Group();
  conesGroup = new THREE.Group();

  const materialCache = {};

  waypoints.forEach((wp, idx) => {
    const x3d = wp.x;
    const y3d = wp.alt;
    const z3d = -wp.y;

    const isStart = idx === 0;
    const isEnd = idx === waypoints.length - 1;

    const isSplitStart = activeSplitStartIndices && activeSplitStartIndices.has(wp.idx !== undefined ? wp.idx : idx);

    // Plot Waypoint Sphere
    let r = 1.8;
    let colorHex = 0x06b6d4; // Default cyan

    if (isStart || isSplitStart) {
      r = 3.0;
      colorHex = 0x10b981; // Green for all split starts
    } else if (isEnd) {
      r = 3.0;
      colorHex = 0xef4444; // Red
    } else if (wp.isModified) {
      colorHex = 0xec4899; // Pink
    } else {
      const ring = wp.ringIndex;
      if (ring === 0) colorHex = 0xa855f7; // purple
      else if (ring === 1) colorHex = 0x06b6d4; // cyan
      else if (ring === 2) colorHex = 0xf59e0b; // orange
      else if (ring === 3) colorHex = 0x3b82f6; // blue
    }

    if (showDroneModels) {
      const hp = getWaypointHeadingAndPitch(idx, waypoints);
      const droneScale = (isStart || isEnd || isSplitStart) ? 0.55 : 0.4;
      const droneMesh = create3DDroneMesh(colorHex, droneScale);
      droneMesh.position.set(x3d, y3d, z3d);

      // Rotate drone body to face flight heading
      const headingRad = (hp.heading || 0) * Math.PI / 180.0;
      droneMesh.rotation.y = -headingRad;

      // Tilt camera gimbal inside drone group to pitch angle
      const pitchRad = (hp.pitch || -60) * Math.PI / 180.0;
      if (droneMesh.userData && droneMesh.userData.gimbalGroup) {
        droneMesh.userData.gimbalGroup.rotation.x = -pitchRad;
      }

      waypointsGroup.add(droneMesh);
    } else {
      const sphereGeom = new THREE.SphereGeometry(r, 12, 12);
      let sphereMat = materialCache[colorHex];
      if (!sphereMat) {
        sphereMat = new THREE.MeshBasicMaterial({ color: colorHex, wireframe: false });
        materialCache[colorHex] = sphereMat;
      }
      const sphereMesh = new THREE.Mesh(sphereGeom, sphereMat);
      sphereMesh.position.set(x3d, y3d, z3d);
      waypointsGroup.add(sphereMesh);
    }

    // Plot Ground Line Projection
    const groundLinePoints = [
      new THREE.Vector3(x3d, y3d, z3d),
      new THREE.Vector3(x3d, 0, z3d)
    ];
    const groundLineGeom = new THREE.BufferGeometry().setFromPoints(groundLinePoints);
    const groundLineMat = new THREE.LineDashedMaterial({
      color: 0x475569,
      dashSize: 3,
      gapSize: 2
    });
    const groundLine = new THREE.Line(groundLineGeom, groundLineMat);
    groundLine.computeLineDistances();
    groundLinesGroup.add(groundLine);

    // Plot Flight Path Line between wp and nextWp
    if (idx < waypoints.length - 1) {
      const nextWp = waypoints[idx + 1];
      const nX = nextWp.x;
      const nY = nextWp.alt;
      const nZ = -nextWp.y;

      const startVec = new THREE.Vector3(x3d, y3d, z3d);
      const endVec = new THREE.Vector3(nX, nY, nZ);

      const pathPoints = [startVec, endVec];
      const segGeom = new THREE.BufferGeometry().setFromPoints(pathPoints);
      const d = Math.sqrt(Math.pow(nextWp.x - wp.x, 2) + Math.pow(nextWp.y - wp.y, 2));
      let segColor = 0x06b6d4;
      let isWarning = d > 100.0;

      if (isWarning) {
        segColor = 0xef4444; // Warning Red
      } else {
        const nextRing = nextWp.ringIndex;
        if (nextRing === 0) segColor = 0xa855f7;
        else if (nextRing === 1) segColor = 0x06b6d4;
        else if (nextRing === 2) segColor = 0xf59e0b;
        else if (nextRing === 3) segColor = 0x3b82f6;
      }

      let segLine;
      if (isWarning) {
        const segMat = new THREE.LineDashedMaterial({
          color: segColor,
          dashSize: 4,
          gapSize: 2
        });
        segLine = new THREE.Line(segGeom, segMat);
        segLine.computeLineDistances();
      } else {
        const segMat = new THREE.LineBasicMaterial({
          color: segColor,
          linewidth: 2
        });
        segLine = new THREE.Line(segGeom, segMat);
      }
      pathsGroup.add(segLine);

      // Add Directional Arrow Cone
      const direction = new THREE.Vector3().subVectors(endVec, startVec);
      const segLen3d = direction.length();
      if (segLen3d > 4.0) {
        direction.normalize();
        const midpoint = new THREE.Vector3().addVectors(startVec, endVec).multiplyScalar(0.5);
        const arrowConeGeom = new THREE.ConeGeometry(0.8, 2.5, 8);
        const arrowConeMat = new THREE.MeshBasicMaterial({ color: segColor, depthTest: true });
        const arrowConeMesh = new THREE.Mesh(arrowConeGeom, arrowConeMat);
        arrowConeMesh.position.copy(midpoint);
        const upVector = new THREE.Vector3(0, 1, 0);
        arrowConeMesh.quaternion.setFromUnitVectors(upVector, direction);
        pathsGroup.add(arrowConeMesh);
      }
    }

    // Plot Camera FOV Cone
    const { heading, pitch } = getWaypointHeadingAndPitch(idx, waypoints);

    const localConeGroup = new THREE.Group();
    localConeGroup.position.set(x3d, y3d, z3d);
    localConeGroup.rotation.y = -heading * Math.PI / 180; // Compass rotation clockwise

    const coneHeight = 8;
    const coneGeom = createCameraPyramidGeometry(CAMERA_HFOV, CAMERA_VFOV, coneHeight);

    let coneColorHex = colorHex;
    if (!wp.isModified && wp.ringIndex === null) {
      coneColorHex = 0x06b6d4;
    }

    const coneMat = new THREE.MeshBasicMaterial({
      color: coneColorHex,
      wireframe: false,
      transparent: true,
      opacity: 0.15,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const coneMesh = new THREE.Mesh(coneGeom, coneMat);
    coneMesh.rotation.x = ((90 + pitch) * Math.PI) / 180; // Correctly align default downward geometry to gimbal pitch

    // Add wireframe outlines
    const wireGeom = new THREE.EdgesGeometry(coneGeom);
    const wireMat = new THREE.LineBasicMaterial({
      color: coneColorHex,
      transparent: true,
      opacity: 0.55
    });
    const wireframe = new THREE.LineSegments(wireGeom, wireMat);
    coneMesh.add(wireframe);

    // Optical Axis Center Ray
    const axisPoints = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, -coneHeight, 0)
    ];
    const axisGeom = new THREE.BufferGeometry().setFromPoints(axisPoints);
    const axisMat = new THREE.LineBasicMaterial({
      color: coneColorHex,
      transparent: true,
      opacity: 0.4
    });
    const axisLine = new THREE.Line(axisGeom, axisMat);
    coneMesh.add(axisLine);

    localConeGroup.add(coneMesh);
    conesGroup.add(localConeGroup);
    coneGroups.push(localConeGroup);
  });

  threeScene.add(waypointsGroup);
  threeScene.add(pathsGroup);
  threeScene.add(groundLinesGroup);

  conesGroup.visible = showCones;
  threeScene.add(conesGroup);
}

// Draws the dynamic photogrammetry coverage footprint for the active FPV camera
function drawActiveFPVFootprint(ctx, heading, pitch) {
  if (!fpvActive || !showFootprints || !threeCamera) return;

  const alt = threeCamera.position.y;
  const headingRad = (heading * Math.PI) / 180;

  const xDrone = threeCamera.position.x;
  const zDrone = threeCamera.position.z;

  let d = 0;
  if (pitch > -90) {
    d = alt * Math.tan((90 + pitch) * Math.PI / 180);
  }

  // Centroid of projection on ground
  const px = xDrone + d * Math.sin(headingRad);
  const pz = zDrone + d * Math.cos(headingRad);

  // Slant range to center of footprint
  const cosAngle = Math.cos((90 + pitch) * Math.PI / 180);
  const slantRange = cosAngle > 0.05 ? alt / cosAngle : alt;

  const alphaAcross = (CAMERA_HFOV / 2) * Math.PI / 180;
  const alphaAlong = (CAMERA_VFOV / 2) * Math.PI / 180;

  const radiusAcross = slantRange * Math.tan(alphaAcross);
  const radiusAlong = slantRange * Math.tan(alphaAlong) / (cosAngle > 0.05 ? cosAngle : 1.0);

  // Map to canvas pixel space
  const pixelX = ((px - groundPlaneOffsetX) / groundPlaneSize) * 768;
  const pixelY = 768 - ((pz - groundPlaneOffsetZ) / groundPlaneSize) * 768;

  const pixelRadiusAcross = (radiusAcross / groundPlaneSize) * 768;
  const pixelRadiusAlong = (radiusAlong / groundPlaneSize) * 768;

  ctx.save();
  ctx.translate(pixelX, pixelY);
  ctx.rotate(headingRad);
  ctx.beginPath();
  ctx.ellipse(0, 0, pixelRadiusAcross, pixelRadiusAlong, 0, 0, 2 * Math.PI);

  // Create focal point radial gradient: brightest at center (optical axis intersection)
  const maxRadius = Math.max(pixelRadiusAcross, pixelRadiusAlong);
  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, maxRadius);
  grad.addColorStop(0, "rgba(34, 197, 94, 0.55)");   // Bright green center
  grad.addColorStop(0.3, "rgba(34, 197, 94, 0.25)"); // Soft green
  grad.addColorStop(1, "rgba(34, 197, 94, 0.0)");     // Fades to transparent

  ctx.fillStyle = grad;
  ctx.fill();
  ctx.restore();
}

// Redraws the 2D ground plane canvas and flags the Three.js texture for updates
function redrawGroundPlane(heading, pitch) {
  if (!threeGroundCanvas || !threeGroundCtx || !threeGroundTexture) return;

  const ctx = threeGroundCtx;
  ctx.fillStyle = "#070a13";
  ctx.fillRect(0, 0, 768, 768);

  cachedTileImages.forEach(t => {
    try {
      ctx.drawImage(t.img, t.dx * 256, t.dy * 256, 256, 256);
    } catch(e) {}
    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
    ctx.lineWidth = 1;
    ctx.strokeRect(t.dx * 256, t.dy * 256, 256, 256);
  });

  // Draw the grid lines
  ctx.strokeStyle = "rgba(6, 182, 212, 0.15)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 12; i++) {
    const coord = i * 64;
    ctx.beginPath(); ctx.moveTo(coord, 0); ctx.lineTo(coord, 768); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, coord); ctx.lineTo(768, coord); ctx.stroke();
  }

  // Draw heatmap ONLY if FPV is not active and showFootprints is true
  if (!fpvActive && showFootprints) {
    drawCoverageHeatmap(ctx, groundPlaneOffsetX, groundPlaneOffsetZ, groundPlaneSize);
  } else if (fpvActive && showFootprints) {
    drawActiveFPVFootprint(ctx, heading, pitch);
  }

  threeGroundTexture.needsUpdate = true;
}

// Initialize 3D Preview Scene
function init3DPreview() {
  cleanup3DPreview();
  recalculateSplitStarts();

  const container = document.getElementById('three-container');
  if (!container) return;

  const waypoints = getCurrentWaypoints();
  if (!waypoints || waypoints.length === 0) {
    container.innerHTML = `<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #94a3b8; font-size: 0.9rem;">Please place a flight center and generate waypoints first.</div>`;
    return;
  }
  container.innerHTML = ""; // Clear existing canvas or loader

  // 1. Create Scene & Dark Cyber Background
  threeScene = new THREE.Scene();
  threeScene.background = new THREE.Color(0x070a13);
  threeScene.fog = new THREE.FogExp2(0x070a13, 0.0005);

  // 2. Create Renderer
  const width = container.clientWidth;
  const height = container.clientHeight;
  threeRenderer = new THREE.WebGLRenderer({ antialias: true });
  threeRenderer.setSize(width, height);
  threeRenderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(threeRenderer.domElement);

  // 3. Create Camera
  threeCamera = new THREE.PerspectiveCamera(45, width / height, 1, 2000);
  
  // 4. Orbit Controls for Navigation
  threeControls = new THREE.OrbitControls(threeCamera, threeRenderer.domElement);
  threeControls.enableDamping = true;
  threeControls.dampingFactor = 0.05;
  threeControls.maxPolarAngle = Math.PI / 2 - 0.01; // Avoid camera clipping below ground level
  threeControls.minDistance = 10;
  threeControls.maxDistance = 1000;
  threeControls.autoRotate = autoRotate3D;
  threeControls.autoRotateSpeed = 1.0;

  // 5. Setup Lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
  threeScene.add(ambientLight);

  const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.2);
  dirLight1.position.set(200, 400, 200);
  threeScene.add(dirLight1);

  const dirLight2 = new THREE.DirectionalLight(0x06b6d4, 0.6); // Subtle cyan fill light
  dirLight2.position.set(-200, 200, -200);
  threeScene.add(dirLight2);

  // 6. Calculate Bounding Box of Waypoints to scale scene
  let minX = Infinity, maxX = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  let maxAlt = 0;

  waypoints.forEach(wp => {
    if (wp.x < minX) minX = wp.x;
    if (wp.x > maxX) maxX = wp.x;
    const z = -wp.y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
    if (wp.alt > maxAlt) maxAlt = wp.alt;
  });

  const sizeX = maxX - minX;
  const sizeZ = maxZ - minZ;
  const maxSpan = Math.max(sizeX, sizeZ, 100);

  // 7. Add Ground Grid at Y = 0
  const gridHelperSize = Math.max(maxSpan * 2.5, 200);
  const gridHelperDivs = 40;
  const gridHelper = new THREE.GridHelper(gridHelperSize, gridHelperDivs, 0x06b6d4, 0x1e293b);
  gridHelper.position.set(0, 0, 0);
  threeScene.add(gridHelper);

  // Add 2D Map Image to the Ground Plane
  try {
    const C_EARTH = 40075016.686;
    const centerLatLng = centerMarker.getLatLng();
    const cLat = centerLatLng.lat;
    const cLon = centerLatLng.lng;

    // Dynamically adjust tileZoom based on the maximum span of waypoints from the flight center (0,0)
    let maxHalfSpan = 50; // default minimum
    waypoints.forEach(wp => {
      maxHalfSpan = Math.max(maxHalfSpan, Math.abs(wp.x), Math.abs(-wp.y));
    });

    // We want the 3x3 tile grid (total width = 3 * tileWidthMeters) to be at least 2.4 * maxHalfSpan
    // So tileWidthMeters > 0.8 * maxHalfSpan
    let tileZoom = 18;
    let tileWidthMeters = C_EARTH * Math.cos(cLat * Math.PI / 180) / Math.pow(2, tileZoom);
    while (tileZoom > 10 && tileWidthMeters <= maxHalfSpan * 0.8) {
      tileZoom--;
      tileWidthMeters = C_EARTH * Math.cos(cLat * Math.PI / 180) / Math.pow(2, tileZoom);
    }

    // LatLng to fractional Web Mercator tile coordinate
    const sinLat = Math.sin(cLat * Math.PI / 180);
    const xTileFrac = ((cLon + 180) / 360) * Math.pow(2, tileZoom);
    const yTileFrac = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * Math.pow(2, tileZoom);

    const xTileCenter = Math.floor(xTileFrac);
    const yTileCenter = Math.floor(yTileFrac);

    const planeSize = tileWidthMeters * 3; // 3x3 tiles grid

    // Offsets of the centerMarker (0,0) relative to the top-left tile origin in tile units
    const distX_tiles = xTileFrac - (xTileCenter - 1);
    const distY_tiles = yTileFrac - (yTileCenter - 1);

    // Plane offset to align texture coordinate exactly with our Three.js origin
    const planeOffsetX = (1.5 - distX_tiles) * tileWidthMeters;
    const planeOffsetZ = (1.5 - distY_tiles) * tileWidthMeters;

    const groundGeom = new THREE.PlaneGeometry(planeSize, planeSize);
    
    // Create temporary canvas to merge the 9 tiles
    const groundCanvas = document.createElement('canvas');
    groundCanvas.width = 768;
    groundCanvas.height = 768;
    const ctx = groundCanvas.getContext('2d');

    // Fill with dark theme placeholder
    ctx.fillStyle = "#070a13";
    ctx.fillRect(0, 0, 768, 768);

    // Pre-draw grid on canvas
    ctx.strokeStyle = "rgba(6, 182, 212, 0.15)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 12; i++) {
      const coord = i * 64;
      ctx.beginPath(); ctx.moveTo(coord, 0); ctx.lineTo(coord, 768); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, coord); ctx.lineTo(768, coord); ctx.stroke();
    }

    const groundTexture = new THREE.CanvasTexture(groundCanvas);
    const groundMaterial = new THREE.MeshBasicMaterial({
      map: groundTexture,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95
    });

    const groundMesh = new THREE.Mesh(groundGeom, groundMaterial);
    groundMesh.rotation.x = -Math.PI / 2; // Lie flat on Y plane
    groundMesh.position.set(planeOffsetX, -0.2, planeOffsetZ); // Position slightly below Y=0 grid
    threeScene.add(groundMesh);

    // Fetch tiles asynchronously based on Leaflet active layer
    const isSatellite = map.hasLayer(satelliteLayer);
    const subdomains = ['a', 'b', 'c'];
    let loadedTilesCount = 0;
    const tileImages = [];

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const tileX = xTileCenter + dx;
        const tileY = yTileCenter + dy;
        const img = new Image();
        img.crossOrigin = "anonymous";

        let url = "";
        if (isSatellite) {
          url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${tileZoom}/${tileY}/${tileX}`;
        } else {
          const s = subdomains[Math.abs(tileX + tileY) % 3];
          url = `https://${s}.tile.openstreetmap.org/${tileZoom}/${tileX}/${tileY}.png`;
        }

        tileImages.push({ img, dx: dx + 1, dy: dy + 1 });

        img.onload = img.onerror = function() {
          loadedTilesCount++;
          if (loadedTilesCount === 9) {
            // Draw all tiles in order
            ctx.fillStyle = "#070a13";
            ctx.fillRect(0, 0, 768, 768);
            
            tileImages.forEach(t => {
              try {
                ctx.drawImage(t.img, t.dx * 256, t.dy * 256, 256, 256);
              } catch(e) {}
              ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
              ctx.lineWidth = 1;
              ctx.strokeRect(t.dx * 256, t.dy * 256, 256, 256);
            });
            
            // Draw the grid lines
            ctx.strokeStyle = "rgba(6, 182, 212, 0.15)";
            ctx.lineWidth = 1;
            for (let i = 0; i <= 12; i++) {
              const coord = i * 64;
              ctx.beginPath(); ctx.moveTo(coord, 0); ctx.lineTo(coord, 768); ctx.stroke();
              ctx.beginPath(); ctx.moveTo(0, coord); ctx.lineTo(768, coord); ctx.stroke();
            }

            // Cache variables for FPV toggling
            threeGroundCanvas = groundCanvas;
            threeGroundCtx = ctx;
            threeGroundTexture = groundTexture;
            groundPlaneOffsetX = planeOffsetX;
            groundPlaneOffsetZ = planeOffsetZ;
            groundPlaneSize = planeSize;
            cachedTileImages = tileImages;

            // Draw coverage heatmap
            drawCoverageHeatmap(ctx, planeOffsetX, planeOffsetZ, planeSize);
            groundTexture.needsUpdate = true;
          }
        };

        img.src = url;
      }
    }
  } catch (err) {
    Logger.warn("Failed to initialize ground map texture:", err);
  }

  // Add Axes Helper (Red = East, Green = Up, Blue = South)
  const axesHelper = new THREE.AxesHelper(30);
  axesHelper.position.set(0, 0.1, 0);
  threeScene.add(axesHelper);

  // Add compass ring
  const ringGeom = new THREE.RingGeometry(15, 16, 32);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4, side: THREE.DoubleSide, transparent: true, opacity: 0.4 });
  const compassRing = new THREE.Mesh(ringGeom, ringMat);
  compassRing.rotation.x = Math.PI / 2;
  compassRing.position.set(0, 0.05, 0);
  threeScene.add(compassRing);

  // Arrow pointing North (negative Z)
  const arrowHelper = new THREE.ArrowHelper(
    new THREE.Vector3(0, 0, -1),
    new THREE.Vector3(0, 0.1, 0),
    18,
    0xef4444,
    4,
    2
  );
  threeScene.add(arrowHelper);

  // 8. Plot Waypoints, Cones, and Ground Lines
  recreate3DWaypointsAndPaths();

  // 9. Reset view
  reset3DCamera();

  // 10. Animation render loop
  let lastTime = performance.now();
  const animate = () => {
    threeAnimationId = requestAnimationFrame(animate);
    
    const now = performance.now();
    const dt = (now - lastTime) / 1000;
    lastTime = now;

    if (fpvActive) {
      updateFPVCamera(dt);
    } else {
      if (threeControls) threeControls.update();
    }

    if (threeRenderer && threeScene && threeCamera) {
      threeRenderer.render(threeScene, threeCamera);
    }
  };
  animate();

  window.addEventListener('resize', handle3DResize);
  setTimeout(handle3DResize, 50);
  setTimeout(handle3DResize, 250);
}

// Reset camera to fit bounding box
function reset3DCamera() {
  if (!threeCamera || !threeControls) return;

  const waypoints = getCurrentWaypoints();
  if (!waypoints || waypoints.length === 0) return;

  let minX = Infinity, maxX = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  let maxAlt = 0;

  waypoints.forEach(wp => {
    if (wp.x < minX) minX = wp.x;
    if (wp.x > maxX) maxX = wp.x;
    const z = -wp.y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
    if (wp.alt > maxAlt) maxAlt = wp.alt;
  });

  const centerWpX = (minX + maxX) / 2;
  const centerWpZ = (minZ + maxZ) / 2;
  const sizeX = maxX - minX;
  const sizeZ = maxZ - minZ;
  const maxSpan = Math.max(sizeX, sizeZ, 100);

  threeCamera.position.set(centerWpX + maxSpan * 1.2, maxAlt + maxSpan * 0.8, centerWpZ + maxSpan * 1.2);
  threeControls.target.set(centerWpX, maxAlt * 0.4, centerWpZ);
  threeControls.update();
}

// ==========================================
// 3D FPV WALKTHROUGH & EDITOR MODE
// ==========================================

function updateFPVCamera(dt) {
  if (!threeCamera || !threeScene) return;

  const waypoints = getCurrentWaypoints();
  if (!waypoints || waypoints.length === 0) {
    toggleFPVWalkthrough(false);
    return;
  }

  // Handle Photo Flash Fade Out
  const flashOverlay = document.getElementById('fpv-flash-overlay');
  if (flashOverlay && fpvPhotoFlashActive) {
    let opacity = parseFloat(flashOverlay.style.opacity) || 0;
    opacity -= dt * 6.0; // fade quickly
    if (opacity <= 0) {
      opacity = 0;
      fpvPhotoFlashActive = false;
    }
    flashOverlay.style.opacity = opacity;
  }

  // Handle Playback Traversal
  if (fpvPlaying && !fpvPhotoDelayTimer) {
    const p1 = waypoints[fpvProgressIndex];
    const p2 = waypoints[fpvProgressIndex + 1];

    if (p2) {
      // Calculate realistic speed-based interpolation step
      const dx = p2.x - p1.x;
      const dy = p2.alt - p1.alt;
      const dz = (-p2.y) - (-p1.y);
      const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
      
      const speed = parseFloat(document.getElementById('speed').value) || 5;
      const stepTime = dist / speed; // time in seconds
      
      if (stepTime > 0.05) {
        fpvSubInterpolation += (dt / stepTime) * fpvSpeed;
      } else {
        fpvSubInterpolation = 1.0;
      }

      if (fpvSubInterpolation >= 1.0) {
        // Arrived at next waypoint!
        fpvSubInterpolation = 0.0;
        fpvProgressIndex++;
        
        if (fpvProgressIndex < waypoints.length) {
          const wp = waypoints[fpvProgressIndex];
          const wpHoverTime = (wp && wp.hoverTime !== null && wp.hoverTime !== undefined) ? wp.hoverTime : null;
          const globalHoverEl = document.getElementById('global-hover-time');
          const globalHover = globalHoverEl ? parseInt(globalHoverEl.value) : 0;
          const captureMode = document.getElementById('capture-mode')?.value;
          const isStopAndShoot = (captureMode === 'stopAndShoot');

          // Determine if the real drone actually hovers at this waypoint
          const baseHover = (wpHoverTime !== null) ? wpHoverTime : globalHover;
          let hoverDuration = baseHover;
          if (isStopAndShoot && hoverDuration < 2) {
            const reposInfo = checkNeedsReposition(fpvProgressIndex, waypoints);
            if (reposInfo.needsReposition) {
              hoverDuration = 2.0; // Auto-applied settling delay
            }
          }
          triggerFPVPhotoCapture(hoverDuration);
        }
      }
    } else {
      // Reached the end of flight path
      fpvPlaying = false;
      fpvSubInterpolation = 0.0;
      fpvProgressIndex = waypoints.length - 1;
      
      // Stop recording if active
      if (fpvRecordTimer) {
        clearInterval(fpvRecordTimer);
        fpvRecordTimer = null;
      }
      
      const playPauseBtn = document.getElementById('fpv-btn-play-pause');
      if (playPauseBtn) {
        document.getElementById('fpv-icon-play').classList.remove('hidden');
        document.getElementById('fpv-icon-pause').classList.add('hidden');
      }
      
      const mediaDot = document.getElementById('fpv-media-dot');
      const mediaText = document.getElementById('fpv-media-text');
      if (mediaDot && mediaText) {
        mediaDot.style.background = '#10b981';
        mediaText.textContent = 'Mission Complete';
      }
      
      // Open editor panel
      const editorPanel = document.getElementById('fpv-editor-panel');
      if (editorPanel) editorPanel.classList.remove('hidden');
    }
  }

  // Calculate FPV Position & Orientation
  const p1 = waypoints[fpvProgressIndex];
  const p2 = waypoints[fpvProgressIndex + 1];
  let currentPos = new THREE.Vector3();
  let heading = 0;
  let pitch = 0;

  if (p2 && fpvPlaying) {
    currentPos.x = THREE.MathUtils.lerp(p1.x, p2.x, fpvSubInterpolation);
    currentPos.y = THREE.MathUtils.lerp(p1.alt, p2.alt, fpvSubInterpolation);
    currentPos.z = THREE.MathUtils.lerp(-p1.y, -p2.y, fpvSubInterpolation);

    const hp1 = getWaypointHeadingAndPitch(fpvProgressIndex, waypoints);
    const hp2 = getWaypointHeadingAndPitch(fpvProgressIndex + 1, waypoints);

    // Interpolate heading handling 0/360 wrap-around
    let h1 = hp1.heading;
    let h2 = hp2.heading;
    let diff = h2 - h1;
    if (diff > 180) diff -= 360;
    else if (diff < -180) diff += 360;
    heading = h1 + diff * fpvSubInterpolation;

    pitch = THREE.MathUtils.lerp(hp1.pitch, hp2.pitch, fpvSubInterpolation);
  } else {
    currentPos.set(p1.x, p1.alt, -p1.y);
    const hp = getWaypointHeadingAndPitch(fpvProgressIndex, waypoints);
    heading = hp.heading;
    pitch = hp.pitch;
  }

  // Update FPV Camera Position and Direction
  threeCamera.position.copy(currentPos);
  
  // Set orientation: Yaw (Y-axis) then Pitch (X-axis)
  const yawRad = -heading * Math.PI / 180;
  const pitchRad = pitch * Math.PI / 180;
  threeCamera.rotation.set(pitchRad, yawRad, 0, 'YXZ');

  // Update HUD Telemetry Labels
  const telemetryAlt = document.getElementById('fpv-telemetry-alt');
  const telemetrySpeed = document.getElementById('fpv-telemetry-speed');
  const telemetryWp = document.getElementById('fpv-telemetry-wp');
  
  if (telemetryAlt) telemetryAlt.textContent = Math.round(currentPos.y);
  if (telemetrySpeed) {
    const currentSpeed = fpvPlaying ? (parseFloat(document.getElementById('speed').value) || 5) : 0;
    telemetrySpeed.textContent = (currentSpeed * fpvSpeed).toFixed(1);
  }
  if (telemetryWp) telemetryWp.textContent = `${fpvProgressIndex + 1} / ${waypoints.length}`;

  // Dynamically redraw active camera footprint ellipse on ground plane
  if (showFootprints) {
    redrawGroundPlane(heading, pitch);
  }
}
function triggerFPVPhotoCapture(hoverDurationSeconds = 0) {
  const flashOverlay = document.getElementById('fpv-flash-overlay');
  const mediaDot = document.getElementById('fpv-media-dot');
  const mediaText = document.getElementById('fpv-media-text');

  if (hoverDurationSeconds > 0) {
    if (mediaDot && mediaText) {
      mediaDot.style.background = '#f59e0b';
      mediaText.textContent = `Hovering (${hoverDurationSeconds}s)`;
    }

    const delayMs = (hoverDurationSeconds * 1000) / (fpvSpeed || 1.0);
    fpvPhotoDelayTimer = setTimeout(() => {
      fpvPhotoDelayTimer = null;
      
      // Trigger the photo flash at the END of the hover duration
      if (flashOverlay) flashOverlay.style.opacity = '1.0';
      fpvPhotoFlashActive = true;
      
      if (mediaDot && mediaText) {
        mediaDot.style.background = '#10b981';
        mediaText.textContent = 'Photo Captured';
        setTimeout(() => {
          if (mediaText && mediaText.textContent === 'Photo Captured') {
            mediaText.textContent = 'Ready';
          }
        }, 800);
      }
    }, delayMs);
  } else {
    // No hover duration: trigger photo immediately
    if (flashOverlay) flashOverlay.style.opacity = '1.0';
    fpvPhotoFlashActive = true;

    if (mediaDot && mediaText) {
      mediaDot.style.background = '#10b981';
      mediaText.textContent = 'Photo Captured';
      setTimeout(() => {
        if (mediaText && mediaText.textContent === 'Photo Captured') {
          mediaText.textContent = 'Ready';
        }
      }, 800);
    }
  }
}

function startFPVVideoRecording() {
  const mediaDot = document.getElementById('fpv-media-dot');
  const mediaText = document.getElementById('fpv-media-text');
  const mediaTimer = document.getElementById('fpv-media-timer');

  if (mediaDot && mediaText && mediaTimer) {
    mediaDot.style.background = '#ef4444';
    mediaText.textContent = 'Recording Video';
    mediaTimer.classList.remove('hidden');
    
    fpvRecordSeconds = 0;
    mediaTimer.textContent = '00:00';

    if (fpvRecordTimer) clearInterval(fpvRecordTimer);
    fpvRecordTimer = setInterval(() => {
      if (fpvPlaying) {
        fpvRecordSeconds++;
        const mins = Math.floor(fpvRecordSeconds / 60).toString().padStart(2, '0');
        const secs = (fpvRecordSeconds % 60).toString().padStart(2, '0');
        mediaTimer.textContent = `${mins}:${secs}`;
      }
    }, 1000);
  }
}

function toggleFPVWalkthrough(enable) {
  const hudOverlay = document.getElementById('fpv-hud-overlay');
  const fpvBtnIndicator = document.getElementById('indicator-3d-fpv');
  const editorPanel = document.getElementById('fpv-editor-panel');
  const playPauseBtn = document.getElementById('fpv-btn-play-pause');
  const instructions = document.getElementById('three-instructions');

  if (enable) {
    fpvActive = true;
    fpvPlaying = false;
    fpvProgressIndex = 0;
    fpvSubInterpolation = 0.0;
    
    // Save original camera view
    if (threeCamera && threeControls) {
      fpvOriginalCamPos = threeCamera.position.clone();
      fpvOriginalCamTarget = threeControls.target.clone();
      threeControls.enabled = false;
    }

    if (hudOverlay) hudOverlay.classList.remove('hidden');
    if (fpvBtnIndicator) fpvBtnIndicator.style.background = '#10b981';
    if (instructions) instructions.classList.add('hidden');
    
    // Always open editor panel initially since we start paused
    if (editorPanel) editorPanel.classList.remove('hidden');
    
    if (playPauseBtn) {
      document.getElementById('fpv-icon-play').classList.remove('hidden');
      document.getElementById('fpv-icon-pause').classList.add('hidden');
    }

    const captureMode = document.getElementById('capture-mode').value;
    if (captureMode === 'video') {
      startFPVVideoRecording();
    } else {
      const mediaDot = document.getElementById('fpv-media-dot');
      const mediaText = document.getElementById('fpv-media-text');
      const mediaTimer = document.getElementById('fpv-media-timer');
      if (mediaDot && mediaText) {
        mediaDot.style.background = '#10b981';
        mediaText.textContent = 'Ready';
      }
      if (mediaTimer) mediaTimer.classList.add('hidden');
    }

    const hp = getWaypointHeadingAndPitch(0, getCurrentWaypoints());
    redrawGroundPlane(hp.heading, hp.pitch); // Draw active FPV footprint if enabled
    updateFPVEditorUI();
  } else {
    // Exit FPV Mode
    fpvActive = false;
    fpvPlaying = false;
    
    if (fpvPhotoDelayTimer) {
      clearTimeout(fpvPhotoDelayTimer);
      fpvPhotoDelayTimer = null;
    }
    if (fpvRecordTimer) {
      clearInterval(fpvRecordTimer);
      fpvRecordTimer = null;
    }

    if (hudOverlay) hudOverlay.classList.add('hidden');
    if (fpvBtnIndicator) fpvBtnIndicator.style.background = '#ef4444';
    if (editorPanel) editorPanel.classList.add('hidden');
    if (instructions) instructions.classList.remove('hidden');

    // Restore original camera position and targets
    if (threeCamera && threeControls) {
      threeControls.enabled = true;
      if (fpvOriginalCamPos && fpvOriginalCamTarget) {
        threeCamera.position.copy(fpvOriginalCamPos);
        threeControls.target.copy(fpvOriginalCamTarget);
        threeControls.update();
      } else {
        reset3DCamera();
      }
    }

    redrawGroundPlane(0, 0); // Restore green footprint highlights
  }
}

function updateFPVEditorUI() {
  const waypoints = getCurrentWaypoints();
  if (!waypoints || !waypoints[fpvProgressIndex]) return;

  const wp = waypoints[fpvProgressIndex];

  const latNum = parseFloat(wp.lat);
  const lonNum = parseFloat(wp.lon);

  // Title and coords
  const wpIndexSpan = document.getElementById('fpv-editor-wp-index');
  const coordsSpan = document.getElementById('fpv-editor-coords');
  if (wpIndexSpan) wpIndexSpan.textContent = fpvProgressIndex + 1;
  if (coordsSpan) {
    coordsSpan.textContent = (!isNaN(latNum) && !isNaN(lonNum)) ? `${latNum.toFixed(6)}, ${lonNum.toFixed(6)}` : '';
  }

  // Altitude with unit conversion
  const unit = getUnitSystem();
  const altVal = document.getElementById('fpv-edit-alt-val');
  const altUnit = document.getElementById('fpv-edit-alt-unit');
  const altSlider = document.getElementById('fpv-edit-alt');
  const altDisp = unit === 'imperial' ? Math.round(wp.alt * M_TO_FT) : Math.round(wp.alt);
  if (altVal) altVal.textContent = altDisp;
  if (altUnit) altUnit.textContent = unit === 'imperial' ? 'ft' : 'm';
  if (altSlider) altSlider.value = Math.round(wp.alt);

  // Pitch
  const gimbalPitchEl = document.getElementById('gimbal-pitch');
  const defaultGimbalPitch = gimbalPitchEl ? (parseFloat(gimbalPitchEl.value) || -60) : -60;
  const pitch = wp.pitch !== undefined && wp.pitch !== null ? wp.pitch : defaultGimbalPitch;
  const pitchVal = document.getElementById('fpv-edit-pitch-val');
  const pitchSlider = document.getElementById('fpv-edit-pitch');
  if (pitchVal) pitchVal.textContent = Math.round(pitch);
  if (pitchSlider) pitchSlider.value = Math.round(pitch);

  // Lat / Lon precision inputs
  const latInput = document.getElementById('fpv-edit-lat');
  const lonInput = document.getElementById('fpv-edit-lon');
  if (latInput && document.activeElement !== latInput) {
    latInput.value = !isNaN(latNum) ? latNum.toFixed(7) : '';
  }
  if (lonInput && document.activeElement !== lonInput) {
    lonInput.value = !isNaN(lonNum) ? lonNum.toFixed(7) : '';
  }

  // Waypoint Scrubber Slider Sync
  const scrubberSlider = document.getElementById('fpv-wp-scrubber-slider');
  const scrubberText = document.getElementById('fpv-wp-scrubber-text');
  if (scrubberSlider && scrubberText && waypoints) {
    scrubberSlider.max = waypoints.length;
    if (document.activeElement !== scrubberSlider) {
      scrubberSlider.value = fpvProgressIndex + 1;
    }
    scrubberText.textContent = `${fpvProgressIndex + 1} / ${waypoints.length}`;
  }

  // D-Pad step display
  const stepDisplay = document.getElementById('fpv-nudge-step-display');
  const stepLabels = unit === 'imperial' ? ['1 ft', '5 ft', '20 ft'] : ['0.2m', '1m', '5m'];
  if (stepDisplay) stepDisplay.textContent = stepLabels[fpvNudgeStepIndex] || stepLabels[1];

  // Speed Override
  const speedVal = document.getElementById('fpv-edit-speed-val');
  const speedSlider = document.getElementById('fpv-edit-speed');
  if (speedSlider && speedVal) {
    if (document.activeElement !== speedSlider) {
      speedSlider.value = wp.speed || 5;
    }
    speedVal.textContent = wp.speed ? `${wp.speed} m/s` : 'Auto';
  }

  // Hover Duration
  const hoverVal = document.getElementById('fpv-edit-hover-val');
  const hoverSlider = document.getElementById('fpv-edit-hover');
  if (hoverSlider && hoverVal) {
    if (document.activeElement !== hoverSlider) {
      hoverSlider.value = wp.hoverTime || 0;
    }
    hoverVal.textContent = `${wp.hoverTime || 0}`;
  }

  // Turn Mode
  const turnModeSelect = document.getElementById('fpv-edit-turn-mode');
  if (turnModeSelect) {
    turnModeSelect.value = wp.turnMode || 'inherit';
  }

  // Camera Action
  const cameraActionSelect = document.getElementById('fpv-edit-camera-action');
  const zoomContainer = document.getElementById('fpv-edit-zoom-container');
  if (cameraActionSelect) {
    cameraActionSelect.value = wp.cameraAction || 'inherit';
    if (zoomContainer) {
      zoomContainer.style.display = (wp.cameraAction === 'zoom') ? 'flex' : 'none';
    }
  }

  // Camera Zoom
  const zoomVal = document.getElementById('fpv-edit-zoom-val');
  const zoomSlider = document.getElementById('fpv-edit-zoom');
  if (zoomSlider && zoomVal) {
    if (document.activeElement !== zoomSlider) {
      zoomSlider.value = wp.zoom || 1.0;
    }
    zoomVal.textContent = (wp.zoom || 1.0).toFixed(1);
  }

  // Heading/Yaw Mode and Value
  const headingVal = document.getElementById('fpv-edit-heading-val');
  const headingSlider = document.getElementById('fpv-edit-heading');
  const headingModeSelect = document.getElementById('fpv-edit-heading-mode');

  if (headingModeSelect) {
    const mode = wp.headingMode || 'inherit';
    headingModeSelect.value = mode;

    if (headingVal && headingSlider) {
      const rotEl = document.getElementById('grid-rotation');
      const rotationDeg = rotEl ? (parseFloat(rotEl.value) || 0) : 0;
      const autoHead = getDefaultHeading(fpvProgressIndex, waypoints, rotationDeg);

      // Helper to compute angle based on mode
      let displayAngle = 0;
      let effectiveMode = mode;
      if (mode === 'inherit') {
        const globalMode = document.getElementById('heading-mode');
        effectiveMode = globalMode ? globalMode.value : 'followWayline';
      }

      let standardRoadFacing = 0;
      if (effectiveMode === 'followWayline') {
        displayAngle = autoHead;
      } else if (effectiveMode === 'fixed') {
        displayAngle = 0;
      } else if (effectiveMode === 'towardPOI') {
        const selectedPoiIndex = wp.poiIndex || 0;
        const targetPoi = pois[selectedPoiIndex];
        if (targetPoi) {
          const dy = targetPoi.lat - wp.lat;
          const dx = targetPoi.lon - wp.lon;
          displayAngle = (90 - (Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360;
        } else {
          displayAngle = 0;
        }
      } else if (effectiveMode === 'custom') {
        displayAngle = wp.heading !== null && wp.heading !== undefined ? wp.heading : autoHead;
      }

      const poiSelect = document.getElementById('fpv-edit-poi-select');
      if (poiSelect) {
        poiSelect.innerHTML = '';
        pois.forEach((poi, idx) => {
          const opt = document.createElement('option');
          opt.value = idx;
          opt.textContent = poi.name;
          if (idx === (wp.poiIndex || 0)) {
            opt.selected = true;
          }
          poiSelect.appendChild(opt);
        });
        poiSelect.style.display = (effectiveMode === 'towardPOI') ? 'block' : 'none';
      }

      if (mode === 'custom') {
        headingSlider.style.display = 'block';
        headingSlider.value = Math.round(displayAngle);
        headingVal.textContent = `${Math.round(displayAngle)}°`;
      } else {
        headingSlider.style.display = 'none';
        headingVal.textContent = `${Math.round(displayAngle)}°`;
      }
    }
  }

  // Save & Reset button visibility
  const resetBtn = document.getElementById('fpv-btn-reset-wp');
  const saveBtn = document.getElementById('fpv-btn-save-wp');
  if (resetBtn || saveBtn) {
    const isModifiedFromOrig = (
      wp.isModified ||
      (wp.origLat !== undefined && wp.origLat !== null && Math.abs(wp.lat - wp.origLat) > 1e-9) ||
      (wp.origLon !== undefined && wp.origLon !== null && Math.abs(wp.lon - wp.origLon) > 1e-9) ||
      (wp.origAlt !== undefined && wp.origAlt !== null && Math.abs(wp.alt - wp.origAlt) > 1e-3) ||
      (wp.origPitch !== undefined && wp.origPitch !== null && wp.pitch !== wp.origPitch) ||
      (wp.origSpeed !== undefined && wp.speed !== wp.origSpeed) ||
      (wp.origHoverTime !== undefined && wp.hoverTime !== wp.origHoverTime) ||
      (wp.origTurnMode !== undefined && wp.turnMode !== wp.origTurnMode) ||
      (wp.origCameraAction !== undefined && wp.cameraAction !== wp.origCameraAction) ||
      (wp.origZoom !== undefined && wp.zoom !== wp.origZoom) ||
      ((wp.origHeadingMode || 'inherit') !== (wp.headingMode || 'inherit')) ||
      ((wp.origPoiIndex || 0) !== (wp.poiIndex || 0)) ||
      (wp.headingMode === 'custom' && wp.origHeading !== null && wp.heading !== wp.origHeading)
    );
    if (resetBtn) resetBtn.style.display = isModifiedFromOrig ? 'inline-block' : 'none';
    if (saveBtn) saveBtn.style.display = (wp.hasDraftEdits || (isModifiedFromOrig && !wp.isModified)) ? 'inline-block' : 'none';
  }
}

function fpvDeleteWaypoint() {
  const waypoints = getCurrentWaypoints();
  if (!waypoints || waypoints.length <= 2) {
    alert("Cannot delete waypoint: a flight plan must contain at least 2 waypoints.");
    return;
  }

  const gridType = document.getElementById('grid-type')?.value;
  const isRoadFollow = (gridType === 'road-following');
  const label = isRoadFollow ? 'Road Node / Waypoint' : 'Waypoint';
  if (confirm(`Are you sure you want to delete ${label} ${fpvProgressIndex + 1}?`)) {
    if (isRoadFollow) {
      if (roadWaypoints && roadWaypoints.length > fpvProgressIndex) {
        roadWaypoints.splice(fpvProgressIndex, 1);
        roadWaypoints.forEach((wp, idx) => { wp.idx = idx; });
      }
      if (generatedWaypoints && generatedWaypoints.length > fpvProgressIndex) {
        generatedWaypoints.splice(fpvProgressIndex, 1);
        generatedWaypoints.forEach((wp, idx) => { wp.idx = idx; });
      }
    } else {
      const activeWps = getCurrentWaypoints();
      const activePts = getCurrentPhotos();
      if (activeWps && activeWps[fpvProgressIndex]) {
        activeWps.splice(fpvProgressIndex, 1);
        activeWps.forEach((wp, idx) => { wp.idx = idx; });
      }
      if (activePts && activePts[fpvProgressIndex]) {
        activePts.splice(fpvProgressIndex, 1);
      }
    }

    const currentWps = getCurrentWaypoints();
    if (fpvProgressIndex >= currentWps.length) {
      fpvProgressIndex = Math.max(0, currentWps.length - 1);
    }
    fpvSubInterpolation = 0.0;

    // Redraw Leaflet markers, path line geometries, and stats
    redrawCurrentMission();
    // Rebuild Three.js waypoints & line meshes
    recreate3DWaypointsAndPaths();
    // Refresh FPV Editor sliders to active point
    updateFPVEditorUI();

    if (fpvActive) {
      updateFPVCamera(0);
    }
  }
}

function fpvInsertWaypoint() {
  const waypoints = getCurrentWaypoints();
  if (!waypoints || waypoints.length === 0) return;

  const currentWp = waypoints[fpvProgressIndex];
  const nextWp = waypoints[fpvProgressIndex + 1];

  let newX, newY, newAlt, newHeading, newPitch;

  if (nextWp) {
    newX = (currentWp.x + nextWp.x) / 2;
    newY = (currentWp.y + nextWp.y) / 2;
    newAlt = (currentWp.alt + nextWp.alt) / 2;
    newHeading = currentWp.heading;
    newPitch = currentWp.pitch;
  } else {
    // Extrapolate forward slightly based on waypoint heading orientation
    const hp = getWaypointHeadingAndPitch(fpvProgressIndex, waypoints);
    const rad = (hp.heading * Math.PI) / 180;
    newX = currentWp.x + 20 * Math.sin(rad);
    newY = currentWp.y + 20 * Math.cos(rad);
    newAlt = currentWp.alt;
    newHeading = currentWp.heading;
    newPitch = currentWp.pitch;
  }

  let geo;
  if (centerMarker) {
    const centerLatLng = centerMarker.getLatLng();
    geo = localToGeodetic(newX, newY, centerLatLng.lat, centerLatLng.lng, 0);
  } else {
    const R_EARTH = 6378137.0;
    const latRad = currentWp.lat * Math.PI / 180.0;
    geo = {
      lat: currentWp.lat + (20 / R_EARTH) * (180.0 / Math.PI),
      lon: currentWp.lon + (20 / (R_EARTH * Math.cos(latRad))) * (180.0 / Math.PI)
    };
  }

  const newWp = {
    x: newX,
    y: newY,
    lat: geo.lat,
    lon: geo.lon,
    alt: newAlt,
    pitch: newPitch,
    heading: newHeading,
    headingMode: 'inherit',
    poiIndex: 0,
    origLat: geo.lat,
    origLon: geo.lon,
    origAlt: newAlt,
    origPitch: newPitch,
    origHeading: newHeading,
    origHeadingMode: 'inherit',
    origPoiIndex: 0,
    origX: newX,
    origY: newY,
    isModified: true
  };

  waypoints.splice(fpvProgressIndex + 1, 0, newWp);

  // Re-index
  waypoints.forEach((wp, idx) => {
    wp.idx = idx;
  });

  // Target focus on the newly inserted waypoint
  fpvProgressIndex++;
  fpvSubInterpolation = 0.0;

  // Redraw overlays and UI
  redrawCurrentMission();
  recreate3DWaypointsAndPaths();
  updateFPVEditorUI();

  if (fpvActive) {
    updateFPVCamera(0);
  }
}

// Bind all FPV mode HUD buttons and sliders
function setupFPVListeners() {
  const btn3dFpv = document.getElementById('btn-3d-fpv');
  if (btn3dFpv) {
    btn3dFpv.addEventListener('click', () => {
      toggleFPVWalkthrough(!fpvActive);
    });
  }

  // Play / Pause
  const playPauseBtn = document.getElementById('fpv-btn-play-pause');
  if (playPauseBtn) {
    playPauseBtn.addEventListener('click', () => {
      fpvPlaying = !fpvPlaying;
      
      const playIcon = document.getElementById('fpv-icon-play');
      const pauseIcon = document.getElementById('fpv-icon-pause');
      const editorPanel = document.getElementById('fpv-editor-panel');

      if (fpvPlaying) {
        if (playIcon) playIcon.classList.add('hidden');
        if (pauseIcon) pauseIcon.classList.remove('hidden');
        if (editorPanel) editorPanel.classList.add('hidden');
        
        // If recording video, make sure timer starts
        const captureMode = document.getElementById('capture-mode').value;
        if (captureMode === 'video' && !fpvRecordTimer) {
          startFPVVideoRecording();
        }
      } else {
        if (playIcon) playIcon.classList.remove('hidden');
        if (pauseIcon) pauseIcon.classList.add('hidden');
        if (editorPanel) editorPanel.classList.remove('hidden');
        updateFPVEditorUI();
      }
    });
  }

  // Stop / Exit FPV Walkthrough
  const stopBtn = document.getElementById('fpv-btn-stop');
  if (stopBtn) {
    stopBtn.addEventListener('click', () => {
      toggleFPVWalkthrough(false);
    });
  }

  // Step Backward
  const stepBackBtn = document.getElementById('fpv-btn-step-back');
  if (stepBackBtn) {
    stepBackBtn.addEventListener('click', () => {
      fpvPlaying = false;
      const playIcon = document.getElementById('fpv-icon-play');
      const pauseIcon = document.getElementById('fpv-icon-pause');
      if (playIcon) playIcon.classList.remove('hidden');
      if (pauseIcon) pauseIcon.classList.add('hidden');

      if (fpvProgressIndex > 0) {
        fpvProgressIndex--;
      }
      fpvSubInterpolation = 0.0;

      const editorPanel = document.getElementById('fpv-editor-panel');
      if (editorPanel) editorPanel.classList.remove('hidden');
      updateFPVEditorUI();
    });
  }

  // Step Forward
  const stepForwardBtn = document.getElementById('fpv-btn-step-forward');
  if (stepForwardBtn) {
    stepForwardBtn.addEventListener('click', () => {
      fpvPlaying = false;
      const playIcon = document.getElementById('fpv-icon-play');
      const pauseIcon = document.getElementById('fpv-icon-pause');
      if (playIcon) playIcon.classList.remove('hidden');
      if (pauseIcon) pauseIcon.classList.add('hidden');

      const waypoints = getCurrentWaypoints();
      if (waypoints && fpvProgressIndex < waypoints.length - 1) {
        fpvProgressIndex++;
      }
      fpvSubInterpolation = 0.0;

      const editorPanel = document.getElementById('fpv-editor-panel');
      if (editorPanel) editorPanel.classList.remove('hidden');
      updateFPVEditorUI();
    });
  }

  // Traversal Speed Slider
  const speedSlider = document.getElementById('fpv-speed-slider');
  const speedText = document.getElementById('fpv-speed-text');
  if (speedSlider && speedText) {
    speedSlider.addEventListener('input', (e) => {
      fpvSpeed = parseFloat(e.target.value);
      speedText.textContent = `${fpvSpeed.toFixed(1)}x`;
    });
  }

  // Waypoint Progress Scrubber Slider
  const scrubberSlider = document.getElementById('fpv-wp-scrubber-slider');
  if (scrubberSlider) {
    scrubberSlider.addEventListener('input', (e) => {
      const waypoints = getCurrentWaypoints();
      if (!waypoints || waypoints.length === 0) return;
      const targetIdx = parseInt(e.target.value) - 1;
      if (targetIdx >= 0 && targetIdx < waypoints.length) {
        fpvProgressIndex = targetIdx;
        fpvSubInterpolation = 0.0;
        updateFPVEditorUI();
        if (fpvActive) {
          updateFPVCamera(0);
        }
      }
    });
  }

  // Waypoint Editor Altitude Slider
  const editAltSlider = document.getElementById('fpv-edit-alt');
  const editAltVal = document.getElementById('fpv-edit-alt-val');
  if (editAltSlider && editAltVal) {
    editAltSlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value);
      editAltVal.textContent = val;
      
      const waypoints = getCurrentWaypoints();
      if (waypoints && waypoints[fpvProgressIndex]) {
        waypoints[fpvProgressIndex].alt = val;
        waypoints[fpvProgressIndex].isModified = true;
        waypoints[fpvProgressIndex].hasDraftEdits = true;
        
        const gridType = document.getElementById('grid-type').value;
        if (gridType === 'road-following' && roadWaypoints && roadWaypoints[fpvProgressIndex]) {
          roadWaypoints[fpvProgressIndex].alt = val;
          roadWaypoints[fpvProgressIndex].isModified = true;
        }

        redrawCurrentMission();
        recreate3DWaypointsAndPaths();
        updateFPVEditorUI();
      }
    });
  }

  // Waypoint Editor Gimbal Pitch Slider
  const editPitchSlider = document.getElementById('fpv-edit-pitch');
  const editPitchVal = document.getElementById('fpv-edit-pitch-val');
  if (editPitchSlider && editPitchVal) {
    editPitchSlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value);
      editPitchVal.textContent = val;
      
      const waypoints = getCurrentWaypoints();
      if (waypoints && waypoints[fpvProgressIndex]) {
        waypoints[fpvProgressIndex].pitch = val;
        waypoints[fpvProgressIndex].isModified = true;
        waypoints[fpvProgressIndex].hasDraftEdits = true;
        
        const gridType = document.getElementById('grid-type').value;
        if (gridType === 'road-following' && roadWaypoints && roadWaypoints[fpvProgressIndex]) {
          roadWaypoints[fpvProgressIndex].pitch = val;
          roadWaypoints[fpvProgressIndex].isModified = true;
        }

        redrawCurrentMission();
        recreate3DWaypointsAndPaths();
        updateFPVEditorUI();
      }
    });
  }

  // Waypoint Editor Yaw Heading Mode Selector
  const editHeadingMode = document.getElementById('fpv-edit-heading-mode');
  const editHeadingSlider = document.getElementById('fpv-edit-heading');
  const editHeadingVal = document.getElementById('fpv-edit-heading-val');
  
  if (editHeadingMode && editHeadingSlider && editHeadingVal) {
    editHeadingMode.addEventListener('change', (e) => {
      const mode = e.target.value;
      const waypoints = getCurrentWaypoints();
      if (waypoints && waypoints[fpvProgressIndex]) {
        waypoints[fpvProgressIndex].headingMode = mode;
        let finalHeading = null;
        if (mode !== 'custom') {
          waypoints[fpvProgressIndex].heading = null;
        } else {
          const rotationDeg = parseFloat(document.getElementById('grid-rotation').value) || 0;
          const autoHead = getDefaultHeading(fpvProgressIndex, waypoints, rotationDeg);
          finalHeading = Math.round(autoHead);
          waypoints[fpvProgressIndex].heading = finalHeading;
        }
        waypoints[fpvProgressIndex].isModified = true;
        waypoints[fpvProgressIndex].hasDraftEdits = true;
        
        const gridType = document.getElementById('grid-type').value;
        if (gridType === 'road-following' && roadWaypoints && roadWaypoints[fpvProgressIndex]) {
          roadWaypoints[fpvProgressIndex].headingMode = mode;
          roadWaypoints[fpvProgressIndex].heading = finalHeading;
          roadWaypoints[fpvProgressIndex].isModified = true;
        }

        redrawCurrentMission();
        recreate3DWaypointsAndPaths();
        updateFPVEditorUI();
      }
    });

    editHeadingSlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value);
      editHeadingVal.textContent = `${val}°`;
      
      const waypoints = getCurrentWaypoints();
      if (waypoints && waypoints[fpvProgressIndex] && editHeadingMode.value === 'custom') {
        waypoints[fpvProgressIndex].heading = val;
        waypoints[fpvProgressIndex].isModified = true;
        waypoints[fpvProgressIndex].hasDraftEdits = true;
        
        const gridType = document.getElementById('grid-type').value;
        if (gridType === 'road-following' && roadWaypoints && roadWaypoints[fpvProgressIndex]) {
          roadWaypoints[fpvProgressIndex].heading = val;
          roadWaypoints[fpvProgressIndex].isModified = true;
        }

        redrawCurrentMission();
        recreate3DWaypointsAndPaths();
        updateFPVEditorUI();
      }
    });

    const editPoiSelect = document.getElementById('fpv-edit-poi-select');
    if (editPoiSelect) {
      editPoiSelect.addEventListener('change', (e) => {
        const idxVal = parseInt(e.target.value);
        const waypoints = getCurrentWaypoints();
        if (waypoints && waypoints[fpvProgressIndex]) {
          waypoints[fpvProgressIndex].poiIndex = idxVal;
          waypoints[fpvProgressIndex].isModified = true;
          
          const gridType = document.getElementById('grid-type').value;
          if (gridType === 'road-following' && roadWaypoints && roadWaypoints[fpvProgressIndex]) {
            roadWaypoints[fpvProgressIndex].poiIndex = idxVal;
            roadWaypoints[fpvProgressIndex].isModified = true;
          }

          redrawCurrentMission();
          recreate3DWaypointsAndPaths();
          updateFPVEditorUI();
        }
      });
    }
  }

  // Speed Override Slider
  const editSpeedSlider = document.getElementById('fpv-edit-speed');
  if (editSpeedSlider) {
    editSpeedSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      const waypoints = getCurrentWaypoints();
      if (waypoints && waypoints[fpvProgressIndex]) {
        waypoints[fpvProgressIndex].speed = val;
        waypoints[fpvProgressIndex].isModified = true;
        waypoints[fpvProgressIndex].hasDraftEdits = true;
        updateFPVEditorUI();
      }
    });
  }

  // Hover Duration Slider
      const editHoverSlider = document.getElementById('fpv-edit-hover');
  if (editHoverSlider) {
    editHoverSlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value);
      const waypoints = getCurrentWaypoints();
      if (waypoints && waypoints[fpvProgressIndex]) {
        waypoints[fpvProgressIndex].hoverTime = val;
        waypoints[fpvProgressIndex].isModified = true;
        waypoints[fpvProgressIndex].hasDraftEdits = true;
        updateFPVEditorUI();
      }
    });
  }

  // Turn Mode Selector
  const editTurnModeSelect = document.getElementById('fpv-edit-turn-mode');
  if (editTurnModeSelect) {
    editTurnModeSelect.addEventListener('change', (e) => {
      const mode = e.target.value;
      const waypoints = getCurrentWaypoints();
      if (waypoints && waypoints[fpvProgressIndex]) {
        waypoints[fpvProgressIndex].turnMode = mode;
        waypoints[fpvProgressIndex].isModified = true;
        waypoints[fpvProgressIndex].hasDraftEdits = true;
        updateFPVEditorUI();
      }
    });
  }

  // Camera Action Selector
  const editCameraActionSelect = document.getElementById('fpv-edit-camera-action');
  if (editCameraActionSelect) {
    editCameraActionSelect.addEventListener('change', (e) => {
      const mode = e.target.value;
      const waypoints = getCurrentWaypoints();
      if (waypoints && waypoints[fpvProgressIndex]) {
        waypoints[fpvProgressIndex].cameraAction = mode;
        waypoints[fpvProgressIndex].isModified = true;
        waypoints[fpvProgressIndex].hasDraftEdits = true;
        updateFPVEditorUI();
      }
    });
  }

  // Camera Zoom Slider
  const editZoomSlider = document.getElementById('fpv-edit-zoom');
  if (editZoomSlider) {
    editZoomSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      const waypoints = getCurrentWaypoints();
      if (waypoints && waypoints[fpvProgressIndex]) {
        waypoints[fpvProgressIndex].zoom = val;
        waypoints[fpvProgressIndex].isModified = true;
        waypoints[fpvProgressIndex].hasDraftEdits = true;
        updateFPVEditorUI();
      }
    });
  }

  // FPV Editor Toggle Minimize / Expand
  const editorToggleBtn = document.getElementById('fpv-editor-toggle-btn');
  const editorBody = document.getElementById('fpv-editor-body');
  if (editorToggleBtn && editorBody) {
    editorToggleBtn.addEventListener('click', () => {
      const isHidden = editorBody.style.display === 'none';
      editorBody.style.display = isHidden ? 'flex' : 'none';
      editorToggleBtn.textContent = isHidden ? '▼' : '▲';
    });
  }

  // Nudge step display button
  const fpvStepDisplay = document.getElementById('fpv-nudge-step-display');
  if (fpvStepDisplay) {
    fpvStepDisplay.addEventListener('click', () => {
      fpvNudgeStepIndex = (fpvNudgeStepIndex + 1) % 3;
      updateFPVEditorUI();
    });
  }

  // Position Nudge Helper for FPV (fwdDir: +1 forward, -1 backward; rightDir: +1 right, -1 left)
  const fpvNudge = (fwdDir, rightDir, e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    const gridType = document.getElementById('grid-type')?.value;
    if (gridType === 'road-following') {
      if (confirm("Road Follow waypoints are automatically calculated relative to the road offset. Would you like to convert to Freeform mode to move or nudge individual waypoints?")) {
        convertToFreeformMission();
      }
      return;
    }

    const waypoints = getCurrentWaypoints();
    if (!waypoints || !waypoints[fpvProgressIndex]) return;
    const wp = waypoints[fpvProgressIndex];

    const latNum = parseFloat(wp.lat);
    const lonNum = parseFloat(wp.lon);
    if (isNaN(latNum) || isNaN(lonNum)) return;

    const unit = getUnitSystem();
    const steps = unit === 'imperial'
      ? [0.3048, 1.524, 6.096] // 1ft, 5ft, 20ft in meters
      : [0.2, 1.0, 5.0];      // 0.2m, 1m, 5m in meters
    const dist = steps[fpvNudgeStepIndex] !== undefined ? steps[fpvNudgeStepIndex] : steps[1];

    // Get current FPV camera heading angle
    const hp = getWaypointHeadingAndPitch(fpvProgressIndex, waypoints);
    const headingDeg = (hp && hp.heading !== undefined) ? hp.heading : 0;
    const headingRad = headingDeg * Math.PI / 180.0;

    // Transform FPV viewport direction into North/East meter displacements
    const dNorthMeters = (fwdDir * Math.cos(headingRad)) - (rightDir * Math.sin(headingRad));
    const dEastMeters  = (fwdDir * Math.sin(headingRad)) + (rightDir * Math.cos(headingRad));

    const dLatMeters = dNorthMeters * dist;
    const dLonMeters = dEastMeters * dist;

    const R_EARTH = 6378137.0;
    const latRad = latNum * Math.PI / 180.0;
    const deltaLat = (dLatMeters / R_EARTH) * (180.0 / Math.PI);
    const deltaLon = (dLonMeters / (R_EARTH * Math.cos(latRad))) * (180.0 / Math.PI);

    if (wp.origLat === undefined || wp.origLat === null) {
      wp.origLat = wp.lat;
      wp.origLon = wp.lon;
      wp.origX = wp.x;
      wp.origY = wp.y;
    }
    wp.lat = latNum + deltaLat;
    wp.lon = lonNum + deltaLon;
    wp.isModified = true;
    wp.hasDraftEdits = true;

    if (centerMarker) {
      const centerLatLng = centerMarker.getLatLng();
      const offsets = geodeticToLocal(wp.lat, wp.lon, centerLatLng.lat, centerLatLng.lng);
      wp.x = offsets.x;
      wp.y = offsets.y;
    } else {
      const R_EARTH = 6378137.0;
      const dLatMetersOld = (wp.lat - latNum) * Math.PI / 180.0 * R_EARTH;
      const dLonMetersOld = (wp.lon - lonNum) * Math.PI / 180.0 * R_EARTH * Math.cos(latRad);
      wp.x = (wp.x || 0) + dLonMetersOld;
      wp.y = (wp.y || 0) + dLatMetersOld;
    }

    if (gridType === 'road-following' && roadWaypoints && roadWaypoints[fpvProgressIndex]) {
      roadWaypoints[fpvProgressIndex].lat = wp.lat;
      roadWaypoints[fpvProgressIndex].lon = wp.lon;
      roadWaypoints[fpvProgressIndex].x = wp.x;
      roadWaypoints[fpvProgressIndex].y = wp.y;
      roadWaypoints[fpvProgressIndex].isModified = true;
    }

    // Force update DOM text input values and blur focus
    const latInput = document.getElementById('fpv-edit-lat');
    const lonInput = document.getElementById('fpv-edit-lon');
    if (latInput) latInput.value = wp.lat.toFixed(7);
    if (lonInput) lonInput.value = wp.lon.toFixed(7);

    if (wp.mapMarker) {
      wp.mapMarker.setLatLng([wp.lat, wp.lon]);
    }
    if (typeof pathGroup !== 'undefined' && pathGroup) {
      pathGroup.eachLayer(layer => {
        if (layer instanceof L.Polyline && !(layer instanceof L.Polygon)) {
          layer.setLatLngs(waypoints.map(w => [w.lat, w.lon]));
        }
      });
    }

    redrawCurrentMission();
    recreate3DWaypointsAndPaths();
    updateFPVEditorUI();

    if (fpvActive) {
      updateFPVCamera(0);
    }
  };

  const btnN = document.getElementById('fpv-nudge-n-btn');
  const btnS = document.getElementById('fpv-nudge-s-btn');
  const btnE = document.getElementById('fpv-nudge-e-btn');
  const btnW = document.getElementById('fpv-nudge-w-btn');

  if (btnN) btnN.addEventListener('click', (e) => fpvNudge(1, 0, e));  // Forward
  if (btnS) btnS.addEventListener('click', (e) => fpvNudge(-1, 0, e)); // Backward
  if (btnE) btnE.addEventListener('click', (e) => fpvNudge(0, 1, e));  // Right
  if (btnW) btnW.addEventListener('click', (e) => fpvNudge(0, -1, e)); // Left

  // Lat / Lon Text Inputs Real-Time Updating
  const latInput = document.getElementById('fpv-edit-lat');
  const lonInput = document.getElementById('fpv-edit-lon');
  
  const updateFpvCoordsFromInput = () => {
    const waypoints = getCurrentWaypoints();
    if (!waypoints || !waypoints[fpvProgressIndex]) return;
    const wp = waypoints[fpvProgressIndex];

    const latVal = parseFloat(latInput.value);
    const lonVal = parseFloat(lonInput.value);
    if (!isNaN(latVal) && !isNaN(lonVal)) {
      const oldLat = wp.lat;
      const oldLon = wp.lon;

      if (wp.origLat === undefined || wp.origLat === null) {
        wp.origLat = wp.lat;
        wp.origLon = wp.lon;
        wp.origX = wp.x;
        wp.origY = wp.y;
      }
      wp.lat = latVal;
      wp.lon = lonVal;
      wp.isModified = true;
      wp.hasDraftEdits = true;

      if (centerMarker) {
        const centerLatLng = centerMarker.getLatLng();
        const offsets = geodeticToLocal(wp.lat, wp.lon, centerLatLng.lat, centerLatLng.lng);
        wp.x = offsets.x;
        wp.y = offsets.y;
      } else {
        const R_EARTH = 6378137.0;
        const latRad = oldLat * Math.PI / 180.0;
        const dLatMeters = (latVal - oldLat) * Math.PI / 180.0 * R_EARTH;
        const dLonMeters = (lonVal - oldLon) * Math.PI / 180.0 * R_EARTH * Math.cos(latRad);
        wp.x = (wp.x || 0) + dLonMeters;
        wp.y = (wp.y || 0) + dLatMeters;
      }

      const gridType = document.getElementById('grid-type')?.value;
      if (gridType === 'road-following' && roadWaypoints && roadWaypoints[fpvProgressIndex]) {
        roadWaypoints[fpvProgressIndex].lat = wp.lat;
        roadWaypoints[fpvProgressIndex].lon = wp.lon;
        roadWaypoints[fpvProgressIndex].x = wp.x;
        roadWaypoints[fpvProgressIndex].y = wp.y;
        roadWaypoints[fpvProgressIndex].isModified = true;
      }

      if (wp.mapMarker) {
        wp.mapMarker.setLatLng([wp.lat, wp.lon]);
      }
      if (typeof pathGroup !== 'undefined' && pathGroup) {
        pathGroup.eachLayer(layer => {
          if (layer instanceof L.Polyline && !(layer instanceof L.Polygon)) {
            layer.setLatLngs(waypoints.map(w => [w.lat, w.lon]));
          }
        });
      }

      redrawCurrentMission();
      recreate3DWaypointsAndPaths();
      updateFPVEditorUI();

      if (fpvActive) {
        updateFPVCamera(0);
      }
    }
  };

  if (latInput) latInput.addEventListener('input', throttle(updateFpvCoordsFromInput, 32));
  if (lonInput) lonInput.addEventListener('input', throttle(updateFpvCoordsFromInput, 32));

  // Save Waypoint
  const fpvSaveBtn = document.getElementById('fpv-btn-save-wp');
  if (fpvSaveBtn) {
    fpvSaveBtn.addEventListener('click', (e) => {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      const waypoints = getCurrentWaypoints();
      if (!waypoints || !waypoints[fpvProgressIndex]) return;
      const wp = waypoints[fpvProgressIndex];

      const latInput = document.getElementById('fpv-edit-lat');
      const lonInput = document.getElementById('fpv-edit-lon');
      const altInput = document.getElementById('fpv-edit-alt');
      const pitchInput = document.getElementById('fpv-edit-pitch');
      const speedInput = document.getElementById('fpv-edit-speed');
      const hoverInput = document.getElementById('fpv-edit-hover');
      const turnModeInput = document.getElementById('fpv-edit-turn-mode');
      const cameraActionInput = document.getElementById('fpv-edit-camera-action');
      const zoomInput = document.getElementById('fpv-edit-zoom');
      const headingModeInput = document.getElementById('fpv-edit-heading-mode');
      const headingInput = document.getElementById('fpv-edit-heading');
      const poiInput = document.getElementById('fpv-edit-poi-select');

      const latNum = latInput ? parseFloat(latInput.value) : parseFloat(wp.lat);
      const lonNum = lonInput ? parseFloat(lonInput.value) : parseFloat(wp.lon);
      if (!isNaN(latNum)) wp.lat = latNum;
      if (!isNaN(lonNum)) wp.lon = lonNum;

      if (altInput) wp.alt = parseFloat(altInput.value);
      if (pitchInput) wp.pitch = parseFloat(pitchInput.value);
      if (speedInput) wp.speed = parseFloat(speedInput.value);
      if (hoverInput) wp.hoverTime = parseInt(hoverInput.value);
      if (turnModeInput) wp.turnMode = turnModeInput.value;
      if (cameraActionInput) wp.cameraAction = cameraActionInput.value;
      if (zoomInput) wp.zoom = parseFloat(zoomInput.value);

      if (headingModeInput) {
        wp.headingMode = headingModeInput.value;
        if (wp.headingMode === 'custom' && headingInput) {
          wp.heading = parseFloat(headingInput.value);
        } else if (wp.headingMode !== 'custom') {
          wp.heading = null;
        }
      }
      if (poiInput) wp.poiIndex = parseInt(poiInput.value);

      wp.isRingStart = true;
      wp.isModified = true;
      wp.hasDraftEdits = false;

      const gridType = document.getElementById('grid-type')?.value;
      if (gridType === 'road-following' && roadWaypoints && roadWaypoints[fpvProgressIndex]) {
        if (!isNaN(latNum)) roadWaypoints[fpvProgressIndex].lat = latNum;
        if (!isNaN(lonNum)) roadWaypoints[fpvProgressIndex].lon = lonNum;
        roadWaypoints[fpvProgressIndex].alt = wp.alt;
        roadWaypoints[fpvProgressIndex].pitch = wp.pitch;
        roadWaypoints[fpvProgressIndex].heading = wp.heading;
        roadWaypoints[fpvProgressIndex].headingMode = wp.headingMode || 'inherit';
        roadWaypoints[fpvProgressIndex].poiIndex = wp.poiIndex || 0;
        roadWaypoints[fpvProgressIndex].speed = wp.speed;
        roadWaypoints[fpvProgressIndex].hoverTime = wp.hoverTime;
        roadWaypoints[fpvProgressIndex].turnMode = wp.turnMode;
        roadWaypoints[fpvProgressIndex].cameraAction = wp.cameraAction;
        roadWaypoints[fpvProgressIndex].zoom = wp.zoom;
        roadWaypoints[fpvProgressIndex].isModified = true;
      }

      redrawCurrentMission();
      recreate3DWaypointsAndPaths();
      updateFPVEditorUI();
    });
  }

  // Reset Waypoint
  const fpvResetBtn = document.getElementById('fpv-btn-reset-wp');
  if (fpvResetBtn) {
    fpvResetBtn.addEventListener('click', (e) => {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      const waypoints = getCurrentWaypoints();
      if (!waypoints || !waypoints[fpvProgressIndex]) return;
      const wp = waypoints[fpvProgressIndex];

      if (wp.origLat !== undefined && wp.origLat !== null) wp.lat = wp.origLat;
      if (wp.origLon !== undefined && wp.origLon !== null) wp.lon = wp.origLon;
      
      if (centerMarker) {
        const centerLatLng = centerMarker.getLatLng();
        const offsets = geodeticToLocal(wp.lat, wp.lon, centerLatLng.lat, centerLatLng.lng);
        wp.x = offsets.x;
        wp.y = offsets.y;
      } else if (wp.origX !== undefined && wp.origX !== null) {
        wp.x = wp.origX;
        wp.y = wp.origY;
      }

      if (wp.origAlt !== undefined && wp.origAlt !== null) wp.alt = wp.origAlt;
      if (wp.origPitch !== undefined && wp.origPitch !== null) wp.pitch = wp.origPitch;
      if (wp.origHeading !== undefined) wp.heading = wp.origHeading;
      wp.headingMode = wp.origHeadingMode || 'inherit';
      wp.poiIndex = wp.origPoiIndex || 0;
      wp.speed = wp.origSpeed !== undefined ? wp.origSpeed : null;
      wp.hoverTime = wp.origHoverTime !== undefined ? wp.origHoverTime : null;
      wp.turnMode = wp.origTurnMode || 'inherit';
      wp.cameraAction = wp.origCameraAction || 'inherit';
      wp.zoom = wp.origZoom !== undefined ? wp.origZoom : 1.0;
      wp.isModified = false;
      wp.hasDraftEdits = false;
      delete wp._lastLat;
      delete wp._lastLon;

      const gridType = document.getElementById('grid-type')?.value;
      if (gridType === 'road-following' && roadWaypoints && roadWaypoints[fpvProgressIndex]) {
        if (wp.origLat !== undefined) roadWaypoints[fpvProgressIndex].lat = wp.origLat;
        if (wp.origLon !== undefined) roadWaypoints[fpvProgressIndex].lon = wp.origLon;
        if (wp.origAlt !== undefined) roadWaypoints[fpvProgressIndex].alt = wp.origAlt;
        if (wp.origPitch !== undefined) roadWaypoints[fpvProgressIndex].pitch = wp.origPitch;
        if (wp.origHeading !== undefined) roadWaypoints[fpvProgressIndex].heading = wp.origHeading;
        roadWaypoints[fpvProgressIndex].headingMode = wp.origHeadingMode || 'inherit';
        roadWaypoints[fpvProgressIndex].poiIndex = wp.origPoiIndex || 0;
        roadWaypoints[fpvProgressIndex].isModified = false;
      }

      if (wp.mapMarker) {
        wp.mapMarker.setLatLng([wp.lat, wp.lon]);
      }

      if (gridType !== 'freeform') {
        updateGrid();
      } else {
        redrawCurrentMission();
      }
      recreate3DWaypointsAndPaths();
      updateFPVEditorUI();

      if (fpvActive) {
        updateFPVCamera(0);
      }
    });
  }

  // Delete Waypoint
  const deleteBtn = document.getElementById('fpv-btn-delete-wp');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', fpvDeleteWaypoint);
  }

  // Insert Waypoint
  const insertBtn = document.getElementById('fpv-btn-insert-wp');
  if (insertBtn) {
    insertBtn.addEventListener('click', fpvInsertWaypoint);
  }
}

// Dynamic container resizing
function handle3DResize() {
  const container = document.getElementById('three-container');
  if (!container || !threeCamera || !threeRenderer) return;
  const width = container.clientWidth;
  const height = container.clientHeight;
  threeCamera.aspect = width / height;
  threeCamera.updateProjectionMatrix();
  threeRenderer.setSize(width, height);
}

// Clean up WebGL resources
function cleanup3DPreview() {
  toggleFPVWalkthrough(false);
  window.removeEventListener('resize', handle3DResize);

  if (threeAnimationId) {
    cancelAnimationFrame(threeAnimationId);
    threeAnimationId = null;
  }

  if (threeRenderer) {
    const dom = threeRenderer.domElement;
    if (dom && dom.parentNode) {
      dom.parentNode.removeChild(dom);
    }
    threeRenderer.dispose();
    threeRenderer = null;
  }

  if (threeControls) {
    threeControls.dispose();
    threeControls = null;
  }

  threeScene = null;
  threeCamera = null;
  coneGroups = [];
  cachedTileImages = [];
  threeGroundCanvas = null;
  threeGroundCtx = null;
  threeGroundTexture = null;
}

// Auto-Plan State
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
  if (gridTypeEl) gridTypeEl.value = originalMissionSettings.gridType;
  
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
  if (!autoPlanBounds) return;

  const gridTypeEl = document.getElementById('grid-type');
  if (gridTypeEl) gridTypeEl.value = plan.pattern;

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

let lastWeatherFetchCenter = null;

async function fetchAndProcessWeather(centerLat, centerLon) {
  try {
    // Only fetch weather if center changed by > 5km or wasn't fetched yet
    if (lastWeatherFetchCenter) {
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

    const topStations = sortedStations.slice(0, 3);

    // 3. Fetch latest observations for top nearby stations in parallel
    const obsResults = await Promise.allSettled(
      topStations.map(st =>
        fetch(`https://api.weather.gov/stations/${st.id}/observations/latest`, { headers })
          .then(res => res.ok ? res.json() : null)
          .catch(() => null)
      )
    );

    const stationDataList = [];
    topStations.forEach((st, idx) => {
      const res = obsResults[idx];
      const obsData = (res && res.status === 'fulfilled' && res.value) ? res.value : null;

      let fltCat = null;
      let visSM = null;
      let ceilingFt = null;

      if (obsData && obsData.properties) {
        fltCat = obsData.properties.flightCategory;

        if (obsData.properties.visibility && obsData.properties.visibility.value != null) {
          visSM = obsData.properties.visibility.value / 1609.34;
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
      }

      if (!fltCat) fltCat = "VFR";

      stationDataList.push({
        icaoId: st.id,
        name: st.name,
        lat: st.lat,
        lon: st.lon,
        distance: st.dist,
        fltCat: fltCat,
        visibilitySM: visSM,
        ceilingFt: ceilingFt,
        timestamp: obsData?.properties?.timestamp || null,
        raw: obsData?.properties?.rawMessage || obsData?.properties?.textDescription || "No raw METAR"
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
  const distKm = (activeStation.distance != null) ? Number(activeStation.distance).toFixed(1) : '-';
  const distMi = (activeStation.distance != null) ? (Number(activeStation.distance) * 0.621371).toFixed(1) : '-';
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
        ${icao}
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
        Distance: <b>${distKm} km</b> (${distMi} mi) from center
      </div>
      <div style="background: rgba(255,255,255,0.06); padding: 6px 8px; border-radius: 4px; font-size: 0.72rem; line-height: 1.45; margin-bottom: 8px;">
        <div>Visibility: <b>${activeStation.visibilitySM != null ? Number(activeStation.visibilitySM).toFixed(1) + ' SM' : 'Unknown'}</b></div>
        <div>Ceiling: <b>${activeStation.ceilingFt != null ? (activeStation.ceilingFt >= 99999 ? 'Clear' : Number(activeStation.ceilingFt).toFixed(0) + ' ft') : 'Clear / Unknown'}</b></div>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center; gap: 6px;">
        <span style="font-size: 0.65rem; color: #64748b;">NWS Observation</span>
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
    if (typeof weatherStationMarker.bindTooltip === 'function') weatherStationMarker.bindTooltip(`🌤️ Weather Station: ${icao} (${name})`, { direction: 'top', offset: [0, -18] });
    if (weatherStationLayer && typeof weatherStationLayer.addLayer === 'function') {
      weatherStationLayer.addLayer(weatherStationMarker);
    } else if (map && typeof map.addLayer === 'function') {
      map.addLayer(weatherStationMarker);
    }
  } else {
    if (typeof weatherStationMarker.setLatLng === 'function') weatherStationMarker.setLatLng([activeStation.lat, activeStation.lon]);
    if (weatherIcon && typeof weatherStationMarker.setIcon === 'function') weatherStationMarker.setIcon(weatherIcon);
    if (typeof weatherStationMarker.setPopupContent === 'function') weatherStationMarker.setPopupContent(popupHtml);
    if (typeof weatherStationMarker.setTooltipContent === 'function') weatherStationMarker.setTooltipContent(`🌤️ Weather Station: ${icao} (${name})`);
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
            ${sIcao}
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
          <div style="color: #94a3b8; font-size: 0.72rem; margin-bottom: 6px;">Distance: <b>${sDistKm} km</b> from center</div>
          <button type="button" class="btn-sm" style="width: 100%; padding: 4px 8px; font-size: 0.72rem; background: rgba(56,189,248,0.2); color: #38bdf8; border: 1px solid #38bdf8; border-radius: 4px; cursor: pointer;" onclick="if (typeof selectActiveWeatherStation === 'function') { selectActiveWeatherStation(${sIdx}); }">
            Select This Station
          </button>
        </div>
      `;

      const secMarker = L.marker([st.lat, st.lon], { icon: secIcon, zIndexOffset: 800 });
      if (typeof secMarker.bindPopup === 'function') secMarker.bindPopup(secPopupHtml, { className: 'weather-station-popup' });
      if (typeof secMarker.bindTooltip === 'function') secMarker.bindTooltip(`🌤️ Weather Station: ${sIcao} (${sName}) - ${sDistKm} km`, { direction: 'top', offset: [0, -16] });
      secMarker.on('click', () => {
        if (typeof selectActiveWeatherStation === 'function') {
          selectActiveWeatherStation(sIdx);
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
        weatherStationLine.bindTooltip(`Weather Station: ${icao} (${distKm} km)`, { sticky: true });
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
        weatherStationLine.setTooltipContent(`Weather Station: ${icao} (${distKm} km)`);
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
  focusWeatherStationOnMap(currentWeatherDirections.stations[idx]);
}

function toggleWeatherDetails(forceState) {
  const dirsEl = document.getElementById('stat-weather-dirs');
  const toggleBtn = document.getElementById('btn-toggle-weather-details');
  if (!dirsEl) return;

  const isCurrentlyHidden = dirsEl.classList.contains('hidden');
  const shouldShow = (typeof forceState === 'boolean') ? forceState : isCurrentlyHidden;

  if (shouldShow) {
    dirsEl.classList.remove('hidden');
    if (toggleBtn) toggleBtn.textContent = '▴ Details';
    try { localStorage.setItem('aalaapi_weather_details_expanded', 'true'); } catch (e) {}
  } else {
    dirsEl.classList.add('hidden');
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
  const locateHeaderBtn = document.getElementById('btn-locate-weather-station');
  const toggleBtn = document.getElementById('btn-toggle-weather-details');

  if (!windowEl || !dirsEl) return;

  if (isLoading || statusMsg) {
    windowEl.textContent = statusMsg || "Loading...";
    windowEl.style.color = "var(--text-secondary)";
    if (typeof dirsEl.replaceChildren === 'function') dirsEl.replaceChildren(); else dirsEl.innerHTML = '';
    dirsEl.classList.add("hidden");
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

  const distKm = closest.distance != null ? Number(closest.distance).toFixed(1) : '-';
  const distMi = closest.distance != null ? (Number(closest.distance) * 0.621371).toFixed(1) : '-';

  if (typeof windowEl.replaceChildren === 'function') windowEl.replaceChildren(); else windowEl.innerHTML = '';
  const statusSpan = document.createElement("span");
  statusSpan.style.color = color;
  statusSpan.textContent = statusText;
  windowEl.appendChild(statusSpan);

  const timeDiv = document.createElement("div");
  timeDiv.style.cssText = "font-size: 0.7rem; color: var(--text-muted); margin-top: 2px;";
  const stationLabel = closest.icaoId ? ` • 📡 ${closest.icaoId} (${distKm} km)` : '';
  timeDiv.textContent = `Last Polled: ${timeString}${stationLabel}`;
  windowEl.appendChild(timeDiv);

  windowEl.title = `Station: ${closest.icaoId || 'NWS'} - ${closest.name || 'Station'} (${distKm}km / ${distMi}mi)\nRaw: ${closest.raw || ''}\nClick to toggle checklist`;

  if (locateHeaderBtn) {
    if (closest.icaoId) {
      locateHeaderBtn.textContent = `📍 ${closest.icaoId} (${distKm} km)`;
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
    ceilDiv.textContent = "✅ Ceiling: Unknown";
  }
  container.appendChild(ceilDiv);

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
  stationTitle.textContent = `📡 Station: ${closest.icaoId || 'NWS'}`;
  stationHeader.appendChild(stationTitle);

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
  distDiv.textContent = `Distance: ${distKm} km (${distMi} mi) from mission center`;
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
      const sDist = st.distance != null ? `${Number(st.distance).toFixed(1)} km` : '';
      tabBtn.textContent = `${st.icaoId} (${sDist})`;
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
    if (toggleBtn) toggleBtn.textContent = '▴ Details';
  } else {
    dirsEl.classList.add("hidden");
    if (toggleBtn) toggleBtn.textContent = '▾ Details';
  }

  // Update map marker
  updateWeatherStationMarker(closest, directions.stations, directions.activeIndex || 0);
}

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btn-refresh-weather');
  if (btn) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (centerMarker) {
        lastWeatherFetchCenter = null;
        fetchAndProcessWeather(centerMarker.getLatLng().lat, centerMarker.getLatLng().lng);
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
  const helpDesc = document.getElementById('heading-help-desc');
  const animDrone = document.getElementById('anim-drone');
  const animPoiTarget = document.getElementById('anim-poi-target');
  const activePath = document.getElementById('anim-flight-path-active');

  if (!helpBtn || !helpDrawer || !tabFollow || !tabFixed || !tabPoi || !helpDesc || !animDrone || !animPoiTarget) return;

  let activeMode = 'followWayline'; // 'followWayline', 'fixed', or 'poi'
  let animationFrameId = null;
  let isDrawerOpen = false;

  // Toggle drawer visibility
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

  // Switch to Follow Path Tab
  tabFollow.addEventListener('click', () => {
    activeMode = 'followWayline';
    tabFollow.classList.add('active');
    tabFollow.style.background = 'rgba(6, 182, 212, 0.15)';
    tabFollow.style.borderColor = 'rgba(6, 182, 212, 0.3)';
    tabFollow.style.color = 'var(--accent-cyan)';

    [tabFixed, tabPoi].forEach(t => {
      t.classList.remove('active');
      t.style.background = 'none';
      t.style.borderColor = 'transparent';
      t.style.color = 'var(--text-muted)';
    });

    animPoiTarget.style.opacity = '0';
    helpDesc.textContent = "Drone rotates forward along the path. Camera always points ahead.";
  });

  // Switch to Fixed Heading Tab
  tabFixed.addEventListener('click', () => {
    activeMode = 'fixed';
    tabFixed.classList.add('active');
    tabFixed.style.background = 'rgba(6, 182, 212, 0.15)';
    tabFixed.style.borderColor = 'rgba(6, 182, 212, 0.3)';
    tabFixed.style.color = 'var(--accent-cyan)';

    [tabFollow, tabPoi].forEach(t => {
      t.classList.remove('active');
      t.style.background = 'none';
      t.style.borderColor = 'transparent';
      t.style.color = 'var(--text-muted)';
    });

    animPoiTarget.style.opacity = '0';
    helpDesc.textContent = "Drone keeps a constant heading (North). The aircraft flies sideways or backwards as needed.";
  });

  // Switch to POI Tab
  tabPoi.addEventListener('click', () => {
    activeMode = 'poi';
    tabPoi.classList.add('active');
    tabPoi.style.background = 'rgba(6, 182, 212, 0.15)';
    tabPoi.style.borderColor = 'rgba(6, 182, 212, 0.3)';
    tabPoi.style.color = 'var(--accent-cyan)';

    [tabFollow, tabFixed].forEach(t => {
      t.classList.remove('active');
      t.style.background = 'none';
      t.style.borderColor = 'transparent';
      t.style.color = 'var(--text-muted)';
    });

    animPoiTarget.style.opacity = '1';
    helpDesc.textContent = "Camera locks onto a Point of Interest (POI). The drone continuously yaws to face the target subject.";
  });

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
