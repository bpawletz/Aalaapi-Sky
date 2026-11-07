/**
 * Aalaapi Sky - iOS & iPadOS Platform Adapter
 *
 * Extends BasePlatformAdapter for iPhone and iPad devices:
 * 1. Supports native Swift/WKWebView container (`window.AalaapiIOS` or `window.webkit.messageHandlers.AalaapiIOS`)
 * 2. Supports iOS Safari / Home Screen PWA overrides (such as Web Share API `navigator.share({ files })`
 *    for 1-tap KMZ export to Files / AirDrop / DJI Fly)
 * 3. Falls back cleanly to `super` (standard Web & Companion Bridge APIs) for all other methods.
 */

class IosPlatformAdapter extends BasePlatformAdapter {
  constructor() {
    super('ios');
  }

  _bridge() {
    if (typeof window !== 'undefined') {
      if (window.AalaapiIOS) return window.AalaapiIOS;
    }
    return null;
  }

  _webkitHandler() {
    if (typeof window !== 'undefined' && window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.AalaapiIOS) {
      return window.webkit.messageHandlers.AalaapiIOS;
    }
    return null;
  }

  _postWebkitMessage(action, payload = {}) {
    const handler = this._webkitHandler();
    if (handler && typeof handler.postMessage === 'function') {
      try {
        handler.postMessage({ action, ...payload });
        return true;
      } catch (_) {}
    }
    return false;
  }

  getSyncPlatform() {
    return 'ios';
  }

  isNativeContainer() {
    return Boolean(this._bridge() || this._webkitHandler());
  }

  isNativeIos() {
    return this.isNativeContainer();
  }

  supportsWebUsbDirect() {
    // iOS/iPadOS Safari and WKWebView do not expose WebUSB (navigator.usb)
    return false;
  }

  getSyncTransportLabel() {
    return this.isNativeContainer()
      ? 'iOS Native Hardware Bridge (WKWebView)'
      : 'iOS Companion / AirDrop Share Link';
  }

  // ─── 1. File Export / Download (Native Bridge -> iOS Web Share Sheet -> Anchor Fallback) ───
  async saveFile(blobOrData, filename, mimeType = 'application/octet-stream') {
    const bridge = this._bridge();
    if (bridge && typeof bridge.saveFile === 'function') {
      try {
        const base64 = await this.blobToBase64(blobOrData);
        const rawRes = await bridge.saveFile(base64, filename, mimeType);
        if (typeof showToast === 'function') {
          showToast(`💾 Saved to iOS Files: ${filename}`, 'success');
        }
        return { success: true, method: 'ios-native', filename, rawRes };
      } catch (err) {
        console.warn('[IosPlatformAdapter] Native saveFile failed:', err);
      }
    }

    if (this._webkitHandler()) {
      const base64 = await this.blobToBase64(blobOrData);
      if (this._postWebkitMessage('saveFile', { base64, filename, mimeType })) {
        if (typeof showToast === 'function') {
          showToast(`💾 Exporting to iOS Share Sheet: ${filename}`, 'success');
        }
        return { success: true, method: 'ios-webkit', filename };
      }
    }

    // iOS Safari / PWA Web Share API Level 2 (Files) for native iPad/iPhone Share Sheet
    if (typeof navigator !== 'undefined' && typeof navigator.canShare === 'function' && typeof navigator.share === 'function' && typeof File !== 'undefined') {
      try {
        const blob = (typeof Blob !== 'undefined' && blobOrData instanceof Blob)
          ? blobOrData
          : new Blob([blobOrData], { type: mimeType });
        const fileObj = new File([blob], filename, { type: mimeType });
        if (navigator.canShare({ files: [fileObj] })) {
          await navigator.share({
            files: [fileObj],
            title: filename
          });
          return { success: true, method: 'ios-web-share', filename };
        }
      } catch (shareErr) {
        // User cancelled share sheet or not triggered by user gesture; fall back to anchor download
        if (shareErr && shareErr.name === 'AbortError') {
          return { success: false, cancelled: true, method: 'ios-web-share', filename };
        }
      }
    }

    return super.saveFile(blobOrData, filename, mimeType);
  }

  // ─── 2. Static Bundled Asset Loading ────────────────────────────────────────
  async readAsset(assetPath, timeoutMs = 4000) {
    const bridge = this._bridge();
    if (bridge && typeof bridge.readAsset === 'function') {
      try {
        const clean = assetPath.replace(/^\.?\//, '');
        const rawText = await bridge.readAsset(clean);
        if (rawText) return rawText;
      } catch (_) {}
    }
    return super.readAsset(assetPath, timeoutMs);
  }

  // ─── 3. Geolocation ─────────────────────────────────────────────────────────
  hasLocationSupport() {
    if (this.isNativeContainer()) return true;
    return super.hasLocationSupport();
  }

  requestLocation(onSuccess, onError, options) {
    const bridge = this._bridge();
    if (bridge && typeof bridge.getNativeLocation === 'function') {
      if (typeof window !== 'undefined') {
        window.onNativeLocation = (lat, lon) => {
          if (typeof onSuccess === 'function') onSuccess({ lat: Number(lat), lon: Number(lon) });
        };
        window.onNativeLocationError = (message) => {
          if (typeof onError === 'function') onError(message || 'Location unavailable');
        };
      }
      bridge.getNativeLocation();
      return;
    }
    if (this._webkitHandler()) {
      if (typeof window !== 'undefined') {
        window.onNativeLocation = (lat, lon) => {
          if (typeof onSuccess === 'function') onSuccess({ lat: Number(lat), lon: Number(lon) });
        };
        window.onNativeLocationError = (message) => {
          if (typeof onError === 'function') onError(message || 'Location unavailable');
        };
      }
      if (this._postWebkitMessage('getNativeLocation')) return;
    }
    return super.requestLocation(onSuccess, onError, options);
  }

  // ─── 4. Voice Advisory / Text-to-Speech ─────────────────────────────────────
  hasNativeTts() {
    const bridge = this._bridge();
    return Boolean((bridge && typeof bridge.speak === 'function') || this._webkitHandler());
  }

  speak(text, rate = 1.05, pitch = 1.0) {
    const bridge = this._bridge();
    if (bridge && typeof bridge.speak === 'function') {
      try {
        bridge.speak(text, rate, pitch);
        return true;
      } catch (_) {}
    }
    if (this._postWebkitMessage('speak', { text, rate, pitch })) {
      return true;
    }
    return super.speak(text, rate, pitch);
  }

  stopSpeaking() {
    const bridge = this._bridge();
    if (bridge && typeof bridge.stopSpeaking === 'function') {
      try {
        bridge.stopSpeaking();
        return;
      } catch (_) {}
    }
    if (this._postWebkitMessage('stopSpeaking')) return;
    super.stopSpeaking();
  }

  // ─── 5. Screen Wake Lock ────────────────────────────────────────────────────
  setKeepScreenOn(enabled) {
    const bridge = this._bridge();
    if (bridge && typeof bridge.setKeepScreenOn === 'function') {
      try {
        bridge.setKeepScreenOn(Boolean(enabled));
        return true;
      } catch (_) {}
    }
    if (this._postWebkitMessage('setKeepScreenOn', { enabled: Boolean(enabled) })) {
      return true;
    }
    return super.setKeepScreenOn(enabled);
  }

  // ─── 6. Keychain / Secret Storage & CORS-Free HTTP ──────────────────────────
  getDjiApiKey() {
    const bridge = this._bridge();
    if (bridge && typeof bridge.getDjiApiKey === 'function') {
      try {
        const key = bridge.getDjiApiKey();
        if (key && key.trim()) return key.trim();
      } catch (_) {}
    }
    return super.getDjiApiKey();
  }

  setDjiApiKey(key) {
    const cleaned = (key || '').trim();
    const bridge = this._bridge();
    let nativeSaved = false;
    if (bridge && typeof bridge.setDjiApiKey === 'function') {
      try {
        bridge.setDjiApiKey(cleaned);
        nativeSaved = true;
      } catch (_) {}
    }
    if (this._postWebkitMessage('setDjiApiKey', { key: cleaned })) {
      nativeSaved = true;
    }
    const localSaved = super.setDjiApiKey(cleaned);
    return nativeSaved || localSaved;
  }

  async fetchHttpJson(url) {
    const bridge = this._bridge();
    if (bridge && typeof bridge.fetchHttp === 'function') {
      const raw = await bridge.fetchHttp(url);
      const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (data && data.error) throw new Error(data.error);
      return data;
    }
    return super.fetchHttpJson(url);
  }

  postHttpNative(url, bodyStr, headersObj) {
    const bridge = this._bridge();
    if (bridge && typeof bridge.postHttp === 'function') {
      const headersJson = typeof headersObj === 'string' ? headersObj : JSON.stringify(headersObj || {});
      const rawRes = bridge.postHttp(url, bodyStr, headersJson);
      return typeof rawRes === 'string' ? JSON.parse(rawRes) : rawRes;
    }
    return null;
  }
}

if (typeof window !== 'undefined') {
  window.IosPlatformAdapter = IosPlatformAdapter;
}
if (typeof global !== 'undefined') {
  global.IosPlatformAdapter = IosPlatformAdapter;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { IosPlatformAdapter };
}
