/**
 * tools/companion/solar_ephemeris.js
 * 
 * Offline Astronomical Solar Ephemeris & Flight Window Calculator for Aalaapi Sky.
 * Implements standard astronomical algorithms (NOAA / Jean Meeus equations).
 * Computes solar coordinates, solar noon, sunrise, sunset, civil/nautical/astronomical twilights,
 * sun elevation/azimuth, daylight remaining, and FAA Part 107 flight window states.
 */

const SolarEphemeris = {
  RAD: Math.PI / 180,
  DEG: 180 / Math.PI,

  toJulian(date) {
    const d = (date instanceof Date) ? date : new Date(date);
    return d.getTime() / 86400000 + 2440587.5;
  },

  fromJulian(j) {
    return new Date((j - 2440587.5) * 86400000);
  },

  toDays(date) {
    return this.toJulian(date) - 2451545.0;
  },

  solarCoordinates(d) {
    const M = (357.5291 + 0.98560028 * d) * this.RAD;
    const C = (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) * this.RAD;
    const P = 102.9372 * this.RAD;
    const L = M + C + P + Math.PI;
    const e = 23.4397 * this.RAD;
    const sinDec = Math.sin(L) * Math.sin(e);
    const dec = Math.asin(sinDec);
    const ra = Math.atan2(Math.sin(L) * Math.cos(e), Math.cos(L));
    return { dec, ra, L, M };
  },

  getSunPosition(date, lat, lon) {
    const d = this.toDays(date);
    const lw = -lon * this.RAD;
    const phi = lat * this.RAD;
    const sc = this.solarCoordinates(d);

    const theta = (280.1600 + 360.9856235 * d) * this.RAD - lw;
    const H = theta - sc.ra;

    const sinAlt = Math.sin(phi) * Math.sin(sc.dec) + Math.cos(phi) * Math.cos(sc.dec) * Math.cos(H);
    const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));

    const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(sc.dec) * Math.cos(phi));
    let azDeg = (az * this.DEG + 180) % 360;
    if (azDeg < 0) azDeg += 360;

    const compass = this.bearingToCompassDirection(azDeg);

    return {
      altitudeDeg: alt * this.DEG,
      azimuthDeg: azDeg,
      compassDirection: compass
    };
  },

  bearingToCompassDirection(bearing) {
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const idx = Math.round(((bearing % 360 + 360) % 360) / 22.5) % 16;
    return directions[idx];
  },

  getSolarTimesForDay(date, lat, lon) {
    const d = this.toDays(date);
    const phi = lat * this.RAD;
    const n = Math.round(d - 0.0009 - (-lon / 360));
    const Japprox = 2451545.0 + 0.0009 + (-lon / 360) + n;
    const sc = this.solarCoordinates(Japprox - 2451545.0);
    const Jnoon = Japprox + 0.0053 * Math.sin(sc.M) - 0.0069 * Math.sin(2 * sc.L);

    const self = this;
    function getTimes(h0) {
      const sinH0 = Math.sin(h0 * self.RAD);
      const cosH0 = (sinH0 - Math.sin(phi) * Math.sin(sc.dec)) / (Math.cos(phi) * Math.cos(sc.dec));
      if (cosH0 > 1) return { rise: null, set: null, status: 'always_down' };
      if (cosH0 < -1) return { rise: null, set: null, status: 'always_up' };
      const H0 = Math.acos(cosH0);
      const Jrise = Jnoon - H0 / (2 * Math.PI);
      const Jset = Jnoon + H0 / (2 * Math.PI);
      return { rise: self.fromJulian(Jrise), set: self.fromJulian(Jset), status: 'normal' };
    }

    return {
      noon: this.fromJulian(Jnoon),
      official: getTimes(-0.833),
      civil: getTimes(-6.0),
      nautical: getTimes(-12.0),
      astronomical: getTimes(-18.0),
      goldenHour: getTimes(6.0)
    };
  },

  formatTime(date) {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) return '--:--';
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  },

  formatDuration(minutes) {
    if (minutes == null || isNaN(minutes) || minutes < 0) return '0m';
    const hrs = Math.floor(minutes / 60);
    const mins = Math.floor(minutes % 60);
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins}m`;
  },

  getSolar24hWindow(nowInput, lat, lon) {
    const now = (nowInput instanceof Date) ? nowInput : new Date(nowInput || Date.now());
    const tNow = now.getTime();

    const timesToday = this.getSolarTimesForDay(now, lat, lon);
    const tomorrow = new Date(tNow + 86400000);
    const timesTomorrow = this.getSolarTimesForDay(tomorrow, lat, lon);
    const yesterday = new Date(tNow - 86400000);
    const timesYesterday = this.getSolarTimesForDay(yesterday, lat, lon);

    const allEvents = [];
    [timesYesterday, timesToday, timesTomorrow].forEach(t => {
      if (t.astronomical.rise) allEvents.push({ type: 'astronomical_dawn', name: 'Astronomical Dawn', time: t.astronomical.rise, icon: '🌌' });
      if (t.nautical.rise) allEvents.push({ type: 'nautical_dawn', name: 'Nautical Dawn', time: t.nautical.rise, icon: '⚓' });
      if (t.civil.rise) allEvents.push({ type: 'civil_dawn', name: 'Civil Dawn', time: t.civil.rise, icon: '🌅', faaTwilight: true });
      if (t.official.rise) allEvents.push({ type: 'sunrise', name: 'Sunrise', time: t.official.rise, icon: '☀️', isKey: true });
      if (t.goldenHour.rise) allEvents.push({ type: 'golden_hour_end', name: 'Golden Hour Ends', time: t.goldenHour.rise, icon: '📸' });
      if (t.noon) allEvents.push({ type: 'solar_noon', name: 'Solar Noon', time: t.noon, icon: '☀️' });
      if (t.goldenHour.set) allEvents.push({ type: 'golden_hour_start', name: 'Golden Hour Begins', time: t.goldenHour.set, icon: '📸' });
      if (t.official.set) allEvents.push({ type: 'sunset', name: 'Sunset', time: t.official.set, icon: '🌇', isKey: true });
      if (t.civil.set) allEvents.push({ type: 'civil_dusk', name: 'Civil Dusk', time: t.civil.set, icon: '🌆', faaTwilight: true });
      if (t.nautical.set) allEvents.push({ type: 'nautical_dusk', name: 'Nautical Dusk', time: t.nautical.set, icon: '⚓' });
      if (t.astronomical.set) allEvents.push({ type: 'astronomical_dusk', name: 'Astronomical Dusk', time: t.astronomical.set, icon: '🌌' });
    });

    allEvents.sort((a, b) => a.time.getTime() - b.time.getTime());

    const windowEnd = tNow + 86400000;
    const timeline24h = allEvents.filter(e => e.time.getTime() >= tNow && e.time.getTime() <= windowEnd);

    const nextSunriseEvent = allEvents.find(e => e.type === 'sunrise' && e.time.getTime() >= tNow);
    const nextSunsetEvent = allEvents.find(e => e.type === 'sunset' && e.time.getTime() >= tNow);

    const pastEvents = allEvents.filter(e => e.time.getTime() <= tNow);
    const lastSunrise = [...pastEvents].reverse().find(e => e.type === 'sunrise');
    const lastSunset = [...pastEvents].reverse().find(e => e.type === 'sunset');
    const lastCivilDawn = [...pastEvents].reverse().find(e => e.type === 'civil_dawn');
    const lastCivilDusk = [...pastEvents].reverse().find(e => e.type === 'civil_dusk');

    let isDaylight = false;
    let isCivilTwilight = false;
    let daylightRemainingMs = 0;
    let faaCategory = 'NIGHT';
    let faaBadgeText = 'Night';
    let faaBadgeColor = '#ef4444';
    let faaAdvisory = '';

    const nextCivilDuskEvent = allEvents.find(e => e.type === 'civil_dusk' && e.time.getTime() >= tNow);

    if (timesToday.official.status === 'always_up') {
      isDaylight = true;
      faaCategory = 'POLAR_DAY';
      faaBadgeText = 'Midnight Sun';
      faaBadgeColor = '#10b981';
      daylightRemainingMs = 86400000;
      faaAdvisory = '24-Hour Continuous Daylight (Midnight Sun)';
    } else if (timesToday.official.status === 'always_down') {
      isDaylight = false;
      faaCategory = 'POLAR_NIGHT';
      faaBadgeText = 'Polar Night';
      faaBadgeColor = '#ef4444';
      daylightRemainingMs = 0;
      faaAdvisory = '24-Hour Continuous Night (Anti-Collision Strobe Required)';
    } else if (lastSunrise && (!lastSunset || lastSunrise.time.getTime() > lastSunset.time.getTime())) {
      isDaylight = true;
      const sunsetMs = nextSunsetEvent ? nextSunsetEvent.time.getTime() : 0;
      daylightRemainingMs = Math.max(0, sunsetMs - tNow);
      faaCategory = 'DAYLIGHT';
      faaBadgeText = 'Daylight';
      faaBadgeColor = '#10b981';
      const duskStr = nextCivilDuskEvent ? this.formatTime(nextCivilDuskEvent.time) : '';
      faaAdvisory = duskStr
        ? `Legal civil twilight flight permitted until ${duskStr} (+30 min with anti-collision lights).`
        : 'Standard FAA daylight flight operations permitted.';
    } else if (lastSunset && (!lastCivilDusk || lastSunset.time.getTime() > lastCivilDusk.time.getTime())) {
      isCivilTwilight = true;
      faaCategory = 'CIVIL_TWILIGHT_EVENING';
      faaBadgeText = 'Civil Twilight';
      faaBadgeColor = '#f59e0b';
      const remainingDuskMs = nextCivilDuskEvent ? Math.max(0, nextCivilDuskEvent.time.getTime() - tNow) : 0;
      const duskStr = nextCivilDuskEvent ? this.formatTime(nextCivilDuskEvent.time) : '';
      faaAdvisory = `Evening civil twilight: ${this.formatDuration(Math.floor(remainingDuskMs / 60000))} remaining (ends ${duskStr}). Anti-collision strobe required.`;
    } else if (lastCivilDawn && (!lastSunrise || lastCivilDawn.time.getTime() > lastSunrise.time.getTime())) {
      isCivilTwilight = true;
      faaCategory = 'CIVIL_TWILIGHT_MORNING';
      faaBadgeText = 'Civil Twilight';
      faaBadgeColor = '#f59e0b';
      const riseStr = nextSunriseEvent ? this.formatTime(nextSunriseEvent.time) : '';
      faaAdvisory = `Morning civil twilight: Sunrise at ${riseStr}. Anti-collision strobe required.`;
    } else {
      faaCategory = 'NIGHT';
      faaBadgeText = 'Night';
      faaBadgeColor = '#ef4444';
      const nextDawnEvent = allEvents.find(e => e.type === 'civil_dawn' && e.time.getTime() >= tNow);
      const dawnStr = nextDawnEvent ? this.formatTime(nextDawnEvent.time) : '';
      const dawnCountdown = nextDawnEvent ? this.formatDuration(Math.floor((nextDawnEvent.time.getTime() - tNow) / 60000)) : '';
      faaAdvisory = dawnStr
        ? `Night flight: Next civil dawn in ${dawnCountdown} (${dawnStr}). Part 107.29 anti-collision strobe & training required.`
        : 'Night flight: Part 107.29 anti-collision strobe & night training required.';
    }

    const pos = this.getSunPosition(now, lat, lon);

    return {
      now,
      coordinates: { lat, lon },
      isDaylight,
      isCivilTwilight,
      daylightRemainingMinutes: Math.floor(daylightRemainingMs / 60000),
      daylightRemainingFormatted: this.formatDuration(Math.floor(daylightRemainingMs / 60000)),
      faaCategory,
      faaBadgeText,
      faaBadgeColor,
      faaAdvisory,
      nextSunrise: nextSunriseEvent ? nextSunriseEvent.time : null,
      nextSunset: nextSunsetEvent ? nextSunsetEvent.time : null,
      currentPosition: pos,
      twilights: {
        civilDawn: timesToday.civil.rise,
        civilDusk: timesToday.civil.set,
        nauticalDawn: timesToday.nautical.rise,
        nauticalDusk: timesToday.nautical.set,
        astronomicalDawn: timesToday.astronomical.rise,
        astronomicalDusk: timesToday.astronomical.set,
        solarNoon: timesToday.noon
      },
      timeline24h
    };
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SolarEphemeris;
}
