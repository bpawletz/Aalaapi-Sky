function updateFPVCamera(dt) {
  const activeCamera = threeCamera || (typeof global !== 'undefined' && global.threeCamera) || (typeof window !== 'undefined' && window.threeCamera);
  const activeScene = threeScene || (typeof global !== 'undefined' && global.threeScene) || (typeof window !== 'undefined' && window.threeScene);
  if (!activeCamera || !activeScene) return;

  const waypoints = getCurrentWaypoints();
  if (!waypoints || waypoints.length === 0) {
    toggleFPVWalkthrough(false);
    return;
  }

  // Handle Photo Flash Fade Out
  const flashOverlay = document.getElementById('fpv-flash-overlay');
  if (flashOverlay && fpvPhotoFlashActive) {
    let opacity = parseFloat(flashOverlay.style.opacity) || 0;
    opacity -= dt * 6.0; // fade quickly
    if (opacity <= 0) {
      opacity = 0;
      fpvPhotoFlashActive = false;
    }
    flashOverlay.style.opacity = opacity;
  }

  // Handle Playback Traversal
  if (fpvPlaying && !fpvPhotoDelayTimer) {
    const p1 = waypoints[fpvProgressIndex];
    const p2 = waypoints[fpvProgressIndex + 1];

    if (p2) {
      const p1x = (p1 && typeof p1.x === 'number' && !isNaN(p1.x)) ? p1.x : 0;
      const p1y = (p1 && typeof p1.y === 'number' && !isNaN(p1.y)) ? p1.y : 0;
      const p1alt = (p1 && typeof p1.alt === 'number' && !isNaN(p1.alt)) ? p1.alt : 50;
      const p2x = (typeof p2.x === 'number' && !isNaN(p2.x)) ? p2.x : 0;
      const p2y = (typeof p2.y === 'number' && !isNaN(p2.y)) ? p2.y : 0;
      const p2alt = (typeof p2.alt === 'number' && !isNaN(p2.alt)) ? p2.alt : 50;

      // Calculate realistic speed-based interpolation step
      const dx = p2x - p1x;
      const dy = p2alt - p1alt;
      const dz = (-p2y) - (-p1y);
      const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
      
      const speed = getEffectiveWaypointSpeed(p1);
      const stepTime = dist / (speed > 0 ? speed : 5); // time in seconds
      
      if (stepTime > 0.05) {
        fpvSubInterpolation += (dt / stepTime) * fpvSpeed;
      } else {
        fpvSubInterpolation = 1.0;
      }

      if (fpvSubInterpolation >= 1.0) {
        // Arrived at next waypoint!
        fpvSubInterpolation = 0.0;
        fpvProgressIndex++;
        
        // Sync scrubber slider and text
        const scrubberSlider = document.getElementById('fpv-wp-scrubber-slider');
        const scrubberText = document.getElementById('fpv-wp-scrubber-text');
        if (scrubberSlider) scrubberSlider.value = fpvProgressIndex + 1;
        if (scrubberText) scrubberText.textContent = `${fpvProgressIndex + 1} / ${waypoints.length}`;

        if (fpvProgressIndex < waypoints.length) {
          const wp = waypoints[fpvProgressIndex];
          const effAction = getEffectiveWaypointCameraAction(wp);
          const isStopAndShoot = (effAction === 'stopAndShoot' || effAction === 'takePhoto');
          const isVideo = (effAction === 'video');

          if (!isVideo) {
            const hoverDuration = getEffectiveWaypointHoverTime(wp);
            triggerFPVPhotoCapture(hoverDuration);
          }
        }
      }
    } else {
      // Reached the end of flight path
      fpvPlaying = false;
      fpvSubInterpolation = 0.0;
      fpvProgressIndex = waypoints.length - 1;
      
      // Stop recording if active
      if (fpvRecordTimer) {
        clearInterval(fpvRecordTimer);
        fpvRecordTimer = null;
      }
      
      const playPauseBtn = document.getElementById('fpv-btn-play-pause');
      if (playPauseBtn) {
        const playIcon = document.getElementById('fpv-icon-play');
        const pauseIcon = document.getElementById('fpv-icon-pause');
        if (playIcon) playIcon.classList.remove('hidden');
        if (pauseIcon) pauseIcon.classList.add('hidden');
      }
      
      const mediaDot = document.getElementById('fpv-media-dot');
      const mediaText = document.getElementById('fpv-media-text');
      if (mediaDot && mediaText) {
        mediaDot.style.background = '#10b981';
        mediaText.textContent = 'Mission Complete';
      }
      
      // Open editor panel and update to final waypoint
      const editorPanel = document.getElementById('fpv-editor-panel');
      if (editorPanel) editorPanel.classList.remove('hidden');
      updateFPVEditorUI();
    }
  }

  // Calculate FPV Position & Orientation
  const p1 = waypoints[fpvProgressIndex];
  const p2 = waypoints[fpvProgressIndex + 1];
  const p1x = (p1 && typeof p1.x === 'number' && !isNaN(p1.x)) ? p1.x : 0;
  const p1y = (p1 && typeof p1.y === 'number' && !isNaN(p1.y)) ? p1.y : 0;
  const p1alt = (p1 && typeof p1.alt === 'number' && !isNaN(p1.alt)) ? p1.alt : 50;

  let currentPos = new THREE.Vector3();
  let heading = 0;
  let pitch = 0;

  if (p2 && fpvPlaying) {
    const p2x = (typeof p2.x === 'number' && !isNaN(p2.x)) ? p2.x : 0;
    const p2y = (typeof p2.y === 'number' && !isNaN(p2.y)) ? p2.y : 0;
    const p2alt = (typeof p2.alt === 'number' && !isNaN(p2.alt)) ? p2.alt : 50;

    currentPos.x = THREE.MathUtils.lerp(p1x, p2x, fpvSubInterpolation);
    currentPos.y = THREE.MathUtils.lerp(p1alt, p2alt, fpvSubInterpolation);
    currentPos.z = THREE.MathUtils.lerp(-p1y, -p2y, fpvSubInterpolation);

    const hp1 = getWaypointHeadingAndPitch(fpvProgressIndex, waypoints);
    const hp2 = getWaypointHeadingAndPitch(fpvProgressIndex + 1, waypoints);

    // Interpolate heading handling 0/360 wrap-around
    let h1 = hp1.heading;
    let h2 = hp2.heading;
    let diff = h2 - h1;
    if (diff > 180) diff -= 360;
    else if (diff < -180) diff += 360;
    heading = h1 + diff * fpvSubInterpolation;

    pitch = THREE.MathUtils.lerp(hp1.pitch, hp2.pitch, fpvSubInterpolation);
  } else {
    currentPos.set(p1x, p1alt, (-p1y === 0 ? 0 : -p1y));
    const hp = getWaypointHeadingAndPitch(fpvProgressIndex, waypoints);
    heading = hp.heading;
    pitch = hp.pitch;
  }

  // Update FPV Active Drone Mesh Position and Direction
  if (fpvActiveDroneMesh) {
    fpvActiveDroneMesh.position.copy(currentPos);
    const yawRad = -heading * Math.PI / 180;
    fpvActiveDroneMesh.rotation.y = yawRad;
    const pitchRad = pitch * Math.PI / 180;
    if (fpvActiveDroneMesh.userData && fpvActiveDroneMesh.userData.gimbalGroup) {
      fpvActiveDroneMesh.userData.gimbalGroup.rotation.x = -pitchRad;
    }
    fpvActiveDroneMesh.visible = (fpvActive && fpvCameraMode === 'follow');
  }

  // Update FPV Camera Position and Direction
  const yawRad = -heading * Math.PI / 180;
  const pitchRad = pitch * Math.PI / 180;

  if (fpvCameraMode === 'follow') {
    // Cinematic Movie Follow Cam: positioned behind and above the flying drone, looking forward
    const followDist = 10;
    const heightOffset = 4;
    activeCamera.position.set(
      currentPos.x + Math.sin(yawRad) * followDist,
      currentPos.y + heightOffset,
      currentPos.z + Math.cos(yawRad) * followDist
    );
    const lookAhead = 14;
    activeCamera.lookAt(
      currentPos.x - Math.sin(yawRad) * lookAhead,
      currentPos.y + 0.5,
      currentPos.z - Math.cos(yawRad) * lookAhead
    );
  } else {
    // Cockpit View: camera at drone position, looking through gimbal
    activeCamera.position.copy(currentPos);
    activeCamera.rotation.set(pitchRad, yawRad, 0, 'YXZ');
  }

  // Update HUD Telemetry Labels
  const telemetryAlt = document.getElementById('fpv-telemetry-alt');
  const telemetrySpeed = document.getElementById('fpv-telemetry-speed');
  const telemetryWp = document.getElementById('fpv-telemetry-wp');
  
  if (telemetryAlt) telemetryAlt.textContent = Math.round(currentPos.y);
  if (telemetrySpeed) {
    const currentSpeed = fpvPlaying ? getEffectiveWaypointSpeed(p1) : 0;
    telemetrySpeed.textContent = (currentSpeed * fpvSpeed).toFixed(1);
  }
  if (telemetryWp) telemetryWp.textContent = `${fpvProgressIndex + 1} / ${waypoints.length}`;

  // Dynamically redraw active camera footprint ellipse on ground plane (throttled to avoid GPU stalls)
  if (showFootprints) {
    const now = performance.now();
    const timeSinceLastRedraw = now - lastFpvRedrawTime;
    const headingDiff = lastFpvHeading === null ? 999 : Math.abs(heading - lastFpvHeading);
    const pitchDiff = lastFpvPitch === null ? 999 : Math.abs(pitch - lastFpvPitch);
    const distDiff = lastFpvX === null ? 999 : Math.hypot(currentPos.x - lastFpvX, currentPos.z - lastFpvZ);

    if (timeSinceLastRedraw > 100 && (headingDiff >= 0.5 || pitchDiff >= 0.5 || distDiff >= 0.5 || timeSinceLastRedraw > 300)) {
      lastFpvRedrawTime = now;
      lastFpvHeading = heading;
      lastFpvPitch = pitch;
      lastFpvX = currentPos.x;
      lastFpvZ = currentPos.z;
      redrawGroundPlane(heading, pitch);
    }
  }
}
function triggerFPVPhotoCapture(hoverDurationSeconds = 0) {
  const flashOverlay = document.getElementById('fpv-flash-overlay');
  const mediaDot = document.getElementById('fpv-media-dot');
  const mediaText = document.getElementById('fpv-media-text');

  if (hoverDurationSeconds > 0) {
    if (mediaDot && mediaText) {
      mediaDot.style.background = '#f59e0b';
      mediaText.textContent = `Hovering (${hoverDurationSeconds}s)`;
    }

    const delayMs = (hoverDurationSeconds * 1000) / (fpvSpeed || 1.0);
    fpvPhotoDelayTimer = setTimeout(() => {
      fpvPhotoDelayTimer = null;
      
      // Trigger the photo flash at the END of the hover duration
      if (flashOverlay) flashOverlay.style.opacity = '1.0';
      fpvPhotoFlashActive = true;
      
      if (mediaDot && mediaText) {
        mediaDot.style.background = '#10b981';
        mediaText.textContent = 'Photo Captured';
        setTimeout(() => {
          if (mediaText && mediaText.textContent === 'Photo Captured') {
            mediaText.textContent = 'Ready';
          }
        }, 800);
      }
    }, delayMs);
  } else {
    // No hover duration: trigger photo immediately
    if (flashOverlay) flashOverlay.style.opacity = '1.0';
    fpvPhotoFlashActive = true;

    if (mediaDot && mediaText) {
      mediaDot.style.background = '#10b981';
      mediaText.textContent = 'Photo Captured';
      setTimeout(() => {
        if (mediaText && mediaText.textContent === 'Photo Captured') {
          mediaText.textContent = 'Ready';
        }
      }, 800);
    }
  }
}

function startFPVVideoRecording() {
  const mediaDot = document.getElementById('fpv-media-dot');
  const mediaText = document.getElementById('fpv-media-text');
  const mediaTimer = document.getElementById('fpv-media-timer');

  if (mediaDot && mediaText && mediaTimer) {
    mediaDot.style.background = '#ef4444';
    mediaText.textContent = 'Recording Video';
    mediaTimer.classList.remove('hidden');
    
    fpvRecordSeconds = 0;
    mediaTimer.textContent = '00:00';

    if (fpvRecordTimer) clearInterval(fpvRecordTimer);
    fpvRecordTimer = setInterval(() => {
      if (fpvPlaying) {
        fpvRecordSeconds++;
        const mins = Math.floor(fpvRecordSeconds / 60).toString().padStart(2, '0');
        const secs = (fpvRecordSeconds % 60).toString().padStart(2, '0');
        mediaTimer.textContent = `${mins}:${secs}`;
      }
    }, 1000);
  }
}

function toggleFPVWalkthrough(enable) {
  const hudOverlay = document.getElementById('fpv-hud-overlay');
  const fpvBtnIndicator = document.getElementById('indicator-3d-fpv');
  const editorPanel = document.getElementById('fpv-editor-panel');
  const playPauseBtn = document.getElementById('fpv-btn-play-pause');
  const instructions = document.getElementById('three-instructions');

  if (enable) {
    fpvActive = true;
    fpvPlaying = false;
    fpvProgressIndex = 0;
    fpvSubInterpolation = 0.0;
    lastFpvHeading = null;
    lastFpvPitch = null;
    lastFpvX = null;
    lastFpvZ = null;
    lastFpvRedrawTime = 0;

    if (conesGroup) conesGroup.visible = false;
    
    // Save original camera view
    const activeCamera = threeCamera || (typeof global !== 'undefined' && global.threeCamera) || (typeof window !== 'undefined' && window.threeCamera);
    const activeControls = threeControls || (typeof global !== 'undefined' && global.threeControls) || (typeof window !== 'undefined' && window.threeControls);
    if (activeCamera && activeControls) {
      fpvOriginalCamPos = activeCamera.position.clone();
      fpvOriginalCamTarget = activeControls.target.clone();
      activeControls.enabled = false;
    }

    if (hudOverlay) hudOverlay.classList.remove('hidden');
    if (fpvBtnIndicator) fpvBtnIndicator.style.background = '#10b981';
    if (instructions) instructions.classList.add('hidden');
    const hudLegend = document.getElementById('three-hud-legend') || document.querySelector('.hud-legend');
    if (hudLegend) hudLegend.classList.add('hidden');
    
    // Always open editor panel initially since we start paused
    if (editorPanel) editorPanel.classList.remove('hidden');
    
    if (playPauseBtn) {
      const playIcon = document.getElementById('fpv-icon-play');
      const pauseIcon = document.getElementById('fpv-icon-pause');
      if (playIcon) playIcon.classList.remove('hidden');
      if (pauseIcon) pauseIcon.classList.add('hidden');
    }

    const waypoints = getCurrentWaypoints();
    const effCap = (waypoints && waypoints[0]) ? getEffectiveWaypointCameraAction(waypoints[0]) : (document.getElementById('capture-mode')?.value || 'stopAndShoot');
    if (effCap === 'video') {
      startFPVVideoRecording();
    } else {
      const mediaDot = document.getElementById('fpv-media-dot');
      const mediaText = document.getElementById('fpv-media-text');
      const mediaTimer = document.getElementById('fpv-media-timer');
      if (mediaDot && mediaText) {
        mediaDot.style.background = '#10b981';
        mediaText.textContent = 'Ready';
      }
      if (mediaTimer) mediaTimer.classList.add('hidden');
    }

    // Create active flying drone mesh if not present
    const activeScene = threeScene || (typeof global !== 'undefined' && global.threeScene) || (typeof window !== 'undefined' && window.threeScene);
    if (!fpvActiveDroneMesh && activeScene) {
      fpvActiveDroneMesh = create3DDroneMesh(0x06b6d4, 0.85);
      activeScene.add(fpvActiveDroneMesh);
    }
    if (fpvActiveDroneMesh) {
      fpvActiveDroneMesh.visible = (fpvCameraMode === 'follow');
    }

    // Hide static waypoint drone meshes so only waypoint spheres and the active flying drone are visible
    if (waypointsGroup && waypointsGroup.children) {
      waypointsGroup.children.forEach(child => {
        if (child.userData && child.userData.isWaypointDrone) {
          child.visible = false;
        }
        if (child.userData && child.userData.isWaypointSphere) {
          child.visible = true;
        }
      });
    }

    setFPVCameraMode(fpvCameraMode);

    const hp = getWaypointHeadingAndPitch(0, getCurrentWaypoints() || []);
    redrawGroundPlane(hp.heading, hp.pitch); // Draw active FPV footprint if enabled
    updateFPVEditorUI();
  } else {
    // Exit FPV Mode
    fpvActive = false;
    fpvPlaying = false;
    lastFpvHeading = null;
    lastFpvPitch = null;
    lastFpvX = null;
    lastFpvZ = null;
    lastFpvRedrawTime = 0;

    if (fpvActiveDroneMesh) {
      fpvActiveDroneMesh.visible = false;
    }

    // Restore static waypoint drone meshes
    if (waypointsGroup && waypointsGroup.children) {
      waypointsGroup.children.forEach(child => {
        if (child.userData && child.userData.isWaypointDrone) {
          child.visible = showDroneModels;
        }
        if (child.userData && child.userData.isWaypointSphere) {
          child.visible = !showDroneModels;
        }
      });
    }

    if (conesGroup) conesGroup.visible = showCones;
    
    if (fpvPhotoDelayTimer) {
      clearTimeout(fpvPhotoDelayTimer);
      fpvPhotoDelayTimer = null;
    }
    if (fpvRecordTimer) {
      clearInterval(fpvRecordTimer);
      fpvRecordTimer = null;
    }

    if (hudOverlay) hudOverlay.classList.add('hidden');
    if (fpvBtnIndicator) fpvBtnIndicator.style.background = '#ef4444';
    if (editorPanel) editorPanel.classList.add('hidden');
    if (instructions) instructions.classList.remove('hidden');
    const hudLegend = document.getElementById('three-hud-legend') || document.querySelector('.hud-legend');
    if (hudLegend) hudLegend.classList.remove('hidden');

    // Restore original camera position and targets
    const activeCamera = threeCamera || (typeof global !== 'undefined' && global.threeCamera) || (typeof window !== 'undefined' && window.threeCamera);
    const activeControls = threeControls || (typeof global !== 'undefined' && global.threeControls) || (typeof window !== 'undefined' && window.threeControls);
    if (activeCamera && activeControls) {
      activeControls.enabled = true;
      if (fpvOriginalCamPos && fpvOriginalCamTarget) {
        activeCamera.position.copy(fpvOriginalCamPos);
        activeControls.target.copy(fpvOriginalCamTarget);
        activeControls.update();
      } else {
        reset3DCamera();
      }
    }

    redrawGroundPlane(0, 0); // Restore green footprint highlights
  }
}

function updateFPVEditorUI() {
  const waypoints = getCurrentWaypoints();
  if (!waypoints || !waypoints[fpvProgressIndex]) return;

  const wp = waypoints[fpvProgressIndex];

  const latNum = parseFloat(wp.lat);
  const lonNum = parseFloat(wp.lon);

  // Title and coords
  const wpIndexSpan = document.getElementById('fpv-editor-wp-index');
  const coordsSpan = document.getElementById('fpv-editor-coords');
  if (wpIndexSpan) wpIndexSpan.textContent = fpvProgressIndex + 1;
  if (coordsSpan) {
    coordsSpan.textContent = (!isNaN(latNum) && !isNaN(lonNum)) ? `${latNum.toFixed(6)}, ${lonNum.toFixed(6)}` : '';
  }

  // Altitude with unit conversion
  const unit = getUnitSystem();
  const altVal = document.getElementById('fpv-edit-alt-val');
  const altUnit = document.getElementById('fpv-edit-alt-unit');
  const altSlider = document.getElementById('fpv-edit-alt');
  const altDisp = unit === 'imperial' ? Math.round(wp.alt * M_TO_FT) : Math.round(wp.alt);
  if (altVal) altVal.textContent = altDisp;
  if (altUnit) altUnit.textContent = unit === 'imperial' ? 'ft' : 'm';
  if (altSlider) altSlider.value = Math.round(wp.alt);

  // Pitch
  const wpLayer = (wp.layerId && typeof flightLayers !== 'undefined') ? flightLayers.find(l => l.id === wp.layerId) : ((typeof getActiveLayer === 'function') ? getActiveLayer() : null);
  const gimbalPitchEl = document.getElementById('gimbal-pitch');
  const defaultGimbalPitch = (wpLayer && wpLayer.gimbalPitch !== undefined) ? wpLayer.gimbalPitch : (gimbalPitchEl ? gimbalPitchEl.value : -60);
  const rawPitch = (wp.pitch !== undefined && wp.pitch !== null) ? wp.pitch : defaultGimbalPitch;
  const isAutoPitch = (rawPitch === 'auto') || (typeof rawPitch === 'string' && rawPitch.toLowerCase() === 'auto');

  let resolvedPitch;
  if (isAutoPitch) {
    const targetPoi = (typeof getTargetPoiCoordinates === 'function') ? getTargetPoiCoordinates(wp, wpLayer) : null;
    resolvedPitch = (typeof calculate3DPoiPitch === 'function') ? calculate3DPoiPitch(wp, targetPoi, wp.alt || 50) : -45;
  } else {
    resolvedPitch = parseGimbalPitch(rawPitch, -60);
  }

  const pitchVal = document.getElementById('fpv-edit-pitch-val');
  const pitchSlider = document.getElementById('fpv-edit-pitch');
  if (pitchVal) pitchVal.textContent = isAutoPitch ? `Auto 🎯 (${Math.round(resolvedPitch)})` : Math.round(resolvedPitch);
  if (pitchSlider) pitchSlider.value = Math.round(resolvedPitch);

  // Lat / Lon precision inputs
  const latInput = document.getElementById('fpv-edit-lat');
  const lonInput = document.getElementById('fpv-edit-lon');
  if (latInput && document.activeElement !== latInput) {
    latInput.value = !isNaN(latNum) ? latNum.toFixed(7) : '';
  }
  if (lonInput && document.activeElement !== lonInput) {
    lonInput.value = !isNaN(lonNum) ? lonNum.toFixed(7) : '';
  }

  // Waypoint Scrubber Slider Sync
  const scrubberSlider = document.getElementById('fpv-wp-scrubber-slider');
  const scrubberText = document.getElementById('fpv-wp-scrubber-text');
  if (scrubberSlider && scrubberText && waypoints) {
    scrubberSlider.max = waypoints.length;
    if (document.activeElement !== scrubberSlider) {
      scrubberSlider.value = fpvProgressIndex + 1;
    }
    scrubberText.textContent = `${fpvProgressIndex + 1} / ${waypoints.length}`;
  }

  // D-Pad step display
  const stepDisplay = document.getElementById('fpv-nudge-step-display');
  const stepLabels = unit === 'imperial' ? ['1 ft', '5 ft', '20 ft'] : ['0.2m', '1m', '5m'];
  if (stepDisplay) stepDisplay.textContent = stepLabels[fpvNudgeStepIndex] || stepLabels[1];

  // Speed Override
  const speedVal = document.getElementById('fpv-edit-speed-val');
  const speedSlider = document.getElementById('fpv-edit-speed');
  if (speedSlider && speedVal) {
    if (document.activeElement !== speedSlider) {
      speedSlider.value = wp.speed || 5;
    }
    if (wp.speed) {
      speedVal.textContent = `${wp.speed} m/s`;
    } else {
      const wpLayer = (wp.layerId && typeof flightLayers !== 'undefined') ? flightLayers.find(l => l.id === wp.layerId) : ((typeof getActiveLayer === 'function') ? getActiveLayer() : null);
      let resolvedSpeed = 4.0;
      if (wp.isTurnaroundPoint && wp.turnaroundSpeed !== null && wp.turnaroundSpeed !== undefined && !isNaN(wp.turnaroundSpeed)) {
        resolvedSpeed = wp.turnaroundSpeed;
      } else if (wpLayer && wpLayer.speed !== undefined && wpLayer.speed !== null && !isNaN(wpLayer.speed)) {
        resolvedSpeed = wpLayer.speed;
      } else {
        const speedEl = document.getElementById('speed');
        resolvedSpeed = speedEl ? (parseFloat(speedEl.value) || 4.0) : 4.0;
      }
      speedVal.textContent = `Auto (${resolvedSpeed.toFixed(1)} m/s)`;
    }
  }

  // Hover Duration
  const hoverVal = document.getElementById('fpv-edit-hover-val');
  const hoverSlider = document.getElementById('fpv-edit-hover');
  if (hoverSlider && hoverVal) {
    const hasCustomHover = (wp.hoverTime !== null && wp.hoverTime !== undefined && wp.hoverTime !== 'inherit');
    const wpLayer = (wp.layerId && typeof flightLayers !== 'undefined') ? flightLayers.find(l => l.id === wp.layerId) : ((typeof getActiveLayer === 'function') ? getActiveLayer() : null);
    const resolvedHover = hasCustomHover ? wp.hoverTime : getEffectiveLayerHoverTime(wpLayer);
    if (document.activeElement !== hoverSlider) {
      hoverSlider.value = resolvedHover;
    }
    hoverVal.textContent = hasCustomHover ? `${resolvedHover}s` : `${resolvedHover}s (Inherited)`;
  }

  // Turn Mode
  const turnModeSelect = document.getElementById('fpv-edit-turn-mode');
  const turnModeInheritOpt = document.getElementById('fpv-edit-turn-mode-inherit-opt');
  if (turnModeSelect) {
    if (turnModeInheritOpt) {
      const effPath = (wp.layerPathMode && wp.layerPathMode !== 'inherit') ? wp.layerPathMode : (document.getElementById('path-mode')?.value || 'curved');
      const resolvedTurnLabel = effPath === 'straight' ? 'Stop & Turn' : 'Curved Pass';
      turnModeInheritOpt.textContent = `🌐 Inherit Layer (${resolvedTurnLabel})`;
    }
    turnModeSelect.value = wp.turnMode || 'inherit';
  }

  // Camera Action
  const cameraActionSelect = document.getElementById('fpv-edit-camera-action');
  const cameraActionInheritOpt = document.getElementById('fpv-edit-camera-action-inherit-opt');
  const zoomContainer = document.getElementById('fpv-edit-zoom-container');
  if (cameraActionSelect) {
    if (cameraActionInheritOpt) {
      const effCap = (wp.layerCaptureMode && wp.layerCaptureMode !== 'inherit') ? wp.layerCaptureMode : (document.getElementById('capture-mode')?.value || 'stopAndShoot');
      const capLabel = effCap === 'stopAndShoot' ? 'Stop & Shoot' : (effCap === 'video' ? 'Video Mode' : 'Continuous Flight');
      cameraActionInheritOpt.textContent = `🌐 Inherit Layer (${capLabel})`;
    }
    cameraActionSelect.value = wp.cameraAction || 'inherit';
    if (zoomContainer) {
      zoomContainer.style.display = (wp.cameraAction === 'zoom') ? 'flex' : 'none';
    }
  }

  // Camera Zoom
  const zoomVal = document.getElementById('fpv-edit-zoom-val');
  const zoomSlider = document.getElementById('fpv-edit-zoom');
  if (zoomSlider && zoomVal) {
    if (document.activeElement !== zoomSlider) {
      zoomSlider.value = wp.zoom || 1.0;
    }
    zoomVal.textContent = (wp.zoom || 1.0).toFixed(1);
  }

  // Heading/Yaw Mode and Value
  const headingVal = document.getElementById('fpv-edit-heading-val');
  const headingSlider = document.getElementById('fpv-edit-heading');
  const headingModeSelect = document.getElementById('fpv-edit-heading-mode');
  const headingModeInheritOpt = document.getElementById('fpv-edit-heading-mode-inherit-opt');

  if (headingModeSelect) {
    const mode = wp.headingMode || 'inherit';
    headingModeSelect.value = mode;

    const wpLayer = (wp.layerId && typeof flightLayers !== 'undefined') ? flightLayers.find(l => l.id === wp.layerId) : ((typeof getActiveLayer === 'function') ? getActiveLayer() : null);

    if (headingModeInheritOpt) {
      const effHeading = (wp.layerHeadingMode && wp.layerHeadingMode !== 'inherit') ? wp.layerHeadingMode : getEffectiveLayerHeadingMode(wpLayer);
      const mapHeadingName = {
        'followWayline': 'Follow Flight Path',
        'fixed': 'Fixed North',
        'towardPOI': 'Point of Interest (POI)',
        'custom': 'Custom Angle'
      };
      const resolvedHeadingLabel = mapHeadingName[effHeading] || effHeading;
      headingModeInheritOpt.textContent = `🌐 Inherit Layer Default (${resolvedHeadingLabel})`;
    }

    if (headingVal && headingSlider) {
      const rotEl = document.getElementById('grid-rotation');
      const rotationDeg = rotEl ? (parseFloat(rotEl.value) || 0) : 0;
      const autoHead = getDefaultHeading(fpvProgressIndex, waypoints, rotationDeg);

      let displayAngle = 0;
      let effectiveMode = mode;
      if (mode === 'inherit') {
        effectiveMode = getEffectiveLayerHeadingMode(wpLayer);
      }

      let standardRoadFacing = 0;
      if (effectiveMode === 'followWayline') {
        displayAngle = autoHead;
      } else if (effectiveMode === 'fixed') {
        displayAngle = 0;
      } else if (effectiveMode === 'towardPOI') {
        const targetPoi = getTargetPoiCoordinates(wp, wpLayer);
        if (targetPoi) {
          const latRad = wp.lat * Math.PI / 180;
          const dy = (targetPoi.lat - wp.lat) * 111139;
          const dx = (targetPoi.lon - wp.lon) * 111139 * Math.cos(latRad);
          displayAngle = (90 - (Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360;
        } else {
          displayAngle = 0;
        }
      } else if (effectiveMode === 'custom') {
        displayAngle = wp.heading !== null && wp.heading !== undefined ? wp.heading : autoHead;
      }

      const poiSelect = document.getElementById('fpv-edit-poi-select');
      if (poiSelect && typeof poiSelect.appendChild === 'function') {
        poiSelect.innerHTML = '';
        const isInheritedPoi = !wp.targetPoiId || wp.targetPoiId === 'inherit';
        const effectivePoiIdx = (!isInheritedPoi && wp.targetPoiId && Array.isArray(pois) && pois.findIndex(p => p.id === wp.targetPoiId) !== -1)
          ? pois.findIndex(p => p.id === wp.targetPoiId)
          : (!isInheritedPoi && wp.poiIndex !== undefined && wp.poiIndex !== null ? wp.poiIndex : null);

        let layerPoiName = 'Default (POI 0)';
        if (wpLayer && wpLayer.targetPoiId && wpLayer.targetPoiId !== 'inherit' && Array.isArray(pois)) {
          const lp = pois.find(p => p.id === wpLayer.targetPoiId);
          if (lp) layerPoiName = lp.name;
        } else if (Array.isArray(pois) && pois[0]) {
          layerPoiName = pois[0].name;
        }

        const inheritOpt = document.createElement('option');
        inheritOpt.value = 'inherit';
        inheritOpt.textContent = `🌐 Inherit Layer POI (${layerPoiName})`;
        if (isInheritedPoi) inheritOpt.selected = true;
        poiSelect.appendChild(inheritOpt);

        if (Array.isArray(pois)) {
          pois.forEach((poi, idx) => {
            const opt = document.createElement('option');
            opt.value = idx;
            opt.textContent = poi.name;
            if (!isInheritedPoi && idx === effectivePoiIdx) {
              opt.selected = true;
            }
            poiSelect.appendChild(opt);
          });
        }
        poiSelect.style.display = (effectiveMode === 'towardPOI') ? 'block' : 'none';
      }

      if (mode === 'custom') {
        headingSlider.style.display = 'block';
        headingSlider.value = Math.round(displayAngle);
        headingVal.textContent = `${Math.round(displayAngle)}°`;
      } else {
        headingSlider.style.display = 'none';
        headingVal.textContent = `${Math.round(displayAngle)}°`;
      }
    }
  }

  // Save & Reset button visibility
  const resetBtn = document.getElementById('fpv-btn-reset-wp');
  const saveBtn = document.getElementById('fpv-btn-save-wp');
  if (resetBtn || saveBtn) {
    const isModifiedFromOrig = (
      wp.isModified ||
      (wp.origLat !== undefined && wp.origLat !== null && Math.abs(wp.lat - wp.origLat) > 1e-9) ||
      (wp.origLon !== undefined && wp.origLon !== null && Math.abs(wp.lon - wp.origLon) > 1e-9) ||
      (wp.origAlt !== undefined && wp.origAlt !== null && Math.abs(wp.alt - wp.origAlt) > 1e-3) ||
      (wp.origPitch !== undefined && wp.origPitch !== null && wp.pitch !== wp.origPitch) ||
      (wp.origSpeed !== undefined && wp.speed !== wp.origSpeed) ||
      (wp.origHoverTime !== undefined && wp.hoverTime !== wp.origHoverTime) ||
      (wp.origTurnMode !== undefined && wp.turnMode !== wp.origTurnMode) ||
      (wp.origCameraAction !== undefined && wp.cameraAction !== wp.origCameraAction) ||
      (wp.origZoom !== undefined && wp.zoom !== wp.origZoom) ||
      ((wp.origHeadingMode || 'inherit') !== (wp.headingMode || 'inherit')) ||
      ((wp.origPoiIndex || 0) !== (wp.poiIndex || 0)) ||
      (wp.headingMode === 'custom' && wp.origHeading !== null && wp.heading !== wp.origHeading)
    );
    if (resetBtn) resetBtn.style.display = isModifiedFromOrig ? 'inline-block' : 'none';
    if (saveBtn) saveBtn.style.display = (wp.hasDraftEdits || (isModifiedFromOrig && !wp.isModified)) ? 'inline-block' : 'none';
  }

  // Update FPV Leg Phase Badges & Boundary Controls (v1.82.0)
  const totalCount = waypoints.length || 1;
  const isStartWp = (fpvProgressIndex === 0);
  const isEndWp = (totalCount > 1 && fpvProgressIndex === totalCount - 1);

  const altBadgeContainer = document.getElementById('fpv-alt-phase-badge-container');
  const pitchBadgeContainer = document.getElementById('fpv-pitch-phase-badge-container');
  const speedBadgeContainer = document.getElementById('fpv-speed-phase-badge-container');
  const hoverBadgeContainer = document.getElementById('fpv-hover-phase-badge-container');
  const turnBadgeContainer = document.getElementById('fpv-turn-phase-badge-container');
  const cameraBadgeContainer = document.getElementById('fpv-camera-phase-badge-container');
  const zoomBadgeContainer = document.getElementById('fpv-zoom-phase-badge-container');
  const headingBadgeContainer = document.getElementById('fpv-heading-phase-badge-container');

  const speedControlContainer = document.getElementById('fpv-edit-speed-container');
  const turnModeControlContainer = document.getElementById('fpv-edit-turn-mode-container');
  const speedNaNotice = document.getElementById('fpv-speed-na-notice');
  const turnNaNotice = document.getElementById('fpv-turn-na-notice');

  if (altBadgeContainer) altBadgeContainer.innerHTML = buildLegPhaseBadgeHTML('at', fpvProgressIndex, totalCount, 'Altitude');
  if (pitchBadgeContainer) pitchBadgeContainer.innerHTML = buildLegPhaseBadgeHTML('at', fpvProgressIndex, totalCount, 'Gimbal Pitch');
  if (hoverBadgeContainer) hoverBadgeContainer.innerHTML = buildLegPhaseBadgeHTML('at', fpvProgressIndex, totalCount, 'Hover Time');
  if (cameraBadgeContainer) cameraBadgeContainer.innerHTML = buildLegPhaseBadgeHTML('at', fpvProgressIndex, totalCount, 'Camera Action');
  if (zoomBadgeContainer) zoomBadgeContainer.innerHTML = buildLegPhaseBadgeHTML('at', fpvProgressIndex, totalCount, 'Camera Zoom');

  const headingPhase = isStartWp ? 'at' : 'pre';
  const headingCustomDesc = isStartWp
    ? 'Executes at Takeoff: Drone rotates on-axis to initial heading before commencing flight.'
    : undefined;
  if (headingBadgeContainer) headingBadgeContainer.innerHTML = buildLegPhaseBadgeHTML(headingPhase, fpvProgressIndex, totalCount, 'Heading Mode', headingCustomDesc);

  const speedPhase = isEndWp ? 'na' : 'post';
  const speedCustomDesc = isEndWp
    ? 'No departure leg exists. The drone comes to a full stop at this final waypoint to execute Mission Landing / RTH.'
    : undefined;
  if (speedBadgeContainer) speedBadgeContainer.innerHTML = buildLegPhaseBadgeHTML(speedPhase, fpvProgressIndex, totalCount, 'Flight Speed', speedCustomDesc);

  const turnPhase = isEndWp ? 'na' : 'transition';
  const turnCustomDesc = isEndWp
    ? 'End of route: The drone must stop at the final destination coordinate before RTH or mission finish.'
    : undefined;
  if (turnBadgeContainer) turnBadgeContainer.innerHTML = buildLegPhaseBadgeHTML(turnPhase, fpvProgressIndex, totalCount, 'Turn Mode', turnCustomDesc);

  // Apply boundary disabled styling to Speed & Turn Mode on final waypoint
  if (speedControlContainer) {
    if (isEndWp) {
      speedControlContainer.classList.add('wp-leg-control-disabled');
      if (speedSlider) speedSlider.disabled = true;
      if (speedVal) speedVal.textContent = 'N/A';
      if (speedNaNotice) speedNaNotice.style.display = 'block';
    } else {
      speedControlContainer.classList.remove('wp-leg-control-disabled');
      if (speedSlider) speedSlider.disabled = false;
      if (speedNaNotice) speedNaNotice.style.display = 'none';
    }
  }

  if (turnModeControlContainer) {
    if (isEndWp) {
      turnModeControlContainer.classList.add('wp-leg-control-disabled');
      if (turnModeSelect) turnModeSelect.disabled = true;
      if (turnNaNotice) turnNaNotice.style.display = 'block';
    } else {
      turnModeControlContainer.classList.remove('wp-leg-control-disabled');
      if (turnModeSelect) turnModeSelect.disabled = false;
      if (turnNaNotice) turnNaNotice.style.display = 'none';
    }
  }
}

function fpvDeleteWaypoint() {
  const waypoints = getCurrentWaypoints();
  if (!waypoints || waypoints.length <= 2) {
    alert("Cannot delete waypoint: a flight plan must contain at least 2 waypoints.");
    return;
  }

  const gridType = document.getElementById('grid-type')?.value;
  const isRoadFollow = (gridType === 'road-following');
  const label = isRoadFollow ? 'Road Node / Waypoint' : 'Waypoint';
  if (confirm(`Are you sure you want to delete ${label} ${fpvProgressIndex + 1}?`)) {
    const wp = (waypoints && waypoints.length > fpvProgressIndex) ? waypoints[fpvProgressIndex] : null;
    deleteFlightWaypoint(wp, fpvProgressIndex);

    const currentWps = getCurrentWaypoints();
    if (fpvProgressIndex >= currentWps.length) {
      fpvProgressIndex = Math.max(0, currentWps.length - 1);
    }
    fpvSubInterpolation = 0.0;

    // Refresh FPV Editor sliders to active point
    updateFPVEditorUI();

    if (fpvActive) {
      updateFPVCamera(0);
    }
  }
}

function fpvInsertWaypoint() {
  const waypoints = getCurrentWaypoints();
  if (!waypoints || waypoints.length === 0) return;

  const currentWp = waypoints[fpvProgressIndex];
  const nextWp = waypoints[fpvProgressIndex + 1];

  let newX, newY, newAlt, newHeading, newPitch;

  if (nextWp) {
    newX = (currentWp.x + nextWp.x) / 2;
    newY = (currentWp.y + nextWp.y) / 2;
    newAlt = (currentWp.alt + nextWp.alt) / 2;
    newHeading = currentWp.heading;
    newPitch = currentWp.pitch;
  } else {
    // Extrapolate forward slightly based on waypoint heading orientation
    const hp = getWaypointHeadingAndPitch(fpvProgressIndex, waypoints);
    const rad = (hp.heading * Math.PI) / 180;
    newX = currentWp.x + 20 * Math.sin(rad);
    newY = currentWp.y + 20 * Math.cos(rad);
    newAlt = currentWp.alt;
    newHeading = currentWp.heading;
    newPitch = currentWp.pitch;
  }

  let geo;
  if (centerMarker) {
    const centerLatLng = centerMarker.getLatLng();
    geo = localToGeodetic(newX, newY, centerLatLng.lat, centerLatLng.lng, 0);
  } else {
    const R_EARTH = 6378137.0;
    const latRad = currentWp.lat * Math.PI / 180.0;
    geo = {
      lat: currentWp.lat + (20 / R_EARTH) * (180.0 / Math.PI),
      lon: currentWp.lon + (20 / (R_EARTH * Math.cos(latRad))) * (180.0 / Math.PI)
    };
  }

  const targetLayer = (currentWp && currentWp.layerId && typeof flightLayers !== 'undefined' && Array.isArray(flightLayers))
    ? flightLayers.find(l => l.id === currentWp.layerId)
    : (typeof getActiveLayer === 'function' ? getActiveLayer() : null);

  const newWp = {
    x: newX,
    y: newY,
    lat: geo.lat,
    lon: geo.lon,
    alt: newAlt,
    pitch: newPitch,
    heading: newHeading,
    headingMode: 'inherit',
    poiIndex: 0,
    origLat: geo.lat,
    origLon: geo.lon,
    origAlt: newAlt,
    origPitch: newPitch,
    origHeading: newHeading,
    origHeadingMode: 'inherit',
    origPoiIndex: 0,
    origX: newX,
    origY: newY,
    isModified: true,
    layerId: targetLayer ? targetLayer.id : (currentWp ? currentWp.layerId : null),
    layerName: targetLayer ? targetLayer.name : (currentWp ? currentWp.layerName : null),
    layerPattern: targetLayer ? targetLayer.pattern : (currentWp ? currentWp.layerPattern : null)
  };

  waypoints.splice(fpvProgressIndex + 1, 0, newWp);

  // Re-index
  waypoints.forEach((wp, idx) => {
    wp.idx = idx;
  });

  if (targetLayer && targetLayer.pattern === 'freeform') {
    if (!Array.isArray(targetLayer.freeformWaypoints)) targetLayer.freeformWaypoints = [];
    let fIdx = targetLayer.freeformWaypoints.indexOf(currentWp);
    if (fIdx !== -1) {
      targetLayer.freeformWaypoints.splice(fIdx + 1, 0, newWp);
    } else {
      targetLayer.freeformWaypoints.push(newWp);
    }
    targetLayer.freeformWaypoints.forEach((w, newIdx) => { w.idx = newIdx; });
    targetLayer.waypoints = targetLayer.freeformWaypoints.slice();
  }

  // Target focus on the newly inserted waypoint
  fpvProgressIndex++;
  fpvSubInterpolation = 0.0;

  // Redraw overlays and UI
  if (targetLayer && targetLayer.pattern === 'freeform' && typeof updateGrid === 'function') {
    updateGrid();
  } else {
    redrawCurrentMission();
    if (typeof renderLayersList === 'function') renderLayersList();
    recreate3DWaypointsAndPaths();
  }
  updateFPVEditorUI();

  if (fpvActive) {
    updateFPVCamera(0);
  }
}

// Bind all FPV mode HUD buttons and sliders
function setupFPVListeners() {
  const btn3dFpv = document.getElementById('btn-3d-fpv');
  if (btn3dFpv) {
    btn3dFpv.addEventListener('click', () => {
      toggleFPVWalkthrough(!fpvActive);
    });
  }

  // Play / Pause
  const playPauseBtn = document.getElementById('fpv-btn-play-pause');
  if (playPauseBtn) {
    playPauseBtn.addEventListener('click', () => {
      const waypoints = getCurrentWaypoints();
      if (!waypoints || waypoints.length === 0) return;

      // Rewind to start if at the end of flight path
      if (!fpvPlaying && fpvProgressIndex >= waypoints.length - 1) {
        fpvProgressIndex = 0;
        fpvSubInterpolation = 0.0;
        const scrubberSlider = document.getElementById('fpv-wp-scrubber-slider');
        if (scrubberSlider) scrubberSlider.value = 1;
        const scrubberText = document.getElementById('fpv-wp-scrubber-text');
        if (scrubberText) scrubberText.textContent = `1 / ${waypoints.length}`;
      }

      fpvPlaying = !fpvPlaying;
      
      const playIcon = document.getElementById('fpv-icon-play');
      const pauseIcon = document.getElementById('fpv-icon-pause');
      const editorPanel = document.getElementById('fpv-editor-panel');

      if (fpvPlaying) {
        if (playIcon) playIcon.classList.add('hidden');
        if (pauseIcon) pauseIcon.classList.remove('hidden');
        if (editorPanel) editorPanel.classList.add('hidden');

        const mediaDot = document.getElementById('fpv-media-dot');
        const mediaText = document.getElementById('fpv-media-text');
        if (mediaDot && mediaText && mediaText.textContent === 'Mission Complete') {
          mediaDot.style.background = '#10b981';
          mediaText.textContent = 'Ready';
        }
        
        // If recording video, make sure timer starts
        const effCap = getEffectiveWaypointCameraAction(waypoints[fpvProgressIndex]);
        if (effCap === 'video' && !fpvRecordTimer) {
          startFPVVideoRecording();
        }
      } else {
        if (fpvPhotoDelayTimer) {
          clearTimeout(fpvPhotoDelayTimer);
          fpvPhotoDelayTimer = null;
        }
        if (playIcon) playIcon.classList.remove('hidden');
        if (pauseIcon) pauseIcon.classList.add('hidden');
        if (editorPanel) editorPanel.classList.remove('hidden');
        updateFPVEditorUI();
      }
    });
  }

  // Stop / Exit FPV Walkthrough
  const stopBtn = document.getElementById('fpv-btn-stop');
  if (stopBtn) {
    stopBtn.addEventListener('click', () => {
      toggleFPVWalkthrough(false);
    });
  }

  // Step Backward
  const stepBackBtn = document.getElementById('fpv-btn-step-back');
  if (stepBackBtn) {
    stepBackBtn.addEventListener('click', () => {
      if (fpvPhotoDelayTimer) {
        clearTimeout(fpvPhotoDelayTimer);
        fpvPhotoDelayTimer = null;
      }
      fpvPlaying = false;
      const playIcon = document.getElementById('fpv-icon-play');
      const pauseIcon = document.getElementById('fpv-icon-pause');
      if (playIcon) playIcon.classList.remove('hidden');
      if (pauseIcon) pauseIcon.classList.add('hidden');

      if (fpvProgressIndex > 0) {
        fpvProgressIndex--;
      }
      fpvSubInterpolation = 0.0;

      const scrubberSlider = document.getElementById('fpv-wp-scrubber-slider');
      const scrubberText = document.getElementById('fpv-wp-scrubber-text');
      const waypoints = getCurrentWaypoints();
      const totalWps = (waypoints && waypoints.length) ? waypoints.length : 1;
      if (scrubberSlider) scrubberSlider.value = fpvProgressIndex + 1;
      if (scrubberText) scrubberText.textContent = `${fpvProgressIndex + 1} / ${totalWps}`;

      const editorPanel = document.getElementById('fpv-editor-panel');
      if (editorPanel) editorPanel.classList.remove('hidden');
      updateFPVEditorUI();
      if (fpvActive) {
        updateFPVCamera(0);
      }
    });
  }

  // Step Forward
  const stepForwardBtn = document.getElementById('fpv-btn-step-forward');
  if (stepForwardBtn) {
    stepForwardBtn.addEventListener('click', () => {
      if (fpvPhotoDelayTimer) {
        clearTimeout(fpvPhotoDelayTimer);
        fpvPhotoDelayTimer = null;
      }
      fpvPlaying = false;
      const playIcon = document.getElementById('fpv-icon-play');
      const pauseIcon = document.getElementById('fpv-icon-pause');
      if (playIcon) playIcon.classList.remove('hidden');
      if (pauseIcon) pauseIcon.classList.add('hidden');

      const waypoints = getCurrentWaypoints();
      if (waypoints && fpvProgressIndex < waypoints.length - 1) {
        fpvProgressIndex++;
      }
      fpvSubInterpolation = 0.0;

      const scrubberSlider = document.getElementById('fpv-wp-scrubber-slider');
      const scrubberText = document.getElementById('fpv-wp-scrubber-text');
      const totalWps = (waypoints && waypoints.length) ? waypoints.length : 1;
      if (scrubberSlider) scrubberSlider.value = fpvProgressIndex + 1;
      if (scrubberText) scrubberText.textContent = `${fpvProgressIndex + 1} / ${totalWps}`;

      const editorPanel = document.getElementById('fpv-editor-panel');
      if (editorPanel) editorPanel.classList.remove('hidden');
      updateFPVEditorUI();
      if (fpvActive) {
        updateFPVCamera(0);
      }
    });
  }

  // Camera View Mode (Movie View vs Cockpit FPV)
  const camModeBtn = document.getElementById('fpv-btn-cam-mode');
  if (camModeBtn) {
    camModeBtn.addEventListener('click', () => {
      setFPVCameraMode(fpvCameraMode === 'follow' ? 'cockpit' : 'follow');
    });
  }

  window.addEventListener('keydown', (e) => {
    if (fpvActive && (e.key === 'c' || e.key === 'C')) {
      const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
      if (activeTag !== 'input' && activeTag !== 'textarea' && activeTag !== 'select') {
        e.preventDefault();
        setFPVCameraMode(fpvCameraMode === 'follow' ? 'cockpit' : 'follow');
      }
    }
  });

  // Traversal Speed Slider
  const speedSlider = document.getElementById('fpv-speed-slider');
  const speedText = document.getElementById('fpv-speed-text');
  if (speedSlider && speedText) {
    speedSlider.addEventListener('input', (e) => {
      fpvSpeed = parseFloat(e.target.value);
      speedText.textContent = `${fpvSpeed.toFixed(1)}x`;
    });
  }

  // Waypoint Progress Scrubber Slider
  const scrubberSlider = document.getElementById('fpv-wp-scrubber-slider');
  if (scrubberSlider) {
    scrubberSlider.addEventListener('input', (e) => {
      if (fpvPhotoDelayTimer) {
        clearTimeout(fpvPhotoDelayTimer);
        fpvPhotoDelayTimer = null;
      }
      const waypoints = getCurrentWaypoints();
      if (!waypoints || waypoints.length === 0) return;
      const targetIdx = parseInt(e.target.value) - 1;
      if (targetIdx >= 0 && targetIdx < waypoints.length) {
        fpvProgressIndex = targetIdx;
        fpvSubInterpolation = 0.0;
        const scrubberText = document.getElementById('fpv-wp-scrubber-text');
        if (scrubberText) scrubberText.textContent = `${targetIdx + 1} / ${waypoints.length}`;
        updateFPVEditorUI();
        if (fpvActive) {
          updateFPVCamera(0);
        }
      }
    });
  }

  // Waypoint Editor Altitude Slider
  const editAltSlider = document.getElementById('fpv-edit-alt');
  const editAltVal = document.getElementById('fpv-edit-alt-val');
  if (editAltSlider && editAltVal) {
    editAltSlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value);
      editAltVal.textContent = val;
      
      const waypoints = getCurrentWaypoints();
      if (waypoints && waypoints[fpvProgressIndex]) {
        waypoints[fpvProgressIndex].alt = val;
        waypoints[fpvProgressIndex].isModified = true;
        waypoints[fpvProgressIndex].hasDraftEdits = true;
        
        const gridType = document.getElementById('grid-type').value;
        if (gridType === 'road-following' && roadWaypoints && roadWaypoints[fpvProgressIndex]) {
          roadWaypoints[fpvProgressIndex].alt = val;
          roadWaypoints[fpvProgressIndex].isModified = true;
        }

        redrawCurrentMission();
        recreate3DWaypointsAndPaths();
        updateFPVEditorUI();
      }
    });
  }

  // Waypoint Editor Gimbal Pitch Slider
  const editPitchSlider = document.getElementById('fpv-edit-pitch');
  const editPitchVal = document.getElementById('fpv-edit-pitch-val');
  if (editPitchSlider && editPitchVal) {
    editPitchSlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value);
      editPitchVal.textContent = val;
      
      const waypoints = getCurrentWaypoints();
      if (waypoints && waypoints[fpvProgressIndex]) {
        waypoints[fpvProgressIndex].pitch = val;
        waypoints[fpvProgressIndex].isModified = true;
        waypoints[fpvProgressIndex].hasDraftEdits = true;
        
        const gridType = document.getElementById('grid-type').value;
        if (gridType === 'road-following' && roadWaypoints && roadWaypoints[fpvProgressIndex]) {
          roadWaypoints[fpvProgressIndex].pitch = val;
          roadWaypoints[fpvProgressIndex].isModified = true;
        }

        redrawCurrentMission();
        recreate3DWaypointsAndPaths();
        updateFPVEditorUI();
        if (fpvActive && typeof updateFPVCamera === 'function') {
          updateFPVCamera(0);
        }
      }
    });
  }

  // Waypoint Editor Yaw Heading Mode Selector
  const editHeadingMode = document.getElementById('fpv-edit-heading-mode');
  const editHeadingSlider = document.getElementById('fpv-edit-heading');
  const editHeadingVal = document.getElementById('fpv-edit-heading-val');
  
  if (editHeadingMode && editHeadingSlider && editHeadingVal) {
    editHeadingMode.addEventListener('change', (e) => {
      const mode = e.target.value;
      const waypoints = getCurrentWaypoints();
      if (waypoints && waypoints[fpvProgressIndex]) {
        waypoints[fpvProgressIndex].headingMode = mode;
        let finalHeading = null;
        if (mode !== 'custom') {
          waypoints[fpvProgressIndex].heading = null;
        } else {
          const rotationDeg = parseFloat(document.getElementById('grid-rotation').value) || 0;
          const autoHead = getDefaultHeading(fpvProgressIndex, waypoints, rotationDeg);
          finalHeading = Math.round(autoHead);
          waypoints[fpvProgressIndex].heading = finalHeading;
        }
        waypoints[fpvProgressIndex].isModified = true;
        waypoints[fpvProgressIndex].hasDraftEdits = true;
        
        const gridType = document.getElementById('grid-type').value;
        if (gridType === 'road-following' && roadWaypoints && roadWaypoints[fpvProgressIndex]) {
          roadWaypoints[fpvProgressIndex].headingMode = mode;
          roadWaypoints[fpvProgressIndex].heading = finalHeading;
          roadWaypoints[fpvProgressIndex].isModified = true;
        }

        redrawCurrentMission();
        recreate3DWaypointsAndPaths();
        updateFPVEditorUI();
        if (fpvActive && typeof updateFPVCamera === 'function') {
          updateFPVCamera(0);
        }
      }
    });

    editHeadingSlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value);
      editHeadingVal.textContent = `${val}°`;
      
      const waypoints = getCurrentWaypoints();
      if (waypoints && waypoints[fpvProgressIndex] && editHeadingMode.value === 'custom') {
        waypoints[fpvProgressIndex].heading = val;
        waypoints[fpvProgressIndex].isModified = true;
        waypoints[fpvProgressIndex].hasDraftEdits = true;
        
        const gridType = document.getElementById('grid-type').value;
        if (gridType === 'road-following' && roadWaypoints && roadWaypoints[fpvProgressIndex]) {
          roadWaypoints[fpvProgressIndex].heading = val;
          roadWaypoints[fpvProgressIndex].isModified = true;
        }

        redrawCurrentMission();
        recreate3DWaypointsAndPaths();
        updateFPVEditorUI();
        if (fpvActive && typeof updateFPVCamera === 'function') {
          updateFPVCamera(0);
        }
      }
    });

    const editPoiSelect = document.getElementById('fpv-edit-poi-select');
    if (editPoiSelect) {
      editPoiSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        const waypoints = getCurrentWaypoints();
        if (waypoints && waypoints[fpvProgressIndex]) {
          if (val === 'inherit') {
            waypoints[fpvProgressIndex].targetPoiId = 'inherit';
          } else {
            const idxVal = parseInt(val);
            waypoints[fpvProgressIndex].poiIndex = idxVal;
            if (pois && pois[idxVal] && pois[idxVal].id) {
              waypoints[fpvProgressIndex].targetPoiId = pois[idxVal].id;
            }
          }
          waypoints[fpvProgressIndex].isModified = true;
          
          const gridType = document.getElementById('grid-type').value;
          if (gridType === 'road-following' && roadWaypoints && roadWaypoints[fpvProgressIndex]) {
            if (val === 'inherit') {
              roadWaypoints[fpvProgressIndex].targetPoiId = 'inherit';
            } else {
              const idxVal = parseInt(val);
              roadWaypoints[fpvProgressIndex].poiIndex = idxVal;
              if (pois && pois[idxVal] && pois[idxVal].id) {
                roadWaypoints[fpvProgressIndex].targetPoiId = pois[idxVal].id;
              }
            }
            roadWaypoints[fpvProgressIndex].isModified = true;
          }

          redrawCurrentMission();
          recreate3DWaypointsAndPaths();
          updateFPVEditorUI();
          if (fpvActive && typeof updateFPVCamera === 'function') {
            updateFPVCamera(0);
          }
        }
      });
    }
  }

  // Speed Override Slider
  const editSpeedSlider = document.getElementById('fpv-edit-speed');
  if (editSpeedSlider) {
    editSpeedSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      const waypoints = getCurrentWaypoints();
      if (waypoints && waypoints[fpvProgressIndex]) {
        waypoints[fpvProgressIndex].speed = val;
        waypoints[fpvProgressIndex].isModified = true;
        waypoints[fpvProgressIndex].hasDraftEdits = true;
        updateFPVEditorUI();
      }
    });
  }

  // Hover Duration Slider
      const editHoverSlider = document.getElementById('fpv-edit-hover');
  if (editHoverSlider) {
    editHoverSlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value);
      const waypoints = getCurrentWaypoints();
      if (waypoints && waypoints[fpvProgressIndex]) {
        waypoints[fpvProgressIndex].hoverTime = val;
        waypoints[fpvProgressIndex].isModified = true;
        waypoints[fpvProgressIndex].hasDraftEdits = true;
        updateFPVEditorUI();
      }
    });
  }

  // Turn Mode Selector
  const editTurnModeSelect = document.getElementById('fpv-edit-turn-mode');
  if (editTurnModeSelect) {
    editTurnModeSelect.addEventListener('change', (e) => {
      const mode = e.target.value;
      const waypoints = getCurrentWaypoints();
      if (waypoints && waypoints[fpvProgressIndex]) {
        waypoints[fpvProgressIndex].turnMode = mode;
        waypoints[fpvProgressIndex].isModified = true;
        waypoints[fpvProgressIndex].hasDraftEdits = true;
        updateFPVEditorUI();
      }
    });
  }

  // Camera Action Selector
  const editCameraActionSelect = document.getElementById('fpv-edit-camera-action');
  if (editCameraActionSelect) {
    editCameraActionSelect.addEventListener('change', (e) => {
      const mode = e.target.value;
      const waypoints = getCurrentWaypoints();
      if (waypoints && waypoints[fpvProgressIndex]) {
        waypoints[fpvProgressIndex].cameraAction = mode;
        waypoints[fpvProgressIndex].isModified = true;
        waypoints[fpvProgressIndex].hasDraftEdits = true;
        updateFPVEditorUI();
      }
    });
  }

  // Camera Zoom Slider
  const editZoomSlider = document.getElementById('fpv-edit-zoom');
  if (editZoomSlider) {
    editZoomSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      const waypoints = getCurrentWaypoints();
      if (waypoints && waypoints[fpvProgressIndex]) {
        waypoints[fpvProgressIndex].zoom = val;
        waypoints[fpvProgressIndex].isModified = true;
        waypoints[fpvProgressIndex].hasDraftEdits = true;
        updateFPVEditorUI();
      }
    });
  }

  // FPV Heading Mode Help Button (v1.88.0)
  const fpvHeadingHelpBtn = document.getElementById('fpv-heading-help-btn');
  if (fpvHeadingHelpBtn) {
    fpvHeadingHelpBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof showHeadingHelpPopover === 'function') showHeadingHelpPopover(fpvHeadingHelpBtn);
    });
  }

  // FPV Editor Toggle Minimize / Expand
  const editorToggleBtn = document.getElementById('fpv-editor-toggle-btn');
  const editorBody = document.getElementById('fpv-editor-body');
  if (editorToggleBtn && editorBody) {
    editorToggleBtn.addEventListener('click', () => {
      const isHidden = editorBody.style.display === 'none';
      editorBody.style.display = isHidden ? 'flex' : 'none';
      editorToggleBtn.textContent = isHidden ? '▼' : '▲';
    });
  }

  // Nudge step display button
  const fpvStepDisplay = document.getElementById('fpv-nudge-step-display');
  if (fpvStepDisplay) {
    fpvStepDisplay.addEventListener('click', () => {
      fpvNudgeStepIndex = (fpvNudgeStepIndex + 1) % 3;
      updateFPVEditorUI();
    });
  }

  // Position Nudge Helper for FPV (fwdDir: +1 forward, -1 backward; rightDir: +1 right, -1 left)
  const fpvNudge = (fwdDir, rightDir, e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    const gridType = document.getElementById('grid-type')?.value;
    if (gridType === 'road-following') {
      if (confirm("Road Follow waypoints are automatically calculated relative to the road offset. Would you like to convert to Freeform mode to move or nudge individual waypoints?")) {
        convertToFreeformMission();
      }
      return;
    }

    const waypoints = getCurrentWaypoints();
    if (!waypoints || !waypoints[fpvProgressIndex]) return;
    const wp = waypoints[fpvProgressIndex];

    const latNum = parseFloat(wp.lat);
    const lonNum = parseFloat(wp.lon);
    if (isNaN(latNum) || isNaN(lonNum)) return;

    const unit = getUnitSystem();
    const steps = unit === 'imperial'
      ? [0.3048, 1.524, 6.096] // 1ft, 5ft, 20ft in meters
      : [0.2, 1.0, 5.0];      // 0.2m, 1m, 5m in meters
    const dist = steps[fpvNudgeStepIndex] !== undefined ? steps[fpvNudgeStepIndex] : steps[1];

    // Get current FPV camera heading angle
    const hp = getWaypointHeadingAndPitch(fpvProgressIndex, waypoints);
    const headingDeg = (hp && hp.heading !== undefined) ? hp.heading : 0;
    const headingRad = headingDeg * Math.PI / 180.0;

    // Transform FPV viewport direction into North/East meter displacements
    const dNorthMeters = (fwdDir * Math.cos(headingRad)) - (rightDir * Math.sin(headingRad));
    const dEastMeters  = (fwdDir * Math.sin(headingRad)) + (rightDir * Math.cos(headingRad));

    const dLatMeters = dNorthMeters * dist;
    const dLonMeters = dEastMeters * dist;

    const R_EARTH = 6378137.0;
    const latRad = latNum * Math.PI / 180.0;
    const deltaLat = (dLatMeters / R_EARTH) * (180.0 / Math.PI);
    const deltaLon = (dLonMeters / (R_EARTH * Math.cos(latRad))) * (180.0 / Math.PI);

    if (wp.origLat === undefined || wp.origLat === null) {
      wp.origLat = wp.lat;
      wp.origLon = wp.lon;
      wp.origX = wp.x;
      wp.origY = wp.y;
    }
    wp.lat = latNum + deltaLat;
    wp.lon = lonNum + deltaLon;
    wp.isModified = true;
    wp.hasDraftEdits = true;

    if (centerMarker) {
      const centerLatLng = centerMarker.getLatLng();
      const offsets = geodeticToLocal(wp.lat, wp.lon, centerLatLng.lat, centerLatLng.lng);
      wp.x = offsets.x;
      wp.y = offsets.y;
    } else {
      const R_EARTH = 6378137.0;
      const dLatMetersOld = (wp.lat - latNum) * Math.PI / 180.0 * R_EARTH;
      const dLonMetersOld = (wp.lon - lonNum) * Math.PI / 180.0 * R_EARTH * Math.cos(latRad);
      wp.x = (wp.x || 0) + dLonMetersOld;
      wp.y = (wp.y || 0) + dLatMetersOld;
    }

    if (gridType === 'road-following' && roadWaypoints && roadWaypoints[fpvProgressIndex]) {
      roadWaypoints[fpvProgressIndex].lat = wp.lat;
      roadWaypoints[fpvProgressIndex].lon = wp.lon;
      roadWaypoints[fpvProgressIndex].x = wp.x;
      roadWaypoints[fpvProgressIndex].y = wp.y;
      roadWaypoints[fpvProgressIndex].isModified = true;
    }

    // Force update DOM text input values and blur focus
    const latInput = document.getElementById('fpv-edit-lat');
    const lonInput = document.getElementById('fpv-edit-lon');
    if (latInput) latInput.value = wp.lat.toFixed(7);
    if (lonInput) lonInput.value = wp.lon.toFixed(7);

    if (wp.mapMarker) {
      wp.mapMarker.setLatLng([wp.lat, wp.lon]);
    }
    if (typeof pathGroup !== 'undefined' && pathGroup) {
      pathGroup.eachLayer(layer => {
        if (layer instanceof L.Polyline && !(layer instanceof L.Polygon)) {
          layer.setLatLngs(waypoints.map(w => [w.lat, w.lon]));
        }
      });
    }

    redrawCurrentMission();
    recreate3DWaypointsAndPaths();
    updateFPVEditorUI();

    if (fpvActive) {
      updateFPVCamera(0);
    }
  };

  const btnN = document.getElementById('fpv-nudge-n-btn');
  const btnS = document.getElementById('fpv-nudge-s-btn');
  const btnE = document.getElementById('fpv-nudge-e-btn');
  const btnW = document.getElementById('fpv-nudge-w-btn');

  if (btnN) btnN.addEventListener('click', (e) => fpvNudge(1, 0, e));  // Forward
  if (btnS) btnS.addEventListener('click', (e) => fpvNudge(-1, 0, e)); // Backward
  if (btnE) btnE.addEventListener('click', (e) => fpvNudge(0, 1, e));  // Right
  if (btnW) btnW.addEventListener('click', (e) => fpvNudge(0, -1, e)); // Left

  // Lat / Lon Text Inputs Real-Time Updating
  const latInput = document.getElementById('fpv-edit-lat');
  const lonInput = document.getElementById('fpv-edit-lon');
  
  const updateFpvCoordsFromInput = () => {
    const waypoints = getCurrentWaypoints();
    if (!waypoints || !waypoints[fpvProgressIndex]) return;
    const wp = waypoints[fpvProgressIndex];

    const latVal = parseFloat(latInput.value);
    const lonVal = parseFloat(lonInput.value);
    if (!isNaN(latVal) && !isNaN(lonVal)) {
      const oldLat = wp.lat;
      const oldLon = wp.lon;

      if (wp.origLat === undefined || wp.origLat === null) {
        wp.origLat = wp.lat;
        wp.origLon = wp.lon;
        wp.origX = wp.x;
        wp.origY = wp.y;
      }
      wp.lat = latVal;
      wp.lon = lonVal;
      wp.isModified = true;
      wp.hasDraftEdits = true;

      if (centerMarker) {
        const centerLatLng = centerMarker.getLatLng();
        const offsets = geodeticToLocal(wp.lat, wp.lon, centerLatLng.lat, centerLatLng.lng);
        wp.x = offsets.x;
        wp.y = offsets.y;
      } else {
        const R_EARTH = 6378137.0;
        const latRad = oldLat * Math.PI / 180.0;
        const dLatMeters = (latVal - oldLat) * Math.PI / 180.0 * R_EARTH;
        const dLonMeters = (lonVal - oldLon) * Math.PI / 180.0 * R_EARTH * Math.cos(latRad);
        wp.x = (wp.x || 0) + dLonMeters;
        wp.y = (wp.y || 0) + dLatMeters;
      }

      const gridType = document.getElementById('grid-type')?.value;
      if (gridType === 'road-following' && roadWaypoints && roadWaypoints[fpvProgressIndex]) {
        roadWaypoints[fpvProgressIndex].lat = wp.lat;
        roadWaypoints[fpvProgressIndex].lon = wp.lon;
        roadWaypoints[fpvProgressIndex].x = wp.x;
        roadWaypoints[fpvProgressIndex].y = wp.y;
        roadWaypoints[fpvProgressIndex].isModified = true;
      }

      if (wp.mapMarker) {
        wp.mapMarker.setLatLng([wp.lat, wp.lon]);
      }
      if (typeof pathGroup !== 'undefined' && pathGroup) {
        pathGroup.eachLayer(layer => {
          if (layer instanceof L.Polyline && !(layer instanceof L.Polygon)) {
            layer.setLatLngs(waypoints.map(w => [w.lat, w.lon]));
          }
        });
      }

      redrawCurrentMission();
      recreate3DWaypointsAndPaths();
      updateFPVEditorUI();

      if (fpvActive) {
        updateFPVCamera(0);
      }
    }
  };

  if (latInput) latInput.addEventListener('input', throttle(updateFpvCoordsFromInput, 32));
  if (lonInput) lonInput.addEventListener('input', throttle(updateFpvCoordsFromInput, 32));

  // Save Waypoint
  const fpvSaveBtn = document.getElementById('fpv-btn-save-wp');
  if (fpvSaveBtn) {
    fpvSaveBtn.addEventListener('click', (e) => {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      const waypoints = getCurrentWaypoints();
      if (!waypoints || !waypoints[fpvProgressIndex]) return;
      const wp = waypoints[fpvProgressIndex];

      const latInput = document.getElementById('fpv-edit-lat');
      const lonInput = document.getElementById('fpv-edit-lon');
      const altInput = document.getElementById('fpv-edit-alt');
      const pitchInput = document.getElementById('fpv-edit-pitch');
      const speedInput = document.getElementById('fpv-edit-speed');
      const hoverInput = document.getElementById('fpv-edit-hover');
      const turnModeInput = document.getElementById('fpv-edit-turn-mode');
      const cameraActionInput = document.getElementById('fpv-edit-camera-action');
      const zoomInput = document.getElementById('fpv-edit-zoom');
      const headingModeInput = document.getElementById('fpv-edit-heading-mode');
      const headingInput = document.getElementById('fpv-edit-heading');
      const poiInput = document.getElementById('fpv-edit-poi-select');

      const latNum = latInput ? parseFloat(latInput.value) : parseFloat(wp.lat);
      const lonNum = lonInput ? parseFloat(lonInput.value) : parseFloat(wp.lon);
      if (!isNaN(latNum)) wp.lat = latNum;
      if (!isNaN(lonNum)) wp.lon = lonNum;

      if (altInput) wp.alt = parseFloat(altInput.value);
      if (pitchInput) wp.pitch = parseFloat(pitchInput.value);
      if (speedInput) wp.speed = parseFloat(speedInput.value);
      if (hoverInput) wp.hoverTime = parseInt(hoverInput.value);
      if (turnModeInput) wp.turnMode = turnModeInput.value;
      if (cameraActionInput) wp.cameraAction = cameraActionInput.value;
      if (zoomInput) wp.zoom = parseFloat(zoomInput.value);

      if (headingModeInput) {
        wp.headingMode = headingModeInput.value;
        if (wp.headingMode === 'custom' && headingInput) {
          wp.heading = parseFloat(headingInput.value);
        } else if (wp.headingMode !== 'custom') {
          wp.heading = null;
        }
      }
      if (poiInput) {
        if (poiInput.value === 'inherit') {
          wp.targetPoiId = 'inherit';
        } else {
          wp.poiIndex = parseInt(poiInput.value);
          if (pois && pois[wp.poiIndex] && pois[wp.poiIndex].id) {
            wp.targetPoiId = pois[wp.poiIndex].id;
          }
        }
      }

      wp.isRingStart = true;
      wp.isModified = true;
      wp.hasDraftEdits = false;

      const gridType = document.getElementById('grid-type')?.value;
      if (gridType === 'road-following' && roadWaypoints && roadWaypoints[fpvProgressIndex]) {
        if (!isNaN(latNum)) roadWaypoints[fpvProgressIndex].lat = latNum;
        if (!isNaN(lonNum)) roadWaypoints[fpvProgressIndex].lon = lonNum;
        roadWaypoints[fpvProgressIndex].alt = wp.alt;
        roadWaypoints[fpvProgressIndex].pitch = wp.pitch;
        roadWaypoints[fpvProgressIndex].heading = wp.heading;
        roadWaypoints[fpvProgressIndex].headingMode = wp.headingMode || 'inherit';
        roadWaypoints[fpvProgressIndex].poiIndex = wp.poiIndex || 0;
        if (wp.targetPoiId) roadWaypoints[fpvProgressIndex].targetPoiId = wp.targetPoiId;
        roadWaypoints[fpvProgressIndex].speed = wp.speed;
        roadWaypoints[fpvProgressIndex].hoverTime = wp.hoverTime;
        roadWaypoints[fpvProgressIndex].turnMode = wp.turnMode;
        roadWaypoints[fpvProgressIndex].cameraAction = wp.cameraAction;
        roadWaypoints[fpvProgressIndex].zoom = wp.zoom;
        roadWaypoints[fpvProgressIndex].isModified = true;
      }

      redrawCurrentMission();
      recreate3DWaypointsAndPaths();
      updateFPVEditorUI();
    });
  }

  // Reset Waypoint
  const fpvResetBtn = document.getElementById('fpv-btn-reset-wp');
  if (fpvResetBtn) {
    fpvResetBtn.addEventListener('click', (e) => {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      const waypoints = getCurrentWaypoints();
      if (!waypoints || !waypoints[fpvProgressIndex]) return;
      const wp = waypoints[fpvProgressIndex];

      if (wp.origLat !== undefined && wp.origLat !== null) wp.lat = wp.origLat;
      if (wp.origLon !== undefined && wp.origLon !== null) wp.lon = wp.origLon;
      
      if (centerMarker) {
        const centerLatLng = centerMarker.getLatLng();
        const offsets = geodeticToLocal(wp.lat, wp.lon, centerLatLng.lat, centerLatLng.lng);
        wp.x = offsets.x;
        wp.y = offsets.y;
      } else if (wp.origX !== undefined && wp.origX !== null) {
        wp.x = wp.origX;
        wp.y = wp.origY;
      }

      if (wp.origAlt !== undefined && wp.origAlt !== null) wp.alt = wp.origAlt;
      if (wp.origPitch !== undefined && wp.origPitch !== null) wp.pitch = wp.origPitch;
      if (wp.origHeading !== undefined) wp.heading = wp.origHeading;
      wp.headingMode = wp.origHeadingMode || 'inherit';
      wp.poiIndex = wp.origPoiIndex || 0;
      wp.speed = wp.origSpeed !== undefined ? wp.origSpeed : null;
      wp.hoverTime = wp.origHoverTime !== undefined ? wp.origHoverTime : null;
      wp.turnMode = wp.origTurnMode || 'inherit';
      wp.cameraAction = wp.origCameraAction || 'inherit';
      wp.zoom = wp.origZoom !== undefined ? wp.origZoom : 1.0;
      wp.isModified = false;
      wp.hasDraftEdits = false;
      delete wp._lastLat;
      delete wp._lastLon;

      const gridType = document.getElementById('grid-type')?.value;
      if (gridType === 'road-following' && roadWaypoints && roadWaypoints[fpvProgressIndex]) {
        if (wp.origLat !== undefined) roadWaypoints[fpvProgressIndex].lat = wp.origLat;
        if (wp.origLon !== undefined) roadWaypoints[fpvProgressIndex].lon = wp.origLon;
        if (wp.origAlt !== undefined) roadWaypoints[fpvProgressIndex].alt = wp.origAlt;
        if (wp.origPitch !== undefined) roadWaypoints[fpvProgressIndex].pitch = wp.origPitch;
        if (wp.origHeading !== undefined) roadWaypoints[fpvProgressIndex].heading = wp.origHeading;
        roadWaypoints[fpvProgressIndex].headingMode = wp.origHeadingMode || 'inherit';
        roadWaypoints[fpvProgressIndex].poiIndex = wp.origPoiIndex || 0;
        roadWaypoints[fpvProgressIndex].isModified = false;
      }

      if (wp.mapMarker) {
        wp.mapMarker.setLatLng([wp.lat, wp.lon]);
      }

      if (gridType !== 'freeform') {
        updateGrid();
      } else {
        redrawCurrentMission();
      }
      recreate3DWaypointsAndPaths();
      updateFPVEditorUI();

      if (fpvActive) {
        updateFPVCamera(0);
      }
    });
  }

  // Delete Waypoint
  const deleteBtn = document.getElementById('fpv-btn-delete-wp');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', fpvDeleteWaypoint);
  }

  // Insert Waypoint
  const insertBtn = document.getElementById('fpv-btn-insert-wp');
  if (insertBtn) {
    insertBtn.addEventListener('click', fpvInsertWaypoint);
  }
}

// Dynamic container resizing
function handle3DResize() {
  const container = document.getElementById('three-container');
  if (!container || !threeCamera || !threeRenderer) return;
  const width = container.clientWidth;
  const height = container.clientHeight;
  threeCamera.aspect = width / height;
  threeCamera.updateProjectionMatrix();
  threeRenderer.setSize(width, height);
}

// Clean up WebGL resources
function cleanup3DPreview() {
  toggleFPVWalkthrough(false);
  window.removeEventListener('resize', handle3DResize);

  if (threeAnimationId) {
    cancelAnimationFrame(threeAnimationId);
    threeAnimationId = null;
  }

  if (threeRenderer) {
    const dom = threeRenderer.domElement;
    if (dom && dom.parentNode) {
      dom.parentNode.removeChild(dom);
    }
    threeRenderer.dispose();
    threeRenderer = null;
  }

  if (threeControls) {
    threeControls.dispose();
    threeControls = null;
  }

  threeScene = null;
  threeCamera = null;
  coneGroups = [];
  cachedTileImages = [];
  threeGroundCanvas = null;
  threeGroundCtx = null;
  threeGroundTexture = null;
}

// Auto-Plan State
