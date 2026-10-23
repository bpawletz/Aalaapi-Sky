/**
 * tools/node-red-contrib-aalaapi/lib/nerfstudio-splat.js
 * Builds a Nerfstudio transforms.json (splatfacto / 3DGS) from Aalaapi photo records.
 *
 * Conventions (see camera-pose.js):
 *   - World frame: local ENU meters (+X East, +Y North, +Z Up) anchored at the first
 *     geotagged photo (or an explicit origin).
 *   - transform_matrix: camera-to-world, OpenGL camera axes (+X right, +Y up, +Z back),
 *     which is what Nerfstudio's dataparser expects.
 */

const path = require('node:path');
const {
  gpsToLocalMeters,
  nerfstudioCameraToWorld,
  fovToFocalLength,
  resolvePhotoPose
} = require('./camera-pose.js');

/**
 * Backwards-compatible wrapper: (posEnu, yaw, pitch, roll) -> 4x4 camera-to-world.
 */
function eulerToNerfTransformMatrix(positionLocal, yawDeg = 0, pitchDeg = -90, rollDeg = 0) {
  return nerfstudioCameraToWorld(positionLocal, yawDeg, pitchDeg, rollDeg);
}

/**
 * Generates a Nerfstudio transforms.json object.
 *
 * @param {object} options
 * @param {Array}  options.photos            Aalaapi manifest photos or photo_records rows.
 * @param {number} [options.imageWidth=4000]
 * @param {number} [options.imageHeight=3000]
 * @param {number} [options.hfov=73.7]       Horizontal FOV in degrees.
 * @param {number} [options.vfov=53.1]       Vertical FOV in degrees.
 * @param {string} [options.imagesSubdir='images'] Path prefix for frame file_path values.
 * @param {string[]} [options.allowedSeverities] Defaults to all.
 * @param {number} [options.originLat], [options.originLon], [options.originAlt]
 */
function generateNerfstudioManifest(options = {}) {
  const photos = Array.isArray(options.photos) ? options.photos : [];
  if (photos.length === 0) {
    throw new Error('No photos provided for Nerfstudio manifest generation');
  }

  const posed = photos
    .map(p => ({ photo: p, pose: resolvePhotoPose(p) }))
    .filter(e => e.pose !== null);
  if (posed.length === 0) {
    throw new Error('No photos contain valid GPS coordinates');
  }

  const anchor = posed[0].pose;
  const originLat = options.originLat ?? anchor.lat;
  const originLon = options.originLon ?? anchor.lon;
  const originAlt = options.originAlt ?? anchor.alt;

  const w = Number(options.imageWidth) || 4000;
  const h = Number(options.imageHeight) || 3000;
  const flX = fovToFocalLength(Number(options.hfov) || 73.7, w);
  const flY = fovToFocalLength(Number(options.vfov) || 53.1, h);
  const subdir = (options.imagesSubdir || 'images').replace(/\\/g, '/').replace(/\/$/, '');
  const allowed = options.allowedSeverities || ['all'];

  const frames = [];
  const gcps = [];

  for (const { photo: p, pose } of posed) {
    const severity = p.severity || 'clean';
    if (!allowed.includes('all') && !allowed.includes(severity)) continue;

    const posEnu = gpsToLocalMeters(pose.lat, pose.lon, pose.alt, originLat, originLon, originAlt);
    const fileName = p.filename || path.basename(p.rawPath || p.filePath || p.raw_path || '');

    const frame = {
      file_path: `${subdir}/${fileName}`,
      transform_matrix: nerfstudioCameraToWorld(posEnu, pose.yaw, pose.pitch, pose.roll)
    };

    if (Array.isArray(p.detectedTags) && p.detectedTags.length > 0) {
      // Extra per-frame key; Nerfstudio ignores unknown keys.
      frame.fiducials = p.detectedTags.map(tag => ({
        id: tag.id,
        family: tag.family,
        corners: tag.corners,
        center: tag.center,
        varianceCm: tag.matchedGcp ? tag.matchedGcp.varianceCm : null
      }));
      for (const t of p.detectedTags) {
        if (t.matchedGcp) {
          gcps.push({
            tagId: t.id,
            photoFile: fileName,
            varianceCm: t.matchedGcp.varianceCm,
            plannedLat: t.matchedGcp.plannedLat,
            plannedLon: t.matchedGcp.plannedLon
          });
        }
      }
    }

    frames.push(frame);
  }

  if (frames.length === 0) {
    throw new Error('All photos were excluded by the severity filter');
  }

  return {
    camera_model: 'OPENCV',
    fl_x: flX,
    fl_y: flY,
    cx: w / 2,
    cy: h / 2,
    w,
    h,
    k1: 0,
    k2: 0,
    p1: 0,
    p2: 0,
    // Extra top-level keys (ignored by Nerfstudio) documenting the world frame.
    aalaapi_world_frame: 'ENU',
    origin: { latitude: originLat, longitude: originLon, altitudeMeters: originAlt },
    gcps,
    frames
  };
}

module.exports = {
  gpsToLocalMeters,
  eulerToNerfTransformMatrix,
  fovToFocalLength,
  generateNerfstudioManifest
};
