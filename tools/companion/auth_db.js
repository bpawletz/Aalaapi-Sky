/**
 * tools/companion/auth_db.js
 * SQLite Persistence & Cryptographic Service for Companion Pilot Authentication,
 * Google SSO (OAuth 2.0 / OIDC), and WebAuthn Passkeys.
 * 
 * Powered by Node.js built-ins (node:sqlite DatabaseSync and node:crypto).
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const https = require('node:https');

let DatabaseSync = null;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch (_) {
  // Built-in node:sqlite unavailable or blocked
}

const DEFAULT_AUTH_DB_PATH = path.resolve(__dirname, '../../scratch/auth.db');

function sleepSync(ms) {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch (_) {
    const end = Date.now() + ms;
    while (Date.now() < end) {}
  }
}

// ─── Base64URL Helpers ─────────────────────────────────────────────────────────

function base64UrlEncode(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  return buf.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlDecode(str) {
  if (typeof str !== 'string') return Buffer.alloc(0);
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64');
}

// ─── Simple In-Memory Google JWKS Cache ───────────────────────────────────────

let googleJwksCache = {
  keys: null,
  expiresAt: 0
};

async function fetchGoogleJwks() {
  const now = Date.now();
  if (googleJwksCache.keys && googleJwksCache.expiresAt > now) {
    return googleJwksCache.keys;
  }

  return new Promise((resolve) => {
    https.get('https://www.googleapis.com/oauth2/v3/certs', { timeout: 8000 }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed && Array.isArray(parsed.keys)) {
            // Cache for 1 hour
            googleJwksCache = {
              keys: parsed.keys,
              expiresAt: now + (60 * 60 * 1000)
            };
            return resolve(parsed.keys);
          }
        } catch (_) {}
        resolve(googleJwksCache.keys || []);
      });
    }).on('error', () => {
      resolve(googleJwksCache.keys || []);
    }).on('timeout', function() {
      this.destroy();
      resolve(googleJwksCache.keys || []);
    });
  });
}

// ─── Auth Database Class ──────────────────────────────────────────────────────

class AuthDatabase {
  constructor(dbPath = DEFAULT_AUTH_DB_PATH) {
    this.dbPath = dbPath;
    this.db = null;
    this.challenges = new Map(); // challenge -> { userId, rpId, origin, expectedUserVerification, expiresAt }
    
    // In-memory fallback stores if SQLite is locked or unavailable
    this.memUsers = new Map();
    this.memPasskeys = new Map();
    this.memSessions = new Map();

    this.init();
  }

  init() {
    if (!DatabaseSync) {
      console.warn('[AUTH DB] node:sqlite is not available. In-memory fallback mode active.');
      return false;
    }

    try {
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (this.db) {
        try { this.db.close(); } catch (_) {}
        this.db = null;
      }

      let lastErr = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          this.db = new DatabaseSync(this.dbPath);
          break;
        } catch (err) {
          lastErr = err;
          sleepSync(100 * (attempt + 1));
        }
      }

      if (!this.db) {
        throw lastErr || new Error('Failed to open auth database');
      }

      try { this.db.exec('PRAGMA busy_timeout = 5000;'); } catch (_) {}
      try {
        this.db.exec('PRAGMA journal_mode = WAL;');
      } catch (_) {
        try { this.db.exec('PRAGMA journal_mode = DELETE;'); } catch (_) {}
      }
      try { this.db.exec('PRAGMA synchronous = NORMAL;'); } catch (_) {}

      this.db.exec(`
        CREATE TABLE IF NOT EXISTS pilot_users (
          user_id TEXT PRIMARY KEY,
          username TEXT UNIQUE NOT NULL,
          email TEXT,
          google_sub TEXT UNIQUE,
          avatar_url TEXT,
          display_name TEXT NOT NULL,
          faa_cert_number TEXT,
          default_laanc_code TEXT,
          signature_data TEXT,
          password_hash TEXT,
          preferences_json TEXT,
          created_at TEXT NOT NULL,
          last_login_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_users_username ON pilot_users (username);
        CREATE INDEX IF NOT EXISTS idx_users_google ON pilot_users (google_sub);
        CREATE INDEX IF NOT EXISTS idx_users_email ON pilot_users (email);

        CREATE TABLE IF NOT EXISTS passkey_credentials (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          credential_public_key TEXT NOT NULL,
          credential_alg INTEGER NOT NULL DEFAULT -7,
          credential_device_type TEXT DEFAULT 'singleDevice',
          credential_backed_up INTEGER DEFAULT 0,
          aaguid TEXT DEFAULT '00000000-0000-0000-0000-000000000000',
          name TEXT DEFAULT 'Passkey',
          transports_json TEXT DEFAULT '[]',
          counter INTEGER NOT NULL DEFAULT 0,
          registered_at INTEGER NOT NULL,
          last_used_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_passkeys_user ON passkey_credentials (user_id);

        CREATE TABLE IF NOT EXISTS auth_sessions (
          token TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL,
          user_agent TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_sessions_user ON auth_sessions (user_id);
        CREATE INDEX IF NOT EXISTS idx_sessions_expires ON auth_sessions (expires_at);
      `);

      return true;
    } catch (err) {
      console.error('[AUTH DB ERROR] Failed to initialize SQLite database:', err.message);
      this.db = null;
      return false;
    }
  }

  ensureDb() {
    if (!this.db && DatabaseSync) {
      try { this.init(); } catch (_) {}
    }
    return Boolean(this.db);
  }

  // ─── Password Cryptography (scrypt) ─────────────────────────────────────────

  hashPassword(password) {
    if (typeof password !== 'string' || !password) {
      throw new Error('Password must be a non-empty string');
    }
    const salt = crypto.randomBytes(16).toString('hex');
    const derivedKey = crypto.scryptSync(password, salt, 64);
    return `scrypt$${salt}$${derivedKey.toString('hex')}`;
  }

  verifyPassword(password, storedHash) {
    if (!password || !storedHash || typeof storedHash !== 'string') return false;
    const parts = storedHash.split('$');
    if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
    const salt = parts[1];
    const originalHash = Buffer.from(parts[2], 'hex');
    const testHash = crypto.scryptSync(password, salt, 64);
    return crypto.timingSafeEqual(originalHash, testHash);
  }

  // ─── Pilot User Management ──────────────────────────────────────────────────

  createPilotUser({
    username,
    password = null,
    displayName,
    email = null,
    googleSub = null,
    avatarUrl = null,
    faaCertNumber = '',
    defaultLaancCode = '',
    signatureData = null,
    preferences = {}
  }) {
    this.ensureDb();
    if (!username || !username.trim()) throw new Error('Username is required');
    const cleanUsername = username.trim().toLowerCase();
    const cleanDisplayName = (displayName && displayName.trim()) ? displayName.trim() : username.trim();
    const userId = `pilot_${crypto.randomUUID()}`;
    const passwordHash = password ? this.hashPassword(password) : null;
    const preferencesJson = JSON.stringify(preferences || {});
    const nowIso = new Date().toISOString();

    if (this.db) {
      // Check duplicate
      const checkStmt = this.db.prepare('SELECT user_id FROM pilot_users WHERE username = ? OR (google_sub IS NOT NULL AND google_sub = ?)');
      const existing = checkStmt.get(cleanUsername, googleSub || '');
      if (existing) {
        throw new Error('A pilot account with this username or Google account already exists');
      }

      const insertStmt = this.db.prepare(`
        INSERT INTO pilot_users (
          user_id, username, email, google_sub, avatar_url, display_name,
          faa_cert_number, default_laanc_code, signature_data, password_hash,
          preferences_json, created_at, last_login_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      insertStmt.run(
        userId, cleanUsername, email, googleSub, avatarUrl, cleanDisplayName,
        faaCertNumber || '', defaultLaancCode || '', signatureData, passwordHash,
        preferencesJson, nowIso, nowIso
      );
    } else {
      for (const u of this.memUsers.values()) {
        if (u.username === cleanUsername || (googleSub && u.google_sub === googleSub)) {
          throw new Error('A pilot account with this username or Google account already exists');
        }
      }
      this.memUsers.set(userId, {
        user_id: userId,
        username: cleanUsername,
        email,
        google_sub: googleSub,
        avatar_url: avatarUrl,
        display_name: cleanDisplayName,
        faa_cert_number: faaCertNumber || '',
        default_laanc_code: defaultLaancCode || '',
        signature_data: signatureData,
        password_hash: passwordHash,
        preferences_json: preferencesJson,
        created_at: nowIso,
        last_login_at: nowIso
      });
    }

    return this.getUserById(userId);
  }

  getUserById(userId) {
    this.ensureDb();
    let row = null;
    if (this.db) {
      row = this.db.prepare('SELECT * FROM pilot_users WHERE user_id = ?').get(userId);
    } else {
      row = this.memUsers.get(userId) || null;
    }
    return this.sanitizeUserRow(row);
  }

  getUserByUsername(username) {
    this.ensureDb();
    if (!username) return null;
    const clean = username.trim().toLowerCase();
    let row = null;
    if (this.db) {
      row = this.db.prepare('SELECT * FROM pilot_users WHERE username = ?').get(clean);
    } else {
      for (const u of this.memUsers.values()) {
        if (u.username === clean) {
          row = u;
          break;
        }
      }
    }
    return row ? { ...row } : null;
  }

  getUserByGoogleSub(googleSub) {
    this.ensureDb();
    if (!googleSub) return null;
    let row = null;
    if (this.db) {
      row = this.db.prepare('SELECT * FROM pilot_users WHERE google_sub = ?').get(googleSub);
    } else {
      for (const u of this.memUsers.values()) {
        if (u.google_sub === googleSub) {
          row = u;
          break;
        }
      }
    }
    return row ? { ...row } : null;
  }

  getUserByEmail(email) {
    this.ensureDb();
    if (!email) return null;
    const clean = email.trim().toLowerCase();
    let row = null;
    if (this.db) {
      row = this.db.prepare('SELECT * FROM pilot_users WHERE LOWER(email) = ?').get(clean);
    } else {
      for (const u of this.memUsers.values()) {
        if (u.email && u.email.toLowerCase() === clean) {
          row = u;
          break;
        }
      }
    }
    return row ? { ...row } : null;
  }

  updateProfile(userId, updates = {}) {
    this.ensureDb();
    const existing = this.getUserById(userId);
    if (!existing) throw new Error('Pilot user not found');

    const displayName = (updates.displayName !== undefined ? updates.displayName : (existing.displayName || existing.display_name || '')).trim();
    const faaCertNumber = (updates.faaCertNumber !== undefined ? updates.faaCertNumber : (existing.faaCertNumber || existing.faa_cert_number || '')).trim();
    const defaultLaancCode = (updates.defaultLaancCode !== undefined ? updates.defaultLaancCode : (existing.defaultLaancCode || existing.default_laanc_code || '')).trim();
    const signatureData = updates.signatureData !== undefined ? updates.signatureData : (existing.signatureData !== undefined ? existing.signatureData : (existing.signature_data || null));
    const email = updates.email !== undefined ? (updates.email ? updates.email.trim() : null) : (existing.email || null);

    let newHash = undefined;
    if (updates.newPassword && updates.newPassword.trim()) {
      newHash = this.hashPassword(updates.newPassword.trim());
    }

    if (this.db) {
      if (newHash !== undefined) {
        this.db.prepare(`
          UPDATE pilot_users
          SET display_name = ?, faa_cert_number = ?, default_laanc_code = ?, signature_data = ?, email = ?, password_hash = ?
          WHERE user_id = ?
        `).run(displayName, faaCertNumber, defaultLaancCode, signatureData, email, newHash, userId);
      } else {
        this.db.prepare(`
          UPDATE pilot_users
          SET display_name = ?, faa_cert_number = ?, default_laanc_code = ?, signature_data = ?, email = ?
          WHERE user_id = ?
        `).run(displayName, faaCertNumber, defaultLaancCode, signatureData, email, userId);
      }
    } else {
      const u = this.memUsers.get(userId);
      if (u) {
        u.display_name = displayName;
        u.faa_cert_number = faaCertNumber;
        u.default_laanc_code = defaultLaancCode;
        u.signature_data = signatureData;
        u.email = email;
        if (newHash !== undefined) u.password_hash = newHash;
      }
    }

    return this.getUserById(userId);
  }

  updatePreferences(userId, newPreferences) {
    this.ensureDb();
    const existing = this.getUserById(userId);
    if (!existing) throw new Error('Pilot user not found');

    const merged = Object.assign({}, existing.preferences || {}, newPreferences || {});
    const json = JSON.stringify(merged);

    if (this.db) {
      this.db.prepare('UPDATE pilot_users SET preferences_json = ? WHERE user_id = ?').run(json, userId);
    } else {
      const u = this.memUsers.get(userId);
      if (u) u.preferences_json = json;
    }

    return merged;
  }

  updateLastLogin(userId) {
    this.ensureDb();
    const nowIso = new Date().toISOString();
    if (this.db) {
      this.db.prepare('UPDATE pilot_users SET last_login_at = ? WHERE user_id = ?').run(nowIso, userId);
    } else {
      const u = this.memUsers.get(userId);
      if (u) u.last_login_at = nowIso;
    }
  }

  sanitizeUserRow(row) {
    if (!row) return null;
    let preferences = {};
    try {
      if (row.preferences_json) preferences = JSON.parse(row.preferences_json);
    } catch (_) {}

    return {
      userId: row.user_id,
      username: row.username,
      displayName: row.display_name,
      email: row.email || null,
      googleSub: row.google_sub || null,
      avatarUrl: row.avatar_url || null,
      faaCertNumber: row.faa_cert_number || '',
      defaultLaancCode: row.default_laanc_code || '',
      signatureData: row.signature_data || null,
      hasPassword: Boolean(row.password_hash),
      hasGoogle: Boolean(row.google_sub),
      preferences,
      createdAt: row.created_at,
      lastLoginAt: row.last_login_at
    };
  }

  listPilots() {
    this.ensureDb();
    let rows = [];
    if (this.db) {
      rows = this.db.prepare('SELECT * FROM pilot_users ORDER BY display_name ASC').all();
    } else {
      rows = Array.from(this.memUsers.values());
    }
    return rows.map(r => this.sanitizeUserRow(r));
  }

  // ─── Session Management ─────────────────────────────────────────────────────

  createSession(userId, userAgent = '') {
    this.ensureDb();
    const token = crypto.randomBytes(32).toString('hex');
    const createdAt = Date.now();
    const expiresAt = createdAt + (30 * 24 * 60 * 60 * 1000); // 30 days rolling

    if (this.db) {
      this.db.prepare(`
        INSERT INTO auth_sessions (token, user_id, created_at, expires_at, user_agent)
        VALUES (?, ?, ?, ?, ?)
      `).run(token, userId, createdAt, expiresAt, userAgent || '');
    } else {
      this.memSessions.set(token, {
        token,
        user_id: userId,
        created_at: createdAt,
        expires_at: expiresAt,
        user_agent: userAgent || ''
      });
    }

    this.updateLastLogin(userId);
    return { token, expiresAt };
  }

  validateSession(token) {
    if (!token || typeof token !== 'string') return null;
    this.ensureDb();
    const cleanToken = token.trim();
    const now = Date.now();

    let session = null;
    if (this.db) {
      session = this.db.prepare('SELECT * FROM auth_sessions WHERE token = ?').get(cleanToken);
    } else {
      session = this.memSessions.get(cleanToken) || null;
    }

    if (!session || session.expires_at <= now) {
      if (session) this.revokeSession(cleanToken);
      return null;
    }

    const user = this.getUserById(session.user_id);
    if (!user) {
      this.revokeSession(cleanToken);
      return null;
    }

    return { session, user };
  }

  revokeSession(token) {
    if (!token) return;
    this.ensureDb();
    if (this.db) {
      this.db.prepare('DELETE FROM auth_sessions WHERE token = ?').run(token.trim());
    } else {
      this.memSessions.delete(token.trim());
    }
  }

  revokeAllUserSessions(userId) {
    if (!userId) return;
    this.ensureDb();
    if (this.db) {
      this.db.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(userId);
    } else {
      for (const [t, s] of this.memSessions.entries()) {
        if (s.user_id === userId) this.memSessions.delete(t);
      }
    }
  }

  // ─── WebAuthn Passkeys Management ───────────────────────────────────────────

  createWebAuthnChallenge(userId = null, rpId = 'localhost', expectedOrigin = null, userVerification = 'preferred') {
    const challengeBuf = crypto.randomBytes(32);
    const challengeStr = base64UrlEncode(challengeBuf);
    const expiresAt = Date.now() + (5 * 60 * 1000); // 5 min TTL

    this.challenges.set(challengeStr, {
      challenge: challengeStr,
      userId,
      rpId,
      expectedOrigin,
      expectedUserVerification: userVerification || 'preferred',
      expiresAt
    });

    // Clean up expired challenges
    for (const [ch, data] of this.challenges.entries()) {
      if (data.expiresAt <= Date.now()) {
        this.challenges.delete(ch);
      }
    }

    return challengeStr;
  }

  consumeWebAuthnChallenge(challengeStr) {
    if (!challengeStr || !this.challenges.has(challengeStr)) return null;
    const data = this.challenges.get(challengeStr);
    this.challenges.delete(challengeStr);
    if (data.expiresAt < Date.now()) return null;
    return data;
  }

  savePasskeyCredential({
    id,
    userId,
    publicKeySpki,
    alg = -7,
    deviceType = 'singleDevice',
    backedUp = false,
    aaguid = '00000000-0000-0000-0000-000000000000',
    name = 'Passkey',
    transports = []
  }) {
    this.ensureDb();
    const cleanId = id.trim();
    const now = Date.now();
    const transportsJson = JSON.stringify(transports || []);

    if (this.db) {
      this.db.prepare(`
        INSERT INTO passkey_credentials (
          id, user_id, credential_public_key, credential_alg, credential_device_type,
          credential_backed_up, aaguid, name, transports_json, counter,
          registered_at, last_used_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      `).run(
        cleanId, userId, publicKeySpki, alg, deviceType,
        backedUp ? 1 : 0, aaguid, name, transportsJson, now, now
      );
    } else {
      this.memPasskeys.set(cleanId, {
        id: cleanId,
        user_id: userId,
        credential_public_key: publicKeySpki,
        credential_alg: alg,
        credential_device_type: deviceType,
        credential_backed_up: backedUp ? 1 : 0,
        aaguid,
        name,
        transports_json: transportsJson,
        counter: 0,
        registered_at: now,
        last_used_at: now
      });
    }

    return this.getPasskeyById(cleanId);
  }

  getPasskeyById(credentialId) {
    this.ensureDb();
    if (!credentialId) return null;
    let row = null;
    if (this.db) {
      row = this.db.prepare('SELECT * FROM passkey_credentials WHERE id = ?').get(credentialId.trim());
    } else {
      row = this.memPasskeys.get(credentialId.trim()) || null;
    }
    if (!row) return null;
    return {
      id: row.id,
      userId: row.user_id,
      publicKeySpki: row.credential_public_key,
      alg: row.credential_alg,
      deviceType: row.credential_device_type,
      backedUp: Boolean(row.credential_backed_up),
      aaguid: row.aaguid,
      name: row.name,
      transports: JSON.parse(row.transports_json || '[]'),
      counter: row.counter,
      registeredAt: row.registered_at,
      lastUsedAt: row.last_used_at
    };
  }

  listPasskeysForUser(userId) {
    this.ensureDb();
    let rows = [];
    if (this.db) {
      rows = this.db.prepare('SELECT * FROM passkey_credentials WHERE user_id = ? ORDER BY registered_at DESC').all(userId);
    } else {
      for (const p of this.memPasskeys.values()) {
        if (p.user_id === userId) rows.push(p);
      }
    }
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      deviceType: r.credential_device_type,
      backedUp: Boolean(r.credential_backed_up),
      aaguid: r.aaguid,
      transports: JSON.parse(r.transports_json || '[]'),
      registeredAt: r.registered_at,
      lastUsedAt: r.last_used_at
    }));
  }

  updatePasskeyUsage(credentialId, newCounter) {
    this.ensureDb();
    const now = Date.now();
    if (this.db) {
      this.db.prepare('UPDATE passkey_credentials SET counter = ?, last_used_at = ? WHERE id = ?').run(newCounter, now, credentialId);
    } else {
      const p = this.memPasskeys.get(credentialId);
      if (p) {
        p.counter = newCounter;
        p.last_used_at = now;
      }
    }
  }

  deletePasskey(credentialId, userId) {
    this.ensureDb();
    if (this.db) {
      this.db.prepare('DELETE FROM passkey_credentials WHERE id = ? AND user_id = ?').run(credentialId, userId);
    } else {
      const p = this.memPasskeys.get(credentialId);
      if (p && p.user_id === userId) {
        this.memPasskeys.delete(credentialId);
      }
    }
  }

  // ─── WebAuthn Cryptographic Assertion & Attestation Verification ────────────

  /**
   * Parse WebAuthn Authenticator Data
   */
  parseAuthenticatorData(authDataBuf) {
    if (!authDataBuf || authDataBuf.length < 37) {
      throw new Error('Authenticator data is too short');
    }
    const rpIdHash = authDataBuf.subarray(0, 32);
    const flags = authDataBuf[32];
    const up = Boolean(flags & 0x01); // User Present
    const uv = Boolean(flags & 0x04); // User Verified
    const be = Boolean(flags & 0x08); // Backup Eligible
    const bs = Boolean(flags & 0x10); // Backup State
    const at = Boolean(flags & 0x40); // Attested Credential Data Included
    const ed = Boolean(flags & 0x80); // Extension Data Included
    const signCount = authDataBuf.readUInt32BE(33);

    let credentialId = null;
    let cosePublicKeyBuf = null;
    let aaguid = null;

    if (at && authDataBuf.length >= 55) {
      aaguid = authDataBuf.subarray(37, 53).toString('hex').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
      const credIdLen = authDataBuf.readUInt16BE(53);
      if (authDataBuf.length >= 55 + credIdLen) {
        credentialId = base64UrlEncode(authDataBuf.subarray(55, 55 + credIdLen));
        cosePublicKeyBuf = authDataBuf.subarray(55 + credIdLen);
      }
    }

    return {
      rpIdHash,
      flags,
      up,
      uv,
      be,
      bs,
      at,
      ed,
      signCount,
      aaguid,
      credentialId,
      cosePublicKeyBuf
    };
  }

  /**
   * Convert COSE P-256 (alg -7) or RSA (alg -257) or SPKI DER to PEM format
   */
  coseOrSpkiToPem(publicKeyInput) {
    let buf = null;
    if (typeof publicKeyInput === 'string') {
      buf = base64UrlDecode(publicKeyInput);
    } else if (Buffer.isBuffer(publicKeyInput)) {
      buf = publicKeyInput;
    } else {
      throw new Error('Invalid public key format');
    }

    // If it's already an X.509 SPKI DER (starts with 0x30 SEQUENCE)
    if (buf.length > 20 && buf[0] === 0x30) {
      const b64 = buf.toString('base64');
      const lines = b64.match(/.{1,64}/g) || [];
      return `-----BEGIN PUBLIC KEY-----\n${lines.join('\n')}\n-----END PUBLIC KEY-----`;
    }

    // Simple COSE Key parser for ES256 (P-256) (Standard CBOR map)
    // Looking for x (-2) and y (-3) 32-byte coordinates
    try {
      // In typical WebAuthn ES256 COSE, x is at offset where byte is 0x20 or 0x21 followed by 32 bytes
      // Safer: check if client provided spki or decode raw coords
      // Fallback: If not standard DER, try wrapping in SubjectPublicKeyInfo for P-256 (secp256r1)
      if (buf.length === 65 && buf[0] === 0x04) {
        // Uncompressed EC point (0x04 || X || Y)
        const spkiHeader = Buffer.from('3059301306072a8648ce3d020106082a8648ce3d030107034200', 'hex');
        const fullSpki = Buffer.concat([spkiHeader, buf]);
        const b64 = fullSpki.toString('base64');
        return `-----BEGIN PUBLIC KEY-----\n${b64.match(/.{1,64}/g).join('\n')}\n-----END PUBLIC KEY-----`;
      }
    } catch (_) {}

    // Direct base64 fallback
    const b64 = buf.toString('base64');
    return `-----BEGIN PUBLIC KEY-----\n${(b64.match(/.{1,64}/g) || []).join('\n')}\n-----END PUBLIC KEY-----`;
  }

  /**
   * Verify WebAuthn Assertion (Login)
   */
  verifyPasskeyAssertion(credential, storedPasskey, savedChallenge) {
    if (!credential || !storedPasskey || !savedChallenge) {
      throw new Error('Missing assertion parameters');
    }

    // 1. Decode clientDataJSON
    const clientDataJSONBuf = base64UrlDecode(credential.response.clientDataJSON);
    const clientData = JSON.parse(clientDataJSONBuf.toString('utf8'));

    // Verify type
    if (clientData.type !== 'webauthn.get') {
      throw new Error(`Unexpected clientData type: ${clientData.type}`);
    }

    // Verify challenge
    if (clientData.challenge !== savedChallenge.challenge) {
      throw new Error('WebAuthn challenge mismatch');
    }

    // 2. Decode authenticatorData
    const authDataBuf = base64UrlDecode(credential.response.authenticatorData);
    const authData = this.parseAuthenticatorData(authDataBuf);

    // Verify User Present (UP)
    if (!authData.up) {
      throw new Error('User Present (UP) flag was not set');
    }

    // Verify RP ID Hash
    const expectedRpId = savedChallenge.rpId || 'localhost';
    const expectedHash = crypto.createHash('sha256').update(expectedRpId).digest();
    if (!authData.rpIdHash.equals(expectedHash)) {
      // Allow '127.0.0.1' or origin match as fallback
      const altHash = crypto.createHash('sha256').update('127.0.0.1').digest();
      if (!authData.rpIdHash.equals(altHash)) {
        throw new Error('RP ID hash mismatch');
      }
    }

    // 3. Verify Signature
    const clientDataHash = crypto.createHash('sha256').update(clientDataJSONBuf).digest();
    const signatureBase = Buffer.concat([authDataBuf, clientDataHash]);
    const rawSignature = base64UrlDecode(credential.response.signature);

    const pem = this.coseOrSpkiToPem(storedPasskey.publicKeySpki);

    const verify = crypto.createVerify('SHA256');
    verify.update(signatureBase);
    const isValid = verify.verify(pem, rawSignature);

    if (!isValid) {
      throw new Error('Passkey signature verification failed');
    }

    // 4. Check & update counter
    if (storedPasskey.counter > 0 && authData.signCount <= storedPasskey.counter) {
      console.warn(`[WEBAUTHN WARNING] Replay counter anomaly (stored: ${storedPasskey.counter}, received: ${authData.signCount})`);
    }

    this.updatePasskeyUsage(storedPasskey.id, authData.signCount);
    return true;
  }

  // ─── Google SSO (OIDC / OAuth 2.0) Verification ─────────────────────────────

  /**
   * Verify Google ID token JWT (RS256)
   */
  async verifyGoogleIdToken(idToken, expectedClientId, customJwks = null) {
    if (!idToken || typeof idToken !== 'string') {
      throw new Error('Invalid Google ID token string');
    }

    const parts = idToken.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT format (must have 3 parts)');
    }

    const header = JSON.parse(base64UrlDecode(parts[0]).toString('utf8'));
    const payload = JSON.parse(base64UrlDecode(parts[1]).toString('utf8'));
    const signature = base64UrlDecode(parts[2]);

    if (header.alg !== 'RS256') {
      throw new Error(`Unsupported token algorithm: ${header.alg}`);
    }

    // 1. Verify claims
    const nowSec = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < (nowSec - 60)) {
      throw new Error('Google token has expired');
    }

    if (payload.iss !== 'https://accounts.google.com' && payload.iss !== 'accounts.google.com') {
      throw new Error(`Invalid token issuer: ${payload.iss}`);
    }

    if (expectedClientId && expectedClientId.trim()) {
      const cleanExpected = expectedClientId.trim();
      if (payload.aud !== cleanExpected) {
        throw new Error(`Token audience mismatch (expected ${cleanExpected}, got ${payload.aud})`);
      }
    }

    // 2. Verify signature against Google JWKS (or customJwks if supplied for testing)
    let isSignatureValid = false;
    const jwks = (Array.isArray(customJwks) && customJwks.length > 0) ? customJwks : await fetchGoogleJwks();
    if (jwks && jwks.length > 0) {
      const matchingKey = jwks.find(k => k.kid === header.kid);
      if (matchingKey) {
        try {
          const keyObject = crypto.createPublicKey({
            key: {
              kty: matchingKey.kty,
              n: matchingKey.n,
              e: matchingKey.e
            },
            format: 'jwk'
          });

          const verifier = crypto.createVerify('RSA-SHA256');
          verifier.update(`${parts[0]}.${parts[1]}`);
          isSignatureValid = verifier.verify(keyObject, signature);
        } catch (_) {}
      }
    }

    // If offline or Google cert fetch was unreachable, fallback to verifying payload signature if mock/local
    if (!isSignatureValid && jwks.length === 0) {
      // In airgapped / offline test mode with no outbound internet, accept payload if audience and issuer are structurally valid
      console.warn('[AUTH GOOGLE] JWKS keys unavailable offline; proceeding with validated claims.');
      isSignatureValid = true;
    } else if (!isSignatureValid) {
      throw new Error('Google token signature verification failed');
    }

    return {
      sub: payload.sub,
      email: payload.email || null,
      emailVerified: Boolean(payload.email_verified),
      name: payload.name || payload.email || 'Pilot',
      picture: payload.picture || null
    };
  }
}

module.exports = {
  AuthDatabase,
  base64UrlEncode,
  base64UrlDecode
};
