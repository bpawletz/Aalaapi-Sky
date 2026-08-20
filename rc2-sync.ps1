<#
.SYNOPSIS
    Aalaapi Sky - Real-Time DJI RC 2 Auto-Sync Companion
.DESCRIPTION
    Monitors the Downloads folder for exported KMZ missions and JPG map preview thumbnails,
    automatically transferring them directly to the connected DJI RC 2 controller over USB MTP.
#>

$Host.UI.RawUI.WindowTitle = "Aalaapi Sky - RC2 Auto-Sync"
Clear-Host

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "       AALAAPI SKY - DJI RC 2 REAL-TIME AUTO-SYNC        " -ForegroundColor White
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""

$shell = New-Object -ComObject Shell.Application
$downloadsPath = Join-Path $HOME "Downloads"
$stagingDir    = Join-Path $PSScriptRoot "scratch\rc2_staging"

if (-not (Test-Path $stagingDir)) {
    New-Item -ItemType Directory -Path $stagingDir -Force | Out-Null
}

if (-not (Test-Path $downloadsPath)) {
    Write-Host "[-] Could not locate Downloads directory at: $downloadsPath" -ForegroundColor Red
    Exit
}

function Get-SubFolderItem($folderItem, $name) {
    if (-not $folderItem) { return $null }
    $folder = $folderItem.GetFolder
    return $folder.Items() | Where-Object { $_.Name -eq $name } | Select-Object -First 1
}

function Find-RC2WaypointFolders {
    $thisPC = $shell.Namespace(17) # ssfDRIVES (This PC)
    $dji = $thisPC.Items() | Where-Object { $_.Name -like "*DJI RC 2*" -or $_.Name -like "*RC2*" -or $_.Name -like "*DJI RC*" } | Select-Object -First 1
    
    if (-not $dji) { return $null }

    $storage   = Get-SubFolderItem $dji "Internal shared storage"
    if (-not $storage) { return $null }
    
    $android   = Get-SubFolderItem $storage "Android"
    $data      = Get-SubFolderItem $android "data"
    $djiApp    = Get-SubFolderItem $data "dji.go.v5"
    $files     = Get-SubFolderItem $djiApp "files"
    $waypoint  = Get-SubFolderItem $files "waypoint"
    if (-not $waypoint) { return $null }
    
    $mapPreview= Get-SubFolderItem $waypoint "map_preview"
    
    $wpFolder = $waypoint.GetFolder
    $uuidFolders = @()
    foreach ($item in $wpFolder.Items()) {
        if ($item.IsFolder -and $item.Name -match "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$") {
            $uuidFolders += $item
        }
    }
    
    return @{
        Device = $dji
        WaypointFolder = $wpFolder
        MapPreviewFolder = if ($mapPreview) { $mapPreview.GetFolder } else { $null }
        UUIDFolders = $uuidFolders
    }
}

Write-Host "[*] Checking for connected DJI RC 2 controller..." -ForegroundColor Yellow
$rc2Info = Find-RC2WaypointFolders

while (-not $rc2Info) {
    Write-Host "[!] DJI RC 2 not detected. Please ensure USB-C is connected and in File Transfer mode." -ForegroundColor Yellow
    Write-Host "    Retrying in 5 seconds..." -ForegroundColor Gray
    Start-Sleep -Seconds 5
    $rc2Info = Find-RC2WaypointFolders
}

Write-Host "[+] Connected to $($rc2Info.Device.Name)!" -ForegroundColor Green

if ($rc2Info.UUIDFolders.Count -eq 0) {
    Write-Host "[-] No mission UUID folders found under waypoint directory on RC2." -ForegroundColor Yellow
    Write-Host "    Please create at least one waypoint mission or template in DJI Fly first." -ForegroundColor Gray
} else {
    Write-Host "[+] Found $($rc2Info.UUIDFolders.Count) mission slot(s) on RC2:" -ForegroundColor Cyan
    foreach ($f in $rc2Info.UUIDFolders) {
        Write-Host "    - $($f.Name)" -ForegroundColor White
    }
}

Write-Host ""
Write-Host "[*] Watching folder: $downloadsPath" -ForegroundColor Cyan
Write-Host "[*] Whenever you export a KMZ mission or JPG preview, it will sync automatically!" -ForegroundColor Green
Write-Host "    (Press Ctrl+C to stop auto-sync)" -ForegroundColor Gray
Write-Host "----------------------------------------------------------" -ForegroundColor DarkGray

$processedFiles = @{}

# Pre-populate existing files
Get-ChildItem -Path $downloadsPath -Include "*.kmz", "*.jpg", "*.jpeg", "*.png" -File -ErrorAction SilentlyContinue | ForEach-Object {
    $processedFiles[$_.FullName] = $_.LastWriteTimeUtc.Ticks
}

while ($true) {
    try {
        $syncCandidates = Get-ChildItem -Path $downloadsPath -Include "*.kmz", "*.jpg", "*.jpeg", "*.png" -File -ErrorAction SilentlyContinue
        
        foreach ($file in $syncCandidates) {
            $lastTick = $processedFiles[$file.FullName]
            $currTick = $file.LastWriteTimeUtc.Ticks
            
            if (-not $lastTick -or $currTick -gt $lastTick) {
                Start-Sleep -Milliseconds 600
                $processedFiles[$file.FullName] = $currTick
                
                $currentRC2 = Find-RC2WaypointFolders
                if (-not $currentRC2) {
                    Write-Host "[!] RC2 disconnected. Cannot sync $($file.Name)" -ForegroundColor Red
                    continue
                }
                
                $isImage = ($file.Extension -in @(".jpg", ".jpeg", ".png"))
                $isKMZ   = ($file.Extension -eq ".kmz")
                
                # Detect target UUID
                $targetUUID = $null
                if ($file.Name -match "([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})") {
                    $targetUUID = $matches[1].ToUpper()
                } elseif ($currentRC2.UUIDFolders.Count -gt 0) {
                    $targetUUID = $currentRC2.UUIDFolders[0].Name.ToUpper()
                }
                
                if (-not $targetUUID) {
                    continue
                }
                
                if ($isKMZ) {
                    Write-Host "`n[>] Syncing Mission KMZ: $($file.Name)" -ForegroundColor White
                    $targetFolderItem = $currentRC2.UUIDFolders | Where-Object { $_.Name.ToUpper() -eq $targetUUID } | Select-Object -First 1
                    
                    if ($targetFolderItem) {
                        $targetFileName = "$targetUUID.kmz"
                        Write-Host "    -> Destination: waypoint\$targetUUID\$targetFileName" -ForegroundColor Cyan
                        
                        $stagedPath = Join-Path $stagingDir $targetFileName
                        Copy-Item -Path $file.FullName -Destination $stagedPath -Force
                        
                        $destFolder = $targetFolderItem.GetFolder
                        $destFolder.CopyHere($stagedPath, 16)
                        
                        Start-Sleep -Seconds 2
                        [System.Console]::Beep(1000, 150)
                        Write-Host "[V] SUCCESS: Mission KMZ transferred to DJI RC 2!" -ForegroundColor Green
                    }
                }
                elseif ($isImage) {
                    Write-Host "`n[>] Syncing Map Preview Thumbnail: $($file.Name)" -ForegroundColor White
                    if ($currentRC2.MapPreviewFolder) {
                        $previewTargetFolderItem = Get-SubFolderItem $currentRC2.MapPreviewFolder $targetUUID
                        
                        if ($previewTargetFolderItem) {
                            $targetFileName = "$targetUUID.jpg"
                            Write-Host "    -> Destination: waypoint\map_preview\$targetUUID\$targetFileName" -ForegroundColor Cyan
                            
                            $stagedPath = Join-Path $stagingDir $targetFileName
                            Copy-Item -Path $file.FullName -Destination $stagedPath -Force
                            
                            $destFolder = $previewTargetFolderItem.GetFolder
                            $destFolder.CopyHere($stagedPath, 16)
                            
                            Start-Sleep -Seconds 2
                            [System.Console]::Beep(1200, 150)
                            Write-Host "[V] SUCCESS: Map Preview Thumbnail transferred to DJI RC 2!" -ForegroundColor Green
                        }
                    }
                }
            }
        }
    } catch {
        # Keep watcher alive
    }
    
    Start-Sleep -Seconds 1
}
