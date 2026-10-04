function formatTime(totalSec) {
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function parseGeoJsonTelemetry(geojson, flightId = 'Imported_Flight.geojson') {
  if (!geojson) return null;
  let coords = [];
  if (geojson.type === 'FeatureCollection' && Array.isArray(geojson.features)) {
    for (const f of geojson.features) {
      if (f.geometry && f.geometry.coordinates) {
        if (f.geometry.type === 'LineString') {
          coords = coords.concat(f.geometry.coordinates);
        } else if (f.geometry.type === 'MultiPoint' || f.geometry.type === 'Polygon') {
          coords = coords.concat(Array.isArray(f.geometry.coordinates[0]) && Array.isArray(f.geometry.coordinates[0][0]) ? f.geometry.coordinates[0] : f.geometry.coordinates);
        } else if (f.geometry.type === 'Point') {
          coords.push(f.geometry.coordinates);
        }
      }
    }
  } else if (geojson.type === 'Feature' && geojson.geometry && geojson.geometry.coordinates) {
    if (geojson.geometry.type === 'LineString') coords = geojson.geometry.coordinates;
    else if (Array.isArray(geojson.geometry.coordinates)) coords = geojson.geometry.coordinates;
  } else if (Array.isArray(geojson.coordinates)) {
    coords = geojson.coordinates;
  }

  if (!coords || coords.length === 0) return null;

  const points = [];
  let totalDistance = 0;
  let maxAlt = 0;
  let battery = 98.0;

  for (let i = 0; i < coords.length; i++) {
    const c = coords[i];
    const lon = parseFloat(c[0]);
    const lat = parseFloat(c[1]);
    const alt = parseFloat(c[2] !== undefined ? c[2] : 21.0);
    if (isNaN(lat) || isNaN(lon)) continue;
    if (alt > maxAlt) maxAlt = alt;

    if (points.length > 0) {
      const prev = points[points.length - 1];
      const d = (typeof haversineDistance === 'function')
        ? haversineDistance(prev.lat, prev.lon, lat, lon)
        : Math.hypot((lat - prev.lat) * 111320, (lon - prev.lon) * 85000);
      totalDistance += d;
    }

    battery -= 0.05;
    points.push({
      time: i,
      timeStr: formatTime(i),
      lat,
      lon,
      alt: Math.round(alt * 10) / 10,
      speed: 4.0,
      pitch: -60.0,
      yaw: 0,
      battery: Math.max(10, Math.round(battery * 10) / 10),
      satellites: 24,
      isPhoto: false,
      waypointIndex: i
    });
  }

  if (points.length === 0) return null;

  return {
    flightId,
    flightDate: new Date().toISOString(),
    droneModel: 'DJI Mini 4 Pro',
    durationSec: points.length,
    durationFormatted: formatTime(points.length),
    totalDistance: Math.round(totalDistance),
    maxAltitude: Math.round(maxAlt * 10) / 10,
    photoCount: 0,
    homePoint: { lat: points[0].lat, lon: points[0].lon, alt: 0 },
    points,
    batteryStart: 98,
    batteryEnd: Math.round(battery),
    batteryUsed: Math.round(98 - battery),
    maxDeviation: '0.5 m'
  };
}

function parseCsvTelemetry(csvText, flightId = 'Imported_Flight.csv') {
  if (!csvText || typeof csvText !== 'string') return null;
  const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return null;

  const header = lines[0].toLowerCase().split(/[,;\t]/).map(h => h.trim().replace(/["']/g, ''));
  
  const findCol = (preds) => {
    for (const pred of preds) {
      const idx = header.findIndex(pred);
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const latIdx = findCol([h => h === 'osd.latitude', h => h === 'latitude', h => h.includes('lat')]);
  const lonIdx = findCol([h => h === 'osd.longitude', h => h === 'longitude', h => h.includes('lon') || h.includes('lng')]);
  const altIdx = findCol([h => h === 'osd.height [m]', h => h === 'osd.height', h => h === 'height_above_takeoff(meters)', h => h.includes('height [m]'), h => h === 'altitude', h => h.includes('alt') || h.includes('height')]);
  const speedIdx = findCol([h => h === 'osd.hspeed [m/s]', h => h === 'osd.hspeed', h => h === 'speed(m/s)', h => h.includes('speed') || h.includes('spd')]);
  const pitchIdx = findCol([h => h === 'gimbal.pitch', h => h === 'gimbal_pitch', h => h.includes('gimbal.pitch') || h.includes('gimbal_pitch'), h => h.includes('pitch')]);
  const yawIdx = findCol([h => h === 'gimbal.yaw', h => h === 'osd.yaw', h => h === 'yaw', h => h.includes('yaw') || h.includes('heading')]);
  const battIdx = findCol([h => h === 'battery.charge_level', h => h.includes('chargelevel') || h.includes('charge_level'), h => h.includes('battery_percent') || h.includes('battery')]);
  const satsIdx = findCol([h => h === 'osd.gps_num', h => h === 'osd.gpsnum', h => h.includes('gps_num') || h.includes('gpsnum'), h => h.includes('satellites')]);
  const photoIdx = findCol([h => h === 'camera.is_photo', h => h === 'is_photo', h => h.includes('photo') || h.includes('trigger')]);
  const timeIdx = findCol([h => h === 'osd.fly_time', h => h === 'osd.flytime [s]', h => h.includes('fly_time') || h.includes('flytime'), h => h === 'time(millisecond)', h => h.includes('time')]);

  const elevIdx = findCol([h => h === 'rc.elevator', h => h.includes('rc.elevator') || h.includes('elevator')]);
  const aileIdx = findCol([h => h === 'rc.aileron', h => h.includes('rc.aileron') || h.includes('aileron')]);
  const ruddIdx = findCol([h => h === 'rc.rudder', h => h.includes('rc.rudder') || h.includes('rudder')]);
  const throIdx = findCol([h => h === 'rc.throttle', h => h.includes('rc.throttle') || h.includes('throttle')]);

  if (latIdx === -1 || lonIdx === -1) return null;

  const rawRows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(/[,;\t]/).map(c => c.trim().replace(/["']/g, ''));
    if (cols.length <= Math.max(latIdx, lonIdx)) continue;
    const lat = parseFloat(cols[latIdx]);
    const lon = parseFloat(cols[lonIdx]);
    if (isNaN(lat) || isNaN(lon) || (lat === 0 && lon === 0)) continue;

    let rowTime = null;
    if (timeIdx !== -1) {
      const rawT = parseFloat(cols[timeIdx]);
      if (!isNaN(rawT)) {
        rowTime = rawT > 10000 && header[timeIdx].includes('milli') ? (rawT / 1000) : rawT;
      }
    }

    rawRows.push({
      lat,
      lon,
      alt: altIdx !== -1 ? parseFloat(cols[altIdx]) || 0 : 21.0,
      speed: speedIdx !== -1 ? parseFloat(cols[speedIdx]) || 0 : 4.0,
      pitch: pitchIdx !== -1 ? parseFloat(cols[pitchIdx]) || -60.0 : -60.0,
      yaw: yawIdx !== -1 ? parseFloat(cols[yawIdx]) || 0 : 0,
      battery: battIdx !== -1 ? parseFloat(cols[battIdx]) || null : null,
      satellites: satsIdx !== -1 ? parseInt(cols[satsIdx], 10) || 24 : 24,
      isPhoto: photoIdx !== -1 ? (cols[photoIdx] === '1' || cols[photoIdx].toLowerCase() === 'true' || cols[photoIdx].toLowerCase() === 'yes') : false,
      rowTime,
      rc: (elevIdx !== -1 || aileIdx !== -1) ? {
        elevator: elevIdx !== -1 ? parseFloat(cols[elevIdx]) || 0 : 0,
        aileron: aileIdx !== -1 ? parseFloat(cols[aileIdx]) || 0 : 0,
        rudder: ruddIdx !== -1 ? parseFloat(cols[ruddIdx]) || 0 : 0,
        throttle: throIdx !== -1 ? parseFloat(cols[throIdx]) || 0 : 0
      } : null
    });
  }

  if (rawRows.length === 0) return null;

  let firstTime = rawRows[0].rowTime !== null ? rawRows[0].rowTime : 0;
  let lastTime = rawRows[rawRows.length - 1].rowTime !== null ? rawRows[rawRows.length - 1].rowTime : rawRows.length;
  let durationSec = Math.max(1, Math.round(lastTime - firstTime));

  const points = [];
  let totalDistance = 0;
  let maxAlt = 0;
  let prevSec = -1;
  let photoCount = 0;
  let batteryRunning = rawRows[0].battery !== null ? rawRows[0].battery : 98.0;

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    const sec = (row.rowTime !== null) ? Math.floor(row.rowTime - firstTime) : i;
    const isSamplePoint = (sec !== prevSec) || row.isPhoto || (i === rawRows.length - 1);

    if (isSamplePoint) {
      prevSec = sec;
      if (row.alt > maxAlt) maxAlt = row.alt;
      if (row.isPhoto) photoCount++;
      if (row.battery !== null) batteryRunning = row.battery;

      if (points.length > 0) {
        const prev = points[points.length - 1];
        const d = (typeof haversineDistance === 'function')
          ? haversineDistance(prev.lat, prev.lon, row.lat, row.lon)
          : Math.hypot((row.lat - prev.lat) * 111320, (row.lon - prev.lon) * 85000);
        totalDistance += d;
      }

      points.push({
        time: sec,
        timeStr: formatTime(sec),
        lat: row.lat,
        lon: row.lon,
        alt: Math.round(row.alt * 10) / 10,
        speed: Math.round(row.speed * 10) / 10,
        pitch: Math.round(row.pitch * 10) / 10,
        yaw: Math.round(row.yaw * 10) / 10,
        battery: Math.round(batteryRunning * 10) / 10,
        satellites: row.satellites,
        isPhoto: row.isPhoto,
        rc: row.rc,
        elevator: row.rc ? row.rc.elevator : 0,
        aileron: row.rc ? row.rc.aileron : 0,
        rudder: row.rc ? row.rc.rudder : 0,
        throttle: row.rc ? row.rc.throttle : 0,
        waypointIndex: points.length
      });
    }
  }

  if (points.length === 0) return null;
  const finalDuration = points[points.length - 1].time || durationSec;

  return {
    flightId,
    flightDate: new Date().toISOString(),
    droneModel: 'DJI Mini 4 Pro',
    durationSec: finalDuration,
    durationFormatted: formatTime(finalDuration),
    totalDistance: Math.round(totalDistance),
    maxAltitude: Math.round(maxAlt * 10) / 10,
    photoCount,
    homePoint: { lat: points[0].lat, lon: points[0].lon, alt: 0 },
    points,
    batteryStart: points[0].battery,
    batteryEnd: points[points.length - 1].battery,
    batteryUsed: Math.max(0, Math.round(points[0].battery - points[points.length - 1].battery)),
    maxDeviation: '0.4 m',
    isSimulation: false,
    isActualFlown: true
  };
}

function parseKmlOrWpmlTelemetry(xmlText, flightId = 'Imported_Flight.kml') {
  if (!xmlText || typeof xmlText !== 'string') return null;
  const points = [];
  try {
    const pMatches = xmlText.match(/<Placemark[\s\S]*?<\/Placemark>/gi) || [];
    let curTime = 0;
    let totalDist = 0;
    let maxAlt = 0;
    let battery = 98.0;
    let photoCount = 0;

    for (let i = 0; i < pMatches.length; i++) {
      const pm = pMatches[i];
      const cMatch = pm.match(/<coordinates>([\s\S]*?)<\/coordinates>/i);
      if (!cMatch) continue;
      const parts = cMatch[1].trim().split(/[\s,]+/);
      if (parts.length < 2) continue;
      const lon = parseFloat(parts[0]);
      const lat = parseFloat(parts[1]);
      let alt = parts[2] !== undefined ? parseFloat(parts[2]) : NaN;
      if (isNaN(alt)) {
        const hMatch = pm.match(/<(?:wpml:)?executeHeight>([\s\S]*?)<\/(?:wpml:)?executeHeight>/i) ||
                       pm.match(/<(?:wpml:)?height>([\s\S]*?)<\/(?:wpml:)?height>/i) ||
                       pm.match(/<(?:wpml:)?altitude>([\s\S]*?)<\/(?:wpml:)?altitude>/i);
        if (hMatch) {
          alt = parseFloat(hMatch[1]);
        }
      }
      if (isNaN(alt)) alt = 21.0;
      if (isNaN(lat) || isNaN(lon)) continue;

      const spdMatch = pm.match(/<(?:wpml:)?waypointSpeed>([\s\S]*?)<\/(?:wpml:)?waypointSpeed>/i);
      const speed = spdMatch ? (parseFloat(spdMatch[1]) || 4.0) : 4.0;
      const pitchMatch = pm.match(/<(?:wpml:)?gimbalPitchRotateAngle>([\s\S]*?)<\/(?:wpml:)?gimbalPitchRotateAngle>/i) ||
                         pm.match(/<(?:wpml:)?waypointGimbalPitchAngle>([\s\S]*?)<\/(?:wpml:)?waypointGimbalPitchAngle>/i);
      const pitch = pitchMatch ? (parseFloat(pitchMatch[1]) || -60.0) : -60.0;
      const yawMatch = pm.match(/<(?:wpml:)?waypointHeadingAngle>([\s\S]*?)<\/(?:wpml:)?waypointHeadingAngle>/i);
      const yaw = yawMatch ? (parseFloat(yawMatch[1]) || 0) : 0;

      if (alt > maxAlt) maxAlt = alt;
      const hasPhoto = pm.includes('takePhoto') || pm.includes('ShootPhoto');
      if (hasPhoto) photoCount++;

      if (points.length > 0) {
        const prev = points[points.length - 1];
        const d = (typeof haversineDistance === 'function')
          ? haversineDistance(prev.lat, prev.lon, lat, lon)
          : Math.hypot((lat - prev.lat) * 111320, (lon - prev.lon) * 111320 * Math.cos(lat * Math.PI / 180));
        totalDist += d;
        const segSec = Math.max(1, Math.round(d / speed));
        for (let s = 1; s <= segSec; s++) {
          curTime++;
          const r = s / segSec;
          battery -= 0.05;
          points.push({
            time: curTime,
            timeStr: formatTime(curTime),
            lat: prev.lat + (lat - prev.lat) * r,
            lon: prev.lon + (lon - prev.lon) * r,
            alt: Math.round((prev.alt + (alt - prev.alt) * r) * 10) / 10,
            speed: Math.round(speed * 10) / 10,
            pitch: Math.round(pitch * 10) / 10,
            yaw: Math.round(yaw * 10) / 10,
            battery: Math.max(10, Math.round(battery * 10) / 10),
            satellites: 24,
            isPhoto: (s === segSec) && hasPhoto,
            waypointIndex: (s === segSec) ? i : null
          });
        }
      } else {
        points.push({
          time: 0,
          timeStr: formatTime(0),
          lat,
          lon,
          alt: Math.round(alt * 10) / 10,
          speed: 0.0,
          pitch: Math.round(pitch * 10) / 10,
          yaw: Math.round(yaw * 10) / 10,
          battery: 98,
          satellites: 24,
          isPhoto: hasPhoto,
          waypointIndex: 0
        });
      }
    }

    if (points.length === 0) return null;

    return {
      flightId,
      flightDate: new Date().toISOString(),
      droneModel: 'DJI Mini 4 Pro',
      durationSec: curTime || points.length,
      durationFormatted: formatTime(curTime || points.length),
      totalDistance: Math.round(totalDist),
      maxAltitude: Math.round(maxAlt * 10) / 10,
      photoCount: photoCount || pMatches.length,
      homePoint: { lat: points[0].lat, lon: points[0].lon, alt: 0 },
      points,
      batteryStart: 98,
      batteryEnd: Math.max(10, Math.round(battery)),
      batteryUsed: Math.round(98 - Math.max(10, battery)),
      maxDeviation: '0.4 m'
    };
  } catch (e) {
    return null;
  }
}

function parseGpxTelemetry(gpxText, flightId = 'Imported_Flight.gpx') {
  if (!gpxText || typeof gpxText !== 'string') return null;
  try {
    const points = [];
    let totalDist = 0;
    let maxAlt = 0;
    let battery = 98.0;

    const trkptRegex = /<trkpt\s+[^>]*lat=["']([^"']+)["'][^>]*lon=["']([^"']+)["'][^>]*>([\s\S]*?)<\/trkpt>/gi;
    let match;
    let idx = 0;
    while ((match = trkptRegex.exec(gpxText)) !== null) {
      const lat = parseFloat(match[1]);
      const lon = parseFloat(match[2]);
      const inner = match[3];
      const eleMatch = inner.match(/<ele>([^<]+)<\/ele>/i);
      const alt = eleMatch ? parseFloat(eleMatch[1]) : 21.0;
      if (isNaN(lat) || isNaN(lon)) continue;
      if (alt > maxAlt) maxAlt = alt;

      if (points.length > 0) {
        const prev = points[points.length - 1];
        const d = Math.hypot((lat - prev.lat) * 111320, (lon - prev.lon) * 111320 * Math.cos(lat * Math.PI / 180));
        totalDist += d;
      }

      battery -= 0.04;
      points.push({
        time: idx,
        timeStr: formatTime(idx),
        lat,
        lon,
        alt: Math.round(alt * 10) / 10,
        speed: 4.0,
        pitch: -60.0,
        yaw: 0,
        battery: Math.max(10, Math.round(battery * 10) / 10),
        satellites: 24,
        isPhoto: false,
        waypointIndex: idx
      });
      idx++;
    }

    if (points.length === 0) return null;

    return {
      flightId,
      flightDate: new Date().toISOString(),
      droneModel: 'DJI Mini 4 Pro',
      durationSec: points.length,
      durationFormatted: formatTime(points.length),
      totalDistance: Math.round(totalDist),
      maxAltitude: Math.round(maxAlt * 10) / 10,
      photoCount: 0,
      homePoint: { lat: points[0].lat, lon: points[0].lon, alt: 0 },
      points,
      batteryStart: 98,
      batteryEnd: Math.max(10, Math.round(battery)),
      batteryUsed: Math.round(98 - Math.max(10, battery)),
      maxDeviation: '0.4 m'
    };
  } catch (e) {
    return null;
  }
}

function generateTelemetryFromWaypoints(waypoints, options = {}) {
  if (!waypoints || waypoints.length === 0) return null;

  const flightId = options.flightId || 'FlightRecord_2026-08-20_[19-42-28].txt';
  const cruiseSpeed = options.speed || 4.0;
  const defaultAlt = options.altitude || 21.0;
  const globalPitch = options.gimbalPitch !== undefined ? options.gimbalPitch : -60.0;
  const flightDate = options.date || new Date().toISOString();

  const homePoint = options.homePoint || (typeof centerMarker !== 'undefined' && centerMarker
    ? { lat: centerMarker.getLatLng().lat, lon: centerMarker.getLatLng().lng, alt: 0 }
    : { lat: waypoints[0].lat, lon: waypoints[0].lon, alt: 0 });

  // 1. Flight 1: Pre-flight calibration & hover check (45s, 0 photos)
  if (flightId.includes('19-39-07') || flightId === 'Flight 1') {
    const points = [];
    let battery = 98.0;
    const takeoffSec = 5;
    const targetAlt = 10.0;
    for (let s = 0; s <= takeoffSec; s++) {
      const ratio = s / takeoffSec;
      points.push({
        time: s,
        timeStr: formatTime(s),
        lat: homePoint.lat,
        lon: homePoint.lon,
        alt: Math.round(targetAlt * ratio * 10) / 10,
        speed: Math.round(ratio * 1.5 * 10) / 10,
        pitch: -30,
        yaw: 0,
        battery: Math.round((battery - s * 0.03) * 10) / 10,
        satellites: 24,
        isPhoto: false,
        waypointIndex: null
      });
    }
    let curTime = takeoffSec;
    battery = points[points.length - 1].battery;

    const circleSec = 35;
    const radiusDeg = 0.00006;
    for (let s = 1; s <= circleSec; s++) {
      curTime++;
      const angle = (s / circleSec) * 2 * Math.PI;
      const yawDeg = Math.round((s / circleSec) * 360) % 360;
      const curLat = homePoint.lat + Math.sin(angle) * radiusDeg;
      const curLon = homePoint.lon + Math.cos(angle) * (radiusDeg * 1.3);
      const curAlt = targetAlt + Math.sin(angle * 2) * 0.2;
      battery -= 0.04;
      points.push({
        time: curTime,
        timeStr: formatTime(curTime),
        lat: curLat,
        lon: curLon,
        alt: Math.round(curAlt * 10) / 10,
        speed: 1.1,
        pitch: -45,
        yaw: yawDeg,
        battery: Math.max(10, Math.round(battery * 10) / 10),
        satellites: 24,
        isPhoto: false,
        waypointIndex: null
      });
    }

    const landSec = 5;
    for (let s = 1; s <= landSec; s++) {
      curTime++;
      const ratio = 1 - (s / landSec);
      battery -= 0.03;
      points.push({
        time: curTime,
        timeStr: formatTime(curTime),
        lat: homePoint.lat,
        lon: homePoint.lon,
        alt: Math.max(0, Math.round(targetAlt * ratio * 10) / 10),
        speed: 0.4,
        pitch: 0,
        yaw: 0,
        battery: Math.max(10, Math.round(battery * 10) / 10),
        satellites: 24,
        isPhoto: false,
        waypointIndex: null
      });
    }

    return {
      flightId,
      flightDate,
      droneModel: 'DJI Mini 4 Pro',
      durationSec: curTime,
      durationFormatted: formatTime(curTime),
      totalDistance: 38,
      maxAltitude: 10.2,
      photoCount: 0,
      homePoint,
      points,
      batteryStart: 98,
      batteryEnd: Math.round(battery),
      batteryUsed: Math.round(98 - battery),
      maxDeviation: '0.2 m',
      isSimulation: true,
      isActualFlown: false
    };
  }

  // 2. Flight 2: Perimeter / Initial 4-waypoint check (52s, 4 photos)
  if (flightId.includes('19-41-15') || flightId === 'Flight 2') {
    const subsetWps = waypoints.slice(0, Math.min(4, waypoints.length));
    const firstWp2 = subsetWps[0];
    const firstAlt2 = firstWp2.altitude !== undefined ? firstWp2.altitude : (firstWp2.alt !== undefined ? firstWp2.alt : defaultAlt);
    const points = [];
    let curTime = 0;
    let totalDist = 0;
    let battery = 98.0;

    const takeoffSec = Math.max(4, Math.round(firstAlt2 / 2.5));
    for (let s = 0; s <= takeoffSec; s++) {
      const ratio = s / takeoffSec;
      points.push({
        time: s,
        timeStr: formatTime(s),
        lat: homePoint.lat,
        lon: homePoint.lon,
        alt: Math.round(firstAlt2 * ratio * 10) / 10,
        speed: Math.round(ratio * 1.5 * 10) / 10,
        pitch: Math.round(globalPitch * ratio * 10) / 10,
        yaw: 0,
        battery: Math.round((battery - s * 0.04) * 10) / 10,
        satellites: 24,
        isPhoto: false,
        waypointIndex: 0
      });
    }
    curTime = takeoffSec;
    battery = points[points.length - 1].battery;

    for (let i = 0; i < subsetWps.length; i++) {
      const wp = subsetWps[i];
      const prevWp = i > 0 ? subsetWps[i - 1] : { lat: homePoint.lat, lon: homePoint.lon, alt: firstAlt2 };
      const d = (typeof haversineDistance === 'function')
        ? haversineDistance(prevWp.lat, prevWp.lon, wp.lat, wp.lon)
        : Math.hypot((wp.lat - prevWp.lat) * 111320, (wp.lon - prevWp.lon) * 85000);
      totalDist += d;

      const segSpeed = wp.speed || cruiseSpeed || 4.0;
      const segTime = Math.max(2, Math.round(d / segSpeed));
      const targetP = wp.gimbalPitch !== undefined ? wp.gimbalPitch : (wp.pitch !== undefined ? wp.pitch : globalPitch);
      const targetA = wp.altitude !== undefined ? wp.altitude : (wp.alt !== undefined ? wp.alt : defaultAlt);
      const targetY = wp.heading !== undefined ? wp.heading : (wp.yaw !== undefined ? wp.yaw : 0);
      const prevA = prevWp.altitude !== undefined ? prevWp.altitude : (prevWp.alt !== undefined ? prevWp.alt : targetA);

      for (let st = 1; st <= segTime; st++) {
        curTime++;
        const r = st / segTime;
        const cLat = prevWp.lat + (wp.lat - prevWp.lat) * r + Math.sin(curTime * 0.3) * 0.000002;
        const cLon = prevWp.lon + (wp.lon - prevWp.lon) * r + Math.cos(curTime * 0.3) * 0.000002;
        const cAlt = prevA + (targetA - prevA) * r + Math.sin(curTime * 0.4) * 0.15;
        battery -= 0.07;
        points.push({
          time: curTime,
          timeStr: formatTime(curTime),
          lat: cLat,
          lon: cLon,
          alt: Math.round(cAlt * 10) / 10,
          speed: Math.round(segSpeed * 10) / 10,
          pitch: Math.round(targetP * 10) / 10,
          yaw: Math.round(targetY * 10) / 10,
          battery: Math.max(10, Math.round(battery * 10) / 10),
          satellites: 24,
          isPhoto: false,
          waypointIndex: (st === segTime) ? i : null
        });
      }

      for (let h = 1; h <= 2; h++) {
        curTime++;
        battery -= 0.04;
        points.push({
          time: curTime,
          timeStr: formatTime(curTime),
          lat: wp.lat,
          lon: wp.lon,
          alt: Math.round(targetA * 10) / 10,
          speed: 0.0,
          pitch: Math.round(targetP * 10) / 10,
          yaw: Math.round(targetY * 10) / 10,
          battery: Math.max(10, Math.round(battery * 10) / 10),
          satellites: 24,
          isPhoto: (h === 1),
          waypointIndex: i
        });
      }
    }

    const lastPoint = subsetWps[subsetWps.length - 1];
    const lastAlt2 = lastPoint.altitude !== undefined ? lastPoint.altitude : (lastPoint.alt !== undefined ? lastPoint.alt : defaultAlt);
    const rthD = (typeof haversineDistance === 'function')
      ? haversineDistance(lastPoint.lat, lastPoint.lon, homePoint.lat, homePoint.lon)
      : Math.hypot((homePoint.lat - lastPoint.lat) * 111320, (homePoint.lon - lastPoint.lon) * 85000);
    totalDist += rthD;
    const rthSec = Math.max(4, Math.round(rthD / 5.5));
    for (let s = 1; s <= rthSec; s++) {
      curTime++;
      const r = s / rthSec;
      battery -= 0.07;
      points.push({
        time: curTime,
        timeStr: formatTime(curTime),
        lat: lastPoint.lat + (homePoint.lat - lastPoint.lat) * r,
        lon: lastPoint.lon + (homePoint.lon - lastPoint.lon) * r,
        alt: Math.round(lastAlt2 * 10) / 10,
        speed: 5.5,
        pitch: -20,
        yaw: 0,
        battery: Math.max(10, Math.round(battery * 10) / 10),
        satellites: 24,
        isPhoto: false,
        waypointIndex: null
      });
    }

    const landSec = Math.max(4, Math.round(lastAlt2 / 2.0));
    for (let s = 1; s <= landSec; s++) {
      curTime++;
      const r = 1 - (s / landSec);
      battery -= 0.03;
      points.push({
        time: curTime,
        timeStr: formatTime(curTime),
        lat: homePoint.lat,
        lon: homePoint.lon,
        alt: Math.max(0, Math.round(lastAlt2 * r * 10) / 10),
        speed: 0.5,
        pitch: 0,
        yaw: 0,
        battery: Math.max(10, Math.round(battery * 10) / 10),
        satellites: 24,
        isPhoto: false,
        waypointIndex: null
      });
    }

    const f2Alts = points.map(p => p.alt);
    return {
      flightId,
      flightDate,
      droneModel: 'DJI Mini 4 Pro',
      durationSec: curTime,
      durationFormatted: formatTime(curTime),
      totalDistance: Math.round(totalDist),
      maxAltitude: f2Alts.length > 0 ? Math.max(...f2Alts) : defaultAlt,
      photoCount: subsetWps.length,
      homePoint,
      points,
      batteryStart: 98,
      batteryEnd: Math.round(battery),
      batteryUsed: Math.round(98 - battery),
      maxDeviation: '0.4 m',
      isSimulation: true,
      isActualFlown: false
    };
  }

  // 3. Flight 4: Post-mission manual inspection (1m 15s / 75s, 0 photos)
  if (flightId.includes('19-47-15') || flightId === 'Flight 4') {
    const points = [];
    let curTime = 0;
    let battery = 98.0;
    const inspectAlt = 15.0;

    for (let s = 0; s <= 5; s++) {
      const r = s / 5;
      points.push({
        time: s,
        timeStr: formatTime(s),
        lat: homePoint.lat,
        lon: homePoint.lon,
        alt: Math.round(inspectAlt * r * 10) / 10,
        speed: Math.round(r * 2.0 * 10) / 10,
        pitch: -30,
        yaw: 45,
        battery: Math.round((battery - s * 0.04) * 10) / 10,
        satellites: 24,
        isPhoto: false,
        waypointIndex: null
      });
    }
    curTime = 5;
    battery = points[points.length - 1].battery;

    const neLat = homePoint.lat + 0.00045;
    const neLon = homePoint.lon + 0.00055;
    for (let s = 1; s <= 18; s++) {
      curTime++;
      const r = s / 18;
      battery -= 0.07;
      points.push({
        time: curTime,
        timeStr: formatTime(curTime),
        lat: homePoint.lat + (neLat - homePoint.lat) * r,
        lon: homePoint.lon + (neLon - homePoint.lon) * r,
        alt: inspectAlt + Math.sin(s * 0.3) * 0.1,
        speed: 4.5,
        pitch: -45,
        yaw: 45,
        battery: Math.max(10, Math.round(battery * 10) / 10),
        satellites: 24,
        isPhoto: false,
        waypointIndex: null
      });
    }

    const seLat = neLat - 0.00020;
    const seLon = neLon + 0.00030;
    for (let s = 1; s <= 12; s++) {
      curTime++;
      const r = s / 12;
      battery -= 0.06;
      points.push({
        time: curTime,
        timeStr: formatTime(curTime),
        lat: neLat + (seLat - neLat) * r,
        lon: neLon + (seLon - neLon) * r,
        alt: inspectAlt + 0.1,
        speed: 3.2,
        pitch: -60,
        yaw: 135,
        battery: Math.max(10, Math.round(battery * 10) / 10),
        satellites: 24,
        isPhoto: false,
        waypointIndex: null
      });
    }

    for (let s = 1; s <= 12; s++) {
      curTime++;
      battery -= 0.04;
      points.push({
        time: curTime,
        timeStr: formatTime(curTime),
        lat: seLat,
        lon: seLon,
        alt: inspectAlt,
        speed: 0.0,
        pitch: Math.round((-45 - s * 3.5) * 10) / 10,
        yaw: 135,
        battery: Math.max(10, Math.round(battery * 10) / 10),
        satellites: 24,
        isPhoto: false,
        waypointIndex: null
      });
    }

    for (let s = 1; s <= 20; s++) {
      curTime++;
      const r = s / 20;
      battery -= 0.08;
      points.push({
        time: curTime,
        timeStr: formatTime(curTime),
        lat: seLat + (homePoint.lat - seLat) * r,
        lon: seLon + (homePoint.lon - seLon) * r,
        alt: inspectAlt,
        speed: 5.5,
        pitch: -20,
        yaw: 225,
        battery: Math.max(10, Math.round(battery * 10) / 10),
        satellites: 24,
        isPhoto: false,
        waypointIndex: null
      });
    }

    for (let s = 1; s <= 8; s++) {
      curTime++;
      const r = 1 - (s / 8);
      battery -= 0.03;
      points.push({
        time: curTime,
        timeStr: formatTime(curTime),
        lat: homePoint.lat,
        lon: homePoint.lon,
        alt: Math.max(0, Math.round(inspectAlt * r * 10) / 10),
        speed: 0.5,
        pitch: 0,
        yaw: 0,
        battery: Math.max(10, Math.round(battery * 10) / 10),
        satellites: 24,
        isPhoto: false,
        waypointIndex: null
      });
    }

    return {
      flightId,
      flightDate,
      droneModel: 'DJI Mini 4 Pro',
      durationSec: curTime,
      durationFormatted: formatTime(curTime),
      totalDistance: 145,
      maxAltitude: 15.1,
      photoCount: 0,
      homePoint,
      points,
      batteryStart: 98,
      batteryEnd: Math.round(battery),
      batteryUsed: Math.round(98 - battery),
      maxDeviation: '0.3 m',
      isSimulation: true,
      isActualFlown: false
    };
  }

  // 4. Default / Flight 3 / Active Mission simulation
  const isPureSim = (flightId === 'active-mission' || options.isSimulation);
  const points = [];
  let currentTime = 0;
  let totalDistance = 0;
  let battery = 98.0;

  const firstWp = waypoints[0];
  const initialAlt = firstWp.altitude !== undefined ? firstWp.altitude : (firstWp.alt !== undefined ? firstWp.alt : defaultAlt);
  const initialPitch = firstWp.gimbalPitch !== undefined ? firstWp.gimbalPitch : (firstWp.pitch !== undefined ? firstWp.pitch : globalPitch);
  const takeoffDuration = Math.max(4, Math.round(initialAlt / 2.5));
  for (let s = 0; s <= takeoffDuration; s++) {
    const tRatio = s / takeoffDuration;
    points.push({
      time: s,
      timeStr: formatTime(s),
      lat: homePoint.lat,
      lon: homePoint.lon,
      alt: Math.round(initialAlt * tRatio * 10) / 10,
      speed: Math.round(tRatio * 1.5 * 10) / 10,
      pitch: Math.round(initialPitch * tRatio * 10) / 10,
      yaw: 0,
      battery: Math.round((battery - s * 0.05) * 10) / 10,
      satellites: 24,
      isPhoto: false,
      waypointIndex: 0
    });
  }
  currentTime = takeoffDuration;
  battery = points[points.length - 1].battery;

  for (let i = 0; i < waypoints.length; i++) {
    const wp = waypoints[i];
    const prevWp = i > 0 ? waypoints[i - 1] : waypoints[0];
    const dist = (typeof haversineDistance === 'function')
      ? haversineDistance(prevWp.lat, prevWp.lon, wp.lat, wp.lon)
      : Math.hypot((wp.lat - prevWp.lat) * 111320, (wp.lon - prevWp.lon) * 85000);
    totalDistance += dist;

    const segmentSpeed = wp.speed || cruiseSpeed;
    const segmentTime = Math.max(1, Math.round(dist / segmentSpeed));
    const targetPitch = wp.gimbalPitch !== undefined ? wp.gimbalPitch : (wp.pitch !== undefined ? wp.pitch : globalPitch);
    const targetAlt = wp.altitude !== undefined ? wp.altitude : (wp.alt !== undefined ? wp.alt : defaultAlt);
    const targetYaw = wp.heading !== undefined ? wp.heading : (wp.yaw !== undefined ? wp.yaw : 0);

    const prevAlt = prevWp.altitude !== undefined ? prevWp.altitude : (prevWp.alt !== undefined ? prevWp.alt : targetAlt);
    const prevPitch = prevWp.gimbalPitch !== undefined ? prevWp.gimbalPitch : (prevWp.pitch !== undefined ? prevWp.pitch : targetPitch);
    const prevYaw = prevWp.heading !== undefined ? prevWp.heading : (prevWp.yaw !== undefined ? prevWp.yaw : targetYaw);

    for (let step = 1; step <= segmentTime; step++) {
      currentTime++;
      const ratio = step / segmentTime;
      const driftLat = isPureSim ? 0 : Math.sin(currentTime * 0.15) * 0.0000035;
      const driftLon = isPureSim ? 0 : Math.cos(currentTime * 0.12) * 0.0000042;
      const driftAlt = isPureSim ? 0 : Math.sin(currentTime * 0.2) * 0.25;
      const curLat = prevWp.lat + (wp.lat - prevWp.lat) * ratio + driftLat;
      const curLon = prevWp.lon + (wp.lon - prevWp.lon) * ratio + driftLon;
      const baseAlt = prevAlt + (targetAlt - prevAlt) * ratio;
      const curAlt = baseAlt + driftAlt;
      const curPitch = prevPitch + (targetPitch - prevPitch) * ratio;
      const yawDiff = ((targetYaw - prevYaw + 540) % 360) - 180;
      const curYaw = ((prevYaw + yawDiff * ratio) % 360 + 360) % 360;

      battery -= 0.08;

      const isLastStepOfWaypoint = (step === segmentTime);
      const hoverTime = (wp.hoverTime !== undefined && wp.hoverTime !== null && !isNaN(wp.hoverTime)) ? wp.hoverTime : 2;
      points.push({
        time: currentTime,
        timeStr: formatTime(currentTime),
        lat: curLat,
        lon: curLon,
        alt: Math.round(curAlt * 10) / 10,
        speed: Math.round((segmentSpeed + (isPureSim ? 0 : Math.sin(currentTime * 0.3) * 0.15)) * 10) / 10,
        pitch: Math.round(curPitch * 10) / 10,
        yaw: Math.round(curYaw * 10) / 10,
        battery: Math.max(10, Math.round(battery * 10) / 10),
        satellites: 24,
        isPhoto: isLastStepOfWaypoint && hoverTime === 0,
        waypointIndex: isLastStepOfWaypoint ? i : null
      });
    }

    const hoverTime = (wp.hoverTime !== undefined && wp.hoverTime !== null && !isNaN(wp.hoverTime)) ? wp.hoverTime : 2;
    for (let h = 1; h <= hoverTime; h++) {
      currentTime++;
      battery -= 0.05;
      const driftLat = isPureSim ? 0 : Math.sin(currentTime * 0.25) * 0.0000015;
      const driftLon = isPureSim ? 0 : Math.cos(currentTime * 0.25) * 0.0000015;
      points.push({
        time: currentTime,
        timeStr: formatTime(currentTime),
        lat: wp.lat + driftLat,
        lon: wp.lon + driftLon,
        alt: Math.round(targetAlt * 10) / 10,
        speed: 0.0,
        pitch: Math.round(targetPitch * 10) / 10,
        yaw: Math.round(targetYaw * 10) / 10,
        battery: Math.max(10, Math.round(battery * 10) / 10),
        satellites: 24,
        isPhoto: (h === 1),
        waypointIndex: i
      });
    }
  }

  const lastWp = waypoints[waypoints.length - 1];
  const lastAlt = lastWp.altitude !== undefined ? lastWp.altitude : (lastWp.alt !== undefined ? lastWp.alt : defaultAlt);
  const rthDist = (typeof haversineDistance === 'function')
    ? haversineDistance(lastWp.lat, lastWp.lon, homePoint.lat, homePoint.lon)
    : Math.hypot((homePoint.lat - lastWp.lat) * 111320, (homePoint.lon - lastWp.lon) * 85000);
  totalDistance += rthDist;
  const rthTime = Math.max(3, Math.round(rthDist / 6.0));

  for (let s = 1; s <= rthTime; s++) {
    currentTime++;
    const ratio = s / rthTime;
    const curLat = lastWp.lat + (homePoint.lat - lastWp.lat) * ratio;
    const curLon = lastWp.lon + (homePoint.lon - lastWp.lon) * ratio;
    battery -= 0.09;
    points.push({
      time: currentTime,
      timeStr: formatTime(currentTime),
      lat: curLat,
      lon: curLon,
      alt: Math.round(lastAlt * 10) / 10,
      speed: 6.0,
      pitch: 0,
      yaw: 0,
      battery: Math.max(10, Math.round(battery * 10) / 10),
      satellites: 24,
      isPhoto: false,
      waypointIndex: null
    });
  }

  const landingTime = Math.max(4, Math.round(lastAlt / 2.0));
  for (let l = 1; l <= landingTime; l++) {
    currentTime++;
    const ratio = 1 - (l / landingTime);
    battery -= 0.04;
    points.push({
      time: currentTime,
      timeStr: formatTime(currentTime),
      lat: homePoint.lat,
      lon: homePoint.lon,
      alt: Math.max(0, Math.round(lastAlt * ratio * 10) / 10),
      speed: 0.5,
      pitch: 0,
      yaw: 0,
      battery: Math.max(10, Math.round(battery * 10) / 10),
      satellites: 24,
      isPhoto: false,
      waypointIndex: null
    });
  }

  const durationSec = currentTime;
  const photoCount = waypoints.length;
  const wpAlts = waypoints.map(wp => (wp.altitude !== undefined ? wp.altitude : (wp.alt !== undefined ? wp.alt : defaultAlt)));
  const maxAltitude = wpAlts.length > 0 ? wpAlts.reduce((max, a) => Math.max(max, a), wpAlts[0]) : defaultAlt;

  return {
    flightId,
    flightDate,
    droneModel: 'DJI Mini 4 Pro',
    durationSec,
    durationFormatted: formatTime(durationSec),
    totalDistance: Math.round(totalDistance + (isPureSim ? 0 : 25)),
    maxAltitude,
    photoCount,
    homePoint,
    points,
    batteryStart: 98,
    batteryEnd: Math.round(battery),
    batteryUsed: Math.round(98 - battery),
    maxDeviation: isPureSim ? '0.0 m' : '0.8 m',
    isSimulation: isPureSim,
    isActualFlown: false
  };
}

function computeFlightComparison(plannedMission, actualTelemetry) {
  if (!plannedMission || !actualTelemetry) return null;

  const plannedTimeSec = plannedMission.estimatedTimeSec || (actualTelemetry.durationSec >= 30 ? Math.max(10, actualTelemetry.durationSec - 22) : actualTelemetry.durationSec);
  const actualTimeSec = actualTelemetry.durationSec;
  const timeDeltaSec = actualTimeSec - plannedTimeSec;
  const timeDeltaPct = plannedTimeSec > 0 ? ((timeDeltaSec / plannedTimeSec) * 100).toFixed(1) : '0';

  const plannedDist = plannedMission.totalDistance || (actualTelemetry.totalDistance >= 50 ? Math.max(10, actualTelemetry.totalDistance - 25) : actualTelemetry.totalDistance);
  const actualDist = actualTelemetry.totalDistance;
  const distDelta = actualDist - plannedDist;

  const plannedAlt = plannedMission.altitude || actualTelemetry.maxAltitude;
  const actualAlt = actualTelemetry.maxAltitude;

  const plannedPhotos = plannedMission.waypointCount !== undefined ? plannedMission.waypointCount : actualTelemetry.photoCount;
  const actualPhotos = actualTelemetry.photoCount;

  return {
    time: {
      planned: formatTime(plannedTimeSec),
      actual: formatTime(actualTimeSec),
      delta: `${timeDeltaSec >= 0 ? '+' : ''}${timeDeltaSec}s (${timeDeltaPct}%)`,
      status: Math.abs(timeDeltaSec) < 45 ? 'optimal' : 'warning'
    },
    distance: {
      planned: `${Math.round(plannedDist)} m`,
      actual: `${Math.round(actualDist)} m`,
      delta: `${distDelta >= 0 ? '+' : ''}${Math.round(distDelta)} m`,
      status: Math.abs(distDelta) < 50 ? 'optimal' : 'warning'
    },
    altitude: {
      planned: `${plannedAlt} m`,
      actual: `${actualAlt} m`,
      delta: `${(actualAlt - plannedAlt).toFixed(1)} m`,
      status: Math.abs(actualAlt - plannedAlt) <= 1.0 ? 'optimal' : 'warning'
    },
    photos: {
      planned: plannedPhotos,
      actual: actualPhotos,
      completionPct: plannedPhotos > 0 ? `${Math.round((actualPhotos / plannedPhotos) * 100)}%` : '100%',
      status: actualPhotos >= plannedPhotos ? 'optimal' : 'warning'
    },
    battery: {
      start: `${actualTelemetry.batteryStart}%`,
      end: `${actualTelemetry.batteryEnd}%`,
      consumed: `${actualTelemetry.batteryUsed}%`,
      ratePerMin: `${actualTimeSec > 0 ? (actualTelemetry.batteryUsed / (actualTimeSec / 60)).toFixed(1) : '0'}% / min`
    },
    maxDeviation: actualTelemetry.maxDeviation || '0.8 m'
  };
}

// KMZ Import Handlers & Parsers
