const path = require('path');
const { execFile } = require('child_process');

function runMtpScript(scriptContent) {
  return new Promise((resolve) => {
    const encodedCommand = Buffer.from(scriptContent, 'utf16le').toString('base64');
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodedCommand],
      { maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        console.log('STDOUT:', stdout);
        console.log('STDERR:', stderr);
        if (error) console.log('ERROR:', error);
        resolve({ stdout, stderr });
      }
    );
  });
}

const STAGING_DIR = path.resolve('scratch/companion_staging');
const uuid = '354A8F93-759C-42C3-A8D5-746F79C7622A';
const kmzPath = path.join(STAGING_DIR, `${uuid}.kmz`);
const jpgPath = path.join(STAGING_DIR, `${uuid}.jpg`);

const psScript = `
$kmzFile = "${kmzPath.replace(/\\/g, '\\\\')}"
Write-Output "Checking kmzFile: $kmzFile"
Write-Output "Test-Path: $(Test-Path $kmzFile)"
`;

runMtpScript(psScript);
