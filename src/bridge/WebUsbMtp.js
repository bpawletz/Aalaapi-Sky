/**
 * Aalaapi Sky - WebUSB MTP Engine
 *
 * Implements client-side MTP (Media Transfer Protocol / PTP over USB)
 * via navigator.usb for direct 1-click KMZ pushing and flight log pulling
 * on Android and ChromeOS tablets without requiring local companion servers.
 *
 * Target: DJI RC 2 / Android MTP devices
 * Vendor ID: 0x2CA3 (DJI) or standard USB Still Image / MTP interface class
 */

const PTP_CONTAINER_TYPE_COMMAND = 1;
const PTP_CONTAINER_TYPE_DATA = 2;
const PTP_CONTAINER_TYPE_RESPONSE = 3;
const PTP_CONTAINER_TYPE_EVENT = 4;

// PTP / MTP Standard Operation Codes
const PTP_OP_OPEN_SESSION = 0x1002;
const PTP_OP_CLOSE_SESSION = 0x1003;
const PTP_OP_GET_STORAGE_IDS = 0x1004;
const PTP_OP_GET_STORAGE_INFO = 0x1005;
const PTP_OP_GET_OBJECT_HANDLES = 0x1007;
const PTP_OP_GET_OBJECT_INFO = 0x1008;
const PTP_OP_GET_OBJECT = 0x1009;
const PTP_OP_SEND_OBJECT_INFO = 0x100C;
const PTP_OP_SEND_OBJECT = 0x100D;
const PTP_OP_DELETE_OBJECT = 0x100B;

// Response Codes
const PTP_RC_OK = 0x2001;

// Standard Object Formats
const PTP_OFC_ASSOCIATION = 0x3001; // Folder
const PTP_OFC_UNDEFINED = 0x3000;
const PTP_OFC_TEXT = 0x3004;

class WebUsbMtpEngine {
  constructor() {
    this.device = null;
    this.interfaceNumber = null;
    this.endpointIn = null;
    this.endpointOut = null;
    this.sessionId = 1;
    this.transactionId = 1;
    this.isConnected = false;
    this.selectedStorageId = null;
    this.targetWaypointFolderHandle = null;
  }

  isSupported() {
    return typeof navigator !== 'undefined' && Boolean(navigator.usb);
  }

  nextTransactionId() {
    return this.transactionId++;
  }

  /**
   * Request user permission and select DJI RC 2 or MTP device
   */
  async requestDevice() {
    if (!this.isSupported()) {
      throw new Error('WebUSB is not supported in this browser. Please use Chrome on Android or ChromeOS.');
    }

    const filters = [
      { vendorId: 0x2ca3 }, // DJI Official Vendor ID
      // Fallback: Standard MTP / PTP class (Still Image Class 6, Subclass 1, Protocol 1)
      { classCode: 6, subclassCode: 1, protocolCode: 1 }
    ];

    try {
      this.device = await navigator.usb.requestDevice({ filters });
    } catch (err) {
      // User cancelled or no device selected
      throw new Error(`Device selection cancelled: ${err.message}`);
    }

    return this.device;
  }

  /**
   * Connect and configure USB endpoints for MTP bulk transfers
   */
  async connect() {
    if (!this.device) {
      await this.requestDevice();
    }

    await this.device.open();

    // Select configuration if not already selected
    if (this.device.configuration === null) {
      await this.device.selectConfiguration(1);
    }

    // Find MTP / Still Image interface or interface with Bulk IN and Bulk OUT endpoints
    let foundInterface = null;
    let inEp = null;
    let outEp = null;

    for (const iface of this.device.configuration.interfaces) {
      for (const alt of iface.alternates) {
        let epIn = null;
        let epOut = null;
        for (const ep of alt.endpoints) {
          if (ep.type === 'bulk') {
            if (ep.direction === 'in') epIn = ep.endpointNumber;
            if (ep.direction === 'out') epOut = ep.endpointNumber;
          }
        }
        if (epIn !== null && epOut !== null) {
          foundInterface = iface.interfaceNumber;
          inEp = epIn;
          outEp = epOut;
          break;
        }
      }
      if (foundInterface !== null) break;
    }

    if (foundInterface === null) {
      throw new Error('Could not find suitable MTP Bulk endpoints on connected USB device.');
    }

    this.interfaceNumber = foundInterface;
    this.endpointIn = inEp;
    this.endpointOut = outEp;

    await this.device.claimInterface(this.interfaceNumber);
    this.isConnected = true;

    // Open PTP / MTP Session
    await this.openSession();

    return {
      success: true,
      productName: this.device.productName || 'DJI RC 2',
      manufacturerName: this.device.manufacturerName || 'DJI'
    };
  }

  /**
   * Disconnect and release claimed USB interface
   */
  async disconnect() {
    try {
      if (this.isConnected && this.device) {
        try {
          await this.closeSession();
        } catch (_) {}
        if (this.interfaceNumber !== null) {
          await this.device.releaseInterface(this.interfaceNumber);
        }
        await this.device.close();
      }
    } catch (_) {
    } finally {
      this.isConnected = false;
      this.device = null;
      this.interfaceNumber = null;
      this.endpointIn = null;
      this.endpointOut = null;
    }
  }

  /**
   * Build a PTP/MTP Container Header Buffer
   */
  buildContainer(type, code, transactionId, payload = new Uint8Array(0), params = []) {
    const paramBytesLength = params.length * 4;
    const totalLength = 12 + paramBytesLength + payload.byteLength;
    const buffer = new ArrayBuffer(totalLength);
    const view = new DataView(buffer);

    view.setUint32(0, totalLength, true); // Container Length
    view.setUint16(4, type, true);        // Container Type
    view.setUint16(6, code, true);        // Code (OpCode, ResponseCode, EventCode)
    view.setUint32(8, transactionId, true); // Transaction ID

    let offset = 12;
    for (const p of params) {
      view.setUint32(offset, p, true);
      offset += 4;
    }

    if (payload.byteLength > 0) {
      new Uint8Array(buffer, offset).set(new Uint8Array(payload));
    }

    return buffer;
  }

  /**
   * Parse a received PTP/MTP container
   */
  parseContainer(arrayBuffer) {
    if (!arrayBuffer || arrayBuffer.byteLength < 12) {
      return { length: 0, type: 0, code: 0, transactionId: 0, payload: new Uint8Array(0), params: [] };
    }
    const view = new DataView(arrayBuffer);
    const length = view.getUint32(0, true);
    const type = view.getUint16(4, true);
    const code = view.getUint16(6, true);
    const transactionId = view.getUint32(8, true);

    const params = [];
    const payloadLength = Math.max(0, length - 12);
    // If response or command, params may be up to 5 uint32s
    if (type === PTP_CONTAINER_TYPE_RESPONSE || type === PTP_CONTAINER_TYPE_COMMAND) {
      for (let o = 12; o + 4 <= length && params.length < 5; o += 4) {
        params.push(view.getUint32(o, true));
      }
    }

    const payload = new Uint8Array(arrayBuffer.slice(12, length));

    return { length, type, code, transactionId, params, payload, buffer: arrayBuffer };
  }

  /**
   * Send a PTP command and wait for response/data
   */
  async sendCommand(opCode, params = []) {
    if (!this.isConnected || !this.device) {
      throw new Error('MTP device not connected.');
    }

    const txId = this.nextTransactionId();
    const cmdBuffer = this.buildContainer(PTP_CONTAINER_TYPE_COMMAND, opCode, txId, new Uint8Array(0), params);

    await this.device.transferOut(this.endpointOut, cmdBuffer);

    // Read response or incoming data
    const res = await this.device.transferIn(this.endpointIn, 1024 * 1024);
    if (!res.data) {
      throw new Error(`MTP read failed for OpCode 0x${opCode.toString(16)}`);
    }

    const container = this.parseContainer(res.data.buffer);
    return container;
  }

  /**
   * Open session with MTP device
   */
  async openSession() {
    this.sessionId = 1;
    this.transactionId = 1;
    try {
      const res = await this.sendCommand(PTP_OP_OPEN_SESSION, [this.sessionId]);
      return res;
    } catch (e) {
      // Session may already be open; continue
      return { code: PTP_RC_OK };
    }
  }

  /**
   * Close active session
   */
  async closeSession() {
    try {
      await this.sendCommand(PTP_OP_CLOSE_SESSION);
    } catch (_) {}
  }

  /**
   * Read storage IDs from RC 2
   */
  async getStorageIds() {
    const res = await this.sendCommand(PTP_OP_GET_STORAGE_IDS);
    const storageIds = [];
    if (res.payload && res.payload.byteLength >= 4) {
      const view = new DataView(res.payload.buffer, res.payload.byteOffset, res.payload.byteLength);
      const count = view.getUint32(0, true);
      for (let i = 0; i < count; i++) {
        storageIds.push(view.getUint32(4 + i * 4, true));
      }
    }
    if (storageIds.length > 0) {
      this.selectedStorageId = storageIds[0];
    }
    return storageIds;
  }

  /**
   * Encode a string into PTP Pascal string format (length byte + UTF-16LE + 0x0000)
   */
  encodePtpString(str) {
    if (!str || str.length === 0) return new Uint8Array([0]);
    const numChars = str.length + 1; // including null terminator
    const buffer = new ArrayBuffer(1 + numChars * 2);
    const view = new DataView(buffer);
    view.setUint8(0, numChars);
    for (let i = 0; i < str.length; i++) {
      view.setUint16(1 + i * 2, str.charCodeAt(i), true);
    }
    view.setUint16(1 + str.length * 2, 0, true); // null terminator
    return new Uint8Array(buffer);
  }

  /**
   * Push a KMZ file directly to the DJI RC 2 controller storage
   * Path: /Android/data/dji.go.v5/files/waypoint/{uuid}.kmz
   */
  async pushKmz(filename, kmzArrayBuffer, parentHandle = 0) {
    if (!this.isConnected) {
      await this.connect();
    }

    if (!this.selectedStorageId) {
      await this.getStorageIds();
    }

    const storageId = this.selectedStorageId || 0x00010001;
    const fileSize = kmzArrayBuffer.byteLength;

    // 1. Build ObjectInfo Dataset (Minimal MTP dataset for SendObjectInfo)
    // Structure:
    // StorageID (4B), ObjectFormat (2B), ProtectionStatus (2B), ObjectCompressedSize (4B)
    // ThumbFormat (2B), ThumbCompSize (4B), ThumbPixWidth (4B), ThumbPixHeight (4B)
    // ImagePixWidth (4B), ImagePixHeight (4B), ImageBitDepth (4B), ParentObject (4B)
    // AssociationType (2B), AssociationDesc (4B), SequenceNumber (4B), Filename (PTP String)
    const fnBytes = this.encodePtpString(filename);
    const infoLen = 52 + fnBytes.byteLength;
    const infoBuf = new ArrayBuffer(infoLen);
    const infoView = new DataView(infoBuf);

    infoView.setUint32(0, storageId, true);
    infoView.setUint16(4, PTP_OFC_UNDEFINED, true); // KMZ / binary
    infoView.setUint16(6, 0, true); // ProtectionStatus
    infoView.setUint32(8, fileSize, true); // Compressed / Object Size
    infoView.setUint32(40, parentHandle || 0, true); // Parent Object
    new Uint8Array(infoBuf, 52).set(fnBytes);

    // 2. SendObjectInfo command
    const txId = this.nextTransactionId();
    const cmdBuf = this.buildContainer(PTP_CONTAINER_TYPE_COMMAND, PTP_OP_SEND_OBJECT_INFO, txId, new Uint8Array(0), [storageId, parentHandle || 0]);
    await this.device.transferOut(this.endpointOut, cmdBuf);

    // 3. Send ObjectInfo data phase
    const dataBuf = this.buildContainer(PTP_CONTAINER_TYPE_DATA, PTP_OP_SEND_OBJECT_INFO, txId, new Uint8Array(infoBuf));
    await this.device.transferOut(this.endpointOut, dataBuf);

    // 4. Read response
    const resp = await this.device.transferIn(this.endpointIn, 1024);
    const parsedResp = this.parseContainer(resp.data.buffer);

    // Get assigned Object Handle (Param 2)
    const newHandle = parsedResp.params.length > 1 ? parsedResp.params[1] : 0;

    // 5. SendObject command
    const sendTxId = this.nextTransactionId();
    const sendCmd = this.buildContainer(PTP_CONTAINER_TYPE_COMMAND, PTP_OP_SEND_OBJECT, sendTxId);
    await this.device.transferOut(this.endpointOut, sendCmd);

    // 6. Send Object Data
    const objectData = this.buildContainer(PTP_CONTAINER_TYPE_DATA, PTP_OP_SEND_OBJECT, sendTxId, new Uint8Array(kmzArrayBuffer));
    await this.device.transferOut(this.endpointOut, objectData);

    // 7. Read SendObject response
    const finalResp = await this.device.transferIn(this.endpointIn, 1024);
    const finalParsed = this.parseContainer(finalResp.data.buffer);

    return {
      success: true,
      handle: newHandle,
      filename: filename,
      size: fileSize,
      responseCode: finalParsed.code
    };
  }

  /**
   * Pull flight logs or files by handle from connected RC 2
   */
  async getObject(objectHandle) {
    if (!this.isConnected) {
      await this.connect();
    }

    const txId = this.nextTransactionId();
    const cmdBuf = this.buildContainer(PTP_CONTAINER_TYPE_COMMAND, PTP_OP_GET_OBJECT, txId, new Uint8Array(0), [objectHandle]);
    await this.device.transferOut(this.endpointOut, cmdBuf);

    // Read bulk data stream
    const chunks = [];
    let totalRead = 0;
    let expectedLength = 0;

    while (true) {
      const res = await this.device.transferIn(this.endpointIn, 64 * 1024);
      if (!res.data || res.data.byteLength === 0) break;

      if (expectedLength === 0 && res.data.byteLength >= 12) {
        const view = new DataView(res.data.buffer);
        expectedLength = view.getUint32(0, true) - 12;
        if (res.data.byteLength > 12) {
          chunks.push(new Uint8Array(res.data.buffer.slice(12)));
          totalRead += res.data.byteLength - 12;
        }
      } else {
        chunks.push(new Uint8Array(res.data.buffer));
        totalRead += res.data.byteLength;
      }

      if (expectedLength > 0 && totalRead >= expectedLength) {
        break;
      }
    }

    // Assemble final buffer
    const finalBuffer = new Uint8Array(totalRead);
    let offset = 0;
    for (const chunk of chunks) {
      finalBuffer.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return finalBuffer;
  }
}

const WebUsbMtp = new WebUsbMtpEngine();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    WebUsbMtpEngine,
    WebUsbMtp,
    PTP_OP_OPEN_SESSION,
    PTP_OP_SEND_OBJECT,
    PTP_OP_GET_OBJECT
  };
}
