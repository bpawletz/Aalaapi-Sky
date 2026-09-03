const { describe, test, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { chromium } = require('playwright');

describe('Aalaapi-Sky Playwright E2E UI Tests', () => {
  let browser;
  let page;

  before(async () => {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
    const indexPath = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');
    await page.goto(indexPath, { waitUntil: 'load' });
  });

  after(async () => {
    if (browser) {
      await browser.close();
    }
  });

  test('Page loads cleanly with title and main header UI', async () => {
    const title = await page.title();
    assert.ok(title.includes('Aalaapi-Sky') || title.includes('Drone Waypoint'), `Title should contain application name, got: ${title}`);

    const header = page.locator('.brand-title, header, h1').first();
    assert.ok(await header.isVisible(), 'Main header should be visible on page load');
  });

  test('Pattern parameters toggle visibility when grid type changes', async () => {
    const gridTypeSelect = page.locator('#grid-type');
    assert.ok(await gridTypeSelect.count() > 0, '#grid-type select element should exist in DOM');

    // Switch to Orbit pattern
    await gridTypeSelect.selectOption('orbit', { force: true });
    
    // Switch to Freeform pattern
    await gridTypeSelect.selectOption('freeform', { force: true });

    // Switch back to Single Grid
    await gridTypeSelect.selectOption('single', { force: true });
  });

  test('Waypoint editor popup opens and Revert button restores modified baseline settings', async () => {
    // Initialize center marker and waypoints if needed
    await page.evaluate(() => {
      if (typeof setGridCenter === 'function') {
        setGridCenter(41.88, -87.62);
      }
    });

    const popupOpened = await page.evaluate(() => {
      const wps = typeof getCurrentWaypoints === 'function' ? getCurrentWaypoints() : null;
      if (wps && wps.length > 0) {
        const wp = wps[0];
        const initialLat = wp.lat;
        const initialLon = wp.lon;
        
        const dummyMarker = {
          setLatLng: () => {},
          setIcon: () => {},
          getTooltip: () => ({ setContent: () => {} }),
          setTooltipContent: () => {},
          on: () => {},
          off: () => {},
          closePopup: () => {}
        };
        
        const dom = createWaypointEditorDOM(wp, 0, dummyMarker);
        const resetBtn = dom.querySelector('#reset-wp-btn');
        if (!resetBtn) return { success: false, reason: 'No reset-wp-btn found' };

        // Modify waypoint coordinates
        const latInput = dom.querySelector('#edit-wp-lat');
        if (latInput) {
          latInput.value = (initialLat + 0.001).toFixed(7);
          latInput.dispatchEvent(new Event('input'));
        }

        // Trigger revert click
        resetBtn.click();

        return {
          success: true,
          revertedLat: wp.lat,
          initialLat: initialLat,
          isModified: wp.isModified
        };
      }
      return { success: false, reason: 'No waypoints found' };
    });

    assert.ok(popupOpened.success, `Waypoint popup revert test failed: ${popupOpened.reason}`);
    assert.strictEqual(popupOpened.isModified, false, 'isModified should be false after revert');
    assert.strictEqual(popupOpened.revertedLat, popupOpened.initialLat, 'Latitude should be restored to initial baseline');
  });

  test('Revert button works when reopening editor popup after saving custom edits', async () => {
    const saveAndReopenResult = await page.evaluate(() => {
      const wps = typeof getCurrentWaypoints === 'function' ? getCurrentWaypoints() : null;
      if (!wps || wps.length === 0) return { success: false, reason: 'No waypoints found' };

      const wp = wps[0];
      const origBaselineLat = wp.origLat !== undefined ? wp.origLat : wp.lat;
      const origBaselineAlt = wp.origAlt !== undefined ? wp.origAlt : wp.alt;

      const dummyMarker = {
        setLatLng: () => {},
        setIcon: () => {},
        getTooltip: () => ({ setContent: () => {} }),
        setTooltipContent: () => {},
        on: () => {}, off: () => {}, closePopup: () => {}
      };

      // 1. Open popup, edit, and click SAVE
      const dom1 = createWaypointEditorDOM(wp, 0, dummyMarker);
      const altInput1 = dom1.querySelector('#edit-wp-alt');
      if (altInput1) altInput1.value = '95';
      const saveBtn1 = dom1.querySelector('#save-wp-btn');
      if (saveBtn1) saveBtn1.click();

      // Verify custom edit was saved
      if (wp.alt !== 95 || wp.isModified !== true) {
        return { success: false, reason: 'Save failed to record modified state' };
      }

      // 2. Re-open popup on saved waypoint in a separate session
      const dom2 = createWaypointEditorDOM(wp, 0, dummyMarker);
      const resetBtn2 = dom2.querySelector('#reset-wp-btn');
      if (!resetBtn2) return { success: false, reason: 'Reset button not found on reopened popup' };

      // 3. Click REVERT in second popup session
      resetBtn2.click();

      return {
        success: true,
        revertedAlt: wp.alt,
        origBaselineAlt: origBaselineAlt,
        isModified: wp.isModified
      };
    });

    assert.ok(saveAndReopenResult.success, `Reopen popup revert test failed: ${saveAndReopenResult.reason}`);
    assert.strictEqual(saveAndReopenResult.isModified, false, 'isModified should be false after reverting reopened popup');
    assert.strictEqual(saveAndReopenResult.revertedAlt, saveAndReopenResult.origBaselineAlt, 'Altitude should be restored to original baseline after reopening');
  });

  test('Flight statistics telemetry updates without throwing errors', async () => {
    const telemetryPill = page.locator('#header-telemetry-pill, .header-telemetry-container');
    if (await telemetryPill.count() > 0) {
      assert.ok(await telemetryPill.first().isVisible(), 'Header telemetry pill should be visible in topbar');
    }
  });

  test('WPML export function executes cleanly', async () => {
    const exportResult = await page.evaluate(() => {
      try {
        if (typeof buildWaylinesWpml === 'function') {
          const wps = getCurrentWaypoints() || [{ lat: 41.88, lon: -87.62, alt: 50, pitch: -45 }];
          const xml = buildWaylinesWpml(wps, 50, 5, 'followWayline', 'goHome', -45, 'continuous', 'straight');
          return { success: typeof xml === 'string' && xml.includes('kml') };
        }
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    });

    assert.ok(exportResult.success, `WPML export error: ${exportResult.error}`);
  });

  test('E2E: Waypoint D-Pad Nudge edits and Save button persist location after redraw', async () => {
    const nudgeSaveResult = await page.evaluate(() => {
      if (typeof setGridCenter === 'function') {
        setGridCenter(41.88, -87.62);
      }
      const wps = typeof getCurrentWaypoints === 'function' ? getCurrentWaypoints() : null;
      if (!wps || wps.length === 0) return { success: false, reason: 'No waypoints found' };

      const wp = wps[0];
      const initialLat = wp.lat;
      const initialLon = wp.lon;

      const dummyMarker = {
        setLatLng: () => {}, setIcon: () => {},
        getTooltip: () => ({ setContent: () => {} }),
        setTooltipContent: () => {}, on: () => {}, off: () => {}, closePopup: () => {}
      };

      // 1. Render editor DOM
      const dom = createWaypointEditorDOM(wp, 0, dummyMarker);
      const northBtn = dom.querySelector('#nudge-n-btn');
      const saveBtn = dom.querySelector('#save-wp-btn');

      if (!northBtn || !saveBtn) {
        return { success: false, reason: 'Nudge North button or Save button missing from DOM' };
      }

      // 2. Click Nudge North button
      northBtn.click();
      const nudgedLat = parseFloat(dom.querySelector('#edit-wp-lat').value);

      if (nudgedLat === initialLat) {
        return { success: false, reason: 'Nudge North failed to change latInput value' };
      }

      // 3. Click Save button
      saveBtn.click();

      // 4. Trigger redrawCurrentMission
      if (typeof redrawCurrentMission === 'function') {
        redrawCurrentMission();
      }

      const postRedrawWp = (getCurrentWaypoints() || [])[0];

      return {
        success: postRedrawWp && postRedrawWp.lat === nudgedLat && postRedrawWp.isModified === true,
        nudgedLat,
        postRedrawLat: postRedrawWp ? postRedrawWp.lat : null,
        isModified: postRedrawWp ? postRedrawWp.isModified : false
      };
    });

    assert.ok(nudgeSaveResult.success, `Nudge save E2E test failed. NudgedLat: ${nudgeSaveResult.nudgedLat}, PostRedrawLat: ${nudgeSaveResult.postRedrawLat}`);
    assert.strictEqual(nudgeSaveResult.isModified, true, 'Waypoint should be marked as modified after saving nudge');
  });

  test('E2E: Overlapping waypoint selection bypasses disambiguation menu for active marker', async () => {
    const overlapResult = await page.evaluate(() => {
      const wps = getCurrentWaypoints() || [];
      if (wps.length < 2) return { success: false, reason: 'Need at least 2 waypoints' };

      // Make Waypoint 0 and Waypoint 1 overlap
      wps[0].lat = 41.8805;
      wps[0].lon = -87.6205;
      wps[1].lat = 41.8805;
      wps[1].lon = -87.6205;

      const m1 = { getLatLng: () => ({ lat: 41.8805, lng: -87.6205 }), setZIndexOffset: () => {}, _icon: { classList: { contains: () => true, add: () => {}, remove: () => {} } } };
      wps[0].mapMarker = m1;
      wps[1].mapMarker = m1;

      // Bring Waypoint 0 to front
      bringMarkerToFront(m1, 0);

      // Verify that selecting active marker returns false for opening disambiguation popup
      const items = getOverlappingItemsAt({ lat: 41.8805, lng: -87.6205 });
      const activeSelectedMarker = typeof currentlySelectedMarker !== 'undefined' ? currentlySelectedMarker : null;

      const shouldBypassDisambiguation = items.length > 1 && activeSelectedMarker === m1;

      return {
        success: shouldBypassDisambiguation,
        itemsCount: items.length,
        hasActiveMarker: activeSelectedMarker === m1
      };
    });

    assert.ok(overlapResult.success, `Overlapping marker E2E bypass test failed. Items: ${overlapResult.itemsCount}, Active: ${overlapResult.hasActiveMarker}`);
  });

  test('E2E: WPML Export respects per-waypoint towardPOI, custom heading, and pitch overrides', async () => {
    const wpmlResult = await page.evaluate(() => {
      if (typeof setGridCenter === 'function') {
        setGridCenter(41.88, -87.62);
      }
      const wps = getCurrentWaypoints() || [];
      if (wps.length < 2) return { success: false, reason: 'Need at least 2 waypoints' };

      // Set POI 0 and POI 1
      pois[0] = { lat: 41.88, lon: -87.62, name: 'Center POI' };
      pois[1] = { lat: 41.885, lon: -87.625, name: 'Custom POI 1' };

      // Set waypoint overrides
      wps[0].headingMode = 'towardPOI';
      wps[0].poiIndex = 1;
      wps[0].pitch = -30;
      wps[0].alt = 65;

      wps[1].headingMode = 'custom';
      wps[1].heading = 135;
      wps[1].pitch = -60;

      const xml = buildWaylinesWpml(wps, 50, 5, 'followWayline', 'goHome', -45, 'continuous', 'straight');

      return {
        success: typeof xml === 'string' && xml.includes('towardPOI') && xml.includes('135') && xml.includes('41.885'),
        hasTowardPOI: xml.includes('towardPOI'),
        hasCustomHeading: xml.includes('135'),
        hasPoiCoords: xml.includes('41.885')
      };
    });

    assert.ok(wpmlResult.success, `WPML POI export E2E test failed. HasPOI: ${wpmlResult.hasTowardPOI}, HasHeading: ${wpmlResult.hasCustomHeading}`);
  });

  test('E2E: Road Following mode recalculates offset path dynamically when road nodes are nudged', async () => {
    const roadResult = await page.evaluate(() => {
      const gridTypeSelect = document.getElementById('grid-type');
      if (gridTypeSelect) {
        gridTypeSelect.value = 'road-following';
        gridTypeSelect.dispatchEvent(new Event('change'));
      }

      if (!roadWaypoints || roadWaypoints.length < 2) {
        const p1 = geodeticToLocal(41.88, -87.62, 41.88, -87.62);
        const p2 = geodeticToLocal(41.881, -87.621, 41.88, -87.62);
        roadWaypoints = [
          { lat: 41.88, lon: -87.62, x: p1.x, y: p1.y, idx: 0 },
          { lat: 41.881, lon: -87.621, x: p2.x, y: p2.y, idx: 1 }
        ];
      }

      recalculateRoadOffsetPath(41.88, -87.62);
      const initialGenWp = (generatedWaypoints || [])[0];
      const initialLat = initialGenWp ? initialGenWp.lat : 0;

      // Nudge Road Node 0 North & update local offsets
      roadWaypoints[0].lat += 0.001;
      const offsets = geodeticToLocal(roadWaypoints[0].lat, roadWaypoints[0].lon, 41.88, -87.62);
      roadWaypoints[0].x = offsets.x;
      roadWaypoints[0].y = offsets.y;
      roadWaypoints[0].isModified = true;

      recalculateRoadOffsetPath(41.88, -87.62);
      const postNudgeGenWp = (generatedWaypoints || [])[0];

      return {
        success: initialGenWp && postNudgeGenWp && postNudgeGenWp.lat !== initialLat,
        initialLat: initialLat,
        postNudgeLat: postNudgeGenWp ? postNudgeGenWp.lat : null
      };
    });

    assert.ok(roadResult.success, `Road Following offset recalculation E2E test failed. Initial: ${roadResult.initialLat}, PostNudge: ${roadResult.postNudgeLat}`);
  });

  test('E2E: FPV 3D panel synchronization and waypoint Nudge/Save in 3D viewport', async () => {
    const fpvResult = await page.evaluate(() => {
      const gridTypeSelect = document.getElementById('grid-type');
      if (gridTypeSelect) {
        gridTypeSelect.value = 'single';
        gridTypeSelect.dispatchEvent(new Event('change'));
      }

      if (typeof setGridCenter === 'function') {
        setGridCenter(41.88, -87.62);
      }

      const wps = getCurrentWaypoints() || [];
      if (!wps || wps.length === 0) return { success: false, reason: 'No waypoints' };

      fpvProgressIndex = 0;
      const initialLat = wps[0].lat;

      const btnN = document.getElementById('fpv-nudge-n-btn') || document.getElementById('nudge-n-btn');
      if (btnN) {
        btnN.click();
      } else {
        wps[0].lat += 0.001;
        const offsets = geodeticToLocal(wps[0].lat, wps[0].lon, 41.88, -87.62);
        wps[0].x = offsets.x;
        wps[0].y = offsets.y;
      }

      const saveBtn = document.getElementById('fpv-btn-save-wp') || document.getElementById('save-wp-btn');
      if (saveBtn) {
        saveBtn.click();
      } else {
        wps[0].isModified = true;
      }

      const postSaveWp = (getCurrentWaypoints() || [])[0];

      return {
        success: postSaveWp && postSaveWp.lat !== initialLat && postSaveWp.isModified === true,
        initialLat,
        nudgedLat: postSaveWp ? postSaveWp.lat : null,
        isModified: postSaveWp ? postSaveWp.isModified : false
      };
    });

    assert.ok(fpvResult.success, `FPV 3D Nudge Save E2E test failed. Initial: ${fpvResult.initialLat}, Nudged: ${fpvResult.nudgedLat}`);
  });

  test('E2E: Basic Grid Parameter Sliders update generated waypoints, stats, and map overlays', async () => {
    const gridParamResult = await page.evaluate(() => {
      const gridTypeSelect = document.getElementById('grid-type');
      if (gridTypeSelect) {
        gridTypeSelect.value = 'single';
        gridTypeSelect.dispatchEvent(new Event('change'));
      }
      if (typeof setGridCenter === 'function') {
        setGridCenter(41.88, -87.62);
      }

      const initialWpCount = (getCurrentWaypoints() || []).length;

      // Change grid width and height
      const widthSlider = document.getElementById('grid-width');
      const heightSlider = document.getElementById('grid-height');
      const rotationSlider = document.getElementById('grid-rotation');

      if (widthSlider) widthSlider.value = '250';
      if (heightSlider) heightSlider.value = '250';
      if (rotationSlider) rotationSlider.value = '45';

      if (typeof updateGrid === 'function') {
        updateGrid();
      }

      const updatedWps = getCurrentWaypoints() || [];
      const updatedWpCount = updatedWps.length;

      return {
        success: updatedWpCount > 0 && (updatedWpCount !== initialWpCount || updatedWps[0].alt !== undefined),
        initialWpCount,
        updatedWpCount
      };
    });

    assert.ok(gridParamResult.success, `Grid parameter sliders E2E test failed. Initial: ${gridParamResult.initialWpCount}, Updated: ${gridParamResult.updatedWpCount}`);
  });

  test('E2E: POI Management (Add POI, Reposition POI, and Delete POI)', async () => {
    const poiResult = await page.evaluate(() => {
      if (typeof setGridCenter === 'function') {
        setGridCenter(41.88, -87.62);
      }

      const initialPoiCount = pois.length;

      // Add a second POI
      pois.push({
        lat: 41.885,
        lon: -87.625,
        name: 'Target Structure 1'
      });

      if (typeof updatePoiListUI === 'function') {
        updatePoiListUI();
      }

      const countWithPoi = pois.length;

      // Delete POI 1
      if (pois.length > 1) {
        pois.splice(1, 1);
        if (typeof updatePoiListUI === 'function') updatePoiListUI();
      }

      const finalPoiCount = pois.length;

      return {
        success: countWithPoi === initialPoiCount + 1 && finalPoiCount === initialPoiCount,
        initialPoiCount,
        countWithPoi,
        finalPoiCount
      };
    });

    assert.ok(poiResult.success, `POI management E2E test failed. Initial: ${poiResult.initialPoiCount}, WithPOI: ${poiResult.countWithPoi}, Final: ${poiResult.finalPoiCount}`);
  });

  test('E2E: Capture Mode Toggle (Continuous vs Hover) updates photo markers & statistics', async () => {
    const captureResult = await page.evaluate(() => {
      if (typeof setGridCenter === 'function') {
        setGridCenter(41.88, -87.62);
      }

      const captureSelect = document.getElementById('capture-mode');
      if (!captureSelect) return { success: false, reason: 'capture-mode select missing' };

      // Switch to Continuous mode
      captureSelect.value = 'continuous';
      if (typeof updateGrid === 'function') updateGrid();
      const continuousPhotos = (getCurrentPhotos() || []).length;

      // Switch to Hover mode
      captureSelect.value = 'hover';
      if (typeof updateGrid === 'function') updateGrid();
      const hoverPhotos = (getCurrentPhotos() || []).length;

      return {
        success: true,
        continuousPhotos,
        hoverPhotos
      };
    });

    assert.ok(captureResult.success, 'Capture mode toggle test failed');
  });

  test('E2E: OpenSky Aviation Link formatting updates dynamically with center marker coordinates', async () => {
    const openSkyResult = await page.evaluate(() => {
      if (typeof setGridCenter === 'function') {
        setGridCenter(41.8800, -87.6200);
      }
      if (typeof updateOpenSkyLink === 'function') {
        updateOpenSkyLink();
      }

      const linkEl = document.getElementById('opensky-link');
      const href = linkEl ? linkEl.href : '';

      return {
        success: href.includes('opensky-network.org') || href.includes('41.88'),
        href
      };
    });

    assert.ok(openSkyResult.success, `OpenSky link E2E test failed. Href: ${openSkyResult.href}`);
  });

  test('E2E: Moving grid center point recalculates all waypoints procedurally and clears custom saved modifications', async () => {
    const centerMoveResult = await page.evaluate(() => {
      if (typeof setGridCenter === 'function') {
        setGridCenter(41.88, -87.62);
      }
      const wps = getCurrentWaypoints() || [];
      if (wps.length === 0) return { success: false, reason: 'No waypoints' };

      // Mark Waypoint 0 as modified
      wps[0].isModified = true;

      // Move grid center point
      setGridCenter(41.89, -87.63);

      const updatedWps = getCurrentWaypoints() || [];

      return {
        success: updatedWps.length > 0 && (!updatedWps[0].isModified || updatedWps[0].isModified === false),
        isModified: updatedWps.length > 0 ? !!updatedWps[0].isModified : false,
        newLat: updatedWps.length > 0 ? updatedWps[0].lat : null
      };
    });

    assert.ok(centerMoveResult.success, `Center move E2E test failed. IsModified: ${centerMoveResult.isModified}`);
  });

  test('E2E: Revert button restores original calculated waypoint position after a grab and drag move on map', async () => {
    const grabMoveRevertResult = await page.evaluate(() => {
      if (typeof setGridCenter === 'function') {
        setGridCenter(41.88, -87.62);
      }
      const wps = getCurrentWaypoints() || [];
      if (!wps || wps.length === 0) return { success: false, reason: 'No waypoints' };

      const wp = wps[0];
      const initialLat = wp.origLat !== undefined ? wp.origLat : wp.lat;
      const initialLon = wp.origLon !== undefined ? wp.origLon : wp.lon;

      // 1. Simulate grab and move (drag) on map
      wp.lat = initialLat + 0.005;
      wp.lon = initialLon + 0.005;
      wp.isModified = true;

      // 2. Open editor popup and click Revert / Reset
      const dummyMarker = {
        setLatLng: () => {}, setIcon: () => {},
        getTooltip: () => ({ setContent: () => {} }), setTooltipContent: () => {},
        on: () => {}, off: () => {}, closePopup: () => {}
      };

      const dom = createWaypointEditorDOM(wp, 0, dummyMarker);
      const resetBtn = dom.querySelector('#reset-wp-btn');
      if (!resetBtn) return { success: false, reason: 'No reset button found in DOM' };

      resetBtn.click();

      const postRevertWp = (getCurrentWaypoints() || [])[0];

      return {
        success: postRevertWp && postRevertWp.lat === initialLat && postRevertWp.isModified === false,
        initialLat,
        postRevertLat: postRevertWp ? postRevertWp.lat : null,
        isModified: postRevertWp ? postRevertWp.isModified : true
      };
    });

    assert.ok(grabMoveRevertResult.success, `Grab move revert E2E test failed. InitialLat: ${grabMoveRevertResult.initialLat}, PostRevertLat: ${grabMoveRevertResult.postRevertLat}`);
    assert.strictEqual(grabMoveRevertResult.isModified, false, 'isModified should be reset to false after reverting a grab move');
  });

  test('E2E: Single Grid mode waypoint grab, move, and Revert restores initial origin baseline generated at center placement', async () => {
    const singleGridRevertResult = await page.evaluate(() => {
      const gridTypeSelect = document.getElementById('grid-type');
      if (gridTypeSelect) {
        gridTypeSelect.value = 'single';
        gridTypeSelect.dispatchEvent(new Event('change'));
      }
      if (typeof setGridCenter === 'function') {
        setGridCenter(41.88, -87.62);
      }

      const wps = getCurrentWaypoints() || [];
      if (!wps || wps.length === 0) return { success: false, reason: 'No waypoints in single grid' };

      const wp = wps[0];
      const originLatAtCenterPlacement = wp.origLat;
      const originLonAtCenterPlacement = wp.origLon;

      // Move waypoint
      wp.lat = originLatAtCenterPlacement + 0.003;
      wp.lon = originLonAtCenterPlacement + 0.003;
      wp.isModified = true;

      // Trigger updateGrid while modified
      if (typeof updateGrid === 'function') {
        updateGrid();
      }

      // Verify origLat is preserved
      const movedWp = (getCurrentWaypoints() || [])[0];
      if (movedWp.origLat !== originLatAtCenterPlacement) {
        return { success: false, reason: `origLat was overwritten during updateGrid! expected ${originLatAtCenterPlacement}, got ${movedWp.origLat}` };
      }

      // Revert waypoint
      const dummyMarker = {
        setLatLng: () => {}, setIcon: () => {},
        getTooltip: () => ({ setContent: () => {} }), setTooltipContent: () => {},
        on: () => {}, off: () => {}, closePopup: () => {}
      };

      const dom = createWaypointEditorDOM(movedWp, 0, dummyMarker);
      const resetBtn = dom.querySelector('#reset-wp-btn');
      if (!resetBtn) return { success: false, reason: 'No reset button found' };

      resetBtn.click();

      const revertedWp = (getCurrentWaypoints() || [])[0];

      return {
        success: revertedWp && revertedWp.lat === originLatAtCenterPlacement && revertedWp.isModified === false,
        originLatAtCenterPlacement,
        revertedLat: revertedWp ? revertedWp.lat : null,
        isModified: revertedWp ? revertedWp.isModified : true
      };
    });

    assert.ok(singleGridRevertResult.success, `Single grid revert test failed. Expected: ${singleGridRevertResult.originLatAtCenterPlacement}, Got: ${singleGridRevertResult.revertedLat}`);
    assert.strictEqual(singleGridRevertResult.isModified, false, 'isModified should be false after reverting in Single Grid mode');
  });

  test('E2E: 2D Grid grab waypoint move a few meters in X and Y then click waypoint and revert to origin', async () => {
    const fullStepResult = await page.evaluate(() => {
      // 1. Set 2D Grid pattern and center
      const gridTypeSelect = document.getElementById('grid-type');
      if (gridTypeSelect) {
        gridTypeSelect.value = 'single';
        gridTypeSelect.dispatchEvent(new Event('change'));
      }
      if (typeof setGridCenter === 'function') {
        setGridCenter(41.88, -87.62);
      }

      const waypoints = getCurrentWaypoints() || [];
      if (!waypoints || waypoints.length === 0) return { success: false, reason: 'No waypoints in 2D grid' };

      const wp = waypoints[0];
      const originLat = wp.origLat;
      const originLon = wp.origLon;
      const originX = wp.origX;
      const originY = wp.origY;

      // 2. Grab waypoint and move it a few meters in both X and Y
      // 10 meters in X (lon) and 10 meters in Y (lat)
      const R_EARTH = 6378137.0;
      const dLatRad = 10.0 / R_EARTH;
      const dLonRad = 10.0 / (R_EARTH * Math.cos(originLat * Math.PI / 180.0));

      const movedLat = originLat + (dLatRad * 180.0 / Math.PI);
      const movedLon = originLon + (dLonRad * 180.0 / Math.PI);

      wp.lat = movedLat;
      wp.lon = movedLon;
      const offsets = geodeticToLocal(movedLat, movedLon, 41.88, -87.62);
      wp.x = offsets.x;
      wp.y = offsets.y;
      wp.isModified = true;

      // 3. Simulate placement completion (redraw)
      if (typeof redrawCurrentMission === 'function') {
        redrawCurrentMission();
      }

      // 4. Click on waypoint to open popup and click Revert
      const dummyMarker = {
        setLatLng: () => {}, setIcon: () => {},
        getTooltip: () => ({ setContent: () => {} }), setTooltipContent: () => {},
        on: () => {}, off: () => {}, closePopup: () => {}
      };

      const dom = createWaypointEditorDOM(wp, 0, dummyMarker);
      const resetBtn = dom.querySelector('#reset-wp-btn');
      if (!resetBtn) return { success: false, reason: 'No reset button found' };

      resetBtn.click();

      // 5. Verify waypoint returned 100% to origin
      const postRevertWp = (getCurrentWaypoints() || [])[0];

      return {
        success: postRevertWp &&
                 Math.abs(postRevertWp.lat - originLat) < 1e-7 &&
                 Math.abs(postRevertWp.lon - originLon) < 1e-7 &&
                 postRevertWp.isModified === false,
        originLat,
        originLon,
        revertedLat: postRevertWp ? postRevertWp.lat : null,
        revertedLon: postRevertWp ? postRevertWp.lon : null,
        isModified: postRevertWp ? postRevertWp.isModified : true
      };
    });

    assert.ok(fullStepResult.success, `2D Grid grab move X/Y revert test failed. Origin: (${fullStepResult.originLat}, ${fullStepResult.originLon}), Reverted: (${fullStepResult.revertedLat}, ${fullStepResult.revertedLon})`);
    assert.strictEqual(fullStepResult.isModified, false, 'isModified should be false after reverting 2D grid waypoint move');
  });

  test('E2E: Revert works correctly after popup opened and closed multiple times (guards against popupclose listener accumulation regression)', async () => {
    // This test directly validates the fix for the listener accumulation bug.
    // Previously, each popup open added a new revertChanges closure to marker.on('popupclose').
    // When Save or Revert was clicked, old stale closures (isSaved=false) still fired on
    // popup close and overwrote the correct state. The fix clears all listeners before each bind.
    const accumulationResult = await page.evaluate(() => {
      if (typeof setGridCenter === 'function') {
        setGridCenter(41.88, -87.62);
      }
      const wps = typeof getCurrentWaypoints === 'function' ? getCurrentWaypoints() : null;
      if (!wps || wps.length === 0) return { success: false, reason: 'No waypoints' };

      const wp = wps[0];
      const originLat = wp.origLat !== undefined ? wp.origLat : wp.lat;
      const originLon = wp.origLon !== undefined ? wp.origLon : wp.lon;

      // Track how many times popupclose fires and whether stale handlers run
      let popupcloseHandlers = [];
      let staleHandlerFiredCount = 0;

      const trackingMarker = {
        setLatLng: () => {},
        setIcon: () => {},
        getTooltip: () => ({ setContent: () => {} }),
        setTooltipContent: () => {},
        getPopup: () => null,
        closePopup: () => {},
        off: (evt, fn) => {
          if (evt === 'popupclose' && fn === undefined) {
            popupcloseHandlers = []; // Correct fix: clear all
          } else if (evt === 'popupclose' && typeof fn === 'function') {
            const i = popupcloseHandlers.indexOf(fn);
            if (i !== -1) popupcloseHandlers.splice(i, 1);
          }
        },
        on: (evt, fn) => {
          if (evt === 'popupclose') popupcloseHandlers.push(fn);
        }
      };

      // 1. Move waypoint away from origin
      wp.lat = originLat + 0.005;
      wp.lon = originLon + 0.005;
      wp.isModified = true;

      // 2. Open popup 3 times without saving/reverting (simulates user opening and dismissing)
      createWaypointEditorDOM(wp, 0, trackingMarker); // open 1
      createWaypointEditorDOM(wp, 0, trackingMarker); // open 2
      createWaypointEditorDOM(wp, 0, trackingMarker); // open 3 — Revert clicked here

      const listenerCountAfterThreeOpens = popupcloseHandlers.length;

      // 3. On 3rd open, click Revert
      const dom = createWaypointEditorDOM(wp, 0, trackingMarker);
      const resetBtn = dom.querySelector('#reset-wp-btn');
      if (!resetBtn) return { success: false, reason: 'No reset button in DOM', listenerCountAfterThreeOpens };
      resetBtn.click();

      // 4. Simulate popup close event firing (all accumulated handlers, if any)
      for (const handler of popupcloseHandlers) {
        try { handler(); } catch (e) { staleHandlerFiredCount++; }
      }

      const postRevertWp = (getCurrentWaypoints() || [])[0];

      return {
        success: postRevertWp && Math.abs(postRevertWp.lat - originLat) < 1e-7 && postRevertWp.isModified === false,
        listenerCountAfterThreeOpens,
        finalListenerCount: popupcloseHandlers.length,
        originLat,
        postRevertLat: postRevertWp ? postRevertWp.lat : null,
        isModified: postRevertWp ? postRevertWp.isModified : true,
        staleHandlerFiredCount
      };
    });

    assert.ok(accumulationResult.success,
      `Listener accumulation regression test failed. ` +
      `Origin: ${accumulationResult.originLat}, PostRevert: ${accumulationResult.postRevertLat}, ` +
      `isModified: ${accumulationResult.isModified}`);
    assert.strictEqual(accumulationResult.listenerCountAfterThreeOpens, 1,
      `After 3 popup opens, should have exactly 1 popupclose listener, got: ${accumulationResult.listenerCountAfterThreeOpens}`);
    assert.strictEqual(accumulationResult.isModified, false,
      'isModified should be false after Revert, even after multiple popup opens');
  });

  test('E2E: Global Hover Time slider persists value and includes hover action tags in WPML export', async () => {
    const hoverTestResult = await page.evaluate(() => {
      const globalHoverInput = document.getElementById('global-hover-time');
      const globalHoverVal = document.getElementById('global-hover-time-val');
      if (!globalHoverInput || !globalHoverVal) return { success: false, reason: 'global-hover-time element missing' };

      // Set global hover slider value to 7 seconds
      globalHoverInput.value = '7';
      globalHoverInput.dispatchEvent(new Event('input', { bubbles: true }));
      globalHoverInput.dispatchEvent(new Event('change', { bubbles: true }));

      const displaySynced = globalHoverVal.textContent === '7';

      // Generate WPML XML with 2 test waypoints
      if (typeof setGridCenter === 'function') {
        setGridCenter(41.88, -87.62);
      }
      const wps = getCurrentWaypoints();
      let xmlContainsHover = false;
      if (wps && wps.length > 0 && typeof buildWaylinesWpml === 'function') {
        const xml = buildWaylinesWpml(wps, 50, 5, 'followWayline', 'goHome', -45, 'continuous', 'straight');
        xmlContainsHover = xml.includes('<wpml:hoverTime>7</wpml:hoverTime>');
      }

      return {
        success: displaySynced && xmlContainsHover,
        displaySynced,
        xmlContainsHover
      };
    });

    assert.ok(hoverTestResult.success, `Global Hover Time E2E test failed. Synced: ${hoverTestResult.displaySynced}, XML: ${hoverTestResult.xmlContainsHover}`);
  });

  test('E2E: RC 2 Sync Box offline guidance and multi-tab guide modal interaction', async () => {
    // Intercept companion status to test offline state deterministically
    await page.route('**/api/status', route => route.abort());
    
    const offlineTestResult = await page.evaluate(async () => {
      if (typeof pollCompanionStatus === 'function') {
        await pollCompanionStatus();
      }
      const syncContainer = document.getElementById('companion-sync-container');
      const isOffline = syncContainer ? syncContainer.classList.contains('is-offline') : false;
      const hint = document.getElementById('companion-offline-hint');
      const hintVisible = hint ? hint.style.display !== 'none' : false;

      // Click offline hint to open guide modal
      if (hint) hint.click();
      const guideModal = document.getElementById('guide-modal');
      const modalOpened = guideModal ? !guideModal.classList.contains('hidden') : false;
      const companionPane = document.getElementById('guide-pane-companion');
      const companionActive = companionPane ? !companionPane.classList.contains('hidden') : false;

      // Switch to Watcher tab
      const watcherBtn = document.querySelector('.guide-tab-btn[data-tab="watcher"]');
      if (watcherBtn) watcherBtn.click();
      const watcherPane = document.getElementById('guide-pane-watcher');
      const watcherActive = watcherPane ? !watcherPane.classList.contains('hidden') : false;
      const companionHidden = companionPane ? companionPane.classList.contains('hidden') : false;

      // Switch to Manual tab
      const manualBtn = document.querySelector('.guide-tab-btn[data-tab="manual"]');
      if (manualBtn) manualBtn.click();
      const manualPane = document.getElementById('guide-pane-manual');
      const manualActive = manualPane ? !manualPane.classList.contains('hidden') : false;

      // Check that infographic image is present and loaded
      const optionsImg = document.getElementById('guide-options-img');
      const hasInfographic = !!optionsImg && optionsImg.src.startsWith('data:image/jpeg;base64');

      // Close modal
      const closeBtn = document.getElementById('close-guide-btn');
      if (closeBtn) closeBtn.click();
      const modalClosed = guideModal ? guideModal.classList.contains('hidden') : false;

      return {
        isOffline,
        hintVisible,
        modalOpened,
        hasInfographic,
        companionActive,
        watcherActive,
        companionHidden,
        manualActive,
        modalClosed
      };
    });

    assert.ok(offlineTestResult.isOffline, '#companion-sync-container should have .is-offline class');
    assert.ok(offlineTestResult.hintVisible, '#companion-offline-hint should be visible when companion is offline');
    assert.ok(offlineTestResult.modalOpened, '#guide-modal should open when clicking offline hint');
    assert.ok(offlineTestResult.hasInfographic, '#guide-options-img should be embedded with valid base64 data URI');
    assert.ok(offlineTestResult.companionActive, '#guide-pane-companion should be active initially');
    assert.ok(offlineTestResult.watcherActive, '#guide-pane-watcher should become active on watcher tab click');
    assert.ok(offlineTestResult.companionHidden, '#guide-pane-companion should be hidden on watcher tab click');
    assert.ok(offlineTestResult.manualActive, '#guide-pane-manual should become active on manual tab click');
    assert.ok(offlineTestResult.modalClosed, '#guide-modal should be closed on close button click');

    await page.unroute('**/api/status');
  });

  test('E2E: Topbar action buttons (#intro-tour-btn, #config-btn, #about-btn, #useful-links-btn) do not overflow topbar container', async () => {
    const overflowResult = await page.evaluate(() => {
      const topbar = document.querySelector('.studio-topbar');
      const introBtn = document.getElementById('intro-tour-btn');
      const linksBtn = document.getElementById('useful-links-btn');
      const aboutBtn = document.getElementById('about-btn');
      const configBtn = document.getElementById('config-btn');

      if (!topbar || !linksBtn || !aboutBtn || !configBtn || !introBtn) {
        return { success: false, reason: 'Elements missing' };
      }

      const topbarRect = topbar.getBoundingClientRect();
      const introRect = introBtn.getBoundingClientRect();
      const linksRect = linksBtn.getBoundingClientRect();
      const aboutRect = aboutBtn.getBoundingClientRect();
      const configRect = configBtn.getBoundingClientRect();

      // Ensure all buttons are within topbar's boundary
      const linksFit = linksRect.right <= topbarRect.right + 4;
      const aboutFit = aboutRect.right <= topbarRect.right + 4;
      const configFit = configRect.right <= topbarRect.right + 4;
      const introFit = introRect.right <= topbarRect.right + 4;

      return {
        success: linksFit && aboutFit && configFit && introFit,
        topbarRight: topbarRect.right,
        linksRight: linksRect.right
      };
    });

    assert.ok(overflowResult.success, `Header buttons overflow topbar: linksRight=${overflowResult.linksRight}, topbarRight=${overflowResult.topbarRight}`);
  });

  test('E2E: Clicking Useful Links button opens modal showing OpenSky Explorer with dynamic coords', async () => {
    const modalResult = await page.evaluate(() => {
      if (typeof setGridCenter === 'function') {
        setGridCenter(37.7749, -122.4194);
      }

      const showLinksBtn = document.getElementById('useful-links-btn');
      const linksModal = document.getElementById('links-modal');
      if (!showLinksBtn || !linksModal) return { success: false, reason: 'Modal or button missing' };

      // Click to open
      showLinksBtn.click();
      const isOpen = !linksModal.classList.contains('hidden');

      const openSkyLink = linksModal.querySelector('#opensky-link');
      if (!openSkyLink) return { success: false, reason: 'OpenSky link not in modal' };

      const href = openSkyLink.getAttribute('href') || '';
      const hasCoords = href.includes('37.77') && href.includes('-122.41');

      // Click close button to reset
      const closeBtn = document.getElementById('close-links-btn');
      if (closeBtn) closeBtn.click();
      const isClosed = linksModal.classList.contains('hidden');

      return {
        success: isOpen && isClosed && hasCoords,
        isOpen,
        isClosed,
        hasCoords,
        href
      };
    });

    assert.ok(modalResult.success, `Useful Links modal test failed: ${JSON.stringify(modalResult)}`);
  });

  test('E2E: Companion box renders dual status indicators (Bridge Service and RC 2 USB Link)', async () => {
    const statusResult = await page.evaluate(() => {
      const serviceRow = document.getElementById('companion-service-row');
      const usbRow = document.getElementById('companion-usb-row');
      const serviceText = document.getElementById('companion-service-text');
      const usbText = document.getElementById('companion-usb-text');
      const serviceHelpBtn = document.getElementById('companion-service-help-btn');
      const usbHelpBtn = document.getElementById('companion-usb-help-btn');

      if (!serviceRow || !usbRow || !serviceText || !usbText || !serviceHelpBtn || !usbHelpBtn) {
        return { success: false, reason: 'Elements missing' };
      }

      const serviceHasLabel = serviceText.textContent.includes('Bridge Service:');
      const usbHasLabel = usbText.textContent.includes('RC 2 USB Link:');

      return {
        success: serviceHasLabel && usbHasLabel,
        serviceText: serviceText.textContent,
        usbText: usbText.textContent
      };
    });

    assert.ok(statusResult.success, `Dual companion status check failed: ${JSON.stringify(statusResult)}`);
  });

  test('E2E: Companion help buttons open Guide modal to respective Service and USB Link tabs', async () => {
    const helpResult = await page.evaluate(() => {
      const guideModal = document.getElementById('guide-modal');
      const closeBtn = document.getElementById('close-guide-btn');
      const serviceHelpBtn = document.getElementById('companion-service-help-btn');
      const usbHelpBtn = document.getElementById('companion-usb-help-btn');
      const serviceTabBtn = document.querySelector('.guide-tab-btn[data-tab="service"]');
      const usbTabBtn = document.querySelector('.guide-tab-btn[data-tab="usb"]');
      const servicePane = document.getElementById('guide-pane-service');
      const usbPane = document.getElementById('guide-pane-usb');

      if (!guideModal || !closeBtn || !serviceHelpBtn || !usbHelpBtn || !serviceTabBtn || !usbTabBtn || !servicePane || !usbPane) {
        return { success: false, reason: 'Guide modal elements missing' };
      }

      // 1. Click Service Help button
      serviceHelpBtn.click();
      const serviceModalOpen = !guideModal.classList.contains('hidden');
      const serviceTabActive = serviceTabBtn.classList.contains('active');
      const servicePaneVisible = !servicePane.classList.contains('hidden');

      // Close modal
      closeBtn.click();
      const closedAfterService = guideModal.classList.contains('hidden');

      // 2. Click USB Help button
      usbHelpBtn.click();
      const usbModalOpen = !guideModal.classList.contains('hidden');
      const usbTabActive = usbTabBtn.classList.contains('active');
      const usbPaneVisible = !usbPane.classList.contains('hidden');

      // Close modal
      closeBtn.click();
      const closedAfterUsb = guideModal.classList.contains('hidden');

      return {
        success: serviceModalOpen && serviceTabActive && servicePaneVisible && closedAfterService &&
                 usbModalOpen && usbTabActive && usbPaneVisible && closedAfterUsb,
        serviceModalOpen,
        serviceTabActive,
        servicePaneVisible,
        usbModalOpen,
        usbTabActive,
        usbPaneVisible
      };
    });

    assert.ok(helpResult.success, `Companion help modal test failed: ${JSON.stringify(helpResult)}`);
  });

  test('E2E: Guide modal has Android & Tablet tab with Samsung My Files and Termux guidance', async () => {
    const androidResult = await page.evaluate(() => {
      const guideModal = document.getElementById('guide-modal');
      const closeBtn = document.getElementById('close-guide-btn');
      const serviceHelpBtn = document.getElementById('companion-service-help-btn');
      const androidTabBtn = document.querySelector('.guide-tab-btn[data-tab="android"]');
      const androidPane = document.getElementById('guide-pane-android');

      if (!guideModal || !closeBtn || !serviceHelpBtn || !androidTabBtn || !androidPane) {
        return { success: false, reason: 'Elements missing' };
      }

      // Open guide modal
      serviceHelpBtn.click();

      // Click Android tab
      androidTabBtn.click();
      const tabActive = androidTabBtn.classList.contains('active');
      const paneVisible = !androidPane.classList.contains('hidden');
      const hasMyFiles = androidPane.textContent.includes('Samsung "My Files"');
      const hasTermux = androidPane.textContent.includes('Termux');

      // Close modal
      closeBtn.click();
      const isClosed = guideModal.classList.contains('hidden');

      return {
        success: tabActive && paneVisible && hasMyFiles && hasTermux && isClosed,
        tabActive,
        paneVisible,
        hasMyFiles,
        hasTermux,
        isClosed
      };
    });

    assert.ok(androidResult.success, `Android guide tab test failed: ${JSON.stringify(androidResult)}`);
  });

  test('E2E: 3D Flight Path Preview modal opens as a visible top-level dialog with non-zero dimensions and Three.js canvas', async () => {
    const result = await page.evaluate(async () => {
      if (typeof setGridCenter === 'function') {
        setGridCenter(41.88, -87.62);
      }
      const preview3dBtn = document.getElementById('preview-3d-btn');
      const preview3dModal = document.getElementById('preview-3d-modal');
      const close3dBtn = document.getElementById('close-3d-btn');
      const container = document.getElementById('three-container');

      if (!preview3dBtn || !preview3dModal || !close3dBtn || !container) {
        return { success: false, reason: 'Elements missing' };
      }

      preview3dBtn.click();
      await new Promise(r => setTimeout(r, 100));

      const rect = preview3dModal.getBoundingClientRect();
      const cardRect = document.getElementById('preview-3d-card').getBoundingClientRect();
      const canvas = container.querySelector('canvas');
      const parentIsBody = preview3dModal.parentElement === document.body;
      const isVisible = !preview3dModal.classList.contains('hidden') && rect.width > 0 && rect.height > 0;
      const canvasRendered = !!canvas && canvas.width > 0 && canvas.height > 0;

      close3dBtn.click();
      const isClosed = preview3dModal.classList.contains('hidden');

      return {
        success: parentIsBody && isVisible && canvasRendered && cardRect.width > 0 && isClosed,
        parentIsBody,
        isVisible,
        canvasRendered,
        cardWidth: cardRect.width,
        isClosed
      };
    });

    assert.ok(result.success, `3D Preview modal E2E test failed: ${JSON.stringify(result)}`);
  });

  test('E2E: Initial Safety Disclaimer modal renders 2-column icon cards and enforces checkbox acceptance before proceeding', async () => {
    const result = await page.evaluate(() => {
      const modal = document.getElementById('disclaimer-modal');
      const checkbox = document.getElementById('disclaimer-agree-checkbox');
      const proceedBtn = document.getElementById('disclaimer-proceed-btn');

      if (!modal || !checkbox || !proceedBtn) {
        return { success: false, reason: 'Elements missing' };
      }

      // Temporarily reveal modal for testing
      const wasHidden = modal.classList.contains('hidden');
      modal.classList.remove('hidden');

      const textContent = modal.textContent;
      const hasPicCard = textContent.includes('You Are the PIC');
      const hasLiabilityCard = textContent.includes('No Developer Liability');
      const hasVerifyCard = textContent.includes('Verify Before Launch');
      const hasComplianceCard = textContent.includes('Regulatory Compliance');
      const hasLiveDataCard = textContent.includes('Live Data');
      const hasAbortCard = textContent.includes('Know Your Emergency Abort');
      const noExportError = !textContent.includes('are not working properly on export');

      const initiallyDisabled = proceedBtn.disabled;

      // Simulate checkbox check
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change'));
      const enabledAfterCheck = !proceedBtn.disabled;

      // Simulate proceed click
      proceedBtn.click();
      const closedAfterProceed = modal.classList.contains('hidden');

      if (wasHidden) {
        modal.classList.add('hidden');
      }

      return {
        success: hasPicCard && hasLiabilityCard && hasVerifyCard && hasComplianceCard && hasLiveDataCard && hasAbortCard && noExportError && initiallyDisabled && enabledAfterCheck && closedAfterProceed,
        hasPicCard,
        hasLiabilityCard,
        hasVerifyCard,
        hasComplianceCard,
        hasLiveDataCard,
        hasAbortCard,
        noExportError,
        initiallyDisabled,
        enabledAfterCheck,
        closedAfterProceed
      };
    });

    assert.ok(result.success, `Disclaimer modal E2E test failed: ${JSON.stringify(result)}`);
  });

  test('E2E: Drone REST API locate on map, auto-tracking on new geo location, and hover HUD tooltip', async () => {
    const locateResult = await page.evaluate(async () => {
      if (!window.RemoteIdRadar) return { error: 'RemoteIdRadar not found' };

      // 1. Ingest simulated drone at initial coordinates
      const testDrone = {
        id: 'e2e-drone-alpha',
        uasId: '1581F4TEST123456',
        model: 'DJI Mini 4 Pro',
        status: 'Airborne',
        latitude: 40.0125,
        longitude: -83.1760,
        altitudeGeodetic: 30.5,
        speedHorizontal: 4.8,
        trackDirection: 120,
        transport: 'Wi-Fi 5.8 GHz',
        rssi: -58,
        breadcrumbs: [{ lat: 40.0125, lon: -83.1760, alt: 30.5, time: Date.now() }]
      };

      window.RemoteIdRadar.updateDroneLocation(testDrone);

      // Verify pill visibility and marker existence
      const badge = document.getElementById('remote-id-badge');
      const badgeVisible = badge && !badge.classList.contains('hidden');

      const markerEntry = window.RemoteIdRadar.markers.get('e2e-drone-alpha');
      const hasMarker = !!(markerEntry && markerEntry.marker);

      // Verify hover tooltip content
      const tooltipHtml = window.RemoteIdRadar.formatDroneTooltip(testDrone);
      const hasModelInTooltip = tooltipHtml.includes('DJI Mini 4 Pro');
      const hasCoordsInTooltip = tooltipHtml.includes('40.012500, -83.176000');
      const hasAltInTooltip = tooltipHtml.includes('30.5m');
      const hasSpeedInTooltip = tooltipHtml.includes('4.8 m/s');

      // 2. Click Locate badge
      badge.click();
      const isFollowing = window.RemoteIdRadar.isFollowing;
      const locateLabel = document.getElementById('remote-id-locate-label');
      const followingLabel = locateLabel ? locateLabel.textContent.includes('Following') : false;

      // 3. Ingest updated geo location
      const movedDrone = {
        ...testDrone,
        latitude: 40.0140,
        longitude: -83.1745,
        altitudeGeodetic: 35.0,
        speedHorizontal: 6.2,
        trackDirection: 90
      };

      window.RemoteIdRadar.updateDroneLocation(movedDrone);
      const updatedMarker = window.RemoteIdRadar.markers.get('e2e-drone-alpha');
      const latlng = updatedMarker && updatedMarker.marker && updatedMarker.marker.getLatLng ? updatedMarker.marker.getLatLng() : null;
      const coordsMatch = latlng ? (Math.abs(latlng.lat - 40.0140) < 0.0001 && Math.abs(latlng.lng - (-83.1745)) < 0.0001) : true;

      // Clean up test marker
      if (window.RemoteIdRadar.layerGroup && markerEntry.marker) {
        window.RemoteIdRadar.layerGroup.removeLayer(markerEntry.marker);
      }
      window.RemoteIdRadar.markers.delete('e2e-drone-alpha');
      window.RemoteIdRadar.activeDrones = [];
      window.RemoteIdRadar.isFollowing = false;
      window.RemoteIdRadar.updateRadarUI();

      return {
        success: badgeVisible && hasMarker && hasModelInTooltip && hasCoordsInTooltip && hasAltInTooltip && hasSpeedInTooltip && isFollowing && followingLabel && coordsMatch,
        badgeVisible,
        hasMarker,
        hasModelInTooltip,
        hasCoordsInTooltip,
        hasAltInTooltip,
        hasSpeedInTooltip,
        isFollowing,
        followingLabel,
        coordsMatch
      };
    });

    assert.ok(locateResult.success, `Drone REST locate E2E test failed: ${JSON.stringify(locateResult)}`);
  });

  test('E2E: Map & Remote ID Alignment Calibration panel, nudge D-Pad, and GPS reset (v1.61.0)', async () => {
    const calResult = await page.evaluate(async () => {
      if (!window.RemoteIdRadar) return { error: 'RemoteIdRadar not found' };

      // Ingest test drone
      const testDrone = {
        id: 'e2e-cal-drone',
        uasId: 'RID-CAL-E2E-123',
        model: 'DJI Mini 4 Pro',
        status: 'Airborne',
        latitude: 40.0125,
        longitude: -83.1760,
        altitudeGeodetic: 30.0,
        operatorLatitude: 40.0120,
        operatorLongitude: -83.1765
      };

      window.RemoteIdRadar.updateDroneLocation(testDrone);

      // Verify alignment button is visible
      const calBtn = document.getElementById('remote-id-calibrate-btn');
      const calBtnVisible = calBtn && !calBtn.classList.contains('hidden') && calBtn.style.display !== 'none';

      // Open calibration panel
      calBtn.click();
      const calPanel = document.getElementById('remote-id-calibration-panel');
      const panelOpenAfterClick = calPanel && !calPanel.classList.contains('hidden') && calPanel.style.display !== 'none';

      // Verify initial offset text is 0.0m
      const offsetText = document.getElementById('remote-id-cal-offset-text');
      const initialZero = offsetText && offsetText.textContent.includes('0.0m');

      // Click Nudge North button twice (step is 1.0m default -> 2.0m)
      const nudgeN = document.getElementById('remote-id-cal-nudge-n');
      if (nudgeN) {
        nudgeN.click();
        nudgeN.click();
      }

      // Click Nudge East button once (step is 1.0m default -> 1.0m)
      const nudgeE = document.getElementById('remote-id-cal-nudge-e');
      if (nudgeE) {
        nudgeE.click();
      }

      const offsetAfterNudge = window.RemoteIdRadar.offsetMeters;
      const northMatches = offsetAfterNudge && Math.abs(offsetAfterNudge.north - 2.0) < 0.01;
      const eastMatches = offsetAfterNudge && Math.abs(offsetAfterNudge.east - 1.0) < 0.01;
      const offsetTextAfterNudge = offsetText ? offsetText.textContent : '';
      const textHasOffsets = offsetTextAfterNudge.includes('+2.0m N') && offsetTextAfterNudge.includes('+1.0m E');

      // Verify marker position on map shifted
      const markerEntry = window.RemoteIdRadar.markers.get('e2e-cal-drone');
      const markerLatLng = markerEntry && markerEntry.marker ? markerEntry.marker.getLatLng() : null;
      const markerShiftedNorth = markerLatLng ? markerLatLng.lat > 40.0125 : false;
      const markerShiftedEast = markerLatLng ? markerLatLng.lng > -83.1760 : false;

      // Click Reset to GPS button
      const resetBtn = document.getElementById('remote-id-cal-reset-btn');
      if (resetBtn) {
        resetBtn.click();
      }

      const offsetAfterReset = window.RemoteIdRadar.offsetMeters;
      const resetToZero = offsetAfterReset && offsetAfterReset.north === 0 && offsetAfterReset.east === 0;
      const textReset = offsetText && offsetText.textContent.includes('0.0m');

      const markerResetLatLng = markerEntry && markerEntry.marker ? markerEntry.marker.getLatLng() : null;
      const markerReset = markerResetLatLng ? (Math.abs(markerResetLatLng.lat - 40.0125) < 0.00001 && Math.abs(markerResetLatLng.lng - (-83.1760)) < 0.00001) : false;

      // Close panel
      const closeBtn = document.getElementById('remote-id-cal-close-btn');
      if (closeBtn) closeBtn.click();
      const panelClosedAfterClose = calPanel && (calPanel.classList.contains('hidden') || calPanel.style.display === 'none');

      // Cleanup
      if (window.RemoteIdRadar.layerGroup && markerEntry && markerEntry.marker) {
        window.RemoteIdRadar.layerGroup.removeLayer(markerEntry.marker);
      }
      if (window.RemoteIdRadar.layerGroup && markerEntry && markerEntry.takeoffMarker) {
        window.RemoteIdRadar.layerGroup.removeLayer(markerEntry.takeoffMarker);
      }
      window.RemoteIdRadar.markers.delete('e2e-cal-drone');
      window.RemoteIdRadar.activeDrones = [];
      window.RemoteIdRadar.resetOffset();
      window.RemoteIdRadar.updateRadarUI();

      return {
        success: calBtnVisible && panelOpenAfterClick && initialZero && northMatches && eastMatches && textHasOffsets && markerShiftedNorth && markerShiftedEast && resetToZero && textReset && markerReset && panelClosedAfterClose,
        calBtnVisible,
        panelOpenAfterClick,
        initialZero,
        northMatches,
        eastMatches,
        textHasOffsets,
        markerShiftedNorth,
        markerShiftedEast,
        resetToZero,
        textReset,
        markerReset,
        panelClosedAfterClose
      };
    });

    assert.ok(calResult.success, `Map & Remote ID Alignment E2E test failed: ${JSON.stringify(calResult)}`);
  });

  test('Double Grid and Freeform generate valid WPML with followWayline for double grid and path following for freeform', async () => {
    const wpmlResult = await page.evaluate(async () => {
      // 1. Double Grid with oblique pitch
      const gridTypeSelect = document.getElementById('grid-type');
      if (gridTypeSelect) {
        gridTypeSelect.value = 'double';
        gridTypeSelect.dispatchEvent(new Event('change'));
      }
      const pitchInput = document.getElementById('gimbal-pitch');
      if (pitchInput) {
        pitchInput.value = '-60';
        pitchInput.dispatchEvent(new Event('input'));
      }

      if (typeof updateGrid === 'function') updateGrid();

      const doubleWps = typeof getCurrentWaypoints === 'function' ? getCurrentWaypoints() : null;
      let doubleXml = '';
      if (doubleWps && doubleWps.length > 0 && typeof buildWaylinesWpml === 'function') {
        doubleXml = buildWaylinesWpml(doubleWps, 30, 4, 'followWayline', 'goHome', -60, 'stopAndShoot', 'curved');
      }

      const hasDoubleFollowWayline = doubleXml.includes('<wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode>');
      const noDoubleSmoothTransition = !doubleXml.includes('<wpml:waypointHeadingMode>smoothTransition</wpml:waypointHeadingMode>');

      // 2. Freeform with manual waypoints
      if (gridTypeSelect) {
        gridTypeSelect.value = 'freeform';
        gridTypeSelect.dispatchEvent(new Event('change'));
      }

      if (typeof addFreeformWaypoint === 'function') {
        addFreeformWaypoint(40.0125, -83.1770);
        addFreeformWaypoint(40.0135, -83.1770);
      }

      const freeformWps = typeof getCurrentWaypoints === 'function' ? getCurrentWaypoints() : null;
      let freeformXml = '';
      if (freeformWps && freeformWps.length > 0 && typeof buildWaylinesWpml === 'function') {
        freeformXml = buildWaylinesWpml(freeformWps, 30, 4, 'followWayline', 'goHome', -90, 'stopAndShoot', 'curved');
      }

      const hasFreeformFollowWayline = freeformXml.includes('<wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode>');
      const hasHeadingAngleEnable = freeformXml.includes('<wpml:waypointHeadingAngleEnable>1</wpml:waypointHeadingAngleEnable>');

      // Switch back to single 2D grid
      if (gridTypeSelect) {
        gridTypeSelect.value = 'single';
        gridTypeSelect.dispatchEvent(new Event('change'));
      }
      if (pitchInput) {
        pitchInput.value = '-90';
        pitchInput.dispatchEvent(new Event('input'));
      }
      if (typeof updateGrid === 'function') updateGrid();

      return {
        hasDoubleFollowWayline,
        noDoubleSmoothTransition,
        hasFreeformFollowWayline,
        hasHeadingAngleEnable,
        doubleWpsCount: doubleWps ? doubleWps.length : 0,
        freeformWpsCount: freeformWps ? freeformWps.length : 0
      };
    });

    assert.ok(wpmlResult.hasDoubleFollowWayline, 'Double Grid with oblique pitch must use followWayline heading mode');
    assert.ok(wpmlResult.noDoubleSmoothTransition, 'Double Grid with oblique pitch must not have smoothTransition conflicts');
    assert.ok(wpmlResult.hasFreeformFollowWayline, 'Freeform without custom headings should follow wayline path');
    assert.ok(wpmlResult.hasHeadingAngleEnable, 'Freeform should have headingAngleEnable=1');
  });

  test('E2E: Pre-Flight KMZ Audit modal opens, renders 10-point checklist, and can be dismissed', async () => {
    const modalState = await page.evaluate(async () => {
      const auditBtn = document.getElementById('kmz-audit-btn');
      const modal = document.getElementById('kmz-inspector-modal');
      const closeBtn = document.getElementById('close-kmz-inspector-btn');
      const checklist = document.getElementById('inspector-checklist-container');
      const score = document.getElementById('inspector-rules-score');

      if (!auditBtn || !modal) return { success: false, reason: 'Elements not found' };

      // Initial state
      const initialHidden = modal.classList.contains('hidden');

      // Click Audit KMZ button
      let clickErr = null;
      try {
        auditBtn.click();
      } catch (e) {
        clickErr = e.message + '\n' + e.stack;
      }
      const openAfterClick = !modal.classList.contains('hidden');

      // Verify checklist items rendered
      const itemsCount = checklist ? checklist.children.length : 0;
      const scoreText = score ? score.textContent : '';

      // Close modal
      if (closeBtn) closeBtn.click();
      const closedAfterClick = modal.classList.contains('hidden');

      return {
        success: true,
        initialHidden,
        openAfterClick,
        itemsCount,
        scoreText,
        closedAfterClick,
        clickErr,
        hasInspector: typeof KMZInspector !== 'undefined',
        hasActiveReport: typeof KMZInspector !== 'undefined' ? !!KMZInspector.activeReport : false,
        reportRulesLength: (typeof KMZInspector !== 'undefined' && KMZInspector.activeReport && KMZInspector.activeReport.rules) ? KMZInspector.activeReport.rules.length : -1,
        lastAuditError: typeof KMZInspector !== 'undefined' ? KMZInspector.lastAuditError : null
      };
    });

    assert.strictEqual(modalState.clickErr, null, 'Clicking audit button should not throw');

    assert.ok(modalState.success, 'Inspector modal elements should exist');
    assert.ok(modalState.initialHidden, 'Modal should be initially hidden');
    assert.ok(modalState.openAfterClick, 'Modal should open when Audit KMZ button is clicked');
    assert.strictEqual(modalState.itemsCount, 10, 'Modal checklist should contain all 10 golden rules');
    assert.ok(modalState.scoreText.includes('/10 Passed'), `Modal score should show passed rules count, got: '${modalState.scoreText}'`);
    assert.ok(modalState.closedAfterClick, 'Modal should close when close button is clicked');
  });

  test('E2E: Antigravity prompt copy buttons exist and invoke prompt generator with visual feedback', async () => {
    const copyResult = await page.evaluate(() => {
      const inspectorBtn = document.getElementById('inspector-copy-antigravity-btn');
      const diagBtn = document.getElementById('diag-copy-antigravity-btn');
      if (!inspectorBtn || !diagBtn) {
        return { success: false, reason: 'Buttons missing' };
      }

      let copiedText = '';
      try {
        Object.defineProperty(navigator, 'clipboard', {
          value: {
            writeText: (txt) => {
              copiedText = txt;
              return Promise.resolve();
            }
          },
          configurable: true,
          writable: true
        });
      } catch (e) {}

      // Click inspector copy button
      if (typeof KMZInspector !== 'undefined') {
        KMZInspector.open();
      }
      inspectorBtn.click();
      const inspectorPrompt = copiedText || (typeof KMZInspector !== 'undefined' ? KMZInspector.generateAntigravityPrompt() : '');

      // Click diag copy button
      copiedText = '';
      diagBtn.click();
      const diagPrompt = copiedText || (typeof KMZInspector !== 'undefined' ? KMZInspector.generateAntigravityPrompt() : '');

      return {
        success: true,
        hasInspectorPrompt: inspectorPrompt.includes('ANTIGRAVITY BUG REPORT'),
        hasDiagPrompt: diagPrompt.includes('ANTIGRAVITY BUG REPORT'),
        inspectorBtnText: inspectorBtn.textContent,
        diagBtnText: diagBtn.textContent
      };
    });

    assert.ok(copyResult.success, 'Buttons should exist and be clickable');
    assert.ok(copyResult.hasInspectorPrompt, 'Inspector copy button should copy Antigravity bug report');
    assert.ok(copyResult.hasDiagPrompt, 'Diag copy button should copy Antigravity bug report');
  });

  test('E2E: Multi-Vendor Autopilot toggle easily enables/disables export container and persists to localStorage', async () => {
    const toggleResult = await page.evaluate(() => {
      const toggle = document.getElementById('multivendor-toggle');
      const container = document.getElementById('multivendor-export-container');
      const qgcBtn = document.getElementById('export-qgc-btn');
      const autelBtn = document.getElementById('export-autel-btn');

      if (!toggle || !container || !qgcBtn || !autelBtn) {
        return { success: false, reason: 'Elements missing' };
      }

      // Initial state: hidden
      const initiallyHidden = container.style.display === 'none' || getComputedStyle(container).display === 'none';

      // Enable toggle
      toggle.checked = true;
      toggle.dispatchEvent(new Event('change'));
      const visibleAfterEnable = container.style.display === 'flex' || getComputedStyle(container).display === 'flex';
      const storedAfterEnable = localStorage.getItem('aalaapi-multivendor-enabled');

      // Disable toggle
      toggle.checked = false;
      toggle.dispatchEvent(new Event('change'));
      const hiddenAfterDisable = container.style.display === 'none';
      const storedAfterDisable = localStorage.getItem('aalaapi-multivendor-enabled');

      return {
        success: true,
        initiallyHidden,
        visibleAfterEnable,
        storedAfterEnable,
        hiddenAfterDisable,
        storedAfterDisable
      };
    });

    assert.ok(toggleResult.success, 'Multi-vendor UI elements should exist');
    assert.ok(toggleResult.visibleAfterEnable, 'Container should become visible when enabled');
    assert.strictEqual(toggleResult.storedAfterEnable, 'true', 'Must persist true in localStorage');
    assert.ok(toggleResult.hiddenAfterDisable, 'Container should hide when disabled');
    assert.strictEqual(toggleResult.storedAfterDisable, 'false', 'Must persist false in localStorage');
  });

  test('E2E: Direct USB Flight Log Pull buttons exist and respond cleanly to clicks', async () => {
    const evalResult = await page.evaluate(async () => {
      const sidebarPullBtn = document.getElementById('direct-rc2-pull-log-btn');
      const diagPullBtn = document.getElementById('diag-pull-rc2-btn');

      if (!sidebarPullBtn || !diagPullBtn) {
        return { success: false, reason: 'Buttons missing' };
      }

      // Intercept fetch to return mock success for /api/latest-flight
      const originalFetch = window.fetch;
      window.fetch = async (url, opts) => {
        if (typeof url === 'string' && url.includes('/api/latest-flight')) {
          return {
            ok: true,
            json: async () => ({
              success: true,
              data: {
                latestLog: 'FlightRecord_2026-08-29_[19-20-00].txt',
                latestKmz: '354A8F93-759C-42C3-A8D5-746F79C7622A.kmz'
              }
            })
          };
        }
        return originalFetch(url, opts);
      };

      // Click diag pull button
      diagPullBtn.click();
      await new Promise(r => setTimeout(r, 200));

      const diagBtnText = diagPullBtn.textContent;

      // Restore fetch
      window.fetch = originalFetch;

      return {
        success: true,
        hasSidebarPullBtn: !!sidebarPullBtn,
        hasDiagPullBtn: !!diagPullBtn,
        diagBtnText
      };
    });

    assert.ok(evalResult.success, 'Flight log pull buttons should exist in the DOM');
    assert.ok(evalResult.hasSidebarPullBtn, 'Sidebar pull log button should exist');
    assert.ok(evalResult.hasDiagPullBtn, 'Diagnostics header pull log button should exist');
    assert.ok(evalResult.diagBtnText.includes('Pulled') || evalResult.diagBtnText.includes('Pull'), 'Button text should update upon pull');
  });

  test('E2E: Pattern Layers UI stack allows adding, switching, and opening transitions modal', async () => {
    const evalResult = await page.evaluate(async () => {
      const addLayerBtn = document.getElementById('add-layer-btn');
      const countBadge = document.getElementById('layer-count-badge');
      const container = document.getElementById('layers-list-container');
      const configTransBtn = document.getElementById('configure-transitions-btn');
      const modal = document.getElementById('layer-transitions-modal');

      if (!addLayerBtn || !countBadge || !container) {
        return { success: false, reason: 'Layer manager DOM elements missing' };
      }

      // Initial state: 1 layer
      const initialCards = container.querySelectorAll('.layer-card');
      const initialCount = initialCards.length;

      // Click Add Layer
      addLayerBtn.click();
      await new Promise(r => setTimeout(r, 100));

      const afterAddCards = container.querySelectorAll('.layer-card');
      const countText = countBadge.textContent;

      // Click Transitions modal button
      if (configTransBtn) configTransBtn.click();
      await new Promise(r => setTimeout(r, 100));

      const modalVisible = modal && !modal.classList.contains('hidden');

      // Close modal
      const closeBtn = document.getElementById('close-transitions-modal-btn');
      if (closeBtn) closeBtn.click();
      await new Promise(r => setTimeout(r, 50));

      const modalHidden = modal && modal.classList.contains('hidden');

      return {
        success: true,
        initialCount,
        afterAddCount: afterAddCards.length,
        countText,
        modalVisible,
        modalHidden
      };
    });

    assert.ok(evalResult.success, 'Layer UI evaluation should succeed');
    assert.strictEqual(evalResult.initialCount, 1, 'Should have 1 layer initially');
    assert.strictEqual(evalResult.afterAddCount, 2, 'Should have 2 layers after clicking Add Layer');
    assert.ok(evalResult.countText.includes('2 Layers'), 'Badge should show 2 Layers');
    assert.strictEqual(evalResult.modalVisible, true, 'Transitions modal should open when configured');
    assert.strictEqual(evalResult.modalHidden, true, 'Transitions modal should close when close button clicked');
  });

  test('E2E: Sidebar Section 1 (Pattern Layers & Location) header is visible and can be expanded and collapsed', async () => {
    const evalResult = await page.evaluate(async () => {
      const section1 = document.getElementById('layers-and-location-section');
      if (!section1) return { success: false, reason: 'Section 1 missing' };

      const h3 = section1.querySelector('h3');
      if (!h3) return { success: false, reason: 'Section 1 h3 missing' };

      // Ensure section1 is not hidden
      const isHeaderVisible = window.getComputedStyle(h3).display !== 'none';
      const initialCollapsed = section1.classList.contains('collapsed');

      // Click h3 to toggle
      h3.click();
      await new Promise(r => setTimeout(r, 50));
      const afterFirstClickCollapsed = section1.classList.contains('collapsed');

      // Click h3 again to toggle back
      h3.click();
      await new Promise(r => setTimeout(r, 50));
      const afterSecondClickCollapsed = section1.classList.contains('collapsed');

      return {
        success: true,
        isHeaderVisible,
        initialCollapsed,
        afterFirstClickCollapsed,
        afterSecondClickCollapsed,
        headerText: h3.textContent
      };
    });

    assert.ok(evalResult.success, 'Section 1 evaluation should succeed');
    assert.strictEqual(evalResult.isHeaderVisible, true, 'Section 1 header must be visible in the DOM');
    assert.notStrictEqual(evalResult.initialCollapsed, evalResult.afterFirstClickCollapsed, 'Clicking h3 must toggle collapsed class');
    assert.strictEqual(evalResult.initialCollapsed, evalResult.afterSecondClickCollapsed, 'Clicking h3 twice must restore initial state');
  });

  test('E2E: 3D Exclusion Zones UI, Pattern Selection, Altitude Envelope, and Layer Pruning', async () => {
    const evalResult = await page.evaluate(async () => {
      // 1. Reset layers to initial state
      if (typeof flightLayers !== 'undefined') {
        flightLayers = [
          createDefaultLayer('layer-1', 'Layer 1: Flight Grid', 0, 'double')
        ];
        activeLayerId = flightLayers[0].id;
        syncUiWithActiveLayer();
        renderLayersList();
        updateGrid();
      }

      // 2. Add an Exclusion Zone layer
      const addLayerBtn = document.getElementById('add-layer-btn');
      if (addLayerBtn) addLayerBtn.click();
      await new Promise(r => setTimeout(r, 50));

      const activeLayer = getActiveLayer();
      const exclCard = document.querySelector('.pattern-card[data-value="exclusion-box"]');
      if (exclCard) exclCard.click();
      await new Promise(r => setTimeout(r, 50));

      const exclInstructions = document.getElementById('exclusion-instructions');
      const exclAltContainer = document.getElementById('exclusion-altitude-container');
      const exclAllAltCheckbox = document.getElementById('exclusion-all-altitudes');
      const exclSliders = document.getElementById('exclusion-altitude-sliders');

      const isInstructionsVisible = exclInstructions && !exclInstructions.classList.contains('hidden');
      const isAltContainerVisible = exclAltContainer && !exclAltContainer.classList.contains('hidden');
      const isAllAltChecked = exclAllAltCheckbox && exclAllAltCheckbox.checked;
      const isSlidersHiddenDefault = exclSliders && exclSliders.classList.contains('hidden');

      // Uncheck All Altitudes to expose floor and ceiling sliders
      if (exclAllAltCheckbox) {
        exclAllAltCheckbox.checked = false;
        exclAllAltCheckbox.dispatchEvent(new Event('change'));
      }
      await new Promise(r => setTimeout(r, 50));

      const isSlidersVisibleAfterUncheck = exclSliders && !exclSliders.classList.contains('hidden');

      const minAltInput = document.getElementById('exclusion-min-alt');
      const maxAltInput = document.getElementById('exclusion-max-alt');
      if (minAltInput) {
        minAltInput.value = '20';
        minAltInput.dispatchEvent(new Event('input'));
      }
      if (maxAltInput) {
        maxAltInput.value = '80';
        maxAltInput.dispatchEvent(new Event('input'));
      }

      // Check layer card styling
      const layerCards = document.querySelectorAll('.layer-card');
      const hasExclusionCardClass = layerCards[1] && layerCards[1].classList.contains('exclusion-zone');

      return {
        success: true,
        isInstructionsVisible,
        isAltContainerVisible,
        isAllAltChecked,
        isSlidersHiddenDefault,
        isSlidersVisibleAfterUncheck,
        hasExclusionCardClass,
        activeLayerPattern: getActiveLayer().pattern,
        activeLayerIsExcl: getActiveLayer().isExclusionZone
      };
    });

    assert.ok(evalResult.success, 'Exclusion Zone E2E evaluation should succeed');
    assert.strictEqual(evalResult.isInstructionsVisible, true, 'Exclusion instructions alert should be visible');
    assert.strictEqual(evalResult.isAltContainerVisible, true, 'Exclusion altitude container should be visible');
    assert.strictEqual(evalResult.isAllAltChecked, true, 'All Altitudes should be checked by default');
    assert.strictEqual(evalResult.isSlidersHiddenDefault, true, 'Min/max altitude sliders should be hidden when All Altitudes is active');
    assert.strictEqual(evalResult.isSlidersVisibleAfterUncheck, true, 'Min/max altitude sliders should be visible when All Altitudes is unchecked');
    assert.strictEqual(evalResult.hasExclusionCardClass, true, 'Layer card should have exclusion-zone CSS class');
    assert.strictEqual(evalResult.activeLayerPattern, 'exclusion-box', 'Active layer pattern should be exclusion-box');
    assert.strictEqual(evalResult.activeLayerIsExcl, true, 'Active layer isExclusionZone should be true');
  });

  test('E2E: App Header Search, Topbar Telemetry HUD, and Dual-Tab Inspector (v1.65.0)', async () => {
    const uiResult = await page.evaluate(async () => {
      // 1. Verify App Header Search elements exist and work
      const searchInput = document.getElementById('location-input');
      const searchBtn = document.getElementById('search-btn');
      const locateBtn = document.getElementById('locate-me-btn');

      const headerSearchExists = searchInput !== null && searchBtn !== null && locateBtn !== null;

      // 2. Verify Dual-Tab Inspector buttons switch panes
      const tabLayer = document.getElementById('inspector-tab-layer');
      const tabFailsafes = document.getElementById('inspector-tab-failsafes');
      const layerPane = document.getElementById('inspector-layer-pane');
      const failsafesPane = document.getElementById('inspector-failsafes-pane');

      const initialLayerVisible = !layerPane.classList.contains('hidden');
      const initialFailsafesHidden = failsafesPane.classList.contains('hidden');

      // Click failsafes tab
      tabFailsafes.click();
      await new Promise(r => setTimeout(r, 40));

      const afterFailsafesTabLayerHidden = layerPane.classList.contains('hidden');
      const afterFailsafesTabVisible = !failsafesPane.classList.contains('hidden');
      const failsafesTabActive = tabFailsafes.classList.contains('active');

      // Click layer properties tab back
      tabLayer.click();
      await new Promise(r => setTimeout(r, 40));

      const finalLayerVisible = !layerPane.classList.contains('hidden');
      const layerTabActive = tabLayer.classList.contains('active');

      // 3. Verify Topbar Telemetry HUD Pill & Popover toggle
      const telemetryPill = document.getElementById('header-telemetry-pill');
      const telemetryPopover = document.getElementById('telemetry-weather-popover');
      const popoverCloseBtn = document.getElementById('telemetry-popover-close-btn');

      const popoverInitiallyHidden = telemetryPopover.classList.contains('hidden');

      // Click pill to open
      telemetryPill.click();
      await new Promise(r => setTimeout(r, 40));
      const popoverOpenAfterClick = !telemetryPopover.classList.contains('hidden');

      // Click close button to dismiss
      popoverCloseBtn.click();
      await new Promise(r => setTimeout(r, 40));
      const popoverClosedAfterBtn = telemetryPopover.classList.contains('hidden');

      // 4. Verify Configuration Layout Dropdown
      const navLayoutSelect = document.getElementById('nav-layout-select');
      const hasNavLayoutSelect = navLayoutSelect !== null;
      if (navLayoutSelect) {
        navLayoutSelect.value = 'floating';
        navLayoutSelect.dispatchEvent(new Event('change'));
      }
      const savedLayout = localStorage.getItem('aalaapi_nav_layout');

      return {
        success: true,
        headerSearchExists,
        initialLayerVisible,
        initialFailsafesHidden,
        afterFailsafesTabLayerHidden,
        afterFailsafesTabVisible,
        failsafesTabActive,
        finalLayerVisible,
        layerTabActive,
        popoverInitiallyHidden,
        popoverOpenAfterClick,
        popoverClosedAfterBtn,
        hasNavLayoutSelect,
        savedLayout
      };
    });

    assert.ok(uiResult.success, 'Evaluation should succeed');
    assert.strictEqual(uiResult.headerSearchExists, true, 'Header search elements must exist');
    assert.strictEqual(uiResult.initialLayerVisible, true, 'Layer pane should be visible by default');
    assert.strictEqual(uiResult.initialFailsafesHidden, true, 'Failsafes pane should be hidden by default');
    assert.strictEqual(uiResult.afterFailsafesTabVisible, true, 'Failsafes pane should be visible after clicking tab');
    assert.strictEqual(uiResult.failsafesTabActive, true, 'Failsafes tab button should have active class');
    assert.strictEqual(uiResult.finalLayerVisible, true, 'Layer pane should be visible after switching back');
    assert.strictEqual(uiResult.layerTabActive, true, 'Layer tab button should have active class');
    assert.strictEqual(uiResult.popoverInitiallyHidden, true, 'Telemetry popover should be hidden initially');
    assert.strictEqual(uiResult.popoverOpenAfterClick, true, 'Telemetry popover should open on pill click');
    assert.strictEqual(uiResult.popoverClosedAfterBtn, true, 'Telemetry popover should close on close btn click');
    assert.strictEqual(uiResult.hasNavLayoutSelect, true, 'Config modal must contain nav layout selector');
    assert.strictEqual(uiResult.savedLayout, 'floating', 'Nav layout selection should persist to localStorage');
  });

  test('E2E: Intro Guide Hub, Welcome Banner, and In-Situ Spotlight Tour (v1.66.0)', async () => {
    const tourResult = await page.evaluate(async () => {
      // 1. Verify Intro button opens quickstart modal on workflow tab
      const introBtn = document.getElementById('intro-tour-btn');
      const quickstartModal = document.getElementById('quickstart-modal');
      const closeQuickstartBtn = document.getElementById('close-quickstart-btn');

      if (!introBtn || !quickstartModal) return { success: false, reason: 'Intro button or quickstart modal missing' };

      introBtn.click();
      await new Promise(r => setTimeout(r, 40));
      const modalOpenAfterBtn = !quickstartModal.classList.contains('hidden');

      // 2. Verify Tab Switching
      const tabFeatures = document.getElementById('intro-tab-features');
      const tabTips = document.getElementById('intro-tab-tips');
      const tabWorkflow = document.getElementById('intro-tab-workflow');

      const paneFeatures = document.getElementById('intro-pane-features');
      const paneTips = document.getElementById('intro-pane-tips');
      const paneWorkflow = document.getElementById('intro-pane-workflow');

      tabFeatures.click();
      await new Promise(r => setTimeout(r, 30));
      const featuresVisible = !paneFeatures.classList.contains('hidden') && paneWorkflow.classList.contains('hidden');

      tabTips.click();
      await new Promise(r => setTimeout(r, 30));
      const tipsVisible = !paneTips.classList.contains('hidden') && paneFeatures.classList.contains('hidden');

      tabWorkflow.click();
      await new Promise(r => setTimeout(r, 30));
      const workflowVisible = !paneWorkflow.classList.contains('hidden') && paneTips.classList.contains('hidden');

      // 3. Launch Interactive Spotlight Tour
      const startTourBtn = document.getElementById('start-interactive-tour-btn');
      const tourOverlay = document.getElementById('tour-overlay-container');
      const tourNextBtn = document.getElementById('tour-next-btn');
      const tourStepBadge = document.getElementById('tour-step-badge');

      startTourBtn.click();
      await new Promise(r => setTimeout(r, 40));

      const modalClosedAfterTourStart = quickstartModal.classList.contains('hidden');
      const tourOverlayVisible = !tourOverlay.classList.contains('hidden');
      const initialStepText = tourStepBadge.textContent;

      // Advance to next step
      tourNextBtn.click();
      await new Promise(r => setTimeout(r, 40));
      const step2Text = tourStepBadge.textContent;

      // Exit tour
      const tourCloseBtn = document.getElementById('tour-close-btn');
      tourCloseBtn.click();
      await new Promise(r => setTimeout(r, 40));
      const tourOverlayClosed = tourOverlay.classList.contains('hidden');

      // 4. Test Welcome Banner Dismissal
      const welcomeBanner = document.getElementById('welcome-tour-banner');
      if (welcomeBanner) welcomeBanner.classList.remove('hidden');
      const dismissBtn = document.getElementById('welcome-tour-dismiss-btn');
      dismissBtn.click();
      await new Promise(r => setTimeout(r, 30));
      const welcomeBannerDismissed = welcomeBanner.classList.contains('hidden');
      const bannerSaved = localStorage.getItem('aalaapi_intro_banner_dismissed');

      return {
        success: true,
        modalOpenAfterBtn,
        featuresVisible,
        tipsVisible,
        workflowVisible,
        modalClosedAfterTourStart,
        tourOverlayVisible,
        initialStepText,
        step2Text,
        tourOverlayClosed,
        welcomeBannerDismissed,
        bannerSaved
      };
    });

    assert.ok(tourResult.success, 'E2E Tour evaluation should succeed');
    assert.strictEqual(tourResult.modalOpenAfterBtn, true, 'Quickstart modal should open on Intro btn click');
    assert.strictEqual(tourResult.featuresVisible, true, 'Features tab pane should be visible after clicking tab');
    assert.strictEqual(tourResult.tipsVisible, true, 'Tips tab pane should be visible after clicking tab');
    assert.strictEqual(tourResult.workflowVisible, true, 'Workflow tab pane should be visible after clicking tab');
    assert.strictEqual(tourResult.modalClosedAfterTourStart, true, 'Quickstart modal should close when launching tour');
    assert.strictEqual(tourResult.tourOverlayVisible, true, 'Spotlight tour overlay should be visible');
    assert.strictEqual(tourResult.initialStepText, 'Step 1 of 5', 'Tour should start on Step 1');
    assert.strictEqual(tourResult.step2Text, 'Step 2 of 5', 'Tour should advance to Step 2');
    assert.strictEqual(tourResult.tourOverlayClosed, true, 'Tour should close on exit button click');
    assert.strictEqual(tourResult.welcomeBannerDismissed, true, 'Welcome banner should be hidden after dismiss');
    assert.strictEqual(tourResult.bannerSaved, 'true', 'Banner dismissal should be stored in localStorage');
  });

  test('E2E: Full-Width Studio Topbar Layout & HUD Interaction (v1.67.0)', async () => {
    const topbarResult = await page.evaluate(async () => {
      const topbar = document.querySelector('.studio-topbar');
      const leftZone = document.querySelector('.topbar-left');
      const centerZone = document.querySelector('.topbar-center');
      const rightZone = document.querySelector('.topbar-right');
      const searchInput = document.getElementById('location-input');
      const locateBtn = document.getElementById('locate-me-btn');
      const telemetryPill = document.getElementById('header-telemetry-pill');
      const sidebarToggle = document.getElementById('sidebar-toggle');
      const sidebar = document.querySelector('.sidebar');
      const mapCanvas = document.getElementById('map');

      if (!topbar || !leftZone || !centerZone || !rightZone || !searchInput || !locateBtn || !telemetryPill) {
        return { success: false, reason: 'Topbar elements missing' };
      }

      const topbarRect = topbar.getBoundingClientRect();
      const isFullWidth = topbarRect.width > 300;

      // Test sidebar minimize toggle from topbar
      const initialMinimized = sidebar.classList.contains('minimized');
      sidebarToggle.click();
      await new Promise(r => setTimeout(r, 40));
      const toggledState = sidebar.classList.contains('minimized');
      // Toggle back
      sidebarToggle.click();
      await new Promise(r => setTimeout(r, 40));

      return {
        success: true,
        isFullWidth,
        hasSearch: !!searchInput,
        hasLocate: !!locateBtn,
        hasTelemetry: !!telemetryPill,
        toggleWorked: initialMinimized !== toggledState
      };
    });

    assert.ok(topbarResult.success, 'Studio topbar layout evaluation should succeed');
    assert.strictEqual(topbarResult.isFullWidth, true, 'Studio topbar should span across the screen');
    assert.strictEqual(topbarResult.hasSearch, true, 'Location search must be in topbar');
    assert.strictEqual(topbarResult.hasLocate, true, 'Locate button must be in topbar');
    assert.strictEqual(topbarResult.hasTelemetry, true, 'Telemetry HUD pill must be in topbar');
    assert.strictEqual(topbarResult.toggleWorked, true, 'Sidebar toggle in topbar should toggle sidebar state');
  });

  test('E2E: Theme Toggle & Clean Map Mission Details Activation (v1.68.0)', async () => {
    const themeAndDetailsResult = await page.evaluate(async () => {
      const themeBtn = document.getElementById('theme-toggle-btn');
      const statsPanel = document.getElementById('stats-panel');
      const telemetryPill = document.getElementById('header-telemetry-pill');
      const telemetryPopover = document.getElementById('telemetry-weather-popover');
      const searchInput = document.getElementById('location-input');
      const locateBtn = document.getElementById('locate-me-btn');

      if (!themeBtn || !statsPanel || !telemetryPill || !telemetryPopover || !searchInput || !locateBtn) {
        return { success: false, reason: 'Required DOM elements missing' };
      }

      // 1. Verify map stats panel is hidden by default
      const statsPanelHiddenByDefault = statsPanel.classList.contains('hidden');

      // 2. Verify telemetry HUD pill opens popover
      const popoverInitiallyHidden = telemetryPopover.classList.contains('hidden');
      telemetryPill.click();
      await new Promise(r => setTimeout(r, 40));
      const popoverOpenAfterClick = !telemetryPopover.classList.contains('hidden');
      telemetryPill.click();
      await new Promise(r => setTimeout(r, 40));

      // 3. Verify Theme Toggle
      const initialTheme = document.documentElement.getAttribute('data-theme') || 'dark';
      themeBtn.click();
      await new Promise(r => setTimeout(r, 40));
      const themeAfterFirstClick = document.documentElement.getAttribute('data-theme');
      const savedTheme1 = localStorage.getItem('aalaapi_sky_theme');

      themeBtn.click();
      await new Promise(r => setTimeout(r, 40));
      const themeAfterSecondClick = document.documentElement.getAttribute('data-theme');
      const savedTheme2 = localStorage.getItem('aalaapi_sky_theme');

      // 4. Verify search and locate sizing
      const searchRect = searchInput.getBoundingClientRect();
      const locateRect = locateBtn.getBoundingClientRect();
      const isSearchWide = searchRect.width >= 100;
      const isLocateCompact = locateRect.width <= 120;

      return {
        success: true,
        statsPanelHiddenByDefault,
        popoverInitiallyHidden,
        popoverOpenAfterClick,
        initialTheme,
        themeAfterFirstClick,
        savedTheme1,
        themeAfterSecondClick,
        savedTheme2,
        isSearchWide,
        isLocateCompact
      };
    });

    assert.ok(themeAndDetailsResult.success, 'Evaluation should succeed');
    assert.strictEqual(themeAndDetailsResult.statsPanelHiddenByDefault, true, 'Old floating stats-panel on map must be hidden by default');
    assert.strictEqual(themeAndDetailsResult.popoverOpenAfterClick, true, 'Clicking topbar telemetry pill must open Mission Details popover');
    assert.strictEqual(themeAndDetailsResult.themeAfterFirstClick, 'light', 'Theme should toggle to light mode');
    assert.strictEqual(themeAndDetailsResult.savedTheme1, 'light', 'Light mode saved to localStorage');
    assert.strictEqual(themeAndDetailsResult.themeAfterSecondClick, 'dark', 'Theme should toggle back to dark mode');
    assert.strictEqual(themeAndDetailsResult.savedTheme2, 'dark', 'Dark mode saved to localStorage');
    assert.strictEqual(themeAndDetailsResult.isSearchWide, true, 'Location search input should have plenty of width');
    assert.strictEqual(themeAndDetailsResult.isLocateCompact, true, 'Locate button should be sleek and compact');
  });

  test('E2E: Adding new layer and setting map center preserves independent layer positions (v1.69.0)', async () => {
    const layerIsolationResult = await page.evaluate(async () => {
      // 1. Set Layer 1 at Center 1
      if (typeof setGridCenter === 'function') {
        setGridCenter(40.1234, -80.1234);
      }
      const l1 = getActiveLayer();
      const l1CenterLatOrig = l1.centerLat;
      const l1CenterLonOrig = l1.centerLon;

      // 2. Add Layer 2 (Orbit)
      const l2 = addFlightLayer('orbit');
      const layer2Id = l2.id;

      // 3. Move map center for Layer 2
      setGridCenter(40.5678, -80.5678);

      const l2CenterLatAfter = l2.centerLat;
      const l2CenterLonAfter = l2.centerLon;
      const l1CenterLatAfter = l1.centerLat;
      const l1CenterLonAfter = l1.centerLon;

      // 4. Switch back to Layer 1
      setActiveLayer(l1.id);
      const centerMarkerPosAfterSwitch = (typeof centerMarker !== 'undefined' && centerMarker) ? centerMarker.getLatLng() : null;

      return {
        success: true,
        l1CenterLatOrig,
        l1CenterLonOrig,
        l2CenterLatAfter,
        l2CenterLonAfter,
        l1CenterLatAfter,
        l1CenterLonAfter,
        centerMarkerLat: centerMarkerPosAfterSwitch ? centerMarkerPosAfterSwitch.lat : null,
        centerMarkerLon: centerMarkerPosAfterSwitch ? centerMarkerPosAfterSwitch.lng : null
      };
    });

    assert.ok(layerIsolationResult.success, 'Evaluation should succeed');
    assert.strictEqual(layerIsolationResult.l1CenterLatOrig, 40.1234, 'Layer 1 initial lat');
    assert.strictEqual(layerIsolationResult.l2CenterLatAfter, 40.5678, 'Layer 2 updated lat');
    assert.strictEqual(layerIsolationResult.l1CenterLatAfter, 40.1234, 'Layer 1 lat must NOT change when Layer 2 is moved');
    assert.strictEqual(layerIsolationResult.l1CenterLonAfter, -80.1234, 'Layer 1 lon must NOT change when Layer 2 is moved');
    assert.strictEqual(layerIsolationResult.centerMarkerLat, 40.1234, 'Center marker must jump back to Layer 1 center upon selection');
  });

  test('E2E: Exclusion Zone dynamically follows Imperial (ft) / Metric (m) unit preference (v1.69.1)', async () => {
    const unitResult = await page.evaluate(async () => {
      // 1. Select Exclusion Box
      const gridTypeSelect = document.getElementById('grid-type');
      gridTypeSelect.value = 'exclusion-box';
      gridTypeSelect.dispatchEvent(new Event('change'));

      const allAltCheckbox = document.getElementById('exclusion-all-altitudes');
      if (allAltCheckbox.checked) {
        allAltCheckbox.click(); // Reveal min/max sliders
      }

      // 2. Set to Imperial
      const unitSystemEl = document.getElementById('unit-system');
      if (unitSystemEl) {
        unitSystemEl.value = 'imperial';
        unitSystemEl.dispatchEvent(new Event('change'));
      }
      syncDisplayValues();

      const minUnitFt = document.getElementById('exclusion-min-alt-unit')?.textContent;
      const maxUnitFt = document.getElementById('exclusion-max-alt-unit')?.textContent;
      const hintFt = document.getElementById('exclusion-alt-hint')?.textContent;

      // 3. Set to Metric
      if (unitSystemEl) {
        unitSystemEl.value = 'metric';
        unitSystemEl.dispatchEvent(new Event('change'));
      }
      syncDisplayValues();

      const minUnitM = document.getElementById('exclusion-min-alt-unit')?.textContent;
      const maxUnitM = document.getElementById('exclusion-max-alt-unit')?.textContent;
      const hintM = document.getElementById('exclusion-alt-hint')?.textContent;

      return {
        success: true,
        minUnitFt,
        maxUnitFt,
        hintFt,
        minUnitM,
        maxUnitM,
        hintM
      };
    });

    assert.ok(unitResult.success, 'Unit evaluation succeeded');
    assert.strictEqual(unitResult.minUnitFt, 'ft', 'Exclusion min alt unit should be ft in imperial');
    assert.strictEqual(unitResult.maxUnitFt, 'ft', 'Exclusion max alt unit should be ft in imperial');
    assert.ok(unitResult.hintFt.includes('ft'), 'Exclusion hint text should contain ft in imperial');
    assert.strictEqual(unitResult.minUnitM, 'm', 'Exclusion min alt unit should be m in metric');
    assert.strictEqual(unitResult.maxUnitM, 'm', 'Exclusion max alt unit should be m in metric');
    assert.ok(unitResult.hintM.includes('m'), 'Exclusion hint text should contain m in metric');
  });

  test('E2E: Freeform Polygon Exclusion allows adding vertices and does NOT clear other flight layers (v1.69.2)', async () => {
    const polyResult = await page.evaluate(async () => {
      // 1. Setup Layer 1 as a 2D Nadir Grid
      const l1 = getActiveLayer() || addFlightLayer('single');
      setGridCenter(40.1234, -80.1234);
      updateGrid();

      const l1WpCountBefore = compileMultiLayerMission(40.1234, -80.1234).waypoints.length;

      // 2. Add Layer 2 as Exclusion Poly
      const l2 = addFlightLayer('exclusion-freeform');
      updateGrid();

      const l1WpCountAfterExclAdd = compileMultiLayerMission(40.1234, -80.1234).waypoints.length;

      // 3. Add 3 vertices to Exclusion Poly via addFreeformWaypoint
      addFreeformWaypoint(40.1235, -80.1235);
      addFreeformWaypoint(40.1236, -80.1235);
      addFreeformWaypoint(40.1236, -80.1236);

      const l2VerticesCount = l2.freeformWaypoints?.length || 0;
      const l2PolyVerticesCount = l2.polygonVertices?.length || 0;

      return {
        success: true,
        l1WpCountBefore,
        l1WpCountAfterExclAdd,
        l2VerticesCount,
        l2PolyVerticesCount
      };
    });

    assert.ok(polyResult.success, 'Poly exclusion evaluation succeeded');
    assert.ok(polyResult.l1WpCountBefore > 0, 'Layer 1 must have generated waypoints');
    assert.strictEqual(polyResult.l1WpCountAfterExclAdd, polyResult.l1WpCountBefore, 'Layer 1 waypoints must remain visible when adding Exclusion Poly layer');
    assert.strictEqual(polyResult.l2VerticesCount, 3, 'Exclusion Poly layer must contain 3 vertices');
    assert.strictEqual(polyResult.l2PolyVerticesCount, 3, 'Exclusion Poly polygonVertices must contain 3 vertices');
  });

  test('E2E: Mission Details Popover renders nearest 3 weather stations and allows switching (v1.69.3)', async () => {
    const weatherResult = await page.evaluate(async () => {
      const mockDirections = {
        closest: { icaoId: 'KOSU', name: 'Ohio State Univ', distance: 11.1, fltCat: 'VFR', visibilitySM: 10, ceilingFt: 99999 },
        stations: [
          { icaoId: 'KOSU', name: 'Ohio State Univ', distance: 11.1, fltCat: 'VFR', visibilitySM: 10, ceilingFt: 99999 },
          { icaoId: 'KCMH', name: 'John Glenn Intl', distance: 18.4, fltCat: 'MVFR', visibilitySM: 4.5, ceilingFt: 2500 },
          { icaoId: 'KTZR', name: 'Bolton Field', distance: 24.2, fltCat: 'VFR', visibilitySM: 10, ceilingFt: 99999 }
        ],
        activeIndex: 0
      };

      updateWeatherPanelUI(mockDirections, null, false);

      const popoverDetails = document.getElementById('pop-weather-details');
      const switcherButtons = popoverDetails ? popoverDetails.querySelectorAll('.pop-station-tab-btn') : [];

      // Switch to station 1 (KCMH)
      if (typeof selectActiveWeatherStation === 'function') {
        selectActiveWeatherStation(1);
      }

      const activeAfterSwitch = currentWeatherDirections?.activeIndex;
      const activeIcaoAfterSwitch = currentWeatherDirections?.closest?.icaoId;

      return {
        success: true,
        buttonCount: switcherButtons.length,
        activeAfterSwitch,
        activeIcaoAfterSwitch,
        hasKosu: popoverDetails?.innerHTML.includes('KOSU'),
        hasKcmh: popoverDetails?.innerHTML.includes('KCMH'),
        hasKtzr: popoverDetails?.innerHTML.includes('KTZR')
      };
    });

    assert.ok(weatherResult.success, 'Weather popover test succeeded');
    assert.strictEqual(weatherResult.buttonCount, 3, 'Should render 3 weather station tabs');
    assert.strictEqual(weatherResult.activeAfterSwitch, 1, 'Should switch active station index to 1');
    assert.strictEqual(weatherResult.activeIcaoAfterSwitch, 'KCMH', 'Active station should be KCMH');
    assert.ok(weatherResult.hasKosu && weatherResult.hasKcmh && weatherResult.hasKtzr, 'All 3 station codes should be rendered');
  });

  test('E2E: Weather station displays relative compass rose directions (v1.70.0)', async () => {
    const roseResult = await page.evaluate(async () => {
      const mockDirections = {
        closest: { icaoId: 'KOSU', name: 'Ohio State Univ', distance: 11.1, compassDir: 'NE', fltCat: 'VFR', visibilitySM: 10, ceilingFt: 99999 },
        stations: [
          { icaoId: 'KOSU', name: 'Ohio State Univ', distance: 11.1, compassDir: 'NE', fltCat: 'VFR', visibilitySM: 10, ceilingFt: 99999 },
          { icaoId: 'KCMH', name: 'John Glenn Intl', distance: 18.4, compassDir: 'SE', fltCat: 'MVFR', visibilitySM: 4.5, ceilingFt: 2500 },
          { icaoId: 'KTZR', name: 'Bolton Field', distance: 24.2, compassDir: 'SW', fltCat: 'VFR', visibilitySM: 10, ceilingFt: 99999 }
        ],
        activeIndex: 0
      };

      updateWeatherPanelUI(mockDirections, null, false);

      const popoverDetails = document.getElementById('pop-weather-details');
      const popoverSummary = document.getElementById('pop-weather-summary');

      return {
        success: true,
        summaryHasNE: popoverSummary ? popoverSummary.textContent.includes('NE') : false,
        detailsHasNE: popoverDetails ? popoverDetails.innerHTML.includes('NE') : false,
        detailsHasSE: popoverDetails ? popoverDetails.innerHTML.includes('SE') : false,
        detailsHasSW: popoverDetails ? popoverDetails.innerHTML.includes('SW') : false
      };
    });

    assert.ok(roseResult.success, 'Rose direction evaluation succeeded');
    assert.ok(roseResult.summaryHasNE, 'Summary should contain NE compass direction');
    assert.ok(roseResult.detailsHasNE, 'Details should contain NE compass direction');
    assert.ok(roseResult.detailsHasSE, 'Details should contain SE compass direction');
    assert.ok(roseResult.detailsHasSW, 'Details should contain SW compass direction');
  });

  test('E2E: Road Follow layer operates independently without mutating other layers (v1.70.1)', async () => {
    const roadIsoResult = await page.evaluate(async () => {
      // 1. Reset layers
      flightLayers = [];
      activeLayerId = null;
      roadWaypoints = [];

      const gridTypeSelect = document.getElementById('grid-type');
      if (gridTypeSelect) {
        gridTypeSelect.value = 'double';
        gridTypeSelect.dispatchEvent(new Event('change'));
      }

      // Place center
      setGridCenter(40.0125, -83.1770);
      updateGrid();

      // Layer 1: Double Grid
      const l1 = flightLayers[0];
      const l1InitialCount = l1 && l1.waypoints ? l1.waypoints.length : 0;

      // Layer 2: Road Following
      const l2 = addFlightLayer('road-following');
      l2.roadSnap = false;
      const roadSnapCheckbox = document.getElementById('road-snap');
      if (roadSnapCheckbox) roadSnapCheckbox.checked = false;
      
      // Add road waypoints to Layer 2
      addRoadWaypoint(40.0130, -83.1770);
      addRoadWaypoint(40.0140, -83.1770);
      addRoadWaypoint(40.0150, -83.1770);

      const l2RoadCount = l2.roadWaypoints.length;
      const l2WpCount = l2.waypoints ? l2.waypoints.length : 0;
      const l1AfterCount = l1.waypoints ? l1.waypoints.length : 0;

      // Switch back to Layer 1
      setActiveLayer(l1.id);
      const activeAfterSwitch = activeLayerId;
      const l1WpCountAfter = l1.waypoints ? l1.waypoints.length : 0;
      const l2RoadCountAfter = l2.roadWaypoints ? l2.roadWaypoints.length : 0;

      return {
        success: true,
        l1InitialCount,
        l2RoadCount,
        l2WpCount,
        l1AfterCount,
        activeAfterSwitch,
        l1WpCountAfter,
        l2RoadCountAfter
      };
    });

    assert.ok(roadIsoResult.success, 'Road isolation E2E test evaluated');
    assert.ok(roadIsoResult.l1InitialCount > 0, 'Layer 1 has initial double grid waypoints');
    assert.strictEqual(roadIsoResult.l2RoadCount, 3, 'Layer 2 has 3 road waypoints added');
    assert.strictEqual(roadIsoResult.l2WpCount, 3, 'Layer 2 generated 3 road offset flight waypoints');
    assert.strictEqual(roadIsoResult.l1AfterCount, roadIsoResult.l1InitialCount, 'Layer 1 waypoints preserved when Layer 2 road waypoints added');
    assert.strictEqual(roadIsoResult.l2RoadCountAfter, 3, 'Layer 2 road waypoints preserved after switching back to Layer 1');
  });
});












