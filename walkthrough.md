# Aalaapi Sky — Feature Walkthrough

## 1. Flight Pattern Icon Selector
Pattern selection was redesigned from a plain dropdown into an 8-card visual icon grid. Each card shows an SVG diagram representing the pattern plus a short label.

| Pattern | Card Label |
|---|---|
| 2D Map (Nadir Grid) | 2D Grid |
| 3D Splat (Double Grid) | Double Grid |
| 3D Object (Circular Orbit) | Orbit |
| 3D Object (Multi-Tiered Orbit) | Multi-Orbit |
| 2D + 3D Hybrid (Grid + Orbit Combo) | Hybrid Combo |
| 2D + 3D Hybrid (Grid + Multi-Orbit) | Multi-Hybrid |
| Road Following | Road Follow |
| Freeform | Freeform |

The native `<select>` element is still in the DOM (hidden) for compatibility. Card clicks sync the hidden select value and trigger `updateGrid()`.

---

## 2. 3D Preview Pan Support
The 3D preview modal now supports right-click + drag panning in addition to the existing left-click rotate and scroll-to-zoom. This is handled by Three.js `OrbitControls` with `enablePan: true`.

---

## 3. Multi-Orbit Waypoint Persistence Fix
Switching to the Multi-Orbit pattern no longer clears Road-Following or Freeform waypoints. The `updateGrid()` function was updated so that only grid-generated waypoints are cleared when switching between auto-computed patterns — manually-placed waypoints are preserved.

---

## 4. Waypoint Reset Button
A **Reset** button appears inside waypoint detail popups when the waypoint has been modified (dragged on the map, altitude/pitch/heading changed, etc.).

**Behaviour:**
- Hidden when the waypoint is in its original state.
- Appears immediately on any change (drag, nudge, popup slider).
- Clicking Reset restores the waypoint to its original coordinates, altitude, pitch, heading, and ring settings.
- The modified marker color clears and the flight path/stats update instantly.

**Implementation:** Each waypoint object stores `origLat`, `origLon`, `origAlt`, `origPitch`, `origHeading`, `origIsRingStart`. These are captured at creation time in `updateGrid()`, `addFreeformWaypoint()`, `addRoadWaypoint()`, and `parseKMZ()`.

---

## 5. FAA Airspace Overlays (v1.8.0)

Four government-sourced airspace layers were added to the Leaflet layer control as toggleable overlays. None are active by default.

### Layers Added

| Overlay | Source | Description |
|---|---|---|
| **VFR Sectional Chart** | FAA / ArcGIS Tile Server | Full aeronautical raster chart at 55% opacity |
| **Controlled Airspace (Class B/C/D/E)** | FAA FeatureServer | Color-coded airspace polygons with popup details |
| **Restricted & Special Use Airspace** | FAA FeatureServer | Prohibited/restricted/MOA areas in red/amber |
| **UAS Facility Maps (LAANC)** | FAA FeatureServer | Drone altitude ceiling grids with permanent `ft` labels |

### Airspace Color Key

**Controlled Airspace:**
- 🔵 Class B — Deep Blue (`#2563eb`)
- 🟣 Class C — Purple (`#a855f7`)
- 🩷 Class D — Hot Pink (`#ec4899`)
- 🟢 Class E — Emerald Green (`#10b981`)

**UAS Facility Maps (ceiling altitude):**
- 🔴 0 ft — Red (No drone operations allowed without LAANC authorization)
- 🟠 ≤100 ft — Orange
- 🟡 ≤200 ft — Amber
- 🟡 ≤300 ft — Yellow
- 🟢 400 ft — Green (Standard recreational max)

### Implementation Details

- **Library:** [Esri Leaflet v3.0.12](https://unpkg.com/esri-leaflet@3.0.12/dist/esri-leaflet.js) loaded via CDN for ArcGIS FeatureServer support.
- **FAA Endpoints:**
  - VFR Tiles: `https://tiles.arcgis.com/tiles/ssFJjBXIUyZDrSYZ/arcgis/rest/services/VFR_Sectional/MapServer/tile/{z}/{y}/{x}`
  - Class Airspace: `https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/Class_Airspace/FeatureServer/0`
  - Special Use: `https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/Special_Use_Airspace/FeatureServer/0`
  - LAANC: `https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/FAA_UAS_FacilityMap_Data/FeatureServer/0`
- Esri Leaflet automatically queries only the current map viewport bounding box, keeping responses lightweight.
- Changes applied to both [index.js](file:///c:/Users/bpawl/OneDrive/code/DronePlanning/index.js) (source) and [index.html](file:///c:/Users/bpawl/OneDrive/code/DronePlanning/index.html) (built standalone file).

---

## 6. NOAA Weather Overlays (v1.9.0)

Two official NWS/NOAA weather overlay layers have been integrated as optional toggleable layers. They are hosted on cloud-native OGC-compliant NCEP servers, requiring no API keys.

### Weather Layers Added

| Overlay | Source | Description |
|---|---|---|
| **Weather Radar (NEXRAD)** | NOAA/NWS GeoServer WMS | Real-time composite precipitation radar at 45% opacity |
| **Weather Warnings (NWS Hazards)** | NOAA/NWS GeoServer WMS | Real-time active weather watches, warnings, and advisories at 35% opacity |

### Implementation Details

- **WMS Layer IDs:**
  - Weather Radar: `conus:conus_bref_qcd`
  - Weather Warnings: `wwa:hazards`
- **WMS Server Endpoint:** `https://opengeo.ncep.noaa.gov/geoserver/ows`
- Served using Leaflet's high-performance native `L.tileLayer.wms` (which requests pre-rendered server-side image tiles, keeping the frontend fast and memory-efficient).

### Dynamic Map Overlays Legend

When weather overlays are active, a unified **Map Overlays** legend is displayed at the bottom-left of the map:
- **Weather Radar:** Renders a sleek linear color bar representing precipitation intensity (light cyan representing light rain, gradient scaling through green, yellow, and red to purple representing severe storm reflectivity).
- **Weather Warnings:** Renders color keys for warning areas (Red = Active Warning Area; Orange = Active Watch/Advisory).

---

## How to Test the Weather Overlays

1. Open [index.html](file:///c:/Users/bpawl/OneDrive/code/DronePlanning/index.html) in a browser.
2. Open the **layer icon** (⊕) in the **top-left corner**.
3. Under **Overlays**, toggle **Weather Radar (NEXRAD)** — you should see active rain/precipitation patterns if there are storms in the United States.
4. Toggle **Weather Warnings (NWS Hazards)** — active weather warning polygons should load over the map.
5. Verify that the bottom-left legend updates dynamically to show the **Weather Radar** intensity bar and the **Weather Warnings** color key.

### Verification Screenshot

Below is a live screenshot of the application running on Chrome (loaded via localhost web server) confirming that the Leaflet map and satellite layers are loading successfully:

![Aalaapi Sky loaded on local server](/C:\Users\bpawl\.gemini\antigravity\brain\93596695-ae89-4291-bd63-28c2b6eefd09\sample_screenshot.png)

---

## 6. Map & Remote ID Alignment Calibration (v1.61.0 - v1.61.1)

When monitoring live ASTM F3411 Remote ID broadcasts from consumer drones (e.g. DJI Mini 4 Pro, Air 3, Mavic 3), small visual shifts (typically 1–5 meters) can occur between physical landing positions and satellite imagery basemaps (Esri World Imagery, OpenStreetMap) due to aerial photography orthorectification offsets and civilian GNSS variance.

### Features
- **Floating Alignment Control (`#remote-id-calibrate-btn`):** Appears beside the airspace radar pill whenever a Remote ID drone is detected.
- **Directional Nudge D-Pad:** 4-way nudge buttons (`▲ N`, `▼ S`, `◀ W`, `E ▶`) with selectable step sizes (`0.5m`, `1.0m`, `5.0m`) to nudge overlay positions in real-time.
- **Streamlined Nudge-Only Architecture (v1.61.1):** Standardized purely on the reliable, high-precision Nudge D-Pad controls and eliminated marker drag-to-align interaction to prevent map drag conflicts and ensure rock-solid responsiveness on touchscreen and desktop mice alike.
- **Synchronous Rigid-Frame Translation:** Drone marker, takeoff/home location pin, connecting home vector lines, and historical breadcrumbs all shift synchronously without distortion.
- **LocalStorage Persistence & 1-Click Reset:** Saves active site offsets automatically in `localStorage`, with a 1-click `Reset to GPS (0m)` button to restore pure broadcast coordinates.
- **Marker Anchor Centering:** Corrected Leaflet `divIcon` centering on the drone marker (`[19, 19]`) and takeoff pin (`[18, 13]`), eliminating subpixel visual offset artifacts.

