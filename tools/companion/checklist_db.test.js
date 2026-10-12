const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { ChecklistDatabase } = require('./checklist_db.js');

describe('ChecklistDatabase Tests', () => {
  let db;
  const testDbPath = path.resolve(__dirname, '../../scratch/test_checklist.db');

  beforeEach(() => {
    if (fs.existsSync(testDbPath)) {
      try { fs.unlinkSync(testDbPath); } catch (_) {}
    }
    db = new ChecklistDatabase(testDbPath);
  });

  afterEach(() => {
    if (fs.existsSync(testDbPath)) {
      try { fs.unlinkSync(testDbPath); } catch (_) {}
    }
  });

  test('seeds default template on initialization', () => {
    const template = db.getTemplate();
    assert.strictEqual(Array.isArray(template), true);
    assert.ok(template.length >= 4);
    const preArrival = template.find(g => g.phase === 'Pre-arrival');
    assert.ok(preArrival);
    assert.strictEqual(preArrival.items.length, 3);
  });

  test('saves and retrieves a valid checklist log', () => {
    const payload = {
      operator_name: 'Synthetic Pilot',
      signature: 'data:image/png;base64,dummy',
      mission_id: 'mission_123',
      kmz_filename: 'survey_grid.kmz',
      airspace_auth_code: 'LAANC-998877',
      completed_items: [
        { item_id: 'weather_brief', passed: true },
        { item_id: 'airspace_laanc', passed: true },
        { item_id: 'notam_tfr_check', passed: true },
        { item_id: 'airframe_inspect', passed: true },
        { item_id: 'propeller_inspect', passed: true },
        { item_id: 'lens_gimbal', passed: true },
        { item_id: 'sd_card_space', passed: true },
        { item_id: 'battery_seating', passed: true },
        { item_id: 'site_clearance', passed: true },
        { item_id: 'controller_link', passed: true },
        { item_id: 'compass_gps_lock', passed: true },
        { item_id: 'rth_altitude_set', passed: true }
      ]
    };

    const res = db.saveLog(payload);
    assert.ok(res.success);
    assert.ok(res.log_id);

    const history = db.getHistory(10, 0);
    assert.strictEqual(history.length, 1);
    assert.strictEqual(history[0].operator_name, 'Synthetic Pilot');
    assert.strictEqual(history[0].airspace_auth_code, 'LAANC-998877');

    const hasAuth = db.hasLaancAuth('LAANC-998877');
    assert.strictEqual(hasAuth, true);
  });

  test('validates required fields (operator name, signature, completed items)', () => {
    assert.throws(() => {
      db.saveLog({ operator_name: '', signature: 'sig', completed_items: [] });
    }, /Pilot \/ Operator Name is required/);

    assert.throws(() => {
      db.saveLog({ operator_name: 'Pilot', signature: '', completed_items: [] });
    }, /Digital signature is required/);

    assert.throws(() => {
      db.saveLog({
        operator_name: 'Pilot',
        signature: 'sig',
        completed_items: [
          { item_id: 'battery_seating', passed: false, acknowledged: false, notes: '' }
        ]
      });
    }, /Required item 'Battery Seating & Latches' must be passed or acknowledged/);
  });

  test('allows unpassed required item if acknowledged with notes', () => {
    const payload = {
      operator_name: 'Synthetic Pilot',
      signature: 'sig',
      completed_items: [
        { item_id: 'weather_brief', passed: false, acknowledged: true, notes: 'Acknowledged high wind warning' },
        { item_id: 'airspace_laanc', passed: true },
        { item_id: 'notam_tfr_check', passed: true },
        { item_id: 'airframe_inspect', passed: true },
        { item_id: 'propeller_inspect', passed: true },
        { item_id: 'lens_gimbal', passed: true },
        { item_id: 'sd_card_space', passed: true },
        { item_id: 'battery_seating', passed: true },
        { item_id: 'site_clearance', passed: true },
        { item_id: 'controller_link', passed: true },
        { item_id: 'compass_gps_lock', passed: true },
        { item_id: 'rth_altitude_set', passed: true }
      ]
    };

    const res = db.saveLog(payload);
    assert.ok(res.success);
  });

  test('successfully records and retrieves bypassed preflight checklist logs', () => {
    const payload = {
      operator_name: 'bypassed',
      bypassed: true,
      signature: 'BYPASSED',
      mission_id: 'mission_bypass_99',
      kmz_filename: 'test_bypass.kmz',
      airspace_auth_code: 'BYPASS',
      completed_items: [],
      auto_checks: { bypassed: true }
    };

    const res = db.saveLog(payload);
    assert.ok(res.success);
    assert.ok(res.log_id);

    const history = db.getHistory(5, 0);
    assert.ok(history.length >= 1);
    const bypassedEntry = history.find(h => h.operator_name === 'bypassed');
    assert.ok(bypassedEntry);
    assert.strictEqual(bypassedEntry.airspace_auth_code, 'BYPASS');
  });
});

