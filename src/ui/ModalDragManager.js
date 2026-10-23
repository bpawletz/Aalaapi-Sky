/**
 * Aalaapi Sky - Modal Drag Manager
 * Enables smooth pointer/touch-based dragging across all modal dialogs.
 * 
 * Features:
 * - Seamless pointer capture (mouse, stylus, touch).
 * - Interactive child element filtering (buttons, inputs, tabs, links never trigger drag).
 * - Viewport boundary clamping to guarantee header and close buttons remain accessible.
 * - Session position persistence so modals do not snap back and cover active waypoints.
 * - Double-click header shortcut to quickly re-center modal.
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
export function clampModalPosition(modal, handle, proposedX, proposedY) {
  if (typeof window === 'undefined') {
    return { x: proposedX, y: proposedY };
  }

  const modalRect = modal.getBoundingClientRect();
  const handleRect = handle.getBoundingClientRect();

  // Compute current untranslated baseline rect or current unshifted bounds
  // In our setup, transform is translate3d(currentX, currentY, 0)
  const styleTransform = modal.style.transform || '';
  let curX = 0;
  let curY = 0;
  const match = styleTransform.match(/translate3d\(\s*(-?\d+(?:\.\d+)?)\s*px\s*,\s*(-?\d+(?:\.\d+)?)\s*px/);
  if (match) {
    curX = parseFloat(match[1]) || 0;
    curY = parseFloat(match[2]) || 0;
  }

  // Base bounding rect without current transform
  const baseLeft = modalRect.left - curX;
  const baseTop = modalRect.top - curY;
  const modalWidth = modalRect.width || 400;
  const modalHeight = modalRect.height || 300;
  const handleHeight = handleRect.height || 48;

  const winW = window.innerWidth;
  const winH = window.innerHeight;

  // Viewport bounds:
  // Top: Keep header top inside screen (at least 0px, max winH - handleHeight)
  const minShiftY = -baseTop;
  const maxShiftY = winH - handleHeight - baseTop;

  // Horizontal: Keep at least 60px of the modal visible on left and right
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
 * Initializes dragging capability for an individual modal overlay.
 * 
 * @param {HTMLElement|string} modalOverlayOrId 
 * @returns {boolean} True if successfully initialized
 */
export function initModalDraggable(modalOverlayOrId) {
  const overlay = typeof modalOverlayOrId === 'string'
    ? document.getElementById(modalOverlayOrId)
    : modalOverlayOrId;

  if (!overlay || overlay._modalDraggableInitialized) {
    return false;
  }

  const modal = overlay.querySelector('.modal');
  if (!modal) {
    return false;
  }

  // Identify handle: .modal-header, .photo-inspector-header, [data-modal-drag-handle], or first header/div
  const handle = modal.querySelector('.modal-header, .photo-inspector-header, [data-modal-drag-handle]') ||
                 modal.querySelector('header') ||
                 modal.firstElementChild;

  if (!handle) {
    return false;
  }

  overlay._modalDraggableInitialized = true;
  modal.setAttribute('data-draggable-modal', 'true');
  handle.setAttribute('data-modal-drag-handle', 'true');

  let isDragging = false;
  let startPointerX = 0;
  let startPointerY = 0;
  let currentTranslateX = 0;
  let currentTranslateY = 0;
  let activePointerId = null;

  // Restore saved position if previously dragged in this session
  const overlayKey = overlay.id || modal.id || overlay;
  if (modalPositions.has(overlayKey)) {
    const saved = modalPositions.get(overlayKey);
    currentTranslateX = saved.x;
    currentTranslateY = saved.y;
    modal.style.transform = `translate3d(${currentTranslateX}px, ${currentTranslateY}px, 0)`;
  }

  // Check if interactive child element clicked
  function isInteractiveElement(target) {
    return !!target.closest(
      'button, input, textarea, select, a, [role="button"], .close-btn, .tab-btn, .modal-tab-btn, .stepper-step, [data-no-drag]'
    );
  }

  function onPointerDown(e) {
    // Only primary mouse button (0) or touch/pen
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    // Ignore interactive controls inside header
    if (isInteractiveElement(e.target)) return;

    // Ignore if modal is explicitly full-screened
    if (modal.classList.contains('fullscreen-3d') || modal.classList.contains('is-fullscreen')) {
      return;
    }

    isDragging = true;
    activePointerId = e.pointerId;
    startPointerX = e.clientX;
    startPointerY = e.clientY;

    // Parse current transform
    const styleTransform = modal.style.transform || '';
    const match = styleTransform.match(/translate3d\(\s*(-?\d+(?:\.\d+)?)\s*px\s*,\s*(-?\d+(?:\.\d+)?)\s*px/);
    if (match) {
      currentTranslateX = parseFloat(match[1]) || 0;
      currentTranslateY = parseFloat(match[2]) || 0;
    } else {
      currentTranslateX = 0;
      currentTranslateY = 0;
    }

    modal.classList.add('modal-dragging');
    document.body.classList.add('modal-drag-active');

    try {
      handle.setPointerCapture(e.pointerId);
    } catch (_) {}

    e.preventDefault();
  }

  function onPointerMove(e) {
    if (!isDragging || (activePointerId !== null && e.pointerId !== activePointerId)) {
      return;
    }

    const deltaX = e.clientX - startPointerX;
    const deltaY = e.clientY - startPointerY;

    const proposedX = currentTranslateX + deltaX;
    const proposedY = currentTranslateY + deltaY;

    const clamped = clampModalPosition(modal, handle, proposedX, proposedY);
    modal.style.transform = `translate3d(${clamped.x}px, ${clamped.y}px, 0)`;
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

    // Save final clamped position
    const styleTransform = modal.style.transform || '';
    const match = styleTransform.match(/translate3d\(\s*(-?\d+(?:\.\d+)?)\s*px\s*,\s*(-?\d+(?:\.\d+)?)\s*px/);
    if (match) {
      currentTranslateX = parseFloat(match[1]) || 0;
      currentTranslateY = parseFloat(match[2]) || 0;
      modalPositions.set(overlayKey, { x: currentTranslateX, y: currentTranslateY });
    }
  }

  // Double-click on header to instantly re-center
  function onDblClick(e) {
    if (isInteractiveElement(e.target)) return;
    modal.style.transform = '';
    currentTranslateX = 0;
    currentTranslateY = 0;
    modalPositions.delete(overlayKey);
  }

  handle.addEventListener('pointerdown', onPointerDown);
  handle.addEventListener('pointermove', onPointerMove);
  handle.addEventListener('pointerup', endDrag);
  handle.addEventListener('pointercancel', endDrag);
  handle.addEventListener('dblclick', onDblClick);

  // When overlay opens/unhides, auto-clamp position in case window size changed
  const ObserverClass = (typeof MutationObserver !== 'undefined' && MutationObserver) ||
                        (typeof window !== 'undefined' && window.MutationObserver) ||
                        null;

  if (ObserverClass) {
    const observer = new ObserverClass(mutations => {
      for (const m of mutations) {
        if (m.type === 'attributes' && m.attributeName === 'class') {
          if (!overlay.classList.contains('hidden') && modalPositions.has(overlayKey)) {
            const pos = modalPositions.get(overlayKey);
            const clamped = clampModalPosition(modal, handle, pos.x, pos.y);
            modal.style.transform = `translate3d(${clamped.x}px, ${clamped.y}px, 0)`;
            modalPositions.set(overlayKey, clamped);
          }
        }
      }
    });

    observer.observe(overlay, { attributes: true, attributeFilter: ['class'] });
  }

  return true;
}

/**
 * Initializes all modal overlays in the document with draggable capability.
 */
export function initAllModalsDraggable() {
  if (typeof document === 'undefined') return;

  const overlays = document.querySelectorAll('.modal-overlay');
  overlays.forEach(overlay => {
    initModalDraggable(overlay);
  });
}

/**
 * Resets a modal's dragged position back to center.
 * @param {HTMLElement|string} modalOverlayOrId 
 */
export function resetModalPosition(modalOverlayOrId) {
  const overlay = typeof modalOverlayOrId === 'string'
    ? document.getElementById(modalOverlayOrId)
    : modalOverlayOrId;

  if (!overlay) return;
  const modal = overlay.querySelector('.modal');
  if (modal) {
    modal.style.transform = '';
  }
  const overlayKey = overlay.id || modal?.id || overlay;
  modalPositions.delete(overlayKey);
}

// Window resize listener: keep dragged modals within viewport bounds
if (typeof window !== 'undefined') {
  window.addEventListener('resize', () => {
    const overlays = document.querySelectorAll('.modal-overlay:not(.hidden)');
    overlays.forEach(overlay => {
      const modal = overlay.querySelector('.modal');
      const handle = modal?.querySelector('[data-modal-drag-handle]');
      if (modal && handle && modal.style.transform) {
        const match = modal.style.transform.match(/translate3d\(\s*(-?\d+(?:\.\d+)?)\s*px\s*,\s*(-?\d+(?:\.\d+)?)\s*px/);
        if (match) {
          const curX = parseFloat(match[1]) || 0;
          const curY = parseFloat(match[2]) || 0;
          const clamped = clampModalPosition(modal, handle, curX, curY);
          modal.style.transform = `translate3d(${clamped.x}px, ${clamped.y}px, 0)`;
          const overlayKey = overlay.id || modal.id || overlay;
          modalPositions.set(overlayKey, clamped);
        }
      }
    });
  });

  window.initModalDraggable = initModalDraggable;
  window.initAllModalsDraggable = initAllModalsDraggable;
  window.resetModalPosition = resetModalPosition;
  window.clampModalPosition = clampModalPosition;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initAllModalsDraggable());
  } else {
    initAllModalsDraggable();
  }
}
