/**
 * Aalaapi Sky Companion Bridge - POSIX (Linux / macOS / Android Termux) OS Driver
 *
 * Extends BaseCompanionDriver with POSIX-specific implementations:
 * - ADB device inspection & mission sync
 * - lsusb (Linux) / system_profiler (macOS) RTL-SDR USB inspection
 * - /sys/class/video4linux (Linux V4L2) / system_profiler SPCameraDataType (macOS) camera enumeration
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, execSync } = require('node:child_process');
const { BaseCompanionDriver } = require('./BaseCompanionDriver');

class PosixCompanionDriver extends BaseCompanionDriver {
  constructor(platform = process.platform) {
    super(platform);
  }

  checkRtlSdrHardware() {
    const result = super.checkRtlSdrHardware();
    if (this.platform === 'linux' || this.platform === 'android') {
      try {
        const out = execSync('lsusb', { encoding: 'utf8', timeout: 3000 });
        if (/0bda:2838|0bda:2832/i.test(out)) {
          result.detected = true;
          result.driverStatus = 'ready';
          result.deviceName = 'Realtek RTL2832U / RTL-SDR';
          result.details = 'RTL-SDR USB dongle detected via lsusb.';
        }
      } catch (_) {}
    } else if (this.platform === 'darwin') {
      try {
        const out = execSync('system_profiler SPUSBDataType', { encoding: 'utf8', timeout: 3500 });
        if (/0x0bda/i.test(out) && /0x2838|0x2832/i.test(out)) {
          result.detected = true;
          result.driverStatus = 'ready';
          result.deviceName = 'Realtek RTL2832U / RTL-SDR';
          result.details = 'RTL-SDR USB dongle detected via macOS system_profiler.';
        }
      } catch (_) {}
    }
    return result;
  }

  enumerateRawVideoCaptureDevices() {
    if (this.platform === 'linux' || this.platform === 'android') {
      try {
        const v4lDir = '/sys/class/video4linux';
        if (fs.existsSync(v4lDir)) {
          const dirs = fs.readdirSync(v4lDir)
            .filter(d => /^video\d+$/.test(d))
            .sort((a, b) => parseInt(a.replace('video', ''), 10) - parseInt(b.replace('video', ''), 10));

          if (dirs.length > 0) {
            const raw = [];
            for (const d of dirs) {
              const idx = parseInt(d.replace('video', ''), 10);
              const nameFile = path.join(v4lDir, d, 'name');
              let devName = `Video Device ${idx}`;
              if (fs.existsSync(nameFile)) {
                try { devName = fs.readFileSync(nameFile, 'utf8').trim() || devName; } catch (_) {}
              }
              raw.push({ FriendlyName: devName, InstanceId: `/dev/${d}` });
            }
            return raw;
          }
        }
      } catch (_) {}
    } else if (this.platform === 'darwin') {
      try {
        const out = execFileSync('system_profiler', ['SPCameraDataType', '-json'], {
          timeout: 3500,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore']
        });
        if (out && out.trim()) {
          const parsed = JSON.parse(out.trim());
          const cams = parsed?.SPCameraDataType || [];
          if (cams.length > 0) {
            return cams.map((c, i) => ({
              FriendlyName: c._name || `Camera ${i}`,
              InstanceId: c.spcamera_unique_id || null
            }));
          }
        }
      } catch (_) {}
    }
    return [];
  }
}

module.exports = { PosixCompanionDriver };
