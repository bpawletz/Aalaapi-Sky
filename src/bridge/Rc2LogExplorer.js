let rc2LogsCache = [];

function openRc2LogManagerModal() {
  if (typeof document === 'undefined') return;
  const modal = document.getElementById('rc2-flight-logs-modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  refreshRc2LogList();
}

function closeRc2LogManagerModal() {
  if (typeof document === 'undefined') return;
  const modal = document.getElementById('rc2-flight-logs-modal');
  if (modal) modal.classList.add('hidden');
}

async function refreshRc2LogList() {
  const container = document.getElementById('rc2-logs-table-container');
  const countSummary = document.getElementById('rc2-logs-count-summary');
  const refreshBtn = document.getElementById('rc2-logs-refresh-btn');
  if (!container) return;

  if (refreshBtn) {
    refreshBtn.disabled = true;
    refreshBtn.textContent = '⏳ Scanning RC 2...';
  }

  container.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 32px 16px; color: var(--text-muted); gap: 10px;">
      <div style="width: 24px; height: 24px; border: 2px solid rgba(56, 189, 248, 0.2); border-top-color: #38bdf8; border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
      <span style="font-size: 0.8rem;">Querying connected DJI RC 2 controller storage over USB MTP...</span>
    </div>
  `;

  try {
    const apiBase = (typeof getCompanionApiBase === 'function') ? getCompanionApiBase() : 'http://127.0.0.1:8765';
    const fetchOptions = {};
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
      fetchOptions.signal = AbortSignal.timeout(20000);
    }
    const res = await fetch(`${apiBase}/api/rc2/logs`, fetchOptions);
    const data = await res.json();

    if (data.success && Array.isArray(data.logs)) {
      rc2LogsCache = data.logs;
      renderRc2LogTable(rc2LogsCache);
      if (countSummary) {
        const decryptedCount = rc2LogsCache.filter(l => l.isDecrypted).length;
        countSummary.textContent = `Found ${rc2LogsCache.length} logs on RC 2 (${decryptedCount} ready / decrypted)`;
      }
    } else {
      rc2LogsCache = [];
      const errMsg = (data && data.error) ? data.error : 'No flight logs found or RC 2 not connected.';
      container.innerHTML = `
        <div style="padding: 24px; text-align: center; color: #f87171; font-size: 0.8rem;">
          ❌ ${typeof escapeHtml === 'function' ? escapeHtml(errMsg) : errMsg}
          <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 6px;">Ensure RC 2 is powered on and connected via USB-C.</div>
        </div>
      `;
      if (countSummary) countSummary.textContent = 'RC 2 Disconnected or No Logs';
    }
  } catch (err) {
    rc2LogsCache = [];
    container.innerHTML = `
      <div style="padding: 24px; text-align: center; color: #f87171; font-size: 0.8rem;">
        ❌ Unable to reach Aalaapi Bridge: ${typeof escapeHtml === 'function' ? escapeHtml(err.message) : err.message}
        <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 6px;">Ensure <code>start-bridge.bat</code> is running on port 8765.</div>
      </div>
    `;
    if (countSummary) countSummary.textContent = 'Bridge Service Offline';
  } finally {
    if (refreshBtn) {
      refreshBtn.disabled = false;
      refreshBtn.textContent = '🔄 Refresh List';
    }
  }
}

function renderRc2LogTable(logs) {
  const container = document.getElementById('rc2-logs-table-container');
  if (!container) return;

  const searchInput = document.getElementById('rc2-logs-search');
  const filterText = (searchInput && searchInput.value) ? searchInput.value.trim().toLowerCase() : '';
  const filtered = logs.filter(l => {
    if (!filterText) return true;
    const nameMatch = (l.filename || '').toLowerCase().includes(filterText);
    const dateMatch = (l.flightDate || '').toLowerCase().includes(filterText);
    const mtimeMatch = (l.mtimeFormatted || '').toLowerCase().includes(filterText);
    return nameMatch || dateMatch || mtimeMatch;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="padding: 28px; text-align: center; color: var(--text-muted); font-size: 0.8rem;">
        ${logs.length === 0 ? 'No flight records (.txt) found in RC 2 FlightRecord folder.' : 'No flight logs match your search filter.'}
      </div>
    `;
    return;
  }

  const safeEscape = (str) => (typeof escapeHtml === 'function' ? escapeHtml(str) : String(str || ''));

  let html = `
    <table style="width: 100%; border-collapse: collapse; font-size: 0.76rem; text-align: left;">
      <thead>
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.25); color: var(--text-muted);">
          <th style="padding: 8px 10px; font-weight: 600;">Flight Record / Date</th>
          <th style="padding: 8px 10px; font-weight: 600;">Size</th>
          <th style="padding: 8px 10px; font-weight: 600;">Controller Status</th>
          <th style="padding: 8px 10px; font-weight: 600; text-align: right;">Action</th>
        </tr>
      </thead>
      <tbody>
  `;

  filtered.forEach(log => {
    const isDec = Boolean(log.isDecrypted);
    const isDown = Boolean(log.isDownloaded);

    let statusBadge = '';
    if (isDec) {
      statusBadge = '<span style="background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); padding: 2px 7px; border-radius: 4px; font-size: 0.7rem; font-weight: 600;">Decrypted ✓</span>';
    } else if (isDown) {
      statusBadge = '<span style="background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3); padding: 2px 7px; border-radius: 4px; font-size: 0.7rem; font-weight: 600;">Downloaded (Raw)</span>';
    } else {
      statusBadge = '<span style="background: rgba(148, 163, 184, 0.12); color: #94a3b8; border: 1px solid rgba(148, 163, 184, 0.25); padding: 2px 7px; border-radius: 4px; font-size: 0.7rem;">On Controller</span>';
    }

    let actionBtn = '';
    if (isDec) {
      actionBtn = `
        <button type="button" class="btn-primary rc2-load-log-btn" data-filename="${safeEscape(log.filename)}" style="padding: 4px 10px; font-size: 0.72rem; display: inline-flex; align-items: center; gap: 4px; cursor: pointer;">
          📊 Load Telemetry
        </button>
      `;
    } else {
      actionBtn = `
        <button type="button" class="btn-secondary rc2-pull-single-btn" data-filename="${safeEscape(log.filename)}" style="padding: 4px 10px; font-size: 0.72rem; display: inline-flex; align-items: center; gap: 4px; background: rgba(14, 165, 233, 0.15); border: 1px solid rgba(14, 165, 233, 0.4); color: #38bdf8; cursor: pointer;">
          📥 Pull &amp; Decrypt
        </button>
      `;
    }

    html += `
      <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); transition: background 0.15s;">
        <td style="padding: 8px 10px;">
          <div style="font-weight: 600; color: var(--text-main); font-family: monospace;">${safeEscape(log.filename)}</div>
          <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 2px;">${safeEscape(log.flightDate || log.mtimeFormatted || '—')}</div>
        </td>
        <td style="padding: 8px 10px; color: var(--text-muted); font-size: 0.72rem;">${safeEscape(log.sizeFormatted || '—')}</td>
        <td style="padding: 8px 10px;">${statusBadge}</td>
        <td style="padding: 8px 10px; text-align: right;">${actionBtn}</td>
      </tr>
    `;
  });

  html += `
      </tbody>
    </table>
  `;

  container.innerHTML = html;

  const loadBtns = container.querySelectorAll('.rc2-load-log-btn');
  loadBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const fn = btn.getAttribute('data-filename');
      if (fn) loadRc2LogToDiagnostics(fn);
    });
  });

  const pullBtns = container.querySelectorAll('.rc2-pull-single-btn');
  pullBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const fn = btn.getAttribute('data-filename');
      if (fn) pullSpecificRc2Log(fn);
    });
  });
}

async function pullSpecificRc2Log(filename) {
  if (!filename) return;
  const progContainer = document.getElementById('rc2-logs-progress-container');
  const progBar = document.getElementById('rc2-logs-progress-bar');
  const progText = document.getElementById('rc2-logs-status-text');
  const progPct = document.getElementById('rc2-logs-pct-text');

  let currentPct = 15;
  if (progContainer) progContainer.style.display = 'flex';
  if (progBar) progBar.style.width = '15%';
  if (progPct) progPct.textContent = '15%';
  if (progText) progText.textContent = `Extracting ${filename} from RC 2 over USB MTP...`;

  const pollTimer = setInterval(() => {
    if (currentPct < 90) {
      currentPct = Math.min(90, currentPct + 8);
      if (progBar) progBar.style.width = `${currentPct}%`;
      if (progPct) progPct.textContent = `${currentPct}%`;
    }
  }, 250);

  try {
    const apiBase = (typeof getCompanionApiBase === 'function') ? getCompanionApiBase() : 'http://127.0.0.1:8765';
    const res = await fetch(`${apiBase}/api/rc2/pull-log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filenames: [filename] })
    });
    const data = await res.json();
    clearInterval(pollTimer);
    if (progBar) progBar.style.width = '100%';
    if (progPct) progPct.textContent = '100%';

    if (data.success && data.pulled && data.pulled.length > 0) {
      if (progText) progText.textContent = `Successfully pulled and decrypted ${filename}!`;
      await refreshRc2LogList();
      loadRc2LogToDiagnostics(filename);
    } else {
      if (progText) progText.textContent = `Pull error: ${data.error || 'Failed to pull log from controller'}`;
    }
  } catch (err) {
    clearInterval(pollTimer);
    if (progText) progText.textContent = `Network error: ${err.message}`;
  } finally {
    setTimeout(() => {
      if (progContainer) progContainer.style.display = 'none';
    }, 4000);
  }
}

async function pullAllRc2Logs() {
  const progContainer = document.getElementById('rc2-logs-progress-container');
  const progBar = document.getElementById('rc2-logs-progress-bar');
  const progText = document.getElementById('rc2-logs-status-text');
  const progPct = document.getElementById('rc2-logs-pct-text');
  const pullAllBtn = document.getElementById('rc2-logs-pull-all-btn');

  let currentPct = 10;
  if (pullAllBtn) pullAllBtn.disabled = true;
  if (progContainer) progContainer.style.display = 'flex';
  if (progBar) progBar.style.width = '10%';
  if (progPct) progPct.textContent = '10%';
  if (progText) progText.textContent = 'Pulling and decrypting all flight records from RC 2...';

  const pollTimer = setInterval(() => {
    if (currentPct < 90) {
      currentPct = Math.min(90, currentPct + 6);
      if (progBar) progBar.style.width = `${currentPct}%`;
      if (progPct) progPct.textContent = `${currentPct}%`;
    }
  }, 350);

  try {
    const apiBase = (typeof getCompanionApiBase === 'function') ? getCompanionApiBase() : 'http://127.0.0.1:8765';
    const res = await fetch(`${apiBase}/api/rc2/pull-log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pullAll: true })
    });
    const data = await res.json();
    clearInterval(pollTimer);
    if (progBar) progBar.style.width = '100%';
    if (progPct) progPct.textContent = '100%';

    if (data.success) {
      if (progText) progText.textContent = `Batch complete! Pulled ${data.count || 0} flight logs from RC 2.`;
      await refreshRc2LogList();
    } else {
      if (progText) progText.textContent = `Batch error: ${data.error || 'Failed to pull all logs'}`;
    }
  } catch (err) {
    clearInterval(pollTimer);
    if (progText) progText.textContent = `Network error: ${err.message}`;
  } finally {
    if (pullAllBtn) pullAllBtn.disabled = false;
    setTimeout(() => {
      if (progContainer) progContainer.style.display = 'none';
    }, 4500);
  }
}

function loadRc2LogToDiagnostics(filename) {
  closeRc2LogManagerModal();
  if (typeof FlightDiagnostics !== 'undefined' && FlightDiagnostics.open) {
    FlightDiagnostics.open('3d', filename);
  }
}

/**
 * Safely stringifies an object into JSON, stripping circular references,
 * Leaflet markers, DOM elements, and internal Leaflet properties.
 */
function safeJsonStringify(obj, space) {
  const seen = new WeakSet();
  return JSON.stringify(obj, (key, value) => {
    // Drop Leaflet and DOM properties that introduce cycles or large state
    if (typeof key === 'string' && (
      key.startsWith('_') ||
      key === 'mapMarker' ||
      key === 'droneMarker' ||
      key === 'roadMarker' ||
      key === 'marker' ||
      key === 'layerGroup' ||
      key === '_tooltip' ||
      key === '_source' ||
      key === '_map' ||
      key === '_events' ||
      key === '_layers' ||
      key === '_leaflet_id' ||
      key === 'element'
    )) {
      return undefined;
    }
    if (typeof value === 'object' && value !== null) {
      if (typeof HTMLElement !== 'undefined' && value instanceof HTMLElement) return undefined;
      if (typeof window !== 'undefined' && value === window) return undefined;
      if (seen.has(value)) {
        return undefined; // Drop circular reference
      }
      seen.add(value);
    }
    return value;
  }, space);
}

async function executeMediaPull() {
  const progContainer = document.getElementById('ingest-progress-container');
  const progBar = document.getElementById('ingest-progress-bar');
  const progText = document.getElementById('ingest-status-text');
  const progPct = document.getElementById('ingest-pct-text');
  const dlBtn = document.getElementById('media-download-archive-btn');
  const filterTimeCheck = document.getElementById('ingest-filter-time');
  const filterGeoCheck = document.getElementById('ingest-filter-geo');
  const deleteDroneCheck = document.getElementById('ingest-delete-from-drone');
  const startPullBtn = document.getElementById('start-media-pull-btn');

  const shouldDeleteFromDrone = !!(deleteDroneCheck && deleteDroneCheck.checked);
  if (shouldDeleteFromDrone && typeof window !== 'undefined' && typeof window.confirm === 'function') {
    const confirmed = window.confirm(
      '⚠️ Delete from Drone Enabled:\n\n' +
      'Are you sure you want to delete successfully ingested photos from the drone/SD card after verification?\n\n' +
      '• Source files will ONLY be removed after bit-for-bit MD5 checksum and byte-size verification on your PC.\n' +
      '• Photos outside this mission window will be preserved.'
    );
    if (!confirmed) {
      return;
    }
  }

  let currentPct = 5;
  if (progContainer) progContainer.style.display = 'flex';
  if (progBar) progBar.style.width = '5%';
  if (progPct) progPct.textContent = '5%';
  if (progText) progText.textContent = shouldDeleteFromDrone
    ? 'Connecting to aircraft & verifying storage...'
    : 'Connecting to aircraft & scanning storage...';
  if (startPullBtn) startPullBtn.disabled = true;

  const apiBase = (typeof getCompanionApiBase === 'function') ? getCompanionApiBase() : 'http://127.0.0.1:8765';

  // Stream companion server real-time media pull progress via SSE (with polling fallback)
  let isPulling = true;
  let progressEs = null;
  const EventSourceCtor = (typeof window !== 'undefined' && window.EventSource) || (typeof EventSource !== 'undefined' && EventSource) || null;

  const handleProgressData = (pData) => {
    if (pData && typeof pData.percent === 'number' && pData.percent > 0) {
      const isDone = !pData.active || pData.percent >= 100;
      const sPct = isDone ? 100 : Math.max(currentPct, Math.min(98, pData.percent));
      currentPct = sPct;
      if (progBar) progBar.style.width = `${sPct}%`;
      if (progPct) progPct.textContent = `${sPct}%`;
      if (pData.status && progText && !isDone) progText.textContent = pData.status;
      if (isDone) {
        isPulling = false;
        if (progressEs) { try { progressEs.close(); } catch (_) {} progressEs = null; }
        if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
      }
    }
  };

  let pollInterval = null;
  const startFallbackPolling = () => {
    if (pollInterval) return;
    pollInterval = setInterval(async () => {
      if (!isPulling) {
        if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
        return;
      }
      try {
        const pRes = await fetch(`${apiBase}/api/media/progress`);
        if (pRes.ok) {
          const pData = await pRes.json();
          handleProgressData(pData);
        }
      } catch (_) {
        if (currentPct < 90) {
          currentPct = Math.min(90, currentPct + 2);
          if (progBar) progBar.style.width = `${currentPct}%`;
          if (progPct) progPct.textContent = `${currentPct}%`;
        }
      }
    }, 350);
  };

  if (EventSourceCtor) {
    try {
      progressEs = new EventSourceCtor(`${apiBase}/api/media/progress/stream`);
      progressEs.onmessage = (e) => {
        if (!e || !e.data) return;
        try {
          const pData = JSON.parse(e.data);
          handleProgressData(pData);
        } catch (_) {}
      };
      progressEs.onerror = () => {
        if (isPulling) startFallbackPolling();
      };
    } catch (_) {
      startFallbackPolling();
    }
  } else {
    startFallbackPolling();
  }


  try {
    const activeWps = (typeof getCurrentWaypoints === 'function' && Array.isArray(getCurrentWaypoints())) ? getCurrentWaypoints() : [];
    let telem = (typeof FlightDiagnostics !== 'undefined' && FlightDiagnostics.telemetryData) ? FlightDiagnostics.telemetryData : null;

    let timeWindow = null;
    if (telem && telem.flightDate) {
      const startTime = new Date(telem.flightDate).getTime();
      const durationSec = telem.durationSec || 600;
      timeWindow = {
        start: new Date(startTime).toISOString(),
        end: new Date(startTime + durationSec * 1000).toISOString()
      };
    }

    let bounds = null;
    if (Array.isArray(activeWps) && activeWps.length > 0) {
      let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
      activeWps.forEach(w => {
        if (w && typeof w.lat === 'number' && typeof w.lon === 'number') {
          if (w.lat < minLat) minLat = w.lat;
          if (w.lat > maxLat) maxLat = w.lat;
          if (w.lon < minLon) minLon = w.lon;
          if (w.lon > maxLon) maxLon = w.lon;
        }
      });
      if (minLat !== Infinity) {
        bounds = { minLat, maxLat, minLon, maxLon };
      }
    }

    const currentFlightId = (typeof FlightDiagnostics !== 'undefined' && FlightDiagnostics.selectedFlightId) ? FlightDiagnostics.selectedFlightId : null;
    let targetMissionUuid = (typeof activeLayerId !== 'undefined' && activeLayerId) || 'mission_' + Date.now();
    if (currentFlightId) {
      const flightTagMatch = currentFlightId.match(/(\d{4}-\d{2}-\d{2}_\[\d{2}-\d{2}-\d{2}\])/);
      targetMissionUuid = flightTagMatch ? `mission_${flightTagMatch[1]}` : `mission_${currentFlightId.replace(/\.txt$/i, '').replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    }

    const scanTagsCheck = document.getElementById('ingest-scan-tags');
    const scanTags = Boolean(scanTagsCheck ? scanTagsCheck.checked : true);
    const extractWireframeCheck = document.getElementById('ingest-extract-wireframe');
    const extractWireframe = Boolean(extractWireframeCheck ? extractWireframeCheck.checked : true);

    const cleanWps = activeWps.map((w, idx) => ({
      idx: typeof w.idx === 'number' ? w.idx : idx,
      lat: typeof w.lat === 'function' ? w.lat() : Number(w.lat || 0),
      lon: typeof w.lon === 'function' ? w.lon() : (w.lng !== undefined ? Number(w.lng) : Number(w.lon || 0)),
      alt: Number(w.alt !== undefined ? w.alt : (w.altitude || 0)),
      altitude: Number(w.altitude !== undefined ? w.altitude : (w.alt || 0)),
      pitch: typeof w.pitch === 'number' ? w.pitch : (typeof w.gimbalPitch === 'number' ? w.gimbalPitch : undefined),
      gimbalPitch: typeof w.gimbalPitch === 'number' ? w.gimbalPitch : (typeof w.pitch === 'number' ? w.pitch : undefined),
      heading: typeof w.heading === 'number' ? w.heading : undefined,
      speed: typeof w.speed === 'number' ? w.speed : undefined,
      turnMode: w.turnMode,
      flightPathMode: w.flightPathMode,
      isPhoto: Boolean(w.isPhoto)
    }));

    let cleanTelem = null;
    if (telem) {
      cleanTelem = {
        flightId: telem.flightId,
        flightDate: telem.flightDate,
        durationSec: telem.durationSec,
        durationFormatted: telem.durationFormatted,
        droneModel: telem.droneModel,
        totalDistance: telem.totalDistance,
        maxAltitude: telem.maxAltitude,
        isSimulation: Boolean(telem.isSimulation),
        points: Array.isArray(telem.points) ? telem.points.map(p => ({
          time: p.time,
          timeStr: p.timeStr,
          timestamp: p.timestamp,
          lat: typeof p.lat === 'number' ? p.lat : Number(p.lat || 0),
          lon: typeof p.lon === 'number' ? p.lon : Number(p.lon || 0),
          alt: typeof p.alt === 'number' ? p.alt : Number(p.alt || 0),
          altAgl: typeof p.altAgl === 'number' ? p.altAgl : undefined,
          speed: typeof p.speed === 'number' ? p.speed : undefined,
          pitch: typeof p.pitch === 'number' ? p.pitch : (typeof p.gimbalPitch === 'number' ? p.gimbalPitch : undefined),
          gimbalPitch: typeof p.gimbalPitch === 'number' ? p.gimbalPitch : (typeof p.pitch === 'number' ? p.pitch : undefined),
          yaw: typeof p.yaw === 'number' ? p.yaw : (typeof p.heading === 'number' ? p.heading : undefined),
          heading: typeof p.heading === 'number' ? p.heading : (typeof p.yaw === 'number' ? p.yaw : undefined),
          battery: typeof p.battery === 'number' ? p.battery : undefined,
          satellites: typeof p.satellites === 'number' ? p.satellites : undefined,
          isPhoto: Boolean(p.isPhoto),
          waypointIndex: p.waypointIndex
        })) : []
      };
    }

    const res = await fetch(`${apiBase}/api/media/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: safeJsonStringify({
        flightId: currentFlightId,
        missionUuid: targetMissionUuid,
        waypoints: cleanWps,
        filterByTime: Boolean(filterTimeCheck ? (filterTimeCheck.checked && timeWindow) : Boolean(timeWindow)),
        filterByGeo: Boolean(filterGeoCheck ? (filterGeoCheck.checked && bounds) : Boolean(bounds)),
        deleteFromDrone: shouldDeleteFromDrone,
        scanTags: scanTags,
        extractWireframe: extractWireframe,
        timeWindow,
        bounds,
        telemetry: cleanTelem || { points: [] }
      })
    });
    const data = await res.json();
    isPulling = false;
    if (progressEs) { try { progressEs.close(); } catch (_) {} progressEs = null; }
    if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
    if (progBar) progBar.style.width = '100%';
    if (progPct) progPct.textContent = '100%';

    let statusMsg = `Completed! ${data.totalPhotos || 0} photos ingested.`;
    if (data.wireframe && data.wireframe.count > 0) {
      statusMsg += ` (🏗️ ${data.wireframe.count} 3D wireframe lines)`;
    }
    if (data.diskSpaceError) {
      statusMsg = `⚠️ Disk full on drive C:! Ingested ${data.totalPhotos || 0} photos before space ran out. Free up space on C: to ingest remaining photos.`;
      if (progText) progText.style.color = '#f87171';
    } else if (shouldDeleteFromDrone) {
      if (data.deletedCount > 0) {
        statusMsg += ` (${data.deletedCount} verified & freed from SD card)`;
      } else if (data.deleteErrors && data.deleteErrors.length > 0) {
        statusMsg += ` (SD card write-protected or read-only)`;
      }
    }
    if (progText) progText.textContent = statusMsg;


    if (data.manifest) {
      if (typeof FlightDiagnostics !== 'undefined' && FlightDiagnostics.selectedFlightId) {
        const filteredPhotos = FlightDiagnostics.filterPhotosForCurrentFlight ? FlightDiagnostics.filterPhotosForCurrentFlight(data.manifest.photos) : data.manifest.photos;
        FlightDiagnostics.flightPhotos = filteredPhotos;
        FlightDiagnostics.flightPhotosFlightId = FlightDiagnostics.selectedFlightId;
        FlightDiagnostics.flightManifest = { ...data.manifest, photos: filteredPhotos, totalPhotos: filteredPhotos.length };
        activeInspectionManifest = FlightDiagnostics.flightManifest;
      } else {
        activeInspectionManifest = data.manifest;
      }
      if (typeof renderPhotoInspectionMapLayer === 'function') {
        renderPhotoInspectionMapLayer(activeInspectionManifest);
      }
      if (typeof FlightDiagnostics !== 'undefined' && FlightDiagnostics.renderInspectionPhotosUI) {
        FlightDiagnostics.renderInspectionPhotosUI();
      }
      if (dlBtn) {
        dlBtn.style.display = 'inline-flex';
        dlBtn.onclick = () => {
          window.location.href = `${apiBase}/api/media/archive-zip?uuid=${encodeURIComponent(data.missionUuid)}`;
        };
      }
    }

    if (data.wireframe && data.wireframe.success) {
      if (typeof FlightDiagnostics !== 'undefined' && FlightDiagnostics.loadWireframeGeometry) {
        FlightDiagnostics.loadWireframeGeometry(data.wireframe);
      }
    } else if (data.manifest && data.manifest.wireframe) {
      if (typeof FlightDiagnostics !== 'undefined' && FlightDiagnostics.loadWireframeGeometry) {
        FlightDiagnostics.loadWireframeGeometry(data.manifest.wireframe);
      }
    }
    return data;
  } catch (err) {
    isPulling = false;
    if (progressEs) { try { progressEs.close(); } catch (_) {} progressEs = null; }
    if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
    if (progText) progText.textContent = 'Ingest error: ' + err.message;
    throw err;
  } finally {
    if (startPullBtn) startPullBtn.disabled = false;
  }
}

// ─── Preflight Safety Checklist Gate Engine (Issue #99) ───────────────────────

const PREFLIGHT_GATE_ENABLED_KEY = 'aalaapi_preflight_gate_enabled';
const PREFLIGHT_OFFLINE_QUEUE_KEY = 'aalaapi_preflight_offline_queue';

const BUILTIN_CHECKLIST_TEMPLATE = [
  {
    phase: 'Pre-arrival',
    sort_order: 10,
    items: [
      { item_id: 'weather_brief', label: 'Weather & Solar Briefing', helper: 'Check NEXRAD, NWS warnings, wind speeds, and KP index.', required: true, auto_check: 'weather' },
      { item_id: 'airspace_laanc', label: 'Airspace & LAANC Authorization', helper: 'Verify active airspace authorization & facility map ceilings.', required: true, auto_check: 'airspace' },
      { item_id: 'notam_tfr_check', label: 'NOTAM / TFR Verification', helper: 'Confirm no active temporary flight restrictions in operational area.', required: true, auto_check: 'tfr' }
    ]
  },
  {
    phase: 'Unpacking',
    sort_order: 20,
    items: [
      { item_id: 'airframe_inspect', label: 'Airframe & Arms Inspection', helper: 'Check structure for cracks, stress, or loose motor mounts.', required: true },
      { item_id: 'propeller_inspect', label: 'Propeller Seat & Integrity', helper: 'Ensure props are locked, clean, and free of nicks or cracks.', required: true }
    ]
  },
  {
    phase: 'Hardware Inspection',
    sort_order: 30,
    items: [
      { item_id: 'lens_gimbal', label: 'Camera & Gimbal Cover', helper: 'Clean lens glass and remove gimbal clamp/protective shield.', required: true },
      { item_id: 'sd_card_space', label: 'High-Speed SD Storage', helper: 'Confirm formatted SD card installed with ample storage capacity.', required: true },
      { item_id: 'battery_seating', label: 'Battery Seating & Latches', helper: 'Latches engaged, clicked firmly, and zero terminal corrosion.', required: true }
    ]
  },
  {
    phase: 'Airspace & Weather',
    sort_order: 40,
    items: [
      { item_id: 'site_clearance', label: 'Landing Zone & Line of Sight', helper: 'Clear 15ft radius LZ, identify VLOS hazards and emergency landing spots.', required: true },
      { item_id: 'crew_brief', label: 'Visual Observer / Crew Brief', helper: 'Brief roles, emergency procedures, and lost-link protocols.', required: false }
    ]
  },
  {
    phase: 'Power-On & Calibration',
    sort_order: 50,
    items: [
      { item_id: 'controller_link', label: 'Remote Controller & App Link', helper: 'Telemetry live, battery > 50%, firmware matches aircraft.', required: true },
      { item_id: 'compass_gps_lock', label: 'Compass & GPS Satellite Lock', helper: 'Verify >= 12 satellites and home point updated on map HUD.', required: true },
      { item_id: 'rth_altitude_set', label: 'RTH Altitude Verification', helper: 'RTH altitude set higher than surrounding trees/structures.', required: true }
    ]
  }
];

const currentPreflightState = {
  signed: false,
  signedMissionHash: '',
  currentPhaseIndex: 0,
  template: BUILTIN_CHECKLIST_TEMPLATE,
  completedItems: new Map(), // item_id -> { passed, acknowledged, notes }
  operatorName: '',
  signatureData: '',
  laancCode: '',
  pendingAction: null,
  weatherWarningActive: false,
  weatherAckChecked: false,
  autoChecks: {}
};

function computeMissionSignature() {
  try {
    const rawWps = (typeof getCurrentWaypoints === 'function' ? getCurrentWaypoints() : null) || [];
    const center = (typeof centerMarker !== 'undefined' && centerMarker) ? centerMarker.getLatLng() : { lat: 0, lng: 0 };
    const altitude = document.getElementById('altitude')?.value || '50';
    const speed = document.getElementById('speed')?.value || '4';
    const pattern = document.getElementById('grid-type')?.value || 'grid';
    return `${center.lat.toFixed(5)}_${center.lng.toFixed(5)}_${pattern}_${altitude}_${speed}_wps${rawWps.length}`;
  } catch (e) {
    return `mission_${Date.now()}`;
  }
}

function isPreflightGateEnabled() {
  try {
    if (typeof localStorage === 'undefined') return true;
    return localStorage.getItem(PREFLIGHT_GATE_ENABLED_KEY) !== 'false';
  } catch (e) {
    return true;
  }
}

function setPreflightGateEnabled(enabled) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(PREFLIGHT_GATE_ENABLED_KEY, enabled ? 'true' : 'false');
    }
  } catch (e) {}
  const toggle = document.getElementById('preflight-gate-toggle');
  if (toggle) toggle.checked = enabled;
}

function isPreflightSigned() {
  if (!isPreflightGateEnabled()) return true;
  if (!currentPreflightState.signed) return false;
  const currentHash = computeMissionSignature();
  if (currentPreflightState.signedMissionHash !== currentHash) {
    invalidatePreflight();
    return false;
  }
  return true;
}

function invalidatePreflight() {
  currentPreflightState.signed = false;
  currentPreflightState.signedMissionHash = '';
  const badge = document.getElementById('preflight-status-badge');
  if (badge) {
    badge.textContent = 'PENDING SIGN-OFF';
    badge.style.background = 'rgba(245, 158, 11, 0.15)';
    badge.style.color = '#fbbf24';
    badge.style.borderColor = 'rgba(245, 158, 11, 0.3)';
  }
}

function withPreflightGate(actionFn) {
  if (typeof actionFn !== 'function') return;
  if (isPreflightSigned()) {
    actionFn();
  } else {
    showPreflightGateModal(actionFn);
  }
}

async function loadPreflightTemplate() {
  if (typeof isCompanionOnline !== 'undefined' && isCompanionOnline && typeof getBridgeProxyUrl === 'function') {
    try {
      const resp = await fetch(getBridgeProxyUrl('/api/checklist/template'));
      if (resp.ok) {
        const data = await resp.json();
        if (data && data.success && Array.isArray(data.template) && data.template.length > 0) {
          currentPreflightState.template = data.template;
          return data.template;
        }
      }
    } catch (_) {}
  }
  currentPreflightState.template = BUILTIN_CHECKLIST_TEMPLATE;
  return BUILTIN_CHECKLIST_TEMPLATE;
}

async function runPreflightAutoChecks() {
  const weatherBadge = document.getElementById('preflight-weather-badge');
  const weatherDesc = document.getElementById('preflight-weather-desc');
  const weatherAckContainer = document.getElementById('preflight-weather-ack-container');
  const airspaceBadge = document.getElementById('preflight-airspace-badge');
  const airspaceDesc = document.getElementById('preflight-airspace-desc');

  let weatherStatus = { ok: true, text: 'Favorable (VFR)', desc: 'Wind speeds within tolerance, zero NEXRAD precipitation.', warn: false };
  let airspaceStatus = { ok: true, text: 'Clear / Class G', desc: 'Viewport clear of restricted zones or LAANC facility map ceilings.' };

  if (typeof isCompanionOnline !== 'undefined' && isCompanionOnline && typeof getBridgeProxyUrl === 'function') {
    try {
      const laancVal = (document.getElementById('preflight-laanc-input')?.value || currentPreflightState.laancCode || '').trim();
      const resp = await fetch(getBridgeProxyUrl(`/api/checklist/autochecks?laanc=${encodeURIComponent(laancVal)}`));
      if (resp.ok) {
        const data = await resp.json();
        currentPreflightState.autoChecks = data;
        if (data.weather) {
          const w = data.weather;
          if (w.windSpeedMph >= 20 || w.hasPrecipitation || (w.hazards && w.hazards.length > 0)) {
            weatherStatus = {
              ok: false,
              warn: true,
              text: 'WEATHER ADVISORY WARNING',
              desc: `Wind: ${w.windSpeedMph || 0} mph | Precip: ${w.hasPrecipitation ? 'Active' : 'None'} | Hazards: ${w.hazards ? w.hazards.length : 0}`
            };
          }
        }
        if (data.airspace && data.airspace.laanc_code && data.airspace.auth_found) {
          airspaceStatus.desc += ` (LAANC Auth Record Found: ${data.airspace.laanc_code})`;
        }
      }
    } catch (_) {}
  }

  // Client-side airspace checks
  if (typeof uasFacilityMapEnabled !== 'undefined' && uasFacilityMapEnabled) {
    const laancCode = (document.getElementById('preflight-laanc-input')?.value || '').trim();
    if (!laancCode) {
      airspaceStatus = {
        ok: false,
        text: 'LAANC Zone Active (Code Needed)',
        desc: 'UAS Facility Map grid is active on viewport. Enter active LAANC authorization code below.'
      };
    }
  }

  currentPreflightState.weatherWarningActive = weatherStatus.warn;

  if (weatherBadge && weatherDesc) {
    weatherBadge.textContent = weatherStatus.text;
    weatherBadge.style.color = weatherStatus.warn ? '#ef4444' : '#4ade80';
    weatherDesc.textContent = weatherStatus.desc;
  }

  if (weatherAckContainer) {
    if (weatherStatus.warn) {
      weatherAckContainer.classList.remove('hidden');
    } else {
      weatherAckContainer.classList.add('hidden');
    }
  }

  if (airspaceBadge && airspaceDesc) {
    airspaceBadge.textContent = airspaceStatus.text;
    airspaceBadge.style.color = airspaceStatus.ok ? '#4ade80' : '#fbbf24';
    airspaceDesc.textContent = airspaceStatus.desc;
  }
}

function initSignatureCanvas() {
  const canvas = document.getElementById('preflight-signature-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let isDrawing = false;

  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height)
    };
  }

  function startDraw(e) {
    e.preventDefault();
    isDrawing = true;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  }

  function draw(e) {
    if (!isDrawing) return;
    e.preventDefault();
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  }

  function stopDraw(e) {
    if (isDrawing) {
      isDrawing = false;
      currentPreflightState.signatureData = canvas.toDataURL();
    }
  }

  canvas.onmousedown = startDraw;
  canvas.onmousemove = draw;
  canvas.onmouseup = stopDraw;
  canvas.onmouseleave = stopDraw;

  canvas.ontouchstart = startDraw;
  canvas.ontouchmove = draw;
  canvas.ontouchend = stopDraw;

  const clearBtn = document.getElementById('preflight-signature-clear-btn');
  if (clearBtn) {
    clearBtn.onclick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      currentPreflightState.signatureData = '';
    };
  }
}

function renderPreflightStepper() {
  const container = document.getElementById('preflight-stepper-container');
  if (!container) return;
  container.innerHTML = '';

  const template = currentPreflightState.template;
  template.forEach((group, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `btn-secondary ${idx === currentPreflightState.currentPhaseIndex ? 'active' : ''}`;
    btn.style.cssText = `font-size: 0.7rem; padding: 4px 10px; border-radius: 6px; white-space: nowrap; ${idx === currentPreflightState.currentPhaseIndex ? 'background: rgba(6, 182, 212, 0.2); border-color: #06b6d4; color: #22d3ee; font-weight: 700;' : ''}`;
    btn.innerHTML = `<span style="opacity: 0.7;">${idx + 1}.</span> ${group.phase}`;
    btn.onclick = () => {
      currentPreflightState.currentPhaseIndex = idx;
      renderPreflightPhase(idx);
      renderPreflightStepper();
    };
    container.appendChild(btn);
  });

  // Final Sign-Off Step
  const signBtn = document.createElement('button');
  signBtn.type = 'button';
  signBtn.className = `btn-secondary ${currentPreflightState.currentPhaseIndex === template.length ? 'active' : ''}`;
  signBtn.style.cssText = `font-size: 0.7rem; padding: 4px 10px; border-radius: 6px; white-space: nowrap; ${currentPreflightState.currentPhaseIndex === template.length ? 'background: rgba(34, 197, 94, 0.2); border-color: #22c55e; color: #4ade80; font-weight: 700;' : ''}`;
  signBtn.innerHTML = `✍️ Sign &amp; Export`;
  signBtn.onclick = () => {
    currentPreflightState.currentPhaseIndex = template.length;
    renderPreflightPhase(template.length);
    renderPreflightStepper();
  };
  container.appendChild(signBtn);
}

function renderPreflightPhase(index) {
  const phaseContainer = document.getElementById('preflight-phase-container');
  const autochecksCard = document.getElementById('preflight-autochecks-card');
  const signatureCard = document.getElementById('preflight-signature-card');
  const prevBtn = document.getElementById('preflight-prev-btn');
  const nextBtn = document.getElementById('preflight-next-btn');
  const submitBtn = document.getElementById('preflight-submit-btn');

  if (!phaseContainer) return;
  phaseContainer.innerHTML = '';

  const template = currentPreflightState.template;
  const isFinalStep = index >= template.length;

  if (prevBtn) prevBtn.style.display = index > 0 ? 'inline-block' : 'none';
  if (nextBtn) nextBtn.style.display = isFinalStep ? 'none' : 'inline-block';
  if (submitBtn) submitBtn.style.display = isFinalStep ? 'inline-block' : 'none';

  if (!isFinalStep) {
    if (autochecksCard) autochecksCard.style.display = 'flex';
    if (signatureCard) signatureCard.style.display = 'none';

    const group = template[index];
    if (!group) return;

    const header = document.createElement('div');
    header.style.cssText = 'font-size: 0.82rem; font-weight: 700; color: var(--text-main); display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 6px; margin-bottom: 4px;';
    header.innerHTML = `<span>Phase ${index + 1}: ${group.phase}</span><span style="font-size: 0.68rem; color: var(--text-muted); font-weight: 400;">Items ${group.items.length}</span>`;
    phaseContainer.appendChild(header);

    group.items.forEach(item => {
      const state = currentPreflightState.completedItems.get(item.item_id) || { passed: false, acknowledged: false, notes: '' };

      const row = document.createElement('div');
      row.style.cssText = 'background: rgba(15, 23, 42, 0.7); border: 1px solid var(--border-color); border-radius: 8px; padding: 10px 12px; display: flex; flex-direction: column; gap: 6px;';

      const labelRow = document.createElement('div');
      labelRow.style.cssText = 'display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;';

      const labelLeft = document.createElement('label');
      labelLeft.style.cssText = 'font-size: 0.78rem; color: var(--text-main); font-weight: 600; display: flex; align-items: flex-start; gap: 8px; cursor: pointer; flex: 1;';
      
      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.checked = state.passed;
      chk.style.cssText = 'margin-top: 2px; accent-color: #22c55e; width: 15px; height: 15px; cursor: pointer;';
      chk.onchange = () => {
        state.passed = chk.checked;
        currentPreflightState.completedItems.set(item.item_id, state);
      };

      const labelText = document.createElement('div');
      labelText.innerHTML = `<span style="color: var(--text-main); font-weight: 700;">${item.label}</span> ${item.required ? '<span style="color:#ef4444;">*</span>' : ''}<br><span style="font-size: 0.72rem; color: var(--text-muted); font-weight: 400;">${item.helper || ''}</span>`;

      labelLeft.appendChild(chk);
      labelLeft.appendChild(labelText);
      labelRow.appendChild(labelLeft);

      const notesInput = document.createElement('input');
      notesInput.type = 'text';
      notesInput.placeholder = 'Notes / Exception Acknowledgement...';
      notesInput.value = state.notes || '';
      notesInput.style.cssText = 'font-size: 0.72rem; padding: 4px 8px; border-radius: 4px; border: 1px solid var(--border-color); background: rgba(255,255,255,0.05); color: var(--text-main); margin-top: 2px;';
      notesInput.oninput = () => {
        state.notes = notesInput.value.trim();
        state.acknowledged = Boolean(state.notes);
        currentPreflightState.completedItems.set(item.item_id, state);
      };

      row.appendChild(labelRow);
      row.appendChild(notesInput);
      phaseContainer.appendChild(row);
    });
  } else {
    // Final Step (Signature)
    if (autochecksCard) autochecksCard.style.display = 'flex';
    if (signatureCard) signatureCard.style.display = 'flex';

    const infoBox = document.createElement('div');
    infoBox.style.cssText = 'background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.3); border-radius: 8px; padding: 10px 12px; font-size: 0.76rem; color: #4ade80; line-height: 1.4;';
    infoBox.innerHTML = `<strong>✅ Ready for Sign-Off:</strong> Enter your full legal name or FAA Part 107 license ID, draw your digital signature, and tap <strong>Sign &amp; Proceed to Export</strong> to lock the compliance record and execute mission export.`;
    phaseContainer.appendChild(infoBox);
  }
}

async function showPreflightGateModal(onPassCallback = null) {
  const modal = document.getElementById('preflight-modal');
  if (!modal) return;

  currentPreflightState.pendingAction = onPassCallback;
  currentPreflightState.currentPhaseIndex = 0;

  // Restore stored gate toggle
  const gateToggle = document.getElementById('preflight-gate-toggle');
  if (gateToggle) {
    gateToggle.checked = isPreflightGateEnabled();
    gateToggle.onchange = () => setPreflightGateEnabled(gateToggle.checked);
  }

  await loadPreflightTemplate();
  await runPreflightAutoChecks();

  renderPreflightStepper();
  renderPreflightPhase(0);
  initSignatureCanvas();

  modal.classList.remove('hidden');

  // Wire prev/next buttons
  const prevBtn = document.getElementById('preflight-prev-btn');
  const nextBtn = document.getElementById('preflight-next-btn');
  const submitBtn = document.getElementById('preflight-submit-btn');

  if (prevBtn) {
    prevBtn.onclick = () => {
      if (currentPreflightState.currentPhaseIndex > 0) {
        currentPreflightState.currentPhaseIndex--;
        renderPreflightPhase(currentPreflightState.currentPhaseIndex);
        renderPreflightStepper();
      }
    };
  }

  if (nextBtn) {
    nextBtn.onclick = () => {
      if (currentPreflightState.currentPhaseIndex < currentPreflightState.template.length) {
        currentPreflightState.currentPhaseIndex++;
        renderPreflightPhase(currentPreflightState.currentPhaseIndex);
        renderPreflightStepper();
      }
    };
  }

  if (submitBtn) {
    submitBtn.onclick = submitPreflightChecklist;
  }
}

async function submitPreflightChecklist() {
  const operatorInput = document.getElementById('preflight-operator-input');
  const operatorName = (operatorInput?.value || currentPreflightState.operatorName || '').trim();

  if (!operatorName) {
    alert('Please enter the Pilot in Command / Operator Name before signing.');
    if (operatorInput) operatorInput.focus();
    return;
  }

  if (!currentPreflightState.signatureData) {
    alert('Please draw your digital signature in the signature pad.');
    return;
  }

  if (currentPreflightState.weatherWarningActive) {
    const ackChk = document.getElementById('preflight-weather-ack-checkbox');
    if (ackChk && !ackChk.checked) {
      alert('Weather warning active. Please check the Pilot Weather Acknowledgement box to proceed.');
      return;
    }
  }

  // Validate required phase items
  const template = currentPreflightState.template;
  const completedList = [];

  for (const group of template) {
    for (const item of group.items) {
      const state = currentPreflightState.completedItems.get(item.item_id) || { passed: false, acknowledged: false, notes: '' };
      if (item.required && !state.passed && !state.notes) {
        alert(`Required item '${item.label}' in phase '${group.phase}' must be checked or acknowledged with notes.`);
        return;
      }
      completedList.push({
        item_id: item.item_id,
        passed: Boolean(state.passed),
        acknowledged: Boolean(state.notes),
        notes: state.notes || ''
      });
    }
  }

  const laancCode = (document.getElementById('preflight-laanc-input')?.value || '').trim();

  const payload = {
    log_id: `chk_${Date.now()}`,
    timestamp: new Date().toISOString(),
    operator_name: operatorName,
    signature: currentPreflightState.signatureData,
    mission_id: `mission_${Date.now()}`,
    kmz_filename: 'AalaapiSky_Mission.kmz',
    airspace_auth_code: laancCode,
    completed_items: completedList,
    auto_checks: currentPreflightState.autoChecks
  };

  // Submit to bridge if online, else queue locally
  if (typeof isCompanionOnline !== 'undefined' && isCompanionOnline && typeof getBridgeProxyUrl === 'function') {
    try {
      await fetch(getBridgeProxyUrl('/api/checklist/submit'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (_) {
      queuePreflightLogLocally(payload);
    }
  } else {
    queuePreflightLogLocally(payload);
  }

  // Mark session signed
  currentPreflightState.signed = true;
  currentPreflightState.signedMissionHash = computeMissionSignature();
  currentPreflightState.operatorName = operatorName;

  const badge = document.getElementById('preflight-status-badge');
  if (badge) {
    badge.textContent = 'SIGNED & VERIFIED';
    badge.style.background = 'rgba(34, 197, 94, 0.15)';
    badge.style.color = '#4ade80';
    badge.style.borderColor = 'rgba(34, 197, 94, 0.3)';
  }

  const modal = document.getElementById('preflight-modal');
  if (modal) modal.classList.add('hidden');

  if (typeof showToast === 'function') {
    showToast('Preflight checklist signed and recorded. Proceeding to export...', 2500);
  }

  if (typeof currentPreflightState.pendingAction === 'function') {
    const action = currentPreflightState.pendingAction;
    currentPreflightState.pendingAction = null;
    action();
  }
}

function queuePreflightLogLocally(payload) {
  try {
    if (typeof localStorage === 'undefined') return;
    const existing = JSON.parse(localStorage.getItem(PREFLIGHT_OFFLINE_QUEUE_KEY) || '[]');
    existing.unshift(payload);
    localStorage.setItem(PREFLIGHT_OFFLINE_QUEUE_KEY, JSON.stringify(existing.slice(0, 50)));
  } catch (_) {}
}

async function flushOfflinePreflightQueue() {
  if (typeof isCompanionOnline === 'undefined' || !isCompanionOnline || typeof getBridgeProxyUrl !== 'function') return;
  try {
    if (typeof localStorage === 'undefined') return;
    const queue = JSON.parse(localStorage.getItem(PREFLIGHT_OFFLINE_QUEUE_KEY) || '[]');
    if (!Array.isArray(queue) || queue.length === 0) return;

    for (const log of queue) {
      try {
        await fetch(getBridgeProxyUrl('/api/checklist/submit'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(log)
        });
      } catch (_) {}
    }
    localStorage.removeItem(PREFLIGHT_OFFLINE_QUEUE_KEY);
  } catch (_) {}
}

async function openPreflightHistoryModal() {
  const modal = document.getElementById('preflight-history-modal');
  const list = document.getElementById('preflight-history-list');
  if (!modal || !list) return;

  list.innerHTML = '<div style="color: var(--text-muted); font-size: 0.78rem;">Loading audit history...</div>';
  modal.classList.remove('hidden');

  let logs = [];

  if (typeof isCompanionOnline !== 'undefined' && isCompanionOnline && typeof getBridgeProxyUrl === 'function') {
    try {
      const resp = await fetch(getBridgeProxyUrl('/api/checklist/history?limit=50'));
      if (resp.ok) {
        const data = await resp.json();
        if (data && Array.isArray(data.logs)) logs = data.logs;
      }
    } catch (_) {}
  }

  if (logs.length === 0 && typeof localStorage !== 'undefined') {
    try {
      logs = JSON.parse(localStorage.getItem(PREFLIGHT_OFFLINE_QUEUE_KEY) || '[]');
    } catch (_) {}
  }

  list.innerHTML = '';
  if (logs.length === 0) {
    list.innerHTML = '<div style="color: var(--text-muted); font-size: 0.78rem; text-align: center; padding: 20px;">No preflight checklist logs recorded yet.</div>';
    return;
  }

  logs.forEach(log => {
    const card = document.createElement('div');
    card.style.cssText = 'background: rgba(15, 23, 42, 0.7); border: 1px solid var(--border-color); border-radius: 8px; padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; font-size: 0.76rem;';
    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <strong style="color: var(--text-main); font-size: 0.82rem;">🧑‍✈️ ${log.operator_name || 'Pilot'}</strong>
        <span style="color: var(--text-muted); font-size: 0.7rem;">${new Date(log.timestamp).toLocaleString()}</span>
      </div>
      <div style="color: var(--text-muted); font-size: 0.72rem; display: flex; gap: 12px;">
        <span><strong>LAANC:</strong> ${log.airspace_auth_code || 'N/A'}</span>
        <span><strong>Log ID:</strong> ${log.log_id || 'N/A'}</span>
      </div>
    `;
    list.appendChild(card);
  });
}

function initPreflightEventListeners() {
  const closeBtn = document.getElementById('preflight-close-btn');
  if (closeBtn) {
    closeBtn.onclick = () => {
      const modal = document.getElementById('preflight-modal');
      if (modal) modal.classList.add('hidden');
    };
  }

  const preflightGateBtn = document.getElementById('preflight-gate-btn');
  if (preflightGateBtn) {
    preflightGateBtn.onclick = () => showPreflightGateModal();
  }

  const viewHistoryBtn = document.getElementById('preflight-view-history-btn');
  if (viewHistoryBtn) {
    viewHistoryBtn.onclick = openPreflightHistoryModal;
  }

  const historyCloseBtn = document.getElementById('preflight-history-close-btn');
  if (historyCloseBtn) {
    historyCloseBtn.onclick = () => {
      const modal = document.getElementById('preflight-history-modal');
      if (modal) modal.classList.add('hidden');
    };
  }

  const refreshAutochecksBtn = document.getElementById('preflight-refresh-autochecks-btn');
  if (refreshAutochecksBtn) {
    refreshAutochecksBtn.onclick = runPreflightAutoChecks;
  }
}

if (typeof window !== 'undefined') {
  window.TagDetector = typeof TagDetector !== 'undefined' ? TagDetector : null;
  window.PhotoInspector = typeof PhotoInspector !== 'undefined' ? PhotoInspector : null;
  window.openRc2LogManagerModal = openRc2LogManagerModal;
  window.closeRc2LogManagerModal = closeRc2LogManagerModal;
  window.refreshRc2LogList = refreshRc2LogList;
  window.pullSpecificRc2Log = pullSpecificRc2Log;
  window.pullAllRc2Logs = pullAllRc2Logs;
  window.loadRc2LogToDiagnostics = loadRc2LogToDiagnostics;
  window.executeMediaPull = executeMediaPull;
  window.safeJsonStringify = safeJsonStringify;
  window.buildThreeDigitalTwinJson = buildThreeDigitalTwinJson;
  window.AdsbAirspaceManager = typeof AdsbAirspaceManager !== 'undefined' ? AdsbAirspaceManager : null;
  window.isLocalhostEnvironment = typeof isLocalhostEnvironment !== 'undefined' ? isLocalhostEnvironment : null;
  window.SolarEphemeris = typeof SolarEphemeris !== 'undefined' ? SolarEphemeris : null;
  window.updateSolarEphemeris = typeof updateSolarEphemeris !== 'undefined' ? updateSolarEphemeris : null;
  window.updateMcpMonitorUI = typeof updateMcpMonitorUI !== 'undefined' ? updateMcpMonitorUI : null;
  window.showPreflightGateModal = typeof showPreflightGateModal !== 'undefined' ? showPreflightGateModal : null;
  window.isPreflightSigned = typeof isPreflightSigned !== 'undefined' ? isPreflightSigned : null;
  window.withPreflightGate = typeof withPreflightGate !== 'undefined' ? withPreflightGate : null;
  window.setPreflightGateEnabled = typeof setPreflightGateEnabled !== 'undefined' ? setPreflightGateEnabled : null;
  window.isPreflightGateEnabled = typeof isPreflightGateEnabled !== 'undefined' ? isPreflightGateEnabled : null;
  window.computeMissionSignature = typeof computeMissionSignature !== 'undefined' ? computeMissionSignature : null;
  window.invalidatePreflight = typeof invalidatePreflight !== 'undefined' ? invalidatePreflight : null;
}

if (typeof global !== 'undefined') {
  global.TagDetector = typeof TagDetector !== 'undefined' ? TagDetector : null;
  global.PhotoInspector = typeof PhotoInspector !== 'undefined' ? PhotoInspector : null;
  global.openRc2LogManagerModal = openRc2LogManagerModal;
  global.closeRc2LogManagerModal = closeRc2LogManagerModal;
  global.refreshRc2LogList = refreshRc2LogList;
  global.pullSpecificRc2Log = pullSpecificRc2Log;
  global.pullAllRc2Logs = pullAllRc2Logs;
  global.loadRc2LogToDiagnostics = loadRc2LogToDiagnostics;
  global.executeMediaPull = executeMediaPull;
  global.safeJsonStringify = safeJsonStringify;
  global.buildThreeDigitalTwinJson = buildThreeDigitalTwinJson;
  global.AdsbAirspaceManager = typeof AdsbAirspaceManager !== 'undefined' ? AdsbAirspaceManager : null;
  global.isLocalhostEnvironment = typeof isLocalhostEnvironment !== 'undefined' ? isLocalhostEnvironment : null;
  global.SolarEphemeris = typeof SolarEphemeris !== 'undefined' ? SolarEphemeris : null;
  global.updateSolarEphemeris = typeof updateSolarEphemeris !== 'undefined' ? updateSolarEphemeris : null;
  global.deleteFlightWaypoint = typeof deleteFlightWaypoint !== 'undefined' ? deleteFlightWaypoint : null;
  global.updateMcpMonitorUI = typeof updateMcpMonitorUI !== 'undefined' ? updateMcpMonitorUI : null;
  global.showPreflightGateModal = typeof showPreflightGateModal !== 'undefined' ? showPreflightGateModal : null;
  global.isPreflightSigned = typeof isPreflightSigned !== 'undefined' ? isPreflightSigned : null;
  global.withPreflightGate = typeof withPreflightGate !== 'undefined' ? withPreflightGate : null;
  global.setPreflightGateEnabled = typeof setPreflightGateEnabled !== 'undefined' ? setPreflightGateEnabled : null;
  global.isPreflightGateEnabled = typeof isPreflightGateEnabled !== 'undefined' ? isPreflightGateEnabled : null;
  global.computeMissionSignature = typeof computeMissionSignature !== 'undefined' ? computeMissionSignature : null;
  global.invalidatePreflight = typeof invalidatePreflight !== 'undefined' ? invalidatePreflight : null;
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    const closeRc2LogsBtn = document.getElementById('close-rc2-logs-modal-btn');
    if (closeRc2LogsBtn) closeRc2LogsBtn.addEventListener('click', closeRc2LogManagerModal);

    const closeRc2LogsFooterBtn = document.getElementById('close-rc2-logs-footer-btn');
    if (closeRc2LogsFooterBtn) closeRc2LogsFooterBtn.addEventListener('click', closeRc2LogManagerModal);

    const rc2LogsRefreshBtn = document.getElementById('rc2-logs-refresh-btn');
    if (rc2LogsRefreshBtn) rc2LogsRefreshBtn.addEventListener('click', refreshRc2LogList);

    const rc2LogsPullAllBtn = document.getElementById('rc2-logs-pull-all-btn');
    if (rc2LogsPullAllBtn) rc2LogsPullAllBtn.addEventListener('click', pullAllRc2Logs);

    const rc2LogsSearchInput = document.getElementById('rc2-logs-search');
    if (rc2LogsSearchInput) {
      rc2LogsSearchInput.addEventListener('input', () => renderRc2LogTable(rc2LogsCache));
    }

    const ingestBtn = document.getElementById('direct-rc2-photos-btn');
    if (ingestBtn) ingestBtn.addEventListener('click', openMediaIngestModal);

    const menuPhotoBtn = document.getElementById('more-menu-photos-btn');
    if (menuPhotoBtn) menuPhotoBtn.addEventListener('click', openMediaIngestModal);

    const dockPhotoBtn = document.getElementById('dock-photos-btn');
    if (dockPhotoBtn) dockPhotoBtn.addEventListener('click', openMediaIngestModal);

    const closeIngestBtn = document.getElementById('close-media-ingest-modal-btn');
    if (closeIngestBtn) closeIngestBtn.addEventListener('click', closeMediaIngestModal);

    const closeIngestFooter = document.getElementById('close-media-ingest-footer-btn');
    if (closeIngestFooter) closeIngestFooter.addEventListener('click', closeMediaIngestModal);

    const rescanBtn = document.getElementById('media-rescan-btn');
    if (rescanBtn) rescanBtn.addEventListener('click', scanMediaDevices);

    const startPullBtn = document.getElementById('start-media-pull-btn');
    if (startPullBtn) {
      startPullBtn.addEventListener('click', executeMediaPull);
    }
  });
}

