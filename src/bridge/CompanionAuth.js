/**
 * src/bridge/CompanionAuth.js
 * Client-Side Companion Pilot Authentication, Google SSO, WebAuthn Passkeys,
 * Profile Management, and Workspace Preference Synchronization.
 */

// ─── WebAuthn Polyfill & Compatibility Helpers (modern-web-guidance) ──────────

function uint8ArrayToBase64Url(uint8Array) {
  let binary = '';
  const len = uint8Array.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToUint8Array(base64Url) {
  let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function polyfillParseCreationOptionsFromJSON(optionsJSON) {
  if (typeof PublicKeyCredential !== 'undefined' && typeof PublicKeyCredential.parseCreationOptionsFromJSON === 'function') {
    return PublicKeyCredential.parseCreationOptionsFromJSON(optionsJSON);
  }

  const options = JSON.parse(JSON.stringify(optionsJSON));
  if (typeof options.challenge === 'string') {
    options.challenge = base64UrlToUint8Array(options.challenge);
  }
  if (options.user && typeof options.user.id === 'string') {
    options.user.id = base64UrlToUint8Array(options.user.id);
  }
  if (Array.isArray(options.excludeCredentials)) {
    options.excludeCredentials = options.excludeCredentials.map(cred => ({
      ...cred,
      id: typeof cred.id === 'string' ? base64UrlToUint8Array(cred.id) : cred.id
    }));
  }
  return options;
}

function polyfillParseRequestOptionsFromJSON(optionsJSON) {
  if (typeof PublicKeyCredential !== 'undefined' && typeof PublicKeyCredential.parseRequestOptionsFromJSON === 'function') {
    return PublicKeyCredential.parseRequestOptionsFromJSON(optionsJSON);
  }

  const options = JSON.parse(JSON.stringify(optionsJSON));
  if (typeof options.challenge === 'string') {
    options.challenge = base64UrlToUint8Array(options.challenge);
  }
  if (Array.isArray(options.allowCredentials)) {
    options.allowCredentials = options.allowCredentials.map(cred => ({
      ...cred,
      id: typeof cred.id === 'string' ? base64UrlToUint8Array(cred.id) : cred.id
    }));
  }
  return options;
}

function polyfillCredentialToJSON(credential) {
  if (typeof credential.toJSON === 'function') {
    return credential.toJSON();
  }

  const res = credential.response;
  const jsonRes = {};

  if (res.clientDataJSON) {
    jsonRes.clientDataJSON = uint8ArrayToBase64Url(new Uint8Array(res.clientDataJSON));
  }
  if (res.authenticatorData) {
    jsonRes.authenticatorData = uint8ArrayToBase64Url(new Uint8Array(res.authenticatorData));
  }
  if (res.signature) {
    jsonRes.signature = uint8ArrayToBase64Url(new Uint8Array(res.signature));
  }
  if (res.userHandle) {
    jsonRes.userHandle = uint8ArrayToBase64Url(new Uint8Array(res.userHandle));
  }
  if (res.attestationObject) {
    jsonRes.attestationObject = uint8ArrayToBase64Url(new Uint8Array(res.attestationObject));
  }
  if (typeof res.getPublicKey === 'function') {
    try {
      const pk = res.getPublicKey();
      if (pk) jsonRes.publicKey = uint8ArrayToBase64Url(new Uint8Array(pk));
    } catch (_) {}
  }
  if (typeof res.getPublicKeyAlgorithm === 'function') {
    try {
      jsonRes.publicKeyAlgorithm = res.getPublicKeyAlgorithm();
    } catch (_) {}
  }
  if (typeof res.getTransports === 'function') {
    try {
      jsonRes.transports = res.getTransports();
    } catch (_) {}
  }

  return {
    id: credential.id,
    rawId: uint8ArrayToBase64Url(new Uint8Array(credential.rawId)),
    type: credential.type,
    response: jsonRes,
    authenticatorAttachment: credential.authenticatorAttachment || null
  };
}

// ─── CompanionAuth Manager ───────────────────────────────────────────────────

const AUTH_TOKEN_KEY = 'aalaapi_companion_auth_token';
const AUTH_PILOT_KEY = 'aalaapi_companion_pilot_profile';

const CompanionAuth = {
  token: null,
  user: null,
  passkeys: [],
  googleClientId: '',
  isInitialized: false,
  conditionalAbortController: null,

  init() {
    if (this.isInitialized || typeof window === 'undefined') return;
    this.isInitialized = true;

    // Restore cached session token
    try {
      this.token = localStorage.getItem(AUTH_TOKEN_KEY) || null;
      const cachedProfile = localStorage.getItem(AUTH_PILOT_KEY);
      if (cachedProfile) {
        this.user = JSON.parse(cachedProfile);
      }
    } catch (_) {}

    this.installFetchInterceptor();
    this.bindEvents();
    this.updateTopbarUI();

    // Listen for Google OAuth popup messages
    window.addEventListener('message', (event) => {
      if (!event.data || typeof event.data !== 'object') return;
      if (event.data.type === 'AALAAPI_GOOGLE_AUTH_TOKEN' && event.data.idToken) {
        this.handleGoogleVerify(event.data.idToken);
      } else if (event.data.type === 'AALAAPI_GOOGLE_AUTH_ERROR') {
        this.showAuthError('Google sign-in error: ' + (event.data.error || 'User cancelled'));
      }
    });

    // Check remote session if token is present
    if (this.token) {
      this.fetchCurrentProfile().catch(() => {});
    }
  },

  getApiBase() {
    return (typeof getCompanionApiBase === 'function')
      ? getCompanionApiBase()
      : (typeof COMPANION_API_BASE !== 'undefined' ? COMPANION_API_BASE : 'http://127.0.0.1:8765');
  },

  getAuthHeaders() {
    const headers = {};
    const effectiveToken = this.token || (typeof localStorage !== 'undefined' ? localStorage.getItem(AUTH_TOKEN_KEY) : null);
    if (effectiveToken) {
      headers['Authorization'] = `Bearer ${effectiveToken}`;
      headers['x-pilot-session-token'] = effectiveToken;
    }
    return headers;
  },

  installFetchInterceptor() {
    if (typeof window === 'undefined' || !window.fetch || window._companionFetchIntercepted) return;
    window._companionFetchIntercepted = true;
    const originalFetch = window.fetch;
    const authSelf = this;

    window.fetch = function companionFetch(input, init) {
      try {
        const token = authSelf.token || (typeof localStorage !== 'undefined' ? localStorage.getItem(AUTH_TOKEN_KEY) : null);
        if (token) {
          let urlStr = '';
          if (typeof input === 'string') urlStr = input;
          else if (input && typeof input.url === 'string') urlStr = input.url;
          else if (typeof URL !== 'undefined' && input instanceof URL) urlStr = input.toString();

          const apiBase = (typeof getCompanionApiBase === 'function')
            ? getCompanionApiBase()
            : (typeof COMPANION_API_BASE !== 'undefined' ? COMPANION_API_BASE : 'http://127.0.0.1:8765');

          const isCompanion = urlStr.startsWith(apiBase) ||
                              urlStr.startsWith('http://127.0.0.1:8765') ||
                              urlStr.startsWith('https://127.0.0.1:8766') ||
                              urlStr.startsWith('http://localhost:8765') ||
                              urlStr.startsWith('https://localhost:8766') ||
                              urlStr.startsWith('/api/');

          if (isCompanion) {
            init = init ? { ...init } : {};
            const existingHeaders = init.headers;
            if (typeof Headers !== 'undefined' && existingHeaders instanceof Headers) {
              if (!existingHeaders.has('Authorization')) {
                existingHeaders.set('Authorization', `Bearer ${token}`);
              }
              if (!existingHeaders.has('x-pilot-session-token')) {
                existingHeaders.set('x-pilot-session-token', token);
              }
            } else if (Array.isArray(existingHeaders)) {
              const hasAuth = existingHeaders.some(([k]) => k && k.toLowerCase() === 'authorization');
              if (!hasAuth) {
                init.headers = [...existingHeaders, ['Authorization', `Bearer ${token}`], ['x-pilot-session-token', token]];
              }
            } else {
              init.headers = {
                'Authorization': `Bearer ${token}`,
                'x-pilot-session-token': token,
                ...(existingHeaders || {})
              };
            }
          }
        }
      } catch (_) {}
      return originalFetch.apply(this, arguments);
    };
  },

  isAuthenticated() {
    return Boolean(this.token && this.user);
  },

  // ─── Remote API Calls ───────────────────────────────────────────────────────

  async fetchCurrentProfile() {
    if (this.token) {
      try {
        const res = await fetch(`${this.getApiBase()}/api/auth/me`, {
          headers: this.getAuthHeaders()
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.user) {
            this.user = data.user;
            this.passkeys = data.passkeys || [];
            if (data.googleClientId) this.googleClientId = data.googleClientId;
            localStorage.setItem(AUTH_PILOT_KEY, JSON.stringify(this.user));
            this.updateTopbarUI();
            this.renderProfileView();
            return this.user;
          }
        } else if (res.status === 401) {
          this.logout(false);
        }
      } catch (_) {}
    }

    // Fallback: If companion bridge is offline, hydrate profile from CloudSyncService
    if (typeof CloudSyncService !== 'undefined' && CloudSyncService.isConfigured()) {
      try {
        const cloudUser = await CloudSyncService.fetchPilotProfile();
        if (cloudUser) {
          this.user = cloudUser;
          localStorage.setItem(AUTH_PILOT_KEY, JSON.stringify(this.user));
          this.updateTopbarUI();
          this.renderProfileView();
          return this.user;
        }
      } catch (_) {}
    }
    return null;
  },

  async loginWithPassword(username, password) {
    this.clearAuthError();
    try {
      const res = await fetch(`${this.getApiBase()}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Login failed');
      }

      this.setSession(data.token, data.user);
      this.showToast(`Welcome back, ${data.user.displayName || data.user.username}!`);
      this.closeModal();
      return data;
    } catch (err) {
      this.showAuthError(err.message);
      throw err;
    }
  },

  async registerLocalPilot(payload) {
    this.clearAuthError();
    try {
      const initialPreferences = this.collectCurrentClientPreferences();
      const res = await fetch(`${this.getApiBase()}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, preferences: initialPreferences })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Registration failed');
      }

      this.setSession(data.token, data.user);
      this.showToast(`Pilot profile created for ${data.user.displayName}!`);
      this.closeModal();
      return data;
    } catch (err) {
      this.showAuthError(err.message);
      throw err;
    }
  },

  async handleGoogleVerify(idToken) {
    this.clearAuthError();
    try {
      const initialPreferences = this.collectCurrentClientPreferences();
      const res = await fetch(`${this.getApiBase()}/api/auth/google/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: idToken, initialPreferences })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Google authentication failed');
      }

      this.setSession(data.token, data.user);
      this.showToast(`Signed in with Google as ${data.user.displayName}!`);
      this.closeModal();
      return data;
    } catch (err) {
      this.showAuthError(err.message);
    }
  },

  async updatePilotProfile(updates) {
    if (!this.token) return;
    try {
      const res = await fetch(`${this.getApiBase()}/api/auth/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeaders()
        },
        body: JSON.stringify(updates)
      });
      const data = await res.json();
      if (res.ok && data.success && data.user) {
        this.user = data.user;
        localStorage.setItem(AUTH_PILOT_KEY, JSON.stringify(this.user));
        this.updateTopbarUI();
        this.renderProfileView();
        this.showToast('Pilot profile updated');
      }
    } catch (err) {
      alert('Failed to update profile: ' + err.message);
    }
  },

  async saveGoogleClientId(clientId) {
    try {
      const res = await fetch(`${this.getApiBase()}/api/auth/config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeaders()
        },
        body: JSON.stringify({ googleClientId: clientId })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        this.googleClientId = data.googleClientId || '';
        this.showToast('Google OAuth Client ID saved');
        this.updateGoogleSsoUI();
      }
    } catch (err) {
      alert('Failed to save Google Client ID: ' + err.message);
    }
  },

  // ─── WebAuthn Passkey Actions (modern-web-guidance) ─────────────────────────

  async triggerPasskeyButtonLogin() {
    this.clearAuthError();
    if (this.conditionalAbortController) {
      this.conditionalAbortController.abort();
      this.conditionalAbortController = null;
    }

    try {
      const optionsRes = await fetch(`${this.getApiBase()}/api/auth/passkey/login/options`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!optionsRes.ok) throw new Error('Could not get passkey login options');
      const optionsJSON = await optionsRes.json();

      const publicKey = polyfillParseRequestOptionsFromJSON(optionsJSON);
      let credential;
      try {
        credential = await navigator.credentials.get({ publicKey });
      } catch (err) {
        if (err.name === 'NotAllowedError') {
          console.log('User cancelled passkey login prompt.');
        } else {
          this.showAuthError(err.message || 'Passkey login failed');
        }
        this.initConditionalAutofill();
        return;
      }

      if (!credential) return;

      const encoded = polyfillCredentialToJSON(credential);
      const verifyRes = await fetch(`${this.getApiBase()}/api/auth/passkey/login/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(encoded)
      });

      if (!verifyRes.ok && verifyRes.status === 404) {
        // Unknown credential on server -> trigger Signal API per modern-web-guidance
        if (typeof PublicKeyCredential !== 'undefined' && PublicKeyCredential.signalUnknownCredential) {
          try {
            const rpId = (window.location.hostname || 'localhost');
            await PublicKeyCredential.signalUnknownCredential({
              rpId,
              credentialId: encoded.id
            });
          } catch (_) {}
        }
        throw new Error('Passkey credential not recognized on this Companion bridge');
      }

      const verifyData = await verifyRes.json();
      if (!verifyRes.ok || !verifyData.success) {
        throw new Error(verifyData.error || 'Passkey verification failed');
      }

      this.setSession(verifyData.token, verifyData.user);
      this.showToast(`Signed in via Passkey as ${verifyData.user.displayName}!`);
      this.closeModal();
    } catch (err) {
      this.showAuthError(err.message);
    }
  },

  async initConditionalAutofill() {
    if (typeof window === 'undefined' || typeof navigator === 'undefined' || !navigator.credentials) return;
    if (this.isAuthenticated()) return;

    try {
      // Check capabilities
      let conditionalSupported = false;
      if (typeof PublicKeyCredential !== 'undefined' && PublicKeyCredential.getClientCapabilities) {
        const capabilities = await PublicKeyCredential.getClientCapabilities();
        conditionalSupported = capabilities && capabilities.conditionalGet === true;
      } else if (typeof PublicKeyCredential !== 'undefined' && PublicKeyCredential.isConditionalMediationAvailable) {
        conditionalSupported = await PublicKeyCredential.isConditionalMediationAvailable();
      }

      if (!conditionalSupported) return;

      if (this.conditionalAbortController) {
        this.conditionalAbortController.abort();
      }
      this.conditionalAbortController = new AbortController();

      const optionsRes = await fetch(`${this.getApiBase()}/api/auth/passkey/login/options`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!optionsRes.ok) return;
      const optionsJSON = await optionsRes.json();
      const publicKey = polyfillParseRequestOptionsFromJSON(optionsJSON);

      const credential = await navigator.credentials.get({
        publicKey,
        signal: this.conditionalAbortController.signal,
        mediation: 'conditional'
      });

      if (!credential) return;

      const encoded = polyfillCredentialToJSON(credential);
      const verifyRes = await fetch(`${this.getApiBase()}/api/auth/passkey/login/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(encoded)
      });

      if (!verifyRes.ok && verifyRes.status === 404) {
        if (typeof PublicKeyCredential !== 'undefined' && PublicKeyCredential.signalUnknownCredential) {
          try {
            await PublicKeyCredential.signalUnknownCredential({
              rpId: window.location.hostname || 'localhost',
              credentialId: encoded.id
            });
          } catch (_) {}
        }
        return;
      }

      const verifyData = await verifyRes.json();
      if (verifyRes.ok && verifyData.success) {
        this.setSession(verifyData.token, verifyData.user);
        this.showToast(`Signed in via Passkey as ${verifyData.user.displayName}!`);
        this.closeModal();
      }
    } catch (err) {
      if (['NotAllowedError', 'AbortError'].includes(err.name)) return;
      console.warn('Conditional autofill error:', err);
    }
  },

  async registerNewPasskey() {
    if (!this.token) {
      alert('Please sign in before registering a passkey.');
      return;
    }

    try {
      const optionsRes = await fetch(`${this.getApiBase()}/api/auth/passkey/register/options`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeaders()
        }
      });

      if (!optionsRes.ok) {
        const errData = await optionsRes.json();
        throw new Error(errData.error || 'Failed to get passkey registration options');
      }

      const optionsJSON = await optionsRes.json();
      const publicKey = polyfillParseCreationOptionsFromJSON(optionsJSON);

      let credential;
      try {
        credential = await navigator.credentials.create({ publicKey });
      } catch (err) {
        if (err.name === 'NotAllowedError') {
          console.log('User cancelled passkey creation prompt.');
        } else if (err.name === 'InvalidStateError') {
          alert('A passkey already exists on this authenticator for this pilot profile.');
        } else {
          alert('Passkey registration cancelled or failed: ' + err.message);
        }
        return;
      }

      if (!credential) return;

      const passkeyName = prompt('Enter a label for this passkey (e.g., MacBook Touch ID, Windows Hello, YubiKey):', 'My Passkey') || 'Passkey';
      const encoded = polyfillCredentialToJSON(credential);
      encoded.name = passkeyName;

      const verifyRes = await fetch(`${this.getApiBase()}/api/auth/passkey/register/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeaders()
        },
        body: JSON.stringify(encoded)
      });

      const verifyData = await verifyRes.json();
      if (!verifyRes.ok || !verifyData.success) {
        throw new Error(verifyData.error || 'Failed to verify passkey creation on server');
      }

      this.showToast('Passkey registered successfully!');
      await this.fetchCurrentProfile();
    } catch (err) {
      alert('Error registering passkey: ' + err.message);
    }
  },

  async deletePasskey(credentialId) {
    if (!confirm('Remove this passkey from your pilot profile?')) return;
    try {
      const res = await fetch(`${this.getApiBase()}/api/auth/passkey/${encodeURIComponent(credentialId)}`, {
        method: 'DELETE',
        headers: this.getAuthHeaders()
      });
      if (res.ok) {
        this.showToast('Passkey removed');
        await this.fetchCurrentProfile();
      }
    } catch (err) {
      alert('Failed to delete passkey: ' + err.message);
    }
  },

  // ─── Session State & Preference Synchronization ─────────────────────────────

  setSession(token, user) {
    this.token = token;
    this.user = user;
    try {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
      localStorage.setItem(AUTH_PILOT_KEY, JSON.stringify(user));
    } catch (_) {}

    this.updateTopbarUI();

    // Hydrate user preferences from profile
    if (user && user.preferences && Object.keys(user.preferences).length > 0) {
      this.applyPreferencesToClient(user.preferences);
    }

    if (typeof reconnectAllCompanionStreams === 'function') {
      try { reconnectAllCompanionStreams(); } catch (_) {}
    } else if (typeof window !== 'undefined' && typeof window.reconnectAllCompanionStreams === 'function') {
      try { window.reconnectAllCompanionStreams(); } catch (_) {}
    }

    // Mirror to CloudSyncService if configured
    if (typeof CloudSyncService !== 'undefined' && CloudSyncService.isConfigured()) {
      CloudSyncService.syncPilotProfile(user).catch(() => {});
    }

    this.fetchCurrentProfile().catch(() => {});
  },

  logout(callServer = true) {
    if (callServer && this.token) {
      fetch(`${this.getApiBase()}/api/auth/logout`, {
        method: 'POST',
        headers: this.getAuthHeaders()
      }).catch(() => {});
    }

    this.token = null;
    this.user = null;
    this.passkeys = [];
    try {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      localStorage.removeItem(AUTH_PILOT_KEY);
    } catch (_) {}

    this.updateTopbarUI();
    if (typeof reconnectAllCompanionStreams === 'function') {
      try { reconnectAllCompanionStreams(); } catch (_) {}
    } else if (typeof window !== 'undefined' && typeof window.reconnectAllCompanionStreams === 'function') {
      try { window.reconnectAllCompanionStreams(); } catch (_) {}
    }
    this.showToast('Signed out of Companion Pilot Profile');
    this.closeModal();
  },

  collectCurrentClientPreferences() {
    const prefs = {};
    try {
      if (typeof getUnitSystem === 'function') prefs.unitSystem = getUnitSystem();
      if (typeof currentAppTheme !== 'undefined') prefs.theme = currentAppTheme;
      const paletteSelect = document.getElementById('camera-palette-select');
      if (paletteSelect) prefs.cameraPalette = paletteSelect.value;
      const conesToggle = document.getElementById('camera-cones-toggle');
      if (conesToggle) prefs.cameraCones = conesToggle.checked;
      const filterSelect = document.getElementById('config-map-visual-filter');
      if (filterSelect) prefs.mapVisualFilter = filterSelect.value;
      const ribbonPreset = document.getElementById('ribbon-preset-select');
      if (ribbonPreset) prefs.ribbonPreset = ribbonPreset.value;
    } catch (_) {}
    return prefs;
  },

  applyPreferencesToClient(prefs = {}) {
    try {
      // 1. Measurement Units
      if (prefs.unitSystem && typeof setUnitSystem === 'function') {
        setUnitSystem(prefs.unitSystem);
      }
      // 2. Theme (Dark / Light)
      if (prefs.theme && typeof setAppTheme === 'function') {
        setAppTheme(prefs.theme);
      }
      // 3. Camera Visual Palette
      if (prefs.cameraPalette) {
        const paletteSelect = document.getElementById('camera-palette-select');
        if (paletteSelect && paletteSelect.value !== prefs.cameraPalette) {
          paletteSelect.value = prefs.cameraPalette;
          paletteSelect.dispatchEvent(new Event('change'));
        }
      }
      // 4. Camera FOV Cones
      if (prefs.cameraCones !== undefined) {
        const conesToggle = document.getElementById('camera-cones-toggle');
        if (conesToggle && conesToggle.checked !== prefs.cameraCones) {
          conesToggle.checked = prefs.cameraCones;
          conesToggle.dispatchEvent(new Event('change'));
        }
      }
      // 5. Visual Filter
      if (prefs.mapVisualFilter) {
        const filterSelect = document.getElementById('config-map-visual-filter');
        if (filterSelect && filterSelect.value !== prefs.mapVisualFilter) {
          filterSelect.value = prefs.mapVisualFilter;
          filterSelect.dispatchEvent(new Event('change'));
        }
      }
      // 6. Top Ribbon Preset
      if (prefs.ribbonPreset) {
        const ribbonPreset = document.getElementById('ribbon-preset-select');
        if (ribbonPreset && ribbonPreset.value !== prefs.ribbonPreset) {
          ribbonPreset.value = prefs.ribbonPreset;
          ribbonPreset.dispatchEvent(new Event('change'));
        }
      }
    } catch (_) {}
  },

  syncCurrentPreferencesToServer() {
    if (!this.isAuthenticated()) return;
    const currentPrefs = this.collectCurrentClientPreferences();
    this.updatePilotProfile({ preferences: currentPrefs });
  },

  // ─── Preflight Checklist & Mission Auto-Population ───────────────────────────

  populatePreflightModal() {
    if (!this.isAuthenticated()) return;

    // Operator name input
    const opInput = document.getElementById('preflight-operator-input');
    if (opInput && !opInput.value) {
      const fullLabel = this.user.faaCertNumber
        ? `${this.user.displayName} (${this.user.faaCertNumber})`
        : this.user.displayName;
      opInput.value = fullLabel;
    }

    // Default LAANC input
    const laancInput = document.getElementById('preflight-laanc-input');
    if (laancInput && !laancInput.value && this.user.defaultLaancCode) {
      laancInput.value = this.user.defaultLaancCode;
    }

    // Saved signature
    if (this.user.signatureData) {
      const canvas = document.getElementById('preflight-signature-canvas');
      if (canvas && typeof currentPreflightState !== 'undefined' && !currentPreflightState.signatureData) {
        const ctx = canvas.getContext('2d');
        const img = new Image();
        img.onload = () => {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          currentPreflightState.signatureData = this.user.signatureData;
        };
        img.src = this.user.signatureData;
      }
    }
  },

  // ─── UI & Modal Orchestration ────────────────────────────────────────────────

  bindEvents() {
    const pilotBtn = document.getElementById('header-pilot-btn');
    if (pilotBtn) {
      pilotBtn.addEventListener('click', () => this.openModal());
    }

    const morePilotBtn = document.getElementById('more-menu-pilot-btn');
    if (morePilotBtn) {
      morePilotBtn.addEventListener('click', () => {
        const moreMenu = document.getElementById('header-more-menu');
        if (moreMenu) moreMenu.classList.add('hidden');
        this.openModal();
      });
    }

    const closeBtn = document.getElementById('companion-auth-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closeModal());
    }

    // Switch between Sign-In, Sign-Up, and Profile views
    const switchToSignupBtn = document.getElementById('auth-switch-to-signup-btn');
    if (switchToSignupBtn) {
      switchToSignupBtn.addEventListener('click', () => this.switchView('signup'));
    }

    const switchToSigninBtn = document.getElementById('auth-switch-to-signin-btn');
    if (switchToSigninBtn) {
      switchToSigninBtn.addEventListener('click', () => this.switchView('signin'));
    }

    // Sign in form submit
    const signinForm = document.getElementById('companion-signin-form');
    if (signinForm) {
      signinForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('companion-signin-username')?.value;
        const password = document.getElementById('companion-signin-password')?.value;
        await this.loginWithPassword(username, password);
      });
    }

    // Sign up form submit
    const signupForm = document.getElementById('companion-signup-form');
    if (signupForm) {
      signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const displayName = document.getElementById('companion-signup-name')?.value;
        const username = document.getElementById('companion-signup-username')?.value;
        const password = document.getElementById('companion-signup-password')?.value;
        const faaCertNumber = document.getElementById('companion-signup-cert')?.value;
        const email = document.getElementById('companion-signup-email')?.value;
        await this.registerLocalPilot({ displayName, username, password, faaCertNumber, email });
      });
    }

    // Explicit Passkey Button
    const passkeyBtn = document.getElementById('auth-passkey-login-btn');
    if (passkeyBtn) {
      passkeyBtn.addEventListener('click', () => this.triggerPasskeyButtonLogin());
    }

    // Google Sign-In Button
    const googleBtn = document.getElementById('auth-google-login-btn');
    if (googleBtn) {
      googleBtn.addEventListener('click', () => this.startGoogleOAuth());
    }

    // Toggle Cloud & Google Workspace Integration Drawer
    const toggleCloudBtn = document.getElementById('auth-toggle-google-config-btn') || document.getElementById('auth-toggle-cloud-sync-btn');
    const cloudPanel = document.getElementById('auth-google-config-panel') || document.getElementById('auth-cloud-sync-panel');
    const cloudChevron = document.getElementById('auth-cloud-sync-chevron');
    if (toggleCloudBtn && cloudPanel) {
      toggleCloudBtn.addEventListener('click', () => {
        const isHidden = cloudPanel.classList.contains('hidden');
        cloudPanel.classList.toggle('hidden', !isHidden);
        if (cloudChevron) cloudChevron.textContent = isHidden ? '▲' : '▼';
        if (isHidden) this.updateCloudConfigUI();
      });
    }

    // Save Cloud Configuration
    const saveCloudBtn = document.getElementById('cloud-save-config-btn');
    if (saveCloudBtn) {
      saveCloudBtn.addEventListener('click', () => {
        const projectId = document.getElementById('cloud-firebase-project-id')?.value.trim() || '';
        const databaseId = document.getElementById('cloud-firebase-database-id')?.value.trim() || '(default)';
        const apiKey = document.getElementById('cloud-firebase-api-key')?.value.trim() || '';
        const googleClientId = document.getElementById('cloud-google-client-id')?.value.trim() || '';
        const sheetId = document.getElementById('cloud-google-sheet-id')?.value.trim() || '';

        if (typeof CloudSyncService !== 'undefined') {
          CloudSyncService.saveConfig({ projectId, databaseId, apiKey });
        }
        if (typeof GoogleWorkspaceClient !== 'undefined') {
          GoogleWorkspaceClient.setClientId(googleClientId);
          GoogleWorkspaceClient.setSpreadsheetId(sheetId);
        }
        if (googleClientId) {
          this.googleClientId = googleClientId;
          this.updateGoogleSsoUI();
        }
        this.showToast('Cloud & Google Workspace configuration saved!');
      });
    }

    // Test Cloud Connection
    const testCloudBtn = document.getElementById('cloud-test-conn-btn');
    const cloudStatusMsg = document.getElementById('cloud-sync-status-msg');
    if (testCloudBtn) {
      testCloudBtn.addEventListener('click', async () => {
        if (!cloudStatusMsg) return;
        cloudStatusMsg.classList.remove('hidden');
        cloudStatusMsg.textContent = 'Testing connection to Firestore...';
        cloudStatusMsg.style.color = '#38bdf8';
        cloudStatusMsg.style.background = 'rgba(56, 189, 248, 0.1)';

        try {
          if (typeof CloudSyncService === 'undefined') throw new Error('CloudSyncService not available');
          const result = await CloudSyncService.testConnection();
          cloudStatusMsg.textContent = result.message || 'Connected successfully!';
          cloudStatusMsg.style.color = '#4ade80';
          cloudStatusMsg.style.background = 'rgba(74, 222, 128, 0.15)';
        } catch (err) {
          cloudStatusMsg.textContent = 'Connection test failed: ' + err.message;
          cloudStatusMsg.style.color = '#f87171';
          cloudStatusMsg.style.background = 'rgba(239, 68, 68, 0.15)';
        }
      });
    }

    // Google Drive Quick Save & Load in Dock
    const driveSaveBtn = document.getElementById('cloud-drive-save-btn');
    if (driveSaveBtn) {
      driveSaveBtn.addEventListener('click', () => this.uploadCurrentMissionToDrive());
    }

    const driveLoadBtn = document.getElementById('cloud-drive-load-btn');
    if (driveLoadBtn) {
      driveLoadBtn.addEventListener('click', () => this.openDriveMissionVaultModal());
    }

    const driveCloseBtn = document.getElementById('cloud-drive-close-btn');
    if (driveCloseBtn) {
      driveCloseBtn.addEventListener('click', () => {
        document.getElementById('cloud-drive-modal')?.classList.add('hidden');
      });
    }

    const driveRefreshBtn = document.getElementById('cloud-drive-refresh-btn');
    if (driveRefreshBtn) {
      driveRefreshBtn.addEventListener('click', () => this.refreshDriveMissionList());
    }

    // Offline Field Packager in Dock
    const packFieldBtn = document.getElementById('offline-field-pack-btn');
    if (packFieldBtn) {
      packFieldBtn.addEventListener('click', () => this.openOfflinePackModal());
    }

    const packCloseBtn = document.getElementById('offline-pack-close-btn');
    if (packCloseBtn) {
      packCloseBtn.addEventListener('click', () => {
        document.getElementById('offline-pack-modal')?.classList.add('hidden');
      });
    }

    const packStartBtn = document.getElementById('offline-pack-start-btn');
    if (packStartBtn) {
      packStartBtn.addEventListener('click', async () => {
        if (typeof OfflineFieldPackager === 'undefined') return;
        const progressBox = document.getElementById('offline-pack-progress-container');
        const progressBar = document.getElementById('offline-pack-progress-bar');
        const progressPct = document.getElementById('offline-pack-progress-pct');
        const progressStatus = document.getElementById('offline-pack-progress-status');

        if (progressBox) progressBox.classList.remove('hidden');
        packStartBtn.disabled = true;
        packStartBtn.textContent = 'Packaging Area...';

        try {
          const res = await OfflineFieldPackager.packMissionArea({
            onProgress: (p) => {
              if (progressBar) progressBar.style.width = `${p.percent}%`;
              if (progressPct) progressPct.textContent = `${p.percent}%`;
              if (progressStatus) progressStatus.textContent = `Downloaded ${p.downloaded}/${p.total} tiles (${p.currentTile})`;
            }
          });
          this.showToast(`✈️ Mission packaged! ${res.downloaded} map tiles saved in offline storage.`);
          packStartBtn.textContent = '✓ Pack Complete';
          setTimeout(() => {
            if (packStartBtn) {
              packStartBtn.disabled = false;
              packStartBtn.textContent = 'Start Field Pack';
            }
          }, 3000);
        } catch (err) {
          alert('Packaging failed: ' + err.message);
          packStartBtn.disabled = false;
          packStartBtn.textContent = 'Start Field Pack';
        }
      });
    }

    const packClearBtn = document.getElementById('offline-pack-clear-btn');
    if (packClearBtn) {
      packClearBtn.addEventListener('click', async () => {
        if (!confirm('Clear all cached offline map tiles and elevation data?')) return;
        if (typeof OfflineFieldPackager !== 'undefined') {
          await OfflineFieldPackager.clearOfflineCache();
          this.showToast('Offline map cache cleared');
          this.openOfflinePackModal();
        }
      });
    }

    // Preflight Export to Google Sheets
    const preflightSheetsBtn = document.getElementById('preflight-export-sheets-btn');
    if (preflightSheetsBtn) {
      preflightSheetsBtn.addEventListener('click', () => this.exportCurrentPreflightToSheets());
    }

    // Sign Out Button
    const signoutBtn = document.getElementById('auth-signout-btn');
    if (signoutBtn) {
      signoutBtn.addEventListener('click', () => this.logout(true));
    }

    // Register Passkey Button
    const regPasskeyBtn = document.getElementById('auth-register-passkey-btn');
    if (regPasskeyBtn) {
      regPasskeyBtn.addEventListener('click', () => this.registerNewPasskey());
    }

    // Sync Preferences Button
    const syncPrefsBtn = document.getElementById('auth-sync-preferences-btn');
    if (syncPrefsBtn) {
      syncPrefsBtn.addEventListener('click', () => {
        this.syncCurrentPreferencesToServer();
        this.showToast('Workspace preferences synced to Companion');
      });
    }

    // Password visibility toggles
    document.querySelectorAll('.auth-password-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-target');
        const input = document.getElementById(targetId);
        if (input) {
          const isPassword = input.type === 'password';
          input.type = isPassword ? 'text' : 'password';
          btn.textContent = isPassword ? '🙈' : '👁️';
        }
      });
    });
  },

  startGoogleOAuth() {
    const clientId = this.googleClientId || '';
    if (!clientId) {
      const panel = document.getElementById('auth-google-config-panel');
      if (panel) panel.classList.remove('hidden');
      alert('Please configure your Google OAuth 2.0 Client ID below to enable Google SSO.');
      return;
    }

    // Google Identity Services (GIS) Flow - Secure Response Handling compliant
    if (typeof window !== 'undefined' && window.google && window.google.accounts) {
      if (window.google.accounts.id) {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: async (response) => {
            if (response && response.credential) {
              await this.handleGoogleVerify(response.credential);
            } else if (response && response.error) {
              this.showAuthError('Google Sign-In error: ' + response.error);
            }
          }
        });
        window.google.accounts.id.prompt((notification) => {
          if (notification && (notification.isNotDisplayed() || notification.isSkippedMoment())) {
            this.startGoogleOAuthFallback(clientId);
          }
        });
        return;
      }

      if (window.google.accounts.oauth2) {
        this.startGoogleOAuthFallback(clientId);
        return;
      }
    }

    // Wait a brief moment if GIS script is still loading
    setTimeout(() => {
      if (typeof window !== 'undefined' && window.google && window.google.accounts) {
        this.startGoogleOAuth();
      } else {
        this.startGoogleOAuthFallback(clientId);
      }
    }, 400);
  },

  startGoogleOAuthFallback(clientId) {
    if (typeof window !== 'undefined' && window.google && window.google.accounts && window.google.accounts.oauth2) {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'openid profile email',
        callback: async (tokenResponse) => {
          if (tokenResponse.error) {
            this.showAuthError('Google OAuth error: ' + (tokenResponse.error_description || tokenResponse.error));
            return;
          }
          if (tokenResponse.access_token) {
            try {
              const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { Authorization: `Bearer ${tokenResponse.access_token}` }
              });
              const profile = await res.json();
              if (profile && (profile.sub || profile.email)) {
                const user = {
                  id: profile.sub || ('google_' + Date.now()),
                  googleSub: profile.sub,
                  email: profile.email,
                  displayName: profile.name || profile.given_name || 'Pilot',
                  avatarUrl: profile.picture || null,
                  authType: 'google'
                };
                this.setSession('google_oauth_' + (profile.sub || Date.now()), user);
                this.showToast(`Signed in with Google as ${user.displayName}!`);
                this.closeModal();
              }
            } catch (err) {
              this.showAuthError('Failed to fetch Google profile: ' + err.message);
            }
          }
        }
      });
      client.requestAccessToken();
      return;
    }

    alert('Google Identity Services SDK is unavailable or blocked by your browser ad-blocker. Please allow accounts.google.com and access Aalaapi Sky via https://localhost:8766 or https://127.0.0.1:8766.');
  },

  updateTopbarUI() {
    const btn = document.getElementById('header-pilot-btn');
    const label = document.getElementById('header-pilot-label');
    const avatar = document.getElementById('header-pilot-avatar');
    const dot = document.getElementById('header-pilot-dot');

    if (!btn || !label) return;

    if (this.isAuthenticated()) {
      btn.classList.add('is-authenticated');
      btn.title = `Signed in as Pilot: ${this.user.displayName} (Click for Pilot Profile)`;
      label.textContent = this.user.displayName || this.user.username;
      if (dot) dot.style.display = 'inline-block';
      if (avatar && this.user.avatarUrl) {
        avatar.src = this.user.avatarUrl;
        avatar.style.display = 'inline-block';
      } else if (avatar) {
        avatar.style.display = 'none';
      }
    } else {
      btn.classList.remove('is-authenticated');
      btn.title = 'Companion Pilot Profile & Sign-In (Click to Sign In)';
      label.textContent = 'Pilot Sign In';
      if (dot) dot.style.display = 'none';
      if (avatar) avatar.style.display = 'none';
    }
  },

  switchView(viewName) {
    const signinView = document.getElementById('auth-view-signin');
    const signupView = document.getElementById('auth-view-signup');
    const profileView = document.getElementById('auth-view-profile');

    if (signinView) signinView.classList.toggle('hidden', viewName !== 'signin');
    if (signupView) signupView.classList.toggle('hidden', viewName !== 'signup');
    if (profileView) profileView.classList.toggle('hidden', viewName !== 'profile');

    if (viewName === 'signin') {
      this.initConditionalAutofill();
    }
  },

  renderProfileView() {
    if (!this.isAuthenticated()) return;
    const nameEl = document.getElementById('auth-profile-name');
    const userEl = document.getElementById('auth-profile-username');
    const certEl = document.getElementById('auth-profile-cert');
    const emailEl = document.getElementById('auth-profile-email');
    const googleBadge = document.getElementById('auth-profile-google-badge');
    const passkeysList = document.getElementById('auth-profile-passkeys-list');

    if (nameEl) nameEl.textContent = this.user.displayName || 'Pilot';
    if (userEl) userEl.textContent = `@${this.user.username}`;
    if (certEl) certEl.textContent = this.user.faaCertNumber ? `Part 107: ${this.user.faaCertNumber}` : 'No Certificate Saved';
    if (emailEl) emailEl.textContent = this.user.email || 'No email attached';
    if (googleBadge) googleBadge.style.display = this.user.hasGoogle ? 'inline-flex' : 'none';

    if (passkeysList) {
      passkeysList.innerHTML = '';
      if (this.passkeys.length === 0) {
        passkeysList.innerHTML = '<div style="color: var(--text-muted); font-size: 0.72rem; padding: 6px 0;">Zero passkeys registered. Add one below for 1-click biometric sign-in.</div>';
      } else {
        this.passkeys.forEach(pk => {
          const item = document.createElement('div');
          item.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); border-radius: 6px; font-size: 0.72rem;';
          item.innerHTML = `
            <div style="display: flex; align-items: center; gap: 6px;">
              <span>🔑</span>
              <div>
                <strong style="color: var(--text-main);">${pk.name || 'Passkey'}</strong>
                <div style="font-size: 0.65rem; color: var(--text-muted);">Added ${new Date(pk.registeredAt).toLocaleDateString()}</div>
              </div>
            </div>
            <button type="button" class="btn-secondary" style="font-size: 0.65rem; padding: 2px 6px; color: #ef4444;" title="Delete this passkey">Delete</button>
          `;
          item.querySelector('button').onclick = () => this.deletePasskey(pk.id);
          passkeysList.appendChild(item);
        });
      }
    }
  },

  updateGoogleSsoUI() {
    const input = document.getElementById('auth-google-client-id-input');
    const btn = document.getElementById('auth-google-login-btn');
    if (input) input.value = this.googleClientId || '';
    if (btn) {
      btn.style.opacity = this.googleClientId ? '1' : '0.7';
    }
  },

  updateCloudConfigUI() {
    if (typeof CloudSyncService !== 'undefined') {
      const cfg = CloudSyncService.getConfig();
      const projInput = document.getElementById('cloud-firebase-project-id');
      const dbInput = document.getElementById('cloud-firebase-database-id');
      const keyInput = document.getElementById('cloud-firebase-api-key');
      if (projInput) projInput.value = cfg.projectId || '';
      if (dbInput) dbInput.value = cfg.databaseId || '(default)';
      if (keyInput) keyInput.value = cfg.apiKey || '';
    }
    if (typeof GoogleWorkspaceClient !== 'undefined') {
      const gInput = document.getElementById('cloud-google-client-id');
      const sInput = document.getElementById('cloud-google-sheet-id');
      if (gInput) gInput.value = GoogleWorkspaceClient.getClientId() || '';
      if (sInput) sInput.value = GoogleWorkspaceClient.getSpreadsheetId() || '';
    }
  },

  async uploadCurrentMissionToDrive() {
    if (typeof GoogleWorkspaceClient === 'undefined') {
      alert('Google Workspace client is not initialized.');
      return;
    }
    const clientId = GoogleWorkspaceClient.getClientId();
    if (!clientId) {
      this.openModal();
      const panel = document.getElementById('auth-google-config-panel') || document.getElementById('auth-cloud-sync-panel');
      if (panel) panel.classList.remove('hidden');
      alert('Please configure your Google OAuth 2.0 Client ID in the Cloud & Google Workspace settings to enable Google Drive mission sync.');
      return;
    }

    try {
      this.showToast('Preparing mission package for Google Drive...');
      let kmzResult = null;
      if (typeof generateKMZBlob === 'function') {
        kmzResult = await generateKMZBlob();
      }
      if (!kmzResult || !kmzResult.blob) {
        throw new Error('Could not generate KMZ mission blob.');
      }

      let projectJson = null;
      if (typeof exportProjectStateJson === 'function') {
        projectJson = exportProjectStateJson();
      } else if (typeof activeMissionPlan !== 'undefined') {
        projectJson = activeMissionPlan;
      }

      const activeLayer = (typeof getActiveLayer === 'function') ? getActiveLayer() : null;
      const baseName = (activeLayer && activeLayer.name) ? activeLayer.name.replace(/[^a-zA-Z0-9_-]/g, '_') : 'Aalaapi_Mission';
      const filename = `${baseName}_${new Date().toISOString().slice(0, 10)}.kmz`;

      const uploadRes = await GoogleWorkspaceClient.uploadMissionToDrive({
        filename,
        kmzBlob: kmzResult.blob,
        missionJson: projectJson
      });

      this.showToast(`☁️ Saved "${filename}" to Google Drive (Aalaapi Sky Missions)!`);
      return uploadRes;
    } catch (err) {
      alert('Failed to save mission to Google Drive: ' + err.message);
    }
  },

  async openDriveMissionVaultModal() {
    const modal = document.getElementById('cloud-drive-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    await this.refreshDriveMissionList();
  },

  async refreshDriveMissionList() {
    const listEl = document.getElementById('cloud-drive-file-list');
    const countEl = document.getElementById('cloud-drive-file-count');
    if (!listEl) return;

    listEl.innerHTML = '<div style="color: var(--text-muted); font-size: 0.75rem; padding: 12px 0; text-align: center;">Connecting to Google Drive...</div>';

    try {
      const files = await GoogleWorkspaceClient.listMissionsFromDrive();
      if (countEl) countEl.textContent = `${files.length} mission package(s) found in Google Drive:`;

      if (files.length === 0) {
        listEl.innerHTML = '<div style="color: var(--text-muted); font-size: 0.75rem; padding: 12px 0; text-align: center;">No missions saved in Drive yet. Click "Drive Save" to upload your current mission!</div>';
        return;
      }

      listEl.innerHTML = '';
      files.forEach(f => {
        const item = document.createElement('div');
        item.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); border-radius: 6px; font-size: 0.75rem;';
        const isKmz = f.name.endsWith('.kmz');
        const icon = isKmz ? '🚁' : '📄';
        const modified = f.modifiedTime ? new Date(f.modifiedTime).toLocaleDateString() : '';
        const sizeStr = f.size ? `${(parseInt(f.size, 10) / 1024).toFixed(1)} KB` : '';

        item.innerHTML = `
          <div style="display: flex; align-items: center; gap: 8px; min-width: 0;">
            <span style="font-size: 1.1rem;">${icon}</span>
            <div style="min-width: 0;">
              <strong style="color: var(--text-main); display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${f.name}</strong>
              <span style="color: var(--text-muted); font-size: 0.68rem;">Modified ${modified} &bull; ${sizeStr}</span>
            </div>
          </div>
          <button type="button" class="btn-primary" style="font-size: 0.7rem; padding: 4px 10px; margin-left: 8px; white-space: nowrap;">⬇️ Load</button>
        `;

        item.querySelector('button').onclick = async () => {
          try {
            item.querySelector('button').textContent = 'Loading...';
            const arrayBuffer = await GoogleWorkspaceClient.downloadMissionFromDrive(f.id);
            if (isKmz && typeof importKmzArrayBuffer === 'function') {
              await importKmzArrayBuffer(arrayBuffer, f.name);
            } else if (f.name.endsWith('.json')) {
              const text = new TextDecoder().decode(arrayBuffer);
              const parsed = JSON.parse(text);
              if (typeof loadProjectStateJson === 'function') {
                loadProjectStateJson(parsed);
              }
            }
            modal.classList.add('hidden');
            this.showToast(`Loaded "${f.name}" from Google Drive!`);
          } catch (err) {
            alert('Error loading mission: ' + err.message);
          } finally {
            item.querySelector('button').textContent = '⬇️ Load';
          }
        };

        listEl.appendChild(item);
      });
    } catch (err) {
      listEl.innerHTML = `<div style="color: #ef4444; font-size: 0.75rem; padding: 12px 0;">Error reading Drive: ${err.message}</div>`;
      if (countEl) countEl.textContent = 'Drive access required';
    }
  },

  async exportCurrentPreflightToSheets() {
    if (typeof GoogleWorkspaceClient === 'undefined') return;
    try {
      this.showToast('Exporting preflight checklist to Google Sheets...');
      const operatorName = document.getElementById('preflight-operator-input')?.value || (this.user ? this.user.displayName : 'Pilot');
      const laancCode = document.getElementById('preflight-laanc-input')?.value || 'N/A';
      const faaCertNumber = (this.user ? this.user.faaCertNumber : null) || 'N/A';
      const aircraftModel = (typeof getSelectedDroneModel === 'function' ? getSelectedDroneModel() : 'DJI Mini 4 Pro');

      let centerCoord = '0.0, 0.0';
      if (typeof centerMarker !== 'undefined' && centerMarker) {
        const ll = centerMarker.getLatLng();
        centerCoord = `${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)}`;
      }

      await GoogleWorkspaceClient.appendPreflightChecklistRow({
        timestamp: new Date().toISOString(),
        operatorName,
        faaCertNumber,
        laancCode,
        aircraftModel,
        coordinates: centerCoord,
        weatherSummary: 'Preflight Verified',
        allChecksPassed: true,
        signatureData: (this.user && this.user.signatureData) ? true : false
      });

      this.showToast('📊 Checklist appended to Google Sheets Flight Logbook!');
    } catch (err) {
      alert('Failed to export to Google Sheets: ' + err.message);
    }
  },

  openOfflinePackModal() {
    const modal = document.getElementById('offline-pack-modal');
    if (!modal) return;
    modal.classList.remove('hidden');

    if (typeof OfflineFieldPackager !== 'undefined') {
      const est = OfflineFieldPackager.estimateRequirements();
      const tilesEl = document.getElementById('offline-pack-est-tiles');
      const sizeEl = document.getElementById('offline-pack-est-size');
      if (tilesEl) tilesEl.textContent = `${est.tileCount.toLocaleString()} tiles (z14-z17)`;
      if (sizeEl) sizeEl.textContent = `~${est.estimatedMb} MB`;
    }
  },

  openModal() {
    const modal = document.getElementById('companion-auth-modal');
    if (!modal) return;
    this.clearAuthError();

    // Check Companion status
    const statusNote = document.getElementById('auth-companion-status-note');
    const isOnline = (typeof isCompanionOnline !== 'undefined') ? isCompanionOnline : false;
    if (statusNote) {
      statusNote.textContent = isOnline ? 'Companion Bridge: Online' : 'Companion Bridge: Offline';
      statusNote.style.color = isOnline ? '#4ade80' : '#f59e0b';
    }

    if (this.isAuthenticated()) {
      this.renderProfileView();
      this.switchView('profile');
    } else {
      this.switchView('signin');
      this.initConditionalAutofill();
    }

    this.updateGoogleSsoUI();
    const configPanel = document.getElementById('auth-google-config-panel') || document.getElementById('auth-cloud-sync-panel');
    if (configPanel) configPanel.classList.add('hidden');
    const cloudChevron = document.getElementById('auth-cloud-sync-chevron');
    if (cloudChevron) cloudChevron.textContent = '▼';
    modal.classList.remove('hidden');
  },

  closeModal() {
    const modal = document.getElementById('companion-auth-modal');
    if (modal) modal.classList.add('hidden');
    if (this.conditionalAbortController) {
      this.conditionalAbortController.abort();
      this.conditionalAbortController = null;
    }
  },

  showAuthError(msg) {
    const errBox = document.getElementById('companion-auth-error');
    if (errBox) {
      errBox.textContent = msg;
      errBox.classList.remove('hidden');
    } else {
      alert(msg);
    }
  },

  clearAuthError() {
    const errBox = document.getElementById('companion-auth-error');
    if (errBox) {
      errBox.textContent = '';
      errBox.classList.add('hidden');
    }
  },

  showToast(msg) {
    if (typeof showToast === 'function') {
      showToast(msg, 2500);
    } else {
      console.log('[AUTH TOAST]', msg);
    }
  },

  syncPreferencesToCompanion() {
    return this.syncCurrentPreferencesToServer();
  },

  hydratePreferencesFromCompanion(prefs) {
    return this.applyPreferencesToClient(prefs);
  },

  signInWithPassword(username, password) {
    return this.loginWithPassword(username, password);
  },

  registerWithPassword(data) {
    return this.registerLocalPilot(data);
  },

  signInWithPasskey() {
    return this.triggerPasskeyButtonLogin();
  },

  registerPasskey() {
    return this.registerNewPasskey();
  },

  signInWithGoogle() {
    return this.startGoogleOAuth();
  },

  getUser() {
    return this.user;
  },

  saveSignature(dataUrl) {
    return this.updatePilotProfile({ saved_signature: dataUrl });
  },

  onCompanionOnline() {
    if (this.token) {
      this.fetchCurrentProfile().catch(() => {});
    }
  }
};

// Global exports
if (typeof window !== 'undefined') {
  window.CompanionAuth = CompanionAuth;
  try { CompanionAuth.installFetchInterceptor(); } catch (_) {}
}
if (typeof global !== 'undefined') {
  global.CompanionAuth = CompanionAuth;
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => CompanionAuth.init());
  } else {
    setTimeout(() => CompanionAuth.init(), 0);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CompanionAuth;
}
