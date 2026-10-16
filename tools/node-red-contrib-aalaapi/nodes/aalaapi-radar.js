/**
 * tools/node-red-contrib-aalaapi/nodes/aalaapi-radar.js
 * Node-RED Input Node for live ASTM F3411 Remote ID drone detection.
 */

const BridgeClient = require('../lib/bridge-client.js');

module.exports = function(RED) {
  function AalaapiRadarNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    node.bridgeConfig = RED.nodes.getNode(config.bridge);
    node.mode = config.mode || 'stream'; // 'stream' or 'poll'
    node.pollInterval = Number(config.pollInterval) || 3000;
    node.filterUasId = (config.filterUasId || '').trim();
    node.minAltMeters = config.minAltMeters !== '' && !isNaN(config.minAltMeters) ? Number(config.minAltMeters) : null;
    node.maxAltMeters = config.maxAltMeters !== '' && !isNaN(config.maxAltMeters) ? Number(config.maxAltMeters) : null;

    if (!node.bridgeConfig) {
      node.status({ fill: 'red', shape: 'ring', text: 'No bridge configured' });
      return;
    }

    const client = new BridgeClient({
      host: node.bridgeConfig.host,
      port: node.bridgeConfig.port,
      protocol: node.bridgeConfig.protocol,
      timeout: node.bridgeConfig.timeout
    });

    let pollTimer = null;

    function processDrones(drones) {
      if (!Array.isArray(drones)) return;

      let filtered = drones;
      if (node.filterUasId) {
        filtered = filtered.filter(d => (d.uasId && d.uasId.includes(node.filterUasId)) || (d.mac && d.mac.includes(node.filterUasId)));
      }
      if (node.minAltMeters !== null) {
        filtered = filtered.filter(d => (d.heightAgl !== null && d.heightAgl >= node.minAltMeters) || (d.altitudeMsl !== null && d.altitudeMsl >= node.minAltMeters));
      }
      if (node.maxAltMeters !== null) {
        filtered = filtered.filter(d => (d.heightAgl !== null && d.heightAgl <= node.maxAltMeters) || (d.altitudeMsl !== null && d.altitudeMsl <= node.maxAltMeters));
      }

      node.status({
        fill: filtered.length > 0 ? 'green' : 'grey',
        shape: filtered.length > 0 ? 'dot' : 'ring',
        text: `${filtered.length} drone${filtered.length === 1 ? '' : 's'} in airspace`
      });

      if (filtered.length > 0) {
        node.send({
          topic: 'remote-id/radar',
          payload: {
            count: filtered.length,
            totalActive: drones.length,
            timestamp: new Date().toISOString(),
            drones: filtered
          }
        });
      }
    }

    if (node.mode === 'stream') {
      node.status({ fill: 'yellow', shape: 'ring', text: 'Connecting stream...' });
      
      client.on('connected', () => {
        node.status({ fill: 'green', shape: 'dot', text: 'Stream connected' });
      });

      client.on('disconnected', (err) => {
        node.status({ fill: 'red', shape: 'ring', text: err ? err.message : 'Disconnected' });
      });

      client.on('remote-id', (payload) => {
        const droneList = payload?.drones || [];
        processDrones(droneList);
      });

      client.on('error', (err) => {
        node.status({ fill: 'red', shape: 'ring', text: err.message });
      });

      client.connectStream('/api/stream');
    } else {
      // Polling mode
      node.status({ fill: 'yellow', shape: 'ring', text: `Polling every ${node.pollInterval}ms` });
      
      const poll = async () => {
        try {
          const res = await client.getActiveDrones();
          processDrones(res?.drones || []);
        } catch (err) {
          node.status({ fill: 'red', shape: 'ring', text: err.message });
        }
      };

      poll();
      pollTimer = setInterval(poll, node.pollInterval);
    }

    node.on('close', (done) => {
      if (pollTimer) clearInterval(pollTimer);
      client.disconnect();
      done();
    });
  }

  RED.nodes.registerType('aalaapi-radar', AalaapiRadarNode);
};
