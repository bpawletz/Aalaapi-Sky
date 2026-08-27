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
        if (error) console.log('ERROR:', error);
        resolve({ stdout, stderr });
      }
    );
  });
}

const STAGING_DIR = path.resolve('scratch/companion_staging');
const uuid = '354A8F93-759C-42C3-A8D5-746F79C7622A';
const kmzPath = path.join(STAGING_DIR, `${uuid}.kmz`);

const psScript = `
$shell = New-Object -ComObject Shell.Application
$dji = $shell.Namespace(17).Items() | Where-Object { $_.Name -like "*DJI RC 2*" } | Select-Object -First 1
$storage = $dji.GetFolder.Items() | Where-Object { $_.Name -like "Internal*" } | Select-Object -First 1
$android = $storage.GetFolder.Items() | Where-Object { $_.Name -eq "Android" } | Select-Object -First 1
$data = $android.GetFolder.Items() | Where-Object { $_.Name -eq "data" } | Select-Object -First 1
$djiApp = $data.GetFolder.Items() | Where-Object { $_.Name -eq "dji.go.v5" } | Select-Object -First 1
$files = $djiApp.GetFolder.Items() | Where-Object { $_.Name -eq "files" } | Select-Object -First 1
$wp = $files.GetFolder.Items() | Where-Object { $_.Name -eq "waypoint" } | Select-Object -First 1
$targetFolder = $wp.GetFolder.Items() | Where-Object { $_.Name -eq "${uuid}" } | Select-Object -First 1
$dest = $targetFolder.GetFolder

$trashDir = "${STAGING_DIR}\\trash"
if (-not (Test-Path $trashDir)) { New-Item -ItemType Directory -Path $trashDir -Force | Out-Null }
$trashFolder = $shell.Namespace($trashDir)

$leftoverOld = @($dest.Items() | Where-Object { $_.Name -like "_old_*" })
Write-Output "Found $($leftoverOld.Count) old files to clean up..."
foreach ($oldItem in $leftoverOld) {
    try { $trashFolder.MoveHere($oldItem, 16) } catch {}
}
Start-Sleep -Milliseconds 400
Get-ChildItem -Path $trashDir -File -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue

Write-Output "Folder items after cleanup:"
$dest.Items() | ForEach-Object { Write-Output "  $($_.Name)" }
`;

runMtpScript(psScript);
