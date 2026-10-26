/**
 * tools/companion/auth_db.test.js
 * Unit test suite for Companion Pilot Authentication, Passkeys & Google SSO.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { AuthDatabase, base64UrlEncode, base64UrlDecode } = require('./auth_db.js');

const TEST_DB_PATH = path.resolve(__dirname, '../../scratch/test_auth.db');

describe('Companion Pilot Auth & WebAuthn Database', () => {
  let authDb;

  before(() => {
    if (fs.existsSync(TEST_DB_PATH)) {
      try { fs.unlinkSync(TEST_DB_PATH); } catch (_) {}
    }
    authDb = new AuthDatabase(TEST_DB_PATH);
  });

  after(() => {
    if (authDb && authDb.db) {
      try { authDb.db.close(); } catch (_) {}
    }
    if (fs.existsSync(TEST_DB_PATH)) {
      try { fs.unlinkSync(TEST_DB_PATH); } catch (_) {}
    }
  });

  describe('Password Hashing & Verification', () => {
    it('hashes passwords with scrypt and verifies correctly', () => {
      const password = 'SuperSecretPilotPassword123!';
      const hash = authDb.hashPassword(password);
      assert.ok(hash.startsWith('scrypt$'), 'Hash should have scrypt prefix');
      assert.equal(authDb.verifyPassword(password, hash), true, 'Password should verify');
      assert.equal(authDb.verifyPassword('WrongPassword', hash), false, 'Wrong password should fail');
      assert.equal(authDb.verifyPassword('', hash), false, 'Empty password should fail');
    });
  });

  describe('Pilot User Account Management', () => {
    let createdUser;

    it('creates a new pilot profile and rejects duplicates', () => {
      createdUser = authDb.createPilotUser({
        username: 'testpilot',
        password: 'Password123!',
        displayName: 'Captain Maverick',
        email: 'pilot@example.com',
        faaCertNumber: 'FAA-107-994821',
        defaultLaancCode: 'LAANC-2026-X1',
        preferences: { theme: 'dark', unitSystem: 'imperial' }
      });

      assert.ok(createdUser.userId.startsWith('pilot_'));
      assert.equal(createdUser.username, 'testpilot');
      assert.equal(createdUser.displayName, 'Captain Maverick');
      assert.equal(createdUser.faaCertNumber, 'FAA-107-994821');
      assert.equal(createdUser.hasPassword, true);
      assert.equal(createdUser.hasGoogle, false);
      assert.equal(createdUser.preferences.unitSystem, 'imperial');

      // Duplicate username should throw
      assert.throws(() => {
        authDb.createPilotUser({
          username: 'TESTPILOT',
          password: 'AnotherPassword!'
        });
      }, /already exists/);
    });

    it('retrieves user by username, ID, and email', () => {
      const byUser = authDb.getUserByUsername('testpilot');
      assert.ok(byUser);
      assert.equal(byUser.user_id, createdUser.userId);

      const byId = authDb.getUserById(createdUser.userId);
      assert.ok(byId);
      assert.equal(byId.displayName, 'Captain Maverick');

      const byEmail = authDb.getUserByEmail('PILOT@example.com');
      assert.ok(byEmail);
      assert.equal(byEmail.user_id, createdUser.userId);
    });

    it('updates pilot profile and synced preferences', () => {
      const updated = authDb.updateProfile(createdUser.userId, {
        displayName: 'Major Maverick',
        faaCertNumber: 'FAA-107-888888',
        signatureData: 'data:image/png;base64,mockSignature'
      });

      assert.equal(updated.displayName, 'Major Maverick');
      assert.equal(updated.faaCertNumber, 'FAA-107-888888');
      assert.equal(updated.signatureData, 'data:image/png;base64,mockSignature');

      const newPrefs = authDb.updatePreferences(createdUser.userId, {
        cameraPalette: 'electric-lime'
      });
      assert.equal(newPrefs.unitSystem, 'imperial');
      assert.equal(newPrefs.cameraPalette, 'electric-lime');
    });
  });

  describe('Session Token Lifecycle', () => {
    it('creates, validates, and revokes session tokens', () => {
      const user = authDb.getUserByUsername('testpilot');
      const { token, expiresAt } = authDb.createSession(user.user_id, 'NodeTestAgent/1.0');

      assert.ok(token);
      assert.ok(expiresAt > Date.now());

      const valid = authDb.validateSession(token);
      assert.ok(valid);
      assert.equal(valid.user.userId, user.user_id);

      authDb.revokeSession(token);
      const invalidAfterRevoke = authDb.validateSession(token);
      assert.equal(invalidAfterRevoke, null);
    });
  });

  describe('WebAuthn Challenges & Passkey Storage', () => {
    it('creates and consumes one-time high-entropy WebAuthn challenges', () => {
      const challenge = authDb.createWebAuthnChallenge('pilot_123', 'localhost', 'http://localhost:8765');
      assert.ok(challenge && typeof challenge === 'string');

      const consumed = authDb.consumeWebAuthnChallenge(challenge);
      assert.ok(consumed);
      assert.equal(consumed.userId, 'pilot_123');

      // Replay must fail
      const replayed = authDb.consumeWebAuthnChallenge(challenge);
      assert.equal(replayed, null);
    });

    it('saves, lists, updates, and deletes passkey credentials', () => {
      const user = authDb.getUserByUsername('testpilot');
      const credId = 'mock_cred_id_' + Date.now();
      const mockSpki = base64UrlEncode(Buffer.from('mock_spki_public_key_data'));

      const saved = authDb.savePasskeyCredential({
        id: credId,
        userId: user.user_id,
        publicKeySpki: mockSpki,
        name: 'MacBook Touch ID',
        deviceType: 'multiDevice',
        backedUp: true
      });

      assert.ok(saved);
      assert.equal(saved.id, credId);
      assert.equal(saved.name, 'MacBook Touch ID');

      const list = authDb.listPasskeysForUser(user.user_id);
      assert.ok(list.length >= 1);
      assert.equal(list[0].id, credId);

      authDb.updatePasskeyUsage(credId, 5);
      const updatedCred = authDb.getPasskeyById(credId);
      assert.equal(updatedCred.counter, 5);

      authDb.deletePasskey(credId, user.user_id);
      assert.equal(authDb.getPasskeyById(credId), null);
    });
  });

  describe('Cryptographic Passkey Assertion Verification', () => {
    it('verifies valid ECDSA P-256 WebAuthn assertion signature', () => {
      // Generate P-256 keypair
      const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
        namedCurve: 'P-256',
        publicKeyEncoding: { type: 'spki', format: 'der' }
      });

      const credId = 'real_ec_cred_' + Date.now();
      const user = authDb.getUserByUsername('testpilot');
      const storedPasskey = authDb.savePasskeyCredential({
        id: credId,
        userId: user.user_id,
        publicKeySpki: base64UrlEncode(publicKey),
        name: 'Hardware YubiKey'
      });

      const challenge = authDb.createWebAuthnChallenge(user.user_id, 'localhost');
      const savedChallenge = authDb.challenges.get(challenge);

      // Construct authenticatorData: 32 bytes rpIdHash + 1 byte flags (UP=1, UV=0) + 4 bytes counter (0)
      const rpIdHash = crypto.createHash('sha256').update('localhost').digest();
      const flagsBuf = Buffer.from([0x01]); // User Present
      const counterBuf = Buffer.alloc(4);
      counterBuf.writeUInt32BE(1, 0);
      const authDataBuf = Buffer.concat([rpIdHash, flagsBuf, counterBuf]);

      // Construct clientDataJSON
      const clientDataObj = {
        type: 'webauthn.get',
        challenge: challenge,
        origin: 'http://localhost:8765'
      };
      const clientDataJSONBuf = Buffer.from(JSON.stringify(clientDataObj));
      const clientDataHash = crypto.createHash('sha256').update(clientDataJSONBuf).digest();

      // Sign authData || clientDataHash
      const signBase = Buffer.concat([authDataBuf, clientDataHash]);
      const signer = crypto.createSign('SHA256');
      signer.update(signBase);
      const signatureBuf = signer.sign(privateKey);

      const credential = {
        id: credId,
        response: {
          clientDataJSON: base64UrlEncode(clientDataJSONBuf),
          authenticatorData: base64UrlEncode(authDataBuf),
          signature: base64UrlEncode(signatureBuf)
        }
      };

      const verified = authDb.verifyPasskeyAssertion(credential, storedPasskey, savedChallenge);
      assert.equal(verified, true);
    });
  });

  describe('Google OIDC Token Validation', () => {
    it('validates Google JWT payload structure, RS256 signature, and claims', async () => {
      // Generate RSA keypair for testing RS256 verification
      const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048
      });
      const jwk = publicKey.export({ format: 'jwk' });
      jwk.kid = 'test_kid_123';
      jwk.alg = 'RS256';

      const nowSec = Math.floor(Date.now() / 1000);
      const payload = {
        sub: 'google_1082739182371982',
        email: 'sky.pilot@gmail.com',
        email_verified: true,
        name: 'Sky Pilot',
        picture: 'https://lh3.googleusercontent.com/photo.jpg',
        iss: 'https://accounts.google.com',
        aud: 'aalaapi-test-client-id.apps.googleusercontent.com',
        exp: nowSec + 3600
      };

      const header = { alg: 'RS256', typ: 'JWT', kid: 'test_kid_123' };
      const headerB64 = base64UrlEncode(JSON.stringify(header));
      const payloadB64 = base64UrlEncode(JSON.stringify(payload));
      const signBase = `${headerB64}.${payloadB64}`;

      const signer = crypto.createSign('RSA-SHA256');
      signer.update(signBase);
      const signatureB64 = base64UrlEncode(signer.sign(privateKey));

      const mockIdToken = `${signBase}.${signatureB64}`;

      const verified = await authDb.verifyGoogleIdToken(
        mockIdToken,
        'aalaapi-test-client-id.apps.googleusercontent.com',
        [jwk]
      );
      assert.equal(verified.sub, 'google_1082739182371982');
      assert.equal(verified.email, 'sky.pilot@gmail.com');
      assert.equal(verified.name, 'Sky Pilot');
    });

    it('rejects expired Google ID tokens and mismatched audience', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const expiredPayload = {
        sub: 'google_old',
        iss: 'https://accounts.google.com',
        aud: 'valid-client-id',
        exp: nowSec - 500
      };
      const headerB64 = base64UrlEncode(JSON.stringify({ alg: 'RS256' }));
      const token = `${headerB64}.${base64UrlEncode(JSON.stringify(expiredPayload))}.mockSig`;

      await assert.rejects(async () => {
        await authDb.verifyGoogleIdToken(token, 'valid-client-id', []);
      }, /expired/);

      const wrongAudPayload = {
        sub: 'google_good',
        iss: 'https://accounts.google.com',
        aud: 'other-client-id',
        exp: nowSec + 3600
      };
      const wrongAudToken = `${headerB64}.${base64UrlEncode(JSON.stringify(wrongAudPayload))}.mockSig`;

      await assert.rejects(async () => {
        await authDb.verifyGoogleIdToken(wrongAudToken, 'expected-client-id', []);
      }, /audience mismatch/);
    });
  });
});
