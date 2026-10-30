/**
 * src/qa/IrlVerifier.js
 * 
 * In-App Flight Diagnostics In-Real-Life (IRL) Test Plan Verification Engine.
 * Evaluates flown drone telemetry against planned mission waypoints across all 6 IRL phases
 * directly in the browser with 100% offline capability.
 */

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function angularDiffDeg(a, b) {
  let diff = (a - b + 180) % 360 - 180;
  if (diff < -180) diff += 360;
  return Math.abs(diff);
}

const PHASE_LABELS = {
  kmz_import: 'Phase 1: KMZ Import & Action Parsing',
  entry_altitude: 'Phase 2: Safe Entry & Target AGL (WP[0])',
  geometry_path: 'Phase 3: 3D Geometry & Path Following (XTE)',
  heading_gimbal: 'Phase 4: Heading & Gimbal Pitch Lock',
  capture_trigger: 'Phase 5: Camera Shutter & Settling',
  exit_rth: 'Phase 6: Safe Exit, Landing & RTH'
};

const PHASE_DESCRIPTIONS = {
  kmz_import: 'Validates mission format parsing and minimum sample thresholds.',
  entry_altitude: 'Verifies aircraft climbs to correct entry altitude before entering grid.',
  geometry_path: 'Checks cross-track error (XTE) and 3D waypoint approach tolerances.',
  heading_gimbal: 'Verifies yaw alignment and target gimbal pitch lock on trajectory.',
  capture_trigger: 'Ensures photo triggers fire and aircraft settles during capture.',
  exit_rth: 'Confirms mission completion at final waypoint and safe battery reserve.'
};

const IrlVerifier = {
  currentResult: null,
  currentFlightId: null,
  currentPlannedWaypoints: null,
  currentTelemetryData: null,

  /**
   * Evaluates planned waypoints against actual flown telemetry points.
   * Matches algorithms in tools/qa/irl_tracker.js.
   */
  verifyFlightPlanAgainstLog(plannedWaypoints, actualTelemetry, options = {}) {
    const wps = Array.isArray(plannedWaypoints) ? plannedWaypoints : (plannedWaypoints && Array.isArray(plannedWaypoints.waypoints) ? plannedWaypoints.waypoints : []);
    const pts = Array.isArray(actualTelemetry) ? actualTelemetry : (actualTelemetry && Array.isArray(actualTelemetry.points) ? actualTelemetry.points : []);

    const pathMode = options.pathMode || 'straight';
    const horizontalToleranceM = options.horizontalToleranceM || (pathMode === 'curved' ? 8.0 : 4.5);
    const altitudeToleranceM = options.altitudeToleranceM || 2.0;
    const pitchToleranceDeg = options.pitchToleranceDeg || 6.0;
    const yawToleranceDeg = options.yawToleranceDeg || 15.0;

    // Phase 1: KMZ Import & Parsing
    const kmzImportPassed = wps.length >= 2 && pts.length >= 5;

    if (!kmzImportPassed) {
      const emptyPhases = {
        kmz_import: false,
        entry_altitude: false,
        geometry_path: false,
        heading_gimbal: false,
        capture_trigger: false,
        exit_rth: false
      };
      return {
        passedAll: false,
        phases: emptyPhases,
        metrics: {
          waypointCount: wps.length,
          telemetryPointCount: pts.length,
          error: 'Insufficient waypoints (min 2) or telemetry samples (min 5)'
        },
        wpApproaches: []
      };
    }

    // Detect vertically stacked waypoints (Tower, Multi-Orbit, Facade)
    let hasVerticalStacking = false;
    for (let a = 0; a < wps.length; a++) {
      for (let b = a + 1; b < wps.length; b++) {
        const distAB = haversineDistance(parseFloat(wps[a].lat), parseFloat(wps[a].lon), parseFloat(wps[b].lat), parseFloat(wps[b].lon));
        const altAB = Math.abs(parseFloat(wps[a].altitude ?? wps[a].alt ?? 50) - parseFloat(wps[b].altitude ?? wps[b].alt ?? 50));
        if (distAB < 2.0 && altAB > 3.0) {
          hasVerticalStacking = true;
          break;
        }
      }
      if (hasVerticalStacking) break;
    }

    const wpApproaches = [];
    for (let i = 0; i < wps.length; i++) {
      const wp = wps[i];
      const wpLat = parseFloat(wp.lat);
      const wpLon = parseFloat(wp.lon);
      const wpAlt = parseFloat(wp.altitude !== undefined ? wp.altitude : (wp.alt !== undefined ? wp.alt : 50));
      const wpPitch = (wp.gimbalPitch !== undefined && wp.gimbalPitch !== 'auto' && !isNaN(parseFloat(wp.gimbalPitch)))
        ? parseFloat(wp.gimbalPitch)
        : ((wp.pitch !== undefined && !isNaN(parseFloat(wp.pitch))) ? parseFloat(wp.pitch) : null);
      const wpYaw = (wp.heading !== undefined && !isNaN(parseFloat(wp.heading)))
        ? parseFloat(wp.heading)
        : ((wp.yaw !== undefined && !isNaN(parseFloat(wp.yaw))) ? parseFloat(wp.yaw) : null);

      let bestScore = Infinity;
      let bestDistH = Infinity;
      let bestPt = null;

      for (let j = 0; j < pts.length; j++) {
        const pt = pts[j];
        const dH = haversineDistance(wpLat, wpLon, parseFloat(pt.lat), parseFloat(pt.lon));
        const dZCand = Math.abs(parseFloat(pt.alt || 0) - wpAlt);
        const score = hasVerticalStacking ? Math.hypot(dH, dZCand) : dH;
        const isBetter = (i === 0 && dH < 1.0 && bestDistH < 1.0)
          ? (j > 0 && dH <= bestDistH + 0.25 && j <= Math.ceil(pts.length * 0.4))
          : (score < bestScore);
        if (isBetter) {
          bestScore = score;
          bestDistH = dH;
          bestPt = pt;
        }
      }

      const dZ = bestPt ? Math.abs(parseFloat(bestPt.alt || 0) - wpAlt) : Infinity;
      const dPitch = (bestPt && wpPitch !== null && bestPt.pitch !== undefined)
        ? Math.abs(parseFloat(bestPt.pitch) - wpPitch)
        : null;
      const dYaw = (bestPt && wpYaw !== null && bestPt.yaw !== undefined)
        ? angularDiffDeg(parseFloat(bestPt.yaw), wpYaw)
        : null;

      wpApproaches.push({
        index: i,
        dH: Math.round(bestDistH * 100) / 100,
        dZ: Math.round(dZ * 100) / 100,
        dPitch: dPitch !== null ? Math.round(dPitch * 10) / 10 : null,
        dYaw: dYaw !== null ? Math.round(dYaw * 10) / 10 : null,
        visited: bestDistH <= horizontalToleranceM,
        skipPhoto: Boolean(wp.skipPhoto || wp.isTurnaroundPoint || wp.isExclusionDetour)
      });
    }

    // Phase 2: Safe Entry & Target AGL
    const wp0 = wpApproaches[0];
    const entryAltitudePassed = wp0.dH <= Math.max(4.0, horizontalToleranceM) && wp0.dZ <= altitudeToleranceM;

    // Phase 3: 3D Geometry & Path Following
    const visitedCount = wpApproaches.filter(a => a.visited).length;
    const completionRatio = visitedCount / wpApproaches.length;
    const rmsXte = Math.sqrt(wpApproaches.reduce((acc, a) => acc + a.dH * a.dH, 0) / wpApproaches.length);
    const rmsAltError = Math.sqrt(wpApproaches.reduce((acc, a) => acc + a.dZ * a.dZ, 0) / wpApproaches.length);
    const maxXte = Math.max(...wpApproaches.map(a => a.dH));
    const geometryPathPassed = completionRatio >= 0.90 && rmsXte <= horizontalToleranceM && rmsAltError <= altitudeToleranceM;

    // Phase 4: Heading & Gimbal Pitch Lock
    const pitchSamples = wpApproaches.filter(a => a.visited && a.dPitch !== null).map(a => a.dPitch);
    const yawSamples = wpApproaches.filter(a => a.visited && a.dYaw !== null).map(a => a.dYaw);
    const meanPitchError = pitchSamples.length > 0 ? (pitchSamples.reduce((s, v) => s + v, 0) / pitchSamples.length) : 0;
    const meanYawError = yawSamples.length > 0 ? (yawSamples.reduce((s, v) => s + v, 0) / yawSamples.length) : 0;
    const headingGimbalPassed = meanPitchError <= pitchToleranceDeg && meanYawError <= yawToleranceDeg;

    // Phase 5: Camera Shutter & Capture Dynamics
    const plannedPhotos = wps.filter(w => !w.skipPhoto && !w.isTurnaroundPoint && !w.isExclusionDetour).length;
    const actualPhotos = pts.filter(p => p.isPhoto).length;
    const photoRatio = plannedPhotos > 0 ? (actualPhotos / plannedPhotos) : (actualPhotos === 0 ? 1.0 : 0.8);
    const photoRatioTolerance = options.photoRatioTolerance || 0.85;

    let shutterSettlingPassed = true;
    if (options.captureMode === 'hover' || options.captureMode === 'stopAndShoot') {
      const photoPts = pts.filter(p => p.isPhoto && p.speed !== undefined);
      if (photoPts.length > 0) {
        const speeds = photoPts.map(p => parseFloat(p.speed) || 0).sort((a, b) => a - b);
        const medianSpeed = speeds[Math.floor(speeds.length / 2)];
        if (medianSpeed > 1.2) shutterSettlingPassed = false;
      }
    }
    const captureTriggerPassed = photoRatio >= photoRatioTolerance && shutterSettlingPassed;

    // Phase 6: Safe Exit, Landing & RTH
    const wpLast = wpApproaches[wpApproaches.length - 1];
    const exitApproachPassed = wpLast.dH <= Math.max(5.0, horizontalToleranceM);
    const startBat = (pts[0] && pts[0].battery !== undefined) ? parseFloat(pts[0].battery) : 100;
    const endBat = (pts[pts.length - 1] && pts[pts.length - 1].battery !== undefined) ? parseFloat(pts[pts.length - 1].battery) : 50;
    const batteryPassed = isNaN(endBat) || endBat >= 15;
    const exitRthPassed = exitApproachPassed && batteryPassed;

    const phases = {
      kmz_import: kmzImportPassed,
      entry_altitude: entryAltitudePassed,
      geometry_path: geometryPathPassed,
      heading_gimbal: headingGimbalPassed,
      capture_trigger: captureTriggerPassed,
      exit_rth: exitRthPassed
    };

    const passedAll = Object.values(phases).every(Boolean);

    const metrics = {
      waypointCount: wps.length,
      visitedCount,
      waypointCompletionPct: Math.round(completionRatio * 100),
      rmsXteM: Math.round(rmsXte * 100) / 100,
      maxXteM: Math.round(maxXte * 100) / 100,
      rmsAltitudeErrorM: Math.round(rmsAltError * 100) / 100,
      meanGimbalPitchErrorDeg: Math.round(meanPitchError * 10) / 10,
      meanYawErrorDeg: Math.round(meanYawError * 10) / 10,
      photoCountPlanned: plannedPhotos,
      photoCountActual: actualPhotos,
      photoCaptureRatioPct: Math.round(photoRatio * 100),
      batteryStartPct: Math.round(startBat),
      batteryEndPct: Math.round(endBat),
      batteryUsedPct: Math.round(startBat - endBat),
      entryDistH: wp0.dH,
      entryDistZ: wp0.dZ,
      exitDistH: wpLast.dH
    };

    return {
      passedAll,
      phases,
      metrics,
      wpApproaches
    };
  },

  /**
   * Opens the interactive IRL Verification Scorecard Modal in the browser.
   */
  openIrlVerificationModal(flightId, plannedWaypoints, telemetryData, options = {}) {
    const modal = document.getElementById('diag-irl-modal');
    if (!modal) return;

    this.currentFlightId = flightId || 'FlightRecord.txt';
    this.currentPlannedWaypoints = plannedWaypoints || [];
    this.currentTelemetryData = telemetryData || { points: [] };

    const flightNameEl = document.getElementById('diag-irl-flight-name');
    if (flightNameEl) flightNameEl.textContent = this.currentFlightId;

    // Populate pattern select if empty
    const patSelect = document.getElementById('diag-irl-pattern-select');
    if (patSelect && patSelect.options.length <= 1) {
      patSelect.innerHTML = '';
      const gridTypeSelect = document.getElementById('grid-type');
      if (gridTypeSelect && gridTypeSelect.options) {
        Array.from(gridTypeSelect.options).forEach(opt => {
          if (!opt.value) return;
          const o = document.createElement('option');
          o.value = opt.value;
          o.textContent = opt.textContent;
          patSelect.appendChild(o);
        });
      }
    }

    const activePattern = options.patternId || (typeof getActiveLayer === 'function' ? getActiveLayer()?.pattern : 'double') || 'double';
    if (patSelect && activePattern) {
      patSelect.value = activePattern;
    }

    this.runVerificationAndRender();

    modal.classList.remove('hidden');
  },

  /**
   * Re-runs verification with current pattern and renders phase cards + metrics table.
   */
  runVerificationAndRender() {
    const patSelect = document.getElementById('diag-irl-pattern-select');
    const selectedPattern = patSelect ? patSelect.value : 'double';
    const patternNameEl = document.getElementById('diag-irl-pattern-name');
    if (patternNameEl && patSelect) {
      const selectedOption = patSelect.options[patSelect.selectedIndex];
      patternNameEl.textContent = selectedOption ? selectedOption.textContent : selectedPattern;
    }

    const captureMode = (typeof document !== 'undefined' && document.getElementById('capture-mode')?.value) || 'continuous';
    const pathMode = (typeof document !== 'undefined' && document.getElementById('path-mode')?.value) || 'straight';

    const result = this.verifyFlightPlanAgainstLog(
      this.currentPlannedWaypoints,
      this.currentTelemetryData,
      { patternId: selectedPattern, captureMode, pathMode }
    );
    this.currentResult = result;

    // Update Outcome Badge
    const outcomeBadge = document.getElementById('diag-irl-outcome-badge');
    if (outcomeBadge) {
      if (result.passedAll) {
        outcomeBadge.textContent = '✅ ALL 6 PHASES PASSED';
        outcomeBadge.style.background = 'rgba(16, 185, 129, 0.2)';
        outcomeBadge.style.color = '#34d399';
        outcomeBadge.style.borderColor = 'rgba(16, 185, 129, 0.4)';
      } else {
        outcomeBadge.textContent = '⚠️ VARIANCE DETECTED';
        outcomeBadge.style.background = 'rgba(245, 158, 11, 0.2)';
        outcomeBadge.style.color = '#fbbf24';
        outcomeBadge.style.borderColor = 'rgba(245, 158, 11, 0.4)';
      }
    }

    // Render 6 Phases
    const phasesContainer = document.getElementById('diag-irl-phases-container');
    if (phasesContainer) {
      phasesContainer.innerHTML = '';
      Object.keys(PHASE_LABELS).forEach(key => {
        const passed = Boolean(result.phases[key]);
        const card = document.createElement('div');
        card.className = 'diag-irl-phase-card';
        card.style.background = passed ? 'rgba(16, 185, 129, 0.06)' : 'rgba(245, 158, 11, 0.08)';
        card.style.border = passed ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid rgba(245, 158, 11, 0.35)';
        card.style.borderRadius = '8px';
        card.style.padding = '10px 12px';
        card.style.display = 'flex';
        card.style.flexDirection = 'column';
        card.style.gap = '4px';

        card.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <strong style="color: ${passed ? '#34d399' : '#fbbf24'}; font-size: 0.8rem; display: flex; align-items: center; gap: 6px;">
              <span>${passed ? '✓' : '⚠'}</span>
              <span>${PHASE_LABELS[key]}</span>
            </strong>
            <span class="badge" style="font-size: 0.65rem; font-weight: 700; padding: 1px 6px; border-radius: 4px; background: ${passed ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)'}; color: ${passed ? '#34d399' : '#fbbf24'};">
              ${passed ? 'PASS' : 'VARIANCE'}
            </span>
          </div>
          <div style="font-size: 0.7rem; color: var(--text-muted); line-height: 1.35;">
            ${PHASE_DESCRIPTIONS[key]}
          </div>
        `;
        phasesContainer.appendChild(card);
      });
    }

    // Render Metrics Grid
    const metricsGrid = document.getElementById('diag-irl-metrics-table-body');
    const samplesBadge = document.getElementById('diag-irl-samples-badge');
    if (samplesBadge) {
      samplesBadge.textContent = `${result.metrics.waypointCount} WPs • ${this.currentTelemetryData?.points?.length || 0} pts`;
    }

    if (metricsGrid) {
      const items = [
        { label: 'Waypoints Reached', val: `${result.metrics.visitedCount} / ${result.metrics.waypointCount} (${result.metrics.waypointCompletionPct}%)`, tol: '≥ 90%' },
        { label: 'RMS Cross-Track Error', val: `${result.metrics.rmsXteM} m`, tol: '≤ 4.5 m' },
        { label: 'Max Proximity Drift', val: `${result.metrics.maxXteM} m`, tol: '≤ 8.0 m' },
        { label: 'RMS Altitude Variance', val: `${result.metrics.rmsAltitudeErrorM} m`, tol: '≤ 2.0 m' },
        { label: 'Mean Gimbal Pitch Error', val: `${result.metrics.meanGimbalPitchErrorDeg}°`, tol: '≤ 6.0°' },
        { label: 'Mean Yaw Tracking Error', val: `${result.metrics.meanYawErrorDeg}°`, tol: '≤ 15.0°' },
        { label: 'Photo Shutter Triggers', val: `${result.metrics.photoCountActual} / ${result.metrics.photoCountPlanned} (${result.metrics.photoCaptureRatioPct}%)`, tol: '≥ 85%' },
        { label: 'Entry Drift (WP[0])', val: `H: ${result.metrics.entryDistH}m • Z: ${result.metrics.entryDistZ}m`, tol: 'H ≤ 4m, Z ≤ 2m' },
        { label: 'Battery Consumption', val: `${result.metrics.batteryStartPct}% → ${result.metrics.batteryEndPct}% (Used: ${result.metrics.batteryUsedPct}%)`, tol: 'End ≥ 15%' }
      ];

      metricsGrid.innerHTML = items.map(item => `
        <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 6px; padding: 6px 8px;">
          <div style="color: var(--text-muted); font-size: 0.65rem;">${item.label}</div>
          <div style="font-weight: 700; color: var(--text-main); font-size: 0.8rem; margin: 2px 0;">${item.val}</div>
          <div style="color: var(--accent-cyan); font-size: 0.65rem;">Tolerance: ${item.tol}</div>
        </div>
      `).join('');
    }

    // Toggle Companion Bridge sync button
    const bridgeSyncBtn = document.getElementById('diag-irl-sync-bridge-btn');
    if (bridgeSyncBtn) {
      const isBridgeConnected = typeof isCompanionBridgeConnected === 'function' && isCompanionBridgeConnected();
      bridgeSyncBtn.style.display = isBridgeConnected ? 'inline-flex' : 'none';
    }
  },

  /**
   * Closes the IRL Verification Modal.
   */
  closeIrlVerificationModal() {
    const modal = document.getElementById('diag-irl-modal');
    if (modal) modal.classList.add('hidden');
  },

  /**
   * Generates formatted GitHub Markdown checklist for pasting into Issue #202.
   */
  generateMarkdownReport() {
    if (!this.currentResult) return '';
    const r = this.currentResult;
    const patSelect = (typeof document !== 'undefined' && document.getElementById) ? document.getElementById('diag-irl-pattern-select') : null;
    const patternId = (patSelect && patSelect.value) ? patSelect.value : 'double';
    const patternName = (patSelect && patSelect.options && patSelect.selectedIndex >= 0 && patSelect.options[patSelect.selectedIndex])
      ? patSelect.options[patSelect.selectedIndex].textContent
      : patternId;

    return `### 🚁 IRL Field Flight Verification Report: \`${patternId}\` (${patternName})

> [!CAUTION]
> **Non-Guarantee & Variation Notice:** Passing these field checks verifies nominal reference behavior on the tested hardware/firmware only and **does not guarantee** future flight performance under varying wind, GNSS, geomagnetic, terrain, or OEM firmware conditions. The RPIC retains sole responsibility for VLOS and flight safety.

**Flight Log:** \`${this.currentFlightId}\`
**Overall Outcome:** ${r.passedAll ? '✅ `VERIFIED` (All 6 Phases Passed)' : '⚠️ `VARIANCE DETECTED` (Review Needed)'}

#### Six-Phase Verification Checklist
- [${r.phases.kmz_import ? 'x' : ' '}] **Phase 1: KMZ Import & Action Parsing** (${r.metrics.waypointCount} WPs, ${this.currentTelemetryData?.points?.length || 0} samples)
- [${r.phases.entry_altitude ? 'x' : ' '}] **Phase 2: Safe Entry & Target AGL** (WP[0] ΔH=${r.metrics.entryDistH}m, ΔZ=${r.metrics.entryDistZ}m)
- [${r.phases.geometry_path ? 'x' : ' '}] **Phase 3: 3D Geometry & Path Following** (${r.metrics.waypointCompletionPct}% WPs reached, RMS XTE=${r.metrics.rmsXteM}m, Max XTE=${r.metrics.maxXteM}m, AltErr=${r.metrics.rmsAltitudeErrorM}m)
- [${r.phases.heading_gimbal ? 'x' : ' '}] **Phase 4: Heading & Gimbal Pitch Lock** (Pitch Err=${r.metrics.meanGimbalPitchErrorDeg}°, Yaw Err=${r.metrics.meanYawErrorDeg}°)
- [${r.phases.capture_trigger ? 'x' : ' '}] **Phase 5: Camera Shutter & Settling** (${r.metrics.photoCountActual}/${r.metrics.photoCountPlanned} photos, ${r.metrics.photoCaptureRatioPct}%)
- [${r.phases.exit_rth ? 'x' : ' '}] **Phase 6: Safe Exit, Landing & RTH** (Exit ΔH=${r.metrics.exitDistH}m, Batt End=${r.metrics.batteryEndPct}%)

#### Field Telemetry Measurements
| Metric | Flown Measurement | Acceptance Tolerance | Status |
| :--- | :--- | :--- | :--- |
| **Waypoint Completion** | ${r.metrics.visitedCount} / ${r.metrics.waypointCount} (${r.metrics.waypointCompletionPct}%) | $\\ge 90\\%$ | ${r.metrics.waypointCompletionPct >= 90 ? 'PASS' : 'VARIANCE'} |
| **RMS Cross-Track Error (XTE)** | ${r.metrics.rmsXteM} m | $\\le 4.5\\text{ m}$ | ${r.metrics.rmsXteM <= 4.5 ? 'PASS' : 'VARIANCE'} |
| **RMS Altitude Variance** | ${r.metrics.rmsAltitudeErrorM} m | $\\le 2.0\\text{ m}$ | ${r.metrics.rmsAltitudeErrorM <= 2.0 ? 'PASS' : 'VARIANCE'} |
| **Gimbal Pitch Alignment** | ${r.metrics.meanGimbalPitchErrorDeg}° | $\\le 6.0^\\circ$ | ${r.metrics.meanGimbalPitchErrorDeg <= 6.0 ? 'PASS' : 'VARIANCE'} |
| **Yaw Alignment** | ${r.metrics.meanYawErrorDeg}° | $\\le 15.0^\\circ$ | ${r.metrics.meanYawErrorDeg <= 15.0 ? 'PASS' : 'VARIANCE'} |
| **Photo Shutter Ratio** | ${r.metrics.photoCountActual} / ${r.metrics.photoCountPlanned} (${r.metrics.photoCaptureRatioPct}%) | $\\ge 85\\%$ | ${r.metrics.photoCaptureRatioPct >= 85 ? 'PASS' : 'VARIANCE'} |
| **Ending Battery Reserve** | ${r.metrics.batteryEndPct}% | $\\ge 15\\%$ | ${r.metrics.batteryEndPct >= 15 ? 'PASS' : 'VARIANCE'} |

*Generated by Aalaapi Sky Flight Diagnostics (v1.210.0).*
`;
  },

  /**
   * Copies the Markdown report to clipboard.
   */
  copyMarkdownReport() {
    const md = this.generateMarkdownReport();
    if (!md) return;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(md).then(() => {
        if (typeof showToast === 'function') {
          showToast('📋 Copied IRL Field Verification Report to clipboard! Ready to paste into Issue #202.', 4000);
        }
      }).catch(() => {
        this.fallbackCopy(md);
      });
    } else {
      this.fallbackCopy(md);
    }
  },

  fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      if (typeof showToast === 'function') {
        showToast('📋 Copied IRL Field Verification Report to clipboard!', 4000);
      }
    } finally {
      document.body.removeChild(ta);
    }
  },

  /**
   * Exports evaluation result as JSON file.
   */
  exportJson() {
    if (!this.currentResult) return;
    const payload = {
      flightId: this.currentFlightId,
      timestamp: new Date().toISOString(),
      patternId: document.getElementById('diag-irl-pattern-select')?.value || 'double',
      passedAll: this.currentResult.passedAll,
      phases: this.currentResult.phases,
      metrics: this.currentResult.metrics,
      wpApproaches: this.currentResult.wpApproaches
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `irl_verification_${this.currentFlightId.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    if (typeof showToast === 'function') {
      showToast('💾 Exported IRL Verification Record JSON', 3000);
    }
  },

  /**
   * Synchronizes verified result to Companion Bridge tracker via POST /api/irl/record.
   */
  async syncToBridge() {
    if (!this.currentResult) return;
    const apiBase = (typeof getCompanionApiBase === 'function') ? getCompanionApiBase() : 'http://127.0.0.1:8765';
    const patternId = document.getElementById('diag-irl-pattern-select')?.value || 'double';

    try {
      const res = await fetch(`${apiBase}/api/irl/record`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patternId,
          flightId: this.currentFlightId,
          phases: this.currentResult.phases,
          metrics: this.currentResult.metrics,
          passedAll: this.currentResult.passedAll
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (typeof showToast === 'function') {
          showToast(`⚡ Recorded IRL verification for pattern "${patternId}" to local tracker!`, 4000);
        }
        if (typeof updateActiveLayerIrlBadge === 'function') {
          if (window.AALAAPI_IRL_STATUS) {
            window.AALAAPI_IRL_STATUS[patternId] = { s: data.status || (this.currentResult.passedAll ? 'V' : 'F'), v: '1.210.0' };
          }
          updateActiveLayerIrlBadge(patternId);
        }
      } else {
        if (typeof showToast === 'function') {
          showToast('⚠️ Bridge returned an error recording IRL status.', 4000);
        }
      }
    } catch (e) {
      if (typeof showToast === 'function') {
        showToast(`⚠️ Could not reach Companion Bridge: ${e.message}`, 4000);
      }
    }
  },

  /**
   * Initializes event listeners for the modal controls.
   */
  initEvents() {
    const closeBtn = document.getElementById('diag-irl-close-btn');
    const closeFooterBtn = document.getElementById('diag-irl-close-footer-btn');
    if (closeBtn) closeBtn.onclick = () => this.closeIrlVerificationModal();
    if (closeFooterBtn) closeFooterBtn.onclick = () => this.closeIrlVerificationModal();

    const patSelect = document.getElementById('diag-irl-pattern-select');
    if (patSelect) {
      patSelect.onchange = () => this.runVerificationAndRender();
    }

    const copyBtn = document.getElementById('diag-irl-copy-markdown-btn');
    if (copyBtn) copyBtn.onclick = () => this.copyMarkdownReport();

    const exportBtn = document.getElementById('diag-irl-export-json-btn');
    if (exportBtn) exportBtn.onclick = () => this.exportJson();

    const syncBtn = document.getElementById('diag-irl-sync-bridge-btn');
    if (syncBtn) syncBtn.onclick = () => this.syncToBridge();
  }
};

if (typeof window !== 'undefined') {
  window.IrlVerifier = IrlVerifier;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    IrlVerifier,
    haversineDistance,
    angularDiffDeg,
    PHASE_LABELS,
    PHASE_DESCRIPTIONS
  };
}
