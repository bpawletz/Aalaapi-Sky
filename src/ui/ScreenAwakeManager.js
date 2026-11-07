// Screen Awake & Sleep Manager (Cross-platform: Windows/Web & Android)
// Keeps tablet and desktop displays awake during drone missions or allows normal sleep to save battery

const SCREEN_AWAKE_STORAGE_KEY = 'aalaapi_screen_keep_awake';
let _isAwakeEnabled = true;
let _wakeLockSentinel = null;

function isScreenAwakeActive() {
  return _isAwakeEnabled;
}

async function requestScreenWakeLock() {
  try {
    if (typeof Platform !== 'undefined' && typeof Platform.setKeepScreenOn === 'function') {
      Platform.setKeepScreenOn(true);
    }
  } catch (_) {}

  try {
    if (typeof navigator !== 'undefined' && 'wakeLock' in navigator && !_wakeLockSentinel) {
      _wakeLockSentinel = await navigator.wakeLock.request('screen');
      _wakeLockSentinel.addEventListener('release', () => {
        _wakeLockSentinel = null;
      });
    }
  } catch (_) {}
}

function releaseScreenWakeLock() {
  try {
    if (typeof Platform !== 'undefined' && typeof Platform.setKeepScreenOn === 'function') {
      Platform.setKeepScreenOn(false);
    }
  } catch (_) {}

  try {
    if (_wakeLockSentinel) {
      _wakeLockSentinel.release();
      _wakeLockSentinel = null;
    }
  } catch (_) {}
}

function updateScreenAwakeUi() {
  if (typeof document === 'undefined') return;

  const btn = document.getElementById('screen-awake-toggle-btn');
  const iconSpan = document.getElementById('screen-awake-icon');
  const labelSpan = document.getElementById('screen-awake-label');

  if (btn) {
    if (_isAwakeEnabled) {
      if (btn.classList && btn.classList.add) btn.classList.add('is-active');
      btn.title = 'Screen: Keep Awake Enabled (Screen will stay on). Click to allow sleep.';
      if (typeof btn.setAttribute === 'function') btn.setAttribute('aria-pressed', 'true');
      if (iconSpan) iconSpan.textContent = '☕';
      if (labelSpan) labelSpan.textContent = 'Awake';
      if (btn.style) {
        btn.style.color = '#38bdf8';
        btn.style.borderColor = 'rgba(56, 189, 248, 0.45)';
        btn.style.background = 'rgba(56, 189, 248, 0.12)';
      }
    } else {
      if (btn.classList && btn.classList.remove) btn.classList.remove('is-active');
      btn.title = 'Screen: Normal OS Sleep Timeout. Click to keep awake.';
      if (typeof btn.setAttribute === 'function') btn.setAttribute('aria-pressed', 'false');
      if (iconSpan) iconSpan.textContent = '💤';
      if (labelSpan) labelSpan.textContent = 'Sleep';
      if (btn.style) {
        btn.style.color = 'var(--text-muted, #94a3b8)';
        btn.style.borderColor = 'var(--border-color, rgba(255, 255, 255, 0.12))';
        btn.style.background = 'transparent';
      }
    }
  }

  const moreIcon = document.getElementById('more-menu-awake-icon');
  const moreLabel = document.getElementById('more-menu-awake-label');
  if (moreIcon) moreIcon.textContent = _isAwakeEnabled ? '☕' : '💤';
  if (moreLabel) moreLabel.textContent = _isAwakeEnabled ? 'Screen: Keep Awake' : 'Screen: Allow Sleep';
}

async function setScreenAwakeMode(enabled, notify = true) {
  _isAwakeEnabled = !!enabled;

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SCREEN_AWAKE_STORAGE_KEY, _isAwakeEnabled ? 'true' : 'false');
    }
  } catch (_) {}

  // Update UI immediately for zero button latency
  updateScreenAwakeUi();

  if (_isAwakeEnabled) {
    await requestScreenWakeLock();
  } else {
    releaseScreenWakeLock();
  }

  updateScreenAwakeUi();

  if (notify && typeof showToast === 'function') {
    if (_isAwakeEnabled) {
      showToast('☕ Screen Keep Awake Enabled (Screen stays on)', 'info', 3000);
    } else {
      showToast('💤 Screen Sleep Allowed (Standard OS timeout)', 'info', 3000);
    }
  }

  return _isAwakeEnabled;
}

function toggleScreenAwakeMode() {
  return setScreenAwakeMode(!_isAwakeEnabled, true);
}

function initScreenAwake() {
  let saved = true;
  try {
    if (typeof localStorage !== 'undefined') {
      const val = localStorage.getItem(SCREEN_AWAKE_STORAGE_KEY);
      if (val !== null) {
        saved = (val === 'true');
      }
    }
  } catch (_) {}

  setScreenAwakeMode(saved, false);

  if (typeof document !== 'undefined') {
    // Re-acquire wake lock when tab or app returns from background
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && _isAwakeEnabled) {
        requestScreenWakeLock();
      }
    });

    const btn = document.getElementById('screen-awake-toggle-btn');
    if (btn && !btn.dataset.bound) {
      btn.dataset.bound = 'true';
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleScreenAwakeMode();
      });
    }

    const moreBtn = document.getElementById('more-menu-awake-btn');
    if (moreBtn && !moreBtn.dataset.bound) {
      moreBtn.dataset.bound = 'true';
      moreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleScreenAwakeMode();
        if (typeof closeMoreMenu === 'function') closeMoreMenu();
      });
    }
  }
}

if (typeof window !== 'undefined') {
  window.isScreenAwakeActive = isScreenAwakeActive;
  window.requestScreenWakeLock = requestScreenWakeLock;
  window.releaseScreenWakeLock = releaseScreenWakeLock;
  window.updateScreenAwakeUi = updateScreenAwakeUi;
  window.setScreenAwakeMode = setScreenAwakeMode;
  window.toggleScreenAwakeMode = toggleScreenAwakeMode;
  window.initScreenAwake = initScreenAwake;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initScreenAwake);
  } else {
    setTimeout(initScreenAwake, 50);
  }
}

if (typeof global !== 'undefined') {
  global.isScreenAwakeActive = isScreenAwakeActive;
  global.requestScreenWakeLock = requestScreenWakeLock;
  global.releaseScreenWakeLock = releaseScreenWakeLock;
  global.updateScreenAwakeUi = updateScreenAwakeUi;
  global.setScreenAwakeMode = setScreenAwakeMode;
  global.toggleScreenAwakeMode = toggleScreenAwakeMode;
  global.initScreenAwake = initScreenAwake;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    isScreenAwakeActive,
    requestScreenWakeLock,
    releaseScreenWakeLock,
    updateScreenAwakeUi,
    setScreenAwakeMode,
    toggleScreenAwakeMode,
    initScreenAwake
  };
}
