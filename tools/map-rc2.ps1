<#
.SYNOPSIS
    DJI RC 2 Storage Mapper & Reconnaissance Tool
.DESCRIPTION
    Recursively scans all storage volumes on a connected DJI RC 2 controller over USB MTP.
    Catalogs all directories, files, extensions, and sizes.
    Generates both an interactive console tree and a detailed Markdown report at tools\rc2_storage_map.md.
.PARAMETER IncludeDebugLogs
    If set, includes deep diagnostic log caches (LOG\CACHE\*). Default is to summarize them quickly.
#>

param(
    [switch]$IncludeDebugLogs = $false
)

$Host.UI.RawUI.WindowTitle = "DJI RC 2 Storage Mapper"
Clear-Host

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "             DJI RC 2 STORAGE MAPPER & INVENTORY            " -ForegroundColor White
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

$shell = New-Object -ComObject Shell.Application
$thisPC = $shell.Namespace(17) # ssfDRIVES (This PC)

$dji = $thisPC.Items() | Where-Object { $_.Name -like "*DJI RC 2*" -or $_.Name -like "*RC2*" -or $_.Name -like "*DJI RC*" } | Select-Object -First 1

if (-not $dji) {
    Write-Host "[-] DJI RC 2 controller not found under 'This PC'." -ForegroundColor Red
    Write-Host "    Ensure the controller is turned ON, connected via USB-C, and in File Transfer mode." -ForegroundColor Yellow
    Exit
}

Write-Host "[+] Found Controller: $($dji.Name)" -ForegroundColor Green
$djiFolder = $dji.GetFolder

$reportPath = Join-Path $PSScriptRoot "rc2_storage_map.md"

$sb = New-Object System.Text.StringBuilder
[void]$sb.AppendLine("# DJI RC 2 Complete Storage Map & Directory Inventory")
[void]$sb.AppendLine("Scanned on: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')")
[void]$sb.AppendLine("Device: $($dji.Name)")
[void]$sb.AppendLine("")
[void]$sb.AppendLine("---")
[void]$sb.AppendLine("")

$global:dirCount = 0
$global:fileCount = 0
$global:extensionStats = @{}
$global:scannedPaths = @{}

function Scan-MtpFolder($folderObj, $currentPath = "", $depth = 0) {
    if ($depth -gt 10) { return }
    if ($global:scannedPaths.ContainsKey($currentPath)) { return }
    $global:scannedPaths[$currentPath] = $true
    $global:dirCount++

    # Fast skip for thousands of internal debug telemetry logs unless requested
    if (-not $IncludeDebugLogs -and ($currentPath -like "*\LOG\CACHE*" -or $currentPath -like "*\LOG\UAVSDK\cmd_record*")) {
        $itemCount = $folderObj.Items().Count
        if ($itemCount -gt 0) {
            $indent = "  " * $depth
            Write-Host "$indent[DIR] $currentPath ($itemCount debug log files skipped)" -ForegroundColor DarkGray
            [void]$sb.AppendLine("$('#' * [Math]::Min(6, ($depth + 2))) $currentPath")
            [void]$sb.AppendLine("*($itemCount telemetry debug log files omitted for brevity)*`n")
        }
        return
    }

    $items = @($folderObj.Items())
    $subDirs = @()
    $files = @()

    foreach ($item in $items) {
        if ($item.IsFolder) {
            $subDirs += $item
        } else {
            $files += $item
            $global:fileCount++
            
            $ext = [System.IO.Path]::GetExtension($item.Name).ToLower()
            if (-not $ext) { $ext = "(no extension)" }
            
            if (-not $global:extensionStats.ContainsKey($ext)) {
                $global:extensionStats[$ext] = 0
            }
            $global:extensionStats[$ext]++
        }
    }

    $indent = "  " * $depth
    $folderDisplay = if ($currentPath) { $currentPath } else { "[ROOT]" }
    
    # Console output
    $color = if ($currentPath -like "*waypoint*" -or $currentPath -like "*FlightRecord*" -or $currentPath -like "*OfflineMap*") { "Cyan" } else { "Yellow" }
    Write-Host "$indent[DIR] $folderDisplay" -ForegroundColor $color -NoNewline
    if ($files.Count -gt 0) {
        $extSummary = ($files | Group-Object { [System.IO.Path]::GetExtension($_.Name).ToLower() } | ForEach-Object { "$($_.Count) $($_.Name)" }) -join ", "
        Write-Host " ($($files.Count) files: $extSummary)" -ForegroundColor Gray
    } else {
        Write-Host ""
    }

    # Markdown output
    $headerLevel = "#" * [Math]::Min(6, ($depth + 2))
    [void]$sb.AppendLine("$headerLevel $folderDisplay")
    
    if ($files.Count -gt 0) {
        [void]$sb.AppendLine("| Filename | Type | Size / Date |")
        [void]$sb.AppendLine("| :--- | :--- | :--- |")
        foreach ($f in $files) {
            $fName = $f.Name
            $fType = $folderObj.GetDetailsOf($f, 2)
            $fSize = $folderObj.GetDetailsOf($f, 1)
            $fDate = $folderObj.GetDetailsOf($f, 3)
            [void]$sb.AppendLine("| `$($f.Name)` | $fType | $fSize ($fDate) |")
        }
        [void]$sb.AppendLine("")
    }

    foreach ($sub in $subDirs) {
        $nextPath = if ($currentPath) { "$currentPath\$($sub.Name)" } else { $sub.Name }
        Scan-MtpFolder $sub.GetFolder $nextPath ($depth + 1)
    }
}

Write-Host "`n[*] Scanning storage volumes on DJI RC 2..." -ForegroundColor Cyan
$seenRoots = @{}
foreach ($storageRoot in $djiFolder.Items()) {
    if ($storageRoot.IsFolder -and -not $seenRoots.ContainsKey($storageRoot.Name)) {
        $seenRoots[$storageRoot.Name] = $true
        Write-Host "`n========================================================" -ForegroundColor DarkCyan
        Write-Host " STORAGE VOLUME: $($storageRoot.Name)" -ForegroundColor White
        Write-Host "========================================================" -ForegroundColor DarkCyan
        Scan-MtpFolder $storageRoot.GetFolder $storageRoot.Name 0
    }
}

[void]$sb.AppendLine("---")
[void]$sb.AppendLine("## Summary Statistics`n")
[void]$sb.AppendLine("- **Total Directories Cataloged:** $global:dirCount")
[void]$sb.AppendLine("- **Total Files Cataloged:** $global:fileCount`n")
[void]$sb.AppendLine("### File Type Breakdown`n")
[void]$sb.AppendLine("| Extension / Type | File Count |")
[void]$sb.AppendLine("| :--- | :--- |")
foreach ($k in ($global:extensionStats.Keys | Sort-Object)) {
    $count = $global:extensionStats[$k]
    [void]$sb.AppendLine("| $k | $count |")
}

[System.IO.File]::WriteAllText($reportPath, $sb.ToString(), [System.Text.Encoding]::UTF8)

Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host "[+] Storage Mapping Complete!" -ForegroundColor Green
Write-Host "    Total Directories Scanned : $global:dirCount" -ForegroundColor White
Write-Host "    Total Files Cataloged     : $global:fileCount" -ForegroundColor White
Write-Host "    Detailed Markdown Report  : $reportPath" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
