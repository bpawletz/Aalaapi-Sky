/**
 * tools/companion/top_dashboard.js
 *
 * Interactive ASCII top-style resource & activity dashboard for Aalaapi Sky Bridge.
 * Displays real-time CPU/memory metrics, HTTP request rates/latencies, device connectivity,
 * map tile cache stats, and top API endpoint usage.
 */

const os = require('node:os');
const { monitorEventLoopDelay } = require('node:perf_hooks');

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  bgBlue: '\x1b[44m',
  clearScreen: '\x1b[2J',
  clearScrollback: '\x1b[3J',
  clearLine: '\x1b[K',
  cursorHome: '\x1b[H',
  hideCursor: '\x1b[?25l',
  showCursor: '\x1b[?25h',
  altScreen: '\x1b[?1049h',
  normalScreen: '\x1b[?1049l'
};

/**
 * Strip ANSI escape sequences to compute visual width of strings.
 */
function visibleLength(str) {
  if (typeof str !== 'string') return 0;
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').length;
}

/**
 * Pad a string containing ANSI sequences to target visible width.
 */
function padRight(str, targetLen) {
  const visLen = visibleLength(str);
  if (visLen >= targetLen) return str;
  return str + ' '.repeat(targetLen - visLen);
}

/**
 * Truncate a string containing ANSI sequences to max visible width.
 */
function truncateVisible(str, maxLen) {
  const visLen = visibleLength(str);
  if (visLen <= maxLen) return str;

  let result = '';
  let visCount = 0;
  let inEscape = false;
  let escapeBuf = '';

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === '\x1b') {
      inEscape = true;
      escapeBuf = char;
      continue;
    }
    if (inEscape) {
      escapeBuf += char;
      if (/[a-zA-Z]/.test(char)) {
        inEscape = false;
        result += escapeBuf;
        escapeBuf = '';
      }
      continue;
    }
    if (visCount >= maxLen) break;
    result += char;
    visCount++;
  }
  return result + ANSI.reset;
}

/**
 * Format progress bar: [██████░░░░]
 */
function makeProgressBar(ratio, width = 15) {
  const safeRatio = (isNaN(ratio) || ratio < 0) ? 0 : Math.min(1, ratio);
  const filled = Math.round(safeRatio * width);
  const empty = Math.max(0, width - filled);
  return '█'.repeat(filled) + '░'.repeat(empty);
}

/**
 * Normalize HTTP pathname by collapsing variable parameters (numbers, UUIDs, hex IDs).
 */
function normalizePath(pathname) {
  if (!pathname) return '/';
  const clean = pathname.split('?')[0];
  if (clean.length > 1 && clean.endsWith('/')) {
    const stripped = clean.slice(0, -1);
    return normalizePath(stripped);
  }
  const segments = clean.split('/');
  const normalized = segments.map((seg, idx) => {
    if (idx === 0) return seg;
    if (/^\d+$/.test(seg)) return ':id';
    if (/^[0-9a-fA-F]{8,}(-[0-9a-fA-F]{4,})*$/.test(seg)) return ':id';
    if (/^[0-9a-zA-Z_-]{20,}$/.test(seg)) return ':id';
    return seg;
  });
  return normalized.join('/') || '/';
}

/**
 * HTTP metrics collector and rolling sliding window calculator.
 */
class BridgeMetrics {
  constructor(maxEndpoints = 200) {
    this.maxEndpoints = maxEndpoints;
    this.reset();
  }

  reset() {
    this.totalRequests = 0;
    this.status2xx = 0;
    this.status3xx = 0;
    this.status4xx = 0;
    this.status5xx = 0;
    this.totalDurationMs = 0;
    this.endpoints = new Map();
    this.buckets = new Array(60).fill(0);
    this.bucketIndex = 0;
    this.lastBucketTime = Math.floor(Date.now() / 1000);
    this.startTime = Date.now();
  }

  _rotateBuckets() {
    const nowSec = Math.floor(Date.now() / 1000);
    const delta = nowSec - this.lastBucketTime;
    if (delta > 0) {
      const steps = Math.min(delta, 60);
      for (let i = 0; i < steps; i++) {
        this.bucketIndex = (this.bucketIndex + 1) % 60;
        this.buckets[this.bucketIndex] = 0;
      }
      this.lastBucketTime = nowSec;
    }
  }

  recordRequest({ method = 'GET', pathname = '/', status = 200, ms = 0 }) {
    this._rotateBuckets();
    this.totalRequests++;
    this.totalDurationMs += ms;
    this.buckets[this.bucketIndex]++;

    if (status >= 200 && status < 300) this.status2xx++;
    else if (status >= 300 && status < 400) this.status3xx++;
    else if (status >= 400 && status < 500) this.status4xx++;
    else if (status >= 500) this.status5xx++;

    const normPath = normalizePath(pathname);
    let key = `${method.toUpperCase()} ${normPath}`;

    let ep = this.endpoints.get(key);
    if (!ep) {
      if (this.endpoints.size >= this.maxEndpoints) {
        key = `${method.toUpperCase()} OTHER`;
        ep = this.endpoints.get(key) || { count: 0, totalMs: 0, errors: 0 };
      } else {
        ep = { count: 0, totalMs: 0, errors: 0 };
      }
    }
    ep.count++;
    ep.totalMs += ms;
    if (status >= 400) ep.errors++;
    this.endpoints.set(key, ep);
  }

  snapshot() {
    this._rotateBuckets();
    const sum60 = this.buckets.reduce((a, b) => a + b, 0);
    const reqPerSec = Math.round((sum60 / 60) * 10) / 10;
    const avgMs = this.totalRequests > 0 ? Math.round(this.totalDurationMs / this.totalRequests) : 0;
    const elapsedSec = Math.max(1, (Date.now() - this.startTime) / 1000);

    const endpointList = Array.from(this.endpoints.entries()).map(([key, data]) => {
      const parts = key.split(' ');
      const method = parts[0] || 'GET';
      const path = parts.slice(1).join(' ') || key;
      return {
        key,
        method,
        path,
        count: data.count,
        reqPerSec: Math.round((data.count / elapsedSec) * 10) / 10,
        avgMs: data.count > 0 ? Math.round(data.totalMs / data.count) : 0,
        errors: data.errors
      };
    }).sort((a, b) => b.count - a.count);

    return {
      totalRequests: this.totalRequests,
      reqPerSec,
      status2xx: this.status2xx,
      status3xx: this.status3xx,
      status4xx: this.status4xx,
      status5xx: this.status5xx,
      avgMs,
      topEndpoints: endpointList.slice(0, 8)
    };
  }
}

/**
 * Sample process resource usage (CPU %, Memory RSS/Heap, Event loop delay).
 */
class ProcessSampler {
  constructor() {
    this.lastCpuUsage = process.cpuUsage();
    this.lastTime = Date.now();
    this.cpuCount = os.cpus().length || 1;
    try {
      this.histogram = monitorEventLoopDelay({ resolution: 20 });
      this.histogram.enable();
    } catch (e) {
      this.histogram = null;
    }
  }

  sample() {
    const now = Date.now();
    const elapsedMs = Math.max(1, now - this.lastTime);
    const currentCpu = process.cpuUsage();

    const userDelta = currentCpu.user - this.lastCpuUsage.user;
    const sysDelta = currentCpu.system - this.lastCpuUsage.system;
    const totalCpuMs = (userDelta + sysDelta) / 1000;

    const rawCpuPercent = (totalCpuMs / (elapsedMs * this.cpuCount)) * 100;
    const cpuPercent = Math.min(100, Math.max(0, Math.round(rawCpuPercent * 10) / 10));

    this.lastCpuUsage = currentCpu;
    this.lastTime = now;

    const mem = process.memoryUsage();
    const rssMb = Math.round(mem.rss / (1024 * 1024));
    const heapUsedMb = Math.round(mem.heapUsed / (1024 * 1024));
    const heapTotalMb = Math.round(mem.heapTotal / (1024 * 1024));

    let loopLagMs = 0;
    if (this.histogram) {
      const p99Ns = this.histogram.percentile(99);
      loopLagMs = Math.round(p99Ns / 1e6);
      this.histogram.reset();
    }

    return {
      cpuPercent,
      rssMb,
      heapUsedMb,
      heapTotalMb,
      loopLagMs,
      childProcs: 1
    };
  }
}

/**
 * Format uptime seconds to HH:MM:SS.
 */
function formatUptime(seconds) {
  const sec = Math.floor(seconds || 0);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
}

/**
 * Pure frame renderer for the top dashboard, log buffer, or help view.
 */
function renderFrame(state, options = {}) {
  const cols = options.cols || 80;
  const rows = options.rows || 24;

  if (state.mode === 'logs') {
    const lines = [];
    lines.push(padRight(`${ANSI.bgBlue}${ANSI.white}${ANSI.bold} LIVE BRIDGE LOGS ${ANSI.reset} ${ANSI.gray}(Press [l] or [Esc] to return to Dashboard)${ANSI.reset}`, cols));
    lines.push(ANSI.gray + '─'.repeat(cols) + ANSI.reset);
    const logBuffer = state.logBuffer || [];
    const maxLogLines = Math.max(1, rows - 4);
    const recentLogs = logBuffer.slice(-maxLogLines);
    for (const logLine of recentLogs) {
      lines.push(truncateVisible(logLine, cols));
    }
    while (lines.length < rows - 1) {
      lines.push('');
    }
    lines.push(padRight(`${ANSI.gray}[l] back to top  [c] clear logs  [q] quit${ANSI.reset}`, cols));
    return lines.join('\n');
  }

  if (state.mode === 'help') {
    const lines = [];
    lines.push(padRight(`${ANSI.bgBlue}${ANSI.white}${ANSI.bold} BRIDGE HELP & ENDPOINTS ${ANSI.reset} ${ANSI.gray}(Press [h] or [Esc] to return to Dashboard)${ANSI.reset}`, cols));
    lines.push(ANSI.gray + '─'.repeat(cols) + ANSI.reset);
    lines.push(`${ANSI.bold}Interactive Keys:${ANSI.reset}`);
    lines.push(`  ${ANSI.yellow}[l]${ANSI.reset} Toggle live logs view         ${ANSI.yellow}[h]${ANSI.reset} Toggle this help screen`);
    lines.push(`  ${ANSI.yellow}[s]${ANSI.reset} Probe RC 2 status             ${ANSI.yellow}[a]${ANSI.reset} Probe ADS-B airspace status`);
    lines.push(`  ${ANSI.yellow}[m]${ANSI.reset} Probe map tile cache          ${ANSI.yellow}[r]${ANSI.reset} Probe Remote ID radar`);
    lines.push(`  ${ANSI.yellow}[f]${ANSI.reset} List cached flight logs       ${ANSI.yellow}[c]${ANSI.reset} Reset request counters`);
    lines.push(`  ${ANSI.yellow}[q]${ANSI.reset} Quit bridge process`);
    lines.push('');
    lines.push(`${ANSI.bold}Core API Endpoints:${ANSI.reset}`);
    lines.push(`  ${ANSI.green}GET  /${ANSI.reset}                     Aalaapi Sky Web Application`);
    lines.push(`  ${ANSI.green}GET  /api/status${ANSI.reset}              Controller connection & status`);
    lines.push(`  ${ANSI.cyan}GET  /api/status/stream${ANSI.reset}       SSE companion push stream`);
    lines.push(`  ${ANSI.green}GET  /api/proxy/tile${ANSI.reset}          Map tile cache proxy`);
    lines.push(`  ${ANSI.green}POST /api/sync${ANSI.reset}                KMZ sync to RC 2`);
    lines.push(`  ${ANSI.cyan}GET  /api/airspace/stream${ANSI.reset}     SSE ADS-B airspace stream`);
    lines.push(`  ${ANSI.cyan}GET  /api/remote-id/stream${ANSI.reset}    SSE ASTM F3411 Remote ID stream`);
    lines.push(`  ${ANSI.cyan}GET  /api/stream${ANSI.reset}              Unified multiplexed SSE stream`);
    lines.push(`  ${ANSI.green}POST /api/shutdown${ANSI.reset}            Stop companion bridge`);
    lines.push(ANSI.gray + '─'.repeat(cols) + ANSI.reset);
    while (lines.length < rows - 1) {
      lines.push('');
    }
    lines.push(padRight(`${ANSI.gray}[h]/[Esc] back to top  [q] quit${ANSI.reset}`, cols));
    return lines.join('\n');
  }

  // Default: TOP Dashboard Mode
  const lines = [];

  // Line 1: Header
  const title = `${ANSI.bold}${ANSI.cyan}Aalaapi Sky Bridge v${state.version || '1.144.0'}${ANSI.reset}`;
  const hostInfo = `${ANSI.gray}http://127.0.0.1:${state.port || 8765}${ANSI.reset}`;
  const uptimeSec = state.startTime ? (Date.now() - state.startTime) / 1000 : 0;
  const uptimeStr = `${ANSI.gray}up ${formatUptime(uptimeSec)}${ANSI.reset}`;
  const nowStr = `${ANSI.gray}${new Date().toTimeString().slice(0, 8)}${ANSI.reset}`;

  const headerLeft = ` ${title}   ${hostInfo}   ${uptimeStr}`;
  const headerRight = `${nowStr} `;
  const spaces = Math.max(1, cols - visibleLength(headerLeft) - visibleLength(headerRight));
  lines.push(headerLeft + ' '.repeat(spaces) + headerRight);

  // Line 2: Divider
  lines.push(ANSI.gray + '─'.repeat(cols) + ANSI.reset);

  // Line 3: System Resources (CPU & Memory)
  const proc = state.process || { cpuPercent: 0, rssMb: 0, heapUsedMb: 0, heapTotalMb: 0, loopLagMs: 0, childProcs: 1 };
  const cpuBar = makeProgressBar(proc.cpuPercent / 100, 15);
  const cpuStr = `${ANSI.bold}CPU${ANSI.reset}  [${ANSI.cyan}${cpuBar}${ANSI.reset}] ${String(proc.cpuPercent.toFixed(1)).padStart(5)}%`;

  // Assume ~512MB max reference for mem bar display
  const memRatio = Math.min(1, proc.rssMb / 512);
  const memBar = makeProgressBar(memRatio, 15);
  const memStr = `${ANSI.bold}MEM${ANSI.reset}  [${ANSI.cyan}${memBar}${ANSI.reset}] ${proc.rssMb} MB RSS`;

  const sysLine = ` ${cpuStr}     ${memStr}`;
  lines.push(padRight(sysLine, cols));

  // Line 4: Heap, Event Loop Lag, Child Procs
  const heapStr = `${ANSI.gray}Heap${ANSI.reset} ${proc.heapUsedMb}/${proc.heapTotalMb} MB`;
  const lagStr = `${ANSI.gray}Loop lag${ANSI.reset} p99 ${proc.loopLagMs} ms`;
  const childStr = `${ANSI.gray}Child procs${ANSI.reset} ${proc.childProcs}`;
  lines.push(padRight(` ${heapStr}                         ${lagStr}        ${childStr}`, cols));

  // Line 5: Divider
  lines.push(ANSI.gray + '─'.repeat(cols) + ANSI.reset);

  // Line 6: Request Metrics
  const met = state.metrics || { totalRequests: 0, reqPerSec: 0, status2xx: 0, status3xx: 0, status4xx: 0, status5xx: 0, avgMs: 0 };
  const reqStr = `${ANSI.bold}REQUESTS${ANSI.reset}  total ${met.totalRequests.toLocaleString()}   ${met.reqPerSec} req/s   ${ANSI.green}2xx ${met.status2xx.toLocaleString()}${ANSI.reset}  ${ANSI.yellow}4xx ${met.status4xx.toLocaleString()}${ANSI.reset}  ${ANSI.red}5xx ${met.status5xx.toLocaleString()}${ANSI.reset}   avg ${met.avgMs} ms`;
  lines.push(padRight(` ${reqStr}`, cols));

  // Line 7: Connected SSE / MCP Clients
  const cli = state.clients || { sseTotal: 0, sseStatus: 0, sseUnified: 0, sseAirspace: 0, mcpCount: 0 };
  const sseTotalNum = (typeof cli.sseTotal === 'object' && cli.sseTotal !== null)
    ? (cli.sseTotal.total || 0)
    : (typeof cli.sseTotal === 'number' ? cli.sseTotal : 0);
  const cliStr = `${ANSI.bold}CLIENTS${ANSI.reset}   SSE ${sseTotalNum} (status ${cli.sseStatus || 0}, unified ${cli.sseUnified || 0}, airspace ${cli.sseAirspace || 0})   MCP ${cli.mcpCount || 0}`;
  lines.push(padRight(` ${cliStr}`, cols));

  // Line 8: Divider
  lines.push(ANSI.gray + '─'.repeat(cols) + ANSI.reset);

  // Line 9: Devices (RC 2, ADS-B, Remote ID)
  const dev = state.devices || { rc2: {}, adsb: {}, remoteId: {} };
  const rc2StatusStr = dev.rc2.connected
    ? `${ANSI.green}connected (${dev.rc2.missionsCount || 0} missions)${ANSI.reset}`
    : `${ANSI.yellow}disconnected${ANSI.reset}`;
  const adsbStatusStr = dev.adsb.connected
    ? `${ANSI.green}connected (${dev.adsb.aircraftCount || 0} aircraft)${ANSI.reset}`
    : `${ANSI.yellow}waiting :${dev.adsb.tcpPort || 30003}${ANSI.reset}`;
  const ridStatusStr = `${dev.remoteId.activeCount || 0} drones`;

  const devLine = `${ANSI.bold}DEVICES${ANSI.reset}   RC 2: ${rc2StatusStr}   ADS-B: ${adsbStatusStr}   Remote ID: ${ridStatusStr}`;
  lines.push(padRight(` ${devLine}`, cols));

  // Line 10: Tile Cache Stats
  const tc = state.tileCache || { totalFiles: 0, sizeMb: 0, maxMb: 2048, hitRatePercent: 0, evictions: 0, bypassCount: 0 };
  const tcRatio = tc.maxMb > 0 ? tc.sizeMb / tc.maxMb : 0;
  const tcBar = makeProgressBar(tcRatio, 10);
  const tcStr = `${ANSI.bold}TILE CACHE${ANSI.reset} ${tc.totalFiles.toLocaleString()} files  ${tc.sizeMb} / ${tc.maxMb} MB  [${ANSI.cyan}${tcBar}${ANSI.reset}]  hit ${tc.hitRatePercent}%  evict ${tc.evictions}  bypass ${tc.bypassCount}`;
  lines.push(padRight(` ${tcStr}`, cols));

  // Line 11: Divider
  lines.push(ANSI.gray + '─'.repeat(cols) + ANSI.reset);

  // Line 12: Top Endpoints Table Header
  const epHeader = `${ANSI.bold}TOP ENDPOINTS${' '.repeat(16)}  REQS   REQ/s  AVG ms  ERR${ANSI.reset}`;
  lines.push(` ${epHeader}`);

  // Lines 13-20: Top 8 Endpoints
  const topEp = met.topEndpoints || [];
  for (let i = 0; i < 8; i++) {
    if (i < topEp.length) {
      const ep = topEp[i];
      const methodCol = ep.method.padEnd(5);
      const pathCol = ep.path.padEnd(23).slice(0, 23);
      const reqsCol = String(ep.count).padStart(5);
      const rpsCol = String(ep.reqPerSec.toFixed(1)).padStart(6);
      const avgCol = String(ep.avgMs).padStart(7);
      const errCol = String(ep.errors).padStart(4);
      const errColor = ep.errors > 0 ? ANSI.red : ANSI.gray;
      lines.push(` ${ANSI.cyan}${methodCol}${ANSI.reset} ${pathCol} ${reqsCol} ${rpsCol} ${avgCol} ${errColor}${errCol}${ANSI.reset}`);
    } else {
      lines.push(` ${ANSI.gray}•${ANSI.reset}`);
    }
  }

  // Line 21: Divider
  lines.push(ANSI.gray + '─'.repeat(cols) + ANSI.reset);

  // Line 22: Footer / Key hints
  const footer = `${ANSI.yellow}[l]${ANSI.reset} logs  ${ANSI.yellow}[h]${ANSI.reset} help  ${ANSI.yellow}[s][a][m][r][f]${ANSI.reset} probes  ${ANSI.yellow}[c]${ANSI.reset} reset & realign  ${ANSI.yellow}[q]${ANSI.reset} quit`;
  lines.push(padRight(` ${footer}`, cols));

  return lines.map(l => l + ANSI.clearLine).join('\n');
}

/**
 * Controller class for managing interactive ASCII terminal top dashboard.
 */
class Dashboard {
  constructor(options = {}) {
    this.version = options.version || '1.144.0';
    this.port = options.port || 8765;
    this.startTime = options.startTime || Date.now();
    this.metrics = options.metrics || new BridgeMetrics();
    this.sampler = new ProcessSampler();
    this.mode = 'top'; // 'top' | 'logs' | 'help'
    this.logBuffer = [];
    this.maxLogBuffer = 1000;
    this.timer = null;
    this.stdout = options.stdout || process.stdout;
    this.stdin = options.stdin || process.stdin;

    // Callbacks to gather subsystem status dynamically
    this.getRc2Status = options.getRc2Status || (() => ({ connected: false }));
    this.getAdsbStatus = options.getAdsbStatus || (() => ({ connected: false, tcpPort: 30003, activeAircraftCount: 0 }));
    this.getRemoteIdStatus = options.getRemoteIdStatus || (() => ({ activeCount: 0 }));
    this.getTileCacheStats = options.getTileCacheStats || (() => ({ totalFiles: 0, sizeMb: 0, maxSizeMb: 2048, hitRatePercent: 0, lruPruneCount: 0, bypassCount: 0 }));
    this.getClientCounts = options.getClientCounts || (() => ({ sseTotal: 0, sseStatus: 0, sseUnified: 0, sseAirspace: 0, mcpCount: 0 }));
  }

  pushLog(logLine) {
    if (!logLine) return;
    const str = String(logLine).trimEnd();
    this.logBuffer.push(str);
    if (this.logBuffer.length > this.maxLogBuffer) {
      this.logBuffer.shift();
    }
  }

  setMode(mode) {
    if (['top', 'logs', 'help'].includes(mode)) {
      this.mode = mode;
      this.draw();
    }
  }

  clearAndRealign() {
    if (this.stdout && this.stdout.isTTY) {
      this.stdout.write(ANSI.clearScreen + ANSI.clearScrollback + ANSI.cursorHome);
    }
    this.metrics.reset();
    if (this.mode === 'logs') {
      this.logBuffer = [];
    }
    this.draw();
  }

  draw() {
    if (!this.stdout || !this.stdout.isTTY) return;

    const cols = this.stdout.columns || 80;
    const rows = this.stdout.rows || 24;

    const procStats = this.sampler.sample();
    const metStats = this.metrics.snapshot();
    const rc2Stats = this.getRc2Status();
    const adsbStats = this.getAdsbStatus();
    const ridStats = this.getRemoteIdStatus();
    const tcStats = this.getTileCacheStats();
    const cliStats = this.getClientCounts();

    const frameState = {
      version: this.version,
      port: this.port,
      startTime: this.startTime,
      mode: this.mode,
      logBuffer: this.logBuffer,
      process: procStats,
      metrics: metStats,
      devices: {
        rc2: {
          connected: !!rc2Stats.connected,
          missionsCount: (rc2Stats.activeMissions || []).length
        },
        adsb: {
          connected: !!adsbStats.connected,
          tcpPort: adsbStats.tcpPort || 30003,
          aircraftCount: adsbStats.activeAircraftCount || 0
        },
        remoteId: {
          activeCount: ridStats.activeCount || 0
        }
      },
      tileCache: {
        totalFiles: tcStats.totalFiles || 0,
        sizeMb: tcStats.totalSizeMb || tcStats.sizeMb || 0,
        maxMb: tcStats.maxSizeMb || tcStats.maxMb || 2048,
        hitRatePercent: tcStats.hitRatePercent || 0,
        evictions: tcStats.lruPruneCount || tcStats.evictions || 0,
        bypassCount: tcStats.bypassCount || 0
      },
      clients: cliStats
    };

    const rendered = renderFrame(frameState, { cols, rows });
    this.stdout.write(ANSI.cursorHome + rendered);
  }

  start() {
    if (!this.stdout || !this.stdout.isTTY) return;

    this.stdout.write(ANSI.altScreen + ANSI.hideCursor + ANSI.clearScreen);
    this.draw();

    this.timer = setInterval(() => {
      this.draw();
    }, 1000);

    this.onResize = () => this.draw();
    this.stdout.on('resize', this.onResize);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.onResize) {
      this.stdout.removeListener('resize', this.onResize);
    }
    if (this.stdout && this.stdout.isTTY) {
      this.stdout.write(ANSI.normalScreen + ANSI.showCursor);
    }
  }
}

module.exports = {
  ANSI,
  visibleLength,
  padRight,
  truncateVisible,
  makeProgressBar,
  normalizePath,
  BridgeMetrics,
  ProcessSampler,
  formatUptime,
  renderFrame,
  Dashboard
};
