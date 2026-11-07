#!/usr/bin/env node
/**
 * Aalaapi Sky - Automated Android APK Push & Install Utility
 * Automatically finds adb, locates the latest APK build, installs via adb (-r -d),
 * and launches com.aalaapi.sky on the attached device.
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const APP_PACKAGE = 'com.aalaapi.sky';
const MAIN_ACTIVITY = 'com.aalaapi.sky/.MainActivity';

function findAdb() {
    // 1. Try which/where
    try {
        const cmd = process.platform === 'win32' ? 'where.exe adb' : 'which adb';
        const res = execSync(cmd, { stdio: ['pipe', 'pipe', 'ignore'], encoding: 'utf8' }).trim();
        const first = res.split(/\r?\n/)[0];
        if (first && fs.existsSync(first)) return first;
    } catch (_) {}

    // 2. Platform specific paths
    const candidates = [];
    if (process.platform === 'win32') {
        const localAppData = process.env.LOCALAPPDATA || '';
        candidates.push(
            path.join(localAppData, 'Microsoft', 'WinGet', 'Packages', 'Google.PlatformTools_Microsoft.Winget.Source_8wekyb3d8bbwe', 'platform-tools', 'adb.exe'),
            path.join(localAppData, 'Android', 'Sdk', 'platform-tools', 'adb.exe')
        );
        if (process.env.ANDROID_HOME) {
            candidates.push(path.join(process.env.ANDROID_HOME, 'platform-tools', 'adb.exe'));
        }
    } else {
        const home = os.homedir();
        candidates.push(
            path.join(home, 'Android', 'Sdk', 'platform-tools', 'adb'),
            path.join(home, 'Library', 'Android', 'sdk', 'platform-tools', 'adb')
        );
        if (process.env.ANDROID_HOME) {
            candidates.push(path.join(process.env.ANDROID_HOME, 'platform-tools', 'adb'));
        }
    }

    for (const c of candidates) {
        if (c && fs.existsSync(c)) return c;
    }

    return null;
}

function getConnectedDevices(adbPath) {
    try {
        const out = execSync(`"${adbPath}" devices`, { encoding: 'utf8' });
        const lines = out.split(/\r?\n/).filter(l => l.trim() && !l.startsWith('List of devices'));
        const devices = [];
        for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 2 && parts[1] === 'device') {
                devices.push(parts[0]);
            }
        }
        return devices;
    } catch (err) {
        console.error(`[ERROR] Failed to query adb devices:`, err.message);
        return [];
    }
}

function extractApkFromZip(zipPath) {
    try {
        const rootDir = path.resolve(__dirname, '..', '..');
        const outDir = path.join(rootDir, 'scratch', 'unpacked-apk');
        fs.mkdirSync(outDir, { recursive: true });
        console.log(`📦 Unpacking APK artifact from ${path.basename(zipPath)}...`);
        execSync(`tar -xf "${zipPath}" -C "${outDir}"`, { stdio: 'pipe' });
        const extracted = fs.readdirSync(outDir).filter(f => f.endsWith('.apk'));
        if (extracted.length > 0) {
            return path.join(outDir, extracted[0]);
        }
    } catch (err) {
        console.warn(`⚠️ Failed to extract zip with tar:`, err.message);
    }
    return null;
}

function findApk(customPath) {
    if (customPath) {
        const resolved = path.resolve(customPath);
        if (resolved.endsWith('.zip')) {
            const extracted = extractApkFromZip(resolved);
            if (extracted) return extracted;
        }
        if (fs.existsSync(resolved)) return resolved;
        console.error(`[ERROR] Specified APK not found at: ${resolved}`);
        process.exit(1);
    }

    // Search common build and download paths
    const rootDir = path.resolve(__dirname, '..', '..');
    const downloadsDir = path.join(os.homedir(), 'Downloads');

    const searchDirs = [
        path.join(rootDir, 'android', 'app', 'build', 'outputs', 'apk', 'debug'),
        path.join(rootDir, 'scratch'),
        path.join(rootDir, 'dist'),
        downloadsDir,
        path.join(downloadsDir, 'AalaapiSky-debug-apk')
    ];

    const apkCandidates = [];

    for (const dir of searchDirs) {
        if (!fs.existsSync(dir)) continue;
        try {
            const files = fs.readdirSync(dir);
            for (const f of files) {
                const full = path.join(dir, f);
                try {
                    const stat = fs.statSync(full);
                    if (f.endsWith('.apk') && (f.includes('debug') || f.includes('Aalaapi') || f.includes('app-'))) {
                        apkCandidates.push({ path: full, mtime: stat.mtimeMs, isZip: false });
                    } else if (f.endsWith('.zip') && (f.toLowerCase().includes('aalaapisky') || f.toLowerCase().includes('apk'))) {
                        apkCandidates.push({ path: full, mtime: stat.mtimeMs, isZip: true });
                    }
                } catch (_) {}
            }
        } catch (_) {}
    }

    if (apkCandidates.length === 0) return null;

    // Pick newest valid candidate
    apkCandidates.sort((a, b) => b.mtime - a.mtime);
    for (const cand of apkCandidates) {
        if (cand.isZip) {
            const extracted = extractApkFromZip(cand.path);
            if (extracted) return extracted;
        } else {
            return cand.path;
        }
    }
    return null;
}

function main() {
    const args = process.argv.slice(2);
    let explicitApk = null;
    let explicitDevice = null;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--device' || args[i] === '-s') {
            explicitDevice = args[++i];
        } else if (args[i].endsWith('.apk') || (!args[i].startsWith('-') && !explicitApk)) {
            explicitApk = args[i];
        }
    }

    console.log(`🤖 Aalaapi Sky - Automated Android APK Push Utility`);

    const adbPath = findAdb();
    if (!adbPath) {
        console.error(`❌ [ERROR] ADB (Android Debug Bridge) not found!`);
        console.error(`   Please install via WinGet: 'winget install Google.PlatformTools' or add adb to your PATH.`);
        process.exit(1);
    }
    console.log(`🔍 Found ADB: ${adbPath}`);

    const devices = getConnectedDevices(adbPath);
    if (devices.length === 0) {
        console.error(`❌ [ERROR] No authorized Android device detected by ADB.`);
        console.error(`   1. Connect your Android tablet or RC 2 via USB-C cable.`);
        console.error(`   2. Ensure 'USB Debugging' is enabled in Developer Options.`);
        console.error(`   3. Accept the 'Allow USB debugging?' RSA prompt on the tablet screen.`);
        process.exit(1);
    }

    const targetDevice = explicitDevice || devices[0];
    console.log(`📱 Target Device: ${targetDevice} (${devices.length} device(s) connected)`);

    const apkPath = findApk(explicitApk);
    if (!apkPath) {
        console.error(`❌ [ERROR] No APK file found to install!`);
        console.error(`   Download the latest 'AalaapiSky-debug-apk' from GitHub Actions, or pass the path directly:`);
        console.error(`   npm run android:push -- path/to/app-debug.apk`);
        process.exit(1);
    }

    console.log(`📦 Installing APK: ${apkPath}`);
    console.log(`   Executing: adb -s ${targetDevice} install -r -d ...`);

    const installResult = spawnSync(adbPath, ['-s', targetDevice, 'install', '-r', '-d', apkPath], {
        stdio: 'inherit'
    });

    if (installResult.status !== 0) {
        console.error(`❌ [ERROR] APK installation failed (exit code ${installResult.status}).`);
        console.error(`   If this is the first install after switching to deterministic debug signing,`);
        console.error(`   please uninstall the old ephemeral build once: 'adb uninstall ${APP_PACKAGE}'`);
        process.exit(installResult.status || 1);
    }

    console.log(`✅ [SUCCESS] APK installed successfully!`);
    console.log(`🚀 Launching ${MAIN_ACTIVITY} on ${targetDevice}...`);

    const launchResult = spawnSync(adbPath, ['-s', targetDevice, 'shell', 'am', 'start', '-n', MAIN_ACTIVITY], {
        stdio: 'inherit'
    });

    if (launchResult.status === 0) {
        console.log(`🎉 Aalaapi Sky is now running on your device!`);
    } else {
        console.warn(`⚠️ App installed, but could not auto-launch. Please tap the Aalaapi Sky icon on your device.`);
    }
}

if (require.main === module) {
    main();
}

module.exports = { findAdb, getConnectedDevices, findApk };
