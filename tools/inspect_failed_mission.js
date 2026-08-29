/**
 * tools/inspect_failed_mission.js
 * Antigravity CLI Triage Tool for Bad KMZ Flight Missions
 *
 * Usage:
 *   node tools/inspect_failed_mission.js latest
 *   node tools/inspect_failed_mission.js list
 *   node tools/inspect_failed_mission.js <uuid>
 */

const path = require('path');
const { DiagnosticsDatabase, DEFAULT_DB_PATH } = require('./companion/diagnostics_db.js');

const db = new DiagnosticsDatabase(DEFAULT_DB_PATH);

const cmd = (process.argv[2] || 'latest').toLowerCase();

if (cmd === 'list') {
  const badMissions = db.getBadMissions(25);
  if (badMissions.length === 0) {
    console.log('✅ No bad or suspended missions recorded in scratch/missions.db.');
    process.exit(0);
  }
  console.log('=== BAD / SUSPENDED KMZ MISSIONS IN HISTORY ===');
  console.log(`Total Recorded: ${badMissions.length}\n`);
  badMissions.forEach((m, idx) => {
    const errCount = m.validation_errors ? m.validation_errors.length : m.validation_errors_count;
    const errors = m.validation_errors || [];
    console.log(`[${idx + 1}] UUID: ${m.uuid}`);
    console.log(`    File:      ${m.filename || 'N/A'}`);
    console.log(`    Date:      ${m.created_at}`);
    console.log(`    Pattern:   ${m.flight_pattern} (alt: ${m.altitude}m, speed: ${m.speed}m/s)`);
    console.log(`    Status:    ${m.execution_status} (${errCount} validation errors)`);
    if (errors.length > 0) {
      console.log(`    Primary:   ${errors[0]}`);
    }
    console.log('');
  });
  process.exit(0);
}

let record = null;
if (cmd === 'latest') {
  record = db.getLatestBadMission();
  if (!record) {
    console.log('✅ No bad or suspended missions found in scratch/missions.db.');
    console.log("Use 'node tools/inspect_failed_mission.js list' to check all records.");
    process.exit(0);
  }
} else {
  record = db.getByUuid(process.argv[2]);
  if (!record) {
    console.error(`❌ Mission with UUID '${process.argv[2]}' not found in database.`);
    process.exit(1);
  }
}

// Format detailed diagnostic report for Antigravity
console.log('======================================================================');
console.log('             ANTIGRAVITY BAD KMZ TRIAGE REPORT                       ');
console.log('======================================================================');
console.log(`UUID:             ${record.uuid}`);
console.log(`Filename:         ${record.filename || 'N/A'}`);
console.log(`Created At:       ${record.created_at}`);
console.log(`Flight Pattern:   ${record.flight_pattern}`);
console.log(`Altitude / Speed: ${record.altitude} m / ${record.speed} m/s`);
console.log(`Gimbal Pitch:     ${record.gimbal_pitch}°`);
console.log(`Waypoints:        ${record.waypoint_count} wps | ${record.photo_count} photos`);
console.log(`Execution Status: ${record.execution_status || 'invalid'}`);
if (record.execution_error) {
  console.log(`Execution Error:  ${record.execution_error}`);
}
console.log('----------------------------------------------------------------------');
console.log('VALIDATION AUDIT BREAKDOWN:');
console.log(`Rules Passed:     ${record.validation_rules_passed || 0}/10`);
console.log(`Errors Count:     ${record.validationErrors ? record.validationErrors.length : record.validation_errors_count}`);

if (record.validationErrors && record.validationErrors.length > 0) {
  console.log('\nDetected Errors:');
  record.validationErrors.forEach((e, i) => console.log(`  ❌ [${i + 1}] ${e}`));
}

if (record.validationWarnings && record.validationWarnings.length > 0) {
  console.log('\nDetected Warnings:');
  record.validationWarnings.forEach((w, i) => console.log(`  ⚠️ [${i + 1}] ${w}`));
}

if (record.plan && record.plan.waypoints) {
  console.log('----------------------------------------------------------------------');
  console.log(`WAYPOINT SUMMARY (${record.plan.waypoints.length} waypoints):`);
  const sample = record.plan.waypoints.slice(0, 4);
  sample.forEach((wp, idx) => {
    console.log(`  WP ${idx}: lat=${wp.lat}, lon=${wp.lon}, alt=${wp.alt || record.altitude}, heading=${wp.heading ?? 'inherit'}, turn=${wp.turnMode || 'inherit'}`);
  });
  if (record.plan.waypoints.length > 4) {
    console.log(`  ... (${record.plan.waypoints.length - 4} more waypoints)`);
  }
}

if (record.wpml_xml) {
  console.log('----------------------------------------------------------------------');
  console.log('OFFENDING WAYLINES.WPML EXTRACT:');
  const placemarks = record.wpml_xml.split('<Placemark>');
  if (placemarks.length > 1) {
    console.log(('<Placemark>' + placemarks[1].substring(0, 500)).trim() + '...\n</Placemark>');
  }
}

console.log('======================================================================');
console.log('RECOMMENDED ANTIGRAVITY FIX INSTRUCTIONS:');
console.log('1. Formulate a regression test in index.test.js replicating these exact waypoints.');
console.log('2. Verify the validator flags the failure.');
console.log('3. Implement the fix in index.js (buildWaylinesWpml / validateAndFixWpml).');
console.log('4. Rebuild via python scratch/build.py and verify 100% test pass.');
console.log('======================================================================');

db.close();
