/**
 * src/bridge/GoogleWorkspaceClient.js
 *
 * Client-Side Google Workspace (Google Drive & Google Sheets) Integration
 * for Aalaapi Sky.
 *
 * Provides:
 * 1. OAuth 2.0 Token Client with granular scopes:
 *    - https://www.googleapis.com/auth/drive.file (App-created files only)
 *    - https://www.googleapis.com/auth/spreadsheets (Append/read flight logbooks)
 * 2. Google Drive Mission Vault ("Aalaapi Sky Missions" folder):
 *    - 1-Click Upload of compiled .kmz packages and project state .json
 *    - Browse & Load mission packages on field tablets or desktop
 *    - Backup of raw DJI flight logs (FlightRecord_*.txt)
 * 3. Google Sheets Automated Flight Logbook:
 *    - Append signed Pre-Flight Checklists (Part 107 compliance)
 *    - Append Post-Flight Telemetry summaries (flight time, max alt, trajectory variance)
 */

class GoogleWorkspaceClientEngine {
  constructor() {
    this.clientId = null;
    this.accessToken = null;
    this.tokenExpiresAt = 0;
    this.appFolderId = null;
    this.spreadsheetId = null;
    this.tokenClient = null;
    this.scopes = [
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/spreadsheets'
    ].join(' ');

    this.initFromStorage();
  }

  initFromStorage() {
    if (typeof localStorage === 'undefined') return;
    try {
      this.clientId = localStorage.getItem('aalaapi_google_client_id') || null;
      this.spreadsheetId = localStorage.getItem('aalaapi_google_spreadsheet_id') || null;
      this.appFolderId = localStorage.getItem('aalaapi_google_app_folder_id') || null;
      const cachedToken = localStorage.getItem('aalaapi_google_access_token');
      const cachedExpiry = parseInt(localStorage.getItem('aalaapi_google_token_expiry'), 10) || 0;
      if (cachedToken && cachedExpiry > Date.now()) {
        this.accessToken = cachedToken;
        this.tokenExpiresAt = cachedExpiry;
      }
    } catch (_) {}
  }

  setClientId(clientId) {
    this.clientId = (clientId || '').trim();
    if (typeof localStorage !== 'undefined') {
      try {
        if (this.clientId) {
          localStorage.setItem('aalaapi_google_client_id', this.clientId);
        } else {
          localStorage.removeItem('aalaapi_google_client_id');
        }
      } catch (_) {}
    }
  }

  getClientId() {
    if (this.clientId) return this.clientId;
    if (typeof localStorage !== 'undefined') {
      try {
        this.clientId = localStorage.getItem('aalaapi_google_client_id') || null;
      } catch (_) {}
    }
    return this.clientId;
  }

  setSpreadsheetId(id) {
    this.spreadsheetId = (id || '').trim();
    if (typeof localStorage !== 'undefined') {
      try {
        if (this.spreadsheetId) {
          localStorage.setItem('aalaapi_google_spreadsheet_id', this.spreadsheetId);
        } else {
          localStorage.removeItem('aalaapi_google_spreadsheet_id');
        }
      } catch (_) {}
    }
  }

  getSpreadsheetId() {
    if (this.spreadsheetId) return this.spreadsheetId;
    if (typeof localStorage !== 'undefined') {
      try {
        this.spreadsheetId = localStorage.getItem('aalaapi_google_spreadsheet_id') || null;
      } catch (_) {}
    }
    return this.spreadsheetId;
  }

  isAuthorized() {
    return Boolean(this.accessToken && this.tokenExpiresAt > Date.now());
  }

  /**
   * Request an OAuth 2.0 Access Token via Google Identity Services (token client)
   * or direct popup fallback with PKCE / Implicit token response.
   */
  async requestToken(prompt = '') {
    const clientId = this.getClientId();
    if (!clientId) {
      throw new Error('Google OAuth 2.0 Client ID is not configured. Please add it in the Pilot Profile / Cloud Sync settings.');
    }

    if (this.isAuthorized() && !prompt) {
      return this.accessToken;
    }

    // 1. Google Identity Services (GIS) Token Client if script loaded
    if (typeof window !== 'undefined' && window.google && window.google.accounts && window.google.accounts.oauth2) {
      return new Promise((resolve, reject) => {
        try {
          this.tokenClient = window.google.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: this.scopes,
            prompt: prompt || (this.accessToken ? '' : 'select_account'),
            callback: (response) => {
              if (response.error) {
                return reject(new Error(response.error_description || response.error));
              }
              this.handleTokenSuccess(response.access_token, response.expires_in);
              resolve(this.accessToken);
            }
          });
          this.tokenClient.requestAccessToken();
        } catch (err) {
          reject(err);
        }
      });
    }

    // 2. Direct Popup OAuth Fallback
    return new Promise((resolve, reject) => {
      const redirectUri = typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : 'http://localhost:8765';
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&scope=${encodeURIComponent(this.scopes)}&include_granted_scopes=true&prompt=${encodeURIComponent(prompt || 'select_account')}`;

      const width = 500;
      const height = 650;
      const left = (window.screenX || 0) + ((window.outerWidth || 800) - width) / 2;
      const top = (window.screenY || 0) + ((window.outerHeight || 600) - height) / 2;
      const popup = window.open(authUrl, 'aalaapi_google_auth_token', `width=${width},height=${height},left=${left},top=${top}`);

      if (!popup) {
        return reject(new Error('Popup blocked by browser. Please allow popups for Aalaapi Sky.'));
      }

      let checkInterval = setInterval(() => {
        try {
          if (!popup || popup.closed) {
            clearInterval(checkInterval);
            if (!this.isAuthorized()) {
              reject(new Error('Google sign-in was closed before authorization completed.'));
            }
            return;
          }

          if (popup.location && popup.location.hash) {
            const hash = popup.location.hash.substring(1);
            const params = new URLSearchParams(hash);
            const token = params.get('access_token');
            const expiresIn = parseInt(params.get('expires_in'), 10) || 3600;
            if (token) {
              clearInterval(checkInterval);
              popup.close();
              this.handleTokenSuccess(token, expiresIn);
              resolve(this.accessToken);
            }
          }
        } catch (_) {
          // Cross-origin access error while on accounts.google.com is expected until redirect
        }
      }, 500);
    });
  }

  handleTokenSuccess(token, expiresIn = 3600) {
    this.accessToken = token;
    this.tokenExpiresAt = Date.now() + (expiresIn * 1000) - (60 * 1000); // 1 min buffer
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('aalaapi_google_access_token', token);
        localStorage.setItem('aalaapi_google_token_expiry', String(this.tokenExpiresAt));
      } catch (_) {}
    }
  }

  signOut() {
    this.accessToken = null;
    this.tokenExpiresAt = 0;
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem('aalaapi_google_access_token');
        localStorage.removeItem('aalaapi_google_token_expiry');
      } catch (_) {}
    }
  }

  // ─── Google Drive API (v3) ──────────────────────────────────────────────────

  /**
   * Find or create the dedicated "Aalaapi Sky Missions" folder in Google Drive.
   */
  async ensureAppFolder() {
    if (this.appFolderId) return this.appFolderId;
    await this.requestToken();

    const query = encodeURIComponent("name = 'Aalaapi Sky Missions' and mimeType = 'application/vnd.google-apps.folder' and trashed = false");
    const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`, {
      headers: { Authorization: `Bearer ${this.accessToken}` }
    });

    if (listRes.ok) {
      const data = await listRes.json();
      if (data.files && data.files.length > 0) {
        this.appFolderId = data.files[0].id;
        if (typeof localStorage !== 'undefined') {
          try { localStorage.setItem('aalaapi_google_app_folder_id', this.appFolderId); } catch (_) {}
        }
        return this.appFolderId;
      }
    }

    // Create new folder
    const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Aalaapi Sky Missions',
        mimeType: 'application/vnd.google-apps.folder',
        description: 'Automated repository for Aalaapi Sky drone waypoint flight plans, KMZs, and telemetry logs.'
      })
    });

    if (!createRes.ok) {
      const err = await createRes.json().catch(() => ({}));
      throw new Error(`Failed to create Google Drive folder: ${err.error?.message || createRes.statusText}`);
    }

    const folderData = await createRes.json();
    this.appFolderId = folderData.id;
    if (typeof localStorage !== 'undefined') {
      try { localStorage.setItem('aalaapi_google_app_folder_id', this.appFolderId); } catch (_) {}
    }
    return this.appFolderId;
  }

  /**
   * Upload a compiled KMZ mission package and optional JSON project state to Google Drive.
   */
  async uploadMissionToDrive({ filename, kmzBlob, missionJson, previewJpgBlob }) {
    await this.requestToken();
    const folderId = await this.ensureAppFolder();

    const cleanBase = (filename || 'mission').replace(/\.kmz$/i, '');
    const kmzFilename = `${cleanBase}.kmz`;

    // 1. Multipart Upload for KMZ package
    const boundary = `-------AalaapiSkyBoundary${Date.now()}`;
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const metadata = {
      name: kmzFilename,
      mimeType: 'application/vnd.google-earth.kmz',
      parents: [folderId],
      description: `Aalaapi Sky Drone Mission Package (${new Date().toISOString()})`
    };

    let kmzBuffer;
    if (kmzBlob instanceof ArrayBuffer) kmzBuffer = kmzBlob;
    else if (kmzBlob && typeof kmzBlob.arrayBuffer === 'function') kmzBuffer = await kmzBlob.arrayBuffer();
    else if (ArrayBuffer.isView(kmzBlob)) kmzBuffer = kmzBlob.buffer;
    else throw new Error('Invalid KMZ binary data provided for Google Drive upload.');

    const kmzUint8 = new Uint8Array(kmzBuffer);

    // Build multipart body
    const metaPart = `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`;
    const dataHeader = `${delimiter}Content-Type: application/vnd.google-earth.kmz\r\nContent-Transfer-Encoding: binary\r\n\r\n`;

    const metaPartBytes = new TextEncoder().encode(metaPart);
    const dataHeaderBytes = new TextEncoder().encode(dataHeader);
    const closeDelimBytes = new TextEncoder().encode(closeDelimiter);

    const totalLen = metaPartBytes.byteLength + dataHeaderBytes.byteLength + kmzUint8.byteLength + closeDelimBytes.byteLength;
    const bodyBuffer = new Uint8Array(totalLen);
    let offset = 0;

    bodyBuffer.set(metaPartBytes, offset); offset += metaPartBytes.byteLength;
    bodyBuffer.set(dataHeaderBytes, offset); offset += dataHeaderBytes.byteLength;
    bodyBuffer.set(kmzUint8, offset); offset += kmzUint8.byteLength;
    bodyBuffer.set(closeDelimBytes, offset);

    const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body: bodyBuffer
    });

    if (!uploadRes.ok) {
      const err = await uploadRes.json().catch(() => ({}));
      throw new Error(`Drive KMZ upload failed: ${err.error?.message || uploadRes.statusText}`);
    }

    const kmzFile = await uploadRes.json();

    // 2. Upload editable project JSON if supplied
    let jsonFile = null;
    if (missionJson) {
      const jsonContent = typeof missionJson === 'string' ? missionJson : JSON.stringify(missionJson, null, 2);
      const jsonMeta = {
        name: `${cleanBase}.json`,
        mimeType: 'application/json',
        parents: [folderId]
      };
      const jsonUploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`
        },
        body: this.buildMultipartJson(boundary, jsonMeta, jsonContent, 'application/json')
      });
      if (jsonUploadRes.ok) {
        jsonFile = await jsonUploadRes.json();
      }
    }

    return {
      success: true,
      kmzFileId: kmzFile.id,
      kmzFilename,
      jsonFileId: jsonFile ? jsonFile.id : null,
      folderId
    };
  }

  buildMultipartJson(boundary, metadata, textContent, mimeType) {
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;
    const metaPart = `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`;
    const dataPart = `${delimiter}Content-Type: ${mimeType}\r\n\r\n${textContent}${closeDelimiter}`;
    return new TextEncoder().encode(metaPart + dataPart);
  }

  /**
   * List all missions saved in the Aalaapi Sky Missions Drive folder.
   */
  async listMissionsFromDrive() {
    await this.requestToken();
    const folderId = await this.ensureAppFolder();

    const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&orderBy=modifiedTime desc&fields=files(id,name,mimeType,size,modifiedTime,description)`, {
      headers: { Authorization: `Bearer ${this.accessToken}` }
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Failed to list missions from Drive: ${err.error?.message || res.statusText}`);
    }

    const data = await res.json();
    return data.files || [];
  }

  /**
   * Download a mission file (.kmz or .json) from Drive as an ArrayBuffer.
   */
  async downloadMissionFromDrive(fileId) {
    await this.requestToken();
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, {
      headers: { Authorization: `Bearer ${this.accessToken}` }
    });

    if (!res.ok) {
      throw new Error(`Failed to download mission file from Drive: ${res.statusText}`);
    }

    return await res.arrayBuffer();
  }

  // ─── Google Sheets API (v4) ────────────────────────────────────────────────

  /**
   * Create or bind an automated flight logbook Google Sheet.
   */
  async createFlightLogbookSpreadsheet(title = 'Aalaapi Sky Flight Logbook') {
    await this.requestToken();

    const resource = {
      properties: { title },
      sheets: [
        {
          properties: { title: 'Flight Logbook', gridProperties: { frozenRowCount: 1 } },
          data: [{
            startRow: 0,
            startColumn: 0,
            rowData: [{
              values: [
                { userEnteredValue: { stringValue: 'Timestamp' } },
                { userEnteredValue: { stringValue: 'Pilot Name' } },
                { userEnteredValue: { stringValue: 'Part 107 Cert #' } },
                { userEnteredValue: { stringValue: 'Aircraft Model' } },
                { userEnteredValue: { stringValue: 'Mission Pattern' } },
                { userEnteredValue: { stringValue: 'Waypoints' } },
                { userEnteredValue: { stringValue: 'Flight Duration (s)' } },
                { userEnteredValue: { stringValue: 'Max Altitude (m)' } },
                { userEnteredValue: { stringValue: 'Distance (m)' } },
                { userEnteredValue: { stringValue: 'Status / Notes' } }
              ]
            }]
          }]
        },
        {
          properties: { title: 'Pre-Flight Checklists', gridProperties: { frozenRowCount: 1 } },
          data: [{
            startRow: 0,
            startColumn: 0,
            rowData: [{
              values: [
                { userEnteredValue: { stringValue: 'Timestamp' } },
                { userEnteredValue: { stringValue: 'Operator' } },
                { userEnteredValue: { stringValue: 'FAA Cert #' } },
                { userEnteredValue: { stringValue: 'LAANC Code' } },
                { userEnteredValue: { stringValue: 'Aircraft' } },
                { userEnteredValue: { stringValue: 'Coordinates' } },
                { userEnteredValue: { stringValue: 'Weather & Wind' } },
                { userEnteredValue: { stringValue: 'All Checks Passed' } },
                { userEnteredValue: { stringValue: 'Signature Status' } }
              ]
            }]
          }]
        }
      ]
    };

    const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(resource)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Failed to create Google Sheet: ${err.error?.message || res.statusText}`);
    }

    const data = await res.json();
    this.setSpreadsheetId(data.spreadsheetId);
    return data;
  }

  /**
   * Append a signed Pre-Flight Checklist row to the bound Google Sheet.
   */
  async appendPreflightChecklistRow(checklistData = {}) {
    await this.requestToken();
    const spreadsheetId = this.getSpreadsheetId();
    if (!spreadsheetId) {
      throw new Error('Google Spreadsheet ID not configured. Please create or link a logbook sheet first.');
    }

    const row = [
      checklistData.timestamp || new Date().toISOString(),
      checklistData.operatorName || 'Pilot',
      checklistData.faaCertNumber || 'N/A',
      checklistData.laancCode || 'N/A',
      checklistData.aircraftModel || 'DJI Drone',
      checklistData.coordinates || '0.0, 0.0',
      checklistData.weatherSummary || 'Clear',
      checklistData.allChecksPassed ? 'YES (PASSED)' : 'INCOMPLETE',
      checklistData.signatureData ? 'DIGITALLY SIGNED' : 'UNSIGNED'
    ];

    const range = encodeURIComponent('Pre-Flight Checklists!A1');
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ values: [row] })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Failed to append checklist row to Sheets: ${err.error?.message || res.statusText}`);
    }

    return await res.json();
  }

  /**
   * Append a completed flight telemetry summary row to the bound Google Sheet.
   */
  async appendFlightLogTelemetryRow(summary = {}) {
    await this.requestToken();
    const spreadsheetId = this.getSpreadsheetId();
    if (!spreadsheetId) {
      throw new Error('Google Spreadsheet ID not configured. Please create or link a logbook sheet first.');
    }

    const row = [
      summary.timestamp || new Date().toISOString(),
      summary.pilotName || 'Pilot',
      summary.faaCertNumber || 'N/A',
      summary.aircraftModel || 'DJI Drone',
      summary.missionPattern || 'Grid',
      summary.waypointCount || 0,
      summary.durationSeconds || 0,
      summary.maxAltitudeMeters || 0,
      summary.totalDistanceMeters || 0,
      summary.status || 'Completed'
    ];

    const range = encodeURIComponent('Flight Logbook!A1');
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ values: [row] })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Failed to append flight telemetry row to Sheets: ${err.error?.message || res.statusText}`);
    }

    return await res.json();
  }
}

const GoogleWorkspaceClient = new GoogleWorkspaceClientEngine();

if (typeof window !== 'undefined') {
  window.GoogleWorkspaceClient = GoogleWorkspaceClient;
}
if (typeof global !== 'undefined') {
  global.GoogleWorkspaceClient = GoogleWorkspaceClient;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GoogleWorkspaceClientEngine, GoogleWorkspaceClient };
}
