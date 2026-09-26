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
    
    this.silent = options.silent !== undefined ? options.silent : (process.env.NODE_ENV === 'test');
    this.lastWaitingLog = 0;
    this.lastSightLog = new Map();
    this.cachedHardware = null;
    this.cachedHardwareTime = 0;

    // Auto-clean interval
    this.cleanupTimer = setInterval(() => this.pruneStaleAircraft(), 15000);
    if (this.cleanupTimer.unref) this.cleanupTimer.unref();

    if (options.autoConnect) {
      this.connectTcp();
    }
  }

  /**
   * Diagnostic logger formatted with timestamps.
   */
  log(tag, msg) {
    if (this.silent) return;
    const timeStr = new Date().toLocaleTimeString();
    console.log(`\x1b[36m[${timeStr}]\x1b[0m \x1b[33m${tag}\x1b[0m ${msg}`);
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
        dataSource: 'sbs-1',
        history: []
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
          if (!record.history) record.history = [];
          const lastPt = record.history[record.history.length - 1];
          if (!lastPt || Math.abs(lastPt[0] - lat) > 0.0001 || Math.abs(lastPt[1] - lon) > 0.0001) {
            record.history.push([lat, lon, record.altitude || 0, Date.now()]);
            if (record.history.length > 60) record.history.shift();
          }
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

    // Log live aircraft sightings (throttled to once per 15s per aircraft)
    const nowLog = Date.now();
    const lastLog = this.lastSightLog.get(hex) || 0;
    if (record.callsign && record.altitude !== null && nowLog - lastLog > 15000) {
      this.lastSightLog.set(hex, nowLog);
      const posStr = (record.latitude && record.longitude) ? `${record.latitude.toFixed(4)}, ${record.longitude.toFixed(4)}` : 'Position pending';
      this.log('[ADS-B]', `Traffic Sighting: ${record.callsign} (${hex}) | Alt: ${record.altitude} ft | Speed: ${record.speed || 0} kts | ${posStr}`);
    }

    return record;
  }

  /**
   * Ingest Raw Mode S AVR frame (e.g. *895cf42534660206ed8c4552ec34; or @000000000000*...; format).
   * Decodes DF11, DF17, DF18 ICAO addresses, Type Codes 1-4 (callsign), 5-8 (ground status),
   * and 9-18, 20-22 (barometric and GNSS altitude).
   * @param {string} line
   * @returns {object|null} Updated aircraft object or null
   */
  parseAvrMessage(line) {
    if (!line || typeof line !== 'string') return null;
    let clean = line.trim();
    if (clean.startsWith('@')) {
      // Strip AVR timestamp prefix (@ followed by 12 hex digits)
      clean = clean.substring(13);
    }
    if (clean.startsWith('*')) {
      clean = clean.substring(1);
    }
    if (clean.endsWith(';')) {
      clean = clean.substring(0, clean.length - 1);
    }
    clean = clean.trim();
    if (!/^[0-9A-Fa-f]{14}$|^[0-9A-Fa-f]{28}$/.test(clean)) return null;

    const rawBytes = Buffer.from(clean, 'hex');
    const df = (rawBytes[0] >> 3) & 0x1F;
    let hex = null;

    // DF 11 (All-Call), DF 17 (Extended Squitter), DF 18 (Non-transponder Extended Squitter / ADS-R / TIS-B)
    if (df === 11 || df === 17 || df === 18) {
      hex = clean.substring(2, 8).toUpperCase();
    }

    this.totalPackets++;
    this.lastPacketTimestamp = Date.now();

    if (!hex || !/^[0-9A-F]{6}$/i.test(hex)) return null;

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
        dataSource: 'mode-s-avr',
        history: []
      };
      this.aircraft.set(hex, record);
    }

    record.lastSeen = Date.now();
    record.packetCount++;

    // For DF17 / DF18 (112-bit = 28 hex chars), decode ME field (bytes 4..10)
    if (clean.length === 28 && (df === 17 || df === 18)) {
      const tc = (rawBytes[4] >> 3) & 0x1F;
      // Type Codes 1-4: Aircraft Identification (Callsign)
      if (tc >= 1 && tc <= 4) {
        const b = [rawBytes[5], rawBytes[6], rawBytes[7], rawBytes[8], rawBytes[9], rawBytes[10]];
        const charset = '?ABCDEFGHIJKLMNOPQRSTUVWXYZ????? ???????????????0123456789??????';
        const c = [
          b[0] >> 2,
          ((b[0] & 0x03) << 4) | (b[1] >> 4),
          ((b[1] & 0x0F) << 2) | (b[2] >> 6),
          b[2] & 0x3F,
          b[3] >> 2,
          ((b[3] & 0x03) << 4) | (b[4] >> 4),
          ((b[4] & 0x0F) << 2) | (b[5] >> 6),
          b[5] & 0x3F
        ];
        const cs = c.map(val => charset[val] || ' ').join('').trim().replace(/[^A-Za-z0-9]/g, '');
        if (cs) record.callsign = cs;
      } else if (tc >= 5 && tc <= 8) {
        // Type Codes 5-8: Surface Position (aircraft is on the ground)
        record.isOnGround = true;
      } else if ((tc >= 9 && tc <= 18) || (tc >= 20 && tc <= 22)) {
        // Type Codes 9-18: Airborne Position (Baro Altitude)
        // Type Codes 20-22: Airborne Position (GNSS Altitude)
        record.isOnGround = false;
        const altCode = (rawBytes[5] << 4) | ((rawBytes[6] >> 4) & 0x0F);
        // Bit 4 of altCode is the Q-bit (0x10)
        if ((altCode & 0x10) !== 0) {
          const n = ((altCode >> 5) << 4) | (altCode & 0x0F);
          const altFt = (n * 25) - 1000;
          if (altFt >= -1000 && altFt <= 85000) {
            record.altitude = altFt;
            if (tc >= 20) {
              record.altitudeGeometric = altFt;
            }
          }
        }
      } else if (tc === 19) {
        // Airborne Velocity
        record.isOnGround = false;
      }
    }

    // Throttled logging for live sightings
    const nowLog = Date.now();
    const lastLog = this.lastSightLog.get(hex) || 0;
    if (record.callsign && record.altitude !== null && nowLog - lastLog > 15000) {
      this.lastSightLog.set(hex, nowLog);
      const posStr = (record.latitude && record.longitude) ? `${record.latitude.toFixed(4)}, ${record.longitude.toFixed(4)}` : 'Position pending';
      this.log('[ADS-B]', `Traffic Sighting (Mode S): ${record.callsign} (${hex}) | Alt: ${record.altitude} ft | ${posStr}`);
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
          dataSource: 'dump1090-json',
          history: []
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
        if (!record.history) record.history = [];
        const lastPt = record.history[record.history.length - 1];
        if (!lastPt || Math.abs(lastPt[0] - ac.lat) > 0.0001 || Math.abs(lastPt[1] - ac.lon) > 0.0001) {
          const altVal = typeof ac.alt_baro === 'number' ? ac.alt_baro : (typeof ac.alt_geom === 'number' ? ac.alt_geom : 0);
          record.history.push([ac.lat, ac.lon, altVal, now]);
          if (record.history.length > 60) record.history.shift();
        }
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
          hasPosition: (ac.latitude !== null && ac.longitude !== null),
          distanceMeters,
          distanceMiles,
          distanceNm,
          bearingDeg,
          bearingCardinal,
          isWithinRadius,
          isBreached,
          breachReason,
          status: isBreached ? 'breached' : 'safe',
          history: Array.isArray(ac.history) ? ac.history : []
        });
      }
    }

    // Sort: Breached aircraft first, then closest distance, with position-having aircraft prioritized
    activeList.sort((a, b) => {
      if (a.isBreached && !b.isBreached) return -1;
      if (!a.isBreached && b.isBreached) return 1;
      if (a.hasPosition && !b.hasPosition) return -1;
      if (!a.hasPosition && b.hasPosition) return 1;
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
        withPosition: activeList.filter(a => a.hasPosition).length,
        positionPending: activeList.filter(a => !a.hasPosition).length,
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
      dataSource: 'simulated',
      history: Array.isArray(ac.history) ? [...ac.history] : [
        [(ac.latitude !== undefined ? ac.latitude : (ac.lat !== undefined ? ac.lat : 40.0150)) + 0.012, (ac.longitude !== undefined ? ac.longitude : (ac.lon !== undefined ? ac.lon : -83.1700)) + 0.012, 2200, now - 30000],
        [(ac.latitude !== undefined ? ac.latitude : (ac.lat !== undefined ? ac.lat : 40.0150)) + 0.006, (ac.longitude !== undefined ? ac.longitude : (ac.lon !== undefined ? ac.lon : -83.1700)) + 0.006, 2000, now - 15000],
        [(ac.latitude !== undefined ? ac.latitude : (ac.lat !== undefined ? ac.lat : 40.0150)), (ac.longitude !== undefined ? ac.longitude : (ac.lon !== undefined ? ac.lon : -83.1700)), (ac.altitude !== undefined ? ac.altitude : (ac.alt !== undefined ? ac.alt : 1800)), now]
      ]
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
   * Scans system USB peripherals for RTL-SDR dongle presence and driver health.
   * Caches results for 10 seconds to eliminate repeated CLI overhead.
   * @returns {{ detected: boolean, driverStatus: string, deviceName: string|null, details: string }}
   */
  detectHardware() {
    const now = Date.now();
    if (this.cachedHardware && (now - this.cachedHardwareTime < 10000)) {
      return this.cachedHardware;
    }

    let result = {
      detected: false,
      driverStatus: 'not_found',
      deviceName: null,
      details: 'No RTL-SDR USB dongle detected.'
    };

    if (process.platform === 'win32') {
      try {
        const { execSync } = require('node:child_process');
        const out = execSync('pnputil /enum-devices /connected', { encoding: 'utf8', timeout: 3000 });
        if (out.includes('0BDA&PID_2838') || out.includes('0BDA&PID_2832')) {
          result.detected = true;
          result.deviceName = 'Realtek RTL2832U / RTL-SDR';
          const blocks = out.split(/(?=Instance ID:)/g);
          const rtlBlocks = blocks.filter(b => b.includes('0BDA&PID_2838') || b.includes('0BDA&PID_2832'));
          const hasProblem = rtlBlocks.some(b => b.includes('Problem Code: 28') || b.includes('Status:                     Problem'));
          if (hasProblem) {
            result.driverStatus = 'needs_zadig';
            result.details = 'RTL-SDR USB dongle detected, but WinUSB driver is missing (Problem Code 28). Please run Zadig to install WinUSB driver.';
          } else {
            result.driverStatus = 'ready';
            result.details = 'RTL-SDR USB dongle detected and WinUSB driver is operational.';
          }
        }
      } catch (e) {
        result.driverStatus = 'error';
        result.details = e.message;
      }
    } else if (process.platform === 'linux') {
      try {
        const { execSync } = require('node:child_process');
        const out = execSync('lsusb', { encoding: 'utf8', timeout: 3000 });
        if (/0bda:2838|0bda:2832/i.test(out)) {
          result.detected = true;
          result.driverStatus = 'ready';
          result.deviceName = 'Realtek RTL2832U / RTL-SDR';
          result.details = 'RTL-SDR USB dongle detected via lsusb.';
        }
      } catch (e) {}
    }

    this.cachedHardware = result;
    this.cachedHardwareTime = now;
    return result;
  }

  /**
   * Returns current hardware and receiver daemon status.
   */
  /**
   * Dynamically updates the target ADS-B / dump1090 TCP server host and port.
   * Closes any existing socket connection and immediately attempts to connect to the new server.
   * @param {object} config
   * @param {string} [config.tcpHost]
   * @param {number|string} [config.tcpPort]
   */
  updateServerConfig(config = {}) {
    if (config.tcpHost && typeof config.tcpHost === 'string') {
      const trimmedHost = config.tcpHost.trim();
      if (trimmedHost) {
        this.tcpHost = trimmedHost;
      }
    }
    if (config.tcpPort !== undefined && config.tcpPort !== null) {
      const portNum = parseInt(config.tcpPort, 10);
      if (!isNaN(portNum) && portNum > 0 && portNum <= 65535) {
        this.tcpPort = portNum;
      }
    }

    this.lastWaitingLog = 0;

    if (this.socket) {
      try { this.socket.destroy(); } catch (e) {}
      this.socket = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.connected = false;
    this.connecting = false;

    this.log('[ADS-B TRACKER]', `Target server updated to ${this.tcpHost}:${this.tcpPort}. Reconnecting...`);
    this.connectTcp();
    return { success: true, tcpHost: this.tcpHost, tcpPort: this.tcpPort };
  }

  getStatus() {
    const hw = this.detectHardware();
    const isRemoteServer = (this.tcpHost !== '127.0.0.1' && this.tcpHost !== 'localhost');
    return {
      connected: this.connected,
      connecting: this.connecting,
      driverType: this.driverType,
      tcpHost: this.tcpHost,
      tcpPort: this.tcpPort,
      isRemoteServer,
      totalPackets: this.totalPackets,
      lastPacketTimestamp: this.lastPacketTimestamp,
      activeAircraftCount: this.aircraft.size,
      hardware: hw
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
      if (this.socket.unref) this.socket.unref();
      this.socket.setTimeout(2500);
      let buffer = '';

      this.socket.on('timeout', () => {
        const wasConnected = this.connected;
        this.connected = false;
        this.connecting = false;
        if (this.socket) {
          try { this.socket.destroy(); } catch (e) {}
          this.socket = null;
        }
        if (wasConnected) {
          this.log('[ADS-B TRACKER]', `Connection timeout to dump1090 on ${this.tcpHost}:${this.tcpPort}. Reconnecting in 10s...`);
        }
      });

      this.socket.connect(this.tcpPort, this.tcpHost, () => {
        if (this.socket) {
          this.socket.setTimeout(0);
          if (this.socket.unref) this.socket.unref();
        }
        this.connected = true;
        this.connecting = false;
        this.driverType = 'dump1090-tcp';
        this.log('[ADS-B TRACKER]', `Connected to dump1090 daemon on ${this.tcpHost}:${this.tcpPort} - streaming Mode S frames`);
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
          const trimmed = line.trim();
          if (!trimmed) continue;
          if (trimmed.startsWith('*') || trimmed.startsWith('@')) {
            this.parseAvrMessage(trimmed);
          } else if (trimmed.startsWith('MSG')) {
            this.parseSbsMessage(trimmed);
          } else if (/^[0-9A-Fa-f]{14};?$|^[0-9A-Fa-f]{28};?$/.test(trimmed)) {
            this.parseAvrMessage(trimmed);
          } else {
            this.parseSbsMessage(trimmed);
          }
        }
      });

      this.socket.on('error', () => {
        const wasConnected = this.connected;
        this.connected = false;
        this.connecting = false;
        const now = Date.now();
        if (wasConnected) {
          this.log('[ADS-B TRACKER]', `Lost connection to dump1090 on ${this.tcpHost}:${this.tcpPort}. Reconnecting in 10s...`);
        } else if (!this.lastWaitingLog || now - this.lastWaitingLog > 60000) {
          this.lastWaitingLog = now;
          this.log('[ADS-B TRACKER]', `Waiting for dump1090 daemon on ${this.tcpHost}:${this.tcpPort} (Ensure dump1090 is running with --net)...`);
        }
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
