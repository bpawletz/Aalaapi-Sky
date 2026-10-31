const test = require('node:test');
const assert = require('node:assert/strict');
const https = require('node:https');
const http = require('node:http');

const companion = require('./server.js');
const { createSelfSignedCertificate } = require('./tls_cert.js');

test('server_https: buildOpenApiSpec constructs valid OpenAPI 3.0 document with tool paths', () => {
  const dummyReq = {
    socket: { encrypted: true },
    headers: { host: 'localhost:8766' }
  };
  const spec = companion.buildOpenApiSpec(dummyReq);

  assert.equal(spec.openapi, '3.0.3');
  assert.ok(spec.info.title.includes('Aalaapi Sky'));
  assert.ok(spec.paths['/api/status'], 'Contains /api/status endpoint');
  assert.ok(spec.paths['/api/tools/get_airspace_telemetry'], 'Contains get_airspace_telemetry tool');
  assert.ok(spec.paths['/api/tools/generate_flight_plan'], 'Contains generate_flight_plan tool');
  assert.ok(spec.paths['/api/tools/trigger_bridge_action'], 'Contains trigger_bridge_action tool');

  const telemetryPost = spec.paths['/api/tools/get_airspace_telemetry'].post;
  assert.ok(telemetryPost.operationId, 'get_airspace_telemetry');
  assert.ok(telemetryPost.requestBody.content['application/json'].schema);
  assert.ok(telemetryPost.responses['200']);

  assert.ok(Array.isArray(spec.servers));
  assert.ok(spec.servers.some(s => s.url.startsWith('https://')));
});

test('server_https: HTTPS server serves /api/status, /api/openapi.json, and CORS headers', async () => {
  const credentials = createSelfSignedCertificate({
    altNames: ['localhost', '127.0.0.1']
  });

  // Start test HTTPS server using companion server handler
  const testHttpsServer = https.createServer(credentials, companion.server.listeners('request')[0]);
  await new Promise(resolve => testHttpsServer.listen(0, '127.0.0.1', resolve));
  const testPort = testHttpsServer.address().port;

  try {
    // 1. Test /api/status over HTTPS
    const statusRes = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: '127.0.0.1',
        port: testPort,
        path: '/api/status',
        method: 'GET',
        rejectUnauthorized: false
      }, res => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: JSON.parse(body) }));
      });
      req.on('error', reject);
      req.end();
    });

    assert.equal(statusRes.statusCode, 200);
    assert.equal(statusRes.headers['access-control-allow-origin'], '*');
    assert.equal(statusRes.headers['access-control-allow-private-network'], 'true');
    assert.ok(statusRes.body.version);
    assert.ok(statusRes.body.https);
    assert.equal(statusRes.body.https.enabled, true);

    // 2. Test /api/openapi.json over HTTPS
    const openApiRes = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: '127.0.0.1',
        port: testPort,
        path: '/api/openapi.json',
        method: 'GET',
        rejectUnauthorized: false
      }, res => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => resolve({ statusCode: res.statusCode, body: JSON.parse(body) }));
      });
      req.on('error', reject);
      req.end();
    });

    assert.equal(openApiRes.statusCode, 200);
    assert.equal(openApiRes.body.openapi, '3.0.3');
    assert.ok(openApiRes.body.paths['/api/tools/get_airspace_telemetry']);

    // 3. Test OPTIONS preflight for Google AI Studio CORS
    const optionsRes = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: '127.0.0.1',
        port: testPort,
        path: '/api/mcp/sse',
        method: 'OPTIONS',
        headers: {
          'Origin': 'https://aistudio.google.com',
          'Access-Control-Request-Method': 'GET',
          'Access-Control-Request-Private-Network': 'true'
        },
        rejectUnauthorized: false
      }, res => {
        resolve({ statusCode: res.statusCode, headers: res.headers });
      });
      req.on('error', reject);
      req.end();
    });

    assert.equal(optionsRes.statusCode, 204);
    assert.equal(optionsRes.headers['access-control-allow-private-network'], 'true');
    assert.equal(optionsRes.headers['access-control-allow-origin'], '*');

    // 4. Test tool execution endpoint /api/tools/get_airspace_telemetry over HTTPS
    const toolExecRes = await new Promise((resolve, reject) => {
      const payload = JSON.stringify({ radiusMeters: 5000, includeRadar: false, includeHardware: true });
      const req = https.request({
        hostname: '127.0.0.1',
        port: testPort,
        path: '/api/tools/get_airspace_telemetry',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        },
        rejectUnauthorized: false
      }, res => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => resolve({ statusCode: res.statusCode, body: JSON.parse(body) }));
      });
      req.on('error', reject);
      req.write(payload);
      req.end();
    });

    assert.equal(toolExecRes.statusCode, 200);
    assert.ok(Array.isArray(toolExecRes.body.content));
    assert.ok(toolExecRes.body.content[0].text);
  } finally {
    await new Promise(resolve => testHttpsServer.close(resolve));
  }
});
