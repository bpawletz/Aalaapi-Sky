# Third-Party Credits, Open Source Licenses & Trademark Notices

Aalaapi Sky is built upon open-source software, open geographic and aeronautical data feeds, and community resources. We gratefully acknowledge the creators, contributors, and maintainers of these projects.

---

## 1. Open Source Software Libraries

The following third-party software libraries and components are utilized in Aalaapi Sky:

### Leaflet
* **Project**: [Leaflet](https://leafletjs.com/)
* **Authors**: Vladimir Agafonkin and CloudMade
* **License**: BSD 2-Clause License
* **Usage**: Core interactive 2D web mapping engine, tile layer rendering, coordinate transformations, and vector overlays.
* **Notice**:
  ```text
  Copyright (c) 2010-2023, Vladimir Agafonkin
  Copyright (c) 2010-2011, CloudMade
  All rights reserved.

  Redistribution and use in source and binary forms, with or without modification, are
  permitted provided that the following conditions are met:

     1. Redistributions of source code must retain the above copyright notice, this list of
        conditions and the following disclaimer.

     2. Redistributions in binary form must reproduce the above copyright notice, this list
        of conditions and the following disclaimer in the documentation and/or other materials
        provided with the distribution.

  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY
  EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
  MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE
  COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
  EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
  SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
  HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
  TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
  SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
  ```

### Three.js & OrbitControls
* **Project**: [Three.js](https://threejs.org/)
* **Authors**: Ricardo Cabello (mrdoob) and Three.js authors
* **License**: MIT License
* **Usage**: GPU-accelerated WebGL 3D Digital Twin, FPV Cockpit simulation, camera frustum FOV cones, and 3D architectural wireframe rendering.
* **Notice**:
  ```text
  The MIT License

  Copyright © 2010-2024 three.js authors

  Permission is hereby granted, free of charge, to any person obtaining a copy
  of this software and associated documentation files (the "Software"), to deal
  in the Software without restriction, including without limitation the rights
  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  copies of the Software, and to permit persons to whom the Software is
  furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in
  all copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
  THE SOFTWARE.
  ```

### Esri Leaflet
* **Project**: [Esri Leaflet](https://github.com/Esri/esri-leaflet)
* **Authors**: Environmental Systems Research Institute, Inc. (Esri)
* **License**: Apache License, Version 2.0
* **Usage**: Consuming official FAA ArcGIS REST FeatureServer layers (Class B/C/D/E Airspace, Special Use Airspace, UAS Facility Maps, Digital Obstacle File).
* **Notice**:
  ```text
  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
  ```

### JSZip
* **Project**: [JSZip](https://stuk.github.io/jszip/)
* **Authors**: Stuart Knightley, David Duponchel, Franz Buchinger, António Afonso
* **License**: MIT License / Dual licensed
* **Usage**: In-browser compilation and extraction of DJI KMZ mission packages, inspection zip archives, and deliverable bundles.
* **Notice**:
  ```text
  Copyright (c) 2009-2016 Stuart Knightley, David Duponchel, Franz Buchinger, António Afonso

  Permission is hereby granted, free of charge, to any person obtaining a copy
  of this software and associated documentation files (the "Software"), to deal
  in the Software without restriction, including without limitation the rights
  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  copies of the Software, and to permit persons to whom the Software is
  furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in
  all copies or substantial portions of the Software.
  ```

### Web Fonts: Outfit & Plus Jakarta Sans
* **Outfit**: Designed by On caps and Rodrigo Fuenzalida. Licensed under the [SIL Open Font License, Version 1.1](https://openfontlicense.org/).
* **Plus Jakarta Sans**: Designed by Tokotype and Gumpita Rahayu. Licensed under the [SIL Open Font License, Version 1.1](https://openfontlicense.org/).

---

## 2. Geospatial, Aeronautical & Meteorological Data Providers

Aalaapi Sky interfaces with public geospatial, aviation, and meteorological feeds. These data services are provided courtesy of their respective source institutions:

### OpenStreetMap
* **Data & Tiles**: [OpenStreetMap](https://www.openstreetmap.org/)
* **License**: [Open Database License (ODbL)](https://opendatacommons.org/licenses/odbl/)
* **Attribution**: &copy; OpenStreetMap contributors. Cartography and geocoding services via Nominatim.

### OpenTopoMap & SRTM
* **Data & Tiles**: [OpenTopoMap](https://opentopomap.org/)
* **License**: [Creative Commons Attribution-ShareAlike 3.0 (CC-BY-SA 3.0)](https://creativecommons.org/licenses/by-sa/3.0/)
* **Attribution**: Map data: &copy; OpenStreetMap contributors, SRTM (Shuttle Radar Topography Mission, NASA/NGA via viewfinderpanoramas.org). Map style: &copy; OpenTopoMap.

### Esri ArcGIS Online
* **Basemaps**: [World Imagery & World Street Map](https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9)
* **Attribution**: Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community.

### Federal Aviation Administration (FAA)
* **Aviation Data**: Aeronautical Information Services (AIS) Open Data
* **Services**: VFR Sectional Chart tiles, Class B/C/D/E Controlled Airspace, Special Use Airspace (SUA), UAS Facility Maps (LAANC maximum allowable ceiling grids), Digital Obstacle File (DOF), Temporary Flight Restrictions (TFRs), and Stadium areas.
* **Rights**: U.S. Government work in the public domain.

### National Oceanic and Atmospheric Administration (NOAA) / National Weather Service (NWS)
* **Weather Data**: NWS GeoServer WMS
* **Services**: High-resolution composite reflectivity NEXRAD radar (`conus:conus_bref_qcd`) and active hazardous weather warnings (`wwa:hazards`).
* **Rights**: U.S. Government work in the public domain.

### Iowa Environmental Mesonet (IEM) / NOAA GOES
* **Satellite Feeds**: Iowa State University Department of Agronomy
* **Services**: GOES-East CONUS Channel 13 Clean Longwave Window Infrared satellite cloud cover tiles (`goes_east_conus_ch13`).
* **Rights**: Educational and open public access data service.

### National Aeronautics and Space Administration (NASA)
* **Nighttime Imagery**: Global Imagery Browse Services (GIBS) / EOSDIS
* **Services**: Suomi NPP / VIIRS Black Marble Day-Night Band Night Lights imagery (`VIIRS_Black_Marble`).
* **Rights**: NASA Open Data Policy.

### Homeland Infrastructure Foundation-Level Data (HIFLD)
* **Infrastructure Data**: Department of Homeland Security (DHS) / USGS
* **Services**: Electric Power Transmission Lines REST service.
* **Rights**: U.S. Government work in the public domain.

### Open-Meteo
* **Elevation API**: [Open-Meteo.com](https://open-meteo.com/)
* **License**: [Creative Commons Attribution 4.0 International (CC-BY 4.0)](https://creativecommons.org/licenses/by/4.0/)
* **Data Sources**: Digital Elevation Models sourced from European Space Agency (ESA) WorldCover, Copernicus DEM, and USGS 3DEP.

### Project OSRM (Open Source Routing Machine)
* **Routing Engine**: [Project OSRM](https://project-osrm.org/)
* **Authors**: Dennis Luxen, Christian Vetter, and OSRM contributors
* **License**: BSD 2-Clause License
* **Usage**: Road network polyline snapping and vehicle routing path interpolation.

### The OpenSky Network
* **Airspace Explorer**: [The OpenSky Network](https://opensky-network.org/)
* **Usage**: Direct pilot links for surrounding manned air traffic exploration.
* **Organization**: The OpenSky Network is a non-profit association based in Switzerland.

---

## 3. Cultural & Linguistic Heritage Attribution

The name **Aalaapi Sky** incorporates the Myaamia (Miami-Illinois) term:
* **aalaapi-** *(No-object Verb)*: "Look in a particular direction, observe."
* **Source**: Miami-Illinois Indigenous Languages Digital Archive (ILDA), Entry 1873.
* **Acknowledgment**: Courtesy of the [Myaamia Center](https://www.miamioh.edu/myaamia-center/) at Miami University. We honor and acknowledge the Myaamia people and their language.

---

## 4. Trademark Legal Disclaimers ("The Legalize")

The product names, registered trademarks, service marks, and trade names referenced in Aalaapi Sky, its documentation, and its source code belong to their respective owners:

1. **DJI**:
   * **Trademarks**: **DJI®**, **DJI Fly™**, **DJI Pilot™**, **DJI RC™**, **DJI RC 2™**, **DJI RC Pro™**, **DJI Mini™** (including Mini 4 Pro), **DJI Air™** (including Air 3), **DJI Mavic™**, **DJI Inspire™**, **DJI Matrice™**, and **WPML™** (Waypoint Markup Language) are trademarks or registered trademarks of **SZ DJI Technology Co., Ltd.**
   * **Legal Disclaimer**: Aalaapi Sky is an independent, open-source third-party flight planning software project. Aalaapi Sky is **not affiliated with, authorized by, sponsored by, endorsed by, or certified by SZ DJI Technology Co., Ltd.** Any reference to DJI hardware, firmware, remotes, or file structures is made solely for descriptive compatibility, flight-planning interoperability, and educational purposes.

2. **Google**:
   * **Trademarks**: **Google®**, **Google Earth™**, **Google Maps™**, **KML™**, **GPano™**, **Android™**, and **Chrome™** are trademarks or registered trademarks of **Google LLC**.
   * **Legal Disclaimer**: Mention of Google Earth or KML specifications is for data exchange and 3D preview compatibility.

3. **Esri**:
   * **Trademarks**: **Esri®**, **ArcGIS®**, **ArcGIS Online™**, and the Esri logo are trademarks or registered trademarks of **Environmental Systems Research Institute, Inc.**
   * **Legal Disclaimer**: Mention of Esri and ArcGIS REST services is for spatial data access and map visualization.

4. **OpenStreetMap**:
   * **Trademarks**: **OpenStreetMap®** is a registered trademark of the **OpenStreetMap Foundation**.

5. **Apple**:
   * **Trademarks**: **Apple®**, **iPad®**, **iPhone®**, **macOS®**, and **Safari®** are registered trademarks of **Apple Inc.**

6. **OpenJS Foundation**:
   * **Trademarks**: **Node-RED®** is a registered trademark of the **OpenJS Foundation**.

7. **The Khronos Group**:
   * **Trademarks**: **WebGL®** is a registered trademark of **The Khronos Group Inc.**

All other brand names, product names, registered marks, and trademarks mentioned within this repository or application are the property of their respective holders. Their mention does not imply any sponsorship, endorsement, authorization, or affiliation.
