const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const aiMeshEngine = require('./ai_mesh_engine.js');
const companion = require('./server.js');

describe('AI 3D Reconstruction Architecture Suite (Issue #96 / v1.186.0)', () => {

  test('Coordinate Math: haversineMeters & calculateBearing', () => {
    // Grand Village of the Illinois / Utica, IL rural countryside coordinates
    const lat1 = 41.3215;
    const lon1 = -88.9950;
    const lat2 = 41.3225;
    const lon2 = -88.9950;

    const dist = aiMeshEngine.haversineMeters(lat1, lon1, lat2, lon2);
    assert.ok(dist > 100 && dist < 120, `Expected ~111m, got ${dist}`);

    // Due North bearing
    const bearingNorth = aiMeshEngine.calculateBearing(lat1, lon1, lat2, lon2);
    assert.ok(Math.abs(bearingNorth - 0) < 0.1 || Math.abs(bearingNorth - 360) < 0.1, `Expected North (0°), got ${bearingNorth}`);

    // Due East bearing
    const bearingEast = aiMeshEngine.calculateBearing(lat1, lon1, lat1, lon1 + 0.001);
    assert.ok(Math.abs(bearingEast - 90) < 0.5, `Expected East (90°), got ${bearingEast}`);
  });

  test('selectOrthogonalViews: Ingests and bins N, E, S, W facades & roof view', () => {
    const centerLat = 41.3215;
    const centerLon = -88.9950;

    // Synthetic orbit with 8 shots around asset + 1 nadir roof shot
    const syntheticPhotos = [
      // 0: North of asset (bearing ~0°), camera pointing South (yaw 180°), pitch -45° -> View of North Facade
      { id: 'p_north', lat: centerLat + 0.0003, lon: centerLon, alt: 25, heading: 180, gimbalPitch: -45 },
      // 1: NE of asset
      { id: 'p_ne', lat: centerLat + 0.0002, lon: centerLon + 0.0002, alt: 25, heading: 225, gimbalPitch: -45 },
      // 2: East of asset (bearing ~90°), camera pointing West (yaw 270°), pitch -45° -> View of East Facade
      { id: 'p_east', lat: centerLat, lon: centerLon + 0.0003, alt: 25, heading: 270, gimbalPitch: -45 },
      // 3: SE of asset
      { id: 'p_se', lat: centerLat - 0.0002, lon: centerLon + 0.0002, alt: 25, heading: 315, gimbalPitch: -45 },
      // 4: South of asset (bearing ~180°), camera pointing North (yaw 0°), pitch -45° -> View of South Facade
      { id: 'p_south', lat: centerLat - 0.0003, lon: centerLon, alt: 25, heading: 0, gimbalPitch: -45 },
      // 5: SW of asset
      { id: 'p_sw', lat: centerLat - 0.0002, lon: centerLon - 0.0002, alt: 25, heading: 45, gimbalPitch: -45 },
      // 6: West of asset (bearing ~270°), camera pointing East (yaw 90°), pitch -45° -> View of West Facade
      { id: 'p_west', lat: centerLat, lon: centerLon - 0.0003, alt: 25, heading: 90, gimbalPitch: -45 },
      // 7: NW of asset
      { id: 'p_nw', lat: centerLat + 0.0002, lon: centerLon - 0.0002, alt: 25, heading: 135, gimbalPitch: -45 },
      // 8: Nadir Roof Shot
      { id: 'p_roof', lat: centerLat + 0.00001, lon: centerLon + 0.00001, alt: 35, heading: 0, gimbalPitch: -90 }
    ];

    const result = aiMeshEngine.selectOrthogonalViews(syntheticPhotos, { center: { lat: centerLat, lon: centerLon } });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.totalEvaluated, 9);
    assert.ok(result.selected.north, 'Should select North facade');
    assert.strictEqual(result.selected.north.id, 'p_north');

    assert.ok(result.selected.east, 'Should select East facade');
    assert.strictEqual(result.selected.east.id, 'p_east');

    assert.ok(result.selected.south, 'Should select South facade');
    assert.strictEqual(result.selected.south.id, 'p_south');

    assert.ok(result.selected.west, 'Should select West facade');
    assert.strictEqual(result.selected.west.id, 'p_west');

    assert.ok(result.selected.roof, 'Should select Roof nadir view');
    assert.strictEqual(result.selected.roof.id, 'p_roof');
  });

  test('selectOrthogonalViews: Handles empty photo array gracefully', () => {
    const result = aiMeshEngine.selectOrthogonalViews([]);
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.count, 0);
  });

  test('generateObjMesh: Produces valid Wavefront OBJ format', () => {
    const objStr = aiMeshEngine.generateObjMesh({ elevationOffset: 5.0 });
    assert.ok(typeof objStr === 'string');
    assert.ok(objStr.includes('v '));
    assert.ok(objStr.includes('vn '));
    assert.ok(objStr.includes('f '));

    // Verify elevation offset was applied to Y vertices
    const lines = objStr.split('\n');
    const vLines = lines.filter(l => l.startsWith('v '));
    assert.ok(vLines.length >= 8);

    const firstY = parseFloat(vLines[0].split(' ')[2]);
    assert.ok(Math.abs(firstY - 5.0) < 0.01, `Expected base Y = 5.0m, got ${firstY}`);
  });

  test('generateGlbMesh: Produces valid Binary glTF 2.0 buffer', () => {
    const glbBuffer = aiMeshEngine.generateGlbMesh({ elevationOffset: 2.5 });
    assert.ok(Buffer.isBuffer(glbBuffer));
    assert.ok(glbBuffer.length > 100);

    // Magic: 0x46546C67 ('glTF')
    const magic = glbBuffer.readUInt32LE(0);
    assert.strictEqual(magic, 0x46546C67, 'GLB magic header must be 0x46546C67');

    // Version 2
    const version = glbBuffer.readUInt32LE(4);
    assert.strictEqual(version, 2, 'GLB version must be 2');

    // Total length
    const totalLength = glbBuffer.readUInt32LE(8);
    assert.strictEqual(totalLength, glbBuffer.length);

    // JSON chunk header
    const jsonChunkLength = glbBuffer.readUInt32LE(12);
    const jsonChunkType = glbBuffer.readUInt32LE(16);
    assert.strictEqual(jsonChunkType, 0x4E4F534A, 'First chunk must be JSON (0x4E4F534A)');

    // Verify valid JSON content inside glTF chunk
    const jsonBytes = glbBuffer.slice(20, 20 + jsonChunkLength);
    const parsed = JSON.parse(jsonBytes.toString('utf8').trim());
    assert.strictEqual(parsed.asset.version, '2.0');
    assert.ok(Array.isArray(parsed.meshes));
    assert.strictEqual(parsed.meshes[0].primitives[0].mode, 4); // TRIANGLES
  });

  test('Credential Security: API keys are masked and isolated on host', () => {
    // Save test API token
    aiMeshEngine.saveAi3dConfig({
      apiKey: 'sec_test_token_987654321',
      provider: 'tripo3d',
      model: 'instant-mesh'
    });

    const safeConfig = aiMeshEngine.getClientSafeConfig();
    assert.strictEqual(safeConfig.hasApiKey, true);
    assert.strictEqual(safeConfig.provider, 'tripo3d');
    assert.strictEqual(safeConfig.model, 'instant-mesh');
    assert.strictEqual(safeConfig.maskedApiKey, 'sec...321');
    assert.ok(!safeConfig.maskedApiKey.includes('987654'), 'Raw secret key must never be exposed');
  });

  test('startReconstructionJob & Local Asset Compilation', async () => {
    const job = await aiMeshEngine.startReconstructionJob({
      missionUuid: 'mission_ai3d_test_001',
      engine: 'local',
      elevationOffset: 1.0,
      photos: [
        { id: 'test_n', lat: 41.322, lon: -88.995, heading: 180, gimbalPitch: -45 },
        { id: 'test_s', lat: 41.321, lon: -88.995, heading: 0, gimbalPitch: -45 }
      ]
    });

    assert.ok(job.id.startsWith('ai3d_'));
    assert.strictEqual(job.status, 'processing');

    // Wait for local async completion (< 1500ms)
    await new Promise(r => setTimeout(r, 1600));

    const finalStatus = aiMeshEngine.getActiveJobStatus();
    assert.strictEqual(finalStatus.status, 'completed');
    assert.strictEqual(finalStatus.progress, 100);
    assert.ok(finalStatus.assets);
    assert.ok(fs.existsSync(finalStatus.assets.glbPath));
    assert.ok(fs.existsSync(finalStatus.assets.objPath));
    assert.ok(finalStatus.assets.glbUrl.includes('latest_building.glb'));
  });

  test('Companion Server: AI 3D Endpoints (/api/ai3d/*)', async () => {
    const server = companion.server;
    let openedLocally = false;
    let addr = server.address();
    let port = addr && addr.port ? addr.port : null;

    if (!port) {
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      port = server.address().port;
      openedLocally = true;
    }

    try {
      // 1. GET /api/ai3d/config
      const configRes = await new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${port}/api/ai3d/config`, res => {
          let data = '';
          res.on('data', c => { data += c; });
          res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
        }).on('error', reject);
      });

      assert.strictEqual(configRes.status, 200);
      assert.strictEqual(configRes.body.success, true);
      assert.ok(configRes.body.config.hasApiKey !== undefined);

      // 2. GET /api/ai3d/status
      const statusRes = await new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${port}/api/ai3d/status`, res => {
          let data = '';
          res.on('data', c => { data += c; });
          res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
        }).on('error', reject);
      });

      assert.strictEqual(statusRes.status, 200);
      assert.strictEqual(statusRes.body.success, true);
      assert.ok(statusRes.body.job.id);

      // 3. GET /api/ai3d/mesh (GLB binary stream)
      const meshRes = await new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${port}/api/ai3d/mesh?format=glb`, res => {
          const chunks = [];
          res.on('data', c => chunks.push(c));
          res.on('end', () => resolve({
            status: res.statusCode,
            headers: res.headers,
            buffer: Buffer.concat(chunks)
          }));
        }).on('error', reject);
      });

      assert.strictEqual(meshRes.status, 200);
      assert.strictEqual(meshRes.headers['content-type'], 'model/gltf-binary');
      assert.strictEqual(meshRes.headers['access-control-allow-origin'], '*');
      assert.ok(meshRes.buffer.length > 50);
      assert.strictEqual(meshRes.buffer.readUInt32LE(0), 0x46546C67); // 'glTF'
    } finally {
      if (openedLocally) {
        await new Promise(resolve => server.close(resolve));
      }
    }
  });

});
