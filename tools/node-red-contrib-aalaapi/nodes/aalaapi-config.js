/**
 * tools/node-red-contrib-aalaapi/nodes/aalaapi-config.js
 * Node-RED Configuration Node for Aalaapi Bridge.
 */

const BridgeClient = require('../lib/bridge-client.js');

module.exports = function(RED) {
  function AalaapiConfigNode(n) {
    RED.nodes.createNode(this, n);
    this.host = n.host || '127.0.0.1';
    this.port = Number(n.port) || 8765;
    this.protocol = n.protocol || 'http:';
    this.timeout = Number(n.timeout) || 8000;
    this.name = n.name || `Aalaapi Bridge (${this.host}:${this.port})`;

    this.client = new BridgeClient({
      host: this.host,
      port: this.port,
      protocol: this.protocol,
      timeout: this.timeout
    });

    this.on('close', (done) => {
      if (this.client) {
        this.client.disconnect();
      }
      done();
    });
  }

  RED.nodes.registerType('aalaapi-config', AalaapiConfigNode);

  // Admin HTTP endpoint for testing connection directly from the Node-RED editor
  RED.httpAdmin.get('/aalaapi-bridge/test-connection', RED.auth.needsPermission('aalaapi.read'), async function(req, res) {
    const host = req.query.host || '127.0.0.1';
    const port = Number(req.query.port) || 8765;
    const protocol = req.query.protocol || 'http:';

    const testClient = new BridgeClient({ host, port, protocol, timeout: 4000 });
    const health = await testClient.checkHealth();

    if (health.healthy) {
      res.json({
        success: true,
        message: `Successfully connected to Aalaapi Bridge at ${protocol}//${host}:${port}`,
        status: health.status
      });
    } else {
      res.status(502).json({
        success: false,
        message: `Failed to connect to Aalaapi Bridge at ${protocol}//${host}:${port}: ${health.error}`,
        error: health.error
      });
    }
  });
};
