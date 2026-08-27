$shell = New-Object -ComObject Shell.Application
$thisPC = $shell.Namespace(17)
$dji = $thisPC.Items() | Where-Object { $_.Name -like "*DJI RC 2*" -or $_.Name -like "*DJI RC*" -or $_.Name -like "*RC2*" } | Select-Object -First 1

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
$previewFolder = Get-SubItem $wp "map_preview"
$targetPrev = Get-SubItem $previewFolder "354A8F93-759C-42C3-A8D5-746F79C7622A"

Write-Output "Testing silent removal of old files..."
$oldFiles = $targetPrev.GetFolder.Items() | Where-Object { $_.Name -like "_old_*" }
Write-Output "Found $($oldFiles.Count) _old_ files"

# Test MoveHere to Recycle Bin or local temp?
# What if we MoveHere to a local folder?
$tempDir = "C:\Users\bpawl\OneDrive\code\Aalaapi-Sky\scratch\mtp_trash"
if (-not (Test-Path $tempDir)) { New-Item -ItemType Directory -Path $tempDir | Out-Null }
$tempFolder = $shell.Namespace($tempDir)

if ($oldFiles.Count -gt 0) {
    $firstOld = $oldFiles[0]
    Write-Output "Attempting MoveHere on $($firstOld.Name)..."
    try {
        $tempFolder.MoveHere($firstOld, 16)
        Start-Sleep -Milliseconds 500
        Write-Output "MoveHere succeeded! Check if file was moved to temp dir:"
        Get-ChildItem $tempDir | ForEach-Object { Write-Output "  In temp dir: $($_.Name)" }
    } catch {
        Write-Output "MoveHere error: $_"
    }
}
