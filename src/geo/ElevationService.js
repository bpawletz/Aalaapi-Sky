/**
 * src/geo/ElevationService.js
 *
 * Dynamic Digital Elevation Model (DEM) and Terrain Following Engine for Aalaapi Sky.
 * Implements:
 * - Client-side batch coordinate elevation sampling via Open-Meteo Global Copernicus DEM
 * - Local Companion Bridge tile/elevation caching proxy integration
 * - Pure JavaScript GeoTIFF DEM parser with bilinear interpolation
 * - Two-pass slope gradient smoother ensuring vertical climbs/descents <= 20°
 * - 2D cross-section elevation profiling (ground vs. flight path)
 * - Three-tier cascade resolution (Layer Target AGL -> Global Default AGL -> Waypoint Override)
 */

class ElevationService {
  constructor() {
    this.cache = new Map(); // "lat,lon" -> elevationMeters
    this.cachedDem = null;   // Active parsed GeoTIFF DEM object
    this.bridgeUrl = 'http://127.0.0.1:8765';
    this.isBridgeAvailable = null;
  }

  /**
   * Check if companion bridge is running locally
   */
  async checkBridgeHealth() {
    if (typeof fetch === 'undefined') return false;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 800);
      const res = await fetch(`${this.bridgeUrl}/api/status`, { signal: controller.signal });
      clearTimeout(timeoutId);
      this.isBridgeAvailable = res.ok;
      return res.ok;
    } catch (e) {
      this.isBridgeAvailable = false;
      return false;
    }
  }

  /**
   * Format coordinate key for cache
   */
  coordKey(lat, lon) {
    return `${Number(lat).toFixed(6)},${Number(lon).toFixed(6)}`;
  }

  /**
   * Fetch surface elevations for an array of coordinates.
   * Uses in-memory cache, Companion Bridge caching proxy, or direct Open-Meteo API.
   *
   * @param {Array<{lat: number, lon: number}>} coordinates
   * @param {Object} [options]
   * @param {string} [options.source='auto'] 'auto' | 'open-meteo' | 'bridge' | 'geotiff'
   * @returns {Promise<number[]>} Array of elevation numbers in meters MSL
   */
  async fetchElevations(coordinates, options = {}) {
    if (!Array.isArray(coordinates) || coordinates.length === 0) return [];
    const source = options.source || 'auto';

    // 1. If GeoTIFF DEM is loaded and selected or auto-active, sample locally
    if ((source === 'geotiff' || (source === 'auto' && this.cachedDem)) && this.cachedDem) {
      return coordinates.map(coord => {
        const val = this.cachedDem.sampleAt(coord.lat, coord.lon);
        return typeof val === 'number' && !isNaN(val) ? val : 0;
      });
    }

    // 2. Check in-memory cache for coordinates
    const results = new Array(coordinates.length);
    const missingIndices = [];
    const missingCoords = [];

    coordinates.forEach((c, idx) => {
      const key = this.coordKey(c.lat, c.lon);
      if (this.cache.has(key)) {
        results[idx] = this.cache.get(key);
      } else {
        missingIndices.push(idx);
        missingCoords.push(c);
      }
    });

    if (missingCoords.length === 0) {
      return results;
    }

    // 3. Batch query missing coordinates in chunks of up to 100 (Open-Meteo max per request)
    const BATCH_SIZE = 100;
    const fetchedElevations = [];

    for (let i = 0; i < missingCoords.length; i += BATCH_SIZE) {
      const chunk = missingCoords.slice(i, i + BATCH_SIZE);
      const chunkElevations = await this._queryElevationBatch(chunk, options);
      fetchedElevations.push(...chunkElevations);
    }

    // Populate results and cache
    missingIndices.forEach((origIdx, i) => {
      const elev = (typeof fetchedElevations[i] === 'number' && !isNaN(fetchedElevations[i]))
        ? fetchedElevations[i]
        : 0;
      results[origIdx] = elev;
      const c = coordinates[origIdx];
      this.cache.set(this.coordKey(c.lat, c.lon), elev);
    });

    return results;
  }

  /**
   * Synchronously sample surface elevations for an array of coordinates from
   * in-memory cache or active GeoTIFF DEM. Returns 0 for uncached coordinates.
   *
   * @param {Array<{lat: number, lon: number}>} coordinates
   * @returns {number[]} Array of elevation numbers in meters MSL
   */
  sampleElevationsSync(coordinates) {
    if (!Array.isArray(coordinates)) return [];
    return coordinates.map(c => {
      if (this.cachedDem) {
        const v = this.cachedDem.sampleAt(c.lat, c.lon);
        if (typeof v === 'number' && !isNaN(v)) return v;
      }
      const key = this.coordKey(c.lat, c.lon);
      if (this.cache.has(key)) {
        return this.cache.get(key);
      }
      return 0;
    });
  }

  /**
   * Check if any coordinates in the list are missing from the cache
   */
  hasMissingElevations(coordinates) {
    if (!Array.isArray(coordinates) || coordinates.length === 0) return false;
    if (this.cachedDem) return false;
    return coordinates.some(c => !this.cache.has(this.coordKey(c.lat, c.lon)));
  }

  /**
   * Synchronously apply terrain-following elevation adjustment and slope smoothing.
   * Follows the 3-tier cascade: Layer Target AGL -> Global Default AGL -> Waypoint Override.
   *
   * @param {Array<Object>} waypoints
   * @param {Object} [options]
   * @returns {Array<Object>}
   */
  applyTerrainFollowingSync(waypoints, options = {}) {
    if (!Array.isArray(waypoints) || waypoints.length === 0) return waypoints;

    const targetAgl = typeof options.targetAgl === 'number' ? options.targetAgl : 50;
    const maxSlopeAngle = typeof options.maxSlopeAngle === 'number' ? options.maxSlopeAngle : 20;

    const coords = waypoints.map(wp => ({ lat: wp.lat, lon: wp.lon }));
    const elevations = (options && Array.isArray(options.elevations))
      ? options.elevations
      : this.sampleElevationsSync(coords);

    const initializedWps = waypoints.map((wp, idx) => {
      const surfaceElev = elevations[idx] || 0;
      const hasWpOverride = wp.isModified && wp.alt !== undefined && wp.alt !== null && wp.alt !== 'inherit';
      const agl = hasWpOverride ? (wp.alt - surfaceElev) : targetAgl;

      return {
        ...wp,
        surfaceElevation: surfaceElev,
        agl: agl,
        alt: hasWpOverride ? wp.alt : (surfaceElev + agl),
        isTerrainFollow: true
      };
    });

    return this.smoothAltitudes(initializedWps, maxSlopeAngle);
  }

  /**
   * Internal batch query handler (routes via Bridge or Open-Meteo)
   */
  async _queryElevationBatch(chunk, options = {}) {
    if (typeof fetch === 'undefined') {
      return chunk.map(() => 0);
    }

    const lats = chunk.map(c => Number(c.lat).toFixed(6)).join(',');
    const lons = chunk.map(c => Number(c.lon).toFixed(6)).join(',');

    const openMeteoUrl = `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lons}`;

    // Try Companion Bridge first if not explicitly disabled
    const useBridge = options.source !== 'open-meteo' && this.isBridgeAvailable !== false;
    if (useBridge) {
      try {
        const proxyUrl = `${this.bridgeUrl}/api/elevation?latitude=${lats}&longitude=${lons}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2500);
        const res = await fetch(proxyUrl, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.elevation)) {
            this.isBridgeAvailable = true;
            return data.elevation;
          }
        }
      } catch (err) {
        // Bridge failed or timed out, fallback to direct Open-Meteo
        this.isBridgeAvailable = false;
      }
    }

    // Direct Open-Meteo query
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(openMeteoUrl, { credentials: 'omit', signal: controller.signal });
      clearTimeout(timeoutId);
      if (!res.ok) {
        throw new Error(`Elevation API HTTP ${res.status}`);
      }
      const data = await res.json();
      if (Array.isArray(data.elevation)) {
        return data.elevation;
      }
      if (typeof data.elevation === 'number') {
        return [data.elevation];
      }
    } catch (err) {
      if (typeof Logger !== 'undefined' && Logger.warn) {
        Logger.warn('Elevation lookup failed, defaulting to 0 MSL:', err.message);
      }
    }

    return chunk.map(() => 0);
  }

  /**
   * Pure JavaScript GeoTIFF DEM parser for single-band Float32 / Int16 elevation rasters.
   * Supports standard TIFF 6.0 uncompressed rasters with ModelTiepointTag and ModelPixelScaleTag.
   *
   * @param {ArrayBuffer} arrayBuffer
   * @returns {Object} Parsed DEM object
   */
  parseGeoTiff(arrayBuffer) {
    if (!arrayBuffer || !(arrayBuffer instanceof ArrayBuffer)) {
      throw new Error('Invalid GeoTIFF input: expected ArrayBuffer');
    }

    const dataView = new DataView(arrayBuffer);
    if (arrayBuffer.byteLength < 8) {
      throw new Error('File too small to be a valid TIFF');
    }

    // 1. Determine Endianness
    const byteOrder = dataView.getUint16(0, false);
    let littleEndian;
    if (byteOrder === 0x4949) {
      littleEndian = true; // "II" Intel
    } else if (byteOrder === 0x4D4D) {
      littleEndian = false; // "MM" Motorola
    } else {
      throw new Error('Invalid TIFF header: unknown byte order');
    }

    // Check magic number 42
    const magic = dataView.getUint16(2, littleEndian);
    if (magic !== 42) {
      throw new Error(`Invalid TIFF magic number: ${magic}`);
    }

    // Read first IFD offset
    const firstIfdOffset = dataView.getUint32(4, littleEndian);
    if (firstIfdOffset >= arrayBuffer.byteLength) {
      throw new Error('Corrupt TIFF: IFD offset out of bounds');
    }

    const numEntries = dataView.getUint16(firstIfdOffset, littleEndian);
    const tags = {};

    let entryOffset = firstIfdOffset + 2;
    for (let i = 0; i < numEntries; i++) {
      if (entryOffset + 12 > arrayBuffer.byteLength) break;
      const tagId = dataView.getUint16(entryOffset, littleEndian);
      const type = dataView.getUint16(entryOffset + 2, littleEndian);
      const count = dataView.getUint32(entryOffset + 4, littleEndian);
      const valueOrOffset = dataView.getUint32(entryOffset + 8, littleEndian);

      tags[tagId] = { type, count, valueOrOffset, entryOffset };
      entryOffset += 12;
    }

    // Helper to read tag values
    const readTagValues = (tagId) => {
      const entry = tags[tagId];
      if (!entry) return null;
      const { type, count, valueOrOffset } = entry;

      let valueOffset = valueOrOffset;
      // If data fits in 4 bytes, valueOffset is the value itself
      const typeSizes = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 8: 2, 9: 4, 11: 4, 12: 8 };
      const size = typeSizes[type] || 1;
      const totalSize = count * size;

      if (totalSize <= 4) {
        valueOffset = entry.entryOffset + 8;
      }

      if (valueOffset + totalSize > arrayBuffer.byteLength) return null;

      const vals = [];
      for (let j = 0; j < count; j++) {
        const off = valueOffset + j * size;
        if (type === 1) vals.push(dataView.getUint8(off));
        else if (type === 3) vals.push(dataView.getUint16(off, littleEndian));
        else if (type === 4) vals.push(dataView.getUint32(off, littleEndian));
        else if (type === 5) {
          // RATIONAL
          const num = dataView.getUint32(off, littleEndian);
          const den = dataView.getUint32(off + 4, littleEndian);
          vals.push(den !== 0 ? num / den : 0);
        } else if (type === 8) vals.push(dataView.getInt16(off, littleEndian));
        else if (type === 9) vals.push(dataView.getInt32(off, littleEndian));
        else if (type === 11) vals.push(dataView.getFloat32(off, littleEndian));
        else if (type === 12) vals.push(dataView.getFloat64(off, littleEndian));
      }
      return vals;
    };

    const width = (readTagValues(256) || [])[0]; // ImageWidth
    const height = (readTagValues(257) || [])[0]; // ImageLength
    const bitsPerSample = (readTagValues(258) || [32])[0];
    const sampleFormat = (readTagValues(339) || [1])[0]; // 1=uint, 2=int, 3=float
    const stripOffsets = readTagValues(273) || [];
    const rowsPerStrip = (readTagValues(278) || [height])[0];
    const stripByteCounts = readTagValues(279) || [];
    const pixelScale = readTagValues(33550); // ModelPixelScaleTag [scaleX, scaleY, scaleZ]
    const tiepoints = readTagValues(33922);  // ModelTiepointTag [i, j, k, x, y, z]

    if (!width || !height || stripOffsets.length === 0) {
      throw new Error('TIFF missing essential raster dimensions or strip offsets');
    }

    // Extract elevation raster matrix
    let raster;
    if (sampleFormat === 3 || bitsPerSample === 32) {
      raster = new Float32Array(width * height);
    } else if (sampleFormat === 2 || bitsPerSample === 16) {
      raster = new Int16Array(width * height);
    } else {
      raster = new Float32Array(width * height);
    }

    let currentRow = 0;
    for (let s = 0; s < stripOffsets.length; s++) {
      const offset = stripOffsets[s];
      const rowsInThisStrip = Math.min(rowsPerStrip, height - currentRow);
      const numPixels = rowsInThisStrip * width;

      if (offset + numPixels * (bitsPerSample / 8) <= arrayBuffer.byteLength) {
        for (let p = 0; p < numPixels; p++) {
          const pixelOffset = offset + p * (bitsPerSample / 8);
          let val = 0;
          if (bitsPerSample === 32 && sampleFormat === 3) {
            val = dataView.getFloat32(pixelOffset, littleEndian);
          } else if (bitsPerSample === 16 && sampleFormat === 2) {
            val = dataView.getInt16(pixelOffset, littleEndian);
          } else if (bitsPerSample === 16) {
            val = dataView.getUint16(pixelOffset, littleEndian);
          } else if (bitsPerSample === 32) {
            val = dataView.getInt32(pixelOffset, littleEndian);
          }
          raster[currentRow * width + p] = val;
        }
      }
      currentRow += rowsInThisStrip;
    }

    // Georeferencing parameters
    let originX = 0, originY = 0;
    let scaleX = 1, scaleY = 1;

    if (tiepoints && tiepoints.length >= 6) {
      // tiepoint: [i, j, k, x, y, z]
      originX = tiepoints[3] - tiepoints[0] * (pixelScale ? pixelScale[0] : 1);
      originY = tiepoints[4] + tiepoints[1] * (pixelScale ? pixelScale[1] : 1);
    }

    if (pixelScale && pixelScale.length >= 2) {
      scaleX = pixelScale[0];
      scaleY = pixelScale[1];
    }

    // Calculate bounds & stats
    let minElev = Infinity, maxElev = -Infinity;
    for (let i = 0; i < raster.length; i++) {
      const v = raster[i];
      // Filter out typical NODATA values (-9999, -32767, etc.)
      if (v > -9000 && v < 10000) {
        if (v < minElev) minElev = v;
        if (v > maxElev) maxElev = v;
      }
    }

    if (minElev === Infinity) {
      minElev = 0;
      maxElev = 0;
    }

    const minX = originX;
    const maxX = originX + width * scaleX;
    const maxY = originY;
    const minY = originY - height * scaleY;

    const dem = {
      width,
      height,
      minElev,
      maxElev,
      originX,
      originY,
      scaleX,
      scaleY,
      minX,
      maxX,
      minY,
      maxY,
      raster,
      /**
       * Sample elevation at georeferenced coordinate (lon/lat or X/Y) with bilinear interpolation
       */
      sampleAt: (lat, lon) => {
        // Assume X is lon, Y is lat for WGS84 GeoTIFFs
        const x = lon;
        const y = lat;

        const colFloat = (x - originX) / scaleX;
        const rowFloat = (originY - y) / scaleY;

        if (colFloat < 0 || colFloat >= width - 1 || rowFloat < 0 || rowFloat >= height - 1) {
          // Clamp to boundary edge if closely adjacent
          const c = Math.max(0, Math.min(width - 1, Math.round(colFloat)));
          const r = Math.max(0, Math.min(height - 1, Math.round(rowFloat)));
          const v = raster[r * width + c];
          return (v > -9000 && v < 10000) ? v : minElev;
        }

        const c0 = Math.floor(colFloat);
        const c1 = c0 + 1;
        const r0 = Math.floor(rowFloat);
        const r1 = r0 + 1;

        const dx = colFloat - c0;
        const dy = rowFloat - r0;

        const v00 = raster[r0 * width + c0];
        const v10 = raster[r0 * width + c1];
        const v01 = raster[r1 * width + c0];
        const v11 = raster[r1 * width + c1];

        // Bilinear interpolation
        const val = (1 - dx) * (1 - dy) * v00 +
                    dx * (1 - dy) * v10 +
                    (1 - dx) * dy * v01 +
                    dx * dy * v11;

        return (val > -9000 && val < 10000) ? val : minElev;
      }
    };

    this.cachedDem = dem;
    return dem;
  }

  /**
   * Two-pass slope gradient smoother ensuring climb/descent slope between sequential
   * waypoints does not exceed maxGradientAngleDeg (default 20°).
   *
   * Crucially guarantees that smoothed altitude never breaches safety clearance (target AGL)
   * by raising earlier waypoints during the backward pass if rising terrain is encountered ahead.
   *
   * @param {Array<Object>} waypoints
   * @param {number} [maxGradientAngleDeg=20] Max slope angle in degrees
   * @returns {Array<Object>} Waypoints with smoothed altitudes
   */
  smoothAltitudes(waypoints, maxGradientAngleDeg = 20) {
    if (!Array.isArray(waypoints) || waypoints.length === 0) return waypoints;
    const maxSlope = Math.tan((maxGradientAngleDeg * Math.PI) / 180.0);

    const n = waypoints.length;
    const targetAlts = waypoints.map(wp => {
      const surface = typeof wp.surfaceElevation === 'number' ? wp.surfaceElevation : 0;
      const agl = typeof wp.agl === 'number' ? wp.agl : 50;
      return surface + agl;
    });

    const smoothed = [...targetAlts];

    // Compute horizontal distances between sequential points
    const distances = new Array(n - 1);
    for (let i = 0; i < n - 1; i++) {
      const p1 = waypoints[i];
      const p2 = waypoints[i + 1];
      let dist = 10; // fallback minimum distance

      if (typeof p1.x === 'number' && typeof p2.x === 'number') {
        dist = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
      } else if (typeof p1.lat === 'number' && typeof p2.lat === 'number') {
        dist = this.haversineDistance(p1.lat, p1.lon, p2.lat, p2.lon);
      }
      distances[i] = Math.max(0.5, dist);
    }

    // 1. Backward pass: If terrain rises steeply ahead at i+1, start climbing early at i
    // ensuring we don't violate minimum target clearance at i+1 while respecting max climb angle
    for (let i = n - 2; i >= 0; i--) {
      const maxDeltaZ = distances[i] * maxSlope;
      if (smoothed[i] < smoothed[i + 1] - maxDeltaZ) {
        smoothed[i] = smoothed[i + 1] - maxDeltaZ;
      }
    }

    // 2. Forward pass: Limit descent rate so the drone does not dive steeper than max slope
    for (let i = 1; i < n; i++) {
      const maxDeltaZ = distances[i - 1] * maxSlope;
      // Also ensure we never drop below minimum ground clearance (targetAlts[i])
      if (smoothed[i] < smoothed[i - 1] - maxDeltaZ) {
        smoothed[i] = Math.max(targetAlts[i], smoothed[i - 1] - maxDeltaZ);
      }
    }

    // Apply back to waypoints
    return waypoints.map((wp, idx) => {
      const alt = Math.round(smoothed[idx] * 10) / 10;
      const surface = typeof wp.surfaceElevation === 'number' ? wp.surfaceElevation : 0;
      return {
        ...wp,
        alt: alt,
        smoothedAlt: alt,
        actualAgl: Math.round((alt - surface) * 10) / 10,
        isTerrainFollow: true
      };
    });
  }

  /**
   * Calculate distance between two geodetic coordinates in meters
   */
  haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Generate 2D cross-section elevation profile along the wayline track
   *
   * @param {Array<Object>} waypoints
   * @returns {Object} Elevation profile statistics and sample points
   */
  generateElevationProfile(waypoints) {
    if (!Array.isArray(waypoints) || waypoints.length === 0) {
      return { totalDistance: 0, points: [], minGround: 0, maxGround: 0, minFlight: 0, maxFlight: 0 };
    }

    const points = [];
    let cumulativeDist = 0;

    let minGround = Infinity, maxGround = -Infinity;
    let minFlight = Infinity, maxFlight = -Infinity;

    for (let i = 0; i < waypoints.length; i++) {
      const wp = waypoints[i];
      if (i > 0) {
        const prev = waypoints[i - 1];
        let d = 0;
        if (typeof wp.x === 'number' && typeof prev.x === 'number') {
          d = Math.sqrt(Math.pow(wp.x - prev.x, 2) + Math.pow(wp.y - prev.y, 2));
        } else if (typeof wp.lat === 'number' && typeof prev.lat === 'number') {
          d = this.haversineDistance(prev.lat, prev.lon, wp.lat, wp.lon);
        }
        cumulativeDist += d;
      }

      const groundElev = typeof wp.surfaceElevation === 'number' ? wp.surfaceElevation : 0;
      const flightAlt = typeof wp.alt === 'number' ? wp.alt : (groundElev + 50);
      const agl = flightAlt - groundElev;

      if (groundElev < minGround) minGround = groundElev;
      if (groundElev > maxGround) maxGround = groundElev;
      if (flightAlt < minFlight) minFlight = flightAlt;
      if (flightAlt > maxFlight) maxFlight = flightAlt;

      points.push({
        wpIndex: i,
        s: Math.round(cumulativeDist * 10) / 10,
        groundElev: Math.round(groundElev * 10) / 10,
        flightAlt: Math.round(flightAlt * 10) / 10,
        agl: Math.round(agl * 10) / 10
      });
    }

    if (minGround === Infinity) {
      minGround = 0;
      maxGround = 0;
      minFlight = 50;
      maxFlight = 50;
    }

    return {
      totalDistance: Math.round(cumulativeDist * 10) / 10,
      points,
      minGround: Math.round(minGround * 10) / 10,
      maxGround: Math.round(maxGround * 10) / 10,
      minFlight: Math.round(minFlight * 10) / 10,
      maxFlight: Math.round(maxFlight * 10) / 10,
      reliefMeters: Math.round((maxGround - minGround) * 10) / 10
    };
  }

  /**
   * Apply terrain-following elevation adjustment and slope smoothing to a waypoint list.
   * Follows the 3-tier cascade: Layer Target AGL -> Global Default AGL -> Waypoint Override.
   *
   * @param {Array<Object>} waypoints
   * @param {Object} [options]
   * @returns {Promise<Array<Object>>}
   */
  async applyTerrainFollowing(waypoints, options = {}) {
    if (!Array.isArray(waypoints) || waypoints.length === 0) return waypoints;

    const targetAgl = typeof options.targetAgl === 'number' ? options.targetAgl : 50;
    const maxSlopeAngle = typeof options.maxSlopeAngle === 'number' ? options.maxSlopeAngle : 20;

    // Fetch surface elevations for waypoints
    const coords = waypoints.map(wp => ({ lat: wp.lat, lon: wp.lon }));
    const elevations = await this.fetchElevations(coords, options);

    // Apply raw elevation and target AGL
    const initializedWps = waypoints.map((wp, idx) => {
      const surfaceElev = elevations[idx] || 0;
      // If individual waypoint has an explicit override that is not 'inherit', preserve it
      const hasWpOverride = wp.isModified && wp.alt !== undefined && wp.alt !== null && wp.alt !== 'inherit';
      const agl = hasWpOverride ? (wp.alt - surfaceElev) : targetAgl;

      return {
        ...wp,
        surfaceElevation: surfaceElev,
        agl: agl,
        alt: hasWpOverride ? wp.alt : (surfaceElev + agl),
        isTerrainFollow: true
      };
    });

    // Apply two-pass slope gradient smoothing
    return this.smoothAltitudes(initializedWps, maxSlopeAngle);
  }
}

// Global Singleton Instance
const elevationServiceInstance = new ElevationService();


function drawElevationProfileChart(canvas, profileData) {
  if (!canvas || !profileData || !profileData.points || profileData.points.length === 0) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const w = canvas.width = canvas.parentElement ? canvas.parentElement.clientWidth : 700;
  const h = canvas.height = 110;

  ctx.clearRect(0, 0, w, h);

  const padLeft = 45;
  const padRight = 20;
  const padTop = 15;
  const padBottom = 22;
  const chartW = w - padLeft - padRight;
  const chartH = h - padTop - padBottom;

  const totalDist = Math.max(1, profileData.totalDistance);
  const minVal = Math.floor(Math.min(profileData.minGround, profileData.minFlight) - 5);
  const maxVal = Math.ceil(Math.max(profileData.maxGround, profileData.maxFlight) + 5);
  const valRange = Math.max(10, maxVal - minVal);

  const getX = (dist) => padLeft + (dist / totalDist) * chartW;
  const getY = (val) => padTop + chartH - ((val - minVal) / valRange) * chartH;

  // Background Grid Lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.lineWidth = 1;
  const yTicks = 4;
  ctx.fillStyle = '#64748b';
  ctx.font = '9px monospace';
  ctx.textAlign = 'right';

  for (let i = 0; i <= yTicks; i++) {
    const val = minVal + (valRange / yTicks) * i;
    const y = getY(val);
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(w - padRight, y);
    ctx.stroke();
    ctx.fillText(Math.round(val) + "m", padLeft - 4, y + 3);
  }

  // Draw Ground Fill & Surface Line
  ctx.beginPath();
  profileData.points.forEach((pt, idx) => {
    const x = getX(pt.s);
    const y = getY(pt.groundElev);
    if (idx === 0) {
      ctx.moveTo(x, padTop + chartH);
      ctx.lineTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.lineTo(getX(profileData.totalDistance), padTop + chartH);
  ctx.closePath();
  ctx.fillStyle = 'rgba(16, 185, 129, 0.12)';
  ctx.fill();

  // Ground Line stroke
  ctx.beginPath();
  profileData.points.forEach((pt, idx) => {
    const x = getX(pt.s);
    const y = getY(pt.groundElev);
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = '#10b981';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Vertical clearance tethers (AGL dashes)
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.35)';
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 3]);
  profileData.points.forEach(pt => {
    const x = getX(pt.s);
    ctx.beginPath();
    ctx.moveTo(x, getY(pt.groundElev));
    ctx.lineTo(x, getY(pt.flightAlt));
    ctx.stroke();
  });
  ctx.setLineDash([]);

  // Draw Flight Trajectory Line
  ctx.beginPath();
  profileData.points.forEach((pt, idx) => {
    const x = getX(pt.s);
    const y = getY(pt.flightAlt);
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = '#06b6d4';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Waypoint Dots on Flight Trajectory
  profileData.points.forEach(pt => {
    const x = getX(pt.s);
    const y = getY(pt.flightAlt);
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });

  // X-axis distance labels
  ctx.fillStyle = '#64748b';
  ctx.textAlign = 'center';
  const xTicks = 5;
  for (let i = 0; i <= xTicks; i++) {
    const dist = (totalDist / xTicks) * i;
    const x = getX(dist);
    ctx.fillText(Math.round(dist) + "m", x, h - 5);
  }
}

function updateElevationProfileUi() {
  if (typeof document === 'undefined') return;
  const canvas = document.getElementById('elevation-profile-canvas');
  const drawer = document.getElementById('elevation-profile-drawer');
  if (!canvas || !drawer || drawer.classList.contains('hidden')) return;

  const waypoints = (typeof getCurrentWaypoints === 'function') ? getCurrentWaypoints() : [];
  if (!waypoints || waypoints.length === 0) return;

  const profile = elevationServiceInstance.generateElevationProfile(waypoints);
  drawElevationProfileChart(canvas, profile);

  const reliefBadge = document.getElementById('elev-profile-relief-badge');
  if (reliefBadge) reliefBadge.textContent = 'Relief: ' + profile.reliefMeters + 'm';

  const distBadge = document.getElementById('elev-profile-dist-badge');
  if (distBadge) distBadge.textContent = 'Distance: ' + profile.totalDistance + 'm';

  const stats = document.getElementById('elev-profile-stats');
  if (stats) stats.textContent = 'Ground: ' + profile.minGround + 'm–' + profile.maxGround + 'm | Flight: ' + profile.minFlight + 'm–' + profile.maxFlight + 'm';
}

if (typeof window !== 'undefined') {
  window.ElevationService = elevationServiceInstance;
  window.ElevationServiceClass = ElevationService;
  window.drawElevationProfileChart = drawElevationProfileChart;
  window.updateElevationProfileUi = updateElevationProfileUi;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ElevationService,
    elevationServiceInstance,
    drawElevationProfileChart,
    updateElevationProfileUi
  };
}
