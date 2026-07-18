# Aalaapi Sky

**Drone Waypoint Mission Planner**

A waypoint mission generator and editor for drone flight planning. Designed for high-fidelity 2D mapping and 3D Gaussian Splats. It operates entirely in the browser using client-side technologies.

> **About the Name:** *Aalaapi* (Myaamia / Miami-Illinois) means **"Look in a particular direction, observe."** It highlights the scanner/camera observing and planning paths from the sky.

---

## Disclaimer & Legal Warning

> [!WARNING]
> **USE AT YOUR OWN RISK.** This software is provided solely for flight planning visualization, preview, and educational purposes.
>
> * **No Liability for Physical Assets:** The developers and contributors of Aalaapi Sky assume absolutely no responsibility or liability for hardware loss, drone crashes, "flyaways", property damage, personal injury, or legal violations resulting from the use of flight plans generated or edited by this software.
> * **Pilot Responsibility:** The remote pilot-in-command (PIC) is solely responsible for the safe and lawful operation of their aircraft. You must independently verify all flight altitudes, waypoint clearances, local obstacles, weather conditions, and active airspace restrictions (including obtaining appropriate FAA LAANC authorizations). All flights must comply with applicable regulations, such as **FAA Part 107** for commercial operations or **FAA Section 44809 / TRUST** for recreational flyers, including keeping the aircraft within Visual Line of Sight (VLOS) at all times.
> * **Third-Party Data & Live Feeds:** This software displays data retrieved directly from external, third-party government servers (such as live FAA airspace grids, NOAA/NWS weather radar, and HIFLD infrastructure assets). The developers and contributors assume no responsibility for any inaccuracies, omissions, service outages, or latency in these external data feeds. Pilots must independently cross-reference and verify all flight planning constraints using official source publications (such as aeronautical charts, active NOTAMs, and direct NOAA briefings).
> * **Emergency Procedures & Fail-Safes:** The pilot is solely responsible for knowing how to immediately abort an automated waypoint mission and resume manual control on their specific aircraft. Before takeoff, you must verify and configure all fail-safe emergency procedures—including signal loss behaviors and Return-to-Home (RTH) altitudes—to ensure the drone safely clears all local terrain, trees, power lines, and obstacles in the event of an emergency or connection loss.

---

## Key Features

### 1. Visual Flight Pattern Selector
An interactive 8-card visual selector maps out flight paths procedurally:
- **2D Grid (Nadir):** Standard mapping grid with configurable spacing, overlaps, and altitude.
- **Double Grid:** Crosshatch flight pattern for high-fidelity 3D structure reconstruction.
- **Orbit:** A single circular oblique pass around a focal structure.
- **Multi-Orbit:** Multi-tiered circular passes at ascending/descending altitudes and varying camera pitches.
- **Hybrid Combo:** Grid mapping combined with a single orbit pass.
- **Multi-Hybrid:** Grid mapping combined with multiple orbital tiers.
- **Road Follow:** Road-snapping alignment that creates a flight path tracing public roads with adjustable offset and waypoint interval spacing.
- **Freeform:** Manual waypoint creation by directly clicking anywhere on the map.

### 2. Waypoint Persistence & Advanced Editor
- **Smart Switch:** Switching patterns (e.g., to Orbit or Multi-Orbit) preserves custom road-following or freeform waypoints instead of clearing them.
- **Waypoint Details Popup:** Adjust coordinates, altitude, gimbal pitch, custom yaw, and toggle ring starting flags.
- **Visual Feedback & Nudging:** Selected waypoints highlight, and their positions can be nudged with precision controls.
- **Interactive Reset:** A **Reset** button appears on modified waypoints, allowing you to instantly restore their original coordinates, altitude, pitch, heading, and configuration.

### 3. Interactive 3D Mission Preview & FPV Walkthrough
- **High-Fidelity Engine:** Rendered using Three.js with full camera FOV (Field of View) cones.
- **Coverage Heatmap:** Color-coded footprint highlights density of photogrammetry coverage.
- **FPV (First Person View) Simulation:** Toggle the FPV View mode to jump into the drone's cockpit. Simulate the actual flight path with a virtual playback engine.
- **Playback & Telemetry Dashboard:** Play/pause the flight simulation, adjust playback speed, and view a live telemetry overlay (Altitude, Speed, Gimbal Pitch, and Yaw).
- **Interactive Shutter & Video Simulation:** Simulates camera shutter flashes at photo capture waypoints (supporting Stop & Shoot and Continuous modes) and tracks recording time.
- **Controls:** Fully supports rotation (left-click + drag), zooming (scroll), and panning (right-click + drag) to verify flight clearances.

### 4. Live FAA Airspace Overlays (US Only)
Toggleable aviation overlays mapped from official FAA REST endpoints (covers the United States and its territories only):
- **VFR Sectional Charts:** High-resolution aeronautical chart raster tiles.
- **Controlled Airspace:** Color-coded boundaries for Class B (Blue), Class C (Purple), Class D (Pink), and Class E (Green) airspaces.
- **Special Use Airspace:** Visual boundaries for restricted, prohibited, and military operations areas.
- **UAS Facility Maps (LAANC):** Local grids showing maximum allowable drone altitudes (from 0 to 400 ft) with permanent labels.

### 5. Real-Time Weather & Infrastructure Layers (US Only)
*Note: Weather radar, hazards, and power grids cover the United States only.*
- **NEXRAD Weather Radar:** Composite reflectivity radar showing active precipitation.
- **NWS Hazards (Weather Warnings):** Active warnings, watches, and advisories.
- **Dynamic Legend:** Floating map key showing radar intensity scale and active hazard warnings.
- **Power Transmission Lines:** Electric utility lines sourced from HIFLD, loading dynamically at zoom levels 11 and above with detailed info popups.

### 6. Auto-Plan Calculator & Intelligent Export
- **Structure-Aware Auto-Plan:** Computes optimal altitude and overlap settings based on target structure height.
- **Mission Splitting:** Automatically slices large missions exceeding a target **Max Flight Time** into multiple sequenced KMZ files, packaged inside a single ZIP download.
- **DJI RC2 Support:** Generates controller-compatible KMZ outputs with detailed on-screen setup instructions.

---

## Technologies Used

- **Vanilla HTML5 / CSS3 / ES6+ JavaScript:** Designed to be clean, fast, and dependency-free (no build/bundling step required to run).
- **[Leaflet (v1.9.4)](https://leafletjs.com/):** Core interactive 2D map engine.
- **[Three.js (r128)](https://threejs.org/):** GPU-accelerated 3D scene rendering for flight previews.
- **[Esri Leaflet (v3.0.12)](https://github.com/Esri/esri-leaflet):** Directly consumes ArcGIS REST services for live airspace layers.
- **[JSZip](https://stuk.github.io/jszip/):** In-browser generation of ZIP archives and KMZ flight packages.
- **[OpenStreetMap Nominatim](https://nominatim.org/) & [OSRM](http://project-osrm.org/):** Geocoding searches and road-snapping routing engine.
- **[NOAA/NWS GeoServer WMS](https://opengeo.ncep.noaa.gov/):** Real-time weather radar and warning tile services.

---

## Getting Started

1. **Host or Open:** Open `index.html` directly in a browser, or run a local server (e.g., `python -m http.server` or via VS Code Live Server).
2. **Select Flight Mode:** Select your desired pattern from the visual icon grid in the sidebar.
3. **Configure Targets:** Double-click on the map or search for a location to center the plan.
4. **Verify Airspace & Weather:** Toggle overlays in the layer control (top-right of the map) to ensure safe flight planning.
5. **Adjust Parameters:** Fine-tune overlaps, altitude, speed, and gimbal pitches in the sidebar controls.
6. **Preview in 3D:** Click **3D View** to check camera angles, overlaps, and path trajectory.
7. **Export:** Export the mission as a KMZ/ZIP package. Click **Show RC2 Copy Instructions** to load it onto your DJI smart controller.

---

## DJI Hardware Compatibility

Aalaapi Sky compiles flight plans into DJI's proprietary **WPML (Waypoint Markup Language) V2** standard.

* **Supported Models:** DJI Mini 4 Pro, DJI Air 3, DJI Mavic 3, Mavic 3 Pro, Mavic 3 Classic, Mavic 3 Enterprise, DJI Inspire 3, DJI Matrice 30 (M30/M30T), and DJI Matrice 300/350 RTK.
* **Unsupported Models:** Older DJI models (including the DJI Mini 3 Pro, Mavic Air 2, Mavic 2 series, and Phantom 4 series) utilize legacy `.kml` or proprietary database structures and are not compatible with WPML V2.




