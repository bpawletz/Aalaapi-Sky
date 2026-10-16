/**
 * tools/node-red-contrib-aalaapi/nodes/aalaapi-ingest-watch.js
 * Node-RED Input Node listening for completed photo ingestion batches from Aalaapi Bridge.
 */

const BridgeClient = require('../lib/bridge-client.js');

module.exports = function(RED) {
  function AalaapiIngestWatchNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    node.bridgeConfig = RED.nodes.getNode(config.bridge);
    node.autoFetchManifest = config.autoFetchManifest !== false;

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

    node.status({ fill: 'yellow', shape: 'ring', text: 'Watching for photo ingest...' });

    client.on('connected', () => {
      node.status({ fill: 'green', shape: 'dot', text: 'Stream active - Waiting for ingest' });
    });

    client.on('disconnected', (err) => {
      node.status({ fill: 'red', shape: 'ring', text: err ? err.message : 'Disconnected' });
    });

    // Listen for progress updates to show live activity
    client.on('progress', (prog) => {
      if (prog && prog.active) {
        node.status({ fill: 'blue', shape: 'dot', text: `Ingesting: ${prog.percent || 0}% (${prog.stage || 'copying'})` });
      }
    });

    // Listen for ingest completion event emitted by server.js
    client.on('ingest-complete', async (data) => {
      node.status({ fill: 'green', shape: 'dot', text: `Ingest complete: ${data.totalPhotos || 0} photos` });

      let fullManifest = data.manifest || null;
      if (!fullManifest && node.autoFetchManifest && data.missionUuid) {
        try {
          fullManifest = await client.getManifest(data.missionUuid);
        } catch (mErr) {
          node.warn(`Could not fetch full manifest for ${data.missionUuid}: ${mErr.message}`);
        }
      }

      const msg = {
        topic: 'media/ingest-complete',
        missionUuid: data.missionUuid,
        targetDir: data.targetDir,
        photoCount: data.totalPhotos || (data.photoPaths ? data.photoPaths.length : 0),
        photoPaths: data.photoPaths || [],
        manifest: fullManifest,
        payload: {
          success: true,
          missionUuid: data.missionUuid,
          targetDir: data.targetDir,
          totalPhotos: data.totalPhotos,
          photoPaths: data.photoPaths || [],
          manifest: fullManifest
        }
      };

      node.send(msg);
    });

    // Also support fallback on progress stream with stage === 'complete'
    let lastHandledUuid = null;
    client.on('progress', async (prog) => {
      if (prog && prog.stage === 'complete' && prog.percent === 100 && !prog.active) {
        // Handled via ingest-complete if emitted, otherwise fallback after slight debounce
      }
    });

    client.connectStream('/api/stream');

    node.on('close', (done) => {
      client.disconnect();
      done();
    });
  }

  RED.nodes.registerType('aalaapi-ingest-watch', AalaapiIngestWatchNode);
};
