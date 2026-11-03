const test = require('node:test');
const assert = require('node:assert');

const {
  CloudSyncServiceEngine,
  encodeFirestoreValue,
  decodeFirestoreValue,
  encodeFirestoreDocument,
  decodeFirestoreDocument
} = require('../../src/bridge/CloudSyncService.js');

const { GoogleWorkspaceClientEngine } = require('../../src/bridge/GoogleWorkspaceClient.js');
const { WebUsbMtpEngine, PTP_OP_GET_OBJECT_HANDLES } = require('../../src/bridge/WebUsbMtp.js');
const { OfflineFieldPackagerEngine, latLonToTile } = require('../../src/map/OfflineFieldPackager.js');

test('CloudSyncService: Firestore REST value encoding and decoding', () => {
  const sample = {
    callsign: 'SkyPilot_42',
    waypointsCount: 15,
    altitudeMeters: 45.5,
    isRthActive: true,
    tags: ['photogrammetry', 'splat'],
    metadata: {
      drone: 'Mini 4 Pro',
      firmware: '01.00.0400'
    }
  };

  const encodedDoc = encodeFirestoreDocument(sample);
  assert.strictEqual(encodedDoc.fields.callsign.stringValue, 'SkyPilot_42');
  assert.strictEqual(encodedDoc.fields.waypointsCount.integerValue, '15');
  assert.strictEqual(encodedDoc.fields.altitudeMeters.doubleValue, 45.5);
  assert.strictEqual(encodedDoc.fields.isRthActive.booleanValue, true);
  assert.strictEqual(encodedDoc.fields.tags.arrayValue.values.length, 2);
  assert.strictEqual(encodedDoc.fields.metadata.mapValue.fields.drone.stringValue, 'Mini 4 Pro');

  const decodedDoc = decodeFirestoreDocument(encodedDoc);
  assert.strictEqual(decodedDoc.callsign, 'SkyPilot_42');
  assert.strictEqual(decodedDoc.waypointsCount, 15);
  assert.strictEqual(decodedDoc.altitudeMeters, 45.5);
  assert.strictEqual(decodedDoc.isRthActive, true);
  assert.deepStrictEqual(decodedDoc.tags, ['photogrammetry', 'splat']);
  assert.strictEqual(decodedDoc.metadata.drone, 'Mini 4 Pro');
});

test('CloudSyncService: Custom database ID support (AI Studio integration) and collection prefixing', () => {
  const service = new CloudSyncServiceEngine();
  
  // Default database ID
  service.saveConfig({ projectId: 'drone-ai-studio-99', apiKey: 'test-key' });
  assert.strictEqual(service.getConfig().databaseId, '(default)');
  assert.ok(service.buildUrl('aalaapi_pilots').includes('/databases/(default)/documents/aalaapi_pilots'));

  // Custom database ID (AI Studio database)
  service.saveConfig({ projectId: 'drone-ai-studio-99', databaseId: 'ai-studio-drone-db', apiKey: 'test-key' });
  assert.strictEqual(service.getConfig().databaseId, 'ai-studio-drone-db');
  assert.ok(service.buildUrl('aalaapi_missions').includes('/databases/ai-studio-drone-db/documents/aalaapi_missions'));
  assert.ok(service.buildUrl('aalaapi_missions', 'mission-uuid-123').includes('aalaapi_missions/mission-uuid-123?key=test-key'));
});

test('GoogleWorkspaceClient: OAuth scopes, folder building and multipart formatting', () => {
  const client = new GoogleWorkspaceClientEngine();
  client.setClientId('12345-test.apps.googleusercontent.com');
  client.setSpreadsheetId('sheet-test-id-9988');

  assert.strictEqual(client.getClientId(), '12345-test.apps.googleusercontent.com');
  assert.strictEqual(client.getSpreadsheetId(), 'sheet-test-id-9988');
  assert.ok(client.scopes.includes('https://www.googleapis.com/auth/drive.file'));
  assert.ok(client.scopes.includes('https://www.googleapis.com/auth/spreadsheets'));

  // Multipart body format verification
  const boundary = 'test-boundary-123';
  const meta = { name: 'mission_test.json', mimeType: 'application/json' };
  const content = JSON.stringify({ mission: 'orbit', waypoints: 12 });
  const multipartBytes = client.buildMultipartJson(boundary, meta, content, 'application/json');

  const text = new TextDecoder().decode(multipartBytes);
  assert.ok(text.includes('--test-boundary-123'));
  assert.ok(text.includes('Content-Type: application/json'));
  assert.ok(text.includes('mission_test.json'));
  assert.ok(text.includes('orbit'));
});

test('WebUsbMtp: Container construction, string encoding & PTP object parsing', () => {
  const engine = new WebUsbMtpEngine();

  // Test PTP String encoding
  const testStr = 'waypoint.kmz';
  const encodedStr = engine.encodePtpString(testStr);
  assert.strictEqual(encodedStr[0], testStr.length + 1); // length byte including null terminator

  // Test PTP Container building
  const containerBuf = engine.buildContainer(1, PTP_OP_GET_OBJECT_HANDLES, 101, new Uint8Array(0), [0x00010001, 0, 0]);
  const view = new DataView(containerBuf);
  assert.strictEqual(view.getUint32(0, true), 24); // 12 header + 3 * 4 params
  assert.strictEqual(view.getUint16(4, true), 1);  // Type Command
  assert.strictEqual(view.getUint16(6, true), PTP_OP_GET_OBJECT_HANDLES);
  assert.strictEqual(view.getUint32(8, true), 101); // TxId

  const parsed = engine.parseContainer(containerBuf);
  assert.strictEqual(parsed.type, 1);
  assert.strictEqual(parsed.code, PTP_OP_GET_OBJECT_HANDLES);
  assert.strictEqual(parsed.transactionId, 101);
  assert.strictEqual(parsed.params.length, 3);
  assert.strictEqual(parsed.params[0], 0x00010001);
});

test('OfflineFieldPackager: Slippy map coordinate math and requirement estimation', () => {
  const packager = new OfflineFieldPackagerEngine();

  // Test latLonToTile
  const tile14 = latLonToTile(41.3215, -88.9950, 14);
  assert.strictEqual(tile14.z, 14);
  assert.ok(typeof tile14.x === 'number' && tile14.x > 0);
  assert.ok(typeof tile14.y === 'number' && tile14.y > 0);

  // Test bbox estimation
  const bbox = {
    north: 41.3300,
    south: 41.3100,
    west: -89.0100,
    east: -88.9800
  };
  const tileList = packager.enumerateTileList(bbox, 14, 15);
  assert.ok(tileList.length > 0);
  assert.ok(tileList[0].key.includes('/'));

  const est = packager.estimateRequirements(14, 15, 200);
  assert.ok(est.tileCount > 0);
  assert.ok(parseFloat(est.estimatedMb) >= 0);
});
