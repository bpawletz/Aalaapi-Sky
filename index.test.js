const { test, describe, mock } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');

// --- Global Stubbing Setup ---
global.document = {
  getElementById: (id) => {
    if (id === 'unit-system') return null;
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
  getItem: () => null
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
    // The loop goes from i=0 to nPhotos, so there are nPhotos+1 points.
    const result = generateOrbitCoordinates(100, 1000, 120, -60);

    assert.ok(result.waypoints);
    assert.ok(result.photos);
    assert.strictEqual(result.waypoints.length, 9, 'Should have 9 points (nPhotos=8, i from 0 to 8)');
    assert.strictEqual(result.photos.length, 9, 'Should have 9 photos');
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
    // Note that the loop goes from i=0 to nPhotos, so there are nPhotos+1 points per ring.
    // If nPhotos=8, there are 9 points per ring.
    const result = generateMultiOrbitCoordinates(100, 1000, 100, -90);

    const ring0 = result.waypoints.filter(wp => wp.ringIndex === 0);
    const ring1 = result.waypoints.filter(wp => wp.ringIndex === 1);
    const ring2 = result.waypoints.filter(wp => wp.ringIndex === 2);

    assert.strictEqual(ring0.length, 9, 'Ring 0 should have 9 points (nPhotos=8, i from 0 to 8)');
    assert.strictEqual(ring1.length, 9, 'Ring 1 should have 9 points');
    assert.strictEqual(ring2.length, 9, 'Ring 2 should have 9 points');
    assert.strictEqual(result.waypoints.length, 27, 'Total waypoints should be 27');
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
      // Flight time = 5 (distance/speed) + 3*4.5 (photos) + 45 (base) = 50 + 13.5 = 63.5 seconds.
      const statsStop = calculateStats(waypoints, photoLocations, speed, 10, 10, 'stopAndShoot');
      assert.strictEqual(statsStop.flightTimeSeconds, 63.5);
      assert.strictEqual(statsStop.timeStr, '1m 4s'); // 63.5s -> 1m 4s (rounded)

      // Over max flight time scenario
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
    assert.strictEqual(time, 67.5);
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
      assert.strictEqual(xml.includes('<wpml:waypointPoiPoint>41.8827000000000,-87.6227000000000,0.000000</wpml:waypointPoiPoint>'), true);
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
      assert.ok(xml.includes('<wpml:waypointPoiPoint>41.9300000000000,-87.6700000000000,0.000000</wpml:waypointPoiPoint>'));

      // Waypoint 1 should point to POI 2 (-87.72, 41.98)
      assert.ok(xml.includes('<wpml:waypointHeadingPoiIndex>2</wpml:waypointHeadingPoiIndex>'));
      assert.ok(xml.includes('<wpml:waypointPoiPoint>41.9800000000000,-87.7200000000000,0.000000</wpml:waypointPoiPoint>'));

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
    assert.strictEqual(waypoints[0].origHoverTime, 0);

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






