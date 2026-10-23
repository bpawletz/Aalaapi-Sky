/**
 * tools/node-red-contrib-aalaapi/lib/colmap-prior.js
 * Generates COLMAP text-format pose priors (cameras.txt, images.txt) from Aalaapi
 * photo records.
 *
 * images.txt stores WORLD-TO-CAMERA extrinsics per COLMAP's format:
 *   IMAGE_ID QW QX QY QZ TX TY TZ CAMERA_ID NAME
 * where (QW..QZ) is the rotation R_cw and T = -R_cw * C (C = camera center).
 * Camera axes follow OpenCV: +X right, +Y down, +Z forward.
 * World frame is local ENU meters (see camera-pose.js).
 */

const path = require('node:path');
const {
  gpsToLocalMeters,
  colmapWorldToCamera,
  fovToFocalLength,
  resolvePhotoPose
} = require('./camera-pose.js');

/**
 * Backwards-compatible helper: Euler (yaw, pitch, roll) -> COLMAP world-to-camera quaternion.
 */
function eulerToColmapQuaternion(yawDeg, pitchDeg, rollDeg) {
  return colmapWorldToCamera({ east: 0, north: 0, up: 0 }, yawDeg, pitchDeg, rollDeg).q;
}

function generateColmapPriors(options = {}) {
  const photos = Array.isArray(options.photos) ? options.photos : [];
  const w = Number(options.imageWidth) || 4000;
  const h = Number(options.imageHeight) || 3000;
  const flX = fovToFocalLength(Number(options.hfov) || 73.7, w);
  const flY = fovToFocalLength(Number(options.vfov) || 53.1, h);

  const camerasTxt = [
    '# Camera list with one line of data per camera:',
    '#   CAMERA_ID, MODEL, WIDTH, HEIGHT, PARAMS[]',
    '# Number of cameras: 1',
    `1 PINHOLE ${w} ${h} ${flX.toFixed(4)} ${flY.toFixed(4)} ${(w / 2).toFixed(4)} ${(h / 2).toFixed(4)}`,
    ''
  ].join('\n');

  const posed = photos
    .map(p => ({ photo: p, pose: resolvePhotoPose(p) }))
    .filter(e => e.pose !== null);
  if (posed.length === 0) {
    return { camerasTxt, imagesTxt: '', origin: null };
  }

  const anchor = posed[0].pose;
  const originLat = options.originLat ?? anchor.lat;
  const originLon = options.originLon ?? anchor.lon;
  const originAlt = options.originAlt ?? anchor.alt;

  const lines = [
    '# Image list with two lines of data per image:',
    '#   IMAGE_ID, QW, QX, QY, QZ, TX, TY, TZ, CAMERA_ID, NAME',
    '#   POINTS2D[] as (X, Y, POINT3D_ID)',
    `# World frame: local ENU meters, origin lat=${originLat} lon=${originLon} alt=${originAlt}`,
    `# Number of images: ${posed.length}`
  ];

  posed.forEach(({ photo: p, pose }, idx) => {
    const C = gpsToLocalMeters(pose.lat, pose.lon, pose.alt, originLat, originLon, originAlt);
    const { q, t } = colmapWorldToCamera(C, pose.yaw, pose.pitch, pose.roll);
    const name = p.filename || path.basename(p.rawPath || p.filePath || p.raw_path || `IMG_${idx}.jpg`);
    lines.push(
      `${idx + 1} ${q.map(v => v.toFixed(9)).join(' ')} ${t.map(v => v.toFixed(6)).join(' ')} 1 ${name}`
    );
    lines.push(''); // empty POINTS2D line (priors only)
  });

  return {
    camerasTxt,
    imagesTxt: lines.join('\n') + '\n',
    origin: { latitude: originLat, longitude: originLon, altitudeMeters: originAlt }
  };
}

module.exports = {
  eulerToColmapQuaternion,
  generateColmapPriors
};
