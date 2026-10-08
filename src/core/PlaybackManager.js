/**
 * src/core/PlaybackManager.js
 *
 * Unified Mission Replay & Playback State Manager for Aalaapi Sky.
 * Orchestrates real-time telemetry playback, timeline scrubbing, speed control,
 * and temporal synchronization across the 2D Leaflet map, HUD overlays,
 * and 3D Digital Twin viewer.
 */

const PlaybackManager = {
  activeFlightId: null,
  activeFlightName: null,
  telemetryData: null,
  points: [],
  plannedWaypoints: null,
  isPlaying: false,
  playbackSpeed: 1.0,
  currentIndex: 0,
  fractionalIndex: 0.0,
  durationSeconds: 0,
  elapsedSeconds: 0,
  is2dReplayActive: false,
  isHistorical: false,
  radarCacheMode: 'cached', // 'cached' | 'live'
  
  _listeners: {
    timeupdate: [],
    play: [],
    pause: [],
    seek: [],
    flightchange: [],
    replaymode: []
  },

  _animFrameId: null,
  _lastTickTime: null,

  /**
   * Register event listener
   * @param {'timeupdate'|'play'|'pause'|'seek'|'flightchange'|'replaymode'} event
   * @param {Function} callback
   */
  on(event, callback) {
    if (this._listeners[event] && typeof callback === 'function') {
      this._listeners[event].push(callback);
    }
  },

  /**
   * Unregister event listener
   */
  off(event, callback) {
    if (this._listeners[event]) {
      this._listeners[event] = this._listeners[event].filter(cb => cb !== callback);
    }
  },

  /**
   * Emit event to all registered listeners
   */
  emit(event, ...args) {
    if (this._listeners[event]) {
      this._listeners[event].forEach(cb => {
        try {
          cb(...args);
        } catch (err) {
          console.error(`Error in PlaybackManager listener for ${event}:`, err);
        }
      });
    }
  },

  /**
   * Retrieve custom name for a flight from localStorage
   */
  getCustomFlightName(flightId) {
    if (!flightId) return '';
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem('aalaapi_custom_flight_names');
        if (raw) {
          const map = JSON.parse(raw);
          if (map && map[flightId]) return map[flightId];
        }
      }
    } catch (_) {}
    return '';
  },

  /**
   * Save a user-defined custom name for a flight in localStorage
   */
  setCustomFlightName(flightId, customName) {
    if (!flightId) return;
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem('aalaapi_custom_flight_names');
        const map = raw ? JSON.parse(raw) : {};
        if (customName && customName.trim()) {
          map[flightId] = customName.trim();
        } else {
          delete map[flightId];
        }
        localStorage.setItem('aalaapi_custom_flight_names', JSON.stringify(map));
        this.emit('flightchange', { flightId, customName: map[flightId] || null });
      }
    } catch (_) {}
  },

  /**
   * Load a flight into the unified playback manager
   */
  loadFlight(flightId, telemetryData, options = {}) {
    this.pause();
    this.activeFlightId = flightId;
    this.telemetryData = telemetryData;
    this.points = (telemetryData && Array.isArray(telemetryData.points)) ? telemetryData.points : [];
    this.plannedWaypoints = options.plannedWaypoints || null;
    this.isHistorical = options.isHistorical !== undefined ? !!options.isHistorical : (flightId !== 'active-mission');

    const storedName = this.getCustomFlightName(flightId);
    this.activeFlightName = storedName || options.name || flightId;

    this.currentIndex = 0;
    this.fractionalIndex = 0.0;
    this.elapsedSeconds = 0;

    // Calculate total duration
    if (this.points.length > 1) {
      const firstPt = this.points[0];
      const lastPt = this.points[this.points.length - 1];
      if (firstPt.timestamp && lastPt.timestamp) {
        this.durationSeconds = Math.max(1, (new Date(lastPt.timestamp) - new Date(firstPt.timestamp)) / 1000);
      } else if (telemetryData && telemetryData.totalDuration) {
        this.durationSeconds = telemetryData.totalDuration;
      } else {
        // Fallback estimate: 1 second per telemetry point or calculated from speed & distance
        this.durationSeconds = Math.max(1, this.points.length);
      }
    } else {
      this.durationSeconds = 0;
    }

    this.emit('flightchange', {
      flightId: this.activeFlightId,
      name: this.activeFlightName,
      pointCount: this.points.length,
      duration: this.durationSeconds,
      isHistorical: this.isHistorical
    });

    this.seekTo(0, { updateSlider: true });
  },

  /**
   * Play the telemetry track
   */
  play() {
    if (this.isPlaying) return;
    if (!this.points || this.points.length < 2) return;

    if (this.currentIndex >= this.points.length - 1) {
      this.currentIndex = 0;
      this.fractionalIndex = 0.0;
    }

    this.isPlaying = true;
    this._lastTickTime = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    this.emit('play');

    this._startLoop();
  },

  /**
   * Pause playback
   */
  pause() {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    if (this._animFrameId) {
      if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(this._animFrameId);
      this._animFrameId = null;
    }
    this.emit('pause');
  },

  /**
   * Toggle between play and pause
   */
  togglePlay() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  },

  /**
   * Set playback speed multiplier (e.g. 0.5, 1, 2, 5, 10)
   */
  setSpeed(speed) {
    const s = parseFloat(speed);
    if (!isNaN(s) && s > 0) {
      this.playbackSpeed = s;
    }
  },

  /**
   * Set radar cache mode for historical replay
   * @param {'cached'|'live'} mode
   */
  setRadarCacheMode(mode) {
    if (mode === 'cached' || mode === 'live') {
      this.radarCacheMode = mode;
      this.emit('replaymode', {
        active: this.is2dReplayActive,
        radarCacheMode: this.radarCacheMode
      });
    }
  },

  /**
   * Seek to a specific index or fractional progress (0.0 to 1.0)
   */
  seekTo(target, options = {}) {
    if (!this.points || this.points.length === 0) return;
    const maxIdx = this.points.length - 1;

    let targetIdx;
    if (typeof target === 'number') {
      if (options.isFraction) {
        targetIdx = Math.max(0, Math.min(target * maxIdx, maxIdx));
      } else {
        targetIdx = Math.max(0, Math.min(target, maxIdx));
      }
    } else {
      targetIdx = 0;
    }

    this.fractionalIndex = targetIdx;
    this.currentIndex = Math.min(Math.floor(targetIdx), maxIdx);

    const pt = this.getInterpolatedPoint();
    if (this.durationSeconds > 0 && maxIdx > 0) {
      this.elapsedSeconds = (targetIdx / maxIdx) * this.durationSeconds;
    }

    this.emit('seek', {
      index: this.currentIndex,
      fractionalIndex: this.fractionalIndex,
      progress: maxIdx > 0 ? (targetIdx / maxIdx) : 0,
      point: pt,
      elapsedSeconds: this.elapsedSeconds
    });

    this.emit('timeupdate', {
      index: this.currentIndex,
      fractionalIndex: this.fractionalIndex,
      progress: maxIdx > 0 ? (targetIdx / maxIdx) : 0,
      point: pt,
      elapsedSeconds: this.elapsedSeconds
    });
  },

  /**
   * Get current interpolated point with smooth lat, lon, alt, speed, and heading
   */
  getInterpolatedPoint() {
    if (!this.points || this.points.length === 0) return null;
    const maxIdx = this.points.length - 1;
    if (maxIdx === 0) return this.points[0];

    const idxFloor = Math.max(0, Math.min(Math.floor(this.fractionalIndex), maxIdx));
    const idxCeil = Math.min(idxFloor + 1, maxIdx);
    const alpha = this.fractionalIndex - idxFloor;

    const p0 = this.points[idxFloor];
    const p1 = this.points[idxCeil];

    if (!p1 || idxFloor === idxCeil || alpha <= 0.0001) {
      return { ...p0 };
    }

    // Helper for angles (degrees) shortest-path interpolation
    const lerpAngle = (a, b, t) => {
      if (a === undefined || a === null || isNaN(a)) return b || 0;
      if (b === undefined || b === null || isNaN(b)) return a || 0;
      let diff = (b - a) % 360;
      if (diff > 180) diff -= 360;
      if (diff < -180) diff += 360;
      return (a + diff * t + 360) % 360;
    };

    const lat = p0.lat + (p1.lat - p0.lat) * alpha;
    const lon = p0.lon + (p1.lon - p0.lon) * alpha;
    const alt = (p0.alt || 0) + ((p1.alt || 0) - (p0.alt || 0)) * alpha;
    const speed = (p0.speed || 0) + ((p1.speed || 0) - (p0.speed || 0)) * alpha;
    const yaw = lerpAngle(p0.yaw, p1.yaw, alpha);
    const heading = lerpAngle(p0.heading || p0.yaw, p1.heading || p1.yaw, alpha);
    const gimbalPitch = (p0.gimbalPitch !== undefined ? p0.gimbalPitch : -60) +
      (((p1.gimbalPitch !== undefined ? p1.gimbalPitch : -60) - (p0.gimbalPitch !== undefined ? p0.gimbalPitch : -60)) * alpha);

    return {
      lat,
      lon,
      alt,
      speed,
      yaw,
      heading,
      gimbalPitch,
      isPhoto: p0.isPhoto || false,
      timestamp: p0.timestamp || null
    };
  },

  /**
   * Activate or deactivate 2D Replay mode on the map
   */
  set2dReplayActive(active) {
    this.is2dReplayActive = !!active;
    this.emit('replaymode', {
      active: this.is2dReplayActive,
      radarCacheMode: this.radarCacheMode
    });
  },

  /**
   * Internal playback tick loop
   */
  _startLoop() {
    const tick = () => {
      if (!this.isPlaying) return;

      const now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
      const dt = Math.min((now - (this._lastTickTime || now)) / 1000, 0.25);
      this._lastTickTime = now;

      const maxIdx = this.points.length - 1;
      if (maxIdx > 0) {
        // Advance fractionalIndex
        // Base rate: points per second = maxIdx / durationSeconds
        const pointsPerSec = (this.durationSeconds > 0) ? (maxIdx / this.durationSeconds) : 10;
        const step = dt * pointsPerSec * this.playbackSpeed;

        this.fractionalIndex += step;

        if (this.fractionalIndex >= maxIdx) {
          this.fractionalIndex = maxIdx;
          this.currentIndex = maxIdx;
          this.pause();
        } else {
          this.currentIndex = Math.floor(this.fractionalIndex);
        }

        const pt = this.getInterpolatedPoint();
        if (this.durationSeconds > 0) {
          this.elapsedSeconds = (this.fractionalIndex / maxIdx) * this.durationSeconds;
        }

        this.emit('timeupdate', {
          index: this.currentIndex,
          fractionalIndex: this.fractionalIndex,
          progress: this.fractionalIndex / maxIdx,
          point: pt,
          elapsedSeconds: this.elapsedSeconds
        });
      }

      if (this.isPlaying) {
        if (typeof requestAnimationFrame !== 'undefined') {
          this._animFrameId = requestAnimationFrame(tick);
        } else {
          this._animFrameId = setTimeout(tick, 30);
        }
      }
    };

    if (typeof requestAnimationFrame !== 'undefined') {
      this._animFrameId = requestAnimationFrame(tick);
    } else {
      this._animFrameId = setTimeout(tick, 30);
    }
  }
};

// Global export for vanilla scripts & tests
if (typeof window !== 'undefined') {
  window.PlaybackManager = PlaybackManager;
}
if (typeof globalThis !== 'undefined') {
  globalThis.PlaybackManager = PlaybackManager;
}
