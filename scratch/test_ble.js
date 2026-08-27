const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');

const exe = path.join(__dirname, '../tools/companion/BleScanner.exe');
const proc = spawn(exe, [], { stdio: ['pipe', 'pipe', 'inherit'] });

console.log('Started BleScanner.exe, capturing for 5 seconds...');
const packets = [];

const rl = readline.createInterface({ input: proc.stdout });
rl.on('line', (line) => {
  if (line.startsWith('ADV|')) {
    packets.push(line);
    const parts = line.split('|');
    if (parts.length >= 5) {
      const type = parts[3];
      const hex = parts[4];
      if (hex.includes('FAFF') || hex.includes('FFFA') || hex.includes('1581') || hex.startsWith('8808') || hex.startsWith('0888')) {
        console.log('>>> MATCH POTENTIAL DRONE:', line);
      }
    }
  }
});

setTimeout(() => {
  proc.stdin.write('quit\n');
  proc.kill();
  console.log(`Captured ${packets.length} ADV lines.`);
  console.log('Sample of last 10 packets:');
  packets.slice(-10).forEach(p => console.log(p));
  process.exit(0);
}, 5000);
