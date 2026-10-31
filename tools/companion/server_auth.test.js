/**
 * tools/companion/server_auth.test.js
 * Test suite verifying Companion API and SSE authentication enforcement by default,
 * token extraction (headers and query params), and --allow-unauth bypass flag.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const companion = require('./server.js');

describe('Companion Server Authentication Enforcement Suite', () => {
  let testServer;
  let testPort;
  let validToken;
  let testPilotUserId;

  before(async () => {
    // Spin up test HTTP server using companion server handler
    const handler = companion.server.listeners('request')[0];
    testServer = http.createServer(handler);
    await new Promise(resolve => testServer.listen(0, '127.0.0.1', resolve));
    testPort = testServer.address().port;

    // Create a test pilot in authDb to generate a real session token
    const username = `authpilot_${Date.now()}`;
    const user = companion.authDb.createPilotUser({
      username,
      password: 'SecurePassword123!',
      displayName: 'Captain Auth'
    });
    testPilotUserId = user.userId;
    const session = companion.authDb.createSession(user.userId, 'AuthTestRunner/1.0');
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

  describe('isAuthRequired() policy check', () => {
    it('defaults to true when no bypass flags or config are present', () => {
      // By default, authentication is enforced
      assert.equal(companion.isAuthRequired(), true);
    });
  });

  describe('Public & Whitelisted Endpoints', () => {
    it('allows OPTIONS preflight requests without authentication', async () => {
      const res = await new Promise((resolve, reject) => {
        const req = http.request({
          hostname: '127.0.0.1',
          port: testPort,
          path: '/api/sync',
          method: 'OPTIONS'
        }, resolve);
        req.on('error', reject);
        req.end();
      });
      assert.equal(res.statusCode, 204);
    });

    it('returns public metadata fallback on unauthenticated GET /api/status', async () => {
      const res = await new Promise((resolve, reject) => {
        const req = http.request({
          hostname: '127.0.0.1',
          port: testPort,
          path: '/api/status',
          method: 'GET'
        }, r => {
          let body = '';
          r.on('data', chunk => { body += chunk; });
          r.on('end', () => resolve({ statusCode: r.statusCode, body: JSON.parse(body) }));
        });
        req.on('error', reject);
        req.end();
      });

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.status, 'auth_required');
      assert.equal(res.body.authRequired, true);
      assert.equal(res.body.authenticated, false);
      assert.ok(res.body.version);
    });

    it('returns auth config with authRequired: true on GET /api/auth/config', async () => {
      const res = await new Promise((resolve, reject) => {
        const req = http.request({
          hostname: '127.0.0.1',
          port: testPort,
          path: '/api/auth/config',
          method: 'GET'
        }, r => {
          let body = '';
          r.on('data', chunk => { body += chunk; });
          r.on('end', () => resolve({ statusCode: r.statusCode, body: JSON.parse(body) }));
        });
        req.on('error', reject);
        req.end();
      });

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.authRequired, true);
    });
  });

  describe('Protected REST API Endpoints', () => {
    it('rejects unauthenticated POST /api/sync with 401 Unauthorized', async () => {
      const res = await new Promise((resolve, reject) => {
        const req = http.request({
          hostname: '127.0.0.1',
          port: testPort,
          path: '/api/sync',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        }, r => {
          let body = '';
          r.on('data', chunk => { body += chunk; });
          r.on('end', () => resolve({ statusCode: r.statusCode, body: JSON.parse(body) }));
        });
        req.on('error', reject);
        req.write(JSON.stringify({ test: true }));
        req.end();
      });

      assert.equal(res.statusCode, 401);
      assert.equal(res.body.success, false);
      assert.equal(res.body.authRequired, true);
      assert.ok(res.body.error.includes('Unauthorized'));
    });

    it('rejects POST /api/sync with invalid token with 401', async () => {
      const res = await new Promise((resolve, reject) => {
        const req = http.request({
          hostname: '127.0.0.1',
          port: testPort,
          path: '/api/sync',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer invalid_fake_token_12345'
          }
        }, r => {
          let body = '';
          r.on('data', chunk => { body += chunk; });
          r.on('end', () => resolve({ statusCode: r.statusCode, body: JSON.parse(body) }));
        });
        req.on('error', reject);
        req.write(JSON.stringify({ test: true }));
        req.end();
      });

      assert.equal(res.statusCode, 401);
    });

    it('accepts POST /api/sync with valid Bearer token header', async () => {
      const res = await new Promise((resolve, reject) => {
        const req = http.request({
          hostname: '127.0.0.1',
          port: testPort,
          path: '/api/sync',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${validToken}`
          }
        }, r => {
          let body = '';
          r.on('data', chunk => { body += chunk; });
          r.on('end', () => {
            let parsed = null;
            try { parsed = JSON.parse(body); } catch (_) {}
            resolve({ statusCode: r.statusCode, body: parsed });
          });
        });
        req.on('error', reject);
        req.write(JSON.stringify({ invalidPayload: true }));
        req.end();
      });

      // Status should NOT be 401 (payload validation failure 400 is expected and proves auth passed)
      assert.notEqual(res.statusCode, 401);
    });

    it('returns full authenticated status on GET /api/status with valid token', async () => {
      const res = await new Promise((resolve, reject) => {
        const req = http.request({
          hostname: '127.0.0.1',
          port: testPort,
          path: '/api/status',
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${validToken}`
          }
        }, r => {
          let body = '';
          r.on('data', chunk => { body += chunk; });
          r.on('end', () => resolve({ statusCode: r.statusCode, body: JSON.parse(body) }));
        });
        req.on('error', reject);
        req.end();
      });

      assert.equal(res.statusCode, 200);
      assert.notEqual(res.body.status, 'auth_required');
      assert.equal(res.body.authenticated, true);
    });

    it('rejects unauthenticated GET /api/airspace/bounds with 401 Unauthorized', async () => {
      const res = await new Promise((resolve, reject) => {
        const req = http.request({
          hostname: '127.0.0.1',
          port: testPort,
          path: '/api/airspace/bounds?lat=40.01250&lon=-83.17593&radius=3&ceiling=2500&includeSafe=true',
          method: 'GET'
        }, r => {
          let body = '';
          r.on('data', chunk => { body += chunk; });
          r.on('end', () => resolve({ statusCode: r.statusCode, body: JSON.parse(body) }));
        });
        req.on('error', reject);
        req.end();
      });

      assert.equal(res.statusCode, 401);
      assert.equal(res.body.authRequired, true);
    });

    it('accepts GET /api/airspace/bounds with valid Bearer token header', async () => {
      const res = await new Promise((resolve, reject) => {
        const req = http.request({
          hostname: '127.0.0.1',
          port: testPort,
          path: '/api/airspace/bounds?lat=40.01250&lon=-83.17593&radius=3&ceiling=2500&includeSafe=true',
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${validToken}`
          }
        }, r => {
          let body = '';
          r.on('data', chunk => { body += chunk; });
          r.on('end', () => resolve({ statusCode: r.statusCode, body: JSON.parse(body) }));
        });
        req.on('error', reject);
        req.end();
      });

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
    });

    it('accepts GET /api/airspace/bounds with valid token query parameter', async () => {
      const res = await new Promise((resolve, reject) => {
        const req = http.request({
          hostname: '127.0.0.1',
          port: testPort,
          path: `/api/airspace/bounds?lat=40.01250&lon=-83.17593&radius=3&ceiling=2500&includeSafe=true&token=${encodeURIComponent(validToken)}`,
          method: 'GET'
        }, r => {
          let body = '';
          r.on('data', chunk => { body += chunk; });
          r.on('end', () => resolve({ statusCode: r.statusCode, body: JSON.parse(body) }));
        });
        req.on('error', reject);
        req.end();
      });

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
    });
  });

  describe('Protected Server-Sent Events (SSE) Streams', () => {
    it('rejects unauthenticated GET /api/status/stream with 401 Unauthorized', async () => {
      const res = await new Promise((resolve, reject) => {
        const req = http.request({
          hostname: '127.0.0.1',
          port: testPort,
          path: '/api/status/stream',
          method: 'GET'
        }, r => {
          let body = '';
          r.on('data', chunk => { body += chunk; });
          r.on('end', () => resolve({ statusCode: r.statusCode, body: JSON.parse(body) }));
        });
        req.on('error', reject);
        req.end();
      });

      assert.equal(res.statusCode, 401);
      assert.equal(res.body.authRequired, true);
    });

    it('rejects unauthenticated GET /api/airspace/stream with 401 Unauthorized', async () => {
      const res = await new Promise((resolve, reject) => {
        const req = http.request({
          hostname: '127.0.0.1',
          port: testPort,
          path: '/api/airspace/stream',
          method: 'GET'
        }, r => {
          let body = '';
          r.on('data', chunk => { body += chunk; });
          r.on('end', () => resolve({ statusCode: r.statusCode, body: JSON.parse(body) }));
        });
        req.on('error', reject);
        req.end();
      });

      assert.equal(res.statusCode, 401);
    });

    it('rejects unauthenticated GET /api/remote-id/stream with 401 Unauthorized', async () => {
      const res = await new Promise((resolve, reject) => {
        const req = http.request({
          hostname: '127.0.0.1',
          port: testPort,
          path: '/api/remote-id/stream',
          method: 'GET'
        }, r => {
          let body = '';
          r.on('data', chunk => { body += chunk; });
          r.on('end', () => resolve({ statusCode: r.statusCode, body: JSON.parse(body) }));
        });
        req.on('error', reject);
        req.end();
      });

      assert.equal(res.statusCode, 401);
    });

    it('establishes SSE stream on GET /api/status/stream?token=<validToken>', async () => {
      const streamRes = await new Promise((resolve, reject) => {
        const req = http.request({
          hostname: '127.0.0.1',
          port: testPort,
          path: `/api/status/stream?token=${encodeURIComponent(validToken)}`,
          method: 'GET'
        }, r => {
          let receivedData = '';
          r.on('data', chunk => {
            receivedData += chunk.toString('utf8');
            if (receivedData.includes(': connected')) {
              req.destroy();
              resolve({
                statusCode: r.statusCode,
                contentType: r.headers['content-type'],
                data: receivedData
              });
            }
          });
        });
        req.on('error', (err) => {
          if (err.code === 'ECONNRESET') return; // Expected upon destroy
          reject(err);
        });
        req.end();
      });

      assert.equal(streamRes.statusCode, 200);
      assert.ok(streamRes.contentType.includes('text/event-stream'));
      assert.ok(streamRes.data.includes(': connected'));
    });
  });

  describe('Unauthenticated Mode Bypass (--allow-unauth / AALAAPI_ALLOW_UNAUTH)', () => {
    it('permits unauthenticated requests when AALAAPI_ALLOW_UNAUTH=1 is set', async () => {
      const origEnv = process.env.AALAAPI_ALLOW_UNAUTH;
      process.env.AALAAPI_ALLOW_UNAUTH = '1';

      try {
        assert.equal(companion.isAuthRequired(), false);

        // When auth is not required, GET /api/status returns full status
        const res = await new Promise((resolve, reject) => {
          const req = http.request({
            hostname: '127.0.0.1',
            port: testPort,
            path: '/api/status',
            method: 'GET'
          }, r => {
            let body = '';
            r.on('data', chunk => { body += chunk; });
            r.on('end', () => resolve({ statusCode: r.statusCode, body: JSON.parse(body) }));
          });
          req.on('error', reject);
          req.end();
        });

        assert.equal(res.statusCode, 200);
        assert.notEqual(res.body.status, 'auth_required');
      } finally {
        if (origEnv !== undefined) {
          process.env.AALAAPI_ALLOW_UNAUTH = origEnv;
        } else {
          delete process.env.AALAAPI_ALLOW_UNAUTH;
        }
      }
    });
  });
});
