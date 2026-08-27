$shell = New-Object -ComObject Shell.Application
$thisPC = $shell.Namespace(17)
$dji = $thisPC.Items() | Where-Object { $_.Name -like "*DJI RC 2*" -or $_.Name -like "*DJI RC*" -or $_.Name -like "*RC2*" } | Select-Object -First 1

function Get-SubItem($folderItem, $name) {
    if (-not $folderItem) { return $null }
    $folder = if ($folderItem.GetFolder) { $folderItem.GetFolder } else { $folderItem }
    return $folder.Items() | Where-Object { $_.Name -eq $name } | Select-Object -First 1
}

if (-not $dji) {
    Write-Output "DJI RC 2 not found in Shell namespace 17"
    exit
}

Write-Output "Found device: $($dji.Name)"
$storage = Get-SubItem $dji "Internal shared storage"
if (-not $storage) { $storage = Get-SubItem $dji "Internal storage" }
if (-not $storage) {
    Write-Output "Could not find Internal shared storage"
    exit
}

$android = Get-SubItem $storage "Android"
$data    = Get-SubItem $android "data"
$djiApp  = Get-SubItem $data "dji.go.v5"
$files   = Get-SubItem $djiApp "files"
$wp      = Get-SubItem $files "waypoint"

if (-not $wp) {
    Write-Output "Waypoint folder not found!"
    exit
}

Write-Output "Waypoint folder: $($wp.Path)"
$items = $wp.GetFolder.Items()
foreach ($it in $items) {
    Write-Output "  Item: $($it.Name) (IsFolder: $($it.IsFolder))"
    if ($it.IsFolder) {
        $sub = $it.GetFolder.Items()
        foreach ($s in $sub) {
            Write-Output "    SubItem: $($s.Name) (Size: $($s.Size))"
        }
    }
}
