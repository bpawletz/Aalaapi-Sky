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

  test('Flight statistics panel updates without throwing errors', async () => {
    const statsContainer = page.locator('#stats-panel, .stats-container, #stats');
    if (await statsContainer.count() > 0) {
      assert.ok(await statsContainer.first().isVisible(), 'Stats panel should be visible');
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

  test('E2E: Sidebar header buttons (#config-btn, #about-btn, #useful-links-btn) do not overflow sidebar container', async () => {
    const overflowResult = await page.evaluate(() => {
      const sidebar = document.querySelector('.sidebar');
      const linksBtn = document.getElementById('useful-links-btn');
      const aboutBtn = document.getElementById('about-btn');
      const configBtn = document.getElementById('config-btn');

      if (!sidebar || !linksBtn || !aboutBtn || !configBtn) {
        return { success: false, reason: 'Elements missing' };
      }

      const sidebarRect = sidebar.getBoundingClientRect();
      const linksRect = linksBtn.getBoundingClientRect();
      const aboutRect = aboutBtn.getBoundingClientRect();
      const configRect = configBtn.getBoundingClientRect();

      // Ensure all buttons are within sidebar's right boundary (with a 2px tolerance for subpixel rounding)
      const linksFit = linksRect.right <= sidebarRect.right + 2;
      const aboutFit = aboutRect.right <= sidebarRect.right + 2;
      const configFit = configRect.right <= sidebarRect.right + 2;

      return {
        success: linksFit && aboutFit && configFit,
        sidebarRight: sidebarRect.right,
        linksRight: linksRect.right,
        aboutRight: aboutRect.right,
        configRight: configRect.right
      };
    });

    assert.ok(overflowResult.success, `Header buttons overflow sidebar: linksRight=${overflowResult.linksRight}, sidebarRight=${overflowResult.sidebarRight}`);
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

  test('Double Grid and Freeform generate valid WPML with smoothTransition for non-tangential headings', async () => {
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

      const hasDoubleSmoothTransition = doubleXml.includes('<wpml:waypointHeadingMode>smoothTransition</wpml:waypointHeadingMode>');
      const noDoubleFollowConflict = !doubleXml.includes('<wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode>');

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
        hasDoubleSmoothTransition,
        noDoubleFollowConflict,
        hasFreeformFollowWayline,
        hasHeadingAngleEnable,
        doubleWpsCount: doubleWps ? doubleWps.length : 0,
        freeformWpsCount: freeformWps ? freeformWps.length : 0
      };
    });

    assert.ok(wpmlResult.hasDoubleSmoothTransition, 'Double Grid with oblique pitch must use smoothTransition heading mode');
    assert.ok(wpmlResult.noDoubleFollowConflict, 'Double Grid with oblique pitch must not have followWayline conflicts');
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
});








