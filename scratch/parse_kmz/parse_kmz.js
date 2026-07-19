const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const projectRoot = 'C:\\Users\\bpawl\\OneDrive\\code\\Aalaapi-Sky';
const dirsToScan = [
  projectRoot,
  path.join(projectRoot, 'scratch', 'reference-kmz'),
  path.join(projectRoot, 'error')
];

const kmzFiles = [];
for (const dir of dirsToScan) {
  if (fs.existsSync(dir)) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      if (file.endsWith('.kmz')) {
        kmzFiles.push(path.join(dir, file));
      }
    }
  }
}

let report = '# KMZ Parsing Report\n\n';

const speedMap = {
  '0.5': 'REF-01',
  '0.9': 'REF-02',
  '1.4': 'REF-03',
  '1.8': 'REF-04',
  '2.3': 'REF-05',
  '2.7': 'REF-06',
  '3.2': 'REF-07',
  '3.6': 'REF-08',
  '4.1': 'REF-09',
  '4.5': 'REF-10',
  '5.9': 'REF-13',
  '6.3': 'REF-14',
  '6.8': 'REF-15',
  '7.2': 'REF-16',
  '7.6': 'REF-17',
  '8.1': 'REF-18',
  '8.7': 'REF-19',
  '9.0': 'REF-20',
  '9.4': 'REF-21',
  '10.0': 'REF-22',
  '10.4': 'REF-23',
  '10.8': 'REF-24',
  '11.2': 'REF-25',
  '12.0': 'REF-26'
};

const results = [];

for (const file of kmzFiles) {
  try {
    const zip = new AdmZip(file);
    const zipEntries = zip.getEntries();
    
    let combinedContent = '';
    let waylinesContent = '';
    for (const zipEntry of zipEntries) {
      if (zipEntry.entryName === 'wpmz/waylines.wpml' || zipEntry.entryName === 'wpmz/template.kml') {
        const text = zip.readAsText(zipEntry);
        combinedContent += text;
        if (zipEntry.entryName === 'wpmz/waylines.wpml') {
          waylinesContent = text;
        }
      }
    }
    
    if (combinedContent) {
      const speedMatch = combinedContent.match(/<wpml:(?:autoFlightSpeed|globalTransitionalSpeed)>(.*?)<\/wpml:(?:autoFlightSpeed|globalTransitionalSpeed)>/);
      const speed = speedMatch ? parseFloat(speedMatch[1]) : null;
      
      let refId = 'UNKNOWN';
      if (speed) {
        const speedKey = speed.toFixed(1);
        refId = speedMap[speedKey] || `UNKNOWN (${speed} m/s)`;
      }

      results.push({ file: path.basename(file), refId, speed, content: waylinesContent });
    } else {
      console.log(`No waylines.wpml found in ${file}`);
    }
  } catch (err) {
    console.error(`Error processing ${file}: ${err.message}`);
  }
}

// Sort by REF ID
results.sort((a, b) => a.refId.localeCompare(b.refId));

for (const res of results) {
  report += `## ${res.refId} (Speed: ${res.speed} m/s) - ${res.file}\n`;
  report += "```xml\n";
  // Just dump the whole thing, or relevant tags. It's usually small (100-200 lines).
  report += res.content + "\n";
  report += "```\n\n";
}

fs.writeFileSync('C:\\Users\\bpawl\\OneDrive\\code\\Aalaapi-Sky\\scratch\\parse_kmz\\report.md', report);
console.log('Report generated at scratch\\parse_kmz\\report.md');
