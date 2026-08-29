#!/usr/bin/env node
/**
 * Aalaapi Sky - Multi-Vendor Model Context Protocol (MCP) Server
 * 
 * Provides an open-standard MCP interface for Google Antigravity, Claude Desktop,
 * Cursor IDE, and OpenAI ChatGPT to interact directly with:
 * - Bad KMZ history & triage in scratch/missions.db
 * - Live pre-flight WPML / Autel / MAVLink linters
 * - Cross-vendor mission conversion (DJI WPML <-> QGroundControl .plan)
 * - Drone RC 2 MTP / ADB extraction
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { DiagnosticsDatabase } = require('./diagnostics_db.js');

const SERVER_NAME = 'aalaapi-companion';
const SERVER_VERSION = '1.57.0';
const DB_PATH = path.resolve(__dirname, '..', '..', 'scratch', 'missions.db');

// Multi-vendor mode flag (can be enabled via env, CLI args, or tool call)
let multiVendorEnabled = process.env.AALAAPI_MULTIVENDOR === 'true' || process.argv.includes('--multivendor') || false;

function getDb() {
  return new DiagnosticsDatabase(DB_PATH);
}

// Convert waypoints to QGroundControl .plan format
function convertWaypointsToQgcPlan(waypoints, options = {}) {
  const cruiseSpeed = options.speed || 4.0;
  const hoverSpeed = 3.0;
  const defaultAlt = options.altitude || 50.0;
  const globalPitch = options.gimbalPitch !== undefined ? options.gimbalPitch : -90.0;
  const home = options.homePosition || (waypoints && waypoints.length > 0 ? [waypoints[0].lat, waypoints[0].lon, defaultAlt] : [0, 0, 0]);

  const items = [];
  let seq = 1;

  items.push({
    AMSLAltAboveTerrain: null,
    Altitude: defaultAlt,
    AltitudeMode: 1,
    autoContinue: true,
    command: 22, // MAV_CMD_NAV_TAKEOFF
    doJumpId: seq,
    frame: 3,
    params: [15, 0, 0, null, home[0], home[1], defaultAlt],
    type: "SimpleItem"
  });
  seq++;

  items.push({
    AMSLAltAboveTerrain: null,
    Altitude: defaultAlt,
    AltitudeMode: 1,
    autoContinue: true,
    command: 205, // MAV_CMD_DO_MOUNT_CONTROL
    doJumpId: seq,
    frame: 2,
    params: [globalPitch, 0, 0, 0, 0, 0, 2],
    type: "SimpleItem"
  });
  seq++;

  (waypoints || []).forEach((wp) => {
    const lat = wp.lat;
    const lon = wp.lon;
    const alt = wp.alt !== undefined ? wp.alt : (wp.altitude !== undefined ? wp.altitude : defaultAlt);
    const yaw = wp.heading !== undefined ? wp.heading : null;
    const hoverTime = wp.hoverTime !== undefined ? wp.hoverTime : (wp.isPhoto ? 2 : 0);

    items.push({
      AMSLAltAboveTerrain: null,
      Altitude: alt,
      AltitudeMode: 1,
      autoContinue: true,
      command: 16, // MAV_CMD_NAV_WAYPOINT
      doJumpId: seq,
      frame: 3,
      params: [hoverTime, 2, 0, yaw, lat, lon, alt],
      type: "SimpleItem"
    });
    seq++;

    if (wp.isPhoto) {
      items.push({
        AMSLAltAboveTerrain: null,
        Altitude: alt,
        AltitudeMode: 1,
        autoContinue: true,
        command: 203, // MAV_CMD_DO_DIGICAM_CONTROL
        doJumpId: seq,
        frame: 2,
        params: [0, 0, 0, 0, 1, 0, 0],
        type: "SimpleItem"
      });
      seq++;
    }
  });

  items.push({
    AMSLAltAboveTerrain: null,
    Altitude: defaultAlt,
    AltitudeMode: 1,
    autoContinue: true,
    command: 20, // MAV_CMD_NAV_RETURN_TO_LAUNCH
    doJumpId: seq,
    frame: 2,
    params: [0, 0, 0, 0, 0, 0, 0],
    type: "SimpleItem"
  });

  return {
    fileType: "Plan",
    geoFence: { circles: [], polygons: [], version: 2 },
    groundStation: "QGroundControl",
    mission: {
      cruiseSpeed: cruiseSpeed,
      firmwareType: 12,
      hoverSpeed: hoverSpeed,
      items: items,
      plannedHomePosition: home,
      vehicleType: 2,
      version: 2
    },
    rallyPoints: { points: [], version: 2 },
    version: 1
  };
}

// Convert waypoints to Autel KML format
function convertWaypointsToAutelKml(waypoints, options = {}) {
  const name = options.name || 'Autel_Mission';
  const speed = options.speed || 4.0;
  const defaultAlt = options.altitude || 50.0;
  const gimbalPitch = options.gimbalPitch !== undefined ? options.gimbalPitch : -90.0;

  let placemarksXml = '';
  (waypoints || []).forEach((wp, idx) => {
    const lat = wp.lat;
    const lon = wp.lon;
    const alt = wp.alt !== undefined ? wp.alt : (wp.altitude !== undefined ? wp.altitude : defaultAlt);
    const pitch = wp.pitch !== undefined ? wp.pitch : (wp.gimbalPitch !== undefined ? wp.gimbalPitch : gimbalPitch);
    const heading = wp.heading !== undefined ? wp.heading : 0;

    placemarksXml += `
        <Placemark>
          <name>Waypoint ${idx + 1}</name>
          <description>Autel Waypoint ${idx + 1}</description>
          <Point>
            <altitudeMode>relativeToGround</altitudeMode>
            <coordinates>${lon},${lat},${alt}</coordinates>
          </Point>
          <ExtendedData>
            <Data name="speed"><value>${speed}</value></Data>
            <Data name="gimbalPitch"><value>${pitch}</value></Data>
            <Data name="heading"><value>${heading}</value></Data>
            <Data name="action"><value>${wp.isPhoto ? 'takePhoto' : 'none'}</value></Data>
          </ExtendedData>
        </Placemark>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${name}</name>
    <Folder>
      <name>Waypoints</name>${placemarksXml}
    </Folder>
  </Document>
</kml>`;
}

// MCP Tools Definition
function getToolDefinitions() {
  const tools = [
    {
      name: 'get_latest_bad_mission',
      description: 'Retrieves the most recent failed, suspended, or invalid mission from SQLite diagnostics history, including exact rule violations and offending WPML XML.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false
      }
    },
    {
      name: 'list_bad_missions',
      description: 'Lists all historically recorded bad or suspended missions in SQLite.',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Maximum records to return (default 20)' }
        },
        additionalProperties: false
      }
    },
    {
      name: 'set_multivendor_mode',
      description: 'Enables or disables Multi-Vendor Autopilot support (PX4, ArduPilot, MAVLink, and Autel Robotics).',
      inputSchema: {
        type: 'object',
        properties: {
          enabled: { type: 'boolean', description: 'True to enable multi-vendor mode, false to revert to standard DJI mode' }
        },
        required: ['enabled'],
        additionalProperties: false
      }
    }
  ];

  // If multi-vendor mode is active, expose cross-vendor conversion & export tools
  if (multiVendorEnabled) {
    tools.push({
      name: 'convert_mission_format',
      description: 'Converts waypoints into multi-vendor autopilot formats (QGroundControl .plan for PX4/ArduPilot or Autel .kml).',
      inputSchema: {
        type: 'object',
        properties: {
          targetFormat: { type: 'string', enum: ['qgc_plan', 'autel_kml'], description: 'Desired output format' },
          waypoints: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                lat: { type: 'number' },
                lon: { type: 'number' },
                alt: { type: 'number' },
                heading: { type: 'number' },
                isPhoto: { type: 'boolean' }
              },
              required: ['lat', 'lon']
            }
          },
          speed: { type: 'number', description: 'Flight speed in m/s (default 4)' },
          altitude: { type: 'number', description: 'Flight altitude in meters (default 50)' },
          gimbalPitch: { type: 'number', description: 'Gimbal pitch in degrees (default -90)' }
        },
        required: ['targetFormat', 'waypoints'],
        additionalProperties: false
      }
    });
  }

  return tools;
}

// Tool Call Execution Handler
async function handleToolCall(name, args) {
  if (name === 'get_latest_bad_mission') {
    const db = getDb();
    const bad = db.getLatestBadMission();
    db.close();
    if (!bad) {
      return { content: [{ type: 'text', text: 'No bad or suspended missions currently recorded in SQLite history.' }] };
    }
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          uuid: bad.uuid,
          filename: bad.filename,
          timestamp: bad.timestamp,
          isValid: bad.is_valid === 1,
          rulesPassed: `${bad.validation_rules_passed}/10`,
          errors: bad.validationErrors,
          executionStatus: bad.execution_status,
          executionError: bad.execution_error,
          wpmlXmlSnippet: bad.wpml_xml ? bad.wpml_xml.slice(0, 800) + '...' : null
        }, null, 2)
      }]
    };
  }

  if (name === 'list_bad_missions') {
    const db = getDb();
    const list = db.getBadMissions(args?.limit || 20);
    db.close();
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(list, null, 2)
      }]
    };
  }

  if (name === 'set_multivendor_mode') {
    multiVendorEnabled = !!args?.enabled;
    return {
      content: [{
        type: 'text',
        text: `Multi-Vendor Autopilot support is now ${multiVendorEnabled ? 'ENABLED (PX4, MAVLink, and Autel tools active)' : 'DISABLED (Standard DJI mode)'}.`
      }]
    };
  }

  if (name === 'convert_mission_format') {
    if (!multiVendorEnabled) {
      return {
        isError: true,
        content: [{ type: 'text', text: 'Multi-Vendor mode is currently disabled. Use set_multivendor_mode({ enabled: true }) first.' }]
      };
    }
    const { targetFormat, waypoints, speed, altitude, gimbalPitch } = args;
    if (targetFormat === 'qgc_plan') {
      const plan = convertWaypointsToQgcPlan(waypoints, { speed, altitude, gimbalPitch });
      return { content: [{ type: 'text', text: JSON.stringify(plan, null, 2) }] };
    } else if (targetFormat === 'autel_kml') {
      const kml = convertWaypointsToAutelKml(waypoints, { speed, altitude, gimbalPitch });
      return { content: [{ type: 'text', text: kml }] };
    }
    return { isError: true, content: [{ type: 'text', text: `Unknown format: ${targetFormat}` }] };
  }

  return { isError: true, content: [{ type: 'text', text: `Unknown tool: ${name}` }] };
}

// JSON-RPC Request Processor
async function processRpcMessage(msg) {
  if (!msg || typeof msg !== 'object') return null;

  if (!msg.id) {
    return null;
  }

  const { id, method, params } = msg;

  if (method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {}
        },
        serverInfo: {
          name: SERVER_NAME,
          version: SERVER_VERSION
        }
      }
    };
  }

  if (method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        tools: getToolDefinitions()
      }
    };
  }

  if (method === 'tools/call') {
    const { name, arguments: toolArgs } = params || {};
    try {
      const res = await handleToolCall(name, toolArgs);
      return {
        jsonrpc: '2.0',
        id,
        result: res
      };
    } catch (err) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message: err.message
        }
      };
    }
  }

  return {
    jsonrpc: '2.0',
    id,
    error: {
      code: -32601,
      message: `Method not found: ${method}`
    }
  };
}

// Start stdio interface when run directly
function startStdio() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });

  rl.on('line', async (line) => {
    if (!line.trim()) return;
    try {
      const req = JSON.parse(line);
      const res = await processRpcMessage(req);
      if (res) {
        process.stdout.write(JSON.stringify(res) + '\n');
      }
    } catch (e) {
      const errRes = {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error: ' + e.message }
      };
      process.stdout.write(JSON.stringify(errRes) + '\n');
    }
  });
}

if (require.main === module) {
  startStdio();
}

module.exports = {
  SERVER_NAME,
  SERVER_VERSION,
  getToolDefinitions,
  handleToolCall,
  processRpcMessage,
  convertWaypointsToQgcPlan,
  convertWaypointsToAutelKml,
  setMultiVendorEnabled: (val) => { multiVendorEnabled = !!val; },
  isMultiVendorEnabled: () => multiVendorEnabled
};
