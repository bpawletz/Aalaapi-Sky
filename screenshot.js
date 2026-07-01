const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1200, height: 800 }
  });

  const url = 'file://' + path.resolve('index.html');
  await page.goto(url, { waitUntil: 'networkidle' });

  // Create a waypoint so the 3D toggle is enabled/active
  await page.evaluate(() => {
    // mock a click on the map to add a point
    if (typeof map !== 'undefined' && map.fire) {
      map.fire('click', {latlng: L.latLng(40.7128, -74.0060)});
      map.fire('click', {latlng: L.latLng(40.7138, -74.0050)});
    }
  });

  await page.waitForTimeout(1000);

  // Click on the 3D toggle (button with class 'three-toggle' or 'preview-btn' or evaluate JS directly)
  await page.evaluate(() => {
    const btn = document.querySelector('.leaflet-control-3d-preview a');
    if (btn) btn.click();
    else if (typeof toggle3DPreview === 'function') toggle3DPreview();
  });

  // Wait for 3D render & fetches
  await page.waitForTimeout(6000);

  await page.screenshot({ path: '3d_preview.png' });
  await browser.close();
  console.log("Screenshot saved to 3d_preview.png");
})();
