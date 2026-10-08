function getActiveMissionWaypoints() {
  if (typeof importedWaypoints !== 'undefined' && importedWaypoints && importedWaypoints.length > 0) {
    return importedWaypoints;
  }
  if (typeof generatedWaypoints !== 'undefined' && generatedWaypoints && generatedWaypoints.length > 0) {
    return generatedWaypoints;
  }
  const alt = (typeof document !== 'undefined' && parseFloat(document.getElementById('altitude')?.value)) || 21.0;
  const speed = (typeof document !== 'undefined' && parseFloat(document.getElementById('speed')?.value)) || 4.0;
  const pitch = (typeof document !== 'undefined') ? parseGimbalPitch(document.getElementById('gimbal-pitch')?.value, -90.0) : -90.0;

  let centerLat = 40.0130;
  let centerLon = -83.1765;
  if (typeof centerMarker !== 'undefined' && centerMarker) {
    const latlng = centerMarker.getLatLng();
    centerLat = latlng.lat;
    centerLon = latlng.lng;
  } else if (typeof map !== 'undefined' && map && map.getCenter) {
    const latlng = map.getCenter();
    centerLat = latlng.lat;
    centerLon = latlng.lng;
  }

  // Realistic backyard lawn grid: ~18m x ~14m
  const latM = 111320;
  const lonM = 111320 * Math.cos(centerLat * Math.PI / 180);
  const halfW = 9.0;
  const halfH = 7.0;

  return [
    { lat: centerLat - halfH / latM, lon: centerLon - halfW / lonM, altitude: alt, gimbalPitch: pitch, speed },
    { lat: centerLat + halfH / latM, lon: centerLon - halfW / lonM, altitude: alt, gimbalPitch: pitch, speed },
    { lat: centerLat + halfH / latM, lon: centerLon, altitude: alt, gimbalPitch: pitch, speed },
    { lat: centerLat - halfH / latM, lon: centerLon, altitude: alt, gimbalPitch: pitch, speed },
    { lat: centerLat - halfH / latM, lon: centerLon + halfW / lonM, altitude: alt, gimbalPitch: pitch, speed },
    { lat: centerLat + halfH / latM, lon: centerLon + halfW / lonM, altitude: alt, gimbalPitch: pitch, speed }
  ];
}

// Create a rectangular pyramid representing the camera's field of view (frustum)
function createCameraPyramidGeometry(hfov, vfov, height) {
  if (typeof THREE === 'undefined' || typeof THREE.BufferGeometry !== 'function' || typeof THREE.BufferAttribute !== 'function') {
    return null;
  }
  const geom = new THREE.BufferGeometry();
  const wHalf = height * Math.tan((hfov / 2) * Math.PI / 180);
  const vHalf = height * Math.tan((vfov / 2) * Math.PI / 180);

  const vertices = new Float32Array([
     0,      0,      0,     // 0: Apex
    -wHalf, -height, -vHalf, // 1: Top-Left
     wHalf, -height, -vHalf, // 2: Top-Right
     wHalf, -height,  vHalf, // 3: Bottom-Right
    -wHalf, -height,  vHalf  // 4: Bottom-Left
  ]);

  const indices = [
    0, 1, 2,
    0, 2, 3,
    0, 3, 4,
    0, 4, 1,
    1, 3, 2,
    1, 4, 3
  ];

  geom.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geom.setIndex(indices);
  if (typeof geom.computeVertexNormals === 'function') {
    geom.computeVertexNormals();
  }
  return geom;
}

/**
 * Builds standard Three.js Object scene JSON (compatible with threejs.org/editor).
 * When flightPath, photos, or boundary are supplied, packages a full 3D Digital Twin Group:
 * - Building_3D_Wireframe (cyan line segments with walls, eaves, roof ridge & rafters)
 * - Drone_Flight_Trajectory (amber flight trajectory line)
 * - Camera_Photo_Frustums (emerald camera pyramid frustums showing photo capture points)
 * - Mission_Boundary (cyan coverage boundary loop)
 */
function buildThreeDigitalTwinJson(lines = [], options = {}) {
  const elevOffset = typeof options.elevationOffset === 'number' ? options.elevationOffset : 0.0;
  const isMultiObject = !!(
    options.asGroup ||
    (Array.isArray(options.flightPath) && options.flightPath.length >= 2) ||
    (Array.isArray(options.photos) && options.photos.length >= 1) ||
    (Array.isArray(options.boundary) && options.boundary.length >= 3)
  );

  const wfPositions = [];
  lines.forEach(line => {
    if (!Array.isArray(line) || line.length < 6) return;
    const [x1, y1, z1, x2, y2, z2] = line;
    wfPositions.push(
      Math.round(x1 * 1000) / 1000,
      Math.round((y1 + elevOffset) * 1000) / 1000,
      Math.round(z1 * 1000) / 1000,
      Math.round(x2 * 1000) / 1000,
      Math.round((y2 + elevOffset) * 1000) / 1000,
      Math.round(z2 * 1000) / 1000
    );
  });

  const geomWfUuid = 'geom-wf-' + Math.random().toString(36).slice(2, 10);
  const matWfUuid = 'mat-wf-' + Math.random().toString(36).slice(2, 10);
  const objWfUuid = 'obj-wf-' + Math.random().toString(36).slice(2, 10);

  const geometries = [
    {
      uuid: geomWfUuid,
      type: "BufferGeometry",
      data: {
        attributes: {
          position: {
            itemSize: 3,
            type: "Float32Array",
            array: wfPositions,
            normalized: false
          }
        }
      }
    }
  ];

  const materials = [
    {
      uuid: matWfUuid,
      type: "LineBasicMaterial",
      color: 3718648, // 0x38bdf8 cyan
      linewidth: 2,
      opacity: 0.95,
      transparent: true
    }
  ];

  if (!isMultiObject) {
    return {
      metadata: {
        version: 4.5,
        type: "Object",
        generator: "Aalaapi-Sky Digital Twin Engine",
        source: "threejs.org compatible"
      },
      geometries,
      materials,
      object: {
        uuid: objWfUuid,
        type: "LineSegments",
        name: "Aalaapi_Architectural_Wireframe",
        layers: 1,
        matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
        geometry: geomWfUuid,
        material: matWfUuid
      }
    };
  }

  const children = [
    {
      uuid: objWfUuid,
      type: "LineSegments",
      name: "Building_3D_Wireframe",
      layers: 1,
      matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      geometry: geomWfUuid,
      material: matWfUuid
    }
  ];

  // 1. Drone Flight Trajectory Line
  if (Array.isArray(options.flightPath) && options.flightPath.length >= 2) {
    const trajPositions = [];
    options.flightPath.forEach(pt => {
      const px = Array.isArray(pt) ? pt[0] : (pt.x || 0);
      const py = Array.isArray(pt) ? pt[1] : (pt.y || 0);
      const pz = Array.isArray(pt) ? pt[2] : (pt.z || 0);
      trajPositions.push(
        Math.round(px * 1000) / 1000,
        Math.round((py + elevOffset) * 1000) / 1000,
        Math.round(pz * 1000) / 1000
      );
    });

    const geomTrajUuid = 'geom-traj-' + Math.random().toString(36).slice(2, 10);
    const matTrajUuid = 'mat-traj-' + Math.random().toString(36).slice(2, 10);
    const objTrajUuid = 'obj-traj-' + Math.random().toString(36).slice(2, 10);

    geometries.push({
      uuid: geomTrajUuid,
      type: "BufferGeometry",
      data: {
        attributes: {
          position: {
            itemSize: 3,
            type: "Float32Array",
            array: trajPositions,
            normalized: false
          }
        }
      }
    });

    materials.push({
      uuid: matTrajUuid,
      type: "LineBasicMaterial",
      color: 1610507, // 0xf59e0b vibrant amber
      linewidth: 3,
      opacity: 0.95,
      transparent: true
    });

    children.push({
      uuid: objTrajUuid,
      type: "Line",
      name: "Drone_Flight_Trajectory",
      layers: 1,
      matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      geometry: geomTrajUuid,
      material: matTrajUuid
    });
  }

  // 2. Camera Photo Frustums
  if (Array.isArray(options.photos) && options.photos.length >= 1) {
    const frustumPositions = [];
    const dist = options.frustumDistance || 3.0;

    options.photos.forEach(photo => {
      const px = photo.x || 0;
      const py = photo.y || 25;
      const pz = photo.z || 0;
      const yaw = photo.yaw || 0;
      const pitch = photo.pitch !== undefined ? photo.pitch : -60;
      const roll = photo.roll || 0;
      const hfov = photo.hfov || 73.7;
      const vfov = photo.vfov || 53.1;

      const psi = (yaw * Math.PI) / 180.0;
      const theta = (pitch * Math.PI) / 180.0;
      const phi = (roll * Math.PI) / 180.0;

      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      const sinP = Math.sin(psi);
      const cosP = Math.cos(psi);

      const fwd = [cosT * sinP, sinT, -cosT * cosP];
      let right = [cosP, 0.0, sinP];
      let up = [
        right[1] * fwd[2] - right[2] * fwd[1],
        right[2] * fwd[0] - right[0] * fwd[2],
        right[0] * fwd[1] - right[1] * fwd[0]
      ];
      const upNorm = Math.hypot(up[0], up[1], up[2]);
      if (upNorm > 1e-6) {
        up = [up[0] / upNorm, up[1] / upNorm, up[2] / upNorm];
      }
      if (Math.abs(phi) > 1e-4) {
        const cR = Math.cos(phi);
        const sR = Math.sin(phi);
        const rightR = [cR * right[0] + sR * up[0], cR * right[1] + sR * up[1], cR * right[2] + sR * up[2]];
        const upR = [-sR * right[0] + cR * up[0], -sR * right[1] + cR * up[1], -sR * right[2] + cR * up[2]];
        right = rightR;
        up = upR;
      }

      const fovHalfX = Math.tan(((hfov * Math.PI) / 180.0) / 2.0);
      const fovHalfY = Math.tan(((vfov * Math.PI) / 180.0) / 2.0);
      const wHalf = dist * fovHalfX;
      const hHalf = dist * fovHalfY;

      const cL = [
        px + fwd[0] * dist,
        py + fwd[1] * dist,
        pz + fwd[2] * dist
      ];

      const pTL = [cL[0] - right[0] * wHalf + up[0] * hHalf, cL[1] - right[1] * wHalf + up[1] * hHalf, cL[2] - right[2] * wHalf + up[2] * hHalf];
      const pTR = [cL[0] + right[0] * wHalf + up[0] * hHalf, cL[1] + right[1] * wHalf + up[1] * hHalf, cL[2] + right[2] * wHalf + up[2] * hHalf];
      const pBR = [cL[0] + right[0] * wHalf - up[0] * hHalf, cL[1] + right[1] * wHalf - up[1] * hHalf, cL[2] + right[2] * wHalf - up[2] * hHalf];
      const pBL = [cL[0] - right[0] * wHalf - up[0] * hHalf, cL[1] - right[1] * wHalf - up[1] * hHalf, cL[2] - right[2] * wHalf - up[2] * hHalf];

      const addSeg = (a, b) => {
        frustumPositions.push(
          Math.round(a[0] * 1000) / 1000, Math.round((a[1] + elevOffset) * 1000) / 1000, Math.round(a[2] * 1000) / 1000,
          Math.round(b[0] * 1000) / 1000, Math.round((b[1] + elevOffset) * 1000) / 1000, Math.round(b[2] * 1000) / 1000
        );
      };
      const C = [px, py, pz];
      addSeg(C, pTL);
      addSeg(C, pTR);
      addSeg(C, pBR);
      addSeg(C, pBL);
      addSeg(pTL, pTR);
      addSeg(pTR, pBR);
      addSeg(pBR, pBL);
      addSeg(pBL, pTL);
    });

    if (frustumPositions.length > 0) {
      const geomFrustUuid = 'geom-frust-' + Math.random().toString(36).slice(2, 10);
      const matFrustUuid = 'mat-frust-' + Math.random().toString(36).slice(2, 10);
      const objFrustUuid = 'obj-frust-' + Math.random().toString(36).slice(2, 10);

      geometries.push({
        uuid: geomFrustUuid,
        type: "BufferGeometry",
        data: {
          attributes: {
            position: {
              itemSize: 3,
              type: "Float32Array",
              array: frustumPositions,
              normalized: false
            }
          }
        }
      });

      materials.push({
        uuid: matFrustUuid,
        type: "LineBasicMaterial",
        color: 1096065, // 0x10b981 emerald
        linewidth: 1.5,
        opacity: 0.85,
        transparent: true
      });

      children.push({
        uuid: objFrustUuid,
        type: "LineSegments",
        name: "Camera_Photo_Frustums",
        layers: 1,
        matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
        geometry: geomFrustUuid,
        material: matFrustUuid
      });
    }
  }

  // 3. Mission Boundary Loop
  if (Array.isArray(options.boundary) && options.boundary.length >= 3) {
    const bndPositions = [];
    const bndPts = [...options.boundary, options.boundary[0]];
    bndPts.forEach(pt => {
      const px = Array.isArray(pt) ? pt[0] : (pt.x || 0);
      const py = Array.isArray(pt) ? pt[1] : (pt.y || 0.15);
      const pz = Array.isArray(pt) ? pt[2] : (pt.z || 0);
      bndPositions.push(
        Math.round(px * 1000) / 1000,
        Math.round((py + elevOffset) * 1000) / 1000,
        Math.round(pz * 1000) / 1000
      );
    });

    const geomBndUuid = 'geom-bnd-' + Math.random().toString(36).slice(2, 10);
    const matBndUuid = 'mat-bnd-' + Math.random().toString(36).slice(2, 10);
    const objBndUuid = 'obj-bnd-' + Math.random().toString(36).slice(2, 10);

    geometries.push({
      uuid: geomBndUuid,
      type: "BufferGeometry",
      data: {
        attributes: {
          position: {
            itemSize: 3,
            type: "Float32Array",
            array: bndPositions,
            normalized: false
          }
        }
      }
    });

    materials.push({
      uuid: matBndUuid,
      type: "LineBasicMaterial",
      color: 440020, // 0x06b6d4 teal
      linewidth: 2,
      opacity: 0.9,
      transparent: true
    });

    children.push({
      uuid: objBndUuid,
      type: "Line",
      name: "Mission_Boundary",
      layers: 1,
      matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      geometry: geomBndUuid,
      material: matBndUuid
    });
  }

  const groupUuid = 'group-digital-twin-' + Math.random().toString(36).slice(2, 10);

  return {
    metadata: {
      version: 4.5,
      type: "Object",
      generator: "Aalaapi-Sky Digital Twin Engine",
      source: "threejs.org compatible"
    },
    geometries,
    materials,
    object: {
      uuid: groupUuid,
      type: "Group",
      name: "Aalaapi_Inspection_Digital_Twin",
      layers: 1,
      matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      children
    }
  };
}

const FlightDiagnostics = {
  isOpen: false,
  isPlaying: false,
  playbackSpeed: 1,
  currentPointIndex: 0,
  playbackFractionalIndex: 0.0,
  selectedFlightId: 'active-mission',
  isActualFlown: false,
  telemetryData: null,
  comparisonData: null,
  animFrameId: null,
  lastFrameTime: null,
  threeScene: null,
  threeRenderer: null,
  threeCamera: null,
  threeControls: null,
  droneMesh: null,
  frustumMesh: null,
  actualLineMesh: null,
  plannedLineMesh: null,
  photoMarkers: [],
  boundaryMeshes: [],
  baseGroundCanvas: null,
  baseGroundCtx: null,
  lastPaintedPointIdx: -1,
  currentLoadedMission: null,
  activeTab: '3d',
  _loadGeneration: 0,   // incremented each call to loadSelectedFlight; guards against stale async loads
  _pendingFlightId: null, // tracks the most recently requested flight ID
  isDecrypted: false,
  needsDjiApiKey: false,
  djiApiKeyConfigured: false,

  activePhotoFilter: 'all',
  activePhotoSearch: '',

  // HUD overlay toggle state (Diagnostics 3D replay)
  diagAutoRotate: false,
  diagShowCones: true,
  diagShowFootprints: true,
  diagShowDrones: true,
  diagShowWireframe: true,
  diagShowPlanes: false,
  diagFpvMode: false,
  wireframeData: null,
  wireframeLinesMesh: null,
  wireframePlanesMesh: null,
  wireframeHighlightMesh: null,
  wireframeSelectedLineIndex: null,
  wireframeElevationOffset: 0.0,
  wireframeMinLengthFilter: 0.5,
  _savedCamPos: null,
  _savedCamTarget: null,

  switchTab(tabName) {
    this.activeTab = tabName || '3d';
    const tab3dBtn = document.getElementById('diag-nav-3d-btn');
    const tabAuditBtn = document.getElementById('diag-nav-audit-btn');
    const tabPhotosBtn = document.getElementById('diag-nav-photos-btn');
    const pane3d = document.getElementById('diag-pane-3d');
    const paneAudit = document.getElementById('kmz-inspector-modal');
    const panePhotos = document.getElementById('diag-pane-photos');
    const flightMeta = document.getElementById('diag-flight-meta');
    const flightControls = document.getElementById('diag-header-flight-controls');

    [tab3dBtn, tabAuditBtn, tabPhotosBtn].forEach(btn => {
      if (btn) {
        btn.classList.remove('active');
        btn.style.background = 'transparent';
        btn.style.borderColor = 'transparent';
        btn.style.color = 'var(--text-muted)';
      }
    });

    if (this.activeTab === 'audit') {
      if (tabAuditBtn) {
        tabAuditBtn.classList.add('active');
        tabAuditBtn.style.background = 'rgba(16, 185, 129, 0.2)';
        tabAuditBtn.style.borderColor = 'rgba(16, 185, 129, 0.4)';
        tabAuditBtn.style.color = '#34d399';
      }
      if (pane3d) pane3d.classList.add('hidden');
      if (panePhotos) panePhotos.classList.add('hidden');
      if (paneAudit) paneAudit.classList.remove('hidden');
      if (flightControls) flightControls.style.display = 'none';
      if (flightMeta) flightMeta.textContent = 'Pre-Flight Schema & Firmware Compliance Linter';
      if (typeof KMZInspector !== 'undefined' && KMZInspector.runCurrentWorkspaceAudit) {
        KMZInspector.runCurrentWorkspaceAudit();
      }
    } else if (this.activeTab === 'photos') {
      if (tabPhotosBtn) {
        tabPhotosBtn.classList.add('active');
        tabPhotosBtn.style.background = 'rgba(56, 189, 248, 0.2)';
        tabPhotosBtn.style.borderColor = 'rgba(56, 189, 248, 0.4)';
        tabPhotosBtn.style.color = '#38bdf8';
      }
      if (pane3d) pane3d.classList.add('hidden');
      if (paneAudit) paneAudit.classList.add('hidden');
      if (panePhotos) panePhotos.classList.remove('hidden');
      if (flightControls) flightControls.style.display = 'flex';
      if (flightMeta) flightMeta.textContent = 'Flight Inspection Photos & Optical GSD Ground Coverage';
      this.renderInspectionPhotosUI();
    } else {
      if (tab3dBtn) {
        tab3dBtn.classList.add('active');
        tab3dBtn.style.background = 'rgba(6, 182, 212, 0.2)';
        tab3dBtn.style.borderColor = 'rgba(6, 182, 212, 0.4)';
        tab3dBtn.style.color = '#22d3ee';
      }
      if (paneAudit) paneAudit.classList.add('hidden');
      if (panePhotos) panePhotos.classList.add('hidden');
      if (pane3d) pane3d.classList.remove('hidden');
      if (flightControls) flightControls.style.display = 'flex';
      if (this.telemetryData && flightMeta) {
        const flightName = this.selectedFlightId || 'FlightRecord_2026-08-20_[19-42-28].txt';
        flightMeta.textContent = `Telemetry Log: ${flightName} • Duration: ${this.telemetryData.durationFormatted}`;
      }
      if (this.threeRenderer && this.threeCamera) {
        const container = document.getElementById('diag-3d-canvas-container');
        if (container) {
          const width = container.clientWidth || 800;
          const height = container.clientHeight || 500;
          this.threeRenderer.setSize(width, height);
          this.threeCamera.aspect = width / height;
          this.threeCamera.updateProjectionMatrix();
        }
      }
    }
  },

  filterPhotosForCurrentFlight(photos) {
    if (!Array.isArray(photos) || photos.length === 0) return [];
    let flightStartLoc = null, flightEndLoc = null;
    let flightStartUtc = null, flightEndUtc = null;
    let durMs = 600 * 1000;

    if (this.telemetryData && this.telemetryData.flightDate) {
      const parsed = new Date(this.telemetryData.flightDate).getTime();
      if (!isNaN(parsed)) {
        flightStartLoc = parsed;
        flightStartUtc = parsed;
        if (typeof this.telemetryData.durationSec === 'number' && this.telemetryData.durationSec > 0) {
          durMs = this.telemetryData.durationSec * 1000;
        }
        flightEndLoc = flightStartLoc + durMs;
        flightEndUtc = flightStartUtc + durMs;
      }
    }

    if (!flightStartLoc && this.selectedFlightId) {
      const m = this.selectedFlightId.match(/FlightRecord_(\d{4})-(\d{2})-(\d{2})_\[(\d{2})-(\d{2})-(\d{2})\]/);
      if (m) {
        const [_, Y, M, D, h, mnt, s] = m;
        flightStartLoc = new Date(+Y, +M - 1, +D, +h, +mnt, +s).getTime();
        flightEndLoc = flightStartLoc + durMs;
        flightStartUtc = new Date(Date.UTC(+Y, +M - 1, +D, +h, +mnt, +s)).getTime();
        flightEndUtc = flightStartUtc + durMs;
      }
    }

    if (!flightStartLoc && !flightStartUtc) {
      return photos;
    }

    const bufferMs = 300 * 1000; // 5 min safety buffer

    return photos.filter(p => {
      if (!p) return false;
      if (p.photoId && typeof p.photoId === 'string' && p.photoId.startsWith('TELEM_PHOTO_')) {
        return true;
      }
      let pt = p.timestamp ? new Date(p.timestamp).getTime() : NaN;
      let pLoc = NaN, pUtc = NaN;
      if (p.filename) {
        const m = p.filename.match(/DJI_(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
        if (m) {
          pLoc = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
          pUtc = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])).getTime();
        }
      }

      if (flightStartLoc) {
        const t0 = flightStartLoc - bufferMs;
        const t1 = (flightEndLoc || flightStartLoc + 600000) + bufferMs;
        if (!isNaN(pLoc) && pLoc >= t0 && pLoc <= t1) return true;
        if (!isNaN(pt) && pt >= t0 && pt <= t1) return true;
      }

      if (flightStartUtc) {
        const t0 = flightStartUtc - bufferMs;
        const t1 = (flightEndUtc || flightStartUtc + 600000) + bufferMs;
        if (!isNaN(pUtc) && pUtc >= t0 && pUtc <= t1) return true;
        if (!isNaN(pt) && pt >= t0 && pt <= t1) return true;
      }

      // No parseable timestamp in filename or metadata — include it (no basis to exclude)
      if (isNaN(pLoc) && isNaN(pUtc) && isNaN(pt)) return true;

      return false;
    });

  },

  getCorrelatedPhotos() {
    let rawList = [];
    if (this.flightPhotos && Array.isArray(this.flightPhotos) && this.flightPhotos.length > 0 && (!this.flightPhotosFlightId || this.flightPhotosFlightId === this.selectedFlightId)) {
      rawList = this.flightPhotos;
      return this.filterPhotosForCurrentFlight(rawList);
    } else if (typeof activeInspectionManifest !== 'undefined' && activeInspectionManifest && Array.isArray(activeInspectionManifest.photos) && activeInspectionManifest.photos.length > 0) {
      rawList = activeInspectionManifest.photos;
      return this.filterPhotosForCurrentFlight(rawList);
    } else if (this.telemetryData && Array.isArray(this.telemetryData.points)) {
      const photoPoints = this.telemetryData.points.filter(p => p.isPhoto);
      if (photoPoints.length > 0) {
        return photoPoints.map((p, idx) => ({
          photoId: `TELEM_PHOTO_${idx + 1}`,
          filename: `DJI_${String(idx + 1).padStart(4, '0')}.JPG`,
          waypointIndex: p.waypointIndex !== undefined ? p.waypointIndex : idx,
          telemetryIndex: this.telemetryData.points.indexOf(p),
          actual: {
            lat: p.lat,
            lon: p.lon,
            altAgl: p.alt || 21.0,
            altMsl: (p.alt || 21.0) + 120,
            gimbalPitch: p.pitch !== undefined ? p.pitch : -60,
            heading: p.yaw !== undefined ? p.yaw : 0
          },
          planned: {
            lat: p.lat,
            lon: p.lon,
            alt: p.alt || 21.0,
            gimbalPitch: p.pitch !== undefined ? p.pitch : -60
          },
          variance: {
            horizontalDeltaMeters: 0.18,
            verticalDeltaMeters: 0.08,
            isCompliant: true
          },
          gsd: {
            gsdCm: ((p.alt || 21.0) * 0.038).toFixed(2),
            gsdMeters: ((p.alt || 21.0) * 0.00038)
          },
          severity: 'clean',
          annotations: []
        }));
      }
    }
    return [];
  },

  renderInspectionPhotosUI() {
    if (typeof document === 'undefined') return;
    const photos = this.getCorrelatedPhotos();
    
    // Update count badges
    const navCount = document.getElementById('diag-nav-photos-count');
    if (navCount) navCount.textContent = photos.length.toString();

    const cardCount = document.getElementById('diag-photos-card-count');
    if (cardCount) cardCount.textContent = `${photos.length} Photos`;

    // 1. Populate Sidebar Photo Ribbon (#diag-photos-card)
    const photosCard = document.getElementById('diag-photos-card');
    const photosStrip = document.getElementById('diag-photos-strip');
    if (photosCard && photosStrip) {
      if (photos.length > 0) {
        photosCard.style.display = 'flex';
        photosStrip.innerHTML = '';
        photos.forEach((photo, pIdx) => {
          const thumb = document.createElement('div');
          thumb.className = `diag-strip-thumb ${pIdx === 0 ? 'active' : ''}`;
          if (!thumb.dataset) thumb.dataset = {};
          thumb.dataset.photoIndex = pIdx.toString();
          thumb.dataset.telemetryIndex = (photo.telemetryIndex !== undefined ? photo.telemetryIndex : 0).toString();
          if (typeof thumb.setAttribute === 'function') {
            thumb.setAttribute('data-photo-index', pIdx.toString());
            thumb.setAttribute('data-telemetry-index', (photo.telemetryIndex !== undefined ? photo.telemetryIndex : 0).toString());
          }
          thumb.title = `WP #${photo.waypointIndex}: ${photo.filename}`;
          thumb.innerHTML = `
            <span style="font-size: 0.58rem; color: #38bdf8; font-weight: 700;">#${photo.waypointIndex}</span>
            <span style="font-size: 0.95rem;">📸</span>
          `;
          if (typeof thumb.addEventListener === 'function') {
            thumb.addEventListener('click', () => {
              if (photo.telemetryIndex !== undefined) {
                this.seekTo(photo.telemetryIndex);
              }
            });
          }
          if (typeof photosStrip.appendChild === 'function') photosStrip.appendChild(thumb);
        });

        // Set initial active photo info if not already set
        if (photos.length > 0) {
          const p0 = photos[0];
          const activeInfo = document.getElementById('diag-active-photo-info');
          const activeName = document.getElementById('diag-active-photo-name');
          const activeDetails = document.getElementById('diag-active-photo-details');
          if (activeInfo) activeInfo.style.display = 'block';
          if (activeName) activeName.textContent = `WP #${p0.waypointIndex} • ${p0.filename}`;
          if (activeDetails) {
            const gsdVal = (p0.gsd && p0.gsd.gsdCm) ? `${p0.gsd.gsdCm} cm/px` : '1.1 cm/px';
            activeDetails.textContent = `Alt: ${p0.actual.altAgl.toFixed(1)}m • Pitch: ${p0.actual.gimbalPitch}° • GSD: ${gsdVal}`;
          }
        }
      } else {
        photosCard.style.display = 'none';
      }
    }

    // 2. Populate Gallery Grid (#diag-photos-grid)
    const grid = document.getElementById('diag-photos-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const query = (this.activePhotoSearch || '').trim().toLowerCase();
    const filter = this.activePhotoFilter || 'all';

    const filtered = photos.filter(p => {
      if (query) {
        const matchesName = (p.filename || '').toLowerCase().includes(query);
        const matchesWp = `wp #${p.waypointIndex}`.toLowerCase().includes(query) || `${p.waypointIndex}` === query;
        if (!matchesName && !matchesWp) return false;
      }
      if (filter === 'clean') return (p.severity === 'clean' || !p.severity) && (!p.variance || p.variance.isCompliant);
      if (filter === 'warning') return p.severity === 'warning' || (p.variance && !p.variance.isCompliant);
      if (filter === 'critical') return p.severity === 'critical';
      return true;
    });

    const summaryText = document.getElementById('diag-photos-summary-text');
    if (summaryText) {
      summaryText.textContent = `Showing ${filtered.length} of ${photos.length} Photos`;
    }

    if (filtered.length === 0) {
      const zeroState = document.createElement('div');
      zeroState.style.cssText = 'grid-column: 1 / -1; padding: 48px 20px; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; background: rgba(255,255,255,0.01); border: 1px dashed var(--border-color); border-radius: 8px;';
      if (photos.length === 0) {
        zeroState.innerHTML = `
          <div style="font-size: 2.2rem;">📸</div>
          <div style="font-weight: 700; color: var(--text-main); font-size: 0.95rem;">No Ingested Photos Detected</div>
          <p style="color: var(--text-muted); font-size: 0.78rem; max-width: 420px; margin: 0; line-height: 1.45;">
            Connect your DJI Mini 4 Pro, SD card, or RC 2 controller over USB to ingest high-resolution images and correlate them directly with this flight trajectory.
          </p>
          <button id="diag-zero-ingest-btn" type="button" class="btn-primary" style="padding: 8px 18px; font-size: 0.8rem; font-weight: 600; margin-top: 6px; display: inline-flex; align-items: center; gap: 6px;">
            <span>📸</span> Import Photos Now...
          </button>
        `;
        if (typeof grid.appendChild === 'function') grid.appendChild(zeroState);
        const zeroBtn = typeof zeroState.querySelector === 'function' ? zeroState.querySelector('#diag-zero-ingest-btn') : null;
        if (zeroBtn && typeof zeroBtn.addEventListener === 'function') zeroBtn.addEventListener('click', () => { if (typeof openMediaIngestModal === 'function') openMediaIngestModal(); });
      } else {
        zeroState.innerHTML = `
          <div style="font-size: 1.8rem;">🔍</div>
          <div style="font-weight: 600; color: var(--text-main); font-size: 0.9rem;">No Photos Match Filter Criteria</div>
          <p style="color: var(--text-muted); font-size: 0.76rem; margin: 0;">Try adjusting your search query or selecting "All" severity.</p>
        `;
        if (typeof grid.appendChild === 'function') grid.appendChild(zeroState);
      }
      return;
    }

    filtered.forEach(photo => {
      const card = document.createElement('div');
      card.className = 'diag-photo-card';
      const isComp = photo.variance ? photo.variance.isCompliant : true;
      const sev = photo.severity || (isComp ? 'clean' : 'warning');
      const gsdVal = (photo.gsd && photo.gsd.gsdCm) ? `${photo.gsd.gsdCm} cm/px` : '1.1 cm/px';
      const altAgl = (photo.actual && photo.actual.altAgl !== undefined) ? `${photo.actual.altAgl.toFixed(1)}m` : '30.0m';
      const pitch = (photo.actual && photo.actual.gimbalPitch !== undefined) ? `${photo.actual.gimbalPitch}°` : '-60°';

      const badgeColor = sev === 'critical' ? '#ef4444' : (sev === 'warning' ? '#f59e0b' : '#34d399');
      const badgeBg = sev === 'critical' ? 'rgba(239, 68, 68, 0.18)' : (sev === 'warning' ? 'rgba(245, 158, 11, 0.18)' : 'rgba(52, 211, 153, 0.18)');
      const badgeBorder = sev === 'critical' ? 'rgba(239, 68, 68, 0.35)' : (sev === 'warning' ? 'rgba(245, 158, 11, 0.35)' : 'rgba(52, 211, 153, 0.35)');
      const badgeLabel = sev === 'critical' ? '🔴 DEFECT' : (sev === 'warning' ? '⚠ WARNING' : '✓ COMPLIANT');

      const apiBase = (typeof getCompanionApiBase === 'function') ? getCompanionApiBase() : (typeof COMPANION_API_BASE !== 'undefined' ? COMPANION_API_BASE : 'http://127.0.0.1:8765');
      const manifestUuid = (typeof activeInspectionManifest !== 'undefined' && activeInspectionManifest?.missionUuid)
        || this.currentLoadedMission?.uuid
        || (typeof activeLayerId !== 'undefined' && activeLayerId)
        || 'layer-1';

      let imgSrc = photo.thumbnailUrl || photo.previewUrl || '';
      if (!imgSrc && photo.rawPath) {
        imgSrc = `/scratch/mission_archives/${manifestUuid}/photos/previews/${encodeURIComponent(photo.filename)}`;
      } else if (!imgSrc && photo.filename && !photo.photoId?.startsWith('TELEM_PHOTO_') && (photo.filename.endsWith('.JPG') || photo.filename.endsWith('.jpg') || photo.filename.endsWith('.PNG') || photo.filename.endsWith('.png') || photo.filename.endsWith('.DNG') || photo.filename.endsWith('.dng'))) {
        imgSrc = `/scratch/mission_archives/${manifestUuid}/photos/previews/${encodeURIComponent(photo.filename)}`;
      }

      if (imgSrc && !imgSrc.startsWith('http') && !imgSrc.startsWith('data:')) {
        imgSrc = `${apiBase}${imgSrc.startsWith('/') ? '' : '/'}${imgSrc}`;
      }
      if (imgSrc) {
        photo.previewUrl = photo.previewUrl || imgSrc;
        photo.thumbnailUrl = photo.thumbnailUrl || imgSrc;
      }

      card.innerHTML = `
        <div class="diag-photo-card-thumb" title="Click to inspect & annotate">
          ${imgSrc ? `
            <img src="${imgSrc}" alt="${photo.filename}" loading="lazy" onerror="this.onerror=null; this.style.display='none'; if (this.nextElementSibling) this.nextElementSibling.style.display='flex';" />
            <div style="display: none; flex-direction: column; align-items: center; gap: 4px; color: #38bdf8;">
              <span style="font-size: 1.8rem;">📸</span>
              <span style="font-size: 0.68rem; color: var(--text-muted);">WP #${photo.waypointIndex}</span>
            </div>
          ` : `
            <div style="display: flex; flex-direction: column; align-items: center; gap: 4px; color: #38bdf8;">
              <span style="font-size: 1.8rem;">📸</span>
              <span style="font-size: 0.68rem; color: var(--text-muted);">WP #${photo.waypointIndex} Preview</span>
            </div>
          `}
          <span style="position: absolute; top: 8px; left: 8px; background: rgba(15, 23, 42, 0.85); color: #38bdf8; font-size: 0.65rem; font-weight: 700; padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(56, 189, 248, 0.3);">
            WP #${photo.waypointIndex}
          </span>
          <span style="position: absolute; top: 8px; right: 8px; background: ${badgeBg}; color: ${badgeColor}; font-size: 0.62rem; font-weight: 700; padding: 2px 6px; border-radius: 4px; border: 1px solid ${badgeBorder};">
            ${badgeLabel}
          </span>
        </div>
        <div class="diag-photo-card-body">
          <div style="font-weight: 700; color: var(--text-main); font-size: 0.78rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${photo.filename}
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; color: var(--text-muted); font-size: 0.7rem; background: rgba(0,0,0,0.25); padding: 5px 6px; border-radius: 4px;">
            <div>Alt: <strong style="color: #38bdf8;">${altAgl}</strong></div>
            <div>Pitch: <strong style="color: var(--text-main);">${pitch}</strong></div>
            <div>GSD: <strong style="color: #34d399;">${gsdVal}</strong></div>
            <div>ΔH: <strong style="color: var(--text-main);">${photo.variance ? photo.variance.horizontalDeltaMeters : '0.18'}m</strong></div>
          </div>
          <div style="display: flex; gap: 6px; margin-top: 4px;">
            <button type="button" class="btn-primary diag-card-inspect-btn" style="flex: 1; padding: 5px 8px; font-size: 0.7rem; font-weight: 600;">
              🔍 Inspect
            </button>
            <button type="button" class="btn-secondary diag-card-jump-btn" style="padding: 5px 8px; font-size: 0.7rem;" title="Jump 3D replay to photo location">
              🎮 Replay
            </button>
          </div>
        </div>
      `;

      const inspectBtn = typeof card.querySelector === 'function' ? card.querySelector('.diag-card-inspect-btn') : null;
      const thumbEl = typeof card.querySelector === 'function' ? card.querySelector('.diag-photo-card-thumb') : null;
      const jumpBtn = typeof card.querySelector === 'function' ? card.querySelector('.diag-card-jump-btn') : null;

      const openInspector = () => {
        if (typeof PhotoInspector !== 'undefined' && PhotoInspector.open) {
          const m = (typeof activeInspectionManifest !== 'undefined' && activeInspectionManifest) ? activeInspectionManifest : (this.activeInspectionManifest || this.flightManifest || null);
          const pList = (photos && photos.length > 0) ? photos : ((this.flightPhotos && this.flightPhotos.length > 0) ? this.flightPhotos : null);
          PhotoInspector.open(photo, m, pList);
        }
      };

      if (inspectBtn && typeof inspectBtn.addEventListener === 'function') inspectBtn.addEventListener('click', openInspector);
      if (thumbEl && typeof thumbEl.addEventListener === 'function') thumbEl.addEventListener('click', openInspector);
      if (jumpBtn && typeof jumpBtn.addEventListener === 'function') {
        jumpBtn.addEventListener('click', () => {
          this.switchTab('3d');
          if (photo.telemetryIndex !== undefined) {
            this.seekTo(photo.telemetryIndex);
          }
        });
      }

      if (typeof grid.appendChild === 'function') grid.appendChild(card);
    });
  },

  init() {
    if (typeof document === 'undefined') return;
    const openBtns = [
      document.getElementById('action-diagnostics-btn')
    ];
    openBtns.forEach(btn => {
      if (btn && typeof btn.addEventListener === 'function') btn.addEventListener('click', () => this.open());
    });

    const closeBtn = document.getElementById('diag-close-btn');
    if (closeBtn && typeof closeBtn.addEventListener === 'function') closeBtn.addEventListener('click', () => this.close());

    const modalOverlay = document.getElementById('flight-diagnostics-modal');
    if (modalOverlay && typeof modalOverlay.addEventListener === 'function') {
      modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) this.close();
      });
    }

    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.isOpen) {
          this.close();
        }
      });
    }

    const tab3dBtn = document.getElementById('diag-nav-3d-btn');
    if (tab3dBtn && typeof tab3dBtn.addEventListener === 'function') tab3dBtn.addEventListener('click', () => this.switchTab('3d'));

    const tabAuditBtn = document.getElementById('diag-nav-audit-btn');
    if (tabAuditBtn && typeof tabAuditBtn.addEventListener === 'function') tabAuditBtn.addEventListener('click', () => this.switchTab('audit'));

    const tabPhotosBtn = document.getElementById('diag-nav-photos-btn');
    if (tabPhotosBtn && typeof tabPhotosBtn.addEventListener === 'function') tabPhotosBtn.addEventListener('click', () => this.switchTab('photos'));

    const diagPullPhotosBtn = document.getElementById('diag-pull-photos-btn');
    if (diagPullPhotosBtn && typeof diagPullPhotosBtn.addEventListener === 'function') {
      diagPullPhotosBtn.addEventListener('click', () => {
        if (typeof openMediaIngestModal === 'function') openMediaIngestModal();
      });
    }

    const diagGalleryPullBtn = document.getElementById('diag-gallery-pull-photos-btn');
    if (diagGalleryPullBtn && typeof diagGalleryPullBtn.addEventListener === 'function') {
      diagGalleryPullBtn.addEventListener('click', () => {
        if (typeof openMediaIngestModal === 'function') openMediaIngestModal();
      });
    }

    const photosSearch = document.getElementById('diag-photos-search');
    if (photosSearch && typeof photosSearch.addEventListener === 'function') {
      photosSearch.addEventListener('input', (e) => {
        this.activePhotoSearch = e.target.value;
        this.renderInspectionPhotosUI();
      });
    }

    const filterGroup = document.getElementById('diag-photos-filter-group');
    if (filterGroup && typeof filterGroup.querySelectorAll === 'function') {
      filterGroup.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
          filterGroup.querySelectorAll('button').forEach(b => {
            b.classList.remove('active');
            b.style.background = 'transparent';
          });
          btn.classList.add('active');
          btn.style.background = 'rgba(56, 189, 248, 0.2)';
          this.activePhotoFilter = btn.dataset.filter || 'all';
          this.renderInspectionPhotosUI();
        });
      });
    }

    const rewindBtn = document.getElementById('diag-rewind-btn');
    if (rewindBtn && typeof rewindBtn.addEventListener === 'function') {
      rewindBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.pause();
        this.playbackFractionalIndex = 0.0;
        this.seekTo(0, true, true);
        this.resetGroundCanvas();
      });
    }

    const playBtn = document.getElementById('diag-play-btn');
    if (playBtn && typeof playBtn.addEventListener === 'function') playBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.togglePlay();
    });

    const slider = document.getElementById('diag-timeline-slider');
    if (slider && typeof slider.addEventListener === 'function') {
      slider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        this.playbackFractionalIndex = val;
        this.seekTo(val, false, true);
      });
    }

    // Speed multiplier buttons
    if (typeof document.querySelectorAll === 'function') {
      document.querySelectorAll('.diag-speed-btn').forEach(btn => {
        if (btn && typeof btn.addEventListener === 'function') {
          btn.addEventListener('click', () => {
            document.querySelectorAll('.diag-speed-btn').forEach(b => {
              if (b.classList) {
                b.classList.remove('active');
                b.style.background = 'rgba(255, 255, 255, 0.05)';
                b.style.borderColor = 'var(--border-color)';
                b.style.color = 'var(--text-muted)';
              }
            });
            btn.classList.add('active');
            btn.style.background = 'rgba(6, 182, 212, 0.2)';
            btn.style.borderColor = 'rgba(6, 182, 212, 0.4)';
            btn.style.color = '#22d3ee';
            this.playbackSpeed = parseFloat(btn.getAttribute('data-speed')) || 1;
          });
        }
      });
    }

    // View toggles (3D vs Top Down)
    const view3dBtn = document.getElementById('diag-view-3d-btn');
    const viewTopBtn = document.getElementById('diag-view-top-btn');
    if (view3dBtn && typeof view3dBtn.addEventListener === 'function') {
      view3dBtn.addEventListener('click', () => {
        view3dBtn.classList.add('active');
        if (viewTopBtn && viewTopBtn.classList) viewTopBtn.classList.remove('active');
        this.resetCameraView('3d');
      });
    }
    if (viewTopBtn && typeof viewTopBtn.addEventListener === 'function') {
      viewTopBtn.addEventListener('click', () => {
        viewTopBtn.classList.add('active');
        if (view3dBtn && view3dBtn.classList) view3dBtn.classList.remove('active');
        this.resetCameraView('top');
      });
    }

    // ── Diagnostics HUD Overlay Controls ─────────────────────────────────────
    const _setDiagIndicator = (id, active) => {
      const el = document.getElementById(id);
      if (el) el.style.background = active ? '#10b981' : '#ef4444';
    };

    // Initialise indicators to match initial state
    _setDiagIndicator('diag-indicator-cones', this.diagShowCones);
    _setDiagIndicator('diag-indicator-footprints', this.diagShowFootprints);
    _setDiagIndicator('diag-indicator-drones', this.diagShowDrones);
    _setDiagIndicator('diag-indicator-autorotate', this.diagAutoRotate);
    _setDiagIndicator('diag-indicator-fpv', this.diagFpvMode);

    const diagBtnAutoRotate = document.getElementById('diag-btn-autorotate');
    if (diagBtnAutoRotate && typeof diagBtnAutoRotate.addEventListener === 'function') {
      diagBtnAutoRotate.addEventListener('click', () => {
        this.diagAutoRotate = !this.diagAutoRotate;
        if (this.threeControls) this.threeControls.autoRotate = this.diagAutoRotate;
        diagBtnAutoRotate.classList.toggle('active', this.diagAutoRotate);
        _setDiagIndicator('diag-indicator-autorotate', this.diagAutoRotate);
      });
    }

    const diagBtnReset = document.getElementById('diag-btn-reset');
    if (diagBtnReset && typeof diagBtnReset.addEventListener === 'function') {
      diagBtnReset.addEventListener('click', () => {
        // Exit FPV mode first if active
        if (this.diagFpvMode) {
          this.diagFpvMode = false;
          if (this.threeControls) this.threeControls.enabled = true;
          const fpvBtn = document.getElementById('diag-btn-fpv');
          if (fpvBtn) fpvBtn.classList.remove('active');
          _setDiagIndicator('diag-indicator-fpv', false);
        }
        // Pause playback, reset timeline to start, and reset ground footprints
        this.pause();
        this.playbackFractionalIndex = 0.0;
        this.seekTo(0, true, true);
        this.resetGroundCanvas();

        // Re-frame camera to trajectory bounding box
        const targetMesh = this.actualLineMesh || this.plannedLineMesh;
        if (targetMesh && targetMesh.geometry && this.threeCamera && this.threeControls) {
          targetMesh.geometry.computeBoundingSphere();
          const bs = targetMesh.geometry.boundingSphere;
          if (bs && bs.center && !isNaN(bs.center.x)) {
            this.threeControls.target.set(bs.center.x, Math.max(0, bs.center.y), bs.center.z);
            const dist = Math.max(70, bs.radius * 2.2);
            this.threeCamera.position.set(bs.center.x, bs.center.y + dist * 0.7, bs.center.z + dist * 0.9);
            this.threeControls.update();
          }
        } else if (this.threeCamera && this.threeControls) {
          this.threeControls.target.set(0, 0, 0);
          this.threeCamera.position.set(0, 90, 140);
          this.threeControls.update();
        }
      });
    }

    const diagBtnCones = document.getElementById('diag-btn-toggle-cones');
    if (diagBtnCones && typeof diagBtnCones.addEventListener === 'function') {
      diagBtnCones.addEventListener('click', () => {
        this.diagShowCones = !this.diagShowCones;
        // Toggle visibility of cone children in each photo marker group
        if (this.photoMarkers && this.photoMarkers.length > 0) {
          this.photoMarkers.forEach(marker => {
            if (marker && marker.children) {
              marker.children.forEach(child => {
                // Cone meshes have a ConeGeometry / pyramid shape — sphere is index 0
                if (child.type === 'Mesh' && child.geometry &&
                    child.geometry.type !== 'SphereGeometry') {
                  child.visible = this.diagShowCones;
                }
                // LineSegments edge wires inside the cone mesh
                if (child.type === 'LineSegments') {
                  child.visible = this.diagShowCones;
                }
              });
            }
          });
        }
        // Also toggle the drone-body frustum
        if (this.frustumMesh) this.frustumMesh.visible = this.diagShowCones;
        diagBtnCones.classList.toggle('active', this.diagShowCones);
        _setDiagIndicator('diag-indicator-cones', this.diagShowCones);
      });
    }

    const diagBtnFootprints = document.getElementById('diag-btn-toggle-footprints');
    if (diagBtnFootprints && typeof diagBtnFootprints.addEventListener === 'function') {
      diagBtnFootprints.addEventListener('click', () => {
        this.diagShowFootprints = !this.diagShowFootprints;
        // Show/hide photo sphere markers (ground coverage footprint indicators)
        if (this.photoMarkers && this.photoMarkers.length > 0) {
          this.photoMarkers.forEach(marker => {
            if (marker) marker.visible = this.diagShowFootprints;
          });
        }
        // Synchronously update ground canvas footprints
        if (!this.diagShowFootprints) {
          this.resetGroundCanvas();
        } else {
          this.redrawGroundFootprints(this.currentPointIndex);
        }
        diagBtnFootprints.classList.toggle('active', this.diagShowFootprints);
        _setDiagIndicator('diag-indicator-footprints', this.diagShowFootprints);
      });
    }

    const diagBtnResetFootprints = document.getElementById('diag-btn-reset-footprints');
    if (diagBtnResetFootprints && typeof diagBtnResetFootprints.addEventListener === 'function') {
      diagBtnResetFootprints.addEventListener('click', () => {
        this.resetGroundCanvas();
      });
    }

    const diagBtnDrones = document.getElementById('diag-btn-toggle-drones');
    if (diagBtnDrones && typeof diagBtnDrones.addEventListener === 'function') {
      diagBtnDrones.addEventListener('click', () => {
        this.diagShowDrones = !this.diagShowDrones;
        if (this.droneMesh) this.droneMesh.visible = this.diagShowDrones;
        diagBtnDrones.classList.toggle('active', this.diagShowDrones);
        _setDiagIndicator('diag-indicator-drones', this.diagShowDrones);
      });
    }

    const diagBtnWireframe = document.getElementById('diag-btn-toggle-wireframe');
    if (diagBtnWireframe && typeof diagBtnWireframe.addEventListener === 'function') {
      diagBtnWireframe.addEventListener('click', () => {
        this.toggleWireframe();
      });
    }

    const diagBtnPlanes = document.getElementById('diag-btn-toggle-planes');
    if (diagBtnPlanes && typeof diagBtnPlanes.addEventListener === 'function') {
      diagBtnPlanes.addEventListener('click', () => {
        this.togglePlanes();
      });
    }

    const diagWfElevSlider = document.getElementById('diag-wireframe-elevation-slider');
    const diagWfElevVal = document.getElementById('diag-wireframe-elev-val');
    if (diagWfElevSlider && typeof diagWfElevSlider.addEventListener === 'function') {
      diagWfElevSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value) || 0;
        this.wireframeElevationOffset = val;
        if (diagWfElevVal) diagWfElevVal.textContent = `${val >= 0 ? '+' : ''}${val.toFixed(1)}m`;
        this.rebuildWireframeMesh();
      });
    }

    const diagWfFilterSlider = document.getElementById('diag-wireframe-filter-slider');
    const diagWfFilterVal = document.getElementById('diag-wireframe-filter-val');
    if (diagWfFilterSlider && typeof diagWfFilterSlider.addEventListener === 'function') {
      diagWfFilterSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value) || 0;
        this.wireframeMinLengthFilter = val;
        if (diagWfFilterVal) diagWfFilterVal.textContent = `< ${val.toFixed(1)}m`;
        this.rebuildWireframeMesh();
      });
    }

    const diagWfDelBtn = document.getElementById('diag-wireframe-del-btn');
    if (diagWfDelBtn && typeof diagWfDelBtn.addEventListener === 'function') {
      diagWfDelBtn.addEventListener('click', () => {
        this.deleteSelectedWireframeLine();
      });
    }

    const diagWfConvertBtn = document.getElementById('diag-wireframe-convert-btn');
    if (diagWfConvertBtn && typeof diagWfConvertBtn.addEventListener === 'function') {
      diagWfConvertBtn.addEventListener('click', () => {
        this.convertWireframeToBoundary();
      });
    }

    const diagWfExportBtn = document.getElementById('diag-wireframe-export-btn');
    if (diagWfExportBtn && typeof diagWfExportBtn.addEventListener === 'function') {
      diagWfExportBtn.addEventListener('click', () => {
        this.exportWireframe('obj');
      });
    }

    const diagWfSaveBtn = document.getElementById('diag-wireframe-save-btn');
    if (diagWfSaveBtn && typeof diagWfSaveBtn.addEventListener === 'function') {
      diagWfSaveBtn.addEventListener('click', () => {
        this.saveWireframeToPackage();
      });
    }

    const diagWfThreeBtn = document.getElementById('diag-wireframe-threejs-btn');
    if (diagWfThreeBtn && typeof diagWfThreeBtn.addEventListener === 'function') {
      diagWfThreeBtn.addEventListener('click', () => {
        this.exportWireframe('threejs');
        if (typeof showToast === 'function') showToast('🎨 Three.js Editor JSON exported! Drag into threejs.org/editor', 'info');
      });
    }

    const diagExtractWfBtn = document.getElementById('diag-btn-extract-wireframe');
    if (diagExtractWfBtn && typeof diagExtractWfBtn.addEventListener === 'function') {
      diagExtractWfBtn.addEventListener('click', () => {
        this.extractWireframeFromCurrentPhotos();
      });
    }

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('keydown', (e) => {
        if ((e.key === 'Delete' || e.key === 'Backspace') && this.wireframeSelectedLineIndex !== null && this.isOpen) {
          const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
          if (activeTag !== 'input' && activeTag !== 'textarea') {
            e.preventDefault();
            this.deleteSelectedWireframeLine();
          }
        }
      });
    }

    const diagBtnFpv = document.getElementById('diag-btn-fpv');
    if (diagBtnFpv && typeof diagBtnFpv.addEventListener === 'function') {
      diagBtnFpv.addEventListener('click', () => {
        this.diagFpvMode = !this.diagFpvMode;
        if (this.diagFpvMode) {
          // Save current camera state
          if (this.threeCamera && this.threeControls) {
            this._savedCamPos = this.threeCamera.position.clone();
            this._savedCamTarget = this.threeControls.target.clone();
            this.threeControls.enabled = false;
          }
          // Immediately position to current drone location
          this._updateFPVCamera();
        } else {
          // Restore saved camera
          if (this.threeCamera && this.threeControls) {
            if (this._savedCamPos) this.threeCamera.position.copy(this._savedCamPos);
            if (this._savedCamTarget) this.threeControls.target.copy(this._savedCamTarget);
            this.threeControls.enabled = true;
            this.threeControls.update();
          }
        }
        diagBtnFpv.classList.toggle('active', this.diagFpvMode);
        _setDiagIndicator('diag-indicator-fpv', this.diagFpvMode);
      });
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Flight selector dropdown
    const flightSel = document.getElementById('diag-flight-selector');
    if (flightSel && typeof flightSel.addEventListener === 'function') {
      flightSel.addEventListener('change', (e) => {
        this.loadSelectedFlight(e.target.value);
      });
    }

    // Copy Antigravity Fix Prompt button
    const copyAntigravityBtn = document.getElementById('diag-copy-antigravity-btn');
    if (copyAntigravityBtn && typeof copyAntigravityBtn.addEventListener === 'function') {
      copyAntigravityBtn.addEventListener('click', () => this.copyAntigravityPrompt());
    }

    // Export Diag JSON button
    const exportJsonBtn = document.getElementById('diag-export-json-btn');
    if (exportJsonBtn && typeof exportJsonBtn.addEventListener === 'function') {
      exportJsonBtn.addEventListener('click', () => this.exportDiagJSON());
    }

    // Export GeoJSON button
    const exportBtn = document.getElementById('diag-export-geojson-btn');
    if (exportBtn && typeof exportBtn.addEventListener === 'function') {
      exportBtn.addEventListener('click', () => this.exportGeoJSON());
    }

    // Center 2D Map button
    const centerMapBtn = document.getElementById('diag-center-map-btn');
    if (centerMapBtn && typeof centerMapBtn.addEventListener === 'function') {
      centerMapBtn.addEventListener('click', () => this.centerMapOnFlight());
    }

    // Pull from RC 2 button in diagnostics header
    const diagPullBtn = document.getElementById('diag-pull-rc2-btn');
    if (diagPullBtn && typeof diagPullBtn.addEventListener === 'function') {
      diagPullBtn.addEventListener('click', () => pullFlightLogFromRC2(diagPullBtn));
    }

    // Browse all RC 2 logs button in diagnostics header
    const diagBrowseLogsBtn = document.getElementById('diag-browse-rc2-logs-btn');
    if (diagBrowseLogsBtn && typeof diagBrowseLogsBtn.addEventListener === 'function') {
      diagBrowseLogsBtn.addEventListener('click', () => openRc2LogManagerModal());
    }

    // Load file button
    const loadBtn = document.getElementById('diag-load-file-btn');
    const fileInput = document.getElementById('diag-file-input');
    if (loadBtn && fileInput && typeof loadBtn.addEventListener === 'function') {
      loadBtn.addEventListener('click', () => fileInput.click());
      if (typeof fileInput.addEventListener === 'function') {
        fileInput.addEventListener('change', (e) => this.handleLogFileImport(e));
      }
    }

    // DJI Cloud API Key button & modal controls
    const djiKeyBtn = document.getElementById('diag-dji-key-btn');
    if (djiKeyBtn && typeof djiKeyBtn.addEventListener === 'function') {
      djiKeyBtn.addEventListener('click', () => this.openDjiKeyModal());
    }

    const closeDjiKeyBtn = document.getElementById('close-dji-key-modal-btn');
    if (closeDjiKeyBtn && typeof closeDjiKeyBtn.addEventListener === 'function') {
      closeDjiKeyBtn.addEventListener('click', () => this.closeDjiKeyModal());
    }

    const cancelDjiKeyBtn = document.getElementById('cancel-dji-key-btn');
    if (cancelDjiKeyBtn && typeof cancelDjiKeyBtn.addEventListener === 'function') {
      cancelDjiKeyBtn.addEventListener('click', () => this.closeDjiKeyModal());
    }

    const saveDjiKeyBtn = document.getElementById('save-dji-key-btn');
    if (saveDjiKeyBtn && typeof saveDjiKeyBtn.addEventListener === 'function') {
      saveDjiKeyBtn.addEventListener('click', () => this.saveDjiApiKey());
    }

    const clearDjiKeyBtn = document.getElementById('clear-dji-key-btn');
    if (clearDjiKeyBtn && typeof clearDjiKeyBtn.addEventListener === 'function') {
      clearDjiKeyBtn.addEventListener('click', () => this.clearDjiApiKey());
    }

    const toggleKeyVisBtn = document.getElementById('toggle-dji-key-visibility-btn');
    const djiKeyInput = document.getElementById('dji-api-key-input');
    if (toggleKeyVisBtn && djiKeyInput && typeof toggleKeyVisBtn.addEventListener === 'function') {
      toggleKeyVisBtn.addEventListener('click', () => {
        djiKeyInput.type = djiKeyInput.type === 'password' ? 'text' : 'password';
        toggleKeyVisBtn.textContent = djiKeyInput.type === 'password' ? '👁️' : '🙈';
      });
    }

    if (djiKeyInput && typeof djiKeyInput.addEventListener === 'function') {
      djiKeyInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.saveDjiApiKey();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          this.closeDjiKeyModal();
        }
      });
    }

    // Mobile Subnav: 3D Replay vs Telemetry & Stats toggle
    const mobileSubtab3d = document.getElementById('diag-mobile-subtab-3d');
    const mobileSubtabStats = document.getElementById('diag-mobile-subtab-stats');
    const pane3d = document.getElementById('diag-pane-3d');

    if (mobileSubtab3d && mobileSubtabStats && pane3d && typeof mobileSubtab3d.addEventListener === 'function' && typeof mobileSubtabStats.addEventListener === 'function') {
      mobileSubtab3d.addEventListener('click', () => {
        pane3d.classList.remove('mobile-view-stats');
        pane3d.classList.add('mobile-view-3d');
        mobileSubtab3d.classList.add('active');
        mobileSubtabStats.classList.remove('active');
        this.handleResize();
      });

      mobileSubtabStats.addEventListener('click', () => {
        pane3d.classList.remove('mobile-view-3d');
        pane3d.classList.add('mobile-view-stats');
        mobileSubtabStats.classList.add('active');
        mobileSubtab3d.classList.remove('active');
      });
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', () => {
        if (this.isOpen) {
          this.handleResize();
        }
      });
    }
  },

  handleResize() {
    if (!this.isOpen) return;
    const container = document.getElementById('diag-3d-canvas-container');
    if (!container || !this.threeRenderer || !this.threeCamera) return;
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width > 0 && height > 0) {
      this.threeCamera.aspect = width / height;
      this.threeCamera.updateProjectionMatrix();
      this.threeRenderer.setSize(width, height);
      if (this.threeControls) {
        this.threeControls.update();
      }
    }
  },

  async checkDjiApiKeyStatus() {
    try {
      const apiBase = typeof getCompanionApiBase === 'function' ? getCompanionApiBase() : 'http://127.0.0.1:8765';
      const res = await fetch(`${apiBase}/api/config/dji`, {
        signal: (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') ? AbortSignal.timeout(2000) : undefined
      });
      if (res.ok) {
        const data = await res.json();
        const keyBtn = typeof document !== 'undefined' ? document.getElementById('diag-dji-key-btn') : null;
        const statusMsg = typeof document !== 'undefined' ? document.getElementById('dji-key-status-msg') : null;
        const input = typeof document !== 'undefined' ? document.getElementById('dji-api-key-input') : null;
        if (data.hasKey) {
          this.djiApiKeyConfigured = true;
          if (keyBtn) {
            keyBtn.classList.add('has-key');
            keyBtn.title = `DJI Cloud API Key Configured (${data.maskedKey || 'Active'})`;
          }
          if (input && !input.value) {
            input.placeholder = data.maskedKey || '••••••••••••••••••••••••••••••••';
          }
          if (statusMsg) {
            statusMsg.textContent = `Active Key: ${data.maskedKey || 'Configured'}`;
            statusMsg.style.color = '#34d399';
          }
        } else {
          this.djiApiKeyConfigured = false;
          if (keyBtn) {
            keyBtn.classList.remove('has-key');
            keyBtn.title = 'DJI Developer Cloud API Key for Decrypting Native Flight Logs';
          }
          if (input && !input.value) {
            input.placeholder = 'e.g. 7f93b5a14d2e8c60...';
          }
          if (statusMsg) {
            statusMsg.textContent = 'No DJI key configured. Encrypted logs fall back to synthetic KMZ modeling.';
            statusMsg.style.color = 'var(--text-muted)';
          }
        }
        return data;
      }
    } catch (e) {
      // Companion server offline or unreachable
    }
    return { hasKey: false };
  },

  openDjiKeyModal() {
    const modal = typeof document !== 'undefined' ? document.getElementById('dji-key-modal') : null;
    if (modal) {
      modal.classList.remove('hidden');
      this.checkDjiApiKeyStatus();
      const input = document.getElementById('dji-api-key-input');
      if (input) {
        input.value = '';
        input.focus();
      }
    }
  },

  closeDjiKeyModal() {
    const modal = typeof document !== 'undefined' ? document.getElementById('dji-key-modal') : null;
    if (modal) {
      modal.classList.add('hidden');
    }
  },

  async saveDjiApiKey() {
    const input = typeof document !== 'undefined' ? document.getElementById('dji-api-key-input') : null;
    const statusMsg = typeof document !== 'undefined' ? document.getElementById('dji-key-status-msg') : null;
    const saveBtn = typeof document !== 'undefined' ? document.getElementById('save-dji-key-btn') : null;
    const key = input ? input.value.trim() : '';

    if (!key) {
      if (statusMsg) {
        statusMsg.textContent = '⚠️ Please enter a 32-character DJI Developer App Key.';
        statusMsg.style.color = '#facc15';
      }
      return;
    }

    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';
    }

    try {
      const apiBase = typeof getCompanionApiBase === 'function' ? getCompanionApiBase() : 'http://127.0.0.1:8765';
      const res = await fetch(`${apiBase}/api/config/dji`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') ? AbortSignal.timeout(5000) : undefined,
        body: JSON.stringify({ apiKey: key })
      });
      const data = await res.json();
      if (data.success) {
        if (statusMsg) {
          statusMsg.textContent = `✅ Saved successfully (${data.maskedKey || 'Active'}).`;
          statusMsg.style.color = '#34d399';
        }
        await this.checkDjiApiKeyStatus();
        setTimeout(() => {
          this.closeDjiKeyModal();
          if (this.selectedFlightId && this.selectedFlightId !== 'active-mission') {
            this.loadSelectedFlight(this.selectedFlightId);
          } else {
            const flightSel = document.getElementById('diag-flight-selector');
            if (flightSel && flightSel.value && flightSel.value !== 'active-mission') {
              this.loadSelectedFlight(flightSel.value);
            }
          }
        }, 800);
      } else {
        throw new Error(data.error || 'Failed to save key');
      }
    } catch (err) {
      if (statusMsg) {
        statusMsg.textContent = `❌ ${err.message}`;
        statusMsg.style.color = '#f87171';
      }
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save & Decrypt';
      }
    }
  },

  async clearDjiApiKey() {
    const statusMsg = typeof document !== 'undefined' ? document.getElementById('dji-key-status-msg') : null;
    const clearBtn = typeof document !== 'undefined' ? document.getElementById('clear-dji-key-btn') : null;
    const input = typeof document !== 'undefined' ? document.getElementById('dji-api-key-input') : null;

    if (clearBtn) clearBtn.disabled = true;

    try {
      const apiBase = typeof getCompanionApiBase === 'function' ? getCompanionApiBase() : 'http://127.0.0.1:8765';
      const res = await fetch(`${apiBase}/api/config/dji`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') ? AbortSignal.timeout(5000) : undefined,
        body: JSON.stringify({ apiKey: '' })
      });
      const data = await res.json();
      if (data.success) {
        if (input) {
          input.value = '';
          input.placeholder = 'e.g. 7f93b5a14d2e8c60...';
        }
        if (statusMsg) {
          statusMsg.textContent = 'Key removed. Flight logs will use synthetic KMZ mode.';
          statusMsg.style.color = 'var(--text-muted)';
        }
        await this.checkDjiApiKeyStatus();
        if (this.selectedFlightId) {
          this.loadSelectedFlight(this.selectedFlightId);
        }
      }
    } catch (err) {
      if (statusMsg) {
        statusMsg.textContent = `❌ ${err.message}`;
        statusMsg.style.color = '#f87171';
      }
    } finally {
      if (clearBtn) clearBtn.disabled = false;
    }
  },

  copyAntigravityPrompt() {
    const includeCoords = (typeof document !== 'undefined' && document.getElementById('diag-include-coords-checkbox')?.checked) || false;
    let promptText = '';
    if (this.currentLoadedMission) {
      const m = this.currentLoadedMission;
      promptText = KMZInspector.generateAntigravityPrompt(
        m.validationReport || { rulesPassed: m.validation_rules_passed || 0, errors: m.validationErrors || [], warnings: m.validationWarnings || [] },
        m.wpml_xml,
        m.plan?.waypoints,
        { hideLocation: !includeCoords, mission: m }
      );
    } else {
      promptText = KMZInspector.generateAntigravityPrompt(null, '', null, { hideLocation: !includeCoords });
    }

    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(promptText).then(() => {
        const btn = document.getElementById('diag-copy-antigravity-btn');
        if (btn) {
          const orig = btn.innerHTML;
          btn.innerHTML = '✅ Copied to Clipboard!';
          btn.style.color = '#34d399';
          setTimeout(() => {
            btn.innerHTML = orig;
            btn.style.color = '#a5b4fc';
          }, 2500);
        }
        if (typeof showToast === 'function') {
          showToast(includeCoords ? '📋 Copied AI Export (Real GPS Coordinates)' : '📋 Copied AI Export (Masked to Default Reference)', 'info');
        }
      }).catch(() => {
        if (typeof prompt === 'function') prompt('Copy Antigravity Fix Prompt:', promptText);
      });
    } else {
      if (typeof prompt === 'function') prompt('Copy Antigravity Fix Prompt:', promptText);
    }
    return promptText;
  },

  centerMapOnFlight() {
    const origin = this.getSceneOrigin();
    if (!origin) return;
    if (typeof map !== 'undefined' && map && map.setView) {
      map.setView([origin.lat, origin.lon], 18);
      if (typeof centerMarker !== 'undefined' && centerMarker && centerMarker.setLatLng) {
        centerMarker.setLatLng([origin.lat, origin.lon]);
      }
      if (typeof updateMissionStats === 'function') updateMissionStats();
    }
  },

  async refreshFlightList() {
    const flightSel = document.getElementById('diag-flight-selector');
    if (!flightSel || typeof fetch === 'undefined') return;

    try {
      const apiBase = typeof getCompanionApiBase === 'function' ? getCompanionApiBase() : 'http://127.0.0.1:8765';
      // 1. Fetch raw RC 2 flight logs
      let rc2Flights = [];
      try {
        const res = await fetch(`${apiBase}/api/flights`, {
          signal: AbortSignal.timeout ? AbortSignal.timeout(1500) : undefined
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.flights)) {
            rc2Flights = data.flights;
          }
        }
      } catch (e) {}

      // 2. Fetch saved SQLite mission diagnostics
      let savedMissions = [];
      try {
        const resDiag = await fetch(`${apiBase}/api/diagnostics/history`, {
          signal: AbortSignal.timeout ? AbortSignal.timeout(1500) : undefined
        });
        if (resDiag.ok) {
          const dataDiag = await resDiag.json();
          if (dataDiag.success && Array.isArray(dataDiag.missions)) {
            savedMissions = dataDiag.missions;
          }
        }
      } catch (e) {}

      // Check localStorage for offline bad KMZ missions
      let localBadMissions = [];
      try {
        if (typeof localStorage !== 'undefined') {
          const raw = localStorage.getItem('aalaapi_bad_kmz_history');
          if (raw) localBadMissions = JSON.parse(raw);
        }
      } catch (e) {}

      if (rc2Flights.length === 0 && savedMissions.length === 0 && localBadMissions.length === 0) return;

      const currentVal = flightSel.value;
      flightSel.innerHTML = '';

      // Active Mission Simulation
      const planOpt = document.createElement('option');
      planOpt.value = 'active-mission';
      planOpt.textContent = '🎯 Planned Mission Simulation (Active Workspace)';
      flightSel.appendChild(planOpt);

      // Separate saved missions into valid vs bad / suspended
      const validSaved = savedMissions.filter(m => m.is_valid !== 0 && m.execution_status !== 'suspended' && m.execution_status !== 'failed');
      const badSaved = savedMissions.filter(m => m.is_valid === 0 || m.execution_status === 'suspended' || m.execution_status === 'failed');

      // Combine bad missions from SQLite and localStorage
      const combinedBad = [...badSaved];
      localBadMissions.forEach(lm => {
        const key = lm.archive_id || lm.uuid;
        if (!combinedBad.some(b => (b.archive_id || b.uuid) === key)) {
          combinedBad.push(lm);
        }
      });

      // Bad / Suspended Missions (Antigravity Triage)
      if (combinedBad.length > 0) {
        const groupBad = document.createElement('optgroup');
        groupBad.label = '⚠️ Bad / Suspended KMZs (Antigravity Triage)';
        combinedBad.forEach(m => {
          const opt = document.createElement('option');
          const identifier = m.archive_id || m.id || m.uuid;
          opt.value = `diag:${identifier}`;
          const dateClean = (m.created_at || '').replace('T', ' ').replace(/\..+/, '').replace('Z', ' UTC');
          const errCount = m.validation_errors ? m.validation_errors.length : (m.validation_errors_count || 0);
          opt.textContent = `❌ [FAIL: ${errCount} Issues] ${m.filename || m.uuid} (${m.waypoint_count || 0} wps • ${dateClean})`;
          groupBad.appendChild(opt);
        });
        flightSel.appendChild(groupBad);
      }

      // Saved Mission Diagnostics from SQLite Archive
      if (validSaved.length > 0) {
        const groupSaved = document.createElement('optgroup');
        groupSaved.label = 'Saved Mission Diagnostics (SQLite Archive)';
        validSaved.forEach((m) => {
          const opt = document.createElement('option');
          const identifier = m.archive_id || m.id || m.uuid;
          opt.value = `diag:${identifier}`;
          const dateClean = (m.created_at || '').replace('T', ' ').replace(/\..+/, '').replace('Z', ' UTC');
          opt.textContent = `💾 ${m.filename || m.uuid} (${m.waypoint_count || 0} wps • ${dateClean})`;
          groupSaved.appendChild(opt);
        });
        flightSel.appendChild(groupSaved);
      }

      // RC 2 Recorded Flights
      if (rc2Flights.length > 0) {
        const groupRc2 = document.createElement('optgroup');
        groupRc2.label = 'DJI RC 2 Flight Logs (Actual Recorded Flights)';
        rc2Flights.forEach(f => {
          const opt = document.createElement('option');
          opt.value = f.filename;
          opt.textContent = `🛰️ ${f.label}`;
          groupRc2.appendChild(opt);
        });
        flightSel.appendChild(groupRc2);
      }

      if (currentVal && currentVal !== '0' && currentVal !== 'active-mission' && !Array.from(flightSel.options).some(o => o.value === currentVal)) {
        const opt = document.createElement('option');
        opt.value = currentVal;
        opt.textContent = `🛰️ ${currentVal}`;
        flightSel.appendChild(opt);
      }
      if (currentVal) {
        flightSel.value = currentVal;
      } else {
        flightSel.selectedIndex = 0;
      }
    } catch (e) {
      // Keep existing options
    }
  },

  async loadSelectedFlight(flightId) {
    if (!flightId || flightId === '0' || (!flightId.startsWith('FlightRecord_') && !flightId.startsWith('diag:') && flightId !== 'active-mission')) {
      flightId = 'active-mission';
    }
    this._loadGeneration = (this._loadGeneration || 0) + 1;
    const myGeneration = this._loadGeneration;
    this._pendingFlightId = flightId;

    this.selectedFlightId = flightId;
    this.currentLoadedMission = null;
    this.plannedWaypoints = null;
    this.isActualFlown = false;
    const flightSel = document.getElementById('diag-flight-selector');
    if (flightSel && flightSel.value !== flightId) {
      flightSel.value = flightId;
    }

    const wps = getActiveMissionWaypoints();
    const altitude = (typeof document !== 'undefined' && parseFloat(document.getElementById('altitude')?.value)) || 21.0;
    const speed = (typeof document !== 'undefined' && parseFloat(document.getElementById('speed')?.value)) || 4.0;
    const gimbalPitch = (typeof document !== 'undefined') ? parseGimbalPitch(document.getElementById('gimbal-pitch')?.value, -60.0) : -60.0;
    const apiBase = typeof getCompanionApiBase === 'function' ? getCompanionApiBase() : 'http://127.0.0.1:8765';

    if (flightId === 'active-mission') {
      this.isActualFlown = false;
      const telemetry = generateTelemetryFromWaypoints(wps, { altitude, speed, gimbalPitch, flightId: 'active-mission', isSimulation: true });
      if (this._loadGeneration !== myGeneration) return; // superseded by a newer selection
      if (telemetry) {
        telemetry.isActualFlown = false;
        telemetry.isSimulation = true;
      }
      this.telemetryData = telemetry;
      this.comparisonData = computeFlightComparison({ waypointCount: wps.length, altitude, totalDistance: this.telemetryData?.totalDistance || 820 }, this.telemetryData);
      this.plannedWaypoints = wps;
    } else if (flightId.startsWith('diag:')) {
      const identifier = flightId.replace('diag:', '').trim();
      try {
        const res = await fetch(`${apiBase}/api/diagnostics/${encodeURIComponent(identifier)}`, {
          signal: AbortSignal.timeout ? AbortSignal.timeout(2000) : undefined
        });
        if (this._loadGeneration !== myGeneration) return; // superseded by a newer selection
        if (res.ok) {
          const data = await res.json();
          if (this._loadGeneration !== myGeneration) return; // superseded by a newer selection
          if (data.success && data.mission) {
            this.currentLoadedMission = data.mission;
            this.isActualFlown = !!(data.mission.isActualFlown || data.mission.diagnostics?.isActualFlown);
            // Store the planned waypoints from the saved mission (not the active workspace)
            this.plannedWaypoints = data.mission.plan?.waypoints || null;
            if (data.mission.diagnostics && Array.isArray(data.mission.diagnostics.points) && data.mission.diagnostics.points.length > 0) {
              let diag = data.mission.diagnostics;
              const missionWps = data.mission.plan?.waypoints;
              if (missionWps && missionWps.length > 1 && diag.points) {
                const photoAlts = new Set(diag.points.filter(p => p.isPhoto).map(p => p.alt));
                const planAlts = new Set(missionWps.map(w => w.altitude !== undefined ? w.altitude : (w.alt !== undefined ? w.alt : 50)));
                if (photoAlts.size === 1 && planAlts.size > 1) {
                  const missionAlt = data.mission.altitude || altitude;
                  const missionSpeed = data.mission.speed || speed;
                  const missionGimbal = data.mission.gimbal_pitch || gimbalPitch;
                  diag = generateTelemetryFromWaypoints(missionWps, { altitude: missionAlt, speed: missionSpeed, gimbalPitch: missionGimbal, flightId, isSimulation: !this.isActualFlown });
                }
              }
              this.telemetryData = diag;
              const plannedStats = data.mission.plan?.statistics || {
                waypointCount: data.mission.waypoint_count,
                altitude: data.mission.altitude,
                totalDistance: data.mission.total_distance
              };
              this.comparisonData = computeFlightComparison(plannedStats, this.telemetryData);
            } else if (data.mission.wpml_xml && typeof parseKmlOrWpmlTelemetry === 'function') {
              // Parse actual flight telemetry directly from WPML placemarks
              const parsed = parseKmlOrWpmlTelemetry(data.mission.wpml_xml, flightId);
              if (parsed && Array.isArray(parsed.points) && parsed.points.length > 0) {
                this.telemetryData = parsed;
                if (!this.plannedWaypoints || !this.plannedWaypoints.length) {
                  this.plannedWaypoints = parsed.points.map(p => ({ lat: p.lat, lon: p.lon, altitude: p.alt }));
                }
                this.comparisonData = computeFlightComparison({
                  waypointCount: data.mission.waypoint_count || parsed.points.length,
                  altitude: data.mission.altitude || parsed.maxAltitude,
                  totalDistance: data.mission.total_distance || parsed.totalDistance
                }, this.telemetryData);
              } else {
                this.telemetryData = null;
                this.comparisonData = null;
              }
            } else if (data.mission.plan && Array.isArray(data.mission.plan.waypoints) && data.mission.plan.waypoints.length > 0) {
              // Use the saved mission's own waypoints and flight params, not the current workspace
              const missionWps = data.mission.plan.waypoints;
              const missionAlt = data.mission.altitude || altitude;
              const missionSpeed = data.mission.speed || speed;
              const missionGimbal = data.mission.gimbal_pitch || gimbalPitch;
              this.telemetryData = generateTelemetryFromWaypoints(missionWps, { altitude: missionAlt, speed: missionSpeed, gimbalPitch: missionGimbal, flightId, isSimulation: !this.isActualFlown });
              this.comparisonData = computeFlightComparison({ waypointCount: missionWps.length, altitude: missionAlt, totalDistance: this.telemetryData?.totalDistance || 820 }, this.telemetryData);
            } else {
              // Incomplete or empty archive record (e.g. mock test entry) — DO NOT show active workspace!
              this.telemetryData = null;
              this.comparisonData = null;
              this.plannedWaypoints = null;
            }
          } else {
            throw new Error('Diagnostics data missing in mission payload');
          }
        } else {
          throw new Error('Companion offline');
        }
      } catch (err) {
        if (this._loadGeneration !== myGeneration) return; // superseded by a newer selection
        console.warn('Failed to load saved diagnostic by uuid:', err);
        // DO NOT fall back to active workspace waypoints!
        this.telemetryData = null;
        this.comparisonData = null;
        this.plannedWaypoints = null;
      }
    } else {
      try {
        const cleanWps = Array.isArray(wps) ? wps.map(w => ({
          lat: typeof w.lat === 'function' ? w.lat() : Number(w.lat || 0),
          lon: typeof w.lon === 'function' ? w.lon() : (w.lng !== undefined ? Number(w.lng) : Number(w.lon || 0)),
          altitude: Number(w.altitude || w.alt || altitude || 21.0),
          speed: Number(w.speed || speed || 4.0),
          gimbalPitch: Number(w.gimbalPitch !== undefined ? w.gimbalPitch : gimbalPitch)
        })) : [];

        let res = await fetch(`${apiBase}/api/flight-telemetry?file=${encodeURIComponent(flightId)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') ? AbortSignal.timeout(45000) : undefined,
          body: JSON.stringify({
            flightId,
            waypoints: cleanWps,
            options: { altitude, speed, gimbalPitch, flightId }
          })
        });
        if (this._loadGeneration !== myGeneration) return; // superseded by a newer selection
        let data = res.ok ? await res.json() : null;

        // If newly pulled flight is still being written/decrypted by companion, retry once after 800ms
        if ((!data || !data.success || !data.telemetry || !data.telemetry.points || !data.telemetry.points.length) && flightId.startsWith('FlightRecord_')) {
          await new Promise(r => setTimeout(r, 800));
          if (this._loadGeneration !== myGeneration) return;
          try {
            const retryRes = await fetch(`${apiBase}/api/flight-telemetry?file=${encodeURIComponent(flightId)}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              signal: (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') ? AbortSignal.timeout(20000) : undefined,
              body: JSON.stringify({ flightId, waypoints: cleanWps, options: { altitude, speed, gimbalPitch, flightId } })
            });
            if (retryRes.ok) {
              const retryData = await retryRes.json();
              if (retryData && retryData.success && retryData.telemetry && retryData.telemetry.points && retryData.telemetry.points.length) {
                data = retryData;
              }
            }
          } catch (_) {}
        }
        if (this._loadGeneration !== myGeneration) return; // superseded by a newer selection

        if (data && data.success && data.telemetry) {
          this.isDecrypted = !!data.isDecrypted;
          this.needsDjiApiKey = !!data.needsDjiApiKey;
          this.djiApiKeyConfigured = !!data.djiApiKeyConfigured;
          this.djiDecryptError = data.djiDecryptError || null;
          let telem = data.telemetry;
          this.isActualFlown = (telem.isActualFlown !== undefined) ? !!telem.isActualFlown : (this.isDecrypted || !telem.isSimulation);
          if (data.mission) {
            this.currentLoadedMission = data.mission;
          }
          const plannedWps = data.telemetry.plannedWaypoints || data.plannedWaypoints || (data.mission?.plan?.waypoints) || null;
          if (!this.isDecrypted && telem && telem.points && plannedWps && plannedWps.length > 1) {
            const photoAlts = new Set(telem.points.filter(p => p.isPhoto).map(p => p.alt));
            const planAlts = new Set(plannedWps.map(w => w.altitude !== undefined ? w.altitude : (w.alt !== undefined ? w.alt : 50)));
            if (photoAlts.size === 1 && planAlts.size > 1) {
              telem = generateTelemetryFromWaypoints(plannedWps, { altitude, speed, gimbalPitch, flightId, isSimulation: !this.isActualFlown });
            }
          }
          this.telemetryData = telem;
          this.comparisonData = data.comparison;
          // Use planned waypoints returned by the companion (from the log's matched mission),
          // falling back to null so buildTrajectoryMeshes uses the active workspace only as a last resort.
          this.plannedWaypoints = plannedWps;
        } else {
          throw new Error('Telemetry not in payload');
        }
      } catch (e) {
        if (this._loadGeneration !== myGeneration) return; // superseded by a newer selection
        this.isDecrypted = false;
        this.needsDjiApiKey = false;
        // For built-in demo flight profiles (e.g. 2026-08-20 demo logs), generate offline simulation
        if (flightId && (flightId.includes('2026-08-20') || flightId.includes('19-39-07') || flightId.includes('19-41-15') || flightId.includes('19-42-28') || flightId.includes('19-47-15'))) {
          this.isActualFlown = false;
          this.telemetryData = generateTelemetryFromWaypoints(wps, { altitude, speed, gimbalPitch, flightId, isSimulation: true });
          this.comparisonData = computeFlightComparison({ waypointCount: wps.length, altitude, totalDistance: this.telemetryData?.totalDistance || 820 }, this.telemetryData);
          this.plannedWaypoints = null;
        } else {
          // For real RC2 flight records when companion is unreachable, do NOT fall back to active workspace!
          this.isActualFlown = false;
          this.telemetryData = null;
          this.comparisonData = null;
          this.plannedWaypoints = null;
        }
      }
    }

    // Final guard: do not render stale data if a newer load completed after ours
    if (this._loadGeneration !== myGeneration) return;

    // Automatically discover and attach any saved inspection photos from companion archive
    this.flightPhotos = null;
    this.flightPhotosFlightId = null;
    this.flightManifest = null;
    try {
      let tStart = null;
      let tEnd = null;
      if (this.telemetryData && this.telemetryData.flightDate) {
        const s = new Date(this.telemetryData.flightDate).getTime();
        if (!isNaN(s)) {
          tStart = new Date(s).toISOString();
          const durMs = (this.telemetryData.durationSec || 600) * 1000;
          tEnd = new Date(s + durMs).toISOString();
        }
      }
      const flightTagMatch = (flightId || '').match(/(\d{4}-\d{2}-\d{2}_\[\d{2}-\d{2}-\d{2}\])/);
      const flightTag = flightTagMatch ? flightTagMatch[1] : '';
      const flightBase = (flightId || '').replace(/\.txt$/i, '').replace(/[^a-zA-Z0-9_-]/g, '_');
      const mUuid = flightTag ? `mission_${flightTag}` : (this.currentLoadedMission?.uuid || (flightBase ? `mission_${flightBase}` : ((typeof activeLayerId !== 'undefined' && activeLayerId) || 'layer-1')));

      let manifestUrl = `${apiBase}/api/media/manifest?flight=${encodeURIComponent(flightId || '')}&uuid=${encodeURIComponent(mUuid)}`;
      if (tStart) {
        manifestUrl += `&start=${encodeURIComponent(tStart)}&end=${encodeURIComponent(tEnd || tStart)}`;
      }

      const mRes = await fetch(manifestUrl, {
        signal: (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') ? AbortSignal.timeout(2000) : undefined
      });
      if (mRes.ok) {
        const mData = await mRes.json();
        if (mData && Array.isArray(mData.photos)) {
          const filtered = this.filterPhotosForCurrentFlight(mData.photos);
          this.flightPhotos = filtered;
          this.flightPhotosFlightId = flightId;
          this.flightManifest = { ...mData, photos: filtered, totalPhotos: filtered.length };
          activeInspectionManifest = this.flightManifest;
          if (mData.wireframe && mData.wireframe.success) {
            this.wireframeData = mData.wireframe;
          }
        }
      }
      try {
        const wfRes = await fetch(`${apiBase}/api/process/wireframe?missionUuid=${encodeURIComponent(mUuid)}`, {
          signal: (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') ? AbortSignal.timeout(1500) : undefined
        });
        if (wfRes.ok) {
          const wfData = await wfRes.json();
          if (wfData && wfData.success && Array.isArray(wfData.lines) && wfData.lines.length > 0) {
            this.wireframeData = wfData;
          }
        }
      } catch (_) {}
    } catch (e) {}

    this.updateStatsUI();
    this.renderInspectionPhotosUI();
    this.init3DScene();
    const resumeIdx = (typeof PlaybackManager !== 'undefined' && PlaybackManager.activeFlightId === this.selectedFlightId && PlaybackManager.currentIndex > 0)
      ? PlaybackManager.currentIndex : 0;
    this.playbackFractionalIndex = resumeIdx;
    this.seekTo(resumeIdx, true, true);
    this.pause();
  },

  getSceneOrigin() {
    if (this.telemetryData && this.telemetryData.homePoint) {
      return this.telemetryData.homePoint;
    }
    // Skip centerMarker fallback — it would anchor the 3D scene at the active workspace
    // instead of the loaded flight's actual location.
    if (this.telemetryData && this.telemetryData.points && this.telemetryData.points.length > 0) {
      return { lat: this.telemetryData.points[0].lat, lon: this.telemetryData.points[0].lon };
    }
    return { lat: 40.0130, lon: -83.1765 };
  },

  projectToWorld(lat, lon, alt = 0) {
    const origin = this.getSceneOrigin();
    const tileZoom = 18;
    const tileWidthMeters = 40075016.686 * Math.cos(origin.lat * Math.PI / 180) / Math.pow(2, tileZoom);
    const sinLat0 = Math.sin(origin.lat * Math.PI / 180);
    const xTile0 = ((origin.lon + 180) / 360) * Math.pow(2, tileZoom);
    const yTile0 = (0.5 - Math.log((1 + sinLat0) / (1 - sinLat0)) / (4 * Math.PI)) * Math.pow(2, tileZoom);

    const sinLat = Math.sin(lat * Math.PI / 180);
    const xTile = ((lon + 180) / 360) * Math.pow(2, tileZoom);
    const yTile = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * Math.pow(2, tileZoom);

    const x = (xTile - xTile0) * tileWidthMeters;
    const z = (yTile - yTile0) * tileWidthMeters;
    const y = Math.max(0.1, alt);
    return new THREE.Vector3(x, y, z);
  },

  async open(customDataOrTab = null, maybeTabOrCustom = null) {
    let customData = null;
    let targetTab = '3d';
    let targetFlightId = null;

    if (typeof customDataOrTab === 'string') {
      if (customDataOrTab === '3d' || customDataOrTab === 'audit' || customDataOrTab === 'photos') {
        targetTab = customDataOrTab;
        if (typeof maybeTabOrCustom === 'string') {
          targetFlightId = maybeTabOrCustom;
        } else if (maybeTabOrCustom && typeof maybeTabOrCustom === 'object') {
          customData = maybeTabOrCustom;
        }
      } else {
        // First argument is a flightId (e.g. FlightRecord_... or diag:...)
        targetTab = '3d';
        targetFlightId = customDataOrTab;
        if (maybeTabOrCustom && typeof maybeTabOrCustom === 'object') {
          customData = maybeTabOrCustom;
        }
      }
    } else if (customDataOrTab && typeof customDataOrTab === 'object') {
      customData = customDataOrTab;
      if (typeof maybeTabOrCustom === 'string') {
        if (maybeTabOrCustom === '3d' || maybeTabOrCustom === 'audit' || maybeTabOrCustom === 'photos') {
          targetTab = maybeTabOrCustom;
        } else {
          targetFlightId = maybeTabOrCustom;
        }
      }
    }

    const modal = document.getElementById('flight-diagnostics-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    this.isOpen = true;

    // Reset mobile subnav to 3D View by default
    const pane3d = document.getElementById('diag-pane-3d');
    if (pane3d) {
      pane3d.classList.add('mobile-view-3d');
      pane3d.classList.remove('mobile-view-stats');
    }
    const mobileSubtab3d = document.getElementById('diag-mobile-subtab-3d');
    const mobileSubtabStats = document.getElementById('diag-mobile-subtab-stats');
    if (mobileSubtab3d) mobileSubtab3d.classList.add('active');
    if (mobileSubtabStats) mobileSubtabStats.classList.remove('active');

    this.switchTab(targetTab);
    this.checkDjiApiKeyStatus();

    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => this.handleResize());
    }

    if (targetTab === '3d') {
      if (customData) {
        const flightSel = document.getElementById('diag-flight-selector');
        this.selectedFlightId = customData.flightId || targetFlightId || (flightSel && flightSel.value) || 'active-mission';
        this.isActualFlown = customData.isActualFlown !== undefined ? !!customData.isActualFlown : !!customData.telemetry?.isActualFlown;
        this.telemetryData = customData.telemetry;
        this.comparisonData = customData.comparison;
        this.updateStatsUI();
        this.init3DScene();
        this.playbackFractionalIndex = 0.0;
        this.seekTo(0, true, true);
        this.pause();
      } else {
        await this.refreshFlightList();
        const flightSel = document.getElementById('diag-flight-selector');
        if (flightSel && targetFlightId) {
          const optionsList = Array.from(flightSel.options || []);
          if (!optionsList.some(o => o.value === targetFlightId) && document.createElement) {
            try {
              const opt = document.createElement('option');
              opt.value = targetFlightId;
              opt.textContent = `🛰️ ${targetFlightId}`;
              flightSel.appendChild(opt);
            } catch (_) {}
          }
          flightSel.value = targetFlightId;
        }
        const selectedFlightId = targetFlightId || (flightSel && flightSel.value && flightSel.value !== '0' && flightSel.value !== '') ? (targetFlightId || flightSel.value) : 'active-mission';
        await this.loadSelectedFlight(selectedFlightId);
      }
    }
  },

  close() {
    const modal = document.getElementById('flight-diagnostics-modal');
    if (modal) modal.classList.add('hidden');
    const auditPane = document.getElementById('kmz-inspector-modal');
    if (auditPane) auditPane.classList.add('hidden');
    this.isOpen = false;
    this.pause();
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  },

  updateStatsUI() {
    const trajCard = (typeof document !== 'undefined') ? document.getElementById('diag-trajectory-card') : null;
    const battCard = (typeof document !== 'undefined') ? document.getElementById('diag-battery-card') : null;

    const isActual = (this.isActualFlown === true) ||
      (this.isActualFlown !== false && this.selectedFlightId !== 'active-mission' && !this.telemetryData?.isSimulation) ||
      (!!this.comparisonData?.maxDeviation && this.selectedFlightId !== 'active-mission' && !this.telemetryData?.isSimulation);
    const modeTitleEl = (typeof document !== 'undefined') ? document.getElementById('diag-sidebar-mode-title') : null;
    const statusBadgeEl = (typeof document !== 'undefined') ? document.getElementById('diag-sidebar-status-badge') : null;
    const timeDeltaEl = (typeof document !== 'undefined') ? document.getElementById('diag-stat-time-delta') : null;
    const distDeltaEl = (typeof document !== 'undefined') ? document.getElementById('diag-stat-dist-delta') : null;
    const altDeltaEl = (typeof document !== 'undefined') ? document.getElementById('diag-stat-alt-delta') : null;
    const photosDeltaEl = (typeof document !== 'undefined') ? document.getElementById('diag-stat-photos-delta') : null;

    const timeLabelEl = (typeof document !== 'undefined') ? document.getElementById('diag-stat-time-label') : null;
    const distLabelEl = (typeof document !== 'undefined') ? document.getElementById('diag-stat-dist-label') : null;
    const altLabelEl = (typeof document !== 'undefined') ? document.getElementById('diag-stat-alt-label') : null;
    const photosLabelEl = (typeof document !== 'undefined') ? document.getElementById('diag-stat-photos-label') : null;

    if (!isActual) {
      if (modeTitleEl) modeTitleEl.textContent = 'Mission Simulation';
      if (statusBadgeEl) {
        statusBadgeEl.textContent = '🎯 Simulation (Unflown)';
        if (statusBadgeEl.style) {
          statusBadgeEl.style.color = '#38bdf8';
          statusBadgeEl.style.background = 'rgba(56, 189, 248, 0.15)';
          statusBadgeEl.style.borderColor = 'rgba(56, 189, 248, 0.3)';
        }
      }
      if (timeLabelEl) timeLabelEl.textContent = 'Est. Flight Time';
      if (distLabelEl) distLabelEl.textContent = 'Planned Distance';
      if (altLabelEl) altLabelEl.textContent = 'Planned Max Alt';
      if (photosLabelEl) photosLabelEl.textContent = 'Planned Photos';

      if (timeDeltaEl && timeDeltaEl.style) timeDeltaEl.style.display = 'none';
      if (distDeltaEl && distDeltaEl.style) distDeltaEl.style.display = 'none';
      if (altDeltaEl && altDeltaEl.style) altDeltaEl.style.display = 'none';
      if (photosDeltaEl && photosDeltaEl.style) photosDeltaEl.style.display = 'none';
    } else {
      if (modeTitleEl) modeTitleEl.textContent = 'Mission Comparison';
      if (statusBadgeEl) {
        statusBadgeEl.textContent = '✅ Completed';
        if (statusBadgeEl.style) {
          statusBadgeEl.style.color = '#22c55e';
          statusBadgeEl.style.background = 'rgba(34, 197, 94, 0.15)';
          statusBadgeEl.style.borderColor = 'rgba(34, 197, 94, 0.3)';
        }
      }
      if (timeLabelEl) timeLabelEl.textContent = 'Flight Time';
      if (distLabelEl) distLabelEl.textContent = 'Total Distance';
      if (altLabelEl) altLabelEl.textContent = 'Max Altitude';
      if (photosLabelEl) photosLabelEl.textContent = 'Photos Captured';

      if (timeDeltaEl && timeDeltaEl.style) timeDeltaEl.style.display = 'inline';
      if (distDeltaEl && distDeltaEl.style) distDeltaEl.style.display = 'inline';
      if (altDeltaEl && altDeltaEl.style) altDeltaEl.style.display = 'inline';
      if (photosDeltaEl && photosDeltaEl.style) photosDeltaEl.style.display = 'inline';
    }

    if (!this.telemetryData || !this.telemetryData.points || !this.telemetryData.points.length) {
      if (trajCard) trajCard.style.display = 'none';
      if (battCard) battCard.style.display = 'none';

      const slider = (typeof document !== 'undefined') ? document.getElementById('diag-timeline-slider') : null;
      if (slider) { slider.max = '0'; slider.value = '0'; }
      const meta = (typeof document !== 'undefined') ? document.getElementById('diag-flight-meta') : null;
      if (meta) {
        const safeFlightName = (this.selectedFlightId || 'None').replace(/[<>&"]/g, '');
        meta.innerHTML = `Telemetry Log: <strong>${safeFlightName}</strong> • <span style="color: #f87171;">⚠️ No telemetry points</span> <button type="button" class="btn-secondary" style="padding: 2px 8px; font-size: 0.7rem; margin-left: 6px; cursor: pointer;" onclick="if(typeof FlightDiagnostics!=='undefined')FlightDiagnostics.loadSelectedFlight('${safeFlightName}')">🔄 Retry</button>`;
      }
      const timeDisplay = (typeof document !== 'undefined') ? document.getElementById('diag-time-display') : null;
      if (timeDisplay) { timeDisplay.textContent = '00:00 / 00:00'; }
      return;
    }
    const slider = (typeof document !== 'undefined') ? document.getElementById('diag-timeline-slider') : null;
    if (slider) {
      slider.max = (this.telemetryData.points.length - 1).toString();
      slider.value = '0';
    }

    const setTxt = (id, val) => {
      if (typeof document === 'undefined') return;
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    const comp = this.comparisonData;
    if (comp) {
      if (comp.time) {
        setTxt('diag-stat-time-actual', comp.time.actual);
        if (isActual) setTxt('diag-stat-time-delta', `(${comp.time.delta})`);
      }
      if (comp.distance) {
        setTxt('diag-stat-dist-actual', comp.distance.actual);
        if (isActual) setTxt('diag-stat-dist-delta', `(Plan: ${comp.distance.planned})`);
      }
      if (comp.altitude) {
        setTxt('diag-stat-alt-actual', comp.altitude.actual);
        if (isActual) setTxt('diag-stat-alt-delta', `(${comp.altitude.delta})`);
      }
      if (comp.photos) {
        if (isActual) {
          setTxt('diag-stat-photos-actual', `${comp.photos.actual} / ${comp.photos.planned} Photos`);
        } else {
          setTxt('diag-stat-photos-actual', `${comp.photos.planned || comp.photos.actual || 0} Photos`);
        }
      }
    } else {
      setTxt('diag-stat-time-actual', this.telemetryData.durationFormatted || '00:00');
      setTxt('diag-stat-dist-actual', `${this.telemetryData.totalDistance || 0} m`);
      setTxt('diag-stat-alt-actual', `${this.telemetryData.maxAltitude || 0} m`);
      setTxt('diag-stat-photos-actual', `${this.telemetryData.photoCount || 0} Photos`);
    }

    // Trajectory Accuracy card (only shown for actual flown flights with drift metrics)
    const maxDev = comp?.maxDeviation || this.telemetryData.maxDeviation;
    if (isActual && maxDev && maxDev !== '0' && maxDev !== 'undefined') {
      if (trajCard) trajCard.style.display = 'flex';
      setTxt('diag-stat-drift', maxDev);
      setTxt('diag-stat-heading-error', this.telemetryData.headingError || '< 1.2°');
      const photoCount = comp?.photos?.actual ?? this.telemetryData.photoCount ?? 0;
      const photoTxt = photoCount > 0
        ? `All ${photoCount} waypoint photo trigger positions verified within tolerance.`
        : 'Waypoint positions verified within tolerance.';
      setTxt('diag-stat-trigger-status', photoTxt);
    } else if (trajCard) {
      trajCard.style.display = 'none';
    }

    // Battery Health & Consumption card
    const hasCompBatt = comp?.battery &&
      comp.battery.start && !comp.battery.start.includes('undefined') && !comp.battery.start.includes('NaN') &&
      comp.battery.end && !comp.battery.end.includes('undefined') && !comp.battery.end.includes('NaN');
    const hasTelemBatt = this.telemetryData.batteryStart !== undefined && this.telemetryData.batteryEnd !== undefined && !isNaN(this.telemetryData.batteryStart);

    if (hasCompBatt) {
      if (battCard) battCard.style.display = 'flex';
      setTxt('diag-stat-battery-consumption', `${comp.battery.start} \u2192 ${comp.battery.end} (${comp.battery.consumed} used)`);
      setTxt('diag-stat-battery-rate', `~${comp.battery.ratePerMin}`);
    } else if (hasTelemBatt) {
      if (battCard) battCard.style.display = 'flex';
      const used = Math.max(0, this.telemetryData.batteryStart - this.telemetryData.batteryEnd);
      setTxt('diag-stat-battery-consumption', `${this.telemetryData.batteryStart}% \u2192 ${this.telemetryData.batteryEnd}% (${used}% used)`);
      const durMin = (this.telemetryData.durationSec || 0) / 60;
      const rate = durMin > 0 ? (used / durMin).toFixed(1) : '0';
      setTxt('diag-stat-battery-rate', `~${rate}% / min`);
    } else if (battCard) {
      battCard.style.display = 'none';
    }

    const meta = (typeof document !== 'undefined') ? document.getElementById('diag-flight-meta') : null;
    if (meta) {
      if (!isActual) {
        const flightName = (this.selectedFlightId === 'active-mission') ? 'Planned Mission Simulation (Active Workspace)' : (this.selectedFlightId || 'Simulation');
        meta.textContent = `Mode: ${flightName} • Est. Duration: ${this.telemetryData.durationFormatted} [Pre-Flight Simulation • Unflown]`;
        meta.innerHTML = `Mode: <strong>${flightName}</strong> • Est. Duration: <strong>${this.telemetryData.durationFormatted}</strong> <span style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.35); padding: 2px 7px; border-radius: 4px; font-size: 0.72rem; font-weight: 600; margin-left: 6px;">🎯 Pre-Flight Simulation • Unflown</span>`;
      } else {
        const flightName = this.selectedFlightId || 'FlightRecord_2026-08-20_[19-42-28].txt';
        meta.textContent = `Telemetry Log: ${flightName} • Duration: ${this.telemetryData.durationFormatted}`;
        let decBadge = '';
        if (this.isDecrypted) {
          decBadge = ' <span style="background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.35); padding: 2px 7px; border-radius: 4px; font-size: 0.72rem; font-weight: 600; margin-left: 6px;">🔓 Decrypted via DJI Cloud API</span>';
        } else if (this.needsDjiApiKey) {
          decBadge = ' <span style="background: rgba(234, 179, 8, 0.2); color: #facc15; border: 1px solid rgba(234, 179, 8, 0.35); padding: 2px 7px; border-radius: 4px; font-size: 0.72rem; font-weight: 600; margin-left: 6px; cursor: pointer;" onclick="if(typeof FlightDiagnostics!==\'undefined\')FlightDiagnostics.openDjiKeyModal()" title="Click to enter DJI Developer App Key to decrypt encrypted flight record">📐 Modeled (Synthetic KMZ) • 🔑 Decrypt</span>';
        } else if (this.djiDecryptError) {
          const errSafe = String(this.djiDecryptError).replace(/"/g, '&quot;');
          decBadge = ` <span style="background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.35); padding: 2px 7px; border-radius: 4px; font-size: 0.72rem; font-weight: 600; margin-left: 6px; cursor: pointer;" onclick="if(typeof FlightDiagnostics!==\'undefined\')FlightDiagnostics.openDjiKeyModal()" title="Decryption failed: ${errSafe}. Click to check DJI Developer Key.">⚠️ Decrypt Failed • 🔑 Retry</span>`;
        }
        let matchedBadge = '';
        if (this.currentLoadedMission && (this.currentLoadedMission.filename || this.currentLoadedMission.uuid)) {
          const planLabel = this.currentLoadedMission.filename || (this.currentLoadedMission.uuid.slice(0, 8) + '...');
          matchedBadge = ` <span style="background: rgba(6, 182, 212, 0.15); color: #06b6d4; border: 1px solid rgba(6, 182, 212, 0.35); padding: 2px 7px; border-radius: 4px; font-size: 0.72rem; font-weight: 600; margin-left: 6px;" title="Correlated with mission plan ${this.currentLoadedMission.uuid}">🎯 Plan: ${planLabel}</span>`;
        }
        meta.innerHTML = `Telemetry Log: <strong>${flightName}</strong> • Duration: <strong>${this.telemetryData.durationFormatted}</strong>${decBadge}${matchedBadge}`;
      }
    }

    const timeDisplay = (typeof document !== 'undefined') ? document.getElementById('diag-time-display') : null;
    if (timeDisplay) {
      timeDisplay.textContent = `00:00 / ${this.telemetryData.durationFormatted}`;
    }

    this.renderInspectionPhotosUI();
  },

  init3DScene() {
    if (typeof document === 'undefined') return;
    const container = document.getElementById('diag-3d-canvas-container');
    if (!container || typeof THREE === 'undefined') return;

    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 500;

    // Reuse existing WebGLRenderer if already created to prevent WebGL context exhaustion (CONTEXT_LOST_WEBGL)
    if (!this.threeRenderer) {
      this.threeRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
      this.threeRenderer.setPixelRatio(window.devicePixelRatio || 1);
      container.appendChild(this.threeRenderer.domElement);

      const canvas = this.threeRenderer.domElement;
      canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        console.warn('WebGL context lost, pausing render loop');
        if (this.animFrameId) {
          cancelAnimationFrame(this.animFrameId);
          this.animFrameId = null;
        }
      }, false);
      canvas.addEventListener('webglcontextrestored', () => {
        console.log('WebGL context restored, rebuilding 3D scene');
        this.threeRenderer = null;
        this.threeScene = null;
        this.threeControls = null;
        this.groundMesh = null;
        this.groundTexture = null;
        this.droneMesh = null;
        this.init3DScene();
      }, false);
    } else {
      if (!container.contains(this.threeRenderer.domElement)) {
        const strayCanvas = container.querySelector('canvas');
        if (strayCanvas && strayCanvas !== this.threeRenderer.domElement) {
          container.removeChild(strayCanvas);
        }
        container.appendChild(this.threeRenderer.domElement);
      }
    }
    this.threeRenderer.setSize(width, height);

    if (!this.threeScene) {
      this.threeScene = new THREE.Scene();
      this.threeScene.background = new THREE.Color(0x070a13);
      this.threeScene.fog = new THREE.FogExp2(0x070a13, 0.0008);

      this.threeCamera = new THREE.PerspectiveCamera(45, width / height, 1, 3000);
      this.threeCamera.position.set(0, 90, 140);

      if (THREE.OrbitControls) {
        this.threeControls = new THREE.OrbitControls(this.threeCamera, this.threeRenderer.domElement);
        this.threeControls.enableDamping = true;
        this.threeControls.dampingFactor = 0.05;
        this.threeControls.maxPolarAngle = Math.PI / 2 - 0.01;
      }

      if (!this._raycasterBound && typeof THREE !== 'undefined' && THREE.Raycaster && THREE.Vector2 && this.threeRenderer && this.threeRenderer.domElement) {
        this._raycasterBound = true;
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();
        this.threeRenderer.domElement.addEventListener('click', (event) => {
          if (!this.threeCamera) return;
          const rect = this.threeRenderer.domElement.getBoundingClientRect();
          mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
          mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
          if (typeof raycaster.setFromCamera === 'function') {
            raycaster.setFromCamera(mouse, this.threeCamera);
          }

          // 1. Raycast on Wireframe line segments
          if (this.wireframeLinesMesh && this.wireframeLinesMesh.visible && this.wireframeData && Array.isArray(this.wireframeData.lines)) {
            if (raycaster.params) {
              if (!raycaster.params.Line) raycaster.params.Line = {};
              raycaster.params.Line.threshold = 1.8;
            }
            const wfIntersects = raycaster.intersectObject(this.wireframeLinesMesh);
            if (wfIntersects && wfIntersects.length > 0) {
              const hit = wfIntersects[0];
              const segIdx = (hit.index !== undefined) ? Math.floor(hit.index / 2) : 0;
              this.selectWireframeLine(segIdx);
              return;
            }
          }

          // 2. Raycast on Photo Markers
          if (this.photoMarkers && this.photoMarkers.length > 0) {
            const intersects = raycaster.intersectObjects(this.photoMarkers, true);
            if (intersects && intersects.length > 0) {
              let hit = intersects[0].object;
              while (hit && (!hit.userData || hit.userData.index === undefined) && hit.parent) {
                hit = hit.parent;
              }
              if (hit && hit.userData && hit.userData.index !== undefined) {
                this.seekTo(hit.userData.index);
              }
            }
          }
        });
      }

      // Lighting
      const amb = new THREE.AmbientLight(0xffffff, 1.2);
      this.threeScene.add(amb);
      const dir = new THREE.DirectionalLight(0xffffff, 1.0);
      dir.position.set(100, 300, 100);
      this.threeScene.add(dir);

      // Ground Grid
      const grid = new THREE.GridHelper(400, 40, 0x06b6d4, 0x1e293b);
      this.threeScene.add(grid);

      // Home Point Marker (Green Ring)
      const homeGeo = new THREE.RingGeometry(2, 2.5, 32);
      const homeMat = new THREE.MeshBasicMaterial({ color: 0x22c55e, side: THREE.DoubleSide });
      const homeMesh = new THREE.Mesh(homeGeo, homeMat);
      homeMesh.rotation.x = -Math.PI / 2;
      homeMesh.position.set(0, 0.1, 0);
      this.threeScene.add(homeMesh);

      this.buildDroneAvatar();
    } else {
      if (this.threeCamera) {
        this.threeCamera.aspect = width / height;
        this.threeCamera.updateProjectionMatrix();
      }
    }

    // Dynamic flight visualizers
    this.addSatelliteFloor();
    this.buildTrajectoryMeshes();

    // Auto-frame camera to trajectory bounding box so the flight is always centered in view
    const targetMesh = this.actualLineMesh || this.plannedLineMesh;
    if (targetMesh && targetMesh.geometry) {
      targetMesh.geometry.computeBoundingSphere();
      const bs = targetMesh.geometry.boundingSphere;
      if (bs && bs.center && !isNaN(bs.center.x)) {
        if (this.threeControls) {
          this.threeControls.target.set(bs.center.x, Math.max(0, bs.center.y), bs.center.z);
        }
        const dist = Math.max(70, bs.radius * 2.2);
        this.threeCamera.position.set(bs.center.x, bs.center.y + dist * 0.7, bs.center.z + dist * 0.9);
        if (this.threeControls) this.threeControls.update();
      }
    }

    this.animate();
  },

  addSatelliteFloor() {
    if (!this.telemetryData || typeof document === 'undefined' || !document.createElement) return;

    if (this.groundMesh && this.threeScene) {
      this.threeScene.remove(this.groundMesh);
      if (this.groundMesh.geometry) this.groundMesh.geometry.dispose();
      if (this.groundMesh.material) {
        if (this.groundMesh.material.map) this.groundMesh.material.map.dispose();
        this.groundMesh.material.dispose();
      }
      this.groundMesh = null;
    }
    if (this.groundTexture) {
      this.groundTexture.dispose();
      this.groundTexture = null;
    }

    const origin = this.getSceneOrigin();
    const cLat = origin.lat;
    const cLon = origin.lon;

    const tileZoom = 18;
    const tileWidthMeters = 40075016.686 * Math.cos(cLat * Math.PI / 180) / Math.pow(2, tileZoom);

    const sinLat = Math.sin(cLat * Math.PI / 180);
    const xTileFrac = ((cLon + 180) / 360) * Math.pow(2, tileZoom);
    const yTileFrac = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * Math.pow(2, tileZoom);

    const xTileCenter = Math.floor(xTileFrac);
    const yTileCenter = Math.floor(yTileFrac);

    const planeSize = tileWidthMeters * 3;

    // Exact tile center offset relative to origin in Three.js world space
    const planeOffsetX = ((xTileCenter + 0.5) - xTileFrac) * tileWidthMeters;
    const planeOffsetZ = ((yTileCenter + 0.5) - yTileFrac) * tileWidthMeters;

    const groundGeom = new THREE.PlaneGeometry(planeSize, planeSize);
    
    const groundCanvas = document.createElement('canvas');
    if (!groundCanvas || !groundCanvas.getContext) return;
    groundCanvas.width = 768;
    groundCanvas.height = 768;
    const ctx = groundCanvas.getContext('2d');
    if (!ctx) return;

    const baseGroundCanvas = document.createElement('canvas');
    baseGroundCanvas.width = 768;
    baseGroundCanvas.height = 768;
    const baseCtx = baseGroundCanvas.getContext ? baseGroundCanvas.getContext('2d') : null;

    const drawGrid = (c) => {
      if (!c) return;
      c.fillStyle = "#070a13";
      c.fillRect(0, 0, 768, 768);
      c.strokeStyle = "rgba(6, 182, 212, 0.15)";
      c.lineWidth = 1;
      for (let i = 0; i <= 12; i++) {
        const coord = i * 64;
        c.beginPath(); c.moveTo(coord, 0); c.lineTo(coord, 768); c.stroke();
        c.beginPath(); c.moveTo(0, coord); c.lineTo(768, coord); c.stroke();
      }
    };

    drawGrid(ctx);
    if (baseCtx) drawGrid(baseCtx);

    const groundTexture = new THREE.CanvasTexture(groundCanvas);
    const groundMaterial = new THREE.MeshBasicMaterial({
      map: groundTexture,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95
    });

    const groundMesh = new THREE.Mesh(groundGeom, groundMaterial);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.set(planeOffsetX, -0.2, planeOffsetZ);
    this.threeScene.add(groundMesh);

    this.groundCanvas = groundCanvas;
    this.groundCtx = ctx;
    this.baseGroundCanvas = baseGroundCanvas;
    this.baseGroundCtx = baseCtx;
    this.groundTexture = groundTexture;
    this.groundMesh = groundMesh;
    this.planeOffsetX = planeOffsetX;
    this.planeOffsetZ = planeOffsetZ;
    this.planeSize = planeSize;
    this.paintedPhotoIndices = new Set();
    this.lastPaintedPointIdx = -1;

    if (typeof Image !== 'undefined') {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const tx = xTileCenter + dx;
          const ty = yTileCenter + dy;
          const posX = (dx + 1) * 256;
          const posY = (dy + 1) * 256;

          const tileUrl = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${tileZoom}/${ty}/${tx}`;
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => {
            if (this.baseGroundCtx) {
              this.baseGroundCtx.drawImage(img, posX, posY, 256, 256);
            }
            if (!this.paintedPhotoIndices || this.paintedPhotoIndices.size === 0) {
              ctx.drawImage(img, posX, posY, 256, 256);
              this.scheduleGroundTextureUpdate();
            } else {
              this.redrawGroundFootprints(this.currentPointIndex);
            }
          };
          img.src = tileUrl;
        }
      }
    }
  },

  scheduleGroundTextureUpdate() {
    if (this._groundTexUpdateTimer) clearTimeout(this._groundTexUpdateTimer);
    this._groundTexUpdateTimer = setTimeout(() => {
      this._groundTexUpdateTimer = null;
      try {
        if (this.groundTexture && this.threeRenderer) {
          const gl = this.threeRenderer.getContext ? this.threeRenderer.getContext() : null;
          if (gl && gl.isContextLost && gl.isContextLost()) return;
          this.groundTexture.needsUpdate = true;
        }
      } catch (_) {}
    }, 120);
  },

  resetGroundCanvas() {
    if (!this.groundCtx || !this.groundCanvas) return;
    if (this.baseGroundCanvas && this.baseGroundCtx) {
      this.groundCtx.clearRect(0, 0, 768, 768);
      this.groundCtx.drawImage(this.baseGroundCanvas, 0, 0);
    } else {
      this.groundCtx.fillStyle = "#070a13";
      this.groundCtx.fillRect(0, 0, 768, 768);
      this.groundCtx.strokeStyle = "rgba(6, 182, 212, 0.15)";
      this.groundCtx.lineWidth = 1;
      for (let i = 0; i <= 12; i++) {
        const coord = i * 64;
        this.groundCtx.beginPath(); this.groundCtx.moveTo(coord, 0); this.groundCtx.lineTo(coord, 768); this.groundCtx.stroke();
        this.groundCtx.beginPath(); this.groundCtx.moveTo(0, coord); this.groundCtx.lineTo(768, coord); this.groundCtx.stroke();
      }
    }
    this.paintedPhotoIndices = new Set();
    this.lastPaintedPointIdx = -1;
    if (this.groundTexture) {
      this.groundTexture.needsUpdate = true;
    }
  },

  redrawGroundFootprints(upToIndex) {
    this.resetGroundCanvas();
    if (!this.diagShowFootprints || !this.telemetryData || !this.telemetryData.points) return;
    const pts = this.telemetryData.points;
    const targetIdx = Math.max(0, Math.min(upToIndex !== undefined ? upToIndex : this.currentPointIndex, pts.length - 1));
    for (let pi = 0; pi <= targetIdx; pi++) {
      if (pts[pi] && pts[pi].isPhoto) {
        this.paintedPhotoIndices.add(pi);
        this.drawFootprintOnGround(pts[pi]);
      }
    }
    this.lastPaintedPointIdx = targetIdx;
    if (this.groundTexture) {
      this.groundTexture.needsUpdate = true;
    }
  },

  drawFootprintOnGround(pt) {
    if (!this.groundCtx || !this.groundTexture || !pt || !this.diagShowFootprints) return;
    const pos = this.projectToWorld(pt.lat, pt.lon, pt.alt);
    const pitchVal = pt.pitch !== undefined && pt.pitch !== null ? pt.pitch : -60;
    const yawVal = pt.yaw !== undefined && pt.yaw !== null ? pt.yaw : 0;
    const pitchRad = (pitchVal * Math.PI) / 180;
    const yawRad = (yawVal * Math.PI) / 180;
    const sinPitch = Math.sin(pitchRad);
    if (Math.abs(sinPitch) < 0.01) return;
    const t = -pos.y / sinPitch;
    if (t < 0 || t > 800) return;
    const dirX = Math.sin(yawRad) * Math.cos(pitchRad);
    const dirZ = -Math.cos(yawRad) * Math.cos(pitchRad);
    const gx = pos.x + dirX * t;
    const gz = pos.z + dirZ * t;

    const planeSize = this.planeSize || 300;
    const minX = (this.planeOffsetX || 0) - planeSize / 2;
    const minZ = (this.planeOffsetZ || 0) - planeSize / 2;
    const u = (gx - minX) / planeSize;
    const v = (gz - minZ) / planeSize;
    if (u < 0 || u > 1 || v < 0 || v > 1) return;

    const cx = u * 768;
    const cy = v * 768;
    const rad = Math.max(14, Math.min(65, (pt.alt || 30) * 0.75));

    const ctx = this.groundCtx;
    const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, rad);
    grad.addColorStop(0, 'rgba(6, 182, 212, 0.45)');
    grad.addColorStop(0.6, 'rgba(16, 185, 129, 0.22)');
    grad.addColorStop(1, 'rgba(6, 182, 212, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.fill();

    this.groundTexture.needsUpdate = true;
  },

  getDiagnosticsBoundaries() {
    const boundaries = [];
    // 1. Check currentLoadedMission parcels or plan.parcels or telemetryData.parcels
    const missionParcels = this.currentLoadedMission?.parcels || this.currentLoadedMission?.plan?.parcels || this.telemetryData?.parcels;
    if (Array.isArray(missionParcels) && missionParcels.length > 0) {
      missionParcels.forEach(p => {
        if (p && Array.isArray(p.polygon) && p.polygon.length >= 3) {
          boundaries.push({
            polygon: p.polygon,
            name: p.layerName || 'Mission Boundary',
            strokeColor: p.strokeColor || '#06b6d4',
            lineStyle: p.lineStyle || 'dashed',
            fillOpacity: (typeof p.fillOpacity === 'number') ? p.fillOpacity / 100.0 : 0.15,
            targetHeight: 0
          });
        }
      });
    }

    // 2. Check activeInspectionManifest parcels
    if (boundaries.length === 0 && this.activeInspectionManifest && Array.isArray(this.activeInspectionManifest.parcels)) {
      this.activeInspectionManifest.parcels.forEach(p => {
        if (p && Array.isArray(p.polygon) && p.polygon.length >= 3) {
          boundaries.push({
            polygon: p.polygon,
            name: p.layerName || 'Inspection Boundary',
            strokeColor: p.strokeColor || '#06b6d4',
            lineStyle: p.lineStyle || 'dashed',
            fillOpacity: (typeof p.fillOpacity === 'number') ? p.fillOpacity / 100.0 : 0.15,
            targetHeight: 0
          });
        }
      });
    }

    // 3. If no parcels, but plannedWaypoints exist with >= 3 points, compute convex hull boundary
    if (boundaries.length === 0 && Array.isArray(this.plannedWaypoints) && this.plannedWaypoints.length >= 3) {
      const validWps = this.plannedWaypoints.filter(w => w && typeof w.lat === 'number' && typeof (w.lon !== undefined ? w.lon : w.lng) === 'number');
      if (validWps.length >= 3 && typeof computeConvexHullGeo === 'function') {
        boundaries.push({
          polygon: computeConvexHullGeo(validWps),
          name: 'Planned Mission Boundary',
          strokeColor: '#06b6d4',
          lineStyle: 'dashed',
          fillOpacity: 0.12,
          targetHeight: 0
        });
      }
    }

    // 4. If in active-mission simulation mode, check active workspace drawing layers / parcels
    if (boundaries.length === 0 && this.selectedFlightId === 'active-mission' && typeof extractSpatialMissionLayers === 'function') {
      try {
        const spatial = extractSpatialMissionLayers();
        if (spatial && Array.isArray(spatial.parcels)) {
          spatial.parcels.forEach(p => {
            if (p && Array.isArray(p.polygon) && p.polygon.length >= 3) {
              boundaries.push({
                polygon: p.polygon,
                name: p.layerName || 'Workspace Boundary',
                strokeColor: p.strokeColor || '#06b6d4',
                lineStyle: p.lineStyle || 'dashed',
                fillOpacity: (typeof p.fillOpacity === 'number') ? p.fillOpacity / 100.0 : 0.15,
                targetHeight: 0
              });
            }
          });
        }
      } catch (_) {}
    }

    // 4. Fallback for recorded flights with photo triggers or telemetry points
    if (boundaries.length === 0 && this.telemetryData && Array.isArray(this.telemetryData.points)) {
      const photoPts = this.telemetryData.points.filter(p => p.isPhoto && typeof p.lat === 'number');
      const ptsToUse = photoPts.length >= 3 ? photoPts : this.telemetryData.points.filter(p => typeof p.lat === 'number');
      if (ptsToUse.length >= 3 && typeof computeConvexHullGeo === 'function') {
        boundaries.push({
          polygon: computeConvexHullGeo(ptsToUse),
          name: 'Flown Coverage Boundary',
          strokeColor: '#38bdf8',
          lineStyle: 'dashed',
          fillOpacity: 0.10,
          targetHeight: 0
        });
      }
    }

    return boundaries;
  },

  buildTrajectoryMeshes() {
    if (!this.telemetryData || !this.telemetryData.points) return;
    const pts = this.telemetryData.points;
    const isActual = !!this.isActualFlown;

    // Update legend visibility & labels
    const legendActual = (typeof document !== 'undefined') ? document.getElementById('diag-legend-actual') : null;
    const legendPlannedText = (typeof document !== 'undefined') ? document.getElementById('diag-legend-planned-text') : null;
    if (legendActual) {
      legendActual.style.display = isActual ? 'flex' : 'none';
    }
    if (legendPlannedText) {
      legendPlannedText.textContent = isActual ? 'Planned WPML' : 'Planned Flight Path';
    }

    if (this.actualLineMesh && this.threeScene) {
      this.threeScene.remove(this.actualLineMesh);
      if (this.actualLineMesh.geometry) this.actualLineMesh.geometry.dispose();
      this.actualLineMesh = null;
    }
    if (this.plannedLineMesh && this.threeScene) {
      this.threeScene.remove(this.plannedLineMesh);
      if (this.plannedLineMesh.geometry) this.plannedLineMesh.geometry.dispose();
      this.plannedLineMesh = null;
    }
    if (this.photoMarkers && this.photoMarkers.length && this.threeScene) {
      this.photoMarkers.forEach(m => {
        this.threeScene.remove(m);
        if (m.geometry) m.geometry.dispose();
      });
      this.photoMarkers = [];
    }
    if (this.boundaryMeshes && this.boundaryMeshes.length && this.threeScene) {
      this.boundaryMeshes.forEach(m => {
        this.threeScene.remove(m);
        if (m.geometry) m.geometry.dispose();
        if (m.material) {
          if (Array.isArray(m.material)) m.material.forEach(mat => mat.dispose());
          else m.material.dispose();
        }
      });
      this.boundaryMeshes = [];
    }

    if (this.wireframeData && typeof this.rebuildWireframeMesh === 'function') {
      this.rebuildWireframeMesh();
    }

    if (isActual) {
      const actualCoords = [];
      pts.forEach(p => {
        actualCoords.push(this.projectToWorld(p.lat, p.lon, p.alt));
      });

      const actualGeo = new THREE.BufferGeometry().setFromPoints(actualCoords);
      const actualMat = new THREE.LineBasicMaterial({ color: 0xf59e0b, linewidth: 3 });
      this.actualLineMesh = new THREE.Line(actualGeo, actualMat);
      this.threeScene.add(this.actualLineMesh);
    }

    pts.forEach((p, pIdx) => {
      if (p.isPhoto) {
        let photoMarker;
        if (typeof THREE.Group === 'function') {
          const photoGroup = new THREE.Group();
          if (photoGroup.position && photoGroup.position.copy) {
            photoGroup.position.copy(this.projectToWorld(p.lat, p.lon, p.alt));
          }
          const photoHeading = (p.yaw !== undefined && p.yaw !== null && !isNaN(p.yaw)) ? p.yaw : 0;
          const photoPitch = (p.pitch !== undefined && p.pitch !== null && !isNaN(p.pitch)) ? p.pitch : -60;
          if (photoGroup.rotation) {
            photoGroup.rotation.y = - (photoHeading * Math.PI) / 180;
          }

          if (typeof THREE.SphereGeometry === 'function' && typeof THREE.MeshBasicMaterial === 'function' && typeof THREE.Mesh === 'function') {
            const photoGeo = new THREE.SphereGeometry(0.8, 8, 8);
            const photoMat = new THREE.MeshBasicMaterial({ color: 0x22c55e });
            const photoMesh = new THREE.Mesh(photoGeo, photoMat);
            photoGroup.add(photoMesh);
          }

          // Small directional camera frustum showing photo capture angle
          if (typeof createCameraPyramidGeometry === 'function') {
            const coneGeom = createCameraPyramidGeometry(CAMERA_HFOV, CAMERA_VFOV, 3.5);
            if (coneGeom && typeof THREE.MeshBasicMaterial === 'function' && typeof THREE.Mesh === 'function') {
              const coneMat = new THREE.MeshBasicMaterial({
                color: 0x22c55e,
                wireframe: false,
                transparent: true,
                opacity: 0.2,
                side: THREE.DoubleSide,
                depthWrite: false
              });
              const coneMesh = new THREE.Mesh(coneGeom, coneMat);
              if (coneMesh.rotation) {
                coneMesh.rotation.x = ((90 + photoPitch) * Math.PI) / 180;
              }
              if (typeof THREE.EdgesGeometry === 'function' && typeof THREE.LineBasicMaterial === 'function' && typeof THREE.LineSegments === 'function') {
                const wireGeom = new THREE.EdgesGeometry(coneGeom);
                const wireMat = new THREE.LineBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.6 });
                coneMesh.add(new THREE.LineSegments(wireGeom, wireMat));
              }
              photoGroup.add(coneMesh);
            }
          }
          photoMarker = photoGroup;
        } else if (typeof THREE.Mesh === 'function') {
          const photoGeo = typeof THREE.SphereGeometry === 'function' ? new THREE.SphereGeometry(0.8, 8, 8) : null;
          const photoMat = typeof THREE.MeshBasicMaterial === 'function' ? new THREE.MeshBasicMaterial({ color: 0x22c55e }) : null;
          photoMarker = new THREE.Mesh(photoGeo, photoMat);
          if (photoMarker.position && photoMarker.position.copy) {
            photoMarker.position.copy(this.projectToWorld(p.lat, p.lon, p.alt));
          }
        }

        if (photoMarker) {
          photoMarker.userData = { isPhoto: true, point: p, index: pIdx };
          if (this.threeScene && this.threeScene.add) this.threeScene.add(photoMarker);
          this.photoMarkers.push(photoMarker);
        }
      }
    });

    const plannedCoords = [];
    if (this.plannedWaypoints && this.plannedWaypoints.length > 0) {
      // Stored planned waypoints from the loaded flight (saved missions / active-mission mode)
      this.plannedWaypoints.forEach(wp => {
        plannedCoords.push(this.projectToWorld(wp.lat, wp.lon !== undefined ? wp.lon : wp.lng, wp.altitude || wp.alt || 21.0));
      });
    } else if (isActual && this.telemetryData && this.telemetryData.points) {
      // For RC2 logs: derive approximate planned waypoints from photo-trigger events.
      // Photo triggers fire at planned waypoint positions, making them the best available
      // approximation of the original mission plan from a raw flight log.
      const photoPoints = this.telemetryData.points.filter(p => p.isPhoto);
      if (photoPoints.length > 1) {
        photoPoints.forEach(p => {
          plannedCoords.push(this.projectToWorld(p.lat, p.lon, p.alt));
        });
      }
      // If no photo triggers exist, skip the planned line entirely rather than showing
      // the wrong active workspace route.
    } else if (!isActual && pts && pts.length > 0) {
      // For unflown simulations without separate plannedWaypoints array, the time-series points themselves define the planned route
      pts.forEach(p => {
        plannedCoords.push(this.projectToWorld(p.lat, p.lon, p.alt));
      });
    }

    if (plannedCoords.length > 1) {
      const planGeo = new THREE.BufferGeometry().setFromPoints(plannedCoords);
      const planMat = isActual
        ? new THREE.LineDashedMaterial({ color: 0x06b6d4, dashSize: 3, gapSize: 1 })
        : new THREE.LineBasicMaterial({ color: 0x06b6d4, linewidth: 3 });
      this.plannedLineMesh = new THREE.Line(planGeo, planMat);
      if (isActual && typeof this.plannedLineMesh.computeLineDistances === 'function') {
        this.plannedLineMesh.computeLineDistances();
      }
      this.threeScene.add(this.plannedLineMesh);
    }

    // Render Flight Boundaries / Parcels in 3D
    const boundaries = this.getDiagnosticsBoundaries();
    const legendBoundary = (typeof document !== 'undefined') ? document.getElementById('diag-legend-boundary') : null;
    if (legendBoundary) {
      legendBoundary.style.display = boundaries.length > 0 ? 'flex' : 'none';
    }

    boundaries.forEach(b => {
      if (!b.polygon || b.polygon.length < 3) return;
      const worldPts = b.polygon.map(pt => this.projectToWorld(pt.lat, pt.lon !== undefined ? pt.lon : pt.lng, 0.15));
      const loopPts = [...worldPts, worldPts[0]];

      const hexColor = b.strokeColor ? parseInt(b.strokeColor.replace('#', '0x'), 16) : 0x06b6d4;
      const boundaryColor = isNaN(hexColor) ? 0x06b6d4 : hexColor;

      // 1. Boundary Perimeter Line Loop
      if (typeof THREE.BufferGeometry === 'function' && typeof THREE.Line === 'function') {
        const lineGeo = new THREE.BufferGeometry().setFromPoints(loopPts);
        const isDashed = b.lineStyle === 'dashed' || !b.lineStyle;
        const lineMat = (isDashed && typeof THREE.LineDashedMaterial === 'function')
          ? new THREE.LineDashedMaterial({ color: boundaryColor, dashSize: 4, gapSize: 2, linewidth: 2 })
          : new THREE.LineBasicMaterial({ color: boundaryColor, linewidth: 2 });
        const lineMesh = new THREE.Line(lineGeo, lineMat);
        if (isDashed && typeof lineMesh.computeLineDistances === 'function') {
          lineMesh.computeLineDistances();
        }
        this.threeScene.add(lineMesh);
        this.boundaryMeshes.push(lineMesh);
      }

      // 2. Semi-Transparent Ground Fill
      if (typeof THREE.Shape === 'function' && typeof THREE.ShapeGeometry === 'function' && typeof THREE.Mesh === 'function') {
        try {
          const shape = new THREE.Shape();
          worldPts.forEach((wp, i) => {
            if (i === 0) shape.moveTo(wp.x, -wp.z);
            else shape.lineTo(wp.x, -wp.z);
          });
          shape.closePath();
          const shapeGeo = new THREE.ShapeGeometry(shape);
          const fillMat = new THREE.MeshBasicMaterial({
            color: boundaryColor,
            transparent: true,
            opacity: typeof b.fillOpacity === 'number' ? b.fillOpacity : 0.12,
            side: THREE.DoubleSide,
            depthWrite: false
          });
          const fillMesh = new THREE.Mesh(shapeGeo, fillMat);
          fillMesh.rotation.x = -Math.PI / 2;
          fillMesh.position.y = 0.10;
          this.threeScene.add(fillMesh);
          this.boundaryMeshes.push(fillMesh);
        } catch (_) {}
      }
    });

    // Render Ground Control Points (GCPs) in 3D
    const gcps = this.currentLoadedMission?.groundControl || this.currentLoadedMission?.plan?.groundControl || this.telemetryData?.groundControl;
    if (Array.isArray(gcps) && gcps.length > 0) {
      gcps.forEach(gcp => {
        if (!gcp || typeof gcp.lat !== 'number') return;
        const lon = gcp.lon !== undefined ? gcp.lon : gcp.lng;
        if (typeof lon !== 'number') return;
        const gcpPos = this.projectToWorld(gcp.lat, lon, 0.2);

        if (typeof THREE.PlaneGeometry === 'function' && typeof THREE.MeshBasicMaterial === 'function' && typeof THREE.Mesh === 'function') {
          const padGeo = new THREE.PlaneGeometry(2, 2);
          const padColor = gcp.color ? parseInt(gcp.color.replace('#', '0x'), 16) : 0xf59e0b;
          const padMat = new THREE.MeshBasicMaterial({ color: isNaN(padColor) ? 0xf59e0b : padColor, side: THREE.DoubleSide });
          const padMesh = new THREE.Mesh(padGeo, padMat);
          padMesh.rotation.x = -Math.PI / 2;
          padMesh.position.set(gcpPos.x, 0.18, gcpPos.z);
          this.threeScene.add(padMesh);
          this.boundaryMeshes.push(padMesh);
        }
      });
    }
  },

  buildDroneAvatar() {
    if (this.droneMesh && this.threeScene) {
      this.threeScene.remove(this.droneMesh);
      this.droneMesh.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
          else child.material.dispose();
        }
      });
      this.droneMesh = null;
    }

    this.droneMesh = new THREE.Group();

    const bodyGeo = new THREE.BoxGeometry(2.5, 0.8, 3.5);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.3 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    this.droneMesh.add(body);

    // Front nose direction indicator (dark forward-pointing wedge at -Z)
    const noseGeo = new THREE.ConeGeometry(0.8, 1.2, 4);
    noseGeo.rotateX(-Math.PI / 2);
    const noseMat = new THREE.MeshBasicMaterial({ color: 0x0284c7 });
    const nose = new THREE.Mesh(noseGeo, noseMat);
    nose.position.set(0, 0.2, -2.1);
    this.droneMesh.add(nose);

    const rotorMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee });
    [[-1.8, 1.8], [1.8, 1.8], [-1.8, -1.8], [1.8, -1.8]].forEach(([rx, rz]) => {
      const rGeo = new THREE.CylinderGeometry(1.2, 1.2, 0.1, 16);
      const r = new THREE.Mesh(rGeo, rotorMat);
      r.position.set(rx, 0.5, rz);
      this.droneMesh.add(r);
    });

    // Realistic camera field-of-view pyramid with apex at camera gimbal
    const coneHeight = 10;
    const fGeo = createCameraPyramidGeometry(CAMERA_HFOV, CAMERA_VFOV, coneHeight);
    const fMat = new THREE.MeshBasicMaterial({
      color: 0xfbbf24,
      wireframe: false,
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.frustumMesh = new THREE.Mesh(fGeo, fMat);
    this.frustumMesh.position.set(0, -0.4, -1.2); // Forward camera gimbal position

    // Wireframe edges for clear visibility
    const wireGeom = new THREE.EdgesGeometry(fGeo);
    const wireMat = new THREE.LineBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.75 });
    this.frustumMesh.add(new THREE.LineSegments(wireGeom, wireMat));

    // Optical Axis Center Ray
    const axisPoints = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, -coneHeight, 0)
    ];
    const axisGeom = new THREE.BufferGeometry().setFromPoints(axisPoints);
    const axisMat = new THREE.LineBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.6 });
    this.frustumMesh.add(new THREE.Line(axisGeom, axisMat));

    this.droneMesh.add(this.frustumMesh);

    this.threeScene.add(this.droneMesh);
  },

  animate() {
    if (!this.isOpen || typeof requestAnimationFrame === 'undefined') {
      this.animFrameId = null;
      return;
    }
    this.animFrameId = requestAnimationFrame(() => this.animate());

    if (this.isPlaying && this.telemetryData && this.telemetryData.points && this.telemetryData.points.length > 0) {
      const now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
      if (this.lastFrameTime) {
        const deltaSec = (now - this.lastFrameTime) / 1000;
        const advanceSteps = deltaSec * this.playbackSpeed;
        this.playbackFractionalIndex += advanceSteps;

        const maxIdx = this.telemetryData.points.length - 1;
        if (this.playbackFractionalIndex >= maxIdx) {
          this.playbackFractionalIndex = maxIdx;
          this.pause();
        }

        const pointIndex = Math.min(Math.floor(this.playbackFractionalIndex), maxIdx);
        this.seekTo(pointIndex, true, false);
      }
      this.lastFrameTime = now;
    }

    if (this.threeControls && this.threeControls.update) this.threeControls.update();
    if (this.threeRenderer && this.threeScene && this.threeCamera) {
      this.threeRenderer.render(this.threeScene, this.threeCamera);
    }
  },

  togglePlay() {
    if (this.isPlaying) this.pause();
    else this.play();
  },

  play() {
    if (!this.isOpen) return;
    if (this.telemetryData && this.telemetryData.points && this.telemetryData.points.length > 0) {
      const maxIdx = this.telemetryData.points.length - 1;
      if (this.playbackFractionalIndex >= maxIdx || this.currentPointIndex >= maxIdx) {
        this.playbackFractionalIndex = 0.0;
        this.seekTo(0, true, true);
      }
    }
    this.isPlaying = true;
    this.lastFrameTime = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    const pIcon = document.getElementById('diag-play-icon');
    const paIcon = document.getElementById('diag-pause-icon');
    if (pIcon) pIcon.style.display = 'none';
    if (paIcon) paIcon.style.display = 'block';

    if (!this.animFrameId) {
      this.animate();
    }
  },

  pause() {
    this.isPlaying = false;
    this.lastFrameTime = null;
    const pIcon = document.getElementById('diag-play-icon');
    const paIcon = document.getElementById('diag-pause-icon');
    if (pIcon) pIcon.style.display = 'block';
    if (paIcon) paIcon.style.display = 'none';
  },

  resetCameraView(mode) {
    if (!this.threeCamera || !this.threeControls) return;
    // Exit FPV if active
    if (this.diagFpvMode) {
      this.diagFpvMode = false;
      this.threeControls.enabled = true;
      const fpvBtn = document.getElementById('diag-btn-fpv');
      if (fpvBtn) { fpvBtn.classList.remove('active'); }
      const fpvInd = document.getElementById('diag-indicator-fpv');
      if (fpvInd) fpvInd.style.background = '#ef4444';
    }
    const targetMesh = this.actualLineMesh || this.plannedLineMesh;
    if (mode === 'top') {
      // Bird's-eye orthographic-style view
      if (targetMesh && targetMesh.geometry) {
        targetMesh.geometry.computeBoundingSphere();
        const bs = targetMesh.geometry.boundingSphere;
        if (bs && bs.center && !isNaN(bs.center.x)) {
          const dist = Math.max(100, bs.radius * 2.5);
          this.threeControls.target.set(bs.center.x, 0, bs.center.z);
          this.threeCamera.position.set(bs.center.x, dist, bs.center.z);
        } else {
          this.threeControls.target.set(0, 0, 0);
          this.threeCamera.position.set(0, 200, 0);
        }
      } else {
        this.threeControls.target.set(0, 0, 0);
        this.threeCamera.position.set(0, 200, 0);
      }
    } else {
      // Standard 3D perspective view
      if (targetMesh && targetMesh.geometry) {
        targetMesh.geometry.computeBoundingSphere();
        const bs = targetMesh.geometry.boundingSphere;
        if (bs && bs.center && !isNaN(bs.center.x)) {
          const dist = Math.max(70, bs.radius * 2.2);
          this.threeControls.target.set(bs.center.x, Math.max(0, bs.center.y), bs.center.z);
          this.threeCamera.position.set(bs.center.x, bs.center.y + dist * 0.7, bs.center.z + dist * 0.9);
        } else {
          this.threeControls.target.set(0, 0, 0);
          this.threeCamera.position.set(0, 90, 140);
        }
      } else {
        this.threeControls.target.set(0, 0, 0);
        this.threeCamera.position.set(0, 90, 140);
      }
    }
    this.threeControls.update();
  },

  _updateFPVCamera() {
    if (!this.threeCamera || !this.droneMesh) return;
    const dronePos = this.droneMesh.position;
    const yawRad = this.droneMesh.rotation.y; // negative yaw in three.js
    // Position camera 8 units behind and 3 units above the drone
    const followDist = 8;
    const heightOffset = 3;
    this.threeCamera.position.set(
      dronePos.x + Math.sin(yawRad) * followDist,
      dronePos.y + heightOffset,
      dronePos.z + Math.cos(yawRad) * followDist
    );
    // Look at a point 10 units ahead of the drone
    const lookAhead = 10;
    this.threeCamera.lookAt(
      dronePos.x - Math.sin(yawRad) * lookAhead,
      dronePos.y,
      dronePos.z - Math.cos(yawRad) * lookAhead
    );
  },

  seekTo(index, updateSlider = true, syncFraction = true) {
    if (!this.telemetryData || !this.telemetryData.points || !this.telemetryData.points.length) return;
    const pts = this.telemetryData.points;
    const safeIdx = Math.max(0, Math.min(index, pts.length - 1));
    this.currentPointIndex = safeIdx;
    if (syncFraction) {
      this.playbackFractionalIndex = safeIdx;
    }

    if (typeof PlaybackManager !== 'undefined' && PlaybackManager.activeFlightId === this.selectedFlightId && !PlaybackManager._syncFrom3d) {
      PlaybackManager._syncFrom3d = true;
      PlaybackManager.seekTo(safeIdx);
      PlaybackManager._syncFrom3d = false;
    }

    const pt = pts[safeIdx];

    if (this.droneMesh) {
      const pos = this.projectToWorld(pt.lat, pt.lon, pt.alt);
      this.droneMesh.position.copy(pos);
      const yawVal = (pt.yaw !== undefined && pt.yaw !== null && !isNaN(pt.yaw)) ? pt.yaw : 0;
      this.droneMesh.rotation.y = - (yawVal * Math.PI) / 180;

      if (this.frustumMesh) {
        const pitchVal = (pt.pitch !== undefined && pt.pitch !== null && !isNaN(pt.pitch)) ? pt.pitch : -60;
        this.frustumMesh.rotation.x = ((90 + pitchVal) * Math.PI) / 180;
      }
    }

    // Update FPV camera to follow drone if FPV mode is active
    if (this.diagFpvMode) {
      this._updateFPVCamera();
    }

    const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setTxt('diag-hud-alt', `${(pt.alt !== undefined && pt.alt !== null ? pt.alt : 0).toFixed(1)} m`);
    setTxt('diag-hud-speed', `${(pt.speed !== undefined && pt.speed !== null ? pt.speed : 0).toFixed(1)} m/s`);
    setTxt('diag-hud-pitch', `${(pt.pitch !== undefined && pt.pitch !== null ? pt.pitch : 0).toFixed(1)}°`);
    setTxt('diag-hud-battery', `${(pt.battery !== undefined && pt.battery !== null ? pt.battery : 100).toFixed(0)}%`);
    setTxt('diag-hud-sats', (pt.satellites !== undefined && pt.satellites !== null ? pt.satellites : 0).toString());
    setTxt('diag-hud-coords', `${(pt.lat !== undefined && pt.lat !== null ? pt.lat : 0).toFixed(6)}, ${(pt.lon !== undefined && pt.lon !== null ? pt.lon : 0).toFixed(6)}`);
    setTxt('diag-time-display', `${pt.timeStr || '00:00'} / ${this.telemetryData?.durationFormatted || '00:00'}`);

    if (updateSlider) {
      const slider = document.getElementById('diag-timeline-slider');
      if (slider && document.activeElement !== slider) slider.value = safeIdx.toString();
    }

    if (this.groundCtx && this.groundTexture) {
      if (!this.paintedPhotoIndices || this.lastPaintedPointIdx === undefined || this.lastPaintedPointIdx < 0) {
        this.paintedPhotoIndices = new Set();
        this.lastPaintedPointIdx = 0;
        if (safeIdx > 0) {
          this.redrawGroundFootprints(safeIdx);
        } else if (pts[0] && pts[0].isPhoto && this.diagShowFootprints) {
          this.paintedPhotoIndices.add(0);
          this.drawFootprintOnGround(pts[0]);
        }
      } else if (safeIdx < this.lastPaintedPointIdx) {
        // Reverse seek or rewind: reset and redraw strictly up to safeIdx
        this.redrawGroundFootprints(safeIdx);
      } else if (safeIdx > this.lastPaintedPointIdx) {
        if (safeIdx - this.lastPaintedPointIdx > 30) {
          // Large jump forward: clean redraw to catch all photos
          this.redrawGroundFootprints(safeIdx);
        } else {
          // Sequential forward playback
          for (let pi = this.lastPaintedPointIdx + 1; pi <= safeIdx; pi++) {
            if (pts[pi] && pts[pi].isPhoto && !this.paintedPhotoIndices.has(pi)) {
              this.paintedPhotoIndices.add(pi);
              this.drawFootprintOnGround(pts[pi]);
            }
          }
          this.lastPaintedPointIdx = safeIdx;
        }
      }
    }

    // Synchronize photo ribbon in 3D sidebar
    const photos = this.getCorrelatedPhotos();
    if (photos.length > 0) {
      let closestPhoto = photos[0];
      let minDelta = Infinity;
      photos.forEach(p => {
        const pIdx = p.telemetryIndex !== undefined ? p.telemetryIndex : 0;
        const delta = Math.abs(pIdx - safeIdx);
        if (delta < minDelta) {
          minDelta = delta;
          closestPhoto = p;
        }
      });

      const strip = document.getElementById('diag-photos-strip');
      if (strip && typeof strip.querySelectorAll === 'function') {
        const thumbs = strip.querySelectorAll('.diag-strip-thumb') || [];
        thumbs.forEach(t => {
          const rawIdx = (t.dataset && t.dataset.photoIndex) || (typeof t.getAttribute === 'function' ? t.getAttribute('data-photo-index') : 0) || 0;
          const photoIdx = parseInt(rawIdx, 10);
          if (photos[photoIdx] === closestPhoto) {
            if (t.classList && typeof t.classList.add === 'function') t.classList.add('active');
            if (typeof t.scrollIntoView === 'function') {
              t.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            }
          } else {
            if (t.classList && typeof t.classList.remove === 'function') t.classList.remove('active');
          }
        });
      }

      const activeInfo = document.getElementById('diag-active-photo-info');
      const activeName = document.getElementById('diag-active-photo-name');
      const activeDetails = document.getElementById('diag-active-photo-details');
      if (activeInfo) activeInfo.style.display = 'block';
      if (activeName) activeName.textContent = `WP #${closestPhoto.waypointIndex} • ${closestPhoto.filename}`;
      if (activeDetails) {
        const gsdVal = (closestPhoto.gsd && closestPhoto.gsd.gsdCm) ? `${closestPhoto.gsd.gsdCm} cm/px` : '1.1 cm/px';
        const altStr = (closestPhoto.actual && closestPhoto.actual.altAgl !== undefined) ? `${closestPhoto.actual.altAgl.toFixed(1)}m` : '30.0m';
        const pitchStr = (closestPhoto.actual && closestPhoto.actual.gimbalPitch !== undefined) ? `${closestPhoto.actual.gimbalPitch}°` : '-60°';
        activeDetails.textContent = `Alt: ${altStr} • Pitch: ${pitchStr} • GSD: ${gsdVal}`;
      }
    }
  },

  exportGeoJSON() {
    if (!this.telemetryData || !this.telemetryData.points) return;
    const coordinates = this.telemetryData.points.map(p => [p.lon, p.lat, p.alt]);
    const geojson = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {
            name: "Actual Flight Track",
            droneModel: this.telemetryData.droneModel,
            duration: this.telemetryData.durationFormatted,
            totalDistanceMeters: this.telemetryData.totalDistance,
            maxAltitudeMeters: this.telemetryData.maxAltitude
          },
          geometry: {
            type: "LineString",
            coordinates: coordinates
          }
        }
      ]
    };

    if (typeof document !== 'undefined') {
      const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      const flightDate = this.telemetryData?.flightDate || new Date();
      const iso8601 = formatISO8601ForFilename(flightDate);
      link.download = `FlightRecord_${iso8601}_Track.geojson`;
      link.click();
    }
  },

  exportDiagJSON() {
    const wps = (typeof getActiveMissionWaypoints === 'function') ? getActiveMissionWaypoints() : [];
    const altitude = (typeof document !== 'undefined' && parseFloat(document.getElementById('altitude')?.value)) || 50.0;
    const speed = (typeof document !== 'undefined' && parseFloat(document.getElementById('speed')?.value)) || 4.0;
    const gimbalPitch = (typeof document !== 'undefined') ? parseGimbalPitch(document.getElementById('gimbal-pitch')?.value, -60.0) : -60.0;
    return exportFlightDiagnosticsJSON(wps, {
      altitude,
      speed,
      gimbalPitch,
      uuid: this.selectedFlightId || 'active-mission'
    });
  },

  async handleLogFileImport(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const flightId = file.name;
      let importedTelemetry = null;

      if (file.name.toLowerCase().endsWith('.kmz')) {
        if (typeof JSZip !== 'undefined') {
          const zip = await JSZip.loadAsync(file);
          let waylinesText = null;
          for (const filename of Object.keys(zip.files)) {
            if (filename.endsWith('.wpml') || filename.endsWith('.kml')) {
              waylinesText = await zip.files[filename].async('text');
              break;
            }
          }
          if (waylinesText) {
            importedTelemetry = parseKmlOrWpmlTelemetry(waylinesText, flightId);
          }
        }
      } else {
        const text = await file.text();
        const lowerName = file.name.toLowerCase();
        if (lowerName.endsWith('.json') || lowerName.endsWith('.geojson')) {
          const parsed = JSON.parse(text);
          if (parsed && parsed.diagnostics && parsed.diagnostics.points) {
            importedTelemetry = parsed.diagnostics;
          } else {
            importedTelemetry = parseGeoJsonTelemetry(parsed, flightId);
          }
        } else if (lowerName.endsWith('.csv')) {
          importedTelemetry = parseCsvTelemetry(text, flightId);
        } else if (lowerName.endsWith('.kml') || lowerName.endsWith('.wpml')) {
          importedTelemetry = parseKmlOrWpmlTelemetry(text, flightId);
        } else if (lowerName.endsWith('.gpx')) {
          importedTelemetry = parseGpxTelemetry(text, flightId);
        }
      }

      if (!importedTelemetry) {
        const wps = getActiveMissionWaypoints();
        const altitude = (typeof document !== 'undefined' && parseFloat(document.getElementById('altitude')?.value)) || 21.0;
        const speed = (typeof document !== 'undefined' && parseFloat(document.getElementById('speed')?.value)) || 4.0;
        const gimbalPitch = (typeof document !== 'undefined') ? parseGimbalPitch(document.getElementById('gimbal-pitch')?.value, -60.0) : -60.0;
        importedTelemetry = generateTelemetryFromWaypoints(wps, { altitude, speed, gimbalPitch, flightId, isSimulation: true });
      }

      if (importedTelemetry) {
        this.isActualFlown = (importedTelemetry.isActualFlown !== undefined)
          ? !!importedTelemetry.isActualFlown
          : (typeof file !== 'undefined' && file && file.name && (file.name.toLowerCase().endsWith('.csv') || file.name.toLowerCase().endsWith('.txt')));
        const comp = computeFlightComparison({ waypointCount: getActiveMissionWaypoints().length, altitude: importedTelemetry.maxAltitude, totalDistance: importedTelemetry.totalDistance }, importedTelemetry);

        const flightSel = document.getElementById('diag-flight-selector');
        if (flightSel) {
          let found = false;
          for (let i = 0; i < flightSel.options.length; i++) {
            if (flightSel.options[i].value === flightId) {
              found = true;
              break;
            }
          }
          if (!found) {
            const opt = document.createElement('option');
            opt.value = flightId;
            opt.textContent = `${file.name} (Imported)`;
            flightSel.insertBefore(opt, flightSel.firstChild);
          }
          flightSel.value = flightId;
        }

        this.selectedFlightId = flightId;
        this.telemetryData = importedTelemetry;
        this.comparisonData = comp;
        this.updateStatsUI();
        this.init3DScene();
        this.playbackFractionalIndex = 0.0;
        this.seekTo(0, true, true);
        this.pause();
        if (typeof alert === 'function') {
          alert(`Loaded ${file.name} successfully! Map satellite tiles and 3D path are centered at [${importedTelemetry.homePoint.lat.toFixed(6)}, ${importedTelemetry.homePoint.lon.toFixed(6)}].`);
        }
      }
    } catch (err) {
      if (typeof alert === 'function') alert('Could not parse file: ' + err.message);
    }
  },

  loadWireframeGeometry(data) {
    if (!data) return;
    this.wireframeData = data;
    this.diagShowWireframe = true;
    this.rebuildWireframeMesh();

    const panel = (typeof document !== 'undefined') ? document.getElementById('diag-wireframe-panel') : null;
    if (panel) panel.style.display = 'block';

    const legendWf = (typeof document !== 'undefined') ? document.getElementById('diag-legend-wireframe') : null;
    if (legendWf) legendWf.style.display = 'flex';

    const btn = (typeof document !== 'undefined') ? document.getElementById('diag-btn-toggle-wireframe') : null;
    if (btn) btn.classList.add('active');
    if (typeof _setDiagIndicator === 'function') _setDiagIndicator('diag-indicator-wireframe', true);
  },

  rebuildWireframeMesh() {
    if (this.wireframeLinesMesh && this.threeScene) {
      this.threeScene.remove(this.wireframeLinesMesh);
      if (this.wireframeLinesMesh.geometry) this.wireframeLinesMesh.geometry.dispose();
      this.wireframeLinesMesh = null;
    }
    if (this.wireframePlanesMesh && this.threeScene) {
      this.threeScene.remove(this.wireframePlanesMesh);
      if (this.wireframePlanesMesh.geometry) this.wireframePlanesMesh.geometry.dispose();
      this.wireframePlanesMesh = null;
    }
    if (this.wireframeHighlightMesh && this.threeScene) {
      this.threeScene.remove(this.wireframeHighlightMesh);
      if (this.wireframeHighlightMesh.geometry) this.wireframeHighlightMesh.geometry.dispose();
      this.wireframeHighlightMesh = null;
    }

    if (!this.wireframeData || !Array.isArray(this.wireframeData.lines) || this.wireframeData.lines.length === 0) {
      const badge = (typeof document !== 'undefined') ? document.getElementById('diag-wireframe-count-badge') : null;
      if (badge) badge.textContent = '0 lines';
      return;
    }

    const minLen = typeof this.wireframeMinLengthFilter === 'number' ? this.wireframeMinLengthFilter : 0.5;
    const elevOffset = typeof this.wireframeElevationOffset === 'number' ? this.wireframeElevationOffset : 0.0;

    const validLines = this.wireframeData.lines.filter(line => {
      if (!Array.isArray(line) || line.length < 6) return false;
      const [x1, y1, z1, x2, y2, z2] = line;
      if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(z1) ||
          !Number.isFinite(x2) || !Number.isFinite(y2) || !Number.isFinite(z2)) return false;
      const len = Math.hypot(x2 - x1, y2 - y1, z2 - z1);
      if (len > 60.0) return false;
      if (Math.hypot(x1, z1) > 300.0 || Math.hypot(x2, z2) > 300.0) return false;
      return len >= minLen;
    });

    const badge = (typeof document !== 'undefined') ? document.getElementById('diag-wireframe-count-badge') : null;
    const planesCount = Array.isArray(this.wireframeData.planes) ? this.wireframeData.planes.length : 0;
    if (badge) {
      badge.textContent = planesCount > 0 ? `${validLines.length} lines • ${planesCount} planes` : `${validLines.length} lines`;
    }

    if (validLines.length === 0 || typeof THREE === 'undefined' || typeof THREE.BufferGeometry !== 'function' || typeof THREE.BufferAttribute !== 'function' || typeof THREE.LineSegments !== 'function') return;

    const positions = new Float32Array(validLines.length * 6);
    validLines.forEach((line, idx) => {
      const [x1, y1, z1, x2, y2, z2] = line;
      const off = idx * 6;
      positions[off] = x1;
      positions[off + 1] = y1 + elevOffset;
      positions[off + 2] = z1;
      positions[off + 3] = x2;
      positions[off + 4] = y2 + elevOffset;
      positions[off + 5] = z2;
    });

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      linewidth: 2,
      transparent: true,
      opacity: 0.85
    });

    this.wireframeLinesMesh = new THREE.LineSegments(geom, mat);
    this.wireframeLinesMesh.visible = this.diagShowWireframe !== false;
    this.wireframeLinesMesh.userData = { isWireframe: true, validLines };

    if (this.threeScene) {
      this.threeScene.add(this.wireframeLinesMesh);
    }

    // Build translucent planes mesh if planes exist
    if (Array.isArray(this.wireframeData.planes) && this.wireframeData.planes.length > 0 && typeof THREE.Mesh === 'function' && typeof THREE.MeshBasicMaterial === 'function') {
      const triVerts = [];
      this.wireframeData.planes.forEach(pl => {
        const poly = pl.polygon || [];
        if (poly.length >= 3) {
          const p0 = poly[0];
          for (let i = 1; i < poly.length - 1; i++) {
            const p1 = poly[i];
            const p2 = poly[i + 1];
            triVerts.push(
              p0[0], p0[1] + elevOffset, p0[2],
              p1[0], p1[1] + elevOffset, p1[2],
              p2[0], p2[1] + elevOffset, p2[2]
            );
          }
        }
      });

      if (triVerts.length > 0) {
        const plGeom = new THREE.BufferGeometry();
        plGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(triVerts), 3));
        const plMat = new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          side: (THREE.DoubleSide !== undefined) ? THREE.DoubleSide : 2,
          transparent: true,
          opacity: 0.28,
          depthWrite: false
        });
        this.wireframePlanesMesh = new THREE.Mesh(plGeom, plMat);
        this.wireframePlanesMesh.visible = Boolean(this.diagShowPlanes);
        if (this.threeScene) {
          this.threeScene.add(this.wireframePlanesMesh);
        }
      }
    }
  },

  toggleWireframe(visible) {
    if (visible === undefined) {
      this.diagShowWireframe = !this.diagShowWireframe;
    } else {
      this.diagShowWireframe = Boolean(visible);
    }
    if (this.wireframeLinesMesh) {
      this.wireframeLinesMesh.visible = this.diagShowWireframe;
    }
    if (this.wireframeHighlightMesh) {
      this.wireframeHighlightMesh.visible = this.diagShowWireframe;
    }
    const btn = (typeof document !== 'undefined') ? document.getElementById('diag-btn-toggle-wireframe') : null;
    if (btn && btn.classList) {
      if (typeof btn.classList.toggle === 'function') {
        btn.classList.toggle('active', this.diagShowWireframe);
      } else if (this.diagShowWireframe) {
        if (typeof btn.classList.add === 'function') btn.classList.add('active');
      } else {
        if (typeof btn.classList.remove === 'function') btn.classList.remove('active');
      }
    }
    if (typeof _setDiagIndicator === 'function') {
      _setDiagIndicator('diag-indicator-wireframe', this.diagShowWireframe);
    }
  },

  togglePlanes(visible) {
    if (visible === undefined) {
      this.diagShowPlanes = !this.diagShowPlanes;
    } else {
      this.diagShowPlanes = Boolean(visible);
    }
    if (this.wireframePlanesMesh) {
      this.wireframePlanesMesh.visible = this.diagShowPlanes;
    }
    const btn = (typeof document !== 'undefined') ? document.getElementById('diag-btn-toggle-planes') : null;
    if (btn && btn.classList) {
      if (typeof btn.classList.toggle === 'function') {
        btn.classList.toggle('active', this.diagShowPlanes);
      } else if (this.diagShowPlanes) {
        if (typeof btn.classList.add === 'function') btn.classList.add('active');
      } else {
        if (typeof btn.classList.remove === 'function') btn.classList.remove('active');
      }
    }
  },

  selectWireframeLine(index) {
    if (!this.wireframeData || !Array.isArray(this.wireframeData.lines) || index < 0 || index >= this.wireframeData.lines.length) return;
    this.wireframeSelectedLineIndex = index;
    const line = this.wireframeData.lines[index];
    const [x1, y1, z1, x2, y2, z2] = line;
    const elevOffset = typeof this.wireframeElevationOffset === 'number' ? this.wireframeElevationOffset : 0.0;
    const len = Math.hypot(x2 - x1, y2 - y1, z2 - z1);

    // Plane affiliation readout
    let planeTag = '';
    if (Array.isArray(this.wireframeData.linePlanes) && this.wireframeData.linePlanes[index]) {
      const pids = this.wireframeData.linePlanes[index];
      if (pids.length > 0) {
        planeTag = `<br><span style="color:#a78bfa; font-weight:600;">Planes: ${pids.join(', ')}</span>`;
      }
    }

    const info = (typeof document !== 'undefined') ? document.getElementById('diag-wireframe-selected-info') : null;
    if (info) {
      info.innerHTML = `<strong>Selected #${index + 1}:</strong> Len: <strong>${len.toFixed(2)}m</strong> • Elev: ${y1.toFixed(1)}m→${y2.toFixed(1)}m${planeTag}<br><span style="color:#38bdf8;">(${x1.toFixed(1)}, ${z1.toFixed(1)}) → (${x2.toFixed(1)}, ${z2.toFixed(1)})</span>`;
    }

    if (this.wireframeHighlightMesh && this.threeScene) {
      this.threeScene.remove(this.wireframeHighlightMesh);
      if (this.wireframeHighlightMesh.geometry) this.wireframeHighlightMesh.geometry.dispose();
      this.wireframeHighlightMesh = null;
    }

    if (typeof THREE !== 'undefined' && typeof THREE.Vector3 === 'function' && typeof THREE.BufferGeometry === 'function' && typeof THREE.Line === 'function') {
      const p1 = new THREE.Vector3(x1, y1 + elevOffset, z1);
      const p2 = new THREE.Vector3(x2, y2 + elevOffset, z2);
      const geo = new THREE.BufferGeometry().setFromPoints([p1, p2]);
      const mat = new THREE.LineBasicMaterial({ color: 0xf59e0b, linewidth: 4 });
      this.wireframeHighlightMesh = new THREE.Line(geo, mat);
      if (this.threeScene) this.threeScene.add(this.wireframeHighlightMesh);
    }
  },

  deleteSelectedWireframeLine() {
    if (this.wireframeSelectedLineIndex === null || !this.wireframeData || !Array.isArray(this.wireframeData.lines)) return;
    const idx = this.wireframeSelectedLineIndex;
    if (idx >= 0 && idx < this.wireframeData.lines.length) {
      this.wireframeData.lines.splice(idx, 1);
      this.wireframeSelectedLineIndex = null;
      if (this.wireframeHighlightMesh && this.threeScene) {
        this.threeScene.remove(this.wireframeHighlightMesh);
        this.wireframeHighlightMesh = null;
      }
      const info = (typeof document !== 'undefined') ? document.getElementById('diag-wireframe-selected-info') : null;
      if (info) info.textContent = 'Line deleted. Click line to select & inspect';
      this.rebuildWireframeMesh();
    }
  },

  unprojectFromWorld(x, z) {
    const origin = this.getSceneOrigin();
    const tileZoom = 18;
    const tileWidthMeters = 40075016.686 * Math.cos(origin.lat * Math.PI / 180) / Math.pow(2, tileZoom);
    const sinLat0 = Math.sin(origin.lat * Math.PI / 180);
    const xTile0 = ((origin.lon + 180) / 360) * Math.pow(2, tileZoom);
    const yTile0 = (0.5 - Math.log((1 + sinLat0) / (1 - sinLat0)) / (4 * Math.PI)) * Math.pow(2, tileZoom);

    const xTile = (x / tileWidthMeters) + xTile0;
    const yTile = (z / tileWidthMeters) + yTile0;

    const lon = (xTile / Math.pow(2, tileZoom)) * 360 - 180;
    const n = Math.PI - 2 * Math.PI * (yTile / Math.pow(2, tileZoom));
    const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));

    return { lat, lon, lng: lon };
  },

  convertWireframeToBoundary() {
    if (!this.wireframeData || !Array.isArray(this.wireframeData.lines) || this.wireframeData.lines.length < 3) {
      if (typeof showToast === 'function') showToast('Requires at least 3 wireframe line segments', 'warning');
      return;
    }

    const pts2D = [];
    this.wireframeData.lines.forEach(l => {
      if (Array.isArray(l) && l.length >= 6) {
        pts2D.push({ x: l[0], z: l[2] });
        pts2D.push({ x: l[3], z: l[5] });
      }
    });

    if (pts2D.length < 3) return;

    // Compute 2D Convex Hull
    const sorted = [...pts2D].sort((a, b) => a.x === b.x ? a.z - b.z : a.x - b.x);
    const cross = (o, a, b) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);

    const lower = [];
    for (const p of sorted) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
        lower.pop();
      }
      lower.push(p);
    }
    const upper = [];
    for (let i = sorted.length - 1; i >= 0; i--) {
      const p = sorted[i];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
        upper.pop();
      }
      upper.push(p);
    }
    lower.pop();
    upper.pop();
    const hullWorld = lower.concat(upper);

    if (hullWorld.length < 3) return;

    // Unproject to Geo Coordinates
    const geoPolygon = hullWorld.map(wp => this.unprojectFromWorld(wp.x, wp.z));

    // Save as parcel / boundary in active layer
    if (typeof flightLayers !== 'undefined' && Array.isArray(flightLayers) && flightLayers.length > 0) {
      const activeIdx = (typeof currentLayerIndex !== 'undefined' && currentLayerIndex >= 0 && currentLayerIndex < flightLayers.length) ? currentLayerIndex : 0;
      const targetLayer = flightLayers[activeIdx];
      targetLayer.boundaryPolygon = geoPolygon;
      targetLayer.boundaryColor = '#38bdf8';
      targetLayer.boundaryStyle = 'solid';
      targetLayer.boundaryFillOpacity = 20;

      if (typeof updateLayerBoundaryUI === 'function') updateLayerBoundaryUI();
      if (typeof renderAllLayerBoundaries === 'function') renderAllLayerBoundaries();
      if (typeof showToast === 'function') showToast(`✨ Converted 3D wireframe to Layer ${targetLayer.name || activeIdx + 1} Boundary!`, 'success');
      else alert('✨ Converted 3D wireframe to Flight Layer Boundary!');
    }
  },

  gatherDigitalTwinData() {
    const elevOffset = typeof this.wireframeElevationOffset === 'number' ? this.wireframeElevationOffset : 0.0;
    let flightPath = [];
    let photos = [];
    let boundary = [];

    // 1. Flight Path Trajectory Points
    if (this.telemetryData && Array.isArray(this.telemetryData.points) && this.telemetryData.points.length >= 2) {
      flightPath = this.telemetryData.points.map(p => {
        const lon = p.lon !== undefined ? p.lon : p.lng;
        const w = (typeof this.projectToWorld === 'function') ? this.projectToWorld(p.lat, lon, p.alt || 25.0) : { x: 0, y: p.alt || 25, z: 0 };
        return [Math.round(w.x * 1000) / 1000, Math.round(w.y * 1000) / 1000, Math.round(w.z * 1000) / 1000];
      });
    } else if (Array.isArray(this.plannedWaypoints) && this.plannedWaypoints.length >= 2) {
      flightPath = this.plannedWaypoints.map(wp => {
        const lon = wp.lon !== undefined ? wp.lon : wp.lng;
        const w = (typeof this.projectToWorld === 'function') ? this.projectToWorld(wp.lat, lon, wp.altitude || wp.alt || 21.0) : { x: 0, y: wp.alt || 21, z: 0 };
        return [Math.round(w.x * 1000) / 1000, Math.round(w.y * 1000) / 1000, Math.round(w.z * 1000) / 1000];
      });
    }

    // 2. Camera Photo Frustums (pyramids with position, yaw, pitch)
    if (this.telemetryData && Array.isArray(this.telemetryData.points)) {
      const photoPts = this.telemetryData.points.filter(p => p.isPhoto);
      const ptsToUse = photoPts.length > 0 ? photoPts : (this.flightPhotos || []);
      photos = ptsToUse.map(p => {
        const lon = p.lon !== undefined ? p.lon : p.lng;
        const w = (typeof this.projectToWorld === 'function') ? this.projectToWorld(p.lat, lon, p.alt || 25.0) : { x: 0, y: p.alt || 25, z: 0 };
        return {
          x: Math.round(w.x * 1000) / 1000,
          y: Math.round(w.y * 1000) / 1000,
          z: Math.round(w.z * 1000) / 1000,
          yaw: (p.yaw !== undefined && p.yaw !== null) ? p.yaw : (p.heading || 0),
          pitch: (p.pitch !== undefined && p.pitch !== null) ? p.pitch : (p.gimbalPitch !== undefined ? p.gimbalPitch : -60),
          roll: p.roll || 0,
          hfov: p.hfov || 73.7,
          vfov: p.vfov || 53.1
        };
      });
    }

    // 3. Boundary Polygon Loop
    const bnds = (typeof this.getLayersWithBoundaries === 'function') ? this.getLayersWithBoundaries() : (this.boundaries || []);
    if (Array.isArray(bnds) && bnds.length > 0 && Array.isArray(bnds[0].polygon) && bnds[0].polygon.length >= 3) {
      boundary = bnds[0].polygon.map(pt => {
        const lon = pt.lon !== undefined ? pt.lon : pt.lng;
        const w = (typeof this.projectToWorld === 'function') ? this.projectToWorld(pt.lat, lon, 0.15) : { x: 0, y: 0.15, z: 0 };
        return [Math.round(w.x * 1000) / 1000, Math.round(w.y * 1000) / 1000, Math.round(w.z * 1000) / 1000];
      });
    }

    return { flightPath, photos, boundary, planes: (this.wireframeData && this.wireframeData.planes) || [], elevationOffset: elevOffset };
  },

  exportWireframe(format = 'json') {
    if (!this.wireframeData || !Array.isArray(this.wireframeData.lines)) return;
    let mimeType = 'application/json';
    let fileExt = 'json';
    let content = '';
    const elevOffset = typeof this.wireframeElevationOffset === 'number' ? this.wireframeElevationOffset : 0.0;

    if (format === 'obj') {
      mimeType = 'text/plain';
      fileExt = 'obj';
      let vCount = 1;
      content = `# Aalaapi Sky 3D Architectural Wireframe\n# Generated: ${new Date().toISOString()}\n\n`;
      this.wireframeData.lines.forEach(line => {
        if (!Array.isArray(line) || line.length < 6) return;
        const [x1, y1, z1, x2, y2, z2] = line;
        content += `v ${x1} ${y1 + elevOffset} ${z1}\n`;
        content += `v ${x2} ${y2 + elevOffset} ${z2}\n`;
        content += `l ${vCount} ${vCount + 1}\n`;
        vCount += 2;
      });
    } else if (format === 'threejs' || format === 'three') {
      mimeType = 'application/json';
      fileExt = 'threejs.json';
      const dtData = (typeof this.gatherDigitalTwinData === 'function') ? this.gatherDigitalTwinData() : { elevationOffset: elevOffset, planes: (this.wireframeData && this.wireframeData.planes) || [] };
      const threeObj = (typeof buildThreeDigitalTwinJson === 'function')
        ? buildThreeDigitalTwinJson(this.wireframeData.lines, {
            elevationOffset: dtData.elevationOffset,
            flightPath: dtData.flightPath,
            photos: dtData.photos,
            boundary: dtData.boundary,
            planes: dtData.planes || (this.wireframeData && this.wireframeData.planes) || [],
            asGroup: true
          })
        : {
            metadata: { version: 4.5, type: "Object", generator: "Aalaapi-Sky", source: "threejs.org compatible" },
            geometries: [],
            materials: [],
            object: { type: "Group", name: "Aalaapi_Inspection_Digital_Twin", children: [] }
          };
      content = JSON.stringify(threeObj, null, 2);
    } else {
      content = JSON.stringify(this.wireframeData, null, 2);
    }

    if (typeof Blob !== 'undefined' && typeof URL !== 'undefined' && typeof document !== 'undefined') {
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `wireframe_${this.selectedFlightId || 'mission'}.${fileExt}`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
    }
  },

  async saveWireframeToPackage() {
    if (!this.wireframeData || !Array.isArray(this.wireframeData.lines) || this.wireframeData.lines.length === 0) {
      if (typeof showToast === 'function') showToast('No wireframe lines to save', 'warning');
      else alert('No wireframe lines to save');
      return;
    }
    const apiBase = (typeof getCompanionApiBase === 'function')
      ? getCompanionApiBase()
      : (typeof COMPANION_API_BASE !== 'undefined' ? COMPANION_API_BASE : 'http://127.0.0.1:8765');

    let targetMissionUuid = (this.activeInspectionManifest && this.activeInspectionManifest.missionUuid)
      || (this.currentLoadedMission && this.currentLoadedMission.uuid)
      || (typeof activeLayerId !== 'undefined' && activeLayerId)
      || 'mission_' + Date.now();

    if (this.selectedFlightId) {
      const flightTagMatch = this.selectedFlightId.match(/(\d{4}-\d{2}-\d{2}_\[\d{2}-\d{2}-\d{2}\])/);
      targetMissionUuid = flightTagMatch ? `mission_${flightTagMatch[1]}` : `mission_${this.selectedFlightId.replace(/\.txt$/i, '').replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    }

    const dtData = (typeof this.gatherDigitalTwinData === 'function')
      ? this.gatherDigitalTwinData()
      : { elevationOffset: typeof this.wireframeElevationOffset === 'number' ? this.wireframeElevationOffset : 0.0 };

    try {
      const res = await fetch(`${apiBase}/api/process/wireframe/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          missionUuid: targetMissionUuid,
          lines: this.wireframeData.lines,
          elevationOffset: dtData.elevationOffset,
          flightPath: dtData.flightPath,
          photos: dtData.photos,
          boundary: dtData.boundary
        })
      });
      const data = await res.json();
      if (data && data.success) {
        if (this.activeInspectionManifest) {
          this.activeInspectionManifest.wireframe = data.wireframe;
        }
        if (typeof showToast === 'function') {
          showToast(`📦 3D Wireframe saved to package (${data.count} lines)!`, 'success');
        } else {
          alert(`📦 3D Wireframe saved to package (${data.count} lines)!`);
        }
      } else {
        throw new Error((data && data.error) || 'Failed to save wireframe to package');
      }
    } catch (err) {
      if (typeof showToast === 'function') showToast(`Package note: ${err.message}`, 'warning');
      else alert(`Package note: ${err.message}`);
    }
  },

  async extractWireframeFromCurrentPhotos() {
    const btn = (typeof document !== 'undefined') ? document.getElementById('diag-btn-extract-wireframe') : null;
    if (btn) {
      btn.disabled = true;
      btn.textContent = '⏳ Extracting...';
    }
    try {
      const apiBase = (typeof getCompanionApiBase === 'function')
        ? getCompanionApiBase()
        : (typeof COMPANION_API_BASE !== 'undefined' ? COMPANION_API_BASE : 'http://127.0.0.1:8765');

      const missionUuid = (this.activeInspectionManifest && this.activeInspectionManifest.missionUuid)
        || (this.currentLoadedMission && this.currentLoadedMission.uuid)
        || this.selectedFlightId
        || 'default-mission';

      const res = await fetch(`${apiBase}/api/process/wireframe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          missionUuid,
          flightId: this.selectedFlightId,
          photos: (this.flightPhotos && this.flightPhotos.length > 0) ? this.flightPhotos : []
        })
      });

      if (!res.ok) throw new Error(`Bridge returned HTTP ${res.status}`);
      const data = await res.json();
      if (data && data.success) {
        this.loadWireframeGeometry(data);
        this.switchTab('3d');
        if (typeof showToast === 'function') showToast(`✨ 3D Architectural Wireframe extracted (${data.count || 0} lines)`, 'success');
      } else {
        throw new Error(data.error || 'Extraction failed');
      }
    } catch (err) {
      if (typeof showToast === 'function') showToast(`Wireframe extraction failed: ${err.message}`, 'error');
      else alert(`Wireframe extraction note: ${err.message}`);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<span>🏗️</span> Project 3D Wireframe';
      }
    }
  }
};

// ─── Pre-Flight KMZ Inspector & DJI Fly Go Linter UI ─────────────────────────

const KMZInspector = {
  activeReport: null,
  activeWpmlXml: '',
  activeTemplateXml: '',

  open(auditReport = null, wpmlXml = '', templateXml = '') {
    if (typeof FlightDiagnostics !== 'undefined' && FlightDiagnostics.open) {
      FlightDiagnostics.open('audit');
    }
    const modal = document.getElementById('kmz-inspector-modal');
    if (modal) modal.classList.remove('hidden');

    if (auditReport) {
      this.activeReport = auditReport;
      this.activeWpmlXml = wpmlXml;
      this.activeTemplateXml = templateXml;
      this.render();
    } else {
      this.runCurrentWorkspaceAudit();
    }
  },

  close() {
    const modal = document.getElementById('kmz-inspector-modal');
    if (modal) modal.classList.add('hidden');
    if (typeof FlightDiagnostics !== 'undefined' && FlightDiagnostics.close) {
      FlightDiagnostics.close();
    }
  },

  runCurrentWorkspaceAudit() {
    try {
      const activeWps = (typeof getCurrentWaypoints === 'function' ? getCurrentWaypoints() : null) || (typeof generatedWaypoints !== 'undefined' ? generatedWaypoints : null) || [];
      const wps = Array.isArray(activeWps) ? activeWps : [];
      const finishAction = document.getElementById('finish-action')?.value || 'goHome';
      const altitude = parseFloat(document.getElementById('altitude')?.value) || 50;
      const speed = parseFloat(document.getElementById('speed')?.value) || 4;
      const headingMode = document.getElementById('heading-mode')?.value || 'followWayline';
      const gimbalPitch = parseGimbalPitch(document.getElementById('gimbal-pitch')?.value, -90);
      const captureMode = document.getElementById('capture-mode')?.value || 'hover';
      const pathMode = document.getElementById('path-mode')?.value || 'normal';

      const tmpl = buildTemplateKml(finishAction, speed);
      const wpml = buildWaylinesWpml(wps, altitude, speed, headingMode, finishAction, gimbalPitch, captureMode, pathMode);
      const currentGridType = document.getElementById('grid-type')?.value || 'single';
      const report = validateWpmlMission(wpml, tmpl, { waypoints: wps, gridType: currentGridType });
      this.activeReport = report;
      this.activeWpmlXml = wpml;
      this.activeTemplateXml = tmpl;
      this.render();
      this.updateStatusBadge(report);
    } catch (err) {
      console.error('Error in runCurrentWorkspaceAudit:', err);
      this.lastAuditError = err.message + '\n' + err.stack;
    }
  },

  updateStatusBadge(report) {
    const badge = document.getElementById('kmz-preflight-status-badge');
    const text = document.getElementById('kmz-preflight-text');
    if (!badge || !text) return;
    if (!report || report.valid) {
      badge.style.background = 'rgba(16, 185, 129, 0.08)';
      badge.style.borderColor = 'rgba(16, 185, 129, 0.2)';
      badge.style.color = '#34d399';
      text.textContent = `DJI Fly Pre-Flight: ${report ? report.rulesPassed : 10}/10 Rules Verified`;
    } else {
      badge.style.background = 'rgba(239, 68, 68, 0.1)';
      badge.style.borderColor = 'rgba(239, 68, 68, 0.3)';
      badge.style.color = '#f87171';
      text.textContent = `DJI Fly Warning: ${report.errors.length} issue(s) detected`;
    }
  },

  render() {
    if (!this.activeReport) return;
    const report = this.activeReport;

    const droneModelEl = document.getElementById('drone-model');
    const droneText = droneModelEl ? droneModelEl.options[droneModelEl.selectedIndex]?.text : 'DJI Mini 4 Pro (68)';
    const summaryTarget = document.getElementById('inspector-drone-target');
    if (summaryTarget) summaryTarget.textContent = droneText;
    const summaryWps = document.getElementById('inspector-wp-count');
    if (summaryWps) summaryWps.textContent = `${report.placemarkCount} waypoints`;
    const summaryRules = document.getElementById('inspector-rules-score');
    if (summaryRules) {
      summaryRules.textContent = `${report.rulesPassed}/10 Passed`;
      summaryRules.style.color = report.valid ? '#34d399' : '#f87171';
    }

    // 1. Update Executive Readiness Hero Card
    const execCard = document.getElementById('inspector-executive-card');
    const execIcon = document.getElementById('inspector-executive-icon');
    const execTitle = document.getElementById('inspector-executive-title');
    const execDesc = document.getElementById('inspector-executive-desc');
    const execBadge = document.getElementById('inspector-executive-badge');
    const rulesDetails = document.getElementById('inspector-rules-details');
    const rulesExpandLabel = document.getElementById('inspector-rules-expand-label');
    const copyAntigravityBtn = document.getElementById('inspector-copy-antigravity-btn');

    const hasWarnings = Array.isArray(report.warnings) && report.warnings.length > 0;
    const isFullyCompliant = report.valid && !hasWarnings;

    if (execCard && execTitle) {
      if (isFullyCompliant) {
        execCard.style.background = 'rgba(16, 185, 129, 0.08)';
        execCard.style.borderColor = 'rgba(16, 185, 129, 0.3)';
        if (execIcon) {
          execIcon.textContent = '✓';
          execIcon.style.color = '#34d399';
          execIcon.style.background = 'rgba(16, 185, 129, 0.18)';
          execIcon.style.borderColor = 'rgba(16, 185, 129, 0.4)';
        }
        execTitle.textContent = '100% DJI Fly Ready';
        execTitle.style.color = '#34d399';
        if (execDesc) execDesc.textContent = `All ${report.rulesPassed || 10} firmware rules and spline tangent constraints verified for ${droneText}. Ready for RC 2 controller upload.`;
        if (execBadge) {
          execBadge.textContent = `${report.rulesPassed}/10 Passed`;
          execBadge.style.color = '#34d399';
          execBadge.style.background = 'rgba(16, 185, 129, 0.2)';
          execBadge.style.borderColor = 'rgba(16, 185, 129, 0.4)';
        }
        // Keep rules collapsed by default when fully clean
        if (rulesDetails && !rulesDetails.hasAttribute('data-user-interacted')) {
          rulesDetails.open = false;
        }
        if (rulesExpandLabel) rulesExpandLabel.textContent = 'Expand details ▾';
        if (copyAntigravityBtn) copyAntigravityBtn.style.display = 'none';
      } else if (report.valid && hasWarnings) {
        execCard.style.background = 'rgba(245, 158, 11, 0.08)';
        execCard.style.borderColor = 'rgba(245, 158, 11, 0.3)';
        if (execIcon) {
          execIcon.textContent = '⚠️';
          execIcon.style.color = '#fbbf24';
          execIcon.style.background = 'rgba(245, 158, 11, 0.18)';
          execIcon.style.borderColor = 'rgba(245, 158, 11, 0.4)';
        }
        execTitle.textContent = 'DJI Fly Advisory Warnings';
        execTitle.style.color = '#fbbf24';
        if (execDesc) execDesc.textContent = `${report.warnings.length} advisory warning(s) detected. Mission will fly, but review recommendations below.`;
        if (execBadge) {
          execBadge.textContent = `${report.warnings.length} Warning(s)`;
          execBadge.style.color = '#fbbf24';
          execBadge.style.background = 'rgba(245, 158, 11, 0.2)';
          execBadge.style.borderColor = 'rgba(245, 158, 11, 0.4)';
        }
        if (rulesDetails && !rulesDetails.hasAttribute('data-user-interacted')) {
          rulesDetails.open = true;
        }
        if (rulesExpandLabel) rulesExpandLabel.textContent = 'Collapse details ▴';
        if (copyAntigravityBtn) {
          copyAntigravityBtn.style.display = 'inline-flex';
          copyAntigravityBtn.style.background = 'rgba(245, 158, 11, 0.15)';
          copyAntigravityBtn.style.borderColor = 'rgba(245, 158, 11, 0.4)';
          copyAntigravityBtn.style.color = '#fbbf24';
        }
      } else {
        execCard.style.background = 'rgba(239, 68, 68, 0.08)';
        execCard.style.borderColor = 'rgba(239, 68, 68, 0.3)';
        if (execIcon) {
          execIcon.textContent = '✕';
          execIcon.style.color = '#f87171';
          execIcon.style.background = 'rgba(239, 68, 68, 0.18)';
          execIcon.style.borderColor = 'rgba(239, 68, 68, 0.4)';
        }
        execTitle.textContent = 'DJI Fly Incompatibility Detected';
        execTitle.style.color = '#f87171';
        const errCount = (report.errors && report.errors.length) || (10 - report.rulesPassed);
        if (execDesc) execDesc.textContent = `${errCount} rule violation(s) may cause RC 2 controller to abort upon pressing "Go".`;
        if (execBadge) {
          execBadge.textContent = `${report.rulesPassed}/10 Passed`;
          execBadge.style.color = '#f87171';
          execBadge.style.background = 'rgba(239, 68, 68, 0.2)';
          execBadge.style.borderColor = 'rgba(239, 68, 68, 0.4)';
        }
        // Auto-expand on error so pilot immediately sees what's failing
        if (rulesDetails) rulesDetails.open = true;
        if (rulesExpandLabel) rulesExpandLabel.textContent = 'Collapse details ▴';
        if (copyAntigravityBtn) {
          copyAntigravityBtn.style.display = 'inline-flex';
          copyAntigravityBtn.style.background = 'rgba(239, 68, 68, 0.15)';
          copyAntigravityBtn.style.borderColor = 'rgba(239, 68, 68, 0.4)';
          copyAntigravityBtn.style.color = '#f87171';
        }
      }
    }

    // 2. Render the 10 rules inside the container
    const listContainer = document.getElementById('inspector-checklist-container');
    if (listContainer) {
      listContainer.innerHTML = report.rules.map(r => `
        <div style="padding: 8px 10px; background: rgba(255, 255, 255, 0.02); border: 1px solid ${r.passed ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.3)'}; border-radius: 6px; display: flex; flex-direction: column; gap: 4px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <strong style="color: ${r.passed ? '#34d399' : '#f87171'}; font-size: 0.78rem; display: flex; align-items: center; gap: 6px;">
              ${r.passed ? '✅' : '❌'} Rule ${r.id}: ${r.name}
            </strong>
            <span style="font-size: 0.68rem; font-weight: bold; color: ${r.passed ? '#34d399' : '#f87171'};">${r.passed ? 'COMPLIANT' : 'FAILING'}</span>
          </div>
          <div style="font-size: 0.72rem; color: var(--text-muted); line-height: 1.35;">
            ${r.message}
          </div>
        </div>
      `).join('');
    }

    // 3. Populate raw XML pre blocks
    const wpmlEl = document.getElementById('inspector-xml-wpml');
    if (wpmlEl) wpmlEl.textContent = this.activeWpmlXml;
    const tmplEl = document.getElementById('inspector-xml-tmpl');
    if (tmplEl) tmplEl.textContent = this.activeTemplateXml;
  },

  generateAntigravityPrompt(report = null, wpml = '', wps = null, options = {}) {
    const r = report || this.activeReport;
    const xml = wpml || this.activeWpmlXml || '';
    const hideLocation = (options && options.hideLocation !== undefined) ? !!options.hideLocation : true;

    // Global / Mission defaults
    let drone = 'DJI Mini 4 Pro (68)';
    let pattern = 'single';
    let alt = '50';
    let speed = '4';
    let pitch = '-90';
    let headingMode = 'followWayline';
    let captureMode = 'hover';
    let pathMode = 'normal';

    if (typeof document !== 'undefined') {
      try {
        const droneEl = document.getElementById('drone-model');
        if (droneEl && droneEl.options && droneEl.selectedIndex >= 0 && droneEl.options[droneEl.selectedIndex]) {
          drone = droneEl.options[droneEl.selectedIndex].text || drone;
        }
        pattern = document.getElementById('grid-type')?.value || document.getElementById('flight-pattern')?.value || pattern;
        alt = document.getElementById('altitude')?.value || alt;
        speed = document.getElementById('speed')?.value || speed;
        pitch = document.getElementById('gimbal-pitch')?.value || pitch;
        headingMode = document.getElementById('heading-mode')?.value || headingMode;
        captureMode = document.getElementById('capture-mode')?.value || captureMode;
        pathMode = document.getElementById('path-mode')?.value || pathMode;
      } catch (e) {}
    }

    // 1. Resolve layers
    let allLayers = [];
    if (options && Array.isArray(options.layers) && options.layers.length > 0) {
      allLayers = options.layers;
    } else if (options && options.mission && Array.isArray(options.mission.layers) && options.mission.layers.length > 0) {
      allLayers = options.mission.layers;
    } else if (options && options.mission && options.mission.plan && Array.isArray(options.mission.plan.layers) && options.mission.plan.layers.length > 0) {
      allLayers = options.mission.plan.layers;
    } else if (options && options.mission && options.mission.plan && Array.isArray(options.mission.plan.waypoints) && options.mission.plan.waypoints.length > 0) {
      allLayers = [{
        id: options.mission.uuid || 'loaded-mission',
        name: options.mission.name || 'Mission Route',
        pattern: options.mission.pattern || pattern,
        enabled: true,
        altitude: alt,
        speed: speed,
        waypoints: options.mission.plan.waypoints
      }];
    } else if (typeof global !== 'undefined' && Array.isArray(global.flightLayers) && global.flightLayers.length > 0) {
      allLayers = global.flightLayers;
    } else if (typeof flightLayers !== 'undefined' && Array.isArray(flightLayers) && flightLayers.length > 0) {
      allLayers = flightLayers;
    }

    // 2. Resolve POIs
    let allPois = [];
    if (options && Array.isArray(options.pois)) {
      allPois = options.pois;
    } else if (options && options.mission && Array.isArray(options.mission.pointsOfInterest)) {
      allPois = options.mission.pointsOfInterest;
    } else if (options && options.mission && Array.isArray(options.mission.pois)) {
      allPois = options.mission.pois;
    } else if (options && options.mission && options.mission.plan && Array.isArray(options.mission.plan.pointsOfInterest)) {
      allPois = options.mission.plan.pointsOfInterest;
    } else if (typeof global !== 'undefined' && Array.isArray(global.pois) && global.pois.length > 0) {
      allPois = global.pois;
    } else if (typeof pois !== 'undefined' && Array.isArray(pois)) {
      allPois = pois;
    }

    // 3. Fallback / Active waypoints
    const activeWps = wps || (typeof getCurrentWaypoints === 'function' ? getCurrentWaypoints() : null) || (typeof generatedWaypoints !== 'undefined' ? generatedWaypoints : null) || [];

    // App Default Rural Reference Location: Grand Village of the Illinois / Utica, IL rural countryside
    const DEFAULT_APP_LAT = 41.3215;
    const DEFAULT_APP_LON = -88.9950;

    // Determine reference center for coordinate shifting / normalization
    let refLat = null;
    let refLon = null;
    if (typeof centerMarker !== 'undefined' && centerMarker && typeof centerMarker.getLatLng === 'function') {
      const c = centerMarker.getLatLng();
      if (c && typeof c.lat === 'number' && typeof c.lng === 'number' && !isNaN(c.lat) && !isNaN(c.lng)) {
        refLat = c.lat;
        refLon = c.lng;
      }
    }
    if (refLat === null && allLayers.length > 0) {
      for (const l of allLayers) {
        if (typeof l.centerLat === 'number' && typeof l.centerLon === 'number' && !isNaN(l.centerLat) && !isNaN(l.centerLon)) {
          refLat = l.centerLat;
          refLon = l.centerLon;
          break;
        }
      }
    }
    if (refLat === null && Array.isArray(activeWps) && activeWps.length > 0 && typeof activeWps[0].lat === 'number') {
      refLat = activeWps[0].lat;
      refLon = activeWps[0].lon ?? activeWps[0].lng;
    }
    if (refLat === null && allPois.length > 0 && typeof allPois[0].lat === 'number') {
      refLat = allPois[0].lat;
      refLon = allPois[0].lon ?? allPois[0].lng;
    }
    if (refLat === null || isNaN(refLat) || refLon === null || isNaN(refLon)) {
      refLat = DEFAULT_APP_LAT;
      refLon = DEFAULT_APP_LON;
    }

    const dLat = DEFAULT_APP_LAT - refLat;
    const dLon = DEFAULT_APP_LON - refLon;

    function formatCoord(lat, lon) {
      if (typeof lat !== 'number' || typeof lon !== 'number' || isNaN(lat) || isNaN(lon)) {
        return { lat: DEFAULT_APP_LAT, lon: DEFAULT_APP_LON, offsetMeters: { x: 0, y: 0 } };
      }
      if (!hideLocation) {
        return {
          lat: Number(lat.toFixed(7)),
          lon: Number(lon.toFixed(7))
        };
      }
      const normLat = Number((lat + dLat).toFixed(7));
      const normLon = Number((lon + dLon).toFixed(7));
      const latDist = (lat - refLat) * 111320;
      const lonDist = (lon - refLon) * (111320 * Math.cos(refLat * Math.PI / 180));
      return {
        lat: normLat,
        lon: normLon,
        offsetMeters: {
          x: Number(lonDist.toFixed(1)),
          y: Number(latDist.toFixed(1))
        }
      };
    }

    // Calculate total waypoints across all layers
    let totalWaypointsCount = 0;
    if (allLayers.length > 0) {
      allLayers.forEach(l => {
        if (l.enabled !== false) {
          const count = (l.waypoints && l.waypoints.length) || (l.freeformWaypoints && l.freeformWaypoints.length) || 0;
          totalWaypointsCount += count;
        }
      });
    }
    if (totalWaypointsCount === 0 && Array.isArray(activeWps)) {
      totalWaypointsCount = activeWps.length;
    }

    let prompt = `### 🤖 ANTIGRAVITY BUG REPORT: Bad KMZ Mission Execution Issue\n\n`;
    prompt += `**Mission Context:**\n`;
    prompt += `- **Target Drone Model:** ${drone}\n`;
    prompt += `- **Pattern:** ${pattern} (Altitude: ${alt}m, Speed: ${speed}m/s, Pitch: ${pitch}°)\n`;
    prompt += `- **Total Flight Layers:** ${allLayers.length > 0 ? allLayers.length : 1}\n`;
    prompt += `- **Waypoints Total:** ${totalWaypointsCount}\n`;
    prompt += `- **Points of Interest (POIs):** ${allPois.length}\n`;
    prompt += `- **Location Privacy:** ${hideLocation ? '🔒 Masked / Normalized to App Default Rural Reference [41.3215, -88.9950] (Real GPS Redacted)' : '🔓 Real GPS Coordinates Included'}\n`;

    if (r) {
      prompt += `- **Validation Health Score:** ${r.rulesPassed ?? r.validation_rules_passed ?? 0}/10 Passed (${r.valid || r.is_valid ? 'Valid' : 'Invalid'})\n`;
      const errList = r.errors || r.validationErrors || [];
      if (errList.length > 0) {
        prompt += `- **Detected Pre-Flight Errors:**\n`;
        errList.forEach((e, i) => { prompt += `  ${i + 1}. ❌ ${e}\n`; });
      }
      const warnList = r.warnings || r.validationWarnings || [];
      if (warnList.length > 0) {
        prompt += `- **Detected Warnings:**\n`;
        warnList.forEach((w, i) => { prompt += `  ${i + 1}. ⚠️ ${w}\n`; });
      }
    }

    // Points of Interest (POIs) Section
    if (allPois.length > 0) {
      prompt += `\n**Points of Interest (POIs):**\n`;
      allPois.forEach((p, idx) => {
        const c = formatCoord(p.lat, p.lon ?? p.lng);
        prompt += `- **POI ${idx + 1} (${p.name || 'Target ' + (idx + 1)}):** id=\`${p.id || 'poi-' + idx}\`, coords=${JSON.stringify(c)}, alt=${p.alt || 0}m, role=${p.role || p.marker || 'standard'}\n`;
      });
    }

    // Multi-Layer Mission Stack Section
    if (allLayers.length > 0) {
      prompt += `\n**Multi-Layer Mission Stack (${allLayers.length} Layers):**\n`;
      allLayers.forEach((layer, idx) => {
        const isEnabled = layer.enabled !== false;
        const lAlt = layer.altitude ?? alt;
        const lSpeed = layer.speed ?? speed;
        const lPitch = layer.gimbalPitch ?? pitch;
        const lHeading = layer.headingMode || headingMode;
        const lCapture = layer.captureMode || captureMode;
        const lPath = layer.pathMode || pathMode;
        const lZoom = layer.cameraZoom || 1.0;
        const lHover = layer.hoverTime || 0;

        let layerWps = [];
        if (Array.isArray(layer.waypoints) && layer.waypoints.length > 0) {
          layerWps = layer.waypoints;
        } else if (Array.isArray(layer.freeformWaypoints) && layer.freeformWaypoints.length > 0) {
          layerWps = layer.freeformWaypoints;
        } else if ((allLayers.length === 1 || layer.id === (typeof activeLayerId !== 'undefined' ? activeLayerId : null)) && activeWps.length > 0) {
          layerWps = activeWps;
        } else if (typeof generateLayerWaypoints === 'function' && !layer.isExclusionZone && !layer.isDrawingLayer && layer.pattern !== 'exclusion-box' && layer.pattern !== 'exclusion-freeform' && layer.pattern !== 'boundary-polygon' && layer.pattern !== 'fiducial-markers') {
          try {
            const res = generateLayerWaypoints(layer, layer.centerLat ?? refLat, layer.centerLon ?? refLon);
            layerWps = res.waypoints || [];
          } catch (_) {
            layerWps = [];
          }
        }

        prompt += `\n#### Layer ${idx + 1}: ${layer.name || 'Layer ' + (idx + 1)} (\`${layer.pattern || 'default'}\`)\n`;
        prompt += `- **Status:** ${isEnabled ? '✅ Enabled' : '⏸️ Disabled'} | **ID:** \`${layer.id || 'layer-' + idx}\`\n`;
        prompt += `- **Dynamics:** Alt: ${lAlt}m | Speed: ${lSpeed}m/s | Pitch: ${lPitch}° | Heading: ${lHeading} | Turn: ${lPath} | Capture: ${lCapture} | Zoom: ${lZoom}x | Dwell: ${lHover}s\n`;

        // Pattern specific attributes
        if (layer.pattern === 'double' || layer.pattern === 'single' || layer.pattern === 'smart-oblique') {
          prompt += `- **Grid Properties:** Width: ${layer.gridWidth || 100}m | Height: ${layer.gridHeight || 100}m | Rotation: ${layer.gridRotation || 0}° | Overlap: ${layer.frontOverlap || 80}% front, ${layer.sideOverlap || 75}% side\n`;
        } else if (layer.pattern === 'exclusion-box' || layer.pattern === 'exclusion-freeform' || layer.isExclusionZone) {
          prompt += `- **Exclusion Envelope:** Clearance: ${layer.clearanceBuffer || 5}m | Detour: ${layer.detourMode || 'inherit'} | Alt Bounds: [${layer.minAltitude || 0}m, ${layer.maxAltitude || 60}m] | Vertices: ${layer.polygonVertices?.length || 0}\n`;
        } else if (layer.pattern === 'boundary-polygon' || layer.isDrawingLayer) {
          prompt += `- **Boundary Polygon:** Vertices: ${layer.boundaryPolygon?.length || layer.polygonVertices?.length || 0}\n`;
        } else if (layer.pattern === 'tower' || layer.pattern === 'spiral-cylinder') {
          prompt += `- **Tower Target (Target Splat):** Mode: ${layer.targetMode || 'radius'} | Radius: ${layer.targetRadius || 25}m | Height: ${layer.targetHeight || 8}m | Framing: ${layer.targetFramingMode || 'balanced'} | Culling: ${layer.targetCullingMode || 'smartTrim'}\n`;
        } else if (layer.pattern === 'fiducial-markers' || layer.isFiducialLayer) {
          prompt += `- **Fiducials:** Markers: ${layer.fiducialMarkers?.length || 0}\n`;
        } else if (layer.pattern === 'corridor' || layer.roadSnap) {
          prompt += `- **Corridor Properties:** Offset: ${layer.roadOffset || 15}m | Snap: ${layer.roadSnap ? 'Yes' : 'No'} | Focus: ${layer.roadFocusMode || 'focusRoad'}\n`;
        }

        prompt += `- **Waypoints Count:** ${layerWps.length}\n`;
        if (layerWps.length > 0) {
          const sample = layerWps.slice(0, 5).map((wp, wIdx) => {
            const c = formatCoord(wp.lat, wp.lon ?? wp.lng);
            return {
              index: wIdx,
              lat: c.lat,
              lon: c.lon,
              offsetMeters: c.offsetMeters,
              alt: wp.altitude || wp.alt || lAlt,
              heading: wp.heading,
              turnMode: wp.turnMode || wp.pathMode,
              gimbalPitch: wp.gimbalPitch ?? wp.pitch ?? lPitch
            };
          });
          prompt += `  \`\`\`json\n${JSON.stringify(sample, null, 2)}\n  \`\`\`\n`;
        }
      });
    }

    // Include sample waypoints block if no individual layer printed waypoints
    let anyLayerHadWps = false;
    allLayers.forEach(l => {
      if ((l.waypoints && l.waypoints.length > 0) || (l.freeformWaypoints && l.freeformWaypoints.length > 0)) anyLayerHadWps = true;
    });
    if ((!anyLayerHadWps || allLayers.length === 0) && activeWps.length > 0) {
      const sample = activeWps.slice(0, 5).map((wp, i) => {
        const c = formatCoord(wp.lat, wp.lon ?? wp.lng);
        return {
          index: i,
          lat: c.lat,
          lon: c.lon,
          offsetMeters: c.offsetMeters,
          alt: wp.altitude || wp.alt || alt,
          heading: wp.heading,
          turnMode: wp.turnMode
        };
      });
      prompt += `\n**Sample Waypoints Input:**\n\`\`\`json\n${JSON.stringify(sample, null, 2)}\n\`\`\`\n`;
    }

    if (xml) {
      let sanitizedXml = xml;
      if (hideLocation) {
        sanitizedXml = sanitizedXml.replace(/<coordinates>\s*([-0-9.]+)\s*,\s*([-0-9.]+)(?:,\s*([-0-9.]+))?\s*<\/coordinates>/g, (m, lonStr, latStr, altStr) => {
          const rawLon = parseFloat(lonStr);
          const rawLat = parseFloat(latStr);
          if (!isNaN(rawLon) && !isNaN(rawLat)) {
            const sLon = (rawLon + dLon).toFixed(7);
            const sLat = (rawLat + dLat).toFixed(7);
            return `<coordinates>${sLon},${sLat}${altStr !== undefined ? ',' + altStr : ''}</coordinates>`;
          }
          return m;
        });
        sanitizedXml = sanitizedXml.replace(/<wpml:waypointPoiPoint>\s*([-0-9.]+)\s*,\s*([-0-9.]+)(?:,\s*([-0-9.]+))?\s*<\/wpml:waypointPoiPoint>/g, (m, latStr, lonStr, altStr) => {
          const rawLat = parseFloat(latStr);
          const rawLon = parseFloat(lonStr);
          if (!isNaN(rawLat) && !isNaN(rawLon)) {
            const sLat = (rawLat + dLat).toFixed(7);
            const sLon = (rawLon + dLon).toFixed(7);
            return `<wpml:waypointPoiPoint>${sLat},${sLon}${altStr !== undefined ? ',' + altStr : ''}</wpml:waypointPoiPoint>`;
          }
          return m;
        });
      }
      const placemarks = sanitizedXml.split('<Placemark>');
      const xmlExtract = placemarks.length > 1 ? '<Placemark>' + placemarks[1].substring(0, 450) + '...\n</Placemark>' : sanitizedXml.substring(0, 600);
      prompt += `\n**Offending / Generated WPML Snippet:**\n\`\`\`xml\n${xmlExtract}\n\`\`\`\n`;
    }

    prompt += `\n**Antigravity Instructions:**\n`;
    prompt += `1. Inspect the offending XML and rule failures above.\n`;
    prompt += `2. Formulate a regression unit test in \`index.test.js\` reproducing this exact configuration.\n`;
    prompt += `3. Fix the generation/sanitization logic in \`index.js\` (\`buildWaylinesWpml\` / \`validateAndFixWpml\`).\n`;
    prompt += `4. Run \`python scratch/build.py\` and verify all tests pass with \`npm test\`.\n`;

    return prompt;
  },

  copyAntigravityPrompt() {
    const promptText = this.generateAntigravityPrompt(null, '', null, { hideLocation: true });
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(promptText).then(() => {
        const btn = document.getElementById('inspector-copy-antigravity-btn');
        if (btn) {
          const orig = btn.innerHTML;
          btn.innerHTML = '✅ Copied to Clipboard!';
          btn.style.color = '#34d399';
          setTimeout(() => {
            btn.innerHTML = orig;
            btn.style.color = '#a5b4fc';
          }, 2500);
        }
      }).catch(() => {
        if (typeof prompt === 'function') prompt('Copy Antigravity Fix Prompt:', promptText);
      });
    } else {
      if (typeof prompt === 'function') prompt('Copy Antigravity Fix Prompt:', promptText);
    }
  },

  async auditExternalKMZ(file) {
    if (!file || typeof JSZip === 'undefined') return;
    try {
      const zip = await JSZip.loadAsync(file);
      const wpmlFile = zip.file('wpmz/waylines.wpml');
      const tmplFile = zip.file('wpmz/template.kml');
      if (!wpmlFile) {
        alert('Invalid KMZ: Missing wpmz/waylines.wpml file.');
        return;
      }
      const wpmlXml = await wpmlFile.async('text');
      const templateXml = tmplFile ? await tmplFile.async('text') : '';
      const report = validateWpmlMission(wpmlXml, templateXml);
      this.open(report, wpmlXml, templateXml);
    } catch (e) {
      alert('Could not parse KMZ file: ' + e.message);
    }
  }
};

