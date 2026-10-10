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

function getDroneProfile(droneEnumValue) {
  const effectiveEnum = normalizeDroneEnum(droneEnumValue);
  const isConsumer = isConsumerDrone(effectiveEnum);
  return {
    isConsumer,
    isEnterprise: !isConsumer,
    droneEnumValue: effectiveEnum,
    name: effectiveEnum === 68 ? 'DJI Mini 4 Pro' : (effectiveEnum === 89 ? 'DJI Air 3' : (effectiveEnum === 77 ? 'DJI Mavic 3 Enterprise' : 'DJI Enterprise Drone')),
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
