const THEME_STORAGE_KEY = 'aalaapi_sky_theme';

function getAppTheme() {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(THEME_STORAGE_KEY) || 'dark';
    }
  } catch (e) {}
  return 'dark';
}

function setAppTheme(theme) {
  const current = theme === 'light' ? 'light' : 'dark';
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.setAttribute('data-theme', current);
  }
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(THEME_STORAGE_KEY, current);
    }
  } catch (e) {}

  if (typeof document !== 'undefined') {
    const themeBtn = document.getElementById('theme-toggle-btn');
    if (themeBtn) {
      themeBtn.textContent = current === 'light' ? '🌙' : '☀️';
      themeBtn.title = current === 'light' ? 'Switch to Dark Mode' : 'Switch to Light (Field) Mode';
    }
    const themeSelect = document.getElementById('theme-mode-select');
    if (themeSelect && themeSelect.value !== current) {
      themeSelect.value = current;
    }
  }
  return current;
}

function toggleAppTheme() {
  const current = getAppTheme();
  const next = current === 'light' ? 'dark' : 'light';
  setAppTheme(next);
  return next;
}

function initTheme() {
  const saved = getAppTheme();
  setAppTheme(saved);
  if (typeof document !== 'undefined') {
    const themeSelect = document.getElementById('theme-mode-select');
    if (themeSelect) {
      themeSelect.value = saved;
      themeSelect.addEventListener('change', () => {
        setAppTheme(themeSelect.value);
      });
    }
  }
}

// Map & Camera Visual Palette System
const CAMERA_PALETTE_STORAGE_KEY = 'aalaapi_sky_camera_palette';
const CAMERA_CONES_STORAGE_KEY = 'aalaapi_sky_camera_cones';

const CAMERA_PALETTES = {
  'high-viz-amber': {
    id: 'high-viz-amber',
    name: 'High-Viz Amber (Cyan Path + Amber Camera)',
    arrowColor: '#f59e0b',
    coneColor: 'rgba(245, 158, 11, 0.38)',
    pathColor: '#06b6d4',
    swatches: ['#06b6d4', '#f59e0b']
  },
  'electric-lime': {
    id: 'electric-lime',
    name: 'Electric Lime (Azure Path + Neon Lime Camera)',
    arrowColor: '#22c55e',
    coneColor: 'rgba(34, 197, 94, 0.38)',
    pathColor: '#0284c7',
    swatches: ['#0284c7', '#22c55e']
  },
  'coral-crimson': {
    id: 'coral-crimson',
    name: 'Coral Crimson (Cyan Path + Hot Coral Camera)',
    arrowColor: '#f43f5e',
    coneColor: 'rgba(244, 63, 94, 0.38)',
    pathColor: '#06b6d4',
    swatches: ['#06b6d4', '#f43f5e']
  },
  'neon-magenta': {
    id: 'neon-magenta',
    name: 'Neon Magenta (Emerald Path + Vivid Magenta Camera)',
    arrowColor: '#d946ef',
    coneColor: 'rgba(217, 70, 239, 0.38)',
    pathColor: '#10b981',
    swatches: ['#10b981', '#d946ef']
  },
  'solar-yellow': {
    id: 'solar-yellow',
    name: 'Solar Yellow (Cobalt Path + Bright Yellow Camera)',
    arrowColor: '#eab308',
    coneColor: 'rgba(234, 179, 8, 0.40)',
    pathColor: '#2563eb',
    swatches: ['#2563eb', '#eab308']
  },
  'classic-cyan': {
    id: 'classic-cyan',
    name: 'Monochrome Classic (Matched Path & Camera)',
    arrowColor: null,
    coneColor: null,
    pathColor: null,
    swatches: ['#06b6d4', '#06b6d4']
  }
};

let cachedCameraPalette = null;
let cachedCameraCones = null;

function getActiveCameraPalette() {
  if (cachedCameraPalette && CAMERA_PALETTES[cachedCameraPalette]) {
    return CAMERA_PALETTES[cachedCameraPalette];
  }
  const el = typeof document !== 'undefined' ? document.getElementById('camera-palette-select') : null;
  if (el && CAMERA_PALETTES[el.value]) {
    cachedCameraPalette = el.value;
    return CAMERA_PALETTES[cachedCameraPalette];
  }
  let saved = null;
  try {
    if (typeof localStorage !== 'undefined') {
      saved = localStorage.getItem(CAMERA_PALETTE_STORAGE_KEY);
    }
  } catch (e) {}
  if (saved && CAMERA_PALETTES[saved]) {
    cachedCameraPalette = saved;
  } else {
    cachedCameraPalette = 'high-viz-amber';
  }
  return CAMERA_PALETTES[cachedCameraPalette];
}

function updatePaletteSwatchPreview(paletteId) {
  if (typeof document === 'undefined') return;
  const pId = paletteId || (getActiveCameraPalette() ? getActiveCameraPalette().id : 'high-viz-amber');
  const palette = CAMERA_PALETTES[pId];
  const preview = document.getElementById('palette-swatch-preview');
  if (preview && palette) {
    preview.innerHTML = `
      <span class="palette-swatch-chip" style="background-color: ${palette.swatches[0]};" title="Flight Path"></span>
      <span class="palette-swatch-chip" style="background-color: ${palette.swatches[1]};" title="Camera Pointer"></span>
    `;
  }
}

function setCameraPalette(paletteId) {
  if (!CAMERA_PALETTES[paletteId]) return;
  cachedCameraPalette = paletteId;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(CAMERA_PALETTE_STORAGE_KEY, paletteId);
    }
  } catch (e) {}

  if (typeof document !== 'undefined') {
    const el = document.getElementById('camera-palette-select');
    if (el && el.value !== paletteId) el.value = paletteId;
    updatePaletteSwatchPreview(paletteId);
  }

  if (typeof getCurrentWaypoints === 'function' && getCurrentWaypoints()) {
    if (typeof redrawCurrentMission === 'function') redrawCurrentMission();
  } else if (typeof updateGrid === 'function') {
    updateGrid();
  }
}

function isCameraConeEnabled() {
  if (cachedCameraCones !== null) return cachedCameraCones;
  const el = typeof document !== 'undefined' ? document.getElementById('camera-cones-toggle') : null;
  if (el) {
    cachedCameraCones = !!el.checked;
    return cachedCameraCones;
  }
  try {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(CAMERA_CONES_STORAGE_KEY);
      if (saved !== null) {
        cachedCameraCones = (saved === 'true');
        return cachedCameraCones;
      }
    }
  } catch (e) {}
  cachedCameraCones = true;
  return cachedCameraCones;
}

function setCameraConeEnabled(enabled) {
  cachedCameraCones = !!enabled;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(CAMERA_CONES_STORAGE_KEY, cachedCameraCones ? 'true' : 'false');
    }
  } catch (e) {}

  if (typeof document !== 'undefined') {
    const el = document.getElementById('camera-cones-toggle');
    if (el && el.checked !== cachedCameraCones) el.checked = cachedCameraCones;
  }

  if (typeof getCurrentWaypoints === 'function' && getCurrentWaypoints()) {
    if (typeof redrawCurrentMission === 'function') redrawCurrentMission();
  } else if (typeof updateGrid === 'function') {
    updateGrid();
  }
}

// Attach to window for inline onclick handlers and testing
if (typeof window !== 'undefined') {
  window.getAppTheme = getAppTheme;
  window.setAppTheme = setAppTheme;
  window.toggleAppTheme = toggleAppTheme;
  window.initTheme = initTheme;
  window.getUnitSystem = getUnitSystem;
  window.setUnitSystem = setUnitSystem;
  window.toggleUnitSystem = toggleUnitSystem;
  window.CAMERA_PALETTES = CAMERA_PALETTES;
  window.getActiveCameraPalette = getActiveCameraPalette;
  window.setCameraPalette = setCameraPalette;
  window.updatePaletteSwatchPreview = updatePaletteSwatchPreview;
  window.isCameraConeEnabled = isCameraConeEnabled;
  window.setCameraConeEnabled = setCameraConeEnabled;
}

function initGeolocation() {
  const btn = document.getElementById('locate-me-btn');
  const label = document.getElementById('locate-me-label');
  const LOCATION_CACHE_KEY = 'aalaapi_sky_last_location';

  // Helper — applies a location object {lat, lon} to app state and flies map
  function applyLocation(loc, isCached) {
    userLocation = { lat: loc.lat, lon: loc.lon };
    if (label) label.textContent = isCached ? 'Cached' : 'Located';
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
  if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return;
  const cards = document.querySelectorAll('.pattern-card');
  const selectEl = document.getElementById('grid-type');
  if (!selectEl || typeof selectEl.addEventListener !== 'function') return;

  cards.forEach(card => {
    card.addEventListener('click', () => {
      const val = card.getAttribute('data-value');
      if (!val) return; // Special tool cards (such as #auto-plan-btn) manage their own actions
      
      // Update select value
      selectEl.value = val;
      
      // Sync active state in UI
      cards.forEach(c => {
        if (c.getAttribute('data-value')) c.classList.remove('active');
      });
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
      const cardVal = card.getAttribute('data-value');
      if (!cardVal) return;
      if (cardVal === val) {
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

if (typeof window !== 'undefined') {
  window.initPatternSelectorCards = initPatternSelectorCards;
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPatternSelectorCards);
  } else {
    initPatternSelectorCards();
  }
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

// Global Exclusion Detour Settings (v1.71.0)
let globalExclusionDetourMode = 'perimeter'; // 'perimeter', 'overTop', 'smart'
let globalExclusionClearanceBuffer = 5; // meters above ceiling

// ==========================================================================
// Flight Pattern Layers & Multi-Layer Mission Manager (v1.62.0)
// ==========================================================================

