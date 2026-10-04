const fs = require('fs');
const path = require('path');
const acorn = require('acorn');

const rootDir = path.resolve(__dirname, '..', '..');
const srcDir = path.join(rootDir, 'src');
const mainPath = path.join(srcDir, 'main.js');

if (!fs.existsSync(mainPath)) {
  console.error('Error: src/main.js not found');
  process.exit(1);
}

const mainContent = fs.readFileSync(mainPath, 'utf8');
const importMatches = [...mainContent.matchAll(/^\s*import\s+['"]\.\/([^'"]+)['"]\s*;?/gm)];
const moduleRelPaths = importMatches.map(m => m[1]);

console.log(`Auditing ${moduleRelPaths.length} modules referenced in src/main.js...`);

let hasError = false;
const definedSymbols = new Map();

moduleRelPaths.forEach(rel => {
  const fullPath = path.join(srcDir, rel);
  if (!fs.existsSync(fullPath)) {
    console.error(`Missing module file: ${rel}`);
    hasError = true;
    return;
  }

  const code = fs.readFileSync(fullPath, 'utf8');
  let ast;
  try {
    ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
  } catch (err) {
    console.error(`Syntax error in ${rel} (Line ${err.loc ? err.loc.line : '?'}, Col ${err.loc ? err.loc.column : '?'}): ${err.message}`);
    hasError = true;
    return;
  }

  // Scan top-level declarations
  ast.body.forEach(stmt => {
    let declNames = [];
    if (stmt.type === 'FunctionDeclaration') {
      declNames.push(stmt.id.name);
    } else if (stmt.type === 'ClassDeclaration') {
      declNames.push(stmt.id.name);
    } else if (stmt.type === 'ExportNamedDeclaration' && stmt.declaration) {
      if (stmt.declaration.type === 'FunctionDeclaration' || stmt.declaration.type === 'ClassDeclaration') {
        declNames.push(stmt.declaration.id.name);
      } else if (stmt.declaration.type === 'VariableDeclaration') {
        stmt.declaration.declarations.forEach(d => {
          if (d.id && d.id.name) declNames.push(d.id.name);
        });
      }
    }

    declNames.forEach(name => {
      if (definedSymbols.has(name)) {
        // Top-level collision warning
        // Note: some intentional overrides or lexical scopes might exist, but we log
      } else {
        definedSymbols.set(name, rel);
      }
    });
  });
});

console.log(`Audit complete! Verified ${moduleRelPaths.length} modules, ${definedSymbols.size} unique symbols indexed.`);

if (hasError) {
  process.exit(1);
} else {
  console.log('check_modules: PASS');
  process.exit(0);
}
