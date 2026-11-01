/**
 * tools/companion/mdns_service.js
 * Aalaapi Sky - Zero-Dependency Bonjour / Multicast DNS (RFC 6762 & RFC 6763) Engine
 *
 * Implements a pure Node.js Multicast DNS (mDNS) responder, service advertiser (DNS-SD),
 * and LAN service browser with zero external npm dependencies.
 *
 * Advertises:
 * - A / AAAA Records for 'aalaapi-sky.local' and '<os-hostname>.local'
 * - _aalaapi-sky._tcp.local  (Master companion bridge service)
 * - _http._tcp.local          (Web application & REST API :8765)
 * - _https._tcp.local         (Secure HTTPS context & AI Studio :8766)
 * - _rtmp._tcp.local          (DJI RC 2 live video stream ingest :1935)
 * - _mcp._tcp.local           (Model Context Protocol SSE stream)
 * - _dump1090._tcp.local      (ADS-B BaseStation / dump1090 TCP stream :30003)
 * - _sbs._tcp.local           (SBS-1 BaseStation transponder stream :30003)
 */

const dgram = require('node:dgram');
const os = require('node:os');
const { EventEmitter } = require('node:events');

const MDNS_MULTICAST_IPV4 = '224.0.0.251';
const MDNS_PORT = 5353;

const RR_TYPE = {
  A: 1,
  PTR: 12,
  TXT: 16,
  AAAA: 28,
  SRV: 33,
  ANY: 255
};

const CLASS_IN = 1;
const CACHE_FLUSH_BIT = 0x8000;

/**
 * Encodes a domain name into DNS wire-format labels.
 * Example: 'aalaapi-sky.local' -> Buffer([11, 'a','a','l','a','a','p','i','-','s','k','y', 5, 'l','o','c','a','l', 0])
 */
function encodeDomainName(name) {
  if (!name || name === '.') return Buffer.from([0]);
  const parts = name.replace(/\.+$/, '').split('.');
  const buffers = [];
  for (const part of parts) {
    const len = Buffer.byteLength(part);
    buffers.push(Buffer.from([len]), Buffer.from(part, 'utf8'));
  }
  buffers.push(Buffer.from([0]));
  return Buffer.concat(buffers);
}

/**
 * Decodes a domain name from a DNS packet buffer, following compression pointers.
 * @returns {{ name: string, bytesRead: number }}
 */
function decodeDomainName(buf, offset = 0) {
  let curr = offset;
  const parts = [];
  let jumped = false;
  let bytesRead = 0;
  let jumps = 0;

  while (curr < buf.length) {
    const len = buf[curr];
    if (len === 0) {
      if (!jumped) bytesRead = (curr + 1) - offset;
      break;
    }

    // Compression pointer: two bytes starting with 11xxxxxx (0xC0)
    if ((len & 0xc0) === 0xc0) {
      if (curr + 1 >= buf.length) break;
      const ptr = ((len & 0x3f) << 8) | buf[curr + 1];
      if (!jumped) bytesRead = (curr + 2) - offset;
      jumped = true;
      curr = ptr;
      jumps++;
      if (jumps > 30) break; // Loop protection
      continue;
    }

    curr++;
    if (curr + len > buf.length) break;
    parts.push(buf.toString('utf8', curr, curr + len));
    curr += len;
    if (!jumped) bytesRead = curr - offset;
  }

  return { name: parts.join('.'), bytesRead };
}

/**
 * Encodes key-value pairs into DNS-SD TXT RDATA buffer.
 * Each entry is a 1-byte length followed by 'key=value' utf8 string.
 */
function encodeTxtRecord(txtObj = {}) {
  const buffers = [];
  for (const [k, v] of Object.entries(txtObj)) {
    if (v === undefined || v === null) continue;
    const str = `${k}=${v}`;
    const strBuf = Buffer.from(str, 'utf8');
    if (strBuf.length > 255) {
      buffers.push(Buffer.from([255]), strBuf.subarray(0, 255));
    } else {
      buffers.push(Buffer.from([strBuf.length]), strBuf);
    }
  }
  if (buffers.length === 0) {
    return Buffer.from([0]); // Empty TXT record
  }
  return Buffer.concat(buffers);
}

/**
 * Decodes DNS-SD TXT RDATA buffer into key-value object.
 */
function decodeTxtRecord(buf) {
  const result = {};
  let offset = 0;
  while (offset < buf.length) {
    const len = buf[offset++];
    if (len === 0 || offset + len > buf.length) break;
    const str = buf.toString('utf8', offset, offset + len);
    offset += len;
    const eqIdx = str.indexOf('=');
    if (eqIdx !== -1) {
      result[str.slice(0, eqIdx)] = str.slice(eqIdx + 1);
    } else {
      result[str] = true;
    }
  }
  return result;
}

/**
 * DNS Packet Parser & Builder
 */
class DnsPacket {
  constructor(options = {}) {
    this.id = options.id || 0;
    this.flags = options.flags || 0;
    this.questions = options.questions || [];
    this.answers = options.answers || [];
    this.authorities = options.authorities || [];
    this.additionals = options.additionals || [];
  }

  get isResponse() {
    return Boolean(this.flags & 0x8000);
  }

  static parse(buf) {
    if (!Buffer.isBuffer(buf) || buf.length < 12) {
      return null;
    }

    const id = buf.readUInt16BE(0);
    const flags = buf.readUInt16BE(2);
    const qdcount = buf.readUInt16BE(4);
    const ancount = buf.readUInt16BE(6);
    const nscount = buf.readUInt16BE(8);
    const arcount = buf.readUInt16BE(10);

    let offset = 12;
    const questions = [];

    for (let i = 0; i < qdcount && offset < buf.length; i++) {
      const dec = decodeDomainName(buf, offset);
      offset += dec.bytesRead;
      if (offset + 4 > buf.length) break;
      const type = buf.readUInt16BE(offset);
      const qclass = buf.readUInt16BE(offset + 2);
      offset += 4;
      questions.push({
        name: dec.name,
        type,
        class: qclass & 0x7fff,
        unicastResponse: Boolean(qclass & 0x8000)
      });
    }

    function parseRecords(count) {
      const records = [];
      for (let i = 0; i < count && offset < buf.length; i++) {
        const dec = decodeDomainName(buf, offset);
        offset += dec.bytesRead;
        if (offset + 10 > buf.length) break;
        const type = buf.readUInt16BE(offset);
        const rclass = buf.readUInt16BE(offset + 2);
        const ttl = buf.readUInt32BE(offset + 4);
        const rdlength = buf.readUInt16BE(offset + 8);
        offset += 10;
        if (offset + rdlength > buf.length) break;

        const rdataBuf = buf.subarray(offset, offset + rdlength);
        let data = rdataBuf;

        if (type === RR_TYPE.A && rdlength === 4) {
          data = `${rdataBuf[0]}.${rdataBuf[1]}.${rdataBuf[2]}.${rdataBuf[3]}`;
        } else if (type === RR_TYPE.PTR) {
          data = decodeDomainName(buf, offset).name;
        } else if (type === RR_TYPE.TXT) {
          data = decodeTxtRecord(rdataBuf);
        } else if (type === RR_TYPE.SRV && rdlength >= 6) {
          const priority = rdataBuf.readUInt16BE(0);
          const weight = rdataBuf.readUInt16BE(2);
          const port = rdataBuf.readUInt16BE(4);
          const target = decodeDomainName(buf, offset + 6).name;
          data = { priority, weight, port, target };
        }

        offset += rdlength;
        records.push({
          name: dec.name,
          type,
          class: rclass & 0x7fff,
          cacheFlush: Boolean(rclass & 0x8000),
          ttl,
          data
        });
      }
      return records;
    }

    const answers = parseRecords(ancount);
    const authorities = parseRecords(nscount);
    const additionals = parseRecords(arcount);

    return new DnsPacket({ id, flags, questions, answers, authorities, additionals });
  }

  encode() {
    const header = Buffer.alloc(12);
    header.writeUInt16BE(this.id, 0);
    header.writeUInt16BE(this.flags, 2);
    header.writeUInt16BE(this.questions.length, 4);
    header.writeUInt16BE(this.answers.length, 6);
    header.writeUInt16BE(this.authorities.length, 8);
    header.writeUInt16BE(this.additionals.length, 10);

    const buffers = [header];

    for (const q of this.questions) {
      buffers.push(encodeDomainName(q.name));
      const qmeta = Buffer.alloc(4);
      qmeta.writeUInt16BE(q.type || RR_TYPE.ANY, 0);
      qmeta.writeUInt16BE((q.class || CLASS_IN) | (q.unicastResponse ? 0x8000 : 0), 2);
      buffers.push(qmeta);
    }

    function encodeRecordList(recs) {
      for (const r of recs) {
        buffers.push(encodeDomainName(r.name));
        const rmeta = Buffer.alloc(10);
        rmeta.writeUInt16BE(r.type, 0);
        rmeta.writeUInt16BE((r.class || CLASS_IN) | (r.cacheFlush ? CACHE_FLUSH_BIT : 0), 2);
        rmeta.writeUInt32BE(r.ttl !== undefined ? r.ttl : 120, 4);

        let rdata = Buffer.alloc(0);
        if (r.type === RR_TYPE.A) {
          const octets = (r.data || '127.0.0.1').split('.').map(Number);
          rdata = Buffer.from(octets);
        } else if (r.type === RR_TYPE.PTR) {
          rdata = encodeDomainName(r.data);
        } else if (r.type === RR_TYPE.TXT) {
          rdata = Buffer.isBuffer(r.data) ? r.data : encodeTxtRecord(r.data);
        } else if (r.type === RR_TYPE.SRV) {
          const srvMeta = Buffer.alloc(6);
          srvMeta.writeUInt16BE(r.data?.priority || 0, 0);
          srvMeta.writeUInt16BE(r.data?.weight || 0, 2);
          srvMeta.writeUInt16BE(r.data?.port || 8765, 4);
          rdata = Buffer.concat([srvMeta, encodeDomainName(r.data?.target || 'localhost')]);
        } else if (Buffer.isBuffer(r.data)) {
          rdata = r.data;
        }

        rmeta.writeUInt16BE(rdata.length, 8);
        buffers.push(rmeta, rdata);
      }
    }

    encodeRecordList(this.answers);
    encodeRecordList(this.authorities);
    encodeRecordList(this.additionals);

    return Buffer.concat(buffers);
  }
}

/**
 * Helper to discover all external IPv4 LAN IP addresses.
 */
function getLocalIpv4Addresses() {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal && net.address && net.address !== '127.0.0.1') {
        ips.push({ name, address: net.address });
      }
    }
  }
  return ips;
}

/**
 * Main MdnsService Responder and Discoverer
 */
class MdnsService extends EventEmitter {
  constructor(options = {}) {
    super();
    this.hostname = (options.hostname || process.env.AALAAPI_MDNS_NAME || 'aalaapi-sky').replace(/\.local$/i, '');
    this.systemHostname = os.hostname().replace(/\.local$/i, '');
    this.instanceName = options.instanceName || 'Aalaapi Sky Drone Bridge';
    this.port = options.port || 8765;
    this.httpsPort = options.httpsPort || 8766;
    this.hasHttps = Boolean(options.hasHttps);
    this.rtmpPort = options.rtmpPort || 1935;
    this.version = options.version || '1.0.0';

    // ADS-B / SBS-1 dump1090 service config
    this.adsbHost = options.adsbHost || '127.0.0.1';
    this.adsbPort = options.adsbPort || 30003;
    this.adsbEnabled = options.adsbEnabled !== false;

    this.socket = null;
    this.isRunning = false;
    this.announceTimer = null;
    this.interfaces = [];
  }

  get fqdnHost() {
    return `${this.hostname}.local`;
  }

  get fqdnSysHost() {
    return `${this.systemHostname}.local`;
  }

  /**
   * Builds the full catalog of records advertised by this node.
   */
  getAdvertisedRecords(ttl = 120) {
    const fqdn = this.fqdnHost;
    const instance = this.instanceName;
    const lanIps = getLocalIpv4Addresses().map(i => i.address);
    if (lanIps.length === 0) lanIps.push('127.0.0.1');

    const records = [];

    // 1. Hostname A records for 'aalaapi-sky.local' & '<os-hostname>.local'
    for (const ip of lanIps) {
      records.push({ name: fqdn, type: RR_TYPE.A, cacheFlush: true, ttl, data: ip });
      if (this.systemHostname.toLowerCase() !== this.hostname.toLowerCase()) {
        records.push({ name: this.fqdnSysHost, type: RR_TYPE.A, cacheFlush: true, ttl, data: ip });
      }
    }

    // 2. DNS-SD General Service Enumerator (_services._dns-sd._udp.local)
    const services = [
      '_aalaapi-sky._tcp.local',
      '_http._tcp.local',
      '_rtmp._tcp.local',
      '_mcp._tcp.local'
    ];
    if (this.hasHttps) services.push('_https._tcp.local');
    if (this.adsbEnabled) {
      services.push('_dump1090._tcp.local');
      services.push('_sbs._tcp.local');
    }

    for (const s of services) {
      records.push({ name: '_services._dns-sd._udp.local', type: RR_TYPE.PTR, cacheFlush: false, ttl, data: s });
    }

    // 3. Master Aalaapi Sky Bridge Service (_aalaapi-sky._tcp.local)
    const masterInstFqdn = `${instance}._aalaapi-sky._tcp.local`;
    records.push({ name: '_aalaapi-sky._tcp.local', type: RR_TYPE.PTR, cacheFlush: false, ttl, data: masterInstFqdn });
    records.push({
      name: masterInstFqdn,
      type: RR_TYPE.SRV,
      cacheFlush: true,
      ttl,
      data: { priority: 0, weight: 0, port: this.port, target: fqdn }
    });
    records.push({
      name: masterInstFqdn,
      type: RR_TYPE.TXT,
      cacheFlush: true,
      ttl,
      data: {
        version: this.version,
        httpPort: String(this.port),
        httpsPort: this.hasHttps ? String(this.httpsPort) : '',
        rtmpPort: String(this.rtmpPort),
        sbsPort: this.adsbEnabled ? String(this.adsbPort) : '',
        sbsHost: this.adsbEnabled ? this.adsbHost : '',
        mcp: '/api/mcp/sse',
        stream: '/api/stream'
      }
    });

    // 4. HTTP Web Service (_http._tcp.local)
    const httpInstFqdn = `${instance}._http._tcp.local`;
    records.push({ name: '_http._tcp.local', type: RR_TYPE.PTR, cacheFlush: false, ttl, data: httpInstFqdn });
    records.push({
      name: httpInstFqdn,
      type: RR_TYPE.SRV,
      cacheFlush: true,
      ttl,
      data: { priority: 0, weight: 0, port: this.port, target: fqdn }
    });
    records.push({
      name: httpInstFqdn,
      type: RR_TYPE.TXT,
      cacheFlush: true,
      ttl,
      data: { path: '/', version: this.version }
    });

    // 5. HTTPS Web Service (_https._tcp.local) if active
    if (this.hasHttps) {
      const httpsInstFqdn = `${instance}._https._tcp.local`;
      records.push({ name: '_https._tcp.local', type: RR_TYPE.PTR, cacheFlush: false, ttl, data: httpsInstFqdn });
      records.push({
        name: httpsInstFqdn,
        type: RR_TYPE.SRV,
        cacheFlush: true,
        ttl,
        data: { priority: 0, weight: 0, port: this.httpsPort, target: fqdn }
      });
      records.push({
        name: httpsInstFqdn,
        type: RR_TYPE.TXT,
        cacheFlush: true,
        ttl,
        data: { path: '/', version: this.version }
      });
    }

    // 6. RTMP Live Video Ingest Service (_rtmp._tcp.local)
    const rtmpInstFqdn = `${instance} RTMP._rtmp._tcp.local`;
    records.push({ name: '_rtmp._tcp.local', type: RR_TYPE.PTR, cacheFlush: false, ttl, data: rtmpInstFqdn });
    records.push({
      name: rtmpInstFqdn,
      type: RR_TYPE.SRV,
      cacheFlush: true,
      ttl,
      data: { priority: 0, weight: 0, port: this.rtmpPort, target: fqdn }
    });
    records.push({
      name: rtmpInstFqdn,
      type: RR_TYPE.TXT,
      cacheFlush: true,
      ttl,
      data: { app: 'live', stream: 'stream', url: `rtmp://${fqdn}:${this.rtmpPort}/live/stream` }
    });

    // 7. Model Context Protocol Service (_mcp._tcp.local)
    const mcpInstFqdn = `${instance} MCP._mcp._tcp.local`;
    records.push({ name: '_mcp._tcp.local', type: RR_TYPE.PTR, cacheFlush: false, ttl, data: mcpInstFqdn });
    records.push({
      name: mcpInstFqdn,
      type: RR_TYPE.SRV,
      cacheFlush: true,
      ttl,
      data: { priority: 0, weight: 0, port: this.hasHttps ? this.httpsPort : this.port, target: fqdn }
    });
    records.push({
      name: mcpInstFqdn,
      type: RR_TYPE.TXT,
      cacheFlush: true,
      ttl,
      data: { path: '/api/mcp/sse', openapi: '/api/openapi.json', version: this.version }
    });

    // 8. ADS-B / dump1090 BaseStation SBS-1 Service (_dump1090._tcp.local & _sbs._tcp.local)
    if (this.adsbEnabled) {
      const adsbTargetHost = (this.adsbHost === '127.0.0.1' || this.adsbHost === 'localhost') ? fqdn : this.adsbHost;
      const sbsInstFqdn = `dump1090 SBS (${this.hostname})._sbs._tcp.local`;
      records.push({ name: '_sbs._tcp.local', type: RR_TYPE.PTR, cacheFlush: false, ttl, data: sbsInstFqdn });
      records.push({
        name: sbsInstFqdn,
        type: RR_TYPE.SRV,
        cacheFlush: true,
        ttl,
        data: { priority: 0, weight: 0, port: this.adsbPort, target: adsbTargetHost }
      });
      records.push({
        name: sbsInstFqdn,
        type: RR_TYPE.TXT,
        cacheFlush: true,
        ttl,
        data: {
          format: 'basestation',
          protocol: 'sbs1',
          sbsPort: String(this.adsbPort),
          rawPort: '30002',
          beastPort: '30005',
          httpPort: '8080'
        }
      });

      const dumpInstFqdn = `dump1090 Mode-S (${this.hostname})._dump1090._tcp.local`;
      records.push({ name: '_dump1090._tcp.local', type: RR_TYPE.PTR, cacheFlush: false, ttl, data: dumpInstFqdn });
      records.push({
        name: dumpInstFqdn,
        type: RR_TYPE.SRV,
        cacheFlush: true,
        ttl,
        data: { priority: 0, weight: 0, port: this.adsbPort, target: adsbTargetHost }
      });
      records.push({
        name: dumpInstFqdn,
        type: RR_TYPE.TXT,
        cacheFlush: true,
        ttl,
        data: {
          format: 'basestation',
          protocol: 'sbs1',
          sbsPort: String(this.adsbPort),
          rawPort: '30002',
          beastPort: '30005',
          httpPort: '8080'
        }
      });
    }

    return records;
  }

  /**
   * Starts the mDNS socket listener and broadcasts initial service announcements.
   */
  start() {
    if (this.isRunning) return;

    try {
      this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

      this.socket.on('error', (err) => {
        this.emit('error', err);
      });

      this.socket.on('message', (msg, rinfo) => {
        this._handleMessage(msg, rinfo);
      });

      this.socket.bind(MDNS_PORT, () => {
        this.isRunning = true;
        try {
          this.socket.setMulticastTTL(255);
          this.socket.setMulticastLoopback(true);

          // Join multicast group on all active IPv4 LAN interfaces
          const lanNets = getLocalIpv4Addresses();
          this.interfaces = lanNets;
          for (const net of lanNets) {
            try {
              this.socket.addMembership(MDNS_MULTICAST_IPV4, net.address);
            } catch (_) {}
          }
          // Join default group
          try {
            this.socket.addMembership(MDNS_MULTICAST_IPV4);
          } catch (_) {}
        } catch (_) {}

        // Broadcast initial announcements per RFC 6762 (two announcements 1 second apart)
        this.broadcastAnnounce();
        this.announceTimer = setTimeout(() => {
          if (this.isRunning) this.broadcastAnnounce();
        }, 1000);
        if (this.announceTimer.unref) this.announceTimer.unref();

        this.emit('ready', { hostname: this.fqdnHost, interfaces: this.interfaces });
      });
    } catch (e) {
      this.emit('error', e);
    }
  }

  /**
   * Updates dynamic ADS-B / SBS port configuration and announces changes.
   */
  updateAdsbService({ port, host, enabled = true }) {
    if (port) this.adsbPort = parseInt(port, 10) || 30003;
    if (host) this.adsbHost = host;
    this.adsbEnabled = enabled;
    if (this.isRunning) {
      this.broadcastAnnounce();
    }
  }

  /**
   * Broadcasts unsolicited announcement packets (QR=1, AA=1) to 224.0.0.251:5353.
   */
  broadcastAnnounce(ttl = 120) {
    if (!this.socket || !this.isRunning) return;

    const allRecords = this.getAdvertisedRecords(ttl);
    const packet = new DnsPacket({
      flags: 0x8400, // Standard response, Authoritative Answer
      answers: allRecords
    });

    const buf = packet.encode();
    this._sendMulticast(buf);
  }

  /**
   * Broadcasts goodbye packets (TTL=0) per RFC 6762 so listeners immediately flush cache.
   */
  broadcastGoodbye() {
    if (!this.socket || !this.isRunning) return;
    const allRecords = this.getAdvertisedRecords(0);
    const packet = new DnsPacket({
      flags: 0x8400,
      answers: allRecords
    });
    const buf = packet.encode();
    this._sendMulticast(buf);
  }

  _sendMulticast(buf) {
    if (!this.socket) return;
    try {
      this.socket.send(buf, 0, buf.length, MDNS_PORT, MDNS_MULTICAST_IPV4, () => {});
    } catch (_) {}
  }

  /**
   * Evaluates incoming mDNS queries and replies with matching records.
   */
  _handleMessage(buf, rinfo) {
    const packet = DnsPacket.parse(buf);
    if (!packet) return;

    // We only answer questions (QR=0)
    if (packet.isResponse || !packet.questions || packet.questions.length === 0) {
      return;
    }

    const allRecords = this.getAdvertisedRecords(120);
    const answers = [];
    const additionals = [];

    for (const q of packet.questions) {
      const qname = (q.name || '').toLowerCase();
      const qtype = q.type;

      // Find matching answers
      for (const r of allRecords) {
        const rname = (r.name || '').toLowerCase();
        const matchesName = (rname === qname);
        const matchesType = (qtype === RR_TYPE.ANY || qtype === r.type);

        if (matchesName && matchesType) {
          answers.push(r);

          // If answering a PTR query, attach corresponding SRV, TXT, and A records in additionals
          if (r.type === RR_TYPE.PTR && typeof r.data === 'string') {
            const targetInstance = r.data.toLowerCase();
            for (const sub of allRecords) {
              const subName = (sub.name || '').toLowerCase();
              if (subName === targetInstance && (sub.type === RR_TYPE.SRV || sub.type === RR_TYPE.TXT)) {
                if (!additionals.includes(sub)) additionals.push(sub);
              }
              if (sub.type === RR_TYPE.A) {
                if (!additionals.includes(sub)) additionals.push(sub);
              }
            }
          }
        }
      }
    }

    if (answers.length > 0) {
      const responsePacket = new DnsPacket({
        id: packet.id,
        flags: 0x8400, // Authoritative Response
        answers,
        additionals
      });
      const resBuf = responsePacket.encode();
      this._sendMulticast(resBuf);
    }
  }

  /**
   * Cleanly terminates the mDNS socket and announces goodbye.
   */
  stop() {
    if (!this.isRunning) return;
    if (this.announceTimer) {
      clearTimeout(this.announceTimer);
      this.announceTimer = null;
    }
    this.broadcastGoodbye();
    this.isRunning = false;
    if (this.socket) {
      try {
        this.socket.close();
      } catch (_) {}
      this.socket = null;
    }
  }

  /**
   * Actively scans the local subnet for advertised services using an ephemeral socket.
   *
   * @param {Object} options
   * @param {string} [options.serviceType='_aalaapi-sky._tcp.local'] Service to query
   * @param {number} [options.timeoutMs=1500] Discovery duration in ms
   * @returns {Promise<Array<{ name: string, host: string, address: string, port: number, txt: Object, serviceType: string }>>}
   */
  static discover(options = {}) {
    const serviceType = options.serviceType || '_aalaapi-sky._tcp.local';
    const timeoutMs = options.timeoutMs || 1500;

    return new Promise((resolve) => {
      let client = null;
      try {
        client = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      } catch (err) {
        return resolve([]);
      }

      const discovered = new Map(); // instanceName -> details object

      client.on('error', () => {
        try { client.close(); } catch (_) {}
        resolve(Array.from(discovered.values()));
      });

      client.on('message', (msg, rinfo) => {
        const packet = DnsPacket.parse(msg);
        if (!packet || !packet.isResponse) return;

        const allRecords = [...packet.answers, ...packet.additionals];
        const ptrs = allRecords.filter(r => r.type === RR_TYPE.PTR && r.name.toLowerCase() === serviceType.toLowerCase());

        for (const ptr of ptrs) {
          const instName = ptr.data;
          let entry = discovered.get(instName) || {
            name: instName.split('._')[0],
            serviceType,
            fullName: instName,
            host: null,
            address: rinfo.address,
            port: null,
            txt: {}
          };

          for (const r of allRecords) {
            const rname = (r.name || '').toLowerCase();
            if (rname === instName.toLowerCase()) {
              if (r.type === RR_TYPE.SRV && r.data) {
                entry.port = r.data.port;
                entry.host = r.data.target;
              } else if (r.type === RR_TYPE.TXT && r.data) {
                entry.txt = { ...entry.txt, ...r.data };
              }
            }
          }

          // If A record present for host, map address
          if (entry.host) {
            const aRec = allRecords.find(r => r.type === RR_TYPE.A && r.name.toLowerCase() === entry.host.toLowerCase());
            if (aRec && aRec.data) entry.address = aRec.data;
          }

          discovered.set(instName, entry);
        }
      });

      client.bind(0, () => {
        try {
          client.setMulticastTTL(255);
          client.setMulticastLoopback(true);
        } catch (_) {}

        // Send query question
        const queryPacket = new DnsPacket({
          flags: 0x0000,
          questions: [
            { name: serviceType, type: RR_TYPE.PTR, class: CLASS_IN }
          ]
        });
        const queryBuf = queryPacket.encode();

        try {
          client.send(queryBuf, 0, queryBuf.length, MDNS_PORT, MDNS_MULTICAST_IPV4, () => {});
        } catch (_) {}

        setTimeout(() => {
          try { client.close(); } catch (_) {}
          resolve(Array.from(discovered.values()));
        }, timeoutMs);
      });
    });
  }

  /**
   * Queries the local network specifically for dump1090 / SBS BaseStation servers.
   */
  static async discoverAdsb(options = {}) {
    const timeoutMs = options.timeoutMs || 1500;
    const [sbsResults, dumpResults] = await Promise.all([
      MdnsService.discover({ serviceType: '_sbs._tcp.local', timeoutMs }),
      MdnsService.discover({ serviceType: '_dump1090._tcp.local', timeoutMs })
    ]);

    const combined = new Map();
    for (const item of [...sbsResults, ...dumpResults]) {
      const key = `${item.address || item.host}:${item.port || 30003}`;
      if (!combined.has(key)) {
        combined.set(key, {
          ...item,
          port: item.port || 30003,
          isSbs: true
        });
      }
    }
    return Array.from(combined.values());
  }

  /**
   * Generates a Linux / Raspberry Pi /etc/avahi/services/dump1090.service XML descriptor.
   */
  static generateAvahiServiceXml(port = 30003) {
    return `<?xml version="1.0" standalone='no'?>
<!DOCTYPE service-group SYSTEM "avahi-service.dtd">
<service-group>
  <name replace-wildcards="yes">dump1090 SBS BaseStation (%h)</name>
  <service>
    <type>_sbs._tcp</type>
    <port>${port}</port>
    <txt-record>format=basestation</txt-record>
    <txt-record>protocol=sbs1</txt-record>
    <txt-record>rawPort=30002</txt-record>
    <txt-record>beastPort=30005</txt-record>
    <txt-record>httpPort=8080</txt-record>
  </service>
  <service>
    <type>_dump1090._tcp</type>
    <port>${port}</port>
    <txt-record>format=basestation</txt-record>
    <txt-record>protocol=sbs1</txt-record>
  </service>
</service-group>
`;
  }
}

// Standalone CLI execution for dedicated feeder boxes or manual testing
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--print-avahi')) {
    const pIdx = args.indexOf('--port');
    const port = pIdx !== -1 && args[pIdx + 1] ? parseInt(args[pIdx + 1], 10) : 30003;
    console.log(MdnsService.generateAvahiServiceXml(port));
    process.exit(0);
  }

  if (args.includes('--discover') || args.includes('-d')) {
    console.log('🔍 Scanning local network for Aalaapi Sky and SBS servers via Bonjour...');
    (async () => {
      const bridges = await MdnsService.discover({ serviceType: '_aalaapi-sky._tcp.local', timeoutMs: 2000 });
      const adsb = await MdnsService.discoverAdsb({ timeoutMs: 2000 });
      console.log('\n--- Discovered Aalaapi Bridges ---');
      console.log(JSON.stringify(bridges, null, 2));
      console.log('\n--- Discovered SBS / dump1090 Servers ---');
      console.log(JSON.stringify(adsb, null, 2));
      process.exit(0);
    })();
  } else {
    // Standalone Beacon Mode
    const isSbsOnly = args.includes('--sbs-only');
    const pIdx = args.indexOf('--port');
    const port = pIdx !== -1 && args[pIdx + 1] ? parseInt(args[pIdx + 1], 10) : (isSbsOnly ? 30003 : 8765);
    const nIdx = args.indexOf('--name');
    const name = nIdx !== -1 && args[nIdx + 1] ? args[nIdx + 1] : (isSbsOnly ? 'dump1090 SBS Feeder' : 'Aalaapi Sky Companion');
    const hIdx = args.indexOf('--hostname');
    const hostname = hIdx !== -1 && args[hIdx + 1] ? args[hIdx + 1] : (isSbsOnly ? 'adsb-sbs' : 'aalaapi-sky');

    const service = new MdnsService({
      hostname,
      instanceName: name,
      port: isSbsOnly ? 8765 : port,
      adsbPort: isSbsOnly ? port : 30003,
      adsbEnabled: true
    });

    console.log(`🛰️  Starting Standalone Bonjour (mDNS) Beacon on ${hostname}.local...`);
    service.on('ready', (info) => {
      console.log(`✅ Advertising services for ${info.hostname} across interfaces:`);
      info.interfaces.forEach(i => console.log(`   • ${i.name}: ${i.address}`));
      console.log('Press Ctrl+C to terminate.');
    });

    service.start();

    process.on('SIGINT', () => {
      console.log('\nStopping mDNS responder...');
      service.stop();
      process.exit(0);
    });
  }
}

module.exports = {
  MdnsService,
  DnsPacket,
  RR_TYPE,
  encodeDomainName,
  decodeDomainName,
  encodeTxtRecord,
  decodeTxtRecord,
  getLocalIpv4Addresses
};
