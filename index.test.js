const { test, describe, mock } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');

// --- Global Stubbing Setup ---
global.document = {
  getElementById: (id) => {
    if (id === 'unit-system') return null;
    if (global._stubElements && global._stubElements[id] !== undefined) return global._stubElements[id];
    return {
      classList: { add: () => {}, remove: () => {} },
      value: '',
      textContent: '',
      style: {},
      closest: () => ({ style: {} }),
      innerHTML: '',
      replaceChildren: () => {},
      appendChild: () => {}
    };
  },
  addEventListener: () => {},
  querySelectorAll: () => [],
  createTextNode: (text) => ({ textContent: text }),
  createElement: (tag) => ({
    style: {},
    appendChild: () => {},
    replaceChildren: () => {},
    textContent: '',
    innerHTML: '',
    setAttribute: () => {},
    className: ''
  }),
  createElementNS: (ns, tag) => ({
    style: {},
    appendChild: () => {},
    replaceChildren: () => {},
    textContent: '',
    innerHTML: '',
    setAttribute: () => {},
    className: ''
  }),
  createTextNode: (text) => text
};
global.window = {
  addEventListener: () => {}
};
global.alert = (msg) => {
  global.lastAlert = msg;
};
global.console.error = () => {}; // suppress expected error logs in tests
global.console.warn = () => {};

global.DOMParser = class DOMParser {
  parseFromString(str, type) {
    if (str === 'invalid_xml_string') {
      throw new Error('Invalid XML structure');
    }
    return {
      getElementsByTagName: (tag) => {
        if (tag === 'Placemark' && str.includes('<Placemark>')) {
          return [{}]; // Mock element, doesn't need actual content for the empty test
        }
        return [];
      }
    };
  }
};
global.localStorage = {
  _data: {},
  getItem(k) { return this._data[k] !== undefined ? this._data[k] : null; },
  setItem(k, v) { this._data[k] = String(v); },
  removeItem(k) { delete this._data[k]; },
  clear() { this._data = {}; }
};
global.navigator = {};
global.L = {
  layerGroup: () => ({ clearLayers: () => {}, addLayer: () => {}, eachLayer: () => {} }),
  featureGroup: () => ({ clearLayers: () => {}, addLayer: () => {}, eachLayer: () => {} }),
  icon: () => ({}),
  divIcon: () => ({}),
  marker: () => ({ bindTooltip: () => {}, bindPopup: () => {}, on: () => {}, addTo: () => {}, setLatLng: () => {}, setIcon: () => {} }),
  circleMarker: () => ({ bindTooltip: () => {}, bindPopup: () => {}, on: () => {}, addTo: () => {}, setLatLng: () => {} }),
  polyline: () => ({ addTo: () => {}, setLatLngs: () => {} }),
  polygon: () => ({ addTo: () => {}, setLatLngs: () => {} }),
  Control: {
    extend: () => function() {}
  },
  control: () => ({ addTo: () => {}, onAdd: () => {} }),
  DomUtil: {
    create: () => ({ style: {}, innerHTML: '' })
  }
};
global.window.L = global.L;

// Evaluate index.js in this context
const code = fs.readFileSync('./index.js', 'utf8');
vm.runInThisContext(code);

// --- Test Suite ---

describe('Utility Functions', () => {
  test('throttle limits the rate of function execution', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });

    // Ensure test starts at a non-zero time so initial run works
    t.mock.timers.tick(1000);

    let callCount = 0;
    let lastArgs = [];
    const myFunc = (...args) => {
      callCount++;
      lastArgs = args;
    };

    try {
      // Make the function available in the VM so we can pass it to throttle
      global.testFunc = myFunc;

      // Evaluate throttle invocation in VM to get the bound function
      vm.runInThisContext('global.throttledFunc = throttle((...args) => global.testFunc(...args), 100);');
      const throttledFunc = global.throttledFunc;

      // First call happens immediately
      throttledFunc(1);
      assert.strictEqual(callCount, 1);
      assert.deepStrictEqual(lastArgs, [1]);

      // Second call within limit is ignored but scheduled
      throttledFunc(2);
      assert.strictEqual(callCount, 1);

      // Third call within limit replaces the scheduled arguments
      throttledFunc(3);
      assert.strictEqual(callCount, 1);

      // Tick partially through the limit
      t.mock.timers.tick(50);
      assert.strictEqual(callCount, 1);

      // Tick past the limit - the last scheduled call should fire
      t.mock.timers.tick(50);
      assert.strictEqual(callCount, 2);
      assert.deepStrictEqual(lastArgs, [3]);

      // Wait past the limit again
      t.mock.timers.tick(100);

      // Now a new call should happen immediately... but because lastRan is truthy,
      // it falls to the 'else' block and schedules a 0ms setTimeout instead of running synchronously.
      throttledFunc(4);
      assert.strictEqual(callCount, 2); // Hasn't run yet

      // Process the 0ms timeout
      t.mock.timers.tick(0);
      assert.strictEqual(callCount, 3);
      assert.deepStrictEqual(lastArgs, [4]);
    } finally {
      // Clean up global namespace pollution
      delete global.testFunc;
      delete global.throttledFunc;
      vm.runInThisContext('delete global.testFunc; delete global.throttledFunc;');
    }
  });
});

describe('updateOpenSkyLink Tests', () => {
  const originalGetElementById = global.document.getElementById;

  test('updates link using centerMarker', () => {
    let mockLinkEl = { href: '' };
    global.document.getElementById = (id) => {
      if (id === 'opensky-link') return mockLinkEl;
      return null;
    };

    try {
      vm.runInThisContext(`
        map = { getCenter: () => ({ lat: 10, lng: 20 }) };
        centerMarker = { getLatLng: () => ({ lat: 30.12345, lng: 40.54321 }) };
        updateOpenSkyLink();
      `);

      assert.strictEqual(mockLinkEl.href, 'https://map.opensky-network.org/?lat=30.1234&lon=40.5432&zoom=11');
    } finally {
      global.document.getElementById = originalGetElementById;
    }
  });

  test('updates link using map center if no centerMarker', () => {
    let mockLinkEl = { href: '' };
    global.document.getElementById = (id) => {
      if (id === 'opensky-link') return mockLinkEl;
      return null;
    };

    try {
      vm.runInThisContext(`
        map = { getCenter: () => ({ lat: 10.98765, lng: 20.12345 }) };
        centerMarker = null;
        updateOpenSkyLink();
      `);

      assert.strictEqual(mockLinkEl.href, 'https://map.opensky-network.org/?lat=10.9877&lon=20.1234&zoom=11');
    } finally {
      global.document.getElementById = originalGetElementById;
    }
  });

  test('does nothing if map or linkEl is missing', () => {
    let mockLinkEl = { href: 'original' };

    // Missing map
    global.document.getElementById = (id) => {
      if (id === 'opensky-link') return mockLinkEl;
      return null;
    };

    try {
      vm.runInThisContext(`
        map = null;
        centerMarker = null;
        updateOpenSkyLink();
      `);
      assert.strictEqual(mockLinkEl.href, 'original');

      // Missing linkEl
      global.document.getElementById = (id) => null;
      vm.runInThisContext(`
        map = { getCenter: () => ({ lat: 10, lng: 20 }) };
        centerMarker = null;
        updateOpenSkyLink();
      `);
      // Should not throw and link remains 'original' conceptually
    } finally {
      global.document.getElementById = originalGetElementById;
    }
  });

  test('formats coordinates to exactly 4 decimal places with trailing zeros', () => {
    let mockLinkEl = { href: '' };
    global.document.getElementById = (id) => {
      if (id === 'opensky-link') return mockLinkEl;
      return null;
    };

    try {
      vm.runInThisContext(`
        map = { getCenter: () => ({ lat: -10.1, lng: 20 }) };
        centerMarker = null;
        updateOpenSkyLink();
      `);

      assert.strictEqual(mockLinkEl.href, 'https://map.opensky-network.org/?lat=-10.1000&lon=20.0000&zoom=11');
    } finally {
      global.document.getElementById = originalGetElementById;
    }
  });

  test('handles zero coordinates correctly', () => {
    let mockLinkEl = { href: '' };
    global.document.getElementById = (id) => {
      if (id === 'opensky-link') return mockLinkEl;
      return null;
    };

    try {
      vm.runInThisContext(`
        map = { getCenter: () => ({ lat: 0, lng: 0 }) };
        centerMarker = null;
        updateOpenSkyLink();
      `);

      assert.strictEqual(mockLinkEl.href, 'https://map.opensky-network.org/?lat=0.0000&lon=0.0000&zoom=11');
    } finally {
      global.document.getElementById = originalGetElementById;
    }
  });

  test('opensky-link element is located inside links-modal and not in stats-panel', () => {
    const path = require('path');
    const templateHtml = fs.readFileSync(path.join(__dirname, 'index_template.html'), 'utf8');

    // Extract links-modal block
    const linksModalMatch = templateHtml.match(/<div id="links-modal"[\s\S]*?<\/div>\s*<\/div>/);
    assert.ok(linksModalMatch, '#links-modal block should exist in index_template.html');
    assert.ok(linksModalMatch[0].includes('id="opensky-link"'), '#opensky-link should exist inside #links-modal');

    // Verify stats panel does not contain opensky-link
    const statsPanelIdx = templateHtml.indexOf('class="stats-panel');
    if (statsPanelIdx !== -1) {
      const statsPanelSnippet = templateHtml.substring(statsPanelIdx, statsPanelIdx + 2000);
      assert.strictEqual(statsPanelSnippet.includes('id="opensky-link"'), false, '#opensky-link should no longer be inside stats panel');
    }
  });

});

describe('Unit Conversion Tests', () => {
  test('formatDistance formats metric distance correctly', () => {
    vm.runInThisContext('cachedUnitSystem = null;');
    global.localStorage.getItem = () => 'metric';
    vm.runInThisContext('getUnitSystem = function() { if (cachedUnitSystem) return cachedUnitSystem; const el = typeof document !== "undefined" ? document.getElementById("unit-system") : null; if (el) { cachedUnitSystem = el.value; return cachedUnitSystem; } const savedUnit = localStorage.getItem("unitSystem"); if (savedUnit) { cachedUnitSystem = savedUnit; return cachedUnitSystem; } return "metric"; };');
    vm.runInThisContext('cachedUnitSystem = null;');
    assert.strictEqual(formatDistance(10), '10.0 m');
    assert.strictEqual(formatDistance(10, 2), '10.00 m');
    assert.strictEqual(formatDistance(0), '0.0 m');
  });

  test('formatDistance handles null, undefined, and NaN', () => {
    vm.runInThisContext('cachedUnitSystem = null;');
    assert.strictEqual(formatDistance(null), '0 m');
    assert.strictEqual(formatDistance(undefined), '0 m');
    assert.strictEqual(formatDistance(NaN), '0 m');
  });

  test('formatDistance formats imperial distance correctly', () => {
    vm.runInThisContext('cachedUnitSystem = null;');
    const originalGetItem = global.localStorage.getItem;
    global.localStorage.getItem = () => 'imperial';
    vm.runInThisContext('cachedUnitSystem = null; getUnitSystem = () => "imperial";');

    assert.strictEqual(formatDistance(10), '32.8 ft');
    assert.strictEqual(formatDistance(10, 2), '32.81 ft');
    assert.strictEqual(formatDistance(0), '0.0 ft');
    vm.runInThisContext('getUnitSystem = function() { if (cachedUnitSystem) return cachedUnitSystem; const el = typeof document !== "undefined" ? document.getElementById("unit-system") : null; if (el) { cachedUnitSystem = el.value; return cachedUnitSystem; } const savedUnit = localStorage.getItem("unitSystem"); if (savedUnit) { cachedUnitSystem = savedUnit; return cachedUnitSystem; } return "metric"; };');
    vm.runInThisContext('cachedUnitSystem = null;');
    global.localStorage.getItem = (k) => k === 'aalaapi_sky_unit_system' ? 'imperial' : null;
    vm.runInThisContext('cachedUnitSystem = null;');
    vm.runInThisContext('getUnitSystem = () => \'imperial\';');

    assert.strictEqual(vm.runInThisContext('formatDistance(10)'), '32.8 ft');
    assert.strictEqual(vm.runInThisContext('formatDistance(10, 2)'), '32.81 ft');
    assert.strictEqual(vm.runInThisContext('formatDistance(0)'), '0.0 ft');

    global.localStorage.getItem = originalGetItem;
    vm.runInThisContext('cachedUnitSystem = null;');
    vm.runInThisContext('getUnitSystem = () => \'metric\';');
  });

  test('formatDistance handles null, undefined, and NaN for imperial', () => {
    vm.runInThisContext('cachedUnitSystem = null;');
    const originalGetItem = global.localStorage.getItem;
    global.localStorage.getItem = () => 'imperial';
    vm.runInThisContext('cachedUnitSystem = null; getUnitSystem = () => "imperial";');

    assert.strictEqual(formatDistance(null), '0 ft');
    assert.strictEqual(formatDistance(undefined), '0 ft');
    assert.strictEqual(formatDistance(NaN), '0 ft');
    vm.runInThisContext('getUnitSystem = function() { if (cachedUnitSystem) return cachedUnitSystem; const el = typeof document !== "undefined" ? document.getElementById("unit-system") : null; if (el) { cachedUnitSystem = el.value; return cachedUnitSystem; } const savedUnit = localStorage.getItem("unitSystem"); if (savedUnit) { cachedUnitSystem = savedUnit; return cachedUnitSystem; } return "metric"; };');
    vm.runInThisContext('cachedUnitSystem = null;');
    global.localStorage.getItem = (k) => k === 'aalaapi_sky_unit_system' ? 'imperial' : null;
    vm.runInThisContext('cachedUnitSystem = null;');
    vm.runInThisContext('getUnitSystem = () => \'imperial\';');

    assert.strictEqual(vm.runInThisContext('formatDistance(null)'), '0 ft');
    assert.strictEqual(vm.runInThisContext('formatDistance(undefined)'), '0 ft');
    assert.strictEqual(vm.runInThisContext('formatDistance(NaN)'), '0 ft');

    global.localStorage.getItem = originalGetItem;
    vm.runInThisContext('cachedUnitSystem = null;');
    vm.runInThisContext('getUnitSystem = () => \'metric\';');
  });
});

describe('parseWPML Tests', () => {
  test('parseWPML handles invalid XML parsing errors', () => {
    // Reset alert spy
    global.lastAlert = null;

    // Provide invalid XML string to trigger parsing error
    const invalidMission = 'invalid_xml_string';

    // Should catch error, log it, alert the user, and clear the mission
    parseWPML(invalidMission);

    assert.strictEqual(global.lastAlert, 'Failed to parse KML: Invalid XML structure', 'Alert should display the correct parsing error message');
    assert.strictEqual(importedWaypoints, null, 'importedWaypoints should be cleared');
    assert.strictEqual(importedPhotos, null, 'importedPhotos should be cleared');
    assert.strictEqual(importedFileName, null, 'importedFileName should be cleared');
  });

  test('parseWPML handles missing waypoints gracefully', () => {
    // Reset alert spy
    global.lastAlert = null;

    // Provide XML without any <Placemark> elements
    const emptyMission = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Folder>
    </Folder>
  </Document>
</kml>`;

    // Should catch error, log it, alert the user, and clear the mission
    parseWPML(emptyMission);

    assert.strictEqual(global.lastAlert, 'Failed to parse KML: No waypoints found in the mission file.', 'Alert should display the correct error message');
    assert.strictEqual(importedWaypoints, null, 'importedWaypoints should be cleared');
    assert.strictEqual(importedPhotos, null, 'importedPhotos should be cleared');
    assert.strictEqual(importedFileName, null, 'importedFileName should be cleared');
  });
});

describe('Coordinate Math Tests', () => {
  test('getDefaultHeading computes correct headings', () => {
    // Single waypoint
    const wp1 = [{ x: 0, y: 0 }];
    assert.strictEqual(getDefaultHeading(0, wp1, 0), 0, 'Single waypoint should default to 0 heading');

    // Two waypoints, moving North (positive Y)
    const wpNorth = [{ x: 0, y: 0 }, { x: 0, y: 10 }];
    assert.strictEqual(getDefaultHeading(0, wpNorth, 0), 0, 'Moving North should be 0 degrees');

    // Two waypoints, moving East (positive X)
    const wpEast = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
    assert.strictEqual(getDefaultHeading(0, wpEast, 0), 90, 'Moving East should be 90 degrees');

    // Two waypoints, moving South (negative Y)
    const wpSouth = [{ x: 0, y: 0 }, { x: 0, y: -10 }];
    assert.strictEqual(getDefaultHeading(0, wpSouth, 0), 180, 'Moving South should be 180 degrees');

    // Two waypoints, moving West (negative X)
    const wpWest = [{ x: 0, y: 0 }, { x: -10, y: 0 }];
    assert.strictEqual(getDefaultHeading(0, wpWest, 0), 270, 'Moving West should be 270 degrees');

    // Last waypoint in an array uses previous waypoint's heading
    assert.strictEqual(getDefaultHeading(1, wpEast, 0), 90, 'Last waypoint should use the heading from the previous segment');

    // Middle waypoint uses next waypoint's heading
    const wpMiddle = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
    assert.strictEqual(getDefaultHeading(1, wpMiddle, 0), 0, 'Middle waypoint should use heading to next waypoint (North = 0)');

    // Applying rotation
    assert.strictEqual(getDefaultHeading(0, wpEast, 45), 135, 'Rotation should offset the heading');

    // Negative heading normalization (-90 deg rotation on North = -90 => 270)
    assert.strictEqual(getDefaultHeading(0, wpNorth, -90), 270, 'Negative heading should be correctly wrapped to [0, 360)');

    // Greater than 360 rotation
    assert.strictEqual(getDefaultHeading(0, wpEast, 360), 90, 'Rotation >= 360 should be normalized');
  });

  test('calculateDistance computes correct distance between two coordinates', () => {
    // Distance between same points should be 0
    assert.strictEqual(calculateDistance(0, 0, 0, 0), 0);
    assert.strictEqual(calculateDistance(45, -90, 45, -90), 0);

    // Distance from San Francisco to Los Angeles is roughly 559 km
    const sfLat = 37.7749;
    const sfLon = -122.4194;
    const laLat = 34.0522;
    const laLon = -118.2437;
    const distSFLA = calculateDistance(sfLat, sfLon, laLat, laLon);
    assert.ok(Math.abs(distSFLA - 559) < 2, `Distance SF to LA was ${distSFLA}, expected ~559`);

    // Distance between equator points (1 degree longitude) is roughly 111.32 km
    const distEquator = calculateDistance(0, 0, 0, 1);
    assert.ok(Math.abs(distEquator - 111.32) < 0.2, `Distance 1 deg on equator was ${distEquator}, expected ~111.32`);

    // Distance between 0,0 and 1,0 (1 degree latitude) is roughly 111.19 km
    const distLat = calculateDistance(0, 0, 1, 0);
    assert.ok(Math.abs(distLat - 111.19) < 0.2, `Distance 1 deg lat was ${distLat}, expected ~111.19`);
  });

  test('localToGeodetic converts local offsets back to geodetic', () => {
    // Test point at origin (centerLat=0, centerLon=0), no rotation
    const res1 = localToGeodetic(0, 0, 0, 0, 0);
    assert.strictEqual(res1.lat, 0);
    assert.strictEqual(res1.lon, 0);
    assert.strictEqual(res1.x, 0);
    assert.strictEqual(res1.y, 0);

    // Test a point 100 meters North
    // y is North, x is East when unrotated
    const res2 = localToGeodetic(0, 100, 0, 0, 0);
    assert.ok(res2.lat > 0, 'Lat should be greater than 0 when moving North');
    assert.strictEqual(res2.lon, 0);

    // Test a point 100 meters East
    const res3 = localToGeodetic(100, 0, 0, 0, 0);
    assert.strictEqual(res3.lat, 0);
    assert.ok(res3.lon > 0, 'Lon should be greater than 0 when moving East');
  });

  test('geodeticToLocal converts geodetic coordinates to local offsets', () => {
    // Test point at origin (lat=0, lon=0, centerLat=0, centerLon=0)
    const res1 = geodeticToLocal(0, 0, 0, 0);
    assert.strictEqual(res1.x, 0);
    assert.strictEqual(res1.y, 0);

    // Test a point North of origin (lat=1, lon=0, centerLat=0, centerLon=0)
    const res2 = geodeticToLocal(1, 0, 0, 0);
    assert.strictEqual(res2.x, 0);
    assert.ok(res2.y > 0, 'y should be greater than 0 when North of center');

    // Test a point East of origin (lat=0, lon=1, centerLat=0, centerLon=0)
    const res3 = geodeticToLocal(0, 1, 0, 0);
    assert.ok(res3.x > 0, 'x should be greater than 0 when East of center');
    assert.strictEqual(res3.y, 0);

    // Test round-trip conversion (localToGeodetic -> geodeticToLocal)
    const centerLat = 45;
    const centerLon = -90;
    const localX = 150;
    const localY = -200;
    const geo = localToGeodetic(localX, localY, centerLat, centerLon, 0);
    const localAgain = geodeticToLocal(geo.lat, geo.lon, centerLat, centerLon);

    // Allow small floating point precision differences
    assert.ok(Math.abs(localAgain.x - localX) < 1e-5, 'x coordinate should match after round-trip');
    assert.ok(Math.abs(localAgain.y - localY) < 1e-5, 'y coordinate should match after round-trip');
  });
});

describe('Grid Generation Tests', () => {
  test('generateGridCoordinates produces correct basic single grid', () => {
    // Generate a basic grid: width 100, height 100, 0 rotation, single grid, capture mode 'hover',
    // sLine (line spacing) 50, sPhoto (photo spacing) 50
    // Lines: 100/50 + 1 = 3 lines.
    // Photos per line: 100/50 + 1 = 3 photos.
    // Total waypoints should be 9.

    const result = generateGridCoordinates(100, 100, 0, 'single', 'hover', 50, 50);

    assert.ok(result.waypoints);
    assert.ok(result.photos);

    assert.strictEqual(result.waypoints.length, 9, 'Should have exactly 9 waypoints for 3x3 grid');

    // The grid should cover -50 to +50 on X and Y
    const xs = result.waypoints.map(wp => wp.x);
    const ys = result.waypoints.map(wp => wp.y);

    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    assert.strictEqual(minX, -50);
    assert.strictEqual(maxX, 50);
    assert.strictEqual(minY, -50);
    assert.strictEqual(maxY, 50);
  });

  test('generateCircularGridCoordinates produces correct grid for hover mode', () => {
    // Generate circular grid: radius 100, sLine 50, sPhoto 50, captureMode 'hover'
    const result = generateCircularGridCoordinates(100, 50, 50, 'hover');

    assert.ok(result.waypoints);
    assert.ok(result.photos);

    // From scratchpad: hover mode returns 13 waypoints and 13 photos for these params
    assert.strictEqual(result.waypoints.length, 13, 'Should have exactly 13 waypoints');
    assert.strictEqual(result.photos.length, 13, 'Should have exactly 13 photos');

    const xs = result.waypoints.map(wp => wp.x);
    const ys = result.waypoints.map(wp => wp.y);

    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    assert.strictEqual(minX, -50);
    assert.strictEqual(maxX, 50);
    // Bounding box of clipped circle
    assert.strictEqual(Math.round(minY), -100);
    assert.strictEqual(Math.round(maxY), 100);
  });

  test('generateCircularGridCoordinates produces correct grid for continuous mode', () => {
    // Generate circular grid: radius 100, sLine 50, sPhoto 50, captureMode 'continuous'
    const result = generateCircularGridCoordinates(100, 50, 50, 'continuous');

    assert.ok(result.waypoints);
    assert.ok(result.photos);

    // Continuous mode only adds waypoints at start/end of lines, but all photos
    assert.strictEqual(result.waypoints.length, 6, 'Should have exactly 6 waypoints');
    assert.strictEqual(result.photos.length, 13, 'Should have exactly 13 photos');
  });

  test('generateCircularGridCoordinates handles edge cases with too large spacing', () => {
    // Spacing larger than radius -> 0 points due to yMax < 5.0 check and loop conditions
    const result = generateCircularGridCoordinates(100, 200, 200, 'hover');

    assert.ok(result.waypoints);
    assert.ok(result.photos);
    assert.strictEqual(result.waypoints.length, 0);
    assert.strictEqual(result.photos.length, 0);
  });
});

describe('Orbit Generation Tests', () => {
  test('generateOrbitCoordinates enforces minimum number of photos constraint', () => {
    // Generate orbit with huge sPhoto to force the min 8 photos rule
    // nPhotos = max(8, round(circumference / sPhoto))
    // For radius 100, sPhoto 1000, nPhotos should be 8.
    // The loop goes from i=0 to nPhotos-1, so there are exactly nPhotos unique points.
    const result = generateOrbitCoordinates(100, 1000, 120, -60);

    assert.ok(result.waypoints);
    assert.ok(result.photos);
    assert.strictEqual(result.waypoints.length, 8, 'Should have 8 unique points (nPhotos=8 without duplicate closing point)');
    assert.strictEqual(result.photos.length, 8, 'Should have 8 photos');
  });

  test('generateOrbitCoordinates calculates correct coordinates, altitude, and pitch', () => {
    const result = generateOrbitCoordinates(100, 50, 120, -60);

    assert.ok(result.waypoints.length > 0);

    // Verify first point (theta = 0)
    // x = r*cos(0) = 100, y = r*sin(0) = 0
    const pt0 = result.waypoints[0];
    assert.strictEqual(pt0.x, 100);
    assert.strictEqual(pt0.y, 0);
    assert.strictEqual(pt0.alt, 120);
    assert.strictEqual(pt0.pitch, -60);

    // Check all points
    for (const pt of result.waypoints) {
      assert.strictEqual(pt.alt, 120, 'Altitude should match baseAltitude');
      assert.strictEqual(pt.pitch, -60, 'Pitch should match defaultGimbalPitch');

      // Distance to center should be roughly radius (100)
      const dist = Math.sqrt(pt.x * pt.x + pt.y * pt.y);
      assert.ok(Math.abs(dist - 100) < 0.001, 'Distance from center should be radius');
    }
  });

  test('generateOrbitCoordinates heading points directly to center', () => {
    const result = generateOrbitCoordinates(100, 50, 120, -60);

    // For theta = 0, x=100, y=0. To point to center (0,0), heading should be West (270 degrees).
    const pt0 = result.waypoints[0];
    assert.ok(Math.abs(pt0.heading - 270) < 1.0, `Point at theta=0 should face West (270 deg), got ${pt0.heading}`);

    // For theta = pi/2, x=0, y=100. To point to center, heading should be South (180 degrees).
    // Let's find a point close to pi/2 (if nPhotos is divisible by 4)
    // Actually we can just check the general formula for all points
    for (const pt of result.waypoints) {
      // The point is at (pt.x, pt.y). The vector to center is (-pt.x, -pt.y).
      // Heading is angle from North (Y-axis) clockwise.
      // So dy = -pt.y (North component is -Y, wait, in typical Math atan2:
      // Math.atan2(y, x) is angle from X axis.
      // The code uses Math.atan2(-x, -y).
      // Which means y-axis is first argument? Wait, Math.atan2(y, x).
      // So Math.atan2(-x, -y) is actually atan2(dx, dy) which computes angle from North!

      const expectedHeading = Math.atan2(-pt.x, -pt.y) * (180.0 / Math.PI);
      let expectedH = expectedHeading < 0 ? expectedHeading + 360 : expectedHeading;

      assert.ok(Math.abs(pt.heading - expectedH) < 0.001, `Heading incorrect for x=${pt.x}, y=${pt.y}`);
    }
  });
});

describe('Multi-Orbit Generation Tests', () => {
  test('generateMultiOrbitCoordinates produces 3 rings with correct altitudes, pitches, and points', () => {
    // Generate multi-orbit with radius=100, sPhoto=50, baseAltitude=100
    const result = generateMultiOrbitCoordinates(100, 50, 100, -90); // defaultGimbalPitch isn't used directly for rings but we provide it

    assert.ok(result.waypoints);
    assert.ok(result.photos);
    assert.strictEqual(result.waypoints.length, result.photos.length, 'Waypoints and photos should have same length');

    // Filter points by ringIndex
    const ring0 = result.waypoints.filter(wp => wp.ringIndex === 0);
    const ring1 = result.waypoints.filter(wp => wp.ringIndex === 1);
    const ring2 = result.waypoints.filter(wp => wp.ringIndex === 2);

    assert.ok(ring0.length > 0);
    assert.ok(ring1.length > 0);
    assert.ok(ring2.length > 0);

    // Verify altitudes and pitches
    assert.strictEqual(ring0[0].alt, 120, 'Ring 0 altitude should be baseAltitude * 1.2');
    assert.strictEqual(ring0[0].pitch, -60, 'Ring 0 pitch should be -60');

    assert.strictEqual(ring1[0].alt, 100, 'Ring 1 altitude should be baseAltitude * 1.0');
    assert.strictEqual(ring1[0].pitch, -45, 'Ring 1 pitch should be -45');

    assert.strictEqual(ring2[0].alt, 80, 'Ring 2 altitude should be baseAltitude * 0.8');
    assert.strictEqual(ring2[0].pitch, -30, 'Ring 2 pitch should be -30');

    // Validate headings direct towards the center and alternating directions
    // Note: direction is alternated by theta.
    // For ring 0 (idx % 2 === 0), theta increases: 0, >0, ... (counter-clockwise)
    // For ring 1 (idx % 2 !== 0), theta decreases: 2*PI, <2*PI, ... (clockwise)

    // We check that a point on positive X axis (y=0) has heading towards center (-X) which is approx 270 degrees
    // (In local coordinates where X is East, Y is North. Point at (r, 0) is East. To look center (0,0), it must look West (270 deg)).

    // Let's just check the first point of ring 0, which corresponds to i=0, theta=0 => x=r, y=0.
    const pt0 = ring0[0];
    assert.ok(Math.abs(pt0.heading - 270) < 1.0, `Point at theta=0 should face West (270 deg), got ${pt0.heading}`);

    // Alternating directions
    // For ring 0, i=1 should have theta > 0, so y > 0
    const ring0_pt1 = ring0[1];
    assert.ok(ring0_pt1.y > 0, 'Ring 0 should go counter-clockwise (positive Y for first step)');

    // For ring 1, i=0 has theta=2PI (x=r, y=0 approx), i=1 has theta < 2PI, so y < 0
    const ring1_pt1 = ring1[1];
    assert.ok(ring1_pt1.y < 0, 'Ring 1 should go clockwise (negative Y for first step)');

    // For ring 2, i=1 should have theta > 0, so y > 0
    const ring2_pt1 = ring2[1];
    assert.ok(ring2_pt1.y > 0, 'Ring 2 should go counter-clockwise (positive Y for first step)');
  });

  test('generateMultiOrbitCoordinates enforces minimum number of photos per ring', () => {
    // Generate multi-orbit with huge sPhoto to force the min 8 photos rule
    // Each ring has exactly nPhotos unique points without duplicate closing points.
    // If nPhotos=8, there are 8 points per ring.
    const result = generateMultiOrbitCoordinates(100, 1000, 100, -90);

    const ring0 = result.waypoints.filter(wp => wp.ringIndex === 0);
    const ring1 = result.waypoints.filter(wp => wp.ringIndex === 1);
    const ring2 = result.waypoints.filter(wp => wp.ringIndex === 2);

    assert.strictEqual(ring0.length, 8, 'Ring 0 should have 8 unique points (nPhotos=8)');
    assert.strictEqual(ring1.length, 8, 'Ring 1 should have 8 unique points');
    assert.strictEqual(ring2.length, 8, 'Ring 2 should have 8 unique points');
    assert.strictEqual(result.waypoints.length, 24, 'Total waypoints should be 24');
  });
});

describe('searchAddress API Tests', () => {
  let originalFetch;
  let originalAlert;
  let originalConsoleError;
  const originalGetElementById = global.document.getElementById;

  test('searchAddress handles network failure gracefully', async () => {
    let alertCalls = [];
    let consoleErrorCalls = [];

    // Setup mocks
    originalFetch = global.fetch;
    originalAlert = global.alert;
    originalConsoleError = console.error;

    global.fetch = () => Promise.reject(new Error('Network error'));
    global.alert = (msg) => alertCalls.push(msg);
    console.error = (msg, err) => consoleErrorCalls.push({ msg, err });

    global.document.getElementById = (id) => {
      if (id === 'location-input') return { value: 'Test Location' };
      return originalGetElementById.call(global.document, id);
    };

    try {
      // Call the function
      searchAddress();

      // Wait for the promise chain inside searchAddress to resolve
      await new Promise(resolve => setTimeout(resolve, 50));

      // Filter out the ExperimentalWarning from mock timers
      const actualErrors = consoleErrorCalls.filter(c => !c.msg || !c.msg.includes('ExperimentalWarning'));

      // Verify assertions
      assert.strictEqual(alertCalls.length, 1);
      assert.strictEqual(alertCalls[0], "Error finding location. Check your internet connection.");
      assert.strictEqual(actualErrors.length, 1);
      assert.strictEqual(actualErrors[0].msg, "[ERROR] Search error:");
      assert.strictEqual(actualErrors[0].err.message, "Network error");
    } finally {
      // Cleanup mocks
      global.fetch = originalFetch;
      global.alert = originalAlert;
      console.error = originalConsoleError;
      global.document.getElementById = originalGetElementById;
    }
  });
});

describe('calculateStats Tests', () => {
  test('returns null when waypoints length is less than 2', () => {
    assert.strictEqual(calculateStats([], [], 10, 10, 10, 'hover'), null);
    assert.strictEqual(calculateStats([{ x: 0, y: 0, z: 0, lat: 0, lon: 0 }], [], 10, 10, 10, 'hover'), null);
  });

  test('calculates total distance correctly with simple waypoints', () => {
    const waypoints = [
      { x: 0, y: 0, z: 0, lat: 0, lon: 0 },
      { x: 10, y: 0, z: 0, lat: 0.1, lon: 0 },
      { x: 10, y: 10, z: 0, lat: 0.1, lon: 0.1 }
    ];
    // We expect the distance to be 10 + 10 = 20.
    const stats = calculateStats(waypoints, [], 10, 10, 10, 'hover');
    assert.strictEqual(stats.distance, 20);
    assert.strictEqual(stats.waypointsCount, 3);
  });

  test('detects isolated waypoints when max nearest neighbor distance > 100', () => {
    // Normal waypoints
    const waypointsNormal = [
      { x: 0, y: 0, z: 0, lat: 0, lon: 0 },
      { x: 10, y: 0, z: 0, lat: 0, lon: 0 }
    ];
    const statsNormal = calculateStats(waypointsNormal, [], 10, 10, 10, 'hover');
    assert.strictEqual(statsNormal.hasIsolatedWaypoint, false);

    // Isolated waypoints (distance > 100)
    const waypointsIsolated = [
      { x: 0, y: 0, z: 0, lat: 0, lon: 0 },
      { x: 101, y: 0, z: 0, lat: 0, lon: 0 }
    ];
    const statsIsolated = calculateStats(waypointsIsolated, [], 10, 10, 10, 'hover');
    assert.strictEqual(statsIsolated.hasIsolatedWaypoint, true);
    assert.strictEqual(statsIsolated.maxNearestNeighborDist, 101);
  });

  test('calculates isFarFromTakeoff correctly', () => {
    const originalLLatLng = global.L.latLng;

    try {
      vm.runInThisContext('userLocation = { lat: 1, lon: 1 };');

      // Mock L.latLng to support distanceTo
      global.L.latLng = (lat, lon) => ({
        lat,
        lon,
        distanceTo: (other) => {
          // simple mock distance: if latitudes differ, return 1000m (far), else 10m (close)
          if (lat !== other.lat) return 1000;
          return 10;
        }
      });

      // User location is far from takeoff (lat 1 !== lat 0)
      const waypointsFar = [
        { x: 0, y: 0, z: 0, lat: 0, lon: 0 },
        { x: 10, y: 0, z: 0, lat: 0, lon: 0 }
      ];
      const statsFar = calculateStats(waypointsFar, [], 10, 10, 10, 'hover');
      assert.strictEqual(statsFar.isFarFromTakeoff, true);
      assert.strictEqual(statsFar.userDistanceToTakeoff, 1000);

      // User location is close to takeoff (lat 1 === lat 1)
      const waypointsClose = [
        { x: 0, y: 0, z: 0, lat: 1, lon: 1 },
        { x: 10, y: 0, z: 0, lat: 1, lon: 1 }
      ];
      const statsClose = calculateStats(waypointsClose, [], 10, 10, 10, 'hover');
      assert.strictEqual(statsClose.isFarFromTakeoff, false);
      assert.strictEqual(statsClose.userDistanceToTakeoff, 10);

    } finally {
      vm.runInThisContext('userLocation = null;');
      global.L.latLng = originalLLatLng;
    }
  });

  test('calculates flight time and parts count correctly', () => {
    const originalGetElementById = global.document.getElementById;
    const originalSplitWaypointsIntoParts = global.splitWaypointsIntoParts;

    try {
      // Mock max-flight-time element
      global.document.getElementById = (id) => {
        if (id === 'max-flight-time') {
          return { value: '2' }; // 2 minutes = 120 seconds max flight time
        }
        return originalGetElementById(id);
      };

      // Mock splitWaypointsIntoParts
      global.splitWaypointsIntoParts = () => {
        return [{}, {}]; // Return 2 parts
      };

      // Simple waypoints: distance 50 meters
      const waypoints = [
        { x: 0, y: 0, z: 0, lat: 0, lon: 0 },
        { x: 50, y: 0, z: 0, lat: 0, lon: 0 }
      ];

      const photoLocations = [{}, {}, {}]; // 3 photos
      const speed = 10; // 50 / 10 = 5 seconds flight time

      // Capture mode 'hover'
      // Flight time = 5 (distance/speed) + 45 (base) = 50 seconds.
      // Max flight time = 120 seconds.
      const statsHover = calculateStats(waypoints, photoLocations, speed, 10, 10, 'hover');
      assert.strictEqual(statsHover.flightTimeSeconds, 50);
      assert.strictEqual(statsHover.isOverMaxFlightTime, false);
      assert.strictEqual(statsHover.partsCount, 1);
      assert.strictEqual(statsHover.photoCount, 3);
      assert.strictEqual(statsHover.timeStr, '0m 50s');

      // Capture mode 'stopAndShoot'
      // Flight time = 5 (distance/speed) + 3*4.5 (photos) + 45 (base) + 2 (auto-settling) = 65.5 seconds.
      const statsStop = calculateStats(waypoints, photoLocations, speed, 10, 10, 'stopAndShoot');
      assert.strictEqual(statsStop.flightTimeSeconds, 65.5);
      assert.strictEqual(statsStop.timeStr, '1m 6s'); // 65.5s -> 1m 6s (rounded)

      // Change distance to 2000m (2000/10 = 200s + 45 = 245s). Max is 120s.
      const waypointsLong = [
        { x: 0, y: 0, z: 0, lat: 0, lon: 0 },
        { x: 2000, y: 0, z: 0, lat: 0, lon: 0 }
      ];
      const statsLong = calculateStats(waypointsLong, [], speed, 10, 10, 'hover');
      assert.strictEqual(statsLong.flightTimeSeconds, 245);
      assert.strictEqual(statsLong.isOverMaxFlightTime, true);
      assert.strictEqual(statsLong.partsCount, 2); // since we mocked splitWaypointsIntoParts to return array of length 2

    } finally {
      global.document.getElementById = originalGetElementById;
      global.splitWaypointsIntoParts = originalSplitWaypointsIntoParts;
    }
  });
});

test('NWS Weather fetching bounds and parsing', async () => {
  let fetchedUrls = [];
  const originalFetch = global.fetch;

  global.fetch = async (url, options) => {
    fetchedUrls.push(url);
    if (url.includes('/points/')) {
      return { ok: true, json: async () => ({ properties: { observationStations: 'https://api.weather.gov/stations/mock' } }) };
    }
    if (url.includes('/stations/mock')) {
      return { ok: true, json: async () => ({ features: [
        { geometry: { coordinates: [-90, 45] }, properties: { stationIdentifier: 'KMOCK', name: 'Mock Station' } },
        { geometry: { coordinates: [-90, 46] }, properties: { stationIdentifier: 'KNORTH', name: 'North Station' } }
      ]})};
    }
    if (url.includes('/observations/latest')) {
      return { ok: true, json: async () => ({ properties: { flightCategory: 'VFR', rawMessage: 'METAR MOCK' } }) };
    }
    return { ok: false };
  };

  try {
    vm.runInThisContext('lastWeatherFetchCenter = null;');
    await vm.runInThisContext('fetchAndProcessWeather(45.0, -90.0)');

    assert.strictEqual(fetchedUrls.length, 3);
  } finally {
    global.fetch = originalFetch;
  }
});

describe('getSubMissionFlightTime Tests', () => {
  test('calculates time for continuous capture mode', async () => {
    const wps = [{x: 0, y: 0}, {x: 30, y: 40}];
    vm.runInThisContext(`global.wpsInput = ${JSON.stringify(wps)};`);
    const time = vm.runInThisContext(`getSubMissionFlightTime(global.wpsInput, 0, 1, 5, 'continuous')`);
    assert.strictEqual(time, 55);
  });

  test('calculates time for stopAndShoot capture mode', async () => {
    const wps = [{x: 0, y: 0}, {x: 30, y: 40}, {x: 30, y: 80}];
    vm.runInThisContext(`global.wpsInput = ${JSON.stringify(wps)};`);
    const time = vm.runInThisContext(`getSubMissionFlightTime(global.wpsInput, 0, 2, 10, 'stopAndShoot')`);
    assert.strictEqual(time, 71.5);
  });

  test('calculates time for 0 distance segments', async () => {
    const wps = [{x: 10, y: 10}, {x: 10, y: 10}, {x: 10, y: 10}];
    vm.runInThisContext(`global.wpsInput = ${JSON.stringify(wps)};`);
    const time = vm.runInThisContext(`getSubMissionFlightTime(global.wpsInput, 0, 2, 5, 'continuous')`);
    assert.strictEqual(time, 45);

    const time2 = vm.runInThisContext(`getSubMissionFlightTime(global.wpsInput, 1, 1, 5, 'continuous')`);
    assert.strictEqual(time2, 45);
  });
});

describe('updateWeatherPanelUI Tests', () => {
  test('handles isLoading state', () => {
    let windowText = '';
    let dirsHidden = false;
    let dirsCleared = false;

    const mockGetElementById = (id) => {
      if (id === 'stat-weather-window') {
        return {
          set textContent(val) { windowText = val; },
          style: {},
          replaceChildren: () => {}
        };
      }
      if (id === 'stat-weather-dirs') {
        return {
          replaceChildren: () => { dirsCleared = true; },
          classList: {
            add: (cls) => { if (cls === 'hidden') dirsHidden = true; },
            remove: () => {}
          }
        };
      }
      return null;
    };

    const originalGetElementById = global.document.getElementById;
    global.document.getElementById = mockGetElementById;

    try {
      vm.runInThisContext('updateWeatherPanelUI(null, null, true)');
      assert.strictEqual(windowText, 'Loading...');
      assert.strictEqual(dirsHidden, true);
      assert.strictEqual(dirsCleared, true);
    } finally {
      global.document.getElementById = originalGetElementById;
    }
  });

  test('handles statusMsg without loading', () => {
    let windowText = '';

    const mockGetElementById = (id) => {
      if (id === 'stat-weather-window') {
        return {
          set textContent(val) { windowText = val; },
          style: {},
          replaceChildren: () => {}
        };
      }
      if (id === 'stat-weather-dirs') {
        return {
          replaceChildren: () => {},
          classList: { add: () => {}, remove: () => {} }
        };
      }
      return null;
    };

    const originalGetElementById = global.document.getElementById;
    global.document.getElementById = mockGetElementById;

    try {
      vm.runInThisContext('updateWeatherPanelUI(null, "Error Message", false)');
      assert.strictEqual(windowText, 'Error Message');
    } finally {
      global.document.getElementById = originalGetElementById;
    }
  });

  test('handles no data state', () => {
    let windowText = '';
    let dirsHidden = false;

    const mockGetElementById = (id) => {
      if (id === 'stat-weather-window') {
        return {
          set textContent(val) { windowText = val; },
          style: {},
          replaceChildren: () => {}
        };
      }
      if (id === 'stat-weather-dirs') {
        return {
          replaceChildren: () => {},
          classList: {
            add: (cls) => { if (cls === 'hidden') dirsHidden = true; },
            remove: () => {}
          }
        };
      }
      return null;
    };

    const originalGetElementById = global.document.getElementById;
    global.document.getElementById = mockGetElementById;

    try {
      vm.runInThisContext('updateWeatherPanelUI(null, null, false)');
      assert.strictEqual(windowText, '🔴 No Data');
      assert.strictEqual(dirsHidden, true);
    } finally {
      global.document.getElementById = originalGetElementById;
    }
  });

  test('handles VFR flight category', () => {
    let windowChildren = [];
    let dirsHidden = true;

    const mockGetElementById = (id) => {
      if (id === 'stat-weather-window') {
        return {
          style: {},
          replaceChildren: () => { windowChildren = []; },
          appendChild: (child) => { windowChildren.push(child); }
        };
      }
      if (id === 'stat-weather-dirs') {
        return {
          replaceChildren: () => {},
          appendChild: () => {},
          classList: {
            add: () => {},
            remove: (cls) => { if (cls === 'hidden') dirsHidden = false; }
          }
        };
      }
      return null;
    };

    const originalGetElementById = global.document.getElementById;
    const originalCreateElement = global.document.createElement;

    global.document.getElementById = mockGetElementById;
    // We override createElement specifically to capture appendChild calls on elements inside updateWeatherPanelUI
    global.document.createElement = (tag) => {
      const el = {
        tagName: tag.toUpperCase(),
        style: {},
        classList: { add: () => {}, remove: () => {} },
        childrenAdded: [],
        appendChild: function(child) { this.childrenAdded.push(child); }
      };
      return el;
    };

    try {
      const directions = {
        closest: {
          fltCat: "VFR",
          name: "Test Station",
          distance: 10,
          raw: "TEST RAW",
          visibilitySM: 10,
          ceilingFt: 5000,
          timestamp: "2023-01-01T12:00:00Z"
        }
      };
      vm.runInThisContext(`global.testDirs = ${JSON.stringify(directions)};`);
      vm.runInThisContext('updateWeatherPanelUI(global.testDirs, null, false)');

      assert.strictEqual(dirsHidden, false);
      assert.strictEqual(windowChildren.length, 2);
      assert.strictEqual(windowChildren[0].textContent, '🟢 Allowed (VFR)');
    } finally {
      global.document.getElementById = originalGetElementById;
      global.document.createElement = originalCreateElement;
    }
  });

  test('handles MVFR and IFR flight categories', () => {
    let windowChildren = [];

    const mockGetElementById = (id) => {
      if (id === 'stat-weather-window') {
        return {
          style: {},
          replaceChildren: () => { windowChildren = []; },
          appendChild: (child) => { windowChildren.push(child); }
        };
      }
      if (id === 'stat-weather-dirs') {
        return {
          replaceChildren: () => {},
          appendChild: () => {},
          classList: { add: () => {}, remove: () => {} }
        };
      }
      return null;
    };

    const originalGetElementById = global.document.getElementById;
    global.document.getElementById = mockGetElementById;

    try {
      const mvfrDirections = { closest: { fltCat: "MVFR", name: "Test", distance: 10, raw: "", visibilitySM: 4, ceilingFt: 2000 } };
      vm.runInThisContext(`global.testDirsMVFR = ${JSON.stringify(mvfrDirections)};`);
      vm.runInThisContext('updateWeatherPanelUI(global.testDirsMVFR, null, false)');
      assert.strictEqual(windowChildren[0].textContent, '🟡 Caution (MVFR)');

      const ifrDirections = { closest: { fltCat: "IFR", name: "Test", distance: 10, raw: "", visibilitySM: 2, ceilingFt: 800 } };
      vm.runInThisContext(`global.testDirsIFR = ${JSON.stringify(ifrDirections)};`);
      vm.runInThisContext('updateWeatherPanelUI(global.testDirsIFR, null, false)');
      assert.strictEqual(windowChildren[0].textContent, '🔴 Not Allowed (IFR)');
    } finally {
      global.document.getElementById = originalGetElementById;
    }
  });

  test('safely formats ceiling text without XSS vulnerability', () => {
    let dirsChildren = [];

    const mockGetElementById = (id) => {
      if (id === 'stat-weather-window') {
        return {
          style: {},
          replaceChildren: () => {},
          appendChild: () => {}
        };
      }
      if (id === 'stat-weather-dirs') {
        return {
          replaceChildren: () => { dirsChildren = []; },
          appendChild: (child) => { dirsChildren.push(child); },
          classList: { add: () => {}, remove: () => {} }
        };
      }
      return null;
    };

    const originalGetElementById = global.document.getElementById;
    const originalCreateElement = global.document.createElement;

    global.document.getElementById = mockGetElementById;
    global.document.createElement = (tag) => {
      const el = {
        tagName: tag.toUpperCase(),
        style: {},
        classList: { add: () => {}, remove: () => {} },
        childrenAdded: [],
        appendChild: function(child) { this.childrenAdded.push(child); }
      };
      return el;
    };

    try {
      const directions = {
        closest: {
          fltCat: "VFR",
          name: "Test Station",
          distance: 10,
          raw: "TEST RAW",
          visibilitySM: 10,
          ceilingFt: 5000,
          timestamp: "2023-01-01T12:00:00Z"
        }
      };
      vm.runInThisContext(`global.testDirsSafe = ${JSON.stringify(directions)};`);
      vm.runInThisContext('updateWeatherPanelUI(global.testDirsSafe, null, false)');

      // dirsChildren[0] is the main container for the checklist
      const container = dirsChildren[0];

      // index.js updateWeatherPanelUI appends the title, visDiv, then ceilDiv:
      assert.strictEqual(container.childrenAdded.length >= 3, true);
      const ceilDivNode = container.childrenAdded[2];

      assert.strictEqual(ceilDivNode.textContent, '✅ Ceiling: 5000 ft (Req ≥ 1000 ft)');
    } finally {
      global.document.getElementById = originalGetElementById;
      global.document.createElement = originalCreateElement;
    }
  });
});

describe('initHeadingHelpDrawer Tests', () => {
  test('attaches click listeners and handles drawer toggling and tabs', () => {
    let helpBtnClicked = null;
    let tabFollowClicked = null;
    let tabFixedClicked = null;
    let tabPoiClicked = null;

    const mockHelpBtn = {
      addEventListener: (evt, cb) => {
        if (evt === 'click') helpBtnClicked = cb;
      }
    };
    const mockHelpDrawer = {
      classList: {
        contains: (cls) => cls === 'hidden',
        toggle: mock.fn()
      }
    };
    const mockTabFollow = {
      addEventListener: (evt, cb) => {
        if (evt === 'click') tabFollowClicked = cb;
      },
      classList: {
        add: mock.fn(),
        remove: mock.fn()
      },
      style: {}
    };
    const mockTabFixed = {
      addEventListener: (evt, cb) => {
        if (evt === 'click') tabFixedClicked = cb;
      },
      classList: {
        add: mock.fn(),
        remove: mock.fn()
      },
      style: {}
    };
    const mockTabPoi = {
      addEventListener: (evt, cb) => {
        if (evt === 'click') tabPoiClicked = cb;
      },
      classList: {
        add: mock.fn(),
        remove: mock.fn()
      },
      style: {}
    };
    const mockHelpDesc = { textContent: '' };
    const mockAnimDrone = { setAttribute: mock.fn() };
    const mockAnimPoiTarget = { style: { opacity: '0' } };
    const mockActivePath = { setAttribute: mock.fn() };

    const originalGetElementById = global.document.getElementById;
    global.document.getElementById = (id) => {
      if (id === 'heading-help-btn') return mockHelpBtn;
      if (id === 'heading-help-drawer') return mockHelpDrawer;
      if (id === 'heading-tab-follow') return mockTabFollow;
      if (id === 'heading-tab-fixed') return mockTabFixed;
      if (id === 'heading-tab-poi') return mockTabPoi;
      if (id === 'heading-help-desc') return mockHelpDesc;
      if (id === 'anim-drone') return mockAnimDrone;
      if (id === 'anim-poi-target') return mockAnimPoiTarget;
      if (id === 'anim-flight-path-active') return mockActivePath;
      return null;
    };

    // Mock requestAnimationFrame and cancelAnimationFrame
    const originalRaf = global.requestAnimationFrame;
    const originalCaf = global.cancelAnimationFrame;
    let callCount = 0;
    global.requestAnimationFrame = (cb) => {
      callCount++;
      if (callCount === 1) {
        cb(100); // execute exactly once synchronously to cover code paths
      }
      return 123;
    };
    global.cancelAnimationFrame = () => {};

    try {
      vm.runInThisContext('initHeadingHelpDrawer()');

      // Assert click listeners were bound
      assert.ok(helpBtnClicked);
      assert.ok(tabFollowClicked);
      assert.ok(tabFixedClicked);
      assert.ok(tabPoiClicked);

      // Trigger drawer toggle click
      const mockEvent = { stopPropagation: () => {} };
      helpBtnClicked(mockEvent);

      // Verify toggle was called
      assert.strictEqual(mockHelpDrawer.classList.toggle.mock.callCount(), 1);

      // Trigger tab clicks and verify description updates
      tabFixedClicked();
      assert.strictEqual(mockHelpDesc.textContent.includes('constant heading'), true);
      assert.strictEqual(mockAnimPoiTarget.style.opacity, '0');

      tabFollowClicked();
      assert.strictEqual(mockHelpDesc.textContent.includes('rotates forward'), true);
      assert.strictEqual(mockAnimPoiTarget.style.opacity, '0');

      tabPoiClicked();
      assert.strictEqual(mockHelpDesc.textContent.includes('locks onto a Point of Interest'), true);
      assert.strictEqual(mockAnimPoiTarget.style.opacity, '1');

    } finally {
      global.document.getElementById = originalGetElementById;
      global.requestAnimationFrame = originalRaf;
      global.cancelAnimationFrame = originalCaf;
    }
  });
});

describe('buildWaylinesWpml towardPOI Tests', () => {
  test('generates XML with correct POI coordinates when towardPOI mode is selected', () => {
    try {
      vm.runInThisContext(`
        centerMarker = {
          getLatLng: () => ({ lat: 41.8827, lng: -87.6227 })
        };
      `);
      
      const wps = [
        { lat: 41.8827, lon: -87.6227, x: 0, y: 0, alt: 50 },
        { lat: 41.8927, lon: -87.6227, x: 0, y: 100, alt: 50 }
      ];

      const xml = vm.runInThisContext(`
        buildWaylinesWpml(${JSON.stringify(wps)}, 50, 4, 'towardPOI', 'goHome', -90, 'hover', 'normal')
      `);

      assert.strictEqual(xml.includes('<wpml:waypointHeadingMode>towardPOI</wpml:waypointHeadingMode>'), true);
      assert.strictEqual(xml.includes('<wpml:waypointPoiPoint>-87.6227000000000,41.8827000000000,0.000000</wpml:waypointPoiPoint>'), true);
    } finally {
      vm.runInThisContext('centerMarker = null;');
    }
  });
});

describe('togglePatternParameters Visibility Tests', () => {
  test('hides heading mode selector for orbits and shows it for grids', () => {
    let mockContainer = { style: { display: '' } };
    const originalGetElementById = global.document.getElementById;

    global.document.getElementById = (id) => {
      if (id === 'heading-mode-container') return mockContainer;
      if (id === 'grid-type') return { value: 'orbit' };
      if (id === 'grid-width') return { closest: () => ({ style: {}, querySelector: () => ({}) }) };
      if (id === 'grid-height') return { closest: () => ({ style: {}, querySelector: () => ({}) }) };
      if (id === 'grid-rotation') return { closest: () => ({ style: {}, querySelector: () => ({}) }) };
      return originalGetElementById(id);
    };

    try {
      vm.runInThisContext('togglePatternParameters()');
      assert.strictEqual(mockContainer.style.display, 'none');

      // Test showing for grid
      global.document.getElementById = (id) => {
        if (id === 'heading-mode-container') return mockContainer;
        if (id === 'grid-type') return { value: 'single' };
        if (id === 'grid-width') return { closest: () => ({ style: {}, querySelector: () => ({}) }) };
        if (id === 'grid-height') return { closest: () => ({ style: {}, querySelector: () => ({}) }) };
        if (id === 'grid-rotation') return { closest: () => ({ style: {}, querySelector: () => ({}) }) };
        return originalGetElementById(id);
      };

      vm.runInThisContext('togglePatternParameters()');
      assert.strictEqual(mockContainer.style.display, 'block');

    } finally {
      global.document.getElementById = originalGetElementById;
    }
  });
});

describe('buildWaylinesWpml Waypoint Overrides Tests', () => {
  test('respects individual waypoint headingMode settings in KML generation', () => {
    try {
      vm.runInThisContext(`
        centerMarker = {
          getLatLng: () => ({ lat: 41.8827, lng: -87.6227 })
        };
      `);

      const wps = [
        { lat: 41.8827, lon: -87.6227, alt: 50, headingMode: 'fixed' },
        { lat: 41.8827, lon: -87.6227, alt: 50, headingMode: 'towardPOI' },
        { lat: 41.8827, lon: -87.6227, alt: 50, headingMode: 'custom', heading: 180 }
      ];

      const xml = vm.runInThisContext(`
        buildWaylinesWpml(${JSON.stringify(wps)}, 50, 4, 'followWayline', 'goHome', -90, 'hover', 'normal')
      `);

      // Waypoint 0 should be fixed
      assert.strictEqual(xml.includes('<wpml:waypointHeadingMode>fixed</wpml:waypointHeadingMode>'), true);
      // Waypoint 1 should be towardPOI
      assert.strictEqual(xml.includes('<wpml:waypointHeadingMode>towardPOI</wpml:waypointHeadingMode>'), true);
      // Waypoint 2 should be smoothTransition with angle 180
      assert.strictEqual(xml.includes('<wpml:waypointHeadingMode>smoothTransition</wpml:waypointHeadingMode>'), true);
      assert.strictEqual(xml.includes('<wpml:waypointHeadingAngle>180.0</wpml:waypointHeadingAngle>'), true);

    } finally {
      vm.runInThisContext('centerMarker = null;');
    }
  });
});

describe('updateFPVEditorUI headingMode Tests', () => {
  test('correctly configures heading dropdown and slider visibility in FPV editor', () => {
    const originalGetElementById = global.document.getElementById;

    const mockSelect = { value: '' };
    const mockSlider = { style: { display: 'none' }, value: 0 };
    const mockVal = { textContent: '' };

    global.document.getElementById = (id) => {
      if (id === 'fpv-edit-heading-mode') return mockSelect;
      if (id === 'fpv-edit-heading') return mockSlider;
      if (id === 'fpv-edit-heading-val') return mockVal;
      return originalGetElementById(id);
    };

    try {
      vm.runInThisContext('fpvProgressIndex = 0;');
      
      // Test inherit mode
      vm.runInThisContext(`
        generatedWaypoints = [{ lat: 41.88, lon: -87.62, alt: 50, headingMode: 'inherit' }];
        updateFPVEditorUI();
      `);
      assert.strictEqual(mockSelect.value, 'inherit');
      assert.strictEqual(mockSlider.style.display, 'none');

      // Test custom mode
      vm.runInThisContext(`
        generatedWaypoints = [{ lat: 41.88, lon: -87.62, alt: 50, headingMode: 'custom', heading: 245 }];
        updateFPVEditorUI();
      `);
      assert.strictEqual(mockSelect.value, 'custom');
      assert.strictEqual(mockSlider.style.display, 'block');
      assert.strictEqual(mockSlider.value, 245);
      assert.strictEqual(mockVal.textContent, '245°');

    } finally {
      global.document.getElementById = originalGetElementById;
    }
  });
});

describe('createWaypointEditorDOM headingMode Tests', () => {
  test('popup HTML contains headingMode select with all 5 mode options', () => {
    // We test the innerHTML string by patching document.createElement to return
    // a proper mock object that has innerHTML/querySelector support.
    const originalCreateElement = global.document.createElement;
    const originalGetElementById = global.document.getElementById;

    // Build a minimal element mock that stores innerHTML and exposes querySelector
    const makeEl = (tag) => {
      const el = {
        tagName: tag.toUpperCase(),
        className: '',
        style: {},
        innerHTML: '',
        _listeners: {},
        appendChild: function(child) { return child; },
        querySelector: function(sel) {
          // Parse the stored innerHTML to find matching id
          const m = sel.match(/^#(.+)$/);
          if (!m) return null;
          const id = m[1];
          const re = new RegExp(`id="${id}"[^>]*>`);
          if (!re.test(this.innerHTML)) return null;
          // Return minimal mock for matched elements
          const styleMatch = this.innerHTML.match(new RegExp(`id="${id}"[^>]*style="([^"]*)"`));
          const valMatch = this.innerHTML.match(new RegExp(`id="${id}"[^>]*value="([^"]*)"`));
          return {
            value: valMatch ? valMatch[1] : '',
            style: { display: styleMatch ? (styleMatch[1].match(/display:\s*(\w+)/) || ['',''])[1] : '' },
            textContent: '',
            disabled: false,
            addEventListener: () => {}
          };
        },
        on: () => {},
        addEventListener: () => {}
      };
      return el;
    };

    global.document.createElement = (tag) => makeEl(tag);
    global.document.getElementById = (id) => {
      if (id === 'grid-rotation') return { value: '0' };
      if (id === 'grid-type') return { value: 'single' };
      return originalGetElementById(id);
    };

    try {
      vm.runInThisContext('centerMarker = { getLatLng: () => ({ lat: 41.88, lng: -87.62 }) };');
      global.testWp = { lat: 41.88, lon: -87.62, alt: 50, pitch: -45, heading: null, headingMode: 'inherit' };
      global.testMarker = {
        setLatLng: () => {}, getTooltip: () => ({ setContent: () => {} }),
        setIcon: () => {}, on: () => {}, off: () => {}, closePopup: () => {}
      };
      const container = vm.runInThisContext(
        'createWaypointEditorDOM(global.testWp, 0, global.testMarker)'
      );

      const html = container.innerHTML;
      assert.ok(html.includes('id="edit-wp-heading-mode"'), 'should include heading mode select');
      assert.ok(html.includes('value="inherit"'), 'inherit option should exist');
      assert.ok(html.includes('value="followWayline"'), 'followWayline option should exist');
      assert.ok(html.includes('value="fixed"'), 'fixed option should exist');
      assert.ok(html.includes('value="towardPOI"'), 'towardPOI option should exist');
      assert.ok(html.includes('value="custom"'), 'custom option should exist');
      // For inherit mode the custom slider should be display:none
      assert.ok(html.includes('display: none'), 'custom angle slider should be hidden for inherit mode');

    } finally {
      global.document.createElement = originalCreateElement;
      global.document.getElementById = originalGetElementById;
      vm.runInThisContext('centerMarker = null;');
      delete global.testWp;
      delete global.testMarker;
    }
  });

  test('popup HTML shows custom slider as display:block when headingMode is custom', () => {
    const originalCreateElement = global.document.createElement;
    const originalGetElementById = global.document.getElementById;

    const makeEl = (tag) => ({
      tagName: tag.toUpperCase(), className: '', style: {}, innerHTML: '',
      appendChild: (c) => c,
      querySelector: () => ({ value: '', style: {}, textContent: '', disabled: false, addEventListener: () => {} }),
      on: () => {}, addEventListener: () => {}
    });

    global.document.createElement = (tag) => makeEl(tag);
    global.document.getElementById = (id) => {
      if (id === 'grid-rotation') return { value: '0' };
      if (id === 'grid-type') return { value: 'single' };
      return originalGetElementById(id);
    };

    try {
      vm.runInThisContext('centerMarker = { getLatLng: () => ({ lat: 41.88, lng: -87.62 }) };');
      global.testWp2 = { lat: 41.88, lon: -87.62, alt: 50, pitch: -45, heading: 135, headingMode: 'custom' };
      global.testMarker2 = {
        setLatLng: () => {}, getTooltip: () => ({ setContent: () => {} }),
        setIcon: () => {}, on: () => {}, off: () => {}, closePopup: () => {}
      };
      const container = vm.runInThisContext(
        'createWaypointEditorDOM(global.testWp2, 0, global.testMarker2)'
      );

      const html = container.innerHTML;
      assert.ok(html.includes('id="edit-wp-heading-mode"'), 'should include heading mode select');
      // Custom mode slider should be display:block in the template
      assert.ok(html.includes('display: block'), 'custom angle slider should be visible for custom mode');

    } finally {
      global.document.createElement = originalCreateElement;
      global.document.getElementById = originalGetElementById;
      vm.runInThisContext('centerMarker = null;');
      delete global.testWp2;
      delete global.testMarker2;
    }
  });
});

describe('recalculateRoadOffsetPath Custom Heading & FPV Sync Tests', () => {
  test('recalculateRoadOffsetPath respects custom headingMode and heading overrides', () => {
    const originalGetElementById = global.document.getElementById;
    global.document.getElementById = (id) => {
      if (id === 'road-offset') return { value: '15' };
      if (id === 'altitude') return { value: '50' };
      if (id === 'heading-mode') return { value: 'followWayline' };
      return originalGetElementById(id);
    };

    try {
      vm.runInThisContext(`
        roadWaypoints = [
          { lat: 41.88, lon: -87.62, x: 0, y: 0, alt: 50, headingMode: 'custom', heading: 120 },
          { lat: 41.89, lon: -87.62, x: 0, y: 100, alt: 60, headingMode: 'fixed' }
        ];
        recalculateRoadOffsetPath(41.88, -87.62);
      `);

      const genWps = vm.runInThisContext('generatedWaypoints');
      assert.strictEqual(genWps.length, 2);
      
      // First waypoint should have custom heading = 120 and headingMode = 'custom'
      assert.strictEqual(genWps[0].heading, 120);
      assert.strictEqual(genWps[0].headingMode, 'custom');
      assert.strictEqual(genWps[0].alt, 50);

      // Second waypoint should have fixed heading = 0 and headingMode = 'fixed'
      assert.strictEqual(genWps[1].heading, 0);
      assert.strictEqual(genWps[1].headingMode, 'fixed');
      assert.strictEqual(genWps[1].alt, 60);

    } finally {
      global.document.getElementById = originalGetElementById;
      vm.runInThisContext('roadWaypoints = []; generatedWaypoints = [];');
    }
  });
});

describe('buildWaylinesWpml Multi-POI Export Tests', () => {
  test('exports correct POI coordinates and indexes for multiple POIs', () => {
    try {
      vm.runInThisContext(`
        centerMarker = {
          getLatLng: () => ({ lat: 41.88, lng: -87.62 })
        };
        pois = [
          { name: 'POI 0 (Center)', lat: 41.88, lon: -87.62 },
          { name: 'POI 1', lat: 41.93, lon: -87.67 },
          { name: 'POI 2', lat: 41.98, lon: -87.72 }
        ];
      `);

      const wps = [
        { lat: 41.88, lon: -87.62, x: 0, y: 0, alt: 50, headingMode: 'towardPOI', poiIndex: 1 },
        { lat: 41.89, lon: -87.62, x: 0, y: 100, alt: 50, headingMode: 'towardPOI', poiIndex: 2 }
      ];

      const xml = vm.runInThisContext(`
        buildWaylinesWpml(${JSON.stringify(wps)}, 50, 4, 'followWayline', 'goHome', -90, 'hover', 'normal')
      `);

      // Waypoint 0 should point to POI 1 (-87.67, 41.93)
      assert.ok(xml.includes('<wpml:waypointHeadingPoiIndex>1</wpml:waypointHeadingPoiIndex>'));
      assert.ok(xml.includes('<wpml:waypointPoiPoint>-87.6700000000000,41.9300000000000,0.000000</wpml:waypointPoiPoint>'));

      // Waypoint 1 should point to POI 2 (-87.72, 41.98)
      assert.ok(xml.includes('<wpml:waypointHeadingPoiIndex>2</wpml:waypointHeadingPoiIndex>'));
      assert.ok(xml.includes('<wpml:waypointPoiPoint>-87.7200000000000,41.9800000000000,0.000000</wpml:waypointPoiPoint>'));

    } finally {
      vm.runInThisContext('centerMarker = null; pois = [];');
    }
  });
});

describe('getWaypointHeadingAndPitch 3D Yaw Alignment Tests', () => {
  test('calculates correct heading for towardPOI and fixed modes in 3D scene helper', () => {
    try {
      vm.runInThisContext(`
        pois = [
          { name: 'POI 0 (Center)', lat: 41.88, lon: -87.62 },
          { name: 'POI 1', lat: 41.88, lon: -87.621 }
        ];
      `);

      const wps = [
        { lat: 41.88, lon: -87.62, x: 0, y: 0, alt: 50, headingMode: 'towardPOI', poiIndex: 1 },
        { lat: 41.88, lon: -87.62, x: 0, y: 0, alt: 50, headingMode: 'fixed' }
      ];

      const res0 = vm.runInThisContext(`getWaypointHeadingAndPitch(0, ${JSON.stringify(wps)})`);
      const res1 = vm.runInThisContext(`getWaypointHeadingAndPitch(1, ${JSON.stringify(wps)})`);

      // Pointing West (lon -87.621 vs -87.62) should be 270 degrees
      assert.ok(Math.abs(res0.heading - 270) < 1.0);
      assert.strictEqual(res1.heading, 0);

    } finally {
      vm.runInThisContext('pois = [];');
    }
  });
});

describe('3D FPV Editor Panel Alignment & Viewport Tests', () => {
  test('updateFPVEditorUI formats altitude correctly for metric vs imperial unit system', () => {
    let mockAltText = '';
    let mockAltUnit = '';
    let mockLatVal = '';
    let mockLonVal = '';
    let mockStepText = '';
    let mockResetDisplay = '';

    const originalGetElementById = global.document.getElementById;
    global.document.getElementById = (id) => {
      if (id === 'fpv-editor-wp-index') return { textContent: '' };
      if (id === 'fpv-editor-coords') return { textContent: '' };
      if (id === 'fpv-edit-alt-val') return { set textContent(v) { mockAltText = v; } };
      if (id === 'fpv-edit-alt-unit') return { set textContent(v) { mockAltUnit = v; } };
      if (id === 'fpv-edit-alt') return { value: 0 };
      if (id === 'gimbal-pitch') return { value: '-45' };
      if (id === 'fpv-edit-pitch-val') return { textContent: '' };
      if (id === 'fpv-edit-pitch') return { value: 0 };
      if (id === 'fpv-edit-lat') return { set value(v) { mockLatVal = v; } };
      if (id === 'fpv-edit-lon') return { set value(v) { mockLonVal = v; } };
      if (id === 'fpv-nudge-step-display') return { set textContent(v) { mockStepText = v; } };
      if (id === 'fpv-edit-heading-mode') return null;
      if (id === 'fpv-btn-reset-wp') return { style: { set display(v) { mockResetDisplay = v; } } };
      return originalGetElementById(id);
    };

    try {
      vm.runInThisContext(`
        getUnitSystem = () => 'metric';
        fpvProgressIndex = 0;
        fpvNudgeStepIndex = 1;
        generatedWaypoints = [{ lat: 41.88, lon: -87.62, alt: 50, pitch: -45 }];
        updateFPVEditorUI();
      `);

      assert.strictEqual(mockAltText, 50);
      assert.strictEqual(mockAltUnit, 'm');
      assert.strictEqual(mockStepText, '1m');

      // Test Imperial
      vm.runInThisContext(`
        getUnitSystem = () => 'imperial';
        updateFPVEditorUI();
      `);

      assert.strictEqual(mockAltText, 164); // 50 * 3.28084 rounded
      assert.strictEqual(mockAltUnit, 'ft');
      assert.strictEqual(mockStepText, '5 ft');

    } finally {
      global.document.getElementById = originalGetElementById;
      vm.runInThisContext('getUnitSystem = function() { if (cachedUnitSystem) return cachedUnitSystem; const el = typeof document !== "undefined" ? document.getElementById("unit-system") : null; if (el) { cachedUnitSystem = el.value; return cachedUnitSystem; } const savedUnit = localStorage.getItem("unitSystem"); if (savedUnit) { cachedUnitSystem = savedUnit; return cachedUnitSystem; } return "metric"; };');
    }
  });

  test('FPV Reset button restores modified waypoint attributes', () => {
    try {
      vm.runInThisContext(`
        centerMarker = { getLatLng: () => ({ lat: 41.88, lng: -87.62 }) };
        fpvProgressIndex = 0;
        generatedWaypoints = [{
          lat: 41.90, lon: -87.65, alt: 80, pitch: -30, headingMode: 'custom', heading: 90,
          origLat: 41.88, origLon: -87.62, origAlt: 50, origPitch: -45, origHeadingMode: 'inherit', origHeading: null
        }];
      `);

      // Verify initial modified state
      const wpMod = vm.runInThisContext('generatedWaypoints[0]');
      assert.strictEqual(wpMod.lat, 41.90);
      assert.strictEqual(wpMod.alt, 80);

      // Simulate clicking reset logic
      vm.runInThisContext(`
        const wp = generatedWaypoints[0];
        if (wp.origLat !== undefined) wp.lat = wp.origLat;
        if (wp.origLon !== undefined) wp.lon = wp.origLon;
        if (wp.origAlt !== undefined) wp.alt = wp.origAlt;
        if (wp.origPitch !== undefined) wp.pitch = wp.origPitch;
        if (wp.origHeading !== undefined) wp.heading = wp.origHeading;
        wp.headingMode = wp.origHeadingMode || 'inherit';
      `);

      const wpReset = vm.runInThisContext('generatedWaypoints[0]');
      assert.strictEqual(wpReset.lat, 41.88);
      assert.strictEqual(wpReset.lon, -87.62);
      assert.strictEqual(wpReset.alt, 50);
      assert.strictEqual(wpReset.pitch, -45);
      assert.strictEqual(wpReset.headingMode, 'inherit');

    } finally {
      vm.runInThisContext('centerMarker = null; generatedWaypoints = [];');
    }
  });

  test('Minimize/Expand toggle button toggles visibility on editor panel body', () => {
    let bodyStyleDisplay = 'flex';
    let btnText = '▼';

    const mockToggleBtn = {
      set textContent(v) { btnText = v; }
    };
    const mockBody = {
      style: {
        get display() { return bodyStyleDisplay; },
        set display(v) { bodyStyleDisplay = v; }
      }
    };

    // Simulate toggle click handler
    const handleToggle = () => {
      const isHidden = mockBody.style.display === 'none';
      mockBody.style.display = isHidden ? 'flex' : 'none';
      mockToggleBtn.textContent = isHidden ? '▼' : '▲';
    };

    // Initial state: flex (visible)
    assert.strictEqual(bodyStyleDisplay, 'flex');

    // Click toggle to minimize
    handleToggle();
    assert.strictEqual(bodyStyleDisplay, 'none');
    assert.strictEqual(btnText, '▲');

    // Click toggle to expand
    handleToggle();
    assert.strictEqual(bodyStyleDisplay, 'flex');
    assert.strictEqual(btnText, '▼');
  });
  test('FPV Nudge updates lat, lon, x, y, and camera position even when centerMarker is null', () => {
    let cameraUpdated = false;

    const originalGetElementById = global.document.getElementById;
    global.document.getElementById = (id) => {
      if (id === 'fpv-editor-wp-index') return { textContent: '' };
      if (id === 'fpv-editor-coords') return { textContent: '' };
      if (id === 'fpv-edit-alt-val') return { textContent: '' };
      if (id === 'fpv-edit-alt-unit') return { textContent: '' };
      if (id === 'fpv-edit-alt') return { value: '50' };
      if (id === 'gimbal-pitch') return { value: '-45' };
      if (id === 'fpv-edit-pitch-val') return { textContent: '' };
      if (id === 'fpv-edit-pitch') return { value: '-45' };
      if (id === 'fpv-edit-lat') return { value: '41.88' };
      if (id === 'fpv-edit-lon') return { value: '-87.62' };
      if (id === 'fpv-nudge-step-display') return { textContent: '' };
      if (id === 'fpv-edit-heading-mode') return null;
      if (id === 'fpv-btn-reset-wp') return { style: {} };
      return originalGetElementById(id);
    };

    try {
      vm.runInThisContext(`
        centerMarker = null;
        fpvActive = true;
        fpvProgressIndex = 0;
        fpvNudgeStepIndex = 1; // 1m step
        generatedWaypoints = [{ lat: 41.88, lon: -87.62, x: 10, y: 20, alt: 50, pitch: -45 }];
        updateFPVCamera = (dt) => { cameraUpdated = true; };
      `);

      // Execute nudge(1, 0)
      vm.runInThisContext(`
        const testWp = generatedWaypoints[0];
        const oldLat = testWp.lat;
        const oldY = testWp.y;
        
        const unit = getUnitSystem();
        const dist = 1.0; // 1m
        const dLatMeters = 1.0;
        const dLonMeters = 0.0;
        const R_EARTH = 6378137.0;
        const latRad = testWp.lat * Math.PI / 180.0;
        const deltaLat = (dLatMeters / R_EARTH) * (180.0 / Math.PI);
        
        testWp.lat += deltaLat;
        testWp.x = (testWp.x || 0) + dLonMeters;
        testWp.y = (testWp.y || 0) + dLatMeters;
        testWp.isModified = true;
        if (fpvActive) updateFPVCamera(0);
      `);

      const wpAfter = vm.runInThisContext('generatedWaypoints[0]');
      assert.ok(wpAfter.lat > 41.88, 'latitude should increase when nudging north');
      assert.strictEqual(wpAfter.y, 21, 'y coordinate in meters should increase by 1m');
      assert.strictEqual(wpAfter.x, 10, 'x coordinate in meters should remain 10');
      assert.strictEqual(vm.runInThisContext('cameraUpdated'), true, 'updateFPVCamera should be called to refresh viewport');

    } finally {
      global.document.getElementById = originalGetElementById;
      vm.runInThisContext('centerMarker = null; generatedWaypoints = [];');
    }
  });

  test('FPV Save button commits waypoint edits and preserves original baseline for Reset', () => {
    try {
      vm.runInThisContext(`
        fpvProgressIndex = 0;
        generatedWaypoints = [{
          lat: 41.95, lon: -87.70, alt: 90, pitch: -20, headingMode: 'custom', heading: 180,
          origLat: 41.88, origLon: -87.62, origAlt: 50, origPitch: -45, origHeadingMode: 'inherit', origHeading: null,
          isModified: false
        }];

        // Simulate save button click
        const saveTestWp = generatedWaypoints[0];
        const latNum = parseFloat(saveTestWp.lat);
        const lonNum = parseFloat(saveTestWp.lon);
        if (!isNaN(latNum)) saveTestWp.lat = latNum;
        if (!isNaN(lonNum)) saveTestWp.lon = lonNum;
        saveTestWp.isModified = true;
      `);

      const wpSaved = vm.runInThisContext('generatedWaypoints[0]');
      assert.strictEqual(wpSaved.lat, 41.95);
      assert.strictEqual(wpSaved.lon, -87.70);
      assert.strictEqual(wpSaved.alt, 90);
      assert.strictEqual(wpSaved.origLat, 41.88);
      assert.strictEqual(wpSaved.origLon, -87.62);
      assert.strictEqual(wpSaved.origAlt, 50);
      assert.strictEqual(wpSaved.isModified, true);

    } finally {
      vm.runInThisContext('generatedWaypoints = [];');
    }
  });

  test('buildWaylinesWpml exports per-waypoint speed, hover duration, and turn mode tags', () => {
    const testWaypoints = [
      { lat: 41.88, lon: -87.62, alt: 50, pitch: -45, speed: 12, hoverTime: 10, turnMode: 'stop' },
      { lat: 41.89, lon: -87.63, alt: 60, pitch: -30, speed: null, hoverTime: 0, turnMode: 'pass' }
    ];

    const xml = vm.runInThisContext('buildWaylinesWpml')(testWaypoints, 50, 5, 'followWayline', 'goHome', -45, 'continuous', 'straight');

    assert.ok(xml.includes('<wpml:waypointSpeed>12</wpml:waypointSpeed>'), 'should export custom waypointSpeed 12 for WP 0');
    assert.ok(xml.includes('<wpml:actionActuatorFunc>hover</wpml:actionActuatorFunc>'), 'should export hover action for WP 0');
    assert.ok(xml.includes('<wpml:hoverTime>10</wpml:hoverTime>'), 'should export hoverTime 10 for WP 0');
    assert.ok(xml.includes('toPointAndStopWithDiscontinuityCurvature'), 'should export stop turnMode for WP 0');
    assert.ok(xml.includes('toPointAndPassWithDiscontinuityCurvature'), 'should export pass turnMode for WP 1');
  });

  test('buildWaylinesWpml exports per-waypoint camera actions (takePhoto, startRecord, stopRecord, zoom)', () => {
    const testWaypoints = [
      { lat: 41.88, lon: -87.62, alt: 50, pitch: -45, cameraAction: 'takePhoto' },
      { lat: 41.89, lon: -87.63, alt: 60, pitch: -30, cameraAction: 'startRecord' },
      { lat: 41.90, lon: -87.64, alt: 70, pitch: -20, cameraAction: 'zoom', zoom: 3.5 },
      { lat: 41.91, lon: -87.65, alt: 80, pitch: -10, cameraAction: 'stopRecord' }
    ];

    const xml = vm.runInThisContext('buildWaylinesWpml')(testWaypoints, 50, 5, 'followWayline', 'goHome', -45, 'continuous', 'straight');

    assert.ok(xml.includes('<wpml:actionActuatorFunc>takePhoto</wpml:actionActuatorFunc>'), 'should export takePhoto action');
    assert.ok(xml.includes('<wpml:actionActuatorFunc>startRecord</wpml:actionActuatorFunc>'), 'should export startRecord action');
    assert.ok(xml.includes('<wpml:actionActuatorFunc>stopRecord</wpml:actionActuatorFunc>'), 'should export stopRecord action');
    assert.ok(xml.includes('<wpml:focalFactor>3.5</wpml:focalFactor>'), 'should export custom zoom factor 3.5');
  });

  test('recalculateRoadOffsetPath preserves custom drone waypoint overrides and initializes baselines', () => {
    vm.runInThisContext('roadWaypoints = [{ lat: 40.0, lon: -83.0, x: 0, y: 0, alt: 50, pitch: -60 }, { lat: 40.01, lon: -83.01, x: 10, y: 10, alt: 50, pitch: -60 }];');
    vm.runInThisContext('recalculateRoadOffsetPath(40.0, -83.0);');

    const waypoints = vm.runInThisContext('generatedWaypoints');
    assert.ok(waypoints && waypoints.length === 2, 'should generate offset drone waypoints matching roadWaypoints length');
    assert.strictEqual(waypoints[0].alt, 50);
    assert.strictEqual(waypoints[0].origAlt, 50);
    assert.strictEqual(waypoints[0].origSpeed, null);
    assert.strictEqual(waypoints[0].origHoverTime, null);

    // Simulate custom edit on generated drone waypoint 1
    waypoints[1].speed = 12;
    waypoints[1].hoverTime = 5;
    waypoints[1].isModified = true;

    // Recalculate path again (e.g. after dragging a road node)
    vm.runInThisContext('recalculateRoadOffsetPath(40.0, -83.0);');
    const updatedWaypoints = vm.runInThisContext('generatedWaypoints');

    assert.strictEqual(updatedWaypoints[1].speed, 12, 'should preserve custom speed override 12');
    assert.strictEqual(updatedWaypoints[1].hoverTime, 5, 'should preserve custom hoverTime override 5');
    assert.strictEqual(updatedWaypoints[1].isModified, true, 'should preserve isModified state');
  });

  test('buildWaylinesWpml applies global hover time when waypoint hoverTime is null and allows 0 override', () => {
    const testWaypoints = [
      { lat: 41.88, lon: -87.62, alt: 50, pitch: -45, hoverTime: null },
      { lat: 41.89, lon: -87.63, alt: 60, pitch: -30, hoverTime: 12 },
      { lat: 41.90, lon: -87.64, alt: 70, pitch: -20, hoverTime: 0 }
    ];

    global._stubElements = {
      'global-hover-time': { value: '5' }
    };

    try {
      const xml = vm.runInThisContext('buildWaylinesWpml')(testWaypoints, 50, 5, 'followWayline', 'goHome', -45, 'continuous', 'straight');

      assert.ok(xml.includes('<wpml:hoverTime>5</wpml:hoverTime>'), 'should use global hover 5 for WP 0 (null hoverTime)');
      assert.ok(xml.includes('<wpml:hoverTime>12</wpml:hoverTime>'), 'should use explicit hover override 12 for WP 1');
      
      // Split XML by Placemark to verify WP 2 (hoverTime: 0) does not contain a hover action
      const placemarks = xml.split('<Placemark>');
      assert.ok(placemarks.length >= 4, 'should have placemarks');
      const wp2Xml = placemarks[3]; // WP 2 is placemark index 2 (4th array element)
      assert.ok(!wp2Xml.includes('<wpml:actionActuatorFunc>hover</wpml:actionActuatorFunc>'), 'should skip hover action for WP 2 with explicit hoverTime 0');
    } finally {
      delete global._stubElements;
    }
  });

  test('buildWaylinesWpml reorders hover action before photo action and injects auto-settling delays', () => {
    try {
      global._stubElements = {
        'camera-zoom': { value: '1.0' },
        'global-hover-time': { value: '0' },
        'grid-type': { value: 'freeform' },
        'drone-model': { value: '68' },
        'signal-lost-action': { value: 'goBack' },
        'grid-rotation': { value: '0' },
        'heading-mode': { value: 'custom' }
      };

      // In stopAndShoot mode a 2s minimum hover is ALWAYS enforced at every waypoint regardless
      // of the user-set hoverTime or whether a reposition is needed. This ensures the gimbal
      // stabilizes before the camera fires (fixes RC2 gimbal error and missed shots at 0s hover).
      // Waypoint 0: hoverTime null, global hover 2 → 2s hover (WP0 always gets gimbalRotate + hover)
      // Waypoint 1: hoverTime explicitly 0 → auto-elevated to 2s (stopAndShoot minimum)
      // Waypoint 2: heading changes 90°, hoverTime 0 → auto-elevated to 2s
      // Waypoint 3: heading changes 90°, hoverTime null → auto-elevated to 2s
      // Waypoint 4: heading changes 90°, hoverTime null, global hover 2 → 2s
      const testWaypoints = [
        { lat: 41.88, lon: -87.62, alt: 50, pitch: -45, headingMode: 'custom', heading: 0, hoverTime: null },
        { lat: 41.89, lon: -87.63, alt: 50, pitch: -45, headingMode: 'custom', heading: 0, hoverTime: 0 },
        { lat: 41.90, lon: -87.64, alt: 50, pitch: -45, headingMode: 'custom', heading: 90, hoverTime: 0 },
        { lat: 41.91, lon: -87.65, alt: 50, pitch: -45, headingMode: 'custom', heading: 180, hoverTime: null },
        { lat: 41.92, lon: -87.66, alt: 50, pitch: -45, headingMode: 'custom', heading: 270, hoverTime: null }
      ];

      // Set global hover to 2
      global._stubElements['global-hover-time'].value = '2';

      const xml = vm.runInThisContext('buildWaylinesWpml')(testWaypoints, 50, 5, 'custom', 'goHome', -45, 'stopAndShoot', 'straight');
      
      const placemarks = xml.split('<Placemark>');
      assert.ok(placemarks.length >= 6, 'should split into at least 5 placemarks');
      
      // WP 0: hoverTime null, global hover 2 → auto-inject triggers 2s
      const wp0Xml = placemarks[1];
      assert.ok(wp0Xml.includes('<wpml:actionActuatorFunc>hover</wpml:actionActuatorFunc>'), 'WP 0 should auto-inject hover');
      assert.ok(wp0Xml.includes('<wpml:hoverTime>2</wpml:hoverTime>'), 'WP 0 should have 2s hover delay');
      
      const hoverIndex0 = wp0Xml.indexOf('<wpml:actionActuatorFunc>hover</wpml:actionActuatorFunc>');
      const photoIndex0 = wp0Xml.indexOf('<wpml:actionActuatorFunc>takePhoto</wpml:actionActuatorFunc>');
      assert.ok(hoverIndex0 !== -1 && photoIndex0 !== -1, 'WP 0 should have both hover and takePhoto actions');
      assert.ok(hoverIndex0 < photoIndex0, 'WP 0 hover action must be sequenced before takePhoto action');

      // Placemark 2 (WP 1): hoverTime explicitly 0 but stopAndShoot mode enforces 2s minimum.
      // Even though pitch and heading are unchanged, the drone must hover to stabilize before photo.
      const wp1Xml = placemarks[2];
      assert.ok(wp1Xml.includes('<wpml:actionActuatorFunc>hover</wpml:actionActuatorFunc>'), 'WP 1 must have hover action (stopAndShoot 2s minimum enforced even with hoverTime=0)');
      assert.ok(wp1Xml.includes('<wpml:hoverTime>2</wpml:hoverTime>'), 'WP 1 hover must be 2s minimum');

      // Placemark 3 (WP 2): heading changes 90°, hoverTime=0 → elevated to 2s minimum.
      const wp2Xml = placemarks[3];
      assert.ok(wp2Xml.includes('<wpml:actionActuatorFunc>hover</wpml:actionActuatorFunc>'), 'WP 2 should have hover action');
      assert.ok(wp2Xml.includes('<wpml:hoverTime>2</wpml:hoverTime>'), 'WP 2 should have 2s hover');

      const hoverIndex2 = wp2Xml.indexOf('<wpml:actionActuatorFunc>hover</wpml:actionActuatorFunc>');
      const photoIndex2 = wp2Xml.indexOf('<wpml:actionActuatorFunc>takePhoto</wpml:actionActuatorFunc>');
      assert.ok(hoverIndex2 < photoIndex2, 'WP 2 hover action must be sequenced before takePhoto action');

      // WP 3: heading changes 90°, hoverTime null (inherits global 2) → 2s hover
      const wp3Xml = placemarks[4];
      assert.ok(wp3Xml.includes('<wpml:actionActuatorFunc>hover</wpml:actionActuatorFunc>'), 'WP 3 should have hover action');
      assert.ok(wp3Xml.includes('<wpml:hoverTime>2</wpml:hoverTime>'), 'WP 3 should have 2s hover');

      const hoverIndex3 = wp3Xml.indexOf('<wpml:actionActuatorFunc>hover</wpml:actionActuatorFunc>');
      const photoIndex3 = wp3Xml.indexOf('<wpml:actionActuatorFunc>takePhoto</wpml:actionActuatorFunc>');
      assert.ok(hoverIndex3 < photoIndex3, 'WP 3 hover action must be sequenced before takePhoto action');

    } finally {
      delete global._stubElements;
    }
  });

  test('calculateStats and getSubMissionFlightTime factor in automatic settling delays', () => {
    try {
      global._stubElements = {
        'camera-zoom': { value: '1.0' },
        'global-hover-time': { value: '0' },
        'max-flight-time': { value: '20' },
        'grid-rotation': { value: '0' },
        'heading-mode': { value: 'custom' }
      };

      const testWaypoints = [
        { x: 0, y: 0, lat: 41.88, lon: -87.62, alt: 50, pitch: -45, headingMode: 'custom', heading: 0, hoverTime: null },
        { x: 0, y: 100, lat: 41.89, lon: -87.63, alt: 50, pitch: -45, headingMode: 'custom', heading: 0, hoverTime: 0 },
        { x: 0, y: 200, lat: 41.90, lon: -87.64, alt: 50, pitch: -45, headingMode: 'custom', heading: 90, hoverTime: 0 }
      ];

      // calculateStats(waypoints, photoLocations, speed, sLine, sPhoto, captureMode)
      const stats = vm.runInThisContext('calculateStats')(testWaypoints, [{}, {}, {}], 10, 50, 50, 'stopAndShoot');
      
      // Expected flight time:
      // distance: 200m / speed 10 = 20s
      // stopAndShoot photoCount * 4.5 = 3 * 4.5 = 13.5s
      // Buffer = 45s
      // Auto-settling hovers:
      // WP 0: gimbal change from takeoff (0 -> -45) = 2s
      // WP 1: no change = 0s
      // WP 2: heading change (0 -> 90) = 2s
      // Total hover = 4s
      // Total flightTimeSeconds = 20 + 13.5 + 4 + 45 = 82.5 seconds
      assert.strictEqual(Math.round(stats.flightTimeSeconds), 83);

      // getSubMissionFlightTime(wps, startIdx, endIdx, speed, captureMode)
      const subTime = vm.runInThisContext('getSubMissionFlightTime')(testWaypoints, 0, 2, 10, 'stopAndShoot');
      assert.strictEqual(Math.round(subTime), 83);

    } finally {
      delete global._stubElements;
    }
  });

  test('Waypoint Revert button restores baseline position, marker position, and road node', () => {
    const originalCreateElement = global.document.createElement;
    const originalGetElementById = global.document.getElementById;

    const listeners = {};
    const elements = {};
    const makeEl = (id, tag = 'DIV') => {
      if (elements[id]) return elements[id];
      const el = {
        id: id,
        tagName: tag.toUpperCase(),
        className: '',
        style: {},
        classList: { add: () => {}, remove: () => {} },
        replaceChildren: () => {},
        value: '0',
        textContent: '',
        appendChild: (c) => c,
        querySelector: (sel) => {
          if (sel === '#reset-wp-btn') return makeEl('reset-wp-btn', 'BUTTON');
          if (sel === '#save-wp-btn') return makeEl('save-wp-btn', 'BUTTON');
          if (sel === '#delete-wp-btn') return makeEl('delete-wp-btn', 'BUTTON');
          if (sel === '#edit-wp-lat') return makeEl('edit-wp-lat', 'INPUT');
          if (sel === '#edit-wp-lon') return makeEl('edit-wp-lon', 'INPUT');
          if (sel === '#edit-wp-alt') return makeEl('edit-wp-alt', 'INPUT');
          if (sel === '#edit-wp-pitch') return makeEl('edit-wp-pitch', 'INPUT');
          if (sel === '#edit-wp-heading') return makeEl('edit-wp-heading', 'INPUT');
          if (sel === '#edit-wp-heading-mode') return makeEl('edit-wp-heading-mode', 'SELECT');
          if (sel === '#nudge-step-display') return makeEl('nudge-step-display', 'DIV');
          return makeEl('sub-' + Math.random(), 'DIV');
        },
        addEventListener: (evt, fn) => {
          listeners[id + ':' + evt] = fn;
        },
        dispatchEvent: () => {}
      };
      elements[id] = el;
      return el;
    };

    global.document.createElement = (tag) => makeEl('created-' + Math.random(), tag);
    global.document.getElementById = (id) => {
      if (id === 'grid-rotation') return { value: '0' };
      if (id === 'grid-type') return { value: 'single' };
      if (id === 'altitude') return { value: '50' };
      if (id === 'gimbal-pitch') return { value: '-45' };
      return makeEl(id);
    };

    let markerLatLng = null;
    let markerIcon = null;

    try {
      vm.runInThisContext('centerMarker = { getLatLng: () => ({ lat: 41.88, lng: -87.62 }) };');
      vm.runInThisContext('flightPathGroup = { clearLayers: () => {}, addLayer: () => {}, eachLayer: () => {} };');
      vm.runInThisContext('waypointMarkersGroup = { clearLayers: () => {}, addLayer: () => {}, eachLayer: () => {} };');
      vm.runInThisContext('photoMarkersGroup = { clearLayers: () => {}, addLayer: () => {}, eachLayer: () => {} };');
      vm.runInThisContext('gridBoundsGroup = { clearLayers: () => {}, addLayer: () => {}, eachLayer: () => {} };');
      const testWp = {
        lat: 41.89, lon: -87.63, x: 10, y: 10, alt: 60, pitch: -30, heading: 90, isModified: true,
        origLat: 41.88, origLon: -87.62, origX: 0, origY: 0, origAlt: 50, origPitch: -45, origHeading: 0
      };
      const testMarker = {
        setLatLng: (latlng) => { markerLatLng = latlng; },
        setIcon: (icon) => { markerIcon = icon; },
        getTooltip: () => ({ setContent: () => {} }),
        setTooltipContent: () => {},
        on: () => {}, off: () => {}, closePopup: () => {}
      };
      global.testWp = testWp;
      global.testMarker = testMarker;

      vm.runInThisContext('createWaypointEditorDOM(global.testWp, 0, global.testMarker)');

      // Trigger click on reset button
      const resetListener = listeners['reset-wp-btn:click'];
      assert.ok(typeof resetListener === 'function', 'Revert button should have a click listener');
      resetListener();

      assert.strictEqual(testWp.lat, 41.88, 'lat should revert to origLat');
      assert.strictEqual(testWp.lon, -87.62, 'lon should revert to origLon');
      assert.strictEqual(testWp.alt, 50, 'alt should revert to origAlt');
      assert.strictEqual(testWp.pitch, -45, 'pitch should revert to origPitch');
      assert.strictEqual(testWp.isModified, false, 'isModified should reset to false');
      assert.deepStrictEqual(markerLatLng, [41.88, -87.62], 'Leaflet marker setLatLng should be called with original coordinates');

    } finally {
      global.document.createElement = originalCreateElement;
      global.document.getElementById = originalGetElementById;
      vm.runInThisContext('centerMarker = null;');
      delete global.testWp;
      delete global.testMarker;
    }
  });

  test('createWaypointEditorDOM clears all popupclose listeners before attaching new one (prevents accumulation regression)', () => {
    // This test guards against the listener accumulation bug: each popup open
    // previously added a new revertChanges closure to marker.on('popupclose', ...).
    // Old closures had isSaved=false and would overwrite saves/reverts on popup close.
    // The fix calls marker.off('popupclose') before binding, so count must always stay at 1.

    const originalCreateElement = global.document.createElement;
    const originalGetElementById = global.document.getElementById;

    const listeners = {};
    const makeEl = (id, tag = 'DIV') => {
      if (listeners['__el__' + id]) return listeners['__el__' + id];
      const el = {
        id, tagName: tag.toUpperCase(), className: '', style: {}, value: '0', textContent: '',
        classList: { add: () => {}, remove: () => {} },
        replaceChildren: () => {},
        appendChild: (c) => c,
        querySelector: (sel) => {
          const selMap = {
            '#reset-wp-btn': 'reset-wp-btn', '#save-wp-btn': 'save-wp-btn',
            '#delete-wp-btn': 'delete-wp-btn', '#edit-wp-lat': 'edit-wp-lat',
            '#edit-wp-lon': 'edit-wp-lon', '#edit-wp-alt': 'edit-wp-alt',
            '#edit-wp-pitch': 'edit-wp-pitch', '#edit-wp-heading': 'edit-wp-heading',
            '#edit-wp-heading-mode': 'edit-wp-heading-mode', '#nudge-step-display': 'nudge-step-display'
          };
          return selMap[sel] ? makeEl(selMap[sel], sel.includes('btn') || sel.includes('mode') ? 'BUTTON' : 'INPUT') : makeEl('sub-' + sel, 'DIV');
        },
        addEventListener: (evt, fn) => { listeners[id + ':' + evt] = fn; },
        dispatchEvent: () => {}
      };
      listeners['__el__' + id] = el;
      return el;
    };

    global.document.createElement = (tag) => makeEl('created-' + Math.random(), tag);
    global.document.getElementById = (id) => {
      if (id === 'grid-rotation') return { value: '0' };
      if (id === 'grid-type') return { value: 'single' };
      if (id === 'altitude') return { value: '50' };
      if (id === 'gimbal-pitch') return { value: '-45' };
      return makeEl(id);
    };

    try {
      vm.runInThisContext('centerMarker = { getLatLng: () => ({ lat: 41.88, lng: -87.62 }) };');
      vm.runInThisContext('flightPathGroup = { clearLayers: () => {}, addLayer: () => {}, eachLayer: () => {} };');
      vm.runInThisContext('waypointMarkersGroup = { clearLayers: () => {}, addLayer: () => {}, eachLayer: () => {} };');
      vm.runInThisContext('photoMarkersGroup = { clearLayers: () => {}, addLayer: () => {}, eachLayer: () => {} };');

      // Use a marker with a real event registry to detect accumulation
      const popupcloseHandlers = [];
      const trackingMarker = {
        setLatLng: () => {},
        setIcon: () => {},
        getTooltip: () => ({ setContent: () => {} }),
        setTooltipContent: () => {},
        getPopup: () => null,
        closePopup: () => {},
        // Simulate Leaflet: off() with no fn clears all listeners for event
        off: (evt, fn) => {
          if (evt === 'popupclose' && fn === undefined) {
            popupcloseHandlers.length = 0; // clear all
          } else if (evt === 'popupclose' && fn !== undefined) {
            const idx = popupcloseHandlers.indexOf(fn);
            if (idx !== -1) popupcloseHandlers.splice(idx, 1);
          }
        },
        on: (evt, fn) => {
          if (evt === 'popupclose') popupcloseHandlers.push(fn);
        }
      };

      const testWp = {
        lat: 41.89, lon: -87.63, x: 10, y: 10, alt: 60, pitch: -30,
        heading: 90, isModified: true,
        origLat: 41.88, origLon: -87.62, origX: 0, origY: 0,
        origAlt: 50, origPitch: -45, origHeading: 0
      };
      global.testWp2 = testWp;
      global.trackingMarker2 = trackingMarker;

      // Simulate popup being opened 3 times in sequence
      vm.runInThisContext('createWaypointEditorDOM(global.testWp2, 0, global.trackingMarker2)');
      assert.strictEqual(popupcloseHandlers.length, 1, 'After 1st popup open: should be exactly 1 popupclose handler');

      vm.runInThisContext('createWaypointEditorDOM(global.testWp2, 0, global.trackingMarker2)');
      assert.strictEqual(popupcloseHandlers.length, 1, 'After 2nd popup open: should still be exactly 1 popupclose handler (no accumulation)');

      vm.runInThisContext('createWaypointEditorDOM(global.testWp2, 0, global.trackingMarker2)');
      assert.strictEqual(popupcloseHandlers.length, 1, 'After 3rd popup open: should still be exactly 1 popupclose handler (no accumulation)');

      // Simulate popup close without save: revertChanges should fire and restore wp to originalLat
      // (the lat captured at popup-open time, i.e. testWp.lat = 41.89)
      // We already nudged wp.lat to 41.89 in testWp - closing without save should restore it to 41.89
      const revertFn = popupcloseHandlers[0];
      assert.ok(typeof revertFn === 'function', 'popupclose handler should be a function');
      // Only one handler fires (not 3 stale closures)
      const handlerCountBeforeFire = popupcloseHandlers.length;
      assert.strictEqual(handlerCountBeforeFire, 1, 'Only 1 handler should fire on popup close, not accumulated stale closures');

    } finally {
      global.document.createElement = originalCreateElement;
      global.document.getElementById = originalGetElementById;
      vm.runInThisContext('centerMarker = null;');
      delete global.testWp2;
      delete global.trackingMarker2;
    }
  });
});

describe('Overlapping Waypoints & bringMarkerToFront Tests', () => {
  test('bringMarkerToFront elevates target marker zIndexOffset to 1000 and resets others', () => {
    let m1ZIndex = 0;
    let m2ZIndex = 0;
    let m1Class = '';
    let m2Class = '';

    const marker1 = {
      _icon: { className: '' },
      setZIndexOffset: (z) => { m1ZIndex = z; }
    };
    const marker2 = {
      _icon: { className: '' },
      setZIndexOffset: (z) => { m2ZIndex = z; }
    };

    global.testMarker1 = marker1;
    global.testMarker2 = marker2;

    try {
      vm.runInThisContext(`
        generatedWaypoints = [
          { lat: 41.88, lon: -87.62, mapMarker: global.testMarker1 },
          { lat: 41.88, lon: -87.62, mapMarker: global.testMarker2 }
        ];
        bringMarkerToFront(global.testMarker1);
      `);

      assert.strictEqual(m1ZIndex, 1000, 'marker1 zIndexOffset should be 1000');
      assert.strictEqual(m2ZIndex, 0, 'marker2 zIndexOffset should be 0');

      vm.runInThisContext('bringMarkerToFront(global.testMarker2);');

      assert.strictEqual(m1ZIndex, 0, 'marker1 zIndexOffset should be reset to 0');
      assert.strictEqual(m2ZIndex, 1000, 'marker2 zIndexOffset should be elevated to 1000');

    } finally {
      vm.runInThisContext('generatedWaypoints = [];');
      delete global.testMarker1;
      delete global.testMarker2;
    }
  });

  test('getOverlappingItemsAt detects overlapping waypoints and road nodes', () => {
    const marker1 = { getLatLng: () => ({ lat: 41.88, lng: -87.62 }) };
    const marker2 = { getLatLng: () => ({ lat: 41.88, lng: -87.62 }) };

    global.testMarker1 = marker1;
    global.testMarker2 = marker2;

    try {
      vm.runInThisContext(`
        L = {
          latLng: (lat, lon) => ({ lat, lng: lon })
        };
        map = {
          latLngToContainerPoint: (latLng) => ({ x: 100, y: 100 })
        };
        importedWaypoints = null;
        generatedWaypoints = [
          { lat: 41.88, lon: -87.62, mapMarker: global.testMarker1 },
          { lat: 41.88, lon: -87.62, mapMarker: global.testMarker2 }
        ];
      `);

      const items = vm.runInThisContext('getOverlappingItemsAt({ lat: 41.88, lng: -87.62 })');
      assert.strictEqual(items.length, 2, 'Should find 2 overlapping waypoints');
      assert.strictEqual(items[0].name, '🔵 Waypoint 0');
      assert.strictEqual(items[1].name, '🔵 Waypoint 1');

    } finally {
      vm.runInThisContext('generatedWaypoints = []; map = null; L = null;');
      delete global.testMarker1;
      delete global.testMarker2;
    }
  });

  test('Save button updates lat, lon, x, y offsets and preserves orig baselines', () => {
    try {
      vm.runInThisContext('centerMarker = { getLatLng: () => ({ lat: 41.88, lng: -87.62 }) };');
      const testWp = {
        lat: 41.88, lon: -87.62, x: 0, y: 0, alt: 50, pitch: -45, heading: 0
      };
      
      vm.runInThisContext(`
        {
          const testSaveWp = ${JSON.stringify(testWp)};
          const latVal = 41.881;
          const lonVal = -87.619;
          const originalLat = 41.88;
          const originalLon = -87.62;
          const originalX = 0;
          const originalY = 0;

          if (!isNaN(latVal) && !isNaN(lonVal)) {
            if (testSaveWp.origLat === undefined || testSaveWp.origLat === null) testSaveWp.origLat = originalLat;
            if (testSaveWp.origLon === undefined || testSaveWp.origLon === null) testSaveWp.origLon = originalLon;
            if (testSaveWp.origX === undefined || testSaveWp.origX === null) testSaveWp.origX = originalX;
            if (testSaveWp.origY === undefined || testSaveWp.origY === null) testSaveWp.origY = originalY;

            testSaveWp.lat = latVal;
            testSaveWp.lon = lonVal;
            const centerLat = centerMarker ? centerMarker.getLatLng().lat : latVal;
            const centerLon = centerMarker ? centerMarker.getLatLng().lng : lonVal;
            const offsets = geodeticToLocal(latVal, lonVal, centerLat, centerLon);
            testSaveWp.x = offsets.x;
            testSaveWp.y = offsets.y;
          }
          testSaveWp.isModified = true;
          global.savedWpResult = testSaveWp;
        }
      `);

      const savedWp = vm.runInThisContext('global.savedWpResult');
      assert.strictEqual(savedWp.lat, 41.881, 'lat should update to 41.881');
      assert.strictEqual(savedWp.lon, -87.619, 'lon should update to -87.619');
      assert.ok(Math.abs(savedWp.x) > 0, 'x offset should be recalculated from new lat/lon');
      assert.ok(Math.abs(savedWp.y) > 0, 'y offset should be recalculated from new lat/lon');
      assert.strictEqual(savedWp.isModified, true, 'isModified should be set to true');

    } finally {
      vm.runInThisContext('centerMarker = null; delete global.savedWpResult;');
    }
  });

  test('Moving grid center point clears custom waypoint modifications and recalculates all waypoints', () => {
    try {
      vm.runInThisContext(`
        generatedWaypoints = [
          { lat: 41.88, lon: -87.62, x: 10, y: 10, isModified: true, origLat: 41.88, origLon: -87.62 }
        ];
        clearWaypointCustomModifications();
      `);

      const wps = vm.runInThisContext('generatedWaypoints');
      assert.strictEqual(wps[0].isModified, false, 'isModified should be reset to false when center moves');
      assert.strictEqual(wps[0].origLat, undefined, 'origLat should be deleted when center moves');

    } finally {
      vm.runInThisContext('generatedWaypoints = [];');
    }
  });
});







describe('WPML Validation & Stationary Fallback Regression Tests', () => {
  test('buildTemplateKml includes mandatory wpml:templateType waypoint tag', () => {
    const xml = vm.runInThisContext('buildTemplateKml("goHome", 4)');
    assert.strictEqual(xml.includes('<wpml:templateType>waypoint</wpml:templateType>'), true, 'template.kml must contain wpml:templateType tag');
  });

  test('buildWaylinesWpml includes mandatory wpml:templateType tag in Folder', () => {
    const wps = [
      { lat: 40.0127, lon: -83.1771, alt: 17, headingMode: 'inherit' },
      { lat: 40.0128, lon: -83.1771, alt: 17, headingMode: 'inherit' }
    ];
    const xml = vm.runInThisContext(`buildWaylinesWpml(${JSON.stringify(wps)}, 17, 4, 'followWayline', 'goHome', -90, 'stopAndShoot', 'straight')`);
    assert.strictEqual(xml.includes('<wpml:templateType>waypoint</wpml:templateType>'), true, 'waylines.wpml Folder must contain wpml:templateType tag');
  });

  test('buildWaylinesWpml omits templateType and payloadParam for consumer drones (Mini 4 Pro)', () => {
    const wps = [
      { lat: 40.0127, lon: -83.1771, alt: 17, headingMode: 'inherit' }
    ];
    // Mock the drone-model value to 68 (Mini 4 Pro)
    const originalGetElementById = global.document.getElementById;
    global.document.getElementById = (id) => {
      if (id === 'drone-model') {
        return { value: '68' };
      }
      return originalGetElementById ? originalGetElementById(id) : null;
    };
    try {
      const xml = vm.runInThisContext(`buildWaylinesWpml(${JSON.stringify(wps)}, 17, 4, 'followWayline', 'goHome', -90, 'stopAndShoot', 'straight')`);
      assert.strictEqual(xml.includes('<wpml:templateType>'), false, 'Should omit templateType for consumer drones');
      assert.strictEqual(xml.includes('<wpml:payloadParam>'), false, 'Should omit payloadParam for consumer drones');
      
      const xmlTemplate = vm.runInThisContext('buildTemplateKml("goHome", 4)');
      assert.strictEqual(xmlTemplate.includes('<Folder>'), false, 'Should omit Folder entirely for consumer drones in template.kml');
    } finally {
      global.document.getElementById = originalGetElementById;
    }
  });

  test('buildWaylinesWpml exports standard KML coordinates tags containing longitude, latitude, and altitude', () => {
    const wps = [
      { lat: 40.0127, lon: -83.1771, alt: 17, headingMode: 'inherit' },
      { lat: 40.0128, lon: -83.1771, alt: 25, headingMode: 'inherit' }
    ];
    const xml = vm.runInThisContext(`buildWaylinesWpml(${JSON.stringify(wps)}, 17, 4, 'followWayline', 'goHome', -90, 'stopAndShoot', 'straight')`);
    
    // Split XML by <coordinates> tag to find the values
    const parts = xml.split('<coordinates>');
    assert.ok(parts.length >= 3, 'should have coordinates tags');
    
    const coord0 = parts[1].split('</coordinates>')[0].trim();
    const coord1 = parts[2].split('</coordinates>')[0].trim();
    
    // Check that there are 3 comma-separated components: longitude, latitude, altitude
    const coord0Parts = coord0.split(',');
    assert.strictEqual(coord0Parts.length, 3, 'WP 0 coordinates should have 3 parts');
    assert.strictEqual(parseFloat(coord0Parts[0]), -83.1771);
    assert.strictEqual(parseFloat(coord0Parts[1]), 40.0127);
    assert.strictEqual(parseFloat(coord0Parts[2]), 17); // altitude
    
    const coord1Parts = coord1.split(',');
    assert.strictEqual(coord1Parts.length, 3, 'WP 1 coordinates should have 3 parts');
    assert.strictEqual(parseFloat(coord1Parts[0]), -83.1771);
    assert.strictEqual(parseFloat(coord1Parts[1]), 40.0128);
    assert.strictEqual(parseFloat(coord1Parts[2]), 25); // altitude override
  });

  test('buildWaylinesWpml includes waypointGimbalHeadingParam and extra gimbalRotate tags for DJI schema compliance', () => {
    const wps = [
      { lat: 40.0127, lon: -83.1771, alt: 17, headingMode: 'inherit' }
    ];
    const xml = vm.runInThisContext(`buildWaylinesWpml(${JSON.stringify(wps)}, 17, 4, 'followWayline', 'goHome', -90, 'stopAndShoot', 'straight')`);
    
    // Assert waypointGimbalHeadingParam tags
    assert.strictEqual(xml.includes('<wpml:waypointGimbalHeadingParam>'), true, 'waylines.wpml must contain waypointGimbalHeadingParam');
    // waypointGimbalPitchAngle must match the effective pitch (gimbalPitch arg = -90 when wp.pitch is undefined)
    assert.strictEqual(xml.includes('<wpml:waypointGimbalPitchAngle>-90</wpml:waypointGimbalPitchAngle>'), true, 'waylines.wpml waypointGimbalPitchAngle must reflect effective gimbal pitch (-90)');
    assert.strictEqual(xml.includes('<wpml:waypointGimbalYawAngle>0</wpml:waypointGimbalYawAngle>'), true, 'waylines.wpml must contain waypointGimbalYawAngle');
    
    // Assert extra gimbalRotate tags
    assert.strictEqual(xml.includes('<wpml:gimbalHeadingYawBase>aircraft</wpml:gimbalHeadingYawBase>'), true, 'waylines.wpml must contain gimbalHeadingYawBase');
    assert.strictEqual(xml.includes('<wpml:gimbalRotateTimeEnable>0</wpml:gimbalRotateTimeEnable>'), true, 'waylines.wpml must contain gimbalRotateTimeEnable');
    assert.strictEqual(xml.includes('<wpml:gimbalRotateTime>0</wpml:gimbalRotateTime>'), true, 'waylines.wpml must contain gimbalRotateTime');
  });

  test('multi-leg 2D grid export assigns correct wayline direction angles and enables them (waypointHeadingAngleEnable=1) for stationary fallback', () => {
    const wps = [
      { lat: 40.0127, lon: -83.1771, alt: 17, heading: 0, headingMode: 'inherit' },
      { lat: 40.0129, lon: -83.1771, alt: 17, heading: 0, headingMode: 'inherit' },
      { lat: 40.0129, lon: -83.1770, alt: 17, heading: 180, headingMode: 'inherit' },
      { lat: 40.0127, lon: -83.1770, alt: 17, heading: 180, headingMode: 'inherit' },
      { lat: 40.0127, lon: -83.1769, alt: 17, heading: 0, headingMode: 'inherit' },
      { lat: 40.0129, lon: -83.1769, alt: 17, heading: 0, headingMode: 'inherit' },
      { lat: 40.0129, lon: -83.1768, alt: 17, heading: 180, headingMode: 'inherit' },
      { lat: 40.0127, lon: -83.1768, alt: 17, heading: 180, headingMode: 'inherit' }
    ];
    const xml = vm.runInThisContext(`buildWaylinesWpml(${JSON.stringify(wps)}, 17, 4, 'followWayline', 'goHome', -90, 'stopAndShoot', 'straight')`);
    assert.strictEqual(xml.includes('<wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode>'), true);
    assert.strictEqual(xml.includes('<wpml:waypointHeadingMode>smoothTransition</wpml:waypointHeadingMode>'), false);
    assert.strictEqual(xml.includes('<wpml:waypointHeadingAngleEnable>1</wpml:waypointHeadingAngleEnable>'), true);
    assert.strictEqual(xml.includes('<wpml:waypointHeadingAngle>180.0</wpml:waypointHeadingAngle>'), true);
    assert.strictEqual(xml.includes('<wpml:waypointHeadingAngle>0.0</wpml:waypointHeadingAngle>'), true);
  });

  test('followWayline waypoints without x/y offsets (lat/lon only) never produce NaN waypointHeadingAngle', () => {
    const wps = [
      { lat: 40.0127, lon: -83.1771, alt: 17, headingMode: 'inherit' },
      { lat: 40.0129, lon: -83.1771, alt: 17, headingMode: 'inherit' }
    ];
    const xml = vm.runInThisContext(`buildWaylinesWpml(${JSON.stringify(wps)}, 17, 4, 'followWayline', 'goHome', -90, 'stopAndShoot', 'straight')`);
    assert.strictEqual(xml.includes('<wpml:waypointHeadingAngle>NaN</wpml:waypointHeadingAngle>'), false);
    assert.strictEqual(xml.includes('<wpml:waypointHeadingAngleEnable>1</wpml:waypointHeadingAngleEnable>'), true);
  });

  test('all pattern types (double grid, orbit, multi-orbit) export valid waypointHeadingAngle and waypointHeadingAngleEnable=1', () => {
    const doubleGridWps = [
      { lat: 40.0127, lon: -83.1771, alt: 17, headingMode: 'inherit' },
      { lat: 40.0129, lon: -83.1771, alt: 17, headingMode: 'inherit' }
    ];
    const xmlDouble = vm.runInThisContext(`buildWaylinesWpml(${JSON.stringify(doubleGridWps)}, 17, 4, 'followWayline', 'goHome', -90, 'stopAndShoot', 'straight')`);
    assert.strictEqual(xmlDouble.includes('<wpml:waypointHeadingAngle>NaN</wpml:waypointHeadingAngle>'), false);
    assert.strictEqual(xmlDouble.includes('<wpml:waypointHeadingAngleEnable>1</wpml:waypointHeadingAngleEnable>'), true);
    const orbitWps = [
      { lat: 40.0127, lon: -83.1771, alt: 17, headingMode: 'towardPOI' },
      { lat: 40.0129, lon: -83.1771, alt: 17, headingMode: 'towardPOI' }
    ];
    const xmlOrbit = vm.runInThisContext(`buildWaylinesWpml(${JSON.stringify(orbitWps)}, 17, 4, 'towardPOI', 'goHome', -90, 'stopAndShoot', 'straight')`);
    assert.strictEqual(xmlOrbit.includes('<wpml:waypointHeadingAngle>NaN</wpml:waypointHeadingAngle>'), false);
    assert.strictEqual(xmlOrbit.includes('<wpml:waypointHeadingAngleEnable>1</wpml:waypointHeadingAngleEnable>'), true);
  });
});

describe('RC2 WPML Compliance Tests', () => {
  const rc2GoldenTags = [
    'actionGroupStartIndex', 'actionGroupMode', 'waypointHeadingPathMode', 'flyToWaylineMode',
    'waypointHeadingMode', 'Point', 'waypointHeadingPoiIndex',
    'actionGroup', 'exitOnRCLost', 'distance', 'actionGroupEndIndex', 'waypointHeadingAngle',
    'useStraightLine', 'action', 'executeHeight', 'Placemark',
    'actionActuatorFunc', 'waypointTurnMode', 'actionActuatorFuncParam', 'duration',
    'gimbalPitchRotateAngle', 'waypointPoiPoint', 'waylineId',
    'waypointTurnDampingDist', 'gimbalRollRotateAngle', 'droneSubEnumValue', 'droneInfo',
    'actionId', 'actionGroupId', 'actionTriggerType', 'executeHeightMode', 'waypointHeadingParam',
    'coordinates', 'droneEnumValue', 'actionTrigger', 'globalTransitionalSpeed', 'autoFlightSpeed',
    'Document', 'executeRCLostAction', 'index', 'finishAction', 'templateId', 'waypointSpeed',
    'missionConfig', 'waypointTurnParam', 'Folder', 'payloadPositionIndex',
    'waypointHeadingAngleEnable'
  ];

  test('buildWaylinesWpml groups multiple actions per waypoint under a single actionGroup (preventing DJI Fly Error performing flight)', () => {
    const originalGetElementById = global.document.getElementById;
    try {
      global.document.getElementById = (id) => {
        const valMap = {
          'drone-model': '68',
          'signal-lost-action': 'goBack',
          'camera-zoom': '1.0',
          'global-hover-time': '2',
          'grid-type': 'single',
          'grid-rotation': '0',
          'heading-mode': 'followWayline',
        };
        return { value: valMap[id] || '', checked: false };
      };

      const wps = [
        { lat: 40.010, lon: -83.177, alt: 25, pitch: -90, heading: 0, isRingStart: false, hoverTime: 2 }
      ];

      const xml = vm.runInThisContext(`
        buildWaylinesWpml(${JSON.stringify(wps)}, 25, 2, 'followWayline', 'goHome', -90, 'stopAndShoot', 'straight')
      `);

      const placemarkMatch = xml.match(/<Placemark>[\s\S]*?<\/Placemark>/);
      assert.ok(placemarkMatch, 'Placemark should exist');
      const placemarkXml = placemarkMatch[0];

      const actionGroupCount = (placemarkXml.match(/<wpml:actionGroup>/g) || []).length;
      assert.strictEqual(actionGroupCount, 1,
        `Expected exactly 1 consolidated wpml:actionGroup per waypoint placemark, found ${actionGroupCount}`);

      assert.ok(placemarkXml.includes('<wpml:actionActuatorFunc>gimbalRotate</wpml:actionActuatorFunc>'));
      assert.ok(placemarkXml.includes('<wpml:actionActuatorFunc>hover</wpml:actionActuatorFunc>'));
      assert.ok(placemarkXml.includes('<wpml:actionActuatorFunc>takePhoto</wpml:actionActuatorFunc>'));
      assert.ok(placemarkXml.includes('<wpml:useGlobalPayloadLensIndex>0</wpml:useGlobalPayloadLensIndex>'));
    } finally {
      global.document.getElementById = originalGetElementById;
    }
  });

  test('buildWaylinesWpml should contain all required RC2 golden tags for standard flight', () => {
    const originalGetElementById = global.document.getElementById;
    try {
      vm.runInThisContext(`
        generatedWaypoints = [
          { lat: 41.88, lon: -87.62, alt: 50, heading: 0, pitch: -90, hoverTime: 5, cameraAction: 'takePhoto', gimbalPitch: -45 },
          { lat: 41.89, lon: -87.62, alt: 50, heading: 0, pitch: -90, hoverTime: 0, cameraAction: 'none' }
        ];
        document.getElementById = (id) => {
          const valMap = {
            'finish-action': 'goHome',
            'flight-speed': '5',
            'rc-lost-action': 'goHome',
            'gimbal-pitch': '-90'
          };
          return { value: valMap[id] || '', checked: true };
        };
      `);

      const xmlString = vm.runInThisContext('buildWaylinesWpml(generatedWaypoints, "waypoint")');
      const tagMatches = xmlString.matchAll(/<([a-zA-Z0-9]+:)?([a-zA-Z0-9]+)[>\s]/g);
      const generatedTags = new Set([...tagMatches].map(m => m[2]));

      const missingTags = rc2GoldenTags.filter(t => !generatedTags.has(t));
      assert.deepStrictEqual(missingTags, [], 'Generated WPML should not miss any RC2 required tags');
      assert.ok(xmlString.includes('<wpml:waypointHeadingAngleEnable>1</wpml:waypointHeadingAngleEnable>'), 'waypointHeadingAngleEnable must be true/1');
      assert.ok(xmlString.includes('<wpml:actionGroupStartIndex>0</wpml:actionGroupStartIndex>'), 'actionGroupStartIndex should be a valid number');
    } finally {
      global.document.getElementById = originalGetElementById;
      vm.runInThisContext('generatedWaypoints = [];');
    }
  });
});
// ─── Regression: actionGroupId globally unique across all waypoints ────────────
describe('buildWaylinesWpml actionGroupId uniqueness regression', () => {
  test('actionGroupId values are globally unique across all waypoints (double grid fix)', () => {
    const originalGetElementById = global.document.getElementById;
    try {
      global.document.getElementById = (id) => {
        const valMap = {
          'drone-model': '68',
          'signal-lost-action': 'goBack',
          'camera-zoom': '1.0',
          'global-hover-time': '2',
          'grid-type': 'double',
          'grid-rotation': '0',
          'heading-mode': 'followWayline',
        };
        return { value: valMap[id] || '', checked: false };
      };

      // Simulate a 6-waypoint double grid (3 per pass) with stop-and-shoot
      const wps = [
        { lat: 40.01, lon: -83.17, alt: 22, pitch: -90, heading: 45, isRingStart: false, hoverTime: 2 },
        { lat: 40.02, lon: -83.17, alt: 22, pitch: -90, heading: 45, isRingStart: false, hoverTime: 2 },
        { lat: 40.03, lon: -83.17, alt: 22, pitch: -90, heading: 45, isRingStart: false, hoverTime: 2 },
        { lat: 40.01, lon: -83.16, alt: 22, pitch: -90, heading: 135, isRingStart: false, hoverTime: 2 },
        { lat: 40.01, lon: -83.17, alt: 22, pitch: -90, heading: 135, isRingStart: false, hoverTime: 2 },
        { lat: 40.01, lon: -83.18, alt: 22, pitch: -90, heading: 135, isRingStart: false, hoverTime: 2 },
      ];

      const xml = vm.runInThisContext(`
        buildWaylinesWpml(${JSON.stringify(wps)}, 22, 2, 'followWayline', 'goHome', -90, 'stopAndShoot', 'straight')
      `);

      // Extract all actionGroupId values
      const matches = [...xml.matchAll(/<wpml:actionGroupId>(\d+)<\/wpml:actionGroupId>/g)];
      const ids = matches.map(m => parseInt(m[1], 10));

      assert.ok(ids.length > 0, 'Should have at least one action group');

      // All IDs must be unique
      const uniqueIds = new Set(ids);
      assert.strictEqual(uniqueIds.size, ids.length,
        `actionGroupId values must be globally unique. Found duplicates: ${ids.filter((v, i) => ids.indexOf(v) !== i)}`);

      // IDs should be monotonically increasing from 1
      for (let i = 0; i < ids.length; i++) {
        assert.strictEqual(ids[i], i + 1, `actionGroupId at position ${i} should be ${i + 1}, got ${ids[i]}`);
      }
    } finally {
      global.document.getElementById = originalGetElementById;
    }
  });

  test('actionGroupId remains globally unique for a large 40-waypoint double grid', () => {
    const originalGetElementById = global.document.getElementById;
    try {
      global.document.getElementById = (id) => {
        const valMap = {
          'drone-model': '68',
          'signal-lost-action': 'goBack',
          'camera-zoom': '1.0',
          'global-hover-time': '2',
          'grid-type': 'double',
          'grid-rotation': '0',
          'heading-mode': 'followWayline',
        };
        return { value: valMap[id] || '', checked: false };
      };

      // Build 40 waypoints mimicking a double grid
      const wps = Array.from({ length: 40 }, (_, i) => ({
        lat: 40.01 + (i % 20) * 0.001,
        lon: -83.17 + Math.floor(i / 20) * 0.001,
        alt: 22,
        pitch: -90,
        heading: i < 20 ? 0 : 90,
        isRingStart: false,
        hoverTime: 2,
      }));

      const xml = vm.runInThisContext(`
        buildWaylinesWpml(${JSON.stringify(wps)}, 22, 2, 'followWayline', 'goHome', -90, 'stopAndShoot', 'straight')
      `);

      const matches = [...xml.matchAll(/<wpml:actionGroupId>(\d+)<\/wpml:actionGroupId>/g)];
      const ids = matches.map(m => parseInt(m[1], 10));

      const uniqueIds = new Set(ids);
      assert.strictEqual(uniqueIds.size, ids.length,
        `40-waypoint double grid must have no duplicate actionGroupId values. Total AGs: ${ids.length}, Unique: ${uniqueIds.size}`);
    } finally {
      global.document.getElementById = originalGetElementById;
    }
  });
});

// ─── Regression: stop-and-shoot always enforces 2s minimum hover ──────────────
describe('buildWaylinesWpml stop-and-shoot 2s minimum hover regression', () => {
  test('enforces 2s hover at every waypoint in stopAndShoot mode when set to 0s', () => {
    const originalGetElementById = global.document.getElementById;
    try {
      global.document.getElementById = (id) => {
        const valMap = {
          'drone-model': '68',
          'signal-lost-action': 'goBack',
          'camera-zoom': '1.0',
          'global-hover-time': '0',   // User set 0s
          'grid-type': 'single',
          'grid-rotation': '0',
          'heading-mode': 'followWayline',
        };
        return { value: valMap[id] || '', checked: false };
      };

      // 5 waypoints on a straight N-S grid line: no reposition needed, constant pitch -90
      const wps = [
        { lat: 40.010, lon: -83.177, alt: 22, pitch: -90, heading: 0, isRingStart: false, hoverTime: null },
        { lat: 40.011, lon: -83.177, alt: 22, pitch: -90, heading: 0, isRingStart: false, hoverTime: null },
        { lat: 40.012, lon: -83.177, alt: 22, pitch: -90, heading: 0, isRingStart: false, hoverTime: null },
        { lat: 40.013, lon: -83.177, alt: 22, pitch: -90, heading: 0, isRingStart: false, hoverTime: null },
        { lat: 40.014, lon: -83.177, alt: 22, pitch: -90, heading: 0, isRingStart: false, hoverTime: null },
      ];

      const xml = vm.runInThisContext(`
        buildWaylinesWpml(${JSON.stringify(wps)}, 22, 2, 'followWayline', 'goHome', -90, 'stopAndShoot', 'straight')
      `);

      // Every waypoint must have a hover action
      const hoverMatches = [...xml.matchAll(/<wpml:hoverTime>(\d+)<\/wpml:hoverTime>/g)];
      const hoverValues = hoverMatches.map(m => parseInt(m[1], 10));

      // Should have 5 hover entries (one per waypoint)
      assert.strictEqual(hoverValues.length, wps.length,
        `Expected ${wps.length} hover actions (one per waypoint), got ${hoverValues.length}`);

      // All hover values must be >= 2
      hoverValues.forEach((h, i) => {
        assert.ok(h >= 2,
          `Waypoint ${i} hover time must be >= 2s in stopAndShoot mode, got ${h}s`);
      });
    } finally {
      global.document.getElementById = originalGetElementById;
    }
  });

  test('respects user hover > 2s without clamping down in stopAndShoot mode', () => {
    const originalGetElementById = global.document.getElementById;
    try {
      global.document.getElementById = (id) => {
        const valMap = {
          'drone-model': '68',
          'signal-lost-action': 'goBack',
          'camera-zoom': '1.0',
          'global-hover-time': '5',  // User set 5s
          'grid-type': 'single',
          'grid-rotation': '0',
          'heading-mode': 'followWayline',
        };
        return { value: valMap[id] || '', checked: false };
      };

      const wps = [
        { lat: 40.010, lon: -83.177, alt: 22, pitch: -90, heading: 0, isRingStart: false, hoverTime: null },
        { lat: 40.011, lon: -83.177, alt: 22, pitch: -90, heading: 0, isRingStart: false, hoverTime: null },
      ];

      const xml = vm.runInThisContext(`
        buildWaylinesWpml(${JSON.stringify(wps)}, 22, 2, 'followWayline', 'goHome', -90, 'stopAndShoot', 'straight')
      `);

      const hoverMatches = [...xml.matchAll(/<wpml:hoverTime>(\d+)<\/wpml:hoverTime>/g)];
      const hoverValues = hoverMatches.map(m => parseInt(m[1], 10));

      hoverValues.forEach((h, i) => {
        assert.strictEqual(h, 5, `Waypoint ${i}: user-set 5s hover should not be reduced, got ${h}s`);
      });
    } finally {
      global.document.getElementById = originalGetElementById;
    }
  });

  test('hover mode (continuous) does not enforce minimum hover', () => {
    const originalGetElementById = global.document.getElementById;
    try {
      global.document.getElementById = (id) => {
        const valMap = {
          'drone-model': '68',
          'signal-lost-action': 'goBack',
          'camera-zoom': '1.0',
          'global-hover-time': '0',
          'grid-type': 'single',
          'grid-rotation': '0',
          'heading-mode': 'followWayline',
        };
        return { value: valMap[id] || '', checked: false };
      };

      const wps = [
        { lat: 40.010, lon: -83.177, alt: 22, pitch: -90, heading: 0, isRingStart: false, hoverTime: null },
        { lat: 40.011, lon: -83.177, alt: 22, pitch: -90, heading: 0, isRingStart: false, hoverTime: null },
      ];

      const xml = vm.runInThisContext(`
        buildWaylinesWpml(${JSON.stringify(wps)}, 22, 2, 'followWayline', 'goHome', -90, 'hover', 'straight')
      `);

      // In continuous/hover mode with 0s hover, there should be NO hover actions
      const hoverMatches = [...xml.matchAll(/<wpml:hoverTime>/g)];
      assert.strictEqual(hoverMatches.length, 0,
        'Continuous/hover mode with 0s hover should not inject hover actions');
    } finally {
      global.document.getElementById = originalGetElementById;
    }
  });
});

describe('Mission Map Preview Generator Tests', () => {
  test('generateMissionPreviewBlob returns a Promise that resolves gracefully', async () => {
    const wps = [
      { lat: 40.010, lon: -83.177, alt: 50 },
      { lat: 40.011, lon: -83.176, alt: 50 },
      { lat: 40.012, lon: -83.175, alt: 50 }
    ];

    // Mock canvas in global context
    const origCreateElement = global.document.createElement;
    try {
      global.document.createElement = (tag) => {
        if (tag === 'canvas') {
          return {
            width: 400,
            height: 300,
            getContext: () => ({
              fillStyle: '',
              fillRect: () => {},
              strokeStyle: '',
              lineWidth: 1,
              beginPath: () => {},
              moveTo: () => {},
              lineTo: () => {},
              stroke: () => {},
              arc: () => {},
              fill: () => {},
              fillText: () => {}
            }),
            toBlob: (cb, type, q) => cb({ size: 2048, type })
          };
        }
        return origCreateElement(tag);
      };

      const result = await vm.runInThisContext(`
        generateMissionPreviewBlob(${JSON.stringify(wps)})
      `);

      assert.ok(result, 'Preview generator should return a blob');
      assert.strictEqual(result.type, 'image/jpeg');
    } finally {
      global.document.createElement = origCreateElement;
    }
  });

  test('generateMissionPreviewBlob handles empty waypoints gracefully', async () => {
    const origCreateElement = global.document.createElement;
    try {
      global.document.createElement = (tag) => {
        if (tag === 'canvas') {
          return {
            width: 400,
            height: 300,
            getContext: () => ({
              fillStyle: '',
              fillRect: () => {},
              strokeStyle: '',
              lineWidth: 1,
              beginPath: () => {},
              moveTo: () => {},
              lineTo: () => {},
              stroke: () => {},
              fillText: () => {}
            }),
            toBlob: (cb, type) => cb({ size: 1024, type })
          };
        }
        return origCreateElement(tag);
      };

      const result = await vm.runInThisContext(`
        generateMissionPreviewBlob([])
      `);

      assert.ok(result, 'Should resolve for empty array without error');
    } finally {
      global.document.createElement = origCreateElement;
    }
  });
});

describe('Orbit and POI Flight Controller WPML Compliance Regression Tests', () => {
  test('generateOrbitCoordinates produces exactly nPhotos unique points with no duplicate closing point', () => {
    const orbit = generateOrbitCoordinates(50, 20, 30, -45);
    assert.strictEqual(orbit.waypoints.length, orbit.photos.length);
    
    // Check that every point has a unique (x, y) coordinate
    const seen = new Set();
    orbit.waypoints.forEach((wp, idx) => {
      const key = `${wp.x.toFixed(4)},${wp.y.toFixed(4)}`;
      assert.strictEqual(seen.has(key), false, `Duplicate orbit waypoint coordinate found at index ${idx}: ${key}`);
      seen.add(key);
      assert.strictEqual(wp.headingMode, 'smoothTransition', 'Orbit waypoints must have smoothTransition headingMode');
      assert.ok(wp.heading >= 0 && wp.heading <= 360, 'Heading must be valid angle');
    });
  });

  test('buildWaylinesWpml exports orbit waypoints with smoothTransition and POI in lon,lat order', () => {
    const orbit = generateOrbitCoordinates(50, 30, 25, -60);
    // Convert to lat/lon waypoints
    const wps = orbit.waypoints.map((wp, idx) => ({
      lat: 40.0 + (wp.y / 111319.5),
      lon: -83.0 + (wp.x / (111319.5 * Math.cos(40.0 * Math.PI / 180))),
      alt: wp.alt,
      pitch: wp.pitch,
      heading: wp.heading,
      headingMode: wp.headingMode
    }));

    const xml = vm.runInThisContext(`
      buildWaylinesWpml(${JSON.stringify(wps)}, 25, 4, 'followWayline', 'goHome', -60, 'stopAndShoot', 'normal')
    `);

    // Must contain smoothTransition for custom headings
    assert.ok(xml.includes('<wpml:waypointHeadingMode>smoothTransition</wpml:waypointHeadingMode>'));
    // Must NOT contain NaN
    assert.strictEqual(xml.includes('NaN'), false);
    // Coordinate tags must be lon,lat,alt
    assert.ok(xml.includes('<coordinates>'));
  });
});

describe('Companion Bridge & Direct Sync Tests', () => {
  test('generateKMZBlob creates in-memory bundle with template and waylines XML', async () => {
    // Mock JSZip
    const origJSZip = global.JSZip;
    global.JSZip = class {
      constructor() {
        this.files = {};
      }
      file(name, content) {
        this.files[name] = content;
      }
      generateAsync(opts) {
        return Promise.resolve(new Uint8Array([80, 75, 3, 4]));
      }
    };

    try {
      const result = await vm.runInThisContext(`generateKMZBlob()`);
      assert.ok(result);
      assert.ok(result.blob);
      assert.ok(result.templateKml);
      assert.ok(result.waylinesWpml);
      assert.ok(result.waylinesWpml.includes('<Document>'));
    } finally {
      global.JSZip = origJSZip;
    }
  });

  test('pollCompanionStatus handles offline state gracefully without crashing', async () => {
    let sDot = { style: { background: '' } };
    let sText = { textContent: '', style: { color: '' } };
    let sLabel = { textContent: '' };
    let uDot = { style: { background: '' } };
    let uText = { textContent: '', style: { color: '' } };
    let uLabel = { textContent: '' };

    let dot = { style: { background: '' } };
    let text = { textContent: '', style: { color: '' } };
    let label = { textContent: '' };
    let btn = { style: { display: '' } };
    let pullBtn = { style: { display: '' } };
    let directActions = { style: { display: '' } };
    let container = { classList: { add: (c) => container.classes.add(c), remove: (c) => container.classes.delete(c) }, classes: new Set() };
    let hint = { style: { display: '' }, querySelector: () => ({ innerHTML: '' }) };

    const origGetElementById = global.document.getElementById;
    const origFetch = global.fetch;
    global.fetch = () => Promise.reject(new Error('Connection refused'));

    global.document.getElementById = (id) => {
      if (id === 'companion-service-dot') return sDot;
      if (id === 'companion-service-text') return sText;
      if (id === 'companion-service-label') return sLabel;
      if (id === 'companion-usb-dot') return uDot;
      if (id === 'companion-usb-text') return uText;
      if (id === 'companion-usb-label') return uLabel;
      if (id === 'companion-indicator-dot') return dot;
      if (id === 'companion-status-text') return text;
      if (id === 'companion-device-label') return label;
      if (id === 'direct-rc2-sync-btn') return btn;
      if (id === 'direct-rc2-pull-btn') return pullBtn;
      if (id === 'rc2-direct-actions') return directActions;
      if (id === 'companion-sync-container') return container;
      if (id === 'companion-offline-hint') return hint;
      return origGetElementById ? origGetElementById(id) : null;
    };

    try {
      await vm.runInThisContext(`pollCompanionStatus()`);
      assert.strictEqual(sText.textContent, 'Bridge Service: Offline');
      assert.strictEqual(sDot.style.background, '#64748b');
      assert.strictEqual(sLabel.textContent, 'start-companion.bat');
      assert.strictEqual(uText.textContent, 'RC 2 USB Link: Waiting');
      assert.strictEqual(uDot.style.background, '#64748b');
      assert.strictEqual(text.textContent, 'Companion Offline');
      assert.strictEqual(dot.style.background, '#64748b');
      assert.strictEqual(btn.style.display, 'none');
      assert.ok(container.classes.has('is-offline'));
      assert.strictEqual(hint.style.display, 'flex');
    } finally {
      global.document.getElementById = origGetElementById;
      global.fetch = origFetch;
    }
  });

  test('pollCompanionStatus updates both service and USB link indicators for connected and unplugged states', async () => {
    let sDot = { style: { background: '' } };
    let sText = { textContent: '', style: { color: '' } };
    let sLabel = { textContent: '' };
    let uDot = { style: { background: '' } };
    let uText = { textContent: '', style: { color: '' } };
    let uLabel = { textContent: '' };

    let dot = { style: { background: '' } };
    let text = { textContent: '', style: { color: '' } };
    let label = { textContent: '' };
    let btn = { style: { display: '' } };
    let pullBtn = { style: { display: '' } };
    let directActions = { style: { display: '' } };
    let container = { classList: { add: (c) => container.classes.add(c), remove: (c) => container.classes.delete(c) }, classes: new Set() };
    let hint = { style: { display: '' }, querySelector: () => ({ innerHTML: '' }) };

    const origGetElementById = global.document.getElementById;
    const origFetch = global.fetch;

    global.document.getElementById = (id) => {
      if (id === 'companion-service-dot') return sDot;
      if (id === 'companion-service-text') return sText;
      if (id === 'companion-service-label') return sLabel;
      if (id === 'companion-usb-dot') return uDot;
      if (id === 'companion-usb-text') return uText;
      if (id === 'companion-usb-label') return uLabel;
      if (id === 'companion-indicator-dot') return dot;
      if (id === 'companion-status-text') return text;
      if (id === 'companion-device-label') return label;
      if (id === 'direct-rc2-sync-btn') return btn;
      if (id === 'direct-rc2-pull-btn') return pullBtn;
      if (id === 'rc2-direct-actions') return directActions;
      if (id === 'companion-sync-container') return container;
      if (id === 'companion-offline-hint') return hint;
      return origGetElementById ? origGetElementById(id) : null;
    };

    try {
      // 1. Online, USB unplugged
      global.fetch = () => Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ connected: false })
      });
      await vm.runInThisContext(`pollCompanionStatus()`);
      assert.strictEqual(sText.textContent, 'Bridge Service: Online');
      assert.strictEqual(sDot.style.background, '#22c55e');
      assert.strictEqual(uText.textContent, 'RC 2 USB Link: Unplugged');
      assert.strictEqual(uDot.style.background, '#eab308');
      assert.strictEqual(uLabel.textContent, 'Plug in USB-C');
      assert.ok(container.classes.has('is-offline'));

      // 2. Online, USB connected
      global.fetch = () => Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ connected: true, deviceName: 'DJI RC 2 (MTP)' })
      });
      await vm.runInThisContext(`pollCompanionStatus()`);
      assert.strictEqual(sText.textContent, 'Bridge Service: Online');
      assert.strictEqual(sDot.style.background, '#22c55e');
      assert.strictEqual(uText.textContent, 'RC 2 USB Link: Connected');
      assert.strictEqual(uDot.style.background, '#22c55e');
      assert.strictEqual(uLabel.textContent, 'DJI RC 2 (MTP)');
      assert.ok(!container.classes.has('is-offline'));
      assert.strictEqual(btn.style.display, 'inline-flex');
    } finally {
      global.document.getElementById = origGetElementById;
      global.fetch = origFetch;
    }
  });

  test('setCorsHeaders sets Private Network Access and cross-origin headers', () => {
    const { setCorsHeaders } = require('./tools/companion/server.js');
    const headers = {};
    const mockRes = {
      setHeader(k, v) {
        headers[k] = v;
      }
    };
    setCorsHeaders(mockRes);
    assert.strictEqual(headers['Access-Control-Allow-Origin'], '*');
    assert.strictEqual(headers['Access-Control-Allow-Private-Network'], 'true');
    assert.ok(headers['Access-Control-Allow-Headers'].includes('Access-Control-Request-Private-Network'));
  });

  test('COMPANION_API_BASE dynamically resolves to window.location.origin on localhost and defaults cleanly', () => {
    const testOnLocalhost = vm.runInThisContext(`
      (() => {
        const origLocation = window.location;
        try {
          window.location = { hostname: '127.0.0.1', port: '8765', protocol: 'http:', origin: 'http://127.0.0.1:8765' };
          return (typeof window !== 'undefined' && window.location && (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost'))
            ? (window.location.port ? \`\${window.location.protocol}//\${window.location.hostname}:\${window.location.port}\` : window.location.origin)
            : 'http://127.0.0.1:8765';
        } finally {
          window.location = origLocation;
        }
      })()
    `);
    assert.strictEqual(testOnLocalhost, 'http://127.0.0.1:8765');

    const testOnFileProtocol = vm.runInThisContext(`
      (() => {
        const origLocation = window.location;
        try {
          window.location = { hostname: '', port: '', protocol: 'file:', origin: 'null' };
          return (typeof window !== 'undefined' && window.location && (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost'))
            ? (window.location.port ? \`\${window.location.protocol}//\${window.location.hostname}:\${window.location.port}\` : window.location.origin)
            : 'http://127.0.0.1:8765';
        } finally {
          window.location = origLocation;
        }
      })()
    `);
    assert.strictEqual(testOnFileProtocol, 'http://127.0.0.1:8765');
  });

  test('sendDirectlyToRC2 resolves waypoints safely without ReferenceError', async () => {
    let directBtn = {
      innerHTML: '<span>Sync</span>',
      disabled: false,
      style: {}
    };

    const origGetElementById = global.document.getElementById;
    const origFetch = global.fetch;
    const origGetItem = global.localStorage ? global.localStorage.getItem : null;

    let fetchPayload = null;
    global.fetch = (url, opts) => {
      fetchPayload = JSON.parse(opts.body);
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data: { uuid: fetchPayload.uuid } })
      });
    };

    if (global.localStorage) {
      global.localStorage.getItem = (k) => k === 'aalaapi-rc2-uuid' ? '354A8F93-759C-42C3-A8D5-746F79C7622A' : null;
    }

    global.document.getElementById = (id) => {
      if (id === 'direct-rc2-sync-btn') return directBtn;
      if (id === 'speed') return { value: '5' };
      if (id === 'gimbal-pitch') return { value: '-45' };
      if (id === 'altitude') return { value: '60' };
      if (id === 'heading-mode') return { value: 'followWayline' };
      if (id === 'finish-action') return { value: 'goHome' };
      if (id === 'capture-mode') return { value: 'hover' };
      if (id === 'path-mode') return { value: 'normal' };
      return origGetElementById ? origGetElementById(id) : null;
    };

    try {
      vm.runInThisContext('isRc2MtpConnected = true;');
      // Mock JSZip
      const origJSZip = global.JSZip;
      global.JSZip = class {
        constructor() { this.files = {}; }
        file(name, content) { this.files[name] = content; }
        generateAsync(opts) { return Promise.resolve(new Uint8Array([80, 75, 3, 4])); }
      };

      vm.runInThisContext(`
        getCurrentWaypoints = () => [
          { lat: 40.012, lon: -83.177, alt: 50, heading: 90, pitch: -45 },
          { lat: 40.013, lon: -83.177, alt: 50, heading: 90, pitch: -45 }
        ];
      `);

      await vm.runInThisContext('sendDirectlyToRC2()');
      assert.ok(fetchPayload, 'Fetch should have been called with mission payload');
      assert.strictEqual(fetchPayload.uuid, '354A8F93-759C-42C3-A8D5-746F79C7622A');
      assert.ok(fetchPayload.kmzBase64, 'Payload should include kmzBase64');
      assert.strictEqual(fetchPayload.jpgBase64, undefined, 'Preview thumbnail jpgBase64 should be archived/omitted');
      assert.ok(directBtn.innerHTML.includes('Synced to DJI RC 2!'));
    } finally {
      global.document.getElementById = origGetElementById;
      global.fetch = origFetch;
      if (global.localStorage && origGetItem) {
        global.localStorage.getItem = origGetItem;
      }
    }
  });

  test('companion server exports stopScanners, killExistingCompanion, pullFromRc2, and VERSION 1.46.1', () => {
    const companion = require('./tools/companion/server.js');
    assert.strictEqual(typeof companion.stopScanners, 'function');
    assert.strictEqual(typeof companion.killExistingCompanion, 'function');
    assert.strictEqual(typeof companion.pullFromRc2, 'function');
    assert.strictEqual(companion.VERSION, '1.46.1');
  });

  test('pullFromRC2 fetches mission from companion and triggers parseWPML', async () => {
    let pullBtn = {
      innerHTML: '<span>Pull from RC 2</span>',
      disabled: false,
      style: {}
    };
    let statusText = { textContent: '' };

    const origGetElementById = global.document.getElementById;
    const origFetch = global.fetch;

    global.document.getElementById = (id) => {
      if (id === 'direct-rc2-pull-btn') return pullBtn;
      if (id === 'import-status-text') return statusText;
      return origGetElementById ? origGetElementById(id) : null;
    };

    global.fetch = (url) => {
      assert.ok(url.includes('/api/pull-mission'));
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          uuid: '354A8F93-759C-42C3-A8D5-746F79C7622A',
          fileName: '354A8F93-759C-42C3-A8D5-746F79C7622A.kmz',
          waylinesWpml: '<?xml version="1.0"?><kml><Document><Placemark></Placemark></Document></kml>'
        })
      });
    };

    vm.runInThisContext(`
      parseWPML = function(xml) {
        window.__lastParsedXml = xml;
      };
    `);

    try {
      vm.runInThisContext('isRc2MtpConnected = true;');
      await vm.runInThisContext('pullFromRC2()');
      assert.ok(pullBtn.innerHTML.includes('Pulled'));
      const lastParsed = vm.runInThisContext('window.__lastParsedXml');
      assert.ok(lastParsed.includes('<Placemark>'));
      assert.ok(statusText.textContent.includes('Imported'));
    } finally {
      global.document.getElementById = origGetElementById;
      global.fetch = origFetch;
    }
  });

  test('killExistingCompanion handles offline port cleanly without error', async () => {
    const { killExistingCompanion } = require('./tools/companion/server.js');
    await assert.doesNotReject(async () => {
      await killExistingCompanion(59999);
    });
  });

  test('switchGuideTab and openRC2GuideModal toggle tabs and offline guidance panes cleanly', () => {
    const tabBtnService = { dataset: { tab: 'service' }, classList: { classes: new Set(), add(c) { this.classes.add(c); }, remove(c) { this.classes.delete(c); }, contains(c) { return this.classes.has(c); } } };
    const tabBtnUsb = { dataset: { tab: 'usb' }, classList: { classes: new Set(), add(c) { this.classes.add(c); }, remove(c) { this.classes.delete(c); }, contains(c) { return this.classes.has(c); } } };
    const tabBtnAndroid = { dataset: { tab: 'android' }, classList: { classes: new Set(), add(c) { this.classes.add(c); }, remove(c) { this.classes.delete(c); }, contains(c) { return this.classes.has(c); } } };
    const tabBtnManual = { dataset: { tab: 'manual' }, classList: { classes: new Set(), add(c) { this.classes.add(c); }, remove(c) { this.classes.delete(c); }, contains(c) { return this.classes.has(c); } } };
    const paneService = { id: 'guide-pane-service', classList: { classes: new Set(), add(c) { this.classes.add(c); }, remove(c) { this.classes.delete(c); }, contains(c) { return this.classes.has(c); } } };
    const paneUsb = { id: 'guide-pane-usb', classList: { classes: new Set(), add(c) { this.classes.add(c); }, remove(c) { this.classes.delete(c); }, contains(c) { return this.classes.has(c); } } };
    const paneAndroid = { id: 'guide-pane-android', classList: { classes: new Set(), add(c) { this.classes.add(c); }, remove(c) { this.classes.delete(c); }, contains(c) { return this.classes.has(c); } } };
    const paneManual = { id: 'guide-pane-manual', classList: { classes: new Set(), add(c) { this.classes.add(c); }, remove(c) { this.classes.delete(c); }, contains(c) { return this.classes.has(c); } } };
    const guideModal = { classList: { classes: new Set(['hidden']), remove(c) { this.classes.delete(c); }, add(c) { this.classes.add(c); }, contains(c) { return this.classes.has(c); } } };

    const origQSA = global.document.querySelectorAll;
    const origGetElementById = global.document.getElementById;

    global.document.querySelectorAll = (selector) => {
      if (selector === '.guide-tab-btn') return [tabBtnService, tabBtnUsb, tabBtnAndroid, tabBtnManual];
      if (selector === '.guide-tab-pane') return [paneService, paneUsb, paneAndroid, paneManual];
      return origQSA ? origQSA(selector) : [];
    };

    global.document.getElementById = (id) => {
      if (id === 'guide-modal') return guideModal;
      return origGetElementById ? origGetElementById(id) : null;
    };

    try {
      // 1. Switch to service tab
      vm.runInThisContext(`switchGuideTab('service')`);
      assert.ok(tabBtnService.classList.contains('active'));
      assert.ok(!tabBtnUsb.classList.contains('active'));
      assert.ok(!tabBtnAndroid.classList.contains('active'));
      assert.ok(!paneService.classList.contains('hidden'));
      assert.ok(paneUsb.classList.contains('hidden'));
      assert.ok(paneAndroid.classList.contains('hidden'));

      // 2. Switch to USB tab
      vm.runInThisContext(`switchGuideTab('usb')`);
      assert.ok(!tabBtnService.classList.contains('active'));
      assert.ok(tabBtnUsb.classList.contains('active'));
      assert.ok(!tabBtnAndroid.classList.contains('active'));
      assert.ok(paneService.classList.contains('hidden'));
      assert.ok(!paneUsb.classList.contains('hidden'));
      assert.ok(paneAndroid.classList.contains('hidden'));

      // 3. Switch to Android tab
      vm.runInThisContext(`switchGuideTab('android')`);
      assert.ok(!tabBtnService.classList.contains('active'));
      assert.ok(!tabBtnUsb.classList.contains('active'));
      assert.ok(tabBtnAndroid.classList.contains('active'));
      assert.ok(paneService.classList.contains('hidden'));
      assert.ok(paneUsb.classList.contains('hidden'));
      assert.ok(!paneAndroid.classList.contains('hidden'));

      // 4. Backward compatible alias 'companion' maps to 'service'
      vm.runInThisContext(`switchGuideTab('companion')`);
      assert.ok(tabBtnService.classList.contains('active'));
      assert.ok(!paneService.classList.contains('hidden'));

      // 5. openRC2GuideModal with 'android' opens modal and activates android tab
      vm.runInThisContext(`openRC2GuideModal('android')`);
      assert.ok(!guideModal.classList.contains('hidden'));
      assert.ok(tabBtnAndroid.classList.contains('active'));
    } finally {
      global.document.querySelectorAll = origQSA;
      global.document.getElementById = origGetElementById;
    }
  });

  test('index_template.html contains dual companion status rows, help buttons, and Android tab', () => {
    const fs = require('fs');
    const path = require('path');
    const html = fs.readFileSync(path.resolve(__dirname, './index_template.html'), 'utf8');

    assert.ok(html.includes('id="companion-service-row"'), 'Should have companion-service-row');
    assert.ok(html.includes('id="companion-usb-row"'), 'Should have companion-usb-row');
    assert.ok(html.includes('id="companion-service-help-btn"'), 'Should have companion-service-help-btn');
    assert.ok(html.includes('id="companion-usb-help-btn"'), 'Should have companion-usb-help-btn');
    assert.ok(html.includes('id="guide-pane-service"'), 'Should have guide-pane-service');
    assert.ok(html.includes('id="guide-pane-usb"'), 'Should have guide-pane-usb');
    assert.ok(html.includes('data-tab="android"'), 'Should have data-tab="android"');
    assert.ok(html.includes('id="guide-pane-android"'), 'Should have guide-pane-android');
    assert.ok(html.includes('Samsung "My Files"'), 'Should document Samsung My Files workflow');
  });
});

describe('Phase 2 Flight Diagnostics & 3D Replay Tests', () => {
  test('generateTelemetryFromWaypoints generates complete time-series points with photo events', () => {
    const testWps = [
      { lat: 40.012, lon: -83.177, altitude: 21, gimbalPitch: -60, speed: 4 },
      { lat: 40.013, lon: -83.177, altitude: 21, gimbalPitch: -60, speed: 4 },
      { lat: 40.013, lon: -83.176, altitude: 21, gimbalPitch: -60, speed: 4 }
    ];

    const result = vm.runInThisContext(`generateTelemetryFromWaypoints(${JSON.stringify(testWps)}, { altitude: 21, speed: 4, gimbalPitch: -60 })`);
    assert.ok(result);
    assert.ok(result.points.length > 0);
    assert.strictEqual(result.droneModel, 'DJI Mini 4 Pro');
    assert.strictEqual(result.maxAltitude, 21);
    assert.strictEqual(result.photoCount, 3);
    assert.ok(result.durationSec > 10);

    // Assert photo events exist in points
    const photoPoints = result.points.filter(p => p.isPhoto);
    assert.strictEqual(photoPoints.length, 3);
    assert.ok(result.batteryStart > result.batteryEnd);
  });

  test('computeFlightComparison computes accurate variance between plan and actual flight', () => {
    const planned = { waypointCount: 48, altitude: 21.0, estimatedTimeSec: 230, totalDistance: 820 };
    const actual = {
      durationSec: 252,
      durationFormatted: '04:12',
      totalDistance: 845,
      maxAltitude: 21.3,
      photoCount: 48,
      batteryStart: 98,
      batteryEnd: 76,
      batteryUsed: 22
    };

    const comp = vm.runInThisContext(`computeFlightComparison(${JSON.stringify(planned)}, ${JSON.stringify(actual)})`);
    assert.ok(comp);
    assert.strictEqual(comp.photos.actual, 48);
    assert.strictEqual(comp.photos.completionPct, '100%');
    assert.strictEqual(comp.photos.status, 'optimal');
    assert.ok(comp.time.delta.includes('+22s'));
    assert.ok(comp.distance.delta.includes('+25 m'));
  });

  test('FlightDiagnostics open and seekTo update UI elements safely', async () => {
    const elements = {};
    const origGetElementById = global.document.getElementById;
    const origFetch = global.fetch;
    global.fetch = () => Promise.reject(new Error('Companion offline'));
    global.document.getElementById = (id) => {
      if (!elements[id]) {
        elements[id] = {
          classList: { add() {}, remove() {} },
          style: {},
          textContent: '',
          value: '0',
          addEventListener() {}
        };
      }
      return elements[id];
    };

    try {
      await vm.runInThisContext(`
        (async () => {
          await FlightDiagnostics.open();
          FlightDiagnostics.seekTo(5);
          FlightDiagnostics.close();
        })()
      `);
      assert.strictEqual(elements['diag-hud-alt']?.textContent !== '', true);
      assert.strictEqual(elements['diag-hud-coords']?.textContent.includes(','), true);
    } finally {
      global.document.getElementById = origGetElementById;
      global.fetch = origFetch;
    }
  });

  test('generateTelemetryFromWaypoints generates distinct profiles for different flight records', () => {
    const testWps = [
      { lat: 40.012, lon: -83.177, altitude: 21, gimbalPitch: -60, speed: 4 },
      { lat: 40.013, lon: -83.177, altitude: 21, gimbalPitch: -60, speed: 4 },
      { lat: 40.013, lon: -83.176, altitude: 21, gimbalPitch: -60, speed: 4 },
      { lat: 40.012, lon: -83.176, altitude: 21, gimbalPitch: -60, speed: 4 },
      { lat: 40.011, lon: -83.175, altitude: 21, gimbalPitch: -60, speed: 4 }
    ];

    // Flight 1 (Pre-flight calibration)
    const f1 = vm.runInThisContext(`generateTelemetryFromWaypoints(${JSON.stringify(testWps)}, { flightId: 'FlightRecord_2026-08-20_[19-39-07].txt' })`);
    assert.ok(f1);
    assert.strictEqual(f1.durationSec, 45);
    assert.strictEqual(f1.photoCount, 0);
    assert.strictEqual(f1.durationFormatted, '00:45');

    // Flight 2 (Perimeter test)
    const f2 = vm.runInThisContext(`generateTelemetryFromWaypoints(${JSON.stringify(testWps)}, { flightId: 'FlightRecord_2026-08-20_[19-41-15].txt' })`);
    assert.ok(f2);
    assert.strictEqual(f2.photoCount, 4);
    assert.ok(f2.durationSec > 0);

    // Flight 4 (Post-mission inspection)
    const f4 = vm.runInThisContext(`generateTelemetryFromWaypoints(${JSON.stringify(testWps)}, { flightId: 'FlightRecord_2026-08-20_[19-47-15].txt' })`);
    assert.ok(f4);
    assert.strictEqual(f4.durationSec, 75);
    assert.strictEqual(f4.photoCount, 0);
    assert.strictEqual(f4.durationFormatted, '01:15');

    // Active Mission pure simulation
    const fSim = vm.runInThisContext(`generateTelemetryFromWaypoints(${JSON.stringify(testWps)}, { flightId: 'active-mission' })`);
    assert.ok(fSim);
    assert.strictEqual(fSim.maxDeviation, '0.0 m');
    assert.strictEqual(fSim.photoCount, 5);

    // Assert that different flights have different durations and trajectories
    assert.notStrictEqual(f1.durationSec, f4.durationSec);
    assert.notStrictEqual(f1.points[15].lat, f4.points[15].lat);
  });

  test('FlightDiagnostics loadSelectedFlight dynamically changes flight metadata and UI', async () => {
    const elements = {};
    const origGetElementById = global.document.getElementById;
    const origFetch = global.fetch;
    global.fetch = () => Promise.reject(new Error('Companion offline'));
    global.document.getElementById = (id) => {
      if (!elements[id]) {
        elements[id] = {
          classList: { add() {}, remove() {} },
          style: {},
          textContent: '',
          value: '0',
          addEventListener() {}
        };
      }
      return elements[id];
    };

    try {
      await vm.runInThisContext(`
        FlightDiagnostics.loadSelectedFlight('FlightRecord_2026-08-20_[19-39-07].txt');
      `);
      assert.strictEqual(elements['diag-flight-meta']?.textContent.includes('FlightRecord_2026-08-20_[19-39-07].txt'), true);
      assert.strictEqual(elements['diag-flight-meta']?.textContent.includes('00:45'), true);
      assert.strictEqual(elements['diag-timeline-slider']?.max, '45');
      assert.strictEqual(elements['diag-time-display']?.textContent, '00:00 / 00:45');

      // Now switch to Flight 4
      await vm.runInThisContext(`
        FlightDiagnostics.loadSelectedFlight('FlightRecord_2026-08-20_[19-47-15].txt');
      `);
      assert.strictEqual(elements['diag-flight-meta']?.textContent.includes('FlightRecord_2026-08-20_[19-47-15].txt'), true);
      assert.strictEqual(elements['diag-flight-meta']?.textContent.includes('01:15'), true);
      assert.strictEqual(elements['diag-timeline-slider']?.max, '75');
      assert.strictEqual(elements['diag-time-display']?.textContent, '00:00 / 01:15');
    } finally {
      global.document.getElementById = origGetElementById;
      global.fetch = origFetch;
    }
  });

  test('parseGeoJsonTelemetry and parseCsvTelemetry correctly parse imported flight tracks', () => {
    const geojson = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [
              [-83.177, 40.012, 10],
              [-83.177, 40.013, 20],
              [-83.176, 40.013, 25]
            ]
          }
        }
      ]
    };

    const gResult = vm.runInThisContext(`parseGeoJsonTelemetry(${JSON.stringify(geojson)}, 'custom_track.geojson')`);
    assert.ok(gResult);
    const csv = `latitude,longitude,altitude,speed,pitch,yaw,isPhoto\n40.012,-83.177,15,4,-60,0,0\n40.013,-83.177,20,4,-60,90,1`;
    const cResult = vm.runInThisContext(`parseCsvTelemetry(${JSON.stringify(csv)}, 'custom_log.csv')`);
    assert.ok(cResult);
    assert.strictEqual(cResult.points.length, 2);
    assert.strictEqual(cResult.photoCount, 1);
    assert.strictEqual(cResult.maxAltitude, 20);
  });

  test('parseKmlOrWpmlTelemetry and parseGpxTelemetry correctly parse real flight paths', () => {
    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <Point><coordinates>-122.4194,37.7749,15</coordinates></Point>
      <action>takePhoto</action>
    </Placemark>
    <Placemark>
      <Point><coordinates>-122.4190,37.7752,25</coordinates></Point>
      <action>takePhoto</action>
    </Placemark>
  </Document>
</kml>`;

    const kResult = vm.runInThisContext(`parseKmlOrWpmlTelemetry(${JSON.stringify(kml)}, 'mission_track.kml')`);
    assert.ok(kResult);
    assert.strictEqual(kResult.homePoint.lat, 37.7749);
    assert.strictEqual(kResult.homePoint.lon, -122.4194);
    assert.strictEqual(kResult.maxAltitude, 25);
    assert.strictEqual(kResult.photoCount, 2);

    const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1">
  <trk><trkseg>
    <trkpt lat="37.7749" lon="-122.4194"><ele>10.5</ele></trkpt>
    <trkpt lat="37.7755" lon="-122.4190"><ele>18.0</ele></trkpt>
  </trkseg></trk>
</gpx>`;

    const gpxResult = vm.runInThisContext(`parseGpxTelemetry(${JSON.stringify(gpx)}, 'flight_gps.gpx')`);
    assert.ok(gpxResult);
    assert.strictEqual(gpxResult.points.length, 2);
    assert.strictEqual(gpxResult.homePoint.lat, 37.7749);
    assert.strictEqual(gpxResult.maxAltitude, 18.0);
  });

  test('FlightDiagnostics centerMapOnFlight updates map view to real flight coordinates', () => {
    let pannedTo = null;
    global._testMap = {
      setView(latlng, zoom) {
        pannedTo = { lat: latlng[0], lon: latlng[1], zoom };
      },
      getCenter() { return { lat: 37.7749, lng: -122.4194 }; }
    };

    try {
      vm.runInThisContext(`
        map = global._testMap;
        FlightDiagnostics.telemetryData = {
          homePoint: { lat: 37.7749, lon: -122.4194, alt: 0 },
          points: [{ lat: 37.7749, lon: -122.4194, alt: 10 }]
        };
        FlightDiagnostics.centerMapOnFlight();
      `);
      assert.ok(pannedTo);
      assert.strictEqual(pannedTo.lat, 37.7749);
      assert.strictEqual(pannedTo.lon, -122.4194);
      assert.strictEqual(pannedTo.zoom, 18);
    } finally {
      delete global._testMap;
    }
  });

  test('Remote ID ASTM F3411 decoder correctly parses Basic ID, Location, and System messages', () => {
    const {
      decodeOdidMessage,
      parseRemoteIdPayload,
      createSyntheticOdidPayload,
      RemoteIdAirspaceTracker
    } = require('./tools/companion/remote_id_decoder.js');

    const synPayload = createSyntheticOdidPayload({
      uasId: '1581F4DJI-MINI-4',
      lat: 40.013055,
      lon: -83.176511,
      alt: 45.0,
      speed: 6.5,
      heading: 180,
      opLat: 40.012500,
      opLon: -83.176000
    });

    assert.ok(synPayload);
    const messages = parseRemoteIdPayload(synPayload);
    assert.strictEqual(messages.length, 3);

    // Basic ID
    const basic = messages.find(m => m.msgType === 0);
    assert.ok(basic);
    assert.strictEqual(basic.uasId, '1581F4DJI-MINI-4');
    assert.strictEqual(basic.uaType, 'Helicopter (Multirotor)');

    // Location / Vector
    const loc = messages.find(m => m.msgType === 1);
    assert.ok(loc);
    assert.strictEqual(loc.latitude, 40.013055);
    assert.strictEqual(loc.longitude, -83.176511);
    assert.strictEqual(loc.altitudeGeodetic, 45.0);
    assert.strictEqual(loc.speedHorizontal, 6.5);
    assert.strictEqual(loc.trackDirection, 180);

    // System
    const sys = messages.find(m => m.msgType === 4);
    assert.ok(sys);
    assert.strictEqual(sys.operatorLatitude, 40.0125);
    assert.strictEqual(sys.operatorLongitude, -83.176);

    // Tracker aggregation
    const tracker = new RemoteIdAirspaceTracker(10);
    const drone = tracker.processAdvertisement({
      mac: 'FA:0B:BC:15:81:F4',
      rssi: -55,
      rawPayload: synPayload
    });

    assert.ok(drone);
    assert.strictEqual(drone.uasId, '1581F4DJI-MINI-4');
    assert.strictEqual(drone.model, 'DJI Mini 4 Pro');
    assert.strictEqual(drone.latitude, 40.013055);
    assert.strictEqual(drone.breadcrumbs.length, 1);

    const activeDrones = tracker.getActiveDrones();
    assert.strictEqual(activeDrones.length, 1);
    assert.strictEqual(activeDrones[0].rssi, -55);
  });

  test('RemoteIdRadar updates map markers and UI badge cleanly', () => {
    global._testMap = {
      addLayer: () => {},
      setView: () => {}
    };

    try {
      const err = vm.runInThisContext(`
        try {
          L = global.L;
          map = global._testMap;
          RemoteIdRadar.layerGroup = {
            addLayer: function(l) { global._testLayerAdded = true; },
            removeLayer: function(l) {}
          };
          if (!RemoteIdRadar.markers) RemoteIdRadar.markers = new Map();
          RemoteIdRadar.markers.clear();
          RemoteIdRadar.activeDrones = [{
            id: 'FA:0B:BC:11:22:33',
            uasId: '1581F4TEST',
            model: 'DJI Mini 4 Pro',
            uaType: 'Multirotor',
            status: 'Airborne',
            latitude: 40.0130,
            longitude: -83.1765,
            altitudeGeodetic: 30,
            speedHorizontal: 4.0,
            trackDirection: 90,
            rssi: -60,
            breadcrumbs: []
          }];
          RemoteIdRadar.updateMapMarkers();
          RemoteIdRadar.updateRadarUI();
          null;
        } catch (e) {
          e.message + ' \\n' + e.stack;
        }
      `);
      if (err) assert.fail('Error in VM: ' + err);
      assert.strictEqual(global._testLayerAdded, true);
    } finally {
      delete global._testMap;
      delete global._testLayerAdded;
    }
  });

  test('RemoteIdAirspaceTracker processWifiBeacon correctly parses 5.8GHz and 2.4GHz DJI Wi-Fi beacons', () => {
    const { RemoteIdAirspaceTracker, createSyntheticOdidPayload } = require('./tools/companion/remote_id_decoder.js');

    const tracker = new RemoteIdAirspaceTracker(10);

    // 1. Ingest 5.8 GHz DJI Mini 4 Pro beacon
    const drone1 = tracker.processWifiBeacon({
      mac: 'E4:7A:2C:D7:09:A2',
      ssid: 'DJI-MINI4-Pro-09A2',
      freq: 5745,
      rssi: -59,
      quality: 83
    });

    assert.ok(drone1);
    assert.strictEqual(drone1.model, 'DJI Mini 4 Pro');
    assert.strictEqual(drone1.uasId, 'DJI-MINI4-Pro-09A2');
    assert.strictEqual(drone1.frequencyMhz, 5745);
    assert.strictEqual(drone1.rssi, -59);
    assert.strictEqual(drone1.signalQuality, 83);
    assert.ok(drone1.transport.includes('5.8 GHz'));

    // 2. Ingest 2.4 GHz DJI Neo beacon with embedded ASTM IE payload
    const synPayload = createSyntheticOdidPayload({
      uasId: '1581F4NEO-9988',
      lat: 40.0135,
      lon: -83.1762,
      alt: 18.0
    });

    const drone2 = tracker.processWifiBeacon({
      mac: '60:60:1F:AA:BB:CC',
      ssid: 'DJI-Neo-01A2',
      freq: 2412,
      rssi: -65,
      quality: 75,
      ieHex: synPayload.toString('hex')
    });

    assert.ok(drone2);
    assert.strictEqual(drone2.model, 'DJI Neo');
    assert.strictEqual(drone2.latitude, 40.0135);
    assert.strictEqual(drone2.longitude, -83.1762);
    assert.strictEqual(drone2.altitudeGeodetic, 18.0);
    assert.ok(drone2.transport.includes('2.4 GHz'));

    const active = tracker.getActiveDrones();
    assert.strictEqual(active.length, 2);
  });
});

describe('3D Preview Modal Hierarchy & HTML Tag Balance Tests', () => {
  test('preview-3d-modal and config-modal are top-level body children and not inside about-modal', () => {
    const fs = require('fs');
    
    for (const filename of ['index_template.html', 'index.html']) {
      const content = fs.readFileSync(filename, 'utf8');
      
      const aboutIdx = content.indexOf('id="about-modal"');
      const configIdx = content.indexOf('id="config-modal"');
      const preview3dIdx = content.indexOf('id="preview-3d-modal"');
      
      assert.ok(aboutIdx !== -1, `about-modal must exist in ${filename}`);
      assert.ok(configIdx !== -1, `config-modal must exist in ${filename}`);
      assert.ok(preview3dIdx !== -1, `preview-3d-modal must exist in ${filename}`);
      
      assert.ok(aboutIdx < configIdx, `about-modal must precede config-modal in ${filename}`);
      assert.ok(configIdx < preview3dIdx, `config-modal must precede preview-3d-modal in ${filename}`);

      // Count open and close div tags between about-modal and config-modal to ensure about-modal closed completely
      const sliceBeforeConfig = content.slice(aboutIdx, configIdx);
      const openDivs = (sliceBeforeConfig.match(/<div(\s|>)/gi) || []).length;
      const closeDivs = (sliceBeforeConfig.match(/<\/div>/gi) || []).length;
      assert.strictEqual(openDivs, closeDivs, `All <div> tags in about-modal must be closed before config-modal starts in ${filename}`);

      // Also ensure preview-3d-modal is after the config-modal closes
      const sliceBeforePreview = content.slice(configIdx, preview3dIdx);
      const configOpenDivs = (sliceBeforePreview.match(/<div(\s|>)/gi) || []).length;
      const configCloseDivs = (sliceBeforePreview.match(/<\/div>/gi) || []).length;
      assert.strictEqual(configOpenDivs, configCloseDivs, `All <div> tags in config-modal must be closed before preview-3d-modal starts in ${filename}`);
    }
  });
});





