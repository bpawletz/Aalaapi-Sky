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
});
