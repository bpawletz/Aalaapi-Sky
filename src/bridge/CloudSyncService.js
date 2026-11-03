/**
 * src/bridge/CloudSyncService.js
 *
 * Lightweight, Offline-First Cloud Synchronization Engine for Aalaapi Sky.
 * Backed by Google Cloud Firestore REST API with custom Database ID support
 * (enabling seamless integration with AI Studio projects).
 *
 * Features:
 * 1. AI Studio & Multi-App Sharing: Supports custom databaseId (defaulting to '(default)')
 *    and isolates all documents under 'aalaapi_' collections (e.g., aalaapi_pilots, aalaapi_missions).
 * 2. Field Independence: Operates directly in the browser via pure REST without requiring
 *    external npm dependencies or a running Companion Bridge.
 * 3. Offline Caching: Caches mutations and queries in localStorage / IndexedDB, auto-syncing
 *    whenever network connectivity is detected.
 */

// ─── Firestore REST Type Conversion Helpers ───────────────────────────────────

function encodeFirestoreValue(val) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    if (Number.isInteger(val)) return { integerValue: String(val) };
    return { doubleValue: val };
  }
  if (typeof val === 'string') return { stringValue: val };
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map(encodeFirestoreValue) } };
  }
  if (typeof val === 'object') {
    const fields = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) {
        fields[k] = encodeFirestoreValue(v);
      }
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

function decodeFirestoreValue(valObj) {
  if (!valObj || typeof valObj !== 'object') return null;
  if ('nullValue' in valObj) return null;
  if ('booleanValue' in valObj) return Boolean(valObj.booleanValue);
  if ('integerValue' in valObj) return parseInt(valObj.integerValue, 10);
  if ('doubleValue' in valObj) return parseFloat(valObj.doubleValue);
  if ('stringValue' in valObj) return String(valObj.stringValue);
  if ('timestampValue' in valObj) return String(valObj.timestampValue);
  if ('arrayValue' in valObj) {
    const arr = valObj.arrayValue.values || [];
    return arr.map(decodeFirestoreValue);
  }
  if ('mapValue' in valObj) {
    const fields = valObj.mapValue.fields || {};
    const res = {};
    for (const [k, v] of Object.entries(fields)) {
      res[k] = decodeFirestoreValue(v);
    }
    return res;
  }
  return null;
}

function encodeFirestoreDocument(plainObj) {
  const fields = {};
  for (const [k, v] of Object.entries(plainObj)) {
    if (v !== undefined) {
      fields[k] = encodeFirestoreValue(v);
    }
  }
  return { fields };
}

function decodeFirestoreDocument(doc) {
  if (!doc || !doc.fields) return null;
  const res = {};
  for (const [k, v] of Object.entries(doc.fields)) {
    res[k] = decodeFirestoreValue(v);
  }
  if (doc.createTime) res._createTime = doc.createTime;
  if (doc.updateTime) res._updateTime = doc.updateTime;
  if (doc.name) {
    const parts = doc.name.split('/');
    res._id = parts[parts.length - 1];
  }
  return res;
}

// ─── CloudSyncService Engine ──────────────────────────────────────────────────

class CloudSyncServiceEngine {
  constructor() {
    this.projectId = '';
    this.apiKey = '';
    this.databaseId = '(default)';
    this.appId = '';
    this.isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    this.syncQueue = [];
    this.listeners = [];

    this.init();
  }

  init() {
    this.loadConfig();
    this.loadSyncQueue();

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.isOnline = true;
        this.notifyStatusChange('online');
        this.flushSyncQueue();
      });
      window.addEventListener('offline', () => {
        this.isOnline = false;
        this.notifyStatusChange('offline');
      });
    }
  }

  loadConfig() {
    if (typeof localStorage === 'undefined') return;
    try {
      const saved = localStorage.getItem('aalaapi_firebase_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.projectId) this.projectId = parsed.projectId.trim();
        if (parsed.apiKey) this.apiKey = parsed.apiKey.trim();
        if (parsed.databaseId) this.databaseId = parsed.databaseId.trim() || '(default)';
        if (parsed.appId) this.appId = parsed.appId.trim();
      }
    } catch (_) {}
  }

  saveConfig({ projectId, apiKey, databaseId, appId } = {}) {
    if (projectId !== undefined) this.projectId = (projectId || '').trim();
    if (apiKey !== undefined) this.apiKey = (apiKey || '').trim();
    if (databaseId !== undefined) this.databaseId = (databaseId || '').trim() || '(default)';
    if (appId !== undefined) this.appId = (appId || '').trim();

    if (typeof localStorage !== 'undefined') {
      try {
        const cfg = {
          projectId: this.projectId,
          apiKey: this.apiKey,
          databaseId: this.databaseId,
          appId: this.appId
        };
        localStorage.setItem('aalaapi_firebase_config', JSON.stringify(cfg));
      } catch (_) {}
    }
    this.notifyStatusChange('config_updated');
  }

  getConfig() {
    return {
      projectId: this.projectId,
      apiKey: this.apiKey,
      databaseId: this.databaseId || '(default)',
      appId: this.appId,
      isConfigured: Boolean(this.projectId && this.apiKey)
    };
  }

  isConfigured() {
    return Boolean(this.projectId && this.apiKey);
  }

  getFirestoreBaseUrl() {
    const db = encodeURIComponent(this.databaseId || '(default)');
    return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(this.projectId)}/databases/${db}/documents`;
  }

  buildUrl(collectionName, docId = '') {
    const base = this.getFirestoreBaseUrl();
    const cleanDoc = docId ? `/${encodeURIComponent(docId)}` : '';
    const keyParam = this.apiKey ? `?key=${encodeURIComponent(this.apiKey)}` : '';
    return `${base}/${encodeURIComponent(collectionName)}${cleanDoc}${keyParam}`;
  }

  // ─── Status Listeners ───────────────────────────────────────────────────────

  addStatusListener(fn) {
    if (typeof fn === 'function' && !this.listeners.includes(fn)) {
      this.listeners.push(fn);
    }
  }

  removeStatusListener(fn) {
    this.listeners = this.listeners.filter(l => l !== fn);
  }

  notifyStatusChange(status) {
    this.listeners.forEach(fn => {
      try { fn(status, this.getConfig()); } catch (_) {}
    });
  }

  // ─── Offline Queue Management ───────────────────────────────────────────────

  loadSyncQueue() {
    if (typeof localStorage === 'undefined') return;
    try {
      const q = localStorage.getItem('aalaapi_cloud_sync_queue');
      if (q) this.syncQueue = JSON.parse(q) || [];
    } catch (_) {
      this.syncQueue = [];
    }
  }

  saveSyncQueue() {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem('aalaapi_cloud_sync_queue', JSON.stringify(this.syncQueue));
    } catch (_) {}
  }

  queueMutation(collection, docId, data, method = 'PATCH') {
    this.syncQueue.push({
      id: `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      collection,
      docId,
      data,
      method,
      queuedAt: new Date().toISOString()
    });
    this.saveSyncQueue();
  }

  async flushSyncQueue() {
    if (!this.isConfigured() || !this.isOnline || this.syncQueue.length === 0) return;

    const remaining = [];
    for (const item of this.syncQueue) {
      try {
        await this.writeDocument(item.collection, item.docId, item.data, false);
      } catch (err) {
        remaining.push(item);
      }
    }
    this.syncQueue = remaining;
    this.saveSyncQueue();
    if (this.syncQueue.length === 0) {
      this.notifyStatusChange('synced');
    }
  }

  // ─── Core CRUD Operations ───────────────────────────────────────────────────

  async writeDocument(collection, docId, data, allowQueue = true) {
    if (!this.isConfigured()) {
      throw new Error('Firebase Cloud configuration is missing (Project ID or API Key).');
    }

    // Always cache locally first (Offline-First)
    const localKey = `aalaapi_cloud_cache_${collection}_${docId}`;
    if (typeof localStorage !== 'undefined') {
      try { localStorage.setItem(localKey, JSON.stringify(data)); } catch (_) {}
    }

    if (!this.isOnline && allowQueue) {
      this.queueMutation(collection, docId, data);
      return { success: true, queued: true };
    }

    const url = this.buildUrl(collection, docId);
    const firestoreBody = encodeFirestoreDocument(data);

    try {
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(firestoreBody)
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`Firestore write error: ${err.error?.message || res.statusText}`);
      }

      const doc = await res.json();
      return { success: true, doc: decodeFirestoreDocument(doc) };
    } catch (err) {
      if (allowQueue) {
        this.queueMutation(collection, docId, data);
        return { success: true, queued: true, error: err.message };
      }
      throw err;
    }
  }

  async readDocument(collection, docId) {
    // Check local offline cache first
    const localKey = `aalaapi_cloud_cache_${collection}_${docId}`;
    let cached = null;
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(localKey);
        if (raw) cached = JSON.parse(raw);
      } catch (_) {}
    }

    if (!this.isConfigured() || !this.isOnline) {
      return cached;
    }

    try {
      const url = this.buildUrl(collection, docId);
      const res = await fetch(url);
      if (res.status === 404) return null;
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`Firestore read error: ${err.error?.message || res.statusText}`);
      }

      const doc = await res.json();
      const decoded = decodeFirestoreDocument(doc);
      if (typeof localStorage !== 'undefined') {
        try { localStorage.setItem(localKey, JSON.stringify(decoded)); } catch (_) {}
      }
      return decoded;
    } catch (err) {
      if (cached) return cached;
      throw err;
    }
  }

  async listDocuments(collection) {
    if (!this.isConfigured() || !this.isOnline) return [];

    const url = this.buildUrl(collection);
    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Firestore list error: ${err.error?.message || res.statusText}`);
    }

    const data = await res.json();
    const docs = data.documents || [];
    return docs.map(decodeFirestoreDocument).filter(Boolean);
  }

  // ─── High-Level Domain Synchronizers ────────────────────────────────────────

  async syncPilotProfile(profile) {
    if (!profile) return;
    const userId = profile.id || profile.username || 'active_pilot';
    return await this.writeDocument('aalaapi_pilots', userId, {
      ...profile,
      updatedAt: new Date().toISOString()
    });
  }

  async fetchPilotProfile(userId = 'active_pilot') {
    return await this.readDocument('aalaapi_pilots', userId);
  }

  async syncMission(missionUuid, missionData) {
    if (!missionUuid) return;
    return await this.writeDocument('aalaapi_missions', missionUuid, {
      ...missionData,
      uuid: missionUuid,
      updatedAt: new Date().toISOString()
    });
  }

  async listMissions() {
    return await this.listDocuments('aalaapi_missions');
  }

  async syncChecklistLog(logId, checklistLog) {
    if (!logId) return;
    return await this.writeDocument('aalaapi_checklists', logId, {
      ...checklistLog,
      logId,
      timestamp: checklistLog.timestamp || new Date().toISOString()
    });
  }

  async listChecklistLogs() {
    return await this.listDocuments('aalaapi_checklists');
  }

  /**
   * Test connection to Firebase project and database ID
   */
  async testConnection() {
    if (!this.projectId || !this.apiKey) {
      throw new Error('Project ID and Web API Key are required.');
    }
    const url = this.buildUrl('aalaapi_ping', '_test_conn');
    const res = await fetch(url);
    // 200 or 404 means the database endpoint is reachable and authenticates
    if (res.status === 200 || res.status === 404) {
      return { success: true, message: `Connected cleanly to Firestore database '${this.databaseId || '(default)'}' in project '${this.projectId}'` };
    }
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `HTTP ${res.status}: ${res.statusText}`);
  }
}

const CloudSyncService = new CloudSyncServiceEngine();

if (typeof window !== 'undefined') {
  window.CloudSyncService = CloudSyncService;
}
if (typeof global !== 'undefined') {
  global.CloudSyncService = CloudSyncService;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CloudSyncServiceEngine,
    CloudSyncService,
    encodeFirestoreValue,
    decodeFirestoreValue,
    encodeFirestoreDocument,
    decodeFirestoreDocument
  };
}
