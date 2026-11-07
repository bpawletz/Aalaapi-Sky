/**
 * Aalaapi Sky - Android Platform Adapter
 *
 * Extends BasePlatformAdapter for Android tablets, phones, and DJI controllers.
 * Routes capabilities to `window.AalaapiAndroid` when running inside the Native Kotlin WebView
 * container, and automatically falls back to `super` (WebUSB / standard Web APIs) when running
 * inside mobile Chrome / PWA or if a native bridge method is unavailable.
 */

class AndroidPlatformAdapter extends BasePlatformAdapter {
  constructor() {
    super('android');
  }

  _bridge() {
    if (typeof window !== 'undefined' && window.AalaapiAndroid) {
      return window.AalaapiAndroid;
    }
    return null;
  }

  getSyncPlatform() {
    return 'android';
  }

  isNativeContainer() {
    return Boolean(this._bridge());
  }

  isNativeAndroid() {
    return Boolean(this._bridge());
  }

  supportsWebUsbDirect() {
    return true;
  }

  getSyncTransportLabel() {
    return this.isNativeContainer()
      ? 'Android Native Hardware Bridge (USB-C MTP / BLE / TCP)'
      : 'Android WebUSB Direct Link';
  }

  // ─── 1. File Export / Download ──────────────────────────────────────────────
  async saveFile(blobOrData, filename, mimeType = 'application/octet-stream') {
    const bridge = this._bridge();
    if (bridge && typeof bridge.saveFile === 'function') {
      try {
        const base64 = await this.blobToBase64(blobOrData);
        const rawRes = bridge.saveFile(base64, filename, mimeType);
        try {
          const parsed = JSON.parse(rawRes);
          if (parsed.success && typeof showToast === 'function') {
            showToast(`💾 Saved to Downloads: ${filename}`, 'success');
          }
        } catch (_) {
          if (typeof showToast === 'function') {
            showToast(`💾 Saved to Downloads: ${filename}`, 'success');
          }
        }
        return { success: true, method: 'android-native', filename };
      } catch (err) {
        console.warn('[AndroidPlatformAdapter] Native saveFile failed, falling back to browser download:', err);
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
        const rawText = bridge.readAsset(clean);
        if (rawText) return rawText;
      } catch (_) {}
    }
    return super.readAsset(assetPath, timeoutMs);
  }

  // ─── 3. Geolocation ─────────────────────────────────────────────────────────
  hasLocationSupport() {
    const bridge = this._bridge();
    if (bridge && typeof bridge.getNativeLocation === 'function') {
      return true;
    }
    return super.hasLocationSupport();
  }

  requestLocation(onSuccess, onError, options) {
    const bridge = this._bridge();
    if (bridge && typeof bridge.getNativeLocation === 'function') {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          if (typeof onError === 'function') onError('Location request timed out');
        }
      }, 20000);

      if (typeof window !== 'undefined') {
        window.onNativeLocation = (lat, lon) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (typeof onSuccess === 'function') onSuccess({ lat: Number(lat), lon: Number(lon) });
        };
        window.onNativeLocationError = (message) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (typeof onError === 'function') onError(message || 'Location unavailable');
        };
      }

      bridge.getNativeLocation();
      return;
    }
    return super.requestLocation(onSuccess, onError, options);
  }

  // ─── 4. Voice Advisory / Text-to-Speech ─────────────────────────────────────
  hasNativeTts() {
    const bridge = this._bridge();
    return Boolean(bridge && typeof bridge.speak === 'function');
  }

  speak(text, rate = 1.05, pitch = 1.0) {
    const bridge = this._bridge();
    if (bridge && typeof bridge.speak === 'function') {
      try {
        bridge.speak(text, rate, pitch);
        return true;
      } catch (_) {}
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
    return super.setKeepScreenOn(enabled);
  }

  // ─── 6. Keychain / Secret Storage & CORS-Free HTTP ──────────────────────────
  getDjiApiKey() {
    const bridge = this._bridge();
    if (bridge && typeof bridge.getDjiApiKey === 'function') {
      try {
        const nativeKey = bridge.getDjiApiKey();
        if (nativeKey && nativeKey.trim()) {
          return nativeKey.trim();
        }
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
    const localSaved = super.setDjiApiKey(cleaned);
    return nativeSaved || localSaved;
  }

  async fetchHttpJson(url) {
    const bridge = this._bridge();
    if (bridge && typeof bridge.fetchHttp === 'function') {
      const raw = bridge.fetchHttp(url);
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

  // ─── 7. Flight Controller Sync & Flight Logs ────────────────────────────────
  pushKmzToController(kmzBase64, uuid) {
    const bridge = this._bridge();
    if (bridge && typeof bridge.pushKmzToRc2 === 'function') {
      const ok = bridge.pushKmzToRc2(kmzBase64, uuid);
      return { handled: true, success: Boolean(ok), slotUuid: uuid };
    }
    return super.pushKmzToController(kmzBase64, uuid);
  }

  pullKmzFromController(uuid = '') {
    const bridge = this._bridge();
    if (bridge && typeof bridge.pullKmzFromRc2 === 'function') {
      const rawRes = bridge.pullKmzFromRc2(uuid);
      return { handled: true, rawRes };
    }
    return super.pullKmzFromController(uuid);
  }

  getControllerSlots() {
    const bridge = this._bridge();
    if (bridge && typeof bridge.getRc2WaypointSlots === 'function') {
      const rawRes = bridge.getRc2WaypointSlots();
      return { handled: true, rawRes };
    }
    return super.getControllerSlots();
  }

  pullLatestLogFromController() {
    const bridge = this._bridge();
    if (bridge && typeof bridge.pullLatestLogFromRc2 === 'function') {
      const rawRes = bridge.pullLatestLogFromRc2();
      return { handled: true, rawRes };
    }
    return super.pullLatestLogFromController();
  }

  listControllerLogs(limit = 30, forceRefresh = false) {
    const bridge = this._bridge();
    if (bridge && (typeof bridge.listFlightRecordsFromRc2WithRefresh === 'function' || typeof bridge.listFlightRecordsFromRc2 === 'function')) {
      try {
        const raw = (forceRefresh && typeof bridge.listFlightRecordsFromRc2WithRefresh === 'function')
          ? bridge.listFlightRecordsFromRc2WithRefresh(limit, true)
          : bridge.listFlightRecordsFromRc2(limit);
        const parsed = JSON.parse(raw || '[]');
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {
        console.warn('[AndroidPlatformAdapter] MTP list error:', e);
      }
    }
    return super.listControllerLogs(limit, forceRefresh);
  }

  pullControllerLog(filename, handle = null) {
    const bridge = this._bridge();
    if (bridge && (typeof bridge.pullLogByHandleFromRc2 === 'function' || typeof bridge.pullLogByNameFromRc2 === 'function')) {
      let raw = null;
      if (handle && !isNaN(handle) && typeof bridge.pullLogByHandleFromRc2 === 'function') {
        raw = bridge.pullLogByHandleFromRc2(handle);
      } else if (typeof bridge.pullLogByNameFromRc2 === 'function') {
        raw = bridge.pullLogByNameFromRc2(filename);
      }
      return JSON.parse(raw || '{}');
    }
    return super.pullControllerLog(filename, handle);
  }

  listSavedFlights() {
    const bridge = this._bridge();
    if (bridge && typeof bridge.listSavedFlights === 'function') {
      try {
        const raw = bridge.listSavedFlights();
        if (raw) {
          const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
          if (parsed && parsed.success && Array.isArray(parsed.flights)) {
            return parsed.flights;
          }
        }
      } catch (_) {}
    }
    return super.listSavedFlights();
  }

  getSavedFlightTelemetry(flightId) {
    const bridge = this._bridge();
    if (bridge && typeof bridge.getSavedFlightTelemetry === 'function') {
      try {
        const raw = bridge.getSavedFlightTelemetry(flightId);
        if (raw) {
          const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
          if (parsed && parsed.success && parsed.data) {
            return parsed.data;
          }
        }
      } catch (_) {}
    }
    return super.getSavedFlightTelemetry(flightId);
  }

  // ─── 8. Native Airspace Sockets (ADS-B & mDNS) ──────────────────────────────
  getNativeAdsbStatus() {
    const bridge = this._bridge();
    if (bridge && typeof bridge.getAdsbStatus === 'function') {
      try {
        const raw = bridge.getAdsbStatus();
        if (raw) return typeof raw === 'string' ? JSON.parse(raw) : raw;
      } catch (_) {}
    }
    return super.getNativeAdsbStatus();
  }

  setNativeAdsbServer(host, port) {
    const bridge = this._bridge();
    if (bridge && typeof bridge.setAdsbServer === 'function') {
      bridge.setAdsbServer(host, port);
      return true;
    }
    return super.setNativeAdsbServer(host, port);
  }

  async probeAdsbHost(targetHost, apiBase = 'http://127.0.0.1:8765') {
    const bridge = this._bridge();
    if (bridge && typeof bridge.probeAdsbHost === 'function') {
      const raw = bridge.probeAdsbHost(targetHost);
      return typeof raw === 'string' ? JSON.parse(raw) : raw;
    }
    return super.probeAdsbHost(targetHost, apiBase);
  }

  async discoverMdnsServers(timeoutMs = 2000, apiBase = 'http://127.0.0.1:8765') {
    const bridge = this._bridge();
    if (bridge && typeof bridge.discoverMdnsServers === 'function') {
      const raw = bridge.discoverMdnsServers(timeoutMs);
      return typeof raw === 'string' ? JSON.parse(raw) : raw;
    }
    return super.discoverMdnsServers(timeoutMs, apiBase);
  }
}

if (typeof window !== 'undefined') {
  window.AndroidPlatformAdapter = AndroidPlatformAdapter;
}
if (typeof global !== 'undefined') {
  global.AndroidPlatformAdapter = AndroidPlatformAdapter;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AndroidPlatformAdapter };
}
