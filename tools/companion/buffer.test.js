/**
 * tools/companion/buffer.test.js
 * 
 * Unit test suite for AmbientTelemetryBuffer rolling FIFO ring buffer.
 * Verifies insertion, temporal pruning, emergency memory shedding, window slicing,
 * metrics calculation, and flushing behavior.
 * Issue #142: Omnidimensional 4D Flight Replay Engine & Rolling Buffer Architecture.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const AmbientTelemetryBuffer = require('./buffer.js');

describe('AmbientTelemetryBuffer Tests (Issue #142)', () => {
  it('initializes with default 60-minute window and 10 MB capacity ceiling', () => {
    const buf = new AmbientTelemetryBuffer();
    assert.strictEqual(buf.retentionMinutes, 60);
    assert.strictEqual(buf.maxBytes, 10 * 1024 * 1024);
    assert.strictEqual(buf.remoteIdFrames.length, 0);
    assert.strictEqual(buf.adsbTracks.length, 0);
    assert.strictEqual(buf.radarSnapshots.length, 0);

    const m = buf.getMetrics();
    assert.strictEqual(m.counts.total, 0);
    assert.strictEqual(m.mbUsed, 0);
    assert.strictEqual(m.percentage, 0);
    assert.strictEqual(m.status, 'clean');
  });

  it('correctly ingests Remote ID, ADS-B, and Radar tile frames', () => {
    const buf = new AmbientTelemetryBuffer();
    const now = Date.now();

    buf.pushRemoteId({ uasId: 'DRONE-TEST-001', lat: 41.3215, lon: -88.9950, alt: 120, timestamp: now });
    buf.pushAdsb({ icao: 'A1234F', callsign: 'SKYW99', lat: 41.3500, lon: -88.9200, alt: 3500, timestamp: now });
    buf.pushRadarTile({ tileId: 'nexrad-01', bbox: [-89.0, 41.0, -88.0, 42.0], dataUrl: 'data:image/png;base64,mock', timestamp: now });

    const m = buf.getMetrics();
    assert.strictEqual(m.counts.remoteId, 1);
    assert.strictEqual(m.counts.adsb, 1);
    assert.strictEqual(m.counts.radar, 1);
    assert.strictEqual(m.counts.total, 3);
    assert.ok(m.totalBytes > 48000, 'Total bytes includes radar tile estimation');
    assert.strictEqual(m.status, 'active');
  });

  it('prunes records older than retention cutoff', () => {
    const buf = new AmbientTelemetryBuffer(10, 10); // 10 minutes retention
    const now = Date.now();
    const staleTime = now - (15 * 60 * 1000); // 15 minutes ago
    const freshTime = now - (2 * 60 * 1000);  // 2 minutes ago

    buf.pushRemoteId({ uasId: 'STALE-DRONE', timestamp: staleTime, _receivedAt: staleTime });
    // Manually force _receivedAt on stale frame to simulate it arriving 15m ago
    buf.remoteIdFrames[0]._receivedAt = staleTime;
    buf.pushRemoteId({ uasId: 'FRESH-DRONE', timestamp: freshTime });

    assert.strictEqual(buf.remoteIdFrames.length, 1);
    assert.strictEqual(buf.remoteIdFrames[0].uasId, 'FRESH-DRONE');
  });

  it('triggers emergency memory shedding when capacity ceiling is breached', () => {
    // 0.05 MB ceiling = ~52,428 bytes (about 1 radar tile capacity)
    const buf = new AmbientTelemetryBuffer(60, 0.05);
    const now = Date.now();

    for (let i = 0; i < 200; i++) {
      buf.pushRemoteId({ uasId: `DRONE-${i}`, timestamp: now });
    }
    // Remote ID alone: 200 * 140 = 28,000 bytes (< 52 KB)
    assert.strictEqual(buf.remoteIdFrames.length, 200);

    // Pushing radar tiles (~48 KB each) will breach the ceiling and trigger shedding
    buf.pushRadarTile({ tileId: 'tile-1', timestamp: now });
    buf.pushRadarTile({ tileId: 'tile-2', timestamp: now });

    const m = buf.getMetrics();
    assert.ok(buf.remoteIdFrames.length < 200, 'Oldest frames were shed');
    assert.ok(m.percentage > 0, 'Percentage is non-zero');
  });

  it('slices flight duration window accurately with configurable safety buffer', () => {
    const buf = new AmbientTelemetryBuffer();
    const t0 = Date.now() - 35 * 60 * 1000; // 35 min ago
    const takeoff = t0 + 600000;  // t0 + 10m
    const landing = t0 + 1800000; // t0 + 30m

    // Ingest data before flight, during flight, and after flight
    buf.pushRemoteId({ uasId: 'EARLY', timestamp: t0 });
    buf.pushRemoteId({ uasId: 'JUST-BEFORE', timestamp: takeoff - 30000 }); // within 60s safety buffer
    buf.pushRemoteId({ uasId: 'MID-FLIGHT', timestamp: takeoff + 300000 });
    buf.pushRemoteId({ uasId: 'JUST-AFTER', timestamp: landing + 45000 });  // within 60s safety buffer
    buf.pushRemoteId({ uasId: 'LATE', timestamp: landing + 120000 });      // outside safety buffer

    buf.pushAdsb({ callsign: 'MID-TRAFFIC', timestamp: takeoff + 400000 });
    buf.pushRadarTile({ tileId: 'MID-RADAR', timestamp: takeoff + 500000 });

    const sliced = buf.sliceFlightWindow(takeoff, landing, 60000);
    assert.strictEqual(sliced.remoteId.length, 3);
    assert.deepStrictEqual(sliced.remoteId.map(r => r.uasId), ['JUST-BEFORE', 'MID-FLIGHT', 'JUST-AFTER']);
    assert.strictEqual(sliced.adsb.length, 1);
    assert.strictEqual(sliced.radar.length, 1);
    assert.strictEqual(sliced.window.from, takeoff - 60000);
    assert.strictEqual(sliced.window.to, landing + 60000);
  });

  it('flushes transient buffers and resets metrics on demand', () => {
    const buf = new AmbientTelemetryBuffer();
    buf.pushRemoteId({ uasId: 'DRONE-01', timestamp: Date.now() });
    buf.pushAdsb({ callsign: 'AC-01', timestamp: Date.now() });

    assert.strictEqual(buf.getMetrics().counts.total, 2);

    const flushResult = buf.flush();
    assert.strictEqual(flushResult.flushed, true);
    assert.strictEqual(flushResult.prevCounts.remoteId, 1);
    assert.strictEqual(flushResult.prevCounts.adsb, 1);
    assert.strictEqual(buf.getMetrics().counts.total, 0);
  });
});
