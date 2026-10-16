/**
 * tools/node-red-contrib-aalaapi/lib/nerfstudio-splat.js
 * Camera intrinsic/extrinsic transformation pipeline for Nerfstudio (splatfacto/3DGS).
 * 
 * Converts drone photo GPS, flight/gimbal attitude, and optical properties into
 * Nerfstudio transforms.json (OpenGL / Blender coordinate convention: +X Right, +Y Up, +Z Backwards).
 */

const fs = require('node:fs');
const path = require('node:path');

/**
 * Converts GPS lat/lon to local meters relative to an anchor origin using Equirectangular projection.
 */
function gpsToLocalMeters(lat, lon, alt, originLat, originLon, originAlt = 0) {
  const DEG_TO_RAD = Math.PI / 180.0;
  const R = 6378137.0; // WGS84 Earth radius (m)

  const dLat = (lat - originLat) * DEG_TO_RAD;
  const dLon = (lon - originLon) * DEG_TO_RAD;
  const meanLat = ((lat + originLat) / 2.0) * DEG_TO_RAD;

  const north = dLat * R;
  const east = dLon * (R * Math.cos(meanLat));
  const up = (alt !== undefined && alt !== null ? alt : 0) - originAlt;

  // In Local East-North-Up (ENU):
  // X = East, Y = North, Z = Up
  return { east, north, up };
}

/**
 * Computes 3x3 rotation matrix from drone gimbal / aircraft Euler angles (yaw, pitch, roll in degrees).
 * Drone camera Optical Convention (NED-oriented):
 * - Gimbal pitch is typically negative when looking downward (e.g. -90 = nadir, 0 = horizon).
 * - Yaw is clockwise from North (0 = North, 90 = East, 180 = South, 270 = West).
 * - Roll is tilt around camera optical axis.
 * 
 * Nerfstudio coordinate system (OpenGL/NeRF standard):
 * - Camera looks down -Z axis.
 * - +X is camera Right.
 * - +Y is camera Up.
 * 
 * World coordinate convention in NeRF:
 * - +X is East.
 * - +Y is Up.
 * - +Z is South (or North depending on convention, standard OpenGL is +X East, +Y Up, +Z South).
 */
function eulerToNerfTransformMatrix(positionLocal, yawDeg = 0, pitchDeg = -90, rollDeg = 0) {
  const DEG_TO_RAD = Math.PI / 180.0;
  const yaw = yawDeg * DEG_TO_RAD;
  const pitch = pitchDeg * DEG_TO_RAD;
  const roll = rollDeg * DEG_TO_RAD;

  // Optical forward vector in ENU coordinates:
  // Azimuth (yaw) measured clockwise from North (+Y), so:
  // Forward X (East) = sin(yaw) * cos(pitch)
  // Forward Y (North) = cos(yaw) * cos(pitch)
  // Forward Z (Up) = sin(pitch)
  const fX = Math.sin(yaw) * Math.cos(pitch);
  const fY = Math.cos(yaw) * Math.cos(pitch);
  const fZ = Math.sin(pitch);

  // In OpenGL/Nerfstudio camera convention:
  // Camera view direction is -Z, so camera +Z points backwards: camZ = -forward
  let zX = -fX;
  let zY = -fY;
  let zZ = -fZ;

  // World UP reference vector: [0, 0, 1] in ENU
  // Camera +X (Right) = cross(forward, UP)
  let rX = fY;
  let rY = -fX;
  let rZ = 0;
  const rLen = Math.hypot(rX, rY, rZ);

  if (rLen < 1e-4) {
    // Looking directly straight down (nadir) or up: use North as reference
    rX = 1;
    rY = 0;
    rZ = 0;
  } else {
    rX /= rLen;
    rY /= rLen;
    rZ /= rLen;
  }

  // Camera +Y (Up) = cross(camZ, camX)
  let uX = zY * rZ - zZ * rY;
  let uY = zZ * rX - zX * rZ;
  let uZ = zX * rY - zY * rX;

  // Apply roll rotation around optical axis (-camZ) if roll is non-zero
  if (Math.abs(roll) > 1e-4) {
    const cosR = Math.cos(roll);
    const sinR = Math.sin(roll);
    const newRX = rX * cosR + uX * sinR;
    const newRY = rY * cosR + uY * sinR;
    const newRZ = rZ * cosR + uZ * sinR;
    const newUX = -rX * sinR + uX * cosR;
    const newUY = -rY * sinR + uY * cosR;
    const newUZ = -rZ * sinR + uZ * cosR;
    rX = newRX; rY = newRY; rZ = newRZ;
    uX = newUX; uY = newUY; uZ = newUZ;
  }

  // Convert ENU coordinates to NeRF world space (X = East, Y = Up, Z = South):
  // World NeRF: x_nerf = east, y_nerf = up, z_nerf = -north
  const posX = positionLocal.east;
  const posY = positionLocal.up;
  const posZ = -positionLocal.north;

  // Matrix rows map camera [x, y, z] to world NeRF [X, Y, Z]:
  const m00 = rX;  const m01 = uX;  const m02 = zX;  const m03 = posX;
  const m10 = rZ;  const m11 = uZ;  const m12 = zZ;  const m13 = posY;
  const m20 = -rY; const m21 = -uY; const m22 = -zY; const m23 = posZ;
  const m30 = 0.0; const m31 = 0.0; const m32 = 0.0; const m33 = 1.0;

  return [
    [m00, m01, m02, m03],
    [m10, m11, m12, m13],
    [m20, m21, m22, m23],
    [m30, m31, m32, m33]
  ];
}

/**
 * Computes focal length in pixels from field of view (FOV) and image dimensions.
 */
function fovToFocalLength(fovDeg, dimensionPx) {
  const fovRad = (fovDeg * Math.PI) / 180.0;
  return (dimensionPx / 2.0) / Math.tan(fovRad / 2.0);
}

/**
 * Generates Nerfstudio transforms.json manifest from Aalaapi manifest or photo records.
 */
function generateNerfstudioManifest(options = {}) {
  const photos = Array.isArray(options.photos) ? options.photos : [];
  if (photos.length === 0) {
    throw new Error('No photos provided for Nerfstudio manifest generation');
  }

  // Determine origin (anchor first photo with valid coordinates, or specified home)
  const validPhotos = photos.filter(p => {
    const lat = p.lat !== undefined ? p.lat : p.actual_lat;
    const lon = p.lon !== undefined ? p.lon : p.actual_lon;
    return typeof lat === 'number' && !isNaN(lat) && typeof lon === 'number' && !isNaN(lon);
  });

  if (validPhotos.length === 0) {
    throw new Error('No photos contain valid GPS coordinates');
  }

  const originPhoto = validPhotos[0];
  const originLat = options.originLat !== undefined ? options.originLat : (originPhoto.lat !== undefined ? originPhoto.lat : originPhoto.actual_lat);
  const originLon = options.originLon !== undefined ? options.originLon : (originPhoto.lon !== undefined ? originPhoto.lon : originPhoto.actual_lon);
  const originAlt = options.originAlt !== undefined ? options.originAlt : (originPhoto.altAgl || originPhoto.alt || originPhoto.actual_alt_agl || 0);

  const imageWidth = Number(options.imageWidth) || 4000;
  const imageHeight = Number(options.imageHeight) || 3000;
  const hfov = Number(options.hfov) || 73.7; // Mini 4 Pro 24mm equiv FOV
  const vfov = Number(options.vfov) || 53.1;

  const flX = fovToFocalLength(hfov, imageWidth);
  const flY = fovToFocalLength(vfov, imageHeight);
  const cx = imageWidth / 2.0;
  const cy = imageHeight / 2.0;

  // Filter photos by severity if requested
  const allowedSeverities = options.allowedSeverities || ['clean', 'warning', 'all'];
  const frames = [];
  const gcpPoints = [];

  for (const p of validPhotos) {
    const severity = p.severity || 'clean';
    if (!allowedSeverities.includes('all') && !allowedSeverities.includes(severity)) {
      continue;
    }

    const lat = p.lat !== undefined ? p.lat : p.actual_lat;
    const lon = p.lon !== undefined ? p.lon : p.actual_lon;
    const alt = p.altAgl !== undefined ? p.altAgl : (p.alt !== undefined ? p.alt : p.actual_alt_agl);
    const yaw = p.flightYaw !== undefined ? p.flightYaw : (p.heading !== undefined ? p.heading : (p.actual_yaw || 0));
    const pitch = p.gimbalPitch !== undefined ? p.gimbalPitch : (p.pitch !== undefined ? p.pitch : (p.actual_pitch !== undefined ? p.actual_pitch : -90));
    const roll = p.flightRoll !== undefined ? p.flightRoll : (p.actual_roll || 0);

    const posLocal = gpsToLocalMeters(lat, lon, alt, originLat, originLon, originAlt);
    const matrix = eulerToNerfTransformMatrix(posLocal, yaw, pitch, roll);

    const fileName = p.filename || path.basename(p.rawPath || p.filePath || '');
    const relativeFilePath = options.imagesSubdir ? path.join(options.imagesSubdir, fileName).replace(/\\/g, '/') : `images/${fileName}`;

    const frame = {
      file_path: relativeFilePath,
      transform_matrix: matrix,
      fl_x: flX,
      fl_y: flY,
      cx,
      cy,
      w: imageWidth,
      h: imageHeight
    };

    // Include detected GCP/AprilTag fiducials if present
    if (Array.isArray(p.detectedTags) && p.detectedTags.length > 0) {
      frame.fiducials = p.detectedTags.map(tag => ({
        id: tag.id,
        family: tag.family,
        corners: tag.corners,
        center: tag.center,
        varianceCm: tag.matchedGcp ? tag.matchedGcp.varianceCm : null
      }));

      // Collect global GCP points
      for (const t of p.detectedTags) {
        if (t.matchedGcp) {
          gcpPoints.push({
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

  const manifest = {
    camera_model: 'OPENCV',
    fl_x: flX,
    fl_y: flY,
    cx,
    cy,
    w: imageWidth,
    h: imageHeight,
    k1: 0.0,
    k2: 0.0,
    p1: 0.0,
    p2: 0.0,
    origin: {
      latitude: originLat,
      longitude: originLon,
      altitudeMeters: originAlt
    },
    total_frames: frames.length,
    gcps: gcpPoints,
    frames
  };

  return manifest;
}

module.exports = {
  gpsToLocalMeters,
  eulerToNerfTransformMatrix,
  fovToFocalLength,
  generateNerfstudioManifest
};
