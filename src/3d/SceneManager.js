function init3DPreview() {
  cleanup3DPreview();
  recalculateSplitStarts();

  const container = document.getElementById('three-container');
  if (!container) return;

  const waypoints = getCurrentWaypoints();
  if (!waypoints || waypoints.length === 0) {
    container.innerHTML = `<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #94a3b8; font-size: 0.9rem;">Please place a flight center and generate waypoints first.</div>`;
    return;
  }
  container.innerHTML = ""; // Clear existing canvas or loader

  // 1. Create Scene & Dark Cyber Background
  threeScene = new THREE.Scene();
  threeScene.background = new THREE.Color(0x070a13);
  threeScene.fog = new THREE.FogExp2(0x070a13, 0.0005);

  // 2. Create Renderer
  const width = container.clientWidth;
  const height = container.clientHeight;
  threeRenderer = new THREE.WebGLRenderer({ antialias: true });
  threeRenderer.setSize(width, height);
  threeRenderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(threeRenderer.domElement);

  // 3. Create Camera
  threeCamera = new THREE.PerspectiveCamera(45, width / height, 1, 2000);
  
  // 4. Orbit Controls for Navigation
  threeControls = new THREE.OrbitControls(threeCamera, threeRenderer.domElement);
  threeControls.enableDamping = true;
  threeControls.dampingFactor = 0.05;
  threeControls.maxPolarAngle = Math.PI / 2 - 0.01; // Avoid camera clipping below ground level
  threeControls.minDistance = 10;
  threeControls.maxDistance = 1000;
  threeControls.autoRotate = autoRotate3D;
  threeControls.autoRotateSpeed = 1.0;

  // 5. Setup Lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
  threeScene.add(ambientLight);

  const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.2);
  dirLight1.position.set(200, 400, 200);
  threeScene.add(dirLight1);
  threeSunLight = dirLight1;

  // Luminous physical 3D Sun sphere representation in the sky dome
  try {
    const sunGeo = new THREE.SphereGeometry(14, 16, 16);
    const sunMat = new THREE.MeshBasicMaterial({
      color: 0xfff5cc,
      wireframe: false
    });
    threeSunMesh = new THREE.Mesh(sunGeo, sunMat);
    threeSunMesh.position.copy(dirLight1.position);
    threeScene.add(threeSunMesh);
  } catch (err) {
    console.warn('Could not initialize 3D Sun Mesh:', err);
  }

  const dirLight2 = new THREE.DirectionalLight(0x06b6d4, 0.6); // Subtle cyan fill light
  dirLight2.position.set(-200, 200, -200);
  threeScene.add(dirLight2);

  // Align directional light with active solar ephemeris if available
  if (typeof update3DSunPosition === 'function') {
    update3DSunPosition();
  }

  // 6. Calculate Bounding Box of Waypoints to scale scene
  let minX = Infinity, maxX = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  let maxAlt = 0;

  waypoints.forEach(wp => {
    if (wp.x < minX) minX = wp.x;
    if (wp.x > maxX) maxX = wp.x;
    const z = -wp.y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
    if (wp.alt > maxAlt) maxAlt = wp.alt;
  });

  const sizeX = maxX - minX;
  const sizeZ = maxZ - minZ;
  const maxSpan = Math.max(sizeX, sizeZ, 100);

  // 7. Add Ground Grid at Y = 0
  const gridHelperSize = Math.max(maxSpan * 2.5, 200);
  const gridHelperDivs = 40;
  const gridHelper = new THREE.GridHelper(gridHelperSize, gridHelperDivs, 0x06b6d4, 0x1e293b);
  gridHelper.position.set(0, 0, 0);
  threeScene.add(gridHelper);

  // Add 2D Map Image to the Ground Plane
  try {
    const C_EARTH = 40075016.686;
    let cLat = 0, cLon = 0;
    if (centerMarker && typeof centerMarker.getLatLng === 'function') {
      const centerLatLng = centerMarker.getLatLng();
      cLat = centerLatLng.lat;
      cLon = centerLatLng.lng;
    } else if (waypoints && waypoints.length > 0) {
      cLat = waypoints[0].lat;
      cLon = waypoints[0].lon !== undefined ? waypoints[0].lon : (waypoints[0].lng || 0);
    }

    // Dynamically adjust tileZoom based on the maximum span of waypoints from the flight center (0,0)
    let maxHalfSpan = 50; // default minimum
    waypoints.forEach(wp => {
      maxHalfSpan = Math.max(maxHalfSpan, Math.abs(wp.x), Math.abs(-wp.y));
    });

    // We want the 3x3 tile grid (total width = 3 * tileWidthMeters) to be at least 2.4 * maxHalfSpan
    // So tileWidthMeters > 0.8 * maxHalfSpan
    let tileZoom = 18;
    let tileWidthMeters = C_EARTH * Math.cos(cLat * Math.PI / 180) / Math.pow(2, tileZoom);
    while (tileZoom > 10 && tileWidthMeters <= maxHalfSpan * 0.8) {
      tileZoom--;
      tileWidthMeters = C_EARTH * Math.cos(cLat * Math.PI / 180) / Math.pow(2, tileZoom);
    }

    // LatLng to fractional Web Mercator tile coordinate
    const sinLat = Math.sin(cLat * Math.PI / 180);
    const xTileFrac = ((cLon + 180) / 360) * Math.pow(2, tileZoom);
    const yTileFrac = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * Math.pow(2, tileZoom);

    const xTileCenter = Math.floor(xTileFrac);
    const yTileCenter = Math.floor(yTileFrac);

    const planeSize = tileWidthMeters * 3; // 3x3 tiles grid

    // Offsets of the centerMarker (0,0) relative to the top-left tile origin in tile units
    const distX_tiles = xTileFrac - (xTileCenter - 1);
    const distY_tiles = yTileFrac - (yTileCenter - 1);

    // Plane offset to align texture coordinate exactly with our Three.js origin
    const planeOffsetX = (1.5 - distX_tiles) * tileWidthMeters;
    const planeOffsetZ = (1.5 - distY_tiles) * tileWidthMeters;

    const groundGeom = new THREE.PlaneGeometry(planeSize, planeSize);
    
    // Create temporary canvas to merge the 9 tiles
    const groundCanvas = document.createElement('canvas');
    groundCanvas.width = 768;
    groundCanvas.height = 768;
    const ctx = groundCanvas.getContext('2d');

    // Fill with dark theme placeholder
    ctx.fillStyle = "#070a13";
    ctx.fillRect(0, 0, 768, 768);

    // Pre-draw grid on canvas
    ctx.strokeStyle = "rgba(6, 182, 212, 0.15)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 12; i++) {
      const coord = i * 64;
      ctx.beginPath(); ctx.moveTo(coord, 0); ctx.lineTo(coord, 768); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, coord); ctx.lineTo(768, coord); ctx.stroke();
    }

    const groundTexture = new THREE.CanvasTexture(groundCanvas);
    const groundMaterial = new THREE.MeshBasicMaterial({
      map: groundTexture,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95
    });

    const groundMesh = new THREE.Mesh(groundGeom, groundMaterial);
    groundMesh.rotation.x = -Math.PI / 2; // Lie flat on Y plane
    groundMesh.position.set(planeOffsetX, -0.2, planeOffsetZ); // Position slightly below Y=0 grid
    threeScene.add(groundMesh);

    // Cache variables for FPV immediately so they are available right away
    threeGroundCanvas = groundCanvas;
    threeGroundCtx = ctx;
    threeGroundTexture = groundTexture;
    groundPlaneOffsetX = planeOffsetX;
    groundPlaneOffsetZ = planeOffsetZ;
    groundPlaneSize = planeSize;
    // Fetch tiles asynchronously based on Leaflet active layer
    const isSatellite = map.hasLayer(satelliteLayer);
    const isEsriStreet = typeof esriStreetLayer !== 'undefined' && esriStreetLayer && map.hasLayer(esriStreetLayer);
    const isLocal = isLocalhostEnvironment();
    let loadedTilesCount = 0;
    const tileImages = [];

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const tileX = xTileCenter + dx;
        const tileY = yTileCenter + dy;
        const img = new Image();
        img.crossOrigin = "anonymous";

        let url = "";
        if (isSatellite) {
          url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${tileZoom}/${tileY}/${tileX}`;
        } else if (isEsriStreet || isLocal) {
          url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/${tileZoom}/${tileY}/${tileX}`;
        } else {
          url = `https://tile.openstreetmap.org/${tileZoom}/${tileX}/${tileY}.png`;
        }
        if (typeof getBridgeProxyUrl === 'function') {
          url = getBridgeProxyUrl(url);
        }

        tileImages.push({ img, dx: dx + 1, dy: dy + 1 });

        img.onload = img.onerror = function() {
          loadedTilesCount++;
          if (loadedTilesCount === 9) {
            // Draw all tiles in order
            ctx.fillStyle = "#070a13";
            ctx.fillRect(0, 0, 768, 768);
            
            tileImages.forEach(t => {
              try {
                ctx.drawImage(t.img, t.dx * 256, t.dy * 256, 256, 256);
              } catch(e) {}
              ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
              ctx.lineWidth = 1;
              ctx.strokeRect(t.dx * 256, t.dy * 256, 256, 256);
            });
            
            // Draw the grid lines
            ctx.strokeStyle = "rgba(6, 182, 212, 0.15)";
            ctx.lineWidth = 1;
            for (let i = 0; i <= 12; i++) {
              const coord = i * 64;
              ctx.beginPath(); ctx.moveTo(coord, 0); ctx.lineTo(coord, 768); ctx.stroke();
              ctx.beginPath(); ctx.moveTo(0, coord); ctx.lineTo(768, coord); ctx.stroke();
            }

            // Cache variables for FPV toggling
            threeGroundCanvas = groundCanvas;
            threeGroundCtx = ctx;
            threeGroundTexture = groundTexture;
            groundPlaneOffsetX = planeOffsetX;
            groundPlaneOffsetZ = planeOffsetZ;
            groundPlaneSize = planeSize;
            cachedTileImages = tileImages;

            // Draw coverage heatmap
            drawCoverageHeatmap(ctx, planeOffsetX, planeOffsetZ, planeSize);
            groundTexture.needsUpdate = true;
          }
        };

        img.src = url;
      }
    }
  } catch (err) {
    Logger.warn("Failed to initialize ground map texture:", err);
  }

  // Add Axes Helper (Red = East, Green = Up, Blue = South)
  const axesHelper = new THREE.AxesHelper(30);
  axesHelper.position.set(0, 0.1, 0);
  threeScene.add(axesHelper);

  // Add compass ring
  const ringGeom = new THREE.RingGeometry(15, 16, 32);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4, side: THREE.DoubleSide, transparent: true, opacity: 0.4 });
  const compassRing = new THREE.Mesh(ringGeom, ringMat);
  compassRing.rotation.x = Math.PI / 2;
  compassRing.position.set(0, 0.05, 0);
  threeScene.add(compassRing);

  // Arrow pointing North (negative Z)
  const arrowHelper = new THREE.ArrowHelper(
    new THREE.Vector3(0, 0, -1),
    new THREE.Vector3(0, 0.1, 0),
    18,
    0xef4444,
    4,
    2
  );
  threeScene.add(arrowHelper);

  // 8. Plot Waypoints, Cones, and Ground Lines
  recreate3DWaypointsAndPaths();

  // 9. Reset view
  reset3DCamera();

  // 10. Animation render loop
  let lastTime = performance.now();
  const animate = () => {
    threeAnimationId = requestAnimationFrame(animate);
    
    const now = performance.now();
    const dt = (now - lastTime) / 1000;
    lastTime = now;

    if (fpvActive) {
      updateFPVCamera(dt);
    } else {
      if (threeControls) threeControls.update();
    }

    if (threeRenderer && threeScene && threeCamera) {
      threeRenderer.render(threeScene, threeCamera);
    }
  };
  animate();

  window.addEventListener('resize', handle3DResize);
  setTimeout(handle3DResize, 50);
  setTimeout(handle3DResize, 250);
}

// Reset camera to fit bounding box
function reset3DCamera() {
  if (!threeCamera || !threeControls) return;

  const waypoints = getCurrentWaypoints();
  if (!waypoints || waypoints.length === 0) return;

  let minX = Infinity, maxX = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  let maxAlt = 0;

  waypoints.forEach(wp => {
    if (wp.x < minX) minX = wp.x;
    if (wp.x > maxX) maxX = wp.x;
    const z = -wp.y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
    if (wp.alt > maxAlt) maxAlt = wp.alt;
  });

  const centerWpX = (minX + maxX) / 2;
  const centerWpZ = (minZ + maxZ) / 2;
  const sizeX = maxX - minX;
  const sizeZ = maxZ - minZ;
  const maxSpan = Math.max(sizeX, sizeZ, 100);

  threeCamera.position.set(centerWpX + maxSpan * 1.2, maxAlt + maxSpan * 0.8, centerWpZ + maxSpan * 1.2);
  threeControls.target.set(centerWpX, maxAlt * 0.4, centerWpZ);
  threeControls.update();
}

/**
 * Updates Three.js directional sunlight and shadow frustum orientation
 * to match calculated solar azimuth and elevation.
 * In Three.js coordinates:
 * - X is East
 * - Y is Altitude / Up
 * - Z is South (so North is -Z)
 */
function update3DSunPosition() {
  if (!threeSunLight || typeof SolarEphemeris === 'undefined') return;

  let pos = null;
  if (typeof currentSolarEphemeris !== 'undefined' && currentSolarEphemeris && currentSolarEphemeris.currentPosition) {
    pos = currentSolarEphemeris.currentPosition;
  } else {
    const effectiveTime = (typeof MissionClock !== 'undefined' && typeof MissionClock.getEffectiveTime === 'function')
      ? MissionClock.getEffectiveTime()
      : new Date();
    if (typeof centerMarker !== 'undefined' && centerMarker && typeof centerMarker.getLatLng === 'function') {
      const ll = centerMarker.getLatLng();
      pos = SolarEphemeris.getSunPosition(effectiveTime, ll.lat, ll.lng);
    } else {
      pos = SolarEphemeris.getSunPosition(effectiveTime, 41.3215, -88.9950);
    }
  }

  if (!pos) return;

  const isNight = pos.altitudeDeg <= 0;
  let targetAzDeg = pos.azimuthDeg || 180;
  let targetAltDeg = pos.altitudeDeg || 45;
  let isMoonMode = false;

  const isNightAllowed = (typeof isNightCelestialHudEnabled === 'function') ? isNightCelestialHudEnabled() : true;

  if (isNight && isNightAllowed && typeof SolarEphemeris.getMoonPosition === 'function') {
    const effectiveTime = (typeof MissionClock !== 'undefined' && typeof MissionClock.getEffectiveTime === 'function')
      ? MissionClock.getEffectiveTime()
      : (typeof currentSolarEphemeris !== 'undefined' && currentSolarEphemeris && currentSolarEphemeris.now ? currentSolarEphemeris.now : new Date());

    let lat = 41.3215, lon = -88.9950;
    if (typeof centerMarker !== 'undefined' && centerMarker && typeof centerMarker.getLatLng === 'function') {
      const ll = centerMarker.getLatLng();
      lat = ll.lat;
      lon = ll.lng;
    }
    const moonPos = SolarEphemeris.getMoonPosition(effectiveTime, lat, lon);
    if (moonPos && moonPos.altitudeDeg > 0) {
      targetAzDeg = moonPos.azimuthDeg;
      targetAltDeg = moonPos.altitudeDeg;
      isMoonMode = true;
    }
  }

  const azRad = targetAzDeg * (Math.PI / 180);
  const altRad = Math.max(0.02, targetAltDeg) * (Math.PI / 180);

  const radius = 600;
  // Celestial position in sky:
  // Azimuth 0 = North (-Z), 90 = East (+X), 180 = South (+Z), 270 = West (-X)
  const celX = radius * Math.cos(altRad) * Math.sin(azRad);
  const celY = Math.max(20, radius * Math.sin(altRad));
  const celZ = -radius * Math.cos(altRad) * Math.cos(azRad);

  threeSunLight.position.set(celX, celY, celZ);
  if (threeSunLight.target && typeof threeScene !== 'undefined' && threeScene) {
    threeSunLight.target.position.set(0, 0, 0);
  }

  // Update physical Celestial Sphere position & appearance
  if (threeSunMesh) {
    threeSunMesh.position.set(celX, celY, celZ);
    if (isMoonMode) {
      threeSunMesh.visible = true;
      if (threeSunMesh.material) {
        // Soft silvery moonlight glow
        threeSunMesh.material.color.setHex(0xe0f2fe);
      }
    } else if (pos.altitudeDeg <= 0) {
      threeSunMesh.visible = false;
    } else {
      threeSunMesh.visible = true;
      if (threeSunMesh.material) {
        if (pos.altitudeDeg < 8) {
          // Deep golden / amber sunset/sunrise
          threeSunMesh.material.color.setHex(0xf97316);
        } else if (pos.altitudeDeg < 25) {
          // Warm golden hour
          threeSunMesh.material.color.setHex(0xfbbf24);
        } else {
          // Bright daylight sun
          threeSunMesh.material.color.setHex(0xfffbeb);
        }
      }
    }
  }

  // Modulate intensity & color based on solar/lunar elevation and cloud attenuation
  const sky = (typeof SolarEphemeris !== 'undefined' && typeof SolarEphemeris.getEffectiveSkyCover === 'function')
    ? SolarEphemeris.getEffectiveSkyCover()
    : { directLightFactor: 1.0, isOvercast: false };

  if (isMoonMode) {
    threeSunLight.intensity = 0.35;
    if (threeSunLight.color && typeof threeSunLight.color.setHex === 'function') {
      threeSunLight.color.setHex(0xbae6fd); // Silvery moonlight tint
    }
  } else if (pos.altitudeDeg <= 0) {
    threeSunLight.intensity = 0.15;
    if (threeSunLight.color && typeof threeSunLight.color.setHex === 'function') {
      threeSunLight.color.setHex(0xffffff);
    }
  } else if (pos.altitudeDeg < 15) {
    const baseIntensity = 0.5 + (pos.altitudeDeg / 15) * 0.5;
    threeSunLight.intensity = baseIntensity * Math.max(0.25, sky.directLightFactor);
    if (threeSunLight.color && typeof threeSunLight.color.setHex === 'function') {
      threeSunLight.color.setHex(0xffffff);
    }
  } else {
    const baseIntensity = 1.2;
    threeSunLight.intensity = baseIntensity * Math.max(0.25, sky.directLightFactor);
    if (threeSunLight.color && typeof threeSunLight.color.setHex === 'function') {
      threeSunLight.color.setHex(sky.isOvercast ? 0xe2e8f0 : 0xffffff);
    }
  }
}

if (typeof window !== 'undefined') {
  window.update3DSunPosition = update3DSunPosition;
}

// ==========================================
// 3D FPV WALKTHROUGH & EDITOR MODE
// ==========================================

