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
    if (window.location.port === '8765' || window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost') {
      return window.location.port
        ? `${window.location.protocol}//${window.location.hostname}:${window.location.port}`
        : window.location.origin;
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
let isCompanionOnline = false;
let isRc2MtpConnected = false;
let rc2MtpActiveUUID = '';
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
         lower.includes('opengeo.ncep.noaa.gov');
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
  return `${apiBase}/api/proxy/tile?url=${encodeURIComponent(rawUrl)}`;
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
      const match = tag.textContent.match(/[\d\.]+/);
      if (match) return match[0];
    }
  }
  return '1.147.1';
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
          mismatchText.textContent = '⚠️ Restart timed out. Check start-bridge.bat';
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

  const isVersionMismatch = !!(bridgeVer && appVer && bridgeVer !== appVer);

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
      if (restartBtn) {
        restartBtn.disabled = false;
        restartBtn.textContent = 'Auto-Restart Bridge';
      }
    } else if (!isVersionMismatch) {
      mismatchAlert.style.display = 'none';
    }
  }

  if (sLabel) sLabel.textContent = 'port 8765';
  if (typeof fetchBridgeCacheStats === 'function') fetchBridgeCacheStats();
  if (typeof updateMcpMonitorUI === 'function') updateMcpMonitorUI(data?.mcp, true);

  // 2. Update RC 2 USB Link status
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
      uText.textContent = 'RC 2 USB Link: Connected';
      uText.style.color = '#22c55e';
    }
    if (uLabel) uLabel.textContent = data.deviceName || 'MTP Ready';

    // Legacy compatibility
    if (dot) dot.style.background = '#22c55e';
    if (text) {
      text.textContent = 'DJI RC 2 Connected';
      text.style.color = '#22c55e';
    }
    if (label) label.textContent = data.deviceName || 'MTP Ready';

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
        labelSpan.innerHTML = `
          <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
          RC 2 Unplugged &bull; USB Setup Guide`;
      }
    }

    if (uDot) uDot.style.background = '#eab308'; // Amber
    if (uText) {
      uText.textContent = 'RC 2 USB Link: Unplugged';
      uText.style.color = '#eab308';
    }
    if (uLabel) uLabel.textContent = 'Plug in USB-C';

    // Legacy compatibility
    if (dot) dot.style.background = '#eab308';
    if (text) {
      text.textContent = 'RC 2 Disconnected';
      text.style.color = '#eab308';
    }
    if (label) label.textContent = 'Plug in USB-C';

    if (directActions) directActions.style.display = 'none';
    if (directBtn) directBtn.style.display = 'none';
    if (pullBtn) pullBtn.style.display = 'none';
    if (diagPullBtn) diagPullBtn.style.display = 'none';
    if (diagBrowseBtn) diagBrowseBtn.style.display = 'none';
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

  const apiBase = typeof COMPANION_API_BASE !== 'undefined' ? COMPANION_API_BASE : 'http://127.0.0.1:8765';
  const url = `${apiBase}/api/status/stream`;

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
      } catch (e) {}
    };

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

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`${COMPANION_API_BASE}/api/status`, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      const wasOffline = !isCompanionOnline;
      isCompanionOnline = true;
      consecutiveStatusFailures = 0;
      lastStatusCheckTime = Date.now();
      if (typeof data.droneCount === 'number') {
        remoteIdDroneCount = data.droneCount;
      }
      applyCompanionStatusUI(data);

      if (!isCompanionStatusStreaming && typeof connectCompanionStatusStream === 'function') {
        connectCompanionStatusStream();
      }
      if (typeof RemoteIdRadar !== 'undefined' && !RemoteIdRadar.streamConnected && typeof RemoteIdRadar.connectStream === 'function') {
        RemoteIdRadar.connectStream();
      }

      if (wasOffline) {
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
  const primaryBtn = targetBtn || document.getElementById('diag-pull-rc2-btn') || document.getElementById('direct-rc2-pull-log-btn');
  const diagBtn = document.getElementById('diag-pull-rc2-btn');
  const directBtn = document.getElementById('direct-rc2-pull-log-btn');
  const buttonsToUpdate = Array.from(new Set([primaryBtn, diagBtn, directBtn].filter(Boolean)));

  const originalStates = new Map();
  buttonsToUpdate.forEach(b => {
    originalStates.set(b, { html: b.innerHTML, color: b.style.color });
    b.disabled = true;
    b.innerHTML = `<span>⏳ Pulling Log...</span>`;
  });

  const resetButtonStates = (delayMs = 3500) => {
    setTimeout(() => {
      buttonsToUpdate.forEach(b => {
        const orig = originalStates.get(b);
        if (orig) {
          b.disabled = false;
          b.innerHTML = orig.html;
          b.style.color = orig.color || '';
        }
      });
    }, delayMs);
  };

  try {
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
    console.error('Pull Flight Log Error:', err);
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
  if (!directBtn || !isRc2MtpConnected) return;

  const originalContent = directBtn.innerHTML;
  directBtn.disabled = true;
  directBtn.innerHTML = `<span>⏳ Syncing to RC 2...</span>`;

  try {
    const rawWps = (typeof getCurrentWaypoints === 'function' ? getCurrentWaypoints() : null) || [];
    if (!rawWps || rawWps.length === 0) {
      alert("No waypoints generated to sync. Please place a mission or center point first.");
      directBtn.disabled = false;
      directBtn.innerHTML = originalContent;
      return;
    }

    const speed = parseFloat(document.getElementById('speed')?.value) || 4;
    const gimbalPitch = parseGimbalPitch(document.getElementById('gimbal-pitch')?.value, -90);
    const waypoints = rawWps.map(wp => ({
      lat: wp.lat,
      lon: wp.lon,
      alt: wp.alt,
      pitch: wp.pitch !== undefined && wp.pitch !== null ? wp.pitch : gimbalPitch,
      speed: speed,
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

    const res = await fetch(`${COMPANION_API_BASE}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uuid, kmzBase64, diagData })
    });

    const data = await res.json();
    if (data.success) {
      directBtn.innerHTML = `<span>✅ Synced to DJI RC 2! Re-open in DJI Fly</span>`;
      directBtn.style.background = 'rgba(34, 197, 94, 0.2)';
      directBtn.style.borderColor = 'rgba(34, 197, 94, 0.5)';
      directBtn.style.color = '#4ade80';

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

        await fetch(`${COMPANION_API_BASE}/api/diagnostics/archive`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(diagData)
        }).catch(() => {});

        if (typeof FlightDiagnostics !== 'undefined' && FlightDiagnostics.refreshFlightList) {
          FlightDiagnostics.refreshFlightList();
        }
      } catch (e) {}
      setTimeout(() => {
        directBtn.disabled = false;
        directBtn.innerHTML = originalContent;
        directBtn.style.background = '';
        directBtn.style.borderColor = '';
        directBtn.style.color = '';
      }, 4000);
    } else {
      throw new Error(data.error || 'Transfer failed');
    }
  } catch (err) {
    console.error('Direct RC 2 Sync Error:', err);
    if (typeof window !== 'undefined' && window.location && window.location.protocol === 'file:') {
      console.warn('[RC 2 Direct Sync] Browser security policy may restrict network calls from file:/// origins. Open http://127.0.0.1:8765 in your browser to run Aalaapi Sky with direct same-origin companion access.');
    }
    directBtn.innerHTML = `<span>❌ Sync Failed</span>`;
    directBtn.style.color = '#f87171';
    setTimeout(() => {
      directBtn.disabled = false;
      directBtn.innerHTML = originalContent;
      directBtn.style.color = '';
    }, 3000);
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

  // Companion auto-restart button (for version mismatch sync)
  const companionRestartBtn = document.getElementById('companion-restart-btn');
  if (companionRestartBtn) {
    companionRestartBtn.addEventListener('click', restartCompanionBridge);
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
    if (this.streamMode === 'sse') {
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

    const apiBase = typeof COMPANION_API_BASE !== 'undefined' ? COMPANION_API_BASE : 'http://127.0.0.1:8765';
    const url = `${apiBase}/api/remote-id/stream`;

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
        this.streamConnected = false;
        this.streamMode = 'polling';
        this.updateStreamTransportUI();
        if (typeof scheduleNextRadarCheck === 'function') {
          scheduleNextRadarCheck();
        }
      };
    } catch (e) {
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
      const res = await fetch(`${apiBase}/api/remote-id/drones`, controller ? { signal: controller.signal } : {});
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
  radiusMiles: 3.0,
  ceilingFeet: 2500,
  customEndpoint: '',
  serverHost: '127.0.0.1',
  serverPort: 30003,
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
  lastAlertTimes: new Map(), // hex -> timestamp (30s cooldown)
  previousStatus: new Map(), // hex -> 'safe' | 'breached'
  layerGroup: null,
  mapMarkers: new Map(), // hex -> Leaflet marker
  showTrails: true,
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
    if (this.enabled) {
      this.startPolling();
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

        const savedTrails = localStorage.getItem('aalaapi_adsb_show_trails');
        if (savedTrails !== null) this.showTrails = savedTrails === 'true';

        const savedRadius = localStorage.getItem('aalaapi_adsb_radius_mi');
        if (savedRadius) this.radiusMiles = parseFloat(savedRadius) || 3.0;

        const savedCeiling = localStorage.getItem('aalaapi_adsb_ceiling_ft');
        if (savedCeiling) this.ceilingFeet = parseInt(savedCeiling, 10) || 2500;

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
        localStorage.setItem('aalaapi_adsb_show_trails', String(this.showTrails));
        localStorage.setItem('aalaapi_adsb_radius_mi', String(this.radiusMiles));
        localStorage.setItem('aalaapi_adsb_ceiling_ft', String(this.ceilingFeet));
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
      this.layerGroup = leaflet.layerGroup().addTo(m);
    }
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
      this.audioContext.resume().catch(() => {});
    }
  },

  playWarningChime() {
    try {
      this.initAudioContext();
      if (!this.audioContext) return;
      const ctx = this.audioContext;
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

  playVoiceAdvisory(aircraft) {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      const isMetric = typeof isMetricMode === 'function' ? isMetricMode() : false;
      const callsign = (aircraft.callsign || 'Traffic').replace(/[^A-Za-z0-9]/g, ' ');
      let distText = '';
      let altText = '';
      if (isMetric) {
        const km = aircraft.distanceMeters ? (aircraft.distanceMeters / 1000).toFixed(1) : 'unknown';
        const m = aircraft.altitude ? Math.round(aircraft.altitude * 0.3048) : 'unknown';
        distText = `${km} kilometers`;
        altText = `${m} meters`;
      } else {
        const mi = aircraft.distanceMiles !== null ? aircraft.distanceMiles : 'unknown';
        const ft = aircraft.altitude !== null ? aircraft.altitude : 'unknown';
        distText = `${mi} miles`;
        altText = `${ft} feet`;
      }
      const cardinal = aircraft.bearingCardinal ? ` ${aircraft.bearingCardinal}` : '';
      const text = `Traffic alert! ${callsign}, ${distText}${cardinal}, ${altText}.`;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      utterance.pitch = 1.0;
      utterance.volume = 0.9;
      window.speechSynthesis.speak(utterance);
    } catch (e) {}
  },

  triggerAudioAlert(aircraft) {
    if (!this.soundEnabled) return;
    const now = Date.now();
    if (this.isSnoozed) {
      if (now < this.snoozeUntil) return;
      this.isSnoozed = false;
    }

    const hex = aircraft.hex;
    const lastTime = this.lastAlertTimes.get(hex) || 0;
    if (now - lastTime < 30000) {
      // Cooldown active (<30s)
      return;
    }
    this.lastAlertTimes.set(hex, now);

    if (this.soundType === 'chime' || this.soundType === 'both') {
      this.playWarningChime();
    }
    if (this.soundType === 'voice' || this.soundType === 'both') {
      setTimeout(() => {
        this.playVoiceAdvisory(aircraft);
      }, 220);
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

  toggleTrails(forceState) {
    this.showTrails = forceState !== undefined ? forceState : !this.showTrails;
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

  toggleDrawer(forceState) {
    const drawer = typeof document !== 'undefined' ? document.getElementById('adsb-control-drawer') : null;
    if (!drawer) return;
    this.isDrawerOpen = forceState !== undefined ? forceState : !this.isDrawerOpen;
    if (this.isDrawerOpen) {
      drawer.classList.remove('hidden');
      this.initAudioContext();
      this.updateDrawerAircraftList();
      this.fetchAirspaceStatus();
    } else {
      drawer.classList.add('hidden');
    }
  },

  async fetchAirspaceStatus() {
    try {
      const apiBase = (typeof getCompanionApiBase === 'function') ? getCompanionApiBase() : 'http://127.0.0.1:8765';
      const res = await fetch(`${apiBase}/api/airspace/status`);
      if (!res.ok) return;
      const st = await res.json();
      this.updateDiagnosticsUI(st);
    } catch (e) {
      this.updateDiagnosticsUI(null);
    }
  },

  updateDiagnosticsUI(st) {
    if (typeof document === 'undefined') return;
    const hwEl = document.getElementById('adsb-hw-status');
    const streamEl = document.getElementById('adsb-stream-status');
    const summaryEl = document.getElementById('adsb-diag-summary');
    const tipEl = document.getElementById('adsb-diag-tip');
    const hwPacketsEl = document.getElementById('adsb-hw-packets');
    const hwDriverEl = document.getElementById('adsb-hw-driver');
    if (!hwEl || !streamEl) return;

    if (!st) {
      hwEl.textContent = 'Bridge Offline';
      hwEl.style.color = '#ef4444';
      streamEl.textContent = 'Offline';
      streamEl.style.color = '#ef4444';
      if (summaryEl) {
        summaryEl.textContent = 'OFFLINE';
        summaryEl.style.background = 'rgba(239, 68, 68, 0.2)';
        summaryEl.style.color = '#ef4444';
      }
      return;
    }

    const targetHost = (st && (st.tcpHost || st.adsbHost)) ? (st.tcpHost || st.adsbHost) : (this.serverHost || '127.0.0.1');
    const targetPort = (st && (st.tcpPort || st.adsbPort)) ? (st.tcpPort || st.adsbPort) : (this.serverPort || 30003);
    const hostPortStr = `${targetHost}:${targetPort}`;

    const hostInput = document.getElementById('adsb-host-input');
    const portInput = document.getElementById('adsb-port-input');
    if (hostInput && document.activeElement !== hostInput) {
      hostInput.value = targetHost;
    }
    if (portInput && document.activeElement !== portInput) {
      portInput.value = targetPort;
    }

    // Hardware status
    if (st.hardware && st.hardware.detected) {
      if (st.hardware.driverStatus === 'needs_zadig') {
        hwEl.textContent = 'Detected (Driver Missing)';
        hwEl.style.color = '#f59e0b';
        if (tipEl) {
          tipEl.style.display = 'block';
          tipEl.innerHTML = '⚠️ <strong>Driver Needed:</strong> Windows sees your RTL-SDR dongle, but needs the <strong>WinUSB</strong> driver. Run <a href="https://zadig.akeo.ie/" target="_blank" style="color: #60a5fa; text-decoration: underline;">Zadig</a>, select <em>Bulk-In, Interface</em>, and click <em>Install WinUSB</em>.';
        }
      } else {
        hwEl.textContent = 'Ready (WinUSB Active)';
        hwEl.style.color = '#10b981';
      }
    } else if (st.isRemoteServer || targetHost !== '127.0.0.1') {
      hwEl.textContent = 'Remote Feed (No USB Dongle Needed)';
      hwEl.style.color = '#38bdf8';
    } else {
      hwEl.textContent = 'Not Detected';
      hwEl.style.color = '#94a3b8';
    }

    // dump1090 daemon stream status
    if (st.connected) {
      streamEl.textContent = `Connected (${hostPortStr})`;
      streamEl.style.color = '#10b981';
      if (summaryEl) {
        summaryEl.textContent = 'ACTIVE';
        summaryEl.style.background = 'rgba(16, 185, 129, 0.2)';
        summaryEl.style.color = '#10b981';
      }
      if (tipEl && (!st.hardware || st.hardware.driverStatus !== 'needs_zadig')) {
        tipEl.style.display = 'none';
      }
    } else {
      streamEl.textContent = `Waiting on ${hostPortStr}...`;
      streamEl.style.color = '#f59e0b';
      if (summaryEl) {
        summaryEl.textContent = 'WAITING';
        summaryEl.style.background = 'rgba(245, 158, 11, 0.2)';
        summaryEl.style.color = '#f59e0b';
      }
      if (tipEl && (!st.hardware || st.hardware.driverStatus !== 'needs_zadig')) {
        tipEl.style.display = 'block';
        tipEl.innerHTML = `💡 <strong>Waiting for dump1090:</strong> Ensure dump1090 or your SBS feed is running on <code>${hostPortStr}</code>.`;
      }
    }

    if (hwPacketsEl && typeof st.totalPackets === 'number') {
      hwPacketsEl.textContent = st.totalPackets.toLocaleString();
    }
    if (hwDriverEl) {
      if (st.driverType === 'dump1090-tcp') {
        hwDriverEl.textContent = `TCP Stream (${targetPort})`;
      } else if (st.driverType) {
        hwDriverEl.textContent = st.driverType;
      }
    }

    this.updateStreamTransportUI();
  },

  updateStreamTransportUI() {
    if (typeof document === 'undefined') return;
    const badge = document.getElementById('adsb-transport-badge');
    if (!badge) return;
    if (this.streamMode === 'sse') {
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
    const EventSourceCtor = (typeof window !== 'undefined' && window.EventSource) || (typeof EventSource !== 'undefined' && EventSource) || null;
    if (!EventSourceCtor) {
      this.ensureFallbackPolling();
      return;
    }

    let homeLat = 40.0130;
    let homeLon = -83.1765;
    if (typeof centerMarker !== 'undefined' && centerMarker && centerMarker.getLatLng) {
      const ll = centerMarker.getLatLng();
      homeLat = ll.lat;
      homeLon = ll.lng;
    } else if (typeof map !== 'undefined' && map && map.getCenter) {
      const ll = map.getCenter();
      homeLat = ll.lat;
      homeLon = ll.lng;
    }

    const endpoint = this.getEffectiveStreamEndpoint();
    const url = `${endpoint}?lat=${homeLat.toFixed(5)}&lon=${homeLon.toFixed(5)}&radius=${this.radiusMiles}&ceiling=${this.ceilingFeet}&includeSafe=true`;

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
      } else if (this.streamLat !== null) {
        // Check if home point moved significantly (> ~500m) or radius changed
        let curLat = 40.0130;
        let curLon = -83.1765;
        if (typeof centerMarker !== 'undefined' && centerMarker && centerMarker.getLatLng) {
          const ll = centerMarker.getLatLng();
          curLat = ll.lat;
          curLon = ll.lng;
        } else if (typeof map !== 'undefined' && map && map.getCenter) {
          const ll = map.getCenter();
          curLat = ll.lat;
          curLon = ll.lng;
        }
        if (Math.abs(curLat - this.streamLat) > 0.005 || Math.abs(curLon - this.streamLon) > 0.005 || this.streamRadius !== this.radiusMiles) {
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
    this.breachedAircraft = this.aircraft.filter(a => a.isBreached);

    // State transition detection & 30s audio throttling
    for (const ac of this.aircraft) {
      const prev = this.previousStatus.get(ac.hex) || 'safe';
      if (ac.isBreached) {
        if (prev === 'safe') {
          this.triggerAudioAlert(ac);
        } else {
          const now = Date.now();
          if (now - (this.lastAlertTimes.get(ac.hex) || 0) >= 30000) {
            this.triggerAudioAlert(ac);
          }
        }
        this.previousStatus.set(ac.hex, 'breached');
      } else {
        this.previousStatus.set(ac.hex, 'safe');
      }
    }

    // Clean up previousStatus for aircraft that left coverage
    const activeHexes = new Set(this.aircraft.map(a => a.hex));
    for (const hex of this.previousStatus.keys()) {
      if (!activeHexes.has(hex)) this.previousStatus.delete(hex);
    }

    this.updateVisualBanner();
    this.updateTopbarAndHud();
    this.updateMapMarkers();
    if (this.isDrawerOpen) {
      this.updateDrawerAircraftList();
      this.fetchAirspaceStatus();
    }
  },

  async pollAirspace() {
    if (!this.enabled) return;
    try {
      let homeLat = 40.0130;
      let homeLon = -83.1765;
      if (typeof centerMarker !== 'undefined' && centerMarker && centerMarker.getLatLng) {
        const ll = centerMarker.getLatLng();
        homeLat = ll.lat;
        homeLon = ll.lng;
      } else if (typeof map !== 'undefined' && map && map.getCenter) {
        const ll = map.getCenter();
        homeLat = ll.lat;
        homeLon = ll.lng;
      }

      const endpoint = this.getEffectiveEndpoint();
      const url = `${endpoint}?lat=${homeLat.toFixed(5)}&lon=${homeLon.toFixed(5)}&radius=${this.radiusMiles}&ceiling=${this.ceilingFeet}&includeSafe=true`;
      
      const res = await fetch(url);
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

  updateVisualBanner() {
    const banner = typeof document !== 'undefined' ? document.getElementById('adsb-alert-banner') : null;
    if (!banner) return;

    if (this.breachedAircraft.length > 0 && this.enabled) {
      const primary = this.breachedAircraft[0];
      const callsignEl = document.getElementById('adsb-alert-callsign');
      const altEl = document.getElementById('adsb-alert-altitude');
      const distEl = document.getElementById('adsb-alert-distance');
      const speedEl = document.getElementById('adsb-alert-speed');
      const badgeEl = document.getElementById('adsb-alert-badge');

      if (callsignEl) callsignEl.textContent = primary.callsign || `HEX:${primary.hex}`;
      if (altEl) {
        const isMetric = typeof isMetricMode === 'function' ? isMetricMode() : false;
        if (primary.altitude !== null) {
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
          ? `BREACH (${this.breachedAircraft.length})` 
          : 'BREACH';
      }

      banner.classList.remove('hidden');
    } else {
      banner.classList.add('hidden');
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
    const totalCount = this.aircraft.length;

    if (topbarBadge) {
      if (breachedCount > 0) {
        topbarBadge.textContent = `${breachedCount} ALERT`;
        topbarBadge.style.background = 'rgba(239, 68, 68, 0.4)';
        topbarBadge.style.color = '#fff';
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
      } else if (totalCount > 0) {
        mapPill.classList.remove('hidden');
        if (mapPillText) mapPillText.textContent = `✈️ ${totalCount} Aircraft`;
        if (beaconDot) {
          beaconDot.style.background = '#38bdf8';
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
      if (ac.latitude === null || ac.longitude === null) continue;
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
      const lastPt = hist[hist.length - 1];
      if (!lastPt || Math.abs(lastPt[0] - ac.latitude) > 0.00005 || Math.abs(lastPt[1] - ac.longitude) > 0.00005) {
        hist.push([ac.latitude, ac.longitude, ac.altitude || 0, Date.now()]);
        if (hist.length > 60) hist.shift();
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
      const track = ac.track || 0;
      const altStr = ac.altitude ? `${ac.altitude} ft` : 'Alt N/A';
      const speedStr = ac.speed ? `${ac.speed} kt` : '';
      const typeStr = ac.aircraftType ? ` [${ac.aircraftType}]` : '';
      const srcStr = ac.source || ac.dataSource || 'Local SDR';
      const tooltipContent = `<strong>${ac.callsign || ac.hex}</strong>${typeStr}<br>Alt: ${altStr} • ${speedStr}<br>Dist: ${ac.distanceMiles || '--'} mi ${ac.bearingCardinal || ''}<br><span style="font-size: 0.64rem; color: #94a3b8;">Source: ${srcStr}</span>`;

      let marker = this.mapMarkers.get(ac.hex);
      if (!marker) {
        const svgColor = isBreached ? '#ef4444' : '#38bdf8';
        const innerClass = isBreached ? 'adsb-marker-inner breached' : 'adsb-marker-inner';
        const iconHtml = `
          <div class="adsb-map-aircraft-marker" style="transform: rotate(${track}deg);">
            <div class="${innerClass}">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
              </svg>
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
        if (marker.bindTooltip) {
          marker.bindTooltip(tooltipContent, {
            className: `adsb-plane-tooltip ${isBreached ? 'breached' : ''}`,
            direction: 'top',
            offset: [0, -12]
          });
        }
        marker.addTo(this.layerGroup);
        this.mapMarkers.set(ac.hex, marker);
      } else {
        marker.setLatLng([ac.latitude, ac.longitude]);
        const inner = marker.getElement()?.querySelector('.adsb-map-aircraft-marker');
        if (inner) {
          inner.style.transform = `rotate(${track}deg)`;
          const innerRing = inner.querySelector('.adsb-marker-inner');
          if (innerRing) {
            innerRing.className = isBreached ? 'adsb-marker-inner breached' : 'adsb-marker-inner';
          }
        }
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
        this.acHistory.delete(hex);
      }
    }
  },

  clearAll() {
    this.aircraft = [];
    this.breachedAircraft = [];
    this.previousStatus.clear();
    this.updateVisualBanner();
    this.updateTopbarAndHud();
    if (this.layerGroup && this.layerGroup.clearLayers) {
      this.layerGroup.clearLayers();
    }
    this.mapMarkers.clear();
    this.mapTrails.clear();
    this.acHistory.clear();
    if (this.isDrawerOpen) {
      this.updateDrawerAircraftList();
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

    const soundSelect = document.getElementById('adsb-sound-type-select');
    if (soundSelect) soundSelect.value = this.soundType;

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

    if (!listEl) return;
    if (this.aircraft.length === 0) {
      listEl.innerHTML = '<div style="font-size: 0.72rem; color: var(--text-muted); text-align: center; padding: 12px 0;">No aircraft currently in range</div>';
      return;
    }

    const isMetric = typeof isMetricMode === 'function' ? isMetricMode() : false;
    let html = '';
    for (const ac of this.aircraft) {
      const isBreached = ac.isBreached;
      const hasPos = ac.latitude !== null && ac.longitude !== null;
      const altStr = ac.altitude !== null ? (isMetric ? `${Math.round(ac.altitude * 0.3048)}m` : `${ac.altitude}ft`) : 'Alt N/A';
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

      const typeBadge = ac.aircraftType ? `<span style="font-size: 0.62rem; font-weight: 600; color: #a5f3fc; background: rgba(56, 189, 248, 0.12); padding: 1px 4px; border-radius: 3px;">${ac.aircraftType}</span>` : '';

      let statusChip = '';
      let distDisplay = '';
      if (!hasPos) {
        statusChip = '<span style="font-size: 0.62rem; font-weight: 600; background: rgba(148, 163, 184, 0.2); color: #94a3b8; padding: 1px 6px; border-radius: 8px;">MODE S</span>';
        distDisplay = '<span style="font-size: 0.65rem; color: #94a3b8; font-style: italic;">Position pending</span>';
      } else if (isBreached) {
        statusChip = '<span style="font-size: 0.62rem; font-weight: 700; background: rgba(239, 68, 68, 0.3); border: 1px solid rgba(239, 68, 68, 0.6); color: #fca5a5; padding: 1px 6px; border-radius: 8px;">ALERT</span>';
        distDisplay = `<span style="font-size: 0.68rem; font-weight: 600; color: #fbbf24;">${distStr} ${ac.bearingCardinal || ''}</span>`;
      } else {
        statusChip = '<span style="font-size: 0.62rem; font-weight: 600; background: rgba(16, 185, 129, 0.2); color: #34d399; padding: 1px 6px; border-radius: 8px;">SAFE</span>';
        distDisplay = `<span style="font-size: 0.68rem; font-weight: 600; color: #fbbf24;">${distStr} ${ac.bearingCardinal || ''}</span>`;
      }

      const speedSubtitle = ac.speed ? `${ac.speed} kts` : (hasPos ? '-- kts' : 'Speed N/A');
      const trackSubtitle = ac.track ? ` • <span>${ac.track}°</span>` : '';
      const groundSubtitle = ac.isOnGround ? ' • <span style="color: #6ee7b7;">Ground</span>' : '';

      html += `
        <div class="adsb-aircraft-card ${isBreached ? 'breached' : ''} ${!hasPos ? 'mode-s-pending' : ''}">
          <div style="display: flex; flex-direction: column; gap: 2px;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="font-weight: 700; font-size: 0.78rem; color: #fff;">${ac.callsign || ac.hex}</span>
              ${typeBadge}
              <span style="font-size: 0.64rem; color: var(--text-muted); font-family: monospace;">[${ac.hex}]</span>
            </div>
            <div style="font-size: 0.68rem; color: var(--text-muted);">
              <span>${altStr}</span> • <span>${speedSubtitle}</span>${trackSubtitle}${groundSubtitle}
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

    let homeLat = 40.0130;
    let homeLon = -83.1765;
    if (typeof centerMarker !== 'undefined' && centerMarker && centerMarker.getLatLng) {
      const ll = centerMarker.getLatLng();
      homeLat = ll.lat;
      homeLon = ll.lng;
    } else if (typeof map !== 'undefined' && map && map.getCenter) {
      const ll = map.getCenter();
      homeLat = ll.lat;
      homeLon = ll.lng;
    }

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
      const res = await fetch(directUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
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

    const soundSelect = document.getElementById('adsb-sound-type-select');
    if (soundSelect) {
      soundSelect.addEventListener('change', (e) => {
        this.soundType = e.target.value;
        this.saveSettings();
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
      testAudioBtn.addEventListener('click', () => {
        this.initAudioContext();
        this.playWarningChime();
        setTimeout(() => {
          this.playVoiceAdvisory({
            callsign: 'UAL452',
            distanceMiles: 1.5,
            distanceMeters: 2414,
            altitude: 1850,
            bearingCardinal: 'NE'
          });
        }, 220);
      });
    }

    const simTriggerBtn = document.getElementById('adsb-sim-trigger-btn');
    if (simTriggerBtn) {
      simTriggerBtn.addEventListener('click', async () => {
        this.initAudioContext();
        let homeLat = 40.0130;
        let homeLon = -83.1765;
        if (typeof centerMarker !== 'undefined' && centerMarker && centerMarker.getLatLng) {
          const ll = centerMarker.getLatLng();
          homeLat = ll.lat;
          homeLon = ll.lng;
        }

        const simAircraft = {
          hex: 'A99999',
          callsign: 'CESSNA172',
          lat: homeLat + 0.012, // ~0.9 mi away
          lon: homeLon + 0.012,
          alt: 1600, // below 2,500 ft ceiling!
          speed: 120,
          track: 225
        };

        try {
          const apiBase = (typeof getCompanionApiBase === 'function') ? getCompanionApiBase() : 'http://127.0.0.1:8765';
          await fetch(`${apiBase}/api/airspace/simulate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(simAircraft)
          });
        } catch (e) {
          // If offline, inject directly into manager
          simAircraft.distanceMeters = 1500;
          simAircraft.distanceMiles = 0.93;
          simAircraft.bearingDeg = 45;
          simAircraft.bearingCardinal = 'NE';
          simAircraft.isBreached = true;
          simAircraft.status = 'breached';
          simAircraft.source = 'simulated';
          this.aircraft = [simAircraft];
          this.breachedAircraft = [simAircraft];
          this.triggerAudioAlert(simAircraft);
          this.updateVisualBanner();
          this.updateTopbarAndHud();
          this.updateDrawerAircraftList();
        }
        await this.pollAirspace();
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
        serverSaveBtn.textContent = 'Connecting...';
        serverSaveBtn.disabled = true;

        try {
          const apiBase = (typeof getCompanionApiBase === 'function') ? getCompanionApiBase() : 'http://localhost:8765';
          let res = await fetch(`${apiBase}/api/config/adsb`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ adsbHost: hostVal, adsbPort: parsedPortVal })
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
        }

        setTimeout(() => {
          serverSaveBtn.textContent = 'Connect';
          serverSaveBtn.disabled = false;
        }, 1500);

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
          const apiBase = (typeof getCompanionApiBase === 'function') ? getCompanionApiBase() : 'http://localhost:8765';
          const res = await fetch(`${apiBase}/api/config/adsb/probe?host=${encodeURIComponent(targetHost)}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
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
        const banner = document.getElementById('adsb-alert-banner');
        if (banner) banner.classList.add('hidden');
      });
    }
  }
};

if (typeof window !== 'undefined') {
  window.AdsbAirspaceManager = AdsbAirspaceManager;
}

// ─── Flight Diagnostics & 3D Telemetry Replay Engine ──────────────────────────

