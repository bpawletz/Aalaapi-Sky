/**
 * tools/node-red-contrib-aalaapi/lib/camera-pose.js
 * Single source of truth for drone camera pose math shared by the Nerfstudio
 * and COLMAP exporters.
 *
 * World frame: local East-North-Up (ENU) in meters, anchored at an origin photo.
 *   +X = East, +Y = North, +Z = Up.
 *
 * Attitude inputs (DJI XMP convention, degrees):
 *   yaw   - compass bearing of the optical axis, clockwise from North (GimbalYawDegree).
 *   pitch - elevation of the optical axis; 0 = horizon, -90 = nadir (GimbalPitchDegree).
 *   roll  - rotation about the optical axis, positive = clockwise as seen by the camera
 *           (GimbalRollDegree). The gimbal is stabilized, so this is ~0 in practice.
 *
 * The camera's basis vectors are expressed in ENU world coordinates:
 *   forward - direction the lens points
 *   right   - image +x direction
 *   up      - image "up" direction (opposite of image +y in pixel coordinates)
 */

const DEG = Math.PI / 180;

/**
 * GPS -> local ENU meters relative to an origin (equirectangular; accurate for
 * survey-scale extents of a few kilometers).
 */
function gpsToLocalMeters(lat, lon, alt, originLat, originLon, originAlt = 0) {
  const R = 6378137.0; // WGS84 equatorial radius (m)
  const meanLat = ((lat + originLat) / 2) * DEG;
  return {
    east: (lon - originLon) * DEG * R * Math.cos(meanLat),
    north: (lat - originLat) * DEG * R,
    up: (alt !== undefined && alt !== null ? alt : 0) - originAlt
  };
}

/**
 * Returns the camera basis { right, up, forward } as unit ENU vectors.
 */
function cameraBasisEnu(yawDeg = 0, pitchDeg = -90, rollDeg = 0) {
  const y = yawDeg * DEG;
  const p = pitchDeg * DEG;
  const r = rollDeg * DEG;

  // Optical axis.
  const forward = [Math.sin(y) * Math.cos(p), Math.cos(y) * Math.cos(p), Math.sin(p)];
  // Right is horizontal and perpendicular to the yaw bearing. Defining it from yaw
  // (instead of cross(forward, worldUp)) keeps it well-defined at exact nadir/zenith.
  const right0 = [Math.cos(y), -Math.sin(y), 0];
  // up = right x forward
  const up0 = cross(right0, forward);

  // Roll rotates right/up about the optical axis (clockwise as seen by the camera).
  const c = Math.cos(r);
  const s = Math.sin(r);
  const right = add(scale(right0, c), scale(up0, -s));
  const up = add(scale(right0, s), scale(up0, c));
  return { right, up, forward };
}

/**
 * Nerfstudio / OpenGL camera-to-world 4x4 matrix.
 * Camera axes: +X right, +Y up, +Z backwards (camera looks down -Z).
 * Columns of the rotation block are those axes expressed in world (ENU) coordinates.
 */
function nerfstudioCameraToWorld(posEnu, yawDeg, pitchDeg, rollDeg) {
  const { right, up, forward } = cameraBasisEnu(yawDeg, pitchDeg, rollDeg);
  const back = scale(forward, -1);
  const t = [posEnu.east, posEnu.north, posEnu.up];
  return [
    [right[0], up[0], back[0], t[0]],
    [right[1], up[1], back[1], t[1]],
    [right[2], up[2], back[2], t[2]],
    [0, 0, 0, 1]
  ];
}

/**
 * COLMAP / OpenCV world-to-camera extrinsics.
 * Camera axes: +X right, +Y down, +Z forward.
 * Returns { R (3x3 world->camera), t ([tx,ty,tz] = -R*C), q ([qw,qx,qy,qz] Hamilton) }.
 */
function colmapWorldToCamera(posEnu, yawDeg, pitchDeg, rollDeg) {
  const { right, up, forward } = cameraBasisEnu(yawDeg, pitchDeg, rollDeg);
  const down = scale(up, -1);
  // World->camera rotation: rows are the camera axes in world coordinates.
  const R = [right, down, forward];
  const C = [posEnu.east, posEnu.north, posEnu.up];
  const RC = matVec(R, C);
  const t = [-RC[0], -RC[1], -RC[2]];
  return { R, t, q: rotationToQuaternion(R) };
}

/**
 * Rotation matrix -> unit quaternion [w, x, y, z] (Shepperd's method), with w >= 0.
 */
function rotationToQuaternion(R) {
  const tr = R[0][0] + R[1][1] + R[2][2];
  let w, x, y, z;
  if (tr > 0) {
    const S = Math.sqrt(tr + 1) * 2;
    w = 0.25 * S;
    x = (R[2][1] - R[1][2]) / S;
    y = (R[0][2] - R[2][0]) / S;
    z = (R[1][0] - R[0][1]) / S;
  } else if (R[0][0] > R[1][1] && R[0][0] > R[2][2]) {
    const S = Math.sqrt(1 + R[0][0] - R[1][1] - R[2][2]) * 2;
    w = (R[2][1] - R[1][2]) / S;
    x = 0.25 * S;
    y = (R[0][1] + R[1][0]) / S;
    z = (R[0][2] + R[2][0]) / S;
  } else if (R[1][1] > R[2][2]) {
    const S = Math.sqrt(1 + R[1][1] - R[0][0] - R[2][2]) * 2;
    w = (R[0][2] - R[2][0]) / S;
    x = (R[0][1] + R[1][0]) / S;
    y = 0.25 * S;
    z = (R[1][2] + R[2][1]) / S;
  } else {
    const S = Math.sqrt(1 + R[2][2] - R[0][0] - R[1][1]) * 2;
    w = (R[1][0] - R[0][1]) / S;
    x = (R[0][2] + R[2][0]) / S;
    y = (R[1][2] + R[2][1]) / S;
    z = 0.25 * S;
  }
  const n = Math.hypot(w, x, y, z);
  const sign = w < 0 ? -1 : 1;
  return [sign * w / n, sign * x / n, sign * y / n, sign * z / n];
}

/** Quaternion [w,x,y,z] -> rotation matrix (used by tests for round-trip checks). */
function quaternionToRotation([w, x, y, z]) {
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
    [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
    [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]
  ];
}

/** Pinhole focal length in pixels from a field of view. */
function fovToFocalLength(fovDeg, dimensionPx) {
  return (dimensionPx / 2) / Math.tan((fovDeg * DEG) / 2);
}

/**
 * Resolves camera position/attitude fields from an Aalaapi photo record.
 * Accepts inspection-manifest photos (camelCase, optional nested `xmp`) and
 * SQLite photo_records rows (actual_* columns).
 * Returns null when the photo has no usable GPS fix.
 */
function resolvePhotoPose(p) {
  const x = p.xmp || {};
  const pick = (...vals) => vals.find(v => typeof v === 'number' && !isNaN(v));
  const lat = pick(p.lat, x.lat, p.actual_lat);
  const lon = pick(p.lon, x.lon, p.actual_lon);
  if (lat === undefined || lon === undefined) return null;
  return {
    lat,
    lon,
    alt: pick(p.altAgl, x.altAgl, p.alt, p.actual_alt_agl) ?? 0,
    // Camera orientation comes from the stabilized gimbal, not the airframe.
    yaw: pick(p.gimbalYaw, x.gimbalYaw, p.actual_yaw, p.heading, x.heading, p.flightYaw, x.flightYaw) ?? 0,
    pitch: pick(p.gimbalPitch, x.gimbalPitch, p.actual_pitch, p.pitch) ?? -90,
    roll: pick(p.gimbalRoll, x.gimbalRoll) ?? 0
  };
}

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function scale(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
function matVec(M, v) {
  return M.map(row => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);
}

module.exports = {
  gpsToLocalMeters,
  cameraBasisEnu,
  nerfstudioCameraToWorld,
  colmapWorldToCamera,
  rotationToQuaternion,
  quaternionToRotation,
  fovToFocalLength,
  resolvePhotoPose,
  matVec
};
