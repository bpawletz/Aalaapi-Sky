$shell = New-Object -ComObject Shell.Application
$thisPC = $shell.Namespace(17)
$dji = $thisPC.Items() | Where-Object { $_.Name -like "*DJI RC 2*" -or $_.Name -like "*DJI RC*" -or $_.Name -like "*RC2*" } | Select-Object -First 1

if (-not $dji) {
    Write-Output "DJI RC 2 not connected"
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
    Write-Output "Waypoint directory not found"
    exit
}

$uuid = "354A8F93-759C-42C3-A8D5-746F79C7622A"
$kmzPath = "C:\Users\bpawl\OneDrive\code\Aalaapi-Sky\scratch\companion_staging\354A8F93-759C-42C3-A8D5-746F79C7622A.kmz"
$jpgPath = "C:\Users\bpawl\OneDrive\code\Aalaapi-Sky\scratch\companion_staging\354A8F93-759C-42C3-A8D5-746F79C7622A.jpg"
$stagingDir = "C:\Users\bpawl\OneDrive\code\Aalaapi-Sky\scratch\companion_staging"

# 1. Resolve target mission folder
$targetMissionFolder = Get-SubItem $wp $uuid
$targetUUID = $uuid

if (-not $targetMissionFolder) {
    $availSlots = @($wp.GetFolder.Items() | Where-Object { $_.IsFolder -and $_.Name -match "^[A-F0-9]{8}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{12}$" })
    if ($availSlots.Count -gt 0) {
        $targetMissionFolder = $availSlots[0]
        $targetUUID = $targetMissionFolder.Name
    } else {
        Write-Output "No mission slot found on RC 2."
        exit
    }
}

Write-Output "Targeting mission folder: $($targetMissionFolder.Name)"
$destMissionFolder = $targetMissionFolder.GetFolder
$targetKmzName = "$($targetUUID).kmz"

# Safe MTP copy for KMZ
$existingKmz = @($destMissionFolder.Items() | Where-Object { $_.Name -eq $targetKmzName -or $_.Name -like "*.kmz" })
foreach ($oldKmz in $existingKmz) {
    $oldKmz.Name = "_old_$((Get-Date).Ticks)_$($oldKmz.Name)"
}
Start-Sleep -Milliseconds 300

if (Test-Path $kmzPath) {
    $destMissionFolder.CopyHere($kmzPath, 16)
    Start-Sleep -Milliseconds 600
}

$trashDir = "$stagingDir\trash"
if (-not (Test-Path $trashDir)) { New-Item -ItemType Directory -Path $trashDir -Force | Out-Null }
$trashFolder = $shell.Namespace($trashDir)

$leftoverOld = @($destMissionFolder.Items() | Where-Object { $_.Name -like "_old_*" })
foreach ($oldItem in $leftoverOld) {
    try { $trashFolder.MoveHere($oldItem, 16) } catch {}
}

# 2. Sync Preview Thumbnail
$previewFolder = Get-SubItem $wp "map_preview"
if ($previewFolder) {
    $targetPrev = Get-SubItem $previewFolder $targetUUID
    if ($targetPrev) {
        $destPrevFolder = $targetPrev.GetFolder
        $targetJpgName = "$($targetUUID).jpg"
        
        $existingJpg = @($destPrevFolder.Items() | Where-Object { $_.Name -eq $targetJpgName -or $_.Name -like "*.jpg" })
        foreach ($oldJpg in $existingJpg) {
            $oldJpg.Name = "_old_$((Get-Date).Ticks)_$($oldJpg.Name)"
        }
        Start-Sleep -Milliseconds 200

        if (Test-Path $jpgPath) {
            $destPrevFolder.CopyHere($jpgPath, 16)
            Start-Sleep -Milliseconds 400
        }

        $leftoverPreviews = @($destPrevFolder.Items() | Where-Object { $_.Name -like "_old_*" })
        foreach ($oldPrev in $leftoverPreviews) {
            try { $trashFolder.MoveHere($oldPrev, 16) } catch {}
        }
    }
}

Get-ChildItem -Path $trashDir -File -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue

$finalCheck = @($destMissionFolder.Items() | Where-Object { $_.Name -eq $targetKmzName })
$syncVerified = ($finalCheck.Count -gt 0)

Write-Output "Sync result: verified=$syncVerified, uuid=$targetUUID"
Write-Output "Items in mission folder now:"
$destMissionFolder.Items() | ForEach-Object { Write-Output "  $($_.Name)" }
if ($previewFolder -and $targetPrev) {
    Write-Output "Items in preview folder now:"
    $targetPrev.GetFolder.Items() | ForEach-Object { Write-Output "  $($_.Name)" }
}
