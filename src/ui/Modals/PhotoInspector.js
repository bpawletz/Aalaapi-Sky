const PhotoInspector = {
  activePhoto: null,
  activeManifest: null,
  photoList: null,
  currentTool: 'pan',
  currentColor: '#ef4444',
  unit: 'metric',
  calibrationMode: 'slant', // 'slant' (default for roofs/structures) or 'ground' (flat ground plane)
  targetHeight: 0, // Target height / elevation offset in meters
  zoom: 1,
  panX: 0,
  panY: 0,
  isDragging: false,
  dragStartX: 0,
  dragStartY: 0,
  activeBoundaryPoints: [],
  activeMeasurePoints: [],
  activeArrowStart: null,
  activeBoxStart: null,
  layers: {
    hud: true,
    boundary: true,
    layerBoundary: true, // Auto-superimpose active flight layer boundary!
    wireframe: true, // Auto-superimpose 3D architectural wireframe!
    fiducials: true, // Auto-superimpose fiducial markers / GCPs!
    detectedTags: true, // Auto-detect & highlight optical tags (AprilTag / ArUco)!
    measure: true,
    pins: true,
    reticle: true
  },
  projectGeoPointToPixel,
  projectGeoPolygonToPhoto,
  getLayerBoundaryGeoPolygon,
  computeConvexHullGeo,
  extractDjiXmpMetadata,

  getPhotoList() {
    if (Array.isArray(this.photoList) && this.photoList.length > 0) {
      return this.photoList;
    }
    if (this.activeManifest && Array.isArray(this.activeManifest.photos) && this.activeManifest.photos.length > 0) {
      return this.activeManifest.photos;
    }
    if (typeof activeInspectionManifest !== 'undefined' && activeInspectionManifest && Array.isArray(activeInspectionManifest.photos) && activeInspectionManifest.photos.length > 0) {
      return activeInspectionManifest.photos;
    }
    if (typeof FlightDiagnostics !== 'undefined') {
      if (FlightDiagnostics.activeInspectionManifest && Array.isArray(FlightDiagnostics.activeInspectionManifest.photos) && FlightDiagnostics.activeInspectionManifest.photos.length > 0) {
        return FlightDiagnostics.activeInspectionManifest.photos;
      }
      if (FlightDiagnostics.flightManifest && Array.isArray(FlightDiagnostics.flightManifest.photos) && FlightDiagnostics.flightManifest.photos.length > 0) {
        return FlightDiagnostics.flightManifest.photos;
      }
      if (Array.isArray(FlightDiagnostics.flightPhotos) && FlightDiagnostics.flightPhotos.length > 0) {
        return FlightDiagnostics.flightPhotos;
      }
      if (typeof FlightDiagnostics.getCorrelatedPhotos === 'function') {
        const cp = FlightDiagnostics.getCorrelatedPhotos();
        if (Array.isArray(cp) && cp.length > 0) return cp;
      }
    }
    if (this.activePhoto) {
      return [this.activePhoto];
    }
    return [];
  },

  getCurrentPhotoIndex() {
    const list = this.getPhotoList();
    if (!list || list.length === 0 || !this.activePhoto) return -1;
    return list.findIndex(p =>
      p === this.activePhoto ||
      (p.photoId && this.activePhoto.photoId && p.photoId === this.activePhoto.photoId) ||
      (p.filename && this.activePhoto.filename && p.filename === this.activePhoto.filename)
    );
  },

  goToPhoto(index) {
    const list = this.getPhotoList();
    if (!list || list.length === 0) return;
    if (index < 0 || index >= list.length) return;
    const targetPhoto = list[index];
    if (!targetPhoto) return;

    this.activeBoundaryPoints = [];
    this.activeMeasurePoints = [];
    this.activeArrowStart = null;
    this.activeBoxStart = null;

    this.open(targetPhoto, this.activeManifest, list);
  },

  previousPhoto() {
    const idx = this.getCurrentPhotoIndex();
    if (idx > 0) {
      this.goToPhoto(idx - 1);
    }
  },

  nextPhoto() {
    const idx = this.getCurrentPhotoIndex();
    const list = this.getPhotoList();
    if (idx >= 0 && idx < list.length - 1) {
      this.goToPhoto(idx + 1);
    }
  },

  projectWorldPointToCamera(pt, camPose, options = {}) {
    if (!pt || typeof pt.x !== 'number') return null;

    let camWorld = null;
    if (typeof FlightDiagnostics !== 'undefined' && typeof FlightDiagnostics.projectToWorld === 'function') {
      try {
        const altVal = (camPose.altAgl && camPose.altAgl > 0) ? camPose.altAgl : (camPose.alt || 25.0);
        const cw = FlightDiagnostics.projectToWorld(camPose.lat, camPose.lon, altVal);
        if (cw && !isNaN(cw.x) && !isNaN(cw.z)) camWorld = cw;
      } catch (_) {}
    }
    if (!camWorld) {
      camWorld = { x: 0, y: (camPose.altAgl && camPose.altAgl > 0) ? camPose.altAgl : (camPose.alt || 25.0), z: 0 };
    }

    const dE = pt.x - camWorld.x;
    const dN = -(pt.z - camWorld.z);
    const dU = pt.y - camWorld.y;

    const yawDeg = typeof camPose.heading === 'number' ? camPose.heading : (typeof camPose.yaw === 'number' ? camPose.yaw : 0.0);
    const psi = (yawDeg * Math.PI) / 180.0;
    const Xh = dE * Math.cos(psi) - dN * Math.sin(psi);
    const Yh = dE * Math.sin(psi) + dN * Math.cos(psi);
    const Zh = dU;

    const pitchDeg = typeof camPose.gimbalPitch === 'number' ? camPose.gimbalPitch : (typeof camPose.pitch === 'number' ? camPose.pitch : -90.0);
    const theta = (pitchDeg * Math.PI) / 180.0;
    const cosTheta = Math.cos(theta);
    const sinTheta = Math.sin(theta);

    const Xcam = Xh;
    const Ycam = Yh * cosTheta + Zh * sinTheta; // Optical depth in front of lens
    const Zcam = -Yh * sinTheta + Zh * cosTheta; // Vertical in camera sensor frame

    const sW = parseFloat(options.sensorWidthMm) || 9.6;
    const fL = parseFloat(options.focalLengthMm) || 6.72;
    const aspect = options.aspectRatio || (options.imageWidth && options.imageHeight ? options.imageWidth / options.imageHeight : (16 / 9));
    const sH = sW / aspect;

    const tanHalfH = sW / (2.0 * fL);
    const tanHalfV = sH / (2.0 * fL);

    const isInFront = Ycam > 0.05;
    const u = isInFront ? 0.5 + (Xcam / (2.0 * Ycam * tanHalfH)) : 0.5;
    const v = isInFront ? 0.5 - (Zcam / (2.0 * Ycam * tanHalfV)) : 0.5;
    const isInsideFrame = isInFront && (u >= 0.0 && u <= 1.0 && v >= 0.0 && v <= 1.0);

    return {
      Xcam,
      Ycam,
      Zcam,
      isInFront,
      isInsideFrame,
      u,
      v,
      tanHalfH,
      tanHalfV
    };
  },
  eventsBound: false,


  openPhoto(photoOrId, manifest = null, photoList = null) {
    return this.open(photoOrId, manifest, photoList);
  },

  open(photoOrId, manifest = null, photoList = null) {
    if (typeof document === 'undefined') return;
    const modal = document.getElementById('photo-inspector-modal');
    if (!modal) return;

    if (Array.isArray(photoList) && photoList.length > 0) {
      this.photoList = photoList;
    }

    if (manifest) this.activeManifest = manifest;
    else if (!this.activeManifest) {
      if (typeof activeInspectionManifest !== 'undefined' && activeInspectionManifest) {
        this.activeManifest = activeInspectionManifest;
      } else if (typeof FlightDiagnostics !== 'undefined' && FlightDiagnostics.activeInspectionManifest) {
        this.activeManifest = FlightDiagnostics.activeInspectionManifest;
      } else if (typeof FlightDiagnostics !== 'undefined' && FlightDiagnostics.flightManifest) {
        this.activeManifest = FlightDiagnostics.flightManifest;
      }
    }

    if (typeof photoOrId === 'object' && photoOrId !== null) {
      this.activePhoto = photoOrId;
    } else if (Array.isArray(this.photoList) && this.photoList.length > 0) {
      this.activePhoto = this.photoList.find(p => p.photoId === photoOrId || p.filename === photoOrId) || this.photoList[0];
    } else if (this.activeManifest && Array.isArray(this.activeManifest.photos)) {
      this.activePhoto = this.activeManifest.photos.find(p => p.photoId === photoOrId || p.filename === photoOrId) || this.activeManifest.photos[0];
    } else if (typeof FlightDiagnostics !== 'undefined' && Array.isArray(FlightDiagnostics.flightPhotos)) {
      this.activePhoto = FlightDiagnostics.flightPhotos.find(p => p.photoId === photoOrId || p.filename === photoOrId) || FlightDiagnostics.flightPhotos[0];
    }

    if (!this.activePhoto) {
      this.activePhoto = {
        photoId: 'PHOTO_0001',
        filename: 'DJI_0001.JPG',
        waypointIndex: 0,
        actual: { lat: 42.36012, lon: -71.05891, altAgl: 35.0, altMsl: 142.0, gimbalPitch: -45, heading: 90 },
        planned: { lat: 42.36012, lon: -71.05891, alt: 35.0, gimbalPitch: -45 },
        variance: { horizontalDeltaMeters: 0.18, verticalDeltaMeters: 0.08, isCompliant: true },
        gsd: { gsdCm: 0.88, gsdMeters: 0.0088 },
        annotations: []
      };
    }

    // Resolve authoritative camera pose: prioritize embedded XMP / photo file geotag metadata
    if (this.activePhoto) {
      if (!this.activePhoto.actual) this.activePhoto.actual = {};
      const act = this.activePhoto.actual;
      const xmp = this.activePhoto.xmp || null;
      if (xmp && typeof xmp.lat === 'number' && typeof xmp.lon === 'number' && (xmp.lat !== 0 || xmp.lon !== 0)) {
        act.lat = xmp.lat;
        act.lon = xmp.lon;
        if (xmp.altAgl !== undefined) act.altAgl = xmp.altAgl;
        if (xmp.alt !== undefined) act.alt = xmp.alt;
        if (xmp.altMsl !== undefined) act.altMsl = xmp.altMsl;
        if (xmp.gimbalPitch !== undefined) act.gimbalPitch = xmp.gimbalPitch;
        if (xmp.heading !== undefined) act.heading = xmp.heading;
      } else if (typeof this.activePhoto.lat === 'number' && typeof this.activePhoto.lon === 'number' && (this.activePhoto.lat !== 0 || this.activePhoto.lon !== 0)) {
        act.lat = this.activePhoto.lat;
        act.lon = this.activePhoto.lon;
        if (this.activePhoto.altAgl !== undefined) act.altAgl = this.activePhoto.altAgl;
        if (this.activePhoto.alt !== undefined) act.alt = this.activePhoto.alt;
        if (this.activePhoto.gimbalPitch !== undefined) act.gimbalPitch = this.activePhoto.gimbalPitch;
        if (this.activePhoto.heading !== undefined) act.heading = this.activePhoto.heading;
      }
    }

    if (!this.activePhoto.annotations) this.activePhoto.annotations = [];

    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.activeBoundaryPoints = [];
    this.activeMeasurePoints = [];
    this.activeArrowStart = null;
    this.activeBoxStart = null;

    this.updateHeaderUI();
    this.updateDrawerUI();

    const imgEl = document.getElementById('photo-inspector-img');
    const canvas = document.getElementById('photo-annotation-canvas');

    const apiBase = (typeof getCompanionApiBase === 'function')
      ? getCompanionApiBase()
      : (typeof COMPANION_API_BASE !== 'undefined' ? COMPANION_API_BASE : 'http://127.0.0.1:8765');

    const manifestUuid = (this.activeManifest && this.activeManifest.missionUuid)
      || (typeof FlightDiagnostics !== 'undefined' && FlightDiagnostics.activeInspectionManifest?.missionUuid)
      || (typeof FlightDiagnostics !== 'undefined' && FlightDiagnostics.flightManifest?.missionUuid)
      || (typeof FlightDiagnostics !== 'undefined' && FlightDiagnostics.currentLoadedMission?.uuid)
      || (typeof activeLayerId !== 'undefined' && activeLayerId)
      || 'layer-1';

    let imgSrc = this.activePhoto.previewUrl || '';
    if (!imgSrc && this.activePhoto.rawPath && typeof this.activePhoto.rawPath === 'string' && !this.activePhoto.rawPath.includes(':') && !this.activePhoto.rawPath.startsWith('\\\\')) {
      imgSrc = this.activePhoto.rawPath;
    }
    if (!imgSrc && this.activePhoto.filename && (this.activePhoto.filename.endsWith('.JPG') || this.activePhoto.filename.endsWith('.jpg') || this.activePhoto.filename.endsWith('.PNG') || this.activePhoto.filename.endsWith('.png'))) {
      imgSrc = `/scratch/mission_archives/${manifestUuid}/photos/previews/${encodeURIComponent(this.activePhoto.filename)}`;
    }
    if (imgSrc && !imgSrc.startsWith('http://') && !imgSrc.startsWith('https://') && !imgSrc.startsWith('data:')) {
      imgSrc = `${apiBase}${imgSrc.startsWith('/') ? '' : '/'}${imgSrc}`;
    }
    if (imgSrc) {
      this.activePhoto.previewUrl = imgSrc;
    }

    if (!this.wireframeData && manifestUuid && typeof fetch !== 'undefined' && apiBase) {
      fetch(`${apiBase}/scratch/mission_archives/${manifestUuid}/wireframe.json`)
        .then(r => r.ok ? r.json() : null)
        .then(wfData => {
          if (wfData && (wfData.lines || wfData.perPhotoLines)) {
            this.wireframeData = wfData;
            if (this.activePhoto) {
              const pk = this.activePhoto.filename || this.activePhoto.photoId || '';
              const pl = wfData.perPhotoLines && (wfData.perPhotoLines[pk] || wfData.perPhotoLines[this.activePhoto.filename] || wfData.perPhotoLines[this.activePhoto.photoId]);
              if (pl && pl.length > 0 && (!this.activePhoto.detectedLines || this.activePhoto.detectedLines.length === 0)) {
                this.activePhoto.detectedLines = pl;
              }
              try { this.renderCanvas(); } catch (_) {}
              const pill = document.getElementById('photo-detect-wireframe-pill');
              if (pill && this.activePhoto.detectedLines?.length > 0) {
                pill.style.display = 'inline-flex';
                pill.textContent = `🏗️ ${this.activePhoto.detectedLines.length} House Lines`;
              }
            }
          }
        })
        .catch(() => {});
    }
    
    if (imgEl) {
      try {
        imgEl.crossOrigin = 'anonymous';
      } catch (_) {}
      let triedRaw = false;
      let triedRelative = false;
      let triedPlaceholder = false;

      imgEl.onerror = () => {
        // Step 1: If URL had apiBase, try relative path directly
        if (!triedRelative && imgSrc && imgSrc.startsWith('http')) {
          triedRelative = true;
          const relPath = imgSrc.replace(/^https?:\/\/[^/]+/, '');
          if (relPath && relPath !== imgSrc) {
            try { imgEl.crossOrigin = 'anonymous'; } catch (_) {}
            imgEl.src = relPath;
            return;
          }
        }
        // Step 2: Try high-resolution raw photo from companion
        if (!triedRaw && this.activePhoto.filename && manifestUuid) {
          triedRaw = true;
          try { imgEl.crossOrigin = 'anonymous'; } catch (_) {}
          imgEl.src = `${apiBase}/scratch/mission_archives/${manifestUuid}/photos/raw/${encodeURIComponent(this.activePhoto.filename)}`;
          return;
        }
        // Step 3: Fallback to styled SVG placeholder
        if (!triedPlaceholder) {
          triedPlaceholder = true;
          try { imgEl.removeAttribute('crossorigin'); } catch (_) {}
          imgEl.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect width="100%" height="100%" fill="%230f172a"/><text x="50%" y="50%" fill="%2338bdf8" font-size="32" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif">📸 Photo Preview Not Available • ' + (this.activePhoto.filename || 'DJI_0001.JPG') + '</text></svg>';
        }
      };

      imgEl.onload = () => {
        if (canvas) {
          canvas.width = imgEl.naturalWidth || 1920;
          canvas.height = imgEl.naturalHeight || 1080;
        }
        this.fitToViewport();
        this.renderCanvas();

        // If coordinates are 0, dynamically fetch JPEG header to extract embedded DJI XMP metadata
        if (this.activePhoto && (!this.activePhoto.actual?.lat && !this.activePhoto.actual?.lon) && imgSrc && !imgSrc.startsWith('data:') && typeof fetch !== 'undefined') {
          fetch(imgSrc)
            .then(res => res.arrayBuffer())
            .then(ab => {
              const xmp = extractDjiXmpMetadata(ab);
              if (xmp && typeof xmp.lat === 'number' && typeof xmp.lon === 'number' && (xmp.lat !== 0 || xmp.lon !== 0)) {
                if (!this.activePhoto.actual) this.activePhoto.actual = {};
                this.activePhoto.actual.lat = xmp.lat;
                this.activePhoto.actual.lon = xmp.lon;
                if (xmp.altAgl !== undefined) this.activePhoto.actual.altAgl = xmp.altAgl;
                if (xmp.alt !== undefined) this.activePhoto.actual.alt = xmp.alt;
                if (xmp.altMsl !== undefined) this.activePhoto.actual.altMsl = xmp.altMsl;
                if (xmp.gimbalPitch !== undefined) this.activePhoto.actual.gimbalPitch = xmp.gimbalPitch;
                if (xmp.heading !== undefined) this.activePhoto.actual.heading = xmp.heading;
                this.updateHeaderUI();
                this.renderCanvas();
              }
            })
            .catch(() => {});
        }
      };

      if (!imgSrc) {
        try { imgEl.removeAttribute('crossorigin'); } catch (_) {}
        imgEl.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect width="100%" height="100%" fill="%230f172a"/><text x="50%" y="50%" fill="%2338bdf8" font-size="32" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif">📸 Photo Preview Not Available • ' + (this.activePhoto.filename || 'DJI_0001.JPG') + '</text></svg>';
      } else {
        try { imgEl.crossOrigin = 'anonymous'; } catch (_) {}
        imgEl.src = imgSrc;
        if (imgEl.complete && imgEl.naturalWidth > 0) {
          if (canvas) {
            canvas.width = imgEl.naturalWidth || 1920;
            canvas.height = imgEl.naturalHeight || 1080;
          }
          this.fitToViewport();
          this.renderCanvas();
        }
      }
    }

    modal.classList.remove('hidden');
    this.setupEvents();
  },

  close() {
    if (typeof document === 'undefined') return;
    const modal = document.getElementById('photo-inspector-modal');
    if (modal) modal.classList.add('hidden');
  },

  updateHeaderUI() {
    if (!this.activePhoto) return;
    const p = this.activePhoto;
    const fnEl = document.getElementById('inspector-filename-text');
    const wpBadge = document.getElementById('inspector-wp-badge');
    const subEl = document.getElementById('inspector-photo-sub');
    const dot = document.getElementById('inspector-severity-dot');
    const varText = document.getElementById('inspector-variance-text');
    const planeToggleBtn = document.getElementById('inspector-plane-toggle-btn');

    const photoList = this.getPhotoList();
    const currentIdx = this.getCurrentPhotoIndex();
    const totalCount = photoList.length > 0 ? photoList.length : 1;
    const displayIdx = currentIdx >= 0 ? currentIdx + 1 : 1;

    const counterBadge = document.getElementById('photo-inspector-counter-badge');
    if (counterBadge) {
      counterBadge.textContent = `Photo ${displayIdx} of ${totalCount}`;
    }

    const prevBtn = document.getElementById('photo-inspector-prev-btn');
    const nextBtn = document.getElementById('photo-inspector-next-btn');
    const viewportPrevBtn = document.getElementById('photo-viewport-prev-btn');
    const viewportNextBtn = document.getElementById('photo-viewport-next-btn');

    const canGoPrev = currentIdx > 0;
    const canGoNext = currentIdx >= 0 && currentIdx < totalCount - 1;

    if (prevBtn) prevBtn.disabled = !canGoPrev;
    if (nextBtn) nextBtn.disabled = !canGoNext;
    if (viewportPrevBtn) viewportPrevBtn.disabled = !canGoPrev;
    if (viewportNextBtn) viewportNextBtn.disabled = !canGoNext;

    if (fnEl) fnEl.textContent = p.filename || 'DJI_0001.JPG';
    if (wpBadge) wpBadge.textContent = `WP #${p.waypointIndex !== undefined ? p.waypointIndex : '—'}`;
    
    const altVal = this.unit === 'imperial' ? Math.round((p.actual.altAgl || 30) * 3.28084) + ' ft' : (p.actual.altAgl || 30) + 'm';
    const gsdVal = this.unit === 'imperial' ? ((p.gsd ? p.gsd.gsdCm : 0.9) / 2.54).toFixed(2) + ' in/px' : (p.gsd ? p.gsd.gsdCm : 0.9) + ' cm/px';
    const pitch = (p.actual && p.actual.gimbalPitch !== undefined) ? p.actual.gimbalPitch : -90;
    const isOblique = Math.abs(pitch + 90) > 2;
    const modeTag = isOblique ? (this.calibrationMode === 'slant' ? ' • Slant Calibrated' : ' • Ground Corrected') : '';
    if (subEl) {
      subEl.textContent = `Lat: ${p.actual.lat.toFixed(5)}° • Lon: ${p.actual.lon.toFixed(5)}° • Alt: ${altVal} AGL • Pitch: ${p.actual.gimbalPitch}° • GSD: ${gsdVal}${modeTag}`;
    }

    const tagPill = document.getElementById('photo-detect-status-pill');
    if (tagPill) {
      const tags = (p.detectedTags && Array.isArray(p.detectedTags)) ? p.detectedTags : [];
      if (tags.length > 0) {
        tagPill.style.display = 'inline-flex';
        tagPill.textContent = `🏷️ ${tags.length} Tag${tags.length === 1 ? '' : 's'}`;
      } else {
        tagPill.style.display = 'none';
      }
    }

    const wfPill = document.getElementById('photo-detect-wireframe-pill');
    if (wfPill) {
      const wf = this.wireframeData
        || (typeof FlightDiagnostics !== 'undefined' && FlightDiagnostics.wireframeData)
        || this.activeManifest?.wireframe
        || (typeof activeInspectionManifest !== 'undefined' && activeInspectionManifest?.wireframe)
        || null;
      const pKey = p.filename || p.photoId || '';
      const photoLines = (p.detectedLines && Array.isArray(p.detectedLines))
        ? p.detectedLines
        : ((wf && wf.perPhotoLines && (wf.perPhotoLines[pKey] || wf.perPhotoLines[p.filename] || wf.perPhotoLines[p.photoId])) || []);
      if (photoLines.length > 0) {
        wfPill.style.display = 'inline-flex';
        wfPill.textContent = `🏗️ ${photoLines.length} House Lines`;
      } else {
        wfPill.style.display = 'none';
      }
    }

    if (planeToggleBtn) {
      planeToggleBtn.textContent = this.calibrationMode === 'slant' ? '🏠 Slant (Structure)' : '🌍 Flat Ground';
      planeToggleBtn.title = this.calibrationMode === 'slant'
        ? 'Current: Slant Optical Plane (Elevated Structures & Roofs). Click to switch to Flat Ground.'
        : 'Current: Flat Ground Plane (Terrain & Driveways). Click to switch to Slant Structure Plane.';
    }

    const isComp = p.variance ? p.variance.isCompliant : true;
    if (dot) dot.style.background = isComp ? '#10b981' : '#f59e0b';
    if (varText) {
      const hDelta = p.variance ? p.variance.horizontalDeltaMeters : 0;
      const vDelta = p.variance ? p.variance.verticalDeltaMeters : 0;
      const hStr = this.unit === 'imperial' ? (hDelta * 3.28084).toFixed(2) + 'ft' : hDelta + 'm';
      const vStr = this.unit === 'imperial' ? (vDelta * 3.28084).toFixed(2) + 'ft' : vDelta + 'm';
      varText.textContent = `ΔH: ${hStr} • ΔV: ${vStr} (${isComp ? 'Compliant' : 'Warning'})`;
    }

    const hudWp = document.getElementById('hud-wp-index');
    const hudCoord = document.getElementById('hud-coordinates');
    const hudAlt = document.getElementById('hud-altitudes');
    const hudOpt = document.getElementById('hud-optics');
    const hudGsd = document.getElementById('hud-gsd');
    const hudTs = document.getElementById('hud-timestamp');

    if (hudWp) hudWp.textContent = `WP: #${p.waypointIndex}`;
    if (hudCoord) hudCoord.textContent = `Lat: ${p.actual.lat.toFixed(6)}° Lon: ${p.actual.lon.toFixed(6)}°`;
    if (hudAlt) hudAlt.textContent = `Alt: ${altVal} AGL`;
    if (hudOpt) hudOpt.textContent = `Gimbal: ${p.actual.gimbalPitch}° Yaw: ${p.actual.heading}°`;
    if (hudGsd) hudGsd.textContent = isOblique ? (this.calibrationMode === 'slant' ? `GSD: ${gsdVal} (Slant Calibrated)` : `GSD: ${gsdVal} (3D Tilt Corrected)`) : `GSD: ${gsdVal}`;
    if (hudTs) hudTs.textContent = p.timestamp ? p.timestamp.replace('T', ' ').slice(0, 19) + ' UTC' : '2026-09-12 14:02:30 UTC';
  },

  updateDrawerUI() {
    if (!this.activePhoto) return;
    const notesList = document.getElementById('defect-notes-list');
    const countBadge = document.getElementById('defect-count-badge');
    const boundaryBox = document.getElementById('boundary-metrics-box');
    const perimEl = document.getElementById('boundary-perimeter-val');
    const areaEl = document.getElementById('boundary-area-val');
    const slantBtn = document.getElementById('plane-btn-slant');
    const groundBtn = document.getElementById('plane-btn-ground');
    const heightInput = document.getElementById('inspector-target-height-input');
    const heightUnit = document.getElementById('inspector-target-height-unit');

    if (slantBtn && groundBtn) {
      if (this.calibrationMode === 'slant') {
        slantBtn.classList.add('active');
        slantBtn.classList.remove('btn-secondary');
        slantBtn.classList.add('btn-primary');
        groundBtn.classList.remove('active');
        groundBtn.classList.remove('btn-primary');
        groundBtn.classList.add('btn-secondary');
      } else {
        groundBtn.classList.add('active');
        groundBtn.classList.remove('btn-secondary');
        groundBtn.classList.add('btn-primary');
        slantBtn.classList.remove('active');
        slantBtn.classList.remove('btn-primary');
        slantBtn.classList.add('btn-secondary');
      }
    }

    if (heightUnit) {
      heightUnit.textContent = this.unit === 'imperial' ? 'ft' : 'm';
    }
    if (heightInput && document.activeElement !== heightInput) {
      const dispH = this.unit === 'imperial' ? Math.round(this.targetHeight * 3.28084 * 10) / 10 : Math.round(this.targetHeight * 10) / 10;
      heightInput.value = dispH;
    }

    const annotations = this.activePhoto.annotations || [];
    const pins = annotations.filter(a => a.type === 'pin');
    const boundaries = annotations.filter(a => a.type === 'boundary');

    if (countBadge) {
      countBadge.textContent = `${annotations.length} Item(s)`;
      countBadge.style.background = pins.some(p => p.severity === 'critical') ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)';
      countBadge.style.color = pins.some(p => p.severity === 'critical') ? '#f87171' : '#34d399';
    }

    if (notesList) {
      notesList.innerHTML = '';
      if (annotations.length === 0) {
        notesList.innerHTML = '<div style="font-size: 0.74rem; color: var(--text-muted); font-style: italic;">No defects marked yet. Select a marker tool to annotate.</div>';
      } else {
        annotations.forEach((ann, idx) => {
          const card = document.createElement('div');
          card.className = `defect-note-card is-${ann.severity || 'info'}`;
          let cardTitle = `🔘 #${idx + 1} ${ann.title || 'Observation'}`;
          let cardDesc = ann.description || ann.details || 'No description entered.';
          if (ann.type === 'boundary') {
            cardTitle = '📐 Boundary Line';
            const polyRes = this.calculateGroundPolygon(ann.points);
            if (this.unit === 'imperial') {
              cardDesc = `${polyRes.perimeterFt} ft perimeter • ${polyRes.areaSqFt} sq ft`;
            } else {
              cardDesc = `${polyRes.perimeterMeters} m perimeter • ${polyRes.areaM2} m²`;
            }
          } else if (ann.type === 'measure') {
            const dM = this.calculateGroundDistance(ann.p1, ann.p2);
            const dStr = this.unit === 'imperial' ? `${(dM * 3.28084).toFixed(2)} ft` : `${dM.toFixed(2)} m`;
            cardTitle = `📏 Measurement: ${dStr}`;
            const pitch = (this.activePhoto?.actual?.gimbalPitch !== undefined) ? this.activePhoto.actual.gimbalPitch : -90;
            const isOblique = Math.abs(pitch + 90) > 2;
            const modeName = this.calibrationMode === 'slant' ? 'Structure Slant Plane' : 'Ground Plane';
            cardDesc = isOblique ? `${modeName} corrected (${pitch}° pitch)` : 'Planar nadir calibrated';
          }
          card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <strong>${cardTitle}</strong>
              <button type="button" class="btn-secondary btn-sm" style="padding: 1px 4px; font-size: 0.65rem; color: #ef4444;" title="Delete Annotation">✕</button>
            </div>
            <div style="color: var(--text-muted); font-size: 0.72rem;">${cardDesc}</div>
          `;
          const delBtn = card.querySelector('button');
          if (delBtn) {
            delBtn.onclick = (e) => {
              e.stopPropagation();
              this.activePhoto.annotations.splice(idx, 1);
              this.updateDrawerUI();
              this.renderCanvas();
            };
          }
          notesList.appendChild(card);
        });
      }
    }

    if (boundaryBox) {
      if (boundaries.length > 0) {
        boundaryBox.style.display = 'block';
        const lastB = boundaries[boundaries.length - 1];
        const polyRes = this.calculateGroundPolygon(lastB.points);
        if (perimEl) perimEl.textContent = this.unit === 'imperial' ? `${polyRes.perimeterFt || 0} ft` : `${polyRes.perimeterMeters || 0} m`;
        if (areaEl) areaEl.textContent = this.unit === 'imperial' ? `${polyRes.areaSqFt || 0} sq ft` : `${polyRes.areaM2 || 0} m²`;
      } else {
        boundaryBox.style.display = 'none';
      }
    }

    const tagBox = document.getElementById('detected-tags-box');
    const tagList = document.getElementById('detected-tags-list');
    const tagCountBadge = document.getElementById('detected-tags-count-badge');
    if (tagBox && tagList) {
      const tags = (this.activePhoto && Array.isArray(this.activePhoto.detectedTags)) ? this.activePhoto.detectedTags : [];
      if (tags.length > 0) {
        tagBox.style.display = 'block';
        if (tagCountBadge) tagCountBadge.textContent = `${tags.length} Detected`;
        tagList.innerHTML = tags.map(t => {
          const fam = (t.family || 'Tag').replace('apriltag_', 'AprilTag ').replace('aruco_', 'ArUco ');
          const rot = typeof t.rotationDeg === 'number' ? `${Math.round(t.rotationDeg)}°` : '—';
          const cx = t.center ? Math.round(t.center.x) : '—';
          const cy = t.center ? Math.round(t.center.y) : '—';
          const matchInfo = t.matchedGcp
            ? `<div style="color: #34d399; font-weight: 600; margin-top: 2px;">🎯 Matched ${t.matchedGcp.code || 'GCP'} (Δ: ${t.matchedGcp.varianceCm}cm / ${t.matchedGcp.variancePx}px)</div>`
            : `<div style="color: #94a3b8; font-size: 0.68rem; margin-top: 2px;">Unmatched Ground Target</div>`;
          return `
            <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(34, 197, 94, 0.25); border-radius: 4px; padding: 6px 8px;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <strong style="color: #4ade80;">🏷️ ${fam} #${t.id}</strong>
                <span style="font-size: 0.68rem; color: #a7f3d0;">Rot: ${rot}</span>
              </div>
              <div style="font-size: 0.68rem; color: #cbd5e1; font-family: monospace;">Pixel: (${cx}, ${cy})</div>
              ${matchInfo}
            </div>
          `;
        }).join('');
      } else {
        tagBox.style.display = 'none';
        tagList.innerHTML = '';
      }
    }
  },

  projectPixelToGround(normX, normY) {
    if (!this.activePhoto) return { x: 0, y: 0 };
    const p = this.activePhoto;
    const rawAlt = (p.actual && typeof p.actual.altAgl === 'number' && p.actual.altAgl > 0) ? p.actual.altAgl : 25.0;
    const targetH = typeof this.targetHeight === 'number' ? this.targetHeight : 0;
    const alt = Math.max(0.5, rawAlt - targetH);
    const pitch = (p.actual && typeof p.actual.gimbalPitch === 'number') ? p.actual.gimbalPitch : -90;

    let tiltDeg;
    if (pitch <= 0) {
      tiltDeg = Math.min(85, Math.max(0, 90 + pitch));
    } else {
      tiltDeg = Math.min(85, Math.max(0, Math.abs(90 - pitch)));
    }
    const tau = tiltDeg * (Math.PI / 180);

    const sW = p.sensorWidthMm || 9.6;
    const fL = p.focalLengthMm || 6.72;
    const canvas = (typeof document !== 'undefined') ? document.getElementById('photo-annotation-canvas') : null;
    const aspect = (canvas && canvas.width && canvas.height) ? (canvas.width / canvas.height) : (4 / 3);
    const sH = sW / aspect;

    const tanHalfH = sW / (2 * fL);
    const tanHalfV = sH / (2 * fL);

    const xc = (2 * normX - 1) * tanHalfH;
    const yc = (1 - 2 * normY) * tanHalfV;

    const cosTau = Math.cos(tau);
    const sinTau = Math.sin(tau);

    const dX = xc;
    const dY = yc * cosTau + sinTau;
    const dZ = yc * sinTau - cosTau;

    const safeDz = Math.min(-0.01, dZ);
    const t = -alt / safeDz;

    return {
      x: t * dX,
      y: t * dY,
      slantRangeMeters: t * Math.sqrt(dX * dX + dY * dY + safeDz * safeDz)
    };
  },

  calculateGroundDistance(p1, p2) {
    if (!p1 || !p2) return 0;
    if (!this.activePhoto) return 0;
    const p = this.activePhoto;
    const rawAlt = (p.actual && typeof p.actual.altAgl === 'number' && p.actual.altAgl > 0) ? p.actual.altAgl : 25.0;
    const targetH = typeof this.targetHeight === 'number' ? this.targetHeight : 0;
    const alt = Math.max(0.5, rawAlt - targetH);
    const pitch = (p.actual && typeof p.actual.gimbalPitch === 'number') ? p.actual.gimbalPitch : -90;

    let tiltDeg;
    if (pitch <= 0) {
      tiltDeg = Math.min(85, Math.max(0, 90 + pitch));
    } else {
      tiltDeg = Math.min(85, Math.max(0, Math.abs(90 - pitch)));
    }
    const tau = tiltDeg * (Math.PI / 180);

    const sW = p.sensorWidthMm || 9.6;
    const fL = p.focalLengthMm || 6.72;
    const canvas = (typeof document !== 'undefined') ? document.getElementById('photo-annotation-canvas') : null;
    const aspect = (canvas && canvas.width && canvas.height) ? (canvas.width / canvas.height) : (4 / 3);
    const sH = sW / aspect;

    const tanHalfH = sW / (2 * fL);
    const tanHalfV = sH / (2 * fL);

    if (this.calibrationMode === 'slant') {
      const cosTau = Math.max(0.087, Math.cos(tau));
      const dSlant = alt / cosTau;
      const xc1 = (2 * p1.x - 1) * tanHalfH;
      const yc1 = (1 - 2 * p1.y) * tanHalfV;
      const xc2 = (2 * p2.x - 1) * tanHalfH;
      const yc2 = (1 - 2 * p2.y) * tanHalfV;
      const dx = (xc2 - xc1) * dSlant;
      const dy = (yc2 - yc1) * dSlant;
      return Math.sqrt(dx * dx + dy * dy);
    }

    // mode === 'ground': full 3D Ray-to-Ground Plane intersection
    const g1 = this.projectPixelToGround(p1.x, p1.y);
    const g2 = this.projectPixelToGround(p2.x, p2.y);
    const dx = g2.x - g1.x;
    const dy = g2.y - g1.y;
    return Math.sqrt(dx * dx + dy * dy);
  },

  calculateGroundPolygon(points) {
    if (!Array.isArray(points) || points.length < 2) {
      return { perimeterMeters: 0, perimeterFt: 0, areaM2: 0, areaSqFt: 0, segments: [] };
    }
    let groundPts;
    if (this.calibrationMode === 'slant') {
      const p = this.activePhoto || {};
      const rawAlt = (p.actual && typeof p.actual.altAgl === 'number' && p.actual.altAgl > 0) ? p.actual.altAgl : 25.0;
      const targetH = typeof this.targetHeight === 'number' ? this.targetHeight : 0;
      const alt = Math.max(0.5, rawAlt - targetH);
      const pitch = (p.actual && typeof p.actual.gimbalPitch === 'number') ? p.actual.gimbalPitch : -90;

      let tiltDeg;
      if (pitch <= 0) {
        tiltDeg = Math.min(85, Math.max(0, 90 + pitch));
      } else {
        tiltDeg = Math.min(85, Math.max(0, Math.abs(90 - pitch)));
      }
      const tau = tiltDeg * (Math.PI / 180);
      const cosTau = Math.max(0.087, Math.cos(tau));
      const dSlant = alt / cosTau;

      const sW = p.sensorWidthMm || 9.6;
      const fL = p.focalLengthMm || 6.72;
      const canvas = (typeof document !== 'undefined') ? document.getElementById('photo-annotation-canvas') : null;
      const aspect = (canvas && canvas.width && canvas.height) ? (canvas.width / canvas.height) : (4 / 3);
      const sH = sW / aspect;

      const tanHalfH = sW / (2 * fL);
      const tanHalfV = sH / (2 * fL);

      groundPts = points.map(pt => ({
        x: (2 * pt.x - 1) * tanHalfH * dSlant,
        y: (1 - 2 * pt.y) * tanHalfV * dSlant
      }));
    } else {
      groundPts = points.map(pt => this.projectPixelToGround(pt.x, pt.y));
    }
    const segments = [];
    let perimeter = 0;

    for (let i = 0; i < groundPts.length - 1; i++) {
      const dx = groundPts[i + 1].x - groundPts[i].x;
      const dy = groundPts[i + 1].y - groundPts[i].y;
      const lenM = Math.sqrt(dx * dx + dy * dy);
      segments.push({
        fromIndex: i,
        toIndex: i + 1,
        lengthMeters: Math.round(lenM * 100) / 100,
        lengthFt: Math.round(lenM * 3.28084 * 100) / 100
      });
      perimeter += lenM;
    }

    if (points.length >= 3) {
      const dx = groundPts[0].x - groundPts[groundPts.length - 1].x;
      const dy = groundPts[0].y - groundPts[groundPts.length - 1].y;
      const closingLen = Math.sqrt(dx * dx + dy * dy);
      segments.push({
        fromIndex: groundPts.length - 1,
        toIndex: 0,
        lengthMeters: Math.round(closingLen * 100) / 100,
        lengthFt: Math.round(closingLen * 3.28084 * 100) / 100
      });
      perimeter += closingLen;
    }

    let area = 0;
    if (groundPts.length >= 3) {
      let sum = 0;
      for (let i = 0; i < groundPts.length; i++) {
        const j = (i + 1) % groundPts.length;
        sum += groundPts[i].x * groundPts[j].y - groundPts[j].x * groundPts[i].y;
      }
      area = Math.abs(sum) / 2;
    }

    return {
      perimeterMeters: Math.round(perimeter * 10) / 10,
      perimeterFt: Math.round(perimeter * 3.28084 * 10) / 10,
      areaM2: Math.round(area * 10) / 10,
      areaSqFt: Math.round(area * 10.7639 * 10) / 10,
      segments
    };
  },

  fitToViewport() {
    const vp = document.getElementById('photo-viewport-container');
    const imgEl = document.getElementById('photo-inspector-img');
    if (!vp || !imgEl) return;
    const vpW = vp.clientWidth || 800;
    const vpH = vp.clientHeight || 600;
    const imgW = imgEl.naturalWidth || 1920;
    const imgH = imgEl.naturalHeight || 1080;

    const scale = Math.min((vpW - 40) / imgW, (vpH - 40) / imgH, 1.0);
    this.zoom = Math.max(0.1, scale);
    this.panX = Math.round((vpW - imgW * this.zoom) / 2);
    this.panY = Math.round((vpH - imgH * this.zoom) / 2);
    this.applyTransform();
  },

  applyTransform() {
    const layer = document.getElementById('photo-transform-layer');
    if (layer) {
      layer.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
    }
  },

  renderCanvas() {
    const canvas = document.getElementById('photo-annotation-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!this.activePhoto) return;

    const annotations = this.activePhoto.annotations || [];

    // 1. Waypoint Aim Reticle (Center Crosshairs)
    if (this.layers.reticle) {
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      ctx.save();
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.arc(cx, cy, 40, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - 60, cy); ctx.lineTo(cx + 60, cy);
      ctx.moveTo(cx, cy - 60); ctx.lineTo(cx, cy + 60);
      ctx.stroke();
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText('🎯 Planned Aim Point', cx + 15, cy - 15);
      ctx.restore();
    }

    // 2. Boundary Lines & Perimeters
    if (this.layers.boundary) {
      annotations.filter(a => a.type === 'boundary').forEach(b => {
        if (!b.points || b.points.length < 2) return;
        ctx.save();
        ctx.strokeStyle = b.color || '#f59e0b';
        ctx.lineWidth = 3;
        ctx.fillStyle = (b.color || '#f59e0b') + '22';
        ctx.beginPath();
        b.points.forEach((p, i) => {
          const px = p.x * canvas.width;
          const py = p.y * canvas.height;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        if (b.isClosed) ctx.closePath();
        if (b.isClosed) ctx.fill();
        ctx.stroke();

        ctx.font = 'bold 12px sans-serif';
        for (let i = 0; i < b.points.length - 1; i++) {
          const p1 = b.points[i];
          const p2 = b.points[i + 1];
          const mx = ((p1.x + p2.x) / 2) * canvas.width;
          const my = ((p1.y + p2.y) / 2) * canvas.height;
          const dMeters = this.calculateGroundDistance(p1, p2);
          const distStr = this.unit === 'imperial' ? `${(dMeters * 3.28084).toFixed(1)} ft` : `${dMeters.toFixed(1)} m`;

          ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
          ctx.fillRect(mx - 28, my - 10, 56, 20);
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(distStr, mx, my);
        }
        ctx.restore();
      });

      if (this.activeBoundaryPoints.length > 0) {
        ctx.save();
        ctx.strokeStyle = this.currentColor || '#f59e0b';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        this.activeBoundaryPoints.forEach((p, i) => {
          const px = p.x * canvas.width;
          const py = p.y * canvas.height;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.stroke();
        ctx.restore();
      }
    }

    // 3. Caliper Measurements
    if (this.layers.measure) {
      annotations.filter(a => a.type === 'measure').forEach(m => {
        if (!m.p1 || !m.p2) return;
        const x1 = m.p1.x * canvas.width;
        const y1 = m.p1.y * canvas.height;
        const x2 = m.p2.x * canvas.width;
        const y2 = m.p2.y * canvas.height;
        ctx.save();
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
        ctx.stroke();
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const perp = angle + Math.PI / 2;
        [ { x: x1, y: y1 }, { x: x2, y: y2 } ].forEach(pt => {
          ctx.beginPath();
          ctx.moveTo(pt.x - Math.cos(perp) * 8, pt.y - Math.sin(perp) * 8);
          ctx.lineTo(pt.x + Math.cos(perp) * 8, pt.y + Math.sin(perp) * 8);
          ctx.stroke();
        });
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        const distM = this.calculateGroundDistance(m.p1, m.p2);
        const distStr = this.unit === 'imperial' ? `${(distM * 3.28084).toFixed(2)} ft` : `${distM.toFixed(2)} m`;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.fillRect(mx - 36, my - 11, 72, 22);
        ctx.strokeStyle = '#38bdf8';
        ctx.strokeRect(mx - 36, my - 11, 72, 22);
        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`📏 ${distStr}`, mx, my);
        ctx.restore();
      });
    }


    // 4. Directional Arrows
    annotations.filter(a => a.type === 'arrow').forEach(arr => {
      const x1 = arr.x1 * canvas.width;
      const y1 = arr.y1 * canvas.height;
      const x2 = arr.x2 * canvas.width;
      const y2 = arr.y2 * canvas.height;
      ctx.save();
      ctx.strokeStyle = arr.color || '#ef4444';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
      ctx.stroke();
      const a = Math.atan2(y2 - y1, x2 - x1);
      ctx.fillStyle = arr.color || '#ef4444';
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - 15 * Math.cos(a - Math.PI / 6), y2 - 15 * Math.sin(a - Math.PI / 6));
      ctx.lineTo(x2 - 15 * Math.cos(a + Math.PI / 6), y2 - 15 * Math.sin(a + Math.PI / 6));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    });

    // 5. Bounding Boxes
    annotations.filter(a => a.type === 'box').forEach(b => {
      const bx = b.x * canvas.width;
      const by = b.y * canvas.height;
      const bw = b.w * canvas.width;
      const bh = b.h * canvas.height;
      ctx.save();
      ctx.strokeStyle = b.color || '#f59e0b';
      ctx.lineWidth = 2;
      ctx.fillStyle = (b.color || '#f59e0b') + '22';
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeRect(bx, by, bw, bh);
      if (b.title) {
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillRect(bx, by - 18, ctx.measureText(b.title).width + 12, 18);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText(b.title, bx + 6, by - 5);
      }
      ctx.restore();
    });

    // 6. Defect Pins
    if (this.layers.pins) {
      annotations.filter(a => a.type === 'pin').forEach((p, idx) => {
        const px = p.x * canvas.width;
        const py = p.y * canvas.height;
        ctx.save();
        ctx.fillStyle = p.color || (p.severity === 'critical' ? '#ef4444' : (p.severity === 'warning' ? '#f59e0b' : '#38bdf8'));
        ctx.beginPath();
        ctx.arc(px, py, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(idx + 1), px, py);

        if (p.title) {
          ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
          const textW = ctx.measureText(p.title).width;
          ctx.fillRect(px + 18, py - 12, textW + 12, 22);
          ctx.strokeStyle = p.color || '#ef4444';
          ctx.lineWidth = 1;
          ctx.strokeRect(px + 18, py - 12, textW + 12, 22);
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'left';
          ctx.fillText(p.title, px + 24, py);
        }
        ctx.restore();
      });
    }

    // 7. Auto-Superimposed Flight Layer Boundary & Drawing Layers (v1.102.0)
    if (this.layers.layerBoundary) {
      const camPose = {
        lat: this.activePhoto.actual?.lat ?? this.activePhoto.planned?.lat ?? 0,
        lon: this.activePhoto.actual?.lon ?? this.activePhoto.planned?.lon ?? 0,
        altAgl: (this.activePhoto.actual?.altAgl && this.activePhoto.actual.altAgl > 0)
          ? this.activePhoto.actual.altAgl
          : (this.activePhoto.actual?.alt ?? this.activePhoto.planned?.alt ?? 25.0),
        gimbalPitch: (this.activePhoto.actual?.gimbalPitch !== undefined) ? this.activePhoto.actual.gimbalPitch : -90,
        heading: this.activePhoto.actual?.heading ?? this.activePhoto.planned?.heading ?? 0
      };

      const layersToProject = [];
      const allLayers = (typeof flightLayers !== 'undefined' && Array.isArray(flightLayers)) ? flightLayers : [];

      // Include all enabled drawing / parcel layers
      allLayers.filter(l => l.enabled && (l.pattern === 'boundary-polygon' || l.isDrawingLayer)).forEach(l => {
        const poly = (Array.isArray(l.boundaryPolygon) && l.boundaryPolygon.length >= 3)
          ? l.boundaryPolygon
          : (Array.isArray(l.polygonVertices) && l.polygonVertices.length >= 3 ? l.polygonVertices : []);
        if (poly.length >= 3) {
          layersToProject.push({
            layer: l,
            polygon: poly,
            name: l.name || 'Boundary / Parcel',
            strokeColor: l.strokeColor || '#06b6d4',
            lineStyle: l.lineStyle || 'dashed',
            fillOpacity: (typeof l.fillOpacity === 'number') ? l.fillOpacity / 100.0 : 0.15,
            targetHeight: (l.isElevated || l.isRoofBoundary) ? (typeof l.targetHeight === 'number' ? l.targetHeight : 0) : 0
          });
        }
      });

      // Also include activeLayer if it is not a drawing layer but has a boundary
      const activeLayer = (typeof getActiveLayer === 'function')
        ? getActiveLayer()
        : (allLayers.find(l => l.id === (typeof activeLayerId !== 'undefined' ? activeLayerId : null)) || allLayers[0]);

      if (activeLayer && activeLayer.enabled && !activeLayer.isDrawingLayer && activeLayer.pattern !== 'boundary-polygon') {
        const boundaryGeoPoly = this.getLayerBoundaryGeoPolygon(activeLayer);
        if (boundaryGeoPoly && boundaryGeoPoly.length >= 3) {
          layersToProject.push({
            layer: activeLayer,
            polygon: boundaryGeoPoly,
            name: `${activeLayer.name || 'Layer'} Boundary`,
            strokeColor: activeLayer.color || '#06b6d4',
            lineStyle: 'dashed',
            fillOpacity: 0.12,
            targetHeight: (activeLayer.isElevated || activeLayer.isRoofBoundary) ? (typeof this.targetHeight === 'number' ? this.targetHeight : 0) : 0
          });
        }
      }

      // Fallback 1: If no workspace boundary layers exist, check activeManifest or currentLoadedMission in FlightDiagnostics
      if (layersToProject.length === 0) {
        const manifestParcels = this.activeManifest?.parcels;
        const diagParcels = (typeof FlightDiagnostics !== 'undefined' && FlightDiagnostics.currentLoadedMission)
          ? (FlightDiagnostics.currentLoadedMission.parcels || FlightDiagnostics.currentLoadedMission.plan?.parcels)
          : null;
        const mParcels = (Array.isArray(manifestParcels) && manifestParcels.length > 0) ? manifestParcels : diagParcels;
        if (Array.isArray(mParcels)) {
          mParcels.forEach(p => {
            if (Array.isArray(p.polygon) && p.polygon.length >= 3) {
              layersToProject.push({
                polygon: p.polygon,
                name: p.layerName || 'Boundary / Parcel',
                strokeColor: p.strokeColor || '#06b6d4',
                lineStyle: p.lineStyle || 'dashed',
                fillOpacity: (typeof p.fillOpacity === 'number') ? p.fillOpacity / 100.0 : 0.15,
                targetHeight: (p.isElevated || p.isRoofBoundary) ? (p.targetHeight || 0) : 0
              });
            }
          });
        }
      }

      // Fallback 2: Check FlightDiagnostics planned waypoints (v1.115.3)
      if (layersToProject.length === 0 && typeof FlightDiagnostics !== 'undefined' && Array.isArray(FlightDiagnostics.plannedWaypoints) && FlightDiagnostics.plannedWaypoints.length >= 3) {
        const validWps = FlightDiagnostics.plannedWaypoints.filter(w => w && typeof w.lat === 'number' && typeof w.lon === 'number');
        if (validWps.length >= 3) {
          layersToProject.push({
            polygon: computeConvexHullGeo(validWps),
            name: 'Flight Mission Boundary',
            strokeColor: '#06b6d4',
            lineStyle: 'dashed',
            fillOpacity: 0.12,
            targetHeight: typeof this.targetHeight === 'number' ? this.targetHeight : 0
          });
        }
      }

      // Fallback 3: Check FlightDiagnostics telemetry points with photo triggers or flown path (v1.115.3)
      if (layersToProject.length === 0 && typeof FlightDiagnostics !== 'undefined' && FlightDiagnostics.telemetryData && Array.isArray(FlightDiagnostics.telemetryData.points)) {
        const photoPts = FlightDiagnostics.telemetryData.points.filter(p => p.isPhoto && typeof p.lat === 'number' && typeof p.lon === 'number');
        const ptsToUse = photoPts.length >= 3 ? photoPts : FlightDiagnostics.telemetryData.points.filter(p => typeof p.lat === 'number' && typeof p.lon === 'number');
        if (ptsToUse.length >= 3) {
          layersToProject.push({
            polygon: computeConvexHullGeo(ptsToUse),
            name: 'Flight Mission Boundary',
            strokeColor: '#06b6d4',
            lineStyle: 'dashed',
            fillOpacity: 0.12,
            targetHeight: typeof this.targetHeight === 'number' ? this.targetHeight : 0
          });
        }
      }


      layersToProject.forEach(item => {
        const projRes = this.projectGeoPolygonToPhoto(item.polygon, camPose, {
          sensorWidthMm: this.activePhoto.sensorWidthMm || 9.6,
          focalLengthMm: this.activePhoto.focalLengthMm || 6.72,
          aspectRatio: canvas.width / canvas.height,
          targetHeightMeters: item.targetHeight
        });

        if (projRes.hasPointsInFront) {
          ctx.save();
          ctx.strokeStyle = item.strokeColor;
          ctx.lineWidth = 2.5;
          const dash = item.lineStyle === 'solid' ? [] : (item.lineStyle === 'dotted' ? [3, 4] : [8, 4]);
          ctx.setLineDash(dash);

          let fillColor = 'rgba(6, 182, 212, 0.15)';
          if (item.strokeColor.startsWith('#') && item.strokeColor.length >= 7) {
            const r = parseInt(item.strokeColor.slice(1, 3), 16) || 6;
            const g = parseInt(item.strokeColor.slice(3, 5), 16) || 182;
            const b = parseInt(item.strokeColor.slice(5, 7), 16) || 212;
            fillColor = `rgba(${r}, ${g}, ${b}, ${item.fillOpacity})`;
          }
          ctx.fillStyle = fillColor;

          ctx.beginPath();
          projRes.points.forEach((p, idx) => {
            const px = p.u * canvas.width;
            const py = p.v * canvas.height;
            if (idx === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          });
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Draw vertex pins
          ctx.setLineDash([]);
          projRes.points.forEach((p) => {
            if (p.isInsideFrame) {
              const px = p.u * canvas.width;
              const py = p.v * canvas.height;
              ctx.fillStyle = item.strokeColor;
              ctx.beginPath();
              ctx.arc(px, py, 4.5, 0, Math.PI * 2);
              ctx.fill();
              ctx.strokeStyle = '#ffffff';
              ctx.lineWidth = 1.5;
              ctx.stroke();
            }
          });

          // Draw Layer Boundary Badge on first visible vertex or top corner
          const firstVis = projRes.points.find(p => p.isInsideFrame) || projRes.points[0];
          if (firstVis) {
            const bx = Math.max(10, Math.min(canvas.width - 160, firstVis.u * canvas.width));
            const by = Math.max(25, Math.min(canvas.height - 15, firstVis.v * canvas.height - 10));
            const layerLabel = `🗺️ ${item.name}`;
            ctx.font = 'bold 11px sans-serif';
            const badgeW = ctx.measureText(layerLabel).width + 16;
            ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
            ctx.fillRect(bx, by - 16, badgeW, 20);
            ctx.strokeStyle = item.strokeColor;
            ctx.lineWidth = 1;
            ctx.strokeRect(bx, by - 16, badgeW, 20);
            ctx.fillStyle = '#ffffff';
            ctx.fillText(layerLabel, bx + 8, by - 2);
          }
          ctx.restore();
        }
      });
    }

    // 7b. Auto-Superimposed 3D Architectural Wireframe (v1.125.0)
    if (this.layers.wireframe) {
      const wf = this.wireframeData
        || (typeof FlightDiagnostics !== 'undefined' && FlightDiagnostics.wireframeData)
        || this.activeManifest?.wireframe
        || (typeof activeInspectionManifest !== 'undefined' && activeInspectionManifest?.wireframe)
        || null;

      const pKey = this.activePhoto.filename || this.activePhoto.photoId || '';
      const photo2dLines = (Array.isArray(this.activePhoto.detectedLines) && this.activePhoto.detectedLines.length > 0)
        ? this.activePhoto.detectedLines
        : ((wf && wf.perPhotoLines && (wf.perPhotoLines[pKey] || wf.perPhotoLines[this.activePhoto.filename] || wf.perPhotoLines[this.activePhoto.photoId])) || null);

      ctx.save();
      let renderedLineCount = 0;
      let firstVisPt = null;

      // Tier A: Direct High-Precision 2D Detected Architectural Lines
      if (Array.isArray(photo2dLines) && photo2dLines.length > 0) {
        photo2dLines.forEach(l => {
          if (!Array.isArray(l) || l.length < 4) return;
          const [u1, v1, u2, v2] = l;
          const px1 = u1 * canvas.width;
          const py1 = v1 * canvas.height;
          const px2 = u2 * canvas.width;
          const py2 = v2 * canvas.height;

          // 1. Shadow outline for high contrast
          ctx.strokeStyle = 'rgba(15, 23, 42, 0.75)';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(px1, py1);
          ctx.lineTo(px2, py2);
          ctx.stroke();

          // 2. Main cyan architectural line
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.moveTo(px1, py1);
          ctx.lineTo(px2, py2);
          ctx.stroke();

          // 3. Vertex nodes
          [[px1, py1], [px2, py2]].forEach(([x, y]) => {
            ctx.fillStyle = '#38bdf8';
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;
            ctx.stroke();
          });

          renderedLineCount++;
          if (!firstVisPt) {
            firstVisPt = { x: px1, y: py1 };
          }
        });
      } else if (wf && Array.isArray(wf.lines) && wf.lines.length > 0) {
        // Tier B: Project 3D World Lines into Camera Optical Plane
        const camPose = {
          lat: this.activePhoto.actual?.lat ?? this.activePhoto.planned?.lat ?? 0,
          lon: this.activePhoto.actual?.lon ?? this.activePhoto.planned?.lon ?? 0,
          altAgl: (this.activePhoto.actual?.altAgl && this.activePhoto.actual.altAgl > 0)
            ? this.activePhoto.actual.altAgl
            : (this.activePhoto.actual?.alt ?? this.activePhoto.planned?.alt ?? 25.0),
          gimbalPitch: (this.activePhoto.actual?.gimbalPitch !== undefined) ? this.activePhoto.actual.gimbalPitch : -90,
          heading: this.activePhoto.actual?.heading ?? this.activePhoto.planned?.heading ?? 0
        };

        const elevOffset = (typeof this.targetHeight === 'number' && this.targetHeight !== 0)
          ? this.targetHeight
          : ((typeof FlightDiagnostics !== 'undefined' && typeof FlightDiagnostics.wireframeElevationOffset === 'number')
              ? FlightDiagnostics.wireframeElevationOffset
              : (wf.elevationOffset || 0.0));

        const minLen = (typeof FlightDiagnostics !== 'undefined' && typeof FlightDiagnostics.wireframeMinLengthFilter === 'number')
          ? FlightDiagnostics.wireframeMinLengthFilter
          : 0.5;

        const options = {
          sensorWidthMm: this.activePhoto.sensorWidthMm || 9.6,
          focalLengthMm: this.activePhoto.focalLengthMm || 6.72,
          aspectRatio: canvas.width / canvas.height
        };

        let camWorld = null;
        if (typeof FlightDiagnostics !== 'undefined' && typeof FlightDiagnostics.projectToWorld === 'function') {
          try {
            const cw = FlightDiagnostics.projectToWorld(camPose.lat, camPose.lon, camPose.altAgl);
            if (cw && !isNaN(cw.x) && !isNaN(cw.z)) camWorld = cw;
          } catch (_) {}
        }
        if (!camWorld) {
          camWorld = { x: 0, y: camPose.altAgl, z: 0 };
        }
        const maxRange = Math.max(90, camPose.altAgl * 3.5);

        wf.lines.forEach(line => {
          if (!Array.isArray(line) || line.length < 6) return;
          const [x1, y1, z1, x2, y2, z2] = line;
          if (Math.hypot(x2 - x1, y2 - y1, z2 - z1) < minLen) return;

          const d1 = Math.hypot(x1 - camWorld.x, (y1 + elevOffset) - camWorld.y, z1 - camWorld.z);
          const d2 = Math.hypot(x2 - camWorld.x, (y2 + elevOffset) - camWorld.y, z2 - camWorld.z);
          if (d1 > maxRange && d2 > maxRange) return;

          const p1 = { x: x1, y: y1 + elevOffset, z: z1 };
          const p2 = { x: x2, y: y2 + elevOffset, z: z2 };

          const c1 = (typeof this.projectWorldPointToCamera === 'function') ? this.projectWorldPointToCamera(p1, camPose, options) : null;
          const c2 = (typeof this.projectWorldPointToCamera === 'function') ? this.projectWorldPointToCamera(p2, camPose, options) : null;

          if (!c1 || !c2 || (!c1.isInFront && !c2.isInFront)) return;

          let u1 = c1.u, v1 = c1.v;
          let u2 = c2.u, v2 = c2.v;

          // Near-plane clipping against Ycam = 0.05m
          if (c1.isInFront && !c2.isInFront) {
            const t = (0.05 - c1.Ycam) / (c2.Ycam - c1.Ycam);
            const Xclip = c1.Xcam + t * (c2.Xcam - c1.Xcam);
            const Zclip = c1.Zcam + t * (c2.Zcam - c1.Zcam);
            u2 = 0.5 + (Xclip / (2.0 * 0.05 * c1.tanHalfH));
            v2 = 0.5 - (Zclip / (2.0 * 0.05 * c1.tanHalfV));
          } else if (!c1.isInFront && c2.isInFront) {
            const t = (0.05 - c2.Ycam) / (c1.Ycam - c2.Ycam);
            const Xclip = c2.Xcam + t * (c1.Xcam - c2.Xcam);
            const Zclip = c2.Zcam + t * (c1.Zcam - c2.Zcam);
            u1 = 0.5 + (Xclip / (2.0 * 0.05 * c2.tanHalfH));
            v1 = 0.5 - (Zclip / (2.0 * 0.05 * c2.tanHalfV));
          }

          if ((u1 < -0.2 && u2 < -0.2) || (u1 > 1.2 && u2 > 1.2) ||
              (v1 < -0.2 && v2 < -0.2) || (v1 > 1.2 && v2 > 1.2)) {
            return;
          }

          const px1 = u1 * canvas.width;
          const py1 = v1 * canvas.height;
          const px2 = u2 * canvas.width;
          const py2 = v2 * canvas.height;

          // 1. Shadow outline for high contrast
          ctx.strokeStyle = 'rgba(15, 23, 42, 0.75)';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(px1, py1);
          ctx.lineTo(px2, py2);
          ctx.stroke();

          // 2. Main cyan architectural wireframe line
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.moveTo(px1, py1);
          ctx.lineTo(px2, py2);
          ctx.stroke();

          // 3. Vertex nodes
          [[px1, py1, c1.isInsideFrame], [px2, py2, c2.isInsideFrame]].forEach(([x, y, inside]) => {
            if (inside) {
              ctx.fillStyle = '#38bdf8';
              ctx.beginPath();
              ctx.arc(x, y, 3, 0, Math.PI * 2);
              ctx.fill();
              ctx.strokeStyle = '#ffffff';
              ctx.lineWidth = 1;
              ctx.stroke();
            }
          });

          renderedLineCount++;
          if (!firstVisPt && (c1.isInsideFrame || c2.isInsideFrame)) {
            firstVisPt = c1.isInsideFrame ? { x: px1, y: py1 } : { x: px2, y: py2 };
          }
        });
      }

      // Corner badge in Photo Inspector showing active line count
      if (renderedLineCount > 0 && firstVisPt) {
        const bx = Math.max(10, Math.min(canvas.width - 200, firstVisPt.x));
        const by = Math.max(25, Math.min(canvas.height - 15, firstVisPt.y - 12));
        const is2d = Array.isArray(photo2dLines) && photo2dLines.length > 0;
        const badgeText = is2d
          ? `🏗️ Architectural Lines (${renderedLineCount})`
          : `🏗️ 3D Wireframe (${renderedLineCount} lines)`;
        ctx.font = 'bold 11px sans-serif';
        const badgeW = ctx.measureText(badgeText).width + 16;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.fillRect(bx, by - 16, badgeW, 20);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1;
        ctx.strokeRect(bx, by - 16, badgeW, 20);
        ctx.fillStyle = '#38bdf8';
        ctx.fillText(badgeText, bx + 8, by - 2);
      }

      ctx.restore();
    }

    // 8. Auto-Superimposed Fiducial Markers & Ground Control Points (v1.104.0)
    if (this.layers.fiducials) {
      const camPose = {
        lat: this.activePhoto.actual?.lat ?? this.activePhoto.planned?.lat ?? 0,
        lon: this.activePhoto.actual?.lon ?? this.activePhoto.planned?.lon ?? 0,
        altAgl: (this.activePhoto.actual?.altAgl && this.activePhoto.actual.altAgl > 0)
          ? this.activePhoto.actual.altAgl
          : (this.activePhoto.actual?.alt ?? this.activePhoto.planned?.alt ?? 25.0),
        gimbalPitch: (this.activePhoto.actual?.gimbalPitch !== undefined) ? this.activePhoto.actual.gimbalPitch : -90,
        heading: this.activePhoto.actual?.heading ?? this.activePhoto.planned?.heading ?? 0
      };

      const allLayers = (typeof flightLayers !== 'undefined' && Array.isArray(flightLayers)) ? flightLayers : [];
      const markersToProject = [];

      allLayers.filter(l => l.enabled && Array.isArray(l.fiducialMarkers)).forEach(l => {
        l.fiducialMarkers.forEach(m => {
          markersToProject.push({
            marker: m,
            layerColor: l.markerColor || '#f59e0b',
            layerName: l.name || 'GCP Survey'
          });
        });
      });

      // Fallback: If no workspace fiducials exist, check activeManifest or currentLoadedMission in FlightDiagnostics
      if (markersToProject.length === 0) {
        const manifestGcp = this.activeManifest?.groundControl;
        const diagGcp = (typeof FlightDiagnostics !== 'undefined' && FlightDiagnostics.currentLoadedMission)
          ? (FlightDiagnostics.currentLoadedMission.groundControl || FlightDiagnostics.currentLoadedMission.plan?.groundControl)
          : null;
        const mGcp = (Array.isArray(manifestGcp) && manifestGcp.length > 0) ? manifestGcp : diagGcp;
        if (Array.isArray(mGcp)) {
          mGcp.forEach(m => {
            markersToProject.push({
              marker: m,
              layerColor: m.color || '#f59e0b',
              layerName: m.layerName || 'GCP Survey'
            });
          });
        }
      }

      const opt = {
        sensorWidthMm: this.activePhoto.sensorWidthMm || 9.6,
        focalLengthMm: this.activePhoto.focalLengthMm || 6.72,
        aspectRatio: canvas.width / canvas.height,
        targetHeightMeters: 0
      };

      markersToProject.forEach(({ marker, layerColor, layerName }) => {
        const proj = projectGeoPointToPixel(marker, camPose, opt);
        if (proj.isInFront && proj.isInsideFrame) {
          const px = proj.u * canvas.width;
          const py = proj.v * canvas.height;
          const color = marker.color || layerColor || '#f59e0b';
          const sizeM = marker.physicalSizeMeters || 0.5;
          const code = marker.code || 'GCP';
          const role = (marker.role || 'gcp').toUpperCase();
          const depthM = proj.opticalDepthMeters;

          ctx.save();
          // Draw outer target ring
          ctx.strokeStyle = color;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(px, py, 14, 0, Math.PI * 2);
          ctx.stroke();

          // Draw dashed concentric ring
          ctx.lineWidth = 1.5;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.arc(px, py, 22, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);

          // Draw target crosshairs
          ctx.beginPath();
          ctx.moveTo(px - 18, py); ctx.lineTo(px + 18, py);
          ctx.moveTo(px, py - 18); ctx.lineTo(px, py + 18);
          ctx.stroke();

          // Center bullseye dot
          ctx.fillStyle = '#ef4444';
          ctx.beginPath();
          ctx.arc(px, py, 3, 0, Math.PI * 2);
          ctx.fill();

          // Target Label Pill
          const distStr = this.unit === 'imperial' ? `${(depthM * 3.28084).toFixed(1)}ft` : `${depthM.toFixed(1)}m`;
          const sizeStr = this.unit === 'imperial' ? `${(sizeM * 39.37).toFixed(0)}in` : `${(sizeM * 100).toFixed(0)}cm`;
          const labelText = `🎯 ${code} [${role}] • ${sizeStr} • ${distStr}`;

          ctx.font = 'bold 11px sans-serif';
          const textW = ctx.measureText(labelText).width;
          const badgeX = Math.max(10, Math.min(canvas.width - textW - 24, px + 18));
          const badgeY = Math.max(25, Math.min(canvas.height - 15, py - 12));

          ctx.fillStyle = 'rgba(15, 23, 42, 0.90)';
          ctx.fillRect(badgeX, badgeY - 14, textW + 16, 22);
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(badgeX, badgeY - 14, textW + 16, 22);

          ctx.fillStyle = '#f8fafc';
          ctx.fillText(labelText, badgeX + 8, badgeY + 1);
          ctx.restore();
        }
      });
    }

    // 9. Detected Optical Tags (Fiducial Quads, Orientation Corner #0, Decoded Tag ID, and GCP Variance)
    if (this.layers.detectedTags && this.activePhoto && Array.isArray(this.activePhoto.detectedTags)) {
      this.activePhoto.detectedTags.forEach(tag => {
        if (!Array.isArray(tag.corners) || tag.corners.length !== 4) return;
        ctx.save();

        // Draw Bounding Quad
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 2.5;
        ctx.fillStyle = 'rgba(34, 197, 94, 0.15)';
        ctx.beginPath();
        tag.corners.forEach((c, idx) => {
          const cx = c.u * canvas.width;
          const cy = c.v * canvas.height;
          if (idx === 0) ctx.moveTo(cx, cy);
          else ctx.lineTo(cx, cy);
        });
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Corner #0 Marker (Yellow dot for orientation)
        const c0x = tag.corners[0].u * canvas.width;
        const c0y = tag.corners[0].v * canvas.height;
        ctx.fillStyle = '#eab308';
        ctx.beginPath();
        ctx.arc(c0x, c0y, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Center dot
        const centerX = tag.center ? (tag.center.u * canvas.width) : c0x;
        const centerY = tag.center ? (tag.center.v * canvas.height) : c0y;
        ctx.fillStyle = '#22c55e';
        ctx.beginPath();
        ctx.arc(centerX, centerY, 3, 0, Math.PI * 2);
        ctx.fill();

        // Dashed variance line to projected GCP if matched
        if (tag.matchedGcp && tag.matchedGcp.projectedPixel) {
          const pGcpX = (tag.matchedGcp.projectedPixel.x / (this.activePhoto.sensorWidthPx || canvas.width)) * canvas.width;
          const pGcpY = (tag.matchedGcp.projectedPixel.y / (this.activePhoto.sensorHeightPx || canvas.height)) * canvas.height;
          ctx.strokeStyle = '#34d399';
          ctx.lineWidth = 1.8;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(centerX, centerY);
          ctx.lineTo(pGcpX, pGcpY);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Tag Label Pill
        const famLabel = (tag.family || 'Tag').replace('apriltag_', '').replace('aruco_', 'ArUco-').toUpperCase();
        const rotStr = typeof tag.rotationDeg === 'number' ? `${Math.round(tag.rotationDeg)}°` : '';
        let labelText = `🏷️ ${famLabel} #${tag.id} [${rotStr}]`;
        if (tag.matchedGcp) {
          labelText += ` • Δ:${tag.matchedGcp.varianceCm}cm`;
        }

        ctx.font = 'bold 11px sans-serif';
        const textW = ctx.measureText(labelText).width;
        const badgeX = Math.max(10, Math.min(canvas.width - textW - 20, centerX + 12));
        const badgeY = Math.max(20, Math.min(canvas.height - 15, centerY - 12));

        ctx.fillStyle = 'rgba(15, 23, 42, 0.90)';
        ctx.fillRect(badgeX, badgeY - 14, textW + 14, 20);
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(badgeX, badgeY - 14, textW + 14, 20);
        ctx.fillStyle = '#f0fdf4';
        ctx.fillText(labelText, badgeX + 7, badgeY);

        ctx.restore();
      });
    }
  },


  _simplifyContourRDP(points, epsilon) {
    if (!points || points.length <= 2) return points || [];
    let dmax = 0;
    let index = 0;
    const p1 = points[0];
    const p2 = points[points.length - 1];
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const lineLenSq = dx * dx + dy * dy;

    for (let i = 1; i < points.length - 1; i++) {
      const pt = points[i];
      let d;
      if (lineLenSq === 0) {
        d = Math.hypot(pt[0] - p1[0], pt[1] - p1[1]);
      } else {
        const num = Math.abs(dy * pt[0] - dx * pt[1] + p2[0] * p1[1] - p2[1] * p1[0]);
        d = num / Math.sqrt(lineLenSq);
      }
      if (d > dmax) {
        dmax = d;
        index = i;
      }
    }

    if (dmax > epsilon) {
      const rec1 = this._simplifyContourRDP(points.slice(0, index + 1), epsilon);
      const rec2 = this._simplifyContourRDP(points.slice(index), epsilon);
      return rec1.slice(0, -1).concat(rec2);
    } else {
      return [p1, p2];
    }
  },

  async detectHouseLines() {
    if (!this.activePhoto) return [];
    const btn = document.getElementById('photo-detect-wireframe-btn');
    const origBtnText = btn ? btn.innerHTML : '🏗️ Detect House Lines';
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '⏳ Extracting...';
    }

    try {
      const p = this.activePhoto;
      let detectedLines = null;
      let wireframe3d = null;

      // Tier 0: Check precomputed wireframeData in manifest / memory
      const wf = this.wireframeData
        || (typeof FlightDiagnostics !== 'undefined' && FlightDiagnostics.wireframeData)
        || this.activeManifest?.wireframe
        || (typeof activeInspectionManifest !== 'undefined' && activeInspectionManifest?.wireframe)
        || null;
      const pKey = p.filename || p.photoId || '';
      if (wf && wf.perPhotoLines) {
        const cached = wf.perPhotoLines[pKey] || wf.perPhotoLines[p.filename] || wf.perPhotoLines[p.photoId];
        if (Array.isArray(cached) && cached.length > 0) {
          detectedLines = cached;
        }
      }

      // Tier 1: Companion API endpoint /api/process/wireframe (Port 8765)
      if (!detectedLines || detectedLines.length === 0) {
        const apiBase = (typeof getCompanionApiBase === 'function')
          ? getCompanionApiBase()
          : (typeof COMPANION_API_BASE !== 'undefined' ? COMPANION_API_BASE : 'http://127.0.0.1:8765');
        const photoPath = p.rawPath || p.filePath || null;
        const originLat = p.actual?.lat ?? p.lat ?? 40.013195;
        const originLon = p.actual?.lon ?? p.lon ?? -83.177193;
        const manifestUuid = (this.activeManifest && this.activeManifest.missionUuid)
          || (typeof FlightDiagnostics !== 'undefined' && FlightDiagnostics.activeInspectionManifest?.missionUuid)
          || (typeof FlightDiagnostics !== 'undefined' && FlightDiagnostics.flightManifest?.missionUuid)
          || (typeof FlightDiagnostics !== 'undefined' && FlightDiagnostics.currentLoadedMission?.uuid)
          || null;

        const postBody = {
          missionUuid: manifestUuid,
          imagePath: photoPath,
          filename: p.filename,
          photoId: p.photoId || p.id,
          telemetry: {
            lat: originLat,
            lon: originLon,
            altAgl: p.actual?.altAgl ?? p.altAgl ?? 25.0,
            heading: p.actual?.heading ?? p.heading ?? 0,
            gimbalPitch: p.actual?.gimbalPitch ?? p.gimbalPitch ?? -60
          },
          options: { suppressVegetation: true, maxDimension: 1920 }
        };

        const imgEl = document.getElementById('photo-inspector-img');
        if (!photoPath && imgEl && imgEl.complete && imgEl.naturalWidth > 0) {
          try {
            const sc = document.createElement('canvas');
            sc.width = Math.min(1920, imgEl.naturalWidth);
            sc.height = Math.round((sc.width / imgEl.naturalWidth) * imgEl.naturalHeight);
            const sctx = sc.getContext('2d');
            sctx.drawImage(imgEl, 0, 0, sc.width, sc.height);
            postBody.imageData = sc.toDataURL('image/jpeg', 0.85);
          } catch (_) {}
        }

        if (typeof fetch !== 'undefined' && apiBase) {
          try {
            const res = await fetch(`${apiBase}/api/process/wireframe`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(postBody)
            });
            if (res.ok) {
              const data = await res.json();
              if (data && data.success && Array.isArray(data.lines2D) && data.lines2D.length > 0) {
                detectedLines = data.lines2D;
                wireframe3d = data.lines || [];
              }
            }
          } catch (_) {}
        }
      }

      // Tier 2: In-browser canvas computer vision fallback (Contiguous Edge Tracing + RDP)
      if (!detectedLines || detectedLines.length === 0) {
        const imgEl = document.getElementById('photo-inspector-img');
        if (imgEl && imgEl.complete && imgEl.naturalWidth > 0) {
          const w = Math.min(1280, imgEl.naturalWidth);
          const h = Math.round((w / imgEl.naturalWidth) * imgEl.naturalHeight);
          const c = document.createElement('canvas');
          c.width = w;
          c.height = h;
          const ctx = c.getContext('2d', { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(imgEl, 0, 0, w, h);
            let imgData = null;
            try {
              imgData = ctx.getImageData(0, 0, w, h);
            } catch (_) {}

            if (imgData && imgData.data) {
              const data = imgData.data;
              const gray = new Uint8Array(w * h);
              const vegMask = new Uint8Array(w * h);

              // 1. Color-space vegetation identification (Excess Green Index: ExG = 2G - R - B)
              for (let i = 0, pIdx = 0; i < data.length; i += 4, pIdx++) {
                const r = data[i], g = data[i + 1], b = data[i + 2];
                const exg = 2 * g - r - b;
                const isVeg = (exg > 16 && g > 40) || (g > r * 1.08 && g > b * 1.15 && g > 40);
                if (isVeg) {
                  vegMask[pIdx] = 1;
                  gray[pIdx] = 0;
                } else {
                  gray[pIdx] = (r * 77 + g * 150 + b * 29) >> 8;
                }
              }

              // 2. Dilate vegetation mask by 2px to eliminate vegetation border gradient artifacts
              const dilatedVeg = new Uint8Array(w * h);
              for (let y = 2; y < h - 2; y++) {
                for (let x = 2; x < w - 2; x++) {
                  const idx = y * w + x;
                  if (vegMask[idx]) {
                    for (let dy = -2; dy <= 2; dy++) {
                      for (let dx = -2; dx <= 2; dx++) {
                        dilatedVeg[(y + dy) * w + (x + dx)] = 1;
                      }
                    }
                  }
                }
              }

              // 3. Sobel edge detection exclusively on structural (non-vegetation) pixels
              const edgeMap = new Uint8Array(w * h);
              const threshold = 70;
              for (let y = 2; y < h - 2; y++) {
                for (let x = 2; x < w - 2; x++) {
                  const idx = y * w + x;
                  if (dilatedVeg[idx] === 1 || gray[idx] === 0) continue;
                  const gx = -gray[idx - w - 1] - 2 * gray[idx - 1] - gray[idx + w - 1]
                            + gray[idx - w + 1] + 2 * gray[idx + 1] + gray[idx + w + 1];
                  const gy = -gray[idx - w - 1] - 2 * gray[idx - w] - gray[idx - w + 1]
                            + gray[idx + w - 1] + 2 * gray[idx + w] + gray[idx + w + 1];
                  if (Math.hypot(gx, gy) > threshold) {
                    edgeMap[idx] = 1;
                  }
                }
              }

              // 4. Contiguous 8-connected edge contour tracing
              const visited = new Uint8Array(w * h);
              const detected = [];

              for (let y = 2; y < h - 2; y += 2) {
                for (let x = 2; x < w - 2; x += 2) {
                  const idx = y * w + x;
                  if (edgeMap[idx] === 0 || visited[idx] === 1) continue;

                  const chain = [];
                  let curX = x, curY = y;
                  while (curX >= 2 && curX < w - 2 && curY >= 2 && curY < h - 2) {
                    const cIdx = curY * w + curX;
                    if (edgeMap[cIdx] === 0 || visited[cIdx] === 1) break;
                    visited[cIdx] = 1;
                    chain.push([curX, curY]);

                    let nextX = -1, nextY = -1;
                    for (let dy = -1; dy <= 1; dy++) {
                      for (let dx = -1; dx <= 1; dx++) {
                        if (dx === 0 && dy === 0) continue;
                        const nx = curX + dx, ny = curY + dy;
                        if (nx >= 2 && nx < w - 2 && ny >= 2 && ny < h - 2) {
                          const nIdx = ny * w + nx;
                          if (edgeMap[nIdx] === 1 && visited[nIdx] === 0) {
                            nextX = nx;
                            nextY = ny;
                            break;
                          }
                        }
                      }
                      if (nextX !== -1) break;
                    }
                    curX = nextX;
                    curY = nextY;
                  }

                  // 5. Ramer-Douglas-Peucker polygonal simplification into straight line segments
                  if (chain.length >= 25) {
                    const simplified = this._simplifyContourRDP(chain, 2.5);
                    for (let s = 0; s < simplified.length - 1; s++) {
                      const pA = simplified[s];
                      const pB = simplified[s + 1];
                      const d = Math.hypot(pB[0] - pA[0], pB[1] - pA[1]);
                      if (d >= 30) {
                        detected.push([
                          Math.round((pA[0] / w) * 10000) / 10000,
                          Math.round((pA[1] / h) * 10000) / 10000,
                          Math.round((pB[0] / w) * 10000) / 10000,
                          Math.round((pB[1] / h) * 10000) / 10000
                        ]);
                      }
                    }
                  }
                  if (detected.length >= 200) break;
                }
                if (detected.length >= 200) break;
              }

              if (detected.length > 0) {
                // Sort by line length descending to prioritize major ridges, eaves, and facade columns
                detected.sort((a, b) => {
                  const lenA = Math.hypot(a[2] - a[0], a[3] - a[1]);
                  const lenB = Math.hypot(b[2] - b[0], b[3] - b[1]);
                  return lenB - lenA;
                });
                detectedLines = detected.slice(0, 150);
              }
            }
          }
        }
      }

      if (detectedLines && detectedLines.length > 0) {
        p.detectedLines = detectedLines;
        if (wireframe3d && wireframe3d.length > 0) {
          p.wireframeLines = wireframe3d;
        }

        const wfPill = document.getElementById('photo-detect-wireframe-pill');
        if (wfPill) {
          wfPill.style.display = 'inline-flex';
          wfPill.textContent = `🏗️ ${detectedLines.length} House Lines`;
        }

        this.layers.wireframe = true;
        const cb = document.getElementById('layer-toggle-wireframe');
        if (cb) cb.checked = true;

        this.renderCanvas();
      }

      return detectedLines || [];
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = origBtnText;
      }
    }
  },

  async detectOpticalTags() {
    if (!this.activePhoto) return [];
    const btn = document.getElementById('photo-detect-tags-btn');
    const origBtnText = btn ? btn.innerHTML : '🔍 Detect Tags';
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '⏳ Scanning...';
    }

    try {
      if (typeof TagDetector !== 'undefined' && typeof TagDetector.load === 'function') {
        await TagDetector.load();
      }

      const imgEl = document.getElementById('photo-inspector-img');
      if (!imgEl || !imgEl.complete || imgEl.naturalWidth === 0) {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = origBtnText;
        }
        return [];
      }

      const origW = imgEl.naturalWidth;
      const origH = imgEl.naturalHeight;
      const maxDim = 1600;
      const scale = Math.min(1.0, maxDim / Math.max(origW, origH));
      const scanW = Math.round(origW * scale);
      const scanH = Math.round(origH * scale);

      const offCanvas = (typeof document !== 'undefined') ? document.createElement('canvas') : null;
      if (offCanvas) {
        offCanvas.width = scanW;
        offCanvas.height = scanH;
      }
      const offCtx = (offCanvas && typeof offCanvas.getContext === 'function')
        ? (offCanvas.getContext('2d', { willReadFrequently: true }) || offCanvas.getContext('2d'))
        : null;

      let rawTags = [];
      let isTainted = false;

      try {
        if (offCtx) {
          offCtx.drawImage(imgEl, 0, 0, scanW, scanH);
          // Probe reading 1 pixel to catch tainted canvas early before full detector run
          if (typeof offCtx.getImageData === 'function') {
            offCtx.getImageData(0, 0, 1, 1);
          }
          rawTags = (typeof TagDetector !== 'undefined') ? TagDetector.detect(offCanvas) : [];
        } else {
          isTainted = true;
        }
      } catch (taintErr) {
        console.warn('[PhotoInspector] Canvas tainted or getImageData restricted by cross-origin security:', taintErr);
        isTainted = true;
      }

      // Tier 1: In-browser clean fetch recovery (Blob -> ImageBitmap / Object URL)
      if (isTainted && this.activePhoto.previewUrl && !this.activePhoto.previewUrl.startsWith('data:') && typeof fetch !== 'undefined') {
        try {
          const fetchRes = await fetch(this.activePhoto.previewUrl, { mode: 'cors' });
          if (fetchRes.ok) {
            const blob = await fetchRes.blob();
            let cleanDrawable = null;
            if (typeof createImageBitmap === 'function') {
              cleanDrawable = await createImageBitmap(blob);
            } else if (typeof Image !== 'undefined') {
              cleanDrawable = await new Promise((resolve, reject) => {
                const tempImg = new Image();
                try { tempImg.crossOrigin = 'anonymous'; } catch (_) {}
                tempImg.onload = () => resolve(tempImg);
                tempImg.onerror = reject;
                tempImg.src = URL.createObjectURL(blob);
              });
            }
            if (cleanDrawable && typeof document !== 'undefined') {
              const cleanCanvas = document.createElement('canvas');
              cleanCanvas.width = scanW;
              cleanCanvas.height = scanH;
              const cleanCtx = (cleanCanvas && typeof cleanCanvas.getContext === 'function')
                ? (cleanCanvas.getContext('2d', { willReadFrequently: true }) || cleanCanvas.getContext('2d'))
                : null;
              if (cleanCtx) {
                cleanCtx.drawImage(cleanDrawable, 0, 0, scanW, scanH);
                if (typeof cleanCtx.getImageData === 'function') {
                  cleanCtx.getImageData(0, 0, 1, 1);
                }
                rawTags = (typeof TagDetector !== 'undefined') ? TagDetector.detect(cleanCanvas) : [];
                isTainted = false;
              }
            }
          }
        } catch (blobErr) {
          console.warn('[PhotoInspector] In-browser clean blob recovery failed:', blobErr);
        }
      }

      // Tier 2: Companion Bridge fallback (POST /api/media/scan-tags)
      if (isTainted && typeof fetch !== 'undefined') {
        try {
          const apiBase = (typeof getCompanionApiBase === 'function')
            ? getCompanionApiBase()
            : (typeof COMPANION_API_BASE !== 'undefined' ? COMPANION_API_BASE : 'http://127.0.0.1:8765');
          const manifestUuid = (this.activeManifest && this.activeManifest.missionUuid)
            || (typeof FlightDiagnostics !== 'undefined' && FlightDiagnostics.activeInspectionManifest?.missionUuid)
            || (typeof FlightDiagnostics !== 'undefined' && FlightDiagnostics.flightManifest?.missionUuid)
            || (typeof FlightDiagnostics !== 'undefined' && FlightDiagnostics.currentLoadedMission?.uuid)
            || 'layer-1';

          const postBody = {
            missionUuid: manifestUuid,
            photoId: this.activePhoto.filename || this.activePhoto.id,
            filename: this.activePhoto.filename,
            filePath: this.activePhoto.rawPath || null
          };

          const bridgeRes = await fetch(`${apiBase}/api/media/scan-tags`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(postBody)
          });
          if (bridgeRes.ok) {
            const bridgeData = await bridgeRes.json();
            if (bridgeData.success && Array.isArray(bridgeData.detectedTags)) {
              this.activePhoto.detectedTags = bridgeData.detectedTags;
              if (bridgeData.detectedTags.some(t => t.matchedGcp)) {
                this.activePhoto.gcpVerified = true;
                const best = bridgeData.detectedTags.filter(t => t.matchedGcp).sort((a, b) => a.matchedGcp.varianceCm - b.matchedGcp.varianceCm)[0];
                this.activePhoto.gcpOffsetCm = best ? best.matchedGcp.varianceCm : null;
              }
              try { this.updateHeaderUI(); } catch (_) {}
              try { this.updateDrawerUI(); } catch (_) {}
              try { this.renderCanvas(); } catch (_) {}
              if (btn) {
                btn.disabled = false;
                btn.innerHTML = bridgeData.detectedTags.length > 0 ? `✓ ${bridgeData.detectedTags.length} Detected` : '🔍 Detect Tags';
                setTimeout(() => { if (btn) btn.innerHTML = '🔍 Detect Tags'; }, 3000);
              }
              return bridgeData.detectedTags;
            }
          }
        } catch (bridgeErr) {
          console.warn('[PhotoInspector] Companion bridge scan-tags fallback failed:', bridgeErr);
        }
      }

      const scaleX = origW / scanW;
      const scaleY = origH / scanH;

      const allLayers = (typeof flightLayers !== 'undefined' && Array.isArray(flightLayers)) ? flightLayers : [];
      const plannedGcps = [];
      allLayers.filter(l => l.enabled && Array.isArray(l.fiducialMarkers)).forEach(l => {
        l.fiducialMarkers.forEach(m => {
          plannedGcps.push({ ...m, layerColor: l.markerColor || '#f59e0b', layerName: l.name });
        });
      });
      if (plannedGcps.length === 0 && typeof FlightDiagnostics !== 'undefined' && FlightDiagnostics.currentLoadedMission) {
        const mGcp = FlightDiagnostics.currentLoadedMission.groundControl || FlightDiagnostics.currentLoadedMission.plan?.groundControl;
        if (Array.isArray(mGcp)) {
          mGcp.forEach(m => plannedGcps.push({ ...m, layerColor: m.color || '#f59e0b' }));
        }
      }

      const camPose = {
        lat: this.activePhoto.actual?.lat ?? this.activePhoto.planned?.lat ?? 0,
        lon: this.activePhoto.actual?.lon ?? this.activePhoto.planned?.lon ?? 0,
        altAgl: (this.activePhoto.actual?.altAgl && this.activePhoto.actual.altAgl > 0)
          ? this.activePhoto.actual.altAgl
          : (this.activePhoto.actual?.alt ?? this.activePhoto.planned?.alt ?? 25.0),
        gimbalPitch: (this.activePhoto.actual?.gimbalPitch !== undefined) ? this.activePhoto.actual.gimbalPitch : -90,
        heading: this.activePhoto.actual?.heading ?? this.activePhoto.planned?.heading ?? 0
      };
      const opt = {
        sensorWidthMm: this.activePhoto.sensorWidthMm || 9.6,
        focalLengthMm: this.activePhoto.focalLengthMm || 6.72,
        aspectRatio: origW / origH,
        targetHeightMeters: 0
      };

      const projectedGcps = [];
      plannedGcps.forEach(gcp => {
        const proj = projectGeoPointToPixel(gcp, camPose, opt);
        if (proj.isInFront && proj.isInsideFrame) {
          projectedGcps.push({
            gcp,
            projU: proj.u,
            projV: proj.v,
            projPxX: proj.u * origW,
            projPxY: proj.v * origH
          });
        }
      });

      const gsdCm = (this.activePhoto.gsd && typeof this.activePhoto.gsd.gsdCm === 'number')
        ? this.activePhoto.gsd.gsdCm
        : 0.9;

      const mappedTags = rawTags.map(t => {
        const nativeCorners = t.corners.map(c => ({
          x: Math.round(c.x * scaleX * 10) / 10,
          y: Math.round(c.y * scaleY * 10) / 10,
          u: (c.x * scaleX) / origW,
          v: (c.y * scaleY) / origH
        }));
        const nativeCenter = {
          x: Math.round(t.center.x * scaleX * 10) / 10,
          y: Math.round(t.center.y * scaleY * 10) / 10,
          u: (t.center.x * scaleX) / origW,
          v: (t.center.y * scaleY) / origH
        };

        let matchedGcp = null;
        let minDistancePx = Infinity;
        for (const pg of projectedGcps) {
          const dPx = Math.hypot(nativeCenter.x - pg.projPxX, nativeCenter.y - pg.projPxY);
          if (dPx < minDistancePx && (dPx < 300 || String(pg.gcp.code || '').includes(String(t.id)))) {
            minDistancePx = dPx;
            matchedGcp = {
              code: pg.gcp.code || `GCP-${t.id}`,
              role: pg.gcp.role || 'gcp',
              lat: pg.gcp.lat,
              lon: pg.gcp.lon,
              variancePx: Math.round(dPx * 10) / 10,
              varianceCm: Math.round(dPx * gsdCm * 10) / 10,
              projectedPixel: { x: Math.round(pg.projPxX), y: Math.round(pg.projPxY) }
            };
          }
        }

        return {
          family: t.family,
          id: t.id,
          confidence: t.confidence,
          corners: nativeCorners,
          center: nativeCenter,
          rotationDeg: t.rotationDeg,
          matchedGcp
        };
      });

      this.activePhoto.detectedTags = mappedTags;
      if (mappedTags.some(t => t.matchedGcp)) {
        this.activePhoto.gcpVerified = true;
        const best = mappedTags.filter(t => t.matchedGcp).sort((a, b) => a.matchedGcp.varianceCm - b.matchedGcp.varianceCm)[0];
        this.activePhoto.gcpOffsetCm = best ? best.matchedGcp.varianceCm : null;
      }

      this.updateHeaderUI();
      this.updateDrawerUI();
      this.renderCanvas();

      if (btn) {
        btn.disabled = false;
        btn.innerHTML = mappedTags.length > 0 ? `✓ ${mappedTags.length} Detected` : '🔍 Detect Tags';
        setTimeout(() => { if (btn) btn.innerHTML = '🔍 Detect Tags'; }, 3000);
      }

      return mappedTags;
    } catch (err) {
      console.warn('[PhotoInspector] Error during optical tag detection:', err);
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '🔍 Detect Tags';
      }
      return [];
    }
  },

  setupEvents() {
    if (this.eventsBound || typeof document === 'undefined') return;
    this.eventsBound = true;

    const viewport = document.getElementById('photo-viewport-container');
    const canvas = document.getElementById('photo-annotation-canvas');
    const closeBtn = document.getElementById('close-photo-inspector-btn');
    const unitBtn = document.getElementById('inspector-unit-toggle-btn');
    const undoBtn = document.getElementById('photo-undo-btn');
    const clearBtn = document.getElementById('photo-clear-btn');
    const saveBtn = document.getElementById('inspector-save-btn');
    const exportBtn = document.getElementById('inspector-export-img-btn');

    if (closeBtn) closeBtn.onclick = () => this.close();
    if (unitBtn) {
      unitBtn.onclick = () => {
        this.unit = this.unit === 'metric' ? 'imperial' : 'metric';
        unitBtn.textContent = this.unit === 'metric' ? '📏 Metric' : '📐 Imperial';
        this.updateHeaderUI();
        this.updateDrawerUI();
        this.renderCanvas();
      };
    }

    const planeToggleBtn = document.getElementById('inspector-plane-toggle-btn');
    if (planeToggleBtn) {
      planeToggleBtn.onclick = () => {
        this.calibrationMode = this.calibrationMode === 'slant' ? 'ground' : 'slant';
        this.updateHeaderUI();
        this.updateDrawerUI();
        this.renderCanvas();
      };
    }

    const slantBtn = document.getElementById('plane-btn-slant');
    const groundBtn = document.getElementById('plane-btn-ground');
    if (slantBtn) {
      slantBtn.onclick = () => {
        this.calibrationMode = 'slant';
        this.updateHeaderUI();
        this.updateDrawerUI();
        this.renderCanvas();
      };
    }
    if (groundBtn) {
      groundBtn.onclick = () => {
        this.calibrationMode = 'ground';
        this.updateHeaderUI();
        this.updateDrawerUI();
        this.renderCanvas();
      };
    }

    const heightInput = document.getElementById('inspector-target-height-input');
    if (heightInput) {
      const handleHeightChange = () => {
        const val = parseFloat(heightInput.value) || 0;
        this.targetHeight = this.unit === 'imperial' ? val / 3.28084 : val;
        this.updateDrawerUI();
        this.renderCanvas();
      };
      heightInput.oninput = handleHeightChange;
      heightInput.onchange = handleHeightChange;
    }

    if (undoBtn) undoBtn.onclick = () => this.undo();
    if (clearBtn) clearBtn.onclick = () => this.clear();
    if (saveBtn) saveBtn.onclick = () => this.save();
    if (exportBtn) exportBtn.onclick = () => this.exportStampedImage();

    const prevBtn = document.getElementById('photo-inspector-prev-btn');
    const nextBtn = document.getElementById('photo-inspector-next-btn');
    const viewportPrevBtn = document.getElementById('photo-viewport-prev-btn');
    const viewportNextBtn = document.getElementById('photo-viewport-next-btn');

    if (prevBtn) prevBtn.onclick = () => this.previousPhoto();
    if (nextBtn) nextBtn.onclick = () => this.nextPhoto();
    if (viewportPrevBtn) viewportPrevBtn.onclick = () => this.previousPhoto();
    if (viewportNextBtn) viewportNextBtn.onclick = () => this.nextPhoto();

    window.addEventListener('keydown', (e) => {
      const modal = document.getElementById('photo-inspector-modal');
      if (!modal || modal.classList.contains('hidden')) return;

      const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') return;

      if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        this.previousPhoto();
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        this.nextPhoto();
      } else if (e.key === 'Escape') {
        this.close();
      }
    });

    document.querySelectorAll('.photo-tool-btn').forEach(btn => {
      btn.onclick = () => {
        const tool = btn.dataset.tool;
        if (!tool) return;
        document.querySelectorAll('.photo-tool-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.setTool(tool);
      };
    });

    document.querySelectorAll('.color-dot-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.color-dot-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentColor = btn.dataset.color || '#ef4444';
      };
    });

    const detectWfBtn = document.getElementById('photo-detect-wireframe-btn');
    if (detectWfBtn) {
      detectWfBtn.onclick = () => this.detectHouseLines();
    }

    const detectTagsBtn = document.getElementById('photo-detect-tags-btn');
    if (detectTagsBtn) {
      detectTagsBtn.onclick = () => this.detectOpticalTags();
    }

    ['hud', 'boundary', 'layerBoundary', 'wireframe', 'fiducials', 'detectedTags', 'measure', 'pins', 'reticle'].forEach(lKey => {
      const elemId = lKey === 'detectedTags' ? 'layer-toggle-detected-tags' : (lKey === 'layerBoundary' ? 'layer-toggle-layer-boundary' : (lKey === 'wireframe' ? 'layer-toggle-wireframe' : `layer-toggle-${lKey}`));
      const cb = document.getElementById(elemId) || document.getElementById(`layer-toggle-${lKey.toLowerCase()}`);
      if (cb) {
        cb.onchange = () => {
          this.layers[lKey] = cb.checked;
          const hudBanner = document.getElementById('photo-hud-banner');
          if (lKey === 'hud' && hudBanner) {
            hudBanner.style.display = cb.checked ? 'block' : 'none';
          }
          this.renderCanvas();
        };
      }
    });

    if (viewport && canvas) {
      viewport.onwheel = (e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        this.zoom = Math.max(0.5, Math.min(6, this.zoom * delta));
        this.applyTransform();
      };

      canvas.onmousedown = (e) => {
        const rect = canvas.getBoundingClientRect();
        const xNorm = (e.clientX - rect.left) / rect.width;
        const yNorm = (e.clientY - rect.top) / rect.height;

        if (this.currentTool === 'pan') {
          this.isDragging = true;
          this.dragStartX = e.clientX - this.panX;
          this.dragStartY = e.clientY - this.panY;
          viewport.style.cursor = 'grabbing';
          return;
        }

        if (this.currentTool === 'pin') {
          const title = prompt('Enter inspection defect note for this pin:', 'Asset Observation');
          if (title) {
            const sev = this.currentColor === '#ef4444' ? 'critical' : (this.currentColor === '#f59e0b' ? 'warning' : 'info');
            this.activePhoto.annotations.push({
              type: 'pin',
              x: xNorm,
              y: yNorm,
              title,
              color: this.currentColor,
              severity: sev
            });
            this.updateDrawerUI();
            this.renderCanvas();
          }
          return;
        }

        if (this.currentTool === 'boundary') {
          this.activeBoundaryPoints.push({ x: xNorm, y: yNorm });
          if (this.activeBoundaryPoints.length >= 3) {
            const p0 = this.activeBoundaryPoints[0];
            const distPx = Math.sqrt(((xNorm - p0.x) * canvas.width) ** 2 + ((yNorm - p0.y) * canvas.height) ** 2);
            if (distPx < 25 && this.activeBoundaryPoints.length > 3) {
              const polyRes = this.calculateGroundPolygon(this.activeBoundaryPoints);
              this.activePhoto.annotations.push({
                type: 'boundary',
                points: [...this.activeBoundaryPoints],
                isClosed: true,
                color: this.currentColor,
                perimeterMeters: polyRes.perimeterMeters,
                perimeterFt: polyRes.perimeterFt,
                areaM2: polyRes.areaM2,
                areaSqFt: polyRes.areaSqFt
              });
              this.activeBoundaryPoints = [];
              this.updateDrawerUI();
            }
          }
          this.renderCanvas();
          return;
        }

        if (this.currentTool === 'measure') {
          this.activeMeasurePoints.push({ x: xNorm, y: yNorm });
          if (this.activeMeasurePoints.length === 2) {
            const p1 = this.activeMeasurePoints[0];
            const p2 = this.activeMeasurePoints[1];
            const distM = this.calculateGroundDistance(p1, p2);
            const distStr = this.unit === 'imperial' ? `${(distM * 3.28084).toFixed(2)} ft` : `${distM.toFixed(2)} m`;
            const modeDesc = this.calibrationMode === 'slant' ? 'Structure slant plane' : 'Corrected 3D ground plane';
            this.activePhoto.annotations.push({
              type: 'measure',
              p1,
              p2,
              distanceMeters: Math.round(distM * 100) / 100,
              distanceFt: Math.round(distM * 3.28084 * 100) / 100,
              label: distStr,
              details: `${modeDesc}: ${distStr}`
            });
            this.activeMeasurePoints = [];
            this.updateDrawerUI();
          }
          this.renderCanvas();
          return;
        }

        if (this.currentTool === 'arrow') {
          this.activeArrowStart = { x: xNorm, y: yNorm };
          return;
        }

        if (this.currentTool === 'box') {
          this.activeBoxStart = { x: xNorm, y: yNorm };
          return;
        }
      };

      window.addEventListener('mousemove', (e) => {
        if (this.isDragging) {
          this.panX = e.clientX - this.dragStartX;
          this.panY = e.clientY - this.dragStartY;
          this.applyTransform();
        }
      });

      window.addEventListener('mouseup', (e) => {
        if (this.isDragging) {
          this.isDragging = false;
          viewport.style.cursor = 'grab';
        }

        if (this.activeArrowStart) {
          const rect = canvas.getBoundingClientRect();
          const x2 = (e.clientX - rect.left) / rect.width;
          const y2 = (e.clientY - rect.top) / rect.height;
          if (Math.hypot(x2 - this.activeArrowStart.x, y2 - this.activeArrowStart.y) > 0.02) {
            this.activePhoto.annotations.push({
              type: 'arrow',
              x1: this.activeArrowStart.x,
              y1: this.activeArrowStart.y,
              x2, y2,
              color: this.currentColor
            });
            this.updateDrawerUI();
            this.renderCanvas();
          }
          this.activeArrowStart = null;
        }

        if (this.activeBoxStart) {
          const rect = canvas.getBoundingClientRect();
          const x2 = (e.clientX - rect.left) / rect.width;
          const y2 = (e.clientY - rect.top) / rect.height;
          const bx = Math.min(this.activeBoxStart.x, x2);
          const by = Math.min(this.activeBoxStart.y, y2);
          const bw = Math.abs(x2 - this.activeBoxStart.x);
          const bh = Math.abs(y2 - this.activeBoxStart.y);
          if (bw > 0.02 && bh > 0.02) {
            this.activePhoto.annotations.push({
              type: 'box',
              x: bx, y: by, w: bw, h: bh,
              color: this.currentColor,
              title: 'Zone Highlight'
            });
            this.updateDrawerUI();
            this.renderCanvas();
          }
          this.activeBoxStart = null;
        }
      });
    }
  },

  setTool(tool) {
    this.currentTool = tool;
    const vp = document.getElementById('photo-viewport-container');
    if (vp) vp.style.cursor = tool === 'pan' ? 'grab' : 'crosshair';
  },

  undo() {
    if (this.activePhoto && this.activePhoto.annotations && this.activePhoto.annotations.length > 0) {
      this.activePhoto.annotations.pop();
      this.updateDrawerUI();
      this.renderCanvas();
    }
  },

  clear() {
    if (this.activePhoto) {
      this.activePhoto.annotations = [];
      this.activeBoundaryPoints = [];
      this.activeMeasurePoints = [];
      this.updateDrawerUI();
      this.renderCanvas();
    }
  },

  async save() {
    if (!this.activePhoto) return;
    const saveBtn = document.getElementById('inspector-save-btn');
    if (saveBtn) saveBtn.textContent = 'Saving...';

    const apiBase = (typeof getCompanionApiBase === 'function')
      ? getCompanionApiBase()
      : (typeof COMPANION_API_BASE !== 'undefined' ? COMPANION_API_BASE : 'http://127.0.0.1:8765');
    const missionUuid = (this.activeManifest && this.activeManifest.missionUuid) || 'default';
    try {
      await fetch(`${apiBase}/api/media/annotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          missionUuid,
          photoId: this.activePhoto.photoId,
          annotations: this.activePhoto.annotations,
          severity: this.activePhoto.annotations.some(a => a.severity === 'critical') ? 'critical' : (this.activePhoto.annotations.some(a => a.severity === 'warning') ? 'warning' : 'clean')
        })
      });
      if (saveBtn) saveBtn.textContent = 'Saved! ✓';
      setTimeout(() => { if (saveBtn) saveBtn.textContent = '💾 Save Annotations'; }, 1500);
    } catch (e) {
      if (saveBtn) saveBtn.textContent = 'Saved Locally';
      setTimeout(() => { if (saveBtn) saveBtn.textContent = '💾 Save Annotations'; }, 1500);
    }
  },

  exportStampedImage() {
    if (!this.activePhoto) return;
    const imgEl = document.getElementById('photo-inspector-img');
    const annCanvas = document.getElementById('photo-annotation-canvas');
    if (!imgEl || !annCanvas) return;

    const w = annCanvas.width;
    const h = annCanvas.height;
    const hudH = this.layers.hud ? 80 : 0;

    const off = document.createElement('canvas');
    off.width = w;
    off.height = h + hudH;
    const ctx = off.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(imgEl, 0, 0, w, h);
    ctx.drawImage(annCanvas, 0, 0, w, h);

    if (this.layers.hud) {
      ctx.fillStyle = '#090d16';
      ctx.fillRect(0, h, w, hudH);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(0, h, w, 2);

      const p = this.activePhoto;
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 20px monospace';
      ctx.fillText(`🛰️ AALAAPI SKY INSPECTION HUD • ${p.filename}`, 24, h + 30);

      ctx.fillStyle = '#cbd5e1';
      ctx.font = '16px monospace';
      const altStr = `${p.actual.altAgl}m AGL`;
      const pitch = (p.actual && p.actual.gimbalPitch !== undefined) ? p.actual.gimbalPitch : -90;
      const isOblique = Math.abs(pitch + 90) > 2;
      const gsdStr = `${p.gsd ? p.gsd.gsdCm : 0.9} cm/px${isOblique ? ' (3D Tilt Corrected)' : ''}`;
      ctx.fillText(`WP #${p.waypointIndex} | Lat: ${p.actual.lat.toFixed(6)}° Lon: ${p.actual.lon.toFixed(6)}° | Alt: ${altStr} | Pitch: ${pitch}° | GSD: ${gsdStr}`, 24, h + 58);
    }

    const link = document.createElement('a');
    link.download = `${this.activePhoto.filename.replace(/\.[^.]+$/, '')}_annotated.jpg`;
    link.href = off.toDataURL('image/jpeg', 0.92);
    link.click();
  }
};

function renderPhotoInspectionMapLayer(manifest) {
  if (!map || typeof L === 'undefined' || !photoInspectionGroup) return;
  photoInspectionGroup.clearLayers();
  if (!manifest || !Array.isArray(manifest.photos)) return;

  activeInspectionManifest = manifest;

  manifest.photos.forEach(photo => {
    if (!photo.actual || photo.actual.lat === undefined) return;
    const lat = photo.actual.lat;
    const lon = photo.actual.lon;
    const sev = photo.severity || 'clean';

    if (photo.footprint && Array.isArray(photo.footprint.coordinates)) {
      L.polygon(photo.footprint.coordinates, {
        color: sev === 'critical' ? '#ef4444' : (sev === 'warning' ? '#f59e0b' : '#38bdf8'),
        weight: 1.5,
        dashArray: '3, 3',
        fillColor: sev === 'critical' ? '#ef4444' : (sev === 'warning' ? '#f59e0b' : '#38bdf8'),
        fillOpacity: 0.15
      }).addTo(photoInspectionGroup);
    }

    const iconHtml = `<div class="photo-marker-icon severity-${sev}" title="${photo.filename}">📸</div>`;
    const icon = L.divIcon({
      className: 'photo-marker-pin-wrapper',
      html: iconHtml,
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });

    const marker = L.marker([lat, lon], { icon }).addTo(photoInspectionGroup);
    
    const popupContent = `
      <div style="font-size: 0.78rem; display: flex; flex-direction: column; gap: 6px; min-width: 180px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <strong>WP #${photo.waypointIndex} • ${photo.filename}</strong>
          <span style="font-size: 0.65rem; padding: 1px 4px; border-radius: 3px; font-weight: 700; ${sev === 'critical' ? 'background:#ef4444;color:#fff;' : (sev === 'warning' ? 'background:#f59e0b;color:#000;' : 'background:#10b981;color:#fff;')}">${sev.toUpperCase()}</span>
        </div>
        <div style="color: var(--text-muted); font-size: 0.72rem; line-height: 1.4;">
          Alt: ${photo.actual.altAgl}m AGL • Pitch: ${photo.actual.gimbalPitch}°<br>
          ΔH: ${photo.variance ? photo.variance.horizontalDeltaMeters : 0}m │ ΔV: ${photo.variance ? photo.variance.verticalDeltaMeters : 0}m
        </div>
        <button type="button" class="btn-primary" style="padding: 4px 8px; font-size: 0.72rem; margin-top: 4px;" onclick="PhotoInspector.open('${photo.photoId}')">
          🔍 Inspect &amp; Annotate
        </button>
      </div>
    `;
    marker.bindPopup(popupContent);
  });
}

function clearPhotoInspectionMapLayer() {
  if (photoInspectionGroup) photoInspectionGroup.clearLayers();
  activeInspectionManifest = null;
}

function openMediaIngestModal() {
  if (typeof document === 'undefined') return;
  const modal = document.getElementById('media-ingest-modal');
  if (!modal) return;
  modal.classList.remove('hidden');

  // Populate active mission window details
  const windowBox = document.getElementById('media-mission-window-box');
  const windowBadge = document.getElementById('ingest-window-count-badge');
  const windowDetails = document.getElementById('ingest-window-details');

  const activeWps = (typeof getCurrentWaypoints === 'function' && Array.isArray(getCurrentWaypoints())) ? getCurrentWaypoints() : [];
  let telem = (typeof FlightDiagnostics !== 'undefined' && FlightDiagnostics.telemetryData) ? FlightDiagnostics.telemetryData : null;

  if (windowBadge) {
    windowBadge.textContent = `${activeWps.length} Waypoints`;
  }

  if (windowDetails) {
    if (telem && telem.flightDate) {
      const flightDateStr = new Date(telem.flightDate).toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
      const durationStr = telem.durationFormatted || '—';
      windowDetails.textContent = `Flight: ${FlightDiagnostics.selectedFlightId || 'Active Flight'} • ${flightDateStr} • Duration: ${durationStr}`;
    } else if (activeWps.length > 0) {
      const firstWp = activeWps[0];
      windowDetails.textContent = `Active Workspace Mission • Lat: ${firstWp.lat.toFixed(5)}°, Lon: ${firstWp.lon.toFixed(5)}° • ${activeWps.length} points`;
    } else {
      windowDetails.textContent = `Workspace has no planned waypoints. Defaulting to all recently captured images.`;
    }
  }

  scanMediaDevices();
}

function closeMediaIngestModal() {
  if (typeof document === 'undefined') return;
  const modal = document.getElementById('media-ingest-modal');
  if (modal) modal.classList.add('hidden');
}

async function scanMediaDevices() {
  const list = document.getElementById('media-devices-list');
  if (!list) return;
  list.innerHTML = 'Scanning for connected DJI aircraft, SD cards, and RC 2 controllers...';

  try {
    const apiBase = (typeof getCompanionApiBase === 'function') ? getCompanionApiBase() : 'http://127.0.0.1:8765';
    const res = await fetch(`${apiBase}/api/media/detect`);
    const data = await res.json();
    if (data.success && Array.isArray(data.devices) && data.devices.length > 0) {
      list.innerHTML = '';
      data.devices.forEach(dev => {
        const item = document.createElement('div');
        item.style.cssText = 'background: rgba(255,255,255,0.03); padding: 6px 10px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.06); display: flex; justify-content: space-between; align-items: center;';
        item.innerHTML = `
          <div>
            <strong>${dev.name}</strong>
            <div style="font-size: 0.7rem; color: var(--text-muted);">${dev.type === 'drive' ? `${dev.photoCount || 0} JPGs, ${dev.rawCount || 0} DNGs` : (dev.isDrone ? 'Direct Aircraft USB' : 'Controller Album')}</div>
          </div>
          <span style="color: #34d399; font-weight: 700; font-size: 0.7rem;">Ready ✓</span>
        `;
        list.appendChild(item);
      });
    } else {
      list.innerHTML = `
        <div style="color: var(--text-muted); font-style: italic;">
          No Mini 4 Pro or SD card media detected.<br>
          <span style="font-size: 0.72rem; color: #f59e0b;">Tip: Connect drone via USB-C (powered on) or insert SD card into reader.</span>
        </div>
      `;
    }
  } catch (e) {
    list.innerHTML = `<div style="color: #f87171;">Unable to contact Aalaapi Bridge on port 8765. Ensure <code>start-bridge.bat</code> is running.</div>`;
  }
}

// RC 2 Controller Flight Log Explorer & Manager
