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
            if (id === 'speed') {
              if (typeof handleFlightSpeedChange === 'function') handleFlightSpeedChange();
            } else if (typeof updateGrid === 'function') {
              updateGrid();
            }
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
  const tabs = ['workflow', 'features', 'tips', 'matrix'];
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
        if (t === 'matrix' && typeof updateMatrixActiveLayerTelemetry === 'function') {
          updateMatrixActiveLayerTelemetry();
        }
      } else {
        pane.classList.add('hidden');
      }
    }
  });
}

function updateMatrixActiveLayerTelemetry() {
  if (typeof document === 'undefined') return;
  const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
  const gridType = (activeLayer && activeLayer.pattern) 
    ? activeLayer.pattern 
    : (document.getElementById('grid-type')?.value || 'double');
  
  const layerNameEl = document.getElementById('matrix-active-layer-name');
  if (layerNameEl) layerNameEl.textContent = activeLayer?.name || 'Layer 1';

  const patternBadge = document.getElementById('matrix-active-pattern-badge');
  const patternSelect = document.getElementById('grid-type');
  const options = (patternSelect && patternSelect.options && typeof patternSelect.options[Symbol.iterator] === 'function')
    ? Array.from(patternSelect.options)
    : (Array.isArray(patternSelect?.options) ? patternSelect.options : []);
  const selectedOpt = options.find(o => o && o.value === gridType);
  const patternName = selectedOpt ? selectedOpt.textContent : gridType;
  if (patternBadge) patternBadge.textContent = patternName;

  // Altitude
  const altVal = document.getElementById('matrix-active-alt-val');
  if (altVal) {
    const alt = activeLayer?.altitude ?? document.getElementById('altitude')?.value ?? 50;
    altVal.textContent = `${alt}m`;
  }

  // Pitch
  const pitchVal = document.getElementById('matrix-active-pitch-val');
  if (pitchVal) {
    const pitch = activeLayer?.gimbalPitch ?? document.getElementById('gimbal-pitch')?.value ?? -60;
    pitchVal.textContent = `${pitch}°`;
  }

  // Capture Mode
  const capVal = document.getElementById('matrix-active-capture-val');
  if (capVal) {
    const cap = activeLayer?.captureMode ?? document.getElementById('layer-capture-mode')?.value ?? 'continuous';
    capVal.textContent = (cap === 'stopAndShoot') ? 'Stop & Shoot' : 'Continuous';
  }

  // Heading Mode
  const headVal = document.getElementById('matrix-active-heading-val');
  if (headVal) {
    const head = activeLayer?.headingMode ?? document.getElementById('layer-heading-mode')?.value ?? 'followWayline';
    const labels = {
      'followWayline': 'Follow Wayline',
      'towardCenter': 'Toward Center (POI)',
      'fixed': 'Fixed Heading',
      'smoothTransition': 'Smooth Transition',
      'manual': 'Manual'
    };
    headVal.textContent = labels[head] || head;
  }

  // Turn Mode
  const turnVal = document.getElementById('matrix-active-turn-val');
  if (turnVal) {
    const turn = activeLayer?.pathMode ?? document.getElementById('layer-path-mode')?.value ?? 'curved';
    turnVal.textContent = (turn === 'straight') ? 'Straight (Sharp)' : 'Curved Coordinated';
  }

  // Overlap
  const ovVal = document.getElementById('matrix-active-overlap-val');
  if (ovVal) {
    const fo = activeLayer?.frontOverlap ?? document.getElementById('front-overlap')?.value ?? 75;
    const so = activeLayer?.sideOverlap ?? document.getElementById('side-overlap')?.value ?? 70;
    ovVal.textContent = `${fo}% / ${so}%`;
  }

  // Speed
  const spdVal = document.getElementById('matrix-active-speed-val');
  if (spdVal) {
    const spd = activeLayer?.speed ?? document.getElementById('speed')?.value ?? 5.0;
    spdVal.textContent = `${spd} m/s`;
  }

  // Mission Finish
  const finVal = document.getElementById('matrix-active-finish-val');
  if (finVal) {
    const fin = document.getElementById('finish-action')?.value ?? 'goHome';
    const finLabels = {
      'goHome': 'Return to Home',
      'autoLand': 'Auto Land',
      'hover': 'Hover at End',
      'goFirst': 'Return to First WP'
    };
    finVal.textContent = finLabels[fin] || fin;
  }

  // Highlight active row in matrix table
  const rows = (typeof document.querySelectorAll === 'function')
    ? (document.querySelectorAll('#matrix-table-body tr') || [])
    : [];
  if (rows && typeof rows.forEach === 'function') {
    rows.forEach(r => {
      if (r && typeof r.getAttribute === 'function' && r.classList) {
        if (r.getAttribute('data-pattern') === gridType) {
          r.classList.add('active-matrix-row');
        } else {
          r.classList.remove('active-matrix-row');
        }
      }
    });
  }
}

function openIntroModal(targetTab = 'workflow') {
  if (typeof document === 'undefined') return;
  if (typeof window !== 'undefined' && typeof window.dismissActivePopovers === 'function') {
    window.dismissActivePopovers();
  } else if (typeof dismissActivePopovers === 'function') {
    dismissActivePopovers();
  }
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
  window.updateMatrixActiveLayerTelemetry = updateMatrixActiveLayerTelemetry;
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

const PHOTOGRAPHY_TOOL_PRESETS = {
  'webodm-ortho': {
    id: 'webodm-ortho',
    name: 'WebODM / OpenDroneMap 2D Ortho',
    category: 'photogrammetry',
    tools: 'WebODM / OpenDroneMap, QGIS',
    deliverable: '2D Orthomosaic, GeoTIFF DSM/DTM, NDVI',
    primaryPattern: 'single',
    comboPatterns: 'Add fiducial-markers (AprilTag/ArUco GCPs)',
    altitude: 70,
    gimbalPitch: -90,
    frontOverlap: 75,
    sideOverlap: 70,
    captureMode: 'continuous',
    headingMode: 'followWayline',
    pathMode: 'straight',
    speed: 8.0,
    tips: 'Enable Terrain Following on hills; use 15m turnaround overshoot and WebODM dsm/dtm flags.'
  },
  'webodm-3d': {
    id: 'webodm-3d',
    name: 'WebODM / OpenMVS 3D Mesh',
    category: 'photogrammetry',
    tools: 'WebODM 3D, OpenMVS, Meshroom',
    deliverable: 'Textured 3D Site Mesh & Stockpiles',
    primaryPattern: 'double',
    comboPatterns: 'single (-90 deg) + double (-60 deg) or grid-orbit-combo',
    altitude: 50,
    gimbalPitch: -60,
    frontOverlap: 75,
    sideOverlap: 75,
    captureMode: 'continuous',
    headingMode: 'followWayline',
    pathMode: 'curved',
    speed: 6.0,
    tips: 'Crosshatch oblique passes eliminate occluded vertical walls and stockpile undercuts.'
  },
  'splat-object': {
    id: 'splat-object',
    name: 'gsplat / Brush / SuperSplat 3DGS Object',
    category: 'splat',
    tools: 'gsplat, Brush, SuperSplat (3DGS Object Tools)',
    deliverable: 'Object-Centric 3D Gaussian Splat / NeRF',
    primaryPattern: 'dome-shell',
    comboPatterns: 'dome-shell (3-5 rings + Zenith Cap) or multi-orbit',
    altitude: 35,
    gimbalPitch: -45,
    frontOverlap: 80,
    sideOverlap: 75,
    captureMode: 'continuous',
    headingMode: 'towardCenter',
    pathMode: 'curved',
    speed: 4.0,
    tips: 'Avoid pure -90 deg nadir grids for 3DGS; hemispherical parallax prevents sky floaters.'
  },
  'splat-scene': {
    id: 'splat-scene',
    name: 'Nerfstudio / COLMAP / GLOMAP Scene Splat',
    category: 'splat',
    tools: 'Nerfstudio (splatfacto), COLMAP / GLOMAP',
    deliverable: 'Compound / Campus Scale 3D Gaussian Splat',
    primaryPattern: 'target-splat',
    comboPatterns: 'target-splat (balanced, -50 deg) + low orbit (-25 deg)',
    altitude: 45,
    gimbalPitch: -50,
    frontOverlap: 80,
    sideOverlap: 75,
    captureMode: 'continuous',
    headingMode: 'towardCenter',
    pathMode: 'curved',
    speed: 5.0,
    tips: 'Export companion transforms.json via Node-RED aalaapi-splat-prep to seed camera extrinsics.'
  },
  'rc-structure': {
    id: 'rc-structure',
    name: 'Meshroom / OpenMVG Multi-Tier Structure',
    category: 'inspection',
    tools: 'Meshroom (AliceVision), OpenMVG / OpenMVS',
    deliverable: 'High-Poly Architecture & Heritage BIM Mesh',
    primaryPattern: 'grid-multi-orbit-combo',
    comboPatterns: 'Nadir top grid + 3-tier descending orbits (-60, -45, -25 deg)',
    altitude: 40,
    gimbalPitch: -55,
    frontOverlap: 80,
    sideOverlap: 80,
    captureMode: 'stopAndShoot',
    headingMode: 'towardCenter',
    pathMode: 'curved',
    speed: 3.5,
    tips: 'Keep angular transitions < 15 deg between rings to tie roofs to facades without component splits.'
  },
  'facade-wall': {
    id: 'facade-wall',
    name: 'CloudCompare / MeshLab Vertical Facade',
    category: 'inspection',
    tools: 'CloudCompare, OpenMVS, MeshLab (Facade Tools)',
    deliverable: 'Vertical Orthophoto, Crack Audit & M3C2 Diff',
    primaryPattern: 'vertical-facade',
    comboPatterns: 'Pair with fiducial-markers on wall face for scale constraint',
    altitude: 25,
    gimbalPitch: 0,
    frontOverlap: 80,
    sideOverlap: 75,
    captureMode: 'stopAndShoot',
    headingMode: 'fixed',
    pathMode: 'straight',
    speed: 2.5,
    tips: 'Maintain 5m-15m standoff; Stop & Shoot eliminates rolling shutter blur on hairline cracks.'
  },
  'tower-audit': {
    id: 'tower-audit',
    name: 'Vertical Inspection / Tower Digital Twin',
    category: 'inspection',
    tools: 'OpenDroneMap, CloudCompare (Tower Audit)',
    deliverable: 'Lattice Cell Tower, Turbine & Pylon Audit',
    primaryPattern: 'tower',
    comboPatterns: 'Add exclusion-box over guy-wire anchors; 10m buffer',
    altitude: 45,
    gimbalPitch: -15,
    frontOverlap: 80,
    sideOverlap: 75,
    captureMode: 'stopAndShoot',
    headingMode: 'towardCenter',
    pathMode: 'straight',
    speed: 2.5,
    tips: 'Locked POI yaw captures antenna mounts and bolts sharply from 360 deg azimuths.'
  },
  'corridor-gis': {
    id: 'corridor-gis',
    name: 'WebODM / QGIS Linear Corridor',
    category: 'photogrammetry',
    tools: 'WebODM / OpenDroneMap, QGIS (Corridor GIS)',
    deliverable: 'Highway, Pipeline, Rail & Utility Corridor Map',
    primaryPattern: 'corridor',
    comboPatterns: '2-3 parallel passes (-75 deg) or road-following',
    altitude: 60,
    gimbalPitch: -75,
    frontOverlap: 75,
    sideOverlap: 70,
    captureMode: 'continuous',
    headingMode: 'followWayline',
    pathMode: 'straight',
    speed: 7.0,
    tips: 'Multi-pass -75 deg pitch prevents single-line SfM dome/bowl focal distortion.'
  },
  'pano-360': {
    id: 'pano-360',
    name: 'Hugin / Pannellum 360 Photo Sphere',
    category: 'media',
    tools: 'Hugin, Pannellum, Marzipano (360 Pano Tools)',
    deliverable: '360x180 Equirectangular Virtual Tour Sphere',
    primaryPattern: 'photo-sphere',
    comboPatterns: 'Stack multiple photo-sphere nodes for linked tours',
    altitude: 45,
    gimbalPitch: 0,
    frontOverlap: 70,
    sideOverlap: 70,
    captureMode: 'stopAndShoot',
    headingMode: 'followWayline',
    pathMode: 'straight',
    speed: 3.0,
    tips: 'Exports Google GPano XMP metadata sidecars for instant interactive 360 viewers.'
  },
  'hyperlapse-video': {
    id: 'hyperlapse-video',
    name: 'FFmpeg / Darktable Hyperlapse',
    category: 'media',
    tools: 'FFmpeg, Darktable, Kdenlive (Time-Lapse Tools)',
    deliverable: 'Smooth Motion Time-Lapse & Keyframed Hyperlapse',
    primaryPattern: 'hyperlapse',
    comboPatterns: 'Spline mode (native) or Dense mode (RAW intervals)',
    altitude: 35,
    gimbalPitch: -25,
    frontOverlap: 70,
    sideOverlap: 70,
    captureMode: 'continuous',
    headingMode: 'smoothTransition',
    pathMode: 'curved',
    speed: 2.0,
    tips: 'Catmull-Rom yaw/pitch interpolation minimizes jitter before optical-flow stabilization.'
  },
  'cinematic-media': {
    id: 'cinematic-media',
    name: 'Kdenlive / Blender VSE Cinematic Reveal',
    category: 'media',
    tools: 'Kdenlive, Blender VSE, Shotcut, FFmpeg',
    deliverable: '4K/60fps Dronie, Rocket Crane & Boomerang Reels',
    primaryPattern: 'cinematic-reveal',
    comboPatterns: 'Combine Dronie, Rocket, and Boomerang layers',
    altitude: 30,
    gimbalPitch: -30,
    frontOverlap: 70,
    sideOverlap: 70,
    captureMode: 'video',
    headingMode: 'towardCenter',
    pathMode: 'curved',
    speed: 3.5,
    tips: 'Trigonometric POI gimbal tracking keeps the subject dead-center without stick jitter.'
  },
  'light-painting': {
    id: 'light-painting',
    name: 'Darktable / GIMP Night Light Art',
    category: 'media',
    tools: 'Darktable, GIMP, ImageMagick (Long-Exposure Stack)',
    deliverable: 'Nighttime Drone LED Sky Vector Art',
    primaryPattern: 'light-art',
    comboPatterns: 'Pair with ground tripod camera (Bulb / 8s-30s)',
    altitude: 40,
    gimbalPitch: -90,
    frontOverlap: 70,
    sideOverlap: 70,
    captureMode: 'continuous',
    headingMode: 'followWayline',
    pathMode: 'curved',
    speed: 3.0,
    tips: 'Shutter auto-sizing and bottom LED strobes draw clean geometric sky vectors.'
  },
  'gcp-survey': {
    id: 'gcp-survey',
    name: 'OpenCV / WebODM GCP Survey',
    category: 'spatial',
    tools: 'OpenCV ArUco/AprilTag, WebODM GCP',
    deliverable: 'Sub-Centimeter Survey Ground Control & Scale Bars',
    primaryPattern: 'fiducial-markers',
    comboPatterns: '5-9 fiducial-markers + single (-90 deg) + star-pass (-65 deg)',
    altitude: 55,
    gimbalPitch: -90,
    frontOverlap: 80,
    sideOverlap: 75,
    captureMode: 'stopAndShoot',
    headingMode: 'followWayline',
    pathMode: 'straight',
    speed: 5.0,
    tips: 'Adding a diagonal star-pass (-65 deg) over GCPs cures focal-length/altitude correlation.'
  },
  'thermal-sar': {
    id: 'thermal-sar',
    name: 'Thermal / IAMSAR / ATAK Search',
    category: 'spatial',
    tools: 'Thermal Imagery, IAMSAR Command, ATAK / Open CoT',
    deliverable: 'Wilderness SAR, Thermal Hotspot & Perimeter Patrol',
    primaryPattern: 'sar-search',
    comboPatterns: 'sar-search (ESS / Sector) or perimeter-patrol',
    altitude: 50,
    gimbalPitch: -50,
    frontOverlap: 70,
    sideOverlap: 65,
    captureMode: 'continuous',
    headingMode: 'followWayline',
    pathMode: 'straight',
    speed: 6.0,
    tips: '-45 to -60 deg oblique thermal pitch increases silhouette cross-section under canopy.'
  }
};

function applyPhotographyToolPreset(presetId) {
  const preset = PHOTOGRAPHY_TOOL_PRESETS[presetId];
  if (!preset) return false;

  if (typeof pushUndoSnapshot === 'function') {
    pushUndoSnapshot(`Apply Tool Preset: ${preset.name}`);
  }

  const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
  if (activeLayer) {
    activeLayer.pattern = preset.primaryPattern;
    activeLayer.altitude = preset.altitude;
    activeLayer.gimbalPitch = preset.gimbalPitch;
    activeLayer.frontOverlap = preset.frontOverlap;
    activeLayer.overlapFront = preset.frontOverlap;
    activeLayer.sideOverlap = preset.sideOverlap;
    activeLayer.overlapSide = preset.sideOverlap;
    activeLayer.captureMode = preset.captureMode;
    activeLayer.headingMode = preset.headingMode;
    activeLayer.pathMode = preset.pathMode;
    activeLayer.speed = preset.speed;
  }

  if (typeof document !== 'undefined') {
    const setElVal = (id, val) => {
      const el = document.getElementById(id);
      if (el && val !== undefined && val !== null) {
        el.value = String(val);
      }
    };

    setElVal('grid-type', preset.primaryPattern);
    setElVal('altitude', preset.altitude);
    setElVal('gimbal-pitch', preset.gimbalPitch);
    setElVal('front-overlap', preset.frontOverlap);
    setElVal('side-overlap', preset.sideOverlap);
    setElVal('layer-capture-mode', preset.captureMode);
    setElVal('layer-heading-mode', preset.headingMode);
    setElVal('layer-path-mode', preset.pathMode);
    setElVal('speed', preset.speed);
    setElVal('photography-tool-preset-select', preset.id);

    if (typeof document.querySelectorAll === 'function') {
      const cards = document.querySelectorAll('.pattern-card');
      cards.forEach(card => {
        const cardVal = card.getAttribute('data-value');
        if (cardVal === preset.primaryPattern) {
          card.classList.add('active');
        } else {
          card.classList.remove('active');
        }
      });
    }
  }

  if (typeof togglePatternParameters === 'function') togglePatternParameters();
  if (typeof syncDisplayValues === 'function') syncDisplayValues();
  if (typeof updateGrid === 'function') updateGrid();
  if (typeof renderLayersList === 'function') renderLayersList();
  if (typeof updateMatrixActiveLayerTelemetry === 'function') updateMatrixActiveLayerTelemetry();
  if (typeof showToast === 'function') {
    showToast(`Applied ${preset.name}: ${preset.primaryPattern} (${preset.gimbalPitch}°, ${preset.frontOverlap}%/${preset.sideOverlap}%)`, 'success');
  }

  return true;
}

if (typeof window !== 'undefined') {
  window.PHOTOGRAPHY_TOOL_PRESETS = PHOTOGRAPHY_TOOL_PRESETS;
  window.applyPhotographyToolPreset = applyPhotographyToolPreset;
}
if (typeof global !== 'undefined') {
  global.PHOTOGRAPHY_TOOL_PRESETS = PHOTOGRAPHY_TOOL_PRESETS;
  global.applyPhotographyToolPreset = applyPhotographyToolPreset;
}

// Setup Event Listeners for UI controls
