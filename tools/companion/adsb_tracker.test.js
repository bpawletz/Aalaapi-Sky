/**
 * Unit tests for AdsbAirspaceTracker daemon and spatial filtering engine.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const {
  AdsbAirspaceTracker,
  calculateHaversineDistance,
  calculateBearing,
  degreesToCardinal,
  METERS_PER_STATUTE_MILE
} = require('./adsb_tracker.js');

describe('AdsbAirspaceTracker Tests', () => {
  test('calculateHaversineDistance accurately measures distance between coordinates', () => {
    // Distance between New York (40.7128, -74.0060) and Philadelphia (39.9526, -75.1652) ~ 130 km
    const dist = calculateHaversineDistance(40.7128, -74.0060, 39.9526, -75.1652);
    assert.ok(dist > 125000 && dist < 135000, `Expected ~130km, got ${dist}`);

    // Zero distance for identical points
    const zero = calculateHaversineDistance(40.0, -83.0, 40.0, -83.0);
    assert.strictEqual(Math.round(zero), 0);
  });

  test('calculateBearing and degreesToCardinal calculate accurate directional vectors', () => {
    // Bearing due North (40.0, -83.0 -> 41.0, -83.0) is 0°
    const northBearing = calculateBearing(40.0, -83.0, 41.0, -83.0);
    assert.strictEqual(northBearing, 0);
    assert.strictEqual(degreesToCardinal(northBearing), 'N');

    // Bearing due East (40.0, -83.0 -> 40.0, -82.0) ~ 90°
    const eastBearing = calculateBearing(40.0, -83.0, 40.0, -82.0);
    assert.ok(Math.abs(eastBearing - 90) <= 2, `Expected ~90, got ${eastBearing}`);
    assert.strictEqual(degreesToCardinal(90), 'E');

    // Bearing due South ~ 180°
    const southBearing = calculateBearing(41.0, -83.0, 40.0, -83.0);
    assert.strictEqual(southBearing, 180);
    assert.strictEqual(degreesToCardinal(southBearing), 'S');

    // Bearing West ~ 270°
    assert.strictEqual(degreesToCardinal(270), 'W');
    assert.strictEqual(degreesToCardinal(45), 'NE');
    assert.strictEqual(degreesToCardinal(225), 'SW');
  });

  test('parseSbsMessage correctly extracts callsign, position, velocity, and squawk', () => {
    const tracker = new AdsbAirspaceTracker();

    // MSG,1 - Identification and Callsign
    const msg1 = 'MSG,1,1,1,A12345,1,2026/09/24,20:00:00.000,2026/09/24,20:00:00.000,UAL452,,,,,,,0,,0,0';
    const ac1 = tracker.parseSbsMessage(msg1);
    assert.ok(ac1, 'Aircraft record should be created');
    assert.strictEqual(ac1.hex, 'A12345');
    assert.strictEqual(ac1.callsign, 'UAL452');

    // MSG,3 - Airborne Position (Altitude 2200 ft, Lat 40.025, Lon -83.165)
    const msg3 = 'MSG,3,1,1,A12345,1,2026/09/24,20:00:01.000,2026/09/24,20:00:01.000,,2200,,,40.0250,-83.1650,,,0,0,0,0';
    const ac3 = tracker.parseSbsMessage(msg3);
    assert.strictEqual(ac3.altitude, 2200);
    assert.strictEqual(ac3.latitude, 40.0250);
    assert.strictEqual(ac3.longitude, -83.1650);
    assert.strictEqual(ac3.isOnGround, false);

    // MSG,4 - Airborne Velocity (Speed 145 kt, Track 45 deg, Vertical Rate -450 fpm)
    const msg4 = 'MSG,4,1,1,A12345,1,2026/09/24,20:00:02.000,2026/09/24,20:00:02.000,,,145,45,,,-450,,,,,';
    const ac4 = tracker.parseSbsMessage(msg4);
    assert.strictEqual(ac4.speed, 145);
    assert.strictEqual(ac4.track, 45);
    assert.strictEqual(ac4.verticalRate, -450);

    // MSG,6 - Squawk Code (Field 11: altitude, Fields 12-16: speed, track, lat, lon, vertRate, Field 17: squawk)
    const msg6 = 'MSG,6,1,1,A12345,1,2026/09/24,20:00:03.000,2026/09/24,20:00:03.000,,2200,,,,,,1200,,,,';
    const ac6 = tracker.parseSbsMessage(msg6);
    assert.strictEqual(ac6.squawk, '1200');

    tracker.destroy();
  });

  test('parseDump1090Json ingests dump1090 JSON payloads accurately', () => {
    const tracker = new AdsbAirspaceTracker();

    const sampleJson = {
      now: 1727221234.5,
      messages: 5432,
      aircraft: [
        {
          hex: 'C0FFEE',
          flight: 'DAL987 ',
          lat: 40.0155,
          lon: -83.1720,
          alt_baro: 1850,
          alt_geom: 1875,
          track: 180,
          speed: 120,
          baro_rate: -200,
          squawk: '4521'
        },
        {
          hex: 'BEEF01',
          flight: 'AAL111 ',
          lat: 40.2500,
          lon: -83.5000,
          alt_baro: 12000,
          track: 270,
          speed: 350
        }
      ]
    };

    const count = tracker.parseDump1090Json(sampleJson);
    assert.strictEqual(count, 2);

    const dal = tracker.aircraft.get('C0FFEE');
    assert.strictEqual(dal.callsign, 'DAL987');
    assert.strictEqual(dal.altitude, 1850);
    assert.strictEqual(dal.speed, 120);
    assert.strictEqual(dal.track, 180);

    tracker.destroy();
  });

  test('getAirspaceBounds accurately classifies breached vs safe aircraft based on radius and ceiling', () => {
    const tracker = new AdsbAirspaceTracker();
    const homeLat = 40.0130;
    const homeLon = -83.1765;

    // Aircraft 1: Close (approx 1 mile away) and low (1,500 ft) -> BREACHED
    tracker.injectSimulatedAircraft({
      hex: 'AC0001',
      callsign: 'CLOSE_LOW',
      lat: 40.0200,
      lon: -83.1650,
      alt: 1500
    });

    // Aircraft 2: Close (approx 1 mile away) but high (8,000 ft > 2,500 ft ceiling) -> SAFE
    tracker.injectSimulatedAircraft({
      hex: 'AC0002',
      callsign: 'CLOSE_HIGH',
      lat: 40.0200,
      lon: -83.1650,
      alt: 8000
    });

    // Aircraft 3: Far away (approx 15 miles away) and low (1,500 ft) -> SAFE (outside radius)
    tracker.injectSimulatedAircraft({
      hex: 'AC0003',
      callsign: 'FAR_LOW',
      lat: 40.2500,
      lon: -83.1765,
      alt: 1500
    });

    const result = tracker.getAirspaceBounds({
      homeLat,
      homeLon,
      radiusMeters: 3 * METERS_PER_STATUTE_MILE, // 3 miles
      maxCeilingFeet: 2500
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.summary.breachedCount, 1);
    assert.strictEqual(result.summary.hasBreach, true);

    const breachedAc = result.aircraft.find(a => a.hex === 'AC0001');
    assert.ok(breachedAc, 'AC0001 should be present');
    assert.strictEqual(breachedAc.isBreached, true);
    assert.strictEqual(breachedAc.status, 'breached');
    assert.ok(breachedAc.distanceMiles < 3.0, 'Distance should be under 3 miles');
    assert.strictEqual(breachedAc.bearingCardinal.length > 0, true);

    const highAc = result.aircraft.find(a => a.hex === 'AC0002');
    assert.ok(highAc);
    assert.strictEqual(highAc.isBreached, false);
    assert.strictEqual(highAc.breachReason, 'proximity_above_ceiling');

    const farAc = result.aircraft.find(a => a.hex === 'AC0003');
    assert.ok(farAc);
    assert.strictEqual(farAc.isBreached, false);
    assert.strictEqual(farAc.isWithinRadius, false);

    tracker.destroy();
  });

  test('pruneStaleAircraft purges inactive aircraft after timeout', () => {
    const tracker = new AdsbAirspaceTracker({ staleTimeoutMs: 100 });
    tracker.injectSimulatedAircraft({ hex: 'EXP001' });

    assert.strictEqual(tracker.aircraft.size, 1);
    
    // Artificially age the record
    const ac = tracker.aircraft.get('EXP001');
    ac.lastSeen = Date.now() - 200;

    const pruned = tracker.pruneStaleAircraft();
    assert.strictEqual(pruned, 1);
    assert.strictEqual(tracker.aircraft.size, 0);

    tracker.destroy();
  });

  test('Companion Server exposes /api/airspace/bounds, /api/airspace/status, and /api/airspace/simulate', async () => {
    const { server, adsbTracker } = require('./server.js');
    adsbTracker.clear();

    // Start server on ephemeral port for test
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // 1. GET /api/airspace/status
      const statusRes = await fetch(`${baseUrl}/api/airspace/status`);
      assert.strictEqual(statusRes.status, 200);
      const statusData = await statusRes.json();
      assert.strictEqual(statusData.success, true);
      assert.strictEqual(typeof statusData.totalPackets, 'number');

      // 2. POST /api/airspace/simulate
      const simRes = await fetch(`${baseUrl}/api/airspace/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hex: 'FEDCBA',
          callsign: 'TEST77',
          lat: 40.0140,
          lon: -83.1750,
          alt: 1200,
          speed: 110,
          track: 180
        })
      });
      assert.strictEqual(simRes.status, 200);
      const simData = await simRes.json();
      assert.strictEqual(simData.success, true);
      assert.strictEqual(simData.aircraft.callsign, 'TEST77');

      // 3. GET /api/airspace/bounds with drone home point
      const boundsRes = await fetch(`${baseUrl}/api/airspace/bounds?lat=40.0130&lon=-83.1765&radius=3&ceiling=2500`);
      assert.strictEqual(boundsRes.status, 200);
      const boundsData = await boundsRes.json();
      assert.strictEqual(boundsData.success, true);
      assert.strictEqual(boundsData.summary.breachedCount, 1);
      assert.strictEqual(boundsData.aircraft[0].callsign, 'TEST77');
      assert.strictEqual(boundsData.aircraft[0].isBreached, true);
      assert.strictEqual(boundsData.aircraft[0].status, 'breached');

      // 4. POST /api/airspace/clear
      const clearRes = await fetch(`${baseUrl}/api/airspace/clear`, { method: 'POST' });
      assert.strictEqual(clearRes.status, 200);
      const clearData = await clearRes.json();
      assert.strictEqual(clearData.success, true);
      assert.strictEqual(adsbTracker.aircraft.size, 0);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
