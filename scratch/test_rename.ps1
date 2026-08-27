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
$mission = Get-SubItem $wp "354A8F93-759C-42C3-A8D5-746F79C7622A"
$folder = $mission.GetFolder

Write-Output "Before rename:"
$folder.Items() | ForEach-Object { Write-Output "  $($_.Name)" }

$existing = $folder.Items() | Where-Object { $_.Name -like "*.kmz" -and $_.Name -notlike "_old_*" }
foreach ($item in $existing) {
    Write-Output "Renaming $($item.Name)..."
    $item.Name = "_old_$((Get-Date).Ticks)_$($item.Name)"
}

Start-Sleep -Milliseconds 500

Write-Output "After rename:"
$folder.Items() | ForEach-Object { Write-Output "  $($_.Name)" }

# Now copy fresh file
$freshKmz = "C:\Users\bpawl\OneDrive\code\Aalaapi-Sky\scratch\companion_staging\354A8F93-759C-42C3-A8D5-746F79C7622A.kmz"
Write-Output "Copying fresh KMZ..."
$folder.CopyHere($freshKmz, 16)

Start-Sleep -Seconds 2

Write-Output "After copy:"
$folder.Items() | ForEach-Object { Write-Output "  $($_.Name)" }
