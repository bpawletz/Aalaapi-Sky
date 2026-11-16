const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const { DiagnosticsDatabase } = require('./diagnostics_db.js');

const TEST_DB_PATH = path.resolve(__dirname, '../../scratch/test_diagnostics.db');

test('DiagnosticsDatabase: saveDiagnostic, getHistory, and getByIdOrArchiveIdOrUuid', () => {
  // Clean up any old test db
  try { if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH); } catch (_) {}

  const db = new DiagnosticsDatabase(TEST_DB_PATH);

  try {
    const testUuid = 'test-uuid-1234-5678';
    const samplePayload = {
      uuid: testUuid,
      filename: 'Survey_Mission_2026.kmz',
      createdAt: new Date().toISOString(),
      flightPattern: 'grid',
      altitude: 65,
      speed: 7.5,
      gimbalPitch: -90,
      waypointCount: 3,
      photoCount: 3,
      totalDistance: 450.5,
      estimatedDuration: 120,
      userAgent: 'TestPilotTablet',
      waypoints: [
        { waypointIndex: 0, lat: 41.321, lon: -88.995, altWgs84: 215, altRel: 65, speed: 7.5, heading: 90, gimbalPitch: -90, turnMode: 'stop' },
        { waypointIndex: 1, lat: 41.322, lon: -88.995, altWgs84: 215, altRel: 65, speed: 7.5, heading: 90, gimbalPitch: -90, turnMode: 'stop' },
        { waypointIndex: 2, lat: 41.322, lon: -88.994, altWgs84: 215, altRel: 65, speed: 7.5, heading: 90, gimbalPitch: -90, turnMode: 'stop' }
      ],
      missionData: {
        gridType: 'grid',
        drone: 'Mini 4 Pro'
      }
    };

    // 1. Save Diagnostic
    const saveResult = db.saveDiagnostic(samplePayload);
    assert.strictEqual(saveResult.success, true);
    assert.ok(saveResult.archiveId);
    assert.strictEqual(saveResult.uuid, testUuid);

    // 2. Query History
    const history = db.getHistory(10, 0);
    assert.ok(Array.isArray(history));
    assert.strictEqual(history.length, 1);
    assert.strictEqual(history[0].uuid, testUuid);
    assert.strictEqual(history[0].flight_pattern, 'grid');
    assert.strictEqual(history[0].altitude, 65);
    assert.strictEqual(history[0].waypoint_count, 3);

    // 3. Query by UUID
    const fetchedByUuid = db.getByIdOrArchiveIdOrUuid(testUuid);
    assert.ok(fetchedByUuid, 'Should find record by UUID');
    assert.strictEqual(fetchedByUuid.uuid, testUuid);
    assert.ok(fetchedByUuid.waypoints);
    assert.strictEqual(fetchedByUuid.waypoints.length, 3);
    assert.strictEqual(fetchedByUuid.waypoints[0].lat, 41.321);

    // 4. Query by Archive ID
    const fetchedByArchiveId = db.getByIdOrArchiveIdOrUuid(saveResult.archiveId);
    assert.ok(fetchedByArchiveId, 'Should find record by Archive ID');
    assert.strictEqual(fetchedByArchiveId.archive_id, saveResult.archiveId);

  } finally {
    db.close();
    try { if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH); } catch (_) {}
  }
});
