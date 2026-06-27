# Aalaapi Sky

**Drone Waypoint Mission Planner**

A professional-grade waypoint mission generator and editor for drone flight planning. Designed for high-fidelity 2D mapping and 3D Gaussian Splats.

## Features

- **Procedural Flight Generation:** Supports 2D Nadir Grid, 3D Double Grid, Oblique Orbits, Multi-Tier Hybrid passes, and Road Following (Offset Path) flight patterns.
- **Freeform Flight Plan:** Build custom flight routes manually by clicking on the map.
- **Import/Export:** Import existing KMZ files to view, drag, and modify waypoints. Export generated flights as KMZ files for injection into controllers like the DJI RC2.
- **Waypoint Editor:** Comprehensive custom waypoint editor popup to change altitude, gimbal pitch, custom yaw values, and nudge position. Features a **Reset** button to restore modified waypoints to their original state.
- **3D Preview:** Interactive 3D preview modal of the generated flight path, complete with camera FOV cones and a photogrammetry coverage footprint heatmap. Includes pan, zoom, and auto-rotate controls.
- **FAA Airspace Overlays:** Live government-sourced airspace layers directly on the map, including:
  - VFR Sectional Charts
  - Controlled Airspaces (Class B/C/D/E)
  - Restricted/Special Use Airspaces
  - UAS Facility Maps (LAANC grids with altitude ceilings)
- **NOAA Weather Overlays:** Live weather overlays including NEXRAD Weather Radar and NWS Hazards (warnings, watches, and advisories) with dynamic legends.
- **Auto-Plan Mission Calculator:** Structure-aware calculator with height and clearance sliders to automatically recommend and generate grid patterns.
- **Mission Splitting:** Automatically splits missions exceeding a user-defined **Max Flight Time** into multiple KMZ files within a ZIP archive on export.

## Technologies Used

- **Vanilla HTML / CSS / JS:** No package manager or build system required.
- **[Leaflet (v1.9.4)](https://leafletjs.com/):** Core 2D interactive mapping. (License: [BSD 2-Clause](https://github.com/Leaflet/Leaflet/blob/main/LICENSE))
- **[Three.js (r128)](https://threejs.org/):** Core 3D engine for flight path visualization. (License: [MIT](https://github.com/mrdoob/three.js/blob/master/LICENSE))
- **[Esri Leaflet (v3.0.12)](https://github.com/Esri/esri-leaflet):** ArcGIS FeatureServer support for live FAA Airspace REST layers. (License: [Apache 2.0](https://github.com/Esri/esri-leaflet/blob/master/LICENSE))
- **[JSZip](https://stuk.github.io/jszip/):** Client-side generation of KMZ and ZIP archives. (License: [MIT / GPLv3 Dual](https://github.com/Stuk/jszip/blob/main/LICENSE.markdown))
- **[OpenStreetMap Nominatim API](https://nominatim.org/):** Geocoding and location search. (Data License: [ODbL](https://opendatacommons.org/licenses/odbl/))
- **[OSRM (Open Source Routing Machine)](http://project-osrm.org/):** Road snapping and auto-routing. (License: [BSD 2-Clause](https://github.com/Project-OSRM/osrm-backend/blob/master/LICENSE.TXT))
- **[NOAA/NWS GeoServer WMS](https://opengeo.ncep.noaa.gov/):** Real-time weather overlays. (License: Public Domain / U.S. Government Work)

## Getting Started

1. Open `index.html` in a modern web browser. While it can run as a local file (`file://`), running it through a local web server is recommended.
2. Select your desired **Flight Pattern** from the visual icon grid in the sidebar (e.g., Double Grid, Orbit, Freeform, Road Follow).
3. Search for a location, click **Locate Me**, import an existing KMZ, or simply click anywhere on the map to set your flight center/waypoints.
4. Adjust the **Grid Geometry**, **Camera & Overlap**, and **Flight Configuration** parameters as needed.
5. Use the **3D View** to verify your flight path, altitudes, and camera angles.
6. Click **Export KMZ** to download your mission file(s). Follow the in-app "Show RC2 Copy Instructions" for details on loading the mission onto your drone controller.
