const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {
  injectGpanoXmpMetadata,
  extractGpanoXmpMetadata,
  computeOrthomosaicGeoBounds,
  runJsFallbackStitch,
  runStitchJob
} = require('./stitcher_engine.js');

test('GPano XMP Injection and Extraction Round-Trip', () => {
  // Minimal valid JPEG header (SOI + SOF0 + EOI)
  const dummyJpeg = Buffer.from([
    0xFF, 0xD8,             // SOI
    0xFF, 0xE0, 0x00, 0x10, // APP0
    0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00,
    0xFF, 0xD9              // EOI
  ]);

  const withXmp = injectGpanoXmpMetadata(dummyJpeg, {
    width: 4096,
    height: 2048,
    heading: 145.5
  });

  assert.ok(withXmp.length > dummyJpeg.length, 'Injected buffer should be larger');
  assert.strictEqual(withXmp[0], 0xFF, 'Should preserve JPEG SOI marker byte 0');
  assert.strictEqual(withXmp[1], 0xD8, 'Should preserve JPEG SOI marker byte 1');
  assert.strictEqual(withXmp[2], 0xFF, 'Should inject APP1 marker');
  assert.strictEqual(withXmp[3], 0xE1, 'Should inject APP1 marker');

  const parsed = extractGpanoXmpMetadata(withXmp);
  assert.ok(parsed, 'Parsed GPano metadata should be non-null');
  assert.strictEqual(parsed.isPano, true);
  assert.strictEqual(parsed.projectionType, 'equirectangular');
  assert.strictEqual(parsed.usePanoramaViewer, true);
  assert.strictEqual(parsed.fullPanoWidth, 4096);
  assert.strictEqual(parsed.fullPanoHeight, 2048);
  assert.strictEqual(parsed.heading, 145.5);
});

test('Geographic Bounds Calculation for 2D Orthomosaic Preview', () => {
  const photos = [
    { lat: 41.3210, lon: -88.9950, altAgl: 30.0 },
    { lat: 41.3220, lon: -88.9940, altAgl: 35.0 },
    { lat: 41.3205, lon: -88.9960, altAgl: 25.0 }
  ];

  const bounds = computeOrthomosaicGeoBounds(photos);
  assert.ok(Array.isArray(bounds), 'Bounds should be array');
  assert.strictEqual(bounds.length, 2, 'Bounds should have [[south, west], [north, east]]');

  const [sw, ne] = bounds;
  assert.ok(sw[0] < ne[0], 'South lat must be less than North lat');
  assert.ok(sw[1] < ne[1], 'West lon must be less than East lon');
  assert.ok(sw[0] < 41.3205, 'South lat should have buffer');
  assert.ok(ne[0] > 41.3220, 'North lat should have buffer');
});

test('Field Stitcher Engine SCANS and PANORAMA Execution', async () => {
  const missionUuid = `test_stitch_${Date.now()}`;
  const photos = [
    { id: 'P01', lat: 41.3215, lon: -88.9950, altAgl: 30, yaw: 0, pitch: -90 },
    { id: 'P02', lat: 41.3218, lon: -88.9948, altAgl: 30, yaw: 0, pitch: -90 }
  ];

  // Test 2D Scans Mode
  const scansRes = await runStitchJob({
    missionUuid,
    mode: 'scans',
    photos
  });

  assert.strictEqual(scansRes.success, true);
  assert.strictEqual(scansRes.mode, 'scans');
  assert.ok(scansRes.bounds, 'Scans result must include geographic bounds');
  assert.ok(scansRes.coveragePercent >= 0, 'Coverage percent should be computed');
  assert.ok(fs.existsSync(scansRes.outputPath), 'Output orthomosaic file should exist');

  // Test 360 Panorama Mode
  const panoPhotos = [
    { id: 'PANO_01', yaw: 0, pitch: 0, isPhotoSphere: true },
    { id: 'PANO_02', yaw: 90, pitch: 0, isPhotoSphere: true },
    { id: 'PANO_03', yaw: 180, pitch: 0, isPhotoSphere: true },
    { id: 'PANO_04', yaw: 270, pitch: 0, isPhotoSphere: true }
  ];

  const panoRes = await runStitchJob({
    missionUuid,
    mode: 'panorama',
    photos: panoPhotos
  });

  assert.strictEqual(panoRes.success, true);
  assert.strictEqual(panoRes.mode, 'panorama');
  assert.strictEqual(panoRes.projection, 'equirectangular');
  assert.strictEqual(panoRes.hasGpanoXmp, true);
  assert.ok(fs.existsSync(panoRes.outputPath), 'Output photosphere file should exist');

  const panoBuf = fs.readFileSync(panoRes.outputPath);
  const gpanoMeta = extractGpanoXmpMetadata(panoBuf);
  assert.ok(gpanoMeta, 'Stitched panorama output must contain GPano metadata');
  assert.strictEqual(gpanoMeta.isPano, true);

  // Clean up test files
  const testDir = path.resolve(__dirname, '../../scratch/mission_archives', missionUuid);
  try {
    fs.rmSync(testDir, { recursive: true, force: true });
  } catch (_) {}
});
