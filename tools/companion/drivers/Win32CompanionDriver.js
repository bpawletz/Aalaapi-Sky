/**
 * Aalaapi Sky Companion Bridge - Windows (win32) OS Driver
 *
 * Extends BaseCompanionDriver with Windows-specific implementations:
 * - PowerShell Shell.Application COM MTP bridge for DJI RC 2 & Android phones
 * - .NET C# BLE & Wi-Fi scanner capability flags
 * - pnputil RTL-SDR USB & WinUSB/Zadig driver verification
 * - WinRT / Get-PnpDevice video capture device enumeration
 * - netsh advfirewall rule verification
 * - netstat + taskkill port process cleanup
 */

const { execFile, execFileSync, execSync } = require('node:child_process');
const { BaseCompanionDriver } = require('./BaseCompanionDriver');

class Win32CompanionDriver extends BaseCompanionDriver {
  constructor() {
    super('win32');
  }

  supportsNativeBleScanner() {
    return true;
  }

  supportsNativeWifiScanner() {
    return true;
  }

  runMtpScript(scriptContent, timeoutMs = 45000) {
    return new Promise((resolve) => {
      const encodedCommand = Buffer.from(scriptContent, 'utf16le').toString('base64');
      execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodedCommand],
        { maxBuffer: 10 * 1024 * 1024, timeout: timeoutMs },
        (error, stdout, stderr) => {
          if (error) {
            resolve({ success: false, error: stderr || error.message });
          } else {
            try {
              const data = JSON.parse(stdout.trim());
              resolve({ success: true, data });
            } catch (_) {
              resolve({ success: true, raw: stdout.trim() });
            }
          }
        }
      );
    });
  }

  checkRtlSdrHardware() {
    const result = super.checkRtlSdrHardware();
    try {
      const out = execSync('pnputil /enum-devices /connected', { encoding: 'utf8', timeout: 3000 });
      if (out.includes('0BDA&PID_2838') || out.includes('0BDA&PID_2832')) {
        result.detected = true;
        result.deviceName = 'Realtek RTL2832U / RTL-SDR';
        const blocks = out.split(/(?=Instance ID:)/g);
        const rtlBlocks = blocks.filter(b => b.includes('0BDA&PID_2838') || b.includes('0BDA&PID_2832'));
        const hasProblem = rtlBlocks.some(b => b.includes('Problem Code: 28') || b.includes('Status:                     Problem'));
        if (hasProblem) {
          result.driverStatus = 'needs_zadig';
          result.details = 'RTL-SDR USB dongle detected, but WinUSB driver is missing (Problem Code 28). Please run Zadig to install WinUSB driver.';
        } else {
          result.driverStatus = 'ready';
          result.details = 'RTL-SDR USB dongle detected and WinUSB driver is operational.';
        }
      }
    } catch (e) {
      result.driverStatus = 'error';
      result.details = e.message;
    }
    return result;
  }

  enumerateRawVideoCaptureDevices() {
    try {
      const psCmd = [
        'Add-Type -AssemblyName System.Runtime.WindowsRuntime;',
        '$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq "AsTask" -and $_.GetParameters().Count -eq 1 -and $_.GetGenericArguments().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name.StartsWith("IAsyncOperation") };',
        '[Windows.Devices.Enumeration.DeviceInformation, Windows.Devices.Enumeration, ContentType = WindowsRuntime] | Out-Null;',
        '$op = [Windows.Devices.Enumeration.DeviceInformation]::FindAllAsync([Windows.Devices.Enumeration.DeviceClass]::VideoCapture);',
        '$t = $asTask.MakeGenericMethod([Windows.Devices.Enumeration.DeviceInformationCollection]).Invoke($null, @($op));',
        '$t.Wait();',
        '$i = 0;',
        '$res = @(foreach ($d in $t.Result) { if ($d.IsEnabled) { [PSCustomObject]@{ FriendlyName = $d.Name; InstanceId = $d.Id; DeviceIndex = $i }; $i++ } });',
        '$res | ConvertTo-Json -Compress'
      ].join(' ');

      const out = execFileSync(
        'powershell.exe',
        ['-NoProfile', '-Command', psCmd],
        { timeout: 5000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
      );
      if (out && out.trim()) {
        const parsed = JSON.parse(out.trim());
        return Array.isArray(parsed) ? parsed : [parsed];
      }
    } catch (_) {
      try {
        const out = execFileSync(
          'powershell.exe',
          ['-NoProfile', '-Command', 'Get-PnpDevice -Class Camera, Image | Where-Object Status -eq OK | Select-Object FriendlyName, InstanceId | ConvertTo-Json'],
          { timeout: 3500, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
        );
        if (out && out.trim()) {
          const parsed = JSON.parse(out.trim());
          return Array.isArray(parsed) ? parsed : [parsed];
        }
      } catch (_) {}
    }
    return [];
  }

  checkFirewallRule(ruleName = 'Aalaapi Sky RTMP Ingest', port = 1935) {
    try {
      const out = execSync(`netsh advfirewall firewall show rule name="${ruleName}"`, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
      });
      if (out && (out.includes(String(port)) || out.includes(ruleName))) {
        return {
          open: true,
          platform: 'win32',
          rule: ruleName,
          port,
          message: `Inbound firewall rule '${ruleName}' is active on port ${port}.`
        };
      }
    } catch (_) {}
    return {
      open: false,
      platform: 'win32',
      rule: ruleName,
      port,
      command: `netsh advfirewall firewall add rule name="${ruleName}" dir=in action=allow protocol=TCP localport=${port} profile=any description="Allows inbound RTMP video streaming from DJI RC 2 to Aalaapi Sky Companion"`,
      message: `Inbound firewall rule for port ${port} not found. Elevation required to configure.`
    };
  }

  killPortProcess(port) {
    return new Promise((resolve) => {
      try {
        const netstatOut = execFileSync('cmd.exe', ['/c', `netstat -ano | findstr :${port}`], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore']
        });
        const lines = netstatOut.trim().split('\n');
        for (const line of lines) {
          if (line.includes('LISTENING')) {
            const parts = line.trim().split(/\s+/);
            const pid = parts[parts.length - 1];
            if (pid && pid !== `${process.pid}` && pid !== '0') {
              try {
                execFileSync('taskkill.exe', ['/F', '/PID', pid], { stdio: 'ignore' });
                setTimeout(resolve, 600);
                return;
              } catch (_) {}
            }
          }
        }
      } catch (_) {}
      resolve();
    });
  }
}

module.exports = { Win32CompanionDriver };
