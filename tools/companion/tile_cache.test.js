/**
 * tools/companion/tile_cache.test.js
 *
 * Unit tests for TileCacheManager (Issue #91):
 * - Dynamic TTL lifespan rules (30-day spatial retention, live weather bypass)
 * - Least Recently Used (LRU) pruning when storage ceiling breached
 * - HTTP 304 conditional validation (ETag & Last-Modified)
 * - Live environmental stream detection (NEXRAD, NWS hazards)
 * - Cache metrics, clear, and persistence
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { TileCacheManager } = require('./tile_cache.js');

const TEST_CACHE_DIR = path.resolve(__dirname, '../../scratch/test_tile_cache');

function cleanTestDir() {
  if (fs.existsSync(TEST_CACHE_DIR)) {
    fs.rmSync(TEST_CACHE_DIR, { recursive: true, force: true });
  }
}

describe('TileCacheManager Tests (Issue #91)', () => {
  beforeEach(() => {
    cleanTestDir();
  });

  afterEach(() => {
    cleanTestDir();
  });

  test('initializes directory and handles empty cache properly', () => {
    const cache = new TileCacheManager({
      cacheDir: TEST_CACHE_DIR,
      maxSizeBytes: 1024 * 1024 // 1 MB
    });

    assert.ok(fs.existsSync(TEST_CACHE_DIR), 'Cache directory should be created');
    const stats = cache.getStats();
    assert.strictEqual(stats.totalFiles, 0);
    assert.strictEqual(stats.totalSizeBytes, 0);
    assert.strictEqual(stats.hitCount, 0);
    assert.strictEqual(stats.missCount, 0);
  });

  test('hashes URLs deterministically', () => {
    const cache = new TileCacheManager({ cacheDir: TEST_CACHE_DIR });
    const url = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/10/200/300';
    const hash1 = cache.hashUrl(url);
    const hash2 = cache.hashUrl(url);

    assert.strictEqual(hash1, hash2, 'Hash must be deterministic');
    assert.strictEqual(typeof hash1, 'string');
    assert.ok(hash1.length >= 16);
  });

  test('identifies live environmental streams that must bypass cache', () => {
    const cache = new TileCacheManager({ cacheDir: TEST_CACHE_DIR });

    // Live streams that MUST bypass cache
    assert.strictEqual(cache.isLiveBypassUrl('https://opengeo.ncep.noaa.gov/geoserver/ows?layers=conus:conus_bref_qcd'), true);
    assert.strictEqual(cache.isLiveBypassUrl('https://opengeo.ncep.noaa.gov/geoserver/ows?layers=wwa:hazards'), true);
    assert.strictEqual(cache.isLiveBypassUrl('https://tilecache.rainviewer.com/v2/radar/12345/256/10/200/300/1/1_1.png'), true);
    assert.strictEqual(cache.isLiveBypassUrl('https://example.com/tile?bypassCache=true'), true);

    // Static / persistent layers that MUST NOT bypass cache
    assert.strictEqual(cache.isLiveBypassUrl('https://tiles.arcgis.com/tiles/ssFJjBXIUyZDrSYZ/arcgis/rest/services/VFR_Sectional/MapServer/WMTS/tile/1.0.0/VFR_Sectional/default/default028mm/10/200/300'), false);
    assert.strictEqual(cache.isLiveBypassUrl('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/10/200/300'), false);
    assert.strictEqual(cache.isLiveBypassUrl('https://tile.openstreetmap.org/10/200/300.png'), false);
    assert.strictEqual(cache.isLiveBypassUrl('https://a.tile.opentopomap.org/10/200/300.png'), false);
  });

  test('assigns 30-day dynamic TTL to spatial layers and 0 to live streams', () => {
    const cache = new TileCacheManager({ cacheDir: TEST_CACHE_DIR });
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

    // Spatial layers -> 30 days
    const vfrUrl = 'https://tiles.arcgis.com/tiles/ssFJjBXIUyZDrSYZ/arcgis/rest/services/VFR_Sectional/MapServer/WMTS/tile/10/200/300';
    assert.strictEqual(cache.getTtlForUrl(vfrUrl), thirtyDaysMs);

    const esriUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/10/200/300';
    assert.strictEqual(cache.getTtlForUrl(esriUrl), thirtyDaysMs);

    const osmUrl = 'https://tile.openstreetmap.org/10/200/300.png';
    assert.strictEqual(cache.getTtlForUrl(osmUrl), thirtyDaysMs);

    // Live stream -> 0
    const nexradUrl = 'https://opengeo.ncep.noaa.gov/geoserver/ows?layers=conus:conus_bref_qcd';
    assert.strictEqual(cache.getTtlForUrl(nexradUrl), 0);
  });

  test('stores and retrieves map tiles with cache hit / miss cycles', () => {
    const cache = new TileCacheManager({ cacheDir: TEST_CACHE_DIR });
    const url = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/12/1200/1500';

    // Initial check -> Miss
    const missResult = cache.get(url);
    assert.strictEqual(missResult.hit, false);

    // Set tile
    const dummyPng = Buffer.from('89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C489', 'hex');
    const setEntry = cache.set(url, dummyPng, 'image/png', {
      etag: '"v1-etag-12345"',
      'last-modified': 'Wed, 21 Oct 2026 07:28:00 GMT'
    });
    assert.ok(setEntry, 'Entry should be saved');
    assert.strictEqual(setEntry.sizeBytes, dummyPng.length);

    // Second check -> Hit
    const hitResult = cache.get(url);
    assert.strictEqual(hitResult.hit, true);
    assert.strictEqual(hitResult.status, 200);
    assert.strictEqual(hitResult.contentType, 'image/png');
    assert.strictEqual(hitResult.etag, '"v1-etag-12345"');
    assert.strictEqual(hitResult.buffer.equals(dummyPng), true);

    const stats = cache.getStats();
    assert.strictEqual(stats.hitCount, 1);
    assert.strictEqual(stats.missCount, 1);
    assert.strictEqual(stats.totalFiles, 1);
  });

  test('bypasses cache when requesting live stream URLs', () => {
    const cache = new TileCacheManager({ cacheDir: TEST_CACHE_DIR });
    const liveUrl = 'https://opengeo.ncep.noaa.gov/geoserver/ows?layers=conus:conus_bref_qcd&bbox=...';

    const getRes = cache.get(liveUrl);
    assert.strictEqual(getRes.hit, false);
    assert.strictEqual(getRes.bypass, true);

    const dummyData = Buffer.from('NEXRAD_LIVE_STREAM');
    const setRes = cache.set(liveUrl, dummyData, 'image/png');
    assert.strictEqual(setRes, null, 'Live stream should not be committed to cache');

    const stats = cache.getStats();
    assert.strictEqual(stats.bypassCount, 2);
    assert.strictEqual(stats.totalFiles, 0);
  });

  test('validates HTTP 304 conditional requests with If-None-Match ETag', () => {
    const cache = new TileCacheManager({ cacheDir: TEST_CACHE_DIR });
    const url = 'https://tile.openstreetmap.org/5/10/12.png';
    const tileBuffer = Buffer.from('FAKE_PNG_DATA_FOR_OSM');

    cache.set(url, tileBuffer, 'image/png', { etag: '"osm-tile-abc-123"' });

    // Client requests with matching ETag
    const condResult = cache.get(url, { 'if-none-match': '"osm-tile-abc-123"' });
    assert.strictEqual(condResult.hit, true);
    assert.strictEqual(condResult.status, 304, 'Must respond with 304 Not Modified');
    assert.strictEqual(condResult.etag, '"osm-tile-abc-123"');
    assert.strictEqual(condResult.buffer, undefined, '304 responses must not contain payload body');
  });

  test('evicts least recently used (LRU) tiles when disk ceiling is breached', () => {
    // Set a tiny ceiling of 1000 bytes for testing LRU eviction
    const maxBytes = 1000;
    const cache = new TileCacheManager({
      cacheDir: TEST_CACHE_DIR,
      maxSizeBytes: maxBytes
    });

    const chunk300 = Buffer.alloc(300, 'A');

    // Add Tile 1 (300 B) at t=100
    cache.set('https://tile.example.com/1', chunk300, 'image/png');
    cache.entries.get('https://tile.example.com/1').lastAccessed = 100;

    // Add Tile 2 (300 B) at t=200
    cache.set('https://tile.example.com/2', chunk300, 'image/png');
    cache.entries.get('https://tile.example.com/2').lastAccessed = 200;

    // Add Tile 3 (300 B) at t=300
    cache.set('https://tile.example.com/3', chunk300, 'image/png');
    cache.entries.get('https://tile.example.com/3').lastAccessed = 300;

    // Current total: 900 B (<= 1000 B, no eviction yet)
    assert.strictEqual(cache.totalSizeBytes, 900);
    assert.strictEqual(cache.entries.size, 3);

    // Add Tile 4 (300 B): total would be 1200 B, breaching 1000 B ceiling!
    // LRU should prune down to 85% of 1000 = 850 B.
    // Tile 1 (accessed at 100) must be evicted first! Tile 2 (200) also if needed.
    cache.set('https://tile.example.com/4', chunk300, 'image/png');

    assert.ok(cache.totalSizeBytes <= 850, `Expected total bytes <= 850, got ${cache.totalSizeBytes}`);
    assert.strictEqual(cache.entries.has('https://tile.example.com/1'), false, 'Tile 1 should have been evicted by LRU');
    assert.strictEqual(cache.entries.has('https://tile.example.com/4'), true, 'Newly added Tile 4 must remain');
    assert.ok(cache.lruPruneCount >= 1, 'LRU prune counter should increment');
  });

  test('handles explicit TTL expiration', () => {
    const cache = new TileCacheManager({
      cacheDir: TEST_CACHE_DIR,
      generalTtlMs: 50 // 50ms TTL for testing
    });

    const url = 'https://general.asset.example.com/asset.json';
    const buf = Buffer.from('{"test": true}');
    cache.set(url, buf, 'application/json');

    // Immediate check -> hit
    const hit = cache.get(url);
    assert.strictEqual(hit.hit, true);

    // Fast-forward entry cachedAt to simulate expiration
    const entry = cache.entries.get(url);
    entry.cachedAt = Date.now() - 1000; // 1s in the past (exceeds 50ms TTL)

    const expHit = cache.get(url);
    assert.strictEqual(expHit.hit, false);
    assert.strictEqual(expHit.expired, true);
    assert.strictEqual(cache.entries.has(url), false, 'Expired entry should be purged');
  });

  test('clears entire cache pool and resets metrics', () => {
    const cache = new TileCacheManager({ cacheDir: TEST_CACHE_DIR });
    const buf = Buffer.from('TEST_DATA');
    cache.set('https://tile.example.com/a', buf);
    cache.set('https://tile.example.com/b', buf);

    assert.strictEqual(cache.entries.size, 2);
    assert.strictEqual(cache.totalSizeBytes, buf.length * 2);

    const clearRes = cache.clear();
    assert.strictEqual(clearRes.cleared, true);
    assert.strictEqual(cache.entries.size, 0);
    assert.strictEqual(cache.totalSizeBytes, 0);

    const stats = cache.getStats();
    assert.strictEqual(stats.totalFiles, 0);
    assert.strictEqual(stats.totalSizeBytes, 0);
  });
});
