/**
 * src/bridge/VideoCastClient.js
 * Aalaapi Sky - Real-Time Video Casting & Recording Client
 *
 * Subscribes to the binary WebSocket feed from the companion bridge (ws://.../api/video/stream),
 * renders low-latency frames to HTML5 <canvas> viewports, and provides controls for live
 * local MP4 recording and stream source switching.
 */

class VideoCastClient {
  constructor() {
    this.ws = null;
    this.isConnected = false;
    this.isConnecting = false;
    this.autoReconnect = true;
    this.reconnectTimer = null;
    this.currentSource = 'test';
    this.isRecording = false;
    this.recordDurationSec = 0;
    this.recordTimer = null;
    this.frameCount = 0;
    this.fps = 0;
    this.fpsInterval = null;
    this.canvases = new Set();
    this.isPanelMinimized = false;
    this.fpvVideoEnabled = true;
    this.lastFrameTime = 0;
    this.listenersAttached = false;
    this.hasReceivedSseRtmp = false;
    this.userSelectedManualSource = false;
  }

  /**
   * Resolves the WebSocket URL based on the companion API base URL.
   */
  getWsUrl(explicitBase = null) {
    let base = explicitBase;
    if (!base) {
      base = (typeof getCompanionApiBase === 'function')
        ? getCompanionApiBase()
        : (typeof COMPANION_API_BASE !== 'undefined' ? COMPANION_API_BASE : 'http://127.0.0.1:8765');
    }

    const cleanBase = String(base || '').replace(/\/+$/, '');
    if (cleanBase.startsWith('https://')) {
      return cleanBase.replace(/^https:\/\//i, 'wss://') + '/api/video/stream';
    }
    return cleanBase.replace(/^http:\/\//i, 'ws://') + '/api/video/stream';
  }

  /**
   * Establishes a persistent binary WebSocket connection to the stream endpoint.
   */
  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    const wsUrl = this.getWsUrl();
    this.isConnecting = true;
    this.updateStatusBadge('connecting');

    try {
      this.ws = new WebSocket(wsUrl);
      this.ws.binaryType = 'arraybuffer';

      this.ws.onopen = () => {
        this.isConnected = true;
        this.isConnecting = false;
        this.updateStatusBadge('connected');
        this.startFpsCounter();
        this.fetchStatus();
      };

      this.ws.onmessage = (event) => {
        if (!event.data) return;
        this.frameCount++;
        this.lastFrameTime = Date.now();
        this.renderFrame(event.data);
      };

      this.ws.onclose = () => {
        this.cleanupConnection();
        this.updateStatusBadge('disconnected');
        if (this.autoReconnect) {
          this.reconnectTimer = setTimeout(() => {
            this.connect();
          }, 2000);
        }
      };

      this.ws.onerror = () => {
        try { this.ws.close(); } catch (_) {}
      };
    } catch (err) {
      this.cleanupConnection();
      this.updateStatusBadge('disconnected');
      if (this.autoReconnect) {
        this.reconnectTimer = setTimeout(() => {
          this.connect();
        }, 2000);
      }
    }
  }

  cleanupConnection() {
    this.isConnected = false;
    this.isConnecting = false;
    if (this.fpsInterval) {
      clearInterval(this.fpsInterval);
      this.fpsInterval = null;
    }
    this.fps = 0;
    this.updateFpsDisplay();
  }

  disconnect() {
    this.autoReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try { this.ws.close(); } catch (_) {}
      this.ws = null;
    }
    this.cleanupConnection();
  }

  startFpsCounter() {
    if (this.fpsInterval) clearInterval(this.fpsInterval);
    this.frameCount = 0;
    this.fpsInterval = setInterval(() => {
      this.fps = this.frameCount;
      this.frameCount = 0;
      this.updateFpsDisplay();
    }, 1000);
  }

  updateFpsDisplay() {
    if (typeof document === 'undefined') return;
    const badge = document.getElementById('video-cast-fps-badge');
    if (badge) {
      badge.textContent = `${this.fps} FPS`;
    }
  }

  registerCanvas(canvas) {
    if (canvas) this.canvases.add(canvas);
  }

  unregisterCanvas(canvas) {
    if (canvas) this.canvases.delete(canvas);
  }

  /**
   * Decodes incoming JPEG ArrayBuffer / Blob and paints to registered canvases.
   */
  async renderFrame(rawData) {
    if (typeof document === 'undefined') return;

    // Discover active canvases if not explicitly registered
    const castCanvas = document.getElementById('video-cast-canvas');
    const fpvCanvas = document.getElementById('fpv-video-canvas');
    if (castCanvas) this.canvases.add(castCanvas);
    if (fpvCanvas) this.canvases.add(fpvCanvas);

    if (this.canvases.size === 0) return;

    const blob = rawData instanceof Blob ? rawData : new Blob([rawData], { type: 'image/jpeg' });

    try {
      if (typeof createImageBitmap === 'function') {
        const bmp = await createImageBitmap(blob);
        for (const canvas of this.canvases) {
          if (!canvas || !canvas.isConnected) continue;
          if (canvas.id === 'fpv-video-canvas' && !this.fpvVideoEnabled) continue;

          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
          }
        }
        bmp.close();
      } else {
        // Fallback for environments without createImageBitmap
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
          for (const canvas of this.canvases) {
            if (!canvas || !canvas.isConnected) continue;
            if (canvas.id === 'fpv-video-canvas' && !this.fpvVideoEnabled) continue;

            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            }
          }
          URL.revokeObjectURL(url);
        };
        img.src = url;
      }
    } catch (_) {}
  }

  /**
   * Fetches current video and recording status from companion REST API.
   */
  async fetchStatus() {
    if (typeof fetch === 'undefined') return;
    const base = (typeof getCompanionApiBase === 'function')
      ? getCompanionApiBase()
      : (typeof COMPANION_API_BASE !== 'undefined' ? COMPANION_API_BASE : 'http://127.0.0.1:8765');

    try {
      const res = await fetch(`${base}/api/video/status`);
      if (res.ok) {
        const data = await res.json();
        if (data.source) {
          this.currentSource = data.source;
          this.updateSourceUI(data.source);
        }
        if (data.recording !== undefined) {
          this.setRecordingState(data.recording, data.recordDurationSec || 0);
        }
      }
    } catch (_) {}

    if (!this.hasReceivedSseRtmp) {
      await this.fetchRtmpStatus();
    }
  }

  /**
   * Fetches embedded RTMP server and firewall status from companion bridge.
   */
  async fetchRtmpStatus() {
    if (typeof fetch === 'undefined') return;
    const base = (typeof getCompanionApiBase === 'function')
      ? getCompanionApiBase()
      : (typeof COMPANION_API_BASE !== 'undefined' ? COMPANION_API_BASE : 'http://127.0.0.1:8765');

    try {
      const res = await fetch(`${base}/api/video/rtmp/status`);
      if (res.ok) {
        const data = await res.json();
        this.updateRtmpUI(data);
      }
    } catch (_) {}
  }

  /**
   * Updates RTMP URL, active streaming indicators, and firewall badges in the UI.
   */
  updateRtmpUI(data) {
    if (typeof document === 'undefined' || !data) return;
    this.hasReceivedSseRtmp = true;

    const primary = data.primaryUrl || (data.lanUrls && data.lanUrls[0]) || 'rtmp://127.0.0.1:1935/live/stream';

    const urlCode = document.getElementById('video-cast-rtmp-url-text');
    if (urlCode && primary) {
      urlCode.textContent = primary;
    }

    const sidebarCode = document.getElementById('sidebar-video-rtmp-url');
    if (sidebarCode && primary) {
      sidebarCode.textContent = primary;
    }

    const popoverCode = document.getElementById('companion-rtmp-url-code');
    if (popoverCode && primary) {
      popoverCode.textContent = primary;
    }

    const fwBadge = document.getElementById('video-cast-fw-badge');
    if (fwBadge && data.firewall) {
      if (data.firewall.open) {
        fwBadge.className = 'video-cast-fw-badge is-open';
        fwBadge.textContent = '🟢 Port 1935 Open';
        fwBadge.title = data.firewall.message || 'Port 1935 is open in Windows Firewall';
      } else {
        fwBadge.className = 'video-cast-fw-badge is-blocked';
        fwBadge.textContent = '⚠️ Port 1935 Rule Needed';
        fwBadge.title = data.firewall.message || 'Run setup-rtmp-firewall.bat to open port 1935';
      }
    }

    const popoverBadge = document.getElementById('companion-rtmp-badge');
    const popoverDot = document.getElementById('companion-rtmp-dot');

    // Active RTMP stream indicator
    const tip = document.getElementById('video-cast-rtmp-tip');
    const statusText = document.getElementById('video-cast-status-text');
    const sidebarPill = document.getElementById('sidebar-video-status-pill');

    // Dynamic Ingest Source Selector Population
    const srcSelect = document.getElementById('video-cast-source-select');
    if (srcSelect) {
      // Find the primary embedded RTMP option
      let rtmpDefaultOpt = srcSelect.querySelector('option[data-rtmp-default="true"]');
      if (!rtmpDefaultOpt) {
        rtmpDefaultOpt = Array.from(srcSelect.options).find(o => (o.value && o.value.includes(':1935/live/stream')) || o.value === 'rtmp://127.0.0.1:1935/live/stream');
        if (rtmpDefaultOpt) rtmpDefaultOpt.setAttribute('data-rtmp-default', 'true');
      }

      // Remove any previously appended dynamic secondary stream options
      srcSelect.querySelectorAll('.dynamic-rtmp-stream-opt').forEach(el => el.remove());

      if (data.activeStreams && data.activeStreams.length > 0) {
        const port = data.port || 1935;
        data.activeStreams.forEach((stream, idx) => {
          const streamPath = stream.path || 'live/stream';
          const localUrl = `rtmp://127.0.0.1:${port}/${streamPath}`;
          const label = `🟢 ${idx === 0 ? 'RC 2 Live Stream' : `Drone Stream (${streamPath})`} (${stream.publisherIp} - ${streamPath})`;

          if (idx === 0 && rtmpDefaultOpt) {
            rtmpDefaultOpt.textContent = label;
            rtmpDefaultOpt.value = localUrl;
          } else {
            const opt = document.createElement('option');
            opt.className = 'dynamic-rtmp-stream-opt';
            opt.value = localUrl;
            opt.textContent = label;
            if (rtmpDefaultOpt && rtmpDefaultOpt.nextSibling) {
              srcSelect.insertBefore(opt, rtmpDefaultOpt.nextSibling);
            } else {
              srcSelect.appendChild(opt);
            }
          }
        });

        // If the client is currently on test pattern and user has not manually switched away,
        // auto-select the active stream so video appears immediately
        if ((srcSelect.value === 'test' || this.currentSource === 'test') && !this.userSelectedManualSource) {
          const firstStreamUrl = `rtmp://127.0.0.1:${port}/${data.activeStreams[0].path || 'live/stream'}`;
          srcSelect.value = firstStreamUrl;
          this.setSource(firstStreamUrl);
        }
      } else {
        this.userSelectedManualSource = false;
        if (rtmpDefaultOpt) {
          rtmpDefaultOpt.textContent = 'Embedded RTMP Ingest (DJI RC 2 / Live Push) - Waiting for feed';
          rtmpDefaultOpt.value = `rtmp://127.0.0.1:${data.port || 1935}/live/stream`;
        }
      }
    }

    if (data.activeStreams && data.activeStreams.length > 0) {
      const active = data.activeStreams[0];
      const activePath = active.path || 'live/stream';
      const activeUrl = primary.replace(/\/live\/stream$/, '') + '/' + activePath;

      if (tip) {
        tip.innerHTML = `<span style="color: #34d399; font-weight: 700;">🟢 ACTIVE STREAM: <span style="font-family: monospace; color: #38bdf8;">${activeUrl}</span> (from ${active.publisherIp}, ${active.durationSec}s)</span>`;
      }
      if (statusText) {
        statusText.textContent = 'LIVE (RC 2)';
        statusText.style.color = '#34d399';
      }
      if (sidebarPill) {
        sidebarPill.textContent = 'LIVE (RC 2)';
        sidebarPill.style.background = 'rgba(16, 185, 129, 0.2)';
        sidebarPill.style.color = '#34d399';
        sidebarPill.style.borderColor = 'rgba(16, 185, 129, 0.4)';
        sidebarPill.title = `Active RTMP Feed: ${activeUrl} from ${active.publisherIp}`;
      }
      if (popoverBadge) {
        popoverBadge.textContent = 'Streaming';
        popoverBadge.style.color = '#34d399';
      }
      if (popoverDot) {
        popoverDot.style.background = '#10b981';
      }
    } else {
      if (tip) {
        tip.textContent = 'In DJI Fly: Settings → Transmission → Live Streaming → RTMP.';
      }
      if (popoverBadge) {
        popoverBadge.textContent = data.listening ? 'Listening' : 'Offline';
        popoverBadge.style.color = data.listening ? '#38bdf8' : '#94a3b8';
      }
      if (popoverDot) {
        popoverDot.style.background = data.listening ? '#06b6d4' : '#64748b';
      }
    }
  }

  /**
   * Switches video stream source (RTMP URL, UVC device index, or 'test').
   */
  async setSource(source) {
    if (typeof fetch === 'undefined') return;
    const base = (typeof getCompanionApiBase === 'function')
      ? getCompanionApiBase()
      : (typeof COMPANION_API_BASE !== 'undefined' ? COMPANION_API_BASE : 'http://127.0.0.1:8765');

    try {
      const res = await fetch(`${base}/api/video/source`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source })
      });
      if (res.ok) {
        this.currentSource = source;
        this.updateSourceUI(source);
      }
    } catch (_) {}
  }

  /**
   * Starts local lossless recording.
   */
  async startRecording() {
    if (this.isRecording) return;
    if (typeof fetch === 'undefined') return;
    const base = (typeof getCompanionApiBase === 'function')
      ? getCompanionApiBase()
      : (typeof COMPANION_API_BASE !== 'undefined' ? COMPANION_API_BASE : 'http://127.0.0.1:8765');

    try {
      const res = await fetch(`${base}/api/record/start`, { method: 'POST' });
      const data = await res.json();
      if (data.success || data.recording) {
        this.setRecordingState(true, 0);
      }
    } catch (_) {}
  }

  /**
   * Stops local lossless recording.
   */
  async stopRecording() {
    if (!this.isRecording) return;
    if (typeof fetch === 'undefined') return;
    const base = (typeof getCompanionApiBase === 'function')
      ? getCompanionApiBase()
      : (typeof COMPANION_API_BASE !== 'undefined' ? COMPANION_API_BASE : 'http://127.0.0.1:8765');

    try {
      const res = await fetch(`${base}/api/record/stop`, { method: 'POST' });
      const data = await res.json();
      this.setRecordingState(false, 0);
      return data;
    } catch (_) {
      this.setRecordingState(false, 0);
    }
  }

  toggleRecording() {
    if (this.isRecording) {
      this.stopRecording();
    } else {
      this.startRecording();
    }
  }

  setRecordingState(isRec, initialDurationSec = 0) {
    this.isRecording = !!isRec;
    this.recordDurationSec = initialDurationSec;

    if (this.recordTimer) {
      clearInterval(this.recordTimer);
      this.recordTimer = null;
    }

    if (this.isRecording) {
      this.recordTimer = setInterval(() => {
        this.recordDurationSec++;
        this.updateRecordTimerUI();
      }, 1000);
    }

    this.updateRecordTimerUI();
    this.updateRecordButtonsUI();
  }

  updateRecordTimerUI() {
    if (typeof document === 'undefined') return;
    const mins = Math.floor(this.recordDurationSec / 60).toString().padStart(2, '0');
    const secs = (this.recordDurationSec % 60).toString().padStart(2, '0');
    const formatted = `${mins}:${secs}`;

    const timerDisplays = [
      document.getElementById('video-cast-rec-timer'),
      document.getElementById('fpv-hud-rec-timer')
    ];

    timerDisplays.forEach(el => {
      if (el) el.textContent = formatted;
    });
  }

  updateRecordButtonsUI() {
    if (typeof document === 'undefined') return;
    const castRecBtn = document.getElementById('video-cast-rec-btn');
    const fpvRecBtn = document.getElementById('fpv-hud-rec-btn');
    const timerDisplays = [
      document.getElementById('video-cast-rec-timer'),
      document.getElementById('fpv-hud-rec-timer')
    ];

    const buttons = [castRecBtn, fpvRecBtn].filter(Boolean);

    buttons.forEach(btn => {
      if (this.isRecording) {
        btn.classList.add('is-recording');
        btn.setAttribute('aria-pressed', 'true');
        btn.title = 'Stop Local Recording';
      } else {
        btn.classList.remove('is-recording');
        btn.setAttribute('aria-pressed', 'false');
        btn.title = 'Start Local Recording to .mp4';
      }
    });

    timerDisplays.forEach(el => {
      if (el) {
        if (this.isRecording) {
          el.classList.remove('hidden');
        } else {
          el.classList.add('hidden');
          el.textContent = '00:00';
        }
      }
    });
  }

  updateStatusBadge(state) {
    if (typeof document === 'undefined') return;
    const dot = document.getElementById('video-cast-status-dot');
    const text = document.getElementById('video-cast-status-text');
    const pill = document.getElementById('sidebar-video-status-pill');

    if (state === 'connected') {
      if (dot) dot.style.background = '#10b981'; // Green
      if (text) text.textContent = 'LIVE';
      if (pill) {
        pill.textContent = 'LIVE';
        pill.style.background = 'rgba(16, 185, 129, 0.2)';
        pill.style.color = '#34d399';
        pill.style.borderColor = 'rgba(16, 185, 129, 0.4)';
      }
    } else if (state === 'connecting') {
      if (dot) dot.style.background = '#f59e0b'; // Amber
      if (text) text.textContent = 'CONNECTING';
      if (pill) {
        pill.textContent = 'CONNECTING';
        pill.style.background = 'rgba(245, 158, 11, 0.2)';
        pill.style.color = '#fbbf24';
        pill.style.borderColor = 'rgba(245, 158, 11, 0.4)';
      }
    } else {
      if (dot) dot.style.background = '#ef4444'; // Red
      if (text) text.textContent = 'OFFLINE';
      if (pill) {
        pill.textContent = 'OFFLINE';
        pill.style.background = 'rgba(239, 68, 68, 0.15)';
        pill.style.color = '#f87171';
        pill.style.borderColor = 'rgba(239, 68, 68, 0.3)';
      }
    }
  }

  updateSourceUI(source) {
    if (typeof document === 'undefined') return;
    const select = document.getElementById('video-cast-source-select');
    const customContainer = document.getElementById('video-cast-custom-url-container');
    const customInput = document.getElementById('video-cast-custom-url-input');

    if (select) {
      if (source === 'test' || source === '0' || source === '1' || source.startsWith('rtmp://') || source.startsWith('rtsp://') || source.startsWith('http')) {
        // Match option or set to custom
        const hasOpt = Array.from(select.options).some(o => o.value === source);
        if (hasOpt) {
          select.value = source;
          if (customContainer) customContainer.style.display = 'none';
        } else {
          select.value = 'custom';
          if (customContainer) customContainer.style.display = 'flex';
          if (customInput) customInput.value = source;
        }
      }
    }
  }

  async fetchRecordingsList() {
    if (typeof fetch === 'undefined') return [];
    const base = (typeof getCompanionApiBase === 'function')
      ? getCompanionApiBase()
      : (typeof COMPANION_API_BASE !== 'undefined' ? COMPANION_API_BASE : 'http://127.0.0.1:8765');

    try {
      const res = await fetch(`${base}/api/record/list`);
      if (res.ok) {
        const data = await res.json();
        return data.recordings || [];
      }
    } catch (_) {}
    return [];
  }

  async openRecordingsModal() {
    if (typeof document === 'undefined') return;
    const modal = document.getElementById('video-recordings-modal');
    const listContainer = document.getElementById('video-recordings-list');
    if (!modal || !listContainer) return;

    modal.classList.remove('hidden');
    listContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 0.8rem; padding: 12px; text-align: center;">Loading recordings...</div>';

    const recordings = await this.fetchRecordingsList();
    if (recordings.length === 0) {
      listContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 0.8rem; padding: 16px; text-align: center;">No local MP4 recordings saved yet. Click REC on the live video stream to create one!</div>';
      return;
    }

    const base = (typeof getCompanionApiBase === 'function')
      ? getCompanionApiBase()
      : (typeof COMPANION_API_BASE !== 'undefined' ? COMPANION_API_BASE : 'http://127.0.0.1:8765');

    listContainer.innerHTML = recordings.map(rec => {
      const mb = (rec.bytes / (1024 * 1024)).toFixed(2);
      const dateStr = new Date(rec.mtime).toLocaleString();
      const downloadUrl = `${base}/api/record/download/${encodeURIComponent(rec.filename)}`;

      return `
        <div class="video-recording-item" style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: rgba(255, 255, 255, 0.04); border: 1px solid var(--border-color); border-radius: 6px; font-size: 0.75rem;">
          <div style="display: flex; flex-direction: column; gap: 2px;">
            <span style="font-weight: 600; color: var(--text-main); font-family: monospace;">${rec.filename}</span>
            <span style="color: var(--text-muted); font-size: 0.68rem;">${dateStr} &bull; ${mb} MB</span>
          </div>
          <div style="display: flex; gap: 6px;">
            <a href="${downloadUrl}" download="${rec.filename}" class="btn-primary" style="padding: 4px 8px; font-size: 0.7rem; text-decoration: none; display: inline-flex; align-items: center; gap: 4px; border-radius: 4px;">
              <span>💾 Download</span>
            </a>
          </div>
        </div>
      `;
    }).join('');
  }

  togglePanel(show) {
    if (typeof document === 'undefined') return;
    const panel = document.getElementById('video-cast-panel');
    if (!panel) return;

    if (show === undefined) {
      panel.classList.toggle('hidden');
    } else if (show) {
      panel.classList.remove('hidden');
    } else {
      panel.classList.add('hidden');
    }

    if (!panel.classList.contains('hidden')) {
      if (!this.hasReceivedSseRtmp) {
        this.fetchRtmpStatus();
      }
      if (!this.isConnected && !this.isConnecting) {
        this.connect();
      }
    }
  }

  toggleMinimize() {
    if (typeof document === 'undefined') return;
    const panel = document.getElementById('video-cast-panel');
    const body = document.getElementById('video-cast-body');
    const minBtn = document.getElementById('video-cast-minimize-btn');
    if (!panel || !body) return;

    this.isPanelMinimized = !this.isPanelMinimized;
    if (this.isPanelMinimized) {
      body.style.display = 'none';
      if (minBtn) minBtn.textContent = '▲';
    } else {
      body.style.display = 'flex';
      if (minBtn) minBtn.textContent = '▼';
    }
  }

  initUI() {
    if (this.listenersAttached || typeof document === 'undefined') return;
    this.listenersAttached = true;

    // REC buttons
    const recBtns = [
      document.getElementById('video-cast-rec-btn'),
      document.getElementById('fpv-hud-rec-btn')
    ].filter(Boolean);

    recBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.toggleRecording();
      });
    });

    // Panel Launcher in Section 4
    const launcher = document.getElementById('sidebar-video-cast-btn');
    if (launcher) {
      launcher.addEventListener('click', (e) => {
        e.preventDefault();
        this.togglePanel(true);
      });
    }

    // Panel controls
    const closeBtn = document.getElementById('video-cast-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.togglePanel(false));
    }

    const minBtn = document.getElementById('video-cast-minimize-btn');
    if (minBtn) {
      minBtn.addEventListener('click', () => this.toggleMinimize());
    }

    const fullscreenBtn = document.getElementById('video-cast-fullscreen-btn');
    if (fullscreenBtn) {
      fullscreenBtn.addEventListener('click', () => {
        const canvas = document.getElementById('video-cast-canvas');
        if (canvas) {
          if (canvas.requestFullscreen) {
            canvas.requestFullscreen();
          } else if (canvas.webkitRequestFullscreen) {
            canvas.webkitRequestFullscreen();
          }
        }
      });
    }

    // Source selection
    const srcSelect = document.getElementById('video-cast-source-select');
    const customContainer = document.getElementById('video-cast-custom-url-container');
    const customInput = document.getElementById('video-cast-custom-url-input');
    const customSaveBtn = document.getElementById('video-cast-custom-url-save');

    if (srcSelect) {
      srcSelect.addEventListener('change', () => {
        this.userSelectedManualSource = true;
        const val = srcSelect.value;
        if (val === 'custom') {
          if (customContainer) customContainer.style.display = 'flex';
        } else {
          if (customContainer) customContainer.style.display = 'none';
          this.setSource(val);
        }
      });
    }

    if (customSaveBtn && customInput) {
      customSaveBtn.addEventListener('click', () => {
        const val = (customInput.value || '').trim();
        if (val) this.setSource(val);
      });
    }

    // Recordings modal
    const galleryBtn = document.getElementById('video-cast-gallery-btn');
    if (galleryBtn) {
      galleryBtn.addEventListener('click', () => this.openRecordingsModal());
    }

    const modalCloseBtn = document.getElementById('video-recordings-modal-close');
    const recordingsModal = document.getElementById('video-recordings-modal');
    if (modalCloseBtn && recordingsModal) {
      modalCloseBtn.addEventListener('click', () => recordingsModal.classList.add('hidden'));
    }

    // Copy RTMP Ingest URL buttons (Panel, Section 4 sidebar, and Bridge popover)
    const handleCopy = async (e, textEl, btn) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      const urlToCopy = (textEl ? textEl.textContent : '').trim();
      if (!urlToCopy) return;

      let copied = false;
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        try {
          await navigator.clipboard.writeText(urlToCopy);
          copied = true;
        } catch (_) {}
      }
      if (!copied && typeof document !== 'undefined') {
        try {
          const ta = document.createElement('textarea');
          ta.value = urlToCopy;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          copied = true;
        } catch (_) {}
      }

      const origText = btn.textContent;
      btn.textContent = '✓ Copied!';
      setTimeout(() => { btn.textContent = origText; }, 2000);
    };

    const copyMappings = [
      { btnId: 'video-cast-copy-rtmp-btn', textId: 'video-cast-rtmp-url-text' },
      { btnId: 'sidebar-video-copy-btn', textId: 'sidebar-video-rtmp-url' },
      { btnId: 'companion-rtmp-copy-btn', textId: 'companion-rtmp-url-code' }
    ];

    copyMappings.forEach(({ btnId, textId }) => {
      const btn = document.getElementById(btnId);
      const textEl = document.getElementById(textId);
      if (btn && textEl) {
        btn.addEventListener('click', (e) => handleCopy(e, textEl, btn));
      }
    });

    // One-shot initial hydration if SSE has not delivered RTMP status yet
    if (!this.hasReceivedSseRtmp) {
      this.fetchRtmpStatus();
    }

    // FPV Video Background toggle button
    const fpvVideoToggleBtn = document.getElementById('fpv-video-toggle-btn');
    if (fpvVideoToggleBtn) {
      fpvVideoToggleBtn.addEventListener('click', () => {
        this.fpvVideoEnabled = !this.fpvVideoEnabled;
        fpvVideoToggleBtn.style.opacity = this.fpvVideoEnabled ? '1.0' : '0.4';
        const fpvCanvas = document.getElementById('fpv-video-canvas');
        if (fpvCanvas) {
          fpvCanvas.style.display = this.fpvVideoEnabled ? 'block' : 'none';
        }
      });
    }
  }
}

// Global instance
const videoCastClient = new VideoCastClient();

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => videoCastClient.initUI());
  } else {
    // Already loaded
    setTimeout(() => videoCastClient.initUI(), 0);
  }
}

if (typeof window !== 'undefined') {
  window.VideoCastClient = VideoCastClient;
  window.videoCastClient = videoCastClient;
}

if (typeof global !== 'undefined') {
  global.VideoCastClient = VideoCastClient;
  global.videoCastClient = videoCastClient;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { VideoCastClient, videoCastClient };
}
