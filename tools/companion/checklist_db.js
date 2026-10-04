/**
 * tools/companion/checklist_db.js
 * SQLite Persistence Layer for Dynamic Preflight Checklist Templates & Logs.
 * Powered by Node.js built-in node:sqlite (DatabaseSync).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let DatabaseSync = null;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch (e) {
  // Built-in node:sqlite unavailable on legacy node
}

const DEFAULT_DB_PATH = path.resolve(__dirname, '../../scratch/checklist.db');

const DEFAULT_CHECKLIST_TEMPLATE = [
  {
    phase: 'Pre-arrival',
    sort_order: 10,
    items: [
      { item_id: 'weather_brief', label: 'Weather & Solar Briefing', helper: 'Check NEXRAD, NWS warnings, wind speeds, and KP index.', required: 1, auto_check: 'weather' },
      { item_id: 'airspace_laanc', label: 'Airspace & LAANC Authorization', helper: 'Verify active airspace authorization & facility map ceilings.', required: 1, auto_check: 'airspace' },
      { item_id: 'notam_tfr_check', label: 'NOTAM / TFR Verification', helper: 'Confirm no active temporary flight restrictions in operational area.', required: 1, auto_check: 'tfr' }
    ]
  },
  {
    phase: 'Unpacking',
    sort_order: 20,
    items: [
      { item_id: 'airframe_inspect', label: 'Airframe & Arms Inspection', helper: 'Check structure for cracks, stress, or loose motor mounts.', required: 1 },
      { item_id: 'propeller_inspect', label: 'Propeller Seat & Integrity', helper: 'Ensure props are locked, clean, and free of nicks or cracks.', required: 1 }
    ]
  },
  {
    phase: 'Hardware Inspection',
    sort_order: 30,
    items: [
      { item_id: 'lens_gimbal', label: 'Camera & Gimbal Cover', helper: 'Clean lens glass and remove gimbal clamp/protective shield.', required: 1 },
      { item_id: 'sd_card_space', label: 'High-Speed SD Storage', helper: 'Confirm formatted SD card installed with ample storage capacity.', required: 1 },
      { item_id: 'battery_seating', label: 'Battery Seating & Latches', helper: 'Latches engaged, clicked firmly, and zero terminal corrosion.', required: 1 }
    ]
  },
  {
    phase: 'Airspace & Weather',
    sort_order: 40,
    items: [
      { item_id: 'site_clearance', label: 'Landing Zone & Line of Sight', helper: 'Clear 15ft radius LZ, identify VLOS hazards and emergency landing spots.', required: 1 },
      { item_id: 'crew_brief', label: 'Visual Observer / Crew Brief', helper: 'Brief roles, emergency procedures, and lost-link protocols.', required: 0 }
    ]
  },
  {
    phase: 'Power-On & Calibration',
    sort_order: 50,
    items: [
      { item_id: 'controller_link', label: 'Remote Controller & App Link', helper: 'Telemetry live, battery > 50%, firmware matches aircraft.', required: 1 },
      { item_id: 'compass_gps_lock', label: 'Compass & GPS Satellite Lock', helper: 'Verify >= 12 satellites and home point updated on map HUD.', required: 1 },
      { item_id: 'rth_altitude_set', label: 'RTH Altitude Verification', helper: 'RTH altitude set higher than surrounding trees/structures.', required: 1 }
    ]
  }
];

class ChecklistDatabase {
  constructor(dbPath = DEFAULT_DB_PATH) {
    this.dbPath = dbPath;
    this.db = null;
    this.memoryLogs = [];
    this.init();
  }

  init() {
    if (!DatabaseSync) {
      console.warn('[CHECKLIST DB] node:sqlite is not available in this Node runtime. Fallback mode active.');
      return;
    }

    try {
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      this.db = new DatabaseSync(this.dbPath);
      this.db.exec('PRAGMA journal_mode = WAL;');
      this.db.exec('PRAGMA synchronous = NORMAL;');

      this.db.exec(`
        CREATE TABLE IF NOT EXISTS checklist_templates (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          template_id TEXT NOT NULL,
          version INTEGER NOT NULL DEFAULT 1,
          phase TEXT NOT NULL,
          sort_order INTEGER NOT NULL,
          item_id TEXT NOT NULL UNIQUE,
          label TEXT NOT NULL,
          helper TEXT,
          required INTEGER NOT NULL DEFAULT 1,
          auto_check TEXT
        );

        CREATE TABLE IF NOT EXISTS checklist_logs (
          log_id TEXT PRIMARY KEY,
          timestamp TEXT NOT NULL,
          operator_name TEXT NOT NULL,
          mission_id TEXT,
          kmz_filename TEXT,
          completed_items TEXT NOT NULL,
          airspace_auth_code TEXT,
          template_version INTEGER NOT NULL DEFAULT 1,
          auto_checks TEXT,
          signature TEXT NOT NULL
        );
      `);

      this.seedDefaultTemplate();
    } catch (err) {
      console.error('[CHECKLIST DB ERROR] Failed to initialize SQLite database:', err.message);
      this.db = null;
    }
  }

  seedDefaultTemplate() {
    if (!this.db) return;
    try {
      const countStmt = this.db.prepare('SELECT COUNT(*) as count FROM checklist_templates');
      const row = countStmt.get();
      if (row && row.count > 0) return;

      const insertStmt = this.db.prepare(`
        INSERT INTO checklist_templates (template_id, version, phase, sort_order, item_id, label, helper, required, auto_check)
        VALUES ('master_v1', 1, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const group of DEFAULT_CHECKLIST_TEMPLATE) {
        for (const item of group.items) {
          insertStmt.run(
            group.phase,
            group.sort_order,
            item.item_id,
            item.label,
            item.helper || '',
            item.required !== undefined ? item.required : 1,
            item.auto_check || null
          );
        }
      }
    } catch (err) {
      console.error('[CHECKLIST DB ERROR] Failed to seed default template:', err.message);
    }
  }

  getTemplate() {
    if (!this.db) {
      return DEFAULT_CHECKLIST_TEMPLATE;
    }

    try {
      const stmt = this.db.prepare('SELECT * FROM checklist_templates ORDER BY sort_order ASC, id ASC');
      const rows = stmt.all();
      if (!rows || rows.length === 0) return DEFAULT_CHECKLIST_TEMPLATE;

      const phaseMap = new Map();
      for (const r of rows) {
        if (!phaseMap.has(r.phase)) {
          phaseMap.set(r.phase, {
            phase: r.phase,
            sort_order: r.sort_order,
            items: []
          });
        }
        phaseMap.get(r.phase).items.push({
          item_id: r.item_id,
          label: r.label,
          helper: r.helper,
          required: Boolean(r.required),
          auto_check: r.auto_check
        });
      }

      return Array.from(phaseMap.values());
    } catch (err) {
      console.error('[CHECKLIST DB ERROR] getTemplate failed:', err.message);
      return DEFAULT_CHECKLIST_TEMPLATE;
    }
  }

  saveLog(payload) {
    if (!payload || typeof payload !== 'object') {
      throw new Error('Invalid payload object');
    }

    const operatorName = (payload.operator_name || payload.operatorName || '').trim();
    if (!operatorName) {
      throw new Error('Pilot / Operator Name is required');
    }

    const signature = (payload.signature || '').trim();
    if (!signature) {
      throw new Error('Digital signature is required');
    }

    const completedItems = payload.completed_items || payload.completedItems;
    if (!Array.isArray(completedItems)) {
      throw new Error('completed_items must be an array');
    }

    // Verify required items are passed or acknowledged with notes
    const templateGroups = this.getTemplate();
    const itemMap = new Map();
    for (const group of templateGroups) {
      for (const item of group.items) {
        itemMap.set(item.item_id, item);
      }
    }

    for (const completed of completedItems) {
      const spec = itemMap.get(completed.item_id);
      if (spec && spec.required) {
        if (!completed.passed && !completed.acknowledged && !completed.notes) {
          throw new Error(`Required item '${spec.label}' must be passed or acknowledged with notes`);
        }
      }
    }

    const logId = payload.log_id || payload.logId || `chk_${crypto.randomUUID()}`;
    const timestamp = payload.timestamp || new Date().toISOString();
    const missionId = payload.mission_id || payload.missionId || '';
    const kmzFilename = payload.kmz_filename || payload.kmzFilename || '';
    const airspaceAuthCode = payload.airspace_auth_code || payload.airspaceAuthCode || '';
    const templateVersion = payload.template_version || 1;
    const completedItemsJson = JSON.stringify(completedItems);
    const autoChecksJson = JSON.stringify(payload.auto_checks || payload.autoChecks || {});

    if (!this.db) {
      const record = {
        log_id: logId,
        timestamp,
        operator_name: operatorName,
        mission_id: missionId,
        kmz_filename: kmzFilename,
        completed_items: completedItems,
        airspace_auth_code: airspaceAuthCode,
        template_version: templateVersion,
        auto_checks: payload.auto_checks || {},
        signature
      };
      this.memoryLogs.unshift(record);
      return { success: true, log_id: logId, record };
    }

    try {
      const insertStmt = this.db.prepare(`
        INSERT INTO checklist_logs (
          log_id, timestamp, operator_name, mission_id, kmz_filename,
          completed_items, airspace_auth_code, template_version, auto_checks, signature
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      insertStmt.run(
        logId,
        timestamp,
        operatorName,
        missionId,
        kmzFilename,
        completedItemsJson,
        airspaceAuthCode,
        templateVersion,
        autoChecksJson,
        signature
      );

      return { success: true, log_id: logId };
    } catch (err) {
      console.error('[CHECKLIST DB ERROR] saveLog failed:', err.message);
      throw err;
    }
  }

  getHistory(limit = 50, offset = 0) {
    if (!this.db) {
      return this.memoryLogs.slice(offset, offset + limit);
    }

    try {
      const stmt = this.db.prepare(`
        SELECT * FROM checklist_logs
        ORDER BY timestamp DESC
        LIMIT ? OFFSET ?
      `);
      const rows = stmt.all(limit, offset);
      return rows.map(r => ({
        log_id: r.log_id,
        timestamp: r.timestamp,
        operator_name: r.operator_name,
        mission_id: r.mission_id,
        kmz_filename: r.kmz_filename,
        completed_items: JSON.parse(r.completed_items || '[]'),
        airspace_auth_code: r.airspace_auth_code,
        template_version: r.template_version,
        auto_checks: JSON.parse(r.auto_checks || '{}'),
        signature: r.signature
      }));
    } catch (err) {
      console.error('[CHECKLIST DB ERROR] getHistory failed:', err.message);
      return [];
    }
  }

  hasLaancAuth(code) {
    if (!code || typeof code !== 'string') return false;
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) return false;

    if (!this.db) {
      return this.memoryLogs.some(l => (l.airspace_auth_code || '').trim().toUpperCase() === cleanCode);
    }

    try {
      const stmt = this.db.prepare(`
        SELECT COUNT(*) as count FROM checklist_logs
        WHERE UPPER(TRIM(airspace_auth_code)) = ?
      `);
      const row = stmt.get(cleanCode);
      return row ? row.count > 0 : false;
    } catch (err) {
      return false;
    }
  }
}

module.exports = {
  ChecklistDatabase,
  DEFAULT_CHECKLIST_TEMPLATE
};
