/**
 * Aalaapi Sky - Manned Aircraft Airspace Awareness (ADS-B Tracker Daemon)
 * 
 * Coordinates RTL-SDR.COM / dump1090 receivers on 1090 MHz to track manned aircraft
 * transponder frames near the active drone pilot position.
 * 
 * Features:
 * - Decodes Mode S SBS-1 / BaseStation CSV streams (TCP port 30003 or stdout)
 * - Decodes dump1090 aircraft.json REST/file payloads
 * - Computes Haversine horizontal distances, relative bearings, and cardinal vectors
 * - Performs spatial boundary and altitude ceiling deconfliction filtering
 * - Tracks aircraft state transitions (safe <-> breached) with automatic stale pruning
 * - Provides synthetic simulation injection for offline testing and demonstration
 */

const net = require('node:net');
const { spawn, execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const EARTH_RADIUS_METERS = 6371000;
const METERS_PER_STATUTE_MILE = 1609.344;
const METERS_PER_NAUTICAL_MILE = 1852.0;

const CARDINAL_POINTS = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'
];

/**
 * Calculates Haversine distance in meters between two lat/lon points.
 */
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const phi1 = lat1 * toRad;
  const phi2 = lat2 * toRad;

  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

/**
 * Calculates initial true bearing in degrees (0 - 360) from point 1 to point 2.
 */
function calculateBearing(lat1, lon1, lat2, lon2) {
  const toRad = Math.PI / 180;
  const phi1 = lat1 * toRad;
  const phi2 = lat2 * toRad;
  const lambda1 = lon1 * toRad;
  const lambda2 = lon2 * toRad;

  const y = Math.sin(lambda2 - lambda1) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) -
            Math.sin(phi1) * Math.cos(phi2) * Math.cos(lambda2 - lambda1);
  const deg = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  return Math.round(deg);
}

/**
 * Converts degrees (0 - 360) into 16-point cardinal compass string.
 */
function degreesToCardinal(deg) {
  const normalized = (deg % 360 + 360) % 360;
  const index = Math.round(normalized / 22.5) % 16;
  return CARDINAL_POINTS[index];
}

class AdsbAirspaceTracker {
  /**
   * @param {object} options
   * @param {number} [options.staleTimeoutMs=60000] Time in ms after which aircraft with no updates are pruned
   * @param {number} [options.tcpPort=30003] dump1090 SBS TCP port
   * @param {string} [options.tcpHost='127.0.0.1'] dump1090 SBS TCP host
   * @param {boolean} [options.autoConnect=false] Whether to attempt TCP connection immediately
   */
  constructor(options = {}) {
    this.staleTimeoutMs = options.staleTimeoutMs || 60000;
    this.tcpPort = options.tcpPort || 30003;
    this.tcpHost = options.tcpHost || '127.0.0.1';
    
    this.aircraft = new Map(); // hex -> aircraft state object
    this.totalPackets = 0;
    this.lastPacketTimestamp = 0;
    this.connected = false;
    this.connecting = false;
    this.socket = null;
    this.reconnectTimer = null;
    this.dumpProcess = null;
    this.driverType = 'unknown'; // 'dump1090-tcp' | 'dump1090-proc' | 'simulated' | 'disconnected'
    
    // Auto-clean interval
    this.cleanupTimer = setInterval(() => this.pruneStaleAircraft(), 15000);
    if (this.cleanupTimer.unref) this.cleanupTimer.unref();

    if (options.autoConnect) {
      this.connectTcp();
    }
  }

  /**
   * Parse a single line of BaseStation / SBS-1 CSV message.
   * Specification:
   * Field 0: Message type (MSG, SEL, ID, AIR, STA, CLK)
   * Field 1: Transmission type (1 - 8)
   * Field 4: Hex ident (ICAO 24-bit address)
   * Field 10: Callsign
   * Field 11: Altitude (feet)
   * Field 12: Ground speed (knots)
   * Field 13: Track (degrees)
   * Field 14: Latitude
   * Field 15: Longitude
   * Field 16: Vertical rate (fpm)
   * Field 17: Squawk
   * Field 21: Is on ground (0 = airborne, 1 = on ground)
   * 
   * @param {string} line 
   * @returns {object|null} Updated aircraft object or null
   */
  parseSbsMessage(line) {
    if (!line || typeof line !== 'string') return null;
    const parts = line.trim().split(',');
    if (parts.length < 5 || parts[0] !== 'MSG') return null;

    const transType = parseInt(parts[1], 10);
    const hex = (parts[4] || '').trim().toUpperCase();
    if (!hex || !/^[0-9A-F]{6}$/i.test(hex)) return null;

    this.totalPackets++;
    this.lastPacketTimestamp = Date.now();

    let record = this.aircraft.get(hex);
    if (!record) {
      record = {
        hex,
        callsign: null,
        latitude: null,
        longitude: null,
        altitude: null,
        altitudeGeometric: null,
        speed: null,
        track: null,
        verticalRate: null,
        squawk: null,
        isOnGround: false,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        packetCount: 0,
        dataSource: 'sbs-1'
      };
      this.aircraft.set(hex, record);
    }

    record.lastSeen = Date.now();
    record.packetCount++;

    // Callsign (MSG type 1)
    if (transType === 1 && parts[10] && parts[10].trim()) {
      record.callsign = parts[10].trim().replace(/[^A-Za-z0-9]/g, '');
    }

    // Airborne Position (MSG type 2, 3)
    if (transType === 2 || transType === 3) {
      if (parts[11] && !isNaN(parseInt(parts[11], 10))) {
        record.altitude = parseInt(parts[11], 10);
      }
      if (parts[14] && !isNaN(parseFloat(parts[14])) && parts[15] && !isNaN(parseFloat(parts[15]))) {
        const lat = parseFloat(parts[14]);
        const lon = parseFloat(parts[15]);
        if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 && (lat !== 0 || lon !== 0)) {
          record.latitude = lat;
          record.longitude = lon;
        }
      }
      if (parts[21] !== undefined) {
        record.isOnGround = parts[21] === '1' || parts[21] === '-1';
      }
    }

    // Airborne Velocity (MSG type 4)
    if (transType === 4) {
      if (parts[12] && !isNaN(parseFloat(parts[12]))) {
        record.speed = Math.round(parseFloat(parts[12]));
      }
      if (parts[13] && !isNaN(parseFloat(parts[13]))) {
        record.track = Math.round(parseFloat(parts[13]));
      }
      if (parts[16] && !isNaN(parseInt(parts[16], 10))) {
        record.verticalRate = parseInt(parts[16], 10);
      }
    }

    // Surveillance Altitude (MSG type 5, 7)
    if (transType === 5 || transType === 7) {
      if (parts[11] && !isNaN(parseInt(parts[11], 10))) {
        record.altitude = parseInt(parts[11], 10);
      }
      if (parts[21] !== undefined) {
        record.isOnGround = parts[21] === '1' || parts[21] === '-1';
      }
    }

    // Squawk (MSG type 6)
    if (transType === 6) {
      if (parts[17] && parts[17].trim()) {
        record.squawk = parts[17].trim();
      } else if (parts[16] && parts[16].trim() && /^[0-7]{4}$/.test(parts[16].trim())) {
        record.squawk = parts[16].trim();
      }
      if (parts[11] && !isNaN(parseInt(parts[11], 10))) {
        record.altitude = parseInt(parts[11], 10);
      }
    }

    return record;
  }

  /**
   * Ingest dump1090 JSON format (as produced in aircraft.json).
   * @param {object} json 
   * @returns {number} Number of aircraft updated
   */
  parseDump1090Json(json) {
    if (!json || !Array.isArray(json.aircraft)) return 0;
    let count = 0;
    const now = Date.now();

    for (const ac of json.aircraft) {
      if (!ac.hex || !/^[0-9A-F]{6}$/i.test(ac.hex)) continue;
      const hex = ac.hex.toUpperCase();

      this.totalPackets++;
      this.lastPacketTimestamp = now;

      let record = this.aircraft.get(hex);
      if (!record) {
        record = {
          hex,
          callsign: null,
          latitude: null,
          longitude: null,
          altitude: null,
          altitudeGeometric: null,
          speed: null,
          track: null,
          verticalRate: null,
          squawk: null,
          isOnGround: false,
          firstSeen: now,
          lastSeen: now,
          packetCount: 0,
          dataSource: 'dump1090-json'
        };
        this.aircraft.set(hex, record);
      }

      record.lastSeen = now;
      record.packetCount++;

      if (ac.flight && typeof ac.flight === 'string' && ac.flight.trim()) {
        record.callsign = ac.flight.trim();
      }
      if (typeof ac.lat === 'number' && typeof ac.lon === 'number') {
        record.latitude = ac.lat;
        record.longitude = ac.lon;
      }
      if (typeof ac.alt_baro === 'number') {
        record.altitude = ac.alt_baro;
      } else if (typeof ac.alt_geom === 'number') {
        record.altitude = ac.alt_geom;
      }
      if (typeof ac.alt_geom === 'number') {
        record.altitudeGeometric = ac.alt_geom;
      }
      if (typeof ac.track === 'number') {
        record.track = Math.round(ac.track);
      }
      if (typeof ac.speed === 'number' || typeof ac.gs === 'number') {
        record.speed = Math.round(ac.speed !== undefined ? ac.speed : ac.gs);
      }
      if (typeof ac.baro_rate === 'number' || typeof ac.geom_rate === 'number') {
        record.verticalRate = ac.baro_rate !== undefined ? ac.baro_rate : ac.geom_rate;
      }
      if (ac.squawk) {
        record.squawk = String(ac.squawk).trim();
      }
      if (ac.seen_pos !== undefined) {
        record.lastPositionSeen = now - (ac.seen_pos * 1000);
      }
      count++;
    }

    return count;
  }

  /**
   * Filter and classify tracked aircraft within user-specified proximity and altitude bounds.
   * 
   * @param {object} criteria
   * @param {number} criteria.homeLat Drone pilot / home latitude
   * @param {number} criteria.homeLon Drone pilot / home longitude
   * @param {number} [criteria.radiusMeters=4828.03] Proximity radius in meters (default 3 statute miles)
   * @param {number} [criteria.maxCeilingFeet=2500] Maximum warning ceiling in feet AGL/MSL (default 2500 ft)
   * @param {boolean} [criteria.includeSafe=true] Whether to include safe aircraft in the result list
   * @returns {object} Filtered results with vector calculations and breach status
   */
  getAirspaceBounds(criteria = {}) {
    const homeLat = typeof criteria.homeLat === 'number' ? criteria.homeLat : 0;
    const homeLon = typeof criteria.homeLon === 'number' ? criteria.homeLon : 0;
    const radiusMeters = typeof criteria.radiusMeters === 'number' && criteria.radiusMeters > 0 
      ? criteria.radiusMeters 
      : (3.0 * METERS_PER_STATUTE_MILE);
    const maxCeilingFeet = typeof criteria.maxCeilingFeet === 'number' && criteria.maxCeilingFeet > 0 
      ? criteria.maxCeilingFeet 
      : 2500;
    const includeSafe = criteria.includeSafe !== false;

    const hasValidHome = (homeLat !== 0 || homeLon !== 0) && Math.abs(homeLat) <= 90 && Math.abs(homeLon) <= 180;
    const now = Date.now();

    const activeList = [];
    let breachedCount = 0;
    let withinRadiusCount = 0;

    for (const [hex, ac] of this.aircraft.entries()) {
      // Discard stale records
      if (now - ac.lastSeen > this.staleTimeoutMs) continue;

      let distanceMeters = null;
      let distanceMiles = null;
      let distanceNm = null;
      let bearingDeg = null;
      let bearingCardinal = null;
      let isWithinRadius = false;
      let isBreached = false;
      let breachReason = 'safe';

      if (hasValidHome && ac.latitude !== null && ac.longitude !== null) {
        distanceMeters = Math.round(calculateHaversineDistance(homeLat, homeLon, ac.latitude, ac.longitude));
        distanceMiles = parseFloat((distanceMeters / METERS_PER_STATUTE_MILE).toFixed(2));
        distanceNm = parseFloat((distanceMeters / METERS_PER_NAUTICAL_MILE).toFixed(2));
        bearingDeg = calculateBearing(homeLat, homeLon, ac.latitude, ac.longitude);
        bearingCardinal = degreesToCardinal(bearingDeg);

        if (distanceMeters <= radiusMeters) {
          isWithinRadius = true;
          withinRadiusCount++;

          const alt = ac.altitude !== null ? ac.altitude : (ac.altitudeGeometric !== null ? ac.altitudeGeometric : null);
          if (alt !== null && alt <= maxCeilingFeet) {
            isBreached = true;
            breachedCount++;
            breachReason = 'proximity_and_altitude';
          } else if (alt === null) {
            // Altitude unknown but in proximity
            isBreached = true;
            breachedCount++;
            breachReason = 'proximity_unknown_altitude';
          } else {
            breachReason = 'proximity_above_ceiling';
          }
        }
      }

      if (isBreached || includeSafe) {
        activeList.push({
          hex: ac.hex,
          callsign: ac.callsign || `HEX:${ac.hex}`,
          latitude: ac.latitude,
          longitude: ac.longitude,
          altitude: ac.altitude,
          altitudeGeometric: ac.altitudeGeometric,
          speed: ac.speed,
          track: ac.track,
          verticalRate: ac.verticalRate,
          squawk: ac.squawk,
          isOnGround: ac.isOnGround,
          firstSeen: ac.firstSeen,
          lastSeen: ac.lastSeen,
          ageSeconds: Math.round((now - ac.lastSeen) / 1000),
          packetCount: ac.packetCount,
          dataSource: ac.dataSource,
          distanceMeters,
          distanceMiles,
          distanceNm,
          bearingDeg,
          bearingCardinal,
          isWithinRadius,
          isBreached,
          breachReason,
          status: isBreached ? 'breached' : 'safe'
        });
      }
    }

    // Sort: Breached aircraft first, then closest distance
    activeList.sort((a, b) => {
      if (a.isBreached && !b.isBreached) return -1;
      if (!a.isBreached && b.isBreached) return 1;
      const distA = a.distanceMeters !== null ? a.distanceMeters : Infinity;
      const distB = b.distanceMeters !== null ? b.distanceMeters : Infinity;
      return distA - distB;
    });

    return {
      success: true,
      timestamp: now,
      reference: {
        homeLat,
        homeLon,
        radiusMeters,
        radiusMiles: parseFloat((radiusMeters / METERS_PER_STATUTE_MILE).toFixed(2)),
        maxCeilingFeet
      },
      summary: {
        totalTracked: this.aircraft.size,
        activeAircraft: activeList.length,
        withinRadius: withinRadiusCount,
        breachedCount,
        hasBreach: breachedCount > 0
      },
      aircraft: activeList
    };
  }

  /**
   * Injects a synthetic aircraft record for testing or simulation.
   * @param {object} ac 
   * @returns {object}
   */
  injectSimulatedAircraft(ac = {}) {
    const hex = (ac.hex || 'A99999').toUpperCase();
    const now = Date.now();
    const record = {
      hex,
      callsign: ac.callsign || 'SIM101',
      latitude: ac.latitude !== undefined ? ac.latitude : (ac.lat !== undefined ? ac.lat : 40.0150),
      longitude: ac.longitude !== undefined ? ac.longitude : (ac.lon !== undefined ? ac.lon : -83.1700),
      altitude: ac.altitude !== undefined ? ac.altitude : (ac.alt !== undefined ? ac.alt : 1800),
      altitudeGeometric: ac.altitudeGeometric || ac.altitude || 1800,
      speed: ac.speed !== undefined ? ac.speed : 135,
      track: ac.track !== undefined ? ac.track : (ac.heading !== undefined ? ac.heading : 90),
      verticalRate: ac.verticalRate || 0,
      squawk: ac.squawk || '1200',
      isOnGround: !!ac.isOnGround,
      firstSeen: now,
      lastSeen: now,
      packetCount: 1,
      dataSource: 'simulated'
    };

    this.aircraft.set(hex, record);
    this.totalPackets++;
    this.lastPacketTimestamp = now;
    return record;
  }

  /**
   * Prunes aircraft not updated within staleTimeoutMs.
   */
  pruneStaleAircraft() {
    const now = Date.now();
    let pruned = 0;
    for (const [hex, ac] of this.aircraft.entries()) {
      if (now - ac.lastSeen > this.staleTimeoutMs) {
        this.aircraft.delete(hex);
        pruned++;
      }
    }
    return pruned;
  }

  /**
   * Clear all tracked aircraft.
   */
  clear() {
    this.aircraft.clear();
  }

  /**
   * Returns current hardware and receiver daemon status.
   */
  getStatus() {
    return {
      connected: this.connected,
      connecting: this.connecting,
      driverType: this.driverType,
      tcpHost: this.tcpHost,
      tcpPort: this.tcpPort,
      totalPackets: this.totalPackets,
      lastPacketTimestamp: this.lastPacketTimestamp,
      activeAircraftCount: this.aircraft.size
    };
  }

  /**
   * Connects to dump1090 TCP stream on port 30003.
   */
  connectTcp() {
    if (this.connected || this.connecting) return;
    this.connecting = true;

    try {
      this.socket = new net.Socket();
      let buffer = '';

      this.socket.connect(this.tcpPort, this.tcpHost, () => {
        this.connected = true;
        this.connecting = false;
        this.driverType = 'dump1090-tcp';
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
      });

      this.socket.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop(); // Keep incomplete tail
        for (const line of lines) {
          if (line.trim()) {
            this.parseSbsMessage(line);
          }
        }
      });

      this.socket.on('error', () => {
        this.connected = false;
        this.connecting = false;
      });

      this.socket.on('close', () => {
        this.connected = false;
        this.connecting = false;
        this.scheduleReconnect();
      });
    } catch (e) {
      this.connected = false;
      this.connecting = false;
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectTcp();
    }, 10000);
    if (this.reconnectTimer.unref) this.reconnectTimer.unref();
  }

  /**
   * Shuts down any active socket or timer.
   */
  destroy() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    if (this.dumpProcess) {
      try { this.dumpProcess.kill(); } catch (e) {}
      this.dumpProcess = null;
    }
    this.connected = false;
    this.connecting = false;
  }
}

module.exports = {
  AdsbAirspaceTracker,
  calculateHaversineDistance,
  calculateBearing,
  degreesToCardinal,
  EARTH_RADIUS_METERS,
  METERS_PER_STATUTE_MILE,
  METERS_PER_NAUTICAL_MILE
};
