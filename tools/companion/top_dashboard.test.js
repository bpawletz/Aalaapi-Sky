/**
 * tools/companion/top_dashboard.test.js
 *
 * Unit tests for ASCII top-style resource & activity dashboard module.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizePath,
  makeProgressBar,
  BridgeMetrics,
  renderFrame,
  Dashboard,
  visibleLength
} = require('./top_dashboard.js');

test('Top Dashboard - normalizePath()', (t) => {
  assert.equal(normalizePath('/api/status'), '/api/status');
  assert.equal(normalizePath('/api/diagnostics/12345'), '/api/diagnostics/:id');
  assert.equal(normalizePath('/api/diagnostics/550e8400-e29b-41d4-a716-446655440000'), '/api/diagnostics/:id');
  assert.equal(normalizePath('/api/proxy/tile?x=10&y=20&z=5'), '/api/proxy/tile');
  assert.equal(normalizePath('/api/proxy/tile/'), '/api/proxy/tile');
  assert.equal(normalizePath(''), '/');
});

test('Top Dashboard - makeProgressBar() edge cases', (t) => {
  assert.equal(makeProgressBar(0, 5), '░░░░░');
  assert.equal(makeProgressBar(1, 5), '█████');
  assert.equal(makeProgressBar(0.5, 6), '███░░░');
  assert.equal(makeProgressBar(-0.5, 5), '░░░░░');
  assert.equal(makeProgressBar(2.0, 5), '█████');
  assert.equal(makeProgressBar(NaN, 5), '░░░░░');
});

test('Top Dashboard - BridgeMetrics aggregation and cap', (t) => {
  const metrics = new BridgeMetrics(5);

  metrics.recordRequest({ method: 'GET', pathname: '/api/status', status: 200, ms: 10 });
  metrics.recordRequest({ method: 'GET', pathname: '/api/status', status: 200, ms: 20 });
  metrics.recordRequest({ method: 'POST', pathname: '/api/sync', status: 400, ms: 50 });

  const snap = metrics.snapshot();
  assert.equal(snap.totalRequests, 3);
  assert.equal(snap.status2xx, 2);
  assert.equal(snap.status4xx, 1);
  assert.equal(snap.status5xx, 0);
  assert.equal(snap.avgMs, 27); // Math.round((10 + 20 + 50) / 3)

  // Verify top endpoints
  assert.equal(snap.topEndpoints.length, 2);
  assert.equal(snap.topEndpoints[0].key, 'GET /api/status');
  assert.equal(snap.topEndpoints[0].count, 2);
  assert.equal(snap.topEndpoints[0].avgMs, 15);

  // Fill up maxEndpoints cap
  for (let i = 0; i < 10; i++) {
    metrics.recordRequest({ method: 'GET', pathname: `/api/custom/${i}`, status: 200, ms: 5 });
  }
  const snapCapped = metrics.snapshot();
  assert.equal(snapCapped.totalRequests, 13);
  assert.ok(snapCapped.topEndpoints.length <= 5);

  // Reset verification
  metrics.reset();
  const snapReset = metrics.snapshot();
  assert.equal(snapReset.totalRequests, 0);
  assert.equal(snapReset.avgMs, 0);
  assert.equal(snapReset.topEndpoints.length, 0);
});

test('Top Dashboard - renderFrame() output & zero protection', (t) => {
  const emptyState = {
    version: '1.144.0',
    port: 8765,
    startTime: Date.now(),
    mode: 'top',
    logBuffer: [],
    process: { cpuPercent: 0, rssMb: 50, heapUsedMb: 20, heapTotalMb: 40, loopLagMs: 0, childProcs: 1 },
    metrics: { totalRequests: 0, reqPerSec: 0, status2xx: 0, status3xx: 0, status4xx: 0, status5xx: 0, avgMs: 0, topEndpoints: [] },
    devices: { rc2: { connected: false }, adsb: { connected: false }, remoteId: { activeCount: 0 } },
    tileCache: { totalFiles: 0, sizeMb: 0, maxMb: 0, hitRatePercent: 0, evictions: 0, bypassCount: 0 },
    clients: { sseTotal: 0, sseStatus: 0, sseUnified: 0, sseAirspace: 0, mcpCount: 0 }
  };

  const output = renderFrame(emptyState, { cols: 80, rows: 24 });
  assert.ok(typeof output === 'string');
  assert.ok(output.includes('Aalaapi Sky Bridge v1.144.0'));
  assert.ok(!output.includes('NaN'));
  assert.ok(!output.includes('undefined'));
  assert.ok(!output.includes('[object Object]'));

  // Test object fallback for sseTotal
  const objSseState = {
    ...emptyState,
    clients: { sseTotal: { total: 4 }, sseStatus: 2, sseUnified: 0, sseAirspace: 2, mcpCount: 0 },
    metrics: {
      totalRequests: 5,
      reqPerSec: 0.2,
      status2xx: 5,
      status3xx: 0,
      status4xx: 0,
      status5xx: 0,
      avgMs: 12,
      topEndpoints: [{ key: 'GET /api/status', method: 'GET', path: '/api/status', count: 5, reqPerSec: 0.2, avgMs: 12, errors: 0 }]
    }
  };
  const objSseOutput = renderFrame(objSseState, { cols: 80, rows: 24 });
  assert.ok(objSseOutput.includes('SSE 4 (status 2, unified 0, airspace 2)'));
  assert.ok(!objSseOutput.includes('[object Object]'));
  assert.ok(objSseOutput.includes('/api/status'));
  assert.ok(objSseOutput.includes('0.2'));

  // Test logs mode
  const logsState = { ...emptyState, mode: 'logs', logBuffer: ['Log line 1', 'Log line 2'] };
  const logsOutput = renderFrame(logsState, { cols: 80, rows: 24 });
  assert.ok(logsOutput.includes('LIVE BRIDGE LOGS'));
  assert.ok(logsOutput.includes('Log line 1'));

  // Test help mode
  const helpState = { ...emptyState, mode: 'help' };
  const helpOutput = renderFrame(helpState, { cols: 80, rows: 24 });
  assert.ok(helpOutput.includes('BRIDGE HELP & ENDPOINTS'));
  assert.ok(helpOutput.includes('Toggle live logs view'));
});

test('Top Dashboard - Dashboard ring buffer, clearAndRealign & mode switching', (t) => {
  let stdoutWritten = '';
  const mockStdout = {
    isTTY: true,
    columns: 80,
    rows: 24,
    write: (data) => { stdoutWritten += data; },
    on: () => {},
    removeListener: () => {}
  };

  const dashboard = new Dashboard({ stdout: mockStdout });

  // Push 1050 logs to verify 1000 max ring buffer cap
  for (let i = 0; i < 1050; i++) {
    dashboard.pushLog(`Log entry #${i}`);
  }
  assert.equal(dashboard.logBuffer.length, 1000);
  assert.equal(dashboard.logBuffer[0], 'Log entry #50');
  assert.equal(dashboard.logBuffer[999], 'Log entry #1049');

  dashboard.setMode('logs');
  assert.equal(dashboard.mode, 'logs');

  // Verify clearAndRealign resets log buffer when in logs mode and writes clear screen escape sequences
  dashboard.clearAndRealign();
  assert.equal(dashboard.logBuffer.length, 0);
  assert.ok(stdoutWritten.includes('\x1b[2J\x1b[3J\x1b[H'));

  dashboard.setMode('help');
  assert.equal(dashboard.mode, 'help');
  dashboard.setMode('top');
  assert.equal(dashboard.mode, 'top');
});
