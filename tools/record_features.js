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
  page.setDefaultTimeout(15000);
  await page.goto(INDEX_HTML_PATH, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => typeof window.L !== 'undefined', { timeout: 15000 }).catch(() => {});
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
        const topbarBtn = document.getElementById('adsb-topbar-btn');
        const pill = document.getElementById('adsb-status-pill') || document.getElementById('btn-adsb-airspace');
        if (topbarBtn) {
          topbarBtn.click();
        } else if (pill) {
          pill.click();
        } else {
          const drawer = document.getElementById('adsb-control-drawer') || document.getElementById('adsb-drawer');
          if (drawer) drawer.classList.remove('hidden', 'drawer-closed');
        }
      });
      await page.waitForTimeout(800);

      // Switch to Feed & Hardware settings tab
      await page.evaluate(() => {
        const settingsTab = document.getElementById('adsb-tab-btn-settings');
        if (settingsTab) settingsTab.click();
      });
      await page.waitForTimeout(600);

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

      // Switch back to Operations tab to show clear live airspace view
      await page.evaluate(() => {
        const opsTab = document.getElementById('adsb-tab-btn-ops');
        if (opsTab) opsTab.click();
      });
      await page.waitForTimeout(600);

      // 4. Close drawer
      await page.evaluate(() => {
        const close = document.getElementById('adsb-drawer-close-btn') || document.getElementById('close-adsb-drawer-btn') || document.querySelector('#adsb-control-drawer .popover-close-btn');
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
        const drawer = document.getElementById('photo-inspector-drawer');
        if (drawer) drawer.classList.remove('hidden', 'drawer-closed');
      });
      await page.waitForTimeout(700);

      // Demonstrate toggling the Solar Position HUD overlay checkbox
      await page.evaluate(() => {
        const solarCb = document.getElementById('layer-toggle-solar');
        if (solarCb) {
          solarCb.checked = false;
          solarCb.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      await page.waitForTimeout(600);

      await page.evaluate(() => {
        const solarCb = document.getElementById('layer-toggle-solar');
        if (solarCb) {
          solarCb.checked = true;
          solarCb.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      await page.waitForTimeout(600);

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
  },
  {
    id: 'feature_freeform_mission_execution',
    name: 'Freeform Pattern Execution on DJI Mini 4 Pro',
    description: 'Autonomous multi-waypoint freeform flight path execution on DJI Mini 4 Pro with smoothTransition heading compliance and 0-error preflight audit.',
    issueRef: 'Issue #111',
    run: async (page) => {
      // 1. Switch to Freeform pattern
      await selectPattern(page, 'freeform');
      await centerMapOnPoint(page, DEFAULT_LAT, DEFAULT_LON);
      await page.waitForTimeout(600);

      // 2. Select DJI Mini 4 Pro drone model and configure parameters
      await page.evaluate(() => {
        const droneSelect = document.getElementById('drone-model');
        if (droneSelect) {
          droneSelect.value = '68'; // DJI Mini 4 Pro
          droneSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
        const altInput = document.getElementById('altitude');
        if (altInput) {
          altInput.value = '50';
          altInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const speedInput = document.getElementById('speed');
        if (speedInput) {
          speedInput.value = '4';
          speedInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const pitchInput = document.getElementById('gimbal-pitch');
        if (pitchInput) {
          pitchInput.value = '-60';
          pitchInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });
      await page.waitForTimeout(500);

      // 3. Populate 31 synthetic freeform waypoints forming an exploratory path in default rural Utica, IL area
      await page.evaluate(({ baseLat, baseLon }) => {
        if (typeof waypoints !== 'undefined') {
          waypoints.length = 0;
          for (let i = 0; i < 31; i++) {
            // Serpentine spiral pattern around default rural center
            const angle = i * 0.45;
            const dist = 0.00015 + (i * 0.00004);
            const lat = baseLat + Math.sin(angle) * dist;
            const lon = baseLon + Math.cos(angle) * dist * 1.3;
            waypoints.push({
              lat: lat,
              lon: lon,
              alt: 50,
              speed: 4,
              heading: null, // click placement default
              headingMode: 'inherit',
              gridType: 'freeform',
              layerPattern: 'freeform',
              turnMode: 'inherit'
            });
          }
          if (typeof renderAllLayers === 'function') {
            renderAllLayers();
          } else if (typeof updateGrid === 'function') {
            updateGrid();
          }
        }
      }, { baseLat: DEFAULT_LAT, baseLon: DEFAULT_LON });
      await centerMapOnPoint(page, DEFAULT_LAT, DEFAULT_LON);
      await page.waitForTimeout(1000);

      // 4. Open and run Preflight WPML Audit modal to demonstrate 10/10 rules pass and smoothTransition compliance
      await page.evaluate(() => {
        const auditBtn = document.getElementById('btn-preflight-audit') || document.getElementById('audit-mission-btn');
        if (auditBtn) auditBtn.click();
      });
      await page.waitForTimeout(1800);

      // 5. Close Preflight Audit modal
      await page.evaluate(() => {
        const closeBtn = document.getElementById('preflight-modal-close') || document.querySelector('#preflight-modal .modal-close');
        if (closeBtn) closeBtn.click();
        const modal = document.getElementById('preflight-modal');
        if (modal) modal.classList.add('hidden');
      });
      await centerMapOnPoint(page, DEFAULT_LAT, DEFAULT_LON);
      await page.waitForTimeout(800);
    }
  },
  {
    id: 'bridge_tile_cache',
    name: 'Map Tile & Asset Caching Proxy on Bridge (Issue #91)',
    issueRef: 'Issue #91',
    run: async (page) => {
      // 1. Center squarely on default rural location (Utica, IL)
      await centerMapOnPoint(page, DEFAULT_LAT, DEFAULT_LON);
      await page.waitForTimeout(1000);

      // 2. Open Companion Host Drawer / Panel
      await page.evaluate(() => {
        const toggle = document.getElementById('companion-toggle') || document.getElementById('btn-companion-toggle');
        if (toggle) toggle.click();
        const panel = document.getElementById('companion-host-panel');
        if (panel) panel.classList.remove('hidden');
      });
      await page.waitForTimeout(1200);

      // 3. Highlight Bridge Tile Cache section and interact with toggle
      await page.evaluate(() => {
        const cacheToggle = document.getElementById('bridge-tile-cache-toggle');
        const statsEl = document.getElementById('bridge-cache-stats-text');
        const hitrateEl = document.getElementById('bridge-cache-hitrate-text');
        if (statsEl) statsEl.textContent = 'Cached: 142 tiles (18.4 MB / 2048 MB)';
        if (hitrateEl) hitrateEl.textContent = 'Hit Rate: 78.5%';
        if (cacheToggle) {
          cacheToggle.checked = false;
          cacheToggle.dispatchEvent(new Event('change'));
        }
      });
      await page.waitForTimeout(1000);

      // Re-enable toggle
      await page.evaluate(() => {
        const cacheToggle = document.getElementById('bridge-tile-cache-toggle');
        if (cacheToggle) {
          cacheToggle.checked = true;
          cacheToggle.dispatchEvent(new Event('change'));
        }
      });
      await page.waitForTimeout(1000);

      // 4. Click purge cache button
      await page.evaluate(() => {
        const clearBtn = document.getElementById('bridge-cache-clear-btn');
        if (clearBtn) clearBtn.click();
      });
      await page.waitForTimeout(1200);

      // 5. Close companion panel
      await page.evaluate(() => {
        const closeBtn = document.getElementById('companion-close') || document.querySelector('#companion-host-panel .drawer-close');
        if (closeBtn) closeBtn.click();
        const panel = document.getElementById('companion-host-panel');
        if (panel) panel.classList.add('hidden');
      });
      await centerMapOnPoint(page, DEFAULT_LAT, DEFAULT_LON);
      await page.waitForTimeout(1000);

      // 6. Open Intro Guide Hub / What's New tab to show v1.137.0 highlights
      await page.evaluate(() => {
        const qsBtn = document.getElementById('quickstart-help-btn');
        if (qsBtn) qsBtn.click();
        const featuresTab = document.getElementById('intro-tab-features');
        if (featuresTab) featuresTab.click();
        const qsModal = document.getElementById('quickstart-modal');
        if (qsModal) qsModal.classList.remove('hidden');
      });
      await page.waitForTimeout(2000);

      // 7. Close Intro Guide Hub
      await page.evaluate(() => {
        const qsModal = document.getElementById('quickstart-modal');
        if (qsModal) qsModal.classList.add('hidden');
      });
      await centerMapOnPoint(page, DEFAULT_LAT, DEFAULT_LON);
      await page.waitForTimeout(800);
    }
  },
  {
    id: 'feature_sse_streaming',
    name: 'Real-Time SSE Streams for Companion Bridge & Remote ID (Issue #114)',
    description: 'Real-time Server-Sent Events (SSE) sub-second streaming for Remote ID drone radar, RC 2 link status, and media progress with live transport badging and zero-polling architecture.',
    issueRef: 'Issue #114',
    run: async (page) => {
      // 1. Center squarely on default rural location (Utica, IL)
      await centerMapOnPoint(page, DEFAULT_LAT, DEFAULT_LON);
      await page.waitForTimeout(800);

      // 2. Open Companion Bridge Drawer / Status Section to demonstrate live transport badge
      await page.evaluate(() => {
        if (typeof updateCompanionTransportUI === 'function') {
          updateCompanionTransportUI('sse');
        }
        const sDot = document.getElementById('companion-service-dot');
        const sText = document.getElementById('companion-service-text');
        if (sDot) sDot.style.background = '#22c55e';
        if (sText) {
          sText.textContent = 'Aalaapi Bridge: Connected (SSE)';
          sText.style.color = '#22c55e';
        }
      });
      await page.waitForTimeout(1200);

      // 3. Open Remote ID calibration panel to display remote-id transport badge
      await page.evaluate(() => {
        if (typeof RemoteIdRadar !== 'undefined' && RemoteIdRadar.updateStreamTransportUI) {
          RemoteIdRadar.streamMode = 'sse';
          RemoteIdRadar.updateStreamTransportUI();
        }
        const calPanel = document.getElementById('remote-id-calibration-panel');
        if (calPanel) calPanel.classList.remove('hidden');
      });
      await page.waitForTimeout(1400);

      // 4. Close calibration panel
      await page.evaluate(() => {
        const calPanel = document.getElementById('remote-id-calibration-panel');
        if (calPanel) calPanel.classList.add('hidden');
      });
      await page.waitForTimeout(600);

      // 5. Open Intro Guide Hub to show v1.138.0 What's New bullet
      await page.evaluate(() => {
        const qsBtn = document.getElementById('quickstart-help-btn');
        if (qsBtn) qsBtn.click();
        const featuresTab = document.getElementById('intro-tab-features');
        if (featuresTab) featuresTab.click();
        const qsModal = document.getElementById('quickstart-modal');
        if (qsModal) qsModal.classList.remove('hidden');
      });
      await page.waitForTimeout(1800);

      // 6. Close Intro Guide Hub
      await page.evaluate(() => {
        const qsModal = document.getElementById('quickstart-modal');
        if (qsModal) qsModal.classList.add('hidden');
      });
      await centerMapOnPoint(page, DEFAULT_LAT, DEFAULT_LON);
      await page.waitForTimeout(800);
    }
  },
  {
    id: 'feature_short_viewport_scrolling',
    name: 'Viewport-Bounded Scrolling on Popovers and Waypoint Editor Popups',
    issueRef: '#113',
    run: async (page) => {
      // Rule 8 & 9: Default rural location
      await centerMapOnPoint(page, DEFAULT_LAT, DEFAULT_LON);
      await page.waitForTimeout(600);

      // 1. Emulate a short screen viewport (height: 520px)
      await page.setViewportSize({ width: 1200, height: 520 });
      await page.waitForTimeout(600);

      // 2. Open Floating Telemetry & Weather Popover
      await page.evaluate(() => {
        const popover = document.getElementById('telemetry-weather-popover');
        if (popover) {
          popover.classList.remove('hidden');
          popover.scrollTop = 0;
        }
      });
      await page.waitForTimeout(1000);

      // 3. Smooth scroll down through flight stats, weather station, solar card, and NOTAMs
      await page.evaluate(async () => {
        const popover = document.getElementById('telemetry-weather-popover');
        if (popover) {
          for (let i = 0; i < popover.scrollHeight; i += 25) {
            popover.scrollTop = i;
            await new Promise(r => setTimeout(r, 20));
          }
        }
      });
      await page.waitForTimeout(1200);

      // Scroll popover back to top and close
      await page.evaluate(() => {
        const popover = document.getElementById('telemetry-weather-popover');
        if (popover) {
          popover.scrollTop = 0;
          popover.classList.add('hidden');
        }
      });
      await page.waitForTimeout(600);

      // 4. Open 2D Waypoint Editor Leaflet Popup on the map
      await page.evaluate(() => {
        const dummyWp = {
          lat: 41.3215,
          lon: -88.9950,
          alt: 50,
          pitch: -60,
          speed: 5,
          hoverTime: 0,
          turnMode: 'inherit',
          cameraAction: 'inherit',
          layerPattern: 'grid'
        };

        const popupWrapper = document.createElement('div');
        popupWrapper.id = 'demo-wp-popup';
        popupWrapper.className = 'leaflet-popup wp-editor-leaflet-popup';
        popupWrapper.style.position = 'fixed';
        popupWrapper.style.top = '20px';
        popupWrapper.style.right = '40px';
        popupWrapper.style.zIndex = '9999';

        const contentWrapper = document.createElement('div');
        contentWrapper.className = 'leaflet-popup-content-wrapper';

        const content = document.createElement('div');
        content.className = 'leaflet-popup-content';

        const editorDOM = typeof createWaypointEditorDOM === 'function'
          ? createWaypointEditorDOM(dummyWp, 0, null, null)
          : document.createElement('div');

        content.appendChild(editorDOM);
        contentWrapper.appendChild(content);
        popupWrapper.appendChild(contentWrapper);
        document.body.appendChild(popupWrapper);
      });
      await page.waitForTimeout(1000);

      // 5. Smooth scroll down inside the Waypoint Editor popup to reveal lower action buttons
      await page.evaluate(async () => {
        const popup = document.querySelector('#demo-wp-popup .leaflet-popup-content-wrapper');
        if (popup) {
          for (let i = 0; i < popup.scrollHeight; i += 20) {
            popup.scrollTop = i;
            await new Promise(r => setTimeout(r, 25));
          }
        }
      });
      await page.waitForTimeout(1400);

      // Clean up demo popup and restore standard viewport
      await page.evaluate(() => {
        const p = document.getElementById('demo-wp-popup');
        if (p) document.body.removeChild(p);
      });
      await page.setViewportSize({ width: 1440, height: 900 });
      await centerMapOnPoint(page, DEFAULT_LAT, DEFAULT_LON);
      await page.waitForTimeout(800);
    }
  },
  {
    id: 'mcp_server_monitor',
    name: 'Native Model Context Protocol (MCP) Server & Companion Node Monitor Grid',
    issueRef: 'Issue #94, v1.139.0',
    description: 'Demonstrates MCP Node Monitor Grid, live tool discovery pills, metrics tracking, and 1-click Gemini CLI setup in the Companion Bridge container.',
    run: async (page) => {
      // 1. Center map squarely on Utica, IL
      await centerMapOnPoint(page, DEFAULT_LAT, DEFAULT_LON);
      await page.waitForTimeout(800);

      // 2. Scroll sidebar down to Companion Sync Container & MCP Node Monitor Grid
      await page.evaluate(() => {
        const companionSection = document.getElementById('companion-sync-container');
        if (companionSection) {
          companionSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
      await page.waitForTimeout(1000);

      // 3. Update MCP Monitor UI with live active metrics
      await page.evaluate(() => {
        if (typeof updateMcpMonitorUI === 'function') {
          updateMcpMonitorUI({
            status: 'online',
            protocolVersion: '2024-11-05',
            activeSessions: 2,
            readFrames: 14,
            writeFrames: 6,
            lastTool: 'generate_flight_plan',
            tools: [
              'get_airspace_telemetry',
              'generate_flight_plan',
              'trigger_bridge_action',
              'get_latest_bad_mission',
              'list_bad_missions',
              'set_multivendor_mode',
              'convert_mission_format'
            ]
          }, true);
        }
        const sDot = document.getElementById('companion-service-dot');
        const sText = document.getElementById('companion-service-text');
        if (sDot) sDot.style.background = '#22c55e';
        if (sText) {
          sText.textContent = 'Aalaapi Bridge: Connected (SSE)';
          sText.style.color = '#22c55e';
        }
      });
      await page.waitForTimeout(1800);

      // 4. Click the Copy Gemini CLI Command button
      await page.evaluate(() => {
        const copyBtn = document.getElementById('mcp-copy-cli-btn');
        if (copyBtn) copyBtn.click();
      });
      await page.waitForTimeout(1500);

      // 5. Open Intro Guide Hub to show v1.139.0 Feature Highlights
      await page.evaluate(() => {
        const qsBtn = document.getElementById('quickstart-help-btn');
        if (qsBtn) qsBtn.click();
        const featuresTab = document.getElementById('intro-tab-features');
        if (featuresTab) featuresTab.click();
        const qsModal = document.getElementById('quickstart-modal');
        if (qsModal) qsModal.classList.remove('hidden');
      });
      await page.waitForTimeout(2000);

      // 6. Close Intro Guide Hub and re-center map
      await page.evaluate(() => {
        const qsModal = document.getElementById('quickstart-modal');
        if (qsModal) qsModal.classList.add('hidden');
      });
      await centerMapOnPoint(page, DEFAULT_LAT, DEFAULT_LON);
      await page.waitForTimeout(800);
    }
  },
  {
    id: 'feature_preflight_gate',
    name: 'Database-Backed Preflight Safety Checklist Engine & Export Gate',
    issueRef: 'Issue #99',
    run: async (page) => {
      // 1. Center map
      await centerMapOnPoint(page, DEFAULT_LAT, DEFAULT_LON);
      await page.waitForTimeout(1000);

      // 2. Click Preflight Gate badge to open Preflight Safety Checklist wizard modal
      await page.evaluate(() => {
        const btn = document.getElementById('preflight-gate-btn');
        if (btn) btn.click();
      });
      await page.waitForTimeout(1500);

      // 3. Step 1: Automated Checks -> Click Next Step button
      await page.evaluate(() => {
        const nextBtn = document.getElementById('preflight-next-btn');
        if (nextBtn) nextBtn.click();
      });
      await page.waitForTimeout(1500);

      // 4. Step 2: Physical Hardware Checks -> Check hardware items & Click Next Step
      await page.evaluate(() => {
        const cb = document.querySelector('#preflight-modal input[type="checkbox"]');
        if (cb) cb.checked = true;
        const nextBtn = document.getElementById('preflight-next-btn');
        if (nextBtn) nextBtn.click();
      });
      await page.waitForTimeout(1500);

      // 5. Step 3: Airspace & LAANC -> Fill LAANC & Click Next Step
      await page.evaluate(() => {
        const laanc = document.getElementById('preflight-laanc-input');
        if (laanc) laanc.value = 'LAANC-998822';
        const nextBtn = document.getElementById('preflight-next-btn');
        if (nextBtn) nextBtn.click();
      });
      await page.waitForTimeout(1500);

      // 6. Step 4: PIC Signature -> Fill operator name & sign
      await page.evaluate(() => {
        const op = document.getElementById('preflight-operator-input');
        if (op) op.value = 'Pilot Jane Doe';
        if (typeof signPreflightChecklist === 'function') {
          signPreflightChecklist();
        }
      });
      await page.waitForTimeout(2000);

      // 7. Open Preflight History drawer
      await page.evaluate(() => {
        const histBtn = document.getElementById('preflight-history-btn');
        if (histBtn) histBtn.click();
      });
      await page.waitForTimeout(2000);

      // 8. Close modals and re-center map
      await page.evaluate(() => {
        const hist = document.getElementById('preflight-history-modal');
        if (hist) hist.classList.add('hidden');
        const modal = document.getElementById('preflight-modal');
        if (modal) modal.classList.add('hidden');
      });
      await centerMapOnPoint(page, DEFAULT_LAT, DEFAULT_LON);
      await page.waitForTimeout(1000);
    }
  },
  {
    id: 'road_follow_delete_waypoint',
    name: 'Road Follow Direct Waypoint Deletion Without Freeform Conversion',
    issueRef: 'v1.141.0',
    run: async (page) => {
      // 1. Center squarely on Utica default rural location
      await centerMapOnPoint(page, DEFAULT_LAT, DEFAULT_LON);
      await page.waitForTimeout(1000);

      // 2. Select Road Following Pattern
      await selectPattern(page, 'road-following');
      await page.waitForTimeout(1000);

      // 3. Add road centerline nodes
      await page.evaluate(({ lat, lon }) => {
        const layer = typeof getActiveLayer === 'function' ? getActiveLayer() : null;
        if (layer) {
          layer.pattern = 'road-following';
          layer.roadWaypoints = [
            { lat: lat, lon: lon, idx: 0 },
            { lat: lat + 0.001, lon: lon + 0.001, idx: 1 },
            { lat: lat + 0.002, lon: lon + 0.002, idx: 2 }
          ];
          roadWaypoints = layer.roadWaypoints;
        }
        if (typeof updateGrid === 'function') updateGrid();
      }, { lat: DEFAULT_LAT, lon: DEFAULT_LON });
      await page.waitForTimeout(1500);

      // 4. Delete middle drone waypoint directly while maintaining road-following
      await page.evaluate(() => {
        if (typeof generatedWaypoints !== 'undefined' && generatedWaypoints.length > 1) {
          const targetWp = generatedWaypoints[1];
          if (typeof deleteFlightWaypoint === 'function') {
            deleteFlightWaypoint(targetWp, 1);
          }
        }
      });
      await page.waitForTimeout(2000);
      await centerMapOnPoint(page, DEFAULT_LAT, DEFAULT_LON);
      await page.waitForTimeout(1000);
    }
  },
  {
    id: 'road_pattern_switch',
    name: 'Road-Following to Grid Pattern Switch & Waypoint Isolation',
    description: 'Demonstrates cleanly switching from Road-Following to Single Photogrammetry Grid, verifying complete road control node teardown and zero waypoint bleed.',
    issueRef: 'v1.166.1',
    run: async (page) => {
      // 1. Center squarely on Utica default rural location
      await centerMapOnPoint(page, DEFAULT_LAT, DEFAULT_LON);
      await page.waitForTimeout(800);

      // 2. Select Road Following Pattern
      await selectPattern(page, 'road-following');
      await page.waitForTimeout(800);

      // 3. Add road centerline nodes with high altitude & custom pitch
      await page.evaluate(({ lat, lon }) => {
        const layer = typeof getActiveLayer === 'function' ? getActiveLayer() : null;
        if (layer) {
          layer.pattern = 'road-following';
          layer.altitude = 50;
          layer.gimbalPitch = -80;
          layer.roadWaypoints = [
            { lat: lat, lon: lon, idx: 0 },
            { lat: lat + 0.001, lon: lon + 0.001, idx: 1 },
            { lat: lat + 0.002, lon: lon + 0.002, idx: 2 }
          ];
          roadWaypoints = layer.roadWaypoints;
        }
        if (typeof updateGrid === 'function') updateGrid();
      }, { lat: DEFAULT_LAT, lon: DEFAULT_LON });
      await page.waitForTimeout(1500);

      // 4. Switch from Road-Following to Single Nadir Grid
      await selectPattern(page, 'single');
      await page.waitForTimeout(1500);
      await centerMapOnPoint(page, DEFAULT_LAT, DEFAULT_LON);
      await page.waitForTimeout(1000);
    }
  },
  {
    id: 'feature_3d_plane_wireframe',
    name: 'Plane-Aware 3D Edge Finder & Multi-View Surface Extraction',
    description: 'RANSAC 3D architectural plane fitting, ray-to-plane snapping, adjacent plane-plane intersection synthesis, and translucent surface mesh toggle.',
    issueRef: 'Issue #122',
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

      // 2. Switch to 3D View Tab
      await page.evaluate(() => {
        const tab = Array.from(document.querySelectorAll('.diag-tab-btn, button')).find(b => b.textContent && b.textContent.includes('3D'));
        if (tab) tab.click();
      });
      await page.waitForTimeout(1000);

      // 3. Load synthetic architectural wireframe package with fitted planes
      await page.evaluate(() => {
        if (typeof DigitalTwin !== 'undefined' && DigitalTwin.loadWireframeGeometry) {
          const pkg = {
            lines: [
              [[0, 0, 0], [10, 0, 0]],
              [[10, 0, 0], [10, 8, 0]],
              [[10, 8, 0], [0, 8, 0]],
              [[0, 8, 0], [0, 0, 0]],
              [[0, 0, 5], [10, 0, 5]],
              [[10, 0, 5], [10, 8, 5]],
              [[10, 8, 5], [0, 8, 5]],
              [[0, 8, 5], [0, 0, 5]],
              [[0, 0, 0], [0, 0, 5]],
              [[10, 0, 0], [10, 0, 5]],
              [[10, 8, 0], [10, 8, 5]],
              [[0, 8, 0], [0, 8, 5]],
              [[5, 4, 8], [0, 0, 5]],
              [[5, 4, 8], [10, 0, 5]],
              [[5, 4, 8], [10, 8, 5]],
              [[5, 4, 8], [0, 8, 5]]
            ],
            planes: [
              { id: 'P0', classification: 'ground', normal: [0, 0, 1], d: 0, polygon: [[0, 0, 0], [10, 0, 0], [10, 8, 0], [0, 8, 0]] },
              { id: 'P1', classification: 'wall', normal: [0, -1, 0], d: 0, polygon: [[0, 0, 0], [10, 0, 0], [10, 0, 5], [0, 0, 5]] },
              { id: 'P2', classification: 'wall', normal: [0, 1, 0], d: -8, polygon: [[0, 8, 0], [10, 8, 0], [10, 8, 5], [0, 8, 5]] },
              { id: 'P3', classification: 'roof', normal: [0, -0.6, 0.8], d: -2.4, polygon: [[0, 0, 5], [10, 0, 5], [5, 4, 8]] },
              { id: 'P4', classification: 'roof', normal: [0, 0.6, 0.8], d: -7.2, polygon: [[0, 8, 5], [10, 8, 5], [5, 4, 8]] }
            ],
            linePlanes: [
              ['P0', 'P1'], ['P0'], ['P0', 'P2'], ['P0'],
              ['P1', 'P3'], ['P3'], ['P2', 'P4'], ['P4'],
              ['P1'], ['P1'], ['P2'], ['P2'],
              ['P3'], ['P3'], ['P4'], ['P4']
            ]
          };
          DigitalTwin.loadWireframeGeometry(pkg);
        }
      });
      await page.waitForTimeout(1500);

      // 4. Select a line to display the adjacent plane badge readout in HUD
      await page.evaluate(() => {
        if (typeof DigitalTwin !== 'undefined' && DigitalTwin.selectWireframeLine) {
          DigitalTwin.selectWireframeLine(0);
        }
      });
      await page.waitForTimeout(1500);

      // 5. Toggle plane surfaces off and back on
      await page.evaluate(() => {
        const toggleBtn = document.getElementById('diag-btn-toggle-planes');
        if (toggleBtn) toggleBtn.click();
      });
      await page.waitForTimeout(1200);
      await page.evaluate(() => {
        const toggleBtn = document.getElementById('diag-btn-toggle-planes');
        if (toggleBtn) toggleBtn.click();
      });
      await page.waitForTimeout(1500);

      // 6. Close Flight Diagnostics
      await page.evaluate(() => {
        const close = document.getElementById('close-flight-diagnostics-btn') || document.querySelector('#flight-diagnostics-drawer .close-btn') || document.querySelector('#flight-diagnostics-modal .modal-close');
        if (close) close.click();
      });
      await centerMapOnPoint(page);
      await page.waitForTimeout(500);
    }
  },
  {
    id: 'feature_hyperlapse',
    name: 'Hyperlapse Flight Pattern & Gimbal Sweep (Issue #102)',
    description: 'Generates automated hyperlapse moving time-lapse path with interval photo capture and pitch/yaw gimbal keyframe sweep.',
    issueRef: 'Issue #102',
    run: async (page) => {
      // 1. Select Hyperlapse pattern
      await selectPattern(page, 'hyperlapse');
      await centerMapOnPoint(page, DEFAULT_LAT, DEFAULT_LON);
      await page.waitForTimeout(600);

      // 2. Add sample waypoints to hyperlapse route
      await page.evaluate(({ baseLat, baseLon }) => {
        if (typeof addFreeformWaypoint === 'function') {
          addFreeformWaypoint(baseLat - 0.001, baseLon - 0.001, 50, 0, -30);
          addFreeformWaypoint(baseLat + 0.001, baseLon + 0.001, 60, 90, -10);
        }
      }, { baseLat: DEFAULT_LAT, baseLon: DEFAULT_LON });
      await centerMapOnPoint(page, DEFAULT_LAT, DEFAULT_LON);
      await page.waitForTimeout(800);

      // 3. Adjust interval slider in Section 2
      await fillInput(page, '#hyperlapse-interval', '2');
      await page.waitForTimeout(600);

      // 4. Scroll telemetry HUD into view
      await page.evaluate(() => {
        const hud = document.getElementById('hyperlapse-telemetry-hud');
        if (hud) hud.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
      await page.waitForTimeout(800);
      await centerMapOnPoint(page, DEFAULT_LAT, DEFAULT_LON);
    }
  },
  {
    id: 'hyperlapse_dense_waypoints',
    name: 'Hyperlapse Discrete Frame Waypoints for RC 2 (v1.167.0)',
    description: 'Demonstrates compiling all interval photo capture positions into explicit discrete waypoints visible on the RC 2 with curved transitions and reachPoint photo actions.',
    issueRef: 'v1.167.0',
    run: async (page) => {
      // 1. Center squarely on Utica default rural location
      await centerMapOnPoint(page, DEFAULT_LAT, DEFAULT_LON);
      await page.waitForTimeout(600);

      // 2. Select Hyperlapse pattern
      await selectPattern(page, 'hyperlapse');
      await page.waitForTimeout(600);

      // 3. Add transit waypoints (start and end)
      await page.evaluate(({ lat, lon }) => {
        const layer = typeof getActiveLayer === 'function' ? getActiveLayer() : null;
        if (layer) {
          layer.pattern = 'hyperlapse';
          layer.altitude = 24;
          layer.gimbalPitch = 0;
          layer.hyperlapseInterval = 3;
          layer.hyperlapseWaypointMode = 'dense';
          layer.freeformWaypoints = [
            { lat: lat, lon: lon, x: 0, y: 0, alt: 24, isModified: false },
            { lat: lat - 0.00035, lon: lon + 0.0001, x: 6.4, y: -39.6, alt: 24, isModified: false }
          ];
        }
        if (typeof updateGrid === 'function') updateGrid();
      }, { lat: DEFAULT_LAT, lon: DEFAULT_LON });
      await page.waitForTimeout(1500);

      // 4. Toggle between Discrete Frames and Keyframe Spline mode
      await page.evaluate(() => {
        const modeSelect = document.getElementById('hyperlapse-waypoint-mode');
        if (modeSelect) {
          modeSelect.value = 'spline';
          modeSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      await page.waitForTimeout(1500);

      await page.evaluate(() => {
        const modeSelect = document.getElementById('hyperlapse-waypoint-mode');
        if (modeSelect) {
          modeSelect.value = 'dense';
          modeSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      await page.waitForTimeout(1500);
      await centerMapOnPoint(page, DEFAULT_LAT, DEFAULT_LON);
      await page.waitForTimeout(1000);
    }
  },
  {
    id: 'bridge_version_sync',
    name: 'Companion Bridge Version Synchronization & Auto-Restart (v1.147.2)',
    description: 'Demonstrates automated version mismatch detection between the web app and Companion Bridge, displaying amber warning alert with 1-click Auto-Restart capability.',
    issueRef: 'Bridge Version Sync',
    run: async (page) => {
      // 1. Center map squarely on default coordinates
      await centerMapOnPoint(page, DEFAULT_LAT, DEFAULT_LON);
      await page.waitForTimeout(600);

      // 2. Expand Section 4 (Export / Sync) and scroll companion container into view
      await page.evaluate(() => {
        const syncCont = document.getElementById('companion-sync-container');
        if (syncCont) {
          syncCont.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
      await page.waitForTimeout(800);

      // 3. Simulate companion bridge status with mismatched version (v1.144.0 vs app v1.147.2)
      await page.evaluate(() => {
        if (typeof applyCompanionStatusUI === 'function') {
          applyCompanionStatusUI({
            status: 'online',
            connected: true,
            droneConnected: false,
            version: '1.144.0',
            activePort: 'COM3'
          });
        }
      });
      await page.waitForTimeout(1500);

      // 4. Hover over the Auto-Restart Bridge button to highlight interaction
      const restartBtn = await page.$('#companion-restart-btn');
      if (restartBtn) {
        await restartBtn.hover();
      }
      await page.waitForTimeout(1000);

      // 5. Simulate resolution to synchronized version 1.147.2
      await page.evaluate(() => {
        if (typeof applyCompanionStatusUI === 'function') {
          applyCompanionStatusUI({
            status: 'online',
            connected: true,
            droneConnected: false,
            version: '1.147.2',
            activePort: 'COM3'
          });
        }
      });
      await page.waitForTimeout(1500);

      // 6. Return map view to center
      await centerMapOnPoint(page, DEFAULT_LAT, DEFAULT_LON);
      await page.waitForTimeout(800);
    }
  },
  {
    id: 'adsb_aircraft_icons',
    name: 'Distinct ADS-B Aircraft Type Icons (Helicopter, Jet, Prop)',
    description: 'Demonstrates aerospace-accurate distinct SVG icons on 2D Leaflet map and drawer chips for Helicopter (rotorcraft), Jet, and Propeller traffic.',
    issueRef: 'Issue #124',
    run: async (page) => {
      // 1. Center map squarely on default coordinates
      await centerMapOnPoint(page, DEFAULT_LAT, DEFAULT_LON);
      await page.waitForTimeout(600);

      // 2. Open ADS-B drawer and enable tracking
      await page.evaluate(() => {
        if (window.AdsbAirspaceManager) {
          window.AdsbAirspaceManager.enabled = true;
          window.AdsbAirspaceManager.toggleDrawer(true);
        }
      });
      await page.waitForTimeout(800);

      // 3. Simulate Propeller (Cessna 172) traffic
      await page.evaluate(() => {
        if (window.AdsbAirspaceManager) {
          window.AdsbAirspaceManager.simulateAircraft('prop');
        }
      });
      await page.waitForTimeout(1200);

      // 4. Simulate Helicopter (Rescue / Bell 407) traffic
      await page.evaluate(() => {
        if (window.AdsbAirspaceManager) {
          window.AdsbAirspaceManager.simulateAircraft('helicopter');
        }
      });
      await page.waitForTimeout(1200);

      // 5. Simulate Jet (Commercial Airliner / B738) traffic
      await page.evaluate(() => {
        if (window.AdsbAirspaceManager) {
          window.AdsbAirspaceManager.simulateAircraft('jet');
        }
      });
      await page.waitForTimeout(1500);

      // 6. Hover over the drawer cards to show chips
      const drawerList = await page.$('#adsb-aircraft-list');
      if (drawerList) {
        await drawerList.hover();
      }
      await page.waitForTimeout(1000);

      // 7. Re-center map squarely on default location
      await centerMapOnPoint(page, DEFAULT_LAT, DEFAULT_LON);
      await page.waitForTimeout(1000);
    }
  },
  {
    id: 'bridge_top_nav',
    name: 'Top Navigation Bridge Status Info Node & Popout Drawer',
    description: 'Demonstrates persistent top navigation bridge pill, real-time hardware status dot, popout monitor drawer, and streamlined Section 4 bar.',
    issueRef: 'Issue #128',
    run: async (page) => {
      // 1. Center map squarely on default coordinates
      await centerMapOnPoint(page, DEFAULT_LAT, DEFAULT_LON);
      await page.waitForTimeout(600);

      // 2. Click the Topbar Bridge Status Pill to open popout drawer
      const bridgePill = await page.$('#header-bridge-pill');
      if (bridgePill) {
        await bridgePill.click();
      }
      await page.waitForTimeout(1200);

      // 3. Simulate companion bridge status update (Online + RC 2 connected)
      await page.evaluate(() => {
        if (typeof applyCompanionStatusUI === 'function') {
          applyCompanionStatusUI({
            connected: true,
            deviceName: 'DJI RC 2 (MTP)',
            version: '1.149.0',
            activeMissions: ['test-mission-uuid']
          });
        }
      });
      await page.waitForTimeout(1500);

      // 4. Close the popout drawer via close button
      const closeBtn = await page.$('#bridge-popover-close-btn');
      if (closeBtn) {
        await closeBtn.click();
      }
      await page.waitForTimeout(800);

      // 5. Scroll Section 4 into view and open drawer via sidebar "Monitor" button
      const sidebarOpenBtn = await page.$('#sidebar-open-bridge-popover-btn');
      if (sidebarOpenBtn) {
        await sidebarOpenBtn.click();
      }
      await page.waitForTimeout(1500);

      // 6. Dismiss via Escape key
      await page.keyboard.press('Escape');
      await page.waitForTimeout(800);

      // 7. Re-center map squarely on default rural coordinates
      await centerMapOnPoint(page, DEFAULT_LAT, DEFAULT_LON);
      await page.waitForTimeout(1000);
    }
  },
  {
    id: 'feature_light_art',
    name: 'Light Art & Sky Painting Continuous Long Exposure Flight Pattern',
    issueRef: 'Issue #136',
    description: 'Demonstrates continuous non-hovering, non-stopping Light Art flight pattern with long exposure shutter sync and zero internal photo triggers.',
    run: async (page) => {
      // 1. Initial setup squarely on default rural coordinates
      await centerMapOnPoint(page, DEFAULT_LAT, DEFAULT_LON);
      await page.waitForTimeout(1000);

      // 2. Select Light Art pattern
      await selectPattern(page, 'light-art');
      await page.waitForTimeout(1500);

      // 3. Switch through presets: Helix, Star, Heart, Spiral
      const presetSelect = await page.$('#light-art-preset');
      if (presetSelect) {
        await presetSelect.selectOption('helix');
        await page.waitForTimeout(1200);
        await presetSelect.selectOption('star');
        await page.waitForTimeout(1200);
        await presetSelect.selectOption('heart');
        await page.waitForTimeout(1200);
        await presetSelect.selectOption('spiral');
        await page.waitForTimeout(1500);
      }

      // 4. Demonstrate 3D Canvas Tilt & Compass Rose (v1.182.0)
      const orientationSelect = await page.$('#light-art-orientation');
      if (orientationSelect) {
        await orientationSelect.selectOption('tilted');
        await page.waitForTimeout(1000);
      }

      // Tap 45° tilt preset
      const tilt45 = await page.$('.light-art-tilt-preset-btn[data-tilt="45"]');
      if (tilt45) {
        await tilt45.click();
        await page.waitForTimeout(1000);
      }

      // Tap East (90°) camera bearing chip
      const eastChip = await page.$('.light-art-az-chip[data-az="90"]');
      if (eastChip) {
        await eastChip.click();
        await page.waitForTimeout(1000);
      }

      // 5. Verify center marker and trajectory squarely centered
      await centerMapOnPoint(page, DEFAULT_LAT, DEFAULT_LON);
      await page.waitForTimeout(2000);
    }
  },
  {
    id: 'feature_vertical_facade',
    name: 'Vertical Facade Grid for Planar Infrastructure Inspection',
    issueRef: 'Issue #132',
    description: 'Demonstrates planar vertical boustrophedon lawnmower inspection pattern with standoff distance, horizontal/vertical scan modes, and perpendicular heading lock.',
    run: async (page) => {
      // 1. Initial setup squarely on default rural coordinates
      await centerMapOnPoint(page, DEFAULT_LAT, DEFAULT_LON);
      await page.waitForTimeout(1000);

      // 2. Select Vertical Facade pattern
      await selectPattern(page, 'vertical-facade');
      await page.waitForTimeout(1500);

      // 3. Adjust Standoff, Width, and Height
      await fillInput(page, '#facade-standoff', '18');
      await page.waitForTimeout(600);
      await fillInput(page, '#facade-width', '45');
      await page.waitForTimeout(600);
      await fillInput(page, '#facade-height', '25');
      await page.waitForTimeout(1000);

      // 4. Toggle scan mode to Vertical Columns
      const scanModeSelect = await page.$('#facade-scan-mode');
      if (scanModeSelect) {
        await scanModeSelect.selectOption('vertical');
        await page.waitForTimeout(1200);
        await scanModeSelect.selectOption('horizontal');
        await page.waitForTimeout(1000);
      }

      // 5. Ensure squarely centered
      await centerMapOnPoint(page, DEFAULT_LAT, DEFAULT_LON);
      await page.waitForTimeout(1500);
    }
  },
  {
    id: 'feature_continuous_helix',
    name: 'Continuous Helix / Spiral Corkscrew Orbit Inspection',
    issueRef: 'Issue #133',
    description: 'Demonstrates continuous fluid corkscrew ascent/descent with cylindrical and conical tapering, dynamic pitch sweep, and curved turn path.',
    run: async (page) => {
      // 1. Initial setup squarely on default rural coordinates
      await centerMapOnPoint(page, DEFAULT_LAT, DEFAULT_LON);
      await page.waitForTimeout(1000);

      // 2. Select Continuous Helix pattern
      await selectPattern(page, 'continuous-helix');
      await page.waitForTimeout(1500);

      // 3. Adjust start and end radius (conical tapering)
      await fillInput(page, '#helix-radius-start', '30');
      await page.waitForTimeout(600);
      await fillInput(page, '#helix-radius-end', '15');
      await page.waitForTimeout(600);
      await fillInput(page, '#helix-turns', '3.5');
      await page.waitForTimeout(1000);

      // 4. Adjust Pitch Sweep
      await fillInput(page, '#helix-pitch-start', '-15');
      await page.waitForTimeout(600);
      await fillInput(page, '#helix-pitch-end', '-60');
      await page.waitForTimeout(1200);

      // 5. Ensure squarely centered
      await centerMapOnPoint(page, DEFAULT_LAT, DEFAULT_LON);
      await page.waitForTimeout(1500);
    }
  },
  {
    id: 'feature_star_pass',
    name: 'Cross-Hatch / Star Pass Convergent POI Inspection',
    issueRef: 'Issue #131',
    description: 'Demonstrates multi-axis radial spoke flights intersecting at central inspection target with convergent camera angles, apex nadir catch, and perimeter transit hops.',
    run: async (page) => {
      // 1. Initial setup squarely on default rural coordinates
      await centerMapOnPoint(page, DEFAULT_LAT, DEFAULT_LON);
      await page.waitForTimeout(1000);

      // 2. Select Star Pass pattern
      await selectPattern(page, 'star-pass');
      await page.waitForTimeout(1500);

      // 3. Configure Spokes and Standoff Radius
      await fillInput(page, '#star-pass-spokes', '4');
      await page.waitForTimeout(600);
      await fillInput(page, '#star-pass-radius', '40');
      await page.waitForTimeout(600);

      // 4. Toggle Apex Nadir Catch and Heading Mode
      const apexCheck = await page.$('#star-pass-apex-nadir');
      if (apexCheck) {
        await apexCheck.click();
        await page.waitForTimeout(500);
        await apexCheck.click();
        await page.waitForTimeout(500);
      }

      // 5. Ensure squarely centered
      await centerMapOnPoint(page, DEFAULT_LAT, DEFAULT_LON);
      await page.waitForTimeout(1500);
    }
  },
  {
    id: 'feature_photo_sphere_stationary',
    name: 'Dedicated 360° Spherical Panorama Stationary Capture Engine',
    issueRef: 'Issue #134',
    description: 'Demonstrates stationary action group execution at single waypoint with configurable ring densities (8/10/12), settling delay, and AEB exposure bracketing.',
    run: async (page) => {
      // 1. Initial setup squarely on default rural coordinates
      await centerMapOnPoint(page, DEFAULT_LAT, DEFAULT_LON);
      await page.waitForTimeout(1000);

      // 2. Select Photo Sphere pattern
      await selectPattern(page, 'photo-sphere');
      await page.waitForTimeout(1500);

      // 3. Select Stationary Action Group execution mode
      const modeSelect = await page.$('#photo-sphere-mode');
      if (modeSelect) {
        await modeSelect.selectOption('actionGroup');
        await page.waitForTimeout(600);
      }

      // 4. Adjust density and settling time slider
      const densitySelect = await page.$('#photo-sphere-shots-per-ring');
      if (densitySelect) {
        await densitySelect.selectOption('10');
        await page.waitForTimeout(600);
        await densitySelect.selectOption('12');
        await page.waitForTimeout(600);
      }

      await fillInput(page, '#photo-sphere-settling-time', '2.5');
      await page.waitForTimeout(600);

      // 5. Toggle AEB Exposure Bracketing
      const aebCheck = await page.$('#photo-sphere-aeb');
      if (aebCheck) {
        await aebCheck.click();
        await page.waitForTimeout(1000);
      }

      // 6. Ensure squarely centered
      await centerMapOnPoint(page, DEFAULT_LAT, DEFAULT_LON);
      await page.waitForTimeout(1500);
    }
  },
  {
    id: 'feature_hyperlapse_ultra_slow',
    name: 'Dedicated Waypoint Hyperlapse Ultra-Slow Continuous Interval Capture',
    issueRef: 'Issue #135',
    description: 'Demonstrates granular sub-knot flight speeds down to 0.1 m/s with live sidebar duration/frame calculator badge and sub-meter photo projection.',
    run: async (page) => {
      // 1. Initial setup squarely on default rural coordinates
      await centerMapOnPoint(page, DEFAULT_LAT, DEFAULT_LON);
      await page.waitForTimeout(1000);

      // 2. Select Hyperlapse pattern
      await selectPattern(page, 'hyperlapse');
      await page.waitForTimeout(1500);

      // 3. Set ultra-slow flight speed (0.2 m/s) and interval (2s)
      await fillInput(page, '#speed', '0.2');
      await page.waitForTimeout(600);
      await fillInput(page, '#hyperlapse-interval', '2');
      await page.waitForTimeout(1000);

      // 4. Ensure squarely centered
      await centerMapOnPoint(page, DEFAULT_LAT, DEFAULT_LON);
      await page.waitForTimeout(1500);
    }
  },
  {
    id: 'feature_corridor_mapping',
    name: 'Multi-Pass Corridor Mapping along Complex Linear Features',
    issueRef: 'Issue #130',
    description: 'Demonstrates multi-pass linear corridor generator with miter angle clamping, symmetric parallel offset swaths, turnaround overshoot loops, and interactive centerline editing.',
    run: async (page) => {
      // 1. Initial setup squarely on default rural coordinates
      await centerMapOnPoint(page, DEFAULT_LAT, DEFAULT_LON);
      await page.waitForTimeout(1000);

      // 2. Select Corridor Mapping pattern
      await selectPattern(page, 'corridor');
      await page.waitForTimeout(1500);

      // 3. Configure Corridor Width, Passes, and Overshoot
      await fillInput(page, '#corridor-width', '80');
      await page.waitForTimeout(600);
      await fillInput(page, '#corridor-passes', '3');
      await page.waitForTimeout(600);
      await fillInput(page, '#corridor-overshoot', '25');
      await page.waitForTimeout(800);

      // 4. Switch turnaround style between bulb, arc, and direct
      const turnSelect = await page.$('#corridor-turn-type');
      if (turnSelect) {
        await turnSelect.selectOption('arc');
        await page.waitForTimeout(700);
        await turnSelect.selectOption('direct');
        await page.waitForTimeout(700);
        await turnSelect.selectOption('bulb');
        await page.waitForTimeout(700);
      }

      // 5. Add custom centerline points
      await page.evaluate(() => {
        if (typeof addCorridorPoint === 'function') {
          addCorridorPoint(41.3215, -88.9950);
          addCorridorPoint(41.3230, -88.9920);
          addCorridorPoint(41.3245, -88.9900);
        }
      });
      await page.waitForTimeout(1000);

      // 6. Enter Centerline Edit Mode and demonstrate sidebar node coordinate table
      const editToggleBtn = await page.$('#corridor-edit-toggle-btn');
      if (editToggleBtn) {
        await editToggleBtn.click();
        await page.waitForTimeout(1000);
      }

      // 7. Click Add Node button in sidebar
      const addNodeBtn = await page.$('#corridor-add-vertex-btn');
      if (addNodeBtn) {
        await addNodeBtn.click();
        await page.waitForTimeout(1000);
      }

      // 8. Exit Centerline Edit Mode
      if (editToggleBtn) {
        await editToggleBtn.click();
        await page.waitForTimeout(1000);
      }

      // 9. Ensure squarely centered on default rural coordinates
      await centerMapOnPoint(page, DEFAULT_LAT, DEFAULT_LON);
      await page.waitForTimeout(1500);
    }
  },
  {
    id: 'historical_flight_db_offline',
    name: 'Historical Flight DB Offline Availability & Bridge Setup Guidance',
    issueRef: 'v1.157.1',
    run: async (page) => {
      // 1. Ensure default rural location is squarely centered
      await centerMapOnPoint(page, DEFAULT_LAT, DEFAULT_LON);
      await page.waitForTimeout(600);

      // 2. Expand Section 0 if collapsed
      const section0Toggle = await page.$('#mission-db-section-header');
      if (section0Toggle) {
        const isCollapsed = await page.evaluate(() => {
          const content = document.getElementById('mission-db-content');
          return content && content.style.display === 'none';
        });
        if (isCollapsed) {
          await section0Toggle.click();
          await page.waitForTimeout(600);
        }
      }

      // 3. Highlight the DB Offline badge and Section 0 header
      await page.evaluate(() => {
        const badge = document.getElementById('mission-db-count-badge');
        if (badge) {
          badge.style.outline = '2px solid #ef4444';
          badge.style.boxShadow = '0 0 12px rgba(239, 68, 68, 0.6)';
        }
      });
      await page.waitForTimeout(1000);

      // 4. Scroll into view and highlight the Flight DB Unavailable card
      await page.evaluate(() => {
        const card = document.getElementById('mission-db-unavailable-card');
        if (card) {
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
      await page.waitForTimeout(1200);

      // 5. Click the copy command button to show interactive feedback
      const copyBtn = await page.$('#mission-db-copy-cmd-btn');
      if (copyBtn) {
        await copyBtn.click();
        await page.waitForTimeout(1000);
      }

      // 6. Click the Setup Guide button to display companion service setup instructions
      const guideBtn = await page.$('#mission-db-guide-btn');
      if (guideBtn) {
        await guideBtn.click();
        await page.waitForTimeout(1500);

        // Close guide modal
        const closeBtn = await page.$('#close-guide-btn');
        if (closeBtn) {
          await closeBtn.click();
          await page.waitForTimeout(800);
        }
      }

      // 7. Click Retry Connection button
      const retryBtn = await page.$('#mission-db-retry-btn');
      if (retryBtn) {
        await retryBtn.click();
        await page.waitForTimeout(1000);
      }

      // 8. Re-center map cleanly on default rural point
      await centerMapOnPoint(page, DEFAULT_LAT, DEFAULT_LON);
      await page.waitForTimeout(1000);
    }
  },
  {
    id: 'feature_mission_flight_time_epoch',
    name: 'Mission Flight Time & Epoch Synchronization',
    description: 'Controls mission flight epoch, interacts with topbar time pill, configures planned schedule with solar presets, and manages flight temporal modes.',
    issueRef: 'v1.158.0',
    run: async (page) => {
      // 1. Re-center cleanly on default rural location
      await centerMapOnPoint(page, DEFAULT_LAT, DEFAULT_LON);
      await page.waitForTimeout(600);

      // 2. Click the topbar Mission Time Pill to open the popover
      const timePill = await page.$('#header-mission-time-pill');
      if (timePill) {
        await timePill.click();
        await page.waitForTimeout(800);
      }

      // 3. Switch to 'Planned' flight mode
      const plannedBtn = await page.$('#btn-time-mode-planned');
      if (plannedBtn) {
        await plannedBtn.click();
        await page.waitForTimeout(700);
      }

      // 4. Click Solar Noon preset
      const noonBtn = await page.$('#btn-preset-solar-noon');
      if (noonBtn) {
        await noonBtn.click();
        await page.waitForTimeout(900);
      }

      // 5. Click Golden Hour preset
      const goldenBtn = await page.$('#btn-preset-golden-hour');
      if (goldenBtn) {
        await goldenBtn.click();
        await page.waitForTimeout(900);
      }

      // 6. Click +1h quick step preset
      const plusHourBtn = await page.$('#btn-preset-plus-hour');
      if (plusHourBtn) {
        await plusHourBtn.click();
        await page.waitForTimeout(700);
      }

      // 7. Switch to 'Live' mode to demonstrate real-time clock tracking
      const liveBtn = await page.$('#btn-time-mode-live');
      if (liveBtn) {
        await liveBtn.click();
        await page.waitForTimeout(700);
      }

      // 8. Switch back to 'Planned' mode
      if (plannedBtn) {
        await plannedBtn.click();
        await page.waitForTimeout(700);
      }

      // 9. Close the popover via the close button or re-clicking pill
      const closeBtn = await page.$('#btn-close-mission-time-popover');
      if (closeBtn) {
        await closeBtn.click();
      } else if (timePill) {
        await timePill.click();
      }
      await page.waitForTimeout(800);

      // 10. Re-center map cleanly on default rural point
      await centerMapOnPoint(page, DEFAULT_LAT, DEFAULT_LON);
      await page.waitForTimeout(600);
    }
  },
  {
    id: 'feature_4d_flight_replay',
    name: 'Omnidimensional 4D Flight Replay Engine & Rolling Buffer Architecture',
    description: 'Demonstrates 4D flight replay with synchronous ADS-B & Remote ID traffic, dynamic cross-track drift error, 3D exclusion zone breach checking, and ambient buffer HUD monitoring popover.',
    issueRef: 'Issue #142 (v1.160.0)',
    run: async (page) => {
      // 1. Re-center cleanly on default rural location (Data Privacy Rule 8 & 9)
      await centerMapOnPoint(page, DEFAULT_LAT, DEFAULT_LON);
      await page.waitForTimeout(600);

      // 2. Click Topbar Buffer Pill to open Buffer Monitor popover
      await page.evaluate(() => {
        const pill = document.getElementById('header-ambient-buffer-pill');
        if (pill) pill.click();
      });
      await page.waitForTimeout(800);

      // Update buffer metrics with mock traffic
      await page.evaluate(() => {
        if (typeof AmbientBufferManager !== 'undefined') {
          AmbientBufferManager.updateBufferHud({
            totalMemoryBytes: 4200000,
            formattedMemory: '4.01 MB',
            totalPackets: 3200,
            activeAirspaceDrones: 2,
            activeAdsbAircraft: 3,
            radarFramesCached: 4,
            isMemoryPressure: false,
            capacityPercentage: 40
          });
        }
      });
      await page.waitForTimeout(1000);

      // Close buffer popover
      await page.evaluate(() => {
        const closeBtn = document.getElementById('buffer-popover-close-btn');
        if (closeBtn) closeBtn.click();
      });
      await page.waitForTimeout(600);

      // 3. Launch 2D Flight Replay with simulated 4D multi-dataset telemetry
      await page.evaluate(() => {
        if (typeof PlaybackManager !== 'undefined') {
          const baseTime = Date.now();
          const mockTelemetry = {
            flightDate: new Date(baseTime).toISOString(),
            points: [
              { lat: 41.3215, lon: -88.9950, alt: 30, speed: 4.5, yaw: 0, time: 0, timestamp: new Date(baseTime).toISOString() },
              { lat: 41.3225, lon: -88.9940, alt: 40, speed: 5.5, yaw: 45, time: 10, timestamp: new Date(baseTime + 10000).toISOString() },
              { lat: 41.3235, lon: -88.9930, alt: 50, speed: 6.5, yaw: 90, time: 20, timestamp: new Date(baseTime + 20000).toISOString() },
              { lat: 41.3245, lon: -88.9920, alt: 50, speed: 6.0, yaw: 90, time: 30, timestamp: new Date(baseTime + 30000).toISOString() }
            ]
          };

          const plannedWps = [
            { lat: 41.3215, lon: -88.9950, alt: 30 },
            { lat: 41.3245, lon: -88.9920, alt: 50 }
          ];

          const envData = {
            adsb: [
              { icao: 'A12B34', callsign: 'REPLAY1', timestamp: baseTime + 10000, lat: 41.3228, lon: -88.9938, alt: 300, heading: 180, speed: 120 }
            ],
            remoteId: [
              { id: 'DRONE-RID-01', timestamp: baseTime + 10000, lat: 41.3222, lon: -88.9942, alt: 42, speed: 5 }
            ],
            radar: [
              { timestamp: baseTime, tileUrl: '' }
            ]
          };

          PlaybackManager.loadFlight('4d-demo-flight', mockTelemetry, {
            name: '4D Environmental Airspace Replay',
            isHistorical: true,
            plannedWaypoints: plannedWps,
            environmentalData: envData
          });
          PlaybackManager.set2dReplayActive(true);
        }
      });
      await page.waitForTimeout(1200);

      // 4. Scrub timeline to middle (10s in)
      await page.evaluate(() => {
        if (typeof PlaybackManager !== 'undefined') {
          PlaybackManager.seekTo(0.5, { isFraction: true });
        }
      });
      await page.waitForTimeout(1500);

      // 5. Play replay smoothly for 2 seconds
      await page.evaluate(() => {
        if (typeof PlaybackManager !== 'undefined') {
          PlaybackManager.play();
        }
      });
      await page.waitForTimeout(2000);

      // 6. Pause replay
      await page.evaluate(() => {
        if (typeof PlaybackManager !== 'undefined') {
          PlaybackManager.pause();
        }
      });
      await page.waitForTimeout(800);

      // 7. Close 2D Replay bar
      const closeReplayBtn = await page.$('#replay-2d-close-btn');
      if (closeReplayBtn) {
        await closeReplayBtn.click();
        await page.waitForTimeout(800);
      }

      // 8. Re-center cleanly on default rural location
      await centerMapOnPoint(page, DEFAULT_LAT, DEFAULT_LON);
      await page.waitForTimeout(600);
    }
  },
  {
    id: 'topbar_ribbon',
    name: 'Topbar Cleanup, Unified System Group & Top Ribbon Customizer',
    description: 'Customizable top menu ribbon, unified bridge/buffer status group, compact search pin, and version tag in About modal.',
    issueRef: 'v1.161.0',
    run: async (page) => {
      // 1. Center map on default rural location
      await centerMapOnPoint(page, DEFAULT_LAT, DEFAULT_LON);
      await page.waitForTimeout(600);

      // 2. Open More menu and launch Ribbon Customizer
      const moreBtn = await page.$('#header-more-btn');
      if (moreBtn) {
        await moreBtn.click();
        await page.waitForTimeout(600);
        const customizeBtn = await page.$('#more-menu-customize-ribbon-btn');
        if (customizeBtn) {
          await customizeBtn.click();
          await page.waitForTimeout(800);
        }
      }

      // 3. Test preset selection in Settings modal
      const presetSelect = await page.$('#ribbon-preset-select');
      if (presetSelect) {
        await presetSelect.selectOption('compact');
        await page.waitForTimeout(800);
        await presetSelect.selectOption('studio');
        await page.waitForTimeout(800);
        await presetSelect.selectOption('standard');
        await page.waitForTimeout(800);
      }

      // 4. Close settings modal
      const closeSettings = await page.$('#close-config-btn');
      if (closeSettings) {
        await closeSettings.click();
        await page.waitForTimeout(600);
      }

      // 5. Open About modal to demonstrate high-contrast version display
      const aboutBtn = await page.$('#about-btn');
      if (aboutBtn && await aboutBtn.isVisible()) {
        await aboutBtn.click();
        await page.waitForTimeout(1000);
        const closeAbout = await page.$('#close-about-btn');
        if (closeAbout) {
          await closeAbout.click();
          await page.waitForTimeout(600);
        }
      }

      // 6. Inspect unified bridge/buffer status group
      const bridgePill = await page.$('#header-bridge-pill');
      if (bridgePill) {
        await bridgePill.click();
        await page.waitForTimeout(800);
      }
    }
  },
  {
    id: 'feature_video_cast',
    name: 'Low-Latency Video Casting & Local Lossless MP4 Recording (Issue #97)',
    description: 'Real-time WebSocket video casting to responsive canvas, source switching, REC pulsing button, duration timer, and 3D FPV HUD viewfinder overlay.',
    issueRef: 'Issue #97',
    run: async (page) => {
      // 1. Center map on default rural location (Utica, IL)
      await centerMapOnPoint(page, DEFAULT_LAT, DEFAULT_LON);
      await page.waitForTimeout(600);

      // 2. Open Video Cast Panel from Section 4 launcher
      await page.evaluate(() => {
        const btn = document.getElementById('sidebar-video-cast-btn');
        if (btn) btn.click();

        // Update RTMP banner with simulated active LAN ingest
        if (window.videoCastClient) {
          window.videoCastClient.updateRtmpUI({
            primaryUrl: 'rtmp://192.168.1.44:1935/live/stream',
            firewall: { open: true, message: 'Port 1935 open' },
            activeStreams: [{ publisherIp: '192.168.1.88', durationSec: 15 }]
          });
        }
      });
      await page.waitForTimeout(1000);

      // 2b. Test clicking the 📋 Copy RTMP URL button
      await page.evaluate(() => {
        const copyBtn = document.getElementById('video-cast-copy-rtmp-btn');
        if (copyBtn) copyBtn.click();
      });
      await page.waitForTimeout(1000);

      // 3. Switch stream source to test pattern
      await page.evaluate(() => {
        const sel = document.getElementById('video-cast-source-select');
        if (sel) {
          sel.value = 'test';
          sel.dispatchEvent(new Event('change'));
        }
      });
      await page.waitForTimeout(800);

      // 4. Trigger REC recording
      await page.evaluate(() => {
        if (window.videoCastClient) {
          window.videoCastClient.setRecordingState(true, 1);
        }
      });
      await page.waitForTimeout(2000);

      // 5. Stop REC recording
      await page.evaluate(() => {
        if (window.videoCastClient) {
          window.videoCastClient.setRecordingState(false, 0);
        }
      });
      await page.waitForTimeout(800);

      // 6. Open Recorded Clips Modal
      await page.evaluate(() => {
        const galleryBtn = document.getElementById('video-cast-gallery-btn');
        if (galleryBtn) galleryBtn.click();
      });
      await page.waitForTimeout(1200);

      // 7. Close Clips Modal
      await page.evaluate(() => {
        const modal = document.getElementById('video-recordings-modal');
        if (modal) modal.classList.add('hidden');
      });
      await page.waitForTimeout(600);

      // 8. Minimize & restore Video Cast Panel
      await page.evaluate(() => {
        const minBtn = document.getElementById('video-cast-minimize-btn');
        if (minBtn) minBtn.click();
      });
      await page.waitForTimeout(800);

      await page.evaluate(() => {
        const minBtn = document.getElementById('video-cast-minimize-btn');
        if (minBtn) minBtn.click();
      });
      await page.waitForTimeout(800);

      // 9. Open 3D FPV HUD to showcase Live Viewfinder overlay & HUD REC button
      await page.evaluate(() => {
        const fpvBtn = document.getElementById('btn-3d-fpv');
        if (fpvBtn) fpvBtn.click();
        const threeModal = document.getElementById('three-preview-modal');
        if (threeModal) threeModal.classList.remove('hidden');
        const hud = document.getElementById('fpv-hud-overlay');
        if (hud) hud.classList.remove('hidden');
      });
      await page.waitForTimeout(2000);

      // 10. Close FPV view and re-center map
      await page.evaluate(() => {
        const threeModal = document.getElementById('three-preview-modal');
        if (threeModal) threeModal.classList.add('hidden');
        const hud = document.getElementById('fpv-hud-overlay');
        if (hud) hud.classList.add('hidden');
      });
      await centerMapOnPoint(page, DEFAULT_LAT, DEFAULT_LON);
      await page.waitForTimeout(800);
    }
  }  ,
  {
    id: 'feature_satellite_cloud_cover',
    name: 'Satellite Cloud Cover (IR) Overlay',
    description: 'Real-time NOAA GOES Infrared Channel 13 satellite cloud cover layer over rural flight area.',
    issueRef: 'v1.173.1 Fix',
    run: async (page) => {
      // 1. Center map squarely on default rural coordinates
      await centerMapOnPoint(page, DEFAULT_LAT, DEFAULT_LON);
      await page.waitForTimeout(600);

      // 2. Enable Satellite Cloud Cover overlay
      await page.evaluate(() => {
        if (typeof map !== 'undefined' && typeof cloudCoverLayer !== 'undefined') {
          if (!map.hasLayer(cloudCoverLayer)) {
            cloudCoverLayer.addTo(map);
          }
        }
      });
      await page.waitForTimeout(1500);

      // 3. Zoom out to zoom 5 to view regional cloud cover
      await page.evaluate(() => {
        if (typeof map !== 'undefined') map.setZoom(5);
      });
      await page.waitForTimeout(1500);

      // 4. Zoom in to zoom 7
      await page.evaluate(() => {
        if (typeof map !== 'undefined') map.setZoom(7);
      });
      await page.waitForTimeout(1500);

      // 5. Re-center map at zoom 6
      await page.evaluate(() => {
        if (typeof map !== 'undefined') {
          map.setView([41.3215, -88.9950], 6);
        }
      });
      await page.waitForTimeout(1000);
    }
  },
  {
    id: 'feature_adaptive_hardware_sync',
    name: 'Adaptive Hardware Sync (WebUSB & Bridge)',
    description: 'Dynamic platform detection, direct WebUSB MTP sync buttons for Android OTG, and desktop companion bridge.',
    issueRef: 'Issue #115',
    run: async (page) => {
      // 1. Center map on default rural coordinates
      await centerMapOnPoint(page, DEFAULT_LAT, DEFAULT_LON);
      await page.waitForTimeout(600);

      // 2. Open Bridge Status Popover from topbar
      const bridgePill = await page.locator('#header-bridge-pill');
      if (await bridgePill.isVisible()) {
        await bridgePill.click();
        await page.waitForTimeout(1000);
      }

      // 3. Highlight WebUSB direct actions container
      await page.evaluate(() => {
        const webusbCont = document.getElementById('webusb-direct-actions');
        if (webusbCont) {
          webusbCont.style.display = 'flex';
          webusbCont.style.outline = '2px solid #22c55e';
        }
      });
      await page.waitForTimeout(1500);

      // 4. Highlight WebUSB Push KMZ button
      await page.evaluate(() => {
        const syncBtn = document.getElementById('webusb-sync-btn');
        if (syncBtn) syncBtn.style.outline = '2px solid #4ade80';
      });
      await page.waitForTimeout(1000);

      // 5. Open Guide modal to Android tab
      const hint = await page.locator('#companion-offline-hint');
      if (await hint.isVisible()) {
        await hint.click();
        await page.waitForTimeout(1200);

        const androidTab = await page.locator('button.guide-tab-btn[data-tab="android"]');
        if (await androidTab.isVisible()) {
          await androidTab.click();
          await page.waitForTimeout(1800);
        }

        const closeBtn = await page.locator('#close-guide-btn');
        if (await closeBtn.isVisible()) {
          await closeBtn.click();
          await page.waitForTimeout(800);
        }
      }
    }
  },
  {
    id: 'feature_nd_filter_advisor',
    name: 'Camera ND Filter Recommendation & Exposure Advisor',
    description: 'Topbar weather pill badge, popover telemetry card, and interactive glassmorphic ND Filter Advisor modal.',
    issueRef: 'v1.176.0',
    run: async (page) => {
      // 1. Center map squarely on default rural coordinates
      await centerMapOnPoint(page, DEFAULT_LAT, DEFAULT_LON);
      await page.waitForTimeout(600);

      // 2. Highlight and click the Topbar ND Filter badge
      const ndBadge = await page.locator('#header-nd-filter-badge');
      if (await ndBadge.isVisible()) {
        await page.evaluate(() => {
          const el = document.getElementById('header-nd-filter-badge');
          if (el) el.style.outline = '2px solid #38bdf8';
        });
        await page.waitForTimeout(800);
        await ndBadge.click();
        await page.waitForTimeout(1000);
      }

      // 3. Interact with ND Advisor Modal: switch from Cinematic to Photogrammetry
      const photoBtn = await page.locator('button.nd-mode-tab-btn[data-nd-mode="photogrammetry"]');
      if (await photoBtn.isVisible()) {
        await photoBtn.click();
        await page.waitForTimeout(800);
      }

      // 4. Switch to Long Exposure
      const longExpBtn = await page.locator('button.nd-mode-tab-btn[data-nd-mode="long_exposure"]');
      if (await longExpBtn.isVisible()) {
        await longExpBtn.click();
        await page.waitForTimeout(800);
      }

      // 5. Switch back to Cinematic Video
      const cinemaBtn = await page.locator('button.nd-mode-tab-btn[data-nd-mode="cinematic"]');
      if (await cinemaBtn.isVisible()) {
        await cinemaBtn.click();
        await page.waitForTimeout(800);
      }

      // 6. Close modal
      const closeBtn = await page.locator('#close-nd-filter-modal-btn');
      if (await closeBtn.isVisible()) {
        await closeBtn.click();
        await page.waitForTimeout(800);
      }

      // 7. Open Weather Popover to demonstrate popover ND Filter card
      const weatherPill = await page.locator('#header-telemetry-pill');
      if (await weatherPill.isVisible()) {
        await weatherPill.click();
        await page.waitForTimeout(1200);
        const closePopBtn = await page.locator('#telemetry-popover-close-btn');
        if (await closePopBtn.isVisible()) {
          await closePopBtn.click();
          await page.waitForTimeout(500);
        }
      }
    }
  },
  {
    id: 'feature_draggable_modals',
    name: 'Universal Draggable Modal Windows & Position Persistence',
    description: 'Interactive mouse/touch dragging of modal windows by header, position retention across open/close to clear waypoints, and double-click re-centering.',
    issueRef: 'v1.181.0',
    run: async (page) => {
      await centerMapOnPoint(page, DEFAULT_LAT, DEFAULT_LON);
      await page.waitForTimeout(600);

      // 1. Open the About Modal
      const aboutBtn = await page.locator('#about-btn');
      if (await aboutBtn.isVisible()) {
        await aboutBtn.click();
        await page.waitForTimeout(800);
      }

      // 2. Perform smooth mouse drag on the header
      const header = await page.locator('#about-modal .modal-header');
      if (await header.isVisible()) {
        const box = await header.boundingBox();
        if (box) {
          const startX = box.x + box.width / 2;
          const startY = box.y + box.height / 2;

          await page.mouse.move(startX, startY);
          await page.mouse.down();
          await page.waitForTimeout(200);

          // Drag modal to the right and down to reveal center map
          await page.mouse.move(startX + 180, startY + 120, { steps: 20 });
          await page.waitForTimeout(300);
          await page.mouse.up();
          await page.waitForTimeout(800);

          // 3. Close the modal
          const closeBtn = await page.locator('#about-modal .close-btn');
          if (await closeBtn.isVisible()) {
            await closeBtn.click();
            await page.waitForTimeout(800);
          }

          // 4. Reopen About Modal to demonstrate session position persistence (waypoints stay visible!)
          if (await aboutBtn.isVisible()) {
            await aboutBtn.click();
            await page.waitForTimeout(1000);
          }

          // 5. Double-click the header to demonstrate instant re-centering
          await page.mouse.dblclick(startX + 180, startY + 120);
          await page.waitForTimeout(1200);

          // 6. Close modal
          if (await closeBtn.isVisible()) {
            await closeBtn.click();
            await page.waitForTimeout(600);
          }
        }
      }

      // 7. Open Live Video Cast Panel and demonstrate floating dragging
      const videoCastBtn = await page.locator('#sidebar-video-cast-btn');
      if (await videoCastBtn.isVisible()) {
        await videoCastBtn.click();
        await page.waitForTimeout(800);

        const videoHeader = await page.locator('#video-cast-panel .video-cast-header');
        if (await videoHeader.isVisible()) {
          const vBox = await videoHeader.boundingBox();
          if (vBox) {
            const vStartX = vBox.x + vBox.width / 2;
            const vStartY = vBox.y + vBox.height / 2;

            await page.mouse.move(vStartX, vStartY);
            await page.mouse.down();
            await page.waitForTimeout(150);
            await page.mouse.move(vStartX - 220, vStartY + 160, { steps: 20 });
            await page.waitForTimeout(300);
            await page.mouse.up();
            await page.waitForTimeout(800);

            // Double click to re-center/reset
            await page.mouse.dblclick(vStartX - 220, vStartY + 160);
            await page.waitForTimeout(800);

            const vClose = await page.locator('#video-cast-close-btn');
            if (await vClose.isVisible()) {
              await vClose.click();
              await page.waitForTimeout(500);
            }
          }
        }
      }

      // 8. Open Elevation Profile Drawer and demonstrate bottom-anchored dragging
      const elevBtn = await page.locator('#open-elevation-profile-btn');
      if (await elevBtn.isVisible()) {
        await elevBtn.click();
        await page.waitForTimeout(800);

        const elevHeader = await page.locator('#elevation-profile-drawer .elevation-profile-header');
        if (await elevHeader.isVisible()) {
          const eBox = await elevHeader.boundingBox();
          if (eBox) {
            const eStartX = eBox.x + eBox.width / 2;
            const eStartY = eBox.y + eBox.height / 2;

            await page.mouse.move(eStartX, eStartY);
            await page.mouse.down();
            await page.waitForTimeout(150);
            await page.mouse.move(eStartX, eStartY - 150, { steps: 20 });
            await page.waitForTimeout(300);
            await page.mouse.up();
            await page.waitForTimeout(800);

            // Double click to reset
            await page.mouse.dblclick(eStartX, eStartY - 150);
            await page.waitForTimeout(800);

            const eClose = await page.locator('#close-elevation-profile-btn');
            if (await eClose.isVisible()) {
              await eClose.click();
              await page.waitForTimeout(500);
            }
          }
        }
      }
    }
  },
  {
    id: 'terrain_following_dem_aware_grid',
    name: 'Terrain Following (DEM-Aware Grid) for Constant AGL & GSD',
    description: 'Demonstrates DEM-aware terrain following, gradient smoothing, target AGL modulation, 2D elevation cross-section profiling, and 3D terrain relief visualization (Issue #129).',
    issueRef: '#129',
    run: async (page) => {
      // 1. Center map at default rural benchmark location [41.3215, -88.9950]
      await centerMapOnPoint(page, DEFAULT_LAT, DEFAULT_LON);
      await page.waitForTimeout(1000);

      // 2. Expand Section 2 (Layer Properties)
      const sec2Hdr = await page.locator('#grid-geometry-title');
      if (await sec2Hdr.isVisible()) {
        await sec2Hdr.click();
        await page.waitForTimeout(800);
      }

      // 3. Enable Terrain Following in Section 2
      await page.evaluate(() => {
        const tfSelect = document.getElementById('layer-terrain-follow');
        if (tfSelect) {
          tfSelect.value = 'enabled';
          tfSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      await page.waitForTimeout(1200);

      // 4. Open Elevation Cross-Section Profile Drawer
      const openProfileBtn = await page.locator('#open-elevation-profile-btn');
      if (await openProfileBtn.isVisible()) {
        await openProfileBtn.click();
        await page.waitForTimeout(1500);
      }

      // 5. Adjust Target AGL using quick preset pill (80m)
      const pill80 = await page.locator('.preset-pill-btn[data-agl="80"]');
      if (await pill80.isVisible()) {
        await pill80.click();
        await page.waitForTimeout(1200);
      }

      // 6. Launch 3D FPV HUD to showcase 3D Terrain Relief Mesh & Undulating Flight Path
      const fpvBtn = await page.locator('#fpv-btn, #view-3d-btn');
      if (await fpvBtn.first().isVisible()) {
        await fpvBtn.first().click();
        await page.waitForTimeout(2500);

        // Close 3D Viewport
        const close3d = await page.locator('#close-fpv-btn, #fpv-close-btn');
        if (await close3d.first().isVisible()) {
          await close3d.first().click();
          await page.waitForTimeout(1000);
        }
      }

      // 7. Dismiss Elevation Profile Drawer
      const closeProfileBtn = await page.locator('#close-elevation-profile-btn');
      if (await closeProfileBtn.isVisible()) {
        await closeProfileBtn.click();
        await page.waitForTimeout(800);
      }
    }
  },
  {
    id: 'feature_ai_3d_mesh',
    name: 'Bridge-Hosted AI 3D Reconstruction Architecture & Live Streaming',
    description: 'Demonstrates sparse drone photo ingestion, automated orthogonal N/S/E/W facade selection, dual-engine AI 3D mesh compilation, active progress bar, and Three.js 3D solid mesh streaming (Issue #96).',
    issueRef: '#96',
    run: async (page) => {
      // 1. Center map at default rural benchmark location [41.3215, -88.9950]
      await centerMapOnPoint(page, DEFAULT_LAT, DEFAULT_LON);
      await page.waitForTimeout(1000);

      // 2. Open 3D Flight Diagnostics & Digital Twin Viewport
      await page.evaluate(() => {
        if (typeof FlightDiagnostics !== 'undefined' && typeof FlightDiagnostics.open === 'function') {
          FlightDiagnostics.open('3d');
        }
      });
      await page.waitForTimeout(1500);

      // 3. Open 3D Wireframe & AI Reconstruction Toolkit Panel
      await page.evaluate(() => {
        const panel = document.getElementById('diag-wireframe-panel');
        if (panel) panel.style.display = 'block';
      });
      await page.waitForTimeout(1000);

      // 4. Trigger AI 3D Reconstruction
      await page.evaluate(() => {
        const btn = document.getElementById('diag-btn-generate-ai-mesh');
        if (btn) btn.click();
      });
      await page.waitForTimeout(2000);

      // 5. Adjust opacity slider
      await page.evaluate(() => {
        const slider = document.getElementById('diag-ai-mesh-opacity-slider');
        if (slider) {
          slider.value = '75';
          slider.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });
      await page.waitForTimeout(1200);

      // 6. Toggle Mesh Button in 3D HUD
      const toggleBtn = await page.locator('#diag-btn-toggle-mesh');
      if (await toggleBtn.isVisible()) {
        await toggleBtn.click();
        await page.waitForTimeout(800);
        await toggleBtn.click();
        await page.waitForTimeout(1000);
      }

      // 7. Close 3D Diagnostics
      await page.evaluate(() => {
        if (typeof FlightDiagnostics !== 'undefined' && typeof FlightDiagnostics.close === 'function') {
          FlightDiagnostics.close();
        }
      });
      await page.waitForTimeout(800);
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
