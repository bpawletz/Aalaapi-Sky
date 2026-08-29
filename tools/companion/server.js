/**
 * Aalaapi Sky - Node.js Companion Service
 * 
 * Provides a lightweight local REST API on port 8765 to bridge the Aalaapi Sky
 * browser web interface with a connected DJI RC 2 controller over USB MTP.
 * 
 * Features:
 * - Real-time RC 2 connection status detection with live CLI state tracking
 * - Direct 1-click in-browser mission and route thumbnail transfer
 * - Automated Downloads folder watcher & flight log inspection
 * - Telemetry log extraction, 3D trajectory replay & variance analysis
 * - Interactive terminal CLI dashboard with ANSI status indicators
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const readline = require('node:readline');
const { execFile, spawn, execFileSync } = require('node:child_process');

const VERSION = '1.48.2';
const PORT = process.env.AALAAPI_PORT ? parseInt(process.env.AALAAPI_PORT, 10) : 8765;
const STAGING_DIR = path.resolve(__dirname, '../../scratch/companion_staging');
const LATEST_DIR = path.resolve(__dirname, '../../scratch/latest_flight');

const {
  RemoteIdAirspaceTracker,
  createSyntheticOdidPayload,
  parseRemoteIdPayload
} = require('./remote_id_decoder.js');

const airspaceTracker = new RemoteIdAirspaceTracker(15);
let bleScannerProc = null;
let bleScannerActive = false;
let totalBlePackets = 0;

let wifiScannerProc = null;
let wifiScannerActive = false;
let totalWifiPackets = 0;

const IS_WINDOWS = process.platform === 'win32';

function startBleScanner() {
  if (!IS_WINDOWS) {
    logDetail('BLE Scanner', `Live Bluetooth sniffing is Windows-only; skipped on ${process.platform}`);
    return;
  }
  const exePath = path.join(__dirname, 'BleScanner.exe');
  if (!fs.existsSync(exePath)) {
    try {
      const cscPath = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe';
      if (fs.existsSync(cscPath)) {
        const csPath = path.join(__dirname, 'ble_scanner.cs');
        const args = [
          '/noconfig', '/target:exe', `/out:${exePath}`,
          '/r:C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\mscorlib.dll',
          '/r:C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\System.dll',
          '/r:C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\System.Core.dll',
          '/r:C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\System.Runtime.dll',
          '/r:C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\System.Runtime.WindowsRuntime.dll',
          '/r:C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\System.Runtime.InteropServices.WindowsRuntime.dll',
          '/r:C:\\Windows\\System32\\WinMetadata\\Windows.Foundation.winmd',
          '/r:C:\\Windows\\System32\\WinMetadata\\Windows.Devices.winmd',
          '/r:C:\\Windows\\System32\\WinMetadata\\Windows.Storage.winmd',
          csPath
        ];
        execFileSync(cscPath, args, { stdio: 'ignore' });
      }
    } catch (e) {
      logError('[BLE SCANNER]', `Auto-compilation error: ${e.message}`);
    }
  }

  if (!fs.existsSync(exePath)) {
    logWarn('[BLE SCANNER]', 'BleScanner.exe not found. Live BLE sniffing unavailable.');
    return;
  }

  try {
    bleScannerProc = spawn(exePath, [], { stdio: ['pipe', 'pipe', 'ignore'] });
    bleScannerActive = true;

    const rl = readline.createInterface({ input: bleScannerProc.stdout });
    rl.on('line', (line) => {
      if (!line || !line.startsWith('ADV|')) return;
      totalBlePackets++;
      const parts = line.split('|');
      if (parts.length >= 5) {
        const mac = parts[1];
        const rssi = parseInt(parts[2], 10) || -70;
        const typeHex = parts[3];
        const payloadHex = parts[4];

        // Decode ASTM Remote ID frame
        const msgs = parseRemoteIdPayload(payloadHex, typeHex);
        if (msgs && msgs.length > 0) {
          const drone = airspaceTracker.processAdvertisement({ mac, rssi, rawPayload: payloadHex });
          if (drone && drone.uasId && drone.uasId !== 'Awaiting ID...') {
            const now = Date.now();
            if (!drone._lastLogged || now - drone._lastLogged > 3500) {
              drone._lastLogged = now;
              const totalSec = Math.max(0, Math.floor((now - drone.firstSeen) / 1000));
              const mins = Math.floor(totalSec / 60);
              const secs = totalSec % 60;
              const uptimeStr = mins > 0 ? `${mins}m ${secs.toString().padStart(2, '0')}s` : `${secs}s`;

              const posText = drone.latitude !== null ? `Pos: (${drone.latitude}, ${drone.longitude})` : 'Pos: Acquiring GPS...';
              let altText = 'Alt: N/A';
              if (drone.altitudeGeodetic !== null) {
                const feetMsl = Math.round(drone.altitudeGeodetic * 3.28084);
                const aglPart = drone.heightAgl !== null ? ` [${drone.heightAgl}m AGL]` : '';
                altText = `Alt: ${drone.altitudeGeodetic}m MSL (${feetMsl}ft)${aglPart}`;
              }
              logSuccess('[BLE RID LIVE]', `🛰️ Detected ${drone.model} [${drone.uasId}] • ${posText} • ${altText} • On: ${uptimeStr} (${drone.packetCount} pkts) • RSSI: ${drone.rssi} dBm`);
            }
          }
        }
      }
    });

    bleScannerProc.on('error', (err) => {
      bleScannerActive = false;
      logError('[BLE SCANNER]', `Process error: ${err.message}`);
    });

    bleScannerProc.on('exit', () => {
      bleScannerActive = false;
    });
  } catch (err) {
    logError('[BLE SCANNER]', `Failed to start BLE scanner: ${err.message}`);
  }
}

function startWifiScanner() {
  if (!IS_WINDOWS) {
    logDetail('Wi-Fi Scanner', `Native Wi-Fi packet capture is Windows-only; skipped on ${process.platform}`);
    return;
  }
  const exePath = path.join(__dirname, 'WifiScanner.exe');
  if (!fs.existsSync(exePath)) {
    try {
      const cscPath = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe';
      if (fs.existsSync(cscPath)) {
        const csPath = path.join(__dirname, 'wifi_scanner.cs');
        const args = [
          '/noconfig', '/target:exe', `/out:${exePath}`,
          '/r:C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\mscorlib.dll',
          '/r:C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\System.dll',
          '/r:C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\System.Core.dll',
          csPath
        ];
        execFileSync(cscPath, args, { stdio: 'ignore' });
      }
    } catch (e) {
      logError('[WIFI SCANNER]', `Auto-compilation error: ${e.message}`);
    }
  }

  if (!fs.existsSync(exePath)) {
    logWarn('[WIFI SCANNER]', 'WifiScanner.exe not found. Live 2.4/5.8GHz Wi-Fi sniffing unavailable.');
    return;
  }

  try {
    wifiScannerProc = spawn(exePath, [], { stdio: ['pipe', 'pipe', 'ignore'] });
    wifiScannerActive = true;

    const rl = readline.createInterface({ input: wifiScannerProc.stdout });
    rl.on('line', (line) => {
      if (!line || !line.startsWith('WIFI|')) return;
      totalWifiPackets++;
      const parts = line.split('|');
      if (parts.length >= 6) {
        const mac = parts[1];
        const rssi = parseInt(parts[2], 10) || -60;
        const freq = parseInt(parts[3], 10) || 2400;
        const quality = parseInt(parts[4], 10) || 80;
        const ssid = parts[5];
        const ieHex = parts[6] || '';

        const drone = airspaceTracker.processWifiBeacon({ mac, ssid, freq, rssi, quality, ieHex });
        if (drone && drone.uasId) {
          const now = Date.now();
          if (!drone._lastLogged || now - drone._lastLogged > 3500) {
            drone._lastLogged = now;
            const totalSec = Math.max(0, Math.floor((now - drone.firstSeen) / 1000));
            const mins = Math.floor(totalSec / 60);
            const secs = totalSec % 60;
            const uptimeStr = mins > 0 ? `${mins}m ${secs.toString().padStart(2, '0')}s` : `${secs}s`;

            const freqStr = freq >= 5000 ? `5.8 GHz (${freq} MHz)` : `2.4 GHz (${freq} MHz)`;
            logSuccess('[WIFI RF LIVE]', `🛰️ Detected ${drone.model} [${drone.uasId}] • ${freqStr} • RSSI: ${drone.rssi} dBm (Quality: ${drone.signalQuality || 80}%) • Active: ${uptimeStr}`);
          }
        }
      }
    });

    wifiScannerProc.on('error', (err) => {
      wifiScannerActive = false;
      logError('[WIFI SCANNER]', `Process error: ${err.message}`);
    });

    wifiScannerProc.on('exit', () => {
      wifiScannerActive = false;
    });
  } catch (err) {
    logError('[WIFI SCANNER]', `Failed to start Wi-Fi scanner: ${err.message}`);
  }
}

// Clean up child scanner processes
function stopScanners() {
  if (bleScannerProc) {
    try {
      bleScannerProc.stdin.write('quit\n');
      bleScannerProc.kill();
    } catch (e) {}
    bleScannerProc = null;
    bleScannerActive = false;
  }
  if (wifiScannerProc) {
    try {
      wifiScannerProc.stdin.write('quit\n');
      wifiScannerProc.kill();
    } catch (e) {}
    wifiScannerProc = null;
    wifiScannerActive = false;
  }
}

process.on('exit', () => stopScanners());
process.on('SIGINT', () => {
  stopScanners();
  process.exit(0);
});
process.on('SIGTERM', () => {
  stopScanners();
  process.exit(0);
});

// Ensure directories exist
if (!fs.existsSync(STAGING_DIR)) fs.mkdirSync(STAGING_DIR, { recursive: true });
if (!fs.existsSync(LATEST_DIR)) fs.mkdirSync(LATEST_DIR, { recursive: true });

// ANSI Styling Tokens
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  red: '\x1b[31m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  bgCyan: '\x1b[46m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgRed: '\x1b[41m',
  black: '\x1b[30m'
};

function getTimestamp() {
  const d = new Date();
  return d.toTimeString().slice(0, 8);
}

function logInfo(tag, msg) {
  console.log(`${colors.gray}[${getTimestamp()}]${colors.reset} ${colors.cyan}${colors.bold}${tag}${colors.reset} ${msg}`);
}

function logSuccess(tag, msg) {
  console.log(`${colors.gray}[${getTimestamp()}]${colors.reset} ${colors.green}${colors.bold}${tag}${colors.reset} ${msg}`);
}

function logWarn(tag, msg) {
  console.log(`${colors.gray}[${getTimestamp()}]${colors.reset} ${colors.yellow}${colors.bold}${tag}${colors.reset} ${msg}`);
}

function logError(tag, msg) {
  console.log(`${colors.gray}[${getTimestamp()}]${colors.reset} ${colors.red}${colors.bold}${tag}${colors.reset} ${msg}`);
}

function logDetail(label, val) {
  console.log(`  ${colors.gray}├─${colors.reset} ${colors.white}${label}:${colors.reset} ${colors.dim}${val}${colors.reset}`);
}

function logDetailLast(label, val) {
  console.log(`  ${colors.gray}└─${colors.reset} ${colors.white}${label}:${colors.reset} ${colors.dim}${val}${colors.reset}`);
}

// Common CORS Headers
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With, Access-Control-Request-Private-Network');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
}

// Execute PowerShell COM helper for MTP operations
function runMtpScript(scriptContent) {
  if (!IS_WINDOWS) {
    return Promise.resolve({
      success: false,
      error: `PowerShell COM bridge is only available on Windows (${process.platform} detected).`
    });
  }
  return new Promise((resolve) => {
    const encodedCommand = Buffer.from(scriptContent, 'utf16le').toString('base64');
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodedCommand],
      { maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          resolve({ success: false, error: stderr || error.message });
        } else {
          try {
            const data = JSON.parse(stdout.trim());
            resolve({ success: true, data });
          } catch (e) {
            resolve({ success: true, raw: stdout.trim() });
          }
        }
      }
    );
  });
}

// Android/Linux ADB Command Helper
function runAdbCommand(args) {
  return new Promise((resolve) => {
    execFile('adb', args, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        resolve({ success: false, error: stderr ? stderr.trim() : error.message });
      } else {
        resolve({ success: true, stdout: stdout ? stdout.trim() : '' });
      }
    });
  });
}

async function checkRc2AdbStatus() {
  const devRes = await runAdbCommand(['devices']);
  if (!devRes.success || !devRes.stdout) {
    return { connected: false, error: devRes.error || 'ADB not available' };
  }

  const lines = devRes.stdout.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('List of devices'));
  const activeDevice = lines.find(l => l.endsWith('device'));
  if (!activeDevice) {
    return { connected: false, error: 'No authorized ADB device found' };
  }

  const serial = activeDevice.split(/\s+/)[0];
  const wpPath = '/sdcard/Android/data/dji.go.v5/files/waypoint';
  const lsRes = await runAdbCommand(['-s', serial, 'shell', `ls -1 ${wpPath}`]);

  let activeMissions = [];
  if (lsRes.success && lsRes.stdout) {
    activeMissions = lsRes.stdout
      .split('\n')
      .map(m => m.trim())
      .filter(m => /^[A-F0-9]{8}-/i.test(m));
  }

  return {
    connected: true,
    deviceName: `DJI RC 2 (ADB: ${serial})`,
    activeMissions,
    waypointReady: lsRes.success
  };
}

// 1. Check DJI RC 2 Connection Status
async function checkRc2Status() {
  if (!IS_WINDOWS) {
    const adbStatus = await checkRc2AdbStatus();
    if (adbStatus.connected) {
      return adbStatus;
    }
    return {
      connected: false,
      platform: process.platform,
      error: 'DJI RC 2 not detected. On Android/Linux, connect via USB-C with USB Debugging enabled (ADB) or use Samsung My Files manual copy.'
    };
  }

  const psScript = `
$shell = New-Object -ComObject Shell.Application
$thisPC = $shell.Namespace(17)
$dji = $thisPC.Items() | Where-Object { $_.Name -like "*DJI RC 2*" -or $_.Name -like "*DJI RC*" -or $_.Name -like "*RC2*" } | Select-Object -First 1

if (-not $dji) {
    @{ connected = $false } | ConvertTo-Json -Compress
    exit
}

function Get-SubItem($folderItem, $name) {
    if (-not $folderItem) { return $null }
    $folder = if ($folderItem.GetFolder) { $folderItem.GetFolder } else { $folderItem }
    return $folder.Items() | Where-Object { $_.Name -eq $name } | Select-Object -First 1
}

$storage = Get-SubItem $dji "Internal shared storage"
if (-not $storage) { $storage = Get-SubItem $dji "Internal storage" }

$wpPath = $null
$activeMissions = @()

if ($storage) {
    $android = Get-SubItem $storage "Android"
    $data    = Get-SubItem $android "data"
    $djiApp  = Get-SubItem $data "dji.go.v5"
    $files   = Get-SubItem $djiApp "files"
    $wp      = Get-SubItem $files "waypoint"
    if ($wp) {
        $wpPath = $wp.Path
        $activeMissions = @($wp.GetFolder.Items() | Where-Object { $_.IsFolder -and $_.Name -match "^[A-F0-9]{8}-" } | ForEach-Object { $_.Name })
    }
}

@{
    connected = $true
    deviceName = $dji.Name
    activeMissions = $activeMissions
    waypointReady = ($wpPath -ne $null)
} | ConvertTo-Json -Compress
`;

  const result = await runMtpScript(psScript);
  if (result.success && result.data) {
    return result.data;
  }
  return { connected: false, error: result.error };
}

// Background status caching & State Transition Watcher
let cachedRc2Status = { connected: false, checking: true, lastCheck: 0 };
let isCheckingStatus = false;
let lastConnectionState = null;
let lastMissionCount = -1;

async function updateRc2Status() {
  if (isCheckingStatus) return cachedRc2Status;
  isCheckingStatus = true;
  try {
    const status = await checkRc2Status();
    cachedRc2Status = { ...status, lastCheck: Date.now() };

    // Detect state changes
    const curConnected = !!status.connected;
    const curMissions = status.activeMissions ? status.activeMissions.length : 0;

    if (curConnected !== lastConnectionState || (curConnected && curMissions !== lastMissionCount)) {
      lastConnectionState = curConnected;
      lastMissionCount = curMissions;

      if (curConnected) {
        logSuccess('[RC 2 CONNECTED]', `Detected "${status.deviceName || 'DJI RC 2'}" over USB MTP`);
        logDetail('Storage Status', status.waypointReady ? 'Ready (/Android/data/dji.go.v5/files/waypoint)' : 'Waypoint folder pending');
        logDetailLast('Missions on RC 2', `${curMissions} mission(s) installed on controller`);
      } else {
        logWarn('[RC 2 OFFLINE]', 'DJI RC 2 controller disconnected or not detected. (Connect USB-C and select "File Transfer")');
      }
    }
  } catch (err) {
    cachedRc2Status = { connected: false, error: err.message, lastCheck: Date.now() };
    if (lastConnectionState !== false) {
      lastConnectionState = false;
      logError('[RC 2 ERROR]', err.message);
    }
  } finally {
    isCheckingStatus = false;
  }
  return cachedRc2Status;
}

// 2. Transfer KMZ to RC 2 (Preview thumbnail archived)
async function transferToRc2(uuid, kmzPath) {
  if (!IS_WINDOWS) {
    const adbCheck = await checkRc2AdbStatus();
    if (!adbCheck.connected) {
      return { success: false, error: 'DJI RC 2 not connected via ADB on ' + process.platform };
    }
    const targetUUID = uuid;
    const remoteDir = `/sdcard/Android/data/dji.go.v5/files/waypoint/${targetUUID}`;
    await runAdbCommand(['shell', `mkdir -p ${remoteDir}`]);
    const pushRes = await runAdbCommand(['push', kmzPath, `${remoteDir}/${targetUUID}.kmz`]);
    if (pushRes.success) {
      return {
        success: true,
        uuid: targetUUID,
        verified: true,
        message: `Mission KMZ successfully synced to DJI RC 2 slot ${targetUUID} via ADB!`
      };
    }
    return { success: false, error: pushRes.error || 'Failed to push KMZ via ADB' };
  }

  const psScript = `
$shell = New-Object -ComObject Shell.Application
$thisPC = $shell.Namespace(17)
$dji = $thisPC.Items() | Where-Object { $_.Name -like "*DJI RC 2*" -or $_.Name -like "*DJI RC*" -or $_.Name -like "*RC2*" } | Select-Object -First 1

if (-not $dji) {
    @{ success = $false; error = "DJI RC 2 not connected" } | ConvertTo-Json -Compress
    exit
}

function Get-SubItem($folderItem, $name) {
    if (-not $folderItem) { return $null }
    $folder = if ($folderItem.GetFolder) { $folderItem.GetFolder } else { $folderItem }
    return $folder.Items() | Where-Object { $_.Name -eq $name } | Select-Object -First 1
}

$storage = Get-SubItem $dji "Internal shared storage"
if (-not $storage) { $storage = Get-SubItem $dji "Internal storage" }

$android = Get-SubItem $storage "Android"
$data    = Get-SubItem $android "data"
$djiApp  = Get-SubItem $data "dji.go.v5"
$files   = Get-SubItem $djiApp "files"
$wp      = Get-SubItem $files "waypoint"

if (-not $wp) {
    @{ success = $false; error = "Waypoint directory not found on RC 2" } | ConvertTo-Json -Compress
    exit
}

# 1. Resolve target mission folder & UUID
$targetMissionFolder = Get-SubItem $wp "${uuid}"
$targetUUID = "${uuid}"

if (-not $targetMissionFolder) {
    # Auto-fallback to first available UUID slot on the controller if specified UUID not found
    $availSlots = @($wp.GetFolder.Items() | Where-Object { $_.IsFolder -and $_.Name -match "^[A-F0-9]{8}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{12}$" })
    if ($availSlots.Count -gt 0) {
        $targetMissionFolder = $availSlots[0]
        $targetUUID = $targetMissionFolder.Name
    } else {
        @{ success = $false; error = "No mission placeholder folder found on RC 2. Please create a dummy mission on your RC 2 first." } | ConvertTo-Json -Compress
        exit
    }
}

$destMissionFolder = $targetMissionFolder.GetFolder
$targetKmzName = "$($targetUUID).kmz"

# Safe MTP copy for KMZ:
# Windows MTP silently blocks CopyHere if an identical file name exists.
# Rename existing items first so the fresh write is guaranteed to succeed.
$existingKmz = @($destMissionFolder.Items() | Where-Object { $_.Name -eq $targetKmzName -or ($_.Name -like "*.kmz" -and $_.Name -notlike "_old_*") })
foreach ($oldKmz in $existingKmz) {
    try { $oldKmz.Name = "_old_$((Get-Date).Ticks)_$($oldKmz.Name)" } catch {}
}
Start-Sleep -Milliseconds 250

$kmzFile = "${kmzPath}"
if (Test-Path $kmzFile) {
    $destMissionFolder.CopyHere($kmzFile, 16)
    
    # Wait for file to arrive on MTP device
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    while ($sw.Elapsed.TotalSeconds -lt 10) {
        Start-Sleep -Milliseconds 300
        $check = @($destMissionFolder.Items() | Where-Object { $_.Name -eq $targetKmzName })
        if ($check.Count -gt 0) { break }
    }
}

# Clean up any leftover _old_ files in mission folder via MoveHere to local temp
$trashDir = "${STAGING_DIR.replace(/\\/g, '\\\\')}\\trash"
if (-not (Test-Path $trashDir)) { New-Item -ItemType Directory -Path $trashDir -Force | Out-Null }
$trashFolder = $shell.Namespace($trashDir)

$leftoverOld = @($destMissionFolder.Items() | Where-Object { $_.Name -like "_old_*" })
foreach ($oldItem in $leftoverOld) {
    try { $trashFolder.MoveHere($oldItem, 16) } catch {}
}

# Clean local trash folder
Get-ChildItem -Path $trashDir -File -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue

# Verify final KMZ presence
$finalCheck = @($destMissionFolder.Items() | Where-Object { $_.Name -eq $targetKmzName })
$syncVerified = ($finalCheck.Count -gt 0)

@{
    success = $syncVerified
    uuid = $targetUUID
    verified = $syncVerified
    message = if ($syncVerified) { "Mission KMZ successfully synced to DJI RC 2 slot $targetUUID!" } else { "Failed to write KMZ file to RC 2" }
} | ConvertTo-Json -Compress
`;

  return await runMtpScript(psScript);
}

// 3. Pull Current KMZ Mission from RC 2 over MTP
async function pullFromRc2(requestedUuid = '') {
  if (!IS_WINDOWS) {
    const adbCheck = await checkRc2AdbStatus();
    if (!adbCheck.connected) {
      return { success: false, error: 'DJI RC 2 not connected via ADB on ' + process.platform };
    }
    let targetUuid = requestedUuid;
    if (!targetUuid && adbCheck.activeMissions && adbCheck.activeMissions.length > 0) {
      targetUuid = adbCheck.activeMissions[0];
    }
    if (!targetUuid) {
      return { success: false, error: 'No mission slot found on RC 2.' };
    }
    if (!fs.existsSync(STAGING_DIR)) {
      fs.mkdirSync(STAGING_DIR, { recursive: true });
    }
    const targetLocalPath = path.join(STAGING_DIR, `pulled_${targetUuid}.kmz`);
    const remoteKmz = `/sdcard/Android/data/dji.go.v5/files/waypoint/${targetUuid}/${targetUuid}.kmz`;
    const pullRes = await runAdbCommand(['pull', remoteKmz, targetLocalPath]);
    if (!pullRes.success || !fs.existsSync(targetLocalPath)) {
      return { success: false, error: pullRes.error || 'Failed to pull KMZ from RC 2 via ADB' };
    }
    return {
      success: true,
      uuid: targetUuid,
      fileName: `${targetUuid}.kmz`,
      waylinesWpml: ''
    };
  }

  const psScript = `
$shell = New-Object -ComObject Shell.Application
$thisPC = $shell.Namespace(17)
$dji = $thisPC.Items() | Where-Object { $_.Name -like "*DJI RC 2*" -or $_.Name -like "*DJI RC*" -or $_.Name -like "*RC2*" } | Select-Object -First 1

if (-not $dji) {
    @{ success = $false; error = "DJI RC 2 not connected" } | ConvertTo-Json -Compress
    exit
}

function Get-SubItem($folderItem, $name) {
    if (-not $folderItem) { return $null }
    $folder = if ($folderItem.GetFolder) { $folderItem.GetFolder } else { $folderItem }
    return $folder.Items() | Where-Object { $_.Name -eq $name } | Select-Object -First 1
}

$storage = Get-SubItem $dji "Internal shared storage"
if (-not $storage) { $storage = Get-SubItem $dji "Internal storage" }
$android = Get-SubItem $storage "Android"
$data    = Get-SubItem $android "data"
$djiApp  = Get-SubItem $data "dji.go.v5"
$files   = Get-SubItem $djiApp "files"
$wp      = Get-SubItem $files "waypoint"

if (-not $wp) {
    @{ success = $false; error = "Waypoint directory not found on RC 2" } | ConvertTo-Json -Compress
    exit
}

$targetUUID = "${requestedUuid}"
$targetFolder = $null

if ($targetUUID) {
    $targetFolder = Get-SubItem $wp $targetUUID
} else {
    $avail = @($wp.GetFolder.Items() | Where-Object { $_.IsFolder -and $_.Name -match '^[A-F0-9]{8}-' })
    if ($avail.Count -gt 0) {
        $targetFolder = $avail[0]
        $targetUUID = $targetFolder.Name
    }
}

if (-not $targetFolder) {
    @{ success = $false; error = "No mission slot found on RC 2." } | ConvertTo-Json -Compress
    exit
}

$kmzItem = @($targetFolder.GetFolder.Items() | Where-Object { $_.Name -like "*.kmz" -and $_.Name -notlike "_old_*" }) | Select-Object -First 1
if (-not $kmzItem) {
    @{ success = $false; error = "No active KMZ file found in slot $targetUUID on RC 2." } | ConvertTo-Json -Compress
    exit
}

$stagingDir = "${STAGING_DIR.replace(/\\/g, '\\')}"
$pullTempDir = "$stagingDir\\pull"
if (-not (Test-Path $pullTempDir)) { New-Item -ItemType Directory -Path $pullTempDir -Force | Out-Null }
Get-ChildItem -Path $pullTempDir -Recurse -ErrorAction SilentlyContinue | Remove-Item -Force -Recurse -ErrorAction SilentlyContinue

$cleanPath = $pullTempDir -replace '\\\\+', '\'
$dest = $shell.Namespace($cleanPath)
if (-not $dest) { $dest = $shell.Namespace($pullTempDir) }
$dest.CopyHere($kmzItem, 16)

$sw = [System.Diagnostics.Stopwatch]::StartNew()
$arrived = $null
while ($sw.Elapsed.TotalSeconds -lt 10) {
    Start-Sleep -Milliseconds 300
    $foundKmz = @(Get-ChildItem -Path $pullTempDir -Filter "*.kmz")
    if ($foundKmz.Count -gt 0) {
        $arrived = $foundKmz[0].FullName
        break
    }
}

if ($arrived) {
    $targetLocalPath = "$stagingDir\\pulled_$targetUUID.kmz"
    Copy-Item -Path $arrived -Destination $targetLocalPath -Force

    $zipCopy = "$pullTempDir\\temp.zip"
    Copy-Item -Path $arrived -Destination $zipCopy -Force
    $unzipDir = "$pullTempDir\\unpacked"
    Expand-Archive -Path $zipCopy -DestinationPath $unzipDir -Force

    $tmplPath = "$unzipDir\\wpmz\\template.kml"
    $wpmlPath = "$unzipDir\\wpmz\\waylines.wpml"
    $tmplContent = if (Test-Path $tmplPath) { [string](Get-Content $tmplPath -Raw -Encoding UTF8) } else { "" }
    $wpmlContent = if (Test-Path $wpmlPath) { [string](Get-Content $wpmlPath -Raw -Encoding UTF8) } else { "" }

    Get-ChildItem -Path $pullTempDir -Recurse -ErrorAction SilentlyContinue | Remove-Item -Force -Recurse -ErrorAction SilentlyContinue

    @{
        success = $true
        uuid = $targetUUID
        fileName = (Split-Path $arrived -Leaf)
        localPath = $targetLocalPath
        size = (Get-Item $targetLocalPath).Length
        templateKml = $tmplContent
        waylinesWpml = $wpmlContent
    } | ConvertTo-Json -Compress
} else {
    Get-ChildItem -Path $pullTempDir -Recurse -ErrorAction SilentlyContinue | Remove-Item -Force -Recurse -ErrorAction SilentlyContinue
    @{ success = $false; error = "Timeout waiting for KMZ copy from RC 2." } | ConvertTo-Json -Compress
}
`;
  return await runMtpScript(psScript);
}

// 4. Extract Latest Flight Information
async function extractLatestFlight() {
  const psScript = `
$shell = New-Object -ComObject Shell.Application
$thisPC = $shell.Namespace(17)
$dji = $thisPC.Items() | Where-Object { $_.Name -like "*DJI RC 2*" -or $_.Name -like "*DJI RC*" -or $_.Name -like "*RC2*" } | Select-Object -First 1

function Get-SubItem($folderItem, $name) {
    if (-not $folderItem) { return $null }
    $folder = if ($folderItem.GetFolder) { $folderItem.GetFolder } else { $folderItem }
    return $folder.Items() | Where-Object { $_.Name -eq $name } | Select-Object -First 1
}

$outDir = "${LATEST_DIR.replace(/\\/g, '\\\\')}"
$latestLogName = $null
$latestKmzName = $null

if ($dji) {
    $storage = Get-SubItem $dji "Internal shared storage"
    if (-not $storage) { $storage = Get-SubItem $dji "Internal storage" }
    if ($storage) {
        $android = Get-SubItem $storage "Android"
        $data    = Get-SubItem $android "data"
        $djiApp  = Get-SubItem $data "dji.go.v5"
        $files   = Get-SubItem $djiApp "files"

        if ($files) {
            # Flight logs
            $fl = Get-SubItem $files "FlightRecord"
            if ($fl) {
                $logs = @($fl.GetFolder.Items() | Where-Object { $_.Name -like "FlightRecord_*.txt" } | Sort-Object Name -Descending)
                if ($logs.Count -gt 0) {
                    $latestLog = $logs[0]
                    $latestLogName = $latestLog.Name
                    $shell.Namespace($outDir).CopyHere($latestLog, 16)
                }
            }

            # Waypoints
            $wp = Get-SubItem $files "waypoint"
            if ($wp) {
                $missions = @($wp.GetFolder.Items() | Where-Object { $_.IsFolder -and $_.Name -match "^[A-F0-9]{8}-" })
                foreach ($m in $missions) {
                    $kmz = @($m.GetFolder.Items() | Where-Object { $_.Name -like "*.kmz" -and $_.Name -notlike "_old_*" }) | Select-Object -First 1
                    if ($kmz) {
                        $latestKmzName = $kmz.Name
                        $shell.Namespace($outDir).CopyHere($kmz, 16)
                    }
                }
            }
        }
    }
}

@{
    success = $true
    latestLog = $latestLogName
    latestKmz = $latestKmzName
    outputDir = $outDir
} | ConvertTo-Json -Compress
`;

  return await runMtpScript(psScript);
}

// Format Startup Banner with System & Port Diagnostics
function printStartupBanner() {
  console.log(`${colors.cyan}${colors.bold}`);
  console.log('  ╔══════════════════════════════════════════════════════════════════╗');
  console.log('  ║                🛰️  AALAAPI SKY COMPANION BRIDGE                  ║');
  console.log('  ║            Direct USB MTP Sync for DJI RC 2 / RC Plus            ║');
  console.log('  ╚══════════════════════════════════════════════════════════════════╝');
  console.log(`${colors.reset}`);

  console.log(`${colors.bold}📌 System & Environment:${colors.reset}`);
  logDetail('Bridge Version', `v${VERSION} (Node.js ${process.version})`);
  logDetail('Operating Host', `${os.type()} ${os.release()} (${os.arch()})`);
  logDetail('Web Interface', `http://127.0.0.1:${PORT}`);
  logDetail('Local Endpoint', `http://127.0.0.1:${PORT}/api/status`);
  logDetail('Staging Path', STAGING_DIR);
  logDetail('Flight Logs', LATEST_DIR);

  // Scan local Downloads folder for KMZ and flight logs
  const downloadsDir = path.join(os.homedir(), 'Downloads');
  let dlKmzCount = 0;
  let dlLogCount = 0;
  try {
    if (fs.existsSync(downloadsDir)) {
      const files = fs.readdirSync(downloadsDir);
      dlKmzCount = files.filter(f => f.toLowerCase().endsWith('.kmz')).length;
      dlLogCount = files.filter(f => f.startsWith('FlightRecord_') && f.endsWith('.txt')).length;
    }
  } catch (e) {}
  logDetailLast('Downloads Scan', `${dlKmzCount} KMZ file(s), ${dlLogCount} FlightRecord file(s) found`);

  console.log(`\n${colors.bold}🌐 Active Web & REST API Endpoints:${colors.reset}`);
  console.log(`  ${colors.green}${colors.bold}GET  /${colors.reset}                  ${colors.gray}Aalaapi Sky full web application interface${colors.reset}`);
  console.log(`  ${colors.green}${colors.bold}GET  /api/status${colors.reset}           ${colors.gray}Real-time DJI RC 2 connection status & mission inventory${colors.reset}`);
  console.log(`  ${colors.green}${colors.bold}POST /api/sync${colors.reset}             ${colors.gray}Direct 1-click in-memory KMZ & preview sync to RC 2${colors.reset}`);
  console.log(`  ${colors.green}${colors.bold}GET  /api/flights${colors.reset}          ${colors.gray}List extracted telemetry flight records & metadata${colors.reset}`);
  console.log(`  ${colors.green}${colors.bold}POST /api/flight-telemetry${colors.reset} ${colors.gray}3D flight trajectory solver, photo markers & variances${colors.reset}`);
  console.log(`  ${colors.green}${colors.bold}GET  /api/latest-flight${colors.reset}    ${colors.gray}Auto-extract latest flight log & KMZ over USB MTP${colors.reset}`);
  console.log(`  ${colors.green}${colors.bold}GET  /api/remote-id/drones${colors.reset} ${colors.gray}Live ASTM F3411 Remote ID detected drones in airspace${colors.reset}`);
  console.log(`  ${colors.green}${colors.bold}POST /api/drone/locate${colors.reset}    ${colors.gray}Rest API locate drone & inject live geo coordinates${colors.reset}`);
  console.log(`  ${colors.green}${colors.bold}POST /api/shutdown${colors.reset}         ${colors.gray}Cleanly terminate running companion bridge process${colors.reset}`);
  console.log(`  ${colors.green}${colors.bold}GET  /health${colors.reset}               ${colors.gray}Service heartbeat and status ping${colors.reset}`);

  if (process.stdin.isTTY) {
    console.log(`\n${colors.bold}⌨️  Interactive CLI Commands:${colors.reset}`);
    console.log(`  ${colors.yellow}[s]${colors.reset} Probe RC 2 status   ${colors.yellow}[r]${colors.reset} Probe Remote ID radar   ${colors.yellow}[f]${colors.reset} List flight logs   ${colors.yellow}[c]${colors.reset} Clear   ${colors.yellow}[q]${colors.reset} Exit\n`);
  }

  console.log(`${colors.gray}────────────────────────────────────────────────────────────────────────${colors.reset}`);
  logInfo('[READY]', `Companion server active on http://127.0.0.1:${PORT}`);
}

// Create HTTP Server
const server = http.createServer(async (req, res) => {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  try {
    // 1. Controller Status Endpoint
    if (pathname === '/api/status' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(cachedRc2Status));
      return;
    }

    // 2. Direct Sync Mission & Thumbnail to RC 2
    if (pathname === '/api/sync' && req.method === 'POST') {
      const startTime = Date.now();
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const payload = JSON.parse(body);
          const uuid = payload.uuid || '354A8F93-759C-42C3-A8D5-746F79C7622A';

          logInfo('[SYNC REQUEST]', `Received mission sync package for UUID ${uuid}`);

          let kmzPath = '';

          if (payload.kmzBase64) {
            kmzPath = path.join(STAGING_DIR, `${uuid}.kmz`);
            const kmzBuffer = Buffer.from(payload.kmzBase64, 'base64');
            fs.writeFileSync(kmzPath, kmzBuffer);
            logDetail('KMZ Package', `${(kmzBuffer.length / 1024).toFixed(1)} KB -> ${kmzPath}`);
          }

          const transferResult = await transferToRc2(uuid, kmzPath);
          const duration = Date.now() - startTime;

          const resData = transferResult.data || {};
          const isSuccess = Boolean(transferResult.success && resData.success);
          const targetSlot = resData.uuid || uuid;

          if (isSuccess) {
            logSuccess('[SYNC SUCCESS]', `Mission ${targetSlot} transferred to DJI RC 2 in ${duration}ms!`);
            logDetailLast('Result', resData.message || 'Complete');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, uuid: targetSlot, message: resData.message }));
          } else {
            const errMsg = resData.error || resData.message || transferResult.error || 'Failed to copy to RC 2';
            logError('[SYNC FAILED]', `Transfer error: ${errMsg}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: errMsg }));
          }
        } catch (err) {
          logError('[SYNC ERROR]', err.message);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }

    // 3. Flight Logs List
    if (pathname === '/api/flights' && req.method === 'GET') {
      try {
        let files = [];
        if (fs.existsSync(LATEST_DIR)) {
          files = fs.readdirSync(LATEST_DIR)
            .filter(f => f.startsWith('FlightRecord_') && f.endsWith('.txt'))
            .sort().reverse();
        }
        const flightList = files.map((f, idx) => {
          const stats = fs.statSync(path.join(LATEST_DIR, f));
          const match = f.match(/FlightRecord_(\d{4}-\d{2}-\d{2})_\[(\d{2}-\d{2}-\d{2})\]/);
          const dateStr = match ? `${match[1]} ${match[2].replace(/-/g, ':')}` : 'Flight';
          return {
            filename: f,
            label: `Flight ${files.length - idx} — ${dateStr} (${Math.round(stats.size / 1024)} KB)`,
            date: dateStr,
            size: stats.size
          };
        });
        logInfo('[FLIGHTS API]', `Served ${flightList.length} flight record(s) to client`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, flights: flightList }));
      } catch (err) {
        logError('[FLIGHTS ERROR]', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    // 3.5 Pull KMZ Mission directly from RC 2 over USB MTP
    if ((pathname === '/api/pull-mission' || pathname === '/api/rc2/kmz') && req.method === 'GET') {
      const requestedUuid = url.searchParams.get('uuid') || '';
      const isDownload = url.searchParams.get('download') === '1';

      logInfo('[PULL API]', `Pulling active mission KMZ from DJI RC 2${requestedUuid ? ` (slot ${requestedUuid})` : ''}...`);
      const pullResult = await pullFromRc2(requestedUuid);

      const resData = pullResult.data || {};
      if (pullResult.success && resData.success) {
        logSuccess('[PULL SUCCESS]', `Pulled mission ${resData.uuid} (${(resData.size / 1024).toFixed(1)} KB)`);

        if (isDownload && resData.localPath && fs.existsSync(resData.localPath)) {
          const fileBuf = fs.readFileSync(resData.localPath);
          res.writeHead(200, {
            'Content-Type': 'application/vnd.google-earth.kmz',
            'Content-Disposition': `attachment; filename="${resData.uuid || 'mission'}.kmz"`,
            'Content-Length': fileBuf.length
          });
          res.end(fileBuf);
          return;
        }

        let kmzBase64 = '';
        if (resData.localPath && fs.existsSync(resData.localPath)) {
          kmzBase64 = fs.readFileSync(resData.localPath).toString('base64');
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          uuid: resData.uuid,
          fileName: resData.fileName,
          size: resData.size,
          kmzBase64,
          templateKml: resData.templateKml,
          waylinesWpml: resData.waylinesWpml,
          message: `Mission ${resData.uuid} successfully pulled from RC 2`
        }));
      } else {
        const errMsg = resData.error || pullResult.error || 'Failed to pull KMZ from RC 2';
        logError('[PULL FAILED]', errMsg);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: errMsg }));
      }
      return;
    }

    // 4. Extract Latest Flight over USB MTP
    if (pathname === '/api/latest-flight' && req.method === 'GET') {
      logInfo('[EXTRACT API]', 'Extracting latest flight log & KMZ from DJI RC 2...');
      const flightData = await extractLatestFlight();
      if (flightData.data?.latestLog || flightData.data?.latestKmz) {
        logSuccess('[EXTRACT SUCCESS]', `Log: ${flightData.data?.latestLog || 'None'}, KMZ: ${flightData.data?.latestKmz || 'None'}`);
      } else {
        logWarn('[EXTRACT INFO]', 'No new flight logs found on connected device');
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(flightData));
      return;
    }

    // 5. Flight Telemetry & 3D Replay Solver
    if (pathname === '/api/flight-telemetry' && (req.method === 'GET' || req.method === 'POST')) {
      const { generateTelemetryFromWaypoints, computeFlightComparison } = require('./log_decoder.js');
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const payload = body ? JSON.parse(body) : {};
          const waypoints = payload.waypoints || [];
          const flightId = payload.flightId || url.searchParams.get('file') || '';
          const options = Object.assign({}, payload.options || {}, { flightId });
          const telemetry = generateTelemetryFromWaypoints(waypoints, options);
          const comparison = computeFlightComparison(payload.planned || { waypointCount: waypoints.length, altitude: options.altitude }, telemetry);
          logInfo('[TELEMETRY API]', `Solved flight track for "${flightId || 'Active Mission'}" (${telemetry.points.length} pts, ${telemetry.durationFormatted}, ${telemetry.photoCount} photos)`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, telemetry, comparison }));
        } catch (e) {
          logError('[TELEMETRY ERROR]', e.message);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      });
      return;
    }

    // 6. Remote ID Airspace Drones Endpoint & Drone Locate REST API
    if ((pathname === '/api/remote-id/drones' || pathname === '/api/drones') && req.method === 'GET') {
      const activeDrones = airspaceTracker.getActiveDrones();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        count: activeDrones.length,
        totalPackets: airspaceTracker.totalPackets,
        drones: activeDrones
      }));
      return;
    }

    // 6b. Drone Locate REST API (GET returns latest located drone with geo coordinates; POST updates/injects new geo location)
    if ((pathname === '/api/drone/locate' || pathname === '/api/remote-id/locate' || pathname === '/api/drone/position') && req.method === 'GET') {
      const activeDrones = airspaceTracker.getActiveDrones();
      const locatedWithGeo = activeDrones.find(d => d.latitude !== null && d.longitude !== null) || activeDrones[0] || null;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: !!locatedWithGeo,
        located: !!(locatedWithGeo && locatedWithGeo.latitude !== null),
        drone: locatedWithGeo,
        count: activeDrones.length,
        drones: activeDrones
      }));
      return;
    }

    if ((pathname === '/api/drone/locate' || pathname === '/api/remote-id/locate' || pathname === '/api/drone/position') && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const payload = body ? JSON.parse(body) : {};
          const lat = payload.latitude !== undefined ? parseFloat(payload.latitude) : (payload.lat !== undefined ? parseFloat(payload.lat) : 40.0130);
          const lon = payload.longitude !== undefined ? parseFloat(payload.longitude) : (payload.lon !== undefined ? parseFloat(payload.lon) : -83.1765);
          const alt = payload.altitude !== undefined ? parseFloat(payload.altitude) : (payload.alt !== undefined ? parseFloat(payload.alt) : 25.0);
          const speed = payload.speed !== undefined ? parseFloat(payload.speed) : 4.0;
          const heading = payload.heading !== undefined ? parseFloat(payload.heading) : 90;
          const uasId = payload.uasId || payload.serialNumber || '1581F4TEST998877';

          const syntheticBytes = createSyntheticOdidPayload({
            uasId,
            lat,
            lon,
            alt,
            speed,
            heading,
            opLat: payload.operatorLatitude || lat - 0.0002,
            opLon: payload.operatorLongitude || lon - 0.0001
          });

          const drone = airspaceTracker.processAdvertisement({
            mac: payload.mac || 'FA:0B:BC:15:81:F4',
            rssi: payload.rssi || -58,
            rawPayload: syntheticBytes
          });

          if (payload.model) drone.model = payload.model;
          if (payload.status) drone.status = payload.status;

          logSuccess('[DRONE REST LOCATE]', `Updated drone geo location for ${drone.uasId} (${drone.model}) at [${drone.latitude}, ${drone.longitude}], alt: ${drone.altitudeGeodetic}m`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            located: true,
            drone
          }));
        } catch (e) {
          logError('[DRONE REST LOCATE ERROR]', e.message);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      });
      return;
    }

    // 7. Remote ID Scanner Status
    if (pathname === '/api/remote-id/status' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        active: true,
        protocol: 'ASTM F3411-19 / F3411-22 (OpenDroneID) + Wi-Fi Beacon Detection',
        hardwareInterface: 'Dual-Mode Wi-Fi 6 (2.4/5.8 GHz) + Bluetooth 5.0 LE (WinRT / Intel AX201)',
        totalPackets: airspaceTracker.totalPackets,
        activeDrones: airspaceTracker.getActiveDrones().length
      }));
      return;
    }

    // 8. Remote ID Simulation Injector
    if (pathname === '/api/remote-id/simulate' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const payload = body ? JSON.parse(body) : {};
          const syntheticBytes = createSyntheticOdidPayload(payload);
          const drone = airspaceTracker.processAdvertisement({
            mac: payload.mac || 'FA:0B:BC:15:81:F4',
            rssi: payload.rssi || -62,
            rawPayload: syntheticBytes
          });
          logSuccess('[REMOTE ID SIM]', `Injected ASTM packet for ${drone.uasId} (${drone.model}) at [${drone.latitude}, ${drone.longitude}]`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, drone }));
        } catch (e) {
          logError('[REMOTE ID SIM ERROR]', e.message);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      });
      return;
    }

    // 9. Remote ID Raw Packet Ingestion
    if (pathname === '/api/remote-id/packet' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body);
          const drone = airspaceTracker.processAdvertisement({
            mac: payload.mac || 'UNKNOWN_BLE',
            rssi: payload.rssi || -70,
            rawPayload: payload.rawPayload || payload.data
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, drone }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      });
      return;
    }

    // 10. Heartbeat / Health Check
    if (pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'running', service: 'Aalaapi Sky Companion', version: VERSION, rc2: cachedRc2Status }));
      return;
    }

    // 11. Remote Shutdown / Kill Endpoint
    if ((pathname === '/api/shutdown' || pathname === '/api/kill' || pathname === '/api/stop') && (req.method === 'POST' || req.method === 'GET')) {
      logWarn('[SHUTDOWN]', 'Received remote shutdown request via REST API');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Aalaapi Sky Companion Bridge shutting down...' }));
      stopScanners();
      setTimeout(() => {
        try { server.close(); } catch (e) {}
        process.exit(0);
      }, 250);
      return;
    }

    // 11. Static File Serving (Aalaapi Sky Web App)
    if (req.method === 'GET' || req.method === 'HEAD') {
      const PROJECT_ROOT = path.resolve(__dirname, '../..');
      const targetRel = (pathname === '/' || pathname === '/app') ? '/index.html' : pathname;
      const safePath = path.normalize(path.join(PROJECT_ROOT, targetRel));

      if (safePath.startsWith(PROJECT_ROOT) && fs.existsSync(safePath) && fs.statSync(safePath).isFile()) {
        const ext = path.extname(safePath).toLowerCase();
        const mimeTypes = {
          '.html': 'text/html; charset=utf-8',
          '.css': 'text/css; charset=utf-8',
          '.js': 'application/javascript; charset=utf-8',
          '.json': 'application/json; charset=utf-8',
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.svg': 'image/svg+xml',
          '.ico': 'image/x-icon',
          '.kml': 'application/vnd.google-earth.kml+xml',
          '.kmz': 'application/vnd.google-earth.kmz',
          '.txt': 'text/plain; charset=utf-8'
        };
        const contentType = mimeTypes[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        if (req.method === 'HEAD') {
          res.end();
          return;
        }
        fs.createReadStream(safePath).pipe(res);
        return;
      }
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Endpoint not found' }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
});

// Setup Interactive CLI Keyboard Shortcuts
if (process.stdin.isTTY) {
  readline.emitKeypressEvents(process.stdin);
  try {
    process.stdin.setRawMode(true);
    process.stdin.on('keypress', async (str, key) => {
      if (key && ((key.ctrl && key.name === 'c') || key.name === 'q')) {
        console.log(`\n${colors.yellow}[*] Stopping Aalaapi Sky Companion Bridge...${colors.reset}`);
        process.exit(0);
      }
      if (key && key.name === 'c') {
        console.clear();
        printStartupBanner();
      }
      if (key && key.name === 's') {
        console.log(`\n${colors.cyan}[*] Probing DJI RC 2 controller status...${colors.reset}`);
        const st = await checkRc2Status();
        if (st.connected) {
          logSuccess('[RC 2 STATUS]', `Device: ${st.deviceName || 'DJI RC 2'} (Waypoint storage: ${st.waypointReady ? 'Ready' : 'Missing'})`);
          if (st.activeMissions && st.activeMissions.length > 0) {
            console.log(`    ${colors.white}Missions:${colors.reset} ${st.activeMissions.join(', ')}`);
          }
        } else {
          logWarn('[RC 2 STATUS]', 'DJI RC 2 is not currently connected over USB MTP.');
        }
      }
      if (key && key.name === 'f') {
        console.log(`\n${colors.cyan}[*] Scanning cached flight logs in ${LATEST_DIR}...${colors.reset}`);
        if (fs.existsSync(LATEST_DIR)) {
          const files = fs.readdirSync(LATEST_DIR).filter(f => f.startsWith('FlightRecord_') && f.endsWith('.txt'));
          if (files.length === 0) {
            console.log(`    ${colors.gray}No flight logs currently cached in ${LATEST_DIR}${colors.reset}`);
          } else {
            files.forEach(f => {
              const sz = Math.round(fs.statSync(path.join(LATEST_DIR, f)).size / 1024);
              console.log(`    ${colors.green}•${colors.reset} ${f} (${sz} KB)`);
            });
          }
        }
      }
      if (key && key.name === 'r') {
        console.log(`\n${colors.cyan}[*] Probing Dual-Mode Airspace Radar (Wi-Fi + BLE)...${colors.reset}`);
        const active = airspaceTracker.getActiveDrones();
        if (active.length === 0) {
          console.log(`    ${colors.yellow}No active drones detected in local airspace.${colors.reset}`);
          console.log(`    ${colors.gray}Injecting simulated DJI Mini 4 Pro Remote ID broadcast test packet...${colors.reset}`);
          const syn = createSyntheticOdidPayload({ uasId: '1581F4TEST-M4P', lat: 40.0132, lon: -83.1760, alt: 35.0, heading: 45 });
          const drone = airspaceTracker.processAdvertisement({ mac: 'FA:0B:BC:15:81:F4', rssi: -58, rawPayload: syn });
          logSuccess('[REMOTE ID]', `Detected: ${drone.model} [${drone.uasId}] at (${drone.latitude}, ${drone.longitude}) alt: ${drone.altitudeGeodetic}m`);
        } else {
          console.log(`    ${colors.green}Active Airspace Drones (${active.length}):${colors.reset}`);
          active.forEach(d => {
            const posPart = d.latitude ? `Pos: ${d.latitude}, ${d.longitude}` : (d.transport ? `${d.transport}` : 'RF Beacon Detected');
            const altPart = d.altitudeGeodetic !== null ? ` — Alt: ${d.altitudeGeodetic}m MSL` : '';
            console.log(`    ${colors.green}•${colors.reset} ${d.model} (${d.uasId}) — ${posPart}${altPart} — On: ${d.uptimeFormatted || (d.uptimeSec + 's')} (${d.packetCount} pkts) — RSSI: ${d.rssi} dBm`);
          });
        }
      }
    });
  } catch (e) {}
}

function killPortPid(port) {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      try {
        const netstatOut = execFileSync('cmd.exe', ['/c', `netstat -ano | findstr :${port}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        const lines = netstatOut.trim().split('\n');
        for (const line of lines) {
          if (line.includes('LISTENING')) {
            const parts = line.trim().split(/\s+/);
            const pid = parts[parts.length - 1];
            if (pid && pid !== `${process.pid}` && pid !== '0') {
              try {
                execFileSync('taskkill.exe', ['/F', '/PID', pid], { stdio: 'ignore' });
                setTimeout(resolve, 600);
                return;
              } catch (e) {}
            }
          }
        }
      } catch (e) {}
    }
    resolve();
  });
}

async function killExistingCompanion(port) {
  return new Promise((resolve) => {
    let handled = false;
    const finish = () => {
      if (!handled) {
        handled = true;
        clearTimeout(connectTimer);
        resolve();
      }
    };

    const connectTimer = setTimeout(() => {
      if (!handled) {
        try { req.destroy(); } catch (e) {}
        killPortPid(port).then(finish);
      }
    }, 400);

    const req = http.request({
      hostname: '127.0.0.1',
      port: port,
      path: '/api/shutdown',
      method: 'POST',
      timeout: 1000
    }, (res) => {
      if (res.statusCode === 200) {
        setTimeout(finish, 400);
      } else {
        killPortPid(port).then(finish);
      }
    });

    req.on('error', () => {
      killPortPid(port).then(finish);
    });

    req.on('timeout', () => {
      req.destroy();
      killPortPid(port).then(finish);
    });

    req.end();
  });
}

if (require.main === module) {
  (async () => {
    // Check and kill any previously running companion instance on the target port
    await killExistingCompanion(PORT);

    // Initial status check & background polling every 3.5s
    updateRc2Status();
    setInterval(updateRc2Status, 3500);

    // Launch Live WinRT Bluetooth LE and Wi-Fi Remote ID scanners
    startBleScanner();
    startWifiScanner();

    // Start Server
    server.listen(PORT, '127.0.0.1', () => {
      printStartupBanner();
    });
  })();
}

module.exports = {
  server,
  setCorsHeaders,
  checkRc2Status,
  transferToRc2,
  pullFromRc2,
  stopScanners,
  killExistingCompanion,
  VERSION,
  PORT
};
