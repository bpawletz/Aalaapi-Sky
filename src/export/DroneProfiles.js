// Aalaapi Sky - Hardware Profile Specifications & Isolated XML Mission Templates

const CONSUMER_DRONE_ENUMS = [68, 89]; // 68: DJI Mini 4 Pro, 89: DJI Air 3
const ENTERPRISE_DRONE_ENUMS = [77, 67, 60, 71, 61, 66, 90]; // 77: Mavic 3E, 67: M30/30T, 60: M300/350, 71: Inspire 3

function normalizeDroneEnum(droneEnumValue) {
  if (typeof droneEnumValue === 'string') {
    const lower = droneEnumValue.toLowerCase();
    if (lower.includes('mini4pro') || lower.includes('mini') || lower === '68') return 68;
    if (lower.includes('air3') || lower === '89') return 89;
    if (lower.includes('mavic3e') || lower.includes('enterprise') || lower === '77') return 77;
    if (lower.includes('m350') || lower.includes('m300') || lower === '60') return 60;
    if (lower.includes('m30') || lower === '67') return 67;
    if (lower.includes('inspire') || lower === '71') return 71;
  }
  const val = parseInt(droneEnumValue, 10);
  return isNaN(val) ? 68 : val;
}

function isConsumerDrone(droneEnumValue) {
  const enumVal = normalizeDroneEnum(droneEnumValue);
  return CONSUMER_DRONE_ENUMS.includes(enumVal);
}

function isEnterpriseDrone(droneEnumValue) {
  return !isConsumerDrone(droneEnumValue);
}

const DRONE_ACOUSTIC_PROFILES = {
  68: { name: 'DJI Mini 4 Pro', refDba1m: 73.0, speedNoiseCoeff: 0.22, climbNoiseCoeff: 0.45, weightClass: 'Sub-249g Micro' },
  89: { name: 'DJI Air 3', refDba1m: 78.0, speedNoiseCoeff: 0.25, climbNoiseCoeff: 0.50, weightClass: '720g Mid-Size' },
  77: { name: 'DJI Mavic 3 Enterprise', refDba1m: 80.0, speedNoiseCoeff: 0.26, climbNoiseCoeff: 0.55, weightClass: '915g Enterprise' },
  67: { name: 'DJI Matrice 30 / 30T', refDba1m: 85.0, speedNoiseCoeff: 0.28, climbNoiseCoeff: 0.60, weightClass: '3.77kg Heavy Enterprise' },
  60: { name: 'DJI Matrice 300 / 350 RTK', refDba1m: 88.0, speedNoiseCoeff: 0.30, climbNoiseCoeff: 0.65, weightClass: '6.47kg Heavy Industrial' },
  71: { name: 'DJI Inspire 3', refDba1m: 86.0, speedNoiseCoeff: 0.28, climbNoiseCoeff: 0.60, weightClass: '3.99kg Cinema' }
};

function getDroneAcousticProfile(droneEnumValue) {
  const effectiveEnum = normalizeDroneEnum(droneEnumValue);
  return DRONE_ACOUSTIC_PROFILES[effectiveEnum] || DRONE_ACOUSTIC_PROFILES[68];
}

/**
 * Calculates ground observer A-weighted Sound Pressure Level (dBA) at a given 3D slant distance.
 * Models spherical spreading (-20*log10(d)), atmospheric absorption (-alpha*d), and rotor load boost.
 */
function calculateGroundNoiseDba(refDba1m, slantDistanceM, speedMs = 0, climbRateMs = 0, alphaDbPerMeter = 0.005) {
  const baseDba = (typeof refDba1m === 'number' && !isNaN(refDba1m) && refDba1m > 0) ? refDba1m : 73.0;
  const dist = Math.max(1.0, (typeof slantDistanceM === 'number' && !isNaN(slantDistanceM)) ? slantDistanceM : 50.0);
  const spd = Math.max(0, (typeof speedMs === 'number' && !isNaN(speedMs)) ? Math.abs(speedMs) : 0);
  const climb = (typeof climbRateMs === 'number' && !isNaN(climbRateMs)) ? climbRateMs : 0;
  const alpha = (typeof alphaDbPerMeter === 'number' && !isNaN(alphaDbPerMeter) && alphaDbPerMeter >= 0) ? alphaDbPerMeter : 0.005;

  const sphericalLossDb = 20.0 * Math.log10(dist);
  const atmosphericLossDb = alpha * dist;
  const speedLoadBoostDb = Math.min(3.5, spd * 0.24);
  const climbLoadBoostDb = climb > 0 ? Math.min(2.5, climb * 0.5) : (climb < 0 ? Math.min(1.2, Math.abs(climb) * 0.2) : 0);

  const rawSpl = baseDba - sphericalLossDb - atmosphericLossDb + speedLoadBoostDb + climbLoadBoostDb;
  return Math.max(15.0, Math.round(rawSpl * 10) / 10);
}

/**
 * Solves for the horizontal ground radius (meters) from nadir at which ground SPL drops to targetDba.
 * Returns 0 if nadir SPL right beneath the aircraft is already <= targetDba.
 */
function calculateGroundRadiusForTargetDba(refDba1m, altitudeM, targetDba, speedMs = 0, alphaDbPerMeter = 0.005) {
  const alt = Math.max(1.0, (typeof altitudeM === 'number' && !isNaN(altitudeM)) ? altitudeM : 50.0);
  const target = (typeof targetDba === 'number' && !isNaN(targetDba)) ? targetDba : 45.0;
  const nadirSpl = calculateGroundNoiseDba(refDba1m, alt, speedMs, 0, alphaDbPerMeter);
  if (nadirSpl <= target) return 0;

  // Binary search for slant distance d >= alt where SPL(d) == target
  let low = alt;
  let high = 2500.0;
  for (let i = 0; i < 28; i++) {
    const mid = 0.5 * (low + high);
    const splMid = calculateGroundNoiseDba(refDba1m, mid, speedMs, 0, alphaDbPerMeter);
    if (splMid > target) {
      low = mid;
    } else {
      high = mid;
    }
  }
  const slantDist = 0.5 * (low + high);
  if (slantDist <= alt) return 0;
  const horizRadius = Math.sqrt(Math.max(0, slantDist * slantDist - alt * alt));
  return Math.round(horizRadius * 10) / 10;
}

/**
 * Computes the minimum recommended quiet/stealth flight altitude AGL (meters)
 * so that nadir ground SPL does not exceed (ambientDba + marginDb).
 */
function calculateRecommendedQuietAltitude(refDba1m, ambientDba = 45, speedMs = 0, marginDb = 3, alphaDbPerMeter = 0.005) {
  const amb = (typeof ambientDba === 'number' && !isNaN(ambientDba)) ? ambientDba : 45.0;
  const margin = (typeof marginDb === 'number' && !isNaN(marginDb)) ? marginDb : 3.0;
  const targetSpl = amb + margin;

  let low = 15.0;
  let high = 400.0;
  if (calculateGroundNoiseDba(refDba1m, low, speedMs, 0, alphaDbPerMeter) <= targetSpl) {
    return 15;
  }
  for (let i = 0; i < 25; i++) {
    const mid = 0.5 * (low + high);
    const splMid = calculateGroundNoiseDba(refDba1m, mid, speedMs, 0, alphaDbPerMeter);
    if (splMid > targetSpl) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return Math.min(400, Math.max(15, Math.ceil(high)));
}

/**
 * Classifies ground acoustic impact into human-comparable sound levels and prominence above ambient.
 */
function classifyAcousticImpact(nadirDba, ambientDba = 45) {
  const spl = (typeof nadirDba === 'number' && !isNaN(nadirDba)) ? nadirDba : 45.0;
  const amb = (typeof ambientDba === 'number' && !isNaN(ambientDba)) ? ambientDba : 45.0;
  const deltaDb = Math.round((spl - amb) * 10) / 10;

  let humanEquivalent = 'Quiet Library (~45 dBA)';
  if (spl < 38) {
    humanEquivalent = 'Whisper / Rustling Leaves (<38 dBA)';
  } else if (spl < 48) {
    humanEquivalent = 'Quiet Library / Birdsong (~42 dBA)';
  } else if (spl < 56) {
    humanEquivalent = 'Moderate Rainfall / Fridge Hum (~50 dBA)';
  } else if (spl < 64) {
    humanEquivalent = 'Normal Conversation / A/C Unit (~60 dBA)';
  } else if (spl < 72) {
    humanEquivalent = 'Vacuum Cleaner / Busy Street (~68 dBA)';
  } else {
    humanEquivalent = 'Intrusive / Lawn Equipment (≥72 dBA)';
  }

  let severity = 'quiet';
  let label = 'Stealth / Masked';
  let color = '#10b981'; // Emerald
  if (deltaDb <= 0) {
    severity = 'quiet';
    label = 'Masked by Ambient';
    color = '#10b981';
  } else if (deltaDb <= 5 && spl < 56) {
    severity = 'moderate';
    label = 'Low Noticeability';
    color = '#06b6d4'; // Cyan
  } else if (deltaDb <= 12 && spl < 65) {
    severity = 'noticeable';
    label = 'Noticeable Hum';
    color = '#f59e0b'; // Amber
  } else {
    severity = 'intrusive';
    label = 'High / Intrusive';
    color = '#ef4444'; // Red
  }

  return {
    nadirDba: spl,
    ambientDba: amb,
    deltaDb,
    humanEquivalent,
    severity,
    label,
    color
  };
}

function getDroneProfile(droneEnumValue) {
  const effectiveEnum = normalizeDroneEnum(droneEnumValue);
  const isConsumer = isConsumerDrone(effectiveEnum);
  const acoustic = getDroneAcousticProfile(effectiveEnum);
  return {
    isConsumer,
    isEnterprise: !isConsumer,
    droneEnumValue: effectiveEnum,
    name: acoustic ? acoustic.name : (effectiveEnum === 68 ? 'DJI Mini 4 Pro' : (effectiveEnum === 89 ? 'DJI Air 3' : (effectiveEnum === 77 ? 'DJI Mavic 3 Enterprise' : 'DJI Enterprise Drone'))),
    refDba1m: acoustic.refDba1m,
    speedNoiseCoeff: acoustic.speedNoiseCoeff,
    climbNoiseCoeff: acoustic.climbNoiseCoeff,
    weightClass: acoustic.weightClass,
    requiresTemplateType: !isConsumer,
    requiresPayloadParam: !isConsumer,
    supportsPayloadParam: !isConsumer,
    supportsTemplateType: !isConsumer,
    supportsGlobalLensIndex: !isConsumer,
    allowRotateYaw: !isConsumer,
    allowDiscontinuityCurvature: !isConsumer,
    allowStraightLine: !isConsumer,
    allowLensIndex: !isConsumer,
    allowedTurnModes: isConsumer
      ? ['toPointAndStopWithContinuityCurvature', 'toPointAndPassWithContinuityCurvature']
      : ['toPointAndStopWithContinuityCurvature', 'toPointAndPassWithContinuityCurvature', 'toPointAndStopWithDiscontinuityCurvature', 'toPointAndPassWithDiscontinuityCurvature']
  };
}

/**
 * Isolated XML Mission Template for Consumer Drones (Mini 4 Pro [68], Air 3 [89])
 * Enforces zero Enterprise tag bleed natively:
 * - Never emits <wpml:templateType>
 * - Never emits <wpml:payloadParam>
 * - Never emits <wpml:useGlobalPayloadLensIndex>
 * - Never emits <wpml:actionActuatorFunc>rotateYaw</wpml:actionActuatorFunc>
 * - Strictly enforces ContinuityCurvature turn modes
 * - Strictly sets useStraightLine to 0
 */
const ConsumerMissionTemplate = {
  buildTemplateKml(options) {
    const {
      timestamp = Date.now(),
      finishAction = 'goHome',
      exitOnRCLost = 'executeLostAction',
      executeRCLostAction = 'goBack',
      safeTakeoffHeight = 50,
      speed = 4,
      droneEnumValue = 68
    } = options;

    return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="http://www.uav.com/wpmz/1.0.2">
  <Document>
    <wpml:author>Aalaapi Sky Generator</wpml:author>
    <wpml:createTime>${timestamp}</wpml:createTime>
    <wpml:updateTime>${timestamp}</wpml:updateTime>
    <wpml:missionConfig>
      <wpml:flyToWaylineMode>safely</wpml:flyToWaylineMode>
      <wpml:finishAction>${finishAction}</wpml:finishAction>
      <wpml:exitOnRCLost>${exitOnRCLost}</wpml:exitOnRCLost>
      <wpml:executeRCLostAction>${executeRCLostAction}</wpml:executeRCLostAction>
      <wpml:takeOffSecurityHeight>${safeTakeoffHeight}</wpml:takeOffSecurityHeight>
      <wpml:globalTransitionalSpeed>${speed}</wpml:globalTransitionalSpeed>
      <wpml:droneInfo>
        <wpml:droneEnumValue>${droneEnumValue}</wpml:droneEnumValue>
        <wpml:droneSubEnumValue>0</wpml:droneSubEnumValue>
      </wpml:droneInfo>
    </wpml:missionConfig>
  </Document>
</kml>`;
  },

  buildFolderHeader(speed = 4) {
    return `    <Folder>
      <wpml:templateId>0</wpml:templateId>
      <wpml:executeHeightMode>relativeToStartPoint</wpml:executeHeightMode>
      <wpml:waylineId>0</wpml:waylineId>
      <wpml:distance>0</wpml:distance>
      <wpml:duration>0</wpml:duration>
      <wpml:autoFlightSpeed>${speed}</wpml:autoFlightSpeed>\n`;
  },

  renderFolderHeader(options = {}) {
    const speed = options.autoFlightSpeed !== undefined ? options.autoFlightSpeed : (options.speed !== undefined ? options.speed : 4);
    return this.buildFolderHeader(speed);
  },

  resolveTurnMode(desiredMode, isStop = false) {
    return isStop
      ? 'toPointAndStopWithContinuityCurvature'
      : 'toPointAndPassWithContinuityCurvature';
  },

  resolveUseStraightLine() {
    return 0;
  }
};

/**
 * Isolated XML Mission Template for Enterprise Drones (Mavic 3E [77], Matrice 30/300/350, Inspire 3)
 * Enforces complete Enterprise metadata requirements:
 * - Generates mandatory <wpml:templateType>waypoint</wpml:templateType>
 * - Generates mandatory <wpml:payloadParam> in Folder
 * - Supports DiscontinuityCurvature and useStraightLine: 1
 * - Supports rotateYaw for multi-sensor payloads
 */
const EnterpriseMissionTemplate = {
  buildTemplateKml(options) {
    const {
      timestamp = Date.now(),
      finishAction = 'goHome',
      exitOnRCLost = 'executeLostAction',
      executeRCLostAction = 'goBack',
      safeTakeoffHeight = 50,
      speed = 4,
      droneEnumValue = 77
    } = options;

    return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="http://www.uav.com/wpmz/1.0.2">
  <Document>
    <wpml:author>Aalaapi Sky Generator</wpml:author>
    <wpml:createTime>${timestamp}</wpml:createTime>
    <wpml:updateTime>${timestamp}</wpml:updateTime>
    <wpml:missionConfig>
      <wpml:flyToWaylineMode>safely</wpml:flyToWaylineMode>
      <wpml:finishAction>${finishAction}</wpml:finishAction>
      <wpml:exitOnRCLost>${exitOnRCLost}</wpml:exitOnRCLost>
      <wpml:executeRCLostAction>${executeRCLostAction}</wpml:executeRCLostAction>
      <wpml:takeOffSecurityHeight>${safeTakeoffHeight}</wpml:takeOffSecurityHeight>
      <wpml:globalTransitionalSpeed>${speed}</wpml:globalTransitionalSpeed>
      <wpml:droneInfo>
        <wpml:droneEnumValue>${droneEnumValue}</wpml:droneEnumValue>
        <wpml:droneSubEnumValue>0</wpml:droneSubEnumValue>
      </wpml:droneInfo>
    </wpml:missionConfig>
    <Folder>
      <wpml:templateType>waypoint</wpml:templateType>
      <wpml:templateId>0</wpml:templateId>
      <wpml:executeHeightMode>relativeToStartPoint</wpml:executeHeightMode>
      <wpml:waylineId>0</wpml:waylineId>
      <wpml:distance>0</wpml:distance>
      <wpml:duration>0</wpml:duration>
      <wpml:autoFlightSpeed>${speed}</wpml:autoFlightSpeed>
      <wpml:payloadParam>
        <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
        <wpml:payloadPitchControlMode>usePointSetting</wpml:payloadPitchControlMode>
      </wpml:payloadParam>
    </Folder>
  </Document>
</kml>`;
  },

  buildFolderHeader(speed = 4, extraPayload = '') {
    return `    <Folder>
      <wpml:templateType>waypoint</wpml:templateType>
      <wpml:templateId>0</wpml:templateId>
      <wpml:executeHeightMode>relativeToStartPoint</wpml:executeHeightMode>
      <wpml:waylineId>0</wpml:waylineId>
      <wpml:distance>0</wpml:distance>
      <wpml:duration>0</wpml:duration>
      <wpml:autoFlightSpeed>${speed}</wpml:autoFlightSpeed>
      <wpml:payloadParam>
        <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
        <wpml:payloadPitchControlMode>usePointSetting</wpml:payloadPitchControlMode>${extraPayload ? '\n        ' + extraPayload : ''}
      </wpml:payloadParam>\n`;
  },

  renderFolderHeader(options = {}) {
    const speed = options.autoFlightSpeed !== undefined ? options.autoFlightSpeed : (options.speed !== undefined ? options.speed : 4);
    let extra = '';
    if (options.lensIndex) {
      extra = '<wpml:useGlobalPayloadLensIndex>1</wpml:useGlobalPayloadLensIndex>';
    }
    return this.buildFolderHeader(speed, extra);
  },

  resolveTurnMode(desiredMode, isStop = false, pathMode = 'normal') {
    if (pathMode === 'straight') {
      return isStop
        ? 'toPointAndStopWithDiscontinuityCurvature'
        : 'toPointAndPassWithDiscontinuityCurvature';
    }
    return isStop
      ? 'toPointAndStopWithContinuityCurvature'
      : 'toPointAndPassWithContinuityCurvature';
  },

  resolveUseStraightLine(pathMode = 'normal') {
    return pathMode === 'straight' ? 1 : 0;
  }
};
