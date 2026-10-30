const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  LEGAL_NON_GUARANTEE_DISCLAIMER,
  PHASE_KEYS,
  PATTERN_DEFINITIONS,
  extractFunctionBody,
  computePatternCodeHashes,
  syncIrlStatus,
  recordPatternVerification,
  addReleaseTestPlan,
  analyzeFlightLogAgainstPlan,
  analyzeLogFiles,
  buildCompactClientStatusMap
} = require('./irl_tracker.js');

const { generateTelemetryFromWaypoints } = require('../companion/log_decoder.js');

describe('IRL Test Plan Tracker & Post-Flight Log Analyzer Tests', () => {
  test('all 26 flight patterns in index_template.html #grid-type are registered in PATTERN_DEFINITIONS', () => {
    const templatePath = path.resolve(__dirname, '../../index_template.html');
    const html = fs.readFileSync(templatePath, 'utf8');
    const selectMatch = html.match(/<select id="grid-type"[\s\S]*?<\/select>/i);
    assert.ok(selectMatch, '#grid-type select element must exist in index_template.html');

    const optionValues = [];
    const optRe = /<option\s+value="([^"]+)"/gi;
    let m;
    while ((m = optRe.exec(selectMatch[0])) !== null) {
      optionValues.push(m[1]);
    }

    assert.strictEqual(optionValues.length, 26, 'Expected 26 flight patterns in #grid-type');
    const definedIds = PATTERN_DEFINITIONS.map(d => d.id);
    for (const val of optionValues) {
      assert.ok(definedIds.includes(val), `Pattern '${val}' from #grid-type must be registered in PATTERN_DEFINITIONS`);
    }
  });

  test('extracts non-empty function bodies and computes 12-char SHA-256 hashes for all 26 patterns', () => {
    const { wpmlCompilerHash, patternHashes } = computePatternCodeHashes();
    assert.strictEqual(typeof wpmlCompilerHash, 'string');
    assert.strictEqual(wpmlCompilerHash.length, 12);

    for (const def of PATTERN_DEFINITIONS) {
      const h = patternHashes[def.id];
      assert.strictEqual(typeof h, 'string', `Hash missing for ${def.id}`);
      assert.strictEqual(h.length, 12, `Hash for ${def.id} must be 12 hex chars`);
    }

    const pgSource = fs.readFileSync(path.resolve(__dirname, '../../src/patterns/PatternGenerators.js'), 'utf8');
    const body = extractFunctionBody(pgSource, 'generateDomeShellCoordinates');
    assert.ok(body.includes('function generateDomeShellCoordinates'), 'Should extract full function body');
  });

  test('syncs status, records verification, and auto-invalidates VERIFIED -> NEEDS_RETEST when generator code changes', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aalaapi-irl-test-'));
    const statusPath = path.join(tmpDir, 'irl_test_status.json');
    const planMdPath = path.join(tmpDir, 'IRL_TEST_PLAN.md');

    try {
      // 1. Initial sync
      const initRes = syncIrlStatus({ statusPath, planMdPath, appVersion: '1.209.0' });
      assert.strictEqual(Object.keys(initRes.state.patterns).length, 26);
      assert.ok(initRes.markdown.includes(LEGAL_NON_GUARANTEE_DISCLAIMER));
      assert.strictEqual(initRes.state.patterns['double'].status, 'UNTESTED');

      // 2. Verify 'double' pattern
      const verRes = recordPatternVerification('double', {
        version: '1.209.0',
        droneModel: 'DJI Mini 4 Pro',
        firmware: '01.00.0600',
        pilot: 'Synthetic QA Pilot',
        notes: 'All 6 phases passed in rural test field.'
      }, { statusPath, planMdPath });

      assert.strictEqual(verRes.pattern.status, 'VERIFIED');
      assert.strictEqual(verRes.pattern.verifiedCodeHash, verRes.pattern.codeHash);
      assert.ok(PHASE_KEYS.every(k => verRes.pattern.checklist[k] === true));

      // 3. Simulate code modification to generateGridCoordinates in PatternGenerators.js
      const origPg = fs.readFileSync(path.resolve(__dirname, '../../src/patterns/PatternGenerators.js'), 'utf8');
      const modifiedPg = origPg.replace(
        'function generateGridCoordinates(',
        'function generateGridCoordinates(/* modified math */ '
      );

      const reSync = syncIrlStatus({
        statusPath,
        planMdPath,
        appVersion: '1.210.0',
        customSourceOverrides: {
          'src/patterns/PatternGenerators.js': modifiedPg
        }
      });

      assert.ok(reSync.invalidatedPatterns.includes('double'), 'Modified generator should auto-invalidate double pattern');
      assert.strictEqual(reSync.state.patterns['double'].status, 'NEEDS_RETEST');
      assert.strictEqual(reSync.state.patterns['double'].history.length, 1, 'History must be preserved across invalidation');

      // 4. Verify compact client status map
      const compact = buildCompactClientStatusMap(statusPath);
      assert.strictEqual(compact.double.s, 'R');
      assert.strictEqual(compact.single.s, 'U');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('automated post-flight telemetry log analysis grades all 6 IRL phases accurately', () => {
    const plannedWaypoints = [
      { lat: 41.3215, lon: -88.9950, altitude: 50, speed: 5.0, gimbalPitch: -60, heading: 0 },
      { lat: 41.3220, lon: -88.9950, altitude: 50, speed: 5.0, gimbalPitch: -60, heading: 0 },
      { lat: 41.3220, lon: -88.9944, altitude: 50, speed: 5.0, gimbalPitch: -60, heading: 90 },
      { lat: 41.3215, lon: -88.9944, altitude: 50, speed: 5.0, gimbalPitch: -60, heading: 180 }
    ];

    // Generate realistic telemetry from the planned waypoints
    const actualTelemetry = generateTelemetryFromWaypoints(plannedWaypoints, {
      speed: 5.0,
      altitude: 50,
      gimbalPitch: -60,
      isSimulation: true
    });

    const passReport = analyzeFlightLogAgainstPlan(plannedWaypoints, actualTelemetry, {
      pathMode: 'straight',
      captureMode: 'continuous'
    });

    assert.strictEqual(passReport.passedAll, true, 'Compliant telemetry log should pass all 6 IRL phases');
    assert.strictEqual(passReport.phases.kmz_import, true);
    assert.strictEqual(passReport.phases.entry_altitude, true);
    assert.strictEqual(passReport.phases.geometry_path, true);
    assert.strictEqual(passReport.phases.heading_gimbal, true);
    assert.strictEqual(passReport.phases.capture_trigger, true);
    assert.strictEqual(passReport.phases.exit_rth, true);
    assert.ok(passReport.markdownReport.includes('Non-Guarantee Notice'));

    // Now test anomalous telemetry (altitude off by +12m and gimbal pitch off by +35 deg)
    const badTelemetry = {
      ...actualTelemetry,
      points: actualTelemetry.points.map(pt => ({
        ...pt,
        alt: pt.alt + 12.0,
        pitch: -15.0
      }))
    };

    const failReport = analyzeFlightLogAgainstPlan(plannedWaypoints, badTelemetry, {
      pathMode: 'straight',
      captureMode: 'continuous'
    });

    assert.strictEqual(failReport.passedAll, false, 'Anomalous telemetry must fail overall verification');
    assert.strictEqual(failReport.phases.entry_altitude, false, 'Should detect +12m entry altitude error');
    assert.strictEqual(failReport.phases.heading_gimbal, false, 'Should detect 45-deg gimbal pitch error');
  });

  test('analyzeLogFiles parses planned JSON and CSV flight log and updates pattern status', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aalaapi-irl-files-'));
    const statusPath = path.join(tmpDir, 'irl_test_status.json');
    const planMdPath = path.join(tmpDir, 'IRL_TEST_PLAN.md');
    const planJsonPath = path.join(tmpDir, 'plan.json');
    const logCsvPath = path.join(tmpDir, 'FlightRecord_2026-10-30_[10-00-00].csv');

    try {
      const plannedWps = [
        { lat: 41.3215, lon: -88.9950, altitude: 40, speed: 4.0, gimbalPitch: -45, heading: 0 },
        { lat: 41.3218, lon: -88.9950, altitude: 40, speed: 4.0, gimbalPitch: -45, heading: 0 },
        { lat: 41.3218, lon: -88.9946, altitude: 40, speed: 4.0, gimbalPitch: -45, heading: 90 }
      ];
      fs.writeFileSync(planJsonPath, JSON.stringify({ waypoints: plannedWps }, null, 2), 'utf8');

      const csvLines = [
        'osd.fly_time,osd.latitude,osd.longitude,osd.height [m],osd.hspeed [m/s],gimbal.pitch,osd.yaw,battery.charge_level,camera.is_photo',
        '0,41.3215,-88.9950,40.0,0.2,-45.0,0.0,95,1',
        '2,41.3216,-88.9950,40.1,4.0,-45.0,0.0,94,0',
        '4,41.3217,-88.9950,40.0,4.0,-45.0,0.0,93,0',
        '6,41.3218,-88.9950,39.9,0.3,-45.0,0.0,92,1',
        '8,41.3218,-88.9948,40.0,4.0,-45.0,90.0,91,0',
        '10,41.3218,-88.9946,40.1,0.2,-45.0,90.0,90,1'
      ];
      fs.writeFileSync(logCsvPath, csvLines.join('\n'), 'utf8');

      const res = analyzeLogFiles(planJsonPath, logCsvPath, {
        patternId: 'orbit',
        statusPath,
        planMdPath,
        captureMode: 'stopAndShoot'
      });

      assert.strictEqual(res.passedAll, true);
      const saved = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
      assert.strictEqual(saved.patterns.orbit.status, 'VERIFIED');
      assert.ok(saved.patterns.orbit.lastTelemetryMetrics);
      assert.strictEqual(saved.patterns.orbit.lastTelemetryMetrics.waypointCompletionPct, 100);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('addReleaseTestPlan registers a post-update test plan and generates GitHub issue markdown', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aalaapi-irl-rel-'));
    const statusPath = path.join(tmpDir, 'irl_test_status.json');
    const planMdPath = path.join(tmpDir, 'IRL_TEST_PLAN.md');

    try {
      const { plan, issueCommentMarkdown } = addReleaseTestPlan({
        version: '1.209.0',
        issueNumber: 201,
        title: 'IRL Test Plan & Post-Flight Log Analyzer Framework',
        patterns: ['single', 'double', 'dome-shell']
      }, { statusPath, planMdPath });

      assert.strictEqual(plan.version, '1.209.0');
      assert.strictEqual(plan.issueNumber, 201);
      assert.ok(issueCommentMarkdown.includes('Post-Update IRL Field Test Plan (v1.209.0 — Issue #201)'));
      assert.ok(issueCommentMarkdown.includes('Non-Guarantee & Variation Notice'));
      assert.ok(issueCommentMarkdown.includes('- [ ]'));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
