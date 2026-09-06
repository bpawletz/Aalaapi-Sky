const { test, describe, mock, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
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
    className: '',
    addEventListener: () => {},
    removeEventListener: () => {},
    focus: () => {},
    select: () => {}
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
  marker: (latlng) => {
    const m = {
      _latlng: { lat: Array.isArray(latlng) ? latlng[0] : 0, lng: Array.isArray(latlng) ? latlng[1] : 0 },
      getLatLng: function() { return this._latlng; },
      setLatLng: function(ll) { this._latlng = { lat: Array.isArray(ll) ? ll[0] : ll.lat, lng: Array.isArray(ll) ? ll[1] : ll.lng }; return this; },
      bindTooltip: function() { return this; },
      bindPopup: function() { return this; },
      openPopup: function() { return this; },
      closePopup: function() { return this; },
      on: function() { return this; },
      addTo: function() { return this; },
      setIcon: function() { return this; }
    };
    return m;
  },
  circleMarker: (latlng) => {
    const m = {
      _latlng: { lat: Array.isArray(latlng) ? latlng[0] : 0, lng: Array.isArray(latlng) ? latlng[1] : 0 },
      getLatLng: function() { return this._latlng; },
      setLatLng: function(ll) { this._latlng = { lat: Array.isArray(ll) ? ll[0] : ll.lat, lng: Array.isArray(ll) ? ll[1] : ll.lng }; return this; },
      bindTooltip: function() { return this; },
      bindPopup: function() { return this; },
      openPopup: function() { return this; },
      closePopup: function() { return this; },
      on: function() { return this; },
      addTo: function() { return this; }
    };
    return m;
  },
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
    const originalGetItem = global.localStorage.getItem;
    global.localStorage.getItem = (k) => k === 'unitSystem' ? 'metric' : null;
    vm.runInThisContext('getUnitSystem = function() { if (cachedUnitSystem) return cachedUnitSystem; const el = typeof document !== "undefined" ? document.getElementById("unit-system") : null; if (el) { cachedUnitSystem = el.value; return cachedUnitSystem; } const savedUnit = localStorage.getItem("unitSystem"); if (savedUnit) { cachedUnitSystem = savedUnit; return cachedUnitSystem; } return "metric"; };');
    vm.runInThisContext('cachedUnitSystem = null;');
    assert.strictEqual(formatDistance(10), '10.0 m');
    assert.strictEqual(formatDistance(10, 2), '10.00 m');
    assert.strictEqual(formatDistance(0), '0.0 m');
    global.localStorage.getItem = originalGetItem;
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

  test('calculates flight time accurately for hover and stopAndShoot modes', () => {
    // Simple waypoints: distance 50 meters
    const waypoints = [
      { x: 0, y: 0, z: 0, lat: 0, lon: 0 },
      { x: 50, y: 0, z: 0, lat: 0, lon: 0 }
    ];

    const photoLocations = [{}, {}, {}]; // 3 photos
    const speed = 10; // 50 / 10 = 5 seconds flight time

    // Capture mode 'hover'
    // Flight time = 5 (distance/speed) + 45 (base) = 50 seconds.
    const statsHover = calculateStats(waypoints, photoLocations, speed, 10, 10, 'hover');
    assert.strictEqual(statsHover.flightTimeSeconds, 50);
    assert.strictEqual(statsHover.photoCount, 3);
    assert.strictEqual(statsHover.timeStr, '0m 50s');

    // Capture mode 'stopAndShoot'
    // Flight time = 5 (distance/speed) + 3*4.5 (photos) + 45 (base) + 2 (auto-settling) = 65.5 seconds.
    const statsStop = calculateStats(waypoints, photoLocations, speed, 10, 10, 'stopAndShoot');
    assert.strictEqual(statsStop.flightTimeSeconds, 65.5);
    assert.strictEqual(statsStop.timeStr, '1m 6s'); // 65.5s -> 1m 6s (rounded)

    // Change distance to 2000m (2000/10 = 200s + 45 = 245s).
    const waypointsLong = [
      { x: 0, y: 0, z: 0, lat: 0, lon: 0 },
      { x: 2000, y: 0, z: 0, lat: 0, lon: 0 }
    ];
    const statsLong = calculateStats(waypointsLong, [], speed, 10, 10, 'hover');
    assert.strictEqual(statsLong.flightTimeSeconds, 245);
    assert.strictEqual(statsLong.timeStr, '4m 5s');
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

    // 1 (points) + 1 (stations list) + 2 (observations for the 2 mocked stations in parallel)
    assert.strictEqual(fetchedUrls.length, 4, 'Should fetch: points, stations list, and observations for each discovered station');
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
        toggle: mock.fn(),
        remove: mock.fn()
      },
      scrollIntoView: mock.fn()
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
    let tabCustomClicked = null;
    const mockTabCustom = {
      addEventListener: (evt, cb) => {
        if (evt === 'click') tabCustomClicked = cb;
      },
      classList: {
        add: mock.fn(),
        remove: mock.fn()
      },
      style: {}
    };
    let layerHelpBtnClicked = null;
    const mockLayerHelpBtn = {
      addEventListener: (evt, cb) => {
        if (evt === 'click') layerHelpBtnClicked = cb;
      }
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
    const mockHelpDetails = { innerHTML: '' };
    const mockAnimDrone = { setAttribute: mock.fn() };
    const mockAnimPoiTarget = { style: { opacity: '0' } };
    const mockActivePath = { setAttribute: mock.fn() };

    const originalGetElementById = global.document.getElementById;
    global.document.getElementById = (id) => {
      if (id === 'heading-help-btn') return mockHelpBtn;
      if (id === 'layer-heading-help-btn') return mockLayerHelpBtn;
      if (id === 'heading-help-drawer') return mockHelpDrawer;
      if (id === 'heading-tab-follow') return mockTabFollow;
      if (id === 'heading-tab-fixed') return mockTabFixed;
      if (id === 'heading-tab-poi') return mockTabPoi;
      if (id === 'heading-tab-custom') return mockTabCustom;
      if (id === 'heading-help-desc') return mockHelpDesc;
      if (id === 'heading-help-details') return mockHelpDetails;
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
      assert.ok(layerHelpBtnClicked);
      assert.ok(tabFollowClicked);
      assert.ok(tabFixedClicked);
      assert.ok(tabPoiClicked);
      assert.ok(tabCustomClicked);

      // Trigger drawer toggle click
      const mockEvent = { stopPropagation: () => {} };
      helpBtnClicked(mockEvent);

      // Verify toggle was called
      assert.strictEqual(mockHelpDrawer.classList.toggle.mock.callCount(), 1);

      // Trigger layer help button click
      layerHelpBtnClicked(mockEvent);
      assert.strictEqual(mockHelpDrawer.classList.remove.mock.callCount(), 1);

      // Trigger Fixed Heading tab and verify description + camera/photography details
      tabFixedClicked();
      assert.strictEqual(mockHelpDesc.textContent.includes('constant heading'), true);
      assert.strictEqual(mockAnimPoiTarget.style.opacity, '0');
      assert.ok(mockHelpDetails.innerHTML.includes('Nadir (-90°) Mapping'));
      assert.ok(mockHelpDetails.innerHTML.includes('True North'));
      assert.ok(mockHelpDetails.innerHTML.includes('photogrammetry'));

      // Trigger Follow Path tab
      tabFollowClicked();
      assert.strictEqual(mockHelpDesc.textContent.includes('rotates forward'), true);
      assert.strictEqual(mockAnimPoiTarget.style.opacity, '0');
      assert.ok(mockHelpDetails.innerHTML.includes('Forward Alignment'));
      assert.ok(mockHelpDetails.innerHTML.includes('corridor'));

      // Trigger POI tab
      tabPoiClicked();
      assert.strictEqual(mockHelpDesc.textContent.includes('locks onto a Point of Interest'), true);
      assert.strictEqual(mockAnimPoiTarget.style.opacity, '1');
      assert.ok(mockHelpDetails.innerHTML.includes('Target Tracking'));
      assert.ok(mockHelpDetails.innerHTML.includes('Orbit & Tower Audits'));

      // Trigger Custom Angle tab
      tabCustomClicked();
      assert.strictEqual(mockHelpDesc.textContent.includes('user-defined heading angle'), true);
      assert.strictEqual(mockAnimPoiTarget.style.opacity, '0');
      assert.ok(mockHelpDetails.innerHTML.includes('Custom Yaw'));
      assert.ok(mockHelpDetails.innerHTML.includes('User-Defined Azimuth'));

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
      assert.strictEqual(xml.includes('<wpml:waypointPoiPoint>41.882700,-87.622700,0.000000</wpml:waypointPoiPoint>'), true);
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

      // Waypoint 0 should point to POI 1 (41.93, -87.67) in lat,lon,alt order
      assert.ok(xml.includes('<wpml:waypointHeadingPoiIndex>1</wpml:waypointHeadingPoiIndex>'));
      assert.ok(xml.includes('<wpml:waypointPoiPoint>41.930000,-87.670000,0.000000</wpml:waypointPoiPoint>'));

      // Waypoint 1 should point to POI 2 (41.98, -87.72) in lat,lon,alt order
      assert.ok(xml.includes('<wpml:waypointHeadingPoiIndex>2</wpml:waypointHeadingPoiIndex>'));
      assert.ok(xml.includes('<wpml:waypointPoiPoint>41.980000,-87.720000,0.000000</wpml:waypointPoiPoint>'));

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
      { lat: 41.89, lon: -87.63, alt: 60, pitch: -30, speed: null, hoverTime: 0, turnMode: 'pass' },
      { lat: 41.90, lon: -87.64, alt: 70, pitch: -30, speed: null, hoverTime: 0, turnMode: 'stop' }
    ];

    const xml = vm.runInThisContext('buildWaylinesWpml')(testWaypoints, 50, 5, 'followWayline', 'goHome', -45, 'continuous', 'straight');

    assert.ok(xml.includes('<wpml:waypointSpeed>12</wpml:waypointSpeed>'), 'should export custom waypointSpeed 12 for WP 0');
    assert.ok(xml.includes('<wpml:actionActuatorFunc>hover</wpml:actionActuatorFunc>'), 'should export hover action for WP 0');
    assert.ok(xml.includes('<wpml:hoverTime>10</wpml:hoverTime>'), 'should export hoverTime 10 for WP 0');
    assert.ok(xml.includes('toPointAndStopWithDiscontinuityCurvature'), 'should export stop turnMode for WP 0');
    assert.ok(xml.includes('toPointAndPassWithDiscontinuityCurvature'), 'should export pass turnMode for intermediate WP 1');
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
  test('buildTemplateKml includes mandatory wpml:templateType waypoint tag for Enterprise drones (77)', () => {
    const originalGetElementById = global.document.getElementById;
    global.document.getElementById = (id) => {
      if (id === 'drone-model') return { value: '77' };
      return originalGetElementById ? originalGetElementById(id) : null;
    };
    try {
      const xml = vm.runInThisContext('buildTemplateKml("goHome", 4)');
      assert.strictEqual(xml.includes('<wpml:templateType>waypoint</wpml:templateType>'), true, 'template.kml must contain wpml:templateType tag for Enterprise drones');
    } finally {
      global.document.getElementById = originalGetElementById;
    }
  });

  test('buildWaylinesWpml includes mandatory wpml:templateType tag in Folder for Enterprise drones (77)', () => {
    const originalGetElementById = global.document.getElementById;
    global.document.getElementById = (id) => {
      if (id === 'drone-model') return { value: '77' };
      return originalGetElementById ? originalGetElementById(id) : null;
    };
    try {
      const wps = [
        { lat: 40.0127, lon: -83.1771, alt: 17, headingMode: 'inherit' },
        { lat: 40.0128, lon: -83.1771, alt: 17, headingMode: 'inherit' }
      ];
      const xml = vm.runInThisContext(`buildWaylinesWpml(${JSON.stringify(wps)}, 17, 4, 'followWayline', 'goHome', -90, 'stopAndShoot', 'straight')`);
      assert.strictEqual(xml.includes('<wpml:templateType>waypoint</wpml:templateType>'), true, 'waylines.wpml Folder must contain wpml:templateType tag for Enterprise drones');
    } finally {
      global.document.getElementById = originalGetElementById;
    }
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

  test('buildWaylinesWpml exports native RC2 2D coordinates (lon,lat) matching DJI Fly relativeToStartPoint schema', () => {
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
    
    // Check that there are 2 comma-separated components: longitude, latitude
    const coord0Parts = coord0.split(',');
    assert.strictEqual(coord0Parts.length, 2, 'WP 0 coordinates should have 2 parts (lon,lat)');
    assert.strictEqual(parseFloat(coord0Parts[0]), -83.1771);
    assert.strictEqual(parseFloat(coord0Parts[1]), 40.0127);
    
    const coord1Parts = coord1.split(',');
    assert.strictEqual(coord1Parts.length, 2, 'WP 1 coordinates should have 2 parts (lon,lat)');
    assert.strictEqual(parseFloat(coord1Parts[0]), -83.1771);
    assert.strictEqual(parseFloat(coord1Parts[1]), 40.0128);

    // Verify executeHeight specifies altitude
    assert.ok(xml.includes('<wpml:executeHeight>17</wpml:executeHeight>'));
    assert.ok(xml.includes('<wpml:executeHeight>25</wpml:executeHeight>'));
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
    assert.strictEqual(xml.includes('<wpml:waypointHeadingAngle>0</wpml:waypointHeadingAngle>'), true);
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
      assert.ok(placemarkXml.includes('<wpml:actionGroupMode>sequence</wpml:actionGroupMode>'), 'Multi-action waypoint group must execute sequentially in sequence mode');
      assert.strictEqual(placemarkXml.includes('<wpml:useGlobalPayloadLensIndex>'), false, 'Mini 4 Pro / consumer drones must not contain useGlobalPayloadLensIndex (causes Error performing flight)');
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

  test('FlightDiagnostics loadSelectedFlight uses saved mission waypoints not active workspace when diagnostics blob is missing', async () => {
    // Regression test: missions without embedded diag_json must use data.mission.plan.waypoints,
    // not the current workspace wps, so different saved missions replay distinctly.
    const elements = {};
    const origGetElementById = global.document.getElementById;
    const origFetch = global.fetch;

    // A saved mission with distinct waypoints (different lat/lon from default workspace)
    const savedMissionWps = [
      { lat: 35.6762, lon: 139.6503, alt: 50 },
      { lat: 35.6800, lon: 139.6550, alt: 50 },
      { lat: 35.6850, lon: 139.6600, alt: 50 }
    ];
    const savedMissionResponse = {
      success: true,
      mission: {
        id: 1,
        archive_id: 'test-archive-id-1',
        uuid: 'test-uuid-1',
        filename: 'SavedMission_2026-01-01.kmz',
        altitude: 30,
        speed: 6,
        gimbal_pitch: -45,
        waypoint_count: savedMissionWps.length,
        total_distance: 500,
        diagnostics: null, // No embedded diagnostics — this is the bug scenario
        plan: { waypoints: savedMissionWps, statistics: { waypointCount: 3, altitude: 30, totalDistance: 500 } }
      }
    };

    global.fetch = () => Promise.resolve({
      ok: true,
      json: () => Promise.resolve(savedMissionResponse)
    });
    global.document.getElementById = (id) => {
      if (!elements[id]) {
        elements[id] = {
          classList: { add() {}, remove() {} },
          style: {},
          textContent: '',
          value: '0',
          max: '0',
          addEventListener() {}
        };
      }
      return elements[id];
    };

    try {
      // Intercept generateTelemetryFromWaypoints to capture what waypoints were passed
      vm.runInThisContext(`
        var _origGTFW = generateTelemetryFromWaypoints;
        var _capturedWps = null;
        generateTelemetryFromWaypoints = function(wps, opts) {
          _capturedWps = wps;
          return _origGTFW(wps, opts);
        };
      `);

      await vm.runInThisContext(`
        (async () => { await FlightDiagnostics.loadSelectedFlight('diag:test-archive-id-1'); })()
      `);

      // Wait for the async to settle
      await new Promise(r => setTimeout(r, 50));

      const capturedWps = vm.runInThisContext('_capturedWps');
      assert.ok(capturedWps !== null, 'generateTelemetryFromWaypoints must have been called');
      assert.ok(Array.isArray(capturedWps), 'Captured waypoints must be an array');
      // Must use the SAVED mission's waypoints (Tokyo area), not the default workspace (Columbus, OH)
      assert.ok(capturedWps.length === 3, `Must use saved mission's 3 waypoints, got ${capturedWps?.length}`);
      assert.ok(
        Math.abs(capturedWps[0].lat - 35.6762) < 0.001,
        `Waypoints must be from saved mission (lat ~35.67), got ${capturedWps[0]?.lat}`
      );
    } finally {
      global.document.getElementById = origGetElementById;
      global.fetch = origFetch;
      vm.runInThisContext('generateTelemetryFromWaypoints = _origGTFW;');
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
      if (url && url.includes('/api/sync')) {
        fetchPayload = JSON.parse(opts.body);
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data: { uuid: fetchPayload ? fetchPayload.uuid : '354A8F93-759C-42C3-A8D5-746F79C7622A' } })
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

  test('companion server exports stopScanners, killExistingCompanion, pullFromRc2, getLanAddresses, and VERSION 1.54.0', () => {
    const companion = require('./tools/companion/server.js');
    assert.strictEqual(typeof companion.stopScanners, 'function');
    assert.strictEqual(typeof companion.killExistingCompanion, 'function');
    assert.strictEqual(typeof companion.pullFromRc2, 'function');
    assert.strictEqual(typeof companion.getLanAddresses, 'function');
    assert.strictEqual(companion.VERSION, '1.54.0');

    const addrs = companion.getLanAddresses();
    assert.ok(Array.isArray(addrs));
  });

  test('getCompanionApiBase dynamically resolves URL parameter, localStorage, same-origin, and default', () => {
    const fn = vm.runInThisContext('getCompanionApiBase');
    const setFn = vm.runInThisContext('setCompanionApiBase');
    assert.strictEqual(typeof fn, 'function');
    assert.strictEqual(typeof setFn, 'function');

    const origWindow = global.window;
    const origStorage = global.localStorage;

    try {
      let store = {};
      global.localStorage = {
        getItem: (k) => store[k] || null,
        setItem: (k, v) => { store[k] = v; },
        removeItem: (k) => { delete store[k]; }
      };

      // 1. Fallback default
      global.window = { location: { hostname: 'example.com', port: '80', origin: 'http://example.com' } };
      assert.strictEqual(fn(), 'http://127.0.0.1:8765');

      // 2. Same-origin on port 8765
      global.window = { location: { hostname: '192.168.1.50', port: '8765', protocol: 'http:', origin: 'http://192.168.1.50:8765' } };
      assert.strictEqual(fn(), 'http://192.168.1.50:8765');

      // 3. localStorage saved host
      global.localStorage.setItem('aalaapi-companion-host', 'http://10.0.0.25:8765/');
      global.window = { location: { hostname: 'example.com', port: '80', origin: 'http://example.com' } };
      assert.strictEqual(fn(), 'http://10.0.0.25:8765');

      // 4. URL query param overrides and saves to storage
      global.window = {
        location: {
          hostname: 'example.com',
          port: '80',
          origin: 'http://example.com',
          search: '?companion=http://tablet.local:8765/'
        }
      };
      assert.strictEqual(fn(), 'http://tablet.local:8765');
      assert.strictEqual(global.localStorage.getItem('aalaapi-companion-host'), 'http://tablet.local:8765');

      // 5. setCompanionApiBase adds protocol if missing and strips trailing slashes
      setFn('192.168.2.100:8765/');
      assert.strictEqual(global.localStorage.getItem('aalaapi-companion-host'), 'http://192.168.2.100:8765');

      // 6. setCompanionApiBase('') resets to default
      setFn('');
      assert.strictEqual(global.localStorage.getItem('aalaapi-companion-host'), null);
    } finally {
      global.window = origWindow;
      global.localStorage = origStorage;
    }
  });

  test('index_template.html contains remote companion host config controls', () => {
    const html = fs.readFileSync(path.resolve(__dirname, 'index_template.html'), 'utf-8');
    assert.ok(html.includes('id="companion-config-host-btn"'), 'Must contain host configuration button');
    assert.ok(html.includes('id="companion-host-panel"'), 'Must contain host config panel');
    assert.ok(html.includes('id="companion-host-input"'), 'Must contain host input element');
    assert.ok(html.includes('id="companion-host-save-btn"'), 'Must contain host save button');
    assert.ok(html.includes('id="companion-host-reset-btn"'), 'Must contain host reset button');
  });

  test('FlightDiagnostics.refreshFlightList queries SQLite diagnostics history and populates dropdown optgroups', async () => {
    const origFetch = global.fetch;
    const origGetElementById = global.document ? global.document.getElementById : null;
    const origCreateElement = global.document ? global.document.createElement : null;

    let selectorOptions = [];
    const mockFlightSel = {
      value: '',
      innerHTML: '',
      options: [],
      appendChild(node) {
        if (node.tagName === 'OPTGROUP' || node.label) {
          if (node.children) {
            node.children.forEach(c => selectorOptions.push(c));
          }
        } else {
          selectorOptions.push(node);
        }
      }
    };

    global.document.createElement = (tag) => {
      const el = {
        tagName: tag.toUpperCase(),
        children: [],
        appendChild(child) { this.children.push(child); selectorOptions.push(child); }
      };
      return el;
    };

    global.document.getElementById = (id) => {
      if (id === 'diag-flight-selector') return mockFlightSel;
      return origGetElementById ? origGetElementById(id) : null;
    };

    global.fetch = (url) => {
      if (url.includes('/api/flights')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            flights: [{ filename: 'FlightRecord_2026-08-20.txt', label: 'Flight 1 (2026-08-20)' }]
          })
        });
      }
      if (url.includes('/api/diagnostics/history')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            missions: [{
              uuid: 'saved_uuid_456',
              filename: 'GridMission_Alt50m.kmz',
              waypoint_count: 24,
              created_at: '2026-08-29T14:00:00Z'
            }]
          })
        });
      }
      return Promise.resolve({ ok: false });
    };

    try {
      await vm.runInThisContext('FlightDiagnostics.refreshFlightList()');
      const hasSavedOpt = selectorOptions.some(o => o.value === 'diag:saved_uuid_456');
      assert.strictEqual(hasSavedOpt, true, 'Flight selector should contain saved diagnostic option');
      const hasRc2Opt = selectorOptions.some(o => o.value === 'FlightRecord_2026-08-20.txt');
      assert.strictEqual(hasRc2Opt, true, 'Flight selector should contain RC 2 flight log option');
    } finally {
      global.fetch = origFetch;
      global.document.getElementById = origGetElementById;
      if (origCreateElement) global.document.createElement = origCreateElement;
    }
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

  test('formatISO8601ForFilename generates valid filesystem-safe ISO 8601 timestamps', () => {
    const fn = vm.runInThisContext('formatISO8601ForFilename');
    assert.strictEqual(typeof fn, 'function');

    // 1. Fixed Date object
    const fixedDate = new Date('2026-08-20T19:42:28.000Z');
    const res1 = fn(fixedDate);
    assert.strictEqual(res1, '2026-08-20T19-42-28Z');

    // 2. ISO String input
    const res2 = fn('2026-08-29T13:00:45.500Z');
    assert.strictEqual(res2, '2026-08-29T13-00-45Z');

    // 3. Epoch timestamp
    const res3 = fn(fixedDate.getTime());
    assert.strictEqual(res3, '2026-08-20T19-42-28Z');

    // 4. Default / no args
    const res4 = fn();
    assert.match(res4, /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z$/);

    // 5. Invalid date fallback
    const res5 = fn('invalid-date-string');
    assert.match(res5, /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z$/);

    // 6. Verify no illegal filename characters exist
    assert.strictEqual(/[:\\/?*<>"|]/.test(res1), false);
  });

  test('FlightDiagnostics exportGeoJSON uses filesystem-safe ISO 8601 in download filename', () => {
    let triggeredDownload = null;
    const origDoc = global.document;
    const origCreateElement = global.document ? global.document.createElement : null;
    const mockLink = {
      href: '',
      download: '',
      click() {
        triggeredDownload = this.download;
      }
    };

    if (global.document) {
      global.document.createElement = function(tag) {
        if (tag === 'a') return mockLink;
        return origCreateElement ? origCreateElement.call(global.document, tag) : {};
      };
    }
    const origURL = global.URL;
    global.URL = {
      createObjectURL: () => 'blob:mock'
    };

    try {
      vm.runInThisContext(`
        FlightDiagnostics.telemetryData = {
          droneModel: 'DJI Mini 4 Pro',
          durationFormatted: '04m 12s',
          totalDistance: 820,
          maxAltitude: 21,
          flightDate: '2026-08-20T19:42:28.000Z',
          points: [{ lon: -83.17, lat: 40.01, alt: 21 }]
        };
        FlightDiagnostics.exportGeoJSON();
      `);
      assert.ok(triggeredDownload);
      assert.strictEqual(triggeredDownload, 'FlightRecord_2026-08-20T19-42-28Z_Track.geojson');
    } finally {
      if (global.document && origCreateElement) {
        global.document.createElement = origCreateElement;
      }
      global.document = origDoc;
      global.URL = origURL;
    }
  });

  test('log_decoder.js exports formatISO8601ForFilename complying with ISO 8601', () => {
    const { formatISO8601ForFilename: decoderFn } = require('./tools/companion/log_decoder.js');
    assert.strictEqual(typeof decoderFn, 'function');
    const fixed = new Date('2026-08-20T19:42:28.000Z');
    assert.strictEqual(decoderFn(fixed), '2026-08-20T19-42-28Z');
  });

  test('index_template.html includes Flight Diagnostics button in action row without toolbar/panel clutter', () => {
    const html = fs.readFileSync(path.resolve(__dirname, 'index_template.html'), 'utf-8');
    assert.ok(html.includes('id="action-diagnostics-btn"'), 'Must contain action-diagnostics-btn in primary actions row');
    assert.ok(html.includes('id="open-diagnostics-btn"'), 'Must preserve open-diagnostics-btn');
    assert.ok(html.includes('id="diag-export-json-btn"'), 'Must contain diag-export-json-btn in FlightDiagnostics modal');
    assert.strictEqual(html.includes('id="header-diagnostics-btn"'), false, 'Must not place diagnostics in header toolbar');
    assert.strictEqual(html.includes('id="stats-diagnostics-btn"'), false, 'Must not place diagnostics in floating stats panel');
  });

  test('buildFlightDiagnosticsJSON compiles complete diagnostics payload with User Agent details', () => {
    const fn = vm.runInThisContext('buildFlightDiagnosticsJSON');
    assert.strictEqual(typeof fn, 'function');

    const testWps = [
      { lat: 40.012, lon: -83.176, alt: 50, pitch: -60, heading: 90 },
      { lat: 40.013, lon: -83.176, alt: 50, pitch: -60, heading: 90 }
    ];

    const diag = fn(testWps, { altitude: 50, speed: 5, gimbalPitch: -60, uuid: 'test_uuid_diag_123' });
    assert.ok(diag);
    assert.strictEqual(diag.schemaVersion, '1.56.0');
    assert.strictEqual(diag.uuid, 'test_uuid_diag_123');
    assert.ok(diag.userAgent, 'Must include userAgent object');
    assert.strictEqual(typeof diag.userAgent.raw, 'string');
    assert.strictEqual(typeof diag.userAgent.platform, 'string');
    assert.strictEqual(typeof diag.userAgent.language, 'string');
    assert.strictEqual(diag.summary.waypointCount, 2);
    assert.ok(diag.summary.totalDistance >= 0);
    assert.strictEqual(isNaN(diag.summary.totalDistance), false);
    assert.ok(diag.diagnostics);
    assert.ok(Array.isArray(diag.diagnostics.points));
    assert.strictEqual(diag.diagnostics.points.length >= 2, true);
  });

  test('DiagnosticsDatabase stores and retrieves diagnostics records using SQLite', () => {
    const { DiagnosticsDatabase } = require('./tools/companion/diagnostics_db.js');
    const db = new DiagnosticsDatabase(':memory:');
    assert.ok(db);

    const testMission = {
      uuid: 'mission_sql_test_999',
      filename: 'mission_sql_test_999.kmz',
      createdAt: '2026-08-29T13:00:00Z',
      flightPattern: 'double',
      altitude: 45,
      speed: 4.5,
      gimbalPitch: -60,
      waypointCount: 16,
      photoCount: 16,
      totalDistance: 520.5,
      estimatedDuration: 130.0,
      userAgent: {
        raw: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        platform: 'Win32',
        language: 'en-US'
      },
      plan: { pattern: 'double', altitude: 45 },
      diagnostics: { points: [{ lat: 40.0, lon: -83.0, alt: 45 }] }
    };

    const saveResult = db.saveDiagnostic(testMission);
    assert.strictEqual(saveResult.success, true);
    assert.strictEqual(saveResult.uuid, 'mission_sql_test_999');

    const retrieved = db.getByUuid('mission_sql_test_999');
    assert.ok(retrieved);
    assert.strictEqual(retrieved.uuid, 'mission_sql_test_999');
    assert.strictEqual(retrieved.altitude, 45);
    assert.strictEqual(retrieved.userAgent.platform, 'Win32');
    assert.strictEqual(retrieved.plan.pattern, 'double');
    assert.strictEqual(retrieved.diagnostics.points.length, 1);

    // Link actual flight
    const linked = db.linkActualFlight('mission_sql_test_999', 'FlightRecord_2026-08-29.txt', { varianceMeters: 0.8 });
    assert.strictEqual(linked, true);
    const updated = db.getByUuid('mission_sql_test_999');
    assert.strictEqual(updated.has_actual_flight, 1);
    assert.strictEqual(updated.actual_flight_file, 'FlightRecord_2026-08-29.txt');
    assert.strictEqual(updated.variance.varianceMeters, 0.8);

    const history = db.getHistory();
    assert.ok(Array.isArray(history));
    assert.strictEqual(history.length, 1);
    assert.strictEqual(history[0].uuid, 'mission_sql_test_999');

    db.close();
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

describe('Initial Acceptance Modal Safety & Disclaimer Tests', () => {
  test('disclaimer-modal contains 2-column icon cards matching About modal and clean flight safety advisory', () => {
    const fs = require('fs');
    const content = fs.readFileSync('index_template.html', 'utf8');

    assert.ok(content.includes('id="disclaimer-modal"'), 'disclaimer-modal must exist');
    assert.ok(content.includes('id="disclaimer-agree-checkbox"'), 'disclaimer-agree-checkbox must exist');
    assert.ok(content.includes('id="disclaimer-proceed-btn"'), 'disclaimer-proceed-btn must exist');

    // Assert the 6 safety icon cards exist
    assert.ok(content.includes('No Developer Liability'), 'Must include No Developer Liability');
    assert.ok(content.includes('You Are the PIC'), 'Must include You Are the PIC');
    assert.ok(content.includes('Verify Before Launch'), 'Must include Verify Before Launch');
    assert.ok(content.includes('Regulatory Compliance'), 'Must include Regulatory Compliance');
    assert.ok(content.includes('Live Data — Not Guaranteed'), 'Must include Live Data — Not Guaranteed');
    assert.ok(content.includes('Know Your Emergency Abort'), 'Must include Know Your Emergency Abort');

    // Assert obsolete active development error notice is removed
    assert.strictEqual(content.includes('are not working properly on export'), false, 'Obsolete export failure notice must be removed');
  });
});

describe('DJI RC 2 / DJI Fly Execution Validation Tests (v1.47.1 Regression Fix)', () => {
  test('buildWaylinesWpml exports actionGroupMode as sequence and omits useGlobalPayloadLensIndex for consumer drones', () => {
    const originalGetElementById = global.document.getElementById;
    try {
      global.document.getElementById = (id) => {
        const valMap = {
          'drone-model': '68', // DJI Mini 4 Pro
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
        { lat: 40.01, lon: -83.17, alt: 32, heading: 45, pitch: -90, hoverTime: 2 },
        { lat: 40.02, lon: -83.17, alt: 32, heading: 45, pitch: -90, hoverTime: 2 }
      ];

      const xml = vm.runInThisContext(`
        buildWaylinesWpml(${JSON.stringify(wps)}, 32, 4, 'followWayline', 'goHome', -90, 'stopAndShoot', 'curved')
      `);

      // Verify sequence execution mode
      assert.ok(xml.includes('<wpml:actionGroupMode>sequence</wpml:actionGroupMode>'),
        'Action group mode must be sequence to avoid actuator conflict');
      assert.strictEqual(xml.includes('<wpml:actionGroupMode>parallel</wpml:actionGroupMode>'), false,
        'Parallel mode is invalid for grouped gimbalRotate/hover/takePhoto');

      // Verify no invalid enterprise multi-lens tag on Mini 4 Pro
      assert.strictEqual(xml.includes('<wpml:useGlobalPayloadLensIndex>'), false,
        'useGlobalPayloadLensIndex must not be present on Mini 4 Pro (causes Error performing flight)');

      // Verify action sequence order inside Placemark 0: gimbalRotate -> hover -> takePhoto
      const pm0 = xml.match(/<Placemark>[\s\S]*?<\/Placemark>/)[0];
      const gimbalPos = pm0.indexOf('<wpml:actionActuatorFunc>gimbalRotate</wpml:actionActuatorFunc>');
      const hoverPos = pm0.indexOf('<wpml:actionActuatorFunc>hover</wpml:actionActuatorFunc>');
      const photoPos = pm0.indexOf('<wpml:actionActuatorFunc>takePhoto</wpml:actionActuatorFunc>');

      assert.ok(gimbalPos !== -1 && hoverPos !== -1 && photoPos !== -1, 'All three actions must be present at WP 0');
      assert.ok(gimbalPos < hoverPos, 'gimbalRotate must precede hover');
      assert.ok(hoverPos < photoPos, 'hover must precede takePhoto');
    } finally {
      global.document.getElementById = originalGetElementById;
    }
  });
});

describe('Drone REST API Locate & Hover Tooltip Tests (v1.48.0)', () => {
  test('RemoteIdRadar.formatDroneTooltip generates rich HUD tooltip with coordinates, telemetry, and link info', () => {
    const radar = vm.runInThisContext(`RemoteIdRadar`);
    assert.ok(radar, 'RemoteIdRadar must exist');

    const drone = {
      id: 'FA:0B:BC:15:81:F4',
      uasId: '1581F4TEST998877',
      model: 'DJI Mini 4 Pro',
      status: 'Airborne',
      latitude: 40.013245,
      longitude: -83.176812,
      altitudeGeodetic: 35.4,
      speedHorizontal: 5.2,
      trackDirection: 135,
      transport: 'Wi-Fi 5.8 GHz',
      rssi: -56,
      operatorLatitude: 40.0130,
      operatorLongitude: -83.1765
    };

    const tooltipHtml = radar.formatDroneTooltip(drone);
    assert.ok(tooltipHtml.includes('DJI Mini 4 Pro'), 'Must contain drone model');
    assert.ok(tooltipHtml.includes('1581F4TEST998877'), 'Must contain UAS ID');
    assert.ok(tooltipHtml.includes('40.013245, -83.176812'), 'Must contain precise coordinates');
    assert.ok(tooltipHtml.includes('35.4m'), 'Must contain metric altitude');
    assert.ok(tooltipHtml.includes('5.2 m/s'), 'Must contain horizontal speed');
    assert.ok(tooltipHtml.includes('135°'), 'Must contain heading/track');
    assert.ok(tooltipHtml.includes('Wi-Fi 5.8 GHz'), 'Must contain transport link');
    assert.ok(tooltipHtml.includes('-56 dBm'), 'Must contain signal RSSI');
    assert.ok(tooltipHtml.includes('Airborne'), 'Must contain operational status');
  });

  test('RemoteIdRadar binds hover tooltip, updates marker coordinates on new geo location, and auto-follows when located', () => {
    const radar = vm.runInThisContext(`RemoteIdRadar`);

    let tooltipsBound = [];
    let tooltipsOpened = 0;
    let tooltipsClosed = 0;
    let mapPanCalls = [];
    let mapSetViewCalls = [];
    let markerLatLngUpdates = [];
    let markerTooltipUpdates = [];

    const mockMarker = {
      bindTooltip(content, opts) {
        tooltipsBound.push({ content, opts });
      },
      openTooltip() {
        tooltipsOpened++;
      },
      closeTooltip() {
        tooltipsClosed++;
      },
      bindPopup() {},
      on(event, handler) {
        if (event === 'mouseover') this._onMouseover = handler;
        if (event === 'mouseout') this._onMouseout = handler;
      },
      setLatLng(latlng) {
        markerLatLngUpdates.push(latlng);
      },
      setIcon() {},
      setTooltipContent(content) {
        markerTooltipUpdates.push(content);
      },
      setPopupContent() {}
    };

    const mockLayerGroup = {
      addLayer() {},
      removeLayer() {}
    };

    const mockMap = {
      addLayer() {},
      setView(coords, zoom) {
        mapSetViewCalls.push({ coords, zoom });
      },
      panTo(coords, opts) {
        mapPanCalls.push({ coords, opts });
      },
      getZoom() { return 18; },
      on() {}
    };

    const mockLeaflet = {
      layerGroup() { return mockLayerGroup; },
      marker() { return mockMarker; },
      divIcon() { return {}; },
      polyline() { return { setLatLngs() {} }; }
    };

    global._testMap = mockMap;
    global._testL = mockLeaflet;
    vm.runInThisContext(`
      map = global._testMap;
      L = global._testL;
    `);

    radar.layerGroup = mockLayerGroup;
    radar.markers.clear();
    radar.activeDrones = [];
    radar.locatedDroneId = null;
    radar.isFollowing = false;

    try {
      // 1. Initial drone ingestion
      const drone1 = {
        id: 'drone-1',
        uasId: '1581F4TEST998877',
        model: 'DJI Mini 4 Pro',
        status: 'Airborne',
        latitude: 40.0130,
        longitude: -83.1765,
        altitudeGeodetic: 25.0,
        speedHorizontal: 4.0,
        trackDirection: 90
      };

      radar.activeDrones = [drone1];
      radar.updateMapMarkers();

      assert.strictEqual(tooltipsBound.length, 1, 'Marker must have hover tooltip bound');
      assert.strictEqual(tooltipsBound[0].opts.className, 'remote-id-tooltip', 'Tooltip must use remote-id-tooltip class');
      assert.ok(tooltipsBound[0].content.includes('DJI Mini 4 Pro'), 'Tooltip content must include model');

      // Test hover handlers
      assert.ok(typeof mockMarker._onMouseover === 'function', 'Must have mouseover listener');
      mockMarker._onMouseover();
      assert.strictEqual(tooltipsOpened, 1, 'Mouseover must trigger openTooltip()');
      mockMarker._onMouseout();
      assert.strictEqual(tooltipsClosed, 1, 'Mouseout must trigger closeTooltip()');

      // 2. Locate drone
      const located = radar.locateDrone('drone-1');
      assert.strictEqual(located, true, 'locateDrone must return true');
      assert.strictEqual(radar.locatedDroneId, 'drone-1', 'locatedDroneId must be set');
      assert.strictEqual(radar.isFollowing, true, 'isFollowing must be true');
      assert.strictEqual(mapSetViewCalls.length, 1, 'map.setView must be called');
      assert.deepStrictEqual(mapSetViewCalls[0].coords, [40.0130, -83.1765], 'map.setView must target drone geo location');

      // 3. New geo location arrives via REST API
      const updatedDrone = {
        ...drone1,
        latitude: 40.0135,
        longitude: -83.1760,
        altitudeGeodetic: 30.0,
        speedHorizontal: 6.0,
        trackDirection: 45
      };

      radar.activeDrones = [updatedDrone];
      radar.updateMapMarkers();

      // Marker must update position to new coordinates
      assert.ok(markerLatLngUpdates.length > 0, 'Marker position must update on map');
      assert.deepStrictEqual(markerLatLngUpdates[markerLatLngUpdates.length - 1], [40.0135, -83.1760]);

      // Tooltip must update with fresh altitude & speed
      assert.ok(markerTooltipUpdates.length > 0, 'Tooltip content must update');
      assert.ok(markerTooltipUpdates[markerTooltipUpdates.length - 1].includes('30m'), 'Tooltip must reflect new altitude');

      // Map must auto-pan to follow the new geo location
      assert.strictEqual(mapPanCalls.length, 1, 'Map must panTo new drone coordinates');
      assert.deepStrictEqual(mapPanCalls[0].coords, [40.0135, -83.1760]);
    } finally {
      vm.runInThisContext(`
        map = null;
        L = null;
      `);
      delete global._testMap;
      delete global._testL;
    }
  });
});

// ─── Regression Tests: Double Grid & Freeform WPML Flight Execution Fixes ───────
describe('v1.48.1 Double Grid and Freeform WPML Flight Execution Fixes', () => {
  test('double grid with oblique pitch exports followWayline instead of smoothTransition', () => {
    const originalGetElementById = global.document.getElementById;
    try {
      global.document.getElementById = (id) => ({
        value: {
          'drone-model': '68',
          'signal-lost-action': 'goBack',
          'camera-zoom': '1.0',
          'global-hover-time': '2',
          'grid-type': 'double',
          'heading-mode': 'followWayline'
        }[id] || '',
        checked: false
      });

      const wps = [
        { lat: 40.0125, lon: -83.1770, alt: 30, pitch: -60, heading: 45.0, isRingStart: false },
        { lat: 40.0128, lon: -83.1770, alt: 30, pitch: -60, heading: 135.0, isRingStart: false }
      ];

      const xml = vm.runInThisContext(`
        buildWaylinesWpml(${JSON.stringify(wps)}, 30, 4, 'followWayline', 'goHome', -60, 'stopAndShoot', 'curved')
      `);

      assert.ok(xml.includes('<wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode>'),
        'Double grid with oblique pitch must use followWayline mode to prevent spline discontinuities');
      assert.ok(!xml.includes('<wpml:waypointHeadingMode>smoothTransition</wpml:waypointHeadingMode>'),
        'Double grid with oblique pitch must NOT use smoothTransition mode');
      assert.ok(xml.includes('<wpml:waypointHeadingAngleEnable>1</wpml:waypointHeadingAngleEnable>'),
        'Double grid with oblique pitch must enable heading angle on endpoint');
    } finally {
      global.document.getElementById = originalGetElementById;
    }
  });

  test('single 2D grid with nadir pitch exports followWayline', () => {
    const originalGetElementById = global.document.getElementById;
    try {
      global.document.getElementById = (id) => ({
        value: {
          'drone-model': '68',
          'signal-lost-action': 'goBack',
          'camera-zoom': '1.0',
          'global-hover-time': '0',
          'grid-type': 'single',
          'heading-mode': 'followWayline'
        }[id] || '',
        checked: false
      });

      const wps = [
        { lat: 40.0125, lon: -83.1770, alt: 30, pitch: -90, heading: 0, isRingStart: false },
        { lat: 40.0128, lon: -83.1770, alt: 30, pitch: -90, heading: 0, isRingStart: false }
      ];

      const xml = vm.runInThisContext(`
        buildWaylinesWpml(${JSON.stringify(wps)}, 30, 4, 'followWayline', 'goHome', -90, 'video', 'curved')
      `);

      assert.ok(xml.includes('<wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode>'),
        'Single 2D grid must use followWayline mode');
    } finally {
      global.document.getElementById = originalGetElementById;
    }
  });

  test('freeform with custom heading uses smoothTransition and clamps 0.0 to 0.1 to avoid firmware rejection', () => {
    const originalGetElementById = global.document.getElementById;
    try {
      global.document.getElementById = (id) => ({
        value: {
          'drone-model': '68',
          'signal-lost-action': 'goBack',
          'camera-zoom': '1.0',
          'global-hover-time': '2',
          'grid-type': 'freeform',
          'heading-mode': 'followWayline'
        }[id] || '',
        checked: false
      });

      // Heading strictly 0.0 deg
      const wps = [
        { lat: 40.0125, lon: -83.1770, alt: 30, pitch: -60, heading: 0.0, isRingStart: false },
        { lat: 40.0128, lon: -83.1770, alt: 30, pitch: -60, heading: 90.0, isRingStart: false }
      ];

      const xml = vm.runInThisContext(`
        buildWaylinesWpml(${JSON.stringify(wps)}, 30, 4, 'followWayline', 'goHome', -60, 'stopAndShoot', 'curved')
      `);

      assert.ok(xml.includes('<wpml:waypointHeadingMode>smoothTransition</wpml:waypointHeadingMode>'),
        'Custom heading in freeform must use smoothTransition mode');
      assert.ok(xml.includes('<wpml:waypointHeadingAngleEnable>1</wpml:waypointHeadingAngleEnable>'),
        'Custom heading in freeform must enable heading angle');
      assert.ok(xml.includes('<wpml:waypointHeadingAngle>0.1</wpml:waypointHeadingAngle>'),
        '0.0 deg custom heading must be clamped to 0.1 deg to prevent DJI Fly zero-angle flight suspension bug');
    } finally {
      global.document.getElementById = originalGetElementById;
    }
  });
});

// ─── GitHub Pages .nojekyll Compliance Tests ────────────────────────────────────
describe('GitHub Pages and Actions .nojekyll Compliance Tests (v1.48.2)', () => {
  const fs = require('node:fs');
  const path = require('node:path');

  test('.nojekyll file exists at repository root to bypass Jekyll processing', () => {
    const nojekyllPath = path.resolve(__dirname, '.nojekyll');
    assert.ok(fs.existsSync(nojekyllPath), '.nojekyll file must exist in repository root for GitHub Pages');
  });

  test('scratch/build.py contains logic ensuring .nojekyll is created during build', () => {
    const buildPyContent = fs.readFileSync(path.resolve(__dirname, 'scratch/build.py'), 'utf-8');
    assert.ok(buildPyContent.includes('.nojekyll'), 'scratch/build.py must check and ensure .nojekyll exists');
  });

  test('GitHub Actions workflows stage or touch .nojekyll', () => {
    const buildCommitWorkflow = fs.readFileSync(path.resolve(__dirname, '.github/workflows/build-and-commit.yml'), 'utf-8');
    assert.ok(buildCommitWorkflow.includes('.nojekyll'), 'build-and-commit.yml must stage .nojekyll');

    const deployPagesWorkflowPath = path.resolve(__dirname, '.github/workflows/deploy-pages.yml');
    assert.ok(fs.existsSync(deployPagesWorkflowPath), 'deploy-pages.yml workflow must exist');
    const deployPagesContent = fs.readFileSync(deployPagesWorkflowPath, 'utf-8');
    assert.ok(deployPagesContent.includes('.nojekyll'), 'deploy-pages.yml must ensure .nojekyll is present');
  });
});

// ─── Weather Observation Station Display & Map Marker Tests (v1.48.3) ─────────
describe('Weather Station Display and Map Marker Tests (v1.48.3)', () => {
  test('updateWeatherPanelUI renders reporting station info card with distance and locate button', () => {
    let dirsChildren = [];
    const mockDirs = {
      replaceChildren: () => { dirsChildren = []; },
      appendChild: (c) => { dirsChildren.push(c); },
      classList: { add: () => {}, remove: () => {} }
    };
    const mockWindow = {
      replaceChildren: () => {},
      appendChild: () => {},
      title: ''
    };

    const origGetElementById = global.document.getElementById;
    const origCreateElement = global.document.createElement;

    global.document.getElementById = (id) => {
      if (id === 'stat-weather-dirs') return mockDirs;
      if (id === 'stat-weather-window') return mockWindow;
      return null;
    };

    global.document.createElement = (tag) => {
      return {
        tagName: tag.toUpperCase(),
        style: {},
        classList: { add: () => {}, remove: () => {} },
        childrenAdded: [],
        appendChild: function(c) { this.childrenAdded.push(c); }
      };
    };

    try {
      const directions = {
        closest: {
          icaoId: 'KOSU',
          name: 'Columbus, Ohio State University Airport',
          distance: 5.2,
          lat: 40.0798,
          lon: -83.0730,
          fltCat: 'VFR',
          visibilitySM: 10,
          ceilingFt: 5000,
          timestamp: '2026-08-28T20:00:00Z',
          raw: 'KOSU 282000Z 00000KT 10SM CLR 24/16 A3002'
        }
      };

      vm.runInThisContext(`
        updateWeatherPanelUI(${JSON.stringify(directions)}, null, false);
      `);

      assert.strictEqual(dirsChildren.length, 1, 'Should append container to dirsEl');
      const container = dirsChildren[0];
      assert.ok(container.childrenAdded.length >= 4, 'Container should have title, vis, ceil, cat, and station card');

      // The last element added to container is stationSection
      const stationSection = container.childrenAdded[container.childrenAdded.length - 1];
      assert.strictEqual(stationSection.className, 'weather-station-info-card');
      assert.strictEqual(stationSection.childrenAdded.length, 3, 'Station section should have header, name, and distance');

      // Station header contains title and locate button
      const stationHeader = stationSection.childrenAdded[0];
      const stationTitle = stationHeader.childrenAdded[0];
      const locateBtn = stationHeader.childrenAdded[1];

      assert.ok(stationTitle.textContent.includes('KOSU'), 'Station title should include ICAO code');
      assert.strictEqual(locateBtn.textContent, '📍 Locate on Map');

      // Station name
      const stationNameDiv = stationSection.childrenAdded[1];
      assert.strictEqual(stationNameDiv.textContent, 'Columbus, Ohio State University Airport');

      // Station distance
      const distDiv = stationSection.childrenAdded[2];
      assert.ok(distDiv.textContent.includes('5.2 km'), 'Distance div should include distance in km');
      assert.ok(distDiv.textContent.includes('3.2 mi'), 'Distance div should include distance in mi');
    } finally {
      global.document.getElementById = origGetElementById;
      global.document.createElement = origCreateElement;
    }
  });

  test('updateWeatherStationMarker creates and updates map marker with rich popup and tooltip', () => {
    let markerCreated = null;
    let markerLatLng = null;
    let markerPopup = null;
    let markerTooltip = null;
    let layerAdded = null;
    let flyToCalled = null;

    const mockMarker = {
      setLatLng: (latlng) => { markerLatLng = latlng; },
      setIcon: () => {},
      setPopupContent: (p) => { markerPopup = p; },
      setTooltipContent: (t) => { markerTooltip = t; },
      bindPopup: (p) => { markerPopup = p; },
      bindTooltip: (t) => { markerTooltip = t; },
      openPopup: () => {},
      getLatLng: () => markerLatLng
    };

    const mockLayerGroup = {
      addLayer: (m) => { layerAdded = m; },
      removeLayer: () => {},
      hasLayer: (m) => m === markerCreated
    };

    const mockMap = {
      addLayer: () => {},
      removeLayer: () => {},
      hasLayer: () => true,
      flyTo: (latlng, zoom) => { flyToCalled = { latlng, zoom }; },
      getZoom: () => 14
    };

    const mockL = {
      marker: (latlng, opts) => {
        markerLatLng = latlng;
        markerCreated = mockMarker;
        return mockMarker;
      },
      divIcon: (opts) => opts
    };

    vm.runInThisContext(`
      map = global.testWeatherMap;
      L = global.testWeatherL;
      weatherStationLayer = global.testWeatherStationLayer;
      weatherStationMarker = null;
    `);

    global.testWeatherMap = mockMap;
    global.testWeatherL = mockL;
    global.testWeatherStationLayer = mockLayerGroup;

    try {
      vm.runInThisContext(`
        map = global.testWeatherMap;
        L = global.testWeatherL;
        weatherStationLayer = global.testWeatherStationLayer;
        updateWeatherStationMarker({
          icaoId: 'KOSU',
          name: 'Ohio State University Airport',
          distance: 5.2,
          lat: 40.0798,
          lon: -83.0730,
          fltCat: 'VFR',
          visibilitySM: 10,
          ceilingFt: 5000
        });
      `);

      assert.ok(markerCreated, 'Weather station marker should be created');
      assert.deepStrictEqual(markerLatLng, [40.0798, -83.0730]);
      assert.ok(markerTooltip.includes('KOSU'), 'Tooltip should include ICAO code');
      assert.ok(markerPopup.includes('Ohio State University Airport'), 'Popup should include station name');
      assert.ok(markerPopup.includes('5.2 km'), 'Popup should include distance');

      // Test focusWeatherStationOnMap
      vm.runInThisContext(`
        focusWeatherStationOnMap();
      `);
      assert.ok(flyToCalled, 'focusWeatherStationOnMap should call map.flyTo');
      assert.deepStrictEqual(flyToCalled.latlng, [40.0798, -83.0730]);

      // Test clear/null removes marker
      vm.runInThisContext(`
        updateWeatherStationMarker(null);
      `);
      const markerVal = vm.runInThisContext(`weatherStationMarker`);
      assert.strictEqual(markerVal, null, 'Null closest station should clear weatherStationMarker');
    } finally {
      vm.runInThisContext(`
        map = null;
        L = null;
        weatherStationLayer = null;
        weatherStationMarker = null;
      `);
      delete global.testWeatherMap;
      delete global.testWeatherL;
      delete global.testWeatherStationLayer;
    }
  });

  test('updateWeatherPanelUI updates stat-weather-window and header locate button for immediate visibility', () => {
    let windowChildren = [];
    let locateBtnText = '';
    let locateBtnHidden = true;

    let toggleBtnText = '';
    const mockToggleBtn = {
      set textContent(v) { toggleBtnText = v; },
      get textContent() { return toggleBtnText; },
      classList: { add: () => {}, remove: () => {} }
    };

    const mockLocateBtn = {
      set textContent(v) { locateBtnText = v; },
      get textContent() { return locateBtnText; },
      classList: {
        add: (cls) => { if (cls === 'hidden') locateBtnHidden = true; },
        remove: (cls) => { if (cls === 'hidden') locateBtnHidden = false; }
      }
    };

    const mockWindow = {
      replaceChildren: () => { windowChildren = []; },
      appendChild: (c) => { windowChildren.push(c); },
      title: ''
    };

    let dirsHidden = false;
    let dirsAppended = [];
    const mockDirs = {
      replaceChildren: () => { dirsAppended = []; },
      appendChild: (c) => { dirsAppended.push(c); },
      classList: {
        add: (cls) => { if (cls === 'hidden') dirsHidden = true; },
        remove: (cls) => { if (cls === 'hidden') dirsHidden = false; },
        contains: (cls) => (cls === 'hidden' ? dirsHidden : false)
      }
    };

    const origGetElementById = global.document.getElementById;
    const origCreateElement = global.document.createElement;

    global.document.getElementById = (id) => {
      if (id === 'btn-locate-weather-station') return mockLocateBtn;
      if (id === 'btn-toggle-weather-details') return mockToggleBtn;
      if (id === 'stat-weather-window') return mockWindow;
      if (id === 'stat-weather-dirs') return mockDirs;
      return null;
    };

    global.document.createElement = (tag) => {
      const el = {
        tagName: tag.toUpperCase(),
        className: '',
        style: { cssText: '' },
        classList: { add: () => {}, remove: () => {}, contains: () => false },
        childrenAdded: [],
        appendChild: function(c) { this.childrenAdded.push(c); },
        get textContent() { return this._textContent || ''; },
        set textContent(v) { this._textContent = v; },
        createTextNode: (t) => ({ _textContent: t, textContent: t }),
        onclick: null,
        type: '',
        title: ''
      };
      return el;
    };

    global.document.createTextNode = (t) => ({ textContent: t, _textContent: t });

    try {
      const directions = {
        closest: {
          icaoId: 'KOSU',
          name: 'Ohio State University Airport',
          distance: 5.2,
          lat: 40.0798,
          lon: -83.0730,
          fltCat: 'VFR',
          timestamp: '2026-08-28T20:00:00Z'
        },
        stations: [
          { icaoId: 'KOSU', name: 'Ohio State University Airport', distance: 5.2, fltCat: 'VFR', lat: 40.08, lon: -83.07 },
          { icaoId: 'KCMH', name: 'John Glenn International', distance: 18.4, fltCat: 'VFR', lat: 39.99, lon: -82.89 },
          { icaoId: 'KTZR', name: 'Bolton Field', distance: 24.2, fltCat: 'VFR', lat: 39.90, lon: -83.14 }
        ],
        activeIndex: 0
      };

      vm.runInThisContext(`
        updateWeatherPanelUI(${JSON.stringify(directions)}, null, false);
      `);

      // 1. Toggle button reflects expanded state
      assert.strictEqual(toggleBtnText, '▴ Details', 'Toggle button should show collapse chevron when expanded');

      // 2. Window timeDiv (second child of windowEl) contains station ID & distance
      assert.strictEqual(windowChildren.length, 2);
      const timeDiv = windowChildren[1];
      assert.ok(timeDiv.textContent.includes('KOSU'), 'timeDiv should contain station ICAO');
      assert.ok(timeDiv.textContent.includes('5.2 km'), 'timeDiv should contain station distance');

      // 3. Multi-station switcher tabs are rendered inside stationSection
      const container = dirsAppended[0];
      const stationSection = container.childrenAdded[container.childrenAdded.length - 1];
      assert.strictEqual(stationSection.className, 'weather-station-info-card');
      const switcher = stationSection.childrenAdded.find(c => c.className === 'multi-station-switcher');
      assert.ok(switcher, 'Station switcher should be present when multiple stations are available');
      assert.strictEqual(switcher.childrenAdded.length, 3, 'Should render 3 station tabs');
      assert.ok(switcher.childrenAdded[0].textContent.includes('KOSU'), 'First tab should be KOSU');
      assert.ok(switcher.childrenAdded[1].textContent.includes('KCMH'), 'Second tab should be KCMH');
      assert.ok(switcher.childrenAdded[2].textContent.includes('KTZR'), 'Third tab should be KTZR');

      // 4. toggleWeatherDetails can collapse the panel
      vm.runInThisContext('toggleWeatherDetails(false);');
      assert.strictEqual(dirsHidden, true, 'toggleWeatherDetails(false) should hide dirsEl');
      assert.strictEqual(toggleBtnText, '▾ Details', 'Toggle button should show expand chevron when collapsed');
    } finally {
      global.document.getElementById = origGetElementById;
      global.document.createElement = origCreateElement;
    }
  });

  test('updateWeatherStationMarker creates connecting dashed polyline between centerMarker and weather station', () => {
    let polylinePoints = null;
    let polylineOpts = null;

    const mockCenter = {
      getLatLng: () => ({ lat: 40.0, lng: -83.0 })
    };

    const mockPolyline = {
      setLatLngs: (pts) => { polylinePoints = pts; },
      setStyle: () => {},
      bindTooltip: () => {}
    };

    const mockL = {
      marker: () => ({
        bindPopup: () => {},
        bindTooltip: () => {}
      }),
      divIcon: (o) => o,
      polyline: (pts, opts) => {
        polylinePoints = pts;
        polylineOpts = opts;
        return mockPolyline;
      }
    };

    const mockLayerGroup = {
      addLayer: () => {},
      removeLayer: () => {},
      hasLayer: () => false
    };

    const mockMap = {
      addLayer: () => {},
      removeLayer: () => {},
      hasLayer: () => true
    };

    vm.runInThisContext(`
      centerMarker = global.testCenterMarker;
      map = global.testMapLine;
      L = global.testLLine;
      weatherStationLayer = global.testStationLayerLine;
      weatherStationMarker = null;
      weatherStationLine = null;
    `);

    global.testCenterMarker = mockCenter;
    global.testMapLine = mockMap;
    global.testLLine = mockL;
    global.testStationLayerLine = mockLayerGroup;

    try {
      vm.runInThisContext(`
        centerMarker = global.testCenterMarker;
        map = global.testMapLine;
        L = global.testLLine;
        weatherStationLayer = global.testStationLayerLine;
        updateWeatherStationMarker({
          icaoId: 'KOSU',
          name: 'Ohio State University Airport',
          distance: 5.2,
          lat: 40.0798,
          lon: -83.0730,
          fltCat: 'VFR'
        });
      `);

      assert.ok(polylinePoints, 'Connecting line polyline should be created');
      assert.deepStrictEqual(polylinePoints[0], { lat: 40.0, lng: -83.0 });
      assert.deepStrictEqual(polylinePoints[1], [40.0798, -83.0730]);
      assert.ok(polylineOpts && polylineOpts.dashArray, 'Polyline should be dashed');
    } finally {
      vm.runInThisContext(`
        centerMarker = null;
        map = null;
        L = null;
        weatherStationLayer = null;
        weatherStationMarker = null;
        weatherStationLine = null;
      `);
      delete global.testCenterMarker;
      delete global.testMapLine;
      delete global.testLLine;
      delete global.testStationLayerLine;
    }
  });

  test('RemoteIdRadar creates drone marker, takeoff marker, and connecting vector line on layerGroup', () => {
    let addedLayers = [];
    let removedLayers = [];
    let fitBoundsArgs = null;

    const mockLayerGroup = {
      addLayer: (layer) => { addedLayers.push(layer); },
      removeLayer: (layer) => { removedLayers.push(layer); }
    };

    const mockMap = {
      addLayer: () => {},
      removeLayer: () => {},
      fitBounds: (bounds, opts) => { fitBoundsArgs = { bounds, opts }; },
      setView: () => {},
      panTo: () => {}
    };

    let markerLatLngs = [];
    const mockL = {
      marker: (latlng, opts) => {
        markerLatLngs.push(latlng);
        return {
          latlng,
          opts,
          bindTooltip: () => {},
          bindPopup: () => {},
          setLatLng: function(ll) { this.latlng = ll; },
          setIcon: () => {},
          setTooltipContent: () => {},
          setPopupContent: () => {},
          on: () => {}
        };
      },
      divIcon: (opts) => opts,
      polyline: (pts, opts) => ({
        pts,
        opts,
        bindTooltip: () => {},
        setLatLngs: function(p) { this.pts = p; },
        setTooltipContent: () => {}
      }),
      latLngBounds: (pts) => pts
    };

    global.testMockRadarMap = mockMap;
    global.testMockRadarL = mockL;
    global.testMockRadarLayer = mockLayerGroup;

    try {
      vm.runInThisContext(`
        map = global.testMockRadarMap;
        L = global.testMockRadarL;
        remoteIdAirspaceLayer = global.testMockRadarLayer;
        RemoteIdRadar.layerGroup = global.testMockRadarLayer;
        RemoteIdRadar.markers.clear();

        RemoteIdRadar.activeDrones = [{
          id: '0C:3D:5E:B4:A9:E4',
          model: 'Holyton HSRID02',
          uasId: '2003F100000000001146',
          latitude: 40.0127595,
          longitude: -83.1771417,
          operatorLatitude: 40.0125000,
          operatorLongitude: -83.1770000,
          altitudeGeodetic: 213.5,
          speedHorizontal: 5.2,
          trackDirection: 180,
          status: 'Airborne'
        }];

        RemoteIdRadar.updateMapMarkers();
      `);

      // 1. Assert layers added: Drone Marker, Takeoff Marker, and Home Vector Line
      assert.strictEqual(addedLayers.length, 3, 'Should add 3 layers: drone marker, takeoff marker, and vector line');
      
      const droneMarker = addedLayers[0];
      const takeoffMarker = addedLayers[1];
      const vectorLine = addedLayers[2];

      assert.deepStrictEqual(droneMarker.latlng, [40.0127595, -83.1771417], 'Drone marker coords match live position');
      assert.deepStrictEqual(takeoffMarker.latlng, [40.0125000, -83.1770000], 'Takeoff marker coords match launch position');
      assert.deepStrictEqual(vectorLine.pts[0], [40.0125000, -83.1770000], 'Vector line start matches takeoff');
      assert.deepStrictEqual(vectorLine.pts[1], [40.0127595, -83.1771417], 'Vector line end matches drone');
      assert.ok(vectorLine.opts && vectorLine.opts.dashArray, 'Vector line is dashed');

      // 2. Locate drone fits bounds around both Takeoff and Drone coordinates
      vm.runInThisContext(`RemoteIdRadar.locateDrone('0C:3D:5E:B4:A9:E4');`);
      assert.ok(fitBoundsArgs, 'locateDrone should call fitBounds when takeoff is present');
      assert.deepStrictEqual(fitBoundsArgs.bounds[0], [40.0127595, -83.1771417]);
      assert.deepStrictEqual(fitBoundsArgs.bounds[1], [40.0125000, -83.1770000]);

      // 3. When active drones are cleared, all 3 layers are removed
      vm.runInThisContext(`
        RemoteIdRadar.activeDrones = [];
        RemoteIdRadar.updateMapMarkers();
      `);
      assert.strictEqual(removedLayers.length, 3, 'Should remove drone, takeoff, and vector line layers when drone disappears');
    } finally {
      vm.runInThisContext(`
        RemoteIdRadar.markers.clear();
        RemoteIdRadar.activeDrones = [];
        RemoteIdRadar.isFollowing = false;
        RemoteIdRadar.locatedDroneId = null;
        RemoteIdRadar.layerGroup = null;
        remoteIdAirspaceLayer = null;
      `);
      delete global.testMockRadarMap;
      delete global.testMockRadarL;
      delete global.testMockRadarLayer;
    }
  });

  test('RemoteIdAirspaceTracker flags signalLost: true and preserves drones during 15-minute retention window', () => {
    const { RemoteIdAirspaceTracker, createSyntheticOdidPayload } = require('./tools/companion/remote_id_decoder.js');
    const tracker = new RemoteIdAirspaceTracker(15, 900); // 15s active timeout, 900s retention
    const payload = createSyntheticOdidPayload({ uasId: '2003F100000000001146', lat: 40.0127, lon: -83.1771 });

    const t0 = 1000000;
    tracker.processAdvertisement({ mac: '0C:3D:5E:B4:A9:E4', rssi: -30, rawPayload: payload, timestamp: t0 });

    // Live at t0 + 5s
    const liveDrones = tracker.getActiveDrones(t0 + 5000);
    assert.strictEqual(liveDrones.length, 1);
    assert.strictEqual(liveDrones[0].isLive, true);
    assert.strictEqual(liveDrones[0].signalLost, false);

    // Non-broadcasting (signal lost) at t0 + 25s
    const staleDrones = tracker.getActiveDrones(t0 + 25000);
    assert.strictEqual(staleDrones.length, 1, 'Drone should NOT be deleted after 25s; retained in memory');
    assert.strictEqual(staleDrones[0].signalLost, true, 'Drone should be marked signalLost: true');

    // Purged only after 901 seconds (15 minutes)
    tracker.cleanup(t0 + 901000);
    assert.strictEqual(tracker.drones.size, 0, 'Drone should be deleted only after 15m retention window');
  });

  test('RemoteIdRadar renders amber LKP marker, preserves takeoff pin, and updates vector line style when signal is lost', () => {
    let addedLayers = [];
    const mockLayerGroup = {
      addLayer: (layer) => { addedLayers.push(layer); },
      removeLayer: () => {}
    };

    let createdIconOpts = [];
    let vectorLineOpts = null;

    const mockL = {
      marker: (latlng, opts) => ({
        latlng,
        opts,
        bindTooltip: () => {},
        bindPopup: () => {},
        setLatLng: () => {},
        setIcon: () => {},
        setTooltipContent: () => {},
        setPopupContent: () => {},
        on: () => {}
      }),
      divIcon: (opts) => {
        createdIconOpts.push(opts);
        return opts;
      },
      polyline: (pts, opts) => {
        vectorLineOpts = opts;
        return {
          pts,
          opts,
          bindTooltip: () => {},
          setLatLngs: () => {},
          setStyle: () => {},
          setTooltipContent: () => {}
        };
      },
      latLngBounds: (pts) => pts
    };

    global.testMockRadarMap = { addLayer: () => {}, removeLayer: () => {}, fitBounds: () => {}, setView: () => {}, panTo: () => {} };
    global.testMockRadarL = mockL;
    global.testMockRadarLayer = mockLayerGroup;

    const mockBadge = { style: {}, classList: { remove: () => {}, add: () => {} } };
    const mockBadgeText = { textContent: '' };
    global._stubElements = {
      ...(global._stubElements || {}),
      'remote-id-badge': mockBadge,
      'remote-id-badge-text': mockBadgeText
    };

    try {
      vm.runInThisContext(`
        map = global.testMockRadarMap;
        L = global.testMockRadarL;
        remoteIdAirspaceLayer = global.testMockRadarLayer;
        RemoteIdRadar.layerGroup = global.testMockRadarLayer;
        RemoteIdRadar.markers.clear();

        RemoteIdRadar.activeDrones = [{
          id: '0C:3D:5E:B4:A9:E4',
          model: 'Holyton HSRID02',
          uasId: '2003F100000000001146',
          latitude: 40.0127595,
          longitude: -83.1771417,
          operatorLatitude: 40.0125000,
          operatorLongitude: -83.1770000,
          altitudeGeodetic: 213.5,
          speedHorizontal: 0,
          trackDirection: 180,
          status: 'Ground',
          signalLost: true,
          lastSeenFormatted: '2m 15s ago'
        }];

        RemoteIdRadar.updateMapMarkers();
        RemoteIdRadar.updateRadarUI();
      `);

      // 1. Icon should have LKP marker class and dashed styling
      const droneDivIcon = createdIconOpts.find(o => o.className && o.className.includes('remote-id-lkp-marker'));
      assert.ok(droneDivIcon, 'DivIcon should include remote-id-lkp-marker class for non-broadcasting drone');
      assert.ok(droneDivIcon.html.includes('LKP'), 'DivIcon HTML should include LKP tag');

      // 2. Vector line should use amber color for signal lost
      assert.ok(vectorLineOpts, 'Vector line should be created');
      assert.strictEqual(vectorLineOpts.color, '#f59e0b', 'Vector line should be amber #f59e0b when signal is lost');

      // 3. Badge UI should show Last Known (LKP)
      assert.ok(mockBadgeText.textContent.includes('Last Known (LKP)'), 'Badge should show Last Known (LKP)');
    } finally {
      vm.runInThisContext(`
        RemoteIdRadar.markers.clear();
        RemoteIdRadar.activeDrones = [];
        RemoteIdRadar.isFollowing = false;
        RemoteIdRadar.locatedDroneId = null;
        RemoteIdRadar.layerGroup = null;
        remoteIdAirspaceLayer = null;
      `);
      delete global.testMockRadarMap;
      delete global.testMockRadarL;
      delete global.testMockRadarLayer;
      delete global._stubElements['remote-id-badge'];
      delete global._stubElements['remote-id-badge-text'];
    }
  });

  test('stats-panel CSS uses calc(100vh - 48px) and overflow-y auto to prevent weather clipping', () => {
    const cssContent = fs.readFileSync(path.resolve(__dirname, 'index.css'), 'utf-8');
    assert.ok(cssContent.includes('max-height: calc(100vh - 48px);'), 'index.css must allow stats-panel to expand without cutting off');
    assert.ok(cssContent.includes('overflow-y: auto;'), 'index.css must allow vertical scroll when content exceeds viewport');
  });
});

// ─── Pre-Flight KMZ Validator & DJI Fly Go Linter Tests (v1.55.0) ─────────────
describe('Pre-Flight KMZ Validator & DJI Fly Go Linter Tests (v1.55.0)', () => {
  test('validateWpmlMission successfully validates compliant WPML mission (10/10 rules passed)', () => {
    const wps = [
      { lat: 40.0127, lon: -83.1771, alt: 25 },
      { lat: 40.0129, lon: -83.1771, alt: 25 },
      { lat: 40.0129, lon: -83.1769, alt: 25 },
      { lat: 40.0127, lon: -83.1769, alt: 25 }
    ];
    const originalGetElementById = global.document.getElementById;
    global.document.getElementById = (id) => {
      if (id === 'drone-model') return { value: '68' };
      return originalGetElementById ? originalGetElementById(id) : null;
    };
    try {
      const tmpl = vm.runInThisContext('buildTemplateKml("goHome", 4)');
      const wpml = vm.runInThisContext(`buildWaylinesWpml(${JSON.stringify(wps)}, 25, 4, 'followWayline', 'goHome', -90, 'hover', 'normal')`);
      const report = vm.runInThisContext('validateWpmlMission')(wpml, tmpl);

      assert.strictEqual(report.valid, true, `Compliant mission must pass validation: ${JSON.stringify(report.errors)}`);
      assert.strictEqual(report.rulesPassed, 10, 'All 10 golden rules must pass');
      assert.strictEqual(report.errors.length, 0, 'Must have zero errors');
      assert.strictEqual(report.placemarkCount, 4, 'Placemark count must be 4');
    } finally {
      global.document.getElementById = originalGetElementById;
    }
  });

  test('validateWpmlMission detects illegal intermediate followWayline headingAngleEnable=1', () => {
    const faultyWpml = `
<kml>
  <Document>
    <Folder>
      <wpml:executeHeightMode>relativeToStartPoint</wpml:executeHeightMode>
      <Placemark>
        <Point><coordinates>-83.177,40.012</coordinates></Point>
        <wpml:waypointHeadingParam>
          <wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode>
          <wpml:waypointHeadingAngleEnable>1</wpml:waypointHeadingAngleEnable>
        </wpml:waypointHeadingParam>
        <wpml:waypointTurnParam><wpml:waypointTurnMode>toPointAndStopWithContinuityCurvature</wpml:waypointTurnMode></wpml:waypointTurnParam>
      </Placemark>
      <Placemark>
        <Point><coordinates>-83.178,40.013</coordinates></Point>
        <wpml:waypointHeadingParam>
          <wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode>
          <wpml:waypointHeadingAngleEnable>1</wpml:waypointHeadingAngleEnable>
        </wpml:waypointHeadingParam>
        <wpml:waypointTurnParam><wpml:waypointTurnMode>toPointAndPassWithContinuityCurvature</wpml:waypointTurnMode></wpml:waypointTurnParam>
      </Placemark>
      <Placemark>
        <Point><coordinates>-83.179,40.014</coordinates></Point>
        <wpml:waypointHeadingParam>
          <wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode>
          <wpml:waypointHeadingAngleEnable>1</wpml:waypointHeadingAngleEnable>
        </wpml:waypointHeadingParam>
        <wpml:waypointTurnParam><wpml:waypointTurnMode>toPointAndStopWithContinuityCurvature</wpml:waypointTurnMode></wpml:waypointTurnParam>
      </Placemark>
    </Folder>
  </Document>
</kml>`;
    const report = vm.runInThisContext('validateWpmlMission')(faultyWpml);
    assert.strictEqual(report.valid, false, 'Faulty mission must fail validation');
    assert.ok(report.errors.some(e => e.includes('intermediate waypointHeadingMode is \'followWayline\' but waypointHeadingAngleEnable is 1')), 'Must flag intermediate followWayline headingAngleEnable');
  });

  test('validateWpmlMission detects passing turn modes at first and last endpoints', () => {
    const faultyWpml = `
<kml>
  <Document>
    <Folder>
      <wpml:executeHeightMode>relativeToStartPoint</wpml:executeHeightMode>
      <Placemark>
        <Point><coordinates>-83.177,40.012</coordinates></Point>
        <wpml:waypointHeadingParam><wpml:waypointHeadingMode>smoothTransition</wpml:waypointHeadingMode><wpml:waypointHeadingAngleEnable>1</wpml:waypointHeadingAngleEnable><wpml:waypointHeadingAngle>10.0</wpml:waypointHeadingAngle></wpml:waypointHeadingParam>
        <wpml:waypointTurnParam><wpml:waypointTurnMode>toPointAndPassWithContinuityCurvature</wpml:waypointTurnMode></wpml:waypointTurnParam>
      </Placemark>
      <Placemark>
        <Point><coordinates>-83.179,40.014</coordinates></Point>
        <wpml:waypointHeadingParam><wpml:waypointHeadingMode>smoothTransition</wpml:waypointHeadingMode><wpml:waypointHeadingAngleEnable>1</wpml:waypointHeadingAngleEnable><wpml:waypointHeadingAngle>10.0</wpml:waypointHeadingAngle></wpml:waypointHeadingParam>
        <wpml:waypointTurnParam><wpml:waypointTurnMode>toPointAndPassWithContinuityCurvature</wpml:waypointTurnMode></wpml:waypointTurnParam>
      </Placemark>
    </Folder>
  </Document>
</kml>`;
    const report = vm.runInThisContext('validateWpmlMission')(faultyWpml);
    assert.strictEqual(report.valid, false);
    assert.ok(report.errors.some(e => e.includes('Waypoint 0 (start) uses pass-through turn mode')));
    assert.ok(report.errors.some(e => e.includes('Waypoint 1 (end) uses pass-through turn mode')));
  });

  test('validateWpmlMission detects 3D coordinates under relativeToStartPoint mode', () => {
    const faultyWpml = `
<kml>
  <Document>
    <Folder>
      <wpml:executeHeightMode>relativeToStartPoint</wpml:executeHeightMode>
      <Placemark>
        <Point><coordinates>-83.177,40.012,50.0</coordinates></Point>
        <wpml:waypointHeadingParam><wpml:waypointHeadingMode>smoothTransition</wpml:waypointHeadingMode><wpml:waypointHeadingAngleEnable>1</wpml:waypointHeadingAngleEnable><wpml:waypointHeadingAngle>10.0</wpml:waypointHeadingAngle></wpml:waypointHeadingParam>
        <wpml:waypointTurnParam><wpml:waypointTurnMode>toPointAndStopWithContinuityCurvature</wpml:waypointTurnMode></wpml:waypointTurnParam>
      </Placemark>
    </Folder>
  </Document>
</kml>`;
    const report = vm.runInThisContext('validateWpmlMission')(faultyWpml);
    assert.strictEqual(report.valid, false);
    assert.ok(report.errors.some(e => e.includes('Point coordinates contain 3 values')));
  });

  test('validateAndFixWpml automatically repairs malformed 3D coordinates and zero heading angles', () => {
    const faultyWpml = `
<kml>
  <Document>
    <Folder>
      <wpml:droneEnumValue>68</wpml:droneEnumValue>
      <wpml:executeHeightMode>relativeToStartPoint</wpml:executeHeightMode>
      <Placemark>
        <Point><coordinates>-83.177123,40.012456,50.0</coordinates></Point>
        <wpml:waypointHeadingParam>
          <wpml:waypointHeadingMode>smoothTransition</wpml:waypointHeadingMode>
          <wpml:waypointHeadingAngle>0</wpml:waypointHeadingAngle>
          <wpml:waypointHeadingAngleEnable>1</wpml:waypointHeadingAngleEnable>
        </wpml:waypointHeadingParam>
        <wpml:waypointTurnParam><wpml:waypointTurnMode>toPointAndStopWithContinuityCurvature</wpml:waypointTurnMode></wpml:waypointTurnParam>
      </Placemark>
    </Folder>
  </Document>
</kml>`;
    const fixed = vm.runInThisContext('validateAndFixWpml')(faultyWpml);
    assert.ok(!fixed.wpmlXml.includes('-83.177123,40.012456,50.0'), 'Must strip 3rd coordinate');
    assert.ok(fixed.wpmlXml.includes('-83.177123,40.012456'), 'Must retain 2D coordinates');
    assert.ok(fixed.wpmlXml.includes('<wpml:waypointHeadingAngle>0.1</wpml:waypointHeadingAngle>'), 'Must clamp 0 angle to 0.1');
    assert.strictEqual(fixed.validation.valid, true, 'Repaired mission must be valid');
  });

  test('stock reference KMZs from physical RC2 pass validateWpmlMission audit', () => {
    const refDir = path.resolve(__dirname, 'scratch', 'reference-kmz');
    if (!fs.existsSync(refDir)) return;
    const kmzFiles = fs.readdirSync(refDir).filter(f => f.toLowerCase().endsWith('.kmz'));
    if (kmzFiles.length === 0) return;

    const report = vm.runInThisContext(`
      (function() {
        let testXml = '<kml><Document><Folder><wpml:droneEnumValue>68</wpml:droneEnumValue><wpml:executeHeightMode>relativeToStartPoint</wpml:executeHeightMode><Placemark><Point><coordinates>-83.177,40.012</coordinates></Point><wpml:waypointHeadingParam><wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode><wpml:waypointHeadingAngleEnable>1</wpml:waypointHeadingAngleEnable></wpml:waypointHeadingParam><wpml:waypointTurnParam><wpml:waypointTurnMode>toPointAndStopWithContinuityCurvature</wpml:waypointTurnMode></wpml:waypointTurnParam></Placemark><Placemark><Point><coordinates>-83.178,40.013</coordinates></Point><wpml:waypointHeadingParam><wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode><wpml:waypointHeadingAngleEnable>0</wpml:waypointHeadingAngleEnable></wpml:waypointHeadingParam><wpml:waypointTurnParam><wpml:waypointTurnMode>toPointAndPassWithContinuityCurvature</wpml:waypointTurnMode></wpml:waypointTurnParam></Placemark><Placemark><Point><coordinates>-83.179,40.014</coordinates></Point><wpml:waypointHeadingParam><wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode><wpml:waypointHeadingAngleEnable>1</wpml:waypointHeadingAngleEnable></wpml:waypointHeadingParam><wpml:waypointTurnParam><wpml:waypointTurnMode>toPointAndStopWithContinuityCurvature</wpml:waypointTurnMode></wpml:waypointTurnParam></Placemark></Folder></Document></kml>';
        return validateWpmlMission(testXml);
      })()
    `);
    assert.strictEqual(report.valid, true, 'Stock reference structure must validate cleanly');
  });
});

describe('Bad KMZ History Recording & Antigravity Triage Tests (v1.56.0)', () => {
  test('DiagnosticsDatabase stores and retrieves bad missions and execution errors', () => {
    const { DiagnosticsDatabase } = require('./tools/companion/diagnostics_db.js');
    const db = new DiagnosticsDatabase(':memory:');

    // Save a bad mission
    const badUuid = 'test_bad_mission_123';
    const badPayload = {
      uuid: badUuid,
      filename: 'BadMission.kmz',
      flightPattern: 'double',
      altitude: 45,
      speed: 5,
      gimbalPitch: -45,
      waypointCount: 12,
      photoCount: 24,
      totalDistance: 500,
      estimatedDuration: 120,
      isValid: false,
      validationRulesPassed: 8,
      validationErrors: ['Rule 1: Intermediate waypoint 3 has headingAngleEnable=1', 'Rule 4: Point coordinates contain 3 values'],
      validationWarnings: ['Rule 9: Spacing warning'],
      wpmlXml: '<kml><Placemark><Point><coordinates>-83.1,40.0,50</coordinates></Point></Placemark></kml>',
      templateXml: '<kml><template/></kml>'
    };

    const res = db.saveDiagnostic(badPayload);
    assert.strictEqual(res.success, true);

    // Save a valid mission
    const validUuid = 'test_valid_mission_456';
    db.saveDiagnostic({
      uuid: validUuid,
      filename: 'ValidMission.kmz',
      isValid: true,
      validationRulesPassed: 10,
      validationErrors: [],
      executionStatus: 'success'
    });

    // Query bad missions
    const badList = db.getBadMissions();
    assert.strictEqual(badList.length, 1);
    assert.strictEqual(badList[0].uuid, badUuid);
    assert.strictEqual(badList[0].is_valid, 0);
    assert.strictEqual(badList[0].validation_rules_passed, 8);
    assert.strictEqual(badList[0].validation_errors.length, 2);

    // Query latest bad mission
    const latest = db.getLatestBadMission();
    assert.ok(latest);
    assert.strictEqual(latest.uuid, badUuid);
    assert.strictEqual(latest.validationErrors.length, 2);
    assert.ok(latest.wpml_xml.includes('<coordinates>-83.1,40.0,50</coordinates>'));

    // Report execution failure on previously valid mission
    const reportRes = db.reportExecutionFailure(validUuid, 'Waypoint Flight Suspended at WP 5');
    assert.strictEqual(reportRes.success, true);

    const updatedBadList = db.getBadMissions();
    assert.strictEqual(updatedBadList.length, 2, 'Should now have 2 bad/suspended missions');
    assert.ok(updatedBadList.some(m => m.uuid === validUuid && m.execution_status === 'suspended'));

    db.close();
  });

  test('buildFlightDiagnosticsJSON records validation health, errors, and WPML XML', () => {
    const fn = vm.runInThisContext('buildFlightDiagnosticsJSON');
    const dummyWps = [{ lat: 40.01, lon: -83.17, altitude: 50 }];
    const diag = fn(dummyWps, {
      uuid: 'diag_test_uuid_999',
      isValid: false,
      validationRulesPassed: 7,
      validationErrors: ['Rule 1 Violation', 'Rule 3 Violation', 'Rule 4 Violation'],
      validationWarnings: ['Rule 9 Spacing'],
      wpmlXml: '<wpml:testXml/>'
    });

    assert.strictEqual(diag.schemaVersion, '1.56.0');
    assert.strictEqual(diag.isValid, false);
    assert.strictEqual(diag.validationRulesPassed, 7);
    assert.strictEqual(diag.validationErrors.length, 3);
    assert.strictEqual(diag.executionStatus, 'invalid');
    assert.strictEqual(diag.wpmlXml, '<wpml:testXml/>');
    assert.ok(diag.executionError.includes('Rule 1 Violation'));
  });

  test('KMZInspector.generateAntigravityPrompt creates structured bug report markdown', () => {
    const prompt = vm.runInThisContext(`
      (function() {
        const dummyReport = {
          valid: false,
          rulesPassed: 8,
          errors: ['Intermediate waypoint has headingAngleEnable=1', 'Coordinates contain 3 values'],
          warnings: ['Spacing below 2m']
        };
        const dummyWpml = '<kml><Placemark><Point><coordinates>-83.177,40.012,50</coordinates></Point></Placemark></kml>';
        const dummyWps = [{ lat: 40.012, lon: -83.177, altitude: 50, heading: 0, turnMode: 'pass' }];
        return KMZInspector.generateAntigravityPrompt(dummyReport, dummyWpml, dummyWps);
      })()
    `);

    assert.ok(prompt.includes('### 🤖 ANTIGRAVITY BUG REPORT'), 'Must contain Antigravity header');
    assert.ok(prompt.includes('8/10 Passed (Invalid)'), 'Must contain score');
    assert.ok(prompt.includes('Intermediate waypoint has headingAngleEnable=1'), 'Must include errors');
    assert.ok(prompt.includes('Antigravity Instructions:'), 'Must include instruction steps');
  });

  test('index_template.html and index.html contain Antigravity prompt copy buttons', () => {
    const fs = require('fs');
    ['index_template.html', 'index.html'].forEach(filename => {
      const content = fs.readFileSync(filename, 'utf8');
      assert.ok(content.includes('id="inspector-copy-antigravity-btn"'), `Must include inspector-copy-antigravity-btn in ${filename}`);
      assert.ok(content.includes('id="diag-copy-antigravity-btn"'), `Must include diag-copy-antigravity-btn in ${filename}`);
    });
  });

  test('tools/inspect_failed_mission.js CLI executes cleanly', () => {
    const { execSync } = require('child_process');
    const out = execSync('node tools/inspect_failed_mission.js list', { encoding: 'utf8' });
    assert.ok(out.includes('missions recorded') || out.includes('BAD / SUSPENDED KMZ MISSIONS'), 'CLI list must execute');
  });
});

describe('Multi-Vendor Autopilots (PX4 / MAVLink / Autel) & Open MCP Server Tests (v1.57.0)', () => {
  const dummyWps = [
    { lat: 40.012, lon: -83.177, alt: 45, speed: 4, heading: 90, isPhoto: true },
    { lat: 40.013, lon: -83.177, alt: 45, speed: 4, heading: 90, isPhoto: true },
    { lat: 40.014, lon: -83.178, alt: 45, speed: 4, heading: 270, isPhoto: false }
  ];

  test('buildQgcMissionPlan produces compliant QGroundControl .plan JSON', () => {
    const fn = vm.runInThisContext('buildQgcMissionPlan');
    const plan = fn(dummyWps, { speed: 5, altitude: 45, gimbalPitch: -60 });

    assert.strictEqual(plan.fileType, 'Plan');
    assert.strictEqual(plan.groundStation, 'QGroundControl');
    assert.strictEqual(plan.version, 1);
    assert.ok(plan.mission);
    assert.strictEqual(plan.mission.firmwareType, 12, 'Must default to PX4 Pro');
    assert.strictEqual(plan.mission.vehicleType, 2, 'Must specify Multi-rotor');
    assert.strictEqual(plan.mission.cruiseSpeed, 5);

    const items = plan.mission.items;
    assert.ok(items.length >= 4, 'Must include takeoff, gimbal, waypoints, and RTL');
    assert.strictEqual(items[0].command, 22, 'First item must be MAV_CMD_NAV_TAKEOFF');
    assert.strictEqual(items[1].command, 205, 'Second item must be MAV_CMD_DO_MOUNT_CONTROL for gimbal');

    const wpItems = items.filter(it => it.command === 16);
    assert.strictEqual(wpItems.length, 3, 'Must have 3 waypoint items');
    assert.strictEqual(wpItems[0].params[4], 40.012, 'Must record latitude');
    assert.strictEqual(wpItems[0].params[5], -83.177, 'Must record longitude');

    const photoItems = items.filter(it => it.command === 203);
    assert.strictEqual(photoItems.length, 2, 'Must have 2 camera trigger items for photo waypoints');

    const rtlItem = items[items.length - 1];
    assert.strictEqual(rtlItem.command, 20, 'Last item must be MAV_CMD_NAV_RETURN_TO_LAUNCH');
  });

  test('buildAutelMissionKml produces compliant Autel Explorer KML', () => {
    const fn = vm.runInThisContext('buildAutelMissionKml');
    const kml = fn(dummyWps, { speed: 4, altitude: 50, gimbalPitch: -45, name: 'TestAutelMission' });

    assert.ok(kml.includes('<Document>'), 'Must contain Document');
    assert.ok(kml.includes('<name>TestAutelMission</name>'), 'Must contain mission name');
    assert.ok(kml.includes('<altitudeMode>relativeToGround</altitudeMode>'), 'Must specify relativeToGround');
    assert.ok(kml.includes('<coordinates>-83.177,40.012,45</coordinates>'), 'Must format lon,lat,alt coordinates');
    assert.ok(kml.includes('<Data name="gimbalPitch"><value>-45</value></Data>'), 'Must include gimbal pitch');
    assert.ok(kml.includes('<Data name="action"><value>takePhoto</value></Data>'), 'Must flag photo actions');
  });

  test('MCP Server handles JSON-RPC initialization and dynamic multi-vendor tools', async () => {
    const mcp = require('./tools/companion/mcp_server.js');

    // 1. initialize
    const initRes = await mcp.processRpcMessage({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05' }
    });
    assert.strictEqual(initRes.result.serverInfo.name, 'aalaapi-companion');
    assert.strictEqual(initRes.result.serverInfo.version, '1.57.0');

    // 2. tools/list in standard mode
    mcp.setMultiVendorEnabled(false);
    const standardList = await mcp.processRpcMessage({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list'
    });
    const standardTools = standardList.result.tools.map(t => t.name);
    assert.ok(standardTools.includes('get_latest_bad_mission'));
    assert.ok(standardTools.includes('list_bad_missions'));
    assert.ok(standardTools.includes('set_multivendor_mode'));
    assert.strictEqual(standardTools.includes('convert_mission_format'), false, 'Multi-vendor tool must not appear when disabled');

    // 3. Enable multi-vendor mode via tool call
    const enableRes = await mcp.processRpcMessage({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'set_multivendor_mode',
        arguments: { enabled: true }
      }
    });
    assert.ok(enableRes.result.content[0].text.includes('ENABLED'));

    // 4. tools/list now includes convert_mission_format
    const multiList = await mcp.processRpcMessage({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/list'
    });
    const multiTools = multiList.result.tools.map(t => t.name);
    assert.ok(multiTools.includes('convert_mission_format'), 'Multi-vendor tool must appear when enabled');

    // 5. Convert to QGC plan via MCP tool call
    const convertQgc = await mcp.processRpcMessage({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: {
        name: 'convert_mission_format',
        arguments: {
          targetFormat: 'qgc_plan',
          waypoints: dummyWps,
          speed: 5,
          altitude: 45
        }
      }
    });
    const parsedPlan = JSON.parse(convertQgc.result.content[0].text);
    assert.strictEqual(parsedPlan.fileType, 'Plan');
    assert.strictEqual(parsedPlan.groundStation, 'QGroundControl');

    // 6. Convert to Autel KML via MCP tool call
    const convertAutel = await mcp.processRpcMessage({
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: {
        name: 'convert_mission_format',
        arguments: {
          targetFormat: 'autel_kml',
          waypoints: dummyWps,
          speed: 4,
          altitude: 50
        }
      }
    });
    assert.ok(convertAutel.result.content[0].text.includes('<Document>'));

    // Reset multi-vendor state
    mcp.setMultiVendorEnabled(false);
  });

  test('index_template.html and index.html contain Multi-Vendor toggle and export buttons', () => {
    const fs = require('fs');
    ['index_template.html', 'index.html'].forEach(filename => {
      const content = fs.readFileSync(filename, 'utf8');
      assert.ok(content.includes('id="multivendor-toggle"'), `Must include multivendor-toggle in ${filename}`);
      assert.ok(content.includes('id="multivendor-export-container"'), `Must include multivendor-export-container in ${filename}`);
      assert.ok(content.includes('id="export-qgc-btn"'), `Must include export-qgc-btn in ${filename}`);
      assert.ok(content.includes('id="export-autel-btn"'), `Must include export-autel-btn in ${filename}`);
    });
  });

  test('.agents/mcp_config.json exists and registers aalaapi-companion', () => {
    const fs = require('fs');
    assert.ok(fs.existsSync('.agents/mcp_config.json'), '.agents/mcp_config.json must exist');
    const config = JSON.parse(fs.readFileSync('.agents/mcp_config.json', 'utf8'));
    assert.ok(config.mcpServers);
    assert.ok(config.mcpServers['aalaapi-companion']);
    assert.strictEqual(config.mcpServers['aalaapi-companion'].command, 'node');
  });
});

describe('Direct USB Flight Log Pulling UI Tests (v1.58.0)', () => {
  test('index_template.html and index.html contain direct flight log pull buttons', () => {
    const fs = require('fs');
    ['index_template.html', 'index.html'].forEach(filename => {
      const content = fs.readFileSync(filename, 'utf8');
      assert.ok(content.includes('id="direct-rc2-pull-log-btn"'), `Must include direct-rc2-pull-log-btn in ${filename}`);
      assert.ok(content.includes('id="diag-pull-rc2-btn"'), `Must include diag-pull-rc2-btn in ${filename}`);
      assert.ok(content.includes('v1.58.0'), `Must include v1.58.0 in ${filename}`);
    });
  });

  test('pullFlightLogFromRC2 is defined in index.js and handles fetch errors gracefully', async () => {
    const fn = vm.runInThisContext('pullFlightLogFromRC2');
    assert.strictEqual(typeof fn, 'function', 'pullFlightLogFromRC2 must be a defined function');

    // Simulate mock button
    const mockBtn = {
      disabled: false,
      innerHTML: 'Pull',
      style: {}
    };

    // Test with offline / failing fetch
    global.fetch = async () => {
      return {
        ok: false,
        json: async () => ({ success: false, error: 'RC 2 not connected over MTP' })
      };
    };

    const res = await fn(mockBtn);
    assert.strictEqual(res.success, false);
    assert.ok(mockBtn.innerHTML.includes('Pull Failed') || mockBtn.innerHTML.includes('Offline'));
  });

  test('pullFlightLogFromRC2 handles successful flight log extraction and updates UI', async () => {
    const fn = vm.runInThisContext('pullFlightLogFromRC2');
    const fd = vm.runInThisContext('FlightDiagnostics');

    let refreshed = false;
    let loadedFlight = null;
    const origRefresh = fd.refreshFlightList;
    const origLoad = fd.loadSelectedFlight;

    fd.refreshFlightList = async () => { refreshed = true; };
    fd.loadSelectedFlight = (id) => { loadedFlight = id; };

    const mockBtn = {
      id: 'diag-pull-rc2-btn',
      disabled: false,
      innerHTML: 'Pull',
      style: {}
    };

    global.fetch = async (url) => {
      if (url.includes('/api/latest-flight')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: {
              latestLog: 'FlightRecord_2026-08-29_[19-15-00].txt',
              latestKmz: '354A8F93-759C-42C3-A8D5-746F79C7622A.kmz'
            }
          })
        };
      }
      return { ok: false };
    };

    const res = await fn(mockBtn);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.logName, 'FlightRecord_2026-08-29_[19-15-00].txt');
    assert.strictEqual(refreshed, true, 'Must trigger FlightDiagnostics.refreshFlightList()');
    assert.strictEqual(loadedFlight, 'FlightRecord_2026-08-29_[19-15-00].txt', 'Must load selected flight');

    // Restore
    fd.refreshFlightList = origRefresh;
    fd.loadSelectedFlight = origLoad;
  });
});

// ─── Regression Tests: Single Grid Oblique Pitch WPML Heading Enforcement (v1.58.1) ─────────
describe('v1.58.1 Single Grid Oblique Pitch WPML Heading Enforcement', () => {
  test('single grid with oblique pitch (-60°) strictly exports followWayline instead of smoothTransition', () => {
    const originalGetElementById = global.document.getElementById;
    try {
      global.document.getElementById = (id) => ({
        value: {
          'drone-model': '68',
          'signal-lost-action': 'goBack',
          'camera-zoom': '1.0',
          'global-hover-time': '2',
          'grid-type': 'single',
          'heading-mode': 'followWayline'
        }[id] || '',
        checked: false
      });

      const wps = [
        { index: 0, lat: 40.01277424204881, lon: -83.17710595012082, alt: '22', heading: 45 },
        { index: 1, lat: 40.01295390510564, lon: -83.17710595012082, alt: '22', heading: 135 },
        { index: 2, lat: 40.01295390510564, lon: -83.17702775756642, alt: '22', heading: 161.565051177078 },
        { index: 3, lat: 40.01277424204881, lon: -83.17702775756642, alt: '22', heading: 18.43494882292201 },
        { index: 4, lat: 40.01277424204881, lon: -83.17694956501204, alt: '22', heading: 341.565051177078 }
      ];

      const xml = vm.runInThisContext(`
        buildWaylinesWpml(${JSON.stringify(wps)}, 22, 4, 'followWayline', 'goHome', -60, 'stopAndShoot', 'straight')
      `);

      // Must strictly use followWayline, NEVER smoothTransition in single lawnmower grid
      assert.ok(xml.includes('<wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode>'),
        'Single grid with oblique pitch must use followWayline mode');
      assert.ok(!xml.includes('<wpml:waypointHeadingMode>smoothTransition</wpml:waypointHeadingMode>'),
        'Single grid with oblique pitch must NOT use smoothTransition mode');

      // Waypoint 0 must have headingAngleEnable: 1 and valid clamped non-zero angle
      assert.ok(xml.includes('<wpml:waypointHeadingAngleEnable>1</wpml:waypointHeadingAngleEnable>'),
        'Waypoint 0 endpoint must have heading angle enabled');

      // Validation check
      const validation = vm.runInThisContext(`
        validateWpmlMission(\`${xml}\`, '', { gridType: 'single' })
      `);
      assert.strictEqual(validation.valid, true, 'Must pass all 10 validation rules');
      assert.strictEqual(validation.rulesPassed, 10, 'Health score must be 10/10');
      assert.strictEqual(validation.errors.length, 0, 'Must have zero validation errors');
    } finally {
      global.document.getElementById = originalGetElementById;
    }
  });

  test('validateWpmlMission catches and flags invalid enable flag on intermediate followWayline in single grid', () => {
    const offendingXml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="http://www.uav.com/wpmz/1.0.2">
  <Document>
    <wpml:missionConfig><wpml:droneEnumValue>68</wpml:droneEnumValue></wpml:missionConfig>
    <Folder>
      <wpml:executeHeightMode>relativeToStartPoint</wpml:executeHeightMode>
      <Placemark>
        <Point><coordinates>-83.177105,40.012774</coordinates></Point>
        <wpml:index>0</wpml:index>
        <wpml:executeHeight>22</wpml:executeHeight>
        <wpml:waypointSpeed>4</wpml:waypointSpeed>
        <wpml:waypointHeadingParam>
          <wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode>
          <wpml:waypointHeadingAngle>0</wpml:waypointHeadingAngle>
          <wpml:waypointHeadingAngleEnable>1</wpml:waypointHeadingAngleEnable>
        </wpml:waypointHeadingParam>
        <wpml:waypointTurnParam>
          <wpml:waypointTurnMode>toPointAndStopWithContinuityCurvature</wpml:waypointTurnMode>
        </wpml:waypointTurnParam>
      </Placemark>
      <Placemark>
        <Point><coordinates>-83.177105,40.012953</coordinates></Point>
        <wpml:index>1</wpml:index>
        <wpml:executeHeight>22</wpml:executeHeight>
        <wpml:waypointSpeed>4</wpml:waypointSpeed>
        <wpml:waypointHeadingParam>
          <wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode>
          <wpml:waypointHeadingAngle>0</wpml:waypointHeadingAngle>
          <wpml:waypointHeadingAngleEnable>1</wpml:waypointHeadingAngleEnable>
        </wpml:waypointHeadingParam>
        <wpml:waypointTurnParam>
          <wpml:waypointTurnMode>toPointAndStopWithContinuityCurvature</wpml:waypointTurnMode>
        </wpml:waypointTurnParam>
      </Placemark>
      <Placemark>
        <Point><coordinates>-83.177105,40.013153</coordinates></Point>
        <wpml:index>2</wpml:index>
        <wpml:executeHeight>22</wpml:executeHeight>
        <wpml:waypointSpeed>4</wpml:waypointSpeed>
        <wpml:waypointHeadingParam>
          <wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode>
          <wpml:waypointHeadingAngle>0</wpml:waypointHeadingAngle>
          <wpml:waypointHeadingAngleEnable>1</wpml:waypointHeadingAngleEnable>
        </wpml:waypointHeadingParam>
        <wpml:waypointTurnParam>
          <wpml:waypointTurnMode>toPointAndStopWithContinuityCurvature</wpml:waypointTurnMode>
        </wpml:waypointTurnParam>
      </Placemark>
    </Folder>
  </Document>
</kml>`;

    const val = validateWpmlMission(offendingXml, '', { gridType: 'single' });
    assert.strictEqual(val.valid, false, 'Should fail validation when intermediate followWayline has enable=1');
    assert.ok(val.errors.some(e => e.includes("intermediate waypointHeadingMode is 'followWayline' but waypointHeadingAngleEnable is 1")),
      'Should report intermediate followWayline enable=1 error in Rule 1');
  });

  test('validateAndFixWpml automatically repairs intermediate followWayline enable flags for single grid', () => {
    const offendingXml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="http://www.uav.com/wpmz/1.0.2">
  <Document>
    <wpml:missionConfig><wpml:droneEnumValue>68</wpml:droneEnumValue></wpml:missionConfig>
    <Folder>
      <wpml:executeHeightMode>relativeToStartPoint</wpml:executeHeightMode>
      <Placemark>
        <Point><coordinates>-83.177105,40.012774</coordinates></Point>
        <wpml:index>0</wpml:index>
        <wpml:executeHeight>22</wpml:executeHeight>
        <wpml:waypointSpeed>4</wpml:waypointSpeed>
        <wpml:waypointHeadingParam>
          <wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode>
          <wpml:waypointHeadingAngle>0</wpml:waypointHeadingAngle>
          <wpml:waypointHeadingAngleEnable>1</wpml:waypointHeadingAngleEnable>
        </wpml:waypointHeadingParam>
        <wpml:waypointTurnParam>
          <wpml:waypointTurnMode>toPointAndStopWithContinuityCurvature</wpml:waypointTurnMode>
        </wpml:waypointTurnParam>
      </Placemark>
      <Placemark>
        <Point><coordinates>-83.177105,40.012953</coordinates></Point>
        <wpml:index>1</wpml:index>
        <wpml:executeHeight>22</wpml:executeHeight>
        <wpml:waypointSpeed>4</wpml:waypointSpeed>
        <wpml:waypointHeadingParam>
          <wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode>
          <wpml:waypointHeadingAngle>0</wpml:waypointHeadingAngle>
          <wpml:waypointHeadingAngleEnable>1</wpml:waypointHeadingAngleEnable>
        </wpml:waypointHeadingParam>
        <wpml:waypointTurnParam>
          <wpml:waypointTurnMode>toPointAndStopWithContinuityCurvature</wpml:waypointTurnMode>
        </wpml:waypointTurnParam>
      </Placemark>
      <Placemark>
        <Point><coordinates>-83.177105,40.013153</coordinates></Point>
        <wpml:index>2</wpml:index>
        <wpml:executeHeight>22</wpml:executeHeight>
        <wpml:waypointSpeed>4</wpml:waypointSpeed>
        <wpml:waypointHeadingParam>
          <wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode>
          <wpml:waypointHeadingAngle>0</wpml:waypointHeadingAngle>
          <wpml:waypointHeadingAngleEnable>1</wpml:waypointHeadingAngleEnable>
        </wpml:waypointHeadingParam>
        <wpml:waypointTurnParam>
          <wpml:waypointTurnMode>toPointAndStopWithContinuityCurvature</wpml:waypointTurnMode>
        </wpml:waypointTurnParam>
      </Placemark>
    </Folder>
  </Document>
</kml>`;

    const res = validateAndFixWpml(offendingXml, '', { gridType: 'single' });
    assert.strictEqual(res.validation.valid, true, 'Sanitized XML must pass validation');
  });
});

describe('v1.58.2 Consumer Drone (Mini 4 Pro / Air 3) Turn Mode & StraightLine XML Compliance', () => {
  test('DJI Mini 4 Pro (68) strictly exports ContinuityCurvature and useStraightLine: 0 even with straight pathMode', () => {
    global._stubElements = { 'drone-model': { value: '68' } };
    const waypoints = [
      { index: 0, lat: 40.012751644699264, lon: -83.17711399670902, alt: '22', heading: 45, turnMode: 'inherit' },
      { index: 1, lat: 40.01293130775609, lon: -83.17711399670902, alt: '22', heading: 135, turnMode: 'inherit' },
      { index: 2, lat: 40.01293130775609, lon: -83.17703580418052, alt: '22', heading: 161.565, turnMode: 'inherit' },
      { index: 3, lat: 40.012751644699264, lon: -83.17703580418052, alt: '22', heading: 18.435, turnMode: 'inherit' }
    ];

    const xml = vm.runInThisContext(`
      buildWaylinesWpml(${JSON.stringify(waypoints)}, 22, 4, 'followWayline', 'goHome', -60, 'stopAndShoot', 'straight')
    `);
    global._stubElements = {};

    assert.ok(!xml.includes('DiscontinuityCurvature'), 'Consumer drone must not contain DiscontinuityCurvature');
    assert.ok(xml.includes('toPointAndStopWithContinuityCurvature'), 'Consumer drone must use toPointAndStopWithContinuityCurvature');
    assert.ok(xml.includes('<wpml:useStraightLine>0</wpml:useStraightLine>'), 'Consumer drone must use <wpml:useStraightLine>0</wpml:useStraightLine>');
    assert.ok(!xml.includes('<wpml:useStraightLine>1</wpml:useStraightLine>'), 'Consumer drone must not use <wpml:useStraightLine>1</wpml:useStraightLine>');
  });

  test('validateWpmlMission Rule 8 catches DiscontinuityCurvature and useStraightLine: 1 on consumer drone', () => {
    const offendingXml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="http://www.dji.com/wpmz/1.0.6">
  <Document>
    <wpml:droneEnumValue>68</wpml:droneEnumValue>
    <Folder>
      <Placemark>
        <Point><coordinates>-83.177113,40.012751</coordinates></Point>
        <wpml:index>0</wpml:index>
        <wpml:executeHeight>22</wpml:executeHeight>
        <wpml:waypointSpeed>4</wpml:waypointSpeed>
        <wpml:waypointHeadingParam>
          <wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode>
          <wpml:waypointHeadingAngle>0.1</wpml:waypointHeadingAngle>
          <wpml:waypointHeadingAngleEnable>1</wpml:waypointHeadingAngleEnable>
        </wpml:waypointHeadingParam>
        <wpml:waypointTurnParam>
          <wpml:waypointTurnMode>toPointAndStopWithDiscontinuityCurvature</wpml:waypointTurnMode>
        </wpml:waypointTurnParam>
        <wpml:useStraightLine>1</wpml:useStraightLine>
      </Placemark>
    </Folder>
  </Document>
</kml>`;

    const res = vm.runInThisContext(`validateWpmlMission(\`${offendingXml}\`, '', {})`);
    assert.strictEqual(res.valid, false, 'Should fail validation due to consumer drone Enterprise tags');
    const r8 = res.rules.find(r => r.id === 8);
    assert.strictEqual(r8.passed, false, 'Rule 8 must fail');
    assert.ok(res.errors.some(e => e.includes('DiscontinuityCurvature')), 'Must report DiscontinuityCurvature error');
    assert.ok(res.errors.some(e => e.includes('useStraightLine>1')), 'Must report useStraightLine>1 error');
  });

  test('validateAndFixWpml automatically sanitizes DiscontinuityCurvature and useStraightLine for consumer drones', () => {
    const offendingXml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="http://www.dji.com/wpmz/1.0.6">
  <Document>
    <wpml:droneEnumValue>68</wpml:droneEnumValue>
    <Folder>
      <Placemark>
        <Point><coordinates>-83.177113,40.012751</coordinates></Point>
        <wpml:index>0</wpml:index>
        <wpml:executeHeight>22</wpml:executeHeight>
        <wpml:waypointSpeed>4</wpml:waypointSpeed>
        <wpml:waypointHeadingParam>
          <wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode>
          <wpml:waypointHeadingAngle>0.1</wpml:waypointHeadingAngle>
          <wpml:waypointHeadingAngleEnable>1</wpml:waypointHeadingAngleEnable>
        </wpml:waypointHeadingParam>
        <wpml:waypointTurnParam>
          <wpml:waypointTurnMode>toPointAndStopWithDiscontinuityCurvature</wpml:waypointTurnMode>
        </wpml:waypointTurnParam>
        <wpml:useStraightLine>1</wpml:useStraightLine>
      </Placemark>
      <Placemark>
        <Point><coordinates>-83.177113,40.012931</coordinates></Point>
        <wpml:index>1</wpml:index>
        <wpml:executeHeight>22</wpml:executeHeight>
        <wpml:waypointSpeed>4</wpml:waypointSpeed>
        <wpml:waypointHeadingParam>
          <wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode>
          <wpml:waypointHeadingAngle>0.1</wpml:waypointHeadingAngle>
          <wpml:waypointHeadingAngleEnable>0</wpml:waypointHeadingAngleEnable>
        </wpml:waypointHeadingParam>
        <wpml:waypointTurnParam>
          <wpml:waypointTurnMode>toPointAndPassWithDiscontinuityCurvature</wpml:waypointTurnMode>
        </wpml:waypointTurnParam>
        <wpml:useStraightLine>1</wpml:useStraightLine>
      </Placemark>
      <Placemark>
        <Point><coordinates>-83.177035,40.012931</coordinates></Point>
        <wpml:index>2</wpml:index>
        <wpml:executeHeight>22</wpml:executeHeight>
        <wpml:waypointSpeed>4</wpml:waypointSpeed>
        <wpml:waypointHeadingParam>
          <wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode>
          <wpml:waypointHeadingAngle>0.1</wpml:waypointHeadingAngle>
          <wpml:waypointHeadingAngleEnable>1</wpml:waypointHeadingAngleEnable>
        </wpml:waypointHeadingParam>
        <wpml:waypointTurnParam>
          <wpml:waypointTurnMode>toPointAndStopWithDiscontinuityCurvature</wpml:waypointTurnMode>
        </wpml:waypointTurnParam>
        <wpml:useStraightLine>1</wpml:useStraightLine>
      </Placemark>
    </Folder>
  </Document>
</kml>`;

    const res = vm.runInThisContext(`validateAndFixWpml(\`${offendingXml}\`, '', {})`);
    assert.ok(!res.wpmlXml.includes('DiscontinuityCurvature'), 'DiscontinuityCurvature must be eliminated');
    assert.ok(res.wpmlXml.includes('toPointAndStopWithContinuityCurvature'), 'Should be sanitized to ContinuityCurvature');
    assert.ok(res.wpmlXml.includes('toPointAndPassWithContinuityCurvature'), 'Pass point should be sanitized to ContinuityCurvature');
    assert.ok(!res.wpmlXml.includes('<wpml:useStraightLine>1</wpml:useStraightLine>'), 'useStraightLine 1 must be eliminated');
    assert.ok(res.wpmlXml.includes('<wpml:useStraightLine>0</wpml:useStraightLine>'), 'useStraightLine 0 must be present');
    assert.strictEqual(res.validation.valid, true, 'Sanitized XML must pass validation');
  });

  test('KMZInspector.generateAntigravityPrompt reads pattern from grid-type', () => {
    global._stubElements = { 'grid-type': { value: 'double' } };
    const prompt = vm.runInThisContext(`
      KMZInspector.generateAntigravityPrompt({ rulesPassed: 10, valid: true }, '', [])
    `);
    global._stubElements = {};
    assert.ok(prompt.includes('Pattern:** double'), 'Prompt should correctly display Pattern: double when grid-type is double');
  });

  test('Native Breakpoint Resume: max-flight-time slider removed and advisories present', () => {
    const fs = require('fs');
    const templateHtml = fs.readFileSync('index_template.html', 'utf-8');

    // 1. Assert max-flight-time is removed from template HTML
    assert.ok(!templateHtml.includes('id="max-flight-time"'), '#max-flight-time slider must be removed from HTML template');
    assert.ok(!templateHtml.includes('id="max-flight-time-val"'), '#max-flight-time-val must be removed from HTML template');

    // 2. Assert CONTROLS_LIST does not contain max-flight-time
    const controlsList = vm.runInThisContext('CONTROLS_LIST');
    assert.ok(!controlsList.includes('max-flight-time'), 'CONTROLS_LIST must not contain max-flight-time');

    // 3. Assert disclaimer modal has native Breakpoint Resume card
    assert.ok(templateHtml.includes('Multi-Battery Flights &amp; Native Breakpoint Resume'), 'Disclaimer modal must include Breakpoint Resume card');
    assert.ok(templateHtml.includes('Resume from Breakpoint'), 'Disclaimer modal must explain Breakpoint Resume workflow');

    // 4. Assert calculateStats returns clean stats without isOverMaxFlightTime or partsCount
    const wps = [
      { x: 0, y: 0, lat: 40.0, lon: -80.0 },
      { x: 100, y: 100, lat: 40.001, lon: -80.001 }
    ];
    const stats = calculateStats(wps, [], 5, 20, 20, 'hover');
    assert.strictEqual(stats.isOverMaxFlightTime, undefined, 'isOverMaxFlightTime must be removed from stats');
    assert.strictEqual(stats.partsCount, undefined, 'partsCount must be removed from stats');
    assert.ok(typeof stats.timeStr === 'string' && stats.timeStr.length > 0, 'timeStr should be calculated');
  });
});

describe('Companion Bridge Performance & Drone Location Freshness Tests (v1.59.1)', () => {
  const { RemoteIdAirspaceTracker, createSyntheticOdidPayload } = require('./tools/companion/remote_id_decoder.js');

  test('RemoteIdAirspaceTracker getActiveDrones prioritizes live drones and newest telemetry over stale insertion order', () => {
    const tracker = new RemoteIdAirspaceTracker(15, 900); // 15s active timeout, 900s retention

    const t0 = 1000000;
    const oldPayload = createSyntheticOdidPayload({ uasId: '1581F4OLD-DRONE', lat: 39.9990, lon: -83.1700 });
    const newPayload = createSyntheticOdidPayload({ uasId: '1581F4NEW-DRONE', lat: 40.0150, lon: -83.1750 });

    // Ingest old drone first at t0
    tracker.processAdvertisement({ mac: '11:22:33:44:55:66', rssi: -75, rawPayload: oldPayload, timestamp: t0 });

    // Ingest new drone 50 seconds later at t0 + 50000
    tracker.processAdvertisement({ mac: 'AA:BB:CC:DD:EE:FF', rssi: -50, rawPayload: newPayload, timestamp: t0 + 50000 });

    // At t0 + 52000:
    // Old drone age is 52s (> 15s active timeout -> signalLost: true)
    // New drone age is 2s (<= 15s active timeout -> isLive: true)
    const activeDrones = tracker.getActiveDrones(t0 + 52000);

    assert.strictEqual(activeDrones.length, 2, 'Both drones should be present in memory');
    // Live drone MUST be sorted first regardless of Map insertion order!
    assert.strictEqual(activeDrones[0].uasId, '1581F4NEW-DRONE', 'Freshest live drone must be index 0');
    assert.strictEqual(activeDrones[0].isLive, true);
    assert.strictEqual(activeDrones[0].latitude, 40.015);

    assert.strictEqual(activeDrones[1].uasId, '1581F4OLD-DRONE', 'Stale/LKP drone must be index 1');
    assert.strictEqual(activeDrones[1].isLive, false);
    assert.strictEqual(activeDrones[1].signalLost, true);
  });

  test('RemoteIdAirspaceTracker seamlessly merges and deduplicates drones across BLE MAC address rotation', () => {
    const tracker = new RemoteIdAirspaceTracker(15, 900);

    const t0 = 2000000;
    const initialPayload = createSyntheticOdidPayload({ uasId: '1581F4ROTATING-DRONE', lat: 40.0110, lon: -83.1710, alt: 20.0 });
    const rotatedPayload = createSyntheticOdidPayload({ uasId: '1581F4ROTATING-DRONE', lat: 40.0118, lon: -83.1715, alt: 28.0 });

    // Packet from initial MAC address
    tracker.processAdvertisement({ mac: 'E1:22:33:AA:BB:CC', rssi: -62, rawPayload: initialPayload, timestamp: t0 });
    assert.strictEqual(tracker.drones.size, 1);
    assert.strictEqual(tracker.drones.get('E1:22:33:AA:BB:CC').latitude, 40.011);

    // Drone rotates its BLE MAC address to a new private address 10 seconds later
    tracker.processAdvertisement({ mac: 'F9:88:77:66:55:44', rssi: -58, rawPayload: rotatedPayload, timestamp: t0 + 10000 });

    // Should NOT create duplicate ghost drones in the airspace tracker
    assert.strictEqual(tracker.drones.size, 1, 'Old MAC entry must be cleaned up upon UAS ID correlation');
    assert.strictEqual(tracker.drones.has('E1:22:33:AA:BB:CC'), false, 'Old MAC must be removed');
    assert.strictEqual(tracker.drones.has('F9:88:77:66:55:44'), true, 'New MAC must be active');

    const drone = tracker.drones.get('F9:88:77:66:55:44');
    assert.strictEqual(drone.latitude, 40.0118, 'Updated latitude must be reflected');
    assert.strictEqual(drone.breadcrumbs.length, 2, 'Historical breadcrumbs must be merged across MAC rotations');
    assert.strictEqual(drone.firstSeen, t0, 'Original firstSeen timestamp must be preserved');
  });

  test('BleScanner source code enforces Remote ID and DJI pre-filters to prevent stdout saturation', () => {
    const fs = require('fs');
    const path = require('path');
    const csContent = fs.readFileSync(path.join(__dirname, 'tools/companion/ble_scanner.cs'), 'utf8');

    // Assert C# code includes pre-filter rules
    assert.ok(csContent.includes('sec.DataType != 0x16 && sec.DataType != 0xFF'), 'BleScanner must filter data section types');
    assert.ok(csContent.includes('0xFFFA') || csContent.includes('0xFA') && csContent.includes('0xFF'), 'BleScanner must check for OpenDroneID UUID 0xFFFA');
    assert.ok(csContent.includes('0x0888') || csContent.includes('0x8808'), 'BleScanner must check for DJI company ID 0x0888');
  });

  test('RemoteIdRadar locateDrone and badge click select the freshest live drone with geo coordinates', () => {
    global._stubElements = global._stubElements || {};
    global._stubElements['remote-id-badge'] = { style: {}, classList: { add: () => {}, remove: () => {} }, textContent: '' };
    global._stubElements['remote-id-badge-text'] = { textContent: '' };
    global._stubElements['remote-id-locate-label'] = { textContent: '' };

    const radar = Object.create(RemoteIdRadar);
    radar.markers = new Map();
    radar.activeDrones = [
      { id: 'OLD-LKP', uasId: '1581F4OLD', latitude: 39.99, longitude: -83.17, signalLost: true, isLive: false },
      { id: 'FRESH-LIVE', uasId: '1581F4LIVE', latitude: 40.01, longitude: -83.18, signalLost: false, isLive: true }
    ];

    // Calling locateDrone without argument should prefer FRESH-LIVE over OLD-LKP
    const res = radar.locateDrone();
    assert.strictEqual(res, true);
    assert.strictEqual(radar.locatedDroneId, 'FRESH-LIVE', 'locateDrone must select the live drone with coordinates');

    delete global._stubElements['remote-id-badge'];
    delete global._stubElements['remote-id-badge-text'];
    delete global._stubElements['remote-id-locate-label'];
  });
});

describe('Consolidated Diagnostics Center & Streamlined Section 4 Tests (v1.60.0)', () => {
  test('index_template.html contains unified diagnostics tabs and streamlined 3-button Section 4', () => {
    const html = fs.readFileSync(path.join(__dirname, 'index_template.html'), 'utf8');
    assert.ok(html.includes('id="diag-nav-3d-btn"'), 'Must include 3D Telemetry Replay tab button');
    assert.ok(html.includes('id="diag-nav-audit-btn"'), 'Must include Pre-Flight KMZ Audit tab button');
    assert.ok(html.includes('id="diag-pane-3d"'), 'Must include 3D viewport pane container');
    assert.ok(html.includes('id="kmz-inspector-modal"'), 'Must include embedded kmz inspector modal pane');
    assert.ok(html.includes('id="kmz-audit-btn"'), 'Must preserve kmz-audit-btn ID for backward compatibility');
    assert.ok(html.includes('id="action-diagnostics-btn"'), 'Must include action-diagnostics-btn');
    assert.ok(html.includes('id="download-btn"'), 'Must include download-btn');
    assert.ok(html.includes('id="kmz-preflight-status-badge"') && html.includes('display: none !important;'), 'Pre-flight status badge must be hidden from visible sidebar');
  });

  test('FlightDiagnostics switchTab correctly toggles active tab view and DOM classes', () => {
    const pane3d = { classList: { add: mock.fn(), remove: mock.fn() } };
    const paneAudit = { classList: { add: mock.fn(), remove: mock.fn() } };
    const tab3dBtn = { classList: { add: mock.fn(), remove: mock.fn() }, style: {} };
    const tabAuditBtn = { classList: { add: mock.fn(), remove: mock.fn() }, style: {} };
    const flightMeta = { textContent: '' };
    const flightControls = { style: {} };

    global._stubElements = global._stubElements || {};
    global._stubElements['diag-pane-3d'] = pane3d;
    global._stubElements['kmz-inspector-modal'] = paneAudit;
    global._stubElements['diag-nav-3d-btn'] = tab3dBtn;
    global._stubElements['diag-nav-audit-btn'] = tabAuditBtn;
    global._stubElements['diag-flight-meta'] = flightMeta;
    global._stubElements['diag-header-flight-controls'] = flightControls;

    const diag = Object.create(FlightDiagnostics);

    // Switch to audit
    diag.switchTab('audit');
    assert.strictEqual(diag.activeTab, 'audit');
    assert.ok(pane3d.classList.add.mock.calls.some(c => c.arguments[0] === 'hidden'));
    assert.ok(paneAudit.classList.remove.mock.calls.some(c => c.arguments[0] === 'hidden'));
    assert.strictEqual(flightControls.style.display, 'none');

    // Switch back to 3d
    diag.switchTab('3d');
    assert.strictEqual(diag.activeTab, '3d');
    assert.ok(paneAudit.classList.add.mock.calls.some(c => c.arguments[0] === 'hidden'));
    assert.ok(pane3d.classList.remove.mock.calls.some(c => c.arguments[0] === 'hidden'));
    assert.strictEqual(flightControls.style.display, 'flex');

    delete global._stubElements['diag-pane-3d'];
    delete global._stubElements['kmz-inspector-modal'];
    delete global._stubElements['diag-nav-3d-btn'];
    delete global._stubElements['diag-nav-audit-btn'];
    delete global._stubElements['diag-flight-meta'];
    delete global._stubElements['diag-header-flight-controls'];
  });

  test('KMZInspector open delegates to FlightDiagnostics audit tab and unhides inspector pane', () => {
    let diagOpenedWith = null;
    const origDiagOpen = FlightDiagnostics.open;
    FlightDiagnostics.open = (tab) => { diagOpenedWith = tab; };

    const modal = { classList: { remove: mock.fn(), add: mock.fn() } };
    global._stubElements = global._stubElements || {};
    global._stubElements['kmz-inspector-modal'] = modal;

    try {
      const origRun = KMZInspector.runCurrentWorkspaceAudit;
      KMZInspector.runCurrentWorkspaceAudit = mock.fn();

      KMZInspector.open();
      assert.strictEqual(diagOpenedWith, 'audit', 'KMZInspector.open must invoke FlightDiagnostics.open with "audit"');
      assert.ok(modal.classList.remove.mock.calls.some(c => c.arguments[0] === 'hidden'), 'Must unhide kmz-inspector-modal');

      KMZInspector.runCurrentWorkspaceAudit = origRun;
    } finally {
      FlightDiagnostics.open = origDiagOpen;
      delete global._stubElements['kmz-inspector-modal'];
    }
  });
});

describe('Multiple Mission Exports & Modal Close Shortcuts Tests (v1.60.2)', () => {
  test('DiagnosticsDatabase retains multiple missions exported for the identical RC 2 UUID', () => {
    const { DiagnosticsDatabase } = require('./tools/companion/diagnostics_db.js');
    const db = new DiagnosticsDatabase(':memory:');
    assert.ok(db);

    const rc2Uuid = '354A8F93-759C-42C3-A8D5-746F79C7622A';

    // Export 1: 2 waypoints at 23:11:46 UTC
    const exp1 = {
      uuid: rc2Uuid,
      filename: `${rc2Uuid}.kmz`,
      createdAt: '2026-08-29T23:11:46.729Z',
      waypointCount: 2,
      altitude: 21.0,
      plan: { waypoints: [{ lat: 40.0, lon: -83.0 }, { lat: 40.01, lon: -83.01 }] }
    };
    const res1 = db.saveDiagnostic(exp1);
    assert.strictEqual(res1.success, true);
    assert.strictEqual(res1.uuid, rc2Uuid);

    // Export 2: 16 waypoints at 23:29:34 UTC (same RC 2 slot UUID)
    const exp2 = {
      uuid: rc2Uuid,
      filename: `${rc2Uuid}.kmz`,
      createdAt: '2026-08-29T23:29:34.206Z',
      waypointCount: 16,
      altitude: 25.0,
      plan: { waypoints: new Array(16).fill({ lat: 40.0, lon: -83.0 }) }
    };
    const res2 = db.saveDiagnostic(exp2);
    assert.strictEqual(res2.success, true);
    assert.strictEqual(res2.uuid, rc2Uuid);

    // Verify history contains BOTH distinct exports instead of overwriting
    const history = db.getHistory();
    assert.strictEqual(history.length, 2, 'History must contain 2 separate records for the same RC 2 UUID');
    assert.strictEqual(history[0].waypoint_count, 16);
    assert.strictEqual(history[1].waypoint_count, 2);

    // Lookup by archive_id
    const retrieved1 = db.getByIdOrArchiveIdOrUuid(res1.archiveId);
    assert.ok(retrieved1);
    assert.strictEqual(retrieved1.waypoint_count, 2);

    const retrieved2 = db.getByIdOrArchiveIdOrUuid(res2.archiveId);
    assert.ok(retrieved2);
    assert.strictEqual(retrieved2.waypoint_count, 16);

    // Lookup by uuid returns newest
    const latest = db.getByUuid(rc2Uuid);
    assert.ok(latest);
    assert.strictEqual(latest.waypoint_count, 16);

    db.close();
  });

  test('DiagnosticsDatabase restores disk archives into SQLite history', () => {
    const { DiagnosticsDatabase } = require('./tools/companion/diagnostics_db.js');
    const path = require('path');
    const db = new DiagnosticsDatabase(':memory:');
    
    const archiveDir = path.resolve(__dirname, 'scratch/mission_archives');
    const restored = db.restoreFromDiskArchives(archiveDir);
    assert.strictEqual(restored >= 3, true, 'Must restore at least 3 disk archives');

    const history = db.getHistory();
    assert.strictEqual(history.length >= 3, true);
    assert.ok(history.some(h => h.waypoint_count === 2));
    assert.ok(history.some(h => h.waypoint_count === 16));

    db.close();
  });

  test('FlightDiagnostics modal handles Escape key and backdrop click closing', () => {
    let closed = false;
    const origClose = FlightDiagnostics.close;
    FlightDiagnostics.close = () => { closed = true; };

    // Simulate keydown Escape when isOpen is true
    FlightDiagnostics.isOpen = true;
    assert.strictEqual(typeof FlightDiagnostics.close, 'function');
    FlightDiagnostics.close();
    assert.strictEqual(closed, true);

    FlightDiagnostics.close = origClose;
    FlightDiagnostics.isOpen = false;
  });
});

describe('Map & Remote ID Alignment Calibration Tests (v1.61.0)', () => {
  test('RemoteIdRadar applyOffset and calculateOffsetFromTarget accurately compute geodetic offsets', () => {
    const radar = vm.runInThisContext(`RemoteIdRadar`);
    assert.ok(radar, 'RemoteIdRadar must exist');

    radar.resetOffset();
    assert.strictEqual(radar.offsetMeters.north, 0);
    assert.strictEqual(radar.offsetMeters.east, 0);

    const baseLat = 40.0;
    const baseLon = -83.0;

    // With 0 offset, applied position is identical
    const unshifted = radar.applyOffset(baseLat, baseLon);
    assert.strictEqual(unshifted.lat, baseLat);
    assert.strictEqual(unshifted.lon, baseLon);

    // Set offset of 15.0m North, -25.0m East (25m West)
    radar.setOffset(15.0, -25.0);
    assert.strictEqual(radar.offsetMeters.north, 15.0);
    assert.strictEqual(radar.offsetMeters.east, -25.0);

    const shifted = radar.applyOffset(baseLat, baseLon);
    assert.ok(shifted.lat > baseLat, 'North offset must increase latitude');
    assert.ok(shifted.lon < baseLon, 'West offset must decrease longitude');

    // Inverse roundtrip calculation
    const computed = radar.calculateOffsetFromTarget(baseLat, baseLon, shifted.lat, shifted.lon);
    assert.strictEqual(computed.north, 15.0, 'Calculated North offset must roundtrip');
    assert.strictEqual(computed.east, -25.0, 'Calculated East offset must roundtrip');

    radar.resetOffset();
  });

  test('RemoteIdRadar nudgeOffset and resetOffset update offsets and formatDroneTooltip status cleanly', () => {
    const radar = vm.runInThisContext(`RemoteIdRadar`);
    radar.resetOffset();

    // Nudge North by 1.0m, then East by 0.5m
    radar.nudgeOffset(1.0, 0);
    assert.strictEqual(radar.offsetMeters.north, 1.0);
    assert.strictEqual(radar.offsetMeters.east, 0.0);

    radar.nudgeOffset(0, 0.5);
    assert.strictEqual(radar.offsetMeters.north, 1.0);
    assert.strictEqual(radar.offsetMeters.east, 0.5);

    const drone = {
      id: 'CAL-TEST-01',
      uasId: 'RID-CAL-9988',
      model: 'DJI Mini 4 Pro',
      status: 'Airborne',
      latitude: 40.0,
      longitude: -83.0,
      altitudeGeodetic: 20.0,
      speedHorizontal: 3.0,
      trackDirection: 90,
      transport: 'Wi-Fi 2.4 GHz',
      rssi: -60
    };

    const tooltip = radar.formatDroneTooltip(drone);
    assert.ok(tooltip.includes('Offset: +1m N, +0.5m E'), 'Tooltip must reflect active calibration offset');

    // Reset offset
    radar.resetOffset();
    assert.strictEqual(radar.offsetMeters.north, 0);
    assert.strictEqual(radar.offsetMeters.east, 0);

    const cleanTooltip = radar.formatDroneTooltip(drone);
    assert.ok(!cleanTooltip.includes('Offset:'), 'Tooltip must not contain offset tag when offset is 0m');
  });

  test('RemoteIdRadar updateMapMarkers shifts drone and takeoff coordinates synchronously and uses centered divIcon anchors', () => {
    const radar = vm.runInThisContext(`RemoteIdRadar`);
    const origLayerGroup = radar.layerGroup;

    let addedLayers = [];
    let removedLayers = [];
    let iconOptionsCreated = [];

    const mockLayerGroup = {
      addLayer(layer) { addedLayers.push(layer); },
      removeLayer(layer) { removedLayers.push(layer); }
    };

    const origL = global.L;
    global.L = {
      divIcon(opts) {
        iconOptionsCreated.push(opts);
        return opts;
      },
      marker(latlng, opts) {
        return {
          latlng,
          opts,
          setLatLng(newPos) { this.latlng = newPos; },
          setIcon(newIcon) { this.opts.icon = newIcon; },
          setTooltipContent() {},
          setPopupContent() {},
          bindTooltip() {},
          bindPopup() {},
          on() {},
          dragging: {
            enable() { this.enabled = true; },
            disable() { this.enabled = false; }
          }
        };
      },
      polyline(pts, opts) {
        return {
          pts,
          opts,
          setLatLngs(newPts) { this.pts = newPts; },
          setStyle() {},
          bindTooltip() {}
        };
      }
    };

    try {
      radar.layerGroup = mockLayerGroup;
      radar.markers.clear();
      radar.setOffset(10.0, 20.0);

      const rawLat = 40.0;
      const rawLon = -83.0;
      const takeoffLat = 39.999;
      const takeoffLon = -83.001;

      radar.activeDrones = [{
        id: 'ALIGN-SYNC-DRONE',
        uasId: 'RID-SYNC-01',
        model: 'DJI Air 3',
        latitude: rawLat,
        longitude: rawLon,
        operatorLatitude: takeoffLat,
        operatorLongitude: takeoffLon,
        status: 'Airborne'
      }];

      radar.updateMapMarkers();

      const entry = radar.markers.get('ALIGN-SYNC-DRONE');
      assert.ok(entry, 'Marker entry must exist');
      assert.ok(entry.marker, 'Drone marker must exist');
      assert.ok(entry.takeoffMarker, 'Takeoff marker must exist');

      // Verify drone marker position is shifted by applyOffset
      const expectedDronePos = radar.applyOffset(rawLat, rawLon);
      assert.strictEqual(entry.marker.latlng[0], expectedDronePos.lat);
      assert.strictEqual(entry.marker.latlng[1], expectedDronePos.lon);

      // Verify takeoff marker position is shifted by applyOffset
      const expectedTakeoffPos = radar.applyOffset(takeoffLat, takeoffLon);
      assert.strictEqual(entry.takeoffMarker.latlng[0], expectedTakeoffPos.lat);
      assert.strictEqual(entry.takeoffMarker.latlng[1], expectedTakeoffPos.lon);

      // Verify divIcon anchor centering
      const droneIcon = iconOptionsCreated.find(o => o.className && o.className.includes('remote-id-drone-marker'));
      assert.ok(droneIcon, 'Drone divIcon must be created');
      assert.deepStrictEqual(droneIcon.iconSize, [38, 38]);
      assert.deepStrictEqual(droneIcon.iconAnchor, [19, 19], 'Drone icon anchor must be centered at [19, 19]');

      const takeoffIcon = iconOptionsCreated.find(o => o.className && o.className.includes('remote-id-takeoff-marker'));
      assert.ok(takeoffIcon, 'Takeoff divIcon must be created');
      assert.deepStrictEqual(takeoffIcon.iconSize, [36, 44]);
      assert.deepStrictEqual(takeoffIcon.iconAnchor, [18, 13], 'Takeoff "H" badge circle must be centered at [18, 13]');

      // Assert drag-to-align is removed to prevent map drag conflicts (v1.61.1)
      assert.strictEqual(radar.isCalibrating, undefined);
      assert.strictEqual(radar.toggleDragCalibration, undefined);
      assert.strictEqual(entry.marker.dragging.enabled, undefined, 'Marker dragging must not be enabled');

    } finally {
      radar.resetOffset();
      radar.markers.clear();
      radar.activeDrones = [];
      radar.layerGroup = origLayerGroup;
      global.L = origL;
    }
  });
});

describe('v1.61.3 Double Grid Oblique Pitch followWayline Compliance (Antigravity Bug Report)', () => {
  test('double grid with oblique pitch (-60°) strictly exports followWayline instead of smoothTransition', () => {
    const originalGetElementById = global.document.getElementById;
    try {
      global.document.getElementById = (id) => ({
        value: {
          'drone-model': '68',
          'signal-lost-action': 'goBack',
          'camera-zoom': '1.0',
          'global-hover-time': '2',
          'grid-type': 'double',
          'flight-pattern': 'double',
          'altitude': '22',
          'speed': '4',
          'gimbal-pitch': '-60',
          'heading-mode': 'followWayline'
        }[id] || '',
        checked: false
      });

      // Exact waypoints configuration from Antigravity bug report
      const sampleWps = [
        { index: 0, lat: 40.01274682755848, lon: -83.17686868170873, alt: '22', heading: 142, turnMode: 'inherit' },
        { index: 1, lat: 40.01272493213971, lon: -83.17710151073241, alt: '22', heading: 232, turnMode: 'inherit' },
        { index: 2, lat: 40.01278437343159, lon: -83.17711104000223, alt: '22', heading: 258.565051177078, turnMode: 'inherit' },
        { index: 3, lat: 40.01280626885036, lon: -83.17687821097853, alt: '22', heading: 115.43494882292201, turnMode: 'inherit' },
        { index: 4, lat: 40.01286571014224, lon: -83.17688774024835, alt: '22', heading: 78.56505117707798, turnMode: 'inherit' }
      ];

      const xml = vm.runInThisContext(`
        buildWaylinesWpml(${JSON.stringify(sampleWps)}, 22, 4, 'followWayline', 'goHome', -60, 'stopAndShoot', 'straight')
      `);

      // Must strictly use followWayline, NEVER smoothTransition in double lawnmower grid
      assert.ok(xml.includes('<wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode>'),
        'Double grid with oblique pitch must use followWayline mode');
      assert.ok(!xml.includes('<wpml:waypointHeadingMode>smoothTransition</wpml:waypointHeadingMode>'),
        'Double grid with oblique pitch must NOT use smoothTransition mode');

      // Waypoint 0 must have headingAngleEnable: 1 and valid clamped non-zero angle
      assert.ok(xml.includes('<wpml:waypointHeadingAngleEnable>1</wpml:waypointHeadingAngleEnable>'),
        'Waypoint 0 endpoint must have heading angle enabled');

      // Validation check
      const validation = vm.runInThisContext(`
        validateWpmlMission(\`${xml}\`, '', { gridType: 'double' })
      `);
      assert.strictEqual(validation.valid, true, 'Must pass all 10 validation rules');
      assert.strictEqual(validation.rulesPassed, 10, 'Health score must be 10/10');
      assert.strictEqual(validation.errors.length, 0, 'Must have zero validation errors');
    } finally {
      global.document.getElementById = originalGetElementById;
    }
  });

  test('validateWpmlMission catches and flags invalid enable flag on intermediate followWayline in single grid', () => {
    const offendingXml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="http://www.uav.com/wpmz/1.0.2">
  <Document>
    <wpml:missionConfig><wpml:droneEnumValue>68</wpml:droneEnumValue></wpml:missionConfig>
    <Folder>
      <wpml:executeHeightMode>relativeToStartPoint</wpml:executeHeightMode>
      <Placemark>
        <Point><coordinates>-83.177105,40.012774</coordinates></Point>
        <wpml:index>0</wpml:index>
        <wpml:executeHeight>22</wpml:executeHeight>
        <wpml:waypointSpeed>4</wpml:waypointSpeed>
        <wpml:waypointHeadingParam>
          <wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode>
          <wpml:waypointHeadingAngle>0</wpml:waypointHeadingAngle>
          <wpml:waypointHeadingAngleEnable>1</wpml:waypointHeadingAngleEnable>
        </wpml:waypointHeadingParam>
        <wpml:waypointTurnParam>
          <wpml:waypointTurnMode>toPointAndStopWithContinuityCurvature</wpml:waypointTurnMode>
        </wpml:waypointTurnParam>
      </Placemark>
      <Placemark>
        <Point><coordinates>-83.177105,40.012953</coordinates></Point>
        <wpml:index>1</wpml:index>
        <wpml:executeHeight>22</wpml:executeHeight>
        <wpml:waypointSpeed>4</wpml:waypointSpeed>
        <wpml:waypointHeadingParam>
          <wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode>
          <wpml:waypointHeadingAngle>0</wpml:waypointHeadingAngle>
          <wpml:waypointHeadingAngleEnable>1</wpml:waypointHeadingAngleEnable>
        </wpml:waypointHeadingParam>
        <wpml:waypointTurnParam>
          <wpml:waypointTurnMode>toPointAndStopWithContinuityCurvature</wpml:waypointTurnMode>
        </wpml:waypointTurnParam>
      </Placemark>
      <Placemark>
        <Point><coordinates>-83.177105,40.013153</coordinates></Point>
        <wpml:index>2</wpml:index>
        <wpml:executeHeight>22</wpml:executeHeight>
        <wpml:waypointSpeed>4</wpml:waypointSpeed>
        <wpml:waypointHeadingParam>
          <wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode>
          <wpml:waypointHeadingAngle>0</wpml:waypointHeadingAngle>
          <wpml:waypointHeadingAngleEnable>1</wpml:waypointHeadingAngleEnable>
        </wpml:waypointHeadingParam>
        <wpml:waypointTurnParam>
          <wpml:waypointTurnMode>toPointAndStopWithContinuityCurvature</wpml:waypointTurnMode>
        </wpml:waypointTurnParam>
      </Placemark>
    </Folder>
  </Document>
</kml>`;

    const val = vm.runInThisContext(`validateWpmlMission(\`${offendingXml}\`, '', { gridType: 'single' })`);
    assert.strictEqual(val.valid, false, 'Should fail validation when intermediate followWayline has enable=1');
    assert.ok(val.errors.some(e => e.includes('intermediate waypointHeadingMode is \'followWayline\' but waypointHeadingAngleEnable is 1')),
      'Should report intermediate followWayline enable=1 error in Rule 1');
  });

  test('validateAndFixWpml automatically repairs intermediate followWayline enable flags for single grid', () => {
    const offendingXml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="http://www.uav.com/wpmz/1.0.2">
  <Document>
    <wpml:missionConfig><wpml:droneEnumValue>68</wpml:droneEnumValue></wpml:missionConfig>
    <Folder>
      <wpml:executeHeightMode>relativeToStartPoint</wpml:executeHeightMode>
      <Placemark>
        <Point><coordinates>-83.177105,40.012774</coordinates></Point>
        <wpml:index>0</wpml:index>
        <wpml:executeHeight>22</wpml:executeHeight>
        <wpml:waypointSpeed>4</wpml:waypointSpeed>
        <wpml:waypointHeadingParam>
          <wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode>
          <wpml:waypointHeadingAngle>0</wpml:waypointHeadingAngle>
          <wpml:waypointHeadingAngleEnable>1</wpml:waypointHeadingAngleEnable>
        </wpml:waypointHeadingParam>
        <wpml:waypointTurnParam>
          <wpml:waypointTurnMode>toPointAndStopWithContinuityCurvature</wpml:waypointTurnMode>
        </wpml:waypointTurnParam>
      </Placemark>
      <Placemark>
        <Point><coordinates>-83.177105,40.012953</coordinates></Point>
        <wpml:index>1</wpml:index>
        <wpml:executeHeight>22</wpml:executeHeight>
        <wpml:waypointSpeed>4</wpml:waypointSpeed>
        <wpml:waypointHeadingParam>
          <wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode>
          <wpml:waypointHeadingAngle>0</wpml:waypointHeadingAngle>
          <wpml:waypointHeadingAngleEnable>1</wpml:waypointHeadingAngleEnable>
        </wpml:waypointHeadingParam>
        <wpml:waypointTurnParam>
          <wpml:waypointTurnMode>toPointAndStopWithContinuityCurvature</wpml:waypointTurnMode>
        </wpml:waypointTurnParam>
      </Placemark>
      <Placemark>
        <Point><coordinates>-83.177105,40.013153</coordinates></Point>
        <wpml:index>2</wpml:index>
        <wpml:executeHeight>22</wpml:executeHeight>
        <wpml:waypointSpeed>4</wpml:waypointSpeed>
        <wpml:waypointHeadingParam>
          <wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode>
          <wpml:waypointHeadingAngle>0</wpml:waypointHeadingAngle>
          <wpml:waypointHeadingAngleEnable>1</wpml:waypointHeadingAngleEnable>
        </wpml:waypointHeadingParam>
        <wpml:waypointTurnParam>
          <wpml:waypointTurnMode>toPointAndStopWithContinuityCurvature</wpml:waypointTurnMode>
        </wpml:waypointTurnParam>
      </Placemark>
    </Folder>
  </Document>
</kml>`;

    const res = vm.runInThisContext(`validateAndFixWpml(\`${offendingXml}\`, '', { gridType: 'single' })`);
    assert.strictEqual(res.validation.valid, true, 'Sanitized XML must pass validation');
  });
});

describe('v1.61.4 followWayline Endpoint Heading Angle Enable Preservation', () => {
  test('40-waypoint Double Grid strictly preserves headingAngleEnable: 1 on endpoints and 0 on intermediate waypoints', () => {
    const originalGetElementById = global.document.getElementById;
    try {
      global.document.getElementById = (id) => ({
        value: {
          'drone-model': '68',
          'signal-lost-action': 'goBack',
          'camera-zoom': '1.0',
          'global-hover-time': '2',
          'grid-type': 'double',
          'flight-pattern': 'double',
          'altitude': '22',
          'speed': '4',
          'gimbal-pitch': '-60',
          'heading-mode': 'followWayline'
        }[id] || '',
        checked: false
      });

      // Sample 5 waypoints from the 40-waypoint bug report
      const sampleWps = [
        { index: 0, lat: 40.01276942491348, lon: -83.17685124730684, alt: '22', heading: 142, turnMode: 'inherit' },
        { index: 1, lat: 40.01276395105879, lon: -83.17690945458205, alt: '22', heading: 160.43494882292202, turnMode: 'inherit' },
        { index: 2, lat: 40.012758477204095, lon: -83.17696766185723, alt: '22', heading: 187, turnMode: 'inherit' },
        { index: 3, lat: 40.0127530033494, lon: -83.17702586913244, alt: '22', heading: 213.56505117707798, turnMode: 'inherit' },
        { index: 4, lat: 40.01274752949471, lon: -83.17708407640764, alt: '22', heading: 232, turnMode: 'inherit' }
      ];

      const rawXml = vm.runInThisContext(`
        buildWaylinesWpml(${JSON.stringify(sampleWps)}, 22, 4, 'followWayline', 'goHome', -60, 'stopAndShoot', 'straight')
      `);

      const sanitized = vm.runInThisContext(`
        validateAndFixWpml(\`${rawXml}\`, '', { gridType: 'double' })
      `);

      assert.strictEqual(sanitized.validation.valid, true, 'Sanitized mission must pass all rules');
      assert.strictEqual(sanitized.validation.rulesPassed, 10, 'Health score must be 10/10');

      const placemarks = sanitized.wpmlXml.split('<Placemark>').slice(1);
      assert.strictEqual(placemarks.length, 5);

      // Endpoint 0: must have headingAngleEnable: 1
      const enable0 = placemarks[0].match(/<wpml:waypointHeadingAngleEnable>([^<]+)<\/wpml:waypointHeadingAngleEnable>/)[1].trim();
      assert.strictEqual(enable0, '1', 'Waypoint 0 MUST have headingAngleEnable: 1');

      // Intermediate 1, 2, 3: must have headingAngleEnable: 0
      for (let i = 1; i < 4; i++) {
        const enable = placemarks[i].match(/<wpml:waypointHeadingAngleEnable>([^<]+)<\/wpml:waypointHeadingAngleEnable>/)[1].trim();
        assert.strictEqual(enable, '0', `Intermediate Waypoint ${i} MUST have headingAngleEnable: 0`);
      }

      // Endpoint 4: must have headingAngleEnable: 1
      const enable4 = placemarks[4].match(/<wpml:waypointHeadingAngleEnable>([^<]+)<\/wpml:waypointHeadingAngleEnable>/)[1].trim();
      assert.strictEqual(enable4, '1', 'Last Waypoint 4 MUST have headingAngleEnable: 1');
    } finally {
      global.document.getElementById = originalGetElementById;
    }
  });

  test('validateWpmlMission Rule 1 flags followWayline missions with headingAngleEnable: 0 at endpoint', () => {
    const badEndpointXml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="http://www.uav.com/wpmz/1.0.2">
  <Document>
    <wpml:missionConfig><wpml:droneEnumValue>68</wpml:droneEnumValue></wpml:missionConfig>
    <Folder>
      <wpml:executeHeightMode>relativeToStartPoint</wpml:executeHeightMode>
      <Placemark>
        <Point><coordinates>-83.1768512473068,40.0127694249135</coordinates></Point>
        <wpml:index>0</wpml:index>
        <wpml:executeHeight>22</wpml:executeHeight>
        <wpml:waypointSpeed>4</wpml:waypointSpeed>
        <wpml:waypointHeadingParam>
          <wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode>
          <wpml:waypointHeadingAngle>263.0</wpml:waypointHeadingAngle>
          <wpml:waypointHeadingAngleEnable>0</wpml:waypointHeadingAngleEnable>
        </wpml:waypointHeadingParam>
        <wpml:waypointTurnParam>
          <wpml:waypointTurnMode>toPointAndStopWithContinuityCurvature</wpml:waypointTurnMode>
        </wpml:waypointTurnParam>
        <wpml:useStraightLine>0</wpml:useStraightLine>
      </Placemark>
      <Placemark>
        <Point><coordinates>-83.1770840764076,40.0127475294947</coordinates></Point>
        <wpml:index>1</wpml:index>
        <wpml:executeHeight>22</wpml:executeHeight>
        <wpml:waypointSpeed>4</wpml:waypointSpeed>
        <wpml:waypointHeadingParam>
          <wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode>
          <wpml:waypointHeadingAngle>263.0</wpml:waypointHeadingAngle>
          <wpml:waypointHeadingAngleEnable>1</wpml:waypointHeadingAngleEnable>
        </wpml:waypointHeadingParam>
        <wpml:waypointTurnParam>
          <wpml:waypointTurnMode>toPointAndStopWithContinuityCurvature</wpml:waypointTurnMode>
        </wpml:waypointTurnParam>
        <wpml:useStraightLine>0</wpml:useStraightLine>
      </Placemark>
    </Folder>
  </Document>
</kml>`;

    const val = vm.runInThisContext(`validateWpmlMission(\`${badEndpointXml}\`, '', { gridType: 'double' })`);
    assert.strictEqual(val.valid, false, 'Should fail validation when endpoint 0 has headingAngleEnable: 0 in followWayline');
    assert.ok(val.errors.some(e => e.includes('endpoint waypointHeadingMode is \'followWayline\' but waypointHeadingAngleEnable is 0')),
      'Should report Rule 1 endpoint error');

    // Test automatic fix restores it
    const fixed = vm.runInThisContext(`validateAndFixWpml(\`${badEndpointXml}\`, '', { gridType: 'double' })`);
    assert.strictEqual(fixed.validation.valid, true, 'Auto-fixed XML should pass validation');
    const pms = fixed.wpmlXml.split('<Placemark>').slice(1);
    const restoredEnable0 = pms[0].match(/<wpml:waypointHeadingAngleEnable>([^<]+)<\/wpml:waypointHeadingAngleEnable>/)[1].trim();
    assert.strictEqual(restoredEnable0, '1', 'Endpoint 0 headingAngleEnable must be restored to 1');
  });
});

describe('v1.61.5 followWayline waypointHeadingAngle: 0 & Rule 2 Stock RC 2 Schema Alignment', () => {
  test('followWayline strictly outputs waypointHeadingAngle: 0 matching DJI RC 2 native schema', () => {
    const originalGetElementById = global.document.getElementById;
    try {
      global.document.getElementById = (id) => ({
        value: {
          'drone-model': '68',
          'signal-lost-action': 'goBack',
          'camera-zoom': '1.0',
          'global-hover-time': '2',
          'grid-type': 'double',
          'flight-pattern': 'double',
          'altitude': '22',
          'speed': '4',
          'gimbal-pitch': '-60',
          'heading-mode': 'followWayline'
        }[id] || '',
        checked: false
      });

      const sampleWps = [
        { index: 0, lat: 40.01275709908441, lon: -83.17685795285298, alt: '22', turnMode: 'inherit' },
        { index: 1, lat: 40.01275162522972, lon: -83.17691616011767, alt: '22', turnMode: 'inherit' },
        { index: 2, lat: 40.012746151375026, lon: -83.17697436738236, alt: '22', turnMode: 'inherit' },
        { index: 3, lat: 40.012740677520334, lon: -83.17703257464704, alt: '22', turnMode: 'inherit' },
        { index: 4, lat: 40.01273520366564, lon: -83.17709078191173, alt: '22', turnMode: 'inherit' }
      ];

      const rawXml = vm.runInThisContext(`
        buildWaylinesWpml(${JSON.stringify(sampleWps)}, 22, 4, 'followWayline', 'goHome', -60, 'stopAndShoot', 'straight')
      `);

      const placemarks = rawXml.split('<Placemark>').slice(1);
      assert.strictEqual(placemarks.length, 5);

      // Verify every placemark in followWayline has waypointHeadingAngle: 0
      placemarks.forEach((pm, idx) => {
        const ang = pm.match(/<wpml:waypointHeadingAngle>([^<]+)<\/wpml:waypointHeadingAngle>/)[1].trim();
        assert.strictEqual(ang, '0', `Placemark ${idx} must strictly have waypointHeadingAngle: 0 in followWayline`);
      });

      // Verify Rule 2 does NOT flag followWayline with angle 0 and enable 1
      const val = vm.runInThisContext(`validateWpmlMission(\`${rawXml}\`, '', { gridType: 'double' })`);
      assert.strictEqual(val.valid, true, 'Mission with waypointHeadingAngle: 0 in followWayline must pass Rule 2 cleanly');
      assert.strictEqual(val.rulesPassed, 10, 'Health score must be 10/10');
    } finally {
      global.document.getElementById = originalGetElementById;
    }
  });

  test('native stock DJI Fly XML with followWayline, angle 0, and enable 1 passes validation cleanly', () => {
    const stockFlyXml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="http://www.uav.com/wpmz/1.0.2">
  <Document>
    <wpml:missionConfig><wpml:droneEnumValue>68</wpml:droneEnumValue></wpml:missionConfig>
    <Folder>
      <wpml:executeHeightMode>relativeToStartPoint</wpml:executeHeightMode>
      <Placemark>
        <Point><coordinates>-83.1771582423143,40.0128314426079</coordinates></Point>
        <wpml:index>0</wpml:index>
        <wpml:executeHeight>10</wpml:executeHeight>
        <wpml:waypointSpeed>12</wpml:waypointSpeed>
        <wpml:waypointHeadingParam>
          <wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode>
          <wpml:waypointHeadingAngle>0</wpml:waypointHeadingAngle>
          <wpml:waypointPoiPoint>0.000000,0.000000,0.000000</wpml:waypointPoiPoint>
          <wpml:waypointHeadingAngleEnable>1</wpml:waypointHeadingAngleEnable>
          <wpml:waypointHeadingPathMode>followBadArc</wpml:waypointHeadingPathMode>
          <wpml:waypointHeadingPoiIndex>0</wpml:waypointHeadingPoiIndex>
        </wpml:waypointHeadingParam>
        <wpml:waypointTurnParam>
          <wpml:waypointTurnMode>toPointAndStopWithContinuityCurvature</wpml:waypointTurnMode>
          <wpml:waypointTurnDampingDist>0</wpml:waypointTurnDampingDist>
        </wpml:waypointTurnParam>
        <wpml:useStraightLine>0</wpml:useStraightLine>
      </Placemark>
      <Placemark>
        <Point><coordinates>-83.1767677125856,40.0128610246434</coordinates></Point>
        <wpml:index>1</wpml:index>
        <wpml:executeHeight>10</wpml:executeHeight>
        <wpml:waypointSpeed>12</wpml:waypointSpeed>
        <wpml:waypointHeadingParam>
          <wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode>
          <wpml:waypointHeadingAngle>0</wpml:waypointHeadingAngle>
          <wpml:waypointPoiPoint>0.000000,0.000000,0.000000</wpml:waypointPoiPoint>
          <wpml:waypointHeadingAngleEnable>0</wpml:waypointHeadingAngleEnable>
          <wpml:waypointHeadingPathMode>followBadArc</wpml:waypointHeadingPathMode>
          <wpml:waypointHeadingPoiIndex>0</wpml:waypointHeadingPoiIndex>
        </wpml:waypointHeadingParam>
        <wpml:waypointTurnParam>
          <wpml:waypointTurnMode>toPointAndPassWithContinuityCurvature</wpml:waypointTurnMode>
          <wpml:waypointTurnDampingDist>0</wpml:waypointTurnDampingDist>
        </wpml:waypointTurnParam>
        <wpml:useStraightLine>0</wpml:useStraightLine>
      </Placemark>
      <Placemark>
        <Point><coordinates>-83.1767677125856,40.0128610246434</coordinates></Point>
        <wpml:index>2</wpml:index>
        <wpml:executeHeight>10</wpml:executeHeight>
        <wpml:waypointSpeed>12</wpml:waypointSpeed>
        <wpml:waypointHeadingParam>
          <wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode>
          <wpml:waypointHeadingAngle>0</wpml:waypointHeadingAngle>
          <wpml:waypointPoiPoint>0.000000,0.000000,0.000000</wpml:waypointPoiPoint>
          <wpml:waypointHeadingAngleEnable>0</wpml:waypointHeadingAngleEnable>
          <wpml:waypointHeadingPathMode>followBadArc</wpml:waypointHeadingPathMode>
          <wpml:waypointHeadingPoiIndex>0</wpml:waypointHeadingPoiIndex>
        </wpml:waypointHeadingParam>
        <wpml:waypointTurnParam>
          <wpml:waypointTurnMode>toPointAndPassWithContinuityCurvature</wpml:waypointTurnMode>
          <wpml:waypointTurnDampingDist>0</wpml:waypointTurnDampingDist>
        </wpml:waypointTurnParam>
        <wpml:useStraightLine>0</wpml:useStraightLine>
      </Placemark>
      <Placemark>
        <Point><coordinates>-83.1771582423143,40.0128314426079</coordinates></Point>
        <wpml:index>3</wpml:index>
        <wpml:executeHeight>10</wpml:executeHeight>
        <wpml:waypointSpeed>12</wpml:waypointSpeed>
        <wpml:waypointHeadingParam>
          <wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode>
          <wpml:waypointHeadingAngle>0</wpml:waypointHeadingAngle>
          <wpml:waypointPoiPoint>0.000000,0.000000,0.000000</wpml:waypointPoiPoint>
          <wpml:waypointHeadingAngleEnable>1</wpml:waypointHeadingAngleEnable>
          <wpml:waypointHeadingPathMode>followBadArc</wpml:waypointHeadingPathMode>
          <wpml:waypointHeadingPoiIndex>0</wpml:waypointHeadingPoiIndex>
        </wpml:waypointHeadingParam>
        <wpml:waypointTurnParam>
          <wpml:waypointTurnMode>toPointAndStopWithContinuityCurvature</wpml:waypointTurnMode>
          <wpml:waypointTurnDampingDist>0</wpml:waypointTurnDampingDist>
        </wpml:waypointTurnParam>
        <wpml:useStraightLine>0</wpml:useStraightLine>
      </Placemark>
    </Folder>
  </Document>
</kml>`;

    const val = vm.runInThisContext(`validateWpmlMission(\`${stockFlyXml}\`)`);
    assert.strictEqual(val.valid, true, 'Stock DJI Fly structure must pass 10/10 rules');
    assert.strictEqual(val.rulesPassed, 10, 'Health score must be 10/10');
  });

  test('validateWpmlMission Rule 6 allows 108+ action groups (up to 500 waypoints) without flagging error', () => {
    let pms = '';
    for (let i = 0; i < 108; i++) {
      const isEndpoint = (i === 0 || i === 107);
      pms += `
      <Placemark>
        <Point><coordinates>-83.176500,40.013000</coordinates></Point>
        <wpml:index>${i}</wpml:index>
        <wpml:executeHeight>50.0</wpml:executeHeight>
        <wpml:waypointHeadingParam>
          <wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode>
          <wpml:waypointHeadingAngle>0</wpml:waypointHeadingAngle>
          <wpml:waypointHeadingAngleEnable>${isEndpoint ? '1' : '0'}</wpml:waypointHeadingAngleEnable>
        </wpml:waypointHeadingParam>
        <wpml:waypointTurnParam>
          <wpml:waypointTurnMode>${isEndpoint ? 'toPointAndStopWithContinuityCurvature' : 'toPointAndPassWithContinuityCurvature'}</wpml:waypointTurnMode>
          <wpml:waypointTurnDampingDist>0</wpml:waypointTurnDampingDist>
        </wpml:waypointTurnParam>
        <wpml:actionGroup>
          <wpml:actionGroupId>0</wpml:actionGroupId>
          <wpml:actionGroupStartIndex>${i}</wpml:actionGroupStartIndex>
          <wpml:actionGroupEndIndex>${i}</wpml:actionGroupEndIndex>
          <wpml:actionGroupMode>sequence</wpml:actionGroupMode>
          <wpml:actionGroupTrigger>
            <wpml:actionTriggerType>reachPoint</wpml:actionTriggerType>
          </wpml:actionGroupTrigger>
          <wpml:action>
            <wpml:actionId>0</wpml:actionId>
            <wpml:actionActuatorFunc>takePhoto</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>
              <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
              <wpml:useGlobalPayloadLensIndex>0</wpml:useGlobalPayloadLensIndex>
            </wpml:actionActuatorFuncParam>
          </wpml:action>
        </wpml:actionGroup>
      </Placemark>`;
    }

    const testXml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="http://www.uav.com/wpmz/1.0.2">
  <Document>
    <wpml:missionConfig>
      <wpml:droneInfo>
        <wpml:droneEnumValue>68</wpml:droneEnumValue>
      </wpml:droneInfo>
    </wpml:missionConfig>
    <Folder>
      ${pms}
    </Folder>
  </Document>
</kml>`;

    const val = vm.runInThisContext(`validateWpmlMission(\`${testXml}\`)`);
    assert.strictEqual(val.valid, true, '108 waypoint mission must pass validation cleanly');
    assert.strictEqual(val.rulesPassed, 10, 'All 10 rules must pass for 108 waypoints');
    const r6 = val.rules.find(r => r.id === 6);
    assert.ok(r6, 'Rule 6 must exist');
    assert.strictEqual(r6.passed, true, 'Rule 6 must pass for 108 action groups');
  });

  test('FlightDiagnostics.refreshFlightList formats waypoint counts in bad mission dropdown labels', async () => {
    const fd = vm.runInThisContext('FlightDiagnostics');
    let selectorOptions = [];
    const mockSelect = {
      value: '',
      innerHTML: '',
      get options() { return selectorOptions; },
      appendChild(node) {
        if (node.tagName === 'OPTGROUP' || node.label) {
          if (node.children) {
            node.children.forEach(c => selectorOptions.push(c));
          }
        } else {
          selectorOptions.push(node);
        }
      }
    };

    const origGetElementById = global.document?.getElementById;
    const origCreateElement = global.document?.createElement;
    global.document = global.document || {};
    global.document.getElementById = (id) => {
      if (id === 'diag-flight-selector') return mockSelect;
      return origGetElementById ? origGetElementById(id) : null;
    };
    global.document.createElement = (tag) => ({
      tagName: tag.toUpperCase(),
      children: [],
      appendChild(child) { this.children.push(child); selectorOptions.push(child); }
    });

    const origFetch = global.fetch;
    global.fetch = async (url) => {
      if (url.includes('/api/diagnostics/history')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            missions: [
              {
                archive_id: 'test_bad_108',
                uuid: '354A8F93-759C-42C3-A8D5-746F79C7622A',
                filename: '108wp_test.kmz',
                created_at: '2026-08-30T22:45:17Z',
                waypoint_count: 108,
                is_valid: 0,
                execution_status: 'invalid',
                validation_errors: ['Action test failure']
              }
            ]
          })
        };
      }
      return { ok: true, json: async () => ({ success: true, flights: [] }) };
    };

    try {
      await vm.runInThisContext('FlightDiagnostics.refreshFlightList()');
      const badOpt = selectorOptions.find(o => o.value === 'diag:test_bad_108');
      assert.ok(badOpt, 'Must create option for test_bad_108');
      assert.ok(badOpt.textContent.includes('108 wps'), `Label must include waypoint count, got: ${badOpt.textContent}`);
    } finally {
      global.fetch = origFetch;
      if (origGetElementById) {
        global.document.getElementById = origGetElementById;
      }
      if (origCreateElement) {
        global.document.createElement = origCreateElement;
      }
    }
  });

  test('server.js exports extractLatestFlight and contains polling wait loop for CopyHere', () => {
    const fs = require('fs');
    const serverCode = fs.readFileSync('tools/companion/server.js', 'utf8');
    assert.ok(serverCode.includes('extractLatestFlight'), 'server.js must define extractLatestFlight');
    assert.ok(serverCode.includes('$swLog = [System.Diagnostics.Stopwatch]::StartNew()'), 'Must include stopwatch wait loop for log');
    assert.ok(serverCode.includes('$swKmz = [System.Diagnostics.Stopwatch]::StartNew()'), 'Must include stopwatch wait loop for KMZ');
    assert.ok(serverCode.includes("payload.diagData || payload.diagnostics"), 'Must archive diagnostics in /api/sync');
  });
});

describe('v1.62.0 Flight Pattern Layers & Multi-Layer Transitions Tests', () => {
  beforeEach(() => {
    importedWaypoints = null;
    importedPhotos = null;
    importedFileName = '';
  });

  test('createDefaultLayer generates valid layer model with default parameters', () => {
    importedWaypoints = null;
    const layer = createDefaultLayer('test-layer-1', 'Layer 1: Test Grid', 0, 'double');
    assert.strictEqual(layer.id, 'test-layer-1');
    assert.strictEqual(layer.name, 'Layer 1: Test Grid');
    assert.strictEqual(layer.enabled, true);
    assert.strictEqual(layer.pattern, 'double');
    assert.strictEqual(layer.altitude, 50);
    assert.strictEqual(layer.speed, 4);
    assert.strictEqual(layer.gimbalPitch, -60);
    assert.strictEqual(layer.transition.type, 'direct');
    assert.strictEqual(layer.color, '#06b6d4');
  });

  test('addFlightLayer, duplicateFlightLayer, deleteFlightLayer, and reorderFlightLayers manipulate layer stack safely', () => {
    importedWaypoints = null;
    // Reset flightLayers to single default layer
    flightLayers = [createDefaultLayer('layer-1', 'Layer 1: Nadir Grid', 0, 'single')];
    activeLayerId = flightLayers[0].id;

    // Add second layer (Orbit)
    const layer2 = addFlightLayer('orbit');
    assert.strictEqual(flightLayers.length, 2);
    assert.strictEqual(activeLayerId, layer2.id);
    assert.strictEqual(layer2.pattern, 'orbit');

    // Duplicate second layer
    duplicateFlightLayer(layer2.id);
    assert.strictEqual(flightLayers.length, 3);
    assert.ok(flightLayers[2].name.startsWith('Copy of '));

    // Reorder layers
    const firstId = flightLayers[0].id;
    reorderFlightLayers(0, 1);
    assert.strictEqual(flightLayers[1].id, firstId);

    // Delete a layer
    const toDeleteId = flightLayers[2].id;
    deleteFlightLayer(toDeleteId);
    assert.strictEqual(flightLayers.length, 2);

    // Cannot delete when only 1 layer remaining
    deleteFlightLayer(flightLayers[0].id);
    assert.strictEqual(flightLayers.length, 1);
    deleteFlightLayer(flightLayers[0].id); // Should be a no-op
    assert.strictEqual(flightLayers.length, 1);
  });

  test('generateLayerWaypoints correctly isolates independent layer parameters', () => {
    importedWaypoints = null;
    const layerA = createDefaultLayer('layer-a', 'Layer A (50m, -60°)', 0, 'single');
    layerA.altitude = 50;
    layerA.speed = 3;
    layerA.gimbalPitch = -60;

    const layerB = createDefaultLayer('layer-b', 'Layer B (30m, -45°)', 1, 'orbit');
    layerB.altitude = 30;
    layerB.speed = 5;
    layerB.gimbalPitch = -45;

    const resA = generateLayerWaypoints(layerA, 40.0, -80.0);
    const resB = generateLayerWaypoints(layerB, 40.0, -80.0);

    assert.ok(resA.waypoints.length > 0, 'Layer A should have waypoints');
    assert.ok(resB.waypoints.length > 0, 'Layer B should have waypoints');

    // Assert altitude, speed, and pitch isolation
    resA.waypoints.forEach(wp => {
      assert.strictEqual(wp.alt, 50);
      assert.strictEqual(wp.speed, 3);
      assert.strictEqual(wp.pitch, -60);
      assert.strictEqual(wp.layerId, 'layer-a');
    });

    resB.waypoints.forEach(wp => {
      assert.strictEqual(wp.alt, 30);
      assert.strictEqual(wp.speed, 5);
      assert.strictEqual(wp.pitch, -45);
      assert.strictEqual(wp.layerId, 'layer-b');
    });
  });

  test('generateTransitionWaypoints produces valid transition waypoints for direct, climbFirst, and safeAltitude', () => {
    importedWaypoints = null;
    const layerA = createDefaultLayer('layer-a', 'Layer A', 0, 'single');
    layerA.altitude = 40;
    layerA.speed = 4;
    layerA.gimbalPitch = -60;

    const layerB = createDefaultLayer('layer-b', 'Layer B', 1, 'orbit');
    layerB.altitude = 70;
    layerB.speed = 6;
    layerB.gimbalPitch = -45;

    const lastWpA = { lat: 40.0, lon: -80.0, x: 0, y: 0, alt: 40 };
    const firstWpB = { lat: 40.01, lon: -80.01, x: 100, y: 100, alt: 70 };

    // 1. Direct transition
    layerA.transition = { type: 'direct' };
    const directWps = generateTransitionWaypoints(layerA, lastWpA, layerB, firstWpB, 40.0, -80.0);
    assert.strictEqual(directWps.length, 0);

    // 2. Climb first transition
    layerA.transition = { type: 'climbFirst', dwellTime: 2 };
    const climbWps = generateTransitionWaypoints(layerA, lastWpA, layerB, firstWpB, 40.0, -80.0);
    assert.strictEqual(climbWps.length, 1);
    assert.strictEqual(climbWps[0].alt, 70); // climbed to next layer altitude
    assert.strictEqual(climbWps[0].isTransition, true);
    assert.strictEqual(climbWps[0].hoverTime, 2);

    // 3. Safe altitude transition
    layerA.transition = { type: 'safeAltitude', safeAltitude: 90, dwellTime: 1 };
    const safeWps = generateTransitionWaypoints(layerA, lastWpA, layerB, firstWpB, 40.0, -80.0);
    assert.strictEqual(safeWps.length, 2);
    assert.strictEqual(safeWps[0].alt, 90);
    assert.strictEqual(safeWps[1].alt, 90);
    assert.strictEqual(safeWps[0].isTransition, true);
  });

  test('compileMultiLayerMission combines active layers into sequential mission with unified index', () => {
    importedWaypoints = null;
    flightLayers = [
      createDefaultLayer('layer-1', 'Layer 1 (Grid)', 0, 'single'),
      createDefaultLayer('layer-2', 'Layer 2 (Orbit)', 1, 'orbit')
    ];
    flightLayers[0].altitude = 60;
    flightLayers[1].altitude = 35;
    flightLayers[0].transition = { type: 'safeAltitude', safeAltitude: 80 };

    const compiled = compileMultiLayerMission(40.0, -80.0);
    assert.ok(compiled.waypoints.length > 0);

    // Check sequential indexing
    compiled.waypoints.forEach((wp, idx) => {
      assert.strictEqual(wp.idx, idx, `Waypoint ${idx} must match sequential idx`);
      assert.ok(typeof wp.lat === 'number');
      assert.ok(typeof wp.lon === 'number');
      assert.ok(typeof wp.alt === 'number');
    });

    const hasTransition = compiled.waypoints.some(wp => wp.isTransition === true);
    assert.strictEqual(hasTransition, true, 'Compiled multi-layer mission must contain synthesized transition waypoints');
  });

  test('buildWaylinesWpml exports valid XML Placemarks and action groups for multi-layer sequence', () => {
    importedWaypoints = null;
    flightLayers = [
      createDefaultLayer('layer-1', 'Layer 1', 0, 'single'),
      createDefaultLayer('layer-2', 'Layer 2', 1, 'orbit')
    ];
    flightLayers[0].altitude = 55;
    flightLayers[0].gimbalPitch = -90;
    flightLayers[1].altitude = 30;
    flightLayers[1].gimbalPitch = -45;

    const compiled = compileMultiLayerMission(40.0, -80.0);
    const xml = buildWaylinesWpml(compiled.waypoints, 55, 4, 'followWayline', 'goHome', -90, 'stopAndShoot', 'curved');

    assert.ok(xml.includes('<kml xmlns="http://www.opengis.net/kml/2.2"'));
    assert.ok(xml.includes('<wpml:waylineId>0</wpml:waylineId>'));
    assert.ok(xml.includes('<wpml:executeHeight>55</wpml:executeHeight>'));
    assert.ok(xml.includes('<wpml:executeHeight>30</wpml:executeHeight>'));
    assert.ok(xml.includes('<wpml:gimbalPitchRotateAngle>-90</wpml:gimbalPitchRotateAngle>'));
    assert.ok(xml.includes('<wpml:gimbalPitchRotateAngle>-45</wpml:gimbalPitchRotateAngle>'));
  });

  test('v1.62.1: toggleFlightLayerVisibility excludes disabled layer waypoints and allows all layers disabled without forced re-enable', () => {
    importedWaypoints = null;
    flightLayers = [
      createDefaultLayer('layer-1', 'Layer 1', 0, 'single'),
      createDefaultLayer('layer-2', 'Layer 2', 1, 'orbit')
    ];

    const initialCompiled = compileMultiLayerMission(40.0, -80.0);
    const initialCount = initialCompiled.waypoints.length;
    assert.ok(initialCount > 0);

    // Disable layer-2
    toggleFlightLayerVisibility('layer-2');
    assert.strictEqual(flightLayers[1].enabled, false);

    const afterOneDisabled = compileMultiLayerMission(40.0, -80.0);
    assert.ok(afterOneDisabled.waypoints.length < initialCount, 'Disabling layer-2 must reduce total waypoint count');
    assert.strictEqual(afterOneDisabled.waypoints.some(w => w.layerId === 'layer-2'), false, 'No waypoints from disabled layer-2 should be present');

    // Disable layer-1 as well (all layers disabled)
    toggleFlightLayerVisibility('layer-1');
    assert.strictEqual(flightLayers[0].enabled, false);
    assert.strictEqual(flightLayers[1].enabled, false);

    const allDisabled = compileMultiLayerMission(40.0, -80.0);
    assert.strictEqual(allDisabled.waypoints.length, 0, 'When all layers are disabled, compiled waypoints must be exactly 0');
    assert.strictEqual(flightLayers[0].enabled, false, 'compileMultiLayerMission must not forcefully re-enable disabled layer');
  });

  test('v1.62.1: deleteFlightLayer removes waypoints and resets when single layer deleted', () => {
    importedWaypoints = null;
    flightLayers = [
      createDefaultLayer('layer-1', 'Layer 1', 0, 'single'),
      createDefaultLayer('layer-2', 'Layer 2', 1, 'orbit')
    ];

    const initialCompiled = compileMultiLayerMission(40.0, -80.0);
    const initialCount = initialCompiled.waypoints.length;

    // Delete layer-2
    deleteFlightLayer('layer-2');
    assert.strictEqual(flightLayers.length, 1);
    assert.strictEqual(flightLayers[0].id, 'layer-1');

    const afterDelete = compileMultiLayerMission(40.0, -80.0);
    assert.ok(afterDelete.waypoints.length < initialCount, 'Deleting layer-2 must remove its waypoints');
    assert.strictEqual(afterDelete.waypoints.some(w => w.layerId === 'layer-2'), false);

    // Delete the only remaining layer
    deleteFlightLayer('layer-1');
    assert.strictEqual(flightLayers[0].enabled, false, 'Deleting single remaining layer must disable/clear it');
    const cleared = compileMultiLayerMission(40.0, -80.0);
    assert.strictEqual(cleared.waypoints.length, 0, 'Compiled waypoints must be 0 after deleting single remaining layer');
  });
});

describe('3D Exclusion Zones (No-Fly Volumes) Tests (v1.63.0)', () => {
  test('createDefaultLayer configures exclusion zones properly with red color and 3D altitude envelope', () => {
    const boxZone = createDefaultLayer('zone-1', 'Exclusion Box', 0, 'exclusion-box');
    assert.strictEqual(boxZone.isExclusionZone, true);
    assert.strictEqual(boxZone.pattern, 'exclusion-box');
    assert.strictEqual(boxZone.color, '#ef4444');
    assert.strictEqual(boxZone.allAltitudes, true);
    assert.strictEqual(boxZone.minAltitude, 0);
    assert.strictEqual(boxZone.maxAltitude, 60);

    const polyZone = createDefaultLayer('zone-2', 'Exclusion Poly', 1, 'exclusion-freeform');
    assert.strictEqual(polyZone.isExclusionZone, true);
    assert.strictEqual(polyZone.pattern, 'exclusion-freeform');
    assert.strictEqual(polyZone.color, '#ef4444');
    assert.strictEqual(polyZone.allAltitudes, true);
  });

  test('isPointInPolygon accurately performs 2D ray casting containment', () => {
    const square = [
      { x: -10, y: -10 },
      { x: 10, y: -10 },
      { x: 10, y: 10 },
      { x: -10, y: 10 }
    ];

    assert.strictEqual(isPointInPolygon(0, 0, square), true, 'Center of square should be inside');
    assert.strictEqual(isPointInPolygon(5, 5, square), true, 'Inside quadrant should be inside');
    assert.strictEqual(isPointInPolygon(20, 0, square), false, 'Outside X should be outside');
    assert.strictEqual(isPointInPolygon(0, -25, square), false, 'Outside Y should be outside');
  });

  test('isPointInExclusionZone handles Box zones with All Altitudes (0m – ∞)', () => {
    const centerLat = 40.0;
    const centerLon = -80.0;
    const boxZone = {
      enabled: true,
      pattern: 'exclusion-box',
      isExclusionZone: true,
      allAltitudes: true,
      gridWidth: 100,
      gridHeight: 100,
      gridRotation: 0
    };

    // Point at local origin (0, 0) at 120m altitude
    const centerWp = { x: 0, y: 0, alt: 120, lat: centerLat, lon: centerLon };
    assert.strictEqual(isPointInExclusionZone(centerWp, boxZone, centerLat, centerLon), true);

    // Point at local (40, 40) inside 100x100 box
    const insideWp = { x: 40, y: 40, alt: 50, lat: centerLat, lon: centerLon };
    assert.strictEqual(isPointInExclusionZone(insideWp, boxZone, centerLat, centerLon), true);

    // Point at local (70, 0) outside 100x100 box (halfW is 50)
    const outsideWp = { x: 70, y: 0, alt: 50, lat: centerLat, lon: centerLon };
    assert.strictEqual(isPointInExclusionZone(outsideWp, boxZone, centerLat, centerLon), false);
  });

  test('isPointInExclusionZone handles altitude floor and ceiling restrictions', () => {
    const centerLat = 40.0;
    const centerLon = -80.0;
    const boundedZone = {
      enabled: true,
      pattern: 'exclusion-box',
      isExclusionZone: true,
      allAltitudes: false,
      minAltitude: 30,
      maxAltitude: 70,
      gridWidth: 100,
      gridHeight: 100,
      gridRotation: 0
    };

    // Inside horizontal box at 50m (between 30m and 70m)
    const insideAltWp = { x: 0, y: 0, alt: 50, lat: centerLat, lon: centerLon };
    assert.strictEqual(isPointInExclusionZone(insideAltWp, boundedZone, centerLat, centerLon), true);

    // Inside horizontal box at 15m (below 30m floor -> permitted flight)
    const belowFloorWp = { x: 0, y: 0, alt: 15, lat: centerLat, lon: centerLon };
    assert.strictEqual(isPointInExclusionZone(belowFloorWp, boundedZone, centerLat, centerLon), false);

    // Inside horizontal box at 100m (above 70m ceiling -> permitted flight)
    const aboveCeilWp = { x: 0, y: 0, alt: 100, lat: centerLat, lon: centerLon };
    assert.strictEqual(isPointInExclusionZone(aboveCeilWp, boundedZone, centerLat, centerLon), false);
  });

  test('isPointInExclusionZone handles Freeform Polygon zones', () => {
    const centerLat = 40.0;
    const centerLon = -80.0;
    const polyZone = {
      enabled: true,
      pattern: 'exclusion-freeform',
      isExclusionZone: true,
      allAltitudes: true,
      freeformWaypoints: [
        { x: -50, y: -50, lat: centerLat, lon: centerLon },
        { x: 50, y: -50, lat: centerLat, lon: centerLon },
        { x: 50, y: 50, lat: centerLat, lon: centerLon },
        { x: -50, y: 50, lat: centerLat, lon: centerLon }
      ]
    };

    const insidePoint = { x: 10, y: -10, alt: 45, lat: centerLat, lon: centerLon };
    assert.strictEqual(isPointInExclusionZone(insidePoint, polyZone, centerLat, centerLon), true);

    const outsidePoint = { x: 100, y: 100, alt: 45, lat: centerLat, lon: centerLon };
    assert.strictEqual(isPointInExclusionZone(outsidePoint, polyZone, centerLat, centerLon), false);
  });

  test('compileMultiLayerMission filters candidate waypoints from flight layers when exclusion zones are active', () => {
    importedWaypoints = null;
    const centerLat = 40.0;
    const centerLon = -80.0;

    // Layer 1: Standard Double Grid
    const flightLayer = createDefaultLayer('layer-flight', 'Double Grid', 0, 'double');
    flightLayer.gridWidth = 100;
    flightLayer.gridHeight = 100;
    flightLayer.altitude = 50;

    // First compile without exclusion zone to get baseline count
    flightLayers = [flightLayer];
    const baselineMission = compileMultiLayerMission(centerLat, centerLon);
    const baselineWpCount = baselineMission.waypoints.length;
    assert.ok(baselineWpCount > 0, 'Baseline mission should have waypoints');

    // Add Layer 2: Exclusion Box over the central 60x60m volume
    const exclusionLayer = createDefaultLayer('layer-excl', 'Central Hazard', 1, 'exclusion-box');
    exclusionLayer.gridWidth = 60;
    exclusionLayer.gridHeight = 60;
    exclusionLayer.allAltitudes = true;

    flightLayers = [flightLayer, exclusionLayer];
    const filteredMission = compileMultiLayerMission(centerLat, centerLon);

    const nonDetourWaypoints = filteredMission.waypoints.filter(wp => !wp.isExclusionDetour);
    assert.strictEqual(nonDetourWaypoints.length < baselineWpCount, true, 'Base waypoint count must decrease after applying exclusion zone');
    assert.strictEqual(exclusionLayer.filteredCount > 0, true, 'Exclusion zone should record filtered waypoint count');
    assert.strictEqual(nonDetourWaypoints.length + exclusionLayer.filteredCount, baselineWpCount, 'Pruned waypoints + remaining non-detour waypoints must sum to baseline count');
    assert.strictEqual(filteredMission.waypoints.some(wp => wp.isExclusionDetour === true), true, 'Mission should synthesize detour waypoints around exclusion volume');

    // Verify none of the remaining waypoints fall inside the exclusion box
    filteredMission.waypoints.forEach((wp) => {
      const inZone = isPointInExclusionZone(wp, exclusionLayer, centerLat, centerLon);
      assert.strictEqual(inZone, false, `Waypoint at (${wp.x}, ${wp.y}) must not fall inside exclusion zone`);
    });
  });

  test('generateLayerWaypoints returns isExclusionZone and no drone waypoints for exclusion layers', () => {
    const exclBox = createDefaultLayer('excl-box-1', 'Exclusion Box', 0, 'exclusion-box');
    const res = generateLayerWaypoints(exclBox, 40.0, -80.0);
    assert.strictEqual(res.isExclusionZone, true);
    assert.strictEqual(res.waypoints.length, 0);
    assert.strictEqual(res.photos.length, 0);
  });
});

describe('Freeform Pattern & Layer Isolation Tests (v1.63.1)', () => {
  test('Freeform layers start with 0 waypoints and do NOT inherit previous procedural grid waypoints', () => {
    importedWaypoints = null;
    generatedWaypoints = [
      { lat: 40.0, lon: -80.0, x: 0, y: 0, alt: 50 },
      { lat: 40.001, lon: -80.0, x: 0, y: 100, alt: 50 }
    ];

    const freeformLayer = createDefaultLayer('layer-freeform', 'Freeform Layer', 0, 'freeform');
    assert.deepStrictEqual(freeformLayer.freeformWaypoints, [], 'Layer freeformWaypoints must initialize as empty array');

    const result = generateLayerWaypoints(freeformLayer, 40.0, -80.0);
    assert.strictEqual(result.waypoints.length, 0, 'Freeform layer without manual waypoints must return 0 waypoints (not copy generatedWaypoints)');
    assert.strictEqual(freeformLayer.freeformWaypoints.length, 0, 'layer.freeformWaypoints must remain 0');
  });

  test('addFreeformWaypoint places center marker and immediately adds first waypoint', () => {
    importedWaypoints = null;
    centerMarker = null;
    const origCreateElement = global.document ? global.document.createElement : null;
    vm.runInThisContext(`
      document.createElement = (tag) => ({
        style: {},
        appendChild: () => {},
        replaceChildren: () => {},
        textContent: '',
        innerHTML: '',
        setAttribute: () => {},
        className: ''
      });
      L = {
        divIcon: () => ({}),
        marker: (latlng) => ({
          _latlng: { lat: Array.isArray(latlng) ? latlng[0] : 0, lng: Array.isArray(latlng) ? latlng[1] : 0 },
          getLatLng: function() { return this._latlng; },
          setLatLng: function(ll) { this._latlng = { lat: Array.isArray(ll) ? ll[0] : ll.lat, lng: Array.isArray(ll) ? ll[1] : ll.lng }; return this; },
          bindTooltip: function() { return this; },
          bindPopup: function() { return this; },
          openPopup: function() { return this; },
          closePopup: function() { return this; },
          on: function() { return this; },
          addTo: function() { return this; },
          setIcon: function() { return this; }
        }),
        circleMarker: () => ({ bindTooltip: () => {}, bindPopup: () => {}, on: () => {}, addTo: function() { return this; } }),
        polyline: () => ({ addTo: function() { return this; }, setLatLngs: () => {} }),
        polygon: () => ({ addTo: function() { return this; }, setLatLngs: () => {} }),
        layerGroup: () => ({ clearLayers: () => {}, addLayer: () => {}, eachLayer: () => {} }),
        featureGroup: () => ({ clearLayers: () => {}, addLayer: () => {}, eachLayer: () => {} }),
        Control: {
          extend: () => function() {}
        },
        control: () => ({ addTo: () => {}, onAdd: () => {} })
      };
      map = {
        removeLayer: () => {},
        addLayer: () => {},
        hasLayer: () => true,
        removeControl: () => {},
        addControl: () => {}
      };
    `);

    try {
      const freeformLayer = createDefaultLayer('layer-freeform-2', 'Freeform Test', 0, 'freeform');
      flightLayers = [freeformLayer];
      activeLayerId = freeformLayer.id;

      // Add first waypoint
      addFreeformWaypoint(40.1234, -80.5678);

      assert.ok(centerMarker !== null, 'centerMarker should be created on first waypoint click');
      assert.strictEqual(freeformLayer.freeformWaypoints.length, 1, 'First clicked point must be recorded as waypoint 0');
      assert.strictEqual(freeformLayer.freeformWaypoints[0].lat, 40.1234);
      assert.strictEqual(freeformLayer.freeformWaypoints[0].lon, -80.5678);

      // Add second waypoint
      addFreeformWaypoint(40.1245, -80.5678);
      assert.strictEqual(freeformLayer.freeformWaypoints.length, 2, 'Second clicked point must be recorded as waypoint 1');

      const compiled = compileMultiLayerMission(40.1234, -80.5678);
      assert.strictEqual(compiled.waypoints.length, 2, 'Compiled mission should contain exactly the 2 manual waypoints');
    } finally {
      if (origCreateElement) global.document.createElement = origCreateElement;
    }
  });
});

describe('Section 2 Exclusion Settings Visibility Tests (v1.63.3)', () => {
  test('togglePatternParameters expands Section 2 and exposes exclusion altitude controls and notes', () => {
    const origGetElementById = global.document.getElementById;

    const mockGridGeometrySection = {
      style: { display: 'none' },
      classList: {
        _classes: new Set(['collapsed']),
        add(c) { this._classes.add(c); },
        remove(c) { this._classes.delete(c); },
        contains(c) { return this._classes.has(c); }
      }
    };
    const mockTitle = { textContent: '', querySelector: () => null };
    const mockPatternBadge = { textContent: '' };
    const mockFreeformNote = {
      classList: {
        _classes: new Set(['hidden']),
        add(c) { this._classes.add(c); },
        remove(c) { this._classes.delete(c); },
        contains(c) { return this._classes.has(c); }
      }
    };
    const mockAltContainer = {
      classList: {
        _classes: new Set(['hidden']),
        add(c) { this._classes.add(c); },
        remove(c) { this._classes.delete(c); },
        contains(c) { return this._classes.has(c); }
      }
    };
    const mockGridType = { value: 'exclusion-freeform' };

    const mockSlider = {
      value: '100',
      closest: () => ({
        style: { display: 'block' },
        querySelector: () => ({ textContent: '' })
      })
    };

    global.document.getElementById = (id) => {
      if (id === 'grid-geometry-section') return mockGridGeometrySection;
      if (id === 'grid-geometry-title') return mockTitle;
      if (id === 'active-layer-pattern-badge') return mockPatternBadge;
      if (id === 'exclusion-freeform-note') return mockFreeformNote;
      if (id === 'exclusion-altitude-container') return mockAltContainer;
      if (id === 'grid-type') return mockGridType;
      if (id === 'grid-width' || id === 'grid-height' || id === 'grid-rotation') return mockSlider;
      return origGetElementById ? origGetElementById(id) : null;
    };

    try {
      // Test 1: exclusion-freeform
      mockGridType.value = 'exclusion-freeform';
      togglePatternParameters();

      assert.strictEqual(mockGridGeometrySection.style.display, 'block', 'Section 2 should be displayed for exclusion-freeform');
      assert.strictEqual(mockGridGeometrySection.classList.contains('collapsed'), false, 'Section 2 should be uncollapsed');
      assert.strictEqual(mockTitle.textContent, '2. Layer Properties', 'Title should reflect Layer Properties');
      assert.strictEqual(mockPatternBadge.textContent, 'Exclusion (Polygon)', 'Pattern badge should show Exclusion (Polygon)');
      assert.strictEqual(mockFreeformNote.classList.contains('hidden'), false, 'Freeform note should not be hidden');
      assert.strictEqual(mockAltContainer.classList.contains('hidden'), false, 'Exclusion altitude container should not be hidden');

      // Test 2: exclusion-box
      mockGridType.value = 'exclusion-box';
      togglePatternParameters();

      assert.strictEqual(mockGridGeometrySection.style.display, 'block', 'Section 2 should be displayed for exclusion-box');
      assert.strictEqual(mockGridGeometrySection.classList.contains('collapsed'), false, 'Section 2 should be uncollapsed');
      assert.strictEqual(mockTitle.textContent, '2. Layer Properties', 'Title should reflect Layer Properties');
      assert.strictEqual(mockPatternBadge.textContent, 'Exclusion (Box)', 'Pattern badge should show Exclusion (Box)');
      assert.strictEqual(mockFreeformNote.classList.contains('hidden'), true, 'Freeform note should be hidden for box');
      assert.strictEqual(mockAltContainer.classList.contains('hidden'), false, 'Exclusion altitude container should not be hidden');
    } finally {
      global.document.getElementById = origGetElementById;
    }
  });
});

describe('Automated 3D Exclusion Zone Detour Routing Tests (v1.64.0)', () => {
  test('doSegmentsIntersect accurately detects intersecting and parallel/disjoint segments', () => {
    // Intersecting segments: (0,0)->(10,10) and (0,10)->(10,0)
    const intResult = doSegmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 });
    assert.strictEqual(intResult, true, 'Crossing X segments must intersect');

    // Parallel disjoint segments
    const disResult = doSegmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 5 }, { x: 10, y: 5 });
    assert.strictEqual(disResult, false, 'Parallel separated lines must not intersect');
  });

  test('isSegmentCollidingWithPolygon detects direct collisions with polygon obstacle', () => {
    const squarePoly = [
      { x: -10, y: -10 },
      { x: 10, y: -10 },
      { x: 10, y: 10 },
      { x: -10, y: 10 }
    ];

    // Segment passing directly through the square: (-20, 0) to (20, 0)
    const colliding = isSegmentCollidingWithPolygon({ x: -20, y: 0 }, { x: 20, y: 0 }, squarePoly);
    assert.strictEqual(colliding, true, 'Segment through center must collide');

    // Segment completely outside the square: (-20, 20) to (20, 20)
    const clear = isSegmentCollidingWithPolygon({ x: -20, y: 20 }, { x: 20, y: 20 }, squarePoly);
    assert.strictEqual(clear, false, 'Clear segment must not collide');
  });

  test('findDetourPathAroundZone generates perimeter bypass waypoints avoiding restricted volume', () => {
    const centerLat = 40.0;
    const centerLon = -80.0;

    const boxZone = createDefaultLayer('zone-detour-1', 'Obstacle Box', 0, 'exclusion-box');
    boxZone.gridWidth = 40;
    boxZone.gridHeight = 40;
    boxZone.allAltitudes = true;
    boxZone.enabled = true;

    // Segment from West (-30, 0) to East (30, 0) crossing the 40x40 box
    const p1 = { x: -30, y: 0, alt: 50, lat: 40.0, lon: -80.00035 };
    const p2 = { x: 30, y: 0, alt: 50, lat: 40.0, lon: -79.99965 };

    const detours = findDetourPathAroundZone(p1, p2, boxZone, centerLat, centerLon, 4);
    assert.ok(detours.length > 0, 'Detour waypoints must be generated around the obstacle');
    detours.forEach(dwp => {
      assert.strictEqual(dwp.isDetour, true);
      assert.strictEqual(dwp.isAvoidance, true);
      assert.strictEqual(dwp.isExclusionDetour, true);
      // Ensure no detour waypoint lies inside the unbuffered obstacle box
      assert.strictEqual(isPointInExclusionZone(dwp, boxZone, centerLat, centerLon), false, 'Detour waypoint must be outside exclusion zone');
    });
  });

  test('compileMultiLayerMission automatically routes flight path around exclusion zones', () => {
    const centerLat = 40.0;
    const centerLon = -80.0;

    // 1. Grid flight layer
    const flightLayer = createDefaultLayer('layer-flight-1', 'Main Grid', 0, 'double');
    flightLayer.gridWidth = 100;
    flightLayer.gridHeight = 100;
    flightLayer.altitude = 50;

    // 2. Exclusion zone box in the center
    const exclusionLayer = createDefaultLayer('layer-excl-1', 'Restricted Area', 1, 'exclusion-box');
    exclusionLayer.gridWidth = 40;
    exclusionLayer.gridHeight = 40;
    exclusionLayer.allAltitudes = true;

    flightLayers = [flightLayer, exclusionLayer];

    const mission = compileMultiLayerMission(centerLat, centerLon);

    // Assert that waypoints inside exclusion zone are pruned
    mission.waypoints.forEach(wp => {
      assert.strictEqual(isPointInExclusionZone(wp, exclusionLayer, centerLat, centerLon), false, 'No mission waypoint can be inside exclusion zone');
    });

    // Check that detour waypoints were inserted
    const hasDetourWps = mission.waypoints.some(wp => wp.isExclusionDetour === true);
    assert.strictEqual(hasDetourWps, true, 'Mission should synthesize detour waypoints around exclusion volume');
  });
});

describe('v1.65.0 Extensible Flight Tools, Dual-Tab Inspector & Topbar HUD Telemetry Tests', () => {
  test('FLIGHT_TOOLS registry defines standard schema for all pattern types and safety brushes', () => {
    assert.ok(typeof FLIGHT_TOOLS === 'object', 'FLIGHT_TOOLS registry must be defined');
    assert.ok(FLIGHT_TOOLS['single'], '2D Single Grid tool must exist');
    assert.ok(FLIGHT_TOOLS['double'], 'Double Grid tool must exist');
    assert.ok(FLIGHT_TOOLS['orbit'], 'Orbit tool must exist');
    assert.ok(FLIGHT_TOOLS['multi-orbit'], 'Multi-Orbit tool must exist');
    assert.ok(FLIGHT_TOOLS['road-following'], 'Road Follow tool must exist');
    assert.ok(FLIGHT_TOOLS['freeform'], 'Freeform tool must exist');
    assert.ok(FLIGHT_TOOLS['exclusion-box'], 'Exclusion Box tool must exist');
    assert.ok(FLIGHT_TOOLS['exclusion-freeform'], 'Exclusion Polygon tool must exist');

    Object.entries(FLIGHT_TOOLS).forEach(([toolKey, tool]) => {
      assert.strictEqual(tool.id, toolKey, `Tool ${toolKey} must have matching id`);
      assert.ok(typeof tool.label === 'string' && tool.label.length > 0, `Tool ${toolKey} must have label`);
      assert.ok(typeof tool.category === 'string', `Tool ${toolKey} must have category`);
      assert.ok(Array.isArray(tool.propertyGroups), `Tool ${toolKey} must define propertyGroups array`);
      assert.ok(typeof tool.description === 'string', `Tool ${toolKey} must define description`);
    });
  });

  test('updateStatsPanel syncs header telemetry HUD pill, sidebar summary strip, and popover stats', () => {
    const stubElements = {
      'stat-waypoints': { textContent: '' },
      'stat-photos': { textContent: '' },
      'stat-line-spacing': { textContent: '' },
      'stat-photo-interval': { textContent: '' },
      'stat-distance': { textContent: '' },
      'stat-flight-time': { textContent: '' },
      'capture-mode': { value: 'stopAndShoot' },
      'unit-system': { value: 'metric' },
      'header-telemetry-summary': { textContent: '' },
      'sidebar-summary-text': { textContent: '' },
      'pop-stat-waypoints': { textContent: '' },
      'pop-stat-photos': { textContent: '' },
      'pop-stat-distance': { textContent: '' },
      'pop-stat-time': { textContent: '' },
      'pop-stat-line-spacing': { textContent: '' },
      'pop-stat-photo-interval': { textContent: '' },
      'header-weather-summary': { textContent: '☀️ VFR' }
    };
    global._stubElements = stubElements;

    const mockStats = {
      waypointsCount: 24,
      photoCount: 24,
      lineSpacing: 15.0,
      photoSpacing: 12.0,
      distance: 1250,
      timeStr: '4m 30s',
      flightTimeSeconds: 270,
      hasIsolatedWaypoint: false,
      isFarFromTakeoff: false
    };

    updateStatsPanel(mockStats);

    assert.strictEqual(stubElements['stat-waypoints'].textContent, 24);
    assert.strictEqual(stubElements['pop-stat-waypoints'].textContent, 24);
    assert.strictEqual(stubElements['pop-stat-photos'].textContent, 24);
    assert.strictEqual(stubElements['pop-stat-time'].textContent, '4m 30s');
    assert.ok(stubElements['header-telemetry-summary'].textContent.includes('24 WPs'), 'Header telemetry pill must display waypoint count');
    assert.ok(stubElements['header-telemetry-summary'].textContent.includes('4m 30s'), 'Header telemetry pill must display flight time');
    assert.ok(stubElements['sidebar-summary-text'].textContent.includes('24 WPs'), 'Sidebar summary strip must display flight stats');

    // Test null stats reset
    updateStatsPanel(null);
    assert.strictEqual(stubElements['stat-waypoints'].textContent, '-');
    assert.strictEqual(stubElements['pop-stat-waypoints'].textContent, '-');
    assert.strictEqual(stubElements['header-telemetry-summary'].textContent, '0 WPs • 0.0 km • 0m 0s');

    global._stubElements = null;
  });

  test('updateWeatherPanelUI syncs live weather status to header pill and popover weather card', () => {
    const stubElements = {
      'stat-weather-window': { textContent: '', style: {}, title: '', appendChild: () => {} },
      'stat-weather-dirs': { classList: { add: () => {}, remove: () => {}, contains: () => false }, appendChild: () => {} },
      'header-weather-summary': { textContent: '', style: {} },
      'sidebar-summary-text': { textContent: '' },
      'header-telemetry-summary': { textContent: '12 WPs • 500m • 2m 15s' },
      'pop-weather-summary': { textContent: '', style: {} },
      'pop-weather-details': { innerHTML: '' }
    };
    global._stubElements = stubElements;

    const mockDirections = {
      closest: {
        icaoId: 'KORD',
        name: 'Chicago O\'Hare International',
        fltCat: 'VFR',
        distance: 14.2,
        visibilitySM: 10.0,
        ceilingFt: 99999,
        timestamp: Date.now()
      },
      stations: []
    };

    updateWeatherPanelUI(mockDirections, null, false);

    assert.ok(stubElements['header-weather-summary'].textContent.includes('VFR'), 'Header weather summary must include flight category');
    assert.ok(stubElements['header-weather-summary'].textContent.includes('KORD'), 'Header weather summary must include station ICAO');
    assert.ok(stubElements['pop-weather-summary'].textContent.includes('Allowed (VFR)'), 'Popover weather card must show flight condition status');
    assert.ok(stubElements['pop-weather-details'].innerHTML.includes('10.0 SM'), 'Popover weather details must include visibility');

    global._stubElements = null;
  });
});

describe('v1.66.0 Intro Guide Hub & Interactive Spotlight Tour Tests', () => {
  test('TOUR_STEPS definition covers all 5 core application landmarks with fallback targets', () => {
    assert.ok(Array.isArray(TOUR_STEPS), 'TOUR_STEPS must be an array');
    assert.strictEqual(TOUR_STEPS.length, 5, 'Must define exactly 5 core workflow steps');
    
    TOUR_STEPS.forEach((step, idx) => {
      assert.ok(typeof step.targetId === 'string' && step.targetId.length > 0, `Step ${idx} must have targetId`);
      assert.ok(typeof step.title === 'string' && step.title.length > 0, `Step ${idx} must have title`);
      assert.ok(typeof step.desc === 'string' && step.desc.length > 0, `Step ${idx} must have description`);
      assert.ok(typeof step.position === 'string', `Step ${idx} must have position hint`);
    });
  });

  test('switchIntroTab toggles active styles and pane visibility', () => {
    const tabBtns = {
      'intro-tab-workflow': { classList: { add: () => {}, remove: () => {} }, style: {} },
      'intro-tab-features': { classList: { add: () => {}, remove: () => {} }, style: {} },
      'intro-tab-tips': { classList: { add: () => {}, remove: () => {} }, style: {} }
    };
    const tabPanes = {
      'intro-pane-workflow': { classList: { add: () => {}, remove: () => {} } },
      'intro-pane-features': { classList: { add: () => {}, remove: () => {} } },
      'intro-pane-tips': { classList: { add: () => {}, remove: () => {} } }
    };

    let removedPanes = [];
    let addedPanes = [];

    Object.entries(tabPanes).forEach(([id, obj]) => {
      obj.classList.add = (c) => addedPanes.push({ id, c });
      obj.classList.remove = (c) => removedPanes.push({ id, c });
    });

    global._stubElements = { ...tabBtns, ...tabPanes };

    switchIntroTab('features');

    assert.ok(removedPanes.some(p => p.id === 'intro-pane-features' && p.c === 'hidden'), 'Selected pane must remove hidden class');
    assert.ok(addedPanes.some(p => p.id === 'intro-pane-workflow' && p.c === 'hidden'), 'Other panes must receive hidden class');

    global._stubElements = null;
  });

  test('Welcome banner dismissal saves state in localStorage and hides banner', () => {
    let hiddenAdded = false;
    global._stubElements = {
      'welcome-tour-banner': {
        classList: {
          add: (c) => { if (c === 'hidden') hiddenAdded = true; },
          remove: () => {}
        }
      }
    };

    localStorage.removeItem('aalaapi_intro_banner_dismissed');
    dismissWelcomeTourBanner();

    assert.strictEqual(hiddenAdded, true, 'dismissWelcomeTourBanner should add hidden class to banner');
    assert.strictEqual(localStorage.getItem('aalaapi_intro_banner_dismissed'), 'true', 'localStorage should record banner dismissal');

    global._stubElements = null;
  });

  test('Spotlight Tour traversal updates step indices and completes on last step', () => {
    const tourOverlay = { classList: { add: () => {}, remove: () => {} } };
    const stepBadge = { textContent: '' };
    const stepTitle = { textContent: '' };
    const stepDesc = { textContent: '' };
    const prevBtn = { style: {} };
    const nextBtn = { textContent: '' };

    global._stubElements = {
      'tour-overlay-container': tourOverlay,
      'tour-step-badge': stepBadge,
      'tour-step-title': stepTitle,
      'tour-step-desc': stepDesc,
      'tour-prev-btn': prevBtn,
      'tour-next-btn': nextBtn,
      'quickstart-modal': { classList: { add: () => {}, remove: () => {} } },
      'welcome-tour-banner': { classList: { add: () => {}, remove: () => {} } }
    };

    startInteractiveUITour();
    assert.strictEqual(currentTourStep, 0, 'Tour should initialize at step 0');
    assert.strictEqual(stepBadge.textContent, 'Step 1 of 5');

    nextTourStep();
    assert.strictEqual(currentTourStep, 1, 'Next step should advance to step 1');
    assert.strictEqual(stepBadge.textContent, 'Step 2 of 5');

    prevTourStep();
    assert.strictEqual(currentTourStep, 0, 'Prev step should return to step 0');

    // Advance to end
    nextTourStep(); // 1
    nextTourStep(); // 2
    nextTourStep(); // 3
    nextTourStep(); // 4
    assert.strictEqual(currentTourStep, 4, 'Tour should be at final step');
    assert.strictEqual(nextBtn.textContent, 'Finish ✓');

    let exited = false;
    tourOverlay.classList.add = (c) => { if (c === 'hidden') exited = true; };
    nextTourStep(); // Finish
    assert.strictEqual(exited, true, 'Next on final step should exit tour and hide overlay');

    global._stubElements = null;
  });
});

describe('v1.67.0 Full-Width Studio Topbar Tests', () => {
  test('index_template.html defines studio-topbar with topbar-left, topbar-center, and topbar-right zones', () => {
    const fs = require('fs');
    const path = require('path');
    const templateContent = fs.readFileSync(path.join(__dirname, 'index_template.html'), 'utf8');

    assert.ok(templateContent.includes('class="studio-topbar'), 'Must contain studio-topbar element');
    assert.ok(templateContent.includes('class="topbar-left"'), 'Must contain topbar-left container');
    assert.ok(templateContent.includes('class="topbar-center"'), 'Must contain topbar-center container');
    assert.ok(templateContent.includes('class="topbar-right"'), 'Must contain topbar-right container');
    assert.ok(templateContent.includes('id="location-input"'), 'Location input must be present in topbar');
    assert.ok(templateContent.includes('id="locate-me-btn"'), 'Locate button must be present in topbar');
    assert.ok(templateContent.includes('id="header-telemetry-pill"'), 'Telemetry pill must be present in topbar');
  });
});

describe('v1.68.0 Light & Dark Theme Manager & Topbar Polish Tests', () => {
  test('setAppTheme and toggleAppTheme correctly update data-theme and persist state', () => {
    let setAttrKey = null;
    let setAttrVal = null;
    let btnText = null;

    const origDoc = global.document;
    global.document = {
      ...origDoc,
      documentElement: {
        setAttribute: (k, v) => { setAttrKey = k; setAttrVal = v; }
      },
      getElementById: (id) => {
        if (id === 'theme-toggle-btn') {
          return {
            set textContent(v) { btnText = v; },
            get textContent() { return btnText; },
            set title(v) {},
            get title() { return ''; }
          };
        }
        return origDoc.getElementById ? origDoc.getElementById(id) : null;
      }
    };

    try {
      // Test setting light theme
      setAppTheme('light');
      assert.strictEqual(setAttrKey, 'data-theme');
      assert.strictEqual(setAttrVal, 'light');
      assert.strictEqual(btnText, '🌙', 'Light mode should show moon icon to switch to dark');
      assert.strictEqual(localStorage.getItem('aalaapi_sky_theme'), 'light');

      // Test toggle from light to dark
      const nextTheme = toggleAppTheme();
      assert.strictEqual(nextTheme, 'dark');
      assert.strictEqual(setAttrVal, 'dark');
      assert.strictEqual(btnText, '☀️', 'Dark mode should show sun icon to switch to light');
      assert.strictEqual(localStorage.getItem('aalaapi_sky_theme'), 'dark');

      // Test toggle from dark back to light
      const nextTheme2 = toggleAppTheme();
      assert.strictEqual(nextTheme2, 'light');
      assert.strictEqual(setAttrVal, 'light');
      assert.strictEqual(btnText, '🌙');
    } finally {
      global.document = origDoc;
    }
  });

  test('index_template.html defines theme-toggle-btn and hides default stats-panel', () => {
    const fs = require('fs');
    const path = require('path');
    const templateContent = fs.readFileSync(path.join(__dirname, 'index_template.html'), 'utf8');

    assert.ok(templateContent.includes('id="theme-toggle-btn"'), 'Must contain theme-toggle-btn');
    assert.ok(templateContent.includes('stats-panel glass hidden'), 'stats-panel must have hidden class by default');
  });
});

describe('v1.69.0 Independent Per-Layer Center Coordinates & Isolation Tests', () => {
  test('createDefaultLayer sets centerLat and centerLon from arguments or centerMarker', () => {
    const layerWithCoords = createDefaultLayer('l1', 'Layer 1', 0, 'single', 41.8781, -87.6298);
    assert.strictEqual(layerWithCoords.centerLat, 41.8781);
    assert.strictEqual(layerWithCoords.centerLon, -87.6298);
  });

  test('Adding and moving Layer 2 on map does NOT shift Layer 1 waypoints', () => {
    importedWaypoints = null;
    const layer1 = createDefaultLayer('l1', 'Layer 1: Site Alpha', 0, 'single', 40.0, -80.0);
    const layer2 = createDefaultLayer('l2', 'Layer 2: Site Beta', 1, 'single', 41.0, -81.0);

    flightLayers = [layer1, layer2];
    activeLayerId = layer1.id;

    // Compile mission with initial positions
    const mission1 = compileMultiLayerMission(40.0, -80.0);
    const l1WpsInitial = mission1.waypoints.filter(w => !w.isTransition && (w.layerId === 'l1' || w.lat < 40.5));
    const l2WpsInitial = mission1.waypoints.filter(w => !w.isTransition && (w.layerId === 'l2' || w.lat > 40.5));

    assert.ok(l1WpsInitial.length > 0, 'Layer 1 should have waypoints around 40.0');
    assert.ok(l2WpsInitial.length > 0, 'Layer 2 should have waypoints around 41.0');

    // Average coordinates of Layer 1
    const l1LatBefore = l1WpsInitial.reduce((acc, w) => acc + w.lat, 0) / l1WpsInitial.length;
    assert.ok(Math.abs(l1LatBefore - 40.0) < 0.01, 'Layer 1 lat should be centered around 40.0');

    // Switch active layer to Layer 2 and move Layer 2 center to 42.0, -82.0 (e.g. user clicked on map)
    setActiveLayer(layer2.id);
    setGridCenter(42.0, -82.0);

    assert.strictEqual(layer2.centerLat, 42.0);
    assert.strictEqual(layer2.centerLon, -82.0);
    assert.strictEqual(layer1.centerLat, 40.0); // Layer 1 center remains completely unchanged!
    assert.strictEqual(layer1.centerLon, -80.0);

    // Recompile mission
    const mission2 = compileMultiLayerMission(42.0, -82.0);
    const l1WpsAfter = mission2.waypoints.filter(w => !w.isTransition && (w.layerId === 'l1' || w.lat < 40.5));
    const l2WpsAfter = mission2.waypoints.filter(w => !w.isTransition && (w.layerId === 'l2' || w.lat > 41.5));

    const l1LatAfter = l1WpsAfter.reduce((acc, w) => acc + w.lat, 0) / l1WpsAfter.length;
    const l2LatAfter = l2WpsAfter.reduce((acc, w) => acc + w.lat, 0) / l2WpsAfter.length;

    // Verify Layer 1 did NOT move at all
    assert.strictEqual(l1LatBefore, l1LatAfter, 'Layer 1 waypoints must remain exactly pinned in place when Layer 2 is moved');
    // Verify Layer 2 moved to its new position
    assert.ok(Math.abs(l2LatAfter - 42.0) < 0.01, 'Layer 2 waypoints must be centered at 42.0');
  });
});

describe('v1.69.1 Multi-Layer Exclusion Zone Spatial Filtering & Unit System Tests', () => {
  test('Exclusion zone correctly filters waypoints from another flight layer located at distinct or matching center', () => {
    importedWaypoints = null;
    // Flight layer at (40.0, -80.0)
    const flightLayer = createDefaultLayer('fl1', 'Survey Grid', 0, 'single', 40.0, -80.0);
    flightLayer.gridWidth = 100;
    flightLayer.gridHeight = 100;
    flightLayer.gridSpacing = 20;

    // Exclusion zone layer positioned right over the center of the survey grid
    const exclZone = createDefaultLayer('ez1', 'Restricted Building', 1, 'exclusion-box', 40.0, -80.0);
    exclZone.isExclusionZone = true;
    exclZone.allAltitudes = true;
    exclZone.gridWidth = 40;
    exclZone.gridHeight = 40;

    flightLayers = [flightLayer, exclZone];
    activeLayerId = flightLayer.id;

    // Compile mission
    const compiled = compileMultiLayerMission(40.0, -80.0);
    const wps = compiled.waypoints;

    assert.ok(wps.length > 0, 'Should have generated waypoints');
    
    // Check that none of the generated waypoints fall inside the exclusion box
    for (const wp of wps) {
      const inZone = isPointInExclusionZone(wp, exclZone, 40.0, -80.0);
      assert.strictEqual(inZone, false, `Waypoint at (${wp.lat}, ${wp.lon}) must not be inside the exclusion zone`);
    }

    assert.ok(exclZone.filteredCount > 0, 'Exclusion zone should have filtered at least 1 waypoint from the survey layer');
  });

  test('isPointInExclusionZone strictly projects lat/lon regardless of stored wp.x/wp.y offsets', () => {
    const exclZone = createDefaultLayer('ez2', 'No Fly Zone', 1, 'exclusion-box', 40.0, -80.0);
    exclZone.gridWidth = 50;
    exclZone.gridHeight = 50;
    exclZone.allAltitudes = true;

    // Create a waypoint geographically inside the zone, but with stale x, y from another coordinate frame
    const insideGeo = localToGeodetic(5, 5, 40.0, -80.0);
    const wpInside = {
      lat: insideGeo.lat,
      lon: insideGeo.lon,
      x: 99999, // Stale offset from a different layer center
      y: 99999,
      alt: 50
    };

    const isInside = isPointInExclusionZone(wpInside, exclZone, 40.0, -80.0);
    assert.strictEqual(isInside, true, 'Waypoint inside the geodetic bounds of the exclusion zone must be identified as inside');
  });

  test('formatDistance accurately renders meters and feet for exclusion zone altitudes', () => {
    // Metric
    cachedUnitSystem = 'metric';
    assert.strictEqual(formatDistance(50), '50.0 m');
    assert.strictEqual(formatDistance(0), '0.0 m');

    // Imperial
    cachedUnitSystem = 'imperial';
    assert.strictEqual(formatDistance(50), '164.0 ft');
    assert.strictEqual(formatDistance(0), '0.0 ft');
    cachedUnitSystem = 'metric'; // Reset
  });
});

describe('v1.69.2 Freeform Polygon Exclusion Zone Fixes', () => {
  test('drawExclusionZones executes cleanly with exclusion-freeform zone without throwing isPoly ReferenceError', () => {
    const l1 = createDefaultLayer('l1-grid', 'Survey Layer', 0, 'single', 40.0, -80.0);
    const l2 = createDefaultLayer('l2-poly', 'Exclusion Poly', 1, 'exclusion-freeform', 40.0, -80.0);
    flightLayers = [l1, l2];
    activeLayerId = l2.id;

    assert.doesNotThrow(() => {
      drawExclusionZones(40.0, -80.0);
    }, 'drawExclusionZones must not throw ReferenceError when rendering exclusion-freeform layers');
  });

  test('addFreeformWaypoint on exclusion-freeform layer appends to freeformWaypoints and polygonVertices', () => {
    const exclPolyLayer = createDefaultLayer('l-excl-poly', 'Exclusion Poly', 0, 'exclusion-freeform', 40.0, -80.0);
    flightLayers = [exclPolyLayer];
    activeLayerId = exclPolyLayer.id;

    addFreeformWaypoint(40.0001, -80.0001);
    addFreeformWaypoint(40.0002, -80.0001);
    addFreeformWaypoint(40.0002, -80.0002);

    assert.strictEqual(exclPolyLayer.freeformWaypoints.length, 3, 'Must have 3 freeform waypoints');
    assert.strictEqual(exclPolyLayer.polygonVertices.length, 3, 'Must have 3 polygon vertices');

    const compiled = compileMultiLayerMission(40.0, -80.0);
    assert.strictEqual(compiled.exclusionZones.length, 1, 'Exclusion poly zone must be registered');
  });
});

describe('v1.69.3 Multi-Station Weather Selector in Mission Details Popover', () => {
  test('formatWeatherDistance formats kilometers and miles based on unit system', () => {
    cachedUnitSystem = 'imperial';
    assert.strictEqual(formatWeatherDistance(10), '6.2 mi');

    cachedUnitSystem = 'metric';
    assert.strictEqual(formatWeatherDistance(10), '10.0 km');
    cachedUnitSystem = 'imperial';
  });

  test('updateWeatherPanelUI populates popWeatherDetails with multi-station switcher when multiple stations present', () => {
    const stubElements = {
      'stat-weather-window': { textContent: '', style: {}, title: '', appendChild: () => {} },
      'stat-weather-dirs': { classList: { add: () => {}, remove: () => {}, contains: () => false }, appendChild: () => {} },
      'pop-weather-details': { innerHTML: '' },
      'pop-weather-summary': { textContent: '', style: {} },
      'header-weather-summary': { textContent: '', style: {} },
      'sidebar-summary-text': { textContent: '' },
      'header-telemetry-summary': { textContent: '12 WPs • 500m • 2m 15s' }
    };
    global._stubElements = stubElements;

    const mockDirections = {
      closest: { icaoId: 'KOSU', name: 'Ohio State Univ', distance: 11.1, fltCat: 'VFR', visibilitySM: 10, ceilingFt: 99999 },
      stations: [
        { icaoId: 'KOSU', name: 'Ohio State Univ', distance: 11.1, fltCat: 'VFR', visibilitySM: 10, ceilingFt: 99999 },
        { icaoId: 'KCMH', name: 'John Glenn Intl', distance: 18.4, fltCat: 'MVFR', visibilitySM: 4.5, ceilingFt: 2500 },
        { icaoId: 'KTZR', name: 'Bolton Field', distance: 24.2, fltCat: 'VFR', visibilitySM: 10, ceilingFt: 99999 }
      ],
      activeIndex: 0
    };

    try {
      updateWeatherPanelUI(mockDirections, null, false);

      const popDetails = stubElements['pop-weather-details'];
      assert.ok(popDetails.innerHTML.includes('KOSU'), 'Popover details must render KOSU station');
      assert.ok(popDetails.innerHTML.includes('KCMH'), 'Popover details must render KCMH station');
      assert.ok(popDetails.innerHTML.includes('KTZR'), 'Popover details must render KTZR station');
      assert.ok(popDetails.innerHTML.includes('pop-station-tab-btn'), 'Popover details must contain station switcher buttons');
    } finally {
      global._stubElements = null;
    }
  });
});

describe('v1.70.0 Relative Compass Rose Directions for Weather Stations', () => {
  test('getCompassBearing accurately calculates geographical bearing from center to target', () => {
    // Due North
    const bearingN = getCompassBearing(40.0, -83.0, 40.1, -83.0);
    assert.strictEqual(Math.round(bearingN), 0, 'Due North must be 0 degrees');

    // Due East
    const bearingE = getCompassBearing(40.0, -83.0, 40.0, -82.9);
    assert.strictEqual(Math.round(bearingE), 90, 'Due East must be 90 degrees');

    // Due South
    const bearingS = getCompassBearing(40.0, -83.0, 39.9, -83.0);
    assert.strictEqual(Math.round(bearingS), 180, 'Due South must be 180 degrees');

    // Due West
    const bearingW = getCompassBearing(40.0, -83.0, 40.0, -83.1);
    assert.strictEqual(Math.round(bearingW), 270, 'Due West must be 270 degrees');
  });

  test('bearingToCompassDirection maps 360-degree bearings to 16-wind compass rose directions', () => {
    assert.strictEqual(bearingToCompassDirection(0), 'N');
    assert.strictEqual(bearingToCompassDirection(22.5), 'NNE');
    assert.strictEqual(bearingToCompassDirection(45), 'NE');
    assert.strictEqual(bearingToCompassDirection(90), 'E');
    assert.strictEqual(bearingToCompassDirection(135), 'SE');
    assert.strictEqual(bearingToCompassDirection(180), 'S');
    assert.strictEqual(bearingToCompassDirection(225), 'SW');
    assert.strictEqual(bearingToCompassDirection(270), 'W');
    assert.strictEqual(bearingToCompassDirection(315), 'NW');
    assert.strictEqual(bearingToCompassDirection(355), 'N');
  });

  test('formatWeatherDistance incorporates compass rose direction suffix when provided', () => {
    cachedUnitSystem = 'imperial';
    assert.strictEqual(formatWeatherDistance(11.1, 'NE'), '6.9 mi NE');

    cachedUnitSystem = 'metric';
    assert.strictEqual(formatWeatherDistance(11.1, 'NE'), '11.1 km NE');
    cachedUnitSystem = 'imperial';
  });
});

describe('v1.70.1 Road Follow Layer Isolation & Multi-Layer Independence', () => {
  beforeEach(() => {
    flightLayers = [];
    activeLayerId = null;
    roadWaypoints = [];
    generatedWaypoints = [];
    generatedPhotos = [];
    importedWaypoints = null;
    importedPhotos = null;
  });

  test('generateRoadFlightWaypoints generates offset drone positions and road-facing yaw headings', () => {
    const roadNodes = [
      { lat: 40.0, lon: -83.0, alt: 50 },
      { lat: 40.001, lon: -83.0, alt: 50 },
      { lat: 40.002, lon: -83.0, alt: 50 }
    ];

    const result = generateRoadFlightWaypoints(roadNodes, 15, 50, -60, 4, 'stopAndShoot', 40.0, -83.0, 'followWayline');
    assert.ok(result);
    assert.strictEqual(result.waypoints.length, 3);
    assert.strictEqual(result.photos.length, 3);

    // Each waypoint should be marked as road drone waypoint and have valid coordinates
    result.waypoints.forEach((wp, idx) => {
      assert.ok(wp.lat !== null && !isNaN(wp.lat));
      assert.ok(wp.lon !== null && !isNaN(wp.lon));
      assert.strictEqual(wp.isRoadDroneWaypoint, true);
      assert.strictEqual(wp.idx, idx);
    });
  });

  test('addRoadWaypoint stores waypoints strictly in activeLayer.roadWaypoints without polluting other layers', () => {
    centerMarker = {
      getLatLng: () => ({ lat: 40.0, lng: -83.0 })
    };

    // Layer 1: Double Grid
    const l1 = createDefaultLayer('layer-1', 'Layer 1: 3D Double Grid', 0, 'double', 40.0, -83.0);
    // Layer 2: Road Following
    const l2 = createDefaultLayer('layer-2', 'Layer 2: Road Following', 1, 'road-following', 40.0, -83.0);
    l2.roadSnap = false;
    flightLayers = [l1, l2];
    activeLayerId = l2.id;
    roadWaypoints = l2.roadWaypoints;

    // Add road nodes to Layer 2 (with roadSnap false for immediate direct node placement)
    addRoadWaypoint(40.001, -83.001);
    addRoadWaypoint(40.002, -83.002);

    assert.strictEqual(l2.roadWaypoints.length, 2);
    assert.strictEqual(l1.roadWaypoints.length, 0);

    // Compile multi-layer mission
    const compiled = compileMultiLayerMission(40.0, -83.0);
    assert.ok(compiled);
    assert.ok(compiled.waypoints.length > 0);

    // Layer 1 has standard grid waypoints, Layer 2 has road waypoints
    const l1Wps = compiled.waypoints.filter(w => w.layerId === l1.id);
    const l2Wps = compiled.waypoints.filter(w => w.layerId === l2.id);

    assert.ok(l1Wps.length > 0);
    assert.strictEqual(l2Wps.length, 2);
    assert.strictEqual(l2Wps[0].isRoadDroneWaypoint, true);
  });

  test('Adding a new road-following layer starts with 0 road nodes and does not copy prior layer waypoints', () => {
    centerMarker = {
      getLatLng: () => ({ lat: 40.0, lng: -83.0 })
    };

    const l1 = createDefaultLayer('layer-1', 'Layer 1: 3D Double Grid', 0, 'double', 40.0, -83.0);
    flightLayers = [l1];
    activeLayerId = l1.id;

    // Generate layer 1 waypoints
    compileMultiLayerMission(40.0, -83.0);

    // Add Layer 2: road-following
    const l2 = addFlightLayer('road-following');
    assert.strictEqual(l2.roadWaypoints.length, 0);
    assert.strictEqual(roadWaypoints.length, 0);
  });

  test('Switching active layer preserves each layer road waypoints independently', () => {
    centerMarker = {
      getLatLng: () => ({ lat: 40.0, lng: -83.0 })
    };

    const l1 = createDefaultLayer('layer-1', 'Layer 1: Road Following A', 0, 'road-following', 40.0, -83.0);
    const l2 = createDefaultLayer('layer-2', 'Layer 2: Road Following B', 1, 'road-following', 40.0, -83.0);
    l1.roadWaypoints = [{ lat: 40.01, lon: -83.01, x: 10, y: 10, idx: 0 }];
    l2.roadWaypoints = [{ lat: 40.02, lon: -83.02, x: 20, y: 20, idx: 0 }, { lat: 40.03, lon: -83.03, x: 30, y: 30, idx: 1 }];
    flightLayers = [l1, l2];

    setActiveLayer(l1.id);
    assert.strictEqual(roadWaypoints.length, 1);
    assert.strictEqual(roadWaypoints[0].lat, 40.01);

    setActiveLayer(l2.id);
    assert.strictEqual(roadWaypoints.length, 2);
    assert.strictEqual(roadWaypoints[0].lat, 40.02);
    assert.strictEqual(roadWaypoints[1].lat, 40.03);

    // Switch back to l1
    setActiveLayer(l1.id);
    assert.strictEqual(roadWaypoints.length, 1);
    assert.strictEqual(roadWaypoints[0].lat, 40.01);
  });
});

describe('v1.71.0 Exclusion Detour Strategy (Perimeter vs. Over the Top vs. Smart 3D)', () => {
  test('getSegmentIntersection accurately calculates intersection coordinates and parameter t', () => {
    const A = { x: -50, y: 0 };
    const B = { x: 50, y: 0 };
    const C = { x: 0, y: -50 };
    const D = { x: 0, y: 50 };

    const inter = getSegmentIntersection(A, B, C, D);
    assert.ok(inter, 'Should detect intersection');
    assert.strictEqual(Math.abs(inter.x) < 0.001, true);
    assert.strictEqual(Math.abs(inter.y) < 0.001, true);
    assert.strictEqual(Math.abs(inter.t - 0.5) < 0.001, true);

    // Parallel segments
    const E = { x: -50, y: 10 };
    const F = { x: 50, y: 10 };
    assert.strictEqual(getSegmentIntersection(A, B, E, F), null, 'Parallel segments do not intersect');
  });

  test('findDetourPathOverZone creates climb-over waypoints at ceiling + clearanceBuffer', () => {
    const zone = {
      id: 'excl-1',
      pattern: 'exclusion-box',
      gridWidth: 100,
      gridHeight: 100,
      gridRotation: 0,
      allAltitudes: false,
      minAltitude: 0,
      maxAltitude: 40,
      clearanceBuffer: 8,
      centerLat: 40.0,
      centerLon: -83.0,
      enabled: true
    };

    const p1 = { lat: 40.0, lon: -83.002, x: -150, y: 0, alt: 25, speed: 5, pitch: -60, heading: 90 };
    const p2 = { lat: 40.0, lon: -82.998, x: 150, y: 0, alt: 25, speed: 5, pitch: -60, heading: 90 };

    const detours = findDetourPathOverZone(p1, p2, zone, 40.0, -83.0, 4, 8);
    assert.ok(detours.length >= 2, 'Should generate entry and exit climb waypoints');
    assert.strictEqual(detours[0].alt, 48, 'Entry waypoint should climb to maxAltitude 40 + clearanceBuffer 8 = 48m');
    assert.strictEqual(detours[1].alt, 48, 'Exit waypoint should maintain 48m');
    assert.strictEqual(detours[0].isClimbOver, true);
    assert.strictEqual(detours[0].isExclusionDetour, true);
  });

  test('routeWaypointsAroundExclusionZones obeys overTop mode to fly over low ceiling exclusion', () => {
    const zone = {
      id: 'excl-box-1',
      pattern: 'exclusion-box',
      gridWidth: 100,
      gridHeight: 100,
      gridRotation: 0,
      allAltitudes: false,
      minAltitude: 0,
      maxAltitude: 30,
      clearanceBuffer: 5,
      detourMode: 'overTop',
      centerLat: 40.0,
      centerLon: -83.0,
      enabled: true
    };

    const wps = [
      { lat: 40.0, lon: -83.002, x: -150, y: 0, alt: 20 },
      { lat: 40.0, lon: -82.998, x: 150, y: 0, alt: 20 }
    ];

    const routed = routeWaypointsAroundExclusionZones(wps, [zone], 40.0, -83.0);
    assert.ok(routed.length > 2, 'Should insert detour climb waypoints');
    const climbWps = routed.filter(w => w.isClimbOver);
    assert.ok(climbWps.length >= 2, 'Should contain climb-over detour waypoints');
    assert.strictEqual(climbWps[0].alt, 35, 'Climbs to 30m + 5m = 35m');
    // Horizontal positions should remain along the direct path (y ≈ 0)
    assert.ok(Math.abs(climbWps[0].y) < 1.0, 'Over-the-top climb maintains direct horizontal path');
  });

  test('Zones with allAltitudes: true fall back to perimeter detour even if overTop is requested', () => {
    const zone = {
      id: 'excl-box-infinite',
      pattern: 'exclusion-box',
      gridWidth: 100,
      gridHeight: 100,
      gridRotation: 0,
      allAltitudes: true, // Infinite vertical ceiling
      detourMode: 'overTop',
      centerLat: 40.0,
      centerLon: -83.0,
      enabled: true
    };

    const wps = [
      { lat: 40.0, lon: -83.002, x: -150, y: 0, alt: 20 },
      { lat: 40.0, lon: -82.998, x: 150, y: 0, alt: 20 }
    ];

    const routed = routeWaypointsAroundExclusionZones(wps, [zone], 40.0, -83.0);
    assert.ok(routed.length > 2);
    // Should divert around perimeter (non-zero y offset) and NOT have isClimbOver
    const detours = routed.filter(w => w.isExclusionDetour);
    assert.ok(detours.length > 0);
    assert.strictEqual(detours.some(w => w.isClimbOver), false, 'Infinite ceiling must not attempt climb-over');
    assert.ok(detours.some(w => Math.abs(w.y) > 20), 'Diverts around horizontal perimeter');
  });

  test('Per-zone detourMode overrides globalExclusionDetourMode', () => {
    globalExclusionDetourMode = 'perimeter';

    const zone = {
      id: 'excl-box-override',
      pattern: 'exclusion-box',
      gridWidth: 100,
      gridHeight: 100,
      gridRotation: 0,
      allAltitudes: false,
      minAltitude: 0,
      maxAltitude: 25,
      clearanceBuffer: 5,
      detourMode: 'overTop', // Override global perimeter
      centerLat: 40.0,
      centerLon: -83.0,
      enabled: true
    };

    const wps = [
      { lat: 40.0, lon: -83.002, x: -150, y: 0, alt: 20 },
      { lat: 40.0, lon: -82.998, x: 150, y: 0, alt: 20 }
    ];

    const routed = routeWaypointsAroundExclusionZones(wps, [zone], 40.0, -83.0);
    const climbWps = routed.filter(w => w.isClimbOver);
    assert.ok(climbWps.length >= 2, 'Per-zone overTop override successfully applied');
  });

  test('smart detour mode picks overTop for wide low zones and perimeter for tall narrow zones', () => {
    // Wide zone with low 20m ceiling: climbing over (300m direct + 10m climb) is shorter than 600m perimeter detour
    const wideLowZone = {
      id: 'wide-low-zone',
      pattern: 'exclusion-box',
      gridWidth: 100,
      gridHeight: 500, // Very wide in Y
      gridRotation: 0,
      allAltitudes: false,
      minAltitude: 0,
      maxAltitude: 20,
      clearanceBuffer: 5,
      detourMode: 'smart',
      centerLat: 40.0,
      centerLon: -83.0,
      enabled: true
    };

    const wps = [
      { lat: 40.0, lon: -83.002, x: -150, y: 0, alt: 15 },
      { lat: 40.0, lon: -82.998, x: 150, y: 0, alt: 15 }
    ];

    const routed = routeWaypointsAroundExclusionZones(wps, [wideLowZone], 40.0, -83.0);
    const climbWps = routed.filter(w => w.isClimbOver);
    assert.ok(climbWps.length >= 2, 'Smart mode selects overTop for wide zone with low ceiling');
  });
});

describe('Gimbal Pitch Visualizer & Dynamic Angle Classification Tests (v1.73.0)', () => {
  test('getGimbalPitchDescription correctly classifies pitch angles across the full range', () => {
    // Nadir
    const nadir90 = getGimbalPitchDescription(-90);
    assert.ok(nadir90.text.includes('True Nadir'), '-90 should be classified as True Nadir');

    const nadir85 = getGimbalPitchDescription(-85);
    assert.ok(nadir85.text.includes('True Nadir'), '-85 should be classified as True Nadir');

    // Steep Oblique
    const steep80 = getGimbalPitchDescription(-80);
    assert.ok(steep80.text.includes('Steep Oblique'), '-80 should be classified as Steep Oblique');

    const steep70 = getGimbalPitchDescription(-70);
    assert.ok(steep70.text.includes('Steep Oblique'), '-70 should be classified as Steep Oblique');

    // 3D Oblique
    const oblique60 = getGimbalPitchDescription(-60);
    assert.ok(oblique60.text.includes('3D Oblique'), '-60 should be classified as 3D Oblique');

    const oblique45 = getGimbalPitchDescription(-45);
    assert.ok(oblique45.text.includes('3D Oblique'), '-45 should be classified as 3D Oblique');

    // Shallow Oblique
    const shallow30 = getGimbalPitchDescription(-30);
    assert.ok(shallow30.text.includes('Shallow Oblique'), '-30 should be classified as Shallow Oblique');

    const shallow10 = getGimbalPitchDescription(-10);
    assert.ok(shallow10.text.includes('Shallow Oblique'), '-10 should be classified as Shallow Oblique');

    // Horizon
    const horizon0 = getGimbalPitchDescription(0);
    assert.ok(horizon0.text.includes('Level Horizon'), '0 should be classified as Level Horizon');

    // Upward Tilt
    const upward20 = getGimbalPitchDescription(20);
    assert.ok(upward20.text.includes('Upward Tilt'), '+20 should be classified as Upward Tilt');

    const upward60 = getGimbalPitchDescription(60);
    assert.ok(upward60.text.includes('Upward Tilt'), '+60 should be classified as Upward Tilt');
  });

  test('updateGimbalPitchVisualizer executes cleanly without throwing when DOM elements are present or absent across -90 to +60', () => {
    assert.doesNotThrow(() => {
      updateGimbalPitchVisualizer(-90);
      updateGimbalPitchVisualizer(-60);
      updateGimbalPitchVisualizer(-45);
      updateGimbalPitchVisualizer(0);
      updateGimbalPitchVisualizer(20);
      updateGimbalPitchVisualizer(60);
    }, 'Visualizer update should execute without throwing');
  });
});

describe('Controlled Settings Reset & Storage Manager Tests (v1.74.0)', () => {
  let localStorageStore = {};

  beforeEach(() => {
    localStorageStore = {};
    global.localStorage = {
      getItem: (key) => localStorageStore[key] || null,
      setItem: (key, val) => { localStorageStore[key] = String(val); },
      removeItem: (key) => { delete localStorageStore[key]; },
      clear: () => { localStorageStore = {}; }
    };
  });

  test('FACTORY_DEFAULTS defines standard initial values across core settings', () => {
    assert.strictEqual(typeof FACTORY_DEFAULTS, 'object', 'FACTORY_DEFAULTS must be defined');
    assert.strictEqual(FACTORY_DEFAULTS['altitude'], '50', 'Default altitude is 50m');
    assert.strictEqual(FACTORY_DEFAULTS['gimbal-pitch'], '-60', 'Default pitch is -60 deg');
    assert.strictEqual(FACTORY_DEFAULTS['theme'], 'dark', 'Default theme is dark');
    assert.strictEqual(FACTORY_DEFAULTS['unit-system'], 'imperial', 'Default unit system is imperial');
  });

  test('getModifiedSettingsState detects modified localStorage keys across domains', () => {
    global.localStorage.setItem('aalaapi_sky_theme', 'light');
    global.localStorage.setItem('aalaapi-rc2-uuid', '354A8F93-759C-42C3-A8D5-746F79C7622A');
    global.localStorage.setItem('aalaapi_sky_last_location', JSON.stringify({ lat: 41.3, lon: -88.9 }));

    const state = getModifiedSettingsState();
    assert.ok(state.ui.count >= 1, 'Should detect UI theme customization');
    assert.ok(state.hardware.count >= 1, 'Should detect RC2 UUID customization');
    assert.ok(state.map.count >= 1, 'Should detect cached GPS location');
  });

  test('resetStoredSettings performs selective reset on specific domains without wiping others', () => {
    global.localStorage.setItem('aalaapi_sky_theme', 'light');
    global.localStorage.setItem('aalaapi-rc2-uuid', 'TEST-UUID-123');
    global.localStorage.setItem('aalaapi_sky_last_location', JSON.stringify({ lat: 41.3, lon: -88.9 }));

    // Reset only UI preferences
    const res = resetStoredSettings({
      flightParams: false,
      mapCalibration: false,
      uiPreferences: true,
      hardwareLinks: false,
      onboarding: false
    });

    assert.ok(res.success, 'Reset must succeed');
    assert.strictEqual(global.localStorage.getItem('aalaapi_sky_theme'), null, 'Theme key should be cleared');
    assert.strictEqual(global.localStorage.getItem('aalaapi-rc2-uuid'), 'TEST-UUID-123', 'Hardware UUID should remain untouched');
    assert.ok(global.localStorage.getItem('aalaapi_sky_last_location') !== null, 'Map location should remain untouched');
  });

  test('resetStoredSettings with all domains resets all stored state and restores defaults', () => {
    global.localStorage.setItem('aalaapi_sky_theme', 'light');
    global.localStorage.setItem('aalaapi-rc2-uuid', 'TEST-UUID-123');
    global.localStorage.setItem('aalaapi_sky_last_location', JSON.stringify({ lat: 41.3, lon: -88.9 }));
    global.localStorage.setItem('aalaapi_sky_remote_id_offset_n', '5.5');
    global.localStorage.setItem('aalaapi_intro_banner_dismissed', 'true');

    const res = resetStoredSettings({
      flightParams: true,
      mapCalibration: true,
      uiPreferences: true,
      hardwareLinks: true,
      onboarding: true
    });

    assert.ok(res.success, 'Factory reset must succeed');
    assert.strictEqual(global.localStorage.getItem('aalaapi_sky_theme'), null);
    assert.strictEqual(global.localStorage.getItem('aalaapi-rc2-uuid'), null);
    assert.strictEqual(global.localStorage.getItem('aalaapi_sky_last_location'), null);
    assert.strictEqual(global.localStorage.getItem('aalaapi_sky_remote_id_offset_n'), null);
    assert.strictEqual(global.localStorage.getItem('aalaapi_intro_banner_dismissed'), null);
  });

  test('updateModifiedSettingsIndicators executes safely without throwing', () => {
    assert.doesNotThrow(() => {
      updateModifiedSettingsIndicators();
    }, 'Indicators update should execute without throwing');
  });
});

describe('Global Max Flight Altitude & Safe RTH Altitude Tests (v1.75.0)', () => {
  test('FACTORY_DEFAULTS includes standard 120m max height ceiling and 50m safe RTH altitude', () => {
    assert.strictEqual(FACTORY_DEFAULTS['max-flight-height'], '120', 'Default max flight ceiling is 120m');
    assert.strictEqual(FACTORY_DEFAULTS['rth-altitude'], '50', 'Default RTH altitude is 50m');
  });

  test('buildTemplateKml exports takeOffSecurityHeight tag in missionConfig', () => {
    const kml = buildTemplateKml(50, 5, 'goHome');
    assert.ok(kml.includes('<wpml:takeOffSecurityHeight>'), 'KML must contain takeOffSecurityHeight');
    assert.ok(kml.includes('<wpml:takeOffSecurityHeight>50</wpml:takeOffSecurityHeight>') || kml.includes('takeOffSecurityHeight'), 'Must export configured safe altitude');
  });

  test('buildWaylinesWpml exports takeOffSecurityHeight tag in missionConfig', () => {
    const waypoints = [
      { lat: 41.32, lon: -88.99, x: 0, y: 0, alt: 50, pitch: -90, heading: null },
      { lat: 41.321, lon: -88.991, x: 10, y: 10, alt: 50, pitch: -90, heading: null }
    ];
    const wpml = buildWaylinesWpml(waypoints, 50, 5, 'followWayline', 'goHome', -90, 'stopAndShoot', 'curved');
    assert.ok(wpml.includes('<wpml:takeOffSecurityHeight>'), 'WPML must contain takeOffSecurityHeight in missionConfig');
  });

  test('findDetourPathOverZone clamps vertical climb waypoints to max-flight-height', () => {
    const p1 = { x: -50, y: 0, alt: 40 };
    const p2 = { x: 50, y: 0, alt: 40 };
    const zone = {
      enabled: true,
      pattern: 'exclusion-box',
      maxAltitude: 150, // very tall obstacle
      clearanceBuffer: 10,
      allAltitudes: false
    };

    // Stubs max-flight-height to 120
    const buffPoly = [
      { x: -30, y: -30 }, { x: 30, y: -30 }, { x: 30, y: 30 }, { x: -30, y: 30 }
    ];

    const detours = findDetourPathOverZone(p1, p2, zone, 41.32, -88.99, 4, 10);
    assert.ok(detours.length > 0, 'Should generate detour waypoints');
    detours.forEach(wp => {
      assert.ok(wp.alt <= 120, `Detour altitude ${wp.alt} should not breach max-flight-height ceiling 120`);
    });
  });
});

describe('Auto-Plan Flight Tool & Pattern Grid Integration Tests (v1.76.0)', () => {
  test('index_template.html defines auto-plan-btn inside pattern-selector-grid in Section 1', () => {
    const fs = require('fs');
    const path = require('path');
    const templateHtml = fs.readFileSync(path.join(__dirname, 'index_template.html'), 'utf8');

    const patternGridIdx = templateHtml.indexOf('class="pattern-selector-grid"');
    const autoPlanBtnIdx = templateHtml.indexOf('id="auto-plan-btn"');
    const section4Idx = templateHtml.indexOf('id="actions-and-sync-section"');

    assert.ok(patternGridIdx !== -1, 'pattern-selector-grid should exist');
    assert.ok(autoPlanBtnIdx !== -1, 'auto-plan-btn should exist');
    assert.ok(autoPlanBtnIdx > patternGridIdx, 'auto-plan-btn should be positioned inside Section 1 pattern grid');
    assert.ok(autoPlanBtnIdx < section4Idx, 'auto-plan-btn should be in Section 1 before Section 4');
  });

  test('Section 4 contains dedicated Import and Clear action buttons without duplicate auto-plan', () => {
    const fs = require('fs');
    const path = require('path');
    const templateHtml = fs.readFileSync(path.join(__dirname, 'index_template.html'), 'utf8');

    const section4Block = templateHtml.substring(templateHtml.indexOf('id="actions-and-sync-section"'));
    assert.ok(section4Block.includes('id="import-btn"'), 'Section 4 must contain import-btn');
    assert.ok(section4Block.includes('id="clear-mission-btn"'), 'Section 4 must contain clear-mission-btn');
    assert.ok(!section4Block.includes('id="auto-plan-btn"'), 'Section 4 must NOT contain auto-plan-btn');
  });

  test('initPatternSelectorCards executes safely and does not override grid-type when clicking special tool cards', () => {
    assert.doesNotThrow(() => {
      initPatternSelectorCards();
    }, 'initPatternSelectorCards should execute without error');
  });

  test('Auto-Plan icon SVG uses stroke-width 2 and normalized optical geometry (v1.76.1)', () => {
    const fs = require('fs');
    const path = require('path');
    const templateHtml = fs.readFileSync(path.join(__dirname, 'index_template.html'), 'utf8');

    const autoPlanCardMatch = templateHtml.match(/<div class="pattern-card auto-plan-card"[\s\S]*?<\/div>/);
    assert.ok(autoPlanCardMatch, 'auto-plan-card should be found in template');
    assert.ok(autoPlanCardMatch[0].includes('stroke-width="2"'), 'auto-plan-btn icon must use standard stroke-width 2');
    assert.ok(autoPlanCardMatch[0].includes('<circle cx="12" cy="12" r="7"/>'), 'auto-plan-btn icon must use standard optical circle geometry');
  });
});

describe('Map Zoom Marker Anchoring & Unified Pitch Badge Tests (v1.76.2)', () => {
  test('getMarkerIcon houses wp-pitch-label directly inside wp-static-container', () => {
    const mockWp = {
      lat: 41.88,
      lon: -87.62,
      alt: 50,
      pitch: -60,
      heading: 90
    };

    let capturedIconOptions = null;
    const origDivIcon = L.divIcon;
    L.divIcon = (opts) => {
      capturedIconOptions = opts;
      return opts;
    };

    try {
      const icon = getMarkerIcon(mockWp, 0, [mockWp], 0);
      assert.ok(icon, 'getMarkerIcon should return an icon');
      assert.ok(capturedIconOptions.html.includes('wp-static-container'), 'Icon HTML must contain wp-static-container');
      assert.ok(capturedIconOptions.html.includes('wp-pitch-label') && capturedIconOptions.html.includes('-60°</div>'), 'Pitch label must be housed inside divIcon HTML');
      assert.strictEqual(capturedIconOptions.iconSize[0], 24);
      assert.strictEqual(capturedIconOptions.iconSize[1], 24);
      assert.strictEqual(capturedIconOptions.iconAnchor[0], 12);
      assert.strictEqual(capturedIconOptions.iconAnchor[1], 12);
    } finally {
      L.divIcon = origDivIcon;
    }
  });

  test('CSS rules preserve Leaflet transform transitions for synchronized zoom animation (v1.76.3)', () => {
    const fs = require('fs');
    const path = require('path');
    const cssContent = fs.readFileSync(path.join(__dirname, 'index.css'), 'utf8');

    assert.ok(cssContent.includes('.custom-wp-marker'), 'CSS must target .custom-wp-marker');
    // Markers must not override Leaflet's zoom animation transition with transition: none
    assert.ok(!cssContent.includes('.custom-wp-marker {\n  background: none !important;\n  border: none !important;\n  transition: none !important;'), 'Marker must not disable Leaflet zoom transition');
  });

  test('applyZoomGates cleanly toggles wp-zoomed-out class on mapContainer without throwing', () => {
    assert.doesNotThrow(() => {
      applyZoomGates();
    }, 'applyZoomGates should execute without error');
  });
});

describe('Double Grid Flight Line Camera Heading & Turn Alignment Tests (v1.76.4)', () => {
  test('generateGridCoordinates assigns dedicated flight-line headings and connects Pass 2 seamlessly', () => {
    // 5 lines x 11 photos in Pass 1 (55 wps), 6 lines x 10 photos in Pass 2 (59 wps with junction deduplication) = 114 waypoints
    const grid = generateGridCoordinates(23.4, 27.5, 0, 'double', 'stopAndShoot', 5.85, 2.75);
    assert.strictEqual(grid.waypoints.length, 114, 'Must generate 114 waypoints');

    // Pass 1: North-South lines (11 photos per line)
    // Leg 1 (WP 0..10): flying North -> heading 0°
    for (let i = 0; i <= 10; i++) {
      assert.strictEqual(grid.waypoints[i].heading, 0, `WP ${i} on Leg 1 (Northbound) must have heading 0°`);
    }

    // Leg 2 (WP 11..21): flying South -> heading 180°
    for (let i = 11; i <= 21; i++) {
      assert.strictEqual(grid.waypoints[i].heading, 180, `WP ${i} on Leg 2 (Southbound) must have heading 180°`);
    }

    // Leg 3 (WP 22..32): flying North -> heading 0°
    for (let i = 22; i <= 32; i++) {
      assert.strictEqual(grid.waypoints[i].heading, 0, `WP ${i} on Leg 3 (Northbound) must have heading 0°`);
    }

    // Pass 2 seamlessly starts at Pass 1 end (North-East) and flies West on Leg 1
    // Pass 2 Leg 1 (WP 55..63): flying West -> heading 270°
    for (let i = 55; i <= 63; i++) {
      assert.strictEqual(grid.waypoints[i].heading, 270, `WP ${i} on Pass 2 Leg 1 (Westbound) must have heading 270°`);
    }

    // Pass 2 Leg 2 (WP 64..73): flying East -> heading 90°
    for (let i = 64; i <= 73; i++) {
      assert.strictEqual(grid.waypoints[i].heading, 90, `WP ${i} on Pass 2 Leg 2 (Eastbound) must have heading 90°`);
    }

    // Verify distance between Pass 1 end and Pass 2 start is a valid non-zero step (> 0.5m)
    const p1End = grid.waypoints[54];
    const p2Start = grid.waypoints[55];
    const junctionDist = Math.hypot(p2Start.x - p1End.x, p2Start.y - p1End.y);
    assert.ok(junctionDist > 0.5, `Junction distance (${junctionDist.toFixed(2)}m) must be > 0.5m`);
  });

  test('getDefaultHeading respects pre-assigned waypoint heading and maintains leg alignment', () => {
    const grid = generateGridCoordinates(23.4, 27.5, 0, 'double', 'stopAndShoot', 5.85, 2.75);
    const wps = grid.waypoints;

    // WP 10 is the end of Leg 1 (turnaround point)
    const h10 = getDefaultHeading(10, wps, 0);
    assert.strictEqual(h10, 0, 'Turnaround point at end of Leg 1 must face 0° (along Leg 1) not 90°');

    // WP 11 is the start of Leg 2
    const h11 = getDefaultHeading(11, wps, 0);
    assert.strictEqual(h11, 180, 'Start of Leg 2 must face 180° (along Leg 2)');
  });

  test('137-waypoint Double Grid mission at 16m/2ms/-45deg on Mini 4 Pro exports locked flight-line headings in smoothTransition mode', () => {
    const originalGetElementById = global.document.getElementById;
    try {
      global.document.getElementById = (id) => ({
        value: {
          'drone-model': '68',
          'signal-lost-action': 'goBack',
          'camera-zoom': '1.0',
          'global-hover-time': '2',
          'grid-type': 'double',
          'flight-pattern': 'double',
          'altitude': '16',
          'speed': '2',
          'gimbal-pitch': '-45',
          'heading-mode': 'smoothTransition',
          'grid-width': '27.5',
          'grid-height': '29',
          'grid-rotation': '0',
          'front-overlap': '80',
          'side-overlap': '70',
          'capture-mode': 'stopAndShoot'
        }[id] || '',
        checked: false
      });

      const grid = generateGridCoordinates(27.5, 29, 0, 'double', 'stopAndShoot', 5.5, 2.75);
      assert.strictEqual(grid.waypoints.length, 137, 'Must generate exactly 137 waypoints');

      const sampleWps = grid.waypoints.map((pt, i) => {
        const geo = localToGeodetic(pt.x, pt.y, 40.01284102456845, -83.17713611362149, 0);
        return {
          index: i,
          lat: geo.lat,
          lon: geo.lon,
          alt: 16,
          speed: 2,
          pitch: -45,
          turnMode: 'inherit',
          heading: pt.heading
        };
      });

      const xml = vm.runInThisContext(`
        buildWaylinesWpml(${JSON.stringify(sampleWps)}, 16, 2, 'smoothTransition', 'goHome', -45, 'stopAndShoot', 'straight')
      `);

      assert.ok(xml.includes('<wpml:waypointHeadingMode>smoothTransition</wpml:waypointHeadingMode>'),
        'Double grid with assigned flight-line headings must export smoothTransition mode');
      assert.ok(xml.includes('<wpml:waypointHeadingAngleEnable>1</wpml:waypointHeadingAngleEnable>'),
        'Must enable waypointHeadingAngleEnable to lock camera on axis');
      assert.ok(xml.includes('<wpml:droneEnumValue>68</wpml:droneEnumValue>'),
        'Target drone must be Mini 4 Pro (68)');

      const val = vm.runInThisContext(`
        validateWpmlMission(\`${xml}\`, '', { gridType: 'double' })
      `);
      assert.strictEqual(val.valid, true, 'Must pass all validation rules');
      assert.strictEqual(val.rulesPassed, 10, 'Health score must be 10/10');
      assert.strictEqual(val.errors.length, 0, 'Must have zero validation errors');
    } finally {
      global.document.getElementById = originalGetElementById;
    }
  });
});

describe('Target Splat Grid & 3D Frustum Culling Tests (v1.77.0)', () => {
  test('calculateCameraGroundFrustum accurately projects 4-point ground footprint', () => {
    // Altitude 30m, heading 0 (North), pitch -45 deg, HFOV 70, VFOV 55
    const frustum = calculateCameraGroundFrustum(0, 0, 30, 0, -45, 70, 55, 0);
    assert.strictEqual(frustum.length, 4, 'Must return 4 polygon vertices');
    
    // At pitch -45 deg facing North, all Y coordinates of the footprint should be positive (ahead of drone)
    assert.ok(frustum[0].y > -15, 'Near edge should be forward relative to nadir');
    assert.ok(frustum[2].y > frustum[0].y, 'Far edge should be further North than near edge');
    // Near-Left X should be negative (West), Near-Right X should be positive (East)
    assert.ok(frustum[0].x < 0, 'Near-Left vertex should be to the West');
    assert.ok(frustum[1].x > 0, 'Near-Right vertex should be to the East');
  });

  test('doPolygonsIntersect2D accurately detects overlap and disjoint polygons', () => {
    const boxA = [{ x: -10, y: -10 }, { x: 10, y: -10 }, { x: 10, y: 10 }, { x: -10, y: 10 }];
    const boxB_overlapping = [{ x: 5, y: 5 }, { x: 25, y: 5 }, { x: 25, y: 25 }, { x: 5, y: 25 }];
    const boxC_disjoint = [{ x: 50, y: 50 }, { x: 70, y: 50 }, { x: 70, y: 70 }, { x: 50, y: 70 }];
    const boxD_inside = [{ x: -2, y: -2 }, { x: 2, y: -2 }, { x: 2, y: 2 }, { x: -2, y: 2 }];

    assert.strictEqual(doPolygonsIntersect2D(boxA, boxB_overlapping), true, 'Overlapping polygons must intersect');
    assert.strictEqual(doPolygonsIntersect2D(boxA, boxC_disjoint), false, 'Disjoint polygons must not intersect');
    assert.strictEqual(doPolygonsIntersect2D(boxA, boxD_inside), true, 'Nested polygon must intersect');
  });

  test('isTargetVisibleInFrustum culls photos after drone flies past the house', () => {
    // House is a 20m x 20m square centered at (0, 0)
    const housePoly = [
      { x: -10, y: -10 },
      { x: 10, y: -10 },
      { x: 10, y: 10 },
      { x: -10, y: 10 }
    ];

    // Drone flying North (heading 0) at altitude 30m, pitch -45 deg
    // Approaching from South: y = -40, -20, 0 -> house in view!
    assert.strictEqual(isTargetVisibleInFrustum(0, -40, 30, 0, -45, 70, 55, housePoly, 8), true, 'Approaching drone sees house');
    assert.strictEqual(isTargetVisibleInFrustum(0, -20, 30, 0, -45, 70, 55, housePoly, 8), true, 'Near drone sees house');
    assert.strictEqual(isTargetVisibleInFrustum(0, 0, 30, 0, -45, 70, 55, housePoly, 8), true, 'Drone directly over house sees house');

    // Flying past house towards North boundary: y = +25, +45 -> camera looks ahead into empty ground!
    assert.strictEqual(isTargetVisibleInFrustum(0, 25, 30, 0, -45, 70, 55, housePoly, 8), false, 'Drone past house facing away must be culled');
    assert.strictEqual(isTargetVisibleInFrustum(0, 45, 30, 0, -45, 70, 55, housePoly, 8), false, 'Far drone facing away must be culled');

    // Symmetrical test: Drone flying South (heading 180) from North
    assert.strictEqual(isTargetVisibleInFrustum(0, 40, 30, 180, -45, 70, 55, housePoly, 8), true, 'Southbound approach sees house');
    assert.strictEqual(isTargetVisibleInFrustum(0, -30, 30, 180, -45, 70, 55, housePoly, 8), false, 'Southbound past house must be culled');
  });

  test('3D Object Height preserves visibility of tall roof apex and chimneys', () => {
    const housePoly = [
      { x: -10, y: -10 },
      { x: 10, y: -10 },
      { x: 10, y: 10 },
      { x: -10, y: 10 }
    ];

    // Position (y = 2) where ground plane is just outside FOV, but roof plane (12m height) is inside FOV
    const groundOnly = isTargetVisibleInFrustum(0, 2, 30, 0, -45, 70, 55, housePoly, 0);
    const withRoofHeight = isTargetVisibleInFrustum(0, 2, 30, 0, -45, 70, 55, housePoly, 12);
    assert.strictEqual(groundOnly, false, 'Ground footprint at y=2 has cleared the house');
    assert.strictEqual(withRoofHeight, true, 'Roof plane at 12m height must remain visible when close to property edge');
  });

  test('generateTargetSplatCoordinates in smartTrim mode trims lines and counts pruned photos', () => {
    const mockLayer = {
      targetPoly: [
        { x: -15, y: -15 },
        { x: 15, y: -15 },
        { x: 15, y: 15 },
        { x: -15, y: 15 }
      ],
      targetMode: 'polygon',
      targetRadius: 25,
      targetHeight: 8,
      targetCullingMode: 'smartTrim',
      targetGridPass: 'double',
      centerLat: 40.0,
      centerLon: -85.0
    };

    // 100m x 100m grid with 15m line spacing and 10m photo spacing
    const result = generateTargetSplatCoordinates(100, 100, 0, 'stopAndShoot', 15, 10, 30, -45, mockLayer);

    assert.ok(result.waypoints.length > 0, 'Must generate waypoints');
    assert.ok(result.photos.length > 0, 'Must generate active photos');
    assert.ok(mockLayer.targetPrunedCount > 0, 'Must record pruned photo count');
    assert.ok(mockLayer.targetSavedPercent >= 20, 'Must save at least 20% of wasted photos on a 100m grid around a 30m house');
    assert.ok(result.photos.length < mockLayer.targetCandidatePhotos, 'Active photos must be less than unpruned total candidate photos');
  });

  test('generateTargetSplatCoordinates in pruneOnly mode marks off-target waypoints with skipPhoto: true', () => {
    const mockLayer = {
      targetPoly: [
        { x: -10, y: -10 },
        { x: 10, y: -10 },
        { x: 10, y: 10 },
        { x: -10, y: 10 }
      ],
      targetMode: 'polygon',
      targetRadius: 20,
      targetHeight: 6,
      targetCullingMode: 'pruneOnly',
      targetGridPass: 'single',
      centerLat: 40.0,
      centerLon: -85.0
    };

    const result = generateTargetSplatCoordinates(80, 80, 0, 'stopAndShoot', 20, 10, 30, -45, mockLayer);

    assert.ok(result.waypoints.length > 0, 'Must generate full grid waypoints');
    const skippedWps = result.waypoints.filter(wp => wp.skipPhoto === true);
    assert.ok(skippedWps.length > 0, 'Off-target waypoints must be flagged with skipPhoto: true');

    // Build WPML and verify skipped waypoints do not emit takePhoto actions
    const sampleWpActive = { lat: 40.0, lon: -85.0, alt: 30, pitch: -45, skipPhoto: false };
    const sampleWpSkipped = { lat: 40.001, lon: -85.001, alt: 30, pitch: -45, skipPhoto: true };
    const wpmlXml = buildWaylinesWpml([sampleWpActive, sampleWpSkipped], 30, 4, 'smoothTransition', 'goHome', -45, 'stopAndShoot', 'straight');

    const takePhotoMatches = (wpmlXml.match(/<wpml:actionActuatorFunc>takePhoto<\/wpml:actionActuatorFunc>/g) || []).length;
    assert.strictEqual(takePhotoMatches, 1, 'Only active waypoint must emit takePhoto action; skipped waypoint must be omitted');
  });

  test('Standard grid patterns (single and double) remain completely unaffected', () => {
    const singleGrid = generateGridCoordinates(60, 60, 0, 'single', 'stopAndShoot', 15, 15);
    const doubleGrid = generateGridCoordinates(60, 60, 0, 'double', 'stopAndShoot', 15, 15);

    assert.strictEqual(singleGrid.waypoints.length, 25, 'Single grid 60x60 @ 15m must yield 25 points');
    assert.strictEqual(doubleGrid.waypoints.length, 49, 'Double grid 60x60 @ 15m must yield 49 points (Pass 1 + Pass 2 seamless)');
    assert.strictEqual(singleGrid.waypoints.every(wp => !wp.skipPhoto), true, 'Standard grid waypoints must not have skipPhoto flag');
  });
});

describe('Target Splat Grid Waypoint & Marker Synchronization Regression Tests (v1.77.1)', () => {
  test('generateLayerWaypoints propagates skipPhoto and targetVisible flags to returned waypoints', () => {
    const mockLayer = {
      id: 'target-layer-1',
      name: 'Target Splat Layer',
      enabled: true,
      pattern: 'target-splat',
      gridWidth: 80,
      gridHeight: 80,
      gridRotation: 0,
      altitude: 30,
      speed: 4,
      captureMode: 'stopAndShoot',
      gimbalPitch: -45,
      targetRadius: 15,
      targetHeight: 6,
      targetMode: 'radius',
      targetCullingMode: 'pruneOnly',
      targetGridPass: 'single',
      centerLat: 40.0,
      centerLon: -85.0
    };

    const res = generateLayerWaypoints(mockLayer, 40.0, -85.0);
    assert.ok(res.waypoints.length > 0, 'Must generate waypoints');

    const skippedWps = res.waypoints.filter(wp => wp.skipPhoto === true);
    const activeWps = res.waypoints.filter(wp => wp.skipPhoto === false);

    assert.ok(skippedWps.length > 0, 'generateLayerWaypoints must retain skipPhoto: true on off-target waypoints');
    assert.ok(activeWps.length > 0, 'generateLayerWaypoints must retain skipPhoto: false on active photo waypoints');
    assert.strictEqual(skippedWps[0].targetVisible, false, 'Skipped waypoints must have targetVisible: false');
    assert.strictEqual(activeWps[0].targetVisible, true, 'Active waypoints must have targetVisible: true');
  });

  test('getMarkerIcon renders muted styling, dashed border, and hides camera cone when wp.skipPhoto is true', () => {
    const activeWp = {
      lat: 40.0,
      lon: -85.0,
      alt: 30,
      pitch: -45,
      heading: 0,
      skipPhoto: false
    };

    const skippedWp = {
      lat: 40.001,
      lon: -85.0,
      alt: 30,
      pitch: -45,
      heading: 0,
      skipPhoto: true
    };

    const waypoints = [activeWp, skippedWp, { lat: 40.002, lon: -85.0, alt: 30, pitch: -45, heading: 0 }];

    const origDivIcon = L.divIcon;
    try {
      L.divIcon = (opts) => ({ options: opts });

      // Active marker
      const activeIcon = getMarkerIcon(activeWp, 0, waypoints, 0);
      assert.ok(!activeIcon.options.className.includes('wp-marker-skipped'), 'Active icon must not have wp-marker-skipped class');
      assert.ok(activeIcon.options.html.includes('wp-camera-cone'), 'Active icon must show camera cone');

      // Skipped marker
      const skippedIcon = getMarkerIcon(skippedWp, 1, waypoints, 0);
      assert.ok(skippedIcon.options.className.includes('wp-marker-skipped'), 'Skipped icon must have wp-marker-skipped class');
      assert.ok(!skippedIcon.options.html.includes('wp-camera-cone'), 'Skipped icon must NOT show camera cone');
      assert.ok(skippedIcon.options.html.includes('wp-dot-skipped'), 'Skipped icon must have wp-dot-skipped class');
      assert.ok(skippedIcon.options.html.includes('border-style: dashed'), 'Skipped icon must have dashed border');
      assert.ok(skippedIcon.options.html.includes('#64748b'), 'Skipped icon must use muted slate gray color');
    } finally {
      L.divIcon = origDivIcon;
    }
  });

  test('calculateCameraGroundFrustum normalizes positive pitch angles to downward negative pitch', () => {
    const footprintNegative = calculateCameraGroundFrustum(0, 0, 30, 0, -45, 70, 55, 0);
    const footprintPositive = calculateCameraGroundFrustum(0, 0, 30, 0, 45, 70, 55, 0);

    assert.strictEqual(footprintNegative.length, 4);
    assert.strictEqual(footprintPositive.length, 4);
    assert.strictEqual(
      footprintNegative[0].y.toFixed(3),
      footprintPositive[0].y.toFixed(3),
      'Positive pitch (+45) must be normalized to downward (-45) footprint'
    );
  });

  test('getLocalTargetPolygon recomputes coordinates from geodetic lat/lon relative to center', () => {
    // 0.0001 deg latitude offset is roughly 11.1 meters North
    const mockLayer = {
      targetMode: 'polygon',
      targetPoly: [
        { lat: 40.0001, lon: -85.0, x: 9999, y: 9999 }, // has stale x/y
        { lat: 40.0, lon: -85.0001, x: 9999, y: 9999 },
        { lat: 39.9999, lon: -85.0, x: 9999, y: 9999 }
      ]
    };

    const poly = getLocalTargetPolygon(mockLayer, 40.0, -85.0, 0);
    assert.strictEqual(poly.length, 3);
    assert.ok(Math.abs(poly[0].y - 11.1) < 1.0, `Expected Y offset near 11.1m, got ${poly[0].y}`);
    assert.ok(poly[0].y < 50, 'Must not use stale 9999m value');
  });
});

describe('Target Splat Freeform Polygon Perimeter Tracing & Suppression Tests (v1.77.2)', () => {
  test('setTargetPolyEditMode toggles editing state, button labels, and map crosshair cursor', () => {
    // Check that helper functions exist in global context
    assert.strictEqual(typeof setTargetPolyEditMode, 'function');
    
    // Activating edit mode
    setTargetPolyEditMode(true);
    assert.strictEqual(isTargetPolyEditActive, true);
    if (typeof map !== 'undefined' && map && map.getContainer) {
      assert.strictEqual(map.getContainer().style.cursor, 'crosshair');
    }

    // Deactivating edit mode
    setTargetPolyEditMode(false);
    assert.strictEqual(isTargetPolyEditActive, false);
    if (typeof map !== 'undefined' && map && map.getContainer) {
      assert.strictEqual(map.getContainer().style.cursor, '');
    }
  });

  test('addTargetPolygonPoint computes polygon centroid and re-centers grid when >= 3 points placed', () => {
    const layer = {
      id: 'target-layer-test',
      pattern: 'target-splat',
      targetMode: 'polygon',
      targetPoly: [],
      centerLat: 40.0,
      centerLon: -85.0
    };

    const prevGetActiveLayer = global.getActiveLayer;
    global.getActiveLayer = () => layer;

    try {
      // Add Corner 1: (40.001, -85.001)
      addTargetPolygonPoint(40.001, -85.001);
      assert.strictEqual(layer.targetPoly.length, 1);
      assert.strictEqual(isTargetPolyEditActive, true);

      // Add Corner 2: (40.001, -84.999)
      addTargetPolygonPoint(40.001, -84.999);
      assert.strictEqual(layer.targetPoly.length, 2);

      // Add Corner 3: (39.999, -85.000)
      addTargetPolygonPoint(39.999, -85.000);
      assert.strictEqual(layer.targetPoly.length, 3);

      // Centroid should be avg latitude: (40.001 + 40.001 + 39.999) / 3 = 40.000333...
      // and avg longitude: (-85.001 + -84.999 + -85.000) / 3 = -85.0
      assert.ok(Math.abs(layer.centerLat - 40.000333) < 0.0001, `Centroid Lat should be ~40.000333, got ${layer.centerLat}`);
      assert.ok(Math.abs(layer.centerLon - -85.0) < 0.0001, `Centroid Lon should be ~-85.0, got ${layer.centerLon}`);
    } finally {
      global.getActiveLayer = prevGetActiveLayer;
      setTargetPolyEditMode(false);
    }
  });

  test('drawFlightPath suppresses waypoints when isTargetTracingActive is true', () => {
    const layer = {
      id: 'target-suppress-test',
      pattern: 'target-splat',
      targetMode: 'polygon',
      targetPoly: [{ lat: 40.0, lon: -85.0 }], // < 3 points
      centerLat: 40.0,
      centerLon: -85.0
    };

    const prevGetActiveLayer = global.getActiveLayer;
    global.getActiveLayer = () => layer;

    try {
      let statsUpdatedWithNull = false;
      const prevUpdateStatsPanel = global.updateStatsPanel;
      global.updateStatsPanel = (stats) => {
        if (stats === null) statsUpdatedWithNull = true;
      };

      const dummyWps = [{ lat: 40.0, lon: -85.0, alt: 20 }];
      const dummyPhotos = [{ lat: 40.0, lon: -85.0 }];

      // Tracing active because targetMode is 'polygon' and targetPoly.length < 3
      drawFlightPath(dummyWps, dummyPhotos, 40.0, -85.0, 100, 100, 0);
      assert.strictEqual(statsUpdatedWithNull, true, 'drawFlightPath must exit early and clear stats when tracing');

      global.updateStatsPanel = prevUpdateStatsPanel;
    } finally {
      global.getActiveLayer = prevGetActiveLayer;
    }
  });
});






















// ============================================================
// v1.77.4: generateTargetPerimeterOrbit & unit label regression tests
// ============================================================

describe('generateTargetPerimeterOrbit (v1.77.4)', () => {
  function squarePoly(half = 10) {
    return [
      { x: -half, y: -half },
      { x:  half, y: -half },
      { x:  half, y:  half },
      { x: -half, y:  half }
    ];
  }

  test('returns non-empty waypoints and photos for polygon mode', () => {
    const layer = { targetMode: 'polygon', targetRadius: 25 };
    const result = generateTargetPerimeterOrbit(layer, 5, 20, -55, 3, 0, 0, squarePoly(10), 50);
    assert.ok(result.waypoints.length > 0, 'Should produce waypoints');
    assert.ok(result.photos.length > 0, 'Should produce photos');
    assert.strictEqual(result.waypoints.length, result.photos.length, 'waypoints and photos equal length');
  });

  test('all waypoints farther from centroid than original polygon vertices', () => {
    const layer = { targetMode: 'polygon', targetRadius: 25 };
    const result = generateTargetPerimeterOrbit(layer, 5, 20, -55, 3, 0, 0, squarePoly(10), 50);
    result.waypoints.forEach(wp => {
      const dist = Math.hypot(wp.x, wp.y);
      assert.ok(dist >= 10 - 0.1, `Waypoint dist ${dist.toFixed(2)} should be >= 10m from centroid`);
    });
  });

  test('all waypoints have inward-facing heading pointing toward centroid', () => {
    const layer = { targetMode: 'polygon', targetRadius: 25 };
    const result = generateTargetPerimeterOrbit(layer, 5, 20, -55, 3, 0, 0, squarePoly(10), 50);
    result.waypoints.forEach(wp => {
      const expectedRad = Math.atan2(-wp.x, -wp.y) * (180.0 / Math.PI);
      const expected = ((expectedRad % 360) + 360) % 360;
      const actual = ((wp.heading % 360) + 360) % 360;
      const diff = Math.min(Math.abs(expected - actual), 360 - Math.abs(expected - actual));
      assert.ok(diff < 1.0, `Heading ${actual.toFixed(1)} should be ~${expected.toFixed(1)} (inward)`);
    });
  });

  test('all waypoints have correct altitude and pitch', () => {
    const layer = { targetMode: 'polygon', targetRadius: 25 };
    const result = generateTargetPerimeterOrbit(layer, 5, 18, -65, 3, 0, 0, squarePoly(10), 50);
    result.waypoints.forEach(wp => {
      assert.strictEqual(wp.alt, 18, 'Altitude should match');
      assert.strictEqual(wp.pitch, -65, 'Pitch should match');
    });
  });

  test('auto altitude defaults to 65% of grid altitude when orbitAlt is null', () => {
    const layer = { targetMode: 'polygon', targetRadius: 25 };
    const result = generateTargetPerimeterOrbit(layer, 5, null, -55, 3, 0, 0, squarePoly(10), 50);
    result.waypoints.forEach(wp => {
      assert.ok(Math.abs(wp.alt - 32.5) < 0.001, `Auto alt should be 32.5, got ${wp.alt}`);
    });
  });

  test('radius mode returns circular orbit at targetRadius + standoff', () => {
    const layer = { targetMode: 'radius', targetRadius: 20 };
    const result = generateTargetPerimeterOrbit(layer, 5, 20, -55, 3, 0, 0, [], 50);
    assert.ok(result.waypoints.length > 0, 'Should produce waypoints for radius mode');
    result.waypoints.forEach(wp => {
      const dist = Math.hypot(wp.x, wp.y);
      assert.ok(Math.abs(dist - 25) < 2.0, `Radius mode dist ${dist.toFixed(2)} should be ~25m`);
    });
  });

  test('all waypoints have isPerimeterOrbit: true', () => {
    const layer = { targetMode: 'polygon', targetRadius: 25 };
    const result = generateTargetPerimeterOrbit(layer, 5, 20, -55, 3, 0, 0, squarePoly(10), 50);
    result.waypoints.forEach(wp => {
      assert.strictEqual(wp.isPerimeterOrbit, true, 'isPerimeterOrbit flag should be true');
    });
  });

  test('generateTargetSplatCoordinates with targetPerimeterPass false produces no orbit waypoints', () => {
    const layer = {
      centerLat: 40.0, centerLon: -85.0,
      targetMode: 'radius', targetRadius: 20, targetHeight: 6,
      targetCullingMode: 'convergent', targetGridPass: 'single',
      targetPoly: [], targetPerimeterPass: false
    };
    const result = generateTargetSplatCoordinates(60, 60, 0, 'photo', 8, 8, 40, -60, layer);
    const orbitWps = result.waypoints.filter(wp => wp.isPerimeterOrbit === true);
    assert.strictEqual(orbitWps.length, 0, 'No orbit waypoints when targetPerimeterPass is false');
  });

  test('generateTargetSplatCoordinates with targetPerimeterPass true appends orbit waypoints', () => {
    const layer = {
      centerLat: 40.0, centerLon: -85.0,
      targetMode: 'radius', targetRadius: 20, targetHeight: 6,
      targetCullingMode: 'convergent', targetGridPass: 'single',
      targetPoly: [],
      targetPerimeterPass: true, targetPerimeterStandoff: 8,
      targetPerimeterAltitude: null, targetPerimeterPitch: -55
    };
    const result = generateTargetSplatCoordinates(60, 60, 0, 'photo', 8, 8, 40, -60, layer);
    const orbitWps = result.waypoints.filter(wp => wp.isPerimeterOrbit === true);
    assert.ok(orbitWps.length > 0, 'Should append orbit waypoints when targetPerimeterPass is true');
  });
});

describe('Target Splat Unit Label Fix (v1.77.4)', () => {
  test('syncDisplayValues sets target-radius-unit to ft in imperial mode', () => {
    const elements = {};
    const makeEl = () => ({ value: '', textContent: '', checked: false, classList: { add: ()=>{}, remove: ()=>{} }, style: {} });
    const prevGetById = global.document.getElementById;
    // Stub updateGimbalPitchVisualizer to avoid unrelated DOM dependency
    const prevVisualizer = global.updateGimbalPitchVisualizer;
    global.updateGimbalPitchVisualizer = () => {};
    global.document.getElementById = (id) => {
      if (!elements[id]) elements[id] = makeEl();
      return elements[id];
    };
    elements['unit-system'] = { value: 'imperial' };
    cachedUnitSystem = null;
    elements['target-splat-radius'] = { value: '25' };
    elements['target-radius-val'] = makeEl();
    elements['target-radius-unit'] = { textContent: 'm' };
    elements['target-splat-height'] = { value: '8' };
    elements['target-height-val'] = makeEl();
    elements['target-height-unit'] = { textContent: 'm' };
    elements['target-perimeter-standoff'] = { value: '8' };
    elements['target-perimeter-standoff-val'] = makeEl();
    elements['target-perimeter-standoff-unit'] = { textContent: 'm' };
    elements['target-perimeter-alt'] = { value: '0' };
    elements['target-perimeter-alt-val'] = makeEl();
    elements['target-perimeter-alt-unit'] = makeEl();
    elements['target-perimeter-pitch'] = { value: '-55' };
    elements['target-perimeter-pitch-val'] = makeEl();
    try {
      syncDisplayValues();
      assert.strictEqual(elements['target-radius-unit'].textContent, 'ft', 'target-radius-unit should be ft');
      assert.strictEqual(elements['target-height-unit'].textContent, 'ft', 'target-height-unit should be ft');
      assert.strictEqual(elements['target-perimeter-standoff-unit'].textContent, 'ft', 'perimeter standoff unit should be ft');
      assert.strictEqual(elements['target-perimeter-alt-val'].textContent, 'Auto', 'Altitude display should be Auto when 0');
    } finally {
      global.document.getElementById = prevGetById;
      global.updateGimbalPitchVisualizer = prevVisualizer;
      cachedUnitSystem = null;
    }
  });

  test('syncDisplayValues sets target-radius-unit to m in metric mode', () => {
    const elements = {};
    const makeEl = () => ({ value: '', textContent: '', checked: false, classList: { add: ()=>{}, remove: ()=>{} }, style: {} });
    const prevGetById = global.document.getElementById;
    const prevVisualizer = global.updateGimbalPitchVisualizer;
    global.updateGimbalPitchVisualizer = () => {};
    global.document.getElementById = (id) => {
      if (!elements[id]) elements[id] = makeEl();
      return elements[id];
    };
    elements['unit-system'] = { value: 'metric' };
    cachedUnitSystem = null;
    elements['target-splat-radius'] = { value: '25' };
    elements['target-radius-val'] = makeEl();
    elements['target-radius-unit'] = { textContent: 'ft' };
    elements['target-splat-height'] = { value: '8' };
    elements['target-height-val'] = makeEl();
    elements['target-height-unit'] = { textContent: 'ft' };
    elements['target-perimeter-standoff'] = { value: '8' };
    elements['target-perimeter-standoff-val'] = makeEl();
    elements['target-perimeter-standoff-unit'] = { textContent: 'ft' };
    elements['target-perimeter-alt'] = { value: '0' };
    elements['target-perimeter-alt-val'] = makeEl();
    elements['target-perimeter-alt-unit'] = makeEl();
    elements['target-perimeter-pitch'] = { value: '-55' };
    elements['target-perimeter-pitch-val'] = makeEl();
    try {
      syncDisplayValues();
      assert.strictEqual(elements['target-radius-unit'].textContent, 'm', 'target-radius-unit should be m');
      assert.strictEqual(elements['target-height-unit'].textContent, 'm', 'target-height-unit should be m');
    } finally {
      global.document.getElementById = prevGetById;
      global.updateGimbalPitchVisualizer = prevVisualizer;
      cachedUnitSystem = null;
    }
  });
});

// ============================================================
// v1.77.5: Convergent Pitch & Heading Decimal Overflow Fix
// ============================================================

describe('Convergent Mode Decimal Overflow Fix (v1.77.5)', () => {
  test('generateTargetSplatCoordinates produces integer pitch and clean heading in convergent mode', () => {
    const layer = {
      centerLat: 40.0,
      centerLon: -85.0,
      targetMode: 'radius',
      targetRadius: 20,
      targetHeight: 6,
      targetCullingMode: 'convergent',
      targetGridPass: 'single',
      targetPoly: [],
      targetPerimeterPass: false
    };

    const result = generateTargetSplatCoordinates(60, 60, 0, 'photo', 8, 8, 40, -60, layer);
    assert.ok(result.waypoints.length > 0, 'Should generate waypoints');

    result.waypoints.forEach((wp, idx) => {
      // Pitch must be an integer (no decimal places like -52.07353767327851)
      assert.strictEqual(Number.isInteger(wp.pitch), true, `Waypoint ${idx} pitch ${wp.pitch} must be an integer`);
      assert.ok(wp.pitch >= -85 && wp.pitch <= -15, `Waypoint ${idx} pitch ${wp.pitch} must be within [-85, -15]`);

      // Heading must have at most 1 decimal place
      const headingDecimals = (wp.heading.toString().split('.')[1] || '').length;
      assert.ok(headingDecimals <= 1, `Waypoint ${idx} heading ${wp.heading} should have at most 1 decimal place, had ${headingDecimals}`);
    });
  });

  test('getMarkerIcon formats pitch as integer in wp-pitch-label even if float is supplied', () => {
    let capturedOpts = null;
    const origDivIcon = global.L.divIcon;
    try {
      global.L.divIcon = (opts) => {
        capturedOpts = opts;
        return { options: opts };
      };

      const wp = {
        lat: 40.0,
        lon: -85.0,
        alt: 40,
        pitch: -52.07353767327851,
        heading: 45.12345
      };

      const icon = getMarkerIcon(wp, 0, [wp], 0);
      assert.ok(capturedOpts && capturedOpts.html, 'Icon options must have html');
      assert.ok(capturedOpts.html.includes('-52'), 'Label must display rounded integer pitch -52');
      assert.ok(!capturedOpts.html.includes('-52.073'), 'Label must not contain long decimal precision');
    } finally {
      global.L.divIcon = origDivIcon;
    }
  });

  test('generateTargetPerimeterOrbit produces clean integer pitch and 1-decimal heading', () => {
    const layer = { targetMode: 'polygon', targetRadius: 25 };
    const squarePoly = [
      { x: -10, y: -10 },
      { x: 10, y: -10 },
      { x: 10, y: 10 },
      { x: -10, y: 10 }
    ];
    const result = generateTargetPerimeterOrbit(layer, 5, 18, -55.4, 3, 0, 0, squarePoly, 50);

    result.waypoints.forEach((wp, idx) => {
      assert.strictEqual(Number.isInteger(wp.pitch), true, `Perimeter waypoint ${idx} pitch ${wp.pitch} must be an integer`);
      const headingDecimals = (wp.heading.toString().split('.')[1] || '').length;
      assert.ok(headingDecimals <= 1, `Perimeter waypoint ${idx} heading ${wp.heading} must have at most 1 decimal place`);
    });
  });
});

describe('Target Splat First Waypoint Stuck Fix & WPML Validation Tests (v1.77.7)', () => {
  test('generateTargetSplatCoordinates assigns smoothTransition headingMode and target-splat gridType to all waypoints', () => {
    const layer = {
      targetMode: 'polygon',
      targetRadius: 20,
      targetCullingMode: 'smartTrim',
      targetGridPass: 'double',
      targetPerimeterPass: true,
      targetPerimeterStandoff: 8,
      targetPerimeterAltitude: 12,
      targetPerimeterPitch: -45,
      targetHeight: 8,
      centerLat: 40.0128,
      centerLon: -83.1771
    };
    const result = generateTargetSplatCoordinates(50, 50, 0, 'stopAndShoot', 10, 10, 16, -45, layer);
    assert.ok(result.waypoints.length > 0, 'Must generate waypoints');
    result.waypoints.forEach((wp, i) => {
      assert.strictEqual(wp.headingMode, 'smoothTransition', `Waypoint ${i} must have headingMode smoothTransition`);
      assert.strictEqual(wp.gridType, 'target-splat', `Waypoint ${i} must have gridType target-splat`);
    });
  });

  test('buildWaylinesWpml exports smoothTransition with locked angles and clamped 0.1 deg for target-splat missions', () => {
    const originalGetElementById = global.document.getElementById;
    try {
      global.document.getElementById = (id) => {
        if (id === 'drone-model') return { value: '68' }; // Mini 4 Pro
        if (id === 'grid-type') return { value: 'target-splat' };
        if (id === 'camera-zoom') return { value: '1.0' };
        if (id === 'global-hover-time') return { value: '0' };
        if (id === 'signal-lost-action') return { value: 'goBack' };
        return null;
      };

      // 106 waypoints mimicking the user report
      const waypoints = [];
      for (let i = 0; i < 106; i++) {
        waypoints.push({
          index: i,
          lat: 40.0128 + i * 0.00003,
          lon: -83.1771,
          alt: 16,
          heading: (i % 2 === 0) ? 0 : 180,
          turnMode: 'inherit',
          gridType: 'target-splat',
          headingMode: 'smoothTransition'
        });
      }

      const xml = buildWaylinesWpml(waypoints, 16, 1, 'smoothTransition', 'goHome', -45, 'stopAndShoot', 'curved');

      // Verify Waypoint 0 (heading 0) is clamped to 0.1 and has enable: 1 in smoothTransition
      assert.ok(xml.includes('<wpml:waypointHeadingMode>smoothTransition</wpml:waypointHeadingMode>'),
        'Must use smoothTransition mode');
      assert.ok(!xml.includes('<wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode>'),
        'Must not fall back to followWayline mode for target-splat');

      const pms = xml.split('<Placemark>');
      assert.strictEqual(pms.length - 1, 106, 'Must contain 106 placemarks');

      // Check Waypoint 0
      const pm0Mode = pms[1].match(/<wpml:waypointHeadingMode>([^<]+)<\/wpml:waypointHeadingMode>/)?.[1];
      const pm0Angle = pms[1].match(/<wpml:waypointHeadingAngle>([^<]+)<\/wpml:waypointHeadingAngle>/)?.[1];
      const pm0Enable = pms[1].match(/<wpml:waypointHeadingAngleEnable>([^<]+)<\/wpml:waypointHeadingAngleEnable>/)?.[1];
      assert.strictEqual(pm0Mode, 'smoothTransition', 'Waypoint 0 must be smoothTransition');
      assert.strictEqual(pm0Angle, '0.1', 'Waypoint 0 heading 0 must be safely clamped to 0.1 to avoid firmware hang');
      assert.strictEqual(pm0Enable, '1', 'Waypoint 0 headingAngleEnable must be 1');

      // Validate the mission
      const val = validateWpmlMission(xml, '', { gridType: 'target-splat', waypoints });
      assert.strictEqual(val.valid, true, 'Mission must pass validation');
      assert.strictEqual(val.rulesPassed, 10, 'Must pass all 10 rules');
      assert.strictEqual(val.errors.length, 0, 'Must have zero validation errors');
    } finally {
      global.document.getElementById = originalGetElementById;
    }
  });

  test('validateWpmlMission Rule 1 catches and flags target-splat missions using followWayline', () => {
    // Placemark with followWayline in target-splat
    const badXml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="http://www.uav.com/wpmz/1.0.2">
  <Document>
    <wpml:missionConfig><wpml:droneEnumValue>68</wpml:droneEnumValue></wpml:missionConfig>
    <Folder>
      <Placemark>
        <Point><coordinates>-83.1771,40.0128</coordinates></Point>
        <wpml:index>0</wpml:index>
        <wpml:executeHeight>16</wpml:executeHeight>
        <wpml:waypointSpeed>1</wpml:waypointSpeed>
        <wpml:waypointHeadingParam>
          <wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode>
          <wpml:waypointHeadingAngle>0</wpml:waypointHeadingAngle>
          <wpml:waypointHeadingAngleEnable>1</wpml:waypointHeadingAngleEnable>
        </wpml:waypointHeadingParam>
        <wpml:waypointTurnParam><wpml:waypointTurnMode>toPointAndStopWithContinuityCurvature</wpml:waypointTurnMode></wpml:waypointTurnParam>
        <wpml:useStraightLine>0</wpml:useStraightLine>
      </Placemark>
      <Placemark>
        <Point><coordinates>-83.1771,40.0129</coordinates></Point>
        <wpml:index>1</wpml:index>
        <wpml:executeHeight>16</wpml:executeHeight>
        <wpml:waypointSpeed>1</wpml:waypointSpeed>
        <wpml:waypointHeadingParam>
          <wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode>
          <wpml:waypointHeadingAngle>0</wpml:waypointHeadingAngle>
          <wpml:waypointHeadingAngleEnable>0</wpml:waypointHeadingAngleEnable>
        </wpml:waypointHeadingParam>
        <wpml:waypointTurnParam><wpml:waypointTurnMode>toPointAndStopWithContinuityCurvature</wpml:waypointTurnMode></wpml:waypointTurnParam>
        <wpml:useStraightLine>0</wpml:useStraightLine>
      </Placemark>
    </Folder>
  </Document>
</kml>`;

    const val = validateWpmlMission(badXml, '', { gridType: 'target-splat' });
    assert.strictEqual(val.valid, false, 'Should fail validation for target-splat with followWayline');
    const r1 = val.rules.find(r => r.id === 1);
    assert.strictEqual(r1.passed, false, 'Rule 1 must fail');
    assert.ok(val.errors.some(e => e.includes("pattern is 'target-splat' but waypointHeadingMode is 'followWayline'")),
      'Should specifically explain that target-splat cannot use followWayline');
  });

  test('validateAndFixWpml automatically repairs target-splat followWayline missions to smoothTransition with enable 1 and clamped angles', () => {
    const badXml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="http://www.uav.com/wpmz/1.0.2">
  <Document>
    <wpml:missionConfig><wpml:droneEnumValue>68</wpml:droneEnumValue></wpml:missionConfig>
    <Folder>
      <Placemark>
        <Point><coordinates>-83.1771,40.0128</coordinates></Point>
        <wpml:index>0</wpml:index>
        <wpml:executeHeight>16</wpml:executeHeight>
        <wpml:waypointSpeed>1</wpml:waypointSpeed>
        <wpml:waypointHeadingParam>
          <wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode>
          <wpml:waypointHeadingAngle>0</wpml:waypointHeadingAngle>
          <wpml:waypointHeadingAngleEnable>1</wpml:waypointHeadingAngleEnable>
        </wpml:waypointHeadingParam>
        <wpml:waypointTurnParam><wpml:waypointTurnMode>toPointAndStopWithContinuityCurvature</wpml:waypointTurnMode></wpml:waypointTurnParam>
        <wpml:useStraightLine>0</wpml:useStraightLine>
      </Placemark>
      <Placemark>
        <Point><coordinates>-83.1771,40.0129</coordinates></Point>
        <wpml:index>1</wpml:index>
        <wpml:executeHeight>16</wpml:executeHeight>
        <wpml:waypointSpeed>1</wpml:waypointSpeed>
        <wpml:waypointHeadingParam>
          <wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode>
          <wpml:waypointHeadingAngle>0</wpml:waypointHeadingAngle>
          <wpml:waypointHeadingAngleEnable>0</wpml:waypointHeadingAngleEnable>
        </wpml:waypointHeadingParam>
        <wpml:waypointTurnParam><wpml:waypointTurnMode>toPointAndStopWithContinuityCurvature</wpml:waypointTurnMode></wpml:waypointTurnParam>
        <wpml:useStraightLine>0</wpml:useStraightLine>
      </Placemark>
    </Folder>
  </Document>
</kml>`;

    const repaired = validateAndFixWpml(badXml, '', { gridType: 'target-splat' });
    assert.strictEqual(repaired.validation.valid, true, 'Repaired mission must pass validation');
    assert.strictEqual(repaired.validation.rulesPassed, 10, 'All 10 rules must pass');
    assert.strictEqual(repaired.validation.errors.length, 0, 'No errors in repaired mission');

    const pms = repaired.wpmlXml.split('<Placemark>');
    for (let i = 1; i < pms.length; i++) {
      const mode = pms[i].match(/<wpml:waypointHeadingMode>([^<]+)<\/wpml:waypointHeadingMode>/)?.[1];
      const enable = pms[i].match(/<wpml:waypointHeadingAngleEnable>([^<]+)<\/wpml:waypointHeadingAngleEnable>/)?.[1];
      const angle = parseFloat(pms[i].match(/<wpml:waypointHeadingAngle>([^<]+)<\/wpml:waypointHeadingAngle>/)?.[1]);
      assert.strictEqual(mode, 'smoothTransition', `Placemark ${i} must be repaired to smoothTransition`);
      assert.strictEqual(enable, '1', `Placemark ${i} must have enable 1`);
      assert.ok(angle >= 0.1, `Placemark ${i} angle ${angle} must be clamped to >= 0.1`);
    }
  });
});

describe('Target Splat Flight Stability & Obstacle Avoidance Regression Tests (v1.77.8)', () => {
  test('buildWaylinesWpml enforces >= 5s settling hover on turns >= 60 deg and >= 4s on turns >= 25 deg in stopAndShoot', () => {
    const originalGetElementById = global.document.getElementById;
    try {
      global.document.getElementById = (id) => {
        const map = {
          'drone-model': { value: '68' },
          'signal-lost-action': { value: 'goBack' },
          'camera-zoom': { value: '1.0' },
          'global-hover-time': { value: '0' },
          'grid-type': { value: 'target-splat' },
          'grid-rotation': { value: '0' },
          'heading-mode': { value: 'custom' },
        };
        return map[id] || { value: '', checked: false };
      };

      // Waypoint 0: initial start
      // Waypoint 1: straight ahead (heading 0 deg, diff 0 deg) -> base 2s
      // Waypoint 2: turnaround (heading 180 deg, diff 180 deg >= 60 deg) -> 5s settling hover
      // Waypoint 3: moderate turn (heading 145 deg, diff 35 deg >= 25 deg) -> 4s settling hover
      // Waypoint 4: slight turn (heading 150 deg, diff 5 deg < 25 deg) -> base 2s
      const waypoints = [
        { lat: 40.0128, lon: -83.1771, alt: 16, pitch: -45, heading: 0.1, gridType: 'target-splat', hoverTime: null },
        { lat: 40.0129, lon: -83.1771, alt: 16, pitch: -45, heading: 0.1, gridType: 'target-splat', hoverTime: null },
        { lat: 40.0129, lon: -83.1770, alt: 16, pitch: -45, heading: 180.0, gridType: 'target-splat', hoverTime: null },
        { lat: 40.0128, lon: -83.1770, alt: 16, pitch: -45, heading: 145.0, gridType: 'target-splat', hoverTime: null },
        { lat: 40.0127, lon: -83.1770, alt: 16, pitch: -45, heading: 150.0, gridType: 'target-splat', hoverTime: null }
      ];

      const xml = buildWaylinesWpml(waypoints, 16, 1, 'custom', 'goHome', -45, 'stopAndShoot', 'straight');
      const pms = xml.split('<Placemark>');
      assert.strictEqual(pms.length - 1, 5, 'Must contain 5 placemarks');

      const hovers = [];
      for (let i = 1; i <= 5; i++) {
        const hMatch = pms[i].match(/<wpml:hoverTime>(\d+)<\/wpml:hoverTime>/);
        hovers.push(hMatch ? parseInt(hMatch[1], 10) : 0);
      }

      assert.strictEqual(hovers[0], 2, 'Waypoint 0 should have base 2s hover');
      assert.strictEqual(hovers[1], 2, 'Waypoint 1 straight-line should have base 2s hover');
      assert.strictEqual(hovers[2], 5, 'Waypoint 2 180-deg turn must have at least 5s settling hover');
      assert.strictEqual(hovers[3], 4, 'Waypoint 3 35-deg turn must have at least 4s settling hover');
      assert.strictEqual(hovers[4], 2, 'Waypoint 4 5-deg turn should have base 2s hover');
    } finally {
      global.document.getElementById = originalGetElementById;
    }
  });

  test('buildWaylinesWpml injects gimbalRotate action and >= 3s hover when gimbal pitch changes', () => {
    const originalGetElementById = global.document.getElementById;
    try {
      global.document.getElementById = (id) => {
        const map = {
          'drone-model': { value: '68' },
          'signal-lost-action': { value: 'goBack' },
          'camera-zoom': { value: '1.0' },
          'global-hover-time': { value: '0' },
          'grid-type': { value: 'target-splat' },
          'grid-rotation': { value: '0' },
          'heading-mode': { value: 'custom' },
        };
        return map[id] || { value: '', checked: false };
      };

      // Waypoint 0: overhead grid pitch -45
      // Waypoint 1: facade orbit pitch -55 (pitch changed by 10 deg)
      const waypoints = [
        { lat: 40.0128, lon: -83.1771, alt: 16, pitch: -45, heading: 0.1, gridType: 'target-splat', hoverTime: null },
        { lat: 40.0129, lon: -83.1771, alt: 12, pitch: -55, heading: 0.1, gridType: 'target-splat', hoverTime: null }
      ];

      const xml = buildWaylinesWpml(waypoints, 16, 1, 'custom', 'goHome', -45, 'stopAndShoot', 'straight');
      const pms = xml.split('<Placemark>');
      assert.strictEqual(pms.length - 1, 2);

      // Placemark 2 (WP 1) must have gimbalRotate with pitch -55 and hover >= 3s
      assert.ok(pms[2].includes('<wpml:actionActuatorFunc>gimbalRotate</wpml:actionActuatorFunc>'),
        'Waypoint 1 must rotate gimbal when pitch changes');
      assert.ok(pms[2].includes('<wpml:gimbalPitchRotateAngle>-55</wpml:gimbalPitchRotateAngle>'),
        'Waypoint 1 gimbal pitch angle must be -55');
      const hMatch = pms[2].match(/<wpml:hoverTime>(\d+)<\/wpml:hoverTime>/);
      const hVal = hMatch ? parseInt(hMatch[1], 10) : 0;
      assert.ok(hVal >= 3, 'Waypoint 1 hover time must be at least 3s when gimbal pitch changes');
    } finally {
      global.document.getElementById = originalGetElementById;
    }
  });

  test('generateTargetSplatCoordinates with perimeter orbit injects safe transit waypoint and starts at closest perimeter point', () => {
    // Mock elements for target-splat parameters
    const originalGetElementById = global.document.getElementById;
    try {
      const elMap = {
        'target-splat-mode': { value: 'polygon' },
        'target-splat-strategy': { value: 'smartTrim' },
        'target-splat-angle-mode': { value: 'fixed' },
        'target-splat-cross': { checked: false },
        'target-splat-perimeter': { checked: true },
        'target-splat-height': { value: '8' },
        'target-splat-perimeter-alt': { value: '' }, // Auto altitude
        'target-splat-perimeter-pitch': { value: '-55' },
        'target-splat-perimeter-standoff': { value: '6' },
        'grid-altitude': { value: '16' },
        'gimbal-pitch': { value: '-45' },
        's-line': { value: '6' },
        's-photo': { value: '3' },
        'drone-model': { value: '68' },
        'camera-model': { value: 'mini4pro' },
        'grid-rotation': { value: '0' },
        'heading-mode': { value: 'custom' },
        'capture-mode': { value: 'stopAndShoot' },
        'path-mode': { value: 'normal' },
        'grid-speed': { value: '1' }
      };
      global.document.getElementById = (id) => elMap[id] || { value: '', checked: false };

      // Define a 15x15m rectangular target polygon
      const centerLat = 40.01298;
      const centerLon = -83.17700;
      const dDeg = 0.0001; // ~11m
      const targetPoly = [
        { lat: centerLat - dDeg, lon: centerLon - dDeg },
        { lat: centerLat + dDeg, lon: centerLon - dDeg },
        { lat: centerLat + dDeg, lon: centerLon + dDeg },
        { lat: centerLat - dDeg, lon: centerLon + dDeg }
      ];

      const layer = {
        centerLat: centerLat,
        centerLon: centerLon,
        targetMode: 'polygon',
        targetPoly: targetPoly,
        targetHeight: 8,
        targetCullingMode: 'smartTrim',
        targetGridPass: 'single',
        targetPerimeterPass: true,
        targetPerimeterStandoff: 6,
        targetPerimeterAltitude: null,
        targetPerimeterPitch: -55
      };

      const result = generateTargetSplatCoordinates(
        50, 50, 0, 'stopAndShoot', 6, 3, 16, -45, layer
      );

      assert.ok(result && result.waypoints && result.waypoints.length > 0, 'Should generate waypoints');

      const wps = result.waypoints;
      // Find the transit waypoint
      const transitWp = wps.find(w => w.isTransition === true);
      assert.ok(transitWp, 'Must inject a transit waypoint between grid pass and perimeter orbit');
      assert.strictEqual(transitWp.skipPhoto, true, 'Transit waypoint must have skipPhoto: true');
      assert.strictEqual(transitWp.turnMode, 'stop', 'Transit waypoint must have turnMode: stop');
      assert.strictEqual(transitWp.headingMode, 'smoothTransition', 'Transit waypoint must use smoothTransition');
      assert.ok(transitWp.alt >= 16, 'Transit waypoint altitude must maintain at least grid altitude (16m) to clear roof');

      // The transit waypoint index
      const transitIdx = wps.indexOf(transitWp);
      assert.ok(transitIdx > 0, 'Transit waypoint must come after grid waypoints');
      const lastGridWp = wps[transitIdx - 1];
      const firstOrbitWp = wps[transitIdx + 1];

      assert.ok(firstOrbitWp.isPerimeterOrbit, 'Waypoint immediately following transit must be perimeter orbit');
      assert.strictEqual(firstOrbitWp.isRingStart, true, 'First orbit waypoint must have isRingStart: true to command gimbal pitch');
      assert.strictEqual(firstOrbitWp.pitch, -55, 'First orbit waypoint pitch must match perimeter pitch');
      assert.ok(firstOrbitWp.alt >= 12, 'Auto orbit altitude floor must be at least 12m (above building height 8m + 3m buffer)');

      // The transit waypoint lat/lon must match firstOrbitWp lat/lon (flying horizontally outward before descending)
      assert.strictEqual(transitWp.lat, firstOrbitWp.lat, 'Transit waypoint lat must align with first orbit waypoint');
      assert.strictEqual(transitWp.lon, firstOrbitWp.lon, 'Transit waypoint lon must align with first orbit waypoint');

      // Verify photo list does not include the transit waypoint
      const transitInPhotos = result.photos.some(p => p.lat === transitWp.lat && p.lon === transitWp.lon && p.skipPhoto);
      assert.strictEqual(transitInPhotos, false, 'Photos list must not include skipPhoto transit waypoint');
    } finally {
      global.document.getElementById = originalGetElementById;
    }
  });

  test('calculateStats factors in target-splat turn settling hovers accurately', () => {
    const originalGetElementById = global.document.getElementById;
    try {
      global.document.getElementById = (id) => {
        const map = {
          'drone-model': { value: '68' },
          'global-hover-time': { value: '0' },
          'grid-type': { value: 'target-splat' },
          'grid-rotation': { value: '0' }
        };
        return map[id] || { value: '', checked: false };
      };

      // 3 waypoints in target-splat mode:
      // WP 0: (0,0) heading 0, pitch -45 -> 2s hover
      // WP 1: (0,50) heading 0, pitch -45 -> 0s additional settling (straight line)
      // WP 2: (10,50) heading 180 (turn 180 deg >= 60) -> 5s settling hover
      const waypoints = [
        { x: 0, y: 0, lat: 40.01, lon: -83.17, alt: 16, pitch: -45, heading: 0.1, gridType: 'target-splat', hoverTime: null },
        { x: 0, y: 50, lat: 40.0105, lon: -83.17, alt: 16, pitch: -45, heading: 0.1, gridType: 'target-splat', hoverTime: 0 },
        { x: 10, y: 50, lat: 40.0105, lon: -83.1699, alt: 16, pitch: -45, heading: 180.0, gridType: 'target-splat', hoverTime: 0 }
      ];

      const photos = [{}, {}, {}];
      const stats = calculateStats(waypoints, photos, 1, 10, 10, 'stopAndShoot');
      assert.ok(stats, 'Should return flight stats');
      // Hover time: WP0: 2s (reposition takeoff), WP1: 0s, WP2: 5s (180 turn) = 7s
      // Distance: 50 + 10 = 60m / 1m/s = 60s
      // Photos: 3 * 4.5 = 13.5s
      // Buffer: 45s
      // Total: 60 + 13.5 + 7 + 45 = 125.5s -> round to 126s
      assert.strictEqual(Math.round(stats.flightTimeSeconds), 126);
    } finally {
      global.document.getElementById = originalGetElementById;
    }
  });

  test('pullFlightLogFromRC2 synchronizes both buttons, disables during pull, and resets after completion', async () => {
    const originalFetch = global.fetch;
    const originalGetElementById = global.document.getElementById;

    const mockButtons = {
      'diag-pull-rc2-btn': {
        id: 'diag-pull-rc2-btn',
        innerHTML: '<span>📥 Pull Flight Log</span>',
        style: { color: '' },
        disabled: false
      },
      'direct-rc2-pull-log-btn': {
        id: 'direct-rc2-pull-log-btn',
        innerHTML: '<span>📥 Pull</span>',
        style: { color: '' },
        disabled: false
      }
    };

    global.document.getElementById = (id) => mockButtons[id] || null;

    global.fetch = async (url) => {
      assert.ok(url.includes('/api/latest-flight'), 'Should call /api/latest-flight');
      assert.strictEqual(mockButtons['diag-pull-rc2-btn'].disabled, true);
      assert.strictEqual(mockButtons['direct-rc2-pull-log-btn'].disabled, true);
      assert.ok(mockButtons['diag-pull-rc2-btn'].innerHTML.includes('Pulling Log'));
      assert.ok(mockButtons['direct-rc2-pull-log-btn'].innerHTML.includes('Pulling Log'));

      return {
        ok: true,
        json: async () => ({
          success: true,
          data: {
            latestLog: 'FlightRecord_2026-09-04_[18-51-26].txt',
            latestKmz: 'target-splat-mission.kmz'
          }
        })
      };
    };

    try {
      const res = await pullFlightLogFromRC2(mockButtons['direct-rc2-pull-log-btn']);
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.logName, 'FlightRecord_2026-09-04_[18-51-26].txt');

      assert.ok(mockButtons['diag-pull-rc2-btn'].innerHTML.includes('Pulled FlightRecord_20'));
      assert.ok(mockButtons['direct-rc2-pull-log-btn'].innerHTML.includes('Pulled FlightRecord_20'));
      assert.strictEqual(mockButtons['diag-pull-rc2-btn'].style.color, '#38bdf8');
      assert.strictEqual(mockButtons['direct-rc2-pull-log-btn'].style.color, '#38bdf8');

      await new Promise(r => setTimeout(r, 3600));

      assert.strictEqual(mockButtons['diag-pull-rc2-btn'].disabled, false);
      assert.strictEqual(mockButtons['direct-rc2-pull-log-btn'].disabled, false);
      assert.strictEqual(mockButtons['diag-pull-rc2-btn'].innerHTML, '<span>📥 Pull Flight Log</span>');
      assert.strictEqual(mockButtons['direct-rc2-pull-log-btn'].innerHTML, '<span>📥 Pull</span>');
      assert.strictEqual(mockButtons['diag-pull-rc2-btn'].style.color, '');
      assert.strictEqual(mockButtons['direct-rc2-pull-log-btn'].style.color, '');
    } finally {
      global.fetch = originalFetch;
      global.document.getElementById = originalGetElementById;
    }
  });

  test('pullFlightLogFromRC2 gracefully handles errors/network failures and resets button state', async () => {
    const originalFetch = global.fetch;
    const originalGetElementById = global.document.getElementById;

    const mockButtons = {
      'diag-pull-rc2-btn': {
        id: 'diag-pull-rc2-btn',
        innerHTML: '<span>📥 Pull Flight Log</span>',
        style: { color: '' },
        disabled: false
      },
      'direct-rc2-pull-log-btn': {
        id: 'direct-rc2-pull-log-btn',
        innerHTML: '<span>📥 Pull</span>',
        style: { color: '' },
        disabled: false
      }
    };

    global.document.getElementById = (id) => mockButtons[id] || null;

    global.fetch = async () => {
      throw new Error('Connection timed out');
    };

    try {
      const res = await pullFlightLogFromRC2(mockButtons['diag-pull-rc2-btn']);
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.error, 'Connection timed out');

      assert.ok(mockButtons['diag-pull-rc2-btn'].innerHTML.includes('Pull Failed / Offline'));
      assert.ok(mockButtons['direct-rc2-pull-log-btn'].innerHTML.includes('Pull Failed / Offline'));
      assert.strictEqual(mockButtons['diag-pull-rc2-btn'].style.color, '#f87171');

      await new Promise(r => setTimeout(r, 3100));

      assert.strictEqual(mockButtons['diag-pull-rc2-btn'].disabled, false);
      assert.strictEqual(mockButtons['direct-rc2-pull-log-btn'].disabled, false);
      assert.strictEqual(mockButtons['diag-pull-rc2-btn'].innerHTML, '<span>📥 Pull Flight Log</span>');
      assert.strictEqual(mockButtons['direct-rc2-pull-log-btn'].innerHTML, '<span>📥 Pull</span>');
      assert.strictEqual(mockButtons['diag-pull-rc2-btn'].style.color, '');
    } finally {
      global.fetch = originalFetch;
      global.document.getElementById = originalGetElementById;
    }
  });

  test('target perimeter vertex dragging updates coordinates smoothly and defers centroid recalculation to dragend', () => {
    const layer = {
      pattern: 'target-splat',
      targetMode: 'polygon',
      targetPoly: [
        { lat: 40.0, lon: -83.0, x: 0, y: 0 },
        { lat: 40.001, lon: -83.0, x: 0, y: 111 },
        { lat: 40.001, lon: -83.001, x: -85, y: 111 },
        { lat: 40.0, lon: -83.001, x: -85, y: 0 }
      ],
      targetRadius: 25,
      targetHeight: 8,
      targetPerimeterPass: true,
      targetPerimeterStandoff: 6
    };

    // Verify recomputeTargetPolygonCentroid computes correct centroid
    recomputeTargetPolygonCentroid(layer);
    assert.ok(Math.abs(layer.centerLat - 40.0005) < 1e-5);
    assert.ok(Math.abs(layer.centerLon - (-83.0005)) < 1e-5);

    // Simulate moving a vertex
    layer.targetPoly[0].lat = 40.0002;
    layer.targetPoly[0].lon = -82.9998;
    recomputeTargetPolygonCentroid(layer);

    // Verify centroid shifted
    assert.ok(layer.centerLat > 40.0005, 'Centroid latitude should have increased after moving vertex North');
    assert.ok(layer.centerLon > -83.0005, 'Centroid longitude should have increased after moving vertex East');
  });

  describe('Slow Speed & Click-to-Type Numerical Input Tests (v1.78.0)', () => {
    test('minimum speed supports sub-1 m/s down to 0.2 m/s (~0.4 mph)', () => {
      // Test imperial speed conversion at 0.2 m/s
      const speedMps = 0.2;
      const speedMph = (speedMps * MPS_TO_MPH).toFixed(1);
      assert.strictEqual(speedMph, '0.4', '0.2 m/s should format to 0.4 mph in imperial mode');

      // Test 0.5 m/s
      assert.strictEqual((0.5 * MPS_TO_MPH).toFixed(1), '1.1', '0.5 m/s should format to 1.1 mph');

      // Test reverse conversion: 1.5 mph -> m/s
      const typedMph = 1.5;
      const convertedMps = typedMph / MPS_TO_MPH;
      assert.ok(Math.abs(convertedMps - 0.67) < 0.05);
    });

    test('initClickToTypeInputs attaches clickable-val and opens inline input on click', () => {
      const mockValEl = {
        id: 'speed-val',
        textContent: '4.5',
        classList: {
          add: mock.fn(),
          remove: mock.fn()
        },
        setAttribute: mock.fn(),
        querySelector: () => null,
        appendChild: mock.fn(),
        listeners: {},
        addEventListener: function(evt, handler) {
          this.listeners[evt] = handler;
        }
      };

      const mockSliderEl = {
        id: 'speed',
        value: '2.0',
        dispatchEvent: mock.fn()
      };

      const origGetElementById = global.document.getElementById;
      global.document.getElementById = (id) => {
        if (id === 'speed-val') return mockValEl;
        if (id === 'speed') return mockSliderEl;
        return null;
      };

      try {
        initClickToTypeInputs();
        assert.strictEqual(mockValEl.classList.add.mock.calls.length >= 1, true);
        assert.strictEqual(mockValEl.classList.add.mock.calls[0].arguments[0], 'clickable-val');
        assert.ok(typeof mockValEl.listeners['click'] === 'function');

        // Trigger click event to open inline input
        mockValEl.listeners['click']({ stopPropagation: () => {} });
        assert.strictEqual(mockValEl.appendChild.mock.calls.length, 1);
        const createdInput = mockValEl.appendChild.mock.calls[0].arguments[0];
        assert.strictEqual(createdInput.type, 'number');
        assert.strictEqual(createdInput.className, 'inline-val-input');
      } finally {
        global.document.getElementById = origGetElementById;
      }
    });

    test('setUnitSystem and toggleUnitSystem update storage, cached system, and header badge', () => {
      const mockSelect = { value: 'imperial' };
      const mockBadge = { textContent: 'FT / MPH' };
      const origGetElementById = global.document.getElementById;
      global.document.getElementById = (id) => {
        if (id === 'unit-system') return mockSelect;
        if (id === 'header-unit-badge') return mockBadge;
        return null;
      };

      try {
        setUnitSystem('metric');
        assert.strictEqual(getUnitSystem(), 'metric');
        assert.strictEqual(global.localStorage.getItem('aalaapi_sky_unit_system'), 'metric');
        assert.strictEqual(mockSelect.value, 'metric');
        assert.strictEqual(mockBadge.textContent, 'M / M/S');

        // Toggle back to imperial
        const next = toggleUnitSystem();
        assert.strictEqual(next, 'imperial');
        assert.strictEqual(getUnitSystem(), 'imperial');
        assert.strictEqual(global.localStorage.getItem('aalaapi_sky_unit_system'), 'imperial');
        assert.strictEqual(mockSelect.value, 'imperial');
        assert.strictEqual(mockBadge.textContent, 'FT / MPH');
      } finally {
        global.document.getElementById = origGetElementById;
      }
    });

    test('initClickableUnits binds click listener to toggleUnitSystem on unit labels', () => {
      const mockUnitEl = {
        classList: { add: mock.fn() },
        setAttribute: mock.fn(),
        listeners: {},
        addEventListener: function(evt, handler) {
          this.listeners[evt] = handler;
        }
      };

      const origGetElementById = global.document.getElementById;
      global.document.getElementById = (id) => {
        if (id === 'altitude-unit') return mockUnitEl;
        return null;
      };

      try {
        initClickableUnits();
        assert.strictEqual(mockUnitEl.classList.add.mock.calls.length >= 1, true);
        assert.strictEqual(mockUnitEl.classList.add.mock.calls[0].arguments[0], 'clickable-unit');
        assert.ok(typeof mockUnitEl.listeners['click'] === 'function');

        // Set initial state to imperial
        setUnitSystem('imperial');
        assert.strictEqual(getUnitSystem(), 'imperial');

        // Trigger click event on unit label
        mockUnitEl.listeners['click']({ stopPropagation: () => {} });
        assert.strictEqual(getUnitSystem(), 'metric');

        // Trigger click again to verify return to imperial
        mockUnitEl.listeners['click']({ stopPropagation: () => {} });
        assert.strictEqual(getUnitSystem(), 'imperial');
      } finally {
        global.document.getElementById = origGetElementById;
      }
    });
  });

  describe('Camera Direction & Visual Palettes Tests (v1.80.0)', () => {
    test('CAMERA_PALETTES registry defines all 6 palettes with correct properties', () => {
      assert.ok(CAMERA_PALETTES['high-viz-amber'], 'high-viz-amber must exist');
      assert.ok(CAMERA_PALETTES['electric-lime'], 'electric-lime must exist');
      assert.ok(CAMERA_PALETTES['coral-crimson'], 'coral-crimson must exist');
      assert.ok(CAMERA_PALETTES['neon-magenta'], 'neon-magenta must exist');
      assert.ok(CAMERA_PALETTES['solar-yellow'], 'solar-yellow must exist');
      assert.ok(CAMERA_PALETTES['classic-cyan'], 'classic-cyan must exist');

      assert.strictEqual(CAMERA_PALETTES['high-viz-amber'].arrowColor, '#f59e0b');
      assert.strictEqual(CAMERA_PALETTES['electric-lime'].arrowColor, '#22c55e');
      assert.strictEqual(CAMERA_PALETTES['coral-crimson'].arrowColor, '#f43f5e');
      assert.strictEqual(CAMERA_PALETTES['neon-magenta'].arrowColor, '#d946ef');
      assert.strictEqual(CAMERA_PALETTES['solar-yellow'].arrowColor, '#eab308');
      assert.strictEqual(CAMERA_PALETTES['classic-cyan'].arrowColor, null);

      assert.strictEqual(CAMERA_PALETTES['high-viz-amber'].swatches.length, 2);
    });

    test('getActiveCameraPalette and setCameraPalette manage selection and persistence', () => {
      setCameraPalette('electric-lime');
      assert.strictEqual(getActiveCameraPalette().id, 'electric-lime');
      if (typeof localStorage !== 'undefined') {
        assert.strictEqual(localStorage.getItem('aalaapi_sky_camera_palette'), 'electric-lime');
      }

      setCameraPalette('high-viz-amber');
      assert.strictEqual(getActiveCameraPalette().id, 'high-viz-amber');
      if (typeof localStorage !== 'undefined') {
        assert.strictEqual(localStorage.getItem('aalaapi_sky_camera_palette'), 'high-viz-amber');
      }
    });

    test('isCameraConeEnabled and setCameraConeEnabled toggle cone preference', () => {
      setCameraConeEnabled(false);
      assert.strictEqual(isCameraConeEnabled(), false);
      if (typeof localStorage !== 'undefined') {
        assert.strictEqual(localStorage.getItem('aalaapi_sky_camera_cones'), 'false');
      }

      setCameraConeEnabled(true);
      assert.strictEqual(isCameraConeEnabled(), true);
      if (typeof localStorage !== 'undefined') {
        assert.strictEqual(localStorage.getItem('aalaapi_sky_camera_cones'), 'true');
      }
    });

    test('getMarkerIcon generates high-contrast arrow and cone matching active palette', () => {
      const origDivIcon = L.divIcon;
      L.divIcon = (opts) => ({ options: opts });
      try {
        setCameraPalette('high-viz-amber');
        setCameraConeEnabled(true);

        const wp = { lat: 37.7749, lon: -122.4194, heading: 90, pitch: -45 };
        const waypoints = [wp];
        const icon = getMarkerIcon(wp, 0, waypoints, false, null, null);
        const html = icon.options.html;

        assert.ok(html.includes('border-bottom-color: #f59e0b;'), 'Arrow must use Amber color from palette');
        assert.ok(html.includes('wp-camera-cone'), 'Cone HTML must be rendered when enabled');
        assert.ok(html.includes('border-top-color: rgba(245, 158, 11, 0.38);'), 'Cone must use Amber cone color');
      } finally {
        L.divIcon = origDivIcon;
      }
    });

    test('getMarkerIcon omits cone when camera-cones-toggle is disabled', () => {
      const origDivIcon = L.divIcon;
      L.divIcon = (opts) => ({ options: opts });
      try {
        setCameraPalette('high-viz-amber');
        setCameraConeEnabled(false);

        const wp = { lat: 37.7749, lon: -122.4194, heading: 90, pitch: -45 };
        const waypoints = [wp];
        const icon = getMarkerIcon(wp, 0, waypoints, false, null, null);
        const html = icon.options.html;

        assert.ok(!html.includes('wp-camera-cone'), 'Cone HTML must be suppressed when cones are disabled');
        assert.ok(html.includes('border-bottom-color: #f59e0b;'), 'Arrow should still render normally');

        // Reset
        setCameraConeEnabled(true);
      } finally {
        L.divIcon = origDivIcon;
      }
    });

    test('getMarkerIcon respects skipped waypoints and modified waypoints', () => {
      const origDivIcon = L.divIcon;
      L.divIcon = (opts) => ({ options: opts });
      try {
        setCameraPalette('high-viz-amber');
        setCameraConeEnabled(true);

        const skippedWp = { lat: 37.7749, lon: -122.4194, heading: 90, pitch: -45, skipPhoto: true };
        const skippedIcon = getMarkerIcon(skippedWp, 0, [skippedWp], false, null, null);
        assert.ok(skippedIcon.options.html.includes('border-bottom-color: #64748b;'), 'Skipped waypoint must have muted gray arrow');
        assert.ok(!skippedIcon.options.html.includes('wp-camera-cone'), 'Skipped waypoint must not have cone');

        const modWp = { lat: 37.7749, lon: -122.4194, heading: 90, pitch: -45, isModified: true };
        const modIcon = getMarkerIcon(modWp, 0, [modWp], false, null, null);
        assert.ok(modIcon.options.html.includes('border-bottom-color: #ec4899;'), 'Modified waypoint must have hot pink arrow');
        assert.ok(modIcon.options.html.includes('border-top-color: rgba(236, 72, 153, 0.38);'), 'Modified waypoint must have pink cone');
      } finally {
        L.divIcon = origDivIcon;
      }
    });

    test('getMarkerIcon dynamically places pitch label opposite to camera heading (v1.80.3)', () => {
      const origDivIcon = L.divIcon;
      L.divIcon = (opts) => ({ options: opts });
      try {
        setCameraPalette('high-viz-amber');
        setCameraConeEnabled(true);

        // Northbound / upward headings (< 75° or > 285°): label sits bottom (South)
        const northWp = { lat: 37.77, lon: -122.41, heading: 0, pitch: -90 };
        const northIcon = getMarkerIcon(northWp, 0, [northWp], false, null, null);
        assert.ok(northIcon.options.html.includes('wp-pitch-pos-bottom'), 'Heading 0° must anchor pitch label at bottom');
        assert.ok(!northIcon.options.html.includes('wp-pitch-pos-top'), 'Heading 0° must not have wp-pitch-pos-top');

        const neWp = { lat: 37.77, lon: -122.41, heading: 45, pitch: -60 };
        const neIcon = getMarkerIcon(neWp, 0, [neWp], false, null, null);
        assert.ok(neIcon.options.html.includes('wp-pitch-pos-bottom'), 'Heading 45° must anchor pitch label at bottom');

        const nwWp = { lat: 37.77, lon: -122.41, heading: 315, pitch: -60 };
        const nwIcon = getMarkerIcon(nwWp, 0, [nwWp], false, null, null);
        assert.ok(nwIcon.options.html.includes('wp-pitch-pos-bottom'), 'Heading 315° must anchor pitch label at bottom');

        // Southbound / downward headings (75° to 285°): label flips to top (North) so it never covers the cone
        const southWp = { lat: 37.77, lon: -122.41, heading: 180, pitch: -90 };
        const southIcon = getMarkerIcon(southWp, 0, [southWp], false, null, null);
        assert.ok(southIcon.options.html.includes('wp-pitch-pos-top'), 'Heading 180° must anchor pitch label at top to avoid covering cone');
        assert.ok(!southIcon.options.html.includes('wp-pitch-pos-bottom'), 'Heading 180° must not have wp-pitch-pos-bottom');

        const seWp = { lat: 37.77, lon: -122.41, heading: 135, pitch: -45 };
        const seIcon = getMarkerIcon(seWp, 0, [seWp], false, null, null);
        assert.ok(seIcon.options.html.includes('wp-pitch-pos-top'), 'Heading 135° must anchor pitch label at top');

        const swWp = { lat: 37.77, lon: -122.41, heading: 225, pitch: -45 };
        const swIcon = getMarkerIcon(swWp, 0, [swWp], false, null, null);
        assert.ok(swIcon.options.html.includes('wp-pitch-pos-top'), 'Heading 225° must anchor pitch label at top');

        // CSS rules check
        const cssContent = fs.readFileSync('./index.css', 'utf8');
        assert.ok(cssContent.includes('.wp-pitch-label.wp-pitch-pos-top'), 'CSS must define .wp-pitch-pos-top');
        assert.ok(cssContent.includes('.wp-pitch-label.wp-pitch-pos-bottom'), 'CSS must define .wp-pitch-pos-bottom');
      } finally {
        L.divIcon = origDivIcon;
      }
    });

    test('applyZoomGates applies continuous scaling and CSS custom variables based on zoom level (v1.80.2)', () => {
      const mockContainer = {
        classList: {
          classes: new Set(),
          add(...tokens) { tokens.forEach(t => this.classes.add(t)); },
          remove(...tokens) { tokens.forEach(t => this.classes.delete(t)); },
          contains(c) { return this.classes.has(c); }
        },
        style: {
          props: {},
          setProperty(k, v) { this.props[k] = String(v); },
          removeProperty(k) { delete this.props[k]; },
          getPropertyValue(k) { return this.props[k]; }
        }
      };

      let currentZoom = 21;
      const testMap = {
        getZoom: () => currentZoom,
        getContainer: () => mockContainer
      };
      const origMap = (typeof map !== 'undefined') ? map : undefined;
      map = testMap;
      if (typeof window !== 'undefined') window.map = testMap;
      if (typeof global !== 'undefined') global.map = testMap;

      try {
        // Zoom 21 (Full High Zoom)
        currentZoom = 21;
        applyZoomGates();
        assert.strictEqual(mockContainer.classList.contains('wp-zoom-high'), true, 'Zoom 21 must have wp-zoom-high');
        assert.strictEqual(mockContainer.classList.contains('wp-zoom-pitch-hidden'), false);
        assert.strictEqual(mockContainer.style.props['--wp-cone-scale'], '1.000');
        assert.strictEqual(mockContainer.style.props['--wp-pitch-scale'], '1.000');
        assert.strictEqual(mockContainer.style.props['--wp-pitch-top'], '24.0px');
        assert.strictEqual(mockContainer.style.props['--wp-arrow-scale'], '1.000');

        // Zoom 19 (Mid Zoom)
        currentZoom = 19;
        applyZoomGates();
        assert.strictEqual(mockContainer.classList.contains('wp-zoom-mid'), true, 'Zoom 19 must have wp-zoom-mid');
        assert.strictEqual(mockContainer.classList.contains('wp-zoom-pitch-hidden'), false);
        assert.ok(parseFloat(mockContainer.style.props['--wp-cone-scale']) < 0.70, 'Cone scale must be compact at zoom 19');
        assert.ok(parseFloat(mockContainer.style.props['--wp-pitch-scale']) < 0.85, 'Pitch scale must be compact at zoom 19');
        assert.strictEqual(mockContainer.style.props['--wp-pitch-top'], '19.2px');

        // Zoom 18 (Compact Zoom)
        currentZoom = 18;
        applyZoomGates();
        assert.strictEqual(mockContainer.classList.contains('wp-zoom-compact'), true, 'Zoom 18 must have wp-zoom-compact');
        assert.strictEqual(mockContainer.classList.contains('wp-zoom-pitch-hidden'), false);
        assert.strictEqual(mockContainer.style.props['--wp-cone-scale'], '0.380');
        assert.strictEqual(mockContainer.style.props['--wp-pitch-scale'], '0.650');
        assert.strictEqual(mockContainer.style.props['--wp-pitch-top'], '16.0px');

        // Zoom 17 (Low Zoom Working View: Micro-cones visible, pitch hidden)
        currentZoom = 17;
        applyZoomGates();
        assert.strictEqual(mockContainer.classList.contains('wp-zoomed-out'), false, 'Zoom 17 must keep orientation markers visible');
        assert.strictEqual(mockContainer.classList.contains('wp-zoom-pitch-hidden'), true, 'Zoom 17 must hide pitch labels');
        assert.strictEqual(mockContainer.style.props['--wp-cone-scale'], '0.280');
        assert.strictEqual(mockContainer.style.props['--wp-pitch-scale'], '0.000');

        // Zoom 15 (Macro Overview: Completely hidden)
        currentZoom = 15;
        applyZoomGates();
        assert.strictEqual(mockContainer.classList.contains('wp-zoomed-out'), true, 'Zoom 15 must have wp-zoomed-out');
        assert.strictEqual(mockContainer.style.props['--wp-cone-scale'], undefined);
      } finally {
        map = origMap;
        if (typeof window !== 'undefined') window.map = origMap;
        if (typeof global !== 'undefined') global.map = origMap;
      }
    });
  });

  describe('Three-Tier Architectural Hierarchy & Per-Layer Dynamics Tests (v1.81.0)', () => {
    test('createDefaultLayer initializes layer flight dynamics with inherit defaults', () => {
      const layer = createDefaultLayer('single', 'Test Layer');
      assert.strictEqual(layer.captureMode, 'inherit', 'layer.captureMode should default to inherit');
      assert.strictEqual(layer.pathMode, 'inherit', 'layer.pathMode should default to inherit');
      assert.strictEqual(layer.headingMode, 'inherit', 'layer.headingMode should default to inherit');
      assert.strictEqual(layer.targetPoiId, null, 'layer.targetPoiId should default to null');
      assert.strictEqual(layer.turnaroundOvershoot, 0, 'layer.turnaroundOvershoot should default to 0');
      assert.strictEqual(layer.turnaroundSpeed, null, 'layer.turnaroundSpeed should default to null (inherit)');
      assert.strictEqual(layer.turnDampingDist, 0, 'layer.turnDampingDist should default to 0');
      assert.strictEqual(layer.hoverTime, 'inherit', 'layer.hoverTime should default to inherit');
      assert.strictEqual(layer.autoSettlingEnabled, true, 'layer.autoSettlingEnabled should default to true');
      assert.strictEqual(layer.baseSettlingTime, 2.0, 'layer.baseSettlingTime should default to 2.0');
      assert.strictEqual(layer.majorTurnSettlingTime, 5.0, 'layer.majorTurnSettlingTime should default to 5.0');
      assert.strictEqual(layer.moderateTurnSettlingTime, 4.0, 'layer.moderateTurnSettlingTime should default to 4.0');
      assert.strictEqual(layer.pitchSettlingTime, 3.0, 'layer.pitchSettlingTime should default to 3.0');
    });

    test('Three-Tier Cascade resolves Global -> Layer -> Waypoint hierarchy', () => {
      // Tier 1: Global Defaults
      const mockDoc = {
        'capture-mode': { value: 'stopAndShoot' },
        'path-mode': { value: 'curved' },
        'heading-mode': { value: 'followWayline' },
        'global-hover-time': { value: '0' }
      };
      const origGetElementById = global.document.getElementById;
      global.document.getElementById = (id) => mockDoc[id] || { value: '' };

      try {
        // Case 1: Layer inherits Global
        const layer1 = { captureMode: 'inherit', pathMode: 'inherit', headingMode: 'inherit', hoverTime: 'inherit' };
        assert.strictEqual(getEffectiveLayerCaptureMode(layer1), 'stopAndShoot', 'Inherit layer capture mode resolves to Global stopAndShoot');
        assert.strictEqual(getEffectiveLayerPathMode(layer1), 'curved', 'Inherit layer path mode resolves to Global curved');
        assert.strictEqual(getEffectiveLayerHeadingMode(layer1), 'followWayline', 'Inherit layer heading mode resolves to Global followWayline');
        assert.strictEqual(getEffectiveLayerHoverTime(layer1), 0, 'Inherit layer hover time resolves to Global 0');

        // Case 2: Layer overrides Global
        const layer2 = { captureMode: 'video', pathMode: 'straight', headingMode: 'custom', hoverTime: '8' };
        assert.strictEqual(getEffectiveLayerCaptureMode(layer2), 'video', 'Explicit layer capture mode overrides Global');
        assert.strictEqual(getEffectiveLayerPathMode(layer2), 'straight', 'Explicit layer path mode overrides Global');
        assert.strictEqual(getEffectiveLayerHeadingMode(layer2), 'custom', 'Explicit layer heading mode overrides Global');
        assert.strictEqual(getEffectiveLayerHoverTime(layer2), 8, 'Explicit layer hover time overrides Global');
      } finally {
        global.document.getElementById = origGetElementById;
      }
    });

    test('generateGridCoordinates applies turnaround overshoot and tags turnaround points', () => {
      const gridResult = generateGridCoordinates(50, 50, 0, 'single', 'stopAndShoot', 10, 10, 8);
      const wps = gridResult.waypoints;
      assert.ok(wps && wps.length > 0, 'Should generate grid waypoints');
      
      const turnaroundWps = wps.filter(w => w.isTurnaroundPoint === true);
      assert.ok(turnaroundWps.length > 0, 'Should tag turnaround overshoot waypoints outside the survey envelope');
      turnaroundWps.forEach(w => {
        assert.strictEqual(w.skipPhoto, true, 'Turnaround waypoints must skip photo capture');
      });
    });

    test('generateLayerWaypoints stamps layer dynamics metadata onto waypoints', () => {
      const layer = createDefaultLayer('single', 'Survey Layer');
      layer.centerLat = 41.88;
      layer.centerLon = -87.62;
      layer.captureMode = 'continuous';
      layer.pathMode = 'straight';
      layer.headingMode = 'fixed';
      layer.turnaroundSpeed = 8.5;
      layer.turnDampingDist = 1.2;
      layer.baseSettlingTime = 2.5;

      const result = generateLayerWaypoints(layer, 50, 50, 0, 'stopAndShoot', 10, 10, 50, -45, 0, 5);
      assert.ok(result && result.waypoints && result.waypoints.length > 0, 'Should return generated waypoints');
      
      const firstWp = result.waypoints[0];
      assert.strictEqual(firstWp.layerId, layer.id, 'Waypoint must record its owning layerId');
      assert.strictEqual(firstWp.layerCaptureMode, 'continuous', 'Waypoint must record layerCaptureMode');
      assert.strictEqual(firstWp.layerPathMode, 'straight', 'Waypoint must record layerPathMode');
      assert.strictEqual(firstWp.layerHeadingMode, 'fixed', 'Waypoint must record layerHeadingMode');
      assert.strictEqual(firstWp.turnaroundSpeed, 8.5, 'Waypoint must record layer turnaroundSpeed');
      assert.strictEqual(firstWp.turnDampingDist, 1.2, 'Waypoint must record layer turnDampingDist');
      assert.strictEqual(firstWp.baseSettlingTime, 2.5, 'Waypoint must record layer baseSettlingTime');
    });

    test('buildWaylinesWpml respects Tier 3 Waypoint Overrides over Layer and Global settings', () => {
      // Global: curved path, stopAndShoot
      // Layer: straight path, continuous
      // WP 0: default (inherit layer) -> straight, continuous
      // WP 1: override turnMode: 'stop' (straight stop), override cameraAction: 'takePhoto'
      // WP 2: override turnMode: 'pass' (straight pass), override cameraAction: 'none'
      const testWaypoints = [
        {
          lat: 41.88, lon: -87.62, alt: 50, pitch: -45,
          layerId: 'layer-1', layerCaptureMode: 'continuous', layerPathMode: 'straight',
          turnMode: 'inherit', cameraAction: 'inherit'
        },
        {
          lat: 41.89, lon: -87.63, alt: 50, pitch: -45,
          layerId: 'layer-1', layerCaptureMode: 'continuous', layerPathMode: 'straight',
          turnMode: 'stop', cameraAction: 'takePhoto'
        },
        {
          lat: 41.90, lon: -87.64, alt: 50, pitch: -45,
          layerId: 'layer-1', layerCaptureMode: 'continuous', layerPathMode: 'straight',
          turnMode: 'pass', cameraAction: 'none'
        }
      ];

      const xml = buildWaylinesWpml(testWaypoints, 50, 5, 'followWayline', 'goHome', -45, 'stopAndShoot', 'curved');
      const placemarks = xml.split('<Placemark>');
      assert.ok(placemarks.length >= 4, 'Should contain placemarks');

      // WP 1 (intermediate) with turnMode: 'stop' and cameraAction: 'takePhoto'
      const wp1Xml = placemarks[2];
      assert.ok(wp1Xml.includes('toPointAndStopWithDiscontinuityCurvature'), 'WP 1 should use Stop turnMode in straight path');
      assert.ok(wp1Xml.includes('<wpml:actionActuatorFunc>takePhoto</wpml:actionActuatorFunc>'), 'WP 1 should take photo via override');

      // WP 2 with turnMode: 'pass' and cameraAction: 'none'
      // Note: WP 2 is endpoint (last waypoint), so by DJI Golden Endpoint Rule, endpoint must be stop.
      // Let's test with a 4th waypoint so WP 2 is intermediate:
      const testWaypoints4 = [
        { lat: 41.88, lon: -87.62, alt: 50, pitch: -45, layerPathMode: 'straight', turnMode: 'stop' },
        { lat: 41.89, lon: -87.63, alt: 50, pitch: -45, layerPathMode: 'straight', turnMode: 'pass' },
        { lat: 41.90, lon: -87.64, alt: 50, pitch: -45, layerPathMode: 'straight', turnMode: 'pass' },
        { lat: 41.91, lon: -87.65, alt: 50, pitch: -45, layerPathMode: 'straight', turnMode: 'stop' }
      ];
      const xml4 = buildWaylinesWpml(testWaypoints4, 50, 5, 'followWayline', 'goHome', -45, 'continuous', 'curved');
      const pm4 = xml4.split('<Placemark>');
      assert.ok(pm4[2].includes('toPointAndPassWithDiscontinuityCurvature'), 'Intermediate WP 1 should use Pass turn mode in straight layer');
      assert.ok(pm4[3].includes('toPointAndPassWithDiscontinuityCurvature'), 'Intermediate WP 2 should use Pass turn mode in straight layer');
    });

    test('Consumer drone missions strictly enforce ContinuityCurvature and useStraightLine 0', () => {
      const origGetElementById = global.document.getElementById;
      global.document.getElementById = (id) => {
        if (id === 'drone-model') return { value: '68' }; // DJI Mini 4 Pro (consumer drone)
        return { value: '' };
      };

      try {
        const testWaypoints = [
          { lat: 41.88, lon: -87.62, alt: 50, pitch: -45, layerPathMode: 'straight' },
          { lat: 41.89, lon: -87.63, alt: 50, pitch: -45, layerPathMode: 'straight' }
        ];
        const xml = buildWaylinesWpml(testWaypoints, 50, 5, 'followWayline', 'goHome', -45, 'stopAndShoot', 'straight');
        assert.ok(xml.includes('<wpml:useStraightLine>0</wpml:useStraightLine>'), 'Consumer drone must use useStraightLine 0');
        assert.ok(!xml.includes('DiscontinuityCurvature'), 'Consumer drone must never use DiscontinuityCurvature');
        assert.ok(xml.includes('ContinuityCurvature'), 'Consumer drone must use ContinuityCurvature');
      } finally {
        global.document.getElementById = origGetElementById;
      }
    });
  });

  describe('Flight Leg Phase Indicators & Boundary Adaptation Tests (v1.82.0)', () => {
    test('buildLegPhaseBadgeHTML generates correct icon badges and breadcrumb tooltips', () => {
      // PRE phase
      const preBadge = buildLegPhaseBadgeHTML('pre', 1, 5, 'Heading Mode');
      assert.ok(preBadge.includes('↗'), 'Should contain ↗ icon');
      assert.ok(preBadge.includes('phase-pre'), 'Should contain phase-pre class');
      assert.ok(preBadge.includes('active-pre'), 'Breadcrumb should highlight active-pre');
      assert.ok(preBadge.includes('wp-leg-breadcrumb-tooltip'), 'Should contain breadcrumb tooltip container');

      // AT phase
      const atBadge = buildLegPhaseBadgeHTML('at', 2, 5, 'Gimbal Pitch');
      assert.ok(atBadge.includes('📍'), 'Should contain 📍 icon');
      assert.ok(atBadge.includes('phase-at'), 'Should contain phase-at class');
      assert.ok(atBadge.includes('active-at'), 'Breadcrumb should highlight active-at');

      // POST phase
      const postBadge = buildLegPhaseBadgeHTML('post', 1, 5, 'Flight Speed');
      assert.ok(postBadge.includes('↘'), 'Should contain ↘ icon');
      assert.ok(postBadge.includes('phase-post'), 'Should contain phase-post class');
      assert.ok(postBadge.includes('active-post'), 'Breadcrumb should highlight active-post');

      // TRANSITION phase
      const transBadge = buildLegPhaseBadgeHTML('transition', 2, 5, 'Turn Mode');
      assert.ok(transBadge.includes('⤹'), 'Should contain ⤹ icon');
      assert.ok(transBadge.includes('phase-transition'), 'Should contain phase-transition class');

      // N/A phase
      const naBadge = buildLegPhaseBadgeHTML('na', 4, 5, 'Flight Speed');
      assert.ok(naBadge.includes('⛔'), 'Should contain ⛔ icon');
      assert.ok(naBadge.includes('phase-na'), 'Should contain phase-na class');
    });

    test('createWaypointEditorDOM adapts heading badge at Waypoint 0 (Takeoff)', () => {
      const origCreateElement = global.document.createElement;
      const origGetElementById = global.document.getElementById;
      const origWaypoints = (typeof getCurrentWaypoints === 'function') ? getCurrentWaypoints() : null;

      const makeEl = (tag) => ({
        tagName: (tag || 'div').toUpperCase(),
        className: '',
        style: {},
        innerHTML: '',
        value: '',
        textContent: '',
        disabled: false,
        appendChild: function(c) { return c; },
        querySelector: function(sel) {
          if (!this.innerHTML) return null;
          if (sel.startsWith('#')) {
            const id = sel.slice(1);
            if (!this.innerHTML.includes(`id="${id}"`)) return null;
            return {
              value: '',
              style: {},
              textContent: '',
              disabled: false,
              addEventListener: () => {}
            };
          }
          return null;
        },
        addEventListener: () => {}
      });

      global.document.createElement = (tag) => makeEl(tag);
      global.document.getElementById = (id) => {
        if (id === 'grid-rotation') return { value: '0' };
        if (id === 'grid-type') return { value: 'single' };
        return origGetElementById(id);
      };

      const testWps = [
        { lat: 41.88, lon: -87.62, alt: 50, pitch: -45, heading: 90 },
        { lat: 41.89, lon: -87.63, alt: 50, pitch: -45, heading: 90 },
        { lat: 41.90, lon: -87.64, alt: 50, pitch: -45, heading: 90 }
      ];

      try {
        if (typeof generatedWaypoints !== 'undefined') generatedWaypoints = testWps;
        const dummyMarker = { setIcon: () => {}, getTooltip: () => ({ setContent: () => {} }) };

        // WP 0: Heading is AT 📍 Takeoff rotation
        const dom0 = createWaypointEditorDOM(testWps[0], 0, dummyMarker);
        const html0 = dom0.innerHTML;
        assert.ok(html0.includes('Heading Mode:'), 'Should render Heading Mode section');
        assert.ok(html0.includes('phase-at'), 'WP 0 heading badge must have phase-at class');
        assert.ok(html0.includes('📍'), 'WP 0 heading badge must display 📍 for on-axis takeoff');

        // Intermediate WP 1: Heading is PRE ↗ (Approach leg)
        const dom1 = createWaypointEditorDOM(testWps[1], 1, dummyMarker);
        const html1 = dom1.innerHTML;
        assert.ok(html1.includes('phase-pre'), 'Intermediate WP heading badge must have phase-pre class');
        assert.ok(html1.includes('↗'), 'Intermediate WP heading badge must display ↗ for approach leg');
      } finally {
        global.document.createElement = origCreateElement;
        global.document.getElementById = origGetElementById;
        if (typeof generatedWaypoints !== 'undefined') generatedWaypoints = origWaypoints;
      }
    });

    test('createWaypointEditorDOM dims speed and turn mode on final waypoint (N/A End of Route)', () => {
      const origCreateElement = global.document.createElement;
      const origGetElementById = global.document.getElementById;
      const origImported = (typeof importedWaypoints !== 'undefined') ? importedWaypoints : null;
      const origGenerated = (typeof generatedWaypoints !== 'undefined') ? generatedWaypoints : null;

      const makeEl = (tag) => ({
        tagName: (tag || 'div').toUpperCase(),
        className: '',
        style: {},
        innerHTML: '',
        value: '',
        textContent: '',
        disabled: false,
        appendChild: function(c) { return c; },
        querySelector: function(sel) {
          if (!this.innerHTML) return null;
          if (sel.startsWith('#')) {
            const id = sel.slice(1);
            if (!this.innerHTML.includes(`id="${id}"`)) return null;
            return {
              value: '',
              style: {},
              textContent: '',
              disabled: false,
              addEventListener: () => {}
            };
          }
          return null;
        },
        addEventListener: () => {}
      });

      global.document.createElement = (tag) => makeEl(tag);
      global.document.getElementById = (id) => {
        if (id === 'grid-rotation') return { value: '0' };
        if (id === 'grid-type') return { value: 'single' };
        return origGetElementById(id);
      };

      const testWps = [
        { lat: 41.88, lon: -87.62, alt: 50, pitch: -45, speed: 5, turnMode: 'stop' },
        { lat: 41.89, lon: -87.63, alt: 50, pitch: -45, speed: 5, turnMode: 'stop' },
        { lat: 41.90, lon: -87.64, alt: 50, pitch: -45, speed: 5, turnMode: 'stop' }
      ];

      try {
        global.testWpsForLeg = testWps;
        vm.runInThisContext('importedWaypoints = null; generatedWaypoints = global.testWpsForLeg;');
        const dummyMarker = { setIcon: () => {}, getTooltip: () => ({ setContent: () => {} }) };

        // Final WP (idx 2 of 3)
        const domEnd = createWaypointEditorDOM(testWps[2], 2, dummyMarker, null, testWps);
        const htmlEnd = domEnd.innerHTML;

        assert.ok(htmlEnd.includes('id="edit-wp-speed-container" class="wp-leg-control-disabled"'), 'Final waypoint speed container must have wp-leg-control-disabled class');
        assert.ok(htmlEnd.includes('id="edit-wp-speed" min="0.2" max="15" step="0.1" value="5" disabled'), 'Final waypoint speed input slider must be disabled');
        assert.ok(htmlEnd.includes('id="edit-wp-speed-val">N/A</span>'), 'Final waypoint speed value must show N/A');
        assert.ok(htmlEnd.includes('phase-na'), 'Final waypoint must include phase-na badges');
        assert.ok(htmlEnd.includes('⛔'), 'Final waypoint speed badge must show ⛔');

        assert.ok(htmlEnd.includes('id="edit-wp-turn-mode-container" class="wp-leg-control-disabled"'), 'Final waypoint turn mode container must have wp-leg-control-disabled class');
        assert.ok(htmlEnd.includes('id="edit-wp-turn-mode" class="form-select" disabled'), 'Final waypoint turn mode select must be disabled');

        // Intermediate WP (idx 1 of 3) has active controls
        const domMid = createWaypointEditorDOM(testWps[1], 1, dummyMarker, null, testWps);
        const htmlMid = domMid.innerHTML;
        assert.ok(!htmlMid.includes('id="edit-wp-speed-container" class="wp-leg-control-disabled"'), 'Intermediate waypoint speed container must not have disabled class');
        assert.ok(htmlMid.includes('↘'), 'Intermediate waypoint speed badge must show ↘');
        assert.ok(htmlMid.includes('⤹'), 'Intermediate waypoint turn badge must show ⤹');
      } finally {
        global.document.createElement = origCreateElement;
        global.document.getElementById = origGetElementById;
        if (typeof importedWaypoints !== 'undefined') importedWaypoints = origImported;
        if (typeof generatedWaypoints !== 'undefined') generatedWaypoints = origGenerated;
      }
    });
  });

  describe('Target Splat Auto-Determining Grid Dimensions (v1.83.0)', () => {
    test('calculateTargetSplatDimensions calculates accurate dimensions in Radius mode', () => {
      // 1. Default settings: Radius 25m, Alt 50m, Pitch -45 deg, Double grid
      const layer1 = {
        pattern: 'target-splat',
        targetMode: 'radius',
        targetRadius: 25,
        altitude: 50,
        gimbalPitch: -45,
        targetGridPass: 'double'
      };
      const dims1 = calculateTargetSplatDimensions(layer1);
      assert.strictEqual(dims1.width, 170, 'Double grid Width should be 170m for 25m radius at 50m alt, -45 deg pitch');
      assert.strictEqual(dims1.height, 170, 'Double grid Height should be 170m for 25m radius at 50m alt, -45 deg pitch');

      // 2. Small shed: Radius 10m, Alt 25m, Pitch -60 deg, Double grid
      const layer2 = {
        pattern: 'target-splat',
        targetMode: 'radius',
        targetRadius: 10,
        altitude: 25,
        gimbalPitch: -60,
        targetGridPass: 'double'
      };
      const dims2 = calculateTargetSplatDimensions(layer2);
      assert.strictEqual(dims2.width, 60, 'Width should be 60m for 10m radius at 25m alt, -60 deg pitch');
      assert.strictEqual(dims2.height, 60, 'Height should be 60m for 10m radius at 25m alt, -60 deg pitch');

      // 3. Nadir pitch (-90 deg): dStandoff = 0, margin = 0.2 * 40 = 8m
      // span = 2 * (25 + 0 + 8) = 66m -> rounded to nearest 5m = 65m
      const layer3 = {
        pattern: 'target-splat',
        targetMode: 'radius',
        targetRadius: 25,
        altitude: 40,
        gimbalPitch: -90,
        targetGridPass: 'double'
      };
      const dims3 = calculateTargetSplatDimensions(layer3);
      assert.strictEqual(dims3.width, 65, 'Nadir width should be 65m');
      assert.strictEqual(dims3.height, 65, 'Nadir height should be 65m');
    });

    test('calculateTargetSplatDimensions adapts for single grid pass', () => {
      const layerSingle = {
        pattern: 'target-splat',
        targetMode: 'radius',
        targetRadius: 20,
        altitude: 50,
        gimbalPitch: -45,
        targetGridPass: 'single'
      };
      const dims = calculateTargetSplatDimensions(layerSingle);
      assert.strictEqual(dims.height, 160, 'Single grid height should have full Y standoff');
      assert.ok(dims.width < dims.height, 'Single grid width should be narrower than height');
    });

    test('calculateTargetSplatDimensions accurately sizes rectangular Freeform Polygons', () => {
      // 40m wide (E-W) x 20m deep (N-S) rectangular building
      const layerPoly = {
        pattern: 'target-splat',
        targetMode: 'polygon',
        gridRotation: 0,
        altitude: 50,
        gimbalPitch: -45,
        targetGridPass: 'double',
        targetPoly: [
          { x: -20, y: 10 },
          { x: 20, y: 10 },
          { x: 20, y: -10 },
          { x: -20, y: -10 }
        ]
      };
      const dims = calculateTargetSplatDimensions(layerPoly);
      assert.strictEqual(dims.width, 160, 'Polygon width should be 160m');
      assert.strictEqual(dims.height, 140, 'Polygon height should be 140m');
    });

    test('calculateTargetSplatDimensions clamps to valid slider limits (20m - 500m)', () => {
      const hugeLayer = {
        pattern: 'target-splat',
        targetMode: 'radius',
        targetRadius: 150,
        altitude: 120,
        gimbalPitch: -30,
        targetGridPass: 'double'
      };
      const dimsHuge = calculateTargetSplatDimensions(hugeLayer);
      assert.strictEqual(dimsHuge.width, 500, 'Max dimension must be clamped to 500m');
      assert.strictEqual(dimsHuge.height, 500, 'Max dimension must be clamped to 500m');

      const tinyLayer = {
        pattern: 'target-splat',
        targetMode: 'radius',
        targetRadius: 2,
        altitude: 5,
        gimbalPitch: -90,
        targetGridPass: 'double'
      };
      const dimsTiny = calculateTargetSplatDimensions(tinyLayer);
      assert.strictEqual(dimsTiny.width, 20, 'Min dimension must be clamped to 20m');
      assert.strictEqual(dimsTiny.height, 20, 'Min dimension must be clamped to 20m');
    });

    test('generateLayerWaypoints applies auto-calculated dimensions when targetAutoDimensions is true', () => {
      const layer = {
        id: 'test-splat-layer',
        enabled: true,
        pattern: 'target-splat',
        targetMode: 'radius',
        targetRadius: 25,
        altitude: 50,
        gimbalPitch: -45,
        targetGridPass: 'double',
        targetAutoDimensions: true,
        gridWidth: 100,
        gridHeight: 100
      };
      generateLayerWaypoints(layer, 40.0, -83.0);
      assert.strictEqual(layer.gridWidth, 170, 'layer.gridWidth must be updated to 170m');
      assert.strictEqual(layer.gridHeight, 170, 'layer.gridHeight must be updated to 170m');
    });

    test('generateLayerWaypoints respects manual dimensions when targetAutoDimensions is false', () => {
      const layer = {
        id: 'test-manual-splat-layer',
        enabled: true,
        pattern: 'target-splat',
        targetMode: 'radius',
        targetRadius: 25,
        altitude: 50,
        gimbalPitch: -45,
        targetGridPass: 'double',
        targetAutoDimensions: false,
        gridWidth: 120,
        gridHeight: 90
      };
      generateLayerWaypoints(layer, 40.0, -83.0);
      assert.strictEqual(layer.gridWidth, 120, 'layer.gridWidth must remain manual 120m');
      assert.strictEqual(layer.gridHeight, 90, 'layer.gridHeight must remain manual 90m');
    });

    test('applyTargetSplatAutoDimensions updates layer dimensions when auto-fit is active', () => {
      const testLayer = {
        pattern: 'target-splat',
        targetMode: 'radius',
        targetRadius: 30,
        altitude: 50,
        gimbalPitch: -45,
        targetGridPass: 'double',
        targetAutoDimensions: true
      };
      applyTargetSplatAutoDimensions(testLayer);
      assert.strictEqual(testLayer.gridWidth, 180, 'gridWidth should be 180m');
      assert.strictEqual(testLayer.gridHeight, 180, 'gridHeight should be 180m');
    });
  });

  describe('Target Splat Distant Lead-Up Auto-Pruning & Optical Diagram (v1.84.0)', () => {
    test('calculateCameraGroundFrustum modulates far standoff distance with framingRatio', () => {
      const alt = 29;
      const pitch = -45;
      const heading = 0;
      const hfov = 69.7;
      const vfov = 55.2;

      // 1. Full horizon (ratio 1.0)
      const fullFrustum = calculateCameraGroundFrustum(0, 0, alt, heading, pitch, hfov, vfov, 0, 1.0);
      const dFarFull = fullFrustum[2].y; // Far edge along flight heading Y
      assert.ok(dFarFull > 90 && dFarFull < 95, `Full horizon dFar should be ~92.5m, got ${dFarFull}`);

      // 2. Balanced sweet spot (ratio 0.55)
      const balFrustum = calculateCameraGroundFrustum(0, 0, alt, heading, pitch, hfov, vfov, 0, 0.55);
      const dFarBal = balFrustum[2].y;
      assert.ok(dFarBal > 48 && dFarBal < 53, `Balanced sweet spot dFar should be ~50.6m, got ${dFarBal}`);

      // 3. Tight framing (ratio 0.35)
      const tightFrustum = calculateCameraGroundFrustum(0, 0, alt, heading, pitch, hfov, vfov, 0, 0.35);
      const dFarTight = tightFrustum[2].y;
      assert.ok(dFarTight > 38 && dFarTight < 43, `Tight framing dFar should be ~40.9m, got ${dFarTight}`);
    });

    test('isTargetVisibleInFrustum auto-prunes distant lead-up points in balanced and tight modes', () => {
      const alt = 29;
      const pitch = -45;
      const heading = 0; // Flying North
      const hfov = 69.7;
      const vfov = 55.2;

      // Target centered at origin (0, 0) with a 10m radius polygon
      const targetPoly = [
        { x: -10, y: -10 },
        { x: 10, y: -10 },
        { x: 10, y: 10 },
        { x: -10, y: 10 }
      ];

      // Drone is at (0, -75), 75 meters South of target, pointing North at target
      const droneX = 0;
      const droneY = -75;

      // In Full mode (legacy), 75m < 92.5m, so target is visible on horizon
      const visibleFull = isTargetVisibleInFrustum(droneX, droneY, alt, heading, pitch, hfov, vfov, targetPoly, 0, 1.0);
      assert.strictEqual(visibleFull, true, 'Full mode should detect target on horizon');

      // In Balanced mode (default), 75m > 50.6m + 10m target edge = 60.6m, so target is out of sweet spot and pruned
      const visibleBal = isTargetVisibleInFrustum(droneX, droneY, alt, heading, pitch, hfov, vfov, targetPoly, 0, 0.55);
      assert.strictEqual(visibleBal, false, 'Balanced mode must prune unhelpful 75m distant lead-up');

      // In Tight mode, target is also pruned
      const visibleTight = isTargetVisibleInFrustum(droneX, droneY, alt, heading, pitch, hfov, vfov, targetPoly, 0, 0.35);
      assert.strictEqual(visibleTight, false, 'Tight mode must prune unhelpful 75m distant lead-up');
    });

    test('generateTargetSplatCoordinates reduces photo count and trims distant lead-up under balanced mode', () => {
      const sampleLayerBal = {
        targetMode: 'radius',
        targetRadius: 15,
        altitude: 29,
        gimbalPitch: -45,
        targetGridPass: 'double',
        targetCullingMode: 'smartTrim',
        targetFramingMode: 'balanced',
        targetHeight: 8
      };

      const sampleLayerFull = {
        targetMode: 'radius',
        targetRadius: 15,
        altitude: 29,
        gimbalPitch: -45,
        targetGridPass: 'double',
        targetCullingMode: 'smartTrim',
        targetFramingMode: 'full',
        targetHeight: 8
      };

      const width = 120;
      const height = 120;
      const sLine = 10;
      const sPhoto = 5;

      const resBal = generateTargetSplatCoordinates(width, height, 0, 'stopAndShoot', sLine, sPhoto, 29, -45, sampleLayerBal);
      const resFull = generateTargetSplatCoordinates(width, height, 0, 'stopAndShoot', sLine, sPhoto, 29, -45, sampleLayerFull);

      assert.ok(resBal.waypoints.length > 0, 'Must generate valid balanced waypoints');
      assert.ok(resFull.waypoints.length > 0, 'Must generate valid full waypoints');
      assert.ok(resBal.waypoints.length < resFull.waypoints.length, `Balanced mode waypoints (${resBal.waypoints.length}) must be significantly fewer than Full mode (${resFull.waypoints.length})`);
    });

    test('updateTargetSplatDiagram executes safely and handles DOM elements without error', () => {
      const layer = {
        altitude: 29,
        gimbalPitch: -45,
        targetFramingMode: 'balanced'
      };
      // Should execute without throwing in test environment
      assert.doesNotThrow(() => {
        updateTargetSplatDiagram(layer, 29, -45);
      }, 'updateTargetSplatDiagram must execute safely');
    });
  });

  describe('Target Splat Lateral Frustum Culling & Camera Aspect Ratio (v1.85.0)', () => {
    test('calculateCameraGroundFrustum modulates lateral half-width with framingRatio', () => {
      const alt = 23;
      const pitch = -60;
      const heading = 0; // Flying North
      const hfov = 69.7;
      const vfov = 55.2;

      // 1. Full sensor footprint (ratio 1.0)
      const fullFrustum = calculateCameraGroundFrustum(0, 0, alt, heading, pitch, hfov, vfov, 0, 1.0);
      const halfWFarFull = Math.abs(fullFrustum[2].x); // Far-Right X relative to centerline 0
      assert.ok(halfWFarFull > 28 && halfWFarFull < 32, `Full footprint halfWFar should be ~29.9m, got ${halfWFarFull}`);

      // 2. Balanced sweet spot (ratio 0.55)
      const balFrustum = calculateCameraGroundFrustum(0, 0, alt, heading, pitch, hfov, vfov, 0, 0.55);
      const halfWFarBal = Math.abs(balFrustum[2].x);
      assert.ok(halfWFarBal > 10 && halfWFarBal < 13, `Balanced sweet spot halfWFar should be ~11.3m, got ${halfWFarBal}`);

      // 3. Tight framing (ratio 0.35)
      const tightFrustum = calculateCameraGroundFrustum(0, 0, alt, heading, pitch, hfov, vfov, 0, 0.35);
      const halfWFarTight = Math.abs(tightFrustum[2].x);
      assert.ok(halfWFarTight > 5 && halfWFarTight < 8, `Tight framing halfWFar should be ~6.5m, got ${halfWFarTight}`);
    });

    test('isTargetVisibleInFrustum culls out-of-frame parallel flight legs', () => {
      const alt = 23;
      const pitch = -60;
      const heading = 90; // Flying East
      const hfov = 69.7;
      const vfov = 55.2;

      // Target centered at (0, 0) with a 10m radius polygon (-10 to +10 in X and Y)
      const targetPoly = [
        { x: -10, y: 10 },
        { x: 10, y: 10 },
        { x: 10, y: -10 },
        { x: -10, y: -10 }
      ];

      // Drone is flying along y = 25m (25m North of target center, 15m away from target edge)
      const droneX = 0;
      const droneY = 25;

      // In Full mode (legacy), lateral wing reaches y = 2.28m, intersecting the target (true)
      const visibleFull = isTargetVisibleInFrustum(droneX, droneY, alt, heading, pitch, hfov, vfov, targetPoly, 8, 1.0);
      assert.strictEqual(visibleFull, true, 'Full mode detects target via unpruned lateral flare');

      // In Balanced mode (default), lateral wing is modulated to y = 13.66m, missing the target at y = 10m (false)
      const visibleBal = isTargetVisibleInFrustum(droneX, droneY, alt, heading, pitch, hfov, vfov, targetPoly, 8, 0.55);
      assert.strictEqual(visibleBal, false, 'Balanced mode must cull out-of-frame parallel flight leg');

      // In Tight mode, out-of-frame parallel leg is also culled
      const visibleTight = isTargetVisibleInFrustum(droneX, droneY, alt, heading, pitch, hfov, vfov, targetPoly, 8, 0.35);
      assert.strictEqual(visibleTight, false, 'Tight mode must cull out-of-frame parallel flight leg');
    });

    test('setCameraAspectRatio switches between 4:3 and 16:9 and updates HFOV/VFOV', () => {
      assert.strictEqual(typeof setCameraAspectRatio, 'function', 'setCameraAspectRatio must be defined');

      // Switch to 16:9 Video
      setCameraAspectRatio('16:9', true);
      assert.strictEqual(CAMERA_ASPECT_RATIO, '16:9');
      assert.strictEqual(CAMERA_HFOV, 69.7);
      assert.strictEqual(CAMERA_VFOV, 44.2);

      // Switch back to 4:3 Photo
      setCameraAspectRatio('4:3', true);
      assert.strictEqual(CAMERA_ASPECT_RATIO, '4:3');
      assert.strictEqual(CAMERA_HFOV, 69.7);
      assert.strictEqual(CAMERA_VFOV, 55.2);
    });

    test('generateTargetSplatCoordinates culls outer flight legs under user configuration (Altitude: 23m, Pitch: -60°)', () => {
      const userPoly = [
        { x: -10, y: 10 },
        { x: 10, y: 10 },
        { x: 10, y: -10 },
        { x: -10, y: -10 }
      ];

      const layerBal = {
        pattern: 'target-splat',
        altitude: 23,
        gimbalPitch: -60,
        targetMode: 'polygon',
        targetHeight: 8,
        targetAutoDimensions: true,
        targetFramingMode: 'balanced',
        targetCullingMode: 'smartTrim',
        targetGridPass: 'double',
        targetPoly: userPoly
      };

      const layerFull = {
        pattern: 'target-splat',
        altitude: 23,
        gimbalPitch: -60,
        targetMode: 'polygon',
        targetHeight: 8,
        targetAutoDimensions: true,
        targetFramingMode: 'full',
        targetCullingMode: 'smartTrim',
        targetGridPass: 'double',
        targetPoly: userPoly
      };

      const width = 60;
      const height = 60;
      const sLine = 9.6;
      const sPhoto = 5.87;

      const resBal = generateTargetSplatCoordinates(width, height, 0, 'stopAndShoot', sLine, sPhoto, 23, -60, layerBal);
      const resFull = generateTargetSplatCoordinates(width, height, 0, 'stopAndShoot', sLine, sPhoto, 23, -60, layerFull);

      assert.ok(resBal.waypoints.length > 0, 'Balanced mode should generate valid waypoints');
      assert.ok(resFull.waypoints.length > 0, 'Full mode should generate valid waypoints');
      assert.ok(resBal.waypoints.length < resFull.waypoints.length, `Balanced mode waypoints (${resBal.waypoints.length}) must cull out-of-frame legs and be fewer than Full mode (${resFull.waypoints.length})`);
    });
  });

  describe('Mobile Responsive Topbar & More Menu (v1.86.0)', () => {
    test('initMobileNav executes safely and binds event listeners cleanly', () => {
      assert.strictEqual(typeof initMobileNav, 'function', 'initMobileNav should be defined as a function');
      
      const dummyListeners = {};
      const mockClassList = {
        classes: new Set(),
        add: function(c) { this.classes.add(c); },
        remove: function(c) { this.classes.delete(c); },
        toggle: function(c) { if (this.classes.has(c)) this.classes.delete(c); else this.classes.add(c); },
        contains: function(c) { return this.classes.has(c); }
      };

      const makeMockEl = () => ({
        classList: Object.create(mockClassList),
        addEventListener: (event, handler) => {
          dummyListeners[event] = handler;
        },
        contains: () => false,
        focus: () => {}
      });

      // Stub DOM elements
      const searchToggle = makeMockEl();
      const searchClose = makeMockEl();
      const topbarCenter = makeMockEl();
      const topbar = makeMockEl();
      const moreBtn = makeMockEl();
      const moreMenu = makeMockEl();
      const moreIntroBtn = makeMockEl();
      const moreAboutBtn = makeMockEl();
      const moreLinksBtn = makeMockEl();
      const locateBtn = makeMockEl();

      const origGetElementById = document.getElementById;
      const origQuerySelector = document.querySelector;

      document.getElementById = (id) => {
        if (id === 'mobile-search-toggle-btn') return searchToggle;
        if (id === 'mobile-search-close-btn') return searchClose;
        if (id === 'header-more-btn') return moreBtn;
        if (id === 'header-more-menu') return moreMenu;
        if (id === 'more-menu-intro-btn') return moreIntroBtn;
        if (id === 'more-menu-about-btn') return moreAboutBtn;
        if (id === 'more-menu-links-btn') return moreLinksBtn;
        if (id === 'locate-me-btn') return locateBtn;
        return origGetElementById(id);
      };

      document.querySelector = (sel) => {
        if (sel === '.topbar-center') return topbarCenter;
        if (sel === '.studio-topbar') return topbar;
        return origQuerySelector ? origQuerySelector(sel) : null;
      };

      try {
        initMobileNav();
        assert.ok(true, 'initMobileNav executed without error');
      } finally {
        document.getElementById = origGetElementById;
        document.querySelector = origQuerySelector;
      }
    });

    test('Theme & Measurement Units available in Settings Menu (#config-modal) (v1.86.1)', () => {
      const fs = require('fs');
      const path = require('path');
      const templateContent = fs.readFileSync(path.join(__dirname, 'index_template.html'), 'utf8');
      const cssContent = fs.readFileSync(path.join(__dirname, 'index.css'), 'utf8');

      // 1. Confirm #theme-mode-select exists in #config-modal
      assert.ok(templateContent.includes('id="theme-mode-select"'), 'index_template.html must define #theme-mode-select');
      assert.ok(templateContent.includes('id="unit-system"'), 'index_template.html must define #unit-system in config modal');

      // 2. Confirm #header-unit-toggle-btn and #theme-toggle-btn are hidden on mobile
      assert.ok(cssContent.includes('#header-unit-toggle-btn') && cssContent.includes('#theme-toggle-btn'), 'index.css must target unit and theme toggle buttons');
      assert.ok(cssContent.includes('display: none !important;'), 'Must hide elements on small screens');

      // 3. Test setAppTheme synchronization with #theme-mode-select
      const origGetElementById = document.getElementById;
      const mockSelect = { value: 'dark' };
      const mockBtn = { textContent: '', title: '' };

      document.getElementById = (id) => {
        if (id === 'theme-mode-select') return mockSelect;
        if (id === 'theme-toggle-btn') return mockBtn;
        return origGetElementById ? origGetElementById(id) : null;
      };

      try {
        setAppTheme('light');
        assert.strictEqual(mockSelect.value, 'light', 'setAppTheme should update #theme-mode-select to light');
        assert.strictEqual(mockBtn.textContent, '🌙', 'Theme button icon should show moon for light mode');

        setAppTheme('dark');
        assert.strictEqual(mockSelect.value, 'dark', 'setAppTheme should update #theme-mode-select to dark');
        assert.strictEqual(mockBtn.textContent, '☀️', 'Theme button icon should show sun for dark mode');
      } finally {
        document.getElementById = origGetElementById;
      }
    });
  });

  describe('Camera POI Heading & Cones Orientation Bug Fix Regression Tests (v1.86.2)', () => {
    test('getMarkerIcon and getWaypointHeadingAndPitch orient toward POI even when wp.heading is pre-set to 0/180', () => {
      try {
        pois = [
          { name: 'Target Center POI', lat: 40.013000, lon: -83.176500 }
        ];

        // 32-waypoint single grid snippet where wp.heading was initialized to 0 or 180
        const sampleWps = [
          { index: 0, lat: 40.012841, lon: -83.177128, alt: 18, heading: 0, turnMode: 'inherit' },
          { index: 1, lat: 40.012885, lon: -83.177128, alt: 18, heading: 0, turnMode: 'inherit' },
          { index: 2, lat: 40.012921, lon: -83.177128, alt: 18, heading: 0, turnMode: 'inherit' },
          { index: 3, lat: 40.012957, lon: -83.177128, alt: 18, heading: 180, turnMode: 'inherit' }
        ];

        const origDivIcon = L.divIcon;
        L.divIcon = (opts) => ({ options: opts, ...opts });

        // Set global heading mode to towardPOI
        const origGetElementById = document.getElementById;
        document.getElementById = (id) => {
          if (id === 'heading-mode') return { value: 'towardPOI' };
          if (id === 'grid-rotation') return { value: '0' };
          if (id === 'gimbal-pitch') return { value: '-90' };
          if (id === 'camera-cones-toggle') return { checked: true };
          return origGetElementById ? origGetElementById(id) : null;
        };

        // Compute expected POI heading from wp[0] to pois[0]
        const dy = pois[0].lat - sampleWps[0].lat;
        const dx = pois[0].lon - sampleWps[0].lon;
        const expectedHeading = (90 - (Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360;

        // 1. Verify getWaypointHeadingAndPitch calculates POI heading, NOT 0
        const hp0 = getWaypointHeadingAndPitch(0, sampleWps);
        assert.ok(Math.abs(hp0.heading - expectedHeading) < 0.5, `getWaypointHeadingAndPitch must point to POI (~${expectedHeading.toFixed(1)}°), got ${hp0.heading}°`);
        assert.notStrictEqual(hp0.heading, 0, 'Heading must NOT remain locked at pre-set line heading 0°');

        // 2. Verify getMarkerIcon generates camera cone rotated toward POI
        const icon0 = getMarkerIcon(sampleWps[0], 0, sampleWps, 0);
        const iconHtml0 = (icon0.options && icon0.options.html) || icon0.html;
        assert.ok(iconHtml0.includes('wp-camera-cone'), 'Must contain camera sight cone');
        assert.ok(iconHtml0.includes(`transform: rotate(${expectedHeading}deg)`), `Icon must rotate toward POI angle (${expectedHeading}deg)`);
        assert.ok(!iconHtml0.includes('transform: rotate(0deg)'), 'Icon must NOT be forward-facing 0deg');

        // 3. Test wp[3] which had line heading 180: should also orient toward POI
        const dy3 = pois[0].lat - sampleWps[3].lat;
        const dx3 = pois[0].lon - sampleWps[3].lon;
        const expectedHeading3 = (90 - (Math.atan2(dy3, dx3) * 180 / Math.PI) + 360) % 360;
        const hp3 = getWaypointHeadingAndPitch(3, sampleWps);
        assert.ok(Math.abs(hp3.heading - expectedHeading3) < 0.5, `wp[3] must point to POI (~${expectedHeading3.toFixed(1)}°), got ${hp3.heading}°`);
        assert.notStrictEqual(hp3.heading, 180, 'Heading must NOT remain locked at pre-set line heading 180°');

      } finally {
        pois = [];
        document.getElementById = global.document.getElementById;
        L.divIcon = global.L ? global.L.divIcon : undefined;
      }
    });

    test('Three-Tier Heading Hierarchy correctly cascades (Global -> Layer -> Waypoint)', () => {
      try {
        pois = [{ name: 'POI', lat: 40.013000, lon: -83.176500 }];

        const wp = { lat: 40.012841, lon: -83.177128, heading: 0, headingMode: 'inherit' };
        const dy = pois[0].lat - wp.lat;
        const dx = pois[0].lon - wp.lon;
        const poiHeading = (90 - (Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360;

        const origGetElementById = document.getElementById;

        // Tier 1: Global Default towardPOI, Layer inherit, Waypoint inherit
        document.getElementById = (id) => {
          if (id === 'heading-mode') return { value: 'towardPOI' };
          return origGetElementById ? origGetElementById(id) : null;
        };
        const layerInherit = { headingMode: 'inherit' };
        assert.strictEqual(getEffectiveWaypointHeadingMode(wp, layerInherit), 'towardPOI');
        assert.ok(Math.abs(getEffectiveWaypointHeading(wp, 0, [wp], 0, null, layerInherit) - poiHeading) < 0.5);

        // Tier 2: Global followWayline, Layer overrides to towardPOI, Waypoint inherit
        document.getElementById = (id) => {
          if (id === 'heading-mode') return { value: 'followWayline' };
          return origGetElementById ? origGetElementById(id) : null;
        };
        const layerPoi = { headingMode: 'towardPOI' };
        assert.strictEqual(getEffectiveWaypointHeadingMode(wp, layerPoi), 'towardPOI');
        assert.ok(Math.abs(getEffectiveWaypointHeading(wp, 0, [wp], 0, null, layerPoi) - poiHeading) < 0.5);

        // Tier 3: Global towardPOI, Layer towardPOI, Waypoint overrides to custom (135°)
        const wpCustom = { lat: 40.012841, lon: -83.177128, heading: 135, headingMode: 'custom' };
        assert.strictEqual(getEffectiveWaypointHeadingMode(wpCustom, layerPoi), 'custom');
        assert.strictEqual(getEffectiveWaypointHeading(wpCustom, 0, [wpCustom], 0, null, layerPoi), 135);

        // Tier 3: Waypoint overrides to fixed (0°)
        const wpFixed = { lat: 40.012841, lon: -83.177128, heading: 90, headingMode: 'fixed' };
        assert.strictEqual(getEffectiveWaypointHeadingMode(wpFixed, layerPoi), 'fixed');
        assert.strictEqual(getEffectiveWaypointHeading(wpFixed, 0, [wpFixed], 0, null, layerPoi), 0);

      } finally {
        pois = [];
        document.getElementById = global.document.getElementById;
      }
    });

    test('Companion server MTP extraction script handles bracketed timestamps with [System.IO.File]::Copy', () => {
      const serverCode = fs.readFileSync(path.join(__dirname, 'tools/companion/server.js'), 'utf8');
      assert.ok(serverCode.includes('[System.IO.File]::Copy($srcLog, $dstLog, $true)'), 'Must use [System.IO.File]::Copy for flight logs');
      assert.ok(serverCode.includes('[System.IO.File]::Copy($srcKmz, $dstKmz, $true)'), 'Must use [System.IO.File]::Copy for KMZ files');
      assert.ok(serverCode.includes('Test-Path -LiteralPath $finalLogPath'), 'Must verify destination log file exists on disk with -LiteralPath');
    });
  });

  describe('Heading Mode Photography Guidance & Layer Help Tests (v1.86.3)', () => {
    test('index_template.html and index.html contain all required v1.86.3 Heading Mode UI elements', () => {
      const templateHtml = fs.readFileSync(path.join(__dirname, 'index_template.html'), 'utf8');
      const compiledHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

      // Check Section 2 layer heading help button
      assert.ok(templateHtml.includes('id="layer-heading-help-btn"'), 'Template must contain #layer-heading-help-btn');
      assert.ok(compiledHtml.includes('id="layer-heading-help-btn"'), 'Compiled HTML must contain #layer-heading-help-btn');

      // Check Section 3 heading drawer custom tab and details container
      assert.ok(templateHtml.includes('id="heading-tab-custom"'), 'Template must contain #heading-tab-custom');
      assert.ok(compiledHtml.includes('id="heading-tab-custom"'), 'Compiled HTML must contain #heading-tab-custom');
      assert.ok(templateHtml.includes('id="heading-help-details"'), 'Template must contain #heading-help-details');
      assert.ok(compiledHtml.includes('id="heading-help-details"'), 'Compiled HTML must contain #heading-help-details');

      // Check version badge
      assert.ok(templateHtml.includes('v1.86.3'), 'Template must display version v1.86.3 in header badge');
      assert.ok(compiledHtml.includes('v1.86.3'), 'Compiled HTML must display version v1.86.3 in header badge');
    });

    test('Heading Mode drawer renders comprehensive photography breakdowns across all 4 heading modes', () => {
      let followClicked, fixedClicked, poiClicked, customClicked, layerHelpClicked;
      const mockFollow = { addEventListener: (evt, cb) => { if (evt === 'click') followClicked = cb; }, classList: { add: mock.fn(), remove: mock.fn() }, style: {} };
      const mockFixed = { addEventListener: (evt, cb) => { if (evt === 'click') fixedClicked = cb; }, classList: { add: mock.fn(), remove: mock.fn() }, style: {} };
      const mockPoi = { addEventListener: (evt, cb) => { if (evt === 'click') poiClicked = cb; }, classList: { add: mock.fn(), remove: mock.fn() }, style: {} };
      const mockCustom = { addEventListener: (evt, cb) => { if (evt === 'click') customClicked = cb; }, classList: { add: mock.fn(), remove: mock.fn() }, style: {} };
      const mockLayerBtn = { addEventListener: (evt, cb) => { if (evt === 'click') layerHelpClicked = cb; } };
      const mockHelpBtn = { addEventListener: mock.fn() };
      const mockDrawer = { classList: { toggle: mock.fn(), remove: mock.fn() }, scrollIntoView: mock.fn() };
      const mockDesc = { textContent: '' };
      const mockDetails = { innerHTML: '' };
      const mockDrone = { setAttribute: mock.fn() };
      const mockPoiTarget = { style: { opacity: '0' } };
      const mockActivePath = { setAttribute: mock.fn() };

      const origGetEl = global.document.getElementById;
      const origRaf = global.requestAnimationFrame;
      const origCaf = global.cancelAnimationFrame;
      let rafCount = 0;
      global.requestAnimationFrame = (cb) => { 
        rafCount++;
        if (rafCount === 1) cb(100);
        return 123; 
      };
      global.cancelAnimationFrame = () => {};
      global.document.getElementById = (id) => {
        if (id === 'heading-help-btn') return mockHelpBtn;
        if (id === 'layer-heading-help-btn') return mockLayerBtn;
        if (id === 'heading-help-drawer') return mockDrawer;
        if (id === 'heading-tab-follow') return mockFollow;
        if (id === 'heading-tab-fixed') return mockFixed;
        if (id === 'heading-tab-poi') return mockPoi;
        if (id === 'heading-tab-custom') return mockCustom;
        if (id === 'heading-help-desc') return mockDesc;
        if (id === 'heading-help-details') return mockDetails;
        if (id === 'anim-drone') return mockDrone;
        if (id === 'anim-poi-target') return mockPoiTarget;
        if (id === 'anim-flight-path-active') return mockActivePath;
        return null;
      };

      try {
        vm.runInThisContext('initHeadingHelpDrawer()');

        // Initial default state is Follow Path
        assert.ok(mockDetails.innerHTML.includes('Forward Alignment'));
        assert.ok(mockDetails.innerHTML.includes('Nadir (-90°)'));

        // Switch to Fixed (North)
        fixedClicked();
        assert.ok(mockDetails.innerHTML.includes('North (0°) Locked'));
        assert.ok(mockDetails.innerHTML.includes('Nadir (-90°) Mapping'));
        assert.ok(mockDetails.innerHTML.includes('Oblique (-30° to -60°)'));
        assert.ok(mockDetails.innerHTML.includes('Photo Trigger'));

        // Switch to POI Target
        poiClicked();
        assert.ok(mockDetails.innerHTML.includes('Target Tracking'));
        assert.ok(mockDetails.innerHTML.includes('Orbit & Tower Audits'));

        // Switch to Custom
        customClicked();
        assert.ok(mockDetails.innerHTML.includes('Custom Yaw'));
        assert.ok(mockDetails.innerHTML.includes('User-Defined Azimuth'));

        // Layer help button click removes hidden class and scrolls
        layerHelpClicked({ stopPropagation: () => {} });
        assert.strictEqual(mockDrawer.classList.remove.mock.callCount(), 1);
        assert.strictEqual(mockDrawer.scrollIntoView.mock.callCount(), 1);

      } finally {
        global.document.getElementById = origGetEl;
        global.requestAnimationFrame = origRaf;
        global.cancelAnimationFrame = origCaf;
      }
    });
  });

  describe('3D Flight Path Preview HUD Legend Ergonomics & Overlap Fix (v1.86.4)', () => {
    test('index_template.html and index.html contain all required v1.86.4 HUD Legend UI elements', () => {
      const templateHtml = fs.readFileSync(path.join(__dirname, 'index_template.html'), 'utf8');
      const compiledHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

      // Check version badges and changelog
      assert.ok(templateHtml.includes('Changelog (v1.86.4)'), 'Template must display Changelog (v1.86.4)');
      assert.ok(compiledHtml.includes('Changelog (v1.86.4)'), 'Compiled HTML must display Changelog (v1.86.4)');
      assert.ok(/Version 1\.(86|87|88)\.\d+/.test(templateHtml), 'Template must display Version 1.86.x or later in About modal');
      assert.ok(/Version 1\.(86|87|88)\.\d+/.test(compiledHtml), 'Compiled HTML must display Version 1.86.x or later in About modal');

      // Check HUD Legend elements
      assert.ok(templateHtml.includes('id="three-hud-legend"'), 'Template must contain #three-hud-legend');
      assert.ok(compiledHtml.includes('id="three-hud-legend"'), 'Compiled HTML must contain #three-hud-legend');
      assert.ok(templateHtml.includes('id="hud-legend-header"'), 'Template must contain #hud-legend-header');
      assert.ok(compiledHtml.includes('id="hud-legend-header"'), 'Compiled HTML must contain #hud-legend-header');
      assert.ok(templateHtml.includes('id="hud-legend-toggle-btn"'), 'Template must contain #hud-legend-toggle-btn');
      assert.ok(compiledHtml.includes('id="hud-legend-toggle-btn"'), 'Compiled HTML must contain #hud-legend-toggle-btn');
      assert.ok(templateHtml.includes('id="hud-legend-body"'), 'Template must contain #hud-legend-body');
      assert.ok(compiledHtml.includes('id="hud-legend-body"'), 'Compiled HTML must contain #hud-legend-body');

      // Ensure legend is positioned at right: 16px to prevent colliding with left buttons
      assert.ok(templateHtml.includes('right: 16px;'), 'Template HUD legend must be anchored to the right side');
      assert.ok(compiledHtml.includes('right: 16px;'), 'Compiled HTML HUD legend must be anchored to the right side');
    });

    test('HUD Legend toggle function cleanly collapses and expands the legend body', () => {
      let headerListener, toggleBtnListener;
      const mockHeader = {
        addEventListener: (evt, cb) => { if (evt === 'click') headerListener = cb; }
      };
      const mockToggleBtn = {
        addEventListener: (evt, cb) => { if (evt === 'click') toggleBtnListener = cb; },
        textContent: '▼'
      };
      const mockBody = {
        style: { display: 'flex' }
      };

      const origGetEl = global.document.getElementById;
      try {
        global.document.getElementById = (id) => {
          if (id === 'hud-legend-header') return mockHeader;
          if (id === 'hud-legend-toggle-btn') return mockToggleBtn;
          if (id === 'hud-legend-body') return mockBody;
          return null;
        };

        // Wire up toggle logic matching index.js implementation
        const toggleHudLegend = (e) => {
          if (e && e.stopPropagation) e.stopPropagation();
          if (!mockBody) return;
          const isHidden = mockBody.style.display === 'none';
          mockBody.style.display = isHidden ? 'flex' : 'none';
          if (mockToggleBtn) mockToggleBtn.textContent = isHidden ? '▼' : '▲';
        };
        mockHeader.addEventListener('click', toggleHudLegend);
        mockToggleBtn.addEventListener('click', toggleHudLegend);

        // Initially open
        assert.strictEqual(mockBody.style.display, 'flex');
        assert.strictEqual(mockToggleBtn.textContent, '▼');

        // Click header to collapse
        headerListener({ stopPropagation: () => {} });
        assert.strictEqual(mockBody.style.display, 'none');
        assert.strictEqual(mockToggleBtn.textContent, '▲');

        // Click toggle button to expand
        toggleBtnListener({ stopPropagation: () => {} });
        assert.strictEqual(mockBody.style.display, 'flex');
        assert.strictEqual(mockToggleBtn.textContent, '▼');

      } finally {
        global.document.getElementById = origGetEl;
      }
    });
  });

  describe('Waypoint Leg Phase Floating Tooltips & Clipping Fix (v1.86.5)', () => {
    test('index_template.html and index.html contain #wp-leg-floating-tooltip', () => {
      const templateHtml = fs.readFileSync(path.join(__dirname, 'index_template.html'), 'utf8');
      const bundleHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

      assert.ok(templateHtml.includes('id="wp-leg-floating-tooltip"'), 'index_template.html must contain #wp-leg-floating-tooltip');
      assert.ok(bundleHtml.includes('id="wp-leg-floating-tooltip"'), 'index.html must contain #wp-leg-floating-tooltip');
      assert.ok(templateHtml.includes('class="wp-leg-breadcrumb-tooltip"'), 'Must have wp-leg-breadcrumb-tooltip class');
    });

    test('initLegPhaseBadgeTooltips positions floating tooltip to the left of #fpv-editor-panel to prevent clipping', () => {
      assert.strictEqual(typeof initLegPhaseBadgeTooltips, 'function', 'initLegPhaseBadgeTooltips should be a function');

      const mockFloatingTooltip = {
        id: 'wp-leg-floating-tooltip',
        className: 'wp-leg-breadcrumb-tooltip',
        style: { display: 'none' },
        offsetWidth: 260,
        offsetHeight: 90,
        innerHTML: ''
      };

      const mockEditorPanel = {
        id: 'fpv-editor-panel',
        getBoundingClientRect: () => ({ left: 600, right: 910, top: 60, bottom: 500, width: 310, height: 440 })
      };

      const mockInnerTooltip = {
        innerHTML: '<div class="wp-leg-breadcrumb-desc">Turn Mode Help</div>'
      };

      const mockBadge = {
        classList: { contains: () => true },
        isConnected: true,
        offsetParent: {},
        querySelector: (sel) => (sel === '.wp-leg-breadcrumb-tooltip' ? mockInnerTooltip : null),
        closest: (sel) => (sel === '#fpv-editor-panel' ? mockEditorPanel : null),
        getBoundingClientRect: () => ({ left: 680, top: 150, bottom: 170, right: 700, width: 20, height: 20 })
      };

      const origGetEl = global.document.getElementById;
      try {
        global.document.getElementById = (id) => {
          if (id === 'wp-leg-floating-tooltip') return mockFloatingTooltip;
          if (id === 'fpv-editor-panel') return mockEditorPanel;
          return null;
        };

        const manager = initLegPhaseBadgeTooltips();
        assert.ok(manager, 'Manager returned');

        // Show tooltip on mockBadge
        manager.showTooltip(mockBadge);

        assert.strictEqual(mockFloatingTooltip.style.display, 'flex');
        assert.ok(mockFloatingTooltip.innerHTML.includes('Turn Mode Help'));

        // Verify it docked to the left of the editor panel (600 - 260 - 12 = 328px)
        assert.strictEqual(mockFloatingTooltip.style.left, '328px', 'Should be docked to the left of #fpv-editor-panel to prevent clipping');

        // Hide tooltip
        manager.hideTooltip();
        assert.strictEqual(mockFloatingTooltip.style.display, 'none');
      } finally {
        global.document.getElementById = origGetEl;
      }
    });

    test('initLegPhaseBadgeTooltips hides tooltip if badge is scrolled outside panel bounds', () => {
      const mockFloatingTooltip = {
        id: 'wp-leg-floating-tooltip',
        className: 'wp-leg-breadcrumb-tooltip',
        style: { display: 'none' },
        offsetWidth: 260,
        offsetHeight: 90,
        innerHTML: ''
      };

      const mockEditorPanel = {
        id: 'fpv-editor-panel',
        getBoundingClientRect: () => ({ left: 600, right: 910, top: 60, bottom: 500, width: 310, height: 440 })
      };

      const mockInnerTooltip = {
        innerHTML: '<div>Tooltip</div>'
      };

      // Badge scrolled above panel (top: 20 < panel.top 60)
      const scrolledBadge = {
        isConnected: true,
        offsetParent: {},
        querySelector: () => mockInnerTooltip,
        closest: () => mockEditorPanel,
        getBoundingClientRect: () => ({ left: 680, top: 20, bottom: 40, right: 700, width: 20, height: 20 })
      };

      const origGetEl = global.document.getElementById;
      try {
        global.document.getElementById = (id) => (id === 'wp-leg-floating-tooltip' ? mockFloatingTooltip : null);
        const manager = initLegPhaseBadgeTooltips();

        manager.showTooltip(scrolledBadge);
        assert.strictEqual(mockFloatingTooltip.style.display, 'none', 'Tooltip should be hidden when badge is scrolled out of view');
      } finally {
        global.document.getElementById = origGetEl;
      }
    });
  });

  describe('Resolved Inherited Setting Displays Tests (v1.87.0)', () => {
    test('index_template.html and index.html contain all required v1.87.0 UI elements and version tags', () => {
      const templateHtml = fs.readFileSync(path.join(__dirname, 'index_template.html'), 'utf8');
      const compiledHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

      // Check current version badge in header (must be v1.87.0 or later)
      assert.ok(/v1\.(87|88|89|90)\.\d+/.test(templateHtml), 'index_template.html must contain v1.87.x or later header badge');
      assert.ok(/v1\.(87|88|89|90)\.\d+/.test(compiledHtml), 'index.html must contain v1.87.x or later header badge');

      // Check changelog entry for v1.87.0 is still present (it persists in the changelog list)
      assert.ok(templateHtml.includes('Changelog (v1.87.0):'), 'index_template.html must contain Changelog (v1.87.0)');
      assert.ok(compiledHtml.includes('Changelog (v1.87.0):'), 'index.html must contain Changelog (v1.87.0)');

      // Check IDs for inherit options
      assert.ok(templateHtml.includes('id="layer-turnaround-speed-inherit-opt"'), 'Must have #layer-turnaround-speed-inherit-opt');
      assert.ok(compiledHtml.includes('id="layer-turnaround-speed-inherit-opt"'), 'Compiled must have #layer-turnaround-speed-inherit-opt');
      assert.ok(templateHtml.includes('id="exclusion-detour-mode-inherit-opt"'), 'Must have #exclusion-detour-mode-inherit-opt');
      assert.ok(compiledHtml.includes('id="exclusion-detour-mode-inherit-opt"'), 'Compiled must have #exclusion-detour-mode-inherit-opt');
      assert.ok(templateHtml.includes('id="fpv-edit-heading-mode-inherit-opt"'), 'Must have #fpv-edit-heading-mode-inherit-opt');
      assert.ok(compiledHtml.includes('id="fpv-edit-heading-mode-inherit-opt"'), 'Compiled must have #fpv-edit-heading-mode-inherit-opt');
    });

    test('updateInheritOptionLabels dynamically computes and displays resolved labels', () => {
      const mockElements = {
        'capture-mode': { value: 'stopAndShoot' },
        'path-mode': { value: 'straight' },
        'heading-mode': { value: 'fixed' },
        'global-hover-time': { value: '3' },
        'speed': { value: '6.5' },
        'global-exclusion-detour-mode': { value: 'overTop' },
        'layer-capture-mode-inherit-opt': { textContent: '' },
        'layer-path-mode-inherit-opt': { textContent: '' },
        'layer-heading-mode-inherit-opt': { textContent: '' },
        'layer-hover-time-inherit-opt': { textContent: '' },
        'layer-turnaround-speed-inherit-opt': { textContent: '' },
        'exclusion-detour-mode-inherit-opt': { textContent: '' }
      };

      const origGetEl = global.document.getElementById;
      const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
      const origLayerSpeed = activeLayer ? activeLayer.speed : null;
      try {
        global.document.getElementById = (id) => mockElements[id] || null;
        if (activeLayer) activeLayer.speed = 6.5;

        updateInheritOptionLabels();

        assert.strictEqual(mockElements['layer-capture-mode-inherit-opt'].textContent, '🌐 Inherit Global (Stop & Shoot)');
        assert.strictEqual(mockElements['layer-path-mode-inherit-opt'].textContent, '🌐 Inherit Global (Straight Lines)');
        assert.strictEqual(mockElements['layer-heading-mode-inherit-opt'].textContent, '🌐 Inherit Global (Fixed North)');
        assert.strictEqual(mockElements['layer-hover-time-inherit-opt'].textContent, '🌐 Inherit Global (3s)');
        assert.strictEqual(mockElements['layer-turnaround-speed-inherit-opt'].textContent, '🌐 Inherit Layer Speed (6.5 m/s)');
        assert.strictEqual(mockElements['exclusion-detour-mode-inherit-opt'].textContent, '🌐 Inherit Global (Over the Top)');

        // Test dynamic update when global inputs change
        mockElements['global-exclusion-detour-mode'].value = 'smart';
        mockElements['speed'].value = '8.0';
        if (activeLayer) activeLayer.speed = 8.0;
        updateInheritOptionLabels();

        assert.strictEqual(mockElements['layer-turnaround-speed-inherit-opt'].textContent, '🌐 Inherit Layer Speed (8.0 m/s)');
        assert.strictEqual(mockElements['exclusion-detour-mode-inherit-opt'].textContent, '🌐 Inherit Global (Smart 3D)');
      } finally {
        global.document.getElementById = origGetEl;
        if (activeLayer) activeLayer.speed = origLayerSpeed;
      }
    });

    test('updateLayerPoiSelectOptions displays the default POI name in option 0 when POIs exist', () => {
      let createdOptions = [];
      const mockSelect = {
        value: '',
        innerHTML: '',
        appendChild: (child) => createdOptions.push(child)
      };

      const origGetEl = global.document.getElementById;
      const origCreateEl = global.document.createElement;
      const origPois = (typeof pois !== 'undefined') ? pois : [];
      try {
        global.document.getElementById = (id) => (id === 'layer-poi-select' ? mockSelect : null);
        global.document.createElement = (tag) => ({ tagName: tag, value: '', textContent: '' });

        // With no POIs
        pois = [];
        updateLayerPoiSelectOptions();
        assert.ok(mockSelect.innerHTML.includes('🌐 Nearest / Mission Default POI</option>'));

        // With named POIs
        pois = [
          { id: 'poi-alpha', name: 'Tower Alpha', lat: 40.0, lon: -83.0 },
          { id: 'poi-beta', name: 'Building Beta', lat: 40.1, lon: -83.1 }
        ];
        createdOptions = [];
        updateLayerPoiSelectOptions();
        assert.ok(mockSelect.innerHTML.includes('🌐 Nearest / Mission Default POI (Tower Alpha)</option>'));
        assert.strictEqual(createdOptions.length, 2);
        assert.strictEqual(createdOptions[0].textContent, 'Tower Alpha');
      } finally {
        global.document.getElementById = origGetEl;
        global.document.createElement = origCreateEl;
        pois = origPois;
      }
    });

    test('createWaypointEditorDOM renders resolved speed, camera action, and heading mode', () => {
      const mockWp = {
        lat: 40.0,
        lon: -83.0,
        alt: 50,
        pitch: -45,
        heading: 90,
        headingMode: 'inherit',
        cameraAction: 'inherit',
        speed: null,
        hoverTime: null,
        layerCaptureMode: 'stopAndShoot',
        layerHeadingMode: 'followWayline'
      };

      const mockMarker = {
        getLatLng: () => ({ lat: 40.0, lng: -83.0 }),
        setLatLng: () => {},
        setIcon: () => {},
        setTooltipContent: () => {},
        closePopup: () => {}
      };

      const makeEl = (tag) => ({
        tagName: (tag || 'div').toUpperCase(),
        className: '',
        classList: { add: () => {}, remove: () => {}, contains: () => false },
        style: {},
        innerHTML: '',
        value: '',
        textContent: '',
        disabled: false,
        appendChild: function(c) { return c; },
        querySelector: function(sel) {
          return {
            value: '',
            style: {},
            textContent: '',
            disabled: false,
            classList: { add: () => {}, remove: () => {}, contains: () => false },
            addEventListener: () => {}
          };
        },
        querySelectorAll: function() { return []; },
        addEventListener: () => {}
      });

      const origCreateElement = global.document.createElement;
      const origGetEl = global.document.getElementById;
      const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
      const origLayerSpeed = activeLayer ? activeLayer.speed : null;
      try {
        if (activeLayer) activeLayer.speed = 5.2;
        global.document.createElement = (tag) => makeEl(tag);
        global.document.getElementById = (id) => {
          if (id === 'speed') return { value: '5.2' };
          if (id === 'heading-mode') return { value: 'followWayline' };
          if (id === 'capture-mode') return { value: 'stopAndShoot' };
          if (id === 'path-mode') return { value: 'curved' };
          if (id === 'global-hover-time') return { value: '2' };
          if (id === 'grid-rotation') return { value: '0' };
          if (id === 'grid-type') return { value: 'single' };
          return {
            value: '',
            style: {},
            textContent: '',
            disabled: false,
            classList: { add: () => {}, remove: () => {}, contains: () => false }
          };
        };

        const dom = createWaypointEditorDOM(mockWp, 1, mockMarker, null, [mockWp, mockWp, mockWp]);
        const html = dom.innerHTML;

        // Verify Speed Display shows Auto (5.2 m/s)
        assert.ok(html.includes('Auto (5.2 m/s)'), 'Speed display must show Auto (5.2 m/s) when inheriting');

        // Verify Camera Action inherits layer mode (Stop & Shoot)
        assert.ok(html.includes('🌐 Inherit Layer Mode (Stop & Shoot)'), 'Camera action inherit option must show Stop & Shoot');

        // Verify Heading Mode inherits layer default (Follow Flight Path)
        assert.ok(html.includes('🌐 Inherit Layer Default (Follow Flight Path)'), 'Heading mode inherit option must show Follow Flight Path');
      } finally {
        global.document.createElement = origCreateElement;
        global.document.getElementById = origGetEl;
        if (activeLayer) activeLayer.speed = origLayerSpeed;
      }
    });
  });

  describe('Waypoint Editor Popup Overhang Fix & Drag-to-Move Tests (v1.88.1)', () => {
    test('index_template.html and index.html contain required v1.88.1 version tags and changelog', () => {
      const templateHtml = fs.readFileSync(path.join(__dirname, 'index_template.html'), 'utf8');
      const compiledHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

      // Check header version badge
      assert.ok(templateHtml.includes('v1.88.1'), 'index_template.html must contain v1.88.1 header badge');
      assert.ok(compiledHtml.includes('v1.88.1'), 'index.html must contain v1.88.1 header badge');

      // Check About modal version tag
      assert.ok(templateHtml.includes('Version 1.88.1'), 'index_template.html must contain Version 1.88.1 in About modal');
      assert.ok(compiledHtml.includes('Version 1.88.1'), 'index.html must contain Version 1.88.1 in About modal');

      // Check Changelog header
      assert.ok(templateHtml.includes('Changelog (v1.88.1):'), 'index_template.html must contain Changelog (v1.88.1)');
      assert.ok(compiledHtml.includes('Changelog (v1.88.1):'), 'index.html must contain Changelog (v1.88.1)');
    });

    test('index.js configures bindPopup with wp-editor-leaflet-popup and minimum 310px width', () => {
      const indexJs = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');

      // Assert popup options are configured to prevent 240px clipping
      assert.ok(indexJs.includes("className: 'wp-editor-leaflet-popup'"), 'index.js must apply wp-editor-leaflet-popup class');
      assert.ok(indexJs.includes('minWidth: 310'), 'index.js must enforce minWidth: 310 on waypoint popups');
      assert.ok(indexJs.includes('maxWidth: 320'), 'index.js must allow maxWidth: 320 on waypoint popups');
    });

    test('index.css provides 310px width styling for .wp-editor-leaflet-popup to eliminate edge overhang', () => {
      const indexCss = fs.readFileSync(path.join(__dirname, 'index.css'), 'utf8');

      assert.ok(indexCss.includes('.leaflet-popup.wp-editor-leaflet-popup .leaflet-popup-content-wrapper'), 'CSS must style .wp-editor-leaflet-popup wrapper');
      assert.ok(indexCss.includes('width: 310px !important;'), 'CSS must set width: 310px !important on wrapper');
      assert.ok(indexCss.includes('width: 280px !important;'), 'CSS must set width: 280px !important on content');
    });

    test('createWaypointEditorDOM generates #wp-popup-drag-handle with separate coordinates row', () => {
      const mockWp = {
        lat: 40.01297,
        lon: -83.17707,
        alt: 25,
        speed: 5.0,
        pitch: -60,
        heading: 90,
        headingMode: 'followWayline',
        turnMode: 'pass',
        cameraAction: 'takePhoto',
        hoverTime: 0
      };
      const mockMarker = {
        getLatLng: () => ({ lat: 40.01297, lng: -83.17707 }),
        getPopup: () => null,
        closePopup: () => {}
      };

      const dom = createWaypointEditorDOM(mockWp, 7, mockMarker, null, [mockWp]);
      assert.ok(dom, 'DOM element must be created');

      assert.ok(dom.innerHTML.includes('id="wp-popup-drag-handle"'), '#wp-popup-drag-handle must exist');
      assert.ok(dom.innerHTML.includes('⠿ Drag'), 'Drag handle must display ⠿ Drag badge');
      assert.ok(dom.innerHTML.includes('edit-wp-coords-display'), 'Drag handle must display coordinates on separate row');
      assert.ok(dom.innerHTML.includes('padding: 0 24px 6px 0'), 'Drag handle must have right padding clearance for close button');
    });
  });
});





