#!/usr/bin/env node
/**
 * Aalaapi Sky & Comms - Automated Android APK Push & Install Utility
 * Automatically finds adb, locates the latest APK builds for Aalaapi Sky and Aalaapi Comms,
 * installs via adb (-r -d), and launches the target application on the attached device.
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const APP_CONFIGS = {
    sky: {
        id: 'sky',
        name: 'Aalaapi Sky',
        package: 'com.aalaapi.sky',
        activity: 'com.aalaapi.sky/.MainActivity',
        zipPattern: /aalaapisky/i,
        apkPattern: /(app-debug|aalaapisky)/i,
        buildDir: path.join('android', 'app', 'build', 'outputs', 'apk', 'debug')
    },
    comms: {
        id: 'comms',
        name: 'Aalaapi Comms',
        package: 'com.aalaapi.comms',
        activity: 'com.aalaapi.comms/.CommsMainActivity',
        zipPattern: /aalaapicomms/i,
        apkPattern: /(comms-debug|aalaapicomms)/i,
        buildDir: path.join('android', 'comms', 'build', 'outputs', 'apk', 'debug')
    }
};

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

function findApkForApp(appKey, customPath) {
    const config = APP_CONFIGS[appKey];
    if (!config) return null;

    if (customPath) {
        const resolved = path.resolve(customPath);
        if (resolved.endsWith('.zip')) {
            const extracted = extractApkFromZip(resolved);
            if (extracted) return extracted;
        }
        if (fs.existsSync(resolved)) return resolved;
    }

    const rootDir = path.resolve(__dirname, '..', '..');
    const downloadsDir = path.join(os.homedir(), 'Downloads');

    const searchDirs = [
        path.join(rootDir, config.buildDir),
        downloadsDir,
        path.join(downloadsDir, `${config.name.replace(/\s+/g, '')}-debug-apk`),
        path.join(rootDir, 'dist'),
        path.join(rootDir, 'scratch'),
        path.join(rootDir, 'scratch', 'unpacked-apk')
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
                    if (f.endsWith('.apk') && config.apkPattern.test(f)) {
                        apkCandidates.push({ path: full, mtime: stat.mtimeMs, isZip: false });
                    } else if (f.endsWith('.zip') && config.zipPattern.test(f)) {
                        apkCandidates.push({ path: full, mtime: stat.mtimeMs, isZip: true });
                    }
                } catch (_) {}
            }
        } catch (_) {}
    }

    if (apkCandidates.length === 0) return null;

    apkCandidates.sort((a, b) => b.mtime - a.mtime);
    for (const cand of apkCandidates) {
        if (cand.isZip) {
            const extracted = extractApkFromZip(cand.path);
            if (extracted) {
                // If extracted has matches for this app, return it
                const outDir = path.dirname(extracted);
                const matching = fs.readdirSync(outDir).find(f => f.endsWith('.apk') && config.apkPattern.test(f));
                if (matching) return path.join(outDir, matching);
                return extracted;
            }
        } else {
            return cand.path;
        }
    }
    return null;
}

function installApk(adbPath, targetDevice, apkPath, appConfig) {
    console.log(`📦 Installing ${appConfig.name}: ${apkPath}`);
    console.log(`   Executing: adb -s ${targetDevice} install -r -d ...`);

    const installResult = spawnSync(adbPath, ['-s', targetDevice, 'install', '-r', '-d', apkPath], {
        stdio: 'inherit'
    });

    if (installResult.status !== 0) {
        console.error(`❌ [ERROR] ${appConfig.name} installation failed (exit code ${installResult.status}).`);
        console.error(`   If this is the first install, try: 'adb uninstall ${appConfig.package}'`);
        return false;
    }

    console.log(`✅ [SUCCESS] ${appConfig.name} installed successfully!`);
    return true;
}

function launchApp(adbPath, targetDevice, appConfig) {
    console.log(`🚀 Launching ${appConfig.activity} on ${targetDevice}...`);
    const launchResult = spawnSync(adbPath, ['-s', targetDevice, 'shell', 'am', 'start', '-n', appConfig.activity], {
        stdio: 'inherit'
    });

    if (launchResult.status === 0) {
        console.log(`🎉 ${appConfig.name} is now running on your device!`);
    } else {
        console.warn(`⚠️ ${appConfig.name} installed, but could not auto-launch. Please tap the icon on your device.`);
    }
}

function main() {
    const args = process.argv.slice(2);
    let explicitApk = null;
    let explicitDevice = null;
    let targetAppMode = 'auto'; // 'auto', 'sky', 'comms', 'all'

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--device' || args[i] === '-s') {
            explicitDevice = args[++i];
        } else if (args[i] === '--comms') {
            targetAppMode = 'comms';
        } else if (args[i] === '--sky') {
            targetAppMode = 'sky';
        } else if (args[i] === '--all') {
            targetAppMode = 'all';
        } else if (args[i] === '--app' && args[i + 1]) {
            targetAppMode = args[++i].toLowerCase();
        } else if (args[i].endsWith('.apk') || (!args[i].startsWith('-') && !explicitApk)) {
            explicitApk = args[i];
        }
    }

    console.log(`🤖 Aalaapi Sky & Comms - Automated Android APK Push Utility`);

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

    // Determine what to install
    const skyApk = (targetAppMode === 'auto' || targetAppMode === 'sky' || targetAppMode === 'all')
        ? findApkForApp('sky', explicitApk && targetAppMode === 'sky' ? explicitApk : null)
        : null;

    const commsApk = (targetAppMode === 'auto' || targetAppMode === 'comms' || targetAppMode === 'all')
        ? findApkForApp('comms', explicitApk && targetAppMode === 'comms' ? explicitApk : null)
        : null;

    if (!skyApk && !commsApk) {
        console.error(`❌ [ERROR] No APK files found to install!`);
        console.error(`   Download 'AalaapiSky-debug-apk' and/or 'AalaapiComms-debug-apk' from GitHub Actions,`);
        console.error(`   or pass the path directly: node tools/android/push_apk.js path/to/app.apk`);
        process.exit(1);
    }

    let installedSky = false;
    let installedComms = false;

    if (skyApk && (targetAppMode === 'auto' || targetAppMode === 'sky' || targetAppMode === 'all')) {
        installedSky = installApk(adbPath, targetDevice, skyApk, APP_CONFIGS.sky);
    }

    if (commsApk && (targetAppMode === 'auto' || targetAppMode === 'comms' || targetAppMode === 'all')) {
        installedComms = installApk(adbPath, targetDevice, commsApk, APP_CONFIGS.comms);
    }

    // Launch preference
    if (targetAppMode === 'comms' && installedComms) {
        launchApp(adbPath, targetDevice, APP_CONFIGS.comms);
    } else if (installedSky) {
        launchApp(adbPath, targetDevice, APP_CONFIGS.sky);
        if (installedComms) {
            console.log(`💡 Aalaapi Comms was also installed! You can launch it from your app drawer or from Aalaapi Sky's ADS-B Tuner Card.`);
        }
    } else if (installedComms) {
        launchApp(adbPath, targetDevice, APP_CONFIGS.comms);
    }
}

if (require.main === module) {
    main();
}

module.exports = { findAdb, getConnectedDevices, findApk: (explicitPath) => findApkForApp('sky', explicitPath), findApkForApp, APP_CONFIGS };
