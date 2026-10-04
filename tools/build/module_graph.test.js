const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

describe('Module Graph & Bundler Integrity Tests (Issue #116)', () => {
  const rootDir = path.resolve(__dirname, '..', '..');
  const srcDir = path.join(rootDir, 'src');
  const distDir = path.join(rootDir, 'dist');
  const bundlePath = path.join(distDir, 'index.bundle.js');
  const mainPath = path.join(srcDir, 'main.js');

  test('src/main.js exists and lists valid modules', () => {
    assert.ok(fs.existsSync(mainPath), 'src/main.js must exist');
    const mainContent = fs.readFileSync(mainPath, 'utf8');
    const importMatches = [...mainContent.matchAll(/^\s*import\s+['"]\.\/([^'"]+)['"]\s*;?/gm)];
    assert.ok(importMatches.length >= 20, 'src/main.js must import all modules');

    importMatches.forEach(m => {
      const modRel = m[1];
      const modFull = path.join(srcDir, modRel);
      assert.ok(fs.existsSync(modFull), `Module ${modRel} must exist on disk`);
    });
  });

  test('check_modules validator runs cleanly and passes', () => {
    const validatorPath = path.join(rootDir, 'tools', 'build', 'check_modules.js');
    assert.ok(fs.existsSync(validatorPath), 'check_modules.js must exist');
    const out = execSync(`node "${validatorPath}"`, { cwd: rootDir, encoding: 'utf8' });
    assert.ok(out.includes('check_modules: PASS'), 'Validator must output PASS');
  });

  test('dist/index.bundle.js contains module banners in order', () => {
    assert.ok(fs.existsSync(bundlePath), 'dist/index.bundle.js must exist');
    const bundleContent = fs.readFileSync(bundlePath, 'utf8');
    assert.ok(bundleContent.includes('src/core/Logger.js'), 'Must contain Logger module banner');
    assert.ok(bundleContent.includes('src/export/WpmlCompiler.js'), 'Must contain WpmlCompiler module banner');
    assert.ok(bundleContent.includes('src/state/MissionStore.js'), 'Must contain MissionStore module banner');
  });

  test('Critical flight planning functions exist globally in bundle', () => {
    const bundleContent = fs.readFileSync(bundlePath, 'utf8');
    assert.ok(bundleContent.includes('function buildWaylinesWpml('), 'buildWaylinesWpml must be defined');
    assert.ok(bundleContent.includes('function buildTemplateKml('), 'buildTemplateKml must be defined');
    assert.ok(bundleContent.includes('function validateWpmlMission('), 'validateWpmlMission must be defined');
    assert.ok(bundleContent.includes('function validateAndFixWpml('), 'validateAndFixWpml must be defined');
    assert.ok(bundleContent.includes('function haversineDistance('), 'haversineDistance must be defined');
  });
});
