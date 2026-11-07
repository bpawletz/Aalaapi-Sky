/**
 * Aalaapi Sky - On-Device Mobile Debug Console
 *
 * Captures in-browser and native webview logs, warnings, and errors in a lightweight
 * circular buffer (last 200 entries) accessible directly on Android and touch devices
 * by triple-tapping the version badge in the sidebar header, or via the About modal.
 */

class DebugConsoleManager {
  constructor() {
    this.logs = [];
    this.maxLogs = 200;
    this.activeFilter = 'all';
    this.searchTerm = '';
    this.isOpen = false;
    this._originalConsole = null;
    this._tapCount = 0;
    this._lastTapTime = 0;
  }

  init() {
    this.hookConsole();
    this.bindEvents();
  }

  hookConsole() {
    if (this._originalConsole || typeof console === 'undefined') return;

    this._originalConsole = {
      log: console.log.bind(console),
      info: (console.info || console.log).bind(console),
      warn: (console.warn || console.log).bind(console),
      error: (console.error || console.log).bind(console)
    };

    const self = this;

    console.log = function (...args) {
      self._originalConsole.log(...args);
      self.captureLog('info', args);
    };

    console.info = function (...args) {
      self._originalConsole.info(...args);
      self.captureLog('info', args);
    };

    console.warn = function (...args) {
      self._originalConsole.warn(...args);
      self.captureLog('warn', args);
    };

    console.error = function (...args) {
      self._originalConsole.error(...args);
      self.captureLog('error', args);
    };

    // Also capture unhandled errors and promise rejections
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('error', (event) => {
        self.captureLog('error', [event.message || 'Script error', `${event.filename || ''}:${event.lineno || 0}:${event.colno || 0}`]);
      });

      window.addEventListener('unhandledrejection', (event) => {
        self.captureLog('error', ['Unhandled Promise Rejection:', event.reason]);
      });
    }
  }

  captureLog(level, args) {
    try {
      const formatted = args.map(arg => {
        if (arg === null) return 'null';
        if (arg === undefined) return 'undefined';
        if (arg instanceof Error || (arg && typeof arg === 'object' && ('message' in arg || 'stack' in arg))) {
          return arg.stack || `${arg.name || 'Error'}: ${arg.message || ''}`;
        }
        if (typeof arg === 'object') {
          try {
            const str = JSON.stringify(arg);
            return str === '{}' ? String(arg) : str;
          } catch (_) {
            return String(arg);
          }
        }
        return String(arg);
      }).join(' ');

      const entry = {
        id: Date.now() + Math.random(),
        time: new Date(),
        level: level, // 'info', 'warn', 'error'
        message: formatted
      };

      this.logs.push(entry);
      if (this.logs.length > this.maxLogs) {
        this.logs.shift();
      }

      if (this.isOpen) {
        this.renderLogs();
      }
    } catch (_) {}
  }

  bindEvents() {
    if (typeof document === 'undefined') return;

    // Triple-tap listener on version badges (.header-version-badge and .version-tag)
    const attachTripleTap = (elem) => {
      if (!elem) return;
      elem.style = elem.style || {};
      elem.style.cursor = 'pointer';
      if (typeof elem.setAttribute === 'function') {
        elem.setAttribute('title', 'Triple-tap to open Mobile Debug Console');
      }

      if (typeof elem.addEventListener === 'function') {
        elem.addEventListener('click', (e) => {
          const now = Date.now();
          if (now - this._lastTapTime < 600) {
            this._tapCount++;
          } else {
            this._tapCount = 1;
          }
          this._lastTapTime = now;

          if (this._tapCount >= 3) {
            if (e && typeof e.preventDefault === 'function') e.preventDefault();
            if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
            this._tapCount = 0;
            this.open();
          }
        });
      }
    };

    if (typeof document.querySelector === 'function') {
      const headerBadge = document.querySelector('.header-version-badge');
      if (headerBadge) attachTripleTap(headerBadge);

      const versionTag = document.querySelector('.version-tag');
      if (versionTag) attachTripleTap(versionTag);
    }

    // Direct button in About modal
    if (typeof document.getElementById === 'function') {
      const aboutDebugBtn = document.getElementById('about-open-debug-console-btn');
      if (aboutDebugBtn && typeof aboutDebugBtn.addEventListener === 'function') {
        aboutDebugBtn.addEventListener('click', () => this.open());
      }

      // Modal controls
      const closeBtn = document.getElementById('close-debug-console-btn');
      if (closeBtn && typeof closeBtn.addEventListener === 'function') {
        closeBtn.addEventListener('click', () => this.close());
      }

      const modal = document.getElementById('debug-console-modal');
      if (modal && typeof modal.addEventListener === 'function') {
        modal.addEventListener('click', (e) => {
          if (e.target === modal) this.close();
        });
      }

      // Filter tabs
      const filterAll = document.getElementById('debug-filter-all');
      const filterError = document.getElementById('debug-filter-error');
      const filterWarn = document.getElementById('debug-filter-warn');
      const filterInfo = document.getElementById('debug-filter-info');

      const setFilter = (lvl, btn) => {
        this.activeFilter = lvl;
        [filterAll, filterError, filterWarn, filterInfo].forEach(b => {
          if (b && b.classList) b.classList.remove('active');
        });
        if (btn && btn.classList) btn.classList.add('active');
        this.renderLogs();
      };

      if (filterAll && typeof filterAll.addEventListener === 'function') filterAll.addEventListener('click', () => setFilter('all', filterAll));
      if (filterError && typeof filterError.addEventListener === 'function') filterError.addEventListener('click', () => setFilter('error', filterError));
      if (filterWarn && typeof filterWarn.addEventListener === 'function') filterWarn.addEventListener('click', () => setFilter('warn', filterWarn));
      if (filterInfo && typeof filterInfo.addEventListener === 'function') filterInfo.addEventListener('click', () => setFilter('info', filterInfo));

      // Search input
      const searchInput = document.getElementById('debug-console-search');
      if (searchInput && typeof searchInput.addEventListener === 'function') {
        searchInput.addEventListener('input', (e) => {
          this.searchTerm = (e.target.value || '').toLowerCase().trim();
          this.renderLogs();
        });
      }

      // Copy logs button
      const copyBtn = document.getElementById('debug-copy-logs-btn');
      if (copyBtn && typeof copyBtn.addEventListener === 'function') {
        copyBtn.addEventListener('click', () => this.copyLogs());
      }

      // Clear logs button
      const clearBtn = document.getElementById('debug-clear-logs-btn');
      if (clearBtn && typeof clearBtn.addEventListener === 'function') {
        clearBtn.addEventListener('click', () => this.clearLogs());
      }
    }
  }

  open() {
    this.isOpen = true;
    if (typeof document === 'undefined' || typeof document.getElementById !== 'function') return;
    const modal = document.getElementById('debug-console-modal');
    if (modal) {
      if (modal.classList) modal.classList.remove('hidden');
      modal.style = modal.style || {};
      modal.style.display = 'flex';
      this.renderLogs();
      const output = document.getElementById('debug-console-output');
      if (output) {
        output.scrollTop = output.scrollHeight;
      }
    }
  }

  close() {
    this.isOpen = false;
    if (typeof document === 'undefined' || typeof document.getElementById !== 'function') return;
    const modal = document.getElementById('debug-console-modal');
    if (modal) {
      if (modal.classList) modal.classList.add('hidden');
      modal.style = modal.style || {};
      modal.style.display = 'none';
    }
  }

  getFilteredLogs() {
    return this.logs.filter(entry => {
      if (this.activeFilter !== 'all' && entry.level !== this.activeFilter) {
        return false;
      }
      if (this.searchTerm && !entry.message.toLowerCase().includes(this.searchTerm)) {
        return false;
      }
      return true;
    });
  }

  renderLogs() {
    if (typeof document === 'undefined' || typeof document.getElementById !== 'function') return;
    const output = document.getElementById('debug-console-output');
    const badge = document.getElementById('debug-console-count-badge');
    const filtered = this.getFilteredLogs();

    if (badge) {
      badge.textContent = `${filtered.length} / ${this.logs.length} logs`;
    }

    if (!output) return;

    if (filtered.length === 0) {
      output.innerHTML = `
        <div style="color: var(--text-muted); text-align: center; padding: 30px 0; font-size: 0.82rem;">
          No log entries matching filter.
        </div>
      `;
      return;
    }

    const html = filtered.map(entry => {
      const timeStr = entry.time.toTimeString().split(' ')[0] + '.' + String(entry.time.getMilliseconds()).padStart(3, '0');
      let color = '#94a3b8'; // info
      let icon = 'ℹ️';
      let bg = 'rgba(255, 255, 255, 0.02)';

      if (entry.level === 'warn') {
        color = '#fbbf24';
        icon = '⚠️';
        bg = 'rgba(251, 191, 36, 0.08)';
      } else if (entry.level === 'error') {
        color = '#f87171';
        icon = '❌';
        bg = 'rgba(248, 113, 113, 0.12)';
      }

      // Escape HTML
      const escaped = entry.message
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      return `
        <div style="padding: 4px 8px; border-radius: 4px; background: ${bg}; border-left: 3px solid ${color}; word-break: break-all; margin-bottom: 2px;">
          <span style="color: var(--text-muted); font-size: 0.68rem; margin-right: 6px;">[${timeStr}]</span>
          <span style="margin-right: 4px;">${icon}</span>
          <span style="color: ${color};">${escaped}</span>
        </div>
      `;
    }).join('');

    output.innerHTML = html;
  }

  async copyLogs() {
    const lines = this.getFilteredLogs().map(e => {
      const timeStr = e.time.toISOString();
      return `[${timeStr}] [${e.level.toUpperCase()}] ${e.message}`;
    });

    const textToCopy = lines.join('\n');
    let success = false;

    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(textToCopy);
        success = true;
      } catch (_) {}
    }

    if (!success && typeof document !== 'undefined') {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = textToCopy;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        success = true;
      } catch (_) {}
    }

    const copyBtn = (typeof document !== 'undefined' && typeof document.getElementById === 'function') ? document.getElementById('debug-copy-logs-btn') : null;
    if (copyBtn) {
      const origText = copyBtn.innerHTML;
      copyBtn.innerHTML = `<span>✅ Copied ${lines.length} lines!</span>`;
      setTimeout(() => {
        copyBtn.innerHTML = origText;
      }, 2000);
    }

    if (typeof showToast === 'function') {
      showToast(`📋 Copied ${lines.length} log lines to clipboard`, 'success');
    }
  }

  clearLogs() {
    this.logs = [];
    this.renderLogs();
    if (typeof showToast === 'function') {
      showToast('🗑️ Debug console logs cleared', 'info');
    }
  }
}

const DebugConsole = new DebugConsoleManager();

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => DebugConsole.init());
  } else {
    DebugConsole.init();
  }
}

if (typeof window !== 'undefined') {
  window.DebugConsole = DebugConsole;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DebugConsoleManager,
    DebugConsole
  };
}
