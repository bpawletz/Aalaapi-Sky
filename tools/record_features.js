/**
 * tools/record_features.js
 * 
 * Automated Feature Video Recording Suite for Aalaapi Sky.
 * Uses Playwright's native recordVideo to capture high-definition .webm demonstrations
 * of all major application features, pattern generators, and historical closed issues.
 * 
 * LOCATION & CENTERING POLICY (AGENTS.md Rule 8 & Rule 9):
 * Demonstrations strictly use the app's default rural location:
 * Grand Village of the Illinois / Utica, IL (41.3215, -88.9950).
 * No major city centers or private/real client operational coordinates are used.
 * When tools are used, the center marker/path is kept centered squarely in the map view.
 */

const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');

// Target directory for recordings (ignored in .gitignore)
const RECORDINGS_DIR = path.resolve(__dirname, '..', 'recordings');
const INDEX_HTML_PATH = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');

// Default Aalaapi Sky location: Grand Village of the Illinois / Utica, IL (Rural countryside, not a major city center)
const DEFAULT_LAT = 41.3215;
const DEFAULT_LON = -88.9950;

// Aliases for backwards compatibility
const GENERIC_LAT = DEFAULT_LAT;
const GENERIC_LON = DEFAULT_LON;

/**
 * Helper to ensure the recordings directory exists
 */
function ensureRecordingsDir() {
  if (!fs.existsSync(RECORDINGS_DIR)) {
    fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
  }
}

/**
 * Helper to center the map view squarely on the target point (preventing bottom offset)
 */
async function centerMapOnPoint(page, lat = DEFAULT_LAT, lon = DEFAULT_LON) {
  await page.evaluate(({ l, ln }) => {
    if (typeof map !== 'undefined' && map) {
      if (typeof map.closePopup === 'function') map.closePopup();
      if (typeof map.setView === 'function') {
        map.setView([l, ln], 17);
      }
      if (typeof map.invalidateSize === 'function') {
        map.invalidateSize();
      }
    }
  }, { l: lat, ln: lon });
}

/**
 * Setup page state with default app location and accepted disclaimer
 */
async function setupPage(page) {
  page.setDefaultTimeout(5000);
  await page.goto(INDEX_HTML_PATH, { waitUntil: 'load' });
  await page.evaluate(({ lat, lon }) => {
    localStorage.setItem('aalaapi_sky_disclaimer_accepted', 'true');
    const d = document.getElementById('disclaimer-modal');
    if (d) d.classList.add('hidden');

    // Dismiss any active intro quickstart modal initially
    const qs = document.getElementById('quickstart-modal');
    if (qs) qs.classList.add('hidden');

    // Clear any cached location so app stays at default
    localStorage.removeItem('aalaapi_sky_last_location');

    // Seed default location
    if (typeof setGridCenter === 'function') {
      setGridCenter(lat, lon);
    }

    // Keep point squarely centered in map viewport (prevent autoPan pushing marker to bottom)
    if (typeof map !== 'undefined' && map) {
      if (typeof map.closePopup === 'function') map.closePopup();
      if (typeof map.setView === 'function') {
        map.setView([lat, lon], 17);
      }
      if (typeof map.invalidateSize === 'function') {
        map.invalidateSize();
      }
    }
  }, { lat: DEFAULT_LAT, lon: DEFAULT_LON });

  await page.waitForTimeout(400);
  await centerMapOnPoint(page);
}

/**
 * Robust helper to change pattern type (forces selection and triggers change event)
 */
async function selectPattern(page, type) {
  await page.evaluate((val) => {
    const el = document.getElementById('grid-type');
    if (el) {
      el.value = val;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, type);

  try {
    const sel = page.locator('#grid-type');
    if (await sel.count() > 0) {
      await sel.selectOption(type, { force: true, timeout: 2000 });
    }
  } catch (e) {
    // Evaluated change above is already applied
  }

  // Ensure point stays in map center
  await centerMapOnPoint(page);
}

/**
 * Robust helper to fill input or slider and trigger input/change events
 */
async function fillInput(page, selector, val) {
  try {
    const el = page.locator(selector).first();
    if (await el.isVisible({ timeout: 1500 })) {
      await el.fill(String(val));
      await el.dispatchEvent('input');
      await el.dispatchEvent('change');
      return;
    }
  } catch (e) {
    // Fall back to evaluate if element is non-interactive or offscreen
  }

  await page.evaluate(({ sel, v }) => {
    const input = document.querySelector(sel);
    if (input) {
      input.value = v;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, { sel: selector, v: String(val) });
}

/**
 * Catalog of feature recording scenarios covering all major capabilities & historical issues
 */
const scenarios = [
  {
    id: 'feature_grid_survey',
    name: 'Single & Double Photogrammetry Grid Generator',
    description: 'Generates nadir survey grids, toggles double grid, adjusts spacing, angle, and flight speed.',
    issueRef: 'Core Feature',
    run: async (page) => {
      // 1. Select Single Grid
      await selectPattern(page, 'single');
      await page.waitForTimeout(500);

      // 2. Adjust Grid Spacing slider
      await fillInput(page, '#grid-spacing', '35');
      await centerMapOnPoint(page);
      await page.waitForTimeout(500);

      // 3. Adjust Grid Angle
      await fillInput(page, '#grid-angle', '45');
      await page.waitForTimeout(500);

      // 4. Switch to Double Grid (Cross-hatch survey)
      await selectPattern(page, 'double');
      await centerMapOnPoint(page);
      await page.waitForTimeout(800);

      // 5. Toggle Continuous vs Hover capture mode
      await fillInput(page, '#capture-mode', 'hover');
      await page.waitForTimeout(600);
    }
  },
  {
    id: 'feature_orbit_poi',
    name: 'Orbit Flight Pattern & POI Targeting',
    description: 'Generates circular orbit around Point of Interest with inward gimbal camera orientation.',
    issueRef: 'Core Feature',
    run: async (page) => {
      // 1. Switch to Orbit pattern
      await selectPattern(page, 'orbit');
      await centerMapOnPoint(page);
      await page.waitForTimeout(600);

      // 2. Adjust Orbit Radius
      await fillInput(page, '#orbit-radius', '60');
      await centerMapOnPoint(page);
      await page.waitForTimeout(600);

      // 3. Adjust Orbit Altitude
      await fillInput(page, '#grid-altitude', '45');
      await page.waitForTimeout(600);

      // 4. Adjust Gimbal Pitch
      await fillInput(page, '#orbit-gimbal-pitch', '-35');
      await page.waitForTimeout(600);
    }
  },
  {
    id: 'feature_spiral_cylinder',
    name: 'Spiral & Vertical Inspection Cylinder',
    description: '3D vertical helix/cylinder for asset, silo, and structural tower inspection.',
    issueRef: 'Core Feature',
    run: async (page) => {
      // 1. Switch to Spiral pattern
      await selectPattern(page, 'spiral');
      await centerMapOnPoint(page);
      await page.waitForTimeout(600);

      // 2. Tweak spiral turns
      await fillInput(page, '#spiral-turns', '4');
      await page.waitForTimeout(600);

      // 3. Tweak top altitude
      await fillInput(page, '#spiral-top-alt', '80');
      await centerMapOnPoint(page);
      await page.waitForTimeout(800);
    }
  },
  {
    id: 'feature_3d_tower_scan',
    name: '3D Tower Flight Plan & Cable Hazard Warning',
    description: 'Vertical tower scan with automated guy-wire safety buffers and standoff guidance.',
    issueRef: 'Issue #86',
    run: async (page) => {
      // 1. Switch to 3D Tower pattern
      await selectPattern(page, 'tower');
      await centerMapOnPoint(page);
      await page.waitForTimeout(700);

      // 2. Modify Tower Standoff distance
      await fillInput(page, '#tower-standoff', '25');
      await centerMapOnPoint(page);
      await page.waitForTimeout(500);

      // 3. Modify Tower Height
      await fillInput(page, '#tower-height', '65');
      await page.waitForTimeout(600);

      // 4. Toggle Guy Wire Hazard Rings
      await page.evaluate(() => {
        const gw = document.getElementById('tower-guy-wires');
        if (gw) {
          gw.checked = true;
          gw.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      await centerMapOnPoint(page);
      await page.waitForTimeout(800);
    }
  },
  {
    id: 'feature_photo_sphere',
    name: '360 Photo Sphere & Micro-Orbital Separation',
    description: 'Panoramic spherical shoot with multi-ring elevations, yaw settling, and APAS micro-orbital offsets.',
    issueRef: 'Issue #89',
    run: async (page) => {
      // 1. Switch to Photo Sphere pattern
      await selectPattern(page, 'photo-sphere');
      await centerMapOnPoint(page);
      await page.waitForTimeout(700);

      // 2. Click Full 360 Pano Preset chip if present
      await page.evaluate(() => {
        const preset = document.getElementById('photo-sphere-preset-full') || document.querySelector('.sphere-preset-chip');
        if (preset) preset.click();
      });
      await centerMapOnPoint(page);
      await page.waitForTimeout(600);

      // 3. Scroll shot badge into view
      await page.evaluate(() => {
        const badge = document.getElementById('sphere-shot-count-badge') || document.getElementById('photo-sphere-container');
        if (badge) badge.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
      await page.waitForTimeout(800);
    }
  },
  {
    id: 'feature_multi_layer_centers',
    name: 'Distinct Layer Centers & Auto-POI Spatial Projection',
    description: 'Multi-layer flight stacks with independent geographic anchor pins and POI projections.',
    issueRef: 'Issue #87',
    run: async (page) => {
      // 1. Click Add Layer button in Section 1
      await page.evaluate(() => {
        const btn = document.getElementById('add-layer-btn') || document.querySelector('.add-layer-btn');
        if (btn) btn.click();
      });
      await page.waitForTimeout(800);

      // 2. Select second layer in stack
      await page.evaluate(() => {
        const items = document.querySelectorAll('.layer-item, .pattern-layer-card');
        if (items.length > 1) {
          items[1].click();
        }
      });
      await page.waitForTimeout(600);

      // 3. Change second layer pattern to Orbit
      await selectPattern(page, 'orbit');
      await centerMapOnPoint(page);
      await page.waitForTimeout(800);
    }
  },
  {
    id: 'feature_multi_poi_layers',
    name: 'Multi-POI Association & Three-Tier Hierarchy',
    description: 'Dynamic association of flight layers and waypoints with custom POIs or cascading inheritance.',
    issueRef: 'Issue #77',
    run: async (page) => {
      // 1. Set global heading mode to towardPOI
      await page.evaluate(() => {
        const headingSelect = document.getElementById('heading-mode');
        if (headingSelect) {
          headingSelect.value = 'towardPOI';
          headingSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      await page.waitForTimeout(600);

      // 2. Open Layer Advanced Dynamics Drawer in Section 2
      await page.evaluate(() => {
        const toggle = document.getElementById('layer-advanced-dynamics-toggle-btn');
        if (toggle) toggle.click();
      });
      await page.waitForTimeout(600);

      // 3. Set Layer Heading Mode to towardPOI to reveal layer-poi-container
      await page.evaluate(() => {
        const layerHead = document.getElementById('layer-heading-mode');
        if (layerHead) {
          layerHead.value = 'towardPOI';
          layerHead.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      await page.waitForTimeout(800);

      // 4. Center map squarely
      await centerMapOnPoint(page);
      await page.waitForTimeout(800);
    }
  },
  {
    id: 'feature_3d_fpv_hud',
    name: '3D FPV HUD Virtual Cockpit & Trajectory View',
    description: 'Interactive Three.js 3D perspective viewer with virtual HUD instruments and flight waylines.',
    issueRef: 'Core Feature',
    run: async (page) => {
      // 1. Generate Single Grid first
      await selectPattern(page, 'single');
      await centerMapOnPoint(page);
      await page.waitForTimeout(400);

      // 2. Open 3D Flight Path Preview modal
      await page.evaluate(() => {
        const btn = document.getElementById('preview-3d-btn') || document.getElementById('btn-3d-preview');
        if (btn) btn.click();
      });
      await page.waitForTimeout(1000);

      // 3. Toggle Follow Cam / Cockpit View mode if toggle exists
      await page.evaluate(() => {
        const toggle = document.getElementById('btn-3d-cockpit-view') || document.getElementById('btn-3d-follow-cam') || document.querySelector('.fpv-view-toggle');
        if (toggle) toggle.click();
      });
      await page.waitForTimeout(800);

      // 4. Dismiss 3D modal
      await page.evaluate(() => {
        const close = document.getElementById('close-3d-preview') || document.querySelector('#modal-3d-preview .modal-close');
        if (close) close.click();
      });
      await page.waitForTimeout(400);
    }
  },
  {
    id: 'feature_adsb_airspace',
    name: 'ADS-B Airspace Awareness & Remote dump1090 Feed',
    description: 'Real-time manned aircraft awareness, remote dump1090/readsb host port scanner and radar overlays.',
    issueRef: 'Issue #103 & Issue #92',
    run: async (page) => {
      // 1. Open ADS-B Airspace Drawer
      await page.evaluate(() => {
        const pill = document.getElementById('adsb-status-pill') || document.getElementById('btn-adsb-airspace');
        if (pill) {
          pill.click();
        } else {
          const drawer = document.getElementById('adsb-drawer');
          if (drawer) drawer.classList.remove('hidden', 'drawer-closed');
        }
      });
      await page.waitForTimeout(800);

      // 2. Fill remote host input with generic test server
      await fillInput(page, '#adsb-host-input', '192.168.1.150');
      await page.waitForTimeout(500);

      // 3. Click Port Preset Chip (30003 SBS)
      await page.evaluate(() => {
        const chips = Array.from(document.querySelectorAll('button, .adsb-port-chip'));
        const chip = chips.find(c => c.textContent && c.textContent.includes('30003'));
        if (chip) chip.click();
      });
      await page.waitForTimeout(700);

      // 4. Close drawer
      await page.evaluate(() => {
        const close = document.getElementById('close-adsb-drawer-btn') || document.querySelector('#adsb-drawer .close-btn');
        if (close) close.click();
      });
      await centerMapOnPoint(page);
      await page.waitForTimeout(400);
    }
  },
  {
    id: 'feature_photo_inspector',
    name: 'Sequential Photo Inspector & EXIF Telemetry',
    description: 'In-viewer photo gallery with keyboard navigation, camera telemetry, and tag overlays.',
    issueRef: 'Issue #101',
    run: async (page) => {
      // Open Photo Inspector dialog with mock generic telemetry
      await page.evaluate(() => {
        const modal = document.getElementById('photo-inspector-modal');
        if (modal) {
          modal.classList.remove('hidden');
          const title = modal.querySelector('#photo-inspector-title, h3, .modal-title');
          if (title) title.textContent = 'Photo Inspector (Generic Demo Flight)';
        }
      });
      await page.waitForTimeout(800);

      // Click Next photo button
      await page.evaluate(() => {
        const next = document.getElementById('photo-next-btn') || document.getElementById('inspector-next-btn') || document.querySelector('button[title*="Next"]');
        if (next) next.click();
      });
      await page.waitForTimeout(600);

      // Close modal
      await page.evaluate(() => {
        const modal = document.getElementById('photo-inspector-modal');
        if (modal) modal.classList.add('hidden');
      });
      await centerMapOnPoint(page);
      await page.waitForTimeout(400);
    }
  },
  {
    id: 'feature_flight_diagnostics',
    name: 'Flight Diagnostics & 3D Telemetry Replay',
    description: 'Blackbox flight log explorer with 3D trajectory replay, ground textures, and speed/altitude charts.',
    issueRef: 'Core Feature',
    run: async (page) => {
      // 1. Open Flight Diagnostics
      await page.evaluate(() => {
        if (window.FlightDiagnostics && typeof FlightDiagnostics.open === 'function') {
          FlightDiagnostics.open('overview');
        } else {
          const el = document.getElementById('flight-diagnostics-drawer') || document.getElementById('flight-diagnostics-modal');
          if (el) el.classList.remove('hidden', 'drawer-closed');
        }
      });
      await page.waitForTimeout(800);

      // 2. Switch to 3D View Tab if present
      await page.evaluate(() => {
        const tab = Array.from(document.querySelectorAll('.diag-tab-btn, button')).find(b => b.textContent && b.textContent.includes('3D'));
        if (tab) tab.click();
      });
      await page.waitForTimeout(800);

      // 3. Dismiss diagnostics
      await page.evaluate(() => {
        const close = document.getElementById('close-flight-diagnostics-btn') || document.querySelector('#flight-diagnostics-drawer .close-btn') || document.querySelector('#flight-diagnostics-modal .modal-close');
        if (close) close.click();
      });
      await centerMapOnPoint(page);
      await page.waitForTimeout(400);
    }
  },
  {
    id: 'feature_weather_metar',
    name: 'Weather Stations, METAR Reports & Wind Compass',
    description: 'Dynamic airport METAR cards, relative wind compass rose, and localized solar tracker.',
    issueRef: 'Issue #80 & Issue #81',
    run: async (page) => {
      // 1. Open Mission Details / Weather popover
      await page.evaluate(() => {
        const btn = document.getElementById('mission-details-btn') || document.getElementById('topbar-weather-btn') || document.getElementById('topbar-weather-pill');
        if (btn) {
          btn.click();
        } else {
          const pop = document.getElementById('mission-details-popover');
          if (pop) pop.classList.remove('hidden');
        }
      });
      await page.waitForTimeout(800);

      // 2. Switch weather station chip
      await page.evaluate(() => {
        const stations = document.querySelectorAll('.weather-station-chip, .weather-station-card');
        if (stations.length > 1) {
          stations[1].click();
        }
      });
      await page.waitForTimeout(700);

      // 3. Dismiss popover
      await page.evaluate(() => {
        const close = document.getElementById('close-mission-details-btn') || document.querySelector('#mission-details-popover .close-btn');
        if (close) {
          close.click();
        } else {
          const pop = document.getElementById('mission-details-popover');
          if (pop) pop.classList.add('hidden');
        }
      });
      await centerMapOnPoint(page);
      await page.waitForTimeout(400);
    }
  },
  {
    id: 'feature_intro_guide',
    name: 'In-App Quickstart Tour & Feature Highlights',
    description: 'Comprehensive guided walkthrough hub with multi-tab feature documentation and key capabilities.',
    issueRef: 'Core Feature',
    run: async (page) => {
      // 1. Open Quickstart Guide Modal
      await page.evaluate(() => {
        const modal = document.getElementById('quickstart-modal');
        if (modal) modal.classList.remove('hidden');
      });
      await page.waitForTimeout(700);

      // 2. Switch to Features Highlights tab
      await page.evaluate(() => {
        const tab = document.getElementById('intro-tab-features') || Array.from(document.querySelectorAll('button')).find(b => b.textContent && (b.textContent.includes("What's New") || b.textContent.includes("Features")));
        if (tab) tab.click();
      });
      await page.waitForTimeout(700);

      // 3. Switch to Patterns tab
      await page.evaluate(() => {
        const tab = document.getElementById('intro-tab-patterns') || Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Patterns'));
        if (tab) tab.click();
      });
      await page.waitForTimeout(700);

      // 4. Close guide modal
      await page.evaluate(() => {
        const close = document.getElementById('close-quickstart-btn') || document.querySelector('#quickstart-modal .modal-close');
        if (close) {
          close.click();
        } else {
          const modal = document.getElementById('quickstart-modal');
          if (modal) modal.classList.add('hidden');
        }
      });
      await centerMapOnPoint(page);
      await page.waitForTimeout(400);
    }
  },
  {
    id: 'feature_waypoint_editor_mobile',
    name: 'Waypoint Editor & Mobile Overflow Containment',
    description: 'Responsive 2D waypoint editor popup and 3D FPV HUD panel with zero horizontal overhang.',
    issueRef: 'Issue #107',
    run: async (page) => {
      // 1. Generate Single Grid pattern
      await selectPattern(page, 'single');
      await centerMapOnPoint(page);
      await page.waitForTimeout(600);

      // 2. Open first waypoint editor popup on the map
      await page.evaluate(() => {
        if (typeof waypointMarkersGroup !== 'undefined' && waypointMarkersGroup) {
          const layers = waypointMarkersGroup.getLayers();
          if (layers && layers.length > 0 && typeof layers[0].openPopup === 'function') {
            layers[0].openPopup();
          }
        }
      });
      await page.waitForTimeout(800);

      // 3. Emulate mobile viewport to demonstrate fluid containment
      await page.setViewportSize({ width: 375, height: 667 });
      await page.waitForTimeout(1000);

      // 4. Restore desktop viewport
      await page.setViewportSize({ width: 1280, height: 720 });
      await centerMapOnPoint(page);
      await page.waitForTimeout(600);
    }
  },
  {
    id: 'feature_exclusion_freeform_custom_heading',
    name: 'Exclusion-Freeform & Custom Heading Execution on DJI Mini 4 Pro',
    description: 'Autonomous exclusion-freeform flight layer with custom waypoint headings, smoothTransition WPML export, and detour hover suppression.',
    issueRef: 'Issue #110',
    run: async (page) => {
      // 1. Select drone model: DJI Mini 4 Pro (value: 68)
      await page.evaluate(() => {
        const droneSelect = document.getElementById('drone-model');
        if (droneSelect) {
          droneSelect.value = '68';
          droneSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      await page.waitForTimeout(400);

      // 2. Select pattern: Freeform Polygon Exclusion
      await selectPattern(page, 'exclusion-freeform');
      await centerMapOnPoint(page);
      await page.waitForTimeout(800);

      // 3. Add custom polygon exclusion vertices around center
      await page.evaluate(() => {
        if (typeof addFlightLayer === 'function') {
          const active = getActiveLayer();
          if (active) {
            active.boundaryPoints = [
              { lat: 41.3225, lon: -88.9960 },
              { lat: 41.3225, lon: -88.9940 },
              { lat: 41.3205, lon: -88.9940 },
              { lat: 41.3205, lon: -88.9960 }
            ];
          }
        }
        if (typeof updateMapGrid === 'function') {
          updateMapGrid();
        }
      });
      await centerMapOnPoint(page);
      await page.waitForTimeout(1000);

      // 4. Open pre-flight audit modal to demonstrate clean validation passing
      await page.evaluate(() => {
        const auditBtn = document.getElementById('preflight-audit-btn');
        if (auditBtn) auditBtn.click();
      });
      await page.waitForTimeout(1200);

      // 5. Close audit modal
      await page.evaluate(() => {
        const closeBtn = document.getElementById('preflight-audit-close-btn');
        if (closeBtn) closeBtn.click();
      });
      await page.waitForTimeout(500);
      await centerMapOnPoint(page);
    }
  },
  {
    id: 'solar_ephemeris',
    name: 'Next-24-Hour Solar Ephemeris & FAA Part 107 Twilight Tracker',
    issueRef: 'Issue #100, v1.135.0',
    description: 'Demonstrates offline astronomical solar ephemeris calculation, Weather Popover solar card with 24h timeline drawer, and Section 4 sidebar solar panel.',
    run: async (page) => {
      // 1. Center squarely on default rural Utica location
      await centerMapOnPoint(page, DEFAULT_LAT, DEFAULT_LON);
      await page.waitForTimeout(600);

      // 2. Open Mission Details / Weather Popover to show Popover Solar Card
      await page.evaluate(() => {
        const telemetryPill = document.getElementById('telemetry-weather-pill') || document.getElementById('telemetry-satellites-pill');
        if (telemetryPill) telemetryPill.click();
      });
      await page.waitForTimeout(1000);

      // 3. Expand the 24-hour timeline in the popover
      await page.evaluate(() => {
        const toggleBtn = document.getElementById('pop-btn-toggle-solar-timeline');
        if (toggleBtn) toggleBtn.click();
      });
      await page.waitForTimeout(1500);

      // 4. Close the popover
      await page.evaluate(() => {
        const popover = document.getElementById('telemetry-weather-popover');
        if (popover) popover.classList.add('hidden');
      });
      await page.waitForTimeout(600);

      // 5. Expand Section 4 (Mission Summary / Weather) in the sidebar to show the Sidebar Solar Card
      await page.evaluate(() => {
        const sec4Header = document.querySelector('.section-header[data-section="4"]');
        const sec4Content = document.getElementById('section-4-content');
        if (sec4Header && sec4Content && sec4Content.classList.contains('collapsed')) {
          sec4Header.click();
        }
        // Scroll sidebar down to the solar card
        const statCard = document.getElementById('stat-solar-card');
        if (statCard) statCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      await page.waitForTimeout(1000);

      // 6. Expand the 24-hour timeline in the sidebar card
      await page.evaluate(() => {
        const toggleBtn = document.getElementById('stat-btn-toggle-solar-timeline');
        if (toggleBtn) toggleBtn.click();
      });
      await page.waitForTimeout(1500);

      // Keep map centered squarely on point (AGENTS.md Rule 8 & 9)
      await centerMapOnPoint(page, DEFAULT_LAT, DEFAULT_LON);
      await page.waitForTimeout(600);
    }
  }
];

/**
 * Record a single scenario to video
 */
async function recordScenario(scenario, browser) {
  ensureRecordingsDir();
  console.log(`\n🎬 Recording scenario: [${scenario.id}] - ${scenario.name}`);

  let localBrowser = browser;
  let shouldCloseBrowser = false;

  if (!localBrowser) {
    localBrowser = await chromium.launch({
      headless: true,
      args: ['--enable-webgl', '--use-gl=swiftshader']
    });
    shouldCloseBrowser = true;
  }

  const context = await localBrowser.newContext({
    recordVideo: {
      dir: RECORDINGS_DIR,
      size: { width: 1280, height: 720 }
    },
    viewport: { width: 1280, height: 720 }
  });

  const page = await context.newPage();

  try {
    await setupPage(page);
    await scenario.run(page);
    await page.waitForTimeout(800); // Final pause for video capture stability
  } catch (err) {
    console.error(`⚠️ Error during scenario ${scenario.id}:`, err.message);
  } finally {
    // Closing context finalizes and flushes the .webm video file
    await context.close();
  }

  // Find the generated video file and rename it to the target scenario name
  const finalPath = path.join(RECORDINGS_DIR, `${scenario.id}.webm`);
  try {
    const videoObj = page.video();
    if (videoObj) {
      const tempPath = await videoObj.path();
      if (fs.existsSync(tempPath)) {
        if (fs.existsSync(finalPath)) {
          fs.unlinkSync(finalPath);
        }
        fs.renameSync(tempPath, finalPath);
        const stats = fs.statSync(finalPath);
        const kbSize = (stats.size / 1024).toFixed(1);
        console.log(`✅ [SAVED] recordings/${scenario.id}.webm (${kbSize} KB)`);
      }
    }
  } catch (err) {
    console.warn(`Could not rename video file for ${scenario.id}:`, err.message);
  }

  if (shouldCloseBrowser && localBrowser) {
    await localBrowser.close();
  }

  return finalPath;
}

/**
 * Record all scenarios sequentially
 */
async function recordAll() {
  ensureRecordingsDir();
  console.log(`=======================================================`);
  console.log(`🚀 Starting Aalaapi Sky Automated Feature Video Suite`);
  console.log(`📍 Location: Default Rural Aalaapi Sky (${DEFAULT_LAT}, ${DEFAULT_LON})`);
  console.log(`📁 Target Directory: ${RECORDINGS_DIR}`);
  console.log(`🎯 Scenarios to Record: ${scenarios.length}`);
  console.log(`=======================================================`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--enable-webgl', '--use-gl=swiftshader']
  });

  const results = [];
  try {
    for (const scenario of scenarios) {
      const outPath = await recordScenario(scenario, browser);
      results.push({ id: scenario.id, name: scenario.name, path: outPath });
    }
  } finally {
    await browser.close();
  }

  console.log(`\n=======================================================`);
  console.log(`🎉 Automated Video Recording Complete!`);
  console.log(`Total Videos Generated: ${results.length}`);
  console.log(`Note: recordings/ is strictly gitignored.`);
  console.log(`=======================================================`);
  return results;
}

// CLI Argument Handling
if (require.main === module) {
  const args = process.argv.slice(2);
  let targetFeature = null;
  const featEq = args.find(a => a.startsWith('--feature=') || a.startsWith('--scenario='));
  if (featEq) {
    targetFeature = featEq.split('=')[1];
  } else {
    const featIdx = args.findIndex(a => a === '--feature' || a === '--scenario');
    if (featIdx !== -1 && args[featIdx + 1] && !args[featIdx + 1].startsWith('-')) {
      targetFeature = args[featIdx + 1];
    } else if (args[0] && !args[0].startsWith('-')) {
      targetFeature = args[0];
    }
  }

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`Aalaapi Sky Automated Feature Video Recorder\n`);
    console.log(`Usage:`);
    console.log(`  node tools/record_features.js                 # Records all features`);
    console.log(`  node tools/record_features.js --all           # Records all features`);
    console.log(`  node tools/record_features.js --feature=<id>  # Records specific feature`);
    console.log(`  node tools/record_features.js --list          # Lists available features\n`);
    console.log(`Available Features:`);
    scenarios.forEach(s => console.log(`  - ${s.id.padEnd(28)} : ${s.name} [${s.issueRef}]`));
    process.exit(0);
  }

  if (args.includes('--list')) {
    console.log(`Available Feature Recording Scenarios:`);
    scenarios.forEach((s, idx) => console.log(`  ${idx + 1}. ${s.id} - ${s.name} (${s.issueRef})`));
    process.exit(0);
  }

  if (targetFeature) {
    const scenario = scenarios.find(s => s.id === targetFeature || s.id.includes(targetFeature));
    if (!scenario) {
      console.error(`❌ Feature scenario not found: '${targetFeature}'`);
      console.log(`Run 'node tools/record_features.js --list' to see valid options.`);
      process.exit(1);
    }
    recordScenario(scenario).then(() => {
      console.log(`Done recording ${scenario.id}.`);
    }).catch(err => {
      console.error('Recording failed:', err);
      process.exit(1);
    });
  } else {
    recordAll().catch(err => {
      console.error('Batch recording failed:', err);
      process.exit(1);
    });
  }
}

module.exports = {
  RECORDINGS_DIR,
  DEFAULT_LAT,
  DEFAULT_LON,
  GENERIC_LAT,
  GENERIC_LON,
  scenarios,
  recordScenario,
  recordAll,
  ensureRecordingsDir,
  setupPage,
  selectPattern,
  fillInput,
  centerMapOnPoint
};
