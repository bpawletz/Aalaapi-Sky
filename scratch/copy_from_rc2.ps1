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
$kmz = Get-SubItem $mission "354A8F93-759C-42C3-A8D5-746F79C7622A.kmz"

$destFolder = $shell.Namespace("C:\Users\bpawl\OneDrive\code\Aalaapi-Sky\scratch")
$destFolder.CopyHere($kmz, 16)
Start-Sleep -Seconds 2

$copied = Get-Item "C:\Users\bpawl\OneDrive\code\Aalaapi-Sky\scratch\354A8F93-759C-42C3-A8D5-746F79C7622A.kmz" -ErrorAction SilentlyContinue
if ($copied) {
    Write-Output "Copied KMZ from RC2! Length: $($copied.Length) bytes, LastWrite: $($copied.LastWriteTime)"
} else {
    Write-Output "Failed to copy KMZ from RC2"
}
