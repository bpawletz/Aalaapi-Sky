/**
 * Aalaapi Sky - Windows & Desktop Platform Adapter
 *
 * Extends BasePlatformAdapter for Windows, macOS, and Linux desktop environments
 * paired with the Aalaapi Companion Bridge (PowerShell COM MTP, C# BLE/Wi-Fi scanners, RTL-SDR).
 */

class WindowsDesktopAdapter extends BasePlatformAdapter {
  constructor(osSubtype = 'windows') {
    super('desktop');
    this.osSubtype = osSubtype;
  }

  getSyncPlatform() {
    return 'desktop';
  }

  supportsWebUsbDirect() {
    return false;
  }

  getSyncTransportLabel() {
    if (this.osSubtype === 'windows') {
      return 'Windows Companion Bridge (PowerShell COM MTP / SSE)';
    }
    return 'Desktop Companion Bridge (ADB / SSE)';
  }
}

if (typeof window !== 'undefined') {
  window.WindowsDesktopAdapter = WindowsDesktopAdapter;
}
if (typeof global !== 'undefined') {
  global.WindowsDesktopAdapter = WindowsDesktopAdapter;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { WindowsDesktopAdapter };
}
