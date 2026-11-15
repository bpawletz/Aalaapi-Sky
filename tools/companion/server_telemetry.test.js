/**
 * tools/companion/server_telemetry.test.js
 * Regression test suite for /api/flight-telemetry ensuring matchedRow scope
 * safety and no ERR_HTTP_HEADERS_SENT crash when no archived mission matches.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const companion = require('./server.js');

function postJson(port, path, bodyStr, token) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        'Authorization': `Bearer ${token}`
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, json: JSON.parse(data) });
        } catch (err) {
          resolve({ status: res.statusCode, raw: data, parseError: err.message });
        }
      });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

describe('Companion /api/flight-telemetry Regression Suite', () => {
  let testServer;
  let testPort;
  let validToken;

  before(async () => {
    const handler = companion.server.listeners('request')[0];
    testServer = http.createServer(handler);
    await new Promise(resolve => testServer.listen(0, '127.0.0.1', resolve));
    testPort = testServer.address().port;

    const user = companion.authDb.createPilotUser({
      username: `telemetry_test_${Date.now()}`,
      password: 'SecurePassword123!',
      displayName: 'Telemetry Test Pilot'
    });
    const session = companion.authDb.createSession(user.userId, 'TelemetryTestRunner/1.0');
    validToken = session.token;
  });

  after(async () => {
    if (validToken && companion.authDb) {
      try { companion.authDb.revokeSession(validToken); } catch (_) {}
    }
    if (testServer) {
      await new Promise(resolve => testServer.close(resolve));
    }
  });

  it('returns 200 without ERR_HTTP_HEADERS_SENT when flightId is omitted', async () => {
    const payload = JSON.stringify({
      waypoints: [
        { lat: 41.3215, lon: -88.9950, alt: 60 },
        { lat: 41.3220, lon: -88.9945, alt: 60 }
      ],
      options: { altitude: 60 }
    });
    const res = await postJson(testPort, '/api/flight-telemetry', payload, validToken);
    assert.equal(res.status, 200);
    assert.equal(res.json.success, true);
    assert.equal(res.json.matchedMissionPattern, null);
    assert.ok(Array.isArray(res.json.telemetry?.points));
    assert.ok(res.json.telemetry.points.length > 0);
  });

  it('returns 200 without ERR_HTTP_HEADERS_SENT when flightId has no matching DB candidates', async () => {
    const payload = JSON.stringify({
      flightId: 'FlightRecord_1999-01-01_[00-00-00].txt',
      waypoints: [
        { lat: 41.3215, lon: -88.9950, alt: 60 },
        { lat: 41.3220, lon: -88.9945, alt: 60 }
      ],
      options: { altitude: 60 }
    });
    const res = await postJson(testPort, '/api/flight-telemetry', payload, validToken);
    assert.equal(res.status, 200);
    assert.equal(res.json.success, true);
    assert.equal(res.json.matchedMissionPattern, null);
  });

  it('returns 500 JSON cleanly on malformed JSON body', async () => {
    const res = await postJson(testPort, '/api/flight-telemetry', '{invalid-json', validToken);
    assert.equal(res.status, 500);
    assert.equal(res.json.success, false);
    assert.equal(typeof res.json.error, 'string');
    assert.ok(res.json.error.length > 0);
  });
});
