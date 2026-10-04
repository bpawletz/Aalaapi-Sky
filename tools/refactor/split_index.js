const fs = require('fs');
const path = require('path');
const acorn = require('acorn');

const rootDir = path.resolve(__dirname, '..', '..');
const indexPath = path.join(rootDir, 'index.js.orig');
const code = fs.readFileSync(indexPath, 'utf8');

const ast = acorn.parse(code, {
  ecmaVersion: 'latest',
  sourceType: 'script',
  locations: true
});

const slicePoints = [
  { start: 0, end: 1, file: 'core/Logger.js' },
  { start: 1, end: 2, file: 'core/ToolRegistry.js' },
  { start: 2, end: 31, file: 'state/MissionStore.js' },
  { start: 31, end: 71, file: 'vision/GcpEngine.js' },
  { start: 71, end: 80, file: 'core/Utils.js' },
  { start: 80, end: 112, file: 'ui/ThemeManager.js' },
  { start: 112, end: 166, file: 'layers/LayerManager.js' },
  { start: 166, end: 210, file: 'map/MapEngine.js' },
  { start: 210, end: 229, file: 'ui/ResetManager.js' },
  { start: 229, end: 230, file: 'ui/EventBindings.js' },
  { start: 230, end: 237, file: 'ui/SidebarManager.js' },
  { start: 237, end: 253, file: 'map/MapInteraction.js' },
  { start: 253, end: 262, file: 'patterns/PatternGenerators.js' },
  { start: 262, end: 278, file: '3d/GeometryBuilder.js' },
  { start: 278, end: 301, file: 'geo/MathUtils.js' },
  { start: 301, end: 303, file: 'ui/TelemetryHud.js' },
  { start: 303, end: 308, file: 'export/WpmlCompiler.js' },
  { start: 308, end: 321, file: 'export/Packager.js' },
  { start: 321, end: 373, file: 'bridge/ApiClient.js' },
  { start: 373, end: 378, file: '3d/DigitalTwin.js' },
  { start: 378, end: 385, file: 'import/TelemetryParsers.js' },
  { start: 385, end: 411, file: 'import/KmzImporter.js' },
  { start: 411, end: 442, file: '3d/FlightSimulation.js' },
  { start: 442, end: 444, file: '3d/SceneManager.js' },
  { start: 444, end: 454, file: '3d/FpvHud.js' },
  { start: 454, end: 501, file: 'patterns/AutoPlan.js' },
  { start: 501, end: 515, file: 'airspace/TfrNotam.js' },
  { start: 515, end: 520, file: 'geo/Photogrammetry.js' },
  { start: 520, end: 523, file: 'vision/TagDetector.js' },
  { start: 523, end: 529, file: 'ui/Modals/PhotoInspector.js' },
  { start: 529, end: ast.body.length, file: 'bridge/Rc2LogExplorer.js' }
];

const srcDir = path.join(rootDir, 'src');

console.log('Splitting index.js into', slicePoints.length, 'modules in src/ ...');

const mainImports = [];

for (let i = 0; i < slicePoints.length; i++) {
  const sp = slicePoints[i];
  const startChar = (i === 0) ? 0 : ast.body[sp.start].start;
  const endChar = (i === slicePoints.length - 1) ? code.length : ast.body[sp.end].start;
  const chunk = code.slice(startChar, endChar);

  const destFile = path.join(srcDir, sp.file);
  fs.mkdirSync(path.dirname(destFile), { recursive: true });
  fs.writeFileSync(destFile, chunk, 'utf8');

  mainImports.push(`import './${sp.file}';`);
}

const mainContent = `// Aalaapi Sky - Entry Point and Module Ordering\n// Auto-generated module load sequence\n\n` + mainImports.join('\n') + '\n';
fs.writeFileSync(path.join(srcDir, 'main.js'), mainContent, 'utf8');

console.log('Split complete! src/main.js written with', mainImports.length, 'ordered imports.');
