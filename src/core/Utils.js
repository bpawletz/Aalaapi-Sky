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

// Universal Toast Notification System (v1.251.4, Issue #318)
function showToast(message, type = 'info', duration = 3500) {
  if (typeof document === 'undefined') return;

  // Normalize polymorphic argument signatures
  let toastType = 'info';
  let toastDuration = 3500;

  if (typeof type === 'boolean') {
    toastType = type ? 'success' : 'error';
  } else if (typeof type === 'number') {
    toastDuration = type;
  } else if (typeof type === 'string') {
    toastType = type.toLowerCase();
  }

  if (typeof duration === 'number') {
    toastDuration = duration;
  }

  let container = document.getElementById('global-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'global-toast-container';
    container.className = 'global-toast-container';
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-atomic', 'true');
    container.style.cssText = 'position: fixed; bottom: 24px; right: 24px; z-index: 20000; display: flex; flex-direction: column-reverse; gap: 8px; pointer-events: none; max-width: 420px; width: calc(100vw - 48px);';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `global-toast-item global-toast-${toastType}`;
  toast.setAttribute('role', 'alert');

  let borderColor = 'rgba(56, 189, 248, 0.4)';
  let bgColor = 'rgba(15, 23, 42, 0.95)';
  let textColor = '#e2e8f0';
  let icon = 'ℹ️';

  if (toastType === 'success') {
    borderColor = 'rgba(16, 185, 129, 0.5)';
    textColor = '#34d399';
    icon = '✅';
  } else if (toastType === 'error' || toastType === 'danger') {
    borderColor = 'rgba(239, 68, 68, 0.5)';
    textColor = '#f87171';
    icon = '❌';
  } else if (toastType === 'warning') {
    borderColor = 'rgba(245, 158, 11, 0.5)';
    textColor = '#fbbf24';
    icon = '⚠️';
  } else {
    borderColor = 'rgba(56, 189, 248, 0.5)';
    textColor = '#38bdf8';
    icon = 'ℹ️';
  }

  toast.style.cssText = `
    pointer-events: auto;
    background: ${bgColor};
    backdrop-filter: blur(12px);
    border: 1px solid ${borderColor};
    border-radius: 8px;
    padding: 10px 14px;
    box-shadow: 0 10px 25px rgba(0,0,0,0.6), 0 0 15px ${borderColor.replace('0.5', '0.15')};
    font-size: 0.78rem;
    font-weight: 500;
    line-height: 1.4;
    color: ${textColor};
    display: flex;
    align-items: flex-start;
    gap: 10px;
    opacity: 0;
    transform: translateY(12px);
    transition: opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1), transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    cursor: pointer;
  `;

  const iconSpan = document.createElement('span');
  iconSpan.style.cssText = 'flex-shrink: 0; font-size: 0.9rem; line-height: 1.2;';
  iconSpan.textContent = icon;

  const msgSpan = document.createElement('span');
  msgSpan.style.cssText = 'flex: 1; word-break: break-word;';
  msgSpan.textContent = message;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', 'Close toast');
  closeBtn.style.cssText = 'background: none; border: none; color: var(--text-muted, #94a3b8); cursor: pointer; padding: 0 0 0 6px; font-size: 0.85rem; line-height: 1; flex-shrink: 0;';
  closeBtn.innerHTML = '&times;';

  toast.appendChild(iconSpan);
  toast.appendChild(msgSpan);
  toast.appendChild(closeBtn);

  const dismiss = () => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(12px)';
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 260);
  };

  toast.addEventListener('click', dismiss);
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dismiss();
  });

  container.appendChild(toast);

  // Trigger smooth enter transition
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    });
  } else {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  }

  if (toastDuration > 0) {
    setTimeout(dismiss, toastDuration);
  }

  return toast;
}

// Global exports
if (typeof window !== 'undefined') {
  window.formatDistance = formatDistance;
  window.formatSpeed = formatSpeed;
  window.formatUnitDistance = formatUnitDistance;
  window.showToast = showToast;
  window.M_TO_FT = M_TO_FT;
  window.FT_TO_M = FT_TO_M;
  window.MPS_TO_MPH = MPS_TO_MPH;
}

// Theme Manager (Light & Dark Field Mode)
