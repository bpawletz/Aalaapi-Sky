/**
/**
 * tools/companion/rtmp_server.js
 * Aalaapi Sky - Zero-Dependency Embedded RTMP 1.0 Ingest & Relay Server
 *
 * Implements a lightweight, pure Node.js RTMP 1.0 server listening on port 1935 (0.0.0.0:1935).
 * Enables direct live video push from DJI RC 2 / DJI Fly controllers without requiring
 * external media servers (MediaMTX, OBS, NGINX).
 *
 * Supported features:
 * - RTMP 1.0 Handshake (C0/C1 -> S0/S1/S2 -> C2)
 * - AMF0 Command Serialization & Deserialization
 * - Chunk framing with variable chunk sizes (up to 65536)
 * - Sequence header caching (H.264 AVC SPS/PPS & onMetaData) for instant subscriber playback
 * - Path fault-tolerance: normalizes root 'rtmp://<ip>:1935' or any stream key into 'live/stream'
 * - Event-driven architecture for VideoService integration
 */

const net = require('node:net');
const crypto = require('node:crypto');
const EventEmitter = require('node:events');

// RTMP Message Types
const RTMP_TYPE_CHUNK_SIZE = 1;
const RTMP_TYPE_ABORT = 2;
const RTMP_TYPE_ACK = 3;
const RTMP_TYPE_USER_CONTROL = 4;
const RTMP_TYPE_WINDOW_ACK_SIZE = 5;
const RTMP_TYPE_SET_PEER_BANDWIDTH = 6;
const RTMP_TYPE_AUDIO = 8;
const RTMP_TYPE_VIDEO = 9;
const RTMP_TYPE_DATA_AMF0 = 18;
const RTMP_TYPE_INVOKE_AMF0 = 20;

// AMF0 Data Types
const AMF0_NUMBER = 0x00;
const AMF0_BOOLEAN = 0x01;
const AMF0_STRING = 0x02;
const AMF0_OBJECT = 0x03;
const AMF0_NULL = 0x05;
const AMF0_UNDEFINED = 0x06;
const AMF0_ECMA_ARRAY = 0x08;
const AMF0_OBJECT_END = 0x09;
const AMF0_STRICT_ARRAY = 0x0A;
const AMF0_LONG_STRING = 0x0C;

// Session States
const STATE_HANDSHAKE_C0C1 = 0;
const STATE_HANDSHAKE_C2 = 1;
const STATE_CHUNKS = 2;

/**
 * AMF0 Encoder & Decoder utilities
 */
class AMF0 {
  static decode(buffer, offset = 0) {
    const values = [];
    let pos = offset;

    while (pos < buffer.length) {
      const type = buffer.readUInt8(pos);
      pos += 1;

      if (type === AMF0_NUMBER) {
        if (pos + 8 > buffer.length) break;
        values.push(buffer.readDoubleBE(pos));
        pos += 8;
      } else if (type === AMF0_BOOLEAN) {
        if (pos + 1 > buffer.length) break;
        values.push(buffer.readUInt8(pos) !== 0);
        pos += 1;
      } else if (type === AMF0_STRING) {
        if (pos + 2 > buffer.length) break;
        const len = buffer.readUInt16BE(pos);
        pos += 2;
        if (pos + len > buffer.length) break;
        values.push(buffer.toString('utf8', pos, pos + len));
        pos += len;
      } else if (type === AMF0_LONG_STRING) {
        if (pos + 4 > buffer.length) break;
        const len = buffer.readUInt32BE(pos);
        pos += 4;
        if (pos + len > buffer.length) break;
        values.push(buffer.toString('utf8', pos, pos + len));
        pos += len;
      } else if (type === AMF0_NULL || type === AMF0_UNDEFINED) {
        values.push(null);
      } else if (type === AMF0_OBJECT || type === AMF0_ECMA_ARRAY) {
        if (type === AMF0_ECMA_ARRAY) {
          pos += 4; // Skip 4-byte array length hint
        }
        const obj = {};
        while (pos + 2 <= buffer.length) {
          const keyLen = buffer.readUInt16BE(pos);
          pos += 2;
          if (keyLen === 0) {
            if (pos < buffer.length && buffer.readUInt8(pos) === AMF0_OBJECT_END) {
              pos += 1;
              break;
            }
          }
          if (pos + keyLen > buffer.length) break;
          const key = buffer.toString('utf8', pos, pos + keyLen);
          pos += keyLen;

          const innerDecoded = AMF0.decode(buffer.subarray(pos), 0);
          if (innerDecoded.length > 0) {
            obj[key] = innerDecoded[0];
            // advance by bytes consumed for this value
            pos += AMF0.calculateSize(innerDecoded[0]);
          } else {
            break;
          }
        }
        values.push(obj);
      } else if (type === AMF0_OBJECT_END) {
        break;
      } else {
        // Unknown or unsupported type
        break;
      }
    }
    return values;
  }

  static calculateSize(val) {
    if (typeof val === 'number') return 1 + 8;
    if (typeof val === 'boolean') return 1 + 1;
    if (val === null || val === undefined) return 1;
    if (typeof val === 'string') {
      const len = Buffer.byteLength(val);
      return len < 65536 ? 1 + 2 + len : 1 + 4 + len;
    }
    if (typeof val === 'object') {
      let size = 1; // type
      for (const [k, v] of Object.entries(val)) {
        size += 2 + Buffer.byteLength(k);
        size += AMF0.calculateSize(v);
      }
      size += 3; // end tag 0x00 0x00 0x09
      return size;
    }
    return 1;
  }

  static encode(values) {
    const buffers = [];
    for (const val of values) {
      if (typeof val === 'number') {
        const b = Buffer.allocUnsafe(9);
        b.writeUInt8(AMF0_NUMBER, 0);
        b.writeDoubleBE(val, 1);
        buffers.push(b);
      } else if (typeof val === 'boolean') {
        const b = Buffer.allocUnsafe(2);
        b.writeUInt8(AMF0_BOOLEAN, 0);
        b.writeUInt8(val ? 1 : 0, 1);
        buffers.push(b);
      } else if (typeof val === 'string') {
        const strBuf = Buffer.from(val, 'utf8');
        if (strBuf.length < 65536) {
          const b = Buffer.allocUnsafe(3 + strBuf.length);
          b.writeUInt8(AMF0_STRING, 0);
          b.writeUInt16BE(strBuf.length, 1);
          strBuf.copy(b, 3);
          buffers.push(b);
        } else {
          const b = Buffer.allocUnsafe(5 + strBuf.length);
          b.writeUInt8(AMF0_LONG_STRING, 0);
          b.writeUInt32BE(strBuf.length, 1);
          strBuf.copy(b, 5);
          buffers.push(b);
        }
      } else if (val === null || val === undefined) {
        buffers.push(Buffer.from([AMF0_NULL]));
      } else if (typeof val === 'object') {
        const objBuffers = [Buffer.from([AMF0_OBJECT])];
        for (const [key, propVal] of Object.entries(val)) {
          const keyBuf = Buffer.from(key, 'utf8');
          const prefix = Buffer.allocUnsafe(2);
          prefix.writeUInt16BE(keyBuf.length, 0);
          objBuffers.push(prefix, keyBuf);
          objBuffers.push(AMF0.encode([propVal]));
        }
        objBuffers.push(Buffer.from([0x00, 0x00, AMF0_OBJECT_END]));
        buffers.push(Buffer.concat(objBuffers));
      }
    }
    return Buffer.concat(buffers);
  }
}

/**
 * RTMP Session managing single TCP connection
 */
class RTMPSession extends EventEmitter {
  constructor(socket, server) {
    super();
    this.socket = socket;
    this.server = server;
    this.id = crypto.randomUUID().slice(0, 8);
    this.remoteAddress = socket.remoteAddress || '127.0.0.1';
    this.state = STATE_HANDSHAKE_C0C1;
    this.buffer = Buffer.alloc(0);

    this.inChunkSize = 128;
    this.outChunkSize = 4096;
    this.windowAckSize = 2500000;
    this.inAckBytes = 0;
    this.ackBytesReceived = 0;

    this.role = null; // 'publisher' or 'subscriber'
    this.appName = 'live';
    this.streamKey = 'stream';
    this.streamId = 1;

    this.inChannels = new Map(); // csid -> { header, payloadBuffer, receivedLength }
    this.s1Data = null;

    this.socket.on('data', this.onData.bind(this));
    this.socket.on('error', this.onError.bind(this));
    this.socket.on('close', this.onClose.bind(this));
  }

  get fullStreamPath() {
    const cleanApp = (this.appName || 'live').replace(/^\/+|\/+$/g, '');
    let cleanKey = (this.streamKey || 'stream').replace(/^\/+|\/+$/g, '');
    if (cleanKey.startsWith(`${cleanApp}/`)) {
      return cleanKey;
    }
    return `${cleanApp}/${cleanKey}`;
  }

  onError(err) {
    // Ignore ECONNRESET or EPIPE from abrupt client close
    if (err.code !== 'ECONNRESET' && err.code !== 'EPIPE') {
      this.server.emit('log', `Session [${this.id}] error: ${err.message}`);
    }
  }

  onClose() {
    if (this.role === 'publisher') {
      this.server.unregisterPublisher(this);
    } else if (this.role === 'subscriber') {
      this.server.unregisterSubscriber(this);
    }
    this.emit('close');
  }

  onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    this.ackBytesReceived += chunk.length;

    if (this.state === STATE_HANDSHAKE_C0C1) {
      this.handleHandshakeC0C1();
    } else if (this.state === STATE_HANDSHAKE_C2) {
      this.handleHandshakeC2();
    }

    if (this.state === STATE_CHUNKS) {
      this.parseChunks();
    }
  }

  handleHandshakeC0C1() {
    // Need C0 (1 byte) + C1 (1536 bytes) = 1537 bytes
    if (this.buffer.length < 1537) return;

    const c0 = this.buffer.readUInt8(0);
    if (c0 !== 3) {
      // RTMP version must be 3
      this.socket.destroy();
      return;
    }

    const c1 = this.buffer.subarray(1, 1537);
    this.buffer = this.buffer.subarray(1537);

    // Prepare S0 (1 byte) + S1 (1536 bytes) + S2 (1536 bytes echo of C1)
    const s0 = Buffer.from([0x03]);
    const s1 = Buffer.allocUnsafe(1536);
    s1.writeUInt32BE(0, 0); // time
    s1.writeUInt32BE(0, 4); // zero
    crypto.randomFillSync(s1, 8, 1536 - 8);
    this.s1Data = s1;

    const s2 = Buffer.allocUnsafe(1536);
    c1.copy(s2);

    this.socket.write(Buffer.concat([s0, s1, s2]));
    this.state = STATE_HANDSHAKE_C2;
  }

  handleHandshakeC2() {
    // Need C2 (1536 bytes echo of S1)
    if (this.buffer.length < 1536) return;
    this.buffer = this.buffer.subarray(1536);
    this.state = STATE_CHUNKS;

    // Send Set Chunk Size (type 1) to optimize throughput
    this.sendSetChunkSize(this.outChunkSize);
    // Send Window Ack Size (type 5)
    this.sendWindowAckSize(this.windowAckSize);
    // Send Peer Bandwidth (type 6)
    this.sendPeerBandwidth(this.windowAckSize, 2);
  }

  parseChunks() {
    while (this.buffer.length > 0) {
      const basicHeader = this.parseBasicHeader();
      if (!basicHeader) break;

      const { fmt, csid, basicHeaderLen } = basicHeader;
      let channel = this.inChannels.get(csid);
      if (!channel) {
        channel = {
          header: {
            fmt: 0,
            csid,
            timestamp: 0,
            timestampDelta: 0,
            messageLength: 0,
            messageTypeId: 0,
            messageStreamId: 0,
            extendedTimestamp: false
          },
          payloadBuffer: null,
          receivedLength: 0
        };
        this.inChannels.set(csid, channel);
      }

      const msgHeader = this.parseMessageHeader(channel.header, fmt, basicHeaderLen);
      if (!msgHeader) break;

      const totalHeaderLen = basicHeaderLen + msgHeader.headerLen;
      const payloadBytesNeeded = channel.header.messageLength - channel.receivedLength;
      const chunkDataLen = Math.min(this.inChunkSize, payloadBytesNeeded);

      if (this.buffer.length < totalHeaderLen + chunkDataLen) {
        break; // Wait for more data
      }

      // Slice out chunk payload
      const chunkPayload = this.buffer.subarray(totalHeaderLen, totalHeaderLen + chunkDataLen);
      this.buffer = this.buffer.subarray(totalHeaderLen + chunkDataLen);

      if (!channel.payloadBuffer) {
        channel.payloadBuffer = Buffer.allocUnsafe(channel.header.messageLength);
        channel.receivedLength = 0;
      }

      chunkPayload.copy(channel.payloadBuffer, channel.receivedLength);
      channel.receivedLength += chunkDataLen;

      // Full message completed
      if (channel.receivedLength >= channel.header.messageLength) {
        const completedPayload = channel.payloadBuffer;
        channel.payloadBuffer = null;
        channel.receivedLength = 0;
        this.handleMessage(channel.header, completedPayload);
      }
    }
  }

  parseBasicHeader() {
    if (this.buffer.length < 1) return null;
    const first = this.buffer.readUInt8(0);
    const fmt = (first >> 6) & 0x03;
    let csid = first & 0x3F;
    let basicHeaderLen = 1;

    if (csid === 0) {
      if (this.buffer.length < 2) return null;
      csid = 64 + this.buffer.readUInt8(1);
      basicHeaderLen = 2;
    } else if (csid === 1) {
      if (this.buffer.length < 3) return null;
      csid = 64 + this.buffer.readUInt8(1) + (this.buffer.readUInt8(2) << 8);
      basicHeaderLen = 3;
    }

    return { fmt, csid, basicHeaderLen };
  }

  parseMessageHeader(prevHeader, fmt, basicHeaderLen) {
    let offset = basicHeaderLen;
    let timestamp = 0;
    let messageLength = prevHeader.messageLength;
    let messageTypeId = prevHeader.messageTypeId;
    let messageStreamId = prevHeader.messageStreamId;
    let hasExtendedTimestamp = false;
    let requiredBytes = 0;

    if (fmt === 0) {
      requiredBytes = 11;
      if (this.buffer.length < offset + requiredBytes) return null;
      timestamp = (this.buffer.readUInt8(offset) << 16) | (this.buffer.readUInt8(offset + 1) << 8) | this.buffer.readUInt8(offset + 2);
      messageLength = (this.buffer.readUInt8(offset + 3) << 16) | (this.buffer.readUInt8(offset + 4) << 8) | this.buffer.readUInt8(offset + 5);
      messageTypeId = this.buffer.readUInt8(offset + 6);
      messageStreamId = this.buffer.readUInt32LE(offset + 7);
      hasExtendedTimestamp = timestamp === 0xFFFFFF;
    } else if (fmt === 1) {
      requiredBytes = 7;
      if (this.buffer.length < offset + requiredBytes) return null;
      const timestampDelta = (this.buffer.readUInt8(offset) << 16) | (this.buffer.readUInt8(offset + 1) << 8) | this.buffer.readUInt8(offset + 2);
      messageLength = (this.buffer.readUInt8(offset + 3) << 16) | (this.buffer.readUInt8(offset + 4) << 8) | this.buffer.readUInt8(offset + 5);
      messageTypeId = this.buffer.readUInt8(offset + 6);
      timestamp = prevHeader.timestamp + timestampDelta;
      hasExtendedTimestamp = timestampDelta === 0xFFFFFF;
    } else if (fmt === 2) {
      requiredBytes = 3;
      if (this.buffer.length < offset + requiredBytes) return null;
      const timestampDelta = (this.buffer.readUInt8(offset) << 16) | (this.buffer.readUInt8(offset + 1) << 8) | this.buffer.readUInt8(offset + 2);
      timestamp = prevHeader.timestamp + timestampDelta;
      hasExtendedTimestamp = timestampDelta === 0xFFFFFF;
    } else if (fmt === 3) {
      requiredBytes = 0;
      timestamp = prevHeader.timestamp;
      hasExtendedTimestamp = prevHeader.extendedTimestamp;
    }

    let headerLen = requiredBytes;
    if (hasExtendedTimestamp) {
      if (this.buffer.length < offset + headerLen + 4) return null;
      timestamp = this.buffer.readUInt32BE(offset + headerLen);
      headerLen += 4;
    }

    prevHeader.fmt = fmt;
    prevHeader.timestamp = timestamp;
    prevHeader.messageLength = messageLength;
    prevHeader.messageTypeId = messageTypeId;
    prevHeader.messageStreamId = messageStreamId;
    prevHeader.extendedTimestamp = hasExtendedTimestamp;

    return { headerLen };
  }

  handleMessage(header, payload) {
    const type = header.messageTypeId;

    if (type === RTMP_TYPE_CHUNK_SIZE) {
      if (payload.length >= 4) {
        this.inChunkSize = payload.readUInt32BE(0);
      }
    } else if (type === RTMP_TYPE_INVOKE_AMF0) {
      this.handleInvoke(header, payload);
    } else if (type === RTMP_TYPE_DATA_AMF0) {
      this.handleData(header, payload);
    } else if (type === RTMP_TYPE_VIDEO) {
      this.handleVideo(header, payload);
    } else if (type === RTMP_TYPE_AUDIO) {
      this.handleAudio(header, payload);
    }
  }

  handleInvoke(header, payload) {
    const decoded = AMF0.decode(payload);
    if (!decoded || decoded.length === 0) return;

    const cmd = decoded[0];
    const transId = typeof decoded[1] === 'number' ? decoded[1] : 0;
    const cmdObj = decoded[2] || {};

    if (cmd === 'connect') {
      if (cmdObj.app) {
        this.appName = String(cmdObj.app).replace(/^\/+|\/+$/g, '') || 'live';
      }
      this.sendConnectResult(transId);
    } else if (cmd === 'releaseStream' || cmd === 'FCPublish') {
      // Acknowledge standard publishing pre-checks
      this.sendResult(transId, null, null);
    } else if (cmd === 'createStream') {
      this.sendResult(transId, null, this.streamId);
    } else if (cmd === 'publish') {
      let rawKey = typeof decoded[3] === 'string' ? decoded[3] : 'stream';
      // Normalize stream key: strip query params or leading slashes
      rawKey = rawKey.split('?')[0].replace(/^\/+|\/+$/g, '');
      if (rawKey.startsWith(`${this.appName}/`)) {
        rawKey = rawKey.slice(this.appName.length + 1);
      }
      this.streamKey = rawKey || 'stream';

      // Stream collision protection: reject second publisher targeting an active stream
      const existing = this.server.getPublisher(this.fullStreamPath);
      if (existing && existing !== this) {
        const errorMsg = `Stream '${this.fullStreamPath}' is already in use by ${existing.remoteAddress}. Please choose a unique stream key (e.g. /${this.appName}/drone2).`;
        this.sendStatus(transId, 'error', 'NetStream.Publish.BadName', errorMsg);
        this.server.emit('publisher_collision', {
          streamPath: this.fullStreamPath,
          existingPublisherIp: existing.remoteAddress,
          rejectedPublisherIp: this.remoteAddress,
          message: errorMsg
        });
        setTimeout(() => {
          try { this.socket.destroy(); } catch (_) {}
        }, 200);
        return;
      }

      this.role = 'publisher';

      this.server.registerPublisher(this);
      this.sendStatus(transId, 'status', 'NetStream.Publish.Start', `Publishing ${this.fullStreamPath}`);
    } else if (cmd === 'play') {
      let rawKey = typeof decoded[3] === 'string' ? decoded[3] : 'stream';
      rawKey = rawKey.split('?')[0].replace(/^\/+|\/+$/g, '');
      if (rawKey.startsWith(`${this.appName}/`)) {
        rawKey = rawKey.slice(this.appName.length + 1);
      }
      this.streamKey = rawKey || 'stream';
      this.role = 'subscriber';

      this.server.registerSubscriber(this);
      this.sendUserControl(0, this.streamId); // StreamBegin
      this.sendStatus(transId, 'status', 'NetStream.Play.Reset', 'Resetting and playing stream');
      this.sendStatus(transId, 'status', 'NetStream.Play.Start', 'Started playing stream');

      // Forward cached metadata & sequence header if available
      this.server.deliverCachedHeaders(this);
    } else if (cmd === 'deleteStream' || cmd === 'closeStream' || cmd === 'FCUnpublish') {
      if (this.role === 'publisher') {
        this.server.unregisterPublisher(this);
      } else if (this.role === 'subscriber') {
        this.server.unregisterSubscriber(this);
      }
      this.sendStatus(transId, 'status', 'NetStream.Unpublish.Success', 'Stream unpublished');
    }
  }

  handleData(header, payload) {
    if (this.role !== 'publisher') return;
    const decoded = AMF0.decode(payload);
    if (decoded && (decoded[0] === '@setDataFrame' || decoded[0] === 'onMetaData')) {
      this.server.cacheMetadata(this.fullStreamPath, header, payload);
    }
    this.server.relayPayload(this.fullStreamPath, header, payload);
  }

  handleVideo(header, payload) {
    if (this.role !== 'publisher' || payload.length === 0) return;

    // Check for AVC / H.264 Sequence Header:
    // Byte 0: FrameType (high 4 bits) + CodecID (low 4 bits, 7 = AVC)
    // Byte 1: AVCPacketType (0 = Sequence Header, 1 = NALU)
    const frameType = (payload[0] >> 4) & 0x0F;
    const codecId = payload[0] & 0x0F;

    if (codecId === 7 && payload.length >= 2) {
      const avcPacketType = payload[1];
      if (avcPacketType === 0) {
        // Cache SPS/PPS configuration record
        this.server.cacheVideoSequenceHeader(this.fullStreamPath, header, payload);
      }
    }

    this.server.relayPayload(this.fullStreamPath, header, payload);
  }

  handleAudio(header, payload) {
    if (this.role !== 'publisher') return;
    this.server.relayPayload(this.fullStreamPath, header, payload);
  }

  // Outbound Protocol Messages
  sendSetChunkSize(size) {
    const payload = Buffer.allocUnsafe(4);
    payload.writeUInt32BE(size, 0);
    this.sendMessage(2, 0, RTMP_TYPE_CHUNK_SIZE, 0, payload);
  }

  sendWindowAckSize(size) {
    const payload = Buffer.allocUnsafe(4);
    payload.writeUInt32BE(size, 0);
    this.sendMessage(2, 0, RTMP_TYPE_WINDOW_ACK_SIZE, 0, payload);
  }

  sendPeerBandwidth(size, type) {
    const payload = Buffer.allocUnsafe(5);
    payload.writeUInt32BE(size, 0);
    payload.writeUInt8(type, 4);
    this.sendMessage(2, 0, RTMP_TYPE_SET_PEER_BANDWIDTH, 0, payload);
  }

  sendUserControl(event, data) {
    const payload = Buffer.allocUnsafe(6);
    payload.writeUInt16BE(event, 0);
    payload.writeUInt32BE(data, 2);
    this.sendMessage(2, 0, RTMP_TYPE_USER_CONTROL, 0, payload);
  }

  sendConnectResult(transId) {
    const payload = AMF0.encode([
      '_result',
      transId,
      {
        fmsVer: 'FMS/3,0,1,123',
        capabilities: 31
      },
      {
        level: 'status',
        code: 'NetConnection.Connect.Success',
        description: 'Connection succeeded',
        data: { version: '3,0,1,123' }
      }
    ]);
    this.sendMessage(3, 0, RTMP_TYPE_INVOKE_AMF0, 0, payload);
  }

  sendResult(transId, cmdObj, val) {
    const payload = AMF0.encode(['_result', transId, cmdObj, val]);
    this.sendMessage(3, 0, RTMP_TYPE_INVOKE_AMF0, 0, payload);
  }

  sendStatus(transId, level, code, desc) {
    const payload = AMF0.encode([
      'onStatus',
      0,
      null,
      {
        level,
        code,
        description: desc
      }
    ]);
    this.sendMessage(3, 0, RTMP_TYPE_INVOKE_AMF0, this.streamId, payload);
  }

  sendMessage(csid, timestamp, typeId, streamId, payload) {
    if (!this.socket || this.socket.destroyed) return;

    const len = payload.length;
    const chunks = [];

    // First chunk has fmt 0 header (11 bytes)
    const header = Buffer.allocUnsafe(12);
    header.writeUInt8((0 << 6) | (csid & 0x3F), 0);
    header.writeUInt8((timestamp >> 16) & 0xFF, 1);
    header.writeUInt8((timestamp >> 8) & 0xFF, 2);
    header.writeUInt8(timestamp & 0xFF, 3);
    header.writeUInt8((len >> 16) & 0xFF, 4);
    header.writeUInt8((len >> 8) & 0xFF, 5);
    header.writeUInt8(len & 0xFF, 6);
    header.writeUInt8(typeId, 7);
    header.writeUInt32LE(streamId, 8);

    const firstChunkLen = Math.min(len, this.outChunkSize);
    chunks.push(header);
    chunks.push(payload.subarray(0, firstChunkLen));

    let offset = firstChunkLen;
    while (offset < len) {
      const nextChunkLen = Math.min(len - offset, this.outChunkSize);
      // fmt 3 header (1 byte basic header)
      const subHeader = Buffer.from([(3 << 6) | (csid & 0x3F)]);
      chunks.push(subHeader);
      chunks.push(payload.subarray(offset, offset + nextChunkLen));
      offset += nextChunkLen;
    }

    try {
      this.socket.write(Buffer.concat(chunks));
    } catch (_) {}
  }
}

/**
 * Main Embedded RTMP Ingest Server
 */
class RTMPServer extends EventEmitter {
  constructor(options = {}) {
    super();
    this.port = options.port || 1935;
    this.host = options.host || '0.0.0.0';
    this.tcpServer = null;
    this.sessions = new Set();
    this.streams = new Map(); // path ('live/stream') -> { publisher, subscribers: Set, metadata, videoSeqHeader }
    this.listening = false;
  }

  start() {
    return new Promise((resolve, reject) => {
      if (this.listening) return resolve();

      this.tcpServer = net.createServer((socket) => {
        const session = new RTMPSession(socket, this);
        this.sessions.add(session);

        session.on('close', () => {
          this.sessions.delete(session);
        });
      });

      this.tcpServer.on('error', (err) => {
        this.emit('error', err);
        if (!this.listening) reject(err);
      });

      this.tcpServer.listen(this.port, this.host, () => {
        this.listening = true;
        this.emit('listening', { port: this.port, host: this.host });
        resolve();
      });
    });
  }

  stop() {
    return new Promise((resolve) => {
      for (const session of this.sessions) {
        try { session.socket.destroy(); } catch (_) {}
      }
      this.sessions.clear();
      this.streams.clear();

      if (this.tcpServer) {
        this.tcpServer.close(() => {
          this.listening = false;
          resolve();
        });
      } else {
        this.listening = false;
        resolve();
      }
    });
  }

  getPublisher(streamPath) {
    const rec = this.streams.get(streamPath);
    if (!rec || !rec.publisher) return null;
    if (rec.publisher.socket && rec.publisher.socket.destroyed) {
      rec.publisher = null;
      return null;
    }
    return rec.publisher;
  }

  getStreamRecord(streamPath) {
    let rec = this.streams.get(streamPath);
    if (!rec) {
      rec = {
        publisher: null,
        subscribers: new Set(),
        metadata: null,
        videoSeqHeader: null,
        startTime: null,
        bytesRelayed: 0
      };
      this.streams.set(streamPath, rec);
    }
    return rec;
  }

  registerPublisher(session) {
    const path = session.fullStreamPath;
    const rec = this.getStreamRecord(path);
    rec.publisher = session;
    rec.startTime = Date.now();
    rec.bytesRelayed = 0;

    this.emit('publisher_connect', {
      streamPath: path,
      remoteAddress: session.remoteAddress,
      appName: session.appName,
      streamKey: session.streamKey
    });
  }

  unregisterPublisher(session) {
    const path = session.fullStreamPath;
    const rec = this.streams.get(path);
    if (rec && rec.publisher === session) {
      rec.publisher = null;
      rec.videoSeqHeader = null;
      this.emit('publisher_disconnect', {
        streamPath: path,
        remoteAddress: session.remoteAddress
      });
    }
  }

  registerSubscriber(session) {
    const path = session.fullStreamPath;
    const rec = this.getStreamRecord(path);
    rec.subscribers.add(session);

    this.emit('subscriber_connect', {
      streamPath: path,
      remoteAddress: session.remoteAddress
    });
  }

  unregisterSubscriber(session) {
    const path = session.fullStreamPath;
    const rec = this.streams.get(path);
    if (rec) {
      rec.subscribers.delete(session);
      this.emit('subscriber_disconnect', {
        streamPath: path,
        remoteAddress: session.remoteAddress
      });
    }
  }

  cacheMetadata(streamPath, header, payload) {
    const rec = this.getStreamRecord(streamPath);
    rec.metadata = { header, payload };
  }

  cacheVideoSequenceHeader(streamPath, header, payload) {
    const rec = this.getStreamRecord(streamPath);
    rec.videoSeqHeader = { header, payload };
  }

  deliverCachedHeaders(subscriber) {
    const path = subscriber.fullStreamPath;
    const rec = this.streams.get(path);
    if (!rec) return;

    if (rec.metadata) {
      subscriber.sendMessage(rec.metadata.header.csid || 3, 0, rec.metadata.header.messageTypeId, subscriber.streamId, rec.metadata.payload);
    }
    if (rec.videoSeqHeader) {
      subscriber.sendMessage(rec.videoSeqHeader.header.csid || 4, 0, rec.videoSeqHeader.header.messageTypeId, subscriber.streamId, rec.videoSeqHeader.payload);
    }
  }

  relayPayload(streamPath, header, payload) {
    const rec = this.streams.get(streamPath);
    if (!rec || rec.subscribers.size === 0) return;

    rec.bytesRelayed += payload.length;
    for (const sub of rec.subscribers) {
      sub.sendMessage(header.csid, header.timestamp, header.messageTypeId, sub.streamId, payload);
    }
  }

  getStatus() {
    const activeStreams = [];
    for (const [path, rec] of this.streams.entries()) {
      if (rec.publisher) {
        activeStreams.push({
          path,
          publisherIp: rec.publisher.remoteAddress,
          durationSec: rec.startTime ? Math.round((Date.now() - rec.startTime) / 1000) : 0,
          subscriberCount: rec.subscribers.size,
          bytesRelayed: rec.bytesRelayed
        });
      }
    }

    return {
      listening: this.listening,
      port: this.port,
      host: this.host,
      activeStreams,
      totalSessions: this.sessions.size
    };
  }
}

module.exports = {
  RTMPServer,
  RTMPSession,
  AMF0
};
