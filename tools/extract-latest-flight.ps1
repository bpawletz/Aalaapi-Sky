<#
.SYNOPSIS
    Extracts the latest flight records and waypoint missions from both Downloads and a connected DJI RC 2.
.DESCRIPTION
    Scans the local Downloads directory and the connected DJI RC 2 controller over MTP for:
    - The latest flight record telemetry logs (FlightRecord_*.txt)
    - The latest waypoint missions (.kmz)
    - Map preview route thumbnails (.jpg)
    - Internal mission database and snapshot metadata
    Copies them to scratch/latest_flight/ and displays a comprehensive flight summary.
#>

[CmdletBinding()]
param(
    [string]$OutputDir = "$PSScriptRoot\..\scratch\latest_flight"
)

$ErrorActionPreference = "Continue"

$OutputDir = [System.IO.Path]::GetFullPath($OutputDir)

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "      Aalaapi Sky - Latest Flight Extraction Tool         " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# Ensure output directory exists
if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

# 1. Check Local Downloads Folder
Write-Host "`n[1/3] Scanning Local Downloads Folder..." -ForegroundColor Yellow
$downloadsPath = [System.IO.Path]::Combine($env:USERPROFILE, "Downloads")
$localKmz = Get-ChildItem -Path $downloadsPath -Filter "*.kmz" -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
$localJpg = Get-ChildItem -Path $downloadsPath -Filter "*.jpg" -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
$localLogs = Get-ChildItem -Path $downloadsPath -Filter "FlightRecord_*.txt" -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1

if ($localKmz) {
    Write-Host "  [V] Latest Local KMZ: $($localKmz.Name) ($([math]::Round($localKmz.Length/1KB, 1)) KB, $($localKmz.LastWriteTime))" -ForegroundColor Green
    Copy-Item $localKmz.FullName -Destination "$OutputDir\local_$($localKmz.Name)" -Force
} else {
    Write-Host "  [-] No KMZ files found in Downloads." -ForegroundColor Gray
}

if ($localJpg) {
    Write-Host "  [V] Latest Local Preview: $($localJpg.Name) ($([math]::Round($localJpg.Length/1KB, 1)) KB, $($localJpg.LastWriteTime))" -ForegroundColor Green
    Copy-Item $localJpg.FullName -Destination "$OutputDir\local_$($localJpg.Name)" -Force
}

if ($localLogs) {
    Write-Host "  [V] Latest Local Flight Log: $($localLogs.Name) ($([math]::Round($localLogs.Length/1KB, 1)) KB, $($localLogs.LastWriteTime))" -ForegroundColor Green
    Copy-Item $localLogs.FullName -Destination "$OutputDir\local_$($localLogs.Name)" -Force
}

# 2. Connect to DJI RC 2 via MTP Shell COM
Write-Host "`n[2/3] Connecting to DJI RC 2 Controller over USB MTP..." -ForegroundColor Yellow
$shell = New-Object -ComObject Shell.Application
$thisPC = $shell.Namespace(17)

$rc2Device = $thisPC.Items() | Where-Object { 
    $_.Name -like "*DJI RC 2*" -or $_.Name -like "*DJI RC*" -or $_.Name -like "*RC2*" 
} | Select-Object -First 1

if (-not $rc2Device) {
    Write-Host "  [!] DJI RC 2 controller not detected!" -ForegroundColor Red
    Write-Host "      Ensure the controller is powered on, connected via USB-C, and in 'File Transfer' mode." -ForegroundColor Yellow
} else {
    Write-Host "  [V] Connected to: $($rc2Device.Name)" -ForegroundColor Green

    function Get-MTPFolderItem($folderItem, $name) {
        if (-not $folderItem) { return $null }
        $folder = if ($folderItem.GetFolder) { $folderItem.GetFolder } else { $folderItem }
        return $folder.Items() | Where-Object { $_.Name -eq $name } | Select-Object -First 1
    }

    $storage = Get-MTPFolderItem $rc2Device "Internal shared storage"
    if (-not $storage) { $storage = Get-MTPFolderItem $rc2Device "Internal storage" }

    if ($storage) {
        $android = Get-MTPFolderItem $storage "Android"
        $data    = Get-MTPFolderItem $android "data"
        $djiApp  = Get-MTPFolderItem $data "dji.go.v5"

        if ($djiApp) {
            $filesFolder = Get-MTPFolderItem $djiApp "files"
            $dbFolder    = Get-MTPFolderItem $djiApp "databases"

            # 2a. Extract Latest Flight Logs
            if ($filesFolder) {
                $flFolder = Get-MTPFolderItem $filesFolder "FlightRecord"
                if ($flFolder) {
                    $logItems = @($flFolder.GetFolder.Items() | Where-Object { $_.Name -like "FlightRecord_*.txt" })
                    if ($logItems.Count -gt 0) {
                        $latestLog = $logItems | Sort-Object Name -Descending | Select-Object -First 1
                        Write-Host "  [V] Latest RC 2 Flight Log: $($latestLog.Name)" -ForegroundColor Green
                        $shell.Namespace($OutputDir).CopyHere($latestLog, 16)
                        $swLog = [System.Diagnostics.Stopwatch]::StartNew()
                        while ($swLog.Elapsed.TotalSeconds -lt 20) {
                            Start-Sleep -Milliseconds 300
                            $copiedLog = @(Get-ChildItem -Path $OutputDir -Filter $latestLog.Name -File -ErrorAction SilentlyContinue)
                            if ($copiedLog.Count -gt 0 -and $copiedLog[0].Length -gt 0) { break }
                        }
                    } else {
                        Write-Host "  [-] No FlightRecord_*.txt logs found in DJI Fly directory." -ForegroundColor Gray
                    }
                }

                # 2b. Extract Latest Waypoint Missions
                $wpFolder = Get-MTPFolderItem $filesFolder "waypoint"
                if ($wpFolder) {
                    $wpItems = @($wpFolder.GetFolder.Items() | Where-Object { $_.IsFolder -and $_.Name -match "^[A-F0-9]{8}-" })
                    foreach ($missionFolder in $wpItems) {
                        $kmzFiles = @($missionFolder.GetFolder.Items() | Where-Object { $_.Name -like "*.kmz" })
                        $activeKmz = $kmzFiles | Where-Object { $_.Name -notlike "_old_*" } | Select-Object -First 1
                        if ($activeKmz) {
                            Write-Host "  [V] RC 2 Mission KMZ: $($missionFolder.Name)\$($activeKmz.Name)" -ForegroundColor Green
                            $missionOutDir = "$OutputDir\rc2_waypoint\$($missionFolder.Name)"
                            if (-not (Test-Path $missionOutDir)) { New-Item -ItemType Directory -Path $missionOutDir -Force | Out-Null }
                            $shell.Namespace($missionOutDir).CopyHere($activeKmz, 16)
                            $swKmz = [System.Diagnostics.Stopwatch]::StartNew()
                            while ($swKmz.Elapsed.TotalSeconds -lt 15) {
                                Start-Sleep -Milliseconds 300
                                $copiedKmz = @(Get-ChildItem -Path $missionOutDir -Filter $activeKmz.Name -File -ErrorAction SilentlyContinue)
                                if ($copiedKmz.Count -gt 0 -and $copiedKmz[0].Length -gt 0) { break }
                            }

                            # Also grab image / ShotSnap.json if present
                            $imgFolder = Get-MTPFolderItem $missionFolder "image"
                            if ($imgFolder) {
                                foreach ($imgFile in $imgFolder.GetFolder.Items()) {
                                    $shell.Namespace($missionOutDir).CopyHere($imgFile, 16)
                                }
                            }
                        }
                    }

                    # Map preview thumbnails
                    $previewFolder = Get-MTPFolderItem $wpFolder "map_preview"
                    if ($previewFolder) {
                        foreach ($pItem in $previewFolder.GetFolder.Items()) {
                            if ($pItem.IsFolder) {
                                $prevJpg = $pItem.GetFolder.Items() | Where-Object { $_.Name -like "*.jpg" -or $_.Name -like "*.png" } | Where-Object { $_.Name -notlike "_old_*" } | Select-Object -First 1
                                if (-not $prevJpg) {
                                    $prevJpg = $pItem.GetFolder.Items() | Where-Object { $_.Name -like "*.jpg" -or $_.Name -like "*.png" } | Select-Object -First 1
                                }
                                if ($prevJpg) {
                                    Write-Host "  [V] RC 2 Map Preview: map_preview\$($pItem.Name)\$($prevJpg.Name)" -ForegroundColor Green
                                    $pOutDir = "$OutputDir\rc2_map_preview\$($pItem.Name)"
                                    if (-not (Test-Path $pOutDir)) { New-Item -ItemType Directory -Path $pOutDir -Force | Out-Null }
                                    $shell.Namespace($pOutDir).CopyHere($prevJpg, 16)
                                }
                            }
                        }
                    }
                }
            }

            # 2c. Extract Flight Record Database
            if ($dbFolder) {
                $dbItem = $dbFolder.GetFolder.Items() | Where-Object { $_.Name -eq "flightrecord_db_0.0.1.db" } | Select-Object -First 1
                if ($dbItem) {
                    Write-Host "  [V] RC 2 Flight Database: flightrecord_db_0.0.1.db" -ForegroundColor Green
                    $shell.Namespace($OutputDir).CopyHere($dbItem, 16)
                }
            }
        }
    }
}

# 3. Analyze and Parse Extracted Information
Write-Host "`n[3/3] Analyzing Extracted Flight Mission Data..." -ForegroundColor Yellow

$pythonScript = @"
import os
import glob
import zipfile
import re
import sqlite3

out_dir = r'$OutputDir'

print('\n==================== FLIGHT MISSION ANALYSIS ====================')

# 1. Analyze latest KMZs
kmz_files = glob.glob(os.path.join(out_dir, '**', '*.kmz'), recursive=True)
if not kmz_files:
    kmz_files = glob.glob(os.path.join(out_dir, '*.kmz'))

for k in kmz_files:
    rel_path = os.path.relpath(k, out_dir)
    print(f'\n[*] Mission KMZ: {rel_path}')
    try:
        with zipfile.ZipFile(k, 'r') as z:
            names = z.namelist()
            if 'wpmz/waylines.wpml' in names:
                wpml_content = z.read('wpmz/waylines.wpml').decode('utf-8', errors='ignore')
                
                # Drone Enum
                drone_m = re.search(r'<wpml:droneEnumValue>(\d+)</wpml:droneEnumValue>', wpml_content)
                drone_val = drone_m.group(1) if drone_m else 'Unknown'
                drone_name = 'DJI Mini 4 Pro (68)' if drone_val == '68' else ('DJI Air 3 (89)' if drone_val == '89' else f'Enterprise/Other ({drone_val})')
                
                # Speed & Finish Action
                speed_m = re.search(r'<wpml:globalTransitionalSpeed>([0-9.]+)</wpml:globalTransitionalSpeed>', wpml_content)
                finish_m = re.search(r'<wpml:finishAction>(\w+)</wpml:finishAction>', wpml_content)
                
                # Placemarks / Waypoints
                placemarks = re.findall(r'<Placemark>.*?</Placemark>', wpml_content, re.DOTALL)
                
                print(f'    - Drone Target:       {drone_name}')
                print(f'    - Waypoints Count:    {len(placemarks)}')
                print(f'    - Global Speed:       {speed_m.group(1) if speed_m else "Default"} m/s')
                print(f'    - Finish Action:      {finish_m.group(1) if finish_m else "goHome"}')
                
                # Sample Waypoints
                if placemarks:
                    first_coords = re.search(r'<coordinates>\s*([0-9.,-]+)\s*</coordinates>', placemarks[0])
                    first_heading = re.search(r'<wpml:waypointHeadingMode>(\w+)</wpml:waypointHeadingMode>', placemarks[0])
                    first_angle = re.search(r'<wpml:waypointHeadingAngle>([0-9.]+)</wpml:waypointHeadingAngle>', placemarks[0])
                    first_pitch = re.search(r'<wpml:waypointGimbalPitchAngle>([0-9.-]+)</wpml:waypointGimbalPitchAngle>', placemarks[0])
                    
                    print(f'    - Waypoint #0 Coord:  {first_coords.group(1) if first_coords else "N/A"} (Lon,Lat,Alt)')
                    print(f'    - Heading Mode:       {first_heading.group(1) if first_heading else "N/A"} (Angle: {first_angle.group(1) if first_angle else "N/A"} deg)')
                    print(f'    - Gimbal Pitch:       {first_pitch.group(1) if first_pitch else "N/A"} deg')
                    
                    # Check for POI
                    poi_m = re.search(r'<wpml:waypointPoiPoint>([0-9.,-]+)</wpml:waypointPoiPoint>', placemarks[0])
                    if poi_m and poi_m.group(1) != '0.000000,0.000000,0.000000':
                        print(f'    - Waypoint POI Point: {poi_m.group(1)}')
    except Exception as e:
        print(f'    [!] Error parsing KMZ: {e}')

# 2. Analyze latest Flight Logs
log_files = glob.glob(os.path.join(out_dir, 'FlightRecord_*.txt')) + glob.glob(os.path.join(out_dir, 'local_FlightRecord_*.txt'))
if log_files:
    print('\n[*] Flight Telemetry Logs:')
    for log in log_files:
        size_kb = os.path.getsize(log) / 1024.0
        print(f'    - {os.path.basename(log)} ({size_kb:.1f} KB)')

# 3. Analyze SQLite DB Records if present
db_file = os.path.join(out_dir, 'flightrecord_db_0.0.1.db')
if os.path.exists(db_file):
    try:
        conn = sqlite3.connect(db_file)
        cur = conn.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = [t[0] for t in cur.fetchall()]
        if 'records' in tables:
            cur.execute("SELECT count(*) FROM records")
            rec_count = cur.fetchone()[0]
            print(f'\n[*] RC 2 Internal Flight Database:')
            print(f'    - Telemetry Records in DB: {rec_count}')
        conn.close()
    except Exception as e:
        pass

print('\n[V] Extraction Complete! Files stored in: ' + out_dir)
print('=================================================================\n')
"@

$pyFile = "$OutputDir\analyze_flight.py"
[System.IO.File]::WriteAllText($pyFile, $pythonScript)
python $pyFile
