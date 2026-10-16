/**
 * tools/companion/buffer.js
 * 
 * In-Memory Rolling FIFO Ring Buffer (RDD-style) for Omnidimensional 4D Flight Telemetry.
 * Maintains rolling transient telemetry (ASTM F3411 Remote ID, ADS-B traffic vectors,
 * and localized NEXRAD radar composite snapshots) capped at 60 minutes and <= 10 MB RAM.
 * Part of Issue #142: Omnidimensional 4D Flight Replay Engine & Rolling Buffer Architecture.
 */

class AmbientTelemetryBuffer {
  /**
   * @param {number} retentionMinutes Default rolling retention duration in minutes (default: 60)
   * @param {number} maxMemoryMB Maximum memory capacity ceiling in megabytes (default: 10)
   */
  constructor(retentionMinutes = 60, maxMemoryMB = 10) {
    this.retentionMinutes = retentionMinutes;
    this.retentionMs = retentionMinutes * 60 * 1000;
    this.maxBytes = maxMemoryMB * 1024 * 1024;

    this.remoteIdFrames = [];
    this.adsbTracks = [];
    this.radarSnapshots = [];
  }

  /**
   * Push an ASTM F3411 Remote ID packet frame into the rolling buffer.
   * @param {Object} frame Remote ID frame payload
   */
  pushRemoteId(frame) {
    if (!frame || typeof frame !== 'object') return;
    const item = { ...frame };
    if (!item.timestamp) {
      item.timestamp = Date.now();
    }
    item._receivedAt = Date.now();
    this.remoteIdFrames.push(item);
    this.enforceBounds();
  }

  /**
   * Push an ADS-B aircraft track point into the rolling buffer.
   * @param {Object} point ADS-B transponder track state
   */
  pushAdsb(point) {
    if (!point || typeof point !== 'object') return;
    const item = { ...point };
    if (!item.timestamp) {
      item.timestamp = Date.now();
    }
    item._receivedAt = Date.now();
    this.adsbTracks.push(item);
    this.enforceBounds();
  }

  /**
   * Push a localized NEXRAD radar composite tile metadata snapshot.
   * @param {Object} tileMetadata NEXRAD tile snapshot metadata
   */
  pushRadarTile(tileMetadata) {
    if (!tileMetadata || typeof tileMetadata !== 'object') return;
    const item = { ...tileMetadata };
    if (!item.timestamp) {
      item.timestamp = Date.now();
    }
    item._receivedAt = Date.now();
    this.radarSnapshots.push(item);
    this.enforceBounds();
  }

  /**
   * Calculate conservative estimate of buffer footprint in bytes.
   * Remote ID ~140 bytes, ADS-B ~190 bytes, Radar ~48 KB.
   * @returns {number} Estimated bytes in RAM
   */
  estimateSizeBytes() {
    return (
      this.remoteIdFrames.length * 140 +
      this.adsbTracks.length * 190 +
      this.radarSnapshots.length * 48000
    );
  }

  /**
   * Enforce temporal rolling cutoff and emergency memory ceiling limits.
   */
  enforceBounds() {
    const cutoff = Date.now() - this.retentionMs;

    // Prune items older than rolling retention window in RAM based on ingestion time
    this.remoteIdFrames = this.remoteIdFrames.filter(f => (f._receivedAt || f.timestamp) >= cutoff);
    this.adsbTracks = this.adsbTracks.filter(t => (t._receivedAt || t.timestamp) >= cutoff);
    this.radarSnapshots = this.radarSnapshots.filter(r => (r._receivedAt || r.timestamp) >= cutoff);

    // Emergency shedding if memory ceiling is exceeded (drop oldest 20%)
    if (this.estimateSizeBytes() > this.maxBytes) {
      const shedRid = Math.max(1, Math.floor(this.remoteIdFrames.length * 0.2));
      const shedAdsb = Math.max(1, Math.floor(this.adsbTracks.length * 0.2));
      this.remoteIdFrames.splice(0, shedRid);
      this.adsbTracks.splice(0, shedAdsb);
      if (this.radarSnapshots.length > 2) {
        this.radarSnapshots.splice(0, 1);
      }
    }
  }

  /**
   * Slice environmental frames strictly corresponding to a flight duration window.
   * @param {number} startUtcMs Flight start UTC epoch in milliseconds
   * @param {number} endUtcMs Flight end UTC epoch in milliseconds
   * @param {number} safetyBufferMs Buffer window to capture surrounding transitions (default: 60s)
   * @returns {Object} Sliced environmental datasets
   */
  sliceFlightWindow(startUtcMs, endUtcMs, safetyBufferMs = 60000) {
    const from = (Number(startUtcMs) || 0) - safetyBufferMs;
    const to = (Number(endUtcMs) || Date.now()) + safetyBufferMs;

    const filterRange = (arr) => arr.filter(item => {
      const ts = Number(item.timestamp) || Number(item._receivedAt) || 0;
      return ts >= from && ts <= to;
    });

    return {
      window: { from, to, durationMs: to - from },
      remoteId: filterRange(this.remoteIdFrames),
      adsb: filterRange(this.adsbTracks),
      radar: filterRange(this.radarSnapshots)
    };
  }

  /**
   * Return high-level telemetry buffer metrics for the HUD Topbar Pill.
   * @returns {Object} Buffer metrics
   */
  getMetrics() {
    const totalBytes = this.estimateSizeBytes();
    const mbUsed = totalBytes / (1024 * 1024);
    const mbMax = this.maxBytes / (1024 * 1024);
    const percentage = Math.min(100, (totalBytes / this.maxBytes) * 100);

    const oldestRid = this.remoteIdFrames[0]?.timestamp || this.remoteIdFrames[0]?._receivedAt;
    const oldestAdsb = this.adsbTracks[0]?.timestamp || this.adsbTracks[0]?._receivedAt;
    const oldestRadar = this.radarSnapshots[0]?.timestamp || this.radarSnapshots[0]?._receivedAt;
    const timestamps = [oldestRid, oldestAdsb, oldestRadar].filter(Boolean);
    const oldestTimestamp = timestamps.length ? Math.min(...timestamps) : Date.now();
    const windowMinutes = Math.max(0, Math.round((Date.now() - oldestTimestamp) / (60 * 1000)));

    return {
      totalBytes,
      mbUsed: parseFloat(mbUsed.toFixed(2)),
      maxBytes: this.maxBytes,
      mbMax: parseFloat(mbMax.toFixed(2)),
      percentage: parseFloat(percentage.toFixed(1)),
      retentionMinutes: this.retentionMinutes,
      activeWindowMinutes: windowMinutes,
      oldestTimestamp,
      counts: {
        remoteId: this.remoteIdFrames.length,
        adsb: this.adsbTracks.length,
        radar: this.radarSnapshots.length,
        total: this.remoteIdFrames.length + this.adsbTracks.length + this.radarSnapshots.length
      },
      status: percentage >= 80 ? 'pressure' : (this.remoteIdFrames.length > 0 || this.adsbTracks.length > 0 ? 'active' : 'clean')
    };
  }

  /**
   * Manually flush transient in-memory frames without touching saved records.
   */
  flush() {
    const prevCounts = {
      remoteId: this.remoteIdFrames.length,
      adsb: this.adsbTracks.length,
      radar: this.radarSnapshots.length
    };
    this.remoteIdFrames = [];
    this.adsbTracks = [];
    this.radarSnapshots = [];
    return {
      flushed: true,
      prevCounts,
      metrics: this.getMetrics()
    };
  }
}

module.exports = AmbientTelemetryBuffer;
