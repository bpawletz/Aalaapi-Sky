/**
 * tools/node-red-contrib-aalaapi/test/nerfstudio-splat.test.js
 * Geometric verification of the camera pose math, Nerfstudio transforms.json,
 * and COLMAP priors. Tests project known world points through the exported
 * poses and assert they land where they physically should.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  gpsToLocalMeters,
  cameraBasisEnu,
  nerfstudioCameraToWorld,
  colmapWorldToCamera,
  quaternionToRotation,
  fovToFocalLength,
  resolvePhotoPose,
  matVec
} = require('../lib/camera-pose.js');
const { generateNerfstudioManifest } = require('../lib/nerfstudio-splat.js');
const { generateColmapPriors } = require('../lib/colmap-prior.js');

const EPS = 1e-9;
const close = (a, b, eps = 1e-6, msg) => assert.ok(Math.abs(a - b) < eps, `${msg || ''} expected ${b}, got ${a}`);
const closeVec = (a, b, eps = 1e-6, msg) => a.forEach((v, i) => close(v, b[i], eps, `${msg || ''}[${i}]`));

const W = 4000, H = 3000;
const FX = fovToFocalLength(73.7, W);
const FY = fovToFocalLength(53.1, H);

/** Projects an ENU world point through COLMAP extrinsics + pinhole intrinsics. */
function projectColmap(ext, X) {
  const Xc = matVec(ext.R, X).map((v, i) => v + ext.t[i]);
  return { u: FX * Xc[0] / Xc[2] + W / 2, v: FY * Xc[1] / Xc[2] + H / 2, depth: Xc[2] };
}

/** Projects an ENU world point through a Nerfstudio camera-to-world matrix. */
function projectNerfstudio(c2w, X) {
  // world->camera (OpenGL): R^T (X - t)
  const d = [X[0] - c2w[0][3], X[1] - c2w[1][3], X[2] - c2w[2][3]];
  const xc = c2w[0][0] * d[0] + c2w[1][0] * d[1] + c2w[2][0] * d[2];
  const yc = c2w[0][1] * d[0] + c2w[1][1] * d[1] + c2w[2][1] * d[2];
  const zc = c2w[0][2] * d[0] + c2w[1][2] * d[1] + c2w[2][2] * d[2];
  // OpenGL camera looks down -Z; image y is flipped relative to OpenCV.
  return { u: FX * xc / -zc + W / 2, v: -FY * yc / -zc + H / 2, depth: -zc };
}

describe('Camera pose math (camera-pose.js)', () => {
  it('nadir camera heading North: lens points down, image-up is North, image-right is East', () => {
    const { right, up, forward } = cameraBasisEnu(0, -90, 0);
    closeVec(forward, [0, 0, -1]);
    closeVec(right, [1, 0, 0]);
    closeVec(up, [0, 1, 0]);
  });

  it('horizon camera heading East: lens points East, image-right is South, image-up is Up', () => {
    const { right, up, forward } = cameraBasisEnu(90, 0, 0);
    closeVec(forward, [1, 0, 0]);
    closeVec(right, [0, -1, 0]);
    closeVec(up, [0, 0, 1]);
  });

  it('positive roll dips the right side of the image (right-wing-down convention)', () => {
    const { right } = cameraBasisEnu(0, 0, 10);
    assert.ok(right[2] < 0, 'right vector should point below the horizon');
  });

  it('basis is right-handed and orthonormal for arbitrary attitudes', () => {
    for (const [y, p, r] of [[0, -90, 0], [37, -62, 4], [215, -10, -7], [359, -89.9, 0], [123, 15, 30]]) {
      const { right, up, forward } = cameraBasisEnu(y, p, r);
      const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
      close(dot(right, right), 1, 1e-9);
      close(dot(up, up), 1, 1e-9);
      close(dot(forward, forward), 1, 1e-9);
      close(dot(right, up), 0, 1e-9);
      close(dot(right, forward), 0, 1e-9);
      close(dot(up, forward), 0, 1e-9);
      // right x up == -forward  <=>  (right, up, back) is right-handed (OpenGL camera)
      const c = [right[1] * up[2] - right[2] * up[1], right[2] * up[0] - right[0] * up[2], right[0] * up[1] - right[1] * up[0]];
      closeVec(c, forward.map(v => -v), 1e-9);
    }
  });

  it('gpsToLocalMeters gives ~111.3 km per degree of latitude and correct up offset', () => {
    const p = gpsToLocalMeters(42.3215, -88.995, 120, 41.3215, -88.995, 100);
    close(p.north, 111319.49, 1);
    close(p.east, 0, EPS);
    close(p.up, 20, EPS);
  });

  it('resolvePhotoPose uses gimbal yaw (camera) rather than airframe yaw', () => {
    const pose = resolvePhotoPose({ lat: 41.3215, lon: -88.995, altAgl: 30, gimbalYaw: 90, flightYaw: 10, heading: 10, gimbalPitch: -45, flightRoll: 12 });
    assert.strictEqual(pose.yaw, 90);
    assert.strictEqual(pose.pitch, -45);
    assert.strictEqual(pose.roll, 0, 'airframe roll must not be applied to a stabilized gimbal camera');
  });

  it('resolvePhotoPose reads gimbal yaw from the nested xmp block and from SQLite rows', () => {
    assert.strictEqual(resolvePhotoPose({ lat: 1, lon: 2, heading: 5, xmp: { gimbalYaw: 77 } }).yaw, 77);
    const row = resolvePhotoPose({ actual_lat: 1, actual_lon: 2, actual_alt_agl: 40, actual_yaw: 33, actual_pitch: -70 });
    assert.deepStrictEqual([row.lat, row.lon, row.alt, row.yaw, row.pitch], [1, 2, 40, 33, -70]);
    assert.strictEqual(resolvePhotoPose({ filename: 'x.jpg' }), null);
  });
});

describe('COLMAP world-to-camera extrinsics', () => {
  const C = [0, 0, 50];
  const pos = { east: C[0], north: C[1], up: C[2] };

  it('nadir: point directly below projects to the principal point; East is image-right, North is image-up', () => {
    const ext = colmapWorldToCamera(pos, 0, -90, 0);
    const below = projectColmap(ext, [0, 0, 0]);
    close(below.u, W / 2, 1e-6); close(below.v, H / 2, 1e-6); close(below.depth, 50, 1e-9);
    assert.ok(projectColmap(ext, [10, 0, 0]).u > W / 2, 'East must project right of center');
    assert.ok(projectColmap(ext, [0, 10, 0]).v < H / 2, 'North must project above center');
  });

  it('nadir heading East: North is image-left', () => {
    const ext = colmapWorldToCamera(pos, 90, -90, 0);
    assert.ok(projectColmap(ext, [0, 10, 0]).u < W / 2);
  });

  it('45° oblique heading North: ground point 50 m North projects to center', () => {
    const ext = colmapWorldToCamera(pos, 0, -45, 0);
    const p = projectColmap(ext, [0, 50, 0]);
    close(p.u, W / 2, 1e-6); close(p.v, H / 2, 1e-6);
    close(p.depth, Math.hypot(50, 50), 1e-9);
  });

  it('translation is -R*C (camera center recovers as -R^T t), not the raw position', () => {
    const ext = colmapWorldToCamera({ east: 12, north: -7, up: 41 }, 37, -62, 4);
    const Rt = [0, 1, 2].map(i => [ext.R[0][i], ext.R[1][i], ext.R[2][i]]);
    const center = matVec(Rt, ext.t).map(v => -v);
    closeVec(center, [12, -7, 41], 1e-9);
    assert.ok(Math.abs(ext.t[0] - 12) > 1e-3 || Math.abs(ext.t[1] + 7) > 1e-3, 't must not equal C');
  });

  it('quaternion is unit, w >= 0, and round-trips to the same rotation', () => {
    for (const [y, p, r] of [[0, -90, 0], [37, -62, 4], [215, -10, -7], [180, -90, 0], [270, 0, 0]]) {
      const ext = colmapWorldToCamera(pos, y, p, r);
      close(Math.hypot(...ext.q), 1, 1e-12);
      assert.ok(ext.q[0] >= 0);
      const R2 = quaternionToRotation(ext.q);
      ext.R.forEach((row, i) => closeVec(row, R2[i], 1e-9, `R[${i}]`));
    }
  });
});

describe('Nerfstudio camera-to-world agrees with COLMAP', () => {
  it('both exports project the same world points to the same pixels', () => {
    const pos = { east: 5, north: -3, up: 45 };
    for (const [y, p, r] of [[0, -90, 0], [37, -62, 4], [215, -30, -7]]) {
      const c2w = nerfstudioCameraToWorld(pos, y, p, r);
      const ext = colmapWorldToCamera(pos, y, p, r);
      for (const X of [[0, 0, 0], [20, 10, 0], [-15, 30, 5]]) {
        const a = projectColmap(ext, X);
        const b = projectNerfstudio(c2w, X);
        if (a.depth <= 0) continue;
        close(b.u, a.u, 1e-6, 'u'); close(b.v, a.v, 1e-6, 'v'); close(b.depth, a.depth, 1e-9, 'depth');
      }
    }
  });

  it('c2w rotation equals R_cw^T * diag(1,-1,-1) (OpenCV -> OpenGL flip)', () => {
    const pos = { east: 0, north: 0, up: 30 };
    const c2w = nerfstudioCameraToWorld(pos, 123, -55, 3);
    const { R } = colmapWorldToCamera(pos, 123, -55, 3);
    for (let i = 0; i < 3; i++) {
      close(c2w[i][0], R[0][i], 1e-12);
      close(c2w[i][1], -R[1][i], 1e-12);
      close(c2w[i][2], -R[2][i], 1e-12);
    }
    assert.deepStrictEqual(c2w[3], [0, 0, 0, 1]);
  });
});

describe('Manifest generation', () => {
  const photos = [
    {
      filename: 'DJI_0001.JPG', lat: 41.3215, lon: -88.995, altAgl: 25, gimbalYaw: 90, gimbalPitch: -60, severity: 'clean',
      detectedTags: [{ id: 42, family: 'tag36h11', corners: [[100, 100], [200, 100], [200, 200], [100, 200]], center: [150, 150], matchedGcp: { varianceCm: 1.4, plannedLat: 41.3215, plannedLon: -88.995 } }]
    },
    { filename: 'DJI_0002.JPG', lat: 41.3216, lon: -88.9951, altAgl: 25, gimbalYaw: 90, gimbalPitch: -60, severity: 'critical' },
    { filename: 'NO_GPS.JPG', gimbalPitch: -90 }
  ];

  it('transforms.json has Nerfstudio-required keys and skips photos without GPS', () => {
    const m = generateNerfstudioManifest({ photos, imagesSubdir: 'photos/raw' });
    for (const k of ['camera_model', 'fl_x', 'fl_y', 'cx', 'cy', 'w', 'h', 'frames']) assert.ok(k in m, `missing ${k}`);
    assert.strictEqual(m.frames.length, 2);
    assert.strictEqual(m.frames[0].file_path, 'photos/raw/DJI_0001.JPG');
    assert.strictEqual(m.frames[0].transform_matrix.length, 4);
    closeVec(m.frames[0].transform_matrix[0].slice(3), [0]); // anchor photo sits at origin
    assert.strictEqual(m.gcps.length, 1);
    assert.strictEqual(m.frames[0].fiducials[0].id, 42);
  });

  it('severity filter excludes frames and errors when nothing is left', () => {
    assert.strictEqual(generateNerfstudioManifest({ photos, allowedSeverities: ['clean'] }).frames.length, 1);
    assert.throws(() => generateNerfstudioManifest({ photos, allowedSeverities: ['none'] }), /excluded/);
  });

  it('COLMAP images.txt lines parse and recover the ENU camera centers', () => {
    const { camerasTxt, imagesTxt } = generateColmapPriors({ photos, imageWidth: W, imageHeight: H });
    assert.ok(camerasTxt.includes(`1 PINHOLE ${W} ${H}`));
    const rows = imagesTxt.split('\n').filter(l => l && !l.startsWith('#'));
    assert.strictEqual(rows.length, 2);
    const parts = rows[1].split(' ');
    assert.strictEqual(parts.length, 10);
    assert.strictEqual(parts[9], 'DJI_0002.JPG');
    const q = parts.slice(1, 5).map(Number);
    const t = parts.slice(5, 8).map(Number);
    const R = quaternionToRotation(q);
    const Rt = [0, 1, 2].map(i => [R[0][i], R[1][i], R[2][i]]);
    const center = matVec(Rt, t).map(v => -v);
    const expected = gpsToLocalMeters(41.3216, -88.9951, 25, 41.3215, -88.995, 25);
    closeVec(center, [expected.east, expected.north, expected.up], 1e-4);
  });
});
