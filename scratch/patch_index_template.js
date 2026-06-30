const fs = require('fs');
let template = fs.readFileSync('index_template.html', 'utf8');

// The issue said we should patch index_template.html when patching index.html,
// but checking index_template.html, it sources index.js and doesn't inline enterAutoPlanMode.
// However I will verify if it's there.
