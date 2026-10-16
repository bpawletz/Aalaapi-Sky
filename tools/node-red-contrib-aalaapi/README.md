# node-red-contrib-aalaapi

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-green.svg)](https://nodejs.org)
[![Aalaapi Bridge](https://img.shields.io/badge/Aalaapi_Bridge-v1.159.0-blue.svg)](https://github.com/bpawletz/Aalaapi-Sky)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Dedicated **Node-RED** node module providing real-time hardware sync, ASTM F3411 Remote ID radar, automated photo ingestion watching, and 3D Gaussian Splatting / COLMAP manifest preparation for **Aalaapi Sky Bridge** (port `8765`).

---

## 🚀 Features

- **`aalaapi-config`**: Centralized connection manager for Aalaapi Bridge (`127.0.0.1:8765`) with 1-click connection testing in the Node-RED editor.
- **`aalaapi-radar`**: Real-time ASTM F3411 Remote ID scanner stream / polling input node for tracking drone positions, AGL/MSL altitudes, and deconfliction boundaries.
- **`aalaapi-ingest-watch`**: Instant trigger node that emits whenever DJI RC 2 / SD card photos complete MTP ingestion, checksum validation, and telemetry correlation.
- **`aalaapi-splat-prep`**: Automated spatial transform node converting drone GPS, gimbal pitch, and optical field-of-view into **Nerfstudio `transforms.json`** ($4 \times 4$ camera matrices) and **COLMAP text priors** (`cameras.txt`, `images.txt`).

---

## 📦 Installation

To install into your local Node-RED user directory (`~/.node-red` or `%USERPROFILE%\.node-red`):

```bash
cd ~/.node-red
npm install /path/to/Aalaapi-Sky/tools/node-red-contrib-aalaapi
```

Or for development / symlinking:

```bash
cd ~/.node-red
npm link /path/to/Aalaapi-Sky/tools/node-red-contrib-aalaapi
```

Restart Node-RED. The **Aalaapi Sky** nodes will appear in your palette.

---

## 🛠 Included Nodes

### 1. `aalaapi-config`
Manages host, port, protocol, and timeout for connecting to the local or remote Aalaapi Bridge instance. Includes an interactive **Test Connection** button in the node properties dialog.

### 2. `aalaapi-radar`
Connects to Bridge's Server-Sent Events (SSE) `/api/stream` or polls `/api/remote-id/drones`.
- **Payload**:
  ```json
  {
    "count": 1,
    "totalActive": 1,
    "timestamp": "2026-10-16T10:30:00.000Z",
    "drones": [
      {
        "uasId": "1581F...",
        "latitude": 41.3215,
        "longitude": -88.9950,
        "heightAgl": 35.2,
        "altitudeMsl": 215.4,
        "heading": 182.5,
        "speed": 5.4
      }
    ]
  }
  ```

### 3. `aalaapi-ingest-watch`
Listens for completed photo ingestion batches from USB MTP or SD cards.
- **Payload**:
  ```json
  {
    "missionUuid": "mission_1729074000",
    "targetDir": "/workspace/scratch/mission_archives/mission_1729074000",
    "totalPhotos": 48,
    "photoPaths": [".../PHOTO_0001.JPG", ".../PHOTO_0002.JPG"],
    "manifest": { ... }
  }
  ```

### 4. `aalaapi-splat-prep`
Converts drone photo positions into Nerfstudio standard coordinates (OpenGL / Blender convention $+X$ right, $+Y$ up, $+Z$ back).
- **Outputs**:
  - `msg.transforms`: Schema-valid Nerfstudio `transforms.json` object.
  - `msg.transformsPath`: On-disk path to saved `transforms.json` (if write to disk is enabled).
  - `msg.colmapDir`: Directory containing `cameras.txt` and `images.txt` priors.

---

## 💡 Example Pipeline

Import `examples/auto-splat-pipeline.json` into Node-RED:

```
[Ingest Watch] ──► [Filter Quality] ──► [Generate transforms.json] ──► [Exec: ns-train splatfacto]
```

This immediately trains a 3D Gaussian Splat model upon plugging in an SD card or connecting the DJI RC 2 controller over USB!
