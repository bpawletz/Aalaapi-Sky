/**
 * tools/node-red-contrib-aalaapi/test/nerfstudio-splat.test.js
 * Unit test suite verifying camera math and transforms.json generation.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  gpsToLocalMeters,
  eulerToNerfTransformMatrix,
  fovToFocalLength,
  generateNerfstudioManifest
} = require('../lib/nerfstudio-splat.js');
const { generateColmapPriors, eulerToColmapQuaternion } = require('../lib/colmap-prior.js');

describe('Nerfstudio & COLMAP Camera Math Suite (node-red-contrib-aalaapi)', () => {
  it('gpsToLocalMeters converts lat/lon differences to accurate local metric offsets', () => {
    // 0,0 anchor
    const origin = { lat: 41.3215, lon: -88.9950, alt: 100 };
    const p1 = gpsToLocalMeters(41.3215, -88.9950, 120, origin.lat, origin.lon, origin.alt);
    assert.strictEqual(Math.round(p1.east), 0);
    assert.strictEqual(Math.round(p1.north), 0);
    assert.strictEqual(p1.up, 20);

    // Shift 1 degree North (~111.13 km)
    const pNorth = gpsToLocalMeters(42.3215, -88.9950, 100, origin.lat, origin.lon, origin.alt);
    assert.ok(Math.abs(pNorth.north - 111319) < 2000, `Expected ~111km North, got ${pNorth.north}`);
  });

  it('fovToFocalLength calculates pinhole focal length matching image dimensions', () => {
    // 73.7 HFOV on 4000px image width
    const fl = fovToFocalLength(73.7, 4000);
    assert.ok(fl > 2600 && fl < 2750, `Expected fl ~2670px, got ${fl}`);
  });

  it('eulerToNerfTransformMatrix outputs valid 4x4 homogenous matrix matching NeRF convention', () => {
    const pos = { east: 10, north: 20, up: 30 };
    const mat = eulerToNerfTransformMatrix(pos, 0, -90, 0); // Nadir pointing North

    assert.strictEqual(mat.length, 4);
    assert.strictEqual(mat[0].length, 4);
    assert.strictEqual(mat[3][3], 1.0);
    assert.strictEqual(mat[3][0], 0.0);
    assert.strictEqual(mat[3][1], 0.0);
    assert.strictEqual(mat[3][2], 0.0);

    // Translation vector in row 0, 1, 2 column 3
    assert.strictEqual(mat[0][3], 10); // X = East
    assert.strictEqual(mat[1][3], 30); // Y = Up
    assert.strictEqual(mat[2][3], -20); // Z = -North
  });

  it('generateNerfstudioManifest compiles valid transforms.json structure with AprilTag GCPs', () => {
    const mockPhotos = [
      {
        filename: 'DJI_0001.JPG',
        lat: 41.3215,
        lon: -88.9950,
        altAgl: 25.0,
        heading: 90,
        gimbalPitch: -60,
        flightRoll: 0,
        severity: 'clean',
        detectedTags: [
          {
            id: 42,
            family: 'tag36h11',
            corners: [[100, 100], [200, 100], [200, 200], [100, 200]],
            center: [150, 150],
            matchedGcp: { varianceCm: 1.4, plannedLat: 41.3215, plannedLon: -88.9950 }
          }
        ]
      },
      {
        filename: 'DJI_0002.JPG',
        lat: 41.3216,
        lon: -88.9951,
        altAgl: 25.0,
        heading: 90,
        gimbalPitch: -60,
        flightRoll: 0,
        severity: 'clean'
      }
    ];

    const manifest = generateNerfstudioManifest({
      photos: mockPhotos,
      hfov: 73.7,
      vfov: 53.1,
      imageWidth: 4000,
      imageHeight: 3000
    });

    assert.strictEqual(manifest.camera_model, 'OPENCV');
    assert.strictEqual(manifest.total_frames, 2);
    assert.strictEqual(manifest.frames.length, 2);
    assert.strictEqual(manifest.frames[0].file_path, 'images/DJI_0001.JPG');
    assert.strictEqual(manifest.frames[0].fiducials.length, 1);
    assert.strictEqual(manifest.frames[0].fiducials[0].id, 42);
    assert.strictEqual(manifest.gcps.length, 1);
    assert.strictEqual(manifest.gcps[0].tagId, 42);
  });

  it('generateColmapPriors formats valid cameras.txt and images.txt priors', () => {
    const mockPhotos = [
      {
        filename: 'DJI_0001.JPG',
        lat: 41.3215,
        lon: -88.9950,
        altAgl: 25.0,
        heading: 0,
        gimbalPitch: -90,
        flightRoll: 0
      }
    ];

    const priors = generateColmapPriors({
      photos: mockPhotos,
      imageWidth: 4000,
      imageHeight: 3000
    });

    assert.ok(priors.camerasTxt.includes('PINHOLE 4000 3000'));
    assert.ok(priors.imagesTxt.includes('1'));
    assert.ok(priors.imagesTxt.includes('DJI_0001.JPG'));
  });
});
