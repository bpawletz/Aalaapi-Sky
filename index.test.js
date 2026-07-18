const { test, describe } = require('node:test');
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
  layerGroup: () => ({}),
  featureGroup: () => ({}),
  icon: () => ({}),
  Control: {
    extend: () => function() {}
  },
  control: {
    layers: () => ({}),
    scale: () => ({})
  }
};

// Evaluate index.js in this context
const code = fs.readFileSync('./index.js', 'utf8');
vm.runInThisContext(code);

// --- Test Suite ---

describe('Unit Conversion Tests', () => {
  test('formatDistance formats metric distance correctly', () => {
    // default getUnitSystem() returns 'metric' because localStorage is stubbed
    assert.strictEqual(formatDistance(10), '10.0 m');
    assert.strictEqual(formatDistance(10, 2), '10.00 m');
    assert.strictEqual(formatDistance(0), '0.0 m');
  });

  test('formatDistance handles null, undefined, and NaN', () => {
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

      // Verify assertions
      assert.strictEqual(alertCalls.length, 1);
      assert.strictEqual(alertCalls[0], "Error finding location. Check your internet connection.");
      assert.strictEqual(consoleErrorCalls.length, 1);
      assert.strictEqual(consoleErrorCalls[0].msg, "Search error:");
      assert.strictEqual(consoleErrorCalls[0].err.message, "Network error");
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
