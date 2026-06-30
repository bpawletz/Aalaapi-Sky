const fs = require('fs');

let indexJs = fs.readFileSync('index.js', 'utf8');
indexJs = indexJs.replace(
  "function enterAutoPlanMode() {\n  autoPlanActive = true;",
  "function enterAutoPlanMode() {\n  autoPlanActive = true;\n\n  if (window.innerWidth <= 768) {\n    const sidebar = document.querySelector('.sidebar');\n    if (sidebar) sidebar.classList.remove('open');\n  }"
);
fs.writeFileSync('index.js', indexJs);

let indexHtml = fs.readFileSync('index.html', 'utf8');
indexHtml = indexHtml.replace(
  "function enterAutoPlanMode() {\n  autoPlanActive = true;",
  "function enterAutoPlanMode() {\n  autoPlanActive = true;\n\n  if (window.innerWidth <= 768) {\n    const sidebar = document.querySelector('.sidebar');\n    if (sidebar) sidebar.classList.remove('open');\n  }"
);
fs.writeFileSync('index.html', indexHtml);

console.log("Patched!");
