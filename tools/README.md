# Aalaapi Sky - Companion Tools & Scripts

A collection of lightweight automation tools for seamless DJI RC 2 synchronization, storage reconnaissance, and flight data analysis.

---

## 🛠 Available Tools

### 1. `rc2-sync` — Real-Time DJI RC 2 Auto-Sync
**Files:** [`rc2-sync.bat`](file:///c:/Users/bpawl/OneDrive/code/Aalaapi-Sky/tools/rc2-sync.bat), [`rc2-sync.ps1`](file:///c:/Users/bpawl/OneDrive/code/Aalaapi-Sky/tools/rc2-sync.ps1)

- **Purpose:** Automatically transfers exported `.kmz` waypoint missions and map preview route thumbnails (`.jpg`) to a connected DJI RC 2 controller over USB MTP.
- **How to use:**
  1. Connect your DJI RC 2 to your computer via USB-C and ensure it is in **File Transfer** mode.
  2. Double-click `tools\rc2-sync.bat`.
  3. In Aalaapi Sky, click **Export KMZ**.
  4. The script detects the download, matches the mission UUID, and immediately transfers both the `.kmz` and `.jpg` into the controller's active mission folder.

---

### 2. `extract-latest-flight` — Latest Flight Data & Log Extractor
**Files:** [`extract-latest-flight.bat`](file:///c:/Users/bpawl/OneDrive/code/Aalaapi-Sky/tools/extract-latest-flight.bat), [`extract-latest-flight.ps1`](file:///c:/Users/bpawl/OneDrive/code/Aalaapi-Sky/tools/extract-latest-flight.ps1)

- **Purpose:** Pulls the newest flight telemetry logs, active waypoint missions, route preview images, and internal database records from both your computer's `Downloads` folder and a connected DJI RC 2.
- **Output:** Saves all files to `scratch/latest_flight/` and outputs a full mission summary to the console:
  - Aircraft target model & firmware enumeration
  - Waypoint count & total trajectory length
  - Global transitional flight speed & finish actions
  - Waypoint coordinates, heading modes (`followWayline` vs. `smoothTransition`), angles, and gimbal pitches
  - POI coordinate validation check
- **How to use:**
  - Double-click `tools\extract-latest-flight.bat` or run `powershell .\tools\extract-latest-flight.ps1`.

---

### 3. `map-rc2` — RC 2 Storage Reconnaissance & Mapping Tool
**Files:** [`map-rc2.bat`](file:///c:/Users/bpawl/OneDrive/code/Aalaapi-Sky/tools/map-rc2.bat), [`map-rc2.ps1`](file:///c:/Users/bpawl/OneDrive/code/Aalaapi-Sky/tools/map-rc2.ps1)

- **Purpose:** Recursively scans the entire file system of a connected DJI RC 2 controller (`Internal shared storage` and `SD_Card`).
- **Output:** Displays a live color-coded folder hierarchy and generates a complete inventory report at [`tools/rc2_storage_map.md`](file:///c:/Users/bpawl/OneDrive/code/Aalaapi-Sky/tools/rc2_storage_map.md) cataloging all directories and files by type.
- **How to use:**
  - Double-click `tools\map-rc2.bat` or run `powershell .\tools\map-rc2.ps1`.

---

## 📋 Requirements
- Windows 10 / 11 with PowerShell 5.1+
- DJI RC 2 connected via USB-C in File Transfer (MTP) mode
- Python 3.x (optional, used for in-depth KMZ parsing in `extract-latest-flight`)
