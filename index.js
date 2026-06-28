// Global state variables
let map;
let centerMarker = null;
let flightPathPolyline = null;
let gridBoundsPolygon = null;
let waypointMarkersGroup = null;
let photoMarkersGroup = null;
let isAnyPopupOpen = false;
let isLegendCollapsed = false;
let originalMissionSettings = null;

// Geolocation state
let userLocation = null;

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

  return (typeof localStorage !== 'undefined' ? localStorage.getItem('aalaapi_sky_unit_system') : null) || 'metric';
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

  if (!navigator.geolocation) {
    if (label) label.textContent = 'Location Not Supported';
    if (btn) btn.disabled = true;
    return;
  }

  if (btn) {
    btn.addEventListener('click', () => {
      if (label) label.textContent = '⏳ Locating…';
      btn.disabled = true;
      navigator.geolocation.getCurrentPosition(
        (position) => {
          userLocation = {
            lat: position.coords.latitude,
            lon: position.coords.longitude
          };
          if (label) label.textContent = '✓ Located';
          btn.style.color = 'var(--accent-green, #10b981)';
          btn.style.borderColor = 'rgba(16, 185, 129, 0.4)';
          btn.disabled = false;
          // Fly the map to the user's position
          if (typeof map !== 'undefined' && map) {
            map.flyTo([userLocation.lat, userLocation.lon], Math.max(map.getZoom(), 15), { animate: true, duration: 1.2 });
          }
          if (getCurrentWaypoints()) {
            redrawCurrentMission();
          }
        },
        (error) => {
          console.warn("Geolocation service failed:", error);
          if (label) label.textContent = '✗ Location Denied';
          btn.style.color = 'var(--accent-red, #ef4444)';
          btn.style.borderColor = 'rgba(239, 68, 68, 0.4)';
          btn.disabled = false;
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

// NOAA Weather Overlays
let weatherRadarLayer;
let weatherWarningsLayer;

// Initialize the application when the DOM is fully loaded
document.addEventListener("DOMContentLoaded", () => {
  // Restore unit system selection
  const savedUnit = localStorage.getItem('aalaapi_sky_unit_system') || 'metric';
  const unitSystemEl = document.getElementById('unit-system');
  if (unitSystemEl) {
    unitSystemEl.value = savedUnit;
    cachedUnitSystem = savedUnit;
  }

  initMap();
  initUIEventListeners();
  initGeolocation(); // Wires up the Locate Me button — does NOT auto-request permission
  initAutoPlan();
  initPatternSelectorCards();
  // No updateGrid() here — map starts clean; user clicks map or uses Auto-Plan/Import to begin
  syncDisplayValues();
  togglePatternParameters();
});

// Initialize Leaflet Map
function initMap() {
  // Default to Lakewood neighborhood, Hilliard, Ohio
  const defaultLat = 40.0165;
  const defaultLng = -83.1787;

  // Initialize Map
  map = L.map('map', {
    zoomControl: false // We will add zoom control on top-left instead of default top-left
  }).setView([defaultLat, defaultLng], 17);

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
  vfrSectionalLayer = L.tileLayer('https://tiles.arcgis.com/tiles/ssFJjBXIUyZDrSYZ/arcgis/rest/services/VFR_Sectional/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 22,
    maxNativeZoom: 12, // FAA tiles only go to zoom 12; browser upscales beyond that
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
  } else {
    console.warn('Esri Leaflet not loaded — FAA FeatureServer airspace layers unavailable. VFR Sectional Chart (tile layer) still available.');
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
    "VFR Sectional Chart": vfrSectionalLayer
  };
  if (classAirspaceLayer) overlays["Controlled Airspace (Class B/C/D/E)"] = classAirspaceLayer;
  if (specialUseAirspaceLayer) overlays["Restricted & Special Use Airspace"] = specialUseAirspaceLayer;
  if (uasFacilityMapLayer) overlays["UAS Facility Maps (LAANC)"] = uasFacilityMapLayer;
  if (obstaclesLayer) overlays["Obstacles & Antennas (FAA)"] = obstaclesLayer;
  
  // Weather Overlays
  overlays["Weather Radar (NEXRAD)"] = weatherRadarLayer;
  overlays["Weather Warnings (NWS Hazards)"] = weatherWarningsLayer;

  L.control.layers(baseMaps, overlays, { position: 'topleft' }).addTo(map);

  // Airspace legend — shown/hidden based on which overlays are active
  initAirspaceLegend();
  map.on('overlayadd overlayremove', function(e) {
    // Track LAANC checkbox state
    if (uasFacilityMapLayer) {
      if (e.type === 'overlayadd'    && e.name === 'UAS Facility Maps (LAANC)') uasFacilityMapEnabled = true;
      if (e.type === 'overlayremove' && e.name === 'UAS Facility Maps (LAANC)') {
        uasFacilityMapEnabled = false;
        // Clear all features immediately to free memory
        uasFacilityMapLayer.setWhere('1=0');
      }
      // When enabled, respect current zoom
      if (uasFacilityMapEnabled) applyZoomGates();
    }

    // Track Obstacles checkbox state
    if (obstaclesLayer) {
      if (e.type === 'overlayadd'    && e.name === 'Obstacles & Antennas (FAA)') obstaclesEnabled = true;
      if (e.type === 'overlayremove' && e.name === 'Obstacles & Antennas (FAA)') {
        obstaclesEnabled = false;
        obstaclesLayer.setWhere('1=0');
      }
      if (obstaclesEnabled) applyZoomGates();
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
}

// Setup Event Listeners for UI controls
function initUIEventListeners() {
  // Get all controls
  const controls = [
    'grid-width', 'grid-height', 'grid-rotation',
    'front-overlap', 'side-overlap', 'gimbal-pitch',
    'altitude', 'speed', 'heading-mode', 'finish-action', 'capture-mode', 'path-mode',
    'max-flight-time', 'camera-model', 'camera-hfov', 'camera-vfov', 'road-offset'
  ];

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
    });
  });

  // Handle Camera Model preset change
  const cameraModelEl = document.getElementById('camera-model');
  const hfovSlider = document.getElementById('camera-hfov');
  const vfovSlider = document.getElementById('camera-vfov');
  if (cameraModelEl && hfovSlider && vfovSlider) {
    cameraModelEl.addEventListener('change', (e) => {
      const model = e.target.value;
      if (model === 'dji_mini_4_pro_std') {
        hfovSlider.value = 69.7;
        vfovSlider.value = 55.2;
      } else if (model === 'dji_mini_4_pro_wide') {
        hfovSlider.value = 97.0;
        vfovSlider.value = 79.0;
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

  // Guide Modal controls
  const showGuideBtn = document.getElementById('show-guide-btn');
  const closeGuideBtn = document.getElementById('close-guide-btn');
  const closeGuideFooterBtn = document.getElementById('close-guide-footer-btn');
  const guideModal = document.getElementById('guide-modal');

  const toggleModal = () => guideModal.classList.toggle('hidden');

  showGuideBtn.addEventListener('click', toggleModal);
  closeGuideBtn.addEventListener('click', toggleModal);
  closeGuideFooterBtn.addEventListener('click', toggleModal);

  // About Modal controls
  const showAboutBtn = document.getElementById('about-btn');
  const closeAboutBtn = document.getElementById('close-about-btn');
  const closeAboutFooterBtn = document.getElementById('close-about-footer-btn');
  const aboutModal = document.getElementById('about-modal');

  if (showAboutBtn && aboutModal) {
    const toggleAboutModal = () => aboutModal.classList.toggle('hidden');
    showAboutBtn.addEventListener('click', toggleAboutModal);
    if (closeAboutBtn) closeAboutBtn.addEventListener('click', toggleAboutModal);
    if (closeAboutFooterBtn) closeAboutFooterBtn.addEventListener('click', toggleAboutModal);
  }

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
    const toggleConfigModal = () => configModal.classList.toggle('hidden');
    configBtn.addEventListener('click', toggleConfigModal);
    if (closeConfigBtn) closeConfigBtn.addEventListener('click', toggleConfigModal);
    if (closeConfigFooterBtn) closeConfigFooterBtn.addEventListener('click', toggleConfigModal);
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
  let isAccordionMode = false;
  if (accordionModeToggle) {
    isAccordionMode = localStorage.getItem('aalaapi_sky_accordion_mode') === 'true';
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
      // Restore previous collapsed state if saved
      const sectionIndex = Array.from(document.querySelectorAll('.control-section')).indexOf(section);
      const isCollapsed = localStorage.getItem(`aalaapi_sky_section_${sectionIndex}_collapsed`) === 'true';
      if (isCollapsed) {
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
      init3DPreview();
    });
  }

  const closeModal = () => {
    if (preview3dModal) {
      preview3dModal.classList.add('hidden');
      cleanup3DPreview();
    }
  };

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

  const widthVal = parseFloat(document.getElementById('grid-width').value);
  const rotationVal = parseFloat(document.getElementById('grid-rotation').value);
  const altitudeVal = parseFloat(document.getElementById('altitude').value);
  const speedVal = parseFloat(document.getElementById('speed').value);

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
  if (hfovSlider && vfovSlider) {
    CAMERA_HFOV = parseFloat(hfovSlider.value);
    CAMERA_VFOV = parseFloat(vfovSlider.value);
    document.getElementById('camera-hfov-val').textContent = hfovSlider.value;
    document.getElementById('camera-vfov-val').textContent = vfovSlider.value;
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
      console.error("Search error:", err);
      alert("Error finding location. Check your internet connection.");
    });
}

// Position the grid center marker
function setGridCenter(lat, lng) {
  if (centerMarker) {
    centerMarker.setLatLng([lat, lng]);
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
    
    // Recalculate grid when center is dragged
    centerMarker.on('drag', () => {
      updateGrid();
    });
    centerMarker.on('dragend', () => {
      centerMarker.openPopup();
    });
  }

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
  const altitude = parseFloat(document.getElementById('altitude').value);

  generatedWaypoints = roadWaypoints.map((wp, idx) => {
    // 1. Calculate stable tangent vector using lookahead/lookbehind (minimum 10.0m distance)
    let tx = 0;
    let ty = 1;
    if (roadWaypoints.length > 1) {
      const MIN_DIST = 10.0;
      let prev = roadWaypoints[idx];
      let next = roadWaypoints[idx];

      // Find backward point at least MIN_DIST meters away
      for (let i = idx - 1; i >= 0; i--) {
        const dx = roadWaypoints[i].x - roadWaypoints[idx].x;
        const dy = roadWaypoints[i].y - roadWaypoints[idx].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist >= MIN_DIST) {
          prev = roadWaypoints[i];
          break;
        }
      }
      if (prev === roadWaypoints[idx] && idx > 0) {
        prev = roadWaypoints[0];
      }

      // Find forward point at least MIN_DIST meters away
      for (let i = idx + 1; i < roadWaypoints.length; i++) {
        const dx = roadWaypoints[i].x - roadWaypoints[idx].x;
        const dy = roadWaypoints[i].y - roadWaypoints[idx].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist >= MIN_DIST) {
          next = roadWaypoints[i];
          break;
        }
      }
      if (next === roadWaypoints[idx] && idx < roadWaypoints.length - 1) {
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
    const droneX = wp.x + D * ty;
    const droneY = wp.y - D * tx;

    // 3. Convert drone local coordinates back to geodetic lat/lon
    const geo = localToGeodetic(droneX, droneY, centerLat, centerLon, 0);

    // 4. Calculate gimbal pitch and heading pointing to the road
    const altVal = wp.alt !== undefined && wp.alt !== null ? wp.alt : altitude;
    let pitchVal = wp.pitch;
    if (pitchVal === null || pitchVal === undefined) {
      pitchVal = -Math.round(Math.atan2(altVal, Math.abs(D)) * (180.0 / Math.PI));
    }
    
    let headingVal;
    if (Math.abs(D) < 0.01) {
      headingVal = Math.atan2(tx, ty) * (180.0 / Math.PI);
    } else {
      headingVal = Math.atan2(wp.x - droneX, wp.y - droneY) * (180.0 / Math.PI);
    }
    headingVal = (headingVal + 360) % 360;

    return {
      lat: geo.lat,
      lon: geo.lon,
      x: droneX,
      y: droneY,
      alt: altVal,
      pitch: pitchVal,
      heading: headingVal,
      isRingStart: wp.isRingStart || false,
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
      if (wp.pitch === null || wp.pitch === undefined) {
        wp.pitch = defaultGimbalPitch;
      }
      wp.speed = speed;
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
      
      waypoints = gridData.waypoints.map(pt => {
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
          isRingStart: pt.isRingStart || false,
          ringIndex: pt.ringIndex !== undefined ? pt.ringIndex : null,
          origLat: geo.lat,
          origLon: geo.lon,
          origX: pt.x,
          origY: pt.y,
          origAlt: alt,
          origPitch: pitch,
          origHeading: finalHeading,
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

  for (let i = 0; i <= nPhotos; i++) {
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
      heading: heading
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
    
    for (let i = 0; i <= nPhotos; i++) {
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
    heading = getDefaultHeading(idx, waypoints, rotationDeg);
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
        <div class="wp-pitch-label">${pitch}°</div>
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
          
          roadPolyline.setLatLngs(roadWaypoints.map(w => [w.lat, w.lon]));

          recalculateRoadOffsetPath(centerLat, centerLon);

          updatePathLinesAndStats(generatedWaypoints, generatedPhotos, centerLat, centerLon, gridWidth, gridHeight, rotationDeg);

          // gimbalPitch is already calculated at the top of the function
          generatedWaypoints.forEach((gwp) => {
            if (gwp.mapMarker) {
              gwp.mapMarker.setLatLng([gwp.lat, gwp.lon]);
              const gPitch = gwp.pitch !== undefined && gwp.pitch !== null ? gwp.pitch : gimbalPitch;
              const tooltipContent = `Drone Waypoint ${gwp.idx}<br>Height: ${formatDistance(gwp.alt, 0)}<br>Yaw: ${gwp.heading.toFixed(0)}°<br>Pitch: ${gPitch}°`;
              gwp.mapMarker.setTooltipContent(tooltipContent);
            }
          });
        });

        marker.on('dragend', () => {
          redrawCurrentMission();
        });

        marker.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          marker.openPopup();
        });

        marker.bindPopup(() => {
          return createWaypointEditorDOM(wp, idx, marker);
        }, {
          maxWidth: 220,
          minWidth: 210
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

      const pitch = wp.pitch !== undefined && wp.pitch !== null ? wp.pitch : gimbalPitch;
      const tooltipContent = `Drone Waypoint ${idx}<br>Height: ${formatDistance(wp.alt, 0)}<br>Yaw: ${wp.heading.toFixed(0)}°<br>Pitch: ${pitch}°`;
      droneMarker.bindTooltip(tooltipContent, { direction: 'top', offset: [0, -5] });

      wp.mapMarker = droneMarker;
      droneMarker.addTo(waypointMarkersGroup);

      // Make drone waypoints interactive to select/edit/delete
      const roadWp = roadWaypoints[idx];
      if (roadWp && roadWp.roadMarker) {
        droneMarker.bindPopup(() => {
          return createWaypointEditorDOM(roadWp, idx, roadWp.roadMarker, droneMarker);
        }, {
          maxWidth: 220,
          minWidth: 210
        });

        droneMarker.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          droneMarker.openPopup();
        });
      }
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
        });
      }

      marker.bindPopup(() => {
        return createWaypointEditorDOM(wp, idx, marker);
      }, {
        maxWidth: 220,
        minWidth: 210
      });

      marker.addTo(waypointMarkersGroup);
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
      
      let htmlContent = '';
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
        htmlContent += `<div class="legend-item"><span class="legend-color" style="background-color: ${color};"></span> Alt: ${formatDistance(alt, 1)}</div>`;
      });
      
      div.innerHTML = `
        <div class="legend-header" style="display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 8px;">
          <h4 style="margin: 0; line-height: 1.2;">Imported Layers</h4>
          <button class="legend-toggle-btn" type="button" aria-label="Toggle legend details" style="background: none; border: none; color: var(--text-muted); cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 2px; border-radius: 4px;">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.3s ease;">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
        </div>
        <div class="legend-content" style="transition: opacity 0.2s ease;">
          ${htmlContent}
        </div>
      `;
      
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

    div.innerHTML = `
      <div class="legend-header" style="display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 8px;">
        <h4 style="margin: 0; line-height: 1.2;">${title}</h4>
        <button class="legend-toggle-btn" type="button" aria-label="Toggle legend details" style="background: none; border: none; color: var(--text-muted); cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 2px; border-radius: 4px;">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.3s ease;">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
      </div>
      <div class="legend-content" style="transition: opacity 0.2s ease;">
        ${itemsHtml}
      </div>
    `;

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
    'VFR Sectional Chart',
    'Controlled Airspace (Class B/C/D/E)',
    'Restricted & Special Use Airspace',
    'UAS Facility Maps (LAANC)',
    'Obstacles & Antennas (FAA)',
    'Weather Radar (NEXRAD)',
    'Weather Warnings (NWS Hazards)'
  ];

  const hasOverlay = overlayNames.some(n => airspaceActiveSet.has(n));
  container.style.display = hasOverlay ? '' : 'none';
  if (!hasOverlay) return;

  const currentZoom = map ? map.getZoom() : 99;
  const laancActive = airspaceActiveSet.has('UAS Facility Maps (LAANC)');
  const laancZoomedOut = laancActive && currentZoom < LAANC_MIN_ZOOM;
  const obstaclesActive = airspaceActiveSet.has('Obstacles & Antennas (FAA)');
  const obstaclesZoomedOut = obstaclesActive && currentZoom < OBSTACLES_MIN_ZOOM;

  let html = `<div class="legend-header" style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:8px;">
    <h4 style="margin:0;line-height:1.2;">Map Overlays</h4>
  </div><div class="legend-content">`;

  if (airspaceActiveSet.has('VFR Sectional Chart')) {
    html += `<div style="font-size:0.72rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin:6px 0 4px;">VFR Chart</div>`;
    html += `<div class="legend-item"><span class="legend-color" style="background:linear-gradient(135deg,#6eb5ff,#a0c8ff);border:1px solid rgba(255,255,255,0.2);opacity:0.8;"></span> Raster aeronautical chart</div>`;
  }

  if (airspaceActiveSet.has('Controlled Airspace (Class B/C/D/E)')) {
    html += `<div style="font-size:0.72rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin:6px 0 4px;">Controlled Airspace</div>`;
    html += `<div class="legend-item"><span class="legend-color" style="background:#2563eb;"></span> Class B (Surface–10,000 ft)</div>`;
    html += `<div class="legend-item"><span class="legend-color" style="background:#a855f7;"></span> Class C (Surface–4,000 ft)</div>`;
    html += `<div class="legend-item"><span class="legend-color" style="background:#ec4899;"></span> Class D (Surface–2,500 ft)</div>`;
    html += `<div class="legend-item"><span class="legend-color" style="background:#10b981;"></span> Class E (Varies)</div>`;
  }

  if (airspaceActiveSet.has('Restricted & Special Use Airspace')) {
    html += `<div style="font-size:0.72rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin:6px 0 4px;">Special Use Airspace</div>`;
    html += `<div class="legend-item"><span class="legend-color" style="background:#ef4444;"></span> Prohibited / Restricted</div>`;
    html += `<div class="legend-item"><span class="legend-color" style="background:#f59e0b;"></span> Warning Area / MOA</div>`;
  }

  if (laancActive) {
    html += `<div style="font-size:0.72rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin:6px 0 4px;">LAANC Grid Ceilings</div>`;
    if (laancZoomedOut) {
      html += `<div style="font-size:0.75rem;color:var(--accent-yellow);display:flex;align-items:center;gap:5px;margin-bottom:4px;">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        Zoom in to zoom level ${LAANC_MIN_ZOOM}+ to load grids
      </div>`;
    } else {
      html += `<div class="legend-item"><span class="legend-color" style="background:#ef4444;"></span> 0 ft (No ops without LAANC auth)</div>`;
      html += `<div class="legend-item"><span class="legend-color" style="background:#f97316;"></span> ≤100 ft</div>`;
      html += `<div class="legend-item"><span class="legend-color" style="background:#f59e0b;"></span> ≤200 ft</div>`;
      html += `<div class="legend-item"><span class="legend-color" style="background:#eab308;"></span> ≤300 ft</div>`;
      html += `<div class="legend-item"><span class="legend-color" style="background:#10b981;"></span> 400 ft (Standard max)</div>`;
    }
  }

  if (obstaclesActive) {
    html += `<div style="font-size:0.72rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin:6px 0 4px;">Obstacles & Antennas</div>`;
    if (obstaclesZoomedOut) {
      html += `<div style="font-size:0.75rem;color:var(--accent-yellow);display:flex;align-items:center;gap:5px;margin-bottom:4px;">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        Zoom in to zoom level ${OBSTACLES_MIN_ZOOM}+ to load obstacles
      </div>`;
    } else {
      html += `<div class="legend-item"><span class="legend-color" style="background:#f97316; border-radius: 50%; width: 12px; height: 12px; display: inline-block;"></span> FAA Obstacle/Antenna</div>`;
    }
  }

  if (airspaceActiveSet.has('Weather Radar (NEXRAD)')) {
    html += `<div style="font-size:0.72rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin:6px 0 4px;">Weather Radar</div>`;
    html += `<div class="legend-item" style="flex-direction: column; align-items: stretch; gap: 4px; width: 100%;">
      <div style="display: flex; height: 8px; border-radius: 4px; overflow: hidden; background: linear-gradient(to right, #00ecec, #00d800, #ff0000, #d800d8);"></div>
      <div style="display: flex; justify-content: space-between; font-size: 0.65rem; color: var(--text-muted); width: 100%;">
        <span>Light Rain</span>
        <span>Heavy Storm</span>
      </div>
    </div>`;
  }

  if (airspaceActiveSet.has('Weather Warnings (NWS Hazards)')) {
    html += `<div style="font-size:0.72rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin:6px 0 4px;">Weather Warnings</div>`;
    html += `<div class="legend-item"><span class="legend-color" style="background:#ef4444; border: 1px solid rgba(255,255,255,0.2);"></span> NWS Active Warning Area</div>`;
    html += `<div class="legend-item"><span class="legend-color" style="background:#f59e0b; border: 1px solid rgba(255,255,255,0.2);"></span> NWS Active Watch / Advisory</div>`;
  }

  html += '</div>';
  container.innerHTML = html;
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

  // Refresh the legend to show/hide the zoom notice
  updateAirspaceLegend(null);
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

      console.warn("OSRM routing failed, falling back to direct line segment.");
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
      console.error("OSRM error:", err);
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
    let warningHTML = "";
    
    // Check isolated waypoints
    if (stats.hasIsolatedWaypoint) {
      const formattedGap = formatDistance(stats.maxNearestNeighborDist);
      const limitStr = unit === 'imperial' ? "328 ft" : "100m";
      warningHTML += `<div>⚠️ <strong>Warning:</strong> Waypoints are isolated (>${limitStr} from any other)! (Max gap: ${formattedGap})</div>`;
    }

    // Check max flight time limit
    if (stats.isOverMaxFlightTime) {
      warningHTML += `<div>⚠️ <strong>Flight Time Warning:</strong> Mission duration exceeds max flight time (${stats.maxFlightTimeMinutes} min). It will be split into ${stats.partsCount} separate waypoint starts.</div>`;
    }

    // Check geolocation distance
    if (stats.isFarFromTakeoff) {
      const formattedUserDist = formatDistance(stats.userDistanceToTakeoff);
      const limitStr = unit === 'imperial' ? "2000 ft" : "609.6m";
      warningHTML += `<div style="margin-top: 4px;">⚠️ <strong>Geolocation Warning:</strong> Pilot is far from takeoff location (>${limitStr} away)! (Distance: ${formattedUserDist})</div>`;
    }

    if (warningHTML) {
      warningsEl.innerHTML = warningHTML;
      warningsEl.classList.remove('hidden');
    } else {
      warningsEl.classList.add('hidden');
    }
  }
}

// Generate the WPML template.kml content
function buildTemplateKml(finishAction, speed) {
  const timestamp = Date.now();
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="http://www.uav.com/wpmz/1.0.2">
  <Document>
    <wpml:author>Aalaapi Sky Generator</wpml:author>
    <wpml:createTime>${timestamp}</wpml:createTime>
    <wpml:updateTime>${timestamp}</wpml:updateTime>
    <wpml:missionConfig>
      <wpml:flyToWaylineMode>safely</wpml:flyToWaylineMode>
      <wpml:finishAction>${finishAction}</wpml:finishAction>
      <wpml:exitOnRCLost>executeLostAction</wpml:exitOnRCLost>
      <wpml:executeRCLostAction>goBack</wpml:executeRCLostAction>
      <wpml:globalTransitionalSpeed>${speed}</wpml:globalTransitionalSpeed>
      <wpml:droneInfo>
        <wpml:droneEnumValue>68</wpml:droneEnumValue>
        <wpml:droneSubEnumValue>0</wpml:droneSubEnumValue>
      </wpml:droneInfo>
      <wpml:payloadInfo>
        <wpml:payloadEnumValue>68</wpml:payloadEnumValue>
        <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
      </wpml:payloadInfo>
    </wpml:missionConfig>
  </Document>
</kml>`;
}

// Generate the WPML waylines.wpml content
function buildWaylinesWpml(waypoints, altitude, speed, headingMode, finishAction, gimbalPitch, captureMode, pathMode) {
  const timestamp = Date.now();
  
  // Build XML Placemark tags (waypoints)
  let placemarksXml = '';
  let turnMode;
  let useStraightLine;
  if (pathMode === 'straight') {
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

  let actionGroupId = 1;
  let actionId = 1;

  waypoints.forEach((wp, idx) => {
    let actionsForThisPlacemark = '';
    
    // 1. Always set gimbal pitch at start of flight (waypoint index 0), at start of a new ring, OR at every waypoint for road-following
    const gridType = document.getElementById('grid-type')?.value;
    const isRoadFollowing = gridType === 'road-following';
    if (idx === 0 || wp.isRingStart || isRoadFollowing) {
      const currentPitch = wp.pitch !== undefined ? wp.pitch : gimbalPitch;
      actionsForThisPlacemark += `        <wpml:actionGroup>
          <wpml:actionGroupId>${actionGroupId++}</wpml:actionGroupId>
          <wpml:actionGroupStartIndex>${idx}</wpml:actionGroupStartIndex>
          <wpml:actionGroupEndIndex>${idx}</wpml:actionGroupEndIndex>
          <wpml:actionGroupMode>parallel</wpml:actionGroupMode>
          <wpml:actionTrigger>
            <wpml:actionTriggerType>reachPoint</wpml:actionTriggerType>
          </wpml:actionTrigger>
          <wpml:action>
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
          </wpml:action>
        </wpml:actionGroup>\n`;
    }

    // 2. If Stop & Shoot is active, also add photo trigger at this waypoint
    if (captureMode === 'stopAndShoot') {
      actionsForThisPlacemark += `        <wpml:actionGroup>
          <wpml:actionGroupId>${actionGroupId++}</wpml:actionGroupId>
          <wpml:actionGroupStartIndex>${idx}</wpml:actionGroupStartIndex>
          <wpml:actionGroupEndIndex>${idx}</wpml:actionGroupEndIndex>
          <wpml:actionGroupMode>parallel</wpml:actionGroupMode>
          <wpml:actionTrigger>
            <wpml:actionTriggerType>reachPoint</wpml:actionTriggerType>
          </wpml:actionTrigger>
          <wpml:action>
            <wpml:actionId>${actionId++}</wpml:actionId>
            <wpml:actionActuatorFunc>takePhoto</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>
              <wpml:fileSuffix>photo</wpml:fileSuffix>
              <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
            </wpml:actionActuatorFuncParam>
          </wpml:action>
        </wpml:actionGroup>\n`;
    }

    // 3. Video record actions if captureMode is video (start at waypoint 0, stop at final waypoint)
    if (captureMode === 'video') {
      if (idx === 0) {
        actionsForThisPlacemark += `        <wpml:actionGroup>
          <wpml:actionGroupId>${actionGroupId++}</wpml:actionGroupId>
          <wpml:actionGroupStartIndex>${idx}</wpml:actionGroupStartIndex>
          <wpml:actionGroupEndIndex>${idx}</wpml:actionGroupEndIndex>
          <wpml:actionGroupMode>parallel</wpml:actionGroupMode>
          <wpml:actionTrigger>
            <wpml:actionTriggerType>reachPoint</wpml:actionTriggerType>
          </wpml:actionTrigger>
          <wpml:action>
            <wpml:actionId>${actionId++}</wpml:actionId>
            <wpml:actionActuatorFunc>startRecord</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>
              <wpml:fileSuffix>video</wpml:fileSuffix>
              <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
            </wpml:actionActuatorFuncParam>
          </wpml:action>
        </wpml:actionGroup>\n`;
      } else if (idx === waypoints.length - 1) {
        actionsForThisPlacemark += `        <wpml:actionGroup>
          <wpml:actionGroupId>${actionGroupId++}</wpml:actionGroupId>
          <wpml:actionGroupStartIndex>${idx}</wpml:actionGroupStartIndex>
          <wpml:actionGroupEndIndex>${idx}</wpml:actionGroupEndIndex>
          <wpml:actionGroupMode>parallel</wpml:actionGroupMode>
          <wpml:actionTrigger>
            <wpml:actionTriggerType>reachPoint</wpml:actionTriggerType>
          </wpml:actionTrigger>
          <wpml:action>
            <wpml:actionId>${actionId++}</wpml:actionId>
            <wpml:actionActuatorFunc>stopRecord</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>
              <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
            </wpml:actionActuatorFuncParam>
          </wpml:action>
        </wpml:actionGroup>\n`;
      }
    }

    // Determine heading mode and angle for this waypoint
    let actualHeadingMode = headingMode;
    let actualHeadingAngle = 0;
    let headingAngleEnable = turnMode.includes('Stop') ? 1 : 0;

    if (wp.heading !== null && wp.heading !== undefined) {
      actualHeadingMode = 'smoothTransition';
      actualHeadingAngle = wp.heading;
      headingAngleEnable = 1;
    }

    const currentAltitude = wp.alt !== undefined ? wp.alt : altitude;

    placemarksXml += `      <Placemark>
        <Point>
          <coordinates>
            ${wp.lon.toFixed(13)},${wp.lat.toFixed(13)}
          </coordinates>
        </Point>
        <wpml:index>${idx}</wpml:index>
        <wpml:executeHeight>${currentAltitude}</wpml:executeHeight>
        <wpml:waypointSpeed>${speed}</wpml:waypointSpeed>
        <wpml:waypointHeadingParam>
          <wpml:waypointHeadingMode>${actualHeadingMode}</wpml:waypointHeadingMode>
          <wpml:waypointHeadingAngle>${actualHeadingAngle.toFixed(1)}</wpml:waypointHeadingAngle>
          <wpml:waypointPoiPoint>0.000000,0.000000,0.000000</wpml:waypointPoiPoint>
          <wpml:waypointHeadingAngleEnable>${headingAngleEnable}</wpml:waypointHeadingAngleEnable>
          <wpml:waypointHeadingPathMode>followBadArc</wpml:waypointHeadingPathMode>
          <wpml:waypointHeadingPoiIndex>0</wpml:waypointHeadingPoiIndex>
        </wpml:waypointHeadingParam>
        <wpml:waypointTurnParam>
          <wpml:waypointTurnMode>${turnMode}</wpml:waypointTurnMode>
          <wpml:waypointTurnDampingDist>0</wpml:waypointTurnDampingDist>
        </wpml:waypointTurnParam>
        <wpml:useStraightLine>${useStraightLine}</wpml:useStraightLine>
${actionsForThisPlacemark}        <wpml:waypointGimbalHeadingParam>
          <wpml:waypointGimbalPitchAngle>0</wpml:waypointGimbalPitchAngle>
          <wpml:waypointGimbalYawAngle>0</wpml:waypointGimbalYawAngle>
        </wpml:waypointGimbalHeadingParam>
      </Placemark>\n`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="http://www.uav.com/wpmz/1.0.2">
  <Document>
    <wpml:author>Aalaapi Sky Generator</wpml:author>
    <wpml:createTime>${timestamp}</wpml:createTime>
    <wpml:updateTime>${timestamp}</wpml:updateTime>
    <wpml:missionConfig>
      <wpml:flyToWaylineMode>safely</wpml:flyToWaylineMode>
      <wpml:finishAction>${finishAction}</wpml:finishAction>
      <wpml:exitOnRCLost>executeLostAction</wpml:exitOnRCLost>
      <wpml:executeRCLostAction>goBack</wpml:executeRCLostAction>
      <wpml:globalTransitionalSpeed>${speed}</wpml:globalTransitionalSpeed>
      <wpml:droneInfo>
        <wpml:droneEnumValue>68</wpml:droneEnumValue>
        <wpml:droneSubEnumValue>0</wpml:droneSubEnumValue>
      </wpml:droneInfo>
      <wpml:payloadInfo>
        <wpml:payloadEnumValue>68</wpml:payloadEnumValue>
        <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
      </wpml:payloadInfo>
    </wpml:missionConfig>
    <Folder>
      <wpml:templateId>0</wpml:templateId>
      <wpml:executeHeightMode>relativeToStartPoint</wpml:executeHeightMode>
      <wpml:waylineId>0</wpml:waylineId>
      <wpml:distance>0</wpml:distance>
      <wpml:duration>0</wpml:duration>
      <wpml:autoFlightSpeed>${speed}</wpml:autoFlightSpeed>
      ${placemarksXml}    </Folder>
  </Document>
</kml>`;
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
        ringIndex: wp.ringIndex !== undefined ? wp.ringIndex : null
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

  if (totalDurationSeconds > maxFlightTimeSeconds && waypoints.length > 1) {
    const parts = splitWaypointsIntoParts(waypoints, maxFlightTimeMinutes, speed, captureMode);
    if (parts.length > 1) {
      let confirmMsg = "Warning Details:\n\n";
      if (warningMessage) {
        confirmMsg += warningMessage;
      }
      confirmMsg += `• Flight Time Limit: The estimated mission duration (${totalStats.timeStr}) exceeds the Max Flight Time limit of ${maxFlightTimeMinutes} minutes.\n\n` +
                    `It will be automatically split into ${parts.length} separate KMZ files inside a ZIP archive.\n\n` +
                    `Do you want to proceed with exporting the split mission?`;
      if (!confirm(confirmMsg)) {
        return;
      }

      const parentZip = new JSZip();
      const promises = parts.map((part, index) => {
        const partNum = index + 1;
        const partTemplate = buildTemplateKml(finishAction, speed);
        const partWaylines = buildWaylinesWpml(part.waypoints, altitude, speed, headingMode, finishAction, gimbalPitch, captureMode, pathMode);
        
        const partZip = new JSZip();
        const wpmz = partZip.folder("wpmz");
        wpmz.file("template.kml", partTemplate);
        wpmz.file("waylines.wpml", partWaylines);
        
        return partZip.generateAsync({ type: "blob" }).then(content => {
          let baseName = importedFileName ? importedFileName.replace(/\.kmz$/i, '') : `GridMission_Alt${altitude}m`;
          const partFileName = `${baseName}_Part${partNum}_of_${parts.length}.kmz`;
          parentZip.file(partFileName, content);
        });
      });

      Promise.all(promises).then(() => {
        parentZip.generateAsync({ type: "blob" }).then(content => {
          const link = document.createElement("a");
          link.href = URL.createObjectURL(content);
          let zipName = importedFileName ? importedFileName.replace(/\.kmz$/i, '') : `GridMission_Alt${altitude}m`;
          link.download = `${zipName}_Split_Missions.zip`;
          link.click();
        });
      }).catch(err => {
        console.error("Split ZIP creation failed:", err);
        alert("An error occurred while creating the split KMZ files.");
      });
      return;
    }
  }

  if (warningMessage) {
    const confirmMessage = `Warning Details:\n\n${warningMessage}Do you acknowledge these safety warnings and want to export the mission anyway?`;
    if (!confirm(confirmMessage)) {
      return;
    }
  }

  // 4. Generate XML contents
  const templateKml = buildTemplateKml(finishAction, speed);
  const waylinesWpml = buildWaylinesWpml(waypoints, altitude, speed, headingMode, finishAction, gimbalPitch, captureMode, pathMode);

  // 5. Create ZIP and trigger download
  try {
    const zip = new JSZip();
    const wpmzFolder = zip.folder("wpmz");
    wpmzFolder.file("template.kml", templateKml);
    wpmzFolder.file("waylines.wpml", waylinesWpml);

    zip.generateAsync({ type: "blob" }).then(function (content) {
      const link = document.createElement("a");
      link.href = URL.createObjectURL(content);
      
      // Keep the original filename if imported, otherwise make a new procedurally named one
      if (importedFileName) {
        link.download = importedFileName;
      } else {
        const dateStr = new Date().toISOString().slice(0, 10);
        link.download = `GridMission_Alt${altitude}m_${dateStr}.kmz`;
      }
      link.click();
    });
  } catch (err) {
    console.error("ZIP creation failed:", err);
    alert("An error occurred while creating the KMZ file. Check console for details.");
  }
}

// KMZ Import Handlers & Parsers
function handleKMZImport(e) {
  const file = e.target.files[0];
  if (!file) return;

  importedFileName = file.name;
  const statusText = document.getElementById('import-status-text');
  if (statusText) statusText.textContent = `Loading ${file.name}...`;

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
        console.error("KMZ Import error:", err);
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
    
    const placemarks = xmlDoc.getElementsByTagName("Placemark");
    if (placemarks.length === 0) {
      throw new Error("No waypoints found in the mission file.");
    }

    const waypoints = [];
    const photos = [];
    let sumLat = 0;
    let sumLon = 0;

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
      const actionGroups = pm.getElementsByTagName("wpml:actionGroup") || pm.getElementsByTagName("actionGroup");
      for (let j = 0; j < actionGroups.length; j++) {
        const ag = actionGroups[j];
        const actions = ag.getElementsByTagName("wpml:action") || ag.getElementsByTagName("action");
        for (let k = 0; k < actions.length; k++) {
          const act = actions[k];
          const actuatorNode = act.getElementsByTagName("wpml:actionActuatorFunc")[0] || act.getElementsByTagName("actionActuatorFunc")[0];
          if (actuatorNode && (actuatorNode.textContent === "gimbalRotate" || actuatorNode.textContent === "gimbalEvenlyRotate")) {
            const pitchNode = act.getElementsByTagName("wpml:gimbalPitchRotateAngle")[0] || act.getElementsByTagName("gimbalPitchRotateAngle")[0];
            if (pitchNode) {
              pitch = parseFloat(pitchNode.textContent);
              isRingStart = true;
            }
          }
        }
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

      let hasPhoto = false;
      for (let j = 0; j < actionGroups.length; j++) {
        const ag = actionGroups[j];
        const actions = ag.getElementsByTagName("wpml:action") || ag.getElementsByTagName("action");
        for (let k = 0; k < actions.length; k++) {
          const act = actions[k];
          const actuatorNode = act.getElementsByTagName("wpml:actionActuatorFunc")[0] || act.getElementsByTagName("actionActuatorFunc")[0];
          if (actuatorNode && actuatorNode.textContent === "takePhoto") {
            hasPhoto = true;
          }
        }
      }
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
    console.error("XML Parsing error:", err);
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

function createWaypointEditorDOM(wp, idx, marker, popupMarker) {
  const popupContent = document.createElement('div');
  popupContent.className = 'wp-editor-popup';
  popupContent.style.width = '210px';
  popupContent.style.color = '#f8fafc';
  popupContent.style.fontFamily = 'Outfit, sans-serif';

  const headingVal = (wp.heading !== undefined && wp.heading !== null) ? wp.heading.toFixed(0) : '';
  const pitchVal = (wp.pitch !== undefined && wp.pitch !== null) ? wp.pitch : -45;

  // Track original properties to support revert on cancel
  const originalLat = wp.lat;
  const originalLon = wp.lon;
  const originalX = wp.x;
  const originalY = wp.y;
  const originalAlt = wp.alt;
  const originalPitch = wp.pitch;
  const originalHeading = wp.heading;
  const originalIsRingStart = wp.isRingStart;
  const originalIsModified = wp.isModified;
  const originalOrigIsRingStart = wp.origIsRingStart;
  const originalOrigIsModified = wp.origIsModified;

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
    (wp.origHeading !== undefined && wp.origHeading !== null && wp.heading !== wp.origHeading) ||
    (wp.origHeading === null && wp.heading !== null) ||
    (wp.origHeading !== null && wp.heading === null)
  );

  popupContent.innerHTML = `
    <h4 style="margin: 0 0 12px 0; color: #06b6d4; font-size: 0.95rem; font-weight: 600; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 6px;">Edit Waypoint ${idx}</h4>
    <div style="display: flex; flex-direction: column; gap: 12px; font-size: 0.8rem;">
      
      <!-- Altitude Slider -->
      <div style="display: flex; flex-direction: column; gap: 4px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="color: #94a3b8; font-weight: 500;">Altitude:</span>
          <span style="color: #06b6d4; font-weight: 600;"><span id="edit-wp-alt-val">${altDisp}</span> ${altUnitStr}</span>
        </div>
        <input type="range" id="edit-wp-alt" min="5" max="120" value="${wp.alt.toFixed(0)}" style="width: 100%; height: 5px; border-radius: 3px; background: rgba(255,255,255,0.15); accent-color: #06b6d4; outline: none; border: none; cursor: pointer;">
      </div>
      
      <!-- Pitch Slider -->
      <div style="display: flex; flex-direction: column; gap: 4px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="color: #94a3b8; font-weight: 500;">Gimbal Pitch:</span>
          <span style="color: #06b6d4; font-weight: 600;"><span id="edit-wp-pitch-val">${pitchVal}</span>&deg;</span>
        </div>
        <input type="range" id="edit-wp-pitch" min="-90" max="0" value="${pitchVal}" style="width: 100%; height: 5px; border-radius: 3px; background: rgba(255,255,255,0.15); accent-color: #06b6d4; outline: none; border: none; cursor: pointer;">
      </div>
 
      <!-- Yaw / Heading Slider & Auto Checkbox -->
      <div style="display: flex; flex-direction: column; gap: 4px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="color: #94a3b8; font-weight: 500;">Yaw Heading:</span>
          <span style="color: #06b6d4; font-weight: 600;"><span id="edit-wp-heading-val">${headingVal !== '' ? headingVal + '&deg;' : 'Auto'}</span></span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <input type="range" id="edit-wp-heading" min="0" max="359" value="${headingVal !== '' ? headingVal : 0}" ${headingVal === '' ? 'disabled' : ''} style="flex: 1; height: 5px; border-radius: 3px; background: rgba(255,255,255,0.15); accent-color: #06b6d4; outline: none; border: none; cursor: pointer; ${headingVal === '' ? 'opacity: 0.4;' : ''}">
          <label style="display: inline-flex; align-items: center; gap: 4px; color: #94a3b8; font-size: 0.75rem; cursor: pointer; white-space: nowrap; flex-shrink: 0;">
            <input type="checkbox" id="edit-wp-heading-auto" ${headingVal === '' ? 'checked' : ''} style="cursor: pointer; accent-color: #06b6d4; margin: 0;">
            Auto
          </label>
        </div>
      </div>
 
      <!-- Position Nudge & Lat/Lon Inputs -->
      <div style="display: flex; flex-direction: column; gap: 6px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 8px;">
        <span style="color: #94a3b8; font-weight: 500;">Position (Nudge):</span>
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
        <button id="save-wp-btn" class="btn-primary" style="padding: 6px 12px; font-size: 0.75rem; flex: 1; min-height: 28px; line-height: 1.2;">Save</button>
        <button id="reset-wp-btn" class="btn-secondary" style="padding: 6px 12px; font-size: 0.75rem; color: #eab308; border-color: rgba(234, 179, 8, 0.3); flex: 1; min-height: 28px; line-height: 1.2; display: ${hasMoved ? 'inline-block' : 'none'};">Reset</button>
        <button id="delete-wp-btn" class="btn-secondary" style="padding: 6px 12px; font-size: 0.75rem; color: #ef4444; border-color: rgba(239, 68, 68, 0.3); flex: 1; min-height: 28px; line-height: 1.2;">Delete</button>
      </div>min-height: 28px; line-height: 1.2;">Delete</button>
      </div>
    </div>
  `;

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
  const headingAutoCheckbox = popupContent.querySelector('#edit-wp-heading-auto');

  const latInput = popupContent.querySelector('#edit-wp-lat');
  const lonInput = popupContent.querySelector('#edit-wp-lon');

  // Real-time map update helper
  const updateRealtimeMarker = () => {
    const isAutoYaw = headingAutoCheckbox.checked;
    const tempHeading = isAutoYaw ? null : parseFloat(headingSlider.value);
    const tempPitch = parseFloat(pitchSlider.value);
    const tempAlt = parseFloat(altSlider.value);
    const rotationDeg = parseFloat(document.getElementById('grid-rotation').value);

    // Apply temporary lat/lon position to marker representation on map
    const latVal = parseFloat(latInput.value);
    const lonVal = parseFloat(lonInput.value);
    
    // Temporarily update wp properties for real-time calculation
    wp.alt = tempAlt;
    wp.pitch = tempPitch;
    wp.heading = tempHeading;

    if (!isNaN(latVal) && !isNaN(lonVal)) {
      marker.setLatLng([latVal, lonVal]);
      
      // Update global wp temporary values for real-time path updates
      const centerLatLng = centerMarker.getLatLng();
      const offsets = geodeticToLocal(latVal, lonVal, centerLatLng.lat, centerLatLng.lng);
      wp.lat = latVal;
      wp.lon = lonVal;
      wp.x = offsets.x;
      wp.y = offsets.y;
      
      const gridType = document.getElementById('grid-type')?.value;
      if (hasPhoto && gridType !== 'road-following') {
        activePhotos[idx].lat = latVal;
        activePhotos[idx].lon = lonVal;
        activePhotos[idx].x = offsets.x;
        activePhotos[idx].y = offsets.y;
      }
      
      if (gridType === 'road-following') {
        recalculateRoadOffsetPath(centerLatLng.lat, centerLatLng.lng);

        // Update all drone markers positions and tooltips
        const defaultGimbalPitch = parseFloat(document.getElementById('gimbal-pitch').value);
        generatedWaypoints.forEach((gwp) => {
          if (gwp.mapMarker) {
            gwp.mapMarker.setLatLng([gwp.lat, gwp.lon]);
            const gPitch = gwp.pitch !== undefined && gwp.pitch !== null ? gwp.pitch : defaultGimbalPitch;
            const tooltipContent = `Drone Waypoint ${gwp.idx}<br>Height: ${formatDistance(gwp.alt, 0)}<br>Yaw: ${gwp.heading.toFixed(0)}°<br>Pitch: ${gPitch}°`;
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
      const computedHeading = isAutoYaw ? getDefaultHeading(idx, getCurrentWaypoints(), rotationDeg) : tempHeading;
      const newTitle = `${isStart ? "Start Point" : (isEnd ? "End Point" : `Waypoint ${idx}`)}<br>Height: ${formatDistance(tempAlt, 0)}<br>Yaw: ${computedHeading.toFixed(0)}°<br>Pitch: ${tempPitch}°`;
      marker.getTooltip().setContent(newTitle);
    } else {
      // Keep simple tooltip for road nodes
      marker.getTooltip().setContent(`Road Node ${idx}`);
    }

    // Dynamic visibility update for Reset button
    const currentLat = parseFloat(latInput.value);
    const currentLon = parseFloat(lonInput.value);
    const currentAlt = parseFloat(altSlider.value);
    const currentPitch = parseFloat(pitchSlider.value);
    const currentIsAutoYaw = headingAutoCheckbox.checked;
    const currentHeading = currentIsAutoYaw ? null : parseFloat(headingSlider.value);

    const isChangedFromOrig = (
      (wp.origLat !== undefined && wp.origLat !== null && Math.abs(currentLat - wp.origLat) > 1e-9) ||
      (wp.origLon !== undefined && wp.origLon !== null && Math.abs(currentLon - wp.origLon) > 1e-9) ||
      (wp.origAlt !== undefined && wp.origAlt !== null && Math.abs(currentAlt - wp.origAlt) > 1e-3) ||
      (wp.origPitch !== undefined && wp.origPitch !== null && currentPitch !== wp.origPitch) ||
      (wp.origHeading !== undefined && wp.origHeading !== null && currentHeading !== wp.origHeading) ||
      (wp.origHeading === null && currentHeading !== null) ||
      (wp.origHeading !== null && currentHeading === null)
    );

    if (resetBtn) {
      resetBtn.style.display = isChangedFromOrig ? 'inline-block' : 'none';
    }
  };

  // Add event listeners to sliders
  altSlider.addEventListener('input', () => {
    const val = parseFloat(altSlider.value);
    altValText.textContent = unit === 'imperial' ? Math.round(val * M_TO_FT) : val.toFixed(0);
    updateRealtimeMarker();
  });

  pitchSlider.addEventListener('input', () => {
    pitchValText.textContent = pitchSlider.value;
    updateRealtimeMarker();
  });

  headingSlider.addEventListener('input', () => {
    headingValText.textContent = headingSlider.value + '°';
    updateRealtimeMarker();
  });

  headingAutoCheckbox.addEventListener('change', () => {
    if (headingAutoCheckbox.checked) {
      headingSlider.disabled = true;
      headingSlider.style.opacity = '0.4';
      headingValText.textContent = 'Auto';
    } else {
      headingSlider.disabled = false;
      headingSlider.style.opacity = '1';
      headingValText.textContent = headingSlider.value + '°';
    }
    updateRealtimeMarker();
  });

  // Direct coordinate inputs listeners
  latInput.addEventListener('input', updateRealtimeMarker);
  lonInput.addEventListener('input', updateRealtimeMarker);

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
  
  const revertChanges = () => {
    if (isSaved) return;
    
    // Restore original values in the state
    wp.lat = originalLat;
    wp.lon = originalLon;
    wp.x = originalX;
    wp.y = originalY;
    wp.alt = originalAlt;
    wp.pitch = originalPitch;
    wp.heading = originalHeading;
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
    marker.getTooltip().setContent(originalTitle);

    // Redraw lines and stats
    const centerLatLng = centerMarker.getLatLng();
    updatePathLinesAndStats(getCurrentWaypoints(), getCurrentPhotos(), centerLatLng.lat, centerLatLng.lng, parseFloat(document.getElementById('grid-width').value), parseFloat(document.getElementById('grid-height').value), rotationDeg);
  };

  const popupCloseMarker = popupMarker || marker;
  popupCloseMarker.on('popupclose', revertChanges);

  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      isSaved = true; // Mark as saved so revert listener doesn't trigger
      
      const altVal = parseFloat(altSlider.value);
      const pitchVal = parseFloat(pitchSlider.value);
      const isAutoYaw = headingAutoCheckbox.checked;
      const headingVal = isAutoYaw ? null : parseFloat(headingSlider.value);
      const latVal = parseFloat(latInput.value);
      const lonVal = parseFloat(lonInput.value);

      wp.alt = altVal;
      wp.pitch = pitchVal;
      wp.heading = headingVal;
      wp.lat = latVal;
      wp.lon = lonVal;
      wp.isRingStart = true; // Mark as explicit parameter change point
      wp.isModified = true; // Mark as edited

      popupCloseMarker.off('popupclose', revertChanges); // Unbind revert listener
      popupCloseMarker.closePopup();
      redrawCurrentMission();
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      isSaved = true; // Mark as saved so revert listener doesn't trigger
      
      if (wp.origLat !== undefined && wp.origLat !== null) wp.lat = wp.origLat;
      if (wp.origLon !== undefined && wp.origLon !== null) wp.lon = wp.origLon;
      
      const centerLatLng = centerMarker.getLatLng();
      const offsets = geodeticToLocal(wp.lat, wp.lon, centerLatLng.lat, centerLatLng.lng);
      wp.x = offsets.x;
      wp.y = offsets.y;
      
      if (wp.origAlt !== undefined && wp.origAlt !== null) wp.alt = wp.origAlt;
      if (wp.origPitch !== undefined && wp.origPitch !== null) wp.pitch = wp.origPitch;
      if (wp.origHeading !== undefined) wp.heading = wp.origHeading;
      wp.isRingStart = wp.origIsRingStart !== undefined ? wp.origIsRingStart : false;
      wp.isModified = wp.origIsModified !== undefined ? wp.origIsModified : false;
      
      // Also reset photo locations if they exist
      const activePhotos = getCurrentPhotos();
      if (hasPhoto && activePhotos && activePhotos[idx]) {
        const photo = activePhotos[idx];
        if (photo.origLat !== undefined && photo.origLat !== null) photo.lat = photo.origLat;
        if (photo.origLon !== undefined && photo.origLon !== null) photo.lon = photo.origLon;
        const ptOffsets = geodeticToLocal(photo.lat, photo.lon, centerLatLng.lat, centerLatLng.lng);
        photo.x = ptOffsets.x;
        photo.y = ptOffsets.y;
        if (photo.origAlt !== undefined && photo.origAlt !== null) photo.alt = photo.origAlt;
        if (photo.origPitch !== undefined && photo.origPitch !== null) photo.pitch = photo.origPitch;
        if (photo.origHeading !== undefined) photo.heading = photo.origHeading;
        photo.isRingStart = photo.origIsRingStart !== undefined ? photo.origIsRingStart : false;
        photo.isModified = photo.origIsModified !== undefined ? photo.origIsModified : false;
      }
      
      popupCloseMarker.off('popupclose', revertChanges);
      popupCloseMarker.closePopup();
      
      const gridType = document.getElementById('grid-type')?.value;
      if (gridType === 'road-following') {
        recalculateRoadOffsetPath(centerLatLng.lat, centerLatLng.lng);
      }
      
      redrawCurrentMission();
    });
  }

  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      const gridType = document.getElementById('grid-type').value;
      if (confirm(`Are you sure you want to delete ${gridType === 'road-following' ? 'Road Node' : 'Waypoint'} ${idx}?`)) {
        isSaved = true; // Prevent revert from firing
        popupCloseMarker.off('popupclose', revertChanges);

        const activeWps = gridType === 'road-following' ? roadWaypoints : getCurrentWaypoints();
        const activePts = gridType === 'road-following' ? null : getCurrentPhotos();
        
        if (activeWps) {
          activeWps.splice(idx, 1);
          activeWps.forEach((w, newIdx) => {
            w.idx = newIdx;
          });
        }
        if (activePts && activePts[idx]) {
          activePts.splice(idx, 1);
        }
        
        popupCloseMarker.closePopup();
        redrawCurrentMission();
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

            // Draw coverage heatmap
            drawCoverageHeatmap(ctx, planeOffsetX, planeOffsetZ, planeSize);
            groundTexture.needsUpdate = true;
          }
        };

        img.src = url;
      }
    }
  } catch (err) {
    console.warn("Failed to initialize ground map texture:", err);
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
  coneGroups = [];
  const rotationDeg = parseFloat(document.getElementById('grid-rotation').value) || 0;
  const defaultGimbalPitch = parseFloat(document.getElementById('gimbal-pitch').value) || -60;

  const waypointsGroup = new THREE.Group();
  const pathsGroup = new THREE.Group();
  const groundLinesGroup = new THREE.Group();
  const conesGroup = new THREE.Group();

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
      colorHex = 0xec4899; // Hot pink
    } else {
      if (wp.ringIndex === 0) colorHex = 0xa855f7; // High Orbit
      else if (wp.ringIndex === 1) colorHex = 0x06b6d4; // Mid Orbit / Standard Grid
      else if (wp.ringIndex === 2) colorHex = 0xf59e0b; // Low Orbit
      else if (wp.ringIndex === 3) colorHex = 0x3b82f6; // Combo Grid
    }

    let sphereMat = materialCache[colorHex];
    if (!sphereMat) {
      sphereMat = new THREE.MeshPhongMaterial({
        color: colorHex,
        shininess: 80,
        emissive: colorHex,
        emissiveIntensity: 0.2
      });
      materialCache[colorHex] = sphereMat;
    }

    const sphereGeom = new THREE.SphereGeometry(r, 16, 16);
    const sphereMesh = new THREE.Mesh(sphereGeom, sphereMat);
    sphereMesh.position.set(x3d, y3d, z3d);
    waypointsGroup.add(sphereMesh);

    // Plot Vertical Ground projector
    const vertPoints = [
      new THREE.Vector3(x3d, 0, z3d),
      new THREE.Vector3(x3d, y3d, z3d)
    ];
    const vertGeom = new THREE.BufferGeometry().setFromPoints(vertPoints);
    const vertMat = new THREE.LineBasicMaterial({
      color: 0x94a3b8,
      transparent: true,
      opacity: 0.35
    });
    const vertLine = new THREE.Line(vertGeom, vertMat);
    groundLinesGroup.add(vertLine);

    // Plot Path Segment to next waypoint
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

      // Add Directional Arrow (Cone) pointing from wp to nextWp at midpoint
      const direction = new THREE.Vector3().subVectors(endVec, startVec);
      const segLen3d = direction.length();
      if (segLen3d > 4.0) {
        direction.normalize();
        
        // Midpoint of segment
        const midpoint = new THREE.Vector3().addVectors(startVec, endVec).multiplyScalar(0.5);
        
        // Create small arrow cone
        const arrowConeGeom = new THREE.ConeGeometry(0.8, 2.5, 8);
        const arrowConeMat = new THREE.MeshBasicMaterial({
          color: segColor,
          depthTest: true
        });
        const arrowConeMesh = new THREE.Mesh(arrowConeGeom, arrowConeMat);
        arrowConeMesh.position.copy(midpoint);
        
        // Align standard Cone (Y-axis pointing up) with direction vector
        const upVector = new THREE.Vector3(0, 1, 0);
        arrowConeMesh.quaternion.setFromUnitVectors(upVector, direction);
        pathsGroup.add(arrowConeMesh);
      }
    }

    // Plot Camera FOV Cone (Rectangular Frustum matching camera specs)
    let heading = 0;
    if (wp.heading !== null && wp.heading !== undefined) {
      heading = wp.heading;
    } else {
      heading = getDefaultHeading(idx, waypoints, rotationDeg);
    }
    const pitch = wp.pitch !== undefined && wp.pitch !== null ? wp.pitch : defaultGimbalPitch;

    const localConeGroup = new THREE.Group();
    localConeGroup.position.set(x3d, y3d, z3d);
    localConeGroup.rotation.y = -heading * Math.PI / 180; // Compass rotation clockwise

    const coneHeight = 8;
    const coneGeom = createCameraPyramidGeometry(CAMERA_HFOV, CAMERA_VFOV, coneHeight);

    let coneColorHex = colorHex;
    if (!wp.isModified && wp.ringIndex === null) {
      coneColorHex = 0x06b6d4;
    }

    // Volumetric fill material (transparent solid face rendering)
    const coneMat = new THREE.MeshBasicMaterial({
      color: coneColorHex,
      transparent: true,
      opacity: 0.08,
      side: THREE.DoubleSide
    });

    const coneMesh = new THREE.Mesh(coneGeom, coneMat);
    coneMesh.rotation.x = (90 + pitch) * Math.PI / 180; // pitch rotation

    // Clean outer outline (frustum edges, no diagonal lines)
    const edgesGeom = new THREE.EdgesGeometry(coneGeom);
    const edgesMat = new THREE.LineBasicMaterial({
      color: coneColorHex,
      transparent: true,
      opacity: 0.35
    });
    const edgesLine = new THREE.LineSegments(edgesGeom, edgesMat);
    coneMesh.add(edgesLine);

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

  // 9. Reset view
  reset3DCamera();

  // 10. Animation render loop
  const animate = () => {
    threeAnimationId = requestAnimationFrame(animate);
    if (threeControls) threeControls.update();
    if (threeRenderer && threeScene && threeCamera) {
      threeRenderer.render(threeScene, threeCamera);
    }
  };
  animate();

  window.addEventListener('resize', handle3DResize);
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

