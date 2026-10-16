/**
 * tools/node-red-contrib-aalaapi/nodes/aalaapi-splat-prep.js
 * Node-RED Transform Node preparing 3D Gaussian Splatting / COLMAP reconstruction manifests.
 */

const fs = require('node:fs');
const path = require('node:path');
const BridgeClient = require('../lib/bridge-client.js');
const { generateNerfstudioManifest } = require('../lib/nerfstudio-splat.js');
const { generateColmapPriors } = require('../lib/colmap-prior.js');

module.exports = function(RED) {
  function AalaapiSplatPrepNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    node.bridgeConfig = RED.nodes.getNode(config.bridge);
    node.outputFormat = config.outputFormat || 'nerfstudio'; // 'nerfstudio', 'colmap', 'both'
    node.writeToDisk = config.writeToDisk !== false;
    node.filterQuality = config.filterQuality || 'clean_and_warnings'; // 'clean_only', 'clean_and_warnings', 'all'
    node.hfov = Number(config.hfov) || 73.7;
    node.vfov = Number(config.vfov) || 53.1;
    node.imageWidth = Number(config.imageWidth) || 4000;
    node.imageHeight = Number(config.imageHeight) || 3000;

    let client = null;
    if (node.bridgeConfig) {
      client = new BridgeClient({
        host: node.bridgeConfig.host,
        port: node.bridgeConfig.port,
        protocol: node.bridgeConfig.protocol,
        timeout: node.bridgeConfig.timeout
      });
    }

    node.on('input', async function(msg, send, done) {
      send = send || function() { node.send.apply(node, arguments); };
      done = done || function(err) { if (err) node.error(err, msg); };

      try {
        node.status({ fill: 'blue', shape: 'dot', text: 'Processing spatial data...' });

        // 1. Resolve manifest and photos from incoming message or bridge
        let manifest = msg.manifest || msg.payload?.manifest || null;
        let photos = msg.photos || msg.payload?.photos || (manifest?.photos) || [];
        const missionUuid = msg.missionUuid || msg.payload?.missionUuid || (manifest?.missionUuid) || null;
        const targetDir = msg.targetDir || msg.payload?.targetDir || null;

        if (photos.length === 0 && missionUuid && client) {
          try {
            const fetched = await client.getManifest(missionUuid);
            if (fetched && fetched.photos) {
              manifest = fetched;
              photos = fetched.photos;
            }
          } catch (fetchErr) {
            node.warn(`Could not fetch manifest for mission ${missionUuid}: ${fetchErr.message}`);
          }
        }

        if (!Array.isArray(photos) || photos.length === 0) {
          throw new Error('No photos or manifest provided in msg.photos, msg.manifest, or Bridge query');
        }

        // 2. Quality / Severity filter
        let allowedSeverities = ['clean', 'warning', 'all'];
        if (node.filterQuality === 'clean_only') {
          allowedSeverities = ['clean'];
        } else if (node.filterQuality === 'clean_and_warnings') {
          allowedSeverities = ['clean', 'warning'];
        }

        const filteredPhotos = photos.filter(p => {
          const sev = p.severity || 'clean';
          return allowedSeverities.includes('all') || allowedSeverities.includes(sev);
        });

        if (filteredPhotos.length === 0) {
          throw new Error(`All ${photos.length} photos were excluded by quality filter (${node.filterQuality})`);
        }

        const outPayload = {
          success: true,
          missionUuid,
          targetDir,
          totalInputPhotos: photos.length,
          acceptedPhotos: filteredPhotos.length,
          filterQuality: node.filterQuality
        };

        // 3. Generate Nerfstudio transforms.json
        if (node.outputFormat === 'nerfstudio' || node.outputFormat === 'both') {
          const transformsManifest = generateNerfstudioManifest({
            photos: filteredPhotos,
            hfov: node.hfov,
            vfov: node.vfov,
            imageWidth: node.imageWidth,
            imageHeight: node.imageHeight,
            imagesSubdir: 'photos/raw'
          });

          outPayload.transforms = transformsManifest;

          if (node.writeToDisk && targetDir && fs.existsSync(targetDir)) {
            const transformsPath = path.join(targetDir, 'transforms.json');
            fs.writeFileSync(transformsPath, JSON.stringify(transformsManifest, null, 2), 'utf8');
            outPayload.transformsPath = transformsPath;
          }
        }

        // 4. Generate COLMAP Priors
        if (node.outputFormat === 'colmap' || node.outputFormat === 'both') {
          const colmapPriors = generateColmapPriors({
            photos: filteredPhotos,
            hfov: node.hfov,
            vfov: node.vfov,
            imageWidth: node.imageWidth,
            imageHeight: node.imageHeight
          });

          outPayload.colmap = colmapPriors;

          if (node.writeToDisk && targetDir && fs.existsSync(targetDir)) {
            const colmapDir = path.join(targetDir, 'colmap_priors');
            if (!fs.existsSync(colmapDir)) fs.mkdirSync(colmapDir, { recursive: true });
            fs.writeFileSync(path.join(colmapDir, 'cameras.txt'), colmapPriors.camerasTxt, 'utf8');
            fs.writeFileSync(path.join(colmapDir, 'images.txt'), colmapPriors.imagesTxt, 'utf8');
            outPayload.colmapDir = colmapDir;
          }
        }

        node.status({ fill: 'green', shape: 'dot', text: `Prepared ${filteredPhotos.length} poses` });

        msg.payload = outPayload;
        msg.transforms = outPayload.transforms;
        if (outPayload.transformsPath) msg.transformsPath = outPayload.transformsPath;
        if (outPayload.colmapDir) msg.colmapDir = outPayload.colmapDir;

        send(msg);
        done();
      } catch (err) {
        node.status({ fill: 'red', shape: 'dot', text: err.message });
        done(err);
      }
    });

    node.on('close', (done) => {
      if (client) client.disconnect();
      done();
    });
  }

  RED.nodes.registerType('aalaapi-splat-prep', AalaapiSplatPrepNode);
};
