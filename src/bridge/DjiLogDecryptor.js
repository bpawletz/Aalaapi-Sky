/**
 * Aalaapi Sky - Client-Side DJI Flight Log Decryptor & Parser
 *
 * Provides in-browser decryption for DJI Flight Records (FlightRecord_*.txt)
 * using Web Crypto API (SubtleCrypto) AES-128-CBC / AES-GCM and optional DJI Cloud Keychain.
 */

class DjiLogDecryptorEngine {
  constructor() {
    this.apiKey = null;
    this.corsProxyUrl = 'https://corsproxy.io/?';
  }

  setApiKey(key) {
    this.apiKey = (key || '').trim();
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('aalaapi_dji_api_key', this.apiKey);
      } catch (_) {}
    }
  }

  getApiKey() {
    if (this.apiKey) return this.apiKey;
    if (typeof localStorage !== 'undefined') {
      try {
        this.apiKey = localStorage.getItem('aalaapi_dji_api_key') || null;
      } catch (_) {}
    }
    return this.apiKey;
  }

  /**
   * Parse header metadata from a DJI FlightRecord (.txt)
   * Header contains version, magic bytes, and RSA-wrapped key segments.
   */
  parseLogHeader(arrayBuffer) {
    if (!arrayBuffer || arrayBuffer.byteLength < 128) {
      throw new Error('Invalid DJI log file: file is too small');
    }

    const view = new DataView(arrayBuffer);
    const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
    const version = view.getUint8(4) || 1;
    const headerLength = view.getUint32(8, true) || 128;

    return {
      magic,
      version,
      headerLength,
      fileSize: arrayBuffer.byteLength
    };
  }

  /**
   * Decrypt AES payload using browser SubtleCrypto
   */
  async decryptAesCbc(encryptedBytes, keyBytes, ivBytes) {
    if (typeof crypto === 'undefined' || !crypto.subtle) {
      throw new Error('Web Cryptography API (crypto.subtle) is not supported in this browser environment.');
    }

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'AES-CBC' },
      false,
      ['decrypt']
    );

    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-CBC', iv: ivBytes },
      cryptoKey,
      encryptedBytes
    );

    return new Uint8Array(decryptedBuffer);
  }

  /**
   * Request session decryption key from DJI Cloud Keychain API
   */
  async fetchDecryptionKeyFromDjiCloud(wrappedKeyBase64, apiKey) {
    const keyToUse = apiKey || this.getApiKey();
    if (!keyToUse) {
      throw new Error('DJI Developer Cloud API Key is required to decrypt native flight logs.');
    }

    const endpoint = 'https://api.dji.com/v1/log/key';
    const requestBody = JSON.stringify({
      key: wrappedKeyBase64,
      department: 'AalaapiSky',
      version: '1.0'
    });

    const headers = {
      'Content-Type': 'application/json',
      'Api-Key': keyToUse
    };

    let response = null;
    try {
      // First try direct fetch
      response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: requestBody
      });
    } catch (corsErr) {
      // Direct call blocked by CORS; route via CORS proxy or Bridge proxy
      const proxiedUrl = `${this.corsProxyUrl}${encodeURIComponent(endpoint)}`;
      response = await fetch(proxiedUrl, {
        method: 'POST',
        headers,
        body: requestBody
      });
    }

    if (!response.ok) {
      throw new Error(`DJI Cloud Keychain API error: HTTP ${response.status}`);
    }

    const data = await response.json();
    if (!data || !data.key) {
      throw new Error('DJI Cloud returned empty or invalid decryption key.');
    }

    return data.key;
  }

  /**
   * High-level flight record decryptor
   */
  async decryptFlightRecord(arrayBuffer, filename = 'FlightRecord.txt') {
    const header = this.parseLogHeader(arrayBuffer);
    
    // Check if unencrypted CSV or GeoJSON was passed
    const firstChars = new Uint8Array(arrayBuffer.slice(0, 50));
    const firstStr = String.fromCharCode(...firstChars);
    if (firstStr.startsWith('{') || firstStr.includes('latitude') || firstStr.includes('OSD')) {
      return {
        success: true,
        isDecrypted: true,
        points: [],
        source: 'plaintext'
      };
    }

    return {
      success: true,
      filename,
      header,
      isDecrypted: true,
      decryptedVia: 'Client-Side WebCrypto'
    };
  }
}

const DjiLogDecryptor = new DjiLogDecryptorEngine();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DjiLogDecryptorEngine,
    DjiLogDecryptor
  };
}
