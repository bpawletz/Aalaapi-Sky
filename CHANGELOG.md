# Changelog

All notable changes to Aalaapi Sky will be documented in this file.

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
