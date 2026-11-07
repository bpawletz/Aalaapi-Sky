/**
 * Aalaapi Sky - Android Native Hardware Bridge & Field Decoders
 *
 * Facilitates bidirectional integration between the compiled Aalaapi Sky web bundle
 * and the Native Android Application container (Kotlin / WebView `window.AalaapiAndroid`).
 *
 * Tri-Link Field Capabilities:
 * 1. Client-Side ASTM F3411 Broadcast Remote ID Decoder (BLE UUID 0xFFFA + Wi-Fi OUI FA:0B:BC)
 * 2. Client-Side Mode S SBS-1 BaseStation ADS-B Tracker (TCP port 30003, RTL-SDR OTG, adsb.lol)
 * 3. DJI RC 2 USB-C Auto-Detection & 1-Tap Overwrite Confirmation Sync Bar (#android-rc2-sync-bar)
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AndroidNativeBridge = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {

  // ─── 1. ASTM F3411 Pure-JS Client-Side Remote ID Decoder ───────────────────
  const ClientRemoteIdDecoder = {
    UA_TYPES: [
      'None', 'Aeroplane', 'Helicopter (Multirotor)', 'Gyroplane', 'Hybrid Lift',
      'Ornithopter', 'Glider', 'Kite', 'Free Balloon', 'Airship',
      'Free Fall / Parachute', 'Rocket', 'Tethered Powered Aircraft', 'Ground Obstacle', 'Other'
    ],

    OP_STATUS: ['Undeclared', 'Ground', 'Airborne', 'Emergency', 'RemoteID System Failure'],

    /**
     * Decode a raw base64 or Uint8Array ASTM F3411 frame (single 25-byte block or MessagePack 0xF).
     * @param {string|Uint8Array} rawData
     * @param {number} [rssi=-65]
     * @param {'ble'|'wifi'} [transport='ble']
     * @returns {object|null}
     */
    decode(rawData, rssi = -65, transport = 'ble') {
      let bytes;
      if (typeof rawData === 'string') {
        try {
          if (typeof atob === 'function') {
            const binary = atob(rawData);
            bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
              bytes[i] = binary.charCodeAt(i);
            }
          } else if (typeof Buffer !== 'undefined') {
            bytes = new Uint8Array(Buffer.from(rawData, 'base64'));
          } else {
            return null;
          }
        } catch (_) {
          return null;
        }
      } else if (rawData instanceof Uint8Array) {
        bytes = rawData;
      } else if (Array.isArray(rawData)) {
        bytes = new Uint8Array(rawData);
      } else {
        return null;
      }

      if (!bytes || bytes.length < 25) return null;

      const header = bytes[0];
      const msgType = (header >> 4) & 0x0F;
      const protoVersion = header & 0x0F;

      // Handle MessagePack (Type 0xF): 1 byte header, 1 byte count/size, followed by 25-byte blocks
      if (msgType === 0x0F) {
        return this.decodeMessagePack(bytes, rssi, transport);
      }

      return this.decodeSingleBlock(bytes.subarray(0, 25), rssi, transport);
    },

    decodeSingleBlock(buf, rssi, transport) {
      if (buf.length < 25) return null;
      const header = buf[0];
      const msgType = (header >> 4) & 0x0F;
      const protoVersion = header & 0x0F;

      switch (msgType) {
        case 0x0: return this.decodeBasicId(buf, protoVersion, rssi, transport);
        case 0x1: return this.decodeLocation(buf, protoVersion, rssi, transport);
        case 0x3: return this.decodeSelfId(buf, protoVersion, rssi, transport);
        case 0x4: return this.decodeSystem(buf, protoVersion, rssi, transport);
        case 0x5: return this.decodeOperatorId(buf, protoVersion, rssi, transport);
        default: return { msgType, protoVersion, raw: true, rssi, transport };
      }
    },

    decodeBasicId(buf, protoVersion, rssi, transport) {
      const idTypeRaw = (buf[1] >> 4) & 0x0F;
      const uaTypeRaw = buf[1] & 0x0F;

      let uasIdStr = '';
      for (let i = 2; i < 22; i++) {
        const c = buf[i];
        if (c === 0) break;
        uasIdStr += String.fromCharCode(c);
      }
      uasIdStr = uasIdStr.trim().replace(/^["']+|["']+$/g, '');
      if (uasIdStr.startsWith('FFA3')) uasIdStr = uasIdStr.substring(1);
      if (uasIdStr.length < 4) return null;

      return {
        msgType: 'BasicID',
        protoVersion,
        idType: idTypeRaw,
        uaType: this.UA_TYPES[uaTypeRaw] || 'Unknown',
        uasId: uasIdStr,
        rssi,
        transport,
        timestamp: Date.now()
      };
    },

    decodeLocation(buf, protoVersion, rssi, transport) {
      const statusRaw = (buf[1] >> 4) & 0x0F;
      const opStatus = this.OP_STATUS[statusRaw] || 'Undeclared';

      const trackDirection = buf[2] * 2; // degrees (0-360)
      const speedMultiplier = (buf[3] >> 7) & 0x01;
      const speedRaw = buf[3] & 0x7F;
      const speedMps = speedMultiplier === 1 ? (speedRaw * 0.75 + 255 * 0.25) : (speedRaw * 0.25);

      const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
      const latRaw = view.getInt32(5, true);
      const lonRaw = view.getInt32(9, true);

      const lat = latRaw / 1e7;
      const lon = lonRaw / 1e7;

      if (lat < -90 || lat > 90 || lon < -180 || lon > 180 || (lat === 0 && lon === 0)) {
        return null;
      }

      const baroAltRaw = view.getUint16(13, true);
      const geoAltRaw = view.getUint16(15, true);
      const altGeoMeters = (geoAltRaw * 0.5) - 1000.0;
      const altBaroMeters = (baroAltRaw * 0.5) - 1000.0;

      return {
        msgType: 'Location',
        protoVersion,
        status: opStatus,
        trackDirection,
        speedMps: Math.round(speedMps * 10) / 10,
        latitude: lat,
        longitude: lon,
        altitude: Math.round(altGeoMeters * 10) / 10,
        altBaro: Math.round(altBaroMeters * 10) / 10,
        rssi,
        transport,
        timestamp: Date.now()
      };
    },

    decodeSelfId(buf, protoVersion, rssi, transport) {
      const descType = buf[1];
      let desc = '';
      for (let i = 2; i < 25; i++) {
        const c = buf[i];
        if (c === 0) break;
        desc += String.fromCharCode(c);
      }
      return {
        msgType: 'SelfID',
        protoVersion,
        descType,
        description: desc.trim(),
        rssi,
        transport,
        timestamp: Date.now()
      };
    },

    decodeSystem(buf, protoVersion, rssi, transport) {
      const flags = buf[1];
      const locType = flags & 0x03;
      const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
      const opLatRaw = view.getInt32(2, true);
      const opLonRaw = view.getInt32(6, true);
      const opLat = opLatRaw / 1e7;
      const opLon = opLonRaw / 1e7;

      const altRaw = view.getUint16(12, true);
      const opAlt = (altRaw * 0.5) - 1000.0;

      const hasCoords = (opLat >= -90 && opLat <= 90 && opLon >= -180 && opLon <= 180 && !(opLat === 0 && opLon === 0));

      return {
        msgType: 'System',
        protoVersion,
        locationType: locType === 0 ? 'Takeoff' : (locType === 1 ? 'LivePilot' : 'FixedBase'),
        operatorLatitude: hasCoords ? opLat : null,
        operatorLongitude: hasCoords ? opLon : null,
        operatorAltitude: hasCoords ? Math.round(opAlt * 10) / 10 : null,
        rssi,
        transport,
        timestamp: Date.now()
      };
    },

    decodeOperatorId(buf, protoVersion, rssi, transport) {
      let opId = '';
      for (let i = 2; i < 22; i++) {
        const c = buf[i];
        if (c === 0) break;
        opId += String.fromCharCode(c);
      }
      return {
        msgType: 'OperatorID',
        protoVersion,
        operatorId: opId.trim(),
        rssi,
        transport,
        timestamp: Date.now()
      };
    },

    decodeMessagePack(bytes, rssi, transport) {
      const packSize = bytes[1] || 0;
      const results = [];
      let offset = 2;
      while (offset + 25 <= bytes.length) {
        const block = bytes.subarray(offset, offset + 25);
        const decoded = this.decodeSingleBlock(block, rssi, transport);
        if (decoded) results.push(decoded);
        offset += 25;
      }
      return { msgType: 'MessagePack', count: results.length, messages: results };
    }
  };

  // ─── 2. Client-Side Mode S SBS-1 BaseStation ADS-B Processor ───────────────
  const ClientAdsbProcessor = {
    CARDINAL_POINTS: [
      'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
      'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'
    ],

    /**
     * Compute Haversine distance in meters between two lat/lon pairs.
     */
    calculateHaversineDistance(lat1, lon1, lat2, lon2) {
      const R = 6371000;
      const toRad = Math.PI / 180;
      const dLat = (lat2 - lat1) * toRad;
      const dLon = (lon2 - lon1) * toRad;
      const phi1 = lat1 * toRad;
      const phi2 = lat2 * toRad;
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(phi1) * Math.cos(phi2) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    },

    /**
     * Compute initial true bearing in degrees (0 - 360).
     */
    calculateBearing(lat1, lon1, lat2, lon2) {
      const toRad = Math.PI / 180;
      const phi1 = lat1 * toRad;
      const phi2 = lat2 * toRad;
      const dLon = (lon2 - lon1) * toRad;
      const y = Math.sin(dLon) * Math.cos(phi2);
      const x = Math.cos(phi1) * Math.sin(phi2) -
                Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);
      const deg = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
      return Math.round(deg);
    },

    degreesToCardinal(deg) {
      const normalized = (deg % 360 + 360) % 360;
      const index = Math.round(normalized / 22.5) % 16;
      return this.CARDINAL_POINTS[index];
    },

    /**
     * Parse single SBS-1 CSV line (from dump1090 / readsb / Stratux on TCP 30003).
     * Format: MSG,transmission_type,session_id,aircraft_id,hex_ident,flight_id,date_gen,time_gen,date_log,time_log,callsign,altitude,ground_speed,track,lat,lon,vertical_rate,squawk,alert,emergency,spi,is_on_ground
     * @param {string} line
     * @returns {object|null}
     */
    parseSbsLine(line) {
      if (!line || typeof line !== 'string') return null;
      const parts = line.trim().split(',');
      if (parts[0] !== 'MSG') return null;

      const subType = parseInt(parts[1], 10);
      const hex = (parts[4] || '').trim().toUpperCase();
      if (!hex || hex.length < 4) return null;

      const update = { hex, timestamp: Date.now() };

      // MSG,1: Call sign identification
      if (subType === 1 && parts[10]) {
        update.callsign = parts[10].trim();
      }

      // MSG,3: Airborne position
      if (subType === 3) {
        if (parts[11]) update.altitude = parseInt(parts[11], 10);
        if (parts[14] && parts[15]) {
          const lat = parseFloat(parts[14]);
          const lon = parseFloat(parts[15]);
          if (!isNaN(lat) && !isNaN(lon) && (lat !== 0 || lon !== 0)) {
            update.latitude = lat;
            update.longitude = lon;
          }
        }
        if (parts[21]) update.onGround = (parts[21] === '1');
      }

      // MSG,4: Airborne velocity
      if (subType === 4) {
        if (parts[12]) update.speed = parseInt(parts[12], 10);
        if (parts[13]) update.track = parseInt(parts[13], 10);
        if (parts[16]) update.verticalRate = parseInt(parts[16], 10);
      }

      return update;
    }
  };

  // ─── 3. Unified Android Native Bridge Controller ───────────────────────────
  const AndroidNativeBridge = {
    isNativeAndroid: false,
    rc2Device: null,
    rc2Slots: [],
    selectedSlotUuid: null,
    adsbAircraft: new Map(), // hex -> aircraft record
    remoteIdDrones: new Map(), // uasId -> drone record
    staleTimeoutMs: 60000,
    _lastPruneTime: 0,
    adsbCleanupInterval: null,

    _getAdsbAirspaceManager() {
      if (typeof AdsbAirspaceManager !== 'undefined' && AdsbAirspaceManager) return AdsbAirspaceManager;
      if (typeof window !== 'undefined' && window.AdsbAirspaceManager) return window.AdsbAirspaceManager;
      if (typeof global !== 'undefined' && global.AdsbAirspaceManager) return global.AdsbAirspaceManager;
      return null;
    },

    _getRemoteIdRadar() {
      if (typeof RemoteIdRadar !== 'undefined' && RemoteIdRadar) return RemoteIdRadar;
      if (typeof window !== 'undefined' && window.RemoteIdRadar) return window.RemoteIdRadar;
      if (typeof global !== 'undefined' && global.RemoteIdRadar) return global.RemoteIdRadar;
      return null;
    },

    // Unlock Web Audio on the first user gesture so ADS-B chimes can play later (Issue #249)
    installAudioUnlock() {
      if (typeof document === 'undefined' || this._audioUnlockInstalled) return;
      this._audioUnlockInstalled = true;
      const unlock = () => {
        try {
          if (typeof AdsbAirspaceManager !== 'undefined' && AdsbAirspaceManager && typeof AdsbAirspaceManager.initAudioContext === 'function') {
            AdsbAirspaceManager.initAudioContext();
          }
        } catch (_) { /* ignore */ }
        document.removeEventListener('pointerdown', unlock, true);
        document.removeEventListener('touchend', unlock, true);
        document.removeEventListener('keydown', unlock, true);
      };
      document.addEventListener('pointerdown', unlock, true);
      document.addEventListener('touchend', unlock, true);
      document.addEventListener('keydown', unlock, true);
    },

    init() {
      // 1. Detect if running inside the Native Android container (window.AalaapiAndroid)
      if (typeof window !== 'undefined' && window.AalaapiAndroid) {
        this.isNativeAndroid = true;
        console.log('🤖 Aalaapi Sky Native Android Bridge: Active');
        try {
          if (typeof window.AalaapiAndroid.getMtpStatus === 'function') {
            const rawStatus = window.AalaapiAndroid.getMtpStatus();
            const status = typeof rawStatus === 'string' ? JSON.parse(rawStatus) : rawStatus;
            if (status && status.connected) {
              this.handleRc2Connected(status);
            }
          }
        } catch (_) {}
      }

      this.bindUiElements();
      this.installAudioUnlock();

      // 2. Start periodic stale aircraft and drone pruning timer (15s interval)
      if (!this.adsbCleanupInterval && typeof setInterval !== 'undefined') {
        this.adsbCleanupInterval = setInterval(() => this.pruneStaleAircraft(), 15000);
      }

      // Listen for browser/PWA WebUSB connect/disconnect events
      if (typeof navigator !== 'undefined' && navigator.usb) {
        navigator.usb.addEventListener('connect', (e) => {
          if (e.device && (e.device.vendorId === 0x2CA3 || e.device.vendorId === 11427)) {
            this.handleRc2Connected({
              deviceName: e.device.productName || 'DJI RC 2',
              vendorId: e.device.vendorId,
              productId: e.device.productId
            });
          }
        });

        navigator.usb.addEventListener('disconnect', (e) => {
          if (this.rc2Device && (e.device.vendorId === 0x2CA3 || e.device.vendorId === 11427)) {
            this.handleRc2Disconnected();
          }
        });
      }
    },

    bindUiElements() {
      if (typeof document === 'undefined') return;

      const bar = document.getElementById('android-rc2-sync-bar');
      const syncBtn = document.getElementById('android-rc2-sync-btn');
      const pullLogBtn = document.getElementById('android-rc2-pull-log-btn');
      const closeBtn = document.getElementById('android-rc2-bar-close');
      const slotSelect = document.getElementById('android-rc2-slot-select');

      const modal = document.getElementById('android-rc2-confirm-modal');
      const confirmBtn = document.getElementById('android-rc2-confirm-overwrite-btn');
      const cancelBtn = document.getElementById('android-rc2-cancel-overwrite-btn');

      if (closeBtn) {
        closeBtn.addEventListener('click', () => {
          if (bar) bar.classList.add('hidden');
        });
      }

      if (slotSelect) {
        slotSelect.addEventListener('change', (e) => {
          this.selectedSlotUuid = e.target.value;
        });
      }

      if (syncBtn) {
        syncBtn.addEventListener('click', () => {
          this.promptOverwriteConfirmation();
        });
      }

      if (confirmBtn) {
        confirmBtn.addEventListener('click', () => {
          this.executeConfirmedSync();
        });
      }

      if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
          if (modal) modal.classList.add('hidden');
        });
      }

      if (pullLogBtn) {
        pullLogBtn.addEventListener('click', () => {
          if (typeof pullFlightLogFromRC2 === 'function') {
            pullFlightLogFromRC2(pullLogBtn);
          } else {
            this.pullLatestLog();
          }
        });
      }
    },

    // ─── Remote ID Ingestion (BLE / Wi-Fi) ───────────────────────────────────
    ingestRemoteIdFrame(rawPayload, rssi = -65, transport = 'ble') {
      const decoded = ClientRemoteIdDecoder.decode(rawPayload, rssi, transport);
      if (!decoded) return;

      let droneId = decoded.uasId;
      if (!droneId && decoded.messages && decoded.messages.length > 0) {
        const bId = decoded.messages.find(m => m.msgType === 'BasicID');
        if (bId) droneId = bId.uasId;
      }
      if (!droneId) return;

      let drone = this.remoteIdDrones.get(droneId);
      if (!drone) {
        drone = {
          id: droneId,
          uasId: droneId,
          model: decoded.uaType || 'Drone',
          latitude: null,
          longitude: null,
          altitude: null,
          speed: null,
          heading: null,
          operatorLatitude: null,
          operatorLongitude: null,
          operatorAltitude: null,
          operatorLocationType: 'Takeoff',
          rssi: decoded.rssi || rssi,
          transport: decoded.transport || transport,
          lastSeen: Date.now()
        };
        this.remoteIdDrones.set(droneId, drone);
      }

      // Merge decoded payload
      const msgs = decoded.messages ? decoded.messages : [decoded];
      msgs.forEach(m => {
        if (m.latitude !== undefined && m.longitude !== undefined) {
          drone.latitude = m.latitude;
          drone.longitude = m.longitude;
        }
        if (m.altitude !== undefined) drone.altitude = m.altitude;
        if (m.speedMps !== undefined) drone.speed = m.speedMps;
        if (m.trackDirection !== undefined) drone.heading = m.trackDirection;
        if (m.operatorLatitude !== undefined && m.operatorLatitude !== null) {
          drone.operatorLatitude = m.operatorLatitude;
          drone.operatorLongitude = m.operatorLongitude;
          drone.operatorAltitude = m.operatorAltitude;
          drone.operatorLocationType = m.locationType || 'Takeoff';
        }
        if (m.uaType) drone.model = m.uaType;
      });

      drone.rssi = rssi;
      drone.transport = transport;
      drone.lastSeen = Date.now();

      // Feed into global RemoteIdRadar in ApiClient.js
      if (typeof RemoteIdRadar !== 'undefined' && RemoteIdRadar) {
        RemoteIdRadar.activeDrones = Array.from(this.remoteIdDrones.values());
        RemoteIdRadar.streamMode = 'android-ble';
        RemoteIdRadar.streamConnected = true;
        if (typeof RemoteIdRadar.updateMapMarkers === 'function') {
          RemoteIdRadar.updateMapMarkers();
        }
        if (typeof RemoteIdRadar.updateRadarUI === 'function') {
          RemoteIdRadar.updateRadarUI();
        }
        if (typeof RemoteIdRadar.updateStreamTransportUI === 'function') {
          RemoteIdRadar.updateStreamTransportUI();
        }
      }
    },

    // ─── Stale Aircraft & Drone Pruning ──────────────────────────────────────
    pruneStaleAircraft(now = Date.now(), staleTimeoutMs = this.staleTimeoutMs) {
      this._lastPruneTime = now;
      let prunedAdsb = 0;
      for (const [hex, ac] of this.adsbAircraft.entries()) {
        if (now - (ac.lastSeen || 0) > staleTimeoutMs) {
          this.adsbAircraft.delete(hex);
          prunedAdsb++;
        }
      }

      const mgr = this._getAdsbAirspaceManager();
      if (prunedAdsb > 0 && mgr && typeof mgr.processAirspaceData === 'function') {
        const aircraftList = Array.from(this.adsbAircraft.values()).filter(a => a.latitude !== null);
        mgr.processAirspaceData({
          success: true,
          source: 'android-prune',
          aircraft: aircraftList,
          total: aircraftList.length
        });
      }

      // Also prune stale Remote ID drones if inactive > staleTimeoutMs
      let prunedRid = 0;
      for (const [id, drone] of this.remoteIdDrones.entries()) {
        if (now - (drone.lastSeen || 0) > staleTimeoutMs) {
          this.remoteIdDrones.delete(id);
          prunedRid++;
        }
      }
      const ridRadar = this._getRemoteIdRadar();
      if (prunedRid > 0 && ridRadar) {
        ridRadar.activeDrones = Array.from(this.remoteIdDrones.values());
        if (typeof ridRadar.updateMapMarkers === 'function') ridRadar.updateMapMarkers();
        if (typeof ridRadar.updateRadarUI === 'function') ridRadar.updateRadarUI();
      }

      return prunedAdsb + prunedRid;
    },

    clearAdsbAircraft() {
      this.adsbAircraft.clear();
      const mgr = this._getAdsbAirspaceManager();
      if (mgr && typeof mgr.processAirspaceData === 'function') {
        mgr.processAirspaceData({
          success: true,
          source: 'android-clear',
          aircraft: [],
          total: 0
        });
      }
    },

    // ─── ADS-B Ingestion (TCP 30003 SBS-1 / RTL-SDR OTG) ─────────────────────
    ingestAdsbSbsLine(csvLine) {
      const update = ClientAdsbProcessor.parseSbsLine(csvLine);
      if (!update) return;

      const now = Date.now();
      if (now - this._lastPruneTime > 15000) {
        this.pruneStaleAircraft(now);
      }

      const hex = update.hex;
      let ac = this.adsbAircraft.get(hex);
      if (!ac) {
        ac = {
          hex,
          callsign: update.callsign || hex,
          latitude: null,
          longitude: null,
          altitude: null,
          speed: null,
          track: null,
          verticalRate: null,
          onGround: false,
          lastSeen: now
        };
        this.adsbAircraft.set(hex, ac);
      }

      if (update.callsign) ac.callsign = update.callsign;
      if (update.latitude !== undefined) ac.latitude = update.latitude;
      if (update.longitude !== undefined) ac.longitude = update.longitude;
      if (update.altitude !== undefined) ac.altitude = update.altitude;
      if (update.speed !== undefined) ac.speed = update.speed;
      if (update.track !== undefined) ac.track = update.track;
      if (update.verticalRate !== undefined) ac.verticalRate = update.verticalRate;
      if (update.onGround !== undefined) ac.onGround = update.onGround;
      ac.lastSeen = now;

      // Compute relative distance & bearing from alert origin
      let refLat = 41.3215;
      let refLon = -88.9950;
      const mgr = this._getAdsbAirspaceManager();
      if (mgr && typeof mgr.getAlertOrigin === 'function') {
        const origin = mgr.getAlertOrigin();
        refLat = origin.lat;
        refLon = origin.lon;
      } else if (typeof centerMarker !== 'undefined' && centerMarker && centerMarker.getLatLng) {
        const cll = centerMarker.getLatLng();
        refLat = cll.lat;
        refLon = cll.lng;
      }

      if (ac.latitude !== null && ac.longitude !== null) {
        const distM = ClientAdsbProcessor.calculateHaversineDistance(refLat, refLon, ac.latitude, ac.longitude);
        ac.distanceMeters = distM;
        ac.distanceMiles = Math.round((distM / 1609.344) * 10) / 10;
        const bearing = ClientAdsbProcessor.calculateBearing(refLat, refLon, ac.latitude, ac.longitude);
        ac.bearing = bearing;
        ac.bearingCardinal = ClientAdsbProcessor.degreesToCardinal(bearing);
      }

      // Feed into global AdsbAirspaceManager in ApiClient.js
      if (mgr) {
        const aircraftList = Array.from(this.adsbAircraft.values()).filter(a => a.latitude !== null);
        mgr.enabled = true;
        mgr.streamMode = 'android-tcp';
        mgr.streamConnected = true;
        if (typeof mgr.updateStreamTransportUI === 'function') {
          mgr.updateStreamTransportUI();
        }
        if (typeof mgr.processAirspaceData === 'function') {
          mgr.processAirspaceData({
            success: true,
            source: 'android-sbs',
            aircraft: aircraftList,
            total: aircraftList.length
          });
        }
      }
    },

    // ─── ADS-B JSON Ingestion (dump1090 / readsb / tar1090 HTTP /data/aircraft.json) ───
    ingestAdsbJson(jsonPayload) {
      if (!jsonPayload) return;
      let data = jsonPayload;
      if (typeof jsonPayload === 'string') {
        try {
          data = JSON.parse(jsonPayload);
        } catch (_) {
          return;
        }
      }
      const rawList = Array.isArray(data) ? data : (Array.isArray(data.ac) ? data.ac : (Array.isArray(data.aircraft) ? data.aircraft : []));
      if (!rawList.length) return;

      const now = Date.now();
      if (now - this._lastPruneTime > 15000) {
        this.pruneStaleAircraft(now);
      }

      let refLat = 41.3215;
      let refLon = -88.9950;
      const mgr = this._getAdsbAirspaceManager();
      if (mgr && typeof mgr.getAlertOrigin === 'function') {
        const origin = mgr.getAlertOrigin();
        refLat = origin.lat;
        refLon = origin.lon;
      } else if (typeof centerMarker !== 'undefined' && centerMarker && centerMarker.getLatLng) {
        const cll = centerMarker.getLatLng();
        refLat = cll.lat;
        refLon = cll.lng;
      }

      for (const item of rawList) {
        const hex = (item.hex || item.hex_ident || '').toString().toUpperCase();
        if (!hex) continue;

        let ac = this.adsbAircraft.get(hex);
        if (!ac) {
          ac = {
            hex,
            callsign: (item.flight || item.callsign || hex).trim(),
            latitude: null,
            longitude: null,
            altitude: null,
            speed: null,
            track: null,
            verticalRate: null,
            onGround: false,
            lastSeen: now
          };
          this.adsbAircraft.set(hex, ac);
        }

        if (item.flight || item.callsign) ac.callsign = (item.flight || item.callsign).trim();
        const lat = item.lat !== undefined ? item.lat : item.latitude;
        const lon = item.lon !== undefined ? item.lon : item.longitude;
        if (lat !== undefined && lon !== undefined && !isNaN(lat) && !isNaN(lon)) {
          ac.latitude = lat;
          ac.longitude = lon;
        }
        const alt = item.alt_baro !== undefined ? item.alt_baro : (item.alt !== undefined ? item.alt : item.altitude);
        if (alt !== undefined && !isNaN(alt)) ac.altitude = alt;
        const spd = item.gs !== undefined ? item.gs : item.speed;
        if (spd !== undefined && !isNaN(spd)) ac.speed = spd;
        const trk = item.track !== undefined ? item.track : item.heading;
        if (trk !== undefined && !isNaN(trk)) ac.track = trk;
        const vert = item.baro_rate !== undefined ? item.baro_rate : (item.geom_rate !== undefined ? item.geom_rate : item.vert_rate);
        if (vert !== undefined && !isNaN(vert)) ac.verticalRate = vert;
        ac.lastSeen = now;

        if (ac.latitude !== null && ac.longitude !== null) {
          const distM = ClientAdsbProcessor.calculateHaversineDistance(refLat, refLon, ac.latitude, ac.longitude);
          ac.distanceMeters = distM;
          ac.distanceMiles = Math.round((distM / 1609.344) * 10) / 10;
          const bearing = ClientAdsbProcessor.calculateBearing(refLat, refLon, ac.latitude, ac.longitude);
          ac.bearing = bearing;
          ac.bearingCardinal = ClientAdsbProcessor.degreesToCardinal(bearing);
        }
      }

      if (mgr) {
        const aircraftList = Array.from(this.adsbAircraft.values()).filter(a => a.latitude !== null);
        mgr.enabled = true;
        mgr.streamMode = 'android-http';
        mgr.streamConnected = true;
        if (typeof mgr.updateStreamTransportUI === 'function') {
          mgr.updateStreamTransportUI();
        }
        if (typeof mgr.processAirspaceData === 'function') {
          mgr.processAirspaceData({
            success: true,
            source: 'android-http-json',
            aircraft: aircraftList,
            total: aircraftList.length
          });
        }
      }
    },

    // ─── Connection Status Notification Handler ─────────────────────────────
    onAdsbStatusChanged(status, host, port, errorMsg) {
      this.isAdsbConnected = (status === 'connected');
      if (typeof document === 'undefined') return;
      const hwBadge = document.getElementById('adsb-hardware-badge');
      const trBadge = document.getElementById('adsb-transport-badge');
      const tabDot = document.getElementById('adsb-tab-status-dot');
      const summaryEl = document.getElementById('adsb-diag-summary');
      const streamEl = document.getElementById('adsb-stream-status');
      const hwEl = document.getElementById('adsb-hw-status');

      const isExternalWatchActive = typeof AdsbAirspaceManager !== 'undefined' && AdsbAirspaceManager.externalWatchActive;

      if (status === 'connected') {
        if (hwBadge) {
          hwBadge.textContent = 'CONNECTED';
          hwBadge.style.color = '#34d399';
        }
        if (trBadge) {
          trBadge.textContent = `Android Native (${host}:${port})`;
          trBadge.style.color = '#34d399';
        }
        if (tabDot) {
          tabDot.className = 'adsb-tab-dot is-connected';
          tabDot.title = isExternalWatchActive
            ? `Connected: Android Native (${host}:${port}) + adsb.lol Cloud Feed`
            : `Connected to Android Native (${host}:${port})`;
        }
        if (summaryEl) {
          summaryEl.textContent = 'ACTIVE';
          summaryEl.style.background = 'rgba(16, 185, 129, 0.2)';
          summaryEl.style.color = '#10b981';
        }
        if (streamEl) {
          streamEl.textContent = `Connected (${host}:${port})`;
          streamEl.style.color = '#10b981';
        }
        if (hwEl) {
          hwEl.textContent = 'Android Native / RTL-SDR Socket';
          hwEl.style.color = '#38bdf8';
        }
      } else if (status === 'connecting') {
        if (hwBadge) {
          hwBadge.textContent = 'CONNECTING...';
          hwBadge.style.color = '#38bdf8';
        }
        if (trBadge) {
          trBadge.textContent = `Connecting to ${host}:${port}...`;
          trBadge.style.color = '#38bdf8';
        }
        if (tabDot && !isExternalWatchActive) {
          tabDot.className = 'adsb-tab-dot is-waiting';
          tabDot.title = `Connecting to ${host}:${port}...`;
        }
        if (summaryEl && !isExternalWatchActive) {
          summaryEl.textContent = 'CONNECTING';
          summaryEl.style.background = 'rgba(56, 189, 248, 0.2)';
          summaryEl.style.color = '#38bdf8';
        }
        if (streamEl && !isExternalWatchActive) {
          streamEl.textContent = `Connecting to ${host}:${port}...`;
          streamEl.style.color = '#38bdf8';
        }
      } else if (status === 'error') {
        if (hwBadge) {
          hwBadge.textContent = 'ERROR';
          hwBadge.style.color = '#f87171';
        }
        if (trBadge) {
          trBadge.textContent = `Error (${errorMsg || 'Failed'})`;
          trBadge.style.color = '#f87171';
        }
        if (!isExternalWatchActive) {
          if (tabDot) {
            tabDot.className = 'adsb-tab-dot is-offline';
            tabDot.title = `Error (${errorMsg || 'Connection Failed'})`;
          }
          if (summaryEl) {
            summaryEl.textContent = 'ERROR';
            summaryEl.style.background = 'rgba(239, 68, 68, 0.2)';
            summaryEl.style.color = '#ef4444';
          }
          if (streamEl) {
            streamEl.textContent = `Error: ${errorMsg || 'Failed'}`;
            streamEl.style.color = '#ef4444';
          }
        }
      } else if (status === 'disconnected') {
        if (hwBadge) {
          hwBadge.textContent = 'READY';
          hwBadge.style.color = '#94a3b8';
        }
        if (trBadge) {
          trBadge.textContent = 'Disconnected';
          trBadge.style.color = '#94a3b8';
        }
        if (!isExternalWatchActive) {
          if (tabDot) {
            tabDot.className = 'adsb-tab-dot is-offline';
            tabDot.title = 'Disconnected';
          }
          if (summaryEl) {
            summaryEl.textContent = 'OFFLINE';
            summaryEl.style.background = 'rgba(239, 68, 68, 0.2)';
            summaryEl.style.color = '#ef4444';
          }
          if (streamEl) {
            streamEl.textContent = 'Disconnected';
            streamEl.style.color = '#94a3b8';
          }
        }
      }
    },

    // ─── DJI RC 2 USB Auto-Detection & 1-Tap Sync Bar ────────────────────────
    handleRc2Connected(deviceData = {}) {
      this.rc2Device = deviceData;
      console.log('🎮 DJI RC 2 Connected via USB-C:', deviceData);

      if (typeof document === 'undefined') return;
      const bar = document.getElementById('android-rc2-sync-bar');
      const devNameEl = document.getElementById('android-rc2-device-name');
      const slotSelect = document.getElementById('android-rc2-slot-select');

      if (devNameEl) {
        devNameEl.textContent = deviceData.deviceName || 'DJI RC 2';
      }

      // Populate or query available slots
      let slots = deviceData.slots || [
        { uuid: '354A8F93-759C-42C3-A8D5-746F79C7622A', name: 'Mission Slot 1 (Default)' },
        { uuid: 'CE0D7948-AB09-40AB-A749-C0169AB5F9AD', name: 'Mission Slot 2' }
      ];
      this.rc2Slots = slots;

      if (slotSelect) {
        slotSelect.innerHTML = '';
        slots.forEach((s, idx) => {
          const opt = document.createElement('option');
          opt.value = s.uuid;
          opt.textContent = `${s.name} (${s.uuid.substring(0, 8)}...)`;
          if (idx === 0) opt.selected = true;
          slotSelect.appendChild(opt);
        });
        this.selectedSlotUuid = slots[0].uuid;
      }

      // Suppress floating sync bar on the main screen (Issue #264)
      // Connection status and sync actions are cleanly integrated into the Top Nav Pill and Left Nav Actions area.
      if (bar) {
        bar.classList.add('hidden');
        bar.style.display = 'none';
      }

      if (typeof showToast === 'function') {
        showToast(`🎮 ${deviceData.deviceName || 'DJI RC 2'} linked via USB-C. Ready to sync.`, 'info');
      }
      if (typeof setNativeRc2Connection === 'function') {
        setNativeRc2Connection(true, deviceData);
      } else if (typeof ApiClient !== 'undefined' && typeof ApiClient.setNativeRc2Connection === 'function') {
        ApiClient.setNativeRc2Connection(true, deviceData);
      }
    },

    handleRc2Disconnected() {
      console.log('🔌 DJI RC 2 Disconnected');
      this.rc2Device = null;
      if (typeof document === 'undefined') return;
      const bar = document.getElementById('android-rc2-sync-bar');
      const modal = document.getElementById('android-rc2-confirm-modal');
      if (bar) {
        bar.classList.add('hidden');
        bar.style.display = 'none';
      }
      if (modal) modal.classList.add('hidden');

      if (typeof showToast === 'function') {
        showToast('DJI RC 2 Disconnected', 'neutral');
      }
      if (typeof setNativeRc2Connection === 'function') {
        setNativeRc2Connection(false, null);
      } else if (typeof ApiClient !== 'undefined' && typeof ApiClient.setNativeRc2Connection === 'function') {
        ApiClient.setNativeRc2Connection(false, null);
      }
    },

    promptOverwriteConfirmation() {
      if (typeof document === 'undefined') return;
      const modal = document.getElementById('android-rc2-confirm-modal');
      const targetUuidEl = document.getElementById('android-rc2-modal-target-uuid');
      const missionNameEl = document.getElementById('android-rc2-modal-mission-name');

      const targetUuid = this.selectedSlotUuid || (this.rc2Slots[0] && this.rc2Slots[0].uuid) || '354A8F93-759C-42C3-A8D5-746F79C7622A';
      if (targetUuidEl) targetUuidEl.textContent = targetUuid;

      let missionName = 'Aalaapi Mission';
      const nameInput = document.getElementById('mission-name-input');
      if (nameInput && nameInput.value.trim()) missionName = nameInput.value.trim();
      if (missionNameEl) missionNameEl.textContent = missionName;

      if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
      }
    },

    async executeConfirmedSync() {
      if (typeof document === 'undefined') return;
      const modal = document.getElementById('android-rc2-confirm-modal');
      const syncBtn = document.getElementById('android-rc2-sync-btn');
      if (modal) modal.classList.add('hidden');

      const targetUuid = this.selectedSlotUuid || (this.rc2Slots[0] && this.rc2Slots[0].uuid) || '354A8F93-759C-42C3-A8D5-746F79C7622A';

      if (syncBtn) {
        syncBtn.disabled = true;
        syncBtn.textContent = '⏳ Compiling KMZ...';
      }

      try {
        let kmzBlob = null;
        if (typeof generateKmzBlob === 'function') {
          kmzBlob = await generateKmzBlob();
        } else if (typeof compileKmzBlob === 'function') {
          kmzBlob = await compileKmzBlob();
        } else if (typeof WpmlCompiler !== 'undefined' && WpmlCompiler.compileKmz) {
          kmzBlob = await WpmlCompiler.compileKmz();
        }

        if (syncBtn) syncBtn.textContent = '⚡ Transferring to RC 2...';

        // Convert blob to base64 for native Kotlin bridge
        let base64Kmz = '';
        if (kmzBlob) {
          const reader = new FileReader();
          base64Kmz = await new Promise((resolve, reject) => {
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(kmzBlob);
          });
        }

        if (window.AalaapiAndroid && typeof window.AalaapiAndroid.pushKmzToRc2 === 'function') {
          const ok = window.AalaapiAndroid.pushKmzToRc2(base64Kmz, targetUuid);
          if (!ok) throw new Error('Native Android MTP transfer rejected.');
        } else if (typeof WebUsbMtp !== 'undefined' && WebUsbMtp.isConnected) {
          await WebUsbMtp.sendKmz(kmzBlob, targetUuid);
        } else {
          // Fallback download if no USB connection is established
          if (kmzBlob && typeof saveAs === 'function') {
            saveAs(kmzBlob, `${targetUuid}.kmz`);
          }
        }

        if (typeof showToast === 'function') {
          showToast(`✅ Successfully synced mission to DJI RC 2 slot [${targetUuid.substring(0, 8)}...]! Re-open or restart DJI Fly.`, 'success');
        }
      } catch (err) {
        console.error('RC 2 Sync Error:', err);
        if (typeof showToast === 'function') {
          showToast(`❌ Sync Failed: ${err.message}`, 'error');
        }
      } finally {
        if (syncBtn) {
          syncBtn.disabled = false;
          syncBtn.textContent = '⚡ Sync KMZ to RC 2';
        }
      }
    },

    async pullLatestLog() {
      const pullLogBtn = document.getElementById('android-rc2-pull-log-btn');
      if (pullLogBtn) {
        pullLogBtn.disabled = true;
        pullLogBtn.textContent = '⏳ Pulling Log...';
      }

      try {
        if (window.AalaapiAndroid && typeof window.AalaapiAndroid.pullLatestLogFromRc2 === 'function') {
          const rawRes = window.AalaapiAndroid.pullLatestLogFromRc2();
          if (!rawRes) {
            throw new Error('No flight logs found on connected RC 2');
          }

          let logPayload = null;
          let logBase64 = null;
          let logFilename = 'FlightRecord_latest.txt';

          try {
            logPayload = JSON.parse(rawRes);
          } catch (_) {
            logBase64 = rawRes;
          }

          if (logPayload) {
            if (!logPayload.success) {
              throw new Error(logPayload.message || logPayload.error || 'RC 2 flight log pull failed');
            }
            logBase64 = logPayload.data || logPayload.base64;
            logFilename = logPayload.filename || logFilename;
          }

          if (!logBase64) {
            throw new Error('Empty flight log payload received from RC 2');
          }

          if (typeof DigitalTwin !== 'undefined' && typeof DigitalTwin.loadFlightLogData === 'function') {
            await DigitalTwin.loadFlightLogData(logFilename, logBase64);
          } else if (typeof window.atob === 'function') {
            const rawText = window.atob(logBase64);
            if (typeof DjiLogDecryptor !== 'undefined' && DjiLogDecryptor.parseLogText) {
              DjiLogDecryptor.parseLogText(rawText, logFilename);
            }
          }

          if (typeof showToast === 'function') {
            showToast(`📥 Flight log pulled from DJI RC 2 (${logFilename})`, 'success');
          }

          try {
            if (typeof FlightDiagnostics !== 'undefined' && FlightDiagnostics.open) {
              const telemetryPayload = (typeof DigitalTwin !== 'undefined' && DigitalTwin.telemetryData) ? {
                flightId: logFilename,
                telemetry: DigitalTwin.telemetryData,
                comparison: DigitalTwin.comparisonData,
                isActualFlown: true
              } : logFilename;
              await FlightDiagnostics.open('3d', telemetryPayload);
            }
          } catch (e) {
            console.warn('FlightDiagnostics open error:', e);
          }
        } else if (typeof WebUsbMtp !== 'undefined') {
          if (typeof pullLogViaWebUsb === 'function') {
            await pullLogViaWebUsb();
          }
        }
      } catch (err) {
        console.error('Log pull error:', err);
        if (typeof showToast === 'function') {
          showToast(`❌ Log Pull Failed: ${err.message}`, 'error');
        }
      } finally {
        if (pullLogBtn) {
          pullLogBtn.disabled = false;
          pullLogBtn.textContent = '📥 Pull Latest Log';
        }
      }
    }
  };

  // Expose global bridge functions for Android WebView JavaScript Interface
  if (typeof window !== 'undefined') {
    window.AalaapiAndroidBridge = AndroidNativeBridge;
    window.AndroidNativeBridge = AndroidNativeBridge;
    window.ingestRemoteIdFrame = (payload, rssi, transport) => AndroidNativeBridge.ingestRemoteIdFrame(payload, rssi, transport);
    window.ingestAdsbSbsLine = (line) => AndroidNativeBridge.ingestAdsbSbsLine(line);
    window.ingestAdsbJson = (jsonPayload) => AndroidNativeBridge.ingestAdsbJson(jsonPayload);
    window.onAdsbStatusChanged = (status, host, port, error) => AndroidNativeBridge.onAdsbStatusChanged(status, host, port, error);
    window.onNativeTtsError = (message) => {
      if (typeof showToast === 'function') showToast('🔇 ' + (message || 'Voice advisory unavailable'), 'error');
    };
    window.onRc2UsbConnected = (dev) => AndroidNativeBridge.handleRc2Connected(dev);
    window.onRc2UsbDisconnected = () => AndroidNativeBridge.handleRc2Disconnected();

    // Auto-init on DOMContentLoaded or immediate
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => AndroidNativeBridge.init());
    } else {
      AndroidNativeBridge.init();
    }
  }

  return {
    ClientRemoteIdDecoder,
    ClientAdsbProcessor,
    AndroidNativeBridge
  };
});
