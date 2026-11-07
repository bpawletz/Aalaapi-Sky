/**
 * Aalaapi Sky Companion Bridge - OS Driver Factory & Registry
 */

const { BaseCompanionDriver } = require('./BaseCompanionDriver');
const { Win32CompanionDriver } = require('./Win32CompanionDriver');
const { PosixCompanionDriver } = require('./PosixCompanionDriver');

const _driverCache = new Map();
let _forcedDriver = null;

function getCompanionDriver(platformOverride = null) {
  if (_forcedDriver && !platformOverride) {
    return _forcedDriver;
  }
  const targetPlatform = platformOverride || process.env.AALAAPI_COMPANION_PLATFORM || process.platform;
  if (_driverCache.has(targetPlatform)) {
    return _driverCache.get(targetPlatform);
  }

  let driver;
  if (targetPlatform === 'win32') {
    driver = new Win32CompanionDriver();
  } else if (['linux', 'darwin', 'android', 'freebsd', 'openbsd'].includes(targetPlatform)) {
    driver = new PosixCompanionDriver(targetPlatform);
  } else {
    driver = new BaseCompanionDriver(targetPlatform);
  }

  _driverCache.set(targetPlatform, driver);
  return driver;
}

function setCompanionDriver(customDriver = null) {
  _forcedDriver = customDriver;
}

module.exports = {
  BaseCompanionDriver,
  Win32CompanionDriver,
  PosixCompanionDriver,
  getCompanionDriver,
  setCompanionDriver
};
