/**
 * ActionFlowModal.js
 * Aalaapi Sky - Visual Node-RED Flight Action Flow Visualizer
 *
 * Provides a node-graph canvas illustrating the exact sequential execution of flight actions
 * across every waypoint: entry transit, yaw slews, gimbal tilts, auto-settling hover pauses,
 * camera triggers, and departure transits, connected with SVG bezier wires.
 */

let actionFlowZoom = 1.0;
let actionFlowPan = { x: 40, y: 40 };
let isActionFlowPanning = false;
let actionFlowPanStart = { x: 0, y: 0 };
let focusedWaypointIndex = null;

function initActionFlowModal() {
  if (typeof document === 'undefined') return;

  const modal = document.getElementById('action-flow-modal');
  if (!modal) return;

  const closeBtn = document.getElementById('action-flow-close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeActionFlowModal);
  }

  // Backdrop click to close
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeActionFlowModal();
    }
  });

  // Filter dropdown
  const filterSelect = document.getElementById('action-flow-filter-select');
  if (filterSelect) {
    filterSelect.addEventListener('change', () => {
      renderActionFlowGraph();
    });
  }

  // Zoom controls
  const zoomInBtn = document.getElementById('action-flow-zoom-in');
  if (zoomInBtn) {
    zoomInBtn.addEventListener('click', () => {
      actionFlowZoom = Math.min(2.0, actionFlowZoom + 0.15);
      applyActionFlowTransform();
    });
  }

  const zoomOutBtn = document.getElementById('action-flow-zoom-out');
  if (zoomOutBtn) {
    zoomOutBtn.addEventListener('click', () => {
      actionFlowZoom = Math.max(0.4, actionFlowZoom - 0.15);
      applyActionFlowTransform();
    });
  }

  const zoomResetBtn = document.getElementById('action-flow-zoom-reset');
  if (zoomResetBtn) {
    zoomResetBtn.addEventListener('click', () => {
      actionFlowZoom = 1.0;
      actionFlowPan = { x: 40, y: 40 };
      applyActionFlowTransform();
    });
  }

  // Canvas pan via pointer
  const viewport = document.getElementById('action-flow-viewport');
  if (viewport) {
    viewport.addEventListener('pointerdown', (e) => {
      // Don't pan if clicking inside an interactive node or button
      if (e.target.closest('button') || e.target.closest('select') || e.target.closest('input')) return;
      isActionFlowPanning = true;
      actionFlowPanStart = { x: e.clientX - actionFlowPan.x, y: e.clientY - actionFlowPan.y };
      viewport.style.cursor = 'grabbing';
      if (viewport.setPointerCapture) viewport.setPointerCapture(e.pointerId);
    });

    viewport.addEventListener('pointermove', (e) => {
      if (!isActionFlowPanning) return;
      actionFlowPan.x = e.clientX - actionFlowPanStart.x;
      actionFlowPan.y = e.clientY - actionFlowPanStart.y;
      applyActionFlowTransform();
    });

    const endPan = (e) => {
      if (isActionFlowPanning) {
        isActionFlowPanning = false;
        viewport.style.cursor = 'grab';
        try {
          if (viewport.releasePointerCapture && e.pointerId) {
            viewport.releasePointerCapture(e.pointerId);
          }
        } catch (_) {}
      }
    };

    viewport.addEventListener('pointerup', endPan);
    viewport.addEventListener('pointercancel', endPan);

    // Mouse wheel zoom
    viewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      actionFlowZoom = Math.max(0.35, Math.min(2.5, actionFlowZoom * zoomFactor));
      applyActionFlowTransform();
    }, { passive: false });
  }

  // Window resize re-draw wires
  window.addEventListener('resize', () => {
    if (modal && !modal.classList.contains('hidden')) {
      updateActionFlowWires();
    }
  });
}

function openActionFlowModal(focusIndex = null) {
  if (typeof document === 'undefined') return;
  if (typeof window !== 'undefined' && typeof window.dismissActivePopovers === 'function') {
    window.dismissActivePopovers();
  } else if (typeof dismissActivePopovers === 'function') {
    dismissActivePopovers();
  }
  const modal = document.getElementById('action-flow-modal');
  if (!modal) return;

  focusedWaypointIndex = (focusIndex !== null && focusIndex !== undefined && !isNaN(focusIndex)) ? parseInt(focusIndex, 10) : null;
  modal.classList.remove('hidden');

  populateActionFlowFilterDropdown();
  renderActionFlowGraph();

  if (focusedWaypointIndex !== null) {
    setTimeout(() => {
      centerOnWaypointNode(focusedWaypointIndex);
    }, 150);
  }
}

function closeActionFlowModal() {
  if (typeof document === 'undefined') return;
  const modal = document.getElementById('action-flow-modal');
  if (modal) {
    modal.classList.add('hidden');
  }
}

function applyActionFlowTransform() {
  const container = document.getElementById('action-flow-canvas-container');
  const zoomLabel = document.getElementById('action-flow-zoom-label');
  if (container) {
    container.style.transform = `translate(${actionFlowPan.x}px, ${actionFlowPan.y}px) scale(${actionFlowZoom})`;
  }
  if (zoomLabel) {
    zoomLabel.textContent = `${Math.round(actionFlowZoom * 100)}%`;
  }
}

function populateActionFlowFilterDropdown() {
  const filterSelect = document.getElementById('action-flow-filter-select');
  if (!filterSelect) return;

  const layersList = (typeof flightLayers !== 'undefined') ? flightLayers : [];
  let html = `<option value="all">🌐 All Waypoints & Layers</option>`;

  if (layersList && layersList.length > 0) {
    html += `<optgroup label="Flight Layers">`;
    layersList.forEach((l, idx) => {
      const name = l.name || `Layer ${idx + 1}`;
      html += `<option value="layer_${l.id}">${name} (${l.pattern || 'freeform'})</option>`;
    });
    html += `</optgroup>`;
  }

  filterSelect.innerHTML = html;
}

function centerOnWaypointNode(wpIdx) {
  const targetNode = document.getElementById(`af-wp-card-${wpIdx}`);
  const viewport = document.getElementById('action-flow-viewport');
  if (!targetNode || !viewport) return;

  const vpRect = viewport.getBoundingClientRect();
  const nodeLeft = targetNode.offsetLeft;
  const nodeTop = targetNode.offsetTop;
  const nodeWidth = targetNode.offsetWidth;
  const nodeHeight = targetNode.offsetHeight;

  actionFlowPan.x = (vpRect.width / 2) - ((nodeLeft + nodeWidth / 2) * actionFlowZoom);
  actionFlowPan.y = (vpRect.height / 2) - ((nodeTop + nodeHeight / 2) * actionFlowZoom);
  applyActionFlowTransform();

  // Pulse highlight
  targetNode.classList.add('af-highlight-pulse');
  setTimeout(() => {
    targetNode.classList.remove('af-highlight-pulse');
  }, 2500);
}

function renderActionFlowGraph() {
  const nodesContainer = document.getElementById('action-flow-nodes');
  const svgWires = document.getElementById('action-flow-svg');
  const statsSummary = document.getElementById('action-flow-summary-bar');
  if (!nodesContainer) return;

  const wps = (typeof getCurrentWaypoints === 'function' ? getCurrentWaypoints() : null) || (typeof waypoints !== 'undefined' ? waypoints : []) || [];
  if (!wps || wps.length === 0) {
    nodesContainer.innerHTML = `
      <div style="padding: 60px 20px; text-align: center; color: var(--text-muted); font-size: 0.9rem;">
        <div style="font-size: 2rem; margin-bottom: 12px;">🛸</div>
        <div>No waypoints found in active mission.</div>
        <div style="font-size: 0.78rem; margin-top: 6px; color: #64748b;">Create or generate a flight pattern on the map to visualize its action sequence.</div>
      </div>
    `;
    if (svgWires) svgWires.innerHTML = '';
    if (statsSummary) statsSummary.textContent = '0 Waypoints | 0 Actions';
    return;
  }

  const filterSelect = document.getElementById('action-flow-filter-select');
  const filterVal = filterSelect ? filterSelect.value : 'all';

  let totalAutoSettlingHover = 0;
  let totalExplicitHover = 0;
  let totalPhotos = 0;
  let totalActionsCount = 0;

  let cardsHtml = '';

  // 1. Takeoff / Launch Node
  cardsHtml += `
    <div class="af-node-card af-node-start" id="af-node-takeoff" style="grid-column: 1;">
      <div class="af-node-header">
        <span class="af-node-badge">TAKEOFF</span>
        <span class="af-node-title">Ground Launch & Climb</span>
      </div>
      <div class="af-node-body">
        <div class="af-action-chip af-action-transit">
          <span class="af-chip-icon">🚀</span>
          <span class="af-chip-title">Safe Climb to Target AGL</span>
          <span class="af-chip-detail">${wps[0].alt ? Math.round(wps[0].alt) : 30}m</span>
        </div>
      </div>
      <div class="af-port af-port-out" data-port="takeoff-out"></div>
    </div>
  `;

  // 2. Iterate Waypoints
  wps.forEach((wp, idx) => {
    if (filterVal.startsWith('layer_')) {
      const targetLayerId = filterVal.replace('layer_', '');
      if (wp.layerId && wp.layerId !== targetLayerId) return;
    }

    const eff = (typeof resolveWaypointEffectiveActions === 'function')
      ? resolveWaypointEffectiveActions(idx, wps)
      : null;

    const wpLayer = (wp.layerId && typeof flightLayers !== 'undefined')
      ? flightLayers.find(l => l.id === wp.layerId)
      : ((typeof getActiveLayer === 'function') ? getActiveLayer() : null);

    const layerName = wpLayer?.name || (wp.layerId ? `Layer (${wp.layerId})` : 'Default Layer');
    const isFocused = (focusedWaypointIndex === idx);

    const effHover = eff ? eff.effectiveHover : ((wp.hoverTime !== null && wp.hoverTime !== undefined && wp.hoverTime !== 'inherit') ? parseFloat(wp.hoverTime) : 0);
    const hasCustomHover = (wp.hoverTime !== null && wp.hoverTime !== undefined && wp.hoverTime !== 'inherit');
    if (hasCustomHover) {
      totalExplicitHover += effHover;
    } else {
      totalAutoSettlingHover += effHover;
    }

    const actionsList = eff?.actions || [];
    totalActionsCount += actionsList.length;
    if (actionsList.some(a => a.type === 'takePhoto')) {
      totalPhotos += 1;
    }

    // Build action step chips inside WP card
    let stepsHtml = '';
    actionsList.forEach((act, actIdx) => {
      let chipClass = 'af-action-misc';
      if (act.type === 'rotateYaw') chipClass = 'af-action-yaw';
      else if (act.type === 'gimbalRotate') chipClass = 'af-action-gimbal';
      else if (act.type === 'hover') chipClass = act.isAuto ? 'af-action-hover-auto' : 'af-action-hover-manual';
      else if (act.type === 'takePhoto') chipClass = 'af-action-photo';
      else if (act.type === 'startRecord' || act.type === 'stopRecord') chipClass = 'af-action-video';
      else if (act.type === 'zoom') chipClass = 'af-action-zoom';

      stepsHtml += `
        <div class="af-action-step-row" id="af-step-${idx}-${actIdx}">
          <div class="af-step-index">${actIdx + 1}</div>
          <div class="af-action-chip ${chipClass}">
            <span class="af-chip-icon">${act.icon || '⚡'}</span>
            <div class="af-chip-content">
              <span class="af-chip-title">${act.label}</span>
              ${act.reason ? `<span class="af-chip-reason">${act.reason}</span>` : ''}
            </div>
            <span class="af-chip-detail">${act.detail}</span>
          </div>
        </div>
      `;
    });

    if (actionsList.length === 0) {
      stepsHtml = `
        <div class="af-action-step-row">
          <div class="af-action-chip af-action-transit">
            <span class="af-chip-icon">✈️</span>
            <span class="af-chip-title">Curved Smooth Pass</span>
            <span class="af-chip-detail">Continuous Flight</span>
          </div>
        </div>
      `;
    }

    cardsHtml += `
      <div class="af-node-card af-node-wp ${isFocused ? 'af-node-focused' : ''}" id="af-wp-card-${idx}">
        <div class="af-port af-port-in" data-port="wp-${idx}-in"></div>
        <div class="af-node-header">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span class="af-node-badge af-badge-wp">WP ${idx}</span>
            <span class="af-node-layer">${layerName}</span>
          </div>
          <span class="af-node-alt">${Math.round(wp.alt || 30)}m AGL</span>
        </div>
        <div class="af-node-submeta">
          <span>Lat: ${wp.lat ? wp.lat.toFixed(5) : '0.0'}</span>
          <span>Lon: ${wp.lon ? wp.lon.toFixed(5) : '0.0'}</span>
        </div>
        <div class="af-node-body">
          ${stepsHtml}
        </div>
        <div class="af-port af-port-out" data-port="wp-${idx}-out"></div>
      </div>
    `;
  });

  // 3. Finish / Landing Node
  cardsHtml += `
    <div class="af-node-card af-node-finish" id="af-node-finish">
      <div class="af-port af-port-in" data-port="finish-in"></div>
      <div class="af-node-header">
        <span class="af-node-badge af-badge-finish">FINISH</span>
        <span class="af-node-title">Mission Complete & RTH</span>
      </div>
      <div class="af-node-body">
        <div class="af-action-chip af-action-transit">
          <span class="af-chip-icon">🏠</span>
          <span class="af-chip-title">Return to Home & Descend</span>
          <span class="af-chip-detail">Auto Land</span>
        </div>
      </div>
    </div>
  `;

  nodesContainer.innerHTML = cardsHtml;

  // Update bottom stats summary
  if (statsSummary) {
    statsSummary.innerHTML = `
      <span>📍 <strong>${wps.length}</strong> Waypoints</span>
      <span class="af-stat-sep">•</span>
      <span>📸 <strong>${totalPhotos}</strong> Shutter Triggers</span>
      <span class="af-stat-sep">•</span>
      <span>⏱️ <strong>${totalAutoSettlingHover.toFixed(1)}s</strong> Auto-Settling Hover</span>
      <span class="af-stat-sep">•</span>
      <span>⚡ <strong>${totalActionsCount}</strong> Total Flight Operations</span>
    `;
  }

  // Draw connecting wires after DOM layout
  setTimeout(() => {
    updateActionFlowWires();
  }, 50);
}

function updateActionFlowWires() {
  const svgWires = document.getElementById('action-flow-svg');
  const nodesContainer = document.getElementById('action-flow-nodes');
  if (!svgWires || !nodesContainer) return;

  const wps = (typeof getCurrentWaypoints === 'function' ? getCurrentWaypoints() : null) || (typeof waypoints !== 'undefined' ? waypoints : []) || [];
  if (!wps || wps.length === 0) {
    svgWires.innerHTML = '';
    return;
  }

  const containerRect = nodesContainer.getBoundingClientRect();
  const cWidth = Math.max(nodesContainer.scrollWidth, containerRect.width, 2400);
  const cHeight = Math.max(nodesContainer.scrollHeight, containerRect.height, 1200);

  svgWires.setAttribute('width', `${cWidth}`);
  svgWires.setAttribute('height', `${cHeight}`);
  svgWires.setAttribute('viewBox', `0 0 ${cWidth} ${cHeight}`);

  let pathsHtml = `
    <defs>
      <linearGradient id="afWireGradient" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#06b6d4" stop-opacity="0.8" />
        <stop offset="50%" stop-color="#38bdf8" stop-opacity="0.9" />
        <stop offset="100%" stop-color="#a855f7" stop-opacity="0.8" />
      </linearGradient>
      <filter id="afGlow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>
  `;

  // Helper to get center coords of an element relative to nodesContainer
  const getPortCoords = (portEl) => {
    if (!portEl) return null;
    const pRect = portEl.getBoundingClientRect();
    return {
      x: (pRect.left - containerRect.left) / actionFlowZoom,
      y: (pRect.top - containerRect.top) / actionFlowZoom
    };
  };

  // Wire 1: Takeoff -> WP 0
  const takeoffOut = document.querySelector('[data-port="takeoff-out"]');
  const wp0In = document.querySelector('[data-port="wp-0-in"]');
  if (takeoffOut && wp0In) {
    const p1 = getPortCoords(takeoffOut);
    const p2 = getPortCoords(wp0In);
    if (p1 && p2) {
      const dx = Math.max(40, (p2.x - p1.x) * 0.5);
      pathsHtml += `<path d="M ${p1.x} ${p1.y} C ${p1.x + dx} ${p1.y}, ${p2.x - dx} ${p2.y}, ${p2.x} ${p2.y}" class="af-svg-wire" />`;
    }
  }

  // Wire 2: WP(i) -> WP(i+1)
  const renderedWpCards = document.querySelectorAll('.af-node-wp');
  for (let i = 0; i < renderedWpCards.length - 1; i++) {
    const fromCard = renderedWpCards[i];
    const toCard = renderedWpCards[i + 1];
    const outPort = fromCard.querySelector('.af-port-out');
    const inPort = toCard.querySelector('.af-port-in');
    if (outPort && inPort) {
      const p1 = getPortCoords(outPort);
      const p2 = getPortCoords(inPort);
      if (p1 && p2) {
        const dx = Math.max(50, Math.abs(p2.x - p1.x) * 0.5);
        pathsHtml += `<path d="M ${p1.x} ${p1.y} C ${p1.x + dx} ${p1.y}, ${p2.x - dx} ${p2.y}, ${p2.x} ${p2.y}" class="af-svg-wire" />`;
      }
    }
  }

  // Wire 3: Last WP -> Finish
  const lastCard = renderedWpCards[renderedWpCards.length - 1];
  const finishIn = document.querySelector('[data-port="finish-in"]');
  if (lastCard && finishIn) {
    const outPort = lastCard.querySelector('.af-port-out');
    if (outPort) {
      const p1 = getPortCoords(outPort);
      const p2 = getPortCoords(finishIn);
      if (p1 && p2) {
        const dx = Math.max(40, (p2.x - p1.x) * 0.5);
        pathsHtml += `<path d="M ${p1.x} ${p1.y} C ${p1.x + dx} ${p1.y}, ${p2.x - dx} ${p2.y}, ${p2.x} ${p2.y}" class="af-svg-wire" />`;
      }
    }
  }

  svgWires.innerHTML = pathsHtml;
}

if (typeof window !== 'undefined') {
  window.initActionFlowModal = initActionFlowModal;
  window.openActionFlowModal = openActionFlowModal;
  window.closeActionFlowModal = closeActionFlowModal;
  window.renderActionFlowGraph = renderActionFlowGraph;
  window.updateActionFlowWires = updateActionFlowWires;
}

if (typeof global !== 'undefined') {
  global.initActionFlowModal = initActionFlowModal;
  global.openActionFlowModal = openActionFlowModal;
  global.closeActionFlowModal = closeActionFlowModal;
  global.renderActionFlowGraph = renderActionFlowGraph;
  global.updateActionFlowWires = updateActionFlowWires;
}
