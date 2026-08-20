# Changelog

## [1.31.0] - 2026-08-20

### Added
- **DJI RC 2 Map Preview Generator & Auto-Sync (`map_preview/<UUID>/<UUID>.jpg`):** Aalaapi Sky now automatically renders a 400x300 JPG thumbnail preview of the flight route on mission export. The `rc2-sync` companion script automatically detects and transfers the thumbnail into the RC 2's `waypoint/map_preview/<UUID>/` directory so DJI Fly displays the graphical mission route preview on the controller screen.

## [1.30.0] - 2026-08-20

### Added
- **Real-Time DJI RC 2 Auto-Sync Companion (`rc2-sync.bat` / `rc2-sync.ps1`):** Added a one-click background sync script that detects connected DJI RC 2 controllers over USB MTP and watches the Downloads folder. Any exported or downloaded KMZ mission from Aalaapi Sky is instantly and automatically transferred into the controller's active waypoint mission folder with zero manual file explorer copying or renaming.

## [1.29.0] - 2026-08-20

### Added
- **Save to RC2:** New "Save to RC2" button (cyan, below Export KMZ) uses the browser's native Save As dialog (`showSaveFilePicker()` File System Access API) to write the KMZ with the correct UUID filename directly to the RC2's MTP storage. Eliminates the manual rename step entirely. Chrome's `id` parameter causes the dialog to remember the RC2 UUID folder across sessions, so subsequent saves open directly to the right location. Falls back to a correctly-named browser download if the MTP write is blocked by Windows. Only displayed in Chrome/Edge (browsers that support the File System Access API).
- **DJI Fly Waypoint UUID field:** New config field under "Export Drone Target". Enter the UUID once (`354A8F93-759C-42C3-A8D5-746F79C7622A` or your own) and it persists in `localStorage`. Auto-populated from the filename when importing a UUID-named KMZ.

## [1.28.1] - 2026-08-19

### Fixed
- **Default Drone Model Was Mavic 3 Enterprise (77):** The "Export Drone Target" dropdown defaulted to DJI Mavic 3 Enterprise (droneEnumValue 77) on every fresh page load. This caused enterprise-specific WPML tags (`wpml:payloadParam`, `wpml:payloadPitchControlMode`) to be embedded in all exported KMZ files. DJI Fly on a Mini 4 Pro does not support these enterprise tags and rejects the mission at upload (error when pressing Go or loading). Changed the default to DJI Mini 4 Pro (68), which is the most common consumer drone target. Enterprise drone users should manually select their model before exporting.

## [1.28.0] - 2026-08-14

### Fixed
- **Double Grid "Go" Button Error — Duplicate WPML `actionGroupId`**: The DJI WPML specification requires `wpml:actionGroupId` to be globally unique across the entire `waylines.wpml` file. The previous code reset this counter to `1` for each new waypoint, producing heavily duplicated IDs (e.g. `actionGroupId=1` appearing 40 times in a 40-waypoint double grid with 81 total action groups). DJI Fly rejects missions at upload when duplicate action group IDs are present at sufficient scale, causing the "error when pressing Go" on double grid missions. Fixed by promoting `actionGroupId` to a single global counter (like `actionId`) that never resets between waypoints.
- **Stop-and-Shoot 0-Second Hover — No Photo / RC2 Gimbal Error**: In stop-and-shoot capture mode, the 2-second hover auto-inject previously only triggered when a gimbal or heading reposition was detected. On straight 2D grid lines at constant pitch (-90°) and `followWayline` heading, no reposition is detected at waypoints 1+, so no stabilization delay was inserted. This caused the camera to fire before the gimbal settled, resulting in missed/blurry shots and a gimbal error on RC2. Fixed by enforcing a 2-second minimum hover at **every** stop-and-shoot waypoint regardless of repositioning, ensuring consistent gimbal stabilization before each camera trigger.

## [1.27.11] - 2026-08-10

### Fixed
- **2D Grid / Double Grid "Dance" — Gimbal Pitch Override**: `<wpml:waypointGimbalHeadingParam>` was being emitted with a hardcoded `waypointGimbalPitchAngle` of `0` at every `<Placemark>`. On the Mini 4 Pro the firmware applies this tag as the waypoint-level target gimbal angle, overriding the `gimbalRotate` action group that was correctly setting the mission pitch (e.g. `-90°` for nadir). The drone would arrive, the gimbalRotate action would fire, then the `waypointGimbalHeadingParam` would snap the gimbal back to horizontal, causing photos to be taken at the wrong angle and the drone to appear to "dance". Fixed by computing `effectivePitch` from the waypoint's own pitch or the global gimbal pitch and using it in the tag.
- **2D Grid / Double Grid Malformed First Placemark**: A stray 6-space literal between `${payloadParamXml}` and `${placemarksXml}` in the WPML Folder template string was prepending extra whitespace to the first `<Placemark>` element only. Although XML whitespace is generally insignificant, the DJI Fly app's strict XML parser treated the mis-indented first waypoint as structurally invalid, causing the 2D grid to execute with the first waypoint's actions skipped (the "dance") and the larger double grid to be rejected entirely. Fixed by removing the spurious spaces.

## [1.27.10] - 2026-08-09

### Fixed
- **Drone Model Selection**: Corrected the `droneEnumValue` for Mavic 3 Enterprise from `68` to `77` in the dropdown select options and default fallback settings, resolving flight execution failures (error after pressing Go) due to model mismatch on the drone controller.
- **Consumer Drone Compatibility**: Conditionally omitted the `<Folder>` block in `template.kml`, and the `<wpml:templateType>` and `<wpml:payloadParam>` tags in `waylines.wpml` for consumer drones (Mini 4 Pro and Air 3), resolving the "error after pressing Go" upload failures on the DJI Fly app.

## [1.27.9] - 2026-08-09

### Fixed
- **Coordinates Altitude Tag**: Added missing altitude component (the third parameter) in the `<coordinates>` tag of KML/WPML `<Point>` elements (e.g. `longitude,latitude,altitude`), resolving schema validation errors on strict flight controllers like the DJI RC 2 running DJI Pilot 2.

## [1.27.8] - 2026-08-09

### Fixed
- **Minimum Hover Enforcement for Repositioning**: Enforced a minimum 2-second hover duration (rather than just checking if hover is 0) during gimbal and yaw heading shifts. If the user overrides waypoint hover to a value less than 2 seconds (e.g. 1 second), it auto-escalates to 2 seconds to ensure adequate hardware stabilization time. Updated UI warnings, FPV simulation, KML generator, and stats calculations accordingly.

## [1.27.7] - 2026-08-09

### Fixed
- **Gimbal/Yaw Repositioning Dwell Time:** Reordered generated WPML KML action groups so that `hover` duration (if any) executes *before* `takePhoto` to ensure camera stabilization. Added automatic 2-second settling hover delays in KML export and 3D FPV simulation at waypoints where camera gimbal pitch or drone yaw heading changes under `stopAndShoot` mode if hover is set to `0`. Added a dynamic warning banner in the Waypoint Editor popup and updated stats calculations to include auto-settling delays.

## [1.27.6] - 2026-08-09

### Fixed
- **Unit Test Mocks:** Corrected weather panel and RC2 compliance tests in `index.test.js` to ensure overridden DOM helper mocks (specifically `document.getElementById` and `document.createElement`) are properly restored in `finally` blocks, preventing asynchronous background activity from triggering uncaught exceptions after tests complete.

## [1.27.5] - 2026-08-08

### Fixed
- **Duplicate Function Definition:** Removed a duplicate `syncDisplayValues()` function definition that was shadowing another and combined their functionality to ensure all UI elements and settings unit labels update correctly when unit preferences are changed.

## [1.27.4] - 2026-08-08

### Fixed
- **Enforced Heading Angle Enable (`waypointHeadingAngleEnable=1`)**: Fixed WPML export where `headingAngleEnable` was hardcoded to `0` for `followWayline` mode. When set to `0`, DJI Pilot 2 ignored `<wpml:waypointHeadingAngle>` during stationary hover/stop actions and defaulted to North (`0.0°`), causing 180° turnaround spin-dances on Southbound grid legs. Explicitly set `waypointHeadingAngleEnable` to `1` so the flight controller enforces the target wayline heading angle when stopping to take photos.

## [1.27.3] - 2026-08-08

### Fixed
- **NaN `waypointHeadingAngle` in `followWayline` Mode:** Waypoints generated without Cartesian `x`/`y` offsets (lat/lon-only grid waypoints) caused `getDefaultHeading()` to return `NaN`, which was written directly into `<wpml:waypointHeadingAngle>`. DJI controllers reject any mission containing `NaN` with an "error performing waypoint flight" when pressing Go. Fixed by computing the geodetic bearing directly from `lat`/`lon` coordinates instead of relying on `x`/`y` offsets.

## [1.27.2] - 2026-08-08

### Fixed
- **Mandatory `wpml:templateType` Tag in WPML Export:** Added the missing `<wpml:templateType>waypoint</wpml:templateType>` tag to the `<Folder>` element in both `template.kml` and `waylines.wpml`. Resolves mission upload/validation errors on DJI Pilot 2 and DJI controller apps when importing KMZ flight plans.

## [1.27.1] - 2026-08-08

### Fixed
- **2D Grid Return Leg Heading Rotation (180° Stationary Fallback Spin Dance):** Fixed a critical WPML export bug on reverse grid legs (Leg 2, Leg 4, etc.) during Nadir (-90° pitch) Stop & Shoot missions. Previously, `<wpml:waypointHeadingAngle>` was hardcoded to `0.0` (North) for all `followWayline` placemarks. When the drone stopped at a waypoint on a Southbound/Westbound leg (heading 180°) to take a photo and hover, zero movement velocity caused DJI Pilot 2 to fall back to the stationary target angle (`0.0° North`), forcing the aircraft to spin 180° to face North, take the photo, and spin 180° back to South when resuming flight. Fixed by dynamically calculating and exporting the wayline direction heading in `<wpml:waypointHeadingAngle>` for every placemark in `followWayline` mode.

## [1.27.0] - 2026-08-06

### Added
- **Global Hover Time:** New "Hover Time at Waypoints" slider (0–60s) in mission settings. Sets a default hover (dwell) duration at every waypoint. Per-waypoint overrides take priority; setting a waypoint's hover to 0 explicitly skips hover at that point. Affects WPML export, flight time estimates, FPV walkthrough preview, and mission splitting calculations.

## [1.26.15] - 2026-08-01

### Fixed
- **Gimbal Pan Axis Movement Limit on Straight-Line Flights:** The `gimbalRotate` WPML action was missing `gimbalYawRotateEnable` and `gimbalYawRotateAngle` parameters, leaving gimbal yaw uncontrolled. During straight-line 2D Grid flights, the abrupt 180° heading reversals at grid line crossings caused the gimbal pan motor to exceed its mechanical rotation range, triggering DJI's "Gimbal pan axis reached movement limit" error. Fixed by explicitly setting `gimbalYawRotateEnable=0` and `gimbalYawRotateAngle=0` to lock the gimbal yaw to center.

## [1.26.14] - 2026-07-26

### Fixed
- **Waypoint Markers Floating at Low Zoom:** When zoomed out below zoom 18, the pitch label (e.g. `-60°`) and camera cone/arrow SVG elements extend outside the Leaflet icon's 24×24px bounding box (`overflow: visible`), causing them to visually detach from their map-anchored dot position. Fixed by adding a `wp-zoomed-out` CSS class to the Leaflet container via `applyZoomGates()` at zoom < 18, which hides `.wp-pitch-label`, `.wp-camera-cone`, and `.wp-arrow` via CSS. At zoom ≥ 18 (close-up working view) all detail elements reappear normally.

## [1.26.13] - 2026-07-25

### Fixed
- **Accumulated `popupclose` Listeners Causing Revert/Save Failure:** Each time the waypoint editor popup opened, a new `revertChanges` closure was attached to `marker.on('popupclose', ...)`. Old closures accumulated on the marker and fired on popup close, overwriting saved or reverted state with stale values because each closure captured its own `isSaved = false` flag. Fixed by calling `marker.off('popupclose')` (clearing all listeners) before attaching the new listener on every popup open. Revert and Save now work correctly regardless of how many times the popup was previously opened.

## [1.26.12] - 2026-07-25

### Fixed
- **FPV & Map Selection Synchronization:** Automatically update `fpvProgressIndex` and refresh `updateFPVEditorUI()` whenever a waypoint is clicked, selected on map, or opened in popup. Ensures 3D FPV panel Nudge and Revert controls immediately act on the active selected waypoint.

## [1.26.11] - 2026-07-25

### Fixed
- **3D FPV Editor Panel Waypoint Revert:** Updated FPV panel Reset button (`#fpv-btn-reset-wp`) to invoke `updateGrid()` and set `isModified = false`, ensuring procedural grid waypoints revert cleanly to their origin coordinates when editing in 3D FPV view.

## [1.26.10] - 2026-07-25

### Fixed
- **Leaflet `popupclose` Event Overwrite on Waypoint Revert:** Added `isReverted` guard flag in `createWaypointEditorDOM` to prevent Leaflet's `popupclose` event handler (`revertChanges`) from overwriting restored origin coordinates when closing the popup after clicking **Revert**.

## [1.26.9] - 2026-07-25

### Added
- **Always-Visible Version Header Badge:** Added a prominent version badge (`v1.26.9`) directly above the `Beta` badge in the main sidebar header title so the application version is always visible at a glance without having to open the About modal.

### Fixed
- **Time-of-Center-Placement Waypoint Revert:** Fixed `updateGrid()` to freeze `origLat`, `origLon`, `origX`, `origY`, `origAlt`, `origPitch`, and `origHeading` as the procedural baseline at the time of grid center placement. Grabbing, moving, or nudging waypoints and clicking **Revert** snaps the waypoint 100% back to the origin calculated position.
- **Grid Center Movement Recalculation:** Moving the grid center point now clears custom waypoint position overrides (`clearWaypointCustomModifications()`) and recalculates all waypoints procedurally around the new center.

## [1.26.6] - 2026-07-25

### Fixed
- **Overlapping Waypoint Selection & Map Dragging:** Implemented `bringMarkerToFront()` to elevate the selected map marker's z-index (`zIndexOffset = 1000`) and apply a prominent cyan selection ring (`.marker-selected`). Clicking an item in the disambiguation popup or starting a drag now correctly targets the chosen waypoint rather than unselected overlapping markers beneath it.
- **Overlapping Items Editor Switcher:** Added an interactive "Overlapping Items" quick switcher dropdown directly inside the waypoint editor popup header, allowing users to effortlessly switch active focus between overlapping waypoints, road nodes, or center markers without closing the popup.
- **Road Node Overlap Disambiguation:** Integrated `roadWaypoints` into `getOverlappingItemsAt()` and attached `dragstart`, `popupopen`, and disambiguation click handlers to road node markers.

## [1.26.5] - 2026-07-25

### Fixed
- **Reopen Editor Popup Revert Fix:** Fixed `resetBtn` in [index.js](file:///c:/Users/bpawl/OneDrive/code/Aalaapi-Sky/index.js) so that reopening a previously edited and saved waypoint editor popup and clicking **Revert** cleanly restores all attributes (speed, altitude, pitch, heading, hover duration, coordinates) back to original pattern/mission baselines instead of falling back to saved custom values.

## [1.26.4] - 2026-07-25

### Fixed
- **Waypoint Revert Position & Marker Restoration:** Fixed `resetBtn` in the 2D waypoint editor popup to properly reposition Leaflet markers on the map back to original baseline coordinates (`origLat`, `origLon`). Ensured road control nodes in Road-Following mode cleanly revert to their original locations without corrupting cyan drone waypoints, and synchronized marker icons, tooltips, 3D scene representation, and FPV UI on revert.

## [1.26.3] - 2026-07-24

### Fixed
- **Waypoint Editor Revert Button Fix:** Corrected baseline fallback evaluation in `isChangedFromOrig` and the `resetBtn` click handler in [index.js](file:///c:/Users/bpawl/OneDrive/code/Aalaapi-Sky/index.js). Clicking **Revert** now reliably resets modified waypoint coordinates, altitude, pitch, speed, hover duration, and camera parameters back to their original unedited state.

## [1.26.2] - 2026-07-24

### Fixed
- **Screen Pixel Overlap Detection:** Switched `getOverlappingItemsAt` from 5-meter geographic distance to screen container pixel distance (`maxPixelDistance = 12px`). Nearby non-overlapping waypoints along the flight path no longer falsely trigger the disambiguation list.

## [1.26.1] - 2026-07-24

### Added & Improved
- **Overlapping Map Item Disambiguation Popup:** Implemented `getOverlappingItemsAt` distance checker and selection popup helper in [index.js](file:///c:/Users/bpawl/OneDrive/code/Aalaapi-Sky/index.js). When clicking a point where the Flight Mission Center and a Waypoint reside on the same spot, an interactive choice popup appears allowing you to select either **📍 Flight Mission Center** or **🔵 Waypoint #**.

## [1.26.0] - 2026-07-24

### Changed & Improved
- **Default Imperial (Feet `ft`) Units:** Set default measurement unit system configuration to Imperial (feet, `ft`, mph) across UI selects and fallback settings in [index.js](file:///c:/Users/bpawl/OneDrive/code/Aalaapi-Sky/index.js) and [index_template.html](file:///c:/Users/bpawl/OneDrive/code/Aalaapi-Sky/index_template.html).
- **Default Collapsed Accordions & Auto-Collapse Mode:** Updated sidebar control topics to start collapsed by default and enabled Accordion Auto-Collapse mode by default for cleaner, streamlined map navigation.

## [1.25.12] - 2026-07-24

### Fixed
- **Row Turn Gimbal Pan Limit Conflict Fix:**
  - Omitted redundant `<wpml:waypointGimbalHeadingParam>` from Placemarks when using `gimbalRotate` action groups in [index.js](file:///c:/Users/bpawl/OneDrive/code/Aalaapi-Sky/index.js), resolving issue where per-waypoint gimbal heading calculations conflicted with drone yaw rotation at the end of grid rows (past the first couple of waypoints) and triggered **Gimble pan axis reached movement limit error**.

## [1.25.11] - 2026-07-24

### Fixed
- **Gimbal Pan Axis Movement Limit Fix:**
  - Omitted `<wpml:gimbalYawRotateEnable>` and `<wpml:gimbalYawRotateAngle>` from `gimbalRotate` action parameters in [index.js](file:///c:/Users/bpawl/OneDrive/code/Aalaapi-Sky/index.js), resolving issue where DJI flight software evaluates pan axis limits against 0° world North and triggers **Gimble pan axis reached movement limit error**.

## [1.25.10] - 2026-07-24

### Fixed
- **Instant Gimbal Rotation & WPML Payload Pitch Control Fixes:**
  - Added `<wpml:payloadPitchControlMode>usePointSetting</wpml:payloadPitchControlMode>` inside `<wpml:payloadParam>` of `template.kml` and `waylines.wpml`, resolving issue where DJI drones default to manual pitch control and ignore waypoint gimbal pitch settings.
  - Replaced `gimbalEvenlyRotate` segment rotation with point-level `<wpml:actionActuatorFunc>gimbalRotate</wpml:actionActuatorFunc>` at Waypoint 0 (`actionGroupStartIndex = idx`, `actionGroupEndIndex = idx`) with full `<wpml:gimbalRotateMode>absoluteAngle</wpml:gimbalRotateMode>` and `<wpml:gimbalPitchRotateEnable>1</wpml:gimbalPitchRotateEnable>` parameters, ensuring camera pitch turns to -90° Nadir immediately at the 1st waypoint.
  - Omitted `<wpml:waypointGimbalYawAngle>` from `<wpml:waypointGimbalHeadingParam>` to prevent DJI controllers from reporting a **Max Pan Gimbal Error** when drone heading isn't facing North.
  - Enhanced `parseWPML` to fallback to `<wpml:waypointGimbalPitchAngle>` and propagate active pitch across all waypoints in imported KMZ missions.

## [1.25.9] - 2026-07-23

### Changed
- **Default Map Location Update (Historic Miami-Illinois / Rural Cornfield):**
  - Updated default map starting coordinates in [index.js](file:///c:/Users/bpawl/OneDrive/code/Aalaapi-Sky/index.js) from downtown Chicago to the historic Grand Village of the Illinois / Utica, IL area (41.3215° N, 88.9950° W), combining historic Miami-Illinois tribe settlement heritage with open rural cornfield terrain ideal for drone flight planning.

## [1.25.8] - 2026-07-23

### Fixed & Improved
- **JSZip `createFolders: false` Archive Fix:**
  - Passed `{ createFolders: false }` to JSZip file creation calls in [index.js](file:///c:/Users/bpawl/OneDrive/code/Aalaapi-Sky/index.js), preventing JSZip from creating empty `wpmz/` directory entries that caused Android zip extraction failures on DJI Fly / RC2.
- **About Modal Layout & Alignment Fix:**
  - Fixed unclosed HTML container tags in [index_template.html](file:///c:/Users/bpawl/OneDrive/code/Aalaapi-Sky/index_template.html#L857-L867) to properly align the title, Myaamia subtitle, and version tag badge inside the About modal header.
- **Settings Gear Modal Responsiveness Improvement:**
  - Added `display: none !important;` to `.modal-overlay.hidden` in [index.css](file:///c:/Users/bpawl/OneDrive/code/Aalaapi-Sky/index.css#L429-L433), eliminating hidden modal DOM render overhead and making the gear settings modal open instantly.

## [1.25.7] - 2026-07-23

### Fixed
- **DJI RC2 `gimbalEvenlyRotate` Action Group End Index Fix:**
  - Corrected `actionGroupEndIndex` for `gimbalEvenlyRotate` action groups from `idx` (zero-length waypoint segment) to `idx + 1` (valid wayline segment), resolving flight controller divide-by-zero trajectory validation errors upon pressing **GO**.

## [1.25.6] - 2026-07-23

### Fixed
- **DJI Fly "File Has No Waypoints" & Zip Extraction Fix:**
  - Removed explicit `wpmz/` directory entries from generated `.kmz` zip archives, resolving Android Zip unarchiver parsing errors that caused DJI Fly to fail loading waypoints.
  - Enabled explicit `DEFLATE` compression for exported KMZ archives in JSZip options, matching native DJI RC2 mission export standards 100%.

## [1.25.5] - 2026-07-23

### Fixed
- **DJI RC2 Mission Execution & Payload Action Fix:**
  - Updated WPML XML namespace from `http://www.dji.com/wpmz/1.0.2` to standard `http://www.uav.com/wpmz/1.0.2` across `template.kml` and `waylines.wpml`, preventing RC2 flight controller validation errors when pressing GO.
  - Changed gimbal rotation action actuator function from Enterprise `gimbalRotate` to RC2 consumer payload standard `gimbalEvenlyRotate` with `gimbalPitchRotateAngle`, eliminating mission execution failure on DJI RC2 / DJI Fly controllers.
  - Resolved `waypointHeadingAngleEnable` parameter conflicts when `followWayline` mode is selected.
  - Cleaned up redundant `waylines.wpml` Document header metadata.
- **Settings Modal & Unit System Selection Fix:**
  - Defined missing `syncDisplayValues()` function, eliminating uncaught JavaScript reference errors when opening Settings modal or toggling between Metric (meters, m/s) and Imperial (feet, mph).
  - Preserved and restored saved unit system preferences from `localStorage` on application startup.

## [1.25.4] - 2026-07-23

### Added & Fixed
- **3D View Auto-Resize Render Fix:** Added automatic `handle3DResize` triggers on modal open to ensure Three.js canvas resizes to container dimensions post-reflow, eliminating 0x0 canvas rendering.
- **Automated Git Push Scripts:** Added `push.sh` and `push.ps1` scripts to automate single-file compilation, unit test execution, git staging, committing, and pushing.

## [1.25.3] - 2026-07-23

### Fixed
- **About Modal Changelog Placement Markup Fix:** Fixed HTML div nesting in `index_template.html` so the Changelog section displays in its dedicated container below the safety warning grid instead of inside the *Know Your Emergency Abort* card.

## [1.25.2] - 2026-07-23

### Fixed
- **Left Nav Sync & Freeform Waypoint Save/Revert Controls:**
  - Dispatched native `change` event on `#grid-type` select element during popup conversion, ensuring the left navigation menu dropdown immediately syncs to display **Freeform**.
  - Always enabled **Save**, **Revert**, and **Delete** buttons in the Waypoint Editor popup for Freeform waypoints, enabling full parameter saving and restoration.

## [1.25.1] - 2026-07-23

### Fixed
- **Road Follow Popup Convert to Freeform Fix:** Fixed `convertToFreeformMission` to directly populate `generatedWaypoints` and trigger `redrawCurrentMission`, enabling full draggable marker creation and seamless conversion when clicking *Convert to Freeform Mode* from Road Follow popup editors. Saved `wp.mapMarker` reference across all standard waypoints.

## [1.25.0] - 2026-07-23

### Added & Changed
- **Road Follow Procedural Protection & Convert to Freeform Workflow:**
  - Prevented invalid individual coordinate edits on procedural Road Follow offset waypoints to preserve calculated road offset alignment.
  - Added **"Convert to Freeform Mode"** workflow: Clicking cyan drone waypoints or nudging in Road Follow mode displays an informative guidance banner with a one-click button to convert the calculated flight plan into an unconstrained, fully editable Freeform mission.

## [1.24.3] - 2026-07-23

### Fixed
- **Road Follow Baseline Coordinate Preservation:** Fixed `recalculateRoadOffsetPath` so `origLat`, `origLon`, `origX`, `origY` baseline coordinates are preserved once initialized, preventing custom nudged positions from resetting back to original road offsets during subsequent redraws or saves.

## [1.24.2] - 2026-07-23

### Fixed
- **Road Follow Multi-Waypoint Nudge & Uncaught Heading Exception:** Fixed `recalculateRoadOffsetPath` to use a clamped `roadNode` reference for intermediate drone waypoints (e.g. Waypoint 3) when `generatedWaypoints.length > roadWaypoints.length`. Added safe formatting for null/undefined heading values in Leaflet tooltips to prevent uncaught exceptions when nudging intermediate waypoints.

## [1.24.1] - 2026-07-23

### Fixed
- **Road Follow Multi-Waypoint Count & Nudge Fix:** Fixed `recalculateRoadOffsetPath` so editing or nudging waypoints when `generatedWaypoints.length > roadWaypoints.length` (such as Waypoint 3) retains all waypoints without truncating or throwing undefined errors.

## [1.24.0] - 2026-07-23

### Added & Fixed
- **Synchronized Road Follow Editing & Deletion:**
  - Deleting any waypoint in Road Follow mode now removes the node from both `roadWaypoints` and `generatedWaypoints`, updating the road path geometry and recalculating the offset flight path.
  - Editing or nudging drone waypoint coordinates dynamically shifts the underlying road control node, keeping the road path and drone path 100% synchronized and locked together.

## [1.23.4] - 2026-07-23

### Fixed
- **Road Follow Object Identity & Popup Cancel Revert:** Preserved waypoint object identity in `recalculateRoadOffsetPath` so real-time popup edits operate on identical memory references. Bound `revertChanges` to popup remove events to guarantee unsaved real-time edits cleanly revert on popup close.

## [1.23.3] - 2026-07-23

### Fixed
- **Road Follow Save, Reset & Revert Alignment:** Fixed Road Follow popup save and reset logic to prevent corrupting road node positions when editing cyan drone waypoints. Added full map path line and stats redrawing on popup cancel/revert so un-saved real-time edits cleanly restore.

## [1.23.2] - 2026-07-23

### Fixed
- **Road Follow Waypoint Nudge Position Persistence:** Fixed Road Follow mode nudge controls so nudging drone waypoints updates their coordinates and preserves custom nudged positions in `recalculateRoadOffsetPath` without resetting back to un-nudged road offsets.

## [1.23.1] - 2026-07-23

### Fixed
- **Road Follow Waypoint Editing & Popup Binding:** Fixed Road Follow mode so clicking any cyan drone waypoint opens its individual editor popup to edit altitude, pitch, speed, hover time, camera action, zoom, heading, or position. Preserved custom drone waypoint overrides in `recalculateRoadOffsetPath` when dragging road nodes.

## [1.23.0] - 2026-07-23

### Added
- **Resizable & Fullscreen 3D View Modal:** Added an Expand/Restore button (`#expand-3d-btn`) to the 3D Flight Path Preview modal header, allowing full-screen expansion and native browser fullscreen toggle with automatic 3D canvas viewport re-scaling.

## [1.22.0] - 2026-07-23

### Added
- **Matching Icon Indicators in Waypoint Editors:** Added consistent SVG visual indicators (Altitude, Pitch, Speed, Hover Time, Turn Mode, Camera Action, Camera Zoom, Heading Mode, Position Nudge) matching the left control panel across both 2D Map Waypoint Popups and 3D FPV HUD Editors.

## [1.21.3] - 2026-07-23

### Fixed
- **Speed & Hover Time Save & Revert Persistence:** Fixed saving, baseline tracking (`origSpeed`, `origHoverTime`, `origTurnMode`, `origCameraAction`, `origZoom`), and cancel/reset behavior for per-waypoint speed overrides and hover durations across both 2D Map Popups and 3D FPV HUD Editors.

## [1.21.2] - 2026-07-22

### Fixed
- **FPV Straight Lines Animation Pause Fix:** Updated FPV walkthrough playback logic to check `#path-mode === 'straight'` ("Straight Lines (Drone stops at points)") so the 3D FPV simulation correctly halts movement at every waypoint when flying straight line missions.

## [1.21.1] - 2026-07-22

### Changed
- **Mini 4 Pro Focal Zoom Range Alignment:** Capped per-waypoint camera zoom slider range to 1.0x – 4.0x matching the physical camera specs of the DJI Mini 4 Pro payload.

## [1.21.0] - 2026-07-22

### Added
- **Per-Waypoint Camera Actions & Zoom (RC 2 Parity):** Added per-waypoint Camera Action selection (`Inherit Global Mode`, `None`, `Take Photo`, `Start Recording`, `Stop Recording`, `Set Camera Zoom`) and focal zoom factor adjustment (1.0x – 7.0x) on both 2D Map Popups and 3D FPV HUD Editors.
- **WPML Camera Action Export:** Compiled per-waypoint camera actions into native WPML `<wpml:actionGroup>` tags (`takePhoto`, `startRecord`, `stopRecord`, `zoom`) in exported `waylines.wpml` files.

## [1.20.2] - 2026-07-22

### Fixed
- **Real-World FPV Hover & Traversal Logic:** 3D FPV simulation now glides continuously through waypoints during Continuous Flight Mode or Curved Pass without pausing, only hovering when an actual IRL hover is configured (`hoverTime > 0` or Stop & Turn).

## [1.20.1] - 2026-07-22

### Changed
- **Compact DJI Mini 4 Pro 3D Drone Scale:** Reduced 3D quadcopter drone model scale (0.4 scale factor) for sleek, uncluttered 3D mission view matching compact drones like the DJI Mini 4 Pro.

## [1.20.0] - 2026-07-22

### Added
- **3D Quadcopter Drone Waypoint Models:** Replaced plain spheres in the 3D scene preview with realistic 3D quadcopter drone models featuring carbon rotor arms, motor pods, propeller blur discs, color-accented hulls, and camera gimbal payloads.
- **Dynamic 3D Yaw & Gimbal Pitch Orientation:** Each 3D drone model automatically rotates to face its waypoint's flight heading angle and tilts its camera gimbal payload to the target gimbal pitch angle.
- **3D Controls HUD Toggle:** Added a `3D Drones` toggle button to the 3D scene overlay controls to easily switch between 3D Drone Models and Spheres.

## [1.19.0] - 2026-07-22

### Added
- **DJI RC 2 Waypoint Editor Parity:** Added per-waypoint Flight Speed overrides (1–15 m/s or Imperial equivalent), per-waypoint Hover Durations (0–60s), and per-waypoint Turn Curvature Mode controls (`Stop & Turn` vs `Curved Pass`) across 2D map popups and 3D FPV HUD editors.
- **WPML 1.0 XML Compilation:** Exported per-waypoint `<wpml:waypointSpeed>`, `<wpml:waypointTurnMode>`, and `<wpml:actionActuatorFunc>hover</wpml:actionActuatorFunc>` WPML tags into `waylines.wpml` for native execution on DJI RC 2, DJI Fly, and Matrice controllers.

## [1.18.13] - 2026-07-22

### Fixed
- **2D Popup Baseline Protection:** Removed `orig*` baseline property overwrites from 2D popup Save listener. Now, leaving the editor (closing popups or scrubbing to other waypoints) preserves the original pattern baseline settings, allowing pilots to reset any modified waypoint back to its original pattern state at any time.

## [1.18.12] - 2026-07-22

### Fixed
- **FPV Save & Reset Immediate Responsiveness:** Added `updateFPVEditorUI()` triggers to all altitude, pitch, and heading slider input events. The **Save** button now appears immediately on ANY waypoint change (sliders, text inputs, D-Pad nudges), and **Reset** returns the waypoint to its original pattern state.

## [1.18.11] - 2026-07-22

### Fixed
- **FPV Save Baseline Protection:** Prevented `fpvSaveWaypoint()` from overwriting `origLat`, `origLon`, `origAlt`, `origPitch`, `origHeading` baseline properties, ensuring the **Reset** button remains visible on modified waypoints after saving and successfully reverts waypoints back to original pattern settings.

## [1.18.10] - 2026-07-22

### Fixed
- **Reset Button Persistence After Save:** Fixed `fpvSaveWaypoint()` and 2D popup Save button to preserve original pattern baseline settings (`origLat`, `origLon`, `origAlt`, etc.) when saving custom edits. The **Reset** button now remains available on modified waypoints after saving, allowing pilots to revert back to original pattern settings at any time.

## [1.18.9] - 2026-07-22

### Changed
- **2D Map & 3D FPV Waypoint Edit Action Alignment:** Unified Save, Reset, and Delete behaviors across both 2D map popups and 3D FPV HUD panels. Save & Reset buttons now remain hidden until unsaved edits exist on both views, commit baseline properties identically, and trigger full 2D map & 3D scene re-renders.

## [1.18.8] - 2026-07-22

### Changed
- **FPV Save & Reset Dynamic Visibility:** Updated `#fpv-btn-save-wp` and `#fpv-btn-reset-wp` to remain hidden until unsaved edits are made to a waypoint, keeping the HUD action bar clean.

## [1.18.7] - 2026-07-22

### Fixed
- **FPV Waypoint Insert Property Initialization:** Fixed `fpvInsertWaypoint()` longitude property assignment (`lon: geo.lon`) and baseline property initialization (`origLat`, `origLon`, `origAlt`, `origPitch`, `origHeading`), resolving inserted waypoint corruption and viewport camera updates.

### Added
- **FPV Waypoint Scrubber Slider:** Added a real-time Waypoint Progress Scrubber Slider (`#fpv-wp-scrubber-slider`) to the 3D FPV HUD playback bar, allowing pilots to scrub directly to any waypoint across the mission.

## [1.18.6] - 2026-07-22

### Fixed
- **Inlined Build Synchronization:** Rebuilt `index.html` single-file bundle using `scratch/build.py` to compile the updated JS/CSS logic into inlined browser scripts, restoring FPV Lat/Lon text input values and 3D position nudge functionality.

## [1.18.5] - 2026-07-22

### Fixed
- **FPV Waypoint Latitude/Longitude String Parsing Crash Fix:** Fixed an uncaught `TypeError` in `updateFPVEditorUI()` where string-formatted coordinates (e.g. `"40.0164223"`) caused `.toFixed(7)` to throw an exception, resulting in blank inputs and breaking position nudge calculations. Wrapped coordinate formatting in `parseFloat()`.

## [1.18.4] - 2026-07-22

### Fixed
- **FPV Camera View-Relative Nudge & Input Lock Fix:** Fixed FPV D-Pad position nudge to transform displacements relative to current FPV camera heading angle (`Forward`, `Backward`, `Left`, `Right`). Forced immediate updates to text inputs (`#fpv-edit-lat`, `#fpv-edit-lon`) during nudge execution to prevent input focus locks from overwriting nudged coordinates.

## [1.18.3] - 2026-07-22

### Added
- **3D FPV Waypoint Save & Revert Buttons:** Added cyan **Save** button (`#fpv-btn-save-wp`) and yellow **Reset/Revert** button (`#fpv-btn-reset-wp`) to the 3D FPV Waypoint Editor HUD panel, giving complete UI and workflow parity with the 2D map waypoint editor popup.

### Fixed
- **FPV Waypoint Latitude & Longitude Text Input Formatting:** Fixed a parsing bug where string coordinates in waypoint objects caused `.toFixed(7)` to throw, resulting in blank Lat/Lon inputs and broken nudge calculations. Latitude and Longitude values are now safely parsed with `parseFloat()`.

## [1.18.2] - 2026-07-22

### Fixed
- **FPV Lat/Lon Text Inputs & Nudge Initial Value Bug:** Fixed an uncaught `TypeError` in `updateFPVEditorUI()` caused by missing null checks on optional DOM controls (e.g. `gimbal-pitch`), which previously interrupted script execution before updating the Lat/Lon text input values. Removed static `0.0000000` HTML attribute defaults and added safe fallback dereferencing so FPV nudge controls always operate on valid waypoint coordinates.

## [1.18.1] - 2026-07-22

### Fixed
- **3D FPV Waypoint Position Nudge & Viewport Sync:** Fixed an issue where nudging waypoints in the 3D FPV HUD editor did not update coordinates when a center marker was absent, and failed to refresh the 3D FPV camera viewport position in real-time while paused. Added fallback Cartesian coordinate calculations (`wp.x`, `wp.y`), immediate FPV camera position rendering (`updateFPVCamera(0)`), and event propagation handling for D-Pad nudge buttons, Lat/Lon text inputs, and Reset triggers.

## [1.18.0] - 2026-07-22

### Added
- **3D FPV Waypoint Menu Alignment:** Aligned the 3D FPV Waypoint Editor HUD panel with the 2D Map Waypoint Editor popup. Added precision Latitude/Longitude text inputs, D-Pad coordinate nudge controls with customizable step distances (`0.2m`/`1m`/`5m` or `1ft`/`5ft`/`20ft`), yellow **Reset** button for restoring original generated states, and Imperial/Metric unit conversions (`ft` vs `m`).
- **Non-Obstructive Viewport Layout:** Relocated the 3D FPV Editor panel from the lower-center (where it obscured the drone flight viewfinder and reticle) to a floating upper-right side card with semi-transparent glass backdrop.
- **Minimize/Expand Toggles:** Added quick collapse/expand toggles (`▼`) to both the 3D FPV Editor panel and the 2D Map Waypoint Editor popup, allowing pilots to instantly minimize menus for an unobstructed view of the map or FPV camera.

## [1.17.4] - 2026-07-19

### Fixed
- **Drone Target Default Sync Bug:** Fixed a bug where switching camera model presets automatically set the drone target dropdown to the value `'90'`. Since the dropdown was updated to use `'68'` for the Mini 4 Pro, this caused the dropdown to become invalid, exporting `NaN` for `<wpml:droneEnumValue>`. Aalaapi now correctly uses `'68'` in all camera preset bindings and default enums.

## [1.17.3] - 2026-07-19

### Fixed
- **POI Heading Mode Override Bug:** Fixed a bug where procedurally generated waypoint heading angles (from grid path generation) were overriding the global "Face POI" (`towardPOI`) heading mode during XML export. Aalaapi now properly honors the global "Face POI" heading mode even if the waypoint object contains a default computed heading angle.

## [1.17.2] - 2026-07-19

### Fixed
- **POI Export Bug Revert & Fix:** Reverted the hardcoded POI index that broke single and multi-POI mission rendering. Fixed the true underlying bug where the waypoint's custom `poiIndex` and `headingMode` were completely stripped from the waypoint objects during KMZ export mapping, causing all exported waypoints to default to POI 1 (index 0).

## [1.17.1] - 2026-07-19

### Fixed
- **Multi-POI DJI Parser Bug:** Fixed a critical issue where exporting multiple Points of Interest caused the DJI RC2 controller to discard subsequent POIs and point all waypoints to the first POI. The RC2 firmware requires all `<wpml:waypointHeadingPoiIndex>` tags to literally be `0`, regardless of how many POIs exist, relying purely on the coordinate payload to generate the markers. Aalaapi now properly hardcodes this index to `0` instead of mapping it 1:1 to the internal UI index.

## [1.17.0] - 2026-07-19

### Added
- **RC2 Gap Features:** Added WPML generation support for missing RC2 parameters: Finish Actions (Back to Start), Signal Lost Actions (Hover, Land, RTH, Continue), and Camera Zoom (up to 4.0x with tenths precision).

### Fixed
- **Mini 4 Pro KMZ Format Error:** Fixed a critical bug causing the DJI RC2 controller to reject generated waypoint KMZs for the Mini 4 Pro. Aalaapi now correctly uses `68` (the Mavic 3 Enterprise enum) for the Mini 4 Pro's WPML `droneEnumValue` output.

## [1.16.4] - 2026-07-19

### Changed
- **Export Warning Prompts:** Refined safety alerts to remove the word "buggy" and make it explicitly clear that waypoint files are not working properly on export.

## [1.16.3] - 2026-07-19

### Added
- **Alpha/Buggy Warning Banner & Startup Card:** Added a persistent red "Beta / Buggy" warning badge next to the branding title in the sidebar, and inserted a prominent red active development warning card inside the initial flight safety disclaimer modal.

## [1.16.2] - 2026-07-19

### Fixed
- **POI Coordinate Export Order:** Corrected the coordinate order in `<wpml:waypointPoiPoint>` tags to be **Latitude, Longitude, Altitude** instead of standard KML Longitude, Latitude, Altitude. This fixes a positioning mismatch where DJI RC2 controllers would misinterpret the POI location and point the camera in incorrect directions.

## [1.16.1] - 2026-07-19

### Fixed
- **3D Camera Cone Yaw Alignment:** Aligned the 3D FPV view camera cones in the Three.js preview with the 2D map marker heading/yaw arrows. Modified `getWaypointHeadingAndPitch` to dynamically resolve custom heading modes (such as `towardPOI` and `fixed`) and POI targets, resolving the visual disconnect.

## [1.16.0] - 2026-07-19

### Added
- **Multiple Points of Interest (POIs):** Added support for defining and managing multiple Points of Interest on the Leaflet map. Users can click "+ Add POI" in the sidebar to spawn new custom terracotta POI markers, name them, drag them to position, or delete them.
- **Per-Waypoint POI Selection:** Waypoints that use a POI heading mode can now choose *which* specific POI to track (e.g. POI 0 (Center), POI 1, POI 2, etc.) using a dropdown selector inside both the map waypoint editor popup and the FPV editor panel.
- **Dynamic Real-Time Yaws:** Waypoints orient their yaws dynamically on the map in real-time toward the coordinates of their selected target POI.
- **Multi-POI Export:** WPML exporter correctly maps `<wpml:waypointPoiPoint>` coordinates and `<wpml:waypointHeadingPoiIndex>` tags to match the selected target POI index for every waypoint.

## [1.15.2] - 2026-07-19

### Fixed
- **Road-Following Waypoint Edits:** Fixed heading and headingMode overrides not persisting in road-following paths. `recalculateRoadOffsetPath` now dynamically calculates and applies headings based on the waypoint's custom heading and headingMode parameters.
- **FPV Editor Road Sync:** Fixed a bug where updates in the FPV editor panel (altitude, gimbal pitch, custom heading, and headingMode) would get discarded on redraw in road-following mode. Any edits to generated waypoints are now correctly synced back to the corresponding road node points in `roadWaypoints`.

## [1.15.1] - 2026-07-19

### Fixed
- **Road-Following Waypoint Editor:** Clicking a road node marker now correctly opens the waypoint editor popup without crashing. Fixed a null-guard on `marker.getTooltip()` calls, guarded `tempHeading.toFixed()` against `null`, and corrected the `revertChanges` function to restore the simple `"Road Node N"` tooltip (instead of a heading/pitch tooltip) for road-following markers.
- **Popup Cancel Revert:** Closing the waypoint editor without saving now also correctly restores `wp.headingMode` to its pre-edit value.

## [1.15.0] - 2026-07-19

### Added
- **Per-Waypoint Heading Mode (Map Popup):** Replaced the legacy Auto checkbox in the map marker waypoint editor popup with a full five-option **Heading Mode** dropdown selector matching the FPV editor panel — options include Inherit Global Default, Follow Flight Path, Fixed Heading (North), Point of Interest (POI), and Custom Angle. The Custom Angle range slider is conditionally shown/hidden based on the selection.

### Changed
- **Consistent Waypoint Editing UI:** Both the map popup editor and the FPV panel editor now show identical heading mode controls, ensuring consistent behavior across all editing interfaces.
- **Wider Waypoint Popup:** Increased map popup width from 210px to 230px for better readability and padding around controls.

## [1.14.1] - 2026-07-18

### Changed
- **Heading Mode Explanation:** Added a clear, static description paragraph below the Heading Mode dropdown in the sidebar to clarify that it operates as a global default, with procedural overrides applying to orbits.

## [1.14.0] - 2026-07-18

### Added
- **POI Heading Mode:** Added the third choice, **Point of Interest (POI / Target-Facing)**, to the Heading Mode selector. Exports the `<wpml:waypointHeadingMode>towardPOI</wpml:waypointHeadingMode>` configuration and targets the mission center coordinates automatically.
- **Adaptive Sidebar Options:** Integrated conditional visibility for Heading Mode parameters. The controls are dynamically hidden when Oblique Orbit or Multi-Orbit patterns are chosen to declutter the sidebar layout.

## [1.13.9] - 2026-07-18

### Added
- **Heading Mode POI Simulation:** Enhanced the interactive Heading Mode help drawer with a third tab, **POI / Target**, representing a Point of Interest (actor) as a terracotta center target. The animated camera view cone dynamically yaws to track and lock onto this subject coordinate as the drone flies past.

## [1.13.8] - 2026-07-18

### Added
- **Heading Mode Help Drawer:** Implemented an interactive collapsible help drawer next to the Heading Mode selector. Features tabbed descriptions and a custom vector micro-animation showing a terracotta & cyan drone moving along a path to illustrate Follow Flight Path vs. Fixed Heading yaw dynamics.

## [1.13.7] - 2026-07-18

### Added
- **Settings State Persistence (localStorage):** Configured automatic serialization and saving of all 18 UI control elements (flight limits, overlap percentages, camera setups, grid boundaries, and road snaps) to localStorage. On application load, these settings are restored instantly, preserving custom flight planning parameters.

## [1.13.6] - 2026-07-18

### Added
- **Visual Slider Labels:** Integrated beautiful inline SVGs styled with the terracotta and cyan theme next to all 12 range slider labels in the sidebar (Section 2, 3, and 4) to visually communicate the parameter being modified.

## [1.13.5] - 2026-07-18

### Changed
- **Export Warning Note:** Enhanced the KMZ export safety checklist to include an explicit disclaimer at the top of the "Press Go" upload instructions stating that the app is in active development, prompting pilots to verify all coordinate and camera outputs.

## [1.13.4] - 2026-07-18

### Added
- **Export "Press Go" Warning:** Integrated a comprehensive "Press Go" upload checklist prompt shown on all KMZ exports, warning pilots of conditions that can cause missions to fail at takeoff (e.g., controller max altitude limit restriction, weak GPS/satellite locks, starting distance from home, or unauthorized airspace zones).

## [1.13.3] - 2026-07-18

### Fixed
- **DJI RC2 & Consumer Drone KMZ Compatibility:** 
  - Added an **Export Drone Target** dropdown selector in UI settings (Section 3) to allow explicit selection of the destination aircraft (DJI Mini 4 Pro, Air 3, Mavic 3 Series, Mavic 3 Enterprise, Matrice 30, Matrice 300/350 RTK, or Inspire 3).
  - Configured the KMZ exporter to dynamically populate the `<wpml:droneEnumValue>` metadata tag based on the selected aircraft, resolving "unsupported model" load failures on DJI Fly controllers like the DJI RC2.
  - Switched KML/WPML namespaces from `http://www.uav.com/wpmz/1.0.2` to the official DJI schema namespace `http://www.dji.com/wpmz/1.0.2` for complete parser validation compatibility.
  - Updated the KMZ importer to read `<wpml:droneEnumValue>` from imported missions and automatically update the UI selector.

## [1.13.2] - 2026-07-18

### Changed
- **Logo & Icon Redesign:** Created and implemented a custom Myaamia (Miami-Illinois) geometric-styled X-frame quadcopter drone icon. Updated the branding in the sidebar header and About modal header with vector inline SVGs, and configured high-resolution PNG favicons and Apple touch icons for modern browser tab integration.

## [1.13.1] - 2026-07-18

### Changed
- **About Modal — Safety Disclaimer Redesign:** Replaced the dense single-paragraph safety disclaimer in the About modal with a 2-column icon card grid. Each of the 6 safety categories (No Developer Liability, Pilot-in-Command, Verify Before Launch, Regulatory Compliance, Live Data, Emergency Abort) now has its own color-coded card with an emoji icon and a concise one-sentence description, making the warnings far more scannable and less intimidating.

## [1.13.0] - 2026-07-18


### Added
- **Cached Location (localStorage):** The last successful GPS fix is now persisted to `localStorage` under the key `aalaapi_sky_last_location`. On subsequent page loads, the cached position is restored immediately as the active user location and the map opens centered there — no new GPS permission prompt required. If the user taps "Locate Me" and GPS is denied, the app silently falls back to the cached location instead of showing an error. The button displays a cyan "📍 Cached Location" indicator to distinguish cached from live GPS results.

## [1.12.9] - 2026-07-18


### Fixed
- **VFR Sectional Map Layer:** Migrated the map overlay from the standard ArcGIS tile request endpoint to the official public OGC WMTS endpoint and limited `maxNativeZoom` to 11 (the global coverage limit for sectional charts) to fully restore tile rendering and resolve CORS/ORB and 404 tile issues.

## [1.12.8] - 2026-07-18

### Fixed
- **VFR Sectional Map Layer:** Appended the `.png` extension format suffix to the FAA ArcGIS REST tile request URL to restore compatibility with the live tile server.

### Removed
- **Trackable KMZ Files:** Deleted all previously tracked KMZ test files containing flight coordinate coordinates and pilot metadata from the Git repository and added `*.kmz` / `*.zip` to `.gitignore` to prevent future tracking.

## [1.12.7] - 2026-07-18

### Changed
- **Safety Disclaimer Updates (Emergency Procedures):** Added specific safety checkpoints to disclaimers requiring remote pilots to assume sole responsibility for knowing how to abort automated missions on their specific drone model, and to verify all local fail-safe configurations (like Return-to-Home altitude and signal loss response actions) before takeoff.

## [1.12.6] - 2026-07-18

### Changed
- **Legal Disclaimer Updates (Third-Party Data Feeds):** Expanded the flight safety disclaimers (in the gatekeeper modal, About modal, and README) to explicitly state that all live third-party government data feeds (FAA airspace, NOAA/NWS weather, HIFLD infrastructure) are provided "as-is", and that the developers are not liable for any inaccuracies, outages, or latencies in this external data.

## [1.12.5] - 2026-07-18

### Changed
- **Documentation Restructuring (Disclaimer Placement):** Moved the Disclaimer & Legal Warning section in the README to the top of the document (right below the name origin) to emphasize flight safety and liability terms for new users.

## [1.12.4] - 2026-07-18

### Changed
- **Documentation Enhancements (FPV Preview details):** Expanded README Section 3 to comprehensively detail the 3D FPV Walkthrough & Editor simulation features (telemetry dashboard, virtual playback controller, and shutter flash feedback).

## [1.12.3] - 2026-07-18

### Changed
- **DJI Hardware Compatibility Callouts:** Added explicit hardware compatibility details (in the UI Export guide modal and the README) detailing that generated KMZ plans follow the modern DJI WPML V2 specification, listing supported aircraft (e.g. Mini 4 Pro, Air 3, Mavic 3) and noting unsupported legacy drone models.

## [1.12.2] - 2026-07-18

### Changed
- **UI Label Enhancements (US Only Badges):** Added clear `(US Only)` badge labels to all FAA and NOAA weather/airspace overlays in the Leaflet map layer control and popups to clarify which resources only cover US territory.

## [1.12.1] - 2026-07-18

### Changed
- **Safety Disclaimer Updates:** Enhanced the flight safety disclaimers (in the UI popup modal and README) to explicitly warn remote pilots-in-command of compliance requirements with FAA Part 107 (commercial operations) and FAA Section 44809 / TRUST (recreational flyers), including maintaining Visual Line of Sight (VLOS) at all times.

## [1.12.0] - 2026-07-18

### Added
- **Flight Safety Acknowledgment Popup:** Added an initial gatekeeper modal that forces the user to review and accept the flight safety disclaimer and developer liability waiver before accessing the planner.
- **MIT Open-Source License:** Formally licensed the repository under the MIT License to encourage community contributions and protect against legal liability.
- **GitHub Actions Auto-Compilation & Caching CI:** Added a GitHub workflow to compile `index.html` on git push, verify Node unit tests, handle push conflicts, and cache npm/Playwright dependencies.

## [1.11.1] - 2026-07-18
- Added a centralized logging utility to improve observability by replacing direct console.warn/error calls with Logger.warn/error.

## [1.11.0] - 2026-07-17

### Added
- **3D FPV Walkthrough:** Added an interactive First-Person View camera simulation to the 3D preview.
- **3D Interactive Waypoint Editor:** Added a HUD panel during walkthrough pauses allowing real-time waypoint altitude, gimbal pitch, and yaw heading configuration.
- **Insert & Delete in 3D:** Added buttons to instantly insert a new intermediate waypoint or delete the current waypoint directly from the 3D HUD, automatically updating the 3D path model and Leaflet maps.
- **FPV Telemetry & Media Overlays:** Added visual indicators for altitude, flight speed, waypoint progress, a target crosshair, camera shutter flash on photo captures, and a blinking timer overlay during video recording.

## [1.10.3] - 2026-07-16

### Fixed
- **DJI RC2/WPML Compatibility:** Fixed waypoint flight load/execution error on DJI RC2 controllers when hitting "Go" by removing the unsupported `<wpml:payloadInfo>` block from generated KML/WPML flight plans.
- **Security:** Resolved multiple stored and DOM-based Cross-Site Scripting (XSS) vulnerabilities in weather data UI panel rendering, waypoint warning displays, and map legend rendering.

### Added
- **Documentation:** Updated the RC2 Waypoint File Injection Guide in the UI modal to provide clear instructions for unzipping and copying multipart ZIP split-mission exports.

## [1.10.2] - 2026-07-09

### Fixed
- **DJI RC2/WPML Compatibility:** Fixed waypoint flight execution/import errors by resetting `actionGroupId` locally within each waypoint Placemark folder and appending the required `useGlobalPayloadLensIndex` to `takePhoto` and `startRecord` action parameters. Stripped out deprecated `fileSuffix` tags to match strict DJI RC2 controller firmware schemas.

## [1.10.1] - 2026-07-06

### Added
- **Useful Links Button:** Added quick access to aviation and FAA tools directly in the header modal (IACRA, FAADroneZone, METAR, TFR, NOTAM).

## [1.10.0] - 2026-07-01

### Added
- **Map Layers:** Topography base map, FAA Obstacles overlay, and HIFLD Power Lines transmission layer (active at zoom 11+).
- **Weather Enhancements:** METAR nearest station reports in stats panel and flight category identifiers.

### Fixed
- **Mobile Experience:** Fixed auto-plan drawing layout, viewport sizing errors, overlapping sidebars, and auto-closing logic.
- **Flight Planning:** Fixed POI heading yaws during 3D/Splat (double) mapping runs.
- **Performance & Security:** Mitigated potential XSS inputs in KMZ file imports, optimized path calculations.

## [1.9.0] - 2026-06-15

### Added
- **NOAA Weather Overlays:** Live NEXRAD Radar and NWS Hazards weather warnings directly on the map.
- **3D Preview Pan:** Added right-click + drag panning support to OrbitControls in the 3D viewer.

## [1.8.0] - 2026-05-20

### Added
- **FAA Airspace Overlays:** Live aeronautical charts (VFR Sectional), Controlled Airspaces (Class B/C/D/E), Restricted Special Use Airspaces, and UAS Facility Maps (LAANC) grids.

## [1.7.0] - 2026-04-12

### Added
- **Waypoint Reset Button:** Interactive Reset control inside the waypoint editor popup to easily restore modified/nudged waypoints to their original coordinates, altitude, heading, and gimbal pitch.

## [1.6.10] - 2026-03-05

### Fixed
- **Pattern Switching:** Prevented old road snap/manual waypoints from interfering with clean procedural regenerations unless explicitly in editor mode.
- Smoother transitions between imported KMZs and freeform flight paths.
