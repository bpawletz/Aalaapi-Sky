/**
 * Aalaapi Sky Companion Bridge - Base OS Driver
 *
 * Defines the common server-side hardware and OS abstraction interface.
 * Subclasses (Win32CompanionDriver, PosixCompanionDriver) override platform-specific
 * implementations for USB MTP/ADB, RTL-SDR USB enumeration, video capture discovery,
 * BLE/Wi-Fi RF scanners, and firewall inspection.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');

class BaseCompanionDriver {
  constructor(platform = process.platform) {
    this.platform = platform;
    this.isWindows = platform === 'win32';
  }

  supportsNativeBleScanner() {
    return false;
  }

  supportsNativeWifiScanner() {
    return false;
  }

  // ─── 1. MTP / ADB Controller File Transfer ──────────────────────────────────
  runMtpScript(_scriptContent, _timeoutMs = 45000) {
    return Promise.resolve({
      success: false,
      error: `PowerShell COM bridge is only available on Windows (${this.platform} detected).`
    });
  }

  runAdbCommand(args) {
    return new Promise((resolve) => {
      execFile('adb', args, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) {
          resolve({ success: false, error: stderr ? stderr.trim() : error.message });
        } else {
          resolve({ success: true, stdout: stdout ? stdout.trim() : '' });
        }
      });
    });
  }

  async checkRc2AdbStatus() {
    const devRes = await this.runAdbCommand(['devices']);
    if (!devRes.success || !devRes.stdout) {
      return { connected: false, error: devRes.error || 'ADB not available' };
    }

    const lines = devRes.stdout.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('List of devices'));
    const activeDevice = lines.find(l => l.endsWith('device'));
    if (!activeDevice) {
      return { connected: false, error: 'No authorized ADB device found' };
    }

    const serial = activeDevice.split(/\s+/)[0];
    const wpPath = '/sdcard/Android/data/dji.go.v5/files/waypoint';
    const lsRes = await this.runAdbCommand(['-s', serial, 'shell', `ls -1 ${wpPath}`]);

    let activeMissions = [];
    if (lsRes.success && lsRes.stdout) {
      activeMissions = lsRes.stdout
        .split('\n')
        .map(m => m.trim())
        .filter(m => /^[A-F0-9]{8}-/i.test(m));
    }

    return {
      connected: true,
      deviceName: `DJI RC 2 (ADB: ${serial})`,
      activeMissions,
      waypointReady: lsRes.success
    };
  }

  async transferToRc2ViaAdb(uuid, kmzPath) {
    const adbCheck = await this.checkRc2AdbStatus();
    if (!adbCheck.connected) {
      return { success: false, error: 'DJI RC 2 not connected via ADB on ' + this.platform };
    }
    const targetUUID = uuid;
    const remoteDir = `/sdcard/Android/data/dji.go.v5/files/waypoint/${targetUUID}`;
    await this.runAdbCommand(['shell', `mkdir -p ${remoteDir}`]);
    const pushRes = await this.runAdbCommand(['push', kmzPath, `${remoteDir}/${targetUUID}.kmz`]);
    if (pushRes.success) {
      return {
        success: true,
        uuid: targetUUID,
        verified: true,
        message: `Mission KMZ successfully synced to DJI RC 2 slot ${targetUUID} via ADB!`
      };
    }
    return { success: false, error: pushRes.error || 'Failed to push KMZ via ADB' };
  }

  async pullFromRc2ViaAdb(requestedUuid = '', stagingDir) {
    const adbCheck = await this.checkRc2AdbStatus();
    if (!adbCheck.connected) {
      return { success: false, error: 'DJI RC 2 not connected via ADB on ' + this.platform };
    }
    let targetUuid = requestedUuid;
    if (!targetUuid && adbCheck.activeMissions && adbCheck.activeMissions.length > 0) {
      targetUuid = adbCheck.activeMissions[0];
    }
    if (!targetUuid) {
      return { success: false, error: 'No mission slot found on RC 2.' };
    }
    if (stagingDir && !fs.existsSync(stagingDir)) {
      fs.mkdirSync(stagingDir, { recursive: true });
    }
    const targetLocalPath = path.join(stagingDir || '.', `pulled_${targetUuid}.kmz`);
    const remoteKmz = `/sdcard/Android/data/dji.go.v5/files/waypoint/${targetUuid}/${targetUuid}.kmz`;
    const pullRes = await this.runAdbCommand(['pull', remoteKmz, targetLocalPath]);
    if (!pullRes.success || !fs.existsSync(targetLocalPath)) {
      return { success: false, error: pullRes.error || 'Failed to pull KMZ from RC 2 via ADB' };
    }
    return {
      success: true,
      uuid: targetUuid,
      fileName: `${targetUuid}.kmz`,
      waylinesWpml: ''
    };
  }

  // ─── 2. RTL-SDR USB Hardware Inspection ─────────────────────────────────────
  checkRtlSdrHardware() {
    return {
      detected: false,
      driverStatus: 'not_found',
      deviceName: null,
      details: 'No RTL-SDR USB dongle detected.'
    };
  }

  // ─── 3. Video Capture Device Enumeration ────────────────────────────────────
  enumerateRawVideoCaptureDevices() {
    return [];
  }

  // ─── 4. Inbound Firewall Rule Check ─────────────────────────────────────────
  checkFirewallRule(ruleName = 'Aalaapi Sky RTMP Ingest', port = 1935) {
    return {
      open: true,
      platform: this.platform,
      rule: ruleName,
      port,
      message: 'Non-Windows host; local firewall rules managed by OS packet filter.'
    };
  }

  // ─── 5. Process & Port Cleanup ──────────────────────────────────────────────
  killPortProcess(_port) {
    return Promise.resolve();
  }
}

module.exports = { BaseCompanionDriver };
