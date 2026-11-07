/**
 * Aalaapi Sky - Base Platform Adapter (Common Web & Companion Bridge Defaults)
 *
 * Defines the shared platform interface and standard browser/Companion implementations.
 * Platform-specific subclasses (WindowsDesktopAdapter, AndroidPlatformAdapter, IosPlatformAdapter)
 * extend this class and override only the capabilities that differ on their operating system.
 */

class BasePlatformAdapter {
  constructor(id = 'web') {
    this.id = id;
  }

  /**
   * Returns legacy sync platform identifier ('android' | 'ios' | 'chromeos' | 'desktop')
   */
  getSyncPlatform() {
    if (this.id === 'android') return 'android';
    if (this.id === 'ios') return 'ios';
    if (this.id === 'chromeos') return 'chromeos';
    return 'desktop';
  }

  isNativeContainer() {
    return false;
  }

  isNativeAndroid() {
    return false;
  }

  isNativeIos() {
    return false;
  }

  supportsWebUsbDirect() {
    return this.id === 'android' || this.id === 'chromeos';
  }

  getSyncTransportLabel() {
    return 'Aalaapi Companion Bridge (REST / SSE)';
  }

  /**
   * Convert a string, Blob, Uint8Array, or ArrayBuffer into a Base64 string.
   */
  async blobToBase64(blobOrData) {
    if (typeof blobOrData === 'string') {
      if (typeof btoa === 'function') {
        return btoa(unescape(encodeURIComponent(blobOrData)));
      }
      if (typeof Buffer !== 'undefined') {
        return Buffer.from(blobOrData, 'utf8').toString('base64');
      }
      return '';
    }
    if (typeof Blob !== 'undefined' && blobOrData instanceof Blob) {
      const buffer = await blobOrData.arrayBuffer();
      return this._bytesToBase64(new Uint8Array(buffer));
    }
    if (blobOrData instanceof Uint8Array || blobOrData instanceof ArrayBuffer) {
      const bytes = blobOrData instanceof ArrayBuffer ? new Uint8Array(blobOrData) : blobOrData;
      return this._bytesToBase64(bytes);
    }
    return '';
  }

  _bytesToBase64(bytes) {
    if (typeof btoa === 'function') {
      let binary = '';
      const chunk = 8192;
      for (let i = 0; i < bytes.length; i += chunk) {
        const sub = bytes.subarray(i, i + chunk);
        binary += String.fromCharCode.apply(null, sub);
      }
      return btoa(binary);
    }
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(bytes).toString('base64');
    }
    return '';
  }

  // ─── 1. File Export / Download ──────────────────────────────────────────────
  async saveFile(blobOrData, filename, mimeType = 'application/octet-stream') {
    if (typeof document === 'undefined' || !document.createElement) {
      return { success: false, method: 'none', filename };
    }
    const blob = (typeof Blob !== 'undefined' && blobOrData instanceof Blob)
      ? blobOrData
      : new Blob([blobOrData], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      if (link.parentNode) link.parentNode.removeChild(link);
      URL.revokeObjectURL(url);
    }, 150);
    return { success: true, method: 'browser-download', filename };
  }

  // ─── 2. Static Bundled Asset Loading ────────────────────────────────────────
  async readAsset(assetPath, timeoutMs = 4000) {
    if (typeof fetch === 'undefined') return null;
    try {
      const cleanPath = assetPath.startsWith('./') || assetPath.startsWith('/') ? assetPath : `./${assetPath}`;
      const options = {};
      if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
        options.signal = AbortSignal.timeout(timeoutMs);
      }
      const res = await fetch(cleanPath, options);
      if (res.ok) {
        if (typeof res.text === 'function') {
          return await res.text();
        }
        if (typeof res.json === 'function') {
          const parsed = await res.json();
          return typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
        }
      }
    } catch (_) {}
    return null;
  }

  async readAssetJson(assetPath, timeoutMs = 4000) {
    const raw = await this.readAsset(assetPath, timeoutMs);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  // ─── 3. Geolocation ─────────────────────────────────────────────────────────
  hasLocationSupport() {
    return Boolean(typeof navigator !== 'undefined' && navigator.geolocation);
  }

  requestLocation(onSuccess, onError, options = { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }) {
    if (!this.hasLocationSupport()) {
      if (typeof onError === 'function') onError('Location not supported');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (typeof onSuccess === 'function') {
          onSuccess({
            lat: position.coords.latitude,
            lon: position.coords.longitude
          });
        }
      },
      (error) => {
        if (typeof onError === 'function') {
          onError(error && error.code === 1 ? 'Location permission denied' : 'Location unavailable');
        }
      },
      options
    );
  }

  // ─── 4. Voice Advisory / Text-to-Speech ─────────────────────────────────────
  hasNativeTts() {
    return false;
  }

  hasSpeechSupport() {
    return this.hasNativeTts() || Boolean(typeof window !== 'undefined' && window.speechSynthesis);
  }

  speak(text, rate = 1.05, pitch = 1.0) {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      return false;
    }
    const UtteranceCtor = window.SpeechSynthesisUtterance || (typeof SpeechSynthesisUtterance !== 'undefined' ? SpeechSynthesisUtterance : null);
    if (!UtteranceCtor) return false;
    try {
      if (window.speechSynthesis.paused && typeof window.speechSynthesis.resume === 'function') {
        try { window.speechSynthesis.resume(); } catch (_) {}
      }

      const dispatchSpeech = () => {
        try {
          const utterance = new UtteranceCtor(text);
          utterance.rate = rate;
          utterance.pitch = pitch;
          utterance.volume = 0.9;

          if (typeof window.speechSynthesis.getVoices === 'function') {
            try {
              const voices = window.speechSynthesis.getVoices();
              if (voices && voices.length > 0) {
                const localEn = voices.filter(v => v.lang && v.lang.toLowerCase().startsWith('en') && v.localService);
                const candidatePool = localEn.length > 0 ? localEn : voices.filter(v => v.lang && v.lang.toLowerCase().startsWith('en'));
                const preferred = candidatePool.find(v => (
                  v.name.includes('David') || v.name.includes('Zira') || v.name.includes('Mark') || v.name.includes('Google') || v.default
                )) || candidatePool[0] || voices[0];
                if (preferred) utterance.voice = preferred;
              }
            } catch (_) {}
          }

          if (typeof window !== 'undefined') {
            if (!window._aalaapiActiveUtterances) window._aalaapiActiveUtterances = new Set();
            window._aalaapiActiveUtterances.add(utterance);
          }

          utterance.onend = () => {
            if (typeof window !== 'undefined' && window._aalaapiActiveUtterances) {
              window._aalaapiActiveUtterances.delete(utterance);
            }
          };
          utterance.onerror = () => {
            if (typeof window !== 'undefined' && window._aalaapiActiveUtterances) {
              window._aalaapiActiveUtterances.delete(utterance);
            }
          };

          window.speechSynthesis.speak(utterance);
        } catch (_) {}
      };

      const isBusy = Boolean(window.speechSynthesis.speaking || window.speechSynthesis.pending);
      if (isBusy && typeof window.speechSynthesis.cancel === 'function') {
        try { window.speechSynthesis.cancel(); } catch (_) {}
        setTimeout(dispatchSpeech, 40);
      } else {
        dispatchSpeech();
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  stopSpeaking() {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
        if (window._aalaapiActiveUtterances) window._aalaapiActiveUtterances.clear();
      } catch (_) {}
    }
  }

  // ─── 5. Screen Wake Lock ────────────────────────────────────────────────────
  setKeepScreenOn(_enabled) {
    // Standard browser wakeLock is managed via navigator.wakeLock Sentinel in ScreenAwakeManager / DigitalTwin
    return false;
  }

  // ─── 6. Keychain / Secret Storage & CORS-Free HTTP ──────────────────────────
  getDjiApiKey() {
    if (typeof localStorage !== 'undefined') {
      try {
        const val = localStorage.getItem('aalaapi_dji_api_key');
        if (val) return val.trim();
      } catch (_) {}
    }
    return '';
  }

  setDjiApiKey(key) {
    const cleaned = (key || '').trim();
    if (typeof localStorage !== 'undefined') {
      try {
        if (cleaned) {
          localStorage.setItem('aalaapi_dji_api_key', cleaned);
        } else {
          localStorage.removeItem('aalaapi_dji_api_key');
        }
        return true;
      } catch (_) {}
    }
    return false;
  }

  async fetchHttpJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }

  postHttpNative(_url, _bodyStr, _headersObj) {
    return null;
  }

  // ─── 7. Flight Controller Sync & Flight Logs ────────────────────────────────
  pushKmzToController(_kmzBase64, _uuid) {
    return { handled: false };
  }

  pullKmzFromController(_uuid = '') {
    return { handled: false };
  }

  getControllerSlots() {
    return { handled: false };
  }

  pullLatestLogFromController() {
    return { handled: false };
  }

  listControllerLogs(_limit = 30, _forceRefresh = false) {
    return null;
  }

  pullControllerLog(_filename, _handle = null) {
    return null;
  }

  listSavedFlights() {
    return null;
  }

  getSavedFlightTelemetry(_flightId) {
    return null;
  }

  // ─── 8. Native Airspace Sockets (ADS-B & mDNS) ──────────────────────────────
  getNativeAdsbStatus() {
    return null;
  }

  setNativeAdsbServer(_host, _port) {
    return false;
  }

  async probeAdsbHost(targetHost, apiBase = 'http://127.0.0.1:8765') {
    const res = await fetch(`${apiBase}/api/config/adsb/probe?host=${encodeURIComponent(targetHost)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }

  async discoverMdnsServers(timeoutMs = 2000, apiBase = 'http://127.0.0.1:8765') {
    const res = await fetch(`${apiBase}/api/airspace/discover?timeout=${encodeURIComponent(timeoutMs)}`);
    return await res.json();
  }
}

if (typeof window !== 'undefined') {
  window.BasePlatformAdapter = BasePlatformAdapter;
}
if (typeof global !== 'undefined') {
  global.BasePlatformAdapter = BasePlatformAdapter;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BasePlatformAdapter };
}
