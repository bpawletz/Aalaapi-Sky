// Aalaapi Sky - Camera ND Filter Recommendation & Exposure Advisor Engine
// Calculates ambient illuminance (Lux), Exposure Value (EV100), and optimal drone ND filtration

var NdFilterAdvisor = (function () {
  const RAD = Math.PI / 180;

  const DRONE_CAMERA_OPTICS = {
    'dji_mini_4_pro_std': {
      id: 'dji_mini_4_pro_std',
      name: 'DJI Mini 4 Pro (24mm f/1.7)',
      defaultAperture: 1.7,
      isFixedAperture: true,
      minAperture: 1.7,
      maxAperture: 1.7,
      baseIso: 100
    },
    'dji_mini_4_pro_wide': {
      id: 'dji_mini_4_pro_wide',
      name: 'DJI Mini 4 Pro + Wide (14mm f/1.7)',
      defaultAperture: 1.7,
      isFixedAperture: true,
      minAperture: 1.7,
      maxAperture: 1.7,
      baseIso: 100
    },
    'dji_air_3_wide': {
      id: 'dji_air_3_wide',
      name: 'DJI Air 3 - Wide (24mm f/1.7)',
      defaultAperture: 1.7,
      isFixedAperture: true,
      minAperture: 1.7,
      maxAperture: 1.7,
      baseIso: 100
    },
    'dji_air_3_tele': {
      id: 'dji_air_3_tele',
      name: 'DJI Air 3 - Tele (70mm f/2.8)',
      defaultAperture: 2.8,
      isFixedAperture: true,
      minAperture: 2.8,
      maxAperture: 2.8,
      baseIso: 100
    },
    'dji_mavic_3_pro': {
      id: 'dji_mavic_3_pro',
      name: 'DJI Mavic 3 Pro / Enterprise (f/2.8-f/11)',
      defaultAperture: 2.8,
      isFixedAperture: false,
      minAperture: 2.8,
      maxAperture: 11.0,
      baseIso: 100
    },
    'dji_inspire_3': {
      id: 'dji_inspire_3',
      name: 'DJI Inspire 3 (Full Frame f/1.4-f/16)',
      defaultAperture: 2.8,
      isFixedAperture: false,
      minAperture: 1.4,
      maxAperture: 16.0,
      baseIso: 100
    },
    'skyrover_x1_std': {
      id: 'skyrover_x1_std',
      name: 'Skyrover X1 (26mm f/2.0)',
      defaultAperture: 2.0,
      isFixedAperture: true,
      minAperture: 2.0,
      maxAperture: 2.0,
      baseIso: 100
    },
    'skyrover_x1_wide': {
      id: 'skyrover_x1_wide',
      name: 'Skyrover X1 + Wide (18mm f/2.0)',
      defaultAperture: 2.0,
      isFixedAperture: true,
      minAperture: 2.0,
      maxAperture: 2.0,
      baseIso: 100
    },
    'custom': {
      id: 'custom',
      name: 'Custom Drone Camera',
      defaultAperture: 2.8,
      isFixedAperture: false,
      minAperture: 1.2,
      maxAperture: 22.0,
      baseIso: 100
    }
  };

  const FILTER_CATALOG = [
    {
      id: 'none',
      label: 'UV / None',
      badgeText: 'None',
      stops: 0,
      factor: 1,
      transmissionPct: 100,
      description: 'Zero light reduction. High transmission for photogrammetry, twilight, or indoor flight.'
    },
    {
      id: 'nd4',
      label: 'ND4',
      badgeText: 'ND4',
      stops: 2,
      factor: 4,
      transmissionPct: 25.0,
      description: '-2 Stops (25% transmission). Soft daylight, sunset, sunrise, or heavy overcast.'
    },
    {
      id: 'nd8',
      label: 'ND8',
      badgeText: 'ND8',
      stops: 3,
      factor: 8,
      transmissionPct: 12.5,
      description: '-3 Stops (12.5% transmission). Cloudy or hazy daylight; moderate golden hour video.'
    },
    {
      id: 'nd16',
      label: 'ND16',
      badgeText: 'ND16',
      stops: 4,
      factor: 16,
      transmissionPct: 6.25,
      description: '-4 Stops (6.25% transmission). Standard sunny daylight; essential for 180° cinematic video.'
    },
    {
      id: 'nd32',
      label: 'ND32',
      badgeText: 'ND32',
      stops: 5,
      factor: 32,
      transmissionPct: 3.125,
      description: '-5 Stops (3.125% transmission). Intense midday sun, desert terrain, or fixed f/1.7 lenses.'
    },
    {
      id: 'nd64',
      label: 'ND64',
      badgeText: 'ND64',
      stops: 6,
      factor: 64,
      transmissionPct: 1.56,
      description: '-6 Stops (1.56% transmission). Extreme sunlight, beach, snow, or wide apertures at 24/30fps.'
    },
    {
      id: 'nd128',
      label: 'ND128',
      badgeText: 'ND128',
      stops: 7,
      factor: 128,
      transmissionPct: 0.78,
      description: '-7 Stops (0.78% transmission). Extreme solar glare, open water, or dramatic cinematic motion.'
    },
    {
      id: 'nd256',
      label: 'ND256',
      badgeText: 'ND256',
      stops: 8,
      factor: 256,
      transmissionPct: 0.39,
      description: '-8 Stops (0.39% transmission). Blinding glare or long daytime exposures (silky waterfalls).'
    },
    {
      id: 'nd1000',
      label: 'ND1000',
      badgeText: 'ND1000',
      stops: 10,
      factor: 1024,
      transmissionPct: 0.1,
      description: '-10 Stops (0.1% transmission). Deep long-exposure photography, daylight cloud streaking.'
    }
  ];

  // Active state
  let state = {
    mode: 'cinematic', // 'cinematic' | 'photogrammetry' | 'long_exposure' | 'custom'
    cameraModel: 'dji_mini_4_pro_std',
    aperture: 1.7,
    iso: 100,
    fps: 30,
    customShutter: 1 / 60,
    longExposureSec: 2.0,
    selectedFilterId: null, // null for auto-recommended or id from FILTER_CATALOG
    manualEvOverride: null // null for auto-computed from solar/METAR
  };

  /**
   * Computes ambient natural scene illuminance (lux) and EV100
   * based on solar elevation angle and sky cloud attenuation.
   */
  function calculateSceneLux(solarAltDeg, skyCoverCode = 'CLR') {
    const alt = (typeof solarAltDeg === 'number' && !isNaN(solarAltDeg)) ? solarAltDeg : 45.0;
    const code = String(skyCoverCode || 'CLR').toUpperCase();

    // Night and twilight handling
    if (alt <= -6.0) {
      // Astronomical night: starlight / faint ambient
      return { lux: 0.05, ev100: -4.6, desc: 'Night Flight' };
    }
    if (alt <= 0.0) {
      // Civil twilight: exponential drop from ~400 lux at 0° to ~3 lux at -6°
      const twilRatio = (alt + 6.0) / 6.0; // 0.0 to 1.0
      const twilLux = Math.max(0.1, 400 * Math.pow(twilRatio, 2.5));
      const ev = Math.log2(Math.max(0.01, twilLux / 2.5));
      return {
        lux: Math.round(twilLux * 10) / 10,
        ev100: Math.round(ev * 10) / 10,
        desc: 'Civil Twilight / Blue Hour'
      };
    }

    // Direct sun & sky diffuse factors based on METAR cloud cover
    let directFactor = 1.0;
    let diffuseFactor = 0.0;
    let skyDesc = 'Clear Sunlight';

    switch (code) {
      case 'OVC':
      case 'VV':
        directFactor = 0.12;
        diffuseFactor = 0.88;
        skyDesc = 'Heavy Overcast (Diffused)';
        break;
      case 'BKN':
        directFactor = 0.40;
        diffuseFactor = 0.60;
        skyDesc = 'Broken Clouds';
        break;
      case 'SCT':
        directFactor = 0.70;
        diffuseFactor = 0.30;
        skyDesc = 'Scattered Clouds';
        break;
      case 'FEW':
        directFactor = 0.90;
        diffuseFactor = 0.10;
        skyDesc = 'Few Clouds';
        break;
      case 'CLR':
      case 'SKC':
      default:
        directFactor = 1.0;
        diffuseFactor = 0.0;
        skyDesc = 'Bright Direct Sun';
        break;
    }

    const sinAlt = Math.sin(Math.max(0.01, alt) * RAD);
    const directLux = 100000.0 * sinAlt * directFactor;
    const diffuseLux = 16000.0 * Math.pow(sinAlt, 0.6) * (diffuseFactor || 0.15);
    const totalLux = Math.max(10.0, directLux + diffuseLux);

    // EV100 = log2(Lux / 2.5) for standard incident daylight
    const ev100 = Math.log2(totalLux / 2.5);

    return {
      lux: Math.round(totalLux),
      ev100: Math.round(ev100 * 10) / 10,
      desc: skyDesc
    };
  }

  /**
   * Evaluates camera exposure and recommends the ideal ND filter.
   */
  function calculateNdRecommendation(options = {}) {
    const currentMode = options.mode || state.mode || 'cinematic';
    const cameraKey = options.cameraModel || state.cameraModel || 'dji_mini_4_pro_std';
    const profile = DRONE_CAMERA_OPTICS[cameraKey] || DRONE_CAMERA_OPTICS['dji_mini_4_pro_std'];

    // Resolve aperture
    let aperture = profile.isFixedAperture ? profile.defaultAperture : (parseFloat(options.aperture || state.aperture) || profile.defaultAperture);
    aperture = Math.max(profile.minAperture || 1.2, Math.min(profile.maxAperture || 22.0, aperture));

    // Resolve ISO
    const iso = Math.max(50, parseInt(options.iso || state.iso, 10) || 100);

    // Resolve EV100
    let ev100;
    let sceneDesc = 'Direct Daylight';
    let sceneLux = 80000;

    if (options.manualEvOverride != null && !isNaN(options.manualEvOverride)) {
      ev100 = parseFloat(options.manualEvOverride);
      sceneLux = Math.round(2.5 * Math.pow(2, ev100));
      sceneDesc = 'Manual EV Setting';
    } else {
      // Derive from solar position and weather if available
      let solarAlt = 45.0;
      let skyCode = 'CLR';

      if (typeof currentSolarEphemeris !== 'undefined' && currentSolarEphemeris && currentSolarEphemeris.currentPosition) {
        solarAlt = currentSolarEphemeris.currentPosition.altitudeDeg;
      }
      if (typeof SolarEphemeris !== 'undefined' && SolarEphemeris.getEffectiveSkyCover) {
        const sky = SolarEphemeris.getEffectiveSkyCover();
        if (sky && sky.code) skyCode = sky.code;
      }

      if (typeof options.solarAltDeg === 'number') solarAlt = options.solarAltDeg;
      if (typeof options.skyCoverCode === 'string') skyCode = options.skyCoverCode;

      const scene = calculateSceneLux(solarAlt, skyCode);
      ev100 = scene.ev100;
      sceneLux = scene.lux;
      sceneDesc = scene.desc;
    }

    // Base required shutter without filter:
    // T_base = N^2 / (2^EV * (ISO / 100))
    const isoRatio = iso / 100.0;
    const baseShutterSec = (aperture * aperture) / (Math.pow(2, ev100) * isoRatio);

    // Target shutter calculation
    let targetShutterSec = 1 / 60;
    let shutterLabel = '1/60s (30fps 180°)';
    let isPhotogrammetry = false;
    let warningNote = null;

    if (currentMode === 'photogrammetry') {
      isPhotogrammetry = true;
      // Photogrammetry requires freezing motion: >= 1/1000s
      targetShutterSec = 1 / 1000;
      shutterLabel = '≥ 1/1000s (Motion Freeze)';
    } else if (currentMode === 'cinematic') {
      const fps = parseInt(options.fps || state.fps, 10) || 30;
      targetShutterSec = 1 / (2 * fps);
      shutterLabel = `1/${Math.round(2 * fps)}s (${fps}fps 180° Rule)`;
    } else if (currentMode === 'long_exposure') {
      targetShutterSec = parseFloat(options.longExposureSec || state.longExposureSec) || 2.0;
      shutterLabel = `${targetShutterSec.toFixed(1)}s (Long Exposure)`;
    } else if (currentMode === 'custom') {
      targetShutterSec = parseFloat(options.customShutter || state.customShutter) || (1 / 60);
      shutterLabel = formatShutterSpeed(targetShutterSec);
    }

    // Determine required stops reduction
    let requiredStops = 0;
    let recommendedFilter = FILTER_CATALOG[0];

    if (isPhotogrammetry) {
      // In photogrammetry, pilots want high shutter speeds (no motion blur).
      // If base shutter is very fast (e.g. 1/3200s), that is beneficial, not detrimental!
      recommendedFilter = FILTER_CATALOG[0]; // 'none'
      requiredStops = 0;
      warningNote = 'For photogrammetry & 3D Gaussian splatting, NO ND filter is recommended. High shutter speeds prevent flight motion blur.';
    } else {
      if (targetShutterSec > baseShutterSec) {
        requiredStops = Math.log2(targetShutterSec / baseShutterSec);
      } else {
        requiredStops = 0;
      }

      // Match closest filter from catalog
      let bestDiff = Infinity;
      for (const filter of FILTER_CATALOG) {
        const diff = Math.abs(filter.stops - requiredStops);
        if (diff < bestDiff) {
          bestDiff = diff;
          recommendedFilter = filter;
        }
      }

      if (profile.isFixedAperture && profile.defaultAperture <= 1.8 && ev100 >= 14 && recommendedFilter.stops < 4) {
        warningNote = `Note: ${profile.name} has a wide fixed aperture (f/${profile.defaultAperture}). In bright sun, ND16 or ND32 is essential for 180° cinematic video.`;
      }
    }

    // Evaluate active/selected filter (auto or user-selected)
    const activeFilterId = options.selectedFilterId || state.selectedFilterId || recommendedFilter.id;
    const activeFilter = FILTER_CATALOG.find(f => f.id === activeFilterId) || recommendedFilter;

    const resultingShutterSec = baseShutterSec * activeFilter.factor;
    const exposureDeltaEv = Math.log2(resultingShutterSec / targetShutterSec);

    let exposureAssessment = 'Well Exposed';
    let assessmentColor = '#10b981'; // Green
    if (exposureDeltaEv > 0.6) {
      exposureAssessment = `+${exposureDeltaEv.toFixed(1)} EV (Overexposed - use heavier ND or faster shutter)`;
      assessmentColor = '#f59e0b'; // Amber
    } else if (exposureDeltaEv < -0.6) {
      exposureAssessment = `${exposureDeltaEv.toFixed(1)} EV (Underexposed - use lighter ND or raise ISO)`;
      assessmentColor = '#38bdf8'; // Blue
    }

    return {
      mode: currentMode,
      cameraProfile: profile,
      aperture,
      iso,
      ev100,
      sceneLux,
      sceneDesc,
      baseShutterSec,
      targetShutterSec,
      shutterLabel,
      requiredStops: Math.round(requiredStops * 10) / 10,
      recommendedFilter,
      activeFilter,
      resultingShutterSec,
      exposureDeltaEv: Math.round(exposureDeltaEv * 10) / 10,
      exposureAssessment,
      assessmentColor,
      warningNote,
      catalog: FILTER_CATALOG
    };
  }

  /**
   * Formats a shutter speed in seconds into standard fractional notation.
   */
  function formatShutterSpeed(sec) {
    if (sec == null || isNaN(sec) || sec <= 0) return '1/60s';
    if (sec >= 1.0) {
      return `${sec.toFixed(1)}s`;
    }
    const denom = Math.round(1 / sec);
    return `1/${denom}s`;
  }

  /**
   * Updates all UI representations across the application:
   * 1. Topbar Telemetry & Weather Pill badge (#header-nd-filter-badge)
   * 2. Topbar Telemetry & Weather Popover card (#pop-nd-filter-card)
   * 3. Section 3 Sun & Lighting Advisor row (#sun-advisor-nd-filter)
   * 4. Interactive Modal Box (#nd-filter-modal) if open
   */
  function updateAllNdUi() {
    if (typeof document === 'undefined' || !document || !document.getElementById) return;

    // Check if mission camera model is set in Section 3
    const cameraSelect = document.getElementById('camera-model');
    if (cameraSelect && cameraSelect.value && DRONE_CAMERA_OPTICS[cameraSelect.value]) {
      state.cameraModel = cameraSelect.value;
      const prof = DRONE_CAMERA_OPTICS[cameraSelect.value];
      if (prof.isFixedAperture) {
        state.aperture = prof.defaultAperture;
      }
    }

    // Check if active layer is hyperlapse or photogrammetry grid
    const gridTypeEl = document.getElementById('grid-type');
    const captureModeEl = document.getElementById('capture-mode');
    if (captureModeEl && captureModeEl.value === 'video') {
      if (state.mode === 'photogrammetry') state.mode = 'cinematic';
    }

    const rec = calculateNdRecommendation();

    // 1. Topbar Weather Pill Badge
    const headerBadge = document.getElementById('header-nd-filter-badge');
    if (headerBadge) {
      headerBadge.textContent = `📷 ${rec.activeFilter.badgeText}`;
      if (headerBadge.title !== undefined) {
        headerBadge.title = `Camera ND Filter: ${rec.activeFilter.label} (${rec.exposureAssessment}). Click to open ND Filter Advisor.`;
      }
      if (headerBadge.style) {
        if (rec.activeFilter.id === 'none') {
          headerBadge.style.color = '#38bdf8';
          headerBadge.style.borderColor = 'rgba(56, 189, 248, 0.35)';
        } else {
          headerBadge.style.color = '#fbbf24';
          headerBadge.style.borderColor = 'rgba(251, 191, 36, 0.4)';
        }
      }
    }

    // 2. Topbar Telemetry & Weather Popover Card
    const popBadge = document.getElementById('pop-nd-badge');
    const popSummary = document.getElementById('pop-nd-summary');
    const popShutterHint = document.getElementById('pop-nd-shutter-hint');
    if (popBadge) {
      popBadge.textContent = rec.activeFilter.label;
      if (popBadge.style) {
        popBadge.style.background = rec.activeFilter.id === 'none' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(245, 158, 11, 0.15)';
        popBadge.style.color = rec.activeFilter.id === 'none' ? '#38bdf8' : '#fbbf24';
        popBadge.style.borderColor = rec.activeFilter.id === 'none' ? 'rgba(56, 189, 248, 0.3)' : 'rgba(245, 158, 11, 0.3)';
      }
    }
    if (popSummary) {
      popSummary.textContent = `${rec.sceneDesc} (EV ${rec.ev100}) • ${rec.shutterLabel}`;
    }
    if (popShutterHint) {
      popShutterHint.textContent = `Base: ${formatShutterSpeed(rec.baseShutterSec)} → Filter: ${formatShutterSpeed(rec.resultingShutterSec)}`;
    }

    // 3. Section 3 Sun & Lighting Advisor row
    const advisorNd = document.getElementById('sun-advisor-nd-filter');
    if (advisorNd) {
      advisorNd.textContent = `${rec.activeFilter.label} (${rec.activeFilter.stops > 0 ? '-' + rec.activeFilter.stops + ' stops' : 'Clear'})`;
    }

    // 4. Modal UI Sync
    renderModalContent(rec);
  }

  /**
   * Renders details inside #nd-filter-modal
   */
  function renderModalContent(rec) {
    const modal = document.getElementById('nd-filter-modal');
    if (!modal || !modal.classList || typeof modal.classList.contains !== 'function' || modal.classList.contains('hidden')) return;

    // Environmental metrics
    const envAlt = document.getElementById('nd-env-solar-alt');
    const envSky = document.getElementById('nd-env-sky-cover');
    const envLux = document.getElementById('nd-env-lux');
    const envEv = document.getElementById('nd-env-ev');

    if (envAlt) envAlt.textContent = (typeof currentSolarEphemeris !== 'undefined' && currentSolarEphemeris?.currentPosition) ? `${currentSolarEphemeris.currentPosition.altitudeDeg.toFixed(1)}°` : '--°';
    if (envSky) envSky.textContent = rec.sceneDesc;
    if (envLux) envLux.textContent = `${rec.sceneLux.toLocaleString()} lx`;
    if (envEv) envEv.textContent = `EV ${rec.ev100}`;

    // Target Shutter & Base Shutter
    const baseShutterEl = document.getElementById('nd-metric-base-shutter');
    const targetShutterEl = document.getElementById('nd-metric-target-shutter');
    const stopsEl = document.getElementById('nd-metric-required-stops');
    const recBadge = document.getElementById('nd-recommended-badge');
    const recNote = document.getElementById('nd-recommendation-note');

    if (baseShutterEl) baseShutterEl.textContent = formatShutterSpeed(rec.baseShutterSec);
    if (targetShutterEl) targetShutterEl.textContent = formatShutterSpeed(rec.targetShutterSec);
    if (stopsEl) stopsEl.textContent = `${rec.requiredStops > 0 ? '-' + rec.requiredStops : '0'} Stops`;
    if (recBadge) recBadge.textContent = rec.recommendedFilter.label;
    if (recNote) {
      recNote.textContent = rec.warningNote || `Optimal match for ${rec.shutterLabel} on f/${rec.aperture.toFixed(1)} at ISO ${rec.iso}.`;
      recNote.style.color = rec.warningNote ? '#fbbf24' : 'var(--text-muted)';
    }

    // Aperture lock state for fixed aperture drones
    const apertureSelect = document.getElementById('nd-input-aperture');
    const apertureNotice = document.getElementById('nd-aperture-fixed-notice');
    if (apertureSelect) {
      apertureSelect.disabled = rec.cameraProfile.isFixedAperture;
      apertureSelect.value = String(rec.aperture);
    }
    if (apertureNotice) {
      apertureNotice.style.display = rec.cameraProfile.isFixedAperture ? 'inline-block' : 'none';
    }

    // Filter Chips Matrix
    const chipsContainer = document.getElementById('nd-filter-chips-container');
    if (chipsContainer) {
      chipsContainer.innerHTML = '';
      FILTER_CATALOG.forEach(filter => {
        const isRec = filter.id === rec.recommendedFilter.id;
        const isActive = filter.id === rec.activeFilter.id;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `nd-filter-chip ${isActive ? 'active' : ''} ${isRec ? 'recommended' : ''}`;
        btn.innerHTML = `
          <div class="nd-chip-header">
            <span class="nd-chip-name">${filter.label}</span>
            ${isRec ? '<span class="nd-chip-rec-tag">BEST</span>' : ''}
          </div>
          <div class="nd-chip-stops">${filter.stops === 0 ? '0 EV' : '-' + filter.stops + ' EV'}</div>
          <div class="nd-chip-trans">${filter.transmissionPct}%</div>
        `;
        btn.title = `${filter.label}: ${filter.description}`;
        btn.onclick = () => {
          state.selectedFilterId = filter.id;
          updateAllNdUi();
        };
        chipsContainer.appendChild(btn);
      });
    }

    // Active exposure preview result
    const previewShutter = document.getElementById('nd-preview-shutter');
    const previewDelta = document.getElementById('nd-preview-delta');
    if (previewShutter) previewShutter.textContent = formatShutterSpeed(rec.resultingShutterSec);
    if (previewDelta) {
      previewDelta.textContent = rec.exposureAssessment;
      previewDelta.style.color = rec.assessmentColor;
    }
  }

  function openNdFilterModal(initialPreset = null) {
    if (initialPreset && ['cinematic', 'photogrammetry', 'long_exposure', 'custom'].includes(initialPreset)) {
      state.mode = initialPreset;
    }
    const modal = document.getElementById('nd-filter-modal');
    if (modal) {
      modal.classList.remove('hidden');
      updateAllNdUi();
    }
  }

  function closeNdFilterModal() {
    const modal = document.getElementById('nd-filter-modal');
    if (modal) {
      modal.classList.add('hidden');
    }
  }

  function init() {
    // Bind modal toggle buttons
    const headerPillBadge = document.getElementById('header-nd-filter-badge');
    if (headerPillBadge) {
      headerPillBadge.addEventListener('click', (e) => {
        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
        openNdFilterModal();
      });
    }

    const popBtn = document.getElementById('pop-btn-open-nd-modal');
    if (popBtn) {
      popBtn.addEventListener('click', (e) => {
        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
        openNdFilterModal();
      });
    }

    const advisorBtn = document.getElementById('btn-open-nd-modal-advisor');
    if (advisorBtn) {
      advisorBtn.addEventListener('click', (e) => {
        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
        openNdFilterModal();
      });
    }

    const closeBtn = document.getElementById('close-nd-filter-modal-btn');
    if (closeBtn) closeBtn.addEventListener('click', closeNdFilterModal);

    const closeFooterBtn = document.getElementById('close-nd-filter-modal-footer-btn');
    if (closeFooterBtn) closeFooterBtn.addEventListener('click', closeNdFilterModal);

    const applyBtn = document.getElementById('apply-nd-filter-btn');
    if (applyBtn) {
      applyBtn.addEventListener('click', () => {
        const rec = calculateNdRecommendation();
        if (typeof showToast === 'function') {
          showToast(`Applied ${rec.activeFilter.label} to Mission Camera settings`);
        }
        closeNdFilterModal();
        updateAllNdUi();
      });
    }

    // Modal mode tabs
    const modeTabs = document.querySelectorAll('.nd-mode-tab-btn');
    modeTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const mode = tab.dataset.ndMode;
        if (mode) {
          state.mode = mode;
          state.selectedFilterId = null; // Reset to auto recommendation
          modeTabs.forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          updateAllNdUi();
        }
      });
    });

    // Modal input bindings
    const cameraSelect = document.getElementById('nd-input-camera');
    if (cameraSelect) {
      cameraSelect.addEventListener('change', (e) => {
        state.cameraModel = e.target.value;
        const prof = DRONE_CAMERA_OPTICS[e.target.value];
        if (prof) {
          state.aperture = prof.defaultAperture;
        }
        // Mirror to main Section 3 camera model if exists
        const mainCam = document.getElementById('camera-model');
        if (mainCam && mainCam.value !== e.target.value) {
          mainCam.value = e.target.value;
        }
        updateAllNdUi();
      });
    }

    const apertureSelect = document.getElementById('nd-input-aperture');
    if (apertureSelect) {
      apertureSelect.addEventListener('change', (e) => {
        state.aperture = parseFloat(e.target.value) || 2.8;
        updateAllNdUi();
      });
    }

    const isoSelect = document.getElementById('nd-input-iso');
    if (isoSelect) {
      isoSelect.addEventListener('change', (e) => {
        state.iso = parseInt(e.target.value, 10) || 100;
        updateAllNdUi();
      });
    }

    const fpsSelect = document.getElementById('nd-input-fps');
    if (fpsSelect) {
      fpsSelect.addEventListener('change', (e) => {
        state.fps = parseInt(e.target.value, 10) || 30;
        updateAllNdUi();
      });
    }

    const longExpSelect = document.getElementById('nd-input-long-exp');
    if (longExpSelect) {
      longExpSelect.addEventListener('change', (e) => {
        state.longExposureSec = parseFloat(e.target.value) || 2.0;
        updateAllNdUi();
      });
    }

    // Initial update
    updateAllNdUi();
  }

  return {
    DRONE_CAMERA_OPTICS,
    FILTER_CATALOG,
    calculateSceneLux,
    calculateNdRecommendation,
    formatShutterSpeed,
    updateAllNdUi,
    openNdFilterModal,
    closeNdFilterModal,
    init,
    getState: () => ({ ...state }),
    setState: (newState) => { Object.assign(state, newState); updateAllNdUi(); }
  };
})();

if (typeof window !== 'undefined') {
  window.NdFilterAdvisor = NdFilterAdvisor;
  window.openNdFilterModal = NdFilterAdvisor.openNdFilterModal;
  window.closeNdFilterModal = NdFilterAdvisor.closeNdFilterModal;
}

if (typeof global !== 'undefined') {
  global.NdFilterAdvisor = NdFilterAdvisor;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = NdFilterAdvisor;
}
