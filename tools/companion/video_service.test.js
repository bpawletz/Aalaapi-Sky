/**
 * tools/companion/video_service.test.js
 * Unit tests for VideoService & RFC 6455 binary WebSocket framing
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { VideoService, FALLBACK_JPEG } = require('./video_service.js');

describe('VideoService Tests (Issue #97)', () => {
  let testDir;
  let service;

  before(() => {
    testDir = path.join(os.tmpdir(), `aalaapi_vid_test_${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
    service = new VideoService({ recordingsDir: testDir, autoRestart: false });
  });

  after(() => {
    if (service) service.stop();
    try {
      if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
    } catch (_) {}
  });

  it('correctly calculates RFC 6455 WebSocket accept key (RFC standard vector)', () => {
    // RFC 6455 section 1.3 test vector:
    // Key: "dGhlIHNhbXBsZSBub25jZQ=="
    // Expected Accept: "s3pPLMBiTxaQ9kYGzzhZRbK+xOo="
    const key = 'dGhlIHNhbXBsZSBub25jZQ==';
    const accept = VideoService.generateAcceptKey(key);
    assert.strictEqual(accept, 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=');
  });

  it('packs small binary frames (< 126 bytes) with 2-byte header', () => {
    const payload = Buffer.from('hello-binary-frame');
    const packed = VideoService.packBinaryFrame(payload);

    assert.strictEqual(packed.length, payload.length + 2);
    assert.strictEqual(packed[0], 0x82); // FIN + Opcode 2
    assert.strictEqual(packed[1], payload.length);
    assert.deepStrictEqual(packed.subarray(2), payload);
  });

  it('packs medium binary frames (126 to 65535 bytes) with 4-byte header', () => {
    const payload = Buffer.alloc(1024, 0xAA);
    const packed = VideoService.packBinaryFrame(payload);

    assert.strictEqual(packed.length, payload.length + 4);
    assert.strictEqual(packed[0], 0x82);
    assert.strictEqual(packed[1], 126);
    assert.strictEqual(packed.readUInt16BE(2), 1024);
    assert.deepStrictEqual(packed.subarray(4), payload);
  });

  it('packs large binary frames (>= 65536 bytes) with 10-byte header', () => {
    const payload = Buffer.alloc(70000, 0xBB);
    const packed = VideoService.packBinaryFrame(payload);

    assert.strictEqual(packed.length, payload.length + 10);
    assert.strictEqual(packed[0], 0x82);
    assert.strictEqual(packed[1], 127);
    assert.strictEqual(Number(packed.readBigUInt64BE(2)), 70000);
  });

  it('initializes with default status parameters and inactive recording', () => {
    const status = service.getStatus();
    assert.strictEqual(status.recording, false);
    assert.strictEqual(status.source, 'test');
    assert.strictEqual(status.clientCount, 0);
  });

  it('handles source switching', () => {
    service.setSource('rtmp://127.0.0.1:1935/live/drone');
    const status = service.getStatus();
    assert.strictEqual(status.source, 'rtmp://127.0.0.1:1935/live/drone');

    service.setSource('test');
    assert.strictEqual(service.getStatus().source, 'test');
  });

  it('starts and stops recording, updating status and directory listings', () => {
    const startRes = service.startRecording('flight_test_clip.mp4');
    assert.strictEqual(startRes.success, true);
    assert.strictEqual(startRes.recording, true);
    assert.strictEqual(service.getStatus().recording, true);

    // Prevent duplicate start
    const dupRes = service.startRecording('dup.mp4');
    assert.strictEqual(dupRes.success, false);

    // Create a dummy file to simulate writer output
    fs.writeFileSync(startRes.filePath, Buffer.alloc(256));

    const stopRes = service.stopRecording();
    assert.strictEqual(stopRes.success, true);
    assert.strictEqual(stopRes.recording, false);
    assert.strictEqual(service.getStatus().recording, false);
    assert.strictEqual(stopRes.filename, 'flight_test_clip.mp4');
    assert.strictEqual(stopRes.bytes, 256);

    const recordings = service.getRecordingsList();
    assert.strictEqual(recordings.length, 1);
    assert.strictEqual(recordings[0].filename, 'flight_test_clip.mp4');
    assert.strictEqual(recordings[0].bytes, 256);
  });

  it('broadcasts frames to registered mock sockets', () => {
    let receivedData = null;
    const mockSocket = {
      destroyed: false,
      writable: true,
      write(buf) {
        receivedData = buf;
      },
      destroy() {
        this.destroyed = true;
      }
    };

    service.clients.add(mockSocket);
    service.broadcastFrame(FALLBACK_JPEG);

    assert.ok(receivedData);
    assert.strictEqual(receivedData[0], 0x82); // Valid packed frame
    service.clients.delete(mockSocket);
  });

  it('firewall check returns structured object with port 1935', () => {
    const fw = VideoService.checkFirewall();
    assert.equal(typeof fw.open, 'boolean');
    assert.equal(fw.port, 1935);
    assert.ok(fw.platform);
  });

  it('embedded RTMP lifecycle and status reporting inside VideoService', async () => {
    const testRtmpPort = 19370 + Math.floor(Math.random() * 500);
    const testService = new VideoService({ rtmpPort: testRtmpPort, autoRestart: false });
    
    const startRes = await testService.startRtmp();
    assert.equal(startRes.success, true);
    assert.equal(startRes.port, testRtmpPort);

    const rtmpStatus = testService.getRtmpStatus();
    assert.equal(rtmpStatus.listening, true);
    assert.equal(rtmpStatus.port, testRtmpPort);
    assert.equal(typeof rtmpStatus.firewall, 'object');

    // Simulate publisher connect event
    testService.rtmpServer.emit('publisher_connect', {
      streamPath: 'live/stream',
      remoteAddress: '192.168.1.50'
    });

    assert.equal(testService.status.source, `rtmp://127.0.0.1:${testRtmpPort}/live/stream`);

    // Simulate publisher disconnect event
    testService.rtmpServer.emit('publisher_disconnect', {
      streamPath: 'live/stream',
      remoteAddress: '192.168.1.50'
    });

    assert.equal(testService.status.source, 'test');

    await testService.stopRtmp();
    assert.equal(testService.rtmpServer.listening, false);
    testService.stop();
  });
});
