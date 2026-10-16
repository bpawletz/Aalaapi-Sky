/**
 * tools/node-red-contrib-aalaapi/lib/colmap-prior.js
 * Generates COLMAP text prior manifests (cameras.txt, images.txt) from drone telemetry.
 */

const path = require('node:path');
const { gpsToLocalMeters, fovToFocalLength } = require('./nerfstudio-splat.js');

/**
 * Converts Euler angles (degrees) to unit quaternion [qw, qx, qy, qz]
 * for COLMAP world-to-camera rotation R_cw.
 */
function eulerToColmapQuaternion(yawDeg, pitchDeg, rollDeg) {
  const DEG_TO_RAD = Math.PI / 180.0;
  // Yaw (around Z), Pitch (around X/Y), Roll (around optical axis)
  const y = (yawDeg * DEG_TO_RAD) / 2.0;
  const p = (pitchDeg * DEG_TO_RAD) / 2.0;
  const r = (rollDeg * DEG_TO_RAD) / 2.0;

  const cy = Math.cos(y);
  const sy = Math.sin(y);
  const cp = Math.cos(p);
  const sp = Math.sin(p);
  const cr = Math.cos(r);
  const sr = Math.sin(r);

  const qw = cr * cp * cy + sr * sp * sy;
  const qx = sr * cp * cy - cr * sp * sy;
  const qy = cr * sp * cy + sr * cp * sy;
  const qz = cr * cp * sy - sr * sp * cy;

  return [qw, qx, qy, qz];
}

/**
 * Generates COLMAP cameras.txt and images.txt priors.
 */
function generateColmapPriors(options = {}) {
  const photos = Array.isArray(options.photos) ? options.photos : [];
  const imageWidth = Number(options.imageWidth) || 4000;
  const imageHeight = Number(options.imageHeight) || 3000;
  const hfov = Number(options.hfov) || 73.7;
  const vfov = Number(options.vfov) || 53.1;

  const flX = fovToFocalLength(hfov, imageWidth);
  const flY = fovToFocalLength(vfov, imageHeight);
  const cx = imageWidth / 2.0;
  const cy = imageHeight / 2.0;

  // cameras.txt: CAMERA_ID, MODEL, WIDTH, HEIGHT, PARAMS[fx, fy, cx, cy]
  const camerasTxt = `# Camera list with one line of data per camera:
#   CAMERA_ID, MODEL, WIDTH, HEIGHT, PARAMS[]
# Number of cameras: 1
1 PINHOLE ${imageWidth} ${imageHeight} ${flX.toFixed(4)} ${flY.toFixed(4)} ${cx.toFixed(4)} ${cy.toFixed(4)}
`;

  // Find origin
  const valid = photos.filter(p => (p.lat !== undefined && p.lon !== undefined) || (p.actual_lat !== undefined && p.actual_lon !== undefined));
  if (valid.length === 0) {
    return { camerasTxt, imagesTxt: '' };
  }

  const originPhoto = valid[0];
  const originLat = options.originLat !== undefined ? options.originLat : (originPhoto.lat || originPhoto.actual_lat);
  const originLon = options.originLon !== undefined ? options.originLon : (originPhoto.lon || originPhoto.actual_lon);
  const originAlt = options.originAlt !== undefined ? options.originAlt : (originPhoto.altAgl || originPhoto.alt || originPhoto.actual_alt_agl || 0);

  const imageLines = [
    '# Image list with two lines of data per image:',
    '#   IMAGE_ID, QW, QX, QY, QZ, TX, TY, TZ, CAMERA_ID, NAME',
    '#   POINTS2D[] as (X, Y, POINT3D_ID)'
  ];

  valid.forEach((p, idx) => {
    const lat = p.lat !== undefined ? p.lat : p.actual_lat;
    const lon = p.lon !== undefined ? p.lon : p.actual_lon;
    const alt = p.altAgl !== undefined ? p.altAgl : (p.alt !== undefined ? p.alt : p.actual_alt_agl);
    const yaw = p.flightYaw !== undefined ? p.flightYaw : (p.heading !== undefined ? p.heading : (p.actual_yaw || 0));
    const pitch = p.gimbalPitch !== undefined ? p.gimbalPitch : (p.pitch !== undefined ? p.pitch : (p.actual_pitch !== undefined ? p.actual_pitch : -90));
    const roll = p.flightRoll !== undefined ? p.flightRoll : (p.actual_roll || 0);

    const pos = gpsToLocalMeters(lat, lon, alt, originLat, originLon, originAlt);
    const [qw, qx, qy, qz] = eulerToColmapQuaternion(yaw, pitch, roll);
    const fileName = p.filename || path.basename(p.rawPath || p.filePath || `IMG_${idx}.jpg`);

    const imageId = idx + 1;
    imageLines.push(`${imageId} ${qw.toFixed(6)} ${qx.toFixed(6)} ${qy.toFixed(6)} ${qz.toFixed(6)} ${pos.east.toFixed(4)} ${pos.up.toFixed(4)} ${(-pos.north).toFixed(4)} 1 ${fileName}`);
    imageLines.push(''); // blank points line
  });

  return {
    camerasTxt,
    imagesTxt: imageLines.join('\n') + '\n'
  };
}

module.exports = {
  eulerToColmapQuaternion,
  generateColmapPriors
};
