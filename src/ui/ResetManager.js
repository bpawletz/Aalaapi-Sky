function getModifiedSettingsState() {
  const state = {
    flight: { count: 0, items: [] },
    map: { count: 0, items: [] },
    ui: { count: 0, items: [] },
    hardware: { count: 0, items: [] },
    onboarding: { count: 0, items: [] }
  };

  if (typeof document === 'undefined') return state;

  // 1. Flight Parameters
  const flightControlIds = [
    'altitude', 'speed', 'grid-width', 'grid-height', 'grid-rotation',
    'front-overlap', 'side-overlap', 'gimbal-pitch', 'camera-action',
    'orbit-radius', 'orbit-waypoints', 'orbit-speed',
    'multi-orbit-radius', 'multi-orbit-tiers', 'multi-orbit-bottom-alt',
    'multi-orbit-top-alt', 'multi-orbit-pitch-bottom', 'multi-orbit-pitch-top',
    'multi-orbit-wps', 'multi-orbit-speed', 'road-offset',
    'max-flight-height', 'rth-altitude', 'signal-lost-action', 'exit-on-rc-lost', 'flight-path-mode',
    'heading-mode', 'drone-model', 'finish-action', 'capture-mode', 'path-mode',
    'global-exclusion-detour-mode', 'global-exclusion-clearance-buffer', 'max-flight-time'
  ];

  flightControlIds.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const defaultVal = FACTORY_DEFAULTS[id];
    if (defaultVal === undefined) return;
    let isModified = false;
    if (el.type === 'checkbox') {
      isModified = Boolean(el.checked) !== Boolean(defaultVal);
    } else {
      isModified = String(el.value) !== String(defaultVal);
    }
    if (isModified) {
      state.flight.count++;
      state.flight.items.push(id);
    }
  });

  // 2. Map Calibration & Location Cache
  try {
    if (typeof localStorage !== 'undefined') {
      const lastLoc = localStorage.getItem('aalaapi_sky_last_location');
      const offN = parseFloat(localStorage.getItem('aalaapi_sky_remote_id_offset_n')) || 0;
      const offE = parseFloat(localStorage.getItem('aalaapi_sky_remote_id_offset_e')) || 0;
      if (lastLoc) {
        state.map.count++;
        state.map.items.push('Cached GPS Location');
      }
      if (Math.abs(offN) > 0.01 || Math.abs(offE) > 0.01) {
        state.map.count++;
        state.map.items.push('D-Pad Alignment Offset');
      }
    }
  } catch (e) {}

  // 3. UI, Theme & Layout
  try {
    if (typeof localStorage !== 'undefined') {
      const theme = localStorage.getItem('aalaapi_sky_theme');
      if (theme && theme !== 'dark') {
        state.ui.count++;
        state.ui.items.push('Theme (Light)');
      }
      const nav = localStorage.getItem('aalaapi_nav_layout');
      if (nav && nav !== 'header') {
        state.ui.count++;
        state.ui.items.push('Nav Layout');
      }
      const units = localStorage.getItem('aalaapi_sky_unit_system');
      if (units && units !== 'imperial') {
        state.ui.count++;
        state.ui.items.push('Units (Metric)');
      }
      const accordion = localStorage.getItem('aalaapi_sky_accordion_mode');
      if (accordion !== null && accordion !== 'true') {
        state.ui.count++;
        state.ui.items.push('Accordion Mode');
      }
      const sidebarMin = localStorage.getItem('aalaapi_sky_sidebar_minimized');
      if (sidebarMin === 'true') {
        state.ui.count++;
        state.ui.items.push('Sidebar Minimized');
      }
    }
  } catch (e) {}

  // 4. Hardware & Remote Links
  try {
    if (typeof localStorage !== 'undefined') {
      const rc2Uuid = localStorage.getItem('aalaapi-rc2-uuid');
      if (rc2Uuid) {
        state.hardware.count++;
        state.hardware.items.push('DJI RC 2 UUID');
      }
      const compHost = localStorage.getItem('aalaapi-companion-host');
      if (compHost && compHost !== 'http://localhost:8765') {
        state.hardware.count++;
        state.hardware.items.push('Companion Host');
      }
      const multiVendor = localStorage.getItem('aalaapi-multivendor-enabled');
      if (multiVendor === 'true') {
        state.hardware.count++;
        state.hardware.items.push('Multi-Vendor Autopilots');
      }
    }
  } catch (e) {}

  // 5. Onboarding & Tour
  try {
    if (typeof localStorage !== 'undefined') {
      if (localStorage.getItem('aalaapi_intro_banner_dismissed') === 'true') {
        state.onboarding.count++;
        state.onboarding.items.push('Welcome Banner Dismissed');
      }
      if (localStorage.getItem('aalaapi_sky_tour_completed') === 'true') {
        state.onboarding.count++;
        state.onboarding.items.push('Tour Completed');
      }
    }
  } catch (e) {}

  return state;
}

// Live update of minimalist dot indicators and storage reset badges
function updateModifiedSettingsIndicators() {
  if (typeof document === 'undefined') return;
  const state = getModifiedSettingsState();

  // 1. Update Storage Modal Badges
  const updateBadge = (id, count, defaultLabel = '✓ Default') => {
    const badge = document.getElementById(id);
    if (!badge) return;
    if (count > 0) {
      badge.textContent = `💾 ${count} Custom`;
      badge.className = 'storage-count-badge custom';
    } else {
      badge.textContent = defaultLabel;
      badge.className = 'storage-count-badge default';
    }
  };

  updateBadge('badge-count-flight', state.flight.count);
  updateBadge('badge-count-map', state.map.count, '✓ Default (0m)');
  updateBadge('badge-count-ui', state.ui.count);
  updateBadge('badge-count-hardware', state.hardware.count);
  updateBadge('badge-count-onboarding', state.onboarding.count);

  // 2. Update Inline Setting Dots (Minimalist 4px dots next to input labels)
  Object.keys(FACTORY_DEFAULTS).forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const defaultVal = FACTORY_DEFAULTS[id];
    let isModified = false;
    if (el.type === 'checkbox') {
      isModified = Boolean(el.checked) !== Boolean(defaultVal);
    } else {
      isModified = String(el.value) !== String(defaultVal);
    }

    const group = (typeof el.closest === 'function') ? (el.closest('.control-group') || el.parentElement) : el.parentElement;
    const label = group ? ((typeof group.querySelector === 'function' ? group.querySelector('.control-label') : null) || (typeof group.querySelector === 'function' ? group.querySelector('label') : null)) : null;
    if (!label) return;

    let dot = (typeof label.querySelector === 'function') ? label.querySelector('.setting-modified-dot') : null;
    if (isModified) {
      if (!dot && typeof document.createElement === 'function') {
        dot = document.createElement('span');
        dot.className = 'setting-modified-dot';
        dot.dataset.targetId = id;
        if (typeof dot.addEventListener === 'function') {
          dot.addEventListener('click', (e) => {
            if (e.stopPropagation) e.stopPropagation();
            if (e.preventDefault) e.preventDefault();
            if (el.type === 'checkbox') {
              el.checked = defaultVal;
            } else {
              el.value = defaultVal;
            }
            if (typeof el.dispatchEvent === 'function') {
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
            }
            if (typeof syncDisplayValues === 'function') syncDisplayValues();
            if (typeof updateGrid === 'function') updateGrid();
            updateModifiedSettingsIndicators();
          });
        }
        if (typeof label.appendChild === 'function') label.appendChild(dot);
      }
      if (dot) {
        dot.title = `Custom value saved (Default: ${defaultVal}) • Click to reset`;
        if (dot.style) dot.style.display = 'inline-block';
      }
    } else if (dot && dot.style) {
      dot.style.display = 'none';
    }
  });

  // 3. Update Section Header Dots
  const updateSectionDot = (sectionId, hasModifications) => {
    if (typeof document === 'undefined' || typeof document.getElementById !== 'function') return;
    const section = document.getElementById(sectionId);
    if (!section || typeof section.querySelector !== 'function') return;
    const header = section.querySelector('h3');
    if (!header) return;
    let dot = typeof header.querySelector === 'function' ? header.querySelector('.section-modified-dot') : null;
    if (hasModifications) {
      if (!dot && typeof document.createElement === 'function') {
        dot = document.createElement('span');
        dot.className = 'section-modified-dot';
        dot.title = 'Contains custom settings';
        if (typeof header.appendChild === 'function') header.appendChild(dot);
      }
      if (dot && dot.style) dot.style.display = 'inline-block';
    } else if (dot && dot.style) {
      dot.style.display = 'none';
    }
  };

  const layerSectionModified = state.flight.items.some(id => ['altitude', 'speed', 'grid-width', 'grid-height', 'grid-rotation', 'front-overlap', 'side-overlap', 'gimbal-pitch'].includes(id));
  const failsafesSectionModified = state.flight.items.some(id => ['rth-altitude', 'signal-lost-action', 'exit-on-rc-lost', 'flight-path-mode', 'heading-mode', 'drone-model'].includes(id));

  updateSectionDot('layer-parameters-section', layerSectionModified);
  updateSectionDot('mission-failsafes-section', failsafesSectionModified);
}

// Executes controlled or factory settings reset
function resetStoredSettings(options = {}) {
  const opts = {
    flightParams: true,
    mapCalibration: true,
    uiPreferences: true,
    hardwareLinks: false,
    onboarding: false,
    ...options
  };

  const resetDomains = [];

  // 1. Flight Parameters
  if (opts.flightParams) {
    const flightControlIds = [
      'altitude', 'speed', 'grid-width', 'grid-height', 'grid-rotation',
      'front-overlap', 'side-overlap', 'gimbal-pitch', 'camera-action',
      'orbit-radius', 'orbit-waypoints', 'orbit-speed',
      'multi-orbit-radius', 'multi-orbit-tiers', 'multi-orbit-bottom-alt',
      'multi-orbit-top-alt', 'multi-orbit-pitch-bottom', 'multi-orbit-pitch-top',
      'multi-orbit-wps', 'multi-orbit-speed', 'road-offset',
      'max-flight-height', 'rth-altitude', 'signal-lost-action', 'exit-on-rc-lost', 'flight-path-mode',
      'heading-mode', 'drone-model', 'finish-action', 'capture-mode', 'path-mode',
      'global-exclusion-detour-mode', 'global-exclusion-clearance-buffer', 'max-flight-time'
    ];
    flightControlIds.forEach(id => {
      const el = document.getElementById(id);
      if (el && FACTORY_DEFAULTS[id] !== undefined) {
        if (el.type === 'checkbox') {
          el.checked = FACTORY_DEFAULTS[id];
        } else {
          el.value = FACTORY_DEFAULTS[id];
        }
      }
    });

    const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
    if (activeLayer) {
      activeLayer.altitude = parseFloat(FACTORY_DEFAULTS['altitude']);
      activeLayer.speed = parseFloat(FACTORY_DEFAULTS['speed']);
      activeLayer.overlapFront = parseFloat(FACTORY_DEFAULTS['overlap-front']);
      activeLayer.overlapSide = parseFloat(FACTORY_DEFAULTS['overlap-side']);
      activeLayer.gimbalPitch = parseFloat(FACTORY_DEFAULTS['gimbal-pitch']);
      activeLayer.gridAngle = parseFloat(FACTORY_DEFAULTS['grid-rotation']);
    }

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('aalaapi_sky_input_settings');
      }
    } catch (e) {}

    if (typeof syncDisplayValues === 'function') syncDisplayValues();
    if (typeof updateGimbalPitchVisualizer === 'function') updateGimbalPitchVisualizer(parseFloat(FACTORY_DEFAULTS['gimbal-pitch']));
    if (typeof updateGrid === 'function') updateGrid();
    resetDomains.push('Flight Parameters');
  }

  // 2. Map Calibration & GPS Cache
  if (opts.mapCalibration) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('aalaapi_sky_last_location');
        localStorage.removeItem('aalaapi_sky_remote_id_offset_n');
        localStorage.removeItem('aalaapi_sky_remote_id_offset_e');
      }
    } catch (e) {}
    if (typeof remoteIdOffsetN !== 'undefined') remoteIdOffsetN = 0;
    if (typeof remoteIdOffsetE !== 'undefined') remoteIdOffsetE = 0;
    if (typeof updateRemoteIdAlignmentHUD === 'function') updateRemoteIdAlignmentHUD();
    resetDomains.push('Map Calibration & GPS');
  }

  // 3. UI, Theme & Layout
  if (opts.uiPreferences) {
    if (typeof setAppTheme === 'function') setAppTheme('dark');
    if (typeof setNavLayout === 'function') setNavLayout('header');
    if (typeof setCameraPalette === 'function') setCameraPalette('high-viz-amber');
    if (typeof setCameraConeEnabled === 'function') setCameraConeEnabled(true);

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('aalaapi_sky_theme');
        localStorage.removeItem('aalaapi_nav_layout');
        localStorage.removeItem('aalaapi_sky_unit_system');
        localStorage.removeItem('aalaapi_sky_camera_palette');
        localStorage.removeItem('aalaapi_sky_camera_cones');
        localStorage.removeItem('aalaapi_sky_accordion_mode');
        localStorage.removeItem('aalaapi_sky_sidebar_minimized');
        for (let i = 0; i < 10; i++) {
          localStorage.removeItem(`aalaapi_sky_section_${i}_collapsed`);
        }
      }
    } catch (e) {}
    
    const unitSelect = document.getElementById('unit-system');
    if (unitSelect) unitSelect.value = 'imperial';
    cachedUnitSystem = 'imperial';

    const camPalSelect = document.getElementById('camera-palette-select');
    if (camPalSelect) camPalSelect.value = 'high-viz-amber';
    updatePaletteSwatchPreview('high-viz-amber');

    const camConesToggle = document.getElementById('camera-cones-toggle');
    if (camConesToggle) camConesToggle.checked = true;

    const accordionToggle = document.getElementById('accordion-mode-toggle');
    if (accordionToggle) accordionToggle.checked = true;

    const sidebarMinToggle = document.getElementById('minimize-sidebar-toggle');
    if (sidebarMinToggle) sidebarMinToggle.checked = false;
    if (typeof document !== 'undefined' && typeof document.querySelector === 'function') {
      document.querySelector('.sidebar')?.classList.remove('minimized');
    }

    if (typeof syncDisplayValues === 'function') syncDisplayValues();
    resetDomains.push('UI Preferences');
  }

  // 4. Hardware & Remote Links
  if (opts.hardwareLinks) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('aalaapi-rc2-uuid');
        localStorage.removeItem('aalaapi-companion-host');
        localStorage.removeItem('aalaapi-multivendor-enabled');
      }
    } catch (e) {}

    const multiVendorToggle = document.getElementById('multivendor-toggle');
    if (multiVendorToggle) {
      multiVendorToggle.checked = false;
      if (typeof multiVendorToggle.dispatchEvent === 'function') {
        multiVendorToggle.dispatchEvent(new Event('change'));
      }
    }

    resetDomains.push('Hardware Links');
  }

  // 5. Onboarding & Tour
  if (opts.onboarding) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('aalaapi_intro_banner_dismissed');
        localStorage.removeItem('aalaapi_sky_tour_completed');
      }
    } catch (e) {}
    const welcomeBanner = document.getElementById('welcome-tour-banner');
    if (welcomeBanner) welcomeBanner.classList.remove('hidden');
    resetDomains.push('Onboarding States');
  }

  updateModifiedSettingsIndicators();
  return { success: true, resetDomains };
}

// Initialize Controlled Reset Manager Event Listeners
function initControlledResetManager() {
  if (typeof document === 'undefined') return;

  const btnResetSelected = document.getElementById('config-reset-selected-btn');
  const btnFactoryReset = document.getElementById('config-factory-reset-btn');
  const btnSelectAll = document.getElementById('reset-select-all-btn');
  const btnClearAll = document.getElementById('reset-clear-all-btn');
  const toast = document.getElementById('reset-feedback-toast');

  const showToast = (msg, isSuccess = true) => {
    if (!toast) return;
    toast.textContent = msg;
    toast.style.display = 'block';
    toast.style.background = isSuccess ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)';
    toast.style.color = isSuccess ? '#34d399' : '#f87171';
    toast.style.borderColor = isSuccess ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.35)';
    setTimeout(() => {
      if (toast) toast.style.display = 'none';
    }, 3000);
  };

  if (btnSelectAll) {
    btnSelectAll.addEventListener('click', () => {
      ['reset-chk-flight', 'reset-chk-map', 'reset-chk-ui', 'reset-chk-hardware', 'reset-chk-onboarding'].forEach(id => {
        const chk = document.getElementById(id);
        if (chk) chk.checked = true;
      });
    });
  }

  if (btnClearAll) {
    btnClearAll.addEventListener('click', () => {
      ['reset-chk-flight', 'reset-chk-map', 'reset-chk-ui', 'reset-chk-hardware', 'reset-chk-onboarding'].forEach(id => {
        const chk = document.getElementById(id);
        if (chk) chk.checked = false;
      });
    });
  }

  if (btnResetSelected) {
    btnResetSelected.addEventListener('click', () => {
      const flightParams = Boolean(document.getElementById('reset-chk-flight')?.checked);
      const mapCalibration = Boolean(document.getElementById('reset-chk-map')?.checked);
      const uiPreferences = Boolean(document.getElementById('reset-chk-ui')?.checked);
      const hardwareLinks = Boolean(document.getElementById('reset-chk-hardware')?.checked);
      const onboarding = Boolean(document.getElementById('reset-chk-onboarding')?.checked);

      if (!flightParams && !mapCalibration && !uiPreferences && !hardwareLinks && !onboarding) {
        showToast('⚠️ Please select at least one category to reset.', false);
        return;
      }

      const res = resetStoredSettings({ flightParams, mapCalibration, uiPreferences, hardwareLinks, onboarding });
      showToast(`✅ Reset complete: ${res.resetDomains.join(', ')}`);
    });
  }

  if (btnFactoryReset) {
    btnFactoryReset.addEventListener('click', () => {
      const confirmed = typeof confirm === 'function' ? confirm('⚠️ Full Factory Reset:\n\nThis will restore all flight parameters, UI preferences, map calibrations, hardware links, and tutorial states to stock defaults.\n\nProceed?') : true;
      if (confirmed) {
        const res = resetStoredSettings({
          flightParams: true,
          mapCalibration: true,
          uiPreferences: true,
          hardwareLinks: true,
          onboarding: true
        });
        showToast('✅ Full Factory Reset successfully completed.');
      }
    });
  }
}


// ─── RC 2 Guide Modal & Guidance Helpers ────────────────────────────────────

function switchGuideTab(targetTab) {
  if (typeof document === 'undefined') return;
  const canonicalTab = (targetTab === 'companion' || targetTab === 'bridge') ? 'service' : targetTab;
  const tabBtns = document.querySelectorAll('.guide-tab-btn');
  const tabPanes = document.querySelectorAll('.guide-tab-pane');
  tabBtns.forEach(btn => {
    if (btn.dataset.tab === canonicalTab || (canonicalTab === 'service' && (btn.dataset.tab === 'companion' || btn.dataset.tab === 'bridge'))) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  tabPanes.forEach(pane => {
    if (pane.id === `guide-pane-${canonicalTab}` || (canonicalTab === 'service' && (pane.id === 'guide-pane-companion' || pane.id === 'guide-pane-bridge'))) {
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

// ─── 3-Tier Intro Guide Hub & Spotlight Tour Helpers ─────────────────────────

let currentTourStep = 0;
const TOUR_STEPS = [
  {
    targetId: 'location-input',
    fallbackTargetId: 'header-search-container',
    title: '1. Search & Takeoff Location',
    desc: 'Search any address or coordinate, or tap Locate to pin your drone takeoff coordinates.',
    position: 'bottom'
  },
  {
    targetId: 'layers-and-location-section',
    fallbackTargetId: 'grid-type',
    title: '2. Pattern Tools & Layers Stack',
    desc: 'Select flight patterns (2D Grid, Double Grid, Orbit, Freeform, Auto-Plan) or 3D Exclusion Zones. Add multiple layers for complex missions.',
    position: 'right'
  },
  {
    targetId: 'grid-geometry-section',
    fallbackTargetId: 'grid-geometry-title',
    title: '3. Layer Properties & Failsafes',
    desc: 'Tune altitude, speed, and gimbal pitch in Layer Properties. Configure Return-to-Home, Signal Loss actions, and hardware in Mission Failsafes.',
    position: 'right'
  },
  {
    targetId: 'header-telemetry-pill',
    fallbackTargetId: 'stats-panel',
    title: '4. Live Telemetry & Weather HUD',
    desc: 'Check estimated flight duration, distance, and photo count. Tap the pill to view live NOAA ceiling and visibility data.',
    position: 'bottom'
  },
  {
    targetId: 'actions-and-sync-section',
    fallbackTargetId: 'download-btn',
    title: '5. Actions, 3D Replay & RC 2 Sync',
    desc: 'Preview in 3D, export DJI-compliant KMZ, or send directly to your connected DJI RC 2 over USB.',
    position: 'right'
  }
];

function switchIntroTab(tabName) {
  if (typeof document === 'undefined') return;
  const tabs = ['workflow', 'features', 'tips'];
  tabs.forEach(t => {
    const btn = document.getElementById(`intro-tab-${t}`);
    const pane = document.getElementById(`intro-pane-${t}`);
    if (btn) {
      if (t === tabName) {
        btn.classList.add('active');
        btn.style.background = 'rgba(6, 182, 212, 0.15)';
        btn.style.borderColor = 'rgba(6, 182, 212, 0.4)';
        btn.style.borderBottom = '2px solid var(--accent-cyan)';
        btn.style.color = 'var(--accent-cyan)';
        btn.style.fontWeight = '700';
      } else {
        btn.classList.remove('active');
        btn.style.background = 'transparent';
        btn.style.borderColor = 'transparent';
        btn.style.borderBottom = '1px solid transparent';
        btn.style.color = 'var(--text-muted)';
        btn.style.fontWeight = '600';
      }
    }
    if (pane) {
      if (t === tabName) {
        pane.classList.remove('hidden');
      } else {
        pane.classList.add('hidden');
      }
    }
  });
}

function openIntroModal(targetTab = 'workflow') {
  if (typeof document === 'undefined') return;
  const canonicalTab = (typeof targetTab === 'string') ? targetTab : 'workflow';
  const modal = document.getElementById('quickstart-modal');
  if (!modal) return;
  switchIntroTab(canonicalTab);
  modal.classList.remove('hidden');
  if (typeof window !== 'undefined' && window.innerWidth <= 768) {
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) sidebar.classList.remove('open');
  }
}

function closeIntroModal() {
  if (typeof document === 'undefined') return;
  const modal = document.getElementById('quickstart-modal');
  if (modal) modal.classList.add('hidden');
}

function showWelcomeTourBanner() {
  if (typeof document === 'undefined') return;
  const dismissed = localStorage.getItem('aalaapi_intro_banner_dismissed');
  if (dismissed === 'true') return;
  const banner = document.getElementById('welcome-tour-banner');
  if (banner) {
    banner.classList.remove('hidden');
  }
}

function dismissWelcomeTourBanner() {
  if (typeof document === 'undefined') return;
  const banner = document.getElementById('welcome-tour-banner');
  if (banner) banner.classList.add('hidden');
  localStorage.setItem('aalaapi_intro_banner_dismissed', 'true');
}

if (typeof window !== 'undefined') {
  window.openIntroModal = openIntroModal;
  window.closeIntroModal = closeIntroModal;
  window.switchIntroTab = switchIntroTab;
  window.startInteractiveUITour = startInteractiveUITour;
}

function positionTourSpotlight(stepIndex) {
  if (typeof document === 'undefined') return;
  if (stepIndex < 0 || stepIndex >= TOUR_STEPS.length) return;
  const step = TOUR_STEPS[stepIndex];
  let el = document.getElementById(step.targetId);
  if (!el && step.fallbackTargetId) {
    el = document.getElementById(step.fallbackTargetId);
  }

  const highlightBox = document.getElementById('tour-highlight-box');
  const tooltip = document.getElementById('tour-tooltip-card');

  if (!el) {
    if (tooltip) {
      tooltip.style.top = '50%';
      tooltip.style.left = '50%';
      tooltip.style.transform = 'translate(-50%, -50%)';
    }
    return;
  }

  // Auto-scroll element into view
  if (typeof el.scrollIntoView === 'function') {
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  if (typeof el.getBoundingClientRect === 'function') {
    const rect = el.getBoundingClientRect();
    const pad = 6;
    if (highlightBox) {
      highlightBox.style.top = `${Math.max(0, rect.top - pad)}px`;
      highlightBox.style.left = `${Math.max(0, rect.left - pad)}px`;
      highlightBox.style.width = `${rect.width + pad * 2}px`;
      highlightBox.style.height = `${rect.height + pad * 2}px`;
    }

    if (tooltip) {
      const viewportWidth = (typeof window !== 'undefined') ? window.innerWidth : 1200;
      const viewportHeight = (typeof window !== 'undefined') ? window.innerHeight : 800;
      const tooltipWidth = 320;
      const tooltipHeight = 160;

      let top = rect.bottom + 12;
      let left = rect.left;

      if (step.position === 'right' && rect.right + tooltipWidth + 20 < viewportWidth) {
        top = Math.max(16, rect.top);
        left = rect.right + 16;
      } else if (top + tooltipHeight > viewportHeight) {
        top = Math.max(16, rect.top - tooltipHeight - 12);
      }

      if (left + tooltipWidth > viewportWidth - 16) {
        left = Math.max(16, viewportWidth - tooltipWidth - 16);
      }

      tooltip.style.top = `${top}px`;
      tooltip.style.left = `${left}px`;
      tooltip.style.transform = 'none';
    }
  }

  // Update step text
  const stepBadge = document.getElementById('tour-step-badge');
  const stepTitle = document.getElementById('tour-step-title');
  const stepDesc = document.getElementById('tour-step-desc');
  const prevBtn = document.getElementById('tour-prev-btn');
  const nextBtn = document.getElementById('tour-next-btn');

  if (stepBadge) stepBadge.textContent = `Step ${stepIndex + 1} of ${TOUR_STEPS.length}`;
  if (stepTitle) stepTitle.textContent = step.title;
  if (stepDesc) stepDesc.textContent = step.desc;

  if (prevBtn) {
    prevBtn.style.display = (stepIndex === 0) ? 'none' : 'inline-block';
  }
  if (nextBtn) {
    nextBtn.textContent = (stepIndex === TOUR_STEPS.length - 1) ? 'Finish ✓' : 'Next ›';
  }
}

function startInteractiveUITour() {
  closeIntroModal();
  dismissWelcomeTourBanner();
  const overlay = document.getElementById('tour-overlay-container');
  if (!overlay) return;
  currentTourStep = 0;
  overlay.classList.remove('hidden');
  positionTourSpotlight(currentTourStep);
}

function nextTourStep() {
  if (currentTourStep < TOUR_STEPS.length - 1) {
    currentTourStep++;
    positionTourSpotlight(currentTourStep);
  } else {
    exitInteractiveUITour();
  }
}

function prevTourStep() {
  if (currentTourStep > 0) {
    currentTourStep--;
    positionTourSpotlight(currentTourStep);
  }
}

function exitInteractiveUITour() {
  if (typeof document === 'undefined') return;
  const overlay = document.getElementById('tour-overlay-container');
  if (overlay) overlay.classList.add('hidden');
}

// Setup Event Listeners for UI controls
