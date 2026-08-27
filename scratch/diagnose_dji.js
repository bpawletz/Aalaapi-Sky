const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');
const { parseRemoteIdPayload, RemoteIdAirspaceTracker } = require('../tools/companion/remote_id_decoder.js');

const exe = path.join(__dirname, '../tools/companion/BleScanner.exe');
const proc = spawn(exe, [], { stdio: ['pipe', 'pipe', 'inherit'] });
const tracker = new RemoteIdAirspaceTracker(30);

console.log('>>> BleScanner (with Bluetooth 5 Extended Ads enabled) started. Listening for 8 seconds...');
let rawCount = 0;
let matchCount = 0;

const rl = readline.createInterface({ input: proc.stdout });
rl.on('line', (line) => {
  if (!line.startsWith('ADV|')) return;
  rawCount++;
  const parts = line.split('|');
  if (parts.length >= 5) {
    const mac = parts[1];
    const rssi = parseInt(parts[2], 10) || -70;
    const typeHex = parts[3];
    const payloadHex = parts[4];

    const msgs = parseRemoteIdPayload(payloadHex, typeHex);
    if (msgs && msgs.length > 0) {
      matchCount++;
      const drone = tracker.processAdvertisement({ mac, rssi, rawPayload: payloadHex });
      console.log(`\n🎯 [FOUND DRONE BLE!] MAC: ${mac} (RSSI: ${rssi} dBm)`);
      console.log(`   Model: ${drone.model} | UAS ID: ${drone.uasId}`);
      console.log(`   Location: Lat ${drone.latitude}, Lon ${drone.longitude}, Alt: ${drone.altitudeGeodetic}m`);
      console.log(`   Pilot: Lat ${drone.operatorLatitude}, Lon ${drone.operatorLongitude}`);
      console.log(`   Decoded Messages:`, JSON.stringify(msgs, null, 2));
    }
  }
});

setTimeout(() => {
  proc.stdin.write('quit\n');
  proc.kill();
  console.log(`\nFinished scan: Checked ${rawCount} raw BLE advertisements.`);
  console.log(`Total Remote ID matches found: ${matchCount}`);
  const active = tracker.getActiveDrones();
  console.log(`Active tracker drones: ${active.length}`);
  process.exit(0);
}, 8000);
