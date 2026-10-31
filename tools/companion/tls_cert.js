/**
 * Aalaapi Sky - Zero-Dependency TLS Certificate Engine
 * 
 * Provides automated self-signed X.509 v3 certificate generation and management
 * using Node.js native crypto APIs (zero external npm dependencies, zero OpenSSL dependency).
 * Enables secure HTTPS transport for Google AI Studio (aistudio.google.com), web-based
 * Aalaapi Sky deployments, and secure browser contexts.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const DEFAULT_CERTS_DIR = path.resolve(__dirname, '../../scratch/certs');
const FALLBACK_USER_CERTS_DIR = path.join(os.homedir(), '.aalaapi', 'certs');

/**
 * ASN.1 DER Encoding Helpers
 */
function encodeLength(len) {
  if (len < 128) return Buffer.from([len]);
  const bytes = [];
  let temp = len;
  while (temp > 0) {
    bytes.unshift(temp & 0xff);
    temp >>= 8;
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function tag(tagByte, content) {
  const c = Buffer.isBuffer(content) ? content : Buffer.from(content);
  return Buffer.concat([Buffer.from([tagByte]), encodeLength(c.length), c]);
}

function seq(...items) {
  return tag(0x30, Buffer.concat(items));
}

function set(...items) {
  return tag(0x31, Buffer.concat(items));
}

/**
 * Formats a Date object into ASN.1 UTCTime format (YYMMDDHHMMSSZ).
 */
function toUtcTime(date) {
  const pad = (n) => String(n).padStart(2, '0');
  const y = String(date.getUTCFullYear()).slice(-2);
  const m = pad(date.getUTCMonth() + 1);
  const d = pad(date.getUTCDate());
  const h = pad(date.getUTCHours());
  const min = pad(date.getUTCMinutes());
  const s = pad(date.getUTCSeconds());
  return `${y}${m}${d}${h}${min}${s}Z`;
}

/**
 * Generates a self-signed X.509 v3 certificate and RSA 2048 private key.
 * 
 * @param {Object} options
 * @param {string} [options.commonName='localhost']
 * @param {string} [options.organization='Aalaapi Sky Companion']
 * @param {string[]} [options.altNames] List of hostnames and IP addresses for Subject Alternative Names (SAN)
 * @param {number} [options.validityDays=365]
 * @returns {{ cert: string, key: string, fingerprint: string }}
 */
function createSelfSignedCertificate(options = {}) {
  const commonName = options.commonName || 'localhost';
  const organization = options.organization || 'Aalaapi Sky Companion';
  const validityDays = options.validityDays || 365;

  // 1. Generate 2048-bit RSA Keypair
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });

  const now = new Date();
  const notBefore = new Date(now.getTime() - 60 * 1000); // 1 minute leeway for clock skew
  const notAfter = new Date(now.getTime() + validityDays * 24 * 60 * 60 * 1000);

  // 2. Build ASN.1 TBSCertificate Elements
  // Version 3: [0] EXPLICIT INTEGER 2
  const version = tag(0xa0, tag(0x02, Buffer.from([0x02])));

  // Serial Number: 64-bit positive integer
  const serialBytes = crypto.randomBytes(8);
  serialBytes[0] = serialBytes[0] & 0x7f; // Ensure positive sign bit
  const serial = tag(0x02, serialBytes);

  // Signature Algorithm: sha256WithRSAEncryption (1.2.840.113549.1.1.11)
  const sigAlg = seq(
    tag(0x06, Buffer.from('2a864886f70d01010b', 'hex')),
    tag(0x05, Buffer.alloc(0)) // NULL parameters
  );

  // Issuer & Subject: O=..., CN=...
  const orgSeq = seq(
    tag(0x06, Buffer.from('55040a', 'hex')), // id-at-organizationName
    tag(0x0c, Buffer.from(organization, 'utf8')) // UTF8String
  );
  const cnSeq = seq(
    tag(0x06, Buffer.from('550403', 'hex')), // id-at-commonName
    tag(0x0c, Buffer.from(commonName, 'utf8')) // UTF8String
  );
  const name = seq(set(orgSeq), set(cnSeq));

  // Validity: notBefore and notAfter
  const validity = seq(
    tag(0x17, Buffer.from(toUtcTime(notBefore), 'ascii')),
    tag(0x17, Buffer.from(toUtcTime(notAfter), 'ascii'))
  );

  // SubjectPublicKeyInfo (already DER encoded by crypto.generateKeyPairSync)
  const spki = publicKey;

  // 3. Extensions [3] (SAN & Basic Constraints)
  const rawAltNames = options.altNames && Array.isArray(options.altNames) ? options.altNames : ['localhost', '127.0.0.1'];
  // Deduplicate and filter altNames
  const altNames = Array.from(new Set(rawAltNames.filter(Boolean)));
  if (!altNames.includes('localhost')) altNames.unshift('localhost');
  if (!altNames.includes('127.0.0.1')) altNames.push('127.0.0.1');

  const sanEntries = [];
  for (const alt of altNames) {
    const isIpv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(alt);
    const isIpv6 = alt.includes(':');
    if (isIpv4) {
      const octets = alt.split('.').map(Number);
      sanEntries.push(tag(0x87, Buffer.from(octets))); // iPAddress [7] IMPLICIT OCTET STRING
    } else if (isIpv6) {
      // Basic IPv6 loopback check
      if (alt === '::1') {
        const ip6Bytes = Buffer.alloc(16);
        ip6Bytes[15] = 1;
        sanEntries.push(tag(0x87, ip6Bytes));
      }
    } else {
      sanEntries.push(tag(0x82, Buffer.from(alt, 'utf8'))); // dNSName [2] IMPLICIT IA5String
    }
  }

  const sanPayload = seq(...sanEntries);
  const sanExt = seq(
    tag(0x06, Buffer.from('551d11', 'hex')), // 2.5.29.17 id-ce-subjectAltName
    tag(0x04, sanPayload) // OCTET STRING wrapping SAN DER
  );

  // Basic Constraints: cA=FALSE
  const bcExt = seq(
    tag(0x06, Buffer.from('551d13', 'hex')), // 2.5.29.19 id-ce-basicConstraints
    tag(0x04, seq(tag(0x01, Buffer.from([0x00])))) // FALSE
  );

  // Key Usage: digitalSignature, keyEncipherment (0x03, 0x07, 0x80, 0x20)
  const kuExt = seq(
    tag(0x06, Buffer.from('551d0f', 'hex')), // 2.5.29.15 id-ce-keyUsage
    tag(0x04, tag(0x03, Buffer.from([0x05, 0xa0]))) // BitString with 5 unused bits: digitalSignature(0), keyEncipherment(2)
  );

  const extensionsWrapper = tag(0xa3, seq(bcExt, kuExt, sanExt));

  // 4. Combine into TBSCertificate structure
  const tbs = seq(
    version,
    serial,
    sigAlg,
    name,
    validity,
    name,
    spki,
    extensionsWrapper
  );

  // 5. Sign TBSCertificate with RSA Private Key
  const signer = crypto.createSign('SHA256');
  signer.update(tbs);
  const rawSignature = signer.sign(privateKey);

  // Signature BitString: prepend 0x00 (0 unused bits)
  const sigBitString = tag(0x03, Buffer.concat([Buffer.from([0x00]), rawSignature]));

  // 6. Complete Certificate DER & PEM conversion
  const certDer = seq(tbs, sigAlg, sigBitString);
  const base64Body = certDer.toString('base64').match(/.{1,64}/g).join('\n');
  const certPem = `-----BEGIN CERTIFICATE-----\n${base64Body}\n-----END CERTIFICATE-----\n`;

  let fingerprint = '';
  try {
    const x509 = new crypto.X509Certificate(certPem);
    fingerprint = x509.fingerprint256 || '';
  } catch (_) {}

  return {
    cert: certPem,
    key: privateKey,
    fingerprint
  };
}

/**
 * Validates whether a given certificate PEM string is currently valid and unexpired.
 */
function isCertValid(certPem) {
  try {
    if (!certPem || typeof certPem !== 'string') return false;
    const x509 = new crypto.X509Certificate(certPem);
    const validFrom = new Date(x509.validFrom).getTime();
    const validTo = new Date(x509.validTo).getTime();
    const now = Date.now();
    // Consider valid if within valid window and at least 24 hours remain
    return now >= validFrom && now < (validTo - 24 * 60 * 60 * 1000);
  } catch (_) {
    return false;
  }
}

/**
 * Retrieves existing TLS credentials or generates and persists a new self-signed certificate.
 * 
 * Precedence:
 * 1. User-supplied custom files via options / env (AALAAPI_SSL_CERT, AALAAPI_SSL_KEY)
 * 2. Cached certificate in scratch/certs/ (or ~/.aalaapi/certs/)
 * 3. Freshly generated self-signed certificate (persisted to disk for future runs)
 * 
 * @param {Object} [options]
 * @param {string} [options.certFile] Explicit path to SSL certificate PEM
 * @param {string} [options.keyFile] Explicit path to SSL private key PEM
 * @param {string[]} [options.lanAddresses] Additional LAN IP addresses to embed in SAN
 * @param {string} [options.certsDir] Directory to cache self-signed certs
 * @returns {{ cert: string, key: string, isSelfSigned: boolean, source: string, certPath?: string, keyPath?: string, fingerprint: string }}
 */
function getOrCreateCertificate(options = {}) {
  // 1. Check custom cert paths from options or environment variables
  const customCertPath = options.certFile || process.env.AALAAPI_SSL_CERT;
  const customKeyPath = options.keyFile || process.env.AALAAPI_SSL_KEY;

  if (customCertPath && customKeyPath) {
    const resolvedCert = path.resolve(customCertPath);
    const resolvedKey = path.resolve(customKeyPath);
    if (fs.existsSync(resolvedCert) && fs.existsSync(resolvedKey)) {
      const cert = fs.readFileSync(resolvedCert, 'utf8');
      const key = fs.readFileSync(resolvedKey, 'utf8');
      let fingerprint = '';
      try {
        fingerprint = new crypto.X509Certificate(cert).fingerprint256 || '';
      } catch (_) {}
      return {
        cert,
        key,
        isSelfSigned: false,
        source: 'custom_file',
        certPath: resolvedCert,
        keyPath: resolvedKey,
        fingerprint
      };
    }
  }

  // 2. Check cached self-signed certificate in scratch/certs or ~/.aalaapi/certs
  let targetDir = options.certsDir || DEFAULT_CERTS_DIR;
  try {
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
  } catch (_) {
    targetDir = FALLBACK_USER_CERTS_DIR;
    try {
      if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
    } catch (_) {}
  }

  const cachedCertPath = path.join(targetDir, 'cert.pem');
  const cachedKeyPath = path.join(targetDir, 'key.pem');

  if (fs.existsSync(cachedCertPath) && fs.existsSync(cachedKeyPath)) {
    try {
      const cert = fs.readFileSync(cachedCertPath, 'utf8');
      const key = fs.readFileSync(cachedKeyPath, 'utf8');
      if (isCertValid(cert) && key.includes('PRIVATE KEY')) {
        let fingerprint = '';
        try {
          fingerprint = new crypto.X509Certificate(cert).fingerprint256 || '';
        } catch (_) {}
        return {
          cert,
          key,
          isSelfSigned: true,
          source: 'cached',
          certPath: cachedCertPath,
          keyPath: cachedKeyPath,
          fingerprint
        };
      }
    } catch (_) {}
  }

  // 3. Generate a fresh self-signed certificate
  const altNames = ['localhost', '127.0.0.1', '::1'];
  if (Array.isArray(options.lanAddresses)) {
    for (const ip of options.lanAddresses) {
      if (ip && typeof ip === 'string' && !altNames.includes(ip)) {
        altNames.push(ip);
      }
    }
  }

  const generated = createSelfSignedCertificate({
    commonName: 'localhost',
    organization: 'Aalaapi Sky Companion',
    altNames,
    validityDays: 365
  });

  // Persist to disk for reuse
  try {
    fs.writeFileSync(cachedCertPath, generated.cert, 'utf8');
    fs.writeFileSync(cachedKeyPath, generated.key, 'utf8');
  } catch (_) {}

  return {
    cert: generated.cert,
    key: generated.key,
    isSelfSigned: true,
    source: 'generated',
    certPath: cachedCertPath,
    keyPath: cachedKeyPath,
    fingerprint: generated.fingerprint
  };
}

module.exports = {
  createSelfSignedCertificate,
  getOrCreateCertificate,
  isCertValid,
  DEFAULT_CERTS_DIR
};
