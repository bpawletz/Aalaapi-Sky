function initUIEventListeners() {
  initLayerManager();

  // Get all controls
  const controls = [...CONTROLS_LIST];

  controls.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    
    // Listen to changes to trigger redrawing of the grid
    el.addEventListener('input', () => {
      const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
      if (activeLayer && activeLayer.pattern === 'target-splat') {
        if (id === 'grid-width' || id === 'grid-height') {
          if (!isProgrammaticDimensionUpdate) {
            activeLayer.targetAutoDimensions = false;
            if (id === 'grid-width') activeLayer.gridWidth = parseFloat(el.value) || 100;
            if (id === 'grid-height') activeLayer.gridHeight = parseFloat(el.value) || 100;
            updateTargetSplatAutoFitUI(activeLayer);
          }
        } else if (activeLayer.targetAutoDimensions !== false && (id === 'altitude' || id === 'gimbal-pitch' || id === 'grid-rotation')) {
          applyTargetSplatAutoDimensions(activeLayer);
        }
      }
      if (id === 'tower-min-height') {
        const maxEl = document.getElementById('tower-max-height');
        if (maxEl) {
          const minVal = parseFloat(el.value) || 20;
          const maxVal = parseFloat(maxEl.value) || 100;
          if (minVal >= maxVal - 5) {
            maxEl.value = minVal + 5;
          }
        }
      } else if (id === 'tower-max-height') {
        const minEl = document.getElementById('tower-min-height');
        if (minEl) {
          const minVal = parseFloat(minEl.value) || 20;
          const maxVal = parseFloat(el.value) || 100;
          if (maxVal <= minVal + 5) {
            minEl.value = Math.max(1, maxVal - 5);
          }
        }
      }
      syncDisplayValues();
      updateGrid();
    });
    
    el.addEventListener('change', () => {
      const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
      if (activeLayer && activeLayer.pattern === 'target-splat') {
        if (id === 'grid-width' || id === 'grid-height') {
          if (!isProgrammaticDimensionUpdate) {
            activeLayer.targetAutoDimensions = false;
            if (id === 'grid-width') activeLayer.gridWidth = parseFloat(el.value) || 100;
            if (id === 'grid-height') activeLayer.gridHeight = parseFloat(el.value) || 100;
            updateTargetSplatAutoFitUI(activeLayer);
          }
        }
      }
      syncDisplayValues();
      updateGrid();
      saveAllSettingsToLocalStorage();
    });
  });

  const roadSnapEl = document.getElementById('road-snap');
  if (roadSnapEl) {
    roadSnapEl.addEventListener('change', () => {
      updateGrid();
      saveAllSettingsToLocalStorage();
    });
  }

  // Exclusion Zone Altitude Event Listeners
  const exclAllAltEl = document.getElementById('exclusion-all-altitudes');
  const exclMinAltEl = document.getElementById('exclusion-min-alt');
  const exclMaxAltEl = document.getElementById('exclusion-max-alt');

  if (exclAllAltEl) {
    exclAllAltEl.addEventListener('change', () => {
      const activeLayer = getActiveLayer();
      if (activeLayer) {
        activeLayer.allAltitudes = exclAllAltEl.checked;
      }
      syncDisplayValues();
      updateGrid();
    });
  }

  if (exclMinAltEl) {
    exclMinAltEl.addEventListener('input', () => {
      const minVal = parseFloat(exclMinAltEl.value) || 0;
      const maxVal = parseFloat(exclMaxAltEl?.value) || 60;
      if (minVal > maxVal && exclMaxAltEl) {
        exclMaxAltEl.value = minVal;
      }
      const activeLayer = getActiveLayer();
      if (activeLayer) {
        activeLayer.minAltitude = minVal;
        if (exclMaxAltEl) activeLayer.maxAltitude = parseFloat(exclMaxAltEl.value) || 60;
      }
      syncDisplayValues();
      updateGrid();
    });
  }

  if (exclMaxAltEl) {
    exclMaxAltEl.addEventListener('input', () => {
      const maxVal = parseFloat(exclMaxAltEl.value) || 60;
      const minVal = parseFloat(exclMinAltEl?.value) || 0;
      if (maxVal < minVal && exclMinAltEl) {
        exclMinAltEl.value = maxVal;
      }
      const activeLayer = getActiveLayer();
      if (activeLayer) {
        activeLayer.maxAltitude = maxVal;
        if (exclMinAltEl) activeLayer.minAltitude = parseFloat(exclMinAltEl.value) || 0;
      }
      syncDisplayValues();
      updateGrid();
    });
  }

  const exclDetourModeEl = document.getElementById('exclusion-detour-mode');
  if (exclDetourModeEl) {
    exclDetourModeEl.addEventListener('change', () => {
      const activeLayer = getActiveLayer();
      if (activeLayer) {
        activeLayer.detourMode = exclDetourModeEl.value;
      }
      updateGrid();
    });
  }

  const globalDetourModeEl = document.getElementById('global-exclusion-detour-mode');
  if (globalDetourModeEl) {
    globalDetourModeEl.addEventListener('change', () => {
      globalExclusionDetourMode = globalDetourModeEl.value;
      updateInheritOptionLabels();
      updateGrid();
      saveAllSettingsToLocalStorage();
    });
  }

  const globalClearanceEl = document.getElementById('global-exclusion-clearance-buffer');
  if (globalClearanceEl) {
    globalClearanceEl.addEventListener('input', () => {
      globalExclusionClearanceBuffer = parseFloat(globalClearanceEl.value) || 5;
      syncDisplayValues();
      updateGrid();
      saveAllSettingsToLocalStorage();
    });
  }

  // Target Splat UI Event Listeners (v1.77.0)
  const targetModePolyBtn = document.getElementById('target-mode-poly-btn');
  const targetModeRadBtn = document.getElementById('target-mode-radius-btn');
  const targetPolyControls = document.getElementById('target-poly-controls');
  const targetRadiusControls = document.getElementById('target-radius-controls');
  const targetDrawToggleBtn = document.getElementById('target-poly-draw-toggle');
  const targetClearBtn = document.getElementById('target-poly-clear-btn');

  if (targetModePolyBtn && targetModeRadBtn) {
    targetModePolyBtn.addEventListener('click', () => {
      const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
      if (activeLayer) activeLayer.targetMode = 'polygon';
      targetModePolyBtn.classList.add('active');
      targetModeRadBtn.classList.remove('active');
      if (targetPolyControls) targetPolyControls.classList.remove('hidden');
      if (targetRadiusControls) targetRadiusControls.classList.add('hidden');
      if (!activeLayer || !activeLayer.targetPoly || activeLayer.targetPoly.length < 3) {
        setTargetPolyEditMode(true);
      } else {
        setTargetPolyEditMode(false);
      }
      updateGrid();
      saveAllSettingsToLocalStorage();
    });

    targetModeRadBtn.addEventListener('click', () => {
      const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
      if (activeLayer) activeLayer.targetMode = 'radius';
      targetModeRadBtn.classList.add('active');
      targetModePolyBtn.classList.remove('active');
      if (targetPolyControls) targetPolyControls.classList.add('hidden');
      if (targetRadiusControls) targetRadiusControls.classList.remove('hidden');
      setTargetPolyEditMode(false);
      updateGrid();
      saveAllSettingsToLocalStorage();
    });
  }

  if (targetDrawToggleBtn) {
    targetDrawToggleBtn.addEventListener('click', () => {
      setTargetPolyEditMode(!isTargetPolyEditActive);
      updateGrid();
    });
  }

  if (targetClearBtn) {
    targetClearBtn.addEventListener('click', () => {
      const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
      if (activeLayer) {
        activeLayer.targetPoly = [];
        if (activeLayer.targetAutoDimensions !== false) {
          applyTargetSplatAutoDimensions(activeLayer);
        }
      }
      setTargetPolyEditMode(true);
      updateGrid();
      saveAllSettingsToLocalStorage();
    });
  }

  const drawLayerBoundaryBtn = document.getElementById('btn-draw-layer-boundary');
  const clearLayerBoundaryBtn = document.getElementById('btn-clear-layer-boundary');
  if (drawLayerBoundaryBtn) {
    drawLayerBoundaryBtn.addEventListener('click', () => {
      setLayerBoundaryEditMode(!isLayerBoundaryEditActive);
      if (typeof updatePlan === 'function') updatePlan();
      else if (typeof updateGrid === 'function') updateGrid();
    });
  }
  const boundaryNameInput = document.getElementById('boundary-layer-name');
  if (boundaryNameInput) {
    boundaryNameInput.addEventListener('input', (e) => {
      const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
      if (activeLayer) {
        activeLayer.name = e.target.value || 'Boundary / Parcel';
        renderLayersList();
        saveAllSettingsToLocalStorage();
      }
    });
  }

  const boundaryColorSelect = document.getElementById('boundary-stroke-color');
  if (boundaryColorSelect) {
    boundaryColorSelect.addEventListener('change', (e) => {
      const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
      if (activeLayer) {
        activeLayer.strokeColor = e.target.value;
        updateGrid();
        saveAllSettingsToLocalStorage();
      }
    });
  }

  const boundaryLineSelect = document.getElementById('boundary-line-style');
  if (boundaryLineSelect) {
    boundaryLineSelect.addEventListener('change', (e) => {
      const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
      if (activeLayer) {
        activeLayer.lineStyle = e.target.value;
        updateGrid();
        saveAllSettingsToLocalStorage();
      }
    });
  }

  const boundaryOpacitySlider = document.getElementById('boundary-fill-opacity');
  const boundaryOpacityVal = document.getElementById('boundary-fill-opacity-val');
  if (boundaryOpacitySlider) {
    boundaryOpacitySlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      if (boundaryOpacityVal) boundaryOpacityVal.textContent = `${val}%`;
      const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
      if (activeLayer) {
        activeLayer.fillOpacity = val;
        updateGrid();
        saveAllSettingsToLocalStorage();
      }
    });
  }

  const boundaryElevInput = document.getElementById('boundary-elevation');
  const boundaryElevVal = document.getElementById('boundary-elevation-val');
  if (boundaryElevInput) {
    boundaryElevInput.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value) || 0;
      if (boundaryElevVal) boundaryElevVal.textContent = `${val}m`;
      const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
      if (activeLayer) {
        activeLayer.targetHeight = val;
        saveAllSettingsToLocalStorage();
      }
    });
  }

  const clearBoundaryVerticesBtn = document.getElementById('btn-clear-boundary-vertices');
  if (clearBoundaryVerticesBtn) {
    clearBoundaryVerticesBtn.addEventListener('click', () => {
      clearBoundaryPolygon();
    });
  }

  // Card 6: Fiducial Markers & GCPs Event Listeners (v1.104.0)
  const fiducialNameInput = document.getElementById('fiducial-layer-name');
  if (fiducialNameInput) {
    fiducialNameInput.addEventListener('input', (e) => {
      const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
      if (activeLayer) {
        activeLayer.name = e.target.value || 'Ground Control Points (GCPs)';
        renderLayersList();
        saveAllSettingsToLocalStorage();
      }
    });
  }

  const fiducialTypeSelect = document.getElementById('fiducial-default-type');
  if (fiducialTypeSelect) {
    fiducialTypeSelect.addEventListener('change', (e) => {
      const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
      if (activeLayer) {
        activeLayer.defaultTargetType = e.target.value;
        saveAllSettingsToLocalStorage();
      }
    });
  }

  const fiducialRoleSelect = document.getElementById('fiducial-default-role');
  if (fiducialRoleSelect) {
    fiducialRoleSelect.addEventListener('change', (e) => {
      const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
      if (activeLayer) {
        activeLayer.defaultRole = e.target.value;
        saveAllSettingsToLocalStorage();
      }
    });
  }

  const fiducialSizeInput = document.getElementById('fiducial-default-size');
  if (fiducialSizeInput) {
    const handleFidSize = (e) => {
      const val = parseFloat(e.target.value) || 0.5;
      const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
      if (activeLayer) {
        activeLayer.defaultPhysicalSize = val;
        updateFiducialAltitudeAdvisor(activeLayer);
        updateGrid();
        saveAllSettingsToLocalStorage();
      }
    };
    fiducialSizeInput.addEventListener('input', handleFidSize);
    fiducialSizeInput.addEventListener('change', handleFidSize);
  }

  // Auto-Set Fiducial Size Button (Card 6)
  const btnFidAutoset = document.getElementById('btn-fid-autoset-size');
  if (btnFidAutoset) {
    btnFidAutoset.addEventListener('click', () => {
      const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
      if (!activeLayer) return;
      const altContext = getSurroundingFlightAltitudes(activeLayer.id);
      const metrics = calculateFiducialResolution(activeLayer.defaultPhysicalSize || 0.20, altContext.primaryAltitude);
      const recSize = metrics.recommendedSizeMeters;

      const sizeInput = document.getElementById('fiducial-default-size');
      if (sizeInput) {
        let closestOpt = null;
        let minDiff = Infinity;
        if (sizeInput.options && sizeInput.options.length > 0) {
          for (let i = 0; i < sizeInput.options.length; i++) {
            const opt = sizeInput.options[i];
            const diff = Math.abs(parseFloat(opt.value) - recSize);
            if (diff < minDiff) {
              minDiff = diff;
              closestOpt = opt;
            }
          }
          if (closestOpt) {
            sizeInput.value = closestOpt.value;
            activeLayer.defaultPhysicalSize = parseFloat(closestOpt.value);
          } else {
            sizeInput.value = recSize.toString();
            activeLayer.defaultPhysicalSize = recSize;
          }
        } else {
          sizeInput.value = recSize.toString();
          activeLayer.defaultPhysicalSize = recSize;
        }
      } else {
        activeLayer.defaultPhysicalSize = recSize;
      }
      updateFiducialAltitudeAdvisor(activeLayer);
      updateGrid();
      saveAllSettingsToLocalStorage();
    });
  }

  // Range Rings Map Toggle
  const fidRangeRingsCheck = document.getElementById('fiducial-show-range-rings');
  if (fidRangeRingsCheck) {
    fidRangeRingsCheck.addEventListener('change', () => {
      updateGrid();
    });
  }

  const fiducialColorSelect = document.getElementById('fiducial-marker-color');
  if (fiducialColorSelect) {
    fiducialColorSelect.addEventListener('change', (e) => {
      const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
      if (activeLayer) {
        activeLayer.markerColor = e.target.value;
        updateGrid();
        saveAllSettingsToLocalStorage();
      }
    });
  }

  const btnAddFiducialManual = document.getElementById('btn-add-fiducial-manual');
  if (btnAddFiducialManual) {
    btnAddFiducialManual.addEventListener('click', () => {
      const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
      if (!activeLayer) return;
      const coordsStr = prompt('Enter coordinates (Latitude, Longitude, [Altitude_m], [Code/Label]):', '42.3601, -71.0589, 0, GCP-1');
      if (!coordsStr) return;
      const parts = coordsStr.split(',').map(s => s.trim());
      const lat = parseFloat(parts[0]);
      const lon = parseFloat(parts[1]);
      const alt = parts.length > 2 && !isNaN(parseFloat(parts[2])) ? parseFloat(parts[2]) : 0;
      const code = parts.length > 3 && parts[3] ? parts[3] : '';
      if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
        addFiducialMarkerPoint(lat, lon, activeLayer, { alt, code });
      } else {
        alert('Invalid coordinates. Please enter valid Lat, Lon decimal values.');
      }
    });
  }

  const btnClearFiducials = document.getElementById('btn-clear-fiducial-markers');
  if (btnClearFiducials) {
    btnClearFiducials.addEventListener('click', () => {
      const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
      if (activeLayer) clearFiducialMarkers(activeLayer.id);
    });
  }

  const btnExportFiducialsCsv = document.getElementById('btn-export-fiducials-csv');
  if (btnExportFiducialsCsv) {
    btnExportFiducialsCsv.addEventListener('click', () => {
      const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
      if (activeLayer) exportFiducialMarkersCsv(activeLayer);
    });
  }

  const btnExportFiducialsGeoJson = document.getElementById('btn-export-fiducials-geojson');
  if (btnExportFiducialsGeoJson) {
    btnExportFiducialsGeoJson.addEventListener('click', () => {
      const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
      if (activeLayer) exportFiducialMarkersGeoJson(activeLayer);
    });
  }

  const btnImportFiducials = document.getElementById('btn-import-fiducials');
  const fiducialFileInput = document.getElementById('fiducial-import-file-input');
  if (btnImportFiducials && fiducialFileInput) {
    btnImportFiducials.addEventListener('click', () => {
      fiducialFileInput.click();
    });

    fiducialFileInput.addEventListener('change', (e) => {
      const file = e.target.files ? e.target.files[0] : null;
      if (!file) return;

      const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
      if (!activeLayer) {
        alert("Please select a Fiducial / GCP layer first.");
        fiducialFileInput.value = "";
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target.result;
        let imported = [];
        if (file.name.toLowerCase().endsWith('.geojson') || file.name.toLowerCase().endsWith('.json')) {
          imported = parseSurveyGeoJson(text);
        } else {
          imported = parseSurveyCsv(text);
        }

        if (imported.length === 0) {
          alert("Could not find any valid coordinate points in survey file. Please verify CSV or GeoJSON format.");
          fiducialFileInput.value = "";
          return;
        }

        if (!Array.isArray(activeLayer.fiducialMarkers)) activeLayer.fiducialMarkers = [];
        activeLayer.fiducialMarkers.push(...imported);
        renderFiducialMarkersTable(activeLayer);
        renderLayersList();
        updateGrid();
        saveAllSettingsToLocalStorage();
        alert(`Successfully imported ${imported.length} survey marker(s) into ${activeLayer.name || 'layer'}.`);
        fiducialFileInput.value = "";
      };
      reader.readAsText(file);
    });
  }

  const btnOpenTargetGen = document.getElementById('btn-open-target-generator');
  if (btnOpenTargetGen) {
    btnOpenTargetGen.addEventListener('click', () => {
      openTargetGeneratorModal();
    });
  }

  // Fiducial & GCP Help Drawer Toggle
  const fiducialHelpBtn = document.getElementById('fiducial-help-btn');
  const fiducialHelpDrawer = document.getElementById('fiducial-help-drawer');
  const closeFiducialHelpBtn = document.getElementById('close-fiducial-help-drawer-btn');
  if (fiducialHelpBtn && fiducialHelpDrawer) {
    fiducialHelpBtn.addEventListener('click', () => {
      fiducialHelpDrawer.classList.toggle('hidden');
    });
  }
  if (closeFiducialHelpBtn && fiducialHelpDrawer) {
    closeFiducialHelpBtn.addEventListener('click', () => {
      fiducialHelpDrawer.classList.add('hidden');
    });
  }

  // Fiducial & GCP Help Drawer Tabs (Workflow, DIY Fabrication, Construction Sites)
  const fidTabs = [
    { btn: document.getElementById('fid-tab-btn-workflow'), pane: document.getElementById('fid-pane-workflow') },
    { btn: document.getElementById('fid-tab-btn-fabrication'), pane: document.getElementById('fid-pane-fabrication') },
    { btn: document.getElementById('fid-tab-btn-construction'), pane: document.getElementById('fid-pane-construction') }
  ];
  fidTabs.forEach(({ btn }) => {
    if (!btn) return;
    btn.addEventListener('click', () => {
      fidTabs.forEach(t => {
        if (t.btn && t.pane) {
          const isActive = (t.btn === btn);
          t.pane.classList.toggle('hidden', !isActive);
          t.btn.classList.toggle('active', isActive);
          t.btn.style.color = isActive ? '#fbbf24' : 'var(--text-muted)';
          t.btn.style.background = isActive ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255, 255, 255, 0.03)';
          t.btn.style.borderColor = isActive ? 'rgba(245, 158, 11, 0.4)' : 'rgba(255, 255, 255, 0.08)';
        }
      });
    });
  });

  // Printable Vector SVG Target Generator Modal Event Listeners
  const closeTargetGenBtn = document.getElementById('close-fiducial-generator-modal-btn');
  if (closeTargetGenBtn) {
    closeTargetGenBtn.addEventListener('click', () => {
      closeTargetGeneratorModal();
    });
  }

  ['gen-target-type', 'gen-target-id', 'gen-target-size', 'gen-sheet-size', 'gen-render-style', 'gen-opt-crosshair', 'gen-opt-cornerticks', 'gen-opt-ruler', 'gen-opt-idlabel', 'gen-opt-tiling-enable', 'gen-tiling-overlap', 'gen-tiling-view-mode', 'gen-opt-trim-lines', 'gen-opt-seam-crosshairs', 'gen-opt-tile-stamps'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', () => renderTargetGeneratorPreview());
      el.addEventListener('change', () => renderTargetGeneratorPreview());
    }
  });

  const tilingPageSelect = document.getElementById('gen-tiling-page-select');
  if (tilingPageSelect) {
    tilingPageSelect.addEventListener('change', () => {
      const idx = parseInt(tilingPageSelect.value, 10);
      if (!isNaN(idx)) {
        currentTilingSheetIndex = idx;
        renderTargetGeneratorPreview();
      }
    });
  }

  const tilingPrevBtn = document.getElementById('gen-tiling-prev-page-btn');
  if (tilingPrevBtn) {
    tilingPrevBtn.addEventListener('click', () => {
      if (currentTilingSheetIndex > 0) {
        currentTilingSheetIndex--;
        renderTargetGeneratorPreview();
      }
    });
  }

  const tilingNextBtn = document.getElementById('gen-tiling-next-page-btn');
  if (tilingNextBtn) {
    tilingNextBtn.addEventListener('click', () => {
      currentTilingSheetIndex++;
      renderTargetGeneratorPreview();
    });
  }

  const btnDownloadTargetSvg = document.getElementById('btn-download-target-svg');
  if (btnDownloadTargetSvg) {
    btnDownloadTargetSvg.addEventListener('click', () => {
      exportTargetSvg();
    });
  }

  const btnPrintTargetSheet = document.getElementById('btn-print-target-sheet');
  if (btnPrintTargetSheet) {
    btnPrintTargetSheet.addEventListener('click', () => {
      printTargetSheet();
    });
  }

  const btnGenAutoset = document.getElementById('btn-gen-autoset-size');
  if (btnGenAutoset) {
    btnGenAutoset.addEventListener('click', () => {
      const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
      const altContext = getSurroundingFlightAltitudes(activeLayer ? activeLayer.id : null);
      const metrics = calculateFiducialResolution(0.20, altContext.primaryAltitude);
      const recSize = metrics.recommendedSizeMeters;
      const genSizeEl = document.getElementById('gen-target-size');
      if (genSizeEl) {
        // find matching option or set value
        const valStr = recSize.toFixed(2);
        let found = false;
        for (let opt of genSizeEl.options) {
          if (Math.abs(parseFloat(opt.value) - recSize) < 0.06) {
            genSizeEl.value = opt.value;
            found = true;
            break;
          }
        }
        if (!found) genSizeEl.value = valStr;
        renderTargetGeneratorPreview();
      }
    });
  }

  const targetAutoFitBtn = document.getElementById('target-splat-autofit-btn');
  if (targetAutoFitBtn) {
    targetAutoFitBtn.addEventListener('click', () => {
      const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
      if (activeLayer) {
        activeLayer.targetAutoDimensions = true;
        applyTargetSplatAutoDimensions(activeLayer);
        updateGrid();
        saveAllSettingsToLocalStorage();
      }
    });
  }

  const targetFixDimsBtn = document.getElementById('target-splat-fix-dims-btn');
  if (targetFixDimsBtn) {
    targetFixDimsBtn.addEventListener('click', () => {
      const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
      if (activeLayer) {
        activeLayer.targetAutoDimensions = true;
        applyTargetSplatAutoDimensions(activeLayer);
        updateGrid();
        saveAllSettingsToLocalStorage();
      }
    });
  }

  const targetRadEl = document.getElementById('target-splat-radius');
  if (targetRadEl) {
    targetRadEl.addEventListener('input', () => {
      const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
      if (activeLayer) {
        activeLayer.targetRadius = parseFloat(targetRadEl.value) || 25;
        if (activeLayer.targetAutoDimensions !== false) {
          applyTargetSplatAutoDimensions(activeLayer);
        }
      }
      syncDisplayValues();
      updateGrid();
      saveAllSettingsToLocalStorage();
    });
  }

  const targetHtEl = document.getElementById('target-splat-height');
  if (targetHtEl) {
    targetHtEl.addEventListener('input', () => {
      const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
      if (activeLayer) {
        activeLayer.targetHeight = parseFloat(targetHtEl.value) || 8;
      }
      syncDisplayValues();
      updateGrid();
      saveAllSettingsToLocalStorage();
    });
  }

  const targetCullEl = document.getElementById('target-splat-culling-mode');
  if (targetCullEl) {
    targetCullEl.addEventListener('change', () => {
      const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
      if (activeLayer) {
        activeLayer.targetCullingMode = targetCullEl.value;
      }
      updateGrid();
      saveAllSettingsToLocalStorage();
    });
  }

  const targetPassEl = document.getElementById('target-splat-grid-pass');
  if (targetPassEl) {
    targetPassEl.addEventListener('change', () => {
      const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
      if (activeLayer) {
        activeLayer.targetGridPass = targetPassEl.value;
        if (activeLayer.targetAutoDimensions !== false) {
          applyTargetSplatAutoDimensions(activeLayer);
        }
      }
      updateGrid();
      saveAllSettingsToLocalStorage();
    });
  }

  const cameraAspectEl = document.getElementById('camera-aspect-ratio');
  if (cameraAspectEl) {
    cameraAspectEl.addEventListener('change', () => {
      setCameraAspectRatio(cameraAspectEl.value);
      saveAllSettingsToLocalStorage();
    });
  }

  const jumpToAspectBtn = document.getElementById('jump-to-aspect-ratio-btn');
  if (jumpToAspectBtn) {
    jumpToAspectBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const failsafesSection = document.getElementById('mission-failsafes-section');
      if (failsafesSection && failsafesSection.classList.contains('collapsed')) {
        failsafesSection.classList.remove('collapsed');
      }
      const aspectSelect = document.getElementById('camera-aspect-ratio');
      if (aspectSelect) {
        aspectSelect.scrollIntoView({ behavior: 'smooth', block: 'center' });
        try { aspectSelect.focus(); } catch (err) {}
        aspectSelect.classList.add('highlight-glow');
        setTimeout(() => aspectSelect.classList.remove('highlight-glow'), 1800);
      }
    });
  }

  const targetFramingEl = document.getElementById('target-splat-framing-mode');
  if (targetFramingEl) {
    targetFramingEl.addEventListener('change', () => {
      const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
      if (activeLayer) {
        activeLayer.targetFramingMode = targetFramingEl.value;
        if (activeLayer.targetAutoDimensions !== false) {
          applyTargetSplatAutoDimensions(activeLayer);
        }
        updateTargetSplatDiagram(activeLayer);
      }
      updateGrid();
      saveAllSettingsToLocalStorage();
    });
  }

  // Perimeter Orbit Pass toggle & controls
  const perimCheckEl = document.getElementById('target-perimeter-pass');
  const perimControlsDiv = document.getElementById('target-perimeter-controls');
  if (perimCheckEl) {
    perimCheckEl.addEventListener('change', () => {
      const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
      if (activeLayer) activeLayer.targetPerimeterPass = perimCheckEl.checked;
      if (perimControlsDiv) {
        if (perimCheckEl.checked) perimControlsDiv.classList.remove('hidden');
        else perimControlsDiv.classList.add('hidden');
      }
      updateGrid();
      saveAllSettingsToLocalStorage();
    });
  }

  const perimStandoffSlider = document.getElementById('target-perimeter-standoff');
  if (perimStandoffSlider) {
    perimStandoffSlider.addEventListener('input', () => {
      const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
      if (activeLayer) activeLayer.targetPerimeterStandoff = parseFloat(perimStandoffSlider.value) || 8;
      syncDisplayValues();
      updateGrid();
      saveAllSettingsToLocalStorage();
    });
  }

  const perimAltSlider = document.getElementById('target-perimeter-alt');
  if (perimAltSlider) {
    perimAltSlider.addEventListener('input', () => {
      const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
      const rawAlt = parseFloat(perimAltSlider.value);
      const altVal = (rawAlt === 0 || isNaN(rawAlt)) ? null : rawAlt;
      if (activeLayer) activeLayer.targetPerimeterAltitude = altVal;
      syncDisplayValues();
      updateGrid();
      saveAllSettingsToLocalStorage();
    });
  }

  const perimPitchSlider = document.getElementById('target-perimeter-pitch');
  if (perimPitchSlider) {
    perimPitchSlider.addEventListener('input', () => {
      const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
      if (activeLayer) activeLayer.targetPerimeterPitch = parseFloat(perimPitchSlider.value) || -55;
      syncDisplayValues();
      updateGrid();
      saveAllSettingsToLocalStorage();
    });
  }

  // 360 Photo Sphere Ring Controls & Presets (v1.125.1)
  const setupPhotoSphereRingListeners = () => {
    const ringIds = [
      { id: 'photo-sphere-ring-1', prop: 'ring1' },
      { id: 'photo-sphere-ring-2', prop: 'ring2' },
      { id: 'photo-sphere-ring-3', prop: 'ring3' },
      { id: 'photo-sphere-ring-nadir', prop: 'nadir' }
    ];

    const syncRingsToActiveLayer = () => {
      const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
      if (!activeLayer) return;
      if (!activeLayer.photoSphereRings) {
        activeLayer.photoSphereRings = { ring1: true, ring2: true, ring3: true, nadir: true };
      }
      ringIds.forEach(({ id, prop }) => {
        const el = document.getElementById(id);
        if (el) activeLayer.photoSphereRings[prop] = el.checked;
      });
      // Safety fallback: prevent all rings being disabled
      const anyChecked = Object.values(activeLayer.photoSphereRings).some(Boolean);
      if (!anyChecked) {
        activeLayer.photoSphereRings.ring1 = true;
        const el1 = document.getElementById('photo-sphere-ring-1');
        if (el1) el1.checked = true;
      }
      if (typeof updatePhotoSphereBadge === 'function') {
        updatePhotoSphereBadge();
      }
      updateGrid();
      updateMapLegend();
      saveAllSettingsToLocalStorage();
    };

    ringIds.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('change', syncRingsToActiveLayer);
      }
    });

    const setRings = (r1, r2, r3, rn) => {
      const el1 = document.getElementById('photo-sphere-ring-1');
      const el2 = document.getElementById('photo-sphere-ring-2');
      const el3 = document.getElementById('photo-sphere-ring-3');
      const elN = document.getElementById('photo-sphere-ring-nadir');
      if (el1) el1.checked = r1;
      if (el2) el2.checked = r2;
      if (el3) el3.checked = r3;
      if (elN) elN.checked = rn;
      syncRingsToActiveLayer();
    };

    const btnFull = document.getElementById('photo-sphere-preset-full');
    const btnPano = document.getElementById('photo-sphere-preset-pano');
    const btnOblique = document.getElementById('photo-sphere-preset-oblique');

    if (btnFull) btnFull.addEventListener('click', () => setRings(true, true, true, true));
    if (btnPano) btnPano.addEventListener('click', () => setRings(true, false, false, false));
    if (btnOblique) btnOblique.addEventListener('click', () => setRings(true, true, false, false));
  };
  setupPhotoSphereRingListeners();

  // Hyperlapse Moving Time-Lapse Control Listeners (v1.146.0 - Closes #102)
  const setupHyperlapseListeners = () => {
    const hlInterval = document.getElementById('hyperlapse-interval');
    const hlIntervalVal = document.getElementById('hyperlapse-interval-val');
    const hlStartPitch = document.getElementById('hyperlapse-start-pitch');
    const hlEndPitch = document.getElementById('hyperlapse-end-pitch');
    const hlHeadingMode = document.getElementById('hyperlapse-heading-mode');
    const hlStartHeading = document.getElementById('hyperlapse-start-heading');
    const hlEndHeading = document.getElementById('hyperlapse-end-heading');
    const hlKeyframesBox = document.getElementById('hyperlapse-heading-keyframes-box');
    const hlUndoBtn = document.getElementById('hyperlapse-undo-btn');
    const hlClearBtn = document.getElementById('hyperlapse-clear-btn');

    const updateHyperlapse = () => {
      const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
      if (!activeLayer) return;
      if (hlInterval) {
        const val = parseInt(hlInterval.value, 10) || 3;
        activeLayer.hyperlapseInterval = val;
        if (hlIntervalVal) hlIntervalVal.textContent = `${val} s`;
      }
      if (hlStartPitch) activeLayer.hyperlapseStartPitch = parseInt(hlStartPitch.value, 10) || -15;
      if (hlEndPitch) activeLayer.hyperlapseEndPitch = parseInt(hlEndPitch.value, 10) || -15;
      if (hlHeadingMode) {
        activeLayer.hyperlapseHeadingMode = hlHeadingMode.value;
        if (hlKeyframesBox) {
          if (hlHeadingMode.value === 'keyframes') {
            hlKeyframesBox.classList.remove('hidden');
          } else {
            hlKeyframesBox.classList.add('hidden');
          }
        }
      }
      if (hlStartHeading) activeLayer.hyperlapseStartHeading = parseFloat(hlStartHeading.value) || 0;
      if (hlEndHeading) activeLayer.hyperlapseEndHeading = parseFloat(hlEndHeading.value) || 90;

      updateGrid();
      updateMapLegend();
      saveAllSettingsToLocalStorage();
    };

    [hlInterval, hlStartPitch, hlEndPitch, hlHeadingMode, hlStartHeading, hlEndHeading].forEach(el => {
      if (el) {
        el.addEventListener('input', updateHyperlapse);
        el.addEventListener('change', updateHyperlapse);
      }
    });

    if (hlUndoBtn) {
      hlUndoBtn.addEventListener('click', () => {
        const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
        if (activeLayer && Array.isArray(activeLayer.freeformWaypoints) && activeLayer.freeformWaypoints.length > 0) {
          activeLayer.freeformWaypoints.pop();
          updateGrid();
          updateMapLegend();
          saveAllSettingsToLocalStorage();
        }
      });
    }

    if (hlClearBtn) {
      hlClearBtn.addEventListener('click', () => {
        const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
        if (activeLayer) {
          activeLayer.freeformWaypoints = [];
          updateGrid();
          updateMapLegend();
          saveAllSettingsToLocalStorage();
        }
      });
    }
  };
  setupHyperlapseListeners();

  // Handle Camera Model preset change
  const cameraModelEl = document.getElementById('camera-model');
  const droneModelEl = document.getElementById('drone-model');
  const hfovSlider = document.getElementById('camera-hfov');
  const vfovSlider = document.getElementById('camera-vfov');
  if (cameraModelEl && hfovSlider && vfovSlider) {
    cameraModelEl.addEventListener('change', (e) => {
      const model = e.target.value;
      if (model === 'dji_mini_4_pro_std') {
        hfovSlider.value = 69.7;
        vfovSlider.value = 55.2;
        if (droneModelEl) droneModelEl.value = '68'; // Auto-select Mini 4 Pro (68)
      } else if (model === 'dji_mini_4_pro_wide') {
        hfovSlider.value = 97.0;
        vfovSlider.value = 79.0;
        if (droneModelEl) droneModelEl.value = '68'; // Auto-select Mini 4 Pro (68)
      } else if (model === 'skyrover_x1_std') {
        hfovSlider.value = 67.2;
        vfovSlider.value = 53.1;
      } else if (model === 'skyrover_x1_wide') {
        hfovSlider.value = 88.0;
        vfovSlider.value = 72.0;
      }
      syncDisplayValues();
      updateGrid();
    });

    const onCameraSliderInput = () => {
      const h = parseFloat(hfovSlider.value);
      const v = parseFloat(vfovSlider.value);
      if (h === 69.7 && v === 55.2) {
        cameraModelEl.value = 'dji_mini_4_pro_std';
      } else if (h === 97.0 && v === 79.0) {
        cameraModelEl.value = 'dji_mini_4_pro_wide';
      } else if (h === 67.2 && v === 53.1) {
        cameraModelEl.value = 'skyrover_x1_std';
      } else if (h === 88.0 && v === 72.0) {
        cameraModelEl.value = 'skyrover_x1_wide';
      } else {
        cameraModelEl.value = 'custom';
      }
    };
    hfovSlider.addEventListener('input', onCameraSliderInput);
    vfovSlider.addEventListener('input', onCameraSliderInput);
  }


  // Listener for dynamic pattern configuration visibility
  const gridTypeEl = document.getElementById('grid-type');
  if (gridTypeEl) {
    gridTypeEl.addEventListener('change', togglePatternParameters);
  }

  // Sync Capture Mode help text and inherit labels
  const captureModeGlobalEl = document.getElementById('capture-mode');
  if (captureModeGlobalEl) {
    captureModeGlobalEl.addEventListener('change', (e) => {
      const helpText = document.getElementById('capture-help-text');
      if (helpText) {
        if (e.target.value === 'stopAndShoot') {
          helpText.textContent = "Stop & Shoot halts the drone at every coordinate to take a photo. Recommended for sharp, automated maps.";
        } else if (e.target.value === 'video') {
          helpText.textContent = "Video Mode starts video recording automatically at takeoff and stops at the final waypoint. Recommended for cinematic road flyovers.";
        } else {
          helpText.textContent = "Continuous Flight flies smoothly through endpoints. The pilot must trigger DJI Fly's native interval shot (e.g. every 2s) manually.";
        }
      }
      updateInheritOptionLabels();
    });
  }

  const pathModeGlobalEl = document.getElementById('path-mode');
  if (pathModeGlobalEl) {
    pathModeGlobalEl.addEventListener('change', () => {
      updateInheritOptionLabels();
    });
  }

  const headingModeGlobalEl = document.getElementById('heading-mode');
  if (headingModeGlobalEl) {
    headingModeGlobalEl.addEventListener('change', () => {
      updateInheritOptionLabels();
      const globalCustomContainer = document.getElementById('global-custom-heading-container');
      if (globalCustomContainer) {
        if (headingModeGlobalEl.value === 'custom') {
          globalCustomContainer.classList.remove('hidden');
        } else {
          globalCustomContainer.classList.add('hidden');
        }
      }
      const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
      if (activeLayer) {
        const effHeading = getEffectiveLayerHeadingMode(activeLayer);
        const layerPoiContainer = document.getElementById('layer-poi-container');
        if (layerPoiContainer) {
          if (effHeading === 'towardPOI') {
            layerPoiContainer.classList.remove('hidden');
          } else {
            layerPoiContainer.classList.add('hidden');
          }
        }
        const layerCustomContainer = document.getElementById('layer-custom-heading-container');
        if (layerCustomContainer) {
          if (effHeading === 'custom') {
            layerCustomContainer.classList.remove('hidden');
          } else {
            layerCustomContainer.classList.add('hidden');
          }
        }
      }
      updateGrid();
    });
  }

  const globalCustomHeadingEl = document.getElementById('global-custom-heading');
  const globalCustomHeadingVal = document.getElementById('global-custom-heading-val');
  if (globalCustomHeadingEl) {
    globalCustomHeadingEl.addEventListener('input', () => {
      const val = parseInt(globalCustomHeadingEl.value, 10) || 0;
      if (globalCustomHeadingVal) globalCustomHeadingVal.textContent = val;
      updateInheritOptionLabels();
      redrawCurrentMission();
    });
  }
  document.querySelectorAll('.global-head-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const angle = parseInt(btn.dataset.angle, 10) || 0;
      if (globalCustomHeadingEl) globalCustomHeadingEl.value = angle;
      if (globalCustomHeadingVal) globalCustomHeadingVal.textContent = angle;
      updateInheritOptionLabels();
      redrawCurrentMission();
    });
  });

  const globalHoverEl = document.getElementById('global-hover-time');
  if (globalHoverEl) {
    globalHoverEl.addEventListener('change', () => {
      updateInheritOptionLabels();
    });
  }

  // Section 2: Layer Flight & Capture Dynamics Listeners
  const layerCaptureModeEl = document.getElementById('layer-capture-mode');
  if (layerCaptureModeEl) {
    layerCaptureModeEl.addEventListener('change', () => {
      const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
      if (activeLayer) {
        activeLayer.captureMode = layerCaptureModeEl.value;
      }
      updateGrid();
    });
  }

  const layerPathModeEl = document.getElementById('layer-path-mode');
  if (layerPathModeEl) {
    layerPathModeEl.addEventListener('change', () => {
      const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
      if (activeLayer) {
        activeLayer.pathMode = layerPathModeEl.value;
      }
      updateGrid();
    });
  }

  const layerHeadingModeEl = document.getElementById('layer-heading-mode');
  if (layerHeadingModeEl) {
    layerHeadingModeEl.addEventListener('change', () => {
      const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
      if (activeLayer) {
        activeLayer.headingMode = layerHeadingModeEl.value;
        const effHeading = getEffectiveLayerHeadingMode(activeLayer);
        const layerPoiContainer = document.getElementById('layer-poi-container');
        if (layerPoiContainer) {
          if (effHeading === 'towardPOI') {
            layerPoiContainer.classList.remove('hidden');
          } else {
            layerPoiContainer.classList.add('hidden');
          }
        }
        const layerCustomHeadingContainer = document.getElementById('layer-custom-heading-container');
        if (layerCustomHeadingContainer) {
          if (effHeading === 'custom') {
            layerCustomHeadingContainer.classList.remove('hidden');
          } else {
            layerCustomHeadingContainer.classList.add('hidden');
          }
        }
      }
      updateGrid();
    });
  }

  const layerCustomHeadingEl = document.getElementById('layer-custom-heading');
  const layerCustomHeadingVal = document.getElementById('layer-custom-heading-val');
  if (layerCustomHeadingEl) {
    layerCustomHeadingEl.addEventListener('input', () => {
      const val = parseInt(layerCustomHeadingEl.value, 10) || 0;
      if (layerCustomHeadingVal) layerCustomHeadingVal.textContent = val;
      const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
      if (activeLayer) {
        activeLayer.customHeading = val;
      }
      redrawCurrentMission();
      if (typeof updateFPVEditorUI === 'function') updateFPVEditorUI();
    });
  }
  document.querySelectorAll('.layer-head-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const angle = parseInt(btn.dataset.angle, 10) || 0;
      if (layerCustomHeadingEl) layerCustomHeadingEl.value = angle;
      if (layerCustomHeadingVal) layerCustomHeadingVal.textContent = angle;
      const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
      if (activeLayer) {
        activeLayer.customHeading = angle;
      }
      redrawCurrentMission();
      if (typeof updateFPVEditorUI === 'function') updateFPVEditorUI();
    });
  });

  const layerPoiSelectEl = document.getElementById('layer-poi-select');
  if (layerPoiSelectEl) {
    layerPoiSelectEl.addEventListener('change', () => {
      const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
      if (activeLayer) {
        activeLayer.targetPoiId = layerPoiSelectEl.value || null;
      }
      updateGrid();
    });
  }

  // Layer Advanced Dynamics Drawer Toggle
  const layerAdvToggleBtn = document.getElementById('layer-advanced-dynamics-toggle-btn');
  const layerAdvDrawer = document.getElementById('layer-advanced-dynamics-drawer');
  const layerAdvArrow = document.getElementById('layer-advanced-dynamics-arrow');
  if (layerAdvToggleBtn && layerAdvDrawer) {
    layerAdvToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = layerAdvDrawer.classList.contains('hidden');
      if (isHidden) {
        layerAdvDrawer.classList.remove('hidden');
        if (layerAdvArrow) layerAdvArrow.style.transform = 'rotate(180deg)';
      } else {
        layerAdvDrawer.classList.add('hidden');
        if (layerAdvArrow) layerAdvArrow.style.transform = 'rotate(0deg)';
      }
    });
  }

  const layerTurnOvershootEl = document.getElementById('layer-turnaround-overshoot');
  if (layerTurnOvershootEl) {
    layerTurnOvershootEl.addEventListener('input', () => {
      const val = parseFloat(layerTurnOvershootEl.value) || 0;
      const displayEl = document.getElementById('layer-turnaround-overshoot-val');
      if (displayEl) displayEl.textContent = val;
      const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
      if (activeLayer) activeLayer.turnaroundOvershoot = val;
      updateGrid();
    });
  }

  const layerTurnSpeedEl = document.getElementById('layer-turnaround-speed');
  if (layerTurnSpeedEl) {
    layerTurnSpeedEl.addEventListener('change', () => {
      const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
      if (activeLayer) {
        activeLayer.turnaroundSpeed = (layerTurnSpeedEl.value === 'inherit' || !layerTurnSpeedEl.value) ? null : parseFloat(layerTurnSpeedEl.value);
      }
      updateGrid();
    });
  }

  const layerCornerDampingEl = document.getElementById('layer-corner-damping');
  if (layerCornerDampingEl) {
    layerCornerDampingEl.addEventListener('input', () => {
      const val = parseFloat(layerCornerDampingEl.value) || 0;
      const displayEl = document.getElementById('layer-corner-damping-val');
      if (displayEl) displayEl.textContent = val.toFixed(1);
      const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
      if (activeLayer) activeLayer.turnDampingDist = val;
      updateGrid();
    });
  }

  const layerHoverModeEl = document.getElementById('layer-hover-time-mode');
  const layerHoverWrapper = document.getElementById('layer-hover-time-custom-wrapper');
  const layerHoverSliderEl = document.getElementById('layer-hover-time-slider');
  const layerHoverValDisplay = document.getElementById('layer-hover-time-val');
  if (layerHoverModeEl) {
    layerHoverModeEl.addEventListener('change', () => {
      const isCustom = layerHoverModeEl.value === 'custom';
      if (layerHoverWrapper) {
        if (isCustom) layerHoverWrapper.classList.remove('hidden');
        else layerHoverWrapper.classList.add('hidden');
      }
      const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
      if (activeLayer) {
        if (isCustom && layerHoverSliderEl) {
          activeLayer.hoverTime = parseInt(layerHoverSliderEl.value, 10) || 0;
        } else {
          activeLayer.hoverTime = 'inherit';
        }
      }
      updateGrid();
    });
  }
  if (layerHoverSliderEl) {
    layerHoverSliderEl.addEventListener('input', () => {
      const val = parseInt(layerHoverSliderEl.value, 10) || 0;
      if (layerHoverValDisplay) layerHoverValDisplay.textContent = val;
      const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
      if (activeLayer && layerHoverModeEl?.value === 'custom') {
        activeLayer.hoverTime = val;
      }
      updateGrid();
    });
  }

  const layerAutoSettlingToggle = document.getElementById('layer-auto-settling-toggle');
  if (layerAutoSettlingToggle) {
    layerAutoSettlingToggle.addEventListener('change', () => {
      const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
      if (activeLayer) activeLayer.autoSettlingEnabled = layerAutoSettlingToggle.checked;
      updateGrid();
    });
  }

  const bindSettlingSlider = (sliderId, displayId, layerProp) => {
    const slider = document.getElementById(sliderId);
    const display = document.getElementById(displayId);
    if (slider) {
      slider.addEventListener('input', () => {
        const val = parseFloat(slider.value) || 0;
        if (display) display.textContent = val.toFixed(1);
        const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
        if (activeLayer) activeLayer[layerProp] = val;
        updateGrid();
      });
    }
  };

  bindSettlingSlider('layer-base-settling-slider', 'layer-base-settling-val', 'baseSettlingTime');
  bindSettlingSlider('layer-major-turn-settling-slider', 'layer-major-turn-settling-val', 'majorTurnSettlingTime');
  bindSettlingSlider('layer-mod-turn-settling-slider', 'layer-mod-turn-settling-val', 'moderateTurnSettlingTime');
  bindSettlingSlider('layer-pitch-settling-slider', 'layer-pitch-settling-val', 'pitchSettlingTime');


  // Search Address button
  const searchBtn = document.getElementById('search-btn');
  const locInput = document.getElementById('location-input');
  if (searchBtn) searchBtn.addEventListener('click', searchAddress);
  if (locInput) {
    locInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        searchAddress();
      }
    });
  }



  // Gimbal Pitch Preset Chips
  const presetChips = document.querySelectorAll('.gimbal-preset-chip');
  if (presetChips && presetChips.forEach) {
    presetChips.forEach(chip => {
      chip.addEventListener('click', () => {
        const rawPitch = chip.dataset ? chip.dataset.pitch : chip.getAttribute('data-pitch');
        const gimbalSlider = document.getElementById('gimbal-pitch');
        const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;

        if (rawPitch === 'auto') {
          if (activeLayer) {
            activeLayer.gimbalPitch = 'auto';
            if (activeLayer.pattern === 'road-following') {
              activeLayer.roadFocusMode = 'focusRoad';
              const rfm = document.getElementById('road-focus-mode');
              if (rfm) rfm.value = 'focusRoad';
              if (typeof updateRoadFocusUI === 'function') updateRoadFocusUI(activeLayer);
            }
          }
          syncDisplayValues();
          updateGrid();
          saveAllSettingsToLocalStorage();
          return;
        }

        const pitch = parseFloat(rawPitch);
        if (gimbalSlider && !isNaN(pitch)) {
          gimbalSlider.value = pitch;
          if (activeLayer) {
            activeLayer.gimbalPitch = pitch;
          }
          syncDisplayValues();
          updateGrid();
          saveAllSettingsToLocalStorage();
        }
      });
    });
  }

  // Road Focus Mode dropdown listener
  const roadFocusModeEl = document.getElementById('road-focus-mode');
  if (roadFocusModeEl) {
    roadFocusModeEl.addEventListener('change', () => {
      const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
      if (activeLayer) {
        activeLayer.roadFocusMode = roadFocusModeEl.value;
        if (roadFocusModeEl.value === 'focusRoad') {
          activeLayer.gimbalPitch = 'auto';
        }
      }
      if (typeof updateRoadFocusUI === 'function') updateRoadFocusUI(activeLayer);
      updateGrid();
      saveAllSettingsToLocalStorage();
    });
  }

  // Header Telemetry & Weather Popover toggle
  const telemetryPill = document.getElementById('header-telemetry-pill');
  const telemetryPopover = document.getElementById('telemetry-weather-popover');
  const telemetryCloseBtn = document.getElementById('telemetry-popover-close-btn');
  const sidebarSummaryStrip = document.getElementById('sidebar-summary-strip');
  const popRefreshWeather = document.getElementById('pop-btn-refresh-weather');

  if (telemetryPill && telemetryPopover) {
    telemetryPill.addEventListener('click', (e) => {
      e.stopPropagation();
      telemetryPopover.classList.toggle('hidden');
    });
  }
  if (sidebarSummaryStrip && telemetryPopover) {
    sidebarSummaryStrip.addEventListener('click', (e) => {
      e.stopPropagation();
      telemetryPopover.classList.toggle('hidden');
    });
  }
  if (telemetryCloseBtn && telemetryPopover) {
    telemetryCloseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      telemetryPopover.classList.add('hidden');
    });
  }
  if (telemetryPopover) {
    // Prevent clicks inside popover from bubbling to document (which closes it when inner elements re-render)
    telemetryPopover.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }
  if (popRefreshWeather) {
    popRefreshWeather.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof centerMarker !== 'undefined' && centerMarker) {
        lastWeatherFetchCenter = null;
        fetchAndProcessWeather(centerMarker.getLatLng().lat, centerMarker.getLatLng().lng, true);
      }
    });
  }

  // TFR & NOTAM UI Listeners
  const popRefreshTfr = document.getElementById('pop-btn-refresh-tfr');
  const popTfrRadius = document.getElementById('pop-tfr-radius');
  const closeTfrModalBtn = document.getElementById('close-tfr-modal-btn');
  const closeTfrModalFooterBtn = document.getElementById('close-tfr-modal-footer-btn');

  if (popRefreshTfr) {
    popRefreshTfr.addEventListener('click', () => {
      if (typeof centerMarker !== 'undefined' && centerMarker) {
        tfrLastFetchCenter = null;
        fetchAndProcessTFRs(centerMarker.getLatLng().lat, centerMarker.getLatLng().lng, true);
      }
    });
  }
  if (popTfrRadius) {
    popTfrRadius.addEventListener('change', () => {
      tfrFilterRadiusNM = parseFloat(popTfrRadius.value) || 30;
      if (typeof centerMarker !== 'undefined' && centerMarker) {
        filterAndUpdateTfrUI(centerMarker.getLatLng().lat, centerMarker.getLatLng().lng);
      }
    });
  }
  if (closeTfrModalBtn) closeTfrModalBtn.addEventListener('click', closeTfrBriefingModal);
  if (closeTfrModalFooterBtn) closeTfrModalFooterBtn.addEventListener('click', closeTfrBriefingModal);

  document.addEventListener('click', (e) => {
    if (telemetryPopover && !telemetryPopover.classList.contains('hidden')) {
      const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
      if (
        path.includes(telemetryPopover) ||
        telemetryPopover.contains(e.target) ||
        telemetryPill?.contains(e.target) ||
        sidebarSummaryStrip?.contains(e.target)
      ) {
        return;
      }
      telemetryPopover.classList.add('hidden');
    }
  });

  // Navigation Layout setting
  const navLayoutSelect = document.getElementById('nav-layout-select');
  if (navLayoutSelect) {
    const savedLayout = localStorage.getItem('aalaapi_nav_layout') || 'header';
    navLayoutSelect.value = savedLayout;
    navLayoutSelect.addEventListener('change', () => {
      localStorage.setItem('aalaapi_nav_layout', navLayoutSelect.value);
    });
  }

  // Add POI button
  const addPoiBtn = document.getElementById('add-poi-btn');
  if (addPoiBtn) {
    addPoiBtn.addEventListener('click', () => {
      if (typeof map !== 'undefined' && map) {
        const center = map.getCenter();
        const offsetLat = center.lat + (Math.random() - 0.5) * 0.0005;
        const offsetLng = center.lng + (Math.random() - 0.5) * 0.0005;
        addPoi(offsetLat, offsetLng);
      }
    });
  }

  // Guide Modal controls
  const showGuideBtn = document.getElementById('show-guide-btn');
  const closeGuideBtn = document.getElementById('close-guide-btn');
  const closeGuideFooterBtn = document.getElementById('close-guide-footer-btn');
  const guideModal = document.getElementById('guide-modal');

  if (showGuideBtn) {
    showGuideBtn.addEventListener('click', () => openRC2GuideModal('manual'));
  }
  if (closeGuideBtn) {
    closeGuideBtn.addEventListener('click', () => guideModal && guideModal.classList.add('hidden'));
  }
  if (closeGuideFooterBtn) {
    closeGuideFooterBtn.addEventListener('click', () => guideModal && guideModal.classList.add('hidden'));
  }

  // Wire up guide navigation tabs
  const guideTabBtns = document.querySelectorAll('.guide-tab-btn');
  guideTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      switchGuideTab(btn.dataset.tab);
    });
  });

  // Wire up copy command buttons in guide modal
  const copyCmdBtns = document.querySelectorAll('.btn-copy-cmd');
  copyCmdBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const textToCopy = btn.dataset.copy || 'npm run bridge';
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(textToCopy).then(() => {
          const originalText = btn.textContent;
          btn.textContent = 'Copied!';
          btn.style.color = '#34d399';
          setTimeout(() => {
            btn.textContent = originalText;
            btn.style.color = '';
          }, 2000);
        }).catch(() => {
          // Fallback if clipboard permission denied
          if (typeof prompt === 'function') prompt('Copy command:', textToCopy);
        });
      }
    });
  });

  // Wire up offline sync container guidance triggers
  const companionOfflineHint = document.getElementById('companion-offline-hint');
  if (companionOfflineHint) {
    companionOfflineHint.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!isCompanionOnline) {
        openRC2GuideModal('service');
      } else {
        openRC2GuideModal('usb');
      }
    });
  }

  const companionHelpBtn = document.getElementById('companion-help-btn');
  if (companionHelpBtn) {
    companionHelpBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openRC2GuideModal('service');
    });
  }

  const companionServiceHelpBtn = document.getElementById('companion-service-help-btn');
  if (companionServiceHelpBtn) {
    companionServiceHelpBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openRC2GuideModal('service');
    });
  }

  const companionUsbHelpBtn = document.getElementById('companion-usb-help-btn');
  if (companionUsbHelpBtn) {
    companionUsbHelpBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openRC2GuideModal('usb');
    });
  }

  const companionConfigHostBtn = document.getElementById('companion-config-host-btn');
  const companionHostPanel = document.getElementById('companion-host-panel');
  const companionHostInput = document.getElementById('companion-host-input');
  const companionHostSaveBtn = document.getElementById('companion-host-save-btn');
  const companionHostResetBtn = document.getElementById('companion-host-reset-btn');

  if (companionConfigHostBtn && companionHostPanel && companionHostInput) {
    companionHostInput.value = (typeof getCompanionApiBase === 'function') ? getCompanionApiBase() : 'http://127.0.0.1:8765';
    companionConfigHostBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = companionHostPanel.style.display === 'none' || !companionHostPanel.style.display;
      companionHostPanel.style.display = isHidden ? 'flex' : 'none';
      if (isHidden) {
        companionHostInput.value = (typeof getCompanionApiBase === 'function') ? getCompanionApiBase() : 'http://127.0.0.1:8765';
        companionHostInput.focus();
      }
    });

    if (companionHostSaveBtn) {
      companionHostSaveBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const val = companionHostInput.value.trim();
        if (typeof setCompanionApiBase === 'function') setCompanionApiBase(val);
        companionHostPanel.style.display = 'none';
      });
    }

    if (companionHostResetBtn) {
      companionHostResetBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof setCompanionApiBase === 'function') setCompanionApiBase('');
        companionHostInput.value = (typeof getCompanionApiBase === 'function') ? getCompanionApiBase() : 'http://127.0.0.1:8765';
        companionHostPanel.style.display = 'none';
      });
    }

    const bridgeTileCacheToggle = document.getElementById('bridge-tile-cache-toggle');
    if (bridgeTileCacheToggle) {
      bridgeTileCacheToggle.checked = (typeof isBridgeTileCachingEnabled === 'function') ? isBridgeTileCachingEnabled() : true;
      bridgeTileCacheToggle.addEventListener('change', () => {
        if (typeof setBridgeTileCachingEnabled === 'function') {
          setBridgeTileCachingEnabled(bridgeTileCacheToggle.checked);
        }
        if (typeof showToast === 'function') {
          showToast(`Bridge map tile caching ${bridgeTileCacheToggle.checked ? 'enabled' : 'disabled'}.`, 2500);
        }
      });
    }

    const bridgeCacheClearBtn = document.getElementById('bridge-cache-clear-btn');
    if (bridgeCacheClearBtn) {
      bridgeCacheClearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof purgeBridgeTileCache === 'function') {
          purgeBridgeTileCache();
        }
      });
    }
  }

  const mcpCopyBtn = document.getElementById('mcp-copy-cli-btn');
  if (mcpCopyBtn) {
    mcpCopyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const cmd = 'gemini mcp add aalaapi-sky node tools/companion/mcp_server.js';
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(cmd).then(() => {
          const origText = mcpCopyBtn.innerHTML;
          mcpCopyBtn.innerHTML = '<span>✅ Copied Gemini Command!</span>';
          setTimeout(() => { mcpCopyBtn.innerHTML = origText; }, 2500);
          if (typeof showToast === 'function') showToast('Copied Gemini CLI MCP command to clipboard!', 2500);
        }).catch(() => {
          if (typeof prompt === 'function') prompt('Copy Gemini CLI Command:', cmd);
        });
      } else if (typeof prompt === 'function') {
        prompt('Copy Gemini CLI Command:', cmd);
      }
    });
  }

  const companionSyncContainer = document.getElementById('companion-sync-container');
  if (companionSyncContainer) {
    companionSyncContainer.addEventListener('click', (e) => {
      if (e.target && e.target.closest && (
        e.target.closest('#open-diagnostics-btn') ||
        e.target.closest('#direct-rc2-sync-btn') ||
        e.target.closest('#direct-rc2-pull-btn') ||
        e.target.closest('#companion-service-help-btn') ||
        e.target.closest('#companion-usb-help-btn') ||
        e.target.closest('#companion-config-host-btn') ||
        e.target.closest('#companion-host-panel')
      )) {
        return;
      }
      if (!isCompanionOnline) {
        openRC2GuideModal('service');
      } else if (!isRc2MtpConnected) {
        openRC2GuideModal('usb');
      }
    });
  }

  // About Modal controls
  const showAboutBtn = document.getElementById('about-btn');
  const closeAboutBtn = document.getElementById('close-about-btn');
  const closeAboutFooterBtn = document.getElementById('close-about-footer-btn');
  const aboutModal = document.getElementById('about-modal');

  if (showAboutBtn && aboutModal) {
    const toggleAboutModal = () => {
      aboutModal.classList.toggle('hidden');
      if (!aboutModal.classList.contains('hidden') && window.innerWidth <= 768) {
        document.querySelector('.sidebar').classList.remove('open');
      }
    };
    showAboutBtn.addEventListener('click', toggleAboutModal);
    if (closeAboutBtn) closeAboutBtn.addEventListener('click', toggleAboutModal);
    if (closeAboutFooterBtn) closeAboutFooterBtn.addEventListener('click', toggleAboutModal);
  }



  // Useful Links Modal controls
  const showLinksBtn = document.getElementById('useful-links-btn');
  const closeLinksBtn = document.getElementById('close-links-btn');
  const closeLinksFooterBtn = document.getElementById('close-links-footer-btn');
  const linksModal = document.getElementById('links-modal');

  if (showLinksBtn && linksModal) {
    const toggleLinksModal = (e) => {
      if (e) e.stopPropagation();
      linksModal.classList.toggle('hidden');
      if (!linksModal.classList.contains('hidden')) {
        updateOpenSkyLink();
        if (window.innerWidth <= 768) {
          document.querySelector('.sidebar').classList.remove('open');
        }
      }
    };
    showLinksBtn.addEventListener('click', toggleLinksModal);
    if (closeLinksBtn) closeLinksBtn.addEventListener('click', toggleLinksModal);
    if (closeLinksFooterBtn) closeLinksFooterBtn.addEventListener('click', toggleLinksModal);
  }

  // 3-Tier Intro Guide Hub & Spotlight Tour controls
  const introTourBtn = document.getElementById('intro-tour-btn');
  const closeQuickstartBtn = document.getElementById('close-quickstart-btn');
  const closeQuickstartFooterBtn = document.getElementById('close-quickstart-footer-btn');
  const startInteractiveTourBtn = document.getElementById('start-interactive-tour-btn');
  const welcomeTourStartBtn = document.getElementById('welcome-tour-start-btn');
  const welcomeTourDismissBtn = document.getElementById('welcome-tour-dismiss-btn');
  const welcomeTourSkipBtn = document.getElementById('welcome-tour-skip-btn');

  if (introTourBtn) {
    introTourBtn.addEventListener('click', () => openIntroModal('workflow'));
  }
  if (closeQuickstartBtn) {
    closeQuickstartBtn.addEventListener('click', closeIntroModal);
  }
  if (closeQuickstartFooterBtn) {
    closeQuickstartFooterBtn.addEventListener('click', closeIntroModal);
  }
  if (startInteractiveTourBtn) {
    startInteractiveTourBtn.addEventListener('click', startInteractiveUITour);
  }
  if (welcomeTourStartBtn) {
    welcomeTourStartBtn.addEventListener('click', () => {
      dismissWelcomeTourBanner();
      openIntroModal('workflow');
    });
  }
  if (welcomeTourDismissBtn) {
    welcomeTourDismissBtn.addEventListener('click', dismissWelcomeTourBanner);
  }
  if (welcomeTourSkipBtn) {
    welcomeTourSkipBtn.addEventListener('click', dismissWelcomeTourBanner);
  }

  const quickstartModal = document.getElementById('quickstart-modal');
  if (quickstartModal) {
    quickstartModal.addEventListener('click', (e) => {
      if (e.target === quickstartModal) {
        closeIntroModal();
      }
    });
  }

  // Wire up Intro modal tabs
  const tabWorkflowBtn = document.getElementById('intro-tab-workflow');
  const tabFeaturesBtn = document.getElementById('intro-tab-features');
  const tabTipsBtn = document.getElementById('intro-tab-tips');

  if (tabWorkflowBtn) tabWorkflowBtn.addEventListener('click', () => switchIntroTab('workflow'));
  if (tabFeaturesBtn) tabFeaturesBtn.addEventListener('click', () => switchIntroTab('features'));
  if (tabTipsBtn) tabTipsBtn.addEventListener('click', () => switchIntroTab('tips'));

  // Wire up Spotlight Tour controls
  const tourNextBtn = document.getElementById('tour-next-btn');
  const tourPrevBtn = document.getElementById('tour-prev-btn');
  const tourSkipBtn = document.getElementById('tour-skip-btn');
  const tourCloseBtn = document.getElementById('tour-close-btn');

  if (tourNextBtn) tourNextBtn.addEventListener('click', nextTourStep);
  if (tourPrevBtn) tourPrevBtn.addEventListener('click', prevTourStep);
  if (tourSkipBtn) tourSkipBtn.addEventListener('click', exitInteractiveUITour);
  if (tourCloseBtn) tourCloseBtn.addEventListener('click', exitInteractiveUITour);

  // Keyboard navigation for Tour and Modals
  document.addEventListener('keydown', (e) => {
    const tourOverlay = document.getElementById('tour-overlay-container');
    if (tourOverlay && !tourOverlay.classList.contains('hidden')) {
      if (e.key === 'Escape') {
        exitInteractiveUITour();
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        nextTourStep();
      } else if (e.key === 'ArrowLeft') {
        prevTourStep();
      }
    } else {
      const quickstartModal = document.getElementById('quickstart-modal');
      if (quickstartModal && !quickstartModal.classList.contains('hidden') && e.key === 'Escape') {
        closeIntroModal();
      }
    }
  });

  // Pre-Flight KMZ Inspector controls
  const kmzAuditBtn = document.getElementById('kmz-audit-btn');
  const kmzPreflightBadge = document.getElementById('kmz-preflight-status-badge');
  const closeKmzInspectorBtn = document.getElementById('close-kmz-inspector-btn');
  const closeInspectorFooterBtn = document.getElementById('close-inspector-footer-btn');
  const inspectorAutofixDownloadBtn = document.getElementById('inspector-autofix-download-btn');
  const inspectorFileInput = document.getElementById('inspector-file-input');

  if (kmzAuditBtn) {
    kmzAuditBtn.addEventListener('click', (e) => {
      if (e && e.stopPropagation) e.stopPropagation();
      KMZInspector.open();
    });
  }

  if (kmzPreflightBadge) {
    kmzPreflightBadge.addEventListener('click', () => {
      KMZInspector.open();
    });
  }

  if (closeKmzInspectorBtn) {
    closeKmzInspectorBtn.addEventListener('click', () => {
      KMZInspector.close();
    });
  }

  if (closeInspectorFooterBtn) {
    closeInspectorFooterBtn.addEventListener('click', () => {
      KMZInspector.close();
    });
  }

  if (inspectorAutofixDownloadBtn) {
    inspectorAutofixDownloadBtn.addEventListener('click', () => {
      KMZInspector.close();
      if (typeof exportKMZ === 'function') exportKMZ();
    });
  }

  const inspectorCopyAntigravityBtn = document.getElementById('inspector-copy-antigravity-btn');
  if (inspectorCopyAntigravityBtn) {
    inspectorCopyAntigravityBtn.addEventListener('click', () => {
      KMZInspector.copyAntigravityPrompt();
    });
  }

  if (inspectorFileInput) {
    inspectorFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) KMZInspector.auditExternalKMZ(file);
    });
  }

  // KMZ Inspector Tab switching
  const tabChecklist = document.getElementById('inspector-tab-checklist');
  const tabWpml = document.getElementById('inspector-tab-wpml');
  const tabTmpl = document.getElementById('inspector-tab-tmpl');
  const paneChecklist = document.getElementById('inspector-pane-checklist');
  const paneWpml = document.getElementById('inspector-pane-wpml');
  const paneTmpl = document.getElementById('inspector-pane-tmpl');

  function switchInspectorTab(tabName) {
    [tabChecklist, tabWpml, tabTmpl].forEach(t => t && t.classList.remove('active'));
    [paneChecklist, paneWpml, paneTmpl].forEach(p => p && p.classList.add('hidden'));

    if (tabName === 'wpml' && tabWpml && paneWpml) {
      tabWpml.classList.add('active');
      paneWpml.classList.remove('hidden');
    } else if (tabName === 'tmpl' && tabTmpl && paneTmpl) {
      tabTmpl.classList.add('active');
      paneTmpl.classList.remove('hidden');
    } else if (tabChecklist && paneChecklist) {
      tabChecklist.classList.add('active');
      paneChecklist.classList.remove('hidden');
    }
  }

  if (tabChecklist) tabChecklist.addEventListener('click', () => switchInspectorTab('checklist'));
  if (tabWpml) tabWpml.addEventListener('click', () => switchInspectorTab('wpml'));
  if (tabTmpl) tabTmpl.addEventListener('click', () => switchInspectorTab('tmpl'));

  const rulesDetailsEl = document.getElementById('inspector-rules-details');
  if (rulesDetailsEl) {
    rulesDetailsEl.addEventListener('toggle', () => {
      rulesDetailsEl.setAttribute('data-user-interacted', 'true');
      const expandLabel = document.getElementById('inspector-rules-expand-label');
      if (expandLabel) {
        expandLabel.textContent = rulesDetailsEl.open ? 'Collapse details ▴' : 'Expand details ▾';
      }
    });
  }


  // Mobile & Desktop Sidebar Toggle
  const sidebarToggleBtn = document.getElementById('sidebar-toggle');
  const sidebarElement = document.querySelector('.sidebar');
  const minimizeSidebarToggle = document.getElementById('minimize-sidebar-toggle');

  if (sidebarToggleBtn && sidebarElement) {
    sidebarToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.innerWidth <= 768) {
        sidebarElement.classList.toggle('open');
      } else {
        const isCurrentlyMinimized = sidebarElement.classList.contains('minimized');
        sidebarElement.classList.toggle('minimized');
        
        // Sync with checkbox in config modal
        if (minimizeSidebarToggle) {
          minimizeSidebarToggle.checked = !isCurrentlyMinimized;
        }
        localStorage.setItem('aalaapi_sky_sidebar_minimized', !isCurrentlyMinimized);

        if (map) {
          setTimeout(() => map.invalidateSize(), 300);
        }
      }
    });

    // Close sidebar when clicking anywhere on the map
    if (map) {
      map.on('click', () => {
        if (window.innerWidth <= 768) {
          sidebarElement.classList.remove('open');
        }
      });
    }
  }

  // Download Mission file
  document.getElementById('download-btn').addEventListener('click', () => withPreflightGate(exportKMZ));
  initRC2Controls();
  initMultiVendorToggle();

  // Import KMZ triggers
  const importBtn = document.getElementById('import-btn');
  const importFileInput = document.getElementById('import-file-input');
  const clearImportedBtn = document.getElementById('clear-imported-btn');

  if (importBtn && importFileInput) {
    importBtn.addEventListener('click', () => importFileInput.click());
    importFileInput.addEventListener('change', handleKMZImport);
  }

  if (clearImportedBtn) {
    clearImportedBtn.addEventListener('click', clearImportedMission);
  }

  const clearMissionBtn = document.getElementById('clear-mission-btn');
  if (clearMissionBtn) {
    clearMissionBtn.addEventListener('click', clearMap);
  }

  // Collapsible Stats Panel handler
  const statsPanel = document.getElementById('stats-panel');
  const statsToggleBtn = document.getElementById('stats-toggle-btn');
  if (statsPanel && statsToggleBtn) {
    statsToggleBtn.addEventListener('click', () => {
      statsPanel.classList.toggle('collapsed');
    });
  }

  const unitSystemEl = document.getElementById('unit-system');
  if (unitSystemEl) {
    const savedUnit = localStorage.getItem('aalaapi_sky_unit_system');
    if (savedUnit) {
      unitSystemEl.value = savedUnit;
      cachedUnitSystem = savedUnit;
    } else {
      cachedUnitSystem = unitSystemEl.value;
    }
    syncDisplayValues();
    unitSystemEl.addEventListener('change', () => {
      setUnitSystem(unitSystemEl.value);
    });
  }
  
  // --- CONFIG MODAL & SIDEBAR OPTIONS SYSTEM ---
  const configBtn = document.getElementById('config-btn');
  const configModal = document.getElementById('config-modal');
  const closeConfigBtn = document.getElementById('close-config-btn');
  const closeConfigFooterBtn = document.getElementById('close-config-footer-btn');

  if (configBtn && configModal) {
    const toggleConfigModal = () => {
      configModal.classList.toggle('hidden');
      if (!configModal.classList.contains('hidden')) {
        if (unitSystemEl) unitSystemEl.value = getUnitSystem();
        const themeSelect = document.getElementById('theme-mode-select');
        if (themeSelect) themeSelect.value = getAppTheme();
        const camPalSelect = document.getElementById('camera-palette-select');
        if (camPalSelect) {
          camPalSelect.value = getActiveCameraPalette().id;
          updatePaletteSwatchPreview();
        }
        const camConesToggle = document.getElementById('camera-cones-toggle');
        if (camConesToggle) {
          camConesToggle.checked = isCameraConeEnabled();
        }
        if (typeof updateModifiedSettingsIndicators === 'function') updateModifiedSettingsIndicators();
        if (window.innerWidth <= 768) {
          document.querySelector('.sidebar')?.classList.remove('open');
        }
      }
    };
    configBtn.addEventListener('click', toggleConfigModal);
    if (closeConfigBtn) closeConfigBtn.addEventListener('click', toggleConfigModal);
    if (closeConfigFooterBtn) closeConfigFooterBtn.addEventListener('click', toggleConfigModal);
    configModal.addEventListener('click', (e) => {
      if (e.target === configModal) {
        configModal.classList.add('hidden');
      }
    });

    // Camera palette and sight cone event listeners
    const camPalSelect = document.getElementById('camera-palette-select');
    if (camPalSelect) {
      camPalSelect.value = getActiveCameraPalette().id;
      updatePaletteSwatchPreview();
      camPalSelect.addEventListener('change', () => {
        setCameraPalette(camPalSelect.value);
      });
    }

    const camConesToggle = document.getElementById('camera-cones-toggle');
    if (camConesToggle) {
      camConesToggle.checked = isCameraConeEnabled();
      camConesToggle.addEventListener('change', () => {
        setCameraConeEnabled(camConesToggle.checked);
      });
    }
  }

  // Initialize Controlled Reset Manager (v1.74.0)
  initControlledResetManager();
  updateModifiedSettingsIndicators();

  // Minimize Sidebar Toggle checkbox handler
  if (minimizeSidebarToggle && sidebarElement) {
    // Read initial state
    const isSidebarMinimized = localStorage.getItem('aalaapi_sky_sidebar_minimized') === 'true';
    minimizeSidebarToggle.checked = isSidebarMinimized;
    if (isSidebarMinimized) {
      sidebarElement.classList.add('minimized');
    }

    minimizeSidebarToggle.addEventListener('change', () => {
      const shouldMinimize = minimizeSidebarToggle.checked;
      localStorage.setItem('aalaapi_sky_sidebar_minimized', shouldMinimize);
      sidebarElement.classList.toggle('minimized', shouldMinimize);
      if (map) {
        setTimeout(() => map.invalidateSize(), 300);
      }
    });
  }

  // Accordion Mode (Auto-Collapse) handler
  const accordionModeToggle = document.getElementById('accordion-mode-toggle');
  let isAccordionMode = true;
  if (accordionModeToggle) {
    const savedAccordion = localStorage.getItem('aalaapi_sky_accordion_mode');
    isAccordionMode = savedAccordion !== null ? (savedAccordion === 'true') : true;
    accordionModeToggle.checked = isAccordionMode;

    accordionModeToggle.addEventListener('change', () => {
      isAccordionMode = accordionModeToggle.checked;
      localStorage.setItem('aalaapi_sky_accordion_mode', isAccordionMode);
      if (isAccordionMode) {
        // Collapse all but the first expanded section
        let hasExpanded = false;
        document.querySelectorAll('.control-section').forEach(section => {
          if (section.classList.contains('guide-section')) return;
          if (!section.classList.contains('collapsed')) {
            if (hasExpanded) {
              section.classList.add('collapsed');
            } else {
              hasExpanded = true;
            }
          }
        });
      }
    });
  }

  // Topic Collapsible headers handler
  document.querySelectorAll('.control-section h3').forEach(header => {
    // Only bind if the section isn't guide-section
    const section = header.closest('.control-section');
    if (section && !section.classList.contains('guide-section')) {
      // Restore previous collapsed state if saved; default to collapsed
      const sectionIndex = Array.from(document.querySelectorAll('.control-section')).indexOf(section);
      const isCollapsed = localStorage.getItem(`aalaapi_sky_section_${sectionIndex}_collapsed`);
      if (isCollapsed !== null) {
        if (isCollapsed === 'true') {
          section.classList.add('collapsed');
        } else {
          section.classList.remove('collapsed');
        }
      } else {
        if (sectionIndex === 0) {
          section.classList.remove('collapsed');
        } else {
          section.classList.add('collapsed');
        }
      }

      header.addEventListener('click', (e) => {
        if (e && e.target && e.target.closest('button, input, select, a')) return;
        const wasCollapsed = section.classList.contains('collapsed');
        section.classList.toggle('collapsed');
        localStorage.setItem(`aalaapi_sky_section_${sectionIndex}_collapsed`, !wasCollapsed);

        if (isAccordionMode && wasCollapsed) { // wasCollapsed means we are now expanding
          document.querySelectorAll('.control-section').forEach(otherSection => {
            if (otherSection !== section && !otherSection.classList.contains('guide-section')) {
              otherSection.classList.add('collapsed');
              const otherIndex = Array.from(document.querySelectorAll('.control-section')).indexOf(otherSection);
              localStorage.setItem(`aalaapi_sky_section_${otherIndex}_collapsed`, 'true');
            }
          });
        }
      });
    }
  });

  // Collapse/Expand all topics buttons
  const collapseAllBtn = document.getElementById('collapse-all-topics-btn');
  const expandAllBtn = document.getElementById('expand-all-topics-btn');

  if (collapseAllBtn) {
    collapseAllBtn.addEventListener('click', () => {
      document.querySelectorAll('.control-section').forEach((section, idx) => {
        if (!section.classList.contains('guide-section')) {
          section.classList.add('collapsed');
          localStorage.setItem(`aalaapi_sky_section_${idx}_collapsed`, 'true');
        }
      });
    });
  }

  if (expandAllBtn) {
    expandAllBtn.addEventListener('click', () => {
      document.querySelectorAll('.control-section').forEach((section, idx) => {
        if (!section.classList.contains('guide-section')) {
          section.classList.remove('collapsed');
          localStorage.setItem(`aalaapi_sky_section_${idx}_collapsed`, 'false');
        }
      });
    });
  }
  
  // Run initial toggle to setup correct view state
  togglePatternParameters();

  // Setup Event Listeners for 3D View Modal
  const preview3dBtn = document.getElementById('preview-3d-btn');
  const close3dBtn = document.getElementById('close-3d-btn');
  const close3dFooterBtn = document.getElementById('close-3d-footer-btn');
  const preview3dModal = document.getElementById('preview-3d-modal');

  if (preview3dBtn) {
    preview3dBtn.addEventListener('click', () => {
      if (window.innerWidth <= 768) {
        const sb = document.querySelector('.sidebar');
        if (sb) sb.classList.remove('open');
      }
      if (preview3dModal) {
        preview3dModal.classList.remove('hidden');
        init3DPreview();
        setTimeout(handle3DResize, 50);
        setTimeout(handle3DResize, 250);
      }
    });
  }

  const closeModal = () => {
    if (preview3dModal) {
      preview3dModal.classList.add('hidden');
      const card = document.getElementById('preview-3d-card');
      if (card && card.classList.contains('fullscreen-3d')) {
        card.classList.remove('fullscreen-3d');
        const expandIcon = document.getElementById('expand-3d-icon-expand');
        const compressIcon = document.getElementById('expand-3d-icon-compress');
        const expandText = document.getElementById('expand-3d-text');
        if (expandIcon) expandIcon.classList.remove('hidden');
        if (compressIcon) compressIcon.classList.add('hidden');
        if (expandText) expandText.textContent = 'Expand';
      }
      if (document.exitFullscreen && document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      cleanup3DPreview();
    }
  };

  const expand3dBtn = document.getElementById('expand-3d-btn');
  if (expand3dBtn) {
    expand3dBtn.addEventListener('click', () => {
      const card = document.getElementById('preview-3d-card');
      if (!card) return;
      const isExpanded = card.classList.toggle('fullscreen-3d');
      const expandIcon = document.getElementById('expand-3d-icon-expand');
      const compressIcon = document.getElementById('expand-3d-icon-compress');
      const expandText = document.getElementById('expand-3d-text');
      
      if (expandIcon) expandIcon.classList.toggle('hidden', isExpanded);
      if (compressIcon) compressIcon.classList.toggle('hidden', !isExpanded);
      if (expandText) expandText.textContent = isExpanded ? 'Restore' : 'Expand';

      if (isExpanded && preview3dModal && preview3dModal.requestFullscreen) {
        preview3dModal.requestFullscreen().catch(() => {});
      } else if (!isExpanded && document.exitFullscreen && document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }

      setTimeout(handle3DResize, 50);
      setTimeout(handle3DResize, 300);
    });
  }

  if (close3dBtn) close3dBtn.addEventListener('click', closeModal);
  if (close3dFooterBtn) close3dFooterBtn.addEventListener('click', closeModal);

  // HUD Controls listeners
  const btnAutoRotate = document.getElementById('btn-3d-autorotate');
  if (btnAutoRotate) {
    btnAutoRotate.addEventListener('click', () => {
      autoRotate3D = !autoRotate3D;
      if (threeControls) threeControls.autoRotate = autoRotate3D;
      const indicator = document.getElementById('indicator-3d-autorotate');
      if (indicator) {
        indicator.style.background = autoRotate3D ? '#10b981' : '#ef4444';
      }
    });
  }

  const btnReset = document.getElementById('btn-3d-reset');
  if (btnReset) {
    btnReset.addEventListener('click', () => {
      reset3DCamera();
    });
  }

  const btnToggleCones = document.getElementById('btn-3d-toggle-cones');
  if (btnToggleCones) {
    btnToggleCones.addEventListener('click', () => {
      showCones = !showCones;
      coneGroups.forEach(g => g.visible = showCones);
      const indicator = document.getElementById('indicator-3d-cones');
      if (indicator) {
        indicator.style.background = showCones ? '#10b981' : '#ef4444';
      }
    });
  }

  const btnToggleFootprints = document.getElementById('btn-3d-toggle-footprints');
  if (btnToggleFootprints) {
    btnToggleFootprints.addEventListener('click', () => {
      showFootprints = !showFootprints;
      if (fpvActive) {
        const hp = getWaypointHeadingAndPitch(fpvProgressIndex, getCurrentWaypoints());
        redrawGroundPlane(hp.heading, hp.pitch);
      } else {
        redrawGroundPlane(0, 0);
      }
      const indicator = document.getElementById('indicator-3d-footprints');
      if (indicator) {
        indicator.style.background = showFootprints ? '#10b981' : '#ef4444';
      }
    });
  }

  const btnToggleDrones = document.getElementById('btn-3d-toggle-drones');
  if (btnToggleDrones) {
    btnToggleDrones.addEventListener('click', () => {
      showDroneModels = !showDroneModels;
      recreate3DWaypointsAndPaths();
      const indicator = document.getElementById('indicator-3d-drones');
      if (indicator) {
        indicator.style.background = showDroneModels ? '#10b981' : '#ef4444';
      }
    });
  }

  // HUD Waypoint Colors Legend Toggle (v1.86.4)
  const legendHeader = document.getElementById('hud-legend-header');
  const legendToggleBtn = document.getElementById('hud-legend-toggle-btn');
  const legendBody = document.getElementById('hud-legend-body');
  const toggleHudLegend = (e) => {
    if (e) e.stopPropagation();
    if (!legendBody) return;
    const isHidden = legendBody.style.display === 'none';
    legendBody.style.display = isHidden ? 'flex' : 'none';
    if (legendToggleBtn) legendToggleBtn.textContent = isHidden ? '▼' : '▲';
  };
  if (legendHeader) legendHeader.addEventListener('click', toggleHudLegend);
  if (legendToggleBtn) legendToggleBtn.addEventListener('click', toggleHudLegend);

  // Wires up FPV mode listeners
  setupFPVListeners();

  // Setup click-to-type inline numerical editing for all sidebar value displays
  initClickToTypeInputs();

  // Setup click-to-toggle interactive unit badges
  initClickableUnits();

  // Setup universal floating tooltips for waypoint leg phase badges (v1.86.5)
  initLegPhaseBadgeTooltips();

  // Setup Mission Explorer & Historical Flight Database (Issue #123)
  if (typeof initMissionDbUI === 'function') {
    initMissionDbUI();
  }
}

/**
 * Transforms sidebar value display numbers into interactive click-to-type inputs
 * allowing pilots to click any number and type exact values in active units.
 */
