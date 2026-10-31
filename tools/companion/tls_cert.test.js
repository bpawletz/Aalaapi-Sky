const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const https = require('node:https');

const {
  createSelfSignedCertificate,
  getOrCreateCertificate,
  isCertValid
} = require('./tls_cert.js');

test('tls_cert: generates valid X.509 v3 self-signed certificate with RSA 2048 key', () => {
  const result = createSelfSignedCertificate({
    commonName: 'localhost',
    organization: 'Aalaapi Test Unit',
    altNames: ['localhost', '127.0.0.1', '192.168.1.50'],
    validityDays: 30
  });

  assert.ok(result.cert.startsWith('-----BEGIN CERTIFICATE-----'), 'Certificate starts with standard PEM header');
  assert.ok(result.cert.endsWith('-----END CERTIFICATE-----\n'), 'Certificate ends with standard PEM footer');
  assert.ok(result.key.includes('BEGIN PRIVATE KEY'), 'Private key is in PKCS#8 PEM format');

  const x509 = new crypto.X509Certificate(result.cert);
  assert.ok(x509.subject.includes('CN=localhost'), 'Subject contains CN=localhost');
  assert.ok(x509.subject.includes('O=Aalaapi Test Unit'), 'Subject contains organization');
  assert.ok(x509.subjectAltName.includes('DNS:localhost'), 'SAN includes DNS:localhost');
  assert.ok(x509.subjectAltName.includes('IP Address:127.0.0.1'), 'SAN includes IP Address:127.0.0.1');
  assert.ok(x509.subjectAltName.includes('IP Address:192.168.1.50'), 'SAN includes IP Address:192.168.1.50');
  assert.ok(result.fingerprint && result.fingerprint.length > 0, 'Fingerprint is populated');
  assert.equal(isCertValid(result.cert), true, 'Certificate is reported as valid');
});

test('tls_cert: isCertValid correctly rejects malformed or expired certificates', () => {
  assert.equal(isCertValid(null), false);
  assert.equal(isCertValid(''), false);
  assert.equal(isCertValid('invalid-pem-data'), false);
});

test('tls_cert: getOrCreateCertificate persists and reloads cached certificate', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aalaapi-cert-test-'));
  try {
    // First call: generates
    const res1 = getOrCreateCertificate({ certsDir: tempDir });
    assert.equal(res1.source, 'generated');
    assert.equal(res1.isSelfSigned, true);
    assert.ok(fs.existsSync(res1.certPath));
    assert.ok(fs.existsSync(res1.keyPath));

    // Second call: loads from cache
    const res2 = getOrCreateCertificate({ certsDir: tempDir });
    assert.equal(res2.source, 'cached');
    assert.equal(res2.cert, res1.cert);
    assert.equal(res2.key, res1.key);
    assert.equal(res2.fingerprint, res1.fingerprint);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('tls_cert: https.createServer successfully conducts TLS handshake and serves requests', async () => {
  const credentials = createSelfSignedCertificate({
    altNames: ['localhost', '127.0.0.1']
  });

  const server = https.createServer(credentials, (req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'secure_online', proto: 'https' }));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    const responsePayload = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: '127.0.0.1',
        port,
        path: '/test',
        method: 'GET',
        rejectUnauthorized: false
      }, (res) => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => resolve(JSON.parse(body)));
      });
      req.on('error', reject);
      req.end();
    });

    assert.equal(responsePayload.status, 'secure_online');
    assert.equal(responsePayload.proto, 'https');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
