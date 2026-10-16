/**
 * tools/node-red-contrib-aalaapi/test/nodes.test.js
 * Unit test suite verifying Node-RED node registration, mock bridge streaming, and message flow.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

// Minimal mock Node-RED test harness
function createMockRED() {
  const registeredTypes = {};
  const registeredNodes = {};
  const httpAdminEndpoints = {};

  return {
    nodes: {
      registerType: (type, constructor) => {
        registeredTypes[type] = constructor;
      },
      createNode: (instance, config) => {
        instance.id = config.id || 'test_node_id';
        instance.type = config.type;
        instance.name = config.name;
        instance._status = null;
        instance.status = (s) => { instance._status = s; };
        instance._wires = [];
        instance.send = (msg) => { instance._sentMsg = msg; };
        instance.error = (err) => { instance._lastError = err; };
        instance.warn = (w) => { instance._lastWarn = w; };
        instance._listeners = {};
        instance.on = (ev, handler) => {
          if (!instance._listeners[ev]) instance._listeners[ev] = [];
          instance._listeners[ev].push(handler);
        };
        instance.emit = (ev, ...args) => {
          if (instance._listeners[ev]) {
            instance._listeners[ev].forEach(h => h(...args));
          }
        };
        registeredNodes[instance.id] = instance;
      },
      getNode: (id) => registeredNodes[id] || null
    },
    httpAdmin: {
      get: (path, ...handlers) => {
        httpAdminEndpoints[path] = handlers[handlers.length - 1];
      }
    },
    auth: {
      needsPermission: () => (req, res, next) => next && next()
    },
    _registeredTypes: registeredTypes,
    _registeredNodes: registeredNodes,
    _httpAdminEndpoints: httpAdminEndpoints
  };
}

describe('Node-RED Nodes Registration & Flow Suite (node-red-contrib-aalaapi)', () => {
  let mockServer;
  let serverPort;

  before(async () => {
    // Spin up lightweight mock Aalaapi Bridge server
    await new Promise((resolve) => {
      mockServer = http.createServer((req, res) => {
        if (req.url === '/health') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok', version: '1.159.0' }));
        } else if (req.url === '/api/remote-id/drones') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            count: 1,
            drones: [{ uasId: '1581F_TEST', latitude: 41.3215, longitude: -88.9950, heightAgl: 45.0 }]
          }));
        } else if (req.url.startsWith('/api/stream')) {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
          });
          res.write('event: remote-id\ndata: {"drones":[{"uasId":"1581F_STREAM","latitude":41.32,"longitude":-88.99,"heightAgl":50}]}\n\n');
          res.write('event: ingest-complete\ndata: {"missionUuid":"test_uuid_123","totalPhotos":5,"photoPaths":["/tmp/p1.jpg"]}\n\n');
        } else {
          res.writeHead(404);
          res.end();
        }
      });
      mockServer.listen(0, '127.0.0.1', () => {
        serverPort = mockServer.address().port;
        resolve();
      });
    });
  });

  after(() => {
    if (mockServer) mockServer.close();
  });

  it('registers all 4 custom node definitions with Node-RED registry', () => {
    const RED = createMockRED();
    require('../nodes/aalaapi-config.js')(RED);
    require('../nodes/aalaapi-radar.js')(RED);
    require('../nodes/aalaapi-ingest-watch.js')(RED);
    require('../nodes/aalaapi-splat-prep.js')(RED);

    assert.ok(RED._registeredTypes['aalaapi-config']);
    assert.ok(RED._registeredTypes['aalaapi-radar']);
    assert.ok(RED._registeredTypes['aalaapi-ingest-watch']);
    assert.ok(RED._registeredTypes['aalaapi-splat-prep']);
  });

  it('aalaapi-config node tests live bridge connection via admin endpoint', async () => {
    const RED = createMockRED();
    require('../nodes/aalaapi-config.js')(RED);

    const testEndpoint = RED._httpAdminEndpoints['/aalaapi-bridge/test-connection'];
    assert.ok(typeof testEndpoint === 'function');

    let responseData = null;
    const mockRes = {
      json: (d) => { responseData = d; },
      status: () => mockRes
    };

    await testEndpoint({ query: { host: '127.0.0.1', port: serverPort, protocol: 'http:' } }, mockRes);
    assert.ok(responseData);
    assert.strictEqual(responseData.success, true);
    assert.strictEqual(responseData.status.version, '1.159.0');
  });

  it('aalaapi-splat-prep transform node successfully converts photo list to transforms.json', async () => {
    const RED = createMockRED();
    require('../nodes/aalaapi-splat-prep.js')(RED);

    const SplatPrepConstructor = RED._registeredTypes['aalaapi-splat-prep'];
    const splatNode = {};
    SplatPrepConstructor.call(splatNode, {
      id: 'splat_1',
      type: 'aalaapi-splat-prep',
      outputFormat: 'both',
      writeToDisk: false,
      filterQuality: 'all'
    });

    const inputMsg = {
      photos: [
        {
          filename: 'DJI_001.JPG',
          lat: 41.3215,
          lon: -88.9950,
          altAgl: 30,
          heading: 180,
          gimbalPitch: -60,
          flightRoll: 0
        }
      ]
    };

    await new Promise((resolve) => {
      splatNode.emit('input', inputMsg, (outMsg) => {
        assert.ok(outMsg.transforms);
        assert.strictEqual(outMsg.transforms.camera_model, 'OPENCV');
        assert.strictEqual(outMsg.transforms.frames.length, 1);
        assert.ok(outMsg.payload.colmap);
        resolve();
      }, () => resolve());
    });
  });
});
