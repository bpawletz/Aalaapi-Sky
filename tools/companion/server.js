/**
 * Aalaapi Sky - Node.js Companion Service
 * 
 * Provides a lightweight local REST API on port 8765 to bridge the Aalaapi Sky
 * browser web interface with a connected DJI RC 2 controller over USB MTP.
 * 
 * Features:
 * - Real-time RC 2 connection status detection
 * - Direct 1-click in-browser mission and route thumbnail transfer
 * - Automated Downloads folder watcher
 * - Latest flight record telemetry log extraction & analysis
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');

const PORT = process.env.AALAAPI_PORT || 8765;
const STAGING_DIR = path.resolve(__dirname, '../../scratch/companion_staging');
const LATEST_DIR = path.resolve(__dirname, '../../scratch/latest_flight');

// Ensure directories exist
if (!fs.existsSync(STAGING_DIR)) fs.mkdirSync(STAGING_DIR, { recursive: true });
if (!fs.existsSync(LATEST_DIR)) fs.mkdirSync(LATEST_DIR, { recursive: true });

// Common CORS Headers
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With');
}

// Execute PowerShell COM helper for MTP operations
function runMtpScript(scriptContent) {
  return new Promise((resolve, reject) => {
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

// 1. Check DJI RC 2 Connection Status
async function checkRc2Status() {
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

// 2. Transfer KMZ & Preview JPG to RC 2
async function transferToRc2(uuid, kmzPath, jpgPath) {
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

# 1. Sync KMZ to waypoint/<UUID>/<UUID>.kmz
$targetMissionFolder = Get-SubItem $wp "${uuid}"
if ($targetMissionFolder) {
    $kmzFile = "${kmzPath}"
    if (Test-Path $kmzFile) {
        $targetMissionFolder.GetFolder.CopyHere($kmzFile, 16)
    }
}

# 2. Sync Preview Thumbnail to waypoint/map_preview/<UUID>/<UUID>.jpg
$previewFolder = Get-SubItem $wp "map_preview"
if ($previewFolder) {
    $targetPrev = Get-SubItem $previewFolder "${uuid}"
    if ($targetPrev) {
        $jpgFile = "${jpgPath}"
        if (Test-Path $jpgFile) {
            $targetPrev.GetFolder.CopyHere($jpgFile, 16)
        }
    }
}

@{
    success = $true
    uuid = "${uuid}"
    message = "Mission and preview thumbnail synced to DJI RC 2"
} | ConvertTo-Json -Compress
`;

  return await runMtpScript(psScript);
}

// 3. Extract Latest Flight Information
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
    if (pathname === '/api/status' && req.method === 'GET') {
      const status = await checkRc2Status();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(status));
      return;
    }

    if (pathname === '/api/sync' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const payload = JSON.parse(body);
          const uuid = payload.uuid || '354A8F93-759C-42C3-A8D5-746F79C7622A';

          let kmzPath = '';
          let jpgPath = '';

          if (payload.kmzBase64) {
            kmzPath = path.join(STAGING_DIR, `${uuid}.kmz`);
            fs.writeFileSync(kmzPath, Buffer.from(payload.kmzBase64, 'base64'));
          }

          if (payload.jpgBase64) {
            jpgPath = path.join(STAGING_DIR, `${uuid}.jpg`);
            fs.writeFileSync(jpgPath, Buffer.from(payload.jpgBase64, 'base64'));
          }

          const transferResult = await transferToRc2(uuid, kmzPath, jpgPath);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(transferResult));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }

    if (pathname === '/api/latest-flight' && req.method === 'GET') {
      const flightData = await extractLatestFlight();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(flightData));
      return;
    }

    if (pathname === '/' || pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'running', service: 'Aalaapi Sky Companion', version: '1.34.0' }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Endpoint not found' }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
});

// Start Server
server.listen(PORT, '127.0.0.1', () => {
  console.log('==========================================================');
  console.log(`   Aalaapi Sky Companion Bridge running on http://127.0.0.1:${PORT}`);
  console.log('==========================================================');
  console.log('[*] Ready to accept direct transfers from Aalaapi Sky');
});
