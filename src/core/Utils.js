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

function setUnitSystem(newUnit) {
  if (newUnit !== 'imperial' && newUnit !== 'metric') return;
  cachedUnitSystem = newUnit;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('aalaapi_sky_unit_system', newUnit);
    }
  } catch (e) {}

  if (typeof document !== 'undefined') {
    const el = document.getElementById('unit-system');
    if (el) el.value = newUnit;

    const badge = document.getElementById('header-unit-badge');
    if (badge) {
      badge.textContent = newUnit === 'imperial' ? 'FT / MPH' : 'M / M/S';
    }
  }

  if (typeof syncDisplayValues === 'function') {
    syncDisplayValues();
  }

  if (typeof renderLayersList === 'function') {
    renderLayersList();
  }

  if (typeof updateFiducialAdvisorUI === 'function') {
    updateFiducialAdvisorUI();
  }

  if (typeof getCurrentWaypoints === 'function' && getCurrentWaypoints()) {
    if (typeof redrawCurrentMission === 'function') redrawCurrentMission();
  } else if (typeof updateGrid === 'function') {
    updateGrid();
  }
}

function toggleUnitSystem() {
  const current = (typeof getUnitSystem === 'function') ? getUnitSystem() : 'imperial';
  const next = current === 'imperial' ? 'metric' : 'imperial';
  setUnitSystem(next);
  return next;
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

function formatSpeed(mps, decimalPlaces = 1) {
  if (mps === null || mps === undefined || isNaN(mps)) {
    return `0 ${getUnitSystem() === 'imperial' ? 'mph' : 'm/s'}`;
  }
  const unit = getUnitSystem();
  if (unit === 'imperial') {
    const mph = mps * MPS_TO_MPH;
    return `${mph.toFixed(decimalPlaces)} mph`;
  }
  return `${mps.toFixed(decimalPlaces)} m/s`;
}

function formatUnitDistance(meters, decimalPlaces = 0) {
  if (meters === null || meters === undefined || isNaN(meters)) return '0m';
  const unit = (typeof getUnitSystem === 'function') ? getUnitSystem() : 'imperial';
  if (unit === 'imperial') {
    const ft = decimalPlaces > 0 ? (meters * M_TO_FT).toFixed(decimalPlaces) : Math.round(meters * M_TO_FT);
    return `${ft}ft`;
  }
  return `${meters}m`;
}

// Global exports
if (typeof window !== 'undefined') {
  window.formatDistance = formatDistance;
  window.formatSpeed = formatSpeed;
  window.formatUnitDistance = formatUnitDistance;
  window.M_TO_FT = M_TO_FT;
  window.FT_TO_M = FT_TO_M;
  window.MPS_TO_MPH = MPS_TO_MPH;
}

// Theme Manager (Light & Dark Field Mode)
