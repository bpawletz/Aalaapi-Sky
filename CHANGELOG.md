# Changelog

All notable changes to Aalaapi Sky will be documented in this file.

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
