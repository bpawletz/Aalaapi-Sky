/**
 * Aalaapi Sky - Modal Drag Manager
 * Enables smooth pointer/touch-based dragging across all modal dialogs and floating panels.
 * 
 * Features:
 * - Multi-tier drag handle detection: explicit headers, top containers, or card top zones.
 * - Seamless pointer capture (mouse, stylus, touch).
 * - Interactive child element filtering (buttons, inputs, tabs, links never trigger drag).
 * - Viewport boundary clamping to guarantee header and close buttons remain accessible.
 * - Session position persistence so modals do not snap back and cover active waypoints.
 * - Double-click header shortcut to quickly re-center modal.
 * - Visual tactile grip indicators (⋮⋮) for dense headers and headerless cards.
 * - Standalone floating panel support (e.g. 3D Waypoint Editor #fpv-editor-panel).
 * - Auto-realigns within bounds if window is resized.
 */

// Cache of dragged offsets per modal element or ID: { [modalId]: { x, y } }
const modalPositions = new Map();

/**
 * Clamps coordinates so that at least a comfortable margin of the modal remains
 * inside the visible viewport and the top header is never lost off-screen.
 * 
 * @param {HTMLElement} modal 
 * @param {HTMLElement} handle 
 * @param {number} proposedX 
 * @param {number} proposedY 
 * @returns {{ x: number, y: number }}
 */
/**
 * Accurately parses current modal translation offsets from inline style.transform.
 * Safely extracts both positive and negative values for standard translate3d(Xpx, Ypx)
 * and horizontally centered calc(-50% [+-] Xpx) formats normalized by browsers.
 * 
 * @param {string} styleTransform 
 * @returns {{ x: number, y: number }}
 */
export function parseModalTransform(styleTransform) {
  if (!styleTransform || typeof styleTransform !== 'string') {
    return { x: 0, y: 0 };
  }

  // 1. Check for centered calc(-50% [+-] Xpx)
  const calcMatch = styleTransform.match(/calc\(\s*-50%\s*([+-])\s*(-?\d+(?:\.\d+)?)\s*px\s*\)\s*,\s*(-?\d+(?:\.\d+)?)\s*px/);
  if (calcMatch) {
    const sign = calcMatch[1] === '-' ? -1 : 1;
    const val = parseFloat(calcMatch[2]) || 0;
    const x = sign * val;
    const y = parseFloat(calcMatch[3]) || 0;
    return { x, y };
  }

  // 2. Check for pure -50% with zero offset: translate3d(-50%, Ypx, ...) or translate(-50%, Ypx)
  const baseCenterMatch = styleTransform.match(/translate(?:3d)?\(\s*-50%\s*,\s*(-?\d+(?:\.\d+)?)\s*px/);
  if (baseCenterMatch) {
    const y = parseFloat(baseCenterMatch[1]) || 0;
    return { x: 0, y };
  }

  // 3. Check for standard translate3d(Xpx, Ypx, ...) or translate(Xpx, Ypx)
  const stdMatch = styleTransform.match(/translate(?:3d)?\(\s*(-?\d+(?:\.\d+)?)\s*px\s*,\s*(-?\d+(?:\.\d+)?)\s*px/);
  if (stdMatch) {
    const x = parseFloat(stdMatch[1]) || 0;
    const y = parseFloat(stdMatch[2]) || 0;
    return { x, y };
  }

  return { x: 0, y: 0 };
}

/**
 * Standardizes formatting of modal translation CSS strings.
 * 
 * @param {number} x 
 * @param {number} y 
 * @param {boolean} hasBaseCenterX 
 * @returns {string}
 */
export function formatModalTransform(x, y, hasBaseCenterX) {
  if (hasBaseCenterX) {
    if (x === 0) {
      return `translate3d(-50%, ${y}px, 0)`;
    } else if (x > 0) {
      return `translate3d(calc(-50% + ${x}px), ${y}px, 0)`;
    } else {
      return `translate3d(calc(-50% - ${Math.abs(x)}px), ${y}px, 0)`;
    }
  }
  return `translate3d(${x}px, ${y}px, 0)`;
}

/**
 * Automatically inspects an element's bounding geometry and clamps its transform
 * within the visible browser viewport so it never minimizes or collapses offscreen.
 * 
 * @param {HTMLElement} element The modal card or floating panel
 * @param {number} minPadding Minimum boundary padding from viewport edges (default: 8px)
 * @returns {{ x: number, y: number, clamped: boolean }} The adjusted transform offsets
 */
export function ensureElementInViewport(element, minPadding = 8) {
  if (typeof window === 'undefined' || !element) {
    return { x: 0, y: 0, clamped: false };
  }

  const modal = element.querySelector?.('.modal') || element;
  const handle = modal.querySelector?.('[data-modal-drag-handle], .elevation-profile-header, .replay-2d-header, .modal-header') || modal;

  const isCenterX = modal.classList.contains('elevation-profile-drawer') ||
                    modal.classList.contains('replay-2d-bar') ||
                    modal.hasAttribute('data-center-x') ||
                    element.hasAttribute?.('data-center-x');

  const cur = parseModalTransform(modal.style.transform);

  // Temporarily disable CSS transition so getBoundingClientRect() reflects instantaneous layout
  const prevTransition = modal.style.transition;
  modal.style.transition = 'none';

  const elRect = modal.getBoundingClientRect();
  const hRect = handle.getBoundingClientRect();
  const winH = window.innerHeight;
  const winW = window.innerWidth;

  let deltaY = 0;
  // If bottom edge of collapsed box falls past the bottom of the viewport
  if (elRect.bottom > winH - minPadding) {
    deltaY = (winH - minPadding) - elRect.bottom;
  } else if (hRect.top < minPadding) {
    // If top edge of header falls above the top of the viewport
    deltaY = minPadding - hRect.top;
  }

  let deltaX = 0;
  // If right edge falls past the right of the viewport
  if (elRect.right > winW - minPadding) {
    deltaX = (winW - minPadding) - elRect.right;
  } else if (elRect.left < minPadding) {
    // If left edge falls past the left of the viewport
    deltaX = minPadding - elRect.left;
  }

  let result = { x: cur.x, y: cur.y, clamped: false };

  if (Math.abs(deltaX) > 0.5 || Math.abs(deltaY) > 0.5) {
    const newX = Math.round(cur.x + deltaX);
    const newY = Math.round(cur.y + deltaY);
    modal.style.transform = formatModalTransform(newX, newY, isCenterX);
    const containerKey = element.id || modal.id || element;
    modalPositions.set(containerKey, { x: newX, y: newY });
    result = { x: newX, y: newY, clamped: true };
  }

  // Restore previous transition via microtask so paint renders cleanly
  requestAnimationFrame(() => {
    modal.style.transition = prevTransition;
  });

  return result;
}

export function clampModalPosition(modal, handle, proposedX, proposedY) {
  if (typeof window === 'undefined') {
    return { x: proposedX, y: proposedY };
  }

  const modalRect = modal.getBoundingClientRect();
  const handleRect = handle ? handle.getBoundingClientRect() : modalRect;

  const styleTransform = modal.style.transform || '';
  const parsed = parseModalTransform(styleTransform);
  const curX = parsed.x;
  const curY = parsed.y;

  const baseLeft = modalRect.left - curX;
  const baseTop = modalRect.top - curY;
  const modalWidth = modalRect.width || 400;
  const modalHeight = modalRect.height || 300;
  const handleHeight = handleRect.height || 44;

  const winW = window.innerWidth;
  const winH = window.innerHeight;

  const minShiftY = -baseTop;
  const maxShiftY = winH - handleHeight - baseTop;

  const minShiftX = 60 - modalWidth - baseLeft;
  const maxShiftX = winW - 60 - baseLeft;

  const clampedX = Math.min(Math.max(proposedX, minShiftX), maxShiftX);
  const clampedY = Math.min(Math.max(proposedY, minShiftY), maxShiftY);

  return {
    x: Math.round(clampedX),
    y: Math.round(clampedY)
  };
}

/**
 * Initializes dragging capability for an individual modal overlay or floating panel.
 * 
 * @param {HTMLElement|string} modalOverlayOrId 
 * @returns {boolean} True if successfully initialized
 */
export function initModalDraggable(modalOverlayOrId) {
  const container = typeof modalOverlayOrId === 'string'
    ? document.getElementById(modalOverlayOrId)
    : modalOverlayOrId;

  if (!container || container._modalDraggableInitialized) {
    return false;
  }

  // If container has a .modal child, use that; otherwise, container is the floating card itself
  const modal = container.querySelector('.modal') || container;
  if (!modal) {
    return false;
  }

  // Multi-tier handle resolution:
  // Tier 1: Explicit class or data attribute
  // Tier 2: <header> tag
  // Tier 3: First child element
  // Tier 4: The modal card itself (using top-zone fallback)
  const handle = modal.querySelector(
    '.modal-header, .photo-inspector-header, .fpv-editor-header, .video-cast-header, .elevation-profile-header, .replay-2d-header, .diag-modal-header, .diag-wireframe-header, .popover-header, .legend-header, .adsb-drawer-header, .remote-id-cal-header, .stats-panel-header, #hud-legend-header, .wp-help-title, [data-modal-drag-handle]'
  ) || modal.querySelector('header') || modal.firstElementChild || modal;

  container._modalDraggableInitialized = true;
  modal.setAttribute('data-draggable-modal', 'true');
  if (handle !== modal) {
    handle.setAttribute('data-modal-drag-handle', 'true');
  } else {
    modal.setAttribute('data-modal-drag-handle', 'true');
  }

  // Detect if element uses horizontal centering via translateX(-50%)
  const hasBaseCenterX = modal.classList.contains('elevation-profile-drawer') ||
                         modal.classList.contains('replay-2d-bar') ||
                         modal.hasAttribute('data-center-x') ||
                         modal.dataset.centerX === 'true' ||
                         container.hasAttribute('data-center-x');

  let isDragging = false;
  let hasMoved = false;
  let suppressClickUntil = 0;
  let startPointerX = 0;
  let startPointerY = 0;
  let currentTranslateX = 0;
  let currentTranslateY = 0;
  let activePointerId = null;

  // Restore saved position if previously dragged in this session
  const containerKey = container.id || modal.id || container;
  if (modalPositions.has(containerKey)) {
    const saved = modalPositions.get(containerKey);
    currentTranslateX = saved.x;
    currentTranslateY = saved.y;
    modal.style.transform = formatModalTransform(currentTranslateX, currentTranslateY, hasBaseCenterX);
  }

  function isInteractiveElement(target) {
    return !!target.closest(
      'button, input, textarea, select, a, [role="button"], .close-btn, .tab-btn, .modal-tab-btn, .stepper-step, [data-no-drag]'
    );
  }

  function onPointerDown(e) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (isInteractiveElement(e.target)) return;

    if (modal.classList.contains('fullscreen-3d') || modal.classList.contains('is-fullscreen')) {
      return;
    }

    // Top-zone check if the handle is the entire card (headerless fallback)
    if (handle === modal) {
      const rect = modal.getBoundingClientRect();
      const relativeY = e.clientY - rect.top;
      if (relativeY > 48) {
        // Only top 48px of a headerless card triggers drag
        return;
      }
    }

    isDragging = true;
    hasMoved = false;
    activePointerId = e.pointerId;
    startPointerX = e.clientX;
    startPointerY = e.clientY;

    const parsed = parseModalTransform(modal.style.transform);
    currentTranslateX = parsed.x;
    currentTranslateY = parsed.y;

    modal.classList.add('modal-dragging');
    document.body.classList.add('modal-drag-active');

    try {
      handle.setPointerCapture(e.pointerId);
    } catch (_) {}

    e.stopPropagation();
    e.preventDefault();
  }

  function onPointerMove(e) {
    if (!isDragging || (activePointerId !== null && e.pointerId !== activePointerId)) {
      return;
    }

    const deltaX = e.clientX - startPointerX;
    const deltaY = e.clientY - startPointerY;

    if (Math.hypot(deltaX, deltaY) > 3) {
      hasMoved = true;
    }

    const proposedX = currentTranslateX + deltaX;
    const proposedY = currentTranslateY + deltaY;

    const clamped = clampModalPosition(modal, handle, proposedX, proposedY);
    modal.style.transform = formatModalTransform(clamped.x, clamped.y, hasBaseCenterX);

    e.stopPropagation();
  }

  function endDrag(e) {
    if (!isDragging) return;
    if (activePointerId !== null && e.pointerId !== undefined && e.pointerId !== activePointerId) {
      return;
    }

    isDragging = false;
    activePointerId = null;
    modal.classList.remove('modal-dragging');
    document.body.classList.remove('modal-drag-active');

    if (e.pointerId !== undefined) {
      try {
        handle.releasePointerCapture(e.pointerId);
      } catch (_) {}
    }

    if (hasMoved) {
      suppressClickUntil = Date.now() + 120;
    }

    const parsed = parseModalTransform(modal.style.transform);
    currentTranslateX = parsed.x;
    currentTranslateY = parsed.y;
    modalPositions.set(containerKey, { x: currentTranslateX, y: currentTranslateY });

    if (e) {
      e.stopPropagation();
    }
  }

  function resetPosition() {
    modal.style.transform = '';
    currentTranslateX = 0;
    currentTranslateY = 0;
    modalPositions.delete(containerKey);
  }

  function onDblClick(e) {
    if (isInteractiveElement(e.target)) return;
    resetPosition();
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      resetPosition();
      return;
    }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      if (isInteractiveElement(e.target) && e.target !== handle && !e.target.classList.contains('modal-drag-grip')) return;
      e.preventDefault();
      const step = e.shiftKey ? 30 : 15;
      let dx = 0;
      let dy = 0;
      if (e.key === 'ArrowUp') dy = -step;
      else if (e.key === 'ArrowDown') dy = step;
      else if (e.key === 'ArrowLeft') dx = -step;
      else if (e.key === 'ArrowRight') dx = step;

      const parsed = parseModalTransform(modal.style.transform);
      const curX = parsed.x;
      const curY = parsed.y;

      const proposedX = curX + dx;
      const proposedY = curY + dy;
      const clamped = clampModalPosition(modal, handle, proposedX, proposedY);
      modal.style.transform = formatModalTransform(clamped.x, clamped.y, hasBaseCenterX);
      modalPositions.set(containerKey, { x: clamped.x, y: clamped.y });
    }
  }

  function onClickCapture(e) {
    if (isInteractiveElement(e.target)) {
      return;
    }
    if (Date.now() < suppressClickUntil) {
      suppressClickUntil = 0;
      e.stopPropagation();
      e.preventDefault();
      if (typeof e.stopImmediatePropagation === 'function') {
        e.stopImmediatePropagation();
      }
    }
  }

  handle.addEventListener('pointerdown', onPointerDown);
  handle.addEventListener('pointermove', onPointerMove);
  handle.addEventListener('pointerup', endDrag);
  handle.addEventListener('pointercancel', endDrag);
  handle.addEventListener('dblclick', onDblClick);
  handle.addEventListener('keydown', onKeyDown);
  handle.addEventListener('click', onClickCapture, true);

  // Observer for overlay unhiding to keep clamped
  const ObserverClass = (typeof MutationObserver !== 'undefined' && MutationObserver) ||
                        (typeof window !== 'undefined' && window.MutationObserver) ||
                        null;

  if (ObserverClass) {
    const observer = new ObserverClass(mutations => {
      for (const m of mutations) {
        if (m.type === 'attributes' && m.attributeName === 'class') {
          if (isDragging) continue;
          if (!container.classList.contains('hidden') && modalPositions.has(containerKey)) {
            const pos = modalPositions.get(containerKey);
            const clamped = clampModalPosition(modal, handle, pos.x, pos.y);
            modal.style.transform = formatModalTransform(clamped.x, clamped.y, hasBaseCenterX);
            modalPositions.set(containerKey, clamped);
          }
        }
      }
    });

    observer.observe(container, { attributes: true, attributeFilter: ['class'] });
  }

  return true;
}

/**
 * Initializes all modal overlays and floating panels in the document.
 */
/**
 * Injects a standardized minimize/expand toggle button into every modal dialog header
 * allowing users to collapse dialogs to their headers and view the map beneath.
 */
export function initUniversalModalCollapseToggles() {
  if (typeof document === 'undefined') return;
  const modals = document.querySelectorAll('.modal-overlay .modal');
  modals.forEach(modal => {
    const header = modal.querySelector('.modal-header');
    if (!header || header.querySelector('.modal-collapse-btn')) return;
    const closeBtn = header.querySelector('.close-btn, button[aria-label^="Close"], button[aria-label^="close"]');
    const collapseBtn = document.createElement('button');
    collapseBtn.type = 'button';
    collapseBtn.className = 'modal-collapse-btn';
    collapseBtn.title = 'Minimize / Expand Modal';
    collapseBtn.setAttribute('aria-label', 'Minimize / Expand Modal');
    collapseBtn.textContent = '▼';
    collapseBtn.style.cssText = 'background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:0.85rem;padding:2px 6px;line-height:1;border-radius:4px;transition:var(--transition-smooth);';
    collapseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      modal.classList.toggle('modal-collapsed');
      const isCollapsed = modal.classList.contains('modal-collapsed');
      collapseBtn.textContent = isCollapsed ? '▲' : '▼';
      collapseBtn.title = isCollapsed ? 'Expand Modal' : 'Minimize Modal';
      if (isCollapsed) {
        ensureElementInViewport(modal);
        // Secondary check after CSS layout settles
        setTimeout(() => ensureElementInViewport(modal), 50);
      }
    });
    if (closeBtn && closeBtn.parentNode) {
      closeBtn.parentNode.insertBefore(collapseBtn, closeBtn);
    } else {
      header.appendChild(collapseBtn);
    }
  });
}

export function initAllModalsDraggable() {
  if (typeof document === 'undefined') return;

  const dialogs = document.querySelectorAll(
    '.modal-overlay, [data-draggable-modal], #fpv-editor-panel, #video-cast-panel, #elevation-profile-drawer, #replay-2d-bar, #diag-wireframe-panel, #bridge-status-popover, #telemetry-weather-popover, #mission-time-popover, #adsb-control-drawer, #remote-id-calibration-panel, #stats-panel, #three-hud-legend, #three-hud-controls, #three-instructions, #diag-hud-overlay, #diag-hud-controls, #diag-path-legend, #map-mission-legend, #airspace-legend-container, #wp-heading-help-popover'
  );
  dialogs.forEach(dialog => {
    initModalDraggable(dialog);
  });

  initUniversalModalCollapseToggles();
}

/**
 * Resets a modal or floating panel's dragged position back to center.
 * @param {HTMLElement|string} modalOverlayOrId 
 */
export function resetModalPosition(modalOverlayOrId) {
  const container = typeof modalOverlayOrId === 'string'
    ? document.getElementById(modalOverlayOrId)
    : modalOverlayOrId;

  if (!container) return;
  const modal = container.querySelector('.modal') || container;
  if (modal) {
    modal.style.transform = '';
  }
  const containerKey = container.id || modal?.id || container;
  modalPositions.delete(containerKey);
}

// Window resize listener: keep dragged modals and panels within viewport bounds
if (typeof window !== 'undefined') {
  window.addEventListener('resize', () => {
    const dialogs = document.querySelectorAll(
      '.modal-overlay:not(.hidden), [data-draggable-modal]:not(.hidden), #fpv-editor-panel:not(.hidden), #video-cast-panel:not(.hidden), #elevation-profile-drawer:not(.hidden), #replay-2d-bar:not(.hidden), #diag-wireframe-panel:not(.hidden), #bridge-status-popover:not(.hidden), #telemetry-weather-popover:not(.hidden), #mission-time-popover:not(.hidden), #adsb-control-drawer:not(.hidden), #remote-id-calibration-panel:not(.hidden), #stats-panel:not(.hidden), #three-hud-legend:not(.hidden), #three-hud-controls:not(.hidden), #three-instructions:not(.hidden), #diag-hud-overlay:not(.hidden), #diag-hud-controls:not(.hidden), #diag-path-legend:not(.hidden), #map-mission-legend:not(.hidden), #airspace-legend-container:not(.hidden), #wp-heading-help-popover:not([style*="display: none"])'
    );
    dialogs.forEach(dialog => {
      const modal = dialog.querySelector('.modal') || dialog;
      const handle = modal?.querySelector('[data-modal-drag-handle]') || modal;
      const isCenterX = modal.classList.contains('elevation-profile-drawer') ||
                        modal.classList.contains('replay-2d-bar') ||
                        modal.hasAttribute('data-center-x') ||
                        dialog.hasAttribute('data-center-x');
      if (modal && modal.style.transform) {
        const parsed = parseModalTransform(modal.style.transform);
        const clamped = clampModalPosition(modal, handle, parsed.x, parsed.y);
        modal.style.transform = formatModalTransform(clamped.x, clamped.y, isCenterX);
        const containerKey = dialog.id || modal.id || dialog;
        modalPositions.set(containerKey, clamped);
      }
    });
  });

  window.parseModalTransform = parseModalTransform;
  window.formatModalTransform = formatModalTransform;
  window.initModalDraggable = initModalDraggable;
  window.initAllModalsDraggable = initAllModalsDraggable;
  window.initUniversalModalCollapseToggles = initUniversalModalCollapseToggles;
  window.resetModalPosition = resetModalPosition;
  window.clampModalPosition = clampModalPosition;
  window.ensureElementInViewport = ensureElementInViewport;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initAllModalsDraggable());
  } else {
    initAllModalsDraggable();
  }
}
