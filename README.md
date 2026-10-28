# Aalaapi Sky

**Drone Waypoint Mission Planner**

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-romah74-FFDD00?style=flat-square&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/romah74)

A waypoint mission generator and editor for drone flight planning. Designed for high-fidelity 2D mapping and 3D Gaussian Splats. It operates entirely in the browser using client-side technologies.

> **About the Name:** *Aalaapi* (Myaamia / Miami-Illinois) means **"Look in a particular direction, observe."** It highlights the scanner/camera observing and planning paths from the sky.

---

## Disclaimer & Legal Warning

> [!WARNING]
> **USE AT YOUR OWN RISK.** This software is provided strictly gratuitously (free of charge) solely for flight planning visualization, preview, and educational purposes. It is **NOT** certified avionics, navigation, or flight-control software under any national or international aviation authority, including the **FAA (United States)**, **EASA (European Union)**, **UK CAA (United Kingdom)**, **Transport Canada (CARs)**, **CASA (Australia)**, **JCAB (Japan)**, or **ICAO**.
>
> * **No Liability for Physical Assets & International Civil-Law Immunity:** The developers and contributors of Aalaapi Sky assume absolutely no responsibility or liability worldwide for hardware loss, drone crashes, "flyaways", property damage, personal injury, privacy/radio-frequency violations, or legal violations resulting from the use of flight plans generated or edited by this software. Because the software is provided free of charge, the authors and contributors invoke the maximum statutory immunity for gratuitous software providers under all domestic and foreign civil codes (including EU/EEA, UK, and Commonwealth laws) alongside **GNU AGPLv3 Sections 15, 16, and 17** and **Section 7(b)**. Users outside the United States access and operate this software entirely at their own initiative and risk.
> * **Pilot Responsibility Worldwide:** The Remote Pilot in Command (PIC) or operator in any jurisdiction is solely responsible for the safe and lawful operation of their aircraft. You must independently verify all flight altitudes, waypoint clearances, local obstacles, weather conditions, and active airspace restrictions (including obtaining appropriate FAA LAANC or national airspace authorizations). All flights must comply with applicable national and international aviation regulations, such as **FAA Part 107 / Section 44809 (US)**, **EASA Open/Specific Categories (EU)**, **UK CAA CAP 722**, **Transport Canada CARs Part IX**, or **CASA Part 101**, including keeping the aircraft within Visual Line of Sight (VLOS) at all times.
> * **Third-Party Data & Live Feeds:** This software displays data retrieved directly from external, third-party government servers (such as live FAA airspace grids, NOAA/NWS weather radar, and HIFLD infrastructure assets). The developers and contributors assume no responsibility for any inaccuracies, omissions, service outages, or latency in these external data feeds. Pilots must independently cross-reference and verify all flight planning constraints using official source publications (such as aeronautical charts, active NOTAMs, and direct NOAA briefings).
> * **Emergency Procedures & Fail-Safes:** The pilot is solely responsible for knowing how to immediately abort an automated waypoint mission and resume manual control on their specific aircraft. Before takeoff, you must verify and configure all fail-safe emergency procedures—including signal loss behaviors and Return-to-Home (RTH) altitudes—to ensure the drone safely clears all local terrain, trees, power lines, and obstacles in the event of an emergency or connection loss.
> * **Trademark & Non-Affiliation Legal Disclaimer:** **Aalaapi**, **Aalaapi Sky**, **Aalaapi Bridge**, and the **Aalaapi Sky Myaamia Rosette Drone Logo** are protected first-party marks of the Aalaapi Sky Contributors (`AGPLv3 Section 7(e)`). DJI, DJI Fly, DJI Pilot, WPML, Mini 4 Pro, Air 3, Mavic, Matrice, and Inspire are trademarks or registered trademarks of SZ DJI Technology Co., Ltd. Google, Google Earth, KML, and GPano are trademarks of Google LLC. Esri, ArcGIS, and ArcGIS Online are trademarks of Environmental Systems Research Institute, Inc. OpenStreetMap is a trademark of the OpenStreetMap Foundation. Aalaapi Sky is an independent third-party flight planning tool and is **NOT** affiliated with, authorized by, sponsored by, or endorsed by DJI, Google, Esri, or any mentioned manufacturer. For complete software licensing, third-party open-source software licenses, data provider attributions, and legal notices, see [LICENSE](LICENSE) and [CREDITS.md](CREDITS.md).

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
- **Native Breakpoint Resume Support:** Missions spanning multiple batteries seamlessly utilize DJI RC 2's native Breakpoint Resume. When the battery reaches RTH threshold, the drone returns to home; after a quick battery swap, DJI Fly prompts to continue from the exact breakpoint.
- **DJI RC2 Support:** Generates controller-compatible KMZ outputs with detailed on-screen setup instructions.

---

## Technologies Used

*For detailed licenses, copyright notices, and third-party terms, see [CREDITS.md](CREDITS.md).*

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

---

## 🛠 DJI RC 2 Companion Tools

The [`tools/`](file:///c:/Users/bpawl/OneDrive/code/Aalaapi-Sky/tools/) directory includes automated utilities for DJI RC 2 controllers over USB MTP:
* **`tools/rc2-sync.bat`**: Watches `Downloads` and automatically syncs exported KMZs and map preview thumbnails to the RC 2's active waypoint directory.
* **`tools/extract-latest-flight.bat`**: Pulls and analyzes the newest flight logs, missions, thumbnails, and telemetry database from both `Downloads` and the connected RC 2.
* **`tools/map-rc2.bat`**: Scans the connected controller and generates a complete storage map report.

See the [Companion Tools README](file:///c:/Users/bpawl/OneDrive/code/Aalaapi-Sky/tools/README.md) for detailed instructions.

---

## ⚖️ Software License, International Liability Shield & Trademark Policy

Aalaapi Sky is licensed under the **GNU Affero General Public License v3.0 (`AGPL-3.0-only`)** supplemented with **AGPLv3 Section 7 (`7(b)`, `7(c)`, `7(e)`, `7(f)`) Additional Terms**. See [LICENSE](LICENSE) and [CREDITS.md](CREDITS.md) for full legal text.

1. **No Commercial Software Resale or Proprietary SaaS Hosting (`AGPLv3 Section 13`):**
   You may not sell, lease, sublicense, or offer Aalaapi Sky (or modified versions) as a proprietary commercial software product or closed-source managed web/cloud service (SaaS). Any network-hosted deployment or derivative work must make its complete corresponding source code freely available to all network users under the GNU AGPLv3.
2. **Worldwide Aviation Risk Disclaimers & Gratuitous Software Immunity (`AGPLv3 Sections 15–17 & Section 7(b)`):**
   All copies, forks, and network deployments must preserve the worldwide aviation, hardware, and airspace disclaimers (`FAA`, `EASA`, `UK CAA`, `Transport Canada`, `CASA`, `JCAB`, `ICAO`) and gratuitous civil-law liability shields.
3. **Origin Marking & Anti-Misrepresentation (`AGPLv3 Section 7(c)`):**
   Any modified version distributed or hosted over a network must be conspicuously marked in its UI and documentation as an unofficial modified version distinct from the official Aalaapi Sky project.
4. **First-Party Trademark Protection (`AGPLv3 Section 7(e)`):**
   This license does **not** grant any rights to use the **"Aalaapi"**, **"Aalaapi Sky"**, **"Aalaapi Bridge"** names or the **Aalaapi Sky Myaamia Rosette Drone Logo** to sell, host, promote, or endorse commercial software distributions, paid hosting services, or third-party products without prior written permission.
5. **Mandatory Worldwide Indemnification (`AGPLv3 Section 7(f)`):**
   Anyone in any jurisdiction who redistributes, modifies, or hosts the software over a network—or assumes any contractual warranty or liability—must **indemnify, defend, and hold harmless** the authors and contributors of Aalaapi Sky against any domestic or international lawsuits, claims, or liabilities arising from their distribution or service.
6. **Unrestricted Pilot Mission Outputs:**
   Flight plans, DJI WPML (`.kmz` / `.wpml`) packages, JSON mission files, photogrammetry manifests, and compliance reports generated by users through normal operation of Aalaapi Sky are user data outputs. Pilots and organizations worldwide (including FAA Part 107, EASA, UK CAA, Transport Canada, and CASA operators) may freely use generated mission outputs for flight operations without restriction.

---

## ☕ Buy Me a Coffee

Aalaapi Sky is provided free of charge as open-source software. If you enjoy using this flight planner and want to buy the developer a coffee, you can leave a voluntary tip at **[buymeacoffee.com/romah74](https://buymeacoffee.com/romah74)**.

*(Note: Voluntary tip/gift only — does not imply or include technical software support, service-level agreements, or warranties of any kind.)*






