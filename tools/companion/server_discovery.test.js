const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const {
  server,
  mdnsService,
  MdnsService,
  PORT
} = require('./server.js');

test('server_discovery: GET /api/discovery returns mDNS metadata and LAN addresses', async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const testPort = server.address().port;

  try {
    const data = await new Promise((resolve, reject) => {
      const req = http.get({
        hostname: '127.0.0.1',
        port: testPort,
        path: '/api/discovery'
      }, (res) => {
        assert.strictEqual(res.statusCode, 200);
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => resolve(JSON.parse(body)));
      });
      req.on('error', reject);
    });

    assert.strictEqual(data.success, true);
    assert.ok(data.mdns);
    assert.strictEqual(data.mdns.enabled, true);
    assert.ok(data.mdns.hostname.includes('.local'));
    assert.ok(Array.isArray(data.lanAddresses));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('server_discovery: GET /api/airspace/discover executes mDNS query without crashing', async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const testPort = server.address().port;

  try {
    const data = await new Promise((resolve, reject) => {
      const req = http.get({
        hostname: '127.0.0.1',
        port: testPort,
        path: '/api/airspace/discover?timeout=50'
      }, (res) => {
        assert.strictEqual(res.statusCode, 200);
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => resolve(JSON.parse(body)));
      });
      req.on('error', reject);
    });

    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.servers));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('server_discovery: GET /api/status includes mdns status payload', async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const testPort = server.address().port;

  try {
    const data = await new Promise((resolve, reject) => {
      const req = http.get({
        hostname: '127.0.0.1',
        port: testPort,
        path: '/api/status'
      }, (res) => {
        assert.strictEqual(res.statusCode, 200);
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => resolve(JSON.parse(body)));
      });
      req.on('error', reject);
    });

    assert.ok(data);
    // Unauthenticated status returns basic metadata with authRequired, plus mdns and lanAddresses
    assert.strictEqual(data.authRequired, true);
    assert.ok(data.mdns, 'GET /api/status should include mdns object');
    assert.strictEqual(data.mdns.enabled, true);
    assert.ok(data.mdns.hostname.includes('.local'));
    assert.strictEqual(typeof data.mdns.httpsPort, 'number');
    assert.ok(Array.isArray(data.lanAddresses), 'GET /api/status should include lanAddresses array');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
