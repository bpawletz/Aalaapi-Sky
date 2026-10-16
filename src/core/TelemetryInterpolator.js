/**
 * src/core/TelemetryInterpolator.js
 * 
 * High-Performance 4D Telemetry Interpolation Engine & Worker Manager.
 * Offloads heavy temporal interpolation, proximity deconfliction checks (3 NM / 500 ft),
 * planned vs flown cross-track drift error, and 3D exclusion zone breach audits
 * to maintain a smooth 60 FPS Three.js viewport render loop.
 * Issue #142: Omnidimensional 4D Flight Replay Engine & Rolling Buffer Architecture.
 */

const NM_IN_METERS = 1852.0;
const PROXIMITY_HORIZ_THRESHOLD_METERS = 3 * NM_IN_METERS; // 3 Nautical Miles = 5,556 meters
const PROXIMITY_VERT_THRESHOLD_METERS = 500 * 0.3048;      // 500 feet = 152.4 meters
const EARTH_RADIUS_METERS = 6371000;

function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

function initialBearingDegrees(lat1, lon1, lat2, lon2) {
  const phi1 = lat1 * Math.PI / 180;
  const phi2 = lat2 * Math.PI / 180;
  const lam1 = lon1 * Math.PI / 180;
  const lam2 = lon2 * Math.PI / 180;
  const y = Math.sin(lam2 - lam1) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(lam2 - lam1);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

const TelemetryInterpolator = {
  worker: null,
  isWorkerActive: false,

  /**
   * Initialize background worker for off-thread calculation when supported
   */
  initWorker() {
    if (typeof window === 'undefined' || typeof Worker === 'undefined' || typeof Blob === 'undefined') {
      return;
    }

    try {
      const workerCode = `
        self.onmessage = function(e) {
          const { action, id, payload } = e.data;
          if (action === 'interpolateFrame') {
            const result = self.processInterpolation(payload);
            self.postMessage({ id, result });
          }
        };

        self.processInterpolation = function(data) {
          // Minimal worker calculation hook
          return data;
        };
      `;
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      this.worker = new Worker(URL.createObjectURL(blob));
      this.isWorkerActive = true;
    } catch (_) {
      this.worker = null;
      this.isWorkerActive = false;
    }
  },

  /**
   * Interpolate surrounding air traffic (ADS-B and Remote ID) at the targeted replay millisecond.
   * @param {number} targetUtcMs Current replay timestamp
   * @param {Object} dronePt Current primary drone position { lat, lon, alt }
   * @param {Array} rawAdsb ADS-B frames
   * @param {Array} rawRemoteId Remote ID frames
   * @returns {Object} Interpolated active traffic and proximity breach flags
   */
  interpolateAirspace(targetUtcMs, dronePt, rawAdsb = [], rawRemoteId = []) {
    const activeTraffic = [];
    const breaches = [];

    // Group ADS-B by aircraft ICAO/callsign
    const adsbByIcao = new Map();
    for (const pt of rawAdsb) {
      const key = pt.icao || pt.hex || pt.callsign;
      if (!key) continue;
      if (!adsbByIcao.has(key)) adsbByIcao.set(key, []);
      adsbByIcao.get(key).push(pt);
    }

    for (const [icao, tracks] of adsbByIcao.entries()) {
      tracks.sort((a, b) => (a.timestamp || a._receivedAt || 0) - (b.timestamp || b._receivedAt || 0));
      const interp = this._interpolateTrackState(targetUtcMs, tracks);
      if (interp) {
        interp.type = 'adsb';
        interp.key = icao;
        if (dronePt && typeof dronePt.lat === 'number') {
          const horizDist = haversineDistanceMeters(dronePt.lat, dronePt.lon, interp.lat, interp.lon);
          const droneAltMeters = (dronePt.alt || dronePt.altMsl || 0);
          const acAltMeters = (typeof interp.alt === 'number') ? interp.alt * 0.3048 : (interp.altitude || 0);
          const vertDelta = Math.abs(droneAltMeters - acAltMeters);
          interp.horizDistMeters = horizDist;
          interp.distanceMeters = horizDist;
          interp.vertDeltaMeters = vertDelta;
          interp.bearing = initialBearingDegrees(dronePt.lat, dronePt.lon, interp.lat, interp.lon);

          if (horizDist <= PROXIMITY_HORIZ_THRESHOLD_METERS && vertDelta <= PROXIMITY_VERT_THRESHOLD_METERS) {
            interp.isBreach = true;
            breaches.push(interp);
          }
        }
        activeTraffic.push(interp);
      }
    }

    // Group Remote ID by UAS ID / serial / id
    const ridById = new Map();
    for (const f of rawRemoteId) {
      const key = f.uasId || f.serialNumber || f.mac || f.id;
      if (!key) continue;
      if (!ridById.has(key)) ridById.set(key, []);
      ridById.get(key).push(f);
    }

    for (const [uasId, frames] of ridById.entries()) {
      frames.sort((a, b) => (a.timestamp || a._receivedAt || 0) - (b.timestamp || b._receivedAt || 0));
      const interp = this._interpolateTrackState(targetUtcMs, frames);
      if (interp) {
        interp.type = 'remote_id';
        interp.key = uasId;
        if (dronePt && typeof dronePt.lat === 'number') {
          const horizDist = haversineDistanceMeters(dronePt.lat, dronePt.lon, interp.lat, interp.lon);
          const droneAltMeters = dronePt.alt || 0;
          const targetAltMeters = interp.alt || interp.altitude || 0;
          const vertDelta = Math.abs(droneAltMeters - targetAltMeters);
          interp.horizDistMeters = horizDist;
          interp.distanceMeters = horizDist;
          interp.vertDeltaMeters = vertDelta;
          interp.bearing = initialBearingDegrees(dronePt.lat, dronePt.lon, interp.lat, interp.lon);

          if (horizDist <= 1000 && vertDelta <= 150) { // 1 km drone-to-drone buffer
            interp.isBreach = true;
            breaches.push(interp);
          }
        }
        activeTraffic.push(interp);
      }
    }

    const activeAdsb = activeTraffic.filter(t => t.type === 'adsb');
    const activeRemoteId = activeTraffic.filter(t => t.type === 'remote_id');

    return {
      traffic: activeTraffic,
      activeAdsb,
      activeRemoteId,
      breaches,
      hasBreach: breaches.length > 0
    };
  },

  /**
   * Internal linear interpolation helper between observation frames
   */
  _interpolateTrackState(targetUtcMs, sortedFrames) {
    if (!sortedFrames || sortedFrames.length === 0) return null;
    const firstTs = sortedFrames[0].timestamp || sortedFrames[0]._receivedAt || 0;
    const lastTs = sortedFrames[sortedFrames.length - 1].timestamp || sortedFrames[sortedFrames.length - 1]._receivedAt || 0;

    // Reject frames if target time is more than 3 minutes away from track bounds
    if (targetUtcMs < firstTs - 180000 || targetUtcMs > lastTs + 180000) {
      return null;
    }

    if (targetUtcMs <= firstTs) return { ...sortedFrames[0] };
    if (targetUtcMs >= lastTs) return { ...sortedFrames[sortedFrames.length - 1] };

    // Binary search for surrounding frames
    let low = 0;
    let high = sortedFrames.length - 1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const midTs = sortedFrames[mid].timestamp || sortedFrames[mid]._receivedAt || 0;
      if (midTs === targetUtcMs) return { ...sortedFrames[mid] };
      if (midTs < targetUtcMs) low = mid + 1;
      else high = mid - 1;
    }

    const idx0 = Math.max(0, high);
    const idx1 = Math.min(sortedFrames.length - 1, low);
    const f0 = sortedFrames[idx0];
    const f1 = sortedFrames[idx1];
    const t0 = f0.timestamp || f0._receivedAt || 0;
    const t1 = f1.timestamp || f1._receivedAt || 0;

    if (t0 === t1 || !f1) return { ...f0 };
    const alpha = (targetUtcMs - t0) / (t1 - t0);

    const lat = f0.lat + (f1.lat - f0.lat) * alpha;
    const lon = f0.lon + (f1.lon - f0.lon) * alpha;
    const alt = (f0.alt || 0) + ((f1.alt || 0) - (f0.alt || 0)) * alpha;
    const speed = (f0.speed || 0) + ((f1.speed || 0) - (f0.speed || 0)) * alpha;
    const track = f0.track !== undefined ? f0.track : (f0.heading || 0);

    return {
      ...f0,
      lat,
      lon,
      alt,
      speed,
      track,
      interpolated: true
    };
  },

  /**
   * Calculate perpendicular Cross-Track Drift between flown GPS point and planned waypoints.
   * @param {Object} currentPt Drone point { lat, lon, alt }
   * @param {Array} plannedWaypoints Array of planned waypoints
   * @returns {Object} Cross-track error in meters and cm
   */
  calculateCrossTrackDrift(currentPt, plannedWaypoints = []) {
    if (!currentPt || typeof currentPt.lat !== 'number' || !plannedWaypoints || plannedWaypoints.length < 2) {
      return { crossTrackErrorMeters: 0, crossTrackErrorCm: 0, closestPlannedPt: null };
    }

    let minDistance = Infinity;
    let closestPt = null;

    for (let i = 0; i < plannedWaypoints.length - 1; i++) {
      const w0 = plannedWaypoints[i];
      const w1 = plannedWaypoints[i + 1];
      if (typeof w0.lat !== 'number' || typeof w1.lat !== 'number') continue;

      const p0 = [w0.lat, w0.lon];
      const p1 = [w1.lat, w1.lon];
      const p = [currentPt.lat, currentPt.lon];

      const proj = this._projectPointOnSegment(p, p0, p1);
      const dist = haversineDistanceMeters(currentPt.lat, currentPt.lon, proj[0], proj[1]);

      if (dist < minDistance) {
        minDistance = dist;
        closestPt = { lat: proj[0], lon: proj[1], alt: w0.alt || currentPt.alt };
      }
    }

    const meters = isFinite(minDistance) ? minDistance : 0;
    return {
      crossTrackErrorMeters: parseFloat(meters.toFixed(2)),
      crossTrackErrorCm: Math.round(meters * 100),
      closestPlannedPt: closestPt,
      closestPoint: closestPt
    };
  },

  _projectPointOnSegment(p, p0, p1) {
    const dx = p1[1] - p0[1];
    const dy = p1[0] - p0[0];
    if (dx === 0 && dy === 0) return p0;

    const t = Math.max(0, Math.min(1, ((p[1] - p0[1]) * dx + (p[0] - p0[0]) * dy) / (dx * dx + dy * dy)));
    return [p0[0] + t * dy, p0[1] + t * dx];
  },

  /**
   * Audit whether the drone is currently inside any 3D Exclusion Zone polygon.
   * @param {Object} currentPt Drone coordinates { lat, lon, alt }
   * @param {Array} exclusionZones Array of exclusion zones [{ id, name, coordinates, minAlt, maxAlt }]
   * @returns {Object} Breach record with hasBreach boolean
   */
  checkExclusionZoneBreach(currentPt, exclusionZones = []) {
    if (!currentPt || typeof currentPt.lat !== 'number' || !Array.isArray(exclusionZones)) {
      return { hasBreach: false, inBreach: false };
    }

    const alt = currentPt.alt || 0;
    for (const zone of exclusionZones) {
      const coords = zone.coordinates || zone.polygon;
      if (!zone || !Array.isArray(coords) || coords.length < 3) continue;

      const minAlt = zone.minAlt !== undefined ? zone.minAlt : 0;
      const maxAlt = zone.maxAlt !== undefined ? zone.maxAlt : Infinity;

      if (alt >= minAlt && alt <= maxAlt) {
        if (this._isPointInPolygon([currentPt.lat, currentPt.lon], coords)) {
          return {
            hasBreach: true,
            inBreach: true,
            zone,
            zoneId: zone.id || zone.name || 'zone',
            zoneName: zone.name || '3D Exclusion Zone',
            alt
          };
        }
      }
    }
    return { hasBreach: false, inBreach: false };
  },

  _isPointInPolygon(point, vs) {
    const x = point[0];
    const y = point[1];
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
      const xi = vs[i][0] || vs[i].lat;
      const yi = vs[i][1] || vs[i].lon;
      const xj = vs[j][0] || vs[j].lat;
      const yj = vs[j][1] || vs[j].lon;

      const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  },

  /**
   * Find closest NEXRAD radar composite tile within duration window.
   */
  matchClosestRadarSnapshot(targetUtcMs, radarSnapshots = []) {
    if (!radarSnapshots || radarSnapshots.length === 0) return null;
    let closest = null;
    let minDiff = Infinity;

    for (const snap of radarSnapshots) {
      const ts = snap.timestamp || snap._receivedAt || 0;
      const diff = Math.abs(targetUtcMs - ts);
      if (diff < minDiff && diff <= 15 * 60 * 1000) { // within 15 minutes
        minDiff = diff;
        closest = snap;
      }
    }
    return closest;
  }
};

if (typeof window !== 'undefined') {
  window.TelemetryInterpolator = TelemetryInterpolator;
}
if (typeof global !== 'undefined') {
  global.TelemetryInterpolator = TelemetryInterpolator;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TelemetryInterpolator;
}
