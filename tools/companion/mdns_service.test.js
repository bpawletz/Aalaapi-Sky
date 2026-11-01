const test = require('node:test');
const assert = require('node:assert/strict');
const dgram = require('node:dgram');
const os = require('node:os');
const {
  MdnsService,
  DnsPacket,
  RR_TYPE,
  encodeDomainName,
  decodeDomainName,
  encodeTxtRecord,
  decodeTxtRecord,
  getLocalIpv4Addresses
} = require('./mdns_service.js');

test('encodeDomainName and decodeDomainName round-trip', () => {
  const domain = 'aalaapi-sky.local';
  const encoded = encodeDomainName(domain);
  assert.ok(Buffer.isBuffer(encoded));
  assert.strictEqual(encoded[0], 11); // length of 'aalaapi-sky'

  const decoded = decodeDomainName(encoded, 0);
  assert.strictEqual(decoded.name, domain);
  assert.strictEqual(decoded.bytesRead, encoded.length);
});

test('encodeDomainName and decodeDomainName handles root / empty', () => {
  const encoded = encodeDomainName('.');
  assert.strictEqual(encoded.length, 1);
  assert.strictEqual(encoded[0], 0);

  const decoded = decodeDomainName(encoded, 0);
  assert.strictEqual(decoded.name, '');
});

test('encodeTxtRecord and decodeTxtRecord round-trip', () => {
  const txtObj = {
    version: '1.215.0',
    httpPort: '8765',
    sbsPort: '30003',
    format: 'basestation'
  };

  const encoded = encodeTxtRecord(txtObj);
  assert.ok(Buffer.isBuffer(encoded));

  const decoded = decodeTxtRecord(encoded);
  assert.strictEqual(decoded.version, '1.215.0');
  assert.strictEqual(decoded.httpPort, '8765');
  assert.strictEqual(decoded.sbsPort, '30003');
  assert.strictEqual(decoded.format, 'basestation');
});

test('DnsPacket parse and encode round-trip for query and response', () => {
  const query = new DnsPacket({
    id: 1234,
    flags: 0x0000,
    questions: [
      { name: '_aalaapi-sky._tcp.local', type: RR_TYPE.PTR, class: 1 }
    ]
  });

  const queryBuf = query.encode();
  const parsedQuery = DnsPacket.parse(queryBuf);

  assert.strictEqual(parsedQuery.id, 1234);
  assert.strictEqual(parsedQuery.isResponse, false);
  assert.strictEqual(parsedQuery.questions.length, 1);
  assert.strictEqual(parsedQuery.questions[0].name, '_aalaapi-sky._tcp.local');
  assert.strictEqual(parsedQuery.questions[0].type, RR_TYPE.PTR);

  const response = new DnsPacket({
    id: 1234,
    flags: 0x8400,
    answers: [
      {
        name: '_aalaapi-sky._tcp.local',
        type: RR_TYPE.PTR,
        cacheFlush: false,
        ttl: 120,
        data: 'Aalaapi Sky Bridge._aalaapi-sky._tcp.local'
      },
      {
        name: 'aalaapi-sky.local',
        type: RR_TYPE.A,
        cacheFlush: true,
        ttl: 120,
        data: '192.168.1.100'
      },
      {
        name: 'Aalaapi Sky Bridge._aalaapi-sky._tcp.local',
        type: RR_TYPE.SRV,
        cacheFlush: true,
        ttl: 120,
        data: { priority: 0, weight: 0, port: 8765, target: 'aalaapi-sky.local' }
      },
      {
        name: 'Aalaapi Sky Bridge._aalaapi-sky._tcp.local',
        type: RR_TYPE.TXT,
        cacheFlush: true,
        ttl: 120,
        data: { version: '1.215.0', sbsPort: '30003' }
      }
    ]
  });

  const resBuf = response.encode();
  const parsedRes = DnsPacket.parse(resBuf);

  assert.strictEqual(parsedRes.isResponse, true);
  assert.strictEqual(parsedRes.answers.length, 4);

  const ptr = parsedRes.answers.find(a => a.type === RR_TYPE.PTR);
  assert.strictEqual(ptr.data, 'Aalaapi Sky Bridge._aalaapi-sky._tcp.local');

  const aRec = parsedRes.answers.find(a => a.type === RR_TYPE.A);
  assert.strictEqual(aRec.data, '192.168.1.100');

  const srv = parsedRes.answers.find(a => a.type === RR_TYPE.SRV);
  assert.strictEqual(srv.data.port, 8765);
  assert.strictEqual(srv.data.target, 'aalaapi-sky.local');

  const txt = parsedRes.answers.find(a => a.type === RR_TYPE.TXT);
  assert.strictEqual(txt.data.version, '1.215.0');
  assert.strictEqual(txt.data.sbsPort, '30003');
});

test('MdnsService catalog generates correct DNS-SD and SBS records', () => {
  const service = new MdnsService({
    hostname: 'aalaapi-sky',
    port: 8765,
    httpsPort: 8766,
    hasHttps: true,
    rtmpPort: 1935,
    adsbPort: 30003,
    adsbHost: '127.0.0.1',
    adsbEnabled: true,
    version: '1.215.0'
  });

  const records = service.getAdvertisedRecords(120);
  assert.ok(Array.isArray(records));
  assert.ok(records.length >= 10);

  // Verify A record for aalaapi-sky.local
  const hostA = records.find(r => r.name === 'aalaapi-sky.local' && r.type === RR_TYPE.A);
  assert.ok(hostA);

  // Verify master bridge service
  const bridgePtr = records.find(r => r.name === '_aalaapi-sky._tcp.local' && r.type === RR_TYPE.PTR);
  assert.ok(bridgePtr);

  // Verify HTTP & HTTPS services
  const httpPtr = records.find(r => r.name === '_http._tcp.local' && r.type === RR_TYPE.PTR);
  assert.ok(httpPtr);
  const httpsPtr = records.find(r => r.name === '_https._tcp.local' && r.type === RR_TYPE.PTR);
  assert.ok(httpsPtr);

  // Verify RTMP service
  const rtmpPtr = records.find(r => r.name === '_rtmp._tcp.local' && r.type === RR_TYPE.PTR);
  assert.ok(rtmpPtr);

  // Verify dump1090 & SBS service records
  const sbsPtr = records.find(r => r.name === '_sbs._tcp.local' && r.type === RR_TYPE.PTR);
  assert.ok(sbsPtr);
  const dumpPtr = records.find(r => r.name === '_dump1090._tcp.local' && r.type === RR_TYPE.PTR);
  assert.ok(dumpPtr);

  const sbsSrv = records.find(r => r.name.includes('_sbs._tcp.local') && r.type === RR_TYPE.SRV);
  assert.ok(sbsSrv);
  assert.strictEqual(sbsSrv.data.port, 30003);

  const sbsTxt = records.find(r => r.name.includes('_sbs._tcp.local') && r.type === RR_TYPE.TXT);
  assert.ok(sbsTxt);
  assert.strictEqual(sbsTxt.data.format, 'basestation');
  assert.strictEqual(sbsTxt.data.protocol, 'sbs1');
});

test('MdnsService.generateAvahiServiceXml produces valid XML', () => {
  const xml = MdnsService.generateAvahiServiceXml(30003);
  assert.ok(xml.includes('<type>_sbs._tcp</type>'));
  assert.ok(xml.includes('<port>30003</port>'));
  assert.ok(xml.includes('<type>_dump1090._tcp</type>'));
  assert.ok(xml.includes('<txt-record>format=basestation</txt-record>'));
});
