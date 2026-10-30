#!/usr/bin/env node
/**
 * Aalaapi Sky — External IRL Field Test Plan Tracker, AST Code-Hash Invalidator
 * & Automated Post-Flight Telemetry Log Verification Engine
 *
 * Location: tools/qa/irl_tracker.js
 * Zero core-bundle bloat: lives outside src/ and synchronizes docs/irl_test_status.json
 * and docs/IRL_TEST_PLAN.md.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT_DIR = path.resolve(__dirname, '../..');
const DEFAULT_STATUS_PATH = path.join(ROOT_DIR, 'docs/irl_test_status.json');
const DEFAULT_PLAN_MD_PATH = path.join(ROOT_DIR, 'docs/IRL_TEST_PLAN.md');
const MASTER_ISSUE_URL = 'https://github.com/bpawletz/Aalaapi-Sky/issues/202';

const LEGAL_NON_GUARANTEE_DISCLAIMER =
  'LEGAL & OPERATIONAL NON-GUARANTEE DISCLAIMER ("THE LEGALIZE"): An "IRL Verified" status badge, completed field checklist, or passing post-flight telemetry log analysis indicates SOLELY that a specific reference mission configuration was flown and logged on a specific aircraft and firmware combination at a specific point in time. It DOES NOT constitute a guarantee, warranty of fitness or airworthiness, regulatory certification, or assurance that future flights will execute identically or safely. Real-world flight execution is subject to numerous external, environmental, hardware, and site variations beyond software control—including wind gusts, air density, temperature, GNSS/GPS satellite geometry and multipath interference, compass/geomagnetic anomalies, barometric altimeter drift, Digital Elevation Model (DEM) and map alignment inaccuracies, unmapped physical obstacles (guy wires, power lines, tree growth), battery cell degradation, and unannounced OEM autopilot or firmware behavior changes. The Remote Pilot in Command (RPIC) retains 100% sole legal and operational responsibility for preflight verification, maintaining Visual Line of Sight (VLOS), obstacle clearance, and immediate manual override.';

const PHASE_KEYS = [
  'kmz_import',
  'entry_altitude',
  'geometry_path',
  'heading_gimbal',
  'capture_trigger',
  'exit_rth'
];

const PHASE_LABELS = {
  kmz_import: 'Phase 1: KMZ / WPML Export & RC 2 Import',
  entry_altitude: 'Phase 2: Takeoff, Entry Transition & Target AGL Stabilization',
  geometry_path: 'Phase 3: 3D Path Geometry, Turn Mode & Speed Adherence',
  heading_gimbal: 'Phase 4: Aircraft Heading / Yaw Lock & Gimbal Pitch Tracking',
  capture_trigger: 'Phase 5: Camera Shutter / Interval / Action Group Execution',
  exit_rth: 'Phase 6: Final Waypoint Completion, Manual Pause Check & Safe RTH'
};

/**
 * Canonical definitions for all 26 flight patterns in #grid-type.
 * All reference test parameters use synthetic/default rural Utica, IL coordinates [41.3215, -88.9950].
 */
const PATTERN_DEFINITIONS = [
  {
    id: 'single',
    name: '2D Map (Nadir Grid)',
    category: 'Mapping & 3D',
    sourceFile: 'src/patterns/PatternGenerators.js',
    generatorFunctions: ['generateGridCoordinates'],
    testParams: {
      centerCoords: [41.3215, -88.9950],
      altitudeM: 50,
      widthM: 80,
      heightM: 80,
      rotationDeg: 0,
      speedMps: 6.0,
      gimbalPitchDeg: -90,
      captureMode: 'continuous',
      headingMode: 'followWayline',
      pathMode: 'straight',
      frontOverlapPct: 75,
      sideOverlapPct: 70,
      turnaroundOvershootM: 10
    },
    verificationSteps: {
      kmz_import: 'Export KMZ and load into DJI Fly / RC 2; verify lawn-mower line count and turnaround overshoot nodes.',
      entry_altitude: 'Launch and verify climb to 50m AGL (±1.5m) before entering southern/northern entry overshoot waypoint.',
      geometry_path: 'Confirm parallel N-S survey lines maintain computed line spacing and 6.0 m/s cruise speed.',
      heading_gimbal: 'Verify aircraft nose tracks forward wayline heading (0° / 180°) and gimbal locks at -90° true nadir.',
      capture_trigger: 'Verify continuous distance-interval shutter fires evenly along survey lines and suppresses photos on turnaround overshoot segments.',
      exit_rth: 'Confirm mission completes final line, executes configured Finish Action (RTH at safe ceiling), and responds to RC Pause.'
    },
    edgeCases: 'Verify that turnaround overshoot waypoints (isTurnaroundPoint: true, skipPhoto: true) allow the gimbal to level out after 180° turns before re-entering the survey boundary.'
  },
  {
    id: 'double',
    name: '3D Splat (Double Grid)',
    category: 'Mapping & 3D',
    sourceFile: 'src/patterns/PatternGenerators.js',
    generatorFunctions: ['generateGridCoordinates'],
    testParams: {
      centerCoords: [41.3215, -88.9950],
      altitudeM: 50,
      widthM: 70,
      heightM: 70,
      rotationDeg: 0,
      speedMps: 5.0,
      gimbalPitchDeg: -60,
      captureMode: 'continuous',
      headingMode: 'followWayline',
      pathMode: 'straight',
      frontOverlapPct: 75,
      sideOverlapPct: 70,
      turnaroundOvershootM: 10
    },
    verificationSteps: {
      kmz_import: 'Export Double Grid KMZ and verify both Pass 1 (N-S) and Pass 2 (E-W) orthogonal crosshatch passes appear on RC 2.',
      entry_altitude: 'Verify ascent to 50m AGL and smooth entry into Pass 1 Line 0.',
      geometry_path: 'Verify seamless corner junction from Pass 1 final waypoint directly into Pass 2 Line 0 without diagonal deadhead transit across the grid.',
      heading_gimbal: 'Confirm 90° yaw rotation at Pass 1 -> Pass 2 transition and steady -60° oblique gimbal pitch on all four compass headings.',
      capture_trigger: 'Confirm oblique photos fire across both orthogonal passes with zero duplicate trigger at the Pass 1/Pass 2 corner junction.',
      exit_rth: 'Verify RTH initiation after Pass 2 completion with >= 20% battery margin.'
    },
    edgeCases: 'Watch the Pass 1 -> Pass 2 corner transition: aircraft must rotate 90° and settle before starting perpendicular pass.'
  },
  {
    id: 'target-splat',
    name: 'Target Splat (Frustum Grid)',
    category: 'Mapping & 3D',
    sourceFile: 'src/3d/GeometryBuilder.js',
    generatorFunctions: ['generateTargetSplatCoordinates'],
    testParams: {
      centerCoords: [41.3215, -88.9950],
      altitudeM: 45,
      widthM: 80,
      heightM: 80,
      targetRadiusM: 20,
      targetHeightM: 8,
      speedMps: 4.5,
      gimbalPitchDeg: -45,
      captureMode: 'continuous',
      headingMode: 'followWayline',
      pathMode: 'straight',
      framingMode: 'balanced'
    },
    verificationSteps: {
      kmz_import: 'Export Target Splat mission (`balanced` framing) and verify pruned outer lines and lead-in offsets on RC 2.',
      entry_altitude: 'Confirm climb to 45m AGL and entry at optical lead-in standoff distance.',
      geometry_path: 'Verify survey lines terminate once camera frustum passes the target volume (no wasted trailing flight lines).',
      heading_gimbal: 'Confirm -45° oblique gimbal pitch keeps the central 20m radius target framed during approach legs.',
      capture_trigger: 'Verify photos trigger only while the 3D frustum intersects the target cylinder/polygon.',
      exit_rth: 'If optional Perimeter Orbit Pass is enabled, verify clean transition to perimeter ring before RTH.'
    },
    edgeCases: 'Verify lead-up auto-pruning does not clip the near edge of the target roof at -45° pitch.'
  },
  {
    id: 'orbit',
    name: '3D Object (Circular Orbit)',
    category: 'Orbit & Structure',
    sourceFile: 'src/patterns/PatternGenerators.js',
    generatorFunctions: ['generateOrbitCoordinates'],
    testParams: {
      centerCoords: [41.3215, -88.9950],
      altitudeM: 40,
      radiusM: 30,
      speedMps: 4.0,
      gimbalPitchDeg: -45,
      captureMode: 'continuous',
      headingMode: 'towardCenter',
      pathMode: 'curved',
      frontOverlapPct: 75
    },
    verificationSteps: {
      kmz_import: 'Load Circular Orbit KMZ on RC 2; verify circular ring waypoints and curved turn radius tags.',
      entry_altitude: 'Confirm climb to 40m AGL and tangent entry onto the 30m radius circumference.',
      geometry_path: 'Verify smooth coordinated banking (`curved` path mode) around the 360° circumference at constant 30m standoff.',
      heading_gimbal: 'Confirm nose (`towardCenter`) and -45° gimbal remain locked on the central POI `[41.3215, -88.9950]` throughout 360° rotation.',
      capture_trigger: 'Verify angular photo spacing captures evenly spaced inward-facing frames around the full circle.',
      exit_rth: 'Confirm orbit closes cleanly at 360° and executes RTH without spiraling inward.'
    },
    edgeCases: 'Check crosswind yaw crabbing: gimbal yaw compensation should keep the central POI centered within ±8°.'
  },
  {
    id: 'multi-orbit',
    name: '3D Object (Multi-Tiered Orbit)',
    category: 'Orbit & Structure',
    sourceFile: 'src/patterns/PatternGenerators.js',
    generatorFunctions: ['generateMultiOrbitCoordinates'],
    testParams: {
      centerCoords: [41.3215, -88.9950],
      minAltitudeM: 25,
      maxAltitudeM: 55,
      tiers: 3,
      descentOrder: 'max-to-min',
      radiusM: 30,
      speedMps: 4.0,
      gimbalPitchDeg: -45,
      captureMode: 'continuous',
      headingMode: 'towardCenter',
      pathMode: 'curved'
    },
    verificationSteps: {
      kmz_import: 'Export 3-tier Multi-Orbit (`max-to-min`) and verify 3 stacked elevation rings (55m, 40m, 25m) on RC 2.',
      entry_altitude: 'Verify initial climb to top ring (55m AGL) before entering orbit.',
      geometry_path: 'Confirm smooth step-down altitude transitions (55m -> 40m -> 25m) between completed 360° rings.',
      heading_gimbal: 'Verify continuous inward `towardCenter` yaw lock and tier-adjusted pitch across all 3 rings.',
      capture_trigger: 'Confirm photo capture across all 3 tiers without missed triggers during inter-tier descent.',
      exit_rth: 'Verify RTH climbs back to safe RTH ceiling from the lowest tier (25m) before returning home.'
    },
    edgeCases: 'Top-down (`max-to-min`) order avoids rotor downwash dust; verify RTH climbs vertically before horizontal transit from low tier.'
  },
  {
    id: 'tower',
    name: '3D Structure (Tower Audit)',
    category: 'Orbit & Structure',
    sourceFile: 'src/patterns/PatternGenerators.js',
    generatorFunctions: ['generateTowerCoordinates'],
    testParams: {
      centerCoords: [41.3215, -88.9950],
      towerRadiusM: 15,
      guyWireBufferM: 10,
      minHeightM: 20,
      maxHeightM: 60,
      tiers: 3,
      direction: 'horizontal',
      speedMps: 2.5,
      gimbalPitchDeg: -15,
      captureMode: 'stopAndShoot',
      headingMode: 'towardCenter',
      pathMode: 'straight'
    },
    verificationSteps: {
      kmz_import: 'Load Tower Audit KMZ; verify total effective standoff equals Tower Radius (15m) + Guy-Wire Buffer (10m) = 25m.',
      entry_altitude: 'Confirm entry at top tier (60m AGL) at full 25m buffered radial standoff.',
      geometry_path: 'Verify horizontal rings (or vertical columns) never encroach inside the 25m safety cylinder.',
      heading_gimbal: 'Verify inward `towardCenter` heading lock and -15° shallow inspection pitch.',
      capture_trigger: 'Verify `stopAndShoot` halts aircraft completely (ground speed <= 0.5 m/s) and settles before firing each inspection photo.',
      exit_rth: 'Confirm vertical climb above `maxHeightM` (60m + buffer) before horizontal RTH transit.'
    },
    edgeCases: 'CRITICAL: Never fly near real guyed towers without physically verifying guy-wire anchor radii and setting Guy-Wire Buffer >= 10m.'
  },
  {
    id: 'vertical-facade',
    name: 'Vertical Facade (Planar Infrastructure)',
    category: 'Orbit & Structure',
    sourceFile: 'src/patterns/PatternGenerators.js',
    generatorFunctions: ['generateVerticalFacadeCoordinates'],
    testParams: {
      centerCoords: [41.3215, -88.9950],
      facadeWidthM: 40,
      minAltM: 15,
      maxAltM: 40,
      standoffM: 15,
      rotationDeg: 0,
      rasterOrder: 'horizontal',
      speedMps: 2.5,
      gimbalPitchDeg: 0,
      captureMode: 'stopAndShoot',
      headingMode: 'fixed',
      pathMode: 'straight'
    },
    verificationSteps: {
      kmz_import: 'Export Vertical Facade KMZ and confirm vertical 2D planar wall grid loads in DJI Fly.',
      entry_altitude: 'Verify entry at 15m perpendicular standoff distance and initial tier altitude (40m or 15m).',
      geometry_path: 'Confirm aircraft translates laterally and vertically within a flat plane parallel to the target wall (zero standoff drift).',
      heading_gimbal: 'Verify aircraft heading stays locked perpendicular to the facade plane and gimbal pitch holds 0° horizontal.',
      capture_trigger: 'Confirm `stopAndShoot` pause and shutter firing at each facade grid node.',
      exit_rth: 'Verify safe lateral pull-back / climb to RTH altitude upon completing final facade pass.'
    },
    edgeCases: 'Verify that rotating `grid-rotation` rotates both the vertical flight plane and the perpendicular camera normal vector identically.'
  },
  {
    id: 'continuous-helix',
    name: 'Continuous Helix (Corkscrew Orbit)',
    category: 'Orbit & Structure',
    sourceFile: 'src/patterns/PatternGenerators.js',
    generatorFunctions: ['generateHelixCoordinates'],
    testParams: {
      centerCoords: [41.3215, -88.9950],
      startRadiusM: 30,
      endRadiusM: 20,
      startAltM: 55,
      endAltM: 20,
      loops: 2,
      direction: 'cw',
      speedMps: 3.5,
      gimbalPitchDeg: -40,
      captureMode: 'continuous',
      headingMode: 'towardCenter',
      pathMode: 'curved'
    },
    verificationSteps: {
      kmz_import: 'Load Continuous Helix KMZ; verify helical waypoint spiral with continuous curved path mode.',
      entry_altitude: 'Verify entry at 55m start altitude and 30m start radius.',
      geometry_path: 'Confirm smooth corkscrew descent from 55m to 20m while tapering radius from 30m to 20m over 2 full revolutions without stopping.',
      heading_gimbal: 'Verify nose continuously tracks central POI (`towardCenter`) and pitch interpolates smoothly toward target.',
      capture_trigger: 'Verify continuous distance-interval photo triggers fire smoothly along the spiral without braking jerk.',
      exit_rth: 'Confirm safe climb to RTH ceiling from 20m end altitude.'
    },
    edgeCases: 'Ensure curved turn radius does not exceed half the chord distance between adjacent helix nodes.'
  },
  {
    id: 'star-pass',
    name: 'Star Pass (Cross-Hatch POI Inspection)',
    category: 'Orbit & Structure',
    sourceFile: 'src/patterns/PatternGenerators.js',
    generatorFunctions: ['generateStarPassCoordinates'],
    testParams: {
      centerCoords: [41.3215, -88.9950],
      altitudeM: 45,
      radiusM: 35,
      spokes: 4,
      speedMps: 4.5,
      gimbalPitchDeg: -60,
      captureMode: 'continuous',
      headingMode: 'followWayline',
      pathMode: 'straight'
    },
    verificationSteps: {
      kmz_import: 'Export 4-spoke Star Pass KMZ; verify diametric chords intersecting over center `[41.3215, -88.9950]` and perimeter connector chords.',
      entry_altitude: 'Verify climb to 45m AGL at Spoke 1 outer perimeter entry point.',
      geometry_path: 'Confirm straight diametric passes fly directly across the central POI and perimeter transitions connect smoothly to the next spoke azimuth.',
      heading_gimbal: 'Verify aircraft heading aligns with each radial spoke azimuth and gimbal holds -60° oblique pitch.',
      capture_trigger: 'Verify photos fire along each diametric pass over the POI and suppress unnecessary shots on outer perimeter turn chords.',
      exit_rth: 'Confirm RTH after completing final radial spoke.'
    },
    edgeCases: 'Verify multi-aspect illumination across all spoke azimuths (0°, 45°, 90°, 135°) without yaw oscillation at spoke entry.'
  },
  {
    id: 'photo-sphere',
    name: '360° Pano (Photo Sphere)',
    category: 'Creative & Pano',
    sourceFile: 'src/patterns/PatternGenerators.js',
    generatorFunctions: ['generatePhotoSphereCoordinates', 'calculatePhotoSphereOverlap'],
    testParams: {
      centerCoords: [41.3215, -88.9950],
      altitudeM: 45,
      speedMps: 3.0,
      shotsPerRing: 8,
      settlingTimeSec: 2,
      captureMode: 'stopAndShoot',
      pathMode: 'straight'
    },
    verificationSteps: {
      kmz_import: 'Export 360° Photo Sphere KMZ; verify multi-ring `wpml:actionGroup` sequence (Zenith +30°, Horizon 0°, Lower -30°, Nadir -90°) loads on RC 2.',
      entry_altitude: 'Confirm ascent to 45m AGL and stationary hover lock directly over center coordinate.',
      geometry_path: 'Verify horizontal position holds stationary within ±0.5m during the entire spherical capture sequence.',
      heading_gimbal: 'Verify procedural yaw rotation (`rotateYaw`) steps cleanly through all azimuths and gimbal pitches through all elevation rings.',
      capture_trigger: 'Confirm settling hover pause (`hoverTime`) executes before every `takePhoto` action to prevent motion blur.',
      exit_rth: 'Verify final Nadir (-90°) cap shot completes before RTH initiation.'
    },
    edgeCases: 'In winds > 6 m/s, verify 2-second settling delay is sufficient for gimbal horizon leveling before shutter release.'
  },
  {
    id: 'hyperlapse',
    name: 'Hyperlapse (Interval Time-Lapse)',
    category: 'Creative & Pano',
    sourceFile: 'src/patterns/PatternGenerators.js',
    generatorFunctions: ['generateHyperlapseWaypoints'],
    testParams: {
      centerCoords: [41.3215, -88.9950],
      altitudeM: 40,
      speedMps: 1.5,
      intervalSec: 3,
      startPitchDeg: -20,
      endPitchDeg: -45,
      captureMode: 'continuous',
      headingMode: 'smoothTransition',
      pathMode: 'curved'
    },
    verificationSteps: {
      kmz_import: 'Export Hyperlapse KMZ; verify spline-interpolated waypoints and interval trigger actions load in DJI Fly.',
      entry_altitude: 'Confirm climb to 40m AGL and smooth acceleration to 1.5 m/s cruise velocity.',
      geometry_path: 'Verify ultra-smooth Catmull-Rom curved spline trajectory without braking or speed steps at intermediate nodes.',
      heading_gimbal: 'Confirm `smoothTransition` yaw panning and linear/spline gimbal pitch interpolation (-20° -> -45°) across the path.',
      capture_trigger: 'Verify constant 3-second time-interval photo triggers throughout transit.',
      exit_rth: 'Confirm clean deceleration at final keyframe and safe RTH.'
    },
    edgeCases: 'Ensure minimum waypoint spacing (>= 0.5m) and speed (>= 0.5 m/s) prevent DJI Fly curve radius clamping.'
  },
  {
    id: 'light-art',
    name: 'Light Art (Sky Painting / Long Exposure)',
    category: 'Creative & Pano',
    sourceFile: 'src/patterns/PatternGenerators.js',
    generatorFunctions: ['generateLightArtCoordinates', 'calculateLightArtRadiusForDuration'],
    testParams: {
      centerCoords: [41.3215, -88.9950],
      altitudeM: 35,
      safetyDeckFloorM: 15,
      radiusM: 25,
      tiltDeg: 45,
      speedMps: 3.0,
      captureMode: 'continuous',
      headingMode: 'followWayline',
      pathMode: 'curved'
    },
    verificationSteps: {
      kmz_import: 'Export Light Art KMZ; verify 3D tilted vector stroke coordinates and Ground Safety Deck floor clamping (>= 15m AGL).',
      entry_altitude: 'Confirm climb to initial stroke vertex above 15m safety deck floor.',
      geometry_path: 'Verify continuous spline velocity (3.0 m/s) along the 3D tilted canvas plane aligns with ground tripod camera exposure duration.',
      heading_gimbal: 'Confirm smooth forward wayline tracking without abrupt yaw snaps at stroke vertices.',
      capture_trigger: 'Verify continuous flight execution (and auxiliary beacon/LED visibility from ground tripod viewpoint).',
      exit_rth: 'Confirm mission completes within target exposure window and climbs safely to RTH altitude.'
    },
    edgeCases: 'CRITICAL: Even with 90° vertical canvas tilt, verify no waypoint ever drops below the 15m AGL Ground Safety Deck.'
  },
  {
    id: 'grid-orbit-combo',
    name: '2D + 3D Hybrid (Grid + Orbit Combo)',
    category: 'Mapping & 3D',
    sourceFile: 'src/patterns/PatternGenerators.js',
    generatorFunctions: ['generateGridOrbitComboCoordinates', 'generateCircularGridCoordinates'],
    testParams: {
      centerCoords: [41.3215, -88.9950],
      altitudeM: 50,
      radiusM: 35,
      rotationDeg: 0,
      speedMps: 5.0,
      gimbalPitchDeg: -55,
      captureMode: 'continuous',
      pathMode: 'curved',
      frontOverlapPct: 75,
      sideOverlapPct: 70
    },
    verificationSteps: {
      kmz_import: 'Export Hybrid Grid + Orbit KMZ; verify circular-clipped top grid followed by outer perimeter orbit ring.',
      entry_altitude: 'Verify climb to 50m AGL and entry into circular-clipped lawn-mower grid.',
      geometry_path: 'Confirm seamless transition from the last grid line directly onto the outer perimeter orbit ring.',
      heading_gimbal: 'Verify heading switches cleanly from `followWayline` (during top grid) to `towardCenter` (during perimeter orbit).',
      capture_trigger: 'Confirm continuous photo capture across both the top grid and perimeter orbit.',
      exit_rth: 'Verify RTH after completing the 360° perimeter ring.'
    },
    edgeCases: 'Verify per-waypoint heading mode transition between the last grid waypoint and first orbit waypoint does not cause yaw spin error.'
  },
  {
    id: 'grid-multi-orbit-combo',
    name: '2D + 3D Hybrid (Grid + Multi-Orbit)',
    category: 'Mapping & 3D',
    sourceFile: 'src/patterns/PatternGenerators.js',
    generatorFunctions: ['generateGridMultiOrbitComboCoordinates', 'generateCircularGridCoordinates'],
    testParams: {
      centerCoords: [41.3215, -88.9950],
      minAltitudeM: 25,
      maxAltitudeM: 55,
      tiers: 2,
      radiusM: 35,
      rotationDeg: 0,
      speedMps: 5.0,
      gimbalPitchDeg: -55,
      captureMode: 'continuous',
      pathMode: 'curved'
    },
    verificationSteps: {
      kmz_import: 'Export Multi-Hybrid KMZ; verify top circular grid plus multi-tier descending perimeter rings.',
      entry_altitude: 'Confirm entry at 55m max altitude for top grid pass.',
      geometry_path: 'Verify top grid completes at 55m, followed by descending perimeter orbit rings (55m -> 25m).',
      heading_gimbal: 'Confirm `followWayline` on top grid transitions to `towardCenter` inward lock across all descending orbit tiers.',
      capture_trigger: 'Verify continuous shutter triggers across top grid and all orbit tiers.',
      exit_rth: 'Confirm vertical climb from lowest orbit tier (25m) to safe RTH ceiling upon completion.'
    },
    edgeCases: 'Check inter-tier descent transitions for smooth altitude ramping and constant radial standoff.'
  },
  {
    id: 'freeform',
    name: 'Freeform Flight Plan (Manual Waypoints)',
    category: 'Linear & Route',
    sourceFile: 'src/layers/LayerManager.js',
    generatorFunctions: ['compileMissionGeometry'],
    testParams: {
      centerCoords: [41.3215, -88.9950],
      altitudeM: 45,
      speedMps: 5.0,
      gimbalPitchDeg: -45,
      captureMode: 'stopAndShoot',
      headingMode: 'followWayline',
      pathMode: 'straight'
    },
    verificationSteps: {
      kmz_import: 'Place 4 custom Freeform waypoints with Tier-3 per-waypoint overrides (custom altitude, speed, dwell, zoom) and export KMZ.',
      entry_altitude: 'Verify climb to Waypoint 1 custom altitude override.',
      geometry_path: 'Confirm aircraft follows exact manual coordinates and respects per-waypoint speed and turn-mode overrides.',
      heading_gimbal: 'Verify per-waypoint custom heading angles and gimbal pitch overrides take precedence over Layer/Global defaults.',
      capture_trigger: 'Verify per-waypoint camera actions (Take Photo, Start/Stop Recording, Camera Zoom, Hover Dwell) execute at exact nodes.',
      exit_rth: 'Confirm final waypoint executes Finish Action cleanly.'
    },
    edgeCases: 'Verify Three-Tier Hierarchy cascade: waypoints set to `inherit` resolve to Layer settings, while explicit overrides take precedence.'
  },
  {
    id: 'road-following',
    name: 'Road Following (Offset Path)',
    category: 'Linear & Route',
    sourceFile: 'src/layers/LayerManager.js',
    generatorFunctions: ['generateRoadFlightWaypoints'],
    testParams: {
      centerCoords: [41.3215, -88.9950],
      altitudeM: 45,
      roadOffsetM: 15,
      speedMps: 5.5,
      gimbalPitchDeg: 'auto',
      captureMode: 'continuous',
      headingMode: 'followWayline',
      pathMode: 'curved'
    },
    verificationSteps: {
      kmz_import: 'Draw/snap a 3-node road polyline with +15m right-hand lateral offset and export KMZ.',
      entry_altitude: 'Confirm climb to 45m AGL and entry at offset start coordinate (not directly over road centerline).',
      geometry_path: 'Verify parallel offset trajectory maintains constant +15m lateral separation around road bends.',
      heading_gimbal: 'Verify `auto` road-focus gimbal pitch (`-atan2(45, 15) = -72°`) and inward/forward orientation keep road centered in frame.',
      capture_trigger: 'Verify distance-interval photo triggers fire along the entire offset corridor.',
      exit_rth: 'Confirm safe RTH from road endpoint.'
    },
    edgeCases: 'Verify miter/bevel offset geometry at sharp road bends does not self-intersect or cross over the active roadway.'
  },
  {
    id: 'corridor',
    name: 'Corridor Mapping (Multi-Pass Polyline)',
    category: 'Linear & Route',
    sourceFile: 'src/patterns/PatternGenerators.js',
    generatorFunctions: ['generateCorridorCoordinates'],
    testParams: {
      centerCoords: [41.3215, -88.9950],
      altitudeM: 60,
      corridorWidthM: 60,
      passes: 3,
      overshootM: 15,
      turnType: 'bulb',
      speedMps: 6.5,
      gimbalPitchDeg: -90,
      captureMode: 'continuous',
      headingMode: 'followWayline',
      pathMode: 'curved'
    },
    verificationSteps: {
      kmz_import: 'Export 3-pass Corridor Mapping KMZ (60m width, 15m overshoot, `bulb` turnarounds) and verify on RC 2.',
      entry_altitude: 'Confirm climb to 60m AGL at Pass 1 entry overshoot waypoint.',
      geometry_path: 'Verify 3 parallel offset swaths track the polyline centerline with smooth bulb turnaround loops at corridor ends.',
      heading_gimbal: 'Verify aircraft nose aligns with each swath direction and gimbal maintains -90° nadir (or -60° oblique).',
      capture_trigger: 'Confirm continuous photos fire along corridor swaths and pause (`skipPhoto: true`) during bulb turnaround loops.',
      exit_rth: 'Verify RTH from the end of Pass 3.'
    },
    edgeCases: 'At polyline vertex bends > 45°, verify outer swath miter clamping prevents excessive corner overshoot.'
  },
  {
    id: 'exclusion-box',
    name: 'Exclusion Zone (Rectangular Box)',
    category: 'Safety & GCP',
    sourceFile: 'src/layers/LayerManager.js',
    generatorFunctions: ['filterWaypointsByExclusionZones'],
    testParams: {
      centerCoords: [41.3215, -88.9950],
      boxWidthM: 35,
      boxHeightM: 35,
      minAltM: 0,
      maxAltM: 65,
      clearanceBufferM: 5
    },
    verificationSteps: {
      kmz_import: 'Place an `exclusion-box` layer (0m-65m ceiling) in the center of a 50m 2D Grid and export KMZ; verify zero waypoints inside the box.',
      entry_altitude: 'Launch the parent grid mission at 50m AGL.',
      geometry_path: 'Verify aircraft executes horizontal Dijkstra perimeter detour (or vertical climb-over detour at 65m + 5m = 70m) around the exclusion box.',
      heading_gimbal: 'Verify smooth transit heading along detour vertices.',
      capture_trigger: 'Confirm detour transit waypoints (`isExclusionDetour: true, skipPhoto: true`) do NOT fire redundant camera photos.',
      exit_rth: 'Confirm normal mission completion and verify RTH ceiling is set above exclusion zone ceiling.'
    },
    edgeCases: 'Verify both Horizontal Perimeter Detour and Vertical Climb-Over Detour (`findDetourPathOverZone`) maintain full clearance buffer.'
  },
  {
    id: 'exclusion-freeform',
    name: 'Exclusion Zone (Freeform Polygon)',
    category: 'Safety & GCP',
    sourceFile: 'src/layers/LayerManager.js',
    generatorFunctions: ['filterWaypointsByExclusionZones'],
    testParams: {
      centerCoords: [41.3215, -88.9950],
      verticesCount: 5,
      minAltM: 0,
      maxAltM: 70,
      clearanceBufferM: 5
    },
    verificationSteps: {
      kmz_import: 'Draw a 5-vertex concave/convex `exclusion-freeform` polygon intersecting an active flight layer and export KMZ.',
      entry_altitude: 'Launch mission and verify normal entry at target AGL.',
      geometry_path: 'Confirm flight segments intersecting any polygon edge route cleanly around the buffered polygon vertices without cutting corners.',
      heading_gimbal: 'Verify stable aircraft yaw through multi-segment polygon detour nodes.',
      capture_trigger: 'Confirm zero camera triggers occur on polygon avoidance detour nodes.',
      exit_rth: 'Confirm safe mission completion and RTH.'
    },
    edgeCases: 'Test concave polygon indentations to verify segment-polygon collision check (`isSegmentCollidingWithPolygon`) prevents shortcutting across restricted airspace.'
  },
  {
    id: 'boundary-polygon',
    name: 'Boundary / Parcel (Drawing Layer)',
    category: 'Safety & GCP',
    sourceFile: 'src/layers/LayerManager.js',
    generatorFunctions: ['compileMissionGeometry'],
    testParams: {
      centerCoords: [41.3215, -88.9950],
      verticesCount: 4,
      elevationOffsetM: 0
    },
    verificationSteps: {
      kmz_import: 'Create a 4-vertex `boundary-polygon` parcel layer alongside an active survey layer; verify the boundary layer itself exports 0 flight waypoints in `waylines.wpml`.',
      entry_altitude: 'Verify acreage (`ac` / `ha`) and perimeter (`m` / `ft`) readouts match geodetic ground truth.',
      geometry_path: 'Click "Sync from Boundary" on a `polygon-grid` layer and verify exact vertex transfer.',
      heading_gimbal: 'Open 3D View and verify the parcel boundary renders as a ground-draped 3D ribbon.',
      capture_trigger: 'Open Photo Inspector on a captured survey photo and verify the parcel boundary projects accurately onto the image plane.',
      exit_rth: 'Verify Undo/Redo and project JSON export/import preserve all boundary vertices and styling.'
    },
    edgeCases: 'Boundary layers are non-flying spatial reference layers; ensure they never inject phantom placemarks into exported WPML.'
  },
  {
    id: 'fiducial-markers',
    name: 'Fiducial / GCPs (ArUco / AprilTag Survey)',
    category: 'Safety & GCP',
    sourceFile: 'src/vision/GcpEngine.js',
    generatorFunctions: ['generateFiducialPrintableHtml', 'exportFiducialCoordinatesCsv'],
    testParams: {
      centerCoords: [41.3215, -88.9950],
      dictionary: 'APRILTAG_36h11',
      markerSizeCm: 60,
      markersCount: 4
    },
    verificationSteps: {
      kmz_import: 'Place 4 Fiducial/GCP markers (`APRILTAG_36h11`) on the map; verify printable target sheet and GCP CSV export.',
      entry_altitude: 'Deploy physical targets (or synthetic test calibration targets) and fly a 35m-50m nadir survey pass over them.',
      geometry_path: 'Verify GCP range rings and HDOP/PDOP spatial distribution indicator on the 2D map.',
      heading_gimbal: 'Confirm nadir (-90°) survey imagery captures clear, unblurred views of each fiducial target.',
      capture_trigger: 'Ingest captured photos into Photo Inspector and verify automatic AprilTag/ArUco detection and pixel-to-ground offset (`varianceCm`) calculation.',
      exit_rth: 'Confirm fiducial layer exports 0 flight waypoints into `waylines.wpml` while persisting in project archives.'
    },
    edgeCases: 'Ensure target size (e.g., 60cm x 60cm) provides >= 15x15 pixels at the planned flight altitude GSD for reliable tag decoding.'
  },
  {
    id: 'dome-shell',
    name: 'Hemispherical Dome (3D Geodesic Shell)',
    category: 'Orbit & Structure',
    sourceFile: 'src/patterns/PatternGenerators.js',
    generatorFunctions: ['generateDomeShellCoordinates'],
    testParams: {
      centerCoords: [41.3215, -88.9950],
      baseAltitudeM: 10,
      standoffRadiusM: 30,
      elevationTiers: 3,
      zenithCap: true,
      descentOrder: 'max-to-min',
      speedMps: 4.0,
      captureMode: 'continuous',
      headingMode: 'towardCenter',
      pathMode: 'curved'
    },
    verificationSteps: {
      kmz_import: 'Export Hemispherical Dome KMZ ($R = 30\\text{m}$, 3 tiers, Zenith Cap enabled, `max-to-min`) and verify on RC 2.',
      entry_altitude: 'Confirm entry at Zenith Cap ($z = z_0 + R = 40\\text{m}$ AGL) directly over the subject centroid.',
      geometry_path: 'Verify each descending elevation ring expands in horizontal radius ($r = R\\cos\\theta$) while descending ($z = z_0 + R\\sin\\theta$) to maintain constant 30m 3D Euclidean standoff.',
      heading_gimbal: 'Confirm Zenith Cap uses -90° nadir pitch and each descending tier automatically sets gimbal pitch to $-\\theta$ while locked `towardCenter`.',
      capture_trigger: 'Verify azimuth shot counts scale by $\\cos\\theta$ per ring (preventing polar over-clustering) and trigger cleanly.',
      exit_rth: 'Confirm safe climb to RTH ceiling after completing lowest elevation ring.'
    },
    edgeCases: 'Verify 3D Euclidean distance $\\sqrt{r^2 + (z - z_0)^2}$ remains constant at $R = 30\\text{m}$ (±1.5m) across all tiers.'
  },
  {
    id: 'polygon-grid',
    name: 'Polygon Area Grid (Custom Survey)',
    category: 'Mapping & 3D',
    sourceFile: 'src/patterns/PatternGenerators.js',
    generatorFunctions: ['generatePolygonGridCoordinates', 'computeOptimalPolygonSweepAngle'],
    testParams: {
      centerCoords: [41.3215, -88.9950],
      altitudeM: 50,
      verticesCount: 5,
      autoSweepAngle: true,
      gridPassMode: 'single',
      speedMps: 6.0,
      gimbalPitchDeg: -90,
      captureMode: 'continuous',
      headingMode: 'followWayline',
      pathMode: 'straight',
      frontOverlapPct: 75,
      sideOverlapPct: 70
    },
    verificationSteps: {
      kmz_import: 'Define a 5-vertex irregular polygon, enable Auto Sweep Angle, and export KMZ to RC 2.',
      entry_altitude: 'Verify climb to 50m AGL at first clipped polygon edge entry point.',
      geometry_path: 'Confirm lawn-mower lines clip strictly to the polygon perimeter (ray-casting intersection) and align parallel to the longest polygon edge to minimize turnarounds.',
      heading_gimbal: 'Verify aircraft heading aligns with the computed optimal sweep angle and gimbal holds -90° nadir (or -60° in double-pass mode).',
      capture_trigger: 'Confirm photos fire only inside the polygon interior and suppress triggers on exterior boundary transition segments.',
      exit_rth: 'Confirm clean RTH from final clipped survey segment.'
    },
    edgeCases: 'Test L-shaped / concave polygons: when a sweep line intersects the polygon multiple times, verify transit across the exterior gap sets `skipPhoto: true`.'
  },
  {
    id: 'sar-search',
    name: 'Search & Rescue (Expanding Square / Sector)',
    category: 'Safety & GCP',
    sourceFile: 'src/patterns/PatternGenerators.js',
    generatorFunctions: ['generateSarSearchCoordinates'],
    testParams: {
      centerCoords: [41.3215, -88.9950],
      altitudeM: 45,
      sarMode: 'expanding-square',
      trackSpacingM: 25,
      maxLegs: 8,
      bearingDeg: 0,
      speedMps: 5.5,
      gimbalPitchDeg: -45,
      captureMode: 'continuous',
      headingMode: 'followWayline',
      pathMode: 'straight'
    },
    verificationSteps: {
      kmz_import: 'Export both IAMSAR Expanding Square (ESS) and Sector Search (Victor Sierra) KMZ missions and verify geometry on RC 2.',
      entry_altitude: 'Confirm aircraft flies directly to the Last Known Position (LKP) datum `[41.3215, -88.9950]` at 45m AGL to begin leg 1.',
      geometry_path: 'For ESS, verify orthogonal 90° turns with leg lengths $d, d, 2d, 2d, 3d, 3d\\dots$; for Sector Search, verify 3 equilateral sectors passing repeatedly through the central LKP datum.',
      heading_gimbal: 'Confirm forward `followWayline` heading and -45° forward/oblique search gimbal angle.',
      capture_trigger: 'Verify continuous optical/thermal interval capture across all search legs.',
      exit_rth: 'Confirm immediate response to RC `Pause` (for target hover investigation) and safe RTH.'
    },
    edgeCases: 'Verify straight point-to-point turn mode (`straight`) at ESS corners so the drone does not cut inside the outer search corners.'
  },
  {
    id: 'perimeter-patrol',
    name: 'Perimeter Patrol (Closed Boundary Loop)',
    category: 'Linear & Route',
    sourceFile: 'src/patterns/PatternGenerators.js',
    generatorFunctions: ['generatePerimeterPatrolCoordinates'],
    testParams: {
      centerCoords: [41.3215, -88.9950],
      altitudeM: 35,
      standoffOffsetM: 10,
      headingLock: 'inward',
      direction: 'cw',
      laps: 1,
      speedMps: 4.5,
      gimbalPitchDeg: -45,
      captureMode: 'continuous',
      pathMode: 'curved'
    },
    verificationSteps: {
      kmz_import: 'Define a 4-corner perimeter boundary with +10m outward standoff and `inward` heading lock; export KMZ.',
      entry_altitude: 'Verify climb to 35m AGL at Vertex 1 offset coordinate.',
      geometry_path: 'Confirm closed-loop trajectory traces the entire perimeter at a uniform +10m outward buffer and closes back to Vertex 1.',
      heading_gimbal: 'Verify `inward` heading lock keeps the camera pointed +90° normal toward the fenceline/compound interior along each straight edge and corner.',
      capture_trigger: 'Confirm continuous interval capture along all perimeter segments.',
      exit_rth: 'Verify multi-lap counter (if laps > 1) and clean RTH upon final lap completion.'
    },
    edgeCases: 'Verify winding-order normalization ensures positive offset (+10m) always expands outward regardless of CW/CCW vertex drawing order.'
  },
  {
    id: 'cinematic-reveal',
    name: 'Cinematic Reveal (Dronie / Boomerang)',
    category: 'Creative & Pano',
    sourceFile: 'src/patterns/PatternGenerators.js',
    generatorFunctions: ['generateCinematicRevealCoordinates'],
    testParams: {
      centerCoords: [41.3215, -88.9950],
      cinematicMode: 'dronie',
      azimuthDeg: 180,
      startDistM: 8,
      endDistM: 45,
      startAltM: 12,
      endAltM: 40,
      poiAltM: 2,
      speedMps: 3.0,
      captureMode: 'continuous',
      headingMode: 'towardCenter',
      pathMode: 'curved'
    },
    verificationSteps: {
      kmz_import: 'Export Cinematic Reveal (`dronie` and `boomerang` modes) KMZ and verify smooth spline waypoints on RC 2.',
      entry_altitude: 'Confirm safe entry at 12m start altitude and 8m horizontal standoff from POI.',
      geometry_path: 'For Dronie, verify linear pull-back to 45m and climb to 40m along 180° azimuth; for Boomerang, verify eccentric oval orbit with altitude wave.',
      heading_gimbal: 'Verify nose locks onto central POI (`towardCenter`) and gimbal pitch dynamically tracks $-\\arctan2(z - z_{\\text{POI}}, d)$ to keep subject dead-center.',
      capture_trigger: 'Confirm continuous video / interval capture runs smoothly from start to finish without intermediate stops.',
      exit_rth: 'Confirm smooth deceleration at apex waypoint and safe RTH.'
    },
    edgeCases: 'Verify dynamic trigonometric pitch calculation prevents subject from drifting out of vertical frame during rapid ascent.'
  }
];

function getAppVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
    return pkg.version || '1.209.0';
  } catch (_) {
    return '1.209.0';
  }
}

/**
 * Extracts a top-level JS function body by name using balanced brace matching
 * and returns its normalized source string.
 */
function extractFunctionBody(fileContent, funcName) {
  if (!fileContent || !funcName) return '';
  const escaped = funcName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?:^|\\n)\\s*(?:export\\s+)?(?:async\\s+)?function\\s+${escaped}\\s*\\(`, 'm');
  const match = re.exec(fileContent);
  if (!match) return '';

  const startIdx = match.index;
  let openBraces = 0;
  let foundFirstBrace = false;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = startIdx; i < fileContent.length; i++) {
    const ch = fileContent[i];
    const next = fileContent[i + 1];
    const prev = fileContent[i - 1];

    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (!inSingle && !inDouble && !inTemplate) {
      if (ch === '/' && next === '/') {
        inLineComment = true;
        i++;
        continue;
      }
      if (ch === '/' && next === '*') {
        inBlockComment = true;
        i++;
        continue;
      }
    }

    if (!inDouble && !inTemplate && ch === "'" && prev !== '\\') {
      inSingle = !inSingle;
      continue;
    }
    if (!inSingle && !inTemplate && ch === '"' && prev !== '\\') {
      inDouble = !inDouble;
      continue;
    }
    if (!inSingle && !inDouble && ch === '`' && prev !== '\\') {
      inTemplate = !inTemplate;
      continue;
    }

    if (inSingle || inDouble || inTemplate) continue;

    if (ch === '{') {
      openBraces++;
      foundFirstBrace = true;
    } else if (ch === '}') {
      openBraces--;
      if (foundFirstBrace && openBraces === 0) {
        return fileContent.slice(startIdx, i + 1).replace(/\r\n/g, '\n').trim();
      }
    }
  }
  return '';
}

/**
 * Computes deterministic 12-character SHA-256 hashes for all 26 pattern generators
 * plus the WPML compiler.
 */
function computePatternCodeHashes(rootDir = ROOT_DIR, customSourceOverrides = {}) {
  const fileCache = new Map();
  const readSource = (relPath) => {
    if (customSourceOverrides[relPath] !== undefined) {
      return customSourceOverrides[relPath];
    }
    if (!fileCache.has(relPath)) {
      const full = path.join(rootDir, relPath);
      fileCache.set(relPath, fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : '');
    }
    return fileCache.get(relPath);
  };

  const wpmlSource = readSource('src/export/WpmlCompiler.js').replace(/\r\n/g, '\n');
  const wpmlCompilerHash = crypto.createHash('sha256').update(wpmlSource).digest('hex').slice(0, 12);

  const patternHashes = {};
  for (const def of PATTERN_DEFINITIONS) {
    const src = readSource(def.sourceFile);
    const extractedParts = [];
    for (const fn of def.generatorFunctions) {
      const body = extractFunctionBody(src, fn);
      extractedParts.push(body || `${fn}:fallback`);
    }
    const combined = `${def.id}|${extractedParts.join('\n')}`;
    patternHashes[def.id] = crypto.createHash('sha256').update(combined).digest('hex').slice(0, 12);
  }

  return { wpmlCompilerHash, patternHashes };
}

/**
 * Builds or loads the structured IRL test status JSON object.
 */
function loadOrInitStatus(statusPath = DEFAULT_STATUS_PATH, rootDir = ROOT_DIR) {
  const { wpmlCompilerHash, patternHashes } = computePatternCodeHashes(rootDir);
  const appVer = getAppVersion();

  let existing = null;
  if (fs.existsSync(statusPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
    } catch (_) {
      existing = null;
    }
  }

  const state = {
    schemaVersion: 1,
    lastUpdated: (existing && existing.lastUpdated) || new Date().toISOString(),
    currentAppVersion: appVer,
    masterIssueUrl: (existing && existing.masterIssueUrl) || MASTER_ISSUE_URL,
    legalDisclaimer: LEGAL_NON_GUARANTEE_DISCLAIMER,
    wpmlCompilerHash,
    patterns: {},
    releasePlans: (existing && Array.isArray(existing.releasePlans)) ? existing.releasePlans : []
  };

  for (const def of PATTERN_DEFINITIONS) {
    const prev = existing && existing.patterns && existing.patterns[def.id] ? existing.patterns[def.id] : null;
    const currentHash = patternHashes[def.id];

    const defaultChecklist = {
      kmz_import: false,
      entry_altitude: false,
      geometry_path: false,
      heading_gimbal: false,
      capture_trigger: false,
      exit_rth: false
    };

    if (!prev) {
      state.patterns[def.id] = {
        id: def.id,
        name: def.name,
        category: def.category,
        sourceFile: def.sourceFile,
        generatorFunctions: def.generatorFunctions,
        codeHash: currentHash,
        verifiedCodeHash: null,
        status: 'UNTESTED',
        lastModifiedVersion: appVer,
        lastTestedVersion: null,
        lastTestedDate: null,
        testedBy: null,
        droneModel: null,
        firmware: null,
        notes: '',
        testParams: def.testParams,
        checklist: { ...defaultChecklist },
        lastTelemetryMetrics: null,
        history: []
      };
    } else {
      state.patterns[def.id] = {
        ...prev,
        id: def.id,
        name: def.name,
        category: def.category,
        sourceFile: def.sourceFile,
        generatorFunctions: def.generatorFunctions,
        testParams: def.testParams,
        checklist: { ...defaultChecklist, ...(prev.checklist || {}) },
        history: Array.isArray(prev.history) ? prev.history : []
      };
    }
  }

  return state;
}

/**
 * Synchronizes code hashes, auto-invalidates VERIFIED patterns whose generator code changed
 * to NEEDS_RETEST, writes docs/irl_test_status.json, and regenerates docs/IRL_TEST_PLAN.md.
 */
function syncIrlStatus(options = {}) {
  const statusPath = options.statusPath || DEFAULT_STATUS_PATH;
  const planMdPath = options.planMdPath || DEFAULT_PLAN_MD_PATH;
  const rootDir = options.rootDir || ROOT_DIR;
  const customSourceOverrides = options.customSourceOverrides || {};

  const state = loadOrInitStatus(statusPath, rootDir);
  const { wpmlCompilerHash, patternHashes } = computePatternCodeHashes(rootDir, customSourceOverrides);
  const appVer = options.appVersion || getAppVersion();

  state.currentAppVersion = appVer;
  state.wpmlCompilerHash = wpmlCompilerHash;
  state.legalDisclaimer = LEGAL_NON_GUARANTEE_DISCLAIMER;

  const invalidatedPatterns = [];

  for (const def of PATTERN_DEFINITIONS) {
    const p = state.patterns[def.id];
    const newHash = patternHashes[def.id];
    const oldHash = p.codeHash;

    if (oldHash && oldHash !== newHash) {
      p.lastModifiedVersion = appVer;
    }
    p.codeHash = newHash;

    // Auto-invalidate if previously VERIFIED and generator hash changed from verifiedCodeHash
    if (p.status === 'VERIFIED' && p.verifiedCodeHash && p.verifiedCodeHash !== newHash) {
      p.status = 'NEEDS_RETEST';
      p.checklist = {
        kmz_import: false,
        entry_altitude: false,
        geometry_path: false,
        heading_gimbal: false,
        capture_trigger: false,
        exit_rth: false
      };
      p.notes = `Auto-flagged NEEDS_RETEST: Generator code hash changed (${p.verifiedCodeHash} -> ${newHash}) in v${appVer}.`;
      invalidatedPatterns.push(def.id);
    }
  }

  state.lastUpdated = new Date().toISOString();

  fs.mkdirSync(path.dirname(statusPath), { recursive: true });
  fs.writeFileSync(statusPath, JSON.stringify(state, null, 2) + '\n', 'utf8');

  const markdown = generateIrlTestPlanMarkdown(state);
  fs.mkdirSync(path.dirname(planMdPath), { recursive: true });
  fs.writeFileSync(planMdPath, markdown, 'utf8');

  return { state, invalidatedPatterns, markdown };
}

/**
 * Records a manual or automated verification result for a pattern.
 */
function recordPatternVerification(patternId, payload = {}, options = {}) {
  const statusPath = options.statusPath || DEFAULT_STATUS_PATH;
  const planMdPath = options.planMdPath || DEFAULT_PLAN_MD_PATH;
  const rootDir = options.rootDir || ROOT_DIR;

  const state = loadOrInitStatus(statusPath, rootDir);
  const p = state.patterns[patternId];
  if (!p) {
    throw new Error(`Unknown flight pattern ID: '${patternId}'`);
  }

  const appVer = payload.version || state.currentAppVersion || getAppVersion();
  const nowIso = payload.date || new Date().toISOString();

  if (payload.phases && typeof payload.phases === 'object') {
    for (const k of PHASE_KEYS) {
      if (payload.phases[k] !== undefined) {
        p.checklist[k] = Boolean(payload.phases[k]);
      }
    }
  } else if (payload.checkAll !== false && !payload.failed) {
    for (const k of PHASE_KEYS) {
      p.checklist[k] = true;
    }
  }

  const allChecked = PHASE_KEYS.every(k => Boolean(p.checklist[k]));
  if (payload.failed) {
    p.status = 'FAILED';
  } else if (allChecked) {
    p.status = 'VERIFIED';
    p.verifiedCodeHash = p.codeHash;
  } else {
    p.status = payload.status || (Object.values(p.checklist).some(Boolean) ? 'NEEDS_RETEST' : 'UNTESTED');
  }

  p.lastTestedVersion = appVer;
  p.lastTestedDate = nowIso;
  p.testedBy = payload.pilot || payload.testedBy || 'RPIC Field QA';
  p.droneModel = payload.droneModel || payload.drone || 'DJI Mini 4 Pro';
  p.firmware = payload.firmware || payload.fw || 'RC 2 / DJI Fly';
  if (payload.notes !== undefined) {
    p.notes = payload.notes;
  }
  if (payload.telemetryMetrics) {
    p.lastTelemetryMetrics = payload.telemetryMetrics;
  }

  p.history.unshift({
    timestamp: nowIso,
    version: appVer,
    status: p.status,
    codeHash: p.codeHash,
    testedBy: p.testedBy,
    droneModel: p.droneModel,
    firmware: p.firmware,
    notes: p.notes,
    checklist: { ...p.checklist },
    telemetryMetrics: payload.telemetryMetrics || null
  });

  if (p.history.length > 25) {
    p.history = p.history.slice(0, 25);
  }

  state.lastUpdated = nowIso;
  fs.writeFileSync(statusPath, JSON.stringify(state, null, 2) + '\n', 'utf8');

  const markdown = generateIrlTestPlanMarkdown(state);
  fs.writeFileSync(planMdPath, markdown, 'utf8');

  return { pattern: p, state };
}

/**
 * Adds or updates a post-update release IRL test plan entry and returns a GitHub-ready
 * Markdown checklist comment.
 */
function addReleaseTestPlan(entry = {}, options = {}) {
  const statusPath = options.statusPath || DEFAULT_STATUS_PATH;
  const planMdPath = options.planMdPath || DEFAULT_PLAN_MD_PATH;
  const rootDir = options.rootDir || ROOT_DIR;

  const state = loadOrInitStatus(statusPath, rootDir);
  const version = entry.version || state.currentAppVersion || getAppVersion();
  const issueNumber = entry.issueNumber || entry.issue || null;
  const title = entry.title || `Release v${version} Update Verification`;
  const date = entry.date || new Date().toISOString().slice(0, 10);
  const affectedPatterns = Array.isArray(entry.patterns)
    ? entry.patterns
    : (typeof entry.patterns === 'string' && entry.patterns.trim()
      ? entry.patterns.split(',').map(s => s.trim()).filter(Boolean)
      : []);

  const steps = Array.isArray(entry.steps) && entry.steps.length > 0
    ? entry.steps.map(s => (typeof s === 'string' ? { label: s, checked: false } : s))
    : [
        { label: 'Export test mission KMZ/WPML at synthetic rural coordinates `[41.3215, -88.9950]` and verify clean import into DJI Fly / RC 2.', checked: false },
        { label: 'Verify takeoff, climb to target AGL, and Waypoint 1 entry transition accuracy (±2.0m).', checked: false },
        { label: 'Verify modified flight pattern / feature behavior matches expected 3D trajectory, heading, and gimbal pitch.', checked: false },
        { label: 'Run post-flight telemetry log analysis (`npm run irl:analyze`) and confirm all 6 phases pass within tolerance.', checked: false }
      ];

  const planObj = {
    id: `rel-${version}${issueNumber ? `-${issueNumber}` : ''}`,
    version,
    issueNumber,
    title,
    date,
    affectedPatterns,
    status: entry.status || 'PENDING_IRL_TEST',
    steps
  };

  const existingIdx = state.releasePlans.findIndex(r => r.id === planObj.id || (r.version === version && r.issueNumber === issueNumber));
  if (existingIdx !== -1) {
    state.releasePlans[existingIdx] = planObj;
  } else {
    state.releasePlans.unshift(planObj);
  }

  state.lastUpdated = new Date().toISOString();
  fs.writeFileSync(statusPath, JSON.stringify(state, null, 2) + '\n', 'utf8');

  const markdown = generateIrlTestPlanMarkdown(state);
  fs.writeFileSync(planMdPath, markdown, 'utf8');

  const issueCommentMarkdown = [
    `### 🚁 Post-Update IRL Field Test Plan (v${version}${issueNumber ? ` — Issue #${issueNumber}` : ''})`,
    '',
    `> [!CAUTION]`,
    `> **Non-Guarantee & Variation Notice:** Passing these field checks verifies nominal reference behavior on the tested hardware/firmware only and **does not guarantee** future flight performance under varying wind, GNSS, geomagnetic, terrain, or OEM firmware conditions. The RPIC retains sole responsibility for VLOS and flight safety.`,
    '',
    affectedPatterns.length > 0 ? `**Affected Flight Patterns:** ${affectedPatterns.map(p => `\`${p}\``).join(', ')}` : '**Scope:** Core Flight Planner & QA Verification',
    '',
    ...steps.map(st => `- [${st.checked ? 'x' : ' '}] ${st.label}`),
    '',
    `**Post-Flight Log Verification Command:**`,
    '```bash',
    `npm run irl:analyze -- --pattern ${affectedPatterns[0] || 'double'} --plan path/to/waylines.wpml --log path/to/FlightRecord.csv`,
    '```'
  ].join('\n');

  return { plan: planObj, issueCommentMarkdown, state };
}

/**
 * Circular angular difference in degrees [0, 180].
 */
function angularDiffDeg(a, b) {
  const diff = Math.abs(((a - b) % 360 + 540) % 360 - 180);
  return diff;
}

/**
 * Quantitative 6-Phase Post-Flight Telemetry Log Analyzer.
 * Compares planned waypoints against actual flown telemetry points.
 */
function analyzeFlightLogAgainstPlan(plannedWaypoints, actualTelemetry, options = {}) {
  const decoder = require('../companion/log_decoder.js');
  const haversine = decoder.haversineDistance;

  const wps = Array.isArray(plannedWaypoints) ? plannedWaypoints : (plannedWaypoints && Array.isArray(plannedWaypoints.waypoints) ? plannedWaypoints.waypoints : []);
  const pts = Array.isArray(actualTelemetry) ? actualTelemetry : (actualTelemetry && Array.isArray(actualTelemetry.points) ? actualTelemetry.points : []);

  const pathMode = options.pathMode || 'straight';
  const captureMode = options.captureMode || 'continuous';
  const horizontalToleranceM = options.horizontalToleranceM || (pathMode === 'curved' ? 8.0 : 4.5);
  const maxXteToleranceM = options.maxXteToleranceM || (pathMode === 'curved' ? 12.0 : 8.0);
  const altitudeToleranceM = options.altitudeToleranceM || 2.0;
  const maxAltToleranceM = options.maxAltToleranceM || 5.0;
  const pitchToleranceDeg = options.pitchToleranceDeg || 6.0;
  const maxPitchToleranceDeg = options.maxPitchToleranceDeg || 15.0;
  const yawToleranceDeg = options.yawToleranceDeg || 15.0;
  const maxYawToleranceDeg = options.maxYawToleranceDeg || 25.0;
  const maxCaptureSpeedMps = options.maxCaptureSpeedMps || 1.0;

  // Phase 1: KMZ & Execution Init
  const kmzImportPassed = wps.length >= 2 && pts.length >= 5;

  if (!kmzImportPassed) {
    const emptyPhases = {
      kmz_import: false,
      entry_altitude: false,
      geometry_path: false,
      heading_gimbal: false,
      capture_trigger: false,
      exit_rth: false
    };
    return {
      passedAll: false,
      phases: emptyPhases,
      metrics: { waypointCount: wps.length, telemetryPointCount: pts.length, error: 'Insufficient waypoints or telemetry samples' },
      markdownReport: '❌ **Post-Flight Analysis Failed**: Insufficient planned waypoints or telemetry samples.'
    };
  }

  // Detect whether mission has vertically stacked waypoints at the same horizontal coordinate (e.g. Tower, Multi-Orbit, Facade)
  let hasVerticalStacking = false;
  for (let a = 0; a < wps.length; a++) {
    for (let b = a + 1; b < wps.length; b++) {
      const distAB = haversine(parseFloat(wps[a].lat), parseFloat(wps[a].lon), parseFloat(wps[b].lat), parseFloat(wps[b].lon));
      const altAB = Math.abs(parseFloat(wps[a].altitude ?? wps[a].alt ?? 50) - parseFloat(wps[b].altitude ?? wps[b].alt ?? 50));
      if (distAB < 2.0 && altAB > 3.0) {
        hasVerticalStacking = true;
        break;
      }
    }
    if (hasVerticalStacking) break;
  }

  // Analyze each planned waypoint against actual telemetry track
  const wpApproaches = [];
  for (let i = 0; i < wps.length; i++) {
    const wp = wps[i];
    const wpLat = parseFloat(wp.lat);
    const wpLon = parseFloat(wp.lon);
    const wpAlt = parseFloat(wp.altitude !== undefined ? wp.altitude : (wp.alt !== undefined ? wp.alt : 50));
    const wpPitch = (wp.gimbalPitch !== undefined && wp.gimbalPitch !== 'auto' && !isNaN(parseFloat(wp.gimbalPitch)))
      ? parseFloat(wp.gimbalPitch)
      : ((wp.pitch !== undefined && !isNaN(parseFloat(wp.pitch))) ? parseFloat(wp.pitch) : null);
    const wpYaw = (wp.heading !== undefined && !isNaN(parseFloat(wp.heading)))
      ? parseFloat(wp.heading)
      : ((wp.yaw !== undefined && !isNaN(parseFloat(wp.yaw))) ? parseFloat(wp.yaw) : null);

    let bestScore = Infinity;
    let bestDistH = Infinity;
    let bestPt = null;
    for (let j = 0; j < pts.length; j++) {
      const pt = pts[j];
      const dH = haversine(wpLat, wpLon, parseFloat(pt.lat), parseFloat(pt.lon));
      const dZCand = Math.abs(parseFloat(pt.alt || 0) - wpAlt);
      const score = hasVerticalStacking ? Math.hypot(dH, dZCand) : dH;
      // Use <= when i === 0 during initial takeoff climb so we pick the top-of-climb sample rather than ground launch sample
      const isBetter = (i === 0 && dH < 1.0 && bestDistH < 1.0)
        ? (j > 0 && dH <= bestDistH + 0.25 && j <= Math.ceil(pts.length * 0.4))
        : (score < bestScore);
      if (isBetter) {
        bestScore = score;
        bestDistH = dH;
        bestPt = pt;
      }
    }

    const dZ = bestPt ? Math.abs(parseFloat(bestPt.alt || 0) - wpAlt) : Infinity;
    const dPitch = (bestPt && wpPitch !== null && bestPt.pitch !== undefined)
      ? Math.abs(parseFloat(bestPt.pitch) - wpPitch)
      : null;
    const dYaw = (bestPt && wpYaw !== null && bestPt.yaw !== undefined)
      ? angularDiffDeg(parseFloat(bestPt.yaw), wpYaw)
      : null;

    wpApproaches.push({
      index: i,
      dH: Math.round(bestDistH * 100) / 100,
      dZ: Math.round(dZ * 100) / 100,
      dPitch: dPitch !== null ? Math.round(dPitch * 10) / 10 : null,
      dYaw: dYaw !== null ? Math.round(dYaw * 10) / 10 : null,
      visited: bestDistH <= horizontalToleranceM,
      skipPhoto: Boolean(wp.skipPhoto || wp.isTurnaroundPoint || wp.isExclusionDetour)
    });
  }

  // Phase 2: Entry & Target AGL (Waypoint 0)
  const wp0 = wpApproaches[0];
  const entryAltitudePassed = wp0.dH <= Math.max(4.0, horizontalToleranceM) && wp0.dZ <= altitudeToleranceM;

  // Phase 3: 3D Path & Geometry
  const visitedCount = wpApproaches.filter(a => a.visited).length;
  const completionRatio = visitedCount / wpApproaches.length;
  const rmsXte = Math.sqrt(wpApproaches.reduce((acc, a) => acc + a.dH * a.dH, 0) / wpApproaches.length);
  const rmsAltError = Math.sqrt(wpApproaches.reduce((acc, a) => acc + a.dZ * a.dZ, 0) / wpApproaches.length);
  const maxXteWp = wpApproaches.reduce((max, a) => (a.dH > (max ? max.dH : -1) ? a : max), wpApproaches[0]);
  const maxXte = maxXteWp ? maxXteWp.dH : 0;
  const maxAltWp = wpApproaches.reduce((max, a) => (a.dZ > (max ? max.dZ : -1) ? a : max), wpApproaches[0]);
  const maxAltError = maxAltWp ? maxAltWp.dZ : 0;
  const geometryPathPassed = completionRatio >= 0.90 &&
                             rmsXte <= horizontalToleranceM &&
                             rmsAltError <= altitudeToleranceM &&
                             maxXte <= maxXteToleranceM &&
                             maxAltError <= maxAltToleranceM;

  // Phase 4: Heading & Gimbal Lock
  const pitchSamples = wpApproaches.filter(a => a.visited && a.dPitch !== null);
  const yawSamples = wpApproaches.filter(a => a.visited && a.dYaw !== null);
  const meanPitchError = pitchSamples.length > 0
    ? pitchSamples.reduce((s, v) => s + v.dPitch, 0) / pitchSamples.length
    : 0;
  const maxPitchWp = pitchSamples.length > 0
    ? pitchSamples.reduce((max, a) => (a.dPitch > (max ? max.dPitch : -1) ? a : max), pitchSamples[0])
    : null;
  const maxPitchError = maxPitchWp ? maxPitchWp.dPitch : 0;

  const meanYawError = yawSamples.length > 0
    ? yawSamples.reduce((s, v) => s + v.dYaw, 0) / yawSamples.length
    : 0;
  const maxYawWp = yawSamples.length > 0
    ? yawSamples.reduce((max, a) => (a.dYaw > (max ? max.dYaw : -1) ? a : max), yawSamples[0])
    : null;
  const maxYawError = maxYawWp ? maxYawWp.dYaw : 0;

  const headingGimbalPassed = meanPitchError <= pitchToleranceDeg &&
                             maxPitchError <= maxPitchToleranceDeg &&
                             meanYawError <= yawToleranceDeg &&
                             maxYawError <= maxYawToleranceDeg;

  // Phase 5: Camera Capture Trigger
  const plannedPhotoWps = wps.filter(w => !w.skipPhoto && !w.isTurnaroundPoint && !w.isExclusionDetour).length;
  const expectedPhotos = options.plannedPhotoCount !== undefined ? options.plannedPhotoCount : plannedPhotoWps;
  const photoPts = pts.filter(p => Boolean(p.isPhoto));
  const actualPhotos = (actualTelemetry && typeof actualTelemetry.photoCount === 'number' && actualTelemetry.photoCount > photoPts.length)
    ? actualTelemetry.photoCount
    : photoPts.length;

  let stopAndShootSettled = true;
  let medianShutterSpeedMps = 0;
  let maxShutterSpeedMps = 0;
  if (photoPts.length > 0) {
    const speeds = photoPts.map(p => parseFloat(p.speed || 0)).sort((a, b) => a - b);
    medianShutterSpeedMps = speeds[Math.floor(speeds.length / 2)];
    maxShutterSpeedMps = speeds[speeds.length - 1];
    if (captureMode === 'stopAndShoot' || captureMode === 'hover') {
      if (medianShutterSpeedMps > 1.0 || maxShutterSpeedMps > maxCaptureSpeedMps) {
        stopAndShootSettled = false;
      }
    }
  }
  const photoRatio = expectedPhotos > 0 ? (actualPhotos / expectedPhotos) : 1.0;
  const captureTriggerPassed = (expectedPhotos === 0 || photoRatio >= 0.85) && stopAndShootSettled;

  // Phase 6: Exit, RTH & Battery
  const lastWp = wpApproaches[wpApproaches.length - 1];
  const batteryEnd = (actualTelemetry && actualTelemetry.batteryEnd !== undefined)
    ? parseFloat(actualTelemetry.batteryEnd)
    : (pts[pts.length - 1].battery !== undefined ? parseFloat(pts[pts.length - 1].battery) : 50);
  const exitRthPassed = lastWp.dH <= Math.max(5.0, horizontalToleranceM) && batteryEnd >= 15;

  const phases = {
    kmz_import: kmzImportPassed,
    entry_altitude: entryAltitudePassed,
    geometry_path: geometryPathPassed,
    heading_gimbal: headingGimbalPassed,
    capture_trigger: captureTriggerPassed,
    exit_rth: exitRthPassed
  };

  const passedAll = Object.values(phases).every(Boolean);

  const metrics = {
    plannedWaypoints: wps.length,
    visitedWaypoints: visitedCount,
    waypointCompletionPct: Math.round(completionRatio * 1000) / 10,
    entryHorizontalErrorM: wp0.dH,
    entryAltitudeErrorM: wp0.dZ,
    rmsXteM: Math.round(rmsXte * 100) / 100,
    maxXteM: Math.round(maxXte * 100) / 100,
    maxXteWpIndex: maxXteWp ? maxXteWp.index : 0,
    rmsAltitudeErrorM: Math.round(rmsAltError * 100) / 100,
    maxAltitudeErrorM: Math.round(maxAltError * 100) / 100,
    maxAltWpIndex: maxAltWp ? maxAltWp.index : 0,
    meanPitchErrorDeg: Math.round(meanPitchError * 10) / 10,
    maxPitchErrorDeg: Math.round(maxPitchError * 10) / 10,
    maxPitchWpIndex: maxPitchWp ? maxPitchWp.index : null,
    meanYawErrorDeg: Math.round(meanYawError * 10) / 10,
    maxYawErrorDeg: Math.round(maxYawError * 10) / 10,
    maxYawWpIndex: maxYawWp ? maxYawWp.index : null,
    expectedPhotos,
    actualPhotos,
    medianShutterSpeedMps: Math.round(medianShutterSpeedMps * 100) / 100,
    maxShutterSpeedMps: Math.round(maxShutterSpeedMps * 100) / 100,
    finalWaypointErrorM: lastWp.dH,
    batteryEndPct: Math.round(batteryEnd * 10) / 10,
    droneModel: (actualTelemetry && actualTelemetry.droneModel) || 'DJI Mini 4 Pro',
    durationFormatted: (actualTelemetry && actualTelemetry.durationFormatted) || 'N/A'
  };

  const statusBadge = passedAll ? '✅ PASS (All 6 IRL Phases Verified)' : '⚠️ PARTIAL / VARIANCE DETECTED';
  const markdownReport = [
    `### 📊 Post-Flight Telemetry Verification Scorecard — ${statusBadge}`,
    '',
    `> [!CAUTION]`,
    `> **Legal & Operational Non-Guarantee Notice:** This telemetry analysis confirms only that the logged flight met quantitative thresholds under the specific conditions of that flight. It **does not guarantee** future flight safety or identical performance under different wind, GNSS, geomagnetic, terrain, or firmware conditions.`,
    '',
    `| Phase | Check | Measured Telemetry Metric | Threshold | Result |`,
    `| :--- | :--- | :--- | :--- | :---: |`,
    `| **1. KMZ & Init** | \`kmz_import\` | ${wps.length} planned WPs, ${pts.length} telemetry samples | $\\ge 2$ WPs, $\\ge 5$ samples | ${phases.kmz_import ? '✅ PASS' : '❌ FAIL'} |`,
    `| **2. Entry & AGL** | \`entry_altitude\` | $\\Delta H_0 = ${metrics.entryHorizontalErrorM}\\text{ m}$, $\\Delta Z_0 = ${metrics.entryAltitudeErrorM}\\text{ m}$ | $\\Delta H_0 \\le 4.0\\text{ m}, \\Delta Z_0 \\le ${altitudeToleranceM}\\text{ m}$ | ${phases.entry_altitude ? '✅ PASS' : '❌ FAIL'} |`,
    `| **3. 3D Geometry** | \`geometry_path\` | ${metrics.waypointCompletionPct}% WPs visited, $\\text{XTE}_{\\text{rms}} = ${metrics.rmsXteM}\\text{ m}$ (Max $= ${metrics.maxXteM}\\text{ m}$ at WP ${metrics.maxXteWpIndex}), $\\Delta Z_{\\text{rms}} = ${metrics.rmsAltitudeErrorM}\\text{ m}$ (Max $= ${metrics.maxAltitudeErrorM}\\text{ m}$) | $\\text{XTE} \\le ${horizontalToleranceM} / ${maxXteToleranceM}\\text{ m}$, $\\Delta Z \\le ${altitudeToleranceM} / ${maxAltToleranceM}\\text{ m}$ | ${phases.geometry_path ? '✅ PASS' : '❌ FAIL'} |`,
    `| **4. Yaw & Gimbal** | \`heading_gimbal\` | Pitch: Mean $= ${metrics.meanPitchErrorDeg}^\\circ$, Max $= ${metrics.maxPitchErrorDeg}^\\circ$ (WP ${metrics.maxPitchWpIndex !== null ? metrics.maxPitchWpIndex : '-'}), Yaw: Mean $= ${metrics.meanYawErrorDeg}^\\circ$, Max $= ${metrics.maxYawErrorDeg}^\\circ$ | Pitch $\\le ${pitchToleranceDeg}^\\circ / ${maxPitchToleranceDeg}^\\circ$, Yaw $\\le ${yawToleranceDeg}^\\circ / ${maxYawToleranceDeg}^\\circ$ | ${phases.heading_gimbal ? '✅ PASS' : '❌ FAIL'} |`,
    `| **5. Shutter** | \`capture_trigger\` | ${metrics.actualPhotos} / ${metrics.expectedPhotos} photos (shutter spd: med ${metrics.medianShutterSpeedMps} m/s, max ${metrics.maxShutterSpeedMps} m/s) | $\\ge 85\\%$ photos${captureMode === 'stopAndShoot' ? `, max spd $\\le ${maxCaptureSpeedMps}$ m/s` : ''} | ${phases.capture_trigger ? '✅ PASS' : '❌ FAIL'} |`,
    `| **6. Exit & RTH** | \`exit_rth\` | Final WP $\\Delta H = ${metrics.finalWaypointErrorM}\\text{ m}$, Ending Battery $= ${metrics.batteryEndPct}\\%$ | Final $\\Delta H \\le 5.0\\text{ m}$, Batt $\\ge 15\\%$ | ${phases.exit_rth ? '✅ PASS' : '❌ FAIL'} |`
  ].join('\n');

  return {
    passedAll,
    phases,
    metrics,
    markdownReport
  };
}

/**
 * Parses a planned mission file (.wpml, .kml, .json) and an actual flight log file (.csv, .geojson, .gpx, .kml)
 * and runs analyzeFlightLogAgainstPlan.
 */
function analyzeLogFiles(planPath, logPath, options = {}) {
  const decoder = require('../companion/log_decoder.js');
  if (!fs.existsSync(planPath)) {
    throw new Error(`Planned mission file not found: ${planPath}`);
  }
  if (!fs.existsSync(logPath)) {
    throw new Error(`Actual flight log file not found: ${logPath}`);
  }

  const planRaw = fs.readFileSync(planPath, 'utf8');
  let plannedWaypoints = [];
  if (planPath.endsWith('.json')) {
    const parsed = JSON.parse(planRaw);
    plannedWaypoints = Array.isArray(parsed) ? parsed : (parsed.waypoints || []);
  } else {
    const parsedWpml = decoder.parseKmlOrWpmlTelemetry(planRaw, path.basename(planPath));
    if (parsedWpml && Array.isArray(parsedWpml.points)) {
      plannedWaypoints = parsedWpml.points.filter(pt => pt.waypointIndex !== null && pt.waypointIndex !== undefined);
    }
  }

  const logRaw = fs.readFileSync(logPath, 'utf8');
  let actualTelemetry = null;
  if (logPath.endsWith('.csv') || logPath.endsWith('.txt')) {
    actualTelemetry = decoder.parseCsvTelemetry(logRaw, path.basename(logPath));
  } else if (logPath.endsWith('.geojson') || logPath.endsWith('.json')) {
    actualTelemetry = decoder.parseGeoJsonTelemetry(JSON.parse(logRaw), path.basename(logPath));
  } else if (logPath.endsWith('.gpx')) {
    actualTelemetry = decoder.parseGpxTelemetry(logRaw, path.basename(logPath));
  } else {
    actualTelemetry = decoder.parseKmlOrWpmlTelemetry(logRaw, path.basename(logPath));
  }

  if (!actualTelemetry) {
    throw new Error(`Could not decode telemetry log: ${logPath}`);
  }

  const result = analyzeFlightLogAgainstPlan(plannedWaypoints, actualTelemetry, options);

  if (options.patternId && options.recordResult !== false) {
    recordPatternVerification(options.patternId, {
      phases: result.phases,
      failed: !result.passedAll && options.markFailedOnVariance,
      droneModel: result.metrics.droneModel,
      pilot: options.pilot || 'Automated Post-Flight Log Analyzer',
      notes: `Post-flight log analysis (${path.basename(logPath)}): ${result.metrics.waypointCompletionPct}% WPs, XTE=${result.metrics.rmsXteM}m, AltErr=${result.metrics.rmsAltitudeErrorM}m`,
      telemetryMetrics: result.metrics
    }, options);
  }

  return result;
}

function getStatusBadgeMarkdown(status) {
  switch (status) {
    case 'VERIFIED':
      return '✅ `VERIFIED`';
    case 'NEEDS_RETEST':
      return '🧪 `NEEDS_RETEST`';
    case 'FAILED':
      return '❌ `FAILED`';
    default:
      return '⬜ `UNTESTED`';
  }
}

/**
 * Generates the complete docs/IRL_TEST_PLAN.md file from the current state and pattern definitions.
 */
function generateIrlTestPlanMarkdown(state) {
  const patternsList = PATTERN_DEFINITIONS.map(def => ({
    def,
    state: state.patterns[def.id] || {}
  }));

  const verifiedCount = patternsList.filter(p => p.state.status === 'VERIFIED').length;
  const retestCount = patternsList.filter(p => p.state.status === 'NEEDS_RETEST').length;
  const failedCount = patternsList.filter(p => p.state.status === 'FAILED').length;
  const untestedCount = patternsList.length - verifiedCount - retestCount - failedCount;

  const lines = [
    '# Aalaapi Sky — In-Real-Life (IRL) Field Flight Test Plan & QA Verification Suite',
    '',
    `> [!CAUTION]`,
    `> **${LEGAL_NON_GUARANTEE_DISCLAIMER}**`,
    '',
    `**Document & Tracker Version:** \`v${state.currentAppVersion}\` | **WPML Compiler Hash:** \`${state.wpmlCompilerHash}\` | **Master GitHub Tracking Issue:** [#202](${state.masterIssueUrl})`,
    '',
    `**Summary Progress:** **${verifiedCount} / ${patternsList.length}** Patterns Verified | **${retestCount}** Needs Re-Test | **${untestedCount}** Untested | **${failedCount}** Failed`,
    '',
    '---',
    '',
    '## Table of Contents',
    '1. [Legal Non-Guarantee & Real-World Variations Notice](#1-legal-non-guarantee--real-world-variations-notice)',
    '2. [Universal Pre-Flight Field Safety Protocol](#2-universal-pre-flight-field-safety-protocol)',
    '3. [Automated Post-Flight Telemetry Log Verification (`npm run irl:analyze`)](#3-automated-post-flight-telemetry-log-verification-npm-run-irlanalyze)',
    '4. [Live 26-Pattern IRL Verification Status Matrix](#4-live-26-pattern-irl-verification-status-matrix)',
    '5. [Pattern-by-Pattern Field Test Plans (All 26 Flight Patterns)](#5-pattern-by-pattern-field-test-plans-all-26-flight-patterns)',
    '   - [Category A: Mapping & 3D Surveys](#category-a-mapping--3d-surveys)',
    '   - [Category B: Orbit & 3D Structure Inspections](#category-b-orbit--3d-structure-inspections)',
    '   - [Category C: Linear & Route Missions](#category-c-linear--route-missions)',
    '   - [Category D: Creative & Panoramic Media](#category-d-creative--panoramic-media)',
    '   - [Category E: Safety, Airspace & Spatial Control](#category-e-safety-airspace--spatial-control)',
    '6. [Post-Update Release IRL Test Plans Log](#6-post-update-release-irl-test-plans-log)',
    '',
    '---',
    '',
    '## 1. Legal Non-Guarantee & Real-World Variations Notice',
    '',
    '1. **Historical Baseline Only — No Guarantee of Future Execution**:',
    '   - An `IRL Verified` status in Aalaapi Sky, [`docs/irl_test_status.json`](irl_test_status.json), or GitHub Issue [#202](https://github.com/bpawletz/Aalaapi-Sky/issues/202) signifies **only** that a reference test plan was flown or analyzed on a specific hardware/firmware build under the environmental conditions present during that test.',
    '   - It **does NOT guarantee** that the same pattern or mission parameters will fly safely or identically at a different location, time, altitude, or firmware revision.',
    '2. **Real-World Environmental, Hardware & Firmware Variations**:',
    '   - **Atmospheric & Wind Variations**: Sustained winds, mechanical turbulence around structures, thermals, temperature extremes, and air density affect aircraft braking distance, turn overshoot radius, gimbal horizon stability, and battery discharge rates.',
    '   - **GNSS, Compass & Barometric Drift**: Multipath interference near metal structures/towers, solar geomagnetic storms (KP index), and barometric pressure shifts during flight can cause horizontal Cross-Track Error (XTE) of several meters and vertical altitude drift.',
    '   - **Geospatial & DEM Inaccuracies**: Satellite basemaps (Esri, Google, OSM) and Digital Elevation Models (Copernicus 30m, USGS 3DEP, LiDAR) may contain horizontal georeference shifts or outdated heights that do not reflect newly erected towers, cranes, guy wires, power lines, or tree canopy growth.',
    '   - **OEM Firmware & Autopilot Behavior Changes**: DJI Fly and aircraft firmware updates may alter WPML interpretation, curved-turn corner radii, speed clamping, or RTH behavior without notice.',
    '3. **Remote Pilot in Command (RPIC) Sole Responsibility**:',
    '   - Pursuant to 14 CFR Part 107 (or applicable national aviation regulations), the RPIC is 100% responsible for preflight inspection, maintaining continuous Visual Line of Sight (VLOS), verifying physical obstacle clearance, and immediately aborting autonomous execution via the RC flight mode switch (`Pause` / `Sport` / `Normal`) if any unexpected motion occurs.',
    '',
    '---',
    '',
    '## 2. Universal Pre-Flight Field Safety Protocol',
    '',
    '- **Synthetic / Rural Test Origin**: All repository documentation, screenshots, and reference test plans use Aalaapi Sky\'s default rural coordinates (`[41.3215, -88.9950]`, Utica, IL countryside) or normalized `(0, 0)` local grid offsets in strict compliance with the Zero-Sensitive-Information Policy (`AGENTS.md` Section 8).',
    '- **Open Field Clearance**: Execute initial pattern verifications over an open, unobstructed field with zero trees, structures, or overhead wires within a 100m radius.',
    '- **Failsafe & RTH Configuration**: Verify Global Safe RTH Altitude (Section 3) is set at least **15m higher** than the tallest surrounding obstacle, and confirm RC Signal Loss Action is set to `Return to Home (RTH)`.',
    '- **Manual Override Readiness**: Keep your thumb on the physical RC **Flight Pause** button and mode switch throughout takeoff, Waypoint 1 entry, and tight turnarounds.',
    '',
    '---',
    '',
    '## 3. Automated Post-Flight Telemetry Log Verification (`npm run irl:analyze`)',
    '',
    'Aalaapi Sky includes an automated post-flight telemetry verifier in [`tools/qa/irl_tracker.js`](../tools/qa/irl_tracker.js) powered by [`tools/companion/log_decoder.js`](../tools/companion/log_decoder.js). After flying an IRL test mission, you can objectively verify all 6 phases by comparing the exported `.wpml`/`.kmz` against the aircraft\'s actual telemetry log (`.csv`, decrypted `.txt`, `.gpx`, or `.geojson`):',
    '',
    '```bash',
    '# 1. Check current IRL verification status & detect any modified pattern code hashes:',
    'npm run irl:status',
    '',
    '# 2. Automatically grade a post-flight telemetry log against a planned mission:',
    'npm run irl:analyze -- --pattern double --plan path/to/waylines.wpml --log path/to/FlightRecord_decrypted.csv',
    '',
    '# 3. Or manually check off a pattern after field verification:',
    'npm run irl:check -- double --drone "DJI Mini 4 Pro" --fw "01.00.0600" --pilot "RPIC" --notes "All 6 phases nominal"',
    '```',
    '',
    '### Quantitative 6-Phase Telemetry Pass Criteria',
    '| Phase | ID | Telemetry Metric Evaluated | Pass Threshold |',
    '| :--- | :--- | :--- | :--- |',
    '| **Phase 1** | `kmz_import` | Valid planned waypoints ($N \\ge 2$) & actual telemetry samples ($M \\ge 5$) | Mission loaded & executed |',
    '| **Phase 2** | `entry_altitude` | Waypoint 1 approach distance $\\Delta H_0$ & altitude error $\\Delta Z_0$ | $\\Delta H_0 \\le 4.0\\text{ m}$, $\\Delta Z_0 \\le 2.0\\text{ m}$ |',
    '| **Phase 3** | `geometry_path` | Waypoint Visit Completion %, $\\text{XTE}_{\\text{rms}}$, and $\\Delta Z_{\\text{rms}}$ | $\\ge 90\\%$ WPs visited, $\\text{XTE}_{\\text{rms}} \\le 4.5\\text{ m}$ (straight) / $8.0\\text{ m}$ (curved), $\\Delta Z_{\\text{rms}} \\le 2.0\\text{ m}$ |',
    '| **Phase 4** | `heading_gimbal` | Mean Gimbal Pitch Error $\\Delta \\theta$ & Mean Heading Error $\\Delta \\psi$ | $\\Delta \\theta \\le 6.0^\\circ$, $\\Delta \\psi \\le 15.0^\\circ$ |',
    '| **Phase 5** | `capture_trigger` | Captured photo ratio & `stopAndShoot` shutter ground speed | $\\ge 85\\%$ planned photos; median shutter speed $\\le 1.0\\text{ m/s}$ (`stopAndShoot`) |',
    '| **Phase 6** | `exit_rth` | Final waypoint approach $\\Delta H_{N-1}$ & ending battery level | $\\Delta H_{N-1} \\le 5.0\\text{ m}$, Ending Battery $\\ge 15\\%$ |',
    '',
    '---',
    '',
    '## 4. Live 26-Pattern IRL Verification Status Matrix',
    '',
    '| # | Pattern ID | Pattern Name | Category | Status | Code Hash | Last Tested Ver | Drone / Firmware | Phases |',
    '| :---: | :--- | :--- | :--- | :---: | :---: | :---: | :--- | :---: |'
  ];

  patternsList.forEach(({ def, state: pState }, idx) => {
    const checkedCount = PHASE_KEYS.filter(k => pState.checklist && pState.checklist[k]).length;
    const droneFw = pState.droneModel ? `${pState.droneModel} (${pState.firmware || 'N/A'})` : '—';
    const lastVer = pState.lastTestedVersion ? `v${pState.lastTestedVersion}` : '—';
    lines.push(
      `| ${idx + 1} | \`${def.id}\` | **${def.name}** | ${def.category} | ${getStatusBadgeMarkdown(pState.status)} | \`${pState.codeHash || '—'}\` | ${lastVer} | ${droneFw} | \`${checkedCount}/6\` |`
    );
  });

  lines.push(
    '',
    '---',
    '',
    '## 5. Pattern-by-Pattern Field Test Plans (All 26 Flight Patterns)',
    ''
  );

  const categories = [
    { key: 'Mapping & 3D', heading: '### Category A: Mapping & 3D Surveys' },
    { key: 'Orbit & Structure', heading: '### Category B: Orbit & 3D Structure Inspections' },
    { key: 'Linear & Route', heading: '### Category C: Linear & Route Missions' },
    { key: 'Creative & Pano', heading: '### Category D: Creative & Panoramic Media' },
    { key: 'Safety & GCP', heading: '### Category E: Safety, Airspace & Spatial Control' }
  ];

  for (const cat of categories) {
    lines.push(cat.heading, '');
    const catPatterns = patternsList.filter(p => p.def.category === cat.key);
    for (const { def, state: pState } of catPatterns) {
      const cl = pState.checklist || {};
      const paramPairs = Object.entries(def.testParams)
        .filter(([k]) => k !== 'centerCoords')
        .map(([k, v]) => `\`${k}: ${v}\``)
        .join(', ');

      lines.push(
        `#### \`${def.id}\` — ${def.name}`,
        `- **Current Status:** ${getStatusBadgeMarkdown(pState.status)} | **Generator Hash:** \`${pState.codeHash}\` (\`${def.sourceFile}\` -> \`${def.generatorFunctions.join(', ')}\`)`,
        `- **Recommended Safe Field Parameters:** Origin \`[41.3215, -88.9950]\`, ${paramPairs}`,
        `- **6-Phase Field Verification Checklist:**`,
        `  - [${cl.kmz_import ? 'x' : ' '}] **${PHASE_LABELS.kmz_import}**: ${def.verificationSteps.kmz_import}`,
        `  - [${cl.entry_altitude ? 'x' : ' '}] **${PHASE_LABELS.entry_altitude}**: ${def.verificationSteps.entry_altitude}`,
        `  - [${cl.geometry_path ? 'x' : ' '}] **${PHASE_LABELS.geometry_path}**: ${def.verificationSteps.geometry_path}`,
        `  - [${cl.heading_gimbal ? 'x' : ' '}] **${PHASE_LABELS.heading_gimbal}**: ${def.verificationSteps.heading_gimbal}`,
        `  - [${cl.capture_trigger ? 'x' : ' '}] **${PHASE_LABELS.capture_trigger}**: ${def.verificationSteps.capture_trigger}`,
        `  - [${cl.exit_rth ? 'x' : ' '}] **${PHASE_LABELS.exit_rth}**: ${def.verificationSteps.exit_rth}`,
        `- **Edge-Case & Safety Watchout:** ${def.edgeCases}`,
        ''
      );
    }
  }

  lines.push(
    '---',
    '',
    '## 6. Post-Update Release IRL Test Plans Log',
    ''
  );

  if (!state.releasePlans || state.releasePlans.length === 0) {
    lines.push('*No post-update release test plans logged yet.*');
  } else {
    for (const rel of state.releasePlans) {
      const issueLink = rel.issueNumber ? ` ([Issue #${rel.issueNumber}](https://github.com/bpawletz/Aalaapi-Sky/issues/${rel.issueNumber}))` : '';
      lines.push(
        `### [v${rel.version}] ${rel.title} — ${rel.date}${issueLink}`,
        `- **Status:** \`${rel.status}\` | **Affected Patterns:** ${rel.affectedPatterns && rel.affectedPatterns.length > 0 ? rel.affectedPatterns.map(p => `\`${p}\``).join(', ') : 'Core / QA Framework'}`,
        ...(rel.steps || []).map(st => `- [${st.checked ? 'x' : ' '}] ${st.label}`),
        ''
      );
    }
  }

  lines.push(
    '---',
    `*Auto-generated and synchronized by \`tools/qa/irl_tracker.js\` — Master Issue: [#202](${state.masterIssueUrl})*`,
    ''
  );

  return lines.join('\n');
}

/**
 * Compact build-time dictionary for injection into window.AALAAPI_IRL_STATUS (~350 bytes).
 */
function buildCompactClientStatusMap(statusPath = DEFAULT_STATUS_PATH) {
  const state = loadOrInitStatus(statusPath);
  const compact = {
    _issue: state.masterIssueUrl || MASTER_ISSUE_URL
  };
  const codeMap = {
    VERIFIED: 'V',
    NEEDS_RETEST: 'R',
    FAILED: 'F',
    UNTESTED: 'U'
  };
  for (const def of PATTERN_DEFINITIONS) {
    const p = state.patterns[def.id];
    compact[def.id] = {
      s: codeMap[p ? p.status : 'UNTESTED'] || 'U',
      v: (p && p.lastTestedVersion) ? p.lastTestedVersion : null
    };
  }
  return compact;
}

// CLI Runner
if (require.main === module) {
  const args = process.argv.slice(2);
  const cmd = args[0] || 'status';

  const getFlag = (name, defaultVal = null) => {
    const idx = args.indexOf(name);
    if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
    return defaultVal;
  };

  if (cmd === 'sync') {
    const { state, invalidatedPatterns } = syncIrlStatus();
    console.log(`[IRL TRACKER] Synchronized ${Object.keys(state.patterns).length} flight patterns (v${state.currentAppVersion}).`);
    if (invalidatedPatterns.length > 0) {
      console.log(`[IRL TRACKER] Auto-flagged NEEDS_RETEST due to generator code changes: ${invalidatedPatterns.join(', ')}`);
    }
  } else if (cmd === 'status') {
    const { state, invalidatedPatterns } = syncIrlStatus();
    console.log(`\n=== Aalaapi Sky IRL Field Test Tracker (v${state.currentAppVersion}) ===`);
    console.log(`Master GitHub Matrix: ${state.masterIssueUrl}`);
    if (invalidatedPatterns.length > 0) {
      console.log(`⚠️ Auto-Invalidated (Code Changed): ${invalidatedPatterns.join(', ')}`);
    }
    console.log('--------------------------------------------------------------------------------');
    console.log('Pattern ID               | Status        | Hash         | Last Ver | Phases');
    console.log('--------------------------------------------------------------------------------');
    for (const def of PATTERN_DEFINITIONS) {
      const p = state.patterns[def.id];
      const count = PHASE_KEYS.filter(k => p.checklist && p.checklist[k]).length;
      console.log(
        `${def.id.padEnd(24)} | ${p.status.padEnd(13)} | ${(p.codeHash || '').padEnd(12)} | ${(p.lastTestedVersion || '-').padEnd(8)} | ${count}/6`
      );
    }
    console.log('--------------------------------------------------------------------------------\n');
  } else if (cmd === 'check') {
    const patternId = args[1];
    if (!patternId || patternId.startsWith('--')) {
      console.error('Usage: node tools/qa/irl_tracker.js check <pattern-id> [--drone "..."] [--fw "..."] [--pilot "..."] [--notes "..."] [--fail]');
      process.exit(1);
    }
    const failed = args.includes('--fail');
    const phaseArg = getFlag('--phase');
    let phases = null;
    if (phaseArg) {
      phases = {};
      for (const ph of phaseArg.split(',').map(s => s.trim()).filter(Boolean)) {
        phases[ph] = !failed;
      }
    }
    const { pattern } = recordPatternVerification(patternId, {
      droneModel: getFlag('--drone', 'DJI Mini 4 Pro'),
      firmware: getFlag('--fw', 'RC 2 / DJI Fly'),
      pilot: getFlag('--pilot', 'RPIC Field QA'),
      notes: getFlag('--notes', 'Verified all 6 IRL field test phases.'),
      failed,
      phases
    });
    console.log(`[IRL TRACKER] Updated '${pattern.id}' -> ${pattern.status} (v${pattern.lastTestedVersion}, hash ${pattern.codeHash})`);
  } else if (cmd === 'analyze' || cmd === 'analyze-log') {
    const patternId = getFlag('--pattern', 'double');
    let planPath = getFlag('--plan');
    let logPath = getFlag('--log');
    if (args.includes('--latest') && (!planPath || !logPath)) {
      const latestDir = path.join(ROOT_DIR, 'scratch/latest_flight');
      if (fs.existsSync(latestDir)) {
        const files = fs.readdirSync(latestDir);
        const wpmlFile = files.find(f => f.endsWith('.wpml') || f.endsWith('.kml'));
        const csvFile = files.find(f => f.endsWith('.csv') || f.endsWith('_decrypted.json') || f.endsWith('.gpx'));
        if (!planPath && wpmlFile) planPath = path.join(latestDir, wpmlFile);
        if (!logPath && csvFile) logPath = path.join(latestDir, csvFile);
      }
    }
    if (!planPath || !logPath) {
      console.error('Usage: node tools/qa/irl_tracker.js analyze --pattern <id> --plan <path/to/waylines.wpml> --log <path/to/FlightRecord.csv> (or --latest)');
      process.exit(1);
    }
    const res = analyzeLogFiles(path.resolve(planPath), path.resolve(logPath), {
      patternId,
      pilot: getFlag('--pilot', 'Automated Post-Flight Log Analyzer')
    });
    console.log('\n' + res.markdownReport + '\n');
    process.exit(res.passedAll ? 0 : 2);
  } else if (cmd === 'add-update') {
    const version = getFlag('--version', getAppVersion());
    const issue = getFlag('--issue');
    const title = getFlag('--title', `Release v${version} Update`);
    const patterns = getFlag('--patterns', '');
    const stepsRaw = getFlag('--steps', '');
    const steps = stepsRaw ? stepsRaw.split(';').map(s => s.trim()).filter(Boolean) : undefined;
    const { issueCommentMarkdown } = addReleaseTestPlan({
      version,
      issueNumber: issue ? parseInt(issue, 10) : null,
      title,
      patterns,
      steps
    });
    console.log('\n' + issueCommentMarkdown + '\n');
  } else {
    console.error(`Unknown command: ${cmd}. Supported commands: status, sync, check, analyze, add-update`);
    process.exit(1);
  }
}

module.exports = {
  LEGAL_NON_GUARANTEE_DISCLAIMER,
  MASTER_ISSUE_URL,
  PHASE_KEYS,
  PHASE_LABELS,
  PATTERN_DEFINITIONS,
  extractFunctionBody,
  computePatternCodeHashes,
  loadOrInitStatus,
  syncIrlStatus,
  recordPatternVerification,
  addReleaseTestPlan,
  analyzeFlightLogAgainstPlan,
  analyzeLogFiles,
  generateIrlTestPlanMarkdown,
  buildCompactClientStatusMap
};
