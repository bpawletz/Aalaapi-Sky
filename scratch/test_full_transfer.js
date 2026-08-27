const path = require('path');
const { execFile } = require('child_process');

function runMtpScript(scriptContent) {
  return new Promise((resolve) => {
    const encodedCommand = Buffer.from(scriptContent, 'utf16le').toString('base64');
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodedCommand],
      { maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        console.log('STDOUT:', stdout);
        console.log('STDERR:', stderr);
        if (error) console.log('ERROR:', error);
        resolve({ stdout, stderr });
      }
    );
  });
}

const STAGING_DIR = path.resolve('scratch/companion_staging');
const uuid = '354A8F93-759C-42C3-A8D5-746F79C7622A';
const kmzPath = path.join(STAGING_DIR, `${uuid}.kmz`);
const jpgPath = path.join(STAGING_DIR, `${uuid}.jpg`);

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

$targetMissionFolder = Get-SubItem $wp "${uuid}"
$targetUUID = "${uuid}"

if (-not $targetMissionFolder) {
    $availSlots = @($wp.GetFolder.Items() | Where-Object { $_.IsFolder -and $_.Name -match "^[A-F0-9]{8}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{12}$" })
    if ($availSlots.Count -gt 0) {
        $targetMissionFolder = $availSlots[0]
        $targetUUID = $targetMissionFolder.Name
    } else {
        @{ success = $false; error = "No mission placeholder folder found on RC 2." } | ConvertTo-Json -Compress
        exit
    }
}

$destMissionFolder = $targetMissionFolder.GetFolder
$targetKmzName = "$($targetUUID).kmz"

$existingKmz = @($destMissionFolder.Items() | Where-Object { $_.Name -eq $targetKmzName -or ($_.Name -like "*.kmz" -and $_.Name -notlike "_old_*") })
foreach ($oldKmz in $existingKmz) {
    try { $oldKmz.Name = "_old_$((Get-Date).Ticks)_$($oldKmz.Name)" } catch {}
}
Start-Sleep -Milliseconds 300

$kmzFile = "${kmzPath.replace(/\\/g, '\\\\')}"
Write-Host "Copying $kmzFile into $($destMissionFolder.Title)..."
$destMissionFolder.CopyHere($kmzFile, 16)
Start-Sleep -Seconds 1

$finalCheck = @($destMissionFolder.Items() | Where-Object { $_.Name -eq $targetKmzName })
Write-Host "Items in dest folder after copy:"
$destMissionFolder.Items() | ForEach-Object { Write-Host "  $($_.Name)" }
Write-Host "finalCheck Count: $($finalCheck.Count)"
`;

runMtpScript(psScript);
