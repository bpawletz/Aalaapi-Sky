const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const crypto = require('node:crypto');
const { RTMPServer, AMF0 } = require('./rtmp_server.js');

test('AMF0: encode and decode primitives and objects', () => {
  const original = [
    'connect',
    1,
    { app: 'live', tcUrl: 'rtmp://127.0.0.1/live' },
    true,
    null
  ];

  const encoded = AMF0.encode(original);
  assert.ok(Buffer.isBuffer(encoded));
  assert.ok(encoded.length > 0);

  const decoded = AMF0.decode(encoded);
  assert.equal(decoded[0], 'connect');
  assert.equal(decoded[1], 1);
  assert.equal(decoded[2].app, 'live');
  assert.equal(decoded[2].tcUrl, 'rtmp://127.0.0.1/live');
  assert.equal(decoded[3], true);
  assert.equal(decoded[4], null);
});

test('AMF0: calculateSize matches encoded length', () => {
  const obj = { name: 'stream', width: 1920, height: 1080, live: true };
  const size = AMF0.calculateSize(obj);
  const encoded = AMF0.encode([obj]);
  assert.equal(size, encoded.length);
});

test('RTMPServer: lifecycle, handshake, and publisher/subscriber relay', async () => {
  try {
    // Use a random high port for unit testing to avoid conflicts
    const testPort = 19350 + Math.floor(Math.random() * 500);
    const server = new RTMPServer({ port: testPort, host: '127.0.0.1' });

    await server.start();
    assert.equal(server.listening, true);

    const statusInitial = server.getStatus();
    assert.equal(statusInitial.listening, true);
    assert.equal(statusInitial.port, testPort);
    assert.equal(statusInitial.activeStreams.length, 0);

    // Connect a simulated client
    const client = net.createConnection({ port: testPort, host: '127.0.0.1' });

    await new Promise((resolve) => client.on('connect', resolve));

    // Perform C0 + C1 handshake
    const c0c1 = Buffer.allocUnsafe(1537);
    c0c1.writeUInt8(3, 0); // C0
    c0c1.writeUInt32BE(0, 1); // C1 time
    c0c1.writeUInt32BE(0, 5); // C1 zero
    crypto.randomFillSync(c0c1, 9, 1537 - 9);

    client.write(c0c1);

    // Expect S0 (1) + S1 (1536) + S2 (1536) = 3073 bytes
    const serverHandshake = await new Promise((resolve) => {
      let received = Buffer.alloc(0);
      function onData(chunk) {
        received = Buffer.concat([received, chunk]);
        if (received.length >= 3073) {
          client.off('data', onData);
          resolve(received);
        }
      }
      client.on('data', onData);
    });

    assert.equal(serverHandshake.readUInt8(0), 3); // S0
    assert.equal(serverHandshake.length >= 3073, true);

    // Send C2 (echo of S1)
    const s1 = serverHandshake.subarray(1, 1537);
    const c2 = Buffer.allocUnsafe(1536);
    s1.copy(c2);
    client.write(c2);

    // Wait brief tick for chunk state transition
    await new Promise((r) => setTimeout(r, 50));

    // Send 'connect' AMF0 command inside an RTMP chunk (csid 3, fmt 0)
    const connectPayload = AMF0.encode(['connect', 1, { app: 'live' }]);
    const chunkHeader = Buffer.allocUnsafe(12);
    chunkHeader.writeUInt8((0 << 6) | 3, 0); // fmt 0, csid 3
    chunkHeader.writeUInt8(0, 1);
    chunkHeader.writeUInt8(0, 2);
    chunkHeader.writeUInt8(0, 3); // timestamp 0
    chunkHeader.writeUInt8((connectPayload.length >> 16) & 0xFF, 4);
    chunkHeader.writeUInt8((connectPayload.length >> 8) & 0xFF, 5);
    chunkHeader.writeUInt8(connectPayload.length & 0xFF, 6);
    chunkHeader.writeUInt8(20, 7); // RTMP_TYPE_INVOKE_AMF0
    chunkHeader.writeUInt32LE(0, 8); // streamId 0

    client.write(Buffer.concat([chunkHeader, connectPayload]));

    // Wait for connect result
    await new Promise((r) => setTimeout(r, 100));

    // Send 'publish' command
    const publishPayload = AMF0.encode(['publish', 2, null, 'live/stream', 'live']);
    const pubHeader = Buffer.allocUnsafe(12);
    pubHeader.writeUInt8((0 << 6) | 4, 0); // fmt 0, csid 4
    pubHeader.writeUInt8(0, 1);
    pubHeader.writeUInt8(0, 2);
    pubHeader.writeUInt8(0, 3);
    pubHeader.writeUInt8((publishPayload.length >> 16) & 0xFF, 4);
    pubHeader.writeUInt8((publishPayload.length >> 8) & 0xFF, 5);
    pubHeader.writeUInt8(publishPayload.length & 0xFF, 6);
    pubHeader.writeUInt8(20, 7);
    pubHeader.writeUInt32LE(1, 8);

    client.write(Buffer.concat([pubHeader, publishPayload]));

    await new Promise((r) => setTimeout(r, 100));

    // Verify server detected publisher
    const statusAfterPub = server.getStatus();
    assert.equal(statusAfterPub.activeStreams.length, 1);
    assert.equal(statusAfterPub.activeStreams[0].path, 'live/stream');

    // Send an AVC sequence header (Byte 0: 0x17 (keyframe, H.264), Byte 1: 0x00 (sequence header))
    const avcSeqPayload = Buffer.from([0x17, 0x00, 0x00, 0x00, 0x00, 0x01, 0x64, 0x00, 0x1F, 0xFF]);
    const videoChunkHeader = Buffer.allocUnsafe(12);
    videoChunkHeader.writeUInt8((0 << 6) | 4, 0); // fmt 0, csid 4
    videoChunkHeader.writeUInt8(0, 1);
    videoChunkHeader.writeUInt8(0, 2);
    videoChunkHeader.writeUInt8(0, 3);
    videoChunkHeader.writeUInt8((avcSeqPayload.length >> 16) & 0xFF, 4);
    videoChunkHeader.writeUInt8((avcSeqPayload.length >> 8) & 0xFF, 5);
    videoChunkHeader.writeUInt8(avcSeqPayload.length & 0xFF, 6);
    videoChunkHeader.writeUInt8(9, 7); // RTMP_TYPE_VIDEO
    videoChunkHeader.writeUInt32LE(1, 8);
    client.write(Buffer.concat([videoChunkHeader, avcSeqPayload]));

    await new Promise((r) => setTimeout(r, 50));

    // Verify SPS/PPS sequence header was cached on the stream record
    const streamRec = server.getStreamRecord('live/stream');
    assert.ok(streamRec.videoSeqHeader);
    assert.equal(streamRec.videoSeqHeader.payload.length, avcSeqPayload.length);

    // Clean shutdown
    client.destroy();
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(server.getStatus().activeStreams.length, 0);

    await server.stop();
    assert.equal(server.listening, false);
  } catch (e) {
    console.error('TEST ERROR:', e);
    throw e;
  }
});
