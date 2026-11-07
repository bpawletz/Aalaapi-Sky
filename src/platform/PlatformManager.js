/**
 * Aalaapi Sky - Unified Platform Manager & Runtime Dispatch Facade
 *
 * Automatically resolves the active OS adapter (`AndroidPlatformAdapter`, `IosPlatformAdapter`,
 * `WindowsDesktopAdapter`, or `BasePlatformAdapter`) while supporting:
 * 1. Dynamic runtime overrides (`Platform.usePlatform('ios')` or `Platform.setAdapter(mockAdapter)`)
 * 2. URL query parameter test overrides (`?platform=android|ios|windows|web`)
 * 3. Live native container injection detection (`window.AalaapiAndroid` / `window.AalaapiIOS` / `webkit`)
 */

const PlatformManager = {
  _customAdapter: null,
  _forcedPlatformId: null,
  _instances: null,

  _ensureInstances() {
    if (!this._instances) {
      this._instances = {
        web: new BasePlatformAdapter('web'),
        chromeos: new BasePlatformAdapter('chromeos'),
        windows: new WindowsDesktopAdapter('windows'),
        desktop: new WindowsDesktopAdapter('desktop'),
        android: new AndroidPlatformAdapter(),
        ios: new IosPlatformAdapter()
      };
    }
    return this._instances;
  },

  /**
   * Detect the active platform identifier ('android' | 'ios' | 'chromeos' | 'windows' | 'desktop' | 'web')
   */
  detectPlatformId() {
    if (this._forcedPlatformId) {
      return this._forcedPlatformId;
    }

    // 1. Check URL query parameter override (?platform=android|ios|windows|web) for streamlined testing
    if (typeof window !== 'undefined' && window.location && window.location.search) {
      try {
        const params = new URLSearchParams(window.location.search);
        const queryPlat = (params.get('platform') || '').trim().toLowerCase();
        if (['android', 'ios', 'windows', 'desktop', 'chromeos', 'web'].includes(queryPlat)) {
          return queryPlat;
        }
      } catch (_) {}
    }

    // 2. Check active Native Bridge containers injected into global window
    if (typeof window !== 'undefined') {
      if (window.AalaapiAndroid) return 'android';
      if (window.AalaapiIOS || (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.AalaapiIOS)) {
        return 'ios';
      }
    }

    if (typeof navigator === 'undefined') {
      return 'desktop';
    }

    // 3. Check User-Agent Client Hints (navigator.userAgentData.platform)
    if (navigator.userAgentData && typeof navigator.userAgentData.platform === 'string') {
      const p = navigator.userAgentData.platform.toLowerCase();
      if (p.includes('android')) return 'android';
      if (p.includes('ios') || p.includes('iphone') || p.includes('ipad')) return 'ios';
      if (p.includes('chrome os') || p.includes('cros')) return 'chromeos';
      if (p.includes('win')) return 'windows';
      if (p.includes('mac') || p.includes('linux')) return 'desktop';
    }

    // 4. Fallback to navigator.userAgent / navigator.platform
    const ua = (navigator.userAgent || '').toLowerCase();
    const navPlatform = (navigator.platform || '').toLowerCase();

    if (ua.includes('android') || navPlatform.includes('android')) {
      return 'android';
    }
    if (
      ua.includes('iphone') ||
      ua.includes('ipad') ||
      ua.includes('ipod') ||
      navPlatform.includes('iphone') ||
      navPlatform.includes('ipad') ||
      (navPlatform === 'macintel' && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1)
    ) {
      return 'ios';
    }
    if (ua.includes('cros') || navPlatform.includes('cros')) {
      return 'chromeos';
    }
    if (ua.includes('win') || navPlatform.includes('win')) {
      return 'windows';
    }

    return 'desktop';
  },

  /**
   * Return the active PlatformAdapter instance.
   */
  getAdapter() {
    if (this._customAdapter) {
      return this._customAdapter;
    }
    const instances = this._ensureInstances();
    const pid = this.detectPlatformId();
    return instances[pid] || instances.desktop;
  },

  /**
   * Force a specific built-in platform ('android' | 'ios' | 'windows' | 'desktop' | 'chromeos' | 'web')
   * Pass null to restore automatic detection.
   */
  usePlatform(platformId = null) {
    this._customAdapter = null;
    this._forcedPlatformId = platformId ? String(platformId).toLowerCase() : null;
    return this.getAdapter();
  },

  /**
   * Inject a custom or mock adapter instance (e.g. for unit testing).
   * Pass null to restore automatic detection.
   */
  setAdapter(customAdapter = null) {
    this._customAdapter = customAdapter;
    return this.getAdapter();
  },

  reset() {
    this._customAdapter = null;
    this._forcedPlatformId = null;
  }
};

/**
 * Global `Platform` Facade delegating every capability call to the active OS adapter.
 */
const Platform = {
  get id() {
    return PlatformManager.getAdapter().id;
  },
  getAdapter() {
    return PlatformManager.getAdapter();
  },
  detectPlatformId() {
    return PlatformManager.detectPlatformId();
  },
  usePlatform(platformId) {
    return PlatformManager.usePlatform(platformId);
  },
  setAdapter(adapter) {
    return PlatformManager.setAdapter(adapter);
  },
  reset() {
    return PlatformManager.reset();
  },
  getSyncPlatform() {
    return PlatformManager.getAdapter().getSyncPlatform();
  },
  isNativeContainer() {
    return PlatformManager.getAdapter().isNativeContainer();
  },
  isNativeAndroid() {
    return PlatformManager.getAdapter().isNativeAndroid();
  },
  isNativeIos() {
    return PlatformManager.getAdapter().isNativeIos();
  },
  supportsWebUsbDirect() {
    return PlatformManager.getAdapter().supportsWebUsbDirect();
  },
  getSyncTransportLabel() {
    return PlatformManager.getAdapter().getSyncTransportLabel();
  },
  blobToBase64(blobOrData) {
    return PlatformManager.getAdapter().blobToBase64(blobOrData);
  },
  saveFile(blobOrData, filename, mimeType) {
    return PlatformManager.getAdapter().saveFile(blobOrData, filename, mimeType);
  },
  readAsset(assetPath, timeoutMs) {
    return PlatformManager.getAdapter().readAsset(assetPath, timeoutMs);
  },
  readAssetJson(assetPath, timeoutMs) {
    return PlatformManager.getAdapter().readAssetJson(assetPath, timeoutMs);
  },
  hasLocationSupport() {
    return PlatformManager.getAdapter().hasLocationSupport();
  },
  requestLocation(onSuccess, onError, options) {
    return PlatformManager.getAdapter().requestLocation(onSuccess, onError, options);
  },
  hasNativeTts() {
    return PlatformManager.getAdapter().hasNativeTts();
  },
  hasSpeechSupport() {
    return PlatformManager.getAdapter().hasSpeechSupport();
  },
  speak(text, rate, pitch) {
    return PlatformManager.getAdapter().speak(text, rate, pitch);
  },
  stopSpeaking() {
    return PlatformManager.getAdapter().stopSpeaking();
  },
  setKeepScreenOn(enabled) {
    return PlatformManager.getAdapter().setKeepScreenOn(enabled);
  },
  getDjiApiKey() {
    return PlatformManager.getAdapter().getDjiApiKey();
  },
  setDjiApiKey(key) {
    return PlatformManager.getAdapter().setDjiApiKey(key);
  },
  fetchHttpJson(url) {
    return PlatformManager.getAdapter().fetchHttpJson(url);
  },
  postHttpNative(url, bodyStr, headersObj) {
    return PlatformManager.getAdapter().postHttpNative(url, bodyStr, headersObj);
  },
  pushKmzToController(kmzBase64, uuid) {
    return PlatformManager.getAdapter().pushKmzToController(kmzBase64, uuid);
  },
  pullKmzFromController(uuid) {
    return PlatformManager.getAdapter().pullKmzFromController(uuid);
  },
  getControllerSlots() {
    return PlatformManager.getAdapter().getControllerSlots();
  },
  pullLatestLogFromController() {
    return PlatformManager.getAdapter().pullLatestLogFromController();
  },
  listControllerLogs(limit, forceRefresh) {
    return PlatformManager.getAdapter().listControllerLogs(limit, forceRefresh);
  },
  pullControllerLog(filename, handle) {
    return PlatformManager.getAdapter().pullControllerLog(filename, handle);
  },
  listSavedFlights() {
    return PlatformManager.getAdapter().listSavedFlights();
  },
  getSavedFlightTelemetry(flightId) {
    return PlatformManager.getAdapter().getSavedFlightTelemetry(flightId);
  },
  getNativeAdsbStatus() {
    return PlatformManager.getAdapter().getNativeAdsbStatus();
  },
  setNativeAdsbServer(host, port) {
    return PlatformManager.getAdapter().setNativeAdsbServer(host, port);
  },
  probeAdsbHost(targetHost, apiBase) {
    return PlatformManager.getAdapter().probeAdsbHost(targetHost, apiBase);
  },
  discoverMdnsServers(timeoutMs, apiBase) {
    return PlatformManager.getAdapter().discoverMdnsServers(timeoutMs, apiBase);
  }
};

if (typeof window !== 'undefined') {
  window.PlatformManager = PlatformManager;
  window.Platform = Platform;
}
if (typeof global !== 'undefined') {
  global.PlatformManager = PlatformManager;
  global.Platform = Platform;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PlatformManager, Platform };
}
