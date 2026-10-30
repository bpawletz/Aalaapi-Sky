# Aalaapi Sky — In-Real-Life (IRL) Field Flight Test Plan & QA Verification Suite

> [!CAUTION]
> **LEGAL & OPERATIONAL NON-GUARANTEE DISCLAIMER ("THE LEGALIZE"): An "IRL Verified" status badge, completed field checklist, or passing post-flight telemetry log analysis indicates SOLELY that a specific reference mission configuration was flown and logged on a specific aircraft and firmware combination at a specific point in time. It DOES NOT constitute a guarantee, warranty of fitness or airworthiness, regulatory certification, or assurance that future flights will execute identically or safely. Real-world flight execution is subject to numerous external, environmental, hardware, and site variations beyond software control—including wind gusts, air density, temperature, GNSS/GPS satellite geometry and multipath interference, compass/geomagnetic anomalies, barometric altimeter drift, Digital Elevation Model (DEM) and map alignment inaccuracies, unmapped physical obstacles (guy wires, power lines, tree growth), battery cell degradation, and unannounced OEM autopilot or firmware behavior changes. The Remote Pilot in Command (RPIC) retains 100% sole legal and operational responsibility for preflight verification, maintaining Visual Line of Sight (VLOS), obstacle clearance, and immediate manual override.**

**Document & Tracker Version:** `v1.209.0` | **WPML Compiler Hash:** `f01cb90862e5` | **Master GitHub Tracking Issue:** [#202](https://github.com/bpawletz/Aalaapi-Sky/issues/202)

**Summary Progress:** **0 / 26** Patterns Verified | **0** Needs Re-Test | **26** Untested | **0** Failed

---

## Table of Contents
1. [Legal Non-Guarantee & Real-World Variations Notice](#1-legal-non-guarantee--real-world-variations-notice)
2. [Universal Pre-Flight Field Safety Protocol](#2-universal-pre-flight-field-safety-protocol)
3. [Automated Post-Flight Telemetry Log Verification (`npm run irl:analyze`)](#3-automated-post-flight-telemetry-log-verification-npm-run-irlanalyze)
4. [Live 26-Pattern IRL Verification Status Matrix](#4-live-26-pattern-irl-verification-status-matrix)
5. [Pattern-by-Pattern Field Test Plans (All 26 Flight Patterns)](#5-pattern-by-pattern-field-test-plans-all-26-flight-patterns)
   - [Category A: Mapping & 3D Surveys](#category-a-mapping--3d-surveys)
   - [Category B: Orbit & 3D Structure Inspections](#category-b-orbit--3d-structure-inspections)
   - [Category C: Linear & Route Missions](#category-c-linear--route-missions)
   - [Category D: Creative & Panoramic Media](#category-d-creative--panoramic-media)
   - [Category E: Safety, Airspace & Spatial Control](#category-e-safety-airspace--spatial-control)
6. [Post-Update Release IRL Test Plans Log](#6-post-update-release-irl-test-plans-log)

---

## 1. Legal Non-Guarantee & Real-World Variations Notice

1. **Historical Baseline Only — No Guarantee of Future Execution**:
   - An `IRL Verified` status in Aalaapi Sky, [`docs/irl_test_status.json`](irl_test_status.json), or GitHub Issue [#202](https://github.com/bpawletz/Aalaapi-Sky/issues/202) signifies **only** that a reference test plan was flown or analyzed on a specific hardware/firmware build under the environmental conditions present during that test.
   - It **does NOT guarantee** that the same pattern or mission parameters will fly safely or identically at a different location, time, altitude, or firmware revision.
2. **Real-World Environmental, Hardware & Firmware Variations**:
   - **Atmospheric & Wind Variations**: Sustained winds, mechanical turbulence around structures, thermals, temperature extremes, and air density affect aircraft braking distance, turn overshoot radius, gimbal horizon stability, and battery discharge rates.
   - **GNSS, Compass & Barometric Drift**: Multipath interference near metal structures/towers, solar geomagnetic storms (KP index), and barometric pressure shifts during flight can cause horizontal Cross-Track Error (XTE) of several meters and vertical altitude drift.
   - **Geospatial & DEM Inaccuracies**: Satellite basemaps (Esri, Google, OSM) and Digital Elevation Models (Copernicus 30m, USGS 3DEP, LiDAR) may contain horizontal georeference shifts or outdated heights that do not reflect newly erected towers, cranes, guy wires, power lines, or tree canopy growth.
   - **OEM Firmware & Autopilot Behavior Changes**: DJI Fly and aircraft firmware updates may alter WPML interpretation, curved-turn corner radii, speed clamping, or RTH behavior without notice.
3. **Remote Pilot in Command (RPIC) Sole Responsibility**:
   - Pursuant to 14 CFR Part 107 (or applicable national aviation regulations), the RPIC is 100% responsible for preflight inspection, maintaining continuous Visual Line of Sight (VLOS), verifying physical obstacle clearance, and immediately aborting autonomous execution via the RC flight mode switch (`Pause` / `Sport` / `Normal`) if any unexpected motion occurs.

---

## 2. Universal Pre-Flight Field Safety Protocol

- **Synthetic / Rural Test Origin**: All repository documentation, screenshots, and reference test plans use Aalaapi Sky's default rural coordinates (`[41.3215, -88.9950]`, Utica, IL countryside) or normalized `(0, 0)` local grid offsets in strict compliance with the Zero-Sensitive-Information Policy (`AGENTS.md` Section 8).
- **Open Field Clearance**: Execute initial pattern verifications over an open, unobstructed field with zero trees, structures, or overhead wires within a 100m radius.
- **Failsafe & RTH Configuration**: Verify Global Safe RTH Altitude (Section 3) is set at least **15m higher** than the tallest surrounding obstacle, and confirm RC Signal Loss Action is set to `Return to Home (RTH)`.
- **Manual Override Readiness**: Keep your thumb on the physical RC **Flight Pause** button and mode switch throughout takeoff, Waypoint 1 entry, and tight turnarounds.

---

## 3. Automated Post-Flight Telemetry Log Verification (`npm run irl:analyze`)

Aalaapi Sky includes an automated post-flight telemetry verifier in [`tools/qa/irl_tracker.js`](../tools/qa/irl_tracker.js) powered by [`tools/companion/log_decoder.js`](../tools/companion/log_decoder.js). After flying an IRL test mission, you can objectively verify all 6 phases by comparing the exported `.wpml`/`.kmz` against the aircraft's actual telemetry log (`.csv`, decrypted `.txt`, `.gpx`, or `.geojson`):

```bash
# 1. Check current IRL verification status & detect any modified pattern code hashes:
npm run irl:status

# 2. Automatically grade a post-flight telemetry log against a planned mission:
npm run irl:analyze -- --pattern double --plan path/to/waylines.wpml --log path/to/FlightRecord_decrypted.csv

# 3. Or manually check off a pattern after field verification:
npm run irl:check -- double --drone "DJI Mini 4 Pro" --fw "01.00.0600" --pilot "RPIC" --notes "All 6 phases nominal"
```

### Quantitative 6-Phase Telemetry Pass Criteria
| Phase | ID | Telemetry Metric Evaluated | Pass Threshold |
| :--- | :--- | :--- | :--- |
| **Phase 1** | `kmz_import` | Valid planned waypoints ($N \ge 2$) & actual telemetry samples ($M \ge 5$) | Mission loaded & executed |
| **Phase 2** | `entry_altitude` | Waypoint 1 approach distance $\Delta H_0$ & altitude error $\Delta Z_0$ | $\Delta H_0 \le 4.0\text{ m}$, $\Delta Z_0 \le 2.0\text{ m}$ |
| **Phase 3** | `geometry_path` | Waypoint Visit Completion %, $\text{XTE}_{\text{rms}}$, and $\Delta Z_{\text{rms}}$ | $\ge 90\%$ WPs visited, $\text{XTE}_{\text{rms}} \le 4.5\text{ m}$ (straight) / $8.0\text{ m}$ (curved), $\Delta Z_{\text{rms}} \le 2.0\text{ m}$ |
| **Phase 4** | `heading_gimbal` | Mean Gimbal Pitch Error $\Delta \theta$ & Mean Heading Error $\Delta \psi$ | $\Delta \theta \le 6.0^\circ$, $\Delta \psi \le 15.0^\circ$ |
| **Phase 5** | `capture_trigger` | Captured photo ratio & `stopAndShoot` shutter ground speed | $\ge 85\%$ planned photos; median shutter speed $\le 1.0\text{ m/s}$ (`stopAndShoot`) |
| **Phase 6** | `exit_rth` | Final waypoint approach $\Delta H_{N-1}$ & ending battery level | $\Delta H_{N-1} \le 5.0\text{ m}$, Ending Battery $\ge 15\%$ |

---

## 4. Live 26-Pattern IRL Verification Status Matrix

| # | Pattern ID | Pattern Name | Category | Status | Code Hash | Last Tested Ver | Drone / Firmware | Phases |
| :---: | :--- | :--- | :--- | :---: | :---: | :---: | :--- | :---: |
| 1 | `single` | **2D Map (Nadir Grid)** | Mapping & 3D | ⬜ `UNTESTED` | `2060d0169374` | — | — | `0/6` |
| 2 | `double` | **3D Splat (Double Grid)** | Mapping & 3D | ⬜ `UNTESTED` | `dd5cae736203` | — | — | `0/6` |
| 3 | `target-splat` | **Target Splat (Frustum Grid)** | Mapping & 3D | ⬜ `UNTESTED` | `0ec37c04a3ff` | — | — | `0/6` |
| 4 | `orbit` | **3D Object (Circular Orbit)** | Orbit & Structure | ⬜ `UNTESTED` | `64011bf49858` | — | — | `0/6` |
| 5 | `multi-orbit` | **3D Object (Multi-Tiered Orbit)** | Orbit & Structure | ⬜ `UNTESTED` | `0d54cef3c772` | — | — | `0/6` |
| 6 | `tower` | **3D Structure (Tower Audit)** | Orbit & Structure | ⬜ `UNTESTED` | `691c76eb56a7` | — | — | `0/6` |
| 7 | `vertical-facade` | **Vertical Facade (Planar Infrastructure)** | Orbit & Structure | ⬜ `UNTESTED` | `d8232774e98a` | — | — | `0/6` |
| 8 | `continuous-helix` | **Continuous Helix (Corkscrew Orbit)** | Orbit & Structure | ⬜ `UNTESTED` | `29e3be3b2fcb` | — | — | `0/6` |
| 9 | `star-pass` | **Star Pass (Cross-Hatch POI Inspection)** | Orbit & Structure | ⬜ `UNTESTED` | `2a4cf7306d93` | — | — | `0/6` |
| 10 | `photo-sphere` | **360° Pano (Photo Sphere)** | Creative & Pano | ⬜ `UNTESTED` | `e0584da7f38d` | — | — | `0/6` |
| 11 | `hyperlapse` | **Hyperlapse (Interval Time-Lapse)** | Creative & Pano | ⬜ `UNTESTED` | `61f3eadcbc2c` | — | — | `0/6` |
| 12 | `light-art` | **Light Art (Sky Painting / Long Exposure)** | Creative & Pano | ⬜ `UNTESTED` | `d918cec9dfee` | — | — | `0/6` |
| 13 | `grid-orbit-combo` | **2D + 3D Hybrid (Grid + Orbit Combo)** | Mapping & 3D | ⬜ `UNTESTED` | `ee49e925a455` | — | — | `0/6` |
| 14 | `grid-multi-orbit-combo` | **2D + 3D Hybrid (Grid + Multi-Orbit)** | Mapping & 3D | ⬜ `UNTESTED` | `5d8e10e013e4` | — | — | `0/6` |
| 15 | `freeform` | **Freeform Flight Plan (Manual Waypoints)** | Linear & Route | ⬜ `UNTESTED` | `1af7e6adb578` | — | — | `0/6` |
| 16 | `road-following` | **Road Following (Offset Path)** | Linear & Route | ⬜ `UNTESTED` | `e20683d1d303` | — | — | `0/6` |
| 17 | `corridor` | **Corridor Mapping (Multi-Pass Polyline)** | Linear & Route | ⬜ `UNTESTED` | `4ff8bc9f909e` | — | — | `0/6` |
| 18 | `exclusion-box` | **Exclusion Zone (Rectangular Box)** | Safety & GCP | ⬜ `UNTESTED` | `912ee3191092` | — | — | `0/6` |
| 19 | `exclusion-freeform` | **Exclusion Zone (Freeform Polygon)** | Safety & GCP | ⬜ `UNTESTED` | `3950f2668594` | — | — | `0/6` |
| 20 | `boundary-polygon` | **Boundary / Parcel (Drawing Layer)** | Safety & GCP | ⬜ `UNTESTED` | `49ed96c0dfa0` | — | — | `0/6` |
| 21 | `fiducial-markers` | **Fiducial / GCPs (ArUco / AprilTag Survey)** | Safety & GCP | ⬜ `UNTESTED` | `66a0acd7ab2e` | — | — | `0/6` |
| 22 | `dome-shell` | **Hemispherical Dome (3D Geodesic Shell)** | Orbit & Structure | ⬜ `UNTESTED` | `1a6a09ce38be` | — | — | `0/6` |
| 23 | `polygon-grid` | **Polygon Area Grid (Custom Survey)** | Mapping & 3D | ⬜ `UNTESTED` | `867bcbae0dc0` | — | — | `0/6` |
| 24 | `sar-search` | **Search & Rescue (Expanding Square / Sector)** | Safety & GCP | ⬜ `UNTESTED` | `2d1771fe8427` | — | — | `0/6` |
| 25 | `perimeter-patrol` | **Perimeter Patrol (Closed Boundary Loop)** | Linear & Route | ⬜ `UNTESTED` | `0b8ae872cd00` | — | — | `0/6` |
| 26 | `cinematic-reveal` | **Cinematic Reveal (Dronie / Boomerang)** | Creative & Pano | ⬜ `UNTESTED` | `952ac2e23166` | — | — | `0/6` |

---

## 5. Pattern-by-Pattern Field Test Plans (All 26 Flight Patterns)

### Category A: Mapping & 3D Surveys

#### `single` — 2D Map (Nadir Grid)
- **Current Status:** ⬜ `UNTESTED` | **Generator Hash:** `2060d0169374` (`src/patterns/PatternGenerators.js` -> `generateGridCoordinates`)
- **Recommended Safe Field Parameters:** Origin `[41.3215, -88.9950]`, `altitudeM: 50`, `widthM: 80`, `heightM: 80`, `rotationDeg: 0`, `speedMps: 6`, `gimbalPitchDeg: -90`, `captureMode: continuous`, `headingMode: followWayline`, `pathMode: straight`, `frontOverlapPct: 75`, `sideOverlapPct: 70`, `turnaroundOvershootM: 10`
- **6-Phase Field Verification Checklist:**
  - [ ] **Phase 1: KMZ / WPML Export & RC 2 Import**: Export KMZ and load into DJI Fly / RC 2; verify lawn-mower line count and turnaround overshoot nodes.
  - [ ] **Phase 2: Takeoff, Entry Transition & Target AGL Stabilization**: Launch and verify climb to 50m AGL (±1.5m) before entering southern/northern entry overshoot waypoint.
  - [ ] **Phase 3: 3D Path Geometry, Turn Mode & Speed Adherence**: Confirm parallel N-S survey lines maintain computed line spacing and 6.0 m/s cruise speed.
  - [ ] **Phase 4: Aircraft Heading / Yaw Lock & Gimbal Pitch Tracking**: Verify aircraft nose tracks forward wayline heading (0° / 180°) and gimbal locks at -90° true nadir.
  - [ ] **Phase 5: Camera Shutter / Interval / Action Group Execution**: Verify continuous distance-interval shutter fires evenly along survey lines and suppresses photos on turnaround overshoot segments.
  - [ ] **Phase 6: Final Waypoint Completion, Manual Pause Check & Safe RTH**: Confirm mission completes final line, executes configured Finish Action (RTH at safe ceiling), and responds to RC Pause.
- **Edge-Case & Safety Watchout:** Verify that turnaround overshoot waypoints (isTurnaroundPoint: true, skipPhoto: true) allow the gimbal to level out after 180° turns before re-entering the survey boundary.

#### `double` — 3D Splat (Double Grid)
- **Current Status:** ⬜ `UNTESTED` | **Generator Hash:** `dd5cae736203` (`src/patterns/PatternGenerators.js` -> `generateGridCoordinates`)
- **Recommended Safe Field Parameters:** Origin `[41.3215, -88.9950]`, `altitudeM: 50`, `widthM: 70`, `heightM: 70`, `rotationDeg: 0`, `speedMps: 5`, `gimbalPitchDeg: -60`, `captureMode: continuous`, `headingMode: followWayline`, `pathMode: straight`, `frontOverlapPct: 75`, `sideOverlapPct: 70`, `turnaroundOvershootM: 10`
- **6-Phase Field Verification Checklist:**
  - [ ] **Phase 1: KMZ / WPML Export & RC 2 Import**: Export Double Grid KMZ and verify both Pass 1 (N-S) and Pass 2 (E-W) orthogonal crosshatch passes appear on RC 2.
  - [ ] **Phase 2: Takeoff, Entry Transition & Target AGL Stabilization**: Verify ascent to 50m AGL and smooth entry into Pass 1 Line 0.
  - [ ] **Phase 3: 3D Path Geometry, Turn Mode & Speed Adherence**: Verify seamless corner junction from Pass 1 final waypoint directly into Pass 2 Line 0 without diagonal deadhead transit across the grid.
  - [ ] **Phase 4: Aircraft Heading / Yaw Lock & Gimbal Pitch Tracking**: Confirm 90° yaw rotation at Pass 1 -> Pass 2 transition and steady -60° oblique gimbal pitch on all four compass headings.
  - [ ] **Phase 5: Camera Shutter / Interval / Action Group Execution**: Confirm oblique photos fire across both orthogonal passes with zero duplicate trigger at the Pass 1/Pass 2 corner junction.
  - [ ] **Phase 6: Final Waypoint Completion, Manual Pause Check & Safe RTH**: Verify RTH initiation after Pass 2 completion with >= 20% battery margin.
- **Edge-Case & Safety Watchout:** Watch the Pass 1 -> Pass 2 corner transition: aircraft must rotate 90° and settle before starting perpendicular pass.

#### `target-splat` — Target Splat (Frustum Grid)
- **Current Status:** ⬜ `UNTESTED` | **Generator Hash:** `0ec37c04a3ff` (`src/3d/GeometryBuilder.js` -> `generateTargetSplatCoordinates`)
- **Recommended Safe Field Parameters:** Origin `[41.3215, -88.9950]`, `altitudeM: 45`, `widthM: 80`, `heightM: 80`, `targetRadiusM: 20`, `targetHeightM: 8`, `speedMps: 4.5`, `gimbalPitchDeg: -45`, `captureMode: continuous`, `headingMode: followWayline`, `pathMode: straight`, `framingMode: balanced`
- **6-Phase Field Verification Checklist:**
  - [ ] **Phase 1: KMZ / WPML Export & RC 2 Import**: Export Target Splat mission (`balanced` framing) and verify pruned outer lines and lead-in offsets on RC 2.
  - [ ] **Phase 2: Takeoff, Entry Transition & Target AGL Stabilization**: Confirm climb to 45m AGL and entry at optical lead-in standoff distance.
  - [ ] **Phase 3: 3D Path Geometry, Turn Mode & Speed Adherence**: Verify survey lines terminate once camera frustum passes the target volume (no wasted trailing flight lines).
  - [ ] **Phase 4: Aircraft Heading / Yaw Lock & Gimbal Pitch Tracking**: Confirm -45° oblique gimbal pitch keeps the central 20m radius target framed during approach legs.
  - [ ] **Phase 5: Camera Shutter / Interval / Action Group Execution**: Verify photos trigger only while the 3D frustum intersects the target cylinder/polygon.
  - [ ] **Phase 6: Final Waypoint Completion, Manual Pause Check & Safe RTH**: If optional Perimeter Orbit Pass is enabled, verify clean transition to perimeter ring before RTH.
- **Edge-Case & Safety Watchout:** Verify lead-up auto-pruning does not clip the near edge of the target roof at -45° pitch.

#### `grid-orbit-combo` — 2D + 3D Hybrid (Grid + Orbit Combo)
- **Current Status:** ⬜ `UNTESTED` | **Generator Hash:** `ee49e925a455` (`src/patterns/PatternGenerators.js` -> `generateGridOrbitComboCoordinates, generateCircularGridCoordinates`)
- **Recommended Safe Field Parameters:** Origin `[41.3215, -88.9950]`, `altitudeM: 50`, `radiusM: 35`, `rotationDeg: 0`, `speedMps: 5`, `gimbalPitchDeg: -55`, `captureMode: continuous`, `pathMode: curved`, `frontOverlapPct: 75`, `sideOverlapPct: 70`
- **6-Phase Field Verification Checklist:**
  - [ ] **Phase 1: KMZ / WPML Export & RC 2 Import**: Export Hybrid Grid + Orbit KMZ; verify circular-clipped top grid followed by outer perimeter orbit ring.
  - [ ] **Phase 2: Takeoff, Entry Transition & Target AGL Stabilization**: Verify climb to 50m AGL and entry into circular-clipped lawn-mower grid.
  - [ ] **Phase 3: 3D Path Geometry, Turn Mode & Speed Adherence**: Confirm seamless transition from the last grid line directly onto the outer perimeter orbit ring.
  - [ ] **Phase 4: Aircraft Heading / Yaw Lock & Gimbal Pitch Tracking**: Verify heading switches cleanly from `followWayline` (during top grid) to `towardCenter` (during perimeter orbit).
  - [ ] **Phase 5: Camera Shutter / Interval / Action Group Execution**: Confirm continuous photo capture across both the top grid and perimeter orbit.
  - [ ] **Phase 6: Final Waypoint Completion, Manual Pause Check & Safe RTH**: Verify RTH after completing the 360° perimeter ring.
- **Edge-Case & Safety Watchout:** Verify per-waypoint heading mode transition between the last grid waypoint and first orbit waypoint does not cause yaw spin error.

#### `grid-multi-orbit-combo` — 2D + 3D Hybrid (Grid + Multi-Orbit)
- **Current Status:** ⬜ `UNTESTED` | **Generator Hash:** `5d8e10e013e4` (`src/patterns/PatternGenerators.js` -> `generateGridMultiOrbitComboCoordinates, generateCircularGridCoordinates`)
- **Recommended Safe Field Parameters:** Origin `[41.3215, -88.9950]`, `minAltitudeM: 25`, `maxAltitudeM: 55`, `tiers: 2`, `radiusM: 35`, `rotationDeg: 0`, `speedMps: 5`, `gimbalPitchDeg: -55`, `captureMode: continuous`, `pathMode: curved`
- **6-Phase Field Verification Checklist:**
  - [ ] **Phase 1: KMZ / WPML Export & RC 2 Import**: Export Multi-Hybrid KMZ; verify top circular grid plus multi-tier descending perimeter rings.
  - [ ] **Phase 2: Takeoff, Entry Transition & Target AGL Stabilization**: Confirm entry at 55m max altitude for top grid pass.
  - [ ] **Phase 3: 3D Path Geometry, Turn Mode & Speed Adherence**: Verify top grid completes at 55m, followed by descending perimeter orbit rings (55m -> 25m).
  - [ ] **Phase 4: Aircraft Heading / Yaw Lock & Gimbal Pitch Tracking**: Confirm `followWayline` on top grid transitions to `towardCenter` inward lock across all descending orbit tiers.
  - [ ] **Phase 5: Camera Shutter / Interval / Action Group Execution**: Verify continuous shutter triggers across top grid and all orbit tiers.
  - [ ] **Phase 6: Final Waypoint Completion, Manual Pause Check & Safe RTH**: Confirm vertical climb from lowest orbit tier (25m) to safe RTH ceiling upon completion.
- **Edge-Case & Safety Watchout:** Check inter-tier descent transitions for smooth altitude ramping and constant radial standoff.

#### `polygon-grid` — Polygon Area Grid (Custom Survey)
- **Current Status:** ⬜ `UNTESTED` | **Generator Hash:** `867bcbae0dc0` (`src/patterns/PatternGenerators.js` -> `generatePolygonGridCoordinates, computeOptimalPolygonSweepAngle`)
- **Recommended Safe Field Parameters:** Origin `[41.3215, -88.9950]`, `altitudeM: 50`, `verticesCount: 5`, `autoSweepAngle: true`, `gridPassMode: single`, `speedMps: 6`, `gimbalPitchDeg: -90`, `captureMode: continuous`, `headingMode: followWayline`, `pathMode: straight`, `frontOverlapPct: 75`, `sideOverlapPct: 70`
- **6-Phase Field Verification Checklist:**
  - [ ] **Phase 1: KMZ / WPML Export & RC 2 Import**: Define a 5-vertex irregular polygon, enable Auto Sweep Angle, and export KMZ to RC 2.
  - [ ] **Phase 2: Takeoff, Entry Transition & Target AGL Stabilization**: Verify climb to 50m AGL at first clipped polygon edge entry point.
  - [ ] **Phase 3: 3D Path Geometry, Turn Mode & Speed Adherence**: Confirm lawn-mower lines clip strictly to the polygon perimeter (ray-casting intersection) and align parallel to the longest polygon edge to minimize turnarounds.
  - [ ] **Phase 4: Aircraft Heading / Yaw Lock & Gimbal Pitch Tracking**: Verify aircraft heading aligns with the computed optimal sweep angle and gimbal holds -90° nadir (or -60° in double-pass mode).
  - [ ] **Phase 5: Camera Shutter / Interval / Action Group Execution**: Confirm photos fire only inside the polygon interior and suppress triggers on exterior boundary transition segments.
  - [ ] **Phase 6: Final Waypoint Completion, Manual Pause Check & Safe RTH**: Confirm clean RTH from final clipped survey segment.
- **Edge-Case & Safety Watchout:** Test L-shaped / concave polygons: when a sweep line intersects the polygon multiple times, verify transit across the exterior gap sets `skipPhoto: true`.

### Category B: Orbit & 3D Structure Inspections

#### `orbit` — 3D Object (Circular Orbit)
- **Current Status:** ⬜ `UNTESTED` | **Generator Hash:** `64011bf49858` (`src/patterns/PatternGenerators.js` -> `generateOrbitCoordinates`)
- **Recommended Safe Field Parameters:** Origin `[41.3215, -88.9950]`, `altitudeM: 40`, `radiusM: 30`, `speedMps: 4`, `gimbalPitchDeg: -45`, `captureMode: continuous`, `headingMode: towardCenter`, `pathMode: curved`, `frontOverlapPct: 75`
- **6-Phase Field Verification Checklist:**
  - [ ] **Phase 1: KMZ / WPML Export & RC 2 Import**: Load Circular Orbit KMZ on RC 2; verify circular ring waypoints and curved turn radius tags.
  - [ ] **Phase 2: Takeoff, Entry Transition & Target AGL Stabilization**: Confirm climb to 40m AGL and tangent entry onto the 30m radius circumference.
  - [ ] **Phase 3: 3D Path Geometry, Turn Mode & Speed Adherence**: Verify smooth coordinated banking (`curved` path mode) around the 360° circumference at constant 30m standoff.
  - [ ] **Phase 4: Aircraft Heading / Yaw Lock & Gimbal Pitch Tracking**: Confirm nose (`towardCenter`) and -45° gimbal remain locked on the central POI `[41.3215, -88.9950]` throughout 360° rotation.
  - [ ] **Phase 5: Camera Shutter / Interval / Action Group Execution**: Verify angular photo spacing captures evenly spaced inward-facing frames around the full circle.
  - [ ] **Phase 6: Final Waypoint Completion, Manual Pause Check & Safe RTH**: Confirm orbit closes cleanly at 360° and executes RTH without spiraling inward.
- **Edge-Case & Safety Watchout:** Check crosswind yaw crabbing: gimbal yaw compensation should keep the central POI centered within ±8°.

#### `multi-orbit` — 3D Object (Multi-Tiered Orbit)
- **Current Status:** ⬜ `UNTESTED` | **Generator Hash:** `0d54cef3c772` (`src/patterns/PatternGenerators.js` -> `generateMultiOrbitCoordinates`)
- **Recommended Safe Field Parameters:** Origin `[41.3215, -88.9950]`, `minAltitudeM: 25`, `maxAltitudeM: 55`, `tiers: 3`, `descentOrder: max-to-min`, `radiusM: 30`, `speedMps: 4`, `gimbalPitchDeg: -45`, `captureMode: continuous`, `headingMode: towardCenter`, `pathMode: curved`
- **6-Phase Field Verification Checklist:**
  - [ ] **Phase 1: KMZ / WPML Export & RC 2 Import**: Export 3-tier Multi-Orbit (`max-to-min`) and verify 3 stacked elevation rings (55m, 40m, 25m) on RC 2.
  - [ ] **Phase 2: Takeoff, Entry Transition & Target AGL Stabilization**: Verify initial climb to top ring (55m AGL) before entering orbit.
  - [ ] **Phase 3: 3D Path Geometry, Turn Mode & Speed Adherence**: Confirm smooth step-down altitude transitions (55m -> 40m -> 25m) between completed 360° rings.
  - [ ] **Phase 4: Aircraft Heading / Yaw Lock & Gimbal Pitch Tracking**: Verify continuous inward `towardCenter` yaw lock and tier-adjusted pitch across all 3 rings.
  - [ ] **Phase 5: Camera Shutter / Interval / Action Group Execution**: Confirm photo capture across all 3 tiers without missed triggers during inter-tier descent.
  - [ ] **Phase 6: Final Waypoint Completion, Manual Pause Check & Safe RTH**: Verify RTH climbs back to safe RTH ceiling from the lowest tier (25m) before returning home.
- **Edge-Case & Safety Watchout:** Top-down (`max-to-min`) order avoids rotor downwash dust; verify RTH climbs vertically before horizontal transit from low tier.

#### `tower` — 3D Structure (Tower Audit)
- **Current Status:** ⬜ `UNTESTED` | **Generator Hash:** `691c76eb56a7` (`src/patterns/PatternGenerators.js` -> `generateTowerCoordinates`)
- **Recommended Safe Field Parameters:** Origin `[41.3215, -88.9950]`, `towerRadiusM: 15`, `guyWireBufferM: 10`, `minHeightM: 20`, `maxHeightM: 60`, `tiers: 3`, `direction: horizontal`, `speedMps: 2.5`, `gimbalPitchDeg: -15`, `captureMode: stopAndShoot`, `headingMode: towardCenter`, `pathMode: straight`
- **6-Phase Field Verification Checklist:**
  - [ ] **Phase 1: KMZ / WPML Export & RC 2 Import**: Load Tower Audit KMZ; verify total effective standoff equals Tower Radius (15m) + Guy-Wire Buffer (10m) = 25m.
  - [ ] **Phase 2: Takeoff, Entry Transition & Target AGL Stabilization**: Confirm entry at top tier (60m AGL) at full 25m buffered radial standoff.
  - [ ] **Phase 3: 3D Path Geometry, Turn Mode & Speed Adherence**: Verify horizontal rings (or vertical columns) never encroach inside the 25m safety cylinder.
  - [ ] **Phase 4: Aircraft Heading / Yaw Lock & Gimbal Pitch Tracking**: Verify inward `towardCenter` heading lock and -15° shallow inspection pitch.
  - [ ] **Phase 5: Camera Shutter / Interval / Action Group Execution**: Verify `stopAndShoot` halts aircraft completely (ground speed <= 0.5 m/s) and settles before firing each inspection photo.
  - [ ] **Phase 6: Final Waypoint Completion, Manual Pause Check & Safe RTH**: Confirm vertical climb above `maxHeightM` (60m + buffer) before horizontal RTH transit.
- **Edge-Case & Safety Watchout:** CRITICAL: Never fly near real guyed towers without physically verifying guy-wire anchor radii and setting Guy-Wire Buffer >= 10m.

#### `vertical-facade` — Vertical Facade (Planar Infrastructure)
- **Current Status:** ⬜ `UNTESTED` | **Generator Hash:** `d8232774e98a` (`src/patterns/PatternGenerators.js` -> `generateVerticalFacadeCoordinates`)
- **Recommended Safe Field Parameters:** Origin `[41.3215, -88.9950]`, `facadeWidthM: 40`, `minAltM: 15`, `maxAltM: 40`, `standoffM: 15`, `rotationDeg: 0`, `rasterOrder: horizontal`, `speedMps: 2.5`, `gimbalPitchDeg: 0`, `captureMode: stopAndShoot`, `headingMode: fixed`, `pathMode: straight`
- **6-Phase Field Verification Checklist:**
  - [ ] **Phase 1: KMZ / WPML Export & RC 2 Import**: Export Vertical Facade KMZ and confirm vertical 2D planar wall grid loads in DJI Fly.
  - [ ] **Phase 2: Takeoff, Entry Transition & Target AGL Stabilization**: Verify entry at 15m perpendicular standoff distance and initial tier altitude (40m or 15m).
  - [ ] **Phase 3: 3D Path Geometry, Turn Mode & Speed Adherence**: Confirm aircraft translates laterally and vertically within a flat plane parallel to the target wall (zero standoff drift).
  - [ ] **Phase 4: Aircraft Heading / Yaw Lock & Gimbal Pitch Tracking**: Verify aircraft heading stays locked perpendicular to the facade plane and gimbal pitch holds 0° horizontal.
  - [ ] **Phase 5: Camera Shutter / Interval / Action Group Execution**: Confirm `stopAndShoot` pause and shutter firing at each facade grid node.
  - [ ] **Phase 6: Final Waypoint Completion, Manual Pause Check & Safe RTH**: Verify safe lateral pull-back / climb to RTH altitude upon completing final facade pass.
- **Edge-Case & Safety Watchout:** Verify that rotating `grid-rotation` rotates both the vertical flight plane and the perpendicular camera normal vector identically.

#### `continuous-helix` — Continuous Helix (Corkscrew Orbit)
- **Current Status:** ⬜ `UNTESTED` | **Generator Hash:** `29e3be3b2fcb` (`src/patterns/PatternGenerators.js` -> `generateHelixCoordinates`)
- **Recommended Safe Field Parameters:** Origin `[41.3215, -88.9950]`, `startRadiusM: 30`, `endRadiusM: 20`, `startAltM: 55`, `endAltM: 20`, `loops: 2`, `direction: cw`, `speedMps: 3.5`, `gimbalPitchDeg: -40`, `captureMode: continuous`, `headingMode: towardCenter`, `pathMode: curved`
- **6-Phase Field Verification Checklist:**
  - [ ] **Phase 1: KMZ / WPML Export & RC 2 Import**: Load Continuous Helix KMZ; verify helical waypoint spiral with continuous curved path mode.
  - [ ] **Phase 2: Takeoff, Entry Transition & Target AGL Stabilization**: Verify entry at 55m start altitude and 30m start radius.
  - [ ] **Phase 3: 3D Path Geometry, Turn Mode & Speed Adherence**: Confirm smooth corkscrew descent from 55m to 20m while tapering radius from 30m to 20m over 2 full revolutions without stopping.
  - [ ] **Phase 4: Aircraft Heading / Yaw Lock & Gimbal Pitch Tracking**: Verify nose continuously tracks central POI (`towardCenter`) and pitch interpolates smoothly toward target.
  - [ ] **Phase 5: Camera Shutter / Interval / Action Group Execution**: Verify continuous distance-interval photo triggers fire smoothly along the spiral without braking jerk.
  - [ ] **Phase 6: Final Waypoint Completion, Manual Pause Check & Safe RTH**: Confirm safe climb to RTH ceiling from 20m end altitude.
- **Edge-Case & Safety Watchout:** Ensure curved turn radius does not exceed half the chord distance between adjacent helix nodes.

#### `star-pass` — Star Pass (Cross-Hatch POI Inspection)
- **Current Status:** ⬜ `UNTESTED` | **Generator Hash:** `2a4cf7306d93` (`src/patterns/PatternGenerators.js` -> `generateStarPassCoordinates`)
- **Recommended Safe Field Parameters:** Origin `[41.3215, -88.9950]`, `altitudeM: 45`, `radiusM: 35`, `spokes: 4`, `speedMps: 4.5`, `gimbalPitchDeg: -60`, `captureMode: continuous`, `headingMode: followWayline`, `pathMode: straight`
- **6-Phase Field Verification Checklist:**
  - [ ] **Phase 1: KMZ / WPML Export & RC 2 Import**: Export 4-spoke Star Pass KMZ; verify diametric chords intersecting over center `[41.3215, -88.9950]` and perimeter connector chords.
  - [ ] **Phase 2: Takeoff, Entry Transition & Target AGL Stabilization**: Verify climb to 45m AGL at Spoke 1 outer perimeter entry point.
  - [ ] **Phase 3: 3D Path Geometry, Turn Mode & Speed Adherence**: Confirm straight diametric passes fly directly across the central POI and perimeter transitions connect smoothly to the next spoke azimuth.
  - [ ] **Phase 4: Aircraft Heading / Yaw Lock & Gimbal Pitch Tracking**: Verify aircraft heading aligns with each radial spoke azimuth and gimbal holds -60° oblique pitch.
  - [ ] **Phase 5: Camera Shutter / Interval / Action Group Execution**: Verify photos fire along each diametric pass over the POI and suppress unnecessary shots on outer perimeter turn chords.
  - [ ] **Phase 6: Final Waypoint Completion, Manual Pause Check & Safe RTH**: Confirm RTH after completing final radial spoke.
- **Edge-Case & Safety Watchout:** Verify multi-aspect illumination across all spoke azimuths (0°, 45°, 90°, 135°) without yaw oscillation at spoke entry.

#### `dome-shell` — Hemispherical Dome (3D Geodesic Shell)
- **Current Status:** ⬜ `UNTESTED` | **Generator Hash:** `1a6a09ce38be` (`src/patterns/PatternGenerators.js` -> `generateDomeShellCoordinates`)
- **Recommended Safe Field Parameters:** Origin `[41.3215, -88.9950]`, `baseAltitudeM: 10`, `standoffRadiusM: 30`, `elevationTiers: 3`, `zenithCap: true`, `descentOrder: max-to-min`, `speedMps: 4`, `captureMode: continuous`, `headingMode: towardCenter`, `pathMode: curved`
- **6-Phase Field Verification Checklist:**
  - [ ] **Phase 1: KMZ / WPML Export & RC 2 Import**: Export Hemispherical Dome KMZ ($R = 30\text{m}$, 3 tiers, Zenith Cap enabled, `max-to-min`) and verify on RC 2.
  - [ ] **Phase 2: Takeoff, Entry Transition & Target AGL Stabilization**: Confirm entry at Zenith Cap ($z = z_0 + R = 40\text{m}$ AGL) directly over the subject centroid.
  - [ ] **Phase 3: 3D Path Geometry, Turn Mode & Speed Adherence**: Verify each descending elevation ring expands in horizontal radius ($r = R\cos\theta$) while descending ($z = z_0 + R\sin\theta$) to maintain constant 30m 3D Euclidean standoff.
  - [ ] **Phase 4: Aircraft Heading / Yaw Lock & Gimbal Pitch Tracking**: Confirm Zenith Cap uses -90° nadir pitch and each descending tier automatically sets gimbal pitch to $-\theta$ while locked `towardCenter`.
  - [ ] **Phase 5: Camera Shutter / Interval / Action Group Execution**: Verify azimuth shot counts scale by $\cos\theta$ per ring (preventing polar over-clustering) and trigger cleanly.
  - [ ] **Phase 6: Final Waypoint Completion, Manual Pause Check & Safe RTH**: Confirm safe climb to RTH ceiling after completing lowest elevation ring.
- **Edge-Case & Safety Watchout:** Verify 3D Euclidean distance $\sqrt{r^2 + (z - z_0)^2}$ remains constant at $R = 30\text{m}$ (±1.5m) across all tiers.

### Category C: Linear & Route Missions

#### `freeform` — Freeform Flight Plan (Manual Waypoints)
- **Current Status:** ⬜ `UNTESTED` | **Generator Hash:** `1af7e6adb578` (`src/layers/LayerManager.js` -> `compileMissionGeometry`)
- **Recommended Safe Field Parameters:** Origin `[41.3215, -88.9950]`, `altitudeM: 45`, `speedMps: 5`, `gimbalPitchDeg: -45`, `captureMode: stopAndShoot`, `headingMode: followWayline`, `pathMode: straight`
- **6-Phase Field Verification Checklist:**
  - [ ] **Phase 1: KMZ / WPML Export & RC 2 Import**: Place 4 custom Freeform waypoints with Tier-3 per-waypoint overrides (custom altitude, speed, dwell, zoom) and export KMZ.
  - [ ] **Phase 2: Takeoff, Entry Transition & Target AGL Stabilization**: Verify climb to Waypoint 1 custom altitude override.
  - [ ] **Phase 3: 3D Path Geometry, Turn Mode & Speed Adherence**: Confirm aircraft follows exact manual coordinates and respects per-waypoint speed and turn-mode overrides.
  - [ ] **Phase 4: Aircraft Heading / Yaw Lock & Gimbal Pitch Tracking**: Verify per-waypoint custom heading angles and gimbal pitch overrides take precedence over Layer/Global defaults.
  - [ ] **Phase 5: Camera Shutter / Interval / Action Group Execution**: Verify per-waypoint camera actions (Take Photo, Start/Stop Recording, Camera Zoom, Hover Dwell) execute at exact nodes.
  - [ ] **Phase 6: Final Waypoint Completion, Manual Pause Check & Safe RTH**: Confirm final waypoint executes Finish Action cleanly.
- **Edge-Case & Safety Watchout:** Verify Three-Tier Hierarchy cascade: waypoints set to `inherit` resolve to Layer settings, while explicit overrides take precedence.

#### `road-following` — Road Following (Offset Path)
- **Current Status:** ⬜ `UNTESTED` | **Generator Hash:** `e20683d1d303` (`src/layers/LayerManager.js` -> `generateRoadFlightWaypoints`)
- **Recommended Safe Field Parameters:** Origin `[41.3215, -88.9950]`, `altitudeM: 45`, `roadOffsetM: 15`, `speedMps: 5.5`, `gimbalPitchDeg: auto`, `captureMode: continuous`, `headingMode: followWayline`, `pathMode: curved`
- **6-Phase Field Verification Checklist:**
  - [ ] **Phase 1: KMZ / WPML Export & RC 2 Import**: Draw/snap a 3-node road polyline with +15m right-hand lateral offset and export KMZ.
  - [ ] **Phase 2: Takeoff, Entry Transition & Target AGL Stabilization**: Confirm climb to 45m AGL and entry at offset start coordinate (not directly over road centerline).
  - [ ] **Phase 3: 3D Path Geometry, Turn Mode & Speed Adherence**: Verify parallel offset trajectory maintains constant +15m lateral separation around road bends.
  - [ ] **Phase 4: Aircraft Heading / Yaw Lock & Gimbal Pitch Tracking**: Verify `auto` road-focus gimbal pitch (`-atan2(45, 15) = -72°`) and inward/forward orientation keep road centered in frame.
  - [ ] **Phase 5: Camera Shutter / Interval / Action Group Execution**: Verify distance-interval photo triggers fire along the entire offset corridor.
  - [ ] **Phase 6: Final Waypoint Completion, Manual Pause Check & Safe RTH**: Confirm safe RTH from road endpoint.
- **Edge-Case & Safety Watchout:** Verify miter/bevel offset geometry at sharp road bends does not self-intersect or cross over the active roadway.

#### `corridor` — Corridor Mapping (Multi-Pass Polyline)
- **Current Status:** ⬜ `UNTESTED` | **Generator Hash:** `4ff8bc9f909e` (`src/patterns/PatternGenerators.js` -> `generateCorridorCoordinates`)
- **Recommended Safe Field Parameters:** Origin `[41.3215, -88.9950]`, `altitudeM: 60`, `corridorWidthM: 60`, `passes: 3`, `overshootM: 15`, `turnType: bulb`, `speedMps: 6.5`, `gimbalPitchDeg: -90`, `captureMode: continuous`, `headingMode: followWayline`, `pathMode: curved`
- **6-Phase Field Verification Checklist:**
  - [ ] **Phase 1: KMZ / WPML Export & RC 2 Import**: Export 3-pass Corridor Mapping KMZ (60m width, 15m overshoot, `bulb` turnarounds) and verify on RC 2.
  - [ ] **Phase 2: Takeoff, Entry Transition & Target AGL Stabilization**: Confirm climb to 60m AGL at Pass 1 entry overshoot waypoint.
  - [ ] **Phase 3: 3D Path Geometry, Turn Mode & Speed Adherence**: Verify 3 parallel offset swaths track the polyline centerline with smooth bulb turnaround loops at corridor ends.
  - [ ] **Phase 4: Aircraft Heading / Yaw Lock & Gimbal Pitch Tracking**: Verify aircraft nose aligns with each swath direction and gimbal maintains -90° nadir (or -60° oblique).
  - [ ] **Phase 5: Camera Shutter / Interval / Action Group Execution**: Confirm continuous photos fire along corridor swaths and pause (`skipPhoto: true`) during bulb turnaround loops.
  - [ ] **Phase 6: Final Waypoint Completion, Manual Pause Check & Safe RTH**: Verify RTH from the end of Pass 3.
- **Edge-Case & Safety Watchout:** At polyline vertex bends > 45°, verify outer swath miter clamping prevents excessive corner overshoot.

#### `perimeter-patrol` — Perimeter Patrol (Closed Boundary Loop)
- **Current Status:** ⬜ `UNTESTED` | **Generator Hash:** `0b8ae872cd00` (`src/patterns/PatternGenerators.js` -> `generatePerimeterPatrolCoordinates`)
- **Recommended Safe Field Parameters:** Origin `[41.3215, -88.9950]`, `altitudeM: 35`, `standoffOffsetM: 10`, `headingLock: inward`, `direction: cw`, `laps: 1`, `speedMps: 4.5`, `gimbalPitchDeg: -45`, `captureMode: continuous`, `pathMode: curved`
- **6-Phase Field Verification Checklist:**
  - [ ] **Phase 1: KMZ / WPML Export & RC 2 Import**: Define a 4-corner perimeter boundary with +10m outward standoff and `inward` heading lock; export KMZ.
  - [ ] **Phase 2: Takeoff, Entry Transition & Target AGL Stabilization**: Verify climb to 35m AGL at Vertex 1 offset coordinate.
  - [ ] **Phase 3: 3D Path Geometry, Turn Mode & Speed Adherence**: Confirm closed-loop trajectory traces the entire perimeter at a uniform +10m outward buffer and closes back to Vertex 1.
  - [ ] **Phase 4: Aircraft Heading / Yaw Lock & Gimbal Pitch Tracking**: Verify `inward` heading lock keeps the camera pointed +90° normal toward the fenceline/compound interior along each straight edge and corner.
  - [ ] **Phase 5: Camera Shutter / Interval / Action Group Execution**: Confirm continuous interval capture along all perimeter segments.
  - [ ] **Phase 6: Final Waypoint Completion, Manual Pause Check & Safe RTH**: Verify multi-lap counter (if laps > 1) and clean RTH upon final lap completion.
- **Edge-Case & Safety Watchout:** Verify winding-order normalization ensures positive offset (+10m) always expands outward regardless of CW/CCW vertex drawing order.

### Category D: Creative & Panoramic Media

#### `photo-sphere` — 360° Pano (Photo Sphere)
- **Current Status:** ⬜ `UNTESTED` | **Generator Hash:** `e0584da7f38d` (`src/patterns/PatternGenerators.js` -> `generatePhotoSphereCoordinates, calculatePhotoSphereOverlap`)
- **Recommended Safe Field Parameters:** Origin `[41.3215, -88.9950]`, `altitudeM: 45`, `speedMps: 3`, `shotsPerRing: 8`, `settlingTimeSec: 2`, `captureMode: stopAndShoot`, `pathMode: straight`
- **6-Phase Field Verification Checklist:**
  - [ ] **Phase 1: KMZ / WPML Export & RC 2 Import**: Export 360° Photo Sphere KMZ; verify multi-ring `wpml:actionGroup` sequence (Zenith +30°, Horizon 0°, Lower -30°, Nadir -90°) loads on RC 2.
  - [ ] **Phase 2: Takeoff, Entry Transition & Target AGL Stabilization**: Confirm ascent to 45m AGL and stationary hover lock directly over center coordinate.
  - [ ] **Phase 3: 3D Path Geometry, Turn Mode & Speed Adherence**: Verify horizontal position holds stationary within ±0.5m during the entire spherical capture sequence.
  - [ ] **Phase 4: Aircraft Heading / Yaw Lock & Gimbal Pitch Tracking**: Verify procedural yaw rotation (`rotateYaw`) steps cleanly through all azimuths and gimbal pitches through all elevation rings.
  - [ ] **Phase 5: Camera Shutter / Interval / Action Group Execution**: Confirm settling hover pause (`hoverTime`) executes before every `takePhoto` action to prevent motion blur.
  - [ ] **Phase 6: Final Waypoint Completion, Manual Pause Check & Safe RTH**: Verify final Nadir (-90°) cap shot completes before RTH initiation.
- **Edge-Case & Safety Watchout:** In winds > 6 m/s, verify 2-second settling delay is sufficient for gimbal horizon leveling before shutter release.

#### `hyperlapse` — Hyperlapse (Interval Time-Lapse)
- **Current Status:** ⬜ `UNTESTED` | **Generator Hash:** `61f3eadcbc2c` (`src/patterns/PatternGenerators.js` -> `generateHyperlapseWaypoints`)
- **Recommended Safe Field Parameters:** Origin `[41.3215, -88.9950]`, `altitudeM: 40`, `speedMps: 1.5`, `intervalSec: 3`, `startPitchDeg: -20`, `endPitchDeg: -45`, `captureMode: continuous`, `headingMode: smoothTransition`, `pathMode: curved`
- **6-Phase Field Verification Checklist:**
  - [ ] **Phase 1: KMZ / WPML Export & RC 2 Import**: Export Hyperlapse KMZ; verify spline-interpolated waypoints and interval trigger actions load in DJI Fly.
  - [ ] **Phase 2: Takeoff, Entry Transition & Target AGL Stabilization**: Confirm climb to 40m AGL and smooth acceleration to 1.5 m/s cruise velocity.
  - [ ] **Phase 3: 3D Path Geometry, Turn Mode & Speed Adherence**: Verify ultra-smooth Catmull-Rom curved spline trajectory without braking or speed steps at intermediate nodes.
  - [ ] **Phase 4: Aircraft Heading / Yaw Lock & Gimbal Pitch Tracking**: Confirm `smoothTransition` yaw panning and linear/spline gimbal pitch interpolation (-20° -> -45°) across the path.
  - [ ] **Phase 5: Camera Shutter / Interval / Action Group Execution**: Verify constant 3-second time-interval photo triggers throughout transit.
  - [ ] **Phase 6: Final Waypoint Completion, Manual Pause Check & Safe RTH**: Confirm clean deceleration at final keyframe and safe RTH.
- **Edge-Case & Safety Watchout:** Ensure minimum waypoint spacing (>= 0.5m) and speed (>= 0.5 m/s) prevent DJI Fly curve radius clamping.

#### `light-art` — Light Art (Sky Painting / Long Exposure)
- **Current Status:** ⬜ `UNTESTED` | **Generator Hash:** `d918cec9dfee` (`src/patterns/PatternGenerators.js` -> `generateLightArtCoordinates, calculateLightArtRadiusForDuration`)
- **Recommended Safe Field Parameters:** Origin `[41.3215, -88.9950]`, `altitudeM: 35`, `safetyDeckFloorM: 15`, `radiusM: 25`, `tiltDeg: 45`, `speedMps: 3`, `captureMode: continuous`, `headingMode: followWayline`, `pathMode: curved`
- **6-Phase Field Verification Checklist:**
  - [ ] **Phase 1: KMZ / WPML Export & RC 2 Import**: Export Light Art KMZ; verify 3D tilted vector stroke coordinates and Ground Safety Deck floor clamping (>= 15m AGL).
  - [ ] **Phase 2: Takeoff, Entry Transition & Target AGL Stabilization**: Confirm climb to initial stroke vertex above 15m safety deck floor.
  - [ ] **Phase 3: 3D Path Geometry, Turn Mode & Speed Adherence**: Verify continuous spline velocity (3.0 m/s) along the 3D tilted canvas plane aligns with ground tripod camera exposure duration.
  - [ ] **Phase 4: Aircraft Heading / Yaw Lock & Gimbal Pitch Tracking**: Confirm smooth forward wayline tracking without abrupt yaw snaps at stroke vertices.
  - [ ] **Phase 5: Camera Shutter / Interval / Action Group Execution**: Verify continuous flight execution (and auxiliary beacon/LED visibility from ground tripod viewpoint).
  - [ ] **Phase 6: Final Waypoint Completion, Manual Pause Check & Safe RTH**: Confirm mission completes within target exposure window and climbs safely to RTH altitude.
- **Edge-Case & Safety Watchout:** CRITICAL: Even with 90° vertical canvas tilt, verify no waypoint ever drops below the 15m AGL Ground Safety Deck.

#### `cinematic-reveal` — Cinematic Reveal (Dronie / Boomerang)
- **Current Status:** ⬜ `UNTESTED` | **Generator Hash:** `952ac2e23166` (`src/patterns/PatternGenerators.js` -> `generateCinematicRevealCoordinates`)
- **Recommended Safe Field Parameters:** Origin `[41.3215, -88.9950]`, `cinematicMode: dronie`, `azimuthDeg: 180`, `startDistM: 8`, `endDistM: 45`, `startAltM: 12`, `endAltM: 40`, `poiAltM: 2`, `speedMps: 3`, `captureMode: continuous`, `headingMode: towardCenter`, `pathMode: curved`
- **6-Phase Field Verification Checklist:**
  - [ ] **Phase 1: KMZ / WPML Export & RC 2 Import**: Export Cinematic Reveal (`dronie` and `boomerang` modes) KMZ and verify smooth spline waypoints on RC 2.
  - [ ] **Phase 2: Takeoff, Entry Transition & Target AGL Stabilization**: Confirm safe entry at 12m start altitude and 8m horizontal standoff from POI.
  - [ ] **Phase 3: 3D Path Geometry, Turn Mode & Speed Adherence**: For Dronie, verify linear pull-back to 45m and climb to 40m along 180° azimuth; for Boomerang, verify eccentric oval orbit with altitude wave.
  - [ ] **Phase 4: Aircraft Heading / Yaw Lock & Gimbal Pitch Tracking**: Verify nose locks onto central POI (`towardCenter`) and gimbal pitch dynamically tracks $-\arctan2(z - z_{\text{POI}}, d)$ to keep subject dead-center.
  - [ ] **Phase 5: Camera Shutter / Interval / Action Group Execution**: Confirm continuous video / interval capture runs smoothly from start to finish without intermediate stops.
  - [ ] **Phase 6: Final Waypoint Completion, Manual Pause Check & Safe RTH**: Confirm smooth deceleration at apex waypoint and safe RTH.
- **Edge-Case & Safety Watchout:** Verify dynamic trigonometric pitch calculation prevents subject from drifting out of vertical frame during rapid ascent.

### Category E: Safety, Airspace & Spatial Control

#### `exclusion-box` — Exclusion Zone (Rectangular Box)
- **Current Status:** ⬜ `UNTESTED` | **Generator Hash:** `912ee3191092` (`src/layers/LayerManager.js` -> `filterWaypointsByExclusionZones`)
- **Recommended Safe Field Parameters:** Origin `[41.3215, -88.9950]`, `boxWidthM: 35`, `boxHeightM: 35`, `minAltM: 0`, `maxAltM: 65`, `clearanceBufferM: 5`
- **6-Phase Field Verification Checklist:**
  - [ ] **Phase 1: KMZ / WPML Export & RC 2 Import**: Place an `exclusion-box` layer (0m-65m ceiling) in the center of a 50m 2D Grid and export KMZ; verify zero waypoints inside the box.
  - [ ] **Phase 2: Takeoff, Entry Transition & Target AGL Stabilization**: Launch the parent grid mission at 50m AGL.
  - [ ] **Phase 3: 3D Path Geometry, Turn Mode & Speed Adherence**: Verify aircraft executes horizontal Dijkstra perimeter detour (or vertical climb-over detour at 65m + 5m = 70m) around the exclusion box.
  - [ ] **Phase 4: Aircraft Heading / Yaw Lock & Gimbal Pitch Tracking**: Verify smooth transit heading along detour vertices.
  - [ ] **Phase 5: Camera Shutter / Interval / Action Group Execution**: Confirm detour transit waypoints (`isExclusionDetour: true, skipPhoto: true`) do NOT fire redundant camera photos.
  - [ ] **Phase 6: Final Waypoint Completion, Manual Pause Check & Safe RTH**: Confirm normal mission completion and verify RTH ceiling is set above exclusion zone ceiling.
- **Edge-Case & Safety Watchout:** Verify both Horizontal Perimeter Detour and Vertical Climb-Over Detour (`findDetourPathOverZone`) maintain full clearance buffer.

#### `exclusion-freeform` — Exclusion Zone (Freeform Polygon)
- **Current Status:** ⬜ `UNTESTED` | **Generator Hash:** `3950f2668594` (`src/layers/LayerManager.js` -> `filterWaypointsByExclusionZones`)
- **Recommended Safe Field Parameters:** Origin `[41.3215, -88.9950]`, `verticesCount: 5`, `minAltM: 0`, `maxAltM: 70`, `clearanceBufferM: 5`
- **6-Phase Field Verification Checklist:**
  - [ ] **Phase 1: KMZ / WPML Export & RC 2 Import**: Draw a 5-vertex concave/convex `exclusion-freeform` polygon intersecting an active flight layer and export KMZ.
  - [ ] **Phase 2: Takeoff, Entry Transition & Target AGL Stabilization**: Launch mission and verify normal entry at target AGL.
  - [ ] **Phase 3: 3D Path Geometry, Turn Mode & Speed Adherence**: Confirm flight segments intersecting any polygon edge route cleanly around the buffered polygon vertices without cutting corners.
  - [ ] **Phase 4: Aircraft Heading / Yaw Lock & Gimbal Pitch Tracking**: Verify stable aircraft yaw through multi-segment polygon detour nodes.
  - [ ] **Phase 5: Camera Shutter / Interval / Action Group Execution**: Confirm zero camera triggers occur on polygon avoidance detour nodes.
  - [ ] **Phase 6: Final Waypoint Completion, Manual Pause Check & Safe RTH**: Confirm safe mission completion and RTH.
- **Edge-Case & Safety Watchout:** Test concave polygon indentations to verify segment-polygon collision check (`isSegmentCollidingWithPolygon`) prevents shortcutting across restricted airspace.

#### `boundary-polygon` — Boundary / Parcel (Drawing Layer)
- **Current Status:** ⬜ `UNTESTED` | **Generator Hash:** `49ed96c0dfa0` (`src/layers/LayerManager.js` -> `compileMissionGeometry`)
- **Recommended Safe Field Parameters:** Origin `[41.3215, -88.9950]`, `verticesCount: 4`, `elevationOffsetM: 0`
- **6-Phase Field Verification Checklist:**
  - [ ] **Phase 1: KMZ / WPML Export & RC 2 Import**: Create a 4-vertex `boundary-polygon` parcel layer alongside an active survey layer; verify the boundary layer itself exports 0 flight waypoints in `waylines.wpml`.
  - [ ] **Phase 2: Takeoff, Entry Transition & Target AGL Stabilization**: Verify acreage (`ac` / `ha`) and perimeter (`m` / `ft`) readouts match geodetic ground truth.
  - [ ] **Phase 3: 3D Path Geometry, Turn Mode & Speed Adherence**: Click "Sync from Boundary" on a `polygon-grid` layer and verify exact vertex transfer.
  - [ ] **Phase 4: Aircraft Heading / Yaw Lock & Gimbal Pitch Tracking**: Open 3D View and verify the parcel boundary renders as a ground-draped 3D ribbon.
  - [ ] **Phase 5: Camera Shutter / Interval / Action Group Execution**: Open Photo Inspector on a captured survey photo and verify the parcel boundary projects accurately onto the image plane.
  - [ ] **Phase 6: Final Waypoint Completion, Manual Pause Check & Safe RTH**: Verify Undo/Redo and project JSON export/import preserve all boundary vertices and styling.
- **Edge-Case & Safety Watchout:** Boundary layers are non-flying spatial reference layers; ensure they never inject phantom placemarks into exported WPML.

#### `fiducial-markers` — Fiducial / GCPs (ArUco / AprilTag Survey)
- **Current Status:** ⬜ `UNTESTED` | **Generator Hash:** `66a0acd7ab2e` (`src/vision/GcpEngine.js` -> `generateFiducialPrintableHtml, exportFiducialCoordinatesCsv`)
- **Recommended Safe Field Parameters:** Origin `[41.3215, -88.9950]`, `dictionary: APRILTAG_36h11`, `markerSizeCm: 60`, `markersCount: 4`
- **6-Phase Field Verification Checklist:**
  - [ ] **Phase 1: KMZ / WPML Export & RC 2 Import**: Place 4 Fiducial/GCP markers (`APRILTAG_36h11`) on the map; verify printable target sheet and GCP CSV export.
  - [ ] **Phase 2: Takeoff, Entry Transition & Target AGL Stabilization**: Deploy physical targets (or synthetic test calibration targets) and fly a 35m-50m nadir survey pass over them.
  - [ ] **Phase 3: 3D Path Geometry, Turn Mode & Speed Adherence**: Verify GCP range rings and HDOP/PDOP spatial distribution indicator on the 2D map.
  - [ ] **Phase 4: Aircraft Heading / Yaw Lock & Gimbal Pitch Tracking**: Confirm nadir (-90°) survey imagery captures clear, unblurred views of each fiducial target.
  - [ ] **Phase 5: Camera Shutter / Interval / Action Group Execution**: Ingest captured photos into Photo Inspector and verify automatic AprilTag/ArUco detection and pixel-to-ground offset (`varianceCm`) calculation.
  - [ ] **Phase 6: Final Waypoint Completion, Manual Pause Check & Safe RTH**: Confirm fiducial layer exports 0 flight waypoints into `waylines.wpml` while persisting in project archives.
- **Edge-Case & Safety Watchout:** Ensure target size (e.g., 60cm x 60cm) provides >= 15x15 pixels at the planned flight altitude GSD for reliable tag decoding.

#### `sar-search` — Search & Rescue (Expanding Square / Sector)
- **Current Status:** ⬜ `UNTESTED` | **Generator Hash:** `2d1771fe8427` (`src/patterns/PatternGenerators.js` -> `generateSarSearchCoordinates`)
- **Recommended Safe Field Parameters:** Origin `[41.3215, -88.9950]`, `altitudeM: 45`, `sarMode: expanding-square`, `trackSpacingM: 25`, `maxLegs: 8`, `bearingDeg: 0`, `speedMps: 5.5`, `gimbalPitchDeg: -45`, `captureMode: continuous`, `headingMode: followWayline`, `pathMode: straight`
- **6-Phase Field Verification Checklist:**
  - [ ] **Phase 1: KMZ / WPML Export & RC 2 Import**: Export both IAMSAR Expanding Square (ESS) and Sector Search (Victor Sierra) KMZ missions and verify geometry on RC 2.
  - [ ] **Phase 2: Takeoff, Entry Transition & Target AGL Stabilization**: Confirm aircraft flies directly to the Last Known Position (LKP) datum `[41.3215, -88.9950]` at 45m AGL to begin leg 1.
  - [ ] **Phase 3: 3D Path Geometry, Turn Mode & Speed Adherence**: For ESS, verify orthogonal 90° turns with leg lengths $d, d, 2d, 2d, 3d, 3d\dots$; for Sector Search, verify 3 equilateral sectors passing repeatedly through the central LKP datum.
  - [ ] **Phase 4: Aircraft Heading / Yaw Lock & Gimbal Pitch Tracking**: Confirm forward `followWayline` heading and -45° forward/oblique search gimbal angle.
  - [ ] **Phase 5: Camera Shutter / Interval / Action Group Execution**: Verify continuous optical/thermal interval capture across all search legs.
  - [ ] **Phase 6: Final Waypoint Completion, Manual Pause Check & Safe RTH**: Confirm immediate response to RC `Pause` (for target hover investigation) and safe RTH.
- **Edge-Case & Safety Watchout:** Verify straight point-to-point turn mode (`straight`) at ESS corners so the drone does not cut inside the outer search corners.

---

## 6. Post-Update Release IRL Test Plans Log

### [v1.209.0] Post-Update IRL Field Test Plan Policy, Tracking Framework, Automated Post-Flight Log Verifier & 26-Pattern Suite — 2026-10-30 ([Issue #201](https://github.com/bpawletz/Aalaapi-Sky/issues/201))
- **Status:** `PENDING_IRL_TEST` | **Affected Patterns:** `single`, `double`, `orbit`, `dome-shell`, `polygon-grid`, `sar-search`
- [ ] Export test mission KMZ/WPML at synthetic rural coordinates `[41.3215, -88.9950]` and verify clean import into DJI Fly / RC 2.
- [ ] Verify takeoff, climb to target AGL, and Waypoint 1 entry transition accuracy (±2.0m).
- [ ] Verify modified flight pattern / feature behavior matches expected 3D trajectory, heading, and gimbal pitch.
- [ ] Run post-flight telemetry log analysis (`npm run irl:analyze`) and confirm all 6 phases pass within tolerance.

---
*Auto-generated and synchronized by `tools/qa/irl_tracker.js` — Master Issue: [#202](https://github.com/bpawletz/Aalaapi-Sky/issues/202)*
