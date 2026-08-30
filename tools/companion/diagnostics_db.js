/**
 * tools/companion/diagnostics_db.js
 * SQLite Storage Service for Mission Plans, 3D Telemetry Simulations, and Diagnostics.
 * Powered by Node.js built-in node:sqlite (DatabaseSync).
 */

const fs = require('fs');
const path = require('path');

let DatabaseSync = null;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch (e) {
  // Built-in node:sqlite unavailable on legacy node
}

const DEFAULT_DB_PATH = path.resolve(__dirname, '../../scratch/missions.db');

class DiagnosticsDatabase {
  constructor(dbPath = DEFAULT_DB_PATH) {
    this.dbPath = dbPath;
    this.db = null;
    this.init();
  }

  init() {
    if (!DatabaseSync) {
      console.warn('[DIAG DB] node:sqlite is not available in this Node runtime. Fallback mode active.');
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
        CREATE TABLE IF NOT EXISTS mission_diagnostics (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          archive_id TEXT UNIQUE NOT NULL,
          uuid TEXT NOT NULL,
          filename TEXT,
          created_at TEXT NOT NULL,
          flight_pattern TEXT,
          altitude REAL,
          speed REAL,
          gimbal_pitch REAL,
          waypoint_count INTEGER,
          photo_count INTEGER,
          total_distance REAL,
          estimated_duration REAL,
          user_agent_raw TEXT,
          user_agent_platform TEXT,
          user_agent_json TEXT,
          plan_json TEXT,
          diag_json TEXT,
          has_actual_flight INTEGER DEFAULT 0,
          actual_flight_file TEXT,
          variance_json TEXT,
          is_valid INTEGER DEFAULT 1,
          validation_rules_passed INTEGER DEFAULT 10,
          validation_errors_count INTEGER DEFAULT 0,
          validation_errors_json TEXT,
          validation_warnings_json TEXT,
          validation_report_json TEXT,
          wpml_xml TEXT,
          template_xml TEXT,
          execution_status TEXT DEFAULT 'pending',
          execution_error TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_mission_created ON mission_diagnostics (created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_mission_uuid ON mission_diagnostics (uuid);
        CREATE INDEX IF NOT EXISTS idx_mission_pattern ON mission_diagnostics (flight_pattern);
      `);

      // Safe table migration if uuid was UNIQUE or archive_id is missing
      try {
        const tableSchema = this.db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='mission_diagnostics'").get();
        if (tableSchema && tableSchema.sql && /uuid\s+TEXT\s+UNIQUE/i.test(tableSchema.sql)) {
          this.db.exec(`
            CREATE TABLE IF NOT EXISTS mission_diagnostics_v2 (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              archive_id TEXT UNIQUE NOT NULL,
              uuid TEXT NOT NULL,
              filename TEXT,
              created_at TEXT NOT NULL,
              flight_pattern TEXT,
              altitude REAL,
              speed REAL,
              gimbal_pitch REAL,
              waypoint_count INTEGER,
              photo_count INTEGER,
              total_distance REAL,
              estimated_duration REAL,
              user_agent_raw TEXT,
              user_agent_platform TEXT,
              user_agent_json TEXT,
              plan_json TEXT,
              diag_json TEXT,
              has_actual_flight INTEGER DEFAULT 0,
              actual_flight_file TEXT,
              variance_json TEXT,
              is_valid INTEGER DEFAULT 1,
              validation_rules_passed INTEGER DEFAULT 10,
              validation_errors_count INTEGER DEFAULT 0,
              validation_errors_json TEXT,
              validation_warnings_json TEXT,
              validation_report_json TEXT,
              wpml_xml TEXT,
              template_xml TEXT,
              execution_status TEXT DEFAULT 'pending',
              execution_error TEXT
            );

            INSERT OR IGNORE INTO mission_diagnostics_v2 (
              id, archive_id, uuid, filename, created_at, flight_pattern, altitude, speed, gimbal_pitch,
              waypoint_count, photo_count, total_distance, estimated_duration,
              user_agent_raw, user_agent_platform, user_agent_json,
              plan_json, diag_json, has_actual_flight, actual_flight_file, variance_json,
              is_valid, validation_rules_passed, validation_errors_count,
              validation_errors_json, validation_warnings_json, validation_report_json,
              wpml_xml, template_xml, execution_status, execution_error
            )
            SELECT
              id,
              COALESCE(uuid || '_' || created_at, 'mission_' || id),
              uuid, filename, created_at, flight_pattern, altitude, speed, gimbal_pitch,
              waypoint_count, photo_count, total_distance, estimated_duration,
              user_agent_raw, user_agent_platform, user_agent_json,
              plan_json, diag_json, has_actual_flight, actual_flight_file, variance_json,
              is_valid, validation_rules_passed, validation_errors_count,
              validation_errors_json, validation_warnings_json, validation_report_json,
              wpml_xml, template_xml, execution_status, execution_error
            FROM mission_diagnostics;

            DROP TABLE mission_diagnostics;
            ALTER TABLE mission_diagnostics_v2 RENAME TO mission_diagnostics;
            CREATE INDEX IF NOT EXISTS idx_mission_created ON mission_diagnostics (created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_mission_uuid ON mission_diagnostics (uuid);
            CREATE INDEX IF NOT EXISTS idx_mission_archive_id ON mission_diagnostics (archive_id);
            CREATE INDEX IF NOT EXISTS idx_mission_pattern ON mission_diagnostics (flight_pattern);
          `);
        }
      } catch (migErr) {
        console.error('[DIAG DB MIGRATION ERROR]', migErr.message);
      }

      // Safe column migration for existing databases
      try {
        const existingCols = new Set(
          this.db.prepare("PRAGMA table_info(mission_diagnostics)").all().map(c => c.name)
        );
        if (!existingCols.has('archive_id')) {
          this.db.exec('ALTER TABLE mission_diagnostics ADD COLUMN archive_id TEXT;');
          this.db.exec("UPDATE mission_diagnostics SET archive_id = uuid || '_' || created_at WHERE archive_id IS NULL;");
        }
        const colsToAdd = [
          ['is_valid', 'INTEGER DEFAULT 1'],
          ['validation_rules_passed', 'INTEGER DEFAULT 10'],
          ['validation_errors_count', 'INTEGER DEFAULT 0'],
          ['validation_errors_json', 'TEXT'],
          ['validation_warnings_json', 'TEXT'],
          ['validation_report_json', 'TEXT'],
          ['wpml_xml', 'TEXT'],
          ['template_xml', 'TEXT'],
          ['execution_status', "TEXT DEFAULT 'pending'"],
          ['execution_error', 'TEXT']
        ];
        for (const [col, colType] of colsToAdd) {
          if (!existingCols.has(col)) {
            try {
              this.db.exec(`ALTER TABLE mission_diagnostics ADD COLUMN ${col} ${colType};`);
            } catch (e) {}
          }
        }
        this.db.exec('CREATE INDEX IF NOT EXISTS idx_mission_valid ON mission_diagnostics (is_valid);');
        this.db.exec('CREATE INDEX IF NOT EXISTS idx_mission_archive_id ON mission_diagnostics (archive_id);');
      } catch (migrationErr) {}

      // Auto-restore any missing mission exports from disk backups if using the default database
      try {
        if (this.dbPath === DEFAULT_DB_PATH) {
          const archiveDir = path.resolve(__dirname, '../../scratch/mission_archives');
          if (fs.existsSync(archiveDir)) {
            this.restoreFromDiskArchives(archiveDir);
          }
        }
      } catch (e) {}
    } catch (err) {
      console.error('[DIAG DB ERROR] Failed to initialize SQLite database:', err.message);
      this.db = null;
    }
  }

  saveDiagnostic(payload = {}) {
    if (!this.db) return { success: false, error: 'Database not initialized' };

    try {
      const uuid = payload.uuid || payload.metadata?.uuid || `mission_${Date.now()}`;
      const filename = payload.filename || payload.metadata?.filename || `${uuid}.kmz`;
      const createdAt = payload.createdAt || payload.metadata?.createdAt || new Date().toISOString();
      const archiveId = payload.archiveId || payload.archive_id || `${uuid}_${createdAt}`;
      const flightPattern = payload.flightPattern || payload.plan?.pattern || payload.metadata?.pattern || 'single';
      const altitude = payload.altitude ?? payload.plan?.altitude ?? 50.0;
      const speed = payload.speed ?? payload.plan?.speed ?? 4.0;
      const gimbalPitch = payload.gimbalPitch ?? payload.plan?.gimbalPitch ?? -60.0;
      const waypointCount = payload.waypointCount ?? payload.summary?.waypointCount ?? (payload.plan?.waypoints?.length || 0);
      const photoCount = payload.photoCount ?? payload.summary?.photoCount ?? 0;
      const totalDistance = payload.totalDistance ?? payload.summary?.totalDistance ?? 0.0;
      const estimatedDuration = payload.estimatedDuration ?? payload.summary?.estimatedDuration ?? 0.0;

      const ua = payload.userAgent || {};
      const uaRaw = ua.raw || (typeof ua === 'string' ? ua : '');
      const uaPlatform = ua.platform || '';
      const uaJson = typeof ua === 'object' ? JSON.stringify(ua) : JSON.stringify({ raw: uaRaw });

      const planJson = payload.plan ? JSON.stringify(payload.plan) : (payload.plan_json || '{}');
      const diagJson = payload.diagnostics ? JSON.stringify(payload.diagnostics) : (payload.diag_json || JSON.stringify(payload));

      const isValid = (payload.isValid !== undefined ? (payload.isValid ? 1 : 0) : (payload.validation?.valid !== undefined ? (payload.validation.valid ? 1 : 0) : (payload.is_valid !== undefined ? (payload.is_valid ? 1 : 0) : 1)));
      const validationRulesPassed = payload.validationRulesPassed ?? payload.validation?.rulesPassed ?? payload.validation_rules_passed ?? 10;
      const validationErrors = payload.validationErrors || payload.validation?.errors || [];
      const validationErrorsCount = Array.isArray(validationErrors) ? validationErrors.length : 0;
      const validationErrorsJson = JSON.stringify(validationErrors);
      const validationWarnings = payload.validationWarnings || payload.validation?.warnings || [];
      const validationWarningsJson = JSON.stringify(validationWarnings);
      const validationReport = payload.validationReport || payload.validation || null;
      const validationReportJson = validationReport ? JSON.stringify(validationReport) : null;
      const wpmlXml = payload.wpmlXml || payload.wpml_xml || payload.rawWpml || '';
      const templateXml = payload.templateXml || payload.template_xml || payload.rawTemplate || '';
      const executionStatus = payload.executionStatus || payload.execution_status || (isValid === 0 ? 'invalid' : 'pending');
      const executionError = payload.executionError || payload.execution_error || (validationErrors.length > 0 ? validationErrors.join('; ') : '');

      const stmt = this.db.prepare(`
        INSERT INTO mission_diagnostics (
          archive_id, uuid, filename, created_at, flight_pattern, altitude, speed, gimbal_pitch,
          waypoint_count, photo_count, total_distance, estimated_duration,
          user_agent_raw, user_agent_platform, user_agent_json,
          plan_json, diag_json,
          is_valid, validation_rules_passed, validation_errors_count,
          validation_errors_json, validation_warnings_json, validation_report_json,
          wpml_xml, template_xml, execution_status, execution_error
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?
        )
        ON CONFLICT(archive_id) DO UPDATE SET
          uuid = excluded.uuid,
          filename = excluded.filename,
          created_at = excluded.created_at,
          flight_pattern = excluded.flight_pattern,
          altitude = excluded.altitude,
          speed = excluded.speed,
          gimbal_pitch = excluded.gimbal_pitch,
          waypoint_count = excluded.waypoint_count,
          photo_count = excluded.photo_count,
          total_distance = excluded.total_distance,
          estimated_duration = excluded.estimated_duration,
          user_agent_raw = excluded.user_agent_raw,
          user_agent_platform = excluded.user_agent_platform,
          user_agent_json = excluded.user_agent_json,
          plan_json = excluded.plan_json,
          diag_json = excluded.diag_json,
          is_valid = excluded.is_valid,
          validation_rules_passed = excluded.validation_rules_passed,
          validation_errors_count = excluded.validation_errors_count,
          validation_errors_json = excluded.validation_errors_json,
          validation_warnings_json = excluded.validation_warnings_json,
          validation_report_json = excluded.validation_report_json,
          wpml_xml = excluded.wpml_xml,
          template_xml = excluded.template_xml,
          execution_status = excluded.execution_status,
          execution_error = excluded.execution_error;
      `);

      stmt.run(
        archiveId, uuid, filename, createdAt, flightPattern, altitude, speed, gimbalPitch,
        waypointCount, photoCount, totalDistance, estimatedDuration,
        uaRaw, uaPlatform, uaJson,
        planJson, diagJson,
        isValid, validationRulesPassed, validationErrorsCount,
        validationErrorsJson, validationWarningsJson, validationReportJson,
        wpmlXml, templateXml, executionStatus, executionError
      );

      return { success: true, uuid, archiveId };
    } catch (err) {
      console.error('[DIAG DB ERROR] Failed to save diagnostic:', err.message);
      return { success: false, error: err.message };
    }
  }

  rowToMission(row) {
    if (!row) return null;
    return {
      ...row,
      plan: row.plan_json ? JSON.parse(row.plan_json) : null,
      diagnostics: row.diag_json ? JSON.parse(row.diag_json) : null,
      validationReport: row.validation_report_json ? JSON.parse(row.validation_report_json) : null,
      validationErrors: row.validation_errors_json ? JSON.parse(row.validation_errors_json) : [],
      validationWarnings: row.validation_warnings_json ? JSON.parse(row.validation_warnings_json) : [],
      userAgent: row.user_agent_json ? JSON.parse(row.user_agent_json) : null,
      variance: row.variance_json ? JSON.parse(row.variance_json) : null
    };
  }

  getHistory(limit = 50, offset = 0) {
    if (!this.db) return [];
    try {
      const stmt = this.db.prepare(`
        SELECT
          id, archive_id, uuid, filename, created_at, flight_pattern, altitude, speed, gimbal_pitch,
          waypoint_count, photo_count, total_distance, estimated_duration,
          user_agent_raw, user_agent_platform, has_actual_flight, actual_flight_file,
          is_valid, validation_rules_passed, validation_errors_count,
          validation_errors_json, execution_status, execution_error
        FROM mission_diagnostics
        ORDER BY id DESC
        LIMIT ? OFFSET ?
      `);
      return stmt.all(limit, offset).map(r => ({
        ...r,
        validation_errors: r.validation_errors_json ? JSON.parse(r.validation_errors_json) : []
      }));
    } catch (err) {
      console.error('[DIAG DB ERROR] Failed to query history:', err.message);
      return [];
    }
  }

  getBadMissions(limit = 50, offset = 0) {
    if (!this.db) return [];
    try {
      const stmt = this.db.prepare(`
        SELECT
          id, archive_id, uuid, filename, created_at, flight_pattern, altitude, speed, gimbal_pitch,
          waypoint_count, photo_count, total_distance, estimated_duration,
          is_valid, validation_rules_passed, validation_errors_count,
          validation_errors_json, execution_status, execution_error
        FROM mission_diagnostics
        WHERE is_valid = 0 OR execution_status = 'suspended' OR execution_status = 'failed'
        ORDER BY id DESC
        LIMIT ? OFFSET ?
      `);
      return stmt.all(limit, offset).map(r => ({
        ...r,
        validation_errors: r.validation_errors_json ? JSON.parse(r.validation_errors_json) : []
      }));
    } catch (err) {
      console.error('[DIAG DB ERROR] Failed to query bad missions:', err.message);
      return [];
    }
  }

  getLatestBadMission() {
    if (!this.db) return null;
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM mission_diagnostics
        WHERE is_valid = 0 OR execution_status = 'suspended' OR execution_status = 'failed'
        ORDER BY id DESC
        LIMIT 1
      `);
      const row = stmt.get();
      return this.rowToMission(row);
    } catch (err) {
      console.error('[DIAG DB ERROR] Failed to query latest bad mission:', err.message);
      return null;
    }
  }

  getByIdOrArchiveIdOrUuid(identifier) {
    if (!this.db || identifier === undefined || identifier === null) return null;
    try {
      let row = null;
      if (typeof identifier === 'number' || /^\d+$/.test(String(identifier))) {
        const stmt = this.db.prepare('SELECT * FROM mission_diagnostics WHERE id = ?');
        row = stmt.get(Number(identifier));
      }
      if (!row) {
        const stmt = this.db.prepare('SELECT * FROM mission_diagnostics WHERE archive_id = ?');
        row = stmt.get(String(identifier));
      }
      if (!row) {
        const stmt = this.db.prepare('SELECT * FROM mission_diagnostics WHERE uuid = ? ORDER BY id DESC LIMIT 1');
        row = stmt.get(String(identifier));
      }
      return this.rowToMission(row);
    } catch (err) {
      console.error('[DIAG DB ERROR] Failed to get record:', err.message);
      return null;
    }
  }

  getByUuid(identifier) {
    return this.getByIdOrArchiveIdOrUuid(identifier);
  }

  reportExecutionFailure(identifier, errorMessage = 'Waypoint Flight Suspended') {
    if (!this.db || !identifier) return { success: false, error: 'Database or identifier missing' };
    try {
      const record = this.getByIdOrArchiveIdOrUuid(identifier);
      if (!record) return { success: false, error: 'Mission not found' };
      const stmt = this.db.prepare(`
        UPDATE mission_diagnostics
        SET execution_status = 'suspended',
            execution_error = ?,
            is_valid = 0
        WHERE id = ?
      `);
      const result = stmt.run(errorMessage, record.id);
      return { success: true, changes: result.changes };
    } catch (err) {
      console.error('[DIAG DB ERROR] Failed to report execution failure:', err.message);
      return { success: false, error: err.message };
    }
  }

  linkActualFlight(identifier, actualFlightFile, varianceData) {
    if (!this.db || !identifier) return false;
    try {
      const record = this.getByIdOrArchiveIdOrUuid(identifier);
      if (!record) return false;
      const varianceJson = varianceData ? JSON.stringify(varianceData) : null;
      const stmt = this.db.prepare(`
        UPDATE mission_diagnostics
        SET has_actual_flight = 1,
            actual_flight_file = ?,
            variance_json = ?
        WHERE id = ?
      `);
      stmt.run(actualFlightFile, varianceJson, record.id);
      return true;
    } catch (err) {
      console.error('[DIAG DB ERROR] Failed to link actual flight:', err.message);
      return false;
    }
  }

  restoreFromDiskArchives(archiveDir = path.resolve(__dirname, '../../scratch/mission_archives')) {
    if (!this.db || !fs.existsSync(archiveDir)) return 0;
    let restored = 0;
    try {
      const files = fs.readdirSync(archiveDir).filter(f => f.endsWith('_diag.json'));
      for (const file of files) {
        try {
          const content = fs.readFileSync(path.join(archiveDir, file), 'utf8');
          const payload = JSON.parse(content);
          if (payload && (payload.uuid || payload.metadata?.uuid)) {
            const res = this.saveDiagnostic(payload);
            if (res && res.success) restored++;
          }
        } catch (e) {}
      }
    } catch (err) {
      console.error('[DIAG DB RESTORE ERROR]', err.message);
    }
    return restored;
  }

  close() {
    if (this.db) {
      try {
        this.db.close();
      } catch (e) {}
      this.db = null;
    }
  }
}

module.exports = {
  DiagnosticsDatabase,
  DEFAULT_DB_PATH
};
