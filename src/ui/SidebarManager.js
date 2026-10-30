function initClickToTypeInputs() {
  if (typeof document === 'undefined') return;

  const clickToTypeConfigs = [
    // [valId, inputId, type, min, max, step]
    { valId: 'speed-val', inputId: 'speed', type: 'speed', min: 0.2, max: 15, step: 0.1 },
    { valId: 'altitude-val', inputId: 'altitude', type: 'distance', min: 10, max: 120, step: 1 },
    { valId: 'width-val', inputId: 'grid-width', type: 'distance', min: 20, max: 500, step: 5 },
    { valId: 'height-val', inputId: 'grid-height', type: 'distance', min: 20, max: 500, step: 5 },
    { valId: 'rotation-val', inputId: 'grid-rotation', type: 'raw', min: 0, max: 359, step: 1 },
    { valId: 'front-overlap-val', inputId: 'front-overlap', type: 'raw', min: 50, max: 95, step: 1 },
    { valId: 'side-overlap-val', inputId: 'side-overlap', type: 'raw', min: 50, max: 95, step: 1 },
    { valId: 'gimbal-pitch-val', inputId: 'gimbal-pitch', type: 'raw', min: -90, max: 60, step: 1 },
    { valId: 'target-radius-val', inputId: 'target-splat-radius', type: 'distance', min: 5, max: 150, step: 1 },
    { valId: 'target-height-val', inputId: 'target-splat-height', type: 'distance', min: 0, max: 35, step: 1 },
    { valId: 'target-perimeter-standoff-val', inputId: 'target-perimeter-standoff', type: 'distance', min: 3, max: 30, step: 1 },
    { valId: 'target-perimeter-alt-val', inputId: 'target-perimeter-alt', type: 'distance', min: 0, max: 80, step: 1 },
    { valId: 'target-perimeter-pitch-val', inputId: 'target-perimeter-pitch', type: 'raw', min: -80, max: -30, step: 1 },
    { valId: 'tower-radius-val', inputId: 'tower-radius', type: 'distance', min: 1, max: 150, step: 1 },
    { valId: 'tower-min-height-val', inputId: 'tower-min-height', type: 'distance', min: 1, max: 300, step: 1 },
    { valId: 'tower-max-height-val', inputId: 'tower-max-height', type: 'distance', min: 2, max: 400, step: 1 },
    { valId: 'tower-guy-wire-buffer-val', inputId: 'tower-guy-wire-buffer', type: 'distance', min: 0, max: 50, step: 1 },
    { valId: 'road-offset-val', inputId: 'road-offset', type: 'distance', min: -50, max: 50, step: 1 },
    { valId: 'exclusion-min-alt-val', inputId: 'exclusion-min-alt', type: 'distance', min: 0, max: 300, step: 5 },
    { valId: 'exclusion-max-alt-val', inputId: 'exclusion-max-alt', type: 'distance', min: 5, max: 500, step: 5 },
    { valId: 'global-exclusion-clearance-val', inputId: 'global-exclusion-clearance-buffer', type: 'distance', min: 1, max: 25, step: 1 },
    { valId: 'max-height-val', inputId: 'max-flight-height', type: 'distance', min: 20, max: 500, step: 5 },
    { valId: 'rth-altitude-val', inputId: 'rth-altitude', type: 'distance', min: 20, max: 150, step: 5 },
    { valId: 'global-hover-time-val', inputId: 'global-hover-time', type: 'raw', min: 0, max: 60, step: 1 },
    { valId: 'star-pass-radius-val', inputId: 'star-pass-radius', type: 'distance', min: 5, max: 150, step: 1 },
    { valId: 'facade-width-val', inputId: 'facade-width', type: 'distance', min: 10, max: 200, step: 1 },
    { valId: 'facade-min-alt-val', inputId: 'facade-min-alt', type: 'distance', min: 2, max: 100, step: 1 },
    { valId: 'facade-max-alt-val', inputId: 'facade-max-alt', type: 'distance', min: 5, max: 200, step: 1 },
    { valId: 'facade-standoff-val', inputId: 'facade-standoff', type: 'distance', min: 3, max: 60, step: 1 },
    { valId: 'helix-radius-start-val', inputId: 'helix-radius-start', type: 'distance', min: 5, max: 150, step: 1 },
    { valId: 'helix-radius-end-val', inputId: 'helix-radius-end', type: 'distance', min: 5, max: 150, step: 1 },
    { valId: 'helix-alt-start-val', inputId: 'helix-alt-start', type: 'distance', min: 2, max: 200, step: 1 },
    { valId: 'helix-alt-end-val', inputId: 'helix-alt-end', type: 'distance', min: 5, max: 300, step: 1 },
    { valId: 'light-art-radius-val', inputId: 'light-art-radius', type: 'distance', min: 5, max: 150, step: 1 },
    { valId: 'light-art-climb-val', inputId: 'light-art-climb', type: 'distance', min: 0, max: 100, step: 1 },
    { valId: 'corridor-width-val', inputId: 'corridor-width', type: 'distance', min: 10, max: 500, step: 5 },
    { valId: 'corridor-overshoot-val', inputId: 'corridor-overshoot', type: 'distance', min: 0, max: 100, step: 5 }
  ];

  clickToTypeConfigs.forEach(cfg => {
    const valEl = document.getElementById(cfg.valId);
    const sliderEl = document.getElementById(cfg.inputId);
    if (!valEl || !sliderEl) return;

    valEl.classList.add('clickable-val');
    valEl.setAttribute('title', 'Click to type exact value');

    valEl.addEventListener('click', (e) => {
      e.stopPropagation();
      // If already editing, don't re-create input
      if (valEl.querySelector('input')) return;

      const currentDisplayedText = valEl.textContent.trim();
      const currentValNum = parseFloat(currentDisplayedText);
      const isAuto = isNaN(currentValNum) && currentDisplayedText.toLowerCase().includes('auto');

      const input = document.createElement('input');
      input.type = 'number';
      input.className = 'inline-val-input';
      input.step = cfg.step ? String(cfg.step) : 'any';

      const unit = (typeof getUnitSystem === 'function') ? getUnitSystem() : 'metric';
      let minVal = cfg.min;
      let maxVal = cfg.max;
      if (unit === 'imperial') {
        if (cfg.type === 'speed') {
          minVal = Math.round(cfg.min * MPS_TO_MPH * 10) / 10;
          maxVal = Math.round(cfg.max * MPS_TO_MPH * 10) / 10;
        } else if (cfg.type === 'distance') {
          minVal = Math.round(cfg.min * M_TO_FT);
          maxVal = Math.round(cfg.max * M_TO_FT);
        }
      }
      input.min = String(minVal);
      input.max = String(maxVal);
      input.value = isAuto ? '0' : (isNaN(currentValNum) ? '' : String(currentValNum));

      valEl.textContent = '';
      valEl.appendChild(input);
      if (typeof input.focus === 'function') input.focus();
      if (typeof input.select === 'function') input.select();

      let committed = false;
      const commitChange = () => {
        if (committed) return;
        committed = true;

        const typedRaw = parseFloat(input.value);
        if (isNaN(typedRaw)) {
          // Revert if invalid
          if (typeof syncDisplayValues === 'function') syncDisplayValues();
          return;
        }

        // Clamp to allowed range in displayed units
        const clampedTyped = Math.max(minVal, Math.min(maxVal, typedRaw));

        // Convert back to metric slider storage units if imperial
        let metricVal = clampedTyped;
        if (unit === 'imperial') {
          if (cfg.type === 'speed') {
            metricVal = clampedTyped / MPS_TO_MPH;
          } else if (cfg.type === 'distance') {
            metricVal = clampedTyped * FT_TO_M;
          }
        }

        // Format decimal precision: if imperial conversion occurred, preserve 2 decimal places for smooth fidelity
        if (unit === 'imperial') {
          metricVal = Math.round(metricVal * 100) / 100;
        } else if (cfg.step < 1) {
          metricVal = Math.round(metricVal * 10) / 10;
        } else {
          metricVal = Math.round(metricVal);
        }

        sliderEl.value = String(metricVal);

        // Dispatch input and change events so all listeners and storage sync
        sliderEl.dispatchEvent(new Event('input', { bubbles: true }));
        sliderEl.dispatchEvent(new Event('change', { bubbles: true }));

        if (typeof syncDisplayValues === 'function') {
          syncDisplayValues();
        }
      };

      const cancelEdit = () => {
        if (committed) return;
        committed = true;
        if (typeof syncDisplayValues === 'function') {
          syncDisplayValues();
        } else {
          valEl.textContent = currentDisplayedText;
        }
      };

      input.addEventListener('blur', commitChange);
      input.addEventListener('keydown', (ke) => {
        if (ke.key === 'Enter') {
          ke.preventDefault();
          commitChange();
        } else if (ke.key === 'Escape') {
          ke.preventDefault();
          cancelEdit();
        }
      });
    });
  });
}

/**
 * Mobile Navigation & Responsive Ergonomics (v1.86.0)
 * Handles expandable search bar on small screens and 3-dots More Actions dropdown menu.
 */
function initMobileNav() {
  if (typeof document === 'undefined' || typeof document.querySelector !== 'function') return;

  const searchToggleBtn = document.getElementById('mobile-search-toggle-btn');
  const searchCloseBtn = document.getElementById('mobile-search-close-btn');
  const topbar = document.querySelector('.studio-topbar');
  const topbarCenter = document.querySelector('.topbar-center');
  const locationInput = document.getElementById('location-input');

  if (searchToggleBtn && topbarCenter) {
    searchToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      topbarCenter.classList.add('search-open');
      if (topbar) topbar.classList.add('search-open');
      if (locationInput) {
        setTimeout(() => locationInput.focus(), 50);
      }
    });
  }

  if (searchCloseBtn && topbarCenter) {
    searchCloseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      topbarCenter.classList.remove('search-open');
      if (topbar) topbar.classList.remove('search-open');
    });
  }

  // Close search on Locate Me click in mobile view
  const locateBtn = document.getElementById('locate-me-btn');
  if (locateBtn && topbarCenter) {
    locateBtn.addEventListener('click', () => {
      if (window.innerWidth <= 640) {
        topbarCenter.classList.remove('search-open');
        if (topbar) topbar.classList.remove('search-open');
      }
    });
  }

  // More Actions Dropdown Menu (Intro, About, Links, Diagnostics)
  const moreBtn = document.getElementById('header-more-btn');
  const moreMenu = document.getElementById('header-more-menu');
  const moreDiagBtn = document.getElementById('more-menu-diagnostics-btn');
  const moreIntroBtn = document.getElementById('more-menu-intro-btn');
  const moreAboutBtn = document.getElementById('more-menu-about-btn');
  const moreLinksBtn = document.getElementById('more-menu-links-btn');

  if (moreBtn && moreMenu) {
    moreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      moreMenu.classList.toggle('hidden');
    });

    if (moreDiagBtn && typeof moreDiagBtn.addEventListener === 'function') {
      moreDiagBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        moreMenu.classList.add('hidden');
        if (typeof FlightDiagnostics !== 'undefined' && FlightDiagnostics.open) {
          FlightDiagnostics.open();
        }
      });
    }

    if (moreIntroBtn) {
      moreIntroBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        moreMenu.classList.add('hidden');
        if (typeof openIntroModal === 'function') {
          openIntroModal('workflow');
        }
      });
    }

    if (moreAboutBtn) {
      moreAboutBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        moreMenu.classList.add('hidden');
        const aboutBtn = document.getElementById('about-btn');
        if (aboutBtn) aboutBtn.click();
      });
    }

    if (moreLinksBtn) {
      moreLinksBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        moreMenu.classList.add('hidden');
        const linksBtn = document.getElementById('useful-links-btn');
        if (linksBtn) linksBtn.click();
      });
    }

    const moreCoffeeBtn = document.getElementById('more-menu-coffee-btn');
    if (moreCoffeeBtn && typeof moreCoffeeBtn.addEventListener === 'function') {
      moreCoffeeBtn.addEventListener('click', () => {
        moreMenu.classList.add('hidden');
      });
    }

    const moreCustomizeBtn = document.getElementById('more-menu-customize-ribbon-btn');
    if (moreCustomizeBtn && typeof moreCustomizeBtn.addEventListener === 'function') {
      moreCustomizeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        moreMenu.classList.add('hidden');
        const configModal = document.getElementById('config-modal');
        if (configModal) {
          configModal.classList.remove('hidden');
          const card = document.getElementById('ribbon-settings-card');
          if (card && typeof card.scrollIntoView === 'function') {
            card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        }
      });
    }

    // Dismiss menu on click outside
    document.addEventListener('click', (e) => {
      if (!moreMenu.contains(e.target) && e.target !== moreBtn && !moreBtn.contains(e.target)) {
        moreMenu.classList.add('hidden');
      }
    });

    // Dismiss menu on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !moreMenu.classList.contains('hidden')) {
        moreMenu.classList.add('hidden');
      }
    });
  }

  // Initialize Top Ribbon layout customizer
  initTopbarRibbon();
}

/**
 * Customizable Top Ribbon Architecture (v1.161.0)
 * Allows pilots to toggle visibility and reorder items on the top menu bar,
 * with presets ('standard', 'compact', 'studio', 'custom') persisted in localStorage.
 */
const RIBBON_STORAGE_KEY = 'aalaapi_sky_topbar_ribbon_config';

const DEFAULT_RIBBON_ITEMS = [
  { id: 'search', label: 'Search & Location Bar', selector: '#header-search-container', defaultVisible: true },
  { id: 'mission-time', label: 'Mission Flight Time', selector: '.header-mission-time-container', defaultVisible: true },
  { id: 'weather', label: 'Weather & TFR Status', selector: '.header-telemetry-container', defaultVisible: true },
  { id: 'system-bridge', label: 'Bridge & Hardware Link', selector: '#header-bridge-container, #header-system-status-group', defaultVisible: true },
  { id: 'units', label: 'Units Toggle (FT / MPH)', selector: '#header-unit-toggle-btn', defaultVisible: true },
  { id: 'theme', label: 'Theme Toggle (Light / Dark)', selector: '#theme-toggle-btn', defaultVisible: true },
  { id: 'adsb', label: 'ADS-B Airspace Alerts', selector: '#adsb-topbar-btn', defaultVisible: true },
  { id: 'intro', label: 'Intro Guide Tour', selector: '#intro-tour-btn', defaultVisible: true },
  { id: 'about', label: 'About & Changelog', selector: '#about-btn', defaultVisible: true },
  { id: 'links', label: 'Useful Aviation Links', selector: '#useful-links-btn', defaultVisible: true },
  { id: 'coffee', label: 'Buy Me a Coffee (☕)', selector: '#buy-coffee-topbar-btn', defaultVisible: true }
];

function getDefaultRibbonConfig() {
  const items = {};
  DEFAULT_RIBBON_ITEMS.forEach((it, idx) => {
    items[it.id] = {
      visible: it.defaultVisible,
      order: (idx + 1) * 10
    };
  });
  return { preset: 'standard', items };
}

function getTopbarRibbonConfig() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(RIBBON_STORAGE_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.items) {
        const defaults = getDefaultRibbonConfig();
        return {
          preset: parsed.preset || 'custom',
          items: { ...defaults.items, ...parsed.items }
        };
      }
    }
  } catch (e) {
    Logger.warn('Error reading ribbon config from localStorage:', e);
  }
  return getDefaultRibbonConfig();
}

function setTopbarRibbonConfig(cfg) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(RIBBON_STORAGE_KEY, JSON.stringify(cfg));
    }
  } catch (e) {
    Logger.warn('Error saving ribbon config:', e);
  }
  applyTopbarRibbonConfig(cfg);
}

function applyTopbarRibbonConfig(cfg) {
  if (typeof document === 'undefined') return;
  const config = cfg || getTopbarRibbonConfig();
  let hasHiddenItem = false;

  DEFAULT_RIBBON_ITEMS.forEach(def => {
    const itemCfg = config.items[def.id];
    const el = document.querySelector(def.selector);
    if (!el) return;

    const isVisible = itemCfg ? itemCfg.visible : def.defaultVisible;
    if (isVisible) {
      el.classList.remove('ribbon-hidden');
      if (['intro', 'about', 'links', 'coffee'].includes(def.id) && config.preset === 'studio') {
        el.classList.add('ribbon-force-show');
      } else {
        el.classList.remove('ribbon-force-show');
      }
    } else {
      el.classList.add('ribbon-hidden');
      el.classList.remove('ribbon-force-show');
      hasHiddenItem = true;
    }

    if (itemCfg && typeof itemCfg.order === 'number') {
      el.style.order = String(itemCfg.order);
    }
  });

  const moreBtn = document.getElementById('header-more-btn');
  if (moreBtn) {
    if (hasHiddenItem) {
      moreBtn.style.display = 'inline-flex';
    } else if (typeof window !== 'undefined' && window.innerWidth > 1500) {
      moreBtn.style.display = '';
    }
  }
}

function resetTopbarRibbonConfig() {
  const def = getDefaultRibbonConfig();
  setTopbarRibbonConfig(def);
  renderRibbonCustomizerUI();
}

function renderRibbonCustomizerUI() {
  if (typeof document === 'undefined') return;
  const listEl = document.getElementById('ribbon-items-list');
  const presetSelect = document.getElementById('ribbon-preset-select');
  if (!listEl || typeof listEl.appendChild !== 'function') return;

  const config = getTopbarRibbonConfig();
  if (presetSelect) {
    presetSelect.value = config.preset;
  }

  listEl.innerHTML = '';

  const sortedItems = [...DEFAULT_RIBBON_ITEMS].sort((a, b) => {
    const ordA = (config.items[a.id]?.order) ?? 0;
    const ordB = (config.items[b.id]?.order) ?? 0;
    return ordA - ordB;
  });

  sortedItems.forEach((item, idx) => {
    const itemCfg = config.items[item.id] || { visible: item.defaultVisible, order: (idx + 1) * 10 };
    const row = document.createElement('div');
    if (!row) return;
    row.className = 'ribbon-item-row';
    if (row.dataset) {
      row.dataset.itemId = item.id;
    }
    if (typeof row.setAttribute === 'function') {
      row.setAttribute('data-item-id', item.id);
    }

    row.innerHTML = `
      <label class="ribbon-item-info" style="cursor: pointer; margin: 0; user-select: none;">
        <input type="checkbox" class="ribbon-item-checkbox" data-id="${item.id}" ${itemCfg.visible ? 'checked' : ''} style="cursor: pointer; margin: 0;">
        <span>${item.label}</span>
      </label>
      <div class="ribbon-item-actions">
        <button type="button" class="btn-ribbon-move btn-move-up" data-id="${item.id}" title="Move Earlier" ${idx === 0 ? 'disabled style="opacity: 0.3;"' : ''}>▲</button>
        <button type="button" class="btn-ribbon-move btn-move-down" data-id="${item.id}" title="Move Later" ${idx === sortedItems.length - 1 ? 'disabled style="opacity: 0.3;"' : ''}>▼</button>
      </div>
    `;

    const checkbox = row.querySelector ? row.querySelector('.ribbon-item-checkbox') : null;
    if (checkbox && typeof checkbox.addEventListener === 'function') {
      checkbox.addEventListener('change', () => {
        config.preset = 'custom';
        if (!config.items[item.id]) config.items[item.id] = {};
        config.items[item.id].visible = checkbox.checked;
        setTopbarRibbonConfig(config);
        if (presetSelect) presetSelect.value = 'custom';
      });
    }

    const upBtn = row.querySelector ? row.querySelector('.btn-move-up') : null;
    if (upBtn && typeof upBtn.addEventListener === 'function') {
      upBtn.addEventListener('click', () => {
        if (idx === 0) return;
        const prevItem = sortedItems[idx - 1];
        const curOrder = config.items[item.id].order;
        const prevOrder = config.items[prevItem.id].order;
        config.items[item.id].order = prevOrder;
        config.items[prevItem.id].order = curOrder;
        config.preset = 'custom';
        setTopbarRibbonConfig(config);
        renderRibbonCustomizerUI();
      });
    }

    const downBtn = row.querySelector ? row.querySelector('.btn-move-down') : null;
    if (downBtn && typeof downBtn.addEventListener === 'function') {
      downBtn.addEventListener('click', () => {
        if (idx === sortedItems.length - 1) return;
        const nextItem = sortedItems[idx + 1];
        const curOrder = config.items[item.id].order;
        const nextOrder = config.items[nextItem.id].order;
        config.items[item.id].order = nextOrder;
        config.items[nextItem.id].order = curOrder;
        config.preset = 'custom';
        setTopbarRibbonConfig(config);
        renderRibbonCustomizerUI();
      });
    }

    listEl.appendChild(row);
  });
}

function initTopbarRibbon() {
  if (typeof document === 'undefined') return;

  const config = getTopbarRibbonConfig();
  applyTopbarRibbonConfig(config);

  const presetSelect = document.getElementById('ribbon-preset-select');
  if (presetSelect && typeof presetSelect.addEventListener === 'function') {
    presetSelect.addEventListener('change', () => {
      const val = presetSelect.value;
      const current = getTopbarRibbonConfig();
      if (val === 'standard') {
        resetTopbarRibbonConfig();
        return;
      }
      if (val === 'compact') {
        current.preset = 'compact';
        DEFAULT_RIBBON_ITEMS.forEach(it => {
          if (['units', 'theme', 'intro', 'about', 'links', 'coffee'].includes(it.id)) {
            current.items[it.id].visible = false;
          } else {
            current.items[it.id].visible = true;
          }
        });
      } else if (val === 'studio') {
        current.preset = 'studio';
        DEFAULT_RIBBON_ITEMS.forEach(it => {
          current.items[it.id].visible = true;
        });
      }
      setTopbarRibbonConfig(current);
      renderRibbonCustomizerUI();
    });
  }

  const resetBtn = document.getElementById('reset-ribbon-config-btn');
  if (resetBtn && typeof resetBtn.addEventListener === 'function') {
    resetBtn.addEventListener('click', () => {
      resetTopbarRibbonConfig();
    });
  }

  renderRibbonCustomizerUI();
}

if (typeof window !== 'undefined') {
  window.getTopbarRibbonConfig = getTopbarRibbonConfig;
  window.setTopbarRibbonConfig = setTopbarRibbonConfig;
  window.applyTopbarRibbonConfig = applyTopbarRibbonConfig;
  window.resetTopbarRibbonConfig = resetTopbarRibbonConfig;
  window.initTopbarRibbon = initTopbarRibbon;
}

/**
 * Transforms sidebar unit labels into interactive clickable toggles,
 * allowing pilots to click any unit badge to switch globally between Imperial and Metric.
 */
function initClickableUnits() {
  if (typeof document === 'undefined') return;

  const unitElementIds = [
    'width-unit',
    'height-unit',
    'road-offset-unit',
    'target-radius-unit',
    'target-height-unit',
    'target-perimeter-standoff-unit',
    'target-perimeter-alt-unit',
    'exclusion-min-alt-unit',
    'exclusion-max-alt-unit',
    'altitude-unit',
    'speed-unit',
    'max-height-unit',
    'rth-altitude-unit',
    'global-exclusion-clearance-unit',
    'ap-height-unit',
    'ap-clearance-unit',
    'fpv-edit-alt-unit'
  ];

  unitElementIds.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;

    el.classList.add('clickable-unit');
    el.setAttribute('title', 'Click to switch units (Imperial / Metric)');

    el.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleUnitSystem();
    });
  });
}

// Dynamically hide/show sliders and change labels based on chosen flight pattern
function togglePatternParameters() {
  if (typeof document === 'undefined' || !document || !document.getElementById) return;
  const gridTypeEl = document.getElementById('grid-type');
  if (!gridTypeEl || !gridTypeEl.value) return;
  const gridType = gridTypeEl.value;

  const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
  const previousPattern = activeLayer ? activeLayer.pattern : null;
  const isPatternChanging = Boolean(activeLayer && previousPattern && previousPattern !== gridType);

  if (activeLayer) {
    if (isPatternChanging) {
      if (previousPattern === 'road-following') {
        activeLayer.roadWaypoints = [];
        roadWaypoints = [];
        if (typeof roadPathGroup !== 'undefined' && roadPathGroup && typeof roadPathGroup.clearLayers === 'function') {
          roadPathGroup.clearLayers();
        }
      } else if (previousPattern === 'corridor') {
        activeLayer.corridorCenterline = null;
        if (typeof corridorCenterline !== 'undefined') corridorCenterline = null;
      } else if (previousPattern === 'freeform') {
        activeLayer.freeformWaypoints = [];
        activeLayer.freeformPhotos = [];
      }
      activeLayer.hasCustomWaypoints = false;
      activeLayer.waypoints = [];
      if (activeLayer.gimbalPitch === 'auto' && gridType !== 'road-following') {
        activeLayer.gimbalPitch = (gridType === 'single') ? -90 : ((gridType === 'double') ? -60 : -45);
      }
      const layerNameMatch = activeLayer.name ? activeLayer.name.match(/^Layer\s+(\d+):\s+/) : null;
      if (layerNameMatch && typeof getPatternDisplayName === 'function') {
        activeLayer.name = `Layer ${layerNameMatch[1]}: ${getPatternDisplayName(gridType)}`;
      }
    }
    activeLayer.pattern = gridType;
    if (gridType !== 'road-following') {
      if (activeLayer.roadWaypoints && activeLayer.roadWaypoints.length > 0) {
        activeLayer.roadWaypoints = [];
      }
      roadWaypoints = [];
      if (typeof roadPathGroup !== 'undefined' && roadPathGroup && typeof roadPathGroup.clearLayers === 'function') {
        roadPathGroup.clearLayers();
      }
    }
    activeLayer.isExclusionZone = (gridType === 'exclusion-box' || gridType === 'exclusion-freeform');
    activeLayer.isDrawingLayer = (gridType === 'boundary-polygon' || gridType === 'fiducial-markers');
    activeLayer.isFiducialLayer = (gridType === 'fiducial-markers');
  }

  // Transition out of Imported KMZ mode if active
  if (importedWaypoints) {
    if (gridType === 'freeform') {
      generatedWaypoints = [...importedWaypoints];
      generatedPhotos = [...importedPhotos];
      if (activeLayer) {
        activeLayer.freeformWaypoints = generatedWaypoints.map(w => ({
          ...w,
          layerId: activeLayer.id,
          layerName: activeLayer.name,
          layerPattern: 'freeform'
        }));
        activeLayer.freeformPhotos = generatedPhotos.map(p => ({
          ...p,
          layerId: activeLayer.id
        }));
        activeLayer.waypoints = activeLayer.freeformWaypoints;
        activeLayer.photos = activeLayer.freeformPhotos;
      }
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

  const widthContainer = widthSlider?.closest ? widthSlider.closest('.control-group') : null;
  const heightContainer = heightSlider?.closest ? heightSlider.closest('.control-group') : null;
  const rotationContainer = rotationSlider?.closest ? rotationSlider.closest('.control-group') : null;
  const frontOverlapContainer = frontOverlapSlider?.closest ? frontOverlapSlider.closest('.control-group') : null;
  const sideOverlapContainer = sideOverlapSlider?.closest ? sideOverlapSlider.closest('.control-group') : null;
  const freeformInstructions = document.getElementById('freeform-instructions');
  const boundaryInstructions = document.getElementById('boundary-instructions');
  const roadOffsetContainer = document.getElementById('road-offset-container');
  const roadSnapContainer = document.getElementById('road-snap-container');
  const gridGeometrySection = document.getElementById('grid-geometry-section');
  const gridGeometryTitle = document.getElementById('grid-geometry-title');
  const layerCardGeometry = document.getElementById('layer-card-geometry');
  const layerCardFlight = document.getElementById('layer-card-flight');
  const layerCardOptics = document.getElementById('layer-card-optics');
  const layerCardModes = document.getElementById('layer-card-modes');
  const layerCardBoundary = document.getElementById('layer-card-boundary');
  const layerCardFiducial = document.getElementById('layer-card-fiducial');
  const fiducialInstructions = document.getElementById('fiducial-instructions');
  const layerCardGeometryTitle = document.getElementById('layer-card-geometry-title') ||
    (layerCardGeometry && layerCardGeometry.querySelector ? layerCardGeometry.querySelector('.layer-subgroup-header span') : null);

  const widthLabel = (widthContainer && widthContainer.querySelector) ? widthContainer.querySelector('.control-label > span') : null;
  const isExclusion = (gridType === 'exclusion-box' || gridType === 'exclusion-freeform');
  const isBoundary = (gridType === 'boundary-polygon');
  const isFiducial = (gridType === 'fiducial-markers');
  const exclusionInstructions = document.getElementById('exclusion-instructions');
  const exclusionAltContainer = document.getElementById('exclusion-altitude-container');
  const exclusionFreeformNote = document.getElementById('exclusion-freeform-note');
  const altitudeControlGroup = document.getElementById('altitude-control-group');

  if (boundaryInstructions) {
    if (isBoundary) {
      boundaryInstructions.classList.remove('hidden');
    } else {
      boundaryInstructions.classList.add('hidden');
    }
  }

  if (fiducialInstructions) {
    if (isFiducial) {
      fiducialInstructions.classList.remove('hidden');
    } else {
      fiducialInstructions.classList.add('hidden');
    }
  }

  if (layerCardBoundary) {
    if (isBoundary) {
      layerCardBoundary.classList.remove('hidden');
      layerCardBoundary.style.display = 'block';
    } else {
      layerCardBoundary.classList.add('hidden');
      layerCardBoundary.style.display = 'none';
    }
  }

  if (layerCardFiducial) {
    if (isFiducial) {
      layerCardFiducial.classList.remove('hidden');
      layerCardFiducial.style.display = 'block';
    } else {
      layerCardFiducial.classList.add('hidden');
      layerCardFiducial.style.display = 'none';
    }
  }

  if (exclusionInstructions) {
    if (isExclusion) {
      exclusionInstructions.classList.remove('hidden');
    } else {
      exclusionInstructions.classList.add('hidden');
    }
  }

  if (exclusionAltContainer) {
    if (isExclusion) {
      exclusionAltContainer.classList.remove('hidden');
    } else {
      exclusionAltContainer.classList.add('hidden');
    }
  }

  if (altitudeControlGroup) {
    if (isExclusion || isBoundary || isFiducial || gridType === 'tower') {
      altitudeControlGroup.style.display = 'none';
    } else {
      altitudeControlGroup.style.display = 'block';
    }
  }

  const patternLabels = {
    'single': '2D Nadir Grid',
    'double': '3D Double Grid',
    'target-splat': 'Target Splat Grid',
    'orbit': 'Circular Orbit',
    'multi-orbit': 'Multi-Tier Orbit',
    'tower': '3D Tower Audit',
    'grid-orbit-combo': '2D+3D Hybrid',
    'grid-multi-orbit-combo': 'Multi-Tier Hybrid',
    'freeform': 'Freeform Flight Plan',
    'road-following': 'Road Following',
    'exclusion-box': 'Exclusion (Box)',
    'exclusion-freeform': 'Exclusion (Polygon)',
    'boundary-polygon': 'Boundary / Parcel',
    'fiducial-markers': '🎯 Fiducial / GCPs',
    'photo-sphere': '360° Photo Sphere',
    'hyperlapse': 'Hyperlapse Time-Lapse',
    'light-art': '🎨 Light Art (Sky Painting)',
    'vertical-facade': '🏢 Vertical Facade Grid',
    'continuous-helix': '🌀 Continuous Helix / Spiral',
    'star-pass': '⭐ Star Pass (Cross-Hatch)',
    'corridor': '🛣️ Multi-Pass Corridor',
    'dome-shell': '🌐 Hemispherical Dome',
    'polygon-grid': '📐 Polygon Area Grid',
    'sar-search': '🛟 Search & Rescue',
    'perimeter-patrol': '🛡️ Perimeter Patrol',
    'cinematic-reveal': '🎬 Cinematic Reveal'
  };

  const targetSplatContainer = document.getElementById('target-splat-container');
  const towerGeometryContainer = document.getElementById('tower-geometry-container');
  const photoSphereContainer = document.getElementById('photo-sphere-container');
  const hyperlapseContainer = document.getElementById('hyperlapse-container');
  const lightArtContainer = document.getElementById('light-art-container');
  const verticalFacadeContainer = document.getElementById('vertical-facade-container');
  const continuousHelixContainer = document.getElementById('continuous-helix-container');
  const starPassContainer = document.getElementById('star-pass-container');
  const corridorContainer = document.getElementById('corridor-container');
  const domeShellContainer = document.getElementById('dome-shell-container');
  const polygonGridContainer = document.getElementById('polygon-grid-container');
  const sarSearchContainer = document.getElementById('sar-search-container');
  const perimeterPatrolContainer = document.getElementById('perimeter-patrol-container');
  const cinematicRevealContainer = document.getElementById('cinematic-reveal-container');

  const activePatternBadge = document.getElementById('active-layer-pattern-badge');
  if (activePatternBadge) {
    activePatternBadge.textContent = patternLabels[gridType] || 'Layer Settings';
  }

  if (gridGeometryTitle) {
    if (typeof gridGeometryTitle.querySelector === 'function') {
      const titleSpan = gridGeometryTitle.querySelector('span:first-child');
      if (titleSpan) {
        titleSpan.textContent = "2. Layer Properties";
      } else if (!gridGeometryTitle.querySelector('#active-layer-pattern-badge')) {
        gridGeometryTitle.textContent = "2. Layer Properties";
      }
    } else {
      gridGeometryTitle.textContent = "2. Layer Properties";
    }
  }

  if (targetSplatContainer) {
    if (gridType === 'target-splat') {
      targetSplatContainer.classList.remove('hidden');
    } else {
      targetSplatContainer.classList.add('hidden');
    }
  }

  if (towerGeometryContainer) {
    if (gridType === 'tower') {
      towerGeometryContainer.classList.remove('hidden');
    } else {
      towerGeometryContainer.classList.add('hidden');
    }
  }

  if (verticalFacadeContainer) {
    if (gridType === 'vertical-facade') {
      verticalFacadeContainer.classList.remove('hidden');
    } else {
      verticalFacadeContainer.classList.add('hidden');
    }
  }

  if (continuousHelixContainer) {
    if (gridType === 'continuous-helix') {
      continuousHelixContainer.classList.remove('hidden');
    } else {
      continuousHelixContainer.classList.add('hidden');
    }
  }

  if (starPassContainer) {
    if (gridType === 'star-pass') {
      starPassContainer.classList.remove('hidden');
    } else {
      starPassContainer.classList.add('hidden');
    }
  }

  if (corridorContainer) {
    if (gridType === 'corridor') {
      corridorContainer.classList.remove('hidden');
      if (typeof renderCorridorNodeTable === 'function') {
        renderCorridorNodeTable();
      }
    } else {
      corridorContainer.classList.add('hidden');
      if (typeof isCorridorEditActive !== 'undefined' && isCorridorEditActive) {
        if (typeof setCorridorEditMode === 'function') {
          setCorridorEditMode(false);
        }
      }
    }
  }

  if (photoSphereContainer) {
    if (gridType === 'photo-sphere') {
      photoSphereContainer.classList.remove('hidden');
      if (typeof updatePhotoSphereBadge === 'function') {
        updatePhotoSphereBadge();
      }
    } else {
      photoSphereContainer.classList.add('hidden');
    }
  }

  if (hyperlapseContainer) {
    if (gridType === 'hyperlapse') {
      hyperlapseContainer.classList.remove('hidden');
    } else {
      hyperlapseContainer.classList.add('hidden');
    }
  }

  if (lightArtContainer) {
    if (gridType === 'light-art') {
      lightArtContainer.classList.remove('hidden');
    } else {
      lightArtContainer.classList.add('hidden');
    }
  }

  if (domeShellContainer) {
    if (gridType === 'dome-shell') domeShellContainer.classList.remove('hidden');
    else domeShellContainer.classList.add('hidden');
  }

  if (polygonGridContainer) {
    if (gridType === 'polygon-grid') polygonGridContainer.classList.remove('hidden');
    else polygonGridContainer.classList.add('hidden');
  }

  if (sarSearchContainer) {
    if (gridType === 'sar-search') sarSearchContainer.classList.remove('hidden');
    else sarSearchContainer.classList.add('hidden');
  }

  if (perimeterPatrolContainer) {
    if (gridType === 'perimeter-patrol') perimeterPatrolContainer.classList.remove('hidden');
    else perimeterPatrolContainer.classList.add('hidden');
  }

  if (cinematicRevealContainer) {
    if (gridType === 'cinematic-reveal') cinematicRevealContainer.classList.remove('hidden');
    else cinematicRevealContainer.classList.add('hidden');
  }

  if (gridType === 'target-splat') {
    const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
    if (activeLayer && activeLayer.pattern !== 'road-following') roadWaypoints = [];
    if (gridGeometrySection) {
      gridGeometrySection.style.display = 'block';
      gridGeometrySection.classList.remove('collapsed');
    }
    if (layerCardGeometry) layerCardGeometry.style.display = 'block';
    if (layerCardGeometryTitle) layerCardGeometryTitle.textContent = "📐 Coverage & Geometry";
    if (layerCardFlight) layerCardFlight.style.display = 'block';
    if (layerCardOptics) layerCardOptics.style.display = 'block';
    if (layerCardModes) layerCardModes.style.display = 'block';
    if (exclusionFreeformNote) exclusionFreeformNote.classList.add('hidden');
    if (targetSplatContainer) targetSplatContainer.classList.remove('hidden');
    if (towerGeometryContainer) towerGeometryContainer.classList.add('hidden');
    if (roadOffsetContainer) roadOffsetContainer.classList.add('hidden');
    if (roadSnapContainer) roadSnapContainer.classList.add('hidden');
    if (exclusionAltContainer) exclusionAltContainer.classList.add('hidden');
    if (widthLabel) widthLabel.textContent = "Survey Width";
    const heightLabel = (heightContainer && heightContainer.querySelector) ? heightContainer.querySelector('.control-label > span') : null;
    if (heightLabel) heightLabel.textContent = "Survey Height";
    if (widthContainer) widthContainer.style.display = 'block';
    if (heightContainer) heightContainer.style.display = 'block';
    if (rotationContainer) rotationContainer.style.display = 'block';
    if (frontOverlapContainer) frontOverlapContainer.style.display = 'block';
    if (sideOverlapContainer) sideOverlapContainer.style.display = 'block';
    if (freeformInstructions) freeformInstructions.classList.add('hidden');
    if (gimbalPitchSlider && (!gimbalPitchSlider.value || parseFloat(gimbalPitchSlider.value) === -90)) {
      gimbalPitchSlider.value = -45;
    }
    if (activeLayer) {
      applyTargetSplatAutoDimensions(activeLayer);
      updateTargetSplatDiagram(activeLayer);
    }

  } else if (gridType === 'exclusion-freeform') {
    const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
    if (activeLayer && activeLayer.pattern !== 'road-following') roadWaypoints = [];
    if (gridGeometrySection) {
      gridGeometrySection.style.display = 'block';
      gridGeometrySection.classList.remove('collapsed');
    }
    if (layerCardGeometry) layerCardGeometry.style.display = 'block';
    if (layerCardGeometryTitle) layerCardGeometryTitle.textContent = "🚫 Exclusion Boundary & Airspace";
    if (layerCardFlight) layerCardFlight.style.display = 'none';
    if (layerCardOptics) layerCardOptics.style.display = 'none';
    if (layerCardModes) layerCardModes.style.display = 'none';
    if (exclusionFreeformNote) exclusionFreeformNote.classList.remove('hidden');
    if (exclusionAltContainer) exclusionAltContainer.classList.remove('hidden');
    if (towerGeometryContainer) towerGeometryContainer.classList.add('hidden');
    if (targetSplatContainer) targetSplatContainer.classList.add('hidden');
    if (roadOffsetContainer) roadOffsetContainer.classList.add('hidden');
    if (roadSnapContainer) roadSnapContainer.classList.add('hidden');
    if (widthContainer) widthContainer.style.display = 'none';
    if (heightContainer) heightContainer.style.display = 'none';
    if (rotationContainer) rotationContainer.style.display = 'none';
    if (frontOverlapContainer) frontOverlapContainer.style.display = 'none';
    if (sideOverlapContainer) sideOverlapContainer.style.display = 'none';
    if (freeformInstructions) freeformInstructions.classList.add('hidden');

  } else if (gridType === 'exclusion-box') {
    const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
    if (activeLayer && activeLayer.pattern !== 'road-following') roadWaypoints = [];
    if (gridGeometrySection) {
      gridGeometrySection.style.display = 'block';
      gridGeometrySection.classList.remove('collapsed');
    }
    if (layerCardGeometry) layerCardGeometry.style.display = 'block';
    if (layerCardGeometryTitle) layerCardGeometryTitle.textContent = "🚫 Exclusion Volume & Airspace";
    if (layerCardFlight) layerCardFlight.style.display = 'none';
    if (layerCardOptics) layerCardOptics.style.display = 'none';
    if (layerCardModes) layerCardModes.style.display = 'none';
    if (exclusionFreeformNote) exclusionFreeformNote.classList.add('hidden');
    if (exclusionAltContainer) exclusionAltContainer.classList.remove('hidden');
    if (towerGeometryContainer) towerGeometryContainer.classList.add('hidden');
    if (targetSplatContainer) targetSplatContainer.classList.add('hidden');
    if (roadOffsetContainer) roadOffsetContainer.classList.add('hidden');
    if (roadSnapContainer) roadSnapContainer.classList.add('hidden');
    if (widthLabel) widthLabel.textContent = "Box Width";
    if (widthContainer) widthContainer.style.display = 'block';
    if (heightContainer) heightContainer.style.display = 'block';
    if (rotationContainer) rotationContainer.style.display = 'block';
    if (frontOverlapContainer) frontOverlapContainer.style.display = 'none';
    if (sideOverlapContainer) sideOverlapContainer.style.display = 'none';
    if (freeformInstructions) freeformInstructions.classList.add('hidden');

  } else if (gridType === 'freeform') {
    const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
    if (activeLayer && activeLayer.pattern !== 'road-following') roadWaypoints = [];
    if (gridGeometrySection) {
      gridGeometrySection.style.display = 'block';
      gridGeometrySection.classList.remove('collapsed');
    }
    if (layerCardGeometry) layerCardGeometry.style.display = 'none';
    if (layerCardFlight) layerCardFlight.style.display = 'block';
    if (layerCardOptics) layerCardOptics.style.display = 'block';
    if (layerCardModes) layerCardModes.style.display = 'block';
    if (altitudeControlGroup) altitudeControlGroup.style.display = 'block';
    if (towerGeometryContainer) towerGeometryContainer.classList.add('hidden');
    if (targetSplatContainer) targetSplatContainer.classList.add('hidden');
    if (roadOffsetContainer) roadOffsetContainer.classList.add('hidden');
    if (roadSnapContainer) roadSnapContainer.classList.add('hidden');
    if (exclusionAltContainer) exclusionAltContainer.classList.add('hidden');
    if (exclusionFreeformNote) exclusionFreeformNote.classList.add('hidden');
    if (widthContainer) widthContainer.style.display = 'none';
    if (heightContainer) heightContainer.style.display = 'none';
    if (rotationContainer) rotationContainer.style.display = 'none';
    if (frontOverlapContainer) frontOverlapContainer.style.display = 'none';
    if (sideOverlapContainer) sideOverlapContainer.style.display = 'none';
    if (freeformInstructions) {
      if (freeformInstructions.querySelector) {
        const span = freeformInstructions.querySelector('span');
        if (span) span.textContent = "ℹ️ Click on the map to add custom waypoints. Drag waypoints to move them. Click a waypoint to delete or edit it.";
      }
      if (freeformInstructions.classList) freeformInstructions.classList.remove('hidden');
    }
    if (gimbalPitchSlider) gimbalPitchSlider.value = -60;

  } else if (gridType === 'boundary-polygon') {
    const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
    if (activeLayer && activeLayer.pattern !== 'road-following') roadWaypoints = [];
    if (gridGeometrySection) {
      gridGeometrySection.style.display = 'block';
      gridGeometrySection.classList.remove('collapsed');
    }
    if (layerCardGeometry) layerCardGeometry.style.display = 'none';
    if (layerCardFlight) layerCardFlight.style.display = 'none';
    if (layerCardOptics) layerCardOptics.style.display = 'none';
    if (layerCardModes) layerCardModes.style.display = 'none';
    if (layerCardBoundary) {
      layerCardBoundary.classList.remove('hidden');
      layerCardBoundary.style.display = 'block';
    }
    if (layerCardFiducial) {
      layerCardFiducial.classList.add('hidden');
      layerCardFiducial.style.display = 'none';
    }
    if (boundaryInstructions) boundaryInstructions.classList.remove('hidden');
    if (altitudeControlGroup) altitudeControlGroup.style.display = 'none';
    if (exclusionAltContainer) exclusionAltContainer.classList.add('hidden');
    if (exclusionFreeformNote) exclusionFreeformNote.classList.add('hidden');
    if (towerGeometryContainer) towerGeometryContainer.classList.add('hidden');
    if (targetSplatContainer) targetSplatContainer.classList.add('hidden');
    if (roadOffsetContainer) roadOffsetContainer.classList.add('hidden');
    if (roadSnapContainer) roadSnapContainer.classList.add('hidden');
    if (freeformInstructions) freeformInstructions.classList.add('hidden');
    if (widthContainer) widthContainer.style.display = 'none';
    if (heightContainer) heightContainer.style.display = 'none';
    if (rotationContainer) rotationContainer.style.display = 'none';
    if (frontOverlapContainer) frontOverlapContainer.style.display = 'none';
    if (sideOverlapContainer) sideOverlapContainer.style.display = 'none';

    // Populate active layer boundary settings
    if (activeLayer) {
      const nameInp = document.getElementById('boundary-layer-name');
      if (nameInp) nameInp.value = activeLayer.name || 'Boundary / Parcel';
      const colorSel = document.getElementById('boundary-stroke-color');
      if (colorSel) colorSel.value = activeLayer.strokeColor || '#06b6d4';
      const lineSel = document.getElementById('boundary-line-style');
      if (lineSel) lineSel.value = activeLayer.lineStyle || 'dashed';
      const opSlider = document.getElementById('boundary-fill-opacity');
      const opVal = document.getElementById('boundary-fill-opacity-val');
      const fillOp = (activeLayer.fillOpacity !== undefined) ? activeLayer.fillOpacity : 15;
      if (opSlider) opSlider.value = fillOp;
      if (opVal) opVal.textContent = `${fillOp}%`;
      const elevInp = document.getElementById('boundary-elevation');
      const elevVal = document.getElementById('boundary-elevation-val');
      const elev = (activeLayer.targetHeight !== undefined) ? activeLayer.targetHeight : 0;
      if (elevInp) elevInp.value = elev;
      if (elevVal) elevVal.textContent = `${elev}m`;

      const vertices = (Array.isArray(activeLayer.boundaryPolygon) && activeLayer.boundaryPolygon.length > 0)
        ? activeLayer.boundaryPolygon
        : (Array.isArray(activeLayer.polygonVertices) && activeLayer.polygonVertices.length > 0 ? activeLayer.polygonVertices : []);
      const metrics = (typeof calculateGeodeticPolygonMetrics === 'function')
        ? calculateGeodeticPolygonMetrics(vertices)
        : { perimeter: 0, area: 0 };
      const vBadge = document.getElementById('boundary-metrics-vertices');
      const pBadge = document.getElementById('boundary-metrics-perimeter');
      const aBadge = document.getElementById('boundary-metrics-area');
      const perimFt = metrics.perimeter * 3.28084;
      const areaAcres = metrics.area * 0.000247105;
      if (vBadge) vBadge.textContent = `${vertices.length} Vertices`;
      if (pBadge) pBadge.textContent = `${(typeof formatDistance === 'function') ? formatDistance(metrics.perimeter) : `${Math.round(metrics.perimeter)}m`} (${Math.round(perimFt)}ft)`;
      if (aBadge) aBadge.textContent = `${Math.round(metrics.area).toLocaleString()} m² (${areaAcres.toFixed(2)} acres)`;
    }

  } else if (gridType === 'fiducial-markers') {
    const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
    if (activeLayer && activeLayer.pattern !== 'road-following') roadWaypoints = [];
    if (gridGeometrySection) {
      gridGeometrySection.style.display = 'block';
      gridGeometrySection.classList.remove('collapsed');
    }
    if (layerCardGeometry) layerCardGeometry.style.display = 'none';
    if (layerCardFlight) layerCardFlight.style.display = 'none';
    if (layerCardOptics) layerCardOptics.style.display = 'none';
    if (layerCardModes) layerCardModes.style.display = 'none';
    if (layerCardBoundary) {
      layerCardBoundary.classList.add('hidden');
      layerCardBoundary.style.display = 'none';
    }
    if (layerCardFiducial) {
      layerCardFiducial.classList.remove('hidden');
      layerCardFiducial.style.display = 'block';
    }
    if (boundaryInstructions) boundaryInstructions.classList.add('hidden');
    if (fiducialInstructions) fiducialInstructions.classList.remove('hidden');
    if (altitudeControlGroup) altitudeControlGroup.style.display = 'none';
    if (exclusionAltContainer) exclusionAltContainer.classList.add('hidden');
    if (exclusionFreeformNote) exclusionFreeformNote.classList.add('hidden');
    if (towerGeometryContainer) towerGeometryContainer.classList.add('hidden');
    if (targetSplatContainer) targetSplatContainer.classList.add('hidden');
    if (roadOffsetContainer) roadOffsetContainer.classList.add('hidden');
    if (roadSnapContainer) roadSnapContainer.classList.add('hidden');
    if (freeformInstructions) freeformInstructions.classList.add('hidden');
    if (widthContainer) widthContainer.style.display = 'none';
    if (heightContainer) heightContainer.style.display = 'none';
    if (rotationContainer) rotationContainer.style.display = 'none';
    if (frontOverlapContainer) frontOverlapContainer.style.display = 'none';
    if (sideOverlapContainer) sideOverlapContainer.style.display = 'none';

    // Populate active layer fiducial settings
    if (activeLayer) {
      const nameInp = document.getElementById('fiducial-layer-name');
      if (nameInp) nameInp.value = activeLayer.name || 'Ground Control Points (GCPs)';
      const typeSel = document.getElementById('fiducial-default-type');
      if (typeSel) typeSel.value = activeLayer.defaultTargetType || 'aruco_4x4';
      const roleSel = document.getElementById('fiducial-default-role');
      if (roleSel) roleSel.value = activeLayer.defaultRole || 'gcp';
      const sizeInp = document.getElementById('fiducial-default-size');
      if (sizeInp) sizeInp.value = activeLayer.defaultPhysicalSize !== undefined ? activeLayer.defaultPhysicalSize : 0.5;
      const colorSel = document.getElementById('fiducial-marker-color');
      if (colorSel) colorSel.value = activeLayer.markerColor || '#f59e0b';

      renderFiducialMarkersTable(activeLayer);
      updateFiducialAltitudeAdvisor(activeLayer);
    }

  } else if (gridType === 'road-following') {
    if (gridGeometrySection) {
      gridGeometrySection.style.display = 'block';
      gridGeometrySection.classList.remove('collapsed');
    }
    if (layerCardGeometry) layerCardGeometry.style.display = 'block';
    if (layerCardGeometryTitle) layerCardGeometryTitle.textContent = "📐 Road Path & Routing";
    if (layerCardFlight) layerCardFlight.style.display = 'block';
    if (layerCardOptics) layerCardOptics.style.display = 'block';
    if (layerCardModes) layerCardModes.style.display = 'block';
    if (altitudeControlGroup) altitudeControlGroup.style.display = 'block';
    if (widthContainer) widthContainer.style.display = 'none';
    if (heightContainer) heightContainer.style.display = 'none';
    if (rotationContainer) rotationContainer.style.display = 'none';
    if (frontOverlapContainer) frontOverlapContainer.style.display = 'none';
    if (sideOverlapContainer) sideOverlapContainer.style.display = 'none';
    if (towerGeometryContainer) towerGeometryContainer.classList.add('hidden');
    if (targetSplatContainer) targetSplatContainer.classList.add('hidden');
    if (exclusionAltContainer) exclusionAltContainer.classList.add('hidden');
    if (exclusionFreeformNote) exclusionFreeformNote.classList.add('hidden');
    if (freeformInstructions) {
      const span = freeformInstructions.querySelector('span');
      if (span) span.textContent = "ℹ️ Click on the map to define the road path. Drag points to adjust the road. The drone flight path will automatically offset left/right based on the slider.";
      freeformInstructions.classList.remove('hidden');
    }
    if (roadOffsetContainer) roadOffsetContainer.classList.remove('hidden');
    if (roadSnapContainer) roadSnapContainer.classList.remove('hidden');

    const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
    if (activeLayer) {
      if (!activeLayer.roadWaypoints) activeLayer.roadWaypoints = [];
      roadWaypoints = activeLayer.roadWaypoints;
    }

    syncDisplayValues();
    updateGrid();
    if (typeof updateLayerHierarchyBadge === 'function') updateLayerHierarchyBadge();
    return;

  } else if (gridType === 'tower') {
    const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
    if (activeLayer && activeLayer.pattern !== 'road-following') roadWaypoints = [];
    if (gridGeometrySection) {
      gridGeometrySection.style.display = 'block';
      gridGeometrySection.classList.remove('collapsed');
    }
    if (layerCardGeometry) layerCardGeometry.style.display = 'block';
    if (layerCardGeometryTitle) layerCardGeometryTitle.textContent = "📐 Tower Geometry & Standoff";
    if (layerCardFlight) layerCardFlight.style.display = 'block';
    if (layerCardOptics) layerCardOptics.style.display = 'block';
    if (layerCardModes) layerCardModes.style.display = 'block';
    if (exclusionFreeformNote) exclusionFreeformNote.classList.add('hidden');
    if (exclusionAltContainer) exclusionAltContainer.classList.add('hidden');
    if (targetSplatContainer) targetSplatContainer.classList.add('hidden');
    if (roadOffsetContainer) roadOffsetContainer.classList.add('hidden');
    if (roadSnapContainer) roadSnapContainer.classList.add('hidden');
    if (towerGeometryContainer) towerGeometryContainer.classList.remove('hidden');
    if (altitudeControlGroup) altitudeControlGroup.style.display = 'none';
    if (widthContainer) widthContainer.style.display = 'none';
    if (heightContainer) heightContainer.style.display = 'none';
    if (rotationContainer) rotationContainer.style.display = 'none';
    if (frontOverlapContainer) frontOverlapContainer.style.display = 'block';
    if (sideOverlapContainer) sideOverlapContainer.style.display = 'block';
    if (freeformInstructions) freeformInstructions.classList.add('hidden');
    if (gimbalPitchSlider && (!gimbalPitchSlider.value || parseFloat(gimbalPitchSlider.value) === -90)) {
      gimbalPitchSlider.value = 0;
      if (typeof updateGimbalPitchVisualizer === 'function') {
        updateGimbalPitchVisualizer(0);
      }
    }

  } else if (gridType === 'photo-sphere') {
    const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
    if (activeLayer && activeLayer.pattern !== 'road-following') roadWaypoints = [];
    if (gridGeometrySection) {
      gridGeometrySection.style.display = 'block';
      gridGeometrySection.classList.remove('collapsed');
    }
    if (layerCardGeometry) layerCardGeometry.style.display = 'block';
    if (layerCardGeometryTitle) layerCardGeometryTitle.textContent = "📐 360° Sphere Geometry";
    if (layerCardFlight) layerCardFlight.style.display = 'block';
    if (layerCardOptics) layerCardOptics.style.display = 'none';
    if (layerCardModes) layerCardModes.style.display = 'none';
    if (layerCardBoundary) {
      layerCardBoundary.classList.add('hidden');
      layerCardBoundary.style.display = 'none';
    }
    if (layerCardFiducial) {
      layerCardFiducial.classList.add('hidden');
      layerCardFiducial.style.display = 'none';
    }
    if (altitudeControlGroup) altitudeControlGroup.style.display = 'block';
    if (photoSphereContainer) photoSphereContainer.classList.remove('hidden');
    if (towerGeometryContainer) towerGeometryContainer.classList.add('hidden');
    if (targetSplatContainer) targetSplatContainer.classList.add('hidden');
    if (roadOffsetContainer) roadOffsetContainer.classList.add('hidden');
    if (roadSnapContainer) roadSnapContainer.classList.add('hidden');
    if (exclusionAltContainer) exclusionAltContainer.classList.add('hidden');
    if (exclusionFreeformNote) exclusionFreeformNote.classList.add('hidden');
    if (freeformInstructions) freeformInstructions.classList.add('hidden');
    if (widthContainer) widthContainer.style.display = 'none';
    if (heightContainer) heightContainer.style.display = 'none';
    if (rotationContainer) rotationContainer.style.display = 'none';
    if (frontOverlapContainer) frontOverlapContainer.style.display = 'none';
    if (sideOverlapContainer) sideOverlapContainer.style.display = 'none';

    // Lock capture mode to stopAndShoot to eliminate rotational blur
    if (activeLayer) {
      activeLayer.captureMode = 'stopAndShoot';
    }
    const captureModeSelect = document.getElementById('capture-mode');
    if (captureModeSelect) {
      captureModeSelect.value = 'stopAndShoot';
    }

  } else if (gridType === 'hyperlapse') {
    const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
    if (activeLayer && activeLayer.pattern !== 'road-following') roadWaypoints = [];
    if (gridGeometrySection) {
      gridGeometrySection.style.display = 'block';
      gridGeometrySection.classList.remove('collapsed');
    }
    if (layerCardGeometry) layerCardGeometry.style.display = 'block';
    if (layerCardGeometryTitle) layerCardGeometryTitle.textContent = "🎞️ Hyperlapse Transit Path";
    if (layerCardFlight) layerCardFlight.style.display = 'block';
    if (layerCardOptics) layerCardOptics.style.display = 'block';
    if (layerCardModes) layerCardModes.style.display = 'block';
    if (layerCardBoundary) {
      layerCardBoundary.classList.add('hidden');
      layerCardBoundary.style.display = 'none';
    }
    if (layerCardFiducial) {
      layerCardFiducial.classList.add('hidden');
      layerCardFiducial.style.display = 'none';
    }
    if (altitudeControlGroup) altitudeControlGroup.style.display = 'block';
    if (hyperlapseContainer) hyperlapseContainer.classList.remove('hidden');
    if (photoSphereContainer) photoSphereContainer.classList.add('hidden');
    if (towerGeometryContainer) towerGeometryContainer.classList.add('hidden');
    if (targetSplatContainer) targetSplatContainer.classList.add('hidden');
    if (roadOffsetContainer) roadOffsetContainer.classList.add('hidden');
    if (roadSnapContainer) roadSnapContainer.classList.add('hidden');
    if (exclusionAltContainer) exclusionAltContainer.classList.add('hidden');
    if (exclusionFreeformNote) exclusionFreeformNote.classList.add('hidden');
    if (freeformInstructions) freeformInstructions.classList.add('hidden');
    if (widthContainer) widthContainer.style.display = 'none';
    if (heightContainer) heightContainer.style.display = 'none';
    if (rotationContainer) rotationContainer.style.display = 'none';
    if (frontOverlapContainer) frontOverlapContainer.style.display = 'none';
    if (sideOverlapContainer) sideOverlapContainer.style.display = 'none';

    if (activeLayer) {
      if (!activeLayer.captureMode || activeLayer.captureMode === 'inherit') {
        activeLayer.captureMode = 'continuous';
      }
      activeLayer.pathMode = 'curved';
      activeLayer.headingMode = 'smoothTransition';
      const curPitch = (activeLayer.gimbalPitch !== undefined && !isNaN(activeLayer.gimbalPitch) && activeLayer.gimbalPitch !== 'auto') ? activeLayer.gimbalPitch : -60;
      if (activeLayer.hyperlapseStartPitch === undefined || activeLayer.hyperlapseStartPitch === activeLayer.hyperlapseEndPitch || activeLayer.hyperlapseStartPitch === -15) {
        activeLayer.hyperlapseStartPitch = curPitch;
        activeLayer.hyperlapseEndPitch = curPitch;
        const hlStart = document.getElementById('hyperlapse-start-pitch');
        const hlEnd = document.getElementById('hyperlapse-end-pitch');
        if (hlStart) hlStart.value = curPitch;
        if (hlEnd) hlEnd.value = curPitch;
      }
      const hlModeSel = document.getElementById('hyperlapse-waypoint-mode');
      const hlModeBdg = document.getElementById('hyperlapse-mode-badge');
      if (hlModeSel) hlModeSel.value = activeLayer.hyperlapseWaypointMode || 'dense';
      if (hlModeBdg) hlModeBdg.textContent = (activeLayer.hyperlapseWaypointMode === 'spline') ? 'Keyframe Spline' : 'Discrete Frames';
    }
    const layerCapSelect = document.getElementById('layer-capture-mode');
    if (layerCapSelect && activeLayer) layerCapSelect.value = activeLayer.captureMode || 'continuous';
    const layerPathSelect = document.getElementById('layer-path-mode');
    if (layerPathSelect) layerPathSelect.value = 'curved';
    const layerHeadingSelect = document.getElementById('layer-heading-mode');
    if (layerHeadingSelect) layerHeadingSelect.value = 'smoothTransition';

    if (typeof updateHyperlapseKeyframeVisuals === 'function') {
      updateHyperlapseKeyframeVisuals();
    }

  } else if (gridType === 'light-art') {
    const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
    if (activeLayer && activeLayer.pattern !== 'road-following') roadWaypoints = [];
    if (gridGeometrySection) {
      gridGeometrySection.style.display = 'block';
      gridGeometrySection.classList.remove('collapsed');
    }
    if (layerCardGeometry) layerCardGeometry.style.display = 'block';
    if (layerCardGeometryTitle) layerCardGeometryTitle.textContent = "🎨 Light Art Sky Canvas";
    if (layerCardFlight) layerCardFlight.style.display = 'block';
    if (layerCardOptics) layerCardOptics.style.display = 'none'; // Ground camera shoots the scene; drone camera not primary
    if (layerCardModes) layerCardModes.style.display = 'block';
    if (layerCardBoundary) {
      layerCardBoundary.classList.add('hidden');
      layerCardBoundary.style.display = 'none';
    }
    if (layerCardFiducial) {
      layerCardFiducial.classList.add('hidden');
      layerCardFiducial.style.display = 'none';
    }
    if (altitudeControlGroup) altitudeControlGroup.style.display = 'block';
    if (lightArtContainer) lightArtContainer.classList.remove('hidden');
    if (hyperlapseContainer) hyperlapseContainer.classList.add('hidden');
    if (photoSphereContainer) photoSphereContainer.classList.add('hidden');
    if (towerGeometryContainer) towerGeometryContainer.classList.add('hidden');
    if (targetSplatContainer) targetSplatContainer.classList.add('hidden');
    if (roadOffsetContainer) roadOffsetContainer.classList.add('hidden');
    if (roadSnapContainer) roadSnapContainer.classList.add('hidden');
    if (exclusionAltContainer) exclusionAltContainer.classList.add('hidden');
    if (exclusionFreeformNote) exclusionFreeformNote.classList.add('hidden');
    if (freeformInstructions) freeformInstructions.classList.add('hidden');
    if (widthContainer) widthContainer.style.display = 'none';
    if (heightContainer) heightContainer.style.display = 'none';
    if (rotationContainer) rotationContainer.style.display = 'none';
    if (frontOverlapContainer) frontOverlapContainer.style.display = 'none';
    if (sideOverlapContainer) sideOverlapContainer.style.display = 'none';

    if (activeLayer) {
      if (activeLayer.captureMode === undefined || activeLayer.captureMode === 'inherit') activeLayer.captureMode = 'continuous';
      if (activeLayer.pathMode === undefined || activeLayer.pathMode === 'inherit') activeLayer.pathMode = 'curved';
      if (activeLayer.headingMode === undefined || activeLayer.headingMode === 'inherit') activeLayer.headingMode = 'followWayline';
      if (activeLayer.hoverTime === undefined || activeLayer.hoverTime === 'inherit') activeLayer.hoverTime = 0;
      if (activeLayer.autoSettlingEnabled === undefined) activeLayer.autoSettlingEnabled = false;
      if (!activeLayer.speed || activeLayer.speed > 5) {
        activeLayer.speed = 3.0; // Smooth steady light stroke
        const spdInput = document.getElementById('speed');
        if (spdInput) spdInput.value = 3.0;
      }
    }
    const layerCapSelect = document.getElementById('layer-capture-mode');
    if (layerCapSelect) layerCapSelect.value = (activeLayer && activeLayer.captureMode) ? activeLayer.captureMode : 'continuous';
    const layerPathSelect = document.getElementById('layer-path-mode');
    if (layerPathSelect) layerPathSelect.value = (activeLayer && activeLayer.pathMode) ? activeLayer.pathMode : 'curved';
    const layerHeadingSelect = document.getElementById('layer-heading-mode');
    if (layerHeadingSelect) layerHeadingSelect.value = (activeLayer && activeLayer.headingMode) ? activeLayer.headingMode : 'followWayline';

  } else if (gridType === 'vertical-facade') {
    const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
    if (activeLayer && activeLayer.pattern !== 'road-following') roadWaypoints = [];
    if (gridGeometrySection) {
      gridGeometrySection.style.display = 'block';
      gridGeometrySection.classList.remove('collapsed');
    }
    if (layerCardGeometry) layerCardGeometry.style.display = 'block';
    if (layerCardGeometryTitle) layerCardGeometryTitle.textContent = "📐 Vertical Facade Geometry";
    if (layerCardFlight) layerCardFlight.style.display = 'block';
    if (layerCardOptics) layerCardOptics.style.display = 'block';
    if (layerCardModes) layerCardModes.style.display = 'block';
    if (layerCardBoundary) {
      layerCardBoundary.classList.add('hidden');
      layerCardBoundary.style.display = 'none';
    }
    if (layerCardFiducial) {
      layerCardFiducial.classList.add('hidden');
      layerCardFiducial.style.display = 'none';
    }
    if (verticalFacadeContainer) verticalFacadeContainer.classList.remove('hidden');
    if (continuousHelixContainer) continuousHelixContainer.classList.add('hidden');
    if (towerGeometryContainer) towerGeometryContainer.classList.add('hidden');
    if (targetSplatContainer) targetSplatContainer.classList.add('hidden');
    if (photoSphereContainer) photoSphereContainer.classList.add('hidden');
    if (hyperlapseContainer) hyperlapseContainer.classList.add('hidden');
    if (lightArtContainer) lightArtContainer.classList.add('hidden');
    if (roadOffsetContainer) roadOffsetContainer.classList.add('hidden');
    if (roadSnapContainer) roadSnapContainer.classList.add('hidden');
    if (exclusionAltContainer) exclusionAltContainer.classList.add('hidden');
    if (exclusionFreeformNote) exclusionFreeformNote.classList.add('hidden');
    if (freeformInstructions) freeformInstructions.classList.add('hidden');
    if (altitudeControlGroup) altitudeControlGroup.style.display = 'none';
    if (widthContainer) widthContainer.style.display = 'none';
    if (heightContainer) heightContainer.style.display = 'none';
    if (rotationContainer) rotationContainer.style.display = 'block';
    if (frontOverlapContainer) frontOverlapContainer.style.display = 'block';
    if (sideOverlapContainer) sideOverlapContainer.style.display = 'block';

    if (gimbalPitchSlider && (!gimbalPitchSlider.value || parseFloat(gimbalPitchSlider.value) === -90)) {
      gimbalPitchSlider.value = 0;
      if (typeof updateGimbalPitchVisualizer === 'function') {
        updateGimbalPitchVisualizer(0);
      }
    }

  } else if (gridType === 'continuous-helix') {
    const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
    if (activeLayer && activeLayer.pattern !== 'road-following') roadWaypoints = [];
    if (gridGeometrySection) {
      gridGeometrySection.style.display = 'block';
      gridGeometrySection.classList.remove('collapsed');
    }
    if (layerCardGeometry) layerCardGeometry.style.display = 'block';
    if (layerCardGeometryTitle) layerCardGeometryTitle.textContent = "🌀 Continuous Helix Dynamics";
    if (layerCardFlight) layerCardFlight.style.display = 'block';
    if (layerCardOptics) layerCardOptics.style.display = 'block';
    if (layerCardModes) layerCardModes.style.display = 'block';
    if (layerCardBoundary) {
      layerCardBoundary.classList.add('hidden');
      layerCardBoundary.style.display = 'none';
    }
    if (layerCardFiducial) {
      layerCardFiducial.classList.add('hidden');
      layerCardFiducial.style.display = 'none';
    }
    if (continuousHelixContainer) continuousHelixContainer.classList.remove('hidden');
    if (verticalFacadeContainer) verticalFacadeContainer.classList.add('hidden');
    if (towerGeometryContainer) towerGeometryContainer.classList.add('hidden');
    if (targetSplatContainer) targetSplatContainer.classList.add('hidden');
    if (photoSphereContainer) photoSphereContainer.classList.add('hidden');
    if (hyperlapseContainer) hyperlapseContainer.classList.add('hidden');
    if (lightArtContainer) lightArtContainer.classList.add('hidden');
    if (roadOffsetContainer) roadOffsetContainer.classList.add('hidden');
    if (roadSnapContainer) roadSnapContainer.classList.add('hidden');
    if (exclusionAltContainer) exclusionAltContainer.classList.add('hidden');
    if (exclusionFreeformNote) exclusionFreeformNote.classList.add('hidden');
    if (freeformInstructions) freeformInstructions.classList.add('hidden');
    if (altitudeControlGroup) altitudeControlGroup.style.display = 'none';
    if (widthContainer) widthContainer.style.display = 'none';
    if (heightContainer) heightContainer.style.display = 'none';
    if (rotationContainer) rotationContainer.style.display = 'none';
    if (frontOverlapContainer) frontOverlapContainer.style.display = 'none';
    if (sideOverlapContainer) sideOverlapContainer.style.display = 'none';

    if (activeLayer) {
      activeLayer.pathMode = 'curved';
      activeLayer.turnMode = 'curved';
      activeLayer.captureMode = 'continuous';
    }
    const layerPathSelect = document.getElementById('layer-path-mode');
    if (layerPathSelect) layerPathSelect.value = 'curved';

  } else if (gridType === 'dome-shell') {
    const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
    if (activeLayer && activeLayer.pattern !== 'road-following') roadWaypoints = [];
    if (gridGeometrySection) {
      gridGeometrySection.style.display = 'block';
      gridGeometrySection.classList.remove('collapsed');
    }
    if (layerCardGeometry) layerCardGeometry.style.display = 'block';
    if (layerCardGeometryTitle) layerCardGeometryTitle.textContent = "🌐 Dome Shell Geometry";
    if (layerCardFlight) layerCardFlight.style.display = 'block';
    if (layerCardOptics) layerCardOptics.style.display = 'block';
    if (layerCardModes) layerCardModes.style.display = 'block';
    if (domeShellContainer) domeShellContainer.classList.remove('hidden');
    if (altitudeControlGroup) altitudeControlGroup.style.display = 'block';
    if (widthContainer) widthContainer.style.display = 'none';
    if (heightContainer) heightContainer.style.display = 'none';
    if (rotationContainer) rotationContainer.style.display = 'none';
    if (frontOverlapContainer) frontOverlapContainer.style.display = 'none';
    if (sideOverlapContainer) sideOverlapContainer.style.display = 'none';
    if (activeLayer) activeLayer.headingMode = 'towardCenter';

  } else if (gridType === 'polygon-grid') {
    const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
    if (activeLayer && activeLayer.pattern !== 'road-following') roadWaypoints = [];
    if (gridGeometrySection) {
      gridGeometrySection.style.display = 'block';
      gridGeometrySection.classList.remove('collapsed');
    }
    if (layerCardGeometry) layerCardGeometry.style.display = 'block';
    if (layerCardGeometryTitle) layerCardGeometryTitle.textContent = "📐 Polygon Grid Geometry";
    if (layerCardFlight) layerCardFlight.style.display = 'block';
    if (layerCardOptics) layerCardOptics.style.display = 'block';
    if (layerCardModes) layerCardModes.style.display = 'block';
    if (polygonGridContainer) polygonGridContainer.classList.remove('hidden');
    if (altitudeControlGroup) altitudeControlGroup.style.display = 'block';
    if (widthContainer) widthContainer.style.display = 'none';
    if (heightContainer) heightContainer.style.display = 'none';
    if (rotationContainer) rotationContainer.style.display = 'block';
    if (frontOverlapContainer) frontOverlapContainer.style.display = 'block';
    if (sideOverlapContainer) sideOverlapContainer.style.display = 'block';

  } else if (gridType === 'sar-search') {
    const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
    if (activeLayer && activeLayer.pattern !== 'road-following') roadWaypoints = [];
    if (gridGeometrySection) {
      gridGeometrySection.style.display = 'block';
      gridGeometrySection.classList.remove('collapsed');
    }
    if (layerCardGeometry) layerCardGeometry.style.display = 'block';
    if (layerCardGeometryTitle) layerCardGeometryTitle.textContent = "🛟 Search & Rescue Geometry";
    if (layerCardFlight) layerCardFlight.style.display = 'block';
    if (layerCardOptics) layerCardOptics.style.display = 'block';
    if (layerCardModes) layerCardModes.style.display = 'block';
    if (sarSearchContainer) sarSearchContainer.classList.remove('hidden');
    if (altitudeControlGroup) altitudeControlGroup.style.display = 'block';
    if (widthContainer) widthContainer.style.display = 'none';
    if (heightContainer) heightContainer.style.display = 'none';
    if (rotationContainer) rotationContainer.style.display = 'none';
    if (frontOverlapContainer) frontOverlapContainer.style.display = 'none';
    if (sideOverlapContainer) sideOverlapContainer.style.display = 'none';

  } else if (gridType === 'perimeter-patrol') {
    const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
    if (activeLayer && activeLayer.pattern !== 'road-following') roadWaypoints = [];
    if (gridGeometrySection) {
      gridGeometrySection.style.display = 'block';
      gridGeometrySection.classList.remove('collapsed');
    }
    if (layerCardGeometry) layerCardGeometry.style.display = 'block';
    if (layerCardGeometryTitle) layerCardGeometryTitle.textContent = "🛡️ Perimeter Patrol Geometry";
    if (layerCardFlight) layerCardFlight.style.display = 'block';
    if (layerCardOptics) layerCardOptics.style.display = 'block';
    if (layerCardModes) layerCardModes.style.display = 'block';
    if (perimeterPatrolContainer) perimeterPatrolContainer.classList.remove('hidden');
    if (altitudeControlGroup) altitudeControlGroup.style.display = 'block';
    if (widthContainer) widthContainer.style.display = 'none';
    if (heightContainer) heightContainer.style.display = 'none';
    if (rotationContainer) rotationContainer.style.display = 'none';
    if (frontOverlapContainer) frontOverlapContainer.style.display = 'none';
    if (sideOverlapContainer) sideOverlapContainer.style.display = 'none';

  } else if (gridType === 'cinematic-reveal') {
    const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
    if (activeLayer && activeLayer.pattern !== 'road-following') roadWaypoints = [];
    if (gridGeometrySection) {
      gridGeometrySection.style.display = 'block';
      gridGeometrySection.classList.remove('collapsed');
    }
    if (layerCardGeometry) layerCardGeometry.style.display = 'block';
    if (layerCardGeometryTitle) layerCardGeometryTitle.textContent = "🎬 Cinematic Camera Path";
    if (layerCardFlight) layerCardFlight.style.display = 'block';
    if (layerCardOptics) layerCardOptics.style.display = 'block';
    if (layerCardModes) layerCardModes.style.display = 'block';
    if (cinematicRevealContainer) cinematicRevealContainer.classList.remove('hidden');
    if (altitudeControlGroup) altitudeControlGroup.style.display = 'none';
    if (widthContainer) widthContainer.style.display = 'none';
    if (heightContainer) heightContainer.style.display = 'none';
    if (rotationContainer) rotationContainer.style.display = 'none';
    if (frontOverlapContainer) frontOverlapContainer.style.display = 'none';
    if (sideOverlapContainer) sideOverlapContainer.style.display = 'none';
    if (activeLayer) {
      activeLayer.captureMode = 'continuous';
      activeLayer.pathMode = 'curved';
      activeLayer.headingMode = 'towardCenter';
    }

  } else if (gridType === 'star-pass') {
    const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
    if (activeLayer && activeLayer.pattern !== 'road-following') roadWaypoints = [];
    if (gridGeometrySection) {
      gridGeometrySection.style.display = 'block';
      gridGeometrySection.classList.remove('collapsed');
    }
    if (layerCardGeometry) layerCardGeometry.style.display = 'block';
    if (layerCardGeometryTitle) layerCardGeometryTitle.textContent = "⭐ Star Pass Geometry";
    if (layerCardFlight) layerCardFlight.style.display = 'block';
    if (layerCardOptics) layerCardOptics.style.display = 'block';
    if (layerCardModes) layerCardModes.style.display = 'block';
    if (layerCardBoundary) {
      layerCardBoundary.classList.add('hidden');
      layerCardBoundary.style.display = 'none';
    }
    if (layerCardFiducial) {
      layerCardFiducial.classList.add('hidden');
      layerCardFiducial.style.display = 'none';
    }
    if (starPassContainer) starPassContainer.classList.remove('hidden');
    if (continuousHelixContainer) continuousHelixContainer.classList.add('hidden');
    if (verticalFacadeContainer) verticalFacadeContainer.classList.add('hidden');
    if (towerGeometryContainer) towerGeometryContainer.classList.add('hidden');
    if (targetSplatContainer) targetSplatContainer.classList.add('hidden');
    if (photoSphereContainer) photoSphereContainer.classList.add('hidden');
    if (hyperlapseContainer) hyperlapseContainer.classList.add('hidden');
    if (lightArtContainer) lightArtContainer.classList.add('hidden');
    if (roadOffsetContainer) roadOffsetContainer.classList.add('hidden');
    if (roadSnapContainer) roadSnapContainer.classList.add('hidden');
    if (exclusionAltContainer) exclusionAltContainer.classList.add('hidden');
    if (exclusionFreeformNote) exclusionFreeformNote.classList.add('hidden');
    if (freeformInstructions) freeformInstructions.classList.add('hidden');
    if (corridorContainer) corridorContainer.classList.add('hidden');
    if (altitudeControlGroup) altitudeControlGroup.style.display = 'block';
    if (widthContainer) widthContainer.style.display = 'none';
    if (heightContainer) heightContainer.style.display = 'none';
    if (rotationContainer) rotationContainer.style.display = 'block';
    if (frontOverlapContainer) frontOverlapContainer.style.display = 'none';
    if (sideOverlapContainer) sideOverlapContainer.style.display = 'none';

  } else if (gridType === 'corridor') {
    const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
    if (activeLayer && activeLayer.pattern !== 'road-following') roadWaypoints = [];
    if (gridGeometrySection) {
      gridGeometrySection.style.display = 'block';
      gridGeometrySection.classList.remove('collapsed');
    }
    if (layerCardGeometry) layerCardGeometry.style.display = 'block';
    if (layerCardGeometryTitle) layerCardGeometryTitle.textContent = "🛣️ Corridor Mapping Geometry";
    if (layerCardFlight) layerCardFlight.style.display = 'block';
    if (layerCardOptics) layerCardOptics.style.display = 'block';
    if (layerCardModes) layerCardModes.style.display = 'block';
    if (layerCardBoundary) {
      layerCardBoundary.classList.add('hidden');
      layerCardBoundary.style.display = 'none';
    }
    if (layerCardFiducial) {
      layerCardFiducial.classList.add('hidden');
      layerCardFiducial.style.display = 'none';
    }
    if (corridorContainer) {
      corridorContainer.classList.remove('hidden');
      if (typeof renderCorridorNodeTable === 'function') renderCorridorNodeTable();
    }
    if (starPassContainer) starPassContainer.classList.add('hidden');
    if (continuousHelixContainer) continuousHelixContainer.classList.add('hidden');
    if (verticalFacadeContainer) verticalFacadeContainer.classList.add('hidden');
    if (towerGeometryContainer) towerGeometryContainer.classList.add('hidden');
    if (targetSplatContainer) targetSplatContainer.classList.add('hidden');
    if (photoSphereContainer) photoSphereContainer.classList.add('hidden');
    if (hyperlapseContainer) hyperlapseContainer.classList.add('hidden');
    if (lightArtContainer) lightArtContainer.classList.add('hidden');
    if (roadOffsetContainer) roadOffsetContainer.classList.add('hidden');
    if (roadSnapContainer) roadSnapContainer.classList.add('hidden');
    if (exclusionAltContainer) exclusionAltContainer.classList.add('hidden');
    if (exclusionFreeformNote) exclusionFreeformNote.classList.add('hidden');
    if (freeformInstructions) {
      const span = freeformInstructions.querySelector('span');
      if (span) span.textContent = "ℹ️ Click map to append centerline nodes. Drag nodes to reshape corridor. Parallel swaths update automatically.";
      freeformInstructions.classList.remove('hidden');
    }
    if (altitudeControlGroup) altitudeControlGroup.style.display = 'block';
    if (widthContainer) widthContainer.style.display = 'none';
    if (heightContainer) heightContainer.style.display = 'none';
    if (rotationContainer) rotationContainer.style.display = 'none';
    if (frontOverlapContainer) frontOverlapContainer.style.display = 'block';
    if (sideOverlapContainer) sideOverlapContainer.style.display = 'none';

  } else {
    if (activeLayer && activeLayer.pattern !== 'road-following') roadWaypoints = [];
    if (gridGeometrySection) gridGeometrySection.style.display = 'block';
    if (layerCardGeometry) layerCardGeometry.style.display = 'block';
    if (layerCardGeometryTitle) layerCardGeometryTitle.textContent = "📐 Coverage & Geometry";
    if (layerCardFlight) layerCardFlight.style.display = 'block';
    if (layerCardOptics) layerCardOptics.style.display = 'block';
    if (layerCardModes) layerCardModes.style.display = 'block';
    if (layerCardBoundary) {
      layerCardBoundary.classList.add('hidden');
      layerCardBoundary.style.display = 'none';
    }
    if (layerCardFiducial) {
      layerCardFiducial.classList.add('hidden');
      layerCardFiducial.style.display = 'none';
    }
    if (corridorContainer) corridorContainer.classList.add('hidden');
    if (starPassContainer) starPassContainer.classList.add('hidden');
    if (towerGeometryContainer) towerGeometryContainer.classList.add('hidden');
    if (targetSplatContainer) targetSplatContainer.classList.add('hidden');
    if (verticalFacadeContainer) verticalFacadeContainer.classList.add('hidden');
    if (continuousHelixContainer) continuousHelixContainer.classList.add('hidden');
    if (roadOffsetContainer) roadOffsetContainer.classList.add('hidden');
    if (roadSnapContainer) roadSnapContainer.classList.add('hidden');
    if (exclusionAltContainer) exclusionAltContainer.classList.add('hidden');
    if (exclusionFreeformNote) exclusionFreeformNote.classList.add('hidden');
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
      const heightLabel = (heightContainer && heightContainer.querySelector) ? heightContainer.querySelector('.control-label > span') : null;
      if (heightLabel) heightLabel.textContent = "Grid Height";
      if (heightContainer) heightContainer.style.display = 'block';
      if (rotationContainer) rotationContainer.style.display = 'block';
    }
  }

  // Force value displays to synchronize with the new slider values
  syncDisplayValues();

  // Conditionally hide Heading Mode for orbits and photo-spheres (which have fixed procedural headings)
  const headingModeContainer = document.getElementById('heading-mode-container');
  if (headingModeContainer) {
    if (gridType === 'orbit' || gridType === 'multi-orbit' || gridType === 'photo-sphere' || gridType === 'dome-shell' || gridType === 'cinematic-reveal') {
      headingModeContainer.style.display = 'none';
      const helpDrawer = document.getElementById('heading-help-drawer');
      if (helpDrawer) helpDrawer.classList.add('hidden');
    } else {
      headingModeContainer.style.display = 'block';
    }
  }

  const isProcedural = (gridType !== 'freeform' && gridType !== 'road-following' && gridType !== 'hyperlapse');
  if (isProcedural) {
    updateGrid();
  } else {
    isChangingPattern = true;
    updateGrid();
    isChangingPattern = false;
  }

  if (typeof updateLayerHierarchyBadge === 'function') updateLayerHierarchyBadge();
}

// Helper to get descriptive flight purpose and styling for a gimbal pitch angle
function getGimbalPitchDescription(pitch) {
  const isAuto = (pitch === 'auto' || (typeof pitch === 'string' && pitch.toLowerCase() === 'auto'));
  const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
  if (isAuto && activeLayer && activeLayer.pattern === 'road-following') {
    const offsetDist = activeLayer.roadOffset !== undefined ? activeLayer.roadOffset : 15;
    const alt = activeLayer.altitude || 50;
    let autoPitch;
    if (Math.abs(offsetDist) < 0.01) {
      autoPitch = -90;
    } else {
      autoPitch = -Math.round(Math.atan2(alt, Math.max(Math.abs(offsetDist), 1)) * (180.0 / Math.PI));
    }
    return {
      text: `🛣️ Road Focus (${autoPitch}° based on ${Math.abs(offsetDist)}m offset & ${alt}m alt)`,
      bg: 'rgba(6, 182, 212, 0.15)',
      border: 'rgba(6, 182, 212, 0.4)',
      color: 'var(--accent-cyan)'
    };
  }

  if (isAuto) {
    const targetPoi = (typeof getTargetPoiCoordinates === 'function') ? getTargetPoiCoordinates(null, activeLayer) : null;
    const targetAlt = (targetPoi && targetPoi.alt !== undefined && !isNaN(targetPoi.alt)) ? Number(targetPoi.alt) : 0;
    const unit = (typeof getUnitSystem === 'function') ? getUnitSystem() : 'metric';
    const dispAlt = unit === 'imperial' ? `${Math.round(targetAlt * M_TO_FT)} ft` : `${Math.round(targetAlt)}m`;
    return {
      text: `🎯 3D POI Tracking (Target: ${dispAlt} AGL)`,
      bg: 'rgba(6, 182, 212, 0.15)',
      border: 'rgba(6, 182, 212, 0.4)',
      color: 'var(--accent-cyan)'
    };
  }
  const p = Math.round(pitch);
  if (p > 0) {
    return {
      text: '🏗️ Upward Tilt (Bridge, Tower & Canopy Inspection)',
      bg: 'rgba(59, 130, 246, 0.15)',
      border: 'rgba(59, 130, 246, 0.35)',
      color: '#60a5fa'
    };
  } else if (p === 0) {
    return {
      text: '🔭 Level Horizon (Inspection & Panoramic)',
      bg: 'rgba(249, 115, 22, 0.12)',
      border: 'rgba(249, 115, 22, 0.3)',
      color: '#fb923c'
    };
  } else if (p >= -44) {
    return {
      text: '🎥 Shallow Oblique (Cinematic & Facades)',
      bg: 'rgba(245, 158, 11, 0.12)',
      border: 'rgba(245, 158, 11, 0.3)',
      color: '#fbbf24'
    };
  } else if (p >= -69) {
    return {
      text: '✨ 3D Oblique (Gaussian Splats & Photogrammetry)',
      bg: 'rgba(168, 85, 247, 0.15)',
      border: 'rgba(168, 85, 247, 0.35)',
      color: '#c084fc'
    };
  } else if (p >= -84) {
    return {
      text: '🏠 Steep Oblique (Rooftops & Footprints)',
      bg: 'rgba(16, 185, 129, 0.12)',
      border: 'rgba(16, 185, 129, 0.3)',
      color: '#34d399'
    };
  } else {
    return {
      text: '📐 True Nadir (Orthomosaic 2D Mapping)',
      bg: 'rgba(6, 182, 212, 0.12)',
      border: 'rgba(6, 182, 212, 0.3)',
      color: 'var(--accent-cyan)'
    };
  }
}

// Dynamically update the live Gimbal Pitch diagram, FOV sight cone, preset chips, and badge
function updateGimbalPitchVisualizer(pitch) {
  if (typeof document === 'undefined' || !document || !document.getElementById) return;
  const isAuto = (pitch === 'auto' || (typeof pitch === 'string' && pitch.toLowerCase() === 'auto'));
  const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
  const isRoad = activeLayer && activeLayer.pattern === 'road-following';
  let roadAutoPitch = null;
  if (isRoad) {
    const offsetDist = activeLayer.roadOffset !== undefined ? activeLayer.roadOffset : 15;
    const alt = activeLayer.altitude || 50;
    if (Math.abs(offsetDist) < 0.01) {
      roadAutoPitch = -90;
    } else {
      roadAutoPitch = -Math.round(Math.atan2(alt, Math.max(Math.abs(offsetDist), 1)) * (180.0 / Math.PI));
    }
  }

  let pVal;
  if (isAuto) {
    if (isRoad && roadAutoPitch !== null) {
      pVal = roadAutoPitch;
    } else {
      const targetPoi = (typeof getTargetPoiCoordinates === 'function') ? getTargetPoiCoordinates(null, activeLayer) : null;
      pVal = (typeof calculate3DPoiPitch === 'function')
        ? calculate3DPoiPitch(null, targetPoi, activeLayer?.altitude || 50)
        : -45;
    }
  } else {
    pVal = isNaN(pitch) ? -60 : parseFloat(pitch);
  }
  const beta = -pVal; // Downward angle in degrees: negative beta is upward, positive is downward

  // 1. Update Purpose Badge
  const purposeBadge = document.getElementById('gimbal-pitch-purpose-badge');
  if (purposeBadge) {
    const desc = getGimbalPitchDescription(isAuto ? 'auto' : pVal);
    purposeBadge.textContent = desc.text;
    purposeBadge.style.backgroundColor = desc.bg;
    purposeBadge.style.borderColor = desc.border;
    purposeBadge.style.color = desc.color;
  }

  // 2. Highlight matching preset chip
  const chips = (typeof document.querySelectorAll === 'function') ? document.querySelectorAll('.gimbal-preset-chip') : [];
  if (chips && chips.forEach) {
    // Update auto preset chip label if on road-following
    chips.forEach(chip => {
      const rawTarget = chip.dataset ? chip.dataset.pitch : chip.getAttribute('data-pitch');
      if (rawTarget === 'auto') {
        if (isRoad) {
          chip.textContent = '🎯 Auto Road';
          chip.title = `Automatically track road surface (${roadAutoPitch}° tilt)`;
        } else {
          chip.textContent = '🎯 Auto POI';
          chip.title = 'Automatically track 3D Point of Interest elevation';
        }
      }

      let isMatch = false;
      if (isAuto) {
        isMatch = (rawTarget === 'auto');
      } else {
        const targetPitch = parseFloat(rawTarget);
        isMatch = (rawTarget !== 'auto' && Math.abs(targetPitch - pVal) < 1.0);
      }

      if (isMatch) {
        if (chip.classList && chip.classList.add) chip.classList.add('active');
        if (chip.style) {
          chip.style.backgroundColor = 'rgba(6, 182, 212, 0.15)';
          chip.style.borderColor = 'rgba(6, 182, 212, 0.4)';
          chip.style.color = 'var(--accent-cyan)';
        }
      } else {
        if (chip.classList && chip.classList.remove) chip.classList.remove('active');
        if (chip.style) {
          chip.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
          chip.style.borderColor = 'var(--border-color)';
          chip.style.color = 'var(--text-muted)';
        }
      }
    });
  }

  // 3. Update Camera Gimbal Node Rotation
  const cameraNode = document.getElementById('gimbal-camera-node');
  if (cameraNode && cameraNode.setAttribute) {
    cameraNode.setAttribute('transform', `translate(48, 38) rotate(${beta})`);
  }

  // 4. Update Optical Sight Ray and Sight Cone
  const x0 = 48;
  const y0 = 38;
  const groundY = 82;
  const skyY = 6;
  const rightX = 210;
  const rad = (beta * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);

  let tCenter;
  if (dy > 0.001) {
    tCenter = Math.min(180, (groundY - y0) / dy, (rightX - x0) / Math.max(0.001, dx));
  } else if (dy < -0.001) {
    tCenter = Math.min(180, (skyY - y0) / dy, (rightX - x0) / Math.max(0.001, dx));
  } else {
    tCenter = (rightX - x0);
  }
  const xCenter = Math.min(rightX, Math.max(10, x0 + tCenter * dx));
  const yCenter = Math.min(groundY, Math.max(skyY, y0 + tCenter * dy));

  const sightRay = document.getElementById('gimbal-sight-ray');
  if (sightRay && sightRay.setAttribute) {
    sightRay.setAttribute('x1', x0.toString());
    sightRay.setAttribute('y1', y0.toString());
    sightRay.setAttribute('x2', xCenter.toFixed(1));
    sightRay.setAttribute('y2', yCenter.toFixed(1));
  }

  // Calculate FOV cone spread (half angle approx 20°)
  const beta1 = beta - 20;
  const beta2 = beta + 20;
  const r1 = (beta1 * Math.PI) / 180;
  const r2 = (beta2 * Math.PI) / 180;

  const dx1 = Math.cos(r1);
  const dy1 = Math.sin(r1);
  let t1;
  if (dy1 > 0.001) {
    t1 = Math.min(180, (groundY - y0) / dy1, (rightX - x0) / Math.max(0.001, dx1));
  } else if (dy1 < -0.001) {
    t1 = Math.min(180, (skyY - y0) / dy1, (rightX - x0) / Math.max(0.001, dx1));
  } else {
    t1 = (rightX - x0);
  }
  const x1 = Math.min(rightX, Math.max(10, x0 + t1 * dx1));
  const y1 = Math.min(groundY, Math.max(skyY, y0 + t1 * dy1));

  const dx2 = Math.cos(r2);
  const dy2 = Math.sin(r2);
  let t2;
  if (dy2 > 0.001) {
    t2 = Math.min(180, (groundY - y0) / dy2, (rightX - x0) / Math.max(0.001, dx2));
  } else if (dy2 < -0.001) {
    t2 = Math.min(180, (skyY - y0) / dy2, (rightX - x0) / Math.max(0.001, dx2));
  } else {
    t2 = (rightX - x0);
  }
  const x2 = Math.min(rightX, Math.max(10, x0 + t2 * dx2));
  const y2 = Math.min(groundY, Math.max(skyY, y0 + t2 * dy2));

  const fovCone = document.getElementById('gimbal-fov-cone');
  if (fovCone && fovCone.setAttribute) {
    fovCone.setAttribute('points', `${x0},${y0} ${x1.toFixed(1)},${y1.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`);
  }

  // 5. Update Angle Arc & Angle Text
  const arcEl = document.getElementById('gimbal-angle-arc');
  const angleTextEl = document.getElementById('gimbal-angle-text');

  if (arcEl && angleTextEl && arcEl.setAttribute && angleTextEl.setAttribute) {
    if (Math.abs(beta) > 4) {
      const arcR = 24;
      const xArc = x0 + arcR * Math.cos(rad);
      const yArc = y0 + arcR * Math.sin(rad);
      const sweepFlag = beta > 0 ? 1 : 0;
      arcEl.setAttribute('d', `M ${x0 + arcR},${y0} A ${arcR},${arcR} 0 0,${sweepFlag} ${xArc.toFixed(1)},${yArc.toFixed(1)}`);
      arcEl.style.display = 'block';

      const midRad = (rad / 2);
      const textR = 34;
      const xText = x0 + textR * Math.cos(midRad);
      const yText = y0 + textR * Math.sin(midRad) + (beta > 0 ? 3 : -2);
      angleTextEl.setAttribute('x', xText.toFixed(1));
      angleTextEl.setAttribute('y', yText.toFixed(1));
      angleTextEl.textContent = `${pVal > 0 ? '+' : ''}${Math.round(pVal)}°`;
      angleTextEl.style.display = 'block';
    } else {
      arcEl.style.display = 'none';
      angleTextEl.setAttribute('x', '80');
      angleTextEl.setAttribute('y', '34');
      angleTextEl.textContent = '0° (Horizon)';
      angleTextEl.style.display = 'block';
    }
  }
}

// Sync slider labels with actual slider values
function syncDisplayValues() {
  if (typeof document === 'undefined' || !document || !document.getElementById) return;
  const gridTypeEl = document.getElementById('grid-type');
  if (!gridTypeEl) return;
  const gridType = gridTypeEl.value;
  const unit = (typeof getUnitSystem === 'function') ? getUnitSystem() : 'metric';
  
  const distUnitStr = unit === 'imperial' ? 'ft' : 'm';
  const speedUnitStr = unit === 'imperial' ? 'mph' : 'm/s';

  // Sync Header Unit Badge
  const headerUnitBadge = document.getElementById('header-unit-badge');
  if (headerUnitBadge) {
    headerUnitBadge.textContent = unit === 'imperial' ? 'FT / MPH' : 'M / M/S';
  }

  const widthVal = parseFloat(document.getElementById('grid-width')?.value) || 100;
  const rotationVal = parseFloat(document.getElementById('grid-rotation')?.value) || 0;
  const altitudeVal = parseFloat(document.getElementById('altitude')?.value) || 50;
  const speedVal = parseFloat(document.getElementById('speed')?.value) || 4;

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
  const widthValEl = document.getElementById('width-val');
  const widthUnitEl = document.getElementById('width-unit');
  if (widthValEl) widthValEl.textContent = (unit === 'imperial') ? Math.round(widthVal * M_TO_FT) : widthVal;
  if (widthUnitEl) widthUnitEl.textContent = (unit === 'imperial') ? "ft" : "m";

  // Update Grid Height
  const heightVal = parseFloat(document.getElementById('grid-height')?.value) || 100;
  const heightValEl = document.getElementById('height-val');
  const heightUnitEl = document.getElementById('height-unit');
  if (heightValEl) heightValEl.textContent = (unit === 'imperial') ? Math.round(heightVal * M_TO_FT) : heightVal;
  if (heightUnitEl) heightUnitEl.textContent = (unit === 'imperial') ? "ft" : "m";

  // Update Rotation
  const rotationValEl = document.getElementById('rotation-val');
  if (rotationValEl) {
    rotationValEl.textContent = rotationVal;
  }

  // Update Overlaps and Gimbal Pitch
  const frontOverlapEl = document.getElementById('front-overlap');
  const frontOverlapValEl = document.getElementById('front-overlap-val');
  if (frontOverlapEl && frontOverlapValEl) frontOverlapValEl.textContent = frontOverlapEl.value;
  const sideOverlapEl = document.getElementById('side-overlap');
  const sideOverlapValEl = document.getElementById('side-overlap-val');
  if (sideOverlapEl && sideOverlapValEl) sideOverlapValEl.textContent = sideOverlapEl.value;
  
  const gimbalPitchEl = document.getElementById('gimbal-pitch');
  if (gimbalPitchEl) {
    const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
    const isAuto = activeLayer && (activeLayer.gimbalPitch === 'auto');
    const gimbalPitchValEl = document.getElementById('gimbal-pitch-val');
    if (isAuto) {
      if (gimbalPitchValEl) gimbalPitchValEl.textContent = 'Auto 🎯';
      updateGimbalPitchVisualizer('auto');
    } else {
      const pitchVal = parseFloat(gimbalPitchEl.value);
      if (gimbalPitchValEl) gimbalPitchValEl.textContent = gimbalPitchEl.value;
      updateGimbalPitchVisualizer(pitchVal);
    }
  }

  // Sync Camera Aspect Ratio, HFOV, VFOV, and Zoom
  const aspectSelect = document.getElementById('camera-aspect-ratio');
  if (aspectSelect && aspectSelect.value && aspectSelect.value !== CAMERA_ASPECT_RATIO) {
    setCameraAspectRatio(aspectSelect.value, true);
  }
  const layerOpticsBadge = document.getElementById('layer-optics-aspect-display');
  if (layerOpticsBadge) {
    if (CAMERA_ASPECT_RATIO === '16:9') {
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
  const hfovSlider = document.getElementById('camera-hfov');
  const vfovSlider = document.getElementById('camera-vfov');
  const zoomSlider = document.getElementById('camera-zoom');
  if (hfovSlider && vfovSlider) {
    const parsedH = parseFloat(hfovSlider.value);
    const parsedV = parseFloat(vfovSlider.value);
    if (!isNaN(parsedH) && parsedH > 0) CAMERA_HFOV = parsedH;
    if (!isNaN(parsedV) && parsedV > 0) CAMERA_VFOV = parsedV;
    const hValEl = document.getElementById('camera-hfov-val');
    const vValEl = document.getElementById('camera-vfov-val');
    if (hValEl) hValEl.textContent = hfovSlider.value;
    if (vValEl) vValEl.textContent = vfovSlider.value;
  }
  if (zoomSlider) {
    const zoomValEl = document.getElementById('camera-zoom-val');
    if (zoomValEl) zoomValEl.textContent = parseFloat(zoomSlider.value).toFixed(1);
  }

  // Update Altitude
  const altValEl = document.getElementById('altitude-val');
  const altUnitEl = document.getElementById('altitude-unit');
  if (altValEl) altValEl.textContent = (unit === 'imperial') ? Math.round(altitudeVal * M_TO_FT) : altitudeVal;
  if (altUnitEl) altUnitEl.textContent = (unit === 'imperial') ? "ft" : "m";

  // Update Speed
  const speedValEl = document.getElementById('speed-val');
  const speedUnitEl = document.getElementById('speed-unit');
  if (speedValEl) speedValEl.textContent = (unit === 'imperial') ? (speedVal * MPS_TO_MPH).toFixed(1) : (Math.round(speedVal * 10) / 10).toFixed(speedVal % 1 !== 0 ? 1 : 0);
  if (speedUnitEl) speedUnitEl.textContent = (unit === 'imperial') ? "mph" : "m/s";

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

  // Sync Tower Inspection Parameters
  const towerRadiusSlider = document.getElementById('tower-radius');
  const towerRadiusValEl = document.getElementById('tower-radius-val');
  const towerRadiusUnitEl = document.getElementById('tower-radius-unit');
  if (towerRadiusSlider && towerRadiusValEl && towerRadiusUnitEl) {
    const radVal = parseFloat(towerRadiusSlider.value) || 30;
    if (unit === 'imperial') {
      towerRadiusValEl.textContent = Math.round(radVal * M_TO_FT);
      towerRadiusUnitEl.textContent = "ft";
    } else {
      towerRadiusValEl.textContent = radVal;
      towerRadiusUnitEl.textContent = "m";
    }
  }

  const towerMinHSlider = document.getElementById('tower-min-height');
  const towerMinHValEl = document.getElementById('tower-min-height-val');
  const towerMinHUnitEl = document.getElementById('tower-min-height-unit');
  if (towerMinHSlider && towerMinHValEl && towerMinHUnitEl) {
    const minHVal = parseFloat(towerMinHSlider.value) || 20;
    if (unit === 'imperial') {
      towerMinHValEl.textContent = Math.round(minHVal * M_TO_FT);
      towerMinHUnitEl.textContent = "ft";
    } else {
      towerMinHValEl.textContent = minHVal;
      towerMinHUnitEl.textContent = "m";
    }
  }

  const towerMaxHSlider = document.getElementById('tower-max-height');
  const towerMaxHValEl = document.getElementById('tower-max-height-val');
  const towerMaxHUnitEl = document.getElementById('tower-max-height-unit');
  if (towerMaxHSlider && towerMaxHValEl && towerMaxHUnitEl) {
    const maxHVal = parseFloat(towerMaxHSlider.value) || 100;
    if (unit === 'imperial') {
      towerMaxHValEl.textContent = Math.round(maxHVal * M_TO_FT);
      towerMaxHUnitEl.textContent = "ft";
    } else {
      towerMaxHValEl.textContent = maxHVal;
      towerMaxHUnitEl.textContent = "m";
    }
  }

  const towerGuyBufSlider = document.getElementById('tower-guy-wire-buffer');
  const towerGuyBufValEl = document.getElementById('tower-guy-wire-buffer-val');
  const towerGuyBufUnitEl = document.getElementById('tower-guy-wire-buffer-unit');
  if (towerGuyBufSlider && towerGuyBufValEl && towerGuyBufUnitEl) {
    const bufVal = parseFloat(towerGuyBufSlider.value) || 0;
    if (unit === 'imperial') {
      towerGuyBufValEl.textContent = Math.round(bufVal * M_TO_FT);
      towerGuyBufUnitEl.textContent = "ft";
    } else {
      towerGuyBufValEl.textContent = bufVal;
      towerGuyBufUnitEl.textContent = "m";
    }
  }

  // Sync 3D Exclusion Zone Altitudes
  const exclAllAltEl = document.getElementById('exclusion-all-altitudes');
  const exclAllAltLabel = document.getElementById('exclusion-all-alt-label');
  const exclSliders = document.getElementById('exclusion-altitude-sliders');
  const exclHint = document.getElementById('exclusion-alt-hint');
  const exclMinValEl = document.getElementById('exclusion-min-alt-val');
  const exclMaxValEl = document.getElementById('exclusion-max-alt-val');
  const exclMinUnitEl = document.getElementById('exclusion-min-alt-unit');
  const exclMaxUnitEl = document.getElementById('exclusion-max-alt-unit');
  const exclMinInput = document.getElementById('exclusion-min-alt');
  const exclMaxInput = document.getElementById('exclusion-max-alt');

  if (exclAllAltEl && exclSliders && exclHint) {
    const zeroFormatted = (typeof formatDistance === 'function') ? formatDistance(0) : (unit === 'imperial' ? '0 ft' : '0 m');
    if (exclAllAltLabel) {
      exclAllAltLabel.textContent = `All Altitudes (${zeroFormatted} – ∞)`;
    }
    if (exclAllAltEl.checked) {
      exclSliders.classList.add('hidden');
      exclHint.textContent = `Restricts all drone flights across the entire vertical airspace (${zeroFormatted} – ∞).`;
    } else {
      exclSliders.classList.remove('hidden');
      if (exclMinInput && exclMaxInput) {
        const minMeters = parseFloat(exclMinInput.value) || 0;
        const maxMeters = parseFloat(exclMaxInput.value) || 60;
        if (unit === 'imperial') {
          if (exclMinValEl) exclMinValEl.textContent = Math.round(minMeters * M_TO_FT);
          if (exclMaxValEl) exclMaxValEl.textContent = Math.round(maxMeters * M_TO_FT);
          if (exclMinUnitEl) exclMinUnitEl.textContent = "ft";
          if (exclMaxUnitEl) exclMaxUnitEl.textContent = "ft";
        } else {
          if (exclMinValEl) exclMinValEl.textContent = minMeters;
          if (exclMaxValEl) exclMaxValEl.textContent = maxMeters;
          if (exclMinUnitEl) exclMinUnitEl.textContent = "m";
          if (exclMaxUnitEl) exclMaxUnitEl.textContent = "m";
        }
        const minFormatted = (typeof formatDistance === 'function') ? formatDistance(minMeters) : `${minMeters} m`;
        const maxFormatted = (typeof formatDistance === 'function') ? formatDistance(maxMeters) : `${maxMeters} m`;
        exclHint.textContent = `Restricts flights between ${minFormatted} and ${maxFormatted}. Flights outside this envelope are permitted.`;
      }
    }
  }

  // Sync Global Exclusion Detour Clearance Buffer Display
  const globalClearanceSlider = document.getElementById('global-exclusion-clearance-buffer');
  const globalClearanceValEl = document.getElementById('global-exclusion-clearance-val');
  const globalClearanceUnitEl = document.getElementById('global-exclusion-clearance-unit');
  if (globalClearanceSlider && globalClearanceValEl && globalClearanceUnitEl) {
    const cVal = parseFloat(globalClearanceSlider.value) || 5;
    if (unit === 'imperial') {
      globalClearanceValEl.textContent = Math.round(cVal * M_TO_FT);
      globalClearanceUnitEl.textContent = "ft";
    } else {
      globalClearanceValEl.textContent = cVal;
      globalClearanceUnitEl.textContent = "m";
    }
  }

  // Sync Max Flight Altitude Ceiling Display
  const maxHeightSlider = document.getElementById('max-flight-height');
  const maxHeightValEl = document.getElementById('max-height-val');
  const maxHeightUnitEl = document.getElementById('max-height-unit');
  const legalWarningEl = document.getElementById('max-height-legal-warning');
  if (maxHeightSlider) {
    const mhVal = parseFloat(maxHeightSlider.value) || 120;
    if (maxHeightValEl) {
      maxHeightValEl.textContent = (unit === 'imperial') ? Math.round(mhVal * M_TO_FT) : mhVal;
    }
    if (maxHeightUnitEl) {
      maxHeightUnitEl.textContent = distUnitStr;
    }
    if (legalWarningEl) {
      legalWarningEl.style.display = (mhVal > 120) ? 'block' : 'none';
    }
  }

  // Sync Safe RTH Altitude Display
  const rthAltSlider = document.getElementById('rth-altitude');
  const rthAltValEl = document.getElementById('rth-altitude-val');
  const rthAltUnitEl = document.getElementById('rth-altitude-unit');
  if (rthAltSlider) {
    const rthVal = parseFloat(rthAltSlider.value) || 50;
    if (rthAltValEl) {
      rthAltValEl.textContent = (unit === 'imperial') ? Math.round(rthVal * M_TO_FT) : rthVal;
    }
    if (rthAltUnitEl) {
      rthAltUnitEl.textContent = distUnitStr;
    }
  }

  // Sync Target Splat Radius & Height Display + units (v1.77.0, fixed v1.77.4)
  const targetRadSlider = document.getElementById('target-splat-radius');
  const targetRadValEl = document.getElementById('target-radius-val');
  const targetRadUnitEl = document.getElementById('target-radius-unit');
  if (targetRadSlider && targetRadValEl) {
    const rVal = parseFloat(targetRadSlider.value) || 25;
    targetRadValEl.textContent = (unit === 'imperial') ? Math.round(rVal * M_TO_FT) : rVal;
  }
  if (targetRadUnitEl) targetRadUnitEl.textContent = distUnitStr;

  const targetHeightSlider = document.getElementById('target-splat-height');
  const targetHeightValEl = document.getElementById('target-height-val');
  const targetHeightUnitEl = document.getElementById('target-height-unit');
  if (targetHeightSlider && targetHeightValEl) {
    const hVal = parseFloat(targetHeightSlider.value) || 8;
    targetHeightValEl.textContent = (unit === 'imperial') ? Math.round(hVal * M_TO_FT) : hVal;
  }
  if (targetHeightUnitEl) targetHeightUnitEl.textContent = distUnitStr;

  // Sync Perimeter Orbit Pass Display (v1.77.4)
  const perimStandoffSlider = document.getElementById('target-perimeter-standoff');
  const perimStandoffValEl = document.getElementById('target-perimeter-standoff-val');
  const perimStandoffUnitEl = document.getElementById('target-perimeter-standoff-unit');
  if (perimStandoffSlider && perimStandoffValEl) {
    const sVal = parseFloat(perimStandoffSlider.value) || 8;
    perimStandoffValEl.textContent = (unit === 'imperial') ? Math.round(sVal * M_TO_FT) : sVal;
  }
  if (perimStandoffUnitEl) perimStandoffUnitEl.textContent = distUnitStr;

  const perimAltSlider = document.getElementById('target-perimeter-alt');
  const perimAltValEl = document.getElementById('target-perimeter-alt-val');
  const perimAltUnitEl = document.getElementById('target-perimeter-alt-unit');
  if (perimAltSlider && perimAltValEl) {
    const aRaw = parseFloat(perimAltSlider.value);
    if (aRaw === 0 || isNaN(aRaw)) {
      perimAltValEl.textContent = 'Auto';
      if (perimAltUnitEl) perimAltUnitEl.textContent = '';
    } else {
      perimAltValEl.textContent = (unit === 'imperial') ? Math.round(aRaw * M_TO_FT) : aRaw;
      if (perimAltUnitEl) perimAltUnitEl.textContent = distUnitStr;
    }
  }

  const perimPitchSlider = document.getElementById('target-perimeter-pitch');
  const perimPitchValEl = document.getElementById('target-perimeter-pitch-val');
  if (perimPitchSlider && perimPitchValEl) {
    perimPitchValEl.textContent = perimPitchSlider.value;
  }

  const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
  if (activeLayer && activeLayer.pattern === 'target-splat') {
    updateTargetSplatAutoFitUI(activeLayer);
    updateTargetSplatDiagram(activeLayer);
    updateTargetSplatDimensionWarning(activeLayer);
  } else {
    updateTargetSplatDimensionWarning(null);
  }

  // Sync Star Pass Radius (v1.154.0 - Issue #131)
  const spRadiusSlider = document.getElementById('star-pass-radius');
  const spRadiusValEl = document.getElementById('star-pass-radius-val');
  if (spRadiusSlider && spRadiusValEl) {
    const val = parseFloat(spRadiusSlider.value) || 35;
    spRadiusValEl.textContent = (typeof formatUnitDistance === 'function') ? formatUnitDistance(val) : (unit === 'imperial' ? `${Math.round(val * M_TO_FT)}ft` : `${val}m`);
  }

  // Sync Corridor Mapping Geometry (v1.155.0 - Issue #130)
  const corrWidthSlider = document.getElementById('corridor-width');
  const corrWidthValEl = document.getElementById('corridor-width-val');
  if (corrWidthSlider && corrWidthValEl) {
    const val = parseFloat(corrWidthSlider.value) || 60;
    corrWidthValEl.textContent = (typeof formatUnitDistance === 'function') ? formatUnitDistance(val) : (unit === 'imperial' ? `${Math.round(val * M_TO_FT)}ft` : `${val}m`);
  }

  const corrPassesSlider = document.getElementById('corridor-passes');
  const corrPassesValEl = document.getElementById('corridor-passes-val');
  if (corrPassesSlider && corrPassesValEl) {
    corrPassesValEl.textContent = corrPassesSlider.value;
  }

  const corrOvershootSlider = document.getElementById('corridor-overshoot');
  const corrOvershootValEl = document.getElementById('corridor-overshoot-val');
  if (corrOvershootSlider && corrOvershootValEl) {
    const val = parseFloat(corrOvershootSlider.value) || 0;
    corrOvershootValEl.textContent = (typeof formatUnitDistance === 'function') ? formatUnitDistance(val) : (unit === 'imperial' ? `${Math.round(val * M_TO_FT)}ft` : `${val}m`);
  }

  const corrSideOverlapSlider = document.getElementById('corridor-side-overlap');
  const corrSideOverlapValEl = document.getElementById('corridor-side-overlap-val');
  if (corrSideOverlapSlider && corrSideOverlapValEl) {
    corrSideOverlapValEl.textContent = `${corrSideOverlapSlider.value}%`;
  }

  // Sync Vertical Facade Grid Geometry (v1.153.0 - Issue #132)
  const fWidthSlider = document.getElementById('facade-width');
  const fWidthValEl = document.getElementById('facade-width-val');
  if (fWidthSlider && fWidthValEl) {
    const val = parseFloat(fWidthSlider.value) || 60;
    fWidthValEl.textContent = (typeof formatUnitDistance === 'function') ? formatUnitDistance(val) : (unit === 'imperial' ? `${Math.round(val * M_TO_FT)}ft` : `${val}m`);
  }
  const fMinAltSlider = document.getElementById('facade-min-alt');
  const fMinAltValEl = document.getElementById('facade-min-alt-val');
  if (fMinAltSlider && fMinAltValEl) {
    const val = parseFloat(fMinAltSlider.value) || 10;
    fMinAltValEl.textContent = (typeof formatUnitDistance === 'function') ? formatUnitDistance(val) : (unit === 'imperial' ? `${Math.round(val * M_TO_FT)}ft` : `${val}m`);
  }
  const fMaxAltSlider = document.getElementById('facade-max-alt');
  const fMaxAltValEl = document.getElementById('facade-max-alt-val');
  if (fMaxAltSlider && fMaxAltValEl) {
    const val = parseFloat(fMaxAltSlider.value) || 40;
    fMaxAltValEl.textContent = (typeof formatUnitDistance === 'function') ? formatUnitDistance(val) : (unit === 'imperial' ? `${Math.round(val * M_TO_FT)}ft` : `${val}m`);
  }
  const fStandoffSlider = document.getElementById('facade-standoff');
  const fStandoffValEl = document.getElementById('facade-standoff-val');
  if (fStandoffSlider && fStandoffValEl) {
    const val = parseFloat(fStandoffSlider.value) || 15;
    fStandoffValEl.textContent = (typeof formatUnitDistance === 'function') ? formatUnitDistance(val) : (unit === 'imperial' ? `${Math.round(val * M_TO_FT)}ft` : `${val}m`);
  }

  // Sync Continuous Helix Geometry (v1.153.0 - Issue #133)
  const hRStartSlider = document.getElementById('helix-radius-start');
  const hRStartValEl = document.getElementById('helix-radius-start-val');
  if (hRStartSlider && hRStartValEl) {
    const val = parseFloat(hRStartSlider.value) || 25;
    hRStartValEl.textContent = (typeof formatUnitDistance === 'function') ? formatUnitDistance(val) : (unit === 'imperial' ? `${Math.round(val * M_TO_FT)}ft` : `${val}m`);
  }
  const hREndSlider = document.getElementById('helix-radius-end');
  const hREndValEl = document.getElementById('helix-radius-end-val');
  if (hREndSlider && hREndValEl) {
    const val = parseFloat(hREndSlider.value) || 25;
    hREndValEl.textContent = (typeof formatUnitDistance === 'function') ? formatUnitDistance(val) : (unit === 'imperial' ? `${Math.round(val * M_TO_FT)}ft` : `${val}m`);
  }
  const hAltStartSlider = document.getElementById('helix-alt-start');
  const hAltStartValEl = document.getElementById('helix-alt-start-val');
  if (hAltStartSlider && hAltStartValEl) {
    const val = parseFloat(hAltStartSlider.value) || 20;
    hAltStartValEl.textContent = (typeof formatUnitDistance === 'function') ? formatUnitDistance(val) : (unit === 'imperial' ? `${Math.round(val * M_TO_FT)}ft` : `${val}m`);
  }
  const hAltEndSlider = document.getElementById('helix-alt-end');
  const hAltEndValEl = document.getElementById('helix-alt-end-val');
  if (hAltEndSlider && hAltEndValEl) {
    const val = parseFloat(hAltEndSlider.value) || 60;
    hAltEndValEl.textContent = (typeof formatUnitDistance === 'function') ? formatUnitDistance(val) : (unit === 'imperial' ? `${Math.round(val * M_TO_FT)}ft` : `${val}m`);
  }

  // Sync Light Art Geometry (v1.151.0 - Issue #136)
  const laRadiusSlider = document.getElementById('light-art-radius');
  const laRadiusValEl = document.getElementById('light-art-radius-val');
  if (laRadiusSlider && laRadiusValEl) {
    const val = parseFloat(laRadiusSlider.value) || 25;
    laRadiusValEl.textContent = (typeof formatUnitDistance === 'function') ? formatUnitDistance(val) : (unit === 'imperial' ? `${Math.round(val * M_TO_FT)}ft` : `${val}m`);
  }
  const laClimbSlider = document.getElementById('light-art-climb');
  const laClimbValEl = document.getElementById('light-art-climb-val');
  if (laClimbSlider && laClimbValEl) {
    const val = parseFloat(laClimbSlider.value) || 15;
    laClimbValEl.textContent = (typeof formatUnitDistance === 'function') ? formatUnitDistance(val) : (unit === 'imperial' ? `${Math.round(val * M_TO_FT)}ft` : `${val}m`);
  }

  // Sync Boundary Elevation
  const bElevSlider = document.getElementById('boundary-elevation');
  const bElevValEl = document.getElementById('boundary-elevation-val');
  const bElevUnitEl = document.getElementById('boundary-elevation-unit');
  if (bElevSlider && bElevValEl) {
    const val = parseFloat(bElevSlider.value) || 0;
    bElevValEl.textContent = (unit === 'imperial') ? Math.round(val * M_TO_FT) : val;
    if (bElevUnitEl) bElevUnitEl.textContent = distUnitStr;
  }

  updateInheritOptionLabels();
  if (typeof updateAcousticAdvisorUI === 'function') {
    updateAcousticAdvisorUI();
  }
}

// ============================================================================
// Issue #123: Mission Explorer & Historical Flight Database Management
// ============================================================================

let cachedMissionDbItems = [];
let isMissionDbOnline = false;

async function initMissionDbUI() {
  if (typeof document === 'undefined') return;

  const refreshBtn = document.getElementById('mission-db-refresh-btn');
  const searchInput = document.getElementById('mission-db-search');
  const activeRestoreBtn = document.getElementById('mission-active-restore-btn');
  const activeCard = document.getElementById('mission-active-workspace-card');

  if (refreshBtn) {
    refreshBtn.addEventListener('click', (e) => {
      if (e) e.stopPropagation();
      refreshMissionDbList();
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      filterAndRenderMissionDbList();
    });
  }

  if (activeRestoreBtn) {
    activeRestoreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      restoreActiveWorkspacePlanning();
    });
  }

  if (activeCard) {
    activeCard.addEventListener('click', () => {
      restoreActiveWorkspacePlanning();
    });
  }

  // Initial fetch of historical missions
  setTimeout(() => {
    refreshMissionDbList();
  }, 120);
}

async function refreshMissionDbList() {
  if (typeof document === 'undefined') return;
  const listContainer = document.getElementById('mission-db-list');
  const badgeEl = document.getElementById('mission-db-count-badge');
  const refreshBtn = document.getElementById('mission-db-refresh-btn');
  const searchInput = document.getElementById('mission-db-search');

  if (refreshBtn) {
    refreshBtn.textContent = '⏳';
    refreshBtn.disabled = true;
  }

  const items = [];
  let bridgeReachable = false;

  try {
    const apiBase = (typeof getCompanionApiBase === 'function') ? getCompanionApiBase() : 'http://127.0.0.1:8765';

    // 1. Fetch RC 2 recorded flights from companion bridge
    try {
      const fetchOpts = {};
      if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
        fetchOpts.signal = AbortSignal.timeout(2000);
      }
      const res = await fetch(`${apiBase}/api/flights`, fetchOpts);
      if (res.ok) {
        bridgeReachable = true;
        const data = await res.json();
        if (data.success && Array.isArray(data.flights)) {
          data.flights.forEach(f => {
            items.push({
              id: f.filename,
              type: 'rc2-recorded',
              title: f.label || f.filename,
              filename: f.filename,
              date: f.flightDate || f.mtimeFormatted || 'Controller Log',
              size: f.sizeFormatted || '',
              statusText: f.isDecrypted ? 'Decrypted ✓' : 'Recorded Flown',
              badgeColor: '#34d399',
              badgeBg: 'rgba(16, 185, 129, 0.15)',
              wpsText: f.isDecrypted ? 'Telemetry Ready' : 'Raw Record'
            });
          });
        }
      }
    } catch (_) {}

    // 2. Fetch SQLite diagnostics history from companion bridge
    try {
      const fetchOpts = {};
      if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
        fetchOpts.signal = AbortSignal.timeout(2000);
      }
      const resDiag = await fetch(`${apiBase}/api/diagnostics/history`, fetchOpts);
      if (resDiag.ok) {
        bridgeReachable = true;
        const dataDiag = await resDiag.json();
        if (dataDiag.success && Array.isArray(dataDiag.missions)) {
          dataDiag.missions.forEach(m => {
            const ident = m.archive_id || m.id || m.uuid;
            const isBad = (m.is_valid === 0 || m.execution_status === 'suspended' || m.execution_status === 'failed');
            items.push({
              id: `diag:${ident}`,
              type: 'sqlite-diagnostic',
              title: m.filename || m.uuid,
              filename: m.filename || m.uuid,
              date: (m.created_at || '').replace('T', ' ').replace(/\..+/, ''),
              statusText: isBad ? 'Audit Alert ⚠️' : 'Diagnostic Archive',
              badgeColor: isBad ? '#f87171' : '#38bdf8',
              badgeBg: isBad ? 'rgba(239, 68, 68, 0.15)' : 'rgba(56, 189, 248, 0.15)',
              wpsText: `${m.waypoint_count || 0} Waypoints`
            });
          });
        }
      }
    } catch (_) {}

    // 3. Fallback bridge ping if flights/diagnostics endpoints returned error
    if (!bridgeReachable) {
      if (typeof isCompanionOnline !== 'undefined' && isCompanionOnline) {
        bridgeReachable = true;
      } else {
        try {
          const fetchOpts = {};
          if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
            fetchOpts.signal = AbortSignal.timeout(1500);
          }
          const resPing = await fetch(`${apiBase}/api/status`, fetchOpts);
          if (resPing.ok) {
            bridgeReachable = true;
          }
        } catch (_) {}
      }
    }

    isMissionDbOnline = bridgeReachable;
    cachedMissionDbItems = items;

    if (badgeEl) {
      if (!isMissionDbOnline) {
        badgeEl.textContent = 'DB Offline';
        badgeEl.style.background = 'rgba(239, 68, 68, 0.15)';
        badgeEl.style.color = '#f87171';
        badgeEl.style.borderColor = 'rgba(239, 68, 68, 0.3)';
      } else {
        badgeEl.textContent = `${items.length} Flights`;
        badgeEl.style.background = 'rgba(6, 182, 212, 0.15)';
        badgeEl.style.color = 'var(--accent-cyan)';
        badgeEl.style.borderColor = 'rgba(6, 182, 212, 0.3)';
      }
    }

    if (searchInput) {
      if (!isMissionDbOnline) {
        searchInput.disabled = true;
        searchInput.placeholder = 'Flight DB offline (bridge service required)';
      } else {
        searchInput.disabled = false;
        searchInput.placeholder = 'Search flights by name, date...';
      }
    }

    filterAndRenderMissionDbList();
  } finally {
    if (refreshBtn) {
      refreshBtn.textContent = '🔄';
      refreshBtn.disabled = false;
    }
  }
}

function filterAndRenderMissionDbList() {
  if (typeof document === 'undefined') return;
  const listContainer = document.getElementById('mission-db-list');
  const searchInput = document.getElementById('mission-db-search');
  if (!listContainer) return;

  if (!isMissionDbOnline) {
    listContainer.innerHTML = `
      <div class="mission-db-unavailable-card" style="padding: 12px 10px; background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(239, 68, 68, 0.25); border-radius: 8px; text-align: center;">
        <div style="display: flex; align-items: center; justify-content: center; gap: 6px; color: #f87171; font-weight: 700; font-size: 0.78rem; margin-bottom: 4px;">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <span>Flight DB Unavailable</span>
        </div>
        <div style="color: var(--text-muted); font-size: 0.7rem; line-height: 1.35; margin-bottom: 8px;">
          The companion bridge service (port 8765) is offline. Start the bridge with <code>start-bridge.bat</code> or <code>npm run bridge</code> to view and replay historical flight logs &amp; SQLite archives.
        </div>
        <div style="background: rgba(0, 0, 0, 0.35); border: 1px solid var(--border-color); border-radius: 6px; padding: 5px 8px; margin-bottom: 10px; font-family: var(--font-mono, monospace); font-size: 0.68rem; color: var(--accent-cyan); text-align: left; display: flex; align-items: center; justify-content: space-between;">
          <span>npm run bridge</span>
          <button id="mission-db-copy-cmd-btn" type="button" class="btn-secondary" style="padding: 1px 6px; height: 18px; font-size: 0.62rem; margin: 0; line-height: 1;" title="Copy start command">📋 Copy</button>
        </div>
        <div style="display: flex; gap: 6px;">
          <button id="mission-db-guide-btn" type="button" class="btn-primary" style="flex: 1; padding: 4px 8px; font-size: 0.7rem; height: 26px; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; gap: 4px;">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
            </svg>
            <span>Setup Guide</span>
          </button>
          <button id="mission-db-retry-btn" type="button" class="btn-secondary" style="flex: 0.8; padding: 4px 8px; font-size: 0.7rem; height: 26px; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; gap: 4px;">
            <span>🔄 Retry</span>
          </button>
        </div>
      </div>
    `;

    const copyBtn = listContainer.querySelector('#mission-db-copy-cmd-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const cmd = 'npm run bridge';
        if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(cmd).then(() => {
            copyBtn.textContent = '✓ Copied';
            setTimeout(() => { copyBtn.textContent = '📋 Copy'; }, 2000);
          }).catch(() => {
            if (typeof prompt === 'function') prompt('Copy command:', cmd);
          });
        } else if (typeof prompt === 'function') {
          prompt('Copy command:', cmd);
        }
      });
    }

    const guideBtn = listContainer.querySelector('#mission-db-guide-btn');
    if (guideBtn) {
      guideBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof openRC2GuideModal === 'function') {
          openRC2GuideModal('service');
        }
      });
    }

    const retryBtn = listContainer.querySelector('#mission-db-retry-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        refreshMissionDbList();
      });
    }

    return;
  }

  const query = (searchInput && searchInput.value) ? searchInput.value.trim().toLowerCase() : '';

  if (cachedMissionDbItems.length === 0) {
    listContainer.innerHTML = `
      <div style="padding: 16px 8px; text-align: center; color: var(--text-muted); font-size: 0.72rem;">
        No historical flight records found in database or connected controller. Export or sync a flight to populate this list.
      </div>
    `;
    return;
  }

  const filtered = cachedMissionDbItems.filter(item => {
    if (!query) return true;
    const customName = (typeof PlaybackManager !== 'undefined') ? (PlaybackManager.getCustomFlightName(item.id) || '') : '';
    const matchCustom = customName.toLowerCase().includes(query);
    const matchTitle = (item.title || '').toLowerCase().includes(query);
    const matchDate = (item.date || '').toLowerCase().includes(query);
    const matchId = (item.id || '').toLowerCase().includes(query);
    return matchCustom || matchTitle || matchDate || matchId;
  });

  if (filtered.length === 0) {
    listContainer.innerHTML = `
      <div style="padding: 16px 8px; text-align: center; color: var(--text-muted); font-size: 0.72rem;">
        No flight records match your search query.
      </div>
    `;
    return;
  }

  const activeId = (typeof PlaybackManager !== 'undefined') ? PlaybackManager.activeFlightId : null;
  const safeEscape = (str) => (typeof escapeHtml === 'function' ? escapeHtml(str) : String(str || ''));

  let html = '';
  filtered.forEach(f => {
    const customName = (typeof PlaybackManager !== 'undefined') ? PlaybackManager.getCustomFlightName(f.id) : '';
    const displayName = customName || f.title || f.id;
    const isActive = (activeId === f.id && typeof PlaybackManager !== 'undefined' && PlaybackManager.is2dReplayActive);

    html += `
      <div class="mission-db-card ${isActive ? 'active-flight' : ''}" data-flight-id="${safeEscape(f.id)}">
        <div class="mission-db-card-header" style="display: flex; justify-content: space-between; align-items: flex-start; gap: 6px;">
          <div style="flex: 1; overflow: hidden;">
            <div style="display: flex; align-items: center; gap: 4px;">
              <span class="mission-db-name" data-flight-id="${safeEscape(f.id)}" style="font-weight: 700; font-size: 0.74rem; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer;" title="Click to rename flight">${safeEscape(displayName)}</span>
              <button class="mission-db-rename-btn" data-flight-id="${safeEscape(f.id)}" type="button" title="Rename this flight entry">✏️</button>
            </div>
            <div style="font-size: 0.68rem; color: var(--text-muted); margin-top: 2px;">
              ${safeEscape(f.date)} • ${safeEscape(f.wpsText || '')}
            </div>
          </div>
          <span class="badge" style="font-size: 0.64rem; background: ${f.badgeBg || 'rgba(56,189,248,0.15)'}; color: ${f.badgeColor || '#38bdf8'}; border: 1px solid rgba(255,255,255,0.1); padding: 1px 5px; border-radius: 4px; white-space: nowrap;">
            ${safeEscape(f.statusText || 'Saved')}
          </span>
        </div>
        <div class="mission-db-card-actions" style="display: flex; gap: 6px; margin-top: 6px;">
          <button class="btn-primary mission-db-2d-btn" data-flight-id="${safeEscape(f.id)}" type="button" style="flex: 1.1; padding: 3px 6px; font-size: 0.7rem; height: 24px; display: inline-flex; align-items: center; justify-content: center; gap: 4px; border-radius: 6px;">
            <span>▶ 2D Replay</span>
          </button>
          <button class="btn-secondary mission-db-3d-btn" data-flight-id="${safeEscape(f.id)}" type="button" style="flex: 0.9; padding: 3px 6px; font-size: 0.7rem; height: 24px; display: inline-flex; align-items: center; justify-content: center; gap: 4px; border-radius: 6px;">
            <span>🧊 3D View</span>
          </button>
        </div>
      </div>
    `;
  });

  listContainer.innerHTML = html;

  // Bind 2D Replay buttons
  listContainer.querySelectorAll('.mission-db-2d-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const fid = btn.getAttribute('data-flight-id');
      if (fid) loadFlightFor2dReplay(fid);
    });
  });

  // Bind 3D View buttons
  listContainer.querySelectorAll('.mission-db-3d-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const fid = btn.getAttribute('data-flight-id');
      if (fid) loadFlightFor3dView(fid);
    });
  });

  // Bind Rename buttons
  listContainer.querySelectorAll('.mission-db-rename-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const fid = btn.getAttribute('data-flight-id');
      if (fid) promptRenameFlight(fid);
    });
  });

  // Bind click on name directly for quick inline rename
  listContainer.querySelectorAll('.mission-db-name').forEach(nameSpan => {
    nameSpan.addEventListener('click', (e) => {
      e.stopPropagation();
      const fid = nameSpan.getAttribute('data-flight-id');
      if (fid) promptRenameFlight(fid);
    });
  });
}

function promptRenameFlight(flightId) {
  if (typeof PlaybackManager === 'undefined') return;
  const currentName = PlaybackManager.getCustomFlightName(flightId) || flightId;
  const newName = (typeof prompt === 'function') ? prompt('Rename flight record:', currentName) : null;
  if (newName !== null) {
    PlaybackManager.setCustomFlightName(flightId, newName.trim());
    filterAndRenderMissionDbList();
    if (typeof showToast === 'function') {
      showToast(`Renamed flight to "${newName.trim() || flightId}"`, 'info');
    }
  }
}

async function loadFlightFor2dReplay(flightId) {
  const activeCard = document.getElementById('mission-active-workspace-card');
  if (activeCard) activeCard.classList.remove('active');

  // Load telemetry via FlightDiagnostics
  if (typeof FlightDiagnostics !== 'undefined' && typeof FlightDiagnostics.loadSelectedFlight === 'function') {
    await FlightDiagnostics.loadSelectedFlight(flightId);
    const telem = FlightDiagnostics.telemetryData;
    const planned = FlightDiagnostics.plannedWaypoints;

    if (typeof PlaybackManager !== 'undefined') {
      PlaybackManager.loadFlight(flightId, telem, {
        plannedWaypoints: planned,
        isHistorical: (flightId !== 'active-mission')
      });
      PlaybackManager.set2dReplayActive(true);
    }
  }

  filterAndRenderMissionDbList();
}

async function loadFlightFor3dView(flightId) {
  if (typeof FlightDiagnostics !== 'undefined' && typeof FlightDiagnostics.open === 'function') {
    FlightDiagnostics.open('3d', flightId);
  }
}

function restoreActiveWorkspacePlanning() {
  if (typeof PlaybackManager !== 'undefined') {
    PlaybackManager.pause();
    PlaybackManager.set2dReplayActive(false);
    PlaybackManager.activeFlightId = 'active-mission';
  }

  if (typeof clear2dHistoricalTracks === 'function') {
    clear2dHistoricalTracks();
  }

  const activeCard = document.getElementById('mission-active-workspace-card');
  if (activeCard) activeCard.classList.add('active');

  filterAndRenderMissionDbList();

  if (typeof showToast === 'function') {
    showToast('Restored Active Planning Workspace', 'info');
  }
}

// ============================================================================
// Light Art UI Helper Functions (v1.151.0 - Issue #136)
// ============================================================================

function updateLightArtBadge(gridData) {
  if (typeof document === 'undefined') return;
  const badge = document.getElementById('light-art-duration-badge');
  if (badge) {
    if (!gridData || !gridData.flightDurationSec) {
      badge.textContent = '0s (Bulb)';
    } else {
      const dur = Math.round(gridData.flightDurationSec);
      const shutter = gridData.recommendedShutterSec || Math.ceil(dur + 2);
      badge.textContent = `${dur}s Stroke | ${shutter}s Shutter`;
    }
  }

  const laCalcRadiusVal = document.getElementById('light-art-calculated-radius-val');
  const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
  if (laCalcRadiusVal && activeLayer && activeLayer.lightArtRadius) {
    laCalcRadiusVal.textContent = (typeof formatUnitDistance === 'function') ? formatUnitDistance(activeLayer.lightArtRadius) : `${activeLayer.lightArtRadius}m`;
  }

  // Dynamic Ground Clearance Warning & Elevate Helper
  const warningEl = document.getElementById('light-art-clearance-warning');
  const warningMsgEl = document.getElementById('light-art-clearance-warning-msg');
  const elevateBtn = document.getElementById('light-art-elevate-btn');

  if (warningEl) {
    if (gridData && gridData.hasClearanceWarning) {
      warningEl.style.display = 'block';
      if (warningMsgEl) {
        warningMsgEl.textContent = `⚠️ Low Clearance Alert: Lowest stroke reaches ${gridData.minArtAlt}m AGL (below ${gridData.minClearance}m floor). Recommended altitude: ${gridData.recommendedBaseAltitude}m.`;
      }
      if (elevateBtn) {
        elevateBtn.setAttribute('data-recommended-alt', gridData.recommendedBaseAltitude);
        elevateBtn.textContent = `Elevate Base Altitude to ${gridData.recommendedBaseAltitude}m`;
      }
    } else {
      warningEl.style.display = 'none';
    }
  }
}

function updateLightArtUiFields(layer) {
  if (typeof document === 'undefined') return;
  const preset = layer ? (layer.lightArtPreset || 'spiral') : 'spiral';
  const orientation = layer ? (layer.lightArtOrientation || 'horizontal') : 'horizontal';
  const tilt = (layer && typeof layer.lightArtTilt === 'number') ? layer.lightArtTilt : (orientation === 'vertical' ? 90 : 0);
  const cameraAz = (layer && typeof layer.lightArtCameraAzimuth === 'number') ? layer.lightArtCameraAzimuth : 0;
  const sizeMode = layer ? (layer.lightArtSizeMode || 'manual') : 'manual';

  const spiralOpts = document.getElementById('light-art-spiral-opts');
  const starOpts = document.getElementById('light-art-star-opts');
  const helixOpts = document.getElementById('light-art-helix-opts');
  const tiltOpts = document.getElementById('light-art-tilt-opts');
  const azOpts = document.getElementById('light-art-azimuth-opts');
  const durationOpts = document.getElementById('light-art-duration-opts');
  const radiusOpts = document.getElementById('light-art-radius-opts');

  if (durationOpts) {
    durationOpts.style.display = (sizeMode === 'timeLimit') ? 'block' : 'none';
  }
  if (radiusOpts) {
    radiusOpts.style.display = (sizeMode === 'manual') ? 'block' : 'none';
  }

  if (spiralOpts) spiralOpts.style.display = (preset === 'spiral') ? 'block' : 'none';
  if (helixOpts) helixOpts.style.display = (preset === 'helix') ? 'block' : 'none';
  if (starOpts) starOpts.style.display = (preset === 'star') ? 'block' : 'none';

  // Tilt controls are shown when tilted or vertical
  if (tiltOpts) {
    tiltOpts.style.display = (orientation === 'tilted' || orientation === 'vertical' || tilt > 0) ? 'block' : 'none';
  }

  // Bearing & Compass Dial controls are shown whenever canvas is tilted/vertical or azimuth > 0
  if (azOpts) {
    azOpts.style.display = (orientation !== 'horizontal' || tilt > 0 || cameraAz > 0) ? 'block' : 'none';
  }

  // Update Compass Needle on SVG (center at 50, 50, radius 34)
  const needle = document.getElementById('light-art-compass-needle');
  if (needle && typeof needle.setAttribute === 'function') {
    const radAz = (cameraAz * Math.PI) / 180.0;
    const nx = 50 + 34 * Math.sin(radAz);
    const ny = 50 - 34 * Math.cos(radAz);
    needle.setAttribute('x2', nx.toFixed(1));
    needle.setAttribute('y2', ny.toFixed(1));
  }

  // Highlight matching cardinal chip
  if (typeof document.querySelectorAll === 'function') {
    const azChips = document.querySelectorAll('.light-art-az-chip');
    if (azChips && azChips.forEach) {
      azChips.forEach(chip => {
        const chipAz = parseFloat(chip.getAttribute('data-az'));
        if (Math.round(cameraAz) === chipAz) {
          chip.classList.add('active');
        } else {
          chip.classList.remove('active');
        }
      });
    }

    // Highlight matching tilt preset button
    const tiltBtns = document.querySelectorAll('.light-art-tilt-preset-btn');
    if (tiltBtns && tiltBtns.forEach) {
      tiltBtns.forEach(btn => {
        const btnTilt = parseFloat(btn.getAttribute('data-tilt'));
        if (Math.round(tilt) === btnTilt) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
    }
  }
}

if (typeof window !== 'undefined') {
  window.updateLightArtBadge = updateLightArtBadge;
  window.updateLightArtUiFields = updateLightArtUiFields;
  window.renderCorridorNodeTable = renderCorridorNodeTable;
  window.addCorridorNodeAction = addCorridorNodeAction;
}

function renderCorridorNodeTable() {
  if (typeof document === 'undefined') return;
  const container = document.getElementById('corridor-node-list');
  const badge = document.getElementById('corridor-vertex-badge');
  if (!container) return;
  // Prevent blowing away input focus if pilot is actively editing coordinates
  if (typeof container.contains === "function" && typeof document !== "undefined" && document.activeElement && container.contains(document.activeElement)) return;

  const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
  const nodes = (activeLayer && Array.isArray(activeLayer.corridorCenterline))
    ? activeLayer.corridorCenterline
    : (typeof corridorCenterline !== 'undefined' && Array.isArray(corridorCenterline) ? corridorCenterline : []);

  if (badge) {
    badge.textContent = `${nodes.length} Node${nodes.length === 1 ? '' : 's'}`;
  }

  if (nodes.length === 0) {
    container.innerHTML = `
      <div style="font-size: 0.72rem; color: var(--text-muted); text-align: center; padding: 10px 4px; background: rgba(0,0,0,0.1); border-radius: 6px;">
        No centerline nodes. Click <strong>Edit Centerline</strong> or <strong>Add Node</strong> to begin.
      </div>
    `;
    return;
  }

  const corrColor = (activeLayer && activeLayer.color) ? activeLayer.color : '#6366f1';
  let html = '';
  nodes.forEach((wp, idx) => {
    const latVal = typeof wp.lat === 'number' ? wp.lat.toFixed(6) : (wp.lat || '');
    const lonVal = typeof wp.lon === 'number' ? wp.lon.toFixed(6) : (wp.lon || '');
    const isDeletable = nodes.length > 2;

    html += `
      <div class="corridor-node-row" data-node-idx="${idx}" style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px; background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 6px; padding: 4px 6px;">
        <span style="background: ${corrColor}; color: #ffffff; font-weight: 700; font-size: 0.68rem; border-radius: 4px; min-width: 24px; height: 22px; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 4px rgba(0,0,0,0.3); flex-shrink: 0;">
          C${idx + 1}
        </span>
        <div style="display: flex; flex: 1; gap: 4px; align-items: center;">
          <input type="number" step="0.000001" class="form-control form-control-xs corridor-node-input" data-idx="${idx}" data-field="lat" value="${latVal}" title="Latitude" placeholder="Lat" style="font-family: monospace; font-size: 0.7rem; padding: 2px 4px; height: 24px; min-width: 0; flex: 1;">
          <input type="number" step="0.000001" class="form-control form-control-xs corridor-node-input" data-idx="${idx}" data-field="lon" value="${lonVal}" title="Longitude" placeholder="Lon" style="font-family: monospace; font-size: 0.7rem; padding: 2px 4px; height: 24px; min-width: 0; flex: 1;">
        </div>
        <button type="button" class="btn btn-xs btn-outline-danger corridor-node-del-btn" data-idx="${idx}" title="Delete Node C${idx + 1}" ${!isDeletable ? 'disabled style="opacity: 0.3; cursor: not-allowed; padding: 1px 6px; font-size: 0.65rem;"' : 'style="padding: 1px 6px; font-size: 0.65rem;"'}>
          ✕
        </button>
      </div>
    `;
  });

  container.innerHTML = html;

  const inputs = container.querySelectorAll('.corridor-node-input');
  inputs.forEach(input => {
    input.addEventListener('change', (e) => {
      const idx = parseInt(e.target.getAttribute('data-idx'), 10);
      const field = e.target.getAttribute('data-field');
      const val = parseFloat(e.target.value);
      if (isNaN(val) || !nodes[idx]) return;

      nodes[idx][field] = val;
      nodes[idx].isModified = true;

      const layerCenterLat = (activeLayer && activeLayer.centerLat !== null && activeLayer.centerLat !== undefined) ? activeLayer.centerLat : (typeof centerLat !== 'undefined' ? centerLat : 41.3215);
      const layerCenterLon = (activeLayer && activeLayer.centerLon !== null && activeLayer.centerLon !== undefined) ? activeLayer.centerLon : (typeof centerLon !== 'undefined' ? centerLon : -88.9950);
      if (typeof geodeticToLocal === 'function') {
        const offsets = geodeticToLocal(nodes[idx].lat, nodes[idx].lon, layerCenterLat, layerCenterLon);
        nodes[idx].x = offsets.x;
        nodes[idx].y = offsets.y;
      }

      if (activeLayer) activeLayer.corridorCenterline = nodes;
      if (typeof corridorCenterline !== 'undefined') corridorCenterline = nodes;
      if (typeof updateGrid === 'function') updateGrid();
    });
  });

  const delBtns = container.querySelectorAll('.corridor-node-del-btn');
  delBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.currentTarget.getAttribute('data-idx'), 10);
      if (isNaN(idx) || nodes.length <= 2) return;
      nodes.splice(idx, 1);
      nodes.forEach((n, i) => { n.idx = i; });
      if (activeLayer) activeLayer.corridorCenterline = nodes;
      if (typeof corridorCenterline !== 'undefined') corridorCenterline = nodes;
      if (typeof updateGrid === 'function') updateGrid();
      renderCorridorNodeTable();
    });
  });
}

function addCorridorNodeAction() {
  const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
  const nodes = (activeLayer && Array.isArray(activeLayer.corridorCenterline))
    ? activeLayer.corridorCenterline
    : (typeof corridorCenterline !== 'undefined' && Array.isArray(corridorCenterline) ? corridorCenterline : []);

  const layerCenterLat = (activeLayer && activeLayer.centerLat !== null && activeLayer.centerLat !== undefined) ? activeLayer.centerLat : (typeof centerLat !== 'undefined' ? centerLat : 41.3215);
  const layerCenterLon = (activeLayer && activeLayer.centerLon !== null && activeLayer.centerLon !== undefined) ? activeLayer.centerLon : (typeof centerLon !== 'undefined' ? centerLon : -88.9950);

  let newLat = layerCenterLat;
  let newLon = layerCenterLon;

  if (nodes.length >= 2) {
    const last = nodes[nodes.length - 1];
    const prev = nodes[nodes.length - 2];
    const dLat = last.lat - prev.lat;
    const dLon = last.lon - prev.lon;
    const len = Math.hypot(dLat, dLon) || 0.0001;
    const stepDeg = 0.00036;
    newLat = last.lat + (dLat / len) * stepDeg;
    newLon = last.lon + (dLon / len) * stepDeg;
  } else if (nodes.length === 1) {
    newLat = nodes[0].lat + 0.00036;
    newLon = nodes[0].lon + 0.00036;
  }

  const offsets = (typeof geodeticToLocal === 'function')
    ? geodeticToLocal(newLat, newLon, layerCenterLat, layerCenterLon)
    : { x: 0, y: 0 };

  const newNode = {
    lat: newLat,
    lon: newLon,
    x: offsets.x,
    y: offsets.y,
    idx: nodes.length,
    isModified: true
  };

  nodes.push(newNode);
  if (activeLayer) activeLayer.corridorCenterline = nodes;
  if (typeof corridorCenterline !== 'undefined') corridorCenterline = nodes;

  if (typeof updateGrid === 'function') updateGrid();
  if (typeof renderCorridorNodeTable === 'function') renderCorridorNodeTable();
}

function updateHyperlapseKeyframeVisuals() {
  const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
  if (!activeLayer) return;

  const card = document.getElementById('hyperlapse-keyframes-card');
  const body = document.getElementById('hyperlapse-keyframes-body');
  const lockBanner = document.getElementById('hyperlapse-poi-lock-banner');
  const lockBadge = document.getElementById('hyperlapse-lock-badge');

  const hlStartPitch = document.getElementById('hyperlapse-start-pitch');
  const hlEndPitch = document.getElementById('hyperlapse-end-pitch');
  const hlHeadingMode = document.getElementById('hyperlapse-heading-mode');
  const hlStartHeading = document.getElementById('hyperlapse-start-heading');
  const hlEndHeading = document.getElementById('hyperlapse-end-heading');

  // Check POI lock state (Tier 2 layer or Tier 1 global POI tracking)
  const hasPoiTarget = Boolean(activeLayer.targetPoiId);
  const effHeading = (typeof getEffectiveLayerHeadingMode === 'function')
    ? getEffectiveLayerHeadingMode(activeLayer)
    : (activeLayer.headingMode || 'smoothTransition');
  const isPoiLocked = hasPoiTarget || (effHeading === 'towardPOI');

  if (isPoiLocked) {
    if (body) body.classList.add('hyperlapse-locked');
    if (lockBanner) lockBanner.classList.remove('hidden');
    if (lockBadge) lockBadge.classList.remove('hidden');
  } else {
    if (body) body.classList.remove('hyperlapse-locked');
    if (lockBanner) lockBanner.classList.add('hidden');
    if (lockBadge) lockBadge.classList.add('hidden');
  }

  // Update Pitch Sweep Label & Dial Visuals
  const startP = (hlStartPitch && !isNaN(parseInt(hlStartPitch.value, 10))) ? parseInt(hlStartPitch.value, 10) : -15;
  const endP = (hlEndPitch && !isNaN(parseInt(hlEndPitch.value, 10))) ? parseInt(hlEndPitch.value, 10) : -15;
  const pitchSweepLbl = document.getElementById('hyperlapse-pitch-sweep-label');
  if (pitchSweepLbl) {
    pitchSweepLbl.textContent = `${startP}° → ${endP}°`;
  }

  const pitchToDesc = (p) => {
    if (p <= -85) return 'Nadir';
    if (p <= -55) return 'Steep Oblique';
    if (p <= -30) return 'Oblique';
    if (p <= -10) return 'Horizon';
    if (p <= 0) return 'Level';
    return 'Upward';
  };

  const pitchStartTxt = document.getElementById('hyperlapse-pitch-start-text');
  const pitchEndTxt = document.getElementById('hyperlapse-pitch-end-text');
  if (pitchStartTxt) pitchStartTxt.textContent = `${startP}° (${pitchToDesc(startP)})`;
  if (pitchEndTxt) pitchEndTxt.textContent = `${endP}° (${pitchToDesc(endP)})`;

  // Update Pitch Needles & Sweep Arc on SVG (center at 50, 50, radius 35)
  // Screen angle = -pitch: 0° horizon is along +X (85, 50), -90° nadir is along +Y (50, 85)
  const radPitchStart = (-startP) * Math.PI / 180;
  const radPitchEnd = (-endP) * Math.PI / 180;
  const pStartX = 50 + 35 * Math.cos(radPitchStart);
  const pStartY = 50 + 35 * Math.sin(radPitchStart);
  const pEndX = 50 + 35 * Math.cos(radPitchEnd);
  const pEndY = 50 + 35 * Math.sin(radPitchEnd);

  const needlePitchStart = document.getElementById('hyperlapse-pitch-needle-start');
  const needlePitchEnd = document.getElementById('hyperlapse-pitch-needle-end');
  if (needlePitchStart && typeof needlePitchStart.setAttribute === 'function') {
    needlePitchStart.setAttribute('x2', pStartX.toFixed(1));
    needlePitchStart.setAttribute('y2', pStartY.toFixed(1));
  }
  if (needlePitchEnd && typeof needlePitchEnd.setAttribute === 'function') {
    needlePitchEnd.setAttribute('x2', pEndX.toFixed(1));
    needlePitchEnd.setAttribute('y2', pEndY.toFixed(1));
  }

  const pitchArc = document.getElementById('hyperlapse-pitch-sweep-arc');
  if (pitchArc && typeof pitchArc.setAttribute === 'function') {
    if (startP === endP) {
      pitchArc.setAttribute('d', `M 50 50 L ${pStartX.toFixed(1)} ${pStartY.toFixed(1)} Z`);
    } else {
      const sweepFlag = (endP <= startP) ? 1 : 0;
      pitchArc.setAttribute('d', `M 50 50 L ${pStartX.toFixed(1)} ${pStartY.toFixed(1)} A 35 35 0 0 ${sweepFlag} ${pEndX.toFixed(1)} ${pEndY.toFixed(1)} Z`);
    }
  }

  // Highlight active pitch preset chip if start and end match
  if (typeof document !== 'undefined' && typeof document.querySelectorAll === 'function') {
    const pitchChips = document.querySelectorAll('.hyperlapse-pitch-chip');
    if (pitchChips && pitchChips.forEach) {
      pitchChips.forEach(chip => {
        const pVal = parseInt(chip.getAttribute('data-pitch'), 10);
        if (startP === pVal && endP === pVal) {
          chip.classList.add('active');
        } else {
          chip.classList.remove('active');
        }
      });
    }
  }

  // Update Yaw Sweep Label & Compass Visuals
  const yawSweepLbl = document.getElementById('hyperlapse-yaw-sweep-label');
  const mode = (hlHeadingMode && hlHeadingMode.value) || 'path';
  if (yawSweepLbl) {
    yawSweepLbl.textContent = (mode === 'keyframes') ? 'Keyframe Sweep' : 'Path Tangent';
  }

  if (mode === 'keyframes') {
    const startY = (hlStartHeading && !isNaN(parseFloat(hlStartHeading.value))) ? ((parseFloat(hlStartHeading.value) % 360) + 360) % 360 : 0;
    const endY = (hlEndHeading && !isNaN(parseFloat(hlEndHeading.value))) ? ((parseFloat(hlEndHeading.value) % 360) + 360) % 360 : 90;

    const startTxt = document.getElementById('hyperlapse-compass-start-text');
    const endTxt = document.getElementById('hyperlapse-compass-end-text');
    const bearingToDir = (deg) => {
      const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
      const idx = Math.round(deg / 45) % 8;
      return dirs[idx];
    };
    if (startTxt) startTxt.textContent = `${Math.round(startY)}° (${bearingToDir(startY)})`;
    if (endTxt) endTxt.textContent = `${Math.round(endY)}° (${bearingToDir(endY)})`;

    // Update Needle Lines on SVG (center at 50, 50, radius 35)
    const radStart = (startY - 90) * Math.PI / 180;
    const radEnd = (endY - 90) * Math.PI / 180;
    const nStartX = 50 + 35 * Math.cos(radStart);
    const nStartY = 50 + 35 * Math.sin(radStart);
    const nEndX = 50 + 35 * Math.cos(radEnd);
    const nEndY = 50 + 35 * Math.sin(radEnd);

    const needleStart = document.getElementById('hyperlapse-compass-needle-start');
    const needleEnd = document.getElementById('hyperlapse-compass-needle-end');
    if (needleStart && typeof needleStart.setAttribute === 'function') {
      needleStart.setAttribute('x2', nStartX.toFixed(1));
      needleStart.setAttribute('y2', nStartY.toFixed(1));
    }
    if (needleEnd && typeof needleEnd.setAttribute === 'function') {
      needleEnd.setAttribute('x2', nEndX.toFixed(1));
      needleEnd.setAttribute('y2', nEndY.toFixed(1));
    }

    // Draw sweep arc between start and end
    const arc = document.getElementById('hyperlapse-compass-sweep-arc');
    if (arc && typeof arc.setAttribute === 'function') {
      let diff = (endY - startY) % 360;
      if (diff < 0) diff += 360;
      const largeArc = diff > 180 ? 1 : 0;
      arc.setAttribute('d', `M 50 50 L ${nStartX.toFixed(1)} ${nStartY.toFixed(1)} A 35 35 0 ${largeArc} 1 ${nEndX.toFixed(1)} ${nEndY.toFixed(1)} Z`);
    }

    // Highlight matching yaw chip for end heading
    if (typeof document !== 'undefined' && typeof document.querySelectorAll === 'function') {
      const yawChips = document.querySelectorAll('.hyperlapse-yaw-chip');
      if (yawChips && yawChips.forEach) {
        yawChips.forEach(chip => {
          const yVal = parseFloat(chip.getAttribute('data-yaw'));
          if (Math.round(endY) === yVal) {
            chip.classList.add('active');
          } else {
            chip.classList.remove('active');
          }
        });
      }
    }
  }
}

if (typeof window !== 'undefined') {
  window.initMissionDbUI = initMissionDbUI;
  window.refreshMissionDbList = refreshMissionDbList;
  window.filterAndRenderMissionDbList = filterAndRenderMissionDbList;
  window.getIsMissionDbOnline = () => isMissionDbOnline;
  window.setIsMissionDbOnline = (v) => { isMissionDbOnline = v; };
  window.getCachedMissionDbItems = () => cachedMissionDbItems;
  window.setCachedMissionDbItems = (items) => { cachedMissionDbItems = items; };
  window.updateHyperlapseKeyframeVisuals = updateHyperlapseKeyframeVisuals;
}

if (typeof global !== 'undefined') {
  global.initMissionDbUI = initMissionDbUI;
  global.refreshMissionDbList = refreshMissionDbList;
  global.filterAndRenderMissionDbList = filterAndRenderMissionDbList;
  global.getIsMissionDbOnline = () => isMissionDbOnline;
  global.setIsMissionDbOnline = (v) => { isMissionDbOnline = v; };
  global.getCachedMissionDbItems = () => cachedMissionDbItems;
  global.setCachedMissionDbItems = (items) => { cachedMissionDbItems = items; };
  global.updateHyperlapseKeyframeVisuals = updateHyperlapseKeyframeVisuals;
}

// Search Address via OpenStreetMap Nominatim API
