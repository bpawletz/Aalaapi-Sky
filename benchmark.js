const { JSDOM } = require('jsdom');
const { performance } = require('perf_hooks');

const dom = new JSDOM(`<!DOCTYPE html><input id="gimbal-pitch" value="45" />`);
const document = dom.window.document;

const generatedWaypoints = Array.from({ length: 10000 }, (_, i) => ({
  lat: 0, lon: 0, idx: i, alt: 100, heading: 90,
  mapMarker: {
    setLatLng: () => {},
    setTooltipContent: () => {}
  }
}));

const formatDistance = (val, dec) => `${val}`;

function runBaseline() {
  const start = performance.now();
  for (let i = 0; i < 100; i++) {
    generatedWaypoints.forEach((gwp) => {
      if (gwp.mapMarker) {
        gwp.mapMarker.setLatLng([gwp.lat, gwp.lon]);
        const gPitch = gwp.pitch !== undefined && gwp.pitch !== null ? gwp.pitch : parseFloat(document.getElementById('gimbal-pitch').value);
        const tooltipContent = `Drone Waypoint ${gwp.idx}<br>Height: ${formatDistance(gwp.alt, 0)}<br>Yaw: ${gwp.heading.toFixed(0)}°<br>Pitch: ${gPitch}°`;
        gwp.mapMarker.setTooltipContent(tooltipContent);
      }
    });
  }
  return performance.now() - start;
}

function runOptimized() {
  const start = performance.now();
  for (let i = 0; i < 100; i++) {
    const defaultPitch = parseFloat(document.getElementById('gimbal-pitch').value);
    generatedWaypoints.forEach((gwp) => {
      if (gwp.mapMarker) {
        gwp.mapMarker.setLatLng([gwp.lat, gwp.lon]);
        const gPitch = gwp.pitch !== undefined && gwp.pitch !== null ? gwp.pitch : defaultPitch;
        const tooltipContent = `Drone Waypoint ${gwp.idx}<br>Height: ${formatDistance(gwp.alt, 0)}<br>Yaw: ${gwp.heading.toFixed(0)}°<br>Pitch: ${gPitch}°`;
        gwp.mapMarker.setTooltipContent(tooltipContent);
      }
    });
  }
  return performance.now() - start;
}

// Warmup
runBaseline();
runOptimized();

const baseline = runBaseline();
const optimized = runOptimized();

console.log(`Baseline: ${baseline.toFixed(2)} ms`);
console.log(`Optimized: ${optimized.toFixed(2)} ms`);
console.log(`Improvement: ${((baseline - optimized) / baseline * 100).toFixed(2)}%`);
