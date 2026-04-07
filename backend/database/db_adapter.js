/**
 * ============================================================
 *  DATABASE ADAPTER — Abstract Data Access Layer
 * ============================================================
 *  Wraps chrome.storage.local behind a generic interface.
 *  To swap to MongoDB / MySQL / Supabase in the future,
 *  implement the same IDBAdapter interface and replace this file.
 *
 *  Note: API key is stored as plaintext in chrome.storage.local.
 *  This is standard practice for browser extensions — chrome.storage
 *  is sandboxed to the extension and inaccessible from web pages.
 *  AES encryption was removed because it caused persistent
 *  decryption failures across service worker restarts.
 * ============================================================
 */

const STORAGE_KEYS = Object.freeze({
  API_KEY:  'lazyfill_api_key',
  PROFILES: 'lazyfill_profiles',
  SETTINGS: 'lazyfill_settings',
  LOGS:     'lazyfill_error_logs',
});

/**
 * @typedef {Object} Profile
 * @property {string}   id          — UUID
 * @property {string}   name        — Profile display name (e.g. "Education")
 * @property {Object}   fields      — Key-value pairs { fieldLabel: value }
 * @property {number}   createdAt   — Unix timestamp
 * @property {number}   updatedAt   — Unix timestamp
 */

class DBAdapter {
  /* --------------------------------------------------
   *  API KEY — plaintext storage (sandboxed to extension)
   * -------------------------------------------------- */

  /**
   * Store the Google Gemini API key.
   * @param {string} key  — plaintext Gemini API key
   * @returns {Promise<void>}
   */
  async saveApiKey(key) {
    if (!key || typeof key !== 'string') {
      throw new Error('DB_ADAPTER: Invalid API key provided.');
    }
    await this._set({ [STORAGE_KEYS.API_KEY]: key.trim() });
  }

  /**
   * Retrieve the stored API key.
   * Returns the plaintext key, or null if not set.
   * @returns {Promise<string|null>}
   */
  async getApiKey() {
    const data = await this._get(STORAGE_KEYS.API_KEY);
    const key = data[STORAGE_KEYS.API_KEY];
    if (!key) return null;

    // Auto-migration: detect old AES-GCM encrypted blobs.
    // They look like two base64 chunks joined by ':'
    // e.g. "YWJjZGVm:eHl6YWJj..."  (16+ chars : 32+ chars)
    // A real Gemini API key starts with "AIza" and has no colon.
    if (typeof key === 'string') {
      const colonIdx = key.indexOf(':');
      if (colonIdx > 10 && !key.startsWith('AIza')) {
        // Looks like an old encrypted blob — wipe it silently
        console.warn('[LazyFill] Detected old encrypted API key blob — clearing automatically. Please re-enter your API key.');
        await this._remove(STORAGE_KEYS.API_KEY);
        return null;
      }
      return key.trim();
    }
    return null;
  }

  /**
   * Delete the API key from storage.
   * @returns {Promise<void>}
   */
  async deleteApiKey() {
    await this._remove(STORAGE_KEYS.API_KEY);
  }

  /* --------------------------------------------------
   *  PROFILES — CRUD operations
   * -------------------------------------------------- */

  /**
   * Retrieve all stored profiles.
   * @returns {Promise<Profile[]>}
   */
  async getAllProfiles() {
    const data = await this._get(STORAGE_KEYS.PROFILES);
    return data[STORAGE_KEYS.PROFILES] || [];
  }

  /**
   * Get a single profile by ID.
   * @param {string} profileId
   * @returns {Promise<Profile|null>}
   */
  async getProfileById(profileId) {
    const profiles = await this.getAllProfiles();
    return profiles.find((p) => p.id === profileId) || null;
  }

  /**
   * Save a new profile or overwrite an existing one.
   * @param {Profile} profile
   * @returns {Promise<Profile>}
   */
  async saveProfile(profile) {
    const profiles = await this.getAllProfiles();
    const now = Date.now();

    const idx = profiles.findIndex((p) => p.id === profile.id);
    if (idx >= 0) {
      profiles[idx] = { ...profiles[idx], ...profile, updatedAt: now };
    } else {
      profile.id = profile.id || crypto.randomUUID();
      profile.createdAt = now;
      profile.updatedAt = now;
      profiles.push(profile);
    }

    await this._set({ [STORAGE_KEYS.PROFILES]: profiles });
    return profile;
  }

  /**
   * Delete a profile by ID.
   * @param {string} profileId
   * @returns {Promise<boolean>}
   */
  async deleteProfile(profileId) {
    let profiles = await this.getAllProfiles();
    const len = profiles.length;
    profiles = profiles.filter((p) => p.id !== profileId);
    if (profiles.length === len) return false;
    await this._set({ [STORAGE_KEYS.PROFILES]: profiles });
    return true;
  }

  /* --------------------------------------------------
   *  SETTINGS — Generic key-value settings store
   * -------------------------------------------------- */

  async getSettings() {
    const data = await this._get(STORAGE_KEYS.SETTINGS);
    return data[STORAGE_KEYS.SETTINGS] || { activeProfileId: null, autoScan: false };
  }

  async saveSettings(settings) {
    const current = await this.getSettings();
    await this._set({ [STORAGE_KEYS.SETTINGS]: { ...current, ...settings } });
  }

  /* --------------------------------------------------
   *  ERROR LOGS
   * -------------------------------------------------- */

  async appendLog(entry) {
    const data = await this._get(STORAGE_KEYS.LOGS);
    const logs = data[STORAGE_KEYS.LOGS] || [];
    logs.push({ ...entry, timestamp: Date.now() });
    // Keep only last 100 entries
    if (logs.length > 100) logs.splice(0, logs.length - 100);
    await this._set({ [STORAGE_KEYS.LOGS]: logs });
  }

  async getLogs() {
    const data = await this._get(STORAGE_KEYS.LOGS);
    return data[STORAGE_KEYS.LOGS] || [];
  }

  async clearLogs() {
    await this._remove(STORAGE_KEYS.LOGS);
  }

  /* --------------------------------------------------
   *  PRIVATE: Low-level chrome.storage wrappers
   *  Replace these when migrating to another DB.
   * -------------------------------------------------- */

  /** @private */
  _get(keys) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(keys, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(result);
        }
      });
    });
  }

  /** @private */
  _set(items) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(items, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
  }

  /** @private */
  _remove(keys) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.remove(keys, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
  }
}

// Singleton export
const db = new DBAdapter();
export default db;
export { STORAGE_KEYS };
