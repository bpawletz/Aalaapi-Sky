/**
 * tools/node-red-contrib-aalaapi/lib/bridge-client.js
 * Lightweight HTTP and SSE stream client for connecting Node-RED nodes to Aalaapi Bridge.
 */

const http = require('node:http');
const https = require('node:https');
const EventEmitter = require('node:events');

class BridgeClient extends EventEmitter {
  constructor(options = {}) {
    super();
    this.host = options.host || '127.0.0.1';
    this.port = Number(options.port) || 8765;
    this.protocol = options.protocol || 'http:';
    this.timeout = Number(options.timeout) || 8000;
    this.reconnectInterval = Number(options.reconnectInterval) || 3000;
    
    this._activeSseReq = null;
    this._shouldReconnect = false;
    this._reconnectTimer = null;
    this._connected = false;
  }

  getBaseUrl() {
    return `${this.protocol}//${this.host}:${this.port}`;
  }

  /**
   * Performs an HTTP GET or POST request to the bridge server.
   */
  request(method, path, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
      const client = this.protocol === 'https:' ? https : http;
      const payload = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;

      const reqHeaders = Object.assign({
        'Accept': 'application/json',
        'User-Agent': 'Node-RED-Aalaapi-Client'
      }, headers);

      if (payload && !reqHeaders['Content-Type']) {
        reqHeaders['Content-Type'] = 'application/json';
        reqHeaders['Content-Length'] = Buffer.byteLength(payload);
      }

      const req = client.request({
        hostname: this.host,
        port: this.port,
        path,
        method: method.toUpperCase(),
        headers: reqHeaders,
        timeout: this.timeout
      }, (res) => {
        let rawData = '';
        res.setEncoding('utf8');
        res.on('data', chunk => { rawData += chunk; });
        res.on('end', () => {
          let parsed = rawData;
          try {
            parsed = JSON.parse(rawData);
          } catch (_) {}

          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ statusCode: res.statusCode, data: parsed });
          } else {
            const err = new Error(`Bridge returned HTTP ${res.statusCode}: ${typeof parsed === 'object' && parsed ? (parsed.error || parsed.message || JSON.stringify(parsed)) : rawData}`);
            err.statusCode = res.statusCode;
            err.data = parsed;
            reject(err);
          }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Bridge request timed out after ${this.timeout}ms`));
      });

      req.on('error', (err) => {
        reject(new Error(`Bridge connection error (${this.host}:${this.port}): ${err.message}`));
      });

      if (payload) {
        req.write(payload);
      }
      req.end();
    });
  }

  /**
   * Health ping.
   */
  async checkHealth() {
    try {
      const res = await this.request('GET', '/health');
      return { healthy: true, status: res.data };
    } catch (err) {
      return { healthy: false, error: err.message };
    }
  }

  /**
   * Fetches active ASTM F3411 Remote ID drones from Bridge.
   */
  async getActiveDrones() {
    const res = await this.request('GET', '/api/remote-id/drones');
    return res.data;
  }

  /**
   * Fetches photo records for a mission.
   */
  async getPhotos(missionUuid, severity = 'all') {
    const q = new URLSearchParams();
    if (missionUuid) q.set('uuid', missionUuid);
    if (severity) q.set('severity', severity);
    const res = await this.request('GET', `/api/media/photos?${q.toString()}`);
    return res.data;
  }

  /**
   * Fetches the complete inspection manifest for a mission.
   */
  async getManifest(missionUuid) {
    const q = new URLSearchParams();
    if (missionUuid) q.set('uuid', missionUuid);
    const res = await this.request('GET', `/api/media/manifest?${q.toString()}`);
    return res.data;
  }

  /**
   * Connects to Bridge Server-Sent Events (SSE) stream (e.g. /api/stream or /api/remote-id/stream).
   */
  connectStream(streamPath = '/api/stream') {
    this._shouldReconnect = true;
    this._startSseConnection(streamPath);
  }

  _startSseConnection(streamPath) {
    if (this._activeSseReq) {
      try { this._activeSseReq.destroy(); } catch (_) {}
      this._activeSseReq = null;
    }

    const client = this.protocol === 'https:' ? https : http;
    const req = client.request({
      hostname: this.host,
      port: this.port,
      path: streamPath,
      method: 'GET',
      headers: {
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'User-Agent': 'Node-RED-Aalaapi-Client'
      }
    }, (res) => {
      if (res.statusCode !== 200) {
        this._connected = false;
        this.emit('disconnected', new Error(`SSE stream returned status ${res.statusCode}`));
        this._scheduleReconnect(streamPath);
        return;
      }

      this._connected = true;
      this.emit('connected', { path: streamPath });

      let buffer = '';
      let currentEvent = 'message';

      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        buffer += chunk;
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop(); // keep remainder

        for (const line of lines) {
          if (!line.trim()) {
            currentEvent = 'message';
            continue;
          }
          if (line.startsWith(':')) {
            // comment / heartbeat
            continue;
          }
          if (line.startsWith('event:')) {
            currentEvent = line.replace(/^event:\s*/, '').trim();
          } else if (line.startsWith('data:')) {
            const rawData = line.replace(/^data:\s*/, '').trim();
            let parsed = rawData;
            try {
              parsed = JSON.parse(rawData);
            } catch (_) {}
            
            this.emit('event', { event: currentEvent, data: parsed });
            if (currentEvent !== 'message') {
              this.emit(currentEvent, parsed);
            }
          }
        }
      });

      res.on('end', () => {
        this._connected = false;
        this.emit('disconnected', new Error('Stream ended by server'));
        this._scheduleReconnect(streamPath);
      });

      res.on('error', (err) => {
        this._connected = false;
        this.emit('error', err);
        this._scheduleReconnect(streamPath);
      });
    });

    req.on('error', (err) => {
      this._connected = false;
      this.emit('disconnected', err);
      this._scheduleReconnect(streamPath);
    });

    this._activeSseReq = req;
    req.end();
  }

  _scheduleReconnect(streamPath) {
    if (!this._shouldReconnect) return;
    if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
    this._reconnectTimer = setTimeout(() => {
      this._startSseConnection(streamPath);
    }, this.reconnectInterval);
  }

  disconnect() {
    this._shouldReconnect = false;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this._activeSseReq) {
      try { this._activeSseReq.destroy(); } catch (_) {}
      this._activeSseReq = null;
    }
    this._connected = false;
    this.emit('disconnected');
  }

  isConnected() {
    return this._connected;
  }
}

module.exports = BridgeClient;
