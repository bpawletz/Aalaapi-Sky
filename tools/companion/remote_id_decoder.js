/**
 * ASTM F3411-19 / ASTM F3411-22 OpenDroneID Broadcast Remote ID Decoder
 * Pure JavaScript decoder for Bluetooth LE (UUID 0xFFFA) and Wi-Fi Remote ID payloads.
 */

const UA_TYPES = [
  'None',
  'Aeroplane',
  'Helicopter (Multirotor)',
  'Gyroplane',
  'Hybrid Lift',
  'Ornithopter',
  'Glider',
  'Kite',
  'Free Balloon',
  'Airship',
  'Free Fall / Parachute',
  'Rocket',
  'Tethered Powered Aircraft',
  'Ground Obstacle',
  'Other'
];

const OP_STATUS = [
  'Undeclared',
  'Ground',
  'Airborne',
  'Emergency',
  'RemoteID System Failure'
];

const ID_TYPES = [
  'None',
  'Serial Number (ANSI/CTA-2063-A)',
  'CAA Registration ID',
  'UTM Assigned UUID',
  'Specific Session ID'
];

/**
 * Decode a 25-byte ASTM F3411 message block.
 * @param {Uint8Array|Buffer|number[]} bytes - Exactly 25 bytes
 * @returns {object|null} Decoded message object
 */
function decodeOdidMessage(bytes) {
  if (!bytes || bytes.length < 25) return null;
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);

  const header = buf[0];
  const msgType = (header >> 4) & 0x0F;
  const protoVersion = header & 0x0F;

  switch (msgType) {
    case 0x0: // Basic ID
      return decodeBasicId(buf, protoVersion);
    case 0x1: // Location / Vector
      return decodeLocation(buf, protoVersion);
    case 0x2: // Authentication
      return decodeAuth(buf, protoVersion);
    case 0x3: // Self-ID
      return decodeSelfId(buf, protoVersion);
    case 0x4: // System
      return decodeSystem(buf, protoVersion);
    case 0x5: // Operator ID
      return decodeOperatorId(buf, protoVersion);
    default:
      return { msgType, protoVersion, raw: buf.toString('hex') };
  }
}

function decodeBasicId(buf, protoVersion) {
  const idTypeRaw = (buf[1] >> 4) & 0x0F;
  const uaTypeRaw = buf[1] & 0x0F;

  // 20-byte UAS ID string
  const uasIdBytes = buf.subarray(2, 22);
  let nullIdx = uasIdBytes.indexOf(0);
  if (nullIdx === -1) nullIdx = 20;
  let rawIdStr = uasIdBytes.subarray(0, nullIdx).toString('ascii').trim().replace(/^["']+|["']+$/g, '');
  if (rawIdStr.startsWith('FFA3')) {
    rawIdStr = rawIdStr.substring(1);
  }
  
  // Real ASTM Remote ID UAS IDs (ANSI/CTA-2063-A or CAA registration or session ID)
  // MUST be at least 6 alphanumeric characters and not just random punctuation/symbols
  if (rawIdStr.length < 6 || !/^[A-Za-z0-9\-_]{6,20}$/.test(rawIdStr)) {
    return null;
  }
  
  // Must have a valid ID type code (1: Serial Number, 2: CAA Reg, 3: UTM UUID, 4: Session ID)
  if (idTypeRaw < 1 || idTypeRaw > 4) {
    return null;
  }

  return {
    msgType: 0,
    msgTypeName: 'Basic ID',
    protoVersion,
    idType: ID_TYPES[idTypeRaw] || `Unknown (${idTypeRaw})`,
    idTypeCode: idTypeRaw,
    uaType: UA_TYPES[uaTypeRaw] || `Unknown (${uaTypeRaw})`,
    uaTypeCode: uaTypeRaw,
    uasId: rawIdStr
  };
}

function decodeLocation(buf, protoVersion) {
  const statusRaw = (buf[1] >> 4) & 0x0F;
  const heightTypeRaw = buf[1] & 0x0F;

  const trackDir = buf[2] <= 180 ? buf[2] * 2 : (buf[2] === 255 ? null : buf[2]); // Track direction in degrees (0-360)
  const speedH = buf[3] === 255 ? null : buf[3] * 0.25; // Speed horizontal in m/s
  const speedV = buf[4] === 255 ? null : buf.readInt8(4) * 0.5; // Speed vertical in m/s

  const latInt = buf.readInt32LE(5);
  const lonInt = buf.readInt32LE(9);
  let lat = Math.round((latInt / 1e7) * 1e7) / 1e7;
  let lon = Math.round((lonInt / 1e7) * 1e7) / 1e7;

  // Validate coordinate ranges according to ASTM F3411
  // 0x00000000 or 0x7FFFFFFF (2147483647) means No Fix / Invalid
  if (latInt === 0 || latInt === 0x7FFFFFFF || lat < -90 || lat > 90) {
    lat = null;
  }
  if (lonInt === 0 || lonInt === 0x7FFFFFFF || lon < -180 || lon > 180) {
    lon = null;
  }

  // Altitudes: val * 0.5 - 1000m (0xFFFF means invalid/no altitude)
  const altGeoRaw = buf.readUInt16LE(13);
  const altGeo = altGeoRaw === 0xFFFF ? null : Math.round((altGeoRaw * 0.5 - 1000) * 10) / 10;

  const altPressureRaw = buf.readUInt16LE(15);
  const altPressure = altPressureRaw === 0xFFFF ? null : Math.round((altPressureRaw * 0.5 - 1000) * 10) / 10;

  const heightAglRaw = buf.readUInt16LE(17);
  const heightAgl = heightAglRaw === 0xFFFF ? null : Math.round((heightAglRaw * 0.5 - 1000) * 10) / 10;

  const timestampTenths = buf.readUInt16LE(21);
  const timestampSec = Math.round((timestampTenths / 10) * 10) / 10;

  return {
    msgType: 1,
    msgTypeName: 'Location/Vector',
    protoVersion,
    status: OP_STATUS[statusRaw] || `Status (${statusRaw})`,
    statusCode: statusRaw,
    heightType: heightTypeRaw === 1 ? 'AGL' : 'Above Takeoff',
    trackDirection: trackDir,
    speedHorizontal: speedH,
    speedVertical: speedV,
    latitude: lat,
    longitude: lon,
    altitudeGeodetic: altGeo,
    altitudePressure: altPressure,
    heightAgl: heightAgl,
    timestampSeconds: timestampSec
  };
}

function decodeAuth(buf, protoVersion) {
  const authType = (buf[1] >> 4) & 0x0F;
  const pageNumber = buf[1] & 0x0F;
  const authData = buf.subarray(2, 19).toString('hex');
  return {
    msgType: 2,
    msgTypeName: 'Authentication',
    protoVersion,
    authType,
    pageNumber,
    authData
  };
}

function decodeSelfId(buf, protoVersion) {
  const descType = buf[1];
  const descBytes = buf.subarray(2, 25);
  let nullIdx = descBytes.indexOf(0);
  if (nullIdx === -1) nullIdx = 23;
  const description = descBytes.subarray(0, nullIdx).toString('ascii').trim();
  return {
    msgType: 3,
    msgTypeName: 'Self-ID',
    protoVersion,
    descType,
    description
  };
}

function decodeSystem(buf, protoVersion) {
  const flags = buf[1];
  const opLocationType = flags & 0x03; // 0=Takeoff, 1=Live GCS, 2=Fixed

  const opLatInt = buf.readInt32LE(2);
  const opLonInt = buf.readInt32LE(6);
  let opLat = Math.round((opLatInt / 1e7) * 1e7) / 1e7;
  let opLon = Math.round((opLonInt / 1e7) * 1e7) / 1e7;

  if (opLatInt === 0 || opLatInt === 0x7FFFFFFF || opLat < -90 || opLat > 90) {
    opLat = null;
  }
  if (opLonInt === 0 || opLonInt === 0x7FFFFFFF || opLon < -180 || opLon > 180) {
    opLon = null;
  }

  const areaRadius = buf[12] * 10; // Area radius in meters
  const areaCeiling = buf.readUInt16LE(13) * 0.5 - 1000;
  const areaFloor = buf.readUInt16LE(15) * 0.5 - 1000;

  const opAltRaw = buf.readUInt16LE(17);
  const opAltitude = opAltRaw === 0xFFFF ? null : Math.round((opAltRaw * 0.5 - 1000) * 10) / 10;

  return {
    msgType: 4,
    msgTypeName: 'System',
    protoVersion,
    operatorLocationType: opLocationType === 1 ? 'Live GCS / Pilot' : (opLocationType === 0 ? 'Takeoff Point' : 'Fixed'),
    operatorLatitude: opLat,
    operatorLongitude: opLon,
    operatorAltitude: opAltitude,
    areaRadiusMeters: areaRadius,
    areaCeilingMeters: areaCeiling,
    areaFloorMeters: areaFloor
  };
}

function decodeOperatorId(buf, protoVersion) {
  const opIdType = buf[1];
  const opIdBytes = buf.subarray(2, 22);
  let nullIdx = opIdBytes.indexOf(0);
  if (nullIdx === -1) nullIdx = 20;
  const operatorId = opIdBytes.subarray(0, nullIdx).toString('ascii').trim();
  return {
    msgType: 5,
    msgTypeName: 'Operator ID',
    protoVersion,
    operatorIdType: opIdType,
    operatorId
  };
}

/**
 * Parses Bluetooth LE Advertisement Service Data or Manufacturer Data for ASTM F3411.
 * Supports single 25-byte messages or multi-message packs (Message Type 0xF).
 * @param {Buffer|Uint8Array|string} rawData - Hex string or binary buffer
 * @returns {object[]} Array of decoded message objects
 */
function parseRemoteIdPayload(rawData, dataType) {
  if (!rawData) return [];
  let buf = typeof rawData === 'string' ? Buffer.from(rawData.replace(/[\s:-]/g, ''), 'hex') : (Buffer.isBuffer(rawData) ? rawData : Buffer.from(rawData));
  if (buf.length < 25) return [];

  const dt = dataType ? (typeof dataType === 'string' ? parseInt(dataType, 16) : dataType) : null;

  // 1. Search for OpenDroneID 16-bit UUID prefix: 0xFFFA (stored as FAFF in little-endian or FFFA in big-endian)
  const idxFaFf = buf.indexOf(Buffer.from([0xFA, 0xFF]));
  const idxFfFa = buf.indexOf(Buffer.from([0xFF, 0xFA]));
  const uuidIdx = idxFaFf !== -1 ? idxFaFf : idxFfFa;

  if (uuidIdx !== -1) {
    let candidate = buf.subarray(uuidIdx + 2);
    if (candidate.length >= 26 && candidate[0] === 0x0D) {
      candidate = candidate.subarray(2); // Skip [0x0D, Sequence]
    }
    if (candidate.length >= 25) {
      const parsed = decodeBufferMessages(candidate);
      if (parsed.length > 0) return parsed;
    }
  }

  // If BLE Service Data (0x16) but no UUID 0xFFFA match, discard immediately
  if (dt === 0x16) {
    return [];
  }

  // 2. Direct OpenDroneID Message Pack (Type 0xF0..0xF2)
  if (buf.length >= 28 && (buf[0] & 0xF0) === 0xF0 && (buf[0] & 0x0F) <= 2 && (buf[1] === 25 || buf[1] === 0x19)) {
    const directParsed = decodeBufferMessages(buf);
    if (directParsed.length > 0) return directParsed;
  }

  // 3. DJI Manufacturer Specific Data (Company ID 0x0888 / 0x8808)
  if (buf.length >= 27 && ((buf[0] === 0x88 && buf[1] === 0x08) || (buf[0] === 0x08 && buf[1] === 0x88))) {
    const mfgParsed = decodeBufferMessages(buf.subarray(2));
    if (mfgParsed.length > 0) return mfgParsed;
  }

  return [];
}

function decodeBufferMessages(buf) {
  if (!buf || buf.length < 25) return [];
  const results = [];
  const header = buf[0];
  const msgType = (header >> 4) & 0x0F;
  const protoVersion = header & 0x0F;

  // ProtoVersion in ASTM F3411 is 0, 1, or 2
  if (protoVersion > 2) return [];

  if (msgType === 0xF) { // Message Pack
    const singleMsgSize = buf[1] || 25;
    const msgCount = buf[2] || Math.floor((buf.length - 3) / 25);
    if (singleMsgSize !== 25 || msgCount < 1 || msgCount > 9) return [];
    let offset = 3;
    for (let i = 0; i < msgCount && offset + 25 <= buf.length; i++) {
      const subMsg = decodeOdidMessage(buf.subarray(offset, offset + 25));
      if (subMsg) results.push(subMsg);
      offset += 25;
    }
  } else if (msgType >= 0x0 && msgType <= 0x5) {
    for (let offset = 0; offset + 25 <= buf.length; offset += 25) {
      const msg = decodeOdidMessage(buf.subarray(offset, offset + 25));
      if (msg) results.push(msg);
    }
  }

  return results;
}

function formatDuration(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hrs > 0) {
    return `${hrs}h ${mins.toString().padStart(2, '0')}m ${secs.toString().padStart(2, '0')}s`;
  }
  return `${mins.toString().padStart(2, '0')}m ${secs.toString().padStart(2, '0')}s`;
}

/**
 * State manager aggregating decoded Remote ID messages for active drones in airspace.
 */
class RemoteIdAirspaceTracker {
  constructor(timeoutSec = 30) {
    this.timeoutMs = timeoutSec * 1000;
    this.drones = new Map(); // key: mac or uasId -> DroneState
    this.totalPackets = 0;
  }

  /**
   * Ingest a raw or decoded advertisement.
   */
  processAdvertisement({ mac, rssi = -60, rawPayload, timestamp = Date.now() }) {
    this.totalPackets++;
    const key = (mac || 'UNKNOWN_MAC').toUpperCase();
    let drone = this.drones.get(key);

    if (!drone) {
      drone = {
        id: key,
        mac: key,
        uasId: 'Awaiting ID...',
        serialNumber: null,
        faaRegistration: null,
        model: 'UAV / Drone',
        uaType: 'Multirotor',
        idType: 'Serial Number',
        status: 'Airborne',
        latitude: null,
        longitude: null,
        altitudeGeodetic: null,
        altitudePressure: null,
        heightAgl: null,
        speedHorizontal: null,
        speedVertical: null,
        trackDirection: null,
        operatorLatitude: null,
        operatorLongitude: null,
        operatorAltitude: null,
        operatorLocationType: null,
        rssi: rssi,
        firstSeen: timestamp,
        lastSeen: timestamp,
        breadcrumbs: [],
        packetCount: 0
      };
      this.drones.set(key, drone);
    }

    drone.lastSeen = timestamp;
    drone.rssi = rssi;
    drone.packetCount++;

    const messages = parseRemoteIdPayload(rawPayload);
    for (const msg of messages) {
      if (msg.msgType === 0) { // Basic ID
        if (msg.idTypeCode === 1 || msg.uasId.startsWith('2003F') || msg.uasId.startsWith('1581')) {
          drone.serialNumber = msg.uasId;
        } else if (msg.idTypeCode === 2 || msg.uasId.startsWith('FA3')) {
          drone.faaRegistration = msg.uasId;
        }

        if (drone.serialNumber && drone.faaRegistration) {
          drone.uasId = `${drone.serialNumber} [FAA: ${drone.faaRegistration}]`;
        } else {
          drone.uasId = msg.uasId;
        }

        drone.uaType = msg.uaType;
        drone.idType = msg.idType;
        if (msg.uasId.startsWith('1581F')) drone.model = 'DJI Mini 4 Pro';
        else if (msg.uasId.startsWith('1581E')) drone.model = 'DJI Mavic 3 / Air 3';
        else if (msg.uasId.startsWith('1581D')) drone.model = 'DJI Avata';
        else if (msg.uasId.startsWith('2003F')) drone.model = 'Remote ID Beacon';
        else drone.model = `Drone (${msg.uaType})`;
      } else if (msg.msgType === 1) { // Location / Vector
        drone.status = msg.status;
        drone.latitude = msg.latitude;
        drone.longitude = msg.longitude;
        drone.altitudeGeodetic = msg.altitudeGeodetic;
        drone.altitudePressure = msg.altitudePressure;
        drone.heightAgl = msg.heightAgl;
        drone.speedHorizontal = msg.speedHorizontal;
        drone.speedVertical = msg.speedVertical;
        drone.trackDirection = msg.trackDirection;

        if (msg.latitude && msg.longitude) {
          // Add breadcrumb
          const bc = { lat: msg.latitude, lon: msg.longitude, alt: msg.altitudeGeodetic, time: timestamp };
          drone.breadcrumbs.push(bc);
          if (drone.breadcrumbs.length > 50) drone.breadcrumbs.shift();
        }
      } else if (msg.msgType === 4) { // System
        drone.operatorLatitude = msg.operatorLatitude;
        drone.operatorLongitude = msg.operatorLongitude;
        drone.operatorAltitude = msg.operatorAltitude;
        drone.operatorLocationType = msg.operatorLocationType;
      }
    }

    return drone;
  }

  /**
   * Ingest a Wi-Fi Beacon detection (e.g. from 2.4 GHz / 5.8 GHz WLAN scanner).
   */
  processWifiBeacon({ mac, ssid = '', freq = 2400, rssi = -60, quality = 80, ieHex = '', timestamp = Date.now() }) {
    if (!ssid && !ieHex) return null;

    const sLower = (ssid || '').toLowerCase();
    const isDjiSsid = sLower.startsWith('dji-') || sLower.startsWith('dji_') || sLower.startsWith('dji ') || (sLower.startsWith('dji') && /^dji[\-_a-z0-9]+$/.test(sLower)) || sLower.startsWith('mini-') || sLower.startsWith('mavic-') || sLower.startsWith('avata-');
    const hasOdidIE = ieHex && (ieHex.includes('FA0BBC') || ieHex.includes('FFFA') || ieHex.includes('FAFF'));

    if (!isDjiSsid && !hasOdidIE) {
      return null;
    }

    this.totalPackets++;
    const key = (mac || ssid || 'UNKNOWN_WIFI').toUpperCase();
    let drone = this.drones.get(key);

    let inferredModel = 'DJI Drone';
    if (sLower.includes('mini4') || sLower.includes('mini 4') || sLower.includes('mini-4')) inferredModel = 'DJI Mini 4 Pro';
    else if (sLower.includes('mini3') || sLower.includes('mini 3')) inferredModel = 'DJI Mini 3 Pro';
    else if (sLower.includes('neo')) inferredModel = 'DJI Neo';
    else if (sLower.includes('air3') || sLower.includes('air 3') || sLower.startsWith('dji-air')) inferredModel = 'DJI Air 3';
    else if (sLower.includes('mavic3') || sLower.includes('mavic 3') || sLower.startsWith('dji-mavic')) inferredModel = 'DJI Mavic 3';
    else if (sLower.includes('avata')) inferredModel = 'DJI Avata';
    else if (sLower.includes('inspire')) inferredModel = 'DJI Inspire';
    else if (sLower.includes('matrice')) inferredModel = 'DJI Matrice';

    const freqBand = freq >= 5000 ? `5.8 GHz (${freq} MHz)` : `2.4 GHz (${freq} MHz)`;

    if (!drone) {
      drone = {
        id: key,
        mac: mac || key,
        uasId: ssid || 'DJI Drone',
        serialNumber: null,
        faaRegistration: null,
        model: inferredModel,
        uaType: 'Multirotor',
        idType: 'Wi-Fi Broadcast / RID',
        transport: `Wi-Fi ${freqBand}`,
        status: 'Radio Active (RF Detected)',
        frequencyMhz: freq,
        signalQuality: quality,
        latitude: null,
        longitude: null,
        altitudeGeodetic: null,
        altitudePressure: null,
        heightAgl: null,
        speedHorizontal: null,
        speedVertical: null,
        trackDirection: null,
        operatorLatitude: null,
        operatorLongitude: null,
        operatorAltitude: null,
        operatorLocationType: null,
        rssi: rssi,
        firstSeen: timestamp,
        lastSeen: timestamp,
        breadcrumbs: [],
        packetCount: 0
      };
      this.drones.set(key, drone);
    }

    drone.lastSeen = timestamp;
    drone.rssi = rssi;
    drone.signalQuality = quality;
    drone.packetCount++;
    drone.frequencyMhz = freq;
    drone.transport = `Wi-Fi ${freqBand}`;
    if (drone.uasId === 'Awaiting ID...' || drone.uasId === 'DJI Drone') {
      drone.uasId = ssid || key;
    }
    if (inferredModel !== 'DJI Drone') {
      drone.model = inferredModel;
    }

    // If Information Elements contain ASTM OpenDroneID payload, parse them
    if (ieHex) {
      const messages = parseRemoteIdPayload(ieHex);
      for (const msg of messages) {
        if (msg.msgType === 0) {
          drone.uasId = msg.uasId;
          drone.serialNumber = msg.uasId;
        } else if (msg.msgType === 1) {
          drone.latitude = msg.latitude;
          drone.longitude = msg.longitude;
          drone.altitudeGeodetic = msg.altitudeGeodetic;
          drone.speedHorizontal = msg.speedHorizontal;
          drone.trackDirection = msg.trackDirection;
          drone.status = msg.status;
        } else if (msg.msgType === 4) {
          drone.operatorLatitude = msg.operatorLatitude;
          drone.operatorLongitude = msg.operatorLongitude;
        }
      }
    }

    return drone;
  }

  /**
   * Remove stale drones that haven't broadcast within timeout.
   */
  cleanup(now = Date.now()) {
    for (const [key, drone] of this.drones.entries()) {
      if (now - drone.lastSeen > this.timeoutMs) {
        this.drones.delete(key);
      }
    }
  }

  /**
   * Get list of active drones.
   */
  getActiveDrones() {
    this.cleanup();
    const now = Date.now();
    return Array.from(this.drones.values()).map(d => ({
      ...d,
      ageSec: Math.round((now - d.lastSeen) / 1000),
      uptimeSec: Math.round((now - d.firstSeen) / 1000),
      uptimeFormatted: formatDuration(now - d.firstSeen)
    }));
  }

  /**
   * Reset tracker.
   */
  reset() {
    this.drones.clear();
    this.totalPackets = 0;
  }
}

/**
 * Creates a synthetic 25-byte ASTM F3411 Remote ID payload for testing / simulation.
 */
function createSyntheticOdidPayload({
  uasId = '1581F4TEST998877',
  lat = 40.0130,
  lon = -83.1765,
  alt = 25.0,
  speed = 4.5,
  heading = 90,
  opLat = 40.0128,
  opLon = -83.1766
} = {}) {
  // 1. Basic ID (Msg Type 0)
  const basicBuf = Buffer.alloc(25);
  basicBuf[0] = 0x02; // Type 0, Version 2
  basicBuf[1] = 0x12; // Serial number (1), Multirotor (2)
  const uasIdBytes = Buffer.from(uasId, 'ascii');
  uasIdBytes.copy(basicBuf, 2, 0, Math.min(20, uasIdBytes.length));

  // 2. Location (Msg Type 1)
  const locBuf = Buffer.alloc(25);
  locBuf[0] = 0x12; // Type 1, Version 2
  locBuf[1] = 0x20; // Airborne (2), Above Takeoff (0)
  locBuf[2] = Math.round(heading / 2); // Heading
  locBuf[3] = Math.min(255, Math.round(speed / 0.25)); // Speed horizontal
  locBuf.writeInt8(0, 4); // Speed vertical
  locBuf.writeInt32LE(Math.round(lat * 1e7), 5); // Lat
  locBuf.writeInt32LE(Math.round(lon * 1e7), 9); // Lon
  locBuf.writeUInt16LE(Math.round((alt + 1000) / 0.5), 13); // Alt Geo
  locBuf.writeUInt16LE(Math.round((alt + 1000) / 0.5), 15); // Alt Pressure
  locBuf.writeUInt16LE(Math.round((alt + 1000) / 0.5), 17); // Height AGL
  locBuf.writeUInt16LE(120, 21); // Timestamp

  // 3. System (Msg Type 4)
  const sysBuf = Buffer.alloc(25);
  sysBuf[0] = 0x42; // Type 4, Version 2
  sysBuf[1] = 0x01; // Live GCS / Pilot
  sysBuf.writeInt32LE(Math.round(opLat * 1e7), 2);
  sysBuf.writeInt32LE(Math.round(opLon * 1e7), 6);
  sysBuf.writeUInt16LE(0, 10);
  sysBuf[12] = 5; // 50m radius
  sysBuf.writeUInt16LE(Math.round((100 + 1000) / 0.5), 13); // Ceiling
  sysBuf.writeUInt16LE(Math.round((0 + 1000) / 0.5), 15); // Floor
  sysBuf.writeUInt16LE(Math.round((0 + 1000) / 0.5), 17); // Pilot Alt

  // Combine into a Message Pack (Type 0xF)
  const packBuf = Buffer.concat([
    Buffer.from([0xF2, 25, 3]), // Header (Type 0xF), 25 bytes per msg, 3 messages
    basicBuf,
    locBuf,
    sysBuf
  ]);

  return packBuf;
}

if (typeof module !== 'undefined') {
  module.exports = {
    decodeOdidMessage,
    decodeBasicId,
    decodeLocation,
    decodeSystem,
    parseRemoteIdPayload,
    RemoteIdAirspaceTracker,
    createSyntheticOdidPayload,
    UA_TYPES,
    OP_STATUS,
    ID_TYPES
  };
}
