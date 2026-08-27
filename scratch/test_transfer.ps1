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

# Look for existing KMZ
$existing = $folder.Items() | Where-Object { $_.Name -like "*.kmz" }
foreach ($item in $existing) {
    Write-Output "Found existing KMZ: $($item.Name). Attempting to delete or rename..."
    # Attempt delete via InvokeVerb
    $delVerb = $item.Verbs() | Where-Object { $_.Name -eq '&Delete' } | Select-Object -First 1
    if ($delVerb) {
        $delVerb.DoIt()
        Write-Output "Called DoIt() on &Delete"
    } else {
        $item.Name = "_old_$($item.Name)"
        Write-Output "Renamed to _old_"
    }
}

Start-Sleep -Seconds 1

# Check if old file was removed
$remaining = $folder.Items() | Where-Object { $_.Name -eq "354A8F93-759C-42C3-A8D5-746F79C7622A.kmz" }
if ($remaining) {
    Write-Output "Existing file still exists after delete attempt. Renaming it..."
    $remaining.Name = "_del_$((Get-Date).Ticks).kmz"
    Start-Sleep -Milliseconds 500
}

# Now copy the fresh staged KMZ
$freshKmz = "C:\Users\bpawl\OneDrive\code\Aalaapi-Sky\scratch\companion_staging\354A8F93-759C-42C3-A8D5-746F79C7622A.kmz"
Write-Output "Copying fresh KMZ ($freshKmz) to RC2..."
$folder.CopyHere($freshKmz, 16)

Start-Sleep -Seconds 2

# Inspect mission folder items now
Write-Output "Items in mission folder after copy:"
$folder.Items() | ForEach-Object {
    Write-Output "  Item: $($_.Name)"
}
