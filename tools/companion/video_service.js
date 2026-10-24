/**
 * tools/companion/video_service.js
 * Aalaapi Sky - Video Ingest, WebSocket Casting & Local Lossless Recording Service
 *
 * Implements low-latency video streaming over RFC 6455 WebSockets and concurrent
 * H.264/MP4 recording using the Python OpenCV worker (video_worker.py), with a
 * zero-dependency pure Node.js fallback.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, execSync } = require('node:child_process');
const { RTMPServer } = require('./rtmp_server.js');

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const WORKER_SCRIPT = path.join(__dirname, 'video_worker.py');
const SCRATCH_RECORDINGS_DIR = path.resolve(__dirname, '../../scratch/recordings');

// Minimal fallback 1x1 valid JPEG image buffer for headless / zero-opencv environments
const FALLBACK_JPEG = Buffer.from([
  0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
  0x00, 0x48, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
  0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
  0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20, 0x24, 0x2E, 0x27, 0x20,
  0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29, 0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27,
  0x39, 0x3D, 0x38, 0x32, 0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01,
  0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00, 0x1F, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01,
  0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04,
  0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F,
  0x00, 0xBF, 0x80, 0xFF, 0xD9
]);

class VideoService {
  constructor(options = {}) {
    this.recordingsDir = options.recordingsDir || SCRATCH_RECORDINGS_DIR;
    if (!fs.existsSync(this.recordingsDir)) {
      try { fs.mkdirSync(this.recordingsDir, { recursive: true }); } catch (_) {}
    }

    this.workerProc = null;
    this.clients = new Set();
    this.currentFrame = null;
    this.status = {
      streaming: false,
      source: 'test',
      fps: 30,
      width: 1280,
      height: 720,
      recording: false,
      recordPath: null,
      recordDurationSec: 0,
      recordFrames: 0,
      clientCount: 0,
      engine: 'initializing'
    };

    this.reconnectTimer = null;
    this.fallbackTimer = null;
    this.autoRestart = options.autoRestart !== false;
    this.lastFrameTime = 0;
    this.frameCount = 0;
    this.fpsCalculated = 30;
    this.fpsInterval = null;

    // Embedded RTMP Ingest Server (TCP port 1935)
    this.rtmpPort = options.rtmpPort || 1935;
    this.autoSwitchRtmp = options.autoSwitchRtmp !== false;
    this.previousSourceBeforeRtmp = 'test';
    this.rtmpServer = new RTMPServer({ port: this.rtmpPort, host: '0.0.0.0' });

    this.rtmpServer.on('publisher_connect', (info) => {
      this.previousSourceBeforeRtmp = this.status.source;
      if (this.autoSwitchRtmp) {
        const localRtmpUrl = `rtmp://127.0.0.1:${this.rtmpPort}/${info.streamPath}`;
        this.setSource(localRtmpUrl);
      }
    });

    this.rtmpServer.on('publisher_disconnect', () => {
      if (this.autoSwitchRtmp && typeof this.status.source === 'string' && this.status.source.startsWith('rtmp://')) {
        this.setSource(this.previousSourceBeforeRtmp || 'test');
      }
    });
  }

  /**
   * In-memory cache for video capture device enumeration to prevent repeated synchronous child process execution.
   */
  static _deviceCache = null;
  static _deviceCacheTimestamp = 0;

  static clearDeviceCache() {
    VideoService._deviceCache = null;
    VideoService._deviceCacheTimestamp = 0;
  }

  /**
   * Normalizes raw device entries into standardized device items with friendly names and types.
   */
  static formatDeviceList(rawList) {
    if (!Array.isArray(rawList) || rawList.length === 0) {
      return [
        { index: 0, value: '0', name: 'USB/HDMI Capture Card (UVC 0)', label: 'USB/HDMI Capture Card (UVC 0)', type: 'capture_card' },
        { index: 1, value: '1', name: 'Secondary Capture Card (UVC 1)', label: 'Secondary Capture Card (UVC 1)', type: 'capture_card' }
      ];
    }

    return rawList.map((item, idx) => {
      const name = (item.FriendlyName || item.name || `Video Device ${idx}`).trim();
      const lower = name.toLowerCase();
      let type = 'uvc';
      let icon = '📹';
      let category = 'UVC';

      if (/capture|hdmi|cam link|camlink|elgato|avermedia|ezcap|grabber/.test(lower) ||
          (lower.includes('usb') && lower.includes('video') && !lower.includes('webcam') && !lower.includes('camera'))) {
        type = 'capture_card';
        icon = '🔌';
        category = 'HDMI Capture';
      } else if (/webcam|camera|integrated|facetime/.test(lower)) {
        type = 'webcam';
        icon = '📷';
        category = 'Webcam';
      }

      return {
        index: idx,
        value: String(idx),
        name,
        label: `${icon} ${name} (${category} ${idx})`,
        type,
        instanceId: item.InstanceId || item.id || null
      };
    });
  }

  /**
   * Enumerate available video capture devices with friendly USB/HDMI names (cached with 30s TTL).
   */
  static getVideoDevices(ttlMs = 30000) {
    const now = Date.now();
    if (VideoService._deviceCache && (now - VideoService._deviceCacheTimestamp < ttlMs)) {
      return VideoService._deviceCache;
    }

    let devices = null;

    if (process.platform === 'win32') {
      try {
        const { execFileSync } = require('node:child_process');
        const out = execFileSync(
          'powershell.exe',
          ['-NoProfile', '-Command', 'Get-PnpDevice -Class Camera, Image | Where-Object Status -eq OK | Select-Object FriendlyName, InstanceId | ConvertTo-Json'],
          { timeout: 3500, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
        );
        if (out && out.trim()) {
          const parsed = JSON.parse(out.trim());
          const raw = Array.isArray(parsed) ? parsed : [parsed];
          devices = VideoService.formatDeviceList(raw);
        }
      } catch (_) {
        // Fallback handled below
      }
    } else if (process.platform === 'linux') {
      try {
        const v4lDir = '/sys/class/video4linux';
        if (fs.existsSync(v4lDir)) {
          const dirs = fs.readdirSync(v4lDir)
            .filter(d => /^video\d+$/.test(d))
            .sort((a, b) => parseInt(a.replace('video', ''), 10) - parseInt(b.replace('video', ''), 10));

          if (dirs.length > 0) {
            const raw = [];
            for (const d of dirs) {
              const idx = parseInt(d.replace('video', ''), 10);
              const nameFile = path.join(v4lDir, d, 'name');
              let devName = `Video Device ${idx}`;
              if (fs.existsSync(nameFile)) {
                try { devName = fs.readFileSync(nameFile, 'utf8').trim() || devName; } catch (_) {}
              }
              raw.push({ FriendlyName: devName, InstanceId: `/dev/${d}` });
            }
            devices = VideoService.formatDeviceList(raw);
          }
        }
      } catch (_) {}
    } else if (process.platform === 'darwin') {
      try {
        const { execFileSync } = require('node:child_process');
        const out = execFileSync('system_profiler', ['SPCameraDataType', '-json'], { timeout: 3500, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        if (out && out.trim()) {
          const parsed = JSON.parse(out.trim());
          const cams = parsed?.SPCameraDataType || [];
          if (cams.length > 0) {
            const raw = cams.map((c, i) => ({ FriendlyName: c._name || `Camera ${i}`, InstanceId: c.spcamera_unique_id || null }));
            devices = VideoService.formatDeviceList(raw);
          }
        }
      } catch (_) {}
    }

    if (!devices || devices.length === 0) {
      devices = VideoService.formatDeviceList([]);
    }

    VideoService._deviceCache = devices;
    VideoService._deviceCacheTimestamp = now;
    return devices;
  }

  /**
   * In-memory cache for Windows Firewall checks to avoid repeated synchronous child process execution.
   */
  static _firewallCache = new Map();

  static clearFirewallCache() {
    VideoService._firewallCache.clear();
  }

  /**
   * Checks Windows Firewall status for inbound RTMP port 1935 (cached with 60s TTL).
   */
  static checkFirewall(ruleName = 'Aalaapi Sky RTMP Ingest', port = 1935, ttlMs = 60000) {
    const key = `${ruleName}:${port}`;
    const now = Date.now();
    const cached = VideoService._firewallCache.get(key);
    if (cached && (now - cached.timestamp < ttlMs)) {
      return cached.result;
    }

    if (process.platform !== 'win32') {
      const res = {
        open: true,
        platform: process.platform,
        port,
        message: 'Non-Windows host; local firewall rules managed by OS packet filter.'
      };
      VideoService._firewallCache.set(key, { result: res, timestamp: now });
      return res;
    }

    let res = null;
    try {
      const out = execSync(`netsh advfirewall firewall show rule name="${ruleName}"`, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
      });
      if (out && (out.includes(String(port)) || out.includes(ruleName))) {
        res = {
          open: true,
          platform: 'win32',
          rule: ruleName,
          port,
          message: `Inbound firewall rule '${ruleName}' is active on port ${port}.`
        };
      }
    } catch (_) {
      // Command exits with code 1 if rule does not exist
    }

    if (!res) {
      res = {
        open: false,
        platform: 'win32',
        rule: ruleName,
        port,
        command: `netsh advfirewall firewall add rule name="${ruleName}" dir=in action=allow protocol=TCP localport=${port} profile=any description="Allows inbound RTMP video streaming from DJI RC 2 to Aalaapi Sky Companion"`,
        message: `Inbound firewall rule for port ${port} not found. Elevation required to configure.`
      };
    }

    VideoService._firewallCache.set(key, { result: res, timestamp: now });
    return res;
  }

  /**
   * Starts the embedded RTMP server.
   */
  async startRtmp() {
    try {
      await this.rtmpServer.start();
      return { success: true, port: this.rtmpPort };
    } catch (err) {
      return { success: false, error: err.message, port: this.rtmpPort };
    }
  }

  /**
   * Stops the embedded RTMP server.
   */
  async stopRtmp() {
    await this.rtmpServer.stop();
  }

  /**
   * Returns current RTMP server status and active streams including LAN broadcast URLs.
   */
  getRtmpStatus() {
    const serverStatus = this.rtmpServer.getStatus();
    const firewallStatus = VideoService.checkFirewall('Aalaapi Sky RTMP Ingest', this.rtmpPort);

    const os = require('node:os');
    const nets = os.networkInterfaces();
    const lanUrls = [];
    const port = this.rtmpPort || 1935;
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          lanUrls.push(`rtmp://${net.address}:${port}/live/stream`);
        }
      }
    }
    if (lanUrls.length === 0) {
      lanUrls.push(`rtmp://127.0.0.1:${port}/live/stream`);
    }

    return {
      ...serverStatus,
      firewall: firewallStatus,
      lanUrls,
      primaryUrl: lanUrls[0]
    };
  }

  /**
   * Generates WebSocket accept key for RFC 6455 handshake.
   */
  static generateAcceptKey(clientKey) {
    if (!clientKey) return '';
    return crypto
      .createHash('sha1')
      .update(clientKey + WS_GUID)
      .digest('base64');
  }

  /**
   * Packs raw payload into an RFC 6455 unmasked binary frame (Opcode 0x02).
   */
  static packBinaryFrame(payloadBuffer) {
    const len = payloadBuffer.length;
    let header;

    if (len < 126) {
      header = Buffer.allocUnsafe(2);
      header[0] = 0x82; // FIN = 1, Opcode = 2 (Binary)
      header[1] = len;
    } else if (len < 65536) {
      header = Buffer.allocUnsafe(4);
      header[0] = 0x82;
      header[1] = 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.allocUnsafe(10);
      header[0] = 0x82;
      header[1] = 127;
      // Big-endian 64-bit uint
      header.writeBigUInt64BE(BigInt(len), 2);
    }

    return Buffer.concat([header, payloadBuffer]);
  }

  /**
   * Starts the video ingest service and launches the background worker.
   */
  start() {
    if (this.workerProc) return;

    this.startFpsTracker();
    this.spawnWorker();
  }

  startFpsTracker() {
    if (this.fpsInterval) clearInterval(this.fpsInterval);
    this.fpsInterval = setInterval(() => {
      this.status.fps = this.frameCount;
      this.frameCount = 0;
      this.status.clientCount = this.clients.size;
    }, 1000);
  }

  spawnWorker() {
    try {
      this.workerProc = spawn('python', [WORKER_SCRIPT], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true
      });
      this.status.engine = 'opencv_python';
      this.status.streaming = true;

      // Handle binary stdout
      let buffer = Buffer.alloc(0);
      let expectedLen = null;

      this.workerProc.stdout.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);

        while (true) {
          if (expectedLen === null) {
            if (buffer.length < 4) break;
            expectedLen = buffer.readUInt32BE(0);
            buffer = buffer.subarray(4);
          }

          if (buffer.length < expectedLen) break;

          // Extract complete JPEG frame
          const frame = buffer.subarray(0, expectedLen);
          buffer = buffer.subarray(expectedLen);
          expectedLen = null;

          this.broadcastFrame(frame);
        }
      });

      // Handle stderr status/log events
      let stderrAccum = '';
      this.workerProc.stderr.on('data', (chunk) => {
        stderrAccum += chunk.toString('utf8');
        const lines = stderrAccum.split('\n');
        stderrAccum = lines.pop(); // keep remainder

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('STATUS:')) {
            try {
              const statusData = JSON.parse(trimmed.slice(7));
              Object.assign(this.status, statusData);
            } catch (_) {}
          }
        }
      });

      this.workerProc.on('error', (err) => {
        this.workerProc = null;
        this.startFallbackLoop(`Worker error: ${err.message}`);
      });

      this.workerProc.on('exit', (code) => {
        this.workerProc = null;
        this.status.streaming = false;
        if (this.autoRestart) {
          // Auto-recovery loop: reconnect in 2 seconds
          if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
          this.reconnectTimer = setTimeout(() => {
            this.spawnWorker();
          }, 2000);
        }
      });
    } catch (err) {
      this.startFallbackLoop(`Spawn failed: ${err.message}`);
    }
  }

  startFallbackLoop(reason) {
    if (this.fallbackTimer) return;
    this.status.engine = 'node_fallback';
    this.status.streaming = true;
    this.currentFrame = FALLBACK_JPEG;

    // Emits fallback frame at 30 fps
    this.fallbackTimer = setInterval(() => {
      this.broadcastFrame(FALLBACK_JPEG);
    }, 1000 / 30);
  }

  /**
   * Broadcasts a binary JPEG frame to all connected WebSocket clients.
   */
  broadcastFrame(jpegBuffer) {
    if (!jpegBuffer || jpegBuffer.length === 0) return;
    this.currentFrame = jpegBuffer;
    this.frameCount++;

    if (this.clients.size === 0) return;

    const packed = VideoService.packBinaryFrame(jpegBuffer);
    for (const socket of this.clients) {
      try {
        if (!socket.destroyed && socket.writable) {
          socket.write(packed);
        } else {
          this.clients.delete(socket);
        }
      } catch (_) {
        this.clients.delete(socket);
        try { socket.destroy(); } catch (e) {}
      }
    }
  }

  /**
   * Upgrades an incoming HTTP connection to an RFC 6455 WebSocket client.
   */
  handleUpgrade(req, socket, head) {
    const key = req.headers['sec-websocket-key'];
    if (!key) {
      socket.destroy();
      return;
    }

    const acceptKey = VideoService.generateAcceptKey(key);
    const responseHeaders = [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${acceptKey}`
    ];

    socket.write(responseHeaders.join('\r\n') + '\r\n\r\n');
    this.clients.add(socket);
    this.status.clientCount = this.clients.size;

    // Immediately push current frame if available for instant playback
    if (this.currentFrame) {
      try {
        socket.write(VideoService.packBinaryFrame(this.currentFrame));
      } catch (_) {}
    }

    // Handle client frames (Ping 0x89, Close 0x88)
    socket.on('data', (buf) => {
      if (buf.length < 2) return;
      const opcode = buf[0] & 0x0F;
      if (opcode === 0x08) {
        // Close frame
        this.clients.delete(socket);
        try { socket.end(); } catch (_) {}
      } else if (opcode === 0x09) {
        // Ping frame -> reply with Pong (0x8A)
        const pong = Buffer.from([0x8A, 0x00]);
        try { socket.write(pong); } catch (_) {}
      }
    });

    socket.on('close', () => {
      this.clients.delete(socket);
      this.status.clientCount = this.clients.size;
    });

    socket.on('error', () => {
      this.clients.delete(socket);
      this.status.clientCount = this.clients.size;
      try { socket.destroy(); } catch (_) {}
    });
  }

  /**
   * Switch the video source (RTMP URL, device index, or 'test').
   */
  setSource(source) {
    this.status.source = String(source || 'test').trim();
    if (this.workerProc && this.workerProc.stdin && this.workerProc.stdin.writable) {
      try {
        this.workerProc.stdin.write(JSON.stringify({ cmd: 'set_source', source: this.status.source }) + '\n');
      } catch (_) {}
    }
    return this.getStatus();
  }

  /**
   * Starts local recording directly to .mp4 container.
   */
  startRecording(customFilename = null) {
    if (this.status.recording) {
      return { success: false, error: 'Recording is already in progress.', status: this.getStatus() };
    }

    const dateStr = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = customFilename || `REC_${dateStr}.mp4`;
    const targetPath = path.join(this.recordingsDir, path.basename(filename));

    this.status.recording = true;
    this.status.recordPath = targetPath;
    this.status.recordDurationSec = 0;
    this.status.recordFrames = 0;

    if (this.workerProc && this.workerProc.stdin && this.workerProc.stdin.writable) {
      try {
        this.workerProc.stdin.write(JSON.stringify({ cmd: 'start_record', filePath: targetPath }) + '\n');
      } catch (_) {}
    }

    return {
      success: true,
      recording: true,
      filePath: targetPath,
      filename: path.basename(targetPath),
      startedAt: Date.now()
    };
  }

  /**
   * Stops local recording and flushes .mp4 container.
   */
  stopRecording() {
    if (!this.status.recording) {
      return { success: false, error: 'No active recording to stop.', status: this.getStatus() };
    }

    const savedFile = this.status.recordPath;
    const frames = this.status.recordFrames;
    const duration = this.status.recordDurationSec;

    this.status.recording = false;
    this.status.recordPath = null;
    this.status.recordDurationSec = 0;
    this.status.recordFrames = 0;

    if (this.workerProc && this.workerProc.stdin && this.workerProc.stdin.writable) {
      try {
        this.workerProc.stdin.write(JSON.stringify({ cmd: 'stop_record' }) + '\n');
      } catch (_) {}
    }

    let fileSizeBytes = 0;
    if (savedFile && fs.existsSync(savedFile)) {
      try {
        fileSizeBytes = fs.statSync(savedFile).size;
      } catch (_) {}
    }

    return {
      success: true,
      recording: false,
      filePath: savedFile,
      filename: savedFile ? path.basename(savedFile) : null,
      durationSec: duration,
      frames: frames,
      bytes: fileSizeBytes
    };
  }

  getStatus() {
    this.status.clientCount = this.clients.size;
    return Object.assign({}, this.status, {
      devices: VideoService.getVideoDevices()
    });
  }

  getRecordingsList() {
    if (!fs.existsSync(this.recordingsDir)) return [];
    try {
      const files = fs.readdirSync(this.recordingsDir);
      return files
        .filter(f => f.toLowerCase().endsWith('.mp4'))
        .map(f => {
          const fullPath = path.join(this.recordingsDir, f);
          const stat = fs.statSync(fullPath);
          return {
            filename: f,
            bytes: stat.size,
            mtime: stat.mtimeMs,
            createdAt: stat.birthtimeMs || stat.mtimeMs
          };
        })
        .sort((a, b) => b.mtime - a.mtime);
    } catch (_) {
      return [];
    }
  }

  /**
   * Streams a recorded MP4 file for browser download or playback.
   */
  streamRecordingFile(filename, req, res) {
    const safeName = path.basename(filename);
    const fullPath = path.join(this.recordingsDir, safeName);

    if (!fs.existsSync(fullPath)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'File not found' }));
      return;
    }

    const stat = fs.statSync(fullPath);
    res.writeHead(200, {
      'Content-Type': 'video/mp4',
      'Content-Length': stat.size,
      'Content-Disposition': `inline; filename="${safeName}"`,
      'Cache-Control': 'no-cache'
    });

    const stream = fs.createReadStream(fullPath);
    stream.pipe(res);
  }

  /**
   * Cleanly closes worker, clients, and timers on shutdown.
   */
  stop() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.fallbackTimer) clearInterval(this.fallbackTimer);
    if (this.fpsInterval) clearInterval(this.fpsInterval);

    if (this.status.recording) {
      this.stopRecording();
    }

    if (this.rtmpServer) {
      try { this.rtmpServer.stop(); } catch (_) {}
    }

    for (const socket of this.clients) {
      try { socket.destroy(); } catch (_) {}
    }
    this.clients.clear();

    if (this.workerProc) {
      try {
        this.workerProc.stdin.write(JSON.stringify({ cmd: 'quit' }) + '\n');
        setTimeout(() => {
          if (this.workerProc) {
            try { this.workerProc.kill('SIGKILL'); } catch (_) {}
            this.workerProc = null;
          }
        }, 500);
      } catch (_) {
        try { this.workerProc.kill(); } catch (_) {}
        this.workerProc = null;
      }
    }
    this.status.streaming = false;
  }
}

module.exports = { VideoService, FALLBACK_JPEG };
