const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');

const exe = path.join(__dirname, '../tools/companion/WifiScanner.exe');
const proc = spawn(exe, [], { stdio: ['pipe', 'pipe', 'inherit'] });

console.log('>>> WifiScanner.exe started, capturing for 5 seconds...');
let count = 0;

const rl = readline.createInterface({ input: proc.stdout });
rl.on('line', (line) => {
  console.log('OUTPUT:', line);
  if (line.startsWith('WIFI|')) count++;
});

setTimeout(() => {
  proc.stdin.write('quit\n');
  proc.kill();
  console.log(`\nFinished: captured ${count} filtered Wi-Fi lines.`);
  process.exit(0);
}, 5000);
