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
const jpgPath = path.join(STAGING_DIR, `${uuid}.jpg`);

const psScript = `
$shell = New-Object -ComObject Shell.Application
$dji = $shell.Namespace(17).Items() | Where-Object { $_.Name -like "*DJI RC 2*" } | Select-Object -First 1
$storage = $dji.GetFolder.Items() | Where-Object { $_.Name -like "Internal*" } | Select-Object -First 1
$android = $storage.GetFolder.Items() | Where-Object { $_.Name -eq "Android" } | Select-Object -First 1
$data = $android.GetFolder.Items() | Where-Object { $_.Name -eq "data" } | Select-Object -First 1
$djiApp = $data.GetFolder.Items() | Where-Object { $_.Name -eq "dji.go.v5" } | Select-Object -First 1
$files = $djiApp.GetFolder.Items() | Where-Object { $_.Name -eq "files" } | Select-Object -First 1
$wp = $files.GetFolder.Items() | Where-Object { $_.Name -eq "waypoint" } | Select-Object -First 1
$previewFolder = $wp.GetFolder.Items() | Where-Object { $_.Name -eq "map_preview" } | Select-Object -First 1
$targetPrev = $previewFolder.GetFolder.Items() | Where-Object { $_.Name -eq "${uuid}" } | Select-Object -First 1
$destPrev = $targetPrev.GetFolder

$jpgFile = "${jpgPath}"
$targetJpgName = "${uuid}.jpg"

# Rename any existing
$existing = @($destPrev.Items() | Where-Object { $_.Name -eq $targetJpgName })
foreach ($x in $existing) {
    $x.Name = "_old_$((Get-Date).Ticks)_$($x.Name)"
}
Start-Sleep -Milliseconds 200

$destPrev.CopyHere($jpgFile, 16)

$sw = [System.Diagnostics.Stopwatch]::StartNew()
$arrived = $false
while ($sw.Elapsed.TotalSeconds -lt 10) {
    Start-Sleep -Milliseconds 400
    $check = @($destPrev.Items() | Where-Object { $_.Name -eq $targetJpgName })
    if ($check.Count -gt 0) {
        $arrived = $true
        break
    }
}

Write-Output "Preview arrived: $arrived"
Write-Output "Preview items:"
$destPrev.Items() | ForEach-Object { Write-Output "  $($_.Name)" }
`;

runMtpScript(psScript);
