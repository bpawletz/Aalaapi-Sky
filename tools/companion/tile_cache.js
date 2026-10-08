/**
 * tools/companion/tile_cache.js
 *
 * High-performance map tile and spatial asset caching proxy engine for Aalaapi Sky Bridge.
 * Intercepts upstream map tiles (FAA VFR Sectionals, Esri Imagery, OpenStreetMap,
 * OpenTopoMap, ArcGIS REST feature servers) and caches them locally on disk.
 *
 * Implements:
 * - Dynamic TTL lifespan rules (30-day retention for spatial layers, live stream bypass)
 * - Strict 2.0 GB disk ceiling with automated Least Recently Used (LRU) pruning (85% target)
 * - HTTP 304 Not Modified conditional validation (ETag & Last-Modified)
 * - Live environmental stream detection (NOAA NEXRAD / NWS hazards explicitly bypassed)
 * - Resilient index recovery and disk self-healing
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Default constants
const DEFAULT_MAX_SIZE_BYTES = 2 * 1024 * 1024 * 1024; // 2.0 GB
const DEFAULT_STATIC_TTL_MS = 30 * 24 * 60 * 60 * 1000;  // 30 Days (VFR, Satellite, OSM)
const DEFAULT_GENERAL_TTL_MS = 7 * 24 * 60 * 60 * 1000;  // 7 Days
const LRU_HEADROOM_RATIO = 0.85; // Prune down to 85% of ceiling when cap breached

class TileCacheManager {
  /**
   * @param {Object} [options]
   * @param {string} [options.cacheDir] Directory for storing cached tile files
   * @param {number} [options.maxSizeBytes] Maximum disk usage ceiling in bytes (default 2GB)
   * @param {number} [options.staticTtlMs] TTL for spatial/map tiles (default 30 days)
   * @param {number} [options.generalTtlMs] TTL for general assets (default 7 days)
   */
  constructor(options = {}) {
    const defaultDir = path.resolve(__dirname, '../../data/tile_cache');
    this.cacheDir = options.cacheDir || process.env.AALAAPI_TILE_CACHE_DIR || defaultDir;
    
    const parsedCap = options.maxSizeBytes || (process.env.AALAAPI_CACHE_MAX_BYTES ? parseInt(process.env.AALAAPI_CACHE_MAX_BYTES, 10) : DEFAULT_MAX_SIZE_BYTES);
    this.maxSizeBytes = (!isNaN(parsedCap) && parsedCap > 0) ? parsedCap : DEFAULT_MAX_SIZE_BYTES;

    this.staticTtlMs = options.staticTtlMs || DEFAULT_STATIC_TTL_MS;
    this.generalTtlMs = options.generalTtlMs || DEFAULT_GENERAL_TTL_MS;

    this.manifestPath = path.join(this.cacheDir, 'cache_manifest.json');
    this.entries = new Map(); // url -> metadata object
    this.totalSizeBytes = 0;

    // Telemetry & metrics counters
    this.hitCount = 0;
    this.missCount = 0;
    this.bypassCount = 0;
    this.lruPruneCount = 0;

    this._saveTimer = null;
    this.init();
  }

  /**
   * Ensure cache directory exists and load or recover manifest index.
   */
  init() {
    try {
      if (!fs.existsSync(this.cacheDir)) {
        fs.mkdirSync(this.cacheDir, { recursive: true });
      }

      if (fs.existsSync(this.manifestPath)) {
        try {
          const raw = fs.readFileSync(this.manifestPath, 'utf8');
          const data = JSON.parse(raw);
          if (Array.isArray(data.entries)) {
            data.entries.forEach(entry => {
              const filePath = path.join(this.cacheDir, entry.filename);
              if (fs.existsSync(filePath)) {
                this.entries.set(entry.url, entry);
                this.totalSizeBytes += entry.sizeBytes || 0;
              }
            });
          }
          if (data.stats) {
            this.hitCount = data.stats.hitCount || 0;
            this.missCount = data.stats.missCount || 0;
            this.bypassCount = data.stats.bypassCount || 0;
            this.lruPruneCount = data.stats.lruPruneCount || 0;
          }
        } catch (parseErr) {
          this.rebuildFromDisk();
        }
      } else {
        this.rebuildFromDisk();
      }
    } catch (e) {
      // In-memory fallback if filesystem restricted
    }
  }

  /**
   * Rebuild manifest index by inspecting files physically present on disk.
   */
  rebuildFromDisk() {
    this.entries.clear();
    this.totalSizeBytes = 0;
    if (!fs.existsSync(this.cacheDir)) return;

    try {
      const files = fs.readdirSync(this.cacheDir);
      for (const file of files) {
        if (file === 'cache_manifest.json') continue;
        const fullPath = path.join(this.cacheDir, file);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.isFile()) {
            this.totalSizeBytes += stat.size;
          }
        } catch (_) {}
      }
    } catch (_) {}
  }

  /**
   * Normalize and hash upstream URL for safe deterministic disk naming.
   * @param {string} url
   * @returns {string} SHA-256 hash hex string
   */
  hashUrl(url) {
    if (!url || typeof url !== 'string') return '';
    const normalized = url.trim();
    return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 32);
  }

  /**
   * Determine suitable file extension based on URL path or content-type.
   */
  getExtension(url, contentType = '') {
    const ct = (contentType || '').toLowerCase();
    if (ct.includes('image/png')) return '.png';
    if (ct.includes('image/jpeg') || ct.includes('image/jpg')) return '.jpg';
    if (ct.includes('image/webp')) return '.webp';
    if (ct.includes('image/svg')) return '.svg';
    if (ct.includes('application/json') || ct.includes('geo+json')) return '.json';
    if (ct.includes('application/x-protobuf')) return '.pbf';

    try {
      const parsed = new URL(url);
      const ext = path.extname(parsed.pathname).toLowerCase();
      if (['.png', '.jpg', '.jpeg', '.webp', '.svg', '.json', '.geojson', '.pbf'].includes(ext)) {
        return ext;
      }
    } catch (_) {}

    return '.bin';
  }

  /**
   * Detect whether a requested URL represents a live environmental stream
   * that MUST explicitly bypass the disk cache pool.
   * @param {string} url
   * @returns {boolean}
   */
  isLiveBypassUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const lower = url.toLowerCase();

    // Query parameter explicit bypass
    if (lower.includes('bypasscache=true') || lower.includes('bypasscache=1') || lower.includes('live=true')) {
      return true;
    }

    // Historical replay snapshot override: allow caching environmental/radar tiles during flight replays
    if (lower.includes('historical=1') || lower.includes('historical=true') || lower.includes('snapshot=true')) {
      return false;
    }

    // NOAA / NWS NEXRAD Radar composites & Active Hazards (WMS layers)
    if (lower.includes('opengeo.ncep.noaa.gov') ||
        lower.includes('conus_bref_qcd') ||
        lower.includes('wwa:hazards') ||
        lower.includes('radar.weather.gov') ||
        lower.includes('mesonet.agron.iastate.edu/cgi-bin/wms/nexrad') ||
        lower.includes('rainviewer.com')) {
      return true;
    }

    return false;
  }

  /**
   * Determine the explicit Time-To-Live (TTL) in milliseconds based on asset category.
   * @param {string} url
   * @returns {number} TTL in milliseconds (0 indicates immediate bypass)
   */
  getTtlForUrl(url) {
    if (this.isLiveBypassUrl(url)) {
      return 0; // Live stream: zero caching
    }

    const lower = (url || '').toLowerCase();

    // Long-term spatial arrays: 30 days
    // - FAA VFR Sectionals
    // - Esri Satellite & Street tiles
    // - OpenStreetMap & OpenTopoMap
    // - ArcGIS Electric Power Lines, Obstacles, Class Airspace
    if (lower.includes('vfr_sectional') ||
        lower.includes('arcgisonline.com') ||
        lower.includes('tile.openstreetmap.org') ||
        lower.includes('opentopomap.org') ||
        lower.includes('services6.arcgis.com') ||
        lower.includes('services1.arcgis.com') ||
        lower.includes('class_airspace') ||
        lower.includes('special_use_airspace') ||
        lower.includes('electric_power_transmission_lines') ||
        lower.includes('digital_obstacle_file') ||
        lower.includes('faa_uas_facilitymap_data')) {
      return this.staticTtlMs;
    }

    // Default general assets: 7 days
    return this.generalTtlMs;
  }

  /**
   * Retrieve cached tile or return cache miss/conditional 304 response.
   * @param {string} url
   * @param {Object} [clientHeaders] Incoming HTTP request headers from client
   * @returns {Object} { hit: boolean, status?: number, buffer?: Buffer, contentType?: string, etag?: string, lastModified?: string, age?: number }
   */
  get(url, clientHeaders = {}) {
    if (this.isLiveBypassUrl(url)) {
      this.bypassCount++;
      return { hit: false, bypass: true };
    }

    const entry = this.entries.get(url);
    if (!entry) {
      this.missCount++;
      return { hit: false };
    }

    const now = Date.now();

    // Check expiration against explicit dynamic TTL
    if (entry.ttlMs && (now - entry.cachedAt > entry.ttlMs)) {
      this.removeEntry(url);
      this.missCount++;
      return { hit: false, expired: true };
    }

    const filePath = path.join(this.cacheDir, entry.filename);
    if (!fs.existsSync(filePath)) {
      this.entries.delete(url);
      this.totalSizeBytes = Math.max(0, this.totalSizeBytes - (entry.sizeBytes || 0));
      this.missCount++;
      return { hit: false };
    }

    // Update LRU access timestamp
    entry.lastAccessed = now;
    this.scheduleSaveManifest();

    // Handle HTTP 304 Conditional Validation (If-None-Match / If-Modified-Since)
    const reqEtag = clientHeaders['if-none-match'];
    if (reqEtag && entry.etag && (reqEtag === entry.etag || reqEtag === `W/${entry.etag}`)) {
      this.hitCount++;
      return {
        hit: true,
        status: 304,
        contentType: entry.contentType,
        etag: entry.etag,
        lastModified: entry.lastModified
      };
    }

    const reqModified = clientHeaders['if-modified-since'];
    if (reqModified && entry.lastModified) {
      const clientTime = Date.parse(reqModified);
      const cachedTime = Date.parse(entry.lastModified);
      if (!isNaN(clientTime) && !isNaN(cachedTime) && cachedTime <= clientTime) {
        this.hitCount++;
        return {
          hit: true,
          status: 304,
          contentType: entry.contentType,
          etag: entry.etag,
          lastModified: entry.lastModified
        };
      }
    }

    try {
      const buffer = fs.readFileSync(filePath);
      this.hitCount++;
      const ageSec = Math.max(0, Math.floor((now - entry.cachedAt) / 1000));

      return {
        hit: true,
        status: 200,
        buffer,
        contentType: entry.contentType || 'image/png',
        etag: entry.etag,
        lastModified: entry.lastModified,
        age: ageSec,
        sizeBytes: entry.sizeBytes
      };
    } catch (readErr) {
      this.missCount++;
      return { hit: false };
    }
  }

  /**
   * Commit fetched tile binary into the cache pool and execute LRU pruning if required.
   * @param {string} url
   * @param {Buffer} buffer
   * @param {string} [contentType]
   * @param {Object} [upstreamHeaders] Headers received from upstream provider
   * @returns {Object|null} Cached entry or null if bypassed
   */
  set(url, buffer, contentType = 'image/png', upstreamHeaders = {}) {
    if (this.isLiveBypassUrl(url)) {
      this.bypassCount++;
      return null;
    }

    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      return null;
    }

    const now = Date.now();
    const hash = this.hashUrl(url);
    const ext = this.getExtension(url, contentType);
    const filename = `${hash}${ext}`;
    const filePath = path.join(this.cacheDir, filename);

    // ETag & Last-Modified derivation
    const etag = upstreamHeaders.etag || `"${crypto.createHash('md5').update(buffer).digest('hex')}"`;
    const lastModified = upstreamHeaders['last-modified'] || new Date(now).toUTCString();
    const ttlMs = this.getTtlForUrl(url);

    // Check if replacing existing entry
    const existing = this.entries.get(url);
    const oldSize = existing ? (existing.sizeBytes || 0) : 0;

    try {
      fs.writeFileSync(filePath, buffer);
    } catch (err) {
      return null;
    }

    const entry = {
      url,
      hash,
      filename,
      sizeBytes: buffer.length,
      contentType: contentType || 'image/png',
      etag,
      lastModified,
      cachedAt: now,
      lastAccessed: now,
      ttlMs
    };

    this.entries.set(url, entry);
    this.totalSizeBytes = (this.totalSizeBytes - oldSize) + buffer.length;

    // Enforce strict disk ceiling via Least Recently Used (LRU) pruning
    if (this.totalSizeBytes > this.maxSizeBytes) {
      this.pruneLru();
    }

    this.scheduleSaveManifest();
    return entry;
  }

  /**
   * Evict least recently accessed items until disk usage drops to 85% of ceiling.
   * @returns {number} Number of evicted tiles
   */
  pruneLru() {
    if (this.totalSizeBytes <= this.maxSizeBytes) {
      return 0;
    }

    const targetBytes = Math.floor(this.maxSizeBytes * LRU_HEADROOM_RATIO);
    const items = Array.from(this.entries.values());

    // Sort ascending by lastAccessed (oldest access timestamp first)
    items.sort((a, b) => (a.lastAccessed || 0) - (b.lastAccessed || 0));

    let evictedCount = 0;
    for (const item of items) {
      if (this.totalSizeBytes <= targetBytes) {
        break;
      }

      const filePath = path.join(this.cacheDir, item.filename);
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (_) {}

      this.entries.delete(item.url);
      this.totalSizeBytes = Math.max(0, this.totalSizeBytes - (item.sizeBytes || 0));
      evictedCount++;
    }

    this.lruPruneCount += evictedCount;
    this.scheduleSaveManifest();
    return evictedCount;
  }

  /**
   * Remove a specific entry from disk and in-memory index.
   */
  removeEntry(url) {
    const entry = this.entries.get(url);
    if (!entry) return false;

    const filePath = path.join(this.cacheDir, entry.filename);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (_) {}

    this.entries.delete(url);
    this.totalSizeBytes = Math.max(0, this.totalSizeBytes - (entry.sizeBytes || 0));
    this.scheduleSaveManifest();
    return true;
  }

  /**
   * Purge the entire cache pool and reset counters.
   */
  clear() {
    try {
      if (fs.existsSync(this.cacheDir)) {
        const files = fs.readdirSync(this.cacheDir);
        for (const file of files) {
          try {
            fs.unlinkSync(path.join(this.cacheDir, file));
          } catch (_) {}
        }
      }
    } catch (_) {}

    this.entries.clear();
    this.totalSizeBytes = 0;
    this.hitCount = 0;
    this.missCount = 0;
    this.bypassCount = 0;
    this.lruPruneCount = 0;
    this.saveManifestImmediate();
    return { success: true, cleared: true };
  }

  /**
   * Retrieve live diagnostic metrics and capacity usage.
   */
  getStats() {
    const totalRequests = this.hitCount + this.missCount;
    const hitRate = totalRequests > 0 ? ((this.hitCount / totalRequests) * 100).toFixed(1) : '0.0';

    return {
      success: true,
      enabled: true,
      totalFiles: this.entries.size,
      totalSizeBytes: this.totalSizeBytes,
      totalSizeMb: (this.totalSizeBytes / (1024 * 1024)).toFixed(2),
      maxSizeBytes: this.maxSizeBytes,
      maxSizeMb: (this.maxSizeBytes / (1024 * 1024)).toFixed(0),
      usagePercent: ((this.totalSizeBytes / this.maxSizeBytes) * 100).toFixed(2),
      hitCount: this.hitCount,
      missCount: this.missCount,
      bypassCount: this.bypassCount,
      hitRatePercent: parseFloat(hitRate),
      lruPruneCount: this.lruPruneCount,
      cacheDir: this.cacheDir
    };
  }

  /**
   * Inspect a specific URL in the cache.
   */
  inspect(url) {
    const entry = this.entries.get(url);
    if (!entry) {
      return { cached: false, url };
    }
    const ageSec = Math.floor((Date.now() - entry.cachedAt) / 1000);
    const ttlRemainingSec = Math.max(0, Math.floor(((entry.cachedAt + entry.ttlMs) - Date.now()) / 1000));
    return {
      cached: true,
      url: entry.url,
      filename: entry.filename,
      sizeBytes: entry.sizeBytes,
      contentType: entry.contentType,
      etag: entry.etag,
      ageSec,
      ttlRemainingSec
    };
  }

  /**
   * Debounced manifest persistence to minimize disk I/O.
   */
  scheduleSaveManifest() {
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this.saveManifestImmediate();
    }, 2000);
  }

  /**
   * Synchronously write manifest JSON to disk.
   */
  saveManifestImmediate() {
    try {
      const payload = {
        updatedAt: new Date().toISOString(),
        stats: {
          hitCount: this.hitCount,
          missCount: this.missCount,
          bypassCount: this.bypassCount,
          lruPruneCount: this.lruPruneCount
        },
        entries: Array.from(this.entries.values())
      };
      fs.writeFileSync(this.manifestPath, JSON.stringify(payload), 'utf8');
    } catch (_) {}
  }
}

module.exports = {
  TileCacheManager,
  DEFAULT_MAX_SIZE_BYTES,
  DEFAULT_STATIC_TTL_MS,
  DEFAULT_GENERAL_TTL_MS,
  LRU_HEADROOM_RATIO
};
