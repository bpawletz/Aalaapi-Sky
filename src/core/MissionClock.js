/**
 * src/core/MissionClock.js
 *
 * Global Mission Time & Temporal Epoch Manager for Aalaapi Sky.
 * Orchestrates unified mission time across real-time execution, planned schedules,
 * and historical flight telemetry replay.
 * Synchronizes 2D Leaflet shadow projection vectors, 3D Three.js sunlight/sun orb,
 * solar ephemeris, and waypoint specular glare constraints.
 */

const MissionClock = {
  mode: 'live', // 'live' | 'planned' | 'playback'
  plannedDate: null,
  playbackDate: null,
  autoSyncPlayback: true,
  liveTickerInterval: null,
  isInitialized: false,

  /**
   * Initialize MissionClock, bind UI listeners and start live clock tick
   */
  init() {
    if (this.isInitialized || typeof document === 'undefined') return;
    this.isInitialized = true;

    // Load persisted auto-sync preference
    try {
      if (typeof localStorage !== 'undefined') {
        const storedSync = localStorage.getItem('aalaapi_mission_time_autosync');
        if (storedSync !== null) {
          this.autoSyncPlayback = storedSync === 'true';
        }
      }
    } catch (_) {}

    this.bindUIEventListeners();
    this.updateUI();

    // Start background ticker for live mode (updates every 15 seconds)
    if (!this.liveTickerInterval && typeof setInterval === 'function') {
      this.liveTickerInterval = setInterval(() => {
        if (this.mode === 'live') {
          this.updateUI();
          this.dispatchTimeUpdates();
        }
      }, 15000);
    }

    // Subscribe to PlaybackManager events if available
    if (typeof PlaybackManager !== 'undefined' && typeof PlaybackManager.on === 'function') {
      PlaybackManager.on('timeupdate', (e) => {
        if (this.autoSyncPlayback && e && e.point && e.point.timestamp) {
          const d = new Date(e.point.timestamp);
          if (!isNaN(d.getTime())) {
            this.setPlaybackTime(d, false);
          }
        }
      });
      PlaybackManager.on('seek', (e) => {
        if (this.autoSyncPlayback && e && e.point && e.point.timestamp) {
          const d = new Date(e.point.timestamp);
          if (!isNaN(d.getTime())) {
            this.setPlaybackTime(d, true);
          }
        }
      });
    }
  },

  /**
   * Returns active effective Date for the entire mission
   * @returns {Date}
   */
  getEffectiveTime() {
    if (this.mode === 'playback' && this.playbackDate instanceof Date && !isNaN(this.playbackDate.getTime())) {
      return this.playbackDate;
    }
    if (this.mode === 'planned' && this.plannedDate instanceof Date && !isNaN(this.plannedDate.getTime())) {
      return this.plannedDate;
    }
    return new Date();
  },

  /**
   * Set mission time mode ('live' | 'planned' | 'playback')
   * @param {'live'|'planned'|'playback'} newMode
   * @param {Date|null} customDate
   */
  setMode(newMode, customDate = null) {
    if (newMode !== 'live' && newMode !== 'planned' && newMode !== 'playback') return;
    this.mode = newMode;

    if (customDate instanceof Date && !isNaN(customDate.getTime())) {
      if (newMode === 'planned') this.plannedDate = new Date(customDate);
      if (newMode === 'playback') this.playbackDate = new Date(customDate);
    } else if (newMode === 'planned' && !this.plannedDate) {
      this.plannedDate = new Date();
    }

    this.updateUI();
    this.dispatchTimeUpdates();
  },

  /**
   * Set planned flight departure date/time
   * @param {Date} date
   */
  setPlannedTime(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) return;
    this.plannedDate = new Date(date);
    this.setMode('planned', this.plannedDate);
  },

  /**
   * Set historical playback timestamp (from flight log or 3D replay)
   * @param {Date} date
   * @param {boolean} forceRefresh
   */
  setPlaybackTime(date, forceRefresh = false) {
    if (!(date instanceof Date) || isNaN(date.getTime())) return;
    this.playbackDate = new Date(date);
    if (this.mode !== 'playback') {
      this.mode = 'playback';
    }
    this.updateUI();
    this.dispatchTimeUpdates(forceRefresh);
  },

  /**
   * Switch back to real-time live clock
   */
  setLive() {
    this.setMode('live');
  },

  /**
   * Formats a date for the HTML datetime-local input (YYYY-MM-DDTHH:mm)
   * @param {Date} d
   * @returns {string}
   */
  formatDateForInput(d) {
    if (!(d instanceof Date) || isNaN(d.getTime())) d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const year = d.getFullYear();
    const month = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const hours = pad(d.getHours());
    const mins = pad(d.getMinutes());
    return `${year}-${month}-${day}T${hours}:${mins}`;
  },

  /**
   * Formats date for topbar pill display
   * @param {Date} d
   * @returns {string}
   */
  formatPillTime(d) {
    if (!(d instanceof Date) || isNaN(d.getTime())) d = new Date();
    const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (this.mode === 'live') {
      return `Live: ${timeStr}`;
    }
    const monthStr = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    if (this.mode === 'planned') {
      return `Planned: ${monthStr}, ${timeStr}`;
    }
    return `Replay: ${monthStr}, ${timeStr}`;
  },

  /**
   * Trigger app-wide time updates (solar ephemeris, 3D sun, 2D shadows, glare warnings)
   */
  dispatchTimeUpdates(forceFull = true) {
    const effective = this.getEffectiveTime();

    // 1. Update Solar Ephemeris calculations
    if (typeof updateSolarEphemeris === 'function') {
      updateSolarEphemeris(null, null, effective);
    }

    // 2. Update 2D Map Sun Vector and Shadow Projection Cones
    if (forceFull && typeof renderSolarOverlay2D === 'function') {
      let lat = 41.3215, lon = -88.9950;
      if (typeof centerMarker !== 'undefined' && centerMarker && typeof centerMarker.getLatLng === 'function') {
        const ll = centerMarker.getLatLng();
        lat = ll.lat;
        lon = ll.lng;
      }
      renderSolarOverlay2D(lat, lon);
    }

    // 3. Update 3D Directional Sunlight and Sun Orb in Three.js
    if (typeof update3DSunPosition === 'function') {
      update3DSunPosition();
    }
  },

  /**
   * Updates all DOM elements reflecting mission time
   */
  updateUI() {
    if (typeof document === 'undefined') return;

    const effective = this.getEffectiveTime();

    // Topbar Pill
    const pill = document.getElementById('header-mission-time-pill');
    const label = document.getElementById('header-time-label');
    const icon = document.getElementById('header-time-mode-icon');

    if (pill) {
      pill.classList.remove('is-live', 'is-planned', 'is-playback');
      if (this.mode === 'live') pill.classList.add('is-live');
      else if (this.mode === 'planned') pill.classList.add('is-planned');
      else pill.classList.add('is-playback');
    }

    if (label) {
      label.textContent = this.formatPillTime(effective);
    }

    if (icon) {
      if (this.mode === 'live') icon.textContent = '⚡';
      else if (this.mode === 'planned') icon.textContent = '📅';
      else icon.textContent = '▶';
    }

    // Popover Controls
    const btnLive = document.getElementById('btn-mtime-mode-live');
    const btnPlanned = document.getElementById('btn-mtime-mode-planned');
    const btnPlayback = document.getElementById('btn-mtime-mode-playback');
    const inputTime = document.getElementById('mission-time-input');
    const statusPill = document.getElementById('mtime-status-pill');
    const autoSyncChk = document.getElementById('mission-time-autosync-chk');

    const setActiveBtn = (btn, active, activeColor) => {
      if (!btn) return;
      if (active) {
        btn.classList.add('active');
        btn.style.background = activeColor;
        btn.style.borderColor = activeColor.replace('0.2', '0.5');
        btn.style.color = '#f8fafc';
      } else {
        btn.classList.remove('active');
        btn.style.background = 'transparent';
        btn.style.borderColor = 'transparent';
        btn.style.color = 'var(--text-muted)';
      }
    };

    setActiveBtn(btnLive, this.mode === 'live', 'rgba(6, 182, 212, 0.25)');
    setActiveBtn(btnPlanned, this.mode === 'planned', 'rgba(245, 158, 11, 0.25)');
    setActiveBtn(btnPlayback, this.mode === 'playback', 'rgba(168, 85, 247, 0.25)');

    if (inputTime && document.activeElement !== inputTime) {
      inputTime.value = this.formatDateForInput(effective);
      inputTime.disabled = (this.mode === 'live');
    }

    if (statusPill) {
      if (this.mode === 'live') {
        statusPill.textContent = '⚡ Live Clock';
        statusPill.style.color = 'var(--accent-cyan)';
      } else if (this.mode === 'planned') {
        statusPill.textContent = '📅 Planned Schedule';
        statusPill.style.color = '#fbbf24';
      } else {
        statusPill.textContent = '▶ Replay Sync';
        statusPill.style.color = '#c084fc';
      }
    }

    if (autoSyncChk) {
      autoSyncChk.checked = this.autoSyncPlayback;
    }

    // Update Popover Mini-Solar Preview
    if (typeof SolarEphemeris !== 'undefined' && SolarEphemeris) {
      let lat = 41.3215, lon = -88.9950;
      if (typeof centerMarker !== 'undefined' && centerMarker && typeof centerMarker.getLatLng === 'function') {
        const ll = centerMarker.getLatLng();
        lat = ll.lat;
        lon = ll.lng;
      }
      const pos = SolarEphemeris.getSunPosition(effective, lat, lon);
      const lq = SolarEphemeris.getLightingQuality(pos.altitudeDeg, effective);

      const anglesEl = document.getElementById('mtime-preview-angles');
      const badgeEl = document.getElementById('mtime-preview-badge');

      if (anglesEl) {
        const sign = pos.altitudeDeg >= 0 ? '+' : '';
        anglesEl.textContent = `${sign}${pos.altitudeDeg.toFixed(1)}° Alt • ${pos.azimuthDeg.toFixed(0)}° Az`;
      }
      if (badgeEl && lq) {
        badgeEl.textContent = lq.badge;
        badgeEl.style.color = lq.color;
        badgeEl.style.borderColor = lq.color;
        badgeEl.style.background = lq.color === '#10b981' ? 'rgba(16, 185, 129, 0.15)' : (lq.color === '#38bdf8' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(245, 158, 11, 0.15)');
      }
    }
  },

  /**
   * Bind event listeners for topbar button, popover, mode selectors, and presets
   */
  bindUIEventListeners() {
    const pill = document.getElementById('header-mission-time-pill');
    const popover = document.getElementById('mission-time-popover');
    const closeBtn = document.getElementById('mission-time-popover-close-btn');

    if (pill) {
      pill.onclick = (e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        this.togglePopover();
      };
    }

    if (closeBtn) {
      closeBtn.onclick = (e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        this.togglePopover(false);
      };
    }

    const btnLive = document.getElementById('btn-mtime-mode-live');
    if (btnLive) {
      btnLive.onclick = (e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        this.setLive();
      };
    }

    const btnPlanned = document.getElementById('btn-mtime-mode-planned');
    if (btnPlanned) {
      btnPlanned.onclick = (e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        this.setPlannedTime(this.plannedDate || new Date());
      };
    }

    const btnPlayback = document.getElementById('btn-mtime-mode-playback');
    if (btnPlayback) {
      btnPlayback.onclick = (e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        this.setMode('playback', this.playbackDate || new Date());
      };
    }

    const inputTime = document.getElementById('mission-time-input');
    if (inputTime) {
      inputTime.onchange = (e) => {
        const val = e.target.value;
        if (val) {
          const parsed = new Date(val);
          if (!isNaN(parsed.getTime())) {
            this.setPlannedTime(parsed);
          }
        }
      };
    }

    // Presets
    const presetNow = document.getElementById('mtime-preset-now');
    if (presetNow) {
      presetNow.onclick = (e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        this.setLive();
      };
    }

    const presetNoon = document.getElementById('mtime-preset-noon');
    if (presetNoon) {
      presetNoon.onclick = (e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        let lat = 41.3215, lon = -88.9950;
        if (typeof centerMarker !== 'undefined' && centerMarker && typeof centerMarker.getLatLng === 'function') {
          const ll = centerMarker.getLatLng();
          lat = ll.lat;
          lon = ll.lng;
        }
        const effective = this.getEffectiveTime();
        if (typeof SolarEphemeris !== 'undefined') {
          const times = SolarEphemeris.getSolarTimesForDay(effective, lat, lon);
          if (times && times.noon) {
            this.setPlannedTime(times.noon);
          }
        }
      };
    }

    const presetGolden = document.getElementById('mtime-preset-golden');
    if (presetGolden) {
      presetGolden.onclick = (e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        let lat = 41.3215, lon = -88.9950;
        if (typeof centerMarker !== 'undefined' && centerMarker && typeof centerMarker.getLatLng === 'function') {
          const ll = centerMarker.getLatLng();
          lat = ll.lat;
          lon = ll.lng;
        }
        const effective = this.getEffectiveTime();
        if (typeof SolarEphemeris !== 'undefined') {
          const times = SolarEphemeris.getSolarTimesForDay(effective, lat, lon);
          if (times && times.official && times.official.set) {
            // Golden hour: 45 min before sunset
            const golden = new Date(times.official.set.getTime() - 45 * 60000);
            this.setPlannedTime(golden);
          }
        }
      };
    }

    const presetPrevH = document.getElementById('mtime-preset-prev-h');
    if (presetPrevH) {
      presetPrevH.onclick = (e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        const effective = this.getEffectiveTime();
        const adjusted = new Date(effective.getTime() - 3600000);
        this.setPlannedTime(adjusted);
      };
    }

    const presetNextH = document.getElementById('mtime-preset-next-h');
    if (presetNextH) {
      presetNextH.onclick = (e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        const effective = this.getEffectiveTime();
        const adjusted = new Date(effective.getTime() + 3600000);
        this.setPlannedTime(adjusted);
      };
    }

    const autoSyncChk = document.getElementById('mission-time-autosync-chk');
    if (autoSyncChk) {
      autoSyncChk.onchange = (e) => {
        this.autoSyncPlayback = e.target.checked;
        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('aalaapi_mission_time_autosync', String(this.autoSyncPlayback));
          }
        } catch (_) {}
      };
    }
  },

  /**
   * Toggle popover visibility
   * @param {boolean|null} forceState
   */
  togglePopover(forceState) {
    const popover = document.getElementById('mission-time-popover');
    if (!popover) return;

    const shouldOpen = typeof forceState === 'boolean' ? forceState : popover.classList.contains('hidden');
    if (shouldOpen) {
      popover.classList.remove('hidden');
      this.updateUI();

      // Close other popovers for mutual exclusivity
      const weatherPop = document.getElementById('telemetry-weather-popover');
      if (weatherPop) weatherPop.classList.add('hidden');
      const bridgePop = document.getElementById('bridge-status-popover');
      if (bridgePop) bridgePop.classList.add('hidden');
    } else {
      popover.classList.add('hidden');
    }
  }
};

if (typeof window !== 'undefined') {
  window.MissionClock = MissionClock;
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => MissionClock.init());
  } else if (document.getElementById && document.getElementById('header-mission-time-pill')) {
    MissionClock.init();
  } else if (typeof document.addEventListener === 'function') {
    document.addEventListener('DOMContentLoaded', () => MissionClock.init());
  }
}
