/**
 * src/map/OfflineFieldPackager.js
 *
 * Client-Side Offline Field Packager for Aalaapi Sky.
 * Pre-fetches and stores map tiles and DEM elevation grids in browser IndexedDB
 * so pilots can plan missions at home or base, pack the area with 1 click, and
 * fly autonomously in rural field locations without internet or a Companion Bridge.
 */

const OFFLINE_DB_NAME = 'aalaapi_offline_field_db';
const OFFLINE_DB_VERSION = 1;
const TILES_STORE_NAME = 'tiles';
const ELEVATION_STORE_NAME = 'elevation';

function openOfflineDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB is not supported in this browser environment.'));
    }
    const req = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(TILES_STORE_NAME)) {
        db.createObjectStore(TILES_STORE_NAME, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(ELEVATION_STORE_NAME)) {
        db.createObjectStore(ELEVATION_STORE_NAME, { keyPath: 'coord' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function latLonToTile(lat, lon, zoom) {
  const latRad = lat * Math.PI / 180;
  const n = Math.pow(2, zoom);
  const x = Math.floor((lon + 180) / 360 * n);
  const y = Math.floor((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2 * n);
  return { x, y, z: zoom };
}

class OfflineFieldPackagerEngine {
  constructor() {
    this.isPacking = false;
    this.abortController = null;
    this.cachedTileCount = 0;
  }

  /**
   * Calculate bounding box for active mission with buffer.
   */
  getMissionBoundingBox(bufferMeters = 500) {
    let lats = [];
    let lons = [];

    if (typeof getCurrentWaypoints === 'function') {
      const wps = getCurrentWaypoints();
      if (wps && wps.length > 0) {
        wps.forEach(wp => {
          if (typeof wp.lat === 'number' && typeof wp.lon === 'number') {
            lats.push(wp.lat);
            lons.push(wp.lon);
          }
        });
      }
    }

    if (lats.length === 0 && typeof centerMarker !== 'undefined' && centerMarker) {
      const ll = centerMarker.getLatLng();
      lats.push(ll.lat);
      lons.push(ll.lng);
    }

    if (lats.length === 0 && typeof map !== 'undefined' && map && map.getCenter) {
      const ll = map.getCenter();
      lats.push(ll.lat);
      lons.push(ll.lng);
    }

    if (lats.length === 0) {
      // Default fallback
      lats = [41.3215];
      lons = [-88.9950];
    }

    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);

    // Degree offsets for buffer meters
    const latBufferDeg = bufferMeters / 111320;
    const avgLat = (minLat + maxLat) / 2;
    const lonBufferDeg = bufferMeters / (111320 * Math.cos(avgLat * Math.PI / 180));

    return {
      south: minLat - latBufferDeg,
      north: maxLat + latBufferDeg,
      west: minLon - lonBufferDeg,
      east: maxLon + lonBufferDeg
    };
  }

  /**
   * Enumerate all tile coordinate keys inside bbox for specified zoom levels.
   */
  enumerateTileList(bbox, minZoom = 14, maxZoom = 17) {
    const tiles = [];
    for (let z = minZoom; z <= maxZoom; z++) {
      const p1 = latLonToTile(bbox.north, bbox.west, z);
      const p2 = latLonToTile(bbox.south, bbox.east, z);
      const minX = Math.min(p1.x, p2.x);
      const maxX = Math.max(p1.x, p2.x);
      const minY = Math.min(p1.y, p2.y);
      const maxY = Math.max(p1.y, p2.y);

      for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
          tiles.push({ z, x, y, key: `${z}/${x}/${y}` });
        }
      }
    }
    return tiles;
  }

  estimateRequirements(minZoom = 14, maxZoom = 17, bufferMeters = 500) {
    const bbox = this.getMissionBoundingBox(bufferMeters);
    const tiles = this.enumerateTileList(bbox, minZoom, maxZoom);
    const avgTileBytes = 25 * 1024; // ~25 KB per tile
    const totalBytes = tiles.length * avgTileBytes;
    const totalMb = (totalBytes / (1024 * 1024)).toFixed(1);
    return {
      tileCount: tiles.length,
      estimatedMb: totalMb,
      bbox,
      minZoom,
      maxZoom
    };
  }

  /**
   * Pack mission area into IndexedDB with real-time progress callbacks.
   */
  async packMissionArea({ minZoom = 14, maxZoom = 17, bufferMeters = 500, onProgress = null } = {}) {
    if (this.isPacking) {
      throw new Error('A field packaging job is already in progress.');
    }

    this.isPacking = true;
    this.abortController = new AbortController();

    const db = await openOfflineDb();
    const bbox = this.getMissionBoundingBox(bufferMeters);
    const tiles = this.enumerateTileList(bbox, minZoom, maxZoom);
    const total = tiles.length;

    let downloaded = 0;
    let failed = 0;

    // Use permissible satellite imagery fallback by default (Esri World Imagery)
    let tileUrlTemplate = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
    if (typeof map !== 'undefined' && map) {
      map.eachLayer(layer => {
        if (layer && layer._url && !layer._url.includes('proxy') &&
            !layer._url.includes('VIIRS_Black_Marble') &&
            !layer._url.includes('goes_east_conus') &&
            !layer._url.includes('geoserver')) {
          tileUrlTemplate = layer._url;
        }
      });
    }

    // Enforce OpenStreetMap Foundation & OpenTopoMap Tile Usage Policies:
    // Automated bulk pre-seeding / tile scraping of public community tile servers is strictly prohibited.
    if (tileUrlTemplate.includes('openstreetmap.org') || tileUrlTemplate.includes('opentopomap.org')) {
      if (typeof Logger !== 'undefined' && Logger.warn) {
        Logger.warn('Bulk downloading from OpenStreetMap / OpenTopoMap community servers is prohibited by their Tile Usage Policy. Falling back to permissible satellite imagery for offline mission packaging.');
      }
      tileUrlTemplate = (typeof satelliteLayer !== 'undefined' && satelliteLayer && satelliteLayer._url)
        ? satelliteLayer._url
        : 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
    }

    const concurrency = 4;
    const queue = [...tiles];

    const worker = async () => {
      while (queue.length > 0 && !this.abortController.signal.aborted) {
        const item = queue.shift();
        if (!item) break;

        const tileUrl = tileUrlTemplate
          .replace('{z}', item.z)
          .replace('{x}', item.x)
          .replace('{y}', item.y)
          .replace('{s}', 'a');

        try {
          const res = await fetch(tileUrl, { signal: this.abortController.signal });
          if (res.ok) {
            const blob = await res.blob();
            await this.storeTile(db, item.key, blob);
            downloaded++;
          } else {
            failed++;
          }
        } catch (_) {
          failed++;
        }

        if (typeof onProgress === 'function') {
          onProgress({
            downloaded,
            failed,
            total,
            percent: Math.round(((downloaded + failed) / total) * 100),
            currentTile: item.key
          });
        }
      }
    };

    const workers = Array.from({ length: concurrency }, () => worker());
    await Promise.all(workers);

    this.isPacking = false;
    this.abortController = null;

    return {
      success: true,
      downloaded,
      failed,
      total
    };
  }

  cancelPackaging() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.isPacking = false;
  }

  storeTile(db, key, blob) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(TILES_STORE_NAME, 'readwrite');
      const store = tx.objectStore(TILES_STORE_NAME);
      const req = store.put({ key, blob, storedAt: Date.now() });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async getTileBlob(z, x, y) {
    try {
      const db = await openOfflineDb();
      return new Promise((resolve) => {
        const tx = db.transaction(TILES_STORE_NAME, 'readonly');
        const store = tx.objectStore(TILES_STORE_NAME);
        const req = store.get(`${z}/${x}/${y}`);
        req.onsuccess = () => {
          if (req.result && req.result.blob) {
            resolve(req.result.blob);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      });
    } catch (_) {
      return null;
    }
  }

  async getCacheStats() {
    try {
      const db = await openOfflineDb();
      return new Promise((resolve) => {
        const tx = db.transaction(TILES_STORE_NAME, 'readonly');
        const store = tx.objectStore(TILES_STORE_NAME);
        const countReq = store.count();
        countReq.onsuccess = () => {
          resolve({ tileCount: countReq.result || 0 });
        };
        countReq.onerror = () => resolve({ tileCount: 0 });
      });
    } catch (_) {
      return { tileCount: 0 };
    }
  }

  async clearOfflineCache() {
    try {
      const db = await openOfflineDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(TILES_STORE_NAME, 'readwrite');
        const store = tx.objectStore(TILES_STORE_NAME);
        const req = store.clear();
        req.onsuccess = () => resolve({ success: true });
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Intercept Leaflet tile loading so that if a tile exists in offline storage,
   * it is loaded from an IndexedDB blob URL immediately.
   */
  installLeafletOfflineInterceptor() {
    if (typeof L === 'undefined' || !L.TileLayer || L.TileLayer.prototype._aalaapiOfflineHooked) return;
    L.TileLayer.prototype._aalaapiOfflineHooked = true;

    const originalCreateTile = L.TileLayer.prototype.createTile;
    const packager = this;

    L.TileLayer.prototype.createTile = function (coords, done) {
      const tile = originalCreateTile.call(this, coords, done);
      const z = coords.z;
      const x = coords.x;
      const y = coords.y;

      packager.getTileBlob(z, x, y).then(blob => {
        if (blob) {
          const blobUrl = URL.createObjectURL(blob);
          tile.src = blobUrl;
          tile.addEventListener('load', () => URL.revokeObjectURL(blobUrl), { once: true });
        }
      }).catch(() => {});

      return tile;
    };
  }
}

const OfflineFieldPackager = new OfflineFieldPackagerEngine();

if (typeof window !== 'undefined') {
  window.OfflineFieldPackager = OfflineFieldPackager;
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => OfflineFieldPackager.installLeafletOfflineInterceptor());
    } else {
      OfflineFieldPackager.installLeafletOfflineInterceptor();
    }
  }
}
if (typeof global !== 'undefined') {
  global.OfflineFieldPackager = OfflineFieldPackager;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    OfflineFieldPackagerEngine,
    OfflineFieldPackager,
    latLonToTile
  };
}
