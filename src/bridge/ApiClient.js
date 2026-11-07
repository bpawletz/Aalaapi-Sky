// ─── Adaptive Hardware Sync: Platform Detection ──────────────────────────────







/**



 * Detect the user operating system to determine whether direct WebUSB



 * (Android / ChromeOS) or Aalaapi Bridge (Windows / macOS) is optimal.



 * @returns {'android' | 'chromeos' | 'desktop'}



 */



function getSyncPlatform() {
  if (typeof Platform !== 'undefined' && typeof Platform.getSyncPlatform === 'function') {
    return Platform.getSyncPlatform();
  }
  return 'desktop';
}







function getCompanionApiBase() {



  // 1. Check URL query parameter (?companion=http://...)



  if (typeof window !== 'undefined' && window.location && window.location.search) {



    try {



      const params = new URLSearchParams(window.location.search);



      const queryHost = params.get('companion');



      if (queryHost && queryHost.trim()) {



        const cleaned = queryHost.trim().replace(/\/+$/, '');



        if (typeof localStorage !== 'undefined') {



          localStorage.setItem('aalaapi-companion-host', cleaned);



        }



        return cleaned;



      }



    } catch (e) {}



  }







  // 2. Check localStorage saved companion host



  if (typeof localStorage !== 'undefined') {



    try {



      const stored = localStorage.getItem('aalaapi-companion-host');



      if (stored && stored.trim()) {



        return stored.trim().replace(/\/+$/, '');



      }



    } catch (e) {}



  }







  // 3. Same-origin check: if loaded on port 8765, use current origin (works on any LAN IP!)



  if (typeof window !== 'undefined' && window.location) {



    if (window.location.port === '8765' || window.location.port === '8766') {



      return `${window.location.protocol}//${window.location.hostname}:${window.location.port}`;



    }



    if (window.location.protocol === 'https:') {



      return 'https://127.0.0.1:8766';



    }



  }







  // 4. Default fallback



  return 'http://127.0.0.1:8765';



}







function setCompanionApiBase(newHost) {



  if (typeof window !== 'undefined' && window.location && window.location.search) {



    if (window.history && window.history.replaceState) {



      try {



        const url = new URL(window.location.href);



        url.searchParams.delete('companion');



        window.history.replaceState({}, '', url.toString());



      } catch (e) {}



    } else {



      window.location.search = '';



    }



  }







  if (!newHost || !newHost.trim()) {



    if (typeof localStorage !== 'undefined') {



      localStorage.removeItem('aalaapi-companion-host');



    }



  } else {



    let cleaned = newHost.trim().replace(/\/+$/, '');



    if (!/^https?:\/\//i.test(cleaned)) {



      cleaned = `http://${cleaned}`;



    }



    if (typeof localStorage !== 'undefined') {



      localStorage.setItem('aalaapi-companion-host', cleaned);



    }



  }



  COMPANION_API_BASE = getCompanionApiBase();



  const hostInput = typeof document !== 'undefined' ? document.getElementById('companion-host-input') : null;



  if (hostInput) hostInput.value = COMPANION_API_BASE;



  if (typeof wakeCompanionPolling === 'function') {



    wakeCompanionPolling(true);



  } else if (typeof pollCompanionStatus === 'function') {



    pollCompanionStatus();



  }



}







let COMPANION_API_BASE = getCompanionApiBase();



function getCompanionAuthHeaders() {

  if (typeof CompanionAuth !== 'undefined' && typeof CompanionAuth.getAuthHeaders === 'function') {

    return CompanionAuth.getAuthHeaders();

  }

  return {};

}

if (typeof window !== 'undefined') {

  window.getCompanionAuthHeaders = getCompanionAuthHeaders;

}



function buildAuthenticatedCompanionUrl(endpointPath) {

  const apiBase = typeof getCompanionApiBase === 'function' ? getCompanionApiBase() : (typeof COMPANION_API_BASE !== 'undefined' ? COMPANION_API_BASE : 'http://127.0.0.1:8765');

  const token = (typeof CompanionAuth !== 'undefined' && CompanionAuth.token) ? CompanionAuth.token : '';

  if (!token) return `${apiBase}${endpointPath}`;

  const sep = endpointPath.includes('?') ? '&' : '?';

  return `${apiBase}${endpointPath}${sep}token=${encodeURIComponent(token)}`;

}



function reconnectAllCompanionStreams() {

  if (typeof disconnectCompanionStatusStream === 'function') {

    disconnectCompanionStatusStream();

  }

  if (typeof connectCompanionStatusStream === 'function') {

    connectCompanionStatusStream();

  }

  if (typeof RemoteIdRadar !== 'undefined') {

    if (RemoteIdRadar.eventSource) {

      try { RemoteIdRadar.eventSource.close(); } catch (_) {}

      RemoteIdRadar.eventSource = null;

    }

    if (typeof RemoteIdRadar.connectStream === 'function') {

      RemoteIdRadar.connectStream();

    }

  }

  if (typeof AirspaceTracker !== 'undefined') {

    if (AirspaceTracker.eventSource) {

      try { AirspaceTracker.eventSource.close(); } catch (_) {}

      AirspaceTracker.eventSource = null;

    }

    if (typeof AirspaceTracker.connectStream === 'function') {

      AirspaceTracker.connectStream();

    }

  }

  if (typeof checkCompanionStatus === 'function') {

    checkCompanionStatus();

  }

}

if (typeof window !== 'undefined') {

  window.reconnectAllCompanionStreams = reconnectAllCompanionStreams;

}



let isCompanionOnline = false;



let isRc2MtpConnected = false;



function setNativeRc2Connection(connected, deviceData) {

  isRc2MtpConnected = Boolean(connected);

  if (connected) {

    lastDetectedFlightDevice = getDeviceDisplayInfo(deviceData || { deviceName: 'DJI RC 2' });

    if (deviceData && deviceData.slots && deviceData.slots.length > 0) {

      rc2MtpActiveUUID = deviceData.slots[0].uuid;

      if (typeof setRC2UUID === 'function' && !getRC2UUID()) {

        setRC2UUID(rc2MtpActiveUUID);

      }

    }

  }

  updateNativeAndroidStatusUI();

}



function updateNativeAndroidStatusUI() {

  if (typeof document === 'undefined') return;



  const headerPill = document.getElementById('header-bridge-pill');

  const headerDot = document.getElementById('header-bridge-dot');

  const headerSummary = document.getElementById('header-bridge-summary');

  const headerRc2Badge = document.getElementById('header-rc2-summary-badge');

  const sidebarBar = document.getElementById('sidebar-bridge-summary-bar');

  const sidebarDot = document.getElementById('sidebar-bridge-mini-dot');

  const sidebarLabel = document.getElementById('sidebar-bridge-mini-label');

  const sidebarRc2Badge = document.getElementById('sidebar-rc2-mini-badge');

  const sidebarQuickActions = document.getElementById('sidebar-rc2-quick-actions');



  const sDot = document.getElementById('companion-service-dot');

  const sText = document.getElementById('companion-service-text');

  const sLabel = document.getElementById('companion-service-label');

  const uDot = document.getElementById('companion-usb-dot');

  const uText = document.getElementById('companion-usb-text');

  const uLabel = document.getElementById('companion-usb-label');

  const container = document.getElementById('companion-sync-container');

  const hint = document.getElementById('companion-offline-hint');



  const directActions = document.getElementById('rc2-direct-actions');

  const directBtn = document.getElementById('direct-rc2-sync-btn');

  const pullBtn = document.getElementById('direct-rc2-pull-btn');

  const diagPullBtn = document.getElementById('diag-pull-rc2-btn');

  const diagBrowseBtn = document.getElementById('diag-browse-rc2-logs-btn');



  // 1. Android Field Link Status

  if (headerPill) {

    headerPill.classList.remove('is-offline', 'is-mismatch');

    headerPill.classList.add('is-online');

    headerPill.title = isRc2MtpConnected

      ? 'Android Field Link: DJI RC 2 Connected over USB-C (Ready to sync)'

      : 'Android Field Link: Online (Ready for DJI RC 2 USB-C connection)';

  }

  if (headerDot) headerDot.style.background = '#22c55e';

  if (headerSummary) headerSummary.textContent = isRc2MtpConnected ? 'Android: RC 2 OK' : 'Android Link';



  if (headerRc2Badge) {

    headerRc2Badge.textContent = isRc2MtpConnected ? 'RC 2: OK' : 'RC 2';

    headerRc2Badge.className = isRc2MtpConnected ? 'header-rc2-badge is-connected' : 'header-rc2-badge';

  }



  if (sidebarBar) {

    sidebarBar.classList.remove('is-offline');

    sidebarBar.classList.add('is-online');

  }

  if (sidebarDot) sidebarDot.style.background = '#22c55e';

  if (sidebarLabel) sidebarLabel.textContent = isRc2MtpConnected ? 'Android: RC 2 Linked' : 'Android Field Link: Online';



  if (sidebarRc2Badge) {
  sidebarRc2Badge.textContent = isRc2MtpConnected ? 'RC 2: OK' : 'RC 2';
  sidebarRc2Badge.style.background = isRc2MtpConnected ? 'rgba(34, 197, 94, 0.2)' : 'rgba(100, 116, 139, 0.2)';
  sidebarRc2Badge.style.color = isRc2MtpConnected ? '#4ade80' : '#94a3b8';
}

// Update Bottom Sticky Dock RC 2 indicator (Issue #266)
const dockBtn = document.getElementById('dock-rc2-sync-btn');
const dockDot = document.getElementById('dock-rc2-status-dot');
if (dockBtn && dockDot) {
  if (isRc2MtpConnected) {
    dockDot.className = 'dock-rc2-dot is-connected';
    dockBtn.classList.add('is-connected');
    dockBtn.title = 'Send mission directly to connected DJI RC 2';
  } else if (isCompanionOnline) {
    dockDot.className = 'dock-rc2-dot is-waiting';
    dockBtn.classList.remove('is-connected');
    dockBtn.title = 'DJI RC 2: Plug in USB-C to sync';
  } else {
    dockDot.className = 'dock-rc2-dot is-offline';
    dockBtn.classList.remove('is-connected');
    dockBtn.title = 'Send to RC 2 (Connect USB or Bridge to sync)';
  }
}



  // 2. Drawer Popover Details

  if (sDot) sDot.style.background = '#22c55e';

  if (sText) {

    sText.textContent = 'Android Field Link: Active';

    sText.style.color = '#22c55e';

  }

  if (sLabel) sLabel.textContent = 'Native Hardware Bridge';



  if (uDot) uDot.style.background = isRc2MtpConnected ? '#22c55e' : '#64748b';

  if (uText) {

    uText.textContent = isRc2MtpConnected ? 'DJI RC 2: Connected' : 'RC 2 USB Link: Waiting';

    uText.style.color = isRc2MtpConnected ? '#22c55e' : 'var(--text-muted)';

  }

  if (uLabel) uLabel.textContent = isRc2MtpConnected ? 'USB-C MTP' : 'Plug in USB-C';



  // 3. Quick Action Buttons Visibility

  if (isRc2MtpConnected) {

    if (sidebarQuickActions) sidebarQuickActions.style.display = 'flex';

    if (directActions) directActions.style.display = 'flex';

    if (directBtn) directBtn.style.display = 'inline-flex';

    if (pullBtn) pullBtn.style.display = 'inline-flex';

    if (diagPullBtn) diagPullBtn.style.display = 'inline-flex';

    if (diagBrowseBtn) diagBrowseBtn.style.display = 'inline-flex';

    if (container && container.classList) container.classList.remove('is-offline');

    if (hint && hint.style) hint.style.display = 'none';

  } else {

    if (sidebarQuickActions) sidebarQuickActions.style.display = 'none';

    if (directActions) directActions.style.display = 'none';

    if (directBtn) directBtn.style.display = 'none';

    if (pullBtn) pullBtn.style.display = 'none';

    if (diagPullBtn) diagPullBtn.style.display = 'none';

    if (diagBrowseBtn) diagBrowseBtn.style.display = 'none';

    if (container && container.classList) container.classList.add('is-offline');

    if (hint && hint.style) hint.style.display = 'flex';

    const labelSpan = (hint && typeof hint.querySelector === 'function') ? hint.querySelector('span:first-child') : null;

    if (labelSpan) {

      labelSpan.innerHTML = `

        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>

        Connect DJI RC 2 via USB-C to sync missions`;

    }

  }

}



let rc2MtpActiveUUID = '';



let lastDetectedFlightDevice = null;

let lastCompanionServerLinksState = null;



function updateServedLinksModalUI(statusData) {

  if (typeof document === 'undefined') return;

  if (statusData && typeof statusData === 'object') {

    lastCompanionServerLinksState = statusData;

  }

  const state = (statusData && typeof statusData === 'object') ? statusData : lastCompanionServerLinksState;

  const card = document.getElementById('links-modal-server-card');

  if (!card) return;



  const mdnsHost = (state && state.mdns && state.mdns.hostname ? String(state.mdns.hostname) : 'aalaapi-sky.local').replace(/\/+$/, '');

  const httpPort = (state && state.mdns && state.mdns.port) ? Number(state.mdns.port) : 8765;

  const httpsPort = (state && state.https && state.https.port)

    ? Number(state.https.port)

    : ((state && state.mdns && state.mdns.httpsPort) ? Number(state.mdns.httpsPort) : 8766);

  const rtmpPort = (state && state.rtmp && state.rtmp.port)

    ? Number(state.rtmp.port)

    : ((state && state.mdns && state.mdns.rtmpPort) ? Number(state.mdns.rtmpPort) : 1935);

  const adsbPort = (state && state.mdns && state.mdns.adsbPort) ? Number(state.mdns.adsbPort) : 30003;

  const mdnsEnabled = Boolean(state && state.mdns && state.mdns.enabled);

  const bridgeOnline = Boolean(state && (state.version || state.mdns || state.https || isCompanionOnline));



  const badge = document.getElementById('links-server-status-badge');

  if (badge) {

    if (bridgeOnline && mdnsEnabled) {

      badge.textContent = `🟢 mDNS Active (${mdnsHost})`;

      badge.style.background = 'rgba(34, 197, 94, 0.16)';

      badge.style.color = '#4ade80';

      badge.style.borderColor = 'rgba(34, 197, 94, 0.45)';

    } else if (bridgeOnline) {

      badge.textContent = '🟢 Bridge Online (Localhost)';

      badge.style.background = 'rgba(56, 189, 248, 0.16)';

      badge.style.color = '#38bdf8';

      badge.style.borderColor = 'rgba(56, 189, 248, 0.45)';

    } else {

      badge.textContent = '⚪ Default Local Endpoints';

      badge.style.background = 'rgba(148, 163, 184, 0.15)';

      badge.style.color = '#cbd5e1';

      badge.style.borderColor = 'rgba(148, 163, 184, 0.35)';

    }

  }



  const updatePrimaryRow = (linkId, openId, rowId, url) => {

    const linkEl = document.getElementById(linkId);

    if (linkEl) {

      linkEl.href = url;

      linkEl.textContent = url;

    }

    const openEl = document.getElementById(openId);

    if (openEl) {

      openEl.href = url;

    }

    const rowEl = document.getElementById(rowId);

    if (rowEl && typeof rowEl.querySelector === 'function') {

      const copyBtn = rowEl.querySelector('.links-copy-url-btn');

      if (copyBtn) copyBtn.setAttribute('data-copy-url', url);

    }

  };



  updatePrimaryRow('links-bonjour-https', 'links-bonjour-https-open', 'links-bonjour-https-row', `https://${mdnsHost}:${httpsPort}/`);

  updatePrimaryRow('links-bonjour-http', 'links-bonjour-http-open', 'links-bonjour-http-row', `http://${mdnsHost}:${httpPort}/`);

  updatePrimaryRow('links-local-https', 'links-local-https-open', 'links-local-https-row', `https://127.0.0.1:${httpsPort}/`);

  updatePrimaryRow('links-local-http', 'links-local-http-open', 'links-local-http-row', `http://127.0.0.1:${httpPort}/`);



  const updateEndpointRow = (elId, url, isAnchor) => {

    const el = document.getElementById(elId);

    if (!el) return;

    if (isAnchor) el.href = url;

    el.textContent = url;

    const parent = el.parentElement;

    if (parent && typeof parent.querySelector === 'function') {

      const copyBtn = parent.querySelector('.links-copy-url-btn');

      if (copyBtn) copyBtn.setAttribute('data-copy-url', url);

    }

  };



  updateEndpointRow('links-endpoint-status', `https://127.0.0.1:${httpsPort}/api/status`, true);

  updateEndpointRow('links-endpoint-mcp', `https://localhost:${httpsPort}/api/mcp/sse`, true);

  updateEndpointRow('links-endpoint-openapi', `https://localhost:${httpsPort}/api/openapi.json`, true);

  updateEndpointRow('links-endpoint-discovery', `http://${mdnsHost}:${httpPort}/api/discovery`, true);

  updateEndpointRow('links-endpoint-rtmp', `rtmp://${mdnsHost}:${rtmpPort}/live/stream`, false);

  updateEndpointRow('links-endpoint-sbs', `sbs://${mdnsHost}:${adsbPort}`, false);



  const lanSection = document.getElementById('links-lan-dynamic-section');

  const lanList = document.getElementById('links-lan-dynamic-list');

  if (lanSection && lanList) {

    const lanAddrs = (state && Array.isArray(state.lanAddresses)) ? state.lanAddresses : [];

    if (lanAddrs.length > 0) {

      lanSection.style.display = 'flex';

      lanList.innerHTML = lanAddrs.map(item => {

        const safeName = typeof escapeHtml === 'function' ? escapeHtml(item.name || 'LAN') : (item.name || 'LAN');

        const httpUrl = item.url || `http://${item.address}:${httpPort}`;

        const httpsUrl = item.httpsUrl || `https://${item.address}:${httpsPort}`;

        return `

          <div class="links-lan-item-row" style="display: flex; align-items: center; justify-content: space-between; gap: 6px; flex-wrap: wrap; background: rgba(15, 23, 42, 0.55); border: 1px solid rgba(56, 189, 248, 0.25); border-radius: 6px; padding: 4px 8px; font-size: 0.68rem;">

            <span style="color: #94a3b8; font-weight: 600;">${safeName}:</span>

            <div style="display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap;">

              <a href="${httpsUrl}" target="_blank" rel="noopener noreferrer" style="font-family: monospace; color: #34d399; text-decoration: underline;">${httpsUrl}</a>

              <button type="button" class="btn-secondary links-copy-url-btn" data-copy-url="${httpsUrl}" style="padding: 1px 5px; font-size: 0.6rem; line-height: 1.1;">Copy HTTPS</button>

              <a href="${httpUrl}" target="_blank" rel="noopener noreferrer" style="font-family: monospace; color: #38bdf8; text-decoration: underline;">${httpUrl}</a>

              <button type="button" class="btn-secondary links-copy-url-btn" data-copy-url="${httpUrl}" style="padding: 1px 5px; font-size: 0.6rem; line-height: 1.1;">Copy HTTP</button>

            </div>

          </div>`;

      }).join('');

    } else {

      lanSection.style.display = 'none';

      lanList.innerHTML = '';

    }

  }

}



function getLastDetectedFlightDevice() {

  return lastDetectedFlightDevice;

}



function getDeviceDisplayInfo(statusData = {}) {

  const isAndroid = !!statusData.isAndroid;

  const rawName = (statusData.deviceName || '').trim();



  let fullName = rawName;

  let shortName = rawName;



  if (rawName) {

    const possessiveMatch = rawName.match(/^(?:.*?'s\s+)?(.+)$/i);

    const baseName = possessiveMatch ? possessiveMatch[1].trim() : rawName;



    const cleanBrandName = baseName.replace(/^(?:Google|Samsung)\s+/i, '').trim();



    if (/S25\s*Ultra/i.test(rawName)) {

      shortName = 'S25 Ultra';

    } else if (/S25/i.test(rawName)) {

      shortName = 'S25';

    } else if (/S24/i.test(rawName)) {

      shortName = 'S24';

    } else if (/Pixel/i.test(rawName)) {

      shortName = cleanBrandName.length <= 14 ? cleanBrandName : (baseName.length <= 14 ? baseName : 'Pixel');

    } else if (/RC\s*2/i.test(rawName)) {

      shortName = 'RC 2';

      fullName = 'DJI RC 2';

    } else if (/RC\s*Pro/i.test(rawName)) {

      shortName = 'RC Pro';

      fullName = 'DJI RC Pro';

    } else if (/RC/i.test(rawName)) {

      shortName = 'RC';

      fullName = 'DJI RC';

    } else {

      shortName = baseName.length <= 14 ? baseName : (isAndroid ? 'Android' : 'Controller');

    }

  } else if (isAndroid) {

    fullName = 'Android Smartphone';

    shortName = 'Android';

  } else {

    fullName = 'DJI RC 2';

    shortName = 'RC 2';

  }



  return {

    fullName,

    shortName,

    isAndroid,

    connected: !!statusData.connected,

    locked: !!statusData.locked

  };

}



let companionPollInterval = null;



let consecutiveStatusFailures = 0;



let consecutiveRadarFailures = 0;



let lastStatusCheckTime = 0;



let remoteIdDroneCount = 0;







function isBridgeTileCachingEnabled() {



  if (typeof localStorage === 'undefined') return true;



  try {



    const val = localStorage.getItem('aalaapi-bridge-tile-caching');



    return val !== 'false';



  } catch (e) {



    return true;



  }



}







function setBridgeTileCachingEnabled(enabled) {



  if (typeof localStorage !== 'undefined') {



    try {



      localStorage.setItem('aalaapi-bridge-tile-caching', enabled ? 'true' : 'false');



    } catch (e) {}



  }



  const toggle = (typeof document !== 'undefined') ? document.getElementById('bridge-tile-cache-toggle') : null;



  if (toggle) toggle.checked = !!enabled;







  refreshActiveMapTileLayers();



}







function refreshActiveMapTileLayers() {



  if (typeof map !== 'undefined' && map && typeof map.eachLayer === 'function') {



    map.eachLayer(layer => {



      if (layer && typeof layer.redraw === 'function') {



        try { layer.redraw(); } catch (e) {}



      }



    });



  }



}







function shouldProxyTileUrl(url) {



  if (!url || typeof url !== 'string') return false;



  if (url.startsWith('data:') || url.startsWith('blob:')) return false;







  const lower = url.toLowerCase();



  if (lower.includes('/api/proxy/tile') || lower.includes('/proxy?url=')) return false;







  return lower.includes('arcgisonline.com') ||



         lower.includes('tiles.arcgis.com') ||



         lower.includes('openstreetmap.org') ||



         lower.includes('opentopomap.org') ||



         lower.includes('services6.arcgis.com') ||



         lower.includes('services1.arcgis.com') ||



         lower.includes('opengeo.ncep.noaa.gov') ||



         lower.includes('gibs.earthdata.nasa.gov') ||



         lower.includes('mesonet.agron.iastate.edu');



}







function getBridgeProxyUrl(rawUrl) {



  if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;



  const online = (typeof window !== 'undefined' && typeof window.isCompanionOnline === 'boolean')



    ? window.isCompanionOnline



    : ((typeof global !== 'undefined' && typeof global.isCompanionOnline === 'boolean')



      ? global.isCompanionOnline



      : (typeof isCompanionOnline !== 'undefined' && isCompanionOnline));



  if (!online) return rawUrl;



  if (typeof isBridgeTileCachingEnabled === 'function' && !isBridgeTileCachingEnabled()) return rawUrl;



  if (!shouldProxyTileUrl(rawUrl)) return rawUrl;







  const apiBase = (typeof getCompanionApiBase === 'function') ? getCompanionApiBase() : 'http://127.0.0.1:8765';

  const token = (typeof CompanionAuth !== 'undefined' && CompanionAuth.token) ? CompanionAuth.token : '';

  const tokenParam = token ? `&token=${encodeURIComponent(token)}` : '';

  return `${apiBase}/api/proxy/tile?url=${encodeURIComponent(rawUrl)}${tokenParam}`;



}







async function fetchBridgeCacheStats() {



  if (typeof isCompanionOnline === 'undefined' || !isCompanionOnline || typeof document === 'undefined') return;



  const statsSpan = document.getElementById('bridge-cache-stats-text');



  const hitrateSpan = document.getElementById('bridge-cache-hitrate-text');



  if (!statsSpan) return;







  try {



    const apiBase = (typeof getCompanionApiBase === 'function') ? getCompanionApiBase() : 'http://127.0.0.1:8765';



    const res = await fetch(`${apiBase}/api/cache/tiles/stats`);



    if (res.ok) {



      const data = await res.json();



      statsSpan.textContent = `Cached: ${data.totalFiles.toLocaleString()} tiles (${data.totalSizeMb} MB / ${data.maxSizeMb} MB)`;



      if (hitrateSpan) {



        hitrateSpan.textContent = `Hit Rate: ${data.hitRatePercent}%`;



      }



    }



  } catch (_) {}



}







async function purgeBridgeTileCache() {



  if (typeof isCompanionOnline === 'undefined' || !isCompanionOnline) {



    if (typeof showToast === 'function') showToast('Aalaapi Bridge is offline.', 3000);



    return;



  }



  const clearBtn = (typeof document !== 'undefined') ? document.getElementById('bridge-cache-clear-btn') : null;



  if (clearBtn) {



    clearBtn.disabled = true;



    clearBtn.textContent = 'Purging...';



  }







  try {



    const apiBase = (typeof getCompanionApiBase === 'function') ? getCompanionApiBase() : 'http://127.0.0.1:8765';



    const res = await fetch(`${apiBase}/api/cache/tiles/clear`, { method: 'POST' });



    if (res.ok) {



      if (typeof showToast === 'function') showToast('Bridge map tile cache purged successfully.', 3000);



      await fetchBridgeCacheStats();



      refreshActiveMapTileLayers();



    } else {



      if (typeof showToast === 'function') showToast('Failed to purge tile cache.', 3000);



    }



  } catch (err) {



    if (typeof showToast === 'function') showToast('Error purging cache: ' + err.message, 3000);



  } finally {



    if (clearBtn) {



      clearBtn.disabled = false;



      clearBtn.textContent = 'Purge';



    }



  }



}







let companionStatusEventSource = null;



let isCompanionStatusStreaming = false;







function updateCompanionTransportUI(mode) {



  if (typeof document === 'undefined') return;



  const badge = document.getElementById('companion-transport-badge');



  if (!badge) return;



  if (mode === 'sse') {



    badge.textContent = 'SSE Stream';



    badge.style.color = '#38bdf8';



  } else if (mode === 'polling') {



    badge.textContent = 'REST Polling';



    badge.style.color = '#f59e0b';



  } else {



    badge.textContent = '';



  }



}







function updateMcpMonitorUI(mcpData, isOnline) {



  if (typeof document === 'undefined') return;



  const mcpDot = document.getElementById('mcp-server-dot');



  const mcpSessions = document.getElementById('mcp-active-sessions-text');



  const mcpFrames = document.getElementById('mcp-frame-counts-text');



  const mcpToolsCount = document.getElementById('mcp-tools-count-text');



  const mcpLastAction = document.getElementById('mcp-last-action-text');



  const mcpBadge = document.getElementById('mcp-transport-status-badge');







  if (!isOnline) {



    if (mcpDot) mcpDot.style.background = '#64748b';



    if (mcpSessions) mcpSessions.textContent = '0 Clients';



    if (mcpLastAction) mcpLastAction.textContent = 'offline';



    if (mcpBadge) mcpBadge.textContent = 'Bridge Offline';



    return;



  }







  if (mcpDot) mcpDot.style.background = '#22c55e';



  if (mcpBadge) mcpBadge.textContent = 'Stdio / SSE Active';



  if (mcpData) {



    if (mcpSessions) mcpSessions.textContent = `${mcpData.activeSessions || 0} Clients`;



    if (mcpFrames) mcpFrames.textContent = `${mcpData.readFrames || 0} R / ${mcpData.writeFrames || 0} W`;



    if (mcpToolsCount) {



      const count = mcpData.toolsCount || (mcpData.tools ? mcpData.tools.length : 6);



      mcpToolsCount.textContent = `${count} Active`;



    }



    if (mcpLastAction) mcpLastAction.textContent = mcpData.lastTool || 'ready';



  } else {



    if (mcpSessions) mcpSessions.textContent = '0 Clients';



    if (mcpLastAction) mcpLastAction.textContent = 'ready';



  }



}







function getAppVersion() {



  if (typeof window !== 'undefined' && window.APP_VERSION) {



    return window.APP_VERSION;



  }



  if (typeof document !== 'undefined' && typeof document.querySelector === 'function') {



    const badge = document.querySelector('.header-version-badge');



    if (badge && badge.textContent) {



      return badge.textContent.replace(/^v/i, '').trim();



    }



    const tag = document.querySelector('.version-tag');



    if (tag && tag.textContent) {



      const match = tag.textContent.match(/[\d.]+/);



      if (match) return match[0];



    }



  }



  if (typeof require === 'function') {

    try {

      const fs = require('fs');

      const path = require('path');

      const pkgPath = path.resolve(__dirname, '../../package.json');

      if (fs.existsSync(pkgPath)) {

        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

        if (pkg && pkg.version) return pkg.version;

      }

    } catch (_) {}

  }



  return '1.217.0';



}







function compareSemver(v1, v2) {



  if (!v1 || !v2) return 0;



  const p1 = String(v1).replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);



  const p2 = String(v2).replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);



  const len = Math.max(p1.length, p2.length);



  for (let i = 0; i < len; i++) {



    const a = p1[i] || 0;



    const b = p2[i] || 0;



    if (a > b) return 1;



    if (a < b) return -1;



  }



  return 0;



}







let isRestartingBridge = false;







async function restartCompanionBridge() {



  if (isRestartingBridge) return;



  isRestartingBridge = true;







  const restartBtn = document.getElementById('companion-restart-btn');



  const mismatchText = document.getElementById('companion-version-mismatch-text');



  const sText = document.getElementById('companion-service-text');



  const sDot = document.getElementById('companion-service-dot');







  if (restartBtn) {



    restartBtn.disabled = true;



    restartBtn.textContent = 'Restarting...';



  }



  if (mismatchText) {



    mismatchText.textContent = '⏳ Restarting Bridge Service...';



  }



  if (sDot) sDot.style.background = '#eab308';



  if (sText) {



    sText.textContent = 'Aalaapi Bridge: Restarting...';



    sText.style.color = '#eab308';



  }







  const apiBase = typeof COMPANION_API_BASE !== 'undefined' ? COMPANION_API_BASE : 'http://127.0.0.1:8765';



  try {



    const controller = new AbortController();



    const timeoutId = setTimeout(() => controller.abort(), 2000);



    await fetch(`${apiBase}/api/restart`, {



      method: 'POST',



      headers: { 'Content-Type': 'application/json' },



      signal: controller.signal



    });



    clearTimeout(timeoutId);



  } catch (err) {



    // Normal connection drop upon process exit



  }







  // Poll until bridge is back online with new version



  let attempts = 0;



  const pollInterval = setInterval(async () => {



    attempts++;



    try {



      const controller = new AbortController();



      const timeoutId = setTimeout(() => controller.abort(), 1500);



      const res = await fetch(`${apiBase}/api/status?refresh=1`, {



        cache: 'no-store',



        signal: controller.signal



      });



      clearTimeout(timeoutId);



      if (res.ok) {



        clearInterval(pollInterval);



        isRestartingBridge = false;



        const data = await res.json();



        applyCompanionStatusUI(data);



        if (typeof wakeCompanionPolling === 'function') {



          wakeCompanionPolling(true);



        }



      }



    } catch (_) {



      if (attempts >= 25) {



        clearInterval(pollInterval);



        isRestartingBridge = false;



        if (restartBtn) {



          restartBtn.disabled = false;



          restartBtn.textContent = 'Retry Restart';



        }



        if (mismatchText) {



          mismatchText.textContent = '⚠️ Restart timed out. Check start-bridge.bat / .ps1, or reload page.';



        }



      }



    }



  }, 1000);



}







function applyCompanionStatusUI(data) {



  if (typeof document === 'undefined' || !data) return;



  const sDot = document.getElementById('companion-service-dot');



  const sText = document.getElementById('companion-service-text');



  const sLabel = document.getElementById('companion-service-label');



  const uDot = document.getElementById('companion-usb-dot');



  const uText = document.getElementById('companion-usb-text');



  const uLabel = document.getElementById('companion-usb-label');







  // Legacy alias elements for backward compatibility



  const dot = document.getElementById('companion-indicator-dot');



  const text = document.getElementById('companion-status-text');



  const label = document.getElementById('companion-device-label');







  const directActions = document.getElementById('rc2-direct-actions');



  const directBtn = document.getElementById('direct-rc2-sync-btn');



  const pullBtn = document.getElementById('direct-rc2-pull-btn');



  const container = document.getElementById('companion-sync-container');



  const hint = document.getElementById('companion-offline-hint');



  const diagPullBtn = document.getElementById('diag-pull-rc2-btn');



  const diagBrowseBtn = document.getElementById('diag-browse-rc2-logs-btn');







  // 1. Update Bridge Service status (Online)



  const appVer = getAppVersion();



  const bridgeVer = (data && data.version) ? data.version : null;



  const mismatchAlert = document.getElementById('companion-version-mismatch-alert');



  const runVerSpan = document.getElementById('companion-running-version');



  const targetVerSpan = document.getElementById('companion-target-version');



  const restartBtn = document.getElementById('companion-restart-btn');



  const reloadBtn = document.getElementById('companion-reload-btn');



  const mismatchText = document.getElementById('companion-version-mismatch-text');



  const mismatchDetail = document.getElementById('companion-version-mismatch-detail');







  const cmp = compareSemver(bridgeVer, appVer);



  const isVersionMismatch = !!(bridgeVer && appVer && (cmp !== 0 || bridgeVer !== appVer));







  if (sDot) sDot.style.background = isVersionMismatch ? '#f59e0b' : '#22c55e';



  if (sText) {



    if (isVersionMismatch) {



      sText.innerHTML = `Aalaapi Bridge: Online <span style="color: #f59e0b; font-size: 0.68rem; font-weight: 700;">(v${bridgeVer} ≠ v${appVer})</span>`;



    } else {



      sText.textContent = 'Aalaapi Bridge: Online';



      sText.style.color = '#22c55e';



    }



  }







  if (mismatchAlert) {



    if (isVersionMismatch && !isRestartingBridge) {



      mismatchAlert.style.display = 'flex';



      if (runVerSpan) runVerSpan.textContent = `v${bridgeVer}`;



      if (targetVerSpan) targetVerSpan.textContent = `v${appVer}`;







      if (cmp > 0) {



        // Bridge is NEWER than Web App: Browser session is outdated, prompt to reload page



        mismatchAlert.style.background = 'rgba(14, 165, 233, 0.12)';



        mismatchAlert.style.borderColor = 'rgba(56, 189, 248, 0.4)';



        if (mismatchText) {



          mismatchText.textContent = '🔄 Web App Outdated';



          mismatchText.style.color = '#38bdf8';



        }



        if (mismatchDetail) {



          mismatchDetail.innerHTML = `Bridge service is running newer <span style="font-weight: 600; color: #38bdf8;">v${bridgeVer}</span>, but browser session is <span style="font-weight: 600; color: #f87171;">v${appVer}</span>. Reload webpage to update.`;



        }



        if (reloadBtn) {



          reloadBtn.style.display = 'inline-block';



          reloadBtn.disabled = false;



          reloadBtn.textContent = 'Reload Web App';



        }



        if (restartBtn) {



          restartBtn.style.display = 'none';



        }



      } else {



        // Bridge is OLDER than Web App: Bridge service needs restart



        mismatchAlert.style.background = 'rgba(239, 68, 68, 0.12)';



        mismatchAlert.style.borderColor = 'rgba(239, 68, 68, 0.4)';



        if (mismatchText) {



          mismatchText.textContent = '⚠️ Bridge Service Outdated';



          mismatchText.style.color = '#f87171';



        }



        if (mismatchDetail) {



          mismatchDetail.innerHTML = `Bridge service is running older <span style="font-weight: 600; color: #f87171;">v${bridgeVer}</span>, but Web app is <span style="font-weight: 600; color: #38bdf8;">v${appVer}</span>. Click to restart bridge.`;



        }



        if (reloadBtn) {



          reloadBtn.style.display = 'none';



        }



        if (restartBtn) {



          restartBtn.style.display = 'inline-block';



          restartBtn.disabled = false;



          restartBtn.textContent = 'Auto-Restart Bridge';



        }



      }



    } else if (!isVersionMismatch) {



      mismatchAlert.style.display = 'none';



    }



  }







  if (sLabel) sLabel.textContent = 'port 8765';



  if (data && data.tileCache) {

    const statsSpan = (typeof document !== 'undefined') ? document.getElementById('bridge-cache-stats-text') : null;

    const hitrateSpan = (typeof document !== 'undefined') ? document.getElementById('bridge-cache-hitrate-text') : null;

    if (statsSpan) {

      statsSpan.textContent = `Cached: ${(data.tileCache.totalFiles || 0).toLocaleString()} tiles (${data.tileCache.totalSizeMb || 0} MB / ${data.tileCache.maxSizeMb || 0} MB)`;

    }

    if (hitrateSpan) {

      hitrateSpan.textContent = `Hit Rate: ${data.tileCache.hitRatePercent || 0}%`;

    }

  } else if (typeof fetchBridgeCacheStats === 'function' && !isCompanionStatusStreaming) {

    fetchBridgeCacheStats();

  }



  if (typeof updateMcpMonitorUI === 'function') updateMcpMonitorUI(data?.mcp, true);

  if (typeof updateServedLinksModalUI === 'function') updateServedLinksModalUI(data);







  // 2. Update Flight Controller / Android USB Link status

  const devInfo = getDeviceDisplayInfo(data || {});

  lastDetectedFlightDevice = devInfo;



  if (data.connected) {



    isRc2MtpConnected = true;



    if (data.activeMissions && data.activeMissions.length > 0) {



      rc2MtpActiveUUID = data.activeMissions[0];



      if (typeof setRC2UUID === 'function' && !getRC2UUID()) {



        setRC2UUID(rc2MtpActiveUUID);



      }



    }



    if (container && container.classList) container.classList.remove('is-offline');



    if (hint && hint.style) hint.style.display = 'none';







    if (uDot) uDot.style.background = '#22c55e';



    if (uText) {

      if (data.isAndroid) {

        uText.textContent = `${devInfo.fullName}: Connected`;

      } else {

        uText.textContent = 'RC 2 USB Link: Connected';

      }

      uText.style.color = '#22c55e';

    }



    if (uLabel) uLabel.textContent = data.deviceName || `${devInfo.shortName} (MTP)`;



    // Legacy compatibility

    if (dot) dot.style.background = '#22c55e';



    if (text) {

      text.textContent = data.isAndroid ? (data.deviceName || `${devInfo.fullName} Connected`) : 'DJI RC 2 Connected';

      text.style.color = '#22c55e';

    }



    if (label) label.textContent = data.deviceName || `${devInfo.shortName} (MTP)`;







    if (directActions) directActions.style.display = 'flex';



    if (directBtn) directBtn.style.display = 'inline-flex';



    if (pullBtn) pullBtn.style.display = 'inline-flex';



    if (diagPullBtn) diagPullBtn.style.display = 'inline-flex';



    if (diagBrowseBtn) diagBrowseBtn.style.display = 'inline-flex';



  } else {



    isRc2MtpConnected = false;



    if (container && container.classList) container.classList.add('is-offline');



    if (hint) {

      hint.style.display = 'flex';

      const labelSpan = (typeof hint.querySelector === 'function') ? hint.querySelector('span:first-child') : null;

      if (labelSpan) {

        if (data && data.locked) {

          labelSpan.innerHTML = `

            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>

            ${typeof escapeHtml === 'function' ? escapeHtml(devInfo.shortName) : devInfo.shortName} Locked &bull; File Transfer Guide`;

          hint.title = `${devInfo.fullName} storage is locked. Select 'Transferring files' on phone.`;

          hint.onclick = () => { if (typeof openRC2GuideModal === 'function') openRC2GuideModal('android'); };

        } else {

          labelSpan.innerHTML = `

            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>

            RC 2 / Phone Unplugged &bull; USB Setup Guide`;

          hint.title = 'Open RC 2 & Phone USB Setup Guide';

        }

      }

    }



    if (uDot) uDot.style.background = (data && data.locked) ? '#f59e0b' : '#eab308';



    if (uText) {

      if (data && data.locked) {

        uText.textContent = `${devInfo.fullName}: Locked / Charging Only`;

        uText.style.color = '#f59e0b';

      } else {

        uText.textContent = 'RC 2 USB Link: Unplugged';

        uText.style.color = '#eab308';

      }

    }



    if (uLabel) uLabel.textContent = (data && data.locked) ? 'Unlock Phone' : 'Plug in USB-C';



    // Legacy compatibility

    if (dot) dot.style.background = (data && data.locked) ? '#f59e0b' : '#eab308';



    if (text) {

      text.textContent = (data && data.locked) ? `${devInfo.fullName} Locked` : 'RC 2 Disconnected';

      text.style.color = (data && data.locked) ? '#f59e0b' : '#eab308';

    }



    if (label) label.textContent = (data && data.locked) ? 'Unlock Phone' : 'Plug in USB-C';







    if (directActions) directActions.style.display = 'none';



    if (directBtn) directBtn.style.display = 'none';



    if (pullBtn) pullBtn.style.display = 'none';



    if (diagPullBtn) diagPullBtn.style.display = 'none';



    if (diagBrowseBtn) diagBrowseBtn.style.display = 'none';



  }







  // 3. Update Top Nav Info Node & Sidebar Summary Bar (Issue #128)

  const isAuthRequiredState = Boolean(data && (data.status === 'auth_required' || (data.authRequired && !data.authenticated)));



  const headerPill = document.getElementById('header-bridge-pill');

  const headerDot = document.getElementById('header-bridge-dot');

  const headerSummary = document.getElementById('header-bridge-summary');

  const headerRc2Badge = document.getElementById('header-rc2-summary-badge');

  const sidebarBar = document.getElementById('sidebar-bridge-summary-bar');

  const sidebarDot = document.getElementById('sidebar-bridge-mini-dot');

  const sidebarLabel = document.getElementById('sidebar-bridge-mini-label');

  const sidebarRc2Badge = document.getElementById('sidebar-rc2-mini-badge');

  const sidebarQuickActions = document.getElementById('sidebar-rc2-quick-actions');



  if (isAuthRequiredState) {

    if (headerPill) {

      headerPill.classList.remove('is-offline', 'is-mismatch');

      headerPill.classList.add('is-online');

      headerPill.title = 'Aalaapi Bridge Online: Pilot Authentication Required (Click to sign in)';

    }

    if (headerDot) headerDot.style.background = '#f59e0b';

    if (headerSummary) headerSummary.textContent = 'Bridge: Sign-In Required';

    if (sidebarBar) {

      sidebarBar.classList.remove('is-offline');

      sidebarBar.classList.add('is-online');

    }

    if (sidebarDot) sidebarDot.style.background = '#f59e0b';

    if (sidebarLabel) sidebarLabel.textContent = 'Sign-In Required';

    const sText = document.getElementById('companion-service-text');

    const sDot = document.getElementById('companion-service-dot');

    if (sText) {

      sText.textContent = 'Aalaapi Bridge: Sign-In Required';

      sText.style.color = '#f59e0b';

    }

    if (sDot) sDot.style.background = '#f59e0b';

    return;

  }







  if (headerPill) {



    headerPill.classList.remove('is-offline');



    headerPill.classList.add('is-online');



    if (isVersionMismatch) {



      headerPill.classList.add('is-mismatch');



      if (cmp > 0) {



        headerPill.title = `⚠️ Version Mismatch (Web App Outdated): App v${appVer} < Bridge v${bridgeVer} (Click to open & reload)`;



      } else {



        headerPill.title = `⚠️ Version Mismatch (Bridge Outdated): Bridge v${bridgeVer} < App v${appVer} (Click to open & restart)`;



      }



    } else {



      headerPill.classList.remove('is-mismatch');



      headerPill.title = 'Aalaapi Bridge & Hardware Status (Click to view details)';



    }



  }



  if (headerDot) headerDot.style.background = isVersionMismatch ? '#f59e0b' : '#22c55e';



  if (headerSummary) headerSummary.textContent = isVersionMismatch ? 'Bridge (vMismatch)' : 'Bridge: Online';



  if (sidebarBar) {



    sidebarBar.classList.remove('is-offline');



    sidebarBar.classList.add('is-online');



  }



  if (sidebarDot) sidebarDot.style.background = isVersionMismatch ? '#f59e0b' : '#22c55e';



  if (sidebarLabel) sidebarLabel.textContent = isVersionMismatch ? 'Aalaapi Bridge: vMismatch' : 'Aalaapi Bridge: Online';







  const sidebarDirectBtn = document.getElementById('sidebar-direct-rc2-sync-btn');

  const sidebarPullBtn = document.getElementById('sidebar-direct-rc2-pull-btn');

  const directSyncBtn = directBtn || document.getElementById('direct-rc2-sync-btn');

  const directPullBtn = pullBtn || document.getElementById('direct-rc2-pull-btn');

  const directPullLogBtn = document.getElementById('direct-rc2-pull-log-btn');

  const directBrowseLogsBtn = document.getElementById('direct-rc2-browse-logs-btn');



  if (data.connected) {

    if (headerRc2Badge) {

      headerRc2Badge.textContent = `${devInfo.shortName}: OK`;

      headerRc2Badge.className = 'header-rc2-badge is-connected';

      headerRc2Badge.title = `${devInfo.fullName} Connected over USB MTP`;

    }



    if (sidebarRc2Badge) {

      sidebarRc2Badge.textContent = `${devInfo.shortName}: OK`;

      sidebarRc2Badge.style.background = 'rgba(34, 197, 94, 0.2)';

      sidebarRc2Badge.style.color = '#4ade80';

      sidebarRc2Badge.title = `${devInfo.fullName} Connected over USB MTP`;

    }



    if (sidebarQuickActions) sidebarQuickActions.style.display = 'flex';



    if (sidebarDirectBtn) {

      sidebarDirectBtn.textContent = `Send to ${devInfo.shortName}`;

      sidebarDirectBtn.title = `Send active mission directly to connected ${devInfo.fullName}`;

    }

    if (sidebarPullBtn) {

      sidebarPullBtn.title = `Pull active mission KMZ from connected ${devInfo.fullName}`;

    }

    if (directSyncBtn) {

      directSyncBtn.innerHTML = `

        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">

          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>

        </svg>

        Send to ${devInfo.shortName}

      `;

      directSyncBtn.title = `Send active mission directly to connected ${devInfo.fullName}`;

    }

    if (directPullBtn) {

      directPullBtn.title = `Pull and import active mission KMZ from connected ${devInfo.fullName}`;

    }

    if (directPullLogBtn) {

      directPullLogBtn.innerHTML = `

        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">

          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>

          <polyline points="7 10 12 15 17 10"/>

          <line x1="12" y1="15" x2="12" y2="3"/>

        </svg>

        📥 Pull Flight Log from ${devInfo.shortName}

      `;

      directPullLogBtn.title = `Extract latest flight telemetry log from connected ${devInfo.fullName} over USB`;

    }

    if (directBrowseLogsBtn) {

      directBrowseLogsBtn.innerHTML = `

        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">

          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>

          <polyline points="14 2 14 8 20 8"></polyline>

          <line x1="16" y1="13" x2="8" y2="13"></line>

          <line x1="16" y1="17" x2="8" y2="17"></line>

        </svg>

        📋 Browse ${devInfo.shortName} Logs

      `;

      directBrowseLogsBtn.title = `Browse and pull any flight log from connected ${devInfo.fullName} over USB MTP`;

    }

    if (diagPullBtn) {

      diagPullBtn.textContent = `📥 Pull from ${devInfo.shortName}`;

      diagPullBtn.title = `Pull latest flight log directly from connected ${devInfo.fullName} over USB MTP`;

    }

    if (diagBrowseBtn) {

      diagBrowseBtn.textContent = `📋 ${devInfo.shortName} Logs`;

      diagBrowseBtn.title = `Browse and pull flight logs from connected ${devInfo.fullName}`;

    }

  } else if (data && data.locked) {

    if (headerRc2Badge) {

      headerRc2Badge.textContent = 'Phone Locked';

      headerRc2Badge.className = 'header-rc2-badge is-unplugged';

      headerRc2Badge.title = `${devInfo.fullName} storage is locked or in charging mode`;

    }



    if (sidebarRc2Badge) {

      sidebarRc2Badge.textContent = `${devInfo.shortName}: Locked`;

      sidebarRc2Badge.style.background = 'rgba(234, 179, 8, 0.2)';

      sidebarRc2Badge.style.color = '#fde047';

      sidebarRc2Badge.title = `${devInfo.fullName} storage is locked. Select 'Transferring files'`;

    }



    if (sidebarQuickActions) sidebarQuickActions.style.display = 'none';

  } else {

    if (headerRc2Badge) {

      headerRc2Badge.textContent = 'RC 2';

      headerRc2Badge.className = 'header-rc2-badge is-unplugged';

      headerRc2Badge.title = 'DJI RC 2 / Phone USB Link: Unplugged';

    }



    if (sidebarRc2Badge) {

      sidebarRc2Badge.textContent = 'RC 2: Unplugged';

      sidebarRc2Badge.style.background = 'rgba(234, 179, 8, 0.15)';

      sidebarRc2Badge.style.color = '#fde047';

      sidebarRc2Badge.title = 'DJI RC 2 / Phone USB Link: Unplugged';

    }



    if (sidebarQuickActions) sidebarQuickActions.style.display = 'none';

  }







  const isDbOnline = (typeof getIsMissionDbOnline === 'function') ? getIsMissionDbOnline() : (typeof isMissionDbOnline !== 'undefined' ? isMissionDbOnline : false);



  if (typeof refreshMissionDbList === 'function' && !isDbOnline) {



    refreshMissionDbList();



  }







  // 4. Update RTMP Ingest & Video status over SSE (Issue #97)



  if (data && data.rtmp) {



    const vc = (typeof window !== 'undefined' && window.videoCastClient) ||



               (typeof global !== 'undefined' && global.videoCastClient) ||



               (typeof videoCastClient !== 'undefined' ? videoCastClient : null);



    if (vc && typeof vc.updateRtmpUI === 'function') {



      vc.updateRtmpUI(data.rtmp);

    }

  }



  if (data && data.videoDevices) {

    const vc = (typeof window !== 'undefined' && window.videoCastClient) ||

               (typeof global !== 'undefined' && global.videoCastClient) ||

               (typeof videoCastClient !== 'undefined' ? videoCastClient : null);

    if (vc && typeof vc.updateDevicesUI === 'function') {

      vc.updateDevicesUI(data.videoDevices);

    }

  }

}



function connectCompanionStatusStream() {



  if (!isCompanionOnline) return;



  const EventSourceCtor = (typeof window !== 'undefined' && window.EventSource) || (typeof EventSource !== 'undefined' && EventSource) || null;



  if (!EventSourceCtor) {



    isCompanionStatusStreaming = false;



    updateCompanionTransportUI('polling');



    return;



  }







  const url = buildAuthenticatedCompanionUrl('/api/status/stream');







  if (companionStatusEventSource) {



    try { companionStatusEventSource.close(); } catch (_) {}



    companionStatusEventSource = null;



  }







  try {



    companionStatusEventSource = new EventSourceCtor(url);







    companionStatusEventSource.onopen = () => {



      isCompanionStatusStreaming = true;



      consecutiveStatusFailures = 0;



      updateCompanionTransportUI('sse');



    };







    companionStatusEventSource.onmessage = (event) => {



      if (!event || !event.data) return;



      try {



        const data = JSON.parse(event.data);



        isCompanionStatusStreaming = true;



        isCompanionOnline = true;



        consecutiveStatusFailures = 0;



        lastStatusCheckTime = Date.now();



        if (typeof data.droneCount === 'number') {



          remoteIdDroneCount = data.droneCount;



        }



        applyCompanionStatusUI(data);



        updateCompanionTransportUI('sse');



        if (typeof CompanionAuth !== 'undefined' && typeof CompanionAuth.onStatusUpdate === 'function') {

          CompanionAuth.onStatusUpdate(data);

        }



      } catch (e) {}



    };







    companionStatusEventSource.addEventListener('auth_updated', () => {

      if (typeof CompanionAuth !== 'undefined' && typeof CompanionAuth.fetchCurrentProfile === 'function') {

        CompanionAuth.fetchCurrentProfile().catch(() => {});

      }

    });



    companionStatusEventSource.onerror = () => {



      isCompanionStatusStreaming = false;



      updateCompanionTransportUI('polling');



      scheduleNextStatusCheck();



    };



  } catch (e) {



    isCompanionStatusStreaming = false;



    updateCompanionTransportUI('polling');



    scheduleNextStatusCheck();



  }



}







function disconnectCompanionStatusStream() {



  if (companionStatusEventSource) {



    try { companionStatusEventSource.close(); } catch (_) {}



    companionStatusEventSource = null;



  }



  isCompanionStatusStreaming = false;



  updateCompanionTransportUI('disconnected');



}







async function pollCompanionStatus() {



  if (typeof document === 'undefined') return;



  const sDot = document.getElementById('companion-service-dot');



  const sText = document.getElementById('companion-service-text');



  const sLabel = document.getElementById('companion-service-label');



  const uDot = document.getElementById('companion-usb-dot');



  const uText = document.getElementById('companion-usb-text');



  const uLabel = document.getElementById('companion-usb-label');







  // Legacy alias elements for backward compatibility



  const dot = document.getElementById('companion-indicator-dot');



  const text = document.getElementById('companion-status-text');



  const label = document.getElementById('companion-device-label');







  const directActions = document.getElementById('rc2-direct-actions');



  const directBtn = document.getElementById('direct-rc2-sync-btn');



  const pullBtn = document.getElementById('direct-rc2-pull-btn');



  const container = document.getElementById('companion-sync-container');



  const hint = document.getElementById('companion-offline-hint');



  const diagPullBtn = document.getElementById('diag-pull-rc2-btn');
  const diagBrowseBtn = document.getElementById('diag-browse-rc2-logs-btn');

  // On Native Android container without an explicit remote companion host,
  // hardware status is updated directly via native Android bridge events and window.AalaapiAndroid.
  if (typeof Platform !== 'undefined' && typeof Platform.isNativeAndroid === 'function' && Platform.isNativeAndroid()) {
    const customHost = (typeof localStorage !== 'undefined') ? localStorage.getItem('aalaapi-companion-host') : null;
    const isLocalhost = !customHost || customHost.includes('127.0.0.1') || customHost.includes('localhost');
    if (isLocalhost) {
      if (typeof window !== 'undefined' && window.AalaapiAndroid && typeof window.AalaapiAndroid.getMtpStatus === 'function') {
        try {
          const rawStatus = window.AalaapiAndroid.getMtpStatus();
          const parsed = typeof rawStatus === 'string' ? JSON.parse(rawStatus) : rawStatus;
          if (parsed && typeof parsed.connected === 'boolean') {
            isRc2MtpConnected = parsed.connected;
          }
        } catch (_) {}
      }
      updateNativeAndroidStatusUI();
      scheduleNextStatusCheck();
      return;
    }
  }

  try {



    const controller = new AbortController();



    const timeoutId = setTimeout(() => controller.abort(), 4000);



    const res = await fetch(`${COMPANION_API_BASE}/api/status`, { signal: controller.signal, headers: getCompanionAuthHeaders() });



    clearTimeout(timeoutId);







    if (res.ok) {



      const data = await res.json();



      const wasOffline = !isCompanionOnline;



      isCompanionOnline = true;



      consecutiveStatusFailures = 0;



      lastStatusCheckTime = Date.now();



      if (data.status === 'auth_required' || (data.authRequired && !data.authenticated)) {

        applyCompanionStatusUI(data);

        return;

      }



      if (typeof data.droneCount === 'number') {

        remoteIdDroneCount = data.droneCount;

      }



      applyCompanionStatusUI(data);



      if (typeof AmbientBufferManager !== 'undefined' && typeof AmbientBufferManager.fetchBufferMetrics === 'function') {



        AmbientBufferManager.fetchBufferMetrics().catch(() => {});



      }







      if (!isCompanionStatusStreaming && typeof connectCompanionStatusStream === 'function') {



        connectCompanionStatusStream();



      }



      if (typeof RemoteIdRadar !== 'undefined' && !RemoteIdRadar.streamConnected && typeof RemoteIdRadar.connectStream === 'function') {



        RemoteIdRadar.connectStream();



      }







      if (wasOffline) {



        if (typeof CompanionAuth !== 'undefined' && typeof CompanionAuth.onCompanionOnline === 'function') {

          CompanionAuth.onCompanionOnline();

        }



        consecutiveRadarFailures = 0;



        if (typeof RemoteIdRadar !== 'undefined' && !RemoteIdRadar.streamConnected && RemoteIdRadar.pollAirspace) {



          RemoteIdRadar.pollAirspace();



        }



        if (typeof scheduleNextRadarCheck === 'function') {



          scheduleNextRadarCheck();



        }



      } else if (!companionRadarTimer && typeof scheduleNextRadarCheck === 'function' && getRadarPollDelay() !== null) {



        scheduleNextRadarCheck();



      }



    } else {



      throw new Error('Non-200 status');



    }



  } catch (e) {



    if (typeof Platform !== 'undefined' && Platform.isNativeAndroid()) {

      updateNativeAndroidStatusUI();

      return;

    }



    const wasMissionDbOnline = (typeof getIsMissionDbOnline === 'function') ? getIsMissionDbOnline() : (typeof isMissionDbOnline !== 'undefined' ? isMissionDbOnline : false);



    consecutiveStatusFailures++;



    lastStatusCheckTime = Date.now();



    isCompanionOnline = false;



    isRc2MtpConnected = false;



    if (companionStatusEventSource) {



      try { companionStatusEventSource.close(); } catch (_) {}



      companionStatusEventSource = null;



    }



    isCompanionStatusStreaming = false;



    updateCompanionTransportUI('offline');



    if (wasMissionDbOnline && typeof refreshMissionDbList === 'function') {



      refreshMissionDbList();



    }



    if (typeof RemoteIdRadar !== 'undefined' && RemoteIdRadar.disconnectStream) {



      RemoteIdRadar.disconnectStream();



    }



    if (companionRadarTimer) {



      clearTimeout(companionRadarTimer);



      companionRadarTimer = null;



    }



    if (container && container.classList) container.classList.add('is-offline');



    if (hint) {



      hint.style.display = 'flex';



      const labelSpan = (typeof hint.querySelector === 'function') ? hint.querySelector('span:first-child') : null;



      if (labelSpan) {



        labelSpan.innerHTML = `



          <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>



          Aalaapi Bridge Offline &bull; Setup Guide`;



      }



    }







    // 1. Service Offline



    const mismatchAlert = document.getElementById('companion-version-mismatch-alert');



    if (mismatchAlert) mismatchAlert.style.display = 'none';



    if (sDot) sDot.style.background = '#64748b'; // Gray



    if (sText) {



      sText.textContent = 'Aalaapi Bridge: Offline';



      sText.style.color = 'var(--text-main)';



    }



    if (sLabel) sLabel.textContent = 'start-bridge.bat';



    const bStats = document.getElementById('bridge-cache-stats-text');



    if (bStats) bStats.textContent = 'Bridge offline';



    if (typeof updateMcpMonitorUI === 'function') updateMcpMonitorUI(null, false);







    // 2. USB Link Waiting



    if (uDot) uDot.style.background = '#64748b'; // Gray



    if (uText) {



      uText.textContent = 'RC 2 USB Link: Waiting';



      uText.style.color = 'var(--text-muted)';



    }



    if (uLabel) uLabel.textContent = 'Service Required';







    // Legacy compatibility



    if (dot) dot.style.background = '#64748b';



    if (text) {



      text.textContent = 'Aalaapi Bridge Offline';



      text.style.color = 'var(--text-main)';



    }



    if (label) label.textContent = 'start-bridge.bat';







    if (directActions) directActions.style.display = 'none';



    if (directBtn) directBtn.style.display = 'none';



    if (pullBtn) pullBtn.style.display = 'none';



    if (diagPullBtn) diagPullBtn.style.display = 'none';



    if (diagBrowseBtn) diagBrowseBtn.style.display = 'none';







    // 3. Update Top Nav Info Node & Sidebar Summary Bar (Issue #128)



    const headerPill = document.getElementById('header-bridge-pill');



    const headerDot = document.getElementById('header-bridge-dot');



    const headerSummary = document.getElementById('header-bridge-summary');



    const headerRc2Badge = document.getElementById('header-rc2-summary-badge');



    const sidebarBar = document.getElementById('sidebar-bridge-summary-bar');



    const sidebarDot = document.getElementById('sidebar-bridge-mini-dot');



    const sidebarLabel = document.getElementById('sidebar-bridge-mini-label');



    const sidebarRc2Badge = document.getElementById('sidebar-rc2-mini-badge');



    const sidebarQuickActions = document.getElementById('sidebar-rc2-quick-actions');







    if (headerPill) {



      headerPill.classList.remove('is-online');



      headerPill.classList.add('is-offline');



    }



    if (headerDot) headerDot.style.background = '#64748b';



    if (headerSummary) headerSummary.textContent = 'Bridge: Offline';



    if (headerRc2Badge) {



      headerRc2Badge.textContent = 'RC 2';



      headerRc2Badge.className = 'header-rc2-badge';



    }



    if (sidebarBar) {



      sidebarBar.classList.remove('is-online');



      sidebarBar.classList.add('is-offline');



    }



    if (sidebarDot) sidebarDot.style.background = '#64748b';



    if (sidebarLabel) sidebarLabel.textContent = 'Aalaapi Bridge: Offline';



    if (sidebarRc2Badge) {



      sidebarRc2Badge.textContent = 'RC 2';



      sidebarRc2Badge.style.background = 'rgba(100, 116, 139, 0.2)';



      sidebarRc2Badge.style.color = '#94a3b8';



    }



    if (sidebarQuickActions) sidebarQuickActions.style.display = 'none';



  }



}







async function pullFromRC2() {



  const pullBtn = document.getElementById('direct-rc2-pull-btn');



  if (!pullBtn || !isRc2MtpConnected) return;







  const originalContent = pullBtn.innerHTML;



  pullBtn.disabled = true;



  pullBtn.innerHTML = `<span>⏳ Pulling...</span>`;







  try {



    const targetUuid = getRC2UUID() || rc2MtpActiveUUID || '';
    const nativeKmzPull = (typeof Platform !== 'undefined' && typeof Platform.pullKmzFromController === 'function')
      ? Platform.pullKmzFromController(targetUuid)
      : { handled: false };

    if (nativeKmzPull && nativeKmzPull.handled) {
      const rawRes = typeof nativeKmzPull.rawRes === 'string' ? JSON.parse(nativeKmzPull.rawRes) : nativeKmzPull.rawRes;
      if (rawRes && rawRes.success && (rawRes.data || rawRes.base64 || rawRes.kmz)) {
        const b64 = rawRes.data || rawRes.base64 || rawRes.kmz;
        const binStr = atob(b64);
        const len = binStr.length;
        const u8 = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          u8[i] = binStr.charCodeAt(i);
        }
        const kmzBlob = new Blob([u8], { type: 'application/vnd.google-earth.kmz' });
        if (typeof importKMZFile === 'function') {
          await importKMZFile(kmzBlob);
        } else if (typeof loadKMZBlob === 'function') {
          await loadKMZBlob(kmzBlob);
        }
        if (typeof showToast === 'function') {
          showToast(`📥 Mission pulled from DJI RC 2 slot [${(rawRes.uuid || targetUuid).substring(0, 8)}...]`, 'success');
        }
      } else {
        throw new Error((rawRes && rawRes.message) || 'No active mission KMZ found on RC 2');
      }
      pullBtn.disabled = false;
      pullBtn.innerHTML = originalContent;
      return;
    }



    const query = targetUuid ? `?uuid=${encodeURIComponent(targetUuid)}` : '';



    const res = await fetch(`${COMPANION_API_BASE}/api/pull-mission${query}`);



    const data = await res.json();







    if (data.success) {



      if (data.uuid) {



        setRC2UUID(data.uuid);



      }



      importedFileName = data.fileName || `${data.uuid || 'mission'}.kmz`;



      const statusText = document.getElementById('import-status-text');



      if (statusText) {



        statusText.textContent = `Imported ${importedFileName}`;



      }







      if (data.waylinesWpml) {



        parseWPML(data.waylinesWpml);



      } else {



        throw new Error('No waylines.wpml received from RC 2');



      }







      pullBtn.innerHTML = `<span>✅ Pulled ${data.uuid ? data.uuid.substring(0, 8) + '...' : ''}</span>`;



      pullBtn.style.background = 'rgba(168, 85, 247, 0.25)';



      pullBtn.style.borderColor = 'rgba(168, 85, 247, 0.6)';



      pullBtn.style.color = '#c084fc';



      setTimeout(() => {



        pullBtn.disabled = false;



        pullBtn.innerHTML = originalContent;



        pullBtn.style.background = '';



        pullBtn.style.borderColor = '';



        pullBtn.style.color = '';



      }, 4000);



    } else {



      throw new Error(data.error || 'Failed to pull mission from RC 2');



    }



  } catch (err) {



    console.error('Direct RC 2 Pull Error:', err);



    pullBtn.innerHTML = `<span>❌ Pull Failed</span>`;



    pullBtn.style.color = '#f87171';



    setTimeout(() => {



      pullBtn.disabled = false;



      pullBtn.innerHTML = originalContent;



      pullBtn.style.color = '';



    }, 3000);



  }



}







async function pullFlightLogFromRC2(targetBtn = null) {



  const primaryBtn = targetBtn || document.getElementById('diag-pull-rc2-btn') || document.getElementById('direct-rc2-pull-log-btn') || document.getElementById('android-rc2-pull-log-btn');



  const diagBtn = document.getElementById('diag-pull-rc2-btn');



  const directBtn = document.getElementById('direct-rc2-pull-log-btn');



  const syncBarBtn = document.getElementById('android-rc2-pull-log-btn');



  const buttonsToUpdate = Array.from(new Set([primaryBtn, diagBtn, directBtn, syncBarBtn].filter(Boolean)));







  const originalStates = new Map();

  buttonsToUpdate.forEach(b => {
    originalStates.set(b, { html: b.innerHTML, color: b.style?.color });
    b.disabled = true;
    if (typeof b.setAttribute === 'function') b.setAttribute('aria-busy', 'true');
    if (b.classList && typeof b.classList.add === 'function') b.classList.add('diag-btn-working');
    b.innerHTML = `<span>⏳ Pulling Log...</span>`;
  });

  if (typeof FlightDiagnostics !== 'undefined' && FlightDiagnostics.isOpen && typeof FlightDiagnostics.setWorkingState === 'function') {
    FlightDiagnostics.setWorkingState(true, 'Pulling flight log from DJI RC 2...', 'Connecting over USB MTP & decrypting');
  }

  const resetButtonStates = (delayMs = 3500) => {
    setTimeout(() => {
      buttonsToUpdate.forEach(b => {
        const orig = originalStates.get(b);
        if (orig) {
          b.disabled = false;
          if (typeof b.removeAttribute === 'function') b.removeAttribute('aria-busy');
          if (b.classList && typeof b.classList.remove === 'function') b.classList.remove('diag-btn-working');
          b.innerHTML = orig.html;
          b.style.color = orig.color || '';
        }
      });
      if (typeof FlightDiagnostics !== 'undefined' && FlightDiagnostics.isOpen && typeof FlightDiagnostics.setWorkingState === 'function') {
        FlightDiagnostics.setWorkingState(false);
      }
    }, delayMs);
  };







  try {



    const nativeLogPull = (typeof Platform !== 'undefined' && typeof Platform.pullLatestLogFromController === 'function')
      ? Platform.pullLatestLogFromController()
      : { handled: false };

    if (nativeLogPull && nativeLogPull.handled) {

      const rawRes = nativeLogPull.rawRes;

      if (!rawRes) {

        throw new Error('No flight logs found on connected RC 2');

      }

      let logPayload = null;

      let logBase64 = null;

      let logFilename = 'FlightRecord_latest.txt';



      try {

        logPayload = JSON.parse(rawRes);

      } catch (_) {

        logBase64 = rawRes;

      }



      if (logPayload) {

        if (!logPayload.success) {

          const errCode = logPayload.error || 'UNKNOWN';

          const errMsg = logPayload.message || 'RC 2 flight log pull failed';

          if (errCode === 'NO_RC2_CONNECTED') {

            if (typeof showToast === 'function') {

              showToast('🔌 No RC 2 controller detected via USB-C. Connect RC 2 or use "Load File".', 'warning', 6000);

            }

          } else if (errCode === 'RC2_PERMISSION_REQUIRED') {

            if (typeof showToast === 'function') {

              showToast('🔒 USB MTP permission required to access RC 2 logs.', 'warning', 6000);

            }

          } else {

            if (typeof showToast === 'function') {

              showToast(`⚠️ ${errMsg}`, 'warning', 5000);

            }

          }

          throw new Error(errMsg);

        }

        logBase64 = logPayload.data || logPayload.base64;

        logFilename = logPayload.filename || logFilename;

      }



      if (logBase64) {

        let parseSuccess = false;
        if (typeof DigitalTwin !== 'undefined' && typeof DigitalTwin.loadFlightLogData === 'function') {

          parseSuccess = await DigitalTwin.loadFlightLogData(logFilename, logBase64);

        } else if (typeof atob === 'function' && typeof DjiLogDecryptor !== 'undefined' && typeof DjiLogDecryptor.parseLogText === 'function') {

          const rawText = atob(logBase64);

          const parsed = DjiLogDecryptor.parseLogText(rawText, logFilename);
          parseSuccess = !!(parsed && parsed.points && parsed.points.length > 0);

        }

        if (!parseSuccess || (typeof DigitalTwin !== 'undefined' && !DigitalTwin.telemetryData)) {
          throw new Error(`Unable to decode flight trajectory from ${logFilename}`);
        }

        try {
          if (typeof localStorage !== 'undefined') {
            const existingJson = localStorage.getItem('aalaapi_historical_flights');
            let flightsList = existingJson ? JSON.parse(existingJson) : [];
            flightsList = flightsList.filter(f => f.filename !== logFilename);
            flightsList.unshift({
              id: logFilename,
              filename: logFilename,
              flightDate: (logPayload && (logPayload.flightDate || logPayload.mtimeFormatted)) || new Date().toISOString().replace('T', ' ').slice(0, 19),
              mtimeFormatted: (logPayload && (logPayload.flightDate || logPayload.mtimeFormatted)) || new Date().toISOString().replace('T', ' ').slice(0, 19),
              size: (logPayload && logPayload.size) || 0,
              sizeFormatted: (logPayload && (logPayload.sizeFormatted || '')) || '',
              isDecrypted: true,
              source: 'pulled_rc2'
            });
            localStorage.setItem('aalaapi_historical_flights', JSON.stringify(flightsList.slice(0, 50)));
            localStorage.setItem('aalaapi_offline_flight_' + logFilename, logBase64);
          }
        } catch (_) {}

        if (typeof refreshMissionDbList === 'function') {
          refreshMissionDbList();
        }

        buttonsToUpdate.forEach(b => {

          b.innerHTML = `<span>✅ Log Pulled!</span>`;

          b.style.color = '#4ade80';

        });



        if (typeof showToast === 'function') {

          showToast(`📥 Flight log pulled from DJI RC 2 (${logFilename})`, 'success');

        }



        try {

          if (typeof FlightDiagnostics !== 'undefined' && FlightDiagnostics.open) {

            const telemetryPayload = (typeof DigitalTwin !== 'undefined' && DigitalTwin.telemetryData) ? {
              flightId: logFilename,
              telemetry: DigitalTwin.telemetryData,
              comparison: DigitalTwin.comparisonData,
              isActualFlown: true
            } : logFilename;
            await FlightDiagnostics.open('3d', telemetryPayload);

          }

        } catch (e) {

          console.warn('FlightDiagnostics open error:', e);

        }



        resetButtonStates(3500);

        return { success: true, logName: logFilename };

      } else {

        throw new Error((logPayload && (logPayload.message || logPayload.error)) || 'No flight log data received from RC 2');

      }

    }



    const apiBase = typeof getCompanionApiBase === 'function' ? getCompanionApiBase() : (typeof COMPANION_API_BASE !== 'undefined' ? COMPANION_API_BASE : 'http://127.0.0.1:8765');



    



    // Add 20-second timeout signal to avoid hanging indefinitely if companion server blocks



    const fetchOptions = {};



    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {



      fetchOptions.signal = AbortSignal.timeout(20000);



    }







    const res = await fetch(`${apiBase}/api/latest-flight`, fetchOptions);



    const data = await res.json();







    if (data.success && data.data && (data.data.latestLog || data.data.latestKmz)) {



      const logName = data.data.latestLog;



      buttonsToUpdate.forEach(b => {



        b.innerHTML = `<span>✅ Pulled ${logName ? logName.substring(0, 16) + '...' : 'Flight'}</span>`;



        b.style.color = '#38bdf8';



      });







      // Open Flight Diagnostics modal and load the pulled flight log sequentially



      try {



        if (typeof FlightDiagnostics !== 'undefined' && FlightDiagnostics.open) {



          await FlightDiagnostics.open('3d', logName || null);



        }



      } catch (e) {



        console.warn('FlightDiagnostics open error:', e);



      }







      resetButtonStates(3500);



      return { success: true, logName };



    } else {



      throw new Error(data.error || (data.data && data.data.error) || 'No new flight logs found on connected DJI RC 2');



    }



  } catch (err) {



    console.error('Pull Flight Log Error:', (err && (err.stack || err.message)) ? (err.message || err.stack) : err);



    buttonsToUpdate.forEach(b => {



      b.innerHTML = `<span>❌ Pull Failed / Offline</span>`;



      b.style.color = '#f87171';



    });



    resetButtonStates(3000);



    return { success: false, error: err.message };



  }



}







async function sendDirectlyToRC2() {



  const directBtn = document.getElementById('direct-rc2-sync-btn');
const sidebarDirectBtn = document.getElementById('sidebar-direct-rc2-sync-btn');
const dockRc2Btn = document.getElementById('dock-rc2-sync-btn');
const buttonsToUpdate = [directBtn, sidebarDirectBtn, dockRc2Btn].filter(Boolean);



  if (buttonsToUpdate.length === 0 || !isRc2MtpConnected) return;







  const originalContents = new Map();

  buttonsToUpdate.forEach(b => {
    originalContents.set(b, {
      html: b.innerHTML,
      background: b.style ? b.style.background : '',
      borderColor: b.style ? b.style.borderColor : '',
      color: b.style ? b.style.color : '',
      title: b.title || ''
    });
    b.disabled = true;
    const activeDev = getDeviceDisplayInfo(lastDetectedFlightDevice || {});
    b.innerHTML = `<span>⏳ Syncing to ${activeDev.shortName}...</span>`;
  });

  const resetButtonStates = (delayMs = 4000) => {
    setTimeout(() => {
      buttonsToUpdate.forEach(b => {
        const orig = originalContents.get(b);
        b.disabled = false;
        b.innerHTML = (orig && typeof orig === 'object' ? orig.html : orig) || '';
        b.style.background = (orig && orig.background) || '';
        b.style.borderColor = (orig && orig.borderColor) || '';
        b.style.color = (orig && orig.color) || '';
        b.title = (orig && orig.title) || '';
      });
    }, delayMs);
  };

  try {
    const rawWps = (typeof getCurrentWaypoints === 'function' ? getCurrentWaypoints() : null) || [];
    if (!rawWps || rawWps.length === 0) {
      alert("No waypoints generated to sync. Please place a mission or center point first.");
      buttonsToUpdate.forEach(b => {
        const orig = originalContents.get(b);
        b.disabled = false;
        b.innerHTML = (orig && typeof orig === 'object' ? orig.html : orig) || '';
        b.style.background = (orig && orig.background) || '';
        b.style.borderColor = (orig && orig.borderColor) || '';
        b.style.color = (orig && orig.color) || '';
        b.title = (orig && orig.title) || '';
      });
      return;
    }







    const speed = parseFloat(document.getElementById('speed')?.value) || 4;



    const gimbalPitch = parseGimbalPitch(document.getElementById('gimbal-pitch')?.value, -90);



    const waypoints = rawWps.map(wp => ({



      ...wp,



      lat: wp.lat,



      lon: wp.lon,



      alt: wp.alt,



      pitch: wp.pitch !== undefined && wp.pitch !== null ? wp.pitch : gimbalPitch,



      speed: wp.speed !== undefined && wp.speed !== null ? wp.speed : speed,



      heading: wp.heading,



      isRingStart: wp.isRingStart || false,



      ringIndex: wp.ringIndex !== undefined ? wp.ringIndex : null,



      poiIndex: wp.poiIndex !== undefined ? wp.poiIndex : null,



      headingMode: wp.headingMode !== undefined ? wp.headingMode : null



    }));







    const result = await generateKMZBlob(waypoints);



    if (!result || !result.blob) {



      throw new Error('Could not generate mission KMZ');



    }







    const uuid = getRC2UUID() || rc2MtpActiveUUID || '354A8F93-759C-42C3-A8D5-746F79C7622A';



    const kmzBase64 = await blobToBase64(result.blob);



    // If running inside a Native Platform container, transfer directly via Platform.pushKmzToController
    const nativePush = (typeof Platform !== 'undefined' && typeof Platform.pushKmzToController === 'function')
      ? Platform.pushKmzToController(kmzBase64, uuid)
      : (typeof window !== 'undefined' && window.Platform && typeof window.Platform.pushKmzToController === 'function')
        ? window.Platform.pushKmzToController(kmzBase64, uuid)
        : (typeof global !== 'undefined' && global.Platform && typeof global.Platform.pushKmzToController === 'function')
          ? global.Platform.pushKmzToController(kmzBase64, uuid)
          : { handled: false };

    if (nativePush && nativePush.handled) {
      const ok = nativePush.success;
      if (!ok) {
        throw new Error('Native Android MTP transfer rejected.');
      }
      const effectiveSlot = nativePush.slotUuid || uuid;
      buttonsToUpdate.forEach(b => {
        const activeDev = getDeviceDisplayInfo(lastDetectedFlightDevice || {});
        b.innerHTML = (activeDev.shortName === 'RC 2') ? `<span>✅ Synced to DJI RC 2! Re-open in DJI Fly</span>` : `<span>✅ Synced to ${activeDev.shortName}! Re-open in DJI Fly</span>`;
        b.style.background = 'rgba(34, 197, 94, 0.2)';
        b.style.borderColor = 'rgba(34, 197, 94, 0.5)';
        b.style.color = '#4ade80';
      });
      if (typeof showToast === 'function') {
        showToast(`✅ Synced to DJI RC 2 slot [${effectiveSlot.substring(0, 8)}...]! Re-open or restart DJI Fly.`, 'success');
      }
      resetButtonStates(4000);
      return { success: true, slotUuid: effectiveSlot };
    }







    const diagData = buildFlightDiagnosticsJSON(waypoints, {



      altitude: parseFloat(document.getElementById('altitude')?.value) || 50,



      speed,



      gimbalPitch,



      uuid,



      filename: `${uuid}.kmz`,



      validation: result.validation,



      isValid: result.validation ? result.validation.valid : true,



      wpmlXml: result.waylinesWpml,



      templateXml: result.templateKml



    });







    const apiBase = (typeof getCompanionApiBase === 'function') ? getCompanionApiBase() : (typeof COMPANION_API_BASE !== 'undefined' ? COMPANION_API_BASE : 'http://127.0.0.1:8765');







    let requestBodyJson;



    try {



      requestBodyJson = (typeof safeJsonStringify === 'function')



        ? safeJsonStringify({ uuid, kmzBase64, diagData })



        : JSON.stringify({ uuid, kmzBase64, diagData }, (k, v) => {



            if (typeof k === 'string' && (k.startsWith('_') || k === 'marker' || k === 'mapMarker' || k === 'element')) return undefined;



            if (typeof v === 'object' && v !== null && typeof HTMLElement !== 'undefined' && v instanceof HTMLElement) return undefined;



            return v;



          });



    } catch (_) {



      requestBodyJson = JSON.stringify({ uuid, kmzBase64 });



    }







    const fetchOptions = {

      method: 'POST',

      headers: { 'Content-Type': 'application/json', ...getCompanionAuthHeaders() },



      body: requestBodyJson



    };



    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {



      fetchOptions.signal = AbortSignal.timeout(50000);



    }







    const res = await fetch(`${apiBase}/api/sync`, fetchOptions);



    let data;



    try {



      data = await res.json();



    } catch (_) {



      throw new Error(res.ok ? 'Malformed server response' : `Bridge HTTP ${res.status}: ${res.statusText}`);



    }







    if (data.success) {



      buttonsToUpdate.forEach(b => {



        const activeDev = getDeviceDisplayInfo(lastDetectedFlightDevice || {});

        b.innerHTML = (activeDev.shortName === 'RC 2') ? `<span>✅ Synced to DJI RC 2! Re-open in DJI Fly</span>` : `<span>✅ Synced to ${activeDev.shortName}! Re-open in DJI Fly</span>`;



        b.style.background = 'rgba(34, 197, 94, 0.2)';



        b.style.borderColor = 'rgba(34, 197, 94, 0.5)';



        b.style.color = '#4ade80';



      });







      if (typeof showToast === 'function') {



        const activeDev = getDeviceDisplayInfo(lastDetectedFlightDevice || {});

        showToast(`✅ Synced to ${activeDev.fullName} slot ${uuid}! Re-open in DJI Fly.`, 'success');



      }







      // Also archive the mission diagnostics in SQLite



      try {



        if (diagData && (!diagData.isValid || (diagData.validationErrors && diagData.validationErrors.length > 0))) {



          try {



            if (typeof localStorage !== 'undefined') {



              const rawHist = localStorage.getItem('aalaapi_bad_kmz_history');



              const badHist = rawHist ? JSON.parse(rawHist) : [];



              badHist.unshift({



                uuid: diagData.uuid,



                filename: diagData.filename,



                created_at: diagData.createdAt,



                flight_pattern: diagData.flightPattern,



                waypoint_count: diagData.summary?.waypointCount || waypoints.length,



                validation_rules_passed: diagData.validationRulesPassed,



                validation_errors: diagData.validationErrors,



                is_valid: 0,



                execution_status: 'invalid'



              });



              localStorage.setItem('aalaapi_bad_kmz_history', JSON.stringify(badHist.slice(0, 20)));



            }



          } catch (storageErr) {}



        }







        let diagArchiveBody;



        try {



          diagArchiveBody = (typeof safeJsonStringify === 'function')



            ? safeJsonStringify(diagData)



            : JSON.stringify(diagData);



        } catch (_) {}







        if (diagArchiveBody) {



          await fetch(`${apiBase}/api/diagnostics/archive`, {



            method: 'POST',



            headers: { 'Content-Type': 'application/json' },



            body: diagArchiveBody



          }).catch(() => {});



        }







        if (typeof FlightDiagnostics !== 'undefined' && FlightDiagnostics.refreshFlightList) {



          FlightDiagnostics.refreshFlightList();



        }



      } catch (e) {}







      resetButtonStates(4000);

    } else {



      throw new Error(data.error || 'Transfer failed');



    }



  } catch (err) {
    console.error('Direct RC 2 Sync Error:', err);



    if (typeof window !== 'undefined' && window.location && window.location.protocol === 'file:') {



      console.warn('[RC 2 Direct Sync] Browser security policy may restrict network calls from file:/// origins. Open http://127.0.0.1:8765 in your browser to run Aalaapi Sky with direct same-origin companion access.');



    }



    const errText = err.message || 'Sync Failed';



    const displayErr = errText.length > 25 ? (errText.substring(0, 22) + '...') : errText;



    buttonsToUpdate.forEach(b => {



      b.innerHTML = `<span>❌ ${displayErr}</span>`;



      b.title = `Sync Error: ${errText}`;



      b.style.color = '#f87171';



    });



    if (typeof showToast === 'function') {



      showToast(`RC 2 Sync Error: ${errText}`, 'error');
    }

    resetButtonStates(4500);
  }



}







// ─── Adaptive WebUSB Sync Handler (Android / ChromeOS) ──────────────────────







/**



 * Directly pushes the active mission KMZ to a connected DJI RC 2 over WebUSB MTP



 */



async function sendDirectlyViaWebUsb() {



  const webUsbBtn = document.getElementById('webusb-sync-btn');



  const originalHtml = webUsbBtn ? webUsbBtn.innerHTML : '';



  if (webUsbBtn) {



    webUsbBtn.disabled = true;



    webUsbBtn.innerHTML = '<span>⏳ Connecting USB...</span>';



  }







  try {



    const rawWps = (typeof getCurrentWaypoints === 'function' ? getCurrentWaypoints() : null) || [];



    if (!rawWps || rawWps.length === 0) {



      alert("No waypoints generated to sync. Please place a mission or center point first.");



      if (webUsbBtn) {



        webUsbBtn.disabled = false;



        webUsbBtn.innerHTML = originalHtml;



      }



      return;



    }







    const speed = parseFloat(document.getElementById('speed')?.value) || 4;



    const gimbalPitch = (typeof parseGimbalPitch === 'function')



      ? parseGimbalPitch(document.getElementById('gimbal-pitch')?.value, -90)



      : (parseFloat(document.getElementById('gimbal-pitch')?.value) || -90);







    const waypoints = rawWps.map(wp => ({



      ...wp,



      lat: wp.lat,



      lon: wp.lon,



      alt: wp.alt,



      pitch: wp.pitch !== undefined && wp.pitch !== null ? wp.pitch : gimbalPitch,



      speed: wp.speed !== undefined && wp.speed !== null ? wp.speed : speed,



      heading: wp.heading,



      isRingStart: wp.isRingStart || false,



      ringIndex: wp.ringIndex !== undefined ? wp.ringIndex : null,



      poiIndex: wp.poiIndex !== undefined ? wp.poiIndex : null,



      headingMode: wp.headingMode !== undefined ? wp.headingMode : null



    }));







    if (webUsbBtn) webUsbBtn.innerHTML = '<span>⏳ Building KMZ...</span>';



    const result = await generateKMZBlob(waypoints);



    if (!result || !result.blob) {



      throw new Error('Could not generate mission KMZ');



    }







    const uuid = getRC2UUID() || rc2MtpActiveUUID || '354A8F93-759C-42C3-A8D5-746F79C7622A';



    const filename = `${uuid}.kmz`;



    const kmzArrayBuffer = await result.blob.arrayBuffer();







    if (webUsbBtn) webUsbBtn.innerHTML = '<span>⏳ Writing to RC 2 via MTP...</span>';



    const mtp = (typeof WebUsbMtp !== 'undefined') ? WebUsbMtp : null;



    if (!mtp) {



      throw new Error('WebUSB MTP Engine not loaded.');



    }







    const pushRes = await mtp.pushKmz(filename, kmzArrayBuffer);



    if (pushRes && pushRes.success) {



      if (webUsbBtn) {



        webUsbBtn.innerHTML = '<span>✅ Synced via WebUSB!</span>';



        webUsbBtn.style.color = '#4ade80';



      }



      if (typeof showToast === 'function') {



        showToast(`✅ Synced ${filename} directly to DJI RC 2 over USB OTG!`, 'success');



      }



      setTimeout(() => {



        if (webUsbBtn) {



          webUsbBtn.disabled = false;



          webUsbBtn.innerHTML = originalHtml;



          webUsbBtn.style.color = '';



        }



      }, 4000);



    } else {



      throw new Error('WebUSB MTP push failed');



    }



  } catch (err) {



    console.error('WebUSB Direct Sync Error:', err);



    if (webUsbBtn) {



      webUsbBtn.innerHTML = `<span>❌ ${err.message || 'USB Sync Failed'}</span>`;



      webUsbBtn.style.color = '#f87171';



    }



    if (typeof showToast === 'function') {



      showToast(`WebUSB Error: ${err.message}`, 'error');



    }



    setTimeout(() => {



      if (webUsbBtn) {



        webUsbBtn.disabled = false;



        webUsbBtn.innerHTML = originalHtml;



        webUsbBtn.style.color = '';



      }



    }, 4500);



  }



}







/**



 * Pull flight telemetry log directly via WebUSB



 */



async function pullLogViaWebUsb() {



  const pullLogBtn = document.getElementById('webusb-pull-log-btn');



  const originalHtml = pullLogBtn ? pullLogBtn.innerHTML : '';



  if (pullLogBtn) {



    pullLogBtn.disabled = true;



    pullLogBtn.innerHTML = '<span>⏳ Reading USB...</span>';



  }







  try {



    const mtp = (typeof WebUsbMtp !== 'undefined') ? WebUsbMtp : null;



    if (!mtp) throw new Error('WebUSB MTP Engine not loaded.');



    if (!mtp.isConnected) {



      await mtp.connect();



    }







    if (pullLogBtn) {



      pullLogBtn.innerHTML = '<span>✅ Logs Read Ready</span>';



      pullLogBtn.style.color = '#38bdf8';



    }



    if (typeof showToast === 'function') {



      showToast('Connected to RC 2 over WebUSB. Ready to inspect flight records.', 'info');



    }



    setTimeout(() => {



      if (pullLogBtn) {



        pullLogBtn.disabled = false;



        pullLogBtn.innerHTML = originalHtml;



        pullLogBtn.style.color = '';



      }



    }, 3500);



  } catch (err) {



    console.error('WebUSB Log Pull Error:', err);



    if (pullLogBtn) {



      pullLogBtn.innerHTML = `<span>❌ ${err.message || 'Failed'}</span>`;



      pullLogBtn.style.color = '#f87171';



    }



    setTimeout(() => {



      if (pullLogBtn) {



        pullLogBtn.disabled = false;



        pullLogBtn.innerHTML = originalHtml;



        pullLogBtn.style.color = '';



      }



    }, 3500);



  }



}







function blobToBase64(blob) {



  if (!blob) return Promise.resolve('');



  if (typeof FileReader !== 'undefined') {



    return new Promise((resolve, reject) => {



      const reader = new FileReader();



      reader.onloadend = () => {



        const base64String = reader.result ? reader.result.split(',')[1] : '';



        resolve(base64String);



      };



      reader.onerror = reject;



      reader.readAsDataURL(blob);



    });



  }



  if (typeof Buffer !== 'undefined') {



    if (blob instanceof Uint8Array || Buffer.isBuffer(blob)) {



      return Promise.resolve(Buffer.from(blob).toString('base64'));



    }



    if (typeof blob.arrayBuffer === 'function') {



      return blob.arrayBuffer().then(buf => Buffer.from(buf).toString('base64'));



    }



  }



  return Promise.resolve('');



}







// ─── DJI Fly UUID Settings ───────────────────────────────────────────────────







const RC2_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;



const RC2_UUID_LS_KEY  = 'aalaapi-rc2-uuid';







function getRC2UUID() {



  try {



    return (typeof localStorage !== 'undefined' && localStorage.getItem) ? (localStorage.getItem(RC2_UUID_LS_KEY) || '') : '';



  } catch (e) {



    return '';



  }



}







function setRC2UUID(uuid) {



  try {



    if (typeof localStorage !== 'undefined' && localStorage.setItem) {



      localStorage.setItem(RC2_UUID_LS_KEY, uuid);



    }



  } catch (e) {}



  const input = typeof document !== 'undefined' ? document.getElementById('rc2-uuid') : null;



  const preview = typeof document !== 'undefined' ? document.getElementById('rc2-uuid-preview') : null;



  if (input && input.value !== uuid) input.value = uuid;



  if (preview) preview.textContent = uuid || '[UUID]';



}







function clearRC2UUID() {



  try {



    if (typeof localStorage !== 'undefined' && localStorage.removeItem) {



      localStorage.removeItem(RC2_UUID_LS_KEY);



    }



  } catch (e) {}



  const input = typeof document !== 'undefined' ? document.getElementById('rc2-uuid') : null;



  const preview = typeof document !== 'undefined' ? document.getElementById('rc2-uuid-preview') : null;



  if (input) input.value = '';



  if (preview) preview.textContent = '[UUID]';



}







function initRC2Controls() {



  // Restore stored UUID into the input field



  const storedUuid = getRC2UUID();



  if (storedUuid) setRC2UUID(storedUuid);







  // UUID input → localStorage live sync



  const uuidInput = document.getElementById('rc2-uuid');



  if (uuidInput) {



    uuidInput.addEventListener('input', () => {



      const v = uuidInput.value.trim();



      if (RC2_UUID_PATTERN.test(v)) {



        setRC2UUID(v);



      } else {



        const preview = document.getElementById('rc2-uuid-preview');



        if (preview) preview.textContent = v || '[UUID]';



      }



    });



    uuidInput.addEventListener('blur', () => {



      const v = uuidInput.value.trim();



      if (v && !RC2_UUID_PATTERN.test(v)) {



        uuidInput.style.outline = '2px solid #ef4444';



        setTimeout(() => uuidInput.style.outline = '', 1500);



      }



    });



  }







  // Clear button



  const clearBtn = document.getElementById('rc2-uuid-clear');



  if (clearBtn) clearBtn.addEventListener('click', clearRC2UUID);







  // Direct RC 2 sync button
const directSyncBtn = document.getElementById('direct-rc2-sync-btn');
if (directSyncBtn) {
  directSyncBtn.addEventListener('click', () => withPreflightGate(sendDirectlyToRC2));
}

// Bottom Sticky Dock Direct RC 2 Sync button (v1.237.0 - Issue #266)
const dockRc2Btn = document.getElementById('dock-rc2-sync-btn');
if (dockRc2Btn) {
  dockRc2Btn.addEventListener('click', () => {
    if (isRc2MtpConnected) {
      withPreflightGate(sendDirectlyToRC2);
    } else if (typeof WebUsbMtp !== 'undefined' && !isCompanionOnline && (typeof getSyncPlatform === 'function' && (getSyncPlatform() === 'android' || getSyncPlatform() === 'chromeos'))) {
      withPreflightGate(sendDirectlyViaWebUsb);
    } else {
      if (typeof showToast === 'function') {
        showToast('🔌 Connect DJI RC 2 via USB-C or start Aalaapi Bridge to sync directly.', 'warning', 5000);
      }
      if (typeof openRC2GuideModal === 'function') {
        openRC2GuideModal(isCompanionOnline ? 'usb' : 'service');
      }
    }
  });
}







  // Direct RC 2 pull button



  const directPullBtn = document.getElementById('direct-rc2-pull-btn');



  if (directPullBtn) {



    directPullBtn.addEventListener('click', pullFromRC2);



  }







  // Direct RC 2 pull flight log button



  const directPullLogBtn = document.getElementById('direct-rc2-pull-log-btn');



  if (directPullLogBtn) {



    directPullLogBtn.addEventListener('click', () => pullFlightLogFromRC2(directPullLogBtn));



  }







  // Direct RC 2 browse all flight logs button



  const directBrowseLogsBtn = document.getElementById('direct-rc2-browse-logs-btn');



  if (directBrowseLogsBtn) {



    directBrowseLogsBtn.addEventListener('click', openRc2LogManagerModal);



  }







  // WebUSB Direct Sync Buttons (Android / ChromeOS OTG)



  const webUsbSyncBtn = document.getElementById('webusb-sync-btn');



  if (webUsbSyncBtn) {



    webUsbSyncBtn.addEventListener('click', () => withPreflightGate(sendDirectlyViaWebUsb));



  }







  const webUsbPullLogBtn = document.getElementById('webusb-pull-log-btn');



  if (webUsbPullLogBtn) {



    webUsbPullLogBtn.addEventListener('click', pullLogViaWebUsb);



  }







  // Adaptive sync container visibility check based on OS platform



  const syncPlatform = getSyncPlatform();



  const webUsbContainer = document.getElementById('webusb-direct-actions');



  if (webUsbContainer) {



    if (syncPlatform === 'android' || syncPlatform === 'chromeos') {



      webUsbContainer.style.display = 'flex';



    } else {



      webUsbContainer.style.display = 'none';



    }



  }







  // Companion auto-restart button (for version mismatch sync when bridge is outdated)



  const companionRestartBtn = document.getElementById('companion-restart-btn');



  if (companionRestartBtn) {



    companionRestartBtn.addEventListener('click', restartCompanionBridge);



  }







  // Companion web app reload button (for version mismatch sync when web app is outdated)



  const companionReloadBtn = document.getElementById('companion-reload-btn');



  if (companionReloadBtn) {



    companionReloadBtn.addEventListener('click', () => {



      if (typeof window !== 'undefined' && window.location && typeof window.location.reload === 'function') {



        window.location.reload();



      }



    });



  }







  // Initialize Flight Diagnostics Engine



  FlightDiagnostics.init();







  // Initialize Remote ID Airspace Radar



  RemoteIdRadar.init();







  // Initialize Manned Aircraft ADS-B Radar (Issue #92)



  if (typeof AdsbAirspaceManager !== 'undefined' && AdsbAirspaceManager.init) {



    AdsbAirspaceManager.init();



  }







  // Initialize Preflight Safety Checklist Gate



  if (typeof initPreflightEventListeners === 'function') {



    initPreflightEventListeners();



  }







  // Start polling Companion service status & Remote ID radar with adaptive backoff & visibility gating



  initCompanionPolling();



  if (typeof flushOfflinePreflightQueue === 'function') {



    flushOfflinePreflightQueue();



  }



}







let companionStatusTimer = null;



let companionRadarTimer = null;



let isCompanionPollingActive = false;







function getStatusPollDelay() {



  if (typeof document !== 'undefined' && document.hidden) {



    return 60000; // Dormant 60s heartbeat when browser tab is hidden/minimized



  }



  if (!isCompanionOnline) {



    // Stepped adaptive backoff when offline



    if (consecutiveStatusFailures <= 3) return 6000;   // 1st-3rd retry: 6s (fast recovery during server restart)



    if (consecutiveStatusFailures <= 8) return 15000;  // 4th-8th retry: 15s



    if (consecutiveStatusFailures <= 15) return 30000; // 9th-15th retry: 30s



    return 60000; // >15 failures: 60s dormant heartbeat



  }



  return 8000; // Normal online status check: 8s



}







function getRadarPollDelay() {



  if (typeof document !== 'undefined' && document.hidden) {



    return null; // Pause drone radar when tab is hidden



  }



  if (!isCompanionOnline) {



    return null; // Companion is offline: drones endpoint is guaranteed down, DO NOT poll!



  }



  if (consecutiveRadarFailures >= 2) {



    return 10000; // Drone radar requests timing out/failing: back off to 10s



  }



  const hasActiveDrones = (typeof RemoteIdRadar !== 'undefined' && RemoteIdRadar.activeDrones && RemoteIdRadar.activeDrones.length > 0) || (remoteIdDroneCount > 0);



  return hasActiveDrones ? 1500 : 5000; // Live GPS telemetry: 1.5s; clear airspace: 5s



}







function scheduleNextStatusCheck() {



  if (typeof window === 'undefined' || !window.setTimeout) return;



  if (companionStatusTimer) clearTimeout(companionStatusTimer);



  if (isCompanionStatusStreaming) {



    companionStatusTimer = null;



    return;



  }



  const statusDelay = getStatusPollDelay();



  companionStatusTimer = setTimeout(async () => {



    await pollCompanionStatus();



    scheduleNextStatusCheck();



  }, statusDelay);



}







function scheduleNextRadarCheck() {



  if (typeof window === 'undefined' || !window.setTimeout) return;



  if (companionRadarTimer) clearTimeout(companionRadarTimer);



  if (typeof RemoteIdRadar !== 'undefined' && RemoteIdRadar && RemoteIdRadar.streamConnected) {



    companionRadarTimer = null;



    return;



  }



  const radarDelay = getRadarPollDelay();



  if (radarDelay === null) {



    companionRadarTimer = null;



    return;



  }



  companionRadarTimer = setTimeout(async () => {



    if (typeof RemoteIdRadar !== 'undefined' && RemoteIdRadar.pollAirspace) {



      await RemoteIdRadar.pollAirspace();



    }



    scheduleNextRadarCheck();



  }, radarDelay);



}







function scheduleNextCompanionChecks() {



  scheduleNextStatusCheck();



  scheduleNextRadarCheck();



}







function wakeCompanionPolling(resetBackoff = true) {



  if (resetBackoff) {



    consecutiveStatusFailures = 0;



    consecutiveRadarFailures = 0;



  }



  if (companionStatusTimer) clearTimeout(companionStatusTimer);



  if (companionRadarTimer) clearTimeout(companionRadarTimer);







  if (!isCompanionStatusStreaming && typeof connectCompanionStatusStream === 'function') {



    connectCompanionStatusStream();



  }



  if (typeof RemoteIdRadar !== 'undefined' && !RemoteIdRadar.streamConnected && typeof RemoteIdRadar.connectStream === 'function') {



    RemoteIdRadar.connectStream();



  }







  return pollCompanionStatus().then(() => {



    scheduleNextCompanionChecks();



    if (typeof RemoteIdRadar !== 'undefined' && RemoteIdRadar.fetchAirspaceStatus) {



      RemoteIdRadar.fetchAirspaceStatus();



    }



  });



}







function initCompanionPolling() {



  if (isCompanionPollingActive) return;



  isCompanionPollingActive = true;



  companionPollInterval = true; // backward compatibility flag







  // Initial immediate probe



  pollCompanionStatus().then(() => {



    if (isCompanionOnline && typeof RemoteIdRadar !== 'undefined' && RemoteIdRadar.pollAirspace) {



      RemoteIdRadar.pollAirspace();



    }



    scheduleNextCompanionChecks();



  });







  // Page Visibility API: pause/resume polling when switching tabs



  if (typeof document !== 'undefined' && document.addEventListener) {



    document.addEventListener('visibilitychange', () => {



      if (!document.hidden) {



        // Tab brought to foreground: immediately check status if older than 3 seconds



        if (Date.now() - lastStatusCheckTime > 3000) {



          wakeCompanionPolling(false);



        } else {



          scheduleNextCompanionChecks();



        }



      } else {



        // Tab hidden: reschedule to dormant rates



        scheduleNextCompanionChecks();



      }



    });



  }







  // Window Focus: wake up if window is focused after being backgrounded



  if (typeof window !== 'undefined' && window.addEventListener) {



    window.addEventListener('focus', () => {



      if (Date.now() - lastStatusCheckTime > 5000) {



        wakeCompanionPolling(false);



      }



    });



  }







  // UI Event hooks: clicking companion sync container or offline hint triggers instant wake-up



  if (typeof document !== 'undefined') {



    const container = document.getElementById('companion-sync-container');



    const hint = document.getElementById('companion-offline-hint');



    const sBox = document.getElementById('companion-service-box');



    [container, hint, sBox].filter(Boolean).forEach(el => {



      el.addEventListener('click', () => {



        if (!isCompanionOnline) {



          wakeCompanionPolling(true);



        }



      });



    });



  }



}







if (typeof window !== 'undefined') {



  window.wakeCompanionPolling = wakeCompanionPolling;



  window.getStatusPollDelay = getStatusPollDelay;



  window.getRadarPollDelay = getRadarPollDelay;



  window.scheduleNextCompanionChecks = scheduleNextCompanionChecks;



  window.scheduleNextStatusCheck = scheduleNextStatusCheck;



  window.scheduleNextRadarCheck = scheduleNextRadarCheck;



  window.connectCompanionStatusStream = connectCompanionStatusStream;



  window.disconnectCompanionStatusStream = disconnectCompanionStatusStream;



  window.getIsCompanionStatusStreaming = () => isCompanionStatusStreaming;



  window.getCompanionStatusEventSource = () => companionStatusEventSource;



  window.getConsecutiveStatusFailures = () => consecutiveStatusFailures;



  window.setConsecutiveStatusFailures = (n) => { consecutiveStatusFailures = n; };



  window.getConsecutiveRadarFailures = () => consecutiveRadarFailures;



  window.setConsecutiveRadarFailures = (n) => { consecutiveRadarFailures = n; };



  window.setIsCompanionOnline = (v) => { isCompanionOnline = v; };

  window.getIsCompanionOnline = () => isCompanionOnline;

  window.sendDirectlyToRC2 = sendDirectlyToRC2;

  window.pullFlightLogFromRC2 = pullFlightLogFromRC2;

}







if (typeof global !== 'undefined') {



  global.wakeCompanionPolling = wakeCompanionPolling;



  global.getStatusPollDelay = getStatusPollDelay;



  global.getRadarPollDelay = getRadarPollDelay;



  global.scheduleNextCompanionChecks = scheduleNextCompanionChecks;



  global.scheduleNextStatusCheck = scheduleNextStatusCheck;



  global.scheduleNextRadarCheck = scheduleNextRadarCheck;



  global.connectCompanionStatusStream = connectCompanionStatusStream;



  global.disconnectCompanionStatusStream = disconnectCompanionStatusStream;



  global.getIsCompanionStatusStreaming = () => isCompanionStatusStreaming;



  global.getCompanionStatusEventSource = () => companionStatusEventSource;



  global.getConsecutiveStatusFailures = () => consecutiveStatusFailures;



  global.setConsecutiveStatusFailures = (n) => { consecutiveStatusFailures = n; };



  global.getConsecutiveRadarFailures = () => consecutiveRadarFailures;



  global.setConsecutiveRadarFailures = (n) => { consecutiveRadarFailures = n; };



  global.setIsCompanionOnline = (v) => { isCompanionOnline = v; };

  global.getIsCompanionOnline = () => isCompanionOnline;

  global.sendDirectlyToRC2 = sendDirectlyToRC2;

  global.pullFlightLogFromRC2 = pullFlightLogFromRC2;

}







// ─── Ambient Telemetry Buffer Manager (Issue #142) ─────────────────────────







const AmbientBufferManager = {



  lastMetrics: null,







  async fetchBufferMetrics() {



    if (typeof fetch === 'undefined') return null;



    try {



      const res = await fetch(`${COMPANION_API_BASE}/api/buffer/metrics`);



      if (!res.ok) return null;



      const data = await res.json();



      this.lastMetrics = data;



      this.updateBufferHud(data);



      return data;



    } catch (_) {



      return null;



    }



  },







  async flushBuffer() {



    if (typeof fetch === 'undefined') return null;



    try {



      const res = await fetch(`${COMPANION_API_BASE}/api/buffer/flush`, { method: 'POST' });



      if (!res.ok) return null;



      const data = await res.json();



      if (data.metrics) {



        this.updateBufferHud(data.metrics);



      } else {



        await this.fetchBufferMetrics();



      }



      return data;



    } catch (_) {



      return null;



    }



  },







  async commitBufferSession(missionUuid, startUtcMs, endUtcMs) {



    if (typeof fetch === 'undefined') return null;



    try {



      const payload = {



        missionUuid: missionUuid || (typeof FlightDiagnostics !== 'undefined' && FlightDiagnostics.selectedFlightId) || `mission_${Date.now()}`,



        startUtcMs: startUtcMs || (Date.now() - 3600000),



        endUtcMs: endUtcMs || Date.now()



      };



      const res = await fetch(`${COMPANION_API_BASE}/api/buffer/commit-session`, {



        method: 'POST',



        headers: { 'Content-Type': 'application/json' },



        body: JSON.stringify(payload)



      });



      if (!res.ok) return null;



      const data = await res.json();



      await this.fetchBufferMetrics();



      return data;



    } catch (_) {



      return null;



    }



  },







  updateBufferHud(metrics) {



    if (!metrics || typeof document === 'undefined') return;



    const pill = document.getElementById('header-ambient-buffer-pill');



    const icon = document.getElementById('header-buffer-icon');



    const label = document.getElementById('header-buffer-label');



    const badge = document.getElementById('header-buffer-traffic-badge');







    const mbUsed = (typeof metrics.mbUsed === 'number') ? metrics.mbUsed.toFixed(2) : (metrics.formattedMemory ? metrics.formattedMemory.replace(' MB', '') : '0.00');



    const winMin = metrics.activeWindowMinutes || 0;



    const ridCount = (metrics.counts?.remoteId !== undefined) ? metrics.counts.remoteId : (metrics.activeAirspaceDrones || 0);



    const adsbCount = (metrics.counts?.adsb !== undefined) ? metrics.counts.adsb : (metrics.activeAdsbAircraft || 0);



    const totalTraffic = ridCount + adsbCount;



    const pct = metrics.percentage !== undefined ? metrics.percentage : (metrics.capacityPercentage || 0);







    if (label) label.textContent = `Buffer: ${mbUsed} MB`;







    if (badge) {



      if (ridCount > 0 && adsbCount > 0) {



        badge.textContent = `${ridCount} RID | ${adsbCount} ADS-B`;



        badge.className = 'header-buffer-badge is-traffic';



      } else if (ridCount > 0) {



        badge.textContent = `${ridCount} Drone${ridCount === 1 ? '' : 's'}`;



        badge.className = 'header-buffer-badge is-traffic';



      } else if (adsbCount > 0) {



        badge.textContent = `${adsbCount} ADS-B`;



        badge.className = 'header-buffer-badge is-traffic';



      } else {



        badge.textContent = 'Clear';



        badge.className = 'header-buffer-badge';



      }



    }







    if (pill) {



      pill.classList.remove('is-clean', 'is-active', 'is-pressure');



      pill.title = `Ambient Buffer: ${mbUsed} MB (${winMin}m window) • ${totalTraffic} Traffic (Click to inspect)`;



      if (pct >= 80 || metrics.isMemoryPressure) {



        pill.classList.add('is-pressure');



        if (icon) icon.textContent = '⚠️';



        if (badge) {



          badge.textContent = 'Memory Pressure';



          badge.className = 'header-buffer-badge is-warning';



        }



      } else if (totalTraffic > 0) {



        pill.classList.add('is-active');



        if (icon) icon.textContent = '🔵';



      } else {



        pill.classList.add('is-clean');



        if (icon) icon.textContent = '🟢';



      }



    }







    // Bridge Pill memory pressure awareness



    const bridgePill = document.getElementById('header-bridge-pill');



    if (bridgePill) {



      if (pct >= 80 || metrics.isMemoryPressure) {



        bridgePill.classList.add('is-pressure');



      } else {



        bridgePill.classList.remove('is-pressure');



      }



    }







    // Update Popover elements



    const ramEl = document.getElementById('buffer-stat-ram');



    if (ramEl) ramEl.textContent = `${mbUsed} MB / ${metrics.mbMax || 10} MB (${pct}%)`;



    const barEl = document.getElementById('buffer-progress-bar');



    if (barEl) {



      barEl.style.width = `${Math.min(100, pct)}%`;



      barEl.style.background = (pct >= 80) ? '#ef4444' : ((totalTraffic > 0) ? '#38bdf8' : '#10b981');



    }



    const winEl = document.getElementById('buffer-stat-window');



    if (winEl) winEl.textContent = `${winMin} min (Oldest: ${new Date(metrics.oldestTimestamp || Date.now()).toLocaleTimeString()})`;



    const ridEl = document.getElementById('buffer-stat-rid');



    if (ridEl) ridEl.textContent = `${ridCount} frames (${Math.round((ridCount * 140) / 1024)} KB)`;



    const adsbEl = document.getElementById('buffer-stat-adsb');



    if (adsbEl) adsbEl.textContent = `${adsbCount} points (${Math.round((adsbCount * 190) / 1024)} KB)`;



    const radarEl = document.getElementById('buffer-stat-radar');



    const radarCount = (metrics.counts?.radar !== undefined) ? metrics.counts.radar : (metrics.radarFramesCached || 0);



    if (radarEl) radarEl.textContent = `${radarCount} snapshots (${Math.round((radarCount * 48000) / 1024)} KB)`;



  }



};







if (typeof window !== 'undefined') {



  window.AmbientBufferManager = AmbientBufferManager;



  window.ApiClient = window.ApiClient || {};



  window.ApiClient.fetchBufferMetrics = () => AmbientBufferManager.fetchBufferMetrics();



  window.ApiClient.flushBuffer = () => AmbientBufferManager.flushBuffer();



  window.ApiClient.commitBufferSession = (u, s, e) => AmbientBufferManager.commitBufferSession(u, s, e);



}







if (typeof global !== 'undefined') {



  global.AmbientBufferManager = AmbientBufferManager;



  global.ApiClient = global.ApiClient || {};



  global.ApiClient.fetchBufferMetrics = () => AmbientBufferManager.fetchBufferMetrics();



  global.ApiClient.flushBuffer = () => AmbientBufferManager.flushBuffer();



  global.ApiClient.commitBufferSession = (u, s, e) => AmbientBufferManager.commitBufferSession(u, s, e);



}







// ─── Remote ID Airspace Radar & Live Detection ─────────────────────────────







const RemoteIdRadar = {



  activeDrones: [],



  markers: new Map(), // droneId -> { marker, takeoffMarker, homeVectorLine, line, drone }



  layerGroup: null,



  locatedDroneId: null,



  isFollowing: false,



  offsetMeters: { north: 0, east: 0 },



  calibrationStep: 1.0,



  isPanelOpen: false,



  eventSource: null,



  streamConnected: false,



  streamMode: 'disconnected', // 'sse' | 'polling' | 'disconnected'







  init() {



    const leaflet = (typeof L !== 'undefined' && L) || (typeof window !== 'undefined' && window.L) || (typeof global !== 'undefined' && global.L);



    const m = (typeof map !== 'undefined' && map) || (typeof window !== 'undefined' && window.map) || (typeof global !== 'undefined' && global.map);



    if (typeof remoteIdAirspaceLayer !== 'undefined' && remoteIdAirspaceLayer) {



      this.layerGroup = remoteIdAirspaceLayer;



    } else if (leaflet && m && !this.layerGroup && m.addLayer && leaflet.layerGroup) {



      this.layerGroup = leaflet.layerGroup().addTo(m);



    }



    if (isCompanionOnline && typeof this.connectStream === 'function') {



      this.connectStream();



    } else if (typeof window !== 'undefined' && window.AalaapiAndroid && typeof window.AalaapiAndroid.startRemoteIdScan === 'function') {

      try { window.AalaapiAndroid.startRemoteIdScan(); } catch (_) {}

    }



    if (m && m.on) {



      m.on('dragstart', () => {



        if (this.isFollowing) {



          this.isFollowing = false;



          this.updateRadarUI();



        }



      });



    }







    // Load saved calibration offset from localStorage



    try {



      if (typeof localStorage !== 'undefined') {



        const saved = localStorage.getItem('aalaapi_remoteid_offset');



        if (saved) {



          const parsed = JSON.parse(saved);



          if (parsed && typeof parsed.north === 'number' && typeof parsed.east === 'number') {



            this.offsetMeters = {



              north: Math.round(parsed.north * 10) / 10,



              east: Math.round(parsed.east * 10) / 10



            };



          }



        }



      }



    } catch (e) {}







    const badge = typeof document !== 'undefined' ? document.getElementById('remote-id-badge') : null;



    if (badge) {



      badge.addEventListener('click', () => {



        if (this.activeDrones.length > 0) {



          const target = this.activeDrones.find(d => d.latitude && d.longitude && !d.signalLost) ||



                         this.activeDrones.find(d => d.latitude && d.longitude) ||



                         this.activeDrones[0];



          if (target && target.latitude && target.longitude) {



            this.locateDrone(target.id);



          }



        }



      });



    }







    // Calibration UI Bindings



    if (typeof document !== 'undefined') {



      const calBtn = document.getElementById('remote-id-calibrate-btn');



      if (calBtn) {



        calBtn.addEventListener('click', (e) => {



          e.stopPropagation();



          this.toggleCalibrationPanel();



        });



      }







      const closeBtn = document.getElementById('remote-id-cal-close-btn');



      if (closeBtn) {



        closeBtn.addEventListener('click', (e) => {



          e.stopPropagation();



          this.toggleCalibrationPanel(false);



        });



      }







      const nudgeN = document.getElementById('remote-id-cal-nudge-n');



      if (nudgeN) {



        nudgeN.addEventListener('click', (e) => {



          e.stopPropagation();



          this.nudgeOffset(this.calibrationStep, 0);



        });



      }







      const nudgeS = document.getElementById('remote-id-cal-nudge-s');



      if (nudgeS) {



        nudgeS.addEventListener('click', (e) => {



          e.stopPropagation();



          this.nudgeOffset(-this.calibrationStep, 0);



        });



      }







      const nudgeE = document.getElementById('remote-id-cal-nudge-e');



      if (nudgeE) {



        nudgeE.addEventListener('click', (e) => {



          e.stopPropagation();



          this.nudgeOffset(0, this.calibrationStep);



        });



      }







      const nudgeW = document.getElementById('remote-id-cal-nudge-w');



      if (nudgeW) {



        nudgeW.addEventListener('click', (e) => {



          e.stopPropagation();



          this.nudgeOffset(0, -this.calibrationStep);



        });



      }







      const resetBtn = document.getElementById('remote-id-cal-reset-btn');



      if (resetBtn) {



        resetBtn.addEventListener('click', (e) => {



          e.stopPropagation();



          this.resetOffset();



        });



      }







      const stepBtns = document.querySelectorAll('.cal-step-btn');



      stepBtns.forEach(btn => {



        btn.addEventListener('click', (e) => {



          e.stopPropagation();



          stepBtns.forEach(b => b.classList.remove('active'));



          btn.classList.add('active');



          const val = parseFloat(btn.getAttribute('data-step'));



          if (!isNaN(val) && val > 0) {



            this.calibrationStep = val;



            const ind = document.getElementById('remote-id-cal-step-indicator');



            if (ind) ind.textContent = `${val.toFixed(1)}m`;



          }



        });



      });



    }







    this.updateCalibrationUI();



  },







  applyOffset(lat, lon) {



    if (lat === null || lat === undefined || lon === null || lon === undefined) {



      return { lat, lon };



    }



    if (!this.offsetMeters || (this.offsetMeters.north === 0 && this.offsetMeters.east === 0)) {



      return { lat, lon };



    }



    const deltaLat = this.offsetMeters.north / 111132.95;



    const cosLat = Math.cos((lat * Math.PI) / 180);



    const deltaLon = cosLat !== 0 ? this.offsetMeters.east / (111132.95 * cosLat) : 0;



    return {



      lat: lat + deltaLat,



      lon: lon + deltaLon



    };



  },







  calculateOffsetFromTarget(rawLat, rawLon, targetLat, targetLon) {



    const dLat = targetLat - rawLat;



    const dLon = targetLon - rawLon;



    const north = dLat * 111132.95;



    const cosLat = Math.cos((rawLat * Math.PI) / 180);



    const east = dLon * (111132.95 * cosLat);



    return {



      north: Math.round(north * 10) / 10,



      east: Math.round(east * 10) / 10



    };



  },







  setOffset(northMeters, eastMeters) {



    this.offsetMeters = {



      north: Math.round(northMeters * 10) / 10,



      east: Math.round(eastMeters * 10) / 10



    };



    try {



      if (typeof localStorage !== 'undefined') {



        localStorage.setItem('aalaapi_remoteid_offset', JSON.stringify(this.offsetMeters));



      }



    } catch (e) {}



    this.updateMapMarkers();



    this.updateCalibrationUI();



  },







  nudgeOffset(deltaNorth, deltaEast) {



    this.setOffset(this.offsetMeters.north + deltaNorth, this.offsetMeters.east + deltaEast);



  },







  resetOffset() {



    this.setOffset(0, 0);



  },







  toggleCalibrationPanel(forceState) {



    this.isPanelOpen = typeof forceState === 'boolean' ? forceState : !this.isPanelOpen;



    if (typeof document === 'undefined') return;



    const panel = document.getElementById('remote-id-calibration-panel');



    const btn = document.getElementById('remote-id-calibrate-btn');



    if (panel) {



      if (this.isPanelOpen) {



        panel.style.display = 'flex';



        panel.classList.remove('hidden');



        if (btn) btn.classList.add('active');



      } else {



        panel.style.display = 'none';



        panel.classList.add('hidden');



        if (btn) btn.classList.remove('active');



      }



    }



    this.updateCalibrationUI();



  },







  updateCalibrationUI() {



    if (typeof document === 'undefined') return;



    const offsetTextEl = document.getElementById('remote-id-cal-offset-text');



    const activeDot = document.getElementById('remote-id-cal-active-dot');



    const stepIndicator = document.getElementById('remote-id-cal-step-indicator');







    const hasOffset = this.offsetMeters && (this.offsetMeters.north !== 0 || this.offsetMeters.east !== 0);



    const nSign = (this.offsetMeters && this.offsetMeters.north >= 0) ? '+' : '';



    const eSign = (this.offsetMeters && this.offsetMeters.east >= 0) ? '+' : '';



    const offsetStr = hasOffset



      ? `${nSign}${this.offsetMeters.north.toFixed(1)}m N, ${eSign}${this.offsetMeters.east.toFixed(1)}m E`



      : '0.0m (Aligned)';







    if (offsetTextEl) offsetTextEl.textContent = offsetStr;



    if (activeDot) {



      if (hasOffset) {



        activeDot.classList.remove('hidden');



        activeDot.style.display = 'inline-block';



      } else {



        activeDot.classList.add('hidden');



        activeDot.style.display = 'none';



      }



    }







    if (stepIndicator) {



      stepIndicator.textContent = `${this.calibrationStep.toFixed(1)}m`;



    }



  },







  locateDrone(droneId) {



    const target = (droneId ? this.activeDrones.find(d => d.id === droneId) : null) ||



                   this.activeDrones.find(d => d.latitude && d.longitude && !d.signalLost) ||



                   this.activeDrones.find(d => d.latitude && d.longitude) ||



                   this.activeDrones[0];



    if (!target || !target.latitude || !target.longitude) return false;







    this.locatedDroneId = target.id;



    this.isFollowing = true;







    const leaflet = (typeof L !== 'undefined' && L) || (typeof window !== 'undefined' && window.L) || (typeof global !== 'undefined' && global.L);



    const m = (typeof map !== 'undefined' && map) || (typeof window !== 'undefined' && window.map) || (typeof global !== 'undefined' && global.map);



    if (m) {



      const offsetDrone = this.applyOffset(target.latitude, target.longitude);



      if (target.operatorLatitude && target.operatorLongitude && m.fitBounds && leaflet && leaflet.latLngBounds) {



        const offsetTakeoff = this.applyOffset(target.operatorLatitude, target.operatorLongitude);



        const bounds = leaflet.latLngBounds([



          [offsetDrone.lat, offsetDrone.lon],



          [offsetTakeoff.lat, offsetTakeoff.lon]



        ]);



        m.fitBounds(bounds, { padding: [70, 70], maxZoom: 18 });



      } else if (m.setView) {



        const zoom = m.getZoom ? Math.max(m.getZoom(), 17) : 18;



        m.setView([offsetDrone.lat, offsetDrone.lon], zoom);



      }



    }







    const entry = this.markers.get(target.id);



    if (entry && entry.marker) {



      if (entry.marker.openTooltip) entry.marker.openTooltip();



    }







    this.updateRadarUI();



    return true;



  },







  formatDroneTooltip(drone) {



    const isSignalLost = !!(drone.signalLost || (drone.ageSec !== undefined && drone.ageSec > 15));



    const altText = drone.altitudeGeodetic !== null ? `${drone.altitudeGeodetic}m (${Math.round(drone.altitudeGeodetic * 3.28084)}ft MSL)` : 'Alt N/A';



    const speedText = drone.speedHorizontal !== null ? `${drone.speedHorizontal} m/s (${(drone.speedHorizontal * 2.23694).toFixed(1)} mph)` : 'Speed N/A';



    const heading = drone.trackDirection !== null ? `${Math.round(drone.trackDirection)}°` : '0°';



    const coordsText = (drone.latitude && drone.longitude) ? `${drone.latitude.toFixed(6)}, ${drone.longitude.toFixed(6)}` : 'Awaiting GPS Fix';



    const transport = drone.transport || 'Direct';



    const rssiText = drone.rssi ? `${drone.rssi} dBm` : 'N/A';



    const statusText = isSignalLost ? `Signal Lost (${drone.lastSeenFormatted || 'Past'})` : (drone.status || 'Airborne');



    const statusColor = isSignalLost ? '#f59e0b' : (drone.status === 'Airborne' ? '#22c55e' : (drone.status === 'Emergency' ? '#ef4444' : '#eab308'));



    const themeColor = isSignalLost ? '#f59e0b' : '#ef4444';







    const hasOffset = this.offsetMeters && (this.offsetMeters.north !== 0 || this.offsetMeters.east !== 0);



    const nSign = (this.offsetMeters && this.offsetMeters.north >= 0) ? '+' : '';



    const eSign = (this.offsetMeters && this.offsetMeters.east >= 0) ? '+' : '';



    const offsetTag = hasOffset ? ` • Offset: ${nSign}${this.offsetMeters.north}m N, ${eSign}${this.offsetMeters.east}m E` : '';







    return `



      <div class="remote-id-hover-hud" style="font-family: inherit; font-size: 0.78rem; line-height: 1.35; min-width: 220px;">



        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; border-bottom: 1px solid rgba(255,255,255,0.12); padding-bottom: 5px; margin-bottom: 6px;">



          <div style="display: flex; align-items: center; gap: 6px; font-weight: 700; color: ${themeColor};">



            <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${themeColor}; box-shadow: 0 0 6px ${themeColor};"></span>



            <span>${drone.model || 'Drone'}</span>



          </div>



          <span style="font-size: 0.65rem; background: ${statusColor}22; border: 1px solid ${statusColor}66; color: ${statusColor}; border-radius: 4px; padding: 1px 4px; font-weight: 600;">



            ${isSignalLost ? '⚠️ ' : ''}${statusText}



          </span>



        </div>



        <div style="color: #94a3b8; font-size: 0.72rem; margin-bottom: 6px; font-family: monospace;">



          ID: <span style="color: #cbd5e1;">${drone.uasId || 'Unknown'}</span>



        </div>



        <div style="display: grid; grid-template-columns: auto 1fr; gap: 3px 8px; font-size: 0.75rem; color: #e2e8f0;">



          <span style="color: #94a3b8;">${isSignalLost ? '📍 LKP:' : '📍 Geo:'}</span>



          <span style="font-family: monospace; color: #38bdf8; font-weight: 600;">${coordsText}</span>



          <span style="color: #94a3b8;">⛰️ Alt:</span>



          <span style="font-weight: 600;">${altText}</span>



          <span style="color: #94a3b8;">⚡ Speed:</span>



          <span style="font-weight: 600;">${speedText}</span>



          <span style="color: #94a3b8;">🧭 Track:</span>



          <span style="font-weight: 600;">${heading}</span>



          <span style="color: #94a3b8;">📶 Link:</span>



          <span>${transport} (${rssiText})</span>



        </div>



        ${drone.operatorLatitude ? `<div style="margin-top: 6px; padding-top: 4px; border-top: 1px dashed rgba(255,255,255,0.1); font-size: 0.7rem; color: #38bdf8;">🛫 Takeoff: ${drone.operatorLatitude.toFixed(6)}, ${drone.operatorLongitude.toFixed(6)}</div>` : ''}



        <div style="margin-top: 6px; font-size: 0.66rem; color: ${isSignalLost ? '#f59e0b' : '#64748b'}; text-align: right; font-weight: ${isSignalLost ? '600' : 'normal'};">



          ${isSignalLost ? '⚠️ Last Known Position (LKP)' : `Click to Track • ASTM F3411 Live${offsetTag}`}



        </div>



      </div>



    `;



  },







  updateStreamTransportUI() {



    if (typeof document === 'undefined') return;



    const badge = document.getElementById('remote-id-transport-badge');



    if (!badge) return;



    if (this.streamMode === 'android-ble') {

      badge.textContent = 'Android BLE/Wi-Fi (Native)';

      badge.style.color = '#a78bfa';

    } else if (this.streamMode === 'sse') {



      badge.textContent = 'SSE Stream (Sub-second)';



      badge.style.color = '#38bdf8';



    } else if (this.streamMode === 'polling') {



      badge.textContent = 'REST Polling (Fallback)';



      badge.style.color = '#f59e0b';



    } else {



      badge.textContent = 'Standby';



      badge.style.color = '#94a3b8';



    }



  },







  connectStream() {



    if (!isCompanionOnline) return;



    const EventSourceCtor = (typeof window !== 'undefined' && window.EventSource) || (typeof EventSource !== 'undefined' && EventSource) || null;



    if (!EventSourceCtor) {



      this.streamConnected = false;



      this.streamMode = 'polling';



      this.updateStreamTransportUI();



      return;



    }







    const url = buildAuthenticatedCompanionUrl('/api/remote-id/stream');







    if (this.eventSource) {



      try { this.eventSource.close(); } catch (_) {}



      this.eventSource = null;



    }







    try {



      this.eventSource = new EventSourceCtor(url);







      this.eventSource.onopen = () => {



        this.streamConnected = true;



        this.streamMode = 'sse';



        consecutiveRadarFailures = 0;



        this.updateStreamTransportUI();



      };







      this.eventSource.onmessage = (event) => {



        if (!event || !event.data) return;



        try {



          const data = JSON.parse(event.data);



          this.streamConnected = true;



          this.streamMode = 'sse';



          consecutiveRadarFailures = 0;



          if (data.success && Array.isArray(data.drones)) {



            this.activeDrones = data.drones;



            this.updateMapMarkers();



            this.updateRadarUI();



          }



          this.updateStreamTransportUI();



        } catch (e) {}



      };







      this.eventSource.onerror = () => {
        if (typeof Platform !== 'undefined' && Platform.isNativeAndroid()) {
          try { this.eventSource.close(); } catch (_) {}
          this.eventSource = null;
        }



        this.streamConnected = false;



        this.streamMode = 'polling';



        this.updateStreamTransportUI();



        if (typeof scheduleNextRadarCheck === 'function') {



          scheduleNextRadarCheck();



        }



      };



    } catch (e) {



      if (this.streamMode === 'android-tcp' || this.streamMode === 'android-http') return;



      this.streamConnected = false;



      this.streamMode = 'polling';



      this.updateStreamTransportUI();



      if (typeof scheduleNextRadarCheck === 'function') {



        scheduleNextRadarCheck();



      }



    }



  },







  disconnectStream() {



    if (this.eventSource) {



      try { this.eventSource.close(); } catch (_) {}



      this.eventSource = null;



    }



    this.streamConnected = false;



    this.streamMode = 'disconnected';



    this.updateStreamTransportUI();



  },







  async pollAirspace() {



    if (typeof fetch === 'undefined') return;



    // Gate drone radar polling on Companion service online status:



    // If status check fails/offline, remote-id drones endpoint is guaranteed down. Skip entirely!



    if (!isCompanionOnline) return;



    if (this._isPolling) return;



    this._isPolling = true;







    try {



      const apiBase = typeof COMPANION_API_BASE !== 'undefined' ? COMPANION_API_BASE : 'http://127.0.0.1:8765';



      const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;



      const timeoutId = controller ? setTimeout(() => controller.abort(), 2500) : null;



      const res = await fetch(`${apiBase}/api/remote-id/drones`, { ...(controller ? { signal: controller.signal } : {}), headers: getCompanionAuthHeaders() });



      if (timeoutId) clearTimeout(timeoutId);



      if (res.ok) {



        consecutiveRadarFailures = 0;



        const data = await res.json();



        if (data.success && Array.isArray(data.drones)) {



          this.activeDrones = data.drones;



          this.updateMapMarkers();



          this.updateRadarUI();



        }



      } else {



        consecutiveRadarFailures++;



        if (consecutiveRadarFailures >= 2 && typeof pollCompanionStatus === 'function') {



          pollCompanionStatus().catch(() => {});



        }



      }



    } catch (e) {



      consecutiveRadarFailures++;



      if (consecutiveRadarFailures >= 2 && typeof pollCompanionStatus === 'function') {



        pollCompanionStatus().catch(() => {});



      }



      // Gracefully retain last known positions during transient network latency



      this.updateRadarUI();



    } finally {



      this._isPolling = false;



    }



  },







  updateDroneLocation(droneData) {



    if (!droneData || !droneData.id) return;



    const existingIdx = this.activeDrones.findIndex(d => d.id === droneData.id);



    if (existingIdx >= 0) {



      this.activeDrones[existingIdx] = { ...this.activeDrones[existingIdx], ...droneData };



    } else {



      this.activeDrones.push(droneData);



    }



    this.updateMapMarkers();



    this.updateRadarUI();



  },







  updateMapMarkers() {



    const leaflet = (typeof L !== 'undefined' && L) || (typeof window !== 'undefined' && window.L) || (typeof global !== 'undefined' && global.L);



    const m = (typeof map !== 'undefined' && map) || (typeof window !== 'undefined' && window.map) || (typeof global !== 'undefined' && global.map);



    if (!this.layerGroup && typeof remoteIdAirspaceLayer !== 'undefined' && remoteIdAirspaceLayer) {



      this.layerGroup = remoteIdAirspaceLayer;



    } else if (!this.layerGroup && m && m.addLayer && leaflet && leaflet.layerGroup) {



      this.layerGroup = leaflet.layerGroup().addTo(m);



    }



    if (!this.layerGroup) return;







    const currentDroneIds = new Set(this.activeDrones.map(d => d.id));







    // Remove old markers



    for (const [id, entry] of this.markers.entries()) {



      if (!currentDroneIds.has(id)) {



        if (entry.marker && this.layerGroup.removeLayer) this.layerGroup.removeLayer(entry.marker);



        if (entry.takeoffMarker && this.layerGroup.removeLayer) this.layerGroup.removeLayer(entry.takeoffMarker);



        if (entry.homeVectorLine && this.layerGroup.removeLayer) this.layerGroup.removeLayer(entry.homeVectorLine);



        if (entry.line && this.layerGroup.removeLayer) this.layerGroup.removeLayer(entry.line);



        this.markers.delete(id);



      }



    }







    // Helper for distance calculation



    const calcDistanceStr = (lat1, lon1, lat2, lon2) => {



      const R = 6371000;



      const dLat = (lat2 - lat1) * Math.PI / 180;



      const dLon = (lon2 - lon1) * Math.PI / 180;



      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +



                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *



                Math.sin(dLon / 2) * Math.sin(dLon / 2);



      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));



      const dist = R * c;



      return dist >= 1000 ? `${(dist / 1000).toFixed(2)} km` : `${Math.round(dist)} m`;



    };







    // Add or update active markers



    for (const drone of this.activeDrones) {



      if (!drone.latitude || !drone.longitude) continue;



      let entry = this.markers.get(drone.id) || { marker: null, takeoffMarker: null, homeVectorLine: null, line: null, drone: null };







      const isSignalLost = !!(drone.signalLost || (drone.ageSec !== undefined && drone.ageSec > 15));



      const heading = drone.trackDirection || 0;



      const tooltipHtml = this.formatDroneTooltip(drone);







      const iconHtml = isSignalLost ? `



        <div style="position: relative; width: 38px; height: 38px; display: flex; flex-direction: column; align-items: center; justify-content: center; opacity: 0.94;">



          <div style="position: absolute; width: 34px; height: 34px; border-radius: 50%; background: rgba(245, 158, 11, 0.22); border: 2px dashed #f59e0b; box-shadow: 0 0 6px rgba(245, 158, 11, 0.4);"></div>



          <div style="transform: rotate(${heading}deg); transition: transform 0.3s ease; display: flex; align-items: center; justify-content: center;">



            <svg viewBox="0 0 24 24" width="20" height="20" fill="#f59e0b" stroke="#0f172a" stroke-width="1.5">



              <path d="M12 2L19 21L12 17L5 21L12 2Z"/>



            </svg>



          </div>



          <span style="position: absolute; bottom: -6px; background: rgba(15, 23, 42, 0.95); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.6); font-size: 0.52rem; font-weight: 800; padding: 0 3px; border-radius: 3px; line-height: 1.1; letter-spacing: 0.04em;">LKP</span>



        </div>



      ` : `



        <div style="position: relative; width: 38px; height: 38px; display: flex; align-items: center; justify-content: center;">



          <div style="position: absolute; width: 34px; height: 34px; border-radius: 50%; background: rgba(239, 68, 68, 0.25); border: 1.5px solid #ef4444;"></div>



          <div style="transform: rotate(${heading}deg); transition: transform 0.3s ease; display: flex; align-items: center; justify-content: center;">



            <svg viewBox="0 0 24 24" width="22" height="22" fill="#ef4444" stroke="#ffffff" stroke-width="1.5">



              <path d="M12 2L19 21L12 17L5 21L12 2Z"/>



            </svg>



          </div>



        </div>



      `;







      const customIcon = (leaflet && leaflet.divIcon) ? leaflet.divIcon({



        html: iconHtml,



        className: isSignalLost ? 'remote-id-drone-marker remote-id-lkp-marker' : 'remote-id-drone-marker',



        iconSize: [38, 38],



        iconAnchor: [19, 19]



      }) : null;







      // Apply calibration offset to coordinates



      const offsetDrone = this.applyOffset(drone.latitude, drone.longitude);







      // 1. Drone Position Marker (Live or LKP)



      if (!entry.marker) {



        const marker = (leaflet && leaflet.marker && customIcon) ? leaflet.marker([offsetDrone.lat, offsetDrone.lon], { icon: customIcon, zIndexOffset: isSignalLost ? 800 : 1000 }) : null;



        if (marker) {



          if (marker.bindTooltip) {



            marker.bindTooltip(tooltipHtml, {



              direction: 'top',



              offset: [0, -16],



              className: 'remote-id-tooltip',



              opacity: 0.96



            });



          }



          if (marker.bindPopup) {



            marker.bindPopup(tooltipHtml);



          }



          if (marker.on) {



            marker.on('mouseover', () => { if (marker.openTooltip) marker.openTooltip(); });



            marker.on('mouseout', () => { if (marker.closeTooltip) marker.closeTooltip(); });



            marker.on('click', () => { this.locateDrone(drone.id); });



          }



          this.layerGroup.addLayer(marker);



        }



        entry.marker = marker;



      } else {



        if (entry.marker.setLatLng) entry.marker.setLatLng([offsetDrone.lat, offsetDrone.lon]);



        if (customIcon && entry.marker.setIcon) entry.marker.setIcon(customIcon);



        if (entry.marker.setTooltipContent) entry.marker.setTooltipContent(tooltipHtml);



        if (entry.marker.setPopupContent) entry.marker.setPopupContent(tooltipHtml);



      }







      // 2. Takeoff / Home Location Marker & Home Vector Line



      const hasTakeoff = drone.operatorLatitude !== null && drone.operatorLatitude !== undefined &&



                         drone.operatorLongitude !== null && drone.operatorLongitude !== undefined;







      if (hasTakeoff) {



        const offsetTakeoff = this.applyOffset(drone.operatorLatitude, drone.operatorLongitude);



        const rangeStr = calcDistanceStr(drone.operatorLatitude, drone.operatorLongitude, drone.latitude, drone.longitude);



        const takeoffIconHtml = `



          <div class="remote-id-takeoff-pin" style="position: relative; display: flex; flex-direction: column; align-items: center; cursor: pointer; user-select: none; width: 36px;">



            <div style="background: rgba(15, 23, 42, 0.92); border: 2px solid #38bdf8; width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 8px rgba(56, 189, 248, 0.6);">



              <span style="color: #38bdf8; font-size: 0.72rem; font-weight: 800; font-family: monospace; line-height: 1;">H</span>



            </div>



            <span style="background: rgba(15, 23, 42, 0.88); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.4); font-size: 0.58rem; font-weight: 700; padding: 1px 4px; border-radius: 3px; margin-top: 1px; white-space: nowrap;">



              Takeoff



            </span>



          </div>



        `;







        const takeoffIcon = (leaflet && leaflet.divIcon) ? leaflet.divIcon({



          html: takeoffIconHtml,



          className: 'remote-id-takeoff-marker',



          iconSize: [36, 44],



          iconAnchor: [18, 13],



          popupAnchor: [0, -14]



        }) : null;







        const takeoffTooltipHtml = `



          <div class="remote-id-takeoff-tooltip" style="font-family: inherit; font-size: 0.76rem; line-height: 1.35; min-width: 200px;">



            <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.12); padding-bottom: 4px; margin-bottom: 5px;">



              <strong style="color: #38bdf8;">🛫 Takeoff / Home Location</strong>



              <span style="font-size: 0.62rem; color: #94a3b8;">${drone.operatorLocationType || 'Takeoff'}</span>



            </div>



            <div style="color: #cbd5e1; font-weight: 600; margin-bottom: 3px;">${drone.model || 'Drone'} [${drone.uasId || 'RID'}]</div>



            <div style="display: grid; grid-template-columns: auto 1fr; gap: 2px 6px; font-size: 0.72rem; color: #94a3b8;">



              <span>📍 Geo:</span>



              <span style="color: #f8fafc; font-family: monospace;">${drone.operatorLatitude.toFixed(6)}, ${drone.operatorLongitude.toFixed(6)}</span>



              ${drone.operatorAltitude !== null && drone.operatorAltitude !== undefined ? `<span>⛰️ Alt:</span><span style="color: #f8fafc;">${drone.operatorAltitude}m (${Math.round(drone.operatorAltitude * 3.28084)}ft)</span>` : ''}



              <span>📏 Range:</span>



              <span style="color: #38bdf8; font-weight: 700;">${rangeStr} to ${isSignalLost ? 'LKP' : 'Drone'}</span>



            </div>



          </div>



        `;







        if (!entry.takeoffMarker) {



          const tMarker = (leaflet && leaflet.marker && takeoffIcon) ? leaflet.marker([offsetTakeoff.lat, offsetTakeoff.lon], { icon: takeoffIcon, zIndexOffset: 950 }) : null;



          if (tMarker) {



            if (tMarker.bindTooltip) tMarker.bindTooltip(takeoffTooltipHtml, { direction: 'top', offset: [0, -14], className: 'remote-id-tooltip', opacity: 0.96 });



            if (tMarker.bindPopup) tMarker.bindPopup(takeoffTooltipHtml);



            if (tMarker.on) {



              tMarker.on('click', () => { this.locateDrone(drone.id); });



            }



            this.layerGroup.addLayer(tMarker);



          }



          entry.takeoffMarker = tMarker;



        } else {



          if (entry.takeoffMarker.setLatLng) entry.takeoffMarker.setLatLng([offsetTakeoff.lat, offsetTakeoff.lon]);



          if (takeoffIcon && entry.takeoffMarker.setIcon) entry.takeoffMarker.setIcon(takeoffIcon);



          if (entry.takeoffMarker.setTooltipContent) entry.takeoffMarker.setTooltipContent(takeoffTooltipHtml);



          if (entry.takeoffMarker.setPopupContent) entry.takeoffMarker.setPopupContent(takeoffTooltipHtml);



        }







        // Connecting Home Vector Line



        const vectorPoints = [



          [offsetTakeoff.lat, offsetTakeoff.lon],



          [offsetDrone.lat, offsetDrone.lon]



        ];



        const lineColor = isSignalLost ? '#f59e0b' : '#38bdf8';



        const lineTooltip = isSignalLost 



          ? `Last Vector: ${rangeStr} from Takeoff (Signal Lost ${drone.lastSeenFormatted || ''})`



          : `Home Vector: ${rangeStr} (${drone.uasId || 'Drone'})`;







        if (!entry.homeVectorLine) {



          if (leaflet && leaflet.polyline) {



            entry.homeVectorLine = leaflet.polyline(vectorPoints, {



              color: lineColor,



              weight: 2,



              dashArray: '6, 6',



              opacity: isSignalLost ? 0.75 : 0.85



            });



            if (entry.homeVectorLine.bindTooltip) {



              entry.homeVectorLine.bindTooltip(lineTooltip, { sticky: true });



            }



            this.layerGroup.addLayer(entry.homeVectorLine);



          }



        } else {



          if (entry.homeVectorLine.setLatLngs) entry.homeVectorLine.setLatLngs(vectorPoints);



          if (entry.homeVectorLine.setStyle) entry.homeVectorLine.setStyle({ color: lineColor, opacity: isSignalLost ? 0.75 : 0.85 });



          if (entry.homeVectorLine.setTooltipContent) entry.homeVectorLine.setTooltipContent(lineTooltip);



        }



      } else {



        if (entry.takeoffMarker && this.layerGroup.removeLayer) {



          this.layerGroup.removeLayer(entry.takeoffMarker);



          entry.takeoffMarker = null;



        }



        if (entry.homeVectorLine && this.layerGroup.removeLayer) {



          this.layerGroup.removeLayer(entry.homeVectorLine);



          entry.homeVectorLine = null;



        }



      }







      // 3. Historical Breadcrumbs Line



      if (drone.breadcrumbs && drone.breadcrumbs.length > 1) {



        const bcColor = isSignalLost ? '#f59e0b' : '#ef4444';



        const bcPoints = drone.breadcrumbs.map(b => {



          const off = this.applyOffset(b.lat, b.lon);



          return [off.lat, off.lon];



        });



        if (!entry.line && leaflet && leaflet.polyline) {



          entry.line = leaflet.polyline(bcPoints, { color: bcColor, weight: 2, dashArray: '4,4', opacity: isSignalLost ? 0.65 : 0.7 });



          this.layerGroup.addLayer(entry.line);



        } else if (entry.line) {



          if (entry.line.setLatLngs) entry.line.setLatLngs(bcPoints);



          if (entry.line.setStyle) entry.line.setStyle({ color: bcColor, opacity: isSignalLost ? 0.65 : 0.7 });



        }



      }







      entry.drone = drone;



      this.markers.set(drone.id, entry);







      // If this drone is actively tracked/located and auto-follow is active, center/pan map on new coordinates



      if (this.isFollowing && this.locatedDroneId === drone.id && m && m.panTo) {



        m.panTo([offsetDrone.lat, offsetDrone.lon], { animate: true });



      }



    }



  },







  updateRadarUI() {



    if (typeof document === 'undefined') return;



    const hud = document.getElementById('remote-id-airspace-hud');



    const badge = document.getElementById('remote-id-badge');



    const badgeText = document.getElementById('remote-id-badge-text');



    const locateLabel = document.getElementById('remote-id-locate-label');



    const calBtn = document.getElementById('remote-id-calibrate-btn');







    if (this.activeDrones.length > 0) {



      if (hud) {



        hud.style.display = 'flex';



        hud.classList.remove('hidden');



      }



      if (badge) {



        badge.style.display = 'inline-flex';



        badge.classList.remove('hidden');



      }



      if (calBtn) {



        calBtn.style.display = 'inline-flex';



        calBtn.classList.remove('hidden');



      }



      const count = this.activeDrones.length;



      const liveCount = this.activeDrones.filter(d => !d.signalLost && (d.ageSec === undefined || d.ageSec <= 15)).length;



      const lostCount = count - liveCount;



      const first = this.activeDrones.find(d => d.latitude && d.longitude && !d.signalLost) ||



                    this.activeDrones.find(d => d.latitude && d.longitude) ||



                    this.activeDrones[0];







      let label = '';



      if (this.isFollowing && this.locatedDroneId) {



        const located = this.activeDrones.find(d => d.id === this.locatedDroneId) || first;



        const isLocatedLost = !!(located.signalLost || (located.ageSec !== undefined && located.ageSec > 15));



        label = isLocatedLost ? `⚠️ LKP: ${located.model || 'Drone'} (${located.lastSeenFormatted || 'Lost'})` : `📡 Tracking ${located.model || 'Drone'}`;



        if (locateLabel) locateLabel.textContent = isLocatedLost ? 'LKP 📍' : 'Following 📍';



      } else {



        if (liveCount > 0) {



          label = `📡 ${liveCount} Live${lostCount > 0 ? ` + ${lostCount} LKP` : ''}`;



        } else {



          label = `⚠️ ${lostCount} Last Known (LKP)`;



        }



        if (count === 1 && !first.latitude) {



          label = `📡 ${first.model} Detected (${first.rssi} dBm)`;



        }



        if (locateLabel) locateLabel.textContent = 'Locate';



      }







      if (badgeText) {



        badgeText.textContent = label;



      } else if (badge) {



        badge.textContent = label;



      }



    } else {



      if (hud) {



        hud.style.display = 'none';



        hud.classList.add('hidden');



      }



      if (badge) {



        badge.style.display = 'none';



        badge.classList.add('hidden');



      }



      if (calBtn) {



        calBtn.style.display = 'none';



        calBtn.classList.add('hidden');



      }



      if (this.isPanelOpen) {



        this.toggleCalibrationPanel(false);



      }



    }



    this.updateCalibrationUI();



  }



};







if (typeof window !== 'undefined') {



  window.RemoteIdRadar = RemoteIdRadar;



}







// ─── Manned Aircraft Airspace Awareness (ADS-B Audio Alerts) - Issue #92 ───────



const AdsbAirspaceManager = {



  enabled: true,



  soundEnabled: true,



  soundType: 'both', // 'both' | 'chime' | 'voice'

  ttsPreset: 'standard', // 'standard' | 'concise' | 'direction_first' | 'custom'

  ttsBreachTemplate: 'Traffic alert! {callsign}, {distance} {direction}, {altitude}.',

  ttsApproachingTemplate: 'Traffic approaching! {callsign}, {distance} {direction}, perimeter ETA {eta}.',

  CARDINAL_SPOKEN_MAP: {
    'N': 'North',
    'NNE': 'North North East',
    'NE': 'North East',
    'ENE': 'East North East',
    'E': 'East',
    'ESE': 'East South East',
    'SE': 'South East',
    'SSE': 'South South East',
    'S': 'South',
    'SSW': 'South South West',
    'SW': 'South West',
    'WSW': 'West South West',
    'W': 'West',
    'WNW': 'West North West',
    'NW': 'North West',
    'NNW': 'North North West'
  },

  TTS_PRESETS: {
    standard: {
      breach: 'Traffic alert! {callsign}, {distance} {direction}, {altitude}.',
      approaching: 'Traffic approaching! {callsign}, {distance} {direction}, perimeter ETA {eta}.'
    },
    concise: {
      breach: 'Traffic alert! {distance} {direction}.',
      approaching: 'Traffic approaching! {distance} {direction}, ETA {eta}.'
    },
    direction_first: {
      breach: 'Traffic {direction}! {distance}, {altitude}.',
      approaching: 'Traffic approaching {direction}! {distance}, ETA {eta}.'
    }
  },

  getSpokenCardinal(cardinalCode) {
    if (!cardinalCode || typeof cardinalCode !== 'string') return '';
    const clean = cardinalCode.trim().toUpperCase();
    return this.CARDINAL_SPOKEN_MAP[clean] || cardinalCode.trim();
  },

  formatVoiceAdvisoryText(aircraft, alertStage = 'breached') {
    const isMetric = typeof isMetricMode === 'function' ? isMetricMode() : false;
    const rawCallsign = (aircraft && aircraft.callsign ? aircraft.callsign : 'Traffic').replace(/[^A-Za-z0-9]/g, ' ').trim();
    const callsign = rawCallsign || 'Traffic';

    let distText = '';
    let altText = '';

    if (aircraft) {
      if (isMetric) {
        const km = (aircraft.distanceMeters !== null && aircraft.distanceMeters !== undefined) ? (aircraft.distanceMeters / 1000).toFixed(1) : 'unknown';
        const m = (aircraft.altitude !== null && aircraft.altitude !== undefined) ? Math.round(aircraft.altitude * 0.3048) : 'unknown';
        distText = `${km} kilometers`;
        altText = `${m} meters`;
      } else {
        const mi = (aircraft.distanceMiles !== null && aircraft.distanceMiles !== undefined) ? aircraft.distanceMiles : 'unknown';
        const ft = (aircraft.altitude !== null && aircraft.altitude !== undefined) ? aircraft.altitude : 'unknown';
        distText = `${mi} miles`;
        altText = `${ft} feet`;
      }
    }

    const spokenDirection = (aircraft && aircraft.bearingCardinal) ? this.getSpokenCardinal(aircraft.bearingCardinal) : '';

    let etaText = 'soon';
    if (aircraft && typeof aircraft.etaSeconds === 'number' && aircraft.etaSeconds > 0) {
      const etaMin = Math.floor(aircraft.etaSeconds / 60);
      const etaSec = aircraft.etaSeconds % 60;
      etaText = etaMin > 0 ? `${etaMin} minute${etaMin > 1 ? 's' : ''} ${etaSec} seconds` : `${etaSec} seconds`;
    }

    const template = (alertStage === 'approaching')
      ? (this.ttsApproachingTemplate || (this.TTS_PRESETS && this.TTS_PRESETS.standard ? this.TTS_PRESETS.standard.approaching : 'Traffic approaching! {callsign}, {distance} {direction}, perimeter ETA {eta}.'))
      : (this.ttsBreachTemplate || (this.TTS_PRESETS && this.TTS_PRESETS.standard ? this.TTS_PRESETS.standard.breach : 'Traffic alert! {callsign}, {distance} {direction}, {altitude}.'));

    let text = template
      .replace(/\{callsign\}/gi, callsign)
      .replace(/\{distance\}/gi, distText)
      .replace(/\{direction\}/gi, spokenDirection)
      .replace(/\{cardinal\}/gi, spokenDirection)
      .replace(/\{altitude\}/gi, altText)
      .replace(/\{eta\}/gi, etaText)
      .replace(/\{stage\}/gi, alertStage);

    // Clean up extraneous whitespace and dangling punctuation if tokens are empty
    text = text
      .replace(/\s*,\s*,/g, ',')
      .replace(/\s{2,}/g, ' ')
      .replace(/\s+,/g, ',')
      .replace(/,\s*\./g, '.')
      .trim();

    return text;
  },



  radiusMiles: 3.0,



  ceilingFeet: 2500,



  warningMinutes: 2.0,



  coneDeviationDeg: 15,



  showCones: true,

  highAltitudeThresholdFt: 10000,

  suppressHighAltitudeCones: true,



  descentGradientEnabled: true,



  alertAnchorMode: 'auto', // 'auto' | 'mission' | 'pilot' | 'drone'



  showProximityRing: true,



  proximityCircleLayer: null,



  lastResolvedOrigin: null,



  _reanchorDebounceTimer: null,



  suppressAirportLanding: true,



  airportRadiusNm: 4.0,



  maxLandingAltitudeFt: 3000,



  airports: new Map(), // icao -> { icao, name, lat, lon, elevationFt }



  customEndpoint: '',



  serverHost: '127.0.0.1',



  serverPort: 30003,



  isSyncingAdsbConfig: false,



  isConnectingAdsbServer: false,



  activeTab: 'operations', // 'operations' | 'settings'



  externalProvider: 'adsb.lol', // 'adsb.lol' | 'custom'



  externalRadiusNM: 15,



  externalCustomUrl: '',



  externalWatchActive: false,



  externalWatchExpiresAt: 0,



  externalWatchTimer: null,



  lastExternalQueryTime: 0,



  isDrawerOpen: false,



  isSnoozed: false,



  snoozeUntil: 0,



  aircraft: [],



  breachedAircraft: [],



  approachingAircraft: [],



  lastAlertTimes: new Map(), // hex -> timestamp (30s cooldown for breached)



  lastApproachingAlertTimes: new Map(), // hex -> timestamp (45s cooldown for approaching)



  previousStatus: new Map(), // hex -> 'safe' | 'approaching' | 'breached'



  layerGroup: null,



  coneLayerGroup: null,



  mapMarkers: new Map(), // hex -> Leaflet marker



  mapCones: new Map(), // hex -> Leaflet polygon / layerGroup



  hoverConeLayer: null,



  hoveredHex: null,



  showTrails: true,



  trailDuration: '60s', // 'off' | '30s' | '60s' | '180s' | '300s'



  mapTrails: new Map(), // hex -> Leaflet polyline



  acHistory: new Map(), // hex -> Array<[lat, lon, alt, time]>



  audioContext: null,



  pollTimer: null,



  isPolling: false,



  eventSource: null,



  streamConnected: false,



  streamMode: 'disconnected', // 'sse' | 'polling' | 'disconnected'



  streamLat: null,



  streamLon: null,



  streamRadius: null,



  hardwareStatus: { connected: false, driverType: 'unknown', packets: 0 },







  init() {



    this.loadSettings();



    this.initMapLayer();



    this.bindEvents();



    this.updateControlsUI();



    if (typeof fetch === 'function') {
      const apiBase = (typeof getCompanionApiBase === 'function') ? getCompanionApiBase() : 'http://127.0.0.1:8765';
      const isLocalHost = !apiBase || apiBase.includes('127.0.0.1') || apiBase.includes('localhost');
      if (typeof Platform !== 'undefined' && typeof Platform.isNativeAndroid === 'function' && Platform.isNativeAndroid() && isLocalHost) {
        return;
      }
      fetch(apiBase + '/api/config/adsb', {

        headers: (typeof getCompanionAuthHeaders === 'function') ? getCompanionAuthHeaders() : {}

      })



        .then(res => res.ok ? res.json() : null)



        .then(cfg => {



          if (cfg && cfg.adsbHost) {



            this.syncAdsbConfigWithBridge({ tcpHost: cfg.adsbHost, tcpPort: cfg.adsbPort, connected: !!cfg.connected });



          }



        })



        .catch(() => {});



    }



    if (this.enabled) {



      this.startPolling();



    }



  },







  classifyAircraft(ac) {



    let type = 'aircraft';



    if (!ac) {



      type = 'aircraft';



    } else if (typeof ac === 'string') {



      const s = ac.toLowerCase();



      if (s === 'helicopter' || s === 'heli') type = 'helicopter';



      else if (s === 'jet') type = 'jet';



      else if (s === 'prop' || s === 'propeller') type = 'prop';



      else if (s === 'glider') type = 'glider';



      else if (s === 'balloon') type = 'balloon';



      else if (s === 'drone') type = 'drone';



      else type = 'aircraft';



    } else {



      const explicitType = (ac.aircraftType || ac.type || '').toString().trim().toLowerCase();



      if (['helicopter', 'jet', 'prop', 'glider', 'balloon', 'drone'].includes(explicitType)) {



        type = explicitType;



      } else {



        const cat = (ac.category || '').toString().trim().toUpperCase();



        if (cat === 'A7') {



          type = 'helicopter';



        } else if (cat === 'B1') {



          type = 'glider';



        } else if (cat === 'B2') {



          type = 'balloon';



        } else if (cat === 'B6') {



          type = 'drone';



        } else if (['A3', 'A4', 'A5', 'A6'].includes(cat)) {



          type = 'jet';



        } else if (cat === 'A1' || cat === 'A2') {



          type = 'prop';



        } else {



          const rawType = (ac.aircraftType || ac.t || ac.type || '').toString().trim().toUpperCase();



          const HELI_TYPES = new Set([



            'R22', 'R44', 'R66', 'B06', 'B206', 'B212', 'B214', 'B222', 'B230', 'B407', 'B412', 'B427', 'B429', 'B430',



            'UH1', 'AH1', 'OH58', 'H500', 'EC20', 'EC30', 'EC35', 'EC45', 'EC55', 'EC75', 'EC25',



            'H120', 'H125', 'H130', 'H135', 'H145', 'H155', 'H160', 'H175', 'H215', 'H225',



            'AS50', 'AS55', 'AS65', 'SA33', 'SA34', 'BO10', 'BK117',



            'S76', 'S92', 'S70', 'UH60', 'H60', 'H53', 'CH53', 'S61', 'S64', 'S300', 'S330', 'S333',



            'A109', 'A119', 'A139', 'A169', 'A189', 'AW09', 'AW10', 'EH10',



            'MD50', 'MD52', 'MD60', 'MD90', 'EXPL', 'CH47', 'H47', 'AH64', 'V22',



            'EN28', 'EN48', 'G2CA', 'MI8', 'MI17', 'MI24', 'MI26', 'KA27', 'KA32', 'KA52',



            'AL03', 'HUCO', 'LYNX', 'R216', 'R280'



          ]);



          const JET_TYPES = new Set([



            'B703', 'B712', 'B720', 'B721', 'B722', 'B731', 'B732', 'B733', 'B734', 'B735', 'B736', 'B737', 'B738', 'B739',



            'B37M', 'B38M', 'B39M', 'B741', 'B742', 'B743', 'B744', 'B748', 'B752', 'B753', 'B762', 'B763', 'B764',



            'B772', 'B773', 'B77L', 'B77W', 'B788', 'B789', 'B78X', 'C17', 'KC135', 'E3TF',



            'A306', 'A30B', 'A310', 'A318', 'A319', 'A320', 'A321', 'A20N', 'A21N', 'A332', 'A333', 'A338', 'A339',



            'A342', 'A343', 'A345', 'A346', 'A359', 'A35K', 'A388', 'A220', 'BCS1', 'BCS3',



            'E135', 'E145', 'E170', 'E175', 'E190', 'E195', 'E290', 'E295', 'E50P', 'E55P', 'E545', 'E550', 'PRM1',



            'CRJ1', 'CRJ2', 'CRJ7', 'CRJ9', 'CRJX', 'CL30', 'CL35', 'CL60', 'CL65',



            'GLEX', 'GL5T', 'GL6T', 'GL7T', 'GL8T', 'GLF4', 'GLF5', 'GLF6', 'G150', 'G200', 'G280', 'GA5C', 'GA6C', 'G650', 'G700', 'G800',



            'FA10', 'FA20', 'FA50', 'F900', 'F2TH', 'FA7X', 'FA8X', 'FA6X',



            'C500', 'C501', 'C510', 'C525', 'C25A', 'C25B', 'C25C', 'C25D', 'C550', 'C560', 'C56X', 'C650', 'C680', 'C68A', 'C700', 'C750',



            'LJ24', 'LJ25', 'LJ31', 'LJ35', 'LJ36', 'LJ40', 'LJ45', 'LJ55', 'LJ60', 'LJ70', 'LJ75',



            'BE40', 'H25B', 'HA420', 'SF50', 'PC24',



            'F15', 'F16', 'F18', 'F22', 'F35', 'T38', 'A10', 'B1', 'B2', 'B52', 'EUFI', 'RFL', 'TOR', 'HAWK', 'L39'



          ]);



          const PROP_TYPES = new Set([



            'C150', 'C152', 'C170', 'C172', 'C175', 'C177', 'C180', 'C182', 'C185', 'C206', 'C207', 'C208', 'C210', 'C310', 'C320', 'C337', 'C340', 'C402', 'C404', 'C414', 'C421',



            'PA18', 'PA22', 'PA24', 'PA28', 'PA30', 'PA31', 'PA32', 'PA34', 'PA38', 'PA44', 'PA46',



            'BE33', 'BE35', 'BE36', 'BE55', 'BE58', 'BE76', 'BE95', 'BE9L', 'BE20', 'BE30', 'B350', 'B190',



            'SR20', 'SR22', 'PC6', 'PC12', 'TBM7', 'TBM8', 'TBM9', 'TB10', 'TB20', 'TB21',



            'M20J', 'M20P', 'M20R', 'M20T', 'M20U', 'M20V', 'M20',



            'DA20', 'DA40', 'DA42', 'DA50', 'DA62',



            'RV3', 'RV4', 'RV6', 'RV7', 'RV8', 'RV9', 'RV10', 'RV12', 'RV14',



            'DHC2', 'DHC3', 'DHC6', 'DH8A', 'DH8B', 'DH8C', 'DH8D',



            'AT43', 'AT45', 'AT72', 'AT75', 'AT76', 'SF34', 'SB20', 'AA1', 'AA5'



          ]);







          if (HELI_TYPES.has(rawType)) {



            type = 'helicopter';



          } else if (JET_TYPES.has(rawType)) {



            type = 'jet';



          } else if (PROP_TYPES.has(rawType)) {



            type = 'prop';



          } else if (/^B7[0-9]|A3[0-9]|CRJ|E[12][0-9]{2}|GLF|CL[36]|LJ[0-9]|FA[0-9]/i.test(rawType)) {



            type = 'jet';



          } else if (/^C1[578][0-9]|C20[0-9]|PA[0-9]|BE[0-9]|SR2[02]|DA[246][0-9]|RV[0-9]/i.test(rawType)) {



            type = 'prop';



          } else if (/^R[246][246]|EC[0-9]|AS[0-9]|UH[0-9]|AW[0-9]|H[12][0-9]{2}/i.test(rawType)) {



            type = 'helicopter';



          } else {



            const callsign = (ac.callsign || ac.flight || '').toUpperCase();



            if (/(?:HELI|COPTER|LIFEFLIGHT|MEDEVAC|AIRAMB|AIRCARE|STAT|RESCUE|STAR\d|SKY\d|POLICE|CHP)/i.test(callsign)) {



              type = 'helicopter';



            } else if (/^(?:AAL|DAL|UAL|SWA|BAW|AFR|DLH|JBU|ASA|FFT|FDX|UPS)\d+/i.test(callsign)) {



              type = 'jet';



            } else {



              const spd = typeof ac.speed === 'number' ? ac.speed : 0;



              const alt = typeof ac.altitude === 'number' ? ac.altitude : (typeof ac.altBaro === 'number' ? ac.altBaro : 0);



              if (spd >= 260 || alt >= 20000) {



                type = 'jet';



              } else if (spd > 0 && spd <= 90 && alt > 0 && alt <= 2000) {



                type = 'helicopter';



              } else if (spd > 0 && spd <= 180 && alt > 0 && alt <= 14000) {



                type = 'prop';



              } else {



                type = 'aircraft';



              }



            }



          }



        }



      }



    }







    const META = {



      helicopter: { type: 'helicopter', label: 'Helicopter', emoji: '🚁' },



      jet: { type: 'jet', label: 'Jet', emoji: '✈️' },



      prop: { type: 'prop', label: 'GA Propeller', emoji: '🛩️' },



      glider: { type: 'glider', label: 'Glider', emoji: '🪁' },



      balloon: { type: 'balloon', label: 'Balloon', emoji: '🎈' },



      drone: { type: 'drone', label: 'Drone', emoji: '🛸' },



      aircraft: { type: 'aircraft', label: 'Aircraft', emoji: '✈️' }



    };



    return META[type] || META.aircraft;



  },







  getAircraftMeta(typeOrAc) {



    return this.classifyAircraft(typeOrAc);



  },







  getAircraftMarkerSvg(typeClass) {



    switch (typeClass) {



      case 'helicopter':



        return `<svg viewBox="0 0 32 32" width="20" height="20" fill="currentColor"><path d="M4 8h24v1.5H4z" opacity="0.9" stroke-linecap="round"/><path d="M15 8h2v3h-2z"/><path d="M13 11 C11 13 11 18 12.5 20.5 L15 20.5 L15 28 L17 28 L17 20.5 L19.5 20.5 C21 18 21 13 19 11 Z"/><path d="M17 26 L21 25 L21 30 L17 29 Z"/><path d="M9 15 h2 v5 H9 z M21 15 h2 v5 H21 z M11 18 h10 v1.2 H11 z" stroke-linecap="round"/></svg>`;



      case 'jet':



        return `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 2 C11.3 2 10.7 3.5 10.7 6 L10.7 9.8 L1.5 15.2 L1.5 17.5 L10.7 14.5 L10.7 19.2 L7.8 21.2 L7.8 23 L12 21.8 L16.2 23 L16.2 21.2 L13.3 19.2 L13.3 14.5 L22.5 17.5 L22.5 15.2 L13.3 9.8 L13.3 6 C13.3 3.5 12.7 2 12 2 Z"/><path d="M7 12.5 h1.8 v3.5 H7 z M15.2 12.5 h1.8 v3.5 H15.2 z"/></svg>`;



      case 'prop':



        return `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M7 3.2 h10 v1.2 H7 z" opacity="0.9"/><path d="M12 3.8 C11.2 3.8 10.8 5 10.8 7 L10.8 9 L1 9.5 L1 12.2 L10.8 11.8 L10.8 18.5 L6.8 19.2 L6.8 21.2 L12 20.6 L17.2 21.2 L17.2 19.2 L13.2 18.5 L13.2 11.8 L23 12.2 L23 9.5 L13.2 9 L13.2 7 C13.2 5 12.8 3.8 12 3.8 Z"/></svg>`;



      case 'glider':



        return `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 2.5 C11.4 2.5 11 3.5 11 5.5 L11 9.5 L0.5 10 L0.5 11.2 L11 11 L11 20.5 L8.5 21 L8.5 22.2 L12 21.8 L15.5 22.2 L15.5 21 L13 20.5 L13 11 L23.5 11.2 L23.5 10 L13 9.5 L13 5.5 C13 3.5 12.6 2.5 12 2.5 Z"/></svg>`;



      case 'drone':



        return `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="12" cy="12" r="3"/><circle cx="5" cy="5" r="3.5" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="19" cy="5" r="3.5" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="5" cy="19" r="3.5" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="19" cy="19" r="3.5" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M7.5 7.5 L16.5 16.5 M16.5 7.5 L7.5 16.5" stroke="currentColor" stroke-width="1.5"/></svg>`;



      default:



        return `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>`;



    }



  },







  async simulateAircraft(targetType = 'prop') {



    this.initAudioContext();



    const origin = this.getAlertOrigin();



    const homeLat = origin.lat;



    const homeLon = origin.lon;







    let simAircraft;



    if (targetType === 'helicopter') {



      simAircraft = {



        hex: 'A88888',



        callsign: 'MEDEVAC1',



        aircraftType: 'B407',



        category: 'A7',



        lat: homeLat + 0.009,



        lon: homeLon - 0.008,



        alt: 1200,



        speed: 95,



        track: 135



      };



    } else if (targetType === 'jet') {



      simAircraft = {



        hex: 'A77777',



        callsign: 'UAL452',



        aircraftType: 'B738',



        category: 'A3',



        lat: homeLat - 0.015,



        lon: homeLon + 0.015,



        alt: 2300,



        speed: 280,



        track: 315



      };



    } else if (targetType === 'approaching') {



      simAircraft = {



        hex: 'A55555',



        callsign: 'APPR101',



        aircraftType: 'SR22',



        category: 'A1',



        lat: homeLat + 0.055,



        lon: homeLon + 0.072,



        alt: 1800,



        speed: 135,



        track: 225



      };



    } else if (targetType === 'descending') {

      simAircraft = {

        hex: 'AD4444',

        callsign: 'DESCEND1',

        aircraftType: 'BE36',

        category: 'A1',

        lat: homeLat + 0.052,

        lon: homeLon + 0.052,

        alt: 2400,

        speed: 145,

        track: 225,

        verticalRate: -950,

        isDescending: true,

        descentSeverity: 'moderate',

        verticalRateFpm: -950

      };

    } else if (targetType === 'landing') {



      if (this.airports.size === 0) {

        this.registerAirport({

          icao: 'KVYS',

          name: 'Illinois Valley Regional Airport',

          lat: homeLat + 0.03,

          lon: homeLon + 0.03,

          elevationFt: 654

        });

      }

      const apt = this.airports.values().next().value;

      simAircraft = {

        hex: 'A66666',

        callsign: 'LANDER42',

        aircraftType: 'C172',

        category: 'A1',

        lat: apt ? apt.lat + 0.015 : homeLat + 0.02,

        lon: apt ? apt.lon + 0.015 : homeLon + 0.02,

        alt: 1400,

        speed: 75,

        track: 220,

        verticalRate: -500,

        isLanding: true,

        landingAirport: apt ? apt.icao : 'KVYS',

        coneSuppressed: true

      };



    } else if (targetType === 'high_alt') {

      simAircraft = {

        hex: 'A88888',

        callsign: 'CRUISE450',

        aircraftType: 'B738',

        category: 'A3',

        lat: homeLat + 0.035,

        lon: homeLon + 0.035,

        alt: 12000,

        speed: 420,

        track: 225,

        verticalRate: 0,

        isHighAltitude: true,

        coneSuppressed: this.suppressHighAltitudeCones

      };



    } else {



      // Propeller (C172)



      simAircraft = {



        hex: 'A99999',



        callsign: 'CESSNA172',



        aircraftType: 'C172',



        category: 'A1',



        lat: homeLat + 0.012,



        lon: homeLon + 0.012,



        alt: 1600,



        speed: 120,



        track: 225



      };



    }







    try {

      const apiBase = (typeof getCompanionApiBase === 'function') ? getCompanionApiBase() : 'http://127.0.0.1:8765';

      const authHeaders = (typeof getCompanionAuthHeaders === 'function') ? getCompanionAuthHeaders() : {};

      const res = await fetch(`${apiBase}/api/airspace/simulate`, {

        method: 'POST',

        headers: { 'Content-Type': 'application/json', ...authHeaders },

        body: JSON.stringify(simAircraft)

      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      if (simAircraft && simAircraft.hex) {
        this.lastAlertTimes.delete(simAircraft.hex);
        this.lastApproachingAlertTimes.delete(simAircraft.hex);
        this.previousStatus.delete(simAircraft.hex);
      }
      await this.pollAirspace();
      this.updateVisualBanner();
      this.updateTopbarAndHud();
      this.updateMapMarkers();
      this.updateDrawerAircraftList();

    } catch (e) {

      // If offline or unauthorized, inject directly into manager

      const isHighAlt = targetType === 'high_alt';
      const isApproaching = (targetType === 'approaching' || targetType === 'descending') && !isHighAlt;

      const isLanding = targetType === 'landing';

      const isDescending = targetType === 'descending';

      simAircraft.distanceMeters = isHighAlt ? 7500 : (isApproaching ? 8368 : (isLanding ? 4200 : 1500));

      simAircraft.distanceMiles = isHighAlt ? 4.66 : (isApproaching ? 5.2 : (isLanding ? 2.6 : 0.93));

      simAircraft.bearingDeg = 45;

      simAircraft.bearingCardinal = 'NE';

      simAircraft.isBreached = !isApproaching && !isLanding && !isHighAlt;

      simAircraft.isConeWarning = isApproaching;

      simAircraft.isHighAltitude = isHighAlt;

      simAircraft.isDescending = isDescending;

      simAircraft.descentSeverity = isDescending ? 'moderate' : null;

      simAircraft.verticalRate = isDescending ? -950 : (simAircraft.verticalRate || 0);

      simAircraft.verticalRateFpm = isDescending ? -950 : (simAircraft.verticalRate || 0);

      simAircraft.isLanding = isLanding;

      simAircraft.landingAirport = isLanding ? (simAircraft.landingAirport || 'KVYS') : null;

      simAircraft.coneSuppressed = isLanding || (isHighAlt && this.suppressHighAltitudeCones);

      simAircraft.status = isApproaching ? 'approaching' : (isLanding ? 'landing' : (isHighAlt ? 'safe' : 'breached'));

      simAircraft.etaSeconds = isApproaching ? 51 : null;

      simAircraft.closingSpeedKts = isApproaching ? 135 : null;

      simAircraft.coneLengthMeters = isApproaching ? 8334 : 0;

      simAircraft.source = 'simulated';

      simAircraft.latitude = simAircraft.lat;

      simAircraft.longitude = simAircraft.lon;

      simAircraft.altitude = simAircraft.alt;



      const existingIdx = this.aircraft.findIndex(a => a.hex === simAircraft.hex);

      if (existingIdx >= 0) {

        this.aircraft[existingIdx] = simAircraft;

      } else {

        this.aircraft.push(simAircraft);

      }

      this.breachedAircraft = this.aircraft.filter(a => a.isBreached);

      this.approachingAircraft = this.aircraft.filter(a => !a.isBreached && (a.isConeWarning || a.status === 'approaching'));

      if (simAircraft && simAircraft.hex) {
        this.lastAlertTimes.delete(simAircraft.hex);
        this.lastApproachingAlertTimes.delete(simAircraft.hex);
      }
      this.triggerAudioAlert(simAircraft, isApproaching ? 'approaching' : 'breached');

      this.updateVisualBanner();

      this.updateTopbarAndHud();

      this.updateMapMarkers();

      this.updateDrawerAircraftList();

    }

  },







  loadSettings() {



    try {



      if (typeof localStorage !== 'undefined') {



        const savedEnabled = localStorage.getItem('aalaapi_adsb_enabled');



        if (savedEnabled !== null) this.enabled = savedEnabled === 'true';







        const savedSound = localStorage.getItem('aalaapi_adsb_sound');



        if (savedSound !== null) this.soundEnabled = savedSound === 'true';







        const savedType = localStorage.getItem('aalaapi_adsb_sound_type');

        if (savedType) this.soundType = savedType;

        const savedTtsPreset = localStorage.getItem('aalaapi_adsb_tts_preset');
        if (savedTtsPreset) this.ttsPreset = savedTtsPreset;

        const savedTtsBreach = localStorage.getItem('aalaapi_adsb_tts_breach_template');
        if (savedTtsBreach) this.ttsBreachTemplate = savedTtsBreach;

        const savedTtsApproaching = localStorage.getItem('aalaapi_adsb_tts_approaching_template');
        if (savedTtsApproaching) this.ttsApproachingTemplate = savedTtsApproaching;







        const savedTrails = localStorage.getItem('aalaapi_adsb_show_trails');



        if (savedTrails !== null) this.showTrails = savedTrails === 'true';







        const savedDuration = localStorage.getItem('aalaapi_adsb_trail_duration');



        if (savedDuration) {



          this.trailDuration = savedDuration;



          this.showTrails = (savedDuration !== 'off');



        }







        const savedRadius = localStorage.getItem('aalaapi_adsb_radius_mi');



        if (savedRadius) this.radiusMiles = parseFloat(savedRadius) || 3.0;







        const savedCeiling = localStorage.getItem('aalaapi_adsb_ceiling_ft');



        if (savedCeiling) this.ceilingFeet = parseInt(savedCeiling, 10) || 2500;







        const savedWarnMin = localStorage.getItem('aalaapi_adsb_warning_min');



        if (savedWarnMin) this.warningMinutes = parseFloat(savedWarnMin) || 2.0;







        const savedConeDev = localStorage.getItem('aalaapi_adsb_cone_dev_deg');



        if (savedConeDev) this.coneDeviationDeg = parseInt(savedConeDev, 10) || 15;







        const savedShowCones = localStorage.getItem('aalaapi_adsb_show_cones');



        if (savedShowCones !== null) this.showCones = savedShowCones !== 'false';



        const savedHighAlt = localStorage.getItem('aalaapi_adsb_high_altitude_ft');



        if (savedHighAlt) this.highAltitudeThresholdFt = parseInt(savedHighAlt, 10) || 10000;



        const savedSuppressHighAlt = localStorage.getItem('aalaapi_adsb_suppress_high_altitude_cones');



        if (savedSuppressHighAlt !== null) this.suppressHighAltitudeCones = savedSuppressHighAlt !== 'false';



        const savedDescentGrad = localStorage.getItem('aalaapi_adsb_descent_gradient');



        if (savedDescentGrad !== null) this.descentGradientEnabled = savedDescentGrad !== 'false';



        const savedAnchorMode = localStorage.getItem('aalaapi_adsb_anchor_mode');



        if (savedAnchorMode) this.alertAnchorMode = savedAnchorMode;



        const savedShowRing = localStorage.getItem('aalaapi_adsb_show_proximity_ring');



        if (savedShowRing !== null) this.showProximityRing = savedShowRing !== 'false';



        const savedSuppressLanding = localStorage.getItem('aalaapi_adsb_suppress_airport_landing');



        if (savedSuppressLanding !== null) this.suppressAirportLanding = savedSuppressLanding !== 'false';



        const savedAirportRadius = localStorage.getItem('aalaapi_adsb_airport_radius_nm');



        if (savedAirportRadius) this.airportRadiusNm = parseFloat(savedAirportRadius) || 4.0;







        const savedEndpoint = localStorage.getItem('aalaapi_adsb_custom_endpoint');



        if (savedEndpoint) this.customEndpoint = savedEndpoint;







        const savedHost = localStorage.getItem('aalaapi_adsb_host');



        if (savedHost) this.serverHost = savedHost.trim();







        const savedPort = localStorage.getItem('aalaapi_adsb_port');



        if (savedPort) this.serverPort = parseInt(savedPort, 10) || 30003;







        const savedExtProvider = localStorage.getItem('aalaapi_adsb_ext_provider');



        if (savedExtProvider) this.externalProvider = savedExtProvider;







        const savedExtRadius = localStorage.getItem('aalaapi_adsb_ext_radius');



        if (savedExtRadius) this.externalRadiusNM = parseInt(savedExtRadius, 10) || 15;







        const savedExtUrl = localStorage.getItem('aalaapi_adsb_ext_custom_url');



        if (savedExtUrl) this.externalCustomUrl = savedExtUrl;



      }



    } catch (e) {}



  },







  saveSettings() {



    try {



      if (typeof localStorage !== 'undefined') {



        localStorage.setItem('aalaapi_adsb_enabled', String(this.enabled));



        localStorage.setItem('aalaapi_adsb_sound', String(this.soundEnabled));



        localStorage.setItem('aalaapi_adsb_sound_type', this.soundType);

        localStorage.setItem('aalaapi_adsb_tts_preset', this.ttsPreset || 'standard');
        localStorage.setItem('aalaapi_adsb_tts_breach_template', this.ttsBreachTemplate || (this.TTS_PRESETS && this.TTS_PRESETS.standard ? this.TTS_PRESETS.standard.breach : 'Traffic alert! {callsign}, {distance} {direction}, {altitude}.'));
        localStorage.setItem('aalaapi_adsb_tts_approaching_template', this.ttsApproachingTemplate || (this.TTS_PRESETS && this.TTS_PRESETS.standard ? this.TTS_PRESETS.standard.approaching : 'Traffic approaching! {callsign}, {distance} {direction}, perimeter ETA {eta}.'));



        localStorage.setItem('aalaapi_adsb_show_trails', String(this.showTrails));



        localStorage.setItem('aalaapi_adsb_trail_duration', this.trailDuration || '60s');



        localStorage.setItem('aalaapi_adsb_radius_mi', String(this.radiusMiles));



        localStorage.setItem('aalaapi_adsb_ceiling_ft', String(this.ceilingFeet));



        localStorage.setItem('aalaapi_adsb_warning_min', String(this.warningMinutes || 2.0));



        localStorage.setItem('aalaapi_adsb_cone_dev_deg', String(this.coneDeviationDeg || 15));



        localStorage.setItem('aalaapi_adsb_show_cones', String(this.showCones));



        localStorage.setItem('aalaapi_adsb_high_altitude_ft', String(this.highAltitudeThresholdFt || 10000));



        localStorage.setItem('aalaapi_adsb_suppress_high_altitude_cones', String(this.suppressHighAltitudeCones));



        localStorage.setItem('aalaapi_adsb_descent_gradient', String(this.descentGradientEnabled));



        localStorage.setItem('aalaapi_adsb_anchor_mode', this.alertAnchorMode || 'auto');



        localStorage.setItem('aalaapi_adsb_show_proximity_ring', String(this.showProximityRing));



        localStorage.setItem('aalaapi_adsb_suppress_airport_landing', String(this.suppressAirportLanding));



        localStorage.setItem('aalaapi_adsb_airport_radius_nm', String(this.airportRadiusNm || 4.0));



        localStorage.setItem('aalaapi_adsb_custom_endpoint', this.customEndpoint || '');



        localStorage.setItem('aalaapi_adsb_host', this.serverHost || '127.0.0.1');



        localStorage.setItem('aalaapi_adsb_port', String(this.serverPort || 30003));



        localStorage.setItem('aalaapi_adsb_ext_provider', this.externalProvider || 'adsb.lol');



        localStorage.setItem('aalaapi_adsb_ext_radius', String(this.externalRadiusNM || 15));



        localStorage.setItem('aalaapi_adsb_ext_custom_url', this.externalCustomUrl || '');



      }



    } catch (e) {}



  },







  getEffectiveEndpoint() {



    if (this.customEndpoint && this.customEndpoint.trim()) {



      return this.customEndpoint.trim();



    }



    const apiBase = (typeof getCompanionApiBase === 'function') ? getCompanionApiBase() : 'http://127.0.0.1:8765';



    return `${apiBase}/api/airspace/bounds`;



  },







  getEffectiveStreamEndpoint() {



    if (this.customEndpoint && this.customEndpoint.trim()) {



      return this.customEndpoint.trim().replace(/\/api\/airspace\/bounds\/?$/, '/api/airspace/stream');



    }



    const apiBase = (typeof getCompanionApiBase === 'function') ? getCompanionApiBase() : 'http://127.0.0.1:8765';



    return `${apiBase}/api/airspace/stream`;



  },







  initMapLayer() {



    const leaflet = (typeof L !== 'undefined' && L) || (typeof window !== 'undefined' && window.L) || (typeof global !== 'undefined' && global.L);



    const m = (typeof map !== 'undefined' && map) || (typeof window !== 'undefined' && window.map) || (typeof global !== 'undefined' && global.map);



    if (leaflet && m && !this.layerGroup && m.addLayer && leaflet.layerGroup) {



      const lg = leaflet.layerGroup();

      if (lg && typeof lg.addTo === 'function') {

        this.layerGroup = lg.addTo(m);

      } else if (lg) {

        this.layerGroup = lg;

      }



    }



    if (leaflet && m && !this.coneLayerGroup && m.addLayer && leaflet.layerGroup) {



      this.coneLayerGroup = leaflet.layerGroup();



      if (this.showCones && this.coneLayerGroup && typeof this.coneLayerGroup.addTo === 'function') {

        this.coneLayerGroup.addTo(m);

      }



        if (m.on && !this._adsbGradientMapBound) {

          this._adsbGradientMapBound = true;

          m.on('move zoom', () => {

            this.refreshActiveGradients();

          });

        }



    }



  },







  calculateDestinationPoint(lat, lon, bearingDeg, distanceMeters) {



    const EARTH_RADIUS = 6371000;



    const toRad = Math.PI / 180;



    const toDeg = 180 / Math.PI;



    const phi1 = lat * toRad;



    const lambda1 = lon * toRad;



    const theta = ((bearingDeg % 360 + 360) % 360) * toRad;



    const delta = distanceMeters / EARTH_RADIUS;







    const sinPhi2 = Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(theta);



    const phi2 = Math.asin(Math.max(-1, Math.min(1, sinPhi2)));



    const y = Math.sin(theta) * Math.sin(delta) * Math.cos(phi1);



    const x = Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2);



    const lambda2 = lambda1 + Math.atan2(y, x);







    const destLat = phi2 * toDeg;



    const destLon = ((lambda2 * toDeg + 540) % 360) - 180;



    return { lat: destLat, lon: destLon };



  },







  shortestAngularDifference(deg1, deg2) {



    let diff = (deg1 - deg2) % 360;



    if (diff > 180) diff -= 360;



    if (diff < -180) diff += 360;



    return diff;



  },







  checkAirportAirspace(ac) {

    const result = { isLanding: false, airport: null, distanceNm: null };

    if (!ac || ac.latitude === null || ac.longitude === null || ac.latitude === undefined || ac.longitude === undefined) {

      return result;

    }

    const alt = ac.altitude !== null && ac.altitude !== undefined

      ? ac.altitude

      : (ac.altitudeGeometric !== null && ac.altitudeGeometric !== undefined ? ac.altitudeGeometric : null);

    const maxAlt = this.maxLandingAltitudeFt || 3000;

    const vRate = typeof ac.verticalRate === 'number' && !isNaN(ac.verticalRate) ? ac.verticalRate : 0;

    const isDescending = vRate <= -400;



    const toRad = Math.PI / 180;

    for (const apt of this.airports.values()) {

      if (typeof apt.lat !== 'number' || typeof apt.lon !== 'number') continue;

      const dLat = (apt.lat - ac.latitude) * toRad;

      const dLon = (apt.lon - ac.longitude) * toRad;

      const a = Math.sin(dLat / 2) ** 2 + Math.cos(ac.latitude * toRad) * Math.cos(apt.lat * toRad) * Math.sin(dLon / 2) ** 2;

      const distM = 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

      const distNm = distM / 1852.0;



      if (distNm <= this.airportRadiusNm) {

        if (alt === null || alt <= maxAlt || isDescending) {

          result.isLanding = true;

          result.airport = apt;

          result.distanceNm = parseFloat(distNm.toFixed(2));

          return result;

        }

      }

    }

    return result;

  },



  registerAirport(apt) {

    if (!apt || (!apt.icao && !apt.id && !apt.name)) return;

    const icao = (apt.icao || apt.id || apt.stationIdentifier || apt.name).toUpperCase();

    const lat = apt.lat !== undefined ? apt.lat : (apt.latitude !== undefined ? apt.latitude : null);

    const lon = apt.lon !== undefined ? apt.lon : (apt.longitude !== undefined ? apt.longitude : null);

    if (lat === null || lon === null) return;

    this.airports.set(icao, {

      icao,

      name: apt.name || icao,

      lat: Number(lat),

      lon: Number(lon),

      elevationFt: apt.elevationFt || apt.elevation || 0

    });

  },



  getAlertOrigin() {

    const mode = this.alertAnchorMode || 'auto';

    let origin = null;



    const cm = (typeof centerMarker !== 'undefined' && centerMarker) || (typeof window !== 'undefined' && window.centerMarker) || (typeof global !== 'undefined' && global.centerMarker) || null;

    const uLoc = (typeof userLocation !== 'undefined' && userLocation) || (typeof window !== 'undefined' && window.userLocation) || (typeof global !== 'undefined' && global.userLocation) || null;

    const mapInst = (typeof map !== 'undefined' && map) || (typeof window !== 'undefined' && window.map) || (typeof global !== 'undefined' && global.map) || null;



    if (mode === 'pilot') {

      if (uLoc && typeof uLoc.lat === 'number') {

        origin = { lat: uLoc.lat, lon: uLoc.lon, source: 'pilot', label: 'Pilot (Device GPS)' };

      }

    } else if (mode === 'drone') {

      const drone = this.getActiveDroneCoordinates();

      if (drone) {

        origin = { lat: drone.lat, lon: drone.lon, source: 'drone', label: `Live Drone (${drone.id || 'Active'})` };

      }

    } else if (mode === 'mission') {

      if (cm && typeof cm.getLatLng === 'function') {

        const ll = cm.getLatLng();

        origin = { lat: ll.lat, lon: ll.lng, source: 'mission', label: 'Mission Center' };

      }

    }



    // Auto sequence: Mission Center -> Pilot Location -> Active Drone -> Map Center -> Default Fallback

    if (!origin) {

      if (cm && typeof cm.getLatLng === 'function') {

        const ll = cm.getLatLng();

        origin = { lat: ll.lat, lon: ll.lng, source: 'mission', label: 'Mission Center' };

      } else if (uLoc && typeof uLoc.lat === 'number') {

        origin = { lat: uLoc.lat, lon: uLoc.lon, source: 'pilot', label: 'Pilot (Device GPS)' };

      } else {

        const drone = this.getActiveDroneCoordinates();

        if (drone) {

          origin = { lat: drone.lat, lon: drone.lon, source: 'drone', label: `Live Drone (${drone.id || 'Active'})` };

        } else if (mapInst && typeof mapInst.getCenter === 'function') {

          const ll = mapInst.getCenter();

          origin = { lat: ll.lat, lon: ll.lng, source: 'map', label: 'Map Center' };

        } else {

          origin = { lat: 41.3215, lon: -88.9950, source: 'default', label: 'Default (Utica, IL)' };

        }

      }

    }



    this.lastResolvedOrigin = origin;

    return origin;

  },



  getActiveDroneCoordinates() {

    if (typeof RemoteIdRadar !== 'undefined' && RemoteIdRadar && Array.isArray(RemoteIdRadar.activeDrones)) {

      const d = RemoteIdRadar.activeDrones.find(x => x.latitude && x.longitude && !x.signalLost) ||

                RemoteIdRadar.activeDrones.find(x => x.latitude && x.longitude);

      if (d) return { lat: d.latitude, lon: d.longitude, id: d.callsign || d.id };

    }

    if (typeof currentDronePos !== 'undefined' && currentDronePos && typeof currentDronePos.lat === 'number') {

      return { lat: currentDronePos.lat, lon: currentDronePos.lng || currentDronePos.lon, id: 'Telemetry' };

    }

    return null;

  },



  updateProximityRing() {

    const leaflet = (typeof L !== 'undefined' && L) || (typeof window !== 'undefined' && window.L) || (typeof global !== 'undefined' && global.L) || null;

    if (!leaflet || !this.layerGroup || typeof leaflet.circle !== 'function') return;



    if (!this.showProximityRing || !this.enabled) {

      if (this.proximityCircleLayer) {

        try { this.layerGroup.removeLayer(this.proximityCircleLayer); } catch (_) {}

        this.proximityCircleLayer = null;

      }

      return;

    }



    const origin = this.getAlertOrigin();

    const radiusMeters = this.radiusMiles * 1609.344;

    const hasBreach = !!this.hasActiveThreat || (Array.isArray(this.breachedAircraft) && this.breachedAircraft.length > 0);

    const hasApproaching = !!this.hasActiveConeWarning || (Array.isArray(this.approachingAircraft) && this.approachingAircraft.length > 0);



    const strokeColor = hasBreach ? '#ef4444' : (hasApproaching ? '#f59e0b' : '#38bdf8');

    const fillColor = hasBreach ? '#ef4444' : (hasApproaching ? '#f59e0b' : '#38bdf8');

    const fillOpacity = hasBreach ? 0.08 : (hasApproaching ? 0.05 : 0.03);



    if (!this.proximityCircleLayer) {

      this.proximityCircleLayer = leaflet.circle([origin.lat, origin.lon], {

        radius: radiusMeters,

        color: strokeColor,

        weight: hasBreach ? 2.5 : (hasApproaching ? 2.0 : 1.5),

        dashArray: '6, 6',

        fillColor: fillColor,

        fillOpacity: fillOpacity,

        className: `adsb-proximity-ring ${hasBreach ? 'breached' : (hasApproaching ? 'approaching' : '')}`

      });

      if (this.proximityCircleLayer && typeof this.proximityCircleLayer.addTo === 'function') {

        this.proximityCircleLayer.addTo(this.layerGroup);

      } else if (this.layerGroup && typeof this.layerGroup.addLayer === 'function') {

        this.layerGroup.addLayer(this.proximityCircleLayer);

      }

    } else {

      if (typeof this.proximityCircleLayer.setLatLng === 'function') {

        this.proximityCircleLayer.setLatLng([origin.lat, origin.lon]);

      }

      if (typeof this.proximityCircleLayer.setRadius === 'function') {

        this.proximityCircleLayer.setRadius(radiusMeters);

      }

      if (typeof this.proximityCircleLayer.setStyle === 'function') {

        this.proximityCircleLayer.setStyle({

          color: strokeColor,

          weight: hasBreach ? 2.5 : (hasApproaching ? 2.0 : 1.5),

          dashArray: '6, 6',

          fillColor: fillColor,

          fillOpacity: fillOpacity,

          className: `adsb-proximity-ring ${hasBreach ? 'breached' : (hasApproaching ? 'approaching' : '')}`

        });

      }

    }



    const ringEl = (this.proximityCircleLayer && typeof this.proximityCircleLayer.getElement === 'function') ? this.proximityCircleLayer.getElement() : null;

    if (ringEl && ringEl.classList) {

      if (hasBreach) {

        ringEl.classList.add('breached');

        ringEl.classList.remove('approaching');

      } else if (hasApproaching) {

        ringEl.classList.add('approaching');

        ringEl.classList.remove('breached');

      } else {

        ringEl.classList.remove('breached');

        ringEl.classList.remove('approaching');

      }

    }

  },



  onOriginMoved() {

    const origin = this.getAlertOrigin();

    const homeLat = origin.lat;

    const homeLon = origin.lon;



    const rProx = this.radiusMiles * 1609.344;

    const maxCeiling = this.ceilingFeet || 2500;



    for (const ac of this.aircraft) {

      if (ac.latitude !== null && ac.longitude !== null && typeof ac.latitude === 'number') {

        const toRad = Math.PI / 180;

        const dLat = (homeLat - ac.latitude) * toRad;

        const dLon = (homeLon - ac.longitude) * toRad;

        const a = Math.sin(dLat / 2) ** 2 + Math.cos(ac.latitude * toRad) * Math.cos(homeLat * toRad) * Math.sin(dLon / 2) ** 2;

        const d = 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        ac.distanceMeters = Math.round(d);

        ac.distanceMiles = parseFloat((d / 1609.344).toFixed(2));

        ac.distanceNm = parseFloat((d / 1852).toFixed(2));



        const y = Math.sin((homeLon - ac.longitude) * toRad) * Math.cos(homeLat * toRad);

        const x = Math.cos(ac.latitude * toRad) * Math.sin(homeLat * toRad) - Math.sin(ac.latitude * toRad) * Math.cos(homeLat * toRad) * Math.cos((homeLon - ac.longitude) * toRad);

        ac.bearingDeg = Math.round((Math.atan2(y, x) * 180 / Math.PI + 360) % 360);

        const CARDINALS = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];

        ac.bearingCardinal = CARDINALS[Math.round(ac.bearingDeg / 22.5) % 16];



        const alt = ac.altitude !== null ? ac.altitude : (ac.altitudeGeometric !== null ? ac.altitudeGeometric : null);

        let groundElevFt = 0;
        if (typeof elevationServiceInstance !== 'undefined' && elevationServiceInstance) {
          if (elevationServiceInstance.cachedDem && typeof elevationServiceInstance.cachedDem.sampleAt === 'function') {
            const m = elevationServiceInstance.cachedDem.sampleAt(homeLat, homeLon);
            if (m !== null && !isNaN(m)) groundElevFt = m * 3.28084;
          }
        }
        const altAgl = alt !== null ? Math.max(0, alt - groundElevFt) : null;
        ac.altitudeAgl = altAgl;
        ac.isHighAltitude = (altAgl !== null && altAgl >= (this.highAltitudeThresholdFt || 10000));
        if (ac.isHighAltitude && this.suppressHighAltitudeCones) {
          ac.coneSuppressed = true;
          ac.isConeWarning = false;
        }

        if (!ac.isLanding && !ac.coneSuppressed) {

          const coneEval = this.evaluateAircraftCone(ac, homeLat, homeLon);

          ac.coneLengthMeters = coneEval.coneLengthMeters;

          ac.offBoresightDeg = coneEval.offBoresightDeg;

          ac.isConeWarning = coneEval.isConeWarning;

          ac.etaSeconds = coneEval.etaSeconds;

          ac.closingSpeedKts = coneEval.closingSpeedKts;

          ac.entryDistanceMeters = coneEval.entryDistanceMeters;

        }



        ac.isWithinRadius = (d <= rProx);

        ac.isBreached = ac.isWithinRadius && !ac.isLanding && !ac.coneSuppressed && (alt === null || alt <= maxCeiling);

        ac.status = ac.isBreached ? 'breached' : (ac.isConeWarning ? 'approaching' : (ac.isLanding ? 'landing' : 'safe'));

      }

    }



    this.breachedAircraft = this.aircraft.filter(a => a.isBreached);

    this.approachingAircraft = this.aircraft.filter(a => !a.isBreached && (a.isConeWarning || a.status === 'approaching'));



    this.updateVisualBanner();

    this.renderAirspaceOverlays();

    this.updateDrawerAircraftList();

    this.updateControlsUI();



    // Debounced stream re-subscription if coordinates moved > 25 meters (~0.00025 deg)

    if (this.streamConnected && this.streamLat !== null && this.streamLon !== null) {

      const distDelta = Math.hypot(homeLat - this.streamLat, homeLon - this.streamLon);

      if (distDelta > 0.00025 || this.streamRadius !== this.radiusMiles) {

        if (this._reanchorDebounceTimer) clearTimeout(this._reanchorDebounceTimer);

        this._reanchorDebounceTimer = setTimeout(() => {

          this.connectStream();

        }, 350);

      }

    }

  },



  ensureSvgDefs(m, targetLayerOrSvg) {

    const mapInst = m || (typeof map !== 'undefined' && map) || (typeof window !== 'undefined' && window.map) || null;

    let targetSvg = null;



    // 1. Target direct owner SVG from Leaflet polygon layer or path

    if (targetLayerOrSvg) {

      if (targetLayerOrSvg.nodeName && targetLayerOrSvg.nodeName.toLowerCase() === 'svg') {

        targetSvg = targetLayerOrSvg;

      } else if (targetLayerOrSvg._path && targetLayerOrSvg._path.ownerSVGElement) {

        targetSvg = targetLayerOrSvg._path.ownerSVGElement;

      } else if (targetLayerOrSvg._renderer && targetLayerOrSvg._renderer._container && targetLayerOrSvg._renderer._container.nodeName && targetLayerOrSvg._renderer._container.nodeName.toLowerCase() === 'svg') {

        targetSvg = targetLayerOrSvg._renderer._container;

      }

    }



    // 2. Leaflet's renderer container on map

    if (!targetSvg && mapInst) {

      if (mapInst._renderer && mapInst._renderer._container && mapInst._renderer._container.nodeName && mapInst._renderer._container.nodeName.toLowerCase() === 'svg') {

        targetSvg = mapInst._renderer._container;

      } else if (mapInst.getPanes && mapInst.getPanes().overlayPane) {

        targetSvg = mapInst.getPanes().overlayPane.querySelector('svg.leaflet-zoom-animated') || mapInst.getPanes().overlayPane.querySelector('svg');

      }

    }



    if (!targetSvg) {

      if (!mapInst || !mapInst.getPanes) return null;

      const overlayPane = mapInst.getPanes().overlayPane;

      if (!overlayPane) return null;

      targetSvg = overlayPane.querySelector('svg');

      if (!targetSvg) {

        targetSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

        targetSvg.setAttribute('class', 'leaflet-zoom-animated adsb-svg-root');

        targetSvg.style.position = 'absolute';

        targetSvg.style.left = '0';

        targetSvg.style.top = '0';

        targetSvg.style.width = '100%';

        targetSvg.style.height = '100%';

        overlayPane.appendChild(targetSvg);

      }

    }



    let defs = targetSvg.querySelector('defs#adsb-cone-defs');

    if (!defs) {

      defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');

      defs.id = 'adsb-cone-defs';

      targetSvg.insertBefore(defs, targetSvg.firstChild);

    }



    // Mirror defs to all other SVG containers in overlayPane to prevent cross-root fragmentation on Android WebView

    const overlayPane = mapInst && mapInst.getPanes ? mapInst.getPanes().overlayPane : null;
    if (overlayPane && typeof overlayPane.querySelectorAll === 'function') {
      const allSvgs = overlayPane.querySelectorAll('svg');

      for (let i = 0; i < allSvgs.length; i++) {

        const svgEl = allSvgs[i];

        if (svgEl !== targetSvg && !svgEl.querySelector('defs#adsb-cone-defs')) {

          const mirrorDefs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');

          mirrorDefs.id = 'adsb-cone-defs';

          svgEl.insertBefore(mirrorDefs, svgEl.firstChild);

        }

      }

    }



    return defs;

  },



  updateConeGradient(ac, coneGeom, coneColor, m, targetLayerOrSvg) {

    const mapInst = m || (typeof map !== 'undefined' && map) || (typeof window !== 'undefined' && window.map) || null;

    if (!mapInst || !mapInst.latLngToLayerPoint || !coneGeom || !coneGeom.centerLineLatLngs) return;

    const defs = this.ensureSvgDefs(mapInst, targetLayerOrSvg);

    if (!defs) return;



    const gradId = `adsb-cone-grad-${ac.hex}`;

    const pApex = mapInst.latLngToLayerPoint([ac.latitude, ac.longitude]);

    const centerDest = coneGeom.centerLineLatLngs[1];

    const pDest = mapInst.latLngToLayerPoint(centerDest);



    // Choose target descent intrusion color based on vertical rate severity

    let targetColor = '#ea580c';

    let targetOpacity = 0.65;

    const vRate = typeof ac.verticalRate === 'number' && !isNaN(ac.verticalRate) ? ac.verticalRate : (ac.verticalRateFpm || 0);

    const severity = ac.descentSeverity || (vRate < -1200 ? 'severe' : (vRate < -500 ? 'moderate' : 'mild'));



    if (severity === 'severe') {

      targetColor = '#ef4444';

      targetOpacity = 0.85;

    } else if (severity === 'moderate') {

      targetColor = '#ea580c';

      targetOpacity = 0.70;

    } else {

      targetColor = '#f59e0b';

      targetOpacity = 0.55;

    }



    const startOpacity = (ac.status === 'approaching' || ac.isConeWarning) ? 0.35 : 0.20;



    // Helper to configure linearGradient attributes and SVG stop elements with explicit namespaces

    const setupGradientElement = (grad) => {

      grad.setAttribute('gradientUnits', 'userSpaceOnUse');

      grad.setAttribute('x1', String(pApex.x));

      grad.setAttribute('y1', String(pApex.y));

      grad.setAttribute('x2', String(pDest.x));

      grad.setAttribute('y2', String(pDest.y));



      while (grad.firstChild) {

        grad.removeChild(grad.firstChild);

      }



      const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');

      stop1.setAttribute('offset', '0%');

      stop1.setAttribute('stop-color', coneColor);

      stop1.setAttribute('stop-opacity', String(startOpacity));

      stop1.style.stopColor = coneColor;

      stop1.style.stopOpacity = String(startOpacity);



      const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');

      stop2.setAttribute('offset', '100%');

      stop2.setAttribute('stop-color', targetColor);

      stop2.setAttribute('stop-opacity', String(targetOpacity));

      stop2.style.stopColor = targetColor;

      stop2.style.stopOpacity = String(targetOpacity);



      grad.appendChild(stop1);

      grad.appendChild(stop2);

    };



    // Update in primary defs container

    let primaryGrad = defs.querySelector(`#${gradId}`);

    if (!primaryGrad) {

      primaryGrad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');

      primaryGrad.id = gradId;

      defs.appendChild(primaryGrad);

    }

    setupGradientElement(primaryGrad);



    // Sync across all defs#adsb-cone-defs in overlayPane to guarantee same-root resolution in WebView

    const overlayPane = mapInst && mapInst.getPanes ? mapInst.getPanes().overlayPane : null;
    if (overlayPane && typeof overlayPane.querySelectorAll === 'function') {
      const allDefs = overlayPane.querySelectorAll('defs#adsb-cone-defs');

      for (let i = 0; i < allDefs.length; i++) {

        const d = allDefs[i];

        if (d !== defs) {

          let g = d.querySelector(`#${gradId}`);

          if (!g) {

            g = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');

            g.id = gradId;

            d.appendChild(g);

          }

          setupGradientElement(g);

        }

      }

    }



    // Ensure immediate SVG path attribute and inline style synchronization

    if (targetLayerOrSvg && targetLayerOrSvg._path) {

      targetLayerOrSvg._path.setAttribute('fill', `url(#${gradId})`);

      targetLayerOrSvg._path.style.fill = `url(#${gradId})`;

    }

  },



  removeConeGradient(hex, m) {

    const mapInst = m || (typeof map !== 'undefined' && map) || (typeof window !== 'undefined' && window.map) || null;

    if (!mapInst || !mapInst.getPanes) return;

    const overlayPane = mapInst.getPanes().overlayPane;

    if (!overlayPane || typeof overlayPane.querySelectorAll !== 'function') return;
    const grads = overlayPane.querySelectorAll(`#adsb-cone-grad-${hex}`);

    for (let i = 0; i < grads.length; i++) {

      const grad = grads[i];

      if (grad && grad.parentNode) {

        grad.parentNode.removeChild(grad);

      }

    }

  },



  refreshActiveGradients() {

    if (!this.descentGradientEnabled || !this.showCones) return;

    const mapInst = (typeof map !== 'undefined' && map) || (typeof window !== 'undefined' && window.map) || null;

    if (!mapInst) return;

    for (const ac of this.aircraft) {

      const vRate = typeof ac.verticalRate === 'number' && !isNaN(ac.verticalRate) ? ac.verticalRate : (ac.verticalRateFpm || 0);

      if (ac.isDescending || vRate <= -200) {

        const coneEntry = this.mapCones.get(ac.hex);

        if (coneEntry && coneEntry.coneGeom) {

          const coneColor = ac.isBreached ? '#ef4444' : ((ac.isConeWarning || ac.status === 'approaching') ? '#f59e0b' : '#38bdf8');

          this.updateConeGradient(ac, coneEntry.coneGeom, coneColor, mapInst);

        }

      }

    }

  },



  computeConePolygonLatLngs(lat, lon, track, coneLengthMeters, deviationDeg = 15) {



    const length = Math.max(50, coneLengthMeters || 1000);



    const dev = Math.max(2, deviationDeg || 15);



    const leftBearing = track - dev;



    const rightBearing = track + dev;



    const arcPoints = [];



    const steps = 6;



    for (let i = 0; i <= steps; i++) {



      const b = leftBearing + (i / steps) * (rightBearing - leftBearing);



      const pt = this.calculateDestinationPoint(lat, lon, b, length);



      arcPoints.push([pt.lat, pt.lon]);



    }



    const centerDest = this.calculateDestinationPoint(lat, lon, track, length);



    return {



      polygonLatLngs: [[lat, lon], ...arcPoints, [lat, lon]],



      centerLineLatLngs: [[lat, lon], [centerDest.lat, centerDest.lon]]



    };



  },







  evaluateAircraftCone(ac, homeLat, homeLon) {



    const result = {



      isConeWarning: false,



      isClimbingOut: false,



      isDescending: false,



      descentSeverity: null,



      verticalRateFpm: null,



      isLanding: false,



      landingAirport: null,



      coneSuppressed: false,



      etaSeconds: null,



      entryDistanceMeters: null,



      closingSpeedKts: null,



      coneLengthMeters: 0,



      offBoresightDeg: null



    };



    if (!ac || ac.latitude === null || ac.longitude === null) return result;



    const speedKts = typeof ac.speed === 'number' && !isNaN(ac.speed) ? ac.speed : 0;



    const trackDeg = typeof ac.track === 'number' && !isNaN(ac.track) ? ac.track : null;



    if (speedKts <= 0 || trackDeg === null) return result;







    const vRate = typeof ac.verticalRate === 'number' && !isNaN(ac.verticalRate) ? ac.verticalRate : 0;

    result.verticalRate = vRate;

    result.verticalRateFpm = Math.round(vRate);

    if (vRate <= -200) {

      result.isDescending = true;

      if (vRate < -1200) result.descentSeverity = 'severe';

      else if (vRate < -500) result.descentSeverity = 'moderate';

      else result.descentSeverity = 'mild';

    }



    const warnMin = this.warningMinutes > 0 ? this.warningMinutes : 2.0;



    const devDeg = this.coneDeviationDeg >= 0 ? this.coneDeviationDeg : 15;



    const vMps = speedKts * 0.51444444;



    const coneLengthMeters = Math.round(vMps * (warnMin * 60));



    result.coneLengthMeters = coneLengthMeters;



    // Suppress predictive cone if aircraft is in airport airspace assuming landing

    if (this.suppressAirportLanding) {

      const airportCheck = this.checkAirportAirspace(ac);

      if (airportCheck.isLanding) {

        result.isLanding = true;

        result.landingAirport = airportCheck.airport ? airportCheck.airport.icao : null;

        result.coneSuppressed = true;

        return result;

      }

    }

    // Suppress predictive cone if aircraft is at or above high-altitude threshold AGL
    let groundElevFt = 0;
    if (typeof elevationServiceInstance !== 'undefined' && elevationServiceInstance) {
      if (elevationServiceInstance.cachedDem && typeof elevationServiceInstance.cachedDem.sampleAt === 'function') {
        const m = elevationServiceInstance.cachedDem.sampleAt(homeLat, homeLon);
        if (m !== null && !isNaN(m)) groundElevFt = m * 3.28084;
      }
    }
    const altCheck = ac.altitude !== null && ac.altitude !== undefined
      ? ac.altitude
      : (ac.altitudeGeometric !== null && ac.altitudeGeometric !== undefined ? ac.altitudeGeometric : null);
    const altAglCheck = altCheck !== null ? Math.max(0, altCheck - groundElevFt) : null;
    const highAltThreshold = typeof this.highAltitudeThresholdFt === 'number' ? this.highAltitudeThresholdFt : 10000;
    if (altAglCheck !== null && altAglCheck >= highAltThreshold) {
      result.isHighAltitude = true;
      if (this.suppressHighAltitudeCones) {
        result.coneSuppressed = true;
        result.isConeWarning = false;
        return result;
      }
    }



    const rProx = this.radiusMiles * 1609.344;

    const toRad = Math.PI / 180;

    const dLat = (homeLat - ac.latitude) * toRad;

    const dLon = (homeLon - ac.longitude) * toRad;

    const a = Math.sin(dLat / 2) ** 2 + Math.cos(ac.latitude * toRad) * Math.cos(homeLat * toRad) * Math.sin(dLon / 2) ** 2;

    const d = 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));



    if (d <= rProx) return result;



    const y = Math.sin((homeLon - ac.longitude) * toRad) * Math.cos(homeLat * toRad);



    const x = Math.cos(ac.latitude * toRad) * Math.sin(homeLat * toRad) - Math.sin(ac.latitude * toRad) * Math.cos(homeLat * toRad) * Math.cos((homeLon - ac.longitude) * toRad);



    const bearingToHome = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;







    const offBoresight = Math.abs(this.shortestAngularDifference(trackDeg, bearingToHome));



    result.offBoresightDeg = Math.round(offBoresight);







    const alphaEff = Math.max(0, offBoresight - devDeg);



    if (alphaEff >= 90) return result;







    const alphaEffRad = alphaEff * (Math.PI / 180);



    const dPerp = d * Math.sin(alphaEffRad);



    if (dPerp > rProx) return result;







    const dEntry = d * Math.cos(alphaEffRad) - Math.sqrt(Math.max(0, (rProx * rProx) - (dPerp * dPerp)));



    if (dEntry > coneLengthMeters) return result;







    const etaSeconds = Math.max(1, Math.round(dEntry / vMps));



    const ceilingFt = this.ceilingFeet || 2500;



    const alt = ac.altitude !== null && ac.altitude !== undefined 



      ? ac.altitude 



      : (ac.altitudeGeometric !== null && ac.altitudeGeometric !== undefined ? ac.altitudeGeometric : null);







    if (alt !== null) {



      const vRate = typeof ac.verticalRate === 'number' && !isNaN(ac.verticalRate) ? ac.verticalRate : 0;



      const projectedAlt = alt + (vRate * (etaSeconds / 60));



      // Climb-out suppression: aircraft climbing safely overhead above ceiling

      if (vRate > 0 && projectedAlt > ceilingFt) {

        result.isClimbingOut = true;

        result.coneSuppressed = true;

        return result;

      }



      if (alt > ceilingFt && projectedAlt > ceilingFt) return result;



    }



    const closingSpeedKts = Math.max(0, Math.round(speedKts * Math.cos(offBoresight * (Math.PI / 180))));



    result.isConeWarning = true;



    result.etaSeconds = etaSeconds;



    result.entryDistanceMeters = Math.round(dEntry);



    result.closingSpeedKts = closingSpeedKts;



    return result;



  },







  initAudioContext() {
    if (!this.audioContext && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        try {
          this.audioContext = new AudioCtx();
        } catch (e) {}
      }
    }
    if (this.audioContext && this.audioContext.state === 'suspended') {
      return this.audioContext.resume().catch(() => {});
    }
    return Promise.resolve();
  },

  async playApproachingChime() {
    try {
      await this.initAudioContext();
      if (!this.audioContext) return;
      const ctx = this.audioContext;
      if (ctx.state === 'suspended') {
        try { await ctx.resume(); } catch (e) {}
      }
      const now = ctx.currentTime;
      const masterGain = ctx.createGain();



      masterGain.connect(ctx.destination);



      masterGain.gain.setValueAtTime(0.25, now);







      // Amber Stage 1 Tone 1: 587 Hz (D5)



      const osc1 = ctx.createOscillator();



      const gain1 = ctx.createGain();



      osc1.type = 'sine';



      osc1.frequency.setValueAtTime(587, now);



      gain1.gain.setValueAtTime(0.28, now);



      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.16);



      osc1.connect(gain1);



      gain1.connect(masterGain);



      osc1.start(now);



      osc1.stop(now + 0.16);







      // Amber Stage 1 Tone 2: 740 Hz (F#5)



      const osc2 = ctx.createOscillator();



      const gain2 = ctx.createGain();



      osc2.type = 'sine';



      osc2.frequency.setValueAtTime(740, now + 0.17);



      gain2.gain.setValueAtTime(0.28, now + 0.17);



      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.38);



      osc2.connect(gain2);



      gain2.connect(masterGain);



      osc2.start(now + 0.17);



      osc2.stop(now + 0.38);



    } catch (e) {}



  },







  async playWarningChime() {
    try {
      await this.initAudioContext();
      if (!this.audioContext) return;
      const ctx = this.audioContext;
      if (ctx.state === 'suspended') {
        try { await ctx.resume(); } catch (e) {}
      }
      const now = ctx.currentTime;
      const masterGain = ctx.createGain();



      masterGain.connect(ctx.destination);



      masterGain.gain.setValueAtTime(0.3, now);







      // Tone 1: 880 Hz (A5)



      const osc1 = ctx.createOscillator();



      const gain1 = ctx.createGain();



      osc1.type = 'sine';



      osc1.frequency.setValueAtTime(880, now);



      gain1.gain.setValueAtTime(0.35, now);



      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.18);



      osc1.connect(gain1);



      gain1.connect(masterGain);



      osc1.start(now);



      osc1.stop(now + 0.18);







      // Tone 2: 660 Hz (E5)



      const osc2 = ctx.createOscillator();



      const gain2 = ctx.createGain();



      osc2.type = 'sine';



      osc2.frequency.setValueAtTime(660, now + 0.19);



      gain2.gain.setValueAtTime(0.35, now + 0.19);



      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45);



      osc2.connect(gain2);



      gain2.connect(masterGain);



      osc2.start(now + 0.19);



      osc2.stop(now + 0.45);



    } catch (e) {}



  },







  playVoiceAdvisory(aircraft, alertStage = 'breached') {
    if (typeof window === 'undefined') return;

    const nativeTts = (typeof Platform !== 'undefined' && typeof Platform.hasNativeTts === 'function')
      ? Platform.hasNativeTts()
      : false;

    if (!nativeTts && !window.speechSynthesis) {
      if (typeof console !== 'undefined') console.warn('Voice advisory unavailable: no speech engine');
      return;
    }

    try {
      const text = this.formatVoiceAdvisoryText(aircraft, alertStage);
      if (!text) return;

      if (nativeTts && typeof Platform !== 'undefined' && typeof Platform.speak === 'function') {
        Platform.speak(text, 1.05, 1.0);
        return;
      }

      const UtteranceCtor = (typeof window !== 'undefined' && window.SpeechSynthesisUtterance)
        ? window.SpeechSynthesisUtterance
        : (typeof SpeechSynthesisUtterance !== 'undefined' ? SpeechSynthesisUtterance : null);
      if (!UtteranceCtor) return;

      // Unstick paused speech synthesis if suspended by browser
      if (window.speechSynthesis.paused && typeof window.speechSynthesis.resume === 'function') {
        try { window.speechSynthesis.resume(); } catch (e) {}
      }

      const dispatchSpeech = () => {
        try {
          const utterance = new UtteranceCtor(text);
          utterance.rate = 1.05;
          utterance.pitch = 1.0;
          utterance.volume = 0.9;

          // Select preferred English voice prioritizing local/offline voices on Windows & desktop
          if (typeof window.speechSynthesis.getVoices === 'function') {
            try {
              const voices = window.speechSynthesis.getVoices();
              if (voices && voices.length > 0) {
                // Prefer localService offline voices (David, Zira, Mark, Google US English)
                // Avoid online-only cloud voices (e.g. Natural in Edge) that fail offline in the field
                const localEn = voices.filter(v => v.lang && v.lang.toLowerCase().startsWith('en') && v.localService);
                const anyEn = voices.filter(v => v.lang && v.lang.toLowerCase().startsWith('en'));
                const candidatePool = localEn.length > 0 ? localEn : anyEn;

                const preferred = candidatePool.find(v => (
                  v.name.includes('David') || v.name.includes('Zira') || v.name.includes('Mark') || v.name.includes('Google') || v.default
                )) || candidatePool[0] || voices[0];

                if (preferred) utterance.voice = preferred;
              }
            } catch (e) {}
          }

          // Anchor reference globally and on instance to prevent V8 GC mid-speech
          this._activeUtterance = utterance;
          if (typeof window !== 'undefined') {
            if (!window._aalaapiActiveUtterances) window._aalaapiActiveUtterances = new Set();
            window._aalaapiActiveUtterances.add(utterance);
          }

          // Heartbeat & watchdog to prevent Chromium Windows 15-second speech hang bug
          let heartbeatTimer = null;
          let watchdogTimer = null;

          const cleanup = () => {
            if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
            if (watchdogTimer) { clearTimeout(watchdogTimer); watchdogTimer = null; }
            if (this._activeUtterance === utterance) this._activeUtterance = null;
            if (typeof window !== 'undefined' && window._aalaapiActiveUtterances) {
              window._aalaapiActiveUtterances.delete(utterance);
            }
          };

          utterance.onstart = () => {
            // Pulse pause/resume every 500ms while speaking to keep Windows Chromium speech alive
            if (!heartbeatTimer && typeof window !== 'undefined' && window.speechSynthesis) {
              heartbeatTimer = setInterval(() => {
                if (!window.speechSynthesis || !window.speechSynthesis.speaking) {
                  cleanup();
                  return;
                }
                try {
                  window.speechSynthesis.pause();
                  window.speechSynthesis.resume();
                } catch (_) {}
              }, 500);
            }

            // Safety watchdog: clear stuck speaking state if utterance exceeds estimated duration
            const wordCount = (text.match(/\S+/g) || []).length;
            const maxDurationMs = Math.max(7000, wordCount * 650);
            watchdogTimer = setTimeout(() => {
              if (window.speechSynthesis && window.speechSynthesis.speaking) {
                try { window.speechSynthesis.cancel(); } catch (_) {}
              }
              cleanup();
            }, maxDurationMs);
          };

          utterance.onend = () => {
            cleanup();
          };

          utterance.onerror = (e) => {
            cleanup();
            if (e && e.error !== 'interrupted' && e.error !== 'canceled' && typeof console !== 'undefined') {
              console.warn('SpeechSynthesis error:', e.error);
            }
          };

          window.speechSynthesis.speak(utterance);
        } catch (err) {
          if (typeof console !== 'undefined') console.warn('Voice advisory dispatch failed:', err);
        }
      };

      // Only cancel if speech is actively speaking/pending to prevent Chromium Windows cancel-race abort
      const isBusy = Boolean(window.speechSynthesis.speaking || window.speechSynthesis.pending);
      if (isBusy && typeof window.speechSynthesis.cancel === 'function') {
        try { window.speechSynthesis.cancel(); } catch (_) {}
        // Yield one tick for the browser process to flush cancellation before enqueueing new speech
        setTimeout(dispatchSpeech, 40);
      } else {
        dispatchSpeech();
      }
    } catch (e) {
      if (typeof console !== 'undefined') console.warn('Voice advisory failed:', e);
    }
  },







  triggerAudioAlert(aircraft, alertStage = 'breached') {



    if (!this.soundEnabled) return;



    const now = Date.now();



    if (this.isSnoozed) {



      if (now < this.snoozeUntil) return;



      this.isSnoozed = false;



    }







    const hex = aircraft.hex;



    if (alertStage === 'approaching') {



      const lastTime = this.lastApproachingAlertTimes.get(hex) || 0;



      if (now - lastTime < 45000) return;



      this.lastApproachingAlertTimes.set(hex, now);







      if (this.soundType === 'chime' || this.soundType === 'both') {



        this.playApproachingChime();



      }



      if (this.soundType === 'voice' || this.soundType === 'both') {

        const delay = this.soundType === 'both' ? 480 : 0;

        setTimeout(() => {



          this.playVoiceAdvisory(aircraft, 'approaching');



        }, delay);



      }



    } else {



      const lastTime = this.lastAlertTimes.get(hex) || 0;



      if (now - lastTime < 30000) return;



      this.lastAlertTimes.set(hex, now);







      if (this.soundType === 'chime' || this.soundType === 'both') {



        this.playWarningChime();



      }



      if (this.soundType === 'voice' || this.soundType === 'both') {

        const delay = this.soundType === 'both' ? 580 : 0;

        setTimeout(() => {



          this.playVoiceAdvisory(aircraft, 'breached');



        }, delay);



      }



    }



  },







  snooze(minutes = 1) {



    this.isSnoozed = true;



    this.snoozeUntil = Date.now() + (minutes * 60 * 1000);



    const btn = typeof document !== 'undefined' ? document.getElementById('adsb-alert-snooze-btn') : null;



    if (btn) btn.textContent = 'Snoozed (1m)';



  },







  toggleSound(forceState) {



    this.soundEnabled = forceState !== undefined ? forceState : !this.soundEnabled;



    this.saveSettings();



    this.updateControlsUI();



  },







  toggleTracking(forceState) {



    this.enabled = forceState !== undefined ? forceState : !this.enabled;



    this.saveSettings();



    if (this.enabled) {



      this.startPolling();



    } else {



      this.stopPolling();



      this.clearAll();



    }



    this.updateControlsUI();



  },







  clearTrails() {



    if (this.layerGroup && this.layerGroup.removeLayer) {



      for (const poly of this.mapTrails.values()) {



        try { this.layerGroup.removeLayer(poly); } catch (_) {}



      }



    }



    this.mapTrails.clear();



    this.acHistory.clear();



  },







  setTrailDuration(duration) {



    this.trailDuration = duration || '60s';



    this.showTrails = (this.trailDuration !== 'off');



    this.saveSettings();



    if (!this.showTrails) {



      for (const poly of this.mapTrails.values()) {



        if (this.layerGroup && this.layerGroup.removeLayer) this.layerGroup.removeLayer(poly);



      }



      this.mapTrails.clear();



    } else {



      this.updateMapMarkers();



    }



    this.updateControlsUI();



  },







  toggleTrails(forceState) {



    this.showTrails = forceState !== undefined ? forceState : !this.showTrails;



    if (this.showTrails && this.trailDuration === 'off') {



      this.trailDuration = '60s';



    } else if (!this.showTrails) {



      this.trailDuration = 'off';



    }



    this.saveSettings();



    if (!this.showTrails) {



      for (const poly of this.mapTrails.values()) {



        if (this.layerGroup && this.layerGroup.removeLayer) this.layerGroup.removeLayer(poly);



      }



      this.mapTrails.clear();



    } else {



      this.updateMapMarkers();



    }



    this.updateControlsUI();



  },







  switchTab(tabName) {



    this.activeTab = (tabName === 'settings') ? 'settings' : 'operations';



    if (typeof document === 'undefined') return;







    const btnOps = document.getElementById('adsb-tab-btn-ops');



    const btnSettings = document.getElementById('adsb-tab-btn-settings');



    const paneOps = document.getElementById('adsb-pane-operations');



    const paneSettings = document.getElementById('adsb-pane-settings');







    if (this.activeTab === 'operations') {



      if (btnOps) {



        btnOps.classList.add('active');



        btnOps.setAttribute('aria-selected', 'true');



      }



      if (btnSettings) {



        btnSettings.classList.remove('active');



        btnSettings.setAttribute('aria-selected', 'false');



      }



      if (paneOps) paneOps.classList.remove('hidden');



      if (paneSettings) paneSettings.classList.add('hidden');



    } else {



      if (btnOps) {



        btnOps.classList.remove('active');



        btnOps.setAttribute('aria-selected', 'false');



      }



      if (btnSettings) {



        btnSettings.classList.add('active');



        btnSettings.setAttribute('aria-selected', 'true');



      }



      if (paneOps) paneOps.classList.add('hidden');



      if (paneSettings) paneSettings.classList.remove('hidden');



    }



  },







  toggleDrawer(forceState) {



    const drawer = typeof document !== 'undefined' ? document.getElementById('adsb-control-drawer') : null;



    if (!drawer) return;



    this.isDrawerOpen = forceState !== undefined ? forceState : !this.isDrawerOpen;



    if (this.isDrawerOpen) {
      if (typeof window !== 'undefined' && typeof window.dismissActivePopovers === 'function') {
        window.dismissActivePopovers('adsb-control-drawer');
      } else if (typeof dismissActivePopovers === 'function') {
        dismissActivePopovers('adsb-control-drawer');
      }



      drawer.classList.remove('hidden');



      this.initAudioContext();



      this.updateDrawerAircraftList();



      this.fetchAirspaceStatus();



      this.switchTab(this.activeTab || 'operations');



    } else {



      drawer.classList.add('hidden');



    }



  },







  async fetchAirspaceStatus() {

    try {

      if (typeof Platform !== 'undefined' && typeof Platform.getNativeAdsbStatus === 'function') {
        const nativeStatus = Platform.getNativeAdsbStatus();
        const hasHw = Boolean(nativeStatus && nativeStatus.hardware && nativeStatus.hardware.detected);
        if (nativeStatus && (nativeStatus.connected || nativeStatus.connecting || nativeStatus.messagesReceived > 0 || hasHw)) {
          const nativeSt = {
            connected: Boolean(nativeStatus.connected),
            connecting: Boolean(nativeStatus.connecting),
            isRemoteServer: true,
            tcpHost: nativeStatus.currentHost || nativeStatus.host || this.serverHost || '127.0.0.1',
            tcpPort: nativeStatus.currentPort || nativeStatus.port || this.serverPort || 30003,
            adsbHost: nativeStatus.currentHost || nativeStatus.host || this.serverHost || '127.0.0.1',
            adsbPort: nativeStatus.currentPort || nativeStatus.port || this.serverPort || 30003,
            totalPackets: nativeStatus.messagesReceived || 0,
            driverType: 'Android Native Socket',
            hardware: nativeStatus.hardware || (typeof AndroidNativeBridge !== 'undefined' ? AndroidNativeBridge.adsbHardware : null)
          };
          this.updateDiagnosticsUI(nativeSt);
          return;
        }
      }



      const apiBase = (typeof getCompanionApiBase === 'function') ? getCompanionApiBase() : 'http://127.0.0.1:8765';

      const res = await fetch(`${apiBase}/api/airspace/status`, {

        headers: (typeof getCompanionAuthHeaders === 'function') ? getCompanionAuthHeaders() : {}

      });

      if (!res.ok) return;

      const st = await res.json();

      this.updateDiagnosticsUI(st);

    } catch (e) {

      const isAndroidConnected = (typeof AndroidNativeBridge !== 'undefined' && AndroidNativeBridge.isAdsbConnected) || (typeof global !== 'undefined' && global.AndroidNativeBridge && global.AndroidNativeBridge.isAdsbConnected);

      const isCloudActive = Boolean(this.externalWatchActive);

      const isStreamActive = Boolean(this.streamConnected);



      if (!isAndroidConnected && !isCloudActive && !isStreamActive) {

        this.updateDiagnosticsUI(null);

      } else {

        this.updateDiagnosticsUI(this.synthesizeActiveStatus ? this.synthesizeActiveStatus() : null);

      }

    }

  },







  async syncAdsbConfigWithBridge(st) {



    if (!st || this.isSyncingAdsbConfig || this.isConnectingAdsbServer) return;



    const bridgeHost = (st.tcpHost || st.adsbHost || '').trim();



    const bridgePort = st.tcpPort || st.adsbPort || 30003;



    const localHost = (this.serverHost || '').trim();



    const localPort = this.serverPort || 30003;







    const isLocalCustom = localHost && localHost !== '127.0.0.1' && localHost !== 'localhost';



    const isBridgeDefault = !bridgeHost || bridgeHost === '127.0.0.1' || bridgeHost === 'localhost';







    // Case 1: Browser has a custom remote host saved, but bridge is defaulted to localhost



    if (isLocalCustom && isBridgeDefault) {



      this.isSyncingAdsbConfig = true;



      try {



        const apiBase = (typeof getCompanionApiBase === 'function') ? getCompanionApiBase() : 'http://127.0.0.1:8765';



        await fetch(`${apiBase}/api/config/adsb`, {



          method: 'POST',



          headers: {

            'Content-Type': 'application/json',

            ...((typeof getCompanionAuthHeaders === 'function') ? getCompanionAuthHeaders() : {})

          },



          body: JSON.stringify({ adsbHost: localHost, adsbPort: localPort, force: true })



        });



      } catch (_) {}



      finally {



        this.isSyncingAdsbConfig = false;



      }



      return;



    }







    // Case 2: Bridge has a custom remote host, but browser local state is default/localhost (e.g. fresh browser session or cleared storage)



    const isBridgeCustom = bridgeHost && bridgeHost !== '127.0.0.1' && bridgeHost !== 'localhost';



    if (isBridgeCustom && !isLocalCustom) {



      this.serverHost = bridgeHost;



      this.serverPort = bridgePort;



      this.saveSettings();



      const hostInput = typeof document !== 'undefined' ? document.getElementById('adsb-host-input') : null;



      const portInput = typeof document !== 'undefined' ? document.getElementById('adsb-port-input') : null;



      const isEditingInputs = typeof document !== 'undefined' && (document.activeElement === hostInput || document.activeElement === portInput);



      if (hostInput && !isEditingInputs) hostInput.value = bridgeHost;



      if (portInput && !isEditingInputs) portInput.value = bridgePort;



    }



  },







  synthesizeActiveStatus() {

    const isAndroidConnected = (typeof AndroidNativeBridge !== 'undefined' && AndroidNativeBridge.isAdsbConnected) || (typeof global !== 'undefined' && global.AndroidNativeBridge && global.AndroidNativeBridge.isAdsbConnected);

    const isCloudActive = Boolean(this.externalWatchActive);

    const host = this.serverHost || '127.0.0.1';

    const port = this.serverPort || 30003;



    if (isAndroidConnected) {

      return {

        connected: true,

        isRemoteServer: true,

        tcpHost: host,

        tcpPort: port,

        adsbHost: host,

        adsbPort: port,

        driverType: 'Android Native Socket'

      };

    }

    if (isCloudActive) {

      return {

        connected: true,

        isRemoteServer: true,

        tcpHost: 'adsb.lol',

        tcpPort: 443,

        adsbHost: 'adsb.lol',

        adsbPort: 443,

        driverType: 'Online Cloud Feed (adsb.lol)'

      };

    }

    return null;

  },



  updateDiagnosticsUI(st) {

    if (typeof document === 'undefined') return;

    const hwEl = document.getElementById('adsb-hw-status');

    const streamEl = document.getElementById('adsb-stream-status');

    const summaryEl = document.getElementById('adsb-diag-summary');

    const tipEl = document.getElementById('adsb-diag-tip');

    const hwPacketsEl = document.getElementById('adsb-hw-packets');

    const hwDriverEl = document.getElementById('adsb-hw-driver');

    const tabDot = document.getElementById('adsb-tab-status-dot');



    const isAndroidConnected = (typeof AndroidNativeBridge !== 'undefined' && AndroidNativeBridge.isAdsbConnected) || (typeof global !== 'undefined' && global.AndroidNativeBridge && global.AndroidNativeBridge.isAdsbConnected);

    const isCloudActive = Boolean(this.externalWatchActive);

    const isAnyActive = (st && st.connected) || isAndroidConnected || isCloudActive || this.streamConnected;



    if (!st && !isAnyActive) {

      if (hwEl) {

        hwEl.textContent = 'Bridge Offline';

        hwEl.style.color = '#ef4444';

      }

      if (streamEl) {

        streamEl.textContent = 'Offline';

        streamEl.style.color = '#ef4444';

      }

      if (summaryEl) {

        summaryEl.textContent = 'OFFLINE';

        summaryEl.style.background = 'rgba(239, 68, 68, 0.2)';

        summaryEl.style.color = '#ef4444';

      }

      if (tabDot) {

        tabDot.className = 'adsb-tab-dot is-offline';

        tabDot.title = 'Offline';

      }

      return;

    }



    if (!st && isAnyActive) {

      st = this.synthesizeActiveStatus() || { connected: true };

    }



    if (st) {

      this.syncAdsbConfigWithBridge(st);

    }



    const bridgeHost = (st && (st.tcpHost || st.adsbHost));

    const bridgePort = (st && (st.tcpPort || st.adsbPort));

    const hasCustomLocal = this.serverHost && this.serverHost !== '127.0.0.1' && this.serverHost !== 'localhost';



    const targetHost = hasCustomLocal

      ? this.serverHost

      : (bridgeHost || this.serverHost || '127.0.0.1');



    const targetPort = hasCustomLocal

      ? this.serverPort

      : (bridgePort || this.serverPort || 30003);



    const hostPortStr = `${bridgeHost || targetHost}:${bridgePort || targetPort}`;



    const hostInput = document.getElementById('adsb-host-input');

    const portInput = document.getElementById('adsb-port-input');

    const isEditingInputs = (document.activeElement === hostInput || document.activeElement === portInput);

    if (!this.isConnectingAdsbServer && !isEditingInputs) {

      if (hostInput && document.activeElement !== hostInput) {

        hostInput.value = targetHost;

      }

      if (portInput && document.activeElement !== portInput) {

        portInput.value = targetPort;

      }

    }



    // Hardware status

    if (hwEl) {

      if (st.hardware && st.hardware.detected) {
        if (st.hardware.driverStatus === 'needs_zadig') {
          hwEl.textContent = 'Detected (Driver Missing)';
          hwEl.style.color = '#f59e0b';
          if (tipEl) {
            tipEl.style.display = 'block';
            tipEl.innerHTML = '⚠️ <strong>Driver Needed:</strong> Windows sees your RTL-SDR dongle, but needs the <strong>WinUSB</strong> driver. Run <a href="https://zadig.akeo.ie/" target="_blank" style="color: #60a5fa; text-decoration: underline;">Zadig</a>, select <em>Bulk-In, Interface</em>, and click <em>Install WinUSB</em>.';
          }
        } else if (st.hardware.driverStatus === 'needs_permission') {
          hwEl.textContent = `${st.hardware.deviceName || 'RTL-SDR'} (Permission Needed)`;
          hwEl.style.color = '#f59e0b';
          if (tipEl) {
            tipEl.style.display = 'block';
            tipEl.innerHTML = '⚠️ <strong>USB Permission Required:</strong> Please allow USB access on your Android device for the RTL-SDR dongle.';
          }
        } else if (st.hardware.platform === 'android' || (typeof window !== 'undefined' && window.AalaapiAndroid)) {
          hwEl.textContent = `${st.hardware.deviceName || 'RTL-SDR'} (USB OTG Ready)`;
          hwEl.style.color = '#10b981';
          if (tipEl && !st.connected) {
            tipEl.style.display = 'block';
            tipEl.innerHTML = '🔌 <strong>RTL-SDR Detected via USB OTG:</strong> To stream local 1090 MHz frames into Aalaapi Sky, run an ADS-B decoder app (e.g. <em>RTL-SDR Driver</em> or <em>dump1090</em>) on port <code>30003</code>, or tap <strong>Start Watching</strong> above to stream live cloud radar from <strong>adsb.lol</strong>.';
          }
        } else {
          hwEl.textContent = 'Ready (WinUSB Active)';
          hwEl.style.color = '#10b981';
        }
      } else if (isAndroidConnected || (st && st.driverType === 'Android Native Socket')) {
        hwEl.textContent = 'Android Native / RTL-SDR Socket';
        hwEl.style.color = '#38bdf8';
      } else if (isCloudActive) {
        hwEl.textContent = 'Online Cloud Feed (adsb.lol)';
        hwEl.style.color = '#38bdf8';
      } else if (st && (st.isRemoteServer || (st.tcpHost && st.tcpHost !== '127.0.0.1' && st.tcpHost !== 'localhost'))) {
        hwEl.textContent = 'Remote Feed (No USB Dongle Needed)';
        hwEl.style.color = '#38bdf8';
      } else {
        hwEl.textContent = 'Not Detected';
        hwEl.style.color = '#94a3b8';
      }
    }

    // Stream status & summary
    if (st && st.connected || isAnyActive) {
      if (streamEl) {
        if (isCloudActive && (!st || !st.connected) && !isAndroidConnected) {
          streamEl.textContent = 'Connected (Online Cloud Feed adsb.lol)';
        } else if (isAndroidConnected) {
          streamEl.textContent = `Connected (${targetHost}:${targetPort})`;
        } else {
          streamEl.textContent = `Connected (${hostPortStr})`;
        }
        streamEl.style.color = '#10b981';
      }
      if (summaryEl) {
        summaryEl.textContent = 'ACTIVE';
        summaryEl.style.background = 'rgba(16, 185, 129, 0.2)';
        summaryEl.style.color = '#10b981';
      }
      if (tipEl && (!st || !st.hardware || (st.hardware.driverStatus !== 'needs_zadig' && st.hardware.driverStatus !== 'needs_permission' && !(st.hardware.platform === 'android' && !st.connected)))) {
        tipEl.style.display = 'none';
      }

    } else {

      if (streamEl) {

        streamEl.textContent = `Waiting on ${hostPortStr}...`;

        streamEl.style.color = '#f59e0b';

      }

      if (summaryEl) {

        summaryEl.textContent = 'WAITING';

        summaryEl.style.background = 'rgba(245, 158, 11, 0.2)';

        summaryEl.style.color = '#f59e0b';

      }

      if (tipEl && (!st || !st.hardware || (st.hardware.driverStatus !== 'needs_zadig' && st.hardware.driverStatus !== 'needs_permission' && !(st.hardware.platform === 'android' && st.hardware.detected)))) {
        tipEl.style.display = 'block';
        tipEl.innerHTML = `💡 <strong>Waiting for dump1090:</strong> Ensure dump1090 or your SBS feed is running on <code>${hostPortStr}</code>.`;
      }

    }



    if (hwPacketsEl && st && typeof st.totalPackets === 'number') {

      hwPacketsEl.textContent = st.totalPackets.toLocaleString();

    }

    if (hwDriverEl) {
      if (st && st.hardware && st.hardware.platform === 'android' && st.hardware.detected) {
        hwDriverEl.textContent = `${st.hardware.deviceName || 'RTL-SDR'} / USB OTG`;
      } else if (isAndroidConnected || (st && st.driverType === 'Android Native Socket')) {
        hwDriverEl.textContent = `Android Socket (${targetPort})`;

      } else if (isCloudActive && (!st || !st.connected)) {

        hwDriverEl.textContent = 'Cloud REST API (adsb.lol)';

      } else if (st && st.driverType === 'dump1090-tcp') {

        hwDriverEl.textContent = `TCP Stream (${targetPort})`;

      } else if (st && st.driverType) {

        hwDriverEl.textContent = st.driverType;

      }

    }



    if (tabDot) {

      tabDot.className = 'adsb-tab-dot';

      if ((st && st.connected) || isAnyActive) {

        tabDot.classList.add('is-connected');

        if (isCloudActive && ((st && st.connected) || isAndroidConnected)) {

          tabDot.title = 'Connected: Local/Native + Online Cloud Feed (adsb.lol)';

        } else if (isCloudActive) {

          tabDot.title = 'Online Cloud Feed (adsb.lol) Active';

        } else {

          tabDot.title = `Connected to ${hostPortStr}`;

        }

      } else {

        tabDot.classList.add('is-waiting');

        tabDot.title = `Waiting on ${hostPortStr}`;

      }

    }



    this.updateStreamTransportUI();

  },







  updateStreamTransportUI() {



    if (typeof document === 'undefined') return;



    const badge = document.getElementById('adsb-transport-badge');



    if (!badge) return;



    if (this.streamMode === 'android-tcp') {

      badge.textContent = 'Android TCP/RTL-SDR (Native)';

      badge.style.color = '#a78bfa';

    } else if (this.streamMode === 'android-http') {

      badge.textContent = 'Android HTTP / JSON (Native)';

      badge.style.color = '#34d399';

    } else if (this.streamMode === 'sse') {



      badge.textContent = 'SSE Stream (Sub-second)';



      badge.style.color = '#38bdf8';



    } else if (this.streamMode === 'polling') {



      badge.textContent = 'REST Polling (2s Fallback)';



      badge.style.color = '#f59e0b';



    } else {



      badge.textContent = 'Disconnected';



      badge.style.color = '#94a3b8';



    }



  },







  connectStream() {



    if (!this.enabled) return;



    if (this.streamMode === 'android-tcp' || this.streamMode === 'android-http') return;



    const EventSourceCtor = (typeof window !== 'undefined' && window.EventSource) || (typeof EventSource !== 'undefined' && EventSource) || null;



    if (!EventSourceCtor) {



      this.ensureFallbackPolling();



      return;



    }







    const origin = this.getAlertOrigin();



    const homeLat = origin.lat;



    const homeLon = origin.lon;







    // If running on Native Android container without an explicit remote companion host,
    // ADS-B telemetry is provided natively via AndroidAdsbBridge TCP socket.
    if (typeof Platform !== 'undefined' && Platform.isNativeAndroid() && (!this.customEndpoint || !this.customEndpoint.trim())) {
      const storedComp = (typeof localStorage !== 'undefined') ? localStorage.getItem('aalaapi-companion-host') : null;
      if (!storedComp || storedComp.includes('127.0.0.1') || storedComp.includes('localhost')) {
        return;
      }
    }
    const endpoint = this.getEffectiveStreamEndpoint();



    const token = (typeof CompanionAuth !== 'undefined' && CompanionAuth.token) ? CompanionAuth.token : '';

    const tokenParam = token ? `&token=${encodeURIComponent(token)}` : '';

    const airportList = this.airports ? Array.from(this.airports.values()) : [];
    const airportsParam = airportList.length > 0 ? `&airports=${encodeURIComponent(JSON.stringify(airportList))}` : '';
    const url = `${endpoint}?lat=${homeLat.toFixed(5)}&lon=${homeLon.toFixed(5)}&radius=${this.radiusMiles}&ceiling=${this.ceilingFeet}&warningMinutes=${this.warningMinutes}&coneDeviationDeg=${this.coneDeviationDeg}&includeSafe=true&suppressAirportLanding=${this.suppressAirportLanding}&airportRadiusNm=${this.airportRadiusNm}&highAltitudeThreshold=${this.highAltitudeThresholdFt || 10000}&suppressHighAltitudeCones=${this.suppressHighAltitudeCones}${airportsParam}${tokenParam}`;







    if (this.eventSource) {



      try { this.eventSource.close(); } catch (_) {}



      this.eventSource = null;



    }







    this.streamLat = homeLat;



    this.streamLon = homeLon;



    this.streamRadius = this.radiusMiles;







    try {



      this.eventSource = new EventSourceCtor(url);







      this.eventSource.onopen = () => {



        this.streamConnected = true;



        this.streamMode = 'sse';



        this.updateStreamTransportUI();



      };







      this.eventSource.onmessage = (event) => {



        if (!event || !event.data) return;



        try {



          const data = JSON.parse(event.data);



          this.streamConnected = true;



          this.streamMode = 'sse';



          this.processAirspaceData(data);



          this.updateStreamTransportUI();



        } catch (e) {}



      };







      if (typeof this.eventSource.addEventListener === 'function') {



        this.eventSource.addEventListener('status', (event) => {



          if (!event || !event.data) return;



          try {



            const st = JSON.parse(event.data);



            this.updateDiagnosticsUI(st);



          } catch (e) {}



        });



      }







      this.eventSource.onerror = () => {



        if (this.streamMode === 'android-tcp' || this.streamMode === 'android-http') return;



        this.streamConnected = false;



        this.streamMode = 'polling';



        this.updateStreamTransportUI();



        this.ensureFallbackPolling();



      };



    } catch (e) {



      this.streamConnected = false;



      this.streamMode = 'polling';



      this.updateStreamTransportUI();



      this.ensureFallbackPolling();



    }



  },







  ensureFallbackPolling() {



    if (this.streamMode === 'android-tcp' || this.streamMode === 'android-http') return;



    if (this.pollTimer) return;



    this.isPolling = true;



    this.pollAirspace();



    this.pollTimer = setInterval(() => {



      if (this.enabled && !this.streamConnected) {



        this.pollAirspace();



      }



    }, 2000);



  },







  startPolling() {



    this.isPolling = true;



    // Attempt real-time SSE stream first



    this.connectStream();







    // Setup fallback watchdog / map center change monitor



    if (this.pollTimer) clearInterval(this.pollTimer);



    this.pollTimer = setInterval(() => {



      if (!this.enabled) return;







      if (!this.streamConnected) {



        this.pollAirspace();



      } else if (this.streamLat !== null && this.streamMode !== 'android-tcp' && this.streamMode !== 'android-http') {



        const curOrigin = this.getAlertOrigin();



        if (Math.abs(curOrigin.lat - this.streamLat) > 0.00025 || Math.abs(curOrigin.lon - this.streamLon) > 0.00025 || this.streamRadius !== this.radiusMiles) {



          this.connectStream();



        }



      }



    }, 2000);



  },







  stopPolling() {



    if (this.eventSource) {



      try { this.eventSource.close(); } catch (_) {}



      this.eventSource = null;



    }



    if (this.pollTimer) {



      clearInterval(this.pollTimer);



      this.pollTimer = null;



    }



    this.streamConnected = false;



    this.streamMode = 'disconnected';



    this.isPolling = false;



    this.updateStreamTransportUI();



  },







  processAirspaceData(data) {



    if (!data || !data.success) return;



    this.aircraft = Array.isArray(data.aircraft) ? data.aircraft : [];







    const origin = this.getAlertOrigin();



    const homeLat = origin.lat;



    const homeLon = origin.lon;







    // Evaluate client-side predictive cone if not already computed

    let groundElevFt = 0;
    if (typeof elevationServiceInstance !== 'undefined' && elevationServiceInstance) {
      if (elevationServiceInstance.cachedDem && typeof elevationServiceInstance.cachedDem.sampleAt === 'function') {
        const m = elevationServiceInstance.cachedDem.sampleAt(homeLat, homeLon);
        if (m !== null && !isNaN(m)) groundElevFt = m * 3.28084;
      }
    }

    const isClientSource = Boolean(
      (data.source && data.source.startsWith('android-')) ||
      data.isClientComputed ||
      data.source === 'client-sdr' ||
      data.source === 'client-simulator'
    );

    for (const ac of this.aircraft) {
      const altVal = ac.altitude !== null && ac.altitude !== undefined
        ? ac.altitude
        : (ac.altitudeGeometric !== null && ac.altitudeGeometric !== undefined ? ac.altitudeGeometric : null);
      const altAglVal = altVal !== null ? Math.max(0, altVal - groundElevFt) : null;
      ac.altitudeAgl = altAglVal;
      if (ac.isHighAltitude === undefined) {
        ac.isHighAltitude = (altAglVal !== null && altAglVal >= (this.highAltitudeThresholdFt || 10000));
      }
      if (ac.isHighAltitude && this.suppressHighAltitudeCones) {
        ac.coneSuppressed = true;
        ac.isConeWarning = false;
        if (ac.status === 'approaching') ac.status = 'safe';
      }

      const isClientAircraft = isClientSource || (ac.isConeWarning === undefined && !ac.isBreached);

      if (isClientAircraft && ac.latitude !== null && ac.longitude !== null && ac.latitude !== undefined && ac.longitude !== undefined) {
        // Calculate distance from alert origin
        const toRad = Math.PI / 180;
        const dLat = (homeLat - ac.latitude) * toRad;
        const dLon = (homeLon - ac.longitude) * toRad;
        const aDist = Math.sin(dLat / 2) ** 2 + Math.cos(ac.latitude * toRad) * Math.cos(homeLat * toRad) * Math.sin(dLon / 2) ** 2;
        const d = 6371000 * 2 * Math.atan2(Math.sqrt(aDist), Math.sqrt(1 - aDist));
        ac.distanceMeters = Math.round(d);
        ac.distanceMiles = parseFloat((d / 1609.344).toFixed(2));

        const rProx = this.radiusMiles * 1609.344;
        const maxCeiling = this.ceilingFeet || 2500;
        ac.isWithinRadius = (d <= rProx);
        ac.isBreached = ac.isWithinRadius && !ac.isLanding && !ac.coneSuppressed && (altVal === null || altVal <= maxCeiling);

        if (ac.isBreached) {
          ac.status = 'breached';
          ac.isConeWarning = false;
        } else {
          const coneEval = this.evaluateAircraftCone(ac, homeLat, homeLon);
          ac.coneLengthMeters = coneEval.coneLengthMeters;
          ac.offBoresightDeg = coneEval.offBoresightDeg;
          if (coneEval.verticalRate !== undefined) ac.verticalRate = coneEval.verticalRate;
          if (coneEval.verticalRateFpm !== undefined) ac.verticalRateFpm = coneEval.verticalRateFpm;
          if (coneEval.isDescending !== undefined) ac.isDescending = coneEval.isDescending;
          if (coneEval.descentSeverity !== undefined) ac.descentSeverity = coneEval.descentSeverity;

          if (coneEval.isLanding) {
            ac.isLanding = true;
            ac.landingAirport = coneEval.landingAirport;
            ac.coneSuppressed = true;
            ac.status = 'landing';
            ac.isConeWarning = false;
          } else if (coneEval.isClimbingOut) {
            ac.isClimbingOut = true;
            ac.coneSuppressed = true;
            ac.isConeWarning = false;
            ac.status = 'safe';
          } else if (coneEval.isHighAltitude || ac.isHighAltitude) {
            ac.isHighAltitude = true;
            if (this.suppressHighAltitudeCones || coneEval.coneSuppressed) {
              ac.coneSuppressed = true;
              ac.isConeWarning = false;
              ac.status = 'safe';
            } else if (coneEval.isConeWarning) {
              ac.isConeWarning = true;
              ac.status = 'approaching';
              ac.etaSeconds = coneEval.etaSeconds;
              ac.entryDistanceMeters = coneEval.entryDistanceMeters;
              ac.closingSpeedKts = coneEval.closingSpeedKts;
            } else {
              ac.isConeWarning = false;
              ac.status = 'safe';
            }
          } else if (coneEval.isConeWarning && !ac.coneSuppressed) {
            ac.isConeWarning = true;
            ac.status = 'approaching';
            ac.etaSeconds = coneEval.etaSeconds;
            ac.entryDistanceMeters = coneEval.entryDistanceMeters;
            ac.closingSpeedKts = coneEval.closingSpeedKts;
          } else {
            // Turned away, outside cone, or clear of perimeter
            ac.isConeWarning = false;
            ac.status = 'safe';
            ac.etaSeconds = null;
            ac.entryDistanceMeters = null;
            ac.closingSpeedKts = null;
          }
        }
      } else if (!ac.isBreached && ac.isConeWarning === undefined && ac.latitude !== null && ac.longitude !== null && ac.latitude !== undefined && ac.longitude !== undefined) {
        const coneEval = this.evaluateAircraftCone(ac, homeLat, homeLon);
        ac.coneLengthMeters = coneEval.coneLengthMeters;
        ac.offBoresightDeg = coneEval.offBoresightDeg;

        if (coneEval.isLanding) {
          ac.isLanding = true;
          ac.landingAirport = coneEval.landingAirport;
          ac.coneSuppressed = true;
          ac.status = 'landing';
          ac.isConeWarning = false;
        } else if (coneEval.isClimbingOut) {
          ac.isClimbingOut = true;
          ac.coneSuppressed = true;
        }

        if (coneEval.isHighAltitude) {
          ac.isHighAltitude = true;
        }

        if (coneEval.coneSuppressed && ac.isHighAltitude) {
          ac.coneSuppressed = true;
          ac.isConeWarning = false;
        } else if (coneEval.isConeWarning && !ac.coneSuppressed) {
          ac.isConeWarning = true;
          ac.status = 'approaching';
          ac.etaSeconds = coneEval.etaSeconds;
          ac.entryDistanceMeters = coneEval.entryDistanceMeters;
          ac.closingSpeedKts = coneEval.closingSpeedKts;
        } else {
          ac.isConeWarning = false;
          ac.status = 'safe';
        }
      }
    }







    this.breachedAircraft = this.aircraft.filter(a => a.isBreached);



    this.approachingAircraft = this.aircraft.filter(a => !a.isBreached && (a.isConeWarning || a.status === 'approaching'));







    // State transition detection & two-stage audio alerting



    const now = Date.now();



    for (const ac of this.aircraft) {



      const prev = this.previousStatus.get(ac.hex) || 'safe';



      if (ac.isBreached) {



        // Escalation to breach immediately triggers alert



        if (prev !== 'breached') {



          this.triggerAudioAlert(ac, 'breached');



        } else if (now - (this.lastAlertTimes.get(ac.hex) || 0) >= 30000) {



          this.triggerAudioAlert(ac, 'breached');



        }



        this.previousStatus.set(ac.hex, 'breached');



      } else if (ac.isConeWarning || ac.status === 'approaching') {



        if (prev === 'safe') {



          this.triggerAudioAlert(ac, 'approaching');



        } else if (prev === 'approaching' && (now - (this.lastApproachingAlertTimes.get(ac.hex) || 0) >= 45000)) {



          this.triggerAudioAlert(ac, 'approaching');



        }



        this.previousStatus.set(ac.hex, 'approaching');



      } else {



        this.previousStatus.set(ac.hex, 'safe');



      }



    }







    // Clean up previousStatus and alert timers for aircraft that left coverage
    const activeHexes = new Set(this.aircraft.map(a => a.hex));
    for (const hex of this.previousStatus.keys()) {
      if (!activeHexes.has(hex)) this.previousStatus.delete(hex);
    }
    for (const hex of this.lastAlertTimes.keys()) {
      if (!activeHexes.has(hex)) this.lastAlertTimes.delete(hex);
    }
    for (const hex of this.lastApproachingAlertTimes.keys()) {
      if (!activeHexes.has(hex)) this.lastApproachingAlertTimes.delete(hex);
    }







    this.updateVisualBanner();



    this.updateTopbarAndHud();



    this.updateMapMarkers();



    if (this.isDrawerOpen) {



      this.updateDrawerAircraftList();



      if (!this.streamConnected) {

        this.fetchAirspaceStatus();

      }



    }



  },







  async pollAirspace() {
    if (!this.enabled) return;

    // If running on Native Android container without an explicit remote companion host,
    // ADS-B telemetry is provided natively via AndroidAdsbBridge TCP socket.
    if (typeof Platform !== 'undefined' && typeof Platform.isNativeAndroid === 'function' && Platform.isNativeAndroid() && (!this.customEndpoint || !this.customEndpoint.trim())) {
      const storedComp = (typeof localStorage !== 'undefined') ? localStorage.getItem('aalaapi-companion-host') : null;
      if (!storedComp || storedComp.includes('127.0.0.1') || storedComp.includes('localhost')) {
        return;
      }
    }

    try {



      const origin = this.getAlertOrigin();



    const homeLat = origin.lat;



    const homeLon = origin.lon;







      const endpoint = this.getEffectiveEndpoint();

      const token = (typeof CompanionAuth !== 'undefined' && CompanionAuth.token) ? CompanionAuth.token : '';

      const tokenParam = token ? `&token=${encodeURIComponent(token)}` : '';

      const airportList = this.airports ? Array.from(this.airports.values()) : [];
    const airportsParam = airportList.length > 0 ? `&airports=${encodeURIComponent(JSON.stringify(airportList))}` : '';
    const url = `${endpoint}?lat=${homeLat.toFixed(5)}&lon=${homeLon.toFixed(5)}&radius=${this.radiusMiles}&ceiling=${this.ceilingFeet}&warningMinutes=${this.warningMinutes}&coneDeviationDeg=${this.coneDeviationDeg}&includeSafe=true&suppressAirportLanding=${this.suppressAirportLanding}&airportRadiusNm=${this.airportRadiusNm}&highAltitudeThreshold=${this.highAltitudeThresholdFt || 10000}&suppressHighAltitudeCones=${this.suppressHighAltitudeCones}${airportsParam}${tokenParam}`;



      const res = await fetch(url, {

        headers: (typeof getCompanionAuthHeaders === 'function') ? getCompanionAuthHeaders() : {}

      });



      if (res.status === 401) {

        // Companion bridge requires pilot authentication; exit cleanly until sign-in

        return;

      }



      if (!res.ok) throw new Error(`HTTP ${res.status}`);



      const data = await res.json();



      this.processAirspaceData(data);



      if (this.isDrawerOpen) {



        this.fetchAirspaceStatus();



      }



    } catch (e) {



      // Endpoint error or companion offline



    }



  },







  renderAirspaceOverlays() {

    this.updateMapMarkers();

    this.updateProximityRing();

  },



  updateVisualBanner() {



    const banner = typeof document !== 'undefined' ? document.getElementById('adsb-alert-banner') : null;



    if (!banner) return;







    if (this.breachedAircraft.length > 0 && this.enabled) {



      const primary = this.breachedAircraft[0];



      const classified = this.getAircraftMeta(primary);



      const emojiEl = banner.querySelector('.adsb-alert-emoji');



      if (emojiEl) emojiEl.textContent = classified.emoji;







      const callsignEl = document.getElementById('adsb-alert-callsign');



      const altEl = document.getElementById('adsb-alert-altitude');



      const distEl = document.getElementById('adsb-alert-distance');



      const speedEl = document.getElementById('adsb-alert-speed');



      const badgeEl = document.getElementById('adsb-alert-badge');







      if (callsignEl) callsignEl.textContent = primary.callsign || `HEX:${primary.hex}`;



      if (altEl) {



        const isMetric = typeof isMetricMode === 'function' ? isMetricMode() : false;



        if (primary.altitude !== null && primary.altitude !== undefined) {



          altEl.textContent = isMetric 



            ? `${Math.round(primary.altitude * 0.3048)} m AGL` 



            : `${primary.altitude.toLocaleString()} ft AGL`;



        } else {



          altEl.textContent = 'Alt N/A';



        }



      }



      if (distEl) {



        const isMetric = typeof isMetricMode === 'function' ? isMetricMode() : false;



        const cardinal = primary.bearingCardinal ? ` ${primary.bearingCardinal}` : '';



        const deg = (typeof primary.bearingDeg === 'number') ? ` (${String(primary.bearingDeg).padStart(3, '0')}°)` : '';



        if (isMetric) {



          const km = (typeof primary.distanceMeters === 'number') ? (primary.distanceMeters / 1000).toFixed(1) : '--';



          distEl.textContent = `${km} km${cardinal}${deg}`;



        } else {



          const mi = (typeof primary.distanceMiles === 'number') ? primary.distanceMiles.toFixed(1) : '--';



          distEl.textContent = `${mi} mi${cardinal}${deg}`;



        }



      }



      if (speedEl) {



        speedEl.textContent = primary.speed ? `${primary.speed} kts` : '-- kts';



      }



      if (badgeEl) {



        badgeEl.textContent = this.breachedAircraft.length > 1 



          ? `${classified.label.toUpperCase()} BREACH (${this.breachedAircraft.length})` 



          : `${classified.label.toUpperCase()} BREACH`;



      }







      banner.classList.remove('hidden', 'is-approaching');
      banner.classList.add('is-breached');
      const ridHud = typeof document !== 'undefined' ? document.getElementById('remote-id-airspace-hud') : null;
      if (ridHud) ridHud.classList.add('has-adsb-alert');

    } else if (this.approachingAircraft.length > 0 && this.enabled) {



      const primary = this.approachingAircraft[0];



      const classified = this.getAircraftMeta(primary);



      const emojiEl = banner.querySelector('.adsb-alert-emoji');



      if (emojiEl) emojiEl.textContent = classified.emoji;







      const callsignEl = document.getElementById('adsb-alert-callsign');



      const altEl = document.getElementById('adsb-alert-altitude');



      const distEl = document.getElementById('adsb-alert-distance');



      const speedEl = document.getElementById('adsb-alert-speed');



      const badgeEl = document.getElementById('adsb-alert-badge');







      if (callsignEl) callsignEl.textContent = primary.callsign || `HEX:${primary.hex}`;



      if (altEl) {



        const isMetric = typeof isMetricMode === 'function' ? isMetricMode() : false;



        if (primary.altitude !== null && primary.altitude !== undefined) {



          altEl.textContent = isMetric 



            ? `${Math.round(primary.altitude * 0.3048)} m AGL` 



            : `${primary.altitude.toLocaleString()} ft AGL`;



        } else {



          altEl.textContent = 'Alt N/A';



        }



      }



      if (distEl) {



        const isMetric = typeof isMetricMode === 'function' ? isMetricMode() : false;



        const cardinal = primary.bearingCardinal ? ` ${primary.bearingCardinal}` : '';



        const deg = (typeof primary.bearingDeg === 'number') ? ` (${String(primary.bearingDeg).padStart(3, '0')}°)` : '';



        if (isMetric) {



          const km = (typeof primary.distanceMeters === 'number') ? (primary.distanceMeters / 1000).toFixed(1) : '--';



          distEl.textContent = `${km} km${cardinal}${deg}`;



        } else {



          const mi = (typeof primary.distanceMiles === 'number') ? primary.distanceMiles.toFixed(1) : '--';



          distEl.textContent = `${mi} mi${cardinal}${deg}`;



        }



      }



      if (speedEl) {



        const closing = primary.closingSpeedKts !== null && primary.closingSpeedKts !== undefined ? primary.closingSpeedKts : primary.speed;



        speedEl.textContent = closing ? `Closing: ${closing} kts` : '-- kts';



      }



      if (badgeEl) {



        let etaLabel = 'TRAFFIC APPROACHING';



        if (typeof primary.etaSeconds === 'number' && primary.etaSeconds > 0) {



          const etaMin = Math.floor(primary.etaSeconds / 60);



          const etaSec = primary.etaSeconds % 60;



          etaLabel = `APPROACHING (${etaMin}m ${etaSec}s)`;



        }



        badgeEl.textContent = this.approachingAircraft.length > 1 



          ? `${etaLabel} +${this.approachingAircraft.length - 1}` 



          : etaLabel;



      }







      banner.classList.remove('hidden', 'is-breached');
      banner.classList.add('is-approaching');
      const ridHud = typeof document !== 'undefined' ? document.getElementById('remote-id-airspace-hud') : null;
      if (ridHud) ridHud.classList.add('has-adsb-alert');

    } else {

      banner.classList.add('hidden');
      banner.classList.remove('is-breached', 'is-approaching');
      const ridHud = typeof document !== 'undefined' ? document.getElementById('remote-id-airspace-hud') : null;
      if (ridHud) ridHud.classList.remove('has-adsb-alert');

    }



  },







  updateTopbarAndHud() {



    if (typeof document === 'undefined') return;



    const topbarBadge = document.getElementById('adsb-topbar-badge');



    const topbarBtn = document.getElementById('adsb-topbar-btn');



    const mapPill = document.getElementById('adsb-map-pill');



    const mapPillText = document.getElementById('adsb-map-pill-text');



    const beaconDot = document.getElementById('adsb-beacon-dot');







    const breachedCount = this.breachedAircraft.length;



    const approachingCount = this.approachingAircraft.length;



    const totalCount = this.aircraft.length;







    if (topbarBadge) {



      if (breachedCount > 0) {



        topbarBadge.textContent = `${breachedCount} ALERT`;



        topbarBadge.style.background = 'rgba(239, 68, 68, 0.4)';



        topbarBadge.style.color = '#fff';



        topbarBadge.classList.remove('hidden');



      } else if (approachingCount > 0) {



        topbarBadge.textContent = `${approachingCount} NEAR`;



        topbarBadge.style.background = 'rgba(245, 158, 11, 0.35)';



        topbarBadge.style.color = '#fbbf24';



        topbarBadge.classList.remove('hidden');



      } else if (totalCount > 0) {



        topbarBadge.textContent = `${totalCount}`;



        topbarBadge.style.background = 'rgba(56, 189, 248, 0.2)';



        topbarBadge.style.color = '#38bdf8';



        topbarBadge.classList.remove('hidden');



      } else {



        topbarBadge.classList.add('hidden');



      }



    }







    if (mapPill) {



      if (breachedCount > 0) {



        mapPill.classList.remove('hidden');



        if (mapPillText) mapPillText.textContent = `🚨 ${breachedCount} Traffic Alert`;



        if (beaconDot) {



          beaconDot.style.background = '#ef4444';



          beaconDot.classList.add('pulsing-beacon-dot');



        }



      } else if (approachingCount > 0) {



        mapPill.classList.remove('hidden');



        if (mapPillText) mapPillText.textContent = `⚠️ ${approachingCount} Approaching`;



        if (beaconDot) {



          beaconDot.style.background = '#f59e0b';



          beaconDot.classList.remove('pulsing-beacon-dot');



        }



      } else if (totalCount > 0) {



        mapPill.classList.remove('hidden');



        if (mapPillText) mapPillText.textContent = `✈️ ${totalCount} Aircraft`;



        if (beaconDot) {



          beaconDot.style.background = '#38bdf8';



          beaconDot.classList.remove('pulsing-beacon-dot');



        }



      } else {



        mapPill.classList.add('hidden');



      }



    }



  },







  updateMapMarkers() {



    const leaflet = (typeof L !== 'undefined' && L) || (typeof window !== 'undefined' && window.L) || (typeof global !== 'undefined' && global.L);



    if (!leaflet) return;



    this.initMapLayer();



    if (!this.layerGroup) return;







    const currentHexes = new Set();







    for (const ac of this.aircraft) {



      if (ac.latitude == null && typeof ac.lat === 'number') ac.latitude = ac.lat;



      if (ac.longitude == null && typeof ac.lon === 'number') ac.longitude = ac.lon;



      if (ac.latitude === null || ac.longitude === null || ac.latitude === undefined || ac.longitude === undefined) continue;



      currentHexes.add(ac.hex);







      // Accumulate position history



      let hist = this.acHistory.get(ac.hex);



      if (!hist) {



        hist = [];



        this.acHistory.set(ac.hex, hist);



      }



      if (Array.isArray(ac.history) && ac.history.length > 0 && hist.length === 0) {



        hist.push(...ac.history);



      }



      const maxPointsMap = { '30s': 15, '60s': 30, '180s': 60, '300s': 100, 'off': 0 };



      const maxPts = maxPointsMap[this.trailDuration] !== undefined ? maxPointsMap[this.trailDuration] : 30;



      const lastPt = hist[hist.length - 1];



      if (!lastPt || Math.abs(lastPt[0] - ac.latitude) > 0.00005 || Math.abs(lastPt[1] - ac.longitude) > 0.00005) {



        hist.push([ac.latitude, ac.longitude, ac.altitude || 0, Date.now()]);



        while (hist.length > maxPts && hist.length > 0) hist.shift();



      }







      // Render/Update Flight History Trail



      if (this.showTrails && hist.length >= 2) {



        const latlngs = hist.map(pt => [pt[0], pt[1]]);



        let poly = this.mapTrails.get(ac.hex);



        const trailColor = ac.isBreached ? '#ef4444' : '#38bdf8';



        const trailWeight = ac.isBreached ? 3 : 2;



        const trailDash = ac.isBreached ? '4, 4' : null;







        if (!poly) {



          if (leaflet.polyline) {



            poly = leaflet.polyline(latlngs, {



              color: trailColor,



              weight: trailWeight,



              opacity: 0.7,



              dashArray: trailDash,



              className: `adsb-flight-trail ${ac.isBreached ? 'breached' : ''}`



            });



            if (this.layerGroup && this.layerGroup.addLayer) {



              poly.addTo(this.layerGroup);



            }



            this.mapTrails.set(ac.hex, poly);



          }



        } else {



          if (poly.setLatLngs) poly.setLatLngs(latlngs);



          if (poly.setStyle) {



            poly.setStyle({



              color: trailColor,



              weight: trailWeight,



              opacity: 0.7,



              dashArray: trailDash



            });



          }



        }



      } else if (!this.showTrails) {



        const poly = this.mapTrails.get(ac.hex);



        if (poly) {



          if (this.layerGroup && this.layerGroup.removeLayer) this.layerGroup.removeLayer(poly);



          this.mapTrails.delete(ac.hex);



        }



      }







      const isBreached = ac.isBreached;



      const isApproaching = !isBreached && (ac.isConeWarning || ac.status === 'approaching');



      const track = ac.track || 0;



      const altStr = ac.altitude ? `${ac.altitude} ft` : 'Alt N/A';



      const speedStr = ac.speed ? `${ac.speed} kt` : '';



      const typeStr = ac.aircraftType ? ` [${ac.aircraftType}]` : '';



      const srcStr = ac.source || ac.dataSource || 'Local SDR';



      const classified = this.getAircraftMeta(ac);







      let alertBadgeTooltip = '';



      if (isBreached) {



        alertBadgeTooltip = '<br><span style="font-weight: 700; color: #ef4444;">🚨 PERIMETER BREACH</span>';



      } else if (isApproaching) {



        const etaMin = Math.floor((ac.etaSeconds || 0) / 60);



        const etaSec = (ac.etaSeconds || 0) % 60;



        const closing = ac.closingSpeedKts ? ` • Closing: ${ac.closingSpeedKts} kt` : '';



        alertBadgeTooltip = `<br><span style="font-weight: 700; color: #f59e0b;">⚠️ APPROACHING PERIMETER</span><br><span style="font-size: 0.68rem; color: #fbbf24;">ETA: ${etaMin}m ${etaSec}s${closing}</span>`;



      } else if (ac.isLanding) {



        const aptLabel = ac.landingAirport ? ` (${ac.landingAirport})` : '';



        alertBadgeTooltip = `<br><span style="font-weight: 700; color: #38bdf8;">🛬 AIRPORT TRAFFIC${aptLabel}</span><br><span style="font-size: 0.68rem; color: #94a3b8;">Pattern / Landing Assumed • Cone Suppressed</span>`;



      } else if (ac.isHighAltitude) {



        const altAglStr = (ac.altitudeAgl !== null && ac.altitudeAgl !== undefined) ? `${ac.altitudeAgl} ft AGL` : 'HIGH ALT';



        alertBadgeTooltip = `<br><span style="font-weight: 700; color: #86efac;">✈️ HIGH ALTITUDE CRUISE (${altAglStr})</span><br><span style="font-size: 0.68rem; color: #94a3b8;">Cone Suppressed</span>`;



      }







      let vrateTooltipBadge = '';

      const vRateVal = typeof ac.verticalRate === 'number' && !isNaN(ac.verticalRate) ? ac.verticalRate : (ac.verticalRateFpm || 0);

      if (vRateVal <= -200) {

        const sev = ac.descentSeverity || (vRateVal < -1200 ? 'severe' : (vRateVal < -500 ? 'moderate' : 'mild'));

        vrateTooltipBadge = ` <span class="adsb-vrate-badge descending-${sev}">⤓ ${Math.abs(Math.round(vRateVal))} fpm</span>`;

      } else if (vRateVal > 200) {

        vrateTooltipBadge = ` <span class="adsb-vrate-badge climbing">⤒ +${Math.round(vRateVal)} fpm</span>`;

      }



      const tooltipContent = `<strong>${ac.callsign || ac.hex}</strong>${typeStr}<br><span style="font-weight: 600; color: #38bdf8;">${classified.emoji} ${classified.label}</span><br>Alt: ${altStr}${vrateTooltipBadge} • ${speedStr}<br>Dist: ${ac.distanceMiles || '--'} mi ${ac.bearingCardinal || ''}${alertBadgeTooltip}<br><span style="font-size: 0.64rem; color: #94a3b8;">Source: ${srcStr}</span>`;







      // Render/Update Predictive Trajectory Cone



      const hasSpeedAndTrack = typeof ac.speed === 'number' && ac.speed > 0 && typeof ac.track === 'number' && !isNaN(ac.track);



      if (hasSpeedAndTrack && ac.latitude !== null && ac.longitude !== null && !ac.isLanding && !ac.coneSuppressed) {



        const coneLen = ac.coneLengthMeters || Math.round((ac.speed * 0.51444444) * (this.warningMinutes * 60));



        const coneDev = this.coneDeviationDeg || 15;



        const coneGeom = this.computeConePolygonLatLngs(ac.latitude, ac.longitude, ac.track, coneLen, coneDev);



                const coneColor = isBreached ? '#ef4444' : (isApproaching ? '#f59e0b' : '#38bdf8');

        const isDescendingTraffic = (ac.isDescending || (typeof ac.verticalRate === 'number' && ac.verticalRate <= -200));

        const useGradient = this.descentGradientEnabled && isDescendingTraffic;



        const existingEntry = this.mapCones.get(ac.hex);

        if (useGradient) {

          this.updateConeGradient(ac, coneGeom, coneColor, map, existingEntry ? existingEntry.poly : null);

        } else {

          this.removeConeGradient(ac.hex, map);

        }



        const coneFillColor = useGradient ? `url(#adsb-cone-grad-${ac.hex})` : coneColor;

        const coneFillOpacity = useGradient ? 1.0 : (isBreached ? 0.12 : (isApproaching ? 0.20 : 0.08));

        const strokeColor = useGradient ? (ac.descentSeverity === 'severe' ? '#ef4444' : (ac.descentSeverity === 'moderate' ? '#ea580c' : coneColor)) : coneColor;



        if (this.showCones && this.coneLayerGroup) {



          let coneEntry = this.mapCones.get(ac.hex);



          if (!coneEntry) {



            if (leaflet.polygon && leaflet.polyline && leaflet.layerGroup) {



              const poly = leaflet.polygon(coneGeom.polygonLatLngs, {



                color: strokeColor,



                weight: (isApproaching || useGradient) ? 2 : 1,



                fillColor: coneFillColor,



                fillOpacity: coneFillOpacity,



                dashArray: isApproaching ? '4, 4' : null,



                className: `adsb-cone-polygon ${isBreached ? 'breached' : (isApproaching ? 'approaching' : '')} ${useGradient ? 'descent-gradient' : ''}`



              });



              const centerLine = leaflet.polyline(coneGeom.centerLineLatLngs, {



                color: strokeColor,



                weight: (isApproaching || useGradient) ? 1.5 : 1,



                dashArray: '3, 4',



                opacity: useGradient ? 0.9 : 0.7



              });



              const grp = leaflet.layerGroup([poly, centerLine]);

              if (this.coneLayerGroup && typeof this.coneLayerGroup.addLayer === 'function') {

                this.coneLayerGroup.addLayer(grp);

              } else if (grp && typeof grp.addTo === 'function') {

                grp.addTo(this.coneLayerGroup);

              }

              this.mapCones.set(ac.hex, { group: grp, poly, centerLine, coneGeom, coneColor });

              if (useGradient) {

                this.updateConeGradient(ac, coneGeom, coneColor, map, poly);

              }



            }



          } else {



            coneEntry.coneGeom = coneGeom;

            coneEntry.coneColor = coneColor;



            if (useGradient) {

              this.updateConeGradient(ac, coneGeom, coneColor, map, coneEntry.poly);

            } else {

              this.removeConeGradient(ac.hex, map);

            }



            if (coneEntry.poly && coneEntry.poly.setLatLngs) {



              coneEntry.poly.setLatLngs(coneGeom.polygonLatLngs);



              coneEntry.poly.setStyle({



                color: strokeColor,



                weight: (isApproaching || useGradient) ? 2 : 1,



                fillColor: coneFillColor,



                fillOpacity: coneFillOpacity,



                dashArray: isApproaching ? '4, 4' : null,



                className: `adsb-cone-polygon ${isBreached ? 'breached' : (isApproaching ? 'approaching' : '')} ${useGradient ? 'descent-gradient' : ''}`



              });



              if (useGradient && coneEntry.poly._path) {

                coneEntry.poly._path.setAttribute('fill', coneFillColor);

                coneEntry.poly._path.style.fill = coneFillColor;

              } else if (!useGradient && coneEntry.poly._path) {

                coneEntry.poly._path.style.fill = '';

              }



            }



            if (coneEntry.centerLine && coneEntry.centerLine.setLatLngs) {



              coneEntry.centerLine.setLatLngs(coneGeom.centerLineLatLngs);



              coneEntry.centerLine.setStyle({



                color: strokeColor,



                weight: (isApproaching || useGradient) ? 1.5 : 1,



                opacity: useGradient ? 0.9 : 0.7



              });



            }



          }



        } else if (!this.showCones) {



          const coneEntry = this.mapCones.get(ac.hex);



          if (coneEntry) {



            if (this.coneLayerGroup && this.coneLayerGroup.removeLayer && coneEntry.group) {



              this.coneLayerGroup.removeLayer(coneEntry.group);



            }



            this.mapCones.delete(ac.hex);

            this.removeConeGradient(ac.hex, map);



          }



        }



      }



      if (ac.isLanding || ac.coneSuppressed || (this.suppressHighAltitudeCones && ac.isHighAltitude)) {

        const coneEntry = this.mapCones.get(ac.hex);

        if (coneEntry) {

          if (this.coneLayerGroup && this.coneLayerGroup.removeLayer && coneEntry.group) {

            this.coneLayerGroup.removeLayer(coneEntry.group);

          }

          this.mapCones.delete(ac.hex);

          this.removeConeGradient(ac.hex, map);

        }

      }



      let marker = this.mapMarkers.get(ac.hex);



      if (!marker) {



        const innerClass = isBreached 



          ? `adsb-marker-inner breached ${classified.type}` 



          : (isApproaching ? `adsb-marker-inner approaching ${classified.type}` : (ac.isLanding ? `adsb-marker-inner landing ${classified.type}` : (ac.isHighAltitude ? `adsb-marker-inner high-altitude ${classified.type}` : `adsb-marker-inner ${classified.type}`)));



        const markerSvg = this.getAircraftMarkerSvg(classified.type);



        const iconHtml = `



          <div class="adsb-map-aircraft-marker" data-type="${classified.type}" style="transform: rotate(${track}deg);">



            <div class="${innerClass}">



              ${markerSvg}



            </div>



          </div>



        `;



        const divIcon = leaflet.divIcon({



          className: 'adsb-leaflet-marker-container',



          html: iconHtml,



          iconSize: [32, 32],



          iconAnchor: [16, 16]



        });







        marker = leaflet.marker([ac.latitude, ac.longitude], { icon: divIcon });



        marker._aircraftTypeClass = classified.type;



        marker._isBreached = isBreached;



        marker._isApproaching = isApproaching;



        if (marker.bindTooltip) {



          marker.bindTooltip(tooltipContent, {



            className: `adsb-plane-tooltip ${isBreached ? 'breached' : (isApproaching ? 'approaching' : '')}`,



            direction: 'top',



            offset: [0, -12]



          });



        }







        // Bind hover preview for trajectory cone when layer toggle is off



        if (marker.on) {



          marker.on('mouseover', () => {



            this.hoveredHex = ac.hex;

            if (this.suppressHighAltitudeCones && ac.isHighAltitude) return;
            if (ac.isLanding || ac.coneSuppressed) return;



            if (!this.showCones && this.layerGroup && leaflet.polygon && leaflet.polyline && leaflet.layerGroup) {



              if (this.hoverConeLayer) {



                try { this.layerGroup.removeLayer(this.hoverConeLayer); } catch (_) {}



                this.hoverConeLayer = null;



              }



              const hLen = ac.coneLengthMeters || Math.round(((ac.speed || 100) * 0.51444444) * (this.warningMinutes * 60));



              const hDev = this.coneDeviationDeg || 15;



              const hTrack = typeof ac.track === 'number' ? ac.track : 0;



              const hGeom = this.computeConePolygonLatLngs(ac.latitude, ac.longitude, hTrack, hLen, hDev);



              const hColor = ac.isBreached ? '#ef4444' : (isApproaching ? '#f59e0b' : '#38bdf8');



              const poly = leaflet.polygon(hGeom.polygonLatLngs, {



                color: hColor,



                weight: 2,



                fillColor: hColor,



                fillOpacity: 0.22,



                dashArray: '3, 3'



              });



              const centerLine = leaflet.polyline(hGeom.centerLineLatLngs, {



                color: hColor,



                weight: 1.5,



                dashArray: '4, 4'



              });



              const grp = leaflet.layerGroup([poly, centerLine]);



              grp.addTo(this.layerGroup);



              this.hoverConeLayer = grp;



            }



          });



          marker.on('mouseout', () => {



            this.hoveredHex = null;



            if (this.hoverConeLayer && this.layerGroup) {



              try { this.layerGroup.removeLayer(this.hoverConeLayer); } catch (_) {}



              this.hoverConeLayer = null;



            }



          });



        }







        marker.addTo(this.layerGroup);



        this.mapMarkers.set(ac.hex, marker);



      } else {



        marker.setLatLng([ac.latitude, ac.longitude]);



        const inner = marker.getElement()?.querySelector('.adsb-map-aircraft-marker');



        if (inner) {



          inner.style.transform = `rotate(${track}deg)`;



          inner.setAttribute('data-type', classified.type);



          const innerRing = inner.querySelector('.adsb-marker-inner');



          if (innerRing) {



            innerRing.className = isBreached 



              ? `adsb-marker-inner breached ${classified.type}` 



              : (isApproaching ? `adsb-marker-inner approaching ${classified.type}` : (ac.isLanding ? `adsb-marker-inner landing ${classified.type}` : (ac.isHighAltitude ? `adsb-marker-inner high-altitude ${classified.type}` : `adsb-marker-inner ${classified.type}`)));



            if (marker._aircraftTypeClass !== classified.type) {



              innerRing.innerHTML = this.getAircraftMarkerSvg(classified.type);



              marker._aircraftTypeClass = classified.type;



            }



          }



        }



        marker._isBreached = isBreached;



        marker._isApproaching = isApproaching;



        if (marker.setTooltipContent) {



          marker.setTooltipContent(tooltipContent);



        }



      }



    }







    // Remove markers & trails no longer in range



    for (const [hex, marker] of this.mapMarkers.entries()) {



      if (!currentHexes.has(hex)) {



        if (this.layerGroup && this.layerGroup.removeLayer) this.layerGroup.removeLayer(marker);



        this.mapMarkers.delete(hex);



        const poly = this.mapTrails.get(hex);



        if (poly) {



          if (this.layerGroup && this.layerGroup.removeLayer) this.layerGroup.removeLayer(poly);



          this.mapTrails.delete(hex);



        }



        const coneEntry = this.mapCones.get(hex);



        if (coneEntry) {



          if (this.coneLayerGroup && this.coneLayerGroup.removeLayer && coneEntry.group) {



            this.coneLayerGroup.removeLayer(coneEntry.group);



          }



          this.mapCones.delete(hex);



        }



        this.acHistory.delete(hex);



      }



    }



  },







  async clearAll(notifyServer = true) {



    this.aircraft = [];



    this.breachedAircraft = [];



    this.approachingAircraft = [];



    this.previousStatus.clear();



    this.lastAlertTimes.clear();



    this.lastApproachingAlertTimes.clear();



    this.updateVisualBanner();



    this.updateTopbarAndHud();



    if (this.layerGroup && this.layerGroup.clearLayers) {



      this.layerGroup.clearLayers();



    }



    if (this.coneLayerGroup && this.coneLayerGroup.clearLayers) {



      this.coneLayerGroup.clearLayers();



    }



    if (this.hoverConeLayer && this.layerGroup) {



      try { this.layerGroup.removeLayer(this.hoverConeLayer); } catch (_) {}



      this.hoverConeLayer = null;



    }



    this.mapMarkers.clear();



    this.mapTrails.clear();



    this.mapCones.clear();



    this.acHistory.clear();



    if (this.isDrawerOpen) {



      this.updateDrawerAircraftList();



    }



    if (notifyServer && typeof fetch === 'function') {



      try {



        const apiBase = (typeof getCompanionApiBase === 'function') ? getCompanionApiBase() : 'http://127.0.0.1:8765';



        await fetch(`${apiBase}/api/airspace/clear`, { method: 'POST' });



      } catch (_) {}



    }



  },







  updateControlsUI() {



    if (typeof document === 'undefined') return;







    const enableToggle = document.getElementById('adsb-enable-toggle');



    if (enableToggle) enableToggle.checked = this.enabled;







    const soundToggle = document.getElementById('adsb-sound-toggle');



    if (soundToggle) soundToggle.checked = this.soundEnabled;







    const trailsToggle = document.getElementById('adsb-trails-toggle');



    if (trailsToggle) trailsToggle.checked = this.showTrails;







    const trailDurationSelect = document.getElementById('adsb-trail-duration-select');



    if (trailDurationSelect) trailDurationSelect.value = this.showTrails ? (this.trailDuration || '60s') : 'off';







    const soundSelect = document.getElementById('adsb-sound-type-select');

    if (soundSelect) soundSelect.value = this.soundType;

    const ttsPresetSelect = document.getElementById('adsb-tts-preset-select');
    if (ttsPresetSelect) ttsPresetSelect.value = this.ttsPreset || 'standard';

    const ttsBreachInput = document.getElementById('adsb-tts-breach-input');
    if (ttsBreachInput && (typeof document === 'undefined' || document.activeElement !== ttsBreachInput)) {
      ttsBreachInput.value = this.ttsBreachTemplate || (this.TTS_PRESETS && this.TTS_PRESETS.standard ? this.TTS_PRESETS.standard.breach : 'Traffic alert! {callsign}, {distance} {direction}, {altitude}.');
    }

    const ttsApproachingInput = document.getElementById('adsb-tts-approaching-input');
    if (ttsApproachingInput && (typeof document === 'undefined' || document.activeElement !== ttsApproachingInput)) {
      ttsApproachingInput.value = this.ttsApproachingTemplate || (this.TTS_PRESETS && this.TTS_PRESETS.standard ? this.TTS_PRESETS.standard.approaching : 'Traffic approaching! {callsign}, {distance} {direction}, perimeter ETA {eta}.');
    }







    const radiusSlider = document.getElementById('adsb-radius-slider');



    const radiusVal = document.getElementById('adsb-radius-val');



    if (radiusSlider) radiusSlider.value = this.radiusMiles;



    if (radiusVal) {



      const isMetric = typeof isMetricMode === 'function' ? isMetricMode() : false;



      const km = (this.radiusMiles * 1.609344).toFixed(1);



      radiusVal.textContent = isMetric 



        ? `${km} km (${this.radiusMiles} mi)` 



        : `${this.radiusMiles.toFixed(1)} mi (${km} km)`;



    }







    const ceilingSlider = document.getElementById('adsb-ceiling-slider');



    const ceilingVal = document.getElementById('adsb-ceiling-val');



    if (ceilingSlider) ceilingSlider.value = this.ceilingFeet;



    if (ceilingVal) {



      const isMetric = typeof isMetricMode === 'function' ? isMetricMode() : false;



      const m = Math.round(this.ceilingFeet * 0.3048);



      ceilingVal.textContent = isMetric 



        ? `${m.toLocaleString()} m (${this.ceilingFeet.toLocaleString()} ft)` 



        : `${this.ceilingFeet.toLocaleString()} ft (${m.toLocaleString()} m)`;



    }







    const warningMinSlider = document.getElementById('adsb-warning-min-slider');



    const warningMinVal = document.getElementById('adsb-warning-min-val');



    if (warningMinSlider) warningMinSlider.value = this.warningMinutes;



    if (warningMinVal) {



      warningMinVal.textContent = `${Number(this.warningMinutes).toFixed(1)} min`;



    }







    const coneDevSlider = document.getElementById('adsb-cone-dev-slider');



    const coneDevVal = document.getElementById('adsb-cone-dev-val');



    if (coneDevSlider) coneDevSlider.value = this.coneDeviationDeg;



    if (coneDevVal) {



      coneDevVal.textContent = `±${this.coneDeviationDeg}°`;



    }







    const conesToggle = document.getElementById('adsb-cones-toggle');



    if (conesToggle) conesToggle.checked = this.showCones;



    const highAltSlider = document.getElementById('adsb-high-alt-slider');

    const highAltVal = document.getElementById('adsb-high-alt-val');

    const suppressHighAltToggle = document.getElementById('adsb-suppress-high-altitude-toggle');

    if (highAltSlider) highAltSlider.value = this.highAltitudeThresholdFt || 10000;

    if (highAltVal) {
      const isMetric = typeof isMetricMode === 'function' ? isMetricMode() : false;
      const ft = this.highAltitudeThresholdFt || 10000;
      const m = Math.round(Math.round(ft * 0.3048) / 50) * 50;
      highAltVal.textContent = isMetric 
        ? `${m.toLocaleString()} m (${ft.toLocaleString()} ft)` 
        : `${ft.toLocaleString()} ft (${m.toLocaleString()} m)`;
    }

    if (suppressHighAltToggle) suppressHighAltToggle.checked = this.suppressHighAltitudeCones;



    const descentGradToggle = document.getElementById('adsb-descent-gradient-toggle');



    if (descentGradToggle) descentGradToggle.checked = this.descentGradientEnabled;



    const anchorSelect = document.getElementById('adsb-anchor-mode-select');



    if (anchorSelect) anchorSelect.value = this.alertAnchorMode || 'auto';



    const ringToggle = document.getElementById('adsb-show-proximity-ring-toggle');



    if (ringToggle) ringToggle.checked = this.showProximityRing;



    const anchorBadge = document.getElementById('adsb-active-anchor-badge');



    if (anchorBadge) {

      const orig = this.getAlertOrigin();

      anchorBadge.textContent = `📍 Anchor: ${orig.label}`;

    }



    const landingToggle = document.getElementById('adsb-airport-landing-toggle');



    if (landingToggle) landingToggle.checked = this.suppressAirportLanding;



    const airportRadiusSlider = document.getElementById('adsb-airport-radius-slider');



    const airportRadiusVal = document.getElementById('adsb-airport-radius-val');



    if (airportRadiusSlider) airportRadiusSlider.value = this.airportRadiusNm;



    if (airportRadiusVal) {



      const km = (this.airportRadiusNm * 1.852).toFixed(1);



      airportRadiusVal.textContent = `${this.airportRadiusNm.toFixed(1)} NM (${km} km)`;



    }







    const endpointInput = document.getElementById('adsb-endpoint-input');



    if (endpointInput) endpointInput.value = this.customEndpoint || '';







    const hostInput = document.getElementById('adsb-host-input');



    if (hostInput && document.activeElement !== hostInput) {



      hostInput.value = this.serverHost || '127.0.0.1';



    }







    const portInput = document.getElementById('adsb-port-input');



    if (portInput && document.activeElement !== portInput) {



      portInput.value = this.serverPort || 30003;



    }







    const extProviderSelect = document.getElementById('adsb-external-provider-select');



    if (extProviderSelect) extProviderSelect.value = this.externalProvider || 'adsb.lol';







    const extRadiusSelect = document.getElementById('adsb-external-radius-select');



    if (extRadiusSelect) extRadiusSelect.value = String(this.externalRadiusNM || 15);







    const extCustomUrlInput = document.getElementById('adsb-external-custom-url');



    const extCustomContainer = document.getElementById('adsb-external-custom-url-container');



    if (extCustomUrlInput) extCustomUrlInput.value = this.externalCustomUrl || '';



    if (extCustomContainer) {



      extCustomContainer.style.display = (this.externalProvider === 'custom') ? 'block' : 'none';



    }







    this.updateExternalWatchUI();



  },







  updateDrawerAircraftList() {



    if (typeof document === 'undefined') return;



    const listEl = document.getElementById('adsb-aircraft-list');



    const badgeEl = document.getElementById('adsb-tracked-count-badge');



    const hwCountEl = document.getElementById('adsb-hw-count');







    if (hwCountEl) hwCountEl.textContent = this.aircraft.length;



    if (badgeEl) {



      const withPos = this.aircraft.filter(a => a.latitude !== null && a.longitude !== null).length;



      const noPos = this.aircraft.length - withPos;



      if (noPos > 0 && withPos > 0) {



        badgeEl.textContent = `${withPos} in Range • ${noPos} Mode S`;



      } else if (noPos > 0 && withPos === 0) {



        badgeEl.textContent = `${noPos} Mode S (Pending Fix)`;



      } else {



        badgeEl.textContent = `${this.aircraft.length} in Range`;



      }



      if (this.breachedAircraft.length > 0) {



        badgeEl.style.background = 'rgba(239, 68, 68, 0.25)';



        badgeEl.style.color = '#fca5a5';



      } else {



        badgeEl.style.background = 'rgba(56, 189, 248, 0.15)';



        badgeEl.style.color = '#38bdf8';



      }



    }







    const tabPill = document.getElementById('adsb-tab-traffic-badge');



    if (tabPill) {



      const count = this.aircraft.length;



      if (count > 0) {



        tabPill.textContent = count;



        tabPill.classList.remove('hidden');



        if (this.breachedAircraft.length > 0) {



          tabPill.classList.add('is-breached');



        } else {



          tabPill.classList.remove('is-breached');



        }



      } else {



        tabPill.classList.add('hidden');



      }



    }







    if (!listEl) return;



    if (this.aircraft.length === 0) {



      listEl.innerHTML = '<div style="font-size: 0.72rem; color: var(--text-muted); text-align: center; padding: 12px 0;">No aircraft currently in range</div>';



      return;



    }







    const isMetric = typeof isMetricMode === 'function' ? isMetricMode() : false;



    let html = '';



    for (const ac of this.aircraft) {



      const isBreached = ac.isBreached;



      const isApproaching = !isBreached && (ac.isConeWarning || ac.status === 'approaching');



      const hasPos = ac.latitude !== null && ac.longitude !== null;



      const altStr = ac.altitude !== null ? (isMetric ? `${Math.round(ac.altitude * 0.3048)}m` : `${ac.altitude}ft`) : 'Alt N/A';



      let vrateBadge = '';

      const vRateNum = typeof ac.verticalRate === 'number' && !isNaN(ac.verticalRate) ? ac.verticalRate : (ac.verticalRateFpm || 0);

      if (vRateNum <= -200) {

        const sev = ac.descentSeverity || (vRateNum < -1200 ? 'severe' : (vRateNum < -500 ? 'moderate' : 'mild'));

        vrateBadge = ` <span class="adsb-vrate-badge descending-${sev}">⤓ ${Math.abs(Math.round(vRateNum))} fpm</span>`;

      } else if (vRateNum > 200) {

        vrateBadge = ` <span class="adsb-vrate-badge climbing">⤒ +${Math.round(vRateNum)} fpm</span>`;

      }



      const distStr = ac.distanceMiles !== null ? (isMetric ? `${(ac.distanceMeters / 1000).toFixed(1)}km` : `${ac.distanceMiles}mi`) : '--';



      



      let sourceBadge = '';



      const src = ac.source || ac.dataSource || 'local';



      if (src === 'sbs-tcp' || src === 'dump1090-tcp' || src === 'avr-tcp' || src === 'local' || src === 'dump1090-json') {



        sourceBadge = '<span class="adsb-source-badge local">LOCAL SDR</span>';



      } else if (src === 'adsb.lol') {



        sourceBadge = '<span class="adsb-source-badge lol">adsb.lol</span>';



      } else if (src === 'airplanes.live') {



        sourceBadge = '<span class="adsb-source-badge live">airplanes.live</span>';



      } else if (src === 'simulated') {



        sourceBadge = '<span class="adsb-source-badge sim">SIM</span>';



      } else {



        sourceBadge = `<span class="adsb-source-badge">${src}</span>`;



      }







      const classified = this.getAircraftMeta(ac);



      const classChip = `<span class="adsb-type-chip ${classified.type}" data-aircraft-type="${classified.type}">${classified.emoji} ${classified.label}</span>`;



      const typeBadge = ac.aircraftType ? `<span style="font-size: 0.62rem; font-weight: 600; color: #a5f3fc; background: rgba(56, 189, 248, 0.12); padding: 1px 4px; border-radius: 3px;">${ac.aircraftType}</span>` : '';







      let statusChip = '';



      let distDisplay = '';



      if (!hasPos) {



        statusChip = '<span style="font-size: 0.62rem; font-weight: 600; background: rgba(148, 163, 184, 0.2); color: #94a3b8; padding: 1px 6px; border-radius: 8px;">MODE S</span>';



        distDisplay = '<span style="font-size: 0.65rem; color: #94a3b8; font-style: italic;">Position pending</span>';



      } else if (isBreached) {



        statusChip = '<span style="font-size: 0.62rem; font-weight: 700; background: rgba(239, 68, 68, 0.3); border: 1px solid rgba(239, 68, 68, 0.6); color: #fca5a5; padding: 1px 6px; border-radius: 8px;">ALERT</span>';



        distDisplay = `<span style="font-size: 0.68rem; font-weight: 600; color: #fbbf24;">${distStr} ${ac.bearingCardinal || ''}</span>`;



      } else if (isApproaching) {



        const etaMin = Math.floor((ac.etaSeconds || 0) / 60);



        const etaSec = (ac.etaSeconds || 0) % 60;



        statusChip = `<span style="font-size: 0.62rem; font-weight: 700; background: rgba(245, 158, 11, 0.25); border: 1px solid rgba(245, 158, 11, 0.6); color: #fbbf24; padding: 1px 6px; border-radius: 8px;">APPROACHING (${etaMin}m ${etaSec}s)</span>`;



        distDisplay = `<span style="font-size: 0.68rem; font-weight: 600; color: #fbbf24;">${distStr} ${ac.bearingCardinal || ''}</span><span style="font-size: 0.62rem; color: #f59e0b; font-weight: 600;">ETA ${etaMin}m ${etaSec}s</span>`;



      } else if (ac.isLanding) {



        const aptTag = ac.landingAirport ? ` (${ac.landingAirport})` : '';



        statusChip = `<span class="adsb-landing-chip" style="font-size: 0.62rem; font-weight: 700; background: rgba(56, 189, 248, 0.2); border: 1px solid rgba(56, 189, 248, 0.6); color: #38bdf8; padding: 1px 6px; border-radius: 8px;">🛬 LANDING${aptTag}</span>`;



        distDisplay = `<span style="font-size: 0.68rem; font-weight: 600; color: #38bdf8;">${distStr} ${ac.bearingCardinal || ''}</span><span style="font-size: 0.62rem; color: #94a3b8; font-weight: 600;">Cone Suppressed</span>`;



      } else if (ac.isHighAltitude) {



        statusChip = '<span class="adsb-high-alt-chip">CRUISE (HIGH ALT)</span>';



        distDisplay = `<span style="font-size: 0.68rem; font-weight: 600; color: #86efac;">${distStr} ${ac.bearingCardinal || ''}</span><span style="font-size: 0.62rem; color: #86efac; font-weight: 600;">Cone Suppressed</span>`;



      } else {



        statusChip = '<span style="font-size: 0.62rem; font-weight: 600; background: rgba(16, 185, 129, 0.2); color: #34d399; padding: 1px 6px; border-radius: 8px;">SAFE</span>';



        distDisplay = `<span style="font-size: 0.68rem; font-weight: 600; color: #fbbf24;">${distStr} ${ac.bearingCardinal || ''}</span>`;



      }







      const speedSubtitle = ac.speed ? `${ac.speed} kts` : (hasPos ? '-- kts' : 'Speed N/A');



      const trackSubtitle = ac.track ? ` • <span>${ac.track}°</span>` : '';



      const groundSubtitle = ac.isOnGround ? ' • <span style="color: #6ee7b7;">Ground</span>' : '';







      html += `



        <div class="adsb-aircraft-card ${isBreached ? 'breached' : ''} ${isApproaching ? 'approaching' : ''} ${ac.isLanding ? 'landing' : ''} ${!hasPos ? 'mode-s-pending' : ''}" data-aircraft-type="${classified.type}">



          <div style="display: flex; flex-direction: column; gap: 2px;">



            <div style="display: flex; align-items: center; gap: 6px;">



              <span style="font-weight: 700; font-size: 0.78rem; color: #fff;">${ac.callsign || ac.hex}</span>



              ${classChip}



              ${typeBadge}



              <span style="font-size: 0.64rem; color: var(--text-muted); font-family: monospace;">[${ac.hex}]</span>



            </div>



            <div style="font-size: 0.68rem; color: var(--text-muted);">



              <span>${altStr}</span>${vrateBadge} • <span>${speedSubtitle}</span>${trackSubtitle}${groundSubtitle}



            </div>



          </div>



          <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 3px;">



            <div style="display: flex; align-items: center; gap: 4px;">



              ${sourceBadge}



              ${statusChip}



            </div>



            ${distDisplay}



          </div>



        </div>



      `;



    }



    listEl.innerHTML = html;



  },







  startExternalWatch() {



    if (this.externalWatchActive) {



      this.stopExternalWatch('manual');



      return;



    }



    this.externalWatchActive = true;



    this.externalWatchExpiresAt = Date.now() + 600000; // 10 minutes



    this.updateExternalWatchUI();



    this.queryExternalFeed();







    if (this.externalWatchTimer) clearInterval(this.externalWatchTimer);



    this.externalWatchTimer = setInterval(() => {



      const now = Date.now();



      const remainingSec = Math.max(0, Math.ceil((this.externalWatchExpiresAt - now) / 1000));



      if (remainingSec <= 0) {



        this.stopExternalWatch('auto-stop');



        return;



      }







      if (this.externalWatchActive && (now - this.lastExternalQueryTime >= 30000)) {



        this.queryExternalFeed();



      }







      this.updateExternalWatchUI();



    }, 1000);



  },







  stopExternalWatch(reason = 'manual') {



    this.externalWatchActive = false;



    if (this.externalWatchTimer) {



      clearInterval(this.externalWatchTimer);



      this.externalWatchTimer = null;



    }



    this.updateExternalWatchUI(reason);



  },







  updateExternalWatchUI(reason) {



    if (typeof document === 'undefined') return;



    const btn = document.getElementById('adsb-external-watch-btn') || document.getElementById('adsb-ext-watch-btn');



    const btnText = document.getElementById('adsb-external-watch-btn-text') || btn;



    const badge = document.getElementById('adsb-external-badge') || document.getElementById('adsb-ext-badge');



    const statusEl = document.getElementById('adsb-external-watch-status') || document.getElementById('adsb-ext-countdown');







    const now = Date.now();



    const remainingSec = Math.max(0, Math.ceil((this.externalWatchExpiresAt - now) / 1000));



    const elapsedSinceLast = Math.round((now - this.lastExternalQueryTime) / 1000);



    const nextPollSec = Math.max(0, 30 - elapsedSinceLast);







    const tabDot = document.getElementById('adsb-tab-status-dot');

    if (tabDot) {

      if (this.externalWatchActive) {

        tabDot.className = 'adsb-tab-dot is-connected';

        tabDot.title = 'Online Cloud Feed (adsb.lol) Active';

      } else if (!this.streamConnected && (!this.lastStatus || !this.lastStatus.connected) && (typeof AndroidNativeBridge === 'undefined' || !AndroidNativeBridge.isAdsbConnected)) {

        tabDot.className = 'adsb-tab-dot is-offline';

        tabDot.title = 'Offline';

      }

    }



    if (this.externalWatchActive && remainingSec <= 0) {



      this.stopExternalWatch('auto-stop');



      return;



    }







    if (this.externalWatchActive) {



      const min = Math.floor(remainingSec / 60);



      const sec = remainingSec % 60;



      const timeStr = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;



      if (btnText) btnText.textContent = `Stop Watching (${timeStr})`;



      if (btn && btnText !== btn) btn.textContent = 'Stop Watching';



      if (btn) {



        btn.style.background = 'rgba(239, 68, 68, 0.2)';



        btn.style.borderColor = '#ef4444';



        btn.style.color = '#fca5a5';



      }



      if (badge) {



        badge.textContent = 'ACTIVE';



        badge.style.background = 'rgba(16, 185, 129, 0.2)';



        badge.style.color = '#34d399';



      }



      if (statusEl) {



        statusEl.innerHTML = `<span style="color: #34d399;">🟢 Watching (${timeStr} remaining)</span> • Next query in <strong>${nextPollSec}s</strong>`;



      }



    } else {



      if (btnText) btnText.textContent = 'Start Watching (10m)';



      if (btn && btnText !== btn) btn.textContent = 'Start Watching (10m)';



      if (btn) {



        btn.style.background = 'rgba(56, 189, 248, 0.2)';



        btn.style.borderColor = '#38bdf8';



        btn.style.color = '#38bdf8';



      }



      if (badge) {



        badge.textContent = 'IDLE';



        badge.style.background = 'rgba(148, 163, 184, 0.15)';



        badge.style.color = '#94a3b8';



      }



      if (statusEl) {



        if (reason === 'auto-stop') {



          statusEl.textContent = 'Idle (Auto-stopped after 10m)';



          statusEl.innerHTML = '<span style="color: #fbbf24;">⏱️ Session auto-stopped after 10m. Rate limit: 30s</span>';



        } else {



          statusEl.textContent = 'Rate limit: 30s interval • Auto-stops after 10m';



        }



      }



    }



  },







  async queryExternalFeed() {



    const now = Date.now();



    if (now - this.lastExternalQueryTime < 28000) return;



    this.lastExternalQueryTime = now;







    const origin = this.getAlertOrigin();



    const homeLat = origin.lat;



    const homeLon = origin.lon;







    const apiBase = (typeof getCompanionApiBase === 'function') ? getCompanionApiBase() : 'http://127.0.0.1:8765';



    const customParam = this.externalCustomUrl ? `&url=${encodeURIComponent(this.externalCustomUrl)}` : '';



    const url = `${apiBase}/api/airspace/external?provider=${encodeURIComponent(this.externalProvider)}&lat=${homeLat.toFixed(5)}&lon=${homeLon.toFixed(5)}&radius=${this.externalRadiusNM}${customParam}`;







    try {



      const res = await fetch(url);



      if (!res.ok) throw new Error(`HTTP ${res.status}`);



      const data = await res.json();



      if (data && data.success && Array.isArray(data.aircraft)) {



        this.processExternalAircraftData(data.aircraft, data.provider || this.externalProvider);



      } else if (data && data.error) {



        const statusEl = document.getElementById('adsb-external-watch-status') || document.getElementById('adsb-ext-countdown');



        if (statusEl && this.externalWatchActive) {



          statusEl.innerHTML = `<span style="color: #f59e0b;">⚠️ ${data.error.slice(0, 60)}</span>`;



        }



      }



    } catch (err) {



      // If Companion bridge is offline, attempt direct fetch as fallback



      this.fetchExternalDirectFallback(homeLat, homeLon);



    }



  },







  async fetchExternalDirectFallback(homeLat, homeLon) {



    let directUrl = '';



    if (this.externalProvider === 'adsb.lol') {



      directUrl = `https://api.adsb.lol/v2/point/${homeLat.toFixed(4)}/${homeLon.toFixed(4)}/${this.externalRadiusNM}`;



    } else if (this.externalCustomUrl && /^https?:\/\//i.test(this.externalCustomUrl)) {



      directUrl = this.externalCustomUrl.replace('{lat}', homeLat.toFixed(4)).replace('{lon}', homeLon.toFixed(4)).replace('{radius}', this.externalRadiusNM);



    }







    if (!directUrl) return;







    try {

      let data;

      if (typeof Platform !== 'undefined' && typeof Platform.fetchHttpJson === 'function') {

        data = await Platform.fetchHttpJson(directUrl);

      } else {

        const res = await fetch(directUrl);

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        data = await res.json();

      }



      const list = Array.isArray(data.ac) ? data.ac : (Array.isArray(data.aircraft) ? data.aircraft : []);



      this.processExternalRawAircraftList(list, this.externalProvider, homeLat, homeLon);



    } catch (e) {



      const statusEl = document.getElementById('adsb-external-watch-status') || document.getElementById('adsb-ext-countdown');



      if (statusEl && this.externalWatchActive) {



        statusEl.innerHTML = '<span style="color: #f59e0b;">⚠️ Companion bridge offline. (Direct API blocked by CORS/Cloudflare)</span>';



      }



    }



  },







  processExternalAircraftData(externalList, provider) {



    if (!Array.isArray(externalList)) return;



    const now = Date.now();



    const effectiveProvider = provider || this.externalProvider || 'adsb.lol';



    const existingMap = new Map();



    for (const a of this.aircraft) {



      existingMap.set(a.hex, a);



    }







    for (const extAc of externalList) {



      if (!extAc.hex) continue;



      const hex = extAc.hex.toUpperCase();



      const existing = existingMap.get(hex);



      const isLocal = existing && (existing.source === 'local' || existing.source === 'sbs-tcp' || existing.source === 'dump1090-tcp' || existing.source === 'avr-tcp' || existing.dataSource === 'local' || existing.dataSource === 'sbs-tcp' || existing.dataSource === 'sbs-1' || existing.dataSource === 'avr-tcp' || existing.dataSource === 'mode-s-avr' || existing.dataSource === 'dump1090-tcp' || existing.dataSource === 'dump1090-json');



      const lastSeenTime = existing ? (existing.lastSeenMs || existing.lastSeen || 0) : 0;



      const isLocalRecent = isLocal && (now - lastSeenTime < 45000);







      if (isLocalRecent) {



        // Keep local high-frequency coordinates; enrich metadata from external feed



        if (extAc.aircraftType) existing.aircraftType = extAc.aircraftType;



        if (extAc.registration) existing.registration = extAc.registration;



        if (extAc.category && !existing.category) existing.category = extAc.category;



        if (extAc.callsign && (!existing.callsign || existing.callsign.startsWith('HEX:'))) {



          existing.callsign = extAc.callsign;



        }



      } else {



        extAc.source = extAc.source || effectiveProvider;



        existingMap.set(hex, extAc);



      }



    }







    this.aircraft = Array.from(existingMap.values());



    this.breachedAircraft = this.aircraft.filter(a => a.isBreached);







    this.updateVisualBanner();



    this.updateTopbarAndHud();



    this.updateMapMarkers();



    if (this.isDrawerOpen) {



      this.updateDrawerAircraftList();



    }



  },







  processExternalRawAircraftList(rawList, provider, homeLat, homeLon) {



    const list = Array.isArray(rawList) ? rawList : (rawList && Array.isArray(rawList.ac) ? rawList.ac : (rawList && Array.isArray(rawList.aircraft) ? rawList.aircraft : []));



    if (!Array.isArray(list)) return [];



    const effectiveProvider = provider || this.externalProvider || 'adsb.lol';



    const converted = [];



    const radiusMeters = (this.radiusMiles || 15) * 1609.344;



    const maxCeilingFeet = this.ceilingFeet || 5000;







    for (const ac of list) {



      if (!ac.hex) continue;



      const hex = ac.hex.toUpperCase();



      const lat = typeof ac.lat === 'number' ? ac.lat : null;



      const lon = typeof ac.lon === 'number' ? ac.lon : null;



      const isGround = ac.alt_baro === 'ground';



      const alt = isGround ? 0 : (typeof ac.alt_baro === 'number' ? ac.alt_baro : (typeof ac.alt_geom === 'number' ? ac.alt_geom : null));



      const speed = typeof ac.gs === 'number' ? Math.round(ac.gs) : (typeof ac.speed === 'number' ? Math.round(ac.speed) : null);



      const track = typeof ac.track === 'number' ? Math.round(ac.track) : 0;



      const callsign = (ac.flight || ac.r || `HEX:${hex}`).trim();







      let distanceMeters = null;



      let distanceMiles = null;



      let isBreached = false;



      let bearingDeg = null;



      let bearingCardinal = '';







      if (lat !== null && lon !== null && homeLat && homeLon) {



        const toRad = Math.PI / 180;



        const dLat = (lat - homeLat) * toRad;



        const dLon = (lon - homeLon) * toRad;



        const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(homeLat * toRad) * Math.cos(lat * toRad) * Math.sin(dLon/2) * Math.sin(dLon/2);



        distanceMeters = Math.round(6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));



        distanceMiles = parseFloat((distanceMeters / 1609.344).toFixed(2));







        const y = Math.sin(dLon) * Math.cos(lat * toRad);



        const x = Math.cos(homeLat * toRad) * Math.sin(lat * toRad) - Math.sin(homeLat * toRad) * Math.cos(lat * toRad) * Math.cos(dLon);



        bearingDeg = Math.round((Math.atan2(y, x) * 180 / Math.PI + 360) % 360);



        const CARDINALS = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];



        bearingCardinal = CARDINALS[Math.round(bearingDeg / 22.5) % 16];







        if (distanceMeters <= radiusMeters && (alt === null || alt <= maxCeilingFeet)) {



          isBreached = true;



        }



      }







      converted.push({



        hex,



        callsign,



        aircraftType: ac.t ? String(ac.t).trim() : null,



        registration: ac.r ? String(ac.r).trim() : null,



        latitude: lat,



        longitude: lon,



        altitude: alt,



        isGround,



        speed,



        track,



        distanceMeters,



        distanceMiles,



        bearingDeg,



        bearingCardinal,



        isBreached,



        source: effectiveProvider,



        dataSource: effectiveProvider,



        lastSeen: Date.now()



      });



    }







    this.processExternalAircraftData(converted, effectiveProvider);



    return converted;



  },







  bindEvents() {
    if (typeof document === 'undefined') return;

    // Global user-gesture audio & speech unlock for desktop / Windows / mobile web
    const unlockAudioAndSpeech = () => {
      this.initAudioContext();
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        if (window.speechSynthesis.paused) {
          try { window.speechSynthesis.resume(); } catch (e) {}
        }
        // Prime speech synthesis on first user gesture with a zero-volume silent utterance
        if (!this._speechSynthesizerPrimed) {
          try {
            const UtteranceCtor = window.SpeechSynthesisUtterance || (typeof SpeechSynthesisUtterance !== 'undefined' ? SpeechSynthesisUtterance : null);
            if (UtteranceCtor) {
              const silent = new UtteranceCtor('');
              silent.volume = 0;
              window.speechSynthesis.speak(silent);
              this._speechSynthesizerPrimed = true;
            }
          } catch (e) {}
        }
      }
    };
    if (typeof window !== 'undefined') {
      ['pointerdown', 'keydown', 'click'].forEach(evt => {
        window.addEventListener(evt, unlockAudioAndSpeech, { passive: true });
      });
    }

    // Topbar & More menu buttons



    const topbarBtn = document.getElementById('adsb-topbar-btn');



    if (topbarBtn) topbarBtn.addEventListener('click', () => this.toggleDrawer());







    const moreMenuBtn = document.getElementById('more-menu-adsb-btn');



    if (moreMenuBtn) moreMenuBtn.addEventListener('click', () => {



      const moreMenu = document.getElementById('header-more-menu');



      if (moreMenu) moreMenu.classList.add('hidden');



      this.toggleDrawer(true);



    });







    const mapPill = document.getElementById('adsb-map-pill');



    if (mapPill) mapPill.addEventListener('click', () => this.toggleDrawer(true));







    // Drawer close button



    const closeBtn = document.getElementById('adsb-drawer-close-btn');



    if (closeBtn) closeBtn.addEventListener('click', () => this.toggleDrawer(false));







    // ADS-B Drawer Segmented Tab Navigation



    const tabBtnOps = document.getElementById('adsb-tab-btn-ops');



    if (tabBtnOps) {



      tabBtnOps.addEventListener('click', () => this.switchTab('operations'));



    }







    const tabBtnSettings = document.getElementById('adsb-tab-btn-settings');



    if (tabBtnSettings) {



      tabBtnSettings.addEventListener('click', () => this.switchTab('settings'));



    }







    // Drawer controls



    const enableToggle = document.getElementById('adsb-enable-toggle');



    if (enableToggle) {



      enableToggle.addEventListener('change', (e) => this.toggleTracking(e.target.checked));



    }







    const soundToggle = document.getElementById('adsb-sound-toggle');



    if (soundToggle) {



      soundToggle.addEventListener('change', (e) => this.toggleSound(e.target.checked));



    }







    const trailsToggle = document.getElementById('adsb-trails-toggle');



    if (trailsToggle) {



      trailsToggle.addEventListener('change', (e) => this.toggleTrails(e.target.checked));



    }







    const trailDurationSelect = document.getElementById('adsb-trail-duration-select');



    if (trailDurationSelect) {



      trailDurationSelect.addEventListener('change', (e) => {



        this.setTrailDuration(e.target.value);



      });



    }







    const clearTrailsBtn = document.getElementById('adsb-clear-trails-btn');



    if (clearTrailsBtn) {



      clearTrailsBtn.addEventListener('click', () => {



        this.clearTrails();



        const origText = clearTrailsBtn.textContent;



        clearTrailsBtn.textContent = 'Cleared!';



        clearTrailsBtn.style.color = '#38bdf8';



        setTimeout(() => {



          clearTrailsBtn.textContent = origText;



          clearTrailsBtn.style.color = '';



        }, 1200);



      });



    }







    const clearRadarBtn = document.getElementById('adsb-clear-radar-btn');



    if (clearRadarBtn) {



      clearRadarBtn.addEventListener('click', async () => {

        const origText = clearRadarBtn.textContent;

        clearRadarBtn.textContent = 'Cleared!';

        clearRadarBtn.style.color = '#38bdf8';

        setTimeout(() => {

          clearRadarBtn.textContent = origText;

          clearRadarBtn.style.color = '';

        }, 1200);

        await this.clearAll(true);



      });



    }







    const soundSelect = document.getElementById('adsb-sound-type-select');



    if (soundSelect) {



      soundSelect.addEventListener('change', (e) => {

        this.soundType = e.target.value;

        this.saveSettings();

      });

    }

    // TTS Speech Customization Controls
    const ttsPresetSelect = document.getElementById('adsb-tts-preset-select');
    const ttsBreachInput = document.getElementById('adsb-tts-breach-input');
    const ttsApproachingInput = document.getElementById('adsb-tts-approaching-input');
    const ttsPreviewBtn = document.getElementById('adsb-tts-preview-btn');
    const ttsResetBtn = document.getElementById('adsb-tts-reset-btn');
    let lastFocusedTtsInput = ttsBreachInput;

    if (ttsBreachInput) {
      ttsBreachInput.addEventListener('focus', () => { lastFocusedTtsInput = ttsBreachInput; });
      ttsBreachInput.addEventListener('input', (e) => {
        this.ttsBreachTemplate = e.target.value;
        this.ttsPreset = 'custom';
        if (ttsPresetSelect) ttsPresetSelect.value = 'custom';
        this.saveSettings();
      });
    }

    if (ttsApproachingInput) {
      ttsApproachingInput.addEventListener('focus', () => { lastFocusedTtsInput = ttsApproachingInput; });
      ttsApproachingInput.addEventListener('input', (e) => {
        this.ttsApproachingTemplate = e.target.value;
        this.ttsPreset = 'custom';
        if (ttsPresetSelect) ttsPresetSelect.value = 'custom';
        this.saveSettings();
      });
    }

    if (ttsPresetSelect) {
      ttsPresetSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        this.ttsPreset = val;
        if (val !== 'custom' && this.TTS_PRESETS && this.TTS_PRESETS[val]) {
          this.ttsBreachTemplate = this.TTS_PRESETS[val].breach;
          this.ttsApproachingTemplate = this.TTS_PRESETS[val].approaching;
          if (ttsBreachInput) ttsBreachInput.value = this.ttsBreachTemplate;
          if (ttsApproachingInput) ttsApproachingInput.value = this.ttsApproachingTemplate;
        }
        this.saveSettings();
      });
    }

    // Interactive token badge chips: insert token into active template input
    if (typeof document !== 'undefined') {
      const tokenChips = document.querySelectorAll('.adsb-tts-token');
      tokenChips.forEach(chip => {
        chip.addEventListener('click', () => {
          const token = chip.getAttribute('data-token');
          if (!token) return;
          const targetInput = lastFocusedTtsInput || ttsBreachInput;
          if (!targetInput) return;

          const start = targetInput.selectionStart ?? targetInput.value.length;
          const end = targetInput.selectionEnd ?? targetInput.value.length;
          const oldVal = targetInput.value;
          targetInput.value = oldVal.slice(0, start) + token + oldVal.slice(end);
          targetInput.selectionStart = targetInput.selectionEnd = start + token.length;
          targetInput.focus();

          if (targetInput === ttsApproachingInput) {
            this.ttsApproachingTemplate = targetInput.value;
          } else {
            this.ttsBreachTemplate = targetInput.value;
          }
          this.ttsPreset = 'custom';
          if (ttsPresetSelect) ttsPresetSelect.value = 'custom';
          this.saveSettings();
        });
      });
    }

    if (ttsPreviewBtn) {
      ttsPreviewBtn.addEventListener('click', async () => {
        await this.initAudioContext();
        await this.playWarningChime();
        setTimeout(() => {
          this.playVoiceAdvisory({
            callsign: 'UAL452',
            distanceMiles: 1.5,
            distanceMeters: 2414,
            altitude: 1850,
            bearingCardinal: 'ESE',
            etaSeconds: 45
          }, 'breached');
        }, 580);
      });
    }

    if (ttsResetBtn) {
      ttsResetBtn.addEventListener('click', () => {
        this.ttsPreset = 'standard';
        this.ttsBreachTemplate = this.TTS_PRESETS.standard.breach;
        this.ttsApproachingTemplate = this.TTS_PRESETS.standard.approaching;
        if (ttsPresetSelect) ttsPresetSelect.value = 'standard';
        if (ttsBreachInput) ttsBreachInput.value = this.ttsBreachTemplate;
        if (ttsApproachingInput) ttsApproachingInput.value = this.ttsApproachingTemplate;
        this.saveSettings();
        if (typeof showToast === 'function') {
          showToast('🗣️ Voice alert templates reset to default', 'info');
        }
      });
    }







    // External ADS-B Online Feed Controls



    const extProviderSelect = document.getElementById('adsb-external-provider-select');



    const extCustomContainer = document.getElementById('adsb-external-custom-url-container');



    const extCustomUrlInput = document.getElementById('adsb-external-custom-url');



    if (extProviderSelect) {



      extProviderSelect.addEventListener('change', (e) => {



        this.externalProvider = e.target.value;



        if (extCustomContainer) {



          extCustomContainer.style.display = (this.externalProvider === 'custom') ? 'block' : 'none';



        }



        this.saveSettings();



        if (this.externalWatchActive) {



          this.queryExternalFeed();



        }



      });



    }







    if (extCustomUrlInput) {



      extCustomUrlInput.addEventListener('change', (e) => {



        this.externalCustomUrl = e.target.value.trim();



        this.saveSettings();



        if (this.externalWatchActive) {



          this.queryExternalFeed();



        }



      });



    }







    const extRadiusSelect = document.getElementById('adsb-external-radius-select');



    if (extRadiusSelect) {



      extRadiusSelect.addEventListener('change', (e) => {



        this.externalRadiusNM = parseInt(e.target.value, 10) || 15;



        this.saveSettings();



        if (this.externalWatchActive) {



          this.queryExternalFeed();



        }



      });



    }







    const extWatchBtn = document.getElementById('adsb-external-watch-btn');



    if (extWatchBtn) {



      extWatchBtn.addEventListener('click', () => {



        this.initAudioContext();



        this.startExternalWatch();



      });



    }







    const testAudioBtn = document.getElementById('adsb-test-audio-btn');

    if (testAudioBtn) {
      testAudioBtn.addEventListener('click', async () => {
        await this.initAudioContext();
        await this.playWarningChime();
        setTimeout(() => {
          this.playVoiceAdvisory({
            callsign: 'UAL452',
            distanceMiles: 1.5,
            distanceMeters: 2414,
            altitude: 1850,
            bearingCardinal: 'NE'
          }, 'breached');
        }, 580);
      });
    }







    const simTriggerBtn = document.getElementById('adsb-sim-trigger-btn');



    if (simTriggerBtn) {



      simTriggerBtn.addEventListener('click', () => this.simulateAircraft('prop'));



    }







    const simPropBtn = document.getElementById('adsb-sim-prop-btn');



    if (simPropBtn) {



      simPropBtn.addEventListener('click', () => this.simulateAircraft('prop'));



    }







    const simHeliBtn = document.getElementById('adsb-sim-heli-btn');



    if (simHeliBtn) {



      simHeliBtn.addEventListener('click', () => this.simulateAircraft('helicopter'));



    }







    const simJetBtn = document.getElementById('adsb-sim-jet-btn');



    if (simJetBtn) {



      simJetBtn.addEventListener('click', () => this.simulateAircraft('jet'));



    }







    const simApproachingBtn = document.getElementById('adsb-sim-approaching-btn');



    if (simApproachingBtn) {



      simApproachingBtn.addEventListener('click', () => this.simulateAircraft('approaching'));



    }



    const simLandingBtn = document.getElementById('adsb-sim-landing-btn');



    if (simLandingBtn) {



      simLandingBtn.addEventListener('click', () => this.simulateAircraft('landing'));



    }



    const simDescendingBtn = document.getElementById('adsb-sim-descending-btn');



    if (simDescendingBtn) {



      simDescendingBtn.addEventListener('click', () => this.simulateAircraft('descending'));



    }



    const simHighAltBtn = document.getElementById('adsb-sim-high-alt-btn');



    if (simHighAltBtn) {



      simHighAltBtn.addEventListener('click', () => this.simulateAircraft('high_alt'));



    }



    const suppressHighAltToggle = document.getElementById('adsb-suppress-high-altitude-toggle');



    if (suppressHighAltToggle) {



      suppressHighAltToggle.addEventListener('change', (e) => {



        this.suppressHighAltitudeCones = !!e.target.checked;



        this.saveSettings();



        this.updateControlsUI();



        this.updateMapMarkers();



        this.pollAirspace();



      });



    }



    const descentGradToggle = document.getElementById('adsb-descent-gradient-toggle');



    if (descentGradToggle) {



      descentGradToggle.addEventListener('change', (e) => {



        this.descentGradientEnabled = !!e.target.checked;



        this.saveSettings();



        this.updateMapMarkers();



      });



    }



    const anchorSelect = document.getElementById('adsb-anchor-mode-select');



    if (anchorSelect) {



      anchorSelect.addEventListener('change', (e) => {



        this.alertAnchorMode = e.target.value || 'auto';



        this.saveSettings();



        this.onOriginMoved();



      });



    }



    const ringToggle = document.getElementById('adsb-show-proximity-ring-toggle');



    if (ringToggle) {



      ringToggle.addEventListener('change', (e) => {



        this.showProximityRing = !!e.target.checked;



        this.saveSettings();



        this.updateProximityRing();



      });



    }







    const conesToggle = document.getElementById('adsb-cones-toggle');



    if (conesToggle) {



      conesToggle.addEventListener('change', (e) => {



        this.showCones = !!e.target.checked;



        this.saveSettings();



        const m = (typeof map !== 'undefined' && map) || (typeof window !== 'undefined' && window.map) || null;



        if (this.coneLayerGroup && m) {



          if (this.showCones) {



            if (!m.hasLayer(this.coneLayerGroup)) this.coneLayerGroup.addTo(m);



          } else {



            if (m.hasLayer(this.coneLayerGroup)) m.removeLayer(this.coneLayerGroup);



          }



        }



        if (this.showCones) {



          this.updateMapMarkers();



        } else {



          if (this.coneLayerGroup && this.coneLayerGroup.clearLayers) this.coneLayerGroup.clearLayers();



          this.mapCones.clear();



        }



      });



    }







    const warningMinSlider = document.getElementById('adsb-warning-min-slider');



    if (warningMinSlider) {



      warningMinSlider.addEventListener('input', (e) => {



        this.warningMinutes = parseFloat(e.target.value) || 2.0;



        this.saveSettings();



        this.updateControlsUI();



        if (this.showCones) this.updateMapMarkers();



        this.pollAirspace();



      });



    }







    const coneDevSlider = document.getElementById('adsb-cone-dev-slider');



    if (coneDevSlider) {



      coneDevSlider.addEventListener('input', (e) => {



        this.coneDeviationDeg = parseInt(e.target.value, 10) || 15;



        this.saveSettings();



        this.updateControlsUI();



        if (this.showCones) this.updateMapMarkers();



        this.pollAirspace();



      });



    }



    const landingToggle = document.getElementById('adsb-airport-landing-toggle');



    if (landingToggle) {



      landingToggle.addEventListener('change', (e) => {



        this.suppressAirportLanding = !!e.target.checked;



        this.saveSettings();



        this.updateControlsUI();



        if (this.showCones) this.updateMapMarkers();



        this.pollAirspace();



      });



    }



    const airportRadiusSlider = document.getElementById('adsb-airport-radius-slider');



    if (airportRadiusSlider) {



      airportRadiusSlider.addEventListener('input', (e) => {



        this.airportRadiusNm = parseFloat(e.target.value) || 4.0;



        this.saveSettings();



        this.updateControlsUI();



        if (this.showCones) this.updateMapMarkers();



        this.pollAirspace();



      });



    }







    const radiusSlider = document.getElementById('adsb-radius-slider');



    if (radiusSlider) {



      radiusSlider.addEventListener('input', (e) => {



        this.radiusMiles = parseFloat(e.target.value) || 3.0;



        this.saveSettings();



        this.updateControlsUI();



        this.pollAirspace();



      });



    }







    const ceilingSlider = document.getElementById('adsb-ceiling-slider');



    if (ceilingSlider) {



      ceilingSlider.addEventListener('input', (e) => {



        this.ceilingFeet = parseInt(e.target.value, 10) || 2500;



        this.saveSettings();



        this.updateControlsUI();



        this.pollAirspace();



      });



    }



    const highAltSlider = document.getElementById('adsb-high-alt-slider');



    if (highAltSlider) {



      highAltSlider.addEventListener('input', (e) => {



        this.highAltitudeThresholdFt = parseInt(e.target.value, 10) || 10000;



        this.saveSettings();



        this.updateControlsUI();



        if (this.showCones) this.updateMapMarkers();



        this.pollAirspace();



      });



    }







    const serverSaveBtn = document.getElementById('adsb-server-save-btn');



    const hostInput = document.getElementById('adsb-host-input');



    const portInput = document.getElementById('adsb-port-input');



    if (serverSaveBtn && (hostInput || portInput)) {



      serverSaveBtn.addEventListener('click', async () => {



        const hostVal = hostInput ? hostInput.value.trim() : '127.0.0.1';



        const portVal = portInput ? portInput.value.trim() : '30003';



        const parsedPortVal = parseInt(portVal, 10) || 30003;



        this.serverHost = hostVal;



        this.serverPort = parsedPortVal;



        this.saveSettings();



        this.isConnectingAdsbServer = true;



        serverSaveBtn.textContent = 'Connecting...';



        serverSaveBtn.disabled = true;







        try {

          if (typeof Platform !== 'undefined' && typeof Platform.setNativeAdsbServer === 'function' && Platform.setNativeAdsbServer(hostVal, parsedPortVal)) {

            this.serverHost = hostVal;

            this.serverPort = parsedPortVal;

            this.saveSettings();

            serverSaveBtn.textContent = 'Saved!';

            return;

          }



          const apiBase = (typeof getCompanionApiBase === 'function') ? getCompanionApiBase() : 'http://127.0.0.1:8765';



          let res = await fetch(`${apiBase}/api/config/adsb`, {



            method: 'POST',



            headers: { 'Content-Type': 'application/json' },



            body: JSON.stringify({ adsbHost: hostVal, adsbPort: parsedPortVal, force: true })



          });







          if (res.status === 409) {



            const bodyData = await res.json().catch(() => ({}));



            const activeHost = bodyData.tcpHost || bodyData.adsbHost || 'active server';



            const activePort = bodyData.tcpPort || bodyData.adsbPort || '';



            const confirmOverride = confirm(



              `ADS-B bridge target is locked or currently connected to ${activeHost}${activePort ? ':' + activePort : ''}.\n\nForce change target to ${hostVal}:${parsedPortVal}?`



            );



            if (confirmOverride) {



              res = await fetch(`${apiBase}/api/config/adsb`, {



                method: 'POST',



                headers: { 'Content-Type': 'application/json' },



                body: JSON.stringify({ adsbHost: hostVal, adsbPort: parsedPortVal, force: true })



              });



            } else {



              serverSaveBtn.textContent = 'Connect';



              serverSaveBtn.disabled = false;



              this.isConnectingAdsbServer = false;



              return;



            }



          }







          if (res.ok) {



            this.serverHost = hostVal;



            this.serverPort = parsedPortVal;



            this.saveSettings();



            serverSaveBtn.textContent = 'Saved!';



          } else {



            serverSaveBtn.textContent = 'Error';



          }



        } catch (e) {



          this.serverHost = hostVal;



          this.serverPort = parsedPortVal;



          this.saveSettings();



          serverSaveBtn.textContent = 'Saved Local';



        } finally {



          setTimeout(() => {



            serverSaveBtn.textContent = 'Connect';



            serverSaveBtn.disabled = false;



            this.isConnectingAdsbServer = false;



          }, 1500);



        }







        this.pollAirspace();



      });



    }







    // Port preset chips (30003, 30002, 8080)



    const portChips = document.querySelectorAll('.adsb-port-chip');



    portChips.forEach(chip => {



      chip.addEventListener('click', () => {



        const portVal = chip.getAttribute('data-port');



        if (portVal && portInput) {



          portInput.value = portVal;



          this.serverPort = parseInt(portVal, 10) || 30003;



          this.saveSettings();



          if (serverSaveBtn) {



            serverSaveBtn.style.outline = '2px solid #38bdf8';



            setTimeout(() => { if (serverSaveBtn) serverSaveBtn.style.outline = ''; }, 600);



          }



        }



      });



    });







    // Remote ADS-B Host Port Probe Button



    const probeBtn = document.getElementById('adsb-probe-host-btn');



    const probeFeedback = document.getElementById('adsb-probe-feedback');



    if (probeBtn && probeFeedback) {



      probeBtn.addEventListener('click', async () => {



        const targetHost = hostInput ? hostInput.value.trim() : '127.0.0.1';



        probeFeedback.style.display = 'block';



        probeFeedback.innerHTML = `<span style="color: #38bdf8;">🔍 Probing ${targetHost} ports (30003, 30002, 30005, 8080)...</span>`;



        probeBtn.disabled = true;



        probeBtn.textContent = 'Probing...';







        try {

          const apiBase = (typeof getCompanionApiBase === 'function') ? getCompanionApiBase() : 'http://127.0.0.1:8765';
          let data;

          if (typeof Platform !== 'undefined' && typeof Platform.probeAdsbHost === 'function') {

            data = await Platform.probeAdsbHost(targetHost, apiBase);

          } else {

            const res = await fetch(`${apiBase}/api/config/adsb/probe?host=${encodeURIComponent(targetHost)}`);

            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            data = await res.json();

          }



          if (data && data.success && data.ports) {



            let listHtml = '';



            for (const [p, pInfo] of Object.entries(data.ports)) {



              const isOpen = pInfo.open;



              const statusColor = isOpen ? '#34d399' : '#94a3b8';



              const icon = isOpen ? '✅' : '❌';



              const useBtn = isOpen ? `<button type="button" class="btn-xs adsb-use-port-btn" data-port="${p}" style="font-size: 0.6rem; padding: 1px 5px; cursor: pointer; background: rgba(56, 189, 248, 0.2); border: 1px solid rgba(56, 189, 248, 0.4); border-radius: 3px; color: #38bdf8;">Use</button>` : '<span style="color: #64748b; font-size: 0.6rem;">Closed</span>';



              listHtml += `



                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">



                  <span style="color: ${statusColor};">${icon} <strong>${p}</strong> (${pInfo.name})</span>



                  ${useBtn}



                </div>



              `;



            }



            const recHtml = data.recommendedPort 



              ? `<div style="margin-top: 4px; padding-top: 3px; border-top: 1px solid rgba(255,255,255,0.08); color: #38bdf8;">💡 Recommended Port: <strong>${data.recommendedPort}</strong></div>`



              : '<div style="margin-top: 4px; color: #f59e0b;">⚠️ No open ADS-B ports detected on host.</div>';



            probeFeedback.innerHTML = `



              <div style="font-weight: 600; color: #e2e8f0; margin-bottom: 3px;">Probe Results (${data.host}):</div>



              ${listHtml}



              ${recHtml}



            `;



            // Bind Use buttons



            probeFeedback.querySelectorAll('.adsb-use-port-btn').forEach(b => {



              b.addEventListener('click', () => {



                const chosenPort = b.getAttribute('data-port');



                if (chosenPort && portInput) {



                  portInput.value = chosenPort;



                  this.serverPort = parseInt(chosenPort, 10) || 30003;



                  this.saveSettings();



                  if (serverSaveBtn) {



                    serverSaveBtn.style.outline = '2px solid #38bdf8';



                    setTimeout(() => { if (serverSaveBtn) serverSaveBtn.style.outline = ''; }, 600);



                  }



                }



              });



            });



          } else {



            probeFeedback.innerHTML = `<span style="color: #ef4444;">Probe returned invalid response.</span>`;



          }



        } catch (err) {



          probeFeedback.innerHTML = `<span style="color: #ef4444;">Probe failed: ${err.message || 'Companion offline'}</span>`;



        } finally {



          probeBtn.disabled = false;



          probeBtn.textContent = '🔍 Probe Host';



        }



      });



    }



    const discoverBtn = document.getElementById('adsb-discover-btn');

    if (discoverBtn && probeFeedback) {

      discoverBtn.addEventListener('click', async () => {

        probeFeedback.style.display = 'block';

        probeFeedback.innerHTML = '<span style="color: #4ade80;">✨ Scanning local network via Bonjour for dump1090 / SBS servers...</span>';

        discoverBtn.disabled = true;

        discoverBtn.textContent = 'Scanning...';

        try {

          const apiBase = (typeof getCompanionApiBase === 'function') ? getCompanionApiBase() : 'http://127.0.0.1:8765';
          let data;

          if (typeof Platform !== 'undefined' && typeof Platform.discoverMdnsServers === 'function') {

            data = await Platform.discoverMdnsServers(2000, apiBase);

          } else {

            const res = await fetch(`${apiBase}/api/airspace/discover?timeout=2000`);

            data = await res.json();

          }

          if (data && data.servers && data.servers.length > 0) {

            let html = '<div style="font-weight: 600; color: #4ade80; margin-bottom: 4px;">✨ Found ' + data.servers.length + ' SBS Server(s) via Bonjour:</div>';

            data.servers.forEach((s) => {

              const sHost = s.host || s.address || 'aalaapi-sky.local';

              const sPort = s.port || 30003;

              html += '<div style="display: flex; justify-content: space-between; align-items: center; margin-top: 3px; padding: 2px 0; border-top: 1px solid rgba(255,255,255,0.08);">' +

                '<span><b>' + (s.name || 'dump1090') + '</b> &mdash; <code>' + sHost + ':' + sPort + '</code></span>' +

                '<button type="button" class="btn-xs adsb-use-server-btn" data-host="' + sHost + '" data-port="' + sPort + '" style="padding: 1px 6px; font-size: 0.6rem; cursor: pointer; background: #22c55e; color: #fff; border: none; border-radius: 3px;">Use</button>' +

              '</div>';

            });

            probeFeedback.innerHTML = html;

            probeFeedback.querySelectorAll('.adsb-use-server-btn').forEach(b => {

              b.addEventListener('click', () => {

                const h = b.getAttribute('data-host');

                const p = b.getAttribute('data-port');

                if (hostInput) hostInput.value = h;

                if (portInput) portInput.value = p;

                if (serverSaveBtn) serverSaveBtn.click();

              });

            });

          } else {

            probeFeedback.innerHTML = '<span style="color: #facc15;">ℹ️ No external SBS servers found on LAN. Local server advertised at <code>aalaapi-sky.local:30003</code>.</span>';

          }

        } catch (err) {

          probeFeedback.innerHTML = '<span style="color: #ef4444;">⚠️ Discovery error: ' + err.message + '</span>';

        } finally {

          discoverBtn.disabled = false;

          discoverBtn.textContent = '✨ Bonjour Scan';

        }

      });

    }







    const endpointSaveBtn = document.getElementById('adsb-endpoint-save-btn');



    const endpointInput = document.getElementById('adsb-endpoint-input');



    if (endpointSaveBtn && endpointInput) {



      endpointSaveBtn.addEventListener('click', () => {



        this.customEndpoint = endpointInput.value.trim();



        this.saveSettings();



        endpointSaveBtn.textContent = 'Saved!';



        setTimeout(() => { endpointSaveBtn.textContent = 'Save'; }, 1500);



        this.pollAirspace();



      });



    }







    // Visual Alert Banner Actions



    const snoozeBtn = document.getElementById('adsb-alert-snooze-btn');



    if (snoozeBtn) snoozeBtn.addEventListener('click', () => this.snooze(1));







    const muteBtn = document.getElementById('adsb-alert-mute-btn');



    if (muteBtn) {



      muteBtn.addEventListener('click', () => {



        this.toggleSound(!this.soundEnabled);



        muteBtn.textContent = this.soundEnabled ? 'Mute' : 'Unmute';



      });



    }







    const alertCloseBtn = document.getElementById('adsb-alert-close-btn');



    if (alertCloseBtn) {



      alertCloseBtn.addEventListener('click', () => {



        this.updateProximityRing();

    const banner = document.getElementById('adsb-alert-banner');



        if (banner) banner.classList.add('hidden');
        const ridHud = document.getElementById('remote-id-airspace-hud');
        if (ridHud) ridHud.classList.remove('has-adsb-alert');



      });



    }



  }



};







if (typeof window !== 'undefined') {



  window.AdsbAirspaceManager = AdsbAirspaceManager;



  window.compareSemver = compareSemver;



  window.applyCompanionStatusUI = applyCompanionStatusUI;



}



if (typeof global !== 'undefined') {



  global.AdsbAirspaceManager = AdsbAirspaceManager;



  global.compareSemver = compareSemver;



  global.applyCompanionStatusUI = applyCompanionStatusUI;



}



if (typeof module !== 'undefined' && module.exports) {



  module.exports = {



    AdsbAirspaceManager,



    getAppVersion,



    restartCompanionBridge,



    compareSemver,



    applyCompanionStatusUI,

    getDeviceDisplayInfo,

    getLastDetectedFlightDevice,

    updateServedLinksModalUI,

    setNativeRc2Connection,
    updateNativeAndroidStatusUI,
    sendDirectlyToRC2,
    pullFlightLogFromRC2
  };

}



if (typeof window !== 'undefined') {

  window.getAppVersion = getAppVersion;

  window.getDeviceDisplayInfo = getDeviceDisplayInfo;

  window.getLastDetectedFlightDevice = getLastDetectedFlightDevice;

  window.updateServedLinksModalUI = updateServedLinksModalUI;

  window.setNativeRc2Connection = setNativeRc2Connection;

  window.updateNativeAndroidStatusUI = updateNativeAndroidStatusUI;

}



if (typeof global !== 'undefined') {

  global.getAppVersion = getAppVersion;

  global.getDeviceDisplayInfo = getDeviceDisplayInfo;

  global.getLastDetectedFlightDevice = getLastDetectedFlightDevice;

  global.updateServedLinksModalUI = updateServedLinksModalUI;

}







// ─── Flight Diagnostics & 3D Telemetry Replay Engine ──────────────────────────







