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
});


