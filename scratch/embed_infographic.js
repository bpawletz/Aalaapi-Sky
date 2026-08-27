const fs = require('fs');
const path = require('path');

const imgPath = path.resolve('scratch', 'rc2_options_guide_opt.jpg');
const b64 = fs.readFileSync(imgPath).toString('base64');
const dataUri = `data:image/jpeg;base64,${b64}`;

const templatePath = path.resolve('index_template.html');
let content = fs.readFileSync(templatePath, 'utf8');

// 1. Update line 72 header badge
content = content.replace(
  /<span class="header-version-badge"[^>]*>v[0-9\.]+<\/span>/,
  '<span class="header-version-badge" style="font-size: 0.65rem; background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 999px; padding: 2px 7px; font-weight: 700; letter-spacing: 0.03em; vertical-align: middle; margin-left: 6px;">v1.42.0</span>'
);

// 2. Insert Infographic container right above Mode Navigation Tabs in guide modal
const targetMarker = '<!-- Mode Navigation Tabs -->';
const infographicHtml = `<!-- Transfer Options Visual Infographic -->
        <div class="guide-infographic-container">
          <img id="guide-options-img" src="${dataUri}" alt="Aalaapi Sky 3 DJI RC 2 Transfer Options Infographic" />
        </div>

        <!-- Mode Navigation Tabs -->`;

if (!content.includes('guide-infographic-container')) {
  content = content.replace(targetMarker, infographicHtml);
}

// 3. Update About modal version tag
content = content.replace(
  /<span class="version-tag"[^>]*>Version [0-9\.]+<\/span>/,
  '<span class="version-tag" style="background: rgba(56, 189, 248, 0.12); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); font-size: 0.72rem; font-weight: 700; padding: 3px 8px; border-radius: 999px;">Version 1.42.0</span>'
);

// 4. Update About modal changelog list
const v142Changelog = `          <div>
            <strong style="color: var(--text-main);">Changelog (v1.42.0):</strong>
            <ul style="padding-left: 16px; margin-top: 4px; display: flex; flex-direction: column; gap: 3px; color: var(--text-muted); list-style-type: disc;">
              <li><strong>Embedded RC 2 Sync Options Infographic in App Guide Modal:</strong> Embedded high-resolution visual comparison diagram directly into the RC 2 Guide modal header, showing 1-Click Direct Sync, Auto-Sync Watcher, and Manual Transfer workflows side-by-side with zero external image dependencies.</li>
            </ul>
          </div>
          <div style="border-top: 1px solid rgba(255, 255, 255, 0.06); padding-top: 8px;">
            <strong style="color: var(--text-main);">Changelog (v1.41.0):</strong>`;

content = content.replace(
  `          <div>\n            <strong style="color: var(--text-main);">Changelog (v1.41.0):</strong>`,
  v142Changelog
);

fs.writeFileSync(templatePath, content, 'utf8');
console.log('Successfully updated index_template.html with embedded infographic and v1.42.0!');
