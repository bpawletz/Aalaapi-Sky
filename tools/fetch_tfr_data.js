/**
 * tools/fetch_tfr_data.js
 * 
 * Fetches the latest active FAA Temporary Flight Restrictions (TFR) NOTAM list
 * and GeoServer boundary GeoJSON directly from FAA official endpoints, saving
 * them to data/tfr_notams.json and data/tfr_geojson.json.
 * 
 * This enables client-side browsers on static hosting (such as GitHub Pages)
 * to load and display live TFRs without CORS blocks or reliance on external proxies.
 */

const fs = require('fs');
const path = require('path');

async function fetchWithTimeout(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*'
      }
    });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

async function updateTfrData() {
  const projectRoot = path.resolve(__dirname, '..');
  const dataDir = path.join(projectRoot, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  let notamsUpdated = false;
  let geoUpdated = false;

  // 1. Fetch FAA NOTAM List
  try {
    console.log('[TFR Fetch] Querying FAA getTfrList API...');
    const notamRes = await fetchWithTimeout('https://tfr.faa.gov/tfrapi/getTfrList', 12000);
    if (notamRes.ok) {
      const notams = await notamRes.json();
      if (Array.isArray(notams) && notams.length > 0) {
        const notamsPath = path.join(dataDir, 'tfr_notams.json');
        fs.writeFileSync(notamsPath, JSON.stringify(notams, null, 2), 'utf8');
        console.log(`[TFR Fetch] Saved ${notams.length} NOTAM records to ${notamsPath}`);
        notamsUpdated = true;
      } else {
        console.warn('[TFR Fetch] NOTAM response was empty or not an array');
      }
    } else {
      console.warn(`[TFR Fetch] FAA getTfrList HTTP ${notamRes.status}`);
    }
  } catch (err) {
    console.warn(`[TFR Fetch] Warning: Could not refresh NOTAM list (${err.message}). Preserving existing cache.`);
  }

  // 2. Fetch FAA GeoServer TFR Boundaries (GeoJSON)
  try {
    console.log('[TFR Fetch] Querying FAA GeoServer WFS TFR Boundaries...');
    const wfsUrl = 'https://tfr.faa.gov/geoserver/TFR/ows?service=WFS&version=1.1.0&request=GetFeature&typeName=TFR:V_TFR_LOC&maxFeatures=500&outputFormat=application/json';
    const geoRes = await fetchWithTimeout(wfsUrl, 20000);
    if (geoRes.ok) {
      const geo = await geoRes.json();
      if (geo && Array.isArray(geo.features) && geo.features.length > 0) {
        const geoPath = path.join(dataDir, 'tfr_geojson.json');
        fs.writeFileSync(geoPath, JSON.stringify(geo, null, 2), 'utf8');
        console.log(`[TFR Fetch] Saved ${geo.features.length} GeoJSON features to ${geoPath}`);
        geoUpdated = true;
      } else {
        console.warn('[TFR Fetch] GeoServer response contained no features');
      }
    } else {
      console.warn(`[TFR Fetch] FAA GeoServer HTTP ${geoRes.status}`);
    }
  } catch (err) {
    console.warn(`[TFR Fetch] Warning: Could not refresh GeoServer boundaries (${err.message}). Preserving existing cache.`);
  }

  return { notamsUpdated, geoUpdated };
}

if (require.main === module) {
  updateTfrData()
    .then(({ notamsUpdated, geoUpdated }) => {
      console.log(`[TFR Fetch] Done. NOTAMs updated: ${notamsUpdated}, GeoJSON updated: ${geoUpdated}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('[TFR Fetch] Fatal error:', err);
      process.exit(1);
    });
}

module.exports = { updateTfrData };
