const fs = require('fs');

const indexHtml = fs.readFileSync('index.html', 'utf8');
const indexJs = fs.readFileSync('index.js', 'utf8');

console.log("Checking index.js...");
console.log(indexJs.includes("if (window.innerWidth <= 768) {\n    document.querySelector('.sidebar').classList.remove('open');\n  }"));
