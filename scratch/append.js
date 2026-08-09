const fs = require('fs');
const suites = `
describe('WPML Validation & Stationary Fallback Regression Tests', () => {
  test('buildTemplateKml includes mandatory wpml:templateType waypoint tag', () => {
    const xml = vm.runInThisContext('buildTemplateKml("goHome", 4)');
    assert.strictEqual(xml.includes('<wpml:templateType>waypoint</wpml:templateType>'), true, 'template.kml must contain wpml:templateType tag');
  });

  test('buildWaylinesWpml includes mandatory wpml:templateType tag in Folder', () => {
    const wps = [
      { lat: 40.0127, lon: -83.1771, alt: 17, headingMode: 'inherit' },
      { lat: 40.0128, lon: -83.1771, alt: 17, headingMode: 'inherit' }
    ];
    const xml = vm.runInThisContext(\`buildWaylinesWpml(\${JSON.stringify(wps)}, 17, 4, 'followWayline', 'goHome', -90, 'stopAndShoot', 'straight')\`);
    assert.strictEqual(xml.includes('<wpml:templateType>waypoint</wpml:templateType>'), true, 'waylines.wpml Folder must contain wpml:templateType tag');
  });

  test('multi-leg 2D grid export assigns correct wayline direction angles and enables them (waypointHeadingAngleEnable=1) for stationary fallback', () => {
    const wps = [
      { lat: 40.0127, lon: -83.1771, alt: 17, heading: 0, headingMode: 'inherit' },
      { lat: 40.0129, lon: -83.1771, alt: 17, heading: 0, headingMode: 'inherit' },
      { lat: 40.0129, lon: -83.1770, alt: 17, heading: 180, headingMode: 'inherit' },
      { lat: 40.0127, lon: -83.1770, alt: 17, heading: 180, headingMode: 'inherit' },
      { lat: 40.0127, lon: -83.1769, alt: 17, heading: 0, headingMode: 'inherit' },
      { lat: 40.0129, lon: -83.1769, alt: 17, heading: 0, headingMode: 'inherit' },
      { lat: 40.0129, lon: -83.1768, alt: 17, heading: 180, headingMode: 'inherit' },
      { lat: 40.0127, lon: -83.1768, alt: 17, heading: 180, headingMode: 'inherit' }
    ];
    const xml = vm.runInThisContext(\`buildWaylinesWpml(\${JSON.stringify(wps)}, 17, 4, 'followWayline', 'goHome', -90, 'stopAndShoot', 'straight')\`);
    assert.strictEqual(xml.includes('<wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode>'), true);
    assert.strictEqual(xml.includes('<wpml:waypointHeadingMode>smoothTransition</wpml:waypointHeadingMode>'), false);
    assert.strictEqual(xml.includes('<wpml:waypointHeadingAngleEnable>1</wpml:waypointHeadingAngleEnable>'), true);
    assert.strictEqual(xml.includes('<wpml:waypointHeadingAngle>180.0</wpml:waypointHeadingAngle>'), true);
    assert.strictEqual(xml.includes('<wpml:waypointHeadingAngle>0.0</wpml:waypointHeadingAngle>'), true);
  });

  test('followWayline waypoints without x/y offsets (lat/lon only) never produce NaN waypointHeadingAngle', () => {
    const wps = [
      { lat: 40.0127, lon: -83.1771, alt: 17, headingMode: 'inherit' },
      { lat: 40.0129, lon: -83.1771, alt: 17, headingMode: 'inherit' }
    ];
    const xml = vm.runInThisContext(\`buildWaylinesWpml(\${JSON.stringify(wps)}, 17, 4, 'followWayline', 'goHome', -90, 'stopAndShoot', 'straight')\`);
    assert.strictEqual(xml.includes('<wpml:waypointHeadingAngle>NaN</wpml:waypointHeadingAngle>'), false);
    assert.strictEqual(xml.includes('<wpml:waypointHeadingAngleEnable>1</wpml:waypointHeadingAngleEnable>'), true);
  });

  test('all pattern types (double grid, orbit, multi-orbit) export valid waypointHeadingAngle and waypointHeadingAngleEnable=1', () => {
    const doubleGridWps = [
      { lat: 40.0127, lon: -83.1771, alt: 17, headingMode: 'inherit' },
      { lat: 40.0129, lon: -83.1771, alt: 17, headingMode: 'inherit' }
    ];
    const xmlDouble = vm.runInThisContext(\`buildWaylinesWpml(\${JSON.stringify(doubleGridWps)}, 17, 4, 'followWayline', 'goHome', -90, 'stopAndShoot', 'straight')\`);
    assert.strictEqual(xmlDouble.includes('<wpml:waypointHeadingAngle>NaN</wpml:waypointHeadingAngle>'), false);
    assert.strictEqual(xmlDouble.includes('<wpml:waypointHeadingAngleEnable>1</wpml:waypointHeadingAngleEnable>'), true);
    const orbitWps = [
      { lat: 40.0127, lon: -83.1771, alt: 17, headingMode: 'towardPOI' },
      { lat: 40.0129, lon: -83.1771, alt: 17, headingMode: 'towardPOI' }
    ];
    const xmlOrbit = vm.runInThisContext(\`buildWaylinesWpml(\${JSON.stringify(orbitWps)}, 17, 4, 'towardPOI', 'goHome', -90, 'stopAndShoot', 'straight')\`);
    assert.strictEqual(xmlOrbit.includes('<wpml:waypointHeadingAngle>NaN</wpml:waypointHeadingAngle>'), false);
    assert.strictEqual(xmlOrbit.includes('<wpml:waypointHeadingAngleEnable>1</wpml:waypointHeadingAngleEnable>'), true);
  });
});

describe('RC2 WPML Compliance Tests', () => {
  const rc2GoldenTags = [
    'actionGroupStartIndex', 'actionGroupMode', 'waypointHeadingPathMode', 'flyToWaylineMode',
    'waypointHeadingMode', 'Point', 'waypointHeadingPoiIndex',
    'actionGroup', 'exitOnRCLost', 'distance', 'actionGroupEndIndex', 'waypointHeadingAngle',
    'useStraightLine', 'action', 'executeHeight', 'Placemark',
    'actionActuatorFunc', 'waypointTurnMode', 'actionActuatorFuncParam', 'duration',
    'gimbalPitchRotateAngle', 'waypointPoiPoint', 'waylineId',
    'waypointTurnDampingDist', 'gimbalRollRotateAngle', 'droneSubEnumValue', 'droneInfo',
    'actionId', 'actionGroupId', 'actionTriggerType', 'executeHeightMode', 'waypointHeadingParam',
    'coordinates', 'droneEnumValue', 'actionTrigger', 'globalTransitionalSpeed', 'autoFlightSpeed',
    'Document', 'executeRCLostAction', 'index', 'finishAction', 'templateId', 'waypointSpeed',
    'missionConfig', 'waypointTurnParam', 'Folder', 'payloadPositionIndex',
    'waypointHeadingAngleEnable'
  ];

  test('buildWaylinesWpml should contain all required RC2 golden tags for standard flight', () => {
    try {
      vm.runInThisContext(\`
        generatedWaypoints = [
          { lat: 41.88, lon: -87.62, alt: 50, heading: 0, pitch: -90, hoverTime: 5, cameraAction: 'takePhoto', gimbalPitch: -45 },
          { lat: 41.89, lon: -87.62, alt: 50, heading: 0, pitch: -90, hoverTime: 0, cameraAction: 'none' }
        ];
        document.getElementById = (id) => {
          const valMap = {
            'finish-action': 'goHome',
            'flight-speed': '5',
            'rc-lost-action': 'goHome',
            'gimbal-pitch': '-90'
          };
          return { value: valMap[id] || '', checked: true };
        };
      \`);

      const xmlString = vm.runInThisContext('buildWaylinesWpml(generatedWaypoints, "waypoint")');
      const tagMatches = xmlString.matchAll(/<([a-zA-Z0-9]+:)?([a-zA-Z0-9]+)[>\\s]/g);
      const generatedTags = new Set([...tagMatches].map(m => m[2]));

      const missingTags = rc2GoldenTags.filter(t => !generatedTags.has(t));
      assert.deepStrictEqual(missingTags, [], 'Generated WPML should not miss any RC2 required tags');
      assert.ok(xmlString.includes('<wpml:waypointHeadingAngleEnable>1</wpml:waypointHeadingAngleEnable>'), 'waypointHeadingAngleEnable must be true/1');
      assert.ok(xmlString.includes('<wpml:actionGroupStartIndex>0</wpml:actionGroupStartIndex>'), 'actionGroupStartIndex should be a valid number');
    } finally {
      vm.runInThisContext('generatedWaypoints = [];');
    }
  });
});
`;
fs.appendFileSync('index.test.js', suites);
